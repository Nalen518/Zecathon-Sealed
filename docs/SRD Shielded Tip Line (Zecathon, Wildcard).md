# SRD: Shielded Tip Line (Zecathon, Wildcard)

Oct 11, 2026 · @Apa

**Product name: Sealed** (locked Oct 11). Domain and trademark availability not yet checked; fallback name Tipseal.

This SRD turns the PRD's seven user stories into numbered, testable requirements that the build, the demo video and the judges' Execution score can all be checked against.

## 1. Scope and conventions

The system is the sender page, the desk page, the Inbox API and the watcher described in the architecture doc. The sender's wallet and the Zcash network are outside it.

- **IDs.** FR-n for functional, NFR-n for non-functional, T-n for tests. Stories S1 to S7 are those in the PRD.
- **Priority.** P0 must work for a submission with no backend; P1 completes the demo with the watcher; Later is out of scope.
- **Keywords.** MUST means a judge could see a failure; SHOULD means the demo survives without it.
- **Verification.** Each requirement names one method: Test (automated), Demo (shown on screen in the video), or Inspect (read the code or network trace).
- **Spike tag.** A requirement marked S1 to S4 depends on a PRD spike that is not yet proven; if the spike fails, the fallback in the PRD applies and the requirement text is revised.

The PRD stays the source for the problem and the audience (a newsroom tip desk); this SRD never overrides it.

## 2. Functional requirements

| ID | The system MUST | Story | Pri | Spike | Verify |
| --- | --- | --- | --- | --- | --- |
| FR-1 | Let the sender type a tip of up to 331 UTF-8 bytes with a live byte counter, and block input beyond the limit | S1 | P0 |  | Test |
| FR-2 | Seal the tip in the browser with a libsodium sealed box to the inbox public key, so the plaintext never appears in any network request | S1 | P0 |  | Inspect, Test |
| FR-3 | Encode the sealed tip as a text memo per section 3 and reject any memo over 512 bytes | S1 | P0 |  | Test |
| FR-4 | Build a valid ZIP 321 payment link and a QR code carrying the desk address, an amount equal to the inbox tip floor and the memo | S2 | P0 | S1 | Test |
| FR-5 | Show a copy-paste fallback with the address, amount and memo as three separate copy buttons | S2 | P0 | S1 | Demo |
| FR-6 | Show the inbox key fingerprint on the sender page and tell the sender to compare it with the one the desk publishes elsewhere | S1 | P0 |  | Demo |
| FR-7 | Generate the desk keypair in the desk's browser, show the private key once, and store it only passphrase-wrapped in IndexedDB; offer an exportable backup file | S4 | P0 |  | Test, Inspect |
| FR-8 | Provide a local decrypt page where the desk pastes a memo and reads the tip, working with no server | S6 | P0 |  | Test |
| FR-9 | Switch between testnet and mainnet by one configuration value, and show the active network on every page | all | P0 |  | Test |
| FR-10 | Run the sender-safety check fully offline in the browser, with no answer sent or stored, ending in plain guidance | S3 | P1 |  | Inspect, Demo |
| FR-11 | Register an inbox with a unified full viewing key for a dedicated receive-only account; accept only a viewing key and refuse anything that could spend (see BR-13) | S5 | P1 | S3 | Test |
| FR-12 | Scan the chain through at least two configured lightwalletd servers and store, per received memo output, the tx id, output index, height, time, amount and the 512-byte ciphertext | S6 | P1 | S2 | Test, Demo |
| FR-13 | Never store a duplicate: a tip is unique by tx id and output index | S6 | P1 |  | Test |
| FR-14 | Mark a tip confirmed after 3 blocks, and orphaned if a reorg removes it | S6 | P1 |  | Test |
| FR-15 | Serve tips to the desk page behind a bearer token and let the desk decrypt each one locally | S6 | P1 |  | Demo |
| FR-16 | Apply a per-inbox tip floor (default 100,000 zatoshis = 0.001 ZEC), flag lower tips as below floor and hide them by default | S7 | P1 |  | Test |
| FR-17 | Let the desk delete an inbox, removing its viewing key and every stored tip | S5 | P1 |  | Test |
| FR-18 | Publish /v1/health with each source's tip height and lag | S6 | P1 |  | Test |
| FR-19 | Mark a memo that is not in the specified format as unreadable without attempting to render it | S6 | P1 |  | Test |
| FR-20 | Let the desk view an audit trail of server-observed events, verified in the browser as a hash chain, and export it before deleting the inbox (api-contract §5.6, §6.10, added Oct 13) | S6 | P1 |  | Test, Demo |

Not in scope for this SRD: the reply channel, multi-server cross-checking beyond FR-12 and a deploy template (all Later in the PRD).

## 3. Interface specifications

These values were measured in the spike-1 script on Oct 11, 2026, not taken from the specs alone.

