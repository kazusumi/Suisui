// 画面の座標変換と、骨格（ランドマーク）から「体の単位」の座標系を作る部分。

// ---- 画面：カメラ映像を鏡にして画面いっぱいに表示する ----
export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.srcW = 1280;
    this.srcH = 720;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layout();
  }

  setSource(w, h) {
    if (w && h && (w !== this.srcW || h !== this.srcH)) {
      this.srcW = w;
      this.srcH = h;
      this.layout();
    }
  }

  // 映像を画面いっぱい（はみ出しはカット）に置く
  layout() {
    this.scale = Math.max(this.W / this.srcW, this.H / this.srcH);
    this.dw = this.srcW * this.scale;
    this.dh = this.srcH * this.scale;
    this.ox = (this.W - this.dw) / 2;
    this.oy = (this.H - this.dh) / 2;
  }

  // 映像の正規化座標（0〜1、左右反転前）→ 画面座標（鏡）
  imgToScreen(nx, ny) {
    return { x: this.W - (this.ox + nx * this.dw), y: this.oy + ny * this.dh };
  }

  screenToImg(x, y) {
    return { x: (this.W - x - this.ox) / this.dw, y: (y - this.oy) / this.dh };
  }

  drawVideo(video) {
    const c = this.ctx;
    c.save();
    c.translate(this.W, 0);
    c.scale(-1, 1);
    c.drawImage(video, this.ox, this.oy, this.dw, this.dh);
    c.restore();
  }
}

// MediaPipe Pose のランドマーク番号（左右は本人から見た左右）
const LM = {
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16, lIndex: 19, rIndex: 20,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28, lFoot: 31, rFoot: 32,
};

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, k) => a + (b - a) * k;

// ---- 体：関節の位置と、体の単位の座標系 ----
export class Body {
  constructor(view) {
    this.view = view;
    this.reset();
  }

  reset() {
    this.frame = null; // { cx, cy, u }：肩の中心（画面px）と 1 単位の長さ（px）
    this.joints = null;
    this.hipBase = null; // サイドステップ判定用：腰の位置のゆっくりした平均（体の単位）
    this.floorY = -2.8; // 足元の高さ（体の単位）。キャリブレーションで決まる
    this.visibleFull = false;
    this.visibleUpper = false;
    this.lastSeen = 0;
  }

  // ランドマーク（映像の正規化座標）から更新。follow は座標系がついていく速さ（秒）
  update(landmarks, dt, follow = 1.2) {
    if (!landmarks) {
      this.joints = null;
      return;
    }
    const S = (i) => {
      const p = landmarks[i];
      const s = this.view.imgToScreen(p.x, p.y);
      return { x: s.x, y: s.y, v: p.visibility ?? 1 };
    };
    const j = {};
    for (const [k, i] of Object.entries(LM)) j[k] = S(i);
    // 手のひら：手首から指先方向に少し伸ばした点
    j.lPalm = { x: lerp(j.lWrist.x, j.lIndex.x, 0.6), y: lerp(j.lWrist.y, j.lIndex.y, 0.6), v: j.lWrist.v };
    j.rPalm = { x: lerp(j.rWrist.x, j.rIndex.x, 0.6), y: lerp(j.rWrist.y, j.rIndex.y, 0.6), v: j.rWrist.v };
    j.lSole = { ...mid(j.lAnkle, j.lFoot), v: j.lAnkle.v };
    j.rSole = { ...mid(j.rAnkle, j.rFoot), v: j.rAnkle.v };
    j.shoulderMid = { ...mid(j.lShoulder, j.rShoulder), v: Math.min(j.lShoulder.v, j.rShoulder.v) };
    j.hipMid = { ...mid(j.lHip, j.rHip), v: Math.min(j.lHip.v, j.rHip.v) };
    this.joints = j;

    const ok = (...names) => names.every((n) => j[n].v > 0.5);
    this.visibleUpper = ok('lShoulder', 'rShoulder', 'nose');
    this.visibleFull = this.visibleUpper && ok('lHip', 'rHip', 'lAnkle', 'rAnkle');
    if (!this.visibleUpper) return;

    // 1 単位 = 胴の長さ（肩の中心〜腰の中心）。腰が見えないときは肩幅から推定
    const torso = ok('lHip', 'rHip') ? dist(j.shoulderMid, j.hipMid) : dist(j.lShoulder, j.rShoulder) * 1.3;
    const u = Math.max(torso, this.view.H * 0.06);
    const k = this.frame ? 1 - Math.exp(-dt / follow) : 1;
    this.frame = this.frame
      ? { cx: lerp(this.frame.cx, j.shoulderMid.x, k), cy: lerp(this.frame.cy, j.shoulderMid.y, k), u: lerp(this.frame.u, u, k) }
      : { cx: j.shoulderMid.x, cy: j.shoulderMid.y, u };
    const hip = this.toBody(j.hipMid);
    const kh = this.hipBase ? 1 - Math.exp(-dt / 1.5) : 1;
    this.hipBase = this.hipBase ? { x: lerp(this.hipBase.x, hip.x, kh), y: lerp(this.hipBase.y, hip.y, kh) } : hip;
  }

  // 準備中に足元の高さを覚える
  calibrate() {
    const j = this.joints;
    if (j && this.frame && j.lAnkle.v > 0.5 && j.rAnkle.v > 0.5) {
      this.floorY = (this.toBody(j.lSole).y + this.toBody(j.rSole).y) / 2;
    }
  }

  toBody(p) {
    const f = this.frame;
    return { x: (p.x - f.cx) / f.u, y: (f.cy - p.y) / f.u };
  }

  toScreen([x, y]) {
    const f = this.frame;
    return { x: f.cx + x * f.u, y: f.cy - y * f.u };
  }

  // 関節の位置（体の単位）。見えていなければ null
  joint(name, minVis = 0.3) {
    const p = this.joints?.[name];
    if (!p || !this.frame || p.v < minVis) return null;
    return this.toBody(p);
  }
}
