# Footer prompt: dot-matrix wordmark (F3)

Picked Oct 11, 2026: palette A (ink + Zcash gold) + hero H1 + footer F3.
Code: `src/dotWordmark.ts`, styles: `src/motion.css`, live demo: `demo/index.html`.
Figma: page "Components" → **Site footer** (Breakpoint=Desktop) → frame "Wordmark · dot matrix" (104 × 26 dots at a 10 px pitch).

## How to use this file

The code in `src/` is already written and tested. Paste the "Prompt" section into an AI coding tool when you wire it into the app or port it, and attach `src/dotWordmark.ts` and `src/motion.css`.

---

## Prompt

You are building the site footer for **Sealed**, a shielded tip line for newsrooms (web only). Use the existing module `dotWordmark.ts`; do not add any dependency.

**Layout (desktop 1280, content 1040 wide)**

Background `--color-bg-inverse-deep` (#0e0e10), padding 64 top / 48 bottom.

1. Top row: left "Powered by Sealed, open source" (Albert Sans 500) and the line "No analytics. No cookies. No third-party scripts or fonts. Everything you type is sealed in your browser." Right: links "Source code", "Honest limits", "Verify this page" (44 px tall tap targets, underlined).
2. The dot-matrix wordmark "Sealed", full content width.
3. A 1 px rule, then a mono row: "© Sealed · v0.1 · [Licence]" on the left and the TESTNET/MAINNET badge on the right.

**The wordmark**

- "Sealed" in Albert Sans 500, fitted to the width, sampled on a 10 px grid.
- Dots inside the letters: radius 3.2 px, white at 55% opacity; a soft light sweeps left to right every 4.2 s and lifts dots to 100%.
- Dots outside the letters: radius 1.3 px at 7%, a faint grid that shows the canvas edge.
- Dots within 70 px of the mouse turn seal gold (#f4b728) inside the letters, and grow slightly outside them. Touch is ignored.

**Rules**

1. Mount with `mountDotWordmark(canvas, { hoverTarget: footerElement })` so hovering anywhere on the footer works. Call `destroy()` on unmount.
2. The canvas is decorative: `aria-hidden="true"`. All meaning is in the text links.
3. Reduced motion: no sweep. The pointer highlight still follows the mouse because the visitor starts it; the module redraws only on pointer move.
4. Pause when off-screen or the tab is hidden (already in the module).
5. The font must be loaded before sampling. The module waits for `document.fonts.load('500 100px "Albert Sans"')`, so the `@font-face` must point at the self-hosted file.
6. Strict CSP: `script-src 'self'; style-src 'self'; font-src 'self'`. No CDN, no Google Fonts link, no inline styles.
7. Height comes from the glyph metrics (about 270 px at 1040 wide); the module sets it.
8. Only weights 400 and 500 anywhere in the footer (set `strong { font-weight: 500 }`).

**React example**

```tsx
import { useEffect, useRef } from "react";
import { mountDotWordmark } from "@/motion/dotWordmark";

export function SiteFooter() {
  const footer = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const handle = mountDotWordmark(canvas.current!, { hoverTarget: footer.current! });
    return () => handle.destroy();
  }, []);
  return (
    <footer ref={footer} className="site-footer">
      {/* top row, links ... */}
      <canvas ref={canvas} className="dot-wordmark" width={1040} height={260} aria-hidden="true" />
      {/* rule, legal line, network badge ... */}
    </footer>
  );
}
```

**Acceptance checks**

- [ ] The word reads as "Sealed" at 1040 px and at 360 px.
- [ ] Gold dots follow the mouse; nothing happens on touch.
- [ ] Reduced motion: no sweep.
- [ ] No console errors and no CSP violations with the policy in `demo/index.html`.
- [ ] CPU is idle when the footer is off-screen.

## Design notes (why this footer)

- **Inspired by** The Design Society's dotted letters and Reality Is_'s moving pixels (footer.design).
- **Pros:** the same dot language as the hero memo, so the page starts and ends with one idea; memorable in the demo video.
- **Cons:** about half a day; it only makes sense next to H1.
- **Fallback:** the static Figma frame exported as SVG, no motion.
