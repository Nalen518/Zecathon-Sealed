//! The watcher loop (rules §4, FR-12 to FR-14, NFR-7). One `step` per poll:
//!
//! 1. Ask every source for its tip and record each one's health (audit only on a change, §4.8).
//! 2. Pick the trusted height: the lowest tip among answering sources, kept only when every
//!    answering source has the same block hash there (§4.2). One source is allowed on testnet
//!    only (B-18).
//! 3. If the block at the scanned height changed, find the fork, orphan the tips above it and
//!    rewind (FR-14, B-08).
//! 4. Scan the next batch of compact blocks, fetch each matching transaction, store each incoming
//!    output once (FR-13), and save every block hash.
//! 5. Refresh confirmations against the trusted height (C-17).

use sealed_core::chain::utc_text;
use sealed_core::status;
use sealed_store::{NewTip, Store, StoreError};

use crate::detect::{DetectError, Detector, txid_hex};
use crate::source::{BlockRef, ChainSource, SourceError};

/// Blocks scanned per step at most, so one poll stays short.
pub const BATCH_BLOCKS: u32 = 100;

pub struct WatcherConfig {
    pub inbox_id: String,
    /// One answering source is enough on testnet only (B-18). Two are required on mainnet.
    pub allow_single_source: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    /// Scanned up to `height`, storing `new_tips` new or revived tips.
    Synced { height: u32, new_tips: usize },
    /// Already at the trusted height.
    UpToDate { height: u32 },
    /// Rolled back to `fork_height` and orphaned `orphaned` tips. The next step rescans.
    Reorg { fork_height: u32, orphaned: usize },
    /// The answering sources gave different hashes at the trusted height. Nothing advanced.
    SourcesDisagree { height: u32 },
    /// Not enough sources answered to trust a tip.
    NotEnoughSources { answering: usize },
    /// No inbox is registered yet.
    NoInbox,
}

