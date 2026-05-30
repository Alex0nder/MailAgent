/** Team admin: ключи команды (invite = выдать новый ключ) */
import { Hono } from "hono";
import type { Env } from "../env";
import type { ApiVariables } from "../lib/api-context";
import { requireApiKey } from "../lib/auth";
import { rateLimit } from "../lib/rate-limit";
import { generateApiKeyToken } from "../lib/generate-api-key";
import { PLAN_LIMITS } from "../lib/plans";
import {
  addTeamKey,
  countTeamKeys,
  getTeam,
  listTeamKeys,
  revokeTeamKey,
} from "../services/api-key-store";
import { countActiveInboxesForTeam } from "../services/inbox";

export const teamRoutes = new Hono<{ Bindings: Env; Variables: ApiVariables }>();

teamRoutes.use("*", requireApiKey);
teamRoutes.use("*", rateLimit);

function requireTeam(c: { get: (k: "teamId") => string | null }) {
  const teamId = c.get("teamId");
  if (!teamId) return null;
  return teamId;
}

teamRoutes.get("/", async (c) => {
  const teamId = requireTeam(c);
  if (!teamId) {
    return c.json(
      {
        error: "team_required",
        hint: "Use a DB-registered key: npm run issue:key:db",
      },
      403
    );
  }

  const team = await getTeam(c.env, teamId);
  if (!team) return c.json({ error: "team_not_found" }, 404);

  const keys = await listTeamKeys(c.env, teamId);
  const plan = c.get("apiPlan");
  const limits = PLAN_LIMITS[plan];
  const activeInboxes = await countActiveInboxesForTeam(c.env, teamId);

  return c.json({
    id: team.id,
    name: team.name,
    plan: team.plan,
    createdAt: team.created_at,
    limits: {
      maxTeamKeys: limits.maxTeamKeys,
      maxActiveInboxes: limits.maxActiveInboxes,
    },
    usage: {
      keys: keys.length,
      activeInboxes,
    },
    keys: keys.map((k) => ({
      id: k.id,
      hint: k.key_hint,
      label: k.label,
      createdAt: k.created_at,
      current: k.id === c.get("apiKeyId"),
    })),
  });
});

teamRoutes.post("/keys", async (c) => {
  const teamId = requireTeam(c);
  if (!teamId) {
    return c.json({ error: "team_required" }, 403);
  }

  const plan = c.get("apiPlan");
  const maxKeys = PLAN_LIMITS[plan].maxTeamKeys;
  if (maxKeys < 1) {
    return c.json({ error: "team_keys_not_supported_on_legacy" }, 400);
  }

  const count = await countTeamKeys(c.env, teamId);
  if (count >= maxKeys) {
    return c.json({ error: "team_key_limit_reached", max: maxKeys }, 429);
  }

  let body: { label?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const token = generateApiKeyToken();
  const { apiKeyId, hint } = await addTeamKey(c.env, teamId, {
    token,
    label: body.label?.trim().slice(0, 64),
  });

  return c.json(
    {
      id: apiKeyId,
      key: token,
      hint,
      label: body.label ?? null,
      note: "Save the key now — it is shown only once.",
    },
    201
  );
});

teamRoutes.delete("/keys/:id", async (c) => {
  const teamId = requireTeam(c);
  if (!teamId) return c.json({ error: "team_required" }, 403);

  const keyId = c.req.param("id");
  const ok = await revokeTeamKey(c.env, teamId, keyId);
  if (!ok) {
    return c.json(
      { error: "cannot_revoke", hint: "Last key or wrong id" },
      400
    );
  }
  return c.json({ revoked: true, id: keyId });
});
