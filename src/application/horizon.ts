import { horizonBlocks, horizonStatus, horizonTitle, markdownToBlocks, summarize } from "../domain/horizon.ts";
import type { HorizonBlock, HorizonDoc, HorizonReceipt, HorizonStatus, HorizonSummary } from "../domain/horizon.ts";
import { TaskiError, canonical, record, text } from "../domain/ticket.ts";
import type { Actor } from "../domain/ticket.ts";
import { trustedActor } from "./actor.ts";
import type { AreaContext } from "./areas.ts";
import type { Runtime } from "./tickets.ts";

export interface HorizonMutation {
  operation: string; idempotencyKey: string; fingerprint: string; actor: Actor;
  create: boolean; deleted?: true; expectedVersion: number | null;
  doc: HorizonDoc; changes: Record<string, unknown>; at: string;
}
export interface HorizonRepository {
  list(): Promise<HorizonDoc[]>;
  get(id: string): Promise<HorizonDoc | null>;
  replay(actorId: string, operation: string, key: string, fingerprint: string): Promise<HorizonReceipt | null>;
  commit(mutation: HorizonMutation): Promise<HorizonReceipt>;
}

const statusOrder: Record<HorizonStatus, number> = { exploring: 0, planned: 1, idea: 2, archived: 3 };

/** Documents for later work. People and agents can create and edit them; only a person removes one. */
export class HorizonService {
  readonly repository: HorizonRepository;
  readonly context: AreaContext;
  readonly runtime: Runtime;
  constructor(repository: HorizonRepository, context: AreaContext, runtime: Runtime) {
    this.repository = repository; this.context = context; this.runtime = runtime;
  }

  async list(input: unknown): Promise<HorizonSummary[]> {
    const args = record(input ?? {}, ["status", "areaId"]);
    const status = args.status === undefined ? undefined : horizonStatus(args.status);
    const areaId = args.areaId === undefined ? undefined : this.area(args.areaId);
    return (await this.repository.list())
      .filter((doc) => (status === undefined || doc.status === status) && (areaId === undefined || doc.areaId === areaId))
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.updatedAt.localeCompare(a.updatedAt))
      .map(summarize);
  }

  async get(id: unknown): Promise<HorizonDoc> {
    const doc = await this.repository.get(text(id, "id", 64));
    if (!doc) throw new TaskiError("NOT_FOUND");
    return doc;
  }

  private area(value: unknown): string | null {
    if (value === null) return null;
    if (!this.context.areas.some((area) => area.id === value)) throw new TaskiError("UNKNOWN_AREA");
    return value as string;
  }

  private async request(operation: string, args: Record<string, unknown>, actorInput: Actor) {
    const actor = trustedActor(this.context.members, actorInput);
    const idempotencyKey = text(args.idempotencyKey, "idempotencyKey", 128);
    const fingerprint = await this.runtime.hash(canonical({ operation, args, actorId: actor.memberId }));
    const cached = await this.repository.replay(actor.memberId, operation, idempotencyKey, fingerprint);
    return { actor, idempotencyKey, fingerprint, cached };
  }

  /** Creates a document (no `id`) or updates one (`id` + `expectedVersion`). Content comes as blocks or Markdown. */
  async save(input: unknown, actorInput: Actor): Promise<HorizonReceipt> {
    const source = record(input, ["id", "expectedVersion", "idempotencyKey", "title", "status", "areaId", "markdown", "blocks"]);
    if (source.markdown !== undefined && source.blocks !== undefined) throw new TaskiError("INVALID_INPUT", "Send markdown or blocks, not both");
    const changes: { title?: string; status?: HorizonStatus; areaId?: string | null; blocks?: HorizonBlock[] } = {};
    let markdownTitle: string | null = null;
    if (source.markdown !== undefined) {
      const parsed = markdownToBlocks(text(source.markdown, "markdown", 200000, true), () => this.runtime.id());
      changes.blocks = parsed.blocks; markdownTitle = parsed.title;
    }
    if (source.blocks !== undefined) changes.blocks = horizonBlocks(source.blocks);
    if (source.title !== undefined) changes.title = horizonTitle(source.title);
    else if (markdownTitle) changes.title = horizonTitle(markdownTitle);
    if (source.status !== undefined) changes.status = horizonStatus(source.status);
    if (source.areaId !== undefined) changes.areaId = this.area(source.areaId);
    const create = source.id === undefined;
    const operation = create ? "create_horizon" : "update_horizon";
    const args: Record<string, unknown> = { ...source };
    const request = await this.request(operation, args, actorInput);
    if (request.cached) return request.cached;
    const at = this.runtime.now();
    if (create) {
      if (source.expectedVersion !== undefined) throw new TaskiError("INVALID_INPUT", "expectedVersion is only for updates");
      if (!changes.title) throw new TaskiError("INVALID_INPUT", "Title is required: send title or Markdown that starts with # Title");
      const doc: HorizonDoc = { id: this.runtime.id(), title: changes.title, status: changes.status ?? "idea", areaId: changes.areaId ?? null,
        blocks: changes.blocks ?? [], version: 1, createdBy: request.actor.memberId, createdAt: at, updatedBy: request.actor.memberId, updatedAt: at };
      return this.repository.commit({ ...request, operation, create: true, expectedVersion: null, doc, at,
        changes: { title: { before: null, after: doc.title }, status: { before: null, after: doc.status },
          areaId: { before: null, after: doc.areaId }, blocks: { before: 0, after: doc.blocks.length } } });
    }
    const expectedVersion = source.expectedVersion;
    if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new TaskiError("INVALID_INPUT", "Invalid expectedVersion");
    const before = await this.get(source.id);
    if (before.version !== expectedVersion) throw new TaskiError("VERSION_CONFLICT");
    const delta: Record<string, unknown> = {};
    for (const key of ["title", "status", "areaId"] as const) {
      if (key in changes && changes[key] !== before[key]) delta[key] = { before: before[key], after: changes[key] };
    }
    if (changes.blocks && canonical(changes.blocks) !== canonical(before.blocks)) delta.blocks = { before: before.blocks.length, after: changes.blocks.length };
    if (!Object.keys(delta).length) throw new TaskiError("EMPTY_UPDATE");
    const doc: HorizonDoc = { ...before, ...changes, version: before.version + 1, updatedBy: request.actor.memberId, updatedAt: at };
    return this.repository.commit({ ...request, operation, create: false, expectedVersion, doc, changes: delta, at });
  }

  async delete(input: unknown, actorInput: Actor): Promise<HorizonReceipt> {
    if (actorInput.kind !== "person") throw new TaskiError("ACCESS_DENIED");
    const source = record(input, ["id", "expectedVersion", "idempotencyKey"]);
    const operation = "delete_horizon";
    const request = await this.request(operation, source, actorInput);
    if (request.cached) return request.cached;
    const before = await this.get(source.id);
    if (before.version !== source.expectedVersion) throw new TaskiError("VERSION_CONFLICT");
    const at = this.runtime.now();
    return this.repository.commit({ ...request, operation, create: false, deleted: true, expectedVersion: before.version, at,
      doc: { ...before, version: before.version + 1, updatedBy: request.actor.memberId, updatedAt: at },
      changes: { deleted: { before: false, after: true } } });
  }
}
