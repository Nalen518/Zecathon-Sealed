# Sealed frontend decisions

A running log of frontend and design decisions. Each row says what was chosen, what else was on the table, and why. Add a row whenever a choice changes the code or the design. Never delete a row: mark it Replaced and point to the new one.

Status values: **Accepted** (in force), **Proposed** (recommended, waiting for @Apa), **Open** (not decided), **Replaced**.

## Decided

| ID | Date | Decision | Options considered | Why | Status |
|---|---|---|---|---|---|
| D-01 | Oct 11 | Product name **Sealed** everywhere, no newsroom placeholder | Newsroom name in header with "Powered by Sealed" in the footer | Sealed is the brand for the hackathon demo. Fallback name Tipseal if the name is taken | Accepted |
| D-02 | Oct 11 | **Web only, desktop first.** No mobile designs. Code still stacks below 860 px | Separate mobile designs. Desktop only with no responsive code | Saves design time. Stacking keeps NFR-10 (360 px) passing for judges on phones at about one hour of CSS | Accepted |
| D-03 | Oct 11 | **Palette A: ink and Zcash gold.** Warm neutrals, gold only on the main action and the sealed memo | B pure monochrome. C paper and sealing-wax red | Gold reads as Zcash without a logo. Red would clash with the "not protected" status | Accepted |
| D-04 | Oct 11 | **Hero H1: the memo fills, then seals** (512-cell grid) | H2 words dissolve into dots. H3 quiet wave lines | Explains the product with no words, original, and reused as the byte counter | Accepted |
| D-05 | Oct 11 | **Footer F3: dot-matrix wordmark** on the landing page only. App screens get a one-line footer with no links | F1 faded giant wordmark. F2 dark slab with call to action | Same dot language as the hero. App screens are tasks, so the footer stays quiet | Accepted |
| D-06 | Oct 11 | **All motion is our own canvas code.** No video, no animation library, no third-party assets | Paid motionsites.ai video backgrounds | CSP and NFR-1 forbid third-party resources. Canvas code is about 13 KB | Accepted |
| D-07 | Oct 11 | **Fonts:** Albert Sans and JetBrains Mono, 400 and 500 only, self-hosted | Google Fonts link. More weights | No third-party requests. Two weights keep the look calm | Accepted |
| D-08 | Oct 11 | **Desk key, fingerprint, address and tip floor ship in a bundled config** (`sealed.config.json`) | Fetch from `GET /v1/inbox/{id}` | Works with no backend (P0) and a hacked API cannot swap the key. Cost: changing the key needs a redeploy | Accepted |
| D-09 | Oct 11 | **Text memo `z1:` + base64** is the only format in v1 | Binary memo (0xFF), 460 bytes | Works through links, QR and copy-paste. Binary stays optional per the PRD | Accepted |
| D-10 | Oct 11 | **Byte counter = memo grid in static mode**, plus a number | Number only | Shows "bytes, not characters" and reuses the hero code | Accepted |
| D-11 | Oct 11 | **Over-limit input is cut at a whole character**, not rejected | Reject the whole paste | A long paste is not lost. The counter turns red with a message | Accepted |
| D-12 | Oct 11 | **QR code at 320 px** with a white quiet zone | 240 px | A ZIP 321 link with a memo is about 900 characters (QR version about 21) | Accepted |
| D-13 | Oct 11 | **Flow header on Write, Pay and Sent**: no section links, "Leave" confirms in the page | Keep the landing nav | One click on the nav would discard the sealed tip | Accepted |
| D-14 | Oct 11 | **Delete inbox needs typed confirmation** ("DELETE") and a Danger button | Single click. Browser `confirm()` | Cannot be undone. Browser dialogs are easy to click through | Accepted |
| D-15 | Oct 11 | **Status badge for tip states only. Tag for any other label** | Relabel the badge | A `status` prop must mean one thing in code | Accepted |
| D-16 | Oct 11 | **Copy voice:** "the desk" and "Sealed". No "us / our / we" | Newsroom first person | No newsroom is named, so "us" had no owner | Accepted |
| D-17 | Oct 11 | **Copy punctuation:** no dashes or semicolons to join phrases | Free punctuation | Shorter sentences read better for a stressed source | Accepted |
| D-18 | Oct 11 | **Keep the research-age sentence** in the safety check result | Remove it. Keep only "lowers your risk" | Privacy is a pass or fail gate for judges and this avoids overclaiming | Accepted |
| D-19 | Oct 11 | **Add `PATCH /v1/inbox/{id}` and `DELETE /v1/inbox/{id}`** to the API contract | Settings without tip floor change or delete | FR-16 and FR-17 need them. Added to the Architecture doc | Accepted |
| D-20 | Oct 11 | **Safety check answers live in tab memory only** | Save for later | FR-10 and T-10: nothing sent or stored | Accepted |
| D-21 | Oct 11 | **`docs/api-contract.md` is the single source for frontend and backend.** It wins over the Architecture table | Keep the contract inside the Architecture doc | One file both sides test against, with shared JSON fixtures | Accepted |
| D-22 | Oct 11 | **Tip status split** into `chain_state`, `below_floor`, `format_ok`, plus server-derived `display_status` (precedence orphaned, unreadable, below floor, pending, confirmed) | One `status` enum | A low tip can be pending and below floor at once (contract C-1) | Accepted |
| D-23 | Oct 11 | **Polling by change sequence `seq`**, not by tip id | Cursor by tip id | Status changes (pending to confirmed, orphaned) must reach the Inbox (C-2) | Accepted |
| D-24 | Oct 11 | **Fingerprint = first 16 hex of BLAKE2b-256 of the desk public key**, shown in groups of 4 | SHA-256. Full 64 hex | Stays inside libsodium on the frontend, short enough to compare by eye (C-7) | Accepted |
| D-25 | Oct 11 | **Token rotation accepts the desk token or the setup secret.** Delete needs both, so the Delete card has a setup secret field | Setup secret only for both | Rotation is routine, delete is not (C-5, C-6) | Accepted |
| D-26 | Oct 11 | **Setup secret header is `X-Setup-Secret`.** Wire network values are `"test"` and `"main"` | Free naming per side | Removes two naming conflicts (C-4, C-9) | Accepted |
| D-27 | Oct 11 | **Tip floor range is 10,000 to 100,000,000 zat** on create and PATCH | Keep 0 as the lower bound | SRD BR-8 forbids a floor below the ZIP 317 two-action fee. Contract C-12 | Accepted |
| D-28 | Oct 11 | **Figma copy wins over the motion prompt files.** Hero headline is "Send a tip only the desk can read." | Keep "Send us a tip only our desk can read." | Rules §5.1 bans "us" and "our". Prompt file corrected | Accepted |
| D-29 | Oct 11 | **`docs/figma-handoff-prompt.md` is superseded** and marked as history only | Delete it | It still names `[Newsroom name]` and a mobile design, both replaced by D-01 and D-02 | Accepted |
| D-30 | Oct 11 | **Keep `SAMPLE_TIP` in the hero loop** as a labelled illustration, an allowed exception to rules §2.3 | Generic non-claim text ("Your words fill the memo") | It is visibly fictional, never sent, and keeps the animation as designed | Accepted |
| D-31 | Oct 11 | **No Privacy policy page or link.** Footer links are Source code, Honest limits, Verify this page | Add a static Privacy policy page | The footer text and Honest limits already state it. One page less to build and verify. Figma footer still shows the link and must be updated | Accepted |
| D-32 | Oct 11 | **Licence: MIT OR Apache-2.0**, files `LICENSE-MIT` and `LICENSE-APACHE` at the root | Apache-2.0 only. MIT only. MPL-2.0. AGPL avoided | Matches librustzcash. The Apache option adds a patent grant, the MIT option stays simple for self-hosting desks | Accepted |
| D-33 | Oct 11 | **Stack confirmed (P-01 to P-08).** Vite + React + TypeScript static build, React Router, `qrcode-generator`, pnpm, Vitest + Playwright, plain fetch hook, generated `vercel.json`, libsodium sumo build (verify at scaffold) | See the P-01 to P-08 rows below for every alternative | Confirmed by @Apa on Oct 11. P-08 stays conditional on checking that the standard build lacks `crypto_pwhash` | Accepted |
| D-34 | Oct 11 | **Repo layout: pnpm workspace.** `apps/web`, `apps/watcher` (Rust, later), `contracts/fixtures`, `docs` | Single app at the root | The watcher and fixtures need their own homes, and the contract tests share the fixtures | Accepted |
| D-35 | Oct 11 | **Git:** all commits authored by Nalen518 only, no co-author trailer. Work on `development`, merge to `main` by pull request | Commit straight to `main` | Instruction from @Apa. Keeps `main` reviewed | Accepted |

