//! Contract errors (§5.5). Every failure maps here, in one place (rules §7.2). Messages are fixed
//! text for logs and curl users: no stack trace, path, SQL or input value ever reaches a response.

use axum::Json;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use sealed_core::wire::{ErrorBody, ErrorCode, ErrorDetail};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiError {
    pub code: ErrorCode,
    pub field: Option<&'static str>,
    pub retry_after: Option<u64>,
}

impl ApiError {
    pub fn new(code: ErrorCode) -> Self {
        Self {
            code,
            field: None,
            retry_after: None,
        }
    }
    pub fn field(code: ErrorCode, field: &'static str) -> Self {
        Self {
            code,
            field: Some(field),
            retry_after: None,
        }
    }
    pub fn rate_limited(seconds: u64) -> Self {
        Self {
            code: ErrorCode::RateLimited,
            field: None,
            retry_after: Some(seconds),
        }
    }
    pub fn bad(field: &'static str) -> Self {
        Self::field(ErrorCode::InvalidRequest, field)
    }
}

fn message(code: ErrorCode) -> &'static str {
    match code {
        ErrorCode::InvalidRequest => "The request is not valid.",
        ErrorCode::Unauthorized => "A current desk token is required.",
        ErrorCode::Forbidden => "The setup secret is missing or wrong.",
        ErrorCode::NotFound => "Not found.",
        ErrorCode::InboxExists => "An inbox already exists.",
        ErrorCode::SpendKeyRejected => "This key can spend funds.",
        ErrorCode::NetworkMismatch => "This key or address is for the other network.",
        ErrorCode::AddressMismatch => "The address is not derived from this viewing key.",
        ErrorCode::AddressNotShielded => "The address has no shielded receiver.",
        ErrorCode::FingerprintMismatch => "The fingerprint does not match the public key.",
        ErrorCode::FloorOutOfRange => "The tip floor must be from 10000 to 100000000 zatoshis.",
        ErrorCode::RateLimited => "Too many requests.",
        ErrorCode::WatcherUnavailable => "The watcher cannot reach the chain right now.",
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = StatusCode::from_u16(self.code.status()).unwrap_or(StatusCode::BAD_REQUEST);
        let body = ErrorBody {
            error: ErrorDetail {
                code: self.code,
                message: message(self.code).to_owned(),
                field: self.field.map(str::to_owned),
            },
        };
        let mut response = (status, Json(body)).into_response();
        if let Some(seconds) = self.retry_after
            && let Ok(v) = HeaderValue::from_str(&seconds.to_string())
        {
            response.headers_mut().insert(header::RETRY_AFTER, v);
        }
        response
    }
}

/// A storage failure has no code of its own in the contract. It answers 503 with
/// `watcher_unavailable`, the contract's "service cannot serve this now", and is logged without
/// detail. See backend B-32.
impl From<sealed_store::StoreError> for ApiError {
    fn from(e: sealed_store::StoreError) -> Self {
        match e {
            sealed_store::StoreError::NotFound => Self::new(ErrorCode::NotFound),
            sealed_store::StoreError::InboxExists => Self::new(ErrorCode::InboxExists),
            _ => {
                tracing::error!("storage failure");
                Self::new(ErrorCode::WatcherUnavailable)
            }
        }
    }
}
