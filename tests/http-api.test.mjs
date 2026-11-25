import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createTestHarness } from "wrangler";

const code = "api-test-only-code";
const server = createTestHarness({ workers: [{ configPath: "./wrangler.jsonc", vars: { TASKI_TEAM_ACCESS_CODE: code } }] });
const headers = { authorization: `Bearer ${code}`, "x-taski-member": "alex", "content-type": "application/json" };
const send = (path, method = "GET", body, extra = {}) => server.fetch(`/api/v1/${path}`, { method, headers: { ...headers, ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
before(async () => { await server.listen(); await server.getWorker().applyD1Migrations("DB"); });
after(() => server.close());

test("protected API creates and assigns; work reads include full text and recent comments", async () => {
  assert.equal((await server.fetch("/api/v1/tickets")).status, 401);
  const response = await send("tickets", "POST", { title: "API ticket", description: "Long ".repeat(2000), assigneeId: "sam", idempotencyKey: "api-create" });
  assert.equal(response.status, 201); const r = await response.json();
  const update = await send(`tickets/${r.key}`, "PATCH", { expectedVersion: 1, idempotencyKey: "api-update", changes: { status: "in_review" }, comment: "Ready" });
  assert.equal(update.status, 200);
  const work = await (await send(`tickets/${r.key}`)).json();
  assert.equal(work.ticket.description.length, 10000); assert.equal(work.comments[0].body, "Ready");
  assert.equal(work.ticket.assigneeId, "sam"); assert.equal(work.ticket.status, "in_review");
  const list = await (await send("tickets")).json();
  assert.equal(list.items.length, 1); assert(!("description" in list.items[0])); assert.equal(list.nextCursor, null);
  const forbidden = await send(`tickets/${r.key}`, "PATCH", { expectedVersion: 2, idempotencyKey: "api-close", changes: { status: "done" } });
  assert.equal(forbidden.status, 403); assert.equal((await forbidden.json()).error.code, "REVIEW_REQUIRED");
});

test("project caching and cursor-only pagination avoid repeating known data", async () => {
  const project = await (await send("project")).json();
  const cached = await (await send(`project?knownVersion=${project.configVersion}`)).json();
  assert.equal(cached.notModified, true); assert(!("project" in cached));
  for (let n = 0; n < 4; n++) await send("tickets", "POST", { title: `Page ${n}`, assigneeId: "sam", idempotencyKey: `page-${n}` });
  const first = await (await send("tickets?limit=2&assigneeId=sam")).json();
  const all = [...first.items]; let next = first.nextCursor;
  while (next) { const page = await (await send(`tickets?limit=2&cursor=${encodeURIComponent(next)}`)).json(); all.push(...page.items); next = page.nextCursor; }
  assert.equal(new Set(all.map((t) => t.key)).size, 5);
  const events = await (await send(`activity?cursor=${encodeURIComponent(project.activityCursor)}`)).json();
  assert.equal(events.items.length, 4);
  const empty = await (await send(`activity?cursor=${encodeURIComponent(events.nextCursor)}`)).json(); assert.deepEqual(empty.items, []);
  const stale = await send(`tickets?cursor=${encodeURIComponent(first.nextCursor)}`);
  assert.equal(stale.status, 200); // no write happened since the list snapshot
  await send("tickets", "POST", { title: "Invalidate snapshot", idempotencyKey: "snapshot" });
  assert.equal((await send(`tickets?cursor=${encodeURIComponent(first.nextCursor)}`)).status, 400);
});

test("older comments page without loss; invalid cursors and stale writes are explicit", async () => {
  const r = await (await send("tickets", "POST", { title: "Conversation", idempotencyKey: "conversation" })).json();
  for (let n = 0; n < 7; n++) {
    const response = await send(`tickets/${r.key}/comments`, "POST", { body: `Comment ${n}`, expectedVersion: n + 1, idempotencyKey: `comment-${n}` });
    assert.equal(response.status, 200);
  }
  const first = await (await send(`tickets/${r.key}?commentsLimit=3`)).json();
  const ids = new Set(first.comments.map((c) => c.id)); let cursor = first.nextCommentsCursor;
  while (cursor) { const page = await (await send(`tickets/${r.key}?commentsLimit=3&commentsCursor=${encodeURIComponent(cursor)}`)).json(); for (const c of page.comments) ids.add(c.id); cursor = page.nextCommentsCursor; }
  assert.equal(ids.size, 7);
  assert.equal((await send("activity?cursor=broken")).status, 400);
  const conflict = await send(`tickets/${r.key}`, "PATCH", { expectedVersion: 1, idempotencyKey: "conflict", changes: { title: "Stale" } });
  assert.equal(conflict.status, 409);
  const bad = await send(`tickets/${r.key}`, "PATCH", { key: "another", expectedVersion: 8, idempotencyKey: "inject", changes: { title: "Bad" } });
  assert.equal(bad.status, 400);
});

test("recent order paginates by creation date, breaking ties by ticket number", async () => {
  const db = (await server.getWorker().getEnv()).DB;
  const dates = ["2026-11-03T09:00:00.000Z", "2026-11-01T09:00:00.000Z", "2026-11-03T09:00:00.000Z"];
  const keys = [];
  for (const [index, date] of dates.entries()) {
    const row = await db.prepare(`INSERT INTO tickets(id,prefix,base_url,title,area_id,created_by,created_at)
      VALUES(?,'DEMO','http://127.0.0.1:8787',?,'web','alex',?) RETURNING key`)
      .bind(`order-${index}`, `Dated task ${index}`, date).first();
    keys.push(row.key);
  }
  const first = await (await send("tickets?order=recent&view=work&areaId=web&limit=1")).json();
  assert.equal(first.items[0].key, keys[2]);
  assert.equal(first.items[0].createdAt, dates[2]);
  const second = await (await send(`tickets?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
  assert.equal(second.items[0].key, keys[0]);
  const third = await (await send(`tickets?limit=1&cursor=${encodeURIComponent(second.nextCursor)}`)).json();
  assert.equal(third.items[0].key, keys[1]);
  assert.equal(third.nextCursor, null);
  const originalOrder = await (await send("tickets?view=work&areaId=web")).json();
  assert.deepEqual(originalOrder.items.map(({ key }) => key), keys);
  assert(!("createdAt" in originalOrder.items[0]));
  assert.equal((await send("tickets?order=invalid")).status, 400);
});

test("a team session can delete feedback once with version, retry and audit protection", async () => {
  const { key } = await (await send("tickets", "POST", { title: "Feedback to remove", type: "feedback", idempotencyKey: "delete-fixture" })).json();
  const path = `tickets/${key}`;
  const { ticket } = await (await send(`${path}?view=full`)).json();
  const db = (await server.getWorker().getEnv()).DB;
  await db.prepare("INSERT INTO ticket_key_aliases (key,ticket_id) VALUES (?,?)").bind("OLD-001", ticket.id).run();
  const { activityCursor } = await (await send("project")).json();
  const mutation = { expectedVersion: ticket.version, idempotencyKey: "delete-feedback" };
  assert.equal((await send(path, "DELETE", mutation)).status, 403);

  const login = await server.fetch("/api/v1/session", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, memberId: "sam" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const remove = (body) => server.fetch(`/api/v1/${path}`, { method: "DELETE",
    headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await remove({ ...mutation, expectedVersion: ticket.version + 1 })).status, 409);
  const deleted = await remove(mutation);
  assert.equal(deleted.status, 200);
  const receipt = await deleted.json();
  assert.deepEqual(receipt.changed, ["deleted"]);
  assert.equal(receipt.version, ticket.version + 1);
  assert.deepEqual(await (await remove(mutation)).json(), receipt);
  assert.equal((await remove({ ...mutation, idempotencyKey: "another-delete" })).status, 404);

  for (const reference of [key, ticket.id, "OLD-001"]) assert.equal((await send(`tickets/${reference}`)).status, 404);
  assert.equal((await send(`${path}/attachments`)).status, 404);
  assert.equal((await send(path, "PATCH", { expectedVersion: receipt.version, idempotencyKey: "edit-deleted", changes: { title: "Changed" } })).status, 404);
  for (const order of ["", "&order=recent"]) {
    const { items } = await (await send(`tickets?type=feedback${order}`)).json();
    assert(!items.some((item) => item.key === key));
  }
  const { items } = await (await send(`activity?cursor=${encodeURIComponent(activityCursor)}`)).json();
  assert.equal(items.length, 1);
  assert.equal(items[0].ticketKey, key);
  assert.equal(items[0].actor.memberId, "sam");
  assert.deepEqual(items[0].changes.deleted, { before: false, after: true });
});
