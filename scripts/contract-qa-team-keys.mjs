#!/usr/bin/env node
/** Contract: team key invite + revoke (requires DB team admin key) */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-team-keys: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-team-keys →", base);

  const team = await contractApi(base, headers, "/v1/team");
  if (team.status === 403 && team.json?.error === "team_required") {
    console.log("skip: legacy key (no team)");
    return;
  }
  if (!team.ok) {
    console.error("GET /v1/team failed", team.status, team.json);
    process.exit(1);
  }

  const label = `contract-${Date.now()}`;
  const created = await contractApi(base, headers, "/v1/team/keys", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
  if (created.status === 403 && created.json?.error === "scope_admin_required") {
    console.log("skip: scoped admin required");
    return;
  }
  if (!created.ok || !created.json?.key || !created.json?.id) {
    console.error("POST /v1/team/keys failed", created.status, created.json);
    process.exit(1);
  }

  const keyId = created.json.id;
  console.log("team key created", created.json.hint);

  const probe = await contractApi(
    base,
    { Authorization: `Bearer ${created.json.key}`, Accept: "application/json" },
    "/v1/me"
  );
  if (!probe.ok || probe.json?.teamId !== team.json.id) {
    console.error("new key auth failed", probe.status, probe.json);
    process.exit(1);
  }
  console.log("new key works");

  const revoked = await contractApi(base, headers, `/v1/team/keys/${keyId}`, {
    method: "DELETE",
  });
  if (!revoked.ok) {
    console.error("DELETE /v1/team/keys failed", revoked.status, revoked.json);
    process.exit(1);
  }

  const after = await contractApi(base, headers, "/v1/team");
  if (after.json?.keys?.some((k) => k.id === keyId)) {
    console.error("key still listed after revoke");
    process.exit(1);
  }

  console.log("contract-qa-team-keys OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
