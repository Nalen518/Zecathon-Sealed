use super::*;
use sealed_core::audit::verify_chain;
use sealed_core::wire::DisplayStatusWire;

const T0: &str = "2026-10-13T09:00:00Z";
const T1: &str = "2026-10-13T09:01:00Z";
const UFVK: &str = "uviewtest1notarealkeyjustfortests";
const TXID_A: &str = "aa00000000000000000000000000000000000000000000000000000000000001";
const TXID_B: &str = "bb00000000000000000000000000000000000000000000000000000000000002";

fn store() -> Store {
    let mut s = Store::open_in_memory(DbKey::new([9; 32])).unwrap();
    s.create_inbox(&NewInbox {
        id: "desk",
        name: "Sealed",
        network: Network::Test,
        address: "utest1example",
        desk_public_key: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        fingerprint: "CB2F5160FC1F7E05",
        ufvk: UFVK,
        tip_floor_zat: 100_000,
        birthday_height: 4_497_000,
        created_at: T0,
    })
    .unwrap();
    s
}

fn z1_memo() -> [u8; MEMO_BYTES] {
    let mut m = [0u8; MEMO_BYTES];
    m[..3].copy_from_slice(b"z1:");
    m[3..511].fill(b'A');
    m
}

fn no_memo() -> [u8; MEMO_BYTES] {
    let mut m = [0u8; MEMO_BYTES];
    m[0] = 0xF6;
    m
}

fn tip<'a>(
    txid: &'a str,
    height: u32,
    amount_zat: u64,
    confirmations: u32,
    memo: &'a [u8; MEMO_BYTES],
) -> NewTip<'a> {
    NewTip {
        txid,
        output_index: 0,
        height,
        block_time_at: T0,
        seen_at: T1,
        amount_zat,
        confirmations,
        memo,
    }
}

fn audit_values(s: &Store) -> Vec<serde_json::Value> {
    let page = s.audit_page("desk", 0, 500).unwrap();
    page.entries
        .iter()
        .map(|e| serde_json::to_value(e).unwrap())
        .collect()
}

#[test]
fn migrations_run_once_and_set_the_version() {
    let s = store();
    assert_eq!(s.schema_version().unwrap(), 1);
}

#[test]
fn inbox_is_created_once_with_an_audit_entry() {
    let mut s = store();
    let rec = s.inbox("desk").unwrap().unwrap();
    assert_eq!(rec.inbox.tip_floor_zat, 100_000);
    assert_eq!(rec.scanned_height, 4_497_000);
    let again = s.create_inbox(&NewInbox {
        id: "other",
        name: "x",
        network: Network::Test,
        address: "utest1x",
        desk_public_key: "k",
        fingerprint: "f",
        ufvk: UFVK,
        tip_floor_zat: 100_000,
        birthday_height: 1,
        created_at: T0,
    });
    assert!(matches!(again, Err(StoreError::InboxExists)));
    let page = s.audit_page("desk", 0, 10).unwrap();
    assert_eq!(page.entries[0].kind, "inbox_created");
}

#[test]
fn viewing_key_is_encrypted_in_the_row_and_opens_with_the_key() {
    let s = store();
    let raw: Vec<u8> = s
        .conn
        .query_row("SELECT ufvk_sealed FROM inbox", [], |r| r.get(0))
        .unwrap();
    assert!(!raw.windows(UFVK.len()).any(|w| w == UFVK.as_bytes()));
    assert_eq!(s.viewing_key("desk").unwrap().as_str(), UFVK);
}

#[test]
fn issuing_a_token_revokes_the_previous_one() {
    let mut s = store();
    s.issue_token("desk", &[1; 32], Actor::Setup, T0).unwrap();
    assert!(s.token_is_current("desk", &[1; 32]).unwrap());
    s.issue_token("desk", &[2; 32], Actor::Desk, T1).unwrap();
    assert!(!s.token_is_current("desk", &[1; 32]).unwrap());
    assert!(s.token_is_current("desk", &[2; 32]).unwrap());
    let audit = s.audit_page("desk", 0, 10).unwrap();
    assert_eq!(audit.entries[1].details["rotated"], false);
    assert_eq!(audit.entries[2].details["rotated"], true);
    assert_eq!(audit.entries[2].actor, "desk");
    assert_eq!(audit.entries[2].details["token_id"], "02020202");
}

