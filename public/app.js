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
  scene: $("scene"),
  diarizeStatus: $("diarizeStatus"),
  speakerMode: $("speakerMode"),
  speakerModeRow: $("speakerModeRow"),
  swapBtn: $("swapBtn"),
  recordAudio: $("recordAudio"),
  downloadAudioBtn: $("downloadAudioBtn"),
  panes: $("panes"),
  review: $("review"),
  reviewBtn: $("reviewBtn"),
  reviewList: $("reviewList"),
  reviewProgress: $("reviewProgress"),
  explainBtn: $("explainBtn"),
  downloadBtn: $("downloadBtn"),
  backBtn: $("backBtn"),
  micDevice: $("micDevice"),
  micRefresh: $("micRefresh"),
  meter: $("meter"),
  sceneBadge: $("sceneBadge"),
  docList: $("docList"),
  docFile: $("docFile"),
  pasteToggle: $("pasteToggle"),
  pasteBox: $("pasteBox"),
  pasteName: $("pasteName"),
  pasteText: $("pasteText"),
  pasteSave: $("pasteSave"),
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
  hintState: $("hintState"),
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
  els.scene.value = store.get("scene", "general");
  els.engine.value = store.get("engine", serverConfig.deepgram ? "deepgram" : "browser");
  els.source.value = store.get("source", "mic");
  els.meMic.checked = store.get("meMic", true);
  els.autoHint.checked = store.get("autoHint", true);
  // 新的存储名：旧版本默认是「手动」并且已经存过，换个名字让新的默认「智能」生效
  els.speakerMode.value = store.get("speakerMode2", "auto");
  els.recordAudio.checked = store.get("recordAudio", true);
  els.context.value = store.get("context", "");
  applyFontSize();
  updateSettingsUi();
}

function saveSettings() {
  store.set("scene", els.scene.value);
  store.set("micDevice", els.micDevice.value);
  store.set("engine", els.engine.value);
  store.set("source", els.source.value);
  store.set("meMic", els.meMic.checked);
  store.set("autoHint", els.autoHint.checked);
  store.set("speakerMode2", els.speakerMode.value);
  store.set("recordAudio", els.recordAudio.checked);
  store.set("context", els.context.value);
}

function updateSettingsUi() {
  updateSceneBadge();
  const deepgram = els.engine.value === "deepgram";
  const system = els.source.value === "system";
  els.meMicRow.hidden = !system;
  // 电脑声音模式下「对方」「我」本来就是两路声音，不用区分
  els.speakerModeRow.hidden = system;
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
  if (!system && els.speakerMode.value === "auto") {
    notes.push(
      deepgram
        ? "智能区分说话人：程序听声音的大小和音色（对着麦克风说话的你 vs 手机外放 / 远处的对方），再加上 Deepgram 的自动区分；你照着 AI 提示念的话也会被认出来是「我」。刚开始需要几句话来学习，开始后先按住空格说一句英文会学得更快。认反了点字幕下面的「⇄ 对调」。"
        : "⚠️ 自动区分说话人需要 Deepgram，浏览器自带识别只能用手动方式（按住空格）。",
    );
  }
  if (!deepgram) notes.push("浏览器自带识别总是使用 Mac 系统设置里的默认麦克风，上面的麦克风选择只对 Deepgram 有效。");
  if (!system && !(deepgram && els.speakerMode.value === "auto")) {
    notes.push("只有一个麦克风时，程序分不清是谁在说话：默认都算「对方」，你自己说话时请按住空格或下面的按钮。");
  } else if (system) {
    notes.push("开始后浏览器会让你选择要分享的屏幕/标签页，一定要勾选「分享系统音频 / 标签页音频」。戴耳机效果最好。");
  }
  if (!serverConfig.ai) notes.push("⚠️ 服务器还没有配置 GEMINI_API_KEY，AI 提示不能用。");
  els.engineNote.textContent = notes.join(" ");
}

for (const el of [els.scene, els.speakerMode, els.micDevice, els.engine, els.source, els.meMic, els.autoHint, els.recordAudio]) {
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
let meHeldUntil = 0; // 浏览器自带识别没有单词时间：松开后再多算一小会儿，识别结果常常晚一点到
/** 每次按住的时间段 [按下, 松开]（performance.now 毫秒）；Deepgram 按单词时间对照这个表判断是谁在说 */
const holdIntervals = [];

function setMeHeld(on) {
  if (on === meHeld) return;
  meHeld = on;
  const now = performance.now();
  if (on) holdIntervals.push([now, Infinity]);
  else {
    const last = holdIntervals[holdIntervals.length - 1];
    if (last) last[1] = now;
    meHeldUntil = Date.now() + 600;
  }
  els.holdMe.classList.toggle("active", on);
}
function isMeSpeaking() {
  return meHeld || Date.now() < meHeldUntil;
}
/** 这个时间点（performance.now 毫秒）有没有按住空格；前后各留一点余量 */
function wasMeAt(t) {
  for (let i = holdIntervals.length - 1; i >= 0; i--) {
    const [down, up] = holdIntervals[i];
    if (t >= down - 150 && t <= up + 150) return true;
    if (up < t - 120000) break;
  }
  return false;
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
// 自动区分说话人认反了：以后的话对调，已经自动标过的字幕也一起改过来
els.swapBtn.addEventListener("click", () => {
  const streams = recognizers.filter((r) => r instanceof DeepgramStream && r.smart);
  if (!streams.length) return;
  for (const r of streams) r.swap();
  for (const l of lines) {
    if (!l.autoLabeled) continue;
    l.speaker = l.speaker === "me" ? "them" : "me";
    l.el.className = "line " + l.speaker;
    renderLine(l);
  }
  toast("已对调「我」和「对方」。");
});

// 按着空格时切到别的窗口，浏览器收不到「松开」：当作已经松开，免得一直算成「我」
window.addEventListener("blur", () => meHeld && setMeHeld(false));
document.addEventListener("visibilitychange", () => document.hidden && meHeld && setMeHeld(false));

// ---------- 字幕 ----------
/** @type {{id:number, speaker:"me"|"them", text:string, interim:string, closed:boolean, updated:number, audio:null|{trackId:number,start:number,end:number}, el:HTMLElement}[]} */
let lines = [];
let lineSeq = 0;

function clearEmpty(container) {
  const empty = container.querySelector(".empty");
  if (empty) empty.remove();
}

function openLine(speaker) {
  // 同一个人接着说、并且停顿不超过 4 秒：接在同一行。
  // 中间如果只有另一方「还没确认」的临时文字（同一段识别里两个人的话被切开时会这样），也接在同一行。
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.speaker === speaker) {
      if (!l.closed && Date.now() - l.updated < 4000) return l;
      break;
    }
    if (l.text) break;
  }
  // 说话的人换了：把之前还开着的同一人的行关掉
  for (const l of lines) if (!l.closed && l.speaker === speaker) l.closed = true;
  clearEmpty(els.transcript);
  const el = document.createElement("p");
  el.className = "line " + speaker;
  els.transcript.appendChild(el);
  const line = { id: ++lineSeq, speaker, text: "", interim: "", closed: false, updated: Date.now(), audio: null, el };
  lines.push(line);
  return line;
}

