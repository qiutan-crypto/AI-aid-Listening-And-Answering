"use strict";

// ---------- 页面元素 ----------
const $ = (id) => document.getElementById(id);
const els = {
  status: $("status"),
  startBtn: $("startBtn"),
  settingsBtn: $("settingsBtn"),
  settings: $("settings"),
  clearBtn: $("clearBtn"),
  fontUp: $("fontUp"),
  fontDown: $("fontDown"),
  engine: $("engine"),
  source: $("source"),
  meMic: $("meMic"),
  meMicRow: $("meMicRow"),
  autoHint: $("autoHint"),
  context: $("context"),
  engineNote: $("engineNote"),
  transcript: $("transcript"),
  hints: $("hints"),
  holdMe: $("holdMe"),
  hintNow: $("hintNow"),
  askForm: $("askForm"),
  askInput: $("askInput"),
  toast: $("toast"),
};

// ---------- 设置（保存在本机浏览器） ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("aid." + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("aid." + key, JSON.stringify(value));
    } catch {}
  },
};

let serverConfig = { deepgram: false, ai: null };
let fontSize = store.get("fontSize", 18);

function applyFontSize() {
  document.documentElement.style.setProperty("--font-size", fontSize + "px");
  store.set("fontSize", fontSize);
}

function loadSettings() {
  // 服务器配置了 Deepgram 就默认用它
  els.engine.value = store.get("engine", serverConfig.deepgram ? "deepgram" : "browser");
  els.source.value = store.get("source", "mic");
  els.meMic.checked = store.get("meMic", true);
  els.autoHint.checked = store.get("autoHint", true);
  els.context.value = store.get("context", "");
  applyFontSize();
  updateSettingsUi();
}

function saveSettings() {
  store.set("engine", els.engine.value);
  store.set("source", els.source.value);
  store.set("meMic", els.meMic.checked);
  store.set("autoHint", els.autoHint.checked);
  store.set("context", els.context.value);
}

function updateSettingsUi() {
  const deepgram = els.engine.value === "deepgram";
  const system = els.source.value === "system";
  els.meMicRow.hidden = !system;
  const notes = [];
  if (!deepgram && system) {
    notes.push("⚠️ 浏览器自带识别只能听麦克风。要听电脑里的声音，请把「语音识别」改成 Deepgram。");
  }
  if (deepgram && !serverConfig.deepgram) {
    notes.push("⚠️ 服务器还没有配置 DEEPGRAM_API_KEY（见 README）。");
  }
  if (!deepgram && !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    notes.push("⚠️ 这个浏览器不支持自带语音识别，请用 Chrome 或 Edge，或改用 Deepgram。");
  }
  if (!system) {
    notes.push("只有一个麦克风时，程序分不清是谁在说话：默认都算「对方」，你自己说话时请按住空格或下面的按钮。");
  } else if (system) {
    notes.push("开始后浏览器会让你选择要分享的屏幕/标签页，一定要勾选「分享系统音频 / 标签页音频」。戴耳机效果最好。");
  }
  if (!serverConfig.ai) notes.push("⚠️ 服务器还没有配置 GEMINI_API_KEY，AI 提示不能用。");
  els.engineNote.textContent = notes.join(" ");
}

for (const el of [els.engine, els.source, els.meMic, els.autoHint]) {
  el.addEventListener("change", () => {
    saveSettings();
    updateSettingsUi();
  });
}
els.context.addEventListener("input", saveSettings);
els.settingsBtn.addEventListener("click", () => (els.settings.hidden = !els.settings.hidden));
els.fontUp.addEventListener("click", () => { fontSize = Math.min(32, fontSize + 2); applyFontSize(); });
els.fontDown.addEventListener("click", () => { fontSize = Math.max(12, fontSize - 2); applyFontSize(); });

function toast(msg, ms = 5000) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (els.toast.hidden = true), ms);
}

function setStatus(text, cls) {
  els.status.textContent = text;
  els.status.className = "status " + (cls || "");
}

// ---------- 「我在说话」按住标记（单麦克风模式用） ----------
let meHeld = false;
let meHeldUntil = 0; // 松开后再多算 1 秒，识别结果常常晚一点到

function setMeHeld(on) {
  meHeld = on;
  if (!on) meHeldUntil = Date.now() + 1000;
  els.holdMe.classList.toggle("active", on);
}
function isMeSpeaking() {
  return meHeld || Date.now() < meHeldUntil;
}

