// Ephemeral real Worker/D1 for browser integration tests; never uses development storage.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname } from "node:path";
import { createTestHarness } from "wrangler";
import { installation } from "../src/config/index.ts";
import { demoPreset } from "../src/config/presets/demo.ts";

assert.deepEqual(installation, demoPreset, "Browser fixture requires the fictional demo configuration");
const args = process.argv.slice(2);
const lan = args[0] === "--lan" && args.length === 2;
assert(!args.length || lan, "Use --lan followed by the computer's private IPv4 address");
const address = lan ? args[1] : "127.0.0.1";
if (lan) {
  const privateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  assert(privateIp.test(address) && Object.values(networkInterfaces()).flat().some((entry) => entry.address === address && entry.family === "IPv4"),
    "Choose a private IPv4 address assigned to this computer");
}
const port = lan ? 5175 : 8787;
const origin = `http://${address}:${port}`;
const built = new URL("../dist/app/", import.meta.url);
const assets = new Map();
const mime = { ".js": "text/javascript", ".css": "text/css", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8" };
let index;
if (lan) {
  index = await readFile(new URL("index.html", built));
  for (const entry of await readdir(new URL("assets/", built), { withFileTypes: true })) {
    const contentType = mime[extname(entry.name)];
    if (entry.isFile() && contentType) {
      assets.set(`/assets/${entry.name}`, { body: await readFile(new URL(`assets/${encodeURIComponent(entry.name)}`, built)), contentType });
    }
  }
}
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
      if (lan && request.headers.host !== `${address}:${port}`) { response.writeHead(421); response.end(); return; }
      const url = new URL(request.url, origin);
      if (url.origin !== origin) { response.writeHead(400); response.end(); return; }
      if (lan && url.pathname !== "/health" && !url.pathname.startsWith("/api/v1/")) {
        if (request.method !== "GET") { response.writeHead(405, { allow: "GET" }); response.end(); return; }
        const file = url.pathname === "/" || /^\/t\/[A-Za-z0-9_-]+$/.test(url.pathname)
          ? { body: index, contentType: "text/html; charset=utf-8" } : assets.get(url.pathname);
        if (!file) { response.writeHead(404); response.end(); return; }
        response.writeHead(200, { "content-type": file.contentType, "cache-control": "no-store" }); response.end(file.body); return;
      }
      const chunks = []; let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 1_048_576) { response.writeHead(413); response.end(); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const result = await worker.fetch(url, {
        method: request.method, headers: request.headers, ...(body.length ? { body } : {}),
      });
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(500); response.end("Fixture forwarding failed"); }
  });
  await new Promise((resolve, reject) => { http.once("error", reject); http.listen(port, address, resolve); });
  console.log(`Ephemeral browser Worker/D1 ready at ${origin}`);
  if (lan) console.log("Demo access code: browser-fixture-only. Press Ctrl+C to stop.");
} catch (error) { await worker.close(); throw error; }
let closing = false;
async function close() {
  if (closing) return; closing = true;
  await new Promise((resolve) => http.close(resolve)); await worker.close();
}
process.on("SIGINT", () => { void close(); }); process.on("SIGTERM", () => { void close(); });
