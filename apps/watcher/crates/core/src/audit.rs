//! Audit trail hash chain (api-contract §5.6, §6.10, C-13, C-14; FR-20, T-11).
//!
//! ```text
//! hash      = lower_hex( BLAKE2b-256( UTF-8( JCS( entry without "hash" ) ) ) )
//! prev_hash = hash of the entry with seq - 1, 64 zeros for seq 1
//! ```
//! The server refuses, and never stores, an entry that breaks a canonical form rule.

use blake2::{Blake2b, Digest, digest::consts::U32};
use serde::Serialize;
use serde_json::{Map, Value, json};

use crate::jcs::{CanonicalError, canonical};

/// `prev_hash` of the entry with `seq` 1.
pub const GENESIS_HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

/// Who caused the event (§5.6).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Actor {
    Setup,
    Desk,
    Watcher,
}

impl Actor {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Setup => "setup",
            Self::Desk => "desk",
            Self::Watcher => "watcher",
        }
    }
}

/// Every event type of §5.6 with exactly its `details` fields, all present and never null.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Event {
    InboxCreated {
        fingerprint: String,
        tip_floor_zat: u64,
        network: String,
        birthday_height: u64,
    },
    TokenIssued {
        token_id: String,
        rotated: bool,
    },
    FloorChanged {
        from_zat: u64,
        to_zat: u64,
    },
    TipReceived {
        tip_id: String,
        txid: String,
        output_index: u64,
        amount_zat: u64,
        height: u64,
        format_ok: bool,
    },
    TipConfirmed {
        tip_id: String,
        txid: String,
        confirmations: u64,
    },
    TipOrphaned {
        tip_id: String,
        txid: String,
        height: u64,
    },
    SourceDown {
        origin: String,
    },
    SourceUp {
        origin: String,
    },
}

impl Event {
    pub fn type_name(&self) -> &'static str {
        match self {
            Self::InboxCreated { .. } => "inbox_created",
            Self::TokenIssued { .. } => "token_issued",
            Self::FloorChanged { .. } => "floor_changed",
            Self::TipReceived { .. } => "tip_received",
            Self::TipConfirmed { .. } => "tip_confirmed",
            Self::TipOrphaned { .. } => "tip_orphaned",
            Self::SourceDown { .. } => "source_down",
            Self::SourceUp { .. } => "source_up",
        }
    }

    fn details(&self) -> Value {
        match self {
            Self::InboxCreated {
                fingerprint,
                tip_floor_zat,
                network,
                birthday_height,
            } => json!({
                "fingerprint": fingerprint, "tip_floor_zat": tip_floor_zat,
                "network": network, "birthday_height": birthday_height,
            }),
            Self::TokenIssued { token_id, rotated } => {
                json!({ "token_id": token_id, "rotated": rotated })
            }
            Self::FloorChanged { from_zat, to_zat } => {
                json!({ "from_zat": from_zat, "to_zat": to_zat })
            }
            Self::TipReceived {
                tip_id,
                txid,
                output_index,
                amount_zat,
                height,
                format_ok,
            } => json!({
                "tip_id": tip_id, "txid": txid, "output_index": output_index,
                "amount_zat": amount_zat, "height": height, "format_ok": format_ok,
            }),
            Self::TipConfirmed {
                tip_id,
                txid,
                confirmations,
            } => {
                json!({ "tip_id": tip_id, "txid": txid, "confirmations": confirmations })
            }
            Self::TipOrphaned {
                tip_id,
                txid,
                height,
            } => json!({ "tip_id": tip_id, "txid": txid, "height": height }),
            Self::SourceDown { origin } | Self::SourceUp { origin } => json!({ "origin": origin }),
        }
    }

    fn origin(&self) -> Option<&str> {
        match self {
            Self::SourceDown { origin } | Self::SourceUp { origin } => Some(origin),
            _ => None,
        }
    }
}

