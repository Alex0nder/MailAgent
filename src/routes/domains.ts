/** REST: custom domains (Resend DNS, team-scoped) */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { scopeWriteDenied } from "../lib/scope-guard";
import {
  createDomain,
  deleteDomain,
  getDomain,
  listDomains,
  normalizeDomainName,
  verifyDomain,
} from "../services/domains";
import { auditRoute } from "../services/audit-log";

export const domainRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

domainRoutes.use("*", requireApiKey);
domainRoutes.use("*", rateLimit);

function domainScope(c: {
  get: <K extends keyof ApiVariables>(k: K) => ApiVariables[K];
}): import("../services/domains").DomainScope {
  return {
    teamId: c.get("teamId"),
    apiKeyHint: c.get("apiKeyHint"),
    plan: c.get("apiPlan"),
  };
}

domainRoutes.get("/", async (c) => {
  const domains = await listDomains(c.env, domainScope(c));
  return c.json({ domains });
});

domainRoutes.post("/", async (c) => {
  const writeErr = scopeWriteDenied(c);
  if (writeErr) return writeErr;

  let body: { name?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const name = body.name?.trim();
  if (!name) return c.json({ error: "name_required" }, 400);
  if (!normalizeDomainName(name)) {
    return c.json({ error: "invalid_domain_name" }, 400);
  }

  const result = await createDomain(c.env, domainScope(c), name);
  if (!result.ok) {
    const status =
      result.error === "domain_limit_reached"
        ? 429
        : result.error === "domain_already_registered"
          ? 409
          : 502;
    return c.json(
      { error: result.error, ...(result.hint ? { hint: result.hint } : {}) },
      status
    );
  }

  auditRoute(c, {
      action: "domain.created",
      resourceType: "domain",
      resourceId: result.domain.id,
      meta: { name: result.domain.name },
    });

  return c.json(result.domain, 201);
});

domainRoutes.get("/:id", async (c) => {
  const row = await getDomain(c.env, c.req.param("id"), domainScope(c));
  if (!row) return c.json({ error: "domain_not_found" }, 404);

  const dns =
    typeof row.dns_records === "string"
      ? JSON.parse(row.dns_records)
      : row.dns_records;

  return c.json({
    id: row.id,
    name: row.name,
    status: row.status,
    region: row.region,
    dnsRecords: dns,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
  });
});

domainRoutes.post("/:id/verify", async (c) => {
  const writeErr = scopeWriteDenied(c);
  if (writeErr) return writeErr;

  const result = await verifyDomain(c.env, c.req.param("id"), domainScope(c));
  if (!result.ok) {
    const status = result.error === "domain_not_found" ? 404 : 502;
    return c.json(
      { error: result.error, ...(result.hint ? { hint: result.hint } : {}) },
      status
    );
  }
  return c.json(result.domain);
});

domainRoutes.delete("/:id", async (c) => {
  const writeErr = scopeWriteDenied(c);
  if (writeErr) return writeErr;

  const domainId = c.req.param("id");
  const ok = await deleteDomain(c.env, domainId, domainScope(c));
  if (!ok) return c.json({ error: "domain_not_found" }, 404);
  auditRoute(c, {
      action: "domain.deleted",
      resourceType: "domain",
      resourceId: domainId,
    });
  return c.json({ deleted: true, id: domainId });
});
