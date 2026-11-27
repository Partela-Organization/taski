import type { TrackSummary } from "../../../client/index.ts";
import { Button } from "../../components.tsx";
import { TrackPlanControl } from "../workspace/track-plan.tsx";
import type { TrackPlans } from "../workspace/use-track-plans.ts";
import { healthLabels, plural, relativeDays } from "./format.ts";

/** Sidebar list: every track by priority, with a mini bar and its 1–9 shortcut. */
export function SidebarTracks({ tracks, active, disabled, onOpen }: {
  tracks: readonly TrackSummary[]; active: string | undefined; disabled: boolean; onOpen: (id: string) => void;
}) {
  if (!tracks.length) return null;
  return <section className="sidebar-tracks" aria-labelledby="sidebar-tracks-title">
    <h2 id="sidebar-tracks-title">Tracks</h2>
    <ul>{tracks.map((track, index) =>
      <li key={track.id}>
        <Button aria-pressed={active === track.id} disabled={disabled} onClick={() => onOpen(track.id)}
          aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}>
          {index < 9 && <kbd aria-hidden="true">{index + 1}</kbd>}
          <span className="sidebar-tracks__label">{track.label}</span>
          <span className="sidebar-tracks__bar" data-health={track.health} aria-hidden="true"><span style={{ width: `${track.percent}%` }} /></span>
          <span className="sidebar-tracks__percent">{track.percent}%<span className="visually-hidden"> terminado · {healthLabels[track.health]}</span></span>
        </Button>
      </li>)}
    </ul>
    <p className="sidebar-tracks__hint">Teclas 1–{Math.min(9, tracks.length)} abren cada track</p>
  </section>;
}

/** Chips to jump between tracks without leaving the track view. */
export function TrackChips({ tracks, active, onOpen, onSummary }: {
  tracks: readonly TrackSummary[]; active: string; onOpen: (id: string) => void; onSummary: () => void;
}) {
  return <div className="track-chips-bar">
    <Button className="track-back" onClick={onSummary}>← Resumen</Button>
    <nav className="track-chips" aria-label="Cambiar de track">{tracks.map((track) =>
      <Button key={track.id} className="track-chip" aria-current={track.id === active ? "page" : undefined} onClick={() => onOpen(track.id)}>
        <span className="track-chip__dot" data-health={track.health} aria-hidden="true" />{track.label}
        <span className="track-chip__percent">{track.percent}%</span>
      </Button>)}
    </nav>
  </div>;
}

function healthSentence(track: TrackSummary): string {
  const pending = plural(track.remaining, "por hacer", "por hacer");
  if (track.health === "late") return `${relativeDays(track.daysLeft)} y quedan ${pending}`;
  if (track.health === "risk") return `quedan ${pending} y ${track.daysLeft === 0 ? "se entrega hoy" : plural(track.daysLeft!, "día", "días")}`;
  if (track.health === "ok") return `se entrega ${relativeDays(track.daysLeft)}`;
  return "ponle una fecha para saber si va a tiempo";
}

/** Track header: health, editable plan and the large progress bar. */
export function TrackOverview({ track, plans }: { track: TrackSummary; plans: TrackPlans }) {
  const plan = plans.tracks.get(track.id);
  const share = (value: number) => `${track.total ? value / track.total * 100 : 0}%`;
  return <section className="track-overview" aria-label={`Progreso de ${track.label}`}>
    <div className="track-overview__status">
      <span className="summary-health" data-health={track.health}><span aria-hidden="true" />{healthLabels[track.health]}</span>
      <span>{healthSentence(track)}</span>
      {plan && <TrackPlanControl key={plan.id} track={plan} plans={plans} />}
    </div>
    <span className="summary-bar summary-bar--large" data-health={track.health} role="img"
      aria-label={`${track.percent}% terminado: ${track.done} de ${track.total}, ${track.inReview} por revisar, ${track.remaining} por hacer`}>
      <span className="summary-bar__done" style={{ width: share(track.done) }} />
      <span className="summary-bar__review" style={{ width: share(track.inReview) }} />
    </span>
    <p className="track-overview__legend">
      <strong>{track.percent}%</strong>
      <span><strong>{track.done}</strong> {track.done === 1 ? "terminada" : "terminadas"}</span>
      <span><strong>{track.inReview}</strong> por revisar</span>
      <span><strong>{track.remaining}</strong> por hacer</span>
      <span>{plural(track.total, "tarea", "tareas")} en total</span>
    </p>
  </section>;
}
