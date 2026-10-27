"use strict";
// 单麦克风时分辨「我」和「对方」。几种线索一起打分（见 app.js 的 DeepgramStream.decide）：
//  1. 按住空格时说的话：一定是「我」（这些话也用来学习你的声音）。
//  2. 照着 AI 提示念出来的话：几乎可以确定是「我」（也用来学习）。
//  3. 声音特征（VoiceModel）：把听到的声音按音量和频带分成两组，
//     对着麦克风说话的人（你）声音大、频带宽；手机外放的声音频带窄、没有很低和很高的频率。
//  4. Deepgram 自动区分说话人给的编号（同一个编号多数时候是同一个人）。

/** 按声音特征把说话的人分成两组，再判断哪一组是「我」 */
class VoiceModel {
  constructor() {
    this.frameSec = 0.02;
    this.dims = 3;
    this.data = new Float32Array(4 * 8192);
    this.count = 0; // 已收到的帧数
    this.floor = -70; // 安静时的音量（dB），高出它很多的帧才算有人在说话
    this.floorAt = 0;
    /** @type {{v:number[], me:boolean}[]} 最近的语音片段（每段几个词）的特征 */
    this.samples = [];
    this.sinceFit = 0;
    this.fit = null;
    this.flip = false;
  }

  /** 收到 worklet 算好的一批帧（每帧 4 个数） */
  addFrames(buffer, frameSec, hasAir) {
    const f = new Float32Array(buffer);
    this.frameSec = frameSec;
    this.dims = hasAir ? 4 : 3;
    const need = (this.count * 4) + f.length;
    if (need > this.data.length) {
      const bigger = new Float32Array(Math.max(need, this.data.length * 2));
      bigger.set(this.data.subarray(0, this.count * 4));
      this.data = bigger;
    }
    this.data.set(f, this.count * 4);
    this.count += f.length / 4;
    if (this.count - this.floorAt >= 50) this.updateFloor();
  }

  /** 最近 30 秒里最安静的那部分帧的音量 = 背景噪声 */
  updateFloor() {
    this.floorAt = this.count;
    const from = Math.max(0, this.count - 1500);
    const levels = [];
    for (let i = from; i < this.count; i++) levels.push(this.data[i * 4]);
    levels.sort((a, b) => a - b);
    this.floor = levels[Math.floor(levels.length * 0.15)] ?? this.floor;
  }

  /** 音频里 [s, e] 秒这一段的平均特征；没有足够的说话声就返回 null */
  vectorAt(s, e) {
    const i0 = Math.max(0, Math.floor(s / this.frameSec));
    const i1 = Math.min(this.count, Math.ceil(e / this.frameSec));
    const sum = [0, 0, 0, 0];
    let n = 0;
    for (let i = i0; i < i1; i++) {
      const base = i * 4;
      if (this.data[base] < this.floor + 9) continue;
      for (let d = 0; d < 4; d++) sum[d] += this.data[base + d];
      n++;
    }
    if (n < 3) return null;
    return sum.slice(0, this.dims).map((x) => x / n);
  }

  /** 记下一段确认过的话；me = 已经确定是「我」（按住空格或照着提示念） */
  add(v, me) {
    if (!v) return;
    this.samples.push({ v, me });
    if (this.samples.length > 400) this.samples.shift();
    if (++this.sinceFit >= 3) this.refit();
  }

