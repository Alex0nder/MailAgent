/** Simulate OTP — no staging mail; runs in CI by default */
describe("signup (simulate)", () => {
  it("simulateAndVerify returns OTP", () => {
    cy.task("mailagentRunLabel", "cy-sim").then((label) => {
      cy.task("mailagentCreateInbox", {
        label: `ci-${label}`,
        ttlMinutes: 15,
      }).then((inbox: { id: string }) => {
        cy.task("mailagentSimulateAndVerify", {
          inboxId: inbox.id,
          options: {
            otp: "556677",
            subject: "Verify your account (simulated)",
            subjectContains: "simulated",
          },
        }).then((v: { otp: string | null; primaryLink: string | null }) => {
          expect(v.otp).to.eq("556677");
          expect(v.primaryLink).to.include("example.com");
        });
        cy.task("mailagentDeleteInbox", inbox.id);
      });
    });
  });
});
