/** Unit tests: workspace rule engine (no network). */
import assert from "node:assert/strict";
import {
  classifyWorkspaceRule,
  evaluateThreadsAgainstRules,
  WORKSPACE_RULE_KINDS,
} from "../src/services/workspace-rule-engine.ts";

const invoice = classifyWorkspaceRule({
  subject: "Invoice #4421 from Stripe",
  snippet: "Payment due for your subscription",
  disposition: "automated",
});
assert.ok(invoice);
assert.equal(invoice?.kind, "invoice");
assert.equal(invoice?.confidence, "high");

const support = classifyWorkspaceRule({
  subject: "Support ticket #991",
  snippet: "Customer reported a bug in checkout",
  disposition: "needs_reply",
});
assert.ok(support);
assert.equal(support?.kind, "support");

const meeting = classifyWorkspaceRule({
  subject: "Quick sync tomorrow?",
  snippet: "Can we schedule a Google Meet call?",
});
assert.ok(meeting);
assert.equal(meeting?.kind, "meeting");

const followUp = classifyWorkspaceRule({
  subject: "Re: Contract",
  snippet: "Just checking in on the pending review",
  disposition: "needs_reply",
});
assert.ok(followUp);
assert.equal(followUp?.kind, "follow_up");

const hits = evaluateThreadsAgainstRules({
  threads: [
    {
      threadId: "t1",
      subject: "Invoice receipt",
      snippet: "Your billing payment",
      disposition: "automated",
      from: "billing@stripe.com",
    },
    {
      threadId: "t2",
      subject: "Team standup",
      snippet: "Let's sync on Zoom",
      disposition: "fyi",
      from: "lead@company.com",
    },
  ],
  enabledKinds: ["invoice", "meeting"],
});
assert.equal(hits.length, 2);
assert.deepEqual(
  hits.map((hit) => hit.match.kind).sort(),
  ["invoice", "meeting"]
);
assert.equal(hits[0]?.snippet, "Your billing payment");

const filtered = evaluateThreadsAgainstRules({
  threads: [
    {
      threadId: "t3",
      subject: "Invoice",
      snippet: "Payment due",
      disposition: "automated",
    },
  ],
  enabledKinds: ["support"],
});
assert.equal(filtered.length, 0);

assert.equal(WORKSPACE_RULE_KINDS.length, 4);

console.log("test-workspace-rules OK");
