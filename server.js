import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { WebSocketServer } from "ws";
import { bridgeToDeepgram, deepgramEnabled } from "./src/deepgram.js";
import { streamHint } from "./src/hint.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
// 默认只监听本机，避免别人从局域网访问你的 API Key
const HOST = process.env.HOST || "127.0.0.1";

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(here, "public")));

app.get("/api/config", (_req, res) => {
  res.json({
    deepgram: deepgramEnabled(),
    claude: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  });
});

app.post("/api/hint", async (req, res) => {
  const { context, transcript, focus } = req.body ?? {};
  if (!Array.isArray(transcript)) {
    res.status(400).type("text/plain").send("transcript 必须是数组");
    return;
  }

  const controller = new AbortController();
  // 浏览器取消请求（例如对方又说了新的话）时，停止生成
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });

  try {
    await streamHint({
      context,
      transcript: transcript.slice(-30),
      focus,
      signal: controller.signal,
      onText: (t) => res.write(t),
    });
  } catch (err) {
    if (!controller.signal.aborted) {
      res.write(`\n\n[错误] ${describeError(err)}`);
      console.error("hint error:", err);
    }
  }
  res.end();
});

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Claude API Key 无效，请检查 .env 里的 ANTHROPIC_API_KEY";
  if (err instanceof Anthropic.RateLimitError) return "请求太频繁，稍等几秒再试";
  if (err instanceof Anthropic.APIConnectionError) return "连不上 Claude API，请检查网络";
  if (err instanceof Anthropic.APIError) return `Claude API 错误 (${err.status}): ${err.message}`;
  if (/authentication method/i.test(err?.message ?? "")) return "没有配置 Claude API Key，请在 .env 里填写 ANTHROPIC_API_KEY 后重启";
  return err?.message || String(err);
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/stt" });
wss.on("connection", (ws) => {
  if (!deepgramEnabled()) {
    ws.send(JSON.stringify({ type: "error", message: "服务器没有配置 DEEPGRAM_API_KEY" }));
    ws.close();
    return;
  }
  bridgeToDeepgram(ws);
});

server.listen(PORT, HOST, () => {
  console.log(`对话辅助已启动： http://localhost:${PORT}`);
  console.log(`  Claude:   ${process.env.ANTHROPIC_API_KEY ? "已配置" : "未配置 ANTHROPIC_API_KEY"}`);
  console.log(`  Deepgram: ${deepgramEnabled() ? "已配置" : "未配置（只能用浏览器自带识别）"}`);
});
