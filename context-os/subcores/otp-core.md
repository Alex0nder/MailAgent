# OTP Core — MailAgent

Специализированное ядро Context OS: **извлечение и доставка OTP / magic links** — `extractOtp`, wait filters, `verify_signup`, `messageIndex`, simulate, structured extract fallback, MCP tools.

**Когда грузить:** «otp null», timeout wait, welcome vs verify email, `mailagent_verify_signup`, `primaryAction`, regex false positives, structured extract.

**Связанные subcores:** `serialization-core` (**verification JSON schema** — источник правды для формата), `email-core` (ingest timing), `inbox-core` (wait/SSE).

---

## Purpose

OTP core — узкий слой поверх email ingest и inbox wait. MailAgent не «угадывает» код при каждом GET — **extract один раз** при `insertMessage`, затем read-path отдаёт stored `messages.otp` и `messages.links_json` как `MessageVerification`.

Пять групп вопросов:

### 1. Extraction (extract.ts)

Regex + `parse-otp-message` fallback; links ranked by verify-like URL patterns.

### 2. Wait + pick message

`subjectContains`, `messageIndex` (0=newest match, 1=second) — типичный welcome-then-verify case.

### 3. Agent verify flow

`runAgentVerify` → `agent.primaryAction` (`otp` | `magic_link` | `link` | `manual`).

### 4. Simulate + contract tests

Inject known OTP без SMTP для CI.

### 5. Structured extract fallback

Workers AI preset `2fa` когда regex не справился.

---

## Entities

### MessageVerification

**Каноническая схема — `serialization-core`.** Реализация: `src/services/message-verify.ts`.

```typescript
export type MessageVerification = {
  otp: string | null;
  links: string[];           // max 5 at extract time
  primaryLink: string | null;
  from: string;
  subject: string;
  messageId: string;
  hasRaw?: boolean;
  rawUrl?: string;           // /v1/inboxes/{inboxId}/messages/{id}/raw
};
```

Фабрика: `formatMessageVerification(row, inboxId?)` — **не re-extracts**, читает DB row.

Расширение в `runAgentVerify`:

```typescript
verification: MessageVerification & {
  attachmentCount: number;
  hasAttachments: boolean;
}
```

### AgentPrimaryAction

Файл: `src/lib/agent-recipes.ts` — `buildPrimaryAction(verification)`:

```typescript
type PrimaryAction = {
  type: "otp" | "magic_link" | "link" | "manual";
  value?: string;
  instruction: string;
};
```

Приоритет: `otp` > `primaryLink` (magic_link) > `links[0]` (link) > manual с hint на raw/list.

### WaitOptions / WaitTimeoutDebug

См. `inbox-core`, `src/services/wait.ts`.

### StructuredExtractResult

```typescript
type StructuredExtractResult = {
  messageId: string;
  preset: ExtractPreset | null;
  extractor: "rules" | "ai" | "hybrid";
  data: Record<string, unknown>;
};
```

Presets: `2fa`, `magic_link`, `invite`, `invoice`, `receipt`.

### Stored DB fields

| Column | Set by | Read by |
|--------|--------|---------|
| `messages.otp` | extractOtp at ingest | verification.otp |
| `messages.links_json` | extractLinks at ingest | verification.links |

---

## Decision history

| # | Решение | Дата/фаза | Статус |
|---|---------|-----------|--------|
| O1 | Extract в queue, не read-path | E2 email | active |
| O2 | Regex before parse-otp-message | extract.ts | active |
| O3 | Skip 4-digit years 20xx | false positive fix | active |
| O4 | Link noise filter (unsubscribe…) | extract.ts | active |
| O5 | LINK_VERIFY ranking | extract.ts | active |
| O6 | messageIndex for multi-email signup | wait.ts | active |
| O7 | verify_signup preferred MCP tool | product | active |
| O8 | primaryAction for LLM clarity | agent-recipes | active |
| O9 | service → default subjectContains | service-presets | active |
| O10 | Structured extract AI fallback | structured-extract | active |
| O11 | Simulate default otp 482910 | simulate-inbound | active |
| O12 | Verification nested in callback payload | serialization | active |

### Narrative decisions

