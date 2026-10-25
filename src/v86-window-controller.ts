/**
 * x86 Virtual Machine & Hypervisor Window Controller
 * Coordinates the v86 Wasm execution core, VGA framebuffer, UART COM1 serial pipe,
 * Gemma visual supervisor, and Type-2 Hypervisor memory governance layer.
 */

import { V86VirtualMachine, V86HardwareStats } from './vm-core';
import { GemmaAgentBridge } from './agent-bridge';
import { HypervisorManager, PageBlockInfo, HypervisorStats } from './hypervisor-core';
import { resolveDiskSource } from './storage-resolver';

let vmInstance: V86VirtualMachine | null = null;
let agentInstance: GemmaAgentBridge | null = null;
let isInitialized: boolean = false;
let selectedBlockIndex: number = 0;

export function getV86Instance(): V86VirtualMachine | null {
  return vmInstance;
}

export function getGemmaAgent(): GemmaAgentBridge | null {
  return agentInstance;
}

export async function initV86Window(windowEl: HTMLElement, openHypervisor: boolean = false): Promise<void> {
  const screenContainer = document.getElementById('screen_container');
  const pointerLockHud = document.getElementById('pointer-lock-hud');

  if (!screenContainer) {
    console.error('[V86Window] screen_container DOM element not found');
    return;
  }

  // 1. Initialize VM and Agent once
  if (!vmInstance) {
    vmInstance = new V86VirtualMachine(screenContainer, pointerLockHud);
    agentInstance = new GemmaAgentBridge(vmInstance);
  }

  const hypervisor = vmInstance.getHypervisor();

  // 2. Setup UI event bindings once
  if (!isInitialized) {
    isInitialized = true;
    setupTabSwitching(windowEl);
    setupHardwareToolbar(vmInstance);
    setupMenus(vmInstance);
    setupSerialConsole(vmInstance);
    setupGemmaSupervisor(agentInstance, vmInstance);
    setupStorageSubsystem(vmInstance);
    setupHypervisorGovernance(hypervisor, vmInstance);

    // Initial boot into default FreeDOS on first launch
    setTimeout(() => {
      vmInstance?.boot('freedos').catch(err => {
        console.warn('[V86Window] Initial VM boot notice:', err);
      });
    }, 200);
  }

  // 3. Switch directly to Hypervisor tab if requested
  if (openHypervisor) {
    activateTab('tab-v86-hypervisor');
  }
}

function activateTab(tabId: string): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.v86-tab-btn');
  const panes = document.querySelectorAll<HTMLElement>('.v86-tab-content');

  tabs.forEach(t => t.classList.toggle('active', t.dataset.v86Tab === tabId));
  panes.forEach(p => {
    if (p.id === tabId) {
      p.style.display = 'flex';
      p.classList.add('active');
    } else {
      p.style.display = 'none';
      p.classList.remove('active');
    }
  });
}

function setupTabSwitching(windowEl: HTMLElement): void {
  const tabButtons = windowEl.querySelectorAll<HTMLButtonElement>('.v86-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.v86Tab;
      if (targetId) activateTab(targetId);
    });
  });
}