function renderLine(line) {
  line.el.replaceChildren();
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = line.speaker === "me" ? "我" : "对方";
  line.el.append(who);
  if (line.sp != null) {
    // 自动区分说话人时，显示 Deepgram 听出来的是第几个声音，方便看它分得对不对
    const sp = document.createElement("span");
    sp.className = "sp";
    sp.textContent = "声音" + (line.sp + 1);
    line.el.append(sp);
  }
  line.el.append(document.createTextNode(line.text));
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

/** 清掉某一方还没确认的临时文字 */
function clearInterim(speaker) {
  for (const l of [...lines]) {
    if (l.closed || l.speaker !== speaker || !l.interim) continue;
    l.interim = "";
    if (l.text) renderLine(l);
    else {
      // 这一行只有临时文字，清掉后就是空行：直接去掉
      l.el.remove();
      lines.splice(lines.indexOf(l), 1);
    }
  }
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

/**
 * 收到一段识别结果
 * @param {{trackId:number, start:number, end:number}} [audio] 这段话在录音里的位置（秒）
 */
function onSpeech(speaker, text, isFinal, audio) {
  text = (text || "").trim();
  // 安静的时候 Deepgram 也会发来空结果：没有文字就不新建一行
  if (!text) {
    const last = lines[lines.length - 1];
    if (isFinal && last && !last.closed && last.speaker === speaker && last.interim) {
      last.interim = "";
      renderLine(last);
    }
    return;
  }
  const line = openLine(speaker);
  // 这一行在这条声音里的时间范围（智能区分说话人回头重新判断时用）
  if (audio) line.span = line.span ? { start: Math.min(line.span.start, audio.start), end: Math.max(line.span.end, audio.end) } : { start: audio.start, end: audio.end };
  if (audio && recorder.has(audio.trackId)) {
    // 一行可能由好几段组成：录音范围取最早的开始到最晚的结束
    if (!line.audio || line.audio.trackId !== audio.trackId) line.audio = { ...audio };
    else {
      line.audio.start = Math.min(line.audio.start, audio.start);
      line.audio.end = Math.max(line.audio.end, audio.end);
    }
  }
  if (isFinal) {
    if (text) line.text = (line.text + " " + text).trim();
    line.interim = "";
  } else {
    line.interim = text;
  }
  if (!line.text && !line.interim) return line;
  line.updated = Date.now();
  renderLine(line);

  if (speaker === "them") {
    if (isFinal) onThemFinal();
    else onThemInterim(text);
  }
  return line;
}

/**
 * 一句话说完。hard = Deepgram 的 UtteranceEnd（安静了 1 秒多，基本可以确定说完了）；
 * 否则是 speech_final（只停顿了 0.3 秒，可能只是在想词）。
 */
function onUtteranceEnd(speaker, hard = false) {
  closeLines(speaker);
  if (speaker !== "them" || !els.autoHint.checked) return;
  const turn = currentTurn();
  // 停顿很短，但句子已经以 . ? ! 结尾：多半说完了，直接显示；否则再等一会儿
  if (hard || (turn && /[.?!]["')\]]*$/.test(turn.text))) revealHint();
  else armRevealFallback(600);
}

els.clearBtn.addEventListener("click", () => {
  lines = [];
  els.transcript.innerHTML = '<p class="empty">已清空。</p>';
  els.hints.innerHTML = '<p class="empty">已清空。</p>';
  hintLog = [];
  cardByTurn.clear();
  if (spec && !spec.card) spec.controller.abort();
  spec = null;
  showPrepState();
  explainCache.clear();
  player.stop();
  recorder.clear();
});

// ---------- AI 提示 ----------
// 像 voice agent 一样「抢跑」：对方说话时就在后台准备回答，但先不显示；
// 等对方说完（一轮结束），再把按完整内容准备好的那一条显示出来。
/**
 * 每一条显示出来的提示的记录，回顾时用
 * @type {{id:number, lineId:number|null, turnLineIds:number[], afterLineId:number, focus:string, raw:string, done:boolean, superseded:boolean, time:Date}[]}
 */
let hintLog = [];
let hintSeq = 0;
let prepareTimer = null;
let revealTimer = null;
let lastPrepareAt = 0;
/** 后台正在准备（或已经显示）的最新一条提示 */
let spec = null;
/** 一轮对方的话对应一张卡片（key = 这一轮第一行的 id） */
const cardByTurn = new Map();

function transcriptForAi() {
  return lines
    .map((l) => ({ speaker: l.speaker, text: (l.text + " " + l.interim).trim() }))
    .filter((l) => l.text)
    .slice(-30);
}

/** 当前这一轮对方的话：最后一句「我」之后的所有「对方」行 */
function currentTurn() {
  const them = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!(l.text + l.interim).trim()) continue;
    if (l.speaker === "me") break;
    them.unshift(l);
  }
  if (!them.length) return null;
  return { key: them[0].id, lines: them, text: them.map((l) => (l.text + " " + l.interim).trim()).join(" ") };
}

/** 对方确认了一段文字：马上在后台准备提示 */
function onThemFinal() {
  if (!els.autoHint.checked) return;
  clearTimeout(prepareTimer);
  prepareTimer = setTimeout(prepareHint, 60);
  // 浏览器自带识别没有「说完」信号；Deepgram 偶尔也会漏：安静一会儿就当说完了
  armRevealFallback();
}

/**
 * 对方还在说（临时文字）：像 voice agent 一样不等这句确认，就按已经听到的内容提前准备。
 * 对方说完时，确认的文字多半和最后一次临时文字一样，准备好的提示就能直接显示。
 */
function onThemInterim(text) {
  if (!els.autoHint.checked) return;
  if (revealTimer) armRevealFallback(); // 对方还在说：「说完」的判断往后推
  if (prepareTimer) return;
  const turn = currentTurn();
  if (!turn || wordsOf(turn.text).length < 3) return;
  // 问句说到问号多半就说完了：马上准备；否则最多每 0.7 秒按最新的文字重新准备一次
  const wait = /\?\s*$/.test(text) ? 0 : Math.max(0, 700 - (Date.now() - lastPrepareAt));
  prepareTimer = setTimeout(prepareHint, wait);
}

function armRevealFallback(delay = 1200) {
  clearTimeout(revealTimer);
  revealTimer = setTimeout(revealHint, delay);
}

/** 按现在的对话内容，在后台准备一条提示（不显示） */
function prepareHint() {
  clearTimeout(prepareTimer);
  prepareTimer = null;
  if (!currentTurn()) return null;
  const transcript = transcriptForAi();
  // 只比较单词：临时文字和确认后的文字常常只差标点、大小写，这时准备好的提示照样能用
  const sig = transcript.map((l) => l.speaker + ":" + wordsOf(l.text).join(" ")).join("\n");
  if (spec && spec.sig === sig && !spec.error) return spec;
  // 还没显示的旧准备作废；已经显示出来的让它写完，不打断
  if (spec && !spec.card) spec.controller.abort();
  spec = startHintRequest({ transcript, sig });
  lastPrepareAt = Date.now();
  showPrepState();
  return spec;
}

/** 对方说完了：把准备好的提示显示出来（没准备好就马上准备，边生成边显示） */
function revealHint() {
  clearTimeout(revealTimer);
  revealTimer = null;
  const turn = currentTurn();
  if (!turn) return;
  const s = prepareHint();
  if (!s || s.card) return; // 已经显示过同样内容的提示
  const quote = "对方：" + turn.text;
  const reuse = cardByTurn.get(turn.key);
  const card = reuse && reuse.isConnected ? reuseHintCard(reuse, quote) : createHintCard(quote);
  cardByTurn.set(turn.key, card);
  // 同一张卡片之前的提示（对方中途停顿过）不再是最新的了
  for (const h of hintLog) if (h.cardTurn === turn.key) h.superseded = true;
  attachCard(s, card, {
    lineId: turn.lines[turn.lines.length - 1].id,
    turnLineIds: turn.lines.map((l) => l.id),
    cardTurn: turn.key,
  });
}

/** 把一条提示接到卡片上：已经生成的内容立刻显示，之后的边生成边显示 */
function attachCard(s, card, info) {
  s.card = card;
  if (s === spec) showPrepState();
  s.revealAt = Date.now();
  card.dataset.owner = String(s.id);
  s.entry = {
    id: s.id,
    lineId: null,
    turnLineIds: [],
    afterLineId: lines.length ? lines[lines.length - 1].id : 0,
    focus: "",
    raw: s.raw,
    done: s.done,
    superseded: false,
    time: new Date(),
    ...info,
  };
  hintLog.push(s.entry);
  if (s.raw) {
    // 从「对方说完」到「提示出现」的时间：提前准备好了就是 0 秒
    setLatency(card, 0);
    renderHint(card, s.raw);
  }
  if (s.done || s.error) finishCard(s);
}

function finishCard(s) {
  if (!s.card || s.card.dataset.owner !== String(s.id)) return;
  if (s.error) renderHint(s.card, s.raw + "\n[错误] " + s.error);
  s.card.classList.remove("pending");
}

/** 发一个提示请求。返回的对象会不断更新：raw（已生成的文字）、done、error */
function startHintRequest({ transcript, sig, focus = "" }) {
  const s = { id: ++hintSeq, sig, raw: "", done: false, error: "", card: null, entry: null, controller: new AbortController() };
  (async () => {
    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: els.context.value, transcript, focus, scene: els.scene.value }),
        signal: s.controller.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || "HTTP " + res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const first = !s.raw;
        s.raw += decoder.decode(value, { stream: true });
        if (s.entry) s.entry.raw = s.raw;
        if (s.card && s.card.dataset.owner === String(s.id)) {
          if (first) setLatency(s.card, Date.now() - s.revealAt);
          renderHint(s.card, s.raw);
        }
      }
      s.raw += decoder.decode();
      s.done = true;
      if (s === spec) showPrepState();
      if (s.entry) Object.assign(s.entry, { raw: s.raw, done: true });
      if (s.card && s.card.dataset.owner === String(s.id)) renderHint(s.card, s.raw);
      finishCard(s);
    } catch (err) {
      if (err.name === "AbortError") return; // 后台准备被更新的内容取代了，本来就没显示
      s.error = err.message;
      if (s.entry) s.entry.raw = s.raw + "\n[错误] " + err.message;
      finishCard(s);
    }
  })();
  return s;
}

