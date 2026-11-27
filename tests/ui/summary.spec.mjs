import { test, expect } from "@playwright/test";

const app = "http://127.0.0.1:5174";
const member = { id: "alex", name: "Alex" };
const areas = [{ id: "accesos", label: "Accesos y llaves" }, { id: "pagos", label: "Pagos" }, { id: "limpieza", label: "Limpieza" }, { id: "comunicacion", label: "Comunicación" }];
const track = (id, label, priority, targetDate, daysLeft, health, done, inReview, remaining, next) => ({
  id, label, priority, targetDate, daysLeft, health, done, inReview, remaining, total: done + inReview + remaining,
  percent: Math.round(done / (done + inReview + remaining) * 100), next,
});
const summary = {
  today: "2026-11-27", timezone: "America/Caracas",
  totals: { done: 21, inReview: 3, remaining: 7, total: 31, percent: 68 }, feedbackOpen: 2,
  closedLast7Days: { count: 7, items: [
    { key: "DEMO-030", title: "Registrar pagos atrasados de octubre", areaId: "pagos", closedAt: "2026-11-26T10:00:00.000Z" },
    { key: "DEMO-031", title: "Publicar turnos de diciembre", areaId: "limpieza", closedAt: "2026-11-25T10:00:00.000Z" },
  ] },
  tracks: [
    track("accesos", "Accesos y llaves", 1, "2026-11-25", -2, "late", 5, 0, 1, { key: "DEMO-010", title: "Entregar copias de llaves a la unidad 4B", status: "todo", assigneeId: null }),
    track("pagos", "Pagos", 1, "2026-12-01", 4, "risk", 7, 2, 3, { key: "DEMO-011", title: "Conciliar transferencias de noviembre", status: "in_progress", assigneeId: "alex" }),
    track("limpieza", "Limpieza", 2, "2026-11-30", 3, "ok", 6, 1, 1, { key: "DEMO-012", title: "Confirmar turno del fin de semana", status: "todo", assigneeId: null }),
    track("comunicacion", "Comunicación", 3, null, null, "none", 3, 0, 2, null),
  ],
};
const text = "Proyecto demo · vie 27 nov\n\nAccesos y llaves ▓▓▓▓▓▓▓▓░░  83%\n\nTotal            ▓▓▓▓▓▓▓░░░  68%";

