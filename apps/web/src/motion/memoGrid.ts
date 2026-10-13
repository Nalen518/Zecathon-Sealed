/**
 * Sealed — hero animation H1: "the memo fills, then seals".
 *
 * 512 cells = the 512-byte Zcash memo (ZIP 302), laid out 32 × 16.
 * Numbers come from the SRD, section 3 (measured in spike 1, Oct 11 2026):
 *   plaintext block = 2-byte length + up to 331 message bytes (333 bytes)
 *   sealed box      = 333 + 48 bytes overhead = 381 bytes
 *   memo text       = "z1:" + base64(381 bytes) = 3 + 508 = 511 of 512 bytes
 *
 * Two modes:
 *   - "loop"   (hero): types a sample tip, sweeps it into the sealed memo, holds, repeats.
 *   - "static" (Write screen byte counter): you call setBytes(n) / setSealed(bool).
 *
 * No dependencies, no network, no inline <style>: safe under a strict CSP
 * (script-src 'self'; style-src 'self'). Sizing uses the CSSOM (el.style.height),
 * which CSP allows. Respects prefers-reduced-motion, pauses when off-screen or
 * when the tab is hidden.
 *
 * Colors come from CSS custom properties on the canvas (see motion.css):
 *   --memo-words  --memo-length  --memo-seal  --memo-unused
 */

import {
  LENGTH_PREFIX_BYTES,
  MAX_MESSAGE_BYTES,
  MEMO_BYTES,
  SEALED_MEMO_BYTES,
  TEXT_PREFIX,
  utf8Length,
} from "../lib/memo";

/**
 * The hero's illustrative tip (D-30): typed by the landing loop only, never sent anywhere.
 * The grid's accessible label calls it a sample tip.
 */
export const SAMPLE_TIP =
  "The tender for the river bridge was decided before bids closed. " +
  "Ask the clerk at the planning office about the March 4 minutes.";

export interface MemoGridOptions {
  /** "loop" for the hero, "static" for the byte counter. Default "loop". */
  mode?: "loop" | "static";
  /** Sample tip typed in loop mode. Default SAMPLE_TIP. */
  message?: string;
  /** Length of one loop in ms. Default 10000. */
  loopMs?: number;
  /** Cells per row. Default 32 (so 16 rows). */
  columns?: number;
  /** Gap between cells in CSS px. Default 3. */
  gap?: number;
  /** Cell corner radius in CSS px. Default 2. */
  radius?: number;
  /** Optional element whose text is kept in sync, e.g. "Message · 127 / 331 bytes". */
  labelEl?: HTMLElement | null;
  /** Static mode: starting byte count. */
  initialBytes?: number;
  /** Static mode: start sealed. */
  initialSealed?: boolean;
}

export interface MemoGridHandle {
  /** Static mode: number of message bytes used (clamped to 0..331). */
  setBytes(bytes: number): void;
  /** Static mode: show the sealed memo. */
  setSealed(sealed: boolean): void;
  /** Static mode: draw the diagonal seal sweep at progress 0..1 (Write screen, D-67). */
  setSealProgress(progress: number): void;
  /** Re-read CSS colors, e.g. after a theme change. */
  refreshColors(): void;
  /** Stop animation and remove every listener. */
  destroy(): void;
}

interface Palette {
  words: string;
  length: string;
  seal: string;
  unused: string;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Deterministic 0..1 noise so the sealed texture is stable between frames. */
const noise = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  // Colors come only from the design tokens mapped in motion.css (rules §4.1).
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    words: v("--memo-words"),
    length: v("--memo-length"),
    seal: v("--memo-seal"),
    unused: v("--memo-unused"),
  };
}

