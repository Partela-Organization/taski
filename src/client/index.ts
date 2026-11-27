import type { ActivityResult, CreateTicket, ListOptions, ListResult, ListView, Mutation, HorizonDocResult, HorizonList, HorizonReceipt, HorizonStatus, ProjectResult, ProjectSummary, SaveHorizon, ProjectSummaryText, Receipt, TicketResult, TicketView, TrackList, TrackReceipt, UpdateTicket, UpdateTrack } from "../contracts/api.ts";
import type { Attachment, AttachmentContentType, AttachmentList } from "../contracts/attachments.ts";
export type * from "../contracts/api.ts";
export * from "../contracts/attachments.ts";

export interface FetchOptions {
  method: string; headers: Record<string, string>; credentials: "include"; body?: string;
}
export interface FetchBytesOptions extends Omit<FetchOptions, "body"> {
  body: Uint8Array<ArrayBuffer>;
}
interface FetchResult { ok: boolean; status: number; json(): Promise<unknown> }
export type FetchLike = (url: string, options: FetchOptions) => Promise<FetchResult>;
export type FetchBytesLike = (url: string, options: FetchBytesOptions) => Promise<FetchResult>;
export interface ClientOptions { baseUrl: string; code?: string; memberId?: string; clientName?: string; fetch?: FetchLike; fetchBytes?: FetchBytesLike }

export class TaskiClientError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, status: number, message: string) { super(message); this.name = "TaskiClientError"; this.code = code; this.status = status; }
}