#[test]
fn a_tip_is_stored_once_with_its_status() {
    let mut s = store();
    let memo = z1_memo();
    let id = s
        .insert_tip("desk", &tip(TXID_A, 4_497_100, 100_000, 1, &memo))
        .unwrap();
    assert!(id.is_some());
    assert_eq!(
        s.insert_tip("desk", &tip(TXID_A, 4_497_100, 100_000, 1, &memo))
            .unwrap(),
        None
    );
    let page = s.tips_page("desk", 0, TipFilter::All, 50).unwrap();
    assert_eq!(page.tips.len(), 1);
    let t = &page.tips[0];
    assert_eq!(t.display_status, DisplayStatusWire::Pending);
    assert!(t.format_ok);
    assert_eq!(t.memo_b64.as_deref().map(str::len), Some(684));
    assert_eq!(page.next_seq, t.seq);
}

#[test]
fn a_missing_memo_is_stored_as_null_and_unreadable() {
    let mut s = store();
    let memo = no_memo();
    s.insert_tip("desk", &tip(TXID_A, 4_497_100, 100_000, 1, &memo))
        .unwrap();
    let t = &s.tips_page("desk", 0, TipFilter::All, 50).unwrap().tips[0];
    assert_eq!(t.memo_b64, None);
    assert!(!t.format_ok);
    assert_eq!(t.display_status, DisplayStatusWire::Unreadable);
}

#[test]
fn confirmations_bump_seq_until_ten_then_stop() {
    let mut s = store();
    let memo = z1_memo();
    s.insert_tip("desk", &tip(TXID_A, 4_497_100, 100_000, 1, &memo))
        .unwrap();
    let seq0 = s.tips_page("desk", 0, TipFilter::All, 50).unwrap().tips[0].seq;

    assert_eq!(s.refresh_confirmations("desk", 4_497_102, T1).unwrap(), 1);
    let t = s.tips_page("desk", seq0, TipFilter::All, 50).unwrap().tips[0].clone();
    assert_eq!(t.confirmations, Some(3));
    assert_eq!(t.display_status, DisplayStatusWire::Confirmed);

    assert_eq!(s.refresh_confirmations("desk", 4_497_200, T1).unwrap(), 1);
    assert_eq!(s.refresh_confirmations("desk", 4_497_300, T1).unwrap(), 0);
    let last = s.tips_page("desk", 0, TipFilter::All, 50).unwrap();
    assert_eq!(last.tips[0].confirmations, Some(10));
    assert!(
        s.tips_page("desk", last.next_seq, TipFilter::All, 50)
            .unwrap()
            .tips
            .is_empty()
    );

    let kinds: Vec<String> = s
        .audit_page("desk", 0, 50)
        .unwrap()
        .entries
        .into_iter()
        .map(|e| e.kind)
        .collect();
    assert_eq!(kinds.iter().filter(|k| *k == "tip_confirmed").count(), 1);
}

#[test]
fn a_floor_change_flips_below_floor_and_bumps_only_those_tips() {
    let mut s = store();
    let memo = z1_memo();
    s.insert_tip("desk", &tip(TXID_A, 4_497_100, 50_000, 1, &memo))
        .unwrap();
    s.insert_tip("desk", &tip(TXID_B, 4_497_101, 200_000, 1, &memo))
        .unwrap();
    let before = s.tips_page("desk", 0, TipFilter::All, 50).unwrap();
    assert_eq!(
        before.counts,
        Counts {
            visible: 1,
            below_floor: 1
        }
    );
    assert_eq!(
        s.tips_page("desk", 0, TipFilter::Visible, 50)
            .unwrap()
            .tips
            .len(),
        1
    );
    assert_eq!(
        s.tips_page("desk", 0, TipFilter::BelowFloor, 50)
            .unwrap()
            .tips[0]
            .txid,
        TXID_A
    );

    let inbox = s.set_floor("desk", 40_000, T1).unwrap();
    assert_eq!(inbox.tip_floor_zat, 40_000);
    let changed = s
        .tips_page("desk", before.next_seq, TipFilter::All, 50)
        .unwrap();
    assert_eq!(changed.tips.len(), 1);
    assert_eq!(changed.tips[0].txid, TXID_A);
    assert!(!changed.tips[0].below_floor);
    assert_eq!(
        changed.counts,
        Counts {
            visible: 2,
            below_floor: 0
        }
    );
}

