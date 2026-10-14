//! View-only trial decryption (B-05, B-08, BR-6). Compact blocks say which transactions pay the
//! inbox key. The full transaction then gives each incoming output's value and 512 memo bytes.
//! No wallet database, no spending key, and the server never decrypts a memo's content.

use std::collections::HashMap;
use std::convert::Infallible;

use sealed_core::chain::{Pool, output_index};
use sealed_core::memo::MEMO_BYTES;
use zcash_client_backend::TransferType;
use zcash_client_backend::decrypt_transaction;
use zcash_client_backend::proto::compact_formats::CompactBlock;
use zcash_client_backend::scanning::{ScanningKeys, SpendIdentifiers, scan_block};
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::{BlockHeight, BranchId, Network};

/// One output received by the inbox key.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Received {
    /// Position across all shielded outputs of the transaction (C-23, B-27).
    pub output_index: u32,
    pub amount_zat: u64,
    /// The 512 memo bytes exactly as received, zero padding included (B-29).
    pub memo: [u8; MEMO_BYTES],
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DetectError {
    #[error("viewing key is not a unified full viewing key for this network")]
    Key,
    #[error("compact block could not be scanned")]
    Scan,
    #[error("transaction could not be parsed")]
    Parse,
    #[error("output value or index out of range")]
    Range,
}

/// Finds the outputs an inbox key receives.
pub trait Detector: Send {
    /// Ids (compact block byte order) of the transactions in `block` that pay the key.
    fn matches(&self, block: &CompactBlock) -> Result<Vec<[u8; 32]>, DetectError>;
    /// Incoming outputs of a full transaction mined at `height`. Change and outgoing outputs are
    /// left out (BR-6).
    fn received(&self, raw_tx: &[u8], height: u32) -> Result<Vec<Received>, DetectError>;
}

/// The real detector, built from the inbox's decrypted viewing key.
pub struct ViewingKeyDetector {
    network: Network,
    ufvks: HashMap<u32, UnifiedFullViewingKey>,
}

impl ViewingKeyDetector {
    pub fn new(network: Network, ufvk: &str) -> Result<Self, DetectError> {
        let key = UnifiedFullViewingKey::decode(&network, ufvk).map_err(|_| DetectError::Key)?;
        Ok(Self {
            network,
            ufvks: HashMap::from([(0u32, key)]),
        })
    }
}

impl Detector for ViewingKeyDetector {
    fn matches(&self, block: &CompactBlock) -> Result<Vec<[u8; 32]>, DetectError> {
        // Built per call so the zip32 scope type never has to be named here.
        let keys =
            ScanningKeys::from_account_ufvks(self.ufvks.iter().map(|(id, k)| (*id, k.clone())));
        let scanned = scan_block::<_, _, _, Infallible>(
            &self.network,
            block.clone(),
            &keys,
            &SpendIdentifiers::empty(),
            None,
        )
        .map_err(|_| DetectError::Scan)?;
        Ok(scanned
            .transactions()
            .iter()
            .map(|t| *t.txid().as_ref())
            .collect())
    }

    fn received(&self, raw_tx: &[u8], height: u32) -> Result<Vec<Received>, DetectError> {
        let h = BlockHeight::from_u32(height);
        let tx = Transaction::read(raw_tx, BranchId::for_height(&self.network, h))
            .map_err(|_| DetectError::Parse)?;
        let sapling = tx
            .sapling_bundle()
            .map_or(0, |b| b.shielded_outputs().len());
        let orchard = tx.orchard_bundle().map_or(0, |b| b.actions().len());
        let d = decrypt_transaction(&self.network, Some(h), None, &tx, &self.ufvks);

        let index = |pool, i| {
            u32::try_from(output_index(pool, i, sapling, orchard)).map_err(|_| DetectError::Range)
        };
        let mut out = Vec::new();
        for o in d.sapling_outputs() {
            if o.transfer_type() == TransferType::Incoming {
                out.push(Received {
                    output_index: index(Pool::Sapling, o.index())?,
                    amount_zat: o.note_value().into_u64(),
                    memo: *o.memo().as_array(),
                });
            }
        }
        for (pool, outputs) in [
            (Pool::Orchard, d.orchard_outputs()),
            (Pool::Ironwood, d.ironwood_outputs()),
        ] {
            for o in outputs {
                if o.transfer_type() == TransferType::Incoming {
                    out.push(Received {
                        output_index: index(pool, o.index())?,
                        amount_zat: o.note().0.value().inner(),
                        memo: *o.memo().as_array(),
                    });
                }
            }
        }
        out.sort_by_key(|r| r.output_index);
        Ok(out)
    }
}

/// Transaction id as block explorers show it: the reversed bytes in lower-case hex (§4.1).
pub fn txid_hex(txid: &[u8; 32]) -> String {
    txid.iter().rev().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn txid_hex_is_explorer_order() {
        let mut id = [0u8; 32];
        id[0] = 0x0e;
        id[31] = 0xa7;
        let hex = txid_hex(&id);
        assert!(hex.starts_with("a7"));
        assert!(hex.ends_with("0e"));
        assert_eq!(hex.len(), 64);
    }

    #[test]
    fn a_spending_key_or_junk_is_not_a_viewing_key() {
        assert_eq!(
            ViewingKeyDetector::new(Network::TestNetwork, "secret-extended-key-test1qqq").err(),
            Some(DetectError::Key)
        );
        assert_eq!(
            ViewingKeyDetector::new(Network::TestNetwork, "").err(),
            Some(DetectError::Key)
        );
    }

    /// Live check against NU7 testnet with the spike 2 payment (B-29). Needs the desk test
    /// viewing key in SEALED_TEST_UFVK and network access, so it is ignored by default:
    /// `SEALED_TEST_UFVK=uviewtest1… cargo test -p sealed-chain -- --ignored`
    #[tokio::test]
    #[ignore]
    async fn live_spike2_tip_is_found_with_all_512_bytes() {
        use crate::source::{ChainSource, Lightwalletd};
        let Ok(ufvk) = std::env::var("SEALED_TEST_UFVK") else {
            panic!("set SEALED_TEST_UFVK");
        };
        let detector = ViewingKeyDetector::new(Network::TestNetwork, &ufvk).unwrap();
        let mut source = Lightwalletd::new("https://testnet.zec.rocks:443");
        let blocks = source.blocks(4_499_964, 4_499_964).await.unwrap();
        let matches = detector.matches(&blocks[0]).unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(
            txid_hex(&matches[0]),
            "a73d5e91b52c0371aa9166676b428a1a7780ceeeeccbb91d17cabe61250899b5"
        );
        let raw = source.transaction(&matches[0]).await.unwrap();
        let got = detector.received(&raw, 4_499_964).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].output_index, 1);
        assert_eq!(got[0].amount_zat, 100_000);
        assert!(got[0].memo.starts_with(b"z1:"));
        assert_eq!(got[0].memo[511], 0);
        assert!(sealed_core::memo::format_ok(&got[0].memo));
    }
}
