export type Presentation = "list" | "cards";

const storageKey = "taski.ticketPresentation";

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
