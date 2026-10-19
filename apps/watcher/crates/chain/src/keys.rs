//! Registration checks for `POST /v1/inbox` that need the Zcash crates (contract §4.2, §6.3
//! checks 5 to 10, FR-11, BR-13, NFR-3). Nothing here stores or logs a key.

use zcash_keys::address::Address;
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_protocol::consensus::Network;

/// The first failing check, in the contract's order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyCheck {
    /// Check 5: a spending key, a seed phrase or any key with spend authority.
    SpendKey,
    /// Check 6: the viewing key or the address is for the other network.
    NetworkMismatch,
    /// Check 7: not a unified full viewing key.
    BadViewingKey,
    /// Check 8: not a unified address.
    BadAddress,
    /// Check 9: no Sapling or Orchard receiver (an Orchard receiver also receives Ironwood, B-29).
    NotShielded,
    /// Check 10: a shielded receiver of the address is not derived from the viewing key.
    AddressMismatch,
}

/// Prefixes and shapes that can spend, on either network (mirrors `apps/web/src/lib/viewingKey.ts`).
fn looks_spend_capable(input: &str) -> bool {
    let key = input.trim();
    let lower = key.to_ascii_lowercase();
    let words: Vec<&str> = key.split_whitespace().collect();
    let seed_phrase = (12..=24).contains(&words.len())
        && words
            .iter()
            .all(|w| w.bytes().all(|c| c.is_ascii_lowercase()));
    let base58 = |s: &str| {
        s.bytes()
            .all(|c| c.is_ascii_alphanumeric() && !b"0OIl".contains(&c))
    };
    let wif =
        (51..=52).contains(&key.len()) && key.starts_with(['5', 'K', 'L', 'c', '9']) && base58(key);
    seed_phrase
        || wif
        || lower.starts_with("secret-extended-key-")
        || lower.starts_with("uspend")
        || lower.starts_with("usk")
        || lower.starts_with("xprv")
        || lower.starts_with("tprv")
}

fn other(network: Network) -> Network {
    match network {
        Network::TestNetwork => Network::MainNetwork,
        Network::MainNetwork => Network::TestNetwork,
    }
}

