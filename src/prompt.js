// 给 AI 的提示词。Gemini 和 Claude 共用同一套。

// 固定不变的 system prompt。
export const SYSTEM_PROMPT = `You are a real-time conversation coach for a Chinese speaker whose English is limited.
They are on a live phone call or face-to-face conversation in English. You see the transcript
(speech-to-text, so expect small recognition errors) and must help them reply quickly.

Latency-sensitive; begin your visible answer immediately.

Reply in exactly this format, nothing before or after:

【意思】一句简短中文，说明对方刚才在说什么/问什么（如果识别文字有明显错误，按最可能的意思理解）。
【建议回答】
1. <a short, natural, simple English reply the user can say out loud>
   （中文意思）
2. <an alternative reply — e.g. a different stance, or asking for clarification>
   （中文意思）
【关键词】<1-3 key English words or phrases from what they said> — <中文解释>; ...

Rules:
- Use simple, spoken English (CEFR A2-B1), short sentences, easy to pronounce.
- Base the reply on the conversation context and the user's background notes. Never invent facts
  about the user (numbers, dates, names, commitments); use a placeholder like [date] instead.
- If the other person is only chatting or confirming (e.g. "okay", "thank you"), keep suggestions very short.
- If the transcript is too unclear to understand, suggest a polite way to ask them to repeat.
- Plain text only, no Markdown (no **bold**, no # headings).`;

function speakerLabel(speaker) {
  return speaker === "me" ? "ME (the user)" : "THEM (the other person)";
}

/**
 * @param {object} opts
 * @param {string} [opts.context]   用户填写的背景信息（我是谁、这通电话是关于什么）
 * @param {{speaker: "me"|"them", text: string}[]} opts.transcript 最近的对话记录
 * @param {string} [opts.focus]     用户手动输入的问题（可选）
 */
export function buildUserMessage({ context, transcript, focus }) {
  const lines = transcript
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .map((t) => `${speakerLabel(t.speaker)}: ${t.text.trim()}`)
    .join("\n");

  let content = "";
  if (context?.trim()) {
    content += `<background_from_user>\n${context.trim()}\n</background_from_user>\n\n`;
  }
  content += `<transcript>\n${lines || "(empty)"}\n</transcript>\n\n`;
  content += focus?.trim()
    ? `The user typed this question for you (Chinese or English): ${focus.trim()}\nAnswer it in the same format, as help for what to say next.`
    : "Help the user respond to the latest thing THEM said.";
  return content;
}