#[test]
fn a_reorg_orphans_tips_above_the_fork_and_never_deletes_them() {
    let mut s = store();
    let memo = z1_memo();
    s.insert_tip("desk", &tip(TXID_A, 4_497_100, 100_000, 1, &memo))
        .unwrap();
    s.insert_tip("desk", &tip(TXID_B, 4_497_105, 100_000, 1, &memo))
        .unwrap();
    s.put_scanned_block("desk", 4_497_105, &[5; 32]).unwrap();

    let orphaned = s.orphan_above("desk", 4_497_102, T1).unwrap();
    assert_eq!(orphaned.len(), 1);
    s.rewind_to("desk", 4_497_102).unwrap();
    assert_eq!(s.inbox("desk").unwrap().unwrap().scanned_height, 4_497_102);
    assert_eq!(s.block_hash(4_497_105).unwrap(), None);

    let page = s.tips_page("desk", 0, TipFilter::All, 50).unwrap();
    assert_eq!(page.tips.len(), 2);
    let b = page.tips.iter().find(|t| t.txid == TXID_B).unwrap();
    assert_eq!(b.display_status, DisplayStatusWire::Orphaned);
    // An orphaned tip no longer counts confirmations.
    assert_eq!(s.refresh_confirmations("desk", 4_497_110, T1).unwrap(), 1);
}

#[test]
fn every_change_lands_in_a_valid_hash_chain() {
    let mut s = store();
    let memo = z1_memo();
    s.issue_token("desk", &[1; 32], Actor::Setup, T0).unwrap();
    s.insert_tip("desk", &tip(TXID_A, 4_497_100, 100_000, 1, &memo))
        .unwrap();
    s.refresh_confirmations("desk", 4_497_103, T1).unwrap();
    s.set_floor("desk", 150_000, T1).unwrap();
    s.record_source("https://testnet.zec.rocks:443", false, None, T1)
        .unwrap();
    s.record_source("https://testnet.zec.rocks:443", false, None, T1)
        .unwrap();
    s.record_source("https://testnet.zec.rocks:443", true, Some(4_497_103), T1)
        .unwrap();
    s.orphan_above("desk", 4_497_000, T1).unwrap();

    let entries = audit_values(&s);
    let kinds: Vec<&str> = entries
        .iter()
        .map(|e| e["type"].as_str().unwrap())
        .collect();
    assert_eq!(
        kinds,
        [
            "inbox_created",
            "token_issued",
            "tip_received",
            "tip_confirmed",
            "floor_changed",
            "source_down",
            "source_up",
            "tip_orphaned"
        ]
    );
    assert_eq!(verify_chain(&entries), Ok(()));
}

#[test]
fn audit_entries_cannot_be_edited_or_deleted_while_the_inbox_exists() {
    let s = store();
    assert!(s.conn.execute("UPDATE audit_log SET at = 'x'", []).is_err());
    assert!(s.conn.execute("DELETE FROM audit_log", []).is_err());
}

#[test]
fn a_server_url_with_more_than_an_origin_is_refused() {
    let mut s = store();
    assert!(
        s.record_source("https://user:pw@testnet.zec.rocks:443", true, None, T1)
            .is_err()
    );
    assert!(s.sources().unwrap().is_empty());
}

