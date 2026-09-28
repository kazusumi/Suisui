// 描画：ノーツ、TRACE、ヒット演出、スコア表示、デバッグ用の骨格。
import { APPROACH, stepPos, tracePoint } from './game.js';

const COLOR = { L: '#22d3ee', R: '#f472b6', both: '#facc15', foot: '#4ade80', pose: '#ffffff' };
const JUDGE_COLOR = { PERFECT: '#fde047', GOOD: '#67e8f9', MISS: '#94a3b8' };

export class Renderer {
  constructor(view, body, game) {
    this.view = view;
    this.body = body;
    this.game = game;
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.flash = 0;
    this.shake = 0;
    this.comboPulse = 0;
  }

  reset() {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.flash = 0;
  }

  // ノーツの判定位置（画面座標）
  notePos(n) {
    const B = this.body;
    if (n.type === 'step') return B.toScreen(stepPos(n.foot, B.floorY));
    if (n.type === 'pose') return { x: this.view.W / 2, y: Math.max(90, B.toScreen([0, 2.1]).y) };
    if (n.type === 'trace') return B.toScreen(n.path[0]);
    return B.toScreen(n.pos);
  }

  draw(t, dt, { debug = false } = {}) {
    const c = this.view.ctx;
    const B = this.body;
    if (!B.frame) return;
    const u = B.frame.u;

    // ヒットの知らせを受け取って演出を出す
    for (const ev of this.game.events.splice(0)) this.spawnHit(ev, u);

    c.save();
    if (this.shake > 0) {
      c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake = Math.max(0, this.shake - dt * 60);
    }

    // 遠い順（あとに来るノーツが奥）に描く
    const upcoming = this.game.notes.filter(
      (n) => n.state !== 'done' && t >= n.time - APPROACH && t <= n.end + 0.3,
    );
    for (let i = upcoming.length - 1; i >= 0; i--) this.drawNote(upcoming[i], t, u);

    this.drawEffects(dt, u);
    c.restore();

    if (this.flash > 0) {
      c.fillStyle = `rgba(255,255,255,${this.flash})`;
      c.fillRect(0, 0, this.view.W, this.view.H);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }
    if (debug) this.drawSkeleton();
  }

  drawNote(n, t, u) {
    const c = this.view.ctx;
    const remain = Math.max(0, n.time - t);
    const k = remain / APPROACH; // 1 → 0 で近づく
    const alpha = Math.min(1, (APPROACH - remain) / 0.3);
    const target = this.notePos(n);
    if (n.type === 'trace') return this.drawTrace(n, t, u, alpha);

    // 体の中心から外側に離れた所から、判定位置へ飛んでくる
    const center = n.type === 'pose' ? { x: this.view.W / 2, y: -u } : this.body.toScreen([0, -0.5]);
    let dx = target.x - center.x;
    let dy = target.y - center.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const travel = u * 1.3 * k * k;
    const p = { x: target.x + dx * travel, y: target.y + dy * travel };
    const big = n.type === 'both' ? 1.25 : n.type === 'pose' ? 1.4 : 1;
    const r = u * 0.36 * big * (0.6 + 0.4 * (1 - k));
    const color = this.noteColor(n);

    c.save();
    c.globalAlpha = alpha;
    // CROSS：使う手の肩から点線を引いて「反対の手で」を示す
    if (n.type === 'cross') {
      const shoulder = this.body.joints?.[n.hand === 'L' ? 'lShoulder' : 'rShoulder'];
      if (shoulder) {
        c.setLineDash([u * 0.12, u * 0.1]);
        c.strokeStyle = color;
        c.globalAlpha = alpha * 0.55;
        c.lineWidth = u * 0.05;
        c.beginPath();
        c.moveTo(shoulder.x, shoulder.y);
        c.quadraticCurveTo((shoulder.x + p.x) / 2, Math.min(shoulder.y, p.y) - u * 0.4, p.x, p.y);
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = alpha;
      }
    }
    // 縮んでくる輪：この輪が本体に重なった瞬間がタイミング
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, u * 0.035);
    c.beginPath();
    c.arc(p.x, p.y, r * (1 + k * 1.6), 0, Math.PI * 2);
    c.stroke();

