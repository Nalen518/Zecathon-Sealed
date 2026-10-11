import { mountMemoGrid, utf8Length, truncateToBytes, MAX_MESSAGE_BYTES } from "../src/memoGrid";
import { mountDotWordmark } from "../src/dotWordmark";

// Hero: loop mode
const heroCanvas = document.querySelector<HTMLCanvasElement>("#hero-grid")!;
mountMemoGrid(heroCanvas, {
  mode: "loop",
  labelEl: document.querySelector<HTMLElement>("#hero-grid-label"),
});

// Write screen preview: static mode driven by real UTF-8 byte counts (FR-1)
const tipField = document.querySelector<HTMLTextAreaElement>("#tip")!;
const counter = document.querySelector<HTMLElement>("#tip-count")!;
const counterGrid = mountMemoGrid(document.querySelector<HTMLCanvasElement>("#counter-grid")!, {
  mode: "static",
  labelEl: document.querySelector<HTMLElement>("#counter-grid-label"),
});
function onTipInput() {
  // Block input beyond the limit: keep what fits, cut at a whole character (FR-1).
  if (utf8Length(tipField.value) > MAX_MESSAGE_BYTES) {
    tipField.value = truncateToBytes(tipField.value, MAX_MESSAGE_BYTES);
  }
  const n = utf8Length(tipField.value);
  counter.textContent = `${n} / ${MAX_MESSAGE_BYTES} bytes`;
  counterGrid.setBytes(n);
}
tipField.addEventListener("input", onTipInput);
document.querySelector<HTMLButtonElement>("#seal-btn")!.addEventListener("click", (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const sealed = btn.getAttribute("aria-pressed") !== "true";
  btn.setAttribute("aria-pressed", String(sealed));
  btn.textContent = sealed ? "Show the message bytes" : "Show the sealed memo";
  counterGrid.setSealed(sealed);
});
onTipInput();

// Footer: dot-matrix wordmark, hover anywhere on the footer
const footer = document.querySelector<HTMLElement>("#site-footer")!;
mountDotWordmark(document.querySelector<HTMLCanvasElement>("#footer-wordmark")!, { hoverTarget: footer });
