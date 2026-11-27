import { useState } from "react";
import type { ProjectResult, ProjectSummary, TrackSummary } from "../../../client/index.ts";
import { Button, StatusMessage } from "../../components.tsx";
import { WorkspaceIcon } from "../shared/marks.tsx";
import { priorityLabels } from "../workspace/track-plan.tsx";
import { dueDate, healthLabels, longDate, plural, relativeDays, telegramMessage } from "./format.ts";
import type { SummaryModel } from "./use-summary.ts";

export type SummarySort = "priority" | "date";
const sortKey = "taski.summarySort";
function readSort(): SummarySort {
  try { if (localStorage.getItem(sortKey) === "date") return "date"; } catch { /* Storage may be restricted. */ }
  return "priority";
}
function saveSort(sort: SummarySort) {
  try { localStorage.setItem(sortKey, sort); } catch { /* The choice still applies in this tab. */ }
}

export interface SummaryNavigation {
  onOpenTrack: (areaId: string) => void;
  onOpenTicket: (key: string) => void;
  onReview: () => void;
  onFeedback: () => void;
}

/** Copy and refresh controls shown next to the page heading. */
export function SummaryActions({ model }: { model: SummaryModel }) {
  const [copied, setCopied] = useState<"" | "done" | "failed">("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(telegramMessage(model.text));
      setCopied("done");
    } catch { setCopied("failed"); }
  }
  return <div className="summary-actions">
    <Button variant="secondary" disabled={!model.text} onClick={() => void copy()}>
      <WorkspaceIcon name="send" />Copiar para Telegram
    </Button>
    <Button variant="secondary" aria-label="Actualizar resumen" disabled={model.loading} onClick={() => { setCopied(""); model.refresh(); }}>
      <WorkspaceIcon name="refresh" />Actualizar
    </Button>
    <span className="summary-actions__status" role="status">
      {copied === "done" ? "Copiado. Pégalo en Telegram." : copied === "failed" ? "No se pudo copiar. Selecciona el texto de abajo." : ""}
    </span>
  </div>;
}

function Bar({ track, large = false }: { track: Pick<TrackSummary, "done" | "inReview" | "total" | "health" | "percent" | "remaining">; large?: boolean }) {
  const share = (value: number) => `${track.total ? value / track.total * 100 : 0}%`;
  return <span className={`summary-bar${large ? " summary-bar--large" : ""}`} data-health={track.health} role="img"
    aria-label={`${track.percent}% terminado: ${track.done} de ${track.total}, ${track.inReview} por revisar, ${track.remaining} por hacer`}>
    <span className="summary-bar__done" style={{ width: share(track.done) }} />
    <span className="summary-bar__review" style={{ width: share(track.inReview) }} />
  </span>;
}

function HealthChip({ health }: { health: TrackSummary["health"] }) {
  return <span className="summary-health" data-health={health}><span aria-hidden="true" />{healthLabels[health]}</span>;
}

function Reminders({ summary, navigation }: { summary: ProjectSummary; navigation: SummaryNavigation }) {
  const urgent = summary.tracks
    .filter((track) => (track.health === "late" || track.health === "risk") && track.remaining + track.inReview > 0)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)).slice(0, 4);
  const reviewByTrack = summary.tracks.filter((track) => track.inReview > 0).map((track) => `${track.inReview} de ${track.label}`);
  const items = urgent.map((track) => {
    const parts = [plural(track.remaining, "por hacer", "por hacer")];
    if (track.inReview) parts.push(plural(track.inReview, "espera revisión", "esperan revisión"));
    if (track.next) parts.push(`siguiente: ${track.next.title}`);
    const title = track.health === "late"
      ? `${track.label} ${relativeDays(track.daysLeft)}`
      : `${track.label} se entrega el ${dueDate(track.targetDate!)} · ${relativeDays(track.daysLeft)}`;
    return { key: track.id, tone: track.health, title, detail: parts.join(" · "), onClick: () => navigation.onOpenTrack(track.id) };
  });
  if (summary.totals.inReview > 0) items.push({ key: "review", tone: "none", onClick: navigation.onReview,
    title: `${plural(summary.totals.inReview, "tarea espera", "tareas esperan")} revisión`, detail: reviewByTrack.join(", ") });
  if (summary.feedbackOpen > 0) items.push({ key: "feedback", tone: "none", onClick: navigation.onFeedback,
    title: `${plural(summary.feedbackOpen, "feedback sin marcar como hecho", "feedback sin marcar como hechos")}`, detail: "Ábrelo para revisarlo o marcarlo" });
  return <section className="summary-section" aria-labelledby="summary-now">
    <h2 id="summary-now">Lo que toca ahora</h2>
    {items.length ? <ul className="summary-reminders">{items.map((item) =>
      <li key={item.key}><button type="button" className="summary-reminder" data-tone={item.tone} onClick={item.onClick}>
        <strong>{item.title}</strong><span>{item.detail}</span>
      </button></li>)}</ul>
      : <p className="summary-empty">Nada urgente: ningún track está vencido o en riesgo y no hay revisiones pendientes.</p>}
  </section>;
}

