/** Pure rules for the project recap: track health, calendar arithmetic and the shared progress text. */
export type TrackHealth = "late" | "risk" | "ok" | "none";

/** Days left before a track is considered at risk, and the share of pending tasks that makes it risky. */
export const riskWindowDays = 7;
export const riskRemainingShare = 0.25;

const dayMs = 86_400_000;
function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) / dayMs;
}

/** Whole calendar days from `from` to `to`, both `YYYY-MM-DD`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** The calendar date (`YYYY-MM-DD`) of an instant in a time zone. */
export function localDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(instant));
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function percent(done: number, total: number): number {
  return total > 0 ? Math.round(done / total * 100) : 0;
}

/**
 * late: the date passed and tasks remain. risk: seven days or fewer and at least 25% pending.
 * ok: dated and neither. none: no target date.
 */
export function trackHealth(targetDate: string | null, done: number, total: number, today: string): TrackHealth {
  if (!targetDate) return "none";
  const remaining = total - done;
  const daysLeft = daysBetween(today, targetDate);
  if (daysLeft < 0 && remaining > 0) return "late";
  if (daysLeft <= riskWindowDays && total > 0 && remaining / total >= riskRemainingShare) return "risk";
  return "ok";
}

export function progressBar(value: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round(value / 100 * width)));
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

/** Monospace lines for chat recaps: one bar per track and a total. */
export function progressText(heading: string, tracks: readonly { label: string; percent: number }[], total: number): string {
  const rows = [...tracks.map((track) => ({ label: track.label, value: track.percent })), { label: "Total", value: total }];
  const width = Math.min(22, Math.max(...rows.map((row) => row.label.length)));
  const line = (row: { label: string; value: number }) => {
    const label = row.label.length > width ? `${row.label.slice(0, width - 1)}…` : row.label.padEnd(width);
    return `${label} ${progressBar(row.value)} ${String(row.value).padStart(3)}%`;
  };
  return [heading, "", ...tracks.map((track) => line({ label: track.label, value: track.percent })), "", line(rows.at(-1)!)].join("\n");
}
