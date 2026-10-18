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

test.describe("For desks and the judge box (D-87, D-88)", () => {
  test("For desks scrolls to the Two sides block and moves focus to its heading", async ({ page }, info) => {
    test.skip(info.project.name === "narrow", "The section links are hidden below 860 px (Figma Site header, Mobile).");
    await page.goto("/");
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "For desks" }).click();
    const heading = page.getByRole("heading", { name: "One page for sources. One desk that holds the key.", level: 2 });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await expect(page).toHaveURL(/\/#for-desks$/);
  });

  test("from another page, For desks opens the landing page at the block", async ({ page }, info) => {
    test.skip(info.project.name === "narrow", "The section links are hidden below 860 px (Figma Site header, Mobile).");
    await page.goto("/safety-check");
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "For desks" }).click();
    await expect(page).toHaveURL(/\/#for-desks$/);
    const heading = page.getByRole("heading", { name: "One page for sources. One desk that holds the key.", level: 2 });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
  });

  test("both sides link to their place, and the judge kit faucet opens a new page", async ({ page, context }) => {
    const watch = await watchPage(page);
    await context.route("https://faucet.testnet.valargroup.dev/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<title>Faucet</title>" }),
    );
    await page.goto("/#for-desks");
    const block = page.locator("#for-desks");
    await expect(block.getByRole("link", { name: "Write a tip" })).toHaveAttribute("href", "/write");
    await expect(block.getByRole("link", { name: "Open the desk" })).toHaveAttribute("href", "/desk");
    await expect(block.getByRole("link", { name: "Run your own desk" })).toHaveAttribute(
      "href",
      "https://github.com/Nalen518/Zecathon-Sealed#run-your-own-desk",
    );

    const judge = page.getByRole("region", { name: "Judging Sealed? Try both sides." });
    await expect(judge).toBeVisible();
    await expect(judge.getByText("Testnet only")).toBeVisible();
    await expect(judge.getByRole("link", { name: "Restore the demo desk" })).toHaveAttribute("href", "/desk/restore");
    const faucet = judge.getByRole("link", { name: /Get free TAZ from the faucet/ });
    await expect(faucet).toHaveAttribute("rel", "noopener noreferrer");
    await expect(faucet).toHaveAttribute("target", "_blank");
    expect(watch.requests.filter((u) => /valargroup\.dev|zecblock\.com/.test(u))).toEqual([]);
    const [tab] = await Promise.all([context.waitForEvent("page"), faucet.click()]);
    await tab.waitForLoadState();
    expect(tab.url()).toBe("https://faucet.testnet.valargroup.dev/");
    await expect(page).toHaveURL(/\/#for-desks$/);
  });
});

test.describe("Hero, centered (docs/hero-centered.md, D-98)", () => {
  const LABEL = "512 squares stand for the 512-byte Zcash memo. A sample tip fills them, then the whole memo turns into sealed text.";

  test("the memo grid is a 64 column band at desktop and the Default shape below 860 px", async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const block = page.locator(".hero .memo-grid-block");
    const canvas = page.getByRole("img", { name: LABEL });
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    if (info.project.name === "desktop") {
      await expect(block).toHaveClass(/memo-grid-band/);
      // 1040 px wide, 8 rows of about 12.3 px cells with 4 px gaps.
      expect(Math.round(box.width)).toBe(1040);
      expect(Math.round(box.height)).toBe(127);
      // Label and legend share one caption row above the band.
      const label = (await block.locator(".memo-grid-label").boundingBox())!;
      const legend = (await block.locator(".memo-grid-legend").boundingBox())!;
      expect(Math.abs(label.y - legend.y)).toBeLessThan(8);
      expect(legend.y).toBeLessThan(box.y);
      // The text column is centered.
      const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
      expect(Math.abs(h1.x + h1.width / 2 - 640)).toBeLessThan(2);
    } else {
      await expect(block).toHaveClass(/memo-grid-default/);
      // 32 × 16 cells, so the grid is about half as tall as it is wide (the band is about one eighth).
      expect(box.height / box.width).toBeGreaterThan(0.45);
    }
    // Reduced motion: the static sealed band is drawn at once.
    await expect(block.locator(".memo-grid-label")).toHaveText(/SEALED · 511 \/ 512 BYTES/);
  });

  test("the loop still types and seals on the band when motion is allowed", async ({ page }, info) => {
    test.skip(info.project.name === "narrow", "Same loop at 32 columns. The desktop band is the new shape.");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const label = page.locator(".hero .memo-grid-label");
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add((await label.textContent()) ?? "");
      await page.waitForTimeout(250);
    }
    // The caption counts bytes as the sample tip is typed, so it changes while the loop runs.
    expect(seen.size).toBeGreaterThan(2);
  });
});
