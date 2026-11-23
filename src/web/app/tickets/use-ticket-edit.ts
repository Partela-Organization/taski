import { useState } from "react";
import { TaskiClientError } from "../../../client/index.ts";
import type { Edits, TicketResult, UpdateTicket, TaskiClient } from "../../../client/index.ts";
import { mutationKey } from "../shared/mutation-key.ts";

export interface Draft { edits: Edits; changes: Edits; version: number; pending?: UpdateTicket }
const editable = (result: TicketResult<"full">): Edits => {
  const t = result.ticket; return { title: t.title, description: t.description, status: t.status, assigneeId: t.assigneeId, areaId: t.areaId, prUrl: t.prUrl };
};
export function useTicketEdit({ initial, client, drafts, onSaved }: {
  initial: TicketResult<"full">; client: TaskiClient; drafts: Map<string, Draft>;
  onSaved: (result?: TicketResult<"full">) => void;
}) {
  const key = initial.ticket.key;
  const [server, setServer] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => drafts.get(key) ?? { edits: editable(initial), changes: {}, version: initial.ticket.version });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const expectedVersion = Object.keys(draft.changes).length ? draft.version : server.ticket.version;
  function change(edits: Edits) {
    const updated = { ...draft, version: expectedVersion, edits: { ...draft.edits, ...edits }, changes: { ...draft.changes, ...edits } };
    drafts.set(key, updated); setDraft(updated); setNotice("");
  }
  async function reload(keep: boolean) {
    setBusy(true); setError("");
    try {
      const fresh = await client.getTicket(key, { view: "full", commentsLimit: 5 }); setServer(fresh);
      const updated = { edits: keep ? { ...editable(fresh), ...draft.changes } : editable(fresh), changes: keep ? draft.changes : {}, version: fresh.ticket.version };
      setDraft(updated); if (keep) drafts.set(key, updated); else drafts.delete(key);
      setConflict(false); setNotice(keep ? "Versión actual cargada. Revisa tus cambios antes de guardarlos." : "Detalle actualizado.");
    } catch { setError("No se pudo actualizar el detalle. Tu texto se conserva."); }
    finally { setBusy(false); }
  }
  function save(changes: Edits) {
    if (busy || conflict) return;
    const pending = draft.pending ?? { changes, expectedVersion, idempotencyKey: mutationKey() };
    const updated = { ...draft, changes, version: pending.expectedVersion, pending };
    setDraft(updated); drafts.set(key, updated); setBusy(true); setError(""); setNotice("");
    void client.updateTicket(key, pending).then(async (receipt) => {
      drafts.delete(key);
      setDraft({ edits: draft.edits, changes: {}, version: receipt.version });
      setNotice("Cambios guardados.");
      try {
        const fresh = await client.getTicket(key, { view: "full", commentsLimit: 5 });
        setServer(fresh);
        setDraft({ edits: editable(fresh), changes: {}, version: fresh.ticket.version });
        onSaved(fresh);
      }
      catch { onSaved(); setNotice("Cambios guardados. Actualiza el detalle para consultar la versión confirmada."); }
    }).catch((e: unknown) => {
      if (e instanceof TaskiClientError && e.status >= 400 && e.status < 500) {
        const corrected = { edits: draft.edits, changes, version: pending.expectedVersion }; drafts.set(key, corrected); setDraft(corrected);
        if (e.status === 409) setConflict(true);
      }
      if (e instanceof TaskiClientError && e.message === "Invalid HTTPS PR URL") {
        setError("Escribe un enlace HTTPS al PR, sin parámetros ni fragmentos. Tu borrador se conserva.");
      } else {
        setError(e instanceof TaskiClientError && e.status === 409 ? "Otra persona modificó esta tarea. Tu borrador se conserva." : "No se pudo guardar. Tu borrador se conserva.");
      }
    }).finally(() => setBusy(false));
  }
  function acceptConversationUpdate(fresh: TicketResult<"full">) {
    setServer(fresh);
    // A draft with its own edits continues to carry the version the user edited.
    // Updating a comment or highlight must not silently rebase those edits.
    if (!draft.pending && !Object.keys(draft.changes).length) {
      setDraft({ edits: editable(fresh), changes: {}, version: fresh.ticket.version });
    }
    onSaved(fresh);
  }

  return { server, draft, busy, conflict, notice, error, change, save, reload, acceptConversationUpdate };
}