#[test]
fn delete_removes_every_trace_of_the_inbox() {
    let mut s = store();
    let memo = z1_memo();
    s.issue_token("desk", &[1; 32], Actor::Setup, T0).unwrap();
    s.insert_tip("desk", &tip(TXID_A, 4_497_100, 100_000, 1, &memo))
        .unwrap();
    s.delete_inbox("desk").unwrap();
    for table in ["inbox", "tip", "desk_token", "audit_log"] {
        let n: i64 = s
            .conn
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0, "{table} still has rows");
    }
    assert!(matches!(s.delete_inbox("desk"), Err(StoreError::NotFound)));
    assert!(matches!(s.viewing_key("desk"), Err(StoreError::NotFound)));
}

#[test]
fn audit_paging_and_empty_pages() {
    let mut s = store();
    s.issue_token("desk", &[1; 32], Actor::Setup, T0).unwrap();
    s.issue_token("desk", &[2; 32], Actor::Desk, T1).unwrap();
    let first = s.audit_page("desk", 0, 2).unwrap();
    assert_eq!(
        (
            first.entries.len(),
            first.has_more,
            first.total,
            first.next_seq
        ),
        (2, true, 3, 2)
    );
    let rest = s.audit_page("desk", first.next_seq, 2).unwrap();
    assert_eq!(
        (rest.entries.len(), rest.has_more, rest.next_seq),
        (1, false, 3)
    );
    let empty = s.audit_page("desk", 3, 2).unwrap();
    assert_eq!((empty.entries.len(), empty.next_seq), (0, 3));
}

#[test]
fn a_file_database_reopens_without_rerunning_migrations() {
    let dir = std::env::temp_dir().join(format!("sealed-store-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("sealed.db");
    let path = path.to_str().unwrap();
    {
        let s = Store::open(path, DbKey::new([9; 32])).unwrap();
        assert_eq!(s.schema_version().unwrap(), 1);
    }
    let s = Store::open(path, DbKey::new([9; 32])).unwrap();
    assert_eq!(s.schema_version().unwrap(), 1);
    drop(s);
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_tip_mined_again_after_a_reorg_comes_back_from_orphaned() {
    let mut s = store();
    let memo = z1_memo();
    s.insert_tip("desk", &tip(TXID_A, 4_497_105, 100_000, 1, &memo))
        .unwrap();
    s.orphan_above("desk", 4_497_100, T1).unwrap();
    let orphaned = s.tips_page("desk", 0, TipFilter::All, 50).unwrap();
    assert_eq!(orphaned.tips[0].display_status, DisplayStatusWire::Orphaned);

    let back = s
        .insert_tip("desk", &tip(TXID_A, 4_497_107, 100_000, 1, &memo))
        .unwrap();
    assert!(back.is_some());
    let page = s
        .tips_page("desk", orphaned.next_seq, TipFilter::All, 50)
        .unwrap();
    assert_eq!(page.tips.len(), 1);
    assert_eq!(page.tips[0].height, Some(4_497_107));
    assert_eq!(page.tips[0].display_status, DisplayStatusWire::Pending);
    // Still one row, and a second insert of the live tip changes nothing.
    assert_eq!(
        s.insert_tip("desk", &tip(TXID_A, 4_497_107, 100_000, 1, &memo))
            .unwrap(),
        None
    );
    assert_eq!(
        s.tips_page("desk", 0, TipFilter::All, 50)
            .unwrap()
            .tips
            .len(),
        1
    );
    assert_eq!(verify_chain(&audit_values(&s)), Ok(()));
}

#[test]
fn oldest_block_tracks_the_kept_window() {
    let mut s = store();
    assert_eq!(s.oldest_block().unwrap(), None);
    s.put_scanned_block("desk", 4_497_001, &[1; 32]).unwrap();
    s.put_scanned_block("desk", 4_497_002, &[2; 32]).unwrap();
    assert_eq!(s.oldest_block().unwrap(), Some(4_497_001));
    s.put_scanned_block("desk", 4_497_001 + KEEP_BLOCKS + 5, &[3; 32])
        .unwrap();
    assert_eq!(s.oldest_block().unwrap(), Some(4_497_001 + KEEP_BLOCKS + 5));
}
