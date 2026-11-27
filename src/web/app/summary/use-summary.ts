import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectSummary, TaskiClient } from "../../../client/index.ts";
import { operationError } from "../access/use-team-session.ts";

/** Loads the server-side recap and its chat text together, each time the view becomes active or on refresh. */
export function useSummary(client: TaskiClient, memberId: string | undefined, active: boolean, onExpired: () => void) {
  const [summary, setSummary] = useState<ProjectSummary>();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const id = ++generation.current;
    if (!memberId || !active) return;
    setLoading(true);
    setError("");
    void Promise.all([client.getSummary(), client.getSummaryText()]).then(([result, chat]) => {
      if (generation.current !== id) return;
      setSummary(result);
      setText(chat.text);
    }, (failure) => {
      if (generation.current === id) setError(operationError(failure, onExpired));
    }).finally(() => {
      if (generation.current === id) setLoading(false);
    });
    return () => { generation.current++; };
  }, [client, memberId, active, revision, onExpired]);
  return { summary, text, loading, error, refresh };
}
export type SummaryModel = ReturnType<typeof useSummary>;
