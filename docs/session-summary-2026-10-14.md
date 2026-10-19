# Session summary, Oct 14 2026

One page for the whole day: what was found, what was built, and what is still open, for the frontend and the backend. Details live in `docs/session-log.md`, `docs/frontend/decisions.md` (D-xx), `docs/backend/decisions.md` (B-xx) and `docs/api-contract.md` (C-xx).

## 1. Findings

**Product and flow**
- The QR on Pay is not a mock. It is the real ZIP 321 payment request, built in the browser from `sealed.config.json` and the sealed memo. By design it never touches the backend. The server only learns about a payment from the chain.
- The address in `sealed.config.json` is the **receiver**: the desk's shielded address. The sender pays from their own wallet, and the page never sees the sender's address.
- Judges need no key to write a tip. The tip page seals to the desk public key in the config. They need the judge kit only to open the desk.
- The backup made at Create inbox 1 had no desk token, and nothing could export a newer one. A judge kit would have stopped at "sign in again", which needs the setup secret. Fixed with D-94.
- The Pay QR holds about 914 characters (the memo is always 511 bytes, as base64url, plus the address). That is a version 21 code with about 3 px per module at 320 px. It cannot get shorter without making memos different lengths.
- "No usable data found" came from a phone camera or Google Lens, which cannot use `zcash:` links. The code itself is valid.
- `localhost:4174` uses a fake test address on purpose, so no wallet can pay it. `localhost:5173` uses the backend's real testnet desk.
- Testnet is on NU7 and has a second chain that split at height 4,465,026 (B-29). Phone wallets cannot pay this testnet. The test sender wallet is `zcash-devtool` on the laptop (BF-08, B-20). "Open in wallet" is a `zcash:` link, so on the laptop it opens nothing, because `zcash-devtool` is a command line tool.
- The faucet (Valar) and testnet.zecblock.com both follow the NU7 chain. fauzec.com and zexplorer follow the other chain.

**Engineering**
- One checkout cannot hold two branches. The frontend works in a git worktree at `D:\ZECathon-web-links`, the backend in `D:\ZECathon`. Shared refs, separate files.
- Parallel e2e runs time out while the machine is busy (the EA app took most of the CPU). Every failing test passed alone. Three slow tests got more time.
- The in-app browser pane pauses animation frames, so the seal moment never finishes there. Check motion with Playwright in Edge.
- Decision IDs collided once (D-81 used by both sides). The backend's C-23 row is now D-86.

## 2. Done today

### Frontend (all merged into `development` except the last PR, which this file ships with)

| PR | What | IDs |
|---|---|---|
| #3 | Network badge without the dot, testnet explorer and faucet links, txid copy | D-81 to D-84, F-26 |
| #4 | Envelope component, 1 s seal moment, sealed-first desk tips with the flap, merge check fixes | D-69 to D-80, F-23 to F-25 |
| #5 | Pay spacing, D-79 and D-80 accepted, copy button on both networks | D-85, F-27 |
| #6 | "For desks", Two sides block, judge box, Desk Restore, demo_desk, critique fixes, README "Run your own desk" | D-87 to D-91, F-28, F-29 |
| #9 | `demo_locked` mapped, desk links on Create inbox, Locked and Restore, e2e timeouts | D-92, D-93, F-30 |
| this PR | Download backup file in Settings, "Show a larger code" on Pay, desk Leave, `dist-local/` ignored | D-94 to D-96, F-31, F-32 |

Tests at the end of the day: 111 unit, about 81 e2e (2 skipped by design), CSP, no third-party requests, axe at 1280 and 360 px.

### Figma (file pVuD8nfzyPl2HRPPLuACjV)
Caption under the sender envelope, Details rows on Inbox — Tip sealed, Backup file card on Settings, "Show a larger code" in the QR code component, Leave in the Desk header.

### Backend (by the backend session)
- PR #2 (contract v1.1, C-15 to C-22) merged.
- PR #7: contract C-24, the demo inbox lock (`403 demo_locked`).
- PR #8: the watcher on `development`: crates `core`, `store`, `chain`, `api`, the `sealed` binary, contract C-23, fixtures for C-15 to C-17, B-01 to B-33.
- Spike 2 passed on NU7 testnet: a memo sealed by the frontend's own code was paid, found with the viewing key alone and opened.
- A full local run: real `sealed` binary on port 8787 and the frontend on 5173, desk created in the browser, inbox registered, a real testnet tip received and opened.

## 3. Not done yet

### Needs @Apa
1. **Real testnet desk for the live page.** Testnet wallet address and viewing key, the watcher deployed, then `desk_public_key`, `fingerprint`, `address` and `api_base_url` in `sealed.config.json`.
2. **Judge kit.** After the watcher runs on testnet and the last token rotation, download the backup from Settings, set `demo_desk: true` and `SEALED_DEMO_INBOX_ID=desk` on the judging deploy only. Keep the kit in private submission notes.
3. **Spec Q-1:** does the submission form allow private notes for judges? **Q-2:** does the demo video show the judge kit or Create inbox?
4. **Pay on the laptop:** keep the three copy fields for `zcash-devtool` (current), add "Copy payment link", or look for a phone wallet that runs on NU7 testnet.
5. **Older proposed decisions** to review: D-37 to D-39, D-43, D-44, D-48 to D-52, D-61, D-64.
6. Repo public by **Oct 28**.

### Frontend
- Live checks against the real API on a deploy (T-4, T-5).
- Remove the worktree `D:\ZECathon-web-links` once both sides work from one checkout again.

### Backend (from its own logs)
- `feat/watcher-build` is local only: `cargo deny`, `.env.example` for testnet, and the T-6, T-8, T-9 and T-11 testnet log. Push and PR.
- Dockerfile and the Railway deploy (spike 4, step D, asks first).
- C-25: a contract code for storage failures and timeouts.
- Whether to drop the Zaino testnet server while it is down (B-18). The Inbox reads "Watcher behind" at 0 blocks lag when one server is down, which looks like a fault.
- A revived tip reuses `tip_received` in the audit log (B-30). The contract has no own event type.

## 4. Running locally at the end of the day

| Address | What |
|---|---|
| http://localhost:4173 | Latest frontend with the shipped config (no desk key yet) |
| http://localhost:4174 | Latest frontend with the test key (fake address, judge box on) |
| http://localhost:5173 | Latest frontend with the backend's real testnet desk (fingerprint BA31 7197 EEAA 5D03) |
| http://localhost:8787 | Backend `sealed` API on NU7 testnet |

The 5173 config and the API launcher live in `D:\ZECathon-tools\smoke`, outside the repo, with the backend's secrets. Never commit anything from that folder.
