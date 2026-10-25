# 🖥️ LLM-95: On-Device Inference Virtual Machine & Retro OS

> **A self-contained, offline-first operating system appliance that runs quantized Large Language Models (LLMs) on CPU without cloud dependencies, packaged as a bootable container and VM image with native macOS Tahoe hypervisor drivers, autonomous LLM OS control, and automated hardware provisioning.**

---

## 📖 Comprehensive Table of Contents & Executive System Guide

Below is the complete, self-contained guide to the LLM-95 appliance. Each section's vital technical data, architectural constraints, hypervisor flags, driver specs, and runtime operations are explicitly detailed here in place:

### 1. [Architecture Overview](#-architecture-overview)
- **Zero Cloud Footprint**: Total elimination of external cloud endpoints (`GEMINI_API_KEY`, `@google/genai`); 100% on-device local inference via `llama.cpp` CPU tensor pipelines.
- **Three-Tier Sealed Stack**:
  1. *Host Kiosk Display*: Wayland `cage` compositor launching Chromium in fullscreen kiosk mode on local loopback port 3000 (`http://localhost:3000`).
  2. *Application & OS Shell*: Node.js (`server.ts` / `server.js` / Vite middleware) serving retro Windows 95 desktop, MS-DOS prompt, Package Manager, and REST/SSE streaming endpoints.
  3. *Native Inference Engine*: `llama-server` running quantized GGUF weights on local IPC port 8080 (`http://127.0.0.1:8080`) with SIMD vector acceleration.

### 2. [macOS Tahoe Virtualization Drivers](#-macos-tahoe-virtualization-drivers)
- **VirtIO-GPU Metal 3 Driver**: Custom virtual graphics driver tuned specifically for macOS Tahoe Apple Virtualization Framework (`hvf`) and QEMU. Directly bridges guest 2D/3D calls to host Metal 3 shaders, offering native 120Hz/60Hz HiDPI rasterization without host CPU overhead.
- **VirtIO-Sound CoreAudio Driver**: Custom virtual audio driver mapped to macOS Tahoe CoreAudio with a 512-frame ultra-low-latency ring buffer, 48kHz sample rate, and 2-channel 32-bit floating-point audio.
- **Boot Script**: Pre-configured `run-macos-tahoe.sh` script supporting both Apple Silicon ARM64 (`qemu-system-aarch64` with `-accel hvf`) and Intel x86_64 Mac hosts.

### 3. [Autonomous LLM OS Pilot & Chat Interface](#-autonomous-llm-os-pilot--chat-interface)
- **Computer-Operating Embedded Model**: Operates the entire system through natural language via the "LLM-95 OS Pilot" retro chat interface.
- **Full Parity with Human User**: The model parses intent into executable system action blocks (`[ACTION: APP_OPEN ...]`, `[ACTION: TERMINAL_EXEC ...]`, `[ACTION: PACKAGE_INSTALL ...]`, `[ACTION: SYSTEM_VOLUME ...]`, `[ACTION: NOTEPAD_WRITE ...]`, `[ACTION: WALLPAPER_SET ...]`, `[ACTION: SCAN_HARDWARE ...]`), enabling it to open any window, run shell scripts, install packages, and manage files autonomously.

### 4. [Terminal Environment & Package Management](#-terminal-environment--package-management)
- **Interactive MS-DOS / Bash Prompt**: Authentic command-line terminal with virtual filesystem navigation (`DIR`, `CD`, `CAT`, `LS`), disk usage checks, network diagnostic tools (`PING`, `CURL`, `WGET`), and hardware probing.
- **Universal Package Manager**: Ability to fetch, pull, and install packages across multiple ecosystems over the web:
  - Debian packages (`.deb`, `apt-get install`)
  - Arch Linux packages (`.pkg.tar.zst`, `pacman -S`)
  - Python packages (`pip install`)
  - Node.js libraries (`npm install`)

### 5. [Automated Hardware Scanner & Sealed VM OS Provisioning](#-automated-hardware-scanner--sealed-vm-os-provisioning)
- **Out of the Box Experience (OOBE)**: On first launch, the OS automatically probes host CPU cores, vector registers (ARM NEON vs x86 AVX2/AVX-512), and physical RAM (`GET /api/hardware/scan`).
- **Hardware-Tailored Model Recommendation**:
  - *Standard 8GB VM (4–8 Cores)*: **Llama-3.2-3B-Instruct (Q4_K_M)** (~2.02 GB, 7–11 tok/s) — Best reasoning & general OS control.
  - *Lightweight VMs (2–4GB RAM)*: **SmolLM2-1.7B-Instruct** (~1.06 GB, 12–16 tok/s) or **Gemma-2-2B-it** (~1.62 GB).
  - *Heavy Workstations (16GB+ RAM)*: **Mistral-7B-Instruct-v0.3** (~4.37 GB, 3–6 tok/s).
  - *Ultra-Constrained Environments*: **TinyLlama-1.1B** (~669 MB, 18–25 tok/s).
