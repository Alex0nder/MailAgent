/**
 * Simulate Worker fireInboxCallback after simulate-inbound (for contract without SMTP).
 */
import { nanoid } from "nanoid";

const DEFAULT_CALLBACK = "https://httpbin.org/post";

export function buildCallbackPayload(row, inbox) {
  const links = parseLinks(row.links_json);
  const primary =
    links.find((u) => typeof u === "string" && /^https?:\/\//i.test(u)) ?? null;
  return {
    event: "message.received",
    id: row.id,
    inboxId: row.inbox_id,
    from: row.from_addr,
    subject: row.subject,
    otp: row.otp,
    links,
    primaryLink: primary,
    receivedAt: row.received_at ?? new Date().toISOString(),
    address: inbox.address,
    label: inbox.label ?? null,
    verification: {
      otp: row.otp,
      links,
      primaryLink: primary,
      from: row.from_addr,
      subject: row.subject,
      messageId: row.id,
    },
  };
}

function parseLinks(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

/** POST to inbox callback_url + record in callback_deliveries */
export async function fireSimulatedCallback(sql, inboxId, messageId) {
  const inboxes = await sql`
    SELECT id, address, label, callback_url FROM inboxes WHERE id = ${inboxId} LIMIT 1
  `;
  if (!inboxes.length) throw new Error(`inbox not found: ${inboxId}`);
  const inbox = inboxes[0];
  const url = inbox.callback_url || DEFAULT_CALLBACK;
  if (!inbox.callback_url) {
    console.warn("fire-callback: inbox has no callback_url, using", DEFAULT_CALLBACK);
  }

  const messages = await sql`
    SELECT id, inbox_id, from_addr, subject, otp, links_json, received_at
    FROM messages WHERE id = ${messageId} AND inbox_id = ${inboxId} LIMIT 1
  `;
  if (!messages.length) throw new Error(`message not found: ${messageId}`);
  const row = messages[0];
  const payload = buildCallbackPayload(row, inbox);

  const started = Date.now();
  let statusCode = null;
  let ok = false;
  let errorText = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    statusCode = res.status;
    ok = res.ok;
    if (!ok) errorText = `HTTP ${res.status}`;
  } catch (e) {
    errorText = e instanceof Error ? e.message : String(e);
  }
  const durationMs = Date.now() - started;

  await sql`
    INSERT INTO callback_deliveries (
      id, inbox_id, message_id, callback_url,
      status_code, ok, error_text, duration_ms
    )
    VALUES (
      ${nanoid(12)}, ${inboxId}, ${messageId}, ${url},
      ${statusCode}, ${ok}, ${errorText}, ${durationMs}
    )
  `;

  return { ok, statusCode, callbackUrl: url, durationMs, errorText };
}
