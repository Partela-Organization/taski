import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { TaskiClientError } from "../../../client/index.ts";
import type { HorizonBlock, HorizonStatus, HorizonSummary, ProjectResult, TaskiClient } from "../../../client/index.ts";
import { Button, StatusMessage } from "../../components.tsx";
import { operationError } from "../access/use-team-session.ts";
import { WorkspaceIcon } from "../shared/marks.tsx";
import { mutationKey } from "../shared/mutation-key.ts";
import { BlockEditor, BlockView, newBlock } from "./block-editor.tsx";
import { useHorizonDoc } from "./use-horizon.ts";
import type { SaveState } from "./use-horizon.ts";

export const statusLabels: Record<HorizonStatus, string> = { exploring: "Explorando", planned: "Planificado", idea: "Idea", archived: "Archivado" };
const statusOrder: HorizonStatus[] = ["exploring", "planned", "idea", "archived"];
const ago = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

function relative(iso: string): string {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return ago.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return ago.format(hours, "hour");
  return ago.format(Math.round(hours / 24), "day");
}

const templates: Record<string, { label: string; blocks: () => HorizonBlock[] }> = {
  blank: { label: "En blanco", blocks: () => [newBlock()] },
  idea: { label: "Idea", blocks: () => [newBlock("h2", "Qué queremos lograr"), newBlock(), newBlock("h2", "Cómo funcionaría"), newBlock(),
    newBlock("h2", "Qué hace falta"), newBlock("todo"), newBlock("h2", "Preguntas abiertas"), newBlock("li")] },
  research: { label: "Investigación", blocks: () => [newBlock("h2", "Contexto"), newBlock(), newBlock("h2", "Hallazgos"), newBlock("li"),
    newBlock("h2", "Recomendación"), newBlock(), newBlock("h2", "Próximos pasos"), newBlock("todo")] },
};

function createError(failure: unknown, onExpired: () => void): string {
  return failure instanceof TaskiClientError && failure.status === 400 ? "Revisa el título y el contenido." : operationError(failure, onExpired);
}

/** Create from a title and a template, or import Markdown (pasted or from a .md file). */
function NewDocument({ client, onCreated, onExpired }: { client: TaskiClient; onCreated: (id: string) => void; onExpired: () => void }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("idea");
  const [markdown, setMarkdown] = useState("");
  const [fileTitle, setFileTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importError, setImportError] = useState("");
  const pending = useRef<{ key: string; signature: string } | undefined>(undefined);

  // A retry after a lost response reuses the key, so the document is not created twice.
  function key(signature: string) {
    if (pending.current?.signature !== signature) pending.current = { key: mutationKey(), signature };
    return pending.current.key;
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !title.trim()) { setError(title.trim() ? "" : "Escribe un título."); return; }
    setBusy(true); setError("");
    const blocks = templates[template]!.blocks();
    try {
      const receipt = await client.createHorizon({ title: title.trim(), blocks, idempotencyKey: key(`create:${title}:${template}`) });
      pending.current = undefined; setTitle(""); onCreated(receipt.id);
    } catch (failure) { setError(createError(failure, onExpired)); } finally { setBusy(false); }
  }
  async function importMarkdown(event: FormEvent) {
    event.preventDefault();
    if (busy || !markdown.trim()) { setImportError("Pega Markdown o elige un archivo .md."); return; }
    setBusy(true); setImportError("");
    const hasTitle = /^\s*#\s+\S/.test(markdown);
    try {
      const receipt = await client.createHorizon({ markdown, ...(hasTitle ? {} : { title: fileTitle || "Documento importado" }),
        idempotencyKey: key(`import:${markdown.length}:${markdown.slice(0, 200)}`) });
      pending.current = undefined; setMarkdown(""); setFileTitle(""); dialog.current?.close(); onCreated(receipt.id);
    } catch (failure) { setImportError(createError(failure, onExpired)); } finally { setBusy(false); }
  }

  return <>
    <form className="hz-new" onSubmit={(event) => void create(event)}>
      <label htmlFor={`${id}-title`} className="visually-hidden">Título del nuevo documento</label>
      <input id={`${id}-title`} value={title} placeholder="Nuevo documento: una idea, un plan, una investigación…" maxLength={160}
        onChange={(event) => setTitle(event.target.value)} />
      <label htmlFor={`${id}-template`} className="visually-hidden">Plantilla</label>
      <select id={`${id}-template`} value={template} onChange={(event) => setTemplate(event.target.value)}>
        {Object.entries(templates).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <Button type="submit" variant="primary" disabled={busy}><WorkspaceIcon name="plus" />Crear</Button>
      <Button variant="secondary" aria-haspopup="dialog" onClick={() => { setImportError(""); dialog.current?.showModal(); }}>
        <WorkspaceIcon name="upload" />Importar Markdown
      </Button>
      {error && <p className="hz-error" role="alert">{error}</p>}
    </form>
    <dialog ref={dialog} className="hz-import" aria-labelledby={`${id}-import-title`}>
      <form onSubmit={(event) => void importMarkdown(event)}>
        <h2 id={`${id}-import-title`}>Importar Markdown</h2>
        <p>Pega una nota (por ejemplo, del vault) o elige un archivo. Un <code># Título</code> al principio se usa como título.</p>
        <label htmlFor={`${id}-file`}>Archivo .md</label>
        <input id={`${id}-file`} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setMarkdown(await file.text());
          setFileTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 160));
        }} />
        <label htmlFor={`${id}-markdown`}>Markdown</label>
        <textarea id={`${id}-markdown`} rows={12} value={markdown} onChange={(event) => setMarkdown(event.target.value)} />
        {importError && <p className="hz-error" role="alert">{importError}</p>}
        <div className="hz-import__actions">
          <Button variant="secondary" onClick={() => dialog.current?.close()}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy}>Importar</Button>
        </div>
      </form>
    </dialog>
  </>;
}