/// One entry exactly as stored and served, fields in the fixture's order.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Entry {
    pub seq: u64,
    pub at: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub actor: String,
    pub details: Value,
    pub prev_hash: String,
    pub hash: String,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AuditError {
    #[error(transparent)]
    Canonical(#[from] CanonicalError),
    #[error("audit time must be YYYY-MM-DDTHH:MM:SSZ")]
    Time,
    #[error("chain server must be named by its origin only")]
    Origin,
    #[error("prev_hash must be 64 lower-case hex characters")]
    PrevHash,
    #[error("seq starts at 1")]
    Seq,
}

/// BLAKE2b-256 as lower-case hex.
fn blake2b_hex(bytes: &[u8]) -> String {
    Blake2b::<U32>::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// `token_id` in `token_issued`: first 8 hex characters of BLAKE2b-256 of the token (§5.6).
pub fn token_id(token: &str) -> String {
    blake2b_hex(token.as_bytes())[..8].to_owned()
}

/// Builds the next entry and its hash. Refuses anything that breaks a canonical form rule.
pub fn seal(
    seq: u64,
    at: &str,
    actor: Actor,
    event: &Event,
    prev_hash: &str,
) -> Result<Entry, AuditError> {
    if seq == 0 {
        return Err(AuditError::Seq);
    }
    if !is_audit_time(at) {
        return Err(AuditError::Time);
    }
    if !is_hex64(prev_hash) {
        return Err(AuditError::PrevHash);
    }
    if event.origin().is_some_and(|o| !is_origin_only(o)) {
        return Err(AuditError::Origin);
    }
    let mut entry = Entry {
        seq,
        at: at.to_owned(),
        kind: event.type_name().to_owned(),
        actor: actor.as_str().to_owned(),
        details: event.details(),
        prev_hash: prev_hash.to_owned(),
        hash: String::new(),
    };
    let raw = serde_json::to_value(&entry).map_err(|_| CanonicalError::Write)?;
    entry.hash = entry_hash(&raw)?;
    Ok(entry)
}

/// Hash of a raw entry over every field except `hash`, exactly as the browser computes it.
pub fn entry_hash(raw: &Value) -> Result<String, CanonicalError> {
    let body = match raw {
        Value::Object(map) => {
            let mut body: Map<String, Value> = map.clone();
            body.remove("hash");
            Value::Object(body)
        }
        _ => return Err(CanonicalError::Form("$".to_owned())),
    };
    Ok(blake2b_hex(canonical(&body)?.as_bytes()))
}

/// Why a chain check stopped (same four reasons as the browser).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Break {
    Form,
    Gap,
    Link,
    Hash,
}

/// Checks a whole chain from `seq` 1, as the Audit trail page does. Returns the first broken
/// `seq` and why. Used by the server's own tests and by T-11.
pub fn verify_chain(entries: &[Value]) -> Result<(), (u64, Break)> {
    let mut prev = GENESIS_HASH.to_owned();
    for (i, e) in entries.iter().enumerate() {
        let expected_seq = i as u64 + 1;
        let seq = e.get("seq").and_then(Value::as_u64).unwrap_or(expected_seq);
        if !form_ok(e) {
            return Err((seq, Break::Form));
        }
        if seq != expected_seq {
            return Err((seq, Break::Gap));
        }
        if e["prev_hash"].as_str() != Some(prev.as_str()) {
            return Err((seq, Break::Link));
        }
        let Ok(hash) = entry_hash(e) else {
            return Err((seq, Break::Form));
        };
        if e["hash"].as_str() != Some(hash.as_str()) {
            return Err((seq, Break::Hash));
        }
        prev = hash;
    }
    Ok(())
}

fn form_ok(e: &Value) -> bool {
    let Some(map) = e.as_object() else {
        return false;
    };
    let fields = ["actor", "at", "details", "hash", "prev_hash", "seq", "type"];
    if map.len() != fields.len() || !fields.iter().all(|f| map.contains_key(*f)) {
        return false;
    }
    let str_of = |k: &str| map.get(k).and_then(Value::as_str);
    if canonical(e).is_err()
        || map.get("seq").and_then(Value::as_u64).is_none()
        || !str_of("at").is_some_and(is_audit_time)
        || !str_of("actor").is_some_and(|a| ["setup", "desk", "watcher"].contains(&a))
        || !str_of("prev_hash").is_some_and(is_hex64)
        || !str_of("hash").is_some_and(is_hex64)
    {
        return false;
    }
    let Some(details) = map.get("details").and_then(Value::as_object) else {
        return false;
    };
    let expected: &[&str] = match str_of("type") {
        Some("inbox_created") => &["birthday_height", "fingerprint", "network", "tip_floor_zat"],
        Some("token_issued") => &["rotated", "token_id"],
        Some("floor_changed") => &["from_zat", "to_zat"],
        Some("tip_received") => &[
            "amount_zat",
            "format_ok",
            "height",
            "output_index",
            "tip_id",
            "txid",
        ],
        Some("tip_confirmed") => &["confirmations", "tip_id", "txid"],
        Some("tip_orphaned") => &["height", "tip_id", "txid"],
        Some("source_down" | "source_up") => &["origin"],
        Some(_) => return true,
        None => return false,
    };
    let mut keys: Vec<&str> = details.keys().map(String::as_str).collect();
    keys.sort_unstable();
    if keys != expected || details.values().any(Value::is_null) {
        return false;
    }
    details
        .get("origin")
        .is_none_or(|o| o.as_str().is_some_and(is_origin_only))
}

/// `YYYY-MM-DDTHH:MM:SSZ`, UTC, no fraction (§5.6).
pub fn is_audit_time(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 20
        && b.iter().enumerate().all(|(i, c)| match i {
            4 | 7 => *c == b'-',
            10 => *c == b'T',
            13 | 16 => *c == b':',
            19 => *c == b'Z',
            _ => c.is_ascii_digit(),
        })
}

fn is_hex64(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

/// Scheme, host and port only: no user name, password, path, query or fragment (C-14).
pub fn is_origin_only(s: &str) -> bool {
    let Some(rest) = s
        .strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"))
    else {
        return false;
    };
    let Some((host, port)) = rest.rsplit_once(':') else {
        return false;
    };
    !host.is_empty()
        && host
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-')
        && !port.is_empty()
        && port.len() <= 5
        && port.bytes().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    const CHAIN: &str = include_str!("../../../../../contracts/fixtures/audit_chain.json");
    const TAMPERED: &str =
        include_str!("../../../../../contracts/fixtures/audit_chain_tampered.json");

    fn entries(src: &str) -> Vec<Value> {
        let v: Value = serde_json::from_str(src).unwrap();
        v["page"]["entries"].as_array().unwrap().clone()
    }

    #[test]
    fn fixture_hashes_match_byte_for_byte() {
        let fixture: Value = serde_json::from_str(CHAIN).unwrap();
        let expected = fixture["expected"]["hashes"].as_array().unwrap();
        for (e, want) in entries(CHAIN).iter().zip(expected) {
            assert_eq!(entry_hash(e).unwrap(), want.as_str().unwrap());
        }
        assert_eq!(verify_chain(&entries(CHAIN)), Ok(()));
    }

    #[test]
    fn canonical_vector_hashes_match() {
        let fixture: Value = serde_json::from_str(CHAIN).unwrap();
        for v in fixture["canonical_vectors"].as_array().unwrap() {
            let bytes = canonical(&v["input"]).unwrap();
            assert_eq!(
                blake2b_hex(bytes.as_bytes()),
                v["blake2b_256"].as_str().unwrap()
            );
        }
    }

    #[test]
    fn t11_tampered_entry_breaks_at_two() {
        assert_eq!(verify_chain(&entries(TAMPERED)), Err((2, Break::Hash)));
    }

    #[test]
    fn sealing_reproduces_the_fixture_chain_and_its_serialization() {
        let e = entries(CHAIN);
        let one = seal(
            1,
            "2026-10-09T11:00:00Z",
            Actor::Setup,
            &Event::InboxCreated {
                fingerprint: "CB2F5160FC1F7E05".into(),
                tip_floor_zat: 50_000,
                network: "test".into(),
                birthday_height: 4_198_000,
            },
            GENESIS_HASH,
        )
        .unwrap();
        let two = seal(
            2,
            "2026-10-09T11:02:00Z",
            Actor::Setup,
            &Event::TokenIssued {
                token_id: "a1b2c3d4".into(),
                rotated: false,
            },
            &one.hash,
        )
        .unwrap();
        let three = seal(
            3,
            "2026-10-12T14:02:11Z",
            Actor::Watcher,
            &Event::TipReceived {
                tip_id: "tip_01HF0000000000000000000000".into(),
                txid: "3f9a00000000000000000000000000000000000000000000000000000000c21e".into(),
                output_index: 0,
                amount_zat: 100_000,
                height: 4_201_337,
                format_ok: true,
            },
            &two.hash,
        )
        .unwrap();
        for (built, want) in [one, two, three].iter().zip(&e) {
            assert_eq!(&serde_json::to_value(built).unwrap(), want);
        }
    }

    #[test]
    fn a_gap_a_bad_link_and_a_bad_form_are_breaks() {
        let mut e = entries(CHAIN);
        e.remove(1);
        assert_eq!(verify_chain(&e), Err((3, Break::Gap)));

        let mut e = entries(CHAIN);
        e[1]["prev_hash"] = Value::String(GENESIS_HASH.into());
        assert_eq!(verify_chain(&e), Err((2, Break::Link)));

        let mut e = entries(CHAIN);
        e[0]["details"]["network"] = Value::Null;
        assert_eq!(verify_chain(&e), Err((1, Break::Form)));
    }

    #[test]
    fn seal_refuses_entries_that_break_the_rules() {
        let down = |origin: &str| Event::SourceDown {
            origin: origin.into(),
        };
        let at = "2026-10-13T08:00:00Z";
        assert!(
            seal(
                1,
                at,
                Actor::Watcher,
                &down("https://testnet.zec.rocks:443"),
                GENESIS_HASH
            )
            .is_ok()
        );
        assert_eq!(
            seal(
                1,
                at,
                Actor::Watcher,
                &down("https://user:pw@testnet.zec.rocks:443"),
                GENESIS_HASH
            ),
            Err(AuditError::Origin)
        );
        assert_eq!(
            seal(
                1,
                at,
                Actor::Watcher,
                &down("https://testnet.zec.rocks:443/path"),
                GENESIS_HASH
            ),
            Err(AuditError::Origin)
        );
        assert_eq!(
            seal(
                1,
                "2026-10-13T08:00:00.5Z",
                Actor::Watcher,
                &down("https://a.b:443"),
                GENESIS_HASH
            ),
            Err(AuditError::Time)
        );
        assert_eq!(
            seal(
                0,
                at,
                Actor::Watcher,
                &down("https://a.b:443"),
                GENESIS_HASH
            ),
            Err(AuditError::Seq)
        );
        assert_eq!(
            seal(1, at, Actor::Watcher, &down("https://a.b:443"), "xyz"),
            Err(AuditError::PrevHash)
        );
    }

    #[test]
    fn token_id_is_eight_hex_of_the_token_hash() {
        let id = token_id("sld_example");
        assert_eq!(id.len(), 8);
        assert!(id.bytes().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(id, blake2b_hex(b"sld_example")[..8]);
    }
}
