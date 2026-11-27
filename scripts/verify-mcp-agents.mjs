// Opt-in live client evaluation. Never connects agents to a developer installation.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { glob, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createTestHarness } from "wrangler";
import { workflow, resumed } from "./mcp-agent-prompts.mjs";
import { installation } from "../src/config/index.ts";
import { demoPreset } from "../src/config/presets/demo.ts";

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const clientName = option("--client", "codex");
const loading = option("--loading", "default");
const probe = args.includes("--probe");
const output = option("--output");
for (let n = 0; n < args.length; n++) {
  if (args[n] === "--probe") continue;
  assert(["--client", "--loading", "--output"].includes(args[n]) && args[n + 1] && !args[n + 1].startsWith("--"), "Invalid arguments");
  n++;
}
assert(["codex", "claude"].includes(clientName), "Use --client codex|claude");
assert(["default", "eager", "deferred"].includes(loading), "Use --loading default|eager|deferred");
assert(clientName !== "codex" || loading === "default", "Codex uses its observed default; no unsupported deferral flags");
assert.deepEqual(installation, demoPreset, "Live evaluation requires the public demo preset, not an installation's configuration");
const temporary = await mkdtemp(path.join(tmpdir(), "taski-agent-"));
console.error(`Fixture logs: ${temporary}`);
const code = randomUUID();
const server = createTestHarness({ workers: [{ configPath: "./wrangler.jsonc", vars: { TASKI_TEAM_ACCESS_CODE: code } }] });
const trace = [];
let phase = "setup";
function messages(text) {
  try { const parsed = JSON.parse(text); return Array.isArray(parsed) ? parsed : [parsed]; }
  catch { return text.split("\n").filter((line) => line.startsWith("data: ")).flatMap((line) => {
    try { return [JSON.parse(line.slice(6))]; } catch { return []; }
  }); }
}
const proxy = createServer(async (request, response) => {
  try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const forwarded = await server.fetch(new URL(request.url, "http://127.0.0.1"), {
      method: request.method, headers: request.headers, ...(body.length ? { body } : {}),
    });
    const text = await forwarded.text();
    // Keep fixture bodies and protocol metadata only; never log Authorization.
    trace.push({ phase, requests: messages(body.toString()), responses: messages(text), status: forwarded.status,
      responseBytes: Buffer.byteLength(text), client: request.headers["x-taski-client"] ?? null });
    response.writeHead(forwarded.status, Object.fromEntries([...forwarded.headers].filter(([key]) => !["content-length", "transfer-encoding", "connection"].includes(key))));
    response.end(text);
  } catch { response.writeHead(500); response.end("Fixture proxy failed"); }
});

async function run(binary, parameters, name, input, extraEnv = {}) {
  const child = spawn(binary, parameters, { cwd: temporary, env: { ...process.env, TASKI_AGENT_TEST_CODE: code,
    TASKI_AGENT_TEST_MEMBER: "alex", TASKI_AGENT_TEST_CLIENT: `${clientName}-${loading}`, ...extraEnv }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (data) => { stdout += data; }); child.stderr.on("data", (data) => { stderr += data; });
  child.stdin.on("error", () => {}); // A failed CLI can exit before consuming stdin.
  child.stdin.end(input ?? "");
  let killTimer;
  const timer = setTimeout(() => { child.kill("SIGTERM"); killTimer = setTimeout(() => child.kill("SIGKILL"), 5000); }, 180000);
  let exit;
  try { exit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }); }
  finally { clearTimeout(timer); clearTimeout(killTimer); }
  await writeFile(path.join(temporary, `${name}.stdout.jsonl`), stdout, { mode: 0o600 });
  await writeFile(path.join(temporary, `${name}.stderr.log`), stderr, { mode: 0o600 });
  return { exit, events: stdout.split("\n").flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } }) };
}

