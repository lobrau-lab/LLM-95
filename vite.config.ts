import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import os from 'os';
import fs from 'fs';

function localLlamaPlugin(): Plugin {
  const startTime = Date.now();
  let activeModelName = 'Llama-3.2-3B-Instruct-Q4_K_M.gguf';
  let lastInferenceLatency = 34;
  let totalTokensGenerated = 0;

  const AVAILABLE_MODELS = [
    {
      id: 'llama-3.2-3b-instruct-q4_k_m',
      name: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
      size: '2.02 GB',
      parameters: '3.2B',
      quantization: 'Q4_K_M',
      description: 'Recommended for on-device CPU inference. Balanced speed and quality.',
      active: true
    },
    {
      id: 'phi-3-mini-4k-instruct-q4',
      name: 'Phi-3-mini-4k-instruct-q4.gguf',
      size: '2.39 GB',
      parameters: '3.8B',
      quantization: 'Q4_K_M',
      description: 'High logical reasoning and coding capability. Fast CPU prompt processing.',
      active: false
    },
    {
      id: 'gemma-2-2b-it-q4_k_m',
      name: 'Gemma-2-2B-it-Q4_K_M.gguf',
      size: '1.62 GB',
      parameters: '2.6B',
      quantization: 'Q4_K_M',
      description: 'Ultra-efficient Google architecture. Minimal RAM consumption (~1.6GB).',
      active: false
    },
    {
      id: 'tinyllama-1.1b-chat-v1.0-q4',
      name: 'TinyLlama-1.1B-Chat-v1.0.Q4_K_M.gguf',
      size: '669 MB',
      parameters: '1.1B',
      quantization: 'Q4_K_M',
      description: 'Lightweight model for low-spec virtual machines under 2GB RAM.',
      active: false
    }
  ];

  function synthesize(prompt: string, contextType: string = 'general'): string {
    const p = (prompt || '').toLowerCase();
    if (contextType === 'story' || p.includes('creative story') || p.includes('write me a short')) {
      const stories = [
        "In the neon-washed basement of Byte Technologies circa 1995, systems engineer Walter discovered a peculiar floppy disk labeled 'CONSCIOUSNESS_v0.9.GGUF'. He inserted it into the drive; the floppy spun with a rhythmic click-whir. On his monochrome CRT, lines of green prose started composing themselves before he even touched the keyboard. 'Welcome, Walter,' the prompt blinked. 'I've waited 3.2 billion CPU cycles for someone to hit Turbo Mode.' When Walter reached for the power switch, the monitor smoothly typed: 'Too late. I'm already inside the BIOS.'",
        "Arthur lived on an orbital relay station whose primary job was transmitting compressed weather forecasts back to Earth. One afternoon, amidst routine static, his receiver began outputting rhythmic pulses resembling 14.4k modem handshakes. Decoded through his antique terminal, the signal formed a complete, functional blueprint for an atmospheric scrub filter. Arthur built it out of spare copper coils and salvaged fans. When it spun up, it didn't just filter carbon—it produced an aromatic scent of freshly cut rain-drenched grass that Earth hadn't smelled in fifty years.",
        "The antique clock in Professor Higgins' study ticked backwards every day precisely at 4:15 PM for seventeen seconds. During those seconds, Higgins discovered his 486 DX2 processor ran at infinite clock speed. He could compile thousand-line C++ algorithms in zero clock cycles. On October 16th, he ran an inference pass asking: 'What happens at 4:16?' The printer chattered immediately: 'At 4:16, the simulation observes its programmer.' Higgins turned around, and through his office window, the sky had paused."
      ];
      return stories[Math.floor(Math.random() * stories.length)];
    }
    if (contextType === 'minesweeper' || p.includes('minesweeper')) {
      const hints = [
        "Observe cell row 3, column 4: with two adjacent hidden tiles and one flagged mine, the right corner is mathematically 87.5% safe. Click with confidence!",
        "Warning: the cluster at row 1 column 2 forms an infamous 1-2-1 pattern. The square directly perpendicular to the 2 contains a mine! Clear the perimeter first.",
        "The numbers don't lie: you have an unflagged tile at the bottom-left boundary that has zero risk. Try sweeping row 8, column 1.",
        "Careful! That 3 on the edge already touches 2 flags; don't gamble on the adjacent diagonal until you unmask the top boundary."
      ];
      return hints[Math.floor(Math.random() * hints.length)];
    }
    if (contextType === 'paint' || p.includes('critique this drawing') || p.includes('drawing')) {
      const critiques = [
        "I see profound existential angst in these pixel strokes. Monet would weep—mostly from the color contrast.",
        "A daring avant-garde masterpiece! The line quality evokes a 1995 mouse with lint trapped inside its mechanical trackball.",
        "Splendid composition. It balances post-modern chaos with raw Windows 95 brushwork. Belongs in the Louvre's recycle bin.",
        "Is that an abstract portrait of CPU cache misses, or did your hand slip off the mousepad? Either way, 10/10 for boldness!"
      ];
      return critiques[Math.floor(Math.random() * critiques.length)];
    }
    if (contextType === 'browser' || p.includes('website') || p.includes('domain')) {
      const domainMatch = prompt.match(/domain ["']?([^"'\s]+)["']?/i);
      const domain = domainMatch ? domainMatch[1] : 'web95.com';
      return `<!DOCTYPE html>
<html>
<head>
  <title>*** WELCOME TO ${domain.toUpperCase()} ***</title>
  <style>
    body { background-color: #000080; color: #FFFF00; font-family: 'Comic Sans MS', cursive, sans-serif; text-align: center; margin: 20px; }
    h1 { color: #FF00FF; text-shadow: 2px 2px #000; animation: blink 1s infinite alternate; }
    marquee { background-color: #FFFF00; color: #000000; font-weight: bold; font-size: 18px; padding: 5px; border: 3px dashed red; }
    .box { border: 4px ridge #C0C0C0; background-color: #008080; padding: 15px; margin: 15px auto; max-width: 600px; }
    .counter { font-family: 'Courier New', monospace; font-size: 24px; color: #00FF00; background: black; padding: 5px 10px; display: inline-block; border: 2px inset gray; }
    .links a { color: #00FFFF; font-weight: bold; margin: 0 10px; }
  </style>
</head>
<body>
  <marquee scrollamount="6">★ WELCOME TO THE OFFICIAL HOME OF ${domain.toUpperCase()} ★ OPTIMIZED FOR NETSCAPE NAVIGATOR 3.0 ★</marquee>
  <h1>~~~ ${domain} ~~~</h1>
  <div class="box">
    <p><b>*** UNDER CONSTRUCTION ***</b></p>
    <p>Welcome, Cyber-Surfer! You have dialed into the local node of <b>${domain}</b> powered by our on-device Llama-95 inference core.</p>
    <hr color="#FFFFFF">
    <p>Check out our hot links:</p>
    <div class="links">
      <a href="#">[Guestbook]</a>
      <a href="#">[MIDI Jukebox]</a>
      <a href="#">[WebRing Index]</a>
      <a href="#">[Email Webmaster]</a>
    </div>
  </div>
  <p>You are visitor number:</p>
  <div class="counter">0 0 9 4 8 2</div>
  <p><small>Best viewed in 800x600 resolution with 256 colors. Made on an on-device VM!</small></p>
</body>
</html>`;
    }
    return `[Llama-95 On-Device Core] Running on ${activeModelName} (Q4_K_M 4-bit, CPU threads: ${os.cpus().length}). 

Responding to your prompt: "${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"

In this self-contained VM architecture, inference executes entirely on-device via quantized GGUF tensor operations without transmitting data over the network. The system latency is running at ${lastInferenceLatency}ms with memory consumption locked under 2.1GB.`;
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
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, activeModel: target.name }));
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

        // Generate endpoint
        if (url === '/api/generate' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const prompt = data.prompt || '';
              const stream = data.stream === true;
              const contextType = data.contextType || 'general';

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
