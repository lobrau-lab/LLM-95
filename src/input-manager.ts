/**
 * Peripheral & Input Subsystem
 * Manages Pointer Lock UX state machine, relative PS/2 mouse coordinate serialization,
 * retro HUD alerts, and browser-to-x86 scan-code translation.
 */

export interface PointerLockCallbacks {
  onLockChange?: (isLocked: boolean) => void;
  onMouseDelta?: (dx: number, dy: number, buttons: number) => void;
}

export class V86InputManager {
  private canvasContainer: HTMLElement | null = null;
  private hudElement: HTMLElement | null = null;
  private v86Instance: any = null;
  private isLocked: boolean = false;
  private fadeTimeoutId: number | null = null;
  private callbacks: PointerLockCallbacks = {};

  // Track modifier keys for scan code translation
  private shiftDown: boolean = false;
  private ctrlDown: boolean = false;
  private altDown: boolean = false;

  constructor(canvasContainer: HTMLElement, hudElement: HTMLElement | null, callbacks: PointerLockCallbacks = {}) {
    this.canvasContainer = canvasContainer;
    this.hudElement = hudElement;
    this.callbacks = callbacks;
  }

  public bind(v86Instance: any): void {
    this.v86Instance = v86Instance;
    if (!this.canvasContainer) return;

    // 1. Canvas Click -> Request Pointer Lock
    this.canvasContainer.addEventListener('click', async () => {
      await this.requestLock();
    });

    // 2. Pointer Lock Change listener
    document.addEventListener('pointerlockchange', () => {
      const activeLock = document.pointerLockElement === this.canvasContainer ||
                         document.pointerLockElement === this.canvasContainer?.querySelector('canvas');
      this.isLocked = Boolean(activeLock);

      if (this.hudElement) {
        if (this.isLocked) {
          this.hudElement.style.display = 'flex';
          this.hudElement.classList.remove('fade-out');

          if (this.fadeTimeoutId) clearTimeout(this.fadeTimeoutId);
          this.fadeTimeoutId = window.setTimeout(() => {
            if (this.hudElement && this.isLocked) {
              this.hudElement.classList.add('fade-out');
            }
          }, 3000);
        } else {
          this.hudElement.style.display = 'none';
          this.hudElement.classList.remove('fade-out');
        }
      }

      this.callbacks.onLockChange?.(this.isLocked);
    });

    // 3. Pointer Lock Error
    document.addEventListener('pointerlockerror', () => {
      console.warn('[InputManager] Pointer lock was rejected by the browser or user.');
      this.isLocked = false;
      if (this.hudElement) this.hudElement.style.display = 'none';
      this.callbacks.onLockChange?.(false);
    });

    // 4. Mouse Move delta routing to PS/2 bus
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isLocked || !this.v86Instance) return;

      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      const buttons = e.buttons;

      // Send relative delta to v86 mouse bus
      if (this.v86Instance.bus) {
        this.v86Instance.bus.send('mouse-delta', [dx, dy, buttons]);
      }

