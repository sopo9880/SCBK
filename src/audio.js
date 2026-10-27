// WebAudio 로 합성하는 효과음 (외부 음원 없음)
export class Audio {
  constructor() {
    this.ctx = null; this.vol = 0.7; this.muted = false; this._laser = null; this._crumbleT = 0;
  }
  _init() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.vol;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 3;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5 + w * 0.15; }
      return true;
    } catch (e) { return false; }
  }
  resume() { if (this._init() && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  toggleMute() { this.muted = !this.muted; this.setVolume(this.vol); return this.muted; }

  _noise(dur, freq, gain, attack = 0.005, q = 0.7, freqEnd) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }
  _tone(f0, f1, dur, gain, type = 'sine') {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  boom(size = 1, distance = 200) {
    if (!this._init() || this.muted) return;
    const att = Math.max(0.15, Math.min(1, 300 / (distance + 100)));
    const s = Math.min(3, size);
    this._noise(0.6 + s * 1.2, 1800 + s * 600, 0.9 * att, 0.004, 0.8, 120);
    this._noise(1.5 + s * 2.5, 300, 0.8 * att, 0.02, 0.5, 40);
    this._tone(90 - s * 15, 25, 0.8 + s * 0.8, 0.9 * att);
  }
  crumble(n = 1) {
    if (!this._init() || this.muted) return;
    const now = performance.now();
    if (now - this._crumbleT < 120) return;
    this._crumbleT = now;
    this._noise(1.2 + Math.min(2, n * 0.05), 700, Math.min(0.5, 0.15 + n * 0.01), 0.05, 1.2, 150);
  }
  whoosh(dur = 1) { if (!this._init() || this.muted) return; this._noise(dur, 3000, 0.15, dur * 0.7, 2, 400); }
  thud() { if (!this._init() || this.muted) return; this._tone(70, 30, 0.4, 0.6); this._noise(0.5, 500, 0.4, 0.005, 1, 100); }
  rumble(dur) {
    if (!this._init() || this.muted) return;
    this._noise(dur, 140, 0.9, 0.6, 0.6, 60);
    this._noise(dur * 0.8, 400, 0.25, 1.0, 1, 100);
  }
  nuke() {
    if (!this._init() || this.muted) return;
    this._noise(9, 2500, 1, 0.01, 0.6, 60);
    this._noise(12, 200, 1, 0.3, 0.4, 30);
    this._tone(55, 18, 6, 1);
  }
  laserStart() {
    if (!this._init() || this.muted || this._laser) return;
    const c = this.ctx, t = c.currentTime;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 110;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 221;
    const lfo = c.createOscillator(); lfo.frequency.value = 18;
    const lg = c.createGain(); lg.gain.value = 40; lfo.connect(lg); lg.connect(o1.frequency);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.1);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o1.start(); o2.start(); lfo.start();
    this._laser = { o1, o2, lfo, g };
  }
  laserStop() {
    if (!this._laser) return;
    const { o1, o2, lfo, g } = this._laser; const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    for (const o of [o1, o2, lfo]) o.stop(t + 0.2);
    this._laser = null;
  }
  wind(dur) { if (!this._init() || this.muted) return; this._noise(dur, 900, 0.35, 1.5, 3, 300); this._noise(dur, 200, 0.4, 1.5, 0.5, 80); }
  drone(dur) {
    if (!this._init() || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(58, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.1);
    this._noise(dur, 600, 0.12, dur * 0.45, 1, 300);
  }
  rocket(dur) {
    if (!this._init() || this.muted) return;
    this._noise(dur, 700, 0.8, 0.4, 0.7, 120);
    this._noise(dur * 0.8, 2400, 0.25, 0.2, 2, 300);
    this._tone(45, 30, dur, 0.6);
  }
  thunder() {
    if (!this._init() || this.muted) return;
    this._noise(0.25, 4000, 0.6, 0.002, 0.7, 800);
    this._noise(3.5, 260, 0.9, 0.05, 0.6, 40);
  }
  crack() {
    if (!this._init() || this.muted) return;
    this._noise(0.12, 9000, 0.9, 0.001, 0.5, 3000);
    this._tone(1800, 120, 0.4, 0.35, 'sawtooth');
    this._noise(1.5, 500, 0.7, 0.01, 0.6, 60);
  }
  buzz(dur) {
    if (!this._init() || this.muted) return;
    for (const f of [180, 232, 291]) this._tone(f, f * 0.94, dur, 0.035, 'sawtooth');
    this._noise(dur, 1800, 0.05, 0.3, 4, 600);
  }
  // 관제실 효과음
  beep(f = 880, dur = 0.09, gain = 0.12) { if (!this._init() || this.muted) return; this._tone(f, f, dur, gain, 'square'); }
  clack() { if (!this._init() || this.muted) return; this._noise(0.08, 3500, 0.35, 0.002, 2, 900); this._tone(220, 120, 0.06, 0.2, 'square'); }
  click() { if (!this._init() || this.muted) return; this._noise(0.03, 6000, 0.25, 0.001, 3, 2500); this._tone(1400, 900, 0.03, 0.08, 'square'); }
  alarm(dur = 0.4) { if (!this._init() || this.muted) return; this._tone(660, 990, dur, 0.1, 'sawtooth'); }
  launch() { if (!this._init() || this.muted) return; this._noise(2.6, 900, 0.8, 0.05, 0.8, 120); this._tone(70, 40, 2.4, 0.5, 'sawtooth'); }
  horn(dur = 1.6) {
    if (!this._init() || this.muted) return;
    for (const f of [311, 370, 466]) this._tone(f, f * 0.995, dur, 0.09, 'sawtooth');
  }
  roar(dur = 2.5) {
    if (!this._init() || this.muted) return;
    this._tone(110, 48, dur, 0.5, 'sawtooth'); this._tone(73, 35, dur, 0.5, 'square');
    this._noise(dur, 700, 0.6, 0.2, 1.5, 120);
  }
  rewind(dur = 3) {
    if (!this._init() || this.muted) return;
    this._tone(60, 900, dur, 0.18, 'sawtooth'); this._tone(90, 1400, dur, 0.1, 'triangle');
    this._noise(dur, 5000, 0.2, dur * 0.8, 3, 200);
  }
  freeze(dur = 2) {
    if (!this._init() || this.muted) return;
    this._noise(dur, 7000, 0.3, 0.05, 6, 2500);
    this._tone(2400, 900, dur, 0.06, 'sine');
  }
  charge(dur = 2) {
    if (!this._init() || this.muted) return;
    this._tone(80, 900, dur, 0.22, 'sawtooth'); this._tone(40, 460, dur, 0.25, 'sine');
  }
  hum(dur) { if (!this._init() || this.muted) return; this._tone(48, 30, dur, 0.5, 'sine'); this._tone(96, 40, dur, 0.15, 'triangle'); }
}
