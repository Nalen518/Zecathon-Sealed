//! What every request passes through (contract §3, rules §1.6 to §1.8, §1.10, §6):
//! CORS against the exact origin list, the no-store and security headers, the 16 KB body limit,
//! the 10 s handler timeout, in-memory rate limits, and a request log with route, status and
//! latency only.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use sealed_core::wire::ErrorCode;

use crate::AppState;
use crate::error::ApiError;

pub const MAX_BODY_BYTES: usize = 16 * 1024;
const HANDLER_TIMEOUT: Duration = Duration::from_secs(10);

// ---------- Rate limits (counted in memory only, never written anywhere, rules §1.8) ----------

#[derive(Clone, Copy)]
struct Bucket {
    capacity: f64,
    per_second: f64,
}

/// Public reads by address: 60 at once, then 1 a second.
const PUBLIC: Bucket = Bucket {
    capacity: 60.0,
    per_second: 1.0,
};
/// Desk routes by token: 120 at once, then 2 a second.
const DESK: Bucket = Bucket {
    capacity: 120.0,
    per_second: 2.0,
};
/// Anything carrying the setup secret, by address: 10 at once, then 1 every 6 s (Argon2id is slow
/// on purpose, and guessing must be slower still).
const SETUP: Bucket = Bucket {
    capacity: 10.0,
    per_second: 1.0 / 6.0,
};

const MAX_BUCKETS: usize = 50_000;

#[derive(Default)]
pub struct Limiter {
    buckets: HashMap<String, (f64, Instant)>,
}

impl Limiter {
    /// Takes one request from `key`'s bucket, or returns the seconds until one is free.
    fn take(&mut self, key: String, b: Bucket, now: Instant) -> Result<(), u64> {
        if self.buckets.len() > MAX_BUCKETS {
            self.buckets
                .retain(|_, (_, at)| now.duration_since(*at) < Duration::from_secs(600));
            // Still full means a flood of fresh keys: start over rather than scan this on every request.
            if self.buckets.len() > MAX_BUCKETS {
                self.buckets.clear();
            }
        }
        let (tokens, at) = self.buckets.entry(key).or_insert((b.capacity, now));
        *tokens = (*tokens + now.duration_since(*at).as_secs_f64() * b.per_second).min(b.capacity);
        *at = now;
        if *tokens >= 1.0 {
            *tokens -= 1.0;
            Ok(())
        } else {
            Err(((1.0 - *tokens) / b.per_second).ceil().max(1.0) as u64)
        }
    }
}

/// The client address as Railway's edge reports it: the last `X-Forwarded-For` hop, which the
/// edge appends itself, else the socket peer. Used only as a bucket key in memory.
fn client_key(headers: &HeaderMap, peer: Option<SocketAddr>) -> String {
    let forwarded = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit(',').next())
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty());
    forwarded
        .or_else(|| peer.map(|p| p.ip().to_string()))
        .unwrap_or_else(|| "unknown".to_owned())
}

/// The buckets a request takes from, in order. A request with a token is counted by token and
/// by address (C-26), address first, so made-up tokens neither escape the limit nor fill memory.
fn limit_keys(headers: &HeaderMap, peer: Option<SocketAddr>) -> Vec<(String, Bucket)> {
    let client = client_key(headers, peer);
    if headers.contains_key("x-setup-secret") {
        return vec![(format!("s:{client}"), SETUP)];
    }
    if let Some(token) = crate::routes::bearer(headers) {
        let hash = crate::routes::token_hash(token);
        let id: String = hash[..8].iter().map(|b| format!("{b:02x}")).collect();
        return vec![(format!("a:{client}"), DESK), (format!("d:{id}"), DESK)];
    }
    vec![(format!("p:{client}"), PUBLIC)]
}

// ---------- Headers ----------

fn allowed_origin(state: &AppState, headers: &HeaderMap) -> Option<HeaderValue> {
    let origin = headers.get(header::ORIGIN)?;
    let text = origin.to_str().ok()?;
    state
        .config
        .allowed_origins
        .iter()
        .any(|o| o == text)
        .then(|| origin.clone())
}

fn finish(mut response: Response, origin: Option<HeaderValue>) -> Response {
    let h = response.headers_mut();
    h.remove(header::SET_COOKIE);
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    h.insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
    h.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    h.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    h.insert(header::VARY, HeaderValue::from_static("Origin"));
    if let Some(origin) = origin {
        h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        // Browsers hide non-standard headers cross-origin, so a 429 would show no real wait.
        h.insert(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            HeaderValue::from_static("Retry-After"),
        );
    }
    response
}

