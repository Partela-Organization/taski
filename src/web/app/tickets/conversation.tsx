import { mutationKey } from "../shared/mutation-key.ts";
import { useEffect, useState } from "react";
import { TaskiClient, TaskiClientError } from "../../../client/index.ts";
import type { Activity, TicketResult, UpdateTicket } from "../../../client/index.ts";
import { Button, StatusMessage } from "../../components.tsx";

const timeLabel = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

export interface ConversationDraft { body: string; pending?: UpdateTicket; highlight?: boolean }
export function Conversation({ result, client, cache, disabled, onUpdated, onMutationPending }: {
  result: TicketResult<"full">; client: TaskiClient; cache: Map<string, ConversationDraft>; disabled: boolean;
  onUpdated: (result: TicketResult<"full">) => void;
  onMutationPending: (pending: boolean) => void;
}) {
  const key = result.ticket.key;
  const labels: Record<string, string> = { title: "Título", description: "Descripción", status: "Estado", assigneeId: "Responsable", areaId: "Área", highlighted: "Resaltado", comment: "Comentario", prUrl: "PR", type: "Tipo" };
  const changeText = (value: unknown) => {
    if (value && typeof value === "object" && "before" in value && "after" in value) return `Antes: ${JSON.stringify(value.before)} · Después: ${JSON.stringify(value.after)}`;
    return JSON.stringify(value);
  };
  const [draft, setDraft] = useState<ConversationDraft>(() => cache.get(key) ?? { body: "" });
  const [comments, setComments] = useState(result.comments), [commentCursor, setCommentCursor] = useState(result.nextCommentsCursor);
  const [activity, setActivity] = useState<Activity[]>([]), [cursor, setCursor] = useState<string>(), [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => { setComments(result.comments); setCommentCursor(result.nextCommentsCursor); }, [result]);
  useEffect(() => {
    let active = true; setActivity([]); setCursor(undefined); setHasMore(false);
    void client.listActivity({ ticketKey: key, limit: 10 }).then((page) => {
      if (active) { setActivity(page.items); setCursor(page.nextCursor); setHasMore(page.hasMore); }
    }).catch(() => { if (active) setError("Actividades no disponibles. Puedes actualizar para reintentar."); });
    return () => { active = false; };
  }, [key, revision]);
  async function mutate(highlight?: boolean) {
    if (busy || disabled) return;
    const pending = draft.pending ?? { expectedVersion: result.ticket.version, idempotencyKey: mutationKey(),
      ...(highlight !== undefined ? { changes: { highlighted: highlight } } : { comment: draft.body }) };
    const next = { ...draft, pending, ...(highlight !== undefined ? { highlight } : {}) };
    setDraft(next); cache.set(key, next); setBusy(true); setError("");
    onMutationPending(true);
    let committed = false;
    try {
      await client.updateTicket(key, pending);
      committed = true;
      const clean = { body: pending.comment ? "" : draft.body }; setDraft(clean);
      if (clean.body) cache.set(key, clean); else cache.delete(key);
      const fresh = await client.getTicket(key, { view: "full", commentsLimit: 5 }); onUpdated(fresh); setRevision((n) => n + 1);
    } catch (e) {
      if (committed) { setError("Cambio guardado. Actualiza el detalle para consultar la versión confirmada."); return; }
      if (e instanceof TaskiClientError && e.status >= 400 && e.status < 500) {
        const clean = { body: draft.body }; setDraft(clean); if (clean.body) cache.set(key, clean); else cache.delete(key);
        if (e.status === 409) {
          try { onUpdated(await client.getTicket(key, { view: "full", commentsLimit: 5 })); } catch { /* Keep text even if recovery read fails. */ }
        }
      }
      setError(e instanceof TaskiClientError && e.status === 409 ? "La tarea cambió. Revisa la versión actual y vuelve a enviar; tu comentario se conserva." : "No se pudo confirmar el cambio. El texto se conserva; actualiza el detalle si la escritura ya se confirmó.");
    } finally { setBusy(false); onMutationPending(false); }
  }
  return <section className="conversation" aria-label="Conversación y actividad">
    <div className="conversation-heading"><h3>Conversación</h3>
    <Button variant="secondary" disabled={busy || disabled || !!draft.pending} aria-pressed={result.ticket.highlighted} onClick={() => void mutate(!result.ticket.highlighted)}>{result.ticket.highlighted ? "Quitar resaltado" : "Resaltar tarea"}</Button></div>
    {comments.map((c) => <article key={c.id}><p>{c.actor.name} · {c.actor.kind} · {c.actor.channel}</p><p className="description">{c.body}</p><time dateTime={c.createdAt}>{timeLabel.format(new Date(c.createdAt))}</time></article>)}
    {commentCursor && <Button variant="secondary" disabled={busy} onClick={() => {
      setBusy(true); void client.getTicket(key, { view: "full", commentsLimit: 5, commentsCursor: commentCursor }).then((page) => {
        setComments((old) => [...old, ...page.comments.filter((c) => !old.some((v) => v.id === c.id))]); setCommentCursor(page.nextCommentsCursor);
      }).catch(() => setError("No se pudieron cargar comentarios anteriores.")).finally(() => setBusy(false));
    }}>Comentarios anteriores</Button>}
    <form className="comment-composer" onSubmit={(e) => { e.preventDefault(); if (draft.body.trim() || draft.pending) void mutate(draft.highlight); }}>
      <label htmlFor="comment">Comentario</label><textarea id="comment" placeholder="Deja una nota para el equipo…" rows={2} value={draft.body} disabled={busy || !!draft.pending} onChange={(e) => {
        const next = { body: e.target.value }; setDraft(next); if (next.body) cache.set(key, next); else cache.delete(key);
      }} />
      <Button variant="secondary" type="submit" disabled={busy || disabled || (!draft.body.trim() && !draft.pending)}>{draft.pending ? "Reintentar cambio" : "Enviar comentario"}</Button>
    </form>
    {error && <StatusMessage tone="error" title={error} />}
    <h3>Actividad</h3>
    <ol className="activity-timeline">{activity.map((event) => <li key={event.seq}><p>{event.actor.name} · {event.actor.kind} · {event.actor.channel} · v{event.ticketVersion}</p>
      <time dateTime={event.createdAt}>{timeLabel.format(new Date(event.createdAt))}</time>
      <dl>{Object.entries(event.changes).map(([field, value]) => <div key={field}><dt>{labels[field] ?? field}</dt><dd className="description">{changeText(value)}</dd></div>)}</dl>
    </li>)}</ol>
    {hasMore && <Button variant="secondary" disabled={busy} onClick={() => {
      setBusy(true); void client.listActivity({ ticketKey: key, limit: 10, ...(cursor ? { cursor } : {}) }).then((page) => {
        setActivity((old) => [...old, ...page.items.filter((v) => !old.some((a) => a.seq === v.seq))]); setCursor(page.nextCursor); setHasMore(page.hasMore);
      }).catch(() => setError("No se pudo cargar la siguiente página de actividad.")).finally(() => setBusy(false));
    }}>Más actividad</Button>}
    <Button variant="secondary" disabled={busy} onClick={() => { setError(""); setRevision((n) => n + 1); }}>Actualizar actividad</Button>
  </section>;
}
