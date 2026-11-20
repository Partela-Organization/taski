import { test, expect } from "@playwright/test";

test("stable routes preserve drafts across tasks and resolve real version conflicts without overwriting unrelated changes", async ({ page, context }) => {
  await page.goto("http://127.0.0.1:5174/t/DEMO-003");
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Fixture 03");
  await page.getByLabel("Título", { exact: true }).fill("Borrador de la tercera tarea");
  await page.getByRole("button", { name: "Fixture 04", exact: true }).click();
  await expect(page).toHaveURL(/\/t\/DEMO-004$/);
  await page.goBack();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Borrador de la tercera tarea");
  const url = "http://127.0.0.1:5174/api/v1/tickets/DEMO-003";
  const before = await (await context.request.get(url)).json();
  const external = await context.request.patch(url, { data: { expectedVersion: before.ticket.version, idempotencyKey: "detail-external", changes: { description: "Cambio externo que debe conservarse" } } });
  expect(external.ok()).toBe(true);
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Otra persona");
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Borrador de la tercera tarea");
  await page.getByRole("button", { name: "Consultar versión actual y conservar borrador" }).click();
  await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue("Cambio externo que debe conservarse");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Cambios guardados");
  await page.reload();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Borrador de la tercera tarea");
  await expect(page.getByLabel("Descripción", { exact: true })).toHaveValue("Cambio externo que debe conservarse");
  await page.keyboard.press("Escape"); await expect(page).toHaveURL("http://127.0.0.1:5174/");
  await page.goBack(); await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Borrador de la tercera tarea");
});