/// The route with ids masked, for the request log. Never the raw URI.
fn route_label(method: &Method, path: &str) -> String {
    let mut parts: Vec<&str> = path.split('/').collect();
    for i in 0..parts.len() {
        let prev = if i > 0 { parts[i - 1] } else { "" };
        if (prev == "inbox" || prev == "tips") && !parts[i].is_empty() {
            parts[i] = if prev == "inbox" { "{id}" } else { "{tip_id}" };
        }
    }
    format!("{method} {}", parts.join("/"))
}

pub async fn edge(State(state): State<Arc<AppState>>, request: Request, next: Next) -> Response {
    let started = Instant::now();
    let origin = allowed_origin(&state, request.headers());
    let label = route_label(request.method(), request.uri().path());

    // CORS preflight (contract §3). A disallowed origin gets no CORS headers, so the browser stops.
    if request.method() == Method::OPTIONS {
        let mut response = StatusCode::NO_CONTENT.into_response();
        if origin.is_some() {
            let h = response.headers_mut();
            h.insert(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                HeaderValue::from_static("GET, POST, PATCH, DELETE"),
            );
            h.insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                HeaderValue::from_static("Authorization, Content-Type, X-Setup-Secret"),
            );
            h.insert(
                header::ACCESS_CONTROL_MAX_AGE,
                HeaderValue::from_static("600"),
            );
        }
        return finish(response, origin);
    }

    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0);
    let limited = {
        let mut limiter = state
            .limiter
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let now = Instant::now();
        limit_keys(request.headers(), peer)
            .into_iter()
            .try_for_each(|(key, bucket)| limiter.take(key, bucket, now))
    };
    let response = if let Err(seconds) = limited {
        ApiError::rate_limited(seconds).into_response()
    } else if request
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok())
        .is_some_and(|n| n > MAX_BODY_BYTES)
    {
        ApiError::new(ErrorCode::InvalidRequest).into_response()
    } else {
        match tokio::time::timeout(HANDLER_TIMEOUT, next.run(request)).await {
            Ok(r) => r,
            Err(_) => ApiError::new(ErrorCode::WatcherUnavailable).into_response(),
        }
    };
    let status = response.status().as_u16();
    tracing::info!(route = %label, status, latency_ms = started.elapsed().as_millis() as u64, "request");
    finish(response, origin)
}

/// A body that fits the limit, read whole. A larger one is a bad request.
pub async fn read_body(body: Body) -> Result<axum::body::Bytes, ApiError> {
    axum::body::to_bytes(body, MAX_BODY_BYTES)
        .await
        .map_err(|_| ApiError::new(ErrorCode::InvalidRequest))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buckets_refill_and_report_a_wait() {
        let mut l = Limiter::default();
        let t0 = Instant::now();
        for _ in 0..10 {
            assert!(l.take("s:x".into(), SETUP, t0).is_ok());
        }
        let wait = l.take("s:x".into(), SETUP, t0).unwrap_err();
        assert!((1..=6).contains(&wait));
        assert!(
            l.take("s:x".into(), SETUP, t0 + Duration::from_secs(6))
                .is_ok()
        );
        assert!(
            l.take("s:other".into(), SETUP, t0).is_ok(),
            "buckets are per key"
        );
    }

    #[test]
    fn a_flood_of_fresh_keys_never_grows_the_limiter_past_its_cap() {
        let mut l = Limiter::default();
        let t0 = Instant::now();
        for i in 0..=MAX_BUCKETS + 1 {
            let _ = l.take(format!("d:{i}"), DESK, t0);
        }
        assert!(l.buckets.len() <= MAX_BUCKETS);
    }

    #[test]
    fn the_route_label_masks_ids() {
        assert_eq!(
            route_label(&Method::GET, "/v1/inbox/desk/tips/tip_abc"),
            "GET /v1/inbox/{id}/tips/{tip_id}"
        );
        assert_eq!(
            route_label(&Method::GET, "/v1/inbox/desk/tips"),
            "GET /v1/inbox/{id}/tips"
        );
        assert_eq!(route_label(&Method::POST, "/v1/inbox"), "POST /v1/inbox");
    }

    #[test]
    fn the_client_key_is_the_last_forwarded_hop() {
        let mut h = HeaderMap::new();
        h.insert(
            "x-forwarded-for",
            HeaderValue::from_static("1.1.1.1, 2.2.2.2"),
        );
        assert_eq!(client_key(&h, None), "2.2.2.2");
        assert_eq!(client_key(&HeaderMap::new(), None), "unknown");
    }
}
