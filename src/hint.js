// 生成「怎么回答」的提示：优先用 Gemini（填了 GEMINI_API_KEY），否则用 Claude。
import * as claude from "./ai/claude.js";
import * as gemini from "./ai/gemini.js";
import { buildUserMessage } from "./prompt.js";

const providers = [gemini, claude];

export function activeProvider() {
  return providers.find((p) => p.enabled()) ?? null;
}

/**
 * @param {object} opts
 * @param {string} [opts.context]
 * @param {{speaker: "me"|"them", text: string}[]} opts.transcript
 * @param {string} [opts.focus]
 * @param {(text: string) => void} opts.onText
 * @param {AbortSignal} [opts.signal]
 */
export async function streamHint({ context, transcript, focus, onText, signal }) {
  const provider = activeProvider();
  if (!provider) throw new Error("没有配置 AI 的 API Key，请在 .env 里填写 GEMINI_API_KEY 后重启");
  await provider.stream({ userMessage: buildUserMessage({ context, transcript, focus }), onText, signal });
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
