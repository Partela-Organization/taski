import { test, expect } from "@playwright/test";

const app = "http://127.0.0.1:5174";
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/**
 * End-to-end walkthrough of the summary and tracks plan (T1–T6) with fictional data on Worker/D1.
 * It edits shared track plans, so it is opt-in and runs alone to refresh the screenshots in docs/verification:
 * TASKI_WALKTHROUGH=1 npx playwright test tracks-walkthrough --project chromium
 */
test.skip(!process.env.TASKI_WALKTHROUGH, "Opt-in walkthrough; set TASKI_WALKTHROUGH=1 and run it alone.");
test("walkthrough: summary, tracks, Ir a… and feedback done on desktop and phone", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (value) => { window.copiedRecap = value; } } });
  });
  await page.goto(app);
  await page.getByRole("radio", { name: "Alex", exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible();

  // Fictional plan: General due in three days with everything pending (at risk), Web due in ten days and mostly done.
  const api = (path, method = "GET", data) => page.request.fetch(`${app}/api/v1/${path}`, { method, ...(data ? { data } : {}) });
  const areas = (await (await api("areas")).json()).items;
  const version = (id) => areas.find((area) => area.id === id).version;
  expect((await api("areas/general", "PATCH", { expectedVersion: version("general"), idempotencyKey: `walk-general-${testInfo.workerIndex}`, priority: 1, targetDate: day(3) })).ok()).toBe(true);
  expect((await api("areas/web", "PATCH", { expectedVersion: version("web"), idempotencyKey: `walk-web-${testInfo.workerIndex}`, priority: 2, targetDate: day(10) })).ok()).toBe(true);
  for (const [n, status] of [[1, "done"], [2, "done"], [3, "done"], [4, "in_review"], [5, "todo"]]) {
    const title = `Revisar formulario de pagos ${n} · recorrido`;
    const created = await (await api("tickets", "POST", { title, areaId: "web", idempotencyKey: title })).json();
    if (status !== "todo") expect((await api(`tickets/${created.key}`, "PATCH", { expectedVersion: 1, idempotencyKey: `${title}-status`, changes: { status } })).ok()).toBe(true);
  }
  for (const title of ["El recibo no indica el mes · recorrido", "Avisar el turno por la mañana · recorrido"]) {
    await api("tickets", "POST", { title, type: "feedback", idempotencyKey: title });
  }

  await page.getByRole("button", { name: "Actualizar resumen" }).click();
  const summary = await (await api("summary")).json();
  const general = summary.tracks.find((track) => track.id === "general");
  const web = summary.tracks.find((track) => track.id === "web");
  expect(summary.tracks[0].id).toBe("general");
  expect(general).toMatchObject({ priority: 1, health: "risk", daysLeft: 3 });
  expect(web).toMatchObject({ priority: 2, health: "ok", daysLeft: 10 });
  const now = page.getByRole("region", { name: "Lo que toca ahora" });
  await expect(now.getByRole("button", { name: /^General se entrega el .* en 3 días/ })).toBeVisible();
  await expect(now.getByRole("button", { name: /feedback sin marcar como hecho/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Tracks" }).getByRole("img", { name: new RegExp(`^${web.percent}% terminado: ${web.done} de ${web.total}`) })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tracks-summary-desktop.png"), fullPage: true });

  const text = (await (await api("summary?format=text")).json()).text;
  await page.getByRole("button", { name: "Copiar para Telegram" }).click();
  expect(await page.evaluate(() => window.copiedRecap)).toBe("```\n" + text + "\n```");

  // Track by shortcut, plan editing, capture and the "Ir a…" palette.
  await page.keyboard.press("1");
  await expect(page).toHaveURL(`${app}/track/general`);
  await expect(page.getByRole("heading", { name: "General", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Progreso de General" })).toContainText("En riesgo");
  await page.getByRole("button", { name: "Editar prioridad y fecha de General" }).click();
  const form = page.getByRole("form", { name: "Plan de General" });
  await form.getByLabel("Listo antes de").fill(day(20));
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("region", { name: "Progreso de General" })).toContainText("En camino");
  await page.screenshot({ path: testInfo.outputPath("tracks-track-desktop.png") });

  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Ir a un track o ticket" });
  await palette.getByRole("combobox").fill("formulario de pagos 5");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("tracks-go-to-desktop.png") });
  await palette.getByRole("combobox").press("Enter");
  await expect(page.getByRole("region", { name: "Revisar formulario de pagos 5 · recorrido", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(`${app}/track/general`);

  // Feedback done check.
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  await page.getByRole("group", { name: "Mostrar feedback" }).getByRole("button", { name: "Abiertos" }).click();
  await page.getByRole("checkbox", { name: "Hecho · El recibo no indica el mes · recorrido" }).click();
  await expect(page.getByRole("status").filter({ hasText: "marcado como hecho" })).toBeVisible();
  await page.getByRole("group", { name: "Mostrar feedback" }).getByRole("button", { name: "Todos" }).click();
  await expect(page.getByRole("checkbox", { name: "Hecho · El recibo no indica el mes · recorrido" })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("tracks-feedback-desktop.png") });
  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  await expect(now.getByRole("button", { name: /1 feedback sin marcar como hecho/ })).toBeVisible();

  // Phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Tracks" }).locator(".summary-track")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath("tracks-summary-mobile.png"), fullPage: true });
});
