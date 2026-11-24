import { attachmentContentTypes, maxAttachmentBytes } from "../../contracts/attachments.ts";
import type { AttachmentContentType } from "../../contracts/attachments.ts";
import { TaskiError, text } from "../../domain/ticket.ts";
import type { Actor, Ticket } from "../../domain/ticket.ts";
import { attachmentMetadata, D1Attachments, reservationLifetime } from "../storage/d1-attachments.ts";
import { runtime } from "../worker/runtime.ts";
import { boundedBody } from "./body.ts";

const privateHeaders = { "cache-control": "private, no-store" };
const attachmentId = /^[0-9a-f]{32}$/;

function identifyImage(bytes: Uint8Array): AttachmentContentType | undefined {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
      && String.fromCharCode(...bytes.subarray(12, 16)) === "IHDR") return "image/png";
  if (bytes.length >= 20 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
      && ["VP8 ", "VP8L", "VP8X"].includes(String.fromCharCode(...bytes.subarray(12, 16)))) return "image/webp";
}

async function readImage(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase();
  if (!attachmentContentTypes.some((type) => type === contentType)) throw new TaskiError("UNSUPPORTED_IMAGE");
  if (Number(request.headers.get("content-length")) > maxAttachmentBytes) throw new TaskiError("PAYLOAD_TOO_LARGE");
  let decodedName: string;
  try { decodedName = decodeURIComponent(request.headers.get("x-taski-filename") ?? ""); }
  catch { throw new TaskiError("INVALID_INPUT", "Invalid filename encoding"); }
  const name = text(decodedName, "filename", 180);
  if (/[\u0000-\u001f\u007f/\\]/.test(name)) throw new TaskiError("INVALID_INPUT", "Invalid filename");
  if (!request.body) throw new TaskiError("INVALID_INPUT", "Image body is required");
  const bytes = await boundedBody(request.body, maxAttachmentBytes);
  const detected = identifyImage(bytes);
  if (!detected || detected !== contentType) throw new TaskiError("UNSUPPORTED_IMAGE");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const digest = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { bytes, name, contentType: detected, size: bytes.byteLength, digest };
}

async function upload(request: Request, db: D1Attachments, bucket: R2Bucket, ticket: Ticket, id: string, actor: Actor, objectKey: string) {
  const image = await readImage(request);
  const now = Date.now();
  await db.reserve(ticket.id, id, image, actor, now);
  const row = await db.find(ticket.id, id);
  if (!row) throw new TaskiError("ATTACHMENT_LIMIT");
  if (row.uploader_id !== actor.memberId || row.name !== image.name || row.digest !== image.digest || row.content_type !== image.contentType) {
    throw new TaskiError("IDEMPOTENCY_CONFLICT");
  }
  if (row.removed_at) throw new TaskiError("NOT_FOUND");
  if (row.uploaded_at) return Response.json(attachmentMetadata(row, actor), { headers: privateHeaders });
  if (row.reserved_at <= now - reservationLifetime) throw new TaskiError("ATTACHMENT_EXPIRED");

  // Every put has a D1 reservation. A retry can finish publishing a prior successful put.
  await bucket.put(objectKey, image.bytes, { onlyIf: { etagDoesNotMatch: "*" } });
  const saved = await db.publish(ticket.id, id, Date.now());
  if (!saved?.uploaded_at || saved.removed_at) {
    await bucket.delete(objectKey);
    throw new TaskiError(saved?.removed_at ? "NOT_FOUND" : "ATTACHMENT_EXPIRED");
  }
  return Response.json(attachmentMetadata(saved, actor), { headers: privateHeaders });
}

export async function attachments(request: Request, db: D1Attachments, bucket: R2Bucket | undefined,
  ticket: Ticket, id: string | undefined, actor: Actor): Promise<Response> {
  if (id === undefined) {
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { allow: "GET" } });
    const items = bucket ? await db.list(ticket.id, actor) : [];
    return Response.json({ enabled: !!bucket, items }, { headers: privateHeaders });
  }
  if (!attachmentId.test(id)) throw new TaskiError("INVALID_INPUT", "Invalid attachment identifier");
  if (!["GET", "PUT", "DELETE"].includes(request.method)) {
    return new Response(null, { status: 405, headers: { allow: "GET, PUT, DELETE" } });
  }
  if (!bucket) throw new TaskiError("ATTACHMENTS_DISABLED");
  const objectKey = `ticket-images/${ticket.id}/${id}`;
  if (request.method === "PUT") return upload(request, db, bucket, ticket, id, actor, objectKey);

  const row = await db.find(ticket.id, id);
  if (!row) throw new TaskiError("NOT_FOUND");
  if (request.method === "DELETE") {
    if (row.uploader_id !== actor.memberId) throw new TaskiError("ACCESS_DENIED");
    await db.remove(ticket.id, id, actor);
    await bucket.delete(objectKey);
    return new Response(null, { status: 204, headers: privateHeaders });
  }
  if (!row.uploaded_at || row.removed_at) throw new TaskiError("NOT_FOUND");
  const image = await bucket.get(objectKey);
  if (!image) throw new TaskiError("NOT_FOUND");
  return new Response(image.body, { headers: {
    ...privateHeaders,
    "content-type": row.content_type,
    "content-length": String(row.byte_size),
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-origin",
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name).replace(/['()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
  } });
}