export function mountMemoGrid(canvas: HTMLCanvasElement, opts: MemoGridOptions = {}): MemoGridHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sealed memo grid: 2D canvas is not available");

  const mode = opts.mode ?? "loop";
  const cols = opts.columns ?? 32;
  const rows = Math.ceil(MEMO_BYTES / cols);
  const gap = opts.gap ?? 3;
  const radius = opts.radius ?? 2;
  const loopMs = opts.loopMs ?? 10000;
  const messageBytes = Math.min(utf8Length(opts.message ?? SAMPLE_TIP), MAX_MESSAGE_BYTES);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

  let palette = readPalette(canvas);
  let cssW = 0;
  let cssH = 0;
  let cell = 0;
  let staticBytes = clampBytes(opts.initialBytes ?? 0);
  let staticSealed = opts.initialSealed ?? false;
  let staticSeal = staticSealed ? 1 : 0;
  let raf = 0;
  let t0 = 0;
  let onScreen = true;
  let lastLabel = "";

  function clampBytes(n: number) {
    return Math.max(0, Math.min(MAX_MESSAGE_BYTES, Math.floor(n)));
  }

  function layout() {
    cssW = canvas.getBoundingClientRect().width || canvas.width;
    cell = Math.max(2, (cssW - gap * (cols - 1)) / cols);
    cssH = rows * cell + (rows - 1) * gap;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = `${cssH}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setLabel(text: string) {
    if (opts.labelEl && text !== lastLabel) {
      opts.labelEl.textContent = text;
      lastLabel = text;
    }
  }

  function cellRect(x: number, y: number) {
    if (typeof ctx!.roundRect === "function") {
      ctx!.beginPath();
      ctx!.roundRect(x, y, cell, cell, radius);
      ctx!.fill();
    } else {
      ctx!.fillRect(x, y, cell, cell);
    }
  }

  /**
   * typed: message bytes shown in "words" color
   * seal:  0..1 progress of the diagonal sweep into the sealed memo
   * alpha: global fade (end of loop)
   * grain: changes the sealed texture; quantised so it shimmers slowly, not every frame
   */
  function paint(typed: number, seal: number, alpha: number, grain: number) {
    ctx!.clearRect(0, 0, cssW, cssH);
    for (let i = 0; i < MEMO_BYTES; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      let color = palette.unused;
      let a = 1;

      if (typed > 0 && i < LENGTH_PREFIX_BYTES) color = palette.length;
      else if (i >= LENGTH_PREFIX_BYTES && i - LENGTH_PREFIX_BYTES < typed) color = palette.words;

      if (seal > 0 && i < SEALED_MEMO_BYTES) {
        const order = (c + r * 2) / (cols + rows * 2); // top-left to bottom-right
        if (order <= seal) {
          color = palette.seal;
          a = i < TEXT_PREFIX.length ? 1 : 0.35 + 0.55 * noise(i, grain);
        }
      }

      ctx!.globalAlpha = a * alpha;
      ctx!.fillStyle = color;
      cellRect(c * (cell + gap), r * (cell + gap));
    }
    ctx!.globalAlpha = 1;

    // Uppercase is written here, not with CSS text-transform, so the "z1:" prefix keeps its real case.
    if (seal >= 1) setLabel(`SEALED · ${SEALED_MEMO_BYTES} / ${MEMO_BYTES} BYTES · ${TEXT_PREFIX}`);
    else if (seal > 0) setLabel("SEALING IN YOUR BROWSER");
    else setLabel(`MESSAGE · ${typed} / ${MAX_MESSAGE_BYTES} BYTES`);
  }

  /** The frame shown for reduced motion and as the first paint: the sealed memo. */
  function paintStill() {
    paint(messageBytes, 1, 1, 0);
  }

  function frame(now: number) {
    if (!t0) t0 = now;
    const elapsed = now - t0;
    const p = (elapsed % loopMs) / loopMs;
    const typed = Math.floor(clamp01(p / 0.45) * messageBytes); // 0–45%: typing
    const seal = clamp01((p - 0.45) / 0.17); //                    45–62%: sealing sweep
    const alpha = p > 0.92 ? 1 - (p - 0.92) / 0.08 : 1; //        92–100%: fade, then repeat
    paint(seal > 0 ? messageBytes : typed, seal, alpha, Math.floor(elapsed / 320));
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function render() {
    stop();
    if (mode === "static") {
      paint(staticBytes, staticSeal, 1, 0);
      return;
    }
    if (reduceMotion.matches || !onScreen || document.hidden) {
      paintStill();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  // listeners
  const ro = new ResizeObserver(() => {
    layout();
    render();
  });
  ro.observe(canvas);

  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    render();
  });
  io.observe(canvas);

  const onVisibility = () => render();
  const onMotion = () => render();
  const onScheme = () => {
    palette = readPalette(canvas);
    render();
  };
  document.addEventListener("visibilitychange", onVisibility);
  reduceMotion.addEventListener("change", onMotion);
  darkScheme.addEventListener("change", onScheme);

  layout();
  paintStill();
  render();

  return {
    setBytes(bytes: number) {
      staticBytes = clampBytes(bytes);
      if (mode === "static") render();
    },
    setSealProgress(progress: number) {
      staticSeal = clamp01(progress);
      staticSealed = staticSeal >= 1;
      if (mode === "static") render();
    },
    setSealed(sealed: boolean) {
      staticSealed = sealed;
      staticSeal = sealed ? 1 : 0;
      if (mode === "static") render();
    },
    refreshColors() {
      palette = readPalette(canvas);
      render();
    },
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMotion.removeEventListener("change", onMotion);
      darkScheme.removeEventListener("change", onScheme);
    },
  };
}
