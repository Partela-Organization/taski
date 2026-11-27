import type { ProjectResult, WorkSummary } from "../../../client/index.ts";
import { Avatar, Button } from "../../components.tsx";
import { WorkspaceIcon } from "../shared/marks.tsx";

const creationDate = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

export interface TicketRowContext {
  feedback: boolean;
  project: ProjectResult["project"];
  selected?: string | undefined;
  onOpen: (key: string) => void;
  /** Feedback only: confirmed done toggle and the keys still waiting for the server. */
  onToggleDone?: ((row: WorkSummary) => void) | undefined;
  pendingDone?: ReadonlySet<string> | undefined;
  /** Inside a track every row shares the area, so it is not repeated. */
  hideArea?: boolean | undefined;
}

export function TicketRow({ row, context, showArea, statusLabel }: {
  row: WorkSummary; context: TicketRowContext; showArea: boolean; statusLabel?: string | undefined;
}) {
  const { feedback, project, selected, onOpen, onToggleDone, pendingDone } = context;
  const done = row.status === "done";
  const saving = pendingDone?.has(row.key) ?? false;
  const author = project?.members.find((member) => member.id === row.createdBy)?.name ?? row.createdBy;
  const assignee = project?.members.find((member) => member.id === row.assigneeId)?.name ?? row.assigneeId;
  const area = project?.areas.find((entry) => entry.id === row.areaId)?.label ?? row.areaId;
  const prNumber = row.prUrl?.match(/\/pull\/(\d+)\/?$/)?.[1];
  const createdAt = Date.parse(row.createdAt ?? "");
  return <li className={row.key === selected ? "ticket-row ticket-row--selected" : "ticket-row"} data-feedback={feedback || undefined}
    data-done={feedback && done ? true : undefined}>
    {feedback && onToggleDone
      ? <label className="ticket-row__check" title={done ? "Marcar como abierto" : "Marcar como hecho"}>
        <input type="checkbox" checked={done} disabled={saving} aria-busy={saving || undefined}
          aria-label={`Hecho · ${row.title}`} onChange={() => onToggleDone(row)} />
      </label>
      : <span className="ticket-row__circle" aria-hidden="true">{done ? "✓" : ""}</span>}
    <div className="ticket-row__body">
      <Button className="ticket-row__open" aria-current={row.key === selected ? "true" : undefined}
        onClick={() => onOpen(row.key)}><span className={row.highlighted ? "ticket-title-mark" : undefined}>{row.title}</span></Button>
      <div className="ticket-row__meta">
        {feedback ? <span><span className="ticket-row__feedback-type">{project?.typeLabels?.feedback ?? "Feedback"} · </span><span>{author}</span></span> : <>
          <span className="ticket-key">{row.key}</span>
          {row.prUrl && <a href={row.prUrl} target="_blank" rel="noreferrer" aria-label={`Abrir PR de ${row.key}`}>{prNumber ? `PR #${prNumber}` : "PR"}</a>}
          {author && <span>{author}</span>}
        </>}
        {statusLabel && <span className="ticket-row__status">
          <span className={`status-dot status-dot--${row.status}`} aria-hidden="true" />{statusLabel}
        </span>}
        {Number.isFinite(createdAt) && <time dateTime={row.createdAt}>{creationDate.format(createdAt)}</time>}
        {feedback && onToggleDone && (saving ? <span className="ticket-row__done-state">Guardando…</span>
          : done && <span className="ticket-row__done-state">Hecho</span>)}
      </div>
    </div>
    {(!feedback || showArea || assignee) && <div className="ticket-row__assignment">
      {showArea && <span className="ticket-row__area" title={area}>{area}</span>}
      {assignee && <Avatar name={assignee} />}
      {!assignee && !feedback && <span className="avatar" aria-label="Sin asignar" title="Sin asignar">–</span>}
    </div>}
    <span className="ticket-row__indicators">
      {row.highlighted && <span className="ticket-row__marked" title="Resaltada">
        <WorkspaceIcon name="highlight" /><span className="visually-hidden">Resaltada</span>
      </span>}
      <WorkspaceIcon name="chevron" />
    </span>
  </li>;
}
