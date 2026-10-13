import { useState, type FormEvent } from "react";
import { Button } from "../../../components/Button/Button";
import { DeskHeader } from "../../../components/DeskHeader/DeskHeader";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { StatusBadge } from "../../../components/StatusBadge/StatusBadge";
import { Textarea } from "../../../components/Textarea/Textarea";
import { formatFingerprint } from "../../../lib/fingerprint";
import { MEMO_BYTES, utf8Length } from "../../../lib/memo";
import { openMemo } from "../../../lib/seal";
import { useDeskSession } from "../DeskSession";
import "../../screens/AppScreen.css";
import "./Desk.css";

/**
 * Figma: Desk screens / Decrypt — Opened, Unreadable. FR-8, FR-19.
 * Works with no server at all: paste a memo, open it with the key in this browser. Nothing is sent.
 */
type Result = { kind: "opened"; text: string; bytes: number } | { kind: "unreadable" };

export function Decrypt() {
  const { config, unlocked, record, lock } = useDeskSession();
  const [memo, setMemo] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!unlocked) return;
    setBusy(true);
    const r = await openMemo(memo, unlocked.secrets);
    setBusy(false);
    setResult(r.ok ? { kind: "opened", text: r.text, bytes: utf8Length(r.text) } : { kind: "unreadable" });
  }

  const unreadable = result?.kind === "unreadable";

  return (
    <div className="app-page">
      <DeskHeader network={config.network} onLock={lock} />
      <main id="main" className="app-main">
        <div className="container">
          <div className="decrypt-columns">
            <form className="desk-left" onSubmit={onSubmit}>
              <div className="app-heading">
                <p className="text-mono-eyebrow eyebrow">Works without a server</p>
                <h1 className="text-heading-h2">Decrypt a memo</h1>
                <p className="text-body-lead lead">
                  Paste a memo from your wallet’s history. The desk key in this browser opens it. Nothing is sent
                  anywhere.
                </p>
              </div>
              <Textarea
                label="Memo from your wallet"
                mono
                spellCheck={false}
                value={memo}
                onChange={(v) => {
                  setMemo(v);
                  setResult(null);
                }}
                helper="Paste the whole memo, starting with z1:"
                error={unreadable ? "This memo is not a Sealed tip, so it was not opened or shown as a tip." : undefined}
                counter={`${utf8Length(memo.trim())} / ${MEMO_BYTES} bytes`}
              />
              <div className="actions">
                <Button variant="primary" type="submit" showIcon={false} disabled={busy || !memo.trim()}>
                  Decrypt
                </Button>
                <button
                  type="button"
                  className="text-link text-link-default text-body-default-medium desk-link-button"
                  onClick={() => {
                    setMemo("");
                    setResult(null);
                  }}
                >
                  Clear
                </button>
              </div>
            </form>

            {result && (
              <section className="card" aria-live="polite" aria-label="Result">
                {result.kind === "opened" ? (
                  <>
                    <p className="text-mono-eyebrow muted">Opened in this browser</p>
                    {/* Plain text only, never HTML (rules §1.6). */}
                    <p className="text-body-lead tip-text">{result.text}</p>
                    <p className="text-mono-label muted">
                      {result.bytes} bytes · sealed to fingerprint {record ? formatFingerprint(record.fingerprint) : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <div>
                      <StatusBadge status="unreadable" />
                    </div>
                    <h2 className="text-heading-h3">Not a Sealed tip</h2>
                    <p className="text-body-default muted">
                      The memo does not start with z1:, or it was sealed to a different desk key. Sealed never renders
                      memos it cannot open, so links or scripts inside them stay inert.
                    </p>
                    <p className="text-body-small muted">
                      If you expected a tip here, check that the source used your current fingerprint.
                    </p>
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </main>
      <SlimFooter desk />
    </div>
  );
}
