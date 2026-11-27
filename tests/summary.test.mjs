import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createTestHarness } from "wrangler";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const code = "summary-test-only-code";
const server = createTestHarness({ workers: [{ configPath: "./wrangler.jsonc", vars: { TASKI_TEAM_ACCESS_CODE: code } }] });
const agent = { authorization: `Bearer ${code}`, "x-taski-member": "alex", "content-type": "application/json" };
let person;
const call = async (path, method = "GET", body, headers = agent) => {
  const response = await server.fetch(`/api/v1/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await response.json();
  assert(response.ok, `${method} ${path}: ${JSON.stringify(json)}`);
  return json;
};
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let base;
before(async () => {
  base = (await server.listen()).url;
  await server.getWorker().applyD1Migrations("DB");
  const login = await server.fetch("/api/v1/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, memberId: "taylor" }) });
  person = { cookie: login.headers.get("set-cookie").split(";")[0], "content-type": "application/json" };
});
after(() => server.close());

async function task(title, areaId, status, extra = {}) {
  const created = await call("tickets", "POST", { title, areaId, idempotencyKey: `create-${title}`, ...extra });
  if (status === "todo") return created;
  if (status === "done") return call(`tickets/${created.key}`, "PATCH", { expectedVersion: 1, idempotencyKey: `status-${title}`, changes: { status } }, person);
  return call(`tickets/${created.key}`, "PATCH", { expectedVersion: 1, idempotencyKey: `status-${title}`, changes: { status } });
}

test("summary aggregates every task per track, independent of list pages", async () => {
  const empty = await call("summary");
  assert.deepEqual(empty.totals, { done: 0, inReview: 0, remaining: 0, total: 0, percent: 0 });
  assert.equal(empty.timezone, "UTC");
  assert.equal(empty.today, day(0));
  assert.deepEqual(empty.tracks.map((track) => [track.id, track.health, track.next]), [["general", "none", null], ["web", "none", null]]);

  // Web: 25 tasks so the counts exceed a list page; 20 done, 1 in review, 4 pending.
  for (let n = 0; n < 20; n++) await task(`Web hecha ${n}`, "web", "done");
  await task("Web en revisión", "web", "in_review");
  const oldest = await task("Web pendiente antigua", "web", "todo");
  await task("Web pendiente resaltada", "web", "todo", { highlighted: true });
  await task("Web pendiente nueva", "web", "todo");
  await task("Web pendiente 4", "web", "todo");
  // General: 1 in progress, 2 pending, 1 done that was reopened, 1 deleted, feedback separate.
  await task("General pendiente", "general", "todo");
  await task("General en curso", "general", "in_progress");
  await task("General pendiente 2", "general", "todo");
  const reopened = await task("General reabierta", "general", "done");
  await call(`tickets/${reopened.key}`, "PATCH", { expectedVersion: reopened.version, idempotencyKey: "reopen", changes: { status: "todo" } }, person);
  const removed = await task("General eliminada", "general", "todo");
  await call(`tickets/${removed.key}`, "DELETE", { expectedVersion: 1, idempotencyKey: "remove" }, person);
  await call("tickets", "POST", { title: "Idea abierta", type: "feedback", idempotencyKey: "fb-open" });
  const closedFeedback = await call("tickets", "POST", { title: "Idea atendida", type: "feedback", idempotencyKey: "fb-done" });
  await call(`tickets/${closedFeedback.key}`, "PATCH", { expectedVersion: 1, idempotencyKey: "fb-done-status", changes: { status: "done" } }, person);

  await call("areas/general", "PATCH", { expectedVersion: 0, idempotencyKey: "plan-general", priority: 1, targetDate: day(3) });
  await call("areas/web", "PATCH", { expectedVersion: 0, idempotencyKey: "plan-web", priority: 1, targetDate: day(-2) });

  const summary = await call("summary");
  assert.deepEqual(summary.tracks.map((track) => track.id), ["web", "general"]); // same priority, earlier date first
  const [web, general] = summary.tracks;
  assert.deepEqual({ ...web, next: web.next.title }, { id: "web", label: "Web", priority: 1, targetDate: day(-2), daysLeft: -2, health: "late",
    done: 20, inReview: 1, remaining: 4, total: 25, percent: 80, next: "Web pendiente resaltada" });
  assert.equal(general.next.title, "General en curso"); assert.equal(general.next.status, "in_progress");
  assert.deepEqual([general.done, general.inReview, general.remaining, general.total, general.percent, general.health, general.daysLeft],
    [0, 0, 4, 4, 0, "risk", 3]);
  assert.deepEqual(summary.totals, { done: 20, inReview: 1, remaining: 8, total: 29, percent: 69 });
  assert.equal(summary.feedbackOpen, 1);
  assert.equal(summary.closedLast7Days.count, 20);
  assert.equal(summary.closedLast7Days.items.length, 5);
  assert(summary.closedLast7Days.items.every((item) => item.areaId === "web" && item.title.startsWith("Web hecha")));
  assert(!("text" in summary));
  assert(oldest.key);

  const text = await call("summary?format=text");
  assert.deepEqual(Object.keys(text).sort(), ["text", "today"]);
  const lines = text.text.split("\n");
  assert.match(lines[0], /^Proyecto demo · [a-zé]{3} \d{1,2} [a-z]{3}$/);
  assert.deepEqual(lines.slice(1), ["", "Web     ▓▓▓▓▓▓▓▓░░  80%", "General ░░░░░░░░░░   0%", "", "Total   ▓▓▓▓▓▓▓░░░  69%"]);
  const invalid = await server.fetch("/api/v1/summary?format=json", { headers: agent });
  assert.equal(invalid.status, 400);
});

test("MCP get_summary returns the same recap and a compact text form", async () => {
  const client = new Client({ name: "summary-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", base), {
    requestInit: { headers: { authorization: `Bearer ${code}`, "x-taski-member": "alex" } },
    fetch: (url, init) => server.fetch(url, init),
  }));
  const tool = (await client.listTools()).tools.find((entry) => entry.name === "get_summary");
  assert.equal(tool.annotations.readOnlyHint, true);
  const full = await client.callTool({ name: "get_summary", arguments: {} });
  assert(!full.isError, JSON.stringify(full));
  assert.deepEqual(full.structuredContent, await call("summary"));
  const text = await client.callTool({ name: "get_summary", arguments: { format: "text" } });
  assert.match(text.structuredContent.text, /Total {3}▓▓▓▓▓▓▓░░░ {2}69%/);
  await client.close();
});