**O1 — Extract once.** `GET /extract` не парсит HTML заново. Если OTP изменить вручную в DB — API отразит; если regex улучшили — только **новые** письма.

**O6 — messageIndex.** Многие signup flows шлют welcome email первым, verification вторым. `messageIndex: 0` берёт newest matching `subjectContains`; `1` — второй. Без filter index считается по всем messages DESC.

**O7 — verify_signup.** Один MCP call: create (или reuse inboxId) + wait + verification + `primaryAction`. Агенту не нужно выбирать между wait/extract tools.

**O9 — SERVICE_SUBJECT_HINTS.** Если агент не передал `subjectContains`, `runAgentVerify` подставляет hint по `service` (github→`verify`, gitlab→`Confirm`). Снижает timeout rate.

---

## Sources

| Модуль | Роль |
|--------|------|
| `src/services/extract.ts` | extractOtp, extractLinks, primaryLink |
| `src/services/message-verify.ts` | MessageVerification type |
| `src/services/wait.ts` | waitForMessage, buildWaitTimeoutDebug |
| `src/services/agent-verify.ts` | runAgentVerify, primaryAction |
| `src/lib/agent-recipes.ts` | buildPrimaryAction, recipes |
| `src/lib/service-presets.ts` | SERVICE_SUBJECT_HINTS, EXPECT_FROM |
| `src/services/structured-extract.ts` | AI/rules presets |
| `src/services/simulate-inbound.ts` | test OTP inject |
| `src/routes/inboxes.ts` | GET extract, POST message extract |
| `src/routes/agent.ts` | POST /v1/agent/verify |
| `src/mcp/handlers.ts` | MCP tool execution |
| `context-os/subcores/serialization-core.md` | **Verification JSON contract** |

---

## extractOtp — полная спецификация

Файл: `src/services/extract.ts`

### Алгоритм

```typescript
export function extractOtp(text: string): string | null {
  // Phase 1: ordered regex patterns (first match wins)
  for (const pattern of OTP_PATTERNS) {
    const match = text.match(pattern);
    const code = match?.[1];
    if (!code) continue;
    if (code.length === 4 && code.startsWith("20")) continue; // year guard
    return code;
  }
  // Phase 2: npm parse-otp-message
  const parsed = parseOtpMessage(text);
  if (parsed?.code && /^\d{4,8}$/.test(parsed.code)) return parsed.code;
  return null;
}
```

### OTP_PATTERNS (порядок важен)

| # | Pattern | Пример match |
|---|---------|--------------|
| 1 | `/code[:\s]+(\d{4,8})/i` | `Code: 123456` |
| 2 | `/verification[:\s]+(\d{4,8})/i` | `Verification: 4829` |
| 3 | `/one[- ]?time(?: password)?[:\s]+(\d{4,8})/i` | `One-time password: 999888` |
| 4 | `/\b(\d{6})\b/` | standalone 6-digit |
| 5 | `/\b(\d{4})\b/` | standalone 4-digit |

### False positive guards

- 4-digit match starting with `20` skipped (years 2000–2099 в тексте)
- `parse-otp-message` fallback только для `\d{4,8}`

### Когда otp остаётся null

- Только HTML с кодом в `<img>` / SVG без text layer
- Alphanumeric codes (не digits) — нужен structured extract или manual
- Код в attachment PDF — нужен `mailagent_get_attachment`
- Письмо magic-link only (no digits) — используйте `primaryLink`

### Где вызывается extractOtp

| Path | File |
|------|------|
| Production inbound | `resend-mail.ts` → processInboundEmail |
| Outbound send | `outbound-mail.ts` |
| Simulate | `simulate-inbound.ts` (explicit otp in body) |

**Не вызывается:** webhook handler, `GET /extract`, `formatMessageVerification`.

---

## extractLinks + primaryLink

### extractLinks

```typescript
const LINK_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
const LINK_NOISE = /unsubscribe|list-manage|mailto:|privacy|preferences|trk\.|click\./i;
const LINK_VERIFY = /verify|confirm|activation|magic|token|oauth|sign[-_]?in|signup|password[-_]?reset|auth/i;
```

1. Match all URLs in combined text+html
2. Dedupe, strip trailing `.,;`
3. Filter LINK_NOISE
4. Sort by `linkScore` (LINK_VERIFY → +2)
5. Return top `max` (default 5)