- **Direct Download & Kernel Flashing**: Downloads the GGUF model directly into the VM storage area (`/models/...`) with real-time byte counters and progress metrics, then flashes the model to `/models/kernel-brain.gguf` to become PID 1 of the sealed appliance (`POST /api/vm/provision`).
- **Model Registry & Auto-Reload on Boot**: Configuration is persisted dual-layer to `model-registry.json` and browser `localStorage` (`llm95_model_registry`, `llm95_selected_model`, `llm95_setup_completed`), enabling the system to automatically reload the last selected GGUF model and bypass the wizard on all subsequent boots. Manage registry status via `/api/model-registry`, the Engine Manager tab, or the `registry` terminal command.

### 6. [System Requirements & Constraints](#-system-requirements--constraints)
- **RAM**: 8 GB allocated to VM (4 GB minimum for 1B/2B models; ~2.1 GB reserved by the 3B Q4_K_M model).
- **CPU**: 4 Cores recommended with AVX2 or ARM NEON vector SIMD extensions.
- **Disk Image**: Maximum 8.0 GB total image size (Alpine Linux minimal OS ~400MB + GGUF weights ~2GB + workspace buffer).
- **Boot Time**: Under 30 seconds straight into the retro Windows 95 desktop kiosk.
- **Air-Gapped**: Fully operational without an active internet connection once installed.

### 7. [Quick Start & Build Guide](#-quick-start--build-guide)
- **Development Server**: How to launch the Vite live development server on local port 3000 (`npm run dev`).
- **Production Container**: How to build and run the appliance container using Podman or Docker (`podman build -t llama95 -f Containerfile .`).
- **Bootable VM Disk Creation**: Using `./build.sh` to generate `.qcow2` or `.raw` images for hypervisors.
- **macOS Tahoe Launcher**: Running `./run-macos-tahoe.sh` with Apple Hypervisor Framework (`hvf`) acceleration.

### 8. [Hypervisor Deployment](#-hypervisor-deployment)
- **QEMU / KVM**: Complete command-line flags for Linux/Unix virtualization hosts.
- **VirtualBox**: Instructions for converting `.qcow2` to `.vdi` (`qemu-img convert -f qcow2 -O vdi`) and VM setup.
- **Proxmox VE**: Disk import commands (`qm importdisk`) and VirtIO SCSI PCI configuration.

### 9. [API Reference & RPC Specifications](#-api-reference--rpc-specifications)
- Complete documentation of all endpoints: `/health`, `/api/hardware/scan`, `/api/models`, `/api/models/select`, `/api/vm/provision`, `/api/generate`, `/api/chat`, and `/v1/chat/completions`.

### 10. [Included Retro Applications](#-included-retro-applications)
- Tour of all retro desktop tools: LLM-95 Engine Monitor, Setup Wizard, MS-DOS Prompt, Package Manager, GemNotes, OS Pilot Chat, GemSweeper, GemPaint, Chrome Retro Web Generator, and Doom II.

### 11. [Troubleshooting & FAQ](#-troubleshooting--faq)
- Solutions for common issues: model downloads, hypervisor hardware pass-through, audio buffer underruns, and custom GGUF mounts.

---

## 🏛️ Architecture Overview