/** 提示栏上方的小字：AI 是不是已经在后台准备好了 */
function showPrepState() {
  const el = els.hintState;
  if (spec && !spec.card && !spec.error) {
    el.textContent = spec.done ? "✓ 已准备好，对方一说完就显示" : "⏳ 对方在说，AI 正在提前准备…";
  } else {
    el.textContent = "";
  }
}

/** 最近显示过的提示里的每一句（和每张卡片的全文），用来认出「我在照着提示念」 */
function recentSuggestions() {
  const out = [];
  const now = Date.now();
  for (let i = hintLog.length - 1; i >= 0 && i >= hintLog.length - 4; i--) {
    const h = hintLog[i];
    if (now - h.time.getTime() > 180000) break;
    const list = suggestionsOf(h.raw);
    for (const t of list) out.push(wordsOf(t));
    if (list.length > 1) out.push(wordsOf(list.join(" ")));
  }
  return out;
}

/** 在输入框里直接问 AI：马上显示 */
function askAi(focus) {
  const s = startHintRequest({ transcript: transcriptForAi(), sig: "", focus });
  attachCard(s, createHintCard("你问：" + focus), { focus });
}

/** 同一句话再次生成：把卡片移到最上面，旧内容先留着，新内容一到就替换 */
function reuseHintCard(card, quote) {
  for (const c of els.hints.querySelectorAll(".card.latest")) c.classList.remove("latest");
  card.classList.add("latest", "pending");
  card.querySelector(".card-head .q").textContent = hintTime() + " · " + quote;
  card.querySelector(".card-head").title = quote;
  card.querySelector(".lat").textContent = "";
  els.hints.prepend(card);
  els.hints.scrollTop = 0;
  return card;
}

function hintTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function setLatency(card, ms) {
  const el = card.querySelector(".lat");
  el.textContent = `⚡${(ms / 1000).toFixed(1)} 秒`;
  el.title = "从收到对方最后一段文字，到 AI 出第一个字用的时间";
}

function createHintCard(quote) {
  clearEmpty(els.hints);
  for (const c of els.hints.querySelectorAll(".card.latest")) c.classList.remove("latest");
  const card = document.createElement("article");
  card.className = "card latest pending";
  const head = document.createElement("div");
  head.className = "card-head";
  const q = document.createElement("span");
  q.className = "q";
  q.textContent = hintTime() + " · " + quote;
  const lat = document.createElement("span");
  lat.className = "lat";
  head.append(lat, q);
  head.title = quote;
  const body = document.createElement("div");
  body.className = "card-body";
  card.append(head, body);
  els.hints.prepend(card);
  els.hints.scrollTop = 0;
  return card;
}

