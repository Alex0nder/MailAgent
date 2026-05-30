#!/usr/bin/env node
/** Smoke-тест Worker API (читает .dev.vars / .env) */
import "./load-env.mjs";

const base = (process.env.MAILAGENT_API_URL ?? "http://127.0.0.1:8787").replace(
  /\/$/,
  ""
);
const apiKey =
  process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;
if (!process.env.MAILAGENT_API_KEY && process.env.API_KEY) {
  process.env.MAILAGENT_API_KEY = process.env.API_KEY;
}

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

async function req(path, init = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...init.headers,
  };
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, json };
}

async function main() {
  console.log("MailAgent verify →", base);

  const health = await req("/health");
  if (!health.res.ok) {
    fail(`/health ${health.res.status} — Worker не запущен? npm run dev`);
  }
  console.log("OK /health", health.json);

  if (!apiKey) {
    fail("Нужен MAILAGENT_API_KEY или API_KEY в env");
  }

  const created = await req("/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({ ttlMinutes: 15 }),
  });
  if (!created.res.ok) {
    fail(`POST /v1/inboxes ${created.res.status}: ${JSON.stringify(created.json)}`);
  }
  console.log("OK create inbox", created.json);

  const id = created.json.id;
  const got = await req(`/v1/inboxes/${id}`);
  if (!got.res.ok) fail(`GET inbox ${got.res.status}`);
  console.log("OK get inbox", got.json);

  const del = await req(`/v1/inboxes/${id}`, { method: "DELETE" });
  if (!del.res.ok) fail(`DELETE inbox ${del.res.status}`);
  console.log("OK delete inbox");

  console.log("\nAll API checks passed.");
}

main().catch((e) => {
  fail(e.message);
});
