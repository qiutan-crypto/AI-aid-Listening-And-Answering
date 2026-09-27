// Claude：通话中流式生成英文提示；通话后生成中文解释（JSON）。没有填 GEMINI_API_KEY 时使用。
import Anthropic from "@anthropic-ai/sdk";

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

export async function stream({ system, userMessage, onText, signal }) {
  const s = getClient().beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: EFFORT },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    },
    { signal },
  );
  s.on("text", (delta) => onText(delta));
  const message = await s.finalMessage();
  if (message.stop_reason === "refusal") {
    onText("\n\n[AI 没有给出这条建议，请换个说法再试。]");
  }
  return toUsage(message.usage);
}

/** Claude 的思考 token 已经算在 output_tokens 里 */
function toUsage(u) {
  if (!u) return null;
  return { input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), output: u.output_tokens ?? 0, thoughts: 0 };
}

/** 预热：先查一下模型信息，把网络连接建立好（不消耗 token） */
export async function warm() {
  await getClient().models.retrieve(MODEL);
}

/** 返回按 schema 解析好的 JSON 对象 */
export async function json({ system, userMessage, schema, signal }) {
  const s = getClient().beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system: [{ type: "text", text: system }],
      messages: [{ role: "user", content: userMessage }],
    },
    { signal },
  );
  const message = await s.finalMessage();
  if (message.stop_reason === "refusal") throw new Error("AI 没有生成这部分解释，请再试一次");
  if (message.stop_reason === "max_tokens") throw new Error("对话太长，解释没写完，请再试一次");
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { data: JSON.parse(text), usage: toUsage(message.usage) };
}

export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Claude API Key 无效，请检查 .env 里的 ANTHROPIC_API_KEY";
  if (err instanceof Anthropic.RateLimitError) return "Claude 请求太频繁，稍等几秒再试";
  if (err instanceof Anthropic.APIConnectionError) return "连不上 Claude API，请检查网络";
  if (err instanceof Anthropic.APIError) return `Claude API 错误 (${err.status}): ${err.message}`;
  return null;
}
