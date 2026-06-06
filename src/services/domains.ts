/** Custom domains via Resend — team / api_key_hint scoped */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { createResendClient } from "./resend-mail";
import { PLAN_LIMITS, type PlanId } from "../lib/plans";

export type DomainRow = {
  id: string;
  team_id: string | null;
  api_key_hint: string | null;
  name: string;
  status: string;
  resend_domain_id: string;
  dns_records: unknown;
  region: string | null;
  created_at: string;
  verified_at: string | null;
};

export type DomainDnsRecord = {
  type: string;
  name: string;
  value: string;
  priority?: number | null;
  status?: string;
  ttl?: string;
};

export type DomainScope = {
  teamId: string | null;
  apiKeyHint: string;
  plan: PlanId;
};

function mapResendStatus(raw: string | undefined): string {
  if (raw === "verified") return "verified";
  if (raw === "failed" || raw === "temporary_failure") return "failed";
  return "pending";
}

function mapDnsRecords(records: unknown): DomainDnsRecord[] {
  if (!Array.isArray(records)) return [];
  return records.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      type: String(row.type ?? row.record ?? ""),
      name: String(row.name ?? ""),
      value: String(row.value ?? ""),
      priority: typeof row.priority === "number" ? row.priority : null,
      status: typeof row.status === "string" ? row.status : undefined,
      ttl: typeof row.ttl === "string" ? row.ttl : undefined,
    };
  });
}

function formatDomain(row: DomainRow) {
  const dns =
    typeof row.dns_records === "string"
      ? (JSON.parse(row.dns_records) as DomainDnsRecord[])
      : ((row.dns_records as DomainDnsRecord[]) ?? []);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    region: row.region,
    dnsRecords: dns,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
  };
}

function scopeWhere(scope: DomainScope) {
  if (scope.teamId) {
    return { teamId: scope.teamId, hint: null as string | null };
  }
  return { teamId: null, hint: scope.apiKeyHint };
}

