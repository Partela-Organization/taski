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

export interface RecapTrack {
  label: string; health: TrackHealth; targetDate: string | null; done: number; total: number;
  next: { title: string } | null;
}

/** `▓▓▓░░░░░░░ 30 % · 3/10`, the line format the team already sends to Telegram; `—` when there is nothing to count. */
export function progressLine(done: number, total: number): string {
  if (total === 0) return "—";
  return `${progressBar(done / total * 100)} ${percent(done, total)} % · ${done}/${total}`;
}

const shortDate = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "UTC" });
function short(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return shortDate.format(Date.UTC(year!, month! - 1, day!)).replace(/\./g, "");
}
function clip(text: string, max = 58): string { return text.length > max ? `${text.slice(0, max - 1)}…` : text; }

/**
 * Plain-text recap in the team's Telegram style: total in the heading, one bar per track, ⚠️ on late or at-risk
 * tracks, then ▶ the next step of the most urgent tracks. Emojis are markers only, as in the team's bot.
 */
export function progressText(heading: string, tracks: readonly RecapTrack[], totals: { done: number; total: number }): string {
  const lines = [`📋 ${heading}  ${progressLine(totals.done, totals.total)}`];
  for (const track of tracks) {
    const flag = track.health === "late" ? ` · ⚠️ venció ${short(track.targetDate!)}`
      : track.health === "risk" ? ` · ⚠️ vence ${short(track.targetDate!)}` : "";
    lines.push(`${track.label}  ${progressLine(track.done, track.total)}${flag}`);
  }
  const urgent = (track: RecapTrack) => track.health === "late" || track.health === "risk" ? 0 : 1;
  const next = tracks.filter((track) => track.next).sort((a, b) => urgent(a) - urgent(b)).slice(0, 3);
  if (next.length) lines.push("", ...next.map((track, index) => `${index ? "•" : "▶"} ${clip(`${track.label}: ${track.next!.title}`)}`));
  return lines.join("\n");
}
