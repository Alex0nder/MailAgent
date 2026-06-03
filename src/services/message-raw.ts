/** Загрузка raw MIME для REST и MCP (read-only, scope-aware через caller) */
import type { Env } from "../env";
import { getMessage } from "./inbox";
import {
  getRawMimeObject,
  rawMimeEnabled,
} from "./raw-mime-r2";

const DEFAULT_MCP_MAX_BYTES = 512 * 1024;

function mcpMaxBytes(env: Env): number {
  const raw = env.RAW_MIME_AGENT_MAX_BYTES;
  const n = raw ? Number(raw) : DEFAULT_MCP_MAX_BYTES;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MCP_MAX_BYTES;
}

export type RawMessagePayload =
  | {
      ok: true;
      messageId: string;
      inboxId: string;
      contentType: "message/rfc822";
      sizeBytes: number;
      filename: string;
      rawUrl: string;
      bodyBase64?: string;
      truncated?: boolean;
    }
  | {
      ok: false;
      error: string;
      status: number;
      hint?: string;
    };

export async function loadRawMessagePayload(
  env: Env,
  inboxId: string,
  messageId: string,
  options?: { includeBody?: boolean }
): Promise<RawMessagePayload> {
  const message = await getMessage(env, inboxId, messageId);
  if (!message) {
    return { ok: false, error: "message_not_found", status: 404 };
  }

  if (!message.raw_r2_key) {
    return {
      ok: false,
      error: rawMimeEnabled(env) ? "raw_not_stored" : "raw_mime_disabled",
      status: rawMimeEnabled(env) ? 404 : 503,
      hint: rawMimeEnabled(env)
        ? "Message ingested before raw storage or download failed."
        : "Configure RAW_MIME R2 binding on the Worker.",
    };
  }

  const obj = await getRawMimeObject(env, message.raw_r2_key);
  if (!obj) {
    return { ok: false, error: "raw_not_found", status: 404 };
  }

  const rawUrl = `/v1/inboxes/${inboxId}/messages/${messageId}/raw`;
  const base = {
    messageId: message.id,
    inboxId,
    contentType: "message/rfc822" as const,
    sizeBytes: obj.size,
    filename: `message-${message.id}.eml`,
    rawUrl,
  };

  if (!options?.includeBody) {
    return { ok: true, ...base };
  }

  const buf = await obj.arrayBuffer();
  const max = mcpMaxBytes(env);
  const truncated = buf.byteLength > max;
  const slice = truncated ? buf.slice(0, max) : buf;
  const bodyBase64 = arrayBufferToBase64(slice);

  return {
    ok: true,
    ...base,
    bodyBase64,
    ...(truncated ? { truncated: true } : {}),
  };
}

export async function rawMessageHttpResponse(
  env: Env,
  inboxId: string,
  messageId: string,
  acceptJson: boolean
): Promise<Response> {
  const payload = await loadRawMessagePayload(env, inboxId, messageId);
  if (!payload.ok) {
    return Response.json(
      { error: payload.error, hint: payload.hint },
      { status: payload.status }
    );
  }

  if (acceptJson) {
    return Response.json({
      messageId: payload.messageId,
      inboxId: payload.inboxId,
      contentType: payload.contentType,
      sizeBytes: payload.sizeBytes,
      filename: payload.filename,
      rawUrl: payload.rawUrl,
    });
  }

  const message = await getMessage(env, inboxId, messageId);
  if (!message?.raw_r2_key) {
    return Response.json({ error: "raw_not_found" }, { status: 404 });
  }
  const obj = await getRawMimeObject(env, message.raw_r2_key);
  if (!obj) {
    return Response.json({ error: "raw_not_found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "message/rfc822");
  headers.set(
    "Content-Disposition",
    `inline; filename="${payload.filename}"`
  );
  if (obj.etag) headers.set("ETag", obj.etag);
  return new Response(obj.body, { headers });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
