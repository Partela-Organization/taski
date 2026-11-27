import { TaskiError } from "../../domain/ticket.ts";
import type { HorizonDoc, HorizonReceipt } from "../../domain/horizon.ts";
import type { HorizonMutation, HorizonRepository } from "../../application/horizon.ts";
import { auditActor } from "./d1-tickets.ts";

type Row = Record<string, unknown>;
function doc(row: Row): HorizonDoc {
  return { id: row.id as string, title: row.title as string, status: row.status as HorizonDoc["status"], areaId: row.area_id as string | null,
    blocks: JSON.parse(row.blocks as string) as HorizonDoc["blocks"], version: row.version as number,
    createdBy: row.created_by as string, createdAt: row.created_at as string, updatedBy: row.updated_by as string, updatedAt: row.updated_at as string };
}

export class D1HorizonRepository implements HorizonRepository {
  readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async list(): Promise<HorizonDoc[]> {
    const { results } = await this.db.prepare("SELECT * FROM horizon_docs WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500").all<Row>();
    return results.map(doc);
  }

  async get(id: string): Promise<HorizonDoc | null> {
    const row = await this.db.prepare("SELECT * FROM horizon_docs WHERE id=? AND deleted_at IS NULL").bind(id).first<Row>();
    return row ? doc(row) : null;
  }

  async replay(actorId: string, operation: string, key: string, fingerprint: string): Promise<HorizonReceipt | null> {
    const row = await this.db.prepare("SELECT fingerprint,receipt FROM mutation_receipts WHERE actor_id=? AND operation=? AND idempotency_key=?")
      .bind(actorId, operation, key).first<{ fingerprint: string; receipt: string | null }>();
    if (!row) return null;
    if (row.fingerprint !== fingerprint) throw new TaskiError("IDEMPOTENCY_CONFLICT");
    if (!row.receipt) throw new TaskiError("INTERNAL_ERROR");
    return JSON.parse(row.receipt) as HorizonReceipt;
  }

  async commit(m: HorizonMutation): Promise<HorizonReceipt> {
    const d = m.doc;
    const scope = [m.actor.memberId, m.operation, m.idempotencyKey];
    const statements = [this.db.prepare("INSERT INTO mutation_receipts(actor_id,operation,idempotency_key,fingerprint,created_at) VALUES(?,?,?,?,?)")
      .bind(...scope, m.fingerprint, m.at)];
    if (m.create) {
      statements.push(this.db.prepare(`INSERT INTO horizon_docs(id,title,status,area_id,blocks,version,created_by,created_at,updated_by,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(d.id, d.title, d.status, d.areaId, JSON.stringify(d.blocks), d.version, d.createdBy, d.createdAt, d.updatedBy, d.updatedAt));
    } else {
      // The update trigger rejects a stale version inside this transaction.
      statements.push(this.db.prepare(`UPDATE horizon_docs SET title=?,status=?,area_id=?,blocks=?,version=?,updated_by=?,updated_at=?,deleted_at=? WHERE id=?`)
        .bind(d.title, d.status, d.areaId, JSON.stringify(d.blocks), d.version, d.updatedBy, d.updatedAt, m.deleted ? m.at : null, d.id));
    }
    statements.push(this.db.prepare("INSERT INTO horizon_activity(doc_id,doc_version,actor,changes,created_at) VALUES(?,?,?,?,?)")
      .bind(d.id, d.version, auditActor(m.actor), JSON.stringify(m.changes), m.at));
    statements.push(this.db.prepare(`UPDATE mutation_receipts SET receipt=(SELECT json_object('id',id,'version',version,'changed',json(?)) FROM horizon_docs WHERE id=? AND version=?)
      WHERE actor_id=? AND operation=? AND idempotency_key=?`).bind(JSON.stringify(Object.keys(m.changes)), d.id, d.version, ...scope));
    try {
      await this.db.batch(statements);
    } catch (error) {
      const confirmed = await this.replay(m.actor.memberId, m.operation, m.idempotencyKey, m.fingerprint);
      if (confirmed) return confirmed;
      if (/VERSION_CONFLICT|UNIQUE constraint failed: horizon_activity/.test(String(error))) throw new TaskiError("VERSION_CONFLICT");
      throw error;
    }
    const result = await this.replay(m.actor.memberId, m.operation, m.idempotencyKey, m.fingerprint);
    if (!result) throw new TaskiError("VERSION_CONFLICT");
    return result;
  }
}
