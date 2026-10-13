# Sealed session log

One entry per working day, newest at the bottom. Claude adds the day's entry at the end of each session, before the session closes, without being asked. The entry records what a future session needs that the code and git history do not say on their own: findings, surprises, bugs and their causes, decisions taken (with their D-, F- or C- numbers), what is still open, and where to start next.

Keep entries short and factual. Link IDs instead of repeating the full text of a decision. Never put secrets, keys, passphrases, tokens or tip text here.

## Template

```
## YYYY-MM-DD

**Done:** what was built or changed, with commit hashes for the big steps.
**Findings:** facts learned that are not obvious from the code (library behaviour, tool limits, design gaps).
**Bugs found:** each bug, its cause and its fix, and the regression test that now covers it.
**Decisions:** IDs taken or changed today (D-xx, C-xx, F-xx) and one line each.
**Open:** what waits for @Apa or for outside facts (spikes, Figma, deadlines).
**Next:** where the next session should start.
```

## 2026-10-11

**Done:** Read every doc. Aligned the docs before any code: stack (Vite, React), `after_seq`, tip floor range (C-12), hero headline, superseded handoff prompt (D-27 to D-31). Set up GitHub `Nalen518/Zecathon-Sealed` (private): `main` with README, `development`, licence MIT OR Apache-2.0, CLAUDE.md. Stack P-01 to P-08 confirmed (D-32 to D-35).
**Findings:** The standard `libsodium-wrappers` build has no `crypto_pwhash`, so the sumo build is required for Argon2id.
**Decisions:** D-27 to D-35. SAMPLE_TIP kept as an illustration (D-30). No Privacy policy page (D-31).
**Open:** PRD spikes 1 to 4, submission deadline (O-01 to O-03).
**Next:** Scaffold the web app, landing page first.

## 2026-10-12

**Done:** Built the whole frontend on `feat/web-scaffold` (local only): tokens generated from Figma variables, 25 components, all 17 screens, memo seal and open, ZIP 321 links, Argon2id keystore, API client with contract fixtures, CSP headers from one source for Vercel and preview.
**Findings:** Vercel reads `vercel.json` before the build, so it is generated and committed (D-36). Playwright's bundled Chromium download times out on this machine. Local e2e uses the installed Edge (D-42). Icon SVGs fetched lazily broke the offline safety check (T-10), so they are inlined as `data:` URIs (D-46). Figma draws only question 1 of the safety check and no desk error or empty states.
**Bugs found:** Pay redirected to Write in the same render that "I've sent it" wiped the tip (fixed by checking `sent` first, later reworked on Oct 13).
**Decisions:** D-36 to D-53. Many new copy strings proposed for Figma (D-37, D-43, D-44, D-48 to D-52).
**Open:** Review of the proposed decisions.
**Next:** Audit trail feature.

## 2026-10-13

**Done:** Audit trail design reviewed and merged into the existing docs (D-54 to D-61, C-13). Leak fixes: chain servers logged and served by origin only, on the audit log and on public `/v1/health` (C-14, D-62). Audit trail built: Python-generated fixtures, `src/lib/audit.ts` (tests first), API call, screen, Settings link, T-11. Figma updated (export warning, unverified hash note, Audit row description, footer and verify cleanup). QA pass. Removed the source code line, footer source link and version (D-66), also in Figma. GSAP 3.15 motion built on every screen within rules §7 (D-67). This log created.
**Findings:** New audit docs had been written on the Oct 11 versions and undid three fixes. Merged by renumbering. JS and Rust JCS can disagree on large numbers, floats, lone surrogates, control characters and non-ASCII key order, so the contract restricts audit data to a subset where they agree (D-59). Eight parallel Playwright workers running Argon2id over 64 MiB time out. Four are faster (D-65). The in-app browser pane runs pages as a hidden tab, so `requestAnimationFrame` (and every GSAP tween) is paused there. Check motion with Playwright, not the pane. Playwright now uses port 4175 so manual previews on 4173 and 4174 can stay up. GSAP adds about 49 KB gzip to the main bundle (134 to 183 KB).
**Bugs found:** Back after "I've sent it" looped on the Sent page (Pay redirected to Sent on every visit). Create inbox got stuck on "inbox already exists" when the token request failed after a successful register. Settings showed the config floor instead of the server's. Desk times used a 12-hour clock. The tip page linked to a README section that did not exist. All fixed with regression tests (F-19).
**Decisions:** C-13, C-14, D-54 to D-67.
**Open:** D-37 to D-39, D-43, D-44, D-48 to D-52, D-61, D-64 wait for review. Spikes 2 to 4 before the watcher. Rust toolchain not installed.
**Status:** Frontend declared done by @Apa. Previews stopped. `feat/web-scaffold` holds 24 local commits, not pushed.
**Next:** Push `feat/web-scaffold` and open the PR into `development` when @Apa asks. Then the backend: install the Rust toolchain, run spike 2 (view-only scan of a testnet memo under Ironwood), spike 3 (viewing key export) and spike 4 (Railway fit) before any watcher code.

