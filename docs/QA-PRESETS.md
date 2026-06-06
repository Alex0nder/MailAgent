# `service` preset matrix (QA)

The `service` field on `POST /v1/inboxes` sets **sender allowlist** (`expectFrom`). Mail from other domains is not stored — protection against stray mail on a shared catch-all.

Source: `src/lib/service-presets.ts`.

| `service` | Domains / From (allowlist) | Typical content | `subjectContains` (example) |
|-----------|---------------------------|------------------|----------------------------|
| `auth0` | auth0.com | OTP, magic link | `verify`, `code` |
| `clerk` | clerk.com, clerk.dev | OTP | `verification` |
| `stripe` | stripe.com | code, receipt | `verification`, `code` |
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

| Situation | Recommendation |
|----------|----------------|
| Staging Auth0 tenant | `service: "auth0"` + verify real From in first message |
| Custom SMTP domain | `expectFrom: ["mail.your-staging.com"]` instead of or with `service` |
| Multiple senders | `expectFrom: ["a.com", "b.com"]` |
| Unknown From | Create inbox without `service`, send test mail, check `GET …/messages` → `from` |

## Create example

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
  expectFrom: "mail.staging.example.com", // in addition to preset
});
```

See also [QA.md](./QA.md), [agents recipes](../src/lib/agent-recipes.ts).
