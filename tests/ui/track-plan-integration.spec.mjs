import { test, expect } from "@playwright/test";

const app = "http://127.0.0.1:5174";

test("a track's priority and target date are edited from its area heading and audited as a person", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.removeItem("taski.ticketGrouping"));
  await page.goto(app);
  await page.getByRole("radio", { name: "Sam", exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Todo el equipo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trabajo del equipo", exact: true })).toBeVisible();
  const title = `Tarea con plan · ${testInfo.project.name}`;
  expect((await page.request.post(`${app}/api/v1/tickets`, { data: { title, areaId: "web", idempotencyKey: title } })).ok()).toBe(true);
  await page.getByRole("button", { name: "Actualizar lista" }).click();

  const area = page.getByRole("region", { name: "Web", exact: true });
  await expect(area.getByRole("button", { name: title, exact: true })).toBeVisible();
  const before = (await (await page.request.get(`${app}/api/v1/areas`)).json()).items.find((item) => item.id === "web");
  await expect(area.locator(".track-priority")).toContainText(`P${before.priority}`);

  await area.getByRole("button", { name: "Editar prioridad y fecha de Web" }).click();
  const form = area.getByRole("form", { name: "Plan de Web" });
  await form.getByLabel("Prioridad").selectOption("1");
  await form.getByLabel("Listo antes de").fill("2026-12-05");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(form).toHaveCount(0);
  await expect(area.locator(".track-priority")).toContainText("P1");
  await expect(area.getByText("Listo antes del 5 dic")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("track-plan.png") });

  await page.reload();
  await expect(area.getByText("Listo antes del 5 dic")).toBeVisible();
  await area.getByRole("button", { name: "Editar prioridad y fecha de Web" }).click();
  await form.getByLabel("Listo antes de").fill("");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(area.getByText("Sin fecha")).toBeVisible();

  await area.getByRole("button", { name: "Editar prioridad y fecha de Web" }).click();
  await form.getByRole("button", { name: "Cancelar" }).click();
  await expect(form).toHaveCount(0);

  const after = (await (await page.request.get(`${app}/api/v1/areas`)).json()).items.find((item) => item.id === "web");
  expect(after).toMatchObject({ priority: 1, targetDate: null, version: before.version + 2, updatedBy: "sam" });
});

test("a stale track plan asks to review the current values", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.removeItem("taski.ticketGrouping"));
  await page.goto(app);
  await page.getByRole("radio", { name: "Alex", exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Todo el equipo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trabajo del equipo", exact: true })).toBeVisible();
  const title = `Tarea general con conflicto de plan · ${testInfo.project.name}`;
  expect((await page.request.post(`${app}/api/v1/tickets`, { data: { title, idempotencyKey: title } })).ok()).toBe(true);
  await page.getByRole("button", { name: "Actualizar lista" }).click();
  const area = page.getByRole("region", { name: "General", exact: true });
  await expect(area.getByRole("button", { name: title, exact: true })).toBeVisible();
  await area.getByRole("button", { name: "Editar prioridad y fecha de General" }).click();
  const current = (await (await page.request.get(`${app}/api/v1/areas`)).json()).items.find((item) => item.id === "general");
  const other = await page.request.patch(`${app}/api/v1/areas/general`, { data: {
    expectedVersion: current.version, idempotencyKey: `other-session-${Date.now()}`, priority: current.priority === 3 ? 2 : 3,
  } });
  expect(other.ok()).toBe(true);
  const form = area.getByRole("form", { name: "Plan de General" });
  await form.getByLabel("Listo antes de").fill("2026-12-12");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(form.getByRole("alert")).toContainText("El track cambió en otra sesión");
  await form.getByRole("button", { name: "Cancelar" }).click();
  await area.getByRole("button", { name: "Editar prioridad y fecha de General" }).click();
  await area.getByRole("form", { name: "Plan de General" }).getByLabel("Listo antes de").fill("2026-12-12");
  await area.getByRole("form", { name: "Plan de General" }).getByRole("button", { name: "Guardar" }).click();
  await expect(area.getByText("Listo antes del 12 dic")).toBeVisible();
});
