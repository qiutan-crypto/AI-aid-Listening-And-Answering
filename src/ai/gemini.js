// Gemini：根据对话记录生成文字提示（流式返回）。
import { ApiError, GoogleGenAI } from "@google/genai";

// flash 系列速度快，适合实时对话；可以在 .env 里用 GEMINI_MODEL 换别的模型
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
// 思考越少出结果越快：minimal / low / medium / high；填 off 表示不设置
let thinkingLevel = (process.env.GEMINI_THINKING || "low").toUpperCase();

let ai;
function getClient() {
  ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

export const name = "Gemini";

export function enabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function stream({ system, userMessage, onText, signal }) {
  let sentAny = false;
  const run = async () => {
    const config = {
      systemInstruction: system,
      maxOutputTokens: 4000, // 包含思考用的 token，面试回答也比较长
      abortSignal: signal,
    };
    if (thinkingLevel !== "OFF") config.thinkingConfig = { thinkingLevel };

    const response = await getClient().models.generateContentStream({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      config,
    });
    for await (const chunk of response) {
      const text = chunk.text;
      if (text) {
        sentAny = true;
        onText(text);
      }
    }
  };

  try {
    await run();
  } catch (err) {
    // 有的模型不支持 thinkingLevel：去掉这个设置再试一次，以后也不再设置
    if (!sentAny && thinkingLevel !== "OFF" && err instanceof ApiError && err.status === 400) {
      console.warn(`模型 ${MODEL} 不接受 thinkingLevel=${thinkingLevel}，改为不设置：`, err.message);
      thinkingLevel = "OFF";
      await run();
      return;
    }
    throw err;
  }
}

export function describeError(err) {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 400 && /api key/i.test(err.message)) return "Gemini API Key 无效，请检查 .env 里的 GEMINI_API_KEY";
  if (err.status === 401 || err.status === 403) return "Gemini API Key 无效或没有权限，请检查 .env 里的 GEMINI_API_KEY";
  if (err.status === 404) return `找不到 Gemini 模型「${MODEL}」，请检查 .env 里的 GEMINI_MODEL`;
  if (err.status === 429) return "Gemini 请求太频繁或额度用完了，稍等再试";
  return `Gemini 错误 (${err.status}): ${err.message}`;
}
