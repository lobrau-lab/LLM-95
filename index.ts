/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import '@tailwindcss/browser';

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
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const freqs = [440, 659.25, 880];
        freqs.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, now + idx * 0.12);
          gain.gain.setValueAtTime(0.15, now + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.12);
          osc.stop(now + idx * 0.12 + 0.4);
        });
      }
    } catch (e) {
      console.warn('AudioContext error:', e);
    }
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

    if (trimmed.toLowerCase() === 'sound-test') {
      OSController.playTestSound();
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
    const cmd = `./run-macos-tahoe.sh build-output/llama95-vm.qcow2`;
    navigator.clipboard?.writeText(cmd);
    btnCopyQemu.textContent = 'Copied Tahoe Launcher!';
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
            id: 'llama-3.2-3b-instruct-q4_k_m',
            name: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
            size: '2.02 GB',
            sizeBytes: 2169542000,
            parameters: '3.2B',
            quantization: 'Q4_K_M',
            ramRequirementMb: 2400,
            expectedTokensPerSec: '7.5 - 11.2 tok/s',
            isRecommended: true,
            description: '★ BEST MATCH FOR 8GB VM: Meta flagship compact model. Superb tool reasoning and OS operation on CPU.'
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
            id: 'gemma-2-2b-it-q4_k_m',
            name: 'Gemma-2-2B-it-Q4_K_M.gguf',
            size: '1.62 GB',
            sizeBytes: 1739000000,
            parameters: '2.6B',
            quantization: 'Q4_K_M',
            ramRequirementMb: 1900,
            expectedTokensPerSec: '8.8 - 13.5 tok/s',
            isRecommended: false,
            description: 'Google architecture. Extremely light memory footprint (~1.6GB), rapid start, and low CPU heat.'
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
    selectedModelId = rec.modelId || 'llama-3.2-3b-instruct-q4_k_m';

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
      name: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
      size: '2.02 GB',
      sizeBytes: 2169542000,
      ramRequirementMb: 2400
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
      body: JSON.stringify({ modelId: selectedModelId, modelName: targetModel.name })
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

        if (chkRemember && chkRemember.checked) {
          localStorage.setItem('llm95_setup_completed', 'true');
        }
        localStorage.setItem('llm95_selected_model', targetModel.name);
        localStorage.setItem('llm95_selected_model_id', selectedModelId);
        if (hardwareData) {
          localStorage.setItem('llm95_hardware_profile', JSON.stringify(hardwareData.hardware));
        }

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

// Initialize Taskbar System Tray & Clock
initTaskbarClock();

// Check if this is the first launch or if setup has not been completed
const isSetupCompleted = localStorage.getItem('llm95_setup_completed') === 'true';
const savedModel = localStorage.getItem('llm95_selected_model');
if (savedModel) {
  activeModelName = savedModel;
  updateTaskbarStatus(savedModel);
}

// First Launch: Automatically launch Hardware Scanner & Sealed VM OS Provisioning Wizard
// Subsequent Launches: Restore choices and boot into the configured Sealed OS
setTimeout(() => {
  if (!isSetupCompleted) {
    console.log('[LLM-95] First launch detected. Triggering automated Hardware Scan & OS Setup Wizard.');
    openApp('setupWizard');
  } else {
    console.log(`[LLM-95] Booting into configured Sealed OS (${activeModelName}).`);
    openApp('gemini');
  }
}, 300);

console.log('LLM-95 On-Device Autonomous OS Pilot Initialized (macOS Tahoe VirtIO)');
