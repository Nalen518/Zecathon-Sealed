import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { DeskHeader } from "../../../components/DeskHeader/DeskHeader";
import { Envelope } from "../../../components/Envelope/Envelope";
import { Fingerprint } from "../../../components/Fingerprint/Fingerprint";
import { Input } from "../../../components/Input/Input";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { Tag } from "../../../components/Tag/Tag";
import { TextLink } from "../../../components/TextLink/TextLink";
import { TipRow } from "../../../components/TipRow/TipRow";
import { ApiError, type Health, type Tip } from "../../../lib/api";
import { fromBase64 } from "../../../lib/bytes";
import { formatFingerprint } from "../../../lib/fingerprint";
import { formatZec } from "../../../lib/format";
import { utf8Length } from "../../../lib/memo";
import { openMemo } from "../../../lib/seal";
import { EASE, gsap, QUICK, useMotion } from "../../../motion/gsap";
import { useDeskSession } from "../DeskSession";
import { errorText } from "../errors";
import { formatAge, formatHeight, formatWhen, shortTxid } from "../format";
import "../../screens/AppScreen.css";
import "./Desk.css";

/**
 * Figma: Desk screens / Inbox — Default, Empty and watcher behind. FR-12 to FR-16, FR-18, FR-19, NFR-11.
 * Tips are fetched by change sequence every 30 s (api-contract §6.5) and opened in this browser only.
 */
export const POLL_MS = 30_000;

type Tab = "visible" | "below_floor";
type Opened = { kind: "text"; text: string } | { kind: "unreadable" } | { kind: "empty" };
/** What the panel shows: the sealed envelope until the desk opens it, or what opening found. */
type PanelState = { kind: "sealed" } | Opened;

