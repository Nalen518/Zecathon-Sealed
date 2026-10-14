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

## Desk key fingerprint

Not published yet. When the desk creates its inbox, its key fingerprint goes here, so sources can compare it with the one on the tip page before they send.

## Run your own desk

One deploy serves one desk, because the tip page seals to the desk key bundled in its config. To run a desk for your newsroom:

1. **Wallet.** A Zcash wallet with a shielded unified address for tips, and its unified full viewing key (receive only, it cannot spend).
2. **Watcher.** Deploy `apps/watcher` (Railway) with the variables in `docs/api-contract.md` §8: `SEALED_NETWORK`, `SEALED_INBOX_ID`, `ALLOWED_ORIGINS`, `SEALED_LIGHTWALLETD_URLS` (at least two), `SEALED_SETUP_SECRET_HASH` and `SEALED_DB_PATH`.
3. **Desk key.** Open `/desk/create` on your tip page. The browser makes the desk key, locks it with your passphrase and gives you a backup file. Then it registers the inbox with the viewing key and the setup secret.
4. **Tip page.** Put `desk_public_key`, `fingerprint`, `address` and `api_base_url` in `apps/web/sealed.config.json` and redeploy the frontend (Vercel).
5. **Publish the fingerprint** in at least two places sources already trust, such as this README and your newsroom's contact page.

Keep the backup file and passphrase apart, and never commit the backup file. Test on testnet with a small tip before you announce the page.

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
