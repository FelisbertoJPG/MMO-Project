// Sons sintetizados com WebAudio — nenhum arquivo externo
export class Sfx {
  constructor() { this.ctx = null; this.music = null; }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  get t() { return this.ctx.currentTime; }

  noise({ dur = 0.2, freq = 1000, q = 1, type = 'bandpass', vol = 0.5, attack = 0.005, sweepTo = null, delay = 0 }) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    const t0 = this.t + delay;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }

  tone({ freq = 220, type = 'sine', dur = 0.3, vol = 0.3, slideTo = null, attack = 0.01, delay = 0 }) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    const t0 = this.t + delay;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  swing(heavy = false) { this.noise({ dur: heavy ? 0.4 : 0.25, freq: heavy ? 500 : 900, sweepTo: heavy ? 200 : 350, q: 2, vol: 0.35, attack: 0.05 }); }
  hit() {
    this.noise({ dur: 0.18, freq: 350, q: 0.8, type: 'lowpass', vol: 0.9 });
    this.tone({ freq: 120, type: 'triangle', dur: 0.15, vol: 0.4, slideTo: 50 });
  }
  playerHurt() {
    this.noise({ dur: 0.25, freq: 280, type: 'lowpass', vol: 0.9 });
    this.tone({ freq: 90, type: 'sawtooth', dur: 0.25, vol: 0.15, slideTo: 40 });
  }
  block() {
    this.tone({ freq: 900, type: 'square', dur: 0.12, vol: 0.12, slideTo: 600 });
    this.tone({ freq: 1340, type: 'sine', dur: 0.5, vol: 0.18 });
    this.noise({ dur: 0.1, freq: 3000, q: 1, vol: 0.4 });
  }
  guardBreak() { this.tone({ freq: 400, type: 'sawtooth', dur: 0.5, vol: 0.2, slideTo: 80 }); this.block(); }
  roll() { this.noise({ dur: 0.35, freq: 200, type: 'lowpass', vol: 0.5, attack: 0.08 }); }
  step() { this.noise({ dur: 0.07, freq: 150, type: 'lowpass', vol: 0.15 }); }
  heal() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.9, vol: 0.08, delay: i * 0.07 }));
  }
  pickup() { this.tone({ freq: 660, dur: 0.3, vol: 0.12 }); this.tone({ freq: 990, dur: 0.5, vol: 0.1, delay: 0.08 }); }
  souls() { this.tone({ freq: 1200, dur: 0.6, vol: 0.05, slideTo: 1800 }); }
  bonfire() {
    this.noise({ dur: 1.2, freq: 600, q: 0.5, vol: 0.4, attack: 0.3, sweepTo: 2000 });
    [196, 293, 392].forEach((f, i) => this.tone({ freq: f, dur: 2.5, vol: 0.08, attack: 0.3, delay: i * 0.1 }));
  }
  explosion() {
    this.noise({ dur: 0.9, freq: 800, type: 'lowpass', vol: 1.0, sweepTo: 60 });
    this.tone({ freq: 70, type: 'sine', dur: 0.8, vol: 0.5, slideTo: 30 });
  }
  cast() { this.tone({ freq: 180, type: 'sawtooth', dur: 0.6, vol: 0.08, slideTo: 520, attack: 0.3 }); }
  roar() {
    this.tone({ freq: 70, type: 'sawtooth', dur: 2.0, vol: 0.35, slideTo: 45, attack: 0.2 });
    this.tone({ freq: 104, type: 'sawtooth', dur: 1.8, vol: 0.2, slideTo: 60, attack: 0.2 });
    this.noise({ dur: 2.0, freq: 400, type: 'lowpass', vol: 0.6, attack: 0.2 });
  }
  slam() {
    this.noise({ dur: 0.7, freq: 300, type: 'lowpass', vol: 1.0, sweepTo: 40 });
    this.tone({ freq: 55, type: 'sine', dur: 0.7, vol: 0.6, slideTo: 25 });
  }
  died() {
    this.tone({ freq: 110, type: 'sawtooth', dur: 3.5, vol: 0.12, attack: 0.4 });
    this.tone({ freq: 116.5, type: 'sawtooth', dur: 3.5, vol: 0.12, attack: 0.4 });
    this.tone({ freq: 55, type: 'sine', dur: 4, vol: 0.4, attack: 0.1 });
  }
  victory() {
    [261.6, 329.6, 392, 523.2].forEach((f) => this.tone({ freq: f, type: 'triangle', dur: 4, vol: 0.08, attack: 0.6 }));
    this.noise({ dur: 3, freq: 3000, q: 0.3, vol: 0.12, attack: 1.0 });
  }

  keyDrop() {
    [1800, 2400, 2100].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.25, vol: 0.08, delay: i * 0.06 }));
    this.noise({ dur: 0.1, freq: 3000, q: 2, vol: 0.2 });
  }
  door() {
    this.tone({ freq: 110, type: 'sawtooth', dur: 1.1, vol: 0.05, slideTo: 70, attack: 0.1 });
    this.noise({ dur: 0.9, freq: 500, q: 6, vol: 0.2, attack: 0.1, sweepTo: 300 });
    this.noise({ dur: 0.3, freq: 150, type: 'lowpass', vol: 0.6, delay: 0.9 });
  }
  // madeira estalando: um baque grave e duas lascas agudas logo atrás
  quebrar() {
    this.noise({ dur: 0.18, freq: 300, type: 'lowpass', vol: 0.55 });
    this.noise({ dur: 0.09, freq: 1800, q: 2, vol: 0.35, delay: 0.02 });
    this.noise({ dur: 0.12, freq: 1100, q: 2.5, vol: 0.25, delay: 0.09 });
  }
  // folhas: um farfalhar curto e abafado
  folhas() {
    this.noise({ dur: 0.35, freq: 2600, q: 0.6, vol: 0.18, attack: 0.03, sweepTo: 900 });
    this.noise({ dur: 0.2, freq: 1800, q: 0.8, vol: 0.12, delay: 0.12 });
  }
  // a panela: borbulhar e o "pronto" da comida
  cozinhar() {
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.08, freq: 500 + Math.random() * 400, q: 6, vol: 0.18, delay: i * 0.11 });
    this.tone({ freq: 520, dur: 0.35, vol: 0.08, delay: 0.6 }); this.tone({ freq: 780, dur: 0.5, vol: 0.07, delay: 0.7 });
  }
  locked() { this.noise({ dur: 0.12, freq: 1200, q: 3, vol: 0.3 }); this.noise({ dur: 0.12, freq: 900, q: 3, vol: 0.3, delay: 0.12 }); }
  chest() {
    this.noise({ dur: 0.6, freq: 700, q: 5, vol: 0.18, attack: 0.05, sweepTo: 400 });
    [523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.8, vol: 0.06, delay: 0.5 + i * 0.08 }));
  }
  torchIgnite() { this.noise({ dur: 0.6, freq: 800, q: 0.5, vol: 0.35, attack: 0.05, sweepTo: 2500 }); }
  torchOut() { this.noise({ dur: 0.8, freq: 2500, q: 0.5, vol: 0.25, sweepTo: 400 }); }
  rattle() {
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.05, freq: 2500 + Math.random() * 2000, q: 8, vol: 0.12, delay: i * 0.05 + Math.random() * 0.03 });
  }

  startAmbience() {
    // Vento distante: ruído filtrado com LFO
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(f.frequency);
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start(); lfo.start();
  }

  startBossMusic() {
    if (!this.ctx || this.music) return;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0, this.t);
    out.gain.linearRampToValueAtTime(0.35, this.t + 3);
    out.connect(this.master);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    lp.connect(out);
    const oscs = [];
    // Pad em ré menor (acorde grave desafinado)
    [73.4, 73.9, 110, 146.8, 174.6].forEach((fr) => {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      o.connect(g).connect(lp); o.start(); oscs.push(o);
    });
    // Tambores de guerra
    const beat = 60 / 84;
    let next = this.t + 0.5;
    const pattern = [1, 0, 0.5, 0, 1, 0, 0.6, 0.4];
    let i = 0;
    const timer = setInterval(() => {
      while (next < this.t + 0.3) {
        const v = pattern[i % pattern.length];
        if (v > 0) {
          const o = this.ctx.createOscillator(); o.type = 'sine';
          const g = this.ctx.createGain();
          o.frequency.setValueAtTime(90, next); o.frequency.exponentialRampToValueAtTime(35, next + 0.4);
          g.gain.setValueAtTime(0.5 * v, next); g.gain.exponentialRampToValueAtTime(0.001, next + 0.5);
          o.connect(g).connect(out); o.start(next); o.stop(next + 0.55);
        }
        i++; next += beat / 2;
      }
    }, 100);
    this.music = { out, oscs, timer };
  }

  stopBossMusic() {
    if (!this.music) return;
    const { out, oscs, timer } = this.music;
    this.music = null;
    out.gain.cancelScheduledValues(this.t);
    out.gain.setValueAtTime(out.gain.value, this.t);
    out.gain.linearRampToValueAtTime(0, this.t + 2);
    setTimeout(() => { clearInterval(timer); oscs.forEach((o) => o.stop()); out.disconnect(); }, 2200);
  }
}
