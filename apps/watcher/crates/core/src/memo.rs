//! Memo rules (api-contract §4.4, C-16; FR-19). The server never decrypts a memo.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;

/// Zcash memo size (ZIP 302).
pub const MEMO_BYTES: usize = 512;
/// Text memo prefix.
pub const PREFIX: &[u8] = b"z1:";
/// Standard base64 of the 381-byte sealed box.
pub const SEALED_B64_BYTES: usize = 508;
/// `crypto_box_seal` output for the 333-byte plaintext block.
pub const SEALED_BOX_BYTES: usize = 381;
/// ZIP 302 "no memo" first byte.
pub const NO_MEMO: u8 = 0xF6;

/// `format_ok`: starts with `z1:` and the next 508 bytes are valid standard base64 decoding to
/// 381 bytes (§4.4). A missing memo is never format_ok (C-16).
pub fn format_ok(memo: &[u8; MEMO_BYTES]) -> bool {
    let Some(rest) = memo.strip_prefix(PREFIX) else {
        return false;
    };
    let body = &rest[..SEALED_B64_BYTES];
    STANDARD
        .decode(body)
        .is_ok_and(|bytes| bytes.len() == SEALED_BOX_BYTES)
}

/// `memo_b64` on the wire: base64 of the 512 raw bytes as received, or `None` for the ZIP 302
/// "no memo" value (C-16).
pub fn memo_b64(memo: &[u8; MEMO_BYTES]) -> Option<String> {
    (memo[0] != NO_MEMO).then(|| STANDARD.encode(memo))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const TIP: &str = include_str!("../../../../../contracts/fixtures/tip.json");

    fn fixture_memo() -> [u8; MEMO_BYTES] {
        let tip: Value = serde_json::from_str(TIP).unwrap();
        STANDARD
            .decode(tip["memo_b64"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap()
    }

    fn with(text: &[u8]) -> [u8; MEMO_BYTES] {
        let mut m = [0u8; MEMO_BYTES];
        m[..text.len()].copy_from_slice(text);
        m
    }

    #[test]
    fn the_fixture_memo_is_format_ok_and_round_trips() {
        let memo = fixture_memo();
        assert!(format_ok(&memo));
        let tip: Value = serde_json::from_str(TIP).unwrap();
        assert_eq!(memo_b64(&memo).as_deref(), tip["memo_b64"].as_str());
    }

    #[test]
    fn a_plain_text_memo_is_unreadable() {
        assert!(!format_ok(&with(b"hello desk, this is a plain memo")));
    }

    #[test]
    fn a_missing_memo_is_null_and_unreadable() {
        let none = with(&[NO_MEMO]);
        assert!(!format_ok(&none));
        assert_eq!(memo_b64(&none), None);
    }

    #[test]
    fn a_wrong_prefix_or_broken_base64_is_unreadable() {
        let mut memo = fixture_memo();
        memo[1] = b'2';
        assert!(!format_ok(&memo));

        let mut memo = fixture_memo();
        memo[100] = b'*';
        assert!(!format_ok(&memo));
    }

    #[test]
    fn base64_that_is_too_short_is_unreadable() {
        // 504 valid base64 characters, then padding zeros: decodes to 378 bytes, not 381.
        let mut text = b"z1:".to_vec();
        text.extend(std::iter::repeat_n(b'A', 504));
        assert!(!format_ok(&with(&text)));
    }
}
