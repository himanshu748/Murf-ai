class AAIProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.pcmQueue = []; // JS array of int samples
  }

  process(inputs) {
    const input = inputs && inputs[0] && inputs[0][0];
    if (input) {
      // Send a simple RMS-based meter level (0..1) for UI visualization
      let sum = 0;
      for (let i = 0; i < input.length; i++) { const s = input[i]; sum += s * s; }
      const rms = Math.sqrt(sum / input.length) || 0;
      const level = Math.min(1, rms * 4);
      this.port.postMessage({ m: level });

      const down = this.downsample(input, sampleRate, this.targetRate);
      const pcm16 = this.floatTo16BitPCM(down);
      // Accumulate ~50ms @ 16kHz -> 800 samples
      for (let i = 0; i < pcm16.length; i++) this.pcmQueue.push(pcm16[i]);
      while (this.pcmQueue.length >= 800) {
        const frame = new Int16Array(this.pcmQueue.slice(0, 800));
        this.pcmQueue = this.pcmQueue.slice(800);
        // Transfer ownership for efficiency
        this.port.postMessage(frame.buffer, [frame.buffer]);
      }
    }
    return true;
  }

  downsample(buffer, inRate, outRate) {
    if (outRate === inRate) return buffer;
    const ratio = inRate / outRate;
    const newLen = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLen);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0, count = 0;
      for (let i = Math.round(offsetBuffer); i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count ? (accum / count) : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  floatTo16BitPCM(float32Array) {
    const out = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
  }
}

registerProcessor('aai-processor', AAIProcessor);
