import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createTestHarness } from "wrangler";
import worker from "../src/adapters/worker/index.ts";
import { studioPreset } from "../src/config/presets/studio.ts";

test("hosted UI serves direct ticket links alongside D1, API and MCP", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "taski-hosted-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const assets = join(directory, "assets");
  await mkdir(assets);
  await writeFile(join(assets, "index.html"), "<title>Taski fixture</title>");
  await writeFile(join(assets, "fixture.js"), "export {};");
  const template = JSON.parse(await readFile(new URL("../wrangler.deploy.example.jsonc", import.meta.url), "utf8"));
  const configPath = join(directory, "wrangler.json");
  await writeFile(configPath, JSON.stringify({
    ...template,
    main: fileURLToPath(new URL("../src/adapters/worker/index.ts", import.meta.url)),
    assets: { ...template.assets, directory: assets },
    d1_databases: template.d1_databases.map((db) => ({
      ...db, migrations_dir: fileURLToPath(new URL("../migrations/", import.meta.url)),
    })),
  }));

  const code = "hosted-fixture-only";
  const installation = { ...studioPreset, project: { ...studioPreset.project, baseUrl: "http://127.0.0.1:8787" } };
  const server = createTestHarness({ workers: [{ configPath, vars: {
    TASKI_INSTALLATION_JSON: JSON.stringify(installation), TASKI_TEAM_ACCESS_CODE: code,
  } }] });
  const { url } = await server.listen();
  const client = new Client({ name: "hosted-test", version: "1.0.0" }, { versionNegotiation: { mode: "legacy" } });
  try {
    await server.getWorker().applyD1Migrations("DB");
    for (const path of ["/", "/t/EDIT-001"]) {
      const response = await server.fetch(path, { redirect: "manual" });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Taski fixture/);
    }
    assert.equal((await server.fetch("/fixture.js")).status, 200);
    assert.equal((await server.fetch("/t/EDIT-001", { method: "POST" })).status, 404);
    assert.equal((await server.fetch("/health")).status, 200);
    const access = await (await server.fetch("/api/v1/access")).json();
    assert.equal(access.brandName, studioPreset.brand.name);
    assert.equal(access.members[0].id, "lee");
    for (const path of ["/api/v1/tickets", "/mcp"]) {
      const response = await server.fetch(path, { headers: { accept: "text/html", "sec-fetch-mode": "navigate" } });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, "AUTH_REQUIRED");
    }
    await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", url), {
      requestInit: { headers: { authorization: `Bearer ${code}`, "x-taski-member": "lee" } },
      fetch: (input, init) => server.fetch(input, init),
    }));
    assert.equal((await client.listTools()).tools.length, 8);
    const project = await client.callTool({ name: "get_project", arguments: {} });
    assert.equal(project.structuredContent.project.prefix, "EDIT");
  } finally {
    await client.close();
    await server.close();
  }
});

test("a Worker with bundled assets requires an explicit installation configuration", async () => {
  for (const settings of [{}, { TASKI_INSTALLATION_JSON: "invalid-fixture" }]) {
    const response = await worker.fetch(new Request("https://studio.example/api/v1/access"), {
      ASSETS: { fetch: () => assert.fail("Invalid configuration reached the assets binding") },
      ...settings,
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "CONFIGURATION_REQUIRED");
  }
});
