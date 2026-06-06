#!/usr/bin/env node
/** Contract: OIDC discovery + authorize redirect when enabled; skip when disabled */
import "./load-env.mjs";
import { createHash, randomBytes } from "node:crypto";
import {
  contractApi,
  contractBase,
  contractHeaders,
} from "./lib/contract-api.mjs";

const base = contractBase();
const headers = contractHeaders();
if (!headers) {
  console.error("contract-qa-oidc: set MAILAGENT_API_KEY");
  process.exit(1);
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function main() {
  console.log("contract-qa-oidc →", base);

  const hub = await contractApi(base, headers, "/v1/agent");
  if (!hub.ok) {
    console.error("GET /v1/agent failed", hub.status);
    process.exit(1);
  }

  const oidc = hub.json?.auth?.oidc;
  if (oidc !== "enabled") {
    console.log("contract-qa-oidc SKIP (OIDC disabled — enable via docs/YOUR-TURN.md §3)");
    return;
  }

  const metaRes = await fetch(`${base}/.well-known/oauth-authorization-server`);
  const meta = await metaRes.json().catch(() => null);
  if (!metaRes.ok || !meta?.authorization_endpoint) {
    console.error("oauth-authorization-server missing authorization_endpoint", meta);
    process.exit(1);
  }
  if (!meta.grant_types_supported?.includes("authorization_code")) {
    console.error("authorization_code grant missing", meta.grant_types_supported);
    process.exit(1);
  }

  const { challenge } = pkce();
  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: "http://127.0.0.1:3333/callback",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const authRes = await fetch(`${base}/v1/oauth/authorize?${params}`, {
    redirect: "manual",
  });
  if (authRes.status !== 302) {
    const body = await authRes.text();
    console.error("authorize expected 302 to IdP", authRes.status, body.slice(0, 200));
    process.exit(1);
  }
  const location = authRes.headers.get("location") ?? "";
  if (!location.startsWith("http")) {
    console.error("authorize missing Location header");
    process.exit(1);
  }

  console.log("contract-qa-oidc OK", {
    authorization_endpoint: meta.authorization_endpoint,
    idpRedirect: location.split("?")[0],
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
