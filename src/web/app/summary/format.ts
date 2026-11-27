import type { TrackHealth } from "../../../client/index.ts";

/** Calendar dates (`YYYY-MM-DD`) are formatted in UTC so they never shift with the viewer's zone. */
function utc(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
const longFormat = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dueFormat = new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function longDate(date: string): string { return capitalize(longFormat.format(utc(date)).replace(",", "")); }
export function dueDate(date: string): string { return capitalize(dueFormat.format(utc(date)).replace(/[.,]/g, "")); }

export function relativeDays(days: number | null): string {
  if (days === null) return "sin fecha";
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days > 1) return `en ${days} días`;
  if (days === -1) return "venció ayer";
  return `venció hace ${-days} días`;
}

export const healthLabels: Record<TrackHealth, string> = { late: "Vencido", risk: "En riesgo", ok: "En camino", none: "Sin fecha" };

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The recap is already plain text in the team's Telegram style, so it is copied as is. */
export function telegramMessage(text: string): string { return text; }
