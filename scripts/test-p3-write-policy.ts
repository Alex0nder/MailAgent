/** Unit tests: P3 write policy + Gmail draft encoding (no network). */
import assert from "node:assert/strict";
import { buildGmailDraftRaw } from "../src/services/gmail-draft-write.ts";
import {
  evaluateCalendarEventWritePolicy,
  evaluateGmailDraftWritePolicy,
} from "../src/services/workspace-external-write.ts";

const deniedGmail = evaluateGmailDraftWritePolicy({ gmailDraftWrites: false });
assert.equal(deniedGmail.allowed, false);
assert.equal(deniedGmail.code, "gmail_draft_writes_disabled");

const allowedGmail = evaluateGmailDraftWritePolicy({ gmailDraftWrites: true });
assert.equal(allowedGmail.allowed, true);

const deniedCal = evaluateCalendarEventWritePolicy({ calendarEventWrites: false });
assert.equal(deniedCal.allowed, false);

const raw = buildGmailDraftRaw({
  to: "alice@example.com",
  subject: "Re: Sync",
  body: "Thanks — proposing Tuesday 10:00.",
});
assert.ok(raw.length > 10);

console.log("test-p3-write-policy OK");
