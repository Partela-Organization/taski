export type Presentation = "list" | "cards";
export type Grouping = "area" | "status";

const storageKey = "taski.ticketPresentation";
const groupingKey = "taski.ticketGrouping";

export function readPresentation(): Presentation {
  try {
    if (localStorage.getItem(storageKey) === "cards") return "cards";
  } catch { /* The browser may restrict storage. */ }
  return "list";
}

export function savePresentation(presentation: Presentation): void {
  try { localStorage.setItem(storageKey, presentation); }
  catch { /* The selection still works for this session. */ }
}

export function readGrouping(): Grouping {
  try {
    if (localStorage.getItem(groupingKey) === "status") return "status";
  } catch { /* The browser may restrict storage. */ }
  return "area";
}

export function saveGrouping(grouping: Grouping): void {
  try { localStorage.setItem(groupingKey, grouping); }
  catch { /* The selection still works for this session. */ }
}
