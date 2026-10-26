# Sealed

**A shielded tip line for newsrooms: sources send a tip sealed in their own browser, pay for it with Zcash, and only the desk can open it.**

A source who wants to reach a newsroom usually has two bad choices. Email and web forms hand the text to a mail provider, a form vendor or a hosting company. Specialist tools like SecureDrop protect the text but need Tor and a server the newsroom has to run. Either way, someone in the middle can read the tip or see who sent it, and small desks rarely have the staff to run the safe option.

Sealed seals the tip in the source's browser with the desk's public key before anything leaves the page. The source then pays a small shielded Zcash amount (0.001 ZEC) from their own wallet, and the sealed tip rides in the payment's encrypted memo. A watcher with a view-only key notices the payment and keeps the ciphertext. Only the desk's browser, which holds the private key, can open it. No account, no email address, no third-party script.

> **Zecathon 2026, Wildcard track.**

> **License:** MIT OR Apache-2.0, at your option ([LICENSE-MIT](LICENSE-MIT), [LICENSE-APACHE](LICENSE-APACHE)).

## Live

| What | Link |
|---|---|
| Tip page (testnet) | https://zecathon-sealed.vercel.app |
| Desk | https://zecathon-sealed.vercel.app/desk |
| Demo video (YouTube, unlisted, 1:48) | `TODO(@Apa): paste the YouTube link here and in the thumbnail below` |
| Repository | https://github.com/Nalen518/Zecathon-Sealed |
| Watcher health (public) | https://zecathon-sealed-production.up.railway.app/v1/health |

