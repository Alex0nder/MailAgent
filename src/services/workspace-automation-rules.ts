/** CRUD for persisted workspace automation rules (P4.21). */
import { nanoid } from "nanoid";
import type { Env } from "../env";
import { getDb } from "../db/client";
import type { WorkspaceRuleKind } from "./workspace-rule-engine";
import { WORKSPACE_RULE_KINDS } from "./workspace-rule-engine";
import type { WorkspaceReminderAuth } from "./workspace-reminders";
import { workspaceOwnerKey } from "./workspace-reminders";
import { getWorkspaceAutonomyPolicy } from "./workspace-autonomy";

export type WorkspaceAutomationRuleInput = {
  name?: string;
  kind?: string;
  enabled?: boolean;
  gmailAccountId?: string;
  calendarAccountId?: string;
  config?: Record<string, unknown>;
};

type RuleRow = {
  id: string;
  name: string;
  kind: WorkspaceRuleKind;
  enabled: boolean;
  gmail_account_id: string | null;
  calendar_account_id: string | null;
  config: unknown;
  created_at: string;
  updated_at: string;
};

function formatRule(row: RuleRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    enabled: row.enabled,
    gmailAccountId: row.gmail_account_id,
    calendarAccountId: row.calendar_account_id,
    config: row.config && typeof row.config === "object" ? row.config : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseKind(value?: string): WorkspaceRuleKind | null {
  const kind = value?.trim() as WorkspaceRuleKind | undefined;
  if (!kind || !WORKSPACE_RULE_KINDS.includes(kind)) return null;
  return kind;
}

export async function listWorkspaceAutomationRules(
  env: Env,
  auth: WorkspaceReminderAuth
) {
  const sql = getDb(env);
  const rows = (await sql`
    SELECT id, name, kind, enabled, gmail_account_id, calendar_account_id,
           config, created_at, updated_at
    FROM workspace_automation_rules
    WHERE owner_key = ${workspaceOwnerKey(auth)}
    ORDER BY created_at DESC
  `) as RuleRow[];
  return rows.map(formatRule);
}

export async function createWorkspaceAutomationRule(
  env: Env,
  auth: WorkspaceReminderAuth,
  input: WorkspaceAutomationRuleInput
): Promise<
  | { ok: true; rule: ReturnType<typeof formatRule> }
  | { ok: false; status: 400; error: string }
> {
  const name = input.name?.trim();
  if (!name) return { ok: false, status: 400, error: "name_required" };
  const kind = parseKind(input.kind);
  if (!kind) return { ok: false, status: 400, error: "invalid_rule_kind" };
  const gmailAccountId = input.gmailAccountId?.trim() || null;
  const calendarAccountId = input.calendarAccountId?.trim() || null;
  if (!gmailAccountId && !calendarAccountId) {
    return { ok: false, status: 400, error: "gmail_or_calendar_account_required" };
  }

  const id = `wrule_${nanoid(16)}`;
  const sql = getDb(env);
  const rows = (await sql`
    INSERT INTO workspace_automation_rules (
      id, owner_key, team_id, api_key_hint, name, kind, enabled,
      gmail_account_id, calendar_account_id, config
    ) VALUES (
      ${id}, ${workspaceOwnerKey(auth)}, ${auth.teamId}, ${auth.apiKeyHint},
      ${name}, ${kind}, ${input.enabled !== false}, ${gmailAccountId},
      ${calendarAccountId}, ${JSON.stringify(input.config ?? {})}::jsonb
    )
    RETURNING id, name, kind, enabled, gmail_account_id, calendar_account_id,
              config, created_at, updated_at
  `) as RuleRow[];
  return { ok: true, rule: formatRule(rows[0]!) };
}

export async function deleteWorkspaceAutomationRule(
  env: Env,
  auth: WorkspaceReminderAuth,
  ruleId: string
): Promise<boolean> {
  const sql = getDb(env);
  const rows = (await sql`
    DELETE FROM workspace_automation_rules
    WHERE id = ${ruleId} AND owner_key = ${workspaceOwnerKey(auth)}
    RETURNING id
  `) as { id: string }[];
  return Boolean(rows[0]);
}

export async function getWorkspaceRulesStatus(env: Env, auth: WorkspaceReminderAuth) {
  const policy = await getWorkspaceAutonomyPolicy(env, auth);
  const savedRules = await listWorkspaceAutomationRules(env, auth);
  return {
    automationEnabled: policy.automationEnabled,
    ruleKinds: WORKSPACE_RULE_KINDS,
    savedRules,
    count: savedRules.length,
  };
}
