/** Cypress + MailAgent tasks — simulate without staging mail */
import { defineConfig } from "cypress";
import { createMailAgentCypressTasks } from "@mailagent/qa/cypress";
import { createMailAgentQa } from "@mailagent/qa";

const mail = createMailAgentQa();

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: false,
    setupNodeEvents(on) {
      // mailagentSimulateAndVerify ships in @mailagent/qa@0.1.14+; inline until publish
      on("task", {
        ...createMailAgentCypressTasks(),
        async mailagentSimulateAndVerify(args: {
          inboxId: string;
          options?: { otp?: string; subject?: string; subjectContains?: string };
        }) {
          return mail.simulateAndVerify(args.inboxId, args.options);
        },
      });
    },
    env: {
      MAILAGENT_API_URL: process.env.MAILAGENT_API_URL,
      MAILAGENT_API_KEY: process.env.MAILAGENT_API_KEY,
    },
  },
});
