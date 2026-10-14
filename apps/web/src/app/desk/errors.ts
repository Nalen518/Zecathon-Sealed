import { ApiError } from "../../lib/api";

/**
 * Text for every API failure, picked by `code` (api-contract §5.5). The server's `message` is never shown.
 * Field errors return the field they belong to, everything else is a page-level callout.
 * Copy that is not in Figma is listed in decisions.md (D-49).
 */
export interface ErrorText {
  title: string;
  body: string;
  field?: "address" | "ufvk" | "tip_floor_zat" | "setup_secret";
}

export function errorText(e: unknown): ErrorText {
  if (!(e instanceof ApiError)) {
    return { title: "Something went wrong", body: "Reload the page and try again. Nothing was sent." };
  }
  switch (e.code) {
    // TODO(C-24): once contract change C-24 is merged into api-contract.md, map its `demo_locked` code here with
    // "This is the shared demo desk, so its settings are locked during judging." Until then the code is not in
    // the contract, so it is not read (rules §1.1) and falls through to the default text.
    case "spend_key_rejected":
      return {
        title: "This key can spend funds",
        // Figma, Create inbox 2
        body: "This key can spend funds, so it was not sent. Paste a viewing key (starts with uviewtest) for a receive-only account.",
        field: "ufvk",
      };
    case "network_mismatch":
      return {
        title: "Wrong network",
        body: "This address or key is for the other Zcash network. Use one from the same network as this tip line.",
        field: e.field === "address" ? "address" : "ufvk",
      };
    case "address_mismatch":
      return {
        title: "Address and key do not match",
        body: "This address does not come from the viewing key. Use the address of the same receive-only account.",
        field: "address",
      };
    case "address_not_shielded":
      return {
        title: "Address is not shielded",
        body: "This address has no shielded receiver. Memos only work on shielded addresses.",
        field: "address",
      };
    case "floor_out_of_range":
      return {
        title: "Tip floor out of range",
        body: "Use an amount from 0.0001 to 1 ZEC.",
        field: "tip_floor_zat",
      };
    case "forbidden":
      return {
        title: "Setup secret not accepted",
        body: "The setup secret is not right. Copy it again from your Railway variables.",
        field: "setup_secret",
      };
    case "fingerprint_mismatch":
      return {
        title: "The key fingerprint did not match",
        body: "The server computed a different fingerprint for this key. Reload the page and try again.",
      };
    case "inbox_exists":
      return {
        title: "An inbox already exists on this watcher",
        body: "Open it from the browser that created it, or delete it there in Settings first.",
      };
    case "invalid_request":
      return { title: "Something is missing", body: "Check every field and try again." };
    case "unauthorized":
      return { title: "This browser is signed out", body: "Unlock the desk key again." };
    case "not_found":
      return { title: "No inbox on this watcher", body: "The inbox was deleted or never created. Create it again." };
    case "rate_limited":
      return {
        title: "Too many tries",
        body: `Wait ${e.retryAfterSeconds ?? 60} seconds and try again.`,
      };
    case "watcher_unavailable":
      return {
        title: "The watcher cannot reach the chain",
        body: "No chain server is answering. Tips stay on the chain and appear when it reconnects.",
      };
    case "not_configured":
      return {
        title: "No watcher is set up yet",
        body: "Set api_base_url in sealed.config.json and redeploy. Until then, Decrypt a memo works with no server.",
      };
    case "network":
      return {
        title: "The watcher did not answer",
        body: "Check your connection and that the Railway service is running, then try again.",
      };
    case "bad_response":
      return {
        title: "The watcher sent an answer this page does not understand",
        body: "The watcher and this page may be on different versions. Redeploy both from the same commit.",
      };
  }
}
