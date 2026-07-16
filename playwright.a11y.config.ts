import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, ".env.local") });
dotenv.config({ path: resolve(__dirname, ".env") });

const port = process.env.A11Y_PORT || process.env.E2E_PORT || "3099";
const baseURL =
  process.env.A11Y_BASE_URL || `http://127.0.0.1:${port}`;
const skipServer = process.env.A11Y_NO_SERVER === "1";

export default defineConfig({
  testDir: "./tests/a11y",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "reports/a11y/html", open: "never" }],
    ["json", { outputFile: "reports/a11y/results.json" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: skipServer
    ? undefined
    : {
        command: `npm run dev -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});