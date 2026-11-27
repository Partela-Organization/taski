export type Status = "todo" | "in_progress" | "in_review" | "done";
export interface Summary {
  key: string; title: string; status: Status; assigneeId: string | null; highlighted: boolean; version: number;
}
export interface WorkSummary extends Summary {
  areaId: string; type: "task" | "feedback"; prUrl: string | null; createdBy: string; createdAt?: string;
}
export interface WorkTicket extends WorkSummary { url: string; description: string }
export interface FullTicket extends WorkTicket { id: string; createdAt: string; updatedAt: string }
export interface Actor {
  memberId: string; name: string; kind: "person" | "agent"; channel: "web" | "http" | "mcp";
  client: string; identityAssurance: "self_selected"; authorizationRef?: string;
}
export interface Comment { id: string; ticketVersion: number; body: string; actor: Actor; createdAt: string }
export interface Receipt { key: string; url: string; version: number; changed: string[]; commentId?: string }
export type TicketView = "summary" | "work" | "full";
export type TicketResult<V extends TicketView = "work"> = {
  ticket: V extends "summary" ? Summary : V extends "full" ? FullTicket : WorkTicket;
  comments: Comment[]; nextCommentsCursor: string | null; omitted: string[];
};
export type ListView = "summary" | "work";
export interface ListOptions<V extends ListView = "summary"> {
  limit?: number; cursor?: string; status?: Status; open?: true; query?: string; assigneeId?: string | null; areaId?: string;
  type?: "task" | "feedback"; view?: V; order?: "recent";
}
export type ListResult<V extends ListView = "summary"> = {
  items: (V extends "work" ? WorkSummary : Summary)[]; nextCursor: string | null; activityCursor: string; omitted: string[];
};
export interface Edits {
  title?: string; description?: string; status?: Status; assigneeId?: string | null;
  areaId?: string; type?: "task" | "feedback"; highlighted?: boolean; prUrl?: string | null;
}
export interface CreateTicket extends Edits { title: string; idempotencyKey: string }
export interface Mutation { expectedVersion: number; idempotencyKey: string }
export interface UpdateTicket extends Mutation { changes?: Edits; descriptionPatch?: { find: string; replace: string }; comment?: string }
export interface Activity {
  seq: number; ticketKey: string; ticketVersion: number; actor: Actor; changes: Record<string, unknown>; createdAt: string;
}
export interface ActivityResult { items: Activity[]; nextCursor: string; hasMore: boolean }
export interface ProjectResult {
  configVersion: number; notModified: boolean; activityCursor: string;
  project?: {
    id: string; name: string; prefix: string; baseUrl: string; locale: "es";
    brand: { name: string; accentLight: string; accentDark: string };
    members: { id: string; name: string; defaultView: "work" | "feedback" }[];
    areas: { id: string; label: string }[]; defaultAreaId: string;
    statusLabels: Record<Status, string>; typeLabels: Record<"task" | "feedback", string>;
    policy: { agentsCanComplete: boolean };
  };
}

export type Priority = 1 | 2 | 3;
/** A configured area with its plan. Unplanned tracks report priority 2, no date and version 0. */
export interface Track {
  id: string; label: string; priority: Priority; targetDate: string | null; version: number;
  updatedBy: string | null; updatedAt: string | null;
}
export interface TrackList { items: Track[] }
export interface UpdateTrack { expectedVersion: number; idempotencyKey: string; priority?: Priority; targetDate?: string | null }
export interface TrackReceipt { areaId: string; version: number; changed: string[] }

export type TrackHealth = "late" | "risk" | "ok" | "none";
export interface TrackSummary {
  id: string; label: string; priority: Priority; targetDate: string | null; daysLeft: number | null; health: TrackHealth;
  done: number; inReview: number; remaining: number; total: number; percent: number;
  next: { key: string; title: string; status: Status; assigneeId: string | null } | null;
}
/** Server-side recap. Counts cover tasks; feedback is reported separately. */
export interface ProjectSummary {
  today: string; timezone: string;
  totals: { done: number; inReview: number; remaining: number; total: number; percent: number };
  feedbackOpen: number;
  closedLast7Days: { count: number; items: { key: string; title: string; areaId: string; closedAt: string }[] };
  tracks: TrackSummary[];
}
export interface ProjectSummaryText { today: string; text: string }

export type HorizonStatus = "idea" | "exploring" | "planned" | "archived";
export type HorizonBlockType = "p" | "h1" | "h2" | "h3" | "li" | "ol" | "todo" | "quote" | "code" | "table" | "divider";
/** One block of a Horizonte document; inline formatting stays as Markdown in `text`. */
export interface HorizonBlock { id: string; type: HorizonBlockType; text: string; indent?: number; done?: boolean }
export interface HorizonMeta {
  id: string; title: string; status: HorizonStatus; areaId: string | null; version: number;
  createdBy: string; createdAt: string; updatedBy: string; updatedAt: string;
}
export interface HorizonSummary extends HorizonMeta { excerpt: string; blockCount: number; tasks: { done: number; total: number } }
export interface HorizonList { items: HorizonSummary[] }
export interface HorizonDocResult<F extends "markdown" | "blocks" = "blocks"> {
  doc: HorizonMeta & (F extends "blocks" ? { blocks: HorizonBlock[] } : { markdown: string });
}
export interface SaveHorizon {
  idempotencyKey: string; expectedVersion?: number; title?: string; status?: HorizonStatus; areaId?: string | null;
  markdown?: string; blocks?: HorizonBlock[];
}
export interface HorizonReceipt { id: string; version: number; changed: string[] }
