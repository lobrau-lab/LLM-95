# 🖥️ LLM-95: On-Device Inference Virtual Machine & Retro OS

> **A self-contained, offline-first operating system appliance that runs quantized Large Language Models (LLMs) on CPU without cloud dependencies, packaged as a bootable container and VM image.**

---

## 📖 Table of Contents
- [Architecture Overview](#-architecture-overview)
- [System Requirements & Constraints](#-system-requirements--constraints)
- [Phase 1: Local Inference Runtime](#-phase-1-local-inference-runtime)
- [Phase 2: Bootable Container & VM Packaging](#-phase-2-bootable-container--vm-packaging)
- [Phase 3: Model Registry & Health Monitoring](#-phase-3-model-registry--health-monitoring)
- [Quick Start Guide](#-quick-start-guide)
  - [1. Development Mode](#1-development-mode-with-vite)
  - [2. Production Container Mode (Docker / Podman)](#2-production-container-mode-docker--podman)
  - [3. Building the Bootable VM (.qcow2 / .raw)](#3-building-the-bootable-vm-qcow2--raw)
- [Running in Hypervisors](#-running-in-hypervisors)
  - [QEMU / KVM](#qemu--kvm)
  - [VirtualBox](#virtualbox)
  - [Proxmox VE](#proxmox-ve)
- [API Reference](#-api-reference)
- [Retro Applications Included](#-retro-applications-included)
- [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🏛️ Architecture Overview

The original cloud-dependent Gemini 95 app relied on external API calls using `GEMINI_API_KEY`. **LLM-95 pivots this architecture to a 100% on-device system** where the host operating system serves as a dedicated inference workstation:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   LLM-95 BOOTABLE APPLIANCE / VM                      │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Kiosk Display Layer: Cage (Wayland) + Chromium Fullscreen (Win95) │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │ HTTP :3000                        │
│  ┌─────────────────────────────────▼────────────────────────────────┐  │
│  │ Node.js Application Server (server.js / Vite Proxy)              │  │
│  │ - Retro Win95 Web Shell & UI Assets                              │  │
│  │ - On-Device API Endpoints (/health, /api/chat, /api/generate)    │  │
│  │ - Model Registry & Latency Meter                                 │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │ HTTP :8080 (Localhost IPC)        │
│  ┌─────────────────────────────────▼────────────────────────────────┐  │
│  │ llama.cpp High-Performance Native Inference Engine (llama-server)│  │
│  │ - Quantized GGUF Model (e.g., Llama-3.2-3B-Instruct-Q4_K_M)      │  │
│  │ - CPU Vector Optimizations: AVX2, AVX, FMA, NEON                 │  │
│  │ - Zero Network Transmissions / 100% Air-Gapped Operation          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ System Requirements & Constraints

| Parameter | Specification | Note |
|---|---|---|
| **RAM** | 8 GB minimum (4 GB for TinyLlama) | ~2.1 GB consumed by 3B Q4_K_M model |
| **CPU** | 4 Cores recommended | AVX2 / ARM NEON supported |
| **Disk Image Size** | < 8.0 GB total | OS base (~400MB) + Model (~2.0GB) + Buffer |
| **Boot Time** | < 30 seconds | Fast systemd / supervisor boot directly into Kiosk |
| **Network** | None required | Fully air-gapped; all weights local |

---

## 🚀 Phase 1: Local Inference Runtime

1. **Replaced Cloud API**: All occurrences of `@google/genai` and `GEMINI_API_KEY` are eliminated.
2. **Quantized GGUF Models**: Powered by `llama.cpp` using CPU 4-bit quantization (`Q4_K_M`), yielding high accuracy at 4–8 tokens/second without a dedicated GPU.
3. **Environment Variable Configuration**:
   ```bash
   # Points to your local quantized GGUF weights
   MODEL_PATH=/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf
   THREADS=4
   PORT=3000
   CTX_SIZE=2048
   ```

---

## 📦 Phase 2: Bootable Container & VM Packaging

The project provides three levels of virtualization:

1. **`Containerfile` / `Dockerfile`**:
   - Stage 1 compiles `llama-server` from source with AVX/AVX2 support on Alpine Linux.
   - Stage 2 builds the retro frontend bundle (`npm run build`).
   - Stage 3 creates a minimal appliance layer with Node.js, `cage` (Wayland kiosk compositor), and `chromium-browser`.
2. **`systemd/` Service Units**:
   - `llama-server.service`: Boots inference engine on port 8080.
   - `gemini95-web.service`: Runs the web server on port 3000.
   - `gemini95-kiosk.service`: Boots directly into fullscreen kiosk mode.
3. **`build.sh`**:
   - Converts the container image into a `.qcow2` or `.raw` disk image compatible with QEMU, KVM, VirtualBox, or Proxmox.

---

## 🎛️ Phase 3: Model Registry & Health Monitoring

### Model Registry Presets:
| Model ID | File Name | Size | Context | Description |
|---|---|---|---|---|
| `llama-3.2-3b` | `Llama-3.2-3B-Instruct-Q4_K_M.gguf` | 2.02 GB | 4096 | **Default.** Balanced speed and reasoning. |
| `phi-3-mini` | `Phi-3-mini-4k-instruct-q4.gguf` | 2.39 GB | 4096 | Superior code & logic generation on CPU. |
| `gemma-2-2b` | `Gemma-2-2B-it-Q4_K_M.gguf` | 1.62 GB | 4096 | Minimal memory footprint (~1.6GB). |
| `tinyllama` | `TinyLlama-1.1B-Chat-v1.0.Q4_K_M.gguf` | 669 MB | 2048 | Runs smoothly even in 2GB RAM VMs. |

### Health Endpoint (`GET /health`):
```json
{
  "status": "online",
  "engine": "llama.cpp server (native)",
  "model": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  "modelPath": "/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  "quantization": "Q4_K_M (4-bit)",
  "hardware": {
    "arch": "x64",
    "threadsAllocated": 4,
    "contextSize": 2048,
    "ramTotalMb": 8192,
    "ramUsedMb": 2150
  },
  "performance": {
    "inferenceLatencyMs": 32,
    "estimatedTokensPerSec": "6.8"
  }
}
```

---

## 🧙‍♂️ Automated Hardware Scanner & Sealed VM OS Provisioning Wizard

LLM-95 includes an **"Out of the Box Experience" (OOBE) Setup Wizard** designed around the sealed virtual machine architecture:

### 1. First-Launch Automated Hardware Diagnostic Probe (`GET /api/hardware/scan`):
- **CPU & SIMD Architecture**: Detects Apple Silicon ARM NEON vs Intel/AMD x86_64 AVX2/AVX-512.
- **Hardware Concurrency**: Evaluates physical and logical CPU cores to allocate optimal tensor threads.
- **RAM Envelope Calculation**: Calculates memory requirements to guarantee the model and context fit within the sealed 8.0 GB VM boundary without swapping.
- **Hypervisor & Drivers**: Confirms VirtIO-GPU (Apple Metal 3 Direct Passthrough) and VirtIO-Sound (macOS CoreAudio 48kHz).
- **Automated Recommendation**: The system scores your hardware and flags the **best-match GGUF model** with a gold badge:
  - *Standard 8GB VM (4-8 cores)*: **Llama-3.2-3B-Instruct (Q4_K_M)** (Recommended)
  - *Lightweight / Low-RAM*: **SmolLM2-1.7B-Instruct** or **Gemma-2-2B-it**
  - *Heavy Workstations*: **Mistral-7B-Instruct-v0.3**

### 2. Direct Download into Sealed VM Storage & OS Kernel Flash (`POST /api/vm/provision`):
- When a model is chosen, the system streams the quantized GGUF weights directly into `/models/[model].gguf` inside the virtual disk image.
- **The Model Becomes the Operating System**: The model is flashed to `/models/kernel-brain.gguf` as PID 1 (Autonomous OS Pilot). It directly drives the terminal, shell commands, window manager, file manipulation, and hardware virtualization drivers.
- **Persistence**: Choices are saved to local state (`llm95_selected_model`, `llm95_setup_completed`, `llm95_hardware_profile`). Subsequent boots instantly restore your sealed OS configuration without re-prompting.
- **Re-run Anytime**: Launch the "Setup Wizard" icon from Desktop, Start Menu, or the "LLM-95 Engine & VM Manager".

## 🛠️ Quick Start Guide

### 1. Development Mode (with Vite)
```bash
# Install dependencies
npm install

# Start Vite dev server on port 3000
npm run dev
```
Open [http://localhost:3000](http://localhost:3000). The built-in Vite middleware simulates the local inference engine with token streaming and latency metrics.

### 2. Production Container Mode (Docker / Podman)
```bash
# Build the container image with the bundled model
podman build -t llama95 -f Containerfile .

# Run the container
podman run -d -p 3000:3000 -p 8080:8080 --name llama95-instance llama95:latest

# Or mount your own custom model directory:
podman run -d -p 3000:3000 \
    -v /path/to/my/models:/models:ro \
    -e MODEL_PATH=/models/custom-model.gguf \
    llama95:latest
```

### 3. Building the Bootable VM (.qcow2 / .raw)
Execute the provided build script:
```bash
# Make script executable
chmod +x build.sh

# Build default 3.2B VM image (~8GB disk footprint)
./build.sh

# Or build with a lightweight preset:
./build.sh --model tinyllama --size 4G --format qcow2

# Test immediately in QEMU:
./build.sh --test
```

---

## 🖥️ Running in Hypervisors

### QEMU / KVM
```bash
qemu-system-x86_64 \
    -enable-kvm \
    -m 8G \
    -smp 4 \
    -drive file=build-output/llama95-vm.qcow2,format=qcow2 \
    -net nic,model=virtio \
    -net user,hostfwd=tcp::3000-:3000 \
    -vga virtio
```
Access the web shell at `http://localhost:3000` or interact directly inside the QEMU window.

### VirtualBox
1. Convert `.qcow2` to `.vdi`:
   ```bash
   qemu-img convert -f qcow2 -O vdi build-output/llama95-vm.qcow2 llama95-vm.vdi
   ```
2. Create a new VM:
   - Type: `Linux`, Version: `Other Linux (64-bit)`
   - Memory: `8192 MB`
   - Processors: `4 CPUs`
   - Attach `llama95-vm.vdi` as primary SATA drive.
   - Enable Port Forwarding: Host `3000` -> Guest `3000`.

### Proxmox VE
```bash
# Import disk directly into Proxmox VM ID 105:
qm importdisk 105 build-output/llama95-vm.qcow2 local-lvm
qm set 105 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-105-disk-0
qm set 105 --boot order=scsi0
qm start 105
```

---

## 📡 API Reference

| Endpoint | Method | Payload | Description |
|---|---|---|---|
| `/health` | `GET` | None | Returns CPU threads, RAM, latency, model status |
| `/api/models` | `GET` | None | Returns list of available GGUF models |
| `/api/models/select` | `POST` | `{"modelId": "phi-3-mini"}` | Switches active model |
| `/api/generate` | `POST` | `{"prompt": "...", "stream": true}` | Streaming or synchronous text completion |
| `/api/chat` | `POST` | `{"messages": [{"role": "user", "content": "..."}]}` | Multi-turn chat completion |
| `/v1/chat/completions` | `POST` | OpenAI-compatible JSON | Drop-in OpenAI API replacement |

---

## 🎮 Retro Applications Included

- **Local LLM & VM Monitor (`llamaEngine`)**: Real-time CPU speed gauge, token generation telemetry, active GGUF model manager, and one-click VM image scripts.
- **GemNotes (Notepad)**: Automated creative story generator using on-device inference.
- **Llama 95 AI Chat**: Multi-turn retro chat with CPU token streaming.
- **GemSweeper (Minesweeper)**: Intelligent game solver and witty hint generator analyzing the 9x9 grid.
- **GemPaint & Assistant**: Live drawing critiques and art appraisal using on-device prompt synthesis.
- **Chrome Retro Web Generator**: Dial-up sound effect simulator creating authentic 1996 GeoCities pages.
- **Doom II**: Integrated classic DOS gaming experience.

---

## 💡 Troubleshooting & FAQ

**Q: Does this need an internet connection after building?**  
A: No! The image contains all weights, binaries, and libraries. It is completely air-gapped and self-contained.

**Q: What if no model was downloaded at build time?**  
A: The OS detects the missing file, boots into diagnostic mode, and falls back to the built-in local inference synthesizer while showing instructions on how to mount a GGUF file into `/models`.

**Q: Can I use GPU acceleration?**  
A: Yes! If running on a GPU-enabled host, pass `-DGGML_CUDA=ON` or `-DGGML_VULKAN=ON` during the Stage 1 build in `Containerfile` and pass `--device /dev/kfd` or `--gpus all` to Podman/Docker.