/** 把 AI 返回的文字排版：编号的英文建议显示成大字（也兼容【标题】和（中文）行） */
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
  if (!currentTurn()) {
    toast("还没有听到对方说话。可以在下面的输入框直接问 AI。");
    return;
  }
  revealHint();
});
els.askForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.askInput.value.trim();
  if (!q) return;
  els.askInput.value = "";
  askAi(q);
});

// ---------- 回顾：按时间顺序，一句对一句；再生成中文解释和关键词 ----------
/** 回顾里生成的中文解释，key = 行的 key；sig 用来判断内容变了要重新生成 */
const explainCache = new Map();

/** 从 AI 的回答里取出每一句英文建议 */
function suggestionsOf(raw) {
  const out = [];
  for (const rawLine of (raw || "").split("\n")) {
    const line = rawLine.replace(/\*\*/g, "").trim();
    if (!line || line.startsWith("[错误]")) continue;
    out.push(line.replace(/^\d+[.、)]\s*/, ""));
  }
  return out;
}

/** 一句话可能生成过好几次提示（对方话变长了），取最后一次完整的 */
function bestHintFor(lineId) {
  // 同一轮里可能显示过好几次（对方中途停顿过），取最后显示、内容最完整的那条
  const list = hintLog.filter((h) => h.lineId === lineId && h.raw && !h.superseded);
  return list.filter((h) => h.done).pop() || list.pop() || null;
}

/** 这一行是不是某一轮的中间部分（提示显示在这一轮的最后一行上） */
function inShownTurn(lineId) {
  return hintLog.some((h) => h.turnLineIds?.includes(lineId) && h.lineId !== lineId);
}

function buildReviewRows() {
  const rows = [];
  const pushAsks = (afterLineId) => {
    for (const h of hintLog) {
      if (h.focus && h.afterLineId === afterLineId && h.raw) {
        rows.push({ key: "H" + h.id, kind: "ask", them: h.focus, hint: h });
      }
    }
  };
  pushAsks(0);
  for (const l of lines) {
    const text = (l.text + " " + l.interim).trim();
    if (text) {
      if (l.speaker === "them") rows.push({ key: "L" + l.id, kind: "them", them: text, hint: bestHintFor(l.id), audio: l.audio });
      else rows.push({ key: "L" + l.id, kind: "me", them: text, hint: null, audio: l.audio });
    }
    pushAsks(l.id);
  }
  for (const r of rows) {
    r.suggestions = r.hint ? suggestionsOf(r.hint.raw) : [];
    r.sig = r.them + "\n" + r.suggestions.join("\n");
  }
  return rows;
}

function explanationFor(row) {
  const e = explainCache.get(row.key);
  return e && e.sig === row.sig ? e : null;
}

function renderReview() {
  const rows = buildReviewRows();
  els.reviewList.replaceChildren();
  if (rows.length === 0) {
    els.reviewList.innerHTML = '<p class="empty">还没有对话记录。</p>';
    return rows;
  }
  for (const row of rows) {
    const ex = row.kind === "me" ? null : explanationFor(row);
    const el = document.createElement("div");
    el.className = "rv-row" + (row.kind === "me" ? " me-row" : "");

    const left = document.createElement("div");
    const line = document.createElement("p");
    line.className = "line " + (row.kind === "me" ? "me" : "them");
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = row.kind === "me" ? "我" : row.kind === "ask" ? "你问 AI" : "对方";
    if (row.audio && recorder.has(row.audio.trackId)) {
      const icon = document.createElement("span");
      icon.className = "play";
      icon.textContent = "▶";
      line.classList.add("playable");
      line.title = "点一下播放这句的录音，再点一下停止";
      line.addEventListener("click", () => player.play(row.audio, line));
      line.append(icon);
    }
    line.append(who, document.createTextNode(row.them));
    if (ex?.meaning) {
      const zh = document.createElement("div");
      zh.className = "rv-zh";
      zh.textContent = "中文：" + ex.meaning;
      line.append(zh);
    }
    left.append(line);

    const right = document.createElement("div");
    right.className = "rv-hint";
    if (row.kind !== "me") {
      if (row.suggestions.length === 0 && !(row.kind === "them" && inShownTurn(Number(row.key.slice(1))))) {
        const none = document.createElement("div");
        none.className = "none";
        none.textContent = "（这句没有生成提示）";
        right.append(none);
      }
      row.suggestions.forEach((en, i) => {
        const say = document.createElement("div");
        say.className = "say";
        say.textContent = en;
        right.append(say);
        const zhText = ex?.suggestions?.[i];
        if (zhText) {
          const zh = document.createElement("div");
          zh.className = "zh";
          zh.textContent = zhText;
          right.append(zh);
        }
      });
      if (ex?.keywords?.length) {
        const keys = document.createElement("div");
        keys.className = "rv-keys";
        for (const k of ex.keywords) {
          const chip = document.createElement("span");
          chip.textContent = `${k.en} — ${k.zh}`;
          keys.append(chip);
        }
        right.append(keys);
      }
    }
    el.append(left, right);
    els.reviewList.append(el);
  }
  const need = rows.filter((r) => r.kind !== "me" && !explanationFor(r)).length;
  const total = rows.filter((r) => r.kind !== "me").length;
  if (!explaining) {
    els.reviewProgress.textContent = total === 0 ? "" : need === 0 ? `已全部生成中文解释（${total} 句）` : `${total} 句，其中 ${need} 句还没有中文解释`;
    els.explainBtn.disabled = need === 0;
  }
  return rows;
}

function showReview(on) {
  player.stop();
  els.review.hidden = !on;
  els.panes.hidden = on;
  els.reviewBtn.textContent = on ? "↩ 返回实时" : "📋 回顾";
  if (on) {
    closeLines();
    renderReview();
  }
}
els.reviewBtn.addEventListener("click", () => showReview(els.review.hidden));
els.backBtn.addEventListener("click", () => showReview(false));

let explaining = false;
els.explainBtn.addEventListener("click", async () => {
  const todo = renderReview().filter((r) => r.kind !== "me" && !explanationFor(r));
  if (todo.length === 0) return;
  explaining = true;
  els.explainBtn.disabled = true;
  let doneCount = 0;
  let failed = 0;
  els.reviewProgress.textContent = `正在生成中文解释… 0 / ${todo.length}`;

  // 分批并行：每批 8 句，同时最多 3 批
  const batches = [];
  for (let i = 0; i < todo.length; i += 8) batches.push(todo.slice(i, i + 8));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scene: els.scene.value,
            items: batch.map((r) => ({ id: r.key, them: r.them, suggestions: r.suggestions })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
        for (const item of data.items || []) {
          const row = batch.find((r) => r.key === item.id);
          if (row) explainCache.set(row.key, { ...item, sig: row.sig });
        }
      } catch (err) {
        failed += batch.length;
        toast("有一部分中文解释没有生成：" + err.message, 8000);
      }
      doneCount += batch.length;
      els.reviewProgress.textContent = `正在生成中文解释… ${doneCount} / ${todo.length}`;
      renderReview();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  explaining = false;
  renderReview();
  if (failed) els.reviewProgress.textContent += `（${failed} 句失败，可以再点一次按钮重试）`;
});

