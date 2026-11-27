import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { HorizonSummary, ProjectResult, TaskiClient, TrackSummary, WorkSummary } from "../../../client/index.ts";
import { Button } from "../../components.tsx";
import { operationError } from "../access/use-team-session.ts";
import { healthLabels } from "../summary/format.ts";
import { WorkspaceIcon } from "../shared/marks.tsx";

export interface GoToHandle { open: () => void }
type Result = { kind: "track"; track: TrackSummary } | { kind: "doc"; doc: HorizonSummary } | { kind: "ticket"; ticket: WorkSummary };

/** Accent- and case-insensitive match for track names typed in Spanish. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
}

/**
 * "Ir a…" palette: tracks are filtered locally, tickets are searched on the server across the whole project.
 * A native modal dialog provides the focus trap and Escape; the input follows the combobox pattern.
 */
export const GoTo = forwardRef<GoToHandle, {
  client: TaskiClient; tracks: readonly TrackSummary[]; docs?: readonly HorizonSummary[] | undefined; project: ProjectResult["project"];
  onTrack: (id: string) => void; onTicket: (key: string) => void; onDoc?: (id: string) => void; onExpired: () => void;
}>(function GoTo({ client, tracks, docs = [], project, onTrack, onTicket, onDoc, onExpired }, ref) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<WorkSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();

  useImperativeHandle(ref, () => ({
    open() {
      if (dialog.current?.open) { input.current?.select(); return; }
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuery(""); setTickets([]); setError(""); setActive(0);
      dialog.current?.showModal();
      input.current?.focus();
    },
  }), []);

  const term = query.trim();
  useEffect(() => {
    if (!term) { setTickets([]); setSearching(false); setError(""); return; }
    let current = true;
    setSearching(true);
    const timer = setTimeout(() => {
      client.listTickets({ query: term, view: "work", order: "recent", limit: 8 }).then((page) => {
        if (current) { setTickets(page.items); setError(""); }
      }, (failure) => {
        if (current) { setTickets([]); setError(operationError(failure, onExpired)); }
      }).finally(() => { if (current) setSearching(false); });
    }, 180);
    return () => { current = false; clearTimeout(timer); };
  }, [client, term, onExpired]);

  const wanted = normalize(term);
  const trackResults = tracks.filter((track) => !wanted || normalize(track.label).includes(wanted));
  // Horizonte documents appear only when searching, so the palette opens on the short track list.
  const docResults = wanted ? docs.filter((doc) => normalize(`${doc.title} ${doc.excerpt}`).includes(wanted)).slice(0, 5) : [];
  const results: Result[] = [...trackResults.map((track) => ({ kind: "track" as const, track })),
    ...docResults.map((doc) => ({ kind: "doc" as const, doc })),
    ...tickets.map((ticket) => ({ kind: "ticket" as const, ticket }))];
  const selected = Math.min(active, Math.max(0, results.length - 1));
  const optionId = (index: number) => `${id}-option-${index}`;

  function choose(result: Result | undefined) {
    if (!result) return;
    returnFocus.current = null;
    dialog.current?.close();
    if (result.kind === "track") onTrack(result.track.id);
    else if (result.kind === "doc") onDoc?.(result.doc.id);
    else onTicket(result.ticket.key);
  }

  const statusLabel = (ticket: WorkSummary) => project?.statusLabels[ticket.status] ?? ticket.status;
  const announcement = !term ? `${trackResults.length} tracks` : searching ? "Buscando…"
    : `${trackResults.length} ${trackResults.length === 1 ? "track" : "tracks"}, ${docResults.length} ${docResults.length === 1 ? "documento" : "documentos"} y ${tickets.length} ${tickets.length === 1 ? "ticket" : "tickets"}`;

  const option = (result: Result, index: number) => {
    const isActive = index === selected;
    const common = { id: optionId(index), role: "option", "aria-selected": isActive, className: "go-to__option",
      onMouseMove: () => setActive(index), onClick: () => choose(result) } as const;
    if (result.kind === "track") {
      const { track } = result;
      return <li key={`track-${track.id}`} {...common}>
        <span className={`track-priority track-priority--${track.priority}`}>P{track.priority}</span>
        <span className="go-to__title">{track.label}</span>
        <span className="sidebar-tracks__bar" data-health={track.health} aria-hidden="true"><span style={{ width: `${track.percent}%` }} /></span>
        <span className="go-to__meta">{track.percent}% · {healthLabels[track.health]}</span>
      </li>;
    }
    if (result.kind === "doc") {
      const { doc } = result;
      return <li key={`doc-${doc.id}`} {...common}>
        <WorkspaceIcon name="horizon" />
        <span className="go-to__title">{doc.title}</span>
        <span className="go-to__meta">Horizonte</span>
      </li>;
    }
    const { ticket } = result;
    return <li key={`ticket-${ticket.key}`} {...common}>
      <span className="go-to__key">{ticket.key}</span>
      <span className="go-to__title">{ticket.title}</span>
      <span className="go-to__meta">{ticket.type === "feedback" ? project?.typeLabels.feedback ?? "Feedback" : statusLabel(ticket)}</span>
    </li>;
  };

  return <dialog ref={dialog} className="go-to" aria-labelledby={`${id}-title`}
    onClose={() => { returnFocus.current?.focus(); returnFocus.current = null; }}
    onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
    <h2 id={`${id}-title`} className="visually-hidden">Ir a un track o ticket</h2>
    <div className="go-to__field">
      <WorkspaceIcon name="search" />
      <input ref={input} type="text" role="combobox" aria-expanded={results.length > 0} aria-controls={`${id}-list`}
        aria-activedescendant={results.length ? optionId(selected) : undefined} aria-autocomplete="list"
        aria-label="Buscar track o ticket" placeholder="Busca un track, documento, código o título…" value={query} autoComplete="off"
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActive(results.length ? (selected + 1) % results.length : 0); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive(results.length ? (selected - 1 + results.length) % results.length : 0); }
          else if (event.key === "Enter") { event.preventDefault(); choose(results[selected]); }
        }} />
      <Button variant="secondary" className="go-to__close" onClick={() => dialog.current?.close()}>Esc</Button>
    </div>
    <div id={`${id}-list`} role="listbox" aria-label="Resultados" className="go-to__results">
      {trackResults.length > 0 && <ul role="group" aria-labelledby={`${id}-tracks`}>
        <li role="presentation" id={`${id}-tracks`} className="go-to__group">Tracks</li>
        {results.map((result, index) => result.kind === "track" ? option(result, index) : null)}
      </ul>}
      {docResults.length > 0 && <ul role="group" aria-labelledby={`${id}-docs`}>
        <li role="presentation" id={`${id}-docs`} className="go-to__group">Horizonte</li>
        {results.map((result, index) => result.kind === "doc" ? option(result, index) : null)}
      </ul>}
      {tickets.length > 0 && <ul role="group" aria-labelledby={`${id}-tickets`}>
        <li role="presentation" id={`${id}-tickets`} className="go-to__group">Tareas y feedback</li>
        {results.map((result, index) => result.kind === "ticket" ? option(result, index) : null)}
      </ul>}
    </div>
    {term && !searching && !error && !results.length && <p className="go-to__empty">Sin coincidencias para «{term}».</p>}
    {!term && <p className="go-to__empty">Escribe para buscar tareas y feedback por código o título.</p>}
    {error && <p className="go-to__error" role="alert">{error}</p>}
    <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    <footer className="go-to__hints" aria-hidden="true">
      <span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>↵</kbd> abrir</span><span><kbd>Esc</kbd> cerrar</span>
      <span><kbd>1</kbd>–<kbd>9</kbd> track directo</span>
    </footer>
  </dialog>;
});

/** Sidebar trigger; the same palette opens with ⌘K or Ctrl+K. */
export function GoToButton({ onOpen, compact }: { onOpen: () => void; compact: boolean }) {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return <Button className="go-to-trigger" aria-haspopup="dialog" aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
    aria-label={compact ? "Buscar o ir a" : undefined} onClick={onOpen}>
    <WorkspaceIcon name="search" />
    {!compact && <><span>Buscar o ir a…</span><kbd aria-hidden="true">{mac ? "⌘K" : "Ctrl K"}</kbd></>}
  </Button>;
}
