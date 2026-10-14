# Sealed: screen map (design complete, Oct 11 2026)

Figma file: https://www.figma.com/design/pVuD8nfzyPl2HRPPLuACjV/Zecathon
Scope: web, desktop 1280 px. No separate mobile design; the code should still stack to one column below 860 px (SRD NFR-10, 360 px).
Look: palette A (ink + Zcash gold), Albert Sans / JetBrains Mono at 400 and 500 only, hero H1 (memo grid), footer F3 (dot-matrix wordmark). Motion code: `docs/motion/`.

## Figma pages

| Page | What is on it |
|---|---|
| Foundations | Color, type, spacing and layout tokens (variables), with code syntax `var(--…)` |
| Components | Button (Primary, Secondary, Inverse, Nav, Danger), Icons (incl. info), Network badge, Site header (landing, Safety check), Flow header (Write and Pay: no section links, "Leave" asks to confirm), Desk header (lock button hidden on setup and Locked), Site footer (dot wordmark), Step, List item, Permission row, Callout (Info, Warning, Success), FAQ item, Fingerprint (copy field), Memo grid (Empty, Writing, Full, Sealed × Default, Compact), Input, Textarea (Empty, Typing, At limit, Error), Checkbox, Radio option, Status badge (tip states only), Tag (free-text screen state), Text link (48 px hit area), Step indicator, Tip row, QR code, Audit header row, Audit row (Default, Broken), Envelope (Sender, Desk × Sealed, Open) |
| Landing page | Landing — Desktop 1280 |
| Sender screens | Write ×3, Pay ×2, Safety check ×2 |
| Desk screens | Create inbox ×3, Inbox ×4, Decrypt ×2, Settings, Audit trail ×2, Desk — Restore |

Rules from the Oct 11 critique: one voice ("the desk" receives, "Sealed" is the tool, never "us/our/we"), app screens use 64 top padding and 32 between blocks, never scale a component instance (use its Size variant), and never relabel a Status badge (use Tag).

Envelope (added Oct 14): component "Envelope" with Context=Sender/Desk and State=Sealed/Open, used on Pay, Pay Sent, Inbox and Inbox Tip sealed. It shows only real data: the sender envelope shows what the chain sees (everything hidden except the 511 byte memo), the desk postmark shows the tip's real block and time from the API. The open letter grows to fit the whole tip in code so no text is ever hidden behind the pocket.

## Screens and the requirements they cover

