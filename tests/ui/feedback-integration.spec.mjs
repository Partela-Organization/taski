import { test, expect } from "@playwright/test";

const app = "http://127.0.0.1:5174";
const title = "Una idea para simplificar el formulario";
async function enter(page, member) {
  await page.getByRole("radio", { name: member, exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("mobile feedback works without technical fields and conversion preserves identity, author and conversation", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(app);
  await enter(page, "Alex");
  await expect(page.getByRole("button", { name: "Feedback", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".feedback-capture").getByLabel("Área", { exact: true })).toHaveCount(0);
  await page.getByLabel("Título del feedback").fill(title);
  await page.getByRole("button", { name: "Añadir contexto", exact: true }).click();
  await page.getByLabel("Contexto (opcional)").fill("Sería útil explicar qué datos hacen falta.");
  const creation = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/tickets"));
  await page.getByRole("button", { name: "Compartir feedback" }).click();
  const receipt = await (await creation).json();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog.getByText("Sería útil explicar qué datos hacen falta.", { exact: true })).toBeVisible();
  const link = page.url();
  await expect(page).toHaveURL(`${app}/t/${receipt.key}`);
  const created = await (await page.request.get(`${app}/api/v1/tickets/${receipt.key}?view=full`)).json();
  await dialog.getByRole("button", { name: "Cerrar detalle" }).click();
  await expect(page.locator(".tickets li").filter({ hasText: title })).toContainText("Feedback · Alex");
  await page.screenshot({ path: testInfo.outputPath("feedback-mobile.png") });
  const recipient = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const desktop = await recipient.newPage();
    await desktop.goto(link);
    await enter(desktop, "Taylor");
    await expect(desktop.getByRole("button", { name: "Feedback", exact: true })).toHaveAttribute("aria-pressed", "true");
    const panel = desktop.getByRole("region", { name: title, exact: true });
    await expect(panel.getByText("Compartido por Alex")).toBeVisible();
    const convert = panel.getByRole("button", { name: "Convertir en tarea" });
    let resumeDetail;
    const detailCanRefresh = new Promise((resolve) => { resumeDetail = resolve; });
    await desktop.route(`${app}/api/v1/tickets/${receipt.key}?view=full&commentsLimit=5`, async (route) => {
      await detailCanRefresh;
      await route.continue();
    }, { times: 1 });
    try {
      await panel.getByLabel("Comentario", { exact: true }).fill("Puedo revisar el texto.");
      await panel.getByRole("button", { name: "Enviar comentario" }).click();
      await expect(convert).toBeDisabled();
    } finally {
      resumeDetail();
    }
    await expect(panel.locator("article").getByText("Puedo revisar el texto.", { exact: true })).toBeVisible();
    await desktop.screenshot({ path: testInfo.outputPath("feedback-desktop.png") });
    await convert.click();
    await expect(panel.getByLabel("Responsable", { exact: true })).toBeVisible();
    await expect(desktop).toHaveURL(link);
    await panel.getByLabel("Responsable", { exact: true }).selectOption("sam");
    await panel.getByLabel("Área de la tarea").selectOption("web");
    await panel.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(panel.getByRole("status").filter({ hasText: "Cambios guardados" })).toBeVisible();
    await desktop.reload();
    await expect(panel.getByText("Puedo revisar el texto.", { exact: true })).toBeVisible();
    await expect(panel.getByLabel("Responsable", { exact: true })).toHaveValue("sam");
    const converted = await (await recipient.request.get(`${app}/api/v1/tickets/${receipt.key}?view=full`)).json();
    expect(converted.ticket).toMatchObject({ id: created.ticket.id, key: receipt.key, url: created.ticket.url, createdBy: "alex",
      type: "task", status: "todo", assigneeId: "sam", areaId: "web" });
    const activity = await (await recipient.request.get(`${app}/api/v1/activity?ticketKey=${receipt.key}`)).json();
    expect(activity.items.some((event) => event.changes.type?.before === "feedback" && event.changes.type?.after === "task")).toBe(true);
    await panel.getByRole("button", { name: "Cerrar detalle" }).click();
    await desktop.getByRole("button", { name: "Todo el equipo" }).click();
    await expect(desktop.getByRole("button", { name: "Cargar más" })).toBeVisible();
    await desktop.getByRole("button", { name: "Cargar más" }).click();
    await expect(desktop.getByRole("button", { name: title, exact: true })).toBeVisible();
  } finally { await recipient.close(); }
});
