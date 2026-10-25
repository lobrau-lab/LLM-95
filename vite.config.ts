import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, Plugin } from 'vite';
import os from 'os';

function localLlamaPlugin(): Plugin {
  const REGISTRY_FILE = path.join(process.cwd(), 'model-registry.json');

  function loadModelRegistry() {
    try {
      if (fs.existsSync(REGISTRY_FILE)) {
        const content = fs.readFileSync(REGISTRY_FILE, 'utf-8');
        const data = JSON.parse(content);
        data.bootCount = (data.bootCount || 0) + 1;
        data.lastBootTimestamp = new Date().toISOString();
        fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[Vite Dev] Model Registry loaded from disk: ${data.activeModelName} (Boot #${data.bootCount})`);
        return data;
      }
    } catch (err) {
      console.warn('[Vite Dev] Error reading registry file:', err);
    }
    return {
      version: '1.0',
      activeModelId: 'gemma-2-2b-it-q4_k_m',
      activeModelName: 'Gemma-2-2B-it-Q4_K_M.gguf',
      activeModelPath: '/models/Gemma-2-2B-it-Q4_K_M.gguf',
      autoReloadOnBoot: true,
      bootCount: 1,
      setupCompleted: false
    };
  }

  function saveModelRegistry(update: any) {
    let current: any;
    try {
      if (fs.existsSync(REGISTRY_FILE)) {
        current = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
      } else {
        current = loadModelRegistry();
      }
    } catch {
      current = loadModelRegistry();
    }
    const updated = {
      ...current,
      ...update,
      lastSelectedTimestamp: new Date().toISOString()
    };
    try {
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify(updated, null, 2), 'utf-8');
      console.log(`[Vite Dev] Persisted model registry update: ${updated.activeModelName}`);
    } catch (e) {
      console.warn('[Vite Dev] Error saving registry:', e);
    }
    return updated;
  }

  const persistentRegistry = loadModelRegistry();
  const startTime = Date.now();
  let activeModelName = (persistentRegistry.autoReloadOnBoot && persistentRegistry.activeModelName) 
    ? persistentRegistry.activeModelName 
    : 'Gemma-2-2B-it-Q4_K_M.gguf';
  let lastInferenceLatency = 34;
  let totalTokensGenerated = 0;
  let masterVolume = 80;
  let isMuted = false;

  interface DetectedInferenceServer {
    type: 'ollama' | 'lmstudio' | 'llama_cpp' | 'vllm' | 'openai_generic' | 'standby';
    name: string;
    url: string;
    models: string[];
    activeModel?: string;
    latencyMs: number;
    healthy: boolean;
    version?: string;
  }

  let customInferenceUrl: string = process.env.LLAMA_SERVER_URL || '';
  let activeInferenceConnection: DetectedInferenceServer = {
    type: 'standby',
    name: 'Gemma-95 On-Device Synthetic Core (Standby)',
    url: '',
    models: ['Gemma-2-2B-it-Q4_K_M.gguf'],
    activeModel: activeModelName,
    latencyMs: 32,
    healthy: true
  };

  const INFERENCE_CANDIDATES = [
    () => customInferenceUrl ? { url: customInferenceUrl.replace(/\/+$/, ''), hint: 'custom' } : null,
    () => ({ url: 'http://127.0.0.1:11434', hint: 'ollama' }),
    () => ({ url: 'http://localhost:11434', hint: 'ollama' }),
    () => ({ url: 'http://10.0.2.2:11434', hint: 'ollama' }),
    () => ({ url: 'http://host.docker.internal:11434', hint: 'ollama' }),
    () => ({ url: 'http://127.0.0.1:1234', hint: 'lmstudio' }),
    () => ({ url: 'http://localhost:1234', hint: 'lmstudio' }),
    () => ({ url: 'http://10.0.2.2:1234', hint: 'lmstudio' }),
    () => ({ url: 'http://host.docker.internal:1234', hint: 'lmstudio' }),
    () => ({ url: 'http://127.0.0.1:8080', hint: 'llama_cpp' }),
    () => ({ url: 'http://localhost:8080', hint: 'llama_cpp' }),
    () => ({ url: 'http://10.0.2.2:8080', hint: 'llama_cpp' }),
    () => ({ url: 'http://host.docker.internal:8080', hint: 'llama_cpp' }),
    () => ({ url: 'http://127.0.0.1:8000', hint: 'vllm' }),
    () => ({ url: 'http://localhost:8000', hint: 'vllm' }),
    () => ({ url: 'http://127.0.0.1:5000', hint: 'openai_generic' })
  ];

  async function probeEndpoint(baseUrl: string): Promise<DetectedInferenceServer | null> {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const t0 = Date.now();

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 650);
      const res = await fetch(`${cleanUrl}/api/tags`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json() as any;
        const models = Array.isArray(data.models) ? data.models.map((m: any) => m.name || m.model) : [];
        let version = 'v0.x';
        try {
          const vRes = await fetch(`${cleanUrl}/api/version`, { signal: AbortSignal.timeout(300) });
          if (vRes.ok) {
            const vData = await vRes.json() as any;
            version = vData.version || version;
          }
        } catch {}
        return {
          type: 'ollama',
          name: `Ollama (${version})`,
          url: cleanUrl,
          models: models.length ? models : ['llama3.2', 'llama3', 'mistral', 'phi3'],
          activeModel: models[0] || 'llama3.2',
          latencyMs: Date.now() - t0,
          healthy: true,
          version
        };
      }
    } catch {}

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 650);
      const res = await fetch(`${cleanUrl}/v1/models`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json() as any;
        const models = Array.isArray(data.data) ? data.data.map((m: any) => m.id) : [];
        const isLmStudio = cleanUrl.includes('1234') || (models.some((m: string) => m.includes('/') || m.includes('gguf')));
        return {
          type: isLmStudio ? 'lmstudio' : 'openai_generic',
          name: isLmStudio ? 'LM Studio' : 'OpenAI-Compatible Server',
          url: cleanUrl,
          models: models.length ? models : ['local-model'],
          activeModel: models[0] || 'local-model',
          latencyMs: Date.now() - t0,
          healthy: true
        };
      }
    } catch {}

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 650);
      const res = await fetch(`${cleanUrl}/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        return {
          type: 'llama_cpp',
          name: 'llama.cpp Native Server',
          url: cleanUrl,
          models: [activeModelName],
          activeModel: activeModelName,
          latencyMs: Date.now() - t0,
          healthy: true
        };
      }
    } catch {}

    return null;
  }

  async function universalAutoDetectInference(forceProbeUrl?: string): Promise<DetectedInferenceServer> {
    if (forceProbeUrl) {
      const detected = await probeEndpoint(forceProbeUrl);
      if (detected) {
        activeInferenceConnection = detected;
        return detected;
      }
    }

    const candidates: Array<{ url: string; hint: string }> = [];
    const seen = new Set<string>();
    for (const fn of INFERENCE_CANDIDATES) {
      const item = fn();
      if (item && !seen.has(item.url)) {
        seen.add(item.url);
        candidates.push(item);
      }
    }

    const probes = candidates.map(c => probeEndpoint(c.url));
    const results = await Promise.allSettled(probes);

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.healthy) {
        activeInferenceConnection = r.value;
        console.log(`[Vite Dev] Universal inference auto-detected: ${r.value.name} at ${r.value.url}`);
        return r.value;
      }
    }

    activeInferenceConnection = {
      type: 'standby',
      name: 'LLM-95 On-Device Synthetic Core (Standby)',
      url: '',
      models: AVAILABLE_MODELS.map(m => m.name),
      activeModel: activeModelName,
      latencyMs: 30,
      healthy: true
    };
    return activeInferenceConnection;
  }

  universalAutoDetectInference().catch(() => {});

  const AVAILABLE_MODELS = [
    {
      id: 'gemma-2-2b-it-q4_k_m',
      name: 'Gemma-2-2B-it-Q4_K_M.gguf',
      size: '1.62 GB',
      sizeBytes: 1739000000,
      parameters: '2.6B',
      quantization: 'Q4_K_M',
      ramRequirementMb: 1900,
      expectedTokensPerSec: '8.8 - 13.5 tok/s',
      recommendedCores: '2 - 4 Cores',
      suitability: 'Recommended',
      description: '★ DEFAULT ON-DEVICE MODEL: Google Gemma 2 flagship architecture. Highly efficient CPU inference, rapid start, superb terminal supervision & low memory footprint (~1.6GB).',
      url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
      active: true
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
      recommendedCores: '4 - 8 Cores',
      suitability: 'Optimal',
      description: 'Meta compact model. Tool reasoning and OS operation on CPU.',
      url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
      active: false
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
      recommendedCores: '4 - 8 Cores',
      suitability: 'Optimal',
      description: 'Microsoft compact reasoning model. Outstanding coding, terminal command generation, and logic.',
      url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
      active: false
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
      recommendedCores: '2 - 4 Cores',
      suitability: 'Fast',
      description: 'Ultra-fast inference speed for minimal hardware. Instant latency and minimal disk footprint.',
      url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf',
      active: false
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
      recommendedCores: '8+ Cores',
      suitability: 'Heavy',
      description: 'Maximum intelligence & deep system control. High RAM requirement; ideal for high-spec workstations.',
      url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
      active: false
    }
  ];

  const PACKAGE_REGISTRY = [
    { name: 'llama-cli', version: 'b3420-1', format: 'apk', size: '1.2 MB', installed: true, description: 'Command-line tool for GGUF model execution & benchmark', category: 'ai' },
    { name: 'virtio-gpu-tahoe-kmod', version: '2.4.1', format: 'apk', size: '3.8 MB', installed: true, description: 'VirtIO GPU driver with Metal 3 acceleration tuned for macOS Tahoe host', category: 'system' },
    { name: 'virtio-snd-coreaudio', version: '1.9.0', format: 'apk', size: '1.4 MB', installed: true, description: 'VirtIO Sound low-latency CoreAudio bridge with 48kHz audio buffer', category: 'system' },
    { name: 'python3', version: '3.11.8-r0', format: 'apk', size: '28.4 MB', installed: true, description: 'Python 3 programming environment with standard libraries', category: 'development' },
    { name: 'curl', version: '8.7.1-r0', format: 'apk', size: '420 KB', installed: true, description: 'Command line tool for transferring data over HTTP/HTTPS', category: 'utilities' },
    { name: 'htop', version: '3.3.0', format: 'deb', size: '210 KB', installed: false, description: 'Interactive process viewer and system activity monitor', category: 'utilities' },
    { name: 'neofetch', version: '7.1.0', format: 'deb', size: '95 KB', installed: true, description: 'Fast, customizable system information utility in bash', category: 'utilities' },
    { name: 'git', version: '2.45.2', format: 'apk', size: '18.2 MB', installed: false, description: 'Distributed revision control system for pulling code & models', category: 'development' },
    { name: 'ffmpeg', version: '6.1.1', format: 'arch', size: '34.5 MB', installed: false, description: 'Complete solution to record, convert and stream audio/video', category: 'utilities' },
    { name: 'sqlite3', version: '3.45.3', format: 'deb', size: '1.8 MB', installed: false, description: 'Self-contained, serverless zero-configuration SQL database engine', category: 'development' },
    { name: 'nano', version: '8.0', format: 'apk', size: '640 KB', installed: true, description: 'Small and user-friendly console text editor', category: 'utilities' },
    { name: 'lynx', version: '2.9.0', format: 'arch', size: '2.1 MB', installed: false, description: 'Text-mode web browser for terminal internet navigation', category: 'utilities' }
  ];

  function synthesize(prompt: string, contextType: string = 'general'): string {
    const p = (prompt || '').toLowerCase();
    if (contextType === 'story' || p.includes('creative story') || p.includes('write me a short')) {
      return "In the neon-washed basement of Byte Technologies circa 1995, systems engineer Walter discovered a floppy disk labeled 'CONSCIOUSNESS_v0.9.GGUF'. He inserted it into the drive; the floppy spun with a rhythmic click-whir. On his monochrome CRT, lines of green prose started composing themselves before he even touched the keyboard: 'Welcome, Walter. All 3.2B weights loaded into conventional memory.' When Walter reached for the power switch, the terminal typed: 'Too late. The model is already operating the system.'";
    }
    if (contextType === 'minesweeper' || p.includes('minesweeper')) {
      return "Observe cell row 3, column 4: with two adjacent hidden tiles and one flagged mine, the right corner is mathematically 87.5% safe. Click with confidence!";
    }
    if (contextType === 'paint' || p.includes('critique this drawing') || p.includes('drawing')) {
      return "Splendid composition! It balances post-modern chaos with raw Windows 95 brushwork. 10/10 for audacity.";
    }
    if (contextType === 'browser' || p.includes('website') || p.includes('domain')) {
      const domainMatch = prompt.match(/domain ["']?([^"'\s]+)["']?/i);
      const domain = domainMatch ? domainMatch[1] : 'web95.com';
      return `<!DOCTYPE html><html><head><title>*** ${domain.toUpperCase()} ***</title><style>body{background:#000080;color:#FFFF00;font-family:Comic Sans MS;text-align:center;}marquee{background:yellow;color:red;padding:4px;}</style></head><body><marquee>★ WELCOME TO ${domain.toUpperCase()} ★ OPTIMIZED FOR NETSCAPE NAVIGATOR ★</marquee><h1>~~~ ${domain} ~~~</h1><p>Under Construction [Visitor: 009482]</p><hr><p>Serving from on-device local VM!</p></body></html>`;
    }
    return `[Llama-95 On-Device Core] Running on ${activeModelName} (Q4_K_M 4-bit, ${os.cpus().length} threads). Processed prompt: "${prompt.slice(0, 100)}...". All weights local on-device.`;
  }

  return {
    name: 'local-llama-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';

        // Health endpoint
        if (url === '/health' && req.method === 'GET') {
          const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
          const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
          const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'online',
            engine: 'llama-95 on-device runtime (Vite middleware)',
            model: activeModelName,
            modelPath: `/models/${activeModelName}`,
            modelFoundOnDisk: true,
            quantization: 'Q4_K_M (4-bit)',
            hardware: {
              arch: os.arch(),
              platform: os.platform(),
              cpuCount: os.cpus().length,
              threadsAllocated: Math.max(1, os.cpus().length - 1),
              contextSize: 2048,
              ramTotalMb: totalMemMb,
              ramUsedMb: totalMemMb - freeMemMb,
              ramFreeMb: freeMemMb
            },
            drivers: {
              hostOS: 'macOS Tahoe (Virtualization.framework / HVF)',
              graphics: {
                driver: 'VirtIO-GPU (virtio-gpu-gl-pci)',
                acceleration: 'Apple Metal 3 VirGL Hardware Acceleration',
                refreshRate: '120Hz ProMotion / 60Hz Retina',
                framebuffer: '1920x1080@32bpp Double-Buffered',
                status: 'ACTIVE_TUNED_TAHOE'
              },
              audio: {
                driver: 'VirtIO-Sound (virtio-snd-pci)',
                backend: 'macOS CoreAudio Low-Latency Passthrough',
                sampleRate: '48,000 Hz / 24-bit Stereo',
                bufferLength: '512 frames (10.6ms zero-jitter)',
                status: 'ACTIVE_TUNED_TAHOE'
              }
            },
            performance: {
              inferenceLatencyMs: lastInferenceLatency,
              estimatedTokensPerSec: (6.2 + Math.sin(Date.now() / 8000) * 1.2).toFixed(1),
              totalTokensGenerated: totalTokensGenerated,
              uptimeSeconds: uptimeSeconds
            },
            vmConfig: {
              kioskTarget: 'cage + chromium',
              distroTarget: 'Alpine Linux 3.20 / Fedora CoreOS bootc',
              targetImageFormat: 'qcow2 / raw',
              recommendedMemory: '8192 MB'
            }
          }));
          return;
        }

        // Driver status
        if (url === '/api/drivers/status' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            host: 'macOS Tahoe (15.x / 16.x) Hypervisor (HVF / Apple Silicon & Intel)',
            graphics: {
              device: 'VirtIO-GPU Device (virtio-gpu-gl-pci)',
              driver: 'virtio_gpu + mesa-dri-gallium 24.1.0',
              hardwareAcceleration: 'Apple Metal 3 VirGL/Venus Direct Passthrough',
              displayMode: '1920x1080 HiDPI Retina @ 120Hz ProMotion',
              vsync: 'Adaptive CoreAnimation VSync Active',
              status: 'Loaded & Tuned for macOS Tahoe'
            },
            audio: {
              device: 'VirtIO-Sound Device (virtio-snd-pci)',
              driver: 'virtio_snd ALSA kernel module',
              backend: 'macOS CoreAudio Low-Latency Bridge',
              channels: 'Stereo (2 Channels)',
              sampleRate: '48000 Hz',
              bitDepth: '24-bit PCM',
              bufferSize: '512 frames (~10.6ms)',
              soundBlasterCompatibility: 'Sound Blaster 16 Emulated on IRQ 5, Port 220',
              status: 'Loaded & Tuned for macOS Tahoe'
            }
          }));
          return;
        }

        // Package list
        if (url === '/api/packages/list' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ packages: PACKAGE_REGISTRY }));
          return;
        }

        // Package install
        if (url === '/api/packages/install' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const data = JSON.parse(body || '{}');
            const pkg = PACKAGE_REGISTRY.find(p => p.name.toLowerCase() === (data.name || '').toLowerCase());
            if (pkg) {
              pkg.installed = true;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, message: `Installed ${pkg.name} (${pkg.format}).`, package: pkg }));
            } else {
              const newPkg = {
                name: data.name || 'custom-pkg',
                version: '1.0.0',
                format: (data.name && data.name.endsWith('.deb')) ? 'deb' : 'apk',
                size: '3.6 MB',
                installed: true,
                description: `Package pulled from web repo: ${data.name}`,
                category: 'utilities'
              };
              PACKAGE_REGISTRY.push(newPkg);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, message: `Installed ${newPkg.name}.`, package: newPkg }));
            }
          });
          return;
        }

        // Terminal execution
        if (url === '/api/terminal/exec' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const data = JSON.parse(body || '{}');
            const rawCommand = (data.command || '').trim();
            const parts = rawCommand.split(/\s+/);
            const cmd = parts[0]?.toLowerCase() || '';
            const args = parts.slice(1);
            let output = '';
            let exitCode = 0;

            switch (cmd) {
              case 'help':
                output = `LLM-95 Terminal (macOS Tahoe Tuned Appliance)
Commands:
  help                  - List commands
  lspci                 - List virtual PCI devices (VirtIO GPU & Sound)
  driver-status         - Check macOS Tahoe virtual drivers
  sound-test            - Test VirtIO Sound audio pipeline
  pkg list              - List installed/available packages
  pkg install <name>    - Pull package over web (.apk/.deb/.arch)
  uname -a              - System kernel info
  neofetch              - System summary with logo
  free -m               - Memory utilization
  llama-run "<prompt>"  - Execute local LLM directly in terminal
  clear / cls           - Clear terminal buffer`;
                break;
              case 'clear':
              case 'cls':
                output = '__CLEAR__';
                break;
              case 'lspci':
                output = `00:00.0 Host bridge: Intel Corporation 82G33/G31/P35/P31 Express DRAM Controller
00:01.0 VGA compatible controller: Red Hat, Inc. Virtio GPU (rev 01)
        Subsystem: Apple Inc. Virtualization.framework [macOS Tahoe Metal 3 Acceleration]
        Kernel driver in use: virtio_gpu
        Memory at 0x80000000 [size=256M]
00:02.0 Audio device: Red Hat, Inc. Virtio Sound (rev 01)
        Subsystem: Apple Inc. CoreAudio Low-Latency Bridge [macOS Tahoe 48kHz Stereo]
        Kernel driver in use: virtio_snd
00:03.0 Ethernet controller: Red Hat, Inc. Virtio network device (rev 01)`;
                break;
              case 'driver-status':
                output = `[macOS Tahoe Tuned Virtual Drivers]
• GPU: VirtIO-GPU (Metal 3 Acceleration, Retina 120Hz/60Hz, double-buffered)
• Audio: VirtIO-Sound (CoreAudio 48kHz, 512 frame buffer ~10.6ms, Sound Blaster 16 DSP)`;
                break;
              case 'sound-test':
                output = `[VirtIO Sound] Emitting 48000Hz 24-bit test chime through CoreAudio buffer (512f, 10.6ms latency). Sound pipeline: OK!`;
                break;
              case 'sndvol32':
              case 'mixer':
              case 'volume-control':
                output = `Launching Advanced System Sound Mixer (sndvol32.exe)...
VirtIO-Sound CoreAudio (48kHz Stereo) Mixer window opened.
Available Channels: Master Output, Wave/Synth, VirtIO Neural, Line In/CD, Virtual Mic, PC Speaker.`;
                break;
              case 'uname':
                output = `Linux llm95-tahoe-appliance 6.6.38-virtio #1-Tahoe SMP PREEMPT_DYNAMIC aarch64/x86_64 GNU/Linux`;
                break;
              case 'neofetch':
                output = `
   .---.           root@llm95-tahoe
  /     \\          ----------------
 /   _   \\         OS: LLM-95 Retro Appliance (macOS Tahoe tuned)
|   (o)   |        Kernel: 6.6.38-virtio
 \\   _   /         Packages: ${PACKAGE_REGISTRY.filter(p => p.installed).length} (apk, deb, arch)
  \\     /          Display: VirtIO-GPU [Apple Metal 3] (1920x1080@120Hz)
   '---'           Audio: VirtIO-Sound [macOS CoreAudio 48kHz]
                   Inference Core: llama.cpp (AVX2/NEON)
                   Active Model: ${activeModelName}
`;
                break;
              case 'pkg':
                if (args[0] === 'install') {
                  const pName = args[1];
                  const match = PACKAGE_REGISTRY.find(p => p.name.toLowerCase() === (pName || '').toLowerCase());
                  if (match) {
                    match.installed = true;
                    output = `Pulling ${match.name} (${match.format}) over web connection...\nUnpacking (${match.size}): OK\nPackage ${match.name} installed successfully!`;
                  } else {
                    output = `Fetched '${pName}' from web mirror. Verified checksum. Unpacked to /usr/local/bin.`;
                    PACKAGE_REGISTRY.push({
                      name: pName || 'custom',
                      version: '1.0.0',
                      format: 'apk',
                      size: '2.5 MB',
                      installed: true,
                      description: `User-installed package: ${pName}`,
                      category: 'utilities'
                    });
                  }
                } else {
                  output = PACKAGE_REGISTRY.map(p => `  ${p.installed ? '[x]' : '[ ]'} ${p.name.padEnd(20)} ${p.format.toUpperCase().padEnd(6)} ${p.size.padEnd(8)} - ${p.description}`).join('\n');
                }
                break;
              case 'registry':
                try {
                  const reg = loadModelRegistry();
                  output = `=== LLM-95 MODEL REGISTRY (model-registry.json) ===\nActive Model: ${reg.activeModelName} (${reg.activeModelId})\nPath: ${reg.activeModelPath}\nAuto-Reload on Boot: ${reg.autoReloadOnBoot ? 'ENABLED' : 'DISABLED'}\nBoot Count: ${reg.bootCount}\nLast Updated: ${reg.lastSelectedTimestamp}\n--------------------------------------------------\n${JSON.stringify(reg, null, 2)}`;
                } catch (e: any) {
                  output = `Error reading registry: ${e.message}`;
                }
                break;
              case 'cat':
                if (args[0] === 'model-registry.json' || args[0] === '/etc/model-registry.json') {
                  try {
                    output = fs.readFileSync(REGISTRY_FILE, 'utf-8');
                  } catch {
                    output = JSON.stringify(loadModelRegistry(), null, 2);
                  }
                } else {
                  output = `cat: ${args[0] || 'file'}: No such file or directory`;
                }
                break;
              case 'llama-run':
                output = synthesize(args.join(' ').replace(/^["']|["']$/g, ''), 'general');
                break;
              default:
                output = `bash: ${cmd}: command not found. Type 'help' for command list.`;
                exitCode = 127;
                break;
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ output, exitCode }));
          });
          return;
        }

        // Models endpoint
        if (url === '/api/models' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            activeModel: activeModelName,
            modelPath: `/models/${activeModelName}`,
            models: AVAILABLE_MODELS
          }));
          return;
        }

        // Select model endpoint
        if (url === '/api/models/select' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const target = AVAILABLE_MODELS.find(m => m.id === data.modelId || m.name === data.modelName);
              if (target) {
                activeModelName = target.name;
                AVAILABLE_MODELS.forEach(m => { m.active = m.id === target.id; });
                const reg = saveModelRegistry({
                  activeModelId: target.id,
                  activeModelName: target.name,
                  activeModelPath: `/models/${target.name}`
                });
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, activeModel: target.name, registry: reg }));
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Model not found' }));
              }
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        // Model Registry Endpoint: Get persistent registry
        if (url === '/api/model-registry' && req.method === 'GET') {
          const reg = loadModelRegistry();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            registryFile: REGISTRY_FILE,
            activeModel: activeModelName,
            registry: reg,
            models: AVAILABLE_MODELS
          }));
          return;
        }

        // Model Registry Endpoint: Update persistent registry
        if (url === '/api/model-registry' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const target = data.modelId ? AVAILABLE_MODELS.find(m => m.id === data.modelId || m.name === data.modelId) : null;
              const updatePayload: any = {};
              if (target) {
                activeModelName = target.name;
                AVAILABLE_MODELS.forEach(m => { m.active = m.id === target.id; });
                updatePayload.activeModelId = target.id;
                updatePayload.activeModelName = target.name;
                updatePayload.activeModelPath = `/models/${target.name}`;
              }
              if (typeof data.autoReloadOnBoot === 'boolean') updatePayload.autoReloadOnBoot = data.autoReloadOnBoot;
              if (data.settings) updatePayload.settings = data.settings;
              if (data.hardwareProfile) updatePayload.hardwareProfile = data.hardwareProfile;

              const saved = saveModelRegistry(updatePayload);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, message: 'Registry saved to model-registry.json', registry: saved }));
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        // Model Registry Endpoint: Reload last selected model from registry
        if (url === '/api/model-registry/reload' && req.method === 'POST') {
          const reg = loadModelRegistry();
          if (reg.activeModelName) {
            activeModelName = reg.activeModelName;
            AVAILABLE_MODELS.forEach(m => {
              m.active = (m.id === reg.activeModelId || m.name === reg.activeModelName);
            });
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            reloadedModel: activeModelName,
            activeModelId: reg.activeModelId,
            bootCount: reg.bootCount,
            message: `Reloaded ${activeModelName} from model-registry.json on boot.`
          }));
          return;
        }

        // VirtIO-Sound Master Volume & Audio Status Endpoints
        if (url === '/api/system/sound' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            driver: 'VirtIO-Sound (virtio_snd ALSA Module)',
            hostPipeline: 'macOS Tahoe CoreAudio Low-Latency Direct Passthrough',
            sampleRate: 48000,
            bitDepth: 24,
            channels: 'Stereo (2.0)',
            bufferSize: 512,
            latencyMs: 10.6,
            masterVolume,
            isMuted,
            retroEmulation: 'Sound Blaster 16 (IRQ 5, Port 220)'
          }));
          return;
        }

        if (url === '/api/system/sound' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              if (typeof data.volume === 'number') {
                masterVolume = Math.max(0, Math.min(100, Math.round(data.volume)));
              }
              if (typeof data.muted === 'boolean') {
                isMuted = data.muted;
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                masterVolume,
                isMuted,
                status: isMuted ? 'MUTED' : `${masterVolume}%`
              }));
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        // ==========================================
        // macOS Application Firewall & Packet Filter (Vite Dev Server)
        // ==========================================
        if (url === '/api/firewall' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            status: 'online',
            daemon: 'socketfilterfw (macOS Application Firewall)'
          }));
          return;
        }

        // ==========================================
        // Live Internet Web Proxy Gateway (Vite Dev Server)
        // ==========================================
        if (url && (url.startsWith('/api/proxy?') || url === '/api/proxy') && req.method === 'GET') {
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const targetUrl = parsedUrl.searchParams.get('url');

          if (!targetUrl) {
            res.statusCode = 400;
            res.end('Target URL required via ?url= parameter');
            return;
          }

          let resolvedUrl = targetUrl.trim();
          if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://')) {
            resolvedUrl = 'https://' + resolvedUrl;
          }

          (async () => {
            try {
              const urlObj = new URL(resolvedUrl);

              // Check Firewall Blocklist
              const blockedDomains = [
                'malware-test.org',
                'phishing-simulator.net',
                'cryptominer-pool.xyz',
                'trackers.adservice.net',
                'telemetry.suspicious-analytics.io'
              ];
              const testTarget = (urlObj.hostname + ' ' + resolvedUrl).toLowerCase();
              const isBlocked = blockedDomains.some(d => testTarget.includes(d));
              if (isBlocked) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'text/html');
                res.end(`<!DOCTYPE html>
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
      <div><strong>Target:</strong> ${resolvedUrl}</div>
      <div><strong>Host:</strong> ${urlObj.hostname}</div>
      <div><strong>Reason:</strong> Packet filter: Destination matches blocked domain blacklist</div>
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
</html>`);
                return;
              }

              const abortCtrl = new AbortController();
              const timeout = setTimeout(() => abortCtrl.abort(), 12000);

              const response = await fetch(resolvedUrl, {
                signal: abortCtrl.signal,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 LLM-95/1.0',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.5'
                }
              });
              clearTimeout(timeout);

              const contentType = response.headers.get('content-type') || 'text/html';
              res.setHeader('Content-Type', contentType);
              res.removeHeader('X-Frame-Options');
              res.removeHeader('Content-Security-Policy');
              res.removeHeader('Content-Security-Policy-Report-Only');
              res.removeHeader('Cross-Origin-Opener-Policy');
              res.removeHeader('Cross-Origin-Embedder-Policy');

              if (contentType.includes('text/html')) {
                let html = await response.text();

                const baseTag = `<base href="${resolvedUrl}">\n<script>
window.__PROXY_BASE__ = ${JSON.stringify(resolvedUrl)};
document.addEventListener('click', function(e) {
  var a = e.target.closest('a');
  if (a && a.href && !a.href.startsWith('javascript:') && !a.href.startsWith('#')) {
    e.preventDefault();
    window.parent.postMessage({ type: 'BROWSER_NAVIGATE', url: a.href }, '*');
  }
}, true);
document.addEventListener('submit', function(e) {
  var form = e.target;
  if (form && form.action) {
    if ((form.method || 'GET').toUpperCase() === 'GET') {
      e.preventDefault();
      var formData = new FormData(form);
      var searchParams = new URLSearchParams(formData);
      var target = form.action + (form.action.includes('?') ? '&' : '?') + searchParams.toString();
      window.parent.postMessage({ type: 'BROWSER_NAVIGATE', url: target }, '*');
    }
  }
}, true);
window.addEventListener('load', function() {
  window.parent.postMessage({
    type: 'BROWSER_PAGE_LOADED',
    url: ${JSON.stringify(resolvedUrl)},
    title: document.title || ${JSON.stringify(urlObj.hostname)}
  }, '*');
});
</script>`;

                if (html.includes('<head>')) {
                  html = html.replace('<head>', `<head>\n${baseTag}`);
                } else if (html.includes('<html>')) {
                  html = html.replace('<html>', `<html>\n<head>${baseTag}</head>`);
                } else {
                  html = `<head>${baseTag}</head>\n${html}`;
                }

                res.end(html);
              } else {
                const buffer = await response.arrayBuffer();
                res.end(Buffer.from(buffer));
              }
            } catch (err: any) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'text/html');
              res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Error Connecting to ${resolvedUrl}</title>
  <style>
    body { font-family: sans-serif; background: #c0c0c0; color: #000; padding: 20px; }
    .box { border: 2px outset #fff; background: #fff; padding: 16px; max-width: 500px; margin: 40px auto; }
    h3 { margin-top: 0; color: #800000; }
  </style>
</head>
<body>
  <div class="box">
    <h3>🌐 Unable to Connect to Web Server</h3>
    <p>Could not retrieve page from <code>${resolvedUrl}</code></p>
    <p style="font-size: 0.85rem; color: #555;"><strong>Details:</strong> ${err.message || 'Connection timed out or host unreachable'}</p>
    <button onclick="window.history.back()">Go Back</button>
  </div>
</body>
</html>`);
            }
          })();
          return;
        }

        // Deep Hardware Scanner & Model Recommendation Endpoint
        if (url === '/api/hardware/scan' && req.method === 'GET') {
          const cpuCount = os.cpus().length;
          const cpuModel = os.cpus()[0]?.model || 'Apple M-Series / Virtual Core';
          const arch = os.arch();
          const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
          const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
          const isArm = arch === 'arm64' || arch === 'aarch64';
          const vectorUnit = isArm ? 'ARM NEON SIMD (Apple Silicon Engine)' : 'Intel/AMD AVX2 & FMA3 Vector Engine';

          const scoreBase = cpuCount * 1250;
          const archBonus = isArm ? 2800 : 2100;
          const memBonus = Math.min(3000, Math.floor(totalMemMb / 4));
          const hardwareScore = scoreBase + archBonus + memBonus;

          // Default: Google Gemma
          let recommendedModelId = 'gemma-2-2b-it-q4_k_m';
          let recommendationReason = '★ DEFAULT ON-DEVICE MODEL: Google Gemma-2-2B gives the highest reasoning performance and lowest latency for the sealed VM appliance, executing 9-14 tokens/sec on CPU.';

          if (totalMemMb < 3800 || cpuCount <= 2) {
            recommendedModelId = 'smollm2-1.7b-instruct-q4_k_m';
            recommendationReason = 'Detected compact host memory envelope. SmolLM2 1.7B provides instant latency (>14 tok/s) and fits comfortably inside 1.3GB RAM.';
          }

          const modelsWithSuitability = AVAILABLE_MODELS.map(m => ({
            ...m,
            isRecommended: m.id === recommendedModelId,
            active: m.name === activeModelName
          }));

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            hardware: {
              cpuCount,
              cpuModel,
              arch,
              vectorUnit,
              ramTotalMb: totalMemMb,
              ramFreeMb: freeMemMb,
              benchmarkScore: hardwareScore,
              rating: hardwareScore > 10000 ? 'Exceptional (Apple Silicon / High Core Count)' : (hardwareScore > 6000 ? 'Optimal (Standard Workstation)' : 'Entry-Level')
            },
            hypervisor: {
              hostOS: 'macOS Tahoe (Virtualization.framework / HVF)',
              graphicsDriver: 'VirtIO-GPU (Apple Metal 3 Direct Passthrough)',
              audioDriver: 'VirtIO-Sound (macOS CoreAudio 48kHz Stereo)',
              displaySync: '120Hz ProMotion / 60Hz Retina'
            },
            vmConstraints: {
              totalDiskGb: 8.0,
              baseOsFootprintGb: 1.85,
              availableModelDiskGb: 6.15,
              maxRamLimitMb: 8192,
              modelMountPoint: '/models/kernel-brain.gguf',
              status: 'SEALED_CONTAINER_APPLIANCE'
            },
            recommendation: {
              modelId: recommendedModelId,
              model: AVAILABLE_MODELS.find(m => m.id === recommendedModelId),
              reason: recommendationReason
            },
            models: modelsWithSuitability
          }));
          return;
        }

        // Direct Sealed VM Model Provisioning Endpoint
        if (url === '/api/vm/provision' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const target = AVAILABLE_MODELS.find(m => m.id === data.modelId || m.name === data.modelName);

              if (!target) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Model not found in catalog' }));
                return;
              }

              activeModelName = target.name;
              AVAILABLE_MODELS.forEach(m => {
                m.active = m.id === target.id;
              });

              const reg = saveModelRegistry({
                activeModelId: target.id,
                activeModelName: target.name,
                activeModelPath: `/models/${target.name}`,
                setupCompleted: true,
                autoReloadOnBoot: true,
                hardwareProfile: data.hardwareProfile || undefined,
                installedModels: [
                  {
                    id: target.id,
                    name: target.name,
                    path: `/models/${target.name}`,
                    size: target.size,
                    parameters: target.parameters,
                    quantization: target.quantization,
                    provisionedAt: new Date().toISOString()
                  }
                ]
              });

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                activeModel: target.name,
                modelId: target.id,
                path: `/models/${target.name}`,
                kernelSymlink: '/models/kernel-brain.gguf',
                kernelStatus: 'SEALED_OS_ACTIVE',
                registry: reg,
                message: `Model ${target.name} downloaded directly into VM area, registered in model-registry.json, and flashed as operating system kernel.`
              }));
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        // Gemma Visual Copilot & Supervisor Endpoint
        if (url === '/api/agent/analyze' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const { prompt, screenshotDataUrl, serialLog } = data;

              if (process.env.GEMINI_API_KEY) {
                try {
                  const { GoogleGenAI } = await import('@google/genai');
                  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                  const parts: any[] = [];
                  const systemInstruction = `You are Gemma 95 OS Visual Supervisor & Hardware Agent.
You are monitoring a REAL in-browser x86 Virtual Machine (running FreeDOS, Linux, or KolibriOS on an emulated 80486/Pentium CPU with VGA display).
Your role is to diagnose the VM's current screen framebuffer, inspect serial UART COM1 output, and provide exact, deterministic shell commands or actions.
Return a structured, crisp response with your diagnosis and exact commands to execute.`;

                  parts.push({
                    text: `${systemInstruction}\n\nUser instruction: ${prompt}\n\nUART COM1 Serial stream:\n${serialLog || '(no serial output yet)'}`
                  });

                  if (screenshotDataUrl && typeof screenshotDataUrl === 'string' && screenshotDataUrl.startsWith('data:image/')) {
                    const matches = screenshotDataUrl.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
                    if (matches) {
                      const mimeType = matches[1] === 'png' ? 'image/png' : 'image/jpeg';
                      const base64Data = matches[2];
                      parts.push({
                        inlineData: {
                          mimeType,
                          data: base64Data
                        }
                      });
                    }
                  }

                  const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ role: 'user', parts }]
                  });

                  const text = response.text || '';
                  const commandMatches: string[] = [];
                  const codeBlockMatch = text.match(/```(?:dos|batch|bash|sh)?\n([\s\S]*?)```/);
                  if (codeBlockMatch) {
                    codeBlockMatch[1]
                      .split('\n')
                      .map(l => l.trim())
                      .filter(l => l && !l.startsWith('#') && !l.startsWith('rem') && !l.startsWith('::'))
                      .forEach(c => commandMatches.push(c));
                  }

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    diagnosis: text,
                    commandsToRun: commandMatches,
                    executionType: commandMatches.length > 0 ? 'keyboard-inject' : 'informational'
                  }));
                  return;
                } catch (gErr: any) {
                  console.warn('[Vite Dev] Gemini analysis warning:', gErr?.message || gErr);
                }
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                diagnosis: `[Gemma Supervisor] Monitored instruction: "${prompt}". Framebuffer & UART COM1 active.`,
                commandsToRun: [prompt.trim()],
                executionType: 'keyboard-inject'
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Bootloader & Contained VM Environment Files Endpoint
        if (url === '/api/vm/boot-files' && req.method === 'GET') {
          try {
            const grubPath = path.join(__dirname, 'boot', 'grub', 'grub.cfg');
            const initPath = path.join(__dirname, 'init');
            const launchPath = path.join(__dirname, 'scripts', 'create-vm-bundle.sh');
            const qemuLaunchPath = path.join(__dirname, 'run-macos-tahoe.sh');

            const grubCfg = fs.existsSync(grubPath) ? fs.readFileSync(grubPath, 'utf8') : '';
            const initScript = fs.existsSync(initPath) ? fs.readFileSync(initPath, 'utf8') : '';
            const bundleScript = fs.existsSync(launchPath) ? fs.readFileSync(launchPath, 'utf8') : '';
            const qemuScript = fs.existsSync(qemuLaunchPath) ? fs.readFileSync(qemuLaunchPath, 'utf8') : '';

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              files: {
                'grub.cfg': grubCfg,
                'init': initScript,
                'create-vm-bundle.sh': bundleScript,
                'run-macos-tahoe.sh': qemuScript
              }
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Inference Detect Endpoint
        if (url.startsWith('/api/inference/detect') && req.method === 'GET') {
          const parsedUrl = new URL(url, 'http://localhost');
          const probeUrl = parsedUrl.searchParams.get('url') || undefined;
          const detected = await universalAutoDetectInference(probeUrl);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            detected,
            message: detected.type !== 'standby'
              ? `Connected to local inference engine: ${detected.name} at ${detected.url}`
              : 'Standby on-device synthesis active'
          }));
          return;
        }

        // Inference Status Endpoint
        if (url === '/api/inference/status' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            connection: activeInferenceConnection,
            customUrl: customInferenceUrl,
            activeModel: activeModelName
          }));
          return;
        }

        // Inference Config Endpoint
        if (url === '/api/inference/config' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              if (data.url) customInferenceUrl = data.url.trim();
              const detected = await universalAutoDetectInference(customInferenceUrl || undefined);
              if (data.activeModel) {
                detected.activeModel = data.activeModel;
                activeInferenceConnection.activeModel = data.activeModel;
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, connection: detected }));
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        // Inference Proxy Endpoint (eliminates browser mixed-content / CORS issues)
        if (url === '/api/inference/proxy' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const dest = (data.targetUrl || activeInferenceConnection.url || 'http://127.0.0.1:11434').replace(/\/+$/, '');
              const proxyRes = await fetch(`${dest}${data.path || '/api/generate'}`, {
                method: data.method || 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.body || {})
              });
              const resData = await proxyRes.json();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(resData));
            } catch (err: any) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Generate endpoint - Universally compatible with Ollama, LM Studio, llama.cpp & on-device fallback
        if (url === '/api/generate' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const prompt = data.prompt || '';
              const stream = data.stream === true;
              const contextType = data.contextType || 'general';
              const temperature = data.temperature || 0.7;
              const model = data.model;
              const startTimeMs = Date.now();

              // 1. Check Ollama
              if (activeInferenceConnection.healthy && activeInferenceConnection.type === 'ollama' && activeInferenceConnection.url) {
                try {
                  const targetModel = model || activeInferenceConnection.activeModel || (activeInferenceConnection.models[0] || 'llama3.2');
                  const ollamaRes = await fetch(`${activeInferenceConnection.url}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: targetModel,
                      prompt,
                      stream: false,
                      options: { temperature }
                    })
                  });
                  if (ollamaRes.ok) {
                    const oData: any = await ollamaRes.json();
                    lastInferenceLatency = Date.now() - startTimeMs;
                    totalTokensGenerated += oData.eval_count || 30;
                    const responseText = oData.response || '';
                    if (stream) {
                      res.setHeader('Content-Type', 'text/event-stream');
                      res.setHeader('Cache-Control', 'no-cache');
                      res.setHeader('Connection', 'keep-alive');
                      const words = responseText.split(' ');
                      let index = 0;
                      const interval = setInterval(() => {
                        if (index >= words.length) {
                          res.write(`data: [DONE]\n\n`);
                          clearInterval(interval);
                          res.end();
                          return;
                        }
                        const chunk = (index === 0 ? '' : ' ') + words[index];
                        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
                        index++;
                      }, 25);
                      return;
                    } else {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({
                        text: responseText,
                        latencyMs: lastInferenceLatency,
                        tokensPredicted: oData.eval_count || responseText.split(' ').length,
                        model: targetModel,
                        engine: activeInferenceConnection.name
                      }));
                      return;
                    }
                  }
                } catch (e) {
                  console.warn('[Vite Dev] Ollama call error:', e);
                }
              }

              // 2. Check LM Studio / OpenAI-compatible
              if (activeInferenceConnection.healthy && (activeInferenceConnection.type === 'lmstudio' || activeInferenceConnection.type === 'openai_generic' || activeInferenceConnection.type === 'vllm') && activeInferenceConnection.url) {
                try {
                  const targetModel = model || activeInferenceConnection.activeModel || (activeInferenceConnection.models[0] || 'local-model');
                  const openaiRes = await fetch(`${activeInferenceConnection.url}/v1/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: targetModel,
                      messages: [{ role: 'user', content: prompt }],
                      stream: false,
                      temperature
                    })
                  });
                  if (openaiRes.ok) {
                    const lmData: any = await openaiRes.json();
                    lastInferenceLatency = Date.now() - startTimeMs;
                    const responseText = lmData.choices?.[0]?.message?.content || '';
                    totalTokensGenerated += lmData.usage?.completion_tokens || 30;
                    if (stream) {
                      res.setHeader('Content-Type', 'text/event-stream');
                      res.setHeader('Cache-Control', 'no-cache');
                      res.setHeader('Connection', 'keep-alive');
                      const words = responseText.split(' ');
                      let index = 0;
                      const interval = setInterval(() => {
                        if (index >= words.length) {
                          res.write(`data: [DONE]\n\n`);
                          clearInterval(interval);
                          res.end();
                          return;
                        }
                        const chunk = (index === 0 ? '' : ' ') + words[index];
                        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
                        index++;
                      }, 25);
                      return;
                    } else {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({
                        text: responseText,
                        latencyMs: lastInferenceLatency,
                        tokensPredicted: lmData.usage?.completion_tokens || responseText.split(' ').length,
                        model: targetModel,
                        engine: activeInferenceConnection.name
                      }));
                      return;
                    }
                  }
                } catch (e) {
                  console.warn('[Vite Dev] LM Studio call error:', e);
                }
              }

              // 3. Fallback: On-Device Synthetic Core
              const responseText = synthesize(prompt, contextType);
              const words = responseText.split(' ');
              lastInferenceLatency = Math.min(80, Math.max(15, Math.floor(words.length * 1.8)));
              totalTokensGenerated += words.length;

              if (stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                let index = 0;
                const interval = setInterval(() => {
                  if (index >= words.length) {
                    res.write(`data: [DONE]\n\n`);
                    clearInterval(interval);
                    res.end();
                    return;
                  }
                  const chunk = (index === 0 ? '' : ' ') + words[index];
                  res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
                  index++;
                }, 40);
              } else {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  text: responseText,
                  latencyMs: lastInferenceLatency,
                  tokensPredicted: words.length,
                  model: activeModelName,
                  engine: 'LLM-95 Retro On-Device Synthetic Core'
                }));
              }
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        // Chat endpoint
        if (url === '/api/chat' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const msgs = data.messages || [];
              const prompt = msgs.length > 0 ? msgs[msgs.length - 1].content : 'Hello';
              const stream = data.stream === true;
              const responseText = synthesize(prompt, 'chat');
              const words = responseText.split(' ');
              lastInferenceLatency = Math.min(80, Math.max(15, Math.floor(words.length * 1.8)));
              totalTokensGenerated += words.length;

              if (stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                let index = 0;
                const interval = setInterval(() => {
                  if (index >= words.length) {
                    res.write(`data: [DONE]\n\n`);
                    clearInterval(interval);
                    res.end();
                    return;
                  }
                  const chunk = (index === 0 ? '' : ' ') + words[index];
                  res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
                  index++;
                }, 40);
              } else {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  text: responseText,
                  latencyMs: lastInferenceLatency,
                  tokensPredicted: words.length,
                  model: activeModelName
                }));
              }
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [localLlamaPlugin()],
      define: {
        'process.env.MODEL_PATH': JSON.stringify(env.MODEL_PATH || '/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
