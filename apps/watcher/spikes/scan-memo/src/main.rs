//! Spike 2 (PRD section 8, backend O-B1 and O-B4). Throwaway, never shipped.
//!
//!   scan-memo info <server>...                 GetLightdInfo and the latest block of each server
//!   scan-memo pools <server> <blocks>          Shielded outputs per pool in the latest blocks
//!   scan-memo scan <server> <ufvk> <from> [to] View-only scan: every memo received by the key
//!
//! A server is a full origin, for example https://testnet.zec.rocks:443. Testnet only.
//! The viewing key is read from the command line and only printed as its prefix.

use std::collections::HashMap;
use std::error::Error;

use tonic::transport::{Channel, ClientTlsConfig};
use zcash_client_backend::proto::compact_formats::CompactBlock;
use zcash_client_backend::proto::service::{
    BlockId, BlockRange, ChainSpec, Empty, PoolType, TxFilter,
    compact_tx_streamer_client::CompactTxStreamerClient,
};
use zcash_client_backend::scanning::{ScanningKeys, SpendIdentifiers, scan_block};
use zcash_client_backend::decrypt_transaction;
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::{BlockHeight, BranchId, Network, NetworkUpgrade, Parameters};

type Res<T> = Result<T, Box<dyn Error>>;
const NET: Network = Network::TestNetwork;

async fn connect(origin: &str) -> Res<CompactTxStreamerClient<Channel>> {
    let channel = Channel::from_shared(origin.to_string())?
        .tls_config(ClientTlsConfig::new().with_webpki_roots())?
        .connect()
        .await?;
    Ok(CompactTxStreamerClient::new(channel))
}

fn hex_rev(bytes: &[u8]) -> String {
    bytes.iter().rev().map(|b| format!("{b:02x}")).collect()
}

async fn blocks(
    client: &mut CompactTxStreamerClient<Channel>,
    from: u64,
    to: u64,
) -> Res<Vec<CompactBlock>> {
    let range = BlockRange {
        start: Some(BlockId { height: from, hash: vec![] }),
        end: Some(BlockId { height: to, hash: vec![] }),
        // Ask for every shielded pool explicitly: older servers default to Sapling and Orchard only.
        pool_types: vec![PoolType::Sapling as i32, PoolType::Orchard as i32, PoolType::Ironwood as i32],
    };
    let mut stream = client.get_block_range(range).await?.into_inner();
    let mut out = Vec::new();
    while let Some(block) = stream.message().await? {
        out.push(block);
    }
    Ok(out)
}

async fn info(servers: &[String]) -> Res<()> {
    for origin in servers {
        println!("== {origin}");
        let mut c = match connect(origin).await {
            Ok(c) => c,
            Err(e) => {
                println!("   connect failed: {e}");
                continue;
            }
        };
        let i = c.get_lightd_info(Empty {}).await?.into_inner();
        println!(
            "   vendor={} version={} chain={} height={} branch={} upgrade={}@{} protocol={}",
            i.vendor, i.version, i.chain_name, i.block_height, i.consensus_branch_id,
            i.upgrade_name, i.upgrade_height, i.lightwallet_protocol_version
        );
        let tip = c.get_latest_block(ChainSpec {}).await?.into_inner();
        println!("   latest {} {}", tip.height, hex_rev(&tip.hash));
        // Compare one block hash across servers (FR-12): fetch a block a little below the tip.
        let probe = tip.height.saturating_sub(5);
        let b = c.get_block(BlockId { height: probe, hash: vec![] }).await?.into_inner();
        println!("   block {} {}", b.height, hex_rev(&b.hash));
        let id = NET.activation_height(NetworkUpgrade::Nu6_3);
        println!("   crate: NU6.3 testnet activation {:?}, branch at tip {:?}", id, BranchId::for_height(&NET, BlockHeight::from_u32(tip.height as u32)));
    }
    Ok(())
}