    if (n.type === 'step') {
      c.fillStyle = hexA(color, 0.35);
      c.beginPath();
      c.ellipse(p.x, p.y, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = color;
      c.stroke();
      emoji(c, '👣', p.x, p.y, r * 0.9);
    } else if (n.type === 'pose') {
      disc(c, p.x, p.y, r, 'rgba(15,23,42,0.55)', '#ffffff');
      drawPoseIcon(c, n.pose, p.x, p.y, r * 0.8);
    } else {
      disc(c, p.x, p.y, r, hexA(color, 0.55), '#ffffff');
      if (n.type === 'both') emoji(c, '👏', p.x, p.y, r * 1.1);
      else emoji(c, '✋', p.x, p.y, r * 1.05, n.hand === 'L');
      if (n.type === 'cross') {
        c.setLineDash([r * 0.25, r * 0.18]);
        c.strokeStyle = color;
        c.lineWidth = r * 0.12;
        c.beginPath();
        c.arc(p.x, p.y, r * 1.22, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }
    }
    c.restore();
  }

  drawTrace(n, t, u, alpha) {
    const c = this.view.ctx;
    const B = this.body;
    const color = COLOR[n.hand];
    const pts = [];
    for (let i = 0; i <= 40; i++) pts.push(B.toScreen(tracePoint(n.path, i / 40)));
    const active = t >= n.time;
    const prog = Math.max(0, Math.min(1, (t - n.time) / (n.end - n.time)));

    c.save();
    c.globalAlpha = alpha;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // 道筋（光る太い線）
    c.strokeStyle = hexA(color, 0.28);
    c.lineWidth = u * 0.42;
    polyline(c, pts);
    c.strokeStyle = hexA(color, 0.85);
    c.lineWidth = u * 0.07;
    polyline(c, pts);
    // 進む向きの矢印
    c.fillStyle = '#ffffff';
    for (let i = 5; i < 40; i += 7) arrowhead(c, pts[i - 1], pts[i + 1] ?? pts[i], u * 0.1);
    // なぞり終わった部分は明るく
    if (active) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = u * 0.12;
      polyline(c, pts.slice(0, Math.max(2, Math.round(prog * 40) + 1)));
    }
    // 先頭の玉
    const head = B.toScreen(tracePoint(n.path, prog));
    const on = this.game.traceHeads.get(n.id)?.on;
    const r = u * 0.3 * (on ? 1.25 : 1);
    if (!active) {
      const k = Math.max(0, n.time - t) / APPROACH;
      c.strokeStyle = color;
      c.lineWidth = Math.max(2, u * 0.035);
      c.beginPath();
      c.arc(head.x, head.y, r * (1 + k * 1.6), 0, Math.PI * 2);
      c.stroke();
    }
    if (on) {
      c.shadowColor = color;
      c.shadowBlur = u * 0.6;
      if (Math.random() < 0.6) this.particles.push(particle(head.x, head.y, color, u * 0.8));
    }
    disc(c, head.x, head.y, r, color, '#ffffff');
    c.shadowBlur = 0;
    emoji(c, '✋', head.x, head.y, r * 1.0, n.hand === 'L');
    c.restore();
  }

  noteColor(n) {
    if (n.type === 'both') return COLOR.both;
    if (n.type === 'step') return COLOR.foot;
    if (n.type === 'pose') return COLOR.pose;
    return COLOR[n.hand];
  }

  spawnHit(ev, u) {
    const n = ev.note;
    const p = n.type === 'trace' ? this.body.toScreen(n.path[n.path.length - 1]) : this.notePos(n);
    const color = ev.judge === 'MISS' ? '#64748b' : this.noteColor(n);
    this.texts.push({ x: p.x, y: p.y - u * 0.5, text: ev.judge, color: JUDGE_COLOR[ev.judge], life: 0.8, size: u * (ev.judge === 'PERFECT' ? 0.42 : 0.34) });
    if (ev.judge === 'MISS') return;
    const count = n.type === 'both' || n.type === 'pose' ? 46 : 26;
    for (let i = 0; i < count; i++) this.particles.push(particle(p.x, p.y, i % 3 ? color : '#ffffff', u * (ev.judge === 'PERFECT' ? 3.2 : 2.2)));
    this.rings.push({ x: p.x, y: p.y, r: u * 0.3, life: 0.45, color });
    if (n.type === 'both' || n.type === 'pose') {
      this.flash = 0.28;
      this.shake = 10;
    } else {
      this.flash = Math.max(this.flash, 0.06);
    }
    this.comboPulse = 1;
  }

