# Desk entry and the judge kit

Status: **Accepted by @Apa, Oct 14 2026** (picks A + A). Figma is done. Code is not started.
Owner of this file: @Apa. Frontend and backend agents read it, then record their own decision rows.

## 1. The problem

The landing page only talks to sources. A judge sees "Write a tip" and nothing about the desk, so half the product is invisible.
Even a judge who finds `/desk` cannot set up a desk on the live deploy:

- Creating an inbox needs the setup secret (`X-Setup-Secret`), which only the operator holds.
- The desk public key is bundled in `sealed.config.json` (D-08). One deploy serves exactly one desk. A second desk would need a second deploy.
- A fresh browser has no desk key, and the old Locked screen said "Your key is stored in this browser", which is false for a judge.

## 2. What was decided

| Part | Pick | Why | Trade-off accepted |
|---|---|---|---|
| Find the desk | **A.** "For desks" link in the site header, plus a "Two sides" block on the landing page | Judges see both sides in seconds, with no new page | One more block on a long page |
| Try the desk | **A.** A demo desk judge kit, testnet only | Judges send a tip, open the desk, decrypt it and check the audit trail themselves. Real, not a video | The demo desk key is shared, so anyone with the kit can read tips sent to the demo desk |

Rejected: a separate desk landing page (too much work before Oct 20), video only (judges cannot verify), self-host only (few judges will deploy Rust), one kit per judge (impossible with one bundled desk key per deploy).

## 3. Figma (file pVuD8nfzyPl2HRPPLuACjV)

| Where | Node | What changed |
|---|---|---|
| Components / Site header, Breakpoint=Desktop | `6:25`, new link `70:3436` | Nav link "For desks" after "Questions". Goes to `/#for-desks` |
| Landing / How it works | `11:91`, block `70:7213` | New "Two sides" block at the end of the section, anchor `#for-desks` |
| Landing / Two sides / Judge box | `70:7242` | Dashed box, Tag "TESTNET ONLY". Hidden on mainnet |
| Desk screens / Desk — Restore | `70:7262` | New frame for `/desk/restore` when the browser has no key. Replaces the "not drawn in Figma" note in D-48 |

## 4. Exact copy

No dashes or semicolons join phrases (D-17). Copy below is final unless @Apa changes it.

**Header nav:** `For desks`

**Two sides block**
- Eyebrow: `Two sides`
- Title: `One page for sources. One desk that holds the key.`
- Card 1. Tag `TIP LINE`. Title `For sources`. Body `Write a tip, seal it in your browser and pay from your own wallet. No account, no email and no name.` Button (Primary, arrow) `Write a tip` to `/write`.
- Card 2. Tag `DESK`. Title `For the desk`. Body `The newsroom holds the only key that opens tips, kept in its own browser. The server watches for payments with a view-only key. It can never read a tip or move funds.` Button (Secondary, arrow) `Open the desk` to `/desk`. Text link `Run your own desk` to the README setup section (`sourceUrl` + `#run-your-own-desk`).

**Judge box (testnet only)**
- Tag `TESTNET ONLY`. Title `Judging Sealed? Try both sides.`
- 01 `Write and seal a tip on this page. Paying on testnet needs a testnet wallet, so tips are already waiting in the demo desk.` (changed Oct 19, D-102)
- 02 `Open the desk. Restore the demo desk with the judge kit from the submission notes.`
- 03 `Open the waiting tips in your browser. Then check their entries in the audit trail.` (changed Oct 19, D-102)
- Note: `The demo desk key is shared with judges, so anyone with the kit can read tips sent here. Do not send anything real.`
- Links: `Get free TAZ from the faucet` (faucetUrl, new tab) and `Open the desk` (`/desk/restore`).

**Desk — Restore screen (`/desk/restore`)**
- Tag `RESTORE`. Title `Open the desk in this browser`.
- Body `This browser has no desk key yet. Choose the backup file you saved when you created the inbox, then type its passphrase. The file is read here and never uploaded.`
- Field `Backup file` (mono, shows the file name), helper `Choose the file. It is opened in this browser only.`
- Field `Passphrase`, helper `The passphrase that locks this backup. Locks again after 15 minutes without activity.`
- Button `Restore and unlock`. Text link `Create a new inbox instead` to Create inbox 1.
- Info callout (testnet only): title `Judging Sealed?`, body `The judge kit in the submission notes has the backup file and passphrase for the demo desk. It works on testnet only.`

**Routing:** `/desk` in a browser with no stored key must go to `/desk/restore`, not to the Locked screen.

