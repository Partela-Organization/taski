import { healthResponse } from "../http/health.ts";
import { checkHealth } from "../../application/health.ts";
import { d1Readiness } from "../storage/d1-readiness.ts";
import { installation as localInstallation } from "../../config/index.ts";
import { parseConfiguration } from "../../config/schema.ts";
import { TaskiError } from "../../domain/ticket.ts";
import { TeamAccess } from "../access/team-access.ts";
import type { AccessEnvironment } from "../access/team-access.ts";
import { errorResponse } from "../http/body.ts";
import { api } from "../http/api.ts";
import { mcp } from "../mcp/server.ts";

interface Env extends AccessEnvironment {
  DB: D1Database;
  ASSETS?: Fetcher;
  ATTACHMENTS?: R2Bucket;
  TASKI_INSTALLATION_JSON?: string;
}

function readInstallation(env: Env) {
  if (env.TASKI_INSTALLATION_JSON !== undefined) {
    return parseConfiguration(JSON.parse(env.TASKI_INSTALLATION_JSON));
  }
  if (env.ASSETS) throw new TaskiError("CONFIGURATION_REQUIRED");
  return localInstallation;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    let installation;
    try { installation = readInstallation(env); }
    catch { return errorResponse(new TaskiError("CONFIGURATION_REQUIRED")); }

    if (path === "/mcp") return mcp(request, env, installation);
    if (path === "/api/v1/session") {
      try { return await new TeamAccess(env, installation).handle(request); }
      catch (error) { return errorResponse(error); }
    }
    if (path === "/api/v1/access" && request.method === "GET") {
      return Response.json({ projectName: installation.project.name, brandName: installation.brand.name,
        members: installation.members }, { headers: { "cache-control": "no-store" } });
    }
    if (path.startsWith("/api/v1/")) return api(request, env, installation);
    if (env.ASSETS && (request.method === "GET" || request.method === "HEAD")
        && (path === "/" || /^\/t\/[A-Za-z0-9_-]+$/.test(path) || /^\/track\/[a-z][a-z0-9_-]{0,47}$/.test(path))) {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    if (path !== "/health") {
      return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    }
    if (request.method !== "GET") {
      return Response.json({ error: { code: "METHOD_NOT_ALLOWED" } }, {
        status: 405,
        headers: { allow: "GET" },
      });
    }
    return healthResponse(await checkHealth(d1Readiness(env.DB)));
  },
} satisfies ExportedHandler<Env>;