## 2026-10-13 (backend)

**Done:** Read every doc and found 11 mismatches between the contract, SRD, Architecture doc and frontend client. Backend docs moved to `docs/backend/`. Contract clarified (C-15 to C-22, PR #2, still open): tips listed only once mined, no memo means unreadable, `confirmations` stops at 10, health always 200, one Create inbox check order, `SEALED_DB_KEY` and `PORT`, one testnet server allowed, empty-page `next_seq`. ZODL dropped for zcash-devtool (B-20). Spike tool `scan-memo` built and run against testnet. zcash-devtool built, then ported to the NU7 pre-release crates (144 compile errors to 0) on a local branch outside the repo. Testnet `sender` and `desk` wallets created. Watcher workspace started: `core` (fingerprint, JCS, audit chain, memo `format_ok`, status rules, wire types, 30 tests) and `store` (migration 0001, encrypted viewing key, tokens, tips, seq bumps, reorg orphaning, audit log, 18 tests). All fixtures pass byte for byte.
**Findings:** NU7 is active on testnet (branch `77190ad9`, height about 4,497,100). The hosh.zec.rocks monitor was about 100,000 blocks stale and said NU6.3, which led to a wrong rule edit that was then reverted (B-21 replaced by B-23). Only the pre-release crates (`zcash_protocol` 0.11.0-pre.0) know the testnet NU7 height. Ironwood has no receiver or key of its own: Orchard receivers and keys receive into it. The last 500 testnet blocks held only Ironwood actions. Compact blocks carry Ironwood actions only when `pool_types` asks for them. `testnet.zec.rocks` is live, `zaino.testnet.unsafe.zec.rocks` returned 503. The UFVK prefix is `uviewtest1` and addresses `utest1`, matching the frontend checks. No working testnet faucet: `faucet.zecpages.com` times out and zecfaucet.com is a mainnet faucet, offline since June. The zcashd docs page is about running a full node, not needed. `serde_json_canonicalizer` 0.3.2 matches the shared JCS fixtures, so JCS is not hand-written. `rusqlite` 0.40 needs `fallible_uint` for `u64`. Neither curl on this machine speaks HTTP/2, so gRPC checks go through the spike. A one-transaction, two-pool payment would collide on txid + output index (B-27).
**Bugs found:** None in shipped code. One wrong doc edit (NU7) caught by direct measurement and reverted.
**Decisions:** B-08 to B-28, BF-03 to BF-15, frontend D-68.
**Open:** TAZ for spike 2 (ask on the Zcash Discord, mainnet fallback Oct 15). PR #2 to merge. Contract C-23 for `output_index` (B-27). Spike 4 (Railway). `chain` and `api` crates.
**Status:** `feat/watcher-spikes` and `feat/watcher-core` hold local commits, not pushed. The web dev server on port 5173 may still be running.
**Next:** Merge PR #2 and rebase. Contract C-23. Build the `chain` crate with simulated reorg and restart tests. Send the first sealed tip once TAZ arrives.

