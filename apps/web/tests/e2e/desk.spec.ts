import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import { fromBase64, toBase64 } from "../../src/lib/bytes";
import { sealTip } from "../../src/lib/seal";
import { checkScreen, collectCsp, watchPage } from "./helpers";

/**
 * Desk flow against a fake Inbox API served by Playwright from the shared contract fixtures
 * (api-contract §10). The API origin comes from tests/fixtures/sealed.config.e2e.json.
 */
const API = "https://api.sealed.test/v1";
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../../contracts/fixtures/${name}.json`, import.meta.url), "utf8"));

const PASS = "a long desk passphrase for tests";
const TIP = "The tender was decided before bids closed. Ask the clerk.";
const ADDRESS = `utest1${"q".repeat(120)}`;
const UFVK = `uviewtest1${"q".repeat(200)}`;

interface Api {
  calls: { method: string; path: string; headers: Record<string, string>; body: string }[];
  /** Public key the desk registered, base64. */
  deskKey: string | null;
  status: { tips: number; tokenFailures: number };
  /** Which audit fixture GET /audit serves (T-11). */
  audit: "audit_chain" | "audit_chain_tampered";
}

async function fakeApi(page: Page, origin: string): Promise<Api> {
  const api: Api = { calls: [], deskKey: null, status: { tips: 200, tokenFailures: 0 }, audit: "audit_chain" };
  const cors = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Setup-Secret",
    "Cache-Control": "no-store",
  };
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(body) });

  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/v1", "");
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    api.calls.push({ method: req.method(), path: `${path}${url.search}`, headers: req.headers(), body: req.postData() ?? "" });

    if (req.method() === "POST" && path === "/inbox" && api.deskKey) {
      return json(route, 409, { error: { code: "inbox_exists", message: "exists" } });
    }
    if (req.method() === "POST" && path === "/inbox") {
      const body = JSON.parse(req.postData() ?? "{}");
      api.deskKey = body.desk_public_key;
      return json(route, 201, { ...fixture("inbox"), desk_public_key: body.desk_public_key, fingerprint: body.fingerprint, address: body.address });
    }
    if (req.method() === "POST" && path === "/inbox/desk/tokens") {
      if (api.status.tokenFailures > 0) {
        api.status.tokenFailures--;
        return json(route, 503, { error: { code: "watcher_unavailable", message: "down" } });
      }
      return json(route, 201, fixture("token"));
    }
    if (req.method() === "GET" && path === "/health") return json(route, 200, fixture("health"));
    if (req.method() === "GET" && path === "/inbox/desk/tips") {
      if (api.status.tips === 401) return json(route, 401, { error: { code: "unauthorized", message: "bad token" } });
      const page = fixture("tips_page");
      if (url.searchParams.get("after_seq") !== "0") return json(route, 200, { ...page, tips: [] });
      // Seal a real tip to the key this browser registered, so the Inbox opens it end to end.
      const key = fromBase64(api.deskKey ?? "");
      if (key) page.tips[0].memo_b64 = toBase64((await sealTip(TIP, key)).memoBytes);
      return json(route, 200, page);
    }
    if (req.method() === "GET" && path === "/inbox/desk/audit") return json(route, 200, fixture(api.audit).page);
    if (req.method() === "DELETE" && path === "/inbox/desk") return route.fulfill({ status: 204, headers: cors });
    return json(route, 404, { error: { code: "not_found", message: "no" } });
  });
  return api;
}

async function createDesk(page: Page): Promise<{ backup: string; privateKeyText: string }> {
  await page.goto("/desk");
  await expect(page).toHaveURL(/\/desk\/create$/);
  await expect(page.getByText(/^sealed-desk-key-v1 · /)).toBeVisible();
  const privateKeyText = (await page.getByText(/^sealed-desk-key-v1 · /).textContent()) ?? "";
  await page.getByLabel("Passphrase", { exact: true }).fill(PASS);
  await page.getByLabel("Repeat the passphrase").fill(PASS);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup file" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("sealed-desk-backup.json");
  const backup = readFileSync(await file.path(), "utf8");
  await page.getByLabel("I saved the backup file somewhere safe").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Connect a receive-only account" })).toBeVisible();
  return { backup, privateKeyText };
}

/** Create the desk key and register the inbox against the fake API. */
async function registerDesk(page: Page) {
  await createDesk(page);
  await page.getByLabel("Shielded address for tips").fill(ADDRESS);
  await page.getByLabel("Unified full viewing key").fill(UFVK);
  await page.getByLabel("Setup secret").fill("setup-secret");
  await page.getByRole("button", { name: "Register inbox" }).click();
  await page.getByRole("link", { name: "Open the inbox" }).click();
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
}

test.describe("Audit trail (FR-20)", () => {
  test("verifies the chain in the browser, shows the latest hash and exports the raw log", async ({ page, baseURL }, info) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const watch = await watchPage(page);
    const api = await fakeApi(page, baseURL!);
    await registerDesk(page);
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("link", { name: "Export the audit log first" }).click();
    await expect(page.getByRole("heading", { name: "Audit trail", level: 1 })).toBeVisible();
    await expect(page.getByText("Chain verified")).toBeVisible();
    await expect(page.getByText(fixture("audit_chain").expected.latest_hash)).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(4);
    await expect(page.getByRole("rowheader", { name: "Inbox created" })).toBeVisible();
    const call = api.calls.find((c) => c.path.startsWith("/inbox/desk/audit"))!;
    expect(call.path).toBe("/inbox/desk/audit?after_seq=0&limit=500");
    expect(call.headers.authorization).toMatch(/^Bearer sld_/);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export log (JSON)" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^sealed-audit-desk-\d{4}-\d{2}-\d{2}\.json$/);
    const exported = JSON.parse(readFileSync(await file.path(), "utf8"));
    expect(exported.verified).toBe(true);
    expect(exported.broken_at).toBeNull();
    expect(exported.entries).toEqual(fixture("audit_chain").page.entries);

    await checkScreen(page, "desk-audit-verified", info.project.name);
    expect(await collectCsp(page, watch)).toEqual([]);
  });

  test("T-11: a tampered entry shows Chain broken at that entry", async ({ page, baseURL }, info) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const api = await fakeApi(page, baseURL!);
    api.audit = "audit_chain_tampered";
    await registerDesk(page);
    await page.getByRole("link", { name: "Audit trail" }).click();
    await expect(page.getByText("Chain broken at #2")).toBeVisible();
    await expect(page.getByText("The log does not match itself at entry #2")).toBeVisible();
    await expect(page.getByText("This hash comes from a log that does not check out. Do not save it as your reference.")).toBeVisible();
    const row2 = page.getByRole("row").filter({ hasText: "#2" });
    await expect(row2).toContainText("Hash mismatch");
    await expect(page.getByRole("row").filter({ hasText: "#3" })).not.toContainText("Hash mismatch");
    await checkScreen(page, "desk-audit-broken", info.project.name);
  });
});

test.describe("Desk", () => {
  test("T-9 and FR-11: create, refuse a spend key in the browser, register, open a tip, lock and unlock", async ({ page, baseURL }) => {
    const watch = await watchPage(page);
    const api = await fakeApi(page, baseURL!);
    const { backup, privateKeyText } = await createDesk(page);

    // The backup holds the key only passphrase-wrapped.
    const hex = privateKeyText.replace("sealed-desk-key-v1 · ", "").replace(/ /g, "");
    expect(backup).not.toContain(PASS);
    expect(backup.toUpperCase()).not.toContain(hex);

    // A spending key is refused before any request (NFR-3).
    await page.getByLabel("Shielded address for tips").fill(ADDRESS);
    await page.getByLabel("Unified full viewing key").fill(`secret-extended-key-test1${"q".repeat(200)}`);
    await page.getByLabel("Setup secret").fill("setup-secret");
    await page.getByRole("button", { name: "Register inbox" }).click();
    await expect(page.getByText(/This key can spend funds, so it was not sent/)).toBeVisible();
    expect(api.calls).toEqual([]);

    await page.getByLabel("Unified full viewing key").fill(UFVK);
    await page.getByRole("button", { name: "Register inbox" }).click();
    await expect(page.getByRole("heading", { name: "Publish your fingerprint" })).toBeVisible();
    const create = api.calls.find((c) => c.method === "POST" && c.path === "/inbox")!;
    expect(create.headers["x-setup-secret"]).toBe("setup-secret");
    expect(Object.keys(JSON.parse(create.body)).sort()).toEqual(
      ["address", "desk_public_key", "fingerprint", "id", "name", "tip_floor_zat", "ufvk"].sort(),
    );

    await page.getByRole("link", { name: "Open the inbox" }).click();
    await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
    await expect(page.getByText("Watching")).toBeVisible();
    await expect(page.getByRole("tab", { name: "All tips (2)" })).toBeVisible();
    await page.getByRole("button", { name: /tx 8b02…77ad/ }).click();
    await expect(page.getByText(TIP)).toBeVisible();
    const tipsCall = api.calls.find((c) => c.path.startsWith("/inbox/desk/tips"))!;
    expect(tipsCall.headers.authorization).toMatch(/^Bearer sld_/);
    expect(tipsCall.path).not.toContain("sld_");

    // NFR-1: the private key and passphrase never left the browser.
    for (const c of api.calls) {
      expect(c.body.toUpperCase()).not.toContain(hex);
      expect(c.body).not.toContain(PASS);
      expect(JSON.stringify(c.headers)).not.toContain(PASS);
    }

    // Lock wipes the opened text. Unlock with the passphrase brings the inbox back.
    await page.getByRole("button", { name: "Lock inbox" }).click();
    await expect(page.getByRole("heading", { name: "Unlock the desk key" })).toBeVisible();
    await expect(page.getByText(TIP)).toHaveCount(0);
    await page.getByLabel("Passphrase").fill("not the passphrase at all");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText("That passphrase does not open this key. Check it and try again.")).toBeVisible();
    await page.getByLabel("Passphrase").fill(PASS);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();

    // A reload keeps only the wrapped key: the desk sees the Locked screen.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Unlock the desk key" })).toBeVisible();

    expect(await collectCsp(page, watch)).toEqual([]);
    expect(watch.consoleErrors.filter((e) => !e.includes("api.sealed.test"))).toEqual([]);
  });

  test("T-9: after clearing the browser, the key comes back only from the backup file", async ({ page, context, baseURL }) => {
    await fakeApi(page, baseURL!);
    const { backup } = await createDesk(page);
    await context.clearCookies();
    await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase("sealed"); q.onsuccess = q.onerror = q.onblocked = () => r(null); }));
    await page.goto("/desk");
    await expect(page).toHaveURL(/\/desk\/create$/);
    await page.getByRole("link", { name: "Restore from a backup file" }).click();
    await page.locator("#backup-file").setInputFiles({ name: "sealed-desk-backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
    await page.getByLabel("Passphrase").fill(PASS);
    await page.getByRole("button", { name: "Restore" }).click();
    // Restored but not registered on this watcher yet: the Inbox asks to sign in with the setup secret.
    await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
  });

  test("a failed token request after a successful register can be retried", async ({ page, baseURL }) => {
    const api = await fakeApi(page, baseURL!);
    api.status.tokenFailures = 1;
    await createDesk(page);
    await page.getByLabel("Shielded address for tips").fill(ADDRESS);
    await page.getByLabel("Unified full viewing key").fill(UFVK);
    await page.getByLabel("Setup secret").fill("setup-secret");
    await page.getByRole("button", { name: "Register inbox" }).click();
    await expect(page.getByText("The watcher cannot reach the chain")).toBeVisible();
    await page.getByRole("button", { name: "Register inbox" }).click();
    await expect(page.getByRole("heading", { name: "Publish your fingerprint" })).toBeVisible();
    expect(api.calls.filter((c) => c.method === "POST" && c.path === "/inbox")).toHaveLength(1);
  });

  test("a revoked token (401) sends the desk to the Locked screen", async ({ page, baseURL }) => {
    const api = await fakeApi(page, baseURL!);
    await createDesk(page);
    await page.getByLabel("Shielded address for tips").fill(ADDRESS);
    await page.getByLabel("Unified full viewing key").fill(UFVK);
    await page.getByLabel("Setup secret").fill("setup-secret");
    api.status.tips = 401;
    await page.getByRole("button", { name: "Register inbox" }).click();
    await page.getByRole("link", { name: "Open the inbox" }).click();
    await expect(page.getByRole("heading", { name: "Unlock the desk key" })).toBeVisible();
  });

  test("FR-8 and FR-19: Decrypt opens a pasted memo and refuses anything else", async ({ page, baseURL }) => {
    await fakeApi(page, baseURL!);
    const { backup } = await createDesk(page);
    const publicKey = fromBase64(JSON.parse(backup).sealed_desk_backup.public_key)!;
    const sealed = await sealTip(TIP, publicKey);
    await page.goto("/desk/decrypt");
    await page.getByLabel("Passphrase").fill(PASS);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("heading", { name: "Decrypt a memo" })).toBeVisible();
    await page.getByLabel("Memo from your wallet").fill(sealed.memoText);
    await page.getByRole("button", { name: "Decrypt" }).click();
    await expect(page.getByText(TIP)).toBeVisible();
    await page.getByLabel("Memo from your wallet").fill("Thanks for the coffee! <script>alert(1)</script>");
    await page.getByRole("button", { name: "Decrypt" }).click();
    await expect(page.getByRole("heading", { name: "Not a Sealed tip" })).toBeVisible();
  });

  test("FR-17: delete needs DELETE and the setup secret, then keeps the desk key", async ({ page, baseURL }) => {
    const api = await fakeApi(page, baseURL!);
    await createDesk(page);
    await page.getByLabel("Shielded address for tips").fill(ADDRESS);
    await page.getByLabel("Unified full viewing key").fill(UFVK);
    await page.getByLabel("Setup secret").fill("setup-secret");
    await page.getByRole("button", { name: "Register inbox" }).click();
    await page.getByRole("link", { name: "Open the inbox" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    const del = page.getByRole("button", { name: "Delete inbox and tips" });
    await expect(del).toBeDisabled();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.locator("form.settings-danger").getByLabel("Setup secret").fill("setup-secret");
    await del.click();
    await expect(page.getByRole("heading", { name: "Use your desk key" })).toBeVisible();
    const call = api.calls.find((c) => c.method === "DELETE")!;
    expect(call.headers.authorization).toMatch(/^Bearer /);
    expect(call.headers["x-setup-secret"]).toBe("setup-secret");
  });

  test("every desk screen passes axe and has no horizontal scroll", async ({ page, baseURL }, info) => {
    // Seven axe scans plus Argon2 unlocks: slow when the suite runs in parallel.
    test.setTimeout(90_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fakeApi(page, baseURL!);
    await page.goto("/desk");
    await page.getByLabel("Passphrase", { exact: true }).fill(PASS);
    await page.getByLabel("Repeat the passphrase").fill(PASS);
    await checkScreen(page, "desk-create-1", info.project.name);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download backup file" }).click();
    await download;
    await page.getByLabel("I saved the backup file somewhere safe").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Shielded address for tips").fill(ADDRESS);
    await page.getByLabel("Unified full viewing key").fill(`secret-extended-key-test1${"q".repeat(80)}`);
    await page.getByLabel("Setup secret").fill("setup-secret");
    await page.getByRole("button", { name: "Register inbox" }).click();
    await checkScreen(page, "desk-create-2-error", info.project.name);
    await page.getByLabel("Unified full viewing key").fill(UFVK);
    await page.getByRole("button", { name: "Register inbox" }).click();
    await expect(page.getByRole("heading", { name: "Publish your fingerprint" })).toBeVisible();
    await checkScreen(page, "desk-create-3", info.project.name);
    await page.getByRole("link", { name: "Open the inbox" }).click();
    await page.getByRole("button", { name: /tx 8b02…77ad/ }).click();
    await expect(page.getByText(TIP)).toBeVisible();
    await checkScreen(page, "desk-inbox", info.project.name);
    await page.getByRole("link", { name: "Decrypt a memo" }).click();
    await page.getByLabel("Memo from your wallet").fill("Thanks for the coffee!");
    await page.getByRole("button", { name: "Decrypt" }).click();
    await checkScreen(page, "desk-decrypt-unreadable", info.project.name);
    await page.getByRole("link", { name: "Settings" }).click();
    await checkScreen(page, "desk-settings", info.project.name);
    await page.getByRole("button", { name: "Lock inbox" }).click();
    await checkScreen(page, "desk-locked", info.project.name);
  });
});
