# Design critique, Oct 14 (second pass): network links and desk entry

Scope: everything added to Figma file pVuD8nfzyPl2HRPPLuACjV on Oct 14 afternoon:
- Network badge without the dot.
- Explorer line and row copy button on Audit trail.
- Faucet line on Pay.
- "For desks" header link.
- Two sides block and judge box on Landing.
- Desk Restore screen.

Method: layer inspection (token bindings, text styles, sizes) plus screenshots, compared against the existing components and the rules from the Oct 11 and Oct 14 critiques.

Status values: **To do**, **Done**, **Won't do** (with reason). Owner says where the fix lands: Figma, code, or both.

## Fix list

| ID | Severity | Where (node) | Finding | Fix | Owner | Status |
|---|---|---|---|---|---|---|
| DC-01 | 🔴 Critical | Desk Restore, `70:7296` | "Backup file" is drawn as a text input. It is a file picker in the product (`Locked.tsx`, "Choose backup file"). A judge would look for a field to type into | Replace with a Secondary button "Choose backup file", then the chosen file name in Mono/Code below it, then the helper. Empty state shows "No file chosen" | Figma | To do |
| DC-02 | 🟡 Moderate | Landing Two sides, `70:7213` | Flat hierarchy. The block title, both card titles and the judge box title are all Heading/H3 at 22. The eyebrow above it is the same pattern every section uses before an H2, so it reads like a section with a heading too small | Add a 1 px border/default divider and spacing/4xl (96) above the block. Set the title to Heading/H2 Desktop. Cards and judge box keep H3 | Figma, code | To do |
| DC-03 | 🟡 Moderate | Pay faucet `67:7143`, Audit explorer `67:7277`, `67:7281` | Two text sizes on one line. The prompt is Body/Small 15 and the Text link is 17, so the baselines and sizes clash | Add `Size=Small` (15) to the Text link component and use it in both rows. The rest of each panel is already 15 | Figma, code | To do |
| DC-04 | 🟡 Moderate | Same rows, Audit row copy button `67:7148` | Off-scale values. Row gap 6 (scale has 4 and 8). Copy button radius 6 (scale has sm 4 and md 8) | Gap to spacing/xs (8). Radius to radius/md (8) | Figma | To do |
| DC-05 | 🟡 Moderate | Every frame added on Oct 14 (Two sides, cards, judge box, rows, copy cell) | Values are on the scale but typed in, not bound to variables. Older frames bind them, so a token change would skip the new ones | Bind gap, padding and radius to Spacing variables: 32 xl, 24 lg, 16 md, 12 sm, 8 xs, radius 12 lg | Figma | To do |
| DC-06 | 🟡 Moderate | Audit row `41:79`, Copy tx | Copy is icon only here, but labeled "Copy" everywhere else (latest hash, fingerprint, Pay fields). It also has no Copied state | Keep the icon for table density. Add a `Copied` state that swaps to the check icon for 2 s. In code: aria-label "Copy transaction id", tooltip with the same text, 48 px hit area around the 32 px box | Figma, code | To do |
| DC-07 | 🟢 Minor | Pay faucet row `67:7143` | When the row wraps, the link's 48 px hit area leaves about 24 px of space under "Need testnet ZEC?", so the link looks detached from its question | After DC-03, try one line at 15 px. If it still does not fit the 336 px panel width, keep the wrap with counter-axis gap 0 so only the invisible hit area overlaps | Figma | To do |
| DC-08 | 🟢 Minor | Two sides, judge box links `70:7257` | "Open the desk" appears twice with two destinations: the desk card goes to `/desk`, the judge box to `/desk/restore`. Same label, different place | Rename the judge box link to "Restore the demo desk" | Figma, code, spec §4 | To do |
| DC-09 | 🟢 Minor | Judge box `70:7242` | Dashed border is a new pattern with no rule behind it | Keep it, and add a rule: dashed border means testnet only and is removed on mainnet. Write it on the Components page and in frontend rules | Figma, docs | To do |

## What stays as it is (checked, no change)

- **Desk header on Restore** shows the four desk links. Create inbox and Locked do the same, so it is consistent. The lock button is hidden, which is correct with no key.
- **Network badge** reads fine without the dot. The text label keeps the tag fill, and both variants have even 12 px padding.
- **Two sides cards** are equal height with actions at the bottom, and reuse Tag, Button and Text link.
- **Testnet gating** is named in the layer names (judge box, faucet, explorer, restore callout), so the handoff is clear.

## Accessibility notes

- Copy button: 32 px visual passes WCAG 2.2 AA 2.5.8 (24 px). Project rule asks 48 px for links and small controls, so code adds the hit area (DC-06).
- Text link on the dark Pay panel uses Tone=Inverse. Contrast is the same pair as the panel body text, which already passes.
- Body/Small 15 secondary on bg/page is the existing pair used across the site. No new contrast pairs were introduced.

## Order of work

1. DC-01: the restore screen is the judge's first desk screen, and right now it shows the wrong control.
2. DC-02 and DC-08: the landing page is the judge's first impression of the two sides.
3. DC-03, DC-04, DC-05, DC-06 together, as one token and component pass.
4. DC-07 after DC-03, then DC-09.

Re-audit after the fixes: zero findings expected. Record the result in `docs/frontend/feedback.md` as one entry, and add a decisions row for Text link `Size=Small` and the dashed testnet rule.
