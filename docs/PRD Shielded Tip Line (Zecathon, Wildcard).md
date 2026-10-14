# PRD: Shielded Tip Line (Zecathon, Wildcard)

Oct 11, 2026 · @Apa

## 1. Problem and summary

A source with sensitive information still lacks a tip channel that is cheap to run, hard to spam and private on the payment side; the Zcash memo field can carry one.

- **Problem.** Newsrooms and NGOs take tips by email, Signal or SecureDrop. SecureDrop needs Tor and usually a guided install, and desks report spam and malware in it ([Tow Center summary](https://mediashift.org/2016/06/four-highlights-from-tow-centers-securedrop-report)). Zcash shielded memos are encrypted on-chain, but the memo field alone lacks secure-messaging properties ([ZecSec](https://defuse.ca/zecsec.htm)), and wallets do not display binary memos ([ZIP 302](https://zips.z.cash/zip-0302)).
- **Product.** A tip desk publishes a Zcash address and a public key. A source writes a message in the browser; the page seals it to that key and gives the source's own wallet a ZIP 321 payment link carrying the ciphertext as the memo. A watcher on Railway holding a view-only key lists arriving ciphertext, and the desk decrypts it in its own browser.
- **Sender-safety check.** A client-side checklist that shows the source how their ZEC funding path, timing and network could link them to the tip.
- **Track and constraints.** Wildcard track, one builder, frontend on Vercel, backend on Railway, real ZEC from the start (testnet first, mainnet for the demo).

## 2. Users and user stories

The first user is the operator of a tip desk at a small newsroom; the second is the source who writes to them. Audience confirmed: a newsroom tip desk.

| ID | As a | I want | Acceptance criteria |
| --- | --- | --- | --- |
| S1 | Source | to write a tip and see it sealed before anything is sent | The message never appears in a network request; a counter shows the 512-byte memo limit |
| S2 | Source | to pay from my own wallet by tapping a link or scanning a QR code | The ZIP 321 link is valid, the memo is at most 512 bytes decoded, and the amount equals the desk's tip floor |
| S3 | Source | a safety check on how my ZEC and device could expose me | It runs offline in the browser; no answers are sent or stored |
| S4 | Desk operator | to create an inbox with a key pair made in my browser | The private key never leaves my device and is shown once |
| S5 | Desk operator | to register my address and view-only key with the watcher | The server holds no spending key, and I can delete the inbox and its data |
| S6 | Desk operator | to see arriving tips and decrypt them locally | The list shows tx id, height and time; the server stores ciphertext only |
| S7 | Desk operator | tips below my floor flagged as spam | A minimum amount is set per inbox and applied to the list |

## 3. Goals, non-goals and judging fit

The build must prove one claim with real ZEC: a message goes from a browser to a desk that alone can read it, with no server holding keys or plaintext.

| Judging criterion | How the build meets it |
| --- | --- |
| Privacy (a gate, not a score) | Keys live only in browsers and wallets; servers keep ciphertext; section 7 lists every known leak with its mitigation or disclosure |
| Usefulness | One Monday scenario: a desk publishes one page and checks one inbox; self-hostable |
| Execution | The P0 flow works with real shielded transactions before any extra feature; cut lines are in section 9 |
| Originality | Written in the build window; no fork of an existing wallet or product; AGPL-licensed SDKs avoided |

**Non-goals**

- Replacing SecureDrop or promising sender anonymity at the network layer.
- Custody of funds, accounts, chat or replies in the first version.
- NEAR Intents: ZEC there is transparent-only and memos only work on shielded addresses, so a swap cannot carry a tip ([chain support](https://docs.near-intents.org/resources/chain-support), [ZIP 321](https://zips.z.cash/zip-0321)).

## 4. Functional requirements

P0 is a complete tip with no server at all; P1 adds the inbox that makes it usable by a desk.

| Priority | Requirement |
| --- | --- |
| P0 | Tip composer: seal the message in the browser with a libsodium sealed box (48 bytes of overhead), padded, within the 512-byte memo |
| P0 | Text memo as the default (z1: plus base64, 331 bytes of message, measured Oct 11); an optional binary memo (0xFF first byte, 460 bytes of message) only if wallets keep it intact. Exact format is in the SRD |
| P0 | ZIP 321 link and QR code with the desk's address, the tip floor (default 0.001 ZEC) and the memo |
| P0 | Desk key generation in the browser and a local decrypt page where the desk pastes a memo, which works with no server |
| P0 | Testnet and mainnet switch |
| P1 | Railway watcher in Rust on librustzcash: view-only account, polls a public lightwalletd, stores tx id, height, time, amount and ciphertext |
| P1 | Inbox API and desk inbox page, with a per-inbox tip floor that flags low tips |
| P1 | Sender-safety check: client-side questions on funding path, timing and network, with plain guidance |
| Later | Reply channel (the sender includes a one-time address and the desk answers by memo), multi-server cross-checking, one-click Railway deploy template |

## 5. Architecture

&#91;embedded content: architecture · 7 components, 6 flows\]

Keys exist only in the sender's wallet and the desk's browser; the watcher holds a view-only key and sees ciphertext. Both browser pages come from Vercel; the watcher and the API run on Railway.

**Memo format.** A libsodium sealed box: a 32-byte ephemeral public key, the encrypted message and a 16-byte tag, placed in the 512-byte memo as base64 text prefixed "z1:" (default, decided Oct 11): it fits 331 bytes of message and works with a payment link, a QR code and copy-paste into any wallet. A binary layout (0xFF, version byte, sealed box, fixed 512 bytes) fits 460 bytes and was verified to round-trip, but it cannot be pasted, so it is optional and used only if wallets are shown to keep it intact. The sender page always shows a payment QR/link plus a "copy address, amount and memo" fallback, because desktop browsers have no wallet standard like MetaMask's window.ethereum.

**Proposed stack**

- Frontend: Vite, React and TypeScript as a static build on Vercel, libsodium for sealing, a QR library, no analytics or third-party scripts.
- Backend: a Rust service on Railway using librustzcash, SQLite on a Railway volume, polling several public lightwalletd servers.
- Fallback: P0 needs no backend, so the demo survives if the watcher slips.

## 6. Verified integrations and resources

Real ZEC needs four pieces: ZIP 321 links, a Rust watcher on librustzcash, a public lightwalletd server and the sender's own wallet; the other resources you gathered are reference or deliberately skipped. Checked on 2026-10-11 from the pages linked.

| Resource | Role in this build | Verdict |
| --- | --- | --- |
| [ZIP 321](https://zips.z.cash/zip-0321) | Payment link with a `memo` parameter (base64url, at most 512 bytes decoded, invalid on transparent addresses); some wallets may ignore the memo | Use |
| [ZIP 302](https://zips.z.cash/zip-0302) | Memo layout: a 0xFF first byte means arbitrary bytes; status Draft | Use as a convention |
| [ZIP 317](https://zips.z.cash/zip-0317) | Fee of 5,000 zatoshis per logical action with a minimum of 2, so 0.0001 ZEC; this is the spam floor | Use |
| [librustzcash](https://github.com/zcash/librustzcash) | Watcher crates: zcash\_client\_backend, zcash\_client\_sqlite, zcash\_keys, zcash\_address, zip321; includes a pool-migration crate built for Ironwood; cannot judge consensus validity | Use |
| [zcash-devtool](https://github.com/zcash/zcash-devtool) | CLI on the same crates for testnet experiments; its authors say not to use it in production | Reference and testing only |
| Public lightwalletd servers | zec.rocks (na, eu, ap, sa), ChainSafe stardust, testnet.zec.rocks, all on port 443 with TLS, as listed in a [third-party crate](https://docs.rs/zync-core/latest/src/zync_core/endpoints.rs.html) | Use; verify each is live |
| Testnet | Ironwood testnet activation was scheduled for July 4, 2026 at height 4134000 ([zcashd notice](https://zcash.github.io/zcash/user/end-of-life.html)); test coins come from a faucet | Use first |
| [Zebra](https://github.com/ZcashFoundation/zebra) | Full node without a wallet; zcashd is end-of-life | Not run by us |
| [Zallet](https://github.com/zcash/zallet/releases) | Alpha wallet with JSON-RPC that now scans full blocks, so it needs a node | Skip |
| [zcash-walletd](https://github.com/hhanh00/zcash-walletd) | View-only REST watcher, Sapling only, built for BTCPay | Fallback only |
| [WebZjs](https://github.com/ChainSafe/WebZjs) | Browser wallet library needing a gRPC-web proxy; the README pins a 2024 toolchain and does not mention Ironwood | Skip: no browser wallet needed |
| [Zodl repositories](https://github.com/zodl-inc) | Wallet SDKs; the Android SDK is AGPL-3.0 | Skip entirely; zcash-devtool on the laptop is the test sender wallet (backend B-20, Oct 13) |
| [NEAR Intents](https://docs.near-intents.org/) | Cross-chain swaps with transparent ZEC only | Skip |

## 7. Threat model and privacy requirements

No server in this design can read a tip or spend funds, but three things still leak: network metadata, the sender's funding trail, and the trust placed in the page's JavaScript.

| Observer | What they can see | Mitigation or disclosure |
| --- | --- | --- |
| Chain observer | That a shielded transaction happened, and its fee | Shielded to shielded only; whether a transfer between pools publishes its value is a protocol property to confirm in spike 2 |
| lightwalletd operator | A client's IP, traffic timing and block-height fingerprint ([Nym analysis](https://zcash-sdk.nym.com/)) | The watcher queries more than one server; senders are told to use Tor or a VPN. A compromised server cannot read memo or value ([Zashi threat model](https://github.com/Electric-Coin-Company/zashi/blob/main/wallet_threat_model.md)) |
| Our servers | Page loads, ciphertext, tx ids and amounts for registered inboxes; never plaintext or keys | Encryption in the browser, no analytics or third-party scripts, strict content security policy; platform request logs are outside our control and are disclosed |
| Whoever controls the web page | Could swap the public key or script and read plaintext | The main browser-crypto risk: the desk publishes its key fingerprint on its own site, the page checks it, the build is open source with pinned dependencies; disclosed as a limit |
| Sender's funding trail | Exchange withdrawals and swap amounts and timing, matched by round-trip heuristics ([Kappos et al.](https://blog.acolyer.org/2018/09/14/an-empirical-analysis-of-anonymity-in-zcash/), [Quesnelle](https://arxiv.org/abs/1712.01210)) | The sender-safety check explains the risk; that research used 2017 and 2018 data, so today's match rates are unknown |
| Spammer | Nothing; only a cost | Each tip pays the network fee (0.0001 ZEC minimum) plus the desk's floor, and low tips are flagged |

**Honest limits**

- A desk's view-only key also shows outgoing transactions, so the desk uses a dedicated receive-only account and sweeps from a separate wallet.
- The sender must hold ZEC first, and buying it is often traceable.
- This is not a SecureDrop replacement; it suits sources who can already use a Zcash wallet.

## 8. Risks and Day-1 spikes

Four testnet spikes, doable in one sitting, decide whether the plan holds; the go or no-go should be known by Oct 13.

| Spike | Question | Pass looks like | Fallback |
| --- | --- | --- | --- |
| 1. Memo link | Sizes and round trips verified Oct 11 (sealed box adds 48 bytes; text 331, binary 460). Still open: does a wallet keep the memo from a ZIP 321 link, and from paste, on testnet? Any desktop or phone wallet answers it; not a blocker. | The memo arrives byte for byte | Text memo is already the default; if links drop the memo, the sender uses the copy-paste flow |
| 2. Ironwood scan | Does a view-only account on librustzcash decrypt a testnet memo sent to a unified address? | The memo appears in the watcher | Pin an older crate version, or use a Sapling-only address with zcash-walletd (smaller pool) |
| 3. Key export | Which wallet exports a viewing key for a dedicated receive account, and does the watcher accept it? | Export works and the watcher syncs | Create the account with zcash-devtool on the desk's machine |
| 4. Railway fit | Do the Rust build, a volume and outbound gRPC to lightwalletd run on Railway? | Sync from a recent birthday height finishes in minutes | Run the watcher locally for the demo video |

Other risks: a first Rust service built alone; librustzcash and devtool interfaces change without warning (devtool says so); none of these libraries is audited; and the exact submission deadline is unconfirmed.

## 9. Build plan

&#91;embedded content: build plan · 5 phases, repo public Oct 28\]

Nothing from the watcher phase starts until one real shielded tip has been sent and decrypted on testnet. Cut lines: if the watcher is not syncing by Oct 20, ship P0 with manual paste-to-decrypt and show the inbox locally; if the safety check slips, ship it as a static page.

## 10. Decisions and open questions

- [x] Audience: decided, a newsroom tip desk.
- [x] Hosting: self-hostable single-tenant (Railway template) plus one hosted demo, or a multi-tenant service? Decided: self-hostable.
- [x] Track: Wildcard, as decided. Each submission enters exactly one track; check in the FAQ whether the track can be changed before the deadline.
- [x] Deadline: only the Oct 28 repo-public date is known; confirm the exact time and whether judges need a live mainnet demo.
- [x] Tip floor: decided, 0.001 ZEC per tip, ten times the 0.0001 ZEC network fee (about $0.90 at roughly $900 per ZEC; check the live price) and adjustable per inbox.
