import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  projects: [
    { name: "chromium", testIgnore: "**/webkit.spec.mjs", use: { browserName: "chromium" } },
    { name: "webkit", testMatch: ["**/webkit.spec.mjs", "**/feedback-integration.spec.mjs"], use: { browserName: "webkit" } },
  ],
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: [{
    command: "npm run ui",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 90_000,
  }, { command: "npm run app", url: "http://127.0.0.1:5174", reuseExistingServer: false, timeout: 90_000 },
  { command: "node scripts/serve-browser-fixture.mjs", url: "http://127.0.0.1:8787/health", reuseExistingServer: false, timeout: 90_000 }],
});
