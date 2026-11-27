import { TaskiError } from "../../domain/ticket.ts";
import type { AreaPlan, AreaReceipt, Priority } from "../../domain/area.ts";
import type { AreaMutation, AreaPlanRepository } from "../../application/areas.ts";
import { auditActor } from "./d1-tickets.ts";

type Row = Record<string, unknown>;

export class D1AreaPlanRepository implements AreaPlanRepository {
  readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async plans(): Promise<AreaPlan[]> {
    const { results } = await this.db.prepare("SELECT area_id,priority,target_date,version,updated_by,updated_at FROM area_plans ORDER BY area_id").all<Row>();
    return results.map((row) => ({ areaId: row.area_id as string, priority: row.priority as Priority,
      targetDate: row.target_date as string | null, version: row.version as number,
      updatedBy: row.updated_by as string, updatedAt: row.updated_at as string }));
  }

  async replay(actorId: string, operation: string, key: string, fingerprint: string): Promise<AreaReceipt | null> {
    const row = await this.db.prepare("SELECT fingerprint,receipt FROM mutation_receipts WHERE actor_id=? AND operation=? AND idempotency_key=?")
      .bind(actorId, operation, key).first<{ fingerprint: string; receipt: string | null }>();
    if (!row) return null;
    if (row.fingerprint !== fingerprint) throw new TaskiError("IDEMPOTENCY_CONFLICT");
    if (!row.receipt) throw new TaskiError("INTERNAL_ERROR");
    return JSON.parse(row.receipt) as AreaReceipt;
  }

  async commit(m: AreaMutation): Promise<AreaReceipt> {
    const p = m.plan;
    const scope = [m.actor.memberId, m.operation, m.idempotencyKey];
    const statements = [
      this.db.prepare("INSERT INTO mutation_receipts(actor_id,operation,idempotency_key,fingerprint,created_at) VALUES(?,?,?,?,?)")
        .bind(...scope, m.fingerprint, m.at),
      // Version 1 inserts; a concurrent first write fails on the primary key. Later versions are checked by the update trigger.
      m.expectedVersion === 0
        ? this.db.prepare("INSERT INTO area_plans(area_id,priority,target_date,version,updated_by,updated_at) VALUES(?,?,?,?,?,?)")
          .bind(p.areaId, p.priority, p.targetDate, p.version, p.updatedBy, p.updatedAt)
        : this.db.prepare("UPDATE area_plans SET priority=?,target_date=?,version=?,updated_by=?,updated_at=? WHERE area_id=?")
          .bind(p.priority, p.targetDate, p.version, p.updatedBy, p.updatedAt, p.areaId),
      this.db.prepare("INSERT INTO area_activity(area_id,area_version,actor,changes,created_at) VALUES(?,?,?,?,?)")
        .bind(p.areaId, p.version, auditActor(m.actor), JSON.stringify(m.changes), m.at),
      this.db.prepare(`UPDATE mutation_receipts SET receipt=(SELECT json_object('areaId',area_id,'version',version,'changed',json(?)) FROM area_plans WHERE area_id=? AND version=?)
        WHERE actor_id=? AND operation=? AND idempotency_key=?`).bind(JSON.stringify(Object.keys(m.changes)), p.areaId, p.version, ...scope),
    ];
    try {
      await this.db.batch(statements);
    } catch (error) {
      const confirmed = await this.replay(m.actor.memberId, m.operation, m.idempotencyKey, m.fingerprint);
      if (confirmed) return confirmed;
      if (/VERSION_CONFLICT|UNIQUE constraint failed: area_(plans|activity)/.test(String(error))) throw new TaskiError("VERSION_CONFLICT");
      throw error;
    }
    const result = await this.replay(m.actor.memberId, m.operation, m.idempotencyKey, m.fingerprint);
    if (!result) throw new TaskiError("VERSION_CONFLICT");
    return result;
  }
}
