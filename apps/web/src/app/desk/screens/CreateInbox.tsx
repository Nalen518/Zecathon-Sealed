import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../../components/Button/Button";
import { Callout } from "../../../components/Callout/Callout";
import { Checkbox } from "../../../components/Checkbox/Checkbox";
import { DeskHeader } from "../../../components/DeskHeader/DeskHeader";
import { Fingerprint } from "../../../components/Fingerprint/Fingerprint";
import { Input } from "../../../components/Input/Input";
import { ListItem } from "../../../components/ListItem/ListItem";
import { SlimFooter } from "../../../components/SlimFooter/SlimFooter";
import { StepIndicator } from "../../../components/StepIndicator/StepIndicator";
import { Tag } from "../../../components/Tag/Tag";
import { TextLink } from "../../../components/TextLink/TextLink";
import { ApiError } from "../../../lib/api";
import { toBase64, wipe } from "../../../lib/bytes";
import { ADDRESS_PREFIX } from "../../../lib/config";
import { fingerprintOf, formatFingerprint } from "../../../lib/fingerprint";
import { formatZec } from "../../../lib/format";
import { backupJson, BACKUP_FILENAME, wrapDesk, type WrappedDesk } from "../../../lib/keystore";
import { DEFAULT_TIP_FLOOR_ZAT, ZIP317_MIN_FEE_ZAT } from "../../../lib/memo";
import { sodiumReady } from "../../../lib/sodium";
import { checkViewingKey, UFVK_HINT_PREFIX } from "../../../lib/viewingKey";
import { useDeskSession } from "../DeskSession";
import { errorText } from "../errors";
import { parseZec } from "../format";
import "../../screens/AppScreen.css";
import "./Desk.css";

/** Figma: Desk screens / Create inbox 1, 2, 3. FR-6, FR-7, FR-11, FR-16. */
const DESK_STEPS: [string, string, string] = ["Desk key", "Viewing key", "Publish"];
export const MIN_PASSPHRASE = 20;

export function CreateInbox() {
  const { config, record, unlocked } = useDeskSession();
  // Always step 1 (api-contract §6.8). A desk that already has a key sees "Use your desk key" there (D-50).
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const navigate = useNavigate();

  useEffect(() => {
    if (record && unlocked?.secrets.token && step !== 3) navigate("/desk", { replace: true });
  }, [record, unlocked, step, navigate]);

  return (
    <div className="app-page">
      <DeskHeader network={config.network} />
      <main id="main" className="app-main">
        <div className="container app-stack">
          <StepIndicator steps={DESK_STEPS} current={step} />
          {step === 1 && <DeskKeyStep onDone={() => setStep(2)} />}
          {step === 2 && <ViewingKeyStep onDone={() => setStep(3)} />}
          {step === 3 && <PublishStep />}
        </div>
      </main>
      <SlimFooter desk />
    </div>
  );
}

// ---------- Step 1: desk key ----------

function formatPrivateKey(sk: Uint8Array, sodium: Awaited<ReturnType<typeof sodiumReady>>): string {
  const hex = sodium.to_hex(sk).toUpperCase();
  return `sealed-desk-key-v1 · ${hex.match(/.{8}/g)!.join(" ")}`;
}

