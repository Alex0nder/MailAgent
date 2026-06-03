#!/usr/bin/env node
/** Smoke QA REST flow: inbox lifecycle (no real email required) */
import "./load-env.mjs";

const base = (
  process.env.MAILAGENT_API_URL ?? "https://api.webmailagent.com"
).replace(/\/$/, "");
const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;

if (!apiKey) {
  console.error("Set MAILAGENT_API_KEY");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

async function req(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
  }
  return { res, json };
}

async function main() {
  console.log("Smoke QA →", base);
  const label = `smoke-qa-${Date.now()}`;

  const me = await req("GET", "/v1/me");
  console.log("GET /v1/me", me.res.status, me.json?.scope ? "scope=ok" : "");
  if (!me.res.ok) process.exit(1);

  const created = await req("POST", "/v1/inboxes", {
    label,
    ttlMinutes: 15,
    service: "github",
  });
  console.log("POST /v1/inboxes", created.res.status, created.json?.id ?? created.json?.error);
  if (!created.res.ok || !created.json?.id) process.exit(1);

  const inboxId = created.json.id;

  const messages = await req("GET", `/v1/inboxes/${inboxId}/messages`);
  console.log(
    "GET …/messages",
    messages.res.status,
    `count=${messages.json?.messages?.length ?? 0}`
  );
  if (!messages.res.ok) process.exit(1);

  const callbacks = await req("GET", `/v1/inboxes/${inboxId}/callbacks`);
  console.log(
    "GET …/callbacks",
    callbacks.res.status,
    `deliveries=${callbacks.json?.deliveries?.length ?? 0}`
  );
  if (!callbacks.res.ok) process.exit(1);

  const wait = await req(
    "GET",
    `/v1/inboxes/${inboxId}/wait?timeout=5&subjectContains=__smoke_none__`
  );
  console.log("GET …/wait (expect 408)", wait.res.status);
  if (wait.res.status !== 408) process.exit(1);

  const del = await req("DELETE", `/v1/inboxes/${inboxId}`);
  console.log("DELETE inbox", del.res.status);
  if (!del.res.ok) process.exit(1);

  console.log("OK — QA REST lifecycle");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