function Stats({ summary }: { summary: ProjectSummary }) {
  const { totals, tracks } = summary;
  const flagged = tracks.filter((track) => track.health === "late" || track.health === "risk");
  const upcoming = tracks.filter((track) => track.daysLeft !== null && track.daysLeft >= 0 && track.remaining + track.inReview > 0)
    .sort((a, b) => a.daysLeft! - b.daysLeft!)[0];
  return <section className="summary-stats" aria-label="Cifras del proyecto">
    <div className="summary-stat">
      <span>Avance total</span><strong>{totals.percent}%</strong>
      <Bar track={{ ...totals, health: "none" }} />
      <span>{totals.done} de {plural(totals.total, "tarea terminada", "tareas terminadas")}</span>
    </div>
    <div className="summary-stat">
      <span>Cerradas en 7 días</span><strong>{summary.closedLast7Days.count}</strong>
      <span>{plural(totals.inReview, "tarea por revisar", "tareas por revisar")}</span>
    </div>
    <div className="summary-stat">
      <span>Tracks vencidos o en riesgo</span>
      <strong>{flagged.length} <small>de {tracks.length}</small></strong>
      <span>{flagged.length ? flagged.map((track) => track.label).join(", ") : "Todos en camino o sin fecha"}</span>
    </div>
    <div className="summary-stat">
      <span>Próxima entrega</span>
      <strong className="summary-stat__text">{upcoming ? upcoming.label : "Sin entregas próximas"}</strong>
      <span>{upcoming ? `${dueDate(upcoming.targetDate!)} · ${relativeDays(upcoming.daysLeft)}` : "Pon fechas a los tracks"}</span>
    </div>
  </section>;
}

function Tracks({ summary, navigation }: { summary: ProjectSummary; navigation: SummaryNavigation }) {
  const [sort, setSort] = useState<SummarySort>(readSort);
  const tracks = sort === "priority" ? summary.tracks : [...summary.tracks].sort((a, b) =>
    (a.targetDate ?? "9999-12-31").localeCompare(b.targetDate ?? "9999-12-31") || a.priority - b.priority);
  const choose = (next: SummarySort) => { setSort(next); saveSort(next); };
  return <section className="summary-section" aria-labelledby="summary-tracks">
    <div className="summary-section__heading">
      <h2 id="summary-tracks">Tracks</h2>
      <div className="presentation-control" role="group" aria-label="Ordenar tracks">
        <Button aria-pressed={sort === "priority"} onClick={() => choose("priority")}>Prioridad</Button>
        <Button aria-pressed={sort === "date"} onClick={() => choose("date")}>Fecha límite</Button>
      </div>
    </div>
    <ul className="summary-tracks">{tracks.map((track) =>
      <li key={track.id} className="summary-track">
        <span className={`track-priority track-priority--${track.priority}`} title={`Prioridad ${priorityLabels[track.priority].toLowerCase()}`}>
          P{track.priority}<span className="visually-hidden"> · prioridad {priorityLabels[track.priority].toLowerCase()}</span>
        </span>
        <div className="summary-track__main">
          <button type="button" className="summary-track__name" onClick={() => navigation.onOpenTrack(track.id)}>{track.label}</button>
          {track.next
            ? <button type="button" className="summary-track__next" onClick={() => navigation.onOpenTicket(track.next!.key)}>
              Siguiente: {track.next.title}</button>
            : <span className="summary-track__next">{track.total ? "Sin tareas pendientes" : "Sin tareas todavía"}</span>}
        </div>
        <div className="summary-track__date">
          <span>{track.targetDate ? dueDate(track.targetDate) : "Sin fecha"}</span>
          <span data-health={track.health}>{track.targetDate ? relativeDays(track.daysLeft) : "ponle una fecha"}</span>
        </div>
        <div className="summary-track__progress">
          <Bar track={track} />
          <span><span><strong>{track.percent}%</strong> · {track.done}/{track.total}</span><span>{track.remaining} por hacer</span></span>
        </div>
        <HealthChip health={track.health} />
      </li>)}
    </ul>
    <p className="summary-legend">
      <span><span className="summary-legend__swatch" data-part="done" />Terminado</span>
      <span><span className="summary-legend__swatch" data-part="review" />Por revisar</span>
      <span><span className="summary-legend__swatch" data-part="todo" />Por hacer</span>
      <span>El color sigue el estado del track.</span>
    </p>
  </section>;
}

function Recap({ summary, text, labels }: { summary: ProjectSummary; text: string; labels: Map<string, string> }) {
  const { items, count } = summary.closedLast7Days;
  return <div className="summary-recap">
    <section className="summary-section summary-card" aria-labelledby="summary-telegram">
      <h2 id="summary-telegram">Así sale en Telegram</h2>
      <pre className="summary-telegram">{text}</pre>
    </section>
    <section className="summary-section summary-card" aria-labelledby="summary-closed">
      <h2 id="summary-closed">Cerrado en los últimos 7 días</h2>
      {items.length ? <ul className="summary-closed">{items.map((item) =>
        <li key={item.key}><span aria-hidden="true">✓</span><span>{item.title}</span><span>{labels.get(item.areaId) ?? item.areaId}</span></li>)}
        {count > items.length && <li className="summary-closed__more">y {count - items.length} más</li>}
      </ul> : <p className="summary-empty">Todavía no se cerraron tareas esta semana.</p>}
    </section>
  </div>;
}

export function SummaryView({ model, project, navigation }: {
  model: SummaryModel; project: ProjectResult["project"]; navigation: SummaryNavigation;
}) {
  const { summary } = model;
  if (!summary) {
    return model.error ? <StatusMessage tone="error" title={model.error}>
      <Button variant="secondary" onClick={model.refresh}>Reintentar</Button>
    </StatusMessage> : <StatusMessage tone="loading" title="Cargando resumen…" />;
  }
  const labels = new Map(project?.areas.map(({ id, label }) => [id, label]));
  return <div className="summary" aria-busy={model.loading || undefined}>
    <p className="summary-date">{longDate(summary.today)}</p>
    {model.error && <StatusMessage tone="error" title={model.error} />}
    <Reminders summary={summary} navigation={navigation} />
    <Stats summary={summary} />
    <Tracks summary={summary} navigation={navigation} />
    <Recap summary={summary} text={model.text} labels={labels} />
  </div>;
}