/// Runs checks 5 to 10 of contract §6.3 in order and returns the decoded viewing key.
pub fn check_registration(
    network: Network,
    ufvk: &str,
    address: &str,
) -> Result<UnifiedFullViewingKey, KeyCheck> {
    // 5. Spend authority, for either network, before anything else.
    if looks_spend_capable(ufvk) {
        return Err(KeyCheck::SpendKey);
    }
    // 6. Network of both inputs.
    let key = UnifiedFullViewingKey::decode(&network, ufvk);
    if key.is_err() && UnifiedFullViewingKey::decode(&other(network), ufvk).is_ok() {
        return Err(KeyCheck::NetworkMismatch);
    }
    let decoded = Address::decode(&network, address);
    if decoded.is_none() && Address::decode(&other(network), address).is_some() {
        return Err(KeyCheck::NetworkMismatch);
    }
    // 7. A unified full viewing key.
    let key = key.map_err(|_| KeyCheck::BadViewingKey)?;
    // 8 and 9. A unified address. ZIP 316 gives every unified address a shielded receiver, so a
    // transparent address is where "no shielded receiver" really happens: it gets that code.
    let ua = match decoded {
        Some(Address::Unified(ua)) => ua,
        Some(Address::Transparent(_)) => return Err(KeyCheck::NotShielded),
        _ => return Err(KeyCheck::BadAddress),
    };
    // 9. At least one shielded receiver.
    if ua.orchard().is_none() && ua.sapling().is_none() {
        return Err(KeyCheck::NotShielded);
    }
    // 10. Every shielded receiver comes from this viewing key.
    if let Some(addr) = ua.orchard() {
        let ok = key
            .orchard()
            .is_some_and(|fvk| fvk.scope_for_address(addr).is_some());
        if !ok {
            return Err(KeyCheck::AddressMismatch);
        }
    }
    if let Some(addr) = ua.sapling() {
        let ok = key
            .sapling()
            .is_some_and(|dfvk| dfvk.decrypt_diversifier(addr).is_some());
        if !ok {
            return Err(KeyCheck::AddressMismatch);
        }
    }
    Ok(key)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use zcash_keys::keys::{UnifiedAddressRequest, UnifiedSpendingKey};

    /// A viewing key and its default shielded address, derived from a fixed test seed. The
    /// spending key exists only inside this function and is dropped at once.
    pub(crate) fn test_key(network: Network, seed_byte: u8) -> (String, String) {
        let usk =
            UnifiedSpendingKey::from_seed(&network, &[seed_byte; 32], 0u32.try_into().unwrap())
                .unwrap();
        let ufvk = usk.to_unified_full_viewing_key();
        let (ua, _) = ufvk
            .default_address(UnifiedAddressRequest::SHIELDED)
            .unwrap();
        (ufvk.encode(&network).unwrap(), ua.encode(&network))
    }

    const T: Network = Network::TestNetwork;

    #[test]
    fn a_matching_testnet_key_and_address_pass() {
        let (ufvk, ua) = test_key(T, 1);
        assert!(ufvk.starts_with("uviewtest1"));
        assert!(ua.starts_with("utest1"));
        assert!(check_registration(T, &ufvk, &ua).is_ok());
    }

    #[test]
    fn spend_capable_input_is_refused_first_even_for_the_other_network() {
        let (_, ua) = test_key(T, 1);
        for bad in [
            "secret-extended-key-test1qqqqqqqqqqqqqqqqqq",
            "secret-extended-key-main1qqqqqqqqqqqqqqqqqq",
            "abandon ability able about above absent absorb abstract absurd abuse access accident",
            "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi",
            "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn",
        ] {
            assert_eq!(
                check_registration(T, bad, &ua).err(),
                Some(KeyCheck::SpendKey),
                "{bad}"
            );
        }
    }

    #[test]
    fn the_other_network_is_refused() {
        let (main_ufvk, main_ua) = test_key(Network::MainNetwork, 1);
        let (test_ufvk, test_ua) = test_key(T, 1);
        assert_eq!(
            check_registration(T, &main_ufvk, &test_ua).err(),
            Some(KeyCheck::NetworkMismatch)
        );
        assert_eq!(
            check_registration(T, &test_ufvk, &main_ua).err(),
            Some(KeyCheck::NetworkMismatch)
        );
    }

    #[test]
    fn junk_keys_and_addresses_are_bad_requests() {
        let (ufvk, ua) = test_key(T, 1);
        assert_eq!(
            check_registration(T, "uviewtest1notakey", &ua).err(),
            Some(KeyCheck::BadViewingKey)
        );
        assert_eq!(
            check_registration(T, &ufvk, "utest1notanaddress").err(),
            Some(KeyCheck::BadAddress)
        );
    }

    #[test]
    fn a_transparent_address_has_no_shielded_receiver() {
        let (ufvk, _) = test_key(T, 1);
        // Base58Check of the testnet P2PKH prefix 0x1d25 and 20 zero bytes.
        let encoded = "tm9iMLAuYMzJ6jtFLcA7rzUmfreGuKvr7Ma";
        assert!(matches!(
            Address::decode(&T, encoded),
            Some(Address::Transparent(_))
        ));
        assert!(encoded.starts_with("tm"));
        assert_eq!(
            check_registration(T, &ufvk, encoded).err(),
            Some(KeyCheck::NotShielded)
        );
    }

    #[test]
    fn an_address_from_another_key_is_a_mismatch() {
        let (ufvk, _) = test_key(T, 1);
        let (_, other_ua) = test_key(T, 2);
        assert_eq!(
            check_registration(T, &ufvk, &other_ua).err(),
            Some(KeyCheck::AddressMismatch)
        );
    }
}
