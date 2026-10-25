/**
 * LLM-95 macOS Application Firewall Window Controller
 * Orchestrates the Security & Privacy - Application Firewall UI:
 * Master status toggle, stealth mode, incoming connection blocking,
 * per-application rules table, domain blocklist, and live packet stream.
 */

import { firewall, FirewallEngine, PacketLogEntry, FirewallAppRule } from './firewall-core';

export class FirewallWindowController {
  private static instance: FirewallWindowController;
  private windowEl: HTMLElement | null = null;
  private isStreamPaused = false;
  private isLocked = false;
  private unsubscribeFirewall: (() => void) | null = null;
  private liveSimulationTimer: number | null = null;

  private constructor() {
    // Singleton
  }

  public static getInstance(): FirewallWindowController {
    if (!FirewallWindowController.instance) {
      FirewallWindowController.instance = new FirewallWindowController();
    }
    return FirewallWindowController.instance;
  }

  public init(windowElement: HTMLElement): void {
    this.windowEl = windowElement;
    this.setupTabs();
    this.setupMasterControls();
    this.setupAppRulesTable();
    this.setupDomainBlocklist();
    this.setupPacketMonitor();
    this.setupLockControl();
    this.renderAll();

    // Subscribe to firewall core events
    if (this.unsubscribeFirewall) this.unsubscribeFirewall();
    this.unsubscribeFirewall = firewall.subscribe((event, data) => {
      if (event === 'packet' && !this.isStreamPaused) {
        this.prependPacketLogRow(data as PacketLogEntry);
        this.updateStatsCounters();
      } else if (event === 'configChange') {
        this.renderAll();
      } else if (event === 'stats') {
        this.updateStatsCounters();
      } else if (event === 'logsCleared') {
        const tbody = this.windowEl?.querySelector('#firewall-packet-tbody') as HTMLElement | null;
        if (tbody) tbody.innerHTML = '';
      }
    });

    // Start background traffic simulation (creates realistic network heartbeats)
    this.startBackgroundTrafficSimulation();
  }

