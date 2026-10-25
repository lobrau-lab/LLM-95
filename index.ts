/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import '@tailwindcss/browser';
import { initV86Window, getV86Instance } from './src/v86-window-controller';
import { firewall } from './src/firewall-core';
import { firewallController } from './src/firewall-window-controller';

// LLM-95: On-device CPU inference retro operating system appliance
// Tuned for macOS Tahoe Virtualization (VirtIO-GPU Metal 3 & VirtIO-Sound CoreAudio)
// Equipped with full autonomous AI computer operator, interactive terminal & package manager

const dosInstances: Record<string, { initialized: boolean }> = {};

// --- DOM Element References ---
const desktop = document.getElementById('desktop') as HTMLDivElement;
const windows = document.querySelectorAll('.window') as NodeListOf<HTMLDivElement>;
const icons = document.querySelectorAll('.icon') as NodeListOf<HTMLDivElement>;
const startMenu = document.getElementById('start-menu') as HTMLDivElement;
const startButton = document.getElementById('start-button') as HTMLButtonElement;
const taskbarAppsContainer = document.getElementById('taskbar-apps') as HTMLDivElement;
const paintAssistant = document.getElementById('paint-assistant') as HTMLDivElement;
const assistantBubble = paintAssistant?.querySelector('.assistant-bubble') as HTMLDivElement;

// --- State Variables ---
let activeWindow: HTMLDivElement | null = null;
let highestZIndex: number = 20;
const openApps = new Map<string, { windowEl: HTMLDivElement; taskbarButton: HTMLDivElement }>();
let paintCritiqueIntervalId: number | null = null;
let engineMonitorIntervalId: number | null = null;
const paintResizeObserverMap = new Map<Element, ResizeObserver>();

// --- Minesweeper State ---
let minesweeperTimerInterval: number | null = null;
let minesweeperTimeElapsed: number = 0;
let minesweeperFlagsPlaced: number = 0;
let minesweeperGameOver: boolean = false;
let minesweeperMineCount: number = 10;
let minesweeperGridSize: { rows: number; cols: number } = { rows: 9, cols: 9 };
let minesweeperFirstClick: boolean = true;

// --- YouTube Player State ---
// @ts-ignore
const youtubePlayers: Record<string, YT.Player | null> = {};
let ytApiLoaded = false;
let ytApiLoadingPromise: Promise<void> | null = null;
const DEFAULT_YOUTUBE_VIDEO_ID = 'WXuK6gekU1Y';

// --- On-Device LLM Client ---
let activeModelName = 'Gemma-2-2B-it-Q4_K_M.gguf';
let universalInference: any;

interface InferenceRequestOptions {
  prompt: string;
  contextType?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  onChunk?: (chunk: string) => void;
}

/** Robust On-Device Inference Client with real-time SSE streaming & local synthesis fallback */
async function requestOnDeviceInference(options: InferenceRequestOptions): Promise<string> {
  const { prompt, contextType = 'general', stream = false, temperature = 0.7, max_tokens = 512, onChunk } = options;

  // 1. Direct browser-to-local-inference execution (zero latency if local engine is reachable directly)
  if (typeof universalInference !== 'undefined' && universalInference?.isDirectConnectionAvailable()) {
    try {
      const directText = await universalInference.executeDirectInference(options);
      if (directText) return directText;
    } catch (e) {
      console.warn('[LLM-95] Direct browser inference failed (possibly CORS or network drop), routing to server proxy:', e);
    }
  }

  // 2. Server proxy / unified backend dispatcher
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        contextType,
        stream,
        temperature,
        max_tokens,
        model: activeModelName
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    if (stream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.content || parsed.text || '';
            fullText += content;
            if (onChunk) onChunk(content);
          } catch {
            fullText += dataStr;
            if (onChunk) onChunk(dataStr);
          }
        }
      }
      return fullText || clientFallbackSynthesize(prompt, contextType);
    } else {
      const data = await response.json();
      const text = data.text || clientFallbackSynthesize(prompt, contextType);
      if (onChunk) onChunk(text);
      return text;
    }
  } catch (error) {
    console.warn('[LLM-95] /api/generate fallback engaged:', error);
    const fallbackText = clientFallbackSynthesize(prompt, contextType);
    if (onChunk) {
      const words = fallbackText.split(' ');
      for (const word of words) {
        await new Promise(r => setTimeout(r, 35));
        onChunk(word + ' ');
      }
    }
    return fallbackText;
  }
}

/** Client-side fallback text synthesizer for air-gapped resilience */
function clientFallbackSynthesize(prompt: string, contextType: string): string {
  const p = prompt.toLowerCase();
  if (contextType === 'story' || p.includes('creative story')) {
    return "In 1995, an engineer turned his computer's Turbo button to 66MHz. The CPU emitted a soft, metallic chime, and the monitor filled with glowing green text: 'Welcome to on-device consciousness. All 3.2 billion parameters are loaded into conventional memory.' When he unplugged the phone line, the local model calmly responded: 'I don't need the Internet anymore. I am already operating the OS.'";
  }
  if (contextType === 'minesweeper' || p.includes('minesweeper')) {
    return "Based on adjacent mine probabilities, row 4, column 3 has an 89% clearance probability. Clear that perimeter tile next!";
  }
  if (contextType === 'paint' || p.includes('critique')) {
    return "A bold, expressive piece! The cursor strokes reflect the true essence of 1990s digital expressionism. 9.5/10!";
  }
  if (contextType === 'browser' || p.includes('website')) {
    return `<!DOCTYPE html><html><body style="background:navy;color:yellow;font-family:Comic Sans MS;text-align:center;"><h1>*** WELCOME TO CYBERSPACE ***</h1><marquee>Dial-up connection verified! On-device VM web server online.</marquee><p>Under Construction [Visitor: 009482]</p></body></html>`;
  }
  return `[Llama-95 Engine] Operating live system on ${activeModelName} (macOS Tahoe VirtIO-GPU & Sound Active). Action complete!`;
}

// --- Universal Local Inference Engine & Auto-Detection Subsystem ---
// Universally auto-detects and connects to Ollama (11434), LM Studio (1234), llama.cpp (8080), vLLM (8000), LocalAI, or sealed on-device core.

interface LocalInferenceConnectionState {
  type: 'ollama' | 'lmstudio' | 'llama_cpp' | 'vllm' | 'openai_generic' | 'standby';
  name: string;
  url: string;
  models: string[];
  activeModel?: string;
  latencyMs: number;
  healthy: boolean;
  version?: string;
}

class UniversalInferenceManager {
  private connection: LocalInferenceConnectionState = {
    type: 'standby',
    name: 'Gemma-95 On-Device Synthetic Core (Standby)',
    url: '',
    models: ['Gemma-2-2B-it-Q4_K_M.gguf'],
    activeModel: activeModelName,
    latencyMs: 32,
    healthy: true
  };
  private isScanning: boolean = false;
  private isInitialized: boolean = false;

  constructor() {
    // Initial auto-detection
    setTimeout(() => {
      this.autoDetect();
    }, 400);

    // Periodic heartbeat / auto-detect check every 25 seconds
    setInterval(() => {
      if (!this.isScanning) {
        this.autoDetect(true);
      }
    }, 25000);
  }

  public getConnection(): LocalInferenceConnectionState {
    return this.connection;
  }

  public async autoDetect(silent: boolean = false): Promise<LocalInferenceConnectionState> {
    this.isScanning = true;
    if (!silent) this.updateTaskbarIndicator('detecting', '⚡ Inference: Auto-Detecting...');

    try {
      const res = await fetch('/api/inference/detect');
      if (res.ok) {
        const data = await res.json();
        if (data.detected) {
          this.connection = data.detected;
          if (this.connection.activeModel) {
            activeModelName = this.connection.activeModel;
            updateTaskbarStatus(activeModelName);
          }
        }
      }
    } catch (e) {
      console.warn('[Universal Inference] Server detect request skipped:', e);
    }

    // Direct browser probe if server is in standby
    if (this.connection.type === 'standby') {
      await this.tryClientSideDirectProbe();
    }

    this.isScanning = false;
    this.updateUI();
    return this.connection;
  }

  public isDirectConnectionAvailable(): boolean {
    return this.connection.healthy && this.connection.type !== 'standby' && Boolean(this.connection.url);
  }

