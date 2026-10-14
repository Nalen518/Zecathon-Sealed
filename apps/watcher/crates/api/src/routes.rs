//! Every route of contract §6, exactly as written. Nothing more, nothing less (rules §2.1).

use std::sync::Arc;

use axum::Json;
use axum::body::Body;
use axum::extract::{Path, RawQuery, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use blake2::{Blake2b, Digest, digest::consts::U32};
use sealed_chain::health::health;
use sealed_chain::keys::{KeyCheck, check_registration};
use sealed_core::audit::Actor;
use sealed_core::fingerprint::{decode_desk_public_key, fingerprint};
use sealed_core::wire::{ErrorCode, IssuedToken};
use sealed_store::{NewInbox, Store, TipFilter};
use serde_json::{Map, Value};

use crate::AppState;
use crate::config::valid_inbox_id;
use crate::edge::read_body;
use crate::error::ApiError;

type ApiResult = Result<Response, ApiError>;

/// Tip floor range on create and PATCH (contract C-12, SRD BR-8).
const FLOOR_MIN: u64 = 10_000;
const FLOOR_MAX: u64 = 100_000_000;
/// Default birthday: the current tip minus this many blocks (§6.3).
const BIRTHDAY_BACK: u32 = 100;

// ---------- Auth helpers ----------

/// The token in `Authorization: Bearer <token>`. Tokens never travel in a URL (§3).
pub fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|t| !t.is_empty())
}

/// BLAKE2b-256 of the token, the only form ever stored (rules §1.4).
pub fn token_hash(token: &str) -> [u8; 32] {
    Blake2b::<U32>::digest(token.as_bytes()).into()
}

fn lock(state: &AppState) -> std::sync::MutexGuard<'_, Store> {
    state
        .store
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// The inbox must exist (404 first), then a current desk token (401).
fn require_desk(state: &AppState, id: &str, headers: &HeaderMap) -> Result<(), ApiError> {
    let store = lock(state);
    if store.inbox(id)?.is_none() {
        return Err(ApiError::new(ErrorCode::NotFound));
    }
    let Some(token) = bearer(headers) else {
        return Err(ApiError::new(ErrorCode::Unauthorized));
    };
    if store.token_is_current(id, &token_hash(token))? {
        Ok(())
    } else {
        Err(ApiError::new(ErrorCode::Unauthorized))
    }
}

