import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createTestHarness } from "wrangler";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const code = "horizon-test-only-code";
const server = createTestHarness({ workers: [{ configPath: "./wrangler.jsonc", vars: { TASKI_TEAM_ACCESS_CODE: code } }] });
const agent = { authorization: `Bearer ${code}`, "x-taski-member": "alex", "content-type": "application/json" };
const send = (path, method = "GET", body, headers = agent) =>
  server.fetch(`/api/v1/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
const json = async (response) => ({ status: response.status, body: await response.json() });
let base, db, person;
before(async () => {
  base = (await server.listen()).url;
  const worker = server.getWorker();
  await worker.applyD1Migrations("DB");
  db = (await worker.getEnv()).DB;
  const login = await server.fetch("/api/v1/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, memberId: "taylor" }) });
  person = { cookie: login.headers.get("set-cookie").split(";")[0], "content-type": "application/json" };
});
after(() => server.close());

const markdown = "# Escanear facturas\n\nEscanear la factura y **generar el pedido**.\n\n## Pasos\n\n- [ ] Confirmar con el banco\n- Prototipo\n\n| A | B |\n|---|---|\n| 1 | 2 |\n";

test("documents are created from Markdown, listed and read as Markdown or blocks", async () => {
  assert.equal((await server.fetch("/api/v1/horizon")).status, 401);
  const created = await json(await send("horizon", "POST", { markdown, areaId: "web", idempotencyKey: "create-scan" }));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.deepEqual(Object.keys(created.body).sort(), ["changed", "id", "version"]);
  assert.equal(created.body.version, 1);
  const replay = await json(await send("horizon", "POST", { markdown, areaId: "web", idempotencyKey: "create-scan" }));
  assert.deepEqual(replay.body, created.body);

  await send("horizon", "POST", { title: "Archivada", status: "archived", idempotencyKey: "create-archived" });
  const list = (await json(await send("horizon"))).body.items;
  assert.deepEqual(list.map((item) => item.title), ["Escanear facturas", "Archivada"]);
  assert.deepEqual(list[0], { ...list[0], status: "idea", areaId: "web", excerpt: "Escanear la factura y generar el pedido.", blockCount: 5, tasks: { done: 0, total: 1 }, createdBy: "alex" });
  assert(!("blocks" in list[0]));
  assert.deepEqual((await json(await send("horizon?status=archived"))).body.items.map((item) => item.title), ["Archivada"]);
  assert.deepEqual((await json(await send("horizon?areaId=web"))).body.items.map((item) => item.title), ["Escanear facturas"]);

  const asMarkdown = (await json(await send(`horizon/${created.body.id}`))).body.doc;
  assert.equal(asMarkdown.markdown, "# Escanear facturas\n\nEscanear la factura y **generar el pedido**.\n\n## Pasos\n\n- [ ] Confirmar con el banco\n- Prototipo\n\n| A | B |\n|---|---|\n| 1 | 2 |\n");
  assert(!("blocks" in asMarkdown));
  const asBlocks = (await json(await send(`horizon/${created.body.id}?format=blocks`))).body.doc;
  assert.deepEqual(asBlocks.blocks.map((block) => block.type), ["p", "h2", "todo", "li", "table"]);
  assert.equal((await send("horizon/no-existe")).status, 404);
});

test("updates are versioned, audited and validated", async () => {
  const { body: created } = await json(await send("horizon", "POST", { title: "Sticky notes", idempotencyKey: "create-sticky" }));
  const { body: { doc } } = await json(await send(`horizon/${created.id}?format=blocks`));
  const blocks = [{ id: "a1", type: "h2", text: "Opciones" }, { id: "a2", type: "todo", text: "Prototipo", done: true }];
  const updated = await json(await send(`horizon/${created.id}`, "PATCH", { expectedVersion: doc.version, idempotencyKey: "edit-1", blocks, status: "exploring" }, person));
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.deepEqual(updated.body.changed.sort(), ["blocks", "status"]);
  const stale = await json(await send(`horizon/${created.id}`, "PATCH", { expectedVersion: doc.version, idempotencyKey: "edit-stale", title: "Otro" }));
  assert.equal(stale.status, 409); assert.equal(stale.body.error.code, "VERSION_CONFLICT");
  const same = await json(await send(`horizon/${created.id}`, "PATCH", { expectedVersion: 2, idempotencyKey: "edit-same", blocks }));
  assert.equal(same.body.error.code, "EMPTY_UPDATE");
  for (const [body, expected] of [
    [{ expectedVersion: 2, idempotencyKey: "bad-area", areaId: "pagos" }, "UNKNOWN_AREA"],
    [{ expectedVersion: 2, idempotencyKey: "bad-status", status: "done" }, "INVALID_INPUT"],
    [{ expectedVersion: 2, idempotencyKey: "both", markdown: "x", blocks: [] }, "INVALID_INPUT"],
    [{ expectedVersion: 2, idempotencyKey: "bad-block", blocks: [{ id: "x", type: "video", text: "" }] }, "INVALID_INPUT"],
  ]) assert.equal((await json(await send(`horizon/${created.id}`, "PATCH", body))).body.error.code, expected);
  assert.equal((await json(await send("horizon", "POST", { markdown: "sin título", idempotencyKey: "no-title" }))).body.error.code, "INVALID_INPUT");

  const { results } = await db.prepare("SELECT doc_version, actor, changes FROM horizon_activity WHERE doc_id=? ORDER BY seq").bind(created.id).all();
  assert.deepEqual(results.map((row) => row.doc_version), [1, 2]);
  assert.deepEqual(JSON.parse(results[1].changes), { status: { before: "idea", after: "exploring" }, blocks: { before: 0, after: 2 } });
  assert.equal(JSON.parse(results[1].actor).kind, "person");
  await assert.rejects(db.prepare("DELETE FROM horizon_activity").run(), /AUDIT_APPEND_ONLY/);
});

test("only a person removes a document; it disappears from lists and reads", async () => {
  const { body: created } = await json(await send("horizon", "POST", { title: "Para borrar", idempotencyKey: "create-delete" }));
  const body = { expectedVersion: 1, idempotencyKey: "delete-1" };
  assert.equal((await send(`horizon/${created.id}`, "DELETE", body)).status, 403);
  const removed = await json(await send(`horizon/${created.id}`, "DELETE", body, person));
  assert.equal(removed.status, 200); assert.deepEqual(removed.body.changed, ["deleted"]);
  assert.deepEqual((await json(await send(`horizon/${created.id}`, "DELETE", body, person))).body, removed.body);
  assert.equal((await send(`horizon/${created.id}`)).status, 404);
  assert(!(await json(await send("horizon"))).body.items.some((item) => item.id === created.id));
});

test("MCP agents list, read and save documents with Markdown", async () => {
  const client = new Client({ name: "horizon-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", base), {
    requestInit: { headers: { authorization: `Bearer ${code}`, "x-taski-member": "alex" } }, fetch: (url, init) => server.fetch(url, init),
  }));
  const tools = (await client.listTools()).tools;
  assert.equal(tools.find((tool) => tool.name === "get_horizon").annotations.readOnlyHint, true);
  assert.equal(tools.find((tool) => tool.name === "save_horizon").annotations.readOnlyHint, false);
  const saved = await client.callTool({ name: "save_horizon", arguments: { markdown: "# Idea MCP\n\n- [ ] Probar", idempotencyKey: "mcp-create" } });
  assert(!saved.isError, JSON.stringify(saved));
  const read = await client.callTool({ name: "get_horizon", arguments: { id: saved.structuredContent.id } });
  assert.equal(read.structuredContent.doc.markdown, "# Idea MCP\n\n- [ ] Probar\n");
  const edited = await client.callTool({ name: "save_horizon", arguments: { id: saved.structuredContent.id, expectedVersion: 1, idempotencyKey: "mcp-edit", markdown: "- [x] Probar" } });
  assert.equal(edited.structuredContent.version, 2);
  const list = await client.callTool({ name: "list_horizon", arguments: {} });
  assert(list.structuredContent.items.some((item) => item.title === "Idea MCP" && item.tasks.done === 1));
  await client.close();
});
