import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { bridgeToDeepgram, deepgramEnabled } from "./src/deepgram.js";
import { addDoc, deleteDoc, DocError, listDocs, MAX_TOTAL_CHARS, updateDoc } from "./src/docs.js";
import { activeProvider, describeError, explainItems, streamHint, warmUp } from "./src/hint.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
// 默认只监听本机，避免别人从局域网访问你的 API Key
const HOST = process.env.HOST || "127.0.0.1";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(here, "public")));

app.get("/api/config", (_req, res) => {
  res.json({
    deepgram: deepgramEnabled(),
    ai: activeProvider()?.name ?? null,
  });
});

app.post("/api/hint", async (req, res) => {
  const { context, transcript, focus, scene } = req.body ?? {};
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

  // 在终端里显示 AI 用了多久：「首字」越短，提示出来得越快
  const t0 = Date.now();
  let firstAt = 0;
  try {
    await streamHint({
      context,
      transcript: transcript.slice(-30),
      focus,
      scene,
      signal: controller.signal,
      onText: (t) => {
        if (!firstAt) firstAt = Date.now();
        res.write(t);
      },
    });
    if (firstAt) console.log(`[提示] AI 首字 ${((firstAt - t0) / 1000).toFixed(1)} 秒，写完 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  } catch (err) {
    if (!controller.signal.aborted) {
      res.write(`\n\n[错误] ${describeError(err)}`);
      console.error("hint error:", err);
    }
  }
  res.end();
});

// 点「开始听」时预热到 AI 服务的连接
app.post("/api/warmup", async (_req, res) => {
  try {
    await warmUp();
  } catch (err) {
    console.warn("预热 AI 连接失败（不影响使用）：", describeError(err));
  }
  res.json({ ok: true });
});

// 通话结束后的回顾：一次最多解释 20 句，前端会分批发
app.post("/api/explain", async (req, res) => {
  const { scene, items } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    res.status(400).json({ error: "items 必须是 1~20 条" });
    return;
  }
  const clean = items.map((it) => ({
    id: String(it?.id ?? ""),
    them: String(it?.them ?? "").slice(0, 4000),
    suggestions: (Array.isArray(it?.suggestions) ? it.suggestions : []).map((x) => String(x).slice(0, 1000)).slice(0, 10),
  }));
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  try {
    res.json({ items: await explainItems({ scene, items: clean, signal: controller.signal }) });
  } catch (err) {
    if (controller.signal.aborted) return;
    console.error("explain error:", err);
    res.status(502).json({ error: describeError(err) });
  }
});

// ---------- 我的资料 ----------
function docRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: err.message });
      } else {
        console.error("docs error:", err);
        res.status(500).json({ error: "处理资料时出错：" + (err?.message || err) });
      }
    }
  };
}

app.get("/api/docs", docRoute(async (_req, res) => {
  res.json({ docs: await listDocs(), maxTotalChars: MAX_TOTAL_CHARS });
}));

// 上传文件：请求体是文件原始内容，文件名放在 ?name= 里；粘贴文字：JSON {name, text}
app.post(
  "/api/docs",
  express.raw({ type: (req) => !req.headers["content-type"]?.startsWith("application/json"), limit: "20mb" }),
  docRoute(async (req, res) => {
    const doc = Buffer.isBuffer(req.body)
      ? await addDoc({ name: String(req.query.name || ""), buf: req.body })
      : await addDoc({ name: req.body?.name, text: String(req.body?.text ?? "") });
    res.json({ doc });
  }),
);

app.patch("/api/docs/:id", docRoute(async (req, res) => {
  await updateDoc(req.params.id, { enabled: req.body?.enabled });
  res.json({ ok: true });
}));

app.delete("/api/docs/:id", docRoute(async (req, res) => {
  await deleteDoc(req.params.id);
  res.json({ ok: true });
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/stt" });
wss.on("connection", (ws, req) => {
  if (!deepgramEnabled()) {
    ws.send(JSON.stringify({ type: "error", message: "服务器没有配置 DEEPGRAM_API_KEY" }));
    ws.close();
    return;
  }
  const query = new URL(req.url, "http://localhost").searchParams;
  bridgeToDeepgram(ws, { diarize: query.get("diarize") === "1" });
});

// 端口被占用等启动错误（WebSocketServer 会把同一个错误再转发一次，两处都要接住）
function onListenError(err) {
  if (err.code === "EADDRINUSE") {
    console.error(`\n端口 ${PORT} 已经被别的程序占用了。`);
    console.error("请打开 .env 文件（Windows 用记事本，Mac 用「文本编辑」），加一行 PORT=3001（或其它没被占用的数字），保存后重新启动。\n");
  } else {
    console.error("服务器启动失败：", err);
  }
  process.exit(1);
}
server.on("error", onListenError);
wss.on("error", onListenError);

server.listen(PORT, HOST, () => {
  console.log(`对话辅助已启动： http://localhost:${PORT}`);
  const ai = activeProvider();
  console.log(`  AI 提示:  ${ai ? ai.name : "未配置（请在 .env 填写 GEMINI_API_KEY）"}`);
  console.log(`  Deepgram: ${deepgramEnabled() ? "已配置" : "未配置（只能用浏览器自带识别）"}`);
});
