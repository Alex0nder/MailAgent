-- v0.21: message search (keyword + optional pgvector embeddings)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS message_search (
  message_id TEXT PRIMARY KEY REFERENCES messages (id) ON DELETE CASCADE,
  inbox_id TEXT NOT NULL REFERENCES inboxes (id) ON DELETE CASCADE,
  search_text TEXT NOT NULL,
  embedding vector(768),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_search_inbox ON message_search (inbox_id);

CREATE INDEX IF NOT EXISTS idx_message_search_embedding
  ON message_search
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
