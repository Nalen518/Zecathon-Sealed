//! Viewing key encryption at rest (rules §1.3, B-07). XChaCha20-Poly1305 with the 32-byte
//! `SEALED_DB_KEY`, a random 24-byte nonce, and the inbox id as associated data, so a sealed key
//! cannot be moved to another inbox row. Stored as `nonce || ciphertext`.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use zeroize::Zeroizing;

const NONCE_BYTES: usize = 24;
const AAD_PREFIX: &[u8] = b"sealed/ufvk/v1/";

/// The database key from `SEALED_DB_KEY`. Wiped from memory when dropped.
pub struct DbKey(Zeroizing<[u8; 32]>);

impl DbKey {
    pub fn new(bytes: [u8; 32]) -> Self {
        Self(Zeroizing::new(bytes))
    }

    fn cipher(&self) -> XChaCha20Poly1305 {
        XChaCha20Poly1305::new(&chacha20poly1305::Key::from(*self.0))
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SealError {
    #[error("random number generator failed")]
    Random,
    #[error("viewing key could not be encrypted")]
    Encrypt,
    #[error("viewing key could not be decrypted with this SEALED_DB_KEY")]
    Decrypt,
}

fn aad(inbox_id: &str) -> Vec<u8> {
    [AAD_PREFIX, inbox_id.as_bytes()].concat()
}

pub fn seal_ufvk(key: &DbKey, inbox_id: &str, ufvk: &str) -> Result<Vec<u8>, SealError> {
    let mut nonce = [0u8; NONCE_BYTES];
    getrandom::fill(&mut nonce).map_err(|_| SealError::Random)?;
    let aad = aad(inbox_id);
    let ct = key
        .cipher()
        .encrypt(
            &XNonce::from(nonce),
            Payload {
                msg: ufvk.as_bytes(),
                aad: &aad,
            },
        )
        .map_err(|_| SealError::Encrypt)?;
    Ok([nonce.as_slice(), &ct].concat())
}

pub fn open_ufvk(
    key: &DbKey,
    inbox_id: &str,
    sealed: &[u8],
) -> Result<Zeroizing<String>, SealError> {
    if sealed.len() < NONCE_BYTES {
        return Err(SealError::Decrypt);
    }
    let (nonce, ct) = sealed.split_at(NONCE_BYTES);
    let nonce: [u8; NONCE_BYTES] = nonce.try_into().map_err(|_| SealError::Decrypt)?;
    let aad = aad(inbox_id);
    let plain = Zeroizing::new(
        key.cipher()
            .decrypt(&XNonce::from(nonce), Payload { msg: ct, aad: &aad })
            .map_err(|_| SealError::Decrypt)?,
    );
    String::from_utf8(plain.to_vec())
        .map(Zeroizing::new)
        .map_err(|_| SealError::Decrypt)
}

#[cfg(test)]
mod tests {
    use super::*;

    const UFVK: &str = "uviewtest1example";

    #[test]
    fn round_trips_and_never_stores_the_key_in_clear() {
        let key = DbKey::new([7; 32]);
        let sealed = seal_ufvk(&key, "desk", UFVK).unwrap();
        assert!(!sealed.windows(UFVK.len()).any(|w| w == UFVK.as_bytes()));
        assert_eq!(open_ufvk(&key, "desk", &sealed).unwrap().as_str(), UFVK);
    }

    #[test]
    fn nonces_differ_between_seals() {
        let key = DbKey::new([7; 32]);
        assert_ne!(
            seal_ufvk(&key, "desk", UFVK).unwrap(),
            seal_ufvk(&key, "desk", UFVK).unwrap()
        );
    }

    #[test]
    fn a_wrong_key_another_inbox_or_a_flipped_bit_fails() {
        let key = DbKey::new([7; 32]);
        let sealed = seal_ufvk(&key, "desk", UFVK).unwrap();
        assert_eq!(
            open_ufvk(&DbKey::new([8; 32]), "desk", &sealed).err(),
            Some(SealError::Decrypt)
        );
        assert_eq!(
            open_ufvk(&key, "other", &sealed).err(),
            Some(SealError::Decrypt)
        );
        let mut flipped = sealed.clone();
        flipped[30] ^= 1;
        assert_eq!(
            open_ufvk(&key, "desk", &flipped).err(),
            Some(SealError::Decrypt)
        );
        assert_eq!(
            open_ufvk(&key, "desk", &sealed[..10]).err(),
            Some(SealError::Decrypt)
        );
    }
}
