/** Unit tests for message search text builder */
import { buildSearchText } from "../src/services/message-search";
import type { MessageRow } from "../src/services/inbox";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const row: MessageRow = {
  id: "m1",
  inbox_id: "i1",
  provider_id: "p1",
  from_addr: "billing@vendor.com",
  subject: "Invoice #8842",
  text_preview: "Please pay by Friday",
  html_preview: null,
  otp: "123456",
  links_json: ["https://pay.example.com/inv/8842"],
  received_at: new Date().toISOString(),
  raw_r2_key: null,
};

const text = buildSearchText(row);
assert(text.includes("Invoice"), "subject in search text");
assert(text.includes("billing@vendor.com"), "from in search text");
assert(text.includes("123456"), "otp in search text");
assert(text.includes("pay.example.com"), "links in search text");

console.log("test-message-search OK");
