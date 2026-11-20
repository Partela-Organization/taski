// Ephemeral real Worker/D1 for browser integration tests; never uses development storage.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createTestHarness } from "wrangler";
import { installation } from "../src/config/index.ts";
import { demoPreset } from "../src/config/presets/demo.ts";

assert.deepEqual(installation, demoPreset, "Browser fixture requires the fictional demo configuration");
const worker = createTestHarness({ workers: [{ configPath: "./wrangler.jsonc", vars: { TASKI_TEAM_ACCESS_CODE: "browser-fixture-only" } }] });
let http;
try {
  await worker.listen(); await worker.getWorker().applyD1Migrations("DB");
  for (let i = 1; i <= 24; i++) {
    const result = await worker.fetch("/api/v1/tickets", { method: "POST", headers: {
      authorization: "Bearer browser-fixture-only", "x-taski-member": "alex", "content-type": "application/json",
    }, body: JSON.stringify({ title: `Fixture ${String(i).padStart(2, "0")}`, assigneeId: i === 24 ? "sam" : "alex",
      status: i === 24 ? "in_review" : "todo", areaId: i === 24 ? "web" : "general", idempotencyKey: `browser-seed-${i}` }) });
    assert.equal(result.status, 201);
  }
  http = createServer(async (request, response) => {
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const result = await worker.fetch(new URL(request.url, "http://127.0.0.1:8787"), {
        method: request.method, headers: request.headers, ...(body.length ? { body } : {}),
      });
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(500); response.end("Fixture forwarding failed"); }
  });
  await new Promise((resolve, reject) => { http.once("error", reject); http.listen(8787, "127.0.0.1", resolve); });
  console.log("Ephemeral browser Worker/D1 ready on 8787");
} catch (error) { await worker.close(); throw error; }
let closing = false;
async function close() {
  if (closing) return; closing = true;
  await new Promise((resolve) => http.close(resolve)); await worker.close();
}
process.on("SIGINT", () => { void close(); }); process.on("SIGTERM", () => { void close(); });