function setupHardwareToolbar(vm: V86VirtualMachine): void {
  const btnBoot = document.getElementById('btn-v86-boot');
  const btnPause = document.getElementById('btn-v86-pause');
  const btnReset = document.getElementById('btn-v86-reset');
  const btnPoweroff = document.getElementById('btn-v86-poweroff');
  const btnSaveSnap = document.getElementById('btn-v86-save-snap');
  const btnLoadSnap = document.getElementById('btn-v86-load-snap');
  const btnPointerLock = document.getElementById('btn-v86-pointer-lock');
  const btnFullscreen = document.getElementById('btn-v86-fullscreen');
  const presetSelect = document.getElementById('v86-preset-select') as HTMLSelectElement | null;

  btnBoot?.addEventListener('click', async () => {
    const preset = presetSelect?.value || 'freedos';
    btnBoot.textContent = '⌛ Booting...';
    try {
      await vm.boot(preset);
      btnBoot.textContent = '▶ Boot';
      activateTab('tab-v86-display');
    } catch (err) {
      btnBoot.textContent = '▶ Boot';
      console.error('[V86Toolbar] Boot error:', err);
    }
  });

  btnPause?.addEventListener('click', () => {
    if (btnPause.textContent?.includes('Pause')) {
      vm.pause();
      btnPause.textContent = '▶ Resume';
    } else {
      vm.resume();
      btnPause.textContent = '⏸ Pause';
    }
  });

  btnReset?.addEventListener('click', async () => {
    await vm.reset();
  });

  btnPoweroff?.addEventListener('click', async () => {
    await vm.powerOff();
  });

  btnSaveSnap?.addEventListener('click', async () => {
    btnSaveSnap.textContent = '💾 Saving...';
    const snap = await vm.saveState();
    if (snap) {
      (window as any).__v86_snapshot_buffer = snap;
      btnSaveSnap.textContent = '✓ Saved!';
      setTimeout(() => { btnSaveSnap.textContent = '💾 Save State'; }, 2000);
    } else {
      btnSaveSnap.textContent = '⚠️ Failed';
      setTimeout(() => { btnSaveSnap.textContent = '💾 Save State'; }, 2000);
    }
  });

  btnLoadSnap?.addEventListener('click', async () => {
    const snap = (window as any).__v86_snapshot_buffer as ArrayBuffer | undefined;
    if (snap) {
      btnLoadSnap.textContent = '📂 Restoring...';
      const ok = await vm.restoreState(snap);
      btnLoadSnap.textContent = ok ? '✓ Restored!' : '⚠️ Failed';
      setTimeout(() => { btnLoadSnap.textContent = '📂 Load State'; }, 2000);
    } else {
      alert('No in-memory snapshot found. Save state first.');
    }
  });

  btnPointerLock?.addEventListener('click', async () => {
    await vm.getInputManager()?.requestLock();
  });

  btnFullscreen?.addEventListener('click', () => {
    vm.screenGoFullscreen();
  });

  // LCD & LED stats listener
  vm.onStats((stats: V86HardwareStats) => {
    const ipsEl = document.getElementById('v86-metric-ips');
    const opsEl = document.getElementById('v86-metric-instructions');
    const modeEl = document.getElementById('v86-metric-mode');
    const osEl = document.getElementById('v86-metric-os');
    const ledPower = document.getElementById('led-vm-power');
    const statusText = document.getElementById('v86-status-text');

    if (ipsEl) ipsEl.textContent = `~${(stats.ips / 1000000).toFixed(1)} MIPS`;
    if (opsEl) opsEl.textContent = `${stats.instructionsTotal.toLocaleString()} ops`;
    if (modeEl) modeEl.textContent = stats.resolution;
    if (osEl) osEl.textContent = `${stats.bootPreset.toUpperCase()} (${stats.memoryMb}MB)`;

    if (ledPower) {
      ledPower.classList.toggle('active', stats.isRunning);
    }

    if (statusText) {
      statusText.textContent = `${stats.isRunning ? 'Running' : 'Halted'} • ${stats.memoryMb}MB Isolated RAM • ${stats.resolution} • ${stats.bootPreset.toUpperCase()}`;
    }
  });
}

function setupMenus(vm: V86VirtualMachine): void {
  // Toggle dropdowns
  const menuToggles = [
    { toggle: 'v86-menu-machine-toggle', menu: 'v86-dropdown-machine' },
    { toggle: 'v86-menu-disks-toggle', menu: 'v86-dropdown-disks' },
    { toggle: 'v86-menu-ram-toggle', menu: 'v86-dropdown-ram' },
    { toggle: 'v86-menu-view-toggle', menu: 'v86-dropdown-view' },
    { toggle: 'v86-menu-peripherals-toggle', menu: 'v86-dropdown-peripherals' },
    { toggle: 'v86-menu-help-toggle', menu: 'v86-dropdown-help' }
  ];

  const closeAll = () => {
    menuToggles.forEach(m => {
      const el = document.getElementById(m.menu);
      if (el) el.style.display = 'none';
    });
  };

  menuToggles.forEach(m => {
    const toggleEl = document.getElementById(m.toggle);
    const menuEl = document.getElementById(m.menu);
    toggleEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = menuEl?.style.display === 'block';
      closeAll();
      if (!isVisible && menuEl) menuEl.style.display = 'block';
    });
  });

  document.addEventListener('click', () => closeAll());

  // Memory sizing menu items
  const setRam = (size: number) => {
    closeAll();
    vm.getHypervisor().setRamSize(size);
    ['v86-ram-32', 'v86-ram-64', 'v86-ram-128'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const matches = id === `v86-ram-${size}`;
        el.classList.toggle('active-check', matches);
        el.textContent = (matches ? '✓ ' : '   ') + `${size} MB Isolated Wasm RAM`;
      }
    });
  };

  document.getElementById('v86-ram-32')?.addEventListener('click', () => setRam(32));
  document.getElementById('v86-ram-64')?.addEventListener('click', () => setRam(64));
  document.getElementById('v86-ram-128')?.addEventListener('click', () => setRam(128));

  // Disk boot items
  document.getElementById('v86-disk-freedos')?.addEventListener('click', () => {
    closeAll();
    vm.boot('freedos');
  });
  document.getElementById('v86-disk-kolibri')?.addEventListener('click', () => {
    closeAll();
    vm.boot('kolibri');
  });
  document.getElementById('v86-disk-linux')?.addEventListener('click', () => {
    closeAll();
    vm.boot('linux');
  });

  // Machine menu
  document.getElementById('v86-menu-boot')?.addEventListener('click', () => { closeAll(); vm.resume(); });
  document.getElementById('v86-menu-pause')?.addEventListener('click', () => { closeAll(); vm.pause(); });
  document.getElementById('v86-menu-reset')?.addEventListener('click', () => { closeAll(); vm.reset(); });
  document.getElementById('v86-menu-poweroff')?.addEventListener('click', () => { closeAll(); vm.powerOff(); });

  // View CRT toggle
  document.getElementById('v86-view-crt')?.addEventListener('click', () => {
    closeAll();
    const container = document.getElementById('screen_container');
    container?.classList.toggle('crt-mode');
  });
}

