# MCP OAuth через Auth0 / Google (OIDC)

MailAgent может принимать **login через внешний IdP** для remote MCP (Cursor, Claude Desktop) — без ручного API key в конфиге клиента.

## Два режима OAuth

| Режим | Когда | Flow |
|-------|-------|------|
| **client_credentials** | по умолчанию | API key → `mat_` token |
| **authorization_code + PKCE** | `OIDC_*` на Worker | Browser login (Auth0/Google) → `mat_` token |

Оба могут работать одновременно.

## Настройка Auth0 (пример)

1. [Auth0 Dashboard](https://manage.auth0.com) → Applications → Create → **Regular Web Application**
2. **Allowed Callback URLs:**
   ```
   https://api.webmailagent.com/v1/oauth/callback
   http://127.0.0.1:8787/v1/oauth/callback
   ```
3. Скопируй **Domain**, **Client ID**, **Client Secret**

Worker secrets:

```bash
npx wrangler secret put OIDC_ISSUER
# https://YOUR-TENANT.us.auth0.com

npx wrangler secret put OIDC_CLIENT_ID
npx wrangler secret put OIDC_CLIENT_SECRET

# опционально для Auth0 API
npx wrangler secret put OIDC_AUDIENCE
```

Локально в `.dev.vars` — те же ключи.

4. Миграция:

```bash
npm run db:migrate
```

5. Deploy + проверка discovery:

```bash
curl -sS https://api.webmailagent.com/.well-known/oauth-authorization-server | jq .
# authorization_endpoint, grant_types: authorization_code
```

## Flow (MCP client)

```mermaid
sequenceDiagram
  participant Client as MCP Client
  participant MA as MailAgent
  participant IdP as Auth0/Google

  Client->>MA: GET /v1/oauth/authorize (PKCE)
  MA->>IdP: redirect login
  IdP->>MA: GET /v1/oauth/callback
  MA->>Client: redirect ?code=...
  Client->>MA: POST /v1/oauth/token (authorization_code)
  MA->>Client: mat_ access_token
  Client->>MA: POST /mcp (Bearer mat_)
```

## Endpoints

| Method | Path | Описание |
|--------|------|----------|
| GET | `/v1/oauth/authorize` | Старт login (PKCE: `redirect_uri`, `state`, `code_challenge`) |
| GET | `/v1/oauth/callback` | Callback от IdP (internal) |
| POST | `/v1/oauth/token` | `grant_type=authorization_code` или `client_credentials` |

### Token exchange (authorization_code)

```bash
curl -sS -X POST https://api.webmailagent.com/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=MAILAGENT_CODE" \
  -d "redirect_uri=http://127.0.0.1:7777/callback" \
  -d "code_verifier=ORIGINAL_VERIFIER"
```

## Teams

Первый login через IdP создаёт **team `free`** + запись в `oidc_identities` (issuer + sub).

План меняется как обычно: `npm run team:plan`, Stripe checkout.

## Google

Используй Google OAuth Client (Web) + OIDC issuer `https://accounts.google.com`  
или Auth0 с Google social login (проще для MCP).

## Без OIDC

Если секреты не заданы — `GET /v1/oauth/authorize` → `501 oidc_not_configured`.  
client_credentials и DCR работают как раньше.

См. также [MCP-OAUTH.md](./MCP-OAUTH.md).