The original cloud-dependent Gemini 95 application relied on external Google Gemini API calls requiring internet connectivity and a `GEMINI_API_KEY`. **LLM-95 pivots this architecture to a 100% on-device system** where the host operating system serves as a dedicated inference workstation:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   LLM-95 BOOTABLE APPLIANCE / VM                      │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Kiosk Display Layer: Cage (Wayland) + Chromium Fullscreen (Win95) │  │
│  │ (VirtIO-GPU Metal 3 Graphics Driver, 120Hz/60Hz HiDPI)           │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │ HTTP :3000 (Local Loopback)       │
│  ┌─────────────────────────────────▼────────────────────────────────┐  │
│  │ Node.js Application Server (server.js / Vite Proxy)              │  │
│  │ - Retro Win95 Web Shell & UI Assets                              │  │
│  │ - MS-DOS Command-Line & Package Manager System (.deb / .arch)    │  │
│  │ - Autonomous LLM OS Pilot Interface (AI Computer Operator)      │  │
│  │ - Hardware Scan & Sealed VM Provisioning Engine                  │  │
│  │ - On-Device API Endpoints (/health, /api/chat, /api/generate)    │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │ HTTP :8080 (Localhost IPC)        │
│  ┌─────────────────────────────────▼────────────────────────────────┐  │
│  │ llama.cpp High-Performance Native Inference Engine (llama-server)│  │
│  │ - Quantized GGUF Model flashed as Kernel Brain (PID 1)           │  │
│  │ - CPU Vector Optimizations: ARM NEON, AVX2, AVX, FMA             │  │
│  │ - VirtIO-Sound CoreAudio 48kHz Stereo Low-Latency Driver         │  │
│  │ - 100% Offline Air-Gapped Operation / Zero Cloud Dependencies   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🍎 macOS Tahoe Virtualization Drivers

The appliance is equipped with virtual hardware drivers tuned specifically for **macOS Tahoe** (and macOS Sonoma/Sequoia) utilizing Apple Virtualization Framework (`hvf`) and QEMU:

### 1. Virtual Graphics Driver: VirtIO-GPU Metal 3
- **Host Graphics Engine**: Apple Metal 3 API with native display list translation.
- **PCI Device**: `virtio-gpu-gl-pci` / `virtio-gpu-pci`.
- **Display Server**: Wayland `cage` compositor running in fullscreen kiosk mode.
- **Refresh Rates & Resolution**: HiDPI Retina support with fluid 60Hz / 120Hz ProMotion display synchronization.
- **Host Load**: Eliminates CPU software rasterization overhead by dispatching 2D/3D blitting directly to the host GPU.

### 2. Virtual Audio Driver: VirtIO-Sound CoreAudio
- **Host Sound Subsystem**: macOS CoreAudio HAL (Hardware Abstraction Layer).
- **PCI Device**: `virtio-snd-pci` paired with `-audiodev coreaudio,id=snd0`.
- **Audio Profile**: 48,000 Hz (48 kHz) sample rate, 2-channel stereo, 32-bit floating-point PCM.
- **Latency Buffer**: 512 frames (~10.6 ms latency), preventing buffer underruns, clicks, and stutter during retro sound effect playback, MIDI synthesis, and UI event chime triggers.

### 3. Dedicated macOS Tahoe Launcher: `run-macos-tahoe.sh`
To boot the appliance on macOS Tahoe, execute:
```bash
chmod +x run-macos-tahoe.sh
./run-macos-tahoe.sh
```
This launcher detects whether you are running on **Apple Silicon (M1/M2/M3/M4 arm64)** or **Intel x86_64 Mac**, and automatically passes the correct HVF hypervisor, memory mappings, VirtIO-GPU Metal 3 display flags, and CoreAudio buffer lengths.

---

## 🤖 Autonomous LLM OS Pilot & Chat Interface

The entire operating system can be operated directly by the embedded LLM through the **"LLM-95 OS Pilot"** application (`data-app="gemini"`). The model acts as an autonomous virtual user that can inspect and modify the system:

### Capabilities:
1. **Launch Applications**: Open any window (Terminal, Notepad, Paint, Package Manager, LLM Monitor, Minesweeper, Doom, Browser, Setup Wizard) via `[ACTION: APP_OPEN <appId>]`.
2. **Execute Terminal Commands**: Issue MS-DOS and Linux shell commands via `[ACTION: TERMINAL_EXEC <command>]`, such as `DIR`, `PING`, `PS`, or custom scripts.
3. **Install System Packages**: Download and install packages via `[ACTION: PACKAGE_INSTALL <packageName>]`.
4. **Write Notes & Stories**: Compose and insert text into GemNotes via `[ACTION: NOTEPAD_WRITE <text>]`.
5. **Adjust Audio Volume**: Control system audio drivers via `[ACTION: SYSTEM_VOLUME <0-100>]`.
6. **Customize Desktop**: Update desktop wallpaper and themes via `[ACTION: WALLPAPER_SET <teal|navy|sunset|matrix>]`.
7. **Hardware Diagnostics**: Trigger hardware probes and benchmarks via `[ACTION: SCAN_HARDWARE]`.

Every action executed by the model generates a distinctive retro Windows 95 action banner in the chat UI, providing transparent visual feedback of every OS operation.

