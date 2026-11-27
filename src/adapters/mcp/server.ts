import { createMcpHandler, fromJsonSchema, hostHeaderValidationResponse, McpServer } from "@modelcontextprotocol/server";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/server/validators/cf-worker";
import type { JsonSchemaType } from "@modelcontextprotocol/server";
import { definitions, serverInstructions } from "../api/contract.ts";
import { Operations } from "../api/operations.ts";
import { TicketService } from "../../application/tickets.ts";
import { AreaPlanService } from "../../application/areas.ts";
import { D1AreaPlanRepository } from "../storage/d1-area-plans.ts";
import { TaskiError } from "../../domain/ticket.ts";
import { D1TicketRepository } from "../storage/d1-tickets.ts";
import { TeamAccess } from "../access/team-access.ts";
import type { AccessEnvironment } from "../access/team-access.ts";
import type { InstallationConfig } from "../../config/types.ts";
import { errorResponse, sameOrigin } from "../http/body.ts";
import { runtime } from "../worker/runtime.ts";

const validator = new CfWorkerJsonSchemaValidator();
const tools = definitions.map((definition) => ({ ...definition,
  input: fromJsonSchema(definition.inputSchema as JsonSchemaType, validator),
  output: fromJsonSchema(definition.outputSchema as JsonSchemaType, validator),
}));
const reads = new Set(["get_project", "list_tickets", "get_ticket", "list_activity", "list_areas"]);

export async function mcp(request: Request, env: AccessEnvironment, config: InstallationConfig): Promise<Response> {
  try {
    sameOrigin(request);
    const host = new URL(config.project.baseUrl).hostname;
    const rejected = hostHeaderValidationResponse(request, [host]);
    if (rejected) {
      rejected.headers.set("cache-control", "no-store");
      return rejected;
    }
    const actor = await new TeamAccess(env, config).authenticate(request, "mcp");
    const operations = new Operations(new TicketService(new D1TicketRepository(env.DB), config, runtime), config,
      new AreaPlanService(new D1AreaPlanRepository(env.DB), config, runtime));
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: "taski", version: "0.0.0" }, { instructions: serverInstructions, jsonSchemaValidator: validator });
      for (const tool of tools) {
        server.registerTool(tool.name, {
          description: tool.description, inputSchema: tool.input, outputSchema: tool.output,
          annotations: { readOnlyHint: reads.has(tool.name), destructiveHint: false, idempotentHint: true, openWorldHint: false },
        }, async (input) => {
          try {
            const result = await operations.execute(tool.name, input, actor);
            // One payload, without repeating the full JSON in text + structuredContent.
            return { content: [], structuredContent: result };
          } catch (error) {
            const code = error instanceof TaskiError ? error.code : "INTERNAL_ERROR";
            const message = error instanceof TaskiError ? error.message : "The operation could not be confirmed";
            return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }] };
          }
        });
      }
      return server;
    }, { legacy: "stateless", maxRequestBodySize: 1048576 });
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers); headers.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  } catch (error) { return errorResponse(error); }
}