export function Inbox() {
  const { config, api, unlocked, lock, setToken } = useDeskSession();
  const token = unlocked?.secrets.token ?? null;
  const [tips, setTips] = useState<Map<string, Tip>>(new Map());
  const [counts, setCounts] = useState<{ visible: number; belowFloor: number } | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [healthError, setHealthError] = useState<ApiError | null>(null);
  const [tab, setTab] = useState<Tab>("visible");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The tip opened in this browser, keyed by tip id. Held in state only and dropped on lock. */
  const [opened, setOpened] = useState<{ tipId: string; result: Opened } | null>(null);
  const [showMemo, setShowMemo] = useState(false);
  const [now, setNow] = useState(Date.now());
  const seq = useRef(0);
  const rowsRef = useRef<HTMLDivElement>(null);
  /** Tip ids already on screen. null until the first load, so the first list appears without motion. */
  const seen = useRef<Set<string> | null>(null);

  const onUnauthorized = useCallback(async () => {
    // api-contract §3: a bad or revoked token sends the desk to the Locked screen, and the token is dropped (§7).
    await setToken(null).catch(() => undefined);
    lock();
  }, [setToken, lock]);

  const loadTips = useCallback(async () => {
    if (!token) return;
    try {
      let more = true;
      while (more) {
        const page = await api.tips(config.inboxId, token, { afterSeq: seq.current, filter: "all" });
        setTips((prev) => {
          const next = new Map(prev);
          for (const t of page.tips) next.set(t.id, t);
          return next;
        });
        setCounts(page.counts);
        seq.current = Math.max(seq.current, page.nextSeq);
        more = page.hasMore;
      }
      setLoadError(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthorized") return void onUnauthorized();
      setLoadError(e instanceof ApiError ? e : new ApiError("network", 0));
    }
  }, [api, config.inboxId, token, onUnauthorized]);

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await api.health());
      setHealthError(null);
    } catch (e) {
      setHealthError(e instanceof ApiError ? e : new ApiError("network", 0));
    }
  }, [api]);

  useEffect(() => {
    if (!token || !config.apiBaseUrl) return;
    void loadTips();
    void loadHealth();
    const id = window.setInterval(() => {
      void loadTips();
      void loadHealth();
    }, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, [token, config.apiBaseUrl, loadTips, loadHealth]);

  const list = useMemo(
    () =>
      [...tips.values()]
        .filter((t) => (tab === "below_floor" ? t.belowFloor : !t.belowFloor))
        .sort((a, b) => b.seenAt.localeCompare(a.seenAt)),
    [tips, tab],
  );
  const selected = selectedId ? tips.get(selectedId) ?? null : null;

  // A new tip slides into the list when it arrives (D-67). Only real arrivals move. Nothing else in the Inbox does.
  useMotion(
    rowsRef,
    (root) => {
      const ids = list.map((t) => t.id);
      if (seen.current) {
        const fresh = ids.filter((id) => !seen.current!.has(id));
        const els = fresh.map((id) => root.querySelector(`[data-tip-id="${CSS.escape(id)}"]`)).filter(Boolean);
        if (els.length) gsap.from(els, { opacity: 0, y: -12, duration: QUICK, ease: EASE, stagger: 0.06 });
      }
    },
    [list],
  );
  useEffect(() => {
    if (counts === null) return;
    seen.current = new Set([...(seen.current ?? []), ...list.map((t) => t.id)]);
  }, [list, counts]);

  // A tip stays sealed until the desk chooses "Open with desk key" (FR-15, Figma "Inbox — Tip sealed").
  // Memos that cannot be a Sealed tip are never opened and show their reason at once (FR-19).
  const panel: PanelState | null = useMemo(() => {
    if (!selected) return null;
    if (selected.memoB64 === null) return { kind: "empty" };
    if (!selected.formatOk || !fromBase64(selected.memoB64)) return { kind: "unreadable" };
    if (opened && opened.tipId === selected.id) return opened.result;
    return { kind: "sealed" };
  }, [selected, opened]);

  // Bumped whenever the selection or the key changes, so an opening still in flight is dropped
  // instead of showing that tip already open the next time it is chosen.
  const openRun = useRef(0);
  useEffect(() => {
    openRun.current++;
    setShowMemo(false);
    setOpened(null);
  }, [selectedId, unlocked]);

  const openSelected = useCallback(async () => {
    if (!selected?.memoB64 || !unlocked) return;
    const run = ++openRun.current;
    const bytes = fromBase64(selected.memoB64);
    const r = bytes ? await openMemo(bytes, unlocked.secrets) : null;
    if (run !== openRun.current) return;
    setOpened({ tipId: selected.id, result: r?.ok ? { kind: "text", text: r.text } : { kind: "unreadable" } });
  }, [selected, unlocked]);

  if (!config.apiBaseUrl || !token) {
    return (
      <DeskPage onLock={lock}>
        <h1 className="text-heading-h2">Inbox</h1>
        {!config.apiBaseUrl ? (
          <Callout tone="warning" title="No watcher is set up yet" role="status">
            Set api_base_url in sealed.config.json and redeploy. Until then, open tips from your wallet with{" "}
            <Link to="/desk/decrypt">Decrypt a memo</Link>.
          </Callout>
        ) : (
          <SignInAgain />
        )}
        <HonestLimits />
      </DeskPage>
    );
  }

  const okSources = health?.sources.filter((s) => s.ok).length ?? 0;
  const totalSources = health?.sources.length ?? 0;
  const watching = health !== null && okSources === totalSources && health.lagBlocks < 3;
  const lastChecked = health?.sources
    .map((s) => s.lastCheckedAt)
    .filter((t): t is string => t !== null)
    .sort()
    .at(-1);
  const total = counts?.visible ?? 0;
  const hidden = counts?.belowFloor ?? 0;

  return (
    <DeskPage onLock={lock}>
      <div className="inbox-top">
        <h1 className="text-heading-h2">Inbox</h1>
        {health && (
          <div className="inbox-health" role="status">
            <Tag tone={watching ? "success" : "warning"}>{watching ? "Watching" : "Watcher behind"}</Tag>
            <span className="text-mono-label muted">
              {okSources} of {totalSources} servers{okSources < totalSources ? " answering" : ""} · {health.lagBlocks}{" "}
              blocks behind{lastChecked ? ` · checked ${formatAge(lastChecked, now)} ago` : ""}
            </span>
          </div>
        )}
      </div>

      {health && !watching && (
        <Callout tone="warning" title="Tips may arrive late">
          {okSources < totalSources
            ? `${totalSources - okSources === 1 ? "One chain server is" : `${totalSources - okSources} chain servers are`} not answering and the watcher is ${health.lagBlocks} blocks behind. It keeps trying the other server.`
            : `The watcher is ${health.lagBlocks} blocks behind.`}{" "}
          Nothing is lost, because tips stay on the chain.
        </Callout>
      )}
      {healthError && (
        <Callout tone="warning" title={errorText(healthError).title} role="alert">
          {errorText(healthError).body}
        </Callout>
      )}
      {loadError && (
        <Callout tone="warning" title={errorText(loadError).title} role="alert">
          {errorText(loadError).body}
        </Callout>
      )}

      {counts === null && !loadError ? (
        <p className="text-body-default muted" role="status">
          Loading tips.
        </p>
      ) : counts !== null && total + hidden === 0 ? (
        <section className="card inbox-empty" aria-labelledby="empty-title">
          <h2 id="empty-title" className="text-heading-h3">
            No tips yet
          </h2>
          <p className="text-body-default muted">
            New tips show up here about 2 minutes after 3 confirmations. Share your tip page and fingerprint so sources
            can reach you.
          </p>
          <div className="fields">
            <Fingerprint label="Your tip page" value={`${window.location.origin}/`} />
            {config.fingerprint && (
              <Fingerprint label="Desk key fingerprint" value={formatFingerprint(config.fingerprint)} />
            )}
          </div>
        </section>
      ) : (
        <div className="inbox-columns">
          <div className="inbox-list">
            <div className="inbox-tabs" role="tablist" aria-label="Tips">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "visible"}
                className="inbox-tab text-body-default-medium"
                onClick={() => setTab("visible")}
              >
                All tips ({total})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "below_floor"}
                className="inbox-tab text-body-default-medium"
                onClick={() => setTab("below_floor")}
              >
                Below floor, hidden ({hidden})
              </button>
            </div>
            <div className="inbox-rows" role="tabpanel" ref={rowsRef}>
              {list.map((t) => (
                <div key={t.id} data-tip-id={t.id}>
                <TipRow
                  time={formatWhen(t.blockTimeAt ?? t.seenAt)}
                  meta={`tx ${shortTxid(t.txid)}${t.height !== null ? ` · block ${formatHeight(t.height)}` : " · not mined yet"}`}
                  amount={`${formatZec(t.amountZat)} ZEC`}
                  status={t.displayStatus}
                  selected={t.id === selectedId}
                  onSelect={() => setSelectedId(t.id)}
                />
                </div>
              ))}
            </div>
          </div>
          {selected && panel ? (
            <TipPanel
              key={selected.id}
              tip={selected}
              panel={panel}
              onOpen={openSelected}
              showMemo={showMemo}
              onToggleMemo={() => setShowMemo((v) => !v)}
            />
          ) : (
            <p className="text-body-default muted">Choose a tip to open it in this browser.</p>
          )}
        </div>
      )}
      <HonestLimits />
    </DeskPage>
  );
}

