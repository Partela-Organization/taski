const glyphs = {
  summary: "M4 20V11 M10 20V5 M16 20v-6 M21 20H3",
  horizon: "M2 18h20 M6 18a6 6 0 0 1 12 0 M12 5v3 M4.9 9.9l2.1 2.1 M19.1 9.9 17 12 M5 21h14",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  upload: "M12 16V4 M7 9l5-5 5 5 M4 20h16",
  send: "m21 3-9.5 9.5 M21 3l-6.5 18-3-8.5L3 9.5z",
  team: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  mine: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2",
  review: "M8 4H5v17h14V4h-3 M8 2h8v5H8z M8 13l3 3 5-5",
  feedback: "M4 4h16v12H9l-5 4z M8 9h8 M8 12h5",
  search: "M15.5 10a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z M14 14l5 5",
  terminal: "M3 5h18v14H3z M7 9l3 3-3 3 M13 15h4",
  plus: "M12 5v14 M5 12h14",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5",
  list: "M4 6h2 M10 6h10 M4 12h2 M10 12h10 M4 18h2 M10 18h10",
  chevron: "m9 5 7 7-7 7",
  refresh: "M20 4v5h-5 M20 9a8 8 0 1 0 0 6",
  highlight: "m4 15 10-10 5 5L9 20H4z M13 6l5 5 M4 23h15",
};
export function WorkspaceIcon({ name }: { name: keyof typeof glyphs }) {
  return <svg className="workspace-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={glyphs[name]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
export function Wordmark({ name }: { name: string }) {
  return <strong className="wordmark">{name}<span aria-hidden="true" /></strong>;
}
