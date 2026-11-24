export type McpClient = "codex" | "claude";

export function mcpEndpoint(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "") + "/mcp";
}

export function mcpConfiguration(client: McpClient, endpoint: string, memberId: string): string {
  if (client === "codex") {
    return [
      "[mcp_servers.taski]",
      "url = " + JSON.stringify(endpoint),
      'bearer_token_env_var = "TASKI_CODE"',
      'http_headers = { "X-Taski-Member" = ' + JSON.stringify(memberId) + ', "X-Taski-Client" = "codex" }',
    ].join("\n");
  }

  return JSON.stringify({ mcpServers: { taski: { type: "http", url: endpoint, headers: {
    Authorization: 'Bearer ${TASKI_CODE}',
    "X-Taski-Member": memberId,
    "X-Taski-Client": "claude-code",
  } } } }, null, 2);
}
