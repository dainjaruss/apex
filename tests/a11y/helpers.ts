import { Page, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { loginAs } from "../e2e/helpers/auth";

export type ThemeMode = "light" | "dark";

const FIXTURES = resolve(process.cwd(), "tests/fixtures/e2e-ids.json");

export function authRoutesAvailable(): boolean {
  return existsSync(FIXTURES) && process.env.A11Y_SKIP_AUTH !== "1";
}

export async function preparePage(page: Page, theme: ThemeMode) {
  await page.addInitScript((t: ThemeMode) => {
    localStorage.setItem("apex_consent_accepted", "true");
    localStorage.setItem("theme", t);
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (t === "dark") root.classList.add("dark");
    root.style.colorScheme = t;
  }, theme);
}

export async function scanAccessibility(
  page: Page,
  path: string,
  label: string,
  options?: { skipNavigation?: boolean },
) {
  const url = path.startsWith("http") ? path : path;
  if (!options?.skipNavigation) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }

  const evalDetail =
    path.includes("/evaluations/") && !path.endsWith("/new");
  const summaryGroups = path.includes("/summary-groups");
  if (evalDetail) {
    await page
      .getByText("Loading evaluation details...")
      .waitFor({ state: "detached", timeout: 45_000 })
      .catch(() => null);
    await page
      .getByRole("heading", { name: /APEX|evaluation/i })
      .first()
      .waitFor({ state: "visible", timeout: 45_000 })
      .catch(() => null);
  } else if (summaryGroups) {
    await page
      .getByText("Loading summary groups...")
      .waitFor({ state: "detached", timeout: 45_000 })
      .catch(() => null);
    await page
      .getByRole("heading", { name: /Summary Groups|Create Summary Group|Access restricted/i })
      .first()
      .waitFor({ state: "visible", timeout: 45_000 })
      .catch(() => null);
  } else {
    await page.waitForTimeout(400);
  }

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();

  const violations = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

  if (violations.length > 0) {
    const summary = violations
      .map((v) => {
        const nodes = v.nodes
          .slice(0, 5)
          .map((n) => `    • ${n.target.join(" ")}`)
          .join("\n");
        const more =
          v.nodes.length > 5 ? `\n    … +${v.nodes.length - 5} more nodes` : "";
        return `  [${v.impact}] ${v.id}: ${v.help}\n${nodes}${more}`;
      })
      .join("\n\n");
    console.error(`\nA11y violations — ${label}\n${summary}\n`);
  }

  expect(
    violations,
    `${label}: ${violations.length} serious/critical axe violation(s)`,
  ).toEqual([]);
}

function a11yCredentials(): { email: string; password: string } {
  const fixturePath = resolve(process.cwd(), "tests/fixtures/e2e-ids.json");
  let password = process.env.A11Y_USER_PASSWORD || "NavyEval!2026";
  if (!process.env.A11Y_USER_PASSWORD && existsSync(fixturePath)) {
    const ids = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      password?: string;
    };
    if (ids.password) password = ids.password;
  }
  const email =
    process.env.A11Y_USER_EMAIL ||
    (existsSync(fixturePath)
      ? "reportingsenior@franklyn.dev"
      : "co.enterprise@franklyn.dev");
  return { email, password };
}

/** Sign in once; no-op if middleware already sent us to a protected route. */
export async function ensureA11ySession(page: Page) {
  const { email, password } = a11yCredentials();
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await loginAs(page, email, password);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  }
}