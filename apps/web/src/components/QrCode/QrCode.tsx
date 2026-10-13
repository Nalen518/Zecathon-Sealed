import qrcode from "qrcode-generator";
import { useMemo } from "react";
import "./QrCode.css";

/**
 * Figma: QR code. A ZIP 321 payment request at error level L, drawn 320 px wide with a white
 * quiet zone even on dark pages (D-12). Rendered as one SVG path: no canvas, no innerHTML.
 */
const QUIET_ZONE = 4; // modules, as the QR spec requires

export function QrCode({ value, label }: { value: string; label: string }) {
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

  return (
    <figure className="qr-code">
      <svg className="qr-code-image" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
        <rect className="qr-code-light" width={size} height={size} />
        <path className="qr-code-dark" d={path} />
      </svg>
      <figcaption className="text-mono-label qr-code-caption">Scan with your Zcash wallet</figcaption>
    </figure>
  );
}
