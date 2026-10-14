//! Watcher tests, all offline: synthetic chains that can be reorganised in place, sources that can
//! be switched off, and a detector keyed by transaction id. Covers FR-12 to FR-14, FR-18, FR-19,
//! NFR-7 and T-7.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use sealed_core::audit::verify_chain;
use sealed_core::memo::MEMO_BYTES;
use sealed_core::wire::{ChainStateWire, DisplayStatusWire, Network, Tip};
use sealed_store::{DbKey, NewInbox, Store, TipFilter};
use zcash_client_backend::proto::compact_formats::{CompactBlock, CompactTx};

use crate::detect::{DetectError, Detector, Received, txid_hex};
use crate::health::health;
use crate::source::{BlockRef, ChainSource, SourceError};
use crate::watcher::{BATCH_BLOCKS, Step, Watcher, WatcherConfig};

const BASE: u32 = 4_500_000;
const NOW: &str = "2026-10-14T10:00:00Z";
const A: &str = "https://a.example:443";
const B: &str = "https://b.example:443";

// ---------- Synthetic chain ----------

#[derive(Clone)]
struct Block {
    hash: [u8; 32],
    txs: Vec<[u8; 32]>,
}

/// A chain shared between a test and the sources reading it. Heights start at `BASE`.
#[derive(Clone)]
struct Chain(Arc<Mutex<Vec<Block>>>);

fn hash(height: u32, fork: u8) -> [u8; 32] {
    let mut h = [0u8; 32];
    h[..4].copy_from_slice(&height.to_be_bytes());
    h[4] = fork;
    h
}

fn txid(n: u8) -> [u8; 32] {
    [n; 32]
}

