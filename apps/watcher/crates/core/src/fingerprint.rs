//! Desk key fingerprint (api-contract §4.3, C-7):
//! `upper_hex(BLAKE2b-256(desk_public_key_bytes))[0..16]`.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use blake2::{Blake2b, Digest, digest::consts::U32};

/// Length of a desk public key (libsodium `crypto_box` public key).
pub const DESK_PUBLIC_KEY_BYTES: usize = 32;

/// The 16 upper-case hex characters sent on the wire, without spaces.
pub fn fingerprint(desk_public_key: &[u8; DESK_PUBLIC_KEY_BYTES]) -> String {
    let digest = Blake2b::<U32>::digest(desk_public_key);
    digest[..8].iter().map(|b| format!("{b:02X}")).collect()
}

/// Decodes a desk public key from standard base64 with padding. `None` unless it is exactly
/// 32 bytes (§4.2).
pub fn decode_desk_public_key(b64: &str) -> Option<[u8; DESK_PUBLIC_KEY_BYTES]> {
    STANDARD.decode(b64).ok()?.try_into().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const FIXTURE: &str = include_str!("../../../../../contracts/fixtures/fingerprint.json");

    #[test]
    fn matches_every_shared_vector() {
        let fixture: Value = serde_json::from_str(FIXTURE).unwrap();
        let vectors = fixture["vectors"].as_array().unwrap();
        assert!(!vectors.is_empty());
        for v in vectors {
            let key = decode_desk_public_key(v["desk_public_key"].as_str().unwrap()).unwrap();
            assert_eq!(fingerprint(&key), v["fingerprint"].as_str().unwrap());
        }
    }

    #[test]
    fn rejects_keys_that_are_not_32_bytes() {
        assert!(decode_desk_public_key("AAEC").is_none());
        assert!(decode_desk_public_key("not base64!").is_none());
        // 33 bytes
        assert!(decode_desk_public_key("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8g").is_none());
    }
}
