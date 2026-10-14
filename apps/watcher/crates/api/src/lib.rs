//! Sealed API: the Inbox API of contract §6 and the loop that drives the watcher (B-01: one
//! service). The API and the watcher each hold their own SQLite connection (B-32).

pub mod config;
pub mod edge;
pub mod error;
pub mod routes;

use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use sealed_chain::detect::{CompactBlock, DetectError, Detector, Received, ViewingKeyDetector};
use sealed_chain::source::Lightwalletd;
use sealed_chain::watcher::{Step, Watcher, WatcherConfig};
use sealed_core::chain::utc_text;
use sealed_core::wire::Network;
use sealed_store::{DbKey, Store};

use crate::config::Config;

/// Reported in `GET /v1/health` (§5.4).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct AppState {
    pub store: Mutex<Store>,
    pub config: Config,
    pub limiter: Mutex<edge::Limiter>,
    /// Current time as `YYYY-MM-DDTHH:MM:SSZ`. Replaced by a fixed clock in tests.
    pub clock: Box<dyn Fn() -> String + Send + Sync>,
}

impl AppState {
    pub fn new(store: Store, config: Config) -> Self {
        Self {
            store: Mutex::new(store),
            config,
            limiter: Mutex::new(edge::Limiter::default()),
            clock: Box::new(now_text),
        }
    }
}

pub fn now_text() -> String {
    utc_text(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_secs()),
    )
}

/// Every route of contract §6 under `/v1`, behind the edge middleware.
pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/v1/health", get(routes::get_health))
        .route("/v1/inbox", post(routes::create_inbox))
        .route(
            "/v1/inbox/{id}",
            get(routes::get_inbox)
                .patch(routes::patch_inbox)
                .delete(routes::delete_inbox),
        )
        .route("/v1/inbox/{id}/tokens", post(routes::issue_token))
        .route("/v1/inbox/{id}/tips", get(routes::list_tips))
        .route("/v1/inbox/{id}/tips/{tip_id}", get(routes::get_tip))
        .route("/v1/inbox/{id}/audit", get(routes::get_audit))
        .fallback(routes::not_found)
        .method_not_allowed_fallback(routes::not_found)
        .layer(DefaultBodyLimit::max(edge::MAX_BODY_BYTES))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            edge::edge,
        ))
        .with_state(state)
}

/// Used before any inbox exists: matches nothing, so a step only records source health.
struct NoKey;

impl Detector for NoKey {
    fn matches(&self, _: &CompactBlock) -> Result<Vec<[u8; 32]>, DetectError> {
        Ok(vec![])
    }
    fn received(&self, _: &[u8], _: u32) -> Result<Vec<Received>, DetectError> {
        Ok(vec![])
    }
}

enum Running {
    Idle(Watcher<Lightwalletd, NoKey>),
    Inbox {
        created_at: String,
        watcher: Watcher<Lightwalletd, ViewingKeyDetector>,
    },
}

/// The watcher loop: every `SEALED_POLL_SECONDS`, steps until it is up to date (rules §4.1). Runs
/// on its own connection. Rebuilds the detector when an inbox is created or deleted.
pub async fn run_watcher(config: Config) {
    let mut store = loop {
        match Store::open(&config.db_path, DbKey::new(config.db_key)) {
            Ok(s) => break s,
            Err(_) => {
                tracing::error!("watcher could not open the database");
                tokio::time::sleep(Duration::from_secs(config.poll_seconds)).await;
            }
        }
    };
    let sources = || {
        config
            .sources
            .iter()
            .map(|o| Lightwalletd::new(o))
            .collect::<Vec<_>>()
    };
    let settings = || WatcherConfig {
        inbox_id: config.inbox_id.clone(),
        allow_single_source: config.network == Network::Test,
    };
    let mut running = Running::Idle(Watcher::new(sources(), NoKey, settings()));
    loop {
        let inbox = store.inbox(&config.inbox_id).ok().flatten();
        let want = inbox.as_ref().map(|r| r.inbox.created_at.clone());
        let have = match &running {
            Running::Idle(_) => None,
            Running::Inbox { created_at, .. } => Some(created_at.clone()),
        };
        if want != have {
            running = match want {
                None => Running::Idle(Watcher::new(sources(), NoKey, settings())),
                Some(created_at) => match store
                    .viewing_key(&config.inbox_id)
                    .ok()
                    .and_then(|k| ViewingKeyDetector::new(config.zcash_network(), &k).ok())
                {
                    Some(detector) => Running::Inbox {
                        created_at,
                        watcher: Watcher::new(sources(), detector, settings()),
                    },
                    None => {
                        tracing::error!("stored viewing key cannot be opened with SEALED_DB_KEY");
                        Running::Idle(Watcher::new(sources(), NoKey, settings()))
                    }
                },
            };
        }
        // Up to 50 steps (5,000 blocks) per poll, then rest.
        for _ in 0..50 {
            let result = match &mut running {
                Running::Idle(w) => w.step(&mut store, &now_text()).await,
                Running::Inbox { watcher, .. } => watcher.step(&mut store, &now_text()).await,
            };
            match result {
                Ok(Step::Synced { .. }) | Ok(Step::Reorg { .. }) => continue,
                Ok(_) => break,
                Err(_) => {
                    tracing::warn!("watcher step failed");
                    break;
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(config.poll_seconds)).await;
    }
}

#[cfg(test)]
mod tests;
