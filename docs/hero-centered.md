# Hero: centered text with a memo grid band

Status: **Accepted by @Apa, Oct 17 2026** (option A). Figma is done. Frontend only: no API, contract, fixture or backend change.

## What changed in Figma (file pVuD8nfzyPl2HRPPLuACjV)

| Node | Change |
|---|---|
| Hero `11:24` | Padding top 64 (spacing/3xl), bottom 96 (spacing/4xl). Sides unchanged (120) |
| Hero stack `11:25` (was "Hero columns") | Vertical, centered, 48 gap (spacing/2xl). Text stack on top, memo grid below |
| Hero text `11:26` | 760 px wide, centered. Eyebrow, headline, lead, actions and meta all centered |
| Headline `11:28` | Two balanced lines: "Send a tip only" / "the desk can read." In code use `text-wrap: balance`, not a hard break |
| Lead `11:29` | 600 px max width, so it stays at 3 lines |
| Meta `11:38` | 760 px, one line |
| Memo grid `14:1239` | Swapped to the new `State=Sealed, Size=Band` |
| Memo grid set `14:1238` | New `Size=Band` for all four states (`79:3457` Empty, `79:3982` Writing, `79:4507` Full, `79:5032` Sealed): 64 columns × 8 rows, 4 px gap, 1040 px wide so it lines up with the content column (cells about 12.3 px). Label on the left and legend on the right share one caption row above the grid. Cells keep byte order, so the meaning of every state is unchanged |

Copy is unchanged. Only the alignment and the layout moved.

## Animation: kept, no motion code change

- `mountMemoGrid` already takes `columns` and sizes cells from the canvas width (`apps/web/src/motion/memoGrid.ts`). The fill and the seal sweep run as before. The diagonal sweep order now reads left to right across the band.
- `MemoGrid.tsx` gets `size="band"`, which passes `columns: 64` and `gap: 4`. The cell size comes out at about 12.3 px from the 1040 px width. Only the Landing hero uses it.
- In band size, the label and the legend sit in one flex row above the canvas (`justify-content: space-between`). Default and compact keep the label above and the legend below.
- The Write and Pay grids stay on `default` and `compact` with 32 columns (D-10). Never use Band outside the hero.
- Reduced motion shows the static Sealed band, as before.
- The canvas aria-label does not change.

## Fold check

At 1280 × 720, the grid cells run from about 632 px to 759 px, so roughly five of the eight rows are visible. The whole band is visible from about 760 px of height. The filling animation draws the eye down, so this is accepted. If it looks short in the demo recording, record at 1280 × 800 or larger.

## Trade-offs accepted

| Pro | Con |
|---|---|
| The grid becomes the main visual and explains the product without words | Hero is taller (775 px against 652) |
| Centered hero echoes the centered dot wordmark footer | Only centered section on the page. Every other section stays left-aligned on purpose |
| No backend or contract work | Hero visual tests need new baselines |

## Code acceptance checks

- Hero matches Figma `11:24` at 1280 width: centered text, band below, spacing tokens as above.
- `size="band"` renders 64 × 8 cells at 1020 px. The Write screen and Pay screen grids are unchanged (check their screenshots).
- The loop animation runs, and reduced motion shows the static sealed band.
- Below 860 px the hero falls back to 32 columns (the Default shape). At 360 px (NFR-10), 64 columns with 4 px gaps would leave about 1 px per cell, under the 2 px minimum. Record this as a decision.
- CSP, copy rule and no-third-party tests still pass. Update the hero visual baseline only.

## Critique pass, Oct 17

| ID | Finding | Fix | Status |
|---|---|---|---|
| HC-01 | The band was 1020 px and sat 10 px inside the 1040 px content edge that the header and every section use | Band widened to 1040 px | Done |
| HC-02 | Label and legend were left aligned under a centered stack, so the hero had two alignment axes | Label left and legend right on one caption row, framing the band symmetrically. It also saves 28 px of height | Done |
| HC-03 | The band frame height was 126.5 px, a half pixel | Rounded to 127 px | Done |
| HC-04 | A large gold grid sits under the gold Write a tip button | Checked and kept. The button is solid and saturated, the grid is a dimmer mosaic with dark unused cells, so the button still wins | Won't do |
