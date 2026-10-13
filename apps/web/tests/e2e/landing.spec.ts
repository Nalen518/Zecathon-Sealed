import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { collectCsp, watchPage } from "./helpers";

test.describe("Landing", () => {
  test("renders with no CSP violation, no console error and no third-party request", async ({ page, baseURL }) => {
    const watch = await watchPage(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Send a tip only the desk can read.");
    await page.evaluate(() => document.fonts.ready);
    expect(await collectCsp(page, watch)).toEqual([]);
    expect(watch.consoleErrors).toEqual([]);
    const foreign = watch.requests.filter((u) => !u.startsWith(`${baseURL}/`) && !u.startsWith("data:"));
    expect(foreign).toEqual([]);
  });

  test("shows the active network (FR-9)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Testnet").first()).toBeVisible();
  });

  test("has no horizontal scroll (NFR-10)", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("FAQ items are disclosure buttons", async ({ page }) => {
    await page.goto("/");
    const q = page.getByRole("button", { name: "Why do I have to pay?" });
    await expect(q).toHaveAttribute("aria-expanded", "false");
    await q.click();
    await expect(q).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("The payment carries your sealed message")).toBeVisible();
  });

  test("has no serious accessibility issues (axe)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("D-67: with motion on, scrolling reveals every section fully", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= height; y += 400) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1200);
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll(".hero-text > *, .section-heading, .step, .permission-row, .faq-item, .verify-key")]
        .filter((el) => Number(getComputedStyle(el).opacity) < 1)
        .map((el) => el.className),
    );
    expect(hidden).toEqual([]);
    const rules = await page.evaluate(() =>
      [...document.querySelectorAll(".step")].map((el) => getComputedStyle(el).getPropertyValue("--rule-scale").trim()),
    );
    expect(rules.every((r) => r === "1")).toBe(true);
  });

  test("D-67: with reduced motion nothing is moved or hidden", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const styled = await page.evaluate(() =>
      [...document.querySelectorAll(".hero-text > *, .section-heading, .step, .permission-row, .faq-item, .verify-key")]
        .filter((el) => (el as HTMLElement).style.opacity !== "" || (el as HTMLElement).style.transform !== "")
        .map((el) => el.className),
    );
    expect(styled).toEqual([]);
  });

  test("FAQ answers ease open and shut and stay accessible", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/#questions");
    const q = page.getByRole("button", { name: "Which wallets work?" });
    await q.click();
    await expect(q).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Any Zcash wallet that sends shielded payments with a memo.")).toBeVisible();
    await q.click();
    await expect(q).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("Any Zcash wallet that sends shielded payments with a memo.")).toBeHidden();
  });

  test("full-page screenshot for the Figma comparison", async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/landing-${info.project.name}.png`, fullPage: true });
  });
});
