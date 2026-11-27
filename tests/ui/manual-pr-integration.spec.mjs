import { test, expect } from "@playwright/test";

test("manual PR is validated, saved with state, displayed and auditable after replacement and removal", async ({ page }) => {
  const origin = "http://127.0.0.1:5174";
  await page.goto(`${origin}/t/DEMO-020`);
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("button", { name: "Todo el equipo", exact: true }).click();
  const panel = page.getByRole("region", { name: "Fixture 20", exact: true });
  const field = panel.getByLabel("Enlace al PR");
  const save = panel.getByRole("button", { name: "Guardar cambios" });
  const first = "https://github.com/example/demo/pull/42";
  const later = "https://github.com/example/demo/pull/43";
  const link = panel.getByRole("link", { name: "Abrir PR vinculado" });
  await field.fill("http://github.com/example/demo/pull/42");
  await save.click();
  await expect(panel.getByRole("alert")).toContainText("enlace HTTPS");
  await expect(field).toHaveValue("http://github.com/example/demo/pull/42");
  await field.fill("HTTPS://GITHUB.COM:443/example/demo/pull/42");
  await panel.getByLabel("Estado", { exact: true }).selectOption("in_review");
  await save.click();
  await expect(link).toHaveAttribute("href", first);
  await expect(page.getByRole("link", { name: "Abrir PR de DEMO-020" })).toHaveAttribute("href", first);
  let activity = await (await page.request.get(`${origin}/api/v1/activity?ticketKey=DEMO-020`)).json();
  expect(activity.items.at(-1)).toMatchObject({ actor: { channel: "web" }, changes: {
    status: { before: "todo", after: "in_review" }, prUrl: { before: null, after: first },
  } });
  await field.fill(later);
  await save.click();
  await expect(link).toHaveAttribute("href", later);
  await field.clear();
  await save.click();
  await expect(link).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Abrir PR de DEMO-020" })).toHaveCount(0);
  activity = await (await page.request.get(`${origin}/api/v1/activity?ticketKey=DEMO-020`)).json();
  expect(activity.items.slice(-2).map((event) => event.changes.prUrl)).toEqual([
    { before: first, after: later }, { before: later, after: null },
  ]);
});