function DeskKeyStep({ onDone }: { onDone: () => void }) {
  const { record, unlocked, adopt, unlock } = useDeskSession();
  const [keypair, setKeypair] = useState<{ publicKey: Uint8Array; privateKey: Uint8Array } | null>(null);
  const [display, setDisplay] = useState<{ key: string; fingerprint: string } | null>(null);
  const [pass, setPass] = useState("");
  const [repeat, setRepeat] = useState("");
  const [wrapped, setWrapped] = useState<WrappedDesk | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [existingPass, setExistingPass] = useState("");
  const [existingError, setExistingError] = useState<string | undefined>();

  // The key pair is made once, in this browser (FR-7). It is wiped when the step closes.
  useEffect(() => {
    if (record) return;
    let kp: { publicKey: Uint8Array; privateKey: Uint8Array } | null = null;
    let live = true;
    void (async () => {
      const sodium = await sodiumReady();
      kp = sodium.crypto_box_keypair();
      const fp = await fingerprintOf(kp.publicKey);
      if (!live) return;
      setKeypair(kp);
      setDisplay({ key: formatPrivateKey(kp.privateKey, sodium), fingerprint: formatFingerprint(fp) });
    })();
    return () => {
      live = false;
      wipe(kp?.privateKey);
    };
  }, [record]);

  // A changed passphrase makes the downloaded backup stale.
  useEffect(() => {
    setWrapped(null);
    setSaved(false);
  }, [pass, repeat]);

  const passError = pass && pass.length < MIN_PASSPHRASE ? `Use at least ${MIN_PASSPHRASE} characters.` : undefined;
  const repeatError = repeat && repeat !== pass ? "The two passphrases do not match." : undefined;
  const passOk = pass.length >= MIN_PASSPHRASE && repeat === pass;

  async function onDownload() {
    if (!keypair || !passOk) return;
    setBusy(true);
    const fp = await fingerprintOf(keypair.publicKey);
    const record = await wrapDesk({ ...keypair, token: null }, fp, pass);
    setBusy(false);
    setWrapped(record);
    const url = URL.createObjectURL(new Blob([backupJson(record)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = BACKUP_FILENAME;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onContinue() {
    if (!wrapped || !saved) return;
    setBusy(true);
    const ok = await adopt(wrapped, pass);
    setBusy(false);
    if (ok) {
      setPass("");
      setRepeat("");
      onDone();
    }
  }

  // This browser already has a desk key (for example after deleting an inbox): keep it (D-50).
  if (record) {
    return (
      <div className="desk-columns">
        <form
          className="desk-left"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            setBusy(true);
            const ok = unlocked ? true : await unlock(existingPass);
            setBusy(false);
            setExistingPass("");
            if (ok) onDone();
            else setExistingError("That passphrase does not open this key. Check it and try again.");
          }}
        >
          <div className="app-heading">
            <h1 className="text-heading-h2">Use your desk key</h1>
            <p className="text-body-lead lead">
              This browser already holds a desk key. Keep it, so your backup file still opens every tip sent to it.
            </p>
          </div>
          <Fingerprint label="Desk key fingerprint" value={formatFingerprint(record.fingerprint)} />
          {!unlocked && (
            <Input
              label="Passphrase"
              type="password"
              autoComplete="current-password"
              value={existingPass}
              onChange={(e) => setExistingPass(e.target.value)}
              error={existingError}
            />
          )}
          <div>
            <Button variant="primary" type="submit" disabled={busy || (!unlocked && !existingPass)}>
              Continue
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="desk-columns">
      <div className="desk-left">
        <div className="app-heading">
          <h1 className="text-heading-h2">Create your desk key</h1>
          <p className="text-body-lead lead">
            The key that opens tips is made in this browser and never leaves it. Sealed’s server never sees it.
          </p>
        </div>
        <Input
          label="Passphrase"
          type="password"
          autoComplete="new-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          helper={`At least ${MIN_PASSPHRASE} characters. It locks the key in this browser and in the backup file.`}
          error={passError}
        />
        <Input
          label="Repeat the passphrase"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          helper={passOk ? "Both match." : undefined}
          error={repeatError}
        />
        <section className="ink-panel desk-key-panel" aria-labelledby="private-key-title">
          <p id="private-key-title" className="text-mono-eyebrow eyebrow">
            Private key · shown once
          </p>
          <p className="text-mono-code key">{display ? display.key : "Making the key in this browser."}</p>
          {display && <p className="text-mono-label meta">Fingerprint {display.fingerprint}</p>}
        </section>
        <Callout tone="warning" title="Shown once. Save the backup now.">
          If you lose both the passphrase and the backup file, tips sent to this key can never be opened. Sealed cannot
          recover it.
        </Callout>
        <div className="desk-inline">
          <Button variant="secondary" showIcon={false} onClick={onDownload} disabled={!passOk || !keypair || busy}>
            Download backup file
          </Button>
          <span className="text-mono-label muted">{BACKUP_FILENAME} · passphrase-wrapped</span>
        </div>
        <Checkbox label="I saved the backup file somewhere safe" checked={saved} onChange={setSaved} />
        <div>
          <Button variant="primary" onClick={onContinue} disabled={!wrapped || !saved || busy}>
            Continue
          </Button>
        </div>
        <TextLink to="/desk/restore">Restore from a backup file</TextLink>
      </div>
      <aside className="card desk-side" aria-labelledby="stays-title">
        <h2 id="stays-title" className="text-heading-h3">
          What stays where
        </h2>
        <div className="row">
          <p className="text-mono-eyebrow eyebrow">In this browser</p>
          <p className="text-body-default">Private key, locked with your passphrase (IndexedDB).</p>
        </div>
        <div className="row">
          <p className="text-mono-eyebrow eyebrow">In the backup file</p>
          <p className="text-body-default">The same key, locked with the same passphrase.</p>
        </div>
        <div className="row">
          <p className="text-mono-eyebrow eyebrow">On Sealed’s server</p>
          <p className="text-body-default">Public key and fingerprint only. Never the private key or passphrase.</p>
        </div>
      </aside>
    </div>
  );
}

// ---------- Step 2: viewing key ----------

type FieldErrors = Partial<Record<"address" | "ufvk" | "tip_floor_zat" | "setup_secret", string>>;

function ViewingKeyStep({ onDone }: { onDone: () => void }) {
  const { config, api, unlocked, record, setToken } = useDeskSession();
  const [address, setAddress] = useState("");
  const [ufvk, setUfvk] = useState("");
  const [floor, setFloor] = useState(formatZec(DEFAULT_TIP_FLOOR_ZAT));
  const [secret, setSecret] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pageError, setPageError] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // True once POST /inbox succeeded in this session: a retry after a failed token request only asks for the token.
  const [registered, setRegistered] = useState(false);
  const ufvkPrefix = UFVK_HINT_PREFIX[config.network];
  const noApi = !config.apiBaseUrl;

  function validate(): { floorZat: number } | null {
    const next: FieldErrors = {};
    const a = address.trim();
    if (/^(t1|t3|tm|t2|tex1|textest1)/.test(a)) next.address = "This is a transparent address. Memos only work on shielded addresses.";
    else if (!a.startsWith(ADDRESS_PREFIX[config.network]) || !/^[a-z0-9]+$/.test(a))
      next.address = `Paste a unified address that starts with ${ADDRESS_PREFIX[config.network]}.`;
    const k = checkViewingKey(ufvk, config.network);
    if (k.kind === "spend")
      next.ufvk = `This key can spend funds, so it was not sent. Paste a viewing key (starts with ${ufvkPrefix}) for a receive-only account.`;
    else if (k.kind === "wrong_network") next.ufvk = "This viewing key is for the other Zcash network.";
    else if (k.kind === "not_unified") next.ufvk = `Paste the unified full viewing key, which starts with ${ufvkPrefix}.`;
    else if (k.kind === "invalid") next.ufvk = `Paste a unified full viewing key that starts with ${ufvkPrefix}.`;
    const zat = parseZec(floor);
    if (zat === null || zat < ZIP317_MIN_FEE_ZAT || zat > 100_000_000)
      next.tip_floor_zat = `Use an amount from ${formatZec(ZIP317_MIN_FEE_ZAT)} to 1 ZEC.`;
    if (!secret) next.setup_secret = "Paste the setup secret from your Railway variables.";
    setErrors(next);
    return Object.keys(next).length === 0 && zat !== null ? { floorZat: zat } : null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPageError(null);
    const ok = validate();
    if (!ok || !unlocked || !record) return;
    if (noApi) {
      setPageError(errorText(new ApiError("not_configured", 0)));
      return;
    }
    setBusy(true);
    try {
      if (!registered) {
        await api.createInbox(
          {
            id: config.inboxId,
            name: config.name,
            deskPublicKey: toBase64(unlocked.secrets.publicKey),
            fingerprint: record.fingerprint,
            address: address.trim(),
            ufvk: ufvk.trim(),
            tipFloorZat: ok.floorZat,
          },
          secret,
        );
        setRegistered(true);
      }
      const issued = await api.issueToken(config.inboxId, { setupSecret: secret });
      await setToken(issued.token);
      setSecret("");
      setUfvk("");
      onDone();
    } catch (err) {
      const t = errorText(err);
      if (t.field) setErrors({ [t.field]: t.body });
      else setPageError(t);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="desk-columns">
      <form className="desk-left" onSubmit={onSubmit} noValidate>
        <div className="app-heading">
          <h1 className="text-heading-h2">Connect a receive-only account</h1>
          <p className="text-body-lead lead">
            The watcher needs a viewing key to spot tips on the chain. A viewing key can see payments. It can never
            spend them.
          </p>
        </div>
        {noApi && (
          <Callout tone="warning" title="No watcher is set up yet" role="status">
            Set api_base_url in sealed.config.json and redeploy. Until then, Decrypt a memo works with no server.
          </Callout>
        )}
        <Input
          label="Shielded address for tips"
          mono
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          helper="A unified address with a shielded receiver. Memos do not work on transparent addresses."
          error={errors.address}
        />
        <Input
          label="Unified full viewing key"
          mono
          value={ufvk}
          onChange={(e) => setUfvk(e.target.value)}
          error={errors.ufvk}
        />
        <Input
          label="Tip floor (ZEC)"
          inputMode="decimal"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
          helper="Tips below this amount are hidden as spam. 0.001 is 10 times the minimum network fee."
          error={errors.tip_floor_zat}
        />
        <Input
          label="Setup secret"
          mono
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          helper="Proves you run this watcher. Only its hash is stored."
          error={errors.setup_secret}
        />
        <Callout tone="info" title="Use a dedicated account">
          A viewing key also shows payments going out. Receive tips on an account you use for nothing else, and move
          funds out from a separate wallet.
        </Callout>
        {pageError && (
          <Callout tone="warning" title={pageError.title} role="alert">
            {pageError.body}
          </Callout>
        )}
        <div className="actions">
          <Button variant="primary" type="submit" disabled={busy}>
            Register inbox
          </Button>
          {noApi && <TextLink to="/desk/decrypt">Decrypt a memo</TextLink>}
        </div>
      </form>
      <aside className="card desk-side" aria-labelledby="server-gets-title">
        <h2 id="server-gets-title" className="text-heading-h3">
          What the server gets
        </h2>
        <div className="row">
          <p className="text-mono-eyebrow eyebrow">Viewing key</p>
          <p className="text-body-default">To find tips on the chain. Cannot spend.</p>
        </div>
        <div className="row">
          <p className="text-mono-eyebrow eyebrow">Address and tip floor</p>
          <p className="text-body-default">To show the payment details to sources.</p>
        </div>
        <div className="row">
          <p className="text-mono-eyebrow eyebrow">Never</p>
          <p className="text-body-default">Your desk private key, your passphrase, or any tip in plain text.</p>
        </div>
      </aside>
    </div>
  );
}

// ---------- Step 3: publish ----------

function PublishStep() {
  const { config, record, unlocked } = useDeskSession();
  const tipPage = `${window.location.origin}/`;
  const configValues = useMemo(() => {
    if (!record || !unlocked) return "";
    return JSON.stringify({ desk_public_key: record.public_key, fingerprint: record.fingerprint }, null, 2);
  }, [record, unlocked]);
  if (!record) return null;

  return (
    <div className="desk-columns">
      <div className="desk-left">
        <div>
          <Tag tone="success">Inbox registered</Tag>
        </div>
        <div className="app-heading">
          <h1 className="text-heading-h2">Publish your fingerprint</h1>
          <p className="text-body-lead lead">
            Sources compare this fingerprint before they send. Post it somewhere an attacker could not change at the
            same time as this page.
          </p>
        </div>
        <Fingerprint label="Desk key fingerprint" value={formatFingerprint(record.fingerprint)} />
        <Fingerprint label="Your tip page" value={tipPage} />
        <div className="desk-where">
          <p className="text-body-default-medium">Post the fingerprint in at least two of these places</p>
          <ul>
            <ListItem type="include">Your newsroom’s contact or masthead page</ListItem>
            <ListItem type="include">Your official social account</ListItem>
            <ListItem type="include">The README of your Sealed repository</ListItem>
          </ul>
        </div>
        <section className="card" aria-labelledby="config-values-title">
          <h2 id="config-values-title" className="text-heading-h3">
            Put the key in the tip page
          </h2>
          <p className="text-body-default muted">
            The tip page seals to the key in sealed.config.json, never to one from the server. Add these values and
            the shielded address, then redeploy.
          </p>
          <Fingerprint label="sealed.config.json values" value={configValues} />
        </section>
        <div>
          <Button variant="primary" to="/desk">
            Open the inbox
          </Button>
        </div>
      </div>
      <aside className="card desk-side" aria-labelledby="before-title">
        <h2 id="before-title" className="text-heading-h3">
          Before you announce it
        </h2>
        <div className="row">
          <p className="text-mono-eyebrow eyebrow">Send a test tip</p>
          <p className="text-body-default">
            Use a testnet wallet and {formatZec(config.tipFloorZat)} test ZEC. It should appear in the inbox within a
            few minutes.
          </p>
        </div>
        <div className="row">
          <p className="text-mono-eyebrow eyebrow">Switch to mainnet</p>
          <p className="text-body-default">
            Change one setting and redeploy. The badge in the header shows which network is live.
          </p>
        </div>
      </aside>
    </div>
  );
}