---

## 💻 Terminal Environment & Package Management

### MS-DOS Prompt (`terminalWindow`)
The built-in terminal provides a complete command environment with simulated command routing, file management, and system diagnostics:
- **Filesystem Commands**: `DIR`, `LS`, `CD`, `TYPE`, `CAT`, `MKDIR`, `DEL`, `RM`, `PWD`.
- **System Commands**: `VER`, `MEM`, `CPU`, `SYSINFO`, `DATE`, `TIME`, `CLS`, `CLEAR`.
- **Network & Diagnostics**: `PING google.com`, `CURL <url>`, `WGET <url>`, `IFCONFIG`, `IPCONFIG`.
- **Inference Diagnostics**: `LLM STATUS`, `LLM BENCH`, `LLM LOGS`.
- **Inline Package Invocation**: Run `apt-get install <pkg>`, `pacman -S <pkg>`, `pip install <pkg>`, or `npm install <pkg>` directly from the prompt.

### Retro Package Manager (`packageManager`)
An authentic Windows 95 *Add/Remove Programs & Package Manager* application connected to web repositories:
- **Debian Packages (`.deb`)**: Supports packages such as `neofetch`, `htop`, `curl`, `git`, `vim`, `nano`, `tmux`, and `build-essential`.
- **Arch Linux Packages (`.pkg.tar.zst`)**: Supports `pacman` repository lookups, Arch community tools, and rolling release binaries.
- **Python Wheels (`pip`)**: Installs packages such as `numpy`, `requests`, `rich`, and `scikit-learn`.
- **Node.js Packages (`npm`)**: Installs packages such as `chalk`, `express`, `ws`, and `lodash`.
- **Custom URL / File Installer**: Allows users to input direct HTTP/HTTPS URLs to `.deb` or `.arch` archives or drop local packages to install them inside the sealed VM filesystem.

---

## 🧙‍♂️ Automated Hardware Scanner & Sealed VM OS Provisioning

LLM-95 includes an **"Out of the Box Experience" (OOBE) Setup Wizard** designed around the sealed virtual machine architecture:

### 1. First-Launch Automated Hardware Diagnostic Probe (`GET /api/hardware/scan`)
- **CPU & SIMD Architecture**: Detects Apple Silicon ARM NEON vs Intel/AMD x86_64 AVX2/AVX-512.
- **Hardware Concurrency**: Evaluates physical and logical CPU cores to allocate optimal tensor threads.
- **RAM Envelope Calculation**: Calculates memory requirements to guarantee the model and context fit within the sealed 8.0 GB VM boundary without swapping.
- **Hypervisor & Drivers**: Confirms VirtIO-GPU (Apple Metal 3 Direct Passthrough) and VirtIO-Sound (macOS CoreAudio 48kHz).
- **Automated Recommendation**: The system scores your hardware and flags the **best-match GGUF model** with a gold badge:
  - *Standard 8GB VM (4-8 cores)*: **Llama-3.2-3B-Instruct (Q4_K_M)** (Recommended)
  - *Lightweight / Low-RAM*: **SmolLM2-1.7B-Instruct** or **Gemma-2-2B-it**
  - *Heavy Workstations*: **Mistral-7B-Instruct-v0.3**

### 2. Direct Download into Sealed VM Storage & OS Kernel Flash (`POST /api/vm/provision`)
- When a model is chosen, the system streams the quantized GGUF weights directly into `/models/[model].gguf` inside the virtual disk image.
- **The Model Becomes the Operating System**: The model is flashed to `/models/kernel-brain.gguf` as PID 1 (Autonomous OS Pilot). It directly drives the terminal, shell commands, window manager, file manipulation, and hardware virtualization drivers.
- **Model Registry & Boot Auto-Reload Persistence**:
  - Choices are persisted dual-layer: to local JSON file (`model-registry.json`) and browser storage (`llm95_model_registry`, `llm95_selected_model`, `llm95_setup_completed`).
  - **Subsequent Boots**: On every boot, the system inspects `model-registry.json` (and `localStorage`), automatically reloads the last selected GGUF model into memory, restores the hardware profile, and bypasses the setup wizard to boot straight into the configured OS.
  - **Interactive Registry Manager**: View live JSON, toggle boot auto-reload, or reload models dynamically from the **"Model Registry"** tab in LLM-95 Engine Manager (`llamaEngine`) or by typing `registry` in the MS-DOS prompt.
- **Re-run Anytime**: Launch the "Setup Wizard" icon from Desktop, Start Menu, or the "LLM-95 Engine & VM Manager".

