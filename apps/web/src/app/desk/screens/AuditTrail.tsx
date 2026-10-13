import { useCallback, useEffect, useRef, useState } from "react";
import { AuditHeaderRow, AuditRow } from "../../../components/AuditRow/AuditRow";
import { Button } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { DeskHeader } from "../../../components/DeskHeader/DeskHeader";
import { Fingerprint } from "../../../components/Fingerprint/Fingerprint";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { Tag } from "../../../components/Tag/Tag";
import { ApiError } from "../../../lib/api";
import { exportAudit, verifyChain, type ChainResult } from "../../../lib/audit";
import { auditView } from "../auditDisplay";
import { EASE, gsap, useMotion } from "../../../motion/gsap";
import { useDeskSession } from "../DeskSession";
import { errorText } from "../errors";
import { formatAge } from "../format";
import { SignInAgain } from "./Inbox";
import "../../screens/AppScreen.css";
import "./Desk.css";
import "./AuditTrail.css";

/**
 * Figma: Desk screens / Audit trail — Verified, Chain broken. FR-20, T-11.
 * Loads every entry (§6.10), checks the hash chain here in the browser, shows newest first,
 * 50 at a time. Entries and the result live in this component's state only (§7).
 */
const PAGE = 50;

interface Loaded {
  raw: Record<string, unknown>[];
  result: ChainResult;
  checkedAt: number;
}

export function AuditTrail() {
  const { config, api, unlocked, lock, setToken } = useDeskSession();
  const token = unlocked?.secrets.token ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [shown, setShown] = useState(PAGE);
  const [now, setNow] = useState(Date.now());
  const main = useRef<HTMLElement>(null);

  // Once the browser has checked the chain: rows arrive oldest first, then the verdict tag settles (D-67).
  // The check itself is already done. This shows its result, it does not fake progress.
  useMotion(
    main,
    (root) => {
      if (!loaded) return;
      const rows = Array.from(root.querySelectorAll(".audit-row")).slice(0, 12);
      const tl = gsap.timeline();
      tl.from(rows, { opacity: 0, y: 8, duration: 0.25, ease: EASE, stagger: { each: 0.04, from: "end" } });
      tl.from(root.querySelector(".audit-title-row .tag"), { opacity: 0, scale: 0.85, duration: 0.25, ease: "back.out(2)" }, ">-0.05");
    },
    [loaded],
  );

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const raw = await api.auditAll(config.inboxId, token);
      const result = await verifyChain(raw);
      setLoaded({ raw, result, checkedAt: Date.now() });
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthorized") {
        await setToken(null).catch(() => undefined);
        lock();
        return;
      }
      setError(e);
    }
  }, [api, config.inboxId, token, setToken, lock]);

  useEffect(() => {
    if (config.apiBaseUrl && token) void load();
  }, [config.apiBaseUrl, token, load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  function onExport() {
    if (!loaded) return;
    const file = exportAudit(config.inboxId, loaded.raw, loaded.result);
    const url = URL.createObjectURL(new Blob([file.json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const result = loaded?.result ?? null;
  const broken = result && !result.verified ? result.brokenAt : null;
  const newestFirst = loaded ? [...loaded.raw].reverse() : [];
  const ageSeconds = loaded ? Math.round((now - loaded.checkedAt) / 1000) : 0;
  const checked = ageSeconds < 15 ? "just now" : `${formatAge(new Date(loaded!.checkedAt).toISOString(), now)} ago`;

  return (
    <div className="app-page">
      <DeskHeader network={config.network} onLock={lock} />
      <main id="main" className="app-main" ref={main}>
        <div className="container app-stack">
          <div className="audit-top">
            <div className="audit-title">
              <div className="audit-title-row">
                <h1 className="text-heading-h2">Audit trail</h1>
                {result && (
                  <Tag tone={result.verified ? "success" : "danger"}>
                    {result.verified ? "Chain verified" : `Chain broken at #${broken}`}
                  </Tag>
                )}
              </div>
              {loaded && (
                <p className="text-mono-label muted" role="status">
                  {loaded.raw.length} {loaded.raw.length === 1 ? "entry" : "entries"} · checked in this browser {checked}
                </p>
              )}
            </div>
            {loaded && (
              <div className="audit-export">
                <Button variant="secondary" showIcon={false} onClick={onExport}>
                  Export log (JSON)
                </Button>
                <p className="text-body-small muted">
                  The file links each tip to its transaction. Keep it on the desk’s own machine.
                </p>
              </div>
            )}
          </div>

          {!config.apiBaseUrl ? (
            <Callout tone="warning" title="No watcher is set up yet" role="status">
              Set api_base_url in sealed.config.json and redeploy. The audit trail is kept by the watcher.
            </Callout>
          ) : !token ? (
            <SignInAgain />
          ) : error ? (
            <Callout tone="warning" title={errorText(error).title} role="alert">
              {errorText(error).body}
            </Callout>
          ) : !loaded ? (
            <p className="text-body-default muted" role="status">
              Checking the audit log in this browser.
            </p>
          ) : (
            <>
              {broken !== null && (
                <Callout tone="warning" title={`The log does not match itself at entry #${broken}`} role="alert">
                  Entries from #{broken} onward may have been changed or removed. Export the log now and compare it
                  with the latest hash you saved earlier. Then rotate the desk token and check who can reach the
                  Railway service.
                </Callout>
              )}

              <div className="audit-proof">
                <section className="card audit-latest" aria-label="Latest entry hash">
                  {result?.latestHash ? (
                    <Fingerprint label="Latest entry hash" value={result.latestHash} />
                  ) : (
                    <p className="text-body-default muted">No entries yet.</p>
                  )}
                  <p className="text-body-small muted">
                    Save this hash outside Sealed, for example in your notes. If the log is ever rewritten, a hash you
                    saved earlier will no longer appear in it.
                  </p>
                  {broken !== null && (
                    <p className="text-body-small muted">
                      This hash comes from a log that does not check out. Do not save it as your reference.
                    </p>
                  )}
                </section>
                <Callout tone="info" title="What this log records">
                  Only what the server sees: inbox setup, token changes, tip floor changes, tips arriving or changing
                  state, and chain server outages. Never tip text, IP addresses or token values. Locking, unlocking and
                  decrypting happen in your browser, so they are never logged.
                </Callout>
              </div>

              {newestFirst.length > 0 && (
                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <caption className="visually-hidden">Audit entries, newest first</caption>
                    <AuditHeaderRow />
                    <tbody>
                      {newestFirst.slice(0, shown).map((raw, i) => {
                        const v = auditView(raw);
                        return (
                          <AuditRow key={`${v.seq}-${i}`} {...v} broken={broken !== null && raw.seq === broken} />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="actions">
                <p className="text-body-small muted">
                  {newestFirst.length <= shown
                    ? `All ${newestFirst.length} ${newestFirst.length === 1 ? "entry" : "entries"}, newest first. Long logs load 50 at a time.`
                    : `${shown} of ${newestFirst.length} entries, newest first. Long logs load 50 at a time.`}
                </p>
                {newestFirst.length > shown && (
                  <Button variant="secondary" showIcon={false} onClick={() => setShown((n) => n + PAGE)}>
                    Show 50 more
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      <SlimFooter desk />
    </div>
  );
}
