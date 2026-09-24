// 把浏览器发来的音频（16kHz 16bit PCM）转发给 Deepgram 实时语音识别，
// 再把识别结果转成简单的 JSON 发回浏览器。API Key 只留在服务器端。
import WebSocket from "ws";

const DEEPGRAM_URL = "wss://api.deepgram.com/v1/listen";

export function deepgramEnabled() {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

/** @param {WebSocket} browser */
export function bridgeToDeepgram(browser) {
  const params = new URLSearchParams({
    model: process.env.DEEPGRAM_MODEL || "nova-3",
    language: process.env.DEEPGRAM_LANGUAGE || "en",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
    smart_format: "true",
    punctuate: "true",
    endpointing: "300",
    utterance_end_ms: "1200",
  });

  const upstream = new WebSocket(`${DEEPGRAM_URL}?${params}`, {
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
  });

  const pending = [];
  const sendToBrowser = (obj) => {
    if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify(obj));
  };

  // Deepgram 在 10 秒没收到音频时会断开，安静时发 KeepAlive
  const keepAlive = setInterval(() => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(JSON.stringify({ type: "KeepAlive" }));
    }
  }, 5000);

  upstream.on("open", () => {
    for (const chunk of pending.splice(0)) upstream.send(chunk);
    sendToBrowser({ type: "ready" });
  });

  upstream.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "Results") {
      const text = msg.channel?.alternatives?.[0]?.transcript ?? "";
      sendToBrowser({
        type: "transcript",
        text,
        isFinal: Boolean(msg.is_final),
        speechFinal: Boolean(msg.speech_final),
      });
    } else if (msg.type === "UtteranceEnd") {
      sendToBrowser({ type: "utterance_end" });
    }
  });

  upstream.on("unexpected-response", (_req, res) => {
    sendToBrowser({ type: "error", message: `Deepgram 连接失败 (HTTP ${res.statusCode})，请检查 DEEPGRAM_API_KEY` });
    browser.close();
  });
  upstream.on("error", (err) => {
    sendToBrowser({ type: "error", message: `Deepgram 错误: ${err.message}` });
  });
  upstream.on("close", () => {
    clearInterval(keepAlive);
    if (browser.readyState === WebSocket.OPEN) browser.close();
  });

  browser.on("message", (data, isBinary) => {
    if (!isBinary) return;
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
    else if (upstream.readyState === WebSocket.CONNECTING) pending.push(data);
  });

  browser.on("close", () => {
    clearInterval(keepAlive);
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(JSON.stringify({ type: "CloseStream" }));
      upstream.close();
    } else if (upstream.readyState === WebSocket.CONNECTING) {
      upstream.terminate();
    }
  });
}