export function HorizonList({ client, items, error, project, onOpen, onRefresh, onExpired }: {
  client: TaskiClient; items: HorizonSummary[] | undefined; error: string; project: ProjectResult["project"];
  onOpen: (id: string) => void; onRefresh: () => void; onExpired: () => void;
}) {
  const [area, setArea] = useState("");
  const areas = project?.areas ?? [];
  const label = (areaId: string | null) => areas.find((entry) => entry.id === areaId)?.label;
  const visible = (items ?? []).filter((item) => !area || item.areaId === area);
  const name = (memberId: string) => project?.members.find((member) => member.id === memberId)?.name ?? memberId;
  return <div className="hz">
    <p className="hz-intro">Ideas, investigaciones y planes que todavía no son tareas. Cuando una madura, conviértela en un track.</p>
    <NewDocument client={client} onExpired={onExpired} onCreated={(id) => { onRefresh(); onOpen(id); }} />
    <div className="hz-filters">
      <label htmlFor="hz-area">Track</label>
      <select id="hz-area" value={area} onChange={(event) => setArea(event.target.value)}>
        <option value="">Todos los tracks</option>
        {areas.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select>
    </div>
    {error && <StatusMessage tone="error" title={error}><Button variant="secondary" onClick={onRefresh}>Reintentar</Button></StatusMessage>}
    {!items && !error && <StatusMessage tone="loading" title="Cargando Horizonte…" />}
    {items && !visible.length && <StatusMessage title={area ? "No hay documentos de este track." : "Todavía no hay documentos. Crea el primero o importa una nota."} />}
    {statusOrder.map((status) => {
      const group = visible.filter((item) => item.status === status);
      if (!group.length) return null;
      const cards = <ul className="hz-cards">{group.map((item) =>
        <li key={item.id} className="hz-card">
          <button type="button" className="hz-card__open" onClick={() => onOpen(item.id)}>{item.title}</button>
          {item.excerpt && <p className="hz-card__excerpt">{item.excerpt}</p>}
          <p className="hz-card__meta">
            {label(item.areaId) && <span className="hz-chip">{label(item.areaId)}</span>}
            {item.tasks.total > 0 && <span>{item.tasks.done}/{item.tasks.total} tareas</span>}
            <span>{name(item.updatedBy)} · {relative(item.updatedAt)}</span>
          </p>
        </li>)}</ul>;
      return status === "archived"
        ? <details key={status} className="hz-group"><summary>{statusLabels[status]} <span className="group-count">{group.length}</span></summary>{cards}</details>
        : <section key={status} className="hz-group" aria-label={statusLabels[status]}>
          <h2>{statusLabels[status]} <span className="group-count">{group.length}</span></h2>{cards}</section>;
    })}
  </div>;
}

const saveLabels: Record<SaveState, string> = {
  saved: "Guardado", pending: "Cambios sin guardar…", saving: "Guardando…", retrying: "Sin respuesta; reintentando el mismo cambio…",
  conflict: "Conflicto de versión", error: "No se pudo guardar",
};

export function HorizonDocPage({ client, id, project, onBack, onSaved, onDeleted, onExpired }: {
  client: TaskiClient; id: string; project: ProjectResult["project"];
  onBack: () => void; onSaved: () => void; onDeleted: () => void; onExpired: () => void;
}) {
  const doc = useHorizonDoc(client, id, onExpired, onSaved);
  const [mode, setMode] = useState<"read" | "edit">();
  // Chosen once when the document opens; typing the first paragraph must not switch to read mode.
  const initialMode = useRef<"read" | "edit" | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const confirm = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteKey = useRef(mutationKey());
  const fieldId = useId();

  if (!doc.draft || !doc.meta) {
    return doc.error ? <StatusMessage tone="error" title={doc.error}><Button variant="secondary" onClick={onBack}>Volver a Horizonte</Button></StatusMessage>
      : <StatusMessage tone="loading" title="Abriendo documento…" />;
  }
  const { draft, meta } = doc;
  // Headings alone (a fresh template) still count as empty: the document opens ready to write.
  const empty = !draft.blocks.some((block) => block.text.trim() && !["h1", "h2", "h3", "divider"].includes(block.type));
  initialMode.current ??= empty ? "edit" : "read";
  const shown = mode ?? initialMode.current;
  const name = (memberId: string) => project?.members.find((member) => member.id === memberId)?.name ?? memberId;

  async function copyMarkdown() {
    try {
      const text = client.getHorizonMarkdown(id).then((result) => result.doc.markdown);
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((value) => new Blob([value], { type: "text/plain" })) })]);
      } else await navigator.clipboard.writeText(await text);
      setNotice("Markdown copiado.");
    } catch { setNotice("No se pudo copiar el Markdown."); }
  }
  async function remove() {
    setDeleting(true);
    try {
      await client.deleteHorizon(id, { expectedVersion: meta.version, idempotencyKey: deleteKey.current });
      confirm.current?.close();
      onDeleted();
    } catch (failure) {
      setNotice(failure instanceof TaskiClientError && failure.status === 409 ? "El documento cambió; vuelve a abrirlo antes de eliminarlo."
        : failure instanceof TaskiClientError && failure.status === 403 ? "Solo una persona del equipo puede eliminar documentos." : operationError(failure, onExpired));
      confirm.current?.close();
      deleteKey.current = mutationKey();
    } finally { setDeleting(false); }
  }

  return <article className="hz-doc" aria-labelledby={`${fieldId}-heading`}>
    <div className="hz-doc__bar">
      <Button className="track-back" onClick={onBack}>← Horizonte</Button>
      <span className="hz-doc__state" data-state={doc.state} role="status">{saveLabels[doc.state]}</span>
      <div className="presentation-control" role="group" aria-label="Modo">
        <Button aria-pressed={shown === "read"} onClick={() => setMode("read")}>Leer</Button>
        <Button aria-pressed={shown === "edit"} onClick={() => setMode("edit")}>Editar</Button>
      </div>
      <Button variant="secondary" onClick={() => void copyMarkdown()}><WorkspaceIcon name="copy" />Copiar Markdown</Button>
      <Button variant="secondary" aria-haspopup="dialog" onClick={() => { confirm.current?.showModal(); cancel.current?.focus(); }}>
        <WorkspaceIcon name="trash" />Eliminar
      </Button>
    </div>
    {notice && <StatusMessage title={notice} />}
    {(doc.state === "conflict" || doc.state === "error") && <StatusMessage tone="error" title={doc.error}>
      {doc.state === "conflict" ? <>
        <Button variant="secondary" onClick={() => void doc.keepMine()}>Guardar mi versión encima</Button>
        <Button variant="secondary" onClick={() => void doc.reload()}>Descartar mis cambios</Button>
      </> : <Button variant="secondary" onClick={doc.retry}>Reintentar</Button>}
    </StatusMessage>}
    <h1 id={`${fieldId}-heading`} className="visually-hidden">{draft.title || "Sin título"}</h1>
    <label htmlFor={`${fieldId}-title`} className="visually-hidden">Título del documento</label>
    <textarea id={`${fieldId}-title`} className="hz-doc__title" rows={1} maxLength={160} value={draft.title} placeholder="Sin título"
      onChange={(event) => doc.edit({ title: event.target.value.replace(/\n/g, " ") })} />
    <div className="hz-doc__props">
      <label htmlFor={`${fieldId}-status`}>Estado</label>
      <select id={`${fieldId}-status`} value={draft.status} onChange={(event) => doc.edit({ status: event.target.value as HorizonStatus })}>
        {statusOrder.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
      </select>
      <label htmlFor={`${fieldId}-area`}>Track</label>
      <select id={`${fieldId}-area`} value={draft.areaId ?? ""} onChange={(event) => doc.edit({ areaId: event.target.value || null })}>
        <option value="">Sin track</option>
        {(project?.areas ?? []).map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
      </select>
      <span className="hz-doc__meta">Creado por {name(meta.createdBy)} · editado por {name(meta.updatedBy)} {relative(meta.updatedAt)}</span>
    </div>
    {shown === "read"
      ? <BlockView blocks={draft.blocks} />
      : <BlockEditor blocks={draft.blocks.length ? draft.blocks : [newBlock()]} onChange={(blocks) => doc.edit({ blocks })} />}
    <dialog ref={confirm} className="ticket-delete-dialog" role="alertdialog" aria-labelledby={`${fieldId}-delete`} aria-describedby={`${fieldId}-delete-body`}>
      <h3 id={`${fieldId}-delete`}>¿Eliminar el documento?</h3>
      <p id={`${fieldId}-delete-body`}><strong>{draft.title}</strong> dejará de verse en Horizonte. El historial se conserva.</p>
      <div className="ticket-delete-actions">
        <Button ref={cancel} variant="secondary" disabled={deleting} onClick={() => confirm.current?.close()}>Cancelar</Button>
        <Button variant="primary" className="ticket-delete-confirm" disabled={deleting} onClick={() => void remove()}>{deleting ? "Eliminando…" : "Eliminar"}</Button>
      </div>
    </dialog>
  </article>;
}
