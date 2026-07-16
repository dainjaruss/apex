import { chromium } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

const email = process.argv[2] || "co.enterprise@franklyn.dev";
const password = process.argv[3] || "NavyEval!2026";
const base = process.argv[4] || "http://127.0.0.1:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() =>
    localStorage.setItem("apex_consent_accepted", "true"),
  );
  await page.goto(`${base}/login`);
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  console.log("final url:", page.url());
  const err = await page.locator(".apex-banner-error").first().textContent();
  if (err?.trim()) console.log("error:", err.trim());
  const cookies = await page.context().cookies();
  const sb = cookies.filter((c) => c.name.includes("sb-"));
  console.log("supabase cookies:", sb.length, sb.map((c) => c.name).join(", "));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});