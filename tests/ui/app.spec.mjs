import { test, expect } from "@playwright/test";

const member = { id: "alex", name: "Alex" };
const summary = { today: "2026-11-27", timezone: "UTC", totals: { done: 0, inReview: 0, remaining: 1, total: 1, percent: 0 },
  feedbackOpen: 0, closedLast7Days: { count: 0, items: [] }, tracks: [] };
const summaryReply = (url, reply) => reply(url.search.includes("format=text") ? { today: summary.today, text: "Demo · vie 27 nov" } : summary);
const row = { key: "DEMO-001", title: "Primera tarea", status: "todo", assigneeId: "alex", highlighted: false, version: 1, areaId: "general", type: "task", prUrl: null };
async function setup(page, create) {
  const requests = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(), url = new URL(req.url()); requests.push(req);
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (url.pathname.endsWith("/access")) return reply({ projectName: "Demo", brandName: "Taski Demo", members: [member] });
    if (url.pathname.endsWith("/session")) return reply({ member, identityAssurance: "self_selected" });
    if (url.pathname.endsWith("/project")) return reply({ configVersion: 1, project: { name: "Demo", members: [member], areas: [{ id: "general", label: "General" }], statusLabels: { todo: "Pendiente" } } });
    if (url.pathname.endsWith("/activity")) return reply({ items: [], nextCursor: "fixture-cursor", hasMore: false });
    if (url.pathname.endsWith("/summary")) return summaryReply(url, reply);
    if (url.pathname.endsWith("/areas")) return reply({ items: [] });
    if (req.method() === "POST") return create(route);
    if (url.pathname.endsWith("/tickets/DEMO-002")) return reply({ ticket: { ...row, key: "DEMO-002", title: "Nueva tarea", description: "Contenido guardado" }, comments: [], nextCommentsCursor: null });
    return reply({ items: [row], nextCursor: null });
  });
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "Todo el equipo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Primera tarea", exact: true })).toBeVisible();
  return requests;
}
test("connected list requests bounded server filters and searches loaded pages", async ({ page }) => {
  const requests = await setup(page);
  await page.getByRole("button", { name: "Mis tickets", exact: true }).click();
  await expect.poll(() => requests.some((r) => r.url().includes("assigneeId=alex") && r.url().includes("limit=20"))).toBe(true);
  await page.getByRole("button", { name: "Por revisar", exact: true }).click();
  await expect.poll(() => requests.some((r) => r.url().includes("status=in_review"))).toBe(true);
  await page.getByLabel("Área", { exact: true }).selectOption("general");
  await expect.poll(() => requests.some((r) => r.url().includes("areaId=general"))).toBe(true);
  await page.getByLabel("Buscar entre los tickets cargados").fill("inexistente");
  await expect(page.getByRole("button", { name: "Primera tarea", exact: true })).toHaveCount(0);
});
test("capture preserves uncertain writes and retries the identical operation before opening confirmed detail", async ({ page }) => {
  const writes = [];
  await setup(page, (route) => {
    writes.push(route.request().postDataJSON());
    return writes.length === 1 ? route.abort("failed") : route.fulfill({ json: { key: "DEMO-002", version: 1, changed: ["created"] } });
  });
  await page.getByLabel("Nueva tarea", { exact: true }).fill("Nueva tarea");
  await page.getByLabel("Nueva tarea", { exact: true }).press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Nueva tarea", { exact: true })).toHaveValue("Nueva tarea");
  await page.getByRole("button", { name: "Confirmar reintento" }).click();
  await expect(page.getByRole("region", { name: "Nueva tarea" })).toBeVisible();
  await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue("Contenido guardado");
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]);
});
test("feedback done check keeps an uncertain request and retries it unchanged", async ({ page }) => {
  const feedback = { ...row, key: "DEMO-010", title: "Idea abierta", type: "feedback", createdBy: "alex" };
  const writes = [];
  const lists = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(), url = new URL(req.url());
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (url.pathname.endsWith("/access")) return reply({ projectName: "Demo", brandName: "Taski Demo", members: [{ ...member, defaultView: "feedback" }] });
    if (url.pathname.endsWith("/session")) return reply({ member, identityAssurance: "self_selected" });
    if (url.pathname.endsWith("/project")) return reply({ configVersion: 1, project: { name: "Demo", members: [member], areas: [{ id: "general", label: "General" }], statusLabels: { todo: "Pendiente" } } });
    if (req.method() === "PATCH") {
      writes.push(req.postDataJSON());
      return writes.length === 1 ? route.abort("failed") : reply({ key: feedback.key, version: 2, changed: ["status"] });
    }
    lists.push(url.search);
    return reply({ items: writes.length > 1 ? [] : [feedback], nextCursor: null });
  });
  await page.addInitScript(() => localStorage.removeItem("taski.feedbackFilter"));
  await page.goto("http://127.0.0.1:5174");
  const check = page.getByRole("checkbox", { name: "Hecho · Idea abierta", exact: true });
  await expect(check).toBeVisible();
  expect(lists.some((search) => search.includes("type=feedback") && search.includes("open=true"))).toBe(true);
  await check.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(check).not.toBeChecked();
  await check.click();
  await expect(page.getByRole("status").filter({ hasText: "«Idea abierta» marcado como hecho." })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]).toMatchObject({ expectedVersion: 1, changes: { status: "done" } });
  await page.getByRole("button", { name: "Hechos", exact: true }).click();
  await expect.poll(() => lists.some((search) => search.includes("status=done"))).toBe(true);
});
test("track plan keeps an uncertain request and retries it unchanged", async ({ page }) => {
  const writes = [];
  let track = { id: "general", label: "General", priority: 2, targetDate: null, version: 0, updatedBy: null, updatedAt: null };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(), url = new URL(req.url());
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (url.pathname.endsWith("/access")) return reply({ projectName: "Demo", brandName: "Taski Demo", members: [member] });
    if (url.pathname.endsWith("/session")) return reply({ member, identityAssurance: "self_selected" });
    if (url.pathname.endsWith("/project")) return reply({ configVersion: 1, project: { name: "Demo", members: [member], areas: [{ id: "general", label: "General" }], statusLabels: { todo: "Pendiente" } } });
    if (url.pathname.endsWith("/areas/general")) {
      writes.push(req.postDataJSON());
      if (writes.length === 1) return route.abort("failed");
      track = { ...track, priority: 1, version: 1, updatedBy: "alex" };
      return reply({ areaId: "general", version: 1, changed: ["priority"] });
    }
    if (url.pathname.endsWith("/areas")) return reply({ items: [track] });
    if (url.pathname.endsWith("/summary")) return summaryReply(url, reply);
    return reply({ items: [row], nextCursor: null });
  });
  await page.addInitScript(() => localStorage.removeItem("taski.ticketGrouping"));
  await page.goto("http://127.0.0.1:5174");
  await page.getByRole("button", { name: "Todo el equipo", exact: true }).click();
  const area = page.getByRole("region", { name: "General", exact: true });
  await area.getByRole("button", { name: "Editar prioridad y fecha de General" }).click();
  const form = area.getByRole("form", { name: "Plan de General" });
  await form.getByLabel("Prioridad").selectOption("1");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(form.getByRole("alert")).toContainText("Guardar reintenta el mismo cambio");
  await expect(form.getByLabel("Prioridad")).toBeDisabled();
  await form.getByRole("button", { name: "Reintentar" }).click();
  await expect(area.locator(".track-priority")).toContainText("P1");
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]).toMatchObject({ expectedVersion: 0, priority: 1 });
  expect(writes[0]).not.toHaveProperty("targetDate");
});
