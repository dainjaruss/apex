import { test } from "@playwright/test";
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
});