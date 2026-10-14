//! Tip status rules (api-contract §5.2, §5.3, C-1, C-16, C-17; FR-14, FR-16, FR-19).

/// Confirmations at which a tip counts as confirmed (FR-14, `SEALED_CONFIRMATIONS`).
pub const CONFIRMED_AT: u32 = 3;

/// `confirmations` stops here and no longer changes, so old tips stop bumping `seq` (C-17).
pub const CONFIRMATIONS_CAP: u32 = 10;

/// `chain_state` on the wire.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChainState {
    Pending,
    Confirmed,
    Orphaned,
}

impl ChainState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Confirmed => "confirmed",
            Self::Orphaned => "orphaned",
        }
    }
}

/// `display_status` on the wire. The five Status badge variants in Figma, same spelling (§5.3).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DisplayStatus {
    Orphaned,
    Unreadable,
    BelowFloor,
    Pending,
    Confirmed,
}

impl DisplayStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Orphaned => "orphaned",
            Self::Unreadable => "unreadable",
            Self::BelowFloor => "below_floor",
            Self::Pending => "pending",
            Self::Confirmed => "confirmed",
        }
    }
}

/// Confirmations of a mined tip at the given chain tip, counting its own block as 1 and
/// stopping at [`CONFIRMATIONS_CAP`] (§5.2, C-17). A tip above the chain tip has none yet.
pub fn confirmations(tip_height: u32, chain_tip: u32) -> u32 {
    if tip_height > chain_tip {
        return 0;
    }
    (chain_tip - tip_height + 1).min(CONFIRMATIONS_CAP)
}

/// `chain_state` of a tip still on the best chain (§5.3, FR-14). Orphaning is decided by the
/// reorg handling, never from a confirmation count.
pub fn chain_state(confirmations: u32) -> ChainState {
    if confirmations >= CONFIRMED_AT {
        ChainState::Confirmed
    } else {
        ChainState::Pending
    }
}

/// `below_floor`: the amount is under the inbox tip floor at the time of the response (FR-16).
pub fn below_floor(amount_zat: u64, tip_floor_zat: u64) -> bool {
    amount_zat < tip_floor_zat
}

/// `display_status` with the contract's fixed precedence: orphaned, unreadable, below floor,
/// pending, confirmed (§5.3).
pub fn display_status(
    chain_state: ChainState,
    format_ok: bool,
    below_floor: bool,
) -> DisplayStatus {
    match (chain_state, format_ok, below_floor) {
        (ChainState::Orphaned, _, _) => DisplayStatus::Orphaned,
        (_, false, _) => DisplayStatus::Unreadable,
        (_, true, true) => DisplayStatus::BelowFloor,
        (ChainState::Pending, true, false) => DisplayStatus::Pending,
        (ChainState::Confirmed, true, false) => DisplayStatus::Confirmed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confirmations_count_the_own_block_and_stop_at_ten() {
        assert_eq!(confirmations(100, 100), 1);
        assert_eq!(confirmations(100, 102), 3);
        assert_eq!(confirmations(100, 109), 10);
        assert_eq!(confirmations(100, 5_000), 10);
        assert_eq!(confirmations(101, 100), 0);
    }

    #[test]
    fn confirmed_at_three() {
        assert_eq!(chain_state(0), ChainState::Pending);
        assert_eq!(chain_state(2), ChainState::Pending);
        assert_eq!(chain_state(3), ChainState::Confirmed);
        assert_eq!(chain_state(10), ChainState::Confirmed);
    }

    #[test]
    fn below_floor_is_strictly_less() {
        assert!(below_floor(99_999, 100_000));
        assert!(!below_floor(100_000, 100_000));
        assert!(!below_floor(150_000, 100_000));
    }

    #[test]
    fn precedence_orphaned_first() {
        for format_ok in [true, false] {
            for below in [true, false] {
                assert_eq!(
                    display_status(ChainState::Orphaned, format_ok, below),
                    DisplayStatus::Orphaned
                );
            }
        }
    }

    #[test]
    fn precedence_unreadable_before_below_floor() {
        // C-16: a tip with no memo has format_ok false, and is unreadable even when below floor.
        assert_eq!(
            display_status(ChainState::Pending, false, true),
            DisplayStatus::Unreadable
        );
        assert_eq!(
            display_status(ChainState::Confirmed, false, false),
            DisplayStatus::Unreadable
        );
    }

    #[test]
    fn precedence_below_floor_before_chain_state() {
        assert_eq!(
            display_status(ChainState::Pending, true, true),
            DisplayStatus::BelowFloor
        );
        assert_eq!(
            display_status(ChainState::Confirmed, true, true),
            DisplayStatus::BelowFloor
        );
    }

    #[test]
    fn plain_chain_states() {
        assert_eq!(
            display_status(ChainState::Pending, true, false),
            DisplayStatus::Pending
        );
        assert_eq!(
            display_status(ChainState::Confirmed, true, false),
            DisplayStatus::Confirmed
        );
    }

    #[test]
    fn wire_spellings_match_the_contract() {
        let all = [
            DisplayStatus::Orphaned,
            DisplayStatus::Unreadable,
            DisplayStatus::BelowFloor,
            DisplayStatus::Pending,
            DisplayStatus::Confirmed,
        ];
        let names: Vec<_> = all.iter().map(|s| s.as_str()).collect();
        assert_eq!(
            names,
            [
                "orphaned",
                "unreadable",
                "below_floor",
                "pending",
                "confirmed"
            ]
        );
        assert_eq!(ChainState::Pending.as_str(), "pending");
        assert_eq!(ChainState::Confirmed.as_str(), "confirmed");
        assert_eq!(ChainState::Orphaned.as_str(), "orphaned");
    }
}
