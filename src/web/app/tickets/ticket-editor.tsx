import { useState } from "react";
import type { Edits, ProjectResult, TaskiClient, TicketResult } from "../../../client/index.ts";
import { Button, Field, StatusMessage } from "../../components.tsx";
import { Conversation } from "./conversation.tsx";
import type { ConversationDraft } from "./conversation.tsx";
import { TicketAreaField } from "./ticket-area-field.tsx";
import { TicketAttachments } from "./ticket-attachments.tsx";
import { useTicketEdit } from "./use-ticket-edit.ts";
import type { Draft } from "./use-ticket-edit.ts";

export function TicketEditor({ initial, project, client, drafts, conversations, onSaved }: {
  initial: TicketResult<"full">; project: ProjectResult["project"]; client: TaskiClient;
  drafts: Map<string, Draft>; conversations: Map<string, ConversationDraft>;
  onSaved: (result?: TicketResult<"full">) => void;
}) {
  const { server, draft, busy, conflict, notice, error, change, save, reload, acceptConversationUpdate } =
    useTicketEdit({ initial, client, drafts, onSaved });
  const [updatingConversation, setUpdatingConversation] = useState(false);
  const editorBusy = busy || updatingConversation;
  const key = server.ticket.key;
  const feedback = server.ticket.type === "feedback";
  const pendingConversion = draft.pending?.changes?.type === "task";
  const pendingArea = !!draft.pending && !pendingConversion;
  const areaChanged = draft.edits.areaId !== server.ticket.areaId;
  const author = project?.members.find((member) => member.id === server.ticket.createdBy)?.name ?? server.ticket.createdBy;
  const refresh = <Button variant="secondary" disabled={editorBusy || !!draft.pending} onClick={() => {
    if (!drafts.has(key) || confirm("¿Descartar el borrador y cargar la versión actual?")) void reload(false);
  }}>Actualizar detalle</Button>;
  const feedbackManagement = <>
    <form className="feedback-area" onSubmit={(event) => {
      event.preventDefault();
      if (!editorBusy && !pendingConversion && draft.edits.areaId && (pendingArea || areaChanged)) {
        save({ areaId: draft.edits.areaId });
      }
    }}>
      <TicketAreaField id="feedback-area" label="Área del feedback" areas={project?.areas ?? []}
        value={draft.edits.areaId} disabled={editorBusy || !!draft.pending || !project}
        onChange={(areaId) => change({ areaId })} />
      <Button type="submit" variant="secondary" disabled={editorBusy || conflict || pendingConversion || (!pendingArea && !areaChanged)}>
        {pendingArea && busy ? "Guardando…" : pendingArea ? "Reintentar área" : "Guardar área"}
      </Button>
    </form>
    <div className="feedback-tools">
      <Button variant="secondary" disabled={editorBusy || conflict || pendingArea} onClick={() => save({ ...draft.changes, type: "task" })}>
        {pendingConversion ? "Reintentar conversión" : "Convertir en tarea"}
      </Button>
      {refresh}
    </div>
  </>;
  return <>
    {!feedback && <p className="ticket-type">{project?.typeLabels?.task ?? "Tarea"}</p>}
    {feedback ? <div className="feedback-detail">
      <h2 className="editor-title">{server.ticket.title}</h2>
      <p className="detail-origin">Compartido por {author}</p>
      {server.ticket.description && <p className="description">{server.ticket.description}</p>}
    </div> : <form className="ticket-editor" onSubmit={(event) => { event.preventDefault(); if (!editorBusy) save(draft.changes); }}>
      <fieldset disabled={editorBusy || !!draft.pending}>
        <div className="editor-title-field">
          <label htmlFor="ticket-title" className="visually-hidden">Título</label>
          <textarea id="ticket-title" className="editor-title" rows={2} maxLength={240} required
            value={draft.edits.title ?? ""} onChange={(e) => change({ title: e.target.value })} />
        </div>
        <div className="editor-metadata">
          <div><label htmlFor="status">Estado</label>
            <select id="status" value={draft.edits.status} onChange={(e) => change({ status: e.target.value as NonNullable<Edits["status"]> })}>
              {Object.entries(project?.statusLabels ?? {}).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <div><label htmlFor="assignee">Responsable</label>
            <select id="assignee" value={draft.edits.assigneeId ?? ""} onChange={(e) => change({ assigneeId: e.target.value || null })}>
              <option value="">Sin asignar</option>{project?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <TicketAreaField id="ticket-area" label="Área de la tarea" areas={project?.areas ?? []}
            value={draft.edits.areaId} onChange={(areaId) => change({ areaId })} />
        </div>
        <label htmlFor="description">Descripción</label>
        <textarea id="description" className="editor-description" placeholder="Añade contexto…" value={draft.edits.description ?? ""} onChange={(e) => change({ description: e.target.value })} />
        <div className="editor-pr">
          {server.ticket.prUrl && <p><a href={server.ticket.prUrl} target="_blank" rel="noreferrer">Abrir PR vinculado <span aria-hidden="true">↗</span></a></p>}
          <Field label="Enlace al PR" type="url" inputMode="url" maxLength={1000} placeholder="https://github.com/equipo/proyecto/pull/42"
            value={draft.edits.prUrl ?? ""} onChange={(e) => change({ prUrl: e.target.value.trim() || null })} />
        </div>
      </fieldset>
      <div className="editor-footer">
        <p className="detail-origin">Creada por {author} · v{server.ticket.version}</p>
        <Button type="submit" variant="primary" disabled={editorBusy || conflict || (!draft.pending && !Object.keys(draft.changes).length)}>
          {busy ? "Guardando…" : draft.pending ? "Reintentar guardado" : "Guardar cambios"}
        </Button>
      </div>
    </form>}
    {drafts.has(key) && <p>Borrador conservado en esta pestaña.</p>}
    {error && <StatusMessage tone="error" title={error} />}
    {conflict && <><p>Versión consultada: {server.ticket.title}. Tu título propuesto: {draft.edits.title}.</p><Button variant="secondary" disabled={editorBusy} onClick={() => void reload(true)}>Consultar versión actual y conservar borrador</Button></>}
    {!feedback && refresh}
    {notice && <StatusMessage title={notice} />}
    <TicketAttachments client={client} ticketKey={key} />
    <Conversation result={server} client={client} cache={conversations} disabled={busy || !!draft.pending}
      management={feedback ? feedbackManagement : undefined} openManagement={drafts.has(key) || conversations.get(key)?.highlight !== undefined}
      onUpdated={acceptConversationUpdate} onMutationPending={setUpdatingConversation} />
  </>;
}
