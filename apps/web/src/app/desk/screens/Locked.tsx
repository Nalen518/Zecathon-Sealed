import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../../components/Button/Button";
import { DeskHeader } from "../../../components/DeskHeader/DeskHeader";
import { Input } from "../../../components/Input/Input";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { Tag } from "../../../components/Tag/Tag";
import { parseBackup, type WrappedDesk } from "../../../lib/keystore";
import { useDeskSession } from "../DeskSession";
import "../../../components/TextLink/TextLink.css";
import "../../screens/AppScreen.css";
import "./Desk.css";

/**
 * Figma: Desk screens / Inbox — Locked. FR-7, T-9.
 * Unlocks the passphrase-wrapped key from IndexedDB, or restores it from the backup file.
 * The restore path (also reached at /desk/restore when this browser has no key) is not drawn in Figma (D-48).
 */
export function Locked({ restore = false }: { restore?: boolean }) {
  const { config, record, unlock, adopt } = useDeskSession();
  const navigate = useNavigate();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<WrappedDesk | null>(null);
  const [backupError, setBackupError] = useState<string | undefined>();
  const file = useRef<HTMLInputElement>(null);
  const restoring = restore || backup !== null;

  async function onFile(f: File | undefined) {
    setBackupError(undefined);
    if (!f) return;
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
    if (restoring && !backup) {
      setBackupError("Choose your backup file first.");
      return;
    }
    setBusy(true);
    const ok = backup ? await adopt(backup, passphrase) : await unlock(passphrase);
    setBusy(false);
    setPassphrase("");
    if (!ok) {
      setError("That passphrase does not open this key. Check it and try again.");
      return;
    }
    if (backup || restore) navigate("/desk", { replace: true });
  }

  return (
    <div className="app-page">
      <DeskHeader network={config.network} />
      <main id="main" className="app-main">
        <div className="container">
          <form className="card desk-unlock-card" onSubmit={onSubmit}>
            <div>
              <Tag tone="neutral">Locked</Tag>
            </div>
            <h1 className="text-heading-h2">{restoring ? "Restore the desk key" : "Unlock the desk key"}</h1>
            <p className="text-body-default muted">
              {restoring
                ? "Choose the backup file you saved when you created the inbox, then type its passphrase. The key stays in this browser."
                : "Your key is stored in this browser, locked with your passphrase. Tips stay sealed until you unlock it."}
            </p>
            {restoring && (
              <div className="desk-file">
                <input
                  ref={file}
                  id="backup-file"
                  type="file"
                  accept="application/json,.json"
                  className="visually-hidden"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
                <Button variant="secondary" showIcon={false} onClick={() => file.current?.click()}>
                  Choose backup file
                </Button>
                <p className="text-mono-label muted" role="status">
                  {backup ? `Fingerprint ${backup.fingerprint.replace(/(.{4})(?=.)/g, "$1 ")}` : "No file chosen"}
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
              helper="Locks again after 15 minutes without activity."
              error={error}
            />
            <div>
              <Button variant="primary" type="submit" showIcon={false} disabled={busy || !passphrase}>
                {restoring ? "Restore" : "Unlock"}
              </Button>
            </div>
            {!restoring && (
              <button type="button" className="text-link text-link-default text-body-default-medium desk-link-button" onClick={() => navigate("/desk/restore")}>
                Restore from a backup file
              </button>
            )}
            {restoring && record === null && (
              <p className="text-body-small muted">No key in this browser yet. Restoring puts the key from the file here.</p>
            )}
          </form>
        </div>
      </main>
      <SlimFooter desk />
    </div>
  );
}
