/**
 * The one place GSAP is set up (rules §7.3, D-67). Bundled from npm, never a CDN.
 * Every animation in the app goes through `useMotion()` so it:
 * - is scoped to a component root and reverted on unmount (useGSAP)
 * - runs only when the visitor has not asked for reduced motion (rules §6.8, §7.4)
 * - sets its start state at run time, so content stays visible if this code never runs (rules §7.5)
 */
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// The self-hosted fonts change line heights when they arrive. Recompute trigger positions then.
if (typeof document !== "undefined" && document.fonts) {
  void document.fonts.ready.then(() => ScrollTrigger.refresh());
}

/** Media query under which animations run. Reduced motion gets the final state with no movement. */
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

/** Shared timing. Sender screens stay at or under 400 ms per tween (rules §7.6). */
export const EASE = "power2.out";
export const QUICK = 0.3;

export function motionAllowed(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOTION_OK).matches;
}

/**
 * Run `build` inside a scoped GSAP context, only when motion is allowed.
 * Everything it creates (tweens, ScrollTriggers) is reverted on unmount or when `dependencies` change.
 */
export function useMotion(
  scope: RefObject<HTMLElement | null>,
  build: (root: HTMLElement) => void,
  dependencies: unknown[] = [],
): void {
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => build(root));
    },
    { scope, dependencies, revertOnUpdate: true },
  );
}

/**
 * Fade elements up as they scroll into view, a few at a time (ScrollTrigger.batch).
 * Opacity and transform only, never visibility, so assistive tech and tests always reach the content.
 */
export function revealOnScroll(targets: Element[], opts: { y?: number; stagger?: number } = {}): void {
  if (targets.length === 0) return;
  const y = opts.y ?? 24;
  gsap.set(targets, { opacity: 0, y });
  ScrollTrigger.batch(targets, {
    start: "top 88%",
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, { opacity: 1, y: 0, duration: 0.6, ease: EASE, stagger: opts.stagger ?? 0.08, overwrite: true }),
  });
}

export { gsap, ScrollTrigger };
