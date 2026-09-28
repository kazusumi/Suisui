// ノーツの判定とスコア。精密さより「体を動かして気持ちいい」を優先して、判定はゆるめにしている。
import { beatToSec, song } from './chart.js';

export const APPROACH = 1.5; // ノーツが見え始めてから判定位置に着くまで（秒）
const EARLY = 0.38; // これより前は反応しない
const LATE = 0.28; // これを過ぎたら MISS
const PERFECT = 0.14; // ぴったりとみなす幅
const R_HAND = 0.45; // 当たり判定の半径（体の単位＝胴の長さ）
const R_BOTH = 0.55;
const R_FOOT = 0.6;
const R_TRACE = 0.55;
const POSE_WIN = 0.5;

// 足の位置（体の単位）。floorY は準備中に測った足元の高さ
export const stepPos = (foot, floorY) => [foot === 'L' ? -0.85 : 0.85, floorY];

// TRACE の進み具合 p（0〜1）での位置
export function tracePoint(path, p) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    segs.push(l);
    total += l;
  }
  let d = Math.min(Math.max(p, 0), 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? Math.min(d / segs[i], 1) : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * k, path[i][1] + (path[i + 1][1] - path[i][1]) * k];
    }
    d -= segs[i];
  }
  return path[path.length - 1];
}

const near = (p, [x, y], r) => p && Math.hypot(p.x - x, p.y - y) <= r;

export class Game {
  constructor(chart, audio, body) {
    this.chart = chart;
    this.audio = audio;
    this.body = body;
    this.reset();
  }

  reset() {
    this.notes = this.chart.map((n, i) => ({
      ...n,
      id: i,
      time: beatToSec(n.b),
      end: n.type === 'trace' ? beatToSec(n.b + n.dur) : beatToSec(n.b),
      state: 'wait', // wait → done
      judge: null,
      touched: false,
      onTime: 0,
      total: 0,
      lastSynth: -1,
    }));
    this.stats = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0 };
    this.events = []; // 描画用：{ note, judge, at, pos }
    this.traceHeads = new Map(); // 描画用：TRACE で今なぞっている位置
    this.lastT = null;
  }

  get total() {
    return this.notes.length;
  }

  update(t) {
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(0.1, t - this.lastT));
    this.lastT = t;
    for (const n of this.notes) {
      if (n.state === 'done') continue;
      if (t < n.time - EARLY - (n.type === 'pose' ? POSE_WIN : 0)) continue; // まだ先
      if (n.type === 'trace') this.updateTrace(n, t, dt);
      else this.updateTap(n, t);
    }
  }

  // HAND / CROSS / BOTH / STEP / POSE
  updateTap(n, t) {
    const dtime = t - n.time;
    const late = n.type === 'pose' ? POSE_WIN : LATE;
    if (dtime > late) return this.finish(n, n.touched ? 'GOOD' : 'MISS', t);
    const inside = this.check(n);
    if (!inside) return;
    if (Math.abs(dtime) <= PERFECT || (n.type === 'pose' && Math.abs(dtime) <= POSE_WIN * 0.6)) {
      return this.finish(n, 'PERFECT', t);
    }
    if (dtime < 0) n.touched = true; // 早めに届いた：その時刻まで待てば PERFECT
    else this.finish(n, 'GOOD', t);
  }

  updateTrace(n, t, dt) {
    if (t < n.time - 0.1) return;
    if (t > n.end + 0.1) {
      const ratio = n.total ? n.onTime / n.total : 0;
      return this.finish(n, ratio >= 0.6 ? 'PERFECT' : ratio >= 0.3 ? 'GOOD' : 'MISS', t);
    }
    const p = (t - n.time) / (n.end - n.time);
    const head = tracePoint(n.path, p);
    const palm = this.body.joint(n.hand === 'L' ? 'lPalm' : 'rPalm');
    const on = near(palm, head, R_TRACE);
    n.total += dt;
    if (on) n.onTime += dt;
    this.traceHeads.set(n.id, { head, on });
    // なぞっている間は半拍ごとにシンセを鳴らす（自分で演奏している感じ）
    const halfBeat = Math.floor(((t - song.offset) * song.bpm) / 30);
    if (on && halfBeat !== n.lastSynth) {
      n.lastSynth = halfBeat;
      this.audio.sfx(n.sfx);
    }
  }

  check(n) {
    const B = this.body;
    const palm = (h) => B.joint(h === 'L' ? 'lPalm' : 'rPalm');
    switch (n.type) {
      case 'hand':
      case 'cross':
        return near(palm(n.hand), n.pos, R_HAND);
      case 'both':
        return near(palm('L'), n.pos, R_BOTH) && near(palm('R'), n.pos, R_BOTH);
      case 'step': {
        // 足が目標に届くか、腰がその方向へ動いたら OK（足が映っていない時の代わり）
        const target = stepPos(n.foot, B.floorY);
        const sole = B.joint(n.foot === 'L' ? 'lSole' : 'rSole', 0.5);
        const hip = B.joint('hipMid', 0.5);
        const shift = hip && B.hipBase ? hip.x - B.hipBase.x : 0;
        return near(sole, target, R_FOOT) || (n.foot === 'L' ? shift < -0.25 : shift > 0.25);
      }
      case 'pose':
        return checkPose(n.pose, B);
      default:
        return false;
    }
  }

  finish(n, judge, t) {
    n.state = 'done';
    n.judge = judge;
    const s = this.stats;
    if (judge === 'MISS') {
      s.miss++;
      s.combo = 0;
    } else {
      s[judge === 'PERFECT' ? 'perfect' : 'good']++;
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.score += (judge === 'PERFECT' ? 1000 : 500) + Math.min(s.combo, 50) * 10;
      // 早めに取った音は、その拍ぴったりに鳴らす
      if (n.type !== 'trace') this.audio.sfx(n.sfx, t < n.time ? n.time : undefined);
    }
    this.traceHeads.delete(n.id);
    this.events.push({ note: n, judge, at: t });
  }
}

function checkPose(name, B) {
  const l = B.joint('lPalm');
  const r = B.joint('rPalm');
  const head = B.joint('nose');
  const sh = B.joint('shoulderMid', 0.5);
  const hip = B.joint('hipMid', 0.5);
  switch (name) {
    case 'up':
      return l && r && head && l.y > head.y && r.y > head.y;
    case 'spread':
      return l && r && l.x < -1.0 && r.x > 1.0 && Math.abs(l.y) < 0.9 && Math.abs(r.y) < 0.9;
    case 'leanL':
    case 'leanR': {
      // 肩が腰より左右どちらかへ傾いている（腰が見えない時は頭の位置で判断）
      const lean = sh && hip ? sh.x - hip.x : head ? head.x : 0;
      return name === 'leanL' ? lean < -0.25 : lean > 0.25;
    }
    default:
      return false;
  }
}
