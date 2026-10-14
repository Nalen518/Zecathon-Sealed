//! Small pure rules the watcher needs: output numbering across pools (B-27) and UTC times in the
//! contract's text form (§4.1, §5.6). No I/O.

/// Shielded pool of a received output.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pool {
    Sapling,
    Orchard,
    Ironwood,
}

/// `output_index` on the wire: the output's position across every shielded output of the
/// transaction, counted Sapling outputs first, then Orchard actions, then Ironwood actions, each in
/// its order within its bundle (B-27). Keeps txid + output_index unique when one transaction pays
/// the desk in two pools (FR-13).
pub fn output_index(
    pool: Pool,
    index_in_bundle: usize,
    sapling_outputs: usize,
    orchard_actions: usize,
) -> usize {
    match pool {
        Pool::Sapling => index_in_bundle,
        Pool::Orchard => sapling_outputs + index_in_bundle,
        Pool::Ironwood => sapling_outputs + orchard_actions + index_in_bundle,
    }
}

/// `YYYY-MM-DDTHH:MM:SSZ` for a Unix time in seconds (UTC, no fraction). Valid for the years
/// 1970 to 9999, which covers every block time.
pub fn utc_text(unix_seconds: u64) -> String {
    let days = (unix_seconds / 86_400) as i64;
    let secs = unix_seconds % 86_400;
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        secs / 3_600,
        secs % 3_600 / 60,
        secs % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audit::is_audit_time;

    #[test]
    fn outputs_are_numbered_sapling_then_orchard_then_ironwood() {
        // 2 Sapling outputs, 1 Orchard action, 2 Ironwood actions: 0 1 | 2 | 3 4
        assert_eq!(output_index(Pool::Sapling, 0, 2, 1), 0);
        assert_eq!(output_index(Pool::Sapling, 1, 2, 1), 1);
        assert_eq!(output_index(Pool::Orchard, 0, 2, 1), 2);
        assert_eq!(output_index(Pool::Ironwood, 0, 2, 1), 3);
        assert_eq!(output_index(Pool::Ironwood, 1, 2, 1), 4);
        // An Ironwood-only transaction keeps the bundle index (every current testnet tip).
        assert_eq!(output_index(Pool::Ironwood, 1, 0, 0), 1);
    }

    #[test]
    fn utc_text_matches_known_times() {
        assert_eq!(utc_text(0), "1970-01-01T00:00:00Z");
        assert_eq!(utc_text(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(utc_text(1_791_943_430), "2026-10-14T02:03:50Z");
        assert_eq!(utc_text(4_102_444_799), "2099-12-31T23:59:59Z");
        assert!(is_audit_time(&utc_text(1_791_943_430)));
    }
}
