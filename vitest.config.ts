import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react() as any],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // Dummy Supabase creds so modules that construct a browser client at import time
    // (lib/*Service.ts) don't throw during test collection. Real calls are mocked per-suite.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://mock-supabase.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-supabase-anon-key",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
