import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { mountMemoGrid, type MemoGridHandle } from "../../motion/memoGrid";
import "../../motion/motion.css";
import "./MemoGrid.css";

/**
 * Figma: Memo grid, properties State (Empty, Writing, Full, Sealed) and Size (Default, Compact, Band).
 * - mode "loop": the landing hero (H1, D-04), types the sample tip and seals it.
 * - mode "static": the Write screen byte counter (D-10), driven by `bytes` and `sealed`.
 * - size "band": the landing hero only (docs/hero-centered.md). 64 columns × 8 rows with 4 px gaps across the
 *   1040 px content width, label and legend on one caption row above it. Below 860 px it falls back to the
 *   Default shape, 32 columns, because 64 columns would leave cells under 2 px at 360 px (D-98).
 * Never scale it. Use `size` (rules §4.5). Write and Pay keep Default and Compact.
 */
type MemoGridSize = "default" | "compact" | "band";

interface MemoGridProps {
  mode: "loop" | "static";
  size?: MemoGridSize;
  bytes?: number;
  sealed?: boolean;
  /** Fixed accessible description of what the grid shows. */
  label: string;
  /** Receives the canvas handle, for screens that drive the grid directly (the Write seal sweep). */
  handleRef?: MutableRefObject<MemoGridHandle | null>;
}

const NARROW = "(max-width: 859px)";

/** True below 860 px. Only the band reads it, to fall back to 32 columns. */
function useNarrow(enabled: boolean): boolean {
  const [narrow, setNarrow] = useState(() => enabled && typeof window !== "undefined" && window.matchMedia(NARROW).matches);
  useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia(NARROW);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [enabled]);
  return narrow;
}

export function MemoGrid({ mode, size = "default", bytes = 0, sealed = false, label, handleRef }: MemoGridProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const handle = useRef<MemoGridHandle | null>(null);
  const narrow = useNarrow(size === "band");
  /** The shape actually drawn: the band becomes Default below 860 px. */
  const shape: MemoGridSize = size === "band" && narrow ? "default" : size;

  useEffect(() => {
    if (!canvas.current) return;
    handle.current = mountMemoGrid(canvas.current, {
      mode,
      labelEl: caption.current,
      initialBytes: bytes,
      initialSealed: sealed,
      // Band: 64 columns, 4 px gaps (Figma Size=Band). Compact: 9 px cells and 2 px gaps fit 32 columns in 350 px.
      columns: shape === "band" ? 64 : 32,
      gap: shape === "band" ? 4 : shape === "compact" ? 2 : 3,
    });
    if (handleRef) handleRef.current = handle.current;
    return () => {
      handle.current?.destroy();
      handle.current = null;
      if (handleRef) handleRef.current = null;
    };
    // Mount once per mode and shape. Byte and seal changes go through the handle below.
  }, [mode, shape]);

  useEffect(() => {
    handle.current?.setBytes(bytes);
  }, [bytes]);

  useEffect(() => {
    handle.current?.setSealed(sealed);
  }, [sealed]);

  const labelEl = <div ref={caption} className="memo-grid-label" aria-hidden="true" />;
  const legend = (
    <ul className="memo-grid-legend" aria-hidden="true">
      <li className="words">Your words</li>
      <li className="sealed">Sealed memo</li>
      <li className="unused">Unused</li>
    </ul>
  );
  const grid = <canvas ref={canvas} className="memo-grid" role="img" aria-label={label} />;

  return (
    <div className={`memo-grid-block memo-grid-${shape}`}>
      {shape === "band" ? (
        <>
          <div className="memo-grid-caption">
            {labelEl}
            {legend}
          </div>
          {grid}
        </>
      ) : (
        <>
          {labelEl}
          {grid}
          {legend}
        </>
      )}
    </div>
  );
}