function setupSerialConsole(vm: V86VirtualMachine): void {
  const terminal = document.getElementById('v86-serial-terminal');
  const input = document.getElementById('v86-serial-input') as HTMLInputElement | null;
  const sendBtn = document.getElementById('btn-serial-send');
  const clearBtn = document.getElementById('btn-serial-clear');
  const copyBtn = document.getElementById('btn-serial-copy');

  vm.onSerialChar((char) => {
    if (terminal) {
      terminal.textContent += char;
      terminal.scrollTop = terminal.scrollHeight;
    }
  });

  const send = () => {
    if (!input) return;
    const val = input.value;
    if (val) {
      vm.sendSerial(val + '\r\n');
      input.value = '';
    }
  };

  sendBtn?.addEventListener('click', send);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  clearBtn?.addEventListener('click', () => {
    if (terminal) terminal.textContent = '';
    vm.clearSerialOutput();
  });

  copyBtn?.addEventListener('click', async () => {
    if (terminal) {
      await navigator.clipboard.writeText(terminal.textContent || '');
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy Output'; }, 1500);
    }
  });
}

function setupGemmaSupervisor(agent: GemmaAgentBridge, vm: V86VirtualMachine): void {
  const promptInput = document.getElementById('gemma-prompt-input') as HTMLInputElement | null;
  const submitBtn = document.getElementById('btn-gemma-submit') as HTMLButtonElement | null;
  const snapBtn = document.getElementById('btn-gemma-snap-now');
  const snapThumb = document.getElementById('gemma-snapshot-thumb') as HTMLImageElement | null;
  const snapPlaceholder = document.getElementById('gemma-snapshot-placeholder');
  const feed = document.getElementById('gemma-log-feed');
  const autoCheckbox = document.getElementById('gemma-auto-execute') as HTMLInputElement | null;

  if (autoCheckbox) {
    autoCheckbox.addEventListener('change', () => {
      agent.setAutoExecute(autoCheckbox.checked);
    });
  }

  snapBtn?.addEventListener('click', async () => {
    try {
      const dataUrl = await vm.captureScreen('image/jpeg', 0.85);
      if (snapThumb) {
        snapThumb.src = dataUrl;
        snapThumb.style.display = 'block';
      }
      if (snapPlaceholder) snapPlaceholder.style.display = 'none';
    } catch (e) {
      console.warn('[GemmaSupervisor] Capture snapshot error:', e);
    }
  });

  agent.onLog((entry) => {
    if (!feed) return;
    const div = document.createElement('div');
    div.className = `gemma-feed-entry ${entry.role}`;
    div.textContent = `${entry.role === 'user' ? '👤 User: ' : (entry.role === 'gemma' ? '🤖 Gemma: ' : '⚙️ ')}${entry.text}`;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
  });

  const runPrompt = async (promptText: string) => {
    if (!promptText.trim()) return;
    if (submitBtn) submitBtn.disabled = true;
    try {
      await agent.analyzeAndAssist(promptText);
    } catch (err: any) {
      console.error('[GemmaSupervisor] Supervise error:', err);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (promptInput) promptInput.value = '';
    }
  };

  submitBtn?.addEventListener('click', () => {
    if (promptInput) runPrompt(promptInput.value);
  });

  promptInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runPrompt(promptInput.value);
  });

  // Pills
  document.querySelectorAll<HTMLElement>('.gemma-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const prompt = pill.dataset.prompt;
      if (prompt) {
        if (promptInput) promptInput.value = prompt;
        runPrompt(prompt);
      }
    });
  });
}

