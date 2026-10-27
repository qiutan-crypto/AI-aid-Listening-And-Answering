// AudioWorklet：把浏览器的音频降采样到 16kHz 单声道 16bit PCM，每 ~100ms 发一次（附带音量）。
// 同时按原始采样率每 20ms 算一组「声音特征」（音量、低频 / 高频占比），用来分辨是谁在说话：
// 对着麦克风直接说话的人声音大、频带宽；手机外放出来的声音被电话压缩过，几乎没有很低和很高的频率。

/** RBJ 二阶滤波器（直接 II 型转置） */
class Biquad {
  constructor(type, freq, rate) {
    const w0 = (2 * Math.PI * freq) / rate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
    const a0 = 1 + alpha;
    const b = type === "lp" ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    this.b0 = b[0] / a0;
    this.b1 = b[1] / a0;
    this.b2 = b[2] / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
    this.z1 = 0;
    this.z2 = 0;
  }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** 两个二阶串联 = 四阶，滚降更陡，低频的人声不会漏进高频那一段 */
class Band {
  constructor(type, freq, rate) {
    this.f1 = new Biquad(type, freq, rate);
    this.f2 = new Biquad(type, freq, rate);
  }
  run(x) {
    return this.f2.run(this.f1.run(x));
  }
}

const db = (x) => 10 * Math.log10(x + 1e-12);

class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0; // 下一个输出样本在输入中的位置（可跨块）
    this.out = [];
    this.chunkSize = 1600; // 100ms @ 16kHz
    this.peak = 0; // 这 100ms 里最大的音量（0~1），用来显示音量条

    // 声音特征：每 20ms 一帧
    this.frameLen = Math.round(sampleRate * 0.02);
    this.hasAir = sampleRate >= 32000; // 采样率太低（例如蓝牙耳机 16kHz）就没有 7.5kHz 以上的频段
    this.rumble = new Biquad("hp", 70, sampleRate); // 去掉风扇、桌子震动之类的低频噪声
    this.lo = new Band("lp", 300, sampleRate);
    this.hi = new Band("hp", 3800, sampleRate);
    this.air = this.hasAir ? new Band("hp", 7500, sampleRate) : null;
    this.acc = { n: 0, tot: 0, lo: 0, hi: 0, air: 0 };
    this.feats = []; // 每帧 4 个数：总音量 dB，低频占比 dB，高频占比 dB，超高频占比 dB
  }

  frame(x) {
    const a = this.acc;
    x = this.rumble.run(x);
    const lo = this.lo.run(x);
    const hi = this.hi.run(x);
    a.tot += x * x;
    a.lo += lo * lo;
    a.hi += hi * hi;
    if (this.air) {
      const air = this.air.run(x);
      a.air += air * air;
    }
    if (++a.n < this.frameLen) return;
    this.feats.push(db(a.tot / a.n), db(a.lo) - db(a.tot), db(a.hi) - db(a.tot), this.air ? db(a.air) - db(a.tot) : 0);
    a.n = a.tot = a.lo = a.hi = a.air = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;

    // 多声道混成单声道
    const len = channels[0].length;
    const mono = new Float32Array(len);
    for (const ch of channels) for (let i = 0; i < len; i++) mono[i] += ch[i] / channels.length;

    for (let i = 0; i < len; i++) {
      this.peak = Math.max(this.peak, Math.abs(mono[i]));
      this.frame(mono[i]);
    }

    while (this.pos < len) {
      const s = Math.max(-1, Math.min(1, mono[Math.floor(this.pos)]));
      this.out.push(s < 0 ? s * 0x8000 : s * 0x7fff);
      this.pos += this.ratio;
    }
    this.pos -= len;

    if (this.out.length >= this.chunkSize) {
      const pcm = Int16Array.from(this.out);
      const feats = Float32Array.from(this.feats);
      this.out = [];
      this.feats = [];
      this.port.postMessage(
        { audio: pcm.buffer, peak: this.peak, feats: feats.buffer, frameSec: this.frameLen / sampleRate, hasAir: this.hasAir },
        [pcm.buffer, feats.buffer],
      );
      this.peak = 0;
    }
    return true;
  }
}

registerProcessor("pcm-downsampler", PcmDownsampler);
