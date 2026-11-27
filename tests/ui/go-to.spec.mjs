import { test, expect } from "@playwright/test";

const app = "http://127.0.0.1:5174";
async function enter(page) {
  await page.goto(app);
  await page.getByRole("radio", { name: "Sam", exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible();
}

test("Ctrl/⌘K searches tickets on the server and opens the chosen one with the keyboard", async ({ page }, testInfo) => {
  await enter(page);
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Ir a un track o ticket" });
  const input = dialog.getByRole("combobox", { name: "Buscar track o ticket" });
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("group", { name: "Tracks" }).getByRole("option")).toHaveCount(2);
  await expect(dialog).toContainText("Escribe para buscar tareas y feedback");

  await input.fill("fixture 18");
  const tickets = dialog.getByRole("group", { name: "Tareas y feedback" }).getByRole("option");
  await expect(tickets).toHaveCount(1);
  await expect(tickets.first()).toContainText("DEMO-018");
  await expect(dialog.getByRole("group", { name: "Tracks" })).toHaveCount(0);
  await expect(tickets.first()).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute("aria-activedescendant", await tickets.first().getAttribute("id"));
  await page.screenshot({ path: testInfo.outputPath("go-to.png") });
  // Digits typed in the palette search, they do not open tracks.
  await input.press("2");
  await expect(page).toHaveURL(`${app}/`);
  await input.press("Backspace");
  await input.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(`${app}/t/DEMO-018`);
  await expect(page.getByRole("region", { name: "Fixture 18", exact: true })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await input.fill("zzz-sin-coincidencias");
  await expect(dialog).toContainText("Sin coincidencias para «zzz-sin-coincidencias».");
});

test("the sidebar trigger opens tracks with arrows and Escape returns focus", async ({ page }) => {
  await enter(page);
  const trigger = page.getByRole("button", { name: /Buscar o ir a…/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Ir a un track o ticket" });
  const input = dialog.getByRole("combobox");
  const options = dialog.getByRole("option");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowUp");
  await input.press("ArrowUp");
  await expect(options.last()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await input.fill("WE");
  await expect(dialog.getByRole("group", { name: "Tracks" }).getByRole("option")).toHaveCount(1);
  await expect(dialog.getByRole("group", { name: "Tracks" }).getByRole("option")).toContainText("Web");
  await input.press("Enter");
  await expect(page).toHaveURL(`${app}/track/web`);
  await expect(page.getByRole("heading", { name: "Web", level: 1 })).toBeVisible();
});

test("on a phone the search button opens the same palette", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(app);
  await page.getByRole("radio", { name: "Sam", exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const button = page.getByRole("button", { name: "Buscar o ir a", exact: true });
  await expect(button).toBeVisible();
  expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await button.click();
  const dialog = page.getByRole("dialog", { name: "Ir a un track o ticket" });
  await dialog.getByRole("combobox").fill("general");
  await dialog.getByRole("option", { name: /General/ }).click();
  await expect(page).toHaveURL(`${app}/track/general`);
});