| Frame | Shows | SRD |
|---|---|---|
| Landing — Desktop 1280 | Hero + memo grid, who it is for, three steps, Two sides block (#for-desks, "For desks" in the header) with the judge box on the testnet judging deploy, who can see what, questions, verify this page, footer | FR-6, FR-9, NFR-11 |
| Write — Default | Tip box with UTF-8 byte counter, memo grid at 127 bytes, desk key fingerprint to compare, Seal and continue | FR-1, FR-2, FR-6 |
| Write — Empty | Button disabled, placeholder, hint | FR-1 |
| Write — At limit | 331 / 331 bytes in red with icon + message, grid full | FR-1 |
| Pay — Default | QR code (320 px), Open in wallet, copy fallback (address, amount, memo), checklist, keep-tab-open warning, cost, testnet faucet link under the cost line (new tab, D-83) | FR-4, FR-5 |
| Pay — Sent | Done step, what happens next, nothing stored | S2 |
| Safety check — Question | 1 of 3, radio options, "runs offline", answers never sent | FR-10 |
| Safety check — Result | Two warnings + one OK, honest note on research age | FR-10 |
| Create inbox — 1 Desk key | Passphrase ×2, private key shown once, backup file, confirmation checkbox | FR-7 |
| Create inbox — 2 Viewing key (error) | Address, viewing key rejected because it can spend, tip floor, setup secret | FR-11, FR-16 |
| Create inbox — 3 Publish | Fingerprint + tip page link to publish in two places | FR-6 |
| Inbox — Default | Health (2 of 2 servers, lag), filter All / Below floor hidden, tip rows with every status, decrypt panel with tx id, block, confirmations, amount, honest limits | FR-12 to FR-16, FR-18, FR-19, NFR-11 |
| Inbox — Empty, watcher behind | Lag warning (1 server down, 14 blocks), empty state with tip page + fingerprint | FR-18, NFR-7 |
| Inbox — Locked | Unlock the passphrase-wrapped key, restore from backup | FR-7 |
| Desk — Restore | `/desk/restore`, where a browser with no desk key lands. Backup file picker, passphrase, "Restore and unlock", "Create a new inbox instead", "Judging Sealed?" callout on the judging deploy | FR-7 |
| Decrypt — Opened | Paste a memo, open it with no server | FR-8 |
| Decrypt — Unreadable | Non-Sealed memo is not rendered | FR-19 |
| Settings — Delete inbox | Tip floor, network (read-only), rotate token, backup file download with the current token (D-94), "Export the audit log first" link to the Audit trail page, delete with setup secret and typed confirmation | FR-16, FR-17, FR-9 |
| Inbox — Tip sealed | Selected tip as a sealed envelope with the real block and time, "Open with desk key" | FR-15 |
| Seal moment — storyboard (Sender page) | Four frames and a motion spec for the 1 second seal animation from Write to Pay | FR-2 (presentation only) |
| Audit trail — Verified | Chain verified tag, latest entry hash with copy, what is logged, testnet explorer link, entries newest first with a copy button per transaction id, export JSON | FR-20 |
| Audit trail — Chain broken | Danger tag, warning with next steps, broken row marked "Hash mismatch", same explorer link and copy buttons | FR-20 |

Not drawn as separate frames, because they come from component states: focus rings (Input Focus, Button Focus), copied state (Fingerprint Copied), pending/orphaned rows (Tip row + Status badge).

## Decisions made in this pass

| Decision | Options | Pick and why |
|---|---|---|
| App screen footer | Full dot-matrix footer vs slim one-line footer | Slim. The flow screens are tasks; the big footer belongs to the landing page only. |
| Byte counter | Plain number vs number + memo grid | Both. The grid makes "bytes, not characters" visible, and it is the hero code in static mode. |
| Over-limit input | Block keystrokes vs cut pasted text | Block and cut at a whole character (`truncateToBytes`), so a long paste is not lost entirely. |
| QR code size | 240 px vs 320 px | 320 px: a ZIP 321 link with a memo is ~900 characters (QR version ~21), too dense for small codes. |
| Spend-key error | Warn vs reject | Reject before sending to the server (FR-11, NFR-3): the key never leaves the browser. |
| Delete inbox | Single click vs typed confirmation | Typed "DELETE": it cannot be undone, and confirm() dialogs are easy to click through. |
| Safety check answers | Store for later vs tab memory only | Tab memory only; nothing sent or saved (FR-10, T-10). |

## Copy style rule

No dashes (— or –) and no semicolons to join phrases. Write two short sentences instead. Ranges are written out ("2017 and 2018"). Normal hyphenated words stay (receive-only, third-party). Checked across all Figma pages on Oct 11.

## Data wiring: every screen is real, not a mock

Nothing in the shipped UI is hard-coded sample data. Each value comes from one of four places: the build config, the browser (libsodium, IndexedDB), the Inbox API, or the visitor. The bracketed placeholders in Figma ([XXXX …], [utest1…]) mark exactly the spots that get real values.

| Screen | Real data and actions | Source |
|---|---|---|
| Landing | Desk address, public key, fingerprint, tip floor, network badge, judge box from `demo_desk` and `outbound_links` | Build config `sealed.config.json` (bundled, so a hacked API cannot swap the key). Optional check against `GET /v1/inbox/{id}` |
| Write | UTF-8 byte count, memo grid, sealing with `crypto_box_seal` | Browser only. The plaintext never leaves the tab (FR-2, NFR-1) |
| Pay | ZIP 321 link, QR code, copy buttons for address / amount / memo | Built in the browser from config + sealed memo. QR drawn by a self-hosted library. Faucet link from `outbound_links` (testnet only, a link, never fetched) |
| Pay, Sent | "I've sent it" only changes the screen | Browser only. The page never learns whether you paid, by design |
| Safety check | Questions, scoring, result | Browser only, works with the network off (T-10) |
| Create inbox 1 | Key pair, passphrase wrap (Argon2id via `crypto_pwhash`), IndexedDB, backup file | Browser only |
| Create inbox 2 | Register inbox. A spend-capable key is rejected in the browser before sending, and again on the server | `POST /v1/inbox` (setup secret) |
| Create inbox 3 | Issue desk token, show fingerprint + tip page link | `POST /v1/inbox/{id}/tokens` |
| Inbox | Tip list with status, polled every 30 s, decrypt in the browser, health line | `GET /v1/inbox/{id}/tips?after_seq=`, `GET /v1/health` |
| Inbox, Locked | Unlock the wrapped key | Browser only |
| Desk — Restore | Read the backup file, unwrap it with the passphrase (Argon2id), keep it in IndexedDB. Judge callout from `demo_desk` | Browser only. The file is never uploaded |
| Decrypt a memo | Paste and open a memo | Browser only, no server (FR-8) |
| Settings | Change tip floor, rotate token, download the backup file (browser only), delete inbox | `PATCH /v1/inbox/{id}` (new), `POST /v1/inbox/{id}/tokens`, `DELETE /v1/inbox/{id}` (new) |
| Audit trail | Entries, chain check in the browser, latest hash, export file | `GET /v1/inbox/{id}/audit` (api-contract §6.10). Verification and export run in the browser. Explorer link from `outbound_links` (testnet only, home page, never per transaction) |

**Two endpoints to add to the architecture API contract.** The Settings screen needs them and they are not in the current table:

- `PATCH /v1/inbox/{id}` with `{ tip_floor_zat }`, desk token. Re-sorts tips into below_floor without deleting any (FR-16).
- `DELETE /v1/inbox/{id}`, desk token plus setup secret. Removes the viewing key and every stored tip (FR-17, T-9).

## Copy to verify before the demo

- "When you pay from a shielded balance, the chain does not show who paid or how much." Depends on PRD spike 2 (pool transfer behaviour).
- Viewing key prefix `uviewtest` (testnet) / `uview` (mainnet) and the spending key example `secret-extended-key-test1…`: check against the wallet used in spike 3.
- "About 2 minutes after 3 confirmations" is the NFR-6 target, not a measured value.
