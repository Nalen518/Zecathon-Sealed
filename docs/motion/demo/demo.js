// ../../../mnt/attach/outputs/motion/src/memoGrid.ts
var MEMO_BYTES = 512;
var LENGTH_PREFIX_BYTES = 2;
var MAX_MESSAGE_BYTES = 331;
var SEAL_OVERHEAD_BYTES = 48;
var TEXT_PREFIX = "z1:";
var SEALED_MEMO_BYTES = TEXT_PREFIX.length + 4 * Math.ceil((LENGTH_PREFIX_BYTES + MAX_MESSAGE_BYTES + SEAL_OVERHEAD_BYTES) / 3);
var encoder = new TextEncoder();
var utf8Length = (text) => encoder.encode(text).length;
function truncateToBytes(text, maxBytes = MAX_MESSAGE_BYTES) {
  if (utf8Length(text) <= maxBytes) return text;
  let out = "";
  let used = 0;
  for (const ch of text) {
    const n = utf8Length(ch);
    if (used + n > maxBytes) break;
    out += ch;
    used += n;
  }
  return out;
}
var SAMPLE_TIP = "The tender for the river bridge was decided before bids closed. Ask the clerk at the planning office about the March 4 minutes.";
var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
var noise = (i, salt) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
function readPalette(el) {
  const cs = getComputedStyle(el);
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    words: v("--memo-words", "#ffffff"),
    length: v("--memo-length", "#a9a7a0"),
    seal: v("--memo-seal", "#f4b728"),
    unused: v("--memo-unused", "#45454b")
  };
}
function mountMemoGrid(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sealed memo grid: 2D canvas is not available");
  const mode = opts.mode ?? "loop";
  const cols = opts.columns ?? 32;
  const rows = Math.ceil(MEMO_BYTES / cols);
  const gap = opts.gap ?? 3;
  const radius = opts.radius ?? 2;
  const loopMs = opts.loopMs ?? 1e4;
  const messageBytes = Math.min(utf8Length(opts.message ?? SAMPLE_TIP), MAX_MESSAGE_BYTES);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
  let palette = readPalette(canvas);
  let cssW = 0;
  let cssH = 0;
  let cell = 0;
  let staticBytes = clampBytes(opts.initialBytes ?? 0);
  let staticSealed = opts.initialSealed ?? false;
  let raf = 0;
  let t0 = 0;
  let onScreen = true;
  let lastLabel = "";
  function clampBytes(n) {
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function setLabel(text) {
    if (opts.labelEl && text !== lastLabel) {
      opts.labelEl.textContent = text;
      lastLabel = text;
    }
  }
  function cellRect(x, y) {
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, cell, cell, radius);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, cell, cell);
    }
  }
  function paint(typed, seal, alpha, grain) {
    ctx.clearRect(0, 0, cssW, cssH);
    for (let i = 0; i < MEMO_BYTES; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      let color = palette.unused;
      let a = 1;
      if (typed > 0 && i < LENGTH_PREFIX_BYTES) color = palette.length;
      else if (i >= LENGTH_PREFIX_BYTES && i - LENGTH_PREFIX_BYTES < typed) color = palette.words;
      if (seal > 0 && i < SEALED_MEMO_BYTES) {
        const order = (c + r * 2) / (cols + rows * 2);
        if (order <= seal) {
          color = palette.seal;
          a = i < TEXT_PREFIX.length ? 1 : 0.35 + 0.55 * noise(i, grain);
        }
      }
      ctx.globalAlpha = a * alpha;
      ctx.fillStyle = color;
      cellRect(c * (cell + gap), r * (cell + gap));
    }
    ctx.globalAlpha = 1;
    if (seal >= 1) setLabel(`SEALED \xB7 ${SEALED_MEMO_BYTES} / ${MEMO_BYTES} BYTES \xB7 ${TEXT_PREFIX}`);
    else if (seal > 0) setLabel("SEALING IN YOUR BROWSER");
    else setLabel(`MESSAGE \xB7 ${typed} / ${MAX_MESSAGE_BYTES} BYTES`);
  }
  function paintStill() {
    paint(messageBytes, 1, 1, 0);
  }
  function frame(now) {
    if (!t0) t0 = now;
    const elapsed = now - t0;
    const p = elapsed % loopMs / loopMs;
    const typed = Math.floor(clamp01(p / 0.45) * messageBytes);
    const seal = clamp01((p - 0.45) / 0.17);
    const alpha = p > 0.92 ? 1 - (p - 0.92) / 0.08 : 1;
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
      paint(staticBytes, staticSealed ? 1 : 0, 1, 0);
      return;
    }
    if (reduceMotion.matches || !onScreen || document.hidden) {
      paintStill();
      return;
    }
    raf = requestAnimationFrame(frame);
  }
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
    setBytes(bytes) {
      staticBytes = clampBytes(bytes);
      if (mode === "static") render();
    },
    setSealed(sealed) {
      staticSealed = sealed;
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
    }
  };
}

