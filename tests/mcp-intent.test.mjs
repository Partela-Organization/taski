import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createTestHarness } from "wrangler";
import { Operations } from "../src/adapters/api/operations.ts";
import { TicketService } from "../src/application/tickets.ts";
import { D1TicketRepository } from "../src/adapters/storage/d1-tickets.ts";
import { installation } from "../src/config/index.ts";
import { runtime } from "../src/adapters/worker/runtime.ts";

const code = "intent-test-only-code";
const server = createTestHarness({ workers: [{ configPath: "./wrangler.jsonc", vars: { TASKI_TEAM_ACCESS_CODE: code } }] });
const clients = [];
let url, db;
before(async () => {
  ({ url } = await server.listen()); await server.getWorker().applyD1Migrations("DB");
  db = (await server.getWorker().getEnv()).DB;
});
after(async () => { try { for (const client of clients) await client.close(); } finally { await server.close(); } });
async function connect(mode = "legacy") {
  const client = new Client({ name: "intent-test", version: "1.0.0" }, { versionNegotiation: { mode } });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", url), {
    requestInit: { headers: { authorization: `Bearer ${code}`, "x-taski-member": "alex" } },
    fetch: (input, init) => server.fetch(input, init),
  }));
  const raw = (name, args = {}) => client.callTool({ name, arguments: args });
  const call = async (name, args = {}) => {
    const result = await raw(name, args);
    assert(!result.isError, JSON.stringify(result)); assert.deepEqual(result.content, []);
    return result.structuredContent;
  };
  return { call, raw };
}
function errorCode(result) {
  assert(result.isError, JSON.stringify(result)); return JSON.parse(result.content[0].text).error.code;
}

for (const mode of ["legacy", { pin: "2026-07-28" }]) {
  const label = typeof mode === "string" ? mode : mode.pin;
  test(`MCP ${label}: views recover every field and comment without truncating long content`, async () => {
    const { call, raw } = await connect(mode);
    const description = "Before unique marker. " + "Texto ficticio íntegro. ".repeat(1000);
    const r = await call("create_ticket", { title: `Views ${label}`, description, idempotencyKey: `views-${label}` });
    for (let n = 0; n < 7; n++) await call("add_comment", {
      key: r.key, expectedVersion: n + 1, idempotencyKey: `view-comment-${label}-${n}`, body: `Comment ${n}`,
    });
    const work = await call("get_ticket", { key: r.key });
    assert.equal(work.ticket.description, description);
    assert.deepEqual(work.comments.map((c) => c.body), ["Comment 2", "Comment 3", "Comment 4", "Comment 5", "Comment 6"]);
    assert(work.omitted.includes("olderComments")); assert(work.nextCommentsCursor);
    const full = await call("get_ticket", { key: r.key, view: "full" });
    const summary = await call("get_ticket", { key: r.key, view: "summary" });
    for (const view of [summary, work]) {
      for (const key of Object.keys(full.ticket)) {
        if (!(key in view.ticket)) assert(view.omitted.includes(key), `Missing omitted signal for ${key}`);
      }
    }
    assert(!("description" in summary.ticket)); assert.deepEqual(summary.comments, []);
    assert(summary.omitted.includes("comments"));
    const all = [...work.comments]; let cursor = work.nextCommentsCursor;
    while (cursor) {
      const page = await call("get_ticket", { key: r.key, commentsCursor: cursor });
      all.push(...page.comments); cursor = page.nextCommentsCursor;
    }
    assert.equal(new Set(all.map((c) => c.id)).size, 7);
    assert.deepEqual(all.map((c) => c.body).sort(), Array.from({ length: 7 }, (_, n) => `Comment ${n}`));
    const noComments = await call("get_ticket", { key: r.key, commentsLimit: 0 });
    assert.equal(noComments.ticket.description, description); assert.deepEqual(noComments.comments, []);
    assert(noComments.omitted.includes("comments"));
    for (const args of [{ commentsLimit: 51 }, { commentsLimit: -1 }]) {
      assert((await raw("get_ticket", { key: r.key, ...args })).isError);
    }
    assert((await raw("list_tickets", { limit: 51 })).isError);
  });

  test(`MCP ${label}: patch, PR, state and progress commit in one version and one audit event`, async () => {
    const { call, raw } = await connect(mode);
    const description = "Unique start. " + "Long context. ".repeat(1000);
    const r = await call("create_ticket", { title: `Compound ${label}`, description, idempotencyKey: `compound-${label}` });
    const baseline = await call("get_project");
    const args = { key: r.key, expectedVersion: 1, idempotencyKey: `compound-update-${label}`,
      changes: { status: "in_review", prUrl: "https://github.com/example/demo/pull/9" },
      descriptionPatch: { find: "Unique start.", replace: "Changed start." }, comment: "Ready for review" };
    const receipt = await call("update_ticket", args);
    assert.equal(receipt.version, 2);
    assert.deepEqual(new Set(receipt.changed), new Set(["description", "status", "prUrl", "commentAdded"]));
    assert.deepEqual(await call("update_ticket", args), receipt);
    assert(!JSON.stringify(receipt).includes(description));
    const delta = await call("list_activity", { cursor: baseline.activityCursor, ticketKey: r.key });
    assert.equal(delta.items.length, 1);
    assert.deepEqual(delta.items[0].changes.description, { patch: args.descriptionPatch });
    assert.equal(delta.items[0].changes.commentAdded.id, receipt.commentId);
    assert.equal(delta.items[0].changes.prUrl.after, args.changes.prUrl);
    const work = await call("get_ticket", { key: r.key });
    assert.equal(work.ticket.description, description.replace("Unique start.", "Changed start."));
    assert.equal(work.ticket.status, "in_review"); assert.equal(work.comments.length, 1);
    assert.equal(errorCode(await raw("update_ticket", { ...args, idempotencyKey: `stale-${label}` })), "VERSION_CONFLICT");
    assert.equal(errorCode(await raw("update_ticket", { ...args, expectedVersion: 2, idempotencyKey: `patch-conflict-${label}`,
      descriptionPatch: { find: "missing marker", replace: "replacement" }, changes: { highlighted: true } })), "PATCH_CONFLICT");
    const after = await call("get_ticket", { key: r.key });
    assert.equal(after.ticket.version, 2); assert.equal(after.ticket.highlighted, false); assert.equal(after.comments.length, 1);
    assert.equal(errorCode(await raw("get_ticket", { key: r.key, commentsCursor: "broken" })), "INVALID_CURSOR");
  });
}