  private setupTabs(): void {
    if (!this.windowEl) return;
    const tabButtons = this.windowEl.querySelectorAll('.firewall-tab') as NodeListOf<HTMLButtonElement>;
    const tabPanes = this.windowEl.querySelectorAll('.firewall-pane') as NodeListOf<HTMLElement>;

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.tab;
        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetPane = this.windowEl?.querySelector(`#${targetId}`);
        if (targetPane) targetPane.classList.add('active');
      });
    });
  }

  private setupMasterControls(): void {
    if (!this.windowEl) return;

    const toggleBtn = this.windowEl.querySelector('#btn-firewall-master-toggle') as HTMLButtonElement | null;
    const blockAllChk = this.windowEl.querySelector('#chk-firewall-block-all') as HTMLInputElement | null;
    const stealthChk = this.windowEl.querySelector('#chk-firewall-stealth') as HTMLInputElement | null;
    const signedChk = this.windowEl.querySelector('#chk-firewall-signed') as HTMLInputElement | null;

    toggleBtn?.addEventListener('click', () => {
      if (this.isLocked) {
        this.promptUnlock();
        return;
      }
      const current = firewall.getConfig().enabled;
      firewall.setEnabled(!current);
      this.syncServerToggle('enabled', !current);
      this.renderMasterStatus();
    });

    blockAllChk?.addEventListener('change', () => {
      if (this.isLocked) {
        blockAllChk.checked = !blockAllChk.checked;
        this.promptUnlock();
        return;
      }
      firewall.setBlockAllIncoming(blockAllChk.checked);
      this.syncServerToggle('blockAllIncoming', blockAllChk.checked);
    });

    stealthChk?.addEventListener('change', () => {
      if (this.isLocked) {
        stealthChk.checked = !stealthChk.checked;
        this.promptUnlock();
        return;
      }
      firewall.setStealthMode(stealthChk.checked);
      this.syncServerToggle('stealthMode', stealthChk.checked);
    });

    signedChk?.addEventListener('change', () => {
      const cfg = firewall.getConfig();
      cfg.allowSignedSoftware = signedChk.checked;
      firewall.saveConfig();
    });
  }

  private setupLockControl(): void {
    if (!this.windowEl) return;
    const lockBtn = this.windowEl.querySelector('#firewall-lock-btn') as HTMLButtonElement | null;
    const lockIcon = this.windowEl.querySelector('#firewall-lock-icon') as HTMLElement | null;
    const lockText = this.windowEl.querySelector('#firewall-lock-text') as HTMLElement | null;

    lockBtn?.addEventListener('click', () => {
      this.isLocked = !this.isLocked;
      firewall.setLock(this.isLocked);
      if (lockIcon) lockIcon.textContent = this.isLocked ? '🔒' : '🔓';
      if (lockText) {
        lockText.textContent = this.isLocked
          ? 'Click the lock to make changes.'
          : 'Click the lock to prevent further changes.';
      }
    });
  }

  private promptUnlock(): void {
    const lockText = this.windowEl?.querySelector('#firewall-lock-text') as HTMLElement | null;
    if (lockText) {
      lockText.style.color = '#c0392b';
      lockText.textContent = '🔒 Settings are locked! Click the lock at bottom left to unlock.';
      setTimeout(() => {
        lockText.style.color = '';
        lockText.textContent = this.isLocked
          ? 'Click the lock to make changes.'
          : 'Click the lock to prevent further changes.';
      }, 3000);
    }
  }

  private setupAppRulesTable(): void {
    if (!this.windowEl) return;
    const addAppBtn = this.windowEl.querySelector('#btn-firewall-add-app') as HTMLButtonElement | null;
    const addAppModal = this.windowEl.querySelector('#firewall-add-app-modal') as HTMLElement | null;
    const modalSaveBtn = this.windowEl.querySelector('#btn-firewall-modal-save') as HTMLButtonElement | null;
    const modalCancelBtn = this.windowEl.querySelector('#btn-firewall-modal-cancel') as HTMLButtonElement | null;

    addAppBtn?.addEventListener('click', () => {
      if (this.isLocked) {
        this.promptUnlock();
        return;
      }
      if (addAppModal) addAppModal.style.display = 'flex';
    });

    modalCancelBtn?.addEventListener('click', () => {
      if (addAppModal) addAppModal.style.display = 'none';
    });

    modalSaveBtn?.addEventListener('click', () => {
      const nameInput = this.windowEl?.querySelector('#modal-app-name') as HTMLInputElement | null;
      const pathInput = this.windowEl?.querySelector('#modal-app-path') as HTMLInputElement | null;
      const actionSelect = this.windowEl?.querySelector('#modal-app-action') as HTMLSelectElement | null;

      const name = nameInput?.value.trim() || 'Custom Application';
      const path = pathInput?.value.trim() || `/usr/local/bin/${name.toLowerCase().replace(/\s+/g, '_')}`;
      const action = (actionSelect?.value === 'block' ? 'block' : 'allow') as 'allow' | 'block';

      firewall.addAppRule({
        id: `custom_${Date.now()}`,
        name,
        path,
        action,
        icon: '📦',
        notes: 'User-defined application policy'
      });

      if (addAppModal) addAppModal.style.display = 'none';
      if (nameInput) nameInput.value = '';
      if (pathInput) pathInput.value = '';
      this.renderAppRulesTable();
    });
  }

  private setupDomainBlocklist(): void {
    if (!this.windowEl) return;

    const domainInput = this.windowEl.querySelector('#firewall-domain-input') as HTMLInputElement | null;
    const addDomainBtn = this.windowEl.querySelector('#btn-firewall-add-domain') as HTMLButtonElement | null;
    const quickAdsBtn = this.windowEl.querySelector('#btn-firewall-block-ads') as HTMLButtonElement | null;
    const quickMinersBtn = this.windowEl.querySelector('#btn-firewall-block-miners') as HTMLButtonElement | null;

    const handleAdd = () => {
      if (this.isLocked) {
        this.promptUnlock();
        return;
      }
      const val = domainInput?.value.trim() || '';
      if (val) {
        firewall.addBlockedDomain(val);
        this.syncServerRule({ addDomain: val });
        if (domainInput) domainInput.value = '';
        this.renderDomainBlocklist();
      }
    };

    addDomainBtn?.addEventListener('click', handleAdd);
    domainInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAdd();
    });

    quickAdsBtn?.addEventListener('click', () => {
      ['doubleclick.net', 'google-analytics.com', 'adnxs.com', 'criteo.com'].forEach(d => firewall.addBlockedDomain(d));
      this.renderDomainBlocklist();
    });

    quickMinersBtn?.addEventListener('click', () => {
      ['coinhive.com', 'crypto-loot.com', 'miner-pool.xyz', 'monerominer.rocks'].forEach(d => firewall.addBlockedDomain(d));
      this.renderDomainBlocklist();
    });
  }

  private setupPacketMonitor(): void {
    if (!this.windowEl) return;

    const pauseBtn = this.windowEl.querySelector('#btn-firewall-pause-logs') as HTMLButtonElement | null;
    const clearBtn = this.windowEl.querySelector('#btn-firewall-clear-logs') as HTMLButtonElement | null;
    const exportBtn = this.windowEl.querySelector('#btn-firewall-export-logs') as HTMLButtonElement | null;
    const testPingBtn = this.windowEl.querySelector('#btn-firewall-test-ping') as HTMLButtonElement | null;

    pauseBtn?.addEventListener('click', () => {
      this.isStreamPaused = !this.isStreamPaused;
      pauseBtn.textContent = this.isStreamPaused ? '▶ Resume Stream' : '⏸ Pause Stream';
    });

    clearBtn?.addEventListener('click', () => {
      firewall.clearLogs();
      fetch('/api/firewall/clear', { method: 'POST' }).catch(() => {});
    });

    exportBtn?.addEventListener('click', () => {
      const pcapText = firewall.exportPcapLog();
      const blob = new Blob([pcapText], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `llm95-firewall-capture-${Date.now()}.log`;
      a.click();
    });

    testPingBtn?.addEventListener('click', () => {
      // Simulate an incoming probe packet to demonstrate Stealth Mode
      firewall.inspectPacket({
        protocol: 'ICMP',
        direction: 'INBOUND',
        app: 'Diagnostic Ping Scanner',
        source: '198.51.100.42',
        destination: '192.168.1.95',
        port: 7,
        payloadBytes: 32,
        reason: 'External host diagnostic ping echo request'
      });
    });
  }

  public renderAll(): void {
    this.renderMasterStatus();
    this.renderAppRulesTable();
    this.renderDomainBlocklist();
    this.renderPacketLogHistory();
    this.updateStatsCounters();
  }

  private renderMasterStatus(): void {
    if (!this.windowEl) return;
    const cfg = firewall.getConfig();

    const shieldIcon = this.windowEl.querySelector('#firewall-status-shield') as HTMLElement | null;
    const titleText = this.windowEl.querySelector('#firewall-status-title') as HTMLElement | null;
    const descText = this.windowEl.querySelector('#firewall-status-desc') as HTMLElement | null;
    const toggleBtn = this.windowEl.querySelector('#btn-firewall-master-toggle') as HTMLButtonElement | null;
    const blockAllChk = this.windowEl.querySelector('#chk-firewall-block-all') as HTMLInputElement | null;
    const stealthChk = this.windowEl.querySelector('#chk-firewall-stealth') as HTMLInputElement | null;
    const signedChk = this.windowEl.querySelector('#chk-firewall-signed') as HTMLInputElement | null;

    if (cfg.enabled) {
      if (shieldIcon) shieldIcon.innerHTML = '🛡️';
      if (titleText) {
        titleText.textContent = 'Firewall: On';
        titleText.style.color = '#27ae60';
      }
      if (descText) {
        descText.textContent = 'The firewall is active and monitoring incoming & outgoing network connections for all applications.';
      }
      if (toggleBtn) {
        toggleBtn.textContent = 'Turn Off Firewall';
        toggleBtn.className = 'win95-btn firewall-action-btn btn-turn-off';
      }
    } else {
      if (shieldIcon) shieldIcon.innerHTML = '⚠️';
      if (titleText) {
        titleText.textContent = 'Firewall: Off';
        titleText.style.color = '#c0392b';
      }
      if (descText) {
        descText.textContent = 'The firewall is inactive. All incoming and outgoing connections are allowed without inspection.';
      }
      if (toggleBtn) {
        toggleBtn.textContent = 'Turn On Firewall';
        toggleBtn.className = 'win95-btn firewall-action-btn btn-turn-on';
      }
    }

    if (blockAllChk) blockAllChk.checked = cfg.blockAllIncoming;
    if (stealthChk) stealthChk.checked = cfg.stealthMode;
    if (signedChk) signedChk.checked = cfg.allowSignedSoftware;

    // Taskbar indicator synchronization
    this.syncTaskbarIndicator(cfg.enabled);
  }

  private syncTaskbarIndicator(enabled: boolean): void {
    const taskbarTrayShield = document.getElementById('taskbar-firewall-indicator');
    if (taskbarTrayShield) {
      taskbarTrayShield.textContent = enabled ? '🛡️' : '⚠️';
      taskbarTrayShield.title = enabled
        ? 'macOS Application Firewall: Active & Protecting'
        : 'macOS Application Firewall: INACTIVE';
      taskbarTrayShield.style.color = enabled ? '#27ae60' : '#e74c3c';
    }
  }

  private renderAppRulesTable(): void {
    if (!this.windowEl) return;
    const tbody = this.windowEl.querySelector('#firewall-apps-tbody') as HTMLElement | null;
    if (!tbody) return;

    tbody.innerHTML = '';
    const cfg = firewall.getConfig();

    cfg.rules.forEach(rule => {
      const tr = document.createElement('tr');
      tr.className = `firewall-rule-row ${rule.action}`;
      tr.innerHTML = `
        <td style="width: 28px; text-align: center; font-size: 1.1rem;">${rule.icon}</td>
        <td>
          <div style="font-weight: bold;">${rule.name}</div>
          <div style="font-size: 0.68rem; color: #666; font-family: monospace;">${rule.path}</div>
        </td>
        <td>
          <select class="firewall-rule-select" data-app-id="${rule.id}" ${this.isLocked ? 'disabled' : ''}>
            <option value="allow" ${rule.action === 'allow' ? 'selected' : ''}>Allow incoming connections</option>
            <option value="block" ${rule.action === 'block' ? 'selected' : ''}>Block incoming connections</option>
          </select>
        </td>
        <td style="text-align: center; width: 40px;">
          ${rule.system
            ? '<span style="font-size: 0.7rem; color: #888;" title="Core System Daemon">System</span>'
            : `<button class="win95-btn btn-remove-rule" data-app-id="${rule.id}" title="Remove rule">✕</button>`}
        </td>
      `;

      const select = tr.querySelector('.firewall-rule-select') as HTMLSelectElement;
      select?.addEventListener('change', () => {
        if (this.isLocked) {
          select.value = rule.action;
          this.promptUnlock();
          return;
        }
        const newAct = select.value as 'allow' | 'block';
        firewall.setAppRule(rule.id, newAct);
        this.syncServerRule({ appId: rule.id, action: newAct });
      });

      const removeBtn = tr.querySelector('.btn-remove-rule') as HTMLButtonElement | null;
      removeBtn?.addEventListener('click', () => {
        if (this.isLocked) {
          this.promptUnlock();
          return;
        }
        firewall.removeAppRule(rule.id);
        this.renderAppRulesTable();
      });

      tbody.appendChild(tr);
    });
  }

  private renderDomainBlocklist(): void {
    if (!this.windowEl) return;
    const container = this.windowEl.querySelector('#firewall-domains-list') as HTMLElement | null;
    if (!container) return;

    container.innerHTML = '';
    const cfg = firewall.getConfig();

    if (cfg.blockedDomains.length === 0) {
      container.innerHTML = '<div style="padding: 12px; font-size: 0.75rem; color: #888; text-align: center;">No domains blocked. Traffic to all hostnames is permitted.</div>';
      return;
    }

    cfg.blockedDomains.forEach(domain => {
      const chip = document.createElement('div');
      chip.className = 'firewall-domain-chip';
      chip.innerHTML = `
        <span>🚫 ${domain}</span>
        <button class="domain-chip-remove" title="Unblock ${domain}">✕</button>
      `;

      chip.querySelector('.domain-chip-remove')?.addEventListener('click', () => {
        if (this.isLocked) {
          this.promptUnlock();
          return;
        }
        firewall.removeBlockedDomain(domain);
        this.syncServerRule({ removeDomain: domain });
        this.renderDomainBlocklist();
      });

      container.appendChild(chip);
    });
  }

  private renderPacketLogHistory(): void {
    if (!this.windowEl) return;
    const tbody = this.windowEl.querySelector('#firewall-packet-tbody') as HTMLElement | null;
    if (!tbody) return;

    tbody.innerHTML = '';
    const logs = firewall.getLogs();

    logs.forEach(l => {
      this.appendPacketLogRow(l, tbody);
    });
  }

  private prependPacketLogRow(log: PacketLogEntry): void {
    const tbody = this.windowEl?.querySelector('#firewall-packet-tbody') as HTMLElement | null;
    if (!tbody) return;

    const tr = this.createPacketRowElement(log);
    tbody.insertBefore(tr, tbody.firstChild);

    // Keep table limited to 100 rows in DOM
    if (tbody.children.length > 100) {
      tbody.removeChild(tbody.lastChild!);
    }
  }

  private appendPacketLogRow(log: PacketLogEntry, tbody: HTMLElement): void {
    const tr = this.createPacketRowElement(log);
    tbody.appendChild(tr);
  }

  private createPacketRowElement(log: PacketLogEntry): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.className = `packet-row ${log.decision.toLowerCase()}`;

    const badgeClass = log.decision === 'PASS'
      ? 'packet-badge-pass'
      : (log.decision === 'STEALTH_DROP' ? 'packet-badge-stealth' : 'packet-badge-drop');

    tr.innerHTML = `
      <td>${log.timestamp}</td>
      <td><strong>${log.protocol}</strong></td>
      <td><span class="dir-badge ${log.direction.toLowerCase()}">${log.direction === 'INBOUND' ? 'IN ↓' : 'OUT ↑'}</span></td>
      <td title="${log.app}">${log.app.length > 18 ? log.app.slice(0, 16) + '...' : log.app}</td>
      <td title="${log.destination}:${log.port}" style="font-family: monospace; font-size: 0.72rem;">${log.destination}</td>
      <td>${log.port}</td>
      <td><span class="packet-decision-badge ${badgeClass}">${log.decision}</span></td>
      <td title="${log.reason}" style="font-size: 0.7rem; color: #555;">${log.reason.length > 45 ? log.reason.slice(0, 42) + '...' : log.reason}</td>
    `;
    return tr;
  }

  private updateStatsCounters(): void {
    if (!this.windowEl) return;
    const stats = firewall.getStats();

    const cntInspected = this.windowEl.querySelector('#stat-packets-inspected') as HTMLElement | null;
    const cntPassed = this.windowEl.querySelector('#stat-packets-passed') as HTMLElement | null;
    const cntBlocked = this.windowEl.querySelector('#stat-packets-blocked') as HTMLElement | null;
    const cntStealth = this.windowEl.querySelector('#stat-packets-stealth') as HTMLElement | null;
    const dropRate = this.windowEl.querySelector('#stat-drop-rate') as HTMLElement | null;

    if (cntInspected) cntInspected.textContent = stats.inspected.toLocaleString();
    if (cntPassed) cntPassed.textContent = stats.passed.toLocaleString();
    if (cntBlocked) cntBlocked.textContent = stats.blocked.toLocaleString();
    if (cntStealth) cntStealth.textContent = stats.stealthDrops.toLocaleString();

    if (dropRate) {
      const rate = stats.inspected > 0 ? ((stats.blocked / stats.inspected) * 100).toFixed(1) : '0.0';
      dropRate.textContent = `${rate}%`;
    }
  }

  private syncServerToggle(setting: string, value: boolean): void {
    fetch('/api/firewall/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setting, value })
    }).catch(() => {});
  }

  private syncServerRule(rulePayload: any): void {
    fetch('/api/firewall/rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rulePayload)
    }).catch(() => {});
  }

  private startBackgroundTrafficSimulation(): void {
    if (this.liveSimulationTimer) clearInterval(this.liveSimulationTimer);

    const endpoints = [
      { host: 'time.apple.com', port: 123, proto: 'UDP' as const, app: 'NTP Time Daemon', reason: 'macOS Tahoe clock sync' },
      { host: 'gateway.local', port: 53, proto: 'DNS' as const, app: 'VirtIO-Net Ethernet Device', reason: 'mDNS query discovery' },
      { host: '127.0.0.1', port: 3000, proto: 'TCP' as const, app: 'RAM Hypervisor & Isolation Shield', reason: 'Enclave memory bus ping' },
      { host: 'kernel.local', port: 0, proto: 'TCP' as const, app: 'COM1 UART 16550A Serial Bus', reason: 'TTY console status' }
    ];

    this.liveSimulationTimer = window.setInterval(() => {
      if (Math.random() > 0.45) return;
      const sample = endpoints[Math.floor(Math.random() * endpoints.length)];
      firewall.inspectPacket({
        protocol: sample.proto,
        direction: Math.random() > 0.3 ? 'OUTBOUND' : 'INBOUND',
        app: sample.app,
        source: '192.168.1.95',
        destination: sample.host,
        port: sample.port,
        payloadBytes: Math.floor(48 + Math.random() * 512),
        reason: sample.reason
      });
    }, 4500);
  }
}

export const firewallController = FirewallWindowController.getInstance();
