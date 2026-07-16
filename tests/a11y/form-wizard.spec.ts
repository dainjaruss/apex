import { test } from "@playwright/test";
import {
  authRoutesAvailable,
  ensureA11ySession,
  preparePage,
  scanAccessibility,
  type ThemeMode,
} from "./helpers";

const THEMES: ThemeMode[] = ["light", "dark"];

const FORM_PICKERS: { badge: string; navpers: string }[] = [
  { badge: "EVAL", navpers: "1616/26" },
  { badge: "CHIEFEVAL", navpers: "1616/27" },
  { badge: "FITREP", navpers: "1610/2" },
];

test.describe("eval form wizard (EVAL / CHIEFEVAL / FITREP)", () => {
  test.skip(
    !authRoutesAvailable(),
    "Set tests/fixtures/e2e-ids.json (npm run db:seed) or use A11Y_SKIP_AUTH=1",
  );

  test.beforeEach(async ({ page }) => {
    await preparePage(page, "light");
    await ensureA11ySession(page);
  });

  for (const theme of THEMES) {
    for (const form of FORM_PICKERS) {
      test(`a11y · ${form.badge} new report · ${theme}`, async ({ page }) => {
        await preparePage(page, theme);
        await page.goto("/evaluations/new", { waitUntil: "domcontentloaded" });
        await page
          .getByText("Initializing form template...")
          .waitFor({ state: "detached", timeout: 30_000 })
          .catch(() => null);

        await page
          .locator(".apex-form-picker-card")
          .filter({ hasText: form.navpers })
          .click();

        await page
          .getByRole("heading", { name: new RegExp(`Draft New ${form.badge}`, "i") })
          .waitFor({ state: "visible", timeout: 30_000 });

        await scanAccessibility(
          page,
          "/evaluations/new",
          `${form.badge} form (${theme})`,
          { skipNavigation: true },
        );
      });
    }
  }
});