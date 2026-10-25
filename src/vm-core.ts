/**
 * Virtualization Engine (Wasm Core & v86 Starter Wrapper)
 * Real x86 hardware virtualization running entirely in WebAssembly.
 * Eliminates simulated DOM mocks; steps real binary opcodes and manages VGA memory-mapped framebuffer.
 */

import { resolveDiskSource, DiskSourceResult } from './storage-resolver';
import { SoundBlasterAudioBridge } from './audio-bridge';
import { V86InputManager } from './input-manager';
import { HypervisorManager, HypervisorStats } from './hypervisor-core';

export interface V86BootOptions {
  memorySizeMb?: number;
  bootDrive?: 'fda' | 'hda' | 'cdrom';
  fdaUrl?: string;
  fdaFile?: File | Blob;
  hdaUrl?: string;
  hdaFile?: File | Blob;
  cdromUrl?: string;
  cdromFile?: File | Blob;
  autostart?: boolean;
}

export interface V86HardwareStats {
  instructionsTotal: number;
  ips: number;
  isRunning: boolean;
  resolution: string;
  memoryMb: number;
  bootPreset: string;
  hypervisorSecurityState?: 'ENFORCED' | 'ALERT' | 'QUARANTINED';
  canaryIntegrity?: 'INTACT' | 'BREACHED' | 'WARNING';
  pageFaultsTrapped?: number;
}

export type V86EventListener = (data: any) => void;

export class V86VirtualMachine {
  private v86: any = null;
  private screenContainer: HTMLElement;
  private audioBridge: SoundBlasterAudioBridge;
  private inputManager: V86InputManager | null = null;
  private hypervisor: HypervisorManager;
  private serialBuffer: string = '';
  private serialListeners: Set<(char: string) => void> = new Set();
  private statsListeners: Set<(stats: V86HardwareStats) => void> = new Set();

  private currentPreset: string = 'freedos';
  private memoryMb: number = 64;
  private isRunning: boolean = false;
  private statsInterval: number | null = null;
  private lastInstructionCount: number = 0;
  private lastStatsTime: number = 0;
  private currentIps: number = 0;
  private screenResolution: string = '640x400 (VGA)';

  constructor(screenContainer: HTMLElement, hudElement: HTMLElement | null = null) {
    this.screenContainer = screenContainer;
    this.audioBridge = new SoundBlasterAudioBridge();
    this.hypervisor = new HypervisorManager(this.memoryMb);
    this.inputManager = new V86InputManager(screenContainer, hudElement, {
      onLockChange: (isLocked) => {
        const lockLed = document.getElementById('led-pointer-lock');
        if (lockLed) lockLed.classList.toggle('active', isLocked);
      }
    });
  }

