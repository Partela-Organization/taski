import { test, expect } from "@playwright/test";

export function appearanceChecks() {
  test("connected application themes, keyboard focus and mobile detail remain usable", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto("http://127.0.0.1:5174/t/DEMO-006");
    await page.getByLabel("Código del equipo").fill("browser-fixture-only");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    const panel = page.getByRole("region", { name: "Fixture 06", exact: true });
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute("aria-modal");
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
    const opener = page.getByRole("button", { name: "Fixture 06", exact: true });
    await opener.focus(); await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Fixture 06", exact: true });
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