els.downloadBtn.addEventListener("click", () => {
  const rows = buildReviewRows();
  if (rows.length === 0) {
    toast("还没有对话记录");
    return;
  }
  const now = new Date();
  const out = [`英语对话记录  ${now.toLocaleString()}`, ""];
  for (const row of rows) {
    const ex = row.kind === "me" ? null : explanationFor(row);
    const who = row.kind === "me" ? "我" : row.kind === "ask" ? "你问 AI" : "对方";
    out.push(`【${who}】${row.them}`);
    if (ex?.meaning) out.push(`    中文：${ex.meaning}`);
    if (row.suggestions.length) {
      out.push("    AI 建议：");
      row.suggestions.forEach((en, i) => {
        out.push(`      ${i + 1}. ${en}`);
        if (ex?.suggestions?.[i]) out.push(`         ${ex.suggestions[i]}`);
      });
    }
    if (ex?.keywords?.length) out.push("    关键词：" + ex.keywords.map((k) => `${k.en} — ${k.zh}`).join("；"));
    out.push("");
  }
  saveFile(new Blob([out.join("\n")], { type: "text/plain;charset=utf-8" }), `conversation-${fileStamp()}.txt`);
});

// ---------- 录音与回放 ----------
const SAMPLE_RATE = 16000; // pcm-worklet.js 输出 16kHz 16bit 单声道

/** 每条声音来源一条录音轨道（例如「对方」= 电脑声音，「我」= 麦克风） */
const recorder = {
  /** @type {{id:number, label:string, startedAt:number, chunks:Int16Array[], length:number}[]} */
  tracks: [],
  seq: 0,
  newTrack(label) {
    if (!els.recordAudio.checked) return null;
    const t = { id: ++this.seq, label, startedAt: 0, chunks: [], length: 0 };
    this.tracks.push(t);
    return t;
  },
  has(id) {
    return this.tracks.some((t) => t.id === id);
  },
  append(track, buffer) {
    if (!track) return;
    const pcm = new Int16Array(buffer.slice(0));
    // 第一段声音的开头时间（performance.now 毫秒），用来对齐多条轨道和估算时间
    if (track.length === 0) track.startedAt = performance.now() - (pcm.length / SAMPLE_RATE) * 1000;
    track.chunks.push(pcm);
    track.length += pcm.length;
  },
  /** 当前录到第几秒（浏览器自带识别没有时间信息，用这个估算） */
  nowSeconds(track) {
    return track && track.length ? (performance.now() - track.startedAt) / 1000 : 0;
  },
  /** 取出一段声音（样本范围 [from, to)） */
  read(track, from, to) {
    from = Math.max(0, Math.floor(from));
    to = Math.min(track.length, Math.floor(to));
    const out = new Int16Array(Math.max(0, to - from));
    let pos = 0;
    for (const c of track.chunks) {
      const cStart = pos, cEnd = pos + c.length;
      pos = cEnd;
      if (cEnd <= from) continue;
      if (cStart >= to) break;
      const a = Math.max(from, cStart) - cStart, b = Math.min(to, cEnd) - cStart;
      out.set(c.subarray(a, b), Math.max(from, cStart) - from);
    }
    return out;
  },
  totalSeconds() {
    return this.tracks.reduce((n, t) => Math.max(n, t.length / SAMPLE_RATE), 0);
  },
  clear() {
    this.tracks = [];
  },
};

