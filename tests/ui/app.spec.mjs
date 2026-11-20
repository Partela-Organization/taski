import { test, expect } from "@playwright/test";

const member = { id: "alex", name: "Alex" };
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
    if (req.method() === "POST") return create(route);
    if (url.pathname.endsWith("/tickets/DEMO-002")) return reply({ ticket: { ...row, key: "DEMO-002", title: "Nueva tarea", description: "Contenido guardado" }, comments: [], nextCommentsCursor: null });
    return reply({ items: [row], nextCursor: null });
  });
  await page.goto("http://127.0.0.1:5174");
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
  await expect(page.getByText("Contenido guardado")).toBeVisible();
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]);
});