els.holdMe.addEventListener("pointerdown", (e) => { e.preventDefault(); setMeHeld(true); });
for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
  els.holdMe.addEventListener(ev, () => meHeld && setMeHeld(false));
}
function typingInField(e) {
  const t = e.target;
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !typingInField(e)) {
    e.preventDefault();
    if (!e.repeat) setMeHeld(true);
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" && !typingInField(e)) setMeHeld(false);
});

// ---------- 字幕 ----------
/** @type {{id:number, speaker:"me"|"them", text:string, interim:string, closed:boolean, updated:number, el:HTMLElement}[]} */
let lines = [];
let lineSeq = 0;

function clearEmpty(container) {
  const empty = container.querySelector(".empty");
  if (empty) empty.remove();
}

function openLine(speaker) {
  const last = lines[lines.length - 1];
  // 同一个人接着说、并且停顿不超过 4 秒：接在同一行
  if (last && !last.closed && last.speaker === speaker && Date.now() - last.updated < 4000) return last;
  // 说话的人换了：把之前还开着的同一人的行关掉
  for (const l of lines) if (!l.closed && l.speaker === speaker) l.closed = true;
  clearEmpty(els.transcript);
  const el = document.createElement("p");
  el.className = "line " + speaker;
  els.transcript.appendChild(el);
  const line = { id: ++lineSeq, speaker, text: "", interim: "", closed: false, updated: Date.now(), el };
  lines.push(line);
  return line;
}

function renderLine(line) {
  line.el.replaceChildren();
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = line.speaker === "me" ? "我" : "对方";
  line.el.append(who, document.createTextNode(line.text));
  if (line.interim) {
    const i = document.createElement("span");
    i.className = "interim";
    i.textContent = (line.text ? " " : "") + line.interim;
    line.el.append(i);
  }
  const box = els.transcript;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

function closeLines(speaker) {
  for (const l of lines) {
    if (!l.closed && (!speaker || l.speaker === speaker)) {
      if (l.interim) {
        l.text = (l.text + " " + l.interim).trim();
        l.interim = "";
        renderLine(l);
      }
      l.closed = true;
    }
  }
}

/** 收到一段识别结果 */
function onSpeech(speaker, text, isFinal) {
  text = (text || "").trim();
  if (!text && !isFinal) return;
  const line = openLine(speaker);
  if (isFinal) {
    if (text) line.text = (line.text + " " + text).trim();
    line.interim = "";
  } else {
    line.interim = text;
  }
  if (!line.text && !line.interim) return;
  line.updated = Date.now();
  renderLine(line);

  if (speaker === "them") {
    if (isFinal && text) scheduleAutoHint();
    else if (!isFinal) postponeAutoHint();
  }
}

/** 一句话说完（Deepgram 的 utterance_end，或浏览器识别的句子结束） */
function onUtteranceEnd(speaker) {
  closeLines(speaker);
  if (speaker === "them") scheduleAutoHint(250);
}

els.clearBtn.addEventListener("click", () => {
  lines = [];
  els.transcript.innerHTML = '<p class="empty">已清空。</p>';
  els.hints.innerHTML = '<p class="empty">已清空。</p>';
  hinted = { id: 0, len: 0 };
});

// ---------- AI 提示 ----------
let hintTimer = null;
let hintAbort = null;
let hinted = { id: 0, len: 0 }; // 已经给过提示的那一行「对方」的话（行号 + 长度）

function scheduleAutoHint(delay = 1100) {
  if (!els.autoHint.checked) return;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => requestHint({ auto: true }), delay);
}
function postponeAutoHint() {
  // 对方还在说：推迟自动提示
  if (hintTimer) scheduleAutoHint();
}

function transcriptForAi() {
  return lines
    .map((l) => ({ speaker: l.speaker, text: (l.text + " " + l.interim).trim() }))
    .filter((l) => l.text)
    .slice(-30);
}

