import { createTestHarness } from "wrangler";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { installation } from "../src/config/index.ts";
import { measureIntent } from "./mcp-intent-scenarios.mjs";

const args = process.argv.slice(2);
assert(args.every((arg) => ["--intent", "--check", "--write"].includes(arg)) && new Set(args).size === args.length
  && !(args.includes("--check") && args.includes("--write")), "Use optional --intent and either --check or --write");
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

// Only isolated, fictitious fixtures. Never connects to a configured installation.
const code = "proxy-fixture-only-code";
const server = createTestHarness({ workers: [{ configPath: "./wrangler.jsonc", vars: { TASKI_TEAM_ACCESS_CODE: code } }] });
const client = new Client({ name: "taski-proxy-measurement", version: "1.0.0" }, { versionNegotiation: { mode: "legacy" } });
try {
  const { url } = await server.listen(); await server.getWorker().applyD1Migrations("DB");
  // Fix only this new database's epoch so the returned cursor has reproducible bytes.
  const db = (await server.getWorker().getEnv()).DB;
  await db.prepare("INSERT INTO project_identity(singleton,project_id,prefix,epoch) VALUES(1,?,?,?)")
    .bind(installation.project.id, installation.project.prefix, "00000000000000000000000000000000").run();
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", url), {
    requestInit: { headers: { authorization: `Bearer ${code}`, "x-taski-member": "alex" } },
    fetch: (url, init) => server.fetch(url, init),
  }));
  const catalog = await client.listTools();
  let receipt;
  for (let n = 0; n < 20; n++) receipt = await client.callTool({ name: "create_ticket", arguments: {
    title: `Revisar formulario ${n + 1}`, assigneeId: "sam", idempotencyKey: `fixture-${n}`,
  } });
  const list = await client.callTool({ name: "list_tickets", arguments: {} });
  assert.equal(catalog.tools.length, 11);
  assert(!receipt.isError && !list.isError);
  assert.equal(list.structuredContent.items.length, 20);
  assert.equal(list.structuredContent.nextCursor, null);
  assert.deepEqual(list.content, []); assert.deepEqual(receipt.content, []);
  const intent = args.includes("--intent") ? await measureIntent(client) : undefined;
  const python = process.env.TASKI_PROXY_PYTHON ?? ".venv/bin/python";
  const measured = spawnSync(python, ["scripts/measure-mcp.py", ...args], {
    input: JSON.stringify({ instructions: client.getInstructions(), catalog, list, receipt,
      sdk: { server: manifest.dependencies["@modelcontextprotocol/server"], client: manifest.devDependencies["@modelcontextprotocol/client"] }, intent }), encoding: "utf8",
  });
  if (measured.error) throw measured.error;
  process.stdout.write(measured.stdout); process.stderr.write(measured.stderr);
  process.exitCode = measured.status ?? 1;
} finally { try { await client.close(); } finally { await server.close(); } }
