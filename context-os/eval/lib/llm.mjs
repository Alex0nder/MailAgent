/** OpenAI-compatible chat API for answer + judge */
const SYSTEM_ANSWER = `You answer questions about the MailAgent project using ONLY the context provided.
If the context is insufficient, say what is missing. Do not invent file paths or features.
Be concise and factual. Prefer bullet points for technical answers.`;

export function llmConfig() {
  const apiKey =
    process.env.OPENAI_API_KEY ??
    process.env.EVAL_API_KEY ??
    process.env.OpenAI_API_Key;
  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  );
  const model = process.env.EVAL_MODEL ?? "gpt-4o-mini";
  const judgeModel = process.env.EVAL_JUDGE_MODEL ?? model;

  if (!apiKey) {
    throw new Error(
      "Set OPENAI_API_KEY or EVAL_API_KEY (OpenAI-compatible chat completions)"
    );
  }

  return { apiKey, baseUrl, model, judgeModel };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function retryableError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /LLM 429|LLM 500|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg);
}

async function chatCompletionOnce({ model, messages, temperature = 0 }) {
  const { apiKey, baseUrl } = llmConfig();
  const started = Date.now();

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
    }),
  });

  const latency_ms = Date.now() - started;
  const body = await res.json();

  if (!res.ok) {
    const msg = body?.error?.message ?? res.statusText;
    throw new Error(`LLM ${res.status}: ${msg}`);
  }

  const choice = body.choices?.[0];
  const content = choice?.message?.content ?? "";
  const usage = body.usage ?? {};

  return {
    content,
    latency_ms,
    tokens_in: usage.prompt_tokens ?? 0,
    tokens_out: usage.completion_tokens ?? 0,
    model,
  };
}

/**
 * @param {{ model: string, messages: object[], temperature?: number }} opts
 */
export async function chatCompletion(opts) {
  const maxAttempts = 5;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await chatCompletionOnce(opts);
    } catch (err) {
      lastErr = err;
      if (!retryableError(err) || attempt === maxAttempts) throw err;
      const waitMs = Math.min(60_000, attempt * 15_000);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

/**
 * @param {string} question
 * @param {string} contextText
 */
export async function answerQuestion(question, contextText, condition) {
  const { model } = llmConfig();
  const user = `Context (${condition}):\n${contextText}\n\nQuestion: ${question}`;

  return chatCompletion({
    model,
    messages: [
      { role: "system", content: SYSTEM_ANSWER },
      { role: "user", content: user },
    ],
    temperature: 0,
  });
}
