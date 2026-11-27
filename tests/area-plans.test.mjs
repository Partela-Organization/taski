import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createTestHarness } from "wrangler";

const code = "area-test-only-code";
const server = createTestHarness({ workers: [{ configPath: "./wrangler.jsonc", vars: { TASKI_TEAM_ACCESS_CODE: code } }] });
const agent = { authorization: `Bearer ${code}`, "x-taski-member": "alex", "content-type": "application/json" };
const send = (path, method = "GET", body, headers = agent) => server.fetch(`/api/v1/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
let db;
before(async () => { await server.listen(); const worker = server.getWorker(); await worker.applyD1Migrations("DB"); db = (await worker.getEnv()).DB; });
after(() => server.close());

test("tracks list configured areas in order with default plans", async () => {
  assert.equal((await server.fetch("/api/v1/areas")).status, 401);
  const { items } = await (await send("areas")).json();
  assert.deepEqual(items, [
    { id: "general", label: "General", priority: 2, targetDate: null, version: 0, updatedBy: null, updatedAt: null },
    { id: "web", label: "Web", priority: 2, targetDate: null, version: 0, updatedBy: null, updatedAt: null },
  ]);
});

test("updates are versioned, idempotent and audited with before/after values", async () => {
  const first = { expectedVersion: 0, idempotencyKey: "plan-web-1", priority: 1, targetDate: "2026-12-05" };
  const response = await send("areas/web", "PATCH", first);
  assert.equal(response.status, 200);
  const receipt = await response.json();
  assert.deepEqual(receipt, { areaId: "web", version: 1, changed: ["priority", "targetDate"] });
  assert.deepEqual(await (await send("areas/web", "PATCH", first)).json(), receipt);
  const changedRetry = await send("areas/web", "PATCH", { ...first, priority: 3 });
  assert.equal((await changedRetry.json()).error.code, "IDEMPOTENCY_CONFLICT");

  const stale = await send("areas/web", "PATCH", { expectedVersion: 0, idempotencyKey: "plan-web-stale", priority: 3 });
  assert.equal(stale.status, 409); assert.equal((await stale.json()).error.code, "VERSION_CONFLICT");
  const cleared = await (await send("areas/web", "PATCH", { expectedVersion: 1, idempotencyKey: "plan-web-2", targetDate: null })).json();
  assert.deepEqual(cleared, { areaId: "web", version: 2, changed: ["targetDate"] });

  const web = (await (await send("areas")).json()).items.find((item) => item.id === "web");
  assert.equal(web.priority, 1); assert.equal(web.targetDate, null); assert.equal(web.version, 2); assert.equal(web.updatedBy, "alex");
  const { results } = await db.prepare("SELECT * FROM area_activity WHERE area_id='web' ORDER BY seq").all();
  assert.deepEqual(results.map((row) => JSON.parse(row.changes)), [
    { priority: { before: 2, after: 1 }, targetDate: { before: null, after: "2026-12-05" } },
    { targetDate: { before: "2026-12-05", after: null } },
  ]);
  const actor = JSON.parse(results[0].actor);
  assert.equal(actor.memberId, "alex"); assert.equal(actor.kind, "agent"); assert.equal(actor.channel, "http");
  await assert.rejects(db.prepare("DELETE FROM area_activity").run(), /AUDIT_APPEND_ONLY/);
  await assert.rejects(db.prepare("DELETE FROM area_plans").run(), /AREA_PLAN_DELETE_DISABLED/);
});

test("invalid input, unknown areas and empty changes are explicit", async () => {
  const cases = [
    ["areas/web", { expectedVersion: 2, idempotencyKey: "bad-date", targetDate: "2026-02-30" }, "INVALID_INPUT"],
    ["areas/web", { expectedVersion: 2, idempotencyKey: "bad-format", targetDate: "5/12/2026" }, "INVALID_INPUT"],
    ["areas/web", { expectedVersion: 2, idempotencyKey: "bad-priority", priority: 4 }, "INVALID_INPUT"],
    ["areas/web", { expectedVersion: -1, idempotencyKey: "bad-version", priority: 1 }, "INVALID_INPUT"],
    ["areas/web", { expectedVersion: 2, idempotencyKey: "same-values", priority: 1 }, "EMPTY_UPDATE"],
    ["areas/pagos", { expectedVersion: 0, idempotencyKey: "unknown", priority: 1 }, "UNKNOWN_AREA"],
  ];
  for (const [path, body, codeName] of cases) {
    const response = await send(path, "PATCH", body);
    assert.equal(response.status, 400, codeName); assert.equal((await response.json()).error.code, codeName);
  }
  const extra = await send("areas/web", "PATCH", { expectedVersion: 2, idempotencyKey: "extra", label: "Nueva" });
  assert.equal((await extra.json()).error.code, "INVALID_INPUT");
  assert.equal((await send("areas/web", "DELETE")).status, 405);
});

test("concurrent first plans for one track confirm a single version", async () => {
  const attempt = (n) => send("areas/general", "PATCH", { expectedVersion: 0, idempotencyKey: `race-${n}`, priority: n });
  const responses = await Promise.all([attempt(1), attempt(3)]);
  const statuses = responses.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 409]);
  const { results } = await db.prepare("SELECT area_version FROM area_activity WHERE area_id='general'").all();
  assert.deepEqual(results.map((row) => row.area_version), [1]);
});

test("a web session updates a track as a person", async () => {
  const login = await server.fetch("/api/v1/session", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, memberId: "taylor" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const general = (await (await send("areas")).json()).items.find((item) => item.id === "general");
  const response = await send("areas/general", "PATCH", { expectedVersion: general.version, idempotencyKey: "web-plan", targetDate: "2026-12-12" },
    { cookie, "content-type": "application/json" });
  assert.equal(response.status, 200);
  const row = await db.prepare("SELECT actor FROM area_activity WHERE area_id='general' ORDER BY seq DESC LIMIT 1").first();
  const actor = JSON.parse(row.actor);
  assert.equal(actor.memberId, "taylor"); assert.equal(actor.kind, "person"); assert.equal(actor.channel, "web");
});
