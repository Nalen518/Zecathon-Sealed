# Sealed motion: hero memo grid + footer dot wordmark

Picked on Oct 11, 2026: **palette A** (ink + Zcash gold), **hero H1** (the memo fills, then seals), **footer F3** (dot-matrix wordmark). The Figma file has the matching static frames.

| File | What it is |
|---|---|
| `hero-memo-grid.prompt.md` | Spec + prompt for the hero animation, with React example and acceptance checks |
| `footer-dot-matrix.prompt.md` | Spec + prompt for the footer, same format |
| `src/memoGrid.ts` | Hero grid module (loop mode) and the Write-screen byte counter (static mode). Exports `mountMemoGrid`, `utf8Length`, `truncateToBytes` and the memo constants |
| `src/dotWordmark.ts` | Footer wordmark module. Exports `mountDotWordmark` |
| `src/motion.css` | Maps the canvas colors to the design tokens |
| `demo/index.html` | Standalone demo with the production CSP (`script-src 'self'`, no inline styles, self-hosted fonts) |
| `demo/demo.js` | Bundled demo script (built from `demo/demo-entry.ts`) |
| `demo/fonts/` | Albert Sans and JetBrains Mono variable fonts, SIL Open Font License (licence files included) |

## Run the demo

ES modules need a local server, so double-clicking `index.html` won't work. Run this from the `docs/motion` folder:

```
npx serve .
```

or `python -m http.server 8000`, then open `http://localhost:8000/demo/` (or the port `serve` prints).

## Move into the app

1. Copy `src/memoGrid.ts`, `src/dotWordmark.ts` and `src/motion.css` into the frontend (for example `src/motion/`).
2. Copy the two font files into `public/fonts/` and add the `@font-face` rules from `demo/demo.css`. Do not link Google Fonts: the page must load nothing from other hosts.
3. Mount in a `useEffect` and call `destroy()` on cleanup (see the prompts).

## Rebuild the demo bundle after editing

```
npx esbuild demo/demo-entry.ts --bundle --format=esm --target=es2020 --outfile=demo/demo.js
```

## Checked

- TypeScript strict type-check passes.
- Headless Chromium at 1280 and 400 px: no console errors, no CSP violations, no horizontal scroll, both fonts load from local files.
- Byte limit: pasting 200 × "é" (400 bytes) is cut to 330 bytes at a whole character; one more letter gives 331 / 331.
- Reduced motion shows the still frames.
