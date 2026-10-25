/**
 * LLM-95 macOS Application Firewall & Packet Filter Engine
 * Modeled after macOS Application Firewall (socketfilterfw) and BSD pfctl.
 * Provides per-application access control, stealth mode, incoming connection blocking,
 * domain/IP filtering, and live packet stream telemetry.
 */

export type FirewallAction = 'allow' | 'block';
export type PacketDecision = 'PASS' | 'DROP' | 'STEALTH_DROP';
export type PacketDirection = 'INBOUND' | 'OUTBOUND';
export type NetworkProtocol = 'HTTP' | 'HTTPS' | 'TCP' | 'UDP' | 'DNS' | 'ICMP';

export interface FirewallAppRule {
  id: string;
  name: string;
  path: string;
  action: FirewallAction;
  icon: string;
  system: boolean;
  notes?: string;
}

export interface PacketLogEntry {
  id: string;
  timestamp: string;
  protocol: NetworkProtocol;
  direction: PacketDirection;
  app: string;
  source: string;
  destination: string;
  port: number;
  decision: PacketDecision;
  reason: string;
  payloadBytes: number;
}

export interface FirewallStats {
  inspected: number;
  passed: number;
  blocked: number;
  inbound: number;
  outbound: number;
  stealthDrops: number;
  lastActive: string;
}

export interface FirewallConfig {
  enabled: boolean;
  blockAllIncoming: boolean;
  stealthMode: boolean;
  allowSignedSoftware: boolean;
  locked: boolean;
  blockedDomains: string[];
  rules: FirewallAppRule[];
}

const DEFAULT_FIREWALL_RULES: FirewallAppRule[] = [
  {
    id: 'chrome',
    name: 'Web Browser (chrome.exe)',
    path: '/usr/bin/chrome',
    action: 'allow',
    icon: '🌐',
    system: true,
    notes: 'HTTP/HTTPS Proxy Client'
  },
  {
    id: 'v86_wasm',
    name: 'x86 Virtual Machine (v86-core.wasm)',
    path: '/system/v86.wasm',
    action: 'allow',
    icon: '🖥️',
    system: true,
    notes: 'QEMU/v86 CPU & Hardware Core'
  },
  {
    id: 'virtio_net',
    name: 'VirtIO-Net Ethernet Device',
    path: '/kernel/drivers/virtio_net',
    action: 'allow',
    icon: '🔌',
    system: true,
    notes: 'macOS Tahoe Virtual NIC Bridge'
  },
  {
    id: 'gemma_pilot',
    name: 'Gemma-2-2B Local OS Pilot',
    path: '/models/gemma-kernel',
    action: 'allow',
    icon: '🤖',
    system: true,
    notes: 'Autonomous OS Operator & Shell'
  },
  {
    id: 'proxy_gateway',
    name: 'HTTP/HTTPS Proxy Gateway',
    path: '/system/proxy-daemon',
    action: 'allow',
    icon: '⚡',
    system: true,
    notes: 'Internal Web Proxy Daemon'
  },
  {
    id: 'com1_serial',
    name: 'COM1 UART 16550A Serial Bus',
    path: '/dev/ttyS0',
    action: 'allow',
    icon: '📟',
    system: true,
    notes: 'Serial Terminal Telemetry Pipe'
  },
  {
    id: 'hypervisor_shield',
    name: 'RAM Hypervisor & Isolation Shield',
    path: '/system/hypervisor',
    action: 'allow',
    icon: '🛡️',
    system: true,
    notes: 'Memory Enclave Isolation Guard'
  }
];

const DEFAULT_BLOCKED_DOMAINS: string[] = [
  'malware-test.org',
  'phishing-simulator.net',
  'cryptominer-pool.xyz',
  'trackers.adservice.net',
  'telemetry.suspicious-analytics.io'
];

export class FirewallEngine {
  private static instance: FirewallEngine;
  private config: FirewallConfig;
  private stats: FirewallStats;
  private logs: PacketLogEntry[] = [];
  private maxLogs = 150;
  private listeners: Array<(event: string, data: any) => void> = [];
  private logIdCounter = 1;

