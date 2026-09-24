import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { bridgeToDeepgram, deepgramEnabled } from "./src/deepgram.js";
import { activeProvider, describeError, streamHint } from "./src/hint.js";

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
    ai: activeProvider()?.name ?? null,
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
  const ai = activeProvider();
  console.log(`  AI 提示:  ${ai ? ai.name : "未配置（请在 .env 填写 GEMINI_API_KEY）"}`);
  console.log(`  Deepgram: ${deepgramEnabled() ? "已配置" : "未配置（只能用浏览器自带识别）"}`);
});
