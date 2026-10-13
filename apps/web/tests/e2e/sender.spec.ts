import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fromBase64, fromBase64Url } from "../../src/lib/bytes";
import { openMemo } from "../../src/lib/seal";
import { parsePaymentUri } from "../../src/lib/zip321";
import { collectCsp, watchPage } from "./helpers";

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
