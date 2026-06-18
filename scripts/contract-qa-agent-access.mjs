#!/usr/bin/env node
/** Contract: agent access broker creates short-lived scoped keys. */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-agent-access: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-agent-access →", base);

  const team = await contractApi(base, headers, "/v1/team");
  if (team.status === 403 && team.json?.error === "team_required") {
    console.log("skip: legacy key (no team)");
    return;
  }
  if (!team.ok) {
    console.error("GET /v1/team failed", team.status, team.json);
    process.exit(1);
  }

  const runId = `contract-access-${Date.now()}`;
  const issued = await contractApi(base, headers, "/v1/agent/access", {
    method: "POST",
    body: JSON.stringify({
      purpose: "contract-agent-access",
      runId,
      service: "auth0",
      ttlMinutes: 10,
    }),
  });
  if (issued.status === 403 && issued.json?.error === "scope_admin_required") {
    console.log("skip: scoped admin required");
    return;
  }
  if (!issued.ok || !issued.json?.key || !issued.json?.id || !issued.json?.scope?.labelPrefix) {
    console.error("POST /v1/agent/access failed", issued.status, issued.json);
    process.exit(1);
  }
  console.log("agent access issued", {
    hint: issued.json.hint,
    labelPrefix: issued.json.scope.labelPrefix,
    expiresAt: issued.json.expiresAt,
  });

  const scopedHeaders = {
    Authorization: `Bearer ${issued.json.key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const me = await contractApi(base, scopedHeaders, "/v1/me");
  if (!me.ok || me.json?.scope?.labelPrefix !== issued.json.scope.labelPrefix) {
    console.error("issued key auth failed", me.status, me.json);
    process.exit(1);
  }

  const denied = await contractApi(base, scopedHeaders, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({ service: "auth0", label: "wrong-prefix" }),
  });
  if (denied.status !== 403 || denied.json?.error !== "label_prefix_mismatch") {
    console.error("scoped label enforcement failed", denied.status, denied.json);
    process.exit(1);
  }

  const created = await contractApi(base, scopedHeaders, "/v1/inboxes", {
    method: "POST",
    body: JSON.stringify({
      service: "auth0",
      label: issued.json.policy.defaultLabel,
      ttlMinutes: 5,
    }),
  });
  if (!created.ok || !created.json?.id) {
    console.error("scoped inbox create failed", created.status, created.json);
    process.exit(1);
  }
  await contractApi(base, scopedHeaders, `/v1/inboxes/${created.json.id}`, {
    method: "DELETE",
  });

  const revoked = await contractApi(base, headers, `/v1/team/keys/${issued.json.id}`, {
    method: "DELETE",
  });
  if (!revoked.ok) {
    console.error("revoke issued key failed", revoked.status, revoked.json);
    process.exit(1);
  }

  console.log("contract-qa-agent-access OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
