#!/usr/bin/env node
/**
 * Contract: simulate message + attachment → list + JSON meta (без Resend).
 */
import "./load-env.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const base = (process.env.MAILAGENT_API_URL ?? "https://api.webmailagent.com").replace(/\/$/, "");
const apiKey = process.env.MAILAGENT_API_KEY ?? process.env.API_KEY;
const dbUrl = process.env.DATABASE_URL;
const ATTACH_NAME = "contract-invoice.pdf";

if (!apiKey || !dbUrl) {
  console.error("contract-qa-attachments: need MAILAGENT_API_KEY + DATABASE_URL");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function api(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  console.log("contract-qa-attachments →", base);

  const created = await api("/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({
      label: `contract-att-${Date.now()}`,
      ttlMinutes: 15,
    }),
  });
  if (!created.ok) {
    console.error("create failed", created.status, created.json);
    process.exit(1);
  }

  const inboxId = created.json.id;
  const simScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "simulate-inbound.mjs");
  const sim = spawnSync(
    process.execPath,
    [
      simScript,
      inboxId,
      "445566",
      "billing@example.com",
      `--subject=Invoice ${ATTACH_NAME}`,
      `--with-attachment=${ATTACH_NAME}`,
    ],
    { env: process.env, stdio: "inherit" }
  );
  if (sim.status !== 0) process.exit(sim.status ?? 1);

  const wait = await api(
    `/v1/inboxes/${inboxId}/wait?timeout=30&subjectContains=Invoice`
  );
  if (!wait.ok) {
    console.error("wait failed", wait.status, wait.json);
    process.exit(1);
  }

  const messageId = wait.json.message?.id;
  if (!messageId) {
    console.error("no message id in wait response", wait.json);
    process.exit(1);
  }

  const list = await api(`/v1/inboxes/${inboxId}/messages/${messageId}/attachments`);
  if (!list.ok || !list.json.attachments?.length) {
    console.error("list attachments failed", list.status, list.json);
    process.exit(1);
  }

  const att = list.json.attachments[0];
  if (att.filename !== ATTACH_NAME) {
    console.error("filename mismatch", att);
    process.exit(1);
  }

  const meta = await api(
    `/v1/inboxes/${inboxId}/messages/${messageId}/attachments/${att.id}`
  );
  if (!meta.ok || meta.json.filename !== ATTACH_NAME) {
    console.error("attachment meta failed", meta.status, meta.json);
    process.exit(1);
  }

  const messages = await api(`/v1/inboxes/${inboxId}/messages`);
  const msg = messages.json.messages?.find((m) => m.id === messageId);
  if ((msg?.attachmentCount ?? 0) < 1) {
    console.error("message missing attachmentCount", msg);
    process.exit(1);
  }

  await api(`/v1/inboxes/${inboxId}`, { method: "DELETE" }).catch(() => {});

  console.log("contract-qa-attachments OK", {
    inboxId,
    messageId,
    attachmentId: att.id,
    filename: att.filename,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
