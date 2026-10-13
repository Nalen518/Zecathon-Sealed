# Sealed backend feedback log

Every piece of feedback on the backend, who gave it, and what was done. Newest at the bottom. When feedback changes a rule, update `rules.md`. When it changes a choice, add a row to `decisions.md`.

Status values: **Done**, **In progress**, **Won't do** (with reason), **Parked** (after the hackathon).

## How to add an entry

| ID | Date | From | Where | Feedback | Action taken | Status |
|---|---|---|---|---|---|---|
| BF-xx | | @name, judge, tester | Route, module or file | What they said | What changed | |

## Log

| ID | Date | From | Where | Feedback | Action taken | Status |
|---|---|---|---|---|---|---|
| BF-01 | Oct 13 | @Apa | Zcash resources | Use the Zecathon resource list (developer docs, ZIPs, librustzcash, Zebra, ZODL, NEAR Intents). It is enough for the hackathon | Mapped each resource to its use. NEAR Intents stays out of scope. Rule §3 and decision B-04 | Done |
| BF-02 | Oct 13 | @Apa | Backend rules | Needs backend rules before moving to Claude Code | `docs/backend/rules.md`, `decisions.md` and this log created | Done |
| BF-03 | Oct 13 | @Apa | Docs layout | Move the backend rules, decisions and feedback into `docs/backend/` | Moved from `docs/` root | Done |
| BF-04 | Oct 13 | @Apa | Scanner, pending tips | M1 option A (own scanner), M2 option A (mined tips only) | B-08 and B-09. Contract and SRD wording changes still to propose | Done |
| BF-05 | Oct 13 | @Apa | Spikes, test funds | No spike run yet. No TAZ and no ZODL testnet wallet yet | Spikes 2 to 4 start from zero. Faucet and wallet setup needed before T-4 | In progress |
| BF-06 | Oct 13 | @Apa | Database | Store the data on Supabase first, before Railway | Options sent back. @Apa chose SQLite (B-11) | Done |
| BF-07 | Oct 13 | @Apa | Decisions | M3 option a, P-B1 to P-B7 as recommended | B-10, B-12 to B-18 | Done |
| BF-08 | Oct 13 | @Apa | Test setup, sender flow | Use only the laptop, no phone. Make it a website so users do not need to download two things | Options sent back. @Apa chose zcash-devtool on the laptop as the test wallet and desk key tool. The sender flow stays as it is | Done |
| BF-09 | Oct 13 | @Apa | Repo layout, contract | Layout OK, use zcash-devtool, prepare the contract pull request | Layout from rules §7.4 with `sealed-core` naming. Contract C-15 to C-22 drafted (B-19) | Done |
| BF-10 | Oct 13 | @Apa | Zcash resources | Drop ZODL, it is no longer used | B-04 replaced by B-20. Rules §3.1, SRD §6 and PRD §6 now name zcash-devtool as the test wallet | Done |
| BF-11 | Oct 13 | @Apa | Privacy | Do not put my email anywhere before I say so (it was sent once in a crates.io User-Agent) | Neutral User-Agent on every request since. Saved as a standing rule | Done |
| BF-12 | Oct 13 | @Apa | Spikes | Yes to the spike 2 dependencies, building zcash-devtool, correcting NU7 in rules §3.3, and using both zec.rocks testnet servers | Rules §3.3 and §4.2 updated, B-21 and B-22 | Done |
| BF-13 | Oct 13 | @Apa | Crates, test wallet | Option A: pre-release crates for the spike and a locally patched zcash-devtool. @Apa requests the TAZ from the faucet | B-24. Spike moved and working, devtool patch in progress | In progress |
| BF-14 | Oct 13 | @Apa | Coins, build order | Mainnet from Bybit is too expensive for now. Work on the parts that need no coins while I find TAZ | `core` crate built first (B-25). Coin-dependent spike 2 waits. Fallback to mainnet still Oct 15 | In progress |
| BF-15 | Oct 13 | @Apa | Contract, chain crate | OK to option A for `output_index` and to the `chain` crate dependencies. Rest after this, with a summary of what is done and open | B-27, B-28. Session log entry written | Done |