### primaryLink

```typescript
export function primaryLink(links: string[]): string | null {
  return links[0] ?? null;  // already ranked
}
```

---

## Wait filters

### waitForMessage()

```typescript
await waitForMessage(env, inboxId, timeoutSec, {
  subjectContains?: string;  // case-insensitive substring on subject
  messageIndex?: number;     // default 0
  onProgress?: (event) => void;
});
```

### Поведение poll loop

1. `cap = min(max(timeoutSec, 5), 120)`
2. Every 500ms: `listMessages(env, inboxId, { subjectContains })`
3. Messages sorted `received_at DESC`
4. Pick `messages[messageIndex]`
5. Found → return row; else continue until deadline

### messageIndex: welcome vs verify

Типичный сценарий GitLab/GitHub:

| Index | Какое письмо | Когда использовать |
|-------|--------------|-------------------|
| 0 | Newest matching subjectContains | Одно verification письмо |
| 1 | Second newest match | Welcome + verify (два письма) |
| 2+ | Nth match | Редко; multi-step flows |

**Симптом wrong OTP:** `messageIndex: 0` читает welcome «Thanks for signing up» с tracking digits, не verify code → переключите на `1` или уточните `subjectContains`.

### buildWaitTimeoutDebug hints

| Condition | hint |
|-----------|------|
| 0 messages total | webhook, expectFrom, domain |
| messages but 0 matching subjectContains | relax filter |
| matchingCount <= messageIndex | wait longer or lower index |

---

## verify_signup и agent verify

### MCP: mailagent_verify_signup (preferred)

Handler: `src/mcp/handlers.ts` → `runAgentVerify()`.

Args (Zod in manifest):
- `inboxId?` — reuse existing or create new
- `service?` — preset expectFrom + subject hint
- `subjectContains?`, `messageIndex?`, `timeoutSeconds?` (max 120)
- `ttlMinutes?`, `label?`, `runId?`, `deleteAfter?`
- `callbackUrl?`, `username?`, `domainId?`

### REST: POST /v1/agent/verify

Same `runAgentVerify` — response includes `agent.primaryAction`.

### runAgentVerify flow

```
1. parseCallbackUrl (if callbackUrl)
2. resolveExpectFrom(service, expectFrom)
3. createInbox OR getInbox(inboxId)
4. subjectContains ||= resolveSubjectHint(service)
5. waitForMessage(timeout, { subjectContains, messageIndex, onProgress })
6. timeout → buildWaitTimeoutDebug, optional delete, debugUiUrl
7. success → formatMessageVerification + attachmentCount
8. buildPrimaryAction(verification)
9. deleteAfter logic:
   - new inbox: delete unless deleteAfter === false
   - existing inboxId: delete only if deleteAfter === true
10. recordVerifyRunSession if runId
```

### Success response shape

```typescript
{
  status: "verified",
  statusCode: 200,
  email: { inboxId, address, expiresAt, allowedSenders, label },
  verification: MessageVerification & { attachmentCount, hasAttachments },
  agent: {
    primaryAction: { type, value?, instruction },
    service: string | null
  },
  deleted: boolean
}
```

### Timeout response

```typescript
{
  status: "timeout",
  statusCode: 408,
  email: { inboxId, address, ... },
  messageCount, matchingCount, messageIndex,
  subjects: [{ id, subject, from, receivedAt, otp }],
  hint: string,
  debugUiUrl: string,
  suggestedSubjectContains: string | null,
  inboxKept: boolean
}
```

---

## primaryAction decision tree

```
verification.otp present?
  YES → { type: "otp", value: otp, instruction: "Enter this code..." }
  NO → verification.primaryLink present?
    YES → { type: "magic_link", value: url, instruction: "Open this URL..." }
    NO → verification.links[0] present?
      YES → { type: "link", value: links[0], ... }
      NO → { type: "manual", instruction: "use list_messages / get_raw_message" }
```

Агентам: **следовать `instruction`**, не парсить email body вручную.

---

## SERVICE presets (OTP-relevant)

### expectFrom (allowlist)

