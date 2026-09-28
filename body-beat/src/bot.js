// 自動で遊ぶ仮想ダンサー（?bot で起動）。カメラなしで最後まで遊べるかの確認と、
// 「譜面どおりに動くと踊って見えるか」を見るために使う。骨格認識と同じ形のランドマークを作る。
import { beatToSec, song } from './chart.js';
import { tracePoint, stepPos } from './game.js';

const REST = { L: [-0.55, -0.95], R: [0.55, -0.95], FL: [-0.3, -2.8], FR: [0.3, -2.8] };
const smooth = (k) => k * k * (3 - 2 * k);
const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

export function createBot(view, chart, { sloppy = true, mouse = false } = {}) {
  // 手足ごとの「この時刻にここ」の一覧（キーフレーム）
  const tracks = { L: [], R: [], FL: [], FR: [], lean: [] };
  const jitter = () => (sloppy ? (Math.random() - 0.5) * 0.14 : 0);
  const key = (limb, t, pos) => tracks[limb].push({ t: t + (sloppy ? (Math.random() - 0.5) * 0.12 : 0), pos: [pos[0] + jitter(), pos[1] + jitter()] });
  for (const n of chart) {
    const t = beatToSec(n.b);
    if (n.type === 'hand' || n.type === 'cross') key(n.hand, t, n.pos);
    else if (n.type === 'both') { key('L', t, [n.pos[0] - 0.12, n.pos[1]]); key('R', t, [n.pos[0] + 0.12, n.pos[1]]); }
    else if (n.type === 'step') {
      const f = n.foot === 'L' ? 'FL' : 'FR';
      key(f, t, stepPos(n.foot, -2.8));
      tracks.lean.push({ t, pos: [n.foot === 'L' ? -0.3 : 0.3, 0] });
    } else if (n.type === 'trace') {
      const end = beatToSec(n.b + n.dur);
      for (let s = t; s <= end + 0.001; s += 0.08) tracks[n.hand].push({ t: s, pos: tracePoint(n.path, (s - t) / (end - t)) });
    } else if (n.type === 'pose') {
      const P = { up: [[-0.45, 1.55], [0.45, 1.55]], spread: [[-1.5, 0.25], [1.5, 0.25]], leanL: [[-1.2, 0.9], [0.2, 0.9]], leanR: [[-0.2, 0.9], [1.2, 0.9]] }[n.pose];
      key('L', t, P[0]);
      key('R', t, P[1]);
      if (n.pose.startsWith('lean')) tracks.lean.push({ t, pos: [n.pose === 'leanL' ? -0.5 : 0.5, 0] });
    }
  }
  for (const k of Object.keys(tracks)) tracks[k].sort((a, b) => a.t - b.t);

  // 時刻 t での位置：前後のキーフレームの間をなめらかに動き、しばらく何もなければ休みの姿勢へ戻る
  function pos(limb, t, rest) {
    const tr = tracks[limb];
    let i = tr.findIndex((k) => k.t > t);
    if (i === -1) i = tr.length;
    const prev = tr[i - 1];
    const next = tr[i];
    const HOLD = 0.12;
    const MOVE = 0.55;
    if (prev && t - prev.t <= HOLD) return prev.pos;
    const from = prev && (!next || next.t - prev.t < 1.3) ? { t: prev.t + HOLD, pos: prev.pos } : null;
    if (next && next.t - t <= MOVE) {
      const start = from && from.t > next.t - MOVE ? from : { t: next.t - MOVE, pos: from?.pos ?? rest };
      return lerp2(start.pos, next.pos, smooth(Math.min(1, (t - start.t) / (next.t - start.t))));
    }
    if (from && next && next.t - prev.t < 1.3) return from.pos;
    if (prev && t - prev.t < HOLD + 0.5) return lerp2(prev.pos, rest, smooth((t - prev.t - HOLD) / 0.5));
    return rest;
  }

  let mouseAt = null;
  if (mouse) {
    window.addEventListener('pointermove', (e) => (mouseAt = { x: e.clientX, y: e.clientY }));
  }

  // 仮想の体の置き場所：画面の中央、肩が上から 30%、1 単位 = 画面の高さの 16%
  const frame = () => ({ cx: view.W / 2, cy: view.H * 0.3, u: view.H * 0.16 });
  const toImg = (p) => {
    const f = frame();
    const s = view.screenToImg(f.cx + p[0] * f.u, f.cy - p[1] * f.u);
    return { x: s.x, y: s.y, visibility: 0.99 };
  };

  return {
    landmarks(t) {
      const beat = Math.sin(t * Math.PI * 2 * (song.bpm / 60)) * 0.04; // 拍に合わせて軽く上下
      const lean = pos('lean', t, [0, 0])[0];
      let R = pos('R', t, REST.R);
      if (mouseAt) {
        const f = frame();
        R = [(mouseAt.x - f.cx) / f.u, (f.cy - mouseAt.y) / f.u];
      }
      const L = pos('L', t, REST.L);
      const FL = pos('FL', t, REST.FL);
      const FR = pos('FR', t, REST.FR);
      const hipX = (FL[0] + FR[0]) / 2 * 0.6 + lean * 0.3;
      const sh = [lean * 0.9, beat];
      const lS = [sh[0] - 0.4, sh[1]];
      const rS = [sh[0] + 0.4, sh[1]];
      const elbow = (s, p, side) => [(s[0] + p[0]) / 2 + side * 0.18, (s[1] + p[1]) / 2 - 0.1];
      const lm = Array.from({ length: 33 }, () => toImg([sh[0], sh[1] + 0.55]));
      const set = (i, p) => (lm[i] = toImg(p));
      set(0, [sh[0], sh[1] + 0.55]);
      set(11, lS); set(12, rS);
      set(13, elbow(lS, L, -1)); set(14, elbow(rS, R, 1));
      set(15, [L[0], L[1] - 0.08]); set(16, [R[0], R[1] - 0.08]);
      set(19, [L[0], L[1] + 0.05]); set(20, [R[0], R[1] + 0.05]);
      set(17, L); set(18, R);
      set(23, [hipX - 0.25, -1 + beat]); set(24, [hipX + 0.25, -1 + beat]);
      set(25, [(hipX - 0.25 + FL[0]) / 2 - 0.05, -1.9]); set(26, [(hipX + 0.25 + FR[0]) / 2 + 0.05, -1.9]);
      set(27, FL); set(28, FR);
      set(29, [FL[0], FL[1] - 0.05]); set(30, [FR[0], FR[1] - 0.05]);
      set(31, [FL[0] - 0.12, FL[1] - 0.08]); set(32, [FR[0] + 0.12, FR[1] - 0.08]);
      return lm;
    },
  };
}
