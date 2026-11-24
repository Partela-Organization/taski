import { maxTicketAttachments } from "../../contracts/attachments.ts";
import type { Attachment, AttachmentContentType } from "../../contracts/attachments.ts";
import type { Actor } from "../../domain/ticket.ts";

export const reservationLifetime = 60 * 60 * 1000;

interface AttachmentRow {
  id: string;
  name: string;
  content_type: AttachmentContentType;
  byte_size: number;
  digest: string;
  uploader_id: string;
  reserved_at: number;
  uploaded_at: string | null;
  removed_at: string | null;
}

function auditActor({ memberId, name, kind, channel, client, identityAssurance }: Actor) {
  return JSON.stringify({ memberId, name, kind, channel, client, identityAssurance });
}

export function attachmentMetadata(row: AttachmentRow, actor: Actor): Attachment {
  return {
    id: row.id,
    name: row.name,
    contentType: row.content_type,
    size: row.byte_size,
    createdAt: row.uploaded_at!,
    createdBy: row.uploader_id,
    canRemove: row.uploader_id === actor.memberId,
  };
}

export class D1Attachments {
  private readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  find(ticketId: string, id: string) {
    return this.db.prepare("SELECT * FROM ticket_attachments WHERE ticket_id=? AND id=?")
      .bind(ticketId, id).first<AttachmentRow>();
  }

  async list(ticketId: string, actor: Actor): Promise<Attachment[]> {
    const { results } = await this.db.prepare(`SELECT * FROM ticket_attachments
      WHERE ticket_id=? AND removed_at IS NULL AND uploaded_at IS NOT NULL ORDER BY uploaded_at, id`)
      .bind(ticketId).all<AttachmentRow>();
    return results.map((row) => attachmentMetadata(row, actor));
  }

  async reserve(ticketId: string, id: string, image: { name: string; contentType: AttachmentContentType; size: number; digest: string },
    actor: Actor, now: number) {
    const { name, contentType, size, digest } = image;
    return this.db.prepare(`INSERT INTO ticket_attachments(ticket_id,id,name,content_type,byte_size,digest,uploader_id,uploader,reserved_at)
      SELECT ?,?,?,?,?,?,?,?,?
      WHERE (SELECT count(*) FROM ticket_attachments
        WHERE ticket_id=? AND removed_at IS NULL AND (uploaded_at IS NOT NULL OR reserved_at>?)) < ?
      ON CONFLICT(ticket_id,id) DO NOTHING`)
      .bind(ticketId, id, name, contentType, size, digest, actor.memberId, auditActor(actor), now,
        ticketId, now - reservationLifetime, maxTicketAttachments).run();
  }

  async publish(ticketId: string, id: string, now: number) {
    await this.db.prepare(`UPDATE ticket_attachments SET uploaded_at=?
      WHERE ticket_id=? AND id=? AND removed_at IS NULL AND uploaded_at IS NULL AND reserved_at>?`)
      .bind(new Date(now).toISOString(), ticketId, id, now - reservationLifetime).run();
    return this.find(ticketId, id);
  }

  async remove(ticketId: string, id: string, actor: Actor) {
    await this.db.prepare(`UPDATE ticket_attachments SET removed_at=?, removed_by=?
      WHERE ticket_id=? AND id=? AND removed_at IS NULL AND uploader_id=?`)
      .bind(new Date().toISOString(), auditActor(actor), ticketId, id, actor.memberId).run();
  }
}
