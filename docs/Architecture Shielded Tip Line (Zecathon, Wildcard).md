# Architecture: Shielded Tip Line (Zecathon, Wildcard)

Oct 11, 2026 · @Apa

The tip line is two static pages and one small Rust service: the sender page seals a tip in the browser, a normal Zcash wallet pays it, and a watcher reads the memo with a view-only key so only the desk's browser can decrypt it.

## 1. Components

Five components; only the desk browser and the sender's wallet ever hold secrets.

| Component | Runs on | Tech | Owns | Never holds |
| --- | --- | --- | --- | --- |
| Sender page | Vercel (static) | Vite, React, TypeScript, libsodium-wrappers-sumo, qrcode-generator | Seals the tip, builds the ZIP 321 link and QR, runs the sender-safety check | Any plaintext after the tab closes |
| Desk page | Vercel (static) | Same app, separate route | Generates the desk keypair, decrypts memos, shows the inbox | The private key outside the browser (stored passphrase-wrapped in IndexedDB) |
| Watcher | Railway | Rust, librustzcash (zcash\_client\_backend, zcash\_client\_sqlite), view-only key | Scans shielded transactions, extracts memos, stores ciphertext | Spending keys, plaintext, desk private key |
| Inbox API | Railway (same process as the watcher) | Rust HTTP server | Serves ciphertext to the desk, publishes the public key and fingerprint | Anything that identifies a sender |
| Sender's wallet | Sender's device | Any Zcash wallet | Spends ZEC, attaches the memo | Not ours |

Flow: the sender page seals the message to the desk public key; the wallet pays the desk's shielded address with the memo; the watcher sees the transaction through public lightwalletd servers and stores the ciphertext; the desk page fetches it and decrypts locally.

The server keeps only ciphertext, transaction id, block height, time and amount. P0 can run with no backend at all: the desk pastes the memo from its own wallet into the decrypt page.

## 2. Key decisions

Each row is a choice with a real alternative; the pick is the one I would defend to a judge.

| Decision | Options | Pros | Cons | Pick |
| --- | --- | --- | --- | --- |
| Watcher language | Rust with librustzcash vs Node calling zcash-walletd (Sapling-only REST) | Rust is the supported scanning path, handles current pools; walletd is a ready REST service with no Rust code to write | Rust build is slower and you write more glue; walletd covers only Sapling, which may exclude Ironwood-era addresses | Rust, with walletd as the spike-2 fallback |
| Storage | SQLite on a Railway volume vs Postgres | SQLite is one file, matches the librustzcash wallet DB, nothing extra to run | Single writer, volume must be kept; Postgres survives redeploys more easily | SQLite on a volume; the demo needs one writer |
| Desk key custody | Browser-generated key in IndexedDB vs key on server vs hardware key | Browser key means a server breach leaks only ciphertext; zero server trust | Lost passphrase or cleared browser means lost tips; one device | Browser key with an exportable, passphrase-wrapped backup file |
| Memo encoding | Text with z1: prefix vs binary 0xFF | Text works via link, QR and paste (verified sizes: 331 bytes message) | Costs about 28% of capacity versus binary's 460 bytes | Text default, binary optional |
| Chain data source | Several public lightwalletd servers vs our own Zebra plus Zaino | Public servers cost nothing and need no ops | Servers see our IP and scan timing; any one can be down or lie | Poll at least two public servers, compare tip heights; own node is a post-hackathon item |
| Desk-to-API auth | Random bearer token (hash stored) vs signed requests from the desk key | Token is trivial to build and revoke | Token theft reveals metadata (times, amounts), not content | Bearer token; ciphertext is safe even if it leaks |
| Wallet integration | Link/QR plus copy-paste vs in-browser wallet | No keys in our page, works on desktop and mobile | Sender needs ZEC and a wallet first | Link/QR plus copy-paste |

One point I would not trade: the sender page is a trust point. If an attacker alters the served JavaScript they can swap the public key. Mitigations are an open-source repo, pinned dependencies and a key fingerprint the newsroom publishes elsewhere (its masthead or social account) so a sender can compare.

## 3. Data model

One SQLite file beside the librustzcash wallet database; the app tables below hold no plaintext and no sender data.

| Table | Columns | Purpose |
| --- | --- | --- |
| inbox | id, name, desk\_pubkey, fingerprint, tip\_floor\_zat (default 100000 = 0.001 ZEC), created\_at | One row per tip line; the public key is what the sender page seals to |
| tip | id, inbox\_id, txid, output\_index, height, block\_time, amount\_zat, memo\_ct (512 bytes as received), status, seen\_at | One row per received shielded output carrying a memo |
| desk\_token | inbox\_id, token\_hash, created\_at, revoked\_at | Bearer tokens for the desk page, stored hashed |
| sync\_state | server\_url, last\_height, last\_checked\_at, ok | Health of each lightwalletd source |
| audit\_log | inbox\_id, seq, at, type, actor, details\_json, prev\_hash, hash | Tamper-evident desk activity log (FR-20, api-contract §5.6). Each entry is written in the same transaction as the change it records and is never updated. Rows go only when the whole inbox is deleted (C-13) |

