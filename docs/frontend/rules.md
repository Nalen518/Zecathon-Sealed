# Sealed frontend rules

Status: active from Oct 11, 2026. Owner: @Apa.
These rules apply to every line of frontend code, every pull request and every AI coding session. When a rule and a request conflict, the rule wins until this file is changed. Change a rule by editing this file and adding a row to `decisions.md`.

Sources of truth, in this order: PRD, SRD, `docs/api-contract.md` (for anything that crosses the network), Architecture, `docs/design-screens.md`, the Figma file, then this file. The frontend never calls an endpoint, sends a field or reads a field that is not in the API contract. The SRD IDs (FR-n, NFR-n, T-n) are quoted so each rule can be traced.

## 1. Privacy and security (a broken rule here is a failed submission)

1. **Nothing leaves the browser except what the API contract lists.** Tip text, the desk private key and the passphrase never appear in a request, URL, log line, error message or analytics event (NFR-1).
2. **No third-party anything.** No CDN scripts, no Google Fonts, no analytics, no error reporting service, no embeds, no cookies (NFR-1, NFR-4). Every file is served from our own origin.
3. **Strict Content Security Policy** on every page, sent as a header from Vercel:
   `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self' <INBOX_API_ORIGIN>; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
   No `unsafe-inline`, no `unsafe-eval`. `wasm-unsafe-eval` is only for libsodium. If a library needs more, the library goes, not the rule.
   `<INBOX_API_ORIGIN>` is filled in at build time from the `INBOX_API_ORIGIN` variable (a generated `vercel.json`, see P-07). The build fails if it is missing. React `style={{…}}` props become inline style attributes and are blocked by `style-src 'self'`, so size and color through CSS classes and custom properties set from CSS, or through the CSSOM as `memoGrid.ts` does.
4. **Sealing uses libsodium only:** `crypto_box_seal` for tips, `crypto_pwhash` (Argon2id) to wrap the desk key. No hand-written crypto, no Web Crypto substitutes for these two jobs.
5. **Where secrets may live.** The desk private key is stored only passphrase-wrapped in IndexedDB and in the backup file (FR-7). Never `localStorage`, `sessionStorage`, cookies, URLs or React state that outlives the screen. Decrypted tip text lives in memory only and is cleared on lock.
6. **Never render a memo as HTML.** Decrypted text is shown as plain text. No `dangerouslySetInnerHTML`, no markdown rendering, no auto-linking (FR-19).
7. **Spend keys are rejected in the browser** before any request, and again by the server (FR-11, NFR-3).
8. **The desk public key and fingerprint come from the bundled config**, not from the API. The API value may only be compared against it, never used in its place.
9. **Bearer tokens** go in the `Authorization` header only, never in a URL. On 401 the desk is sent to the Locked screen.
10. **Clipboard** writes happen only inside a click handler. The app never reads the clipboard.
11. **Console** may log only non-sensitive status in development. Production builds strip `console.*`.

## 2. Real data only

1. **No mock or sample data in shipped code.** Every value on screen comes from one of four places: the build config, the browser (libsodium, IndexedDB), the Inbox API, or what the person types. The table in `docs/design-screens.md` lists the source for every screen.
2. Bracketed placeholders in Figma (`[XXXX …]`, `[utest1…]`) mark where real values go. A bracket in shipped UI is a bug.
3. Sample data is allowed only in tests and in local fixtures under `tests/fixtures/`. One exception: `SAMPLE_TIP` in `memoGrid.ts` is the fictional example typed by the landing hero loop. It is an illustration, never shown as a real tip, never sent anywhere, and the grid's accessible label calls it a sample tip (D-30).
4. Every screen that calls the API has three designed states: loading, empty, error. The error state says what happened and what to do, with an icon and text.
5. Network and spend checks run on real testnet before mainnet. The network comes from one config value and is shown in the header badge on every page (FR-9).
6. There is no Privacy policy page. The footer links are "Source code", "Honest limits" and "Verify this page" (D-31).
7. **Exception: clicked links to testnet tools.** The block explorer home page and the testnet faucet in `outbound_links` of `sealed.config.json` may appear as plain links the visitor clicks (Audit trail and Pay only, D-82 to D-84). They exist on testnet only and are null on mainnet. They always open in a new tab with `rel="noopener noreferrer"`. Nothing is fetched, prefetched, preloaded or embedded from them, no favicon or image, and they are never built from a tip, transaction id or inbox id. Any other outbound link needs a new decision.

## 3. Memo, payment and crypto constants

Use the constants exported by `docs/motion/src/memoGrid.ts` (moved to `src/lib/memo.ts`). Never retype the numbers.

| Constant | Value | Source |
|---|---|---|
| Message limit | 331 UTF-8 bytes | SRD §3, FR-1 |
| Length prefix | 2 bytes, big-endian | SRD §3 |
| Seal overhead | 48 bytes | SRD §3 |
| Memo text | `z1:` + standard base64, 511 of 512 bytes, zero padded | SRD §3 |
| Tip floor default | 100,000 zatoshis (0.001 ZEC) | PRD, Architecture §3 |

Rules:
1. Count bytes with `TextEncoder`, never `string.length`. Cut over-limit text with `truncateToBytes` so no character is split.
2. ZIP 321 link: `zcash:ADDRESS?amount=…&memo=…`, memo in base64url without padding, amount with at most 8 decimals, no `req-` parameters.
3. The tip address must be shielded. A transparent address is a configuration error and blocks the page.
4. The reader strips trailing zero bytes, requires `z1:`, decodes, opens, reads the length. Any failure shows Unreadable.

## 4. Design system

1. **Tokens only.** Colors, spacing, radii and border widths come from CSS variables named exactly as the Figma code syntax (`var(--color-text-primary)`, `var(--spacing-lg)`). No raw hex values, no magic numbers in components.
2. **Type styles only.** Albert Sans and JetBrains Mono, weights 400 and 500, self-hosted from `/fonts`. `strong` and `b` are set to 500.
3. **Components match Figma 1:1.** Same names, same variant properties (`<Button variant="danger" state=…>` maps to `Variant=Danger`). If code needs a variant Figma lacks, add it to Figma first.
4. **Status badge is for the five tip states only.** Any other label uses `Tag`.
5. **Never scale a component.** Use its size variant (for example Memo grid `Size=Compact`).
6. **One gold action per block.** Gold is for the primary action and the sealed memo only. Danger red only after a typed confirmation.
7. **Headers:** Site header on the landing page and Safety check, Flow header on Write, Pay and Sent, Desk header on desk screens.
8. **Spacing:** sections 96 px on the landing page, app screens 64 px top and 32 px between blocks, content max width 1040 px.
9. **Layout:** desktop first at 1280 px. Below 860 px columns stack to one. No horizontal scroll at 360 px (NFR-10).
10. **A dashed border-strong outline means testnet only** (the judge box, D-91). It is never used for anything else, and everything inside it disappears on mainnet.

## 5. Copy

1. **Voice:** "the desk" receives tips, "Sealed" is the tool. Never "us", "our" or "we".
2. **Punctuation:** no dashes (— or –) and no semicolons to join phrases. Write two short sentences. Ranges are written out ("2017 and 2018"). Normal hyphenated words stay.
3. **One name per action:** "Write a tip", "Run the safety check", "Desk key fingerprint", "Seal and continue". Copy the exact label from Figma.
4. **Sentence case** for headings, buttons and labels. Mono uppercase only for eyebrows, tags and badges.
5. **Errors** say what went wrong and how to fix it. No apologies, no codes alone.
6. **Honest limits stay visible** on the landing page and the desk Inbox (NFR-11).

## 6. Accessibility (WCAG 2.1 AA)

1. Text contrast 4.5:1, control borders 3:1. Gold is a fill, never text on white.
2. Every target is at least 44 px. Buttons 48 px, text links use the `TextLink` component (48 px hit area).
3. Real `<label>` for every field. Errors are linked with `aria-describedby`.
4. Visible focus ring (`--color-focus-ring`, 3 px) on every interactive element.
5. Color is never the only signal: every status has text, every error has an icon.
6. The byte counter is `aria-live="polite"`. The animated grid is `role="img"` with a fixed label. Decorative canvases are `aria-hidden`.
7. Every flow works with the keyboard alone. Disclosure widgets use `button` with `aria-expanded`. The step indicator is an `ol` with `aria-current="step"`.
8. `prefers-reduced-motion` shows still frames.
9. "Leave" and "Delete" confirm inside the page. Never `alert()`, `confirm()` or `prompt()`.

## 7. Motion

1. Use the modules in `docs/motion` (`mountMemoGrid`, `mountDotWordmark`), copied to `src/motion`. Mount in an effect and call `destroy()` on cleanup. When copying, drop the raw hex fallbacks in `memoGrid.ts` and `motion.css` so colors come only from tokens (§4.1).
2. Animations pause off-screen and when the tab is hidden.
3. **GSAP is the only animation library** (`gsap` and `@gsap/react`, exact versions, bundled from npm, never a CDN). Use `useGSAP()` with a `scope`, so everything is reverted on unmount. ScrollTrigger only from the `gsap/ScrollTrigger` import, registered once in `src/motion/gsap.ts` (D-67).
4. **Every GSAP animation runs inside `gsap.matchMedia()` under `(prefers-reduced-motion: no-preference)`.** With reduced motion, content is simply there, final state, no movement (§6.8).
5. **Content never depends on the animation.** Start states are set by JavaScript at run time (`from`, `set`), never in CSS, so a page whose script fails still shows everything. Animate `opacity` and transforms only, never `visibility` or `display`.
6. **Motion never delays safety or meaning.** No animation on decrypted tip text, warnings, errors or the fingerprint. Sender screens: nothing longer than 400 ms, and the seal sweep on Write at most 500 ms. No scroll-jacking (no ScrollSmoother, no pinning on sender or desk screens) and no splitting text into letters.
7. Desk screens animate only to show something real: a new tip arriving, a check finishing.

## 8. Code

1. **TypeScript strict.** No `any`, no `@ts-ignore` without a comment explaining why.
2. **Exact versions** in `package.json` (no `^` or `~`) and a committed lockfile (NFR-9).
3. **Folder layout:**
   ```
   src/
     app/          routes and screens
     components/   one folder per Figma component
     lib/          memo, seal, zip321, keystore, api client (no UI)
     styles/       tokens.css (generated from Figma variables), fonts.css
     motion/       memoGrid.ts, dotWordmark.ts, motion.css
   public/fonts/   Albert Sans, JetBrains Mono, licences
   tests/          unit, e2e, fixtures
   ```
4. `src/lib` has no React imports, so the crypto code is testable on its own.
5. The API client is the only file that calls `fetch`. It sets `cache: "no-store"` and `credentials: "omit"`.
6. Configuration comes from `import.meta.env` (or the framework equivalent) and `sealed.config.json`. `.env.example` lists every variable with a fake value. Real `.env` files are never committed.

## 9. Tests (each maps to an SRD test)

| Test | What it proves | SRD |
|---|---|---|
| Unit: memo round trip | 331 bytes seal and open, 332 rejected, tampered and wrong key rejected | T-1 |
| Unit: ZIP 321 | Links parse on testnet and mainnet, memo under 512 bytes | T-2 |
| E2E: network trace | No request contains the tip, key or passphrase | T-3 |
| E2E: safety check offline | Completes with the network blocked, makes no request | T-10 |
| E2E: key safety | Reload, clear storage, restore from backup | T-9 |
| E2E: a11y | axe has no serious issues on every screen | NFR-10 |
| E2E: CSP | No CSP violation on any screen | NFR-1 |

## 10. Git and review

1. `.gitignore` at the repo root is the source for what stays out. Never commit `.env`, keys, certificates or keystores.
2. One change per pull request. The description lists the FR and NFR IDs it touches.
3. Before merge: type check, unit tests, e2e tests, CSP check and a screenshot compared with the Figma frame.
4. Commits are in the imperative ("Add memo encoder"), under 72 characters in the subject.

## Definition of done for a screen

- [ ] Matches its Figma frame and every listed state (default, empty, error, loading).
- [ ] Every value comes from a real source (section 2).
- [ ] Copy matches Figma and follows section 5.
- [ ] Keyboard, focus, contrast and reduced motion checked.
- [ ] No CSP violation and no sensitive data in the network trace.
- [ ] The SRD requirements it covers are listed in the pull request.