  drawEffects(dt, u) {
    const c = this.view.ctx;
    for (const q of this.particles) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += u * 4 * dt;
      q.life -= dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0).slice(-600);
    for (const q of this.particles) {
      c.globalAlpha = Math.max(0, q.life / q.max);
      c.fillStyle = q.color;
      c.beginPath();
      c.arc(q.x, q.y, q.size, 0, Math.PI * 2);
      c.fill();
    }
    for (const g of this.rings) {
      g.life -= dt;
      g.r += u * 4 * dt;
      c.globalAlpha = Math.max(0, g.life / 0.45);
      c.strokeStyle = g.color;
      c.lineWidth = u * 0.08;
      c.beginPath();
      c.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      c.stroke();
    }
    this.rings = this.rings.filter((g) => g.life > 0);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const x of this.texts) {
      x.life -= dt;
      x.y -= u * 0.6 * dt;
      c.globalAlpha = Math.max(0, Math.min(1, x.life / 0.3));
      c.font = `900 italic ${x.size}px system-ui, sans-serif`;
      c.lineWidth = x.size * 0.14;
      c.strokeStyle = 'rgba(15,23,42,0.85)';
      c.strokeText(x.text, x.x, x.y);
      c.fillStyle = x.color;
      c.fillText(x.text, x.x, x.y);
    }
    this.texts = this.texts.filter((x) => x.life > 0);
    c.globalAlpha = 1;
  }

  drawHud(t, duration) {
    const c = this.view.ctx;
    const { W } = this.view;
    const s = this.game.stats;
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(0, 0, W, 4);
    c.fillStyle = '#f472b6';
    c.fillRect(0, 0, W * Math.max(0, Math.min(1, t / duration)), 4);
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.font = '800 22px system-ui, sans-serif';
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(15,23,42,0.7)';
    const score = String(s.score).padStart(7, '0');
    c.strokeText(score, 16, 16);
    c.fillStyle = '#fff';
    c.fillText(score, 16, 16);
    if (s.combo >= 3) {
      this.comboPulse = Math.max(0, this.comboPulse - 0.08);
      const size = 42 * (1 + this.comboPulse * 0.25);
      c.textAlign = 'center';
      c.font = `900 italic ${size}px system-ui, sans-serif`;
      c.strokeText(`${s.combo}`, W / 2, 14);
      c.fillStyle = '#fde047';
      c.fillText(`${s.combo}`, W / 2, 14);
      c.font = '800 13px system-ui, sans-serif';
      c.fillStyle = '#fff';
      c.fillText('COMBO', W / 2, 14 + size);
    }
  }

  // デバッグ用：骨格と判定範囲
  drawSkeleton() {
    const j = this.body.joints;
    if (!j) return;
    const c = this.view.ctx;
    const bones = [['lShoulder', 'rShoulder'], ['lShoulder', 'lElbow'], ['lElbow', 'lWrist'], ['rShoulder', 'rElbow'], ['rElbow', 'rWrist'], ['lShoulder', 'lHip'], ['rShoulder', 'rHip'], ['lHip', 'rHip'], ['lHip', 'lKnee'], ['lKnee', 'lAnkle'], ['rHip', 'rKnee'], ['rKnee', 'rAnkle']];
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 3;
    for (const [a, b] of bones) {
      c.beginPath();
      c.moveTo(j[a].x, j[a].y);
      c.lineTo(j[b].x, j[b].y);
      c.stroke();
    }
    for (const [name, col] of [['lPalm', COLOR.L], ['rPalm', COLOR.R], ['lSole', COLOR.foot], ['rSole', COLOR.foot], ['nose', '#fff']]) {
      c.fillStyle = col;
      c.beginPath();
      c.arc(j[name].x, j[name].y, 8, 0, Math.PI * 2);
      c.fill();
    }
  }
}

// ---- 小さな描画の道具 ----
function particle(x, y, color, speed) {
  const a = Math.random() * Math.PI * 2;
  const v = speed * (0.3 + Math.random() * 0.7);
  const life = 0.4 + Math.random() * 0.4;
  return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, life, max: life, size: 2 + Math.random() * 4 };
}

function disc(c, x, y, r, fill, stroke) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = Math.max(2, r * 0.1);
  c.strokeStyle = stroke;
  c.stroke();
}

function emoji(c, ch, x, y, size, flip = false) {
  c.save();
  c.translate(x, y);
  if (flip) c.scale(-1, 1);
  c.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(ch, 0, size * 0.05);
  c.restore();
}

function polyline(c, pts) {
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) c.lineTo(p.x, p.y);
  c.stroke();
}

function arrowhead(c, a, b, s) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  c.save();
  c.translate(b.x, b.y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(s, 0);
  c.lineTo(-s * 0.7, s * 0.7);
  c.lineTo(-s * 0.7, -s * 0.7);
  c.closePath();
  c.fill();
  c.restore();
}

// POSE のアイコン（棒人間）
function drawPoseIcon(c, pose, x, y, s) {
  const lean = pose === 'leanL' ? -0.35 : pose === 'leanR' ? 0.35 : 0;
  const arms = {
    up: [[-0.45, -1.0], [0.45, -1.0]],
    spread: [[-1.0, -0.3], [1.0, -0.3]],
    leanL: [[-0.9, -0.75], [0.25, -0.75]],
    leanR: [[-0.25, -0.75], [0.9, -0.75]],
  }[pose] ?? [[-0.5, 0.2], [0.5, 0.2]];
  const P = (px, py) => [x + px * s * 0.5, y + py * s * 0.5];
  const sh = P(lean, -0.25);
  const hip = P(0, 0.45);
  c.strokeStyle = '#fff';
  c.lineWidth = s * 0.14;
  c.lineCap = 'round';
  const line = (a, b) => { c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); };
  line(sh, hip);
  line(sh, P(lean + arms[0][0], arms[0][1] - 0.25));
  line(sh, P(lean + arms[1][0], arms[1][1] - 0.25));
  line(hip, P(-0.35, 1.05));
  line(hip, P(0.35, 1.05));
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(...P(lean * 1.2, -0.6), s * 0.16, 0, Math.PI * 2);
  c.fill();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