[![Sealed demo video](https://youtu.be/BvBu8b0EAfk)

| Network | Desk address | Desk key fingerprint |
|---|---|---|
| Zcash testnet (NU7, Ironwood pool) | `utest1wwkx7c9ehn53hf88katulsk6uypz7mdsdjkn3cdq2fr6mmy4gmae9777v7glcqvxjpvs7fxqx5ad6p37w04y25dsq9qkumgc27mfaqemn3mq9zvf24xkza9gwxrp3c7kpxcflxxm97w46v0qxpyl5vx6hefe3zje4vq0s64rsqvtarhu` | **`7AC9 FA20 45DA 2D28`** |

The tip page shows the same fingerprint before a source sends. If the two differ, stop.

## Try it (for judges)

1. **Get test ZEC.** Fund a testnet wallet at the [faucet](https://faucet.testnet.valargroup.dev/). It pays on the NU7 testnet the desk watches.
2. **Write a tip** at https://zecathon-sealed.vercel.app. Compare the desk key fingerprint with the one above, type a harmless sentence (up to 331 bytes) and seal it. The memo grid shows the tip turning into a 512-byte sealed memo.
3. **Pay.** On the Pay screen, copy the payment link (right-click `Open in wallet`, Copy link address) and pay it from a wallet that runs on the NU7 testnet. Phone wallets run on mainnet only, so on testnet use [zcash-devtool](https://github.com/zcash/zcash-devtool):
   ```bash
   zcash-devtool wallet -w <wallet> sync
   zcash-devtool wallet -w <wallet> pay --identity <wallet>.age --disable-confirmation --payment-uri "<link>"
   ```
   `--disable-confirmation` matters on Windows: without it, `pay` waits for an answer to a question it never prints.
4. **Check your payment on the explorer.** `pay` prints a transaction id. Look it up on the [testnet explorer](https://testnet.zecblock.com/): the transaction is fully shielded, and the amount and memo are encrypted.
5. **See the desk side.** The tip reaches the desk about 2 minutes after 3 confirmations, and only the desk can open it. The [demo video](#live) shows the desk receiving and opening a tip (0:43), and the audit trail recording it.

There is no shared judge key. The desk key never leaves the newsroom's browser, so nobody outside the desk can open a tip, judges included. To open tips yourself, [run your own desk](#run-your-own-desk) on testnet.

## Who it is for

Sealed is for newsrooms that want to be reachable by sources without running a server they can read, and for the sources who contact them. The desk publishes one link and one fingerprint. The source needs a browser and a Zcash wallet.

| User | What they need | How Sealed answers it |
|---|---|---|
| Source | Send a tip without an account, and without anyone in the middle reading it | The tip is sealed in the browser before it leaves. No sign-up, no email, no form vendor |
| Source | Know the page is really the desk's | The desk key fingerprint is shown on the page and published elsewhere to compare |
| Desk editor | Read tips without running a server that can read them | The private key lives only in the desk's browser. The server keeps ciphertext |
| Desk editor | Fewer junk submissions | Every tip costs a small shielded payment, set by the desk's tip floor |
| Desk lead | Show that nothing was changed or dropped | A hash-chained audit trail the desk verifies in its own browser |

### Why not email, a form or a general privacy layer

| Option | What leaks | Why Sealed differs |
|---|---|---|
| Email | The text to both mail providers, plus sender address, IP and time | The text is sealed before it leaves the browser, and there is no sender address |
| Web form | The text to the form vendor and the hosting company | The server stores only a sealed memo it cannot open |
| Encrypted messenger | Phone number or account, contact graph | No account. The tip arrives as a shielded payment memo |
| SecureDrop | Strong protection, but the newsroom runs and maintains the server, and sources need Tor | No server the desk has to run for reading. One link and a wallet. Sealed is not a SecureDrop replacement and says so |
| A general privacy layer (VPN, Tor alone) | The service on the other end still reads the text | The content is end-to-end sealed to the desk key, whatever the network path |

## Proof on testnet

| What | Transaction or link | What it proves |
|---|---|---|
| Tip sent on camera in the demo video | [`1b11aed4…08e1fd`](https://testnet.zecblock.com/tx/1b11aed4d5e3ed7dd5b03e9738b1ec0630267fa3945125813f7d7bdafc08e1fd), block 4,526,374, Oct 21 2026 | A sealed tip paid from zcash-devtool with the tip page's ZIP 321 link, received by the watcher and opened on the desk |
| Earlier tip to the same desk | [`b29953a5…87c19ac`](https://testnet.zecblock.com/tx/b29953a5d0d91fbba8f16ae0f455c4f9282132b325df77e3e438a8f1f87c19ac), block 4,526,336 | The same path, confirmed past 3 blocks |
| Watcher health | [`/v1/health`](https://zecathon-sealed-production.up.railway.app/v1/health) | The watcher is live, which chain server it uses and how far behind it is |
| Desk key | The fingerprint above, and `config.test.ts` | The shipped tip page seals to the key with this fingerprint |

Judges can check these without trusting Sealed. On the explorer, both transactions are fully shielded (Ironwood pool, amounts and memo encrypted). In the browser's Network tab, every request on the tip page goes to `zecathon-sealed.vercel.app` (and to the Railway API on the desk). The fingerprint can be recomputed from `desk_public_key` in `apps/web/sealed.config.json` as the first 16 hex characters of BLAKE2b-256 of the key.

## How it works

```
 Source browser                Zcash testnet                 Watcher (Railway)            Desk browser
 ──────────────                ─────────────                 ─────────────────            ────────────
 write tip
 seal to desk public key  ──►  shielded payment         ──►  view-only key (UFVK)    ──►  desk private key
 (crypto_box_seal)             0.001 ZEC                     sees the payment,             (IndexedDB, behind
 ZIP 321 link / QR             memo = sealed tip             keeps the sealed memo,        a passphrase)
                               (512 bytes, encrypted)        cannot open it or spend       opens the tip
                                                             audit hash chain     ──►      verifies the chain
```

**Seal.** The tip page pads the tip to a fixed length and seals it with libsodium `crypto_box_seal` to the desk's public key. The result is a 512-byte text memo (`z1:` plus base64), the same length for every tip. The plaintext never leaves the page.

**Pay.** The page builds a ZIP 321 payment link and QR code: the desk's shielded address, the amount and the sealed memo. The source pays it from their own wallet. Sealed never touches the source's wallet or keys.

**Watch.** The watcher polls a lightwalletd server every 30 seconds and finds payments to the desk with the desk's unified full viewing key, which can see incoming payments but cannot spend. It stores each memo as received, never opened, and marks a tip confirmed at 3 blocks.

**Open.** The desk unlocks its key with its passphrase and opens each tip in its own browser. The private key and the opened text never leave that browser.

**Audit.** Every change (inbox created, tip received, tip confirmed, token rotated) lands in a BLAKE2b hash chain over canonical JSON. The desk verifies the chain in its browser and can export it.

## What each party can see

| Party | Can see | Cannot see |
|---|---|---|
| **Source** | Their own tip, the desk's address, fingerprint and amount | Other tips |
| **Chain** | That a shielded transaction happened | Sender, recipient, amount or memo |
| **Server** (watcher and API) | That a payment arrived for the desk, its amount, time and the sealed memo | The tip text. It cannot open the memo or move funds |
| **Desk** | Every tip, opened in its own browser | Who sent it. The desk learns nothing about the source beyond what the tip says |

## Where it is in the code

| Claim | File | Test that proves it |
|---|---|---|
| The tip is sealed in the browser, every memo is the same length, a tampered memo or wrong key fails | `apps/web/src/lib/seal.ts` | `apps/web/tests/unit/seal.test.ts` (T-1) |
| The tip text never appears in any request | `apps/web/src/lib/api.ts` | `apps/web/tests/e2e/sender.spec.ts` (T-3) |
| Writing, sealing and paying work with the network off | `apps/web/src/app/screens` | `apps/web/tests/e2e/sender.spec.ts` (T-10) |
| The payment link is valid ZIP 321 and refuses transparent addresses | `apps/web/src/lib/zip321.ts` | `apps/web/tests/unit/zip321.test.ts` (T-2) |
| The desk key is stored only behind the passphrase (Argon2id), never in clear | `apps/web/src/lib/keystore.ts` | `apps/web/tests/unit/keystore.test.ts`, `tests/e2e/desk.spec.ts` (T-9) |
| The shipped tip page seals to the published fingerprint | `apps/web/src/lib/fingerprint.ts`, `sealed.config.json` | `apps/web/tests/unit/config.test.ts` |
| No third-party URLs, no cookies or local storage, only one file calls `fetch` | `apps/web/src` | `apps/web/tests/unit/rules.test.ts`, `tests/e2e/landing.spec.ts` |
| A spending key is refused, only a viewing key is accepted | `apps/web/src/lib/viewingKey.ts`, `apps/watcher/crates/api` | `apps/web/tests/unit/viewingKey.test.ts`, `spend_key_is_refused_before_the_network_check` |
| The viewing key is encrypted at rest | `apps/watcher/crates/store/src/seal.rs` | `viewing_key_is_encrypted_in_the_row_and_opens_with_the_key` |
| The watcher stores memos but never opens them | `apps/watcher/crates/chain/src/watcher.rs` | `memos_are_stored_as_received_and_checked_but_never_opened` |
| Tips confirm at 3 blocks and survive reorgs | `apps/watcher/crates/chain`, `crates/store` | `a_tip_turns_confirmed_at_three_and_its_seq_moves`, `a_three_block_reorg_orphans_lost_tips_and_revives_remined_ones` |
| The audit trail is a hash chain the browser verifies | `apps/watcher/crates/core/src/audit.rs`, `apps/web/src/lib/audit.ts` | `every_change_lands_in_a_valid_hash_chain`, `apps/web/tests/unit/audit.test.ts` (T-11) |
| Every API response carries privacy headers and no cookie | `apps/watcher/crates/api/src/edge.rs` | `every_response_carries_the_privacy_headers_and_no_cookie` |

Rust tests live in `apps/watcher/crates/*/src/tests.rs`. Shared JSON fixtures in `contracts/fixtures` keep both sides byte for byte in step.

## What uses Zcash

| Zcash feature | How Sealed uses it | Status |
|---|---|---|
| Shielded memo (512 bytes) | Carries the sealed tip. The chain sees only an encrypted transaction | Working on testnet (NU7, Ironwood pool) |
| ZIP 321 payment link and QR | One link holds the address, amount and sealed memo | Working on testnet with zcash-devtool. Mainnet wallets with ZIP 321 memo support not tested yet |
| Unified full viewing key | The watcher finds tips without any ability to spend | Working on testnet |
| ZIP 317 fees | The desk's tip floor must cover the fee, checked in config | Working |
| librustzcash pre-release crates (`zcash_client_backend 0.25.0-pre.1`) | Needed to read the NU7 testnet | Working on testnet. Mainnet not deployed |

## Keys

```
 Desk browser                                   Server (Railway)
 ────────────                                   ────────────────
 desk key pair (X25519)                         unified full viewing key
   private key ── Argon2id(passphrase) ──┐        encrypted at rest (XChaCha20-Poly1305,
   + desk token                          │        SEALED_DB_KEY)
   wrapped in IndexedDB ◄────────────────┤      desk token: BLAKE2b hash only
                                         │      setup secret: hash only
 backup file (same wrapped record) ◄─────┘
 public key + fingerprint ──► tip page config, README
```

- The desk key pair is made in the desk's browser. The private key never leaves it unwrapped.
- The backup file is the same wrapped record, so it is useless without the passphrase. Keep the two apart.
- The server holds only a view-only key, encrypted at rest, and hashes of the token and setup secret.

| Key | Lives | If it leaks |
|---|---|---|
| Desk private key | Desk browser, wrapped by the passphrase. Backup file | Every tip ever sent can be opened. Create a new desk and publish the new fingerprint |
| Passphrase | The editor's head | Alone it opens nothing. With the backup file or the browser it unlocks the desk key |
| Backup file | Offline copy the desk keeps | Alone it opens nothing (wrapped). With the passphrase it is the desk key |
| Desk token | Wrapped next to the desk key. Hash on the server | Metadata only (times, amounts, sealed memos). Rotate it in Settings, which revokes the old one |
| Unified full viewing key | Server, encrypted with `SEALED_DB_KEY` | Incoming payments to the desk become visible (amounts, times, sealed memos). No spending, no tip text |
| `SEALED_DB_KEY` | Railway variable | Opens the stored viewing key. Rotate both |
| Setup secret | The desk lead. Hash on the server | Inbox setup, token issue and delete. Change the hash and redeploy |

## Watcher (backend)

- Watches one desk address on one network through lightwalletd, every 30 seconds. Mainnet needs at least two servers that agree, testnet allows one.
- Finds tips with the view-only key, stores each sealed memo once, tracks confirmations up to 10, and orphans tips lost in a reorg instead of deleting them.
- Stores everything in SQLite on a Railway volume. The viewing key is encrypted at rest. Runs as a non-root user.
- Writes every change to the audit hash chain (BLAKE2b-256 over canonical JSON, starting from 64 zeros). Entries cannot be edited or deleted while the inbox exists.
- Rate limits by client address, read only from the last `X-Real-IP` value the edge adds.

**Status:** live on Railway since Oct 20 2026 for the testnet demo desk, deployed from `main`, with one testnet lightwalletd server. The watcher is written in Rust on librustzcash, with an Axum API (`crates/api`), the chain scanner (`crates/chain`), storage (`crates/store`) and shared types and the audit chain (`crates/core`).

## What you have to trust

| What you trust | Why, or how to check it |
|---|---|
| The tip page's JavaScript | It is served by Vercel. Compare the desk key fingerprint on the page with the one published here and elsewhere. The page uses a strict content security policy and no third-party scripts (check the Network tab) |
| libsodium | Widely reviewed. Sealed uses `crypto_box_seal`, `crypto_pwhash` (Argon2id) and `crypto_generichash` only |
| The source's wallet | Builds the shielded payment. Sealed never sees it |
| The watcher | Sees that payments arrive, their amounts and times, and the sealed memos. It cannot read tips or spend. Check `/v1/health` and the audit trail |
| The desk's own device | Where tips are opened. A compromised desk computer exposes the opened tips |

**What is NOT protected:**

- **Wallet history.** Where the source got their ZEC can link them to the payment. Buying ZEC on an exchange is often traceable. The landing page and the safety check say so before the source pays, and the Sent screen repeats it.
- **Network metadata.** The source's IP address reaches Vercel when the page loads, and the source's wallet talks to its own server. Sealed does not hide this. Use Tor or a trusted network for that.
- **Who uses the tip page.** Visiting the page is visible to the network and the host, like any website.
- **Timing.** The desk and the server see when a tip arrives.

## What comes next

- A mainnet desk with two or more lightwalletd servers and the stable librustzcash crates.
- Tested phone wallet support for the payment link and QR on mainnet.
- Clear Tor guidance on the tip page for sources who need to hide their network.
- More than one desk per deploy (today one deploy serves one desk).
- A signed or reproducible build of the tip page, so a source can check the JavaScript as well as the fingerprint.

## What is real

| Feature | Working on testnet | Mainnet | Not built |
|---|---|---|---|
| Seal in the browser, 512-byte memo | ✅ | Same code | |
| ZIP 321 link and QR | ✅ (zcash-devtool) | Not tested with mainnet wallets | |
| Watcher with view-only key | ✅ Live on Railway | Same code, not deployed | |
| Desk: create, open, lock, restore from backup | ✅ | Same code | |
| Audit trail verified in the browser | ✅ | Same code | |
| Tip floor (spam filter) | ✅ | Same code | |
| Offline sealing (no network needed) | ✅ | Same code | |
| Tor guidance for sources | | | ✅ |
| Several desks per deploy | | | ✅ |

## Run it locally

```bash
# Frontend (Node 24+, pnpm)
pnpm install
pnpm dev                 # http://localhost:5173
pnpm test                # unit tests (Vitest)
pnpm test:e2e            # end to end (Playwright)

# Backend (Rust, see apps/watcher/rust-toolchain.toml)
cd apps/watcher
cargo test
echo '<your setup secret>' | cargo run --release --bin sealed -- hash-secret
SEALED_NETWORK=test SEALED_INBOX_ID=desk \
SEALED_LIGHTWALLETD_URLS=https://testnet.zec.rocks:443 \
ALLOWED_ORIGINS=http://localhost:5173 \
SEALED_SETUP_SECRET_HASH=<hash from above> \
SEALED_DB_PATH=./sealed.db SEALED_DB_KEY=<32 random bytes, base64> \
PORT=8787 cargo run --release --bin sealed

# Config: point the tip page at your watcher
# apps/web/sealed.config.json → "api_base_url": "http://localhost:8787/v1"
```

Every backend variable is listed in [`docs/api-contract.md`](docs/api-contract.md) §8.

## Run your own desk

One deploy serves one desk, because the tip page seals to the desk key bundled in its config. To run a desk for your newsroom:

1. **Wallet.** A Zcash wallet with a shielded unified address for tips, and its unified full viewing key (receive only, it cannot spend).
2. **Watcher.** Deploy `apps/watcher` (Railway, with a volume for the database) with the variables in [`docs/api-contract.md`](docs/api-contract.md) §8: `SEALED_NETWORK`, `SEALED_INBOX_ID`, `ALLOWED_ORIGINS`, `SEALED_LIGHTWALLETD_URLS` (at least two on mainnet, one is allowed on testnet), `SEALED_SETUP_SECRET_HASH`, `SEALED_DB_PATH` and `SEALED_DB_KEY` (32 random bytes in base64, which encrypts the viewing key). Railway sets `PORT`. Make the setup secret hash with `echo '<your secret>' | sealed hash-secret`, so the secret itself is never stored. Leave `SEALED_DEMO_INBOX_ID` unset: it is only for the testnet judging deploy.
3. **Desk key.** Open `/desk/create` on your tip page. The browser makes the desk key, locks it with your passphrase and gives you a backup file. Then it registers the inbox with the viewing key and the setup secret.
4. **Tip page.** Put `desk_public_key`, `fingerprint`, `address` and `api_base_url` in `apps/web/sealed.config.json` and redeploy the frontend (Vercel).
5. **Publish the fingerprint** in at least two places sources already trust, such as this README and your newsroom's contact page.

Keep the backup file and passphrase apart, and never commit the backup file. Test on testnet with a small tip before you announce the page.

## Repo layout

| Path | What it holds |
|---|---|
| `apps/web` | Tip page and desk (Vite, React, TypeScript, libsodium), deployed on Vercel |
| `apps/web/src/lib` | Sealing, keystore, fingerprint, ZIP 321, audit verification, API client (no React) |
| `apps/web/tests` | Unit tests (Vitest) and end to end tests (Playwright) |
| `apps/watcher` | Rust watcher and Inbox API on librustzcash, deployed on Railway |
| `apps/watcher/crates` | `core` (types, audit chain), `store` (SQLite), `chain` (scanner), `api` (HTTP) |
| `contracts/fixtures` | Shared JSON fixtures that both sides test against |
| `docs` | The architecture and the API contract |
| `media` | Images for this README |

## Docs

- [Architecture](docs/Architecture%20Shielded%20Tip%20Line%20(Zecathon,%20Wildcard).md): components, trust boundaries and the choices behind them
- [API contract](docs/api-contract.md): every request, field, error and configuration value, with the contract changes (C-xx)

Product notes, decisions and design critiques are kept private, so this repository publishes only the architecture and the contract.

## Team

- **[@Nalen518](https://github.com/Nalen518)**: product, design, frontend, backend and the demo video

Sealed is a solo build, designed and shipped within the Zecathon 2026 window.