  private constructor() {
    this.config = this.loadConfig();
    this.stats = {
      inspected: 0,
      passed: 0,
      blocked: 0,
      inbound: 0,
      outbound: 0,
      stealthDrops: 0,
      lastActive: new Date().toLocaleTimeString()
    };

    // Seed some initial macOS boot packet inspections
    this.inspectPacket({
      protocol: 'TCP',
      direction: 'OUTBOUND',
      app: 'VirtIO-Net Ethernet Device',
      source: '192.168.1.95',
      destination: 'gateway.local',
      port: 53,
      payloadBytes: 64,
      reason: 'DHCP/DNS lease negotiation'
    });
    this.inspectPacket({
      protocol: 'HTTPS',
      direction: 'OUTBOUND',
      app: 'Gemma-2-2B Local OS Pilot',
      source: '127.0.0.1',
      destination: 'localhost',
      port: 3000,
      payloadBytes: 128,
      reason: 'On-device IPC loopback handshake'
    });
  }

  public static getInstance(): FirewallEngine {
    if (!FirewallEngine.instance) {
      FirewallEngine.instance = new FirewallEngine();
    }
    return FirewallEngine.instance;
  }

  private loadConfig(): FirewallConfig {
    try {
      const saved = localStorage.getItem('llm95_firewall_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          enabled: parsed.enabled !== false,
          blockAllIncoming: !!parsed.blockAllIncoming,
          stealthMode: parsed.stealthMode !== false,
          allowSignedSoftware: parsed.allowSignedSoftware !== false,
          locked: !!parsed.locked,
          blockedDomains: Array.isArray(parsed.blockedDomains) ? parsed.blockedDomains : [...DEFAULT_BLOCKED_DOMAINS],
          rules: Array.isArray(parsed.rules) && parsed.rules.length ? parsed.rules : [...DEFAULT_FIREWALL_RULES]
        };
      }
    } catch (e) {
      console.warn('[Firewall] Error loading saved config:', e);
    }