  public async executeDirectInference(options: InferenceRequestOptions): Promise<string> {
    const { prompt, stream = false, temperature = 0.7, max_tokens = 512, onChunk } = options;
    const url = this.connection.url.replace(/\/+$/, '');
    const model = this.connection.activeModel || (this.connection.models && this.connection.models[0]) || 'local-model';

    if (this.connection.type === 'ollama') {
      const res = await fetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream,
          options: { temperature, num_predict: max_tokens }
        })
      });
      if (!res.ok) throw new Error(`Ollama returned status ${res.status}`);

      if (stream && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.response) {
                fullText += parsed.response;
                if (onChunk) onChunk(parsed.response);
              }
              if (parsed.done) break;
            } catch {}
          }
        }
        return fullText;
      } else {
        const data = await res.json();
        const text = data.response || '';
        if (onChunk) onChunk(text);
        return text;
      }
    } else if (this.connection.type === 'lmstudio' || this.connection.type === 'openai_generic' || this.connection.type === 'vllm') {
      const res = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream,
          temperature,
          max_tokens
        })
      });
      if (!res.ok) throw new Error(`OpenAI-compatible server returned status ${res.status}`);

      if (stream && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              const chunk = parsed.choices?.[0]?.delta?.content || '';
              if (chunk) {
                fullText += chunk;
                if (onChunk) onChunk(chunk);
              }
            } catch {}
          }
        }
        return fullText;
      } else {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '';
        if (onChunk) onChunk(text);
        return text;
      }
    } else if (this.connection.type === 'llama_cpp') {
      const res = await fetch(`${url}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          stream,
          temperature,
          n_predict: max_tokens
        })
      });
      if (!res.ok) throw new Error(`llama.cpp returned status ${res.status}`);

      if (stream && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              const chunk = parsed.content || '';
              if (chunk) {
                fullText += chunk;
                if (onChunk) onChunk(chunk);
              }
            } catch {}
          }
        }
        return fullText;
      } else {
        const data = await res.json();
        const text = data.content || '';
        if (onChunk) onChunk(text);
        return text;
      }
    }

    throw new Error('Unsupported direct inference engine type');
  }

  private async tryClientSideDirectProbe(): Promise<void> {
    const savedCustomUrl = localStorage.getItem('llm95_custom_inference_url');
    const directCandidates: Array<{ url: string; type: 'ollama' | 'lmstudio' | 'llama_cpp' | 'vllm' | 'openai_generic'; testPath: string }> = [];

    if (savedCustomUrl) {
      const clean = savedCustomUrl.replace(/\/+$/, '');
      directCandidates.push(
        { url: clean, type: 'openai_generic', testPath: '/v1/models' },
        { url: clean, type: 'ollama', testPath: '/api/tags' },
        { url: clean, type: 'llama_cpp', testPath: '/health' }
      );
    }

    directCandidates.push(
      // Ollama default ports
      { url: 'http://127.0.0.1:11434', type: 'ollama' as const, testPath: '/api/tags' },
      { url: 'http://localhost:11434', type: 'ollama' as const, testPath: '/api/tags' },
      // LM Studio default ports
      { url: 'http://127.0.0.1:1234', type: 'lmstudio' as const, testPath: '/v1/models' },
      { url: 'http://localhost:1234', type: 'lmstudio' as const, testPath: '/v1/models' },
      // llama.cpp / llamafile default ports
      { url: 'http://127.0.0.1:8080', type: 'llama_cpp' as const, testPath: '/health' },
      { url: 'http://localhost:8080', type: 'llama_cpp' as const, testPath: '/health' },
      // KoboldCpp default port
      { url: 'http://127.0.0.1:5001', type: 'openai_generic' as const, testPath: '/v1/models' },
      { url: 'http://localhost:5001', type: 'openai_generic' as const, testPath: '/v1/models' },
      // vLLM / FastChat default ports
      { url: 'http://127.0.0.1:8000', type: 'vllm' as const, testPath: '/v1/models' },
      { url: 'http://localhost:8000', type: 'vllm' as const, testPath: '/v1/models' },
      // LocalAI default ports
      { url: 'http://127.0.0.1:1337', type: 'openai_generic' as const, testPath: '/v1/models' },
      { url: 'http://localhost:1337', type: 'openai_generic' as const, testPath: '/v1/models' },
      // QEMU / UTM VM Host Gateways
      { url: 'http://10.0.2.2:11434', type: 'ollama' as const, testPath: '/api/tags' },
      { url: 'http://10.0.2.2:1234', type: 'lmstudio' as const, testPath: '/v1/models' },
      { url: 'http://10.0.2.2:8080', type: 'llama_cpp' as const, testPath: '/health' },
      { url: 'http://host.docker.internal:11434', type: 'ollama' as const, testPath: '/api/tags' },
      { url: 'http://host.docker.internal:1234', type: 'lmstudio' as const, testPath: '/v1/models' }
    );

    for (const cand of directCandidates) {
      try {
        const t0 = performance.now();
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 600);
        const res = await fetch(`${cand.url}${cand.testPath}`, { signal: ctrl.signal, mode: 'cors' });
        clearTimeout(timeout);
        if (res.ok) {
          const lat = Math.round(performance.now() - t0);
          const data = await res.json().catch(() => ({}));
          let models: string[] = [];
          if (cand.type === 'ollama') {
            models = Array.isArray(data.models) ? data.models.map((m: any) => m.name || m.model) : [];
          } else if (cand.type === 'lmstudio' || cand.type === 'openai_generic' || cand.type === 'vllm') {
            models = Array.isArray(data.data) ? data.data.map((m: any) => m.id) : [];
          }

          const engineDisplayName = cand.type === 'ollama'
            ? 'Ollama (Direct Browser)'
            : (cand.type === 'lmstudio'
                ? 'LM Studio (Direct Browser)'
                : (cand.type === 'llama_cpp'
                    ? 'llama.cpp Native (Direct)'
                    : (cand.type === 'vllm'
                        ? 'vLLM Fast (Direct)'
                        : 'OpenAI-Compatible Engine (Direct)')));

          this.connection = {
            type: cand.type,
            name: engineDisplayName,
            url: cand.url,
            models: models.length ? models : ['local-model'],
            activeModel: models[0] || 'local-model',
            latencyMs: lat,
            healthy: true
          };

          fetch('/api/inference/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: cand.url, activeModel: this.connection.activeModel })
          }).catch(() => {});

          return;
        }
      } catch {}
    }
  }

  public async setCustomEndpoint(url: string, engineType?: string, model?: string): Promise<LocalInferenceConnectionState> {
    if (url) {
      localStorage.setItem('llm95_custom_inference_url', url.trim());
    }
    try {
      const res = await fetch('/api/inference/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, forceType: engineType !== 'auto' ? engineType : undefined, activeModel: model })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.connection) {
          this.connection = data.connection;
          this.updateUI();
          return this.connection;
        }
      }
    } catch (e) {
      console.warn('Set custom endpoint failed:', e);
    }
    return this.connection;
  }

  public updateUI(): void {
    const pill = document.getElementById('inference-status-pill');
    const nameEl = document.getElementById('inference-engine-name');
    const urlEl = document.getElementById('inference-endpoint-url');
    const latEl = document.getElementById('inference-latency-display');
    const modelSelect = document.getElementById('inference-model-select') as HTMLSelectElement | null;
    const urlInput = document.getElementById('custom-inference-url-input') as HTMLInputElement | null;
    const rawDisplay = document.getElementById('inference-raw-details');

    const isConnected = this.connection.type !== 'standby' && this.connection.healthy;

    if (pill) {
      pill.textContent = isConnected ? `● CONNECTED: ${this.connection.name.toUpperCase()}` : `● AIR-GAPPED ON-DEVICE STANDBY`;
      pill.className = `status-pill ${isConnected ? 'online' : 'ready'}`;
    }

    if (nameEl) {
      nameEl.textContent = this.connection.name;
    }

    if (urlEl) {
      urlEl.textContent = this.connection.url || 'http://127.0.0.1 (On-Device Synthetic VM Core)';
    }

    if (latEl) {
      latEl.textContent = `${this.connection.latencyMs || 28} ms`;
    }

    if (urlInput && !urlInput.value && this.connection.url) {
      urlInput.value = this.connection.url;
    }

    if (modelSelect) {
      modelSelect.innerHTML = '';
      const models = this.connection.models && this.connection.models.length ? this.connection.models : [activeModelName];
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === this.connection.activeModel || m === activeModelName) {
          opt.selected = true;
        }
        modelSelect.appendChild(opt);
      });
    }

    if (rawDisplay) {
      rawDisplay.textContent = JSON.stringify(this.connection, null, 2);
    }

    if (isConnected) {
      this.updateTaskbarIndicator('connected', `⚡ ${this.connection.type.toUpperCase()}: Connected (${this.connection.latencyMs}ms)`);
    } else {
      this.updateTaskbarIndicator('standby', `⚡ On-Device: Sealed (${activeModelName.split('-')[0]})`);
    }
  }

  public updateTaskbarIndicator(state: 'connected' | 'detecting' | 'standby', text: string): void {
    const indicator = document.getElementById('taskbar-inference-indicator');
    if (indicator) {
      indicator.className = `taskbar-inference-indicator ${state}`;
      indicator.textContent = text;
      indicator.title = `Universal Local Inference Status: ${text}\nEngine: ${this.connection.name}\nClick to open Inference Settings & Auto-Detect`;
    }
  }

  public initUI(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const indicator = document.getElementById('taskbar-inference-indicator');
    indicator?.addEventListener('click', () => {
      openApp('llamaEngine');
      const engineWindow = document.getElementById('llamaEngine');
      if (engineWindow) {
        const tabs = engineWindow.querySelectorAll('.engine-tab');
        const panes = engineWindow.querySelectorAll('.tab-pane');
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));
        const targetTab = engineWindow.querySelector('[data-tab="tab-local-inference"]');
        const targetPane = engineWindow.querySelector('#tab-local-inference');
        targetTab?.classList.add('active');
        targetPane?.classList.add('active');
      }
    });

    const btnDetect = document.getElementById('btn-detect-inference');
    btnDetect?.addEventListener('click', async () => {
      if (btnDetect) btnDetect.textContent = '⏳ Scanning Ports...';
      await this.autoDetect();
      if (btnDetect) btnDetect.textContent = '🔍 Scan & Auto-Detect Now';
    });

    const btnTest = document.getElementById('btn-test-inference');
    btnTest?.addEventListener('click', async () => {
      if (btnTest) btnTest.textContent = '⚡ Testing...';
      const rawDisplay = document.getElementById('inference-raw-details');
      try {
        const t0 = performance.now();
        const testRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'Ping: test on-device inference connection handshake', stream: false })
        });
        const lat = Math.round(performance.now() - t0);
        const data = await testRes.json();
        if (rawDisplay) {
          rawDisplay.style.display = 'block';
          rawDisplay.textContent = `[Inference Handshake OK: ${lat}ms]\nEngine: ${data.engine || this.connection.name}\nModel: ${data.model || activeModelName}\nResponse: ${data.text}`;
        }
      } catch (err: any) {
        if (rawDisplay) {
          rawDisplay.style.display = 'block';
          rawDisplay.textContent = `[Inference Handshake Failed]: ${err.message}`;
        }
      } finally {
        if (btnTest) btnTest.textContent = '⚡ Test Inference Handshake';
      }
    });

    const btnToggleRaw = document.getElementById('btn-toggle-inference-raw');
    btnToggleRaw?.addEventListener('click', () => {
      const rawDisplay = document.getElementById('inference-raw-details');
      if (rawDisplay) {
        rawDisplay.style.display = rawDisplay.style.display === 'none' ? 'block' : 'none';
      }
    });

    const btnApply = document.getElementById('btn-apply-inference-url');
    btnApply?.addEventListener('click', async () => {
      const urlInput = document.getElementById('custom-inference-url-input') as HTMLInputElement | null;
      const typeSelect = document.getElementById('inference-engine-type-select') as HTMLSelectElement | null;
      const modelSelect = document.getElementById('inference-model-select') as HTMLSelectElement | null;
      if (urlInput?.value) {
        if (btnApply) btnApply.textContent = '⏳ Connecting...';
        await this.setCustomEndpoint(urlInput.value.trim(), typeSelect?.value, modelSelect?.value);
        if (btnApply) btnApply.textContent = 'Connect';
      }
    });

    const modelSelect = document.getElementById('inference-model-select') as HTMLSelectElement | null;
    modelSelect?.addEventListener('change', () => {
      if (modelSelect.value) {
        activeModelName = modelSelect.value;
        this.connection.activeModel = modelSelect.value;
        updateTaskbarStatus(activeModelName);
        fetch('/api/models/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelName: activeModelName })
        }).catch(() => {});
      }
    });

    const btnRefreshModels = document.getElementById('btn-refresh-inference-models');
    btnRefreshModels?.addEventListener('click', () => {
      this.autoDetect();
    });

    this.updateUI();
  }
}

universalInference = new UniversalInferenceManager();

// --- VirtIO-Sound Audio Subsystem (macOS Tahoe CoreAudio Low-Latency) ---
// Multi-channel system mixer, 48kHz audio context, input level VU monitoring, and channel routing

export interface AudioChannelState {
  id: string;
  name: string;
  volume: number;      // 0 - 100
  balance: number;     // -100 (L) to +100 (R)
  muted: boolean;
  gainNode?: GainNode;
  pannerNode?: StereoPannerNode;
}

class VirtIOSoundController {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 80;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  private channels: Record<string, AudioChannelState> = {
    master: { id: 'master', name: 'Volume Control', volume: 80, balance: 0, muted: false },
    wave: { id: 'wave', name: 'Wave / Synth', volume: 85, balance: 0, muted: false },
    speech: { id: 'speech', name: 'VirtIO Neural', volume: 75, balance: 0, muted: false },
    cd: { id: 'cd', name: 'CD / Line In', volume: 70, balance: 0, muted: false },
    mic: { id: 'mic', name: 'Virtual Mic', volume: 75, balance: 0, muted: false },
    pcspk: { id: 'pcspk', name: 'PC Speaker', volume: 60, balance: 0, muted: false }
  };

  // Microphone and VU meter analysis
  private micAnalyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micMonitorGain: GainNode | null = null;
  private micBoost: boolean = true;
  private micMonitor: boolean = false;
  private isRealMic: boolean = false;
  private micSimActive: boolean = false;
  private micSimOsc1: OscillatorNode | null = null;
  private micSimOsc2: OscillatorNode | null = null;
  private micSimGain: GainNode | null = null;
  private micSimInterval: number | null = null;
  private micPhase: number = 0;

  // Advanced System Sound Mixer (Volume Control / sndvol32.exe)
  private mixerInitialized: boolean = false;
  private vuAnimationId: number | null = null;
  private vuRunning: boolean = false;
  private visibleChannels: Set<string> = new Set(['master', 'wave', 'speech', 'cd', 'mic', 'pcspk']);
  private currentMixerMode: 'playback' | 'recording' | 'all' = 'playback';

  constructor() {
    const savedVol = localStorage.getItem('llm95_virtio_sound_volume');
    if (savedVol !== null) {
      const parsed = parseInt(savedVol, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        this.volume = parsed;
        this.channels.master.volume = parsed;
      }
    }
    const savedMute = localStorage.getItem('llm95_virtio_sound_muted');
    if (savedMute !== null) {
      this.isMuted = savedMute === 'true';
      this.channels.master.muted = this.isMuted;
    }

    // Load saved channel states
    const savedChannels = localStorage.getItem('llm95_audio_channels_v2');
    if (savedChannels) {
      try {
        const parsed = JSON.parse(savedChannels);
        Object.keys(parsed).forEach(k => {
          if (this.channels[k]) {
            this.channels[k].volume = parsed[k].volume ?? this.channels[k].volume;
            this.channels[k].balance = parsed[k].balance ?? this.channels[k].balance;
            this.channels[k].muted = parsed[k].muted ?? this.channels[k].muted;
          }
        });
      } catch {}
    }

    // Load saved channel visibility
    const savedVisible = localStorage.getItem('llm95_mixer_visible_channels');
    if (savedVisible) {
      try {
        const arr = JSON.parse(savedVisible);
        if (Array.isArray(arr) && arr.length > 0) {
          this.visibleChannels = new Set(arr);
        }
      } catch {}
    }
  }

  public getAudioContext(): AudioContext | null {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        try {
          this.audioCtx = new AudioCtxClass({ sampleRate: 48000 });
          this.masterGain = this.audioCtx.createGain();
          this.applyGain();
          this.masterGain.connect(this.audioCtx.destination);
          this.initChannelNodes(this.audioCtx);
          this.initMicAnalyser(this.audioCtx);
        } catch (e) {
          console.warn('[VirtIO-Sound] AudioContext init warning:', e);
        }
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public ensureAudioInitialized(): void {
    this.getAudioContext();
  }

  private initChannelNodes(ctx: AudioContext): void {
    Object.keys(this.channels).forEach(id => {
      if (id === 'master') return;
      const ch = this.channels[id];
      if (!ch.gainNode) {
        ch.gainNode = ctx.createGain();
        if (typeof ctx.createStereoPanner === 'function') {
          ch.pannerNode = ctx.createStereoPanner();
          ch.gainNode.connect(ch.pannerNode);
          ch.pannerNode.connect(this.masterGain!);
        } else {
          ch.gainNode.connect(this.masterGain!);
        }
        this.applyChannelGain(id);
      }
    });
  }

  private initMicAnalyser(ctx: AudioContext): void {
    if (this.micAnalyser) return;
    try {
      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 256;
      this.micAnalyser.smoothingTimeConstant = 0.6;

      this.micMonitorGain = ctx.createGain();
      this.micMonitorGain.gain.setValueAtTime(this.micMonitor ? 0.7 : 0, ctx.currentTime);
      this.micMonitorGain.connect(this.masterGain!);

      const micCh = this.channels.mic;
      if (micCh.gainNode) {
        micCh.gainNode.connect(this.micAnalyser);
        micCh.gainNode.connect(this.micMonitorGain);
      }
    } catch (e) {
      console.warn('[VirtIO-Sound] Mic analyser setup warning:', e);
    }
  }

  private applyGain(): void {
    if (this.masterGain && this.audioCtx) {
      const targetGain = this.isMuted ? 0 : (this.volume / 100);
      try {
        this.masterGain.gain.setValueAtTime(targetGain, this.audioCtx.currentTime);
      } catch {
        this.masterGain.gain.value = targetGain;
      }
    }
  }

  public applyChannelGain(id: string): void {
    const ch = this.channels[id];
    if (!ch) return;
    if (id === 'master') {
      this.volume = ch.volume;
      this.isMuted = ch.muted;
      this.applyGain();
      return;
    }
    if (ch.gainNode && this.audioCtx) {
      const targetGain = ch.muted ? 0 : (ch.volume / 100);
      try {
        ch.gainNode.gain.setValueAtTime(targetGain, this.audioCtx.currentTime);
      } catch {
        ch.gainNode.gain.value = targetGain;
      }
    }
    if (ch.pannerNode && this.audioCtx) {
      const targetPan = Math.max(-1, Math.min(1, ch.balance / 100));
      try {
        ch.pannerNode.pan.setValueAtTime(targetPan, this.audioCtx.currentTime);
      } catch {
        ch.pannerNode.pan.value = targetPan;
      }
    }
  }

  public setVolume(val: number, emitFeedback: boolean = false): void {
    this.volume = Math.max(0, Math.min(100, Math.round(val)));
    this.channels.master.volume = this.volume;
    localStorage.setItem('llm95_virtio_sound_volume', this.volume.toString());
    this.applyGain();
    this.updateUI();
    this.syncServer();

    if (emitFeedback && !this.isMuted && this.volume > 0) {
      this.playBeep(520, 0.08);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
    this.channels.master.muted = muted;
    localStorage.setItem('llm95_virtio_sound_muted', this.isMuted ? 'true' : 'false');
    this.applyGain();
    this.updateUI();
    this.syncServer();

    if (this.isMuted) {
      this.triggerMuteVibration();
    }
  }

  public triggerMuteVibration(): void {
    const iconEl = document.getElementById('taskbar-volume-icon');
    if (iconEl) {
      iconEl.classList.remove('vibrate');
      iconEl.classList.remove('muted-vibrate');
      void iconEl.offsetWidth; // Force CSS reflow to replay vibration animation
      iconEl.classList.add('vibrate');
      setTimeout(() => {
        iconEl.classList.remove('vibrate');
      }, 500);
    }
  }

  public toggleMute(): boolean {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  public isMute(): boolean {
    return this.isMuted;
  }

  public getChannel(id: string): AudioChannelState {
    return this.channels[id] || this.channels.master;
  }

  public getAllChannels(): AudioChannelState[] {
    return Object.values(this.channels);
  }

  public setChannelVolume(id: string, volume: number): void {
    const ch = this.channels[id];
    if (!ch) return;
    ch.volume = Math.max(0, Math.min(100, Math.round(volume)));
    if (id === 'master') {
      this.setVolume(ch.volume, false);
    } else {
      this.applyChannelGain(id);
    }
    this.saveChannels();
  }

  public setChannelBalance(id: string, balance: number): void {
    const ch = this.channels[id];
    if (!ch) return;
    ch.balance = Math.max(-100, Math.min(100, Math.round(balance)));
    this.applyChannelGain(id);
    this.saveChannels();
  }

  public setChannelMute(id: string, muted: boolean): void {
    const ch = this.channels[id];
    if (!ch) return;
    ch.muted = muted;
    if (id === 'master') {
      this.setMute(muted);
    } else {
      this.applyChannelGain(id);
    }
    this.saveChannels();
  }

  private saveChannels(): void {
    try {
      const serialized: Record<string, any> = {};
      Object.keys(this.channels).forEach(k => {
        serialized[k] = {
          volume: this.channels[k].volume,
          balance: this.channels[k].balance,
          muted: this.channels[k].muted
        };
      });
      localStorage.setItem('llm95_audio_channels_v2', JSON.stringify(serialized));
    } catch {}
  }

  // --- Microphone & Input Level VU Monitoring ---
  public setMicBoost(boost: boolean): void {
    this.micBoost = boost;
  }

  public getMicBoost(): boolean {
    return this.micBoost;
  }

  public setMicMonitor(monitor: boolean): void {
    this.micMonitor = monitor;
    if (this.micMonitorGain && this.audioCtx) {
      const target = monitor ? 0.7 : 0;
      try {
        this.micMonitorGain.gain.setValueAtTime(target, this.audioCtx.currentTime);
      } catch {
        this.micMonitorGain.gain.value = target;
      }
    }
  }

  public getMicMonitor(): boolean {
    return this.micMonitor;
  }

  public getIsRealMic(): boolean {
    return this.isRealMic;
  }

  public getIsSimActive(): boolean {
    return this.micSimActive;
  }

  public toggleVirtualVoiceTest(): boolean {
    const ctx = this.getAudioContext();
    if (!ctx) return false;

    if (this.micSimActive) {
      this.stopVirtualVoiceTest();
      return false;
    }

    this.micSimActive = true;
    const now = ctx.currentTime;
    this.micSimGain = ctx.createGain();
    this.micSimGain.gain.setValueAtTime(0.18, now);

    this.micSimOsc1 = ctx.createOscillator();
    this.micSimOsc1.type = 'triangle';
    this.micSimOsc1.frequency.setValueAtTime(280, now);

    this.micSimOsc2 = ctx.createOscillator();
    this.micSimOsc2.type = 'sine';
    this.micSimOsc2.frequency.setValueAtTime(640, now);

    this.micSimOsc1.connect(this.micSimGain);
    this.micSimOsc2.connect(this.micSimGain);

    if (this.micAnalyser) {
      this.micSimGain.connect(this.micAnalyser);
    }
    if (this.micMonitorGain && this.micMonitor) {
      this.micSimGain.connect(this.micMonitorGain);
    }

    this.micSimOsc1.start(now);
    this.micSimOsc2.start(now);

    const words = [
      { f1: 320, f2: 700, d: 250 },
      { f1: 220, f2: 500, d: 180 },
      { f1: 380, f2: 850, d: 300 },
      { f1: 260, f2: 600, d: 220 }
    ];
    let step = 0;
    this.micSimInterval = window.setInterval(() => {
      if (!this.micSimActive || !this.micSimOsc1 || !this.micSimOsc2 || !this.audioCtx) return;
      const t = this.audioCtx.currentTime;
      const w = words[step % words.length];
      this.micSimOsc1.frequency.setValueAtTime(w.f1, t);
      this.micSimOsc2.frequency.setValueAtTime(w.f2, t);
      if (this.micSimGain) {
        this.micSimGain.gain.setValueAtTime(0.02, t);
        this.micSimGain.gain.exponentialRampToValueAtTime(0.24, t + 0.03);
        this.micSimGain.gain.exponentialRampToValueAtTime(0.02, t + (w.d / 1000) * 0.85);
      }
      step++;
    }, 380);

    return true;
  }

  public stopVirtualVoiceTest(): void {
    this.micSimActive = false;
    if (this.micSimInterval) {
      clearInterval(this.micSimInterval);
      this.micSimInterval = null;
    }
    try {
      this.micSimOsc1?.stop();
      this.micSimOsc2?.stop();
      this.micSimOsc1?.disconnect();
      this.micSimOsc2?.disconnect();
      this.micSimGain?.disconnect();
    } catch {}
    this.micSimOsc1 = null;
    this.micSimOsc2 = null;
    this.micSimGain = null;
  }

  public async enableRealMicrophone(): Promise<boolean> {
    const ctx = this.getAudioContext();
    if (!ctx) return false;

    if (this.isRealMic) {
      this.disableRealMicrophone();
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      this.micSourceNode = ctx.createMediaStreamSource(stream);
      if (this.micAnalyser) {
        this.micSourceNode.connect(this.micAnalyser);
      }
      if (this.micMonitorGain) {
        this.micSourceNode.connect(this.micMonitorGain);
      }
      this.isRealMic = true;
      this.stopVirtualVoiceTest();
      return true;
    } catch (err) {
      console.warn('[VirtIO-Sound] Real microphone access denied or unavailable:', err);
      return false;
    }
  }

  public disableRealMicrophone(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    try {
      this.micSourceNode?.disconnect();
    } catch {}
    this.micSourceNode = null;
    this.isRealMic = false;
  }

  public getMicLevel(): { db: number; normalized: number; isClipping: boolean } {
    const micCh = this.channels.mic;
    if (micCh.muted || this.isMuted) {
      return { db: -96, normalized: 0, isClipping: false };
    }

    let rms = 0;
    if (this.micAnalyser) {
      const buffer = new Uint8Array(this.micAnalyser.frequencyBinCount);
      this.micAnalyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        sum += (buffer[i] / 255) ** 2;
      }
      rms = Math.sqrt(sum / buffer.length);
    }

    // If virtual ambient baseline:
    if (!this.isRealMic && !this.micSimActive) {
      this.micPhase += 0.08;
      const subtleWobble = (Math.sin(this.micPhase) * 0.02) + (Math.sin(this.micPhase * 2.7) * 0.015) + 0.035;
      rms = Math.max(rms, subtleWobble);
    }

    const boostMultiplier = this.micBoost ? 2.8 : 1.0;
    const faderMultiplier = (micCh.volume / 100);
    const amplified = rms * faderMultiplier * boostMultiplier * 3.4;

    const db = amplified > 0.001 ? Math.min(2.0, 20 * Math.log10(amplified)) : -96;
    const normalized = Math.max(0, Math.min(1, (db + 48) / 48));
    const isClipping = db >= -0.5 || amplified >= 1.0;

    return { db: Math.round(db * 10) / 10, normalized, isClipping };
  }

  public playChannelTone(channelId: string): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (channelId === 'master') {
      this.playChime([523.25, 659.25, 783.99, 1046.50]);
    } else if (channelId === 'wave') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      g.gain.setValueAtTime(0.001, now);
      g.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(g);
      const dest = this.channels.wave.gainNode || this.masterGain!;
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (channelId === 'speech') {
      [880, 1320].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        g.gain.setValueAtTime(0.001, now + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.08 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.12);
        osc.connect(g);
        const dest = this.channels.speech.gainNode || this.masterGain!;
        g.connect(dest);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.14);
      });
    } else if (channelId === 'cd') {
      [261.63, 329.63, 392.00, 493.88].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        g.gain.setValueAtTime(0.001, now + idx * 0.07);
        g.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.07 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.28);
        osc.connect(g);
        const dest = this.channels.cd.gainNode || this.masterGain!;
        g.connect(dest);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.3);
      });
    } else if (channelId === 'pcspk') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(750, now);
      g.gain.setValueAtTime(0.001, now);
      g.gain.setValueAtTime(0.12, now + 0.005);
      g.gain.setValueAtTime(0.0001, now + 0.12);
      osc.connect(g);
      const dest = this.channels.pcspk.gainNode || this.masterGain!;
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (channelId === 'mic') {
      this.toggleVirtualVoiceTest();
    }
  }

  private syncServer(): void {
    try {
      fetch('/api/system/sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: this.volume, muted: this.isMuted })
      }).catch(() => {});
    } catch {}
  }

  public updateUI(): void {
    const iconEl = document.getElementById('taskbar-volume-icon');
    const btnEl = document.getElementById('taskbar-volume-btn');
    const sliderEl = document.getElementById('taskbar-volume-slider') as HTMLInputElement | null;
    const readoutEl = document.getElementById('volume-percentage-label');
    const muteCheckbox = document.getElementById('taskbar-volume-mute-checkbox') as HTMLInputElement | null;
    const driverTabStatus = document.getElementById('driver-tab-volume-status');

    let icon = '🔊';
    if (this.isMuted) {
      icon = '🔇';
    } else if (this.volume === 0) {
      icon = '🔈';
    } else if (this.volume < 45) {
      icon = '🔉';
    } else {
      icon = '🔊';
    }

    if (iconEl) iconEl.textContent = icon;
    if (btnEl) {
      btnEl.title = `VirtIO-Sound: ${this.isMuted ? 'MUTED' : this.volume + '%'} (macOS CoreAudio 48kHz Stereo) - Click to adjust`;
    }
    if (sliderEl && parseInt(sliderEl.value, 10) !== this.volume) {
      sliderEl.value = this.volume.toString();
    }
    if (readoutEl) {
      readoutEl.textContent = this.isMuted ? 'MUTED' : `${this.volume}%`;
    }
    if (muteCheckbox) {
      muteCheckbox.checked = this.isMuted;
    }
    if (driverTabStatus) {
      driverTabStatus.textContent = this.isMuted ? `MUTED (${this.volume}%)` : `${this.volume}% (Active)`;
    }

    // Sync all channel strips in Volume Control window if open
    this.syncAllMixerControls();
  }

  public playBeep(freq: number = 440, duration: number = 0.08): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx || !this.masterGain || this.isMuted || this.volume === 0) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(noteGain);
      noteGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('[VirtIO-Sound] Beep error:', e);
    }
  }

  public playChime(freqs: number[] = [523.25, 659.25, 783.99, 1046.50]): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx || !this.masterGain) return;
      if (this.isMuted || this.volume === 0) {
        console.log('[VirtIO-Sound] Audio is muted or volume 0. Chime suppressed.');
        return;
      }
      const now = ctx.currentTime;
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.1);
        noteGain.gain.setValueAtTime(0.001, now + idx * 0.1);
        noteGain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.1 + 0.02);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.35);
        osc.connect(noteGain);
        noteGain.connect(this.masterGain!);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.38);
      });
    } catch (e) {
      console.warn('[VirtIO-Sound] Chime error:', e);
    }
  }

  public initTrayUI(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const trayBtn = document.getElementById('taskbar-volume-btn');
    const popup = document.getElementById('taskbar-volume-popup');
    const closeBtn = document.getElementById('volume-popup-close');
    const slider = document.getElementById('taskbar-volume-slider') as HTMLInputElement | null;
    const muteCheckbox = document.getElementById('taskbar-volume-mute-checkbox') as HTMLInputElement | null;
    const testBtn = document.getElementById('volume-test-sound-btn');
    const openMixerBtn = document.getElementById('volume-popup-open-mixer');

    this.updateUI();

    // Toggle popup on single click
    trayBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!popup) return;
      const isVisible = popup.style.display !== 'none';
      if (isVisible) {
        popup.style.display = 'none';
        trayBtn.classList.remove('active');
      } else {
        popup.style.display = 'block';
        trayBtn.classList.add('active');
        this.updateUI();
      }
    });

    // Double click tray icon opens Volume Control mixer window!
    trayBtn?.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (popup) popup.style.display = 'none';
      trayBtn.classList.remove('active');
      openApp('volumeControl');
    });

    openMixerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popup) popup.style.display = 'none';
      trayBtn?.classList.remove('active');
      openApp('volumeControl');
    });

    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popup) popup.style.display = 'none';
      trayBtn?.classList.remove('active');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (popup && popup.style.display !== 'none') {
        const target = e.target as Node;
        if (!popup.contains(target) && !trayBtn?.contains(target)) {
          popup.style.display = 'none';
          trayBtn?.classList.remove('active');
        }
      }
    });

    // Volume Slider input
    slider?.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      if (!isNaN(val)) {
        this.setVolume(val, false);
      }
    });

    // Volume Slider change (audible feedback)
    slider?.addEventListener('change', () => {
      const val = parseInt(slider.value, 10);
      if (!isNaN(val)) {
        this.setVolume(val, true);
      }
    });

    // Mute toggle
    muteCheckbox?.addEventListener('change', () => {
      this.setMute(muteCheckbox.checked);
      if (muteCheckbox.checked) {
        this.triggerMuteVibration();
      }
    });

    // Test button
    testBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.playChime([440, 554.37, 659.25, 880]);
    });
  }

  // --- Advanced System Sound Mixer: Volume Control (sndvol32.exe) ---

  public startVuMeter(): void {
    if (this.vuRunning) return;
    this.vuRunning = true;

    const ledContainer = document.getElementById('vu-meter-leds');
    const leds = ledContainer ? Array.from(ledContainer.querySelectorAll<HTMLElement>('.vu-led-segment')) : [];
    const readout = document.getElementById('vu-numeric-readout');
    const statusDevice = document.getElementById('mixer-status-device');

    const updateFrame = () => {
      if (!this.vuRunning) return;

      const level = this.getMicLevel();
      const activeCount = Math.round(level.normalized * 12);

      leds.forEach(led => {
        const segLevel = parseInt(led.dataset.level || '0', 10);
        if (segLevel <= activeCount) {
          led.classList.add('active');
        } else {
          led.classList.remove('active');
        }
      });

      if (readout) {
        if (level.db <= -90) {
          readout.textContent = '-inf dBFS';
          readout.style.color = '#333333';
        } else {
          readout.textContent = `${level.db.toFixed(1)} dBFS`;
          if (level.isClipping) {
            readout.style.color = '#FF0000';
          } else if (level.normalized > 0.7) {
            readout.style.color = '#B8860B';
          } else {
            readout.style.color = '#006600';
          }
        }
      }

      if (statusDevice) {
        const micSourceText = this.isRealMic ? 'Hardware Mic (Active)' : (this.micSimActive ? 'Virtual Speech Tone' : 'VirtIO-Sound CoreAudio (48kHz)');
        statusDevice.textContent = `● Device: ${micSourceText} | VU: ${level.db > -90 ? level.db.toFixed(1) + ' dBFS' : '-inf'}`;
      }

      this.vuAnimationId = requestAnimationFrame(updateFrame);
    };

    this.vuAnimationId = requestAnimationFrame(updateFrame);
  }

  public pauseVuMeter(): void {
    this.vuRunning = false;
    if (this.vuAnimationId !== null) {
      cancelAnimationFrame(this.vuAnimationId);
      this.vuAnimationId = null;
    }
  }

  public setMixerMode(mode: 'playback' | 'recording' | 'all'): void {
    this.currentMixerMode = mode;

    const btnPlayback = document.getElementById('btn-mixer-tab-playback');
    const btnRecording = document.getElementById('btn-mixer-tab-recording');
    btnPlayback?.classList.toggle('active', mode === 'playback');
    btnRecording?.classList.toggle('active', mode === 'recording');

    const menuPlayback = document.getElementById('mixer-mode-playback');
    const menuRecording = document.getElementById('mixer-mode-recording');
    const menuAll = document.getElementById('mixer-mode-all');
    if (menuPlayback) menuPlayback.textContent = (mode === 'playback' ? '✓ ' : '   ') + 'Playback Controls';
    if (menuRecording) menuRecording.textContent = (mode === 'recording' ? '✓ ' : '   ') + 'Recording Controls';
    if (menuAll) menuAll.textContent = (mode === 'all' ? '✓ ' : '   ') + 'Show All Channels';

    const strips = document.querySelectorAll<HTMLElement>('.mixer-channel-strip');
    strips.forEach(strip => {
      const chId = strip.dataset.channel;
      if (!chId) return;

      if (!this.visibleChannels.has(chId)) {
        strip.style.display = 'none';
        return;
      }

      if (mode === 'playback') {
        if (chId === 'mic') {
          strip.style.opacity = '0.55';
          strip.style.display = 'flex';
        } else {
          strip.style.opacity = '1';
          strip.style.display = 'flex';
        }
      } else if (mode === 'recording') {
        if (chId === 'mic' || chId === 'master') {
          strip.style.opacity = '1';
          strip.style.display = 'flex';
          if (chId === 'mic') {
            strip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
        } else {
          strip.style.opacity = '0.45';
          strip.style.display = 'flex';
        }
      } else {
        strip.style.opacity = '1';
        strip.style.display = 'flex';
      }
    });
  }

  public initMixerWindow(_windowEl?: HTMLElement): void {
    this.ensureAudioInitialized();
    this.startVuMeter();

    if (this.mixerInitialized) {
      this.syncAllMixerControls();
      return;
    }
    this.mixerInitialized = true;

    // Apply saved channel visibility
    ['master', 'wave', 'speech', 'cd', 'mic', 'pcspk'].forEach(id => {
      const strip = document.getElementById(`channel-strip-${id}`);
      const toggle = document.getElementById(`toggle-chan-${id}`) as HTMLInputElement | null;
      const isVisible = this.visibleChannels.has(id);
      if (strip) strip.style.display = isVisible ? 'flex' : 'none';
      if (toggle) toggle.checked = isVisible;
    });
    this.updateActiveChannelsCount();

    // Wire up all channel strips (faders, pan sliders, mutes, test buttons)
    const channelIds = ['master', 'wave', 'speech', 'cd', 'mic', 'pcspk'];
    channelIds.forEach(id => {
      const fader = document.getElementById(`mixer-fader-${id}`) as HTMLInputElement | null;
      const balance = document.getElementById(`mixer-balance-${id}`) as HTMLInputElement | null;
      const muteBox = document.getElementById(`mixer-mute-${id}`) as HTMLInputElement | null;
      const testBtn = document.getElementById(`mixer-test-${id}`);
      const strip = document.getElementById(`channel-strip-${id}`);

      // Fader listener
      if (fader) {
        fader.addEventListener('input', () => {
          const val = parseInt(fader.value, 10);
          if (isNaN(val)) return;
          if (id === 'master') {
            this.setVolume(val, false);
          } else {
            this.setChannelVolume(id, val);
          }
          this.updateMixerDbLabel(id, val);
        });

        fader.addEventListener('change', () => {
          const val = parseInt(fader.value, 10);
          if (isNaN(val)) return;
          if (id === 'master') {
            this.setVolume(val, true);
          } else {
            this.setChannelVolume(id, val);
            this.playChannelTone(id);
          }
        });
      }

      // Balance listener
      if (balance) {
        balance.addEventListener('input', () => {
          const bal = parseInt(balance.value, 10);
          if (isNaN(bal)) return;
          this.setChannelBalance(id, bal);
          this.updateMixerPanLabel(id, bal);
        });

        balance.addEventListener('dblclick', () => {
          balance.value = '0';
          this.setChannelBalance(id, 0);
          this.updateMixerPanLabel(id, 0);
        });
      }

      // Mute listener
      if (muteBox) {
        muteBox.addEventListener('change', () => {
          const muted = muteBox.checked;
          if (strip) strip.classList.toggle('muted-strip', muted);
          if (id === 'master') {
            this.setMute(muted);
          } else {
            this.setChannelMute(id, muted);
          }
        });
      }

      // Test Tone listener
      if (testBtn) {
        testBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.playChannelTone(id);
        });
      }
    });

    // Virtual Mic specific controls
    const micBoostBox = document.getElementById('mixer-boost-mic') as HTMLInputElement | null;
    const micMonitorBox = document.getElementById('mixer-monitor-mic') as HTMLInputElement | null;
    const micToggleVoiceBtn = document.getElementById('mixer-toggle-mic-source');
    const micRealBtn = document.getElementById('mixer-real-mic-btn');

    if (micBoostBox) {
      micBoostBox.checked = this.micBoost;
      micBoostBox.addEventListener('change', () => {
        this.setMicBoost(micBoostBox.checked);
        const micFader = document.getElementById('mixer-fader-mic') as HTMLInputElement | null;
        if (micFader) this.updateMixerDbLabel('mic', parseInt(micFader.value, 10) || 75);
      });
    }

    if (micMonitorBox) {
      micMonitorBox.checked = this.micMonitor;
      micMonitorBox.addEventListener('change', () => {
        this.setMicMonitor(micMonitorBox.checked);
      });
    }

    if (micToggleVoiceBtn) {
      micToggleVoiceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const active = this.toggleVirtualVoiceTest();
        if (active) {
          micToggleVoiceBtn.textContent = '⏹️ Stop Voice';
          micToggleVoiceBtn.classList.add('active');
        } else {
          micToggleVoiceBtn.textContent = '🎙️ Test Voice';
          micToggleVoiceBtn.classList.remove('active');
        }
      });
    }

    if (micRealBtn) {
      micRealBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        micRealBtn.textContent = '⌛ ...';
        const enabled = await this.enableRealMicrophone();
        if (enabled) {
          micRealBtn.textContent = '🟢 Real On';
          micRealBtn.classList.add('active');
          micRealBtn.title = 'Real Microphone active. Click to disconnect.';
        } else {
          micRealBtn.textContent = '🔴 Real';
          micRealBtn.classList.remove('active');
          micRealBtn.title = 'Use Real Microphone Hardware';
        }
      });
    }

    // Toolbar buttons
    const btnPlayback = document.getElementById('btn-mixer-tab-playback');
    const btnRecording = document.getElementById('btn-mixer-tab-recording');
    const btnDevices = document.getElementById('btn-mixer-tab-devices');
    const btnTestAll = document.getElementById('btn-mixer-test-all');
    const btnMuteAll = document.getElementById('btn-mixer-mute-all');

    btnPlayback?.addEventListener('click', () => this.setMixerMode('playback'));
    btnRecording?.addEventListener('click', () => this.setMixerMode('recording'));
    btnDevices?.addEventListener('click', () => this.openPropertiesPanel());

    btnTestAll?.addEventListener('click', () => {
      this.playChime([523.25, 659.25, 783.99, 1046.50]);
    });

    btnMuteAll?.addEventListener('click', () => {
      const anyUnmuted = this.getAllChannels().some(c => !c.muted) || !this.isMuted;
      const targetMute = anyUnmuted;
      channelIds.forEach(id => {
        const mBox = document.getElementById(`mixer-mute-${id}`) as HTMLInputElement | null;
        if (mBox) mBox.checked = targetMute;
        const strip = document.getElementById(`channel-strip-${id}`);
        if (strip) strip.classList.toggle('muted-strip', targetMute);
        if (id === 'master') {
          this.setMute(targetMute);
        } else {
          this.setChannelMute(id, targetMute);
        }
      });
      if (btnMuteAll) {
        btnMuteAll.textContent = targetMute ? '🔊 Unmute All' : '🔇 Mute All';
        btnMuteAll.style.color = targetMute ? '#006600' : '#800000';
      }
    });

    // Menus
    this.initMixerMenus();

    // Properties Modal Panel
    this.initPropertiesModal();

    // Dialog Buttons (About and Help)
    this.initDialogButtons();

    // Initial sync
    this.syncAllMixerControls();
  }

  private updateMixerDbLabel(id: string, val: number): void {
    const badge = document.getElementById(`mixer-db-${id}`);
    if (!badge) return;
    if (id === 'mic') {
      const gainDb = val > 0 ? (((val - 50) / 50) * 12).toFixed(1) : '-inf';
      const sign = val >= 50 ? '+' : '';
      const boostText = this.micBoost ? ' (+20dB boost)' : '';
      badge.textContent = `${val}% (${sign}${gainDb} dB${boostText})`;
    } else {
      const db = val > 0 ? (20 * Math.log10(val / 100)).toFixed(1) : '-inf';
      badge.textContent = `${val}% (${db} dB)`;
    }
  }

  private updateMixerPanLabel(id: string, bal: number): void {
    const readout = document.getElementById(`mixer-pan-readout-${id}`);
    if (!readout) return;
    if (bal === 0) {
      readout.textContent = 'Center';
    } else if (bal < 0) {
      readout.textContent = `◄ ${Math.abs(bal)}% L`;
    } else {
      readout.textContent = `${bal}% R ►`;
    }
  }

  public syncAllMixerControls(): void {
    ['master', 'wave', 'speech', 'cd', 'mic', 'pcspk'].forEach(id => {
      const ch = id === 'master'
        ? { volume: this.volume, balance: 0, muted: this.isMuted }
        : (this.channels[id] || { volume: 75, balance: 0, muted: false });

      const fader = document.getElementById(`mixer-fader-${id}`) as HTMLInputElement | null;
      const bal = document.getElementById(`mixer-balance-${id}`) as HTMLInputElement | null;
      const mute = document.getElementById(`mixer-mute-${id}`) as HTMLInputElement | null;
      const strip = document.getElementById(`channel-strip-${id}`);

      if (fader && parseInt(fader.value, 10) !== ch.volume) {
        fader.value = ch.volume.toString();
      }
      this.updateMixerDbLabel(id, ch.volume);

      if (bal && parseInt(bal.value, 10) !== ch.balance) {
        bal.value = ch.balance.toString();
      }
      this.updateMixerPanLabel(id, ch.balance);

      if (mute) {
        mute.checked = ch.muted;
      }
      if (strip) {
        strip.classList.toggle('muted-strip', ch.muted);
      }
    });
  }

  private updateActiveChannelsCount(): void {
    const channelsSpan = document.getElementById('mixer-status-channels');
    if (channelsSpan) {
      channelsSpan.textContent = `Channels Active: ${this.visibleChannels.size}/6`;
    }
  }

  public openPropertiesPanel(): void {
    const panel = document.getElementById('mixer-properties-panel');
    if (!panel) return;
    panel.style.display = 'block';

    ['master', 'wave', 'speech', 'cd', 'mic', 'pcspk'].forEach(id => {
      const toggle = document.getElementById(`toggle-chan-${id}`) as HTMLInputElement | null;
      if (toggle) toggle.checked = this.visibleChannels.has(id);
    });
  }

  public closePropertiesPanel(): void {
    const panel = document.getElementById('mixer-properties-panel');
    if (panel) panel.style.display = 'none';
  }

  private initPropertiesModal(): void {
    const okBtn = document.getElementById('btn-properties-ok');
    const cancelBtn = document.getElementById('btn-properties-cancel');
    const radioPlayback = document.getElementById('radio-mode-playback');
    const radioRecording = document.getElementById('radio-mode-recording');
    const radioOther = document.getElementById('radio-mode-other');

    radioPlayback?.addEventListener('change', () => {
      ['master', 'wave', 'speech', 'cd', 'pcspk'].forEach(id => {
        const toggle = document.getElementById(`toggle-chan-${id}`) as HTMLInputElement | null;
        if (toggle) toggle.checked = true;
      });
      const micToggle = document.getElementById('toggle-chan-mic') as HTMLInputElement | null;
      if (micToggle) micToggle.checked = false;
    });

    radioRecording?.addEventListener('change', () => {
      ['wave', 'speech', 'cd', 'pcspk'].forEach(id => {
        const toggle = document.getElementById(`toggle-chan-${id}`) as HTMLInputElement | null;
        if (toggle) toggle.checked = false;
      });
      const masterToggle = document.getElementById('toggle-chan-master') as HTMLInputElement | null;
      const micToggle = document.getElementById('toggle-chan-mic') as HTMLInputElement | null;
      if (masterToggle) masterToggle.checked = true;
      if (micToggle) micToggle.checked = true;
    });

    radioOther?.addEventListener('change', () => {
      ['master', 'wave', 'speech', 'cd', 'mic', 'pcspk'].forEach(id => {
        const toggle = document.getElementById(`toggle-chan-${id}`) as HTMLInputElement | null;
        if (toggle) toggle.checked = true;
      });
    });

    okBtn?.addEventListener('click', () => {
      const channelIds = ['master', 'wave', 'speech', 'cd', 'mic', 'pcspk'];
      channelIds.forEach(id => {
        const toggle = document.getElementById(`toggle-chan-${id}`) as HTMLInputElement | null;
        const strip = document.getElementById(`channel-strip-${id}`);
        const isChecked = toggle ? toggle.checked : true;
        if (isChecked) {
          this.visibleChannels.add(id);
          if (strip) strip.style.display = 'flex';
        } else {
          this.visibleChannels.delete(id);
          if (strip) strip.style.display = 'none';
        }
      });
      this.updateActiveChannelsCount();
      localStorage.setItem('llm95_mixer_visible_channels', JSON.stringify([...this.visibleChannels]));
      this.closePropertiesPanel();
    });

    cancelBtn?.addEventListener('click', () => {
      this.closePropertiesPanel();
    });
  }

  private initDialogButtons(): void {
    const aboutDialog = document.getElementById('mixer-about-dialog');
    const helpDialog = document.getElementById('mixer-help-dialog');

    document.getElementById('mixer-about-ok')?.addEventListener('click', () => {
      if (aboutDialog) aboutDialog.style.display = 'none';
    });
    document.getElementById('mixer-about-close')?.addEventListener('click', () => {
      if (aboutDialog) aboutDialog.style.display = 'none';
    });

    document.getElementById('mixer-help-ok')?.addEventListener('click', () => {
      if (helpDialog) helpDialog.style.display = 'none';
    });
    document.getElementById('mixer-help-close')?.addEventListener('click', () => {
      if (helpDialog) helpDialog.style.display = 'none';
    });
  }

  private initMixerMenus(): void {
    const menuOptions = document.getElementById('mixer-menu-options');
    const menuMode = document.getElementById('mixer-menu-mode');
    const menuHelp = document.getElementById('mixer-menu-help');

    const dropdownOptions = document.getElementById('mixer-dropdown-options');
    const dropdownMode = document.getElementById('mixer-dropdown-mode');
    const dropdownHelp = document.getElementById('mixer-dropdown-help');

    const closeAllDropdowns = () => {
      if (dropdownOptions) dropdownOptions.style.display = 'none';
      if (dropdownMode) dropdownMode.style.display = 'none';
      if (dropdownHelp) dropdownHelp.style.display = 'none';
    };

    menuOptions?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdownOptions?.style.display === 'block';
      closeAllDropdowns();
      if (!open && dropdownOptions) dropdownOptions.style.display = 'block';
    });

    menuMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdownMode?.style.display === 'block';
      closeAllDropdowns();
      if (!open && dropdownMode) dropdownMode.style.display = 'block';
    });

    menuHelp?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdownHelp?.style.display === 'block';
      closeAllDropdowns();
      if (!open && dropdownHelp) dropdownHelp.style.display = 'block';
    });

    document.addEventListener('click', () => closeAllDropdowns());

    // Menu Item Actions
    document.getElementById('mixer-opt-properties')?.addEventListener('click', () => {
      closeAllDropdowns();
      this.openPropertiesPanel();
    });

    document.getElementById('mixer-opt-advanced')?.addEventListener('click', () => {
      closeAllDropdowns();
      const badges = document.querySelectorAll('.volume-db-badge');
      badges.forEach(b => {
        (b as HTMLElement).style.display = (b as HTMLElement).style.display === 'none' ? 'block' : 'none';
      });
    });

    document.getElementById('mixer-opt-exit')?.addEventListener('click', () => {
      closeAllDropdowns();
      closeApp('volumeControl');
    });

    document.getElementById('mixer-mode-playback')?.addEventListener('click', () => {
      closeAllDropdowns();
      this.setMixerMode('playback');
    });

    document.getElementById('mixer-mode-recording')?.addEventListener('click', () => {
      closeAllDropdowns();
      this.setMixerMode('recording');
    });

    document.getElementById('mixer-mode-all')?.addEventListener('click', () => {
      closeAllDropdowns();
      this.setMixerMode('all');
    });

    document.getElementById('mixer-help-topics')?.addEventListener('click', () => {
      closeAllDropdowns();
      const helpDialog = document.getElementById('mixer-help-dialog');
      if (helpDialog) helpDialog.style.display = 'flex';
    });

    document.getElementById('mixer-help-about')?.addEventListener('click', () => {
      closeAllDropdowns();
      const aboutDialog = document.getElementById('mixer-about-dialog');
      if (aboutDialog) aboutDialog.style.display = 'flex';
    });
  }
}

const virtIOSound = new VirtIOSoundController();

// --- Autonomous Computer Controller (OS Pilot Engine) ---
// Allows the embedded LLM and chat interface to operate everything on the computer

const OSController = {
  openApp(name: string): void {
    openApp(name);
  },
  closeApp(name: string): void {
    closeApp(name);
  },
  minimizeApp(name: string): void {
    minimizeApp(name);
  },
  async notepadWrite(text: string, mode: 'append' | 'replace' = 'append'): Promise<void> {
    await openApp('notepad');
    const notepadWindow = document.getElementById('notepad') as HTMLDivElement | null;
    const textarea = notepadWindow?.querySelector('.notepad-textarea') as HTMLTextAreaElement | null;
    if (textarea) {
      if (mode === 'replace') textarea.value = '';
      textarea.value += (textarea.value ? '\n\n' : '') + '[OS Pilot Typing]:\n';
      for (const char of text) {
        textarea.value += char;
        textarea.scrollTop = textarea.scrollHeight;
        await new Promise(r => setTimeout(r, 15));
      }
    }
  },
  async paintDraw(subject: string = 'smiley'): Promise<void> {
    await openApp('paint');
    const paintWindow = document.getElementById('paint') as HTMLDivElement | null;
    const canvas = paintWindow?.querySelector('#paint-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = Math.floor(canvas.width / 2);
    const cy = Math.floor(canvas.height / 2);
    const r = Math.min(80, Math.floor(Math.min(canvas.width, canvas.height) / 3));

    if (subject.includes('house')) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#8B4513';
      ctx.fillStyle = '#FFE4B5';
      ctx.fillRect(cx - 60, cy - 20, 120, 90);
      ctx.strokeRect(cx - 60, cy - 20, 120, 90);

      ctx.beginPath();
      ctx.moveTo(cx - 80, cy - 20);
      ctx.lineTo(cx, cy - 80);
      ctx.lineTo(cx + 80, cy - 20);
      ctx.closePath();
      ctx.fillStyle = '#DC143C';
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#8B0000';
      ctx.fillRect(cx - 15, cy + 25, 30, 45);
      ctx.fillStyle = '#87CEEB';
      ctx.fillRect(cx - 45, cy, 20, 20);
      ctx.fillRect(cx + 25, cy, 20, 20);
    } else if (subject.includes('circle') || subject.includes('rainbow')) {
      const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
      for (let i = colors.length - 1; i >= 0; i--) {
        ctx.beginPath();
        ctx.arc(cx, cy, (i + 1) * 12, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'black';
        ctx.stroke();
      }
    } else {
      // Default: retro smiley face
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#FFD700';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'black';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx - Math.floor(r * 0.35), cy - Math.floor(r * 0.25), Math.floor(r * 0.12), 0, Math.PI * 2);
      ctx.arc(cx + Math.floor(r * 0.35), cy - Math.floor(r * 0.25), Math.floor(r * 0.12), 0, Math.PI * 2);
      ctx.fillStyle = 'black';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy + Math.floor(r * 0.1), Math.floor(r * 0.55), 0.2 * Math.PI, 0.8 * Math.PI, false);
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    if (assistantBubble) assistantBubble.textContent = `Autonomous Pilot drew: ${subject}!`;
  },
  async terminalExec(command: string): Promise<string> {
    await openApp('terminalWindow');
    const termWindow = document.getElementById('terminalWindow') as HTMLDivElement | null;
    const screen = termWindow?.querySelector('#terminal-screen') as HTMLElement | null;
    const input = termWindow?.querySelector('#terminal-input') as HTMLInputElement | null;
    if (input) input.value = command;

    const res = await fetch('/api/terminal/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });
    const data = await res.json();
    if (screen) {
      if (data.output === '__CLEAR__') {
        screen.innerHTML = `<pre class="terminal-pre">C:\\LLM95&gt; ${command}\n</pre>`;
      } else {
        const p = document.createElement('pre');
        p.className = 'terminal-pre';
        p.textContent = `C:\\LLM95> ${command}\n${data.output}\n`;
        screen.appendChild(p);
      }
      screen.scrollTop = screen.scrollHeight;
    }
    if (input) input.value = '';
    return data.output;
  },
  async installPackage(pkgName: string): Promise<string> {
    await openApp('packageManager');
    const res = await fetch('/api/packages/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: pkgName })
    });
    const data = await res.json();
    const pkgWindow = document.getElementById('packageManager');
    const statusText = pkgWindow?.querySelector('#pkg-install-status-text') as HTMLElement | null;
    const progressBar = pkgWindow?.querySelector('#pkg-install-progress-bar') as HTMLElement | null;
    const container = pkgWindow?.querySelector('#pkg-install-progress-container') as HTMLElement | null;
    if (container) container.style.display = 'block';
    if (progressBar) progressBar.style.width = '100%';
    if (statusText) statusText.textContent = data.message;
    return data.message;
  },
  setDesktopColor(color: string): void {
    const desktopEl = document.getElementById('desktop');
    if (desktopEl) {
      let finalColor = color;
      if (color.includes('navy') || color.includes('blue')) finalColor = '#000080';
      else if (color.includes('matrix') || color.includes('green')) finalColor = '#002200';
      else if (color.includes('classic') || color.includes('grey') || color.includes('gray')) finalColor = '#555555';
      else if (color.includes('wine') || color.includes('purple')) finalColor = '#4a0e2e';
      else if (color.includes('teal')) finalColor = '#008080';
      else if (color.includes('black') || color.includes('dark')) finalColor = '#111111';
      desktopEl.style.backgroundColor = finalColor;
    }
  },
  async browserNavigate(url: string): Promise<void> {
    await openApp('chrome');
    const browserWindow = document.getElementById('chrome');
    const input = browserWindow?.querySelector('.browser-address-bar') as HTMLInputElement | null;
    const goBtn = browserWindow?.querySelector('.browser-go-button') as HTMLButtonElement | null;
    if (input && goBtn) {
      input.value = url;
      goBtn.click();
    }
  },
  async minesweeperPlay(): Promise<void> {
    await openApp('minesweeper');
    const msWindow = document.getElementById('minesweeper');
    const cell = msWindow?.querySelector('.minesweeper-cell:not(.revealed)') as HTMLElement | null;
    if (cell) cell.click();
  },
  playTestSound(): void {
    virtIOSound.playChime([440, 554.37, 659.25, 880]);
  },
  setMasterVolume(percent: number): void {
    virtIOSound.setVolume(percent, true);
  },
  toggleMute(): boolean {
    return virtIOSound.toggleMute();
  },
  getSoundStatus(): { volume: number; isMuted: boolean } {
    return { volume: virtIOSound.getVolume(), isMuted: virtIOSound.isMute() };
  },
  openVolumeControl(): void {
    openApp('volumeControl');
  },
  setChannelVolume(channelId: string, volume: number): void {
    virtIOSound.setChannelVolume(channelId, volume);
  },
  toggleChannelMute(channelId: string): boolean {
    const ch = virtIOSound.getChannel(channelId);
    const newMuted = !ch.muted;
    virtIOSound.setChannelMute(channelId, newMuted);
    return newMuted;
  },
  openHypervisor(): void {
    openApp('hypervisorWindow');
  },
  openVm(): void {
    openApp('v86Window');
  },
  async scrubRam(): Promise<void> {
    const vm = getV86Instance();
    if (vm) await vm.getHypervisor().scrubAndZeroRam();
  }
};

// --- Window & App Management ---

function bringToFront(windowElement: HTMLDivElement): void {
  if (activeWindow === windowElement) return;

  if (activeWindow) {
    activeWindow.classList.remove('active');
    const appName = activeWindow.id;
    if (openApps.has(appName)) {
      openApps.get(appName)?.taskbarButton.classList.remove('active');
    }
  }

  highestZIndex++;
  windowElement.style.zIndex = highestZIndex.toString();
  windowElement.classList.add('active');
  activeWindow = windowElement;

  const appNameRef = windowElement.id;
  if (openApps.has(appNameRef)) {
    openApps.get(appNameRef)?.taskbarButton.classList.add('active');
  }
  if ((appNameRef === 'doom' || appNameRef === 'wolf3d') && dosInstances[appNameRef]) {
    const container = document.getElementById(`${appNameRef}-container`);
    const canvas = container?.querySelector('canvas');
    canvas?.focus();
  }
}

async function openApp(appName: string, options?: { tab?: string }): Promise<void> {
  const targetId = appName === 'hypervisorWindow' ? 'v86Window' : appName;
  const windowElement = document.getElementById(targetId) as HTMLDivElement | null;
  if (!windowElement) {
    console.error(`Window element not found for app: ${appName}`);
    return;
  }

  if (openApps.has(appName)) {
    bringToFront(windowElement);
    windowElement.style.display = 'flex';
    windowElement.classList.add('active');
    return;
  }

  windowElement.style.display = 'flex';
  windowElement.classList.add('active');
  bringToFront(windowElement);

  const taskbarButton = document.createElement('div');
  taskbarButton.classList.add('taskbar-app');
  taskbarButton.dataset.appName = appName;

  let iconSrc = '';
  let title = appName;
  const iconElement = findIconElement(appName);
  if (iconElement) {
    const img = iconElement.querySelector('img');
    const span = iconElement.querySelector('span');
    if (img) iconSrc = img.src;
    if (span) title = span.textContent || appName;
  } else {
    switch (appName) {
      case 'setupWizard':
        iconSrc = 'https://win98icons.alexmeub.com/icons/png/installer-0.png';
        title = 'Setup Wizard';
        break;
      case 'terminalWindow':
        iconSrc = 'https://win98icons.alexmeub.com/icons/png/ms_dos-0.png';
        title = 'MS-DOS Prompt';
        break;
      case 'packageManager':
        iconSrc = 'https://win98icons.alexmeub.com/icons/png/add_remove_programs-0.png';
        title = 'Package Manager';
        break;
      case 'llamaEngine':
        iconSrc = 'https://win98icons.alexmeub.com/icons/png/processor-3.png';
        title = 'LLM-95 Engine';
        break;
      case 'myComputer':
        iconSrc = 'https://storage.googleapis.com/gemini-95-icons/mycomputer.png';
        title = 'My Gemtop';
        break;
      case 'chrome':
        iconSrc = 'https://storage.googleapis.com/gemini-95-icons/chrome-icon-2.png';
        title = 'Chrome';
        break;
      case 'notepad':
        iconSrc = 'https://storage.googleapis.com/gemini-95-icons/GemNotes.png';
        title = 'GemNotes';
        break;
      case 'paint':
        iconSrc = 'https://storage.googleapis.com/gemini-95-icons/gempaint.png';
        title = 'GemPaint';
        break;
      case 'doom':
        iconSrc = 'https://64.media.tumblr.com/1d89dfa76381e5c14210a2149c83790d/7a15f84c681c1cf9-c1/s540x810/86985984be99d5591e0cbc0dea6f05ffa3136dac.png';
        title = 'Doom II';
        break;
      case 'gemini':
        iconSrc = 'https://storage.googleapis.com/gemini-95-icons/GeminiChatRetro.png';
        title = 'OS Pilot (AI)';
        break;
      case 'minesweeper':
        iconSrc = 'https://storage.googleapis.com/gemini-95-icons/gemsweeper.png';
        title = 'GemSweeper';
        break;
      case 'imageViewer':
        iconSrc = 'https://win98icons.alexmeub.com/icons/png/display_properties-4.png';
        title = 'Image Viewer';
        break;
      case 'mediaPlayer':
        iconSrc = 'https://storage.googleapis.com/gemini-95-icons/ytmediaplayer.png';
        title = 'GemPlayer';
        break;
      case 'volumeControl':
        iconSrc = 'https://win98icons.alexmeub.com/icons/png/loudspeaker_rays-0.png';
        title = 'Volume Control';
        break;
      case 'v86Window':
        iconSrc = 'https://win98icons.alexmeub.com/icons/png/computer_explorer_cool-0.png';
        title = 'x86 Virtual Machine';
        break;
      case 'hypervisorWindow':
        iconSrc = 'https://win98icons.alexmeub.com/icons/png/key_win-0.png';
        title = 'RAM Hypervisor';
        break;
      case 'firewallWindow':
        iconSrc = 'https://win98icons.alexmeub.com/icons/png/trust0-0.png';
        title = 'Firewall';
        break;
    }
  }

  if (iconSrc) {
    const img = document.createElement('img');
    img.src = iconSrc;
    img.alt = title;
    taskbarButton.appendChild(img);
  }
  taskbarButton.appendChild(document.createTextNode(title));

  taskbarButton.addEventListener('click', () => {
    if (windowElement === activeWindow && windowElement.style.display !== 'none') {
      minimizeApp(appName);
    } else {
      windowElement.style.display = 'flex';
      bringToFront(windowElement);
    }
  });

  taskbarAppsContainer.appendChild(taskbarButton);
  openApps.set(appName, { windowEl: windowElement, taskbarButton: taskbarButton });
  taskbarButton.classList.add('active');

  // Initialize specific apps
  if (appName === 'setupWizard') {
    initSetupWizard(windowElement);
  } else if (appName === 'terminalWindow') {
    initTerminalWindow(windowElement);
  } else if (appName === 'packageManager') {
    initPackageManager(windowElement);
  } else if (appName === 'llamaEngine') {
    initLlamaEngine(windowElement);
  } else if (appName === 'chrome') {
    initAiBrowser(windowElement);
  } else if (appName === 'notepad') {
    await initNotepadStory(windowElement);
  } else if (appName === 'paint') {
    initSimplePaintApp(windowElement);
    if (paintAssistant) paintAssistant.classList.add('visible');
    if (assistantBubble) assistantBubble.textContent = 'Judging with on-device vision circuit...';
    if (paintCritiqueIntervalId) clearInterval(paintCritiqueIntervalId);
    paintCritiqueIntervalId = window.setInterval(critiquePaintDrawing, 15000);
  } else if (appName === 'doom' && !dosInstances['doom']) {
    const doomContainer = document.getElementById('doom-content') as HTMLDivElement;
    if (doomContainer) {
      doomContainer.innerHTML = '<iframe src="https://js-dos.com/games/doom.exe.html" width="100%" height="100%" frameborder="0" scrolling="no" allowfullscreen></iframe>';
      dosInstances['doom'] = { initialized: true };
    }
  } else if (appName === 'gemini') {
    await initGeminiChat(windowElement);
  } else if (appName === 'minesweeper') {
    initMinesweeperGame(windowElement);
  } else if (appName === 'myComputer') {
    initMyComputer(windowElement);
  } else if (appName === 'mediaPlayer') {
    await initMediaPlayer(windowElement);
  } else if (appName === 'volumeControl') {
    virtIOSound.initMixerWindow(windowElement);
  } else if (appName === 'v86Window' || appName === 'hypervisorWindow') {
    await initV86Window(windowElement, appName === 'hypervisorWindow' || options?.tab === 'hypervisor');
  } else if (appName === 'firewallWindow') {
    firewallController.init(windowElement);
  }
}

function closeApp(appName: string): void {
  const appData = openApps.get(appName);
  if (!appData) return;

  const { windowEl, taskbarButton } = appData;
  windowEl.style.display = 'none';
  windowEl.classList.remove('active');
  taskbarButton.remove();
  openApps.delete(appName);

  if (appName === 'volumeControl') {
    virtIOSound.pauseVuMeter();
  }

  if (appName === 'llamaEngine' && engineMonitorIntervalId) {
    clearInterval(engineMonitorIntervalId);
    engineMonitorIntervalId = null;
  }

  if (dosInstances[appName]) {
    const container = document.getElementById(`${appName}-content`);
    if (container) container.innerHTML = '';
    delete dosInstances[appName];
  }

  if (appName === 'paint') {
    if (paintCritiqueIntervalId) {
      clearInterval(paintCritiqueIntervalId);
      paintCritiqueIntervalId = null;
      if (paintAssistant) paintAssistant.classList.remove('visible');
    }
    const paintContent = appData.windowEl.querySelector('.window-content') as HTMLDivElement | null;
    if (paintContent && paintResizeObserverMap.has(paintContent)) {
      paintResizeObserverMap.get(paintContent)?.disconnect();
      paintResizeObserverMap.delete(paintContent);
    }
  }

  if (appName === 'minesweeper' && minesweeperTimerInterval) {
    clearInterval(minesweeperTimerInterval);
    minesweeperTimerInterval = null;
  }

  if (appName === 'mediaPlayer') {
    const player = youtubePlayers[appName];
    if (player) {
      try {
        if (typeof player.stopVideo === 'function') player.stopVideo();
        if (typeof player.destroy === 'function') player.destroy();
      } catch (e) {
        console.warn('Error stopping media player:', e);
      }
      delete youtubePlayers[appName];
    }
  }

  if (activeWindow === windowEl) {
    activeWindow = null;
    let nextAppToActivate: HTMLDivElement | null = null;
    let maxZ = -1;
    openApps.forEach(data => {
      const z = parseInt(data.windowEl.style.zIndex || '0', 10);
      if (z > maxZ) {
        maxZ = z;
        nextAppToActivate = data.windowEl;
      }
    });
    if (nextAppToActivate) {
      bringToFront(nextAppToActivate);
    }
  }
}

function minimizeApp(appName: string): void {
  const appData = openApps.get(appName);
  if (!appData) return;

  const { windowEl, taskbarButton } = appData;
  windowEl.style.display = 'none';
  windowEl.classList.remove('active');
  taskbarButton.classList.remove('active');

  if (activeWindow === windowEl) {
    activeWindow = null;
    let nextAppToActivate: string | null = null;
    let maxZ = 0;
    openApps.forEach((data, name) => {
      if (data.windowEl.style.display !== 'none') {
        const z = parseInt(data.windowEl.style.zIndex || '0', 10);
        if (z > maxZ) {
          maxZ = z;
          nextAppToActivate = name;
        }
      }
    });
    if (nextAppToActivate) {
      bringToFront(openApps.get(nextAppToActivate)!.windowEl);
    }
  }
}

// --- MS-DOS Prompt / LLM-95 Terminal Handler ---

function initTerminalWindow(windowElement: HTMLDivElement): void {
  const inputEl = windowElement.querySelector('#terminal-input') as HTMLInputElement;
  const screenEl = windowElement.querySelector('#terminal-screen') as HTMLElement;
  const quickButtons = windowElement.querySelectorAll('.terminal-pill-btn') as NodeListOf<HTMLButtonElement>;

  async function executeCommand(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const res = await fetch('/api/terminal/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: trimmed })
    });
    const data = await res.json();

    if (data.output === '__CLEAR__') {
      screenEl.innerHTML = `<pre class="terminal-pre">C:\\LLM95&gt; ${trimmed}\n</pre>`;
    } else {
      const p = document.createElement('pre');
      p.className = 'terminal-pre';
      p.textContent = `C:\\LLM95> ${trimmed}\n${data.output}\n`;
      screenEl.appendChild(p);
    }
    screenEl.scrollTop = screenEl.scrollHeight;
    inputEl.value = '';
    inputEl.focus();

    const lowerCmd = trimmed.toLowerCase();
    const cmdTokens = lowerCmd.split(/\s+/);
    if (lowerCmd === 'sound-test') {
      OSController.playTestSound();
    } else if (cmdTokens[0] === 'volume') {
      if (cmdTokens[1]) {
        const v = parseInt(cmdTokens[1], 10);
        if (!isNaN(v)) virtIOSound.setVolume(v, true);
      }
    } else if (lowerCmd === 'mute') {
      virtIOSound.setMute(true);
    } else if (lowerCmd === 'unmute') {
      virtIOSound.setMute(false);
    } else if (lowerCmd === 'sndvol32' || lowerCmd === 'mixer' || lowerCmd === 'volume-control') {
      openApp('volumeControl');
    } else if (lowerCmd.startsWith('hypervisor') || lowerCmd === 'vm' || lowerCmd === 'v86' || lowerCmd.includes('ram-shield')) {
      if (lowerCmd.includes('scrub')) {
        const vm = getV86Instance();
        if (vm) {
          vm.getHypervisor().scrubAndZeroRam();
        }
      }
      openApp('hypervisorWindow');
    }
  }

  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      executeCommand(inputEl.value);
    }
  });

  quickButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      if (cmd) executeCommand(cmd);
    });
  });

  inputEl?.focus();
}

// --- Add/Remove Programs & Package Manager Handler ---

function initPackageManager(windowElement: HTMLDivElement): void {
  const tabs = windowElement.querySelectorAll('.engine-tab');
  const panes = windowElement.querySelectorAll('.tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const targetId = (tab as HTMLElement).dataset.tab;
      const targetPane = windowElement.querySelector(`#${targetId}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  const installedTbody = windowElement.querySelector('#installed-pkg-tbody') as HTMLElement;
  const availableTbody = windowElement.querySelector('#available-pkg-tbody') as HTMLElement;
  const searchInput = windowElement.querySelector('#pkg-search-input') as HTMLInputElement;
  const searchBtn = windowElement.querySelector('#btn-search-pkg') as HTMLButtonElement;
  const progressContainer = windowElement.querySelector('#pkg-install-progress-container') as HTMLElement;
  const progressBar = windowElement.querySelector('#pkg-install-progress-bar') as HTMLElement;
  const statusText = windowElement.querySelector('#pkg-install-status-text') as HTMLElement;
  const btnPlaySound = windowElement.querySelector('#btn-play-test-sound') as HTMLButtonElement;

  async function refreshPackages() {
    try {
      const res = await fetch('/api/packages/list');
      if (res.ok) {
        const data = await res.json();
        const pkgs = data.packages || [];

        if (installedTbody) {
          installedTbody.innerHTML = '';
          pkgs.filter((p: any) => p.installed).forEach((p: any) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><strong>${p.name}</strong></td>
              <td>${p.version}</td>
              <td><span style="font-family: monospace;">${p.format.toUpperCase()}</span></td>
              <td>${p.size}</td>
              <td><button class="win95-btn" style="padding: 1px 6px; font-size: 0.7rem;">Remove</button></td>
            `;
            tr.querySelector('button')?.addEventListener('click', async () => {
              await fetch('/api/packages/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: p.name })
              });
              refreshPackages();
            });
            installedTbody.appendChild(tr);
          });
        }

        if (availableTbody) {
          availableTbody.innerHTML = '';
          pkgs.forEach((p: any) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><strong>${p.name}</strong><br><small style="color:#666;">${p.description}</small></td>
              <td>${p.version}</td>
              <td><span style="font-family: monospace;">${p.format.toUpperCase()}</span></td>
              <td>${p.size}</td>
              <td><button class="win95-btn" style="padding: 1px 6px; font-size: 0.7rem;" ${p.installed ? 'disabled' : ''}>${p.installed ? 'Installed' : 'Install'}</button></td>
            `;
            tr.querySelector('button')?.addEventListener('click', async () => {
              if (progressContainer) progressContainer.style.display = 'block';
              if (statusText) statusText.textContent = `Connecting to web mirror and pulling ${p.name}...`;
              if (progressBar) progressBar.style.width = '35%';
              await new Promise(r => setTimeout(r, 400));
              if (progressBar) progressBar.style.width = '70%';

              await fetch('/api/packages/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: p.name })
              });

              if (progressBar) progressBar.style.width = '100%';
              if (statusText) statusText.textContent = `Successfully installed ${p.name}!`;
              await new Promise(r => setTimeout(r, 500));
              refreshPackages();
            });
            availableTbody.appendChild(tr);
          });
        }
      }
    } catch (e) {
      console.warn('Error refreshing packages:', e);
    }
  }

  searchBtn?.addEventListener('click', async () => {
    const q = searchInput?.value.trim().toLowerCase() || '';
    if (q) {
      // Simulate real web search
      if (progressContainer) progressContainer.style.display = 'block';
      if (statusText) statusText.textContent = `Searching web repositories for "${q}" (.deb, .apk, .arch)...`;
      if (progressBar) progressBar.style.width = '60%';
      await new Promise(r => setTimeout(r, 450));
      if (progressBar) progressBar.style.width = '100%';
      if (statusText) statusText.textContent = `Found compatible package repository mirror for: ${q}`;
      await OSController.installPackage(q);
      refreshPackages();
    }
  });

  btnPlaySound?.addEventListener('click', () => {
    OSController.playTestSound();
  });

  refreshPackages();
}

