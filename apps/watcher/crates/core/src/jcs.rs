//! RFC 8785 canonical JSON for the contract's subset (api-contract §5.6, D-59, B-15).
//!
//! Inside the subset (integers 0 to 2^53 - 1, strings without control characters, ASCII
//! `[a-z_]` keys) TypeScript and Rust produce the same bytes. Anything outside it is refused
//! instead of guessed, on both sides.

use serde_json::Value;

/// Largest integer both sides represent exactly (2^53 - 1).
pub const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum CanonicalError {
    #[error("value outside the canonical form rules at {0}")]
    Form(String),
    #[error("canonical JSON could not be written")]
    Write,
}

/// Canonical form of `value`, after checking every canonical form rule of §5.6.
pub fn canonical(value: &Value) -> Result<String, CanonicalError> {
    check(value, "$")?;
    serde_json_canonicalizer::to_string(value).map_err(|_| CanonicalError::Write)
}

fn check(value: &Value, path: &str) -> Result<(), CanonicalError> {
    let fail = || Err(CanonicalError::Form(path.to_owned()));
    match value {
        Value::Null | Value::Bool(_) => Ok(()),
        Value::Number(n) => match n.as_u64() {
            Some(v) if v <= MAX_SAFE_INTEGER => Ok(()),
            _ => fail(),
        },
        // A Rust `str` is always valid Unicode, so lone surrogates cannot occur.
        Value::String(s) => {
            if s.chars().any(|c| c <= '\u{1F}') {
                fail()
            } else {
                Ok(())
            }
        }
        Value::Array(items) => items
            .iter()
            .enumerate()
            .try_for_each(|(i, v)| check(v, &format!("{path}[{i}]"))),
        Value::Object(map) => map.iter().try_for_each(|(k, v)| {
            let key_path = format!("{path}.{k}");
            if k.is_empty() || !k.bytes().all(|b| b.is_ascii_lowercase() || b == b'_') {
                return Err(CanonicalError::Form(key_path));
            }
            check(v, &key_path)
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const AUDIT: &str = include_str!("../../../../../contracts/fixtures/audit_chain.json");

    #[test]
    fn matches_the_shared_canonical_vectors() {
        let fixture: Value = serde_json::from_str(AUDIT).unwrap();
        let vectors = fixture["canonical_vectors"].as_array().unwrap();
        assert!(!vectors.is_empty());
        for v in vectors {
            assert_eq!(
                canonical(&v["input"]).unwrap(),
                v["canonical"].as_str().unwrap()
            );
        }
    }

    #[test]
    fn refuses_floats_negatives_and_large_integers() {
        assert!(canonical(&json!({ "a": 1.5 })).is_err());
        assert!(canonical(&json!({ "a": -1 })).is_err());
        assert!(canonical(&json!({ "a": MAX_SAFE_INTEGER + 1 })).is_err());
        assert!(canonical(&json!({ "a": MAX_SAFE_INTEGER })).is_ok());
    }

    #[test]
    fn refuses_control_characters_and_odd_keys() {
        assert!(canonical(&json!({ "a": "line\nbreak" })).is_err());
        assert!(canonical(&json!({ "A": 1 })).is_err());
        assert!(canonical(&json!({ "a1": 1 })).is_err());
        assert!(canonical(&json!({ "é": 1 })).is_err());
        assert_eq!(canonical(&json!([{ "b": "x" }])).unwrap(), r#"[{"b":"x"}]"#);
        assert_eq!(
            canonical(&json!([{ "B": 1 }])),
            Err(CanonicalError::Form("$[0].B".to_owned()))
        );
    }
}
