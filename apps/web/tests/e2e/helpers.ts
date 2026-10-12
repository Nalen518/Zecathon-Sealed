import type { Page } from "@playwright/test";

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
