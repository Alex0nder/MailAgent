# Preset Advisor

Use Preset Advisor when an agent has a sample auth email but does not know the right MailAgent `service`, `expectFrom`, `subjectContains`, or `flow`.

REST:

```bash
curl -sS -X POST "$MAILAGENT_API_URL/v1/agent/preset-advice" \
  -H "Authorization: Bearer $MAILAGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "Auth0 <no-reply@auth0.com>",
    "subject": "Verify your email"
  }' | jq .
```

MCP:

```json
{
  "from": "Supabase <noreply@mail.supabase.io>",
  "subject": "Confirm your signup"
}
```

Call `mailagent_suggest_preset` before `mailagent_create_inbox` or `mailagent_verify_signup` when:

- the sender is a staging/custom domain;
- the app uses Auth0, Clerk, Supabase, Firebase, or another auth provider behind its own brand;
- the first wait timed out because `subjectContains` was too narrow;
- the flow might be invite acceptance, magic-link login, login 2FA, or password reset.

The response is advisory and read-only. It returns:

- `service` and `knownPreset`;
- sender allowlist `expectFrom`;
- `flow` and `flowTemplate`;
- recommended `subjectContains`, timeout, TTL;
- expected extraction type (`otp`, `magic_link`, `link`) and structured preset hints;
- copyable snippets for MCP and Playwright.

If `knownPreset` is `false`, use the returned `expectFrom` allowlist instead of guessing a service name.
