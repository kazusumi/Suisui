// プログラムで鳴らす楽器（効果音と仮の曲の両方で使う）。
// どれも (ctx, 出力先, 鳴らす時刻, 強さ) を受け取って、その時刻に音を予約する。

const noiseCache = new WeakMap();
function noise(ctx) {
  if (!noiseCache.has(ctx)) {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return noiseCache.get(ctx);
}

function env(ctx, out, t, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function noiseHit(ctx, out, t, { type, freq, q = 1, peak, decay, attack = 0.002 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(env(ctx, out, t, peak, attack, decay));
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + decay + 0.05);
}

function tone(ctx, out, t, { type = 'sine', freq, freqEnd, peak, attack = 0.003, decay, detune = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + decay * 0.6);
  o.detune.value = detune;
  o.connect(env(ctx, out, t, peak, attack, decay));
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

export const kick = (ctx, out, t, v = 1) => tone(ctx, out, t, { freq: 150, freqEnd: 42, peak: 0.9 * v, decay: 0.32 });

export function snare(ctx, out, t, v = 1) {
  noiseHit(ctx, out, t, { type: 'highpass', freq: 1200, peak: 0.45 * v, decay: 0.16 });
  tone(ctx, out, t, { type: 'triangle', freq: 190, freqEnd: 150, peak: 0.3 * v, decay: 0.1 });
}

export function clap(ctx, out, t, v = 1) {
  for (const d of [0, 0.011, 0.023]) noiseHit(ctx, out, t + d, { type: 'bandpass', freq: 1400, q: 1.2, peak: 0.55 * v, decay: 0.05 });
  noiseHit(ctx, out, t + 0.03, { type: 'bandpass', freq: 1200, q: 0.9, peak: 0.35 * v, decay: 0.18 });
}

export const hat = (ctx, out, t, v = 1, open = false) =>
  noiseHit(ctx, out, t, { type: 'highpass', freq: 7500, peak: 0.16 * v, decay: open ? 0.22 : 0.04 });

export function perc(ctx, out, t, v = 1) {
  tone(ctx, out, t, { type: 'sine', freq: 620, freqEnd: 420, peak: 0.45 * v, decay: 0.12 });
  noiseHit(ctx, out, t, { type: 'bandpass', freq: 3000, q: 3, peak: 0.2 * v, decay: 0.03 });
}

export function bell(ctx, out, t, v = 1, freq = 1047) {
  for (const [m, p] of [[1, 0.35], [2.76, 0.12], [5.4, 0.05]]) tone(ctx, out, t, { freq: freq * m, peak: p * v, decay: 0.9 });
}

export function crash(ctx, out, t, v = 1) {
  noiseHit(ctx, out, t, { type: 'highpass', freq: 4500, peak: 0.35 * v, decay: 1.1, attack: 0.004 });
  clap(ctx, out, t, v * 0.8);
  kick(ctx, out, t, v * 0.8);
}

export function synth(ctx, out, t, v = 1, freq = 587) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(3200, t);
  f.frequency.exponentialRampToValueAtTime(700, t + 0.25);
  f.connect(out);
  for (const d of [-8, 8]) tone(ctx, f, t, { type: 'sawtooth', freq, peak: 0.18 * v, decay: 0.28, detune: d });
}

export function bass(ctx, out, t, freq, len = 0.2, v = 1) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(220, t + len);
  f.Q.value = 6;
  f.connect(out);
  tone(ctx, f, t, { type: 'sawtooth', freq, peak: 0.5 * v, decay: len });
  tone(ctx, out, t, { type: 'sine', freq: freq / 2, peak: 0.35 * v, decay: len });
}

export function stab(ctx, out, t, freqs, v = 1, len = 0.22) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2400;
  f.connect(out);
  for (const fr of freqs) for (const d of [-6, 6]) tone(ctx, f, t, { type: 'sawtooth', freq: fr, peak: 0.07 * v, decay: len, detune: d });
}

export function lead(ctx, out, t, freq, len, v = 1) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2600;
  f.connect(out);
  tone(ctx, f, t, { type: 'square', freq, peak: 0.12 * v, attack: 0.01, decay: len });
  tone(ctx, f, t, { type: 'triangle', freq: freq * 2, peak: 0.06 * v, attack: 0.01, decay: len });
}

export function riser(ctx, out, t, len, v = 1) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 2;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(6000, t + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25 * v, t + len);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + len + 0.1);
}

export const noteHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
