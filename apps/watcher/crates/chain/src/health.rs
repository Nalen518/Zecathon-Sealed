//! `GET /v1/health` view (contract §5.4, C-14, C-18, FR-18). Always an answer, never a 503.

use sealed_core::wire::{Health, HealthSource, Network};
use sealed_store::SourceRow;

/// Builds the health body for the configured chain servers, in configuration order.
///
/// - `tip_height`: the highest tip any server reported (0 before the first answer).
/// - per server `lag_blocks`: how far its last answer is behind that tip.
/// - `lag_blocks`: the worst lag among servers that answer now, 0 when none answers.
pub fn health(rows: &[SourceRow], origins: &[String], network: Network, version: &str) -> Health {
    let row = |origin: &str| rows.iter().find(|r| r.origin == origin);
    let tip_height = origins
        .iter()
        .filter_map(|o| row(o).and_then(|r| r.tip_height))
        .max()
        .unwrap_or(0);
    let sources: Vec<HealthSource> = origins
        .iter()
        .map(|origin| match row(origin) {
            Some(r) => HealthSource {
                origin: origin.clone(),
                ok: r.ok,
                tip_height: r.tip_height.map(u64::from),
                lag_blocks: r
                    .tip_height
                    .map(|h| u64::from(tip_height.saturating_sub(h))),
                last_checked_at: r.last_checked_at.clone(),
            },
            None => HealthSource {
                origin: origin.clone(),
                ok: false,
                tip_height: None,
                lag_blocks: None,
                last_checked_at: None,
            },
        })
        .collect();
    let lag_blocks = sources
        .iter()
        .filter(|s| s.ok)
        .filter_map(|s| s.lag_blocks)
        .max()
        .unwrap_or(0);
    Health {
        network,
        tip_height: u64::from(tip_height),
        lag_blocks,
        sources,
        version: version.to_owned(),
    }
}
