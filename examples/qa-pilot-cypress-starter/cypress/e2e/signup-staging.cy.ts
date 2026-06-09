/** Real signup — skipped until APP_SIGNUP_URL is set */
const signupUrl = Cypress.env("APP_SIGNUP_URL") as string | undefined;
const describeStaging = signupUrl ? describe : describe.skip;

describeStaging("signup (staging)", () => {
  const runId = Cypress.env("GITHUB_RUN_ID") ?? String(Date.now());

  after(() => {
    cy.task("mailagentCleanupRun", runId);
  });

  it("receives OTP from staging signup", () => {
    cy.visit(signupUrl!);
    cy.task("mailagentRunLabel", "cy").then((label) => {
      cy.task("mailagentCreateInbox", {
        label: `ci-${runId}-${label}`,
        service: "auth0",
        ttlMinutes: 30,
      }).then((inbox: { id: string; address: string }) => {
        cy.get('[name=email], [type=email]').first().type(inbox.address);
        cy.get('button[type=submit]').first().click();

        cy.task("mailagentWaitVerification", {
          inboxId: inbox.id,
          timeoutSeconds: Number(Cypress.env("MAIL_WAIT_SECONDS") ?? 120),
          subjectContains: Cypress.env("MAIL_SUBJECT_CONTAINS") ?? "verify",
        }).then((v: { otp: string | null }) => {
          if (v.otp) {
            cy.get('[name=code], [name=otp]').first().type(v.otp);
            cy.contains("button", /confirm|verify|continue/i).click();
          }
        });

        cy.task("mailagentDeleteInbox", inbox.id);
      });
    });
  });
});
