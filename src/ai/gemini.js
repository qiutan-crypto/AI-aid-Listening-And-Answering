// Gemini：通话中流式生成英文提示；通话后生成中文解释（JSON）。
import { ApiError, GoogleGenAI } from "@google/genai";

// flash 系列速度快，适合实时对话；可以在 .env 里用 GEMINI_MODEL 换别的模型
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
// 思考越少出结果越快：minimal / low / medium / high；填 off 表示不设置（用模型默认，通常思考得多、又慢又贵）
// 通话中默认 minimal（最快）；通话后的中文解释不赶时间，用 low
const LIVE_THINKING = (process.env.GEMINI_THINKING || "minimal").toUpperCase();
const REVIEW_THINKING = "LOW";
/** 实际使用的思考档位。模型不支持某一档时自动换下一档：MINIMAL → LOW → 不设置 */
const levels = { live: LIVE_THINKING, review: REVIEW_THINKING };
const FALLBACK = { MINIMAL: "LOW" };

let ai;
function getClient() {
  ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

export const name = "Gemini";

export function enabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function buildConfig({ system, signal, kind, extra }) {
  const config = { systemInstruction: system, abortSignal: signal, ...extra };
  const level = levels[kind];
  if (level && level !== "OFF") config.thinkingConfig = { thinkingLevel: level };
  return config;
}

/** 模型不支持设置的思考档位时，换下一档再试（只处理思考相关的 400 错误） */
async function withThinkingFallback(kind, run, canRetry) {
  for (;;) {
    try {
      return await run();
    } catch (err) {
      const thinkingError = err instanceof ApiError && err.status === 400 && /thinking/i.test(err.message);
      if (!thinkingError || !canRetry() || levels[kind] === "OFF") throw err;
      const next = FALLBACK[levels[kind]] ?? "OFF";
      console.warn(`模型 ${MODEL} 不支持思考档位 ${levels[kind]}，改用 ${next === "OFF" ? "模型默认设置" : next}`);
      levels[kind] = next;
    }
  }
}

/** Gemini 返回的用量 → { input, output, thoughts, cached }（token 数） */
function toUsage(meta) {
  if (!meta) return null;
  return {
    input: meta.promptTokenCount ?? 0,
    output: meta.candidatesTokenCount ?? 0,
    thoughts: meta.thoughtsTokenCount ?? 0,
    cached: meta.cachedContentTokenCount ?? 0,
  };
}

export async function stream({ system, userMessage, onText, signal }) {
  let sentAny = false;
  let usage = null;
  await withThinkingFallback(
    "live",
    async () => {
      const response = await getClient().models.generateContentStream({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        // 包含思考用的 token，面试回答也比较长
        config: buildConfig({ system, signal, kind: "live", extra: { maxOutputTokens: 3000 } }),
      });
      for await (const chunk of response) {
        if (chunk.usageMetadata) usage = toUsage(chunk.usageMetadata);
        const text = chunk.text;
        if (text) {
          sentAny = true;
          onText(text);
        }
      }
    },
    () => !sentAny,
  );
  return usage;
}

/** 预热：先查一下模型信息，把网络连接建立好（不消耗 token） */
export async function warm() {
  await getClient().models.get({ model: MODEL });
}

/** 返回按 schema 解析好的 JSON 对象 */
export async function json({ system, userMessage, schema, signal }) {
  return withThinkingFallback(
    "review",
    async () => {
      const response = await getClient().models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        config: buildConfig({
          system,
          signal,
          kind: "review",
          extra: { maxOutputTokens: 16000, responseMimeType: "application/json", responseJsonSchema: schema },
        }),
      });
      return { data: JSON.parse(response.text ?? ""), usage: toUsage(response.usageMetadata) };
    },
    () => true,
  );
}

export function describeError(err) {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 400 && /api key/i.test(err.message)) return "Gemini API Key 无效，请检查 .env 里的 GEMINI_API_KEY";
  if (err.status === 401 || err.status === 403) return "Gemini API Key 无效或没有权限，请检查 .env 里的 GEMINI_API_KEY";
  if (err.status === 404) return `找不到 Gemini 模型「${MODEL}」，请检查 .env 里的 GEMINI_MODEL`;
  if (err.status === 429) return "Gemini 请求太频繁或额度用完了，稍等再试";
  return `Gemini 错误 (${err.status}): ${err.message}`;
}
