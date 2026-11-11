/*
 * Üretilmiş ses sistemi (Web Audio). Harici ses dosyası yok → telif sorunu yok.
 * Ambiyans, ofis sesleri, geri sayım, doğru/yanlış, patron konuşma sesleri, final müziği.
 */
(function (root) {
  'use strict';

  const KEY = 'sc_sound';

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.ambBus = null;
      this.musicBus = null;
      this.enabled = true;
      try { this.enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* yoksay */ }
      this.ambMode = null;
      this.tension = 0;
      this.timers = new Set();
      this.noiseBuf = null;
      this.lastBlip = 0;
    }

    ensure() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.ambBus = this.ctx.createGain(); this.ambBus.gain.value = 1; this.ambBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 1; this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate * 3;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      return this.ctx;
    }

    get suspended() { return !!this.ctx && this.ctx.state !== 'running'; }

    resume() {
      const c = this.ensure();
      if (c && c.state === 'suspended') return c.resume();
      return Promise.resolve();
    }

    setEnabled(v) {
      this.enabled = !!v;
      try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) { /* yoksay */ }
      if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
    }

    _timer(fn, ms) {
      const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
      this.timers.add(id);
      return id;
    }

    _ok() { return this.enabled && this.ensure() && this.ctx.state === 'running'; }

    /* ---------- temel yapı taşları ---------- */
    _tone(freq, { t = 0, dur = 0.2, type = 'sine', gain = 0.1, attack = 0.005, slideTo = null, bus = null, detune = 0 } = {}) {
      const c = this.ctx; const now = c.currentTime + t;
      const o = c.createOscillator(); const g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, now); o.detune.value = detune;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g); g.connect(bus || this.master);
      o.start(now); o.stop(now + dur + 0.05);
      return o;
    }

    _noise({ t = 0, dur = 0.2, gain = 0.1, type = 'bandpass', freq = 2000, q = 1, sweepTo = null, bus = null } = {}) {
      const c = this.ctx; const now = c.currentTime + t;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, now); f.Q.value = q;
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, now + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.02, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      s.connect(f); f.connect(g); g.connect(bus || this.master);
      s.start(now, Math.random() * 2); s.stop(now + dur + 0.05);
    }

    /* ---------- ambiyans ---------- */
    stopAmbience() {
      if (this.ambNodes) { this.ambNodes.forEach((n) => { try { n.stop(); } catch (e) { /* */ } }); this.ambNodes = null; }
      if (this.ambTimer) { clearTimeout(this.ambTimer); this.ambTimer = null; }
      this.ambMode = null;
    }

    startAmbience(mode = 'office') {
      if (!this.ensure()) return;
      if (this.ambMode === mode && this.ambNodes) return;
      this.stopAmbience();
      this.ambMode = mode;
      const c = this.ctx;
      const nodes = [];
      // klima uğultusu (kahverengi gürültü)
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = mode === 'title' ? 180 : 260;
      const g = c.createGain(); g.gain.value = mode === 'title' ? 0.16 : 0.1;
      src.connect(lp); lp.connect(g); g.connect(this.ambBus); src.start(); nodes.push(src);
      // alçak pad
      const base = mode === 'title' ? 55 : 73.4;
      [base, base * 1.5, base * 2.003].forEach((f, i) => {
        const o = c.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f;
        const og = c.createGain(); og.gain.value = [0.05, 0.03, 0.012][i];
        const lfo = c.createOscillator(); lfo.frequency.value = 0.07 + i * 0.05;
        const lg = c.createGain(); lg.gain.value = og.gain.value * 0.6;
        lfo.connect(lg); lg.connect(og.gain);
        o.connect(og); og.connect(this.ambBus); o.start(); lfo.start(); nodes.push(o, lfo);
      });
      this.ambNodes = nodes;
      if (mode !== 'title') this._officeLoop();
    }

    _officeLoop() {
      const step = () => {
        if (!this.ambNodes) return;
        if (this.enabled && this.ctx.state === 'running') {
          const r = Math.random();
          if (r < 0.7) {
            // klavye tıkırtısı öbeği
            const n = 3 + Math.floor(Math.random() * 7);
            for (let i = 0; i < n; i++) {
              this._noise({ t: i * (0.07 + Math.random() * 0.09), dur: 0.018, gain: 0.025 + Math.random() * 0.02, freq: 2400 + Math.random() * 1800, q: 2.2, bus: this.ambBus });
            }
          } else if (r < 0.85) {
            // uzaktan telefon zili
            for (let i = 0; i < 2; i++) {
              this._tone(880, { t: i * 0.45, dur: 0.18, gain: 0.012, type: 'sine', bus: this.ambBus });
              this._tone(660, { t: i * 0.45 + 0.2, dur: 0.18, gain: 0.012, type: 'sine', bus: this.ambBus });
            }
          } else {
            // sandalye / kâğıt hışırtısı
            this._noise({ dur: 0.35, gain: 0.014, freq: 1400, q: 0.6, sweepTo: 400, bus: this.ambBus });
          }
        }
        this.ambTimer = setTimeout(step, 700 + Math.random() * 2200);
      };
      this.ambTimer = setTimeout(step, 600);
    }

    /** Konuşma sırasında ambiyansı kıs. */
    duck(on) {
      if (!this.ctx || !this.ambBus) return;
      this.ambBus.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, 0.15);
    }

    /** Sinir arttıkça kalp atışı benzeri alçak vuruş. 0..4 */
    setTension(level) {
      this.tension = level;
      if (this.hbTimer) { clearTimeout(this.hbTimer); this.hbTimer = null; }
      if (level < 2) return;
      const period = [0, 0, 1500, 1050, 700][level];
      const beat = () => {
        if (this.enabled && this.ctx && this.ctx.state === 'running') {
          this._tone(58, { dur: 0.22, gain: 0.16 + level * 0.03, slideTo: 38, bus: this.ambBus });
          this._tone(52, { t: 0.16, dur: 0.2, gain: 0.1 + level * 0.02, slideTo: 36, bus: this.ambBus });
        }
        this.hbTimer = setTimeout(beat, period);
      };
      this.hbTimer = setTimeout(beat, 400);
    }

    /* ---------- efektler ---------- */
    whoosh(dur = 0.7, gain = 0.12) { if (this._ok()) this._noise({ dur, gain, type: 'bandpass', freq: 400, sweepTo: 3600, q: 0.9 }); }
    thud() { if (this._ok()) { this._tone(70, { dur: 0.35, gain: 0.35, slideTo: 35 }); this._noise({ dur: 0.12, gain: 0.08, type: 'lowpass', freq: 400 }); } }
    door() { if (this._ok()) { this._noise({ dur: 0.18, gain: 0.2, type: 'lowpass', freq: 600, sweepTo: 120 }); this._tone(90, { dur: 0.3, gain: 0.25, slideTo: 45 }); } }
    footsteps(n = 4) { if (this._ok()) for (let i = 0; i < n; i++) this._noise({ t: i * 0.34, dur: 0.09, gain: 0.07, type: 'lowpass', freq: 380 }); }
    lock() { if (this._ok()) { this._tone(180, { dur: 0.08, gain: 0.18, type: 'square' }); this._tone(120, { t: 0.09, dur: 0.14, gain: 0.2, type: 'square' }); } }
    slide() { this.whoosh(0.45, 0.07); }

    tick(urgent) {
      if (!this._ok()) return;
      this._tone(urgent ? 1180 : 820, { dur: 0.07, gain: urgent ? 0.14 : 0.07, type: 'square', attack: 0.002 });
      if (urgent) this._tone(590, { t: 0.0, dur: 0.12, gain: 0.05, type: 'sine' });
    }

    correct() {
      if (!this._ok()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone(f, { t: i * 0.085, dur: 0.5, gain: 0.13, type: 'triangle' }));
      this._tone(261.6, { dur: 0.9, gain: 0.1, type: 'sine' });
    }

    wrong() {
      if (!this._ok()) return;
      this._tone(130, { dur: 0.8, gain: 0.18, type: 'sawtooth', slideTo: 82 });
      this._tone(137.5, { dur: 0.8, gain: 0.16, type: 'sawtooth', slideTo: 86 });
      this._tone(98, { t: 0.05, dur: 0.9, gain: 0.2, type: 'square', slideTo: 60 });
      this._noise({ dur: 0.25, gain: 0.08, type: 'lowpass', freq: 800 });
    }

    timeout() {
      if (!this._ok()) return;
      for (let i = 0; i < 3; i++) this._tone(440, { t: i * 0.22, dur: 0.16, gain: 0.14, type: 'square' });
    }

    /** Patron konuşma sesi: her patronun kendine özgü tonu. */
    blip(voice) {
      if (!this._ok()) return;
      const now = performance.now();
      if (now - this.lastBlip < 38) return;
      this.lastBlip = now;
      const v = voice || { base: 150, wave: 'square', gain: 0.03 };
      const f = v.base * (0.9 + Math.random() * 0.35);
      this._tone(f, { dur: 0.06, gain: v.gain, type: v.wave, attack: 0.004 });
      this._tone(f * 2.01, { dur: 0.04, gain: v.gain * 0.35, type: 'sine', attack: 0.004 });
    }

    cash(n = 1) {
      if (!this._ok()) return;
      for (let i = 0; i < n; i++) {
        this._tone(1568, { t: i * 0.06, dur: 0.12, gain: 0.07, type: 'triangle' });
        this._tone(2093, { t: i * 0.06 + 0.02, dur: 0.1, gain: 0.04, type: 'sine' });
      }
    }

    salaryCut() {
      if (!this._ok()) return;
      this._tone(220, { dur: 1.1, gain: 0.2, type: 'sawtooth', slideTo: 110 });
      this._tone(165, { t: 0.15, dur: 1.1, gain: 0.16, type: 'sawtooth', slideTo: 82 });
      this._noise({ dur: 0.6, gain: 0.07, type: 'lowpass', freq: 900, sweepTo: 150 });
    }

    boom() {
      if (!this._ok()) return;
      this._tone(48, { dur: 1.6, gain: 0.5, slideTo: 24 });
      this._noise({ dur: 1.0, gain: 0.25, type: 'lowpass', freq: 900, sweepTo: 60 });
    }

    glitch() {
      if (!this._ok()) return;
      for (let i = 0; i < 6; i++) this._noise({ t: i * 0.07, dur: 0.05, gain: 0.1, type: 'highpass', freq: 3000 + Math.random() * 3000, q: 4 });
    }

    stamp() { if (this._ok()) { this._tone(75, { dur: 0.3, gain: 0.4, slideTo: 40 }); this._noise({ dur: 0.1, gain: 0.15, type: 'lowpass', freq: 900 }); } }

    /* ---------- final müziği ---------- */
    stopMusic() {
      if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
      this.musicKind = null;
    }

    music(kind) {
      this.stopMusic();
      if (!this.ensure()) return;
      this.musicKind = kind;
      const N = (n) => 440 * Math.pow(2, (n - 69) / 12);
      const sets = {
        good: { bpm: 84, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]], lead: 'triangle', arp: [0, 1, 2, 3, 2, 1, 2, 3] },
        warn: { bpm: 68, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], lead: 'sine', arp: [0, 1, 2, 1, 0, 1, 2, 1] },
        bad: { bpm: 58, chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], lead: 'sawtooth', arp: [0, 2, 1, 2, 0, 2, 1, 2] },
        fire: { bpm: 50, chords: [[38, 45], [38, 44], [37, 44], [36, 43]], lead: 'sawtooth', arp: [0, 1, 0, 1, 0, 1, 0, 1] },
      };
      const s = sets[kind] || sets.warn;
      let bar = 0;
      const beat = 60 / s.bpm;
      const play = () => {
        if (this.musicKind !== kind) return;
        if (this.enabled && this.ctx.state === 'running') {
          const ch = s.chords[bar % s.chords.length];
          ch.forEach((n, i) => this._tone(N(n - 12), { dur: beat * 4.1, gain: kind === 'fire' ? 0.08 : 0.045, type: kind === 'good' ? 'sine' : 'triangle', attack: 0.4, bus: this.musicBus, detune: i * 3 }));
          for (let i = 0; i < 8; i++) {
            const n = ch[s.arp[i] % ch.length] + 12;
            this._tone(N(n), { t: i * beat * 0.5, dur: beat * 0.9, gain: kind === 'fire' ? 0.02 : 0.05, type: s.lead, attack: 0.01, bus: this.musicBus });
          }
          if (kind === 'good' && bar % 4 === 3) [72, 76, 79, 84].forEach((n, i) => this._tone(N(n), { t: i * 0.12, dur: 1.4, gain: 0.05, type: 'triangle', bus: this.musicBus }));
        }
        bar++;
        this.musicTimer = setTimeout(play, beat * 4000);
      };
      play();
    }
  }

  root.SoundEngine = SoundEngine;
})(window);
