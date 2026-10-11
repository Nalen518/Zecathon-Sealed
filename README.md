# Sealed

A shielded tip line for newsrooms, built for the Zecathon hackathon (Wildcard track).

A source writes a tip in the browser. The page seals it with libsodium, and the source pays a small shielded Zcash amount (0.001 ZEC by default) from their own wallet with the sealed tip as the memo. Only the desk's browser can open it.

> **Status:** early build. This repository is being set up. Nothing here is ready to use yet.

## How it works

1. The sender page seals the tip to the desk's public key. The plaintext never leaves the browser.
2. The sender pays the desk's shielded address from their own wallet. The sealed tip travels as the memo in a ZIP 321 payment link or QR code.
3. A watcher holding a view-only key lists arriving ciphertext. It cannot read tips or spend funds.
4. The desk decrypts each tip in its own browser. The desk's private key never leaves that device.

The parts that run only in the browser (writing, sealing, paying, decrypting, the sender safety check) work with no backend at all.

## What it does not do

- It is not a replacement for SecureDrop and does not promise anonymity at the network layer.
- The page's JavaScript is a trust point. The desk publishes its key fingerprint elsewhere so a sender can compare it.
- The sender needs ZEC and a Zcash wallet first, and buying ZEC is often traceable.

## Planned structure

| Path | What it holds |
|---|---|
| `apps/web` | Frontend (Vite, React, TypeScript), deployed on Vercel |
| `apps/watcher` | Rust watcher and API on librustzcash, deployed on Railway (later) |
| `contracts/fixtures` | Shared JSON fixtures that both sides test against |
| `docs` | PRD, SRD, architecture, API contract, design and frontend rules |

## Principles

- No third-party scripts, fonts, analytics or cookies. Strict content security policy.
- Tip text, the desk private key and the passphrase never appear in a request, log or URL.
- Real data only: every value comes from config, the browser, the API contract or the user.
- Exact dependency versions and a committed lockfile.

## Branches

`main` holds reviewed work. Day to day work happens on `development` and is merged into `main` through a pull request.

## Licence

Licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
