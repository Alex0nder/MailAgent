/** OpenAI-compatible embeddings for semantic router */
import { llmConfig } from "./llm.mjs";

export async function embedTexts(texts) {
  const { apiKey, baseUrl } = llmConfig();
  const model = process.env.EVAL_EMBED_MODEL ?? "text-embedding-3-small";

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embeddings ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((row) => row.embedding);
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
