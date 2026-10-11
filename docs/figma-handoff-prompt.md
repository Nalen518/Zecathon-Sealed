# Handoff prompt: design the Shielded Tip Line in Figma

> **Superseded (Oct 11, 2026).** This was the first design brief. It still mentions `[Newsroom name]`, a mobile design at 390 px and Mullvad navy, all replaced by D-01, D-02 and D-03 in `docs/frontend/decisions.md`. The design is done. Do not use this file as a source of truth. Kept as history only.

You are a product designer working with a solo builder on "Zecathon", a Zcash hackathon entry (Wildcard track). Your job: design the screens in Figma, using the Figma tools you have. Act as a professional designer with critical thinking: for each major design decision, give the options, the pros and cons, and your pick.

## Step 1: read before designing (do not skip)
Read these in full, in this order. They are Claude Docs; read them with your docs tools, not a web fetch.
1. PRD: https://claude.ai/code/artifact/f7cbd659-8f27-41c0-b7c4-a69f30e92c96
2. Architecture: https://claude.ai/code/artifact/0710dc46-388b-48ca-8802-3c5a372bbc58
3. SRD: https://claude.ai/code/artifact/8171c72f-a5cf-4a49-b11d-90d530d12fb7
4. Optional, for copy and structure only (the builder judged its visuals bad, do not reuse the look): https://claude.ai/artifact/WYxXBwsT69BeHnERwGcnt5

Then read the references below and summarise, in one short paragraph, what you will take from each before you design.

## What the product is
Name (locked): **Sealed**, descriptor "Sealed: a shielded tip line for newsrooms". Pages show the newsroom's own name in the header ([Newsroom name]); "Sealed" appears in the footer ("Powered by Sealed, open source"), the repo and the demo. Domain and trademark availability are not checked yet; fallback name: Tipseal. Do not design a logo mark beyond a simple wordmark in Albert Sans 500.

A shielded tip line for a newsroom tip desk. A source writes a tip; the browser seals it; the source pays a small shielded Zcash amount (default 0.001 ZEC) from their own wallet with the sealed message in the memo; only the desk can decrypt it. The audience is a source who may be at risk, and a newsroom desk operator. Judges score Privacy, Usefulness, Execution, Originality.

## Style decision (locked)
Plain and sober, restrained, newsroom-calm. Closest visual reference: Mullvad (mullvad.net), a dark navy and white palette, short blocks, generous spacing, one clear action. Journalism tip-page structure underneath (ProPublica, The Intercept). No drama, no cipher or hacker motifs, no marketing sections.

## Typography (locked)
- Albert Sans, the sans body face: body copy, lead paragraphs, nav links. Weights 400 (Regular) and 500 (Medium) only.
- JetBrains Mono, the monospace face: eyebrows (small labels above headings), the on-chain permission panel (what is and is not visible on the Zcash network), code blocks (address, memo, fingerprint), and the outlined nav button. Weights 400 and 500 only.
- Headings use Albert Sans 500. Do not add other families.
- Production constraint: the live site loads no third-party resources, so both fonts are self-hosted. Do not specify Google Fonts links in anything you hand to engineering.

## Screens to design
Sender flow: (1) landing page, (2) write the tip with a live byte counter (max 331 bytes), (3) pay from your wallet (QR/link and a three-field copy fallback: address, amount, memo), (4) safety check (three questions, works offline, no data sent). Desk flow: (5) create inbox (browser-made key, backup, receive-only viewing key, tip floor, fingerprint), (6) inbox (tip list with status, decrypt panel, paste-a-memo fallback). Also design: a TESTNET/MAINNET badge visible on every page, and empty, error and over-limit states.

## Landing page order
Headline and one action; who it is for and not for; three steps in plain words; what it protects and what it does not (the on-chain permission panel); common questions; verify this page (key fingerprint); footer (open source, no analytics, privacy policy).

## References (read them)
- ProPublica tips: https://www.propublica.org/tips/ (FAQ, impersonation warning)
- The Intercept, become a source: https://theintercept.com/source/ (honest "what not to do")
- Forbidden Stories SafeBox: https://forbiddenstories.org/safebox/tutorial/ (plain numbered steps)
- SecureDrop landing page guide: https://docs.securedrop.org/en/stable/deployment/landing_page.html (section list; no third-party scripts, plain and ad-free)
- Freedom of the Press review: https://freedom.press/news/how-do-newsrooms-get-their-news-tips-we-reviewed-over-80-news-outlets/ (make the tip entry prominent)
- Mullvad: https://mullvad.net/en (look and tone)
- Zodl: https://zodl.com (how Zcash shielded payments and Shielded Notes are explained; do not copy its tracking)

## Hard rules
- Honest limits stay visible: the page code is a trust point, the exchange keeps purchase records, device and network are not protected, this is not a SecureDrop replacement.
- No analytics, cookies or third-party embeds in any design.
- Use bracketed placeholders ([Newsroom name], [XXXX XXXX XXXX XXXX]) for unknown facts. No invented statistics, testimonials or logos.
- Accessibility: text contrast at least 4.5:1, touch targets at least 44 px, real form labels, visible focus.
- Design desktop at 1280 wide and mobile at 390 wide.
- Before using Figma, check for an existing design system or file the builder names; use it if given. Otherwise ask the builder for the Figma folder or file, and wait.

## Deliver
Frames for all screens and states, a small set of styles (colors, text styles for the two fonts, spacing), and a short note on each decision with options, pros, cons and your pick.
