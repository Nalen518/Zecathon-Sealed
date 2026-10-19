import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { DeskHeader } from "../../../components/DeskHeader/DeskHeader";
import { Input } from "../../../components/Input/Input";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { Tag } from "../../../components/Tag/Tag";
import { TextLink } from "../../../components/TextLink/TextLink";
import { parseBackup, type WrappedDesk } from "../../../lib/keystore";
import { useDeskSession } from "../DeskSession";
import "../../../components/TextLink/TextLink.css";
import "../../screens/AppScreen.css";
import "./Desk.css";

/**
 * Figma: Desk screens / Inbox — Locked, and Desk — Restore (70:7262) at /desk/restore. FR-7, T-9.
 * Locked unlocks the passphrase-wrapped key stored in this browser. Restore reads a backup file here
 * (never uploaded) and puts its key in this browser. A browser with no key always lands on Restore (D-90).
 */
export function Locked({ restore = false }: { restore?: boolean }) {
  const { config, record, unlock, adopt } = useDeskSession();
  const navigate = useNavigate();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<WrappedDesk | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | undefined>();
  const file = useRef<HTMLInputElement>(null);
  /** Figma draws Restore for a browser with no key. With a key, the same screen keeps the D-48 wording. */
  const noKey = record === null;

  async function onFile(f: File | undefined) {
    setBackupError(undefined);
    if (!f) return;
    setFileName(f.name);
    const parsed = parseBackup(await f.text());
    if (!parsed) {
      setBackup(null);
      setBackupError("This file is not a Sealed desk backup.");
      return;
    }
    setBackup(parsed);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (restore && !backup) {
      setBackupError("Choose your backup file first.");
      return;
    }
    setBusy(true);
    const ok = restore && backup ? await adopt(backup, passphrase) : await unlock(passphrase);
    setBusy(false);
    setPassphrase("");
    if (!ok) {
      setError("That passphrase does not open this key. Check it and try again.");
      return;
    }
    if (restore) navigate("/desk", { replace: true });
  }

  return (
    <div className="app-page">
      <DeskHeader network={config.network} />
      <main id="main" className="app-main">
        <div className="container">
          <form className="card desk-unlock-card" onSubmit={onSubmit}>
            <div>
              <Tag tone="neutral">{restore ? "Restore" : "Locked"}</Tag>
            </div>
            <h1 className="text-heading-h2">
              {!restore ? "Unlock the desk key" : noKey ? "Open the desk in this browser" : "Restore the desk key"}
            </h1>
            <p className="text-body-default muted">
              {!restore
                ? "Your key is stored in this browser, locked with your passphrase. Tips stay sealed until you unlock it."
                : noKey
                  ? "This browser has no desk key yet. Choose the backup file you saved when you created the inbox, then type its passphrase."
                  : "Choose the backup file you saved when you created the inbox, then type its passphrase. The key stays in this browser."}
            </p>
            {restore && (
              <div className="desk-file" role="group" aria-labelledby="backup-file-label" aria-describedby="backup-file-helper">
                <p id="backup-file-label" className="text-body-default-medium">
                  Backup file
                </p>
                {/* The real file input stays out of the tab order. The button opens it (Figma DC-01). */}
                <input
                  ref={file}
                  id="backup-file"
                  type="file"
                  accept="application/json,.json"
                  className="visually-hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
                <div className="desk-file-picker">
                  <Button variant="secondary" showIcon={false} onClick={() => file.current?.click()}>
                    Choose backup file
                  </Button>
                  <p className="text-mono-code desk-file-name" role="status">
                    {fileName ?? "No file chosen"}
                  </p>
                </div>
                <p id="backup-file-helper" className="text-body-small muted">
                  Opened in this browser only. Never uploaded.
                </p>
                {backupError && (
                  <p className="text-body-small desk-error" role="alert">
                    {backupError}
                  </p>
                )}
              </div>
            )}
            <Input
              label="Passphrase"
              type="password"
              autoComplete="current-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              helper={
                restore
                  ? "The passphrase that locks this backup. Locks again after 15 minutes without activity."
                  : "Locks again after 15 minutes without activity."
              }
              error={error}
            />
            <div>
              <Button variant="primary" type="submit" showIcon={false} disabled={busy || !passphrase}>
                {restore ? "Restore and unlock" : "Unlock"}
              </Button>
            </div>
            {restore ? (
              <div>
                <TextLink to="/desk/create">Create a new inbox instead</TextLink>
              </div>
            ) : (
              <button
                type="button"
                className="text-link text-link-default text-body-default-medium desk-link-button"
                onClick={() => navigate("/desk/restore")}
              >
                Restore from a backup file
              </button>
            )}
            {restore && <JudgeCallout demoDesk={config.demoDesk} />}
          </form>
        </div>
      </main>
      <SlimFooter desk />
    </div>
  );
}

/** Figma: the Info callout on Desk — Restore. Testnet judging deploy only (D-88). */
export function JudgeCallout({ demoDesk }: { demoDesk: boolean }) {
  if (!demoDesk) return null;
  return (
    <Callout tone="info" title="Judging Sealed?">
      The judge kit in the submission notes has the backup file and passphrase for the demo desk. It works on testnet
      only.
    </Callout>
  );
}
