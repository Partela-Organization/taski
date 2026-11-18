// Opt-in read-only native client probe. Never imports OAuth credentials.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  assert(["--client", "--output"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--") && !options[args[i]], "Use --client codex|claude|both [--output file]");
  options[args[i]] = args[i + 1];
}
const choice = options["--client"] ?? "both";
assert(["codex", "claude", "both"].includes(choice), "Invalid client");
const temporary = await mkdtemp(path.join(tmpdir(), "taski-benchmark-preflight-"));
console.error(`Private probe logs: ${temporary}`);
const mcpConfig = path.join(temporary, "mcp.json");
await writeFile(mcpConfig, JSON.stringify({ mcpServers: { "linear-server": { type: "http", url: "https://mcp.linear.app/mcp" } } }), { mode: 0o600 });
const results = [];
for (const client of choice === "both" ? ["codex", "claude"] : [choice]) {
  const version = spawnSync(client, ["--version"], { encoding: "utf8" });
  if (version.status !== 0) { results.push({ client, connected: false, reason: "client-unavailable" }); continue; }
  const config = [
    'mcp_servers.linear.url="https://mcp.linear.app/mcp"', 'mcp_servers.linear.enabled_tools=["get_workspace"]',
    "mcp_servers.linear.required=true", 'mcp_servers.linear.default_tools_approval_mode="approve"',
    "features.shell_tool=false", "features.multi_agent=false", "features.apps=false", "features.plugins=false", "features.hooks=false",
    "features.skip_host_skill_discovery=true", "features.skill_search=false", 'web_search="disabled"', "project_doc_max_bytes=0",
  ].flatMap((value) => ["-c", value]);
  const parameters = client === "codex"
    ? ["exec", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--sandbox", "read-only", "--json", ...config, "-"]
    : ["--restricted", "--strict-mcp-config", "--mcp-config", mcpConfig, "--setting-sources", "", "--settings", '{"disableAllHooks":true}',
      "--tools", "ToolSearch", "--allowedTools", "mcp__linear-server__get_workspace,ToolSearch", "--permission-mode", "dontAsk", "--output-format", "stream-json", "--verbose", "-p"];
  const child = spawn(client, parameters, { cwd: temporary, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "", timedOut = false, killTimer;
  child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.on("error", () => {});
  child.stdin.end("Use only the Linear MCP. Call get_workspace once. Return a short connection status based on that response. Do not read or write issues, access files, shell, web, delegate or call other tools.");
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); killTimer = setTimeout(() => child.kill("SIGKILL"), 5000); }, 90000);
  let exit;
  try { exit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }); }
  finally { clearTimeout(timer); clearTimeout(killTimer); }
  await writeFile(path.join(temporary, `${client}.jsonl`), stdout, { mode: 0o600 });
  await writeFile(path.join(temporary, `${client}.stderr`), stderr, { mode: 0o600 });
  const events = stdout.split("\n").flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  let confirmed = false, needsAuth = false, otherCalls = false;
  if (client === "codex") {
    const calls = events.filter((e) => e.type === "item.completed" && e.item?.type === "mcp_tool_call").map((e) => e.item);
    confirmed = calls.some((c) => c.server === "linear" && c.tool === "get_workspace" && c.status === "completed"
      && c.result && !c.error && !c.result.isError && !c.result.is_error);
    otherCalls = calls.some((c) => c.server !== "linear" || c.tool !== "get_workspace");
  } else {
    needsAuth = events.some((e) => e.mcp_servers?.some((s) => s.name === "linear-server" && s.status === "needs-auth"));
    const blocks = events.flatMap((e) => e.message?.content ?? []).filter((b) => typeof b === "object");
    const calls = blocks.filter((b) => b.type === "tool_use");
    const ids = new Set(calls.filter((b) => b.name === "mcp__linear-server__get_workspace").map((b) => b.id));
    confirmed = blocks.some((b) => b.type === "tool_result" && ids.has(b.tool_use_id) && !b.is_error);
    otherCalls = calls.some((b) => !["ToolSearch", "mcp__linear-server__get_workspace"].includes(b.name));
  }
  const connected = exit === 0 && confirmed && !otherCalls;
  results.push({ client, version: version.stdout.trim(), connected,
    reason: connected ? null : otherCalls ? "unexpected-tool-call" : timedOut ? "timeout" : needsAuth ? "authorization-required" : "connection-not-confirmed" });
}
const report = { kind: "LIVE_COMPARATIVE_PREREQUISITES", executedAt: new Date().toISOString(),
  endpoint: "https://mcp.linear.app/mcp", results,
  status: results.every((r) => r.connected) ? "CLIENT_CONNECTIONS_READY" : "PREREQUISITES_MISSING",
  scope: "One read-only get_workspace per native client. No fixtures, comparative samples, latency or performance claims. Workspace identity/content and credentials are excluded." };
const serialized = JSON.stringify(report, null, 2) + "\n";
if (options["--output"]) await writeFile(options["--output"], serialized);
else process.stdout.write(serialized);
if (report.status === "PREREQUISITES_MISSING") process.exitCode = 2;
