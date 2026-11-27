import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectResult, TaskiClient, WorkSummary } from "../../../client/index.ts";
import { operationError } from "../access/use-team-session.ts";
import type { FeedbackFilter } from "./presentation.ts";
import type { View } from "./views.ts";

export function useTicketList(client: TaskiClient, memberId: string | undefined, view: View, area: string,
  feedbackFilter: FeedbackFilter, onExpired: () => void) {
  const [project, setProject] = useState<ProjectResult["project"]>();
  const [rows, setRows] = useState<WorkSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const id = ++generation.current;
    setRows([]);
    setCursor(null);
    setError("");
    if (!memberId) {
      setProject(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    async function load() {
      try {
        const [config, page] = await Promise.all([
          client.getProject(),
          view === "summary" ? Promise.resolve({ items: [], nextCursor: null }) : client.listTickets({ view: "work", order: "recent", limit: 20, type: view === "feedback" ? "feedback" : "task",
            ...(view === "mine" ? { assigneeId: memberId! } : {}),
            ...(view === "review" ? { status: "in_review" as const } : {}),
            ...(view === "feedback" && feedbackFilter === "open" ? { open: true as const } : {}),
            ...(view === "feedback" && feedbackFilter === "done" ? { status: "done" as const } : {}),
            ...(area ? { areaId: area } : {}) }),
        ]);
        if (generation.current !== id) return;
        setProject(config.project);
        setRows(page.items);
        setCursor(page.nextCursor);
      } catch (error) {
        if (generation.current === id) setError(operationError(error, onExpired));
      } finally {
        if (generation.current === id) setLoading(false);
      }
    }
    void load();
    return () => { generation.current++; };
  }, [client, memberId, view, area, feedbackFilter, revision, onExpired]);

  async function more() {
    if (!cursor || loading) return;
    const id = generation.current;
    setLoading(true);
    setError("");
    try {
      const page = await client.listTickets({ view: "work", limit: 20, cursor });
      if (id !== generation.current) return;
      setRows((old) => [...old, ...page.items.filter((row) => !old.some(({ key }) => key === row.key))]);
      setCursor(page.nextCursor);
    } catch (error) {
      if (id === generation.current) setError(operationError(error, onExpired));
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }
  return { project, rows, hasMore: cursor !== null, loading, error, refresh, more };
}