export class TaskiClient {
  #base: string;
  #headers: Record<string, string>;
  #fetch: FetchLike;
  #fetchBytes: FetchBytesLike | undefined;
  constructor(options: ClientOptions) {
    if (!/^https?:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?$/.test(options.baseUrl)) throw new Error("Expected an absolute base URL without credentials/query/fragment");
    if (options.code !== undefined && !options.memberId) throw new Error("memberId is required with a team code");
    this.#base = options.baseUrl.replace(/\/$/, "");
    this.#headers = { "content-type": "application/json", "x-taski-client": options.clientName ?? "taski-typescript-client" };
    if (options.code !== undefined) {
      this.#headers.authorization = `Bearer ${options.code}`;
      this.#headers["x-taski-member"] = options.memberId!;
    }
    const native = (globalThis as unknown as { fetch?: FetchLike & FetchBytesLike }).fetch;
    if (!options.fetch && !native) throw new Error("Provide a fetch-compatible transport");
    this.#fetch = options.fetch ?? ((url, init) => native!(url, init));
    this.#fetchBytes = options.fetchBytes ?? (options.fetch || !native ? undefined : (url, init) => native(url, init));
  }
  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const options: FetchOptions = { method, headers: { ...this.#headers }, credentials: "include" };
    if (body !== undefined) options.body = JSON.stringify(body);
    return this.readResponse<T>(await this.#fetch(this.apiUrl(path), options));
  }
  private apiUrl(path: string): string { return `${this.#base}/api/v1/${path}`; }
  private async readResponse<T>(response: FetchResult): Promise<T> {
    if (response.status === 204) return undefined as T;
    let result: unknown;
    try { result = await response.json(); }
    catch { throw new TaskiClientError("INVALID_RESPONSE", response.status, "Expected a JSON API response"); }
    if (!response.ok) {
      const error = result && typeof result === "object" && "error" in result ? result.error : null;
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "HTTP_ERROR";
      const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "The operation could not be confirmed";
      throw new TaskiClientError(code, response.status, message);
    }
    return result as T;
  }
  private query(options: object): string {
    const entries = Object.entries(options).filter(([, value]) => value !== undefined);
    return entries.length ? `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value === null ? "~" : String(value))}`).join("&")}` : "";
  }
  getProject(knownVersion?: number): Promise<ProjectResult> { return this.request(`project${this.query({ knownVersion })}`); }
  listTickets<V extends ListView = "summary">(options: ListOptions<V> = {}): Promise<ListResult<V>> { return this.request(`tickets${this.query(options)}`); }
  getTicket<V extends TicketView = "work">(key: string, options: { view?: V; commentsLimit?: number; commentsCursor?: string } = {}): Promise<TicketResult<V>> {
    return this.request(`tickets/${encodeURIComponent(key)}${this.query(options)}`);
  }
  createTicket(input: CreateTicket): Promise<Receipt> { return this.request("tickets", "POST", input); }
  updateTicket(key: string, input: UpdateTicket): Promise<Receipt> { return this.request(`tickets/${encodeURIComponent(key)}`, "PATCH", input); }
  deleteTicket(key: string, input: Mutation): Promise<Receipt> { return this.request(`tickets/${encodeURIComponent(key)}`, "DELETE", input); }
  listHorizon(filters: { status?: HorizonStatus; areaId?: string } = {}): Promise<HorizonList> { return this.request(`horizon${this.query(filters)}`); }
  getHorizon(id: string): Promise<HorizonDocResult<"blocks">> { return this.request(`horizon/${encodeURIComponent(id)}${this.query({ format: "blocks" })}`); }
  getHorizonMarkdown(id: string): Promise<HorizonDocResult<"markdown">> { return this.request(`horizon/${encodeURIComponent(id)}`); }
  createHorizon(input: SaveHorizon): Promise<HorizonReceipt> { return this.request("horizon", "POST", input); }
  updateHorizon(id: string, input: SaveHorizon & { expectedVersion: number }): Promise<HorizonReceipt> { return this.request(`horizon/${encodeURIComponent(id)}`, "PATCH", input); }
  deleteHorizon(id: string, input: Mutation): Promise<HorizonReceipt> { return this.request(`horizon/${encodeURIComponent(id)}`, "DELETE", input); }
  getSummary(): Promise<ProjectSummary> { return this.request("summary"); }
  getSummaryText(): Promise<ProjectSummaryText> { return this.request(`summary${this.query({ format: "text" })}`); }
  listAreas(): Promise<TrackList> { return this.request("areas"); }
  updateArea(areaId: string, input: UpdateTrack): Promise<TrackReceipt> { return this.request(`areas/${encodeURIComponent(areaId)}`, "PATCH", input); }
  addComment(key: string, input: Mutation & { body: string }): Promise<Receipt> { return this.request(`tickets/${encodeURIComponent(key)}/comments`, "POST", input); }
  listAttachments(key: string): Promise<AttachmentList> { return this.request(`tickets/${encodeURIComponent(key)}/attachments`); }
  attachmentUrl(key: string, id: string): string { return this.apiUrl(`tickets/${encodeURIComponent(key)}/attachments/${encodeURIComponent(id)}`); }
  async uploadAttachment(key: string, id: string, input: { name: string; contentType: AttachmentContentType; bytes: Uint8Array<ArrayBuffer> }): Promise<Attachment> {
    if (!this.#fetchBytes) throw new Error("Provide fetchBytes for image uploads when using a custom transport");
    return this.readResponse(await this.#fetchBytes(this.attachmentUrl(key, id), { method: "PUT", credentials: "include", body: input.bytes, headers: {
      ...this.#headers, "content-type": input.contentType, "x-taski-filename": encodeURIComponent(input.name),
    } }));
  }
  removeAttachment(key: string, id: string): Promise<void> {
    return this.request(`tickets/${encodeURIComponent(key)}/attachments/${encodeURIComponent(id)}`, "DELETE");
  }
  linkPullRequest(key: string, input: Mutation & { url: string }): Promise<Receipt> { return this.request(`tickets/${encodeURIComponent(key)}/pull-request`, "PUT", input); }
  listActivity(options: { cursor?: string; limit?: number; ticketKey?: string } = {}): Promise<ActivityResult> { return this.request(`activity${this.query(options)}`); }
  accessOptions(): Promise<{ projectName: string; brandName: string; members: { id: string; name: string; defaultView: "work" | "feedback" }[] }> { return this.request("access"); }
  login(code: string, memberId: string): Promise<{ member: { id: string; name: string }; identityAssurance: "self_selected" }> { return this.request("session", "POST", { code, memberId }); }
  session(): Promise<{ member: { id: string; name: string }; identityAssurance: "self_selected" }> { return this.request("session"); }
  changeMember(memberId: string): Promise<{ member: { id: string; name: string }; identityAssurance: "self_selected" }> { return this.request("session", "PUT", { memberId }); }
  logout(): Promise<void> { return this.request("session", "DELETE"); }
}