// ../../../mnt/attach/outputs/motion/src/dotWordmark.ts
function readPalette2(el) {
  const cs = getComputedStyle(el);
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return {
    on: v("--dot-on", "#ffffff"),
    off: v("--dot-off", "#ffffff"),
    hot: v("--dot-hot", "#f4b728")
  };
}
function mountDotWordmark(canvas, opts = {}) {
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
  let palette = readPalette2(canvas);
  let dots = [];
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
    }
    if (token !== buildToken) return;
    cssW = canvas.getBoundingClientRect().width || canvas.width;
    const off = document.createElement("canvas");
    const oc = off.getContext("2d", { willReadFrequently: true });
    if (!oc) return;
    oc.font = probe;
    const size = 100 * (cssW - step * 1.6) / oc.measureText(text).width;
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
    const next = [];
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }
  function paint(now, sweepOn) {
    ctx.clearRect(0, 0, cssW, cssH);
    const sweepX = sweepOn ? (now - t0) % sweepMs / sweepMs * 1.4 * cssW - 0.2 * cssW : -9999;
    const sweepWidth = step * 12;
    const onR = step * 0.32;
    const offR = step * 0.13;
    for (const d of dots) {
      const near = Math.hypot(d.x - px, d.y - py) < pointerRadius;
      let color;
      let alpha;
      let r;
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
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function frame(now) {
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
  function onPointerMove(e) {
    if (e.pointerType === "touch") return;
    const rect = canvas.getBoundingClientRect();
    px = e.clientX - rect.left;
    py = e.clientY - rect.top;
    if (!raf) paint(performance.now(), false);
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
    palette = readPalette2(canvas);
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
      palette = readPalette2(canvas);
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
    }
  };
}

// ../../../mnt/attach/outputs/motion/demo/demo-entry.ts
var heroCanvas = document.querySelector("#hero-grid");
mountMemoGrid(heroCanvas, {
  mode: "loop",
  labelEl: document.querySelector("#hero-grid-label")
});
var tipField = document.querySelector("#tip");
var counter = document.querySelector("#tip-count");
var counterGrid = mountMemoGrid(document.querySelector("#counter-grid"), {
  mode: "static",
  labelEl: document.querySelector("#counter-grid-label")
});
function onTipInput() {
  if (utf8Length(tipField.value) > MAX_MESSAGE_BYTES) {
    tipField.value = truncateToBytes(tipField.value, MAX_MESSAGE_BYTES);
  }
  const n = utf8Length(tipField.value);
  counter.textContent = `${n} / ${MAX_MESSAGE_BYTES} bytes`;
  counterGrid.setBytes(n);
}
tipField.addEventListener("input", onTipInput);
document.querySelector("#seal-btn").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  const sealed = btn.getAttribute("aria-pressed") !== "true";
  btn.setAttribute("aria-pressed", String(sealed));
  btn.textContent = sealed ? "Show the message bytes" : "Show the sealed memo";
  counterGrid.setSealed(sealed);
});
onTipInput();
var footer = document.querySelector("#site-footer");
mountDotWordmark(document.querySelector("#footer-wordmark"), { hoverTarget: footer });