impl Chain {
    fn new(len: u32) -> Self {
        Self(Arc::new(Mutex::new(
            (0..len)
                .map(|i| Block {
                    hash: hash(BASE + i, 0),
                    txs: vec![],
                })
                .collect(),
        )))
    }
    fn tip(&self) -> u32 {
        BASE + self.0.lock().unwrap().len() as u32 - 1
    }
    fn put_tx(&self, height: u32, id: [u8; 32]) {
        self.0.lock().unwrap()[(height - BASE) as usize]
            .txs
            .push(id);
    }
    /// Replaces every block from `height` up with a fork of `len` blocks.
    fn reorg_from(&self, height: u32, len: u32, fork: u8) {
        let mut blocks = self.0.lock().unwrap();
        blocks.truncate((height - BASE) as usize);
        for i in 0..len {
            blocks.push(Block {
                hash: hash(height + i, fork),
                txs: vec![],
            });
        }
    }
    fn extend(&self, n: u32) {
        let mut blocks = self.0.lock().unwrap();
        for _ in 0..n {
            let h = BASE + blocks.len() as u32;
            blocks.push(Block {
                hash: hash(h, 0),
                txs: vec![],
            });
        }
    }
    fn compact(&self, height: u32) -> Option<CompactBlock> {
        let blocks = self.0.lock().unwrap();
        let i = height.checked_sub(BASE)? as usize;
        let b = blocks.get(i)?;
        let prev = if i == 0 {
            hash(height - 1, 0)
        } else {
            blocks[i - 1].hash
        };
        Some(CompactBlock {
            height: height.into(),
            hash: b.hash.to_vec(),
            prev_hash: prev.to_vec(),
            time: 1_791_960_000 + (height - BASE) * 25,
            vtx: b
                .txs
                .iter()
                .map(|t| CompactTx {
                    txid: t.to_vec(),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        })
    }
}

struct FakeSource {
    origin: String,
    chain: Chain,
    down: Arc<AtomicBool>,
}

impl FakeSource {
    fn new(origin: &str, chain: &Chain) -> (Self, Arc<AtomicBool>) {
        let down = Arc::new(AtomicBool::new(false));
        (
            Self {
                origin: origin.into(),
                chain: chain.clone(),
                down: down.clone(),
            },
            down,
        )
    }
    fn up(&self) -> Result<(), SourceError> {
        if self.down.load(Ordering::SeqCst) {
            Err(SourceError::Unreachable)
        } else {
            Ok(())
        }
    }
}

impl ChainSource for FakeSource {
    fn origin(&self) -> &str {
        &self.origin
    }
    async fn tip(&mut self) -> Result<BlockRef, SourceError> {
        self.up()?;
        let h = self.chain.tip();
        Ok(BlockRef {
            height: h,
            hash: self.block_hash(h).await?,
        })
    }
    async fn block_hash(&mut self, height: u32) -> Result<[u8; 32], SourceError> {
        self.up()?;
        let b = self.chain.compact(height).ok_or(SourceError::NotFound)?;
        b.hash
            .as_slice()
            .try_into()
            .map_err(|_| SourceError::BadAnswer)
    }
    async fn blocks(&mut self, from: u32, to: u32) -> Result<Vec<CompactBlock>, SourceError> {
        self.up()?;
        Ok((from..=to).filter_map(|h| self.chain.compact(h)).collect())
    }
    async fn transaction(&mut self, txid: &[u8; 32]) -> Result<Vec<u8>, SourceError> {
        self.up()?;
        Ok(txid.to_vec())
    }
}

/// Pays the inbox in the transactions it knows. The "raw transaction" is the txid itself.
#[derive(Clone, Default)]
struct FakeDetector(HashMap<[u8; 32], Vec<Received>>);

impl FakeDetector {
    fn pays(
        mut self,
        id: [u8; 32],
        output_index: u32,
        amount_zat: u64,
        memo: [u8; MEMO_BYTES],
    ) -> Self {
        self.0.entry(id).or_default().push(Received {
            output_index,
            amount_zat,
            memo,
        });
        self
    }
}

impl Detector for FakeDetector {
    fn matches(&self, block: &CompactBlock) -> Result<Vec<[u8; 32]>, DetectError> {
        Ok(block
            .vtx
            .iter()
            .filter_map(|t| <[u8; 32]>::try_from(t.txid.as_slice()).ok())
            .filter(|t| self.0.contains_key(t))
            .collect())
    }
    fn received(&self, raw: &[u8], _height: u32) -> Result<Vec<Received>, DetectError> {
        let id: [u8; 32] = raw.try_into().map_err(|_| DetectError::Parse)?;
        Ok(self.0.get(&id).cloned().unwrap_or_default())
    }
}

// ---------- Helpers ----------

fn z1() -> [u8; MEMO_BYTES] {
    let mut m = [0u8; MEMO_BYTES];
    m[..3].copy_from_slice(b"z1:");
    m[3..511].fill(b'A');
    m
}

fn plain(text: &[u8]) -> [u8; MEMO_BYTES] {
    let mut m = [0u8; MEMO_BYTES];
    m[..text.len()].copy_from_slice(text);
    m
}

fn no_memo() -> [u8; MEMO_BYTES] {
    let mut m = [0u8; MEMO_BYTES];
    m[0] = 0xF6;
    m
}

fn new_inbox(store: &mut Store) {
    store
        .create_inbox(&NewInbox {
            id: "desk",
            name: "Sealed",
            network: Network::Test,
            address: "utest1example",
            desk_public_key: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
            fingerprint: "CB2F5160FC1F7E05",
            ufvk: "uviewtest1notused",
            tip_floor_zat: 100_000,
            birthday_height: BASE,
            created_at: NOW,
        })
        .unwrap();
}

fn memory_store() -> Store {
    let mut s = Store::open_in_memory(DbKey::new([3; 32])).unwrap();
    new_inbox(&mut s);
    s
}

fn config(single: bool) -> WatcherConfig {
    WatcherConfig {
        inbox_id: "desk".into(),
        allow_single_source: single,
    }
}

fn tips(store: &Store) -> Vec<Tip> {
    store
        .tips_page("desk", 0, TipFilter::All, 200)
        .unwrap()
        .tips
}

/// Steps until the watcher reports it is up to date, failing after `limit` steps.
async fn sync<S: ChainSource, D: Detector>(
    w: &mut Watcher<S, D>,
    store: &mut Store,
    limit: usize,
) -> Vec<Step> {
    let mut seen = Vec::new();
    for _ in 0..limit {
        let step = w.step(store, NOW).await.unwrap();
        let done = matches!(step, Step::UpToDate { .. });
        seen.push(step);
        if done {
            return seen;
        }
    }
    panic!("not up to date after {limit} steps: {seen:?}");
}

fn audit_is_valid(store: &Store) {
    let page = store.audit_page("desk", 0, 500).unwrap();
    let raw: Vec<_> = page
        .entries
        .iter()
        .map(|e| serde_json::to_value(e).unwrap())
        .collect();
    assert_eq!(verify_chain(&raw), Ok(()));
}

// ---------- Tests ----------

#[tokio::test]
async fn syncs_from_the_birthday_and_stores_each_tip_once() {
    let chain = Chain::new(10);
    chain.put_tx(BASE, txid(1)); // in the birthday block itself
    chain.put_tx(BASE + 4, txid(2));
    let (src, _) = FakeSource::new(A, &chain);
    let det = FakeDetector::default()
        .pays(txid(1), 0, 100_000, z1())
        .pays(txid(2), 1, 200_000, z1());
    let mut store = memory_store();
    let mut w = Watcher::new(vec![src], det, config(true));

    sync(&mut w, &mut store, 5).await;
    let all = tips(&store);
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].txid, txid_hex(&txid(1)));
    assert_eq!(all[0].height, Some(u64::from(BASE)));
    assert_eq!(all[1].output_index, 1);
    assert_eq!(
        all[1].block_time_at.as_deref(),
        Some("2026-10-14T06:41:40Z")
    );
    assert_eq!(
        store.inbox("desk").unwrap().unwrap().scanned_height,
        chain.tip()
    );

