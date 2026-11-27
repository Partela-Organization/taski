import { test, expect } from "@playwright/test";

test("conversation paginates real comments/activity, audits reversible highlighting and preserves comments on conflict", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto("http://127.0.0.1:5174/t/DEMO-005");
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Todo el equipo", exact: true }).click();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue("Fixture 05");
  const url = "http://127.0.0.1:5174/api/v1/tickets/DEMO-005";
  let version = (await (await context.request.get(url)).json()).ticket.version;
  for (let n = 1; n <= 12; n++) {
    const response = await context.request.post(`${url}/comments`, { data: { expectedVersion: version, idempotencyKey: `convo-seed-${n}`, body: `Comentario ficticio ${n}` } });
    expect(response.ok()).toBe(true); version = (await response.json()).version;
  }
  await page.reload();
  const section = page.getByRole("region", { name: "Conversación y actividad" });
  await expect(section.locator("article")).toHaveCount(5);
  await section.getByRole("button", { name: "Comentarios anteriores" }).click();
  await expect(section.locator("article")).toHaveCount(10);
  await section.getByRole("button", { name: "Comentarios anteriores" }).click();
  await expect(section.locator("article")).toHaveCount(12);
  await expect(section.getByRole("button", { name: "Más actividad" })).toBeVisible();
  await section.getByRole("button", { name: "Más actividad" }).click();
  await expect(section.locator("ol li")).toHaveCount(13);
  await section.getByRole("button", { name: "Resaltar tarea", exact: true }).click();
  await expect(section.getByRole("button", { name: "Quitar resaltado", exact: true })).toHaveAttribute("aria-pressed", "true");
  await section.getByRole("button", { name: "Quitar resaltado", exact: true }).click();
  await expect(section.getByRole("button", { name: "Resaltar tarea", exact: true })).toHaveAttribute("aria-pressed", "false");
  const latest = await (await context.request.get(url)).json();
  expect(latest.ticket.status).toBe("todo"); expect(latest.ticket.highlighted).toBe(false);
  await section.getByLabel("Comentario", { exact: true }).fill("Mi comentario conservado");
  const external = await context.request.patch(url, { data: { expectedVersion: latest.ticket.version, idempotencyKey: "convo-external", changes: { description: "Contexto externo" } } });
  expect(external.ok()).toBe(true);
  await section.getByRole("button", { name: "Enviar comentario", exact: true }).click();
  await expect(section.getByRole("alert")).toContainText("La tarea cambió");
  await expect(section.getByLabel("Comentario", { exact: true })).toHaveValue("Mi comentario conservado");
  await section.getByRole("button", { name: "Enviar comentario", exact: true }).click();
  await expect(section.locator("article").filter({ hasText: "Mi comentario conservado" })).toHaveCount(1);
  await section.getByRole("button", { name: "Más actividad" }).click();
  await expect(section.locator("ol")).toContainText("Resaltado");
  await expect(section.locator("ol")).toContainText("Antes:");
  await expect(section.locator("ol")).toContainText("web");
});