`SERVICE_EXPECT_FROM` в `service-presets.ts` — при create с `service: "github"` allowlist включает `noreply@github.com`, `github.com`, etc. Wrong service → silent drop at ingest.

### subjectContains hints

`SERVICE_SUBJECT_HINTS` — auto-filled в verify если не передан (github→`verify`, gitlab→`Confirm`, google→`verification`, auth0→`verify`, …). Полный список — `src/lib/service-presets.ts`.

### TTL hints

`SERVICE_TTL_MINUTES` — e.g. github/gitlab 60 min, auth0/clerk 45 min.

---

## Simulate OTP (testing)

### REST

```bash
POST /v1/inboxes/:id/simulate
{
  "otp": "123456",
  "from": "noreply@auth0.com",
  "subject": "Verify your email",
  "scenario": "otp",
  "fireCallback": true
}
```

### Defaults (без body)

- otp: `482910`
- from: `qa-simulate@mailagent.test`
- subject: `MailAgent simulated OTP`
- links: `["https://example.com/verify?token=simulated"]`

### Scenarios

| scenario | OTP | Links | Extra |
|----------|-----|-------|-------|
| otp | set | — | — |
| magic_link | null | verify URL | — |
| attachment | set | — | PDF fixture |
| invite | — | invite URL | workspace fields |
| invoice_fixture | — | — | invoice structured |

Contract tests: `npm run test:contract:qa` — **без real SMTP**.

MCP: `mailagent_simulate_message` → then `mailagent_verify_signup` or `mailagent_wait_and_extract`.

---

## Structured extract fallback

Когда regex `extractOtp` вернул null, но письмо явно verification:

### Endpoint

```bash
POST /v1/inboxes/:id/messages/:messageId/extract
{ "preset": "2fa" }
```

### Preset 2fa (rules path)

`structured-extract.ts` — re-reads previews, applies rules + optional Workers AI (`EXTRACT_MODEL` env).

Returns:

```typescript
{
  messageId, preset: "2fa", extractor: "rules" | "ai" | "hybrid",
  data: { otp, links, primaryLink, from, subject, messageId }
}
```

### Other presets

| preset | Use case |
|--------|----------|
| magic_link | link-only verify |
| invite | workspace invite |
| invoice | billing QA |
| receipt | purchase receipt |

Custom `schema` → requires AI — 501 `ai_required_for_custom_schema` if model unavailable.

MCP: `mailagent_extract_structured` (remote MCP).

List presets: `GET /v1/inboxes/:id/extract/presets`.

---

## Read API (verification without wait)

| Endpoint | Behavior |
|----------|----------|
| GET `/v1/inboxes/:id/extract` | Latest message (received_at DESC) → verification |
| GET `/v1/inboxes/:id/messages` | All messages with otp, links, primaryLink per row |
| POST `/v1/inboxes/open` | wait + verification in response |

Ошибка `no_messages` (404) — inbox пуст, wait не выполнялся или allowlist drop.

---

## MCP tools table (OTP surface)

| Tool | Write? | Waits? | Returns | When to use |
|------|--------|--------|---------|-------------|
| `mailagent_verify_signup` | yes* | yes | verification + **primaryAction** | **Preferred** full signup flow |
| `mailagent_wait_and_extract` | yes* | yes | verification only | Need verification object, no primaryAction |
| `mailagent_wait_for_message` | no | yes | full message row | Inspect before extract |
| `mailagent_extract_verification` | no | no | latest verification | Message already arrived |
| `mailagent_simulate_message` | yes | no | messageId, otp | CI / local test inject |
| `mailagent_extract_structured` | no | no | preset data | Regex failed, AI fallback |
| `mailagent_diagnose_inbox` | no | no | debug bundle | Timeout / otp null debug |
| `mailagent_get_raw_message` | no | no | raw MIME | HTML-only OTP |
| `mailagent_list_messages` | no | no | message list | See all subjects/otp |

\*Create inbox if no inboxId; deleteAfter default true.

### Tool selection flowchart

```
Starting signup test?
  → mailagent_verify_signup (service preset + primaryAction)

Already submitted form, inbox exists?
  → mailagent_verify_signup(inboxId=…)
  → or mailagent_wait_and_extract(inboxId=…)

Message already in inbox?
  → mailagent_extract_verification

otp null in verification?
  → mailagent_get_raw_message
  → mailagent_extract_structured preset=2fa

CI without SMTP?
  → mailagent_simulate_message → mailagent_extract_verification
```

