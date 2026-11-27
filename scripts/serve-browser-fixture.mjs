// Ephemeral real Worker/D1 for browser integration tests; never uses development storage.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname } from "node:path";
import { createTestHarness } from "wrangler";
import { installation } from "../src/config/index.ts";
import { demoPreset } from "../src/config/presets/demo.ts";
import { parseConfiguration } from "../src/config/schema.ts";

assert.deepEqual(installation, parseConfiguration(demoPreset), "Browser fixture requires the fictional demo configuration");
const args = process.argv.slice(2);
const lan = args[0] === "--lan" && (args.length === 2 || args.length === 3);
assert(!args.length || lan, "Use --lan followed by the computer's private IPv4 address and optional port");
const address = lan ? args[1] : "127.0.0.1";
if (lan) {
  const privateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  assert(privateIp.test(address) && Object.values(networkInterfaces()).flat().some((entry) => entry.address === address && entry.family === "IPv4"),
    "Choose a private IPv4 address assigned to this computer");
}
const port = lan ? Number(args[2] ?? 5175) : 8787;
assert(Number.isInteger(port) && port >= 1024 && port <= 65535, "Choose an unprivileged port from 1024 to 65535");
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
const demoTickets = [
  { title: "Probar la recuperación al guardar una tarea", description: "Revisar qué ocurre si se pierde la conexión durante el guardado.", areaId: "web", assigneeId: "alex", status: "in_progress", highlighted: true },
  { title: "Revisar el mensaje de confirmación", description: "Acordar el texto de confirmación y comprobar que se vea al guardar.", areaId: "web", assigneeId: "sam", status: "in_progress", prUrl: "https://github.com/example/demo/pull/42" },
  { title: "Validar enlaces compartidos desde el teléfono", areaId: "web", assigneeId: "alex" },
  { title: "Preparar los textos de bienvenida", areaId: "general", assigneeId: "taylor" },
  { title: "Simplificar el formulario de contacto", areaId: "general", highlighted: true },
  { title: "Ajustar el tamaño del panel de detalle", areaId: "web", assigneeId: "sam", status: "in_review" },
  { title: "Verificar el acceso con el código del equipo", areaId: "general", assigneeId: "alex", status: "done" },
  { title: "Hacer más claro el mensaje de error", type: "feedback", description: "Sería útil explicar cuál es el siguiente paso cuando falta información." },
  { title: "Mostrar ejemplos antes de rellenar el formulario", type: "feedback", highlighted: true },
];
let http;
try {
  await worker.listen(); await worker.getWorker().applyD1Migrations("DB");
  const headers = { authorization: "Bearer browser-fixture-only", "x-taski-member": "alex", "content-type": "application/json" };
  let demoHeaders;
  if (lan) {
    const session = await worker.fetch("/api/v1/session", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "browser-fixture-only", memberId: "alex" }) });
    assert.equal(session.status, 200);
    const cookie = session.headers.get("set-cookie");
    assert(cookie, "Demo seed session needs a cookie");
    demoHeaders = { "content-type": "application/json", cookie: cookie.split(";", 1)[0] };
  }
  const tickets = lan ? demoTickets : Array.from({ length: 24 }, (_, offset) => {
    const i = offset + 1;
    return { title: `Fixture ${String(i).padStart(2, "0")}`, assigneeId: i === 24 ? "sam" : "alex",
      status: i === 24 ? "in_review" : "todo", areaId: i === 24 ? "web" : "general" };
  });
  for (const [offset, ticket] of tickets.entries()) {
    const result = await worker.fetch("/api/v1/tickets", { method: "POST", headers: demoHeaders ?? headers,
      body: JSON.stringify({ ...ticket, idempotencyKey: `browser-seed-${offset + 1}` }) });
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
