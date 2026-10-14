import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fromBase64, fromBase64Url } from "../../src/lib/bytes";
import { openMemo } from "../../src/lib/seal";
import { parsePaymentUri } from "../../src/lib/zip321";
import { checkScreen, collectCsp, watchPage } from "./helpers";

const deskKey = JSON.parse(readFileSync(new URL("../fixtures/desk-key.e2e.json", import.meta.url), "utf8")) as {
  public_key: string;
  private_key: string;
};

const TIP = "Bridge tender décidé before bids closed. Ask the clerk about the March 4 minutes. 🚧";

test.describe("Sender flow", () => {
  test("T-3: write, seal and pay. The tip never appears in any request and the link opens to the same text", async ({ page, baseURL }) => {
    const watch = await watchPage(page);
    const bodies: string[] = [];
    page.on("request", (r) => bodies.push(`${r.url()} ${r.postData() ?? ""} ${JSON.stringify(r.headers())}`));

    await page.goto("/write");
    await expect(page.getByRole("button", { name: "Seal and continue" })).toBeDisabled();
    await expect(page.getByText("C9D6 AF3B 94A7 2C34")).toBeVisible();

    await page.getByLabel("Your tip", { exact: true }).fill(TIP);
    const bytes = new TextEncoder().encode(TIP).length;
    await expect(page.getByText(`${bytes} / 331 bytes`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Seal and continue" }).click();

    await expect(page).toHaveURL(/\/pay$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pay from your wallet");
    await expect(page.getByRole("img", { name: /Payment request/ })).toBeVisible();
    // D-71, D-76: the envelope shows what the chain sees, and the same facts are real text next to it.
    const chainSees = /^Sealed envelope\. What the chain sees: sender hidden, recipient hidden, amount hidden, memo 511 bytes\.$/;
    const caption = "The chain sees a shielded payment with a 511 byte memo. Sender, recipient and amount stay hidden.";
    await expect(page.getByRole("img", { name: chainSees })).toBeVisible();
    await expect(page.getByText(caption)).toBeVisible();

    const href = await page.getByRole("link", { name: "Open in wallet" }).getAttribute("href");
    const parsed = parsePaymentUri(href!);
    expect(parsed.amount).toBe("0.001");
    expect(parsed.address.startsWith("utest1")).toBe(true);

    // The desk (and only the desk) can open the memo from the link (FR-2, FR-4).
    const opened = await openMemo(parsed.memo, {
      publicKey: fromBase64(deskKey.public_key)!,
      privateKey: fromBase64(deskKey.private_key)!,
    });
    expect(opened).toEqual({ ok: true, text: TIP });
    expect(fromBase64Url(new URL(href!.replace("zcash:", "zcash://x/")).searchParams.get("memo")!)).not.toBeNull();

    await page.getByRole("button", { name: "I’ve sent it" }).click();
    await expect(page).toHaveURL(/\/sent$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sent. Only the desk can read it.");
    await expect(page.getByText("Marked as sent")).toBeVisible();
    await expect(page.getByRole("img", { name: chainSees })).toBeVisible();
    await expect(page.getByText(caption)).toBeVisible();

    // NFR-1: no request carried the tip in any form.
    const needles = [TIP, encodeURIComponent(TIP), "décidé", "Bridge tender"];
    for (const b of bodies) for (const n of needles) expect(b).not.toContain(n);
    const foreign = watch.requests.filter((u) => !u.startsWith(`${baseURL}/`));
    expect(foreign).toEqual([]);
    expect(await collectCsp(page, watch)).toEqual([]);
    expect(watch.consoleErrors).toEqual([]);
  });

  test("FR-1: input past 331 bytes is cut at a whole character", async ({ page }) => {
    await page.goto("/write");
    await page.getByLabel("Your tip", { exact: true }).fill("é".repeat(200));
    await expect(page.getByText("330 / 331 bytes", { exact: true })).toBeVisible();
    await page.getByLabel("Your tip", { exact: true }).press("End");
    await page.getByLabel("Your tip", { exact: true }).pressSequentially("ab");
    await expect(page.getByText("331 / 331 bytes", { exact: true })).toBeVisible();
    await expect(page.getByText("You have used all 331 bytes. Shorten the tip to add more.")).toBeVisible();
  });

  test("Back after I've sent it never returns to the sealed tip or loops on Sent", async ({ page }) => {
    await page.goto("/write");
    await page.getByLabel("Your tip", { exact: true }).fill("A tip");
    await page.getByRole("button", { name: "Seal and continue" }).click();
    await page.getByRole("button", { name: "I’ve sent it" }).click();
    await expect(page).toHaveURL(/\/sent$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/write$/);
    await expect(page.getByLabel("Your tip", { exact: true })).toHaveValue("");
    await page.goBack();
    await expect(page).toHaveURL(/\/write$/);
    await expect(page.getByRole("img", { name: /Payment request/ })).toHaveCount(0);
  });

  test("Seal moment: plays once after a successful seal, never over the facts", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/write");
    await page.getByLabel("Your tip", { exact: true }).fill("A tip");
    await page.getByRole("button", { name: "Seal and continue" }).click();
    await expect(page).toHaveURL(/\/pay$/);
    // The facts are readable while it plays.
    await expect(page.getByText(/The chain sees a shielded payment/)).toBeVisible();
    // The sealed memo grid folds into the envelope and is then removed.
    await expect(page.locator(".pay-seal-ghost")).toHaveCount(0, { timeout: 3000 });
    await expect
      .poll(() => page.locator(".pay-envelope .env-seal").evaluate((el) => getComputedStyle(el).opacity))
      .toBe("1");
  });

  test("Seal moment: reduced motion shows the still final frame", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/write");
    await page.getByLabel("Your tip", { exact: true }).fill("A tip");
    await page.getByRole("button", { name: "Seal and continue" }).click();
    await expect(page).toHaveURL(/\/pay$/);
    await expect(page.getByRole("img", { name: /^Sealed envelope\./ })).toBeVisible();
    await expect(page.locator(".pay-seal-ghost")).toHaveCount(0);
  });

  test("D-83: the faucet opens in a new tab with no Referer, and the sealed tip stays in this tab", async ({ page, context, baseURL }) => {
    const watch = await watchPage(page);
    // The new tab is answered here, so the test never reaches the real faucet.
    const faucetRequests: { url: string; referer: string | undefined }[] = [];
    await context.route("https://faucet.testnet.valargroup.dev/**", (route) => {
      faucetRequests.push({ url: route.request().url(), referer: route.request().headers()["referer"] });
      return route.fulfill({ status: 200, contentType: "text/html", body: "<title>Faucet</title>" });
    });

    await page.goto("/write");
    await page.getByLabel("Your tip", { exact: true }).fill("A tip about the tender");
    await page.getByRole("button", { name: "Seal and continue" }).click();
    await expect(page).toHaveURL(/\/pay$/);
    const memoBefore = await page.getByRole("link", { name: "Open in wallet" }).getAttribute("href");

    await expect(page.getByText("Need testnet ZEC?")).toBeVisible();
    const faucet = page.getByRole("link", { name: /Get free TAZ from the faucet/ });
    await expect(faucet).toHaveAttribute("href", "https://faucet.testnet.valargroup.dev/");
    await expect(faucet).toHaveAttribute("target", "_blank");
    await expect(faucet).toHaveAttribute("rel", "noopener noreferrer");
    // Loading Pay made no request to the faucet or the explorer.
    expect(watch.requests.filter((u) => /valargroup\.dev|zecblock\.com/.test(u))).toEqual([]);

    const [tab] = await Promise.all([context.waitForEvent("page"), faucet.click()]);
    await tab.waitForLoadState();
    expect(tab.url()).toBe("https://faucet.testnet.valargroup.dev/");
    // noopener: the faucet tab cannot reach back into this one. noreferrer: no Referer header.
    expect(await tab.evaluate(() => window.opener)).toBeNull();
    expect(faucetRequests).toHaveLength(1);
    expect(faucetRequests[0]!.referer).toBeUndefined();

    // The original tab still holds the same sealed tip.
    await expect(page).toHaveURL(/\/pay$/);
    expect(await page.getByRole("link", { name: "Open in wallet" }).getAttribute("href")).toBe(memoBefore);
    expect(memoBefore).toContain("memo=");
    expect(watch.requests.filter((u) => /valargroup\.dev|zecblock\.com/.test(u))).toEqual([]);
  });

  test("Pay without a sealed tip goes back to Write", async ({ page }) => {
    await page.goto("/pay");
    await expect(page).toHaveURL(/\/write$/);
  });

  test("Leave asks inside the page before discarding a tip (D-13)", async ({ page }) => {
    await page.goto("/write");
    await page.getByLabel("Your tip", { exact: true }).fill("Something");
    await page.getByRole("button", { name: "Leave" }).click();
    const dialog = page.getByRole("dialog", { name: "Leave and discard your tip?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stay on this page" }).click();
    await expect(page.getByLabel("Your tip", { exact: true })).toHaveValue("Something");
    await page.getByRole("button", { name: "Leave" }).click();
    await page.getByRole("button", { name: "Leave and discard" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("Sender screens", () => {
  test("Write, Pay, Sent and the Safety check pass axe and have no horizontal scroll", async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const watch = await watchPage(page);
    await page.goto("/write");
    await page.getByLabel("Your tip", { exact: true }).fill("A tip about the tender");
    await checkScreen(page, "sender-write", info.project.name);
    await page.getByRole("button", { name: "Seal and continue" }).click();
    await expect(page.getByRole("heading", { name: "Pay from your wallet" })).toBeVisible();
    await checkScreen(page, "sender-pay", info.project.name);
    await page.getByRole("button", { name: "I’ve sent it" }).click();
    await expect(page.getByText("Marked as sent")).toBeVisible();
    await checkScreen(page, "sender-sent", info.project.name);
    await page.goto("/safety-check");
    await checkScreen(page, "safety-question", info.project.name);
    await page.getByText("I bought it on an exchange with my ID").click();
    await page.getByRole("button", { name: "Next question" }).click();
    await page.getByText("A few days ago or more").click();
    await page.getByRole("button", { name: "Next question" }).click();
    await page.getByText("A work, school or shared network").click();
    await page.getByRole("button", { name: "See the result" }).click();
    await checkScreen(page, "safety-result", info.project.name);
    expect(await collectCsp(page, watch)).toEqual([]);
  });
});

test.describe("Safety check", () => {
  test("T-10: completes with the network off and makes no request", async ({ page, context }) => {
    await page.goto("/safety-check");
    await page.evaluate(() => document.fonts.ready);
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await context.setOffline(true);

    await page.getByText("I bought it on an exchange with my ID").click();
    await page.getByRole("button", { name: "Next question" }).click();
    await page.getByText("A few days ago or more").click();
    await page.getByRole("button", { name: "Next question" }).click();
    await page.getByText("A work, school or shared network").click();
    await page.getByRole("button", { name: "See the result" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Two things to change before you send");
    await expect(page.getByText("Your ZEC came from an exchange with your ID")).toBeVisible();
    await expect(page.getByText("Timing looks fine")).toBeVisible();
    expect(requests).toEqual([]);
    await context.setOffline(false);
  });
});
