#!/usr/bin/env node
/** Contract: dedicated Resend discovery (no real Resend keys required) */
import "./load-env.mjs";
import {
  contractApi,
  contractBase,
  contractHeaders,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-dedicated-resend: set MAILAGENT_API_KEY");
  process.exit(1);
}

async function main() {
  console.log("contract-qa-dedicated-resend →", base);

  const me = await contractApi(base, headers, "/v1/me");
  if (!me.ok) {
    console.error("GET /v1/me failed", me.status, me.json);
    process.exit(1);
  }

  const team = await contractApi(base, headers, "/v1/team/dedicated-resend");
  if (team.status === 403 && team.json?.error === "team_required") {
    console.log("skip: legacy key without team (expected)");
    process.exit(0);
  }
  if (!team.ok) {
    console.error("GET /v1/team/dedicated-resend failed", team.status, team.json);
    process.exit(1);
  }

  if (!team.json.webhookUrl?.includes("/webhooks/resend/team/")) {
    console.error("missing webhookUrl", team.json);
    process.exit(1);
  }

  const put = await contractApi(base, headers, "/v1/team/dedicated-resend", {
    method: "PUT",
    body: JSON.stringify({
      resendApiKey: "re_contract_skip",
      webhookSecret: "whsec_contract_skip",
    }),
  });

  if (me.json.plan === "enterprise") {
    if (!put.ok && put.json?.error === "invalid_resend_api_key") {
      console.log("enterprise PUT validates key shape OK");
    } else if (put.ok) {
      console.log("enterprise PUT accepted (unexpected test keys — clear manually)");
    } else {
      console.error("enterprise PUT unexpected", put.status, put.json);
      process.exit(1);
    }
  } else if (put.status !== 403 || put.json?.error !== "enterprise_plan_required") {
    console.error("non-enterprise PUT should 403", put.status, put.json);
    process.exit(1);
  } else {
    console.log("non-enterprise PUT blocked OK");
  }

  console.log("contract-qa-dedicated-resend OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
