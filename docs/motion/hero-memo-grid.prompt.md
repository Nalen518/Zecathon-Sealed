# Hero prompt: the memo fills, then seals (H1)

Picked Oct 11, 2026: palette A (ink + Zcash gold) + hero H1 + footer F3.
Code: `src/memoGrid.ts`, styles: `src/motion.css`, live demo: `demo/index.html`.
Figma: page "Components" → component set **Memo grid** (State=Writing, State=Sealed); used in "Landing page" → Hero.

## How to use this file

The code in `src/` is already written and tested. Use the prompt below when you want an AI coding tool (Claude, Cursor, etc.) to drop it into the app or rebuild it in another framework. Paste the whole "Prompt" section, then attach `src/memoGrid.ts` and `src/motion.css`.

---

## Prompt

You are adding the hero animation to **Sealed**, a shielded tip line for newsrooms (Zcash hackathon, web only). Use the existing module `memoGrid.ts`; do not rewrite it unless asked. Do not add any dependency.

**What the visitor sees**

A dark hero (`--color-bg-inverse`, #151517). Left: eyebrow "Sealed · Shielded tip line", headline "Send a tip only the desk can read.", lead paragraph, a gold primary button "Write a tip →", an underlined link "Run the safety check first", and a mono meta line. Right: a 32 × 16 grid of 512 small squares with a mono label above it and a three-item legend below it ("Your words", "Sealed memo", "Unused").

**What the grid means** (it must stay true to the SRD, section 3)

- 512 squares = the 512-byte Zcash memo.
- Squares 1–2 = the 2-byte length prefix (muted gray).
- Then one square per UTF-8 byte of the tip, in white. Maximum 331.
- Sealing: libsodium sealed box adds 48 bytes → 381 bytes → text memo `z1:` + base64 = **511 of 512 bytes**. The last square stays unused.

**Timeline (one loop = 10 s)**

| Time | Grid | Label |
|---|---|---|
| 0–45% | white squares appear one byte at a time while a sample tip "types" | `MESSAGE · n / 331 BYTES` |
| 45–62% | diagonal sweep from top-left turns squares 1–511 seal gold; squares 1–3 (`z1:`) full gold, the rest 35–90% opacity with a slow shimmer (every 320 ms) | `SEALING IN YOUR BROWSER` |
| 62–92% | hold the sealed memo | `SEALED · 511 / 512 BYTES · z1:` |
| 92–100% | fade out, then restart | |

**Rules**

1. Mount with `mountMemoGrid(canvas, { mode: "loop", labelEl })`. Call `destroy()` on unmount.
2. The canvas has `role="img"` and a fixed `aria-label` describing the animation. The label and legend are `aria-hidden` (they change too often for a screen reader).
3. Reduced motion (`prefers-reduced-motion: reduce`): no loop; show the sealed frame only. The module already does this.
4. Pause when off-screen or the tab is hidden (already in the module).
5. Colors come only from CSS custom properties (`--memo-words`, `--memo-length`, `--memo-seal`, `--memo-unused`) mapped to design tokens in `motion.css`. Gold is used for the sealed memo and the primary button only.
6. Strict CSP must keep working: `script-src 'self'; style-src 'self'; font-src 'self'`. No inline `<style>` or `style=""` attributes, no CDN, no Google Fonts link. Fonts are self-hosted (Albert Sans 400/500, JetBrains Mono 400/500).
7. Width: the grid is fluid up to 477 px; below 860 px the hero stacks to one column.
8. Do not write the label with CSS `text-transform: uppercase`; the module writes uppercase itself so `z1:` keeps its lowercase.

**Re-use on the Write screen**

The same module in `mode: "static"` is the byte counter: on every `input` event call `setBytes(utf8Length(text))`; if the text is over 331 bytes, replace it with `truncateToBytes(text)` first (FR-1: block input beyond the limit). After sealing, call `setSealed(true)`.

**React example**

```tsx
import { useEffect, useRef } from "react";
import { mountMemoGrid } from "@/motion/memoGrid";

export function HeroMemoGrid() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handle = mountMemoGrid(canvas.current!, { mode: "loop", labelEl: label.current });
    return () => handle.destroy();
  }, []);
  return (
    <div className="grid-block">
      <div ref={label} className="memo-grid-label" aria-hidden="true">SEALED · 511 / 512 BYTES · z1:</div>
      <canvas ref={canvas} className="memo-grid" width={477} height={237} role="img"
        aria-label="512 squares stand for the 512-byte Zcash memo. A sample tip fills them, then the whole memo turns into sealed text." />
      <ul className="memo-grid-legend" aria-hidden="true">
        <li className="words">Your words</li><li className="sealed">Sealed memo</li><li className="unused">Unused</li>
      </ul>
    </div>
  );
}
```

**Acceptance checks**

- [ ] Loop runs at 60 fps on a mid-range laptop; CPU idle when scrolled away.
- [ ] Reduced motion shows the sealed frame with no movement.
- [ ] The label reads `z1:` in lowercase.
- [ ] No console errors and no CSP violations with the policy in `demo/index.html`.
- [ ] Page has no horizontal scroll at 360 px.

## Design notes (why this hero)

- **Inspired by** Anchor AI's dot field on motionsites.ai, rebuilt as a grid where every dot is a real byte.
- **Pros:** explains the product with no extra words; original; reused as the byte counter.
- **Cons:** about one day to tune; needs its caption so it isn't read as decoration.
- **Fallback if time runs short:** ship the static Sealed frame (the Figma component) as an SVG, no animation.
