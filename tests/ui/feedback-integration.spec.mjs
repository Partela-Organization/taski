import { test, expect } from "@playwright/test";

const app = "http://127.0.0.1:5174";
const title = "Una idea para simplificar el formulario";
async function enter(page, member) {
  await page.getByRole("radio", { name: member, exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

for (const type of ["task", "feedback"]) {
  test(`delete a ${type} from its detail after confirming`, async ({ page }, testInfo) => {
    const isFeedback = type === "feedback";
    const title = `Entrada para eliminar · ${type} · ${testInfo.project.name}`;
    if (isFeedback) await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(app);
    await enter(page, "Alex");
    if (!isFeedback) await page.getByRole("button", { name: "Todo el equipo", exact: true }).click();
    const heading = page.getByRole("heading", { name: isFeedback ? "Feedback" : "Trabajo del equipo", exact: true });
    await expect(heading).toBeVisible();
    const created = await page.request.post(`${app}/api/v1/tickets`, { data: { type, title, idempotencyKey: title } });
    expect(created.ok()).toBe(true);
    const { key } = await created.json();
    await page.goto(`${app}/t/${key}`);
    const row = page.locator(".tickets").getByRole("button", { name: title, exact: true });
    const subject = isFeedback ? "el feedback" : "la tarea";
    const trigger = page.getByRole("button", { name: `Eliminar ${subject}`, exact: true });
    const confirmation = page.getByRole("alertdialog", { name: `¿Eliminar ${subject}?` });
    await expect(trigger).toBeInViewport();
    await trigger.click();
    await expect(confirmation.getByText(title, { exact: true })).toBeVisible();
    await expect(confirmation.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirmation).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(`${app}/t/${key}`);

    await trigger.click();
    await confirmation.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page).toHaveURL(`${app}/`);
    await expect(page.getByRole("status").filter({ hasText: isFeedback ? "Feedback eliminado." : "Tarea eliminada." })).toBeVisible();
    await expect(row).toHaveCount(0);
    await expect(heading).toBeFocused();
    await page.goto(`${app}/t/${key}`);
    await expect(page.getByRole("alert")).toContainText("Este ticket ya no está disponible.");
  });
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

test("feedback creation uploads a selected image and a recorded voice note", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    class FakeRecorder {
      static isTypeSupported(type) { return type === "audio/webm"; }
      state = "inactive";
      ondataavailable = null;
      onstop = null;
      onerror = null;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    window.MediaRecorder = FakeRecorder;
  });
  await page.goto(app);
  await enter(page, "Alex");
  await page.getByRole("button", { name: "Nuevo feedback" }).click();
  await page.getByLabel("¿Qué quieres compartir?").fill("Feedback multimedia " + testInfo.project.name);
  await page.getByLabel("Elegir imagen para feedback").setInputFiles({
    name: "captura.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAFUlEQVR4nGOw7OggCTGMahjVgB0BADgh9sFCdXSXAAAAAElFTkSuQmCC", "base64"),
  });
  await page.getByRole("button", { name: "Grabar audio" }).click();
  await expect(page.getByRole("button", { name: "Enviar feedback" })).toBeDisabled();
  await page.getByRole("button", { name: "Detener grabación" }).click();
  await expect(page.locator(".feedback-media audio")).toBeVisible();
  let firstUpload;
  await page.route("**/api/v1/tickets/*/attachments/*", async (route) => {
    firstUpload = route.request().url();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort();
  }, { times: 1 });
  await page.getByRole("button", { name: "Enviar feedback" }).click();
  await expect(page.getByText("El feedback se guardó. Reintenta para completar los adjuntos.")).toBeVisible();
  const retry = page.waitForResponse((response) => response.url() === firstUpload && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Confirmar reintento" }).click();
  expect((await retry).status()).toBe(200);
  const panel = page.getByRole("dialog", { name: "Feedback multimedia " + testInfo.project.name });
  await expect(panel.getByRole("link", { name: "Abrir captura.png" })).toBeVisible();
  await expect(panel.locator("audio")).toBeVisible();
  await page.reload();
  await expect(panel.locator("audio")).toBeVisible();
});

test("feedback is checked as done, filtered and reopened with an audited person change", async ({ page }, testInfo) => {
  const title = `Feedback para cerrar · ${testInfo.project.name}`;
  await page.goto(app);
  await enter(page, "Taylor");
  await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
  const created = await page.request.post(`${app}/api/v1/tickets`, { data: { type: "feedback", title, idempotencyKey: title } });
  expect(created.ok()).toBe(true);
  const { key } = await created.json();
  const filters = page.getByRole("group", { name: "Mostrar feedback" });
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await filters.getByRole("button", { name: "Abiertos", exact: true }).click();
  await expect(filters.getByRole("button", { name: "Abiertos", exact: true })).toHaveAttribute("aria-pressed", "true");

  const check = page.getByRole("checkbox", { name: `Hecho · ${title}`, exact: true });
  await expect(check).not.toBeChecked();
  await check.click();
  await expect(page.getByRole("status").filter({ hasText: `«${title}» marcado como hecho.` })).toBeVisible();
  await expect(check).toHaveCount(0);

  await filters.getByRole("button", { name: "Hechos", exact: true }).click();
  await expect(check).toBeChecked();
  await expect(page.locator(".tickets li").filter({ hasText: title })).toContainText("Hecho");
  await page.screenshot({ path: testInfo.outputPath("feedback-done.png") });
  await page.reload();
  await expect(filters.getByRole("button", { name: "Hechos", exact: true })).toHaveAttribute("aria-pressed", "true");

  await check.click();
  await expect(page.getByRole("status").filter({ hasText: `«${title}» vuelve a estar abierto.` })).toBeVisible();
  await expect(check).toHaveCount(0);
  await filters.getByRole("button", { name: "Abiertos", exact: true }).click();
  await expect(check).not.toBeChecked();

  const activity = await (await page.request.get(`${app}/api/v1/activity?ticketKey=${key}`)).json();
  const transitions = activity.items.filter((event) => event.changes.status?.before).map((event) => event.changes.status);
  expect(transitions).toEqual([{ before: "todo", after: "done" }, { before: "done", after: "todo" }]);
  expect(activity.items.every((event) => !event.changes.status?.before || (event.actor.kind === "person" && event.actor.memberId === "taylor"))).toBe(true);
});
