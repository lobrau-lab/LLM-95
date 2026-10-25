// AudioWorklet processor for Sound Blaster 16 PCM audio ring buffer
class V86AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 1-second circular ring buffer at 44100Hz stereo
    this.buffer = new Float32Array(44100 * 2);
    this.writeIndex = 0;
    this.readIndex = 0;

    this.port.onmessage = (e) => {
      const pcm16 = e.data; // Int16Array from v86 Sound Blaster 16
      if (!pcm16 || !pcm16.length) return;
      for (let i = 0; i < pcm16.length; i++) {
        this.buffer[this.writeIndex] = pcm16[i] / 32768.0;
        this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || !output.length) return true;
    const left = output[0];
    const right = output[1] || output[0];

    for (let i = 0; i < left.length; i++) {
      if (this.readIndex !== this.writeIndex) {
        left[i] = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.buffer.length;
        right[i] = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.buffer.length;
      } else {
        left[i] = 0; // Underrun silence instead of audio freeze or click
        right[i] = 0;
      }
    }
    return true;
  }
}

registerProcessor('v86-audio-processor', V86AudioProcessor);
