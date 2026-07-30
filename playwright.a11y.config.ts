import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, ".env.local") });
dotenv.config({ path: resolve(__dirname, ".env") });

// ponytail: default port is derived from the checkout path, not fixed at 3099.
// This repo is worked in several git worktrees at once. With a fixed default port
// plus `reuseExistingServer`, a run in one worktree silently attaches to a dev
// server started by ANOTHER worktree and scans that app instead. Measured
// 2026-07-30: a Record Readiness run reported 26 passing while actually rendering
// a different worktree's pre-rebuild component. A green a11y gate that scanned the
// wrong application is worse than a red one.
// Upgrade path if collisions ever matter: allocate a free port at startup.
let hash = 7;
for (let i = 0; i < __dirname.length; i++) {
  hash = (hash * 31 + __dirname.charCodeAt(i)) | 0;
}
const portOffset = Math.abs(hash) % 400;
const port =
  process.env.A11Y_PORT || process.env.E2E_PORT || String(3100 + portOffset);
const baseURL = process.env.A11Y_BASE_URL || `http://127.0.0.1:${port}`;
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
        // Reuse only when you explicitly pointed the run at a server you manage.
        // Left on by default it also serves a STALE build of this same worktree —
        // `next dev` happily reuses a `.next` from before your edit, so the scan
        // passes against the old component. Both failure modes look like success.
        reuseExistingServer: Boolean(process.env.A11Y_BASE_URL),
        timeout: 120_000,
      },
});