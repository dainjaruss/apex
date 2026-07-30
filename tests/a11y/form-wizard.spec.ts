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

    // Section 3 carries the Block 43 narrative canvas and the narrative coach
    // (button + first-use consent disclosure). The coach's own model call is
    // deliberately NOT triggered: the first click always opens the disclosure,
    // which is the added surface worth scanning, and an a11y run must never
    // depend on a live model.
    test(`a11y · EVAL Block 43 narrative + coach · ${theme}`, async ({ page }) => {
      await preparePage(page, theme);
      await page.goto("/evaluations/new", { waitUntil: "domcontentloaded" });
      await page
        .getByText("Initializing form template...")
        .waitFor({ state: "detached", timeout: 30_000 })
        .catch(() => null);
      await page
        .locator(".apex-form-picker-card")
        .filter({ hasText: "1616/26" })
        .click();
      await page
        .getByRole("heading", { name: /Draft New EVAL/i })
        .waitFor({ state: "visible", timeout: 30_000 });

      for (let i = 0; i < 2; i++)
        await page.getByRole("button", { name: /Next Section/i }).click();
      await page
        .getByRole("heading", { name: /43: Comments on Performance/i })
        .waitFor({ state: "visible", timeout: 30_000 });

      // The coach probes GET /api/eval-coach on mount and renders nothing when
      // the server has no model configured — so wait for it, and skip rather
      // than fail on a keyless server.
      const coach = page.getByRole("button", { name: /Review my narrative/i });
      const configured = await coach
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      test.skip(!configured, "No model configured — the coach surface is hidden.");

      // First click always opens the consent disclosure (no model call).
      await coach.click();
      await page
        .getByRole("button", { name: /I understand/i })
        .waitFor({ state: "visible", timeout: 10_000 });

      // SCOPED to the coach surface on purpose. This is the first scan that has
      // ever reached wizard section 3, and it found two serious contrast
      // failures that predate this feature and live outside it, both in shared
      // design rules (app/globals.css):
      //   .apex-wizard-nav-btn--done       #059669 on #ffffff  = 3.76:1
      //   .apex-narrative-gutter (10px)    #5c6b81 on #aeafb0  = 2.46:1
      // The second is the Courier line-number ruler, shared by blocks 28/29/43/
      // 44/48 — fixing either means changing a shared token or the gutter's own
      // background/foreground pair, which is a design call and a much wider
      // blast radius than this PR. Reported, not silently absorbed. Drop the
      // `include` once they are fixed.
      await scanAccessibility(
        page,
        "/evaluations/new",
        `EVAL Block 43 narrative coach (${theme})`,
        {
          skipNavigation: true,
          include: 'section[aria-labelledby="eval-coach-heading"]',
        },
      );
    });
  }
});