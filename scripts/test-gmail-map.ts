/** Unit test: Gmail API message → WorkspaceMailMessage mapping (no network). */
import assert from "node:assert/strict";
import { mapGmailMessage } from "../src/services/gmail-read.ts";

const encoded = Buffer.from("Hello from Gmail", "utf8")
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

const mapped = mapGmailMessage({
  id: "msg_1",
  internalDate: String(Date.parse("2026-06-18T10:00:00Z")),
  payload: {
    headers: [
      { name: "From", value: "Alice <alice@example.com>" },
      { name: "To", value: "bob@example.com" },
      { name: "Subject", value: "Contract review" },
    ],
    mimeType: "text/plain",
    body: { data: encoded },
  },
});

assert.equal(mapped.from, "Alice <alice@example.com>");
assert.equal(mapped.subject, "Contract review");
assert.equal(mapped.text, "Hello from Gmail");
assert.equal(mapped.receivedAt, new Date("2026-06-18T10:00:00Z").toISOString());

console.log("test-gmail-map OK");
