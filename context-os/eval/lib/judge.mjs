/** LLM-as-judge against gold criteria */
import { chatCompletion, llmConfig } from "./llm.mjs";

const SYSTEM_JUDGE = `You are an evaluation judge for MailAgent technical Q&A.
Score the candidate answer against the gold criteria only.
Respond with valid JSON only, no markdown fences:
{
  "accuracy": 0-3,
  "hallucination": true|false,
  "completeness": 0-2,
  "reasoning": 1-5,
  "notes": "short"
}
accuracy: 0 wrong, 1 major gaps, 2 minor gaps, 3 fully correct vs gold.
hallucination: true if asserts facts not in gold and not reasonably implied.
completeness: 0 misses question, 1 partial, 2 full.`;

/**
 * @param {{ question: string, gold: string[], answer: string }} input
 */
export async function judgeAnswer({ question, gold, answer }) {
  const { judgeModel } = llmConfig();
  const user = `Question: ${question}

Gold criteria (ground truth bullets):
${gold.map((g, i) => `${i + 1}. ${g}`).join("\n")}

Candidate answer:
${answer}`;

  const result = await chatCompletion({
    model: judgeModel,
    messages: [
      { role: "system", content: SYSTEM_JUDGE },
      { role: "user", content: user },
    ],
    temperature: 0,
  });

  let parsed;
  try {
    const raw = result.content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      accuracy: null,
      hallucination: null,
      completeness: null,
      reasoning: null,
      notes: `judge_parse_error: ${result.content.slice(0, 200)}`,
    };
  }

  return {
    ...parsed,
    judge_latency_ms: result.latency_ms,
    judge_tokens_in: result.tokens_in,
    judge_tokens_out: result.tokens_out,
  };
}
