# Raw MIME in R2

Resend exposes `raw.download_url` for only ~1 hour. MailAgent downloads `.eml` on ingest and stores it in **Cloudflare R2** until inbox deletion (TTL / cron / DELETE).

## Setup

1. **Cloudflare Dashboard** → R2 → enable R2 for your account (required once).
2. Create bucket and deploy:

```bash
npx wrangler r2 bucket create mailagent-raw-mime
npm run deploy
npm run db:migrate   # 009_message_raw_r2.sql
```

Binding is already in `wrangler.jsonc`:

```jsonc
"r2_buckets": [{ "binding": "RAW_MIME", "bucket_name": "mailagent-raw-mime" }]
```

Optional: `RAW_MIME_MAX_BYTES` (default `15728640` = 15MB).

## API

```bash
# List — hasRaw + rawUrl fields
GET /v1/inboxes/:inboxId/messages

# Download .eml
GET /v1/inboxes/:inboxId/messages/:messageId/raw

# Metadata (size)
GET /v1/inboxes/:inboxId/messages/:messageId/raw \
  -H "Accept: application/json"
```

## Errors

| Code | Cause |
|------|-------|
| `raw_mime_disabled` | Worker without R2 binding |
| `raw_not_stored` | Message before R2 was enabled or download failed |
| `raw_not_found` | Key in DB, R2 object deleted |

## Cleanup

R2 objects are deleted on:

- `DELETE /v1/inboxes/:id`
- `DELETE /v1/inboxes?labelPrefix=`
- hourly cron `purgeExpired`

Site: [webmailagent.com/docs/raw-mime.html](https://webmailagent.com/docs/raw-mime.html)
