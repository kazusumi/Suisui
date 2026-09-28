// 曲の再生と効果音。ゲームの時計は「曲の再生位置」を基準にする（映像と音がずれないように）。
import * as I from './instruments.js';
import { song } from './chart.js';
import { buildTempSong } from './tempSong.js';

// 曲の準備はページを開いた時点で裏で始める（カメラの準備や全身の確認をしている間に終わらせる）
let songPromise = null;
export function preloadSong() {
  songPromise ??= (async () => {
    if (song.url) {
      const res = await fetch(song.url);
      if (!res.ok) throw new Error(`曲を読み込めません（${res.status}）`);
      const data = await res.arrayBuffer();
      // 再生用の AudioContext はユーザー操作の後にしか作れないので、読み込みは Offline で行う
      return new OfflineAudioContext(2, 1, 44100).decodeAudioData(data);
    }
    return buildTempSong();
  })().catch((e) => {
    songPromise = null;
    throw e;
  });
  return songPromise;
}

export class GameAudio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.85;
    this.music.connect(this.master);
    this.fx = this.ctx.createGain();
    this.fx.gain.value = 0.9;
    this.fx.connect(this.master);
    this.buffer = null;
    this.source = null;
    this.startAt = 0;
  }

  async unlock() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async loadSong() {
    this.buffer ??= await preloadSong();
    return this.buffer;
  }

  get duration() {
    return this.buffer?.duration ?? 0;
  }

  play(onEnded) {
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.music);
    this.startAt = this.ctx.currentTime + 0.12;
    src.start(this.startAt);
    src.onended = () => this.source === src && onEnded?.();
    this.source = src;
  }

  stop() {
    if (this.source) {
      this.source.onended = null;
      try { this.source.stop(); } catch { /* 既に止まっている */ }
      this.source = null;
    }
  }

  // 今聞こえている曲の位置（秒）。出力の遅れも差し引く
  get time() {
    if (!this.source) return -1;
    return this.ctx.currentTime - this.startAt - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
  }

  // 曲の time 秒の位置に当たる、AudioContext 上の時刻
  ctxTimeAt(songTime) {
    return this.startAt + songTime + (this.ctx.outputLatency || this.ctx.baseLatency || 0);
  }

  // 効果音。at（曲の秒）が未来なら、その拍ぴったりに鳴らす（早めに取ったときも音楽に合う）
  sfx(name, at) {
    const now = this.ctx.currentTime;
    const t = at !== undefined ? Math.max(now + 0.005, this.ctxTimeAt(at)) : now + 0.005;
    const o = this.fx;
    const c = this.ctx;
    switch (name) {
      case 'clap': return I.clap(c, o, t);
      case 'snare': return I.snare(c, o, t);
      case 'kick': return I.kick(c, o, t);
      case 'perc': return I.perc(c, o, t);
      case 'bell': return I.bell(c, o, t);
      case 'crash': return I.crash(c, o, t);
      case 'synth': return I.synth(c, o, t, 0.8, 587 * 2 ** (Math.floor(Math.random() * 5) * 2 / 12));
      case 'finale':
        I.crash(c, o, t, 1.2);
        for (const [i, f] of [587, 740, 880, 1175].entries()) I.bell(c, o, t + i * 0.06, 0.8, f);
        return;
      case 'miss': return I.perc(c, o, t, 0.15);
      case 'count': return I.bell(c, o, t, 0.6, 880);
      case 'go': return I.bell(c, o, t, 0.9, 1760);
      default: return I.clap(c, o, t);
    }
  }
}
