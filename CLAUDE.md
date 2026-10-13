# CLAUDE.md: Sealed

Sealed is a shielded tip line for a newsroom desk (Zecathon, Wildcard track). The browser seals a tip with libsodium, the source pays 0.001 ZEC from their own wallet with the sealed tip as the memo, and only the desk's browser can open it. Frontend on Vercel, Rust watcher and API on Railway (later). Repo must be public by Oct 28, 2026.

## Read first, in this order

1. `docs/PRD Shielded Tip Line (Zecathon, Wildcard).md`
2. `docs/SRD Shielded Tip Line (Zecathon, Wildcard).md` (FR, NFR and T IDs are the requirements)
3. `docs/api-contract.md` (single source of truth for every request, field and error, wins over everything else)
4. `docs/Architecture Shielded Tip Line (Zecathon, Wildcard).md`
5. `docs/frontend/rules.md` (hard rules for all frontend code)
6. `docs/frontend/decisions.md` (accepted decisions D-xx, open questions O-xx)
7. `docs/frontend/feedback.md`
8. `docs/design-screens.md` (every screen, its states, its Figma frame, where each value comes from)
9. `docs/motion/` (README, prompts, `src/memoGrid.ts`, `src/dotWordmark.ts`, `motion.css`)
10. `docs/session-log.md` (the latest entry says where the last session stopped)

Figma: https://www.figma.com/design/pVuD8nfzyPl2HRPPLuACjV/Zecathon (file key `pVuD8nfzyPl2HRPPLuACjV`). Read variables and frames from Figma, never guess values. `docs/figma-handoff-prompt.md` is history only.

## Non-negotiable rules (full list in `docs/frontend/rules.md`)

- No third-party scripts, fonts, analytics, cookies or CDNs. Fonts self-hosted. Strict CSP with no `unsafe-inline`.
- Tip text, the desk private key and the passphrase never appear in any request, log, URL or plain storage.
- Real data only. No mock data in shipped code (the one exception is `SAMPLE_TIP`, D-30).
- Never call an endpoint, send a field or read a field that is not in `docs/api-contract.md`. If something is missing, stop and propose a contract change.
- Design tokens and text styles only, named as in Figma. Components match Figma names and variants 1:1.
- Copy: voice is "the desk" and "Sealed", never "us", "our" or "we". No dashes or semicolons joining phrases. Copy labels exactly from Figma. No Privacy policy page (D-31).
- Web only, desktop first at 1280, columns stack below 860 px, no horizontal scroll at 360 px.
- WCAG 2.1 AA, 44 px targets, real labels, visible focus, reduced motion respected.
- Motion: GSAP only, inside `gsap.matchMedia()` for reduced motion, never delaying safety text (rules §7, D-67).
- Exact dependency versions, committed lockfile, TypeScript strict. `src/lib` has no React.

## Stack and layout (D-33, D-34)

Vite + React + TypeScript static build, React Router, `qrcode-generator`, pnpm, Vitest + Playwright, plain fetch hook, libsodium sumo build (verify `crypto_pwhash`).

```
apps/web/            frontend (src/{app,components,lib,styles,motion}, public/fonts, tests)
apps/watcher/        Rust watcher and API (later)
contracts/fixtures/  shared JSON fixtures from api-contract.md section 10
docs/
```

## How we work

- Decisions: for every real choice give options, pros and cons and a pick, then wait for the answer before anything hard to undo.
- If two docs disagree, stop and show both sides with a recommendation. Never pick silently.
- After each meaningful step update `docs/frontend/decisions.md` and `docs/frontend/feedback.md`.
- A screen is done only when it passes the checklist at the end of `docs/frontend/rules.md`.
- Build P0 (browser-only) before any backend call exists. Write tests first for T-1, T-2 and the fingerprint fixture.

## End of each session day

Before a session ends, add that day's entry to `docs/session-log.md` using its template: what was done, findings, bugs and their causes, decisions taken (IDs), what is open, and where to start next. Do this without being asked. Read the latest entry at the start of a new session.

## Git

- Work on `development`, one feature per branch off it, merge to `main` by pull request. Never push to `main` directly.
- Commits are authored by Nalen518 only. **No `Co-Authored-By` line, no "Generated with" line, in commits or PR descriptions.**
- Small commits in the imperative mood, subject under 72 characters. PR descriptions list the FR and NFR IDs they cover.
- Never commit `.env`, keys, certificates or keystores.