| Item | Specification |
| --- | --- |
| Plaintext block | 2-byte big-endian message length, then the UTF-8 message, zero-padded to exactly 333 bytes, so the maximum message is 331 bytes and every memo has the same length |
| Encryption | libsodium crypto\_box\_seal to the 32-byte inbox public key; adds 48 bytes (32-byte ephemeral key plus 16-byte tag), giving a 381-byte ciphertext |
| Memo text | The ASCII string z1: followed by the standard base64 of the ciphertext: 3 + 508 = 511 bytes, then zero padding to the 512-byte memo. The first byte 0x7A is below 0xF5, so wallets treat it as a text memo (ZIP 302) |
| Payment link | zcash:ADDRESS?amount=0.001&memo=BASE64URL, where the memo is the 511 bytes without trailing zeros, in base64url with no padding (ZIP 321); about 680 characters of memo plus the address (a unified address is often 140 to 250 characters), so roughly 900 in total, which still fits a QR code at low error correction |
| Amount | The inbox tip floor in ZEC with at most 8 decimals |
| Reader | Strips trailing zero bytes, requires the z1: prefix, base64-decodes, opens the sealed box, reads the length and returns that many bytes; any failure yields unreadable |
| Optional binary layout | 0xFF, 0x01, then the sealed box of a 462-byte block; maximum message 460 bytes; used only if spike 1 shows wallets keep it intact |

The link must not contain a req- parameter, since ZIP 321 makes an unknown required parameter invalidate the whole request. Memos are not valid for transparent addresses, so the inbox address MUST be shielded (a unified address with a shielded receiver).

## 4. Non-functional requirements

Privacy comes first because the judges treat a leak as disqualifying, not as a lower score.

| ID | Requirement | Verify |
| --- | --- | --- |
| NFR-1 | No message plaintext, private key or passphrase appears in any network request, log line, analytics event or error report; the pages load no third-party scripts or analytics | Inspect: browser network trace; grep of the repo |
| NFR-2 | The server stores only tx id, output index, height, time, amount, ciphertext, source health and the audit entries of api-contract §5.6 (no tip text, memo bytes, token values or IPs, chain servers by origin only); it never stores a sender IP, user agent or token in clear | Inspect: schema and logs |
| NFR-3 | The server holds no key able to spend; FR-11 rejects any key with spend authority | Test |
| NFR-4 | Public endpoints send no-store caching headers and set no cookies | Test |
| NFR-5 | Sealing and link building complete in under 1 second on a mid-range laptop | Test |
| NFR-6 | A new tip appears in the desk list within 2 minutes of 3 confirmations at normal chain conditions | Demo |
| NFR-7 | The watcher survives a restart and a single lightwalletd outage with no duplicate or lost tip | Test |
| NFR-8 | A fresh clone runs on testnet from the README in under 15 minutes with no account other than Vercel and Railway | Demo |
| NFR-9 | All dependencies are pinned to exact versions and the repo carries an open-source licence at submission | Inspect |
| NFR-10 | The sender and desk pages work on current Chrome, Firefox and Safari at 360 px width and up | Demo |
| NFR-11 | The desk page shows the honest limits (page JavaScript is a trust point, ciphertext metadata is visible, not a SecureDrop replacement) in plain words | Demo |

NFR-5, NFR-6 and NFR-8 are my targets, not measured values; I will adjust them after the testnet run.

## 5. Acceptance tests and traceability

The tests run in this order and double as the demo-video script: each one is a scene.

| Test | Covers | Steps | Pass when |
| --- | --- | --- | --- |
| T-1 Round trip, offline | FR-1 to FR-3, FR-8 | Seal a 331-byte tip, decrypt it on the decrypt page; try 332 bytes, a tampered memo and a wrong key | First decrypts to the same text; the other three are rejected |
| T-2 Link validity | FR-4, FR-9 | Build links on testnet and mainnet, parse each with the ZIP 321 grammar | No errors; memo under 512 bytes decoded; correct network prefix |
| T-3 Network privacy | NFR-1, NFR-4 | Compose and pay while recording the browser network trace | No request contains the plaintext, key or passphrase |
| T-4 Real payment | FR-4, FR-5, FR-12 | Pay the link from a testnet wallet; repeat with the copy-paste flow | The memo reaches the watcher byte for byte on at least one path |
| T-5 Desk inbox | FR-12 to FR-15, FR-18 | Watch a tip move from pending to confirmed and decrypt it in the desk page | Tip shown with tx id, height and time; the server row holds ciphertext only |
| T-6 Spam floor | FR-16 | Send a tip below 0.001 ZEC | Flagged below floor and hidden by default |
| T-7 Resilience | FR-13, NFR-7 | Restart the watcher and block one lightwalletd mid-sync | No duplicate, no lost tip, health shows the lag |
| T-8 Unreadable memo | FR-19 | Send a plain text memo | Marked unreadable; amount and time shown |
| T-9 Key safety | FR-7, FR-11, FR-17 | Reload and clear the browser; register a spend-capable key; delete the inbox | Key survives only through the backup file; spend key rejected; data removed |
| T-10 Safety check | FR-10 | Run the check with the network disabled | Completes; no request made |
| T-11 Audit chain | FR-20 | Change one stored audit entry, then open the Audit trail page | The page shows Chain broken at that entry and marks its row Hash mismatch. The untouched fixture shows Chain verified |