async fn pools(origin: &str, count: u64) -> Res<()> {
    let mut c = connect(origin).await?;
    let tip = c.get_latest_block(ChainSpec {}).await?.into_inner().height;
    let list = blocks(&mut c, tip.saturating_sub(count - 1), tip).await?;
    let (mut s, mut o, mut i, mut txs) = (0, 0, 0, 0);
    for b in &list {
        for tx in &b.vtx {
            txs += 1;
            s += tx.outputs.len();
            o += tx.actions.len();
            i += tx.ironwood_actions.len();
        }
    }
    println!(
        "{} blocks {}..={}: {txs} txs with shielded data, sapling outputs {s}, orchard actions {o}, ironwood actions {i}",
        list.len(), tip.saturating_sub(count - 1), tip
    );
    Ok(())
}

async fn scan(origin: &str, ufvk: &str, from: u64, to: Option<u64>) -> Res<()> {
    let key = UnifiedFullViewingKey::decode(&NET, ufvk)?;
    println!(
        "key {}… sapling={} orchard={}",
        &ufvk[..ufvk.len().min(12)],
        key.sapling().is_some(),
        key.orchard().is_some()
    );
    let mut c = connect(origin).await?;
    let tip = c.get_latest_block(ChainSpec {}).await?.into_inner().height;
    let to = to.unwrap_or(tip);
    let keys = ScanningKeys::from_account_ufvks([(0u32, key.clone())]);
    let ufvks: HashMap<u32, UnifiedFullViewingKey> = HashMap::from([(0u32, key)]);
    let nullifiers = SpendIdentifiers::empty();

    let mut start = from;
    let mut prior = None;
    let mut hits = 0;
    while start <= to {
        let end = (start + 999).min(to);
        for block in blocks(&mut c, start, end).await? {
            let scanned = scan_block::<_, _, _, std::convert::Infallible>(&NET, block, &keys, &nullifiers, prior.as_ref())?;
            let height = scanned.height();
            for wtx in scanned.transactions() {
                hits += 1;
                read_memos(&mut c, &ufvks, height, wtx.txid().as_ref()).await?;
            }
            prior = Some(scanned.to_block_metadata());
        }
        println!("scanned {start}..={end}");
        start = end + 1;
    }
    println!("done: {hits} transactions matched the key");
    Ok(())
}

async fn read_memos(
    c: &mut CompactTxStreamerClient<Channel>,
    ufvks: &HashMap<u32, UnifiedFullViewingKey>,
    height: BlockHeight,
    txid: &[u8; 32],
) -> Res<()> {
    let raw = c
        .get_transaction(TxFilter { block: None, index: 0, hash: txid.to_vec() })
        .await?
        .into_inner();
    let tx = Transaction::read(&raw.data[..], BranchId::for_height(&NET, height))?;
    let d = decrypt_transaction(&NET, Some(height), None, &tx, ufvks);
    println!("tx {} at {}", hex_rev(txid), u32::from(height));
    let pools = [
        ("sapling", d.sapling_outputs().iter().map(|o| (o.index(), o.note_value().into_u64(), o.memo().as_slice().to_vec(), o.transfer_type())).collect::<Vec<_>>()),
        ("orchard", d.orchard_outputs().iter().map(|o| (o.index(), o.note().0.value().inner(), o.memo().as_slice().to_vec(), o.transfer_type())).collect()),
        ("ironwood", d.ironwood_outputs().iter().map(|o| (o.index(), o.note().0.value().inner(), o.memo().as_slice().to_vec(), o.transfer_type())).collect()),
    ];
    for (pool, outs) in pools {
        for (index, value, memo, kind) in outs {
            let z1 = memo.starts_with(b"z1:");
            let tail_zero = memo.get(511) == Some(&0);
            println!(
                "   {pool} output {index}: {value} zat, {kind:?}, memo {} bytes, first byte 0x{:02x}, z1 prefix {z1}, byte 512 zero {tail_zero}",
                memo.len(),
                memo.first().copied().unwrap_or(0)
            );
        }
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Res<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("info") => info(&args[1..]).await,
        Some("pools") => pools(&args[1], args[2].parse()?).await,
        Some("scan") => scan(&args[1], &args[2], args[3].parse()?, args.get(4).map(|s| s.parse()).transpose()?).await,
        _ => {
            eprintln!("usage: scan-memo info <server>... | pools <server> <blocks> | scan <server> <ufvk> <from> [to]");
            Ok(())
        }
    }
}
