import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createTestHarness } from "wrangler";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { operationNames } from "../src/adapters/api/operations.ts";
import { mcp } from "../src/adapters/mcp/server.ts";
import { installation } from "../src/config/index.ts";

const code = "mcp-test-only-code";
const server = createTestHarness({ workers: [{ configPath: "./wrangler.jsonc", vars: { TASKI_TEAM_ACCESS_CODE: code } }] });
let base;
const clients = [];
before(async () => { base = (await server.listen()).url; await server.getWorker().applyD1Migrations("DB"); });
after(async () => { for (const client of clients) await client.close(); await server.close(); });
async function connect(mode = "legacy", memberId = "alex") {
  const client = new Client({ name: "taski-protocol-test", version: "1.0.0" }, { versionNegotiation: { mode } });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", base), {
    requestInit: { headers: { authorization: `Bearer ${code}`, "x-taski-member": memberId, "x-taski-client": "sdk-test" } },
    fetch: (url, init) => server.fetch(url, init),
  }));
  return client;
}
const payload = (result) => { assert(!result.isError, JSON.stringify(result)); assert.deepEqual(result.content, []); return result.structuredContent; };

test("MCP discovery and execution use persistent core for legacy and modern protocols", async () => {
  for (const mode of ["legacy", { pin: "2026-07-28" }]) {
    const client = await connect(mode);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name), [...operationNames]);
    assert(tools.every((t) => t.inputSchema.type === "object" && t.outputSchema.type === "object"));
    assert(tools.every((t) => t.annotations.idempotentHint && !t.annotations.openWorldHint));
    assert.match(client.getInstructions(), /review/);
    const project = payload(await client.callTool({ name: "get_project", arguments: {} }));
    assert.equal(project.project.members.length, 3);
    const created = payload(await client.callTool({ name: "create_ticket", arguments: {
      title: "MCP workflow", assigneeId: "sam", idempotencyKey: `create-${typeof mode}`,
    } }));
    const updated = payload(await client.callTool({ name: "update_ticket", arguments: {
      key: created.key, expectedVersion: 1, idempotencyKey: `review-${typeof mode}`, changes: { status: "in_review" }, comment: "Ready for review",
    } }));
    assert.equal(updated.version, 2);
    const added = payload(await client.callTool({ name: "add_comment", arguments: {
      key: created.key, expectedVersion: 2, idempotencyKey: `comment-${typeof mode}`, body: "Additional context",
    } }));
    assert.equal(added.version, 3);
    const linked = payload(await client.callTool({ name: "link_pull_request", arguments: {
      key: created.key, expectedVersion: 3, idempotencyKey: `pr-${typeof mode}`, url: "https://github.com/example/demo/pull/7",
    } }));
    assert.equal(linked.version, 4);
    const list = payload(await client.callTool({ name: "list_tickets", arguments: { assigneeId: "sam" } }));
    assert(list.items.some((t) => t.key === created.key)); assert(list.items.every((t) => !("description" in t)));
    const cached = payload(await client.callTool({ name: "get_project", arguments: { knownVersion: project.configVersion } }));
    assert.equal(cached.notModified, true); assert(!("project" in cached));
    const detail = payload(await client.callTool({ name: "get_ticket", arguments: { key: created.key } }));
    assert.equal(detail.ticket.assigneeId, "sam"); assert.equal(detail.comments[0].actor.channel, "mcp");
    assert.equal(detail.comments[0].actor.kind, "agent"); assert.equal(detail.comments[0].body, "Ready for review");
    const denied = await client.callTool({ name: "update_ticket", arguments: {
      key: created.key, expectedVersion: 4, idempotencyKey: "deny-done", changes: { status: "done" }, comment: "Must not remain",
    } });
    assert(denied.isError); assert.match(denied.content[0].text, /REVIEW_REQUIRED/);
    assert.deepEqual(detail.comments.map((c) => c.body), ["Ready for review", "Additional context"]);
    assert.equal(detail.ticket.prUrl, "https://github.com/example/demo/pull/7");
    const activity = payload(await client.callTool({ name: "list_activity", arguments: { cursor: project.activityCursor } }));
    assert(activity.items.some((e) => e.ticketKey === created.key && e.actor.client === "sdk-test"));
    const http = await server.fetch(`/api/v1/tickets/${created.key}`, { headers: { authorization: `Bearer ${code}`, "x-taski-member": "alex" } });
    const shared = await http.json(); assert.equal(shared.ticket.version, 4); assert.equal(shared.comments.length, 2);
    const changed = await server.fetch(`/api/v1/tickets/${created.key}`, { method: "PATCH", headers: {
      authorization: `Bearer ${code}`, "x-taski-member": "alex", "content-type": "application/json",
    }, body: JSON.stringify({ expectedVersion: 4, idempotencyKey: `http-${typeof mode}`, changes: { title: "Edited over HTTP" } }) });
    assert.equal(changed.status, 200);
    assert.equal(payload(await client.callTool({ name: "get_ticket", arguments: { key: created.key } })).ticket.title, "Edited over HTTP");
  }
});

