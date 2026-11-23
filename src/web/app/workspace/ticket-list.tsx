import type { ProjectResult, Status, WorkSummary } from "../../../client/index.ts";
import { Avatar, Button, StatusMessage } from "../../components.tsx";
import { WorkspaceIcon } from "../shared/marks.tsx";
import type { Presentation } from "./presentation.ts";

type Project = ProjectResult["project"];
const stateOrder: Status[] = ["in_progress", "todo", "in_review", "done"];
const fallbackStatusLabels: Record<Status, string> = {
  in_progress: "En curso", todo: "Pendiente", in_review: "Por revisar", done: "Terminado",
};

export function TicketList({ rows, feedback, project, selected, search, presentation, onOpen }: {
  rows: WorkSummary[]; feedback: boolean; project: Project; selected?: string | undefined; search: string;
  presentation: Presentation; onOpen: (key: string) => void;
}) {
  const query = search.trim().toLocaleLowerCase("es");
  const visible = rows.filter((row) => `${row.key} ${row.title}`.toLocaleLowerCase("es").includes(query));
  if (query && rows.length && !visible.length) return <StatusMessage title="No hay coincidencias en las páginas cargadas" />;
  return <div className="ticket-groups" data-presentation={presentation}>
    {stateOrder.map((status) => {
      const group = visible.filter((row) => row.status === status);
      if (!group.length) return null;
      const label = project?.statusLabels[status] ?? fallbackStatusLabels[status];
      const heading = <><span className={`status-dot status-dot--${status}`} aria-hidden="true" />
        {label}<span className="group-count">{group.length}</span></>;
      const list = <ul className="tickets">{group.map((row) => {
          const author = project?.members.find((member) => member.id === row.createdBy)?.name ?? row.createdBy;
          const assignee = project?.members.find((member) => member.id === row.assigneeId)?.name ?? row.assigneeId;
          const area = project?.areas.find((entry) => entry.id === row.areaId)?.label;
          const prNumber = row.prUrl?.match(/\/pull\/(\d+)\/?$/)?.[1];
          return <li key={row.key} className={row.key === selected ? "ticket-row ticket-row--selected" : "ticket-row"}>
            <span className="ticket-row__circle" aria-hidden="true">{row.status === "done" ? "✓" : ""}</span>
            <div className="ticket-row__body">
              <Button className="ticket-row__open" aria-current={row.key === selected ? "true" : undefined}
                onClick={() => onOpen(row.key)}><span className={row.highlighted ? "ticket-title-mark" : undefined}>{row.title}</span></Button>
              <div className="ticket-row__meta">
                {feedback ? <>{project?.typeLabels?.feedback ?? "Feedback"} · {author}</> : <>
                  <span className="ticket-key">{row.key}</span>
                  {row.prUrl && <a href={row.prUrl} target="_blank" rel="noreferrer" aria-label={`Abrir PR de ${row.key}`}>{prNumber ? `PR #${prNumber}` : "PR"}</a>}
                  {author && <span>{author}</span>}
                </>}
              </div>
            </div>
            {!feedback && <div className="ticket-row__assignment">
              {area && <span className="ticket-row__area" title={area}>{area}</span>}
              {assignee ? <Avatar name={assignee} /> : <span className="avatar" aria-label="Sin asignar" title="Sin asignar">–</span>}
            </div>}
            <span className="ticket-row__indicators">
              {row.highlighted && <span className="ticket-row__marked" title="Resaltada">
                <WorkspaceIcon name="highlight" /><span className="visually-hidden">Resaltada</span>
              </span>}
              <WorkspaceIcon name="chevron" />
            </span>
          </li>;
        })}</ul>;
      if (status === "done") return <details key={status} className="ticket-group finished-group" open={query ? true : undefined}>
        <summary>{heading}<span aria-hidden="true" className="finished-caret">⌄</span></summary>
        {list}
      </details>;
      return <section key={status} className="ticket-group" aria-label={label}><h2>{heading}</h2>{list}</section>;
    })}
  </div>;
}
