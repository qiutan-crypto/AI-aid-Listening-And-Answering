// Claude：根据对话记录生成文字提示（流式返回）。没有填 GEMINI_API_KEY 时使用。
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../prompt.js";

const MODEL = process.env.HINT_MODEL || "claude-opus-5";
// low = 最快出结果；需要更深入的建议可以在 .env 里改成 medium / high
const EFFORT = process.env.HINT_EFFORT || "low";

let client;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export const name = "Claude";

export function enabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function stream({ userMessage, onText, signal }) {
  const s = getClient().beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: EFFORT },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    },
    { signal },
  );
  s.on("text", (delta) => onText(delta));
  const message = await s.finalMessage();
  if (message.stop_reason === "refusal") {
    onText("\n\n[AI 没有给出这条建议，请换个说法再试。]");
  }
}

export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Claude API Key 无效，请检查 .env 里的 ANTHROPIC_API_KEY";
  if (err instanceof Anthropic.RateLimitError) return "Claude 请求太频繁，稍等几秒再试";
  if (err instanceof Anthropic.APIConnectionError) return "连不上 Claude API，请检查网络";
  if (err instanceof Anthropic.APIError) return `Claude API 错误 (${err.status}): ${err.message}`;
  return null;
}