/** 回顾时播放某一句的录音 */
const player = {
  ctx: null,
  src: null,
  el: null,
  stop() {
    try { this.src?.stop(); } catch {}
    this.src = null;
    this.el?.classList.remove("playing");
    this.el = null;
  },
  play(audio, el) {
    const wasPlaying = this.el === el;
    this.stop();
    if (wasPlaying) return; // 再点一次 = 停止
    const track = recorder.tracks.find((t) => t.id === audio.trackId);
    if (!track) {
      toast("这句话的录音已经没有了（点过「清空」或刷新过页面）。");
      return;
    }
    // 前后各多放一点，免得开头结尾被截掉
    const pcm = recorder.read(track, (audio.start - 0.3) * SAMPLE_RATE, (audio.end + 0.4) * SAMPLE_RATE);
    if (pcm.length === 0) {
      toast("这句话没有录到声音。");
      return;
    }
    this.ctx ??= new AudioContext();
    const buf = this.ctx.createBuffer(1, pcm.length, SAMPLE_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.onended = () => {
      if (this.src === src) this.stop();
    };
    this.ctx.resume();
    src.start();
    this.src = src;
    this.el = el;
    el.classList.add("playing");
  },
};

/** 把所有轨道按时间对齐、混成一个 WAV 文件 */
function buildWav() {
  const tracks = recorder.tracks.filter((t) => t.length);
  if (!tracks.length) return null;
  const t0 = Math.min(...tracks.map((t) => t.startedAt));
  const offsets = tracks.map((t) => Math.round(((t.startedAt - t0) / 1000) * SAMPLE_RATE));
  const total = Math.max(...tracks.map((t, i) => offsets[i] + t.length));
  const mix = new Int16Array(total);
  tracks.forEach((t, i) => {
    let pos = offsets[i];
    for (const c of t.chunks) {
      for (let j = 0; j < c.length; j++) {
        const v = mix[pos + j] + c[j];
        mix[pos + j] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
      }
      pos += c.length;
    }
  });
  const header = new DataView(new ArrayBuffer(44));
  const str = (o, s) => [...s].forEach((ch, i) => header.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  header.setUint32(4, 36 + mix.byteLength, true);
  str(8, "WAVE");
  str(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // 单声道
  header.setUint32(24, SAMPLE_RATE, true);
  header.setUint32(28, SAMPLE_RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  str(36, "data");
  header.setUint32(40, mix.byteLength, true);
  return new Blob([header, mix], { type: "audio/wav" });
}

function saveFile(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function fileStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

els.downloadAudioBtn.addEventListener("click", () => {
  const blob = buildWav();
  if (!blob) {
    toast("还没有录音。请在「设置」里勾选「录音」后再开始。");
    return;
  }
  saveFile(blob, `recording-${fileStamp()}.wav`);
});

/** 把一路声音接到 pcm-worklet：每 100ms 回调一次（16kHz PCM + 音量 + 声音特征） */
async function attachWorklet(media, onChunk) {
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule("pcm-worklet.js");
  const src = ctx.createMediaStreamSource(media);
  const node = new AudioWorkletNode(ctx, "pcm-downsampler");
  node.port.onmessage = (ev) => onChunk(ev.data.audio, ev.data.peak, ev.data);
  src.connect(node);
  // 不连到扬声器，避免回声；有些浏览器要求节点连接到 destination 才会运行，用静音增益
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute).connect(ctx.destination);
  // 等待授权弹窗后，AudioContext 可能处于暂停状态，不恢复就收不到声音
  if (ctx.state !== "running") await ctx.resume();
  return ctx;
}

/** 浏览器自带识别时：另外接一路麦克风，用来录音和显示音量 */
class MicCapture {
  constructor(media) {
    this.media = media;
    this.track = recorder.newTrack("麦克风");
  }
  async start() {
    this.ctx = await attachWorklet(this.media, (audio, peak) => {
      audioLevel.report(this, peak);
      recorder.append(this.track, audio);
    });
  }
  stop() {
    try { this.ctx?.close(); } catch {}
  }
}

// ---------- 语音识别：浏览器自带（Web Speech API） ----------
class BrowserRecognizer {
  /** @param {MicCapture|null} capture 同一个麦克风的录音，用来估算每句话在录音里的时间 */
  constructor(capture) {
    this.capture = capture;
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
          this.speaker = this.speakerFor(r[0].transcript);
          onSpeech(this.speaker, r[0].transcript, true, this.audioNow());
        } else {
          interim += r[0].transcript;
        }
      }
      if (interim) {
        this.speaker = this.speakerFor(interim);
        onSpeech(this.speaker, interim, false, this.audioNow());
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
  /** 按住空格，或者照着 AI 提示念的话，算「我」 */
  speakerFor(text) {
    return isMeSpeaking() || looksLikeSuggestion(text, recentSuggestions()) ? "me" : "them";
  }
  /** 没有精确时间：识别结果大约比说话晚 1 秒左右到，往前多算一点 */
  audioNow() {
    const track = this.capture?.track;
    if (!track) return undefined;
    const t = recorder.nowSeconds(track);
    return { trackId: track.id, start: Math.max(0, t - 2), end: t + 0.3 };
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
   * @param {"me"|"them"|"auto"} speaker auto = 单麦克风模式，要分辨是谁在说
   * @param {{smart?: boolean}} [opts] smart = 智能区分说话人（声音特征 + Deepgram 自动区分）；否则只看有没有按住空格
   */
  constructor(media, speaker, { smart = false } = {}) {
    this.media = media;
    this.smart = speaker === "auto" && smart;
    this.diarize = this.smart;
    /** 声音特征模型：分出两个声音，再判断哪个是我 */
    this.voice = this.smart ? new VoiceModel() : null;
    /** Deepgram 的说话人编号 → 多少证据说它是「我」/「对方」 */
    this.spVotes = new Map();
    this.seenSpeakers = new Set();
    this.fixedSpeaker = speaker;
    this.currentSpeaker = speaker === "auto" ? "them" : speaker;
    this.track = recorder.newTrack(speaker === "them" ? "对方" : speaker === "me" ? "我" : "麦克风");
    // 连接建立前的声音先排队：保证 Deepgram 给的时间和录音对得上
    this.queue = [];
  }

  speakerNow() {
    return this.fixedSpeaker === "auto" ? (isMeSpeaking() ? "me" : "them") : this.fixedSpeaker;
  }

  async start() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws/stt${this.diarize ? "?diarize=1" : ""}`);
    this.ws.binaryType = "arraybuffer";
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "transcript") {
        this.inUtterance = true;
        if (this.fixedSpeaker === "auto" && msg.words?.length && this.t0) {
          this.handleSplit(msg);
        } else {
          if (this.fixedSpeaker === "auto") this.currentSpeaker = this.speakerNow();
          onSpeech(this.currentSpeaker, msg.text, msg.isFinal, this.audioRange(msg.start, msg.start + msg.duration));
        }
        if (msg.speechFinal) this.endUtterance(false);
      } else if (msg.type === "utterance_end") {
        this.endUtterance(true);
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

    this.ws.onopen = () => {
      for (const chunk of this.queue.splice(0)) this.ws.send(chunk);
    };

    this.ctx = await attachWorklet(this.media, (audio, peak, data) => {
      // 第一段声音开头的时间（performance.now 毫秒）：Deepgram 给的秒数从这里算起
      this.t0 ||= performance.now() - (audio.byteLength / 2 / SAMPLE_RATE) * 1000;
      if (this.voice && data.feats) this.voice.addFrames(data.feats, data.frameSec, data.hasAir);
      audioLevel.report(this, peak);
      recorder.append(this.track, audio);
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(audio);
      else if (this.ws.readyState === WebSocket.CONNECTING) this.queue.push(audio);
    });
    this.updateStatus();
  }

  /** 这段话在这条声音里的时间（秒）。没录音时 trackId 为 0，只用来记时间 */
  audioRange(start, end) {
    return { trackId: this.track?.id ?? 0, start, end };
  }

  /**
   * 单麦克风模式：把单词按停顿、按住空格、Deepgram 说话人编号分成小段，每段判断是谁说的。
   * 这样就算两个人的话被识别成同一句，也会在换人的地方切开。
   */
  handleSplit(msg) {
    const groups = [];
    let prevEnd = -Infinity;
    for (const w of msg.words) {
      const held = wasMeAt(this.t0 + ((w.s + w.e) / 2) * 1000);
      const sp = this.diarize && w.sp != null ? w.sp : null;
      const g = groups[groups.length - 1];
      if (g && g.held === held && g.sp === sp && w.s - prevEnd < 0.35) {
        g.words.push(w.w);
        g.e = w.e;
      } else {
        groups.push({ held, sp, words: [w.w], s: w.s, e: w.e });
      }
      prevEnd = w.e;
    }
    const suggestions = recentSuggestions();
    for (const g of groups) {
      g.text = g.words.join(" ");
      g.echo = !g.held && looksLikeSuggestion(g.text, suggestions);
      g.v = this.voice?.vectorAt(g.s, g.e) ?? null;
      g.speaker = this.decide(g);
    }
    // 只从确认过的结果里学习
    if (msg.isFinal) {
      const wasReady = this.voice?.ready();
      for (const g of groups) this.learn(g);
      if (this.voice && !wasReady && this.voice.ready()) this.onVoiceReady();
    }

    // 相邻的、同一个人的小段合起来
    const runs = [];
    for (const g of groups) {
      const last = runs[runs.length - 1];
      if (last && last.speaker === g.speaker && last.sp === g.sp) {
        last.words.push(...g.words);
        last.e = g.e;
        last.auto ||= !g.held;
        last.echo ||= g.echo;
      } else {
        runs.push({ speaker: g.speaker, sp: g.sp, words: [...g.words], s: g.s, e: g.e, auto: !g.held, echo: g.echo });
      }
    }
    // 这一段里没有出现的那一方：清掉它还没确认的临时文字，免得残留
    for (const speaker of ["me", "them"]) {
      if (!runs.some((r) => r.speaker === speaker)) clearInterim(speaker);
    }
    for (const r of runs) {
      const line = onSpeech(r.speaker, r.words.join(" "), msg.isFinal, this.audioRange(r.s, r.e));
      if (!line) continue;
      // 记下这行是自动判断的（不是按住空格），对调或重新判断时一起改
      if (r.auto) line.autoLabeled = true;
      if (r.echo) line.echo = true;
      if (r.sp !== null) {
        line.sp = r.sp;
        renderLine(line);
      }
    }
    if (this.diarize && msg.isFinal) {
      if (!msg.words.some((w) => w.sp != null)) this.noSpeakerInfo = true;
      this.updateStatus();
    }
    this.currentSpeaker = runs[runs.length - 1].speaker;
  }

  /** 几种线索一起打分：大于 0 算「我」 */
  decide(g) {
    if (g.held) return "me";
    let score = -0.3; // 什么都看不出来的时候算「对方」
    if (g.echo) score += 2.5;
    if (g.sp !== null) score += 1.5 * this.spLean(g.sp);
    if (this.voice) score += this.voice.score(g.v);
    return score > 0 ? "me" : "them";
  }

  /** Deepgram 这个说话人编号像不像「我」：-1 ~ 1 */
  spLean(sp) {
    const lean = (v) => (v ? (v.me - v.them) / (v.me + v.them + 2) : 0);
    const mine = lean(this.spVotes.get(sp));
    if (mine !== 0) return mine;
    // 还没有证据的新编号：如果别的编号已经确定是我，这个多半是对方
    for (const [k, v] of this.spVotes) if (k !== sp && lean(v) > 0.5) return -0.5;
    return 0;
  }

  learn(g) {
    const sure = g.held || g.echo;
    this.voice?.add(g.v, sure);
    if (g.sp === null) return;
    this.seenSpeakers.add(g.sp);
    const votes = this.spVotes.get(g.sp) ?? { me: 0, them: 0 };
    if (sure) votes.me += 3;
    else {
      const s = this.voice?.score(g.v) ?? 0;
      if (s > 0.7) votes.me += 1;
      else if (s < -0.7) votes.them += 1;
    }
    this.spVotes.set(g.sp, votes);
    if (g.held && !this.learnedOnce) {
      this.learnedOnce = true;
      toast("已经记住你的声音了：之后不按空格，程序也会自动分出「我」和「对方」。", 6000);
    }
  }

  /** 声音特征第一次能分清两个人：把之前自动标的字幕按新的判断重新标一遍 */
  onVoiceReady() {
    let changed = 0;
    for (const l of lines.slice(-40)) {
      if (!l.autoLabeled || !l.span) continue;
      const g = { held: false, sp: l.sp ?? null, echo: Boolean(l.echo), v: this.voice.vectorAt(l.span.start, l.span.end) };
      const speaker = this.decide(g);
      if (speaker === l.speaker) continue;
      l.speaker = speaker;
      l.el.className = "line " + speaker;
      renderLine(l);
      changed++;
    }
    if (changed) toast(`已经分清你和对方的声音，前面 ${changed} 句重新标了说话人。`, 6000);
  }

  /** 字幕上方的小标签：智能区分现在是什么状态 */
  updateStatus() {
    if (!this.smart) return;
    const el = els.diarizeStatus;
    el.hidden = false;
    const ready = this.voice.ready();
    const mine = [...this.spVotes].filter(([sp]) => this.spLean(sp) > 0.3).map(([k]) => "声音" + (k + 1));
    el.classList.toggle("ok", ready || mine.length > 0);
    if (ready) {
      el.textContent = `智能区分：已分清你和对方 ✓${mine.length ? `（你是${mine.join("、")}）` : ""}`;
      el.title = `声音特征分离度 ${this.voice.fit.sep.toFixed(1)}（${this.voice.fit.via === "label" ? "按你按空格 / 念提示时的声音学的" : "按音量和频带自动判断"}）`;
    } else if (this.noSpeakerInfo && this.seenSpeakers.size === 0 && !this.voice.fit) {
      el.textContent = "智能区分：正在学习声音（Deepgram 自动区分没生效，可以重启程序再刷新网页）";
    } else {
      el.textContent = mine.length
        ? `智能区分：你是${mine.join("、")}，还在学习声音特征…`
        : "智能区分：正在学习两个人的声音…（按住空格说一句会更快）";
      el.title = "";
    }
  }

  /** 认反了：把「我」和「对方」对调 */
  swap() {
    if (this.voice) this.voice.flip = !this.voice.flip;
    for (const v of this.spVotes.values()) [v.me, v.them] = [v.them, v.me];
    this.updateStatus();
  }

  /** hard = Deepgram 的 UtteranceEnd（安静了 1 秒多）；否则是 speech_final（只停顿了一下） */
  endUtterance(hard) {
    const was = this.inUtterance;
    this.inUtterance = false;
    if (was || hard) onUtteranceEnd(this.currentSpeaker, hard);
  }

  stop() {
    try { this.ws?.close(); } catch {}
    try { this.ctx?.close(); } catch {}
  }
}

// ---------- 麦克风选择 ----------
async function loadMicDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const saved = store.get("micDevice", "");
  let devices = [];
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId !== "default");
  } catch {}
  els.micDevice.replaceChildren(new Option("系统默认麦克风", ""));
  devices.forEach((d, i) => els.micDevice.append(new Option(d.label || `麦克风 ${i + 1}（点「开始听」授权后显示名字）`, d.deviceId)));
  els.micDevice.value = devices.some((d) => d.deviceId === saved) ? saved : "";
}
els.micRefresh.addEventListener("click", loadMicDevices);
navigator.mediaDevices?.addEventListener?.("devicechange", loadMicDevices);

// ---------- 音量条 + 没声音提醒 ----------
const audioLevel = {
  peaks: new Map(),
  loudAt: 0,
  startedAt: 0,
  warned: false,
  timer: null,
  report(stream, peak) {
    this.peaks.set(stream, peak);
    if (peak > 0.02) this.loudAt = Date.now();
    const max = Math.max(...this.peaks.values());
    // 平方根让小声也能看出来
    els.meter.firstElementChild.style.width = Math.min(100, Math.sqrt(max) * 140) + "%";
  },
  start() {
    this.reset();
    this.startedAt = Date.now();
    els.meter.hidden = false;
    this.timer = setInterval(() => {
      const quietFor = Date.now() - Math.max(this.loudAt, this.startedAt);
      if (!this.warned && quietFor > 10000) {
        this.warned = true;
        toast(
          this.peaks.size === 0
            ? "10 秒没有收到任何声音数据。请重新点「停止」再「开始听」，或刷新页面。"
            : "10 秒几乎没有收到声音（音量条不动）。请在「设置」里换一个麦克风，并检查 Mac「系统设置 → 隐私与安全性 → 麦克风」里是否允许了 Chrome。",
          12000,
        );
      }
    }, 1000);
  },
  reset() {
    clearInterval(this.timer);
    this.peaks.clear();
    this.loudAt = 0;
    this.warned = false;
    els.meter.hidden = true;
    els.meter.firstElementChild.style.width = "0";
  },
};

// ---------- 开始 / 停止 ----------
let listening = false;
let recognizers = [];
let mediaStreams = [];

/** raw = 不做降噪、自动音量：智能区分说话人要靠原始的音量和频带分辨是谁在说 */
async function getMic({ raw = false } = {}) {
  const deviceId = els.micDevice.value;
  const s = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: !raw,
      noiseSuppression: !raw,
      autoGainControl: !raw,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  });
  mediaStreams.push(s);
  // 授权以后才能看到麦克风的名字
  loadMicDevices();
  const label = s.getAudioTracks()[0]?.label;
  if (label) console.log("使用麦克风：", label);
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
      // 另外接一路麦克风：录音 + 音量条（浏览器自带识别本身拿不到声音）
      let capture = null;
      try {
        capture = new MicCapture(await getMic());
        recognizers.push(capture);
      } catch (err) {
        console.warn("录音用的麦克风打不开，只识别不录音：", err);
      }
      recognizers.push(new BrowserRecognizer(capture));
    } else {
      if (!serverConfig.deepgram) throw new Error("服务器没有配置 DEEPGRAM_API_KEY，请看 README，或改用浏览器自带识别。");
      if (source === "system") {
        recognizers.push(new DeepgramStream(await getSystemAudio(), "them"));
        if (els.meMic.checked) recognizers.push(new DeepgramStream(await getMic(), "me"));
      } else {
        const smart = els.speakerMode.value === "auto";
        recognizers.push(new DeepgramStream(await getMic({ raw: smart }), "auto", { smart }));
        els.swapBtn.hidden = !smart;
        els.diarizeStatus.hidden = true;
        if (smart && !serverConfig.features?.includes("diarize")) {
          toast("后台程序还是旧版本，自动区分说话人不会完全生效。请关掉程序重新启动（再双击 start-mac.command 或运行 npm start），然后刷新网页。", 15000);
        } else if (smart) {
          toast("智能区分说话人：先按住空格说一句英文，程序会更快学会你的声音。", 8000);
        }
      }
    }
    // 先和 AI 服务建立好连接，第一次提问就不用再等握手
    fetch("/api/warmup", { method: "POST" }).catch(() => {});
    for (const r of recognizers) await r.start();
    listening = true;
    audioLevel.start();
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
  audioLevel.reset();
  els.swapBtn.hidden = true;
  els.diarizeStatus.hidden = true;
  closeLines();
  els.startBtn.textContent = "▶ 开始听";
  els.startBtn.classList.remove("running");
  if (!els.status.classList.contains("error")) setStatus("已停止");
}

els.startBtn.addEventListener("click", () => (listening ? stopListening() : startListening()));

// ---------- 我的资料 ----------
let docs = [];

function updateSceneBadge() {
  const n = docs.filter((d) => d.enabled).length;
  const scene = els.scene.value === "interview" ? "面试模式" : "一般对话";
  els.sceneBadge.textContent = scene + " · " + (n ? `参考资料 ${n} 份` : "无资料，用一般知识");
}

function formatChars(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k 字符" : n + " 字符";
}

function renderDocs() {
  els.docList.replaceChildren();
  if (docs.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-docs";
    li.textContent = "还没有资料。面试前可以上传简历和职位描述（JD）。";
    els.docList.append(li);
  }
  for (const d of docs) {
    const li = document.createElement("li");
    li.className = d.enabled ? "" : "off";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = d.enabled;
    check.title = "勾选 = AI 回答时参考这份资料";
    check.addEventListener("change", () => setDocEnabled(d, check.checked));

    const name = document.createElement("span");
    name.className = "doc-name";
    name.textContent = d.name;
    name.title = d.preview + (d.chars > d.preview.length ? "…" : "");

    const meta = document.createElement("span");
    meta.className = "doc-meta";
    meta.textContent = formatChars(d.chars);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "删除";
    del.addEventListener("click", () => removeDoc(d));

    li.append(check, name, meta, del);
    els.docList.append(li);
  }
  updateSceneBadge();
}

async function docApi(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
  return data;
}

async function loadDocs() {
  try {
    docs = (await docApi("/api/docs")).docs;
  } catch (err) {
    toast("读取资料失败：" + err.message);
  }
  renderDocs();
}

async function uploadFiles(files) {
  for (const file of files) {
    toast(`正在读取「${file.name}」…`, 60000);
    try {
      await docApi("/api/docs?name=" + encodeURIComponent(file.name), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      toast(`已添加「${file.name}」`);
    } catch (err) {
      toast(err.message, 10000);
    }
  }
  await loadDocs();
}

async function setDocEnabled(d, enabled) {
  try {
    await docApi("/api/docs/" + d.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  } catch (err) {
    toast(err.message, 8000);
  }
  await loadDocs();
}

async function removeDoc(d) {
  if (!confirm(`删除资料「${d.name}」？`)) return;
  try {
    await docApi("/api/docs/" + d.id, { method: "DELETE" });
  } catch (err) {
    toast(err.message);
  }
  await loadDocs();
}

els.docFile.addEventListener("change", () => {
  const files = [...els.docFile.files];
  els.docFile.value = "";
  if (files.length) uploadFiles(files);
});
els.pasteToggle.addEventListener("click", () => {
  els.pasteBox.hidden = !els.pasteBox.hidden;
  if (!els.pasteBox.hidden) els.pasteName.focus();
});
els.pasteSave.addEventListener("click", async () => {
  const text = els.pasteText.value.trim();
  if (!text) {
    toast("请先粘贴文字");
    return;
  }
  try {
    await docApi("/api/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: els.pasteName.value.trim() || "粘贴的资料", text }),
    });
    els.pasteName.value = "";
    els.pasteText.value = "";
    els.pasteBox.hidden = true;
    toast("已保存");
  } catch (err) {
    toast(err.message, 8000);
  }
  await loadDocs();
});

// ---------- 初始化 ----------
fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => { serverConfig = cfg; })
  .catch(() => toast("连不上本机服务器，请确认已经运行 npm start。"))
  .finally(() => {
    loadSettings();
    loadDocs();
    loadMicDevices();
    if (!els.context.value) els.settings.hidden = false;
  });
