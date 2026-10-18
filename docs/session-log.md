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


## 2026-10-14

**Done:** Envelope design decisions written up (commit 0ab4467). Built the Envelope on `feat/web-envelope`: elevation tokens from the Figma effect styles (`gen-tokens.mjs` now emits box-shadow and drop-shadow forms), Envelope component (sealed variants as one scalable SVG with a text label, open variant as a drawing around a real HTML letter), Pay right column with "What the chain will see" envelope and caption, Sent envelope and "Marked as sent" tag, the 1 s seal moment from Write to Pay, and the desk Inbox showing each tip sealed until "Open with desk key" with the flap animation (D-78). New e2e checks: envelope facts and caption, seal moment with and without reduced motion, sealed then open with the real byte count, flap timing, axe on the sealed Inbox.
**Findings:** The Figma open envelope shows only the flap's tip above the letter. That is the design, not a clipping bug. The seal moment needs to know whether a seal just happened, so the tip flow now counts seals (`sealCount`) and remembers which one it already played. The Inbox used to decrypt on every 30 s poll because the effect depended on the tip object. Keying the opened tip by id fixed that as a side effect.
**Bugs found:** Open envelope fields overlapped at 360 px (fixed by wrapping, D-80, covered by the 360 px axe and screenshot check). A test assumed switching tabs reseals the tip. It does not, because the selection stays the same, so the test now chooses the other tip.
**Decisions:** D-69 to D-78 accepted. D-79 and D-80 proposed. F-23 to F-25 done.
**Open:** D-79, D-80 and the older proposed decisions wait for review. Figma: caption under the sender envelope (D-76) and, if accepted, Details under the desk envelope (D-79). Live check against the real watcher API once the backend `api` crate exists (T-4, T-5).
**Next:** @Apa reviews the Envelope locally. Then push `feat/web-envelope` and open the PR into `development` when asked. Backend work continues in its own session.

## 2026-10-14 (feat/web-network-links)

**Done:** On `feat/web-network-links` off `development`: Network badge without the dot (D-81), testnet explorer link and a copy button per transaction id on the Audit trail (D-82), testnet faucet link in the Pay "Check in your wallet" panel (D-83), all from `outbound_links` in sealed.config.json and null on mainnet (D-84). Rules §2.7 added. New unit tests render the links with `react-dom/server` (Vitest now also runs `.test.tsx`). New e2e: faucet opens a new tab with no opener and no Referer while the sealed tip stays in the first tab, explorer and copy button on both Audit trail states, no request to either domain.
**Findings:** The working copy at `D:\ZECathon` is shared with the backend session, which had `feat/watcher-core` checked out with uncommitted work. This branch is built in a separate git worktree at `D:\ZECathon-web-links` so neither session switches the other's branch. Figma already matched all three changes. Both sites loaded on Oct 14: the faucet showed "ONLINE" with a balance, and the explorer showed live testnet blocks. Referrer-Policy was already `no-referrer`, so the new links add `noreferrer` as a second guard. The API contract and the CSP are unchanged.
**Bugs found:** None in shipped code. A first `git checkout -b` in the shared folder briefly moved the backend's checkout to a new branch. It was switched back at once with nothing lost, and the stray branch was deleted.
**Decisions:** D-81 to D-84, F-26.
**Open:** Whether the txid copy button should also be hidden on mainnet (it shows on both now, as in the Figma Audit row). `feat/web-envelope` and this branch both change Pay.tsx and the docs logs, so the second one merged needs a small conflict fix.
**Next:** @Apa reviews the screenshots. Push and open the PR into `development` only when asked. Remove the worktree once the backend session has committed and `D:\ZECathon` can check out this branch.

## 2026-10-14 (merge check before development)

**Done:** Merged `development` (network links) into `feat/web-envelope` and resolved the conflicts (tests and the four doc logs, both sides kept). `.gitignore` now also covers Playwright blob reports, its cache and scratch screenshots. Bug hunt before the merge into `development`.
**Bugs found:** (1) Opening tip A and choosing tip B before A finished let A appear already open the next time it was chosen, without "Open with desk key" (D-79). Fixed with a run counter in the Inbox that drops a stale opening. (2) Write, Pay, Sent and the Safety check had no axe and no-horizontal-scroll check, although rules §9 asks for one on every screen. Added one test covering all of them at 1280 and 360 px. It passes. (3) The merge dropped a closing brace in `sender.spec.ts`. Fixed before commit.
**Not bugs:** Locking while a tip opens cannot keep the text, because the Locked screen unmounts the Inbox.
**Next:** @Apa confirms, then `feat/web-envelope` goes into `development` by pull request.

