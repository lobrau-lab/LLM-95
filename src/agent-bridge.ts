/**
 * Gemma Copilot & Autonomous Visual Supervisor Layer
 * Decouples LLM from binary opcodes: Gemma operates strictly as an external controller,
 * terminal supervisor, and visual diagnostician over the real x86 VM.
 */

import { V86VirtualMachine } from './vm-core';

export interface AgentAnalysisRequest {
  prompt: string;
  screenshotDataUrl?: string;
  serialLog?: string;
  hardwareStats?: any;
}

export interface AgentAnalysisResponse {
  diagnosis: string;
  suggestedAction?: string;
  commandsToRun?: string[];
  executionType: 'keyboard-inject' | 'serial-command' | 'hardware-action' | 'informational';
}

export class GemmaAgentBridge {
  private vm: V86VirtualMachine;
  private autoExecute: boolean = false;
  private isAnalyzing: boolean = false;
  private logListeners: Set<(entry: { role: 'user' | 'gemma' | 'system'; text: string; image?: string }) => void> = new Set();

  constructor(vm: V86VirtualMachine) {
    this.vm = vm;
    this.exposeHostRPC();
  }

  /**
   * Expose typed RPC interface on window.vm for host script and agent access
   */
  private exposeHostRPC(): void {
    if (typeof window === 'undefined') return;

    (window as any).vm = {
      injectKeyboard: async (text: string) => {
        await this.vm.injectKeyboard(text);
      },
      captureScreen: async () => {
        return await this.vm.captureScreen('image/jpeg', 0.85);
      },
      readSerial: () => {
        return this.vm.getSerialOutput();
      },
      sendSerial: (data: string) => {
        this.vm.sendSerial(data);
      },
      reset: () => {
        this.vm.reset();
      },
      powerOff: async () => {
        await this.vm.powerOff();
      },
      boot: async (preset: string) => {
        await this.vm.boot(preset);
      },
      saveState: async () => {
        return await this.vm.saveState();
      },
      loadState: async (buffer: ArrayBuffer) => {
        return await this.vm.restoreState(buffer);
      },
      scrubRam: async () => {
        return await this.vm.getHypervisor().scrubAndZeroRam();
      },
      auditRam: () => {
        return this.vm.getHypervisor().auditMemoryIntegrity();
      },
      getHypervisorStats: () => {
        return this.vm.getHypervisor().getStats();
      },
      setStrictIsolation: (enabled: boolean) => {
        this.vm.getHypervisor().setStrictIsolation(enabled);
      },
      quarantineGuest: () => {
        this.vm.getHypervisor().quarantineGuest();
      },
      releaseQuarantine: () => {
        this.vm.getHypervisor().releaseQuarantine();
      }
    };
  }

  public setAutoExecute(auto: boolean): void {
    this.autoExecute = auto;
  }

  public getAutoExecute(): boolean {
    return this.autoExecute;
  }

  public onLog(callback: (entry: { role: 'user' | 'gemma' | 'system'; text: string; image?: string }) => void): () => void {
    this.logListeners.add(callback);
    return () => this.logListeners.delete(callback);
  }

  private emitLog(entry: { role: 'user' | 'gemma' | 'system'; text: string; image?: string }): void {
    this.logListeners.forEach(fn => fn(entry));
  }