    // Running again stores nothing twice (FR-13).
    sync(&mut w, &mut store, 3).await;
    assert_eq!(tips(&store).len(), 2);
    audit_is_valid(&store);
}

#[tokio::test]
async fn a_tip_turns_confirmed_at_three_and_its_seq_moves() {
    let chain = Chain::new(5);
    chain.put_tx(BASE + 4, txid(1));
    let (src, _) = FakeSource::new(A, &chain);
    let mut store = memory_store();
    let mut w = Watcher::new(
        vec![src],
        FakeDetector::default().pays(txid(1), 0, 100_000, z1()),
        config(true),
    );
    sync(&mut w, &mut store, 3).await;
    let first = tips(&store)[0].clone();
    assert_eq!(first.confirmations, Some(1));
    assert_eq!(first.chain_state, ChainStateWire::Pending);

    chain.extend(2);
    sync(&mut w, &mut store, 3).await;
    let now = tips(&store)[0].clone();
    assert_eq!(now.confirmations, Some(3));
    assert_eq!(now.display_status, DisplayStatusWire::Confirmed);
    assert!(now.seq > first.seq);
}

#[tokio::test]
async fn a_one_block_reorg_orphans_the_tip_in_it() {
    let chain = Chain::new(6);
    chain.put_tx(BASE + 5, txid(1));
    let (src, _) = FakeSource::new(A, &chain);
    let mut store = memory_store();
    let mut w = Watcher::new(
        vec![src],
        FakeDetector::default().pays(txid(1), 0, 100_000, z1()),
        config(true),
    );
    sync(&mut w, &mut store, 3).await;
    let before = store.tips_page("desk", 0, TipFilter::All, 50).unwrap();

    chain.reorg_from(BASE + 5, 1, 7); // the tip's block is replaced, the payment is gone
    let steps = sync(&mut w, &mut store, 4).await;
    assert!(steps.contains(&Step::Reorg {
        fork_height: BASE + 4,
        orphaned: 1
    }));
    let changed = store
        .tips_page("desk", before.next_seq, TipFilter::All, 50)
        .unwrap();
    assert_eq!(
        changed.tips.len(),
        1,
        "the orphaned tip must reach polling through a new seq"
    );
    assert_eq!(changed.tips[0].display_status, DisplayStatusWire::Orphaned);
    assert_eq!(store.block_hash(BASE + 5).unwrap(), Some(hash(BASE + 5, 7)));
    audit_is_valid(&store);
}

#[tokio::test]
async fn a_three_block_reorg_orphans_lost_tips_and_revives_remined_ones() {
    let chain = Chain::new(10);
    chain.put_tx(BASE + 7, txid(1)); // mined again on the new chain
    chain.put_tx(BASE + 8, txid(2)); // lost with the old chain
    chain.put_tx(BASE + 4, txid(3)); // below the fork, untouched
    let (src, _) = FakeSource::new(A, &chain);
    let det = FakeDetector::default()
        .pays(txid(1), 0, 100_000, z1())
        .pays(txid(2), 0, 100_000, z1())
        .pays(txid(3), 0, 100_000, z1());
    let mut store = memory_store();
    let mut w = Watcher::new(vec![src], det, config(true));
    sync(&mut w, &mut store, 3).await;
    assert_eq!(tips(&store).len(), 3);

    chain.reorg_from(BASE + 7, 4, 9);
    chain.put_tx(BASE + 9, txid(1));
    let steps = sync(&mut w, &mut store, 5).await;
    assert!(steps.contains(&Step::Reorg {
        fork_height: BASE + 6,
        orphaned: 2
    }));

    let by_tx = |n: u8| {
        tips(&store)
            .into_iter()
            .find(|t| t.txid == txid_hex(&txid(n)))
            .unwrap()
    };
    assert_eq!(by_tx(1).display_status, DisplayStatusWire::Pending);
    assert_eq!(by_tx(1).height, Some(u64::from(BASE + 9)));
    assert_eq!(by_tx(2).display_status, DisplayStatusWire::Orphaned);
    assert_eq!(by_tx(3).height, Some(u64::from(BASE + 4)));
    assert_ne!(by_tx(3).display_status, DisplayStatusWire::Orphaned);
    assert_eq!(tips(&store).len(), 3, "orphaned tips are never deleted");
    audit_is_valid(&store);
}

