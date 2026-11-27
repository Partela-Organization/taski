import { test, expect } from "@playwright/test";

const app = "http://127.0.0.1:5174";
async function enter(page, member = "Sam") {
  await page.goto(app);
  await page.getByRole("radio", { name: member, exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: member === "Taylor" ? "Feedback" : "Resumen", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Horizonte", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Horizonte", level: 1 })).toBeVisible();
}
const api = (page, path, method = "GET", data) => page.request.fetch(`${app}/api/v1/${path}`, { method, ...(data ? { data } : {}) });

test("a document is created from a template, written with block shortcuts and autosaved", async ({ page }, testInfo) => {
  await enter(page);
  const title = `Escanear facturas · ${testInfo.project.name}`;
  await page.getByLabel("Título del nuevo documento").fill(title);
  await page.getByLabel("Plantilla").selectOption("idea");
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page).toHaveURL(/\/horizonte\/[0-9a-f-]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1);
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Título del documento")).toHaveValue(title);

  const goal = page.getByRole("textbox", { name: "Bloque 2: Texto" });
  await goal.fill("Escanear la factura de un comercio y generar el pedido **solo**.");
  await goal.press("End");
  await goal.press("Enter");
  const created = page.getByRole("textbox", { name: "Bloque 3: Texto" });
  await expect(created).toBeFocused();
  await created.pressSequentially("- Foto de la factura");
  await expect(page.getByRole("textbox", { name: "Bloque 3: Lista" })).toHaveValue("Foto de la factura");
  await page.getByRole("textbox", { name: "Bloque 3: Lista" }).press("Enter");
  await page.getByRole("textbox", { name: "Bloque 4: Lista" }).press("Enter"); // empty list item turns back into text
  const slash = page.getByRole("textbox", { name: "Bloque 4: Texto" });
  await slash.pressSequentially("/");
  const menu = page.getByRole("listbox", { name: "Tipo de bloque" });
  await expect(menu).toBeVisible();
  await menu.getByRole("option", { name: /Tarea/ }).click();
  await page.getByRole("textbox", { name: "Bloque 4: Tarea" }).fill("Hablar con Mercantil");
  await page.getByRole("checkbox", { name: "Hecho: Hablar con Mercantil" }).check();
  await page.getByLabel("Estado", { exact: true }).selectOption("exploring");
  await page.getByLabel("Track", { exact: true }).selectOption("web");
  await expect(page.getByRole("status").filter({ hasText: "Guardado" })).toBeVisible({ timeout: 10_000 });

  const markdown = (await (await api(page, `horizon/${id}`)).json()).doc;
  expect(markdown).toMatchObject({ status: "exploring", areaId: "web", updatedBy: "sam" });
  expect(markdown.markdown).toContain("Escanear la factura de un comercio y generar el pedido **solo**.\n\n- Foto de la factura\n- [x] Hablar con Mercantil");

  await page.getByRole("button", { name: "Leer", exact: true }).click();
  await expect(page.locator(".hz-body--read strong")).toHaveText("solo");
  await page.screenshot({ path: testInfo.outputPath("horizon-doc.png"), fullPage: true });
  await page.reload();
  await expect(page.getByLabel("Título del documento")).toHaveValue(title);
  await page.getByRole("button", { name: "← Horizonte" }).click();
  await expect(page).toHaveURL(`${app}/horizonte`);
  const explorando = page.getByRole("region", { name: "Explorando" });
  await expect(explorando.getByRole("button", { name: title })).toBeVisible();
  await expect(explorando).toContainText("1/1 tareas");
  await page.screenshot({ path: testInfo.outputPath("horizon-list.png"), fullPage: true });
  await page.getByLabel("Track", { exact: true }).selectOption("general");
  await expect(explorando).toHaveCount(0);
});