## Confirmed proposals (all accepted Oct 11 as D-33)

| ID | Decision | Options | Recommendation and trade-off |
|---|---|---|---|
| P-01 | **Framework** | A) Vite + React + TypeScript, static build. B) Next.js static export | **A.** Strict CSP with no inline scripts, smaller static output, nothing needs server rendering. B is familiar but adds inline scripts that need hashes or `unsafe-inline` |
| P-02 | **Routing** | React Router. TanStack Router. Hand-written hash routes | React Router: well known, works with a static host. TanStack has better types but more to learn in 17 days |
| P-03 | **QR library** | `qrcode` (npm). `qrcode-generator`. Our own encoder | `qrcode-generator`: no dependencies, small, outputs SVG or canvas we draw ourselves |
| P-04 | **Package manager** | pnpm. npm | pnpm: fast, strict, and `.pnpm-store/` is already in `.gitignore` |
| P-05 | **Test tools** | Vitest + Playwright. Jest + Cypress | Vitest + Playwright: same config as Vite, Playwright can block the network for T-10 and record traces for T-3 |
| P-06 | **Server state** | TanStack Query. Plain `fetch` in a hook | Plain hook: one polling list and a few mutations do not need a library |
| P-07 | **`vercel.json` is generated at build** from `INBOX_API_ORIGIN` | Hard-code the Railway host. Wildcard `https:` in `connect-src` | Rules §1.3 needs the exact API origin in `connect-src`, and it is unknown until Railway deploys. Generate the file and fail the build if the variable is missing. A wildcard would weaken the CSP |
| P-08 | **libsodium package** `libsodium-wrappers-sumo` | `libsodium-wrappers` (standard build) | Rules §1.4 needs `crypto_pwhash` (Argon2id), which I believe only the sumo build ships. To verify at scaffold time. If the standard build has it, use the smaller one |

PRD and Architecture describe Vite, React and `qrcode-generator` (P-01, P-03), now confirmed.

## Open

| ID | Question | Needed by |
|---|---|---|
| O-01 | Exact submission deadline and whether judges need a live mainnet demo | Before Oct 20 |
| O-02 | Which wallet keeps the memo from a ZIP 321 link (PRD spike 1) | Before the Pay screen is final |
| O-03 | Viewing key and spend key prefixes from the export wallet (spike 3) | Before Create inbox step 2 |
