import { test, expect } from "@playwright/test";

const app = "http://127.0.0.1:5174";
const title = "Una idea para simplificar el formulario";
async function enter(page, member) {
  await page.getByRole("radio", { name: member, exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("mobile feedback works without technical fields and conversion preserves identity, author and conversation", async ({ page, browser }, testInfo) => {
  const feedbackTitle = `${title} · ${testInfo.project.name}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(app);
  await enter(page, "Alex");
  await expect(page.getByRole("button", { name: "Feedback", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Área", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tarjetas", exact: true })).toHaveCount(0);
  const compose = page.getByRole("button", { name: "Nuevo feedback", exact: true });
  const titleField = page.getByLabel("¿Qué quieres compartir?");
  await expect(titleField).toHaveCount(0);
  await compose.click();
  await expect(titleField).toBeFocused();
  await page.getByLabel("¿Qué quieres compartir?").fill(feedbackTitle);
  await expect(page.getByLabel("Detalles (opcional)")).toBeHidden();
  await page.getByText("Añadir detalles", { exact: true }).click();
  await page.getByLabel("Detalles (opcional)").fill("Sería útil explicar qué datos hacen falta.");
  await page.getByRole("button", { name: "Cerrar editor" }).click();
  await expect(compose).toBeFocused();
  await compose.click();
  await expect(titleField).toHaveValue(feedbackTitle);
  await expect(page.getByLabel("Detalles (opcional)")).toHaveValue("Sería útil explicar qué datos hacen falta.");
  const creation = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/tickets"));
  await page.getByRole("button", { name: "Enviar feedback" }).click();
  const receipt = await (await creation).json();
  const dialog = page.getByRole("dialog", { name: feedbackTitle });
  await expect(dialog.getByText("Sería útil explicar qué datos hacen falta.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Copiar enlace" }).click();
  await expect(dialog.getByRole("button", { name: "Convertir en tarea" })).toBeHidden();
  await expect(dialog.getByRole("heading", { name: "Actividad" })).toBeHidden();
  const link = page.url();
  await expect(page).toHaveURL(`${app}/t/${receipt.key}`);
  const manualLink = dialog.getByLabel("Enlace del ticket");
  await expect(manualLink.or(dialog.getByText("Enlace copiado.", { exact: true }))).toBeVisible();
  if (await manualLink.isVisible()) await expect(manualLink).toHaveValue(link);
  const created = await (await page.request.get(`${app}/api/v1/tickets/${receipt.key}?view=full`)).json();
  await dialog.getByRole("button", { name: "Cerrar detalle" }).click();
  const entry = page.locator(".tickets li").filter({ hasText: feedbackTitle });
  await expect(entry.getByText("Alex", { exact: true })).toBeVisible();
  await expect(entry).toBeInViewport();
  await expect(compose).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("feedback-mobile.png") });
  const recipient = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const desktop = await recipient.newPage();
    await desktop.goto(link);
    await enter(desktop, "Taylor");
    await expect(desktop.getByRole("button", { name: "Feedback", exact: true })).toHaveAttribute("aria-pressed", "true");
    const panel = desktop.getByRole("region", { name: feedbackTitle, exact: true });
    await expect(panel.getByText("Compartido por Alex")).toBeVisible();
    await expect(panel.getByLabel("Comentario", { exact: true })).toBeVisible();
    await expect(panel.getByLabel("Área del feedback", { exact: true })).toBeHidden();
    await desktop.screenshot({ path: testInfo.outputPath("feedback-desktop.png") });
    await panel.getByText("Gestionar feedback", { exact: true }).click();
    await panel.getByLabel("Área del feedback", { exact: true }).selectOption("web");
    await panel.getByRole("button", { name: "Guardar área", exact: true }).click();
    await expect(panel.getByRole("status").filter({ hasText: "Cambios guardados" })).toBeVisible();
    const categorized = await (await recipient.request.get(`${app}/api/v1/tickets/${receipt.key}?view=full`)).json();
    expect(categorized.ticket).toMatchObject({ areaId: "web", type: "feedback" });
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
    await convert.click();
    await expect(panel.getByLabel("Responsable", { exact: true })).toBeVisible();
    await expect(desktop).toHaveURL(link);
    await panel.getByLabel("Responsable", { exact: true }).selectOption("sam");
    await expect(panel.getByLabel("Área de la tarea")).toHaveValue("web");
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
    await expect(desktop.getByRole("button", { name: feedbackTitle, exact: true })).toBeVisible();
  } finally { await recipient.close(); }
});

test("attaching an image survives a lost upload response and the uploader can remove it", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(app);
  await enter(page, "Alex");
  const name = `Feedback con captura · ${testInfo.project.name}`;
  await page.getByRole("button", { name: "Nuevo feedback", exact: true }).click();
  await page.getByLabel("¿Qué quieres compartir?").fill(name);
  await page.getByRole("button", { name: "Enviar feedback" }).click();
  const panel = page.getByRole("dialog", { name });
  await expect(panel.getByRole("button", { name: "Adjuntar imagen" })).toBeVisible();

  let uploadUrl;
  await page.route("**/api/v1/tickets/*/attachments/*", async (route) => {
    uploadUrl = route.request().url();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort();
  }, { times: 1 });
  await panel.getByLabel("Elegir imagen").setInputFiles({
    name: "captura.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAFUlEQVR4nGOw7OggCTGMahjVgB0BADgh9sFCdXSXAAAAAElFTkSuQmCC", "base64"),
  });
  await panel.getByRole("button", { name: "Subir imagen" }).click();
  await expect(panel.getByText("No se pudo confirmar la subida.", { exact: false })).toBeVisible();
  const retried = page.waitForResponse((response) => response.request().method() === "PUT");
  await panel.getByRole("button", { name: "Reintentar subida" }).click();
  expect((await retried).url()).toBe(uploadUrl);
  const preview = panel.getByRole("link", { name: "Abrir captura.png" });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.locator("img").evaluate((image) => image.naturalWidth)).toBe(16);
  await page.reload();
  await expect(preview).toHaveCount(1);
  await expect(preview).toHaveAttribute("target", "_blank");
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("feedback-image.png") });
  page.once("dialog", (dialog) => dialog.accept());
  await panel.getByRole("button", { name: "Quitar captura.png" }).click();
  await expect(preview).toHaveCount(0);
  expect((await page.request.get(uploadUrl)).status()).toBe(404);
});
