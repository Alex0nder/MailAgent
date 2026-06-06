/**
 * Example: signup with OTP via Cypress tasks (@mailagent/qa/cypress).
 * Copy to cypress/e2e/ and set CYPRESS_BASE_URL + MAILAGENT_API_*.
 */
describe("signup with MailAgent", () => {
  const runId = Cypress.env("GITHUB_RUN_ID") ?? String(Date.now());

  after(() => {
    cy.task("mailagentCleanupRun", runId);
  });

  it("fills OTP from disposable inbox", () => {
    cy.task<string>("mailagentRunLabel", "cy").then((label) => {
      cy.task("mailagentCreateInbox", {
        label: `ci-${runId}-${label}`,
        service: "auth0",
        ttlMinutes: 20,
      }).then((inbox: { id: string; address: string }) => {
        cy.get('[name=email]').type(inbox.address);
        cy.get('button[type=submit]').click();

        cy.task("mailagentWaitVerification", {
          inboxId: inbox.id,
          timeoutSeconds: 120,
          subjectContains: "verify",
        }).then((v: { otp: string | null }) => {
          if (v.otp) {
            cy.get('[name=code]').type(v.otp);
            cy.contains("button", /confirm|verify/i).click();
          }
        });

        cy.task("mailagentDeleteInbox", inbox.id);
      });
    });
  });
});
