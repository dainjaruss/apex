// tests/a11y/ladrChecklist.spec.ts
//
// The generic /board-confidence scan only ever sees the Record Entry tab, so
// the LaDR checklist — the one screen in this subsystem built out of disclosure
// widgets, and the place keyboard/screen-reader access is most likely to break
// — was never actually reached by axe. This drives the app to the tab with a
// rating and a target paygrade selected, expands every disclosure so the panels
// are in the accessibility tree, and scans that.
//
// Read-only: consent is dismissed ("Not now") rather than accepted, the record
// is never saved, and the transcribed milestones are served by intercepting the
// PostgREST read rather than seeding them — the environment this runs against
// holds only auto-extracted LaDR rows (no detail.notes), and a scan is not
// worth a write to shared reference data.
import { test, expect, type Page } from "@playwright/test";
import {
  authRoutesAvailable,
  ensureA11ySession,
  preparePage,
  scanAccessibility,
  type ThemeMode,
} from "./helpers";
import { itE1E9 } from "../../scripts/ladr-data/it_e1_e9";

const THEMES: ThemeMode[] = ["light", "dark"];

// IT is the transcribed dataset (scripts/ladr-data/it_e1_e9.ts); E-7 is the
// step whose Fully/Best Qualified split the checklist has to make legible.
const RATING = "IT";
const TARGET = "7";

const TRANSCRIBED_ROWS = itE1E9.milestones.map((m, i) => ({
  id: `a11y-${i}`,
  ladr_document_id: "a11y-doc",
  category: m.category,
  item: m.item,
  item_code: m.item_code,
  applies_to_paygrades: m.applies_to_paygrades,
  detail: m.detail ?? {},
  sort_order: i,
}));

async function openLadrTab(page: Page) {
  await page.route("**/rest/v1/ladr_milestones*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(TRANSCRIBED_ROWS),
    }),
  );
  await page.goto("/board-confidence", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Not now" })
    .click({ timeout: 10_000 })
    .catch(() => null);
  await page
    .getByLabel("Rating (selects which LaDR checklist loads)")
    .selectOption(RATING);
  await page.getByLabel("Target paygrade").selectOption(TARGET);
  await page.getByRole("button", { name: "LaDR Checklist" }).click();
  await page
    .getByText(`the gate for E-${TARGET}`)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });

  // Prove the transcribed rows actually reached the component before anything
  // below scans it. The block header above renders for any milestone, so on
  // its own it would let a broken stub — or a component that stopped rendering
  // `detail` — pass vacuously against an empty checklist. These three strings
  // exist only if a tiered, transcribed row rendered: the two tier headings,
  // and one verbatim criterion (attached, not visible — it lives inside a
  // collapsed disclosure until expandAll runs).
  await expect(page.getByText("Fully qualified", { exact: true })).toBeVisible();
  await expect(page.getByText("Best qualified", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/in addition to the Fully qualified list above/),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Complete Enlisted Warfare Qualifications, when available, and/or MTS/ATS if serving as instructor, Afloat Trainer or Accessor at IWTG, or IWTC (e.g., ESWS, EAWS, EIWS, etc…)",
      { exact: true },
    ),
  ).toBeAttached();
}

/**
 * Open every disclosure so axe sees the panels, not just the triggers — and
 * fail if there were none to open.
 */
async function expandAll(page: Page) {
  const opened = await page.evaluate(() => {
    const all = Array.from(
      document.querySelectorAll<HTMLDetailsElement>("details"),
    );
    all.forEach((d) => (d.open = true));
    return all.length;
  });
  // IT at E-7 carries 7 advancement rows with notes plus the step's sea/shore
  // panel; a single-digit count means the detail rendering regressed.
  expect(opened, "no disclosure panels rendered — nothing to scan").toBeGreaterThan(5);
}

test.describe("LaDR checklist", () => {
  test.skip(
    !authRoutesAvailable(),
    "Set tests/fixtures/e2e-ids.json (npm run db:seed) or use A11Y_SKIP_AUTH=1",
  );

  test.beforeEach(async ({ page }) => {
    await preparePage(page, "light");
    await ensureA11ySession(page);
  });

  for (const theme of THEMES) {
    test(`a11y · LaDR checklist, disclosures expanded · ${theme}`, async ({
      page,
    }) => {
      await preparePage(page, theme);
      await openLadrTab(page);
      await expandAll(page);
      await scanAccessibility(
        page,
        "/board-confidence",
        `LaDR checklist (${theme})`,
        { skipNavigation: true },
      );
    });
  }

  test("disclosure is keyboard operable and its state is exposed", async ({
    page,
  }) => {
    await openLadrTab(page);
    const summary = page
      .locator("details > summary", { hasText: "What the LaDR says" })
      .first();
    const details = summary.locator("xpath=..");
    await expect(details).not.toHaveAttribute("open", /.*/);
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", /.*/);
    await page.keyboard.press("Enter");
    await expect(details).not.toHaveAttribute("open", /.*/);
  });

  test("long criterion prose does not scroll the page sideways on a phone", async ({
    page,
  }) => {
    // Sailor-on-a-ship viewport. The disclosure panels hold whole verbatim
    // criteria and (for HM) multi-paragraph sea/shore notes.
    await page.setViewportSize({ width: 390, height: 844 });
    await openLadrTab(page);
    await expandAll(page);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow, "page overflows horizontally at 390px").toBeLessThanOrEqual(
      1,
    );
  });
});