export async function countDomainsForScope(
  env: Env,
  scope: DomainScope
): Promise<number> {
  const sql = getDb(env);
  const { teamId, hint } = scopeWhere(scope);
  if (teamId) {
    const rows = (await sql`
      SELECT COUNT(*)::int AS n FROM domains WHERE team_id = ${teamId}
    `) as { n: number }[];
    return rows[0]?.n ?? 0;
  }
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM domains
    WHERE team_id IS NULL AND api_key_hint = ${hint}
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function listDomains(
  env: Env,
  scope: DomainScope
): Promise<ReturnType<typeof formatDomain>[]> {
  const sql = getDb(env);
  const { teamId, hint } = scopeWhere(scope);
  const rows = teamId
    ? ((await sql`
        SELECT id, team_id, api_key_hint, name, status, resend_domain_id,
               dns_records, region, created_at, verified_at
        FROM domains
        WHERE team_id = ${teamId}
        ORDER BY created_at DESC
      `) as DomainRow[])
    : ((await sql`
        SELECT id, team_id, api_key_hint, name, status, resend_domain_id,
               dns_records, region, created_at, verified_at
        FROM domains
        WHERE team_id IS NULL AND api_key_hint = ${hint}
        ORDER BY created_at DESC
      `) as DomainRow[]);
  return rows.map(formatDomain);
}

export async function getDomain(
  env: Env,
  domainId: string,
  scope: DomainScope
): Promise<DomainRow | null> {
  const sql = getDb(env);
  const { teamId, hint } = scopeWhere(scope);
  const rows = teamId
    ? ((await sql`
        SELECT id, team_id, api_key_hint, name, status, resend_domain_id,
               dns_records, region, created_at, verified_at
        FROM domains
        WHERE id = ${domainId} AND team_id = ${teamId}
        LIMIT 1
      `) as DomainRow[])
    : ((await sql`
        SELECT id, team_id, api_key_hint, name, status, resend_domain_id,
               dns_records, region, created_at, verified_at
        FROM domains
        WHERE id = ${domainId}
          AND team_id IS NULL
          AND api_key_hint = ${hint}
        LIMIT 1
      `) as DomainRow[]);
  return rows[0] ?? null;
}

export async function getDomainByName(
  env: Env,
  name: string
): Promise<DomainRow | null> {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, team_id, api_key_hint, name, status, resend_domain_id,
           dns_records, region, created_at, verified_at
    FROM domains
    WHERE name = ${name}
    LIMIT 1
  `) as DomainRow[];
  return rows[0] ?? null;
}

export async function getDomainForInbox(
  env: Env,
  domainId: string,
  scope: Pick<DomainScope, "teamId" | "apiKeyHint">
): Promise<DomainRow | null> {
  return getDomain(env, domainId, {
    ...scope,
    plan: "free",
  });
}

export async function createDomain(
  env: Env,
  scope: DomainScope,
  name: string
): Promise<
  | { ok: true; domain: ReturnType<typeof formatDomain> }
  | { ok: false; error: string; hint?: string }
> {
  const normalized = normalizeDomainName(name);
  if (!normalized) {
    return { ok: false, error: "invalid_domain_name" };
  }

  const max = PLAN_LIMITS[scope.plan].maxCustomDomains;
  const count = await countDomainsForScope(env, scope);
  if (count >= max) {
    return {
      ok: false,
      error: "domain_limit_reached",
      hint: `Plan allows ${max} custom domain(s)`,
    };
  }

  const existing = await getDomainByName(env, normalized);
  if (existing) {
    return { ok: false, error: "domain_already_registered" };
  }

  const resend = createResendClient(env);
  const { data, error } = await resend.domains.create({ name: normalized });
  if (error || !data?.id) {
    return {
      ok: false,
      error: "resend_domain_create_failed",
      hint: error?.message,
    };
  }

  const sql = getDb(env);
  const id = nanoid(12);
  const { teamId, hint } = scopeWhere(scope);
  const status = mapResendStatus(data.status);
  const dnsRecords = mapDnsRecords(data.records);

  await sql`
    INSERT INTO domains (
      id, team_id, api_key_hint, name, status, resend_domain_id,
      dns_records, region, verified_at
    ) VALUES (
      ${id}, ${teamId}, ${teamId ? null : hint}, ${normalized}, ${status},
      ${data.id}, ${JSON.stringify(dnsRecords)}, ${data.region ?? null},
      ${status === "verified" ? new Date().toISOString() : null}
    )
  `;

  const row = await getDomain(env, id, scope);
  if (!row) return { ok: false, error: "domain_persist_failed" };
  return { ok: true, domain: formatDomain(row) };
}

export async function verifyDomain(
  env: Env,
  domainId: string,
  scope: DomainScope
): Promise<
  | { ok: true; domain: ReturnType<typeof formatDomain> }
  | { ok: false; error: string; hint?: string }
> {
  const row = await getDomain(env, domainId, scope);
  if (!row) return { ok: false, error: "domain_not_found" };

  const resend = createResendClient(env);
  const verifyResult = await resend.domains.verify(row.resend_domain_id);
  if (verifyResult.error) {
    return {
      ok: false,
      error: "resend_verify_failed",
      hint: verifyResult.error.message,
    };
  }

  const { data, error } = await resend.domains.get(row.resend_domain_id);
  if (error || !data) {
    return {
      ok: false,
      error: "resend_domain_get_failed",
      hint: error?.message,
    };
  }

  const status = mapResendStatus(data.status);
  const dnsRecords = mapDnsRecords(data.records);
  const verifiedAt =
    status === "verified"
      ? (row.verified_at ?? new Date().toISOString())
      : null;

  const sql = getDb(env);
  await sql`
    UPDATE domains
    SET status = ${status},
        dns_records = ${JSON.stringify(dnsRecords)},
        verified_at = ${verifiedAt}
    WHERE id = ${row.id}
  `;

  const updated = await getDomain(env, domainId, scope);
  if (!updated) return { ok: false, error: "domain_not_found" };
  return { ok: true, domain: formatDomain(updated) };
}

export async function deleteDomain(
  env: Env,
  domainId: string,
  scope: DomainScope
): Promise<boolean> {
  const row = await getDomain(env, domainId, scope);
  if (!row) return false;

  const resend = createResendClient(env);
  await resend.domains.remove(row.resend_domain_id);

  const sql = getDb(env);
  await sql`DELETE FROM domains WHERE id = ${row.id}`;
  return true;
}

export function normalizeDomainName(raw: string): string | null {
  const name = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!name || name.length > 253) return null;
  if (
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
      name
    )
  ) {
    return null;
  }
  return name;
}

export function sanitizeInboxLocalPart(
  raw: string | undefined,
  fallback: string
): string {
  const base = (raw?.trim() || fallback).toLowerCase();
  const cleaned = base.replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-");
  const trimmed = cleaned.slice(0, 64).replace(/^[-.]+|[-.]+$/g, "");
  return trimmed || fallback;
}

export { formatDomain };