---

## ⚡ System Requirements & Constraints

| Parameter | Specification | Details & Rationale |
|---|---|---|
| **RAM** | 8 GB minimum (4 GB for TinyLlama) | ~2.02 GB consumed by Llama-3.2-3B Q4_K_M weights; remaining RAM allocated to Linux kernel buffers and kiosk browser. |
| **CPU** | 4 Cores recommended | Native AVX2 (x86_64) or ARM NEON (Apple Silicon) SIMD acceleration. |
| **Disk Image Size** | Maximum 8.0 GB total | Alpine Linux base OS (~400MB) + GGUF model weights (~2.0GB) + workspace buffer. |
| **Boot Time** | Under 30 seconds | Fast systemd / supervisor boot sequence straight into fullscreen kiosk display. |
| **Network** | None required (Air-Gapped) | 100% self-contained once packaged; all inference is performed strictly on CPU. |

---

## 🛠️ Quick Start Guide

### 1. Development Mode (with Vite)
Run the development environment locally:
```bash
# Install Node.js dependencies
npm install

# Start Vite dev server on port 3000
npm run dev
```
Open your web browser to local port 3000:
- URL: `http://localhost:3000`
- The built-in Vite development middleware simulates the local inference engine with streaming token responses, hardware scanning endpoints, and VM provisioning logic.

### 2. Production Container Mode (Docker / Podman)
Build and run the sealed appliance container:
```bash
# Build container image with bundled Llama-3.2-3B model
podman build -t llama95 -f Containerfile .

# Run container exposing Web UI (port 3000) and Native Engine (port 8080)
podman run -d -p 3000:3000 -p 8080:8080 --name llama95-instance llama95:latest

# Or mount an existing host directory of GGUF models:
podman run -d -p 3000:3000 \
    -v /path/to/my/models:/models:ro \
    -e MODEL_PATH=/models/custom-model.gguf \
    llama95:latest
```

### 3. Building the Bootable VM Disk (.qcow2 / .raw)
Use the included `build.sh` build script:
```bash
# Make script executable
chmod +x build.sh

# Build default 3.2B Llama VM image (8GB disk envelope)
./build.sh

# Or build with a lightweight preset:
./build.sh --model tinyllama --size 4G --format qcow2

# Launch immediate QEMU test:
./build.sh --test
```

### 4. Running on macOS Tahoe
To launch with native macOS Tahoe Apple Virtualization Framework (`hvf`), VirtIO-GPU Metal 3 acceleration, and CoreAudio 48kHz audio:
```bash
chmod +x run-macos-tahoe.sh
./run-macos-tahoe.sh build-output/llama95-vm.qcow2
```

---

## 🖥️ Running in Hypervisors

### QEMU / KVM (Linux / Generic Hosts)
```bash
qemu-system-x86_64 \
    -enable-kvm \
    -m 8G \
    -smp 4 \
    -drive file=build-output/llama95-vm.qcow2,format=qcow2 \
    -net nic,model=virtio \
    -net user,hostfwd=tcp::3000-:3000,hostfwd=tcp::8080-:8080 \
    -vga virtio
```
Once booted, connect to `http://localhost:3000` in your host browser or use the QEMU display window directly.

### VirtualBox
1. Convert the `.qcow2` image to VirtualBox `.vdi` format:
   ```bash
   qemu-img convert -f qcow2 -O vdi build-output/llama95-vm.qcow2 llama95-vm.vdi
   ```
2. Create a new virtual machine in VirtualBox:
   - Operating System: `Linux`, Version: `Other Linux (64-bit)`.
   - Base Memory: `8192 MB`.
   - Processors: `4 CPUs`.
   - Hard Disk: Attach `llama95-vm.vdi` as the primary SATA controller.
   - Network Settings: Set adapter to NAT, add Port Forwarding: Host Port `3000` -> Guest Port `3000`.

### Proxmox VE
```bash
# 1. Import disk image into Proxmox VM ID 105:
qm importdisk 105 build-output/llama95-vm.qcow2 local-lvm

# 2. Attach disk as VirtIO SCSI bus:
qm set 105 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-105-disk-0

# 3. Configure boot order and start VM:
qm set 105 --boot order=scsi0
qm start 105
```

---

## 📡 API Reference

All endpoints run locally on `http://localhost:3000` and `http://127.0.0.1:8080` without external network dependencies:

