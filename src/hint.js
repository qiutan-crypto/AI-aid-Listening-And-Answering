// 生成「怎么回答」的提示和通话后的中文解释：优先用 Gemini（填了 GEMINI_API_KEY），否则用 Claude。
import * as claude from "./ai/claude.js";
import * as gemini from "./ai/gemini.js";
import { enabledDocs } from "./docs.js";
import { buildExplainMessage, buildSystemPrompt, buildUserMessage, EXPLAIN_SCHEMA, EXPLAIN_SYSTEM } from "./prompt.js";

const providers = [gemini, claude];

export function activeProvider() {
  return providers.find((p) => p.enabled()) ?? null;
}

/**
 * @param {object} opts
 * @param {string} [opts.context]
 * @param {{speaker: "me"|"them", text: string}[]} opts.transcript
 * @param {string} [opts.focus]
 * @param {"general"|"interview"} [opts.scene]
 * @param {(text: string) => void} opts.onText
 * @param {AbortSignal} [opts.signal]
 */
export async function streamHint({ context, transcript, focus, scene, onText, signal }) {
  const provider = activeProvider();
  if (!provider) throw new Error("没有配置 AI 的 API Key，请在 .env 里填写 GEMINI_API_KEY 后重启");
  // 资料放在 system prompt 里：内容不变时 AI 服务端可以缓存，后面的请求更快、更便宜
  const system = buildSystemPrompt({ scene: scene === "interview" ? "interview" : "general", docs: await enabledDocs() });
  await provider.stream({ system, userMessage: buildUserMessage({ context, transcript, focus }), onText, signal });
}

/**
 * 通话结束后：给每句「对方的话 + 当时的英文建议」生成中文意思、建议的中文翻译和关键词
 * @param {{scene?: string, items: {id: string, them: string, suggestions: string[]}[], signal?: AbortSignal}} opts
 */
export async function explainItems({ scene, items, signal }) {
  const provider = activeProvider();
  if (!provider) throw new Error("没有配置 AI 的 API Key，请在 .env 里填写 GEMINI_API_KEY 后重启");
  const result = await provider.json({
    system: EXPLAIN_SYSTEM,
    userMessage: buildExplainMessage({ scene, items }),
    schema: EXPLAIN_SCHEMA,
    signal,
  });
  return Array.isArray(result?.items) ? result.items : [];
}

export function describeError(err) {
  for (const p of providers) {
    const msg = p.describeError(err);
    if (msg) return msg;
  }
  if (err?.name === "AbortError") return "已取消";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(err?.message ?? "")) return "连不上 AI 服务，请检查网络";
  return err?.message || String(err);
}
