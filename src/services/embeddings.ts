/** Workers AI embeddings для semantic search (optional binding) */
import type { Env } from "../env";

export const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
export const EMBED_DIM = 768;

type EmbedResponse = { data?: number[][] };

export function semanticSearchAvailable(env: Env): boolean {
  return Boolean(env.AI);
}

export async function embedText(
  env: Env,
  text: string
): Promise<number[] | null> {
  if (!env.AI || !text.trim()) return null;
  const model = env.SEARCH_EMBED_MODEL?.trim() || EMBED_MODEL;
  try {
    const result = (await env.AI.run(model, {
      text: [text.slice(0, 8000)],
    })) as EmbedResponse;
    const vec = result.data?.[0];
    if (!vec?.length) return null;
    return vec;
  } catch (err) {
    console.error("embed failed", err);
    return null;
  }
}

export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
