//! Contract tests for every route of §6: one per fixture, one per error code, the §6.3 check
//! order, headers on every response, CORS, PATCH, DELETE and token rotation (FR-11, FR-15 to
//! FR-18, FR-20, NFR-3, NFR-4, T-9, T-11).

use std::sync::{Arc, OnceLock};

use axum::Router;
use axum::body::Body;
use axum::http::{HeaderMap, Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedSpendingKey};
use zcash_protocol::consensus::Network as ZNetwork;

use sealed_core::audit::verify_chain;
use sealed_core::memo::MEMO_BYTES;
use sealed_store::{DbKey, NewTip, Store};

use crate::config::{Config, ConfigError};
use crate::{AppState, router};

const SECRET: &str = "setup-secret-for-tests";
const ORIGIN: &str = "https://sealed.example";
const SOURCE_A: &str = "https://a.example:443";
const SOURCE_B: &str = "https://b.example:443";
const NOW: &str = "2026-10-14T12:00:00Z";
const DESK_KEY: &str = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const DESK_FP: &str = "CB2F5160FC1F7E05";
const TIP_HEIGHT: u32 = 4_500_000;

fn fixture(name: &str) -> Value {
    let path = format!(
        "{}/../../../../contracts/fixtures/{name}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// A cheap Argon2id hash of the test secret (the parameters travel inside the PHC string).
fn secret_hash() -> String {
    static HASH: OnceLock<String> = OnceLock::new();
    HASH.get_or_init(|| {
        use argon2::password_hash::PasswordHasher;
        let a = argon2::Argon2::new(
            argon2::Algorithm::Argon2id,
            argon2::Version::V0x13,
            argon2::Params::new(8, 1, 1, None).unwrap(),
        );
        a.hash_password(SECRET.as_bytes()).unwrap().to_string()
    })
    .clone()
}

fn vars(extra: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let mut map: std::collections::HashMap<String, String> = [
        ("SEALED_NETWORK", "test"),
        ("SEALED_INBOX_ID", "desk"),
        ("ALLOWED_ORIGINS", ORIGIN),
        (
            "SEALED_LIGHTWALLETD_URLS",
            "https://a.example:443,https://b.example:443",
        ),
        ("SEALED_DB_PATH", ":memory:"),
        (
            "SEALED_DB_KEY",
            "AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM=",
        ),
    ]
    .iter()
    .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
    .collect();
    map.insert("SEALED_SETUP_SECRET_HASH".into(), secret_hash());
    for (k, v) in extra {
        map.insert((*k).to_owned(), (*v).to_owned());
    }
    move |name| map.get(name).cloned()
}

fn config() -> Config {
    Config::from_vars(vars(&[])).unwrap()
}

/// A fresh API. `with_tip` records a chain tip as the watcher would, so a default birthday exists.
fn app(with_tip: bool) -> (Router, Arc<AppState>) {
    let mut store = Store::open_in_memory(DbKey::new([3; 32])).unwrap();
    if with_tip {
        store
            .record_source(SOURCE_A, true, Some(TIP_HEIGHT), NOW)
            .unwrap();
    }
    let mut state = AppState::new(store, config());
    state.clock = Box::new(|| NOW.to_owned());
    let state = Arc::new(state);
    (router(state.clone()), state)
}

fn test_key(network: ZNetwork, seed: u8) -> (String, String) {
    let usk =
        UnifiedSpendingKey::from_seed(&network, &[seed; 32], 0u32.try_into().unwrap()).unwrap();
    let ufvk = usk.to_unified_full_viewing_key();
    let (ua, _) = ufvk
        .default_address(UnifiedAddressRequest::SHIELDED)
        .unwrap();
    (ufvk.encode(&network).unwrap(), ua.encode(&network))
}

fn create_body() -> Value {
    let (ufvk, address) = test_key(ZNetwork::TestNetwork, 1);
    json!({
        "id": "desk",
        "name": "Sealed",
        "desk_public_key": DESK_KEY,
        "fingerprint": DESK_FP,
        "address": address,
        "ufvk": ufvk,
        "tip_floor_zat": 100_000,
    })
}

struct Reply {
    status: StatusCode,
    headers: HeaderMap,
    body: Value,
}

async fn call(
    app: &Router,
    method: Method,
    uri: &str,
    headers: &[(&str, &str)],
    body: Option<Value>,
) -> Reply {
    let mut req = Request::builder().method(method).uri(uri);
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let req = match body {
        Some(b) => req
            .header("content-type", "application/json")
            .body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    }
    .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let bytes = axum::body::to_bytes(res.into_body(), 1 << 20)
        .await
        .unwrap();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap()
    };
    Reply {
        status,
        headers,
        body,
    }
}

const S: (&str, &str) = ("x-setup-secret", SECRET);

/// Registers the inbox and returns a desk token.
async fn register(app: &Router) -> String {
    let r = call(app, Method::POST, "/v1/inbox", &[S], Some(create_body())).await;
    assert_eq!(r.status, StatusCode::CREATED, "{}", r.body);
    let t = call(app, Method::POST, "/v1/inbox/desk/tokens", &[S], None).await;
    assert_eq!(t.status, StatusCode::CREATED);
    t.body["token"].as_str().unwrap().to_owned()
}

fn bearer(token: &str) -> (String, String) {
    ("authorization".into(), format!("Bearer {token}"))
}

async fn get_with(app: &Router, uri: &str, token: &str) -> Reply {
    let (k, v) = bearer(token);
    call(app, Method::GET, uri, &[(k.as_str(), v.as_str())], None).await
}

fn z1() -> [u8; MEMO_BYTES] {
    let mut m = [0u8; MEMO_BYTES];
    m[..3].copy_from_slice(b"z1:");
    m[3..511].fill(b'A');
    m
}

fn add_tip(state: &AppState, txid: &str, amount_zat: u64) {
    let memo = z1();
    state
        .store
        .lock()
        .unwrap()
        .insert_tip(
            "desk",
            &NewTip {
                txid,
                output_index: 0,
                height: TIP_HEIGHT,
                block_time_at: NOW,
                seen_at: NOW,
                amount_zat,
                confirmations: 1,
                memo: &memo,
            },
        )
        .unwrap();
}

/// Same keys and the same JSON type for every value that is set on both sides.
fn same_shape(actual: &Value, expected: &Value) -> Result<(), String> {
    match (actual, expected) {
        (_, Value::Null) | (Value::Null, _) => Ok(()),
        (Value::Object(a), Value::Object(e)) => {
            let mut ak: Vec<_> = a.keys().collect();
            let mut ek: Vec<_> = e.keys().collect();
            ak.sort();
            ek.sort();
            if ak != ek {
                return Err(format!("keys {ak:?} != {ek:?}"));
            }
            a.iter()
                .try_for_each(|(k, v)| same_shape(v, &e[k]).map_err(|m| format!("{k}: {m}")))
        }
        (Value::Array(a), Value::Array(e)) => match (a.first(), e.first()) {
            (Some(x), Some(y)) => same_shape(x, y),
            _ => Ok(()),
        },
        (Value::String(_), Value::String(_)) | (Value::Bool(_), Value::Bool(_)) => Ok(()),
        (Value::Number(a), Value::Number(e)) if a.is_u64() == e.is_u64() => Ok(()),
        _ => Err(format!("type {actual} != {expected}")),
    }
}

// ---------- One test per fixture ----------

#[tokio::test]
async fn health_matches_its_fixture() {
    let (app, _) = app(true);
    let r = call(&app, Method::GET, "/v1/health", &[], None).await;
    assert_eq!(r.status, StatusCode::OK);
    same_shape(&r.body, &fixture("health")).unwrap();
    assert_eq!(r.body["network"], "test");
    assert_eq!(r.body["sources"][0]["origin"], SOURCE_A);
    assert_eq!(r.body["sources"][1]["origin"], SOURCE_B);
    assert_eq!(r.body["sources"][1]["ok"], false, "never answered yet");
    assert_eq!(r.body["tip_height"], TIP_HEIGHT);
}

#[tokio::test]
async fn inbox_matches_its_fixture_and_never_shows_the_viewing_key() {
    let (app, _) = app(true);
    register(&app).await;
    let r = call(&app, Method::GET, "/v1/inbox/desk", &[], None).await;
    assert_eq!(r.status, StatusCode::OK);
    same_shape(&r.body, &fixture("inbox")).unwrap();
    assert_eq!(r.body["fingerprint"], DESK_FP);
    assert_eq!(r.body["created_at"], NOW);
    assert!(!r.body.to_string().contains("uviewtest"));
}

#[tokio::test]
async fn token_matches_its_fixture() {
    let (app, _) = app(true);
    call(&app, Method::POST, "/v1/inbox", &[S], Some(create_body())).await;
    let r = call(&app, Method::POST, "/v1/inbox/desk/tokens", &[S], None).await;
    assert_eq!(r.status, StatusCode::CREATED);
    same_shape(&r.body, &fixture("token")).unwrap();
    assert!(r.body["token"].as_str().unwrap().starts_with("sld_"));
}

#[tokio::test]
async fn tips_page_and_tip_match_their_fixtures() {
    let (app, state) = app(true);
    let token = register(&app).await;
    add_tip(&state, &"ab".repeat(32), 100_000);
    let page = get_with(&app, "/v1/inbox/desk/tips?after_seq=0&filter=all", &token).await;
    assert_eq!(page.status, StatusCode::OK);
    same_shape(&page.body, &fixture("tips_page")).unwrap();
    let id = page.body["tips"][0]["id"].as_str().unwrap().to_owned();
    let one = get_with(&app, &format!("/v1/inbox/desk/tips/{id}"), &token).await;
    assert_eq!(one.status, StatusCode::OK);
    same_shape(&one.body, &fixture("tip")).unwrap();
    assert_eq!(one.body["display_status"], "pending");
    assert_eq!(
        get_with(&app, "/v1/inbox/desk/tips/tip_missing", &token)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn audit_page_matches_its_fixture_and_its_chain_verifies() {
    let (app, state) = app(true);
    let token = register(&app).await;
    add_tip(&state, &"cd".repeat(32), 100_000);
    let r = get_with(&app, "/v1/inbox/desk/audit?after_seq=0", &token).await;
    assert_eq!(r.status, StatusCode::OK);
    same_shape(&r.body, &fixture("audit_chain")["page"]).unwrap();
    let entries = r.body["entries"].as_array().unwrap().clone();
    assert_eq!(
        entries.len(),
        3,
        "inbox_created, token_issued, tip_received"
    );
    assert_eq!(verify_chain(&entries), Ok(()));
    // T-11: the tampered fixture fails the same check.
    let tampered = fixture("audit_chain_tampered")["page"]["entries"]
        .as_array()
        .unwrap()
        .clone();
    assert!(verify_chain(&tampered).is_err());
}

#[tokio::test]
async fn spend_key_error_is_the_fixture_exactly_and_nothing_is_stored() {
    let (app, state) = app(true);
    let mut body = create_body();
    body["ufvk"] = json!("secret-extended-key-test1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq");
    let r = call(&app, Method::POST, "/v1/inbox", &[S], Some(body)).await;
    assert_eq!(r.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(r.body, fixture("error_spend_key"));
    assert!(state.store.lock().unwrap().inbox("desk").unwrap().is_none());
}

// ---------- One test per error code ----------

async fn create_with(app: &Router, change: impl FnOnce(&mut Value)) -> Reply {
    let mut body = create_body();
    change(&mut body);
    call(app, Method::POST, "/v1/inbox", &[S], Some(body)).await
}

fn code(r: &Reply) -> &str {
    r.body["error"]["code"].as_str().unwrap_or("")
}

#[tokio::test]
async fn invalid_request_names_the_field() {
    let (app, _) = app(true);
    let r = create_with(&app, |b| b["tip_floor_zat"] = json!("100000")).await;
    assert_eq!(
        (
            r.status.as_u16(),
            code(&r),
            r.body["error"]["field"].as_str()
        ),
        (400, "invalid_request", Some("tip_floor_zat"))
    );
    let r = create_with(&app, |b| b["extra"] = json!(1)).await;
    assert_eq!(code(&r), "invalid_request", "unknown fields are refused");
    let r = create_with(&app, |b| b["id"] = json!("other")).await;
    assert_eq!(r.body["error"]["field"], "id");
    let r = call(
        &app,
        Method::POST,
        "/v1/inbox",
        &[S, ("content-type", "application/json")],
        None,
    )
    .await;
    assert_eq!(code(&r), "invalid_request");
}

#[tokio::test]
async fn unauthorized_without_a_current_token() {
    let (app, _) = app(true);
    register(&app).await;
    let r = call(&app, Method::GET, "/v1/inbox/desk/tips", &[], None).await;
    assert_eq!((r.status.as_u16(), code(&r)), (401, "unauthorized"));
    let r = get_with(&app, "/v1/inbox/desk/tips", "sld_wrong").await;
    assert_eq!(code(&r), "unauthorized");
}

#[tokio::test]
async fn forbidden_with_a_wrong_or_missing_setup_secret() {
    let (app, _) = app(true);
    let r = call(
        &app,
        Method::POST,
        "/v1/inbox",
        &[("x-setup-secret", "nope")],
        Some(create_body()),
    )
    .await;
    assert_eq!((r.status.as_u16(), code(&r)), (403, "forbidden"));
    let r = call(
        &app,
        Method::POST,
        "/v1/inbox",
        &[],
        Some(json!({"broken": true})),
    )
    .await;
    assert_eq!(
        code(&r),
        "forbidden",
        "the secret is checked before the body (§6.3 check 1)"
    );
}

#[tokio::test]
async fn not_found_for_unknown_inboxes_and_routes() {
    let (app, _) = app(true);
    let r = call(&app, Method::GET, "/v1/inbox/desk", &[], None).await;
    assert_eq!((r.status.as_u16(), code(&r)), (404, "not_found"));
    let r = call(&app, Method::GET, "/v1/nothing", &[], None).await;
    assert_eq!(code(&r), "not_found");
    let r = call(&app, Method::PUT, "/v1/health", &[], None).await;
    assert_eq!(code(&r), "not_found");
}

#[tokio::test]
async fn inbox_exists_on_a_second_create() {
    let (app, _) = app(true);
    register(&app).await;
    let r = call(&app, Method::POST, "/v1/inbox", &[S], Some(create_body())).await;
    assert_eq!((r.status.as_u16(), code(&r)), (409, "inbox_exists"));
}

#[tokio::test]
async fn network_mismatch_for_a_mainnet_key() {
    let (app, _) = app(true);
    let (main_ufvk, _) = test_key(ZNetwork::MainNetwork, 1);
    let r = create_with(&app, |b| b["ufvk"] = json!(main_ufvk)).await;
    assert_eq!((r.status.as_u16(), code(&r)), (422, "network_mismatch"));
}

#[tokio::test]
async fn spend_key_is_refused_before_the_network_check() {
    let (app, _) = app(true);
    let r = create_with(&app, |b| {
        b["ufvk"] = json!("secret-extended-key-main1qqqqqqqqqqqqqqqqqqqq")
    })
    .await;
    assert_eq!(
        code(&r),
        "spend_key_rejected",
        "§6.3: check 5 before check 6"
    );
}

#[tokio::test]
async fn address_mismatch_for_another_keys_address() {
    let (app, _) = app(true);
    let (_, other) = test_key(ZNetwork::TestNetwork, 2);
    let r = create_with(&app, |b| b["address"] = json!(other)).await;
    assert_eq!((r.status.as_u16(), code(&r)), (422, "address_mismatch"));
}

#[tokio::test]
async fn address_not_shielded_for_a_transparent_address() {
    let (app, _) = app(true);
    let r = create_with(&app, |b| {
        b["address"] = json!("tm9iMLAuYMzJ6jtFLcA7rzUmfreGuKvr7Ma")
    })
    .await;
    assert_eq!((r.status.as_u16(), code(&r)), (422, "address_not_shielded"));
}

#[tokio::test]
async fn fingerprint_mismatch_for_the_wrong_fingerprint() {
    let (app, _) = app(true);
    let r = create_with(&app, |b| b["fingerprint"] = json!("0000000000000000")).await;
    assert_eq!((r.status.as_u16(), code(&r)), (422, "fingerprint_mismatch"));
}

#[tokio::test]
async fn floor_out_of_range_on_create_and_patch() {
    let (app, _) = app(true);
    let r = create_with(&app, |b| b["tip_floor_zat"] = json!(9_999)).await;
    assert_eq!((r.status.as_u16(), code(&r)), (422, "floor_out_of_range"));
    let token = register(&app).await;
    let (k, v) = bearer(&token);
    let r = call(
        &app,
        Method::PATCH,
        "/v1/inbox/desk",
        &[(&k, &v)],
        Some(json!({"tip_floor_zat": 100_000_001})),
    )
    .await;
    assert_eq!(code(&r), "floor_out_of_range");
}

#[tokio::test]
async fn rate_limited_with_retry_after() {
    let (app, _) = app(true);
    let mut last = None;
    for _ in 0..11 {
        last = Some(
            call(
                &app,
                Method::POST,
                "/v1/inbox",
                &[("x-setup-secret", "guess")],
                Some(json!({})),
            )
            .await,
        );
    }
    let r = last.unwrap();
    assert_eq!((r.status.as_u16(), code(&r)), (429, "rate_limited"));
    let wait: u64 = r.headers["retry-after"].to_str().unwrap().parse().unwrap();
    assert!(wait >= 1);
}

#[tokio::test]
async fn watcher_unavailable_when_no_tip_is_known_for_a_default_birthday() {
    let (app, _) = app(false);
    let r = call(&app, Method::POST, "/v1/inbox", &[S], Some(create_body())).await;
    assert_eq!((r.status.as_u16(), code(&r)), (503, "watcher_unavailable"));
    // With a birthday the chain tip is not needed.
    let r = create_with(&app, |b| b["birthday_height"] = json!(TIP_HEIGHT)).await;
    assert_eq!(r.status, StatusCode::CREATED);
}

// ---------- Headers and CORS ----------

#[tokio::test]
async fn every_response_carries_the_privacy_headers_and_no_cookie() {
    let (app, _) = app(true);
    for r in [
        call(&app, Method::GET, "/v1/health", &[], None).await,
        call(&app, Method::GET, "/v1/inbox/desk", &[], None).await,
        call(
            &app,
            Method::POST,
            "/v1/inbox",
            &[("x-setup-secret", "nope")],
            Some(json!({})),
        )
        .await,
    ] {
        assert_eq!(r.headers["cache-control"], "no-store");
        assert_eq!(r.headers["pragma"], "no-cache");
        assert_eq!(r.headers["x-content-type-options"], "nosniff");
        assert_eq!(r.headers["referrer-policy"], "no-referrer");
        assert!(!r.headers.contains_key("set-cookie"));
    }
}

#[tokio::test]
async fn cors_allows_only_the_exact_origins() {
    let (app, _) = app(true);
    let ok = call(&app, Method::GET, "/v1/health", &[("origin", ORIGIN)], None).await;
    assert_eq!(ok.headers["access-control-allow-origin"], ORIGIN);
    assert!(!ok.headers.contains_key("access-control-allow-credentials"));

    for other in [
        "https://evil.example",
        "https://sealed.example.evil.com",
        "http://sealed.example",
        "null",
    ] {
        let r = call(&app, Method::GET, "/v1/health", &[("origin", other)], None).await;
        assert!(
            !r.headers.contains_key("access-control-allow-origin"),
            "{other} must be refused"
        );
    }

    let pre = call(
        &app,
        Method::OPTIONS,
        "/v1/inbox",
        &[
            ("origin", ORIGIN),
            ("access-control-request-method", "POST"),
        ],
        None,
    )
    .await;
    assert_eq!(pre.status, StatusCode::NO_CONTENT);
    assert_eq!(pre.headers["access-control-allow-origin"], ORIGIN);
    assert_eq!(
        pre.headers["access-control-allow-methods"],
        "GET, POST, PATCH, DELETE"
    );
    assert_eq!(
        pre.headers["access-control-allow-headers"],
        "Authorization, Content-Type, X-Setup-Secret"
    );
    assert_eq!(pre.headers["access-control-max-age"], "600");

    let bad = call(
        &app,
        Method::OPTIONS,
        "/v1/inbox",
        &[("origin", "https://evil.example")],
        None,
    )
    .await;
    assert!(!bad.headers.contains_key("access-control-allow-origin"));
    assert!(!bad.headers.contains_key("access-control-allow-methods"));
}

// ---------- PATCH, DELETE, rotation ----------

#[tokio::test]
async fn patch_resorts_tips_into_and_out_of_below_floor_without_deleting() {
    let (app, state) = app(true);
    let token = register(&app).await;
    add_tip(&state, &"01".repeat(32), 50_000);
    add_tip(&state, &"02".repeat(32), 200_000);
    let before = get_with(&app, "/v1/inbox/desk/tips?filter=all", &token).await;
    assert_eq!(
        before.body["counts"],
        json!({"visible": 1, "below_floor": 1})
    );
    let next = before.body["next_seq"].as_u64().unwrap();

    let (k, v) = bearer(&token);
    let r = call(
        &app,
        Method::PATCH,
        "/v1/inbox/desk",
        &[(&k, &v)],
        Some(json!({"tip_floor_zat": 40_000})),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.body["tip_floor_zat"], 40_000);
    let changed = get_with(
        &app,
        &format!("/v1/inbox/desk/tips?filter=all&after_seq={next}"),
        &token,
    )
    .await;
    assert_eq!(
        changed.body["tips"].as_array().unwrap().len(),
        1,
        "only the tip that flipped gets a new seq"
    );
    assert_eq!(
        changed.body["counts"],
        json!({"visible": 2, "below_floor": 0})
    );
    let all = get_with(&app, "/v1/inbox/desk/tips?filter=all", &token).await;
    assert_eq!(
        all.body["tips"].as_array().unwrap().len(),
        2,
        "no tip deleted"
    );
}

#[tokio::test]
async fn delete_needs_the_token_and_the_secret_and_removes_everything() {
    let (app, state) = app(true);
    let token = register(&app).await;
    add_tip(&state, &"03".repeat(32), 100_000);
    let (k, v) = bearer(&token);

    let r = call(&app, Method::DELETE, "/v1/inbox/desk", &[(&k, &v)], None).await;
    assert_eq!(code(&r), "forbidden", "token alone is not enough");
    let r = call(&app, Method::DELETE, "/v1/inbox/desk", &[S], None).await;
    assert_eq!(code(&r), "unauthorized", "secret alone is not enough");

    let r = call(&app, Method::DELETE, "/v1/inbox/desk", &[(&k, &v), S], None).await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    assert_eq!(r.body, Value::Null);
    assert_eq!(
        call(&app, Method::GET, "/v1/inbox/desk", &[], None)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        get_with(&app, "/v1/inbox/desk/tips", &token).await.status,
        StatusCode::NOT_FOUND
    );
    let store = state.store.lock().unwrap();
    assert!(store.viewing_key("desk").is_err(), "viewing key gone (T-9)");
    assert!(
        store.audit_page("desk", 0, 10).unwrap().entries.is_empty(),
        "audit log gone (C-13)"
    );
}

#[tokio::test]
async fn rotating_the_token_revokes_the_old_one() {
    let (app, _) = app(true);
    let first = register(&app).await;
    let (k, v) = bearer(&first);
    let r = call(
        &app,
        Method::POST,
        "/v1/inbox/desk/tokens",
        &[(&k, &v)],
        None,
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED);
    let second = r.body["token"].as_str().unwrap().to_owned();
    assert_eq!(
        get_with(&app, "/v1/inbox/desk/tips", &first).await.status,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get_with(&app, "/v1/inbox/desk/tips", &second).await.status,
        StatusCode::OK
    );
    let audit = get_with(&app, "/v1/inbox/desk/audit", &second).await;
    let last = audit.body["entries"]
        .as_array()
        .unwrap()
        .last()
        .unwrap()
        .clone();
    assert_eq!(
        (last["type"].as_str(), last["actor"].as_str()),
        (Some("token_issued"), Some("desk"))
    );
    assert_eq!(last["details"]["rotated"], true);
}

#[tokio::test]
async fn query_values_out_of_range_are_bad_requests() {
    let (app, _) = app(true);
    let token = register(&app).await;
    for (uri, field) in [
        ("/v1/inbox/desk/tips?limit=0", "limit"),
        ("/v1/inbox/desk/tips?limit=201", "limit"),
        ("/v1/inbox/desk/tips?filter=spam", "filter"),
        ("/v1/inbox/desk/tips?after_seq=-1", "after_seq"),
        ("/v1/inbox/desk/audit?limit=501", "limit"),
    ] {
        let r = get_with(&app, uri, &token).await;
        assert_eq!(
            (r.status.as_u16(), r.body["error"]["field"].as_str()),
            (400, Some(field)),
            "{uri}"
        );
    }
    let empty = get_with(&app, "/v1/inbox/desk/tips?after_seq=99", &token).await;
    assert_eq!(
        empty.body["next_seq"], 99,
        "C-22: an empty page returns the after_seq sent"
    );
}

// ---------- Configuration ----------

#[test]
fn configuration_refuses_unsafe_values_and_names_only_the_variable() {
    let bad = |extra: &[(&str, &str)]| Config::from_vars(vars(extra)).err();
    assert_eq!(
        bad(&[("SEALED_NETWORK", "testnet")]),
        Some(ConfigError("SEALED_NETWORK"))
    );
    assert_eq!(
        bad(&[
            ("SEALED_NETWORK", "main"),
            ("SEALED_LIGHTWALLETD_URLS", "https://a.example:443")
        ]),
        Some(ConfigError("SEALED_LIGHTWALLETD_URLS")),
        "mainnet needs two sources (FR-12)"
    );
    assert_eq!(
        bad(&[("SEALED_LIGHTWALLETD_URLS", "https://user:pw@a.example:443")]),
        Some(ConfigError("SEALED_LIGHTWALLETD_URLS"))
    );
    assert_eq!(
        bad(&[("ALLOWED_ORIGINS", "*")]),
        Some(ConfigError("ALLOWED_ORIGINS"))
    );
    assert_eq!(
        bad(&[("ALLOWED_ORIGINS", "https://a.example/path")]),
        Some(ConfigError("ALLOWED_ORIGINS"))
    );
    assert_eq!(
        bad(&[("SEALED_DB_KEY", "c2hvcnQ=")]),
        Some(ConfigError("SEALED_DB_KEY"))
    );
    assert_eq!(
        bad(&[("SEALED_SETUP_SECRET_HASH", "plain-text")]),
        Some(ConfigError("SEALED_SETUP_SECRET_HASH"))
    );
    assert_eq!(
        bad(&[("SEALED_CONFIRMATIONS", "1")]),
        Some(ConfigError("SEALED_CONFIRMATIONS"))
    );
    let message = ConfigError("SEALED_DB_KEY").to_string();
    assert!(!message.contains("AwMD"), "never the value");
    assert!(Config::from_vars(vars(&[])).is_ok());
}