## 5. Config

Add one field to `sealed.config.json` and `SealedConfig`, following the style of `explorerUrl` and `faucetUrl`:

- `demoDesk: boolean`. True only on the testnet judging deploy. When false, the judge box and the restore callout render nothing.
- Loading the config fails if `demoDesk` is true and `network` is `"main"`. Sealing to a shared key on mainnet must be impossible, the same way a broken config blocks every page today.

## 6. The judge kit

Contents, already supported by the code: `keystore.ts` wraps `{sk, token}` together, so one backup file carries the desk key and the desk token.

1. `sealed-desk-backup.json` for the demo desk.
2. Its passphrase.
3. The tip page link and the fingerprint, so judges can compare it with the README.

Rules:
- Shared only in the private submission notes. Never in the repo, the README, the landing page or the demo video.
- Made from a desk created only for judging, on testnet. Never reuse it for anything else.
- Export the kit **after** the last token rotation. A rotation makes the token inside the backup stale, and every judge gets 401.
- After judging, rotate the token with the setup secret and delete the demo inbox.
- Add `sealed-desk-backup*.json` to `.gitignore` so the kit cannot be committed by accident.

## 7. Risks and how each one is handled

| Risk | Impact | Handling |
|---|---|---|
| Anyone with the kit reads tips sent to the demo desk | A judge's test tip is readable by other judges | The judge box says so. Testnet only. `demoDesk` cannot be true on main |
| A judge rotates the desk token in Settings | Every other judge's backup gets 401 and the demo breaks mid-judging | **Backend:** demo inbox refuses token rotation and tip floor changes made with the desk token (proposed contract C-24, see §8). Setup secret still works for @Apa |
| A judge changes the tip floor | Other judges see tips move to "below floor" | Same lock as above |
| A judge deletes the inbox | Demo gone | Already safe. Delete needs the setup secret (C-5, C-6) |
| Kit leaks publicly | Strangers read testnet demo tips | Testnet only and no real content. Rotate and delete after judging |
| A judge confuses the demo desk with the real product model | Thinks Sealed shares desk keys | Judge box and README both say the kit exists only for judging |

## 8. Proposed contract change C-24 (needs @Apa's yes before code)

A demo inbox lock, set by the backend only:

- New backend env `SEALED_DEMO_INBOX_ID`. Unset in every deploy except the testnet judging one.
- For that inbox only:
  - `POST /v1/inbox/{id}/tokens` with only the desk token gets `403` and a new code `demo_locked`. With the setup secret it still works.
  - `PATCH /v1/inbox/{id}` gets `403 demo_locked` unless the setup secret is also sent.
  - Reads, tips, audit and health are unchanged.
- The backend refuses to start if `SEALED_DEMO_INBOX_ID` is set while the network is main.
- Frontend copy for `demo_locked`: `This is the shared demo desk, so its settings are locked during judging.`
- Fixture: `contracts/fixtures/error_demo_locked.json`.

| Option | Pros | Cons |
|---|---|---|
| **A. Backend lock (recommended)** | Holds even if someone calls the API directly. Small: one env and one check in two routes | A contract change, one new error code and one fixture |
| B. Frontend only, hide Settings actions when `demoDesk` is true | No contract change | Anyone with the token can still call the API. The demo can be broken in one curl |
| C. No lock, ask judges nicely | Zero work | One curious click breaks the demo for every judge |

## 9. Acceptance checks

- Landing header shows "For desks", and it scrolls to `#for-desks` with focus moved to the block heading.
- Two sides block matches Figma `70:7213`, both cards equal height, buttons go to `/write` and `/desk`.
- With `demoDesk: true` on test, the judge box and the restore callout show. With false, or on main, they are absent from the DOM.
- A fresh browser at `/desk` lands on `/desk/restore`. Restoring the kit shows the Inbox with tips. No request carries the passphrase or the key (existing network test).
- With C-24 accepted: rotating the token with only the desk token on the demo inbox returns `403 demo_locked`, and the UI shows the copy above. With the setup secret it works.
- Config with `demoDesk: true` and `network: "main"` fails to load. Backend with `SEALED_DEMO_INBOX_ID` on main fails to start.
- `.gitignore` blocks `sealed-desk-backup*.json`.

## 10. Open questions

| ID | Question | Needed by |
|---|---|---|
| Q-1 | Does the submission form allow private notes for judges, or only public text? If only public, the kit goes in a private link to a file share instead | Before Oct 20 |
| Q-2 | Should the demo video show the judge kit flow or the normal Create inbox flow? | Video script |
