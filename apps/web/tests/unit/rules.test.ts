import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Static checks for the hard rules in docs/frontend/rules.md that a grep can prove. */
const SRC = join(__dirname, "../../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|css)$/.test(p) ? [p] : [];
  });
}

const sources = files(SRC).map((p) => ({ path: p.replace(SRC, "src"), text: readFileSync(p, "utf8") }));
const code = sources.filter((s) => !s.path.endsWith(".css"));

function offenders(pattern: RegExp, set = code): string[] {
  return set.filter((s) => pattern.test(s.text)).map((s) => s.path);
}

describe("rules.md, checked in the source", () => {
  it("§1.5: no localStorage, sessionStorage or cookies", () => {
    expect(offenders(/\b(localStorage|sessionStorage|document\.cookie)\b/)).toEqual([]);
  });
  it("§1.6: never render HTML from data", () => {
    expect(offenders(/dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/)).toEqual([]);
  });
  it("§1.10: the clipboard is never read", () => {
    expect(offenders(/clipboard\.read/)).toEqual([]);
  });
  it("§1.11: no console logging in shipped code", () => {
    expect(offenders(/\bconsole\.(log|info|warn|error|debug)\b/)).toEqual([]);
  });
  it("§1.3: no inline style attributes (blocked by style-src 'self')", () => {
    expect(offenders(/\sstyle=\{\{/)).toEqual([]);
  });
  it("§6.9: no alert, confirm or prompt", () => {
    expect(offenders(/\b(window\.)?(alert|confirm|prompt)\(/)).toEqual([]);
  });
  it("§8.5: only src/lib/api.ts calls fetch", () => {
    expect(offenders(/\bfetch\(/).filter((p) => !p.endsWith("lib/api.ts") && !p.endsWith("lib\\api.ts"))).toEqual([]);
  });
  it("§8.4: src/lib has no React imports", () => {
    expect(offenders(/from "react/, code.filter((s) => /[\\/]lib[\\/]/.test(s.path)))).toEqual([]);
  });
  it("§4.1: no raw hex colors outside the generated tokens", () => {
    const css = sources.filter((s) => !/tokens\.css$/.test(s.path));
    expect(offenders(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/, css.filter((s) => s.path.endsWith(".css")))).toEqual([]);
  });
  it("§1.2: no third-party URLs in code", () => {
    const allowed = /https:\/\/(github\.com\/Nalen518|openapi\.vercel\.sh)/;
    const hits = code.flatMap((s) =>
      [...s.text.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]).filter((u) => !allowed.test(u)).map((u) => `${s.path}: ${u}`),
    );
    expect(hits).toEqual([]);
  });
});