function DeskPage({ onLock, children }: { onLock: () => void; children: React.ReactNode }) {
  const { config } = useDeskSession();
  return (
    <div className="app-page">
      <DeskHeader network={config.network} onLock={onLock} />
      <main id="main" className="app-main">
        <div className="container app-stack">{children}</div>
      </main>
      <SlimFooter desk />
    </div>
  );
}

/** NFR-11: honest limits stay visible on the Inbox (Figma callout). */
function HonestLimits() {
  return (
    <Callout tone="info" title="What this inbox cannot tell you">
      Who sent a tip, or whether they used a genuine copy of your page. Arrival time and amount are visible to the
      server. The words are not. Sealed is not a SecureDrop replacement.
    </Callout>
  );
}

function TipPanel({
  tip,
  panel,
  onOpen,
  showMemo,
  onToggleMemo,
}: {
  tip: Tip;
  panel: PanelState;
  onOpen: () => Promise<void>;
  showMemo: boolean;
  onToggleMemo: () => void;
}) {
  const { config } = useDeskSession();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  /** Set by the click on "Open with desk key", so the flap plays only for a real opening (D-78). */
  const justOpened = useRef(false);
  const memoText = useMemo(() => {
    const bytes = tip.memoB64 ? fromBase64(tip.memoB64) : null;
    if (!bytes) return "";
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, end));
  }, [tip.memoB64]);

  // The button that was focused is gone once the tip opens, so focus moves to the letter.
  useEffect(() => {
    if (panel.kind !== "text" || !justOpened.current) return;
    rootRef.current?.querySelector<HTMLElement>(".env-letter")?.focus();
  }, [panel.kind]);

  // D-78: the seal breaks, the flap swings up past its hinge and the letter rises, about 700 ms.
  // The tip text is real and selectable from the first frame. Only transform moves the letter, never opacity.
  useMotion(
    rootRef,
    (root) => {
      if (panel.kind !== "text" || !justOpened.current) return;
      const flap = root.querySelector(".env-open-flap");
      const seal = root.querySelector(".env-broken-seal");
      const letter = root.querySelector(".env-letter");
      if (!flap || !seal || !letter) return;
      gsap
        .timeline({ defaults: { ease: EASE } })
        .from(seal, { scale: 1.6, opacity: 0, duration: 0.2, transformOrigin: "50% 50%" }, 0)
        // Closed, the flap hangs down over the letter. It passes the hinge at the midpoint and drops behind it.
        .fromTo(
          flap,
          { scaleY: -1, zIndex: 4, transformOrigin: "50% 100%" },
          { scaleY: 0, duration: 0.2, ease: "power1.in" },
          0.05,
        )
        .set(flap, { zIndex: "" }, 0.25)
        .to(flap, { scaleY: 1, duration: 0.2, ease: "power1.out" }, 0.25)
        .from(letter, { y: 120, duration: 0.35 }, 0.35);
    },
    [panel.kind],
  );

  async function open() {
    setBusy(true);
    justOpened.current = true;
    try {
      await onOpen();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card decrypt-panel" aria-label="Selected tip" ref={rootRef}>
      {panel.kind === "sealed" && (
        <Envelope
          context="desk"
          state="sealed"
          amountZat={tip.amountZat}
          height={tip.height}
          blockTime={tip.blockTimeAt}
        />
      )}
      {panel.kind === "text" && <Envelope context="desk" state="open" tip={panel.text} bytes={utf8Length(panel.text)} />}
      {panel.kind === "unreadable" && (
        <div>
          <h2 className="text-heading-h3">Not a Sealed tip</h2>
          <p className="text-body-default muted">
            The memo does not start with z1:, or it was sealed to a different desk key. Sealed never renders memos it
            cannot open, so links or scripts inside them stay inert.
          </p>
        </div>
      )}
      {panel.kind === "empty" && (
        <div>
          <h2 className="text-heading-h3">The wallet sent no memo</h2>
          <p className="text-body-default muted">
            A payment arrived without the sealed tip. Some wallets drop the memo from payment links. The source can
            send again with the three copy fields.
          </p>
        </div>
      )}

      <dl className="tip-details">
        <div>
          <dt className="text-mono-label">Received</dt>
          <dd className="text-mono-label">
            {tip.blockTimeAt ? `${formatWhen(tip.blockTimeAt)} (block time)` : `${formatWhen(tip.seenAt)} (seen)`}
          </dd>
        </div>
        <div>
          <dt className="text-mono-label">Block</dt>
          <dd className="text-mono-label">
            {tip.height !== null
              ? `${formatHeight(tip.height)} · ${tip.confirmations ?? 0} confirmations`
              : "Not mined yet"}
          </dd>
        </div>
        <div>
          <dt className="text-mono-label">Amount</dt>
          <dd className="text-mono-label">
            {formatZec(tip.amountZat)} ZEC (floor {formatZec(config.tipFloorZat)})
          </dd>
        </div>
        <div>
          <dt className="text-mono-label">Transaction</dt>
          <dd className="text-mono-label">{tip.txid}</dd>
        </div>
      </dl>

      {showMemo && memoText && <p className="text-mono-code tip-memo">{memoText}</p>}

      {panel.kind === "sealed" ? (
        <>
          <div className="actions">
            <Button onClick={() => void open()} disabled={busy}>
              Open with desk key
            </Button>
          </div>
          <p className="text-body-small muted">
            Opening happens in this browser with your desk key. The server only ever had the sealed memo.
          </p>
        </>
      ) : (
        <>
          <div className="actions">
            {panel.kind === "text" && (
              <Button
                variant="secondary"
                showIcon={false}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(panel.text);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Copied" : "Copy text"}
              </Button>
            )}
            {memoText && (
              <button
                type="button"
                className="text-link text-link-default text-body-default-medium desk-link-button"
                aria-expanded={showMemo}
                onClick={onToggleMemo}
              >
                {showMemo ? "Hide the sealed memo" : "Show the sealed memo"}
              </button>
            )}
          </div>
          <p className="text-body-small muted">
            The server holds only the sealed text. Lock the inbox or close this tab and the opened words are gone.
          </p>
        </>
      )}
    </section>
  );
}

/** A browser without a desk token (after a 401 or a delete) signs in again with the setup secret (C-5). Not in Figma (D-49). */
export function SignInAgain() {
  const { api, config, setToken } = useDeskSession();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const issued = await api.issueToken(config.inboxId, { setupSecret: secret });
      await setToken(issued.token);
      setSecret("");
    } catch (err) {
      setError(errorText(err).body);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2 className="text-heading-h3">This browser is not signed in to the inbox</h2>
      <p className="text-body-default muted">
        The desk token was revoked or never saved here. Get a new one with the setup secret. Other browsers using this
        inbox are signed out.
      </p>
      <Input
        label="Setup secret"
        mono
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        helper="The secret from your Railway variables."
        error={error}
      />
      <div className="actions">
        <Button variant="primary" type="submit" showIcon={false} disabled={busy || !secret}>
          Sign in
        </Button>
        <TextLink to="/desk/create">Create the inbox</TextLink>
      </div>
    </form>
  );
}
