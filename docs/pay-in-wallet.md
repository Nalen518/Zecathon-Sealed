# Pay in wallet: ZIP-321 link and QR (and the connect wallet question)

Status: **Proposed, Oct 19 2026.** Waiting for @Apa's yes on §3. **Figma already has the QR design** (Sender screens, `Pay — Default` `22:1732`, block `QR and link` `22:1772`). Nothing new to draw. The QR in Figma is a placeholder, so the work is making it real in code. No contract change.
Owner of this file: @Apa. Frontend and backend agents read it, then record their own decision rows (the next free D-xx and B-xx).

## 1. The question

Should Sealed offer "Connect wallet" on the landing page, and can the Pay screen make paying easier than copying three fields?

## 2. What was checked (Oct 19)

| Source | What it gives | Verified | Not verified |
|---|---|---|---|
| ZIP-321 spec (zips.z.cash/zip-0321) | `zcash:` payment link with address, amount and memo | Format exists and is a Zcash standard | Which wallets read the memo from a link. **Test with the wallet used in the demo video** |
| `zip321` Rust crate 0.9.0 (MIT or Apache-2.0) | Parse and render ZIP-321 URIs, base64 memo helpers | Exists, documented, released Aug 2026 | Exact API for building a request with a memo (read the crate docs before use) |
| Kotlin and Swift payment URI prototypes | Same standard for mobile | Audited by Least Authority | Not needed by Sealed |
| WebZjs MetaMask Snap (ChainSafe) | Shielded ZEC inside MetaMask | Exists, audited by Hacken (May 2025), listed in the Snaps Directory | Testnet support, memo support, how a third-party site connects |
| JavaScript ZIP-321 library | A ready package for the browser | **Not found.** The link is simple enough to build by hand | |

Correction to the Oct 19 chat answer: shielded Zcash does have a working connect option (the Snap). It is not a fit for Sealed now, for the reasons in §3.

## 3. Options and decision

| ID | Option | Pros | Cons | Pick |
|---|---|---|---|---|
| PW-01 | Copy three fields only | Zero work. Matches "no account, no email, no name" | Many taps on a phone | **Kept as the fallback** (already in Figma under the QR) |
| PW-02 | **ZIP-321 link and QR on Pay** | One tap or one scan fills the payment. No wallet code in Sealed. Nothing about the payer reaches Sealed. Frontend only | Long link (see §5). Wallets differ in memo support | **Recommended. Designed already, build it for real** |
| PW-03 | MetaMask Snap connect | Familiar to judges from other chains | Third-party sync proxy and WebAssembly against the strict CSP and the no-third-party test. The Snap listing allows only `webzjs.chainsafe.dev` to talk to it, so Sealed's origin may be refused. Testnet and memo unverified. Large work before Oct 20 | **Stretch only**, after a spike (§7) |
| PW-04 | A mock "Connect wallet" button | Looks good in a screenshot | Misleads judges | **Rejected** |

Landing page: **no Connect wallet button.** The wallet step belongs on Pay, after sealing, and Sealed never needs to know the payer.

## 4. Design of PW-02 (Pay screen)

Already in Figma, file pVuD8nfzyPl2HRPPLuACjV, page Sender screens, frame `Pay — Default` `22:1732`. Do not redraw it.

| Part | Node | What it shows |
|---|---|---|
| Left column, block | `QR and link` `22:1772` | The QR and the link, above the copy fields |
| QR component | `QR code` `22:1773` (354 × 446) | A placeholder rectangle named `QR (placeholder, not a payment)`, caption `Scan with your Zcash wallet`, and a `Show a larger code` control |
| Heading and body | `22:1777`, `22:1778` | `On a phone or a computer with a wallet` and `Scan the code with your wallet, or open the payment link on this device.` |
| Link button | `22:1779` | `Open in wallet` |
| Memo warning | `22:1783` | `Some wallets drop the memo from links. If the memo field is empty in your wallet, use the three fields below.` |
| Fallback | `Copy fallback` | `Or copy three fields into your wallet's send screen` (address, amount, memo with Copy) |
| Lead | `22:1769` | `... This page cannot see or touch your wallet.` This already carries the "Sealed never connects" message, so no new line is needed |

What the code must do:
- Replace the placeholder with a real QR drawn on a canvas in the page. No image from outside, no third-party script (CSP and the no-third-party test still hold).
- `Show a larger code` is the answer to the dense QR in §5. Build it, and check that the default QR size inside the 354 px component is scannable on a phone screen.
- `Open in wallet` opens the same `zcash:` link as the QR.
- Keep the memo warning and the copy fallback exactly as drawn.
- Testnet shows the same block. The faucet line stays on Pay (testnet only).

Before building, the frontend agent checks whether the QR, the link and `Show a larger code` already exist in code. If they do, only the gaps in §9 are left.

## 5. The link

Format (ZIP-321): `zcash:<address>?amount=0.001&memo=<base64url of the memo bytes>`

- The memo bytes are the text `z1:` + base64, up to 511 bytes. ZIP-321 base64url-encodes those bytes again, **without padding**, so the value grows to about 680 characters. The whole link is about 780 characters.
- The QR for that length is dense (roughly 100 × 100 modules at low error correction). Render it large (at least 320 px, 4-module quiet zone, dark on light, no logo in the middle) and test the scan from a phone screen.
- `amount` is in ZEC as a decimal (0.001), not zatoshi.
- The address is the one already in config. Testnet and mainnet addresses differ, the `zcash:` scheme is the same.
- Build the link **in the browser**. The sealed memo never leaves the browser before the payment is on-chain. Do not send it to the backend to build the link.

## 6. Backend impact

**No endpoint, field or contract change.** The watcher already finds the payment from the memo, whichever wallet paid. The backend work is verification only:

