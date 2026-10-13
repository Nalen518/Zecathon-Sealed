import { useEffect, useRef, type MutableRefObject } from "react";
import { mountMemoGrid, type MemoGridHandle } from "../../motion/memoGrid";
import "../../motion/motion.css";
import "./MemoGrid.css";

/**
 * Figma: Memo grid, properties State (Empty, Writing, Full, Sealed) and Size (Default, Compact).
 * - mode "loop": the landing hero (H1, D-04), types the sample tip and seals it.
 * - mode "static": the Write screen byte counter (D-10), driven by `bytes` and `sealed`.
 * Never scale it. Use `size` (rules §4.5).
 */
interface MemoGridProps {
  mode: "loop" | "static";
  size?: "default" | "compact";
  bytes?: number;
  sealed?: boolean;
  /** Fixed accessible description of what the grid shows. */
  label: string;
  /** Receives the canvas handle, for screens that drive the grid directly (the Write seal sweep). */
  handleRef?: MutableRefObject<MemoGridHandle | null>;
}

export function MemoGrid({ mode, size = "default", bytes = 0, sealed = false, label, handleRef }: MemoGridProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const handle = useRef<MemoGridHandle | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    handle.current = mountMemoGrid(canvas.current, {
      mode,
      labelEl: caption.current,
      initialBytes: bytes,
      initialSealed: sealed,
      // Compact: 9 px cells and 2 px gaps fit 32 columns in 350 px (Figma Size=Compact).
      gap: size === "compact" ? 2 : 3,
    });
    if (handleRef) handleRef.current = handle.current;
    return () => {
      handle.current?.destroy();
      handle.current = null;
      if (handleRef) handleRef.current = null;
    };
    // Mount once per mode. Byte and seal changes go through the handle below.
  }, [mode]);

  useEffect(() => {
    handle.current?.setBytes(bytes);
  }, [bytes]);

  useEffect(() => {
    handle.current?.setSealed(sealed);
  }, [sealed]);

  return (
    <div className={`memo-grid-block memo-grid-${size}`}>
      <div ref={caption} className="memo-grid-label" aria-hidden="true" />
      <canvas ref={canvas} className="memo-grid" role="img" aria-label={label} />
      <ul className="memo-grid-legend" aria-hidden="true">
        <li className="words">Your words</li>
        <li className="sealed">Sealed memo</li>
        <li className="unused">Unused</li>
      </ul>
    </div>
  );
}
