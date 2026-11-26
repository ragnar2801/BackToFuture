import type { WeaponId } from './types';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private lastTimes = new Map<string, number>();

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(val: boolean): void {
    this.muted = val;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private canPlay(key: string, minIntervalSec: number): boolean {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    const prev = this.lastTimes.get(key) ?? -999;
    if (now - prev < minIntervalSec) return false;
    this.lastTimes.set(key, now);
    return true;
  }

  public playWeapon(weapon: WeaponId): void {
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (weapon === 'pistol') {
      if (!this.canPlay('pistol', 0.05)) return;
      this.noiseBurst(now, 0.075, 1600, 3200, 0.24);
      this.tonePop(now, 320, 95, 0.065, 'triangle', 0.22);
    } else if (weapon === 'shotgun') {
      if (!this.canPlay('shotgun', 0.12)) return;
      this.noiseBurst(now, 0.22, 420, 1800, 0.42);
      this.tonePop(now, 165, 42, 0.18, 'sawtooth', 0.34);
    } else if (weapon === 'rifle') {
      if (!this.canPlay('rifle', 0.045)) return;
      this.noiseBurst(now, 0.085, 1200, 3400, 0.24);
      this.tonePop(now, 250, 75, 0.06, 'square', 0.14);
    } else if (weapon === 'minigun') {
      if (!this.canPlay('minigun', 0.04)) return;
      this.noiseBurst(now, 0.055, 950, 2600, 0.19);
      this.tonePop(now, 210 + Math.random() * 35, 68, 0.045, 'sawtooth', 0.15);
    } else if (weapon === 'rocket') {
      if (!this.canPlay('rocket', 0.2)) return;
      // Whoosh launch
      this.noiseBurst(now, 0.34, 300, 1200, 0.32);
      this.tonePop(now, 240, 88, 0.26, 'sawtooth', 0.24);
    }
  }

  public playTankCannon(): void {
    if (!this.canPlay('tank_cannon', 0.2)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.noiseBurst(now, 0.36, 180, 900, 0.48);
    this.tonePop(now, 130, 32, 0.3, 'triangle', 0.48);
  }

  public playTankCoax(): void {
    if (!this.canPlay('tank_coax', 0.05)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.noiseBurst(now, 0.06, 1100, 2900, 0.17);
    this.tonePop(now, 195, 70, 0.05, 'square', 0.12);
  }

  public playExplosion(scale = 1): void {
    if (!this.canPlay('explosion', 0.08)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = 0.35 + scale * 0.22;
    this.noiseBurst(now, dur, 110, 680, Math.min(0.55, 0.35 * scale));
    this.tonePop(now, 115, 26, dur * 0.85, 'sine', Math.min(0.52, 0.38 * scale));
  }

  public playGrenadeBounce(): void {
    if (!this.canPlay('grenade_bounce', 0.07)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.tonePop(now, 920 + Math.random() * 140, 620, 0.045, 'triangle', 0.14);
  }

  public playSwordClash(): void {
    if (!this.canPlay('sword', 0.09)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const base = 1350 + Math.random() * 450;
    this.tonePop(now, base, base * 0.72, 0.075, 'triangle', 0.07);
  }

  public playArrowShoot(): void {
    if (!this.canPlay('arrow', 0.12)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.tonePop(now, 480, 240, 0.06, 'triangle', 0.08);
  }

  public playArmorClink(): void {
    if (!this.canPlay('armor', 0.06)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freq = 1850 + Math.random() * 450;
    this.tonePop(now, freq, freq * 0.85, 0.06, 'sine', 0.11);
  }

  public playHit(): void {
    if (!this.canPlay('hit', 0.045)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.tonePop(now, 190, 95, 0.045, 'triangle', 0.11);
  }

  public playPickup(isSpecial = false): void {
    if (!this.canPlay('pickup', 0.05)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = isSpecial ? [523, 659, 784, 1046] : [440, 587, 784];
    notes.forEach((f, idx) => {
      this.tonePop(now + idx * 0.055, f, f * 1.03, 0.11, 'triangle', 0.18);
    });
  }

  public playTankToggle(entering: boolean): void {
    if (!this.canPlay('tank_toggle', 0.1)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (entering) {
      this.tonePop(now, 120, 210, 0.16, 'sawtooth', 0.18);
      this.tonePop(now + 0.1, 280, 140, 0.11, 'square', 0.14);
    } else {
      this.tonePop(now, 260, 130, 0.12, 'triangle', 0.16);
    }
  }

  public playWaveHorn(): void {
    if (!this.canPlay('wave_horn', 0.8)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Deep medieval brass war horn chord
    const freqs = [146.8, 220.0, 293.6];
    freqs.forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * 0.96, now);
      osc.frequency.linearRampToValueAtTime(freq, now + 0.16);
      osc.frequency.setValueAtTime(freq, now + 0.72);
      osc.frequency.linearRampToValueAtTime(freq * 0.98, now + 1.05);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(620, now);
      filter.frequency.linearRampToValueAtTime(980, now + 0.25);
      filter.frequency.linearRampToValueAtTime(420, now + 1.05);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.095 / (i * 0.4 + 1), now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 1.12);
    });
  }

  public playDodge(): void {
    if (!this.canPlay('dodge', 0.1)) return;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.noiseBurst(now, 0.11, 550, 1700, 0.16);
  }

  private tonePop(
    startTime: number,
    startFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    peakGain: number
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);

    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  private noiseBurst(
    startTime: number,
    duration: number,
    lowFreq: number,
    highFreq: number,
    peakGain: number
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((lowFreq + highFreq) * 0.5, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, lowFreq), startTime + duration);
    filter.Q.value = 0.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peakGain, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(startTime, Math.random() * 0.3, duration + 0.02);
  }
}
