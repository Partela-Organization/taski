import { useRef, useState } from "react";
import { TaskiClientError } from "../../../client/index.ts";
import type { TaskiClient, UpdateTicket, WorkSummary } from "../../../client/index.ts";
import { operationError } from "../access/use-team-session.ts";
import { mutationKey } from "../shared/mutation-key.ts";

/** Marks feedback as done or reopens it. Uncertain writes keep their request so a retry reuses the same key. */
export function useFeedbackDone(client: TaskiClient, onSaved: (row: WorkSummary, done: boolean) => void, onExpired: () => void) {
  const attempts = useRef(new Map<string, UpdateTicket>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState("");

  async function toggle(row: WorkSummary) {
    if (pending.has(row.key)) return;
    const done = row.status !== "done";
    const status = done ? "done" : "todo";
    let attempt = attempts.current.get(row.key);
    if (attempt?.changes?.status !== status) {
      attempt = { expectedVersion: row.version, idempotencyKey: mutationKey(), changes: { status } };
      attempts.current.set(row.key, attempt);
    }
    setPending((current) => new Set(current).add(row.key));
    setError("");
    try {
      await client.updateTicket(row.key, attempt);
      attempts.current.delete(row.key);
      onSaved(row, done);
    } catch (failure) {
      const explicit = failure instanceof TaskiClientError && failure.status >= 400 && failure.status < 500 && failure.status !== 401;
      if (explicit) attempts.current.delete(row.key);
      if (failure instanceof TaskiClientError && failure.status === 409) {
        setError("Este feedback cambió en otra sesión. Actualiza la lista y vuelve a marcarlo si sigue aplicando.");
      } else if (failure instanceof TaskiClientError && failure.code === "REVIEW_REQUIRED") {
        setError("Solo una persona del equipo puede marcar feedback como hecho.");
      } else if (explicit) {
        setError("No se pudo guardar el cambio. Actualiza la lista y vuelve a intentarlo.");
      } else {
        setError(operationError(failure, onExpired));
      }
    } finally {
      setPending((current) => { const next = new Set(current); next.delete(row.key); return next; });
    }
  }
  function reset() { attempts.current.clear(); setError(""); }
  return { pending, error, toggle, reset, clearError: () => setError("") };
}