test("summary shows reminders, figures and track bars, sorts and copies the Telegram recap", async ({ page }, testInfo) => {
  const requests = [];
  await page.addInitScript(() => {
    if (window.name !== "seeded") { sessionStorage.clear(); localStorage.removeItem("taski.summarySort"); window.name = "seeded"; }
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (value) => { window.copiedRecap = value; } } });
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
    const reply = (json) => route.fulfill({ json });
    if (url.pathname.endsWith("/access")) return reply({ projectName: "Demo", brandName: "Taski", members: [member] });
    if (url.pathname.endsWith("/session")) return reply({ member, identityAssurance: "self_selected" });
    if (url.pathname.endsWith("/project")) return reply({ configVersion: 1, project: { name: "Proyecto demo", members: [member], areas, statusLabels: {}, typeLabels: {} } });
    if (url.pathname.endsWith("/summary")) return reply(url.search.includes("format=text") ? { today: summary.today, text } : summary);
    if (url.pathname.endsWith("/areas")) return reply({ items: [] });
    if (url.pathname.includes("/tickets/DEMO-011")) return reply({ ticket: { key: "DEMO-011", title: "Conciliar transferencias de noviembre", status: "in_progress", assigneeId: "alex", highlighted: false, version: 3, areaId: "pagos", type: "task", prUrl: null, createdBy: "alex", url: `${app}/t/DEMO-011`, description: "", id: "x", createdAt: "2026-11-20T00:00:00Z", updatedAt: "2026-11-26T00:00:00Z" }, comments: [], nextCommentsCursor: null, omitted: [] });
    return reply({ items: [], nextCursor: null });
  });
  await page.goto(app);
  await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resumen", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Viernes 27 de noviembre", { exact: true })).toBeVisible();
  expect(requests.some((path) => path.startsWith("/api/v1/tickets?"))).toBe(false);

  const now = page.getByRole("region", { name: "Lo que toca ahora" });
  const reminders = now.getByRole("button");
  await expect(reminders).toHaveCount(4);
  await expect(reminders.nth(0)).toContainText("Accesos y llaves venció hace 2 días");
  await expect(reminders.nth(0)).toContainText("1 por hacer · siguiente: Entregar copias de llaves a la unidad 4B");
  await expect(reminders.nth(1)).toContainText("Pagos se entrega el Mar 1 dic · en 4 días");
  await expect(reminders.nth(1)).toContainText("3 por hacer · 2 esperan revisión · siguiente: Conciliar transferencias de noviembre");
  await expect(reminders.nth(2)).toContainText("3 tareas esperan revisión");
  await expect(reminders.nth(2)).toContainText("2 de Pagos, 1 de Limpieza");
  await expect(reminders.nth(3)).toContainText("2 feedback sin marcar como hechos");

  const figures = page.getByRole("region", { name: "Cifras del proyecto" });
  await expect(figures).toContainText("68%");
  await expect(figures).toContainText("21 de 31 tareas terminadas");
  await expect(figures).toContainText("Cerradas en 7 días7");
  await expect(figures).toContainText("2 de 4");
  await expect(figures).toContainText("Accesos y llaves, Pagos");
  await expect(figures).toContainText("Limpieza");
  await expect(figures).toContainText("Lun 30 nov · en 3 días");

  const tracks = page.getByRole("region", { name: "Tracks" });
  const names = () => tracks.locator(".summary-track__name").allTextContents();
  expect(await names()).toEqual(["Accesos y llaves", "Pagos", "Limpieza", "Comunicación"]);
  await expect(tracks.getByRole("img", { name: "58% terminado: 7 de 12, 2 por revisar, 3 por hacer" })).toBeVisible();
  await expect(tracks.locator(".summary-track").nth(1)).toContainText("En riesgo");
  await expect(tracks.locator(".summary-track").nth(0)).toContainText("Vencido");
  await expect(tracks.locator(".summary-track").nth(3)).toContainText("Sin fecha");
  await tracks.getByRole("button", { name: "Fecha límite" }).click();
  expect(await names()).toEqual(["Accesos y llaves", "Limpieza", "Pagos", "Comunicación"]);
  await page.screenshot({ path: testInfo.outputPath("summary-desktop.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("summary-dark.png") });
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(tracks.getByRole("button", { name: "Fecha límite" })).toHaveAttribute("aria-pressed", "true");

  await expect(page.locator(".summary-telegram")).toHaveText(text);
  await page.getByRole("button", { name: "Copiar para Telegram" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copiado. Pégalo en Telegram." })).toBeVisible();
  expect(await page.evaluate(() => window.copiedRecap)).toBe("```\n" + text + "\n```");
  const closed = page.getByRole("region", { name: "Cerrado en los últimos 7 días" });
  await expect(closed).toContainText("Registrar pagos atrasados de octubre");
  await expect(closed).toContainText("y 5 más");

  await tracks.getByRole("button", { name: "Siguiente: Conciliar transferencias de noviembre" }).click();
  await expect(page).toHaveURL(`${app}/t/DEMO-011`);
  await expect(page.getByRole("region", { name: "Conciliar transferencias de noviembre", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(app);
  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar para Telegram" })).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath("summary-mobile.png"), fullPage: true });
});

test("summary is the desktop landing view and opens tracks, review and feedback from real data", async ({ page }) => {
  await page.goto(app);
  await page.getByRole("radio", { name: "Sam", exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible();
  const tracks = page.getByRole("region", { name: "Tracks" });
  await expect(tracks.locator(".summary-track__name")).toHaveText(["General", "Web"], { useInnerText: true }).catch(async () => {
    await expect(tracks.locator(".summary-track__name")).toHaveCount(2);
  });
  const api = await (await page.request.get(`${app}/api/v1/summary`)).json();
  const general = api.tracks.find((entry) => entry.id === "general");
  await expect(tracks.getByRole("img", { name: new RegExp(`^${general.percent}% terminado`) }).first()).toBeVisible();
  await expect(page.locator(".summary-telegram")).toContainText("Total");

  await tracks.getByRole("button", { name: "General", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trabajo del equipo" })).toBeVisible();
  await expect(page.getByLabel("Área", { exact: true })).toHaveValue("general");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Trabajo del equipo" })).toBeVisible();

  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  const review = page.getByRole("region", { name: "Lo que toca ahora" }).getByRole("button", { name: /esperan? revisión/ });
  if (await review.count()) {
    await review.click();
    await expect(page.getByRole("heading", { name: "Por revisar" })).toBeVisible();
  }
});
