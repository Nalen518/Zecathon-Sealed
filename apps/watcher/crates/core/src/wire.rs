//! Wire types of api-contract §5 and §6, `snake_case`, fields in the fixtures' order (rules §2.3).
//! Every type also deserializes with unknown fields refused, so the fixtures round-trip exactly.

use serde::{Deserialize, Serialize};

use crate::audit::Entry;

/// `network` on the wire (§4.1, C-9).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Network {
    Test,
    Main,
}

/// §5.1, public. Never holds the viewing key, token hashes or anything about senders.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Inbox {
    pub id: String,
    pub name: String,
    pub network: Network,
    pub address: String,
    pub desk_public_key: String,
    pub fingerprint: String,
    pub tip_floor_zat: u64,
    pub created_at: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChainStateWire {
    Pending,
    Confirmed,
    Orphaned,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DisplayStatusWire {
    Orphaned,
    Unreadable,
    BelowFloor,
    Pending,
    Confirmed,
}

impl From<crate::status::ChainState> for ChainStateWire {
    fn from(s: crate::status::ChainState) -> Self {
        use crate::status::ChainState as C;
        match s {
            C::Pending => Self::Pending,
            C::Confirmed => Self::Confirmed,
            C::Orphaned => Self::Orphaned,
        }
    }
}

impl From<crate::status::DisplayStatus> for DisplayStatusWire {
    fn from(s: crate::status::DisplayStatus) -> Self {
        use crate::status::DisplayStatus as D;
        match s {
            D::Orphaned => Self::Orphaned,
            D::Unreadable => Self::Unreadable,
            D::BelowFloor => Self::BelowFloor,
            D::Pending => Self::Pending,
            D::Confirmed => Self::Confirmed,
        }
    }
}

/// §5.2, desk token only. `height`, `block_time_at` and `confirmations` are never null in v1
/// (C-15) but stay nullable on the wire.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Tip {
    pub id: String,
    pub seq: u64,
    pub txid: String,
    pub output_index: u32,
    pub height: Option<u64>,
    pub block_time_at: Option<String>,
    pub seen_at: String,
    pub amount_zat: u64,
    pub confirmations: Option<u32>,
    pub chain_state: ChainStateWire,
    pub below_floor: bool,
    pub format_ok: bool,
    pub display_status: DisplayStatusWire,
    pub memo_b64: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Counts {
    pub visible: u64,
    pub below_floor: u64,
}

/// §6.5 response.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TipsPage {
    pub tips: Vec<Tip>,
    pub next_seq: u64,
    pub has_more: bool,
    pub counts: Counts,
}

/// One chain server in §5.4. `origin` is scheme, host and port only (C-14).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HealthSource {
    pub origin: String,
    pub ok: bool,
    pub tip_height: Option<u64>,
    pub lag_blocks: Option<u64>,
    pub last_checked_at: Option<String>,
}

/// §5.4, public. Always answered with 200 (C-18).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Health {
    pub network: Network,
    pub tip_height: u64,
    pub lag_blocks: u64,
    pub sources: Vec<HealthSource>,
    pub version: String,
}

/// §6.4 response. The token appears only here, once.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IssuedToken {
    pub token: String,
    pub created_at: String,
}

/// §6.10 response.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct AuditPage {
    pub entries: Vec<Entry>,
    pub next_seq: u64,
    pub has_more: bool,
    pub total: u64,
}

/// §5.5 error codes, exactly the contract's list.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidRequest,
    Unauthorized,
    Forbidden,
    NotFound,
    InboxExists,
    SpendKeyRejected,
    NetworkMismatch,
    AddressMismatch,
    AddressNotShielded,
    FingerprintMismatch,
    FloorOutOfRange,
    RateLimited,
    WatcherUnavailable,
}

