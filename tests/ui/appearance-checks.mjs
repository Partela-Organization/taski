import { test, expect } from "@playwright/test";

export function appearanceChecks() {
  test("ticket presentation preserves filters and detail and adapts to mobile", async ({ page }, testInfo) => {
    await page.goto("http://127.0.0.1:5174");
    await page.getByLabel("Código del equipo").fill("browser-fixture-only");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    const list = page.getByRole("button", { name: "Lista", exact: true });
    const cards = page.getByRole("button", { name: "Tarjetas", exact: true });
    const area = page.getByLabel("Área", { exact: true });
    const grouping = page.getByLabel("Agrupar por", { exact: true });
    const search = page.getByRole("searchbox");
    const ticket = page.getByRole("button", { name: "Fixture 18", exact: true });
    const row = page.locator(".ticket-row").filter({ has: ticket });
    const group = page.getByRole("list").filter({ has: ticket });
    const columns = () => group.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    await expect(list).toHaveAttribute("aria-pressed", "true");
    await area.selectOption("general");
    await expect(ticket).toBeVisible();
    await expect(grouping).toHaveValue("area");
    await expect(page.getByRole("region", { name: "General", exact: true }).getByRole("button", { name: "Fixture 18" })).toBeVisible();
    await expect(row.getByText("Pendiente", { exact: true })).toBeVisible();
    await cards.click();
    await expect(cards).toHaveAttribute("aria-pressed", "true");
    await expect(group).toHaveCSS("display", "grid");
    await expect.poll(columns).toBe(2);
    await expect(area).toHaveValue("general");
    await search.fill("Fixture 18");
    const edge = await row.locator(".ticket-row__indicators").boundingBox();
    await page.mouse.click(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await expect(page).toHaveURL(/\/t\/DEMO-018$/);
    await list.click();
    await grouping.selectOption("status");
    await expect(page.getByRole("region", { name: "Pendiente", exact: true }).getByRole("button", { name: "Fixture 18" })).toBeVisible();
    await expect(list).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "Fixture 18", exact: true })).toBeVisible();
    await expect(search).toHaveValue("Fixture 18");
    await page.setViewportSize({ width: 1280, height: 1000 });
    await cards.click();
    await expect.poll(columns).toBe(1);
    await page.reload();
    await expect(cards).toHaveAttribute("aria-pressed", "true");
    await expect(grouping).toHaveValue("status");
    await grouping.selectOption("area");
    await page.getByRole("button", { name: "Cerrar detalle", exact: true }).click();
    await expect.poll(columns).toBe(2);
    await page.getByLabel("Tema", { exact: true }).selectOption("light");
    await page.screenshot({ path: testInfo.outputPath("desktop-cards.png") });
    await page.getByRole("button", { name: "Todo el equipo", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(columns).toBe(1);
    await expect(cards).toBeInViewport();
    for (const label of ["Tema", "Área", "Agrupar por"]) {
      const box = await page.getByLabel(label, { exact: true }).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Tema", { exact: true }).selectOption("dark");
    await page.screenshot({ path: testInfo.outputPath("mobile-cards.png") });
  });

  test("connected application themes, keyboard focus and mobile detail remain usable", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto("http://127.0.0.1:5174/t/DEMO-018");
    await page.getByLabel("Código del equipo").fill("browser-fixture-only");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    const panel = page.getByRole("region", { name: "Fixture 18", exact: true });
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute("aria-modal");
    await expect(page.locator(".app-sidebar")).toHaveCSS("width", "196px");
    const desktopPanel = await panel.boundingBox();
    expect(desktopPanel.width).toBe(480);
    expect(desktopPanel.x + desktopPanel.width).toBe(1440);
    await page.getByLabel("Tema", { exact: true }).selectOption("light");
    const color = await page.locator("html").evaluate((e) => getComputedStyle(e).backgroundColor);
    await page.getByLabel("Tema", { exact: true }).selectOption("dark");
    await expect.poll(() => page.locator("html").evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(color);
    await page.reload();
    await expect(page.getByLabel("Tema", { exact: true })).toHaveValue("dark");
    await page.getByLabel("Tema", { exact: true }).selectOption("system");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveCSS("background-color", color);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => page.locator("html").evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(color);
    await page.keyboard.press("Escape");
    const opener = page.getByRole("button", { name: "Fixture 18", exact: true });
    await opener.focus(); await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Fixture 18", exact: true });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBe(0); expect(bounds.y).toBe(0); expect(bounds.width).toBe(390); expect(bounds.height).toBe(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (let n = 0; n < 16; n++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((e) => e.contains(document.activeElement))).toBe(true);
    }
    for (const label of ["Cerrar detalle", "Guardar cambios", "Resaltar tarea"]) {
      const box = await dialog.getByRole("button", { name: label, exact: true }).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await dialog.evaluate((e) => { e.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath("mobile-dark.png"), fullPage: false });
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });
}
