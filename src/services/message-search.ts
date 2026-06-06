/** Inbox message search: keyword ILIKE + optional semantic (pgvector) */
import type { Env } from "../env";
import { getDb } from "../db/client";
import type { MessageRow } from "./inbox";
import {
  embedText,
  semanticSearchAvailable,
  vectorLiteral,
} from "./embeddings";

export type SearchMode = "auto" | "keyword" | "semantic";

export type SearchHit = {
  messageId: string;
  score: number;
  matchType: "keyword" | "semantic";
  subject: string;
  from: string;
  snippet: string;
  receivedAt: string;
  otp: string | null;
  direction: string;
};

export function buildSearchText(row: MessageRow): string {
  const links = parseLinks(row.links_json);
  return [
    row.subject,
    row.from_addr,
    row.text_preview ?? "",
    row.html_preview ?? "",
    row.otp ?? "",
    links.join(" "),
  ]
    .join("\n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16000);
}

function parseLinks(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }
  return [];
}

function snippet(text: string, query: string, max = 160): string {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return text.slice(0, max);
  const start = Math.max(0, idx - 40);
  return text.slice(start, start + max);
}

/** Index message for search after ingest (non-blocking errors) */
export async function indexMessageSearch(
  env: Env,
  row: MessageRow
): Promise<void> {
  const searchText = buildSearchText(row);
  if (!searchText) return;

  const sql = getDb(env);
  try {
    await sql`
      INSERT INTO message_search (message_id, inbox_id, search_text)
      VALUES (${row.id}, ${row.inbox_id}, ${searchText})
      ON CONFLICT (message_id) DO UPDATE
      SET search_text = EXCLUDED.search_text,
          updated_at = NOW()
    `;
  } catch (err) {
    console.error("message_search upsert failed", row.id, err);
    return;
  }

  if (!semanticSearchAvailable(env)) return;

  const embedding = await embedText(env, searchText);
  if (!embedding?.length) return;

  try {
    const vec = vectorLiteral(embedding);
    await sql`
      UPDATE message_search
      SET embedding = ${vec}::vector, updated_at = NOW()
      WHERE message_id = ${row.id}
    `;
  } catch (err) {
    console.error("message_search embed failed", row.id, err);
  }
}

export async function searchInboxMessages(
  env: Env,
  inboxId: string,
  query: string,
  options?: { limit?: number; mode?: SearchMode }
): Promise<{
  query: string;
  mode: SearchMode;
  semanticAvailable: boolean;
  results: SearchHit[];
}> {
  const q = query.trim();
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);
  const mode = options?.mode ?? "auto";
  const semanticAvailable = semanticSearchAvailable(env);

  if (!q) {
    return { query: q, mode, semanticAvailable, results: [] };
  }

  const byId = new Map<string, SearchHit>();

  if (mode === "keyword" || mode === "auto") {
    for (const hit of await keywordSearch(env, inboxId, q, limit)) {
      byId.set(hit.messageId, hit);
    }
  }

  if (semanticAvailable && (mode === "semantic" || mode === "auto")) {
    for (const hit of await semanticSearch(env, inboxId, q, limit)) {
      const prev = byId.get(hit.messageId);
      if (!prev || hit.score > prev.score) {
        byId.set(hit.messageId, hit);
      } else if (prev.matchType === "keyword") {
        byId.set(hit.messageId, { ...prev, matchType: "keyword", score: prev.score });
      }
    }
  }

  const results = [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { query: q, mode, semanticAvailable, results };
}

async function keywordSearch(
  env: Env,
  inboxId: string,
  query: string,
  limit: number
): Promise<SearchHit[]> {
  const sql = getDb(env);
  const pattern = `%${query.replace(/[%_]/g, " ").trim()}%`;

  const rows = (await sql`
    SELECT id, inbox_id, provider_id, from_addr, subject,
           text_preview, html_preview, otp, links_json, received_at,
           raw_r2_key, direction, thread_id, in_reply_to, to_addrs, rfc_message_id
    FROM messages
    WHERE inbox_id = ${inboxId}
      AND (
        subject ILIKE ${pattern}
        OR text_preview ILIKE ${pattern}
        OR html_preview ILIKE ${pattern}
        OR from_addr ILIKE ${pattern}
        OR otp = ${query}
      )
    ORDER BY received_at DESC
    LIMIT ${limit}
  `) as MessageRow[];

  return rows.map((row, i) => {
    const text = buildSearchText(row);
    return {
      messageId: row.id,
      score: 1 - i * 0.01,
      matchType: "keyword" as const,
      subject: row.subject,
      from: row.from_addr,
      snippet: snippet(text, query),
      receivedAt: row.received_at,
      otp: row.otp,
      direction: row.direction ?? "inbound",
    };
  });
}

async function semanticSearch(
  env: Env,
  inboxId: string,
  query: string,
  limit: number
): Promise<SearchHit[]> {
  const embedding = await embedText(env, query);
  if (!embedding?.length) return [];

  const sql = getDb(env);
  const vec = vectorLiteral(embedding);

  const rows = (await sql`
    SELECT
      m.id, m.inbox_id, m.provider_id, m.from_addr, m.subject,
      m.text_preview, m.html_preview, m.otp, m.links_json, m.received_at,
      m.raw_r2_key, m.direction, m.thread_id, m.in_reply_to, m.to_addrs,
      m.rfc_message_id,
      1 - (s.embedding <=> ${vec}::vector) AS score
    FROM message_search s
    JOIN messages m ON m.id = s.message_id
    WHERE s.inbox_id = ${inboxId}
      AND s.embedding IS NOT NULL
    ORDER BY s.embedding <=> ${vec}::vector
    LIMIT ${limit}
  `) as (MessageRow & { score: number })[];

  return rows.map((row) => {
    const text = buildSearchText(row);
    return {
      messageId: row.id,
      score: Number(row.score) || 0,
      matchType: "semantic" as const,
      subject: row.subject,
      from: row.from_addr,
      snippet: snippet(text, query),
      receivedAt: row.received_at,
      otp: row.otp,
      direction: row.direction ?? "inbound",
    };
  });
}