Tip status is stored as three fields (chain_state, below_floor, format_ok) plus a seq column, and the API derives one display_status with a fixed precedence. See api-contract.md §5.3. The display values are: pending (seen, fewer than the confirmation depth), confirmed, orphaned (dropped by a reorg), below\_floor (amount under the inbox floor, kept but hidden by default), unreadable (memo is not in our format).

The 0.001 ZEC floor is 100,000 zatoshis; the network's own minimum fee under ZIP 317 is 10,000 zatoshis (2 logical actions at 5,000), so the floor is 10 times the fee and mainly screens bulk spam.

## 4. API contract

Summary only. The full request and response contract, error codes and shared rules are in `docs/api-contract.md`, which wins on any conflict. JSON over HTTPS. Responses are sent with no-store caching and set no cookies. The sender page needs only the first endpoint, and only to compare with its bundled config.

| Method and path | Auth | Returns |
| --- | --- | --- |
| GET /v1/inbox/{id} | none | name, desk public key, fingerprint, shielded address, tip floor |
| GET /v1/inbox/{id}/tips?after_seq={seq}&filter={visible,below_floor,all} | desk token | new or changed tips since seq: id, seq, txid, height, time, amount, memo\_b64, chain\_state, below\_floor, format\_ok, display\_status, plus counts |
| GET /v1/inbox/{id}/tips/{tipId} | desk token | one tip |
| POST /v1/inbox | setup secret | creates an inbox from the desk public key and the receive-only UFVK |
| POST /v1/inbox/{id}/tokens | setup secret or current desk token | issues or rotates a desk token; earlier tokens are revoked |
| PATCH /v1/inbox/{id} | desk token | updates tip_floor_zat; tips are re-sorted into or out of below_floor, none deleted (FR-16) |
| DELETE /v1/inbox/{id} | desk token and setup secret | deletes the inbox, its viewing key, tokens and every stored tip; returns 204 (FR-17, T-9) |
| GET /v1/health | none | per-source tip height, last sync, lag in blocks |
| GET /v1/inbox/{id}/audit?after\_seq={seq} | desk token | audit entries in seq order with prev\_hash and hash, verified in the browser (FR-20) |

Added Oct 11 for the Settings screen: PATCH and DELETE above. Design rules: polling uses a change sequence (seq) so status changes reach the desk, not only new tips; no endpoint ever accepts a memo from a sender (the memo only travels on-chain); rate-limit by token and by IP, but do not log IPs on the public endpoint.

## 5. Watcher and failure modes

The watcher loops every 30 seconds: ask each configured lightwalletd for its chain tip, fetch compact blocks from the last scanned height, trial-decrypt outputs with the view-only key, then fetch the full transaction for each match to read the memo. A new inbox starts from a recent birthday height so the first sync takes minutes, not hours.

| Failure | What the user sees | Handling |
| --- | --- | --- |
| One lightwalletd is down | Nothing | Fall back to the next server; /health shows the lag |
| Servers disagree on the tip | Delay | Trust the highest tip only when a second server confirms the block hash |
| Chain reorg | A tip flips to orphaned | Rescan from the fork height; tips below the confirmation depth stay pending |
| Watcher restarts | Brief delay | Resume from sync\_state; inserts are keyed by txid and output index, so no duplicates |
| Railway volume lost | Tips disappear from the desk | Rebuild by rescanning from the birthday height; the chain is the source of truth, the desk keeps its own export |
| Memo not in our format | Tip marked unreadable | Show amount and time; never try to render it |
| Wallet dropped the memo | Tip arrives with no memo | Show as empty tip; the sender page tells the sender to keep the memo copy until paid |
| Spam below the floor | Hidden by default | Counted, never deleted |

Two trade-offs worth stating. Polling every 30 seconds is cheap and simple but adds up to 30 seconds of delay, which is fine for a tip desk; a streaming subscription would be faster and adds a reconnect state machine. A confirmation depth of 3 blocks balances delay against reorg risk; this is a judgment call I would revisit once we see testnet behavior.

## 6. Carried into the SRD

These stay unproven until the spikes run; the SRD marks each requirement that depends on one.

- **Wallet memo handling.** Whether wallets keep the memo from a payment link and from paste (spike 1, any wallet).
- **View-only scan on current pools.** Whether the pinned librustzcash version decrypts a testnet memo under Ironwood (spike 2).
- **Key export.** Which wallet exports a viewing key for a dedicated receive-only account (spike 3).
- **Railway fit.** Rust build time, a volume and outbound gRPC (spike 4).
- **Lightwalletd availability.** That the testnet servers named in the PRD are live today.
- **Submission deadline.** Only the Oct 28 repo-public date is known; confirm the exact cut-off.

Next in sequence: the PRD becomes the SRD, with numbered requirements, acceptance tests and traceability to the user stories, then design starts from the sender page and the desk inbox.