impl ErrorCode {
    /// HTTP status for each code (§5.5).
    pub fn status(self) -> u16 {
        match self {
            Self::InvalidRequest => 400,
            Self::Unauthorized => 401,
            Self::Forbidden => 403,
            Self::NotFound => 404,
            Self::InboxExists => 409,
            Self::SpendKeyRejected
            | Self::NetworkMismatch
            | Self::AddressMismatch
            | Self::AddressNotShielded
            | Self::FingerprintMismatch
            | Self::FloorOutOfRange => 422,
            Self::RateLimited => 429,
            Self::WatcherUnavailable => 503,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ErrorDetail {
    pub code: ErrorCode,
    pub message: String,
    /// Left out when no single field is at fault (C-22).
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub field: Option<String>,
}

/// §5.5 error body.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::de::DeserializeOwned;

    /// Parses the fixture into the Rust type, writes it back, and requires the exact bytes of the
    /// fixture file (line endings normalized, since git may check files out with CRLF).
    fn round_trip<T: DeserializeOwned + Serialize>(text: &str) {
        let value: T = serde_json::from_str(text).unwrap();
        let written = serde_json::to_string_pretty(&value).unwrap() + "\n";
        assert_eq!(written, text.replace("\r\n", "\n"));
    }

    #[test]
    fn fixtures_round_trip_byte_for_byte() {
        round_trip::<Inbox>(include_str!("../../../../../contracts/fixtures/inbox.json"));
        round_trip::<Tip>(include_str!("../../../../../contracts/fixtures/tip.json"));
        round_trip::<TipsPage>(include_str!(
            "../../../../../contracts/fixtures/tips_page.json"
        ));
        round_trip::<Health>(include_str!(
            "../../../../../contracts/fixtures/health.json"
        ));
        round_trip::<IssuedToken>(include_str!("../../../../../contracts/fixtures/token.json"));
        round_trip::<ErrorBody>(include_str!(
            "../../../../../contracts/fixtures/error_spend_key.json"
        ));
    }

    #[test]
    fn audit_page_serializes_like_the_fixture() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../contracts/fixtures/audit_chain.json"
        ))
        .unwrap();
        let page = &fixture["page"];
        let entries: Vec<Entry> = page["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| Entry {
                seq: e["seq"].as_u64().unwrap(),
                at: e["at"].as_str().unwrap().into(),
                kind: e["type"].as_str().unwrap().into(),
                actor: e["actor"].as_str().unwrap().into(),
                details: e["details"].clone(),
                prev_hash: e["prev_hash"].as_str().unwrap().into(),
                hash: e["hash"].as_str().unwrap().into(),
            })
            .collect();
        let built = AuditPage {
            entries,
            next_seq: 3,
            has_more: false,
            total: 3,
        };
        assert_eq!(&serde_json::to_value(&built).unwrap(), page);
    }

    #[test]
    fn unknown_fields_are_refused() {
        assert!(serde_json::from_str::<Inbox>(r#"{"id":"desk","extra":1}"#).is_err());
    }

    #[test]
    fn error_field_is_left_out_when_none() {
        let body = ErrorBody {
            error: ErrorDetail {
                code: ErrorCode::RateLimited,
                message: "slow down".into(),
                field: None,
            },
        };
        assert_eq!(
            serde_json::to_string(&body).unwrap(),
            r#"{"error":{"code":"rate_limited","message":"slow down"}}"#
        );
    }

    #[test]
    fn every_error_code_has_its_contract_status() {
        use ErrorCode::*;
        let table = [
            (InvalidRequest, 400, "invalid_request"),
            (Unauthorized, 401, "unauthorized"),
            (Forbidden, 403, "forbidden"),
            (NotFound, 404, "not_found"),
            (InboxExists, 409, "inbox_exists"),
            (SpendKeyRejected, 422, "spend_key_rejected"),
            (NetworkMismatch, 422, "network_mismatch"),
            (AddressMismatch, 422, "address_mismatch"),
            (AddressNotShielded, 422, "address_not_shielded"),
            (FingerprintMismatch, 422, "fingerprint_mismatch"),
            (FloorOutOfRange, 422, "floor_out_of_range"),
            (RateLimited, 429, "rate_limited"),
            (WatcherUnavailable, 503, "watcher_unavailable"),
        ];
        for (code, status, name) in table {
            assert_eq!(code.status(), status);
            assert_eq!(serde_json::to_value(code).unwrap(), name);
        }
    }
}
