/** Tiny procedural cozy SFX via Web Audio. */

export class CozyAudio {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain = 0.04) {
    if (this.muted) return;
    const ctx = this.ensure();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.7), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  pop() {
    this.blip(660, 0.08, "triangle", 0.05);
  }

  splash() {
    this.blip(220, 0.12, "sine", 0.045);
    this.blip(140, 0.18, "triangle", 0.03);
  }

  chop() {
    this.blip(120, 0.06, "square", 0.03);
  }

  chirp() {
    this.blip(880, 0.1, "sine", 0.035);
  }

  gift() {
    this.blip(523, 0.12, "sine", 0.05);
    setTimeout(() => this.blip(659, 0.12, "sine", 0.05), 90);
    setTimeout(() => this.blip(784, 0.18, "triangle", 0.05), 180);
  }
}
