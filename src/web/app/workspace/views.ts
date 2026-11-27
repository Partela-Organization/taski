import type { Access } from "../access/use-team-session.ts";
import { compactWidth } from "../shared/layout.ts";

export const views = [
  { id: "summary", label: "Resumen", heading: "Resumen" },
  { id: "team", label: "Todo el equipo", heading: "Trabajo del equipo" },
  { id: "mine", label: "Mis tickets", heading: "Mis tickets" },
  { id: "feedback", label: "Feedback", heading: "Feedback" },
  { id: "review", label: "Por revisar", heading: "Por revisar" },
] as const;

export type View = typeof views[number]["id"];
const viewKey = "taski.view";

/** The view chosen in this tab survives reloads; a new tab starts from the member's default. */
export function initialView(memberId: string, access: Access | undefined): View {
  try {
    const stored = JSON.parse(sessionStorage.getItem(viewKey) ?? "null") as { memberId?: string; view?: string } | null;
    const match = views.find(({ id }) => id === stored?.view);
    if (stored?.memberId === memberId && match) return match.id;
  } catch { /* Storage may be restricted or hold an old value. */ }
  return matchMedia(`(max-width: ${compactWidth}px)`).matches || access?.members.find((member) => member.id === memberId)?.defaultView === "feedback"
    ? "feedback" : "summary";
}

export function saveView(memberId: string, view: View): void {
  try { sessionStorage.setItem(viewKey, JSON.stringify({ memberId, view })); }
  catch { /* The choice still applies until the tab reloads. */ }
}