#[derive(Debug, thiserror::Error)]
pub enum WatchError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Source(#[from] SourceError),
    #[error(transparent)]
    Detect(#[from] DetectError),
}

pub struct Watcher<S, D> {
    sources: Vec<S>,
    detector: D,
    config: WatcherConfig,
}

impl<S: ChainSource, D: Detector> Watcher<S, D> {
    pub fn new(sources: Vec<S>, detector: D, config: WatcherConfig) -> Self {
        Self {
            sources,
            detector,
            config,
        }
    }

    /// One poll. `now` is the current time as `YYYY-MM-DDTHH:MM:SSZ`.
    pub async fn step(&mut self, store: &mut Store, now: &str) -> Result<Step, WatchError> {
        // 1. Tips and health.
        let mut answering: Vec<(usize, BlockRef)> = Vec::new();
        for (i, source) in self.sources.iter_mut().enumerate() {
            match source.tip().await {
                Ok(tip) => {
                    store.record_source(source.origin(), true, Some(tip.height), now)?;
                    answering.push((i, tip));
                }
                Err(_) => {
                    store.record_source(source.origin(), false, None, now)?;
                    tracing::warn!(source = %source.origin(), "chain server not answering");
                }
            }
        }
        let needed = if self.config.allow_single_source {
            1
        } else {
            2
        };
        if answering.len() < needed {
            return Ok(Step::NotEnoughSources {
                answering: answering.len(),
            });
        }

        // 2. Trusted height: the lowest tip, with the same hash on every answering source.
        let Some(&(primary, lowest)) = answering.iter().min_by_key(|(_, t)| t.height) else {
            return Ok(Step::NotEnoughSources { answering: 0 });
        };
        let target = lowest.height;
        for &(i, tip) in &answering {
            let hash = if tip.height == target {
                tip.hash
            } else {
                self.sources[i].block_hash(target).await?
            };
            if hash != lowest.hash {
                tracing::warn!(height = target, "chain servers disagree");
                return Ok(Step::SourcesDisagree { height: target });
            }
        }

        let Some(record) = store.inbox(&self.config.inbox_id)? else {
            return Ok(Step::NoInbox);
        };
        let id = self.config.inbox_id.clone();
        let scanned = record.scanned_height;

        // 3. Reorg check at the scanned height (or the trusted height, if the chain got shorter).
        let check = scanned.min(target);
        if let Some(stored) = store.block_hash(check)?
            && self.sources[primary].block_hash(check).await? != stored
        {
            return self.roll_back(store, primary, check, now).await;
        }
        if scanned >= target && store.block_hash(scanned)?.is_some() {
            store.refresh_confirmations(&id, target, now)?;
            return Ok(Step::UpToDate { height: target });
        }

        // 4. Scan. A fresh inbox scans its birthday block itself.
        let from = if store.block_hash(scanned)?.is_some() {
            scanned + 1
        } else {
            scanned
        };
        let to = target.min(from.saturating_add(BATCH_BLOCKS - 1));
        let blocks = self.sources[primary].blocks(from, to).await?;
        let mut new_tips = 0;
        let mut expected = from;
        for block in blocks {
            let height = u32::try_from(block.height).map_err(|_| SourceError::BadAnswer)?;
            let hash: [u8; 32] = block
                .hash
                .as_slice()
                .try_into()
                .map_err(|_| SourceError::BadAnswer)?;
            if height != expected {
                return Err(SourceError::BadAnswer.into());
            }
            // A block that does not build on the stored parent means the chain moved under us.
            if let Some(parent) = store.block_hash(height.saturating_sub(1))?
                && height > 0
                && block.prev_hash.as_slice() != parent.as_slice()
            {
                return self.roll_back(store, primary, height - 1, now).await;
            }
            let block_time_at = utc_text(block.time.into());
            for txid in self.detector.matches(&block)? {
                let raw = self.sources[primary].transaction(&txid).await?;
                let txid_hex = txid_hex(&txid);
                for r in self.detector.received(&raw, height)? {
                    let tip = NewTip {
                        txid: &txid_hex,
                        output_index: r.output_index,
                        height,
                        block_time_at: &block_time_at,
                        seen_at: now,
                        amount_zat: r.amount_zat,
                        confirmations: status::confirmations(height, target),
                        memo: &r.memo,
                    };
                    if store.insert_tip(&id, &tip)?.is_some() {
                        new_tips += 1;
                    }
                }
            }
            store.put_scanned_block(&id, height, &hash)?;
            expected += 1;
        }

        // 5. Confirmations.
        store.refresh_confirmations(&id, target, now)?;
        tracing::info!(
            height = expected.saturating_sub(1),
            count = new_tips,
            "scanned"
        );
        Ok(Step::Synced {
            height: expected.saturating_sub(1),
            new_tips,
        })
    }

    /// Walks back from `from_height` to the highest stored block the source still has, orphans
    /// every tip above it and rewinds the scan there. Past the kept window, it falls back to the
    /// oldest kept block, which keeps every tip above it orphaned until rescanned.
    async fn roll_back(
        &mut self,
        store: &mut Store,
        primary: usize,
        from_height: u32,
        now: &str,
    ) -> Result<Step, WatchError> {
        let floor = store.oldest_block()?.unwrap_or(from_height);
        let mut height = from_height;
        let fork = loop {
            if height <= floor {
                break floor.saturating_sub(1);
            }
            match store.block_hash(height)? {
                Some(stored) if self.sources[primary].block_hash(height).await? == stored => {
                    break height;
                }
                _ => height -= 1,
            }
        };
        let id = self.config.inbox_id.clone();
        let orphaned = store.orphan_above(&id, fork, now)?.len();
        store.rewind_to(&id, fork)?;
        tracing::warn!(height = fork, count = orphaned, "reorg");
        Ok(Step::Reorg {
            fork_height: fork,
            orphaned,
        })
    }
}
