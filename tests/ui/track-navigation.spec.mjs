import { test, expect } from "@playwright/test";

const app = "http://127.0.0.1:5174";
async function enter(page, member = "Sam") {
  await page.goto(app);
  await page.getByRole("radio", { name: member, exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible();
}
const sidebar = (page) => page.getByRole("region", { name: "Tracks" }).filter({ has: page.locator(".sidebar-tracks__label") });

test("tracks open from the sidebar and digit shortcuts, keep their URL and switch with chips", async ({ page }) => {
  await enter(page);
  const list = sidebar(page);
  await expect(list.getByRole("button")).toHaveCount(2);
  await expect(list).toContainText("Teclas 1–2 abren cada track");
  const labels = await list.locator(".sidebar-tracks__label").allTextContents();
  const api = await (await page.request.get(`${app}/api/v1/summary`)).json();
  const ids = Object.fromEntries(api.tracks.map((track) => [track.label, track.id]));

  await page.keyboard.press("2");
  await expect(page).toHaveURL(`${app}/track/${ids[labels[1]]}`);
  await expect(page.getByRole("heading", { name: labels[1], level: 1 })).toBeVisible();
  await expect(list.getByRole("button", { name: new RegExp(`^${labels[1]}`) })).toHaveAttribute("aria-pressed", "true");
  const chips = page.getByRole("navigation", { name: "Cambiar de track" });
  await expect(chips.getByRole("button", { name: new RegExp(`^${labels[1]}`) })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: `Progreso de ${labels[1]}` }).getByRole("img", { name: /% terminado/ })).toBeVisible();

  await chips.getByRole("button", { name: new RegExp(`^${labels[0]}`) }).click();
  await expect(page).toHaveURL(`${app}/track/${ids[labels[0]]}`);
  await page.goBack();
  await expect(page).toHaveURL(`${app}/track/${ids[labels[1]]}`);
  await expect(page.getByRole("heading", { name: labels[1], level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: labels[1], level: 1 })).toBeVisible();

  // Digits typed in a field never navigate.
  await page.getByLabel("Nueva tarea", { exact: true }).fill("1");
  await page.getByLabel("Nueva tarea", { exact: true }).press("1");
  await expect(page).toHaveURL(`${app}/track/${ids[labels[1]]}`);
  await page.getByLabel("Nueva tarea", { exact: true }).fill("");

  await page.getByRole("button", { name: "← Resumen" }).click();
  await expect(page).toHaveURL(`${app}/`);
  await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible();
});

test("a task captured in a track is created there and closing its detail returns to the track", async ({ page }, testInfo) => {
  await enter(page, "Alex");
  await page.goto(`${app}/track/web`);
  await expect(page.getByRole("heading", { name: "Web", level: 1 })).toBeVisible();
  const before = (await (await page.request.get(`${app}/api/v1/summary`)).json()).tracks.find((track) => track.id === "web");
  const title = `Capturada en el track · ${testInfo.project.name}`;
  await page.getByLabel("Nueva tarea", { exact: true }).fill(title);
  await page.getByLabel("Nueva tarea", { exact: true }).press("Enter");
  const panel = page.getByRole("region", { name: title, exact: true });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/\/t\/DEMO-\d+$/);
  const key = new URL(page.url()).pathname.split("/").at(-1);
  const ticket = await (await page.request.get(`${app}/api/v1/tickets/${key}`)).json();
  expect(ticket.ticket).toMatchObject({ areaId: "web", type: "task", status: "todo" });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(`${app}/track/web`);
  await expect(page.getByRole("region", { name: "Pendiente" }).getByRole("button", { name: title, exact: true })).toBeVisible();
  const after = (await (await page.request.get(`${app}/api/v1/summary`)).json()).tracks.find((track) => track.id === "web");
  expect(after.total).toBeGreaterThan(before.total);
  await expect(page.locator(".track-overview__legend")).toContainText(/tareas? en total/);
  await page.screenshot({ path: testInfo.outputPath("track-view.png"), fullPage: true });
});

test("an unknown track explains it and returns to the summary", async ({ page }) => {
  await enter(page);
  await page.goto(`${app}/track/inexistente`);
  await expect(page.getByRole("alert")).toContainText("Este track no está en la configuración");
  await page.getByRole("button", { name: "Volver al resumen" }).click();
  await expect(page).toHaveURL(`${app}/`);
});
