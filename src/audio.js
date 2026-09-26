// Fully synthesized soundscape (no audio files):
// waves + wind above water, muffled rumble below, a slow ambient pad, splashes and bubbles.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.under = 0;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.9, ctx.currentTime + 3);
    // everything passes through the "ears" filter that closes when submerged
    this.ear = ctx.createBiquadFilter();
    this.ear.type = 'lowpass';
    this.ear.frequency.value = 18000;
    this.ear.Q.value = 0.7;
    this.ear.connect(this.master);
    this.master.connect(ctx.destination);

    // simple generated reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.5, 2.2);
    const rvGain = ctx.createGain();
    rvGain.gain.value = 0.35;
    this.reverb.connect(rvGain).connect(this.ear);

    const noise = this.noiseBuffer(6);

    // --- waves (above) ---
    this.aboveGain = ctx.createGain();
    this.aboveGain.gain.value = 1;
    this.aboveGain.connect(this.ear);
    const mkNoise = (freq, type, q, gain) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = 0.7 + Math.random() * 0.4;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g);
      src.start(0, Math.random() * 5);
      return { src, f, g };
    };
    const wave1 = mkNoise(500, 'lowpass', 0.5, 0.22);
    const wave2 = mkNoise(1400, 'bandpass', 0.6, 0.06);
    wave1.g.connect(this.aboveGain);
    wave2.g.connect(this.aboveGain);
    this.lfo(0.11, 0.12, wave1.g.gain);
    this.lfo(0.17, 0.04, wave2.g.gain);
    this.lfo(0.07, 250, wave1.f.frequency);
    const wind = mkNoise(320, 'bandpass', 0.9, 0.05);
    wind.g.connect(this.aboveGain);
    this.lfo(0.05, 0.035, wind.g.gain);
    this.lfo(0.03, 120, wind.f.frequency);

    // --- underwater ---
    this.belowGain = ctx.createGain();
    this.belowGain.gain.value = 0;
    this.belowGain.connect(this.master);
    const rumble = mkNoise(160, 'lowpass', 1.0, 0.5);
    rumble.g.connect(this.belowGain);
    this.lfo(0.09, 0.15, rumble.g.gain);
    const hum = ctx.createOscillator();
    hum.frequency.value = 55;
    const humG = ctx.createGain();
    humG.gain.value = 0.03;
    hum.connect(humG).connect(this.belowGain);
    hum.start();

    // --- ambient pad ---
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0.08;
    const padLP = ctx.createBiquadFilter();
    padLP.type = 'lowpass';
    padLP.frequency.value = 1400;
    this.padBus.connect(padLP);
    padLP.connect(this.ear);
    padLP.connect(this.reverb);
    this.lfo(0.04, 500, padLP.frequency);
    this.voices = [];
    for (let i = 0; i < 4; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.padBus);
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'sine';
      o2.type = 'triangle';
      o2.detune.value = 7;
      const g2 = ctx.createGain();
      g2.gain.value = 0.35;
      o1.connect(g);
      o2.connect(g2).connect(g);
      o1.start();
      o2.start();
      this.voices.push({ o1, o2, g });
    }
    // Dmaj9-ish drift: gentle, unresolved chords
    this.chords = [
      [146.83, 220.0, 277.18, 329.63],
      [123.47, 185.0, 246.94, 293.66],
      [110.0, 164.81, 246.94, 277.18],
      [130.81, 196.0, 246.94, 329.63],
    ];
    this.chordIdx = 0;
    this.nextChord = ctx.currentTime + 0.5;
    this.bubbleTimer = 0;
    this.strokeTimer = 0;
  }

  noiseBuffer(sec) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown-ish
      d[i] = last * 3.5 + w * 0.08;
    }
    return buf;
  }

  impulse(sec, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  lfo(freq, depth, param) {
    const o = this.ctx.createOscillator();
    o.frequency.value = freq * (0.8 + Math.random() * 0.4);
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.2);
  }

  splash(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.8);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * strength, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.8);
  }

  bubble() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = 350 + Math.random() * 500;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.4, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.1);
    o.connect(g).connect(this.belowGain);
    o.start(t);
    o.stop(t + 0.12);
  }

  stroke(under) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.6);
    const f = ctx.createBiquadFilter();
    f.type = under ? 'lowpass' : 'bandpass';
    f.frequency.value = under ? 400 : 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(under ? 0.18 : 0.08, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(f).connect(g).connect(under ? this.belowGain : this.aboveGain);
    src.start(t);
    src.stop(t + 0.6);
  }

  update(dt, under, depth, speed) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.under += ((under ? 1 : 0) - this.under) * Math.min(dt * 8, 1);
    const u = this.under;
    this.ear.frequency.setTargetAtTime(under ? 520 - Math.min(depth, 20) * 12 : 18000, t, 0.05);
    this.aboveGain.gain.setTargetAtTime(1 - u * 0.85, t, 0.05);
    this.belowGain.gain.setTargetAtTime(u * (0.8 + Math.min(depth, 20) * 0.02), t, 0.08);

    if (t > this.nextChord) {
      const ch = this.chords[this.chordIdx++ % this.chords.length];
      this.voices.forEach((v, i) => {
        const f = ch[i] * (under ? 0.5 : 1);
        v.o1.frequency.setTargetAtTime(f, t, 1.5);
        v.o2.frequency.setTargetAtTime(f * 2, t, 1.5);
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setTargetAtTime(0.0, t, 1.2);
        v.g.gain.setTargetAtTime(0.28 / (1 + i * 0.3), t + 1.6 + i * 0.4, 2.0);
      });
      this.nextChord = t + 10 + Math.random() * 4;
    }

    if (under) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer < 0) {
        this.bubbleTimer = 0.4 + Math.random() * 2.5;
        const n = 1 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) setTimeout(() => this.bubble(), i * 70);
      }
    }
    if (speed > 1.2) {
      this.strokeTimer -= dt;
      if (this.strokeTimer < 0) {
        this.strokeTimer = 1.1;
        this.stroke(under);
      }
    }
  }
}