      this.callbacks.onMouseDelta?.(dx, dy, buttons);
    });

    // 5. Mouse Click & Button states
    this.canvasContainer.addEventListener('mousedown', (e: MouseEvent) => {
      if (!this.isLocked) return;
      if (this.v86Instance?.bus) {
        this.v86Instance.bus.send('mouse-clicks', e.buttons);
      }
    });

    this.canvasContainer.addEventListener('mouseup', (e: MouseEvent) => {
      if (!this.isLocked) return;
      if (this.v86Instance?.bus) {
        this.v86Instance.bus.send('mouse-clicks', e.buttons);
      }
    });
  }

  public async requestLock(): Promise<void> {
    const target = this.canvasContainer?.querySelector('canvas') || this.canvasContainer;
    if (!target) return;

    if (document.pointerLockElement !== target) {
      try {
        // Modern raw unadjusted mouse ballistics for vintage x86 OSs
        await (target as any).requestPointerLock({ unadjustedMovement: true });
      } catch {
        try {
          // Standard pointer lock fallback
          await target.requestPointerLock();
        } catch (e) {
          console.warn('[InputManager] Standard pointer lock fallback failed:', e);
        }
      }
    }
  }

  public releaseLock(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  public isPointerLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Translates plain string text into sequence of keyboard scan codes
   * and dispatches into v86 keyboard input buffer.
   */
  public async injectText(text: string, charDelayMs: number = 30): Promise<void> {
    if (!this.v86Instance) return;

    // Use v86 built-in keyboard_send_text or keyboard_send_keys
    if (typeof this.v86Instance.keyboard_send_text === 'function') {
      await this.v86Instance.keyboard_send_text(text, charDelayMs);
      return;
    }

    // Fallback: character-by-character scan code translation
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\n' || char === '\r') {
        // Enter key (Scan Code 0x1C)
        await this.sendRawScanCode(0x1C);
      } else {
        const sc = this.asciiToScancode(char);
        if (sc) {
          if (sc.shift) await this.sendRawScanCode(0x2A, true); // Left Shift Down
          await this.sendRawScanCode(sc.code);
          if (sc.shift) await this.sendRawScanCode(0xAA, true); // Left Shift Up
        }
      }
      if (charDelayMs > 0) {
        await new Promise((r) => setTimeout(r, charDelayMs));
      }
    }
  }

  public async sendRawScanCode(code: number, singleOnly: boolean = false): Promise<void> {
    if (!this.v86Instance?.bus) return;

    this.v86Instance.bus.send('keyboard-code', code);
    if (!singleOnly && code < 0x80) {
      // Simulate release (make code | 0x80)
      await new Promise((r) => setTimeout(r, 20));
      this.v86Instance.bus.send('keyboard-code', code | 0x80);
    }
  }

  /**
   * Helper mapping ASCII characters to IBM PC Scan Code Set 1
   */
  private asciiToScancode(char: string): { code: number; shift: boolean } | null {
    const code = char.charCodeAt(0);
    // Lowercase a-z
    if (code >= 97 && code <= 122) {
      const map: Record<string, number> = {
        a: 0x1e, b: 0x30, c: 0x2e, d: 0x20, e: 0x12, f: 0x21, g: 0x22, h: 0x23,
        i: 0x17, j: 0x24, k: 0x25, l: 0x26, m: 0x32, n: 0x31, o: 0x18, p: 0x19,
        q: 0x10, r: 0x13, s: 0x1f, t: 0x14, u: 0x16, v: 0x2f, w: 0x11, x: 0x2d,
        y: 0x15, z: 0x2c
      };
      return { code: map[char] || 0x1e, shift: false };
    }
    // Uppercase A-Z
    if (code >= 65 && code <= 90) {
      const lower = char.toLowerCase();
      const sc = this.asciiToScancode(lower);
      return sc ? { code: sc.code, shift: true } : null;
    }
    // Digits 0-9
    if (code >= 48 && code <= 57) {
      const digitMap = [0x0b, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a];
      return { code: digitMap[code - 48], shift: false };
    }
    // Punctuation & spaces
    const special: Record<string, { code: number; shift: boolean }> = {
      ' ': { code: 0x39, shift: false },
      '\n': { code: 0x1c, shift: false },
      '\r': { code: 0x1c, shift: false },
      '\t': { code: 0x0f, shift: false },
      '-': { code: 0x0c, shift: false },
      '_': { code: 0x0c, shift: true },
      '=': { code: 0x0d, shift: false },
      '+': { code: 0x0d, shift: true },
      '[': { code: 0x1a, shift: false },
      '{': { code: 0x1a, shift: true },
      ']': { code: 0x1b, shift: false },
      '}': { code: 0x1b, shift: true },
      ';': { code: 0x27, shift: false },
      ':': { code: 0x27, shift: true },
      "'": { code: 0x28, shift: false },
      '"': { code: 0x28, shift: true },
      ',': { code: 0x33, shift: false },
      '<': { code: 0x33, shift: true },
      '.': { code: 0x34, shift: false },
      '>': { code: 0x34, shift: true },
      '/': { code: 0x35, shift: false },
      '?': { code: 0x35, shift: true },
      '\\': { code: 0x2b, shift: false },
      '|': { code: 0x2b, shift: true },
      '!': { code: 0x02, shift: true },
      '@': { code: 0x03, shift: true },
      '#': { code: 0x04, shift: true },
      '$': { code: 0x05, shift: true },
      '%': { code: 0x06, shift: true },
      '^': { code: 0x07, shift: true },
      '&': { code: 0x08, shift: true },
      '*': { code: 0x09, shift: true },
      '(': { code: 0x0a, shift: true },
      ')': { code: 0x0b, shift: true }
    };

    return special[char] || null;
  }
}
