import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Phase 23 — unit tests for the deterministic, non-AI logic (XP/level
 * math, quest lifecycle transitions, streak math). Integration/E2E
 * tests need a real Supabase project and are covered by this project's
 * pattern of live-verifying each phase against the actual deployed
 * stack instead (see CHANGELOG.md) — a from-scratch mocked integration
 * suite would test the mocks, not the real RLS/schema behavior that
 * actually matters here.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
