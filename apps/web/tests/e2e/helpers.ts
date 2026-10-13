import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export interface PageWatch {
  /** CSP violations reported by the page. */
  cspViolations: string[];
  /** Console errors. */
  consoleErrors: string[];
  /** Every request URL the page made. */
  requests: string[];
}

/** Records CSP violations, console errors and every request, for the privacy and CSP checks. */
export async function watchPage(page: Page): Promise<PageWatch> {
  const watch: PageWatch = { cspViolations: [], consoleErrors: [], requests: [] };
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on("console", (m) => {
    if (m.type() === "error") watch.consoleErrors.push(m.text());
  });
  page.on("request", (r) => watch.requests.push(r.url()));
  return watch;
}

export async function collectCsp(page: Page, watch: PageWatch): Promise<string[]> {
  const found = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  watch.cspViolations.push(...found);
  return watch.cspViolations;
}

/** axe (WCAG 2.1 AA, no serious or critical issue), no horizontal scroll, and a full-page capture. */
export async function checkScreen(page: Page, name: string, project: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `test-results/${name}-${project}.png`, fullPage: true });
}