    return {
      enabled: true,
      blockAllIncoming: false,
      stealthMode: true,
      allowSignedSoftware: true,
      locked: false,
      blockedDomains: [...DEFAULT_BLOCKED_DOMAINS],
      rules: [...DEFAULT_FIREWALL_RULES]
    };
  }

  public saveConfig(): void {
    try {
      localStorage.setItem('llm95_firewall_config', JSON.stringify(this.config));
    } catch (e) {
      console.warn('[Firewall] Error saving config:', e);
    }
    this.emit('configChange', this.config);
  }

  public getConfig(): FirewallConfig {
    return { ...this.config };
  }

  public getStats(): FirewallStats {
    return { ...this.stats };
  }

  public getLogs(): PacketLogEntry[] {
    return [...this.logs];
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.saveConfig();
    this.logSystemEvent(
      enabled ? 'Firewall enabled: System packet inspection is active' : 'Firewall disabled: All incoming & outgoing traffic permitted without filtering',
      enabled ? 'PASS' : 'DROP'
    );
  }

  public setBlockAllIncoming(block: boolean): void {
    this.config.blockAllIncoming = block;
    this.saveConfig();
    this.logSystemEvent(`Rule updated: Block all incoming connections = ${block ? 'ON' : 'OFF'}`, 'PASS');
  }

  public setStealthMode(stealth: boolean): void {
    this.config.stealthMode = stealth;
    this.saveConfig();
    this.logSystemEvent(`Stealth mode = ${stealth ? 'ENABLED (Silent drop ping & port scans)' : 'DISABLED'}`, 'PASS');
  }

  public setLock(locked: boolean): void {
    this.config.locked = locked;
    this.saveConfig();
  }

  public setAppRule(appId: string, action: FirewallAction): boolean {
    const rule = this.config.rules.find(r => r.id === appId);
    if (rule) {
      rule.action = action;
      this.saveConfig();
      this.logSystemEvent(`Application policy updated: ${rule.name} set to ${action.toUpperCase()}`, 'PASS');
      return true;
    }
    return false;
  }

  public addAppRule(newRule: Omit<FirewallAppRule, 'system'>): void {
    const existingIndex = this.config.rules.findIndex(r => r.id === newRule.id || r.path === newRule.path);
    if (existingIndex >= 0) {
      this.config.rules[existingIndex] = { ...newRule, system: false };
    } else {
      this.config.rules.push({ ...newRule, system: false });
    }
    this.saveConfig();
    this.logSystemEvent(`Added custom application rule: ${newRule.name} (${newRule.action.toUpperCase()})`, 'PASS');
  }

  public removeAppRule(appId: string): boolean {
    const idx = this.config.rules.findIndex(r => r.id === appId);
    if (idx >= 0) {
      if (this.config.rules[idx].system) {
        return false; // Cannot remove system core rules
      }
      const [removed] = this.config.rules.splice(idx, 1);
      this.saveConfig();
      this.logSystemEvent(`Removed application rule: ${removed.name}`, 'PASS');
      return true;
    }
    return false;
  }

  public addBlockedDomain(domain: string): boolean {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!clean) return false;
    if (!this.config.blockedDomains.includes(clean)) {
      this.config.blockedDomains.push(clean);
      this.saveConfig();
      this.logSystemEvent(`Domain added to blocklist: ${clean}`, 'DROP');
      return true;
    }
    return false;
  }

  public removeBlockedDomain(domain: string): boolean {
    const clean = domain.trim().toLowerCase();
    const idx = this.config.blockedDomains.indexOf(clean);
    if (idx >= 0) {
      this.config.blockedDomains.splice(idx, 1);
      this.saveConfig();
      this.logSystemEvent(`Domain removed from blocklist: ${clean}`, 'PASS');
      return true;
    }
    return false;
  }

  public clearLogs(): void {
    this.logs = [];
    this.emit('logsCleared', null);
  }

  public inspectPacket(params: {
    protocol: NetworkProtocol;
    direction: PacketDirection;
    app: string;
    source: string;
    destination: string;
    port: number;
    payloadBytes?: number;
    url?: string;
    reason?: string;
  }): { decision: PacketDecision; reason: string } {
    this.stats.inspected++;
    if (params.direction === 'INBOUND') this.stats.inbound++;
    else this.stats.outbound++;
    this.stats.lastActive = new Date().toLocaleTimeString();

    let decision: PacketDecision = 'PASS';
    let reason = params.reason || 'Standard traffic passed through macOS packet filter';

    // 1. If firewall is completely disabled, pass all
    if (!this.config.enabled) {
      decision = 'PASS';
      reason = 'Firewall is turned OFF (Permissive pass-through)';
    } else {
      // 2. Check Stealth Mode against ICMP or diagnostic scanning
      if (this.config.stealthMode && (params.protocol === 'ICMP' || params.port === 7 || params.port === 13)) {
        decision = 'STEALTH_DROP';
        reason = 'macOS Stealth Mode: Ping / diagnostic packet silently dropped without ACK';
        this.stats.stealthDrops++;
        this.stats.blocked++;
      }
      // 3. Check "Block all incoming connections"
      else if (params.direction === 'INBOUND' && this.config.blockAllIncoming) {
        decision = 'DROP';
        reason = 'macOS Application Firewall: Block all incoming connections is ACTIVE';
        this.stats.blocked++;
      }
      // 4. Check Per-Application Rule
      else {
        const appRule = this.config.rules.find(
          r => r.name.toLowerCase() === params.app.toLowerCase() ||
               r.id.toLowerCase() === params.app.toLowerCase() ||
               params.app.toLowerCase().includes(r.id.toLowerCase())
        );

        if (appRule && appRule.action === 'block') {
          decision = 'DROP';
          reason = `Application policy violation: '${appRule.name}' is set to BLOCK incoming/outgoing traffic`;
          this.stats.blocked++;
        }
        // 5. Check Domain Blacklist (if URL or destination is provided)
        else {
          const testDest = (params.destination + ' ' + (params.url || '')).toLowerCase();
          const matchedBlockedDomain = this.config.blockedDomains.find(d => testDest.includes(d.toLowerCase()));
          if (matchedBlockedDomain) {
            decision = 'DROP';
            reason = `Packet filter policy: Destination matches blocked domain blacklist [${matchedBlockedDomain}]`;
            this.stats.blocked++;
          } else {
            decision = 'PASS';
            reason = appRule
              ? `Application policy '${appRule.name}' permitted connection to ${params.destination}`
              : `Passed default stateful packet filter rule`;
            this.stats.passed++;
          }
        }
      }
    }

    const logEntry: PacketLogEntry = {
      id: `pkt-${this.logIdCounter++}`,
      timestamp: new Date().toLocaleTimeString(),
      protocol: params.protocol,
      direction: params.direction,
      app: params.app,
      source: params.source,
      destination: params.destination,
      port: params.port,
      decision,
      reason,
      payloadBytes: params.payloadBytes || Math.floor(64 + Math.random() * 1400)
    };

    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.emit('packet', logEntry);
    this.emit('stats', this.stats);

    return { decision, reason };
  }

  private logSystemEvent(message: string, decision: PacketDecision): void {
    const entry: PacketLogEntry = {
      id: `sys-${this.logIdCounter++}`,
      timestamp: new Date().toLocaleTimeString(),
      protocol: 'TCP',
      direction: 'OUTBOUND',
      app: 'macOS Application Firewall Daemon',
      source: '127.0.0.1',
      destination: 'kernel.pfctl',
      port: 0,
      decision,
      reason: message,
      payloadBytes: 32
    };
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) this.logs.pop();
    this.emit('packet', entry);
    this.emit('stats', this.stats);
  }

  public subscribe(fn: (event: string, data: any) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private emit(event: string, data: any): void {
    this.listeners.forEach(fn => {
      try {
        fn(event, data);
      } catch (err) {
        console.warn('[Firewall] Event subscriber error:', err);
      }
    });
  }

  public exportPcapLog(): string {
    const lines = [
      `# LLM-95 macOS Application Firewall Packet Capture Log`,
      `# Generated: ${new Date().toISOString()}`,
      `# Host: llm95-tahoe-appliance (macOS Tahoe VirtIO)`,
      `# Status: ${this.config.enabled ? 'ENABLED' : 'DISABLED'} | Stealth: ${this.config.stealthMode ? 'ON' : 'OFF'} | BlockAllIncoming: ${this.config.blockAllIncoming ? 'ON' : 'OFF'}`,
      `# Packets Inspected: ${this.stats.inspected} | Passed: ${this.stats.passed} | Blocked: ${this.stats.blocked}`,
      `----------------------------------------------------------------------------------------------------------------`,
      `TIME       | PROTO | DIR | APP                     | SOURCE          | DESTINATION            | PORT  | ACTION  | DETAILS`,
      `----------------------------------------------------------------------------------------------------------------`
    ];

    this.logs.forEach(l => {
      const time = l.timestamp.padEnd(10);
      const proto = l.protocol.padEnd(5);
      const dir = (l.direction === 'INBOUND' ? 'IN ' : 'OUT').padEnd(3);
      const app = (l.app.length > 23 ? l.app.slice(0, 20) + '...' : l.app).padEnd(23);
      const src = (l.source.length > 15 ? l.source.slice(0, 12) + '...' : l.source).padEnd(15);
      const dst = (l.destination.length > 22 ? l.destination.slice(0, 19) + '...' : l.destination).padEnd(22);
      const port = l.port.toString().padEnd(5);
      const act = l.decision.padEnd(7);
      lines.push(`${time} | ${proto} | ${dir} | ${app} | ${src} | ${dst} | ${port} | ${act} | ${l.reason}`);
    });

    return lines.join('\n');
  }
}

export const firewall = FirewallEngine.getInstance();
