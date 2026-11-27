import { TaskiError } from "./ticket.ts";

/** A track is a configured area plus a mutable plan: priority and an optional target date. */
export const priorities = [1, 2, 3] as const;
export type Priority = typeof priorities[number];
export const defaultPriority: Priority = 2;

export interface AreaPlan {
  areaId: string;
  priority: Priority;
  /** Calendar date in the installation, `YYYY-MM-DD`, or null when the track has no deadline. */
  targetDate: string | null;
  /** 0 until the first change is saved. */
  version: number;
  updatedBy: string | null;
  updatedAt: string | null;
}
export type AreaPlanChanges = Partial<Pick<AreaPlan, "priority" | "targetDate">>;
export interface AreaReceipt { areaId: string; version: number; changed: string[] }

export function unplanned(areaId: string): AreaPlan {
  return { areaId, priority: defaultPriority, targetDate: null, version: 0, updatedBy: null, updatedAt: null };
}

export function priority(value: unknown): Priority {
  if (!(priorities as readonly unknown[]).includes(value)) throw new TaskiError("INVALID_INPUT", "Invalid priority: expected 1, 2 or 3");
  return value as Priority;
}

export function targetDate(value: unknown): string | null {
  if (value === null) return null;
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return value as string;
  }
  throw new TaskiError("INVALID_INPUT", "Invalid targetDate: expected an existing YYYY-MM-DD date or null");
}
