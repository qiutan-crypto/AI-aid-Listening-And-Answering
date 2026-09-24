// Gemini：通话中流式生成英文提示；通话后生成中文解释（JSON）。
import { ApiError, GoogleGenAI } from "@google/genai";

// flash 系列速度快，适合实时对话；可以在 .env 里用 GEMINI_MODEL 换别的模型
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
// 思考越少出结果越快：minimal / low / medium / high；填 off 表示不设置
// 通话中默认 minimal（最快）；通话后的中文解释不赶时间，用 low
const LIVE_THINKING = (process.env.GEMINI_THINKING || "minimal").toUpperCase();
const REVIEW_THINKING = "LOW";
// 模型不接受 thinkingLevel 时记下来，以后不再设置
let thinkingSupported = true;

let ai;
function getClient() {
  ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

export const name = "Gemini";

export function enabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function buildConfig({ system, signal, level, extra }) {
  const config = { systemInstruction: system, abortSignal: signal, ...extra };
  if (thinkingSupported && level !== "OFF") config.thinkingConfig = { thinkingLevel: level };
  return config;
}

/** 有的模型不支持 thinkingLevel：去掉这个设置再试一次 */
async function withThinkingFallback(run, canRetry) {
  try {
    return await run();
  } catch (err) {
    if (thinkingSupported && canRetry() && err instanceof ApiError && err.status === 400) {
      console.warn(`模型 ${MODEL} 不接受 thinkingLevel，改为不设置：`, err.message);
      thinkingSupported = false;
      return await run();
    }
    throw err;
  }
}

export async function stream({ system, userMessage, onText, signal }) {
  let sentAny = false;
  await withThinkingFallback(
    async () => {
      const response = await getClient().models.generateContentStream({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        // 包含思考用的 token，面试回答也比较长
        config: buildConfig({ system, signal, level: LIVE_THINKING, extra: { maxOutputTokens: 3000 } }),
      });
      for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
          sentAny = true;
          onText(text);
        }
      }
    },
    () => !sentAny,
  );
}

/** 返回按 schema 解析好的 JSON 对象 */
export async function json({ system, userMessage, schema, signal }) {
  return withThinkingFallback(
    async () => {
      const response = await getClient().models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        config: buildConfig({
          system,
          signal,
          level: REVIEW_THINKING,
          extra: { maxOutputTokens: 16000, responseMimeType: "application/json", responseJsonSchema: schema },
        }),
      });
      return JSON.parse(response.text ?? "");
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
