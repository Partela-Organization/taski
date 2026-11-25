import { readFile, writeFile } from "node:fs/promises";
import { definitions, deleteTicketDefinition } from "../src/adapters/api/contract.ts";
import { attachmentContentTypes, maxAttachmentBytes, maxTicketAttachments } from "../src/contracts/attachments.ts";

const components = {};
const httpDefinitions = [...definitions, deleteTicketDefinition];
for (const definition of httpDefinitions) {
  components[`${definition.name}Input`] = definition.inputSchema;
  components[`${definition.name}Output`] = definition.outputSchema;
}
const paths = {};
const routes = [
  ["get", "/api/v1/project", "get_project"], ["get", "/api/v1/tickets", "list_tickets"],
  ["get", "/api/v1/tickets/{key}", "get_ticket"], ["post", "/api/v1/tickets", "create_ticket"],
  ["patch", "/api/v1/tickets/{key}", "update_ticket"], ["post", "/api/v1/tickets/{key}/comments", "add_comment"],
  ["delete", "/api/v1/tickets/{key}", "delete_ticket"],
  ["get", "/api/v1/activity", "list_activity"], ["put", "/api/v1/tickets/{key}/pull-request", "link_pull_request"],
];
for (const [method, path, name] of routes) {
  const definition = httpDefinitions.find((entry) => entry.name === name);
  const input = structuredClone(definition.inputSchema);
  const parameters = [];
  if (path.includes("{key}")) {
    parameters.push({ name: "key", in: "path", required: true, schema: input.properties.key });
    delete input.properties.key;
    input.required = input.required.filter((key) => key !== "key");
  }
  if (method === "get") for (const [name, schema] of Object.entries(input.properties)) {
    parameters.push({ name, in: "query", required: input.required.includes(name), schema });
  }
  const entry = { operationId: name, description: definition.description, parameters,
    responses: { [method === "post" && name === "create_ticket" ? "201" : "200"]: {
      description: "Confirmed result", content: { "application/json": { schema: { $ref: `#/components/schemas/${name}Output` } } },
    }, default: { description: "Typed error; inspect error.code. 401/403 access, 409 conflict, 429 rate limit, 503 configuration, 500 unconfirmed internal failure.",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } } };
  if (method !== "get") entry.requestBody = { required: true, content: { "application/json": { schema: input } } };
  if (name === "delete_ticket") entry.security = [{ TeamCookie: [] }];
  paths[path] ??= {}; paths[path][method] = entry;
}
components.Error = { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } } };
const attachmentId = { type: "string", pattern: "^[0-9a-f]{32}$" };
components.Attachment = { type: "object", required: ["id", "name", "contentType", "size", "createdAt", "createdBy", "canRemove"], properties: {
  id: attachmentId, name: { type: "string", maxLength: 180 }, contentType: { enum: attachmentContentTypes },
  size: { type: "integer", minimum: 1, maximum: maxAttachmentBytes }, createdAt: { type: "string", format: "date-time" },
  createdBy: { type: "string" }, canRemove: { type: "boolean" },
} };
const attachmentSchema = { $ref: "#/components/schemas/Attachment" };
const attachmentError = { description: "Typed error; inspect error.code.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
const ticketKeyParameter = { name: "key", in: "path", required: true, schema: { type: "string" } };
const attachmentParameter = { name: "id", in: "path", required: true, schema: attachmentId };
const imageContent = Object.fromEntries(attachmentContentTypes.map((type) => [type, { schema: { type: "string", format: "binary" } }]));
paths["/api/v1/tickets/{key}/attachments"] = { parameters: [ticketKeyParameter], get: {
  operationId: "list_attachments",
  responses: { 200: { description: "Available images and whether the installation has a storage binding.", content: { "application/json": {
    schema: { type: "object", required: ["enabled", "items"], properties: {
      enabled: { type: "boolean" }, items: { type: "array", maxItems: maxTicketAttachments, items: attachmentSchema },
    } },
  } } }, default: attachmentError },
} };
paths["/api/v1/tickets/{key}/attachments/{id}"] = { parameters: [ticketKeyParameter, attachmentParameter],
  get: { operationId: "download_attachment", responses: { 200: { description: "Private original image.", content: imageContent }, default: attachmentError } },
  put: { operationId: "upload_attachment", description: "Send raw bytes and reuse the same client-chosen ID when retrying the same file.",
    parameters: [{ name: "X-Taski-Filename", in: "header", required: true, schema: { type: "string" }, description: "Original filename encoded with percent encoding." }],
    requestBody: { required: true, description: `Up to ${maxAttachmentBytes} bytes.`, content: imageContent },
    responses: { 200: { description: "Confirmed attachment.", content: { "application/json": { schema: attachmentSchema } } }, default: attachmentError },
  },
  delete: { operationId: "remove_attachment", responses: { 204: { description: "Removed by the uploader." }, default: attachmentError } },
};
paths["/api/v1/access"] = { get: { operationId: "get_access_options", security: [], responses: { 200: { description: "Public project/brand names and selectable configured members; no secrets or tickets" } } } };
paths["/api/v1/session"] = {};
for (const [method, operationId] of [["post", "create_session"], ["get", "get_session"], ["put", "change_member"], ["delete", "logout"]]) {
  const operation = { operationId, security: method === "post" ? [] : [{ TeamCookie: [] }], responses: { [method === "delete" ? "204" : "200"]: { description: method === "delete" ? "Session revoked; cookie cleared" : "Selected member and self_selected assurance; session cookie for POST/PUT" } } };
  if (["post", "put"].includes(method)) operation.requestBody = { required: true, content: { "application/json": { schema: {
    type: "object", additionalProperties: false, properties: { memberId: { type: "string" }, ...(method === "post" ? { code: { type: "string", minLength: 1, maxLength: 256 } } : {}) },
    required: method === "post" ? ["memberId", "code"] : ["memberId"],
  } } } };
  paths["/api/v1/session"][method] = operation;
}
const document = { openapi: "3.1.0", info: { title: "Taski API", version: "0.1.0", description: "Local implemented contract; see docs/api.md and docs/access.md. No production deployment is implied. assigneeId=~ in GET means unassigned." },
  servers: [{ url: "http://127.0.0.1:8787" }], security: [{ TeamBearer: [], MemberHeader: [] }, { TeamCookie: [] }], paths,
  components: { schemas: components, securitySchemes: {
    TeamBearer: { type: "http", scheme: "bearer", description: "Installation's shared code; never embed in URL/tool args" },
    MemberHeader: { type: "apiKey", in: "header", name: "X-Taski-Member" }, TeamCookie: { type: "apiKey", in: "cookie", name: "taski_session" },
  } } };
const target = new URL("../docs/api/openapi.json", import.meta.url);
const serialized = JSON.stringify(document, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (await readFile(target, "utf8") !== serialized) throw new Error("API schema changed; run npm run api:generate and review the diff");
  console.log("OK: OpenAPI matches the operation contracts, attachments and access routes.");
} else { await writeFile(target, serialized); console.log("Generated docs/api/openapi.json"); }