**Story to requirement map:** S1 → FR-1, 2, 3, 6; S2 → FR-4, 5; S3 → FR-10; S4 → FR-7; S5 → FR-11, 17; S6 → FR-8, 12 to 15, 18 to 20; S7 → FR-16. Two requirements have no test in the table: FR-6 is checked on screen in the demo, and FR-14 needs a unit test with a simulated reorg, since testnet cannot be made to reorg on demand.

Open before the build starts: the four PRD spikes and the exact submission deadline.

## 6. Backend and Zcash integration

Nothing in this build is mocked: every tip in the desk list must come from a real transaction on the Zcash testnet or mainnet, read by the watcher through a public lightwalletd server. This section says which of the six resources you gave me are used, for what, and as which requirement.

| Resource | Used for | Requirements |
| --- | --- | --- |
| [ZIPs](https://zips.z.cash/) | The rules we implement: ZIP 321 payment links, ZIP 302 memo layout, ZIP 317 fees, ZIP 316 unified addresses | BR-1, BR-8, BR-9, FR-4 |
| [librustzcash](https://github.com/zcash/librustzcash) | The watcher's engine: view-only account, block scanning, memo decryption, reorg rollback, link parsing | BR-2 to BR-7, BR-10 |
| Public lightwalletd servers (named in the PRD) | The only chain access: compact blocks and full transactions over gRPC with TLS | BR-4, BR-5 |
| [Zodl](https://github.com/zodl-inc) app | A test sender wallet to make real payments with memos; its Android SDK is AGPL-3.0, so we copy no code from it | T-4 only |
| [Zcash docs](https://zcash.readthedocs.io/en/latest/) | Concepts only (shielded pools, viewing keys); no integration | None |
| [Zebra](https://github.com/ZcashFoundation/zebra) | Not run by us; the public servers sit in front of nodes like it. A node of our own is a later hardening step | None |
| [NEAR Intents](https://docs.near-intents.org/) | Not used: it supports only transparent ZEC, which cannot carry a memo | None |

| ID | The backend MUST | Spike | Verify |
| --- | --- | --- | --- |
| BR-1 | Take a single NETWORK setting (test or main) that selects the chain parameters, address prefixes and the lightwalletd list, and refuse to start if a registered key or address belongs to the other network |  | Test |
| BR-2 | Keep one view-only account per inbox in a librustzcash wallet database (zcash\_client\_sqlite), created by importing the desk's unified full viewing key | S3 | Test |
| BR-3 | Require a birthday height at registration and start scanning from it, so the first sync takes minutes | S4 | Test |
| BR-4 | Reach the chain only through the lightwalletd gRPC service over TLS: read the latest block, fetch compact blocks in ranges, and fetch the full transaction for every block that matches, because compact blocks do not carry the memo. Method names to be confirmed against the protocol version we pin | S2 | Test |
| BR-5 | Use at least two servers per network, compare their reported tip, and expose each server's height and lag in /v1/health |  | Test |
| BR-6 | Store a memo only for outputs received by the inbox account; ignore change and outgoing outputs | S2 | Test |
| BR-7 | Derive the inbox's unified address from the viewing key and show only a receiver the pinned librustzcash version can scan. Which pools to include depends on the Ironwood changes and is settled in spike 2 | S2 | Test, Demo |
| BR-8 | Treat the tip floor as a per-inbox value in zatoshis, and never set it below the ZIP 317 minimum fee for a two-action transaction (10,000 zatoshis) |  | Test |
| BR-9 | Validate every payment link the sender page builds with the official zip321 crate in an automated test, replacing my hand-written checker |  | Test |
| BR-10 | Use the library's rollback to the fork height on a reorg and mark affected tips orphaned (FR-14) |  | Test |
| BR-11 | Pin exact versions of every Zcash crate and record the Ironwood-compatible release in the README | S2 | Inspect |
| BR-12 | Run on Railway from one Dockerfile with a persistent volume for the database, and read configuration only from environment variables | S4 | Demo |
| BR-13 | Reject registration input that is not a unified full viewing key for the selected network (a seed phrase or spending key is refused and never stored). This replaces the wording of FR-11 | S3 | Test |

**Why no other integration.** A tip needs three things from Zcash: a shielded address, a memo that survives, and a way to read it. A view-only librustzcash account on public servers does all three. Swaps, our own node and an in-browser wallet each add moving parts without adding any of the three.

**What is still unknown.** Exact crate and method names and the current Ironwood-compatible versions come from spike 2, which has not run. BR-4 and BR-7 are written from the protocol's design and must be corrected against the real crates before the build starts.

**Demo choice for you.** Show testnet in the video for safety, or add one small real mainnet tip at the end to prove it is not a demo. Mainnet costs about 0.001 ZEC plus the network fee, and carries the same privacy care as a real tip.