function finalText(result) {
  if (clientName === "claude") return result.events.findLast((event) => event.type === "result")?.result;
  return result.events.findLast((event) => event.item?.type === "agent_message")?.item.text;
}
function finalJson(result) {
  assert.equal(result.exit, 0, `Client failed; inspect private fixture logs in ${temporary}`);
  return JSON.parse(finalText(result).replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
}
function toolCalls(name) {
  return trace.filter((entry) => entry.phase === name).flatMap((entry) => entry.requests)
    .filter((message) => message.method === "tools/call").map((message) => ({ name: message.params.name, arguments: message.params.arguments ?? {} }));
}
function activityEnd(name) {
  return trace.filter((entry) => entry.phase === name && entry.requests.some((message) => message.method === "tools/call" && message.params.name === "list_activity"))
    .flatMap((entry) => entry.responses).findLast((message) => message.result?.structuredContent)?.result.structuredContent;
}
async function codexModels(id) {
  const models = new Set();
  const root = process.env.CODEX_HOME ?? path.join(homedir(), ".codex");
  for await (const file of glob(path.join(root, "sessions", "**", `*${id}*`))) {
    for (const line of (await readFile(file, "utf8")).split("\n")) {
      try {
        const item = JSON.parse(line);
        if (item.type === "turn_context" && item.payload?.model) models.add(item.payload.model);
      } catch {}
    }
  }
  return [...models];
}
function usage(result, previous) {
  if (clientName === "codex") return { values: result.events.findLast((event) => event.type === "turn.completed")?.usage ?? null,
    ...(previous ? { deltaFromPreviousInvocation: Object.fromEntries(Object.entries(result.events.findLast((event) => event.type === "turn.completed").usage)
      .map(([key, value]) => [key, value - (previous.events.findLast((event) => event.type === "turn.completed").usage[key] ?? 0)])) } : {}),
    scope: "Observed session-cumulative CLI counters; resumed delta is derived by subtraction; input already includes cached input; do not sum raw resumed totals" };
  const last = result.events.findLast((event) => event.type === "result");
  const keys = ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"];
  return { values: last?.usage ? Object.fromEntries(keys.map((key) => [key, last.usage[key] ?? null])) : null,
    scope: "Claude result usage as exposed; resumed totals are kept separate and never summed" };
}
function discovery(result) {
  const init = result.events.find((event) => event.type === "system" && event.subtype === "init");
  const searches = result.events.flatMap((event) => event.message?.content ?? []).filter((block) => block.type === "tool_use" && block.name === "ToolSearch");
  return { requested: loading, advertisedToolNames: init?.tools?.filter((name) => name.startsWith("mcp__taski__")) ?? null,
    toolSearchCalls: searches.map(({ input }) => input),
    loadedToolNamesFromSearch: [...new Set(result.events.flatMap((event) => event.message?.content ?? [])
      .flatMap((block) => Array.isArray(block.content) ? block.content : [])
      .filter((block) => block.type === "tool_reference" && block.tool_name?.startsWith("mcp__taski__")).map((block) => block.tool_name))],
    modelVisibleDefinitionTokens: null,
    interpretation: clientName === "codex" ? "Default CLI discovery; model-visible definition payload not exposed by JSONL"
      : "init.tools is the available catalog; ToolSearch calls record requested on-demand loading; exact model-visible definitions not exposed" };
}

try {
  await server.listen(); await server.getWorker().applyD1Migrations("DB");
  await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(0, "127.0.0.1", resolve); });
  const url = `http://127.0.0.1:${proxy.address().port}/mcp`;
  const claudeConfig = path.join(temporary, "mcp.json");
  await writeFile(claudeConfig, JSON.stringify({ mcpServers: { taski: { type: "http", url, headers: {
    Authorization: "Bearer ${TASKI_AGENT_TEST_CODE}", "X-Taski-Member": "${TASKI_AGENT_TEST_MEMBER}", "X-Taski-Client": "${TASKI_AGENT_TEST_CLIENT}",
  } } } }), { mode: 0o600 });
  const codexConfig = [
    "mcp_servers.taski.url=" + JSON.stringify(url), 'mcp_servers.taski.bearer_token_env_var="TASKI_AGENT_TEST_CODE"',
    'mcp_servers.taski.env_http_headers={"X-Taski-Member"="TASKI_AGENT_TEST_MEMBER","X-Taski-Client"="TASKI_AGENT_TEST_CLIENT"}',
    "mcp_servers.taski.required=true", 'mcp_servers.taski.default_tools_approval_mode="approve"',
    "features.shell_tool=false", "features.multi_agent=false", "features.apps=false", "features.plugins=false", "features.hooks=false",
    "features.skip_host_skill_discovery=true", "features.skill_search=false", 'web_search="disabled"', "project_doc_max_bytes=0",
  ].flatMap((value) => ["-c", value]);
  const claudeEnv = loading === "default" ? {} : { ENABLE_TOOL_SEARCH: loading === "eager" ? "false" : "true" };
  const version = spawnSync(clientName, ["--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, `Install/authenticate ${clientName} before this opt-in evaluation`);
  const request = async (operation, payload) => {
    const routes = { create: ["/api/v1/tickets", "POST"], update: [`/api/v1/tickets/${payload.key}`, "PATCH"],
      get: [`/api/v1/tickets/${payload.key}?view=full`, "GET"] };
    const [route, method] = routes[operation];
    const { key: _key, ...body } = payload;
    const response = await server.fetch(route, { method, headers: { authorization: `Bearer ${code}`, "x-taski-member": "alex", "content-type": "application/json" },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
    assert(response.ok, `Fixture ${operation} failed (${response.status})`); return response.json();
  };
  const marker = "END-CONTEXT-" + randomUUID().slice(0, 8);
  if (!probe) await request("create", { title: "Context seed", description: "Complete fictitious context. ".repeat(80) + marker, idempotencyKey: "context-seed" });
  phase = probe ? "probe" : "new";
  const prompt = "This is a local Taski MCP integration test with fictitious data. Use only the taski MCP. Call get_project and list_tickets. Report the project name, member IDs, and number of tickets from the real responses. Do not use filesystem, shell, web, other connectors, or delegate work. If no data is visible, report that; never invent it.";
  const parameters = clientName === "codex"
    ? ["exec", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--sandbox", "read-only", "--json", ...codexConfig, "-"]
    : ["--restricted", "--strict-mcp-config", "--mcp-config", claudeConfig, "--setting-sources", "", "--settings", '{"disableAllHooks":true}',
      "--tools", "ToolSearch", "--allowedTools", "mcp__taski__*,ToolSearch", "--permission-mode", "dontAsk", "--output-format", "stream-json", "--verbose", "-p"];
  const title = `Agent workflow ${clientName} ${loading}`;
  console.error(`${clientName}: ${phase} context`);
  const result = await run(clientName, parameters, phase, probe ? prompt : workflow(title), claudeEnv);
  if (probe) {
    console.log(JSON.stringify({ client: clientName, loading, exit: result.exit, calls: toolCalls("probe").map((call) => call.name), artifacts: temporary }));
    assert.equal(result.exit, 0); assert(toolCalls("probe").some((call) => call.name === "get_project"));
  } else {
    const first = finalJson(result);
    const initial = await request("get", { key: first.key });
    assert.equal(initial.ticket.title, title); assert.equal(initial.ticket.version, 4); assert.equal(first.version, 4);
    assert.equal(initial.ticket.status, "in_review"); assert.equal(initial.ticket.assigneeId, "sam");
    assert.equal(initial.ticket.prUrl, "https://github.com/example/demo/pull/42"); assert.equal(initial.comments.length, 2);
    assert.equal(first.seedMarker, marker); assert.equal(first.configVersion, 1); assert(first.activityCursor);
    assert.equal(activityEnd("new")?.hasMore, false); assert.equal(first.activityCursor, activityEnd("new").nextCursor);
    const expectedTools = ["get_project", "list_tickets", "get_ticket", "create_ticket", "add_comment", "link_pull_request", "update_ticket", "list_activity"];
    assert(expectedTools.every((name) => toolCalls("new").some((call) => call.name === name)), "Workflow must exercise all eight tools");
    const freshCalls = toolCalls("new");
    assert.equal(freshCalls.find((call) => call.name === "create_ticket").arguments.assigneeId, "sam");
    assert(freshCalls.some((call) => call.name === "update_ticket" && call.arguments.changes?.status === "in_review" && call.arguments.comment));
    const sessionId = clientName === "codex" ? result.events.find((event) => event.type === "thread.started")?.thread_id
      : result.events.find((event) => event.type === "result")?.session_id;
    assert(sessionId, "A real persisted session is required for continuation");
    phase = "external";
    await request("update", { key: first.key, expectedVersion: 4, idempotencyKey: "external-change", changes: { highlighted: true }, comment: "External progress for resumed context" });
    phase = "resumed";
    console.error(`${clientName}: resumed context`);
    const resumeParameters = clientName === "codex"
      ? ["exec", "resume", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--json", ...codexConfig, sessionId, "-"]
      : [...parameters.slice(0, -1), "--resume", sessionId, "-p"];
    const continued = await run(clientName, resumeParameters, "resumed", resumed, claudeEnv);
    const second = finalJson(continued);
    assert.equal(second.key, first.key); assert.equal(second.version, 5); assert.equal(second.highlighted, true);
    assert.equal(second.latestComment, "External progress for resumed context");
    assert.equal(activityEnd("resumed")?.hasMore, false); assert.equal(second.activityCursor, activityEnd("resumed").nextCursor);
    const warmCalls = toolCalls("resumed");
    assert(warmCalls.some((call) => call.name === "get_project" && call.arguments.knownVersion === 1));
    assert(!warmCalls.some((call) => call.name === "get_project" && call.arguments.knownVersion === undefined));
    assert(warmCalls.some((call) => call.name === "list_activity" && call.arguments.cursor === first.activityCursor));
    assert(!warmCalls.some((call) => call.name === "list_tickets"));
    assert(!warmCalls.some((call) => !["get_project", "list_activity", "get_ticket"].includes(call.name)));
    const final = await request("get", { key: first.key });
    assert.equal(final.ticket.version, 5); assert.equal(final.comments.length, 3);
    const catalog = trace.flatMap((entry) => entry.responses).map((message) => message.result).find((value) => value?.tools);
    assert.equal(catalog.tools.length, 10);
    const objects = { catalog };
    for (const label of ["new", "resumed"]) {
      const results = trace.filter((entry) => entry.phase === label && entry.requests.some((message) => message.method === "tools/call"))
        .flatMap((entry) => entry.responses).map((message) => message.result ?? { error: message.error });
      objects[`${label}_tool_results`] = results;
    }
    const measured = spawnSync(process.env.TASKI_PROXY_PYTHON ?? ".venv/bin/python", ["scripts/measure-agent-payloads.py"], { input: JSON.stringify(objects), encoding: "utf8" });
    assert.equal(measured.status, 0, "Prepare the pinned Python proxy environment before running this evaluation");
    const errors = (label) => trace.filter((entry) => entry.phase === label).flatMap((entry) => entry.responses)
      .filter((message) => message.error || message.result?.isError).map((message) => message.error ?? message.result);
    const sourceSha256 = {};
    for (const file of ["src/adapters/mcp/server.ts", "src/adapters/api/contract.ts", "src/adapters/api/operations.ts"]) {
      sourceSha256[file] = createHash("sha256").update(await readFile(file)).digest("hex");
    }
    const manifest = JSON.parse(await readFile("package.json", "utf8"));
    const negotiated = trace.flatMap((entry) => entry.requests).flatMap((message) => {
      const info = message.params?.clientInfo ?? message.params?._meta?.["io.modelcontextprotocol/clientInfo"];
      const protocol = message.params?.protocolVersion ?? message.params?._meta?.["io.modelcontextprotocol/protocolVersion"];
      return info ? [{ name: info.name, version: info.version, protocol }] : [];
    });
    const proxyMetrics = JSON.parse(measured.stdout);
    const report = { kind: "LIVE_MCP_CLIENT_VALIDATION", executedAt: new Date().toISOString(), client: clientName, version: version.stdout.trim(), loading,
      environment: { node: process.version, platform: process.platform, architecture: process.arch },
      server: { sdk: manifest.dependencies["@modelcontextprotocol/server"], sourceSha256 },
      models: clientName === "codex" ? await codexModels(sessionId) : [result.events.find((event) => event.type === "system" && event.subtype === "init")?.model],
      protocolClients: [...new Map(negotiated.map((value) => [JSON.stringify(value), value])).values()],
      tools: catalog.tools.map((tool) => tool.name), discovery: discovery(result),
      phases: { new: { calls: freshCalls.map((call) => call.name), errors: errors("new"), usage: usage(result) },
        resumed: { calls: warmCalls.map((call) => call.name), errors: errors("resumed"), discovery: discovery(continued), usage: usage(continued, result) } },
      payloadProxy: proxyMetrics.metrics, tokenizer: `tiktoken==${proxyMetrics.tokenizerVersion}/${proxyMetrics.encoding}; canonical JSON; all tool results including errors; not model-visible schemas`,
      assertions: { allEightToolsUsed: true, createdAndAssigned: true, atomicProgressAndReview: true, manualPr: true,
        fullContentVisible: true, knownConfigurationReused: true, incrementalCursorReused: true, resumedExternalChangeConfirmed: true },
      context: "New temporary workspace, explicit Taski-only MCP config; same persisted session resumed after external fixture change",
      scope: "One workflow and one resumed turn; no comparative benchmark, no p50/p95; raw logs stay outside the repository", passed: true };
    const target = output ? path.resolve(output) : path.join(temporary, "report.json");
    await writeFile(target, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ client: clientName, loading, passed: true, report: target, artifacts: temporary,
      newCalls: freshCalls.length, resumedCalls: warmCalls.length }));
  }
} finally {
  await writeFile(path.join(temporary, "trace.json"), JSON.stringify(trace, null, 2), { mode: 0o600 });
  await new Promise((resolve) => proxy.close(resolve)); await server.close();
}