function setupStorageSubsystem(vm: V86VirtualMachine): void {
  const dropZone = document.getElementById('v86-drop-zone');
  const filePicker = document.getElementById('v86-file-picker') as HTMLInputElement | null;
  const browseBtn = document.getElementById('btn-v86-browse-file');
  const quotaInfo = document.getElementById('v86-quota-info');

  if (quotaInfo && navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(est => {
      const usedMb = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
      const quotaMb = ((est.quota || 0) / (1024 * 1024)).toFixed(0);
      quotaInfo.textContent = `${usedMb} MB used / ${quotaMb} MB available`;
    }).catch(() => {});
  }

  browseBtn?.addEventListener('click', () => filePicker?.click());

  const handleFile = async (file: File) => {
    const isIso = file.name.endsWith('.iso');
    const options = isIso ? { cdromFile: file } : { fdaFile: file };
    try {
      await vm.boot('custom', options);
      activateTab('tab-v86-display');
    } catch (err) {
      alert(`Failed to mount ${file.name}: ${err}`);
    }
  };

  filePicker?.addEventListener('change', () => {
    if (filePicker.files && filePicker.files[0]) {
      handleFile(filePicker.files[0]);
    }
  });

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  document.querySelectorAll<HTMLButtonElement>('.mount-fda-btn, .mount-cd-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      if (preset) {
        vm.boot(preset);
        activateTab('tab-v86-display');
      }
    });
  });
}

