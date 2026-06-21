# Workspace Gmail — prod setup

Connect a real Gmail mailbox to Workspace Agent (read-only by default).

## 1. Google Cloud OAuth client

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. **Create Credentials → OAuth client ID → Web application**
3. **Authorized redirect URIs:**

```
https://api.webmailagent.com/v1/workspace/gmail/callback
https://api.webmailagent.com/v1/workspace/calendar/callback
http://127.0.0.1:8787/v1/workspace/gmail/callback
http://127.0.0.1:8787/v1/workspace/calendar/callback
```

4. Enable APIs: **Gmail API**, **Google Calendar API**
5. OAuth consent screen → add test users while in *Testing* mode

### Scopes

| Scope | Purpose |
|-------|---------|
| `gmail.readonly` | P1 read, triage, digest |
| `gmail.compose` | P3 draft creation (optional second connect) |
| `calendar.readonly` | P2 availability, agenda |
| `calendar.events` | P3 event create/update |

## 2. Worker secrets

Interactive wizard:

```bash
npm run wizard:workspace-gmail
npm run wizard:workspace-gmail -- --deploy
```

Or manual:

```bash
# .dev.vars
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

npm run setup:workspace-gmail-prod
```

Refresh tokens are encrypted with `MCP_OAUTH_JWT_SECRET` or `API_KEY` (already on prod).

## 3. Connect mailbox

**REST** (admin/write API key):

```bash
curl -sS https://api.webmailagent.com/v1/workspace/gmail/connect \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .url
```

Open `url` in browser → approve → account appears in:

```bash
curl -sS https://api.webmailagent.com/v1/workspace/gmail/accounts \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq
```

**UI:** https://webmailagent.com/workspace.html → paste API key → **Connect Gmail**

**MCP:** `mailagent_gmail_connect` → open returned `url`

## 4. Verify

```bash
curl -sS https://api.webmailagent.com/v1/workspace/gmail/status \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" | jq .configured
# true

npm run test:contract:qa:workspace-agent
```

## 5. Optional: compose + automation

```bash
# Draft writes (P3)
GET /v1/workspace/gmail/connect-compose

# Scheduled monitors (P4)
PUT /v1/workspace/policy
{ "mode": "draft_only", "automationEnabled": true }
```

See [WORKSPACE-AUTONOMY.md](./WORKSPACE-AUTONOMY.md) and [WORKSPACE-AGENT-PBR.md](./WORKSPACE-AGENT-PBR.md).
