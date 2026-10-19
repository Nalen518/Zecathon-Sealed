import "./Tag.css";

/** Figma: Tag, property Tone. Free-text label for screen state. Never for tip status (D-15). */
export type TagTone = "success" | "warning" | "danger" | "neutral";

export function Tag({ tone, children }: { tone: TagTone; children: string }) {
  return <span className={`tag tag-${tone} text-mono-badge`}>{children}</span>;
}
