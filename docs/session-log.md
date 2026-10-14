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

## 2026-10-14 (feat/web-network-links)

**Done:** On `feat/web-network-links` off `development`: Network badge without the dot (D-81), testnet explorer link and a copy button per transaction id on the Audit trail (D-82), testnet faucet link in the Pay "Check in your wallet" panel (D-83), all from `outbound_links` in sealed.config.json and null on mainnet (D-84). Rules §2.7 added. New unit tests render the links with `react-dom/server` (Vitest now also runs `.test.tsx`). New e2e: faucet opens a new tab with no opener and no Referer while the sealed tip stays in the first tab, explorer and copy button on both Audit trail states, no request to either domain.
**Findings:** The working copy at `D:\ZECathon` is shared with the backend session, which had `feat/watcher-core` checked out with uncommitted work. This branch is built in a separate git worktree at `D:\ZECathon-web-links` so neither session switches the other's branch. Figma already matched all three changes. Both sites loaded on Oct 14: the faucet showed "ONLINE" with a balance, and the explorer showed live testnet blocks. Referrer-Policy was already `no-referrer`, so the new links add `noreferrer` as a second guard. The API contract and the CSP are unchanged.
**Bugs found:** None in shipped code. A first `git checkout -b` in the shared folder briefly moved the backend's checkout to a new branch. It was switched back at once with nothing lost, and the stray branch was deleted.
**Decisions:** D-81 to D-84, F-26.
**Open:** Whether the txid copy button should also be hidden on mainnet (it shows on both now, as in the Figma Audit row). `feat/web-envelope` and this branch both change Pay.tsx and the docs logs, so the second one merged needs a small conflict fix.
**Next:** @Apa reviews the screenshots. Push and open the PR into `development` only when asked. Remove the worktree once the backend session has committed and `D:\ZECathon` can check out this branch.