/// Argon2id check of `X-Setup-Secret` against `SEALED_SETUP_SECRET_HASH`, off the async threads.
/// The comparison inside Argon2 is constant time (rules §1.4).
async fn setup_secret_ok(state: &AppState, headers: &HeaderMap) -> bool {
    let Some(secret) = headers
        .get("x-setup-secret")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
    else {
        return false;
    };
    let hash = state.config.setup_secret_hash.clone();
    tokio::task::spawn_blocking(move || {
        use argon2::{PasswordHash, PasswordVerifier};
        PasswordHash::new(&hash)
            .map(|parsed| {
                argon2::Argon2::default()
                    .verify_password(secret.as_bytes(), &parsed)
                    .is_ok()
            })
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false)
}

// ---------- Body and query helpers ----------

/// A JSON object body with only `allowed` keys (rules §1.10: unknown fields rejected).
async fn object(body: Body, allowed: &[&'static str]) -> Result<Map<String, Value>, ApiError> {
    let bytes = read_body(body).await?;
    let Ok(Value::Object(map)) = serde_json::from_slice::<Value>(&bytes) else {
        return Err(ApiError::new(ErrorCode::InvalidRequest));
    };
    if map.keys().any(|k| !allowed.contains(&k.as_str())) {
        return Err(ApiError::new(ErrorCode::InvalidRequest));
    }
    Ok(map)
}

fn text(map: &Map<String, Value>, key: &'static str) -> Result<String, ApiError> {
    map.get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or(ApiError::bad(key))
}

fn int(map: &Map<String, Value>, key: &'static str) -> Result<u64, ApiError> {
    map.get(key)
        .and_then(Value::as_u64)
        .ok_or(ApiError::bad(key))
}

fn query(raw: Option<&str>) -> Vec<(String, String)> {
    raw.unwrap_or("")
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|p| match p.split_once('=') {
            Some((k, v)) => (k.to_owned(), v.to_owned()),
            None => (p.to_owned(), String::new()),
        })
        .collect()
}

fn query_u64(
    q: &[(String, String)],
    key: &'static str,
    default: u64,
    range: std::ops::RangeInclusive<u64>,
) -> Result<u64, ApiError> {
    match q.iter().find(|(k, _)| k == key) {
        None => Ok(default),
        Some((_, v)) => v
            .parse::<u64>()
            .ok()
            .filter(|n| range.contains(n))
            .ok_or(ApiError::bad(key)),
    }
}

fn now(state: &AppState) -> String {
    (state.clock)()
}

fn json(status: StatusCode, value: impl serde::Serialize) -> Response {
    (status, Json(value)).into_response()
}

// ---------- §6.1 GET /v1/health ----------

pub async fn get_health(State(state): State<Arc<AppState>>) -> ApiResult {
    let rows = lock(&state).sources()?;
    Ok(json(
        StatusCode::OK,
        health(
            &rows,
            &state.config.sources,
            state.config.network,
            crate::VERSION,
        ),
    ))
}

// ---------- §6.2 GET /v1/inbox/{id} ----------

pub async fn get_inbox(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> ApiResult {
    let record = lock(&state)
        .inbox(&id)?
        .ok_or(ApiError::new(ErrorCode::NotFound))?;
    Ok(json(StatusCode::OK, record.inbox))
}

// ---------- §6.3 POST /v1/inbox ----------

pub async fn create_inbox(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Body,
) -> ApiResult {
    // 1. Setup secret.
    if !setup_secret_ok(&state, &headers).await {
        return Err(ApiError::new(ErrorCode::Forbidden));
    }
    // 2. JSON with every required field of the right type and no unknown field.
    const FIELDS: &[&str] = &[
        "id",
        "name",
        "desk_public_key",
        "fingerprint",
        "address",
        "ufvk",
        "tip_floor_zat",
        "birthday_height",
    ];
    let map = object(body, FIELDS).await?;
    let id = text(&map, "id")?;
    let name = text(&map, "name")?;
    let desk_public_key = text(&map, "desk_public_key")?;
    let fp = text(&map, "fingerprint")?;
    let address = text(&map, "address")?;
    let ufvk = text(&map, "ufvk")?;
    let floor = int(&map, "tip_floor_zat")?;
    let birthday = match map.get("birthday_height") {
        None => None,
        Some(v) => Some(
            v.as_u64()
                .and_then(|b| u32::try_from(b).ok())
                .ok_or(ApiError::bad("birthday_height"))?,
        ),
    };
    if name.trim().is_empty() || name.chars().count() > 64 {
        return Err(ApiError::bad("name"));
    }
    // 3. The deployment's inbox id.
    if !valid_inbox_id(&id) || id != state.config.inbox_id {
        return Err(ApiError::bad("id"));
    }
    // 4. No inbox yet.
    if lock(&state).inbox(&id)?.is_some() {
        return Err(ApiError::new(ErrorCode::InboxExists));
    }
    // 5 to 10. Spend authority, network, viewing key, address, shielded, derived from the key.
    check_registration(state.config.zcash_network(), &ufvk, &address).map_err(|c| match c {
        KeyCheck::SpendKey => ApiError::field(ErrorCode::SpendKeyRejected, "ufvk"),
        KeyCheck::NetworkMismatch => ApiError::new(ErrorCode::NetworkMismatch),
        KeyCheck::BadViewingKey => ApiError::bad("ufvk"),
        KeyCheck::BadAddress => ApiError::bad("address"),
        KeyCheck::NotShielded => ApiError::field(ErrorCode::AddressNotShielded, "address"),
        KeyCheck::AddressMismatch => ApiError::field(ErrorCode::AddressMismatch, "address"),
    })?;
    // 11. A 32-byte desk public key.
    let key = decode_desk_public_key(&desk_public_key).ok_or(ApiError::bad("desk_public_key"))?;
    // 12. The fingerprint of that key (§4.3).
    if fingerprint(&key) != fp {
        return Err(ApiError::field(
            ErrorCode::FingerprintMismatch,
            "fingerprint",
        ));
    }
    // 13. Floor range.
    if !(FLOOR_MIN..=FLOOR_MAX).contains(&floor) {
        return Err(ApiError::field(ErrorCode::FloorOutOfRange, "tip_floor_zat"));
    }
    // 14 and 15. Birthday against the chain tip the watcher last saw.
    let tip = lock(&state)
        .sources()?
        .iter()
        .filter_map(|s| s.tip_height)
        .max();
    let birthday_height = match (birthday, tip) {
        (Some(b), Some(t)) if b > t => return Err(ApiError::bad("birthday_height")),
        (Some(b), _) => b,
        (None, Some(t)) => t.saturating_sub(BIRTHDAY_BACK),
        (None, None) => return Err(ApiError::new(ErrorCode::WatcherUnavailable)),
    };

    let created_at = now(&state);
    let inbox = lock(&state).create_inbox(&NewInbox {
        id: &id,
        name: &name,
        network: state.config.network,
        address: &address,
        desk_public_key: &desk_public_key,
        fingerprint: &fp,
        ufvk: &ufvk,
        tip_floor_zat: floor,
        birthday_height,
        created_at: &created_at,
    })?;
    Ok(json(StatusCode::CREATED, inbox))
}

// ---------- §6.4 POST /v1/inbox/{id}/tokens ----------

pub async fn issue_token(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> ApiResult {
    if lock(&state).inbox(&id)?.is_none() {
        return Err(ApiError::new(ErrorCode::NotFound));
    }
    // The setup secret or the current desk token (C-5).
    let actor = if headers.contains_key("x-setup-secret") {
        if !setup_secret_ok(&state, &headers).await {
            return Err(ApiError::new(ErrorCode::Forbidden));
        }
        Actor::Setup
    } else {
        require_desk(&state, &id, &headers)?;
        Actor::Desk
    };
    let mut raw = [0u8; 32];
    getrandom::fill(&mut raw).map_err(|_| ApiError::new(ErrorCode::WatcherUnavailable))?;
    let token = format!("sld_{}", URL_SAFE_NO_PAD.encode(raw));
    let created_at = now(&state);
    lock(&state).issue_token(&id, &token_hash(&token), actor, &created_at)?;
    Ok(json(StatusCode::CREATED, IssuedToken { token, created_at }))
}

// ---------- §6.5 GET /v1/inbox/{id}/tips ----------

pub async fn list_tips(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    RawQuery(raw): RawQuery,
) -> ApiResult {
    require_desk(&state, &id, &headers)?;
    let q = query(raw.as_deref());
    let after_seq = query_u64(&q, "after_seq", 0, 0..=u64::MAX)?;
    let limit = query_u64(&q, "limit", 50, 1..=200)?;
    let filter = match q
        .iter()
        .find(|(k, _)| k == "filter")
        .map(|(_, v)| v.as_str())
    {
        None | Some("visible") => TipFilter::Visible,
        Some("below_floor") => TipFilter::BelowFloor,
        Some("all") => TipFilter::All,
        Some(_) => return Err(ApiError::bad("filter")),
    };
    let page = lock(&state).tips_page(&id, after_seq, filter, limit as u32)?;
    Ok(json(StatusCode::OK, page))
}

// ---------- §6.6 GET /v1/inbox/{id}/tips/{tip_id} ----------

pub async fn get_tip(
    State(state): State<Arc<AppState>>,
    Path((id, tip_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> ApiResult {
    require_desk(&state, &id, &headers)?;
    let tip = lock(&state)
        .tip(&id, &tip_id)?
        .ok_or(ApiError::new(ErrorCode::NotFound))?;
    Ok(json(StatusCode::OK, tip))
}

// ---------- §6.7 PATCH /v1/inbox/{id} ----------

pub async fn patch_inbox(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    body: Body,
) -> ApiResult {
    require_desk(&state, &id, &headers)?;
    let map = object(body, &["tip_floor_zat"]).await?;
    let floor = int(&map, "tip_floor_zat")?;
    if !(FLOOR_MIN..=FLOOR_MAX).contains(&floor) {
        return Err(ApiError::field(ErrorCode::FloorOutOfRange, "tip_floor_zat"));
    }
    let at = now(&state);
    let inbox = lock(&state).set_floor(&id, floor, &at)?;
    Ok(json(StatusCode::OK, inbox))
}

// ---------- §6.8 DELETE /v1/inbox/{id} ----------

pub async fn delete_inbox(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> ApiResult {
    // The desk token and the setup secret (C-6).
    require_desk(&state, &id, &headers)?;
    if !setup_secret_ok(&state, &headers).await {
        return Err(ApiError::new(ErrorCode::Forbidden));
    }
    lock(&state).delete_inbox(&id)?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

// ---------- §6.10 GET /v1/inbox/{id}/audit ----------

pub async fn get_audit(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    RawQuery(raw): RawQuery,
) -> ApiResult {
    require_desk(&state, &id, &headers)?;
    let q = query(raw.as_deref());
    let after_seq = query_u64(&q, "after_seq", 0, 0..=u64::MAX)?;
    let limit = query_u64(&q, "limit", 200, 1..=500)?;
    let page = lock(&state).audit_page(&id, after_seq, limit as u32)?;
    Ok(json(StatusCode::OK, page))
}

/// Anything else: 404 in the contract's error shape.
pub async fn not_found() -> ApiError {
    ApiError::new(ErrorCode::NotFound)
}
