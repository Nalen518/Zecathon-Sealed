# Sealed frontend feedback log

Every piece of feedback on the design or the frontend, who gave it, and what was done. Newest at the bottom. When feedback changes a rule, update `rules.md`. When it changes a choice, add a row to `decisions.md`.

Status values: **Done**, **In progress**, **Won't do** (with reason), **Parked** (after the hackathon).

## How to add an entry

Copy this row into the log and fill every cell.

| ID | Date | From | Where | Feedback | Action taken | Status |
|---|---|---|---|---|---|---|
| F-xx | | @name, judge, tester | Screen or file | What they said, in their words if possible | What changed, with the Figma frame or file | |

## Log

| ID | Date | From | Where | Feedback | Action taken | Status |
|---|---|---|---|---|---|---|
| F-01 | Oct 11 | @Apa | First mockup canvas | Did not like the first generated look. Wants plain and sober, based on real tip pages | Direction set to Mullvad-like calm, tip-page structure from ProPublica, The Intercept, SecureDrop | Done |
| F-02 | Oct 11 | @Apa | Whole product | Use the name Sealed instead of the newsroom placeholder | Every [Newsroom name] replaced with Sealed (D-01) | Done |
| F-03 | Oct 11 | @Apa | Scope | Web only. No mobile design or code | Mobile frames removed. Code keeps a one-column stack so NFR-10 passes (D-02) | Done |
| F-04 | Oct 11 | @Apa | Header and footer | The blue header and footer feel off | Navy replaced by ink, palette A chosen (D-03) | Done |
| F-05 | Oct 11 | @Apa | Hero and footer | Wants an animated hero and footer inspired by motionsites.ai and footer.design | Researched both, offered 3 heroes and 3 footers live. Picked H1 and F3, built in our own code in `docs/motion` (D-04, D-05, D-06) | Done |
| F-06 | Oct 11 | @Apa | App screen footers | Remove "Source code · Honest limits · Verify this page" from the slim footers | Removed on all 16 app screens. Honest limits stay in the Inbox callout, verify stays in the header and Write screen | Done |
| F-07 | Oct 11 | @Apa | All copy | No dashes or semicolons to join wording | 13 strings rewritten, rule added (D-17, rules §5.2) | Done |
| F-08 | Oct 11 | @Apa | All screens | Everything must be real and connected after the backend, not a mock | Data wiring table added to `design-screens.md`, rule "real data only" (rules §2), two missing endpoints added (D-19) | Done |
| F-09 | Oct 11 | @Apa | Safety check result | Asked what the research-age sentence means | Explained, sentence rewritten in plain words, kept for honesty (D-18) | Done |
| F-10 | Oct 11 | Design critique | Whole file | 12 inconsistencies: voice, relabeled badges, no Danger button, info icon, spacing, names, lock button, textarea error, nav in the flow, small links, scaled grid text | All 12 fixed and re-audited with zero findings (D-13 to D-16) | Done |
| F-11 | Oct 11 | @Apa | Frontend and backend | Frontend must follow the backend API from the SRD with no conflicts. Needs its own document | `docs/api-contract.md` written. 11 conflicts found and settled (C-1 to C-11). Architecture §4 now points to it. Setup secret field added to the Settings delete card (D-21 to D-26) | Done |
| F-12 | Oct 11 | @Apa | All docs | Fix the conflicts between the docs before any code or GitHub setup | Aligned: stack in PRD and Architecture, `after_seq` in design-screens, tip floor range in the contract (C-12), hero headline in the motion prompt, handoff prompt marked superseded (D-27 to D-29). SAMPLE_TIP kept as an illustration (D-30). Privacy policy link removed from the docs (D-31). Figma footer still to update | In progress |
| F-13 | Oct 11 | @Apa | Git and stack | Work on the existing GitHub repo as Nalen518 only, no Claude contributor. README on `main`, branch `development` for the work. Licence MIT OR Apache-2.0. Confirm all stack choices | README, `main` and `development` pushed. Licence files added. P-01 to P-08 confirmed (D-32 to D-35). `CLAUDE.md` written | Done |
