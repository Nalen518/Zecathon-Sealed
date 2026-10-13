import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { DeskHeader } from "../../../components/DeskHeader/DeskHeader";
import { Input } from "../../../components/Input/Input";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { TextLink } from "../../../components/TextLink/TextLink";
import { ApiError } from "../../../lib/api";
import { formatZec } from "../../../lib/format";
import { ZIP317_MIN_FEE_ZAT } from "../../../lib/memo";
import { useDeskSession } from "../DeskSession";
import { errorText } from "../errors";
import { parseZec } from "../format";
import "../../screens/AppScreen.css";
import "./Desk.css";

/**
 * Figma: Desk screens / Settings — Delete inbox. FR-9, FR-16, FR-17, D-14, D-25.
 * Tip floor (PATCH), network (read-only), rotate token, delete with typed DELETE plus the setup secret.
 */
const CONFIRM_WORD = "DELETE";

type Notice = { tone: "success" | "warning"; title: string; body: string } | null;

export function Settings() {
  const { config, api, unlocked, lock, setToken } = useDeskSession();
  const navigate = useNavigate();
  const token = unlocked?.secrets.token ?? null;
  const [floor, setFloor] = useState(formatZec(config.tipFloorZat));
  const [floorError, setFloorError] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice>(null);
  const [secret, setSecret] = useState("");
  const [secretError, setSecretError] = useState<string | undefined>();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"floor" | "rotate" | "delete" | null>(null);

  async function handle(err: unknown) {
    if (err instanceof ApiError && err.code === "unauthorized") {
      await setToken(null).catch(() => undefined);
      lock();
      return;
    }
    const t = errorText(err);
    if (t.field === "tip_floor_zat") setFloorError(t.body);
    else if (t.field === "setup_secret") setSecretError(t.body);
    else setNotice({ tone: "warning", title: t.title, body: t.body });
  }

  async function onSaveFloor(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const zat = parseZec(floor);
    if (zat === null || zat < ZIP317_MIN_FEE_ZAT || zat > 100_000_000) {
      setFloorError(`Use an amount from ${formatZec(ZIP317_MIN_FEE_ZAT)} to 1 ZEC.`);
      return;
    }
    if (!token) return;
    setFloorError(undefined);
    setBusy("floor");
    try {
      const inbox = await api.setTipFloor(config.inboxId, zat, token);
      setNotice({
        tone: "success",
        title: "Tip floor saved",
        body: `Tips below ${formatZec(inbox.tipFloorZat)} ZEC are now hidden. Set tip_floor_zat to ${inbox.tipFloorZat} in sealed.config.json and redeploy, so sources see the new amount.`,
      });
    } catch (err) {
      await handle(err);
    } finally {
      setBusy(null);
    }
  }

  async function onRotate() {
    if (!token) return;
    setNotice(null);
    setBusy("rotate");
    try {
      const issued = await api.issueToken(config.inboxId, { token });
      await setToken(issued.token);
      setNotice({ tone: "success", title: "Desk token rotated", body: "Every other browser using this inbox is signed out." });
    } catch (err) {
      await handle(err);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(e: FormEvent) {
    e.preventDefault();
    if (!token || confirm !== CONFIRM_WORD) return;
    if (!secret) {
      setSecretError("Paste the setup secret from your Railway variables.");
      return;
    }
    setNotice(null);
    setSecretError(undefined);
    setBusy("delete");
    try {
      await api.deleteInbox(config.inboxId, token, secret);
      // api-contract §6.8: wipe the token, keep the desk key, show Create inbox step 1.
      await setToken(null);
      setSecret("");
      setConfirm("");
      navigate("/desk/create", { replace: true });
    } catch (err) {
      await handle(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app-page">
      <DeskHeader network={config.network} onLock={lock} />
      <main id="main" className="app-main">
        <div className="container settings-column">
          <h1 className="text-heading-h2">Settings</h1>
          {!token && (
            <Callout tone="warning" title="This browser is not signed in to the inbox" role="status">
              Open the Inbox to sign in again with the setup secret.
            </Callout>
          )}
          {notice && (
            <Callout tone={notice.tone} title={notice.title} role={notice.tone === "warning" ? "alert" : "status"}>
              {notice.body}
            </Callout>
          )}

          <form className="card" onSubmit={onSaveFloor} aria-labelledby="inbox-settings-title">
            <h2 id="inbox-settings-title" className="text-heading-h3">
              Inbox
            </h2>
            <Input
              label="Tip floor (ZEC)"
              inputMode="decimal"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              helper="Tips below this amount are hidden as spam. Changing it re-sorts existing tips. None are deleted."
              error={floorError}
            />
            <div>
              <Button variant="secondary" type="submit" showIcon={false} disabled={!token || busy !== null}>
                Save tip floor
              </Button>
            </div>
            <Input
              label="Network"
              mono
              disabled
              value={config.network === "main" ? "Mainnet" : "Testnet"}
              helper="Set when the watcher is deployed. Redeploy to switch to mainnet."
            />
            <div className="desk-inline">
              <Button variant="secondary" showIcon={false} onClick={onRotate} disabled={!token || busy !== null}>
                Rotate desk token
              </Button>
              <span className="text-body-small muted">Signs out every other browser using this inbox.</span>
            </div>
          </form>

          <form className="card settings-danger" onSubmit={onDelete} aria-labelledby="delete-title">
            <h2 id="delete-title" className="text-heading-h3">
              Delete this inbox
            </h2>
            <p className="text-body-default">
              This removes the viewing key and every stored tip from the server. It cannot be undone. Tips stay on the
              Zcash chain as sealed memos, and your backup file can still open them in “Decrypt a memo”.
            </p>
            <div>
              <TextLink to="/desk/audit">Export the audit log first</TextLink>
            </div>
            <Input
              label="Setup secret"
              mono
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              helper="The secret from your Railway variables. Deleting needs it as well as this browser."
              error={secretError}
            />
            <Input
              label={`Type ${CONFIRM_WORD} to confirm`}
              mono
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              helper="The button turns on when the text matches."
            />
            <div className="actions">
              <Button
                variant="danger"
                type="submit"
                showIcon={false}
                disabled={!token || confirm !== CONFIRM_WORD || busy !== null}
              >
                Delete inbox and tips
              </Button>
              <button
                type="button"
                className="text-link text-link-default text-body-default-medium desk-link-button"
                onClick={() => {
                  setSecret("");
                  setConfirm("");
                  setSecretError(undefined);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
      <SlimFooter desk />
    </div>
  );
}