function setupHypervisorGovernance(hypervisor: HypervisorManager, vm: V86VirtualMachine): void {
  const badgeState = document.getElementById('hyp-badge-state');
  const strictToggle = document.getElementById('hyp-toggle-strict-isolation') as HTMLInputElement | null;
  const autoScrubToggle = document.getElementById('hyp-toggle-auto-scrub') as HTMLInputElement | null;
  const valRam = document.getElementById('hyp-val-ram-size');
  const valCanary = document.getElementById('hyp-val-canary');
  const valFaults = document.getElementById('hyp-val-faults');
  const valScrubs = document.getElementById('hyp-val-scrubs');
  const matrixGrid = document.getElementById('hyp-ram-matrix-grid');
  const blockDetails = document.getElementById('hyp-block-details');
  const auditLogFeed = document.getElementById('hyp-audit-log-feed');
  const clearLogBtn = document.getElementById('btn-hyp-clear-log');

  const btnScrub = document.getElementById('btn-hyp-scrub-now');
  const btnAudit = document.getElementById('btn-hyp-audit-now');
  const btnQuarantine = document.getElementById('btn-hyp-quarantine-toggle');
  const btnExport = document.getElementById('btn-hyp-export-dump');

  // Build the 64 RAM blocks in DOM once
  if (matrixGrid && matrixGrid.children.length === 0) {
    for (let i = 0; i < 64; i++) {
      const blockEl = document.createElement('div');
      blockEl.className = 'ram-block domain-clean';
      blockEl.dataset.blockIndex = i.toString();

      blockEl.addEventListener('mouseenter', () => updateBlockInspector(i, hypervisor.getPageMap()));
      blockEl.addEventListener('click', () => {
        selectedBlockIndex = i;
        updateBlockInspector(i, hypervisor.getPageMap());
      });

      matrixGrid.appendChild(blockEl);
    }
  }

  function updateBlockInspector(index: number, pageMap: PageBlockInfo[]): void {
    const block = pageMap[index];
    if (!block || !blockDetails) return;

    blockDetails.innerHTML = `
      <span>Segment [${block.index}]: <strong>${block.startHex} - ${block.endHex}</strong> (${block.sizeKb.toFixed(0)} KB)</span>
      <span>Domain: <strong>${block.domain}</strong></span>
      <span>Permissions: <strong>${block.permissions}</strong></span>
      <span>Status: <strong style="color: ${block.status === 'guard' ? '#DD0000' : (block.status === 'dirty' ? '#DDAA00' : '#008800')}">${block.status.toUpperCase()}</strong></span>
      <span>Entropy: <strong>${block.entropy}</strong></span>
    `;
  }

  // Subscribe to real-time Hypervisor telemetry
  hypervisor.onUpdate((stats: HypervisorStats, pageMap: PageBlockInfo[]) => {
    // 1. Update Badge
    if (badgeState) {
      badgeState.textContent = stats.isQuarantined
        ? 'QUARANTINED (CPU HALTED)'
        : (stats.canaryIntegrity === 'INTACT' ? 'ENFORCED (RING 0/3)' : 'SECURITY ALERT');
      badgeState.className = `hypervisor-state-badge ${stats.isQuarantined ? 'quarantined' : (stats.canaryIntegrity === 'INTACT' ? 'enforced' : 'alert')}`;
    }

    // 2. Metrics
    if (valRam) valRam.textContent = `${stats.ramAllocatedMb}.0 MB (${stats.totalPageFrames.toLocaleString()} pages)`;
    if (valCanary) {
      valCanary.textContent = `ARMED (${stats.canaryIntegrity})`;
      valCanary.style.color = stats.canaryIntegrity === 'INTACT' ? '#008800' : '#DD0000';
    }
    if (valFaults) valFaults.textContent = `${stats.pageFaultsIntercepted} Overruns`;
    if (valScrubs) valScrubs.textContent = `${stats.scrubCyclesCompleted} Zero-Wipes`;

    // 3. Update Grid DOM blocks
    if (matrixGrid) {
      const domBlocks = matrixGrid.children;
      for (let i = 0; i < domBlocks.length && i < pageMap.length; i++) {
        const el = domBlocks[i] as HTMLElement;
        const b = pageMap[i];

        let domainClass = 'domain-clean';
        if (b.domain === 'HYPERVISOR_ENCLAVE') domainClass = 'domain-hypervisor';
        else if (b.domain === 'GUEST_KERNEL') domainClass = 'domain-kernel';
        else if (b.domain === 'CANARY_GUARD_LOW' || b.domain === 'CANARY_GUARD_HIGH') domainClass = 'domain-canary';
        else if (b.domain === 'VGA_VRAM') domainClass = 'domain-vram';
        else if (b.domain === 'DMA_AUDIO') domainClass = 'domain-dma';
        else if (b.domain === 'QUARANTINE_HOLD') domainClass = 'domain-quarantine';
        else if (b.status === 'dirty') domainClass = 'domain-dirty';

        el.className = `ram-block ${domainClass}`;
      }
    }

    // 4. Update Inspector
    updateBlockInspector(selectedBlockIndex, pageMap);

    // 5. Update Log Feed
    if (auditLogFeed) {
      const logs = hypervisor.getAuditLog();
      auditLogFeed.innerHTML = logs.map(l => `
        <div class="hypervisor-log-entry ${l.level}">
          [${l.timestamp}] [${l.level}] [${l.source}] ${l.message}
        </div>
      `).join('');
    }
  });

  // Action listeners
  strictToggle?.addEventListener('change', () => {
    hypervisor.setStrictIsolation(strictToggle.checked);
  });

  btnScrub?.addEventListener('click', async () => {
    if (btnScrub) btnScrub.textContent = '🧹 Scrubbing...';
    const res = await hypervisor.scrubAndZeroRam();
    if (btnScrub) {
      btnScrub.textContent = '✓ Purged!';
      setTimeout(() => { btnScrub.textContent = '🧹 Scrub & Zero RAM'; }, 1500);
    }
  });

  btnAudit?.addEventListener('click', () => {
    const res = hypervisor.auditMemoryIntegrity();
    alert(`Hypervisor Memory Audit:\n${res.details}`);
  });

  btnQuarantine?.addEventListener('click', () => {
    const stats = hypervisor.getStats();
    if (stats.isQuarantined) {
      hypervisor.releaseQuarantine();
      if (btnQuarantine) {
        btnQuarantine.textContent = '⚠️ Quarantine Guest';
        btnQuarantine.style.color = '#800080';
      }
    } else {
      hypervisor.quarantineGuest();
      if (btnQuarantine) {
        btnQuarantine.textContent = '🟢 Release Quarantine';
        btnQuarantine.style.color = '#006600';
      }
    }
  });

  btnExport?.addEventListener('click', () => {
    const report = hypervisor.exportMemoryReport();
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hypervisor-ram-audit-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  clearLogBtn?.addEventListener('click', () => {
    hypervisor.clearAuditLog();
    if (auditLogFeed) auditLogFeed.innerHTML = '';
  });
}
