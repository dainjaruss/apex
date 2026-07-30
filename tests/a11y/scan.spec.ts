import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  authRoutesAvailable,
  ensureA11ySession,
  preparePage,
  scanAccessibility,
  type ThemeMode,
} from "./helpers";

const THEMES: ThemeMode[] = ["light", "dark"];

const PUBLIC_ROUTES: { path: string; name: string }[] = [
  { path: "/", name: "Landing" },
  { path: "/login", name: "Login" },
  { path: "/register", name: "Register" },
];

function authRouteList(): { path: string; name: string }[] {
  const routes: { path: string; name: string }[] = [
    { path: "/dashboard", name: "Dashboard" },
    { path: "/evaluations/new", name: "New evaluation" },
    { path: "/summary-groups", name: "Summary groups" },
    { path: "/board-confidence", name: "Record Readiness" },
    { path: "/brag-sheet", name: "Brag Sheet" },
  ];
  const fixturePath = resolve(process.cwd(), "tests/fixtures/e2e-ids.json");
  if (existsSync(fixturePath)) {
    const ids = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      evals?: { routing?: string };
    };
    if (ids.evals?.routing) {
      routes.push({
        path: `/evaluations/${ids.evals.routing}`,
        name: "View draft/report",
      });
    }
  }
  return routes;
}

for (const theme of THEMES) {
  for (const route of PUBLIC_ROUTES) {
    test(`a11y public · ${route.name} · ${theme}`, async ({ page }) => {
      await preparePage(page, theme);
      await scanAccessibility(
        page,
        route.path,
        `${route.name} (${theme})`,
      );
    });
  }
}

test.describe("authenticated routes", () => {
  test.skip(
    !authRoutesAvailable(),
    "Set tests/fixtures/e2e-ids.json (npm run db:seed) or use A11Y_SKIP_AUTH=1",
  );

  test.beforeEach(async ({ page }) => {
    await preparePage(page, "light");
    await ensureA11ySession(page);
  });

  for (const theme of THEMES) {
    for (const route of authRouteList()) {
      test(`a11y auth · ${route.name} · ${theme}`, async ({ page }) => {
        await preparePage(page, theme);
        await scanAccessibility(
          page,
          route.path,
          `${route.name} (${theme})`,
        );
      });
    }
  }

  // /board-confidence opens on Record Entry, so the scan above never reaches the
  // Results screen — where the coverage bar, the status pills, the plan buckets
  // and the narrative card live. Contrast on those is a shipped gate.
  //
  // This scan asserts the POPULATED screen is on the page before running axe.
  // Without that it passed vacuously: with no seeded board_analyses row the view
  // takes its `!selected` branch and renders "No review yet.", so none of those
  // elements were ever in the scanned DOM. `npm run db:seed` now seeds one
  // completed run for this account (scripts/seed-e2e.ts, seedReadinessRun).
  for (const theme of THEMES) {
    test(`a11y auth · Record Readiness results · ${theme}`, async ({ page }) => {
      await preparePage(page, theme);
      await page.goto("/board-confidence", { waitUntil: "domcontentloaded" });
      // First-use consent modal, when this account has not accepted yet.
      await page
        .getByRole("button", { name: "Not now" })
        .click({ timeout: 5_000 })
        .catch(() => null);
      await page.getByRole("button", { name: "Results" }).click();

      // Real selectors, not a sleep — and they FAIL the scan rather than
      // silently scanning an empty state.
      await expect(
        page.getByRole("heading", { name: /APEX can see \d+ of \d+ areas/ }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "Do this next" })).toBeVisible();
      await expect(page.locator("[data-status]").first()).toBeVisible();

      await scanAccessibility(
        page,
        "/board-confidence",
        `Record Readiness results (${theme})`,
        { skipNavigation: true },
      );
    });
  }
});