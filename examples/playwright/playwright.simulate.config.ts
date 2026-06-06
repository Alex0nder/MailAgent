/** Playwright CI gate — simulate-only, no DATABASE_URL or globalSetup */
import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: here,
  testMatch: "simulate-gate.spec.ts",
  retries: 0,
  use: {
    trace: "off",
  },
});
