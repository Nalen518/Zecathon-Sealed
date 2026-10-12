import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectCsp, watchPage } from "./helpers";

/** Accessibility, CSP and no-horizontal-scroll checks for every sender screen, plus captures for the Figma comparison. */

async function check(page: Page, name: string, project: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `test-results/${name}-${project}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Write: empty, typing and at limit", async ({ page }, info) => {
  const watch = await watchPage(page);
  await page.goto("/write");
  await check(page, "write-empty", info.project.name);
  await page.getByLabel("Your tip", { exact: true }).fill("The tender for the river bridge was decided before bids closed.");
  await check(page, "write-default", info.project.name);
  await page.getByLabel("Your tip", { exact: true }).fill("x".repeat(400));
  await check(page, "write-at-limit", info.project.name);
  expect(await collectCsp(page, watch)).toEqual([]);
});

test("Pay and Sent", async ({ page }, info) => {
  const watch = await watchPage(page);
  await page.goto("/write");
  await page.getByLabel("Your tip", { exact: true }).fill("The tender for the river bridge was decided before bids closed.");
  await page.getByRole("button", { name: "Seal and continue" }).click();
  await expect(page).toHaveURL(/\/pay$/);
  await check(page, "pay", info.project.name);
  await page.getByRole("button", { name: "I’ve sent it" }).click();
  await expect(page).toHaveURL(/\/sent$/);
  await check(page, "sent", info.project.name);
  expect(await collectCsp(page, watch)).toEqual([]);
});

test("Safety check: question and result", async ({ page }, info) => {
  const watch = await watchPage(page);
  await page.goto("/safety-check");
  await page.getByText("I bought it on an exchange with my ID").click();
  await check(page, "safety-question", info.project.name);
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByText("A few days ago or more").click();
  await page.getByRole("button", { name: "Next question" }).click();
  await page.getByText("A work, school or shared network").click();
  await page.getByRole("button", { name: "See the result" }).click();
  await check(page, "safety-result", info.project.name);
  expect(await collectCsp(page, watch)).toEqual([]);
});
