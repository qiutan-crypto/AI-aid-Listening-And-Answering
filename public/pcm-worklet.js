// AudioWorklet：把浏览器的音频降采样到 16kHz 单声道 16bit PCM，每 ~100ms 发一次（附带音量）。
class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0; // 下一个输出样本在输入中的位置（可跨块）
    this.out = [];
    this.chunkSize = 1600; // 100ms @ 16kHz
    this.peak = 0; // 这 100ms 里最大的音量（0~1），用来显示音量条
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;

    // 多声道混成单声道
    const len = channels[0].length;
    const mono = new Float32Array(len);
    for (const ch of channels) for (let i = 0; i < len; i++) mono[i] += ch[i] / channels.length;

    for (let i = 0; i < len; i++) this.peak = Math.max(this.peak, Math.abs(mono[i]));

    while (this.pos < len) {
      const s = Math.max(-1, Math.min(1, mono[Math.floor(this.pos)]));
      this.out.push(s < 0 ? s * 0x8000 : s * 0x7fff);
      this.pos += this.ratio;
    }
    this.pos -= len;

    if (this.out.length >= this.chunkSize) {
      const pcm = Int16Array.from(this.out);
      this.out = [];
      this.port.postMessage({ audio: pcm.buffer, peak: this.peak }, [pcm.buffer]);
      this.peak = 0;
    }
    return true;
  }
}

registerProcessor("pcm-downsampler", PcmDownsampler);
