// Offline Synthesized Audio Chime + Web Push Notifications

class NotificationService {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private desktopEnabled: boolean = true;

  constructor() {
    this.soundEnabled = localStorage.getItem('simoon_sound_enabled') !== 'false';
    this.desktopEnabled = localStorage.getItem('simoon_desktop_enabled') !== 'false';
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    localStorage.setItem('simoon_sound_enabled', enabled ? 'true' : 'false');
  }

  public isDesktopEnabled(): boolean {
    return this.desktopEnabled;
  }

  public setDesktopEnabled(enabled: boolean): void {
    this.desktopEnabled = enabled;
    localStorage.setItem('simoon_desktop_enabled', enabled ? 'true' : 'false');
  }

  public async requestDesktopPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const res = await Notification.requestPermission();
      return res === 'granted';
    }
    return false;
  }

  private getAudioContext(): AudioContext | null {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return null;
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  // Synthesize a gentle incoming message cyber bell chime (880Hz -> 1318.5Hz)
  public playMessageChime(): void {
    if (!this.soundEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Primary tone (E6 ~ 1318.5 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1318.5, now + 0.08);

      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.2, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.36);

      // Harmonious secondary bell shimmer (B6 ~ 1975.5 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1975.5, now + 0.06);

      gain2.gain.setValueAtTime(0.001, now + 0.06);
      gain2.gain.linearRampToValueAtTime(0.12, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc2.start(now + 0.06);
      osc2.stop(now + 0.46);
    } catch {
      // Audio autoplay policy or device without audio
    }
  }

  // Synthesize a bright, positive peer connect chime (C5 -> E5 -> G5)
  public playConnectChime(): void {
    if (!this.soundEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      const noteDuration = 0.09;

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * noteDuration);

        const startTime = now + i * noteDuration;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + noteDuration + 0.16);
      });
    } catch {
      // Ignore audio error
    }
  }

  // Synthesize a soft, descending peer disconnect chime (G5 -> E5 -> C5)
  public playDisconnectChime(): void {
    if (!this.soundEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [659.25, 523.25]; // E5, C5
      const noteDuration = 0.12;

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * noteDuration);

        const startTime = now + i * noteDuration;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + noteDuration + 0.13);
      });
    } catch {
      // Ignore audio error
    }
  }

  public notifyPeerConnected(peerId: string, peerAlias?: string): void {
    this.playConnectChime();

    if (this.desktopEnabled && 'Notification' in window && Notification.permission === 'granted') {
      if (document.hidden) {
        try {
          const name = peerAlias || `Peer ${peerId.slice(0, 4)}`;
          const notif = new Notification(`SIMOON MESH: Peer Connected`, {
            body: `${name} (${peerId}) is now connected via E2EE channel`,
            icon: '/favicon.ico',
            tag: 'simoon-peer-connected',
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        } catch {
          // Ignore notification error
        }
      }
    }
  }

  public notifyPeerDisconnected(peerId?: string): void {
    this.playDisconnectChime();

    if (this.desktopEnabled && 'Notification' in window && Notification.permission === 'granted') {
      if (document.hidden) {
        try {
          const notif = new Notification(`SIMOON MESH: Peer Disconnected`, {
            body: peerId ? `Disconnected from ${peerId}` : 'Peer channel closed',
            icon: '/favicon.ico',
            tag: 'simoon-peer-disconnected',
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        } catch {
          // Ignore notification error
        }
      }
    }
  }

  public notifyIncoming(senderName: string, previewText: string): void {
    // 1. In-app audio chime
    this.playMessageChime();

    // 2. Desktop notification if tab is blurred/hidden
    if (this.desktopEnabled && 'Notification' in window && Notification.permission === 'granted') {
      if (document.hidden) {
        try {
          const notif = new Notification(`SIMOON MESH: ${senderName}`, {
            body: previewText.length > 80 ? previewText.slice(0, 80) + '...' : previewText,
            icon: '/favicon.ico',
            tag: 'simoon-message',
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        } catch {
          // Ignore notification error
        }
      }
    }
  }
}

export const notificationService = new NotificationService();
