import { useSyncExternalStore } from "react";

// Keep in sync with the connected workspace and ticket-panel media queries.
export const compactWidth = 760;
const compactQuery = `(max-width: ${compactWidth}px)`;

function subscribe(listener: () => void) {
  const query = matchMedia(compactQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function useCompactLayout() {
  return useSyncExternalStore(subscribe, () => matchMedia(compactQuery).matches);
}
