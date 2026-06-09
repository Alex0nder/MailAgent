/** QA pilot starter — simulate-only, no browser app required */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  retries: 0,
  reporter: [["list"]],
  use: { trace: "off" },
});
