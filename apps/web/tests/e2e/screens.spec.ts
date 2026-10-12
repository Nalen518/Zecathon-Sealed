import { expect, test } from "@playwright/test";
import { checkScreen, collectCsp, watchPage } from "./helpers";

/** Accessibility, CSP and no-horizontal-scroll checks for every sender screen, plus captures for the Figma comparison. */

const check = checkScreen;

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
