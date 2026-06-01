import { defineConfig } from "cypress";
import { createMailAgentCypressTasks } from "@mailagent/qa/cypress";

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? "http://localhost:3000",
    setupNodeEvents(on) {
      on("task", createMailAgentCypressTasks());
    },
    env: {
      MAILAGENT_API_URL: process.env.MAILAGENT_API_URL,
      MAILAGENT_API_KEY: process.env.MAILAGENT_API_KEY,
    },
  },
});