## 2026-10-14 (wrap-up)

**Done:** PR #3 (network links) and PR #4 (Envelope, with the merge check fixes) merged into `development`. Merged branches deleted on GitHub and locally. Figma: D-76 caption on Pay — Default and Pay — Sent, grouped with the envelope at `spacing/sm`. D-79 Details rows on Inbox — Tip sealed. D-79 and D-80 accepted, D-85 taken.
**Findings:** The code put 32 px between the Pay envelope block and the checks panel, Figma 16 px. Code now follows Figma.
**Decisions:** D-79, D-80 accepted. D-85. F-27.
**Open:** The older proposed decisions still wait for review: D-37 to D-39, D-43, D-44, D-48 to D-52, D-61, D-64. PR #2 (contract v1.1) is still open. The worktree `D:\ZECathon-web-links` goes once the backend session has committed its work in `D:\ZECathon`. Live check against the real watcher API once its `api` crate runs (T-4, T-5).
**Next:** Backend: the watcher API, so the desk Inbox and Audit trail run on real data. Then the desk key setup for the tip page (sealed.config.json values) and a real testnet tip end to end.

## 2026-10-14 (feat/web-desk-entry)

**Done:** On `feat/web-desk-entry` off `development` (local, not pushed). Spec and critique committed first. "For desks" header link and the Two sides block with focus moved to its H2. Judge box and the Restore callout behind `demo_desk` (ships false). `/desk` with no key lands on `/desk/restore`, built from Figma Desk — Restore with the file picker. README "Run your own desk". Text link `Size=Small`, Icon button / Copy, Body/Small Medium token. `sealed-desk-backup*.json` ignored. e2e backup fixture made with the real keystore (`tests/fixtures/desk-backup.e2e.json`, test key only). 109 unit and 72 e2e checks pass.
**Findings:** The README had no "Run your own desk" section, so the spec's link would have landed at the top. Figma moved "never uploaded" from the Restore body into the file helper (DC-01), so the code follows Figma there. The backend renumbered its C-23 row to D-86 on `integration/web-api`, so this branch starts at D-87. `feat/watcher-core` still calls that row D-81, which collides with D-81 (network badge) on `development` and needs the D-86 number before it merges.
**Decisions:** D-87 to D-91, F-28, F-29, rules §4.10.
**Open:** C-24 (`demo_locked`) waits for @Apa's yes and the contract merge. Judge kit export and `demo_desk: true` before Oct 20. Q-1 and Q-2 in the spec.
**Next:** @Apa reviews the screenshots. Push and open the PR only when asked. Then C-24 on the backend side.

## 2026-10-14 (open items)