  /**
   * Boot the x86 Virtual Machine with selected operating system image
   */
  public async boot(preset: string = 'freedos', customOptions: V86BootOptions = {}): Promise<void> {
    this.currentPreset = preset;
    this.memoryMb = customOptions.memorySizeMb || 64;

    // Terminate existing emulator instance if active
    await this.destroy();

    // Ensure V86Starter is loaded from /v86/libv86.js
    await this.ensureV86Library();

    // Build v86 starter configuration
    const config: Record<string, any> = {
      wasm_path: '/v86/v86.wasm',
      memory_size: this.memoryMb * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      screen_container: this.screenContainer,
      bios: { url: '/v86/seabios.bin' },
      vga_bios: { url: '/v86/vgabios.bin' },
      autostart: customOptions.autostart !== false
    };

    // Resolve boot media based on preset or custom options
    if (preset === 'freedos') {
      config.fda = { url: '/images/freedos722.img', async: false };
    } else if (preset === 'kolibri') {
      config.fda = { url: '/images/kolibri.img', async: false };
    } else if (preset === 'linux') {
      const resolved = await resolveDiskSource('https://copy.sh/v86/images/linux4.iso');
      config.cdrom = resolved.url ? { url: resolved.url, size: resolved.size, async: resolved.async } : undefined;
    } else if (preset === 'custom') {
      if (customOptions.fdaFile || customOptions.fdaUrl) {
        const res = await resolveDiskSource(customOptions.fdaUrl || '', customOptions.fdaFile);
        config.fda = res.file ? { file: res.file } : { url: res.url, size: res.size, async: res.async };
      }
      if (customOptions.hdaFile || customOptions.hdaUrl) {
        const res = await resolveDiskSource(customOptions.hdaUrl || '', customOptions.hdaFile);
        config.hda = res.file ? { file: res.file } : { url: res.url, size: res.size, async: res.async };
      }
      if (customOptions.cdromFile || customOptions.cdromUrl) {
        const res = await resolveDiskSource(customOptions.cdromUrl || '', customOptions.cdromFile);
        config.cdrom = res.file ? { file: res.file } : { url: res.url, size: res.size, async: res.async };
      }
    }

    try {
      console.log(`[V86Core] Instantiating x86 Virtual Machine (Preset: ${preset}, RAM: ${this.memoryMb}MB)...`);
      const V86Constructor = (window as any).V86Starter;
      this.v86 = new V86Constructor(config);

      // Attach to Hypervisor Governance Core
      this.hypervisor.setRamSize(this.memoryMb);
      this.hypervisor.attachVm(this.v86);

      // Bind input manager
      this.inputManager?.bind(this.v86);

      // Bind Sound Blaster 16 audio bridge
      await this.audioBridge.initAudio(this.v86);

      // Listen for VGA screen resolution changes
      this.v86.add_listener('screen-set-size', (size: [number, number]) => {
        if (Array.isArray(size) && size.length >= 2) {
          this.screenResolution = `${size[0]}x${size[1]}`;
          console.log(`[V86Core] VGA Framebuffer mode changed to: ${this.screenResolution}`);
        }
      });

      // Listen for UART COM1 / Serial I/O
      this.v86.add_listener('serial0-output-char', (char: string) => {
        this.serialBuffer += char;
        // Keep serial buffer within 64KB
        if (this.serialBuffer.length > 65536) {
          this.serialBuffer = this.serialBuffer.slice(-32768);
        }
        this.serialListeners.forEach(listener => listener(char));

        // Pulse Serial LED on activity
        const serLed = document.getElementById('led-serial-io');
        if (serLed) {
          serLed.classList.add('active');
          setTimeout(() => serLed.classList.remove('active'), 80);
        }
      });

      this.isRunning = true;
      this.startHardwareStatsLoop();
      console.log('[V86Core] x86 VM successfully booted into Wasm execution core.');
    } catch (e) {
      console.error('[V86Core] Boot failure:', e);
      throw e;
    }
  }

