# Attachments API

Метаданные вложений сохраняются при ingest из Resend `receiving.get`. Файлы ≤ `ATTACHMENT_MAX_STORE_BYTES` (по умолчанию 2MB) кэшируются в R2 (`RAW_MIME` bucket) рядом с raw MIME.

## REST

```http
GET /v1/inboxes/:id/messages/:messageId/attachments
Authorization: Bearer mat_...
```

```json
{
  "messageId": "msg_abc",
  "attachments": [
    {
      "id": "att_xyz",
      "filename": "invoice.pdf",
      "contentType": "application/pdf",
      "sizeBytes": 12000,
      "cached": true,
      "downloadUrl": "/v1/inboxes/.../messages/.../attachments/att_xyz"
    }
  ]
}
```

Скачивание:

```http
GET /v1/inboxes/:id/messages/:messageId/attachments/:attachmentId
```

- Без `Accept: application/json` — stream из R2 (если cached) или proxy Resend signed URL.
- С `Accept: application/json` — метаданные + свежий `downloadUrl` от Resend (~1h).

Список сообщений включает `attachmentCount`.

## MCP (v0.7)

- `mailagent_list_attachments` — `{ inboxId, messageId }`
- `mailagent_get_attachment` — signed URL + `cached`

`mailagent_list_messages` и verify возвращают `attachmentCount`.

## Purge

При удалении inbox очищаются raw MIME и attachment keys в R2 (`purgeAttachmentR2ForInboxes`).

## Migration

`migrations/010_message_attachments.sql` — таблица `message_attachments`.
