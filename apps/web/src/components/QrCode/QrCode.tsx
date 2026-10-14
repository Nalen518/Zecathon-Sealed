import qrcode from "qrcode-generator";
import { useMemo, useRef } from "react";
import { Button } from "../Button/Button";
import "../TextLink/TextLink.css";
import "./QrCode.css";

/**
 * Figma: QR code. A ZIP 321 payment request at error level L, drawn 320 px wide with a white
 * quiet zone even on dark pages (D-12). Rendered as one SVG path: no canvas, no innerHTML.
 * A memo is always 511 bytes, so the code is dense (about 101 modules). "Show a larger code" opens the
 * same code up to 560 px in a dialog, which is easier to scan off a laptop screen (D-95).
 */
const QUIET_ZONE = 4; // modules, as the QR spec requires

export function QrCode({ value, label }: { value: string; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "L");
    qr.addData(value, "Byte");
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) d += `M${c + QUIET_ZONE} ${r + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { size: count + QUIET_ZONE * 2, path: d };
  }, [value]);

  const image = (className: string, imageLabel: string) => (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={imageLabel} shapeRendering="crispEdges">
      <rect className="qr-code-light" width={size} height={size} />
      <path className="qr-code-dark" d={path} />
    </svg>
  );

  return (
    <figure className="qr-code">
      {image("qr-code-image", label)}
      <figcaption className="text-mono-label qr-code-caption">Scan with your Zcash wallet</figcaption>
      <button
        type="button"
        className="text-link text-link-default text-body-small-medium qr-code-zoom"
        onClick={() => dialog.current?.showModal()}
      >
        Show a larger code
      </button>
      <dialog ref={dialog} className="qr-code-dialog" aria-labelledby="qr-code-dialog-title">
        <h2 id="qr-code-dialog-title" className="text-heading-h3">
          Scan with your Zcash wallet
        </h2>
        {image("qr-code-large", `${label}, larger`)}
        <div>
          <Button variant="secondary" showIcon={false} onClick={() => dialog.current?.close()}>
            Close
          </Button>
        </div>
      </dialog>
    </figure>
  );
}