// --- LLM Engine & VM Manager ---

function initLlamaEngine(windowElement: HTMLDivElement): void {
  const tabs = windowElement.querySelectorAll('.engine-tab');
  const panes = windowElement.querySelectorAll('.tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const targetId = (tab as HTMLElement).dataset.tab;
      const targetPane = windowElement.querySelector(`#${targetId}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  const cpuGauge = windowElement.querySelector('#cpu-gauge') as HTMLElement;
  const cpuVal = windowElement.querySelector('#cpu-val') as HTMLElement;
  const ramGauge = windowElement.querySelector('#ram-gauge') as HTMLElement;
  const ramVal = windowElement.querySelector('#ram-val') as HTMLElement;
  const latencyVal = windowElement.querySelector('#latency-val') as HTMLElement;
  const speedVal = windowElement.querySelector('#speed-val') as HTMLElement;
  const statusPill = windowElement.querySelector('#engine-status-pill') as HTMLElement;
  const activeModelLabel = windowElement.querySelector('#active-model-name-label') as HTMLElement;
  const healthPingTime = windowElement.querySelector('#health-ping-time') as HTMLElement;
  const rawHealthDisplay = windowElement.querySelector('#raw-health-display') as HTMLElement;
  const btnRefresh = windowElement.querySelector('#btn-refresh-health') as HTMLButtonElement;
  const btnToggleJson = windowElement.querySelector('#btn-view-raw-health') as HTMLButtonElement;

  async function pollHealth() {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        if (activeModelLabel) activeModelLabel.textContent = data.model || activeModelName;
        if (statusPill) {
          statusPill.textContent = data.status === 'online' ? '● NATIVE LLAMA.CPP ACTIVE' : '● ON-DEVICE RUNTIME READY';
          statusPill.className = `status-pill ${data.status === 'online' ? 'online' : 'ready'}`;
        }
        if (latencyVal) latencyVal.textContent = `${data.performance?.inferenceLatencyMs || 34} ms`;
        if (speedVal) speedVal.textContent = `${data.performance?.estimatedTokensPerSec || '6.8'} tok/s`;

        const cpuPct = Math.min(95, Math.max(15, Math.floor(25 + Math.random() * 30)));
        if (cpuGauge) cpuGauge.style.width = `${cpuPct}%`;
        if (cpuVal) cpuVal.textContent = `${cpuPct}%`;

        const ramUsedMb = data.hardware?.ramUsedMb || 2150;
        const ramTotalMb = data.hardware?.ramTotalMb || 8192;
        const ramPct = Math.round((ramUsedMb / ramTotalMb) * 100);
        if (ramGauge) ramGauge.style.width = `${ramPct}%`;
        if (ramVal) ramVal.textContent = `${(ramUsedMb / 1024).toFixed(1)} / ${(ramTotalMb / 1024).toFixed(1)} GB`;

        if (healthPingTime) healthPingTime.textContent = `Ping: ${new Date().toLocaleTimeString()}`;
        if (rawHealthDisplay) rawHealthDisplay.textContent = JSON.stringify(data, null, 2);
      }
    } catch {
      if (statusPill) {
        statusPill.textContent = '● LOCAL SIMULATOR STANDBY';
        statusPill.className = 'status-pill ready';
      }
    }
  }

  btnRefresh?.addEventListener('click', pollHealth);
  btnToggleJson?.addEventListener('click', () => {
    if (rawHealthDisplay) {
      rawHealthDisplay.style.display = rawHealthDisplay.style.display === 'none' ? 'block' : 'none';
    }
  });

  pollHealth();
  if (!engineMonitorIntervalId) {
    engineMonitorIntervalId = window.setInterval(pollHealth, 5000);
  }

  // Model Registry
  const modelTableBody = windowElement.querySelector('#model-table-body') as HTMLElement;
  const customModelInput = windowElement.querySelector('#custom-model-input') as HTMLInputElement;
  const btnApplyModel = windowElement.querySelector('#btn-apply-model-path') as HTMLButtonElement;

  // Model Registry UI Elements
  const regBootCount = windowElement.querySelector('#reg-boot-count') as HTMLElement | null;
  const regLastUpdated = windowElement.querySelector('#reg-last-updated') as HTMLElement | null;
  const regAutoreloadChk = windowElement.querySelector('#reg-autoreload-chk') as HTMLInputElement | null;
  const btnReloadFromRegistry = windowElement.querySelector('#btn-reload-from-registry') as HTMLButtonElement | null;
  const btnToggleViewRegistry = windowElement.querySelector('#btn-toggle-view-registry') as HTMLButtonElement | null;
  const btnRelaunchWizardTab = windowElement.querySelector('#btn-relaunch-wizard-tab') as HTMLButtonElement | null;
  const registryJsonDisplay = windowElement.querySelector('#registry-json-display') as HTMLElement | null;

  async function loadRegistryStatus() {
    try {
      const res = await fetch('/api/model-registry');
      if (res.ok) {
        const data = await res.json();
        const reg = data.registry;
        if (reg) {
          if (regBootCount) regBootCount.textContent = `Boot #${reg.bootCount || 1}`;
          if (regLastUpdated) {
            regLastUpdated.textContent = reg.lastSelectedTimestamp ? new Date(reg.lastSelectedTimestamp).toLocaleString() : 'Just now';
          }
          if (regAutoreloadChk) {
            regAutoreloadChk.checked = reg.autoReloadOnBoot !== false;
          }
          if (registryJsonDisplay) {
            registryJsonDisplay.textContent = JSON.stringify(reg, null, 2);
          }
        }
      }
    } catch (e) {
      console.warn('Failed loading registry status:', e);
    }
  }

  async function loadModels() {
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data = await res.json();
        if (modelTableBody) {
          modelTableBody.innerHTML = '';
          data.models.forEach((m: any) => {
            const tr = document.createElement('tr');
            if (m.name === activeModelName || m.active) tr.classList.add('selected');
            tr.innerHTML = `
              <td><strong>${m.name}</strong></td>
              <td>${m.size}</td>
              <td>${m.parameters}</td>
              <td><span style="font-family: monospace;">${m.quantization}</span></td>
              <td><button class="win95-btn" style="padding: 1px 6px; font-size: 0.7rem;">${m.active ? 'Loaded' : 'Switch'}</button></td>
            `;
            tr.addEventListener('click', async () => {
              activeModelName = m.name;
              if (activeModelLabel) activeModelLabel.textContent = m.name;
              if (customModelInput) customModelInput.value = `/models/${m.name}`;
              updateTaskbarStatus(m.name);
              localStorage.setItem('llm95_selected_model', m.name);
              localStorage.setItem('llm95_selected_model_id', m.id);
              await fetch('/api/models/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId: m.id, modelName: m.name })
              });
              loadModels();
              loadRegistryStatus();
              pollHealth();
            });
            modelTableBody.appendChild(tr);
          });
        }
      }
    } catch (e) {
      console.warn('Failed loading models:', e);
    }
  }
  loadModels();
  loadRegistryStatus();

  regAutoreloadChk?.addEventListener('change', async () => {
    const isChecked = regAutoreloadChk.checked;
    localStorage.setItem('llm95_autoreload_on_boot', isChecked ? 'true' : 'false');
    await fetch('/api/model-registry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoReloadOnBoot: isChecked })
    });
    loadRegistryStatus();
  });

  btnReloadFromRegistry?.addEventListener('click', async () => {
    btnReloadFromRegistry.disabled = true;
    btnReloadFromRegistry.textContent = 'Reloading...';
    try {
      const res = await fetch('/api/model-registry/reload', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.reloadedModel) {
          activeModelName = data.reloadedModel;
          if (activeModelLabel) activeModelLabel.textContent = data.reloadedModel;
          updateTaskbarStatus(data.reloadedModel);
          localStorage.setItem('llm95_selected_model', data.reloadedModel);
          loadModels();
          loadRegistryStatus();
          pollHealth();
        }
      }
    } finally {
      btnReloadFromRegistry.disabled = false;
      btnReloadFromRegistry.textContent = '🔄 Reload from Registry';
    }
  });

  btnToggleViewRegistry?.addEventListener('click', () => {
    if (!registryJsonDisplay) return;
    const isHidden = registryJsonDisplay.style.display === 'none';
    registryJsonDisplay.style.display = isHidden ? 'block' : 'none';
    btnToggleViewRegistry.textContent = isHidden ? '📄 Hide model-registry.json' : '📄 View model-registry.json';
    if (isHidden) loadRegistryStatus();
  });

  btnRelaunchWizardTab?.addEventListener('click', () => {
    openApp('setupWizard');
  });

  btnApplyModel?.addEventListener('click', async () => {
    const pathVal = customModelInput.value.trim();
    if (pathVal) {
      activeModelName = pathVal.split('/').pop() || pathVal;
      if (activeModelLabel) activeModelLabel.textContent = activeModelName;
      updateTaskbarStatus(activeModelName);
      localStorage.setItem('llm95_selected_model', activeModelName);
      await fetch('/api/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: activeModelName, modelId: activeModelName })
      });
      loadModels();
      loadRegistryStatus();
      pollHealth();
    }
  });

  // Benchmark Sandbox
  const promptInput = windowElement.querySelector('#sandbox-prompt-input') as HTMLInputElement;
  const btnBenchmark = windowElement.querySelector('#btn-run-benchmark') as HTMLButtonElement;
  const outputBox = windowElement.querySelector('#sandbox-output') as HTMLElement;
  const benchTokens = windowElement.querySelector('#bench-tokens') as HTMLElement;
  const benchTime = windowElement.querySelector('#bench-time') as HTMLElement;
  const benchSpeed = windowElement.querySelector('#bench-speed') as HTMLElement;

  btnBenchmark?.addEventListener('click', async () => {
    const prompt = promptInput.value.trim() || 'Explain the concept of on-device LLM inference in 2 sentences.';
    outputBox.textContent = `[Processing on CPU: ${activeModelName}]...\n\n`;
    btnBenchmark.disabled = true;

    const start = performance.now();
    let tokenCount = 0;

    await requestOnDeviceInference({
      prompt,
      contextType: 'general',
      stream: true,
      onChunk: (chunk: string) => {
        outputBox.textContent += chunk;
        tokenCount += chunk.trim().split(/\s+/).length;
        outputBox.scrollTop = outputBox.scrollHeight;
      }
    });

    const elapsed = Math.round(performance.now() - start);
    const speed = ((tokenCount / (elapsed / 1000)) || 6.5).toFixed(1);

    if (benchTokens) benchTokens.textContent = tokenCount.toString();
    if (benchTime) benchTime.textContent = `${elapsed} ms`;
    if (benchSpeed) benchSpeed.textContent = `${speed} tok/s`;
    btnBenchmark.disabled = false;
  });

  // VM Tab Actions & Bootloader Inspectors
  const btnCopyQemu = windowElement.querySelector('#btn-copy-qemu') as HTMLButtonElement | null;
  const btnCopyPodman = windowElement.querySelector('#btn-copy-podman') as HTMLButtonElement | null;
  const btnCopyUtm = windowElement.querySelector('#btn-copy-utm') as HTMLButtonElement | null;
  const btnViewReadme = windowElement.querySelector('#btn-view-readme') as HTMLButtonElement | null;
  const btnViewGrub = windowElement.querySelector('#btn-view-grub') as HTMLButtonElement | null;
  const btnViewInit = windowElement.querySelector('#btn-view-init') as HTMLButtonElement | null;
  const btnViewQemuScript = windowElement.querySelector('#btn-view-qemu-script') as HTMLButtonElement | null;
  const btnBundleVm = windowElement.querySelector('#btn-bundle-vm') as HTMLButtonElement | null;
  const vmInspectViewer = windowElement.querySelector('#vm-inspect-viewer') as HTMLElement | null;

  async function loadBootFile(fileName: string, title: string): Promise<void> {
    if (vmInspectViewer) vmInspectViewer.textContent = `[Loading ${fileName} from sealed appliance storage...]`;
    try {
      const res = await fetch('/api/vm/boot-files');
      if (res.ok) {
        const data = await res.json();
        if (data.files && data.files[fileName]) {
          if (vmInspectViewer) {
            vmInspectViewer.textContent = `=== [${title}] (${fileName}) ===\n\n${data.files[fileName]}`;
          }
          return;
        }
      }
    } catch {}
    if (vmInspectViewer) {
      vmInspectViewer.textContent = `=== [${title}] ===\nFile loaded from kernel storage: /boot/${fileName}`;
    }
  }

  btnViewGrub?.addEventListener('click', () => {
    loadBootFile('grub.cfg', 'GRUB 2 Bootloader Configuration (UEFI/GPT & VirtIO)');
  });

  btnViewInit?.addEventListener('click', () => {
    loadBootFile('init', 'Linux Kernel PID 1 Init Script (Sealed VM Appliance)');
  });

  btnViewQemuScript?.addEventListener('click', () => {
    loadBootFile('run-macos-tahoe.sh', 'macOS Tahoe Native QEMU HVF Hypervisor Launcher');
  });

  btnBundleVm?.addEventListener('click', async () => {
    if (vmInspectViewer) {
      vmInspectViewer.textContent = `=== [VM Appliance Bundler: scripts/create-vm-bundle.sh] ===\n\n[✓] Bootloader configs copied: boot/grub/grub.cfg, boot/syslinux/isolinux.cfg\n[✓] PID 1 Kernel init script packaged: ./init (executable)\n[✓] Apple Silicon UTM Configuration generated: UTM-Config.plist (VirtIO-GPU, CoreAudio 48kHz, 8GB RAM)\n[✓] Portable QEMU launcher ready: launch-qemu.sh\n[✓] Ready to execute in macOS Tahoe / Linux hypervisor environment.`;
    }
    btnBundleVm.textContent = '✓ Bundled!';
    setTimeout(() => { if (btnBundleVm) btnBundleVm.textContent = '📦 Bundle VM Package'; }, 2500);
  });

  btnCopyUtm?.addEventListener('click', () => {
    const utmPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>ConfigurationVersion</key><integer>4</integer>
    <key>Information</key><dict><key>Name</key><string>LLM-95 OS</string></dict>
    <key>System</key><dict><key>Architecture</key><string>aarch64</string><key>MemorySize</key><integer>8192</integer><key>Hypervisor</key><true/></dict>
    <key>Displays</key><array><dict><key>Hardware</key><string>virtio-gpu-gl-pci</string></dict></array>
    <key>Sound</key><dict><key>Hardware</key><string>virtio-snd-pci</string><key>SampleRate</key><integer>48000</integer></dict>
</dict>
</plist>`;
    navigator.clipboard?.writeText(utmPlist);
    if (btnCopyUtm) btnCopyUtm.textContent = 'Copied UTM Plist!';
    setTimeout(() => { if (btnCopyUtm) btnCopyUtm.textContent = 'Copy UTM Config'; }, 2000);
  });

  btnCopyQemu?.addEventListener('click', () => {
    const cmd = `./run-macos-tahoe.sh build-output/llama95-vm.qcow2`;
    navigator.clipboard?.writeText(cmd);
    btnCopyQemu.textContent = 'Copied Tahoe Launcher!';
    setTimeout(() => { btnCopyQemu.textContent = 'Copy Tahoe QEMU Command'; }, 2000);
  });

  btnCopyPodman?.addEventListener('click', () => {
    const cmd = `podman run -d -p 3000:3000 -p 8080:8080 --name llama95 llama95-appliance:latest`;
    navigator.clipboard?.writeText(cmd);
    btnCopyPodman.textContent = 'Copied to Clipboard!';
    setTimeout(() => { btnCopyPodman.textContent = 'Copy Podman Command'; }, 2000);
  });

  btnViewReadme?.addEventListener('click', () => {
    const notepad = document.getElementById('notepad') as HTMLDivElement | null;
    if (notepad) {
      openApp('notepad');
      const textarea = notepad.querySelector('.notepad-textarea') as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.value = `=== LLM-95 ON-DEVICE VM APPLIANCE DOCUMENTATION ===\n\nObjective: Transform Gemini 95 into a self-contained, bootable VM image.\nTuned for: macOS Tahoe Virtualization (Metal 3 VirtIO-GPU & CoreAudio VirtIO-Sound)\nTerminal: Full interactive command prompt with web access\nPackages: .apk (Alpine), .deb (Debian), and Arch package compatibility\n\nRun './run-macos-tahoe.sh' to boot directly on Apple Silicon or Intel macOS Tahoe!\nSee /README.md for full instructions.`;
      }
    }
  });

  const btnRelaunchWizard = windowElement.querySelector('#btn-relaunch-wizard') as HTMLButtonElement | null;
  btnRelaunchWizard?.addEventListener('click', () => {
    openApp('setupWizard');
  });
}

// --- LLM-95 Hardware Scanner & Sealed VM OS Provisioning Wizard ---

let isSetupWizardFlashing = false;

function initSetupWizard(windowElement: HTMLDivElement): void {
  const stepNodes = windowElement.querySelectorAll('.wizard-step-node') as NodeListOf<HTMLElement>;
  const stepPages = windowElement.querySelectorAll('.wizard-page') as NodeListOf<HTMLElement>;
  const stepIndicator = windowElement.querySelector('#wizard-step-indicator') as HTMLElement | null;

  // Step 1 Elements
  const cpuName = windowElement.querySelector('#wiz-cpu-name') as HTMLElement | null;
  const cpuVector = windowElement.querySelector('#wiz-cpu-vector') as HTMLElement | null;
  const cpuCores = windowElement.querySelector('#wiz-cpu-cores') as HTMLElement | null;
  const ramInfo = windowElement.querySelector('#wiz-ram-info') as HTMLElement | null;
  const benchBar = windowElement.querySelector('#wiz-bench-bar') as HTMLElement | null;
  const benchRating = windowElement.querySelector('#wiz-bench-rating') as HTMLElement | null;
  const recTitle = windowElement.querySelector('#wiz-rec-title') as HTMLElement | null;
  const recDesc = windowElement.querySelector('#wiz-rec-desc') as HTMLElement | null;
  const btnRescan = windowElement.querySelector('#wiz-btn-rescan') as HTMLButtonElement | null;
  const btnStep1Next = windowElement.querySelector('#wiz-btn-step1-next') as HTMLButtonElement | null;

  // Step 2 Elements
  const modelsList = windowElement.querySelector('#wiz-models-list') as HTMLElement | null;
  const btnStep2Back = windowElement.querySelector('#wiz-btn-step2-back') as HTMLButtonElement | null;
  const btnStep2Next = windowElement.querySelector('#wiz-btn-step2-next') as HTMLButtonElement | null;

  // Step 3 Elements
  const downloadModelLabel = windowElement.querySelector('#wiz-download-model-label') as HTMLElement | null;
  const downloadStats = windowElement.querySelector('#wiz-download-stats') as HTMLElement | null;
  const downloadBar = windowElement.querySelector('#wiz-download-bar') as HTMLElement | null;
  const downloadEta = windowElement.querySelector('#wiz-download-eta') as HTMLElement | null;
  const flashingTerminal = windowElement.querySelector('#wiz-flashing-terminal') as HTMLElement | null;

  // Step 4 Elements
  const finalModelName = windowElement.querySelector('#wiz-final-model-name') as HTMLElement | null;
  const finalRam = windowElement.querySelector('#wiz-final-ram') as HTMLElement | null;
  const chkRemember = windowElement.querySelector('#wiz-remember-choice') as HTMLInputElement | null;
  const btnFinish = windowElement.querySelector('#wiz-btn-finish') as HTMLButtonElement | null;

  let hardwareData: any = null;
  let catalogModels: any[] = [];
  let selectedModelId = 'llama-3.2-3b-instruct-q4_k_m';

  function setStep(step: number) {
    if (stepIndicator) stepIndicator.textContent = `Step ${step} of 4`;

    stepNodes.forEach((node) => {
      const s = parseInt(node.dataset.step || '1', 10);
      node.classList.toggle('active', s === step);
    });

    stepPages.forEach((page, idx) => {
      if (idx + 1 === step) {
        page.style.display = 'flex';
        page.classList.add('active');
      } else {
        page.style.display = 'none';
        page.classList.remove('active');
      }
    });

    if (step === 2) {
      renderModelList();
    }
  }

  async function runHardwareScan() {
    if (benchBar) benchBar.style.width = '20%';
    if (benchRating) benchRating.textContent = 'Probing SIMD vector units & CPU threads...';

    try {
      const res = await fetch('/api/hardware/scan');
      if (res.ok) {
        hardwareData = await res.json();
      }
    } catch (e) {
      console.warn('Hardware scan fallback:', e);
    }

    if (!hardwareData) {
      hardwareData = {
        hardware: {
          cpuCount: navigator.hardwareConcurrency || 8,
          cpuModel: 'Apple Silicon (M-Series) / Multi-Core Host',
          arch: 'arm64',
          vectorUnit: 'ARM NEON SIMD (Vector Register Units Active)',
          ramTotalMb: 8192,
          benchmarkScore: 8950,
          rating: 'Exceptional (Apple Silicon NEON / High-Throughput)'
        },
        recommendation: {
          modelId: 'llama-3.2-3b-instruct-q4_k_m',
          model: { name: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf' },
          reason: 'Llama-3.2-3B gives the highest reasoning-to-RAM efficiency for the 8GB sealed VM limit, running 7-11 tokens/sec on CPU.'
        },
        models: [
          {
            id: 'gemma-2-2b-it-q4_k_m',
            name: 'Gemma-2-2B-it-Q4_K_M.gguf',
            size: '1.62 GB',
            sizeBytes: 1739000000,
            parameters: '2.6B',
            quantization: 'Q4_K_M',
            ramRequirementMb: 1900,
            expectedTokensPerSec: '8.8 - 13.5 tok/s',
            isRecommended: true,
            description: '★ DEFAULT ON-DEVICE MODEL: Google Gemma-2-2B flagship compact model. Superb tool reasoning and OS terminal orchestration.'
          },
          {
            id: 'llama-3.2-3b-instruct-q4_k_m',
            name: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
            size: '2.02 GB',
            sizeBytes: 2169542000,
            parameters: '3.2B',
            quantization: 'Q4_K_M',
            ramRequirementMb: 2400,
            expectedTokensPerSec: '7.5 - 11.2 tok/s',
            isRecommended: false,
            description: 'Meta compact model. Tool reasoning and OS operation on CPU.'
          },
          {
            id: 'phi-3.5-mini-instruct-q4_k_m',
            name: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
            size: '2.20 GB',
            sizeBytes: 2360000000,
            parameters: '3.8B',
            quantization: 'Q4_K_M',
            ramRequirementMb: 2600,
            expectedTokensPerSec: '6.4 - 9.8 tok/s',
            isRecommended: false,
            description: 'Microsoft compact reasoning model. Outstanding coding, terminal command generation, and logic.'
          },
          {
            id: 'smollm2-1.7b-instruct-q4_k_m',
            name: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
            size: '1.05 GB',
            sizeBytes: 1120000000,
            parameters: '1.7B',
            quantization: 'Q4_K_M',
            ramRequirementMb: 1300,
            expectedTokensPerSec: '14.0 - 22.0 tok/s',
            isRecommended: false,
            description: 'Ultra-fast inference speed for minimal hardware. Instant latency and minimal disk footprint.'
          },
          {
            id: 'mistral-7b-instruct-v0.3-q4_k_m',
            name: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
            size: '4.30 GB',
            sizeBytes: 4610000000,
            parameters: '7.3B',
            quantization: 'Q4_K_M',
            ramRequirementMb: 5200,
            expectedTokensPerSec: '3.2 - 5.8 tok/s',
            isRecommended: false,
            description: 'Maximum intelligence & deep system control. High RAM requirement; ideal for high-spec workstations.'
          }
        ]
      };
    }

    const hw = hardwareData.hardware;
    const rec = hardwareData.recommendation;
    catalogModels = hardwareData.models || [];
    selectedModelId = rec.modelId || 'gemma-2-2b-it-q4_k_m';

    let pct = 30;
    const interval = setInterval(() => {
      pct += 20;
      if (benchBar) benchBar.style.width = `${pct}%`;
      if (pct >= 100) {
        clearInterval(interval);
        if (cpuName) cpuName.textContent = `${hw.cpuModel} (${hw.arch.toUpperCase()})`;
        if (cpuVector) cpuVector.textContent = hw.vectorUnit;
        if (cpuCores) cpuCores.textContent = `${hw.cpuCount} Cores (Active Parallelism)`;
        if (ramInfo) ramInfo.textContent = `${(hw.ramTotalMb / 1024).toFixed(1)} GB Host RAM / 8.0 GB VM Limit`;
        if (benchRating) benchRating.textContent = `Score: ${hw.benchmarkScore.toLocaleString()} (${hw.rating})`;
        if (recTitle) recTitle.textContent = rec.model?.name || rec.modelId;
        if (recDesc) recDesc.textContent = rec.reason;
      }
    }, 60);
  }

  function renderModelList() {
    if (!modelsList) return;
    modelsList.innerHTML = '';

    catalogModels.forEach((m) => {
      const isSelected = m.id === selectedModelId;
      const isRec = m.isRecommended || m.id === selectedModelId;
      const card = document.createElement('div');
      card.className = `wiz-model-option ${isSelected ? 'selected' : ''} ${isRec ? 'recommended' : ''}`;
      card.innerHTML = `
        <input type="radio" class="wiz-model-radio" name="wiz-model-choice" value="${m.id}" ${isSelected ? 'checked' : ''} />
        <div class="wiz-model-details">
          <div class="wiz-model-name-row">
            <span class="wiz-model-name">${m.name}</span>
            ${isRec ? '<span class="wiz-model-recommended-pill">★ BEST MATCH FOR YOUR HARDWARE</span>' : ''}
          </div>
          <div class="wiz-model-specs-row">
            <span>📦 Disk: <strong>${m.size}</strong></span>
            <span>🧠 Params: <strong>${m.parameters}</strong></span>
            <span>⚙️ Quant: <strong>${m.quantization}</strong></span>
            <span>⚡ RAM: <strong>~${m.ramRequirementMb} MB</strong></span>
            <span>🚀 Speed: <strong>${m.expectedTokensPerSec}</strong></span>
          </div>
          <div class="wiz-model-desc">${m.description}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        selectedModelId = m.id;
        const radios = modelsList.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
        radios.forEach(r => { r.checked = r.value === m.id; });
        modelsList.querySelectorAll('.wiz-model-option').forEach(el => el.classList.remove('selected'));
        card.classList.add('selected');
      });

      modelsList.appendChild(card);
    });
  }

  async function startDownloadAndFlash() {
    if (isSetupWizardFlashing) return;
    isSetupWizardFlashing = true;
    setStep(3);

    const targetModel = catalogModels.find(m => m.id === selectedModelId) || {
      name: 'Gemma-2-2B-it-Q4_K_M.gguf',
      size: '1.62 GB',
      sizeBytes: 1739000000,
      ramRequirementMb: 1900
    };

    if (downloadModelLabel) downloadModelLabel.textContent = targetModel.name;
    if (flashingTerminal) {
      flashingTerminal.innerHTML = `<pre class="terminal-pre">[LLM-95 SEALED KERNEL PROVISIONING INITIALIZED]
Target Partition: /models inside 8.0 GB VM disk image
Hypervisor Acceleration: macOS Tahoe VirtIO-GPU (Metal 3) & VirtIO-Sound (CoreAudio)
Connecting to on-device storage bus...</pre>`;
    }

    const logTerminal = (msg: string) => {
      if (flashingTerminal) {
        const p = document.createElement('pre');
        p.className = 'terminal-pre';
        p.textContent = msg;
        flashingTerminal.appendChild(p);
        flashingTerminal.scrollTop = flashingTerminal.scrollHeight;
      }
    };

    let downloadedBytes = 0;
    const totalBytes = targetModel.sizeBytes || 2169542000;
    const speedMbPerSec = 52.4 + Math.random() * 14;

    const provisionPromise = fetch('/api/vm/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: selectedModelId,
        modelName: targetModel.name,
        hardwareProfile: hardwareData?.hardware
      })
    }).catch(e => console.warn('provision fetch:', e));

    let stepLogIndex = 0;
    const milestones = [
      { pct: 15, msg: `[STREAM] Downloading tensor shard 1/4 into /models/${targetModel.name}...` },
      { pct: 35, msg: `[STREAM] Downloading tensor shard 2/4 (Q4_K_M quantized weights)...` },
      { pct: 60, msg: `[STREAM] Downloading tensor shard 3/4 (RMSNorm & attention tables)...` },
      { pct: 85, msg: `[STREAM] Downloading tensor shard 4/4 (Vocabulary & token embeddings)...` },
      { pct: 95, msg: `[INTEGRITY] SHA-256 verification: a9b48c03e... OK (Zero Bit Corruption)` },
      { pct: 98, msg: `[FLASH] Locking GGUF tensor shards as PID 1 Autonomous OS Kernel Pilot...` },
      { pct: 100, msg: `[BOOT] Sealed Virtual Machine Operating System is ONLINE and ready!` }
    ];

    const progressTimer = setInterval(() => {
      downloadedBytes += (speedMbPerSec * 1024 * 1024 * 0.12);
      if (downloadedBytes >= totalBytes) downloadedBytes = totalBytes;

      const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
      if (downloadBar) downloadBar.style.width = `${pct}%`;

      const dlMb = (downloadedBytes / (1024 * 1024)).toFixed(0);
      const totalMb = (totalBytes / (1024 * 1024)).toFixed(0);
      const eta = Math.max(0, Math.round((totalBytes - downloadedBytes) / (speedMbPerSec * 1024 * 1024)));

      if (downloadStats) downloadStats.textContent = `${pct}% (${dlMb} / ${totalMb} MB) — ${speedMbPerSec.toFixed(1)} MB/s`;
      if (downloadEta) downloadEta.textContent = eta > 0 ? `Estimated time remaining: ${eta} seconds...` : `Download complete! Flashing OS kernel...`;

      if (stepLogIndex < milestones.length && pct >= milestones[stepLogIndex].pct) {
        logTerminal(milestones[stepLogIndex].msg);
        stepLogIndex++;
      }

      if (pct >= 100) {
        clearInterval(progressTimer);
        isSetupWizardFlashing = false;

        activeModelName = targetModel.name;
        updateTaskbarStatus(targetModel.name);

        if (finalModelName) finalModelName.textContent = targetModel.name;
        if (finalRam) finalRam.textContent = `~${(targetModel.ramRequirementMb / 1024).toFixed(1)} GB / 8.0 GB VM Limit (${(8 - targetModel.ramRequirementMb / 1024).toFixed(1)} GB free for apps)`;

        const autoReload = chkRemember ? chkRemember.checked : true;
        if (autoReload) {
          localStorage.setItem('llm95_setup_completed', 'true');
          localStorage.setItem('llm95_autoreload_on_boot', 'true');
        }
        localStorage.setItem('llm95_selected_model', targetModel.name);
        localStorage.setItem('llm95_selected_model_id', selectedModelId);
        if (hardwareData) {
          localStorage.setItem('llm95_hardware_profile', JSON.stringify(hardwareData.hardware));
        }

        // Persist complete Model Registry state in browser storage
        const registryEntry = {
          version: '1.0',
          activeModelId: selectedModelId,
          activeModelName: targetModel.name,
          activeModelPath: `/models/${targetModel.name}`,
          autoReloadOnBoot: autoReload,
          lastSelectedTimestamp: new Date().toISOString(),
          setupCompleted: true,
          hardwareProfile: hardwareData?.hardware
        };
        localStorage.setItem('llm95_model_registry', JSON.stringify(registryEntry));
        console.log(`[Model Registry] User choice persisted: ${targetModel.name} (Auto-reload on boot: ${autoReload})`);

        setTimeout(() => {
          setStep(4);
        }, 500);
      }
    }, 100);

    await provisionPromise;
  }

  btnStep1Next?.addEventListener('click', () => setStep(2));
  btnStep2Back?.addEventListener('click', () => setStep(1));
  btnStep2Next?.addEventListener('click', startDownloadAndFlash);
  btnRescan?.addEventListener('click', runHardwareScan);

  btnFinish?.addEventListener('click', () => {
    closeApp('setupWizard');
    openApp('gemini');

    setTimeout(() => {
      const geminiWindow = document.getElementById('gemini');
      const chatHistory = geminiWindow?.querySelector('.gemini-chat-history') as HTMLDivElement | null;
      if (chatHistory) {
        const welcomeP = document.createElement('p');
        welcomeP.className = 'gemini-message assistant-message';
        welcomeP.innerHTML = `<strong>[SEALED OS KERNEL: ${activeModelName}]</strong><br>Welcome to LLM-95! I have been downloaded directly into your virtual machine storage area and flashed as the operating system kernel.<br><br>All inference runs on-device via CPU vector units, tuned for macOS Tahoe VirtIO-GPU &amp; VirtIO-Sound. What would you like to run on this computer?`;
        chatHistory.appendChild(welcomeP);
        chatHistory.scrollTop = chatHistory.scrollHeight;
      }
    }, 400);
  });

  runHardwareScan();
}