  refit() {
    this.sinceFit = 0;
    const list = this.samples.filter((x) => x.v.length === this.dims);
    const n = list.length;
    if (n < 12) {
      this.fit = null;
      return;
    }
    const D = this.dims;
    const mean = new Array(D).fill(0);
    const std = new Array(D).fill(0);
    for (const x of list) for (let d = 0; d < D; d++) mean[d] += x.v[d] / n;
    for (const x of list) for (let d = 0; d < D; d++) std[d] += (x.v[d] - mean[d]) ** 2 / n;
    for (let d = 0; d < D; d++) std[d] = Math.max(1, Math.sqrt(std[d])); // 至少 1dB，免得一点点差别被放大
    const z = list.map((x) => x.v.map((val, d) => (val - mean[d]) / std[d]));
    const sumOf = (c) => c.reduce((a, b) => a + b, 0);
    const avg = (rows) => {
      const c = new Array(D).fill(0);
      for (const r of rows) for (let d = 0; d < D; d++) c[d] += r[d] / rows.length;
      return c;
    };
    const dist2 = (a, b) => a.reduce((acc, x, d) => acc + (x - b[d]) ** 2, 0);

    // 起点：有「确定是我」的片段就从它们出发；没有就按「声音大、频带宽」的程度分成两半
    const meZ = z.filter((_, i) => list[i].me);
    let cA, cB;
    if (meZ.length >= 2) {
      cA = avg(meZ);
      cB = z.reduce((far, r) => (dist2(r, cA) > dist2(far, cA) ? r : far), z[0]);
    } else {
      const order = z.map((r, i) => [sumOf(r), i]).sort((a, b) => a[0] - b[0]);
      cA = avg(order.slice(n >> 1).map(([, i]) => z[i]));
      cB = avg(order.slice(0, n >> 1).map(([, i]) => z[i]));
    }
    let inA = [];
    for (let iter = 0; iter < 12; iter++) {
      inA = z.map((r) => dist2(r, cA) <= dist2(r, cB));
      const a = z.filter((_, i) => inA[i]);
      const b = z.filter((_, i) => !inA[i]);
      if (!a.length || !b.length) break;
      cA = avg(a);
      cB = avg(b);
    }
    const sizeA = inA.filter(Boolean).length;
    const sizeB = n - sizeA;
    const minSize = Math.max(5, Math.round(n * 0.12));
    // 分离度：把每段投影到两组中心的连线上，两组的距离是组内散布的几倍。
    // 只有一个人说话时硬分成两组，这个数一般在 3 以下；两个人的声音明显不同时会大得多
    const gap = Math.sqrt(dist2(cA, cB));
    let sep = 0;
    if (gap > 0) {
      const proj = z.map((r) => r.reduce((acc, x, d) => acc + (x * (cA[d] - cB[d])) / gap, 0));
      const mA = proj.filter((_, i) => inA[i]).reduce((a, b) => a + b, 0) / Math.max(1, sizeA);
      const mB = proj.filter((_, i) => !inA[i]).reduce((a, b) => a + b, 0) / Math.max(1, sizeB);
      let within = 0;
      proj.forEach((x, i) => (within += (x - (inA[i] ? mA : mB)) ** 2));
      sep = Math.abs(mA - mB) / Math.sqrt(Math.max(within / n, 0.01));
    }

    // 哪一组是「我」：先看确定是我的片段落在哪一组；没有的话，声音大、频带宽的那组算我
    const meInA = list.filter((x, i) => x.me && inA[i]).length;
    const meInB = list.filter((x, i) => x.me && !inA[i]).length;
    let aIsMe, via;
    if (meInA + meInB >= 2 && Math.max(meInA, meInB) >= 0.7 * (meInA + meInB)) {
      aIsMe = meInA > meInB;
      via = "label";
    } else {
      aIsMe = sumOf(cA) >= sumOf(cB);
      via = "prior";
    }
    const ok = Math.min(sizeA, sizeB) >= minSize && sep >= (via === "label" ? 3.5 : 4);
    this.fit = { mean, std, cMe: aIsMe ? cA : cB, cThem: aIsMe ? cB : cA, sep, ok, via, n };
  }

  /** 这段声音像「我」的程度：正数像我，负数像对方，0 = 还分不出来。范围 -2 ~ 2 */
  score(v) {
    const f = this.fit;
    if (!f?.ok || !v || v.length !== this.dims) return 0;
    const z = v.map((val, d) => (val - f.mean[d]) / f.std[d]);
    let p = 0;
    let len2 = 0;
    for (let d = 0; d < z.length; d++) {
      const axis = f.cMe[d] - f.cThem[d];
      p += (z[d] - (f.cMe[d] + f.cThem[d]) / 2) * axis;
      len2 += axis * axis;
    }
    const half = Math.sqrt(len2) / 2;
    if (half === 0) return 0;
    const m = Math.max(-2, Math.min(2, (1.5 * p) / Math.sqrt(len2) / half));
    return this.flip ? -m : m;
  }

  ready() {
    return Boolean(this.fit?.ok);
  }
}

// ---------- 「照着提示念」的检测 ----------
function wordsOf(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** 最长公共子序列的长度（词为单位） */
function lcsLength(a, b) {
  if (!a.length || !b.length) return 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * 这句话是不是在念 AI 给的建议：至少 3 个词，并且 75% 以上的词按顺序出现在某条建议里
 * @param {string} text
 * @param {string[][]} suggestions 每条建议的词
 */
function looksLikeSuggestion(text, suggestions) {
  const w = wordsOf(text);
  if (w.length < 3) return false;
  for (const s of suggestions) {
    const l = lcsLength(w, s);
    if (l >= 3 && l >= 0.75 * w.length) return true;
  }
  return false;
}

globalThis.VoiceModel = VoiceModel;
globalThis.wordsOf = wordsOf;
globalThis.looksLikeSuggestion = looksLikeSuggestion;
