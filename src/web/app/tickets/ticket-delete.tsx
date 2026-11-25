import { useId, useRef, useState } from "react";
import { TaskiClientError } from "../../../client/index.ts";
import type { FullTicket, Mutation, TaskiClient } from "../../../client/index.ts";
import { Button, StatusMessage } from "../../components.tsx";
import { operationError } from "../access/use-team-session.ts";
import { WorkspaceIcon } from "../shared/marks.tsx";

export function TicketDelete({ ticket, client, onDeleted, onReload, onExpired }: {
  ticket: FullTicket;
  client: TaskiClient;
  onDeleted: () => void;
  onReload: () => void;
  onExpired: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const attempt = useRef<Mutation>(undefined);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const subject = ticket.type === "feedback" ? "el feedback" : "la tarea";

  async function remove() {
    setBusy(true);
    setError("");
    attempt.current ??= { expectedVersion: ticket.version, idempotencyKey: crypto.randomUUID() };
    try {
      await client.deleteTicket(ticket.key, attempt.current);
      onDeleted();
    } catch (failure) {
      if (failure instanceof TaskiClientError && failure.code === "NOT_FOUND") onDeleted();
      else if (failure instanceof TaskiClientError && failure.code === "VERSION_CONFLICT") {
        setConflict(true);
        setError("La entrada cambió. Actualiza el detalle antes de eliminarla.");
      } else setError(operationError(failure, onExpired));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button ref={trigger} variant="secondary" className="ticket-delete-trigger" aria-label={`Eliminar ${subject}`}
      aria-haspopup="dialog" onClick={() => { dialog.current?.showModal(); cancel.current?.focus(); }}>
      <WorkspaceIcon name="trash" />Eliminar
    </Button>
    <dialog ref={dialog} className="ticket-delete-dialog" role="alertdialog" aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`} onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={() => trigger.current?.focus()}>
      <h3 id={`${id}-title`}>¿Eliminar {subject}?</h3>
      <p id={`${id}-description`}><strong>{ticket.title}</strong> desaparecerá de las listas del equipo. Su enlace, comentarios y adjuntos dejarán de estar disponibles.</p>
      {error && <StatusMessage tone="error" title={error} />}
      <div className="ticket-delete-actions">
        <Button ref={cancel} variant="secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancelar</Button>
        {conflict ? <Button variant="primary" onClick={onReload}>Actualizar detalle</Button>
          : <Button variant="primary" className="ticket-delete-confirm" disabled={busy} onClick={() => void remove()}>
            {busy ? "Eliminando…" : "Eliminar"}
          </Button>}
      </div>
    </dialog>
  </>;
}