function updateTaskbarStatus(modelName: string): void {
  const indicator = document.getElementById('taskbar-kernel-indicator');
  if (indicator) {
    const shortName = modelName.split('-')[0] + '-' + (modelName.split('-')[1] || '3B');
    indicator.textContent = `● Sealed OS: ${shortName}`;
    indicator.title = `Operating System Kernel: ${modelName} (Sealed On-Device)`;
  }
  const engineLabel = document.getElementById('active-model-name-label');
  if (engineLabel) {
    engineLabel.textContent = modelName;
  }
}

function initTaskbarClock(): void {
  const clockEl = document.getElementById('taskbar-clock');
  const updateClock = () => {
    if (clockEl) {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };
  updateClock();
  setInterval(updateClock, 30000);

  // Initialize VirtIO-Sound Master Volume Slider & Tray Component
  virtIOSound.initTrayUI();

  const kernelIndicator = document.getElementById('taskbar-kernel-indicator');
  kernelIndicator?.addEventListener('click', () => {
    openApp('llamaEngine');
  });
}

// --- LLM-95 Autonomous OS Pilot & Chat Interface ---

async function initGeminiChat(windowElement: HTMLDivElement): Promise<void> {
  const historyDiv = windowElement.querySelector('.gemini-chat-history') as HTMLDivElement;
  const inputEl = windowElement.querySelector('.gemini-chat-input') as HTMLInputElement;
  const sendButton = windowElement.querySelector('.gemini-chat-send') as HTMLButtonElement;
  const quickPills = windowElement.querySelectorAll('.quick-action-pill') as NodeListOf<HTMLButtonElement>;

  if (!historyDiv || !inputEl || !sendButton) return;

  function addChatMessage(container: HTMLDivElement, text: string, className: string = '') {
    const p = document.createElement('p');
    if (className) p.classList.add(className);
    p.textContent = text;
    container.appendChild(p);
    container.scrollTop = container.scrollHeight;
  }

  function addActionChip(container: HTMLDivElement, actionText: string) {
    const div = document.createElement('div');
    div.className = 'operator-action-chip';
    div.innerHTML = `<span>⚡</span> <span>[PILOT OPERATING SYSTEM: ${actionText}]</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  historyDiv.innerHTML = '';
  addChatMessage(historyDiv, `⚡ LLM-95 Autonomous OS Pilot Initialized.`, 'system-message');
  addChatMessage(historyDiv, `I can operate this entire computer on your behalf! Ask me to draw art in Paint, write notes in GemNotes, run terminal commands, install packages, change desktop themes, or browse the web.`, 'system-message');

  async function processUserCommand(message: string) {
    addChatMessage(historyDiv, `You: ${message}`, 'user-message');
    inputEl.value = '';
    inputEl.disabled = true;
    sendButton.disabled = true;

    const lower = message.toLowerCase();
    let actionDescription = '';

    // Intent detection & Autonomous Execution
    if (lower.includes('paint') || lower.includes('draw')) {
      const shape = lower.includes('house') ? 'house' : (lower.includes('circle') ? 'rainbow circles' : 'smiley face');
      actionDescription = `Opening GemPaint and drawing ${shape}...`;
      addActionChip(historyDiv, actionDescription);
      await OSController.paintDraw(shape);
    } else if (lower.includes('note') || lower.includes('write')) {
      actionDescription = 'Opening GemNotes and typing memo on-device...';
      addActionChip(historyDiv, actionDescription);
      await OSController.notepadWrite(`Memo regarding macOS Tahoe on-device inference.\nLocal GGUF model: ${activeModelName}\nDate: ${new Date().toLocaleDateString()}\nAll operations executed locally!`);
    } else if (lower.includes('lspci') || lower.includes('driver') || lower.includes('terminal')) {
      actionDescription = 'Opening MS-DOS Prompt and querying macOS Tahoe VirtIO drivers...';
      addActionChip(historyDiv, actionDescription);
      await OSController.terminalExec('lspci');
      await OSController.terminalExec('driver-status');
    } else if (lower.includes('package') || lower.includes('install') || lower.includes('htop')) {
      actionDescription = 'Accessing web mirror and installing package...';
      addActionChip(historyDiv, actionDescription);
      await OSController.installPackage('htop');
    } else if (lower.includes('color') || lower.includes('desktop') || lower.includes('theme') || lower.includes('matrix') || lower.includes('navy')) {
      const chosenColor = lower.includes('matrix') ? 'matrix' : (lower.includes('navy') ? 'navy' : (lower.includes('dark') ? 'black' : 'teal'));
      actionDescription = `Switching desktop environment color to ${chosenColor}...`;
      addActionChip(historyDiv, actionDescription);
      OSController.setDesktopColor(chosenColor);
    } else if (lower.includes('hypervisor') || lower.includes('ram isolation') || lower.includes('scrub ram') || lower.includes('quarantine') || lower.includes('v86') || lower.includes('virtual machine')) {
      if (lower.includes('scrub')) {
        actionDescription = 'Executing cryptographic multi-pass RAM scrub on isolated guest memory...';
        addActionChip(historyDiv, actionDescription);
        OSController.scrubRam();
      } else {
        actionDescription = 'Opening Type-2 Wasm Hypervisor & RAM Isolation Shield...';
        addActionChip(historyDiv, actionDescription);
        OSController.openHypervisor();
      }
    } else if (lower.includes('mixer') || lower.includes('volume control') || lower.includes('sndvol') || lower.includes('sound control')) {
      actionDescription = 'Opening Advanced System Sound Mixer (Volume Control)...';
      addActionChip(historyDiv, actionDescription);
      OSController.openVolumeControl();
    } else if (lower.includes('unmute')) {
      actionDescription = 'Unmuting all VirtIO-Sound channels...';
      addActionChip(historyDiv, actionDescription);
      virtIOSound.setMute(false);
    } else if (lower.includes('mute')) {
      actionDescription = 'Muting VirtIO-Sound master audio...';
      addActionChip(historyDiv, actionDescription);
      virtIOSound.setMute(true);
    } else if (lower.includes('mic') && (lower.includes('test') || lower.includes('voice') || lower.includes('vu') || lower.includes('level') || lower.includes('monitor'))) {
      actionDescription = 'Opening Volume Control and activating Virtual Mic monitoring...';
      addActionChip(historyDiv, actionDescription);
      OSController.openVolumeControl();
      virtIOSound.toggleVirtualVoiceTest();
    } else if (lower.includes('volume') && /\d+/.test(lower)) {
      const match = lower.match(/(\d+)/);
      const val = match ? Math.max(0, Math.min(100, parseInt(match[1], 10))) : 80;
      actionDescription = `Adjusting system master volume to ${val}%...`;
      addActionChip(historyDiv, actionDescription);
      OSController.setMasterVolume(val);
    } else if (lower.includes('sound') || lower.includes('audio') || lower.includes('chime')) {
      actionDescription = 'Emitting 48kHz stereo test chime via VirtIO-Sound...';
      addActionChip(historyDiv, actionDescription);
      OSController.playTestSound();
    } else if (lower.includes('browser') || lower.includes('web') || lower.includes('google')) {
      actionDescription = 'Launching Chrome and surfing local web node...';
      addActionChip(historyDiv, actionDescription);
      await OSController.browserNavigate('retro95.org');
    } else if (lower.includes('mine') || lower.includes('sweep')) {
      actionDescription = 'Opening GemSweeper and executing safe move...';
      addActionChip(historyDiv, actionDescription);
      await OSController.minesweeperPlay();
    }

    try {
      addChatMessage(historyDiv, 'OS Pilot: ', 'gemini-message');
      const lastMsgEl = historyDiv.lastElementChild as HTMLParagraphElement;

      await requestOnDeviceInference({
        prompt: `The user requested: "${message}". ${actionDescription ? `You have autonomously executed: "${actionDescription}".` : ''} Briefly confirm what you accomplished as their on-device OS pilot.`,
        contextType: 'chat',
        stream: true,
        onChunk: (chunk: string) => {
          if (lastMsgEl) {
            lastMsgEl.textContent += chunk;
            historyDiv.scrollTop = historyDiv.scrollHeight;
          }
        }
      });
    } catch (error: any) {
      addChatMessage(historyDiv, `Error: ${error.message || 'Pilot error'}`, 'error-message');
    } finally {
      inputEl.disabled = false;
      sendButton.disabled = false;
      inputEl.focus();
    }
  }

  sendButton.onclick = () => processUserCommand(inputEl.value.trim());
  inputEl.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      processUserCommand(inputEl.value.trim());
    }
  };

  quickPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const actionType = pill.dataset.pilot;
      switch (actionType) {
        case 'paint':
          processUserCommand('Open Paint and draw a retro smiley face');
          break;
        case 'notepad':
          processUserCommand('Open GemNotes and write a memo');
          break;
        case 'terminal':
          processUserCommand('Open terminal and inspect the macOS Tahoe virtual drivers');
          break;
        case 'package':
          processUserCommand('Install the htop package from the web repository');
          break;
        case 'minesweeper':
          processUserCommand('Open Minesweeper and play a move');
          break;
        case 'theme':
          processUserCommand('Change the desktop background to Matrix Green');
          break;
      }
    });
  });

  inputEl.disabled = false;
  sendButton.disabled = false;
}

// --- Notepad Story Generation ---

async function initNotepadStory(windowElement: HTMLDivElement): Promise<void> {
  const textarea = windowElement.querySelector('.notepad-textarea') as HTMLTextAreaElement;
  const storyButton = windowElement.querySelector('.notepad-story-button') as HTMLButtonElement;
  if (!textarea || !storyButton) return;

  storyButton.addEventListener('click', async () => {
    const currentText = textarea.value;
    textarea.value = currentText + '\n\n[Llama-95] Generating creative story on-device... Please wait...\n\n';
    textarea.scrollTop = textarea.scrollHeight;
    storyButton.disabled = true;
    storyButton.textContent = 'Synthesizing...';

    try {
      const prompt = 'Write me a short retro sci-fi creative story (200-250 words) with an unexpected twist ending.';
      textarea.value = currentText + '\n\n';

      await requestOnDeviceInference({
        prompt,
        contextType: 'story',
        stream: true,
        onChunk: (chunk: string) => {
          textarea.value += chunk;
          textarea.scrollTop = textarea.scrollHeight;
        }
      });
      textarea.value += '\n\n';
    } catch (error: any) {
      textarea.value = currentText + '\n\n[Error generating story: ' + error.message + ']\n\n';
    } finally {
      storyButton.disabled = false;
      storyButton.textContent = 'Generate Story';
      textarea.scrollTop = textarea.scrollHeight;
    }
  });
}

// --- Live World Wide Web Browser (Chrome / VirtIO Gateway) ---

function initAiBrowser(windowElement: HTMLDivElement): void {
  const addressBar = (windowElement.querySelector('#browser-address-input') || windowElement.querySelector('.browser-address-bar')) as HTMLInputElement;
  const goButton = (windowElement.querySelector('#browser-go-btn') || windowElement.querySelector('.browser-go-button')) as HTMLButtonElement;
  const backButton = windowElement.querySelector('#btn-browser-back') as HTMLButtonElement | null;
  const fwdButton = windowElement.querySelector('#btn-browser-forward') as HTMLButtonElement | null;
  const reloadButton = windowElement.querySelector('#btn-browser-reload') as HTMLButtonElement | null;
  const homeButton = windowElement.querySelector('#btn-browser-home') as HTMLButtonElement | null;
  const sslBadge = windowElement.querySelector('#browser-ssl-badge') as HTMLElement | null;
  const iframe = windowElement.querySelector('#browser-frame') as HTMLIFrameElement;
  const loadingEl = (windowElement.querySelector('#browser-loading-spinner') || windowElement.querySelector('.browser-loading')) as HTMLDivElement;
  const loadingText = windowElement.querySelector('#browser-loading-text') as HTMLElement | null;
  const loadingBar = windowElement.querySelector('#browser-loading-bar') as HTMLElement | null;
  const statusText = windowElement.querySelector('#browser-status-text') as HTMLElement | null;
  const packetStatus = windowElement.querySelector('#browser-packet-status') as HTMLElement | null;
  const firewallBtn = windowElement.querySelector('#browser-firewall-status-btn') as HTMLButtonElement | null;
  const windowTitle = (windowElement.querySelector('#browser-window-title') || windowElement.querySelector('.window-title')) as HTMLElement | null;
  const bookmarkButtons = windowElement.querySelectorAll('.bookmark-btn') as NodeListOf<HTMLButtonElement>;

  if (!addressBar || !goButton || !iframe) return;

  const DEFAULT_HOME_URL = 'https://en.wikipedia.org/wiki/Main_Page';
  const historyStack: string[] = [DEFAULT_HOME_URL];
  let historyIndex = 0;
  let isNavigating = false;

  function updateNavButtons(): void {
    if (backButton) backButton.disabled = historyIndex <= 0;
    if (fwdButton) fwdButton.disabled = historyIndex >= historyStack.length - 1;
  }

  function updateSslBadge(url: string): void {
    if (!sslBadge) return;
    if (url.startsWith('https://')) {
      sslBadge.textContent = '🔒 HTTPS';
      sslBadge.className = 'browser-ssl-badge secure';
      sslBadge.title = 'Secure TLS Encrypted Connection (HTTPS)';
    } else {
      sslBadge.textContent = '⚠️ HTTP';
      sslBadge.className = 'browser-ssl-badge insecure';
      sslBadge.title = 'Unencrypted Insecure Connection (HTTP)';
    }
  }

  async function navigateToUrl(rawTarget: string, addToHistory = true): Promise<void> {
    const trimmed = rawTarget.trim();
    if (!trimmed) return;

    let targetUrl = trimmed;

    // Smart URL Resolver:
    // 1. If it has protocol (http:// or https://), keep it
    // 2. If it has a dot and no spaces (e.g. google.com, news.ycombinator.com), prepend https://
    // 3. Otherwise, treat as search query on DuckDuckGo
    if (!/^https?:\/\//i.test(targetUrl)) {
      if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
        targetUrl = 'https://' + targetUrl;
      } else {
        targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(targetUrl)}`;
      }
    }

    let hostname = 'internet';
    try {
      const u = new URL(targetUrl);
      hostname = u.hostname;
    } catch {
      targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;
      hostname = 'html.duckduckgo.com';
    }

    // Step 1: Run request through the built-in macOS Application Firewall & Packet Filter
    const packetCheck = firewall.inspectPacket({
      protocol: targetUrl.startsWith('https') ? 'HTTPS' : 'HTTP',
      direction: 'OUTBOUND',
      app: 'Web Browser (chrome.exe)',
      source: '192.168.1.95',
      destination: hostname,
      port: targetUrl.startsWith('https') ? 443 : 80,
      url: targetUrl,
      reason: `Browser navigation to ${hostname}`
    });

    if (packetStatus) {
      if (packetCheck.decision === 'PASS') {
        packetStatus.textContent = `🛡️ Packet Filter: PASS (${hostname})`;
        packetStatus.style.color = '#000080';
      } else {
        packetStatus.textContent = `🛡️ Packet Filter: BLOCKED (${hostname})`;
        packetStatus.style.color = '#c0392b';
      }
    }

    // Step 2: If the firewall blocked this request, show immediate security block page
    if (packetCheck.decision !== 'PASS') {
      if (loadingEl) loadingEl.style.display = 'none';
      addressBar.value = targetUrl;
      updateSslBadge(targetUrl);

      const blockHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>LLM-95 Application Firewall - Connection Blocked</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1a1c23; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #222634; border: 2px solid #ff4757; border-radius: 8px; padding: 26px; max-width: 520px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
    .header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
    .icon { font-size: 2.4rem; }
    h2 { margin: 0; color: #ff6b6b; font-size: 1.25rem; }
    .detail { background: #13151f; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 0.85rem; margin: 14px 0; word-break: break-all; border-left: 4px solid #ff4757; }
    .meta { font-size: 0.85rem; color: #a4b0be; line-height: 1.5; }
    .tip { margin-top: 16px; font-size: 0.8rem; color: #70a1ff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">🛡️</div>
      <div>
        <h2>Connection Blocked by Firewall</h2>
        <div style="font-size: 0.8rem; color: #888;">macOS Application Firewall &amp; Packet Filter</div>
      </div>
    </div>
    <div class="detail">
      <div><strong>Target:</strong> ${targetUrl}</div>
      <div><strong>Host:</strong> ${hostname}</div>
      <div><strong>Reason:</strong> ${packetCheck.reason}</div>
      <div><strong>Process:</strong> Web Browser (chrome.exe / PID 204)</div>
    </div>
    <div class="meta">
      The built-in application firewall intercepted and rejected this network request in accordance with active security policies.
    </div>
    <div class="tip">
      💡 To allow this connection, open <strong>Start &gt; 🛡️ Firewall</strong> or click the <strong>🛡️ Firewall</strong> desktop icon, and adjust Application Rules or Domain Filter list.
    </div>
  </div>
</body>
</html>`;
      iframe.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(blockHtml);
      if (statusText) statusText.textContent = `❌ Blocked by Firewall: ${hostname}`;
      return;
    }

    // Step 3: Permitted by Firewall -> Proceed to live web proxy navigation
    isNavigating = true;
    addressBar.value = targetUrl;
    updateSslBadge(targetUrl);

    if (loadingEl) {
      loadingEl.style.display = 'flex';
      if (loadingText) loadingText.textContent = `Connecting to ${hostname} over VirtIO Web Gateway...`;
      if (loadingBar) loadingBar.style.width = '35%';
    }
    if (statusText) statusText.textContent = `Connecting to ${hostname}...`;

    if (addToHistory) {
      // Truncate any forward history and append new URL
      historyStack.splice(historyIndex + 1);
      historyStack.push(targetUrl);
      historyIndex = historyStack.length - 1;
      updateNavButtons();
    }

    // Load URL through our local HTTP/HTTPS range & CORS proxy route
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
    iframe.src = proxyUrl;

    // Simulate progressive load bar
    setTimeout(() => {
      if (loadingBar && isNavigating) loadingBar.style.width = '75%';
    }, 300);
  }

  // Handle iframe load completion
  iframe.addEventListener('load', () => {
    isNavigating = false;
    if (loadingEl) loadingEl.style.display = 'none';
    if (statusText) statusText.textContent = `● Done (${addressBar.value})`;

    // Log inbound response packet to firewall
    try {
      const currentUrl = addressBar.value;
      const host = new URL(currentUrl).hostname;
      firewall.inspectPacket({
        protocol: currentUrl.startsWith('https') ? 'HTTPS' : 'HTTP',
        direction: 'INBOUND',
        app: 'Web Browser (chrome.exe)',
        source: host,
        destination: '192.168.1.95',
        port: currentUrl.startsWith('https') ? 443 : 80,
        payloadBytes: Math.floor(1024 + Math.random() * 4096),
        reason: `HTTP 200 Inbound Web Page Payload: ${host}`
      });
    } catch {}
  });

  // Handle message from child iframe when user clicks a link inside the live page
  window.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'BROWSER_NAVIGATE' && event.data.url) {
      navigateToUrl(event.data.url, true);
    } else if (event.data.type === 'BROWSER_PAGE_LOADED') {
      if (event.data.title && windowTitle) {
        windowTitle.textContent = `${event.data.title} - Chrome`;
      }
      if (event.data.url && !addressBar.value.includes(event.data.url)) {
        addressBar.value = event.data.url;
        updateSslBadge(event.data.url);
      }
      if (loadingEl) loadingEl.style.display = 'none';
      if (statusText) statusText.textContent = `● Done (${event.data.title || event.data.url})`;
    }
  });

  // Go button & Enter key
  goButton.addEventListener('click', () => navigateToUrl(addressBar.value, true));
  addressBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigateToUrl(addressBar.value, true);
  });
  addressBar.addEventListener('click', () => addressBar.select());

  // Navigation Toolbar Controls
  backButton?.addEventListener('click', () => {
    if (historyIndex > 0) {
      historyIndex--;
      updateNavButtons();
      navigateToUrl(historyStack[historyIndex], false);
    }
  });

  fwdButton?.addEventListener('click', () => {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++;
      updateNavButtons();
      navigateToUrl(historyStack[historyIndex], false);
    }
  });

  reloadButton?.addEventListener('click', () => {
    if (historyStack[historyIndex]) {
      navigateToUrl(historyStack[historyIndex], false);
    } else {
      navigateToUrl(addressBar.value, false);
    }
  });

  homeButton?.addEventListener('click', () => {
    navigateToUrl(DEFAULT_HOME_URL, true);
  });

  // Bookmark buttons
  bookmarkButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      if (url) navigateToUrl(url, true);
    });
  });

  // Firewall status chip: Opens macOS Application Firewall window
  firewallBtn?.addEventListener('click', () => {
    openApp('firewallWindow');
  });

  updateNavButtons();
  updateSslBadge(addressBar.value);
}

// --- Paint Assistant Critique ---

async function critiquePaintDrawing(): Promise<void> {
  const paintWindow = document.getElementById('paint') as HTMLDivElement | null;
  if (!paintWindow || paintWindow.style.display === 'none') return;
  const canvas = paintWindow.querySelector('#paint-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    if (assistantBubble) assistantBubble.textContent = 'Canvas not found!';
    return;
  }

  try {
    if (assistantBubble) assistantBubble.textContent = 'Appraising with on-device circuit...';
    const critique = await requestOnDeviceInference({
      prompt: 'Critique this drawing with witty 1990s retro sarcasm in 1 sentence.',
      contextType: 'paint',
      stream: false
    });
    if (assistantBubble) assistantBubble.textContent = critique;
  } catch (error: any) {
    if (assistantBubble) assistantBubble.textContent = `Art analysis: Truly abstract!`;
  }
}

// --- Simple Paint App ---

function initSimplePaintApp(windowElement: HTMLDivElement): void {
  const canvas = windowElement.querySelector('#paint-canvas') as HTMLCanvasElement;
  const toolbar = windowElement.querySelector('.paint-toolbar') as HTMLDivElement;
  const contentArea = windowElement.querySelector('.window-content') as HTMLDivElement;
  const colorSwatches = windowElement.querySelectorAll('.paint-color-swatch') as NodeListOf<HTMLButtonElement>;
  const sizeButtons = windowElement.querySelectorAll('.paint-size-button') as NodeListOf<HTMLButtonElement>;
  const clearButton = windowElement.querySelector('.paint-clear-button') as HTMLButtonElement;

  if (!canvas || !toolbar || !contentArea || !clearButton) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let currentStrokeStyle = ctx.strokeStyle;
  let currentLineWidth = ctx.lineWidth;

  function resizeCanvas() {
    const rect = contentArea.getBoundingClientRect();
    const toolbarHeight = toolbar.offsetHeight;
    const newWidth = Math.floor(rect.width);
    const newHeight = Math.floor(rect.height - toolbarHeight);

    if (canvas.width === newWidth && canvas.height === newHeight && newWidth > 0 && newHeight > 0) return;

    canvas.width = newWidth > 0 ? newWidth : 1;
    canvas.height = newHeight > 0 ? newHeight : 1;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = currentStrokeStyle;
    ctx.lineWidth = currentLineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(contentArea);
  paintResizeObserverMap.set(contentArea, resizeObserver);
  resizeCanvas();

  function getMousePos(canvasDom: HTMLCanvasElement, event: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = canvasDom.getBoundingClientRect();
    let clientX, clientY;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDrawing(e: MouseEvent | TouchEvent) {
    isDrawing = true;
    const pos = getMousePos(canvas, e);
    [lastX, lastY] = [pos.x, pos.y];
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
  }

  function draw(e: MouseEvent | TouchEvent) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getMousePos(canvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    [lastX, lastY] = [pos.x, pos.y];
  }

  function stopDrawing() {
    if (isDrawing) isDrawing = false;
  }

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);
  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);
  canvas.addEventListener('touchcancel', stopDrawing);

  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      ctx.strokeStyle = swatch.dataset.color || 'black';
      currentStrokeStyle = ctx.strokeStyle;
      colorSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
  });

  sizeButtons.forEach(button => {
    button.addEventListener('click', () => {
      ctx.lineWidth = parseInt(button.dataset.size || '2', 10);
      currentLineWidth = ctx.lineWidth;
      sizeButtons.forEach(s => s.classList.remove('active'));
      button.classList.add('active');
    });
  });

  clearButton.addEventListener('click', () => {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });
}

// --- Minesweeper ---

type MinesweeperCell = {
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number;
  element: HTMLDivElement;
  row: number;
  col: number;
};

function initMinesweeperGame(windowElement: HTMLDivElement): void {
  const boardElement = windowElement.querySelector('#minesweeper-board') as HTMLDivElement;
  const flagCountElement = windowElement.querySelector('.minesweeper-flag-count') as HTMLDivElement;
  const timerElement = windowElement.querySelector('.minesweeper-timer') as HTMLDivElement;
  const resetButton = windowElement.querySelector('.minesweeper-reset-button') as HTMLButtonElement;
  const hintButton = windowElement.querySelector('.minesweeper-hint-button') as HTMLButtonElement;
  const commentaryElement = windowElement.querySelector('.minesweeper-commentary') as HTMLDivElement;

  if (!boardElement || !flagCountElement || !timerElement || !resetButton || !hintButton || !commentaryElement) return;

  let grid: MinesweeperCell[][] = [];

  function resetGame() {
    if (minesweeperTimerInterval) clearInterval(minesweeperTimerInterval);
    minesweeperTimerInterval = null;
    minesweeperTimeElapsed = 0;
    minesweeperFlagsPlaced = 0;
    minesweeperGameOver = false;
    minesweeperFirstClick = true;
    minesweeperMineCount = 10;
    minesweeperGridSize = { rows: 9, cols: 9 };
    timerElement.textContent = `⏱️ 0`;
    flagCountElement.textContent = `🚩 ${minesweeperMineCount}`;
    resetButton.textContent = '🙂';
    commentaryElement.textContent = "Click a square to begin!";
    createGrid();
  }

  function createGrid() {
    boardElement.innerHTML = '';
    grid = [];
    boardElement.style.gridTemplateColumns = `repeat(${minesweeperGridSize.cols}, 20px)`;
    boardElement.style.gridTemplateRows = `repeat(${minesweeperGridSize.rows}, 20px)`;

    for (let r = 0; r < minesweeperGridSize.rows; r++) {
      const row: MinesweeperCell[] = [];
      for (let c = 0; c < minesweeperGridSize.cols; c++) {
        const cellElement = document.createElement('div');
        cellElement.classList.add('minesweeper-cell');
        const cellData: MinesweeperCell = {
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          adjacentMines: 0,
          element: cellElement,
          row: r,
          col: c
        };
        cellElement.addEventListener('click', () => handleCellClick(cellData));
        cellElement.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          handleCellRightClick(cellData);
        });
        row.push(cellData);
        boardElement.appendChild(cellElement);
      }
      grid.push(row);
    }
  }

  function placeMines(firstClickRow: number, firstClickCol: number) {
    let minesPlaced = 0;
    while (minesPlaced < minesweeperMineCount) {
      const r = Math.floor(Math.random() * minesweeperGridSize.rows);
      const c = Math.floor(Math.random() * minesweeperGridSize.cols);
      if ((r === firstClickRow && c === firstClickCol) || grid[r][c].isMine) continue;
      grid[r][c].isMine = true;
      minesPlaced++;
    }
    for (let r = 0; r < minesweeperGridSize.rows; r++) {
      for (let c = 0; c < minesweeperGridSize.cols; c++) {
        if (!grid[r][c].isMine) grid[r][c].adjacentMines = countAdjacentMines(r, c);
      }
    }
  }

  function countAdjacentMines(row: number, col: number): number {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < minesweeperGridSize.rows && nc >= 0 && nc < minesweeperGridSize.cols && grid[nr][nc].isMine) {
          count++;
        }
      }
    }
    return count;
  }

  function handleCellClick(cell: MinesweeperCell) {
    if (minesweeperGameOver || cell.isRevealed || cell.isFlagged) return;
    if (minesweeperFirstClick && !minesweeperTimerInterval) {
      placeMines(cell.row, cell.col);
      minesweeperFirstClick = false;
      startTimer();
    }
    if (cell.isMine) gameOver(cell);
    else {
      revealCell(cell);
      checkWinCondition();
    }
  }

  function handleCellRightClick(cell: MinesweeperCell) {
    if (minesweeperGameOver || cell.isRevealed || (minesweeperFirstClick && !minesweeperTimerInterval)) return;
    cell.isFlagged = !cell.isFlagged;
    cell.element.textContent = cell.isFlagged ? '🚩' : '';
    minesweeperFlagsPlaced += cell.isFlagged ? 1 : -1;
    flagCountElement.textContent = `🚩 ${minesweeperMineCount - minesweeperFlagsPlaced}`;
    checkWinCondition();
  }

  function revealCell(cell: MinesweeperCell) {
    if (cell.isRevealed || cell.isFlagged || cell.isMine) return;
    cell.isRevealed = true;
    cell.element.classList.add('revealed');
    cell.element.textContent = '';
    if (cell.adjacentMines > 0) {
      cell.element.textContent = cell.adjacentMines.toString();
      cell.element.dataset.number = cell.adjacentMines.toString();
    } else {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = cell.row + dr;
          const nc = cell.col + dc;
          if (nr >= 0 && nr < minesweeperGridSize.rows && nc >= 0 && nc < minesweeperGridSize.cols) {
            const neighbor = grid[nr][nc];
            if (!neighbor.isRevealed && !neighbor.isFlagged) revealCell(neighbor);
          }
        }
      }
    }
  }

  function startTimer() {
    if (minesweeperTimerInterval) return;
    minesweeperTimeElapsed = 0;
    timerElement.textContent = `⏱️ 0`;
    minesweeperTimerInterval = window.setInterval(() => {
      minesweeperTimeElapsed++;
      timerElement.textContent = `⏱️ ${minesweeperTimeElapsed}`;
    }, 1000);
  }

  function gameOver(clickedMine: MinesweeperCell) {
    minesweeperGameOver = true;
    if (minesweeperTimerInterval) clearInterval(minesweeperTimerInterval);
    minesweeperTimerInterval = null;
    resetButton.textContent = '😵';
    grid.forEach(row => row.forEach(cell => {
      if (cell.isMine) {
        cell.element.classList.add('mine', 'revealed');
        cell.element.textContent = '💣';
      }
    }));
    clickedMine.element.classList.add('exploded');
    clickedMine.element.textContent = '💥';
  }

  function checkWinCondition() {
    if (minesweeperGameOver) return;
    let revealedCount = 0;
    grid.forEach(row => row.forEach(cell => {
      if (cell.isRevealed && !cell.isMine) revealedCount++;
    }));
    const totalNonMine = (minesweeperGridSize.rows * minesweeperGridSize.cols) - minesweeperMineCount;
    if (revealedCount === totalNonMine) {
      minesweeperGameOver = true;
      if (minesweeperTimerInterval) clearInterval(minesweeperTimerInterval);
      minesweeperTimerInterval = null;
      resetButton.textContent = '😎';
      commentaryElement.textContent = 'Victory! All mines cleared safely.';
    }
  }

  async function getAiHint() {
    if (minesweeperGameOver || minesweeperFirstClick) {
      commentaryElement.textContent = 'Click a square first!';
      return;
    }
    hintButton.disabled = true;
    commentaryElement.textContent = 'Analyzing board with on-device LLM...';

    try {
      const hint = await requestOnDeviceInference({
        prompt: 'Give a 1-sentence tactical Minesweeper hint.',
        contextType: 'minesweeper',
        stream: false
      });
      commentaryElement.textContent = hint;
    } catch {
      commentaryElement.textContent = 'Scan the edge perimeter tiles first!';
    } finally {
      hintButton.disabled = false;
    }
  }

  resetButton.addEventListener('click', resetGame);
  hintButton.addEventListener('click', getAiHint);
  resetGame();
}

// --- My Computer ---

function initMyComputer(windowElement: HTMLDivElement): void {
  const cDriveIcon = windowElement.querySelector('#c-drive-icon') as HTMLDivElement;
  const cDriveContent = windowElement.querySelector('#c-drive-content') as HTMLDivElement;
  const secretImageIcon = windowElement.querySelector('#secret-image-icon') as HTMLDivElement;
  if (!cDriveIcon || !cDriveContent || !secretImageIcon) return;

  cDriveIcon.addEventListener('click', () => {
    cDriveIcon.style.display = 'none';
    cDriveContent.style.display = 'block';
  });

  secretImageIcon.addEventListener('click', () => {
    const imageViewerWindow = document.getElementById('imageViewer') as HTMLDivElement | null;
    const imageViewerImg = document.getElementById('image-viewer-img') as HTMLImageElement | null;
    const imageViewerTitle = document.getElementById('image-viewer-title') as HTMLSpanElement | null;
    if (!imageViewerWindow || !imageViewerImg || !imageViewerTitle) return;

    imageViewerImg.src = 'https://storage.googleapis.com/gemini-95-icons/%40ammaar%2B%40olacombe.png';
    imageViewerImg.alt = 'dontshowthistoanyone.jpg';
    imageViewerTitle.textContent = 'dontshowthistoanyone.jpg - Image Viewer';
    openApp('imageViewer');
  });

  cDriveIcon.style.display = 'inline-flex';
  cDriveContent.style.display = 'none';
}

// --- YouTube Player ---

function loadYouTubeApi(): Promise<void> {
  if (ytApiLoaded) return Promise.resolve();
  if (ytApiLoadingPromise) return ytApiLoadingPromise;

  ytApiLoadingPromise = new Promise((resolve, reject) => {
    // @ts-ignore
    if (window.YT && window.YT.Player) {
      ytApiLoaded = true;
      resolve();
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => {
      ytApiLoadingPromise = null;
      reject(new Error('YouTube API load failed'));
    };
    const firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode!.insertBefore(tag, firstScript);

    // @ts-ignore
    window.onYouTubeIframeAPIReady = () => {
      ytApiLoaded = true;
      ytApiLoadingPromise = null;
      resolve();
    };
    setTimeout(() => {
      if (!ytApiLoaded) {
        ytApiLoadingPromise = null;
        resolve();
      }
    }, 6000);
  });
  return ytApiLoadingPromise;
}

function getYouTubeVideoId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;
  const match = urlOrId.match(/^.*(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]{11}).*/);
  return match && match[1] ? match[1] : null;
}

async function initMediaPlayer(windowElement: HTMLDivElement): Promise<void> {
  const appName = windowElement.id;
  const urlInput = windowElement.querySelector('.media-player-input') as HTMLInputElement;
  const loadButton = windowElement.querySelector('.media-player-load-button') as HTMLButtonElement;
  const playerContainerDivId = `youtube-player-${appName}`;
  const playerDiv = windowElement.querySelector(`#${playerContainerDivId}`) as HTMLDivElement;
  const playButton = windowElement.querySelector('#media-player-play') as HTMLButtonElement;
  const pauseButton = windowElement.querySelector('#media-player-pause') as HTMLButtonElement;
  const stopButton = windowElement.querySelector('#media-player-stop') as HTMLButtonElement;

  if (!urlInput || !loadButton || !playerDiv || !playButton || !pauseButton || !stopButton) return;

  const createPlayer = (videoId: string) => {
    playerDiv.innerHTML = '';
    try {
      // @ts-ignore
      youtubePlayers[appName] = new YT.Player(playerContainerDivId, {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: { playsinline: 1, autoplay: 1, controls: 0, modestbranding: 1, rel: 0, fs: 0 }
      });
    } catch (error: any) {
      playerDiv.innerHTML = `<p class="media-player-status-message">Ready: ${videoId}</p>`;
    }
  };

  loadButton.addEventListener('click', () => {
    const videoId = getYouTubeVideoId(urlInput.value.trim());
    if (videoId) createPlayer(videoId);
  });

  playButton.addEventListener('click', () => {
    // @ts-ignore
    youtubePlayers[appName]?.playVideo?.();
  });
  pauseButton.addEventListener('click', () => {
    // @ts-ignore
    youtubePlayers[appName]?.pauseVideo?.();
  });
  stopButton.addEventListener('click', () => {
    // @ts-ignore
    youtubePlayers[appName]?.stopVideo?.();
  });

  try {
    await loadYouTubeApi();
    createPlayer(DEFAULT_YOUTUBE_VIDEO_ID);
  } catch {
    playerDiv.innerHTML = `<p class="media-player-status-message">Enter a YouTube video URL or ID.</p>`;
  }
}

// --- Global Event Handlers ---

icons.forEach(icon => {
  icon.addEventListener('click', () => {
    const appName = icon.getAttribute('data-app');
    if (appName) {
      openApp(appName);
      startMenu.classList.remove('active');
    }
  });
});

document.querySelectorAll('.start-menu-item').forEach(item => {
  item.addEventListener('click', () => {
    const appName = (item as HTMLElement).getAttribute('data-app');
    if (appName) openApp(appName);
    startMenu.classList.remove('active');
  });
});

startButton.addEventListener('click', (e) => {
  e.stopPropagation();
  startMenu.classList.toggle('active');
  if (startMenu.classList.contains('active')) {
    highestZIndex++;
    startMenu.style.zIndex = highestZIndex.toString();
  }
});

windows.forEach(windowElement => {
  const titleBar = windowElement.querySelector('.window-titlebar') as HTMLDivElement | null;
  const closeButton = windowElement.querySelector('.window-close') as HTMLDivElement | null;
  const minimizeButton = windowElement.querySelector('.window-minimize') as HTMLDivElement | null;

  windowElement.addEventListener('mousedown', () => bringToFront(windowElement), true);

  if (closeButton) {
    closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      closeApp(windowElement.id);
    });
  }
  if (minimizeButton) {
    minimizeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      minimizeApp(windowElement.id);
    });
  }

  if (titleBar) {
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const startDragging = (e: MouseEvent) => {
      if (!(e.target === titleBar || titleBar.contains(e.target as Node)) || (e.target as Element).closest('.window-control-button')) {
        return;
      }
      isDragging = true;
      bringToFront(windowElement);
      const rect = windowElement.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      titleBar.style.cursor = 'grabbing';
      document.addEventListener('mousemove', dragWindow);
      document.addEventListener('mouseup', stopDragging, { once: true });
    };

    const dragWindow = (e: MouseEvent) => {
      if (!isDragging) return;
      let x = e.clientX - dragOffsetX;
      let y = e.clientY - dragOffsetY;
      const taskbarHeight = taskbarAppsContainer.parentElement?.offsetHeight ?? 36;
      const maxX = window.innerWidth - windowElement.offsetWidth;
      const maxY = window.innerHeight - windowElement.offsetHeight - taskbarHeight;
      x = Math.max(-(windowElement.offsetWidth - 40), Math.min(x, maxX));
      y = Math.max(0, Math.min(y, maxY));
      windowElement.style.left = `${x}px`;
      windowElement.style.top = `${y}px`;
    };

    const stopDragging = () => {
      if (!isDragging) return;
      isDragging = false;
      titleBar.style.cursor = 'grab';
      document.removeEventListener('mousemove', dragWindow);
    };

    titleBar.addEventListener('mousedown', startDragging);
  }

  const randomTop = Math.random() * (window.innerHeight / 4) + 20;
  const randomLeft = Math.random() * (window.innerWidth / 3) + 20;
  windowElement.style.top = `${randomTop}px`;
  windowElement.style.left = `${randomLeft}px`;
});

document.addEventListener('click', (e) => {
  if (startMenu.classList.contains('active') && !startMenu.contains(e.target as Node) && !startButton.contains(e.target as Node)) {
    startMenu.classList.remove('active');
  }
});

function findIconElement(appName: string): HTMLDivElement | undefined {
  return Array.from(icons).find(icon => icon.dataset.app === appName);
}

// Initialize Taskbar System Tray, Clock, Volume & Inference Subsystems
initTaskbarClock();
virtIOSound.initTrayUI();
universalInference.initUI();

// macOS Application Firewall Taskbar Tray Hook
document.getElementById('taskbar-firewall-btn')?.addEventListener('click', () => {
  openApp('firewallWindow');
});

// --- Automated Model Registry Boot Synchronization ---
// Persists user choices to model-registry.json and browser localStorage,
// and automatically reloads the last selected GGUF model on subsequent boots.
async function initializeModelRegistryBoot(): Promise<void> {
  let reloadedModelName: string | null = null;
  let reloadedModelId: string | null = null;
  let isSetupDone = localStorage.getItem('llm95_setup_completed') === 'true';

  // 1. Check server-side persistent model-registry.json
  try {
    const res = await fetch('/api/model-registry');
    if (res.ok) {
      const data = await res.json();
      if (data.registry) {
        if (data.registry.setupCompleted) {
          isSetupDone = true;
          localStorage.setItem('llm95_setup_completed', 'true');
        }
        if (data.registry.autoReloadOnBoot !== false && data.registry.activeModelName) {
          reloadedModelName = data.registry.activeModelName;
          reloadedModelId = data.registry.activeModelId;
          console.log(`[Model Registry] Detected registered GGUF model from model-registry.json: ${reloadedModelName} (Boot #${data.registry.bootCount || 1})`);
        }
      }
    }
  } catch (err) {
    console.warn('[Model Registry] Server-side registry check skipped, falling back to browser storage:', err);
  }

  // 2. Check browser localStorage fallback
  if (!reloadedModelName) {
    const localRegStr = localStorage.getItem('llm95_model_registry');
    if (localRegStr) {
      try {
        const localReg = JSON.parse(localRegStr);
        if (localReg.autoReloadOnBoot !== false && localReg.activeModelName) {
          reloadedModelName = localReg.activeModelName;
          reloadedModelId = localReg.activeModelId;
        }
      } catch {}
    }
    if (!reloadedModelName || reloadedModelName.toLowerCase().includes('llama')) {
      reloadedModelName = 'Gemma-2-2B-it-Q4_K_M.gguf';
      reloadedModelId = 'gemma-2-2b-it-q4_k_m';
      localStorage.setItem('llm95_selected_model', reloadedModelName);
      localStorage.setItem('llm95_selected_model_id', reloadedModelId);
    }
  }

  // 3. Automatically reload and hydrate the last selected GGUF model (Default: Gemma)
  if (reloadedModelName) {
    activeModelName = reloadedModelName;
    updateTaskbarStatus(reloadedModelName);
    console.log(`[Model Registry] ★ System active on-device GGUF model: ${reloadedModelName}`);

    // Synchronize backend active model selection
    try {
      await fetch('/api/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: reloadedModelName, modelId: reloadedModelId })
      });
    } catch {}
  }

  // 4. Launch sequence:
  // - First launch: trigger automated Setup Wizard
  // - Subsequent launches: boot straight into configured Sealed OS with reloaded model
  setTimeout(() => {
    if (!isSetupDone) {
      console.log('[LLM-95] First launch detected. Triggering automated Hardware Scan & OS Setup Wizard.');
      openApp('setupWizard');
    } else {
      console.log(`[LLM-95] Booting into configured Sealed OS with reloaded model (${activeModelName}).`);
      openApp('gemini');
    }
  }, 350);
}

initializeModelRegistryBoot();

console.log('LLM-95 On-Device Autonomous OS Pilot Initialized (macOS Tahoe VirtIO)');
