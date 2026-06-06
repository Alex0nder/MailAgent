# Attachments API

Attachment metadata is saved on ingest from Resend `receiving.get`. Files ≤ `ATTACHMENT_MAX_STORE_BYTES` (default 2MB) are cached in R2 (`RAW_MIME` bucket) alongside raw MIME.

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

Download:

```http
GET /v1/inboxes/:id/messages/:messageId/attachments/:attachmentId
```

- Without `Accept: application/json` — stream from R2 (if cached) or proxy Resend signed URL.
- With `Accept: application/json` — metadata + fresh `downloadUrl` from Resend (~1h).

Message list includes `attachmentCount`.

## MCP (v0.7)

- `mailagent_list_attachments` — `{ inboxId, messageId }`
- `mailagent_get_attachment` — signed URL + `cached`

`mailagent_list_messages` and verify return `attachmentCount`.

## Purge

On inbox delete, raw MIME and attachment keys in R2 are cleared (`purgeAttachmentR2ForInboxes`).

## Migration

`migrations/010_message_attachments.sql` — `message_attachments` table.
