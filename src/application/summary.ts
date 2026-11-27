import type { Priority } from "../domain/area.ts";
import { daysBetween, localDate, percent, progressText, trackHealth } from "../domain/summary.ts";
import type { TrackHealth } from "../domain/summary.ts";
import type { TicketStatus, TicketType } from "../domain/ticket.ts";
import type { AreaPlanService } from "./areas.ts";
import type { Runtime } from "./tickets.ts";

export interface StatusCount { areaId: string; type: TicketType; status: TicketStatus; count: number }
export interface NextStep { areaId: string; key: string; title: string; status: TicketStatus; assigneeId: string | null }
export interface ClosedTask { key: string; title: string; areaId: string; closedAt: string }
export interface SummaryRepository {
  counts(): Promise<StatusCount[]>;
  /** One unfinished task per area: in progress first, then a highlighted pending task, then the oldest pending task. */
  nextSteps(): Promise<NextStep[]>;
  /** Tasks whose latest move to done happened at or after `since` and that are still done. */
  closedSince(since: string): Promise<ClosedTask[]>;
}
export interface SummaryContext {
  readonly project: { readonly name: string };
  readonly timezone?: string;
  readonly areas: readonly { readonly id: string; readonly label: string }[];
}
export interface TrackSummary {
  id: string; label: string; priority: Priority; targetDate: string | null; daysLeft: number | null; health: TrackHealth;
  done: number; inReview: number; remaining: number; total: number; percent: number;
  next: Omit<NextStep, "areaId"> | null;
}
export interface Summary {
  today: string; timezone: string;
  totals: { done: number; inReview: number; remaining: number; total: number; percent: number };
  feedbackOpen: number;
  closedLast7Days: { count: number; items: ClosedTask[] };
  tracks: TrackSummary[];
  text: string;
}

const weekMs = 7 * 86_400_000;
const recentItems = 5;

export class SummaryService {
  readonly repository: SummaryRepository;
  readonly areas: AreaPlanService;
  readonly context: SummaryContext;
  readonly runtime: Runtime;
  constructor(repository: SummaryRepository, areas: AreaPlanService, context: SummaryContext, runtime: Runtime) {
    this.repository = repository; this.areas = areas; this.context = context; this.runtime = runtime;
  }

  async summary(): Promise<Summary> {
    const now = this.runtime.now();
    const timezone = this.context.timezone ?? "UTC";
    const today = localDate(now, timezone);
    const since = new Date(Date.parse(now) - weekMs).toISOString();
    const [counts, steps, closed, plans] = await Promise.all([
      this.repository.counts(), this.repository.nextSteps(), this.repository.closedSince(since), this.areas.list(),
    ]);
    const order = new Map(this.context.areas.map(({ id }, index) => [id, index]));
    const tasks = (areaId: string, status: TicketStatus) => counts
      .filter((row) => row.type === "task" && row.areaId === areaId && row.status === status)
      .reduce((sum, row) => sum + row.count, 0);
    const tracks = plans.map((plan): TrackSummary => {
      const done = tasks(plan.areaId, "done");
      const inReview = tasks(plan.areaId, "in_review");
      const total = done + inReview + tasks(plan.areaId, "todo") + tasks(plan.areaId, "in_progress");
      const step = steps.find((entry) => entry.areaId === plan.areaId);
      return { id: plan.areaId, label: plan.label, priority: plan.priority, targetDate: plan.targetDate,
        daysLeft: plan.targetDate ? daysBetween(today, plan.targetDate) : null,
        health: trackHealth(plan.targetDate, done, total, today),
        done, inReview, remaining: total - done - inReview, total, percent: percent(done, total),
        next: step ? { key: step.key, title: step.title, status: step.status, assigneeId: step.assigneeId } : null };
    }).sort((a, b) => a.priority - b.priority
      || (a.targetDate ?? "9999-12-31").localeCompare(b.targetDate ?? "9999-12-31")
      || order.get(a.id)! - order.get(b.id)!);
    const sum = (key: "done" | "inReview" | "remaining" | "total") => tracks.reduce((value, track) => value + track[key], 0);
    const totals = { done: sum("done"), inReview: sum("inReview"), remaining: sum("remaining"), total: sum("total"), percent: 0 };
    totals.percent = percent(totals.done, totals.total);
    const feedbackOpen = counts.filter((row) => row.type === "feedback" && row.status !== "done").reduce((value, row) => value + row.count, 0);
    const heading = `${this.context.project.name} · ${new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short", timeZone: timezone }).format(new Date(now)).replace(/[.,]/g, "")}`;
    return { today, timezone, totals, feedbackOpen,
      closedLast7Days: { count: closed.length, items: closed.slice(0, recentItems) },
      tracks, text: progressText(heading, tracks, totals) };
  }
}
