/**
 * Lightweight synthesised audio so the game needs no external assets.
 * Everything is generated with the WebAudio API on demand.
 */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.enabled = true;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // one second of white noise, reused for every gunshot
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this.startAmbience();
  }

  startAmbience() {
    if (!this.ctx) return;
    // low wind bed
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(this.master);
    src.start();

    // slow LFO so the wind breathes
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
  }

  _noiseBurst(dur, filterType, startFreq, endFreq, gain, q = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(startFreq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, endFreq), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _thump(freq, dur, gain, type = 'sine') {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.35), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(kind = 'carbine') {
    if (!this.ctx) return;
    if (kind === 'dmr') {
      this._noiseBurst(0.42, 'lowpass', 5200, 260, 0.85, 0.8);
      this._thump(120, 0.32, 0.5);
      this._noiseBurst(0.16, 'highpass', 2600, 900, 0.28);
    } else {
      this._noiseBurst(0.20, 'bandpass', 3400, 500, 0.7, 0.9);
      this._thump(160, 0.14, 0.42);
      this._noiseBurst(0.07, 'highpass', 4200, 1800, 0.22);
    }
  }

  enemyShot(distance = 10) {
    if (!this.ctx) return;
    const g = Math.max(0.06, 0.5 - distance * 0.012);
    this._noiseBurst(0.22, 'lowpass', 2200, 380, g);
    this._thump(130, 0.18, g * 0.6);
  }

  dryFire() {
    if (!this.ctx) return;
    this._noiseBurst(0.04, 'highpass', 3000, 1500, 0.18);
  }

  reload() {
    if (!this.ctx) return;
    setTimeout(() => this._noiseBurst(0.06, 'bandpass', 1800, 900, 0.25, 3), 0);
    setTimeout(() => this._noiseBurst(0.05, 'bandpass', 1200, 600, 0.22, 3), 320);
    setTimeout(() => this._noiseBurst(0.08, 'bandpass', 2200, 700, 0.3, 2), 900);
  }

  hitmarker() {
    if (!this.ctx) return;
    this._thump(1150, 0.06, 0.16, 'square');
  }

  kill() {
    if (!this.ctx) return;
    this._thump(720, 0.14, 0.18, 'triangle');
    setTimeout(() => this._thump(1020, 0.12, 0.14, 'triangle'), 70);
  }

  hurt() {
    if (!this.ctx) return;
    this._thump(90, 0.3, 0.4, 'sawtooth');
    this._noiseBurst(0.25, 'lowpass', 800, 120, 0.3);
  }

  step() {
    if (!this.ctx) return;
    this._noiseBurst(0.09, 'lowpass', 1100, 220, 0.12);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.55 : 0;
    return this.enabled;
  }
}