  private async ensureV86Library(): Promise<void> {
    if (typeof (window as any).V86Starter !== 'undefined') return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/v86/libv86.js';
      script.onload = () => resolve();
      script.onerror = (e) => reject(new Error('Failed to load /v86/libv86.js emulator core: ' + e));
      document.head.appendChild(script);
    });
  }

  private startHardwareStatsLoop(): void {
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.lastStatsTime = performance.now();
    this.lastInstructionCount = 0;

    this.statsInterval = window.setInterval(() => {
      if (!this.v86) return;

      const now = performance.now();
      const elapsed = (now - this.lastStatsTime) / 1000;
      const total = typeof this.v86.get_instruction_counter === 'function'
        ? this.v86.get_instruction_counter()
        : 0;

      if (elapsed > 0) {
        this.currentIps = Math.max(0, Math.round((total - this.lastInstructionCount) / elapsed));
      }
      this.lastInstructionCount = total;
      this.lastStatsTime = now;

      const hypStats = this.hypervisor.getStats();

      const stats: V86HardwareStats = {
        instructionsTotal: total,
        ips: this.currentIps,
        isRunning: this.isRunning && typeof this.v86.is_running === 'function' ? this.v86.is_running() : this.isRunning,
        resolution: this.screenResolution,
        memoryMb: this.memoryMb,
        bootPreset: this.currentPreset,
        hypervisorSecurityState: hypStats.securityState,
        canaryIntegrity: hypStats.canaryIntegrity,
        pageFaultsTrapped: hypStats.pageFaultsIntercepted
      };

      this.statsListeners.forEach(fn => fn(stats));

      // Pulse CPU activity LED
      const cpuLed = document.getElementById('led-cpu-activity');
      if (cpuLed && this.currentIps > 0) {
        cpuLed.classList.toggle('active');
      }
    }, 500);
  }

  // --- Hardware Lifecycle Controls ---

  public pause(): void {
    if (this.v86 && typeof this.v86.stop === 'function') {
      this.v86.stop();
      this.isRunning = false;
    }
  }

  public resume(): void {
    if (this.v86 && typeof this.v86.run === 'function') {
      this.v86.run();
      this.isRunning = true;
      this.audioBridge.resume();
    }
  }

  public async reset(): Promise<void> {
    if (this.v86 && typeof this.v86.restart === 'function') {
      if (this.hypervisor.getStrictIsolation()) {
        await this.hypervisor.scrubAndZeroRam();
      }
      this.v86.restart();
      this.serialBuffer = '';
      console.log('[V86Core] Hardware Reset signal (Ctrl+Alt+Del) triggered. Isolated RAM scrubbed.');
    }
  }

  public async powerOff(): Promise<void> {
    this.pause();
    await this.hypervisor.scrubAndZeroRam();
    await this.destroy();
    this.isRunning = false;
    console.log('[V86Core] ACPI Power Off acknowledged. RAM sanitized.');
  }

  public async saveState(): Promise<ArrayBuffer | null> {
    if (!this.v86 || typeof this.v86.save_state !== 'function') return null;
    try {
      const state = await this.v86.save_state();
      console.log(`[V86Core] Snapshot saved (${(state.byteLength / (1024 * 1024)).toFixed(2)} MB).`);
      return state;
    } catch (e) {
      console.error('[V86Core] Save state snapshot failed:', e);
      return null;
    }
  }

  public async restoreState(stateBuffer: ArrayBuffer): Promise<boolean> {
    if (!this.v86 || typeof this.v86.restore_state !== 'function') return false;
    try {
      await this.v86.restore_state(stateBuffer);
      console.log('[V86Core] Snapshot restored successfully.');
      return true;
    } catch (e) {
      console.error('[V86Core] Restore state snapshot failed:', e);
      return false;
    }
  }

  public screenGoFullscreen(): void {
    if (this.v86 && typeof this.v86.screen_go_fullscreen === 'function') {
      this.v86.screen_go_fullscreen();
    } else if (this.screenContainer.requestFullscreen) {
      this.screenContainer.requestFullscreen();
    }
  }

  // --- Framebuffer Perception Hook ---

  /**
   * Captures the current VGA memory-mapped framebuffer canvas as image data URL
   */
  public async captureScreen(format: 'image/png' | 'image/jpeg' = 'image/jpeg', quality: number = 0.85): Promise<string> {
    const canvas = this.screenContainer.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error('VGA Framebuffer canvas element not found in screen container');
    }
    return canvas.toDataURL(format, quality);
  }

  // --- Serial (UART COM1) I/O ---

  public sendSerial(text: string): void {
    if (!this.v86) return;
    if (typeof this.v86.serial0_send === 'function') {
      this.v86.serial0_send(text);
    } else if (this.v86.bus) {
      for (let i = 0; i < text.length; i++) {
        this.v86.bus.send('serial0-input', text.charCodeAt(i));
      }
    }
  }

  public getSerialOutput(): string {
    return this.serialBuffer;
  }

  public clearSerialOutput(): void {
    this.serialBuffer = '';
  }

  public onSerialChar(callback: (char: string) => void): () => void {
    this.serialListeners.add(callback);
    return () => this.serialListeners.delete(callback);
  }

  public onStats(callback: (stats: V86HardwareStats) => void): () => void {
    this.statsListeners.add(callback);
    return () => this.statsListeners.delete(callback);
  }

  // --- Keyboard Injection Hook ---

  public async injectKeyboard(text: string, charDelayMs: number = 30): Promise<void> {
    if (this.inputManager) {
      await this.inputManager.injectText(text, charDelayMs);
    }
  }

  public async sendScanCode(code: number): Promise<void> {
    if (this.inputManager) {
      await this.inputManager.sendRawScanCode(code);
    }
  }

  public getInputManager(): V86InputManager | null {
    return this.inputManager;
  }

  public getAudioBridge(): SoundBlasterAudioBridge {
    return this.audioBridge;
  }

  public getHypervisor(): HypervisorManager {
    return this.hypervisor;
  }

  public async destroy(): Promise<void> {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.audioBridge.destroy();
    this.hypervisor.detachVm();
    if (this.v86) {
      try {
        if (typeof this.v86.destroy === 'function') {
          this.v86.destroy();
        } else if (typeof this.v86.stop === 'function') {
          this.v86.stop();
        }
      } catch {}
      this.v86 = null;
    }
    this.screenContainer.innerHTML = '';
  }
}
