import type { Access } from "../access/use-team-session.ts";
import { compactWidth } from "../shared/layout.ts";

export const views = [
  { id: "team", label: "Todo el equipo", heading: "Trabajo del equipo" },
  { id: "mine", label: "Mis tickets", heading: "Mis tickets" },
  { id: "feedback", label: "Feedback", heading: "Feedback" },
  { id: "review", label: "Por revisar", heading: "Por revisar" },
] as const;

export type View = typeof views[number]["id"];
export function initialView(memberId: string, access: Access | undefined): View {
  return matchMedia(`(max-width: ${compactWidth}px)`).matches || access?.members.find((member) => member.id === memberId)?.defaultView === "feedback"
    ? "feedback" : "team";
}
