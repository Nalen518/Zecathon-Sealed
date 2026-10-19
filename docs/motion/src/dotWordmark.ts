/**
 * Sealed — footer F3: dot-matrix wordmark.
 *
 * Renders a word (default "Sealed") in Albert Sans 500 to an offscreen canvas,
 * samples it on a square grid, and draws every grid point as a dot:
 *   - dots inside the letters are bright; a soft light sweeps left to right
 *   - dots outside the letters are a faint background grid
 *   - dots within `pointerRadius` of the mouse turn seal gold
 *
 * Decorative only: give the canvas aria-hidden="true"; the footer text carries meaning.
 * No dependencies, no network (the font must be self-hosted and loaded via @font-face),
 * safe under a strict CSP. Respects prefers-reduced-motion (no sweep; the pointer
 * highlight still follows the mouse because the user starts it), pauses off-screen.
 *
 * Colors come from CSS custom properties on the canvas (see motion.css):
 *   --dot-on  --dot-off  --dot-hot
 */

export interface DotWordmarkOptions {
  /** Word to draw. Default "Sealed". */
  text?: string;
  /** Grid pitch in CSS px. Default 10 (matches the Figma frame: 104 × 26 at 1040 px). */
  step?: number;
  /** CSS font-family. Default '"Albert Sans"'. */
  fontFamily?: string;
  /** Font weight. Default 500. */
  fontWeight?: number | string;
  /** One sweep across the word, in ms. Default 4200. */
  sweepMs?: number;
  /** Pointer highlight radius in CSS px. Default 70. */
  pointerRadius?: number;
  /** Element that receives pointer events. Default: the canvas. Use the whole <footer> for a bigger hover area. */
  hoverTarget?: HTMLElement;
}

export interface DotWordmarkHandle {
  refreshColors(): void;
  destroy(): void;
}

interface Dot {
  x: number;
  y: number;
  on: boolean;
}

interface Palette {
  on: string;
  off: string;
  hot: string;
}

function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    on: v("--dot-on", "#ffffff"),
    off: v("--dot-off", "#ffffff"),
    hot: v("--dot-hot", "#f4b728"),
  };
}

export function mountDotWordmark(canvas: HTMLCanvasElement, opts: DotWordmarkOptions = {}): DotWordmarkHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sealed dot wordmark: 2D canvas is not available");

  const text = opts.text ?? "Sealed";
  const step = opts.step ?? 10;
  const family = opts.fontFamily ?? '"Albert Sans"';
  const weight = opts.fontWeight ?? 500;
  const sweepMs = opts.sweepMs ?? 4200;
  const pointerRadius = opts.pointerRadius ?? 70;
  const hoverTarget = opts.hoverTarget ?? canvas;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");

  let palette = readPalette(canvas);
  let dots: Dot[] = [];
  let cssW = 0;
  let cssH = 0;
  let raf = 0;
  let t0 = 0;
  let onScreen = true;
  let px = -9999;
  let py = -9999;
  let buildToken = 0;

  async function build() {
    const token = ++buildToken;
    const probe = `${weight} 100px ${family}`;
    try {
      await document.fonts.load(probe, text);
    } catch {
      /* fall back to whatever font is available */
    }
    if (token !== buildToken) return; // a newer resize won

    cssW = canvas.getBoundingClientRect().width || canvas.width;
    const off = document.createElement("canvas");
    const oc = off.getContext("2d", { willReadFrequently: true });
    if (!oc) return;

    // Fit the word to the width, then size the height from the real glyph metrics.
    oc.font = probe;
    const size = (100 * (cssW - step * 1.6)) / oc.measureText(text).width;
    oc.font = `${weight} ${size}px ${family}`;
    const m = oc.measureText(text);
    const ascent = m.actualBoundingBoxAscent;
    const descent = m.actualBoundingBoxDescent;
    cssH = Math.ceil((ascent + descent + step * 2) / step) * step;

    off.width = Math.ceil(cssW);
    off.height = cssH;
    oc.font = `${weight} ${size}px ${family}`;
    oc.textBaseline = "alphabetic";
    oc.fillStyle = "#000";
    oc.fillText(text, (cssW - m.width) / 2, cssH - step - descent);

    const data = oc.getImageData(0, 0, off.width, off.height).data;
    const next: Dot[] = [];
    for (let y = step / 2; y < cssH; y += step) {
      for (let x = step / 2; x < cssW; x += step) {
        const alpha = data[(Math.floor(y) * off.width + Math.floor(x)) * 4 + 3];
        next.push({ x, y, on: alpha > 110 });
      }
    }
    dots = next;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = `${cssH}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function paint(now: number, sweepOn: boolean) {
    ctx!.clearRect(0, 0, cssW, cssH);
    const sweepX = sweepOn ? (((now - t0) % sweepMs) / sweepMs) * 1.4 * cssW - 0.2 * cssW : -9999;
    const sweepWidth = step * 12;
    const onR = step * 0.32;
    const offR = step * 0.13;

    for (const d of dots) {
      const near = Math.hypot(d.x - px, d.y - py) < pointerRadius;
      let color: string;
      let alpha: number;
      let r: number;
      if (d.on) {
        r = onR;
        if (near) {
          color = palette.hot;
          alpha = 1;
        } else {
          color = palette.on;
          alpha = 0.55 + 0.45 * Math.max(0, 1 - Math.abs(d.x - sweepX) / sweepWidth);
        }
      } else {
        color = palette.off;
        r = near ? step * 0.18 : offR;
        alpha = near ? 0.25 : 0.07;
      }
      ctx!.globalAlpha = alpha;
      ctx!.fillStyle = color;
      ctx!.beginPath();
      ctx!.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;
  }

  function frame(now: number) {
    if (!t0) t0 = now;
    paint(now, true);
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function render() {
    stop();
    if (!dots.length) return;
    if (reduceMotion.matches || !onScreen || document.hidden) {
      paint(performance.now(), false);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerType === "touch") return;
    const rect = canvas.getBoundingClientRect();
    px = e.clientX - rect.left;
    py = e.clientY - rect.top;
    if (!raf) paint(performance.now(), false); // reduced motion: redraw on demand only
  }
  function onPointerLeave() {
    px = py = -9999;
    if (!raf) paint(performance.now(), false);
  }

  const ro = new ResizeObserver(() => {
    if (Math.abs((canvas.getBoundingClientRect().width || 0) - cssW) > 1) void build();
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
  hoverTarget.addEventListener("pointermove", onPointerMove);
  hoverTarget.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", onVisibility);
  reduceMotion.addEventListener("change", onMotion);
  darkScheme.addEventListener("change", onScheme);

  void build();

  return {
    refreshColors() {
      palette = readPalette(canvas);
      render();
    },
    destroy() {
      stop();
      buildToken++;
      ro.disconnect();
      io.disconnect();
      hoverTarget.removeEventListener("pointermove", onPointerMove);
      hoverTarget.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMotion.removeEventListener("change", onMotion);
      darkScheme.removeEventListener("change", onScheme);
    },
  };
}
