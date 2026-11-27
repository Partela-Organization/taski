import type { Access } from "../access/use-team-session.ts";
import { compactWidth } from "../shared/layout.ts";

/** Views shown in the navigation. A track view is reached from the track list, the summary or `/track/:areaId`. */
export const views = [
  { id: "summary", label: "Resumen", heading: "Resumen" },
  { id: "team", label: "Todo el equipo", heading: "Trabajo del equipo" },
  { id: "mine", label: "Mis tickets", heading: "Mis tickets" },
  { id: "feedback", label: "Feedback", heading: "Feedback" },
  { id: "review", label: "Por revisar", heading: "Por revisar" },
] as const;

export type NavigationView = typeof views[number]["id"];
export type View = NavigationView | "track";
export interface Place { view: View; trackId: string }
const viewKey = "taski.view";

export function trackPath(trackId: string): string { return `/track/${encodeURIComponent(trackId)}`; }

export function trackFromPath(pathname: string): string | undefined {
  const match = /^\/track\/([^/]+)$/.exec(pathname);
  if (!match) return undefined;
  try { return decodeURIComponent(match[1]!); } catch { return undefined; }
}

/** The address bar wins, then the place chosen in this tab (it survives reloads), then the member's default. */
export function initialPlace(memberId: string, access: Access | undefined): Place {
  const fromPath = trackFromPath(location.pathname);
  if (fromPath) return { view: "track", trackId: fromPath };
  try {
    const stored = JSON.parse(sessionStorage.getItem(viewKey) ?? "null") as { memberId?: string; view?: string; trackId?: string } | null;
    if (stored?.memberId === memberId) {
      if (stored.view === "track" && stored.trackId) return { view: "track", trackId: stored.trackId };
      const match = views.find(({ id }) => id === stored.view);
      if (match) return { view: match.id, trackId: "" };
    }
  } catch { /* Storage may be restricted or hold an old value. */ }
  const feedbackFirst = matchMedia(`(max-width: ${compactWidth}px)`).matches
    || access?.members.find((member) => member.id === memberId)?.defaultView === "feedback";
  return { view: feedbackFirst ? "feedback" : "summary", trackId: "" };
}

export function savePlace(memberId: string, place: Place): void {
  try { sessionStorage.setItem(viewKey, JSON.stringify({ memberId, ...place })); }
  catch { /* The choice still applies until the tab reloads. */ }
}