async function requestHint({ auto = false, focus = "" } = {}) {
  clearTimeout(hintTimer);
  hintTimer = null;

  const lastThem = [...lines].reverse().find((l) => l.speaker === "them" && (l.text || l.interim));
  if (auto) {
    // 这句话已经给过提示、之后也没有变长：不重复请求
    if (!lastThem || (lastThem.id === hinted.id && lastThem.text.length === hinted.len)) return;
  }
  if (!focus && !lastThem) {
    toast("还没有听到对方说话。可以在下面的输入框直接问 AI。");
    return;
  }
  if (lastThem && !focus) hinted = { id: lastThem.id, len: lastThem.text.length };

  // 对方又说了新的话：停止上一条还没生成完的提示
  if (hintAbort) hintAbort.abort();
  const controller = new AbortController();
  hintAbort = controller;

  const quote = focus ? "你问：" + focus : "对方：" + (lastThem.text + " " + lastThem.interim).trim();
  const card = createHintCard(quote);
  let raw = "";

  try {
    const res = await fetch("/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: els.context.value, transcript: transcriptForAi(), focus }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(await res.text() || "HTTP " + res.status);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      renderHint(card, raw);
    }
    raw += decoder.decode();
    renderHint(card, raw);
    card.classList.remove("pending");
  } catch (err) {
    card.classList.remove("pending");
    if (err.name === "AbortError") {
      if (!raw) card.remove();
      else card.querySelector(".card-head").textContent += "（已被新的提示替换）";
    } else {
      renderHint(card, raw + "\n[错误] " + err.message);
    }
  } finally {
    if (hintAbort === controller) hintAbort = null;
  }
}

function createHintCard(quote) {
  clearEmpty(els.hints);
  for (const c of els.hints.querySelectorAll(".card.latest")) c.classList.remove("latest");
  const card = document.createElement("article");
  card.className = "card latest pending";
  const head = document.createElement("div");
  head.className = "card-head";
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  head.textContent = time + " · " + quote;
  head.title = quote;
  const body = document.createElement("div");
  body.className = "card-body";
  card.append(head, body);
  els.hints.prepend(card);
  els.hints.scrollTop = 0;
  return card;
}

/** 把 AI 返回的文字排版：【标题】、英文建议（大字）、中文意思（小字） */
function renderHint(card, raw) {
  const body = card.querySelector(".card-body");
  body.replaceChildren();
  for (const rawLine of raw.split("\n")) {
    // 去掉模型偶尔加上的 Markdown 粗体符号
    const line = rawLine.replace(/\*\*/g, "").trim();
    if (!line) continue;
    const p = document.createElement("div");
    const sec = line.match(/^【(.+?)】\s*(.*)$/);
    if (sec) {
      p.className = "sec";
      p.textContent = sec[1];
      body.append(p);
      if (sec[2]) {
        const rest = document.createElement("div");
        rest.className = "plain";
        rest.textContent = sec[2];
        body.append(rest);
      }
      continue;
    }
    if (/^\d+[.、)]\s*/.test(line)) {
      p.className = "say";
      p.textContent = line.replace(/^\d+[.、)]\s*/, "");
    } else if (/^[（(].*[）)]$/.test(line)) {
      p.className = "zh";
      p.textContent = line.slice(1, -1);
    } else if (line.startsWith("[错误]")) {
      p.className = "err";
      p.textContent = line;
    } else {
      p.className = "plain";
      p.textContent = line;
    }
    body.append(p);
  }
}

els.hintNow.addEventListener("click", () => {
  closeLines();
  requestHint();
});
els.askForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.askInput.value.trim();
  if (!q) return;
  els.askInput.value = "";
  requestHint({ focus: q });
});

// ---------- 语音识别：浏览器自带（Web Speech API） ----------
class BrowserRecognizer {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw new Error("这个浏览器不支持自带语音识别，请用 Chrome 或 Edge，或改用 Deepgram。");
    this.rec = new SR();
    this.rec.lang = "en-US";
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.running = false;
    this.speaker = "them";

    this.rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          this.speaker = isMeSpeaking() ? "me" : "them";
          onSpeech(this.speaker, r[0].transcript, true);
        } else {
          interim += r[0].transcript;
        }
      }
      if (interim) {
        this.speaker = isMeSpeaking() ? "me" : "them";
        onSpeech(this.speaker, interim, false);
      }
    };
    this.rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed") {
        this.running = false;
        stopListening();
        toast("没有麦克风权限。请点地址栏左边的图标，允许使用麦克风。");
        return;
      }
      toast("语音识别出错：" + e.error);
    };
    // Chrome 一段时间后会自动停，自动重启
    this.rec.onend = () => {
      if (this.running) {
        try { this.rec.start(); } catch {}
      }
    };
  }
  async start() {
    this.running = true;
    this.rec.start();
  }
  stop() {
    this.running = false;
    try { this.rec.stop(); } catch {}
  }
}

// ---------- 语音识别：Deepgram（通过本机服务器转发） ----------
class DeepgramStream {
  /**
   * @param {MediaStream} media
   * @param {"me"|"them"|"auto"} speaker auto = 单麦克风模式，按住空格算「我」
   */
  constructor(media, speaker) {
    this.media = media;
    this.fixedSpeaker = speaker;
    this.currentSpeaker = speaker === "auto" ? "them" : speaker;
  }

