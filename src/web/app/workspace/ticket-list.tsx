import { useState } from "react";
import type { Status, WorkSummary } from "../../../client/index.ts";
import { Button, StatusMessage } from "../../components.tsx";
import type { Grouping, Presentation } from "./presentation.ts";
import { TicketRow } from "./ticket-row.tsx";
import type { TicketRowContext } from "./ticket-row.tsx";

const stateOrder: Status[] = ["in_progress", "todo", "in_review", "done"];
const rowsPerGroup = 10;
const fallbackStatusLabels: Record<Status, string> = {
  in_progress: "En curso", todo: "Pendiente", in_review: "Por revisar", done: "Terminado",
};

function statusLabel(project: TicketRowContext["project"], status: Status) {
  return project?.statusLabels[status] ?? fallbackStatusLabels[status];
}

function TicketRows({ rows, context, grouping, label, searching }: {
  rows: WorkSummary[]; context: TicketRowContext; grouping: Grouping; label: string; searching: boolean;
}) {
  const [limit, setLimit] = useState(rowsPerGroup);
  const selectedIndex = rows.findIndex((row) => row.key === context.selected);
  const visible = searching ? rows : rows.slice(0, Math.max(limit, selectedIndex + 1));
  const hidden = rows.length - visible.length;
  return <>
    <ul className="tickets">{visible.map((row) =>
      <TicketRow key={row.key} row={row} context={context} showArea={grouping === "status"}
        statusLabel={grouping === "area" ? statusLabel(context.project, row.status) : undefined} />,
    )}</ul>
    {hidden > 0 && <Button variant="secondary" className="ticket-group-more" aria-label={`Ver más de ${label}`}
      onClick={() => setLimit(visible.length + rowsPerGroup)}>Ver más · {hidden}</Button>}
  </>;
}

function StatusHeading({ status, label, count }: { status: Status; label: string; count: number }) {
  return <><span className={`status-dot status-dot--${status}`} aria-hidden="true" />
    {label}<span className="group-count">{count}</span></>;
}

function FinishedTickets({ rows, context, grouping, searching }: {
  rows: WorkSummary[]; context: TicketRowContext; grouping: Grouping; searching: boolean;
}) {
  const label = statusLabel(context.project, "done");
  return <details className="ticket-group finished-group" open={searching ? true : undefined}>
    <summary><StatusHeading status="done" label={label} count={rows.length} />
      <span aria-hidden="true" className="finished-caret">⌄</span>
    </summary>
    <TicketRows rows={rows} context={context} grouping={grouping} label={label} searching={searching} />
  </details>;
}

function Areas({ rows, context, searching }: {
  rows: WorkSummary[]; context: TicketRowContext; searching: boolean;
}) {
  const groups = new Map<string, WorkSummary[]>();
  for (const row of rows) {
    const group = groups.get(row.areaId);
    if (group) group.push(row);
    else groups.set(row.areaId, [row]);
  }
  const labels = new Map(context.project?.areas.map(({ id, label }) => [id, label]));
  const order = new Set([...labels.keys(), ...groups.keys()]);
  return [...order].map((id) => {
    const group = groups.get(id);
    if (!group) return null;
    const label = labels.get(id) ?? id;
    const finished = group.filter((row) => row.status === "done");
    const active = group.filter((row) => row.status !== "done");
    return <section key={id} className="ticket-group ticket-group--area" aria-label={label}>
      <h2>{label}<span className="group-count">{group.length}</span></h2>
      {active.length > 0 && <TicketRows rows={active} context={context} grouping="area" label={label} searching={searching} />}
      {finished.length > 0 && <FinishedTickets rows={finished} context={context} grouping="area" searching={searching} />}
    </section>;
  });
}

function States({ rows, context, searching }: {
  rows: WorkSummary[]; context: TicketRowContext; searching: boolean;
}) {
  return stateOrder.map((status) => {
    const group = rows.filter((row) => row.status === status);
    if (!group.length) return null;
    if (status === "done") return <FinishedTickets key={status} rows={group} context={context} grouping="status" searching={searching} />;
    const label = statusLabel(context.project, status);
    return <section key={status} className="ticket-group" aria-label={label}>
      <h2><StatusHeading status={status} label={label} count={group.length} /></h2>
      <TicketRows rows={group} context={context} grouping="status" label={label} searching={searching} />
    </section>;
  });
}

export function TicketList({ rows, search, presentation, grouping, ...context }: TicketRowContext & {
  rows: WorkSummary[]; search: string; presentation: Presentation; grouping: Grouping;
}) {
  const query = search.trim().toLocaleLowerCase("es");
  const visible = rows.filter((row) => `${row.key} ${row.title}`.toLocaleLowerCase("es").includes(query));
  if (query && rows.length && !visible.length) return <StatusMessage title="No hay coincidencias en las páginas cargadas" />;
  return <div className="ticket-groups" data-presentation={presentation}>
    {grouping === "area" ? <Areas rows={visible} context={context} searching={!!query} />
      : <States rows={visible} context={context} searching={!!query} />}
  </div>;
}
