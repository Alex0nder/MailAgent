#!/usr/bin/env node
/** Локальный тест без Gmail: вставляет письмо в Neon (обходит allowlist ingest). Usage: node scripts/simulate-inbound.mjs <inboxId> [otp] [from] */
import "./load-env.mjs";
import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";

const inboxId = process.argv[2] ?? "Js0I-1J7-JGZ";
const otp = process.argv[3] ?? "482910";
const fromAddr = process.argv[4] ?? "test@example.com";

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, address FROM inboxes WHERE id = ${inboxId} AND expires_at > NOW() LIMIT 1
`;
if (!rows.length) {
  console.error("inbox not found or expired:", inboxId);
  process.exit(1);
}

const msgId = nanoid(16);
const providerId = `sim_${nanoid(12)}`;
const links = JSON.stringify(["https://example.com/verify?token=test"]);

try {
  await sql`
    INSERT INTO messages (
      id, inbox_id, provider_id, from_addr, subject,
      text_preview, html_preview, otp, links_json
    ) VALUES (
      ${msgId}, ${inboxId}, ${providerId},
      ${fromAddr}, 'MailAgent simulated OTP',
      ${`Your code is ${otp}`}, NULL, ${otp}, ${links}::jsonb
    )
  `;
} catch (e) {
  console.error("insert failed", e.message);
  process.exit(1);
}

console.log("OK simulated message");
console.log("inbox:", rows[0].address);
console.log("otp:", otp);
console.log("check: curl -H \"Authorization: Bearer $API_KEY\" http://127.0.0.1:8787/v1/inboxes/" + inboxId + "/extract");
