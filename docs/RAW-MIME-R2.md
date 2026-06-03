# Raw MIME in R2

Resend отдаёт `raw.download_url` только ~1 час. MailAgent скачивает `.eml` при ingest и хранит в **Cloudflare R2** до удаления inbox (TTL / cron / DELETE).

## Setup

1. **Cloudflare Dashboard** → R2 → enable R2 for your account (required once).
2. Create bucket and deploy:

```bash
npx wrangler r2 bucket create mailagent-raw-mime
npm run deploy
npm run db:migrate   # 009_message_raw_r2.sql
```

Binding уже в `wrangler.jsonc`:

```jsonc
"r2_buckets": [{ "binding": "RAW_MIME", "bucket_name": "mailagent-raw-mime" }]
```

Опционально: `RAW_MIME_MAX_BYTES` (default `15728640` = 15MB).

## API

```bash
# Список — поле hasRaw + rawUrl
GET /v1/inboxes/:inboxId/messages

# Скачать .eml
GET /v1/inboxes/:inboxId/messages/:messageId/raw

# Метаданные (размер)
GET /v1/inboxes/:inboxId/messages/:messageId/raw \
  -H "Accept: application/json"
```

## Ошибки

| Code | Причина |
|------|---------|
| `raw_mime_disabled` | Worker без R2 binding |
| `raw_not_stored` | Письмо до включения R2 или download failed |
| `raw_not_found` | Ключ в БД, объект в R2 удалён |

## Cleanup

R2 объекты удаляются при:

- `DELETE /v1/inboxes/:id`
- `DELETE /v1/inboxes?labelPrefix=`
- hourly cron `purgeExpired`

Сайт: [webmailagent.com/docs/raw-mime.html](https://webmailagent.com/docs/raw-mime.html)
