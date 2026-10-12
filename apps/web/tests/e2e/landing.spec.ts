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
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("full-page screenshot for the Figma comparison", async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/landing-${info.project.name}.png`, fullPage: true });
  });
});
