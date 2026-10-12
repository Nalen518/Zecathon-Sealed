/** Desk display helpers. Pure functions, local time (api-contract §4.1: the frontend shows local time). */

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const num = new Intl.NumberFormat("en-US");

/** "Today, 14:02", "Yesterday, 22:15", "Oct 9, 11:20" (Figma Tip row). */
export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return `Today, ${time.format(d)}`;
  if (t >= startOfToday - 86_400_000) return `Yesterday, ${time.format(d)}`;
  return `${day.format(d)}, ${time.format(d)}`;
}

/** "3f9a…c21e" */
export const shortTxid = (txid: string) => `${txid.slice(0, 4)}…${txid.slice(-4)}`;

/** 4201108 -> "4,201,108" */
export const formatHeight = (h: number) => num.format(h);

/** Age of a check: "12 s", "3 min", "2 h". */
export function formatAge(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

/**
 * Parse a ZEC amount typed by the desk ("0.001") into zatoshis. Null if it is not a number
 * with at most 8 decimals.
 */
export function parseZec(text: string): number | null {
  const m = /^(\d{1,8})(?:\.(\d{1,8}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100_000_000 + Number((m[2] ?? "").padEnd(8, "0"));
}
