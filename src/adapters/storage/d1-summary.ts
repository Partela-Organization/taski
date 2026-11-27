import type { ClosedTask, NextStep, StatusCount, SummaryRepository } from "../../application/summary.ts";
import type { TicketStatus, TicketType } from "../../domain/ticket.ts";

type Row = Record<string, unknown>;

/** Aggregates read directly in SQL so the recap never depends on loaded list pages. */
export class D1SummaryRepository implements SummaryRepository {
  readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async counts(): Promise<StatusCount[]> {
    const { results } = await this.db.prepare(`SELECT area_id,type,status,COUNT(*) AS n FROM tickets
      WHERE deleted_at IS NULL GROUP BY area_id,type,status`).all<Row>();
    return results.map((row) => ({ areaId: row.area_id as string, type: row.type as TicketType,
      status: row.status as TicketStatus, count: row.n as number }));
  }

  async nextSteps(): Promise<NextStep[]> {
    const { results } = await this.db.prepare(`SELECT area_id,key,title,status,assignee_id FROM (
        SELECT area_id,key,title,status,assignee_id,ROW_NUMBER() OVER (PARTITION BY area_id
          ORDER BY CASE WHEN status='in_progress' THEN 0 WHEN highlighted=1 THEN 1 ELSE 2 END, number) AS position
        FROM tickets WHERE deleted_at IS NULL AND type='task' AND status IN ('todo','in_progress'))
      WHERE position=1`).all<Row>();
    return results.map((row) => ({ areaId: row.area_id as string, key: row.key as string, title: row.title as string,
      status: row.status as TicketStatus, assigneeId: row.assignee_id as string | null }));
  }

  async closedSince(since: string): Promise<ClosedTask[]> {
    const { results } = await this.db.prepare(`SELECT t.key,t.title,t.area_id,MAX(a.created_at) AS closed_at
      FROM activity a JOIN tickets t ON t.id=a.ticket_id
      WHERE json_extract(a.changes,'$.status.after')='done' AND t.status='done' AND t.type='task' AND t.deleted_at IS NULL
      GROUP BY t.id HAVING MAX(a.created_at) >= ? ORDER BY closed_at DESC, t.number DESC`).bind(since).all<Row>();
    return results.map((row) => ({ key: row.key as string, title: row.title as string, areaId: row.area_id as string,
      closedAt: row.closed_at as string }));
  }
}
