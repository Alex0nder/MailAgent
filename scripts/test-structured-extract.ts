/** Unit tests for structured extract presets (rules) */
import type { MessageRow } from "../src/services/inbox";
import { extractStructuredFromMessage } from "../src/services/structured-extract";
import type { Env } from "../src/env";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const row: MessageRow = {
  id: "m1",
  inbox_id: "i1",
  provider_id: "p1",
  from_addr: "billing@acme.com",
  subject: "Invoice #INV-8842 — $129.99 USD due March 15, 2026",
  text_preview: "Please pay invoice INV-8842",
  html_preview: null,
  otp: null,
  links_json: [],
  received_at: new Date().toISOString(),
  raw_r2_key: null,
};

const env = {} as Env;

async function main() {
  const inv = await extractStructuredFromMessage(env, row, { preset: "invoice" });
  assert(!("error" in inv), "invoice extract should succeed");
  if ("error" in inv) throw new Error(String(inv.error));
  assert(
    String(inv.data.invoiceNumber).includes("8842"),
    "invoice number parsed"
  );
  assert(inv.data.amount === "129.99", "amount parsed");

  const tfa = await extractStructuredFromMessage(
    env,
    { ...row, otp: "554433", links_json: ["https://verify.example.com/x"] },
    { preset: "2fa" }
  );
  assert(!("error" in tfa), "2fa extract");
  if ("error" in tfa) throw new Error(String(tfa.error));
  assert(tfa.data.otp === "554433", "2fa otp");

  const ml = await extractStructuredFromMessage(
    env,
    {
      ...row,
      subject: "Verify your email",
      links_json: ["https://app.example.com/verify?token=abc"],
    },
    { preset: "magic_link" }
  );
  assert(!("error" in ml), "magic_link extract");
  if ("error" in ml) throw new Error(String(ml.error));
  assert(
    String(ml.data.primaryLink).includes("verify"),
    "magic_link primaryLink"
  );

  const inviteRes = await extractStructuredFromMessage(
    env,
    {
      ...row,
      subject: "Alex invited you to Acme Workspace",
      links_json: ["https://join.example.com/invite/x"],
    },
    { preset: "invite" }
  );
  assert(!("error" in inviteRes), "invite extract");
  if ("error" in inviteRes) throw new Error(String(inviteRes.error));
  assert(inviteRes.data.inviteUrl, "invite url");

  console.log("test-structured-extract OK");
}

main();
