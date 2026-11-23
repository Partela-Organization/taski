import type { ProjectResult, WorkSummary } from "../../../client/index.ts";
import { Avatar, Button } from "../../components.tsx";
import { WorkspaceIcon } from "../shared/marks.tsx";

const creationDate = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

export interface TicketRowContext {
  feedback: boolean;
  project: ProjectResult["project"];
  selected?: string | undefined;
  onOpen: (key: string) => void;
}

export function TicketRow({ row, context, showArea, statusLabel }: {
  row: WorkSummary; context: TicketRowContext; showArea: boolean; statusLabel?: string | undefined;
}) {
  const { feedback, project, selected, onOpen } = context;
  const author = project?.members.find((member) => member.id === row.createdBy)?.name ?? row.createdBy;
  const assignee = project?.members.find((member) => member.id === row.assigneeId)?.name ?? row.assigneeId;
  const area = project?.areas.find((entry) => entry.id === row.areaId)?.label ?? row.areaId;
  const prNumber = row.prUrl?.match(/\/pull\/(\d+)\/?$/)?.[1];
  const createdAt = Date.parse(row.createdAt ?? "");
  return <li className={row.key === selected ? "ticket-row ticket-row--selected" : "ticket-row"}>
    <span className="ticket-row__circle" aria-hidden="true">{row.status === "done" ? "✓" : ""}</span>
    <div className="ticket-row__body">
      <Button className="ticket-row__open" aria-current={row.key === selected ? "true" : undefined}
        onClick={() => onOpen(row.key)}><span className={row.highlighted ? "ticket-title-mark" : undefined}>{row.title}</span></Button>
      <div className="ticket-row__meta">
        {feedback ? <span>{project?.typeLabels?.feedback ?? "Feedback"} · {author}</span> : <>
          <span className="ticket-key">{row.key}</span>
          {row.prUrl && <a href={row.prUrl} target="_blank" rel="noreferrer" aria-label={`Abrir PR de ${row.key}`}>{prNumber ? `PR #${prNumber}` : "PR"}</a>}
          {author && <span>{author}</span>}
        </>}
        {statusLabel && <span className="ticket-row__status">
          <span className={`status-dot status-dot--${row.status}`} aria-hidden="true" />{statusLabel}
        </span>}
        {Number.isFinite(createdAt) && <time dateTime={row.createdAt}>{creationDate.format(createdAt)}</time>}
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
