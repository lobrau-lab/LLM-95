/**
 * Audio Pipeline & Sound Blaster 16 Ring-Buffer Bridge
 * Handles real PCM audio streams from v86 Sound Blaster 16 emulation,
 * using AudioWorklet circular buffers and seamless ScriptProcessorNode fallback.
 */

export class SoundBlasterAudioBridge {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private fallbackNode: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.8;
  private isInitialized: boolean = false;

  // Fallback ring buffer (1-second stereo at 44.1kHz)
  private fallbackBuffer = new Float32Array(44100 * 2);
  private writeIdx = 0;
  private readIdx = 0;

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  public async initAudio(v86Instance: any): Promise<void> {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      this.ctx = new AudioCtxClass({ sampleRate: 44100 });
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.gainNode.connect(this.ctx.destination);

      // Attempt to register and use AudioWorklet
      let workletLoaded = false;
      if (this.ctx.audioWorklet && typeof this.ctx.audioWorklet.addModule === 'function') {
        try {
          await this.ctx.audioWorklet.addModule('/audio-processor.js');
          this.workletNode = new AudioWorkletNode(this.ctx, 'v86-audio-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2]
          });
          this.workletNode.connect(this.gainNode);
          workletLoaded = true;
          console.log('[AudioBridge] Sound Blaster 16: AudioWorklet ring-buffer active.');
        } catch (workletErr) {
          console.warn('[AudioBridge] AudioWorklet init failed; using ScriptProcessor fallback:', workletErr);
        }
      }

      if (!workletLoaded) {
        // Fallback: ScriptProcessorNode with circular Float32Array ring-buffer
        this.fallbackNode = this.ctx.createScriptProcessor(2048, 0, 2);
        this.fallbackNode.onaudioprocess = (e) => {
          const left = e.outputBuffer.getChannelData(0);
          const right = e.outputBuffer.getChannelData(1);
          const len = left.length;

          for (let i = 0; i < len; i++) {
            if (this.readIdx !== this.writeIdx) {
              left[i] = this.fallbackBuffer[this.readIdx];
              this.readIdx = (this.readIdx + 1) % this.fallbackBuffer.length;
              right[i] = this.fallbackBuffer[this.readIdx];
              this.readIdx = (this.readIdx + 1) % this.fallbackBuffer.length;
            } else {
              left[i] = 0;
              right[i] = 0;
            }
          }
        };
        this.fallbackNode.connect(this.gainNode);
        console.log('[AudioBridge] Sound Blaster 16: ScriptProcessor ring-buffer active.');
      }

      // Listen to v86 sound output
      this.bindV86Sound(v86Instance);

    } catch (e) {
      console.warn('[AudioBridge] Audio subsystem initialization warning:', e);
    }
  }

  private bindV86Sound(v86Instance: any): void {
    if (!v86Instance || !v86Instance.add_listener) return;

    // v86 emits sound output via bus listener "sound-output" or "sb16-output"
    const onSoundData = (samples: Int16Array | Float32Array) => {
      if (!samples || !samples.length) return;

      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      if (this.workletNode) {
        // Send PCM samples to AudioWorklet port
        this.workletNode.port.postMessage(samples);
      } else {
        // Push into local fallback circular buffer
        for (let i = 0; i < samples.length; i++) {
          const val = typeof samples[i] === 'number' && samples[i] > 1.0
            ? samples[i] / 32768.0
            : (samples[i] as number);
          this.fallbackBuffer[this.writeIdx] = val;
          this.writeIdx = (this.writeIdx + 1) % this.fallbackBuffer.length;
        }
      }
    };

    try {
      v86Instance.add_listener('sound-output', onSoundData);
      v86Instance.add_listener('sb16-output', onSoundData);
    } catch {}
  }

  public setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public destroy(): void {
    try {
      this.workletNode?.disconnect();
      this.fallbackNode?.disconnect();
      this.gainNode?.disconnect();
      this.ctx?.close();
    } catch {}
    this.workletNode = null;
    this.fallbackNode = null;
    this.ctx = null;
    this.isInitialized = false;
  }
}