---

## Cross-reference: serialization-core

**Verification JSON schema** определён в `serialization-core.md`:

- Type `MessageVerification` — поля и семантика
- `MessageNotifyPayload` — callback/SSE nested verification
- OpenAPI component `Verification`
- CamelCase REST vs snake_case Postgres mapping
- False positive OTP policies (year guard, link noise)
- MCP Zod constraints per tool

При расхождении документов **serialization-core wins** для контрактов API/MCP.

Ключевые правила из serialization-core:

1. Read-path не re-parses — `otp`/`links` from DB only
2. `primaryLink = links[0]` after ranking at extract time
3. `rawUrl` relative path only when `hasRaw: true`
4. Callback duplicates verification for agent consumers

---

## Troubleshooting decision tree

### Symptom: timeout, no verification

```
GET …/messages OR mailagent_diagnose_inbox
│
├─ messageCount = 0
│   ├─ Check Resend webhook 200 (email-core)
│   ├─ INBOX_DOMAIN vs address suffix
│   ├─ allowed_senders vs actual From (service preset)
│   ├─ inbox expired?
│   └─ Queue / DLQ lag
│
├─ messageCount > 0, matchingCount = 0
│   └─ Relax subjectContains; check subjects[] in 408 debug
│
├─ matchingCount > 0, still timeout
│   └─ messageIndex too high — lower to 0 or wait longer
│
└─ message arrived, verification.otp null
    ├─ GET …/raw — code only in HTML?
    ├─ primaryLink instead of otp?
    ├─ POST …/extract preset 2fa
    └─ wrong messageIndex (welcome vs verify)
```

### Symptom: wrong OTP value

| Cause | Fix |
|-------|-----|
| First regex match not the code | structured extract; raw MIME |
| messageIndex 0 = welcome email | use messageIndex: 1 |
| Multiple codes in email | extract takes first match |
| Stale message | subjectContains narrower |

### Symptom: wrong link

| Cause | Fix |
|-------|-----|
| Unsubscribe ranked higher | fixed by LINK_NOISE (shouldn't happen) |
| primaryLink null, links[] has values | use links[0] or magic_link preset |
| Tracking URL | LINK_VERIFY ranking — check raw HTML |

### Debug commands

```bash
# Full diagnose
curl -s -H "Authorization: Bearer $KEY" \
  "$API/v1/inboxes/$ID/diagnose?subjectContains=verify&messageIndex=1" | jq .

# Callback path
curl -s -H "Authorization: Bearer $KEY" \
  "$API/v1/inboxes/$ID/callbacks" | jq .

# Quota / plan
curl -s -H "Authorization: Bearer $KEY" "$API/v1/me" | jq .

# MCP progress tools emit WaitProgressEvent during wait
```

**Doc:** `docs/QA-TROUBLESHOOTING.md` sections 1–3, `docs/MCP-PROGRESS.md`

---

## Dependencies

| Package / service | Role |
|-------------------|------|
| `parse-otp-message` | OTP fallback parser |
| Resend `emails.receiving.get` | text/html for extract |
| Workers AI `EXTRACT_MODEL` | structured extract AI path |
| Queue consumer success | without ingest, otp never stored |
| `INBOX_WAIT` DO | SSE notify after extract complete |

---

## Пример end-to-end (GitHub signup)

```typescript
// 1. MCP mailagent_verify_signup
{
  service: "github",
  label: "ci-e2e-signup-001",
  timeoutSeconds: 90,
  messageIndex: 0  // or 1 if welcome email first
}

// 2. Agent fills github.com signup with returned email.address

// 3. Tool waits, returns:
{
  status: "verified",
  agent: {
    primaryAction: {
      type: "otp",
      value: "123456",
      instruction: "Enter this code in the verification field..."
    }
  },
  verification: { otp: "123456", primaryLink: null, ... }
}

// 4. Agent enters OTP in browser — done
```

CI без SMTP: `create_inbox` → `simulate_message` → `extract_verification`.