- A test-only dev dependency on the `zip321` crate, to parse a fixture link made by the frontend and check address, amount and memo bytes.
- A fixture file, `contracts/fixtures/pay_link_example.txt`, with one real link (testnet), shared with the frontend test.
- Confirm the watcher accepts a memo that arrived through a ZIP-321 link, 511 bytes, same as a manually pasted one (no trimming, no padding).
- No runtime dependency. Nothing in production changes.

## 7. Stretch: Snap spike (only if time is left after the demo flow works)

Time box: 30 minutes, on a throwaway branch. Pass only if all three are true:

1. The Snap sends on **testnet**.
2. It can attach a **memo** of 511 bytes.
3. Sealed's own origin is allowed to call it, with **no CSP loosening** and no third-party script.

If any one fails, stop and record the result in this file. Do not ship it. A connect flow that is untested must not appear in the demo video.

**Result, Oct 19 (desk check, stopped before any code):** fails check 3, and most likely check 1.

- The published `snap.manifest.json` (ChainSafe/WebZjs, `packages/snap`) sets `endowment:rpc` with `allowedOrigins: ["https://webzjs.chainsafe.dev"]`. MetaMask refuses calls from any other origin, so Sealed's page cannot connect to the Snap.
- It asks only for `snap_getBip44Entropy` with coin type 133, which is Zcash mainnet. No testnet setting appears in the manifest.
- Not shipped, as §7 requires. "Connect wallet" stays out of Sealed (PW-03 closed, PW-04 still rejected).

**What does pay from a link today:** `zcash-devtool wallet pay --payment-uri "<link>"` builds a payment straight from a ZIP 321 link, so the exact link behind the QR and "Open in wallet" can be paid on the laptop. Phone wallets that read `zcash:` QR codes run on mainnet, and cannot pay the NU7 testnet (backend B-29).

## 8. Risks

| Risk | Impact | Handling |
|---|---|---|
| The demo wallet ignores the memo in the link | Payment arrives without a tip, nothing shows on the desk | Test before recording. Keep the copy fields as the fallback and record that path if the link fails |
| The QR is too dense to scan | Judges cannot scan | Large render, low error correction, scan test from a phone screen. Copy fields remain |
| Link or QR logged anywhere | The memo (ciphertext) leaks into logs | The link is built and shown in the page only. Never in analytics, error text or URLs of Sealed |
| A judge thinks Sealed connects to wallets | Wrong trust model | The Pay lead text ("This page cannot see or touch your wallet") already in Figma |

## 9. Acceptance checks

- Pay matches Figma `22:1732`: a real QR (no placeholder), `Open in wallet`, `Show a larger code`, the memo warning and the copy fallback. The link matches §5 and decodes (zip321 test) to the same address, amount and memo bytes as the three copy fields.
- Copy fields still work and are unchanged.
- No request leaves the page for the link or QR (existing network test). CSP, copy rule and no-third-party tests pass.
- Landing page has no Connect wallet button.
- Reduced motion, keyboard and screen reader: the link has a visible focus ring and a 48 px hit area. The QR has `role="img"` and an aria-label `Payment QR code`.
- Manual: scan from a phone with the demo wallet, the payment fields (including the memo) fill in, the payment lands, the tip shows on the desk.

## 10. Open questions

| ID | Question | Needed by |
|---|---|---|
| Q-5 | Does the code already generate the `zcash:` link and a real QR, or is the Pay screen still showing the copy fields only? (The repo was not readable when this was written) | Before the frontend prompt |
| Q-3 | Which wallet will be used in the demo video, and does it read the memo from a ZIP-321 link? | Before recording |
| Q-4 | The "resource" for QR and connect wallet @Apa mentioned: which one is it? Check it against §2 (testnet, memo, CSP, third-party calls) | Before the Snap spike |

## 11. Prompts

### Frontend agent

> Read `docs/pay-in-wallet.md`. Frontend only. Do not touch the backend or contracts.
> 1. First check what already exists in code on the Pay screen: the QR, `Open in wallet`, `Show a larger code`, the memo warning and the copy fallback. Match Figma `Pay — Default` `22:1732` (block `22:1772`, see §4). Do not redraw or rename anything. Build only the gaps. Do not add a Connect wallet button anywhere.
> 2. Build the `zcash:` link in the browser from the address in config, the amount 0.001 and the sealed memo (§5): base64url without padding. Write one small pure function with unit tests (round trip, 511-byte memo, no padding, testnet address).
> 3. Replace the placeholder QR with a real one drawn on a canvas with a small local QR encoder (no third-party script, no remote image). Quiet zone 4, low error correction, dark on light, no logo. Check the default size is scannable from a phone screen, and `Show a larger code` opens a bigger copy (at least 320 px). Add `role="img"` and aria-label `Payment QR code`.
> 4. Keep CSP, copy rule and no-third-party tests passing. Never log the link. Update only the Pay visual baseline.
> 5. Record your decisions (the next free D-xx). Do not start the Snap spike.

### Backend agent

> Read `docs/pay-in-wallet.md` §6. This is verification only. No endpoint, field, migration or contract change. No runtime dependency.
> 1. Add `zip321` as a **dev-dependency** only. Write a test that parses `contracts/fixtures/pay_link_example.txt` and checks the address, amount (0.001) and memo bytes against the expected values.
> 2. Create the fixture from a link the frontend generated for a real testnet tip. If it does not exist yet, stop and say so. Do not invent one.
> 3. Add a watcher test: a 511-byte memo delivered as in the fixture is accepted and the tip gets the same status as a pasted memo.
> 4. Read the `zip321` docs before writing code. If the API differs from this prompt, follow the docs and note it.
> 5. Record your decision (the next free B-xx). Report anything in §6 that does not hold.
