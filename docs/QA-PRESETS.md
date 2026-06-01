# Матрица `service` presets (QA)

Поле `service` при `POST /v1/inboxes` задаёт **allowlist отправителя** (`expectFrom`). Письма с других доменов не попадут в inbox — это защита от чужих писем на общий catch-all.

Источник: `src/lib/service-presets.ts`.

| `service` | Домены / From (allowlist) | Типичный контент | `subjectContains` (пример) |
|-----------|---------------------------|------------------|----------------------------|
| `auth0` | auth0.com | OTP, magic link | `verify`, `code` |
| `clerk` | clerk.com, clerk.dev | OTP | `verification` |
| `stripe` | stripe.com | код, receipt | `verification`, `code` |
| `github` | github.com, noreply@github.com | OTP, device | `verification` |
| `google` | google.com, accounts.google.com | OTP | `verification`, `G-` |
| `firebase` | firebase.google.com, google.com | OTP | `verify` |
| `supabase` | supabase.com, supabase.io | confirm signup | `confirm` |
| `vercel` | vercel.com | login link | `log in`, `verify` |
| `figma` | figma.com, mail.figma.com | invite, verify | `verify`, `invite` |
| `notion` | notion.so, makenotion.com | magic link | `sign in` |
| `linear` | linear.app | magic link | `log in` |
| `slack` | slack.com | confirm code | `confirmation` |
| `shopify` | shopify.com | verify shop | `verify` |
| `discord` | discord.com | verify email | `verify` |
| `openai` | openai.com | login code | `code` |
| `resend` | resend.com | test sends | — |
| `dribbble` | dribbble.com, m.dribbble.com | verify | `verify` |
| `atlassian` | atlassian.com, jira.com | verify | `verify` |
| `aws` | amazon.com, aws.amazon.com | verify | `verify` |
| `microsoft` | microsoft.com, outlook.com | security code | `code` |
| `apple` | apple.com, icloud.com | verify | `verify` |
| `twilio` | twilio.com | verify | `verify` |
| `posthog` | posthog.com | invite | `invite` |

## Staging vs production

| Ситуация | Рекомендация |
|----------|----------------|
| Staging Auth0 tenant | `service: "auth0"` + проверьте реальный From в первом письме |
| Кастомный SMTP домен | `expectFrom: ["mail.your-staging.com"]` вместо или вместе с `service` |
| Несколько отправителей | `expectFrom: ["a.com", "b.com"]` |
| Не знаете From | Создайте inbox без `service`, пришлите тестовое письмо, смотрите `GET …/messages` → `from` |

## Пример create

```bash
curl -sS -X POST "$MAILAGENT_API_URL/v1/inboxes" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label":"ci-42","service":"auth0","ttlMinutes":30}'
```

```typescript
await mail.createInbox({
  label: mail.runLabel("ci"),
  service: "auth0",
  expectFrom: "mail.staging.example.com", // дополнительно к preset
});
```

См. также [QA.md](./QA.md), [agents recipes](../src/lib/agent-recipes.ts).