#[tokio::test]
async fn a_restart_mid_sync_skips_no_block_and_duplicates_no_tip() {
    let dir = std::env::temp_dir().join(format!("sealed-chain-restart-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("sealed.db");
    let path = path.to_str().unwrap();

    let len = 2 * BATCH_BLOCKS + 50;
    let chain = Chain::new(len);
    for (n, at) in [(1u8, 50u32), (2, BATCH_BLOCKS + 20), (3, len - 3)] {
        chain.put_tx(BASE + at, txid(n));
    }
    let det = FakeDetector::default()
        .pays(txid(1), 0, 100_000, z1())
        .pays(txid(2), 0, 100_000, z1())
        .pays(txid(3), 0, 100_000, z1());

    {
        let mut store = Store::open(path, DbKey::new([3; 32])).unwrap();
        new_inbox(&mut store);
        let (src, _) = FakeSource::new(A, &chain);
        let mut w = Watcher::new(vec![src], det.clone(), config(true));
        let step = w.step(&mut store, NOW).await.unwrap();
        assert_eq!(
            step,
            Step::Synced {
                height: BASE + BATCH_BLOCKS - 1,
                new_tips: 1
            }
        );
    } // the process stops here

    let mut store = Store::open(path, DbKey::new([3; 32])).unwrap();
    let (src, _) = FakeSource::new(A, &chain);
    let mut w = Watcher::new(vec![src], det, config(true));
    sync(&mut w, &mut store, 6).await;

    assert_eq!(tips(&store).len(), 3);
    for h in BASE..=chain.tip() {
        assert!(
            store.block_hash(h).unwrap().is_some(),
            "block {h} was skipped"
        );
    }
    audit_is_valid(&store);
    drop(store);
    std::fs::remove_dir_all(&dir).unwrap();
}

#[tokio::test]
async fn one_source_down_is_recorded_once_and_testnet_keeps_going() {
    let chain = Chain::new(5);
    chain.put_tx(BASE + 2, txid(1));
    let (a, _) = FakeSource::new(A, &chain);
    let (b, b_down) = FakeSource::new(B, &chain);
    b_down.store(true, Ordering::SeqCst);
    let mut store = memory_store();
    let mut w = Watcher::new(
        vec![a, b],
        FakeDetector::default().pays(txid(1), 0, 100_000, z1()),
        config(true),
    );

    sync(&mut w, &mut store, 3).await;
    sync(&mut w, &mut store, 3).await;
    assert_eq!(tips(&store).len(), 1);
    let kinds: Vec<String> = store
        .audit_page("desk", 0, 100)
        .unwrap()
        .entries
        .into_iter()
        .map(|e| e.kind)
        .collect();
    assert_eq!(
        kinds.iter().filter(|k| *k == "source_down").count(),
        1,
        "no entry per retry"
    );

    let h = health(
        &store.sources().unwrap(),
        &[A.into(), B.into()],
        Network::Test,
        "0.1.0",
    );
    assert_eq!(
        h.sources.iter().filter(|s| s.ok).count(),
        1,
        "1 of 2 servers"
    );
    assert!(!h.sources[1].ok);
    assert_eq!(h.tip_height, u64::from(chain.tip()));

    b_down.store(false, Ordering::SeqCst);
    sync(&mut w, &mut store, 3).await;
    let kinds: Vec<String> = store
        .audit_page("desk", 0, 100)
        .unwrap()
        .entries
        .into_iter()
        .map(|e| e.kind)
        .collect();
    assert_eq!(kinds.iter().filter(|k| *k == "source_up").count(), 1);
    audit_is_valid(&store);
}

#[tokio::test]
async fn mainnet_needs_two_answering_sources() {
    let chain = Chain::new(5);
    let (a, _) = FakeSource::new(A, &chain);
    let (b, b_down) = FakeSource::new(B, &chain);
    b_down.store(true, Ordering::SeqCst);
    let mut store = memory_store();
    let mut w = Watcher::new(vec![a, b], FakeDetector::default(), config(false));
    assert_eq!(
        w.step(&mut store, NOW).await.unwrap(),
        Step::NotEnoughSources { answering: 1 }
    );
    assert_eq!(store.block_hash(BASE).unwrap(), None);
}

#[tokio::test]
async fn sources_that_disagree_stop_progress() {
    let honest = Chain::new(6);
    let other = Chain::new(6);
    other.reorg_from(BASE + 3, 3, 5); // same height, different blocks from BASE + 3
    honest.put_tx(BASE + 4, txid(1));
    let (a, _) = FakeSource::new(A, &honest);
    let (b, _) = FakeSource::new(B, &other);
    let mut store = memory_store();
    let mut w = Watcher::new(
        vec![a, b],
        FakeDetector::default().pays(txid(1), 0, 100_000, z1()),
        config(true),
    );

    assert_eq!(
        w.step(&mut store, NOW).await.unwrap(),
        Step::SourcesDisagree { height: BASE + 5 }
    );
    assert!(tips(&store).is_empty());
    assert_eq!(store.block_hash(BASE).unwrap(), None);
}

#[tokio::test]
async fn memos_are_stored_as_received_and_checked_but_never_opened() {
    let chain = Chain::new(5);
    chain.put_tx(BASE + 1, txid(1));
    chain.put_tx(BASE + 2, txid(2));
    chain.put_tx(BASE + 3, txid(3));
    let (src, _) = FakeSource::new(A, &chain);
    let det = FakeDetector::default()
        .pays(txid(1), 0, 100_000, z1())
        .pays(txid(2), 0, 100_000, plain(b"hello desk, plain text")) // not z1:
        .pays(txid(3), 0, 100_000, no_memo()); // ZIP 302 no memo
    let mut store = memory_store();
    let mut w = Watcher::new(vec![src], det, config(true));
    sync(&mut w, &mut store, 3).await;

    let by_tx = |n: u8| {
        tips(&store)
            .into_iter()
            .find(|t| t.txid == txid_hex(&txid(n)))
            .unwrap()
    };
    assert!(by_tx(1).format_ok);
    assert_eq!(
        by_tx(1).memo_b64.as_deref().map(str::len),
        Some(684),
        "all 512 bytes"
    );

    let plain_tip = by_tx(2);
    assert!(!plain_tip.format_ok);
    assert_eq!(plain_tip.display_status, DisplayStatusWire::Unreadable);
    assert!(
        plain_tip.memo_b64.is_some(),
        "kept as received, never rendered by the server"
    );

    let empty = by_tx(3);
    assert_eq!(empty.memo_b64, None);
    assert!(!empty.format_ok);
    assert_eq!(empty.display_status, DisplayStatusWire::Unreadable);
}

#[tokio::test]
async fn a_tip_below_the_floor_stays_pending_and_hidden_by_default() {
    let chain = Chain::new(4);
    chain.put_tx(BASE + 3, txid(1));
    let (src, _) = FakeSource::new(A, &chain);
    let mut store = memory_store();
    let mut w = Watcher::new(
        vec![src],
        FakeDetector::default().pays(txid(1), 0, 50_000, z1()),
        config(true),
    );
    sync(&mut w, &mut store, 3).await;

    let t = tips(&store)[0].clone();
    assert_eq!(t.chain_state, ChainStateWire::Pending);
    assert!(t.below_floor);
    assert_eq!(t.display_status, DisplayStatusWire::BelowFloor);
    let visible = store.tips_page("desk", 0, TipFilter::Visible, 50).unwrap();
    assert!(visible.tips.is_empty());
    assert_eq!(visible.counts.below_floor, 1);
}

#[test]
fn health_before_any_answer_still_has_every_source() {
    let h = health(&[], &[A.into(), B.into()], Network::Test, "0.1.0");
    assert_eq!(h.tip_height, 0);
    assert_eq!(h.lag_blocks, 0);
    assert_eq!(h.sources.len(), 2);
    assert!(
        h.sources
            .iter()
            .all(|s| !s.ok && s.tip_height.is_none() && s.last_checked_at.is_none())
    );
}
