import { useState } from "react";
import { TaskiClient, TaskiClientError } from "../../client/index.ts";
import type { Edits, ProjectResult, TicketResult, UpdateTicket } from "../../client/index.ts";
import { Conversation } from "./conversation.tsx";
import type { ConversationDraft } from "./conversation.tsx";
import { Button, Field, StatusMessage } from "../components.tsx";

export interface Draft { edits: Edits; changes: Edits; version: number; pending?: UpdateTicket }
const editable = (result: TicketResult<"full">): Edits => {
  const t = result.ticket; return { title: t.title, description: t.description, status: t.status, assigneeId: t.assigneeId, areaId: t.areaId, prUrl: t.prUrl };
};
export function TicketDetail({ initial, project, client, drafts, conversations, onSaved }: {
  initial: TicketResult<"full">; project: ProjectResult["project"]; client: TaskiClient; drafts: Map<string, Draft>; conversations: Map<string, ConversationDraft>; onSaved: () => void;
}) {
  const key = initial.ticket.key;
  const [server, setServer] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => drafts.get(key) ?? { edits: editable(initial), changes: {}, version: initial.ticket.version });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  function change(edits: Edits) {
    const updated = { ...draft, edits: { ...draft.edits, ...edits }, changes: { ...draft.changes, ...edits } }; drafts.set(key, updated); setDraft(updated); setNotice("");
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
    const pending = draft.pending ?? { changes, expectedVersion: draft.version, idempotencyKey: crypto.randomUUID() };
    const updated = { ...draft, changes, pending }; setDraft(updated); drafts.set(key, updated); setBusy(true); setError(""); setNotice("");
    void client.updateTicket(key, pending).then(async (receipt) => {
      drafts.delete(key); setDraft({ edits: draft.edits, changes: {}, version: receipt.version }); onSaved(); setNotice("Cambios guardados.");
      try { const fresh = await client.getTicket(key, { view: "full", commentsLimit: 5 }); setServer(fresh); setDraft({ edits: editable(fresh), changes: {}, version: fresh.ticket.version }); }
      catch { setNotice("Cambios guardados. Actualiza el detalle para consultar la versión confirmada."); }
    }).catch((e: unknown) => {
      if (e instanceof TaskiClientError && e.status >= 400 && e.status < 500) {
        const corrected = { edits: draft.edits, changes, version: draft.version }; drafts.set(key, corrected); setDraft(corrected);
        if (e.status === 409) setConflict(true);
      }
      if (e instanceof TaskiClientError && e.message === "Invalid HTTPS PR URL") {
        setError("Escribe un enlace HTTPS al PR, sin parámetros ni fragmentos. Tu borrador se conserva.");
      } else {
        setError(e instanceof TaskiClientError && e.status === 409 ? "Otra persona modificó esta tarea. Tu borrador se conserva." : "No se pudo guardar. Tu borrador se conserva.");
      }
    }).finally(() => setBusy(false));
  }
  const feedback = server.ticket.type === "feedback";
  const author = project?.members.find((member) => member.id === server.ticket.createdBy)?.name ?? server.ticket.createdBy;
  const ticketUrl = `${location.origin}/t/${encodeURIComponent(key)}`;
  async function copyLink() {
    try { await navigator.clipboard.writeText(ticketUrl); setNotice("Enlace copiado."); }
    catch { setNotice(`Enlace: ${ticketUrl}`); }
  }
  return <>
    <p>{key} · Versión {server.ticket.version}</p>
    <Button onClick={() => void copyLink()}>Copiar enlace</Button>
    {server.ticket.prUrl && <p><a href={server.ticket.prUrl} target="_blank" rel="noreferrer">Abrir PR vinculado</a></p>}
    {feedback ? <>
      <p>{project?.typeLabels.feedback ?? "Feedback"} · {author}</p>
      <p className="description">{server.ticket.description || "Sin contexto adicional"}</p>
      <Button disabled={busy || conflict} onClick={() => save({ ...draft.changes, type: "task" })}>
        {busy ? "Guardando…" : draft.pending ? "Reintentar conversión" : "Convertir en tarea"}
      </Button>
    </> : <form onSubmit={(event) => { event.preventDefault(); save(draft.changes); }}>
      <fieldset disabled={busy || !!draft.pending}><legend>Editar tarea</legend>
        <Field label="Título" required value={draft.edits.title ?? ""} onChange={(e) => change({ title: e.target.value })} />
        <label htmlFor="description">Descripción</label><textarea id="description" value={draft.edits.description ?? ""} onChange={(e) => change({ description: e.target.value })} />
        <label htmlFor="status">Estado</label><select id="status" value={draft.edits.status} onChange={(e) => change({ status: e.target.value as NonNullable<Edits["status"]> })}>{Object.entries(project?.statusLabels ?? {}).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <label htmlFor="assignee">Responsable</label><select id="assignee" value={draft.edits.assigneeId ?? ""} onChange={(e) => change({ assigneeId: e.target.value || null })}><option value="">Sin asignar</option>{project?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <label htmlFor="ticket-area">Área de la tarea</label><select id="ticket-area" value={draft.edits.areaId} onChange={(e) => change({ areaId: e.target.value })}>{project?.areas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
        <Field label="Enlace al PR" type="url" inputMode="url" maxLength={1000} placeholder="https://github.com/equipo/proyecto/pull/42"
          value={draft.edits.prUrl ?? ""} onChange={(e) => change({ prUrl: e.target.value.trim() || null })} />
      </fieldset>
      <Button type="submit" variant="primary" disabled={busy || conflict || (!draft.pending && !Object.keys(draft.changes).length)}>{busy ? "Guardando…" : draft.pending ? "Reintentar guardado" : "Guardar cambios"}</Button>
    </form>}
    {!feedback && <p>Creada por {author}</p>}
    {drafts.has(key) && <p>Borrador conservado en esta pestaña.</p>}
    {error && <StatusMessage tone="error" title={error} />}
    {conflict && <><p>Versión consultada: {server.ticket.title}. Tu título propuesto: {draft.edits.title}.</p><Button disabled={busy} onClick={() => void reload(true)}>Consultar versión actual y conservar borrador</Button></>}
    <Button disabled={busy || !!draft.pending} onClick={() => { if (!drafts.has(key) || confirm("¿Descartar el borrador y cargar la versión actual?")) void reload(false); }}>Actualizar detalle</Button>
    {notice && <StatusMessage title={notice} />}
    <Conversation key={key} result={server} client={client} cache={conversations} disabled={busy || !!draft.pending} onUpdated={(fresh) => {
      setServer(fresh); onSaved();
      if (!draft.pending) {
        const updated = { ...draft, edits: { ...editable(fresh), ...draft.changes }, version: fresh.ticket.version };
        setDraft(updated); if (drafts.has(key)) drafts.set(key, updated);
      }
    }} />

  </>;
}