test("MCP resumes all incremental pages, rejects obsolete cursors and resynchronizes after epoch change", async () => {
  const { call, raw } = await connect();
  const r = await call("create_ticket", { title: "Incremental context", description: "Keep full text", idempotencyKey: "incremental-create" });
  for (let n = 0; n < 2; n++) await call("create_ticket", { title: `Pagination fixture ${n}`, idempotencyKey: `incremental-other-${n}` });
  const baseline = await call("get_project");
  const cached = await call("get_project", { knownVersion: baseline.configVersion });
  assert.equal(cached.notModified, true); assert(!("project" in cached));
  for (let n = 0; n < 6; n++) await call("update_ticket", { key: r.key, expectedVersion: n + 1,
    idempotencyKey: `incremental-${n}`, changes: { highlighted: n % 2 === 0 }, comment: `Progress ${n}` });
  const first = await call("list_activity", { cursor: baseline.activityCursor, limit: 2 });
  assert.equal(first.hasMore, true);
  const events = [...first.items]; let page = first;
  while (page.hasMore) {
    page = await call("list_activity", { cursor: page.nextCursor, limit: 2 });
    events.push(...page.items);
  }
  assert.deepEqual(events.map((e) => e.ticketVersion), [2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(events.map((e) => e.seq)).size, 6);
  assert(events.every((e) => !("description" in e.changes) && !("ticket" in e)));
  assert.equal((await call("list_activity", { cursor: page.nextCursor })).items.length, 0);
  assert.equal(errorCode(await raw("list_activity", { cursor: "broken" })), "INVALID_CURSOR");
  const future = JSON.parse(Buffer.from(baseline.activityCursor, "base64url").toString());
  future.after = Number.MAX_SAFE_INTEGER;
  assert.equal(errorCode(await raw("list_activity", { cursor: Buffer.from(JSON.stringify(future)).toString("base64url") })), "INVALID_CURSOR");
  const oldComments = await call("get_ticket", { key: r.key, commentsLimit: 2 });
  const oldList = await call("list_tickets", { limit: 2 });
  await call("update_ticket", { key: r.key, expectedVersion: 7, idempotencyKey: "invalidate-pages", comment: "New progress" });
  assert.equal(errorCode(await raw("get_ticket", { key: r.key, commentsCursor: oldComments.nextCommentsCursor })), "INVALID_CURSOR");
  assert.equal(errorCode(await raw("list_tickets", { cursor: oldList.nextCursor })), "INVALID_CURSOR");
  await db.prepare("UPDATE project_identity SET epoch='restored-fixture-epoch' WHERE singleton=1").run();
  assert.equal(errorCode(await raw("list_activity", { cursor: page.nextCursor })), "CURSOR_EXPIRED");
  const fresh = await call("get_project");
  let tickets = [], next;
  do {
    const listing = await call("list_tickets", { limit: 2, ...(next ? { cursor: next } : {}) });
    tickets.push(...listing.items); next = listing.nextCursor;
  } while (next);
  assert(tickets.some((t) => t.key === r.key && t.version === 8));
  const restored = await call("get_ticket", { key: r.key, view: "full" });
  assert.equal(restored.ticket.description, "Keep full text");
  assert.deepEqual((await call("list_activity", { cursor: fresh.activityCursor })).items, []);
});

test("configuration versions refresh member metadata instead of silently retaining an old catalog", async () => {
  const repo = new D1TicketRepository(db);
  const old = new Operations(new TicketService(repo, installation, runtime), installation);
  const first = await old.project({});
  const config = structuredClone(installation);
  config.configVersion++; config.members[0].name = "Alex demo renamed";
  const updated = new Operations(new TicketService(repo, config, runtime), config);
  const changed = await updated.project({ knownVersion: first.configVersion });
  assert.equal(changed.notModified, false);
  assert.equal(changed.project.members[0].name, "Alex demo renamed");
  const known = await updated.project({ knownVersion: changed.configVersion });
  assert.equal(known.notModified, true); assert(!("project" in known));
});
