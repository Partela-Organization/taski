import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { TaskiClientError } from "../../../client/index.ts";
import type { Priority, Track, UpdateTrack } from "../../../client/index.ts";
import { Button } from "../../components.tsx";
import { operationError } from "../access/use-team-session.ts";
import { mutationKey } from "../shared/mutation-key.ts";
import type { TrackPlans } from "./use-track-plans.ts";

export const priorityLabels: Record<Priority, string> = { 1: "Alta", 2: "Media", 3: "Baja" };
const shortDate = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "UTC" });

/** Formats a calendar date (`YYYY-MM-DD`) without shifting it to the viewer's time zone. */
export function formatTargetDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return shortDate.format(Date.UTC(year!, month! - 1, day!));
}

export function TrackPlanControl({ track, plans }: { track: Track; plans: TrackPlans }) {
  const [editing, setEditing] = useState(false);
  const [priority, setPriority] = useState<Priority>(track.priority);
  const [date, setDate] = useState(track.targetDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<UpdateTrack | undefined>(undefined);
  const id = useId();
  const label = track.label;

  function open() {
    setPriority(track.priority); setDate(track.targetDate ?? ""); setError(""); attempt.current = undefined; setEditing(true);
  }
  function close() { attempt.current = undefined; setError(""); setEditing(false); }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!attempt.current) {
      const changes: Partial<UpdateTrack> = {};
      if (priority !== track.priority) changes.priority = priority;
      const targetDate = date || null;
      if (targetDate !== track.targetDate) changes.targetDate = targetDate;
      if (!Object.keys(changes).length) { close(); return; }
      attempt.current = { expectedVersion: track.version, idempotencyKey: mutationKey(), ...changes };
    }
    setBusy(true); setError("");
    try {
      await plans.client.updateArea(track.id, attempt.current);
      attempt.current = undefined;
      setEditing(false);
      plans.refresh();
    } catch (failure) {
      const explicit = failure instanceof TaskiClientError && failure.status >= 400 && failure.status < 500 && failure.status !== 401;
      if (explicit) attempt.current = undefined;
      if (failure instanceof TaskiClientError && failure.status === 409) {
        plans.refresh();
        setError("El track cambió en otra sesión. Revisa los valores actuales y vuelve a guardar.");
      } else if (explicit) {
        setError("Revisa la prioridad y la fecha.");
      } else {
        setError(`${operationError(failure, plans.onExpired)} Guardar reintenta el mismo cambio.`);
      }
    } finally { setBusy(false); }
  }

  if (!editing) {
    return <div className="track-plan">
      <span className={`track-priority track-priority--${track.priority}`} title={`Prioridad ${priorityLabels[track.priority].toLowerCase()}`}>
        P{track.priority}<span className="visually-hidden"> · prioridad {priorityLabels[track.priority].toLowerCase()}</span>
      </span>
      <span className="track-plan__date">{track.targetDate
        ? <>Listo antes del <time dateTime={track.targetDate}>{formatTargetDate(track.targetDate)}</time></> : "Sin fecha"}</span>
      <Button className="track-plan__edit" aria-label={`Editar prioridad y fecha de ${label}`} onClick={open}>Editar</Button>
    </div>;
  }
  const locked = busy || !!attempt.current;
  return <form className="track-plan track-plan--editing" aria-label={`Plan de ${label}`} onSubmit={(event) => void save(event)}>
    <label htmlFor={`${id}-priority`}>Prioridad</label>
    <select id={`${id}-priority`} value={priority} disabled={locked}
      onChange={(event) => setPriority(Number(event.target.value) as Priority)}>
      {([1, 2, 3] as const).map((value) => <option key={value} value={value}>P{value} · {priorityLabels[value]}</option>)}
    </select>
    <label htmlFor={`${id}-date`}>Listo antes de</label>
    <input id={`${id}-date`} type="date" value={date} disabled={locked} onChange={(event) => setDate(event.target.value)} />
    <Button type="submit" variant="primary" disabled={busy}>{attempt.current && !busy ? "Reintentar" : "Guardar"}</Button>
    <Button variant="secondary" disabled={busy} onClick={close}>Cancelar</Button>
    {error && <p className="track-plan__error" role="alert">{error}</p>}
  </form>;
}