test("Markdown imports keep tables and lists, open in read mode and are searchable", async ({ page }, testInfo) => {
  await enter(page);
  const title = `Auditoría de concurrencia · ${testInfo.project.name}`;
  const markdown = `# ${title}\n\nQué pasa con **muchas personas** a la vez.\n\n## Límites\n\n| Pieza | Valor |\n|---|---|\n| Conexiones | 20 |\n\n1. Un solo servidor.\n   - Cada deploy desconecta.\n2. Dev y prod comparten VPS.\n`;
  await page.getByRole("button", { name: "Importar Markdown" }).click();
  const dialog = page.getByRole("dialog", { name: "Importar Markdown" });
  await dialog.getByLabel("Markdown", { exact: true }).fill(markdown);
  await dialog.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByLabel("Título del documento")).toHaveValue(title);
  await expect(page.getByRole("button", { name: "Leer", exact: true })).toHaveAttribute("aria-pressed", "true");
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Pieza", "Valor"]);
  await expect(table.getByRole("cell")).toHaveText(["Conexiones", "20"]);
  await expect(page.locator(".hz-read--li").nth(1)).toHaveCSS("padding-left", "22px");
  // The nested bullet does not restart the numbered list.
  await expect(page.locator(".hz-read--li > span:first-child")).toHaveText(["1.", "•", "2."]);
  await page.screenshot({ path: testInfo.outputPath("horizon-import.png"), fullPage: true });

  await page.getByRole("button", { name: "← Horizonte" }).click();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Ir a un track o ticket" });
  await palette.getByRole("combobox").fill("auditoría de concurrencia");
  const option = palette.getByRole("group", { name: "Horizonte" }).getByRole("option").first();
  await expect(option).toContainText("Auditoría de concurrencia");
  await palette.getByRole("combobox").press("Enter");
  await expect(page.getByLabel("Título del documento")).toHaveValue(/Auditoría de concurrencia/);
});

test("a conflict keeps the text and can save it on top; deleting returns to the list", async ({ page }, testInfo) => {
  await enter(page, "Taylor");
  const title = `Sticky notes · ${testInfo.project.name}`;
  const created = await (await api(page, "horizon", "POST", { title, markdown: "Primera versión.", idempotencyKey: `conflict-${title}` })).json();
  await page.goto(`${app}/horizonte/${created.id}`);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  expect((await api(page, `horizon/${created.id}`, "PATCH", { expectedVersion: 1, idempotencyKey: `other-${title}`, status: "planned" })).ok()).toBe(true);
  await page.getByRole("textbox", { name: "Bloque 1: Texto" }).fill("Mi versión con más detalle.");
  await expect(page.getByRole("alert")).toContainText("guardó este documento mientras escribías");
  await expect(page.getByRole("textbox", { name: "Bloque 1: Texto" })).toHaveValue("Mi versión con más detalle.");
  await page.getByRole("button", { name: "Guardar mi versión encima" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Guardado" })).toBeVisible({ timeout: 10_000 });
  expect((await (await api(page, `horizon/${created.id}`)).json()).doc.markdown).toContain("Mi versión con más detalle.");

  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "¿Eliminar el documento?" });
  await expect(confirm.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await confirm.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page).toHaveURL(`${app}/horizonte`);
  await expect(page.getByRole("status").filter({ hasText: "Documento eliminado." })).toBeVisible();
  expect((await api(page, `horizon/${created.id}`)).status()).toBe(404);
});

test("on a phone Horizonte lists and opens documents without horizontal scroll", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(app);
  await page.getByRole("radio", { name: "Alex", exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Feedback", level: 1 })).toBeVisible();
  const title = `Idea móvil · ${testInfo.project.name}`;
  await api(page, "horizon", "POST", { markdown: `# ${title}\n\n- [ ] Probar en el teléfono\n\n| A | B |\n|---|---|\n| 1 | 2 |`, idempotencyKey: title });
  await page.goto(`${app}/horizonte`);
  await page.getByRole("button", { name: title }).click();
  await expect(page.getByLabel("Título del documento")).toHaveValue(title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath("horizon-mobile.png"), fullPage: true });
});
