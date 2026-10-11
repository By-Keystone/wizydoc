import { defineConfig, devices } from "@playwright/test";
import {
  API_BASE_URL,
  API_DIR,
  PLATFORM_BASE_URL,
  PLATFORM_DIR,
  apiEnv,
  platformEnv,
  assertE2eEnvironment,
} from "./e2e/support/env";

assertE2eEnvironment();

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: true,
  forbidOnly: true,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "api",
      testDir: "./e2e/api",
      use: {
        baseURL: API_BASE_URL,
        extraHTTPHeaders: { Origin: PLATFORM_BASE_URL },
      },
    },
    {
      name: "chromium",
      testDir: "./e2e/ui",
      use: { ...devices["Desktop Chrome"], baseURL: PLATFORM_BASE_URL },
    },
  ],
  webServer: [
    {
      name: "api",
      command: "./node_modules/.bin/tsx src/server.ts",
      cwd: API_DIR,
      url: `${API_BASE_URL}/health`,
      env: { ...apiEnv, DOTENV_CONFIG_PATH: ".env.e2e" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: "platform",
      command: "./node_modules/.bin/next dev --port 3100",
      cwd: PLATFORM_DIR,
      url: PLATFORM_BASE_URL,
      env: platformEnv,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
