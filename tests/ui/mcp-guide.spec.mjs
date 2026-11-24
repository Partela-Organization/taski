import { test, expect } from "@playwright/test";

const app = "http://127.0.0.1:5174";

test("the header opens an accessible MCP guide with copyable installation-specific examples", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (value) => { window.copiedMcpConfiguration = value; } } });
  });
  await page.goto(app);
  const launcher = page.getByRole("button", { name: "Conectar MCP", exact: true });
  await expect(launcher).toHaveCount(0);
  await page.getByRole("radio", { name: "Alex", exact: true }).check();
  await page.getByLabel("Código del equipo").fill("browser-fixture-only");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(launcher).toBeEnabled();
  const navigation = await page.getByRole("navigation", { name: "Vistas" }).boundingBox();
  const button = await launcher.boundingBox();
  expect(button.y).toBeGreaterThanOrEqual(navigation.y + navigation.height);
  expect(button.height).toBeGreaterThanOrEqual(44);

  await page.screenshot({ path: testInfo.outputPath("mcp-header-mobile.png") });
  await launcher.click();
  const guide = page.getByRole("dialog", { name: "Conectar MCP" });
  await expect(guide).toBeVisible();
  await expect(guide.getByText("http://127.0.0.1:8787/mcp", { exact: true })).toBeVisible();
  await expect(guide.getByText("alex", { exact: true })).toBeVisible();
  const configuration = guide.getByLabel("Configuración MCP");
  await expect(configuration).toContainText('bearer_token_env_var = "TASKI_CODE"');
  await expect(configuration).toContainText('"X-Taski-Member" = "alex"');
  await expect(configuration).not.toContainText("browser-fixture-only");
  await guide.getByRole("button", { name: "Copiar configuración" }).click();
  await expect(guide.getByRole("status")).toHaveText("Configuración copiada.");
  expect(await page.evaluate(() => window.copiedMcpConfiguration)).toBe(await configuration.textContent());

  await guide.getByRole("button", { name: "Claude Code", exact: true }).click();
  expect(JSON.parse(await configuration.textContent()).mcpServers.taski).toEqual({
    type: "http", url: "http://127.0.0.1:8787/mcp", headers: {
      Authorization: "Bearer ${TASKI_CODE}", "X-Taski-Member": "alex", "X-Taski-Client": "claude-code",
    },
  });
  await expect(guide.getByText("get_project", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mcp-guide-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();
  await expect(launcher).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Todo el equipo", exact: true }).click();
  const row = page.getByRole("button", { name: "Fixture 24", exact: true });
  await row.click();
  const ticket = page.getByRole("region", { name: "Fixture 24", exact: true });
  await expect(ticket).toBeVisible();
  await launcher.click();
  await expect(guide).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();
  await expect(ticket).toBeVisible();
  await expect(launcher).toBeFocused();
});
