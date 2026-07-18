import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { BUILD_PLACEHOLDER_ANON_KEY } from "./lib/supabaseClient";

// Test files for features reserved for Weeks 6+ (PDF, review/routing workflow,
// signatures, RBAC, summary groups / forced distribution). Excluded from the
// default `npm test` run so the Week 5 milestone suite stays scoped to ~70 tests.
// Run the full suite with `npm run test:all` (sets TEST_SCOPE=all).
const RESERVED_AFTER_WEEK5 = [
  "**/tests/unit/permissions.test.ts", // RBAC (later)
  "**/tests/unit/roleGuard.test.tsx", // RBAC (later)
  "**/tests/unit/signaturePad.test.tsx", // Digital signatures
  "**/tests/unit/reviewer.test.ts", // Reviewer workflow (Week 7)
  "**/tests/integration/workflow.test.tsx", // Reviewer workflow (Week 7)
  "**/tests/unit/forcedDistribution.test.ts", // Block 46 (post-MVP)
  "**/tests/unit/summaryGroupEligibility.test.ts", // Summary groups (post-MVP)
  "**/tests/unit/paygrade.test.ts", // Supports summary-group eligibility
  "**/tests/integration/coverage.test.tsx", // Broad coverage suite (touches reserved pages)
  "**/__tests__/e2e/**", // Full lifecycle (submit/approve/finalize) — Weeks 6–7
];

const runAll = process.env.TEST_SCOPE === "all";

export default defineConfig({
  plugins: [react() as any],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/tests/e2e/**",
      "**/tests/a11y/**", // Playwright specs (npm run a11y) — vitest must not collect them
      ...(runAll ? [] : RESERVED_AFTER_WEEK5),
    ],
    // Dummy Supabase creds so modules that construct a browser client at import time
    // (lib/*Service.ts) don't throw during test collection. Real calls are mocked per-suite.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://mock-supabase.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: BUILD_PLACEHOLDER_ANON_KEY,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