  speakerNow() {
    return this.fixedSpeaker === "auto" ? (isMeSpeaking() ? "me" : "them") : this.fixedSpeaker;
  }

  async start() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws/stt`);
    this.ws.binaryType = "arraybuffer";
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "transcript") {
        // 一句话开始时决定是谁在说
        if (!this.inUtterance) this.currentSpeaker = this.speakerNow();
        else if (this.fixedSpeaker === "auto" && isMeSpeaking()) this.currentSpeaker = "me";
        this.inUtterance = true;
        onSpeech(this.currentSpeaker, msg.text, msg.isFinal);
        if (msg.speechFinal) this.endUtterance();
      } else if (msg.type === "utterance_end") {
        this.endUtterance();
      } else if (msg.type === "error") {
        toast(msg.message, 8000);
        setStatus("识别出错", "error");
      }
    };
    this.ws.onclose = () => {
      if (listening) {
        toast("与语音识别服务的连接断开了，请重新点「开始听」。", 8000);
        stopListening();
      }
    };

    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule("pcm-worklet.js");
    const src = this.ctx.createMediaStreamSource(this.media);
    this.node = new AudioWorkletNode(this.ctx, "pcm-downsampler");
    this.node.port.onmessage = (ev) => {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(ev.data);
    };
    src.connect(this.node);
    // 不连到扬声器，避免回声；有些浏览器要求节点连接到 destination 才会运行，用静音增益
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(this.ctx.destination);
  }

  endUtterance() {
    if (!this.inUtterance) return;
    this.inUtterance = false;
    onUtteranceEnd(this.currentSpeaker);
  }

  stop() {
    try { this.ws?.close(); } catch {}
    try { this.ctx?.close(); } catch {}
  }
}

// ---------- 开始 / 停止 ----------
let listening = false;
let recognizers = [];
let mediaStreams = [];

async function getMic() {
  const s = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  mediaStreams.push(s);
  return s;
}

async function getSystemAudio() {
  const s = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: "include",
  });
  mediaStreams.push(s);
  const audio = s.getAudioTracks();
  if (audio.length === 0) {
    throw new Error("没有拿到电脑声音。请重新开始，并在分享窗口里勾选「分享系统音频 / 标签页音频」。");
  }
  // 用户在浏览器里点了「停止分享」
  audio[0].addEventListener("ended", () => listening && stopListening());
  return new MediaStream(audio);
}

async function startListening() {
  saveSettings();
  const engine = els.engine.value;
  const source = els.source.value;
  setStatus("正在启动…");
  try {
    if (engine === "browser") {
      if (source === "system") {
        throw new Error("浏览器自带识别只能听麦克风。要听电脑声音，请在「设置」里把语音识别改成 Deepgram。");
      }
      recognizers.push(new BrowserRecognizer());
    } else {
      if (!serverConfig.deepgram) throw new Error("服务器没有配置 DEEPGRAM_API_KEY，请看 README，或改用浏览器自带识别。");
      if (source === "system") {
        recognizers.push(new DeepgramStream(await getSystemAudio(), "them"));
        if (els.meMic.checked) recognizers.push(new DeepgramStream(await getMic(), "me"));
      } else {
        recognizers.push(new DeepgramStream(await getMic(), "auto"));
      }
    }
    for (const r of recognizers) await r.start();
    listening = true;
    els.startBtn.textContent = "■ 停止";
    els.startBtn.classList.add("running");
    setStatus("正在听", "live");
    els.settings.hidden = true;
  } catch (err) {
    stopListening();
    const msg = err.name === "NotAllowedError" ? "没有拿到麦克风或屏幕共享的权限。" : err.message;
    setStatus("未开始", "error");
    toast(msg, 8000);
  }
}

function stopListening() {
  listening = false;
  for (const r of recognizers) r.stop();
  recognizers = [];
  for (const s of mediaStreams) for (const t of s.getTracks()) t.stop();
  mediaStreams = [];
  closeLines();
  els.startBtn.textContent = "▶ 开始听";
  els.startBtn.classList.remove("running");
  if (!els.status.classList.contains("error")) setStatus("已停止");
}

els.startBtn.addEventListener("click", () => (listening ? stopListening() : startListening()));

// ---------- 初始化 ----------
fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => { serverConfig = cfg; })
  .catch(() => toast("连不上本机服务器，请确认已经运行 npm start。"))
  .finally(() => {
    loadSettings();
    if (!els.context.value) els.settings.hidden = false;
  });
