/** Unit tests: Gmail thread disposition classifier (no network). */
import assert from "node:assert/strict";
import { classifyGmailThread } from "../src/services/gmail-thread-classifier.ts";

const owner = "me@company.com";

const needsReply = classifyGmailThread(owner, [
  {
    id: "1",
    from: "client@example.com",
    subject: "Contract review",
    text: "Can you send the updated terms by tomorrow?",
    receivedAt: "2026-06-18T09:00:00Z",
  },
]);
assert.equal(needsReply.disposition, "needs_reply");
assert.equal(needsReply.confidence, "high");

const waiting = classifyGmailThread(owner, [
  {
    id: "1",
    from: "client@example.com",
    subject: "Re: Contract review",
    text: "Thanks, reviewing now.",
    receivedAt: "2026-06-18T09:00:00Z",
  },
  {
    id: "2",
    from: "Me <me@company.com>",
    subject: "Re: Contract review",
    text: "Sent the updated terms.",
    receivedAt: "2026-06-18T10:00:00Z",
  },
]);
assert.equal(waiting.disposition, "waiting_on_them");

const automated = classifyGmailThread(owner, [
  {
    id: "1",
    from: "noreply@stripe.com",
    subject: "Your receipt from Stripe",
    text: "Payment received.",
    receivedAt: "2026-06-18T08:00:00Z",
  },
]);
assert.equal(automated.disposition, "automated");

console.log("test-gmail-classifier OK");
