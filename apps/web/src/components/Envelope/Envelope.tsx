import { formatZec } from "../../lib/format";
import { SEALED_MEMO_BYTES } from "../../lib/memo";
import "./Envelope.css";

/**
 * Figma: Envelope, properties Context (Sender, Desk) and State (Sealed, Open). D-69 to D-78.
 * Drawn in code (SVG and CSS, no images). Every value is real data (D-71):
 * - Sender, Sealed: what the chain sees. Sender, recipient and amount hidden, memo 511 bytes.
 * - Desk, Sealed: the tip's real block height and block time on the postmark, its real amount.
 * - Desk, Open: the tip decrypted in this browser and its real UTF-8 byte count.
 * Sealed variants are one SVG (role="img" with a label) that scales down below 432 px (D-75).
 * The Open variant keeps the tip as real, readable, selectable text (D-77).
 */
export type EnvelopeProps =
  | { context: "sender"; state: "sealed" }
  | { context: "desk"; state: "sealed"; amountZat: number; height: number | null; blockTime: string | null }
  | { context: "desk"; state: "open"; tip: string; bytes: number };

/** Local 24-hour time for the postmark, as on the Figma frame ("09:41"). */
const postmarkTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const height = new Intl.NumberFormat("en-US");

export function Envelope(props: EnvelopeProps) {
  if (props.state === "open") return <OpenEnvelope tip={props.tip} bytes={props.bytes} />;
  return <SealedEnvelope {...props} />;
}

/** Text alternative for a sealed envelope. The same facts are also shown as real text near it. */
export function sealedEnvelopeLabel(props: Exclude<EnvelopeProps, { state: "open" }>): string {
  if (props.context === "sender") {
    return `Sealed envelope. What the chain sees: sender hidden, recipient hidden, amount hidden, memo ${SEALED_MEMO_BYTES} bytes.`;
  }
  const where =
    props.height !== null && props.blockTime
      ? ` Postmark: block ${height.format(props.height)}, ${postmarkTime.format(new Date(props.blockTime))}.`
      : "";
  return `Sealed tip for this desk.${where} Amount ${formatZec(props.amountZat)} ZEC. Sender hidden. Memo ${SEALED_MEMO_BYTES} bytes.`;
}

/* Field rows at the foot of the envelope, from the Figma frame (x 24 and 212, y 186 and 214). */
function Field({ x, y, name, value, hidden }: { x: number; y: number; name: string; value: string; hidden?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <text className="env-field-name" x={0} y={15}>
        {name}
      </text>
      {hidden && <rect className="env-redaction" x={56} y={5} width={32} height={10} rx={4} />}
      <text className={hidden ? "env-field-value env-field-value-hidden" : "env-field-value"} x={hidden ? 96 : 56} y={15}>
        {value}
      </text>
    </g>
  );
}

function Seal() {
  return (
    <g className="env-seal" transform="translate(166 102)">
      <circle className="env-wax" cx={34} cy={34} r={34} />
      <circle className="env-ring" cx={34} cy={34} r={26.25} />
      <text className="env-seal-label" x={34} y={39} textAnchor="middle">
        z1:
      </text>
    </g>
  );
}

function SealedEnvelope(props: Exclude<EnvelopeProps, { state: "open" }>) {
  const desk = props.context === "desk";
  return (
    <div className="envelope envelope-sealed">
      <svg className="env-svg" viewBox="0 0 400 250" role="img" aria-label={sealedEnvelopeLabel(props)}>
        <rect className="env-body" x={0.5} y={0.5} width={399} height={249} rx={12} />
        <path className="env-flap" d="M 0 12 C 0 4 4 0 12 0 L 388 0 C 396 0 400 4 400 12 L 200 136 L 0 12 Z" />
        {desk && props.height !== null && props.blockTime && (
          <g className="env-postmark" transform="rotate(8 334 86)">
            <circle className="env-postmark-ring" cx={334} cy={86} r={45.25} />
            <text className="env-postmark-label" x={334} y={74} textAnchor="middle">
              BLOCK
            </text>
            <text className="env-postmark-value" x={334} y={90} textAnchor="middle">
              {height.format(props.height)}
            </text>
            <text className="env-postmark-label" x={334} y={106} textAnchor="middle">
              {postmarkTime.format(new Date(props.blockTime))}
            </text>
          </g>
        )}
        <Seal />
        <Field x={24} y={186} name="FROM" value="HIDDEN" hidden />
        {desk ? (
          <>
            <Field x={24} y={214} name="AMOUNT" value={`${formatZec(props.amountZat)} ZEC`} />
            <Field x={212} y={186} name="TO" value="THIS DESK" />
          </>
        ) : (
          <>
            <Field x={24} y={214} name="AMOUNT" value="HIDDEN" hidden />
            <Field x={212} y={186} name="TO" value="HIDDEN" hidden />
          </>
        )}
        <Field x={212} y={214} name="MEMO" value={`${SEALED_MEMO_BYTES} BYTES`} />
      </svg>
    </div>
  );
}

/**
 * Open: back, open flap and pocket are drawn. The letter is ordinary HTML and grows with the tip,
 * so no word ever hides behind the pocket. Field values are real text (D-77).
 */
function OpenEnvelope({ tip, bytes }: { tip: string; bytes: number }) {
  return (
    <div className="envelope envelope-open">
      <div className="env-drawing" role="img" aria-label="Opened envelope. The tip below was opened in this browser.">
        <div className="env-back" />
        <svg className="env-open-flap" viewBox="0 0 400 130" preserveAspectRatio="none" aria-hidden="true">
          <path
            className="env-flap"
            vectorEffect="non-scaling-stroke"
            d="M 0 130 C 0 122 4 118 12 118 L 388 118 C 396 118 400 122 400 130 L 200 0 L 0 130 Z"
          />
        </svg>
        <svg className="env-broken-seal" viewBox="0 0 30 30" aria-hidden="true">
          <circle cx={15} cy={15} r={14} />
        </svg>
      </div>
      <div className="env-letter-clip">
        <article className="env-letter" aria-label="Tip opened in this browser" tabIndex={-1}>
          <p className="text-mono-badge env-letter-label">Opened in this browser</p>
          {/* Plain text only, never HTML (rules §1.6). */}
          <p className="text-body-default env-letter-text">{tip}</p>
        </article>
      </div>
      <svg className="env-pocket" viewBox="0 0 400 154" preserveAspectRatio="none" aria-hidden="true">
        <path
          vectorEffect="non-scaling-stroke"
          d="M 0 0 L 200 72 L 400 0 L 400 142 C 400 150 396 154 388 154 L 12 154 C 4 154 0 150 0 142 L 0 0 Z"
        />
      </svg>
      <dl className="env-open-fields">
        <div>
          <dt className="text-mono-badge">From</dt>
          <dd className="text-mono-label">
            <span className="env-redaction-chip" aria-hidden="true" />
            <span className="env-hidden-value">HIDDEN</span>
          </dd>
        </div>
        <div>
          <dt className="text-mono-badge">Memo</dt>
          <dd className="text-mono-label">{bytes} BYTES</dd>
        </div>
      </dl>
    </div>
  );
}
