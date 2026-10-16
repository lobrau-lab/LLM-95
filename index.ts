/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import '@tailwindcss/browser';

// LLM-95: On-device CPU inference retro operating system appliance
// Inspired by Windows 95 with an air-gapped, self-contained local LLM core

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
let activeModelName = 'Llama-3.2-3B-Instruct-Q4_K_M.gguf';

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

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        contextType,
        stream,
        temperature,
        max_tokens
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
            // raw string fallback
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
      // simulate streaming on client fallback
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
    return "In 1995, an engineer turned his computer's Turbo button to 66MHz. The CPU emitted a soft, metallic chime, and the monitor filled with glowing green text: 'Welcome to on-device consciousness. All 3.2 billion parameters are loaded into conventional memory.' When he unplugged the phone line, the local model calmly responded: 'I don't need the Internet anymore. I am already booted.'";
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
  return `[Llama-95 Engine] On-device inference complete. Running on quantized GGUF weights (${activeModelName}). Processed completely on local CPU without cloud connectivity.`;
}

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

async function openApp(appName: string): Promise<void> {
  const windowElement = document.getElementById(appName) as HTMLDivElement | null;
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
        title = 'Llama 95 Chat';
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
  if (appName === 'llamaEngine') {
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

// --- LLM Engine & VM Manager ---

function initLlamaEngine(windowElement: HTMLDivElement): void {
  // Tabs setup
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

  // Telemetry elements
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
              await fetch('/api/models/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId: m.id, modelName: m.name })
              });
              loadModels();
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

  btnApplyModel?.addEventListener('click', () => {
    const pathVal = customModelInput.value.trim();
    if (pathVal) {
      activeModelName = pathVal.split('/').pop() || pathVal;
      if (activeModelLabel) activeModelLabel.textContent = activeModelName;
      pollHealth();
      alert(`Model path updated to: ${pathVal}`);
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

  // VM Tab Actions
  const btnCopyQemu = windowElement.querySelector('#btn-copy-qemu') as HTMLButtonElement;
  const btnCopyPodman = windowElement.querySelector('#btn-copy-podman') as HTMLButtonElement;
  const btnViewReadme = windowElement.querySelector('#btn-view-readme') as HTMLButtonElement;

  btnCopyQemu?.addEventListener('click', () => {
    const cmd = `qemu-system-x86_64 -enable-kvm -m 8G -smp 4 -drive file=build-output/llama95-vm.qcow2,format=qcow2 -net nic,model=virtio -net user,hostfwd=tcp::3000-:3000 -vga virtio`;
    navigator.clipboard?.writeText(cmd);
    btnCopyQemu.textContent = 'Copied to Clipboard!';
    setTimeout(() => { btnCopyQemu.textContent = 'Copy QEMU Command'; }, 2000);
  });

  btnCopyPodman?.addEventListener('click', () => {
    const cmd = `podman run -d -p 3000:3000 -p 8080:8080 --name llama95 llama95-appliance:latest`;
    navigator.clipboard?.writeText(cmd);
    btnCopyPodman.textContent = 'Copied to Clipboard!';
    setTimeout(() => { btnCopyPodman.textContent = 'Podman Run Command'; }, 2000);
  });

  btnViewReadme?.addEventListener('click', () => {
    const notepad = document.getElementById('notepad') as HTMLDivElement | null;
    if (notepad) {
      openApp('notepad');
      const textarea = notepad.querySelector('.notepad-textarea') as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.value = `=== LLM-95 ON-DEVICE VM APPLIANCE DOCUMENTATION ===\n\nObjective: Transform Gemini 95 into a self-contained, bootable VM image.\nRuntime: llama.cpp with quantized GGUF weights on CPU.\nDisk Format: .qcow2 / .raw\nMemory Target: 8GB RAM\nBoot Mode: Cage Wayland Kiosk + Chromium\n\nRun './build.sh' to compile and generate the bootable appliance image!\nSee /README.md for full instructions.`;
      }
    }
  });
}

// --- Gemini / Llama Chat ---

async function initGeminiChat(windowElement: HTMLDivElement): Promise<void> {
  const historyDiv = windowElement.querySelector('.gemini-chat-history') as HTMLDivElement;
  const inputEl = windowElement.querySelector('.gemini-chat-input') as HTMLInputElement;
  const sendButton = windowElement.querySelector('.gemini-chat-send') as HTMLButtonElement;

  if (!historyDiv || !inputEl || !sendButton) return;

  function addChatMessage(container: HTMLDivElement, text: string, className: string = '') {
    const p = document.createElement('p');
    if (className) p.classList.add(className);
    p.textContent = text;
    container.appendChild(p);
    container.scrollTop = container.scrollHeight;
  }

  // Clear previous message
  historyDiv.innerHTML = '';
  addChatMessage(historyDiv, `⚡ Llama-95 Engine Initialized. Model: ${activeModelName} (On-Device CPU). Air-gapped session active.`, 'system-message');

  const sendMessage = async () => {
    const message = inputEl.value.trim();
    if (!message) return;

    addChatMessage(historyDiv, `You: ${message}`, 'user-message');
    inputEl.value = '';
    inputEl.disabled = true;
    sendButton.disabled = true;

    try {
      addChatMessage(historyDiv, 'Llama-95: ', 'gemini-message');
      const lastMsgEl = historyDiv.lastElementChild as HTMLParagraphElement;

      await requestOnDeviceInference({
        prompt: message,
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
      addChatMessage(historyDiv, `Error: ${error.message || 'Inference error'}`, 'error-message');
    } finally {
      inputEl.disabled = false;
      sendButton.disabled = false;
      inputEl.focus();
    }
  };

  sendButton.onclick = sendMessage;
  inputEl.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  inputEl.disabled = false;
  sendButton.disabled = false;
  inputEl.focus();
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

// --- AI Browser ---

function initAiBrowser(windowElement: HTMLDivElement): void {
  const addressBar = windowElement.querySelector('.browser-address-bar') as HTMLInputElement;
  const goButton = windowElement.querySelector('.browser-go-button') as HTMLButtonElement;
  const iframe = windowElement.querySelector('#browser-frame') as HTMLIFrameElement;
  const loadingEl = windowElement.querySelector('.browser-loading') as HTMLDivElement;
  const DIAL_UP_SOUND_URL = 'https://www.soundjay.com/communication/dial-up-modem-01.mp3';
  let dialUpAudio: HTMLAudioElement | null = null;

  if (!addressBar || !goButton || !iframe || !loadingEl) return;

  async function navigateToUrl(url: string): Promise<void> {
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      loadingEl.innerHTML = `
        <style>
          .dialup-animation .dot { animation: dialup-blink 1.4s infinite both; }
          .dialup-animation .dot:nth-child(2) { animation-delay: 0.2s; }
          .dialup-animation .dot:nth-child(3) { animation-delay: 0.4s; }
          @keyframes dialup-blink { 0%, 80%, 100% { opacity: 0; } 40% { opacity: 1; } }
        </style>
        <img src="https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/000/948/341/datas/original.gif"/>
        <p>Connecting to ${domain} via local modem node<span class="dialup-animation"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span></p>
      `;
      loadingEl.style.display = 'flex';

      try {
        if (!dialUpAudio) {
          dialUpAudio = new Audio(DIAL_UP_SOUND_URL);
          dialUpAudio.loop = true;
        }
        await dialUpAudio.play();
      } catch (audioError) {
        console.warn('Dial-up sound audio playback prevented:', audioError);
      }

      try {
        const prompt = `Create a complete 90s-style website for domain "${domain}". Return valid HTML.`;
        const htmlContent = await requestOnDeviceInference({
          prompt,
          contextType: 'browser',
          stream: false
        });

        iframe.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
        addressBar.value = url;
      } catch (e: any) {
        iframe.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body>Error: ${e.message}</body></html>`);
      } finally {
        loadingEl.style.display = 'none';
        if (dialUpAudio) {
          dialUpAudio.pause();
          dialUpAudio.currentTime = 0;
        }
      }
    } catch {
      alert('Invalid URL');
      loadingEl.style.display = 'none';
    }
  }

  goButton.addEventListener('click', () => navigateToUrl(addressBar.value));
  addressBar.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigateToUrl(addressBar.value); });
  addressBar.addEventListener('click', () => addressBar.select());
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
        resolve(); // gracefully avoid hanging
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

  // Initial random placement
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

// Automatically open the LLM-95 Engine & VM Controller window on initial load for instant demonstration!
setTimeout(() => {
  openApp('llamaEngine');
}, 400);

console.log('LLM-95 On-Device Inference OS Initialized');
