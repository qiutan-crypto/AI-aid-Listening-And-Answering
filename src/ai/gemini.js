// Gemini：通话中流式生成英文提示；通话后生成中文解释（JSON）。
import { ApiError, GoogleGenAI } from "@google/genai";

// 通话中要的是「快」：默认用 flash-lite（首字最快）；通话后的中文解释不赶时间，用 flash。
// 可以在 .env 里用 GEMINI_MODEL（通话中）/ GEMINI_REVIEW_MODEL（回顾）换别的模型；
// 只填了 GEMINI_MODEL 时两处都用它（和旧版本一样）
const MODELS = {
  live: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
  review: process.env.GEMINI_REVIEW_MODEL || process.env.GEMINI_MODEL || "gemini-flash-latest",
};
// 思考越少出结果越快：minimal / low / medium / high；填 off 表示不设置（用模型默认，通常思考得多、又慢又贵）
// 通话中默认 minimal（最快）；通话后的中文解释不赶时间，用 low
const LIVE_THINKING = (process.env.GEMINI_THINKING || "minimal").toUpperCase();
const REVIEW_THINKING = "LOW";
/**
 * 实际使用的思考档位。模型不支持某一档时自动换下一档：
 * MINIMAL → NONE（thinkingBudget 0，较早的 2.5 系列模型用这个关掉思考）→ LOW → 不设置
 */
const levels = { live: LIVE_THINKING, review: REVIEW_THINKING };
const FALLBACK = { MINIMAL: "NONE", NONE: "LOW" };

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
  if (level === "NONE") config.thinkingConfig = { thinkingBudget: 0 };
  else if (level && level !== "OFF") config.thinkingConfig = { thinkingLevel: level };
  return config;
}

/** 模型不支持设置的思考档位时，换下一档再试（只处理思考相关的 400 错误） */
async function withThinkingFallback(kind, run, canRetry) {
  for (;;) {
    try {
      return await run();
    } catch (err) {
      const thinkingError = err instanceof ApiError && err.status === 400 && /thinking|budget/i.test(err.message);
      if (!thinkingError || !canRetry() || levels[kind] === "OFF") throw err;
      const next = FALLBACK[levels[kind]] ?? "OFF";
      const label = { OFF: "模型默认设置", NONE: "不思考（thinkingBudget 0）" }[next] ?? next;
      console.warn(`模型 ${MODELS[kind]} 不支持思考档位 ${levels[kind]}，改用 ${label}`);
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
        model: MODELS.live,
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

/**
 * 预热：发一个极短的请求，把网络连接建立好，同时试出模型支持的思考档位，
 * 免得第一条真正的提示还要多等一次失败重试（只用几个 token）
 */
export async function warm() {
  await withThinkingFallback(
    "live",
    () =>
      getClient().models.generateContent({
        model: MODELS.live,
        contents: [{ role: "user", parts: [{ text: "Say OK." }] }],
        config: buildConfig({ system: "Reply with one word.", kind: "live", extra: { maxOutputTokens: 16 } }),
      }),
    () => true,
  );
}

export function modelInfo() {
  return `${MODELS.live}（通话中，思考档位 ${levels.live}）/ ${MODELS.review}（回顾）`;
}

/** 返回按 schema 解析好的 JSON 对象 */
export async function json({ system, userMessage, schema, signal }) {
  return withThinkingFallback(
    "review",
    async () => {
      const response = await getClient().models.generateContent({
        model: MODELS.review,
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
  if (err.status === 404) return `找不到 Gemini 模型「${MODELS.live}」或「${MODELS.review}」，请检查 .env 里的 GEMINI_MODEL / GEMINI_REVIEW_MODEL`;
  if (err.status === 429) return "Gemini 请求太频繁或额度用完了，稍等再试";
  return `Gemini 错误 (${err.status}): ${err.message}`;
}
