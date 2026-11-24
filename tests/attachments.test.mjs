import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createTestHarness } from "wrangler";
import worker from "../src/adapters/worker/index.ts";
import { maxAttachmentBytes, maxTicketAttachments } from "../src/contracts/attachments.ts";

const code = "attachments-test-only";
const server = createTestHarness({ workers: [{ configPath: "./wrangler.jsonc", vars: { TASKI_TEAM_ACCESS_CODE: code } }] });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAFUlEQVR4nGOw7OggCTGMahjVgB0BADgh9sFCdXSXAAAAAElFTkSuQmCC", "base64");
const auth = (member) => ({ authorization: `Bearer ${code}`, "x-taski-member": member });
const alex = auth("alex");
const uploadHeaders = { "content-type": "image/png", "x-taski-filename": encodeURIComponent("Captura útil.png") };
const id = (number) => number.toString(16).padStart(32, "0");
before(async () => { await server.listen(); await server.getWorker().applyD1Migrations("DB"); });
after(() => server.close());

async function ticket(title) {
  const result = await server.fetch("/api/v1/tickets", { method: "POST", headers: { ...alex, "content-type": "application/json" },
    body: JSON.stringify({ title, type: "feedback", idempotencyKey: title }) });
  assert.equal(result.status, 201);
  const { key } = await result.json();
  return `/api/v1/tickets/${key}/attachments`;
}

test("private image upload is idempotent, tied to the ticket and removable by its uploader", async () => {
  const collection = await ticket("Feedback para adjuntar una captura");
  const other = await ticket("Feedback sin captura");
  const link = `${collection}/${id(1)}`;
  const session = await server.fetch("/api/v1/session", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, memberId: "alex" }) });
  const cookie = session.headers.get("set-cookie").split(";", 1)[0];
  const upload = (body = png, headers = {}) => server.fetch(link, {
    method: "PUT", body, headers: { cookie, ...uploadHeaders, ...headers },
  });

  assert.equal((await server.fetch(collection)).status, 401);
  assert.equal((await upload(png, { origin: "https://other.example" })).status, 403);
  assert.equal((await upload(png, { "content-type": "image/jpeg" })).status, 415);
  const results = await Promise.all([upload(), upload()]);
  assert.deepEqual(results.map(({ status }) => status), [200, 200]);
  const [first, replay] = await Promise.all(results.map((response) => response.json()));
  assert.deepEqual(first, replay);
  assert.equal(first.name, "Captura útil.png");
  assert.equal(first.createdBy, "alex");
  assert.equal((await upload(Buffer.concat([png, Buffer.from([0])]))).status, 409);

  const listed = await (await server.fetch(collection, { headers: auth("sam") })).json();
  assert.deepEqual(listed, { enabled: true, items: [{ ...first, canRemove: false }] });
  assert.equal((await server.fetch(`${other}/${id(1)}`, { headers: alex })).status, 404);
  assert.equal((await server.fetch(link)).status, 401);
  const download = await server.fetch(link, { headers: auth("sam") });
  assert.equal(download.headers.get("content-type"), "image/png");
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  assert.equal((await server.fetch(link, { method: "DELETE", headers: auth("sam") })).status, 403);
  for (let i = 0; i < 2; i++) assert.equal((await server.fetch(link, { method: "DELETE", headers: { cookie } })).status, 204);
  assert.equal((await server.fetch(link, { headers: alex })).status, 404);
  assert.equal((await upload()).status, 404);

  const { DB, ATTACHMENTS } = await server.getWorker().getEnv();
  const audit = await DB.prepare("SELECT ticket_id,uploader,removed_by,removed_at FROM ticket_attachments WHERE id=?").bind(id(1)).first();
  assert.equal(JSON.parse(audit.uploader).channel, "web");
  assert.equal(JSON.parse(audit.removed_by).memberId, "alex");
  assert.ok(audit.removed_at);
  assert.equal(await ATTACHMENTS.head(`ticket-images/${audit.ticket_id}/${id(1)}`), null);
  const disabled = await worker.fetch(new Request(`http://127.0.0.1:8787${collection}`, { headers: alex }),
    { DB, TASKI_TEAM_ACCESS_CODE: code });
  assert.deepEqual(await disabled.json(), { enabled: false, items: [] });
});

test("image uploads bound body size and reserve the per-ticket quota atomically", async () => {
  const collection = await ticket("Feedback con límite de imágenes");
  const upload = (number, body = png) => server.fetch(`${collection}/${id(number)}`, {
    method: "PUT", body, headers: { ...alex, ...uploadHeaders },
  });
  assert.equal((await upload(20, new Uint8Array(maxAttachmentBytes + 1))).status, 413);
  const results = await Promise.all(Array.from({ length: maxTicketAttachments + 1 }, (_, i) => upload(i + 1)));
  assert.equal(results.filter(({ status }) => status === 200).length, maxTicketAttachments);
  assert.equal(results.filter(({ status }) => status === 409).length, 1);
  assert.equal((await (await server.fetch(collection, { headers: alex })).json()).items.length, maxTicketAttachments);
});

test("a retry publishes a reserved image when storage succeeded before the server could confirm it", async () => {
  const collection = await ticket("Feedback con subida interrumpida");
  const link = `${collection}/${id(1)}`;
  const settings = { method: "PUT", body: png, headers: { ...alex, ...uploadHeaders } };
  const { DB, ATTACHMENTS } = await server.getWorker().getEnv();
  const interrupted = await worker.fetch(new Request(`http://127.0.0.1:8787${link}`, settings), {
    DB, TASKI_TEAM_ACCESS_CODE: code,
    ATTACHMENTS: { put: async (...args) => {
      await ATTACHMENTS.put(...args);
      throw new Error("R2 wrote the object before the connection failed");
    } },
  });
  assert.equal(interrupted.status, 500);
  assert.equal((await server.fetch(link, { headers: alex })).status, 404);
  assert.equal((await (await server.fetch(collection, { headers: alex })).json()).items.length, 0);
  assert.equal((await server.fetch(link, settings)).status, 200);
  assert.equal((await (await server.fetch(collection, { headers: alex })).json()).items.length, 1);
});