**Done:** PR #6 (desk entry and judge kit) merged into `development`. On `feat/web-desk-header`: the desk header shows its four links on Create inbox, Locked and Restore (D-92). The backend session renumbered its C-23 row to D-86 on `feat/watcher-core` and committed C-24 on `feat/contract-c24`. The untracked spec and critique copies in `D:\ZECathon` no longer block a checkout, because `development` tracks identical files.
**Findings:** The backend session needs @Apa's yes typed in its own session before it pushes or merges. A yes relayed by this session does not count there.
**Decisions:** D-92, F-30.
**Open:** Push of `feat/watcher-core` with the D-86 renumber (backend session). Judge kit export once the watcher runs on testnet, then `demo_desk: true`. Q-1 and Q-2 in the spec.
**Later the same day:** C-24 merged into `development` (PR #7). `demo_locked` mapped in `api.ts` and `desk/errors.ts` with a unit test on the fixture and an e2e check on Settings (D-93). One full e2e run timed out on 7 desktop tests while the machine was busy. All 7 passed alone and the next full run was green (74 passed).
**After the backend merge:** `development` (PR #8, backend and C-15 to C-23) merged into `feat/web-desk-header`. Only the session log conflicted. 111 unit tests pass. With the machine near 77% CPU from apps outside the project (the EA app), parallel e2e runs failed a different test each time, always on a timeout, and every one passed alone. Three slow tests now have more time: T-9 and FR-11 (90 s), the sender axe test (90 s), and the wait for the new desk key (20 s). A single-worker run was green: 74 passed, 2 skipped.
**Next:** Push `feat/web-desk-header` when @Apa asks.

## 2026-10-14 (backend)

**Done:** State check of the watcher branches (48 tests green, PR #2 still open). Envelope check for D-69 to D-80: the desk envelope reads `amount_zat`, `height` and `block_time_at` for the postmark, and the open envelope counts the bytes of the text decrypted in the browser from `memo_b64`. The Details rows (D-79) read `seen_at`, `height`, `confirmations`, `amount_zat`, `below_floor` and `txid`. All are in contract §5.2 and `contracts/fixtures/tip.json`, and `src/lib/api.ts` is unchanged on `feat/web-envelope`. **No backend change needed for D-69 to D-80.** C-15 makes `height` and `block_time_at` never null in v1, and the envelope already handles null.
**Done (cont.):** TAZ arrived on the NU7 chain after a detour: fauzec.com and zexplorer follow a second testnet chain that split from the NU7 chain at height 4,465,026, and testnet.zecblock.com follows the NU7 chain (B-29). Spike 2 passed: a memo sealed by the frontend's own `sealTip` went out as 0.001 TAZ (tx `a73d5e91…99b5`, height 4,499,964), was found with the desk viewing key alone and opened by `openMemo`. `chain` crate built: lightwalletd source, view-only detector, watcher loop with reorg, restart and source checks, health view, log grep test. Architecture §3 data model brought in line with migration 0001.
**Findings (cont.):** `MemoBytes::as_slice()` drops the zero padding, `as_array()` keeps all 512 bytes. zecblock's fork tracker shows reorgs up to 317 blocks on this testnet. `zip32::Scope` is not re-exported, so scanning keys are built per call. `TransferType` is at the crate root of `zcash_client_backend`.
**Decisions (cont.):** B-29, B-30.
**Open:** PR #2 merge and rebase. Contract C-23 text (yes pending). `api` crate dependencies (to propose). Spike 4 (Railway). A revived tip reuses `tip_received` (B-30, contract §5.6 has no own type).
**Next:** `api` crate after the dependency yes, then the Dockerfile and Railway.
**Done (api):** Contract C-23 written (B-31, D-86, SRD BR-7 settled). Registration key checks in `chain` (spend key first, network, viewing key, unified address, shielded receiver, address derived from the key). `api` crate and the `sealed` binary: every route of contract §6, edge middleware for CORS, privacy headers, body limit, timeout and rate limits, `sealed hash-secret`, watcher loop on its own connection (B-32). 102 tests green, clippy clean, log grep green. Local smoke test on NU7 testnet with the real binary: health 1 of 2 servers, inbox registered with the desk wallet's real viewing key, the watcher found the spike 2 tip through the API (output index 1, 512-byte memo, confirmed), the frontend's `openMemo` opened it, and the served audit chain verified independently in Python.
**Findings (api):** A transparent address can never reach "no shielded receiver" in the contract's check order, because ZIP 316 requires a shielded receiver in every unified address. The contract has no code for a storage failure or a timeout. `UnifiedDecodingError` is private in `zcash_keys`, so a network mismatch is found by decoding for the other network. `default_transparent_address` needs a feature we do not enable. A process started with `exec` from a background shell outlives the stopped task on Windows.
**Decisions (api):** B-31, B-32. Contract change C-24 proposed, not written.
**Open:** C-24 (yes needed). `cargo deny` (tool install needed). Dockerfile, `.env.example` and Railway (step D, ask first). PR #2 merge and rebase. Testnet T-6 and T-8 tips (below floor, plain memo) need two more small sends.
**Next:** C-24 answer, then step D.

## 2026-10-14 (integration, local branch `integration/web-api`)

**Done:** Merged `origin/development` (finished frontend, PRs #3 to #5) into the backend branch locally. Conflicts only in the two append-only logs: both sides kept, and the backend's C-23 frontend row renumbered D-81 to D-86 because development already used D-81. Ran the real `sealed` binary (port 8787, fresh database) and the frontend dev server pointed at it (port 5173, config outside the repo) on NU7 testnet. Full flow through the real pages: desk key made in the browser, inbox registered with the desk wallet's viewing key, key published to the config, sender wrote a tip and Pay built a 511-byte `z1:` memo and an 889-character ZIP 321 link, 0.001 TAZ sent with that memo (tx `11e4c209…bfb1`, block 4,500,857), the watcher stored it, a browser restored from the backup file signed in with the setup secret and opened it to the exact text.
**Bugs found:** (1) The desk e2e test still expected the pre C-15 fixtures (12 confirmations, the no-memo tip as tip 2). Fixed to C-16 and C-17. (2) With one of two servers down, the Inbox shows WATCHER BEHIND and "the watcher is 0 blocks behind" at 0 lag, which reads as a fault. Zaino has been down all day.
**Findings:** The in-app browser pane never runs `requestAnimationFrame`, so the seal moment never finishes there. Use Playwright in Edge for flows with motion. A restored browser has the key but no desk token and must sign in with the setup secret (C-5), as designed. The Pay faucet link (Valar) pays on the NU7 chain. Nothing in the public pages links to `/desk`.
**Open:** How judges reach the desk. Whether to drop Zaino from the testnet sources until it answers (B-18). C-24, `cargo deny`, Dockerfile.

## 2026-10-14 (backend, demo inbox lock)

**Done:** Contract C-24 drafted from the judge kit spec §8, committed on `feat/contract-c24` from `development` and opened as PR #7. `feat/watcher-core` pushed, with the C-23 frontend row renumbered D-81 to D-86. Demo lock built on `feat/watcher-demo-lock` (from `feat/watcher-core`, with `feat/contract-c24` merged in): `SEALED_DEMO_INBOX_ID` in config, refused on main with a clear log line, `demo_locked` on token issue and PATCH without a correct setup secret, checked before any change. 6 new tests, 108 Rust tests green, clippy and log grep green. The real binary exits 1 on main with the variable set and creates no database.
**Findings:** `development` has no `apps/watcher` yet, so backend work cannot branch from it until PR #2 and the watcher branch land. The duplicate spec and critique files in `D:\ZECathon\docs` were identical to `development` and were deleted.
**Decisions:** B-33, BF-19. The earlier storage-failure contract note is now C-25.
**Open:** PR #7 merge (then tell the frontend session, which maps `demo_locked`). PR #2. A PR for the watcher branches. C-25, `cargo deny`, Dockerfile, Railway.
**Next:** @Apa merges PR #7. Then push `feat/watcher-demo-lock` when asked.

## 2026-10-14 (backup export)

**Done:** On `feat/web-backup-export` off `development`: "Download backup file" in Settings exports the current record with the desk token (D-94). Figma Settings — Delete inbox has the new card. e2e test: register, download from Settings, the token is inside only in encrypted form, a wiped browser restores the file and lands in the Inbox with tips. 28 desk e2e checks pass.
**Findings:** The only backup until now was made at Create inbox 1, before registration, so it had no token, and nothing exported a newer one. A judge kit would have stopped at "sign in again", which needs the setup secret. The Pay QR holds about 914 characters (a fixed 511 byte memo as base64url plus the address), which makes a version 21 code at level L with about 3 px per module at 320 px. It cannot get shorter without making memos different lengths.
**Decisions:** D-94, F-31.
**QR:** the scan was with a phone camera or Google Lens, which cannot use `zcash:` links, so "no usable data found" is expected. Added "Show a larger code" (D-95) and the link in the Figma QR code component. Caption and link now centered as in Figma.
**Open:** Test the QR with a Zcash wallet scanner on a real testnet address. Judge kit export after the watcher runs on testnet.
**Next:** Push `feat/web-backup-export` when @Apa asks.

## 2026-10-14 (desk Leave)

**Done:** On `feat/web-desk-leave` (on top of `feat/web-backup-export`): Leave in the Figma Desk header, then in code (D-96). 34 desk e2e checks pass.
**Decisions:** D-96, F-32.
**Next:** Push `feat/web-backup-export` and `feat/web-desk-leave` when @Apa asks. Then the real testnet payment path with the backend session.

## 2026-10-14 (end of day)

**Done:** Settings backup export, larger QR and desk Leave pushed and merged with this PR. Whole day summarised in `docs/session-summary-2026-10-14.md` (findings, done, not done, frontend and backend).
**Open:** See §3 of that file.
**Next:** Real testnet desk for the live page, then the judge kit.

## 2026-10-18

**Done:** On `feat/web-hero-centered` off `development` (worktree `D:\ZECathon-web-links`): centered hero and the memo grid band from docs/hero-centered.md (D-98, F-33). The spec is committed with the work. e2e: band 1040 × 127 px at 1280 with the caption row above, Default shape at 360, label unchanged, reduced motion shows the sealed band, the loop still types on the band.
**Findings:** The canvas had a fixed 477 px max width in `motion.css`, so the first band render was 64 tiny columns in 477 px. The band now lifts that cap. The spec's acceptance list still says 1020 px, but critique HC-01 widened the band to 1040 px, which Figma shows, so the code follows 1040. The repo has no pixel baseline tests (no `toHaveScreenshot`), so there were no baselines to update. Write grids are pixel-identical before and after. The backend took D-97 on its local `feat/contract-c25`, so this work uses D-98.
**Decisions:** D-98, F-33.
**Open:** Everything in §3 of docs/session-summary-2026-10-14.md. `D:\ZECathon\docs\hero-centered.md` is an untracked copy in the backend checkout and blocks checking out `development` there once this merges.
**Next:** Push and merge when @Apa asks.