  /**
   * Dispatches user instruction to Gemma Copilot with multimodal canvas perception + serial logs
   */
  public async analyzeAndAssist(userPrompt: string): Promise<AgentAnalysisResponse> {
    if (this.isAnalyzing) {
      throw new Error('Analysis already in progress');
    }
    this.isAnalyzing = true;

    this.emitLog({ role: 'user', text: userPrompt });

    let screenshotDataUrl: string | undefined;
    try {
      screenshotDataUrl = await this.vm.captureScreen('image/jpeg', 0.8);
      this.emitLog({
        role: 'system',
        text: '📸 Framebuffer snapshot captured for multimodal visual inspection.',
        image: screenshotDataUrl
      });
    } catch (e) {
      console.warn('[AgentBridge] Screen capture failed; analyzing without image:', e);
    }

    const serialLog = this.vm.getSerialOutput().slice(-2000);

    const payload: AgentAnalysisRequest = {
      prompt: userPrompt,
      screenshotDataUrl,
      serialLog
    };

    let result: AgentAnalysisResponse;

    try {
      const res = await fetch('/api/agent/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      result = await res.json();
    } catch (apiErr) {
      console.warn('[AgentBridge] /api/agent/analyze fallback to deterministic agent heuristics:', apiErr);
      result = this.localAgentHeuristic(userPrompt, serialLog);
    } finally {
      this.isAnalyzing = false;
    }

    this.emitLog({ role: 'gemma', text: result.diagnosis });

    // Auto-execute if enabled or suggested
    if (this.autoExecute && result.commandsToRun && result.commandsToRun.length > 0) {
      for (const cmd of result.commandsToRun) {
        this.emitLog({ role: 'system', text: `⌨️ [Auto-Pilot Executing]: ${cmd}` });
        await this.vm.injectKeyboard(`${cmd}\r`, 35);
        await new Promise(r => setTimeout(r, 600));
      }
    }

    return result;
  }

  /**
   * Deterministic local fallback if external LLM API is unreachable or rate limited
   */
  private localAgentHeuristic(prompt: string, serialLog: string): AgentAnalysisResponse {
    const p = prompt.toLowerCase();

    if (p.includes('dir') || p.includes('list file') || p.includes('files in c')) {
      return {
        diagnosis: 'Inspecting C:\\ filesystem directory. Disagree with simulated text; injecting actual DOS command into x86 core.',
        suggestedAction: 'Type DIR on virtual keyboard',
        commandsToRun: ['dir'],
        executionType: 'keyboard-inject'
      };
    }

    if (p.includes('c hello') || p.includes('compile') || p.includes('c program')) {
      return {
        diagnosis: 'To compile or edit C code in FreeDOS, we can invoke the built-in EDIT utility or run available compilers.',
        suggestedAction: 'Create and edit HELLO.C in DOS editor',
        commandsToRun: ['edit hello.c'],
        executionType: 'keyboard-inject'
      };
    }

    if (p.includes('reboot') || p.includes('restart') || p.includes('reset')) {
      this.vm.reset();
      return {
        diagnosis: 'Triggered hardware reset vector (CPU reset & BIOS reboot).',
        executionType: 'hardware-action'
      };
    }

    if (p.includes('mem') || p.includes('memory')) {
      return {
        diagnosis: 'Querying DOS memory map (conventional, XMS, and EMS allocation).',
        suggestedAction: 'Execute MEM /C /P',
        commandsToRun: ['mem /c /p'],
        executionType: 'keyboard-inject'
      };
    }

    if (p.includes('type') || p.includes('run') || p.includes('exec')) {
      // Extract command after verb
      const match = prompt.match(/(?:type|run|exec(?:ute)?)\s+["']?([^"']+)["']?/i);
      const cmd = match ? match[1].trim() : prompt.trim();
      return {
        diagnosis: `Dispatching commanded keystrokes to guest OS: "${cmd}"`,
        suggestedAction: `Inject "${cmd}"`,
        commandsToRun: [cmd],
        executionType: 'keyboard-inject'
      };
    }

    return {
      diagnosis: `Gemma Supervisor active. Analyzing VM state (UART Output: ${serialLog.length} chars). Send instructions or click "Auto-Pilot" to command the running x86 CPU.`,
      commandsToRun: [],
      executionType: 'informational'
    };
  }

  public async executeCommand(cmd: string): Promise<void> {
    this.emitLog({ role: 'system', text: `⌨️ Injecting into x86 VM: ${cmd}` });
    await this.vm.injectKeyboard(`${cmd}\r`, 30);
  }

  public sendSerialCommand(cmd: string): void {
    this.emitLog({ role: 'system', text: `📡 Sent over COM1 Serial: ${cmd}` });
    this.vm.sendSerial(`${cmd}\r\n`);
  }
}
