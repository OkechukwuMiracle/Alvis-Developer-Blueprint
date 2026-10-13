import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.ALVIS_TEST_BASE_URL || "http://127.0.0.1:3000",
    // Auth and private evidence requests must not end up in recorded traces.
    trace: "off",
    channel: process.env.ALVIS_BROWSER_CHANNEL,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: (process.env.ALVIS_TEST_BASE_URL || "http://127.0.0.1:3000")+"/login",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
