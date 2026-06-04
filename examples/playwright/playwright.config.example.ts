/**
 * Playwright config для MailAgent examples.
 * globalSetup создаёт inbox + attachment через simulate (нужен DATABASE_URL).
 */
import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: here,
  testMatch: "*.spec.example.ts",
  globalSetup: path.join(here, "../../scripts/playwright-global-setup.mjs"),
  use: {
    trace: "on-first-retry",
  },
});
