import { priority, targetDate, unplanned } from "../domain/area.ts";
import type { AreaPlan, AreaPlanChanges, AreaReceipt } from "../domain/area.ts";
import { TaskiError, canonical, record, text } from "../domain/ticket.ts";
import type { Actor } from "../domain/ticket.ts";
import { trustedActor } from "./actor.ts";
import type { Runtime } from "./tickets.ts";

export interface AreaContext {
  readonly members: readonly { readonly id: string; readonly name: string }[];
  readonly areas: readonly { readonly id: string; readonly label: string }[];
}
export interface AreaMutation {
  operation: string; idempotencyKey: string; fingerprint: string; actor: Actor;
  expectedVersion: number; plan: AreaPlan; changes: Record<string, unknown>; at: string;
}
export interface AreaPlanRepository {
  plans(): Promise<AreaPlan[]>;
  replay(actorId: string, operation: string, key: string, fingerprint: string): Promise<AreaReceipt | null>;
  commit(mutation: AreaMutation): Promise<AreaReceipt>;
}
export type Track = AreaPlan & { label: string };

const operation = "update_area";

export class AreaPlanService {
  readonly repository: AreaPlanRepository;
  readonly context: AreaContext;
  readonly runtime: Runtime;
  constructor(repository: AreaPlanRepository, context: AreaContext, runtime: Runtime) {
    this.repository = repository; this.context = context; this.runtime = runtime;
  }

  /** Configured areas in configuration order; stored plans for removed areas are ignored. */
  async list(): Promise<Track[]> {
    const stored = new Map((await this.repository.plans()).map((plan) => [plan.areaId, plan]));
    return this.context.areas.map(({ id, label }) => ({ ...(stored.get(id) ?? unplanned(id)), label }));
  }

  async update(input: unknown, actorInput: Actor): Promise<AreaReceipt> {
    const source = record(input, ["areaId", "expectedVersion", "idempotencyKey", "priority", "targetDate"]);
    const areaId = text(source.areaId, "areaId", 64);
    if (!this.context.areas.some((area) => area.id === areaId)) throw new TaskiError("UNKNOWN_AREA");
    const expectedVersion = source.expectedVersion;
    if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      throw new TaskiError("INVALID_INPUT", "Invalid expectedVersion");
    }
    const changes: AreaPlanChanges = {};
    if ("priority" in source) changes.priority = priority(source.priority);
    if ("targetDate" in source) changes.targetDate = targetDate(source.targetDate);
    const actor = trustedActor(this.context.members, actorInput);
    const idempotencyKey = text(source.idempotencyKey, "idempotencyKey", 128);
    const args = { areaId, expectedVersion, idempotencyKey, ...changes };
    const fingerprint = await this.runtime.hash(canonical({ operation, args, actorId: actor.memberId }));
    const cached = await this.repository.replay(actor.memberId, operation, idempotencyKey, fingerprint);
    if (cached) return cached;
    const before = (await this.repository.plans()).find((plan) => plan.areaId === areaId) ?? unplanned(areaId);
    if (before.version !== expectedVersion) throw new TaskiError("VERSION_CONFLICT");
    const delta: Record<string, unknown> = {};
    for (const key of ["priority", "targetDate"] as const) {
      if (key in changes && changes[key] !== before[key]) delta[key] = { before: before[key], after: changes[key] };
    }
    if (!Object.keys(delta).length) throw new TaskiError("EMPTY_UPDATE");
    const at = this.runtime.now();
    return this.repository.commit({ operation, idempotencyKey, fingerprint, actor, expectedVersion, changes: delta, at,
      plan: { ...before, ...changes, version: before.version + 1, updatedBy: actor.memberId, updatedAt: at } });
  }
}