test("MCP authenticates discovery and rejects wrong hosts, invalid members and web cookies", async () => {
  const headers = { authorization: `Bearer ${code}`, "x-taski-member": "alex" };
  assert.equal((await server.fetch("/mcp", { headers: { ...headers, authorization: "Bearer wrong" } })).status, 401);
  assert.equal((await server.fetch("/mcp", { headers: { ...headers, "x-taski-member": "missing" } })).status, 400);
  // The harness rewrites Host to its local worker. Invoke the boundary directly for this check.
  const rejected = await mcp(new Request("http://127.0.0.1:8787/mcp", { headers: { ...headers, host: "other.example" } }),
    await server.getWorker().getEnv(), installation);
  assert.equal(rejected.status, 403); assert.equal(rejected.headers.get("cache-control"), "no-store");
  const session = await server.fetch("/api/v1/session", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, memberId: "alex" }) });
  assert.equal(session.status, 200);
  const cookie = session.headers.get("set-cookie").split(";")[0];
  assert.equal((await server.fetch("/mcp", { headers: { cookie } })).status, 401);
});

test("MCP rejects malformed and oversized messages and invalid tool arguments before writes", async () => {
  const db = (await server.getWorker().getEnv()).DB;
  const count = await db.prepare("SELECT COUNT(*) AS n FROM tickets").first("n");
  const client = await connect();
  for (const args of [{ title: 123, idempotencyKey: "wrong-type" }, { title: "x".repeat(241), idempotencyKey: "long-title" }, { title: "Missing key" }]) {
    assert((await client.callTool({ name: "create_ticket", arguments: args })).isError);
  }
  for (const [body, contentType, status] of [
    ["{", "application/json", 400], ["{}", "text/plain", 415],
    [JSON.stringify({ padding: "x".repeat(1048576) }), "application/json", 413],
  ]) {
    const response = await server.fetch("/mcp", { method: "POST", headers: { authorization: `Bearer ${code}`, "x-taski-member": "alex",
      "content-type": contentType, accept: "application/json, text/event-stream" }, body });
    assert.equal(response.status, status); assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM tickets").first("n"), count);
});

test("MCP preserves retries and conflicts and reports rolled-back storage failures without leaking internals", async () => {
  const client = await connect();
  const call = (name, args) => client.callTool({ name, arguments: args });
  const errorCode = (result) => { assert(result.isError, JSON.stringify(result)); return JSON.parse(result.content[0].text).error.code; };
  const input = { title: "Rollback over MCP", description: "Context ".repeat(2000), idempotencyKey: "rollback-create" };
  const r = payload(await call("create_ticket", input));
  assert.deepEqual(payload(await call("create_ticket", input)), r);
  assert.equal(errorCode(await call("create_ticket", { ...input, title: "Changed retry" })), "IDEMPOTENCY_CONFLICT");
  const args = { key: r.key, expectedVersion: 1, idempotencyKey: "rollback-update", changes: { status: "in_review" }, comment: "Atomic progress" };
  const db = (await server.getWorker().getEnv()).DB;
  await db.prepare("CREATE TRIGGER mcp_audit_failure BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT,'PRIVATE_STORAGE_DETAIL'); END").run();
  try {
    const failed = await call("update_ticket", args);
    assert.equal(errorCode(failed), "INTERNAL_ERROR"); assert(!JSON.stringify(failed).includes("PRIVATE_STORAGE_DETAIL"));
    const unchanged = payload(await call("get_ticket", { key: r.key, view: "full" }));
    assert.equal(unchanged.ticket.version, 1); assert.deepEqual(unchanged.comments, []);
    assert.equal(unchanged.ticket.description, input.description);
  } finally { await db.prepare("DROP TRIGGER mcp_audit_failure").run(); }
  assert.equal(payload(await call("update_ticket", args)).version, 2);
  assert.equal(errorCode(await call("update_ticket", { ...args, idempotencyKey: "stale-update" })), "VERSION_CONFLICT");
});

test("MCP rejects missing auth, cross-origin requests and invalid input without creating tickets", async () => {
  assert.equal((await server.fetch("/mcp")).status, 401);
  assert.equal((await server.fetch("/mcp", { headers: { origin: "https://other.example" } })).status, 403);
  const client = await connect();
  const count = payload(await client.callTool({ name: "list_tickets", arguments: {} })).items.length;
  const invalid = await client.callTool({ name: "create_ticket", arguments: { title: "Invalid", idempotencyKey: "invalid", completionFor: ["DEMO-001"] } });
  assert(invalid.isError);
  assert.equal(payload(await client.callTool({ name: "list_tickets", arguments: {} })).items.length, count);
});
