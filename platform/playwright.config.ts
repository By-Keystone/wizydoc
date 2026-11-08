import { defineConfig, devices } from "@playwright/test";
import { dirname } from "node:path";
import {
  API_BASE_URL,
  API_DIR,
  API_LOG_PATH,
  PLATFORM_BASE_URL,
  PLATFORM_DIR,
  PLATFORM_LOG_PATH,
  FAKE_BACKEND_API_KEY,
  FAKE_BACKEND_PORT,
  FAKE_BACKEND_URL,
  SERVERLESS_PLATFORM_BASE_URL,
  SERVERLESS_PLATFORM_DIST_DIR,
  SERVERLESS_PLATFORM_LOG_PATH,
  SERVERLESS_PLATFORM_PORT,
  apiEnv,
  platformEnv,
  assertE2eEnvironment,
} from "./e2e/support/env";

assertE2eEnvironment();

// Playwright ignora el stdout del servidor y sólo muestra su stderr: stdout va al archivo y stderr a los dos.
const withLogFile = (command: string, logPath: string) =>
  `mkdir -p "${dirname(logPath)}" && ( ${command} 2>&1 1>&3 | tee -a "${logPath}" >&2 ) 3>"${logPath}"`;

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
    {
      name: "serverless",
      testDir: "./e2e/serverless",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: SERVERLESS_PLATFORM_BASE_URL,
      },
    },
  ],
  webServer: [
    {
      name: "api",
      command: withLogFile(
        "node node_modules/tsx/dist/cli.mjs src/server.ts",
        API_LOG_PATH,
      ),
      cwd: API_DIR,
      url: `${API_BASE_URL}/health`,
      env: { ...apiEnv, DOTENV_CONFIG_PATH: ".env.e2e" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: "platform",
      command: withLogFile(
        "node node_modules/next/dist/bin/next dev --port 3100",
        PLATFORM_LOG_PATH,
      ),
      cwd: PLATFORM_DIR,
      url: PLATFORM_BASE_URL,
      env: { ...platformEnv, BACKEND: "api" },
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      name: "fake-backend",
      command: "node e2e/support/fake-backend.mjs",
      cwd: PLATFORM_DIR,
      url: `${FAKE_BACKEND_URL}/health`,
      env: {
        FAKE_BACKEND_API_KEY,
        FAKE_BACKEND_PORT: String(FAKE_BACKEND_PORT),
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      name: "platform-serverless",
      command: withLogFile(
        `node node_modules/next/dist/bin/next dev --port ${SERVERLESS_PLATFORM_PORT}`,
        SERVERLESS_PLATFORM_LOG_PATH,
      ),
      cwd: PLATFORM_DIR,
      url: SERVERLESS_PLATFORM_BASE_URL,
      env: {
        ...platformEnv,
        NEXT_DIST_DIR: SERVERLESS_PLATFORM_DIST_DIR,
        BACKEND: "serverless",
        BACKEND_API_URL: FAKE_BACKEND_URL,
        BACKEND_API_KEY: FAKE_BACKEND_API_KEY,
      },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