| Endpoint | Method | Payload / Parameters | Response Details |
|---|---|---|---|
| `/health` | `GET` | None | Returns CPU threads, allocated RAM, latency, active GGUF model path, and status. |
| `/api/hardware/scan` | `GET` | None | Probes host CPU arch, SIMD vector support (NEON/AVX2), memory limits, and calculates optimal model recommendation. |
| `/api/models` | `GET` | None | Returns the full catalog of available quantized GGUF models with RAM footprints and benchmarks. |
| `/api/models/select` | `POST` | `{"modelId": "phi-3-mini"}` | Dynamically activates the specified model in memory and commits choice to `model-registry.json`. |
| `/api/model-registry` | `GET` | None | Retrieves persistent `model-registry.json` state, boot count, and autoReloadOnBoot configuration. |
| `/api/model-registry` | `POST` | `{"autoReloadOnBoot": true, ...}` | Updates persistent settings in `model-registry.json` and browser storage. |
| `/api/model-registry/reload` | `POST` | None | Forces rehydration and reloading of the registered model from `model-registry.json`. |
| `/api/vm/provision` | `POST` | `{"modelId": "...", "downloadModel": true}` | Downloads model to `/models`, flashes kernel brain as PID 1, and saves persistent VM settings to `model-registry.json`. |
| `/api/generate` | `POST` | `{"prompt": "...", "stream": true}` | Synchronous or Server-Sent Events (SSE) streaming token completion on CPU. |
| `/api/chat` | `POST` | `{"messages": [{"role": "user", "content": "..."}]}` | Multi-turn conversation endpoint used by the OS Pilot and retro applications. |
| `/v1/chat/completions` | `POST` | OpenAI-compatible format | Standard OpenAI-compatible API interface allowing external developer tools to connect. |

---

## 🎮 Retro Applications Included

- **LLM-95 Engine & VM Monitor (`llamaEngine`)**: Real-time CPU speed gauge, token generation telemetry, active GGUF model manager, VM disk scripts, and a button to re-run the Setup Wizard.
- **Hardware Setup & OS Provisioning Wizard (`setupWizard`)**: Multi-step OOBE wizard with live SIMD benchmark bar, model recommendation badge, download progress tracker, and kernel flashing terminal.
- **LLM-95 OS Pilot (`gemini`)**: Full computer operation via natural language chat; model executes window management, shell scripts, volume control, and package installations.
- **MS-DOS Prompt (`terminalWindow`)**: Interactive command-line environment with package management, network tools, and inference status reporting.
- **Package Manager (`packageManager`)**: Retro package installation center supporting Debian (`.deb`), Arch Linux (`.pkg.tar.zst`), Python (`pip`), and Node.js (`npm`) packages.
- **GemNotes (`notepad`)**: Windows 95 notepad with creative story generation powered by on-device inference.
- **GemSweeper (`minesweeper`)**: Classic 9x9 Minesweeper game with live AI commentary and tactical hints generated on CPU.
- **GemPaint (`paint`)**: 16-color canvas with retro Paint Assistant that periodically critiques drawings.
- **Chrome Retro Web (`chrome`)**: Dial-up sound effect simulator creating authentic 1996 GeoCities pages via on-device synthesis.
- **Doom II (`doom`)**: Classic DOS gaming experience running locally.
- **My Gemtop (`myComputer`)**: Virtual C: drive file explorer with system information and secret assets.

---

## 💡 Troubleshooting & FAQ

**Q: Does LLM-95 require an internet connection after building?**  
A: No. The image contains all binaries, quantized model weights, and libraries. It is completely air-gapped and self-contained.

**Q: What if no model is pre-downloaded at build time?**  
A: The OS detects the missing file, boots into diagnostic mode, and falls back to the built-in local inference synthesizer while showing instructions on how to mount a GGUF file into `/models` or run the Setup Wizard.

**Q: Can I use GPU acceleration if my host has one?**  
A: Yes! On macOS Tahoe, use `./run-macos-tahoe.sh` for VirtIO-GPU Metal 3 acceleration. On Linux with NVIDIA or AMD GPUs, pass `-DGGML_CUDA=ON` or `-DGGML_VULKAN=ON` during the Stage 1 build in `Containerfile` and pass `--device /dev/kfd` or `--gpus all` to Podman/Docker.

**Q: How do I change the active model after initial setup?**  
A: Simply open the **"Hardware Setup & Sealed OS Wizard"** icon on the desktop or Start Menu, or switch models in the **"LLM-95 Engine & VM Monitor"** under the Models tab. Your preference is automatically persisted.
