// Top-down map of the town: water depth, roads, buildings, the tour route,
// landmark markers and an arrow for where you are / which way you face.
import { terrainHeight } from './world/terrain.js';
import { LANDMARKS } from './tour.js';

const B = { x0: -135, x1: 135, z0: -245, z1: 150 }; // z0 is drawn at the top
const BG_W = 540;
const BG_H = Math.round((BG_W * (B.z1 - B.z0)) / (B.x1 - B.x0));

export class Minimap {
  constructor(canvas, city, tour) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.big = false;
    this.bg = this.renderBackground(city, tour);
    canvas.addEventListener('click', (e) => {
      e.stopPropagation();
      this.big = !this.big;
      canvas.classList.toggle('big', this.big);
      this.resize();
    });
    canvas.addEventListener('touchend', (e) => e.stopPropagation());
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(this.w * dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toMap(x, z, w, h) {
    return [((x - B.x0) / (B.x1 - B.x0)) * w, ((z - B.z0) / (B.z1 - B.z0)) * h];
  }

  renderBackground(city, tour) {
    const cv = document.createElement('canvas');
    cv.width = BG_W;
    cv.height = BG_H;
    const g = cv.getContext('2d');
    // water depth / land
    const img = g.createImageData(BG_W, BG_H);
    for (let j = 0; j < BG_H; j++) {
      const z = B.z0 + ((j + 0.5) / BG_H) * (B.z1 - B.z0);
      for (let i = 0; i < BG_W; i++) {
        const x = B.x0 + ((i + 0.5) / BG_W) * (B.x1 - B.x0);
        const h = terrainHeight(x, z);
        let r, gg, b;
        if (h > -0.3) [r, gg, b] = [96, 138, 82];
        else {
          const d = Math.min(-h / 22, 1);
          r = 38 - d * 30;
          gg = 128 - d * 88;
          b = 138 - d * 62;
        }
        const k = (j * BG_W + i) * 4;
        img.data[k] = r;
        img.data[k + 1] = gg;
        img.data[k + 2] = b;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const P = (x, z) => this.toMap(x, z, BG_W, BG_H);
    // roads
    g.fillStyle = 'rgba(190, 200, 205, 0.35)';
    for (const [x0, x1, z0, z1] of city.roadRects) {
      const [a, b] = P(x0, z0);
      const [c, d] = P(x1, z1);
      g.fillRect(a, b, c - a, d - b);
    }
    // buildings (anything with a real footprint)
    for (const c of city.colliders) {
      const w = c.maxX - c.minX;
      const d = c.maxZ - c.minZ;
      if (w < 2.5 || d < 2.5 || c.maxY - c.minY < 3) continue;
      const [a, b] = P(c.minX, c.minZ);
      const [e, f] = P(c.maxX, c.maxZ);
      g.fillStyle = c.maxY > 0 ? 'rgba(236, 214, 186, 0.85)' : 'rgba(150, 190, 190, 0.55)';
      g.fillRect(a, b, e - a, f - b);
    }
    // route
    g.strokeStyle = 'rgba(255, 190, 120, 0.9)';
    g.lineWidth = 2.2;
    g.setLineDash([7, 6]);
    g.beginPath();
    for (let i = 0; i <= tour.N; i += 4) {
      const k = i % tour.N;
      const [x, y] = P(tour.xs[k], tour.zs[k]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
    g.setLineDash([]);
    return cv;
  }

  draw(camera, route) {
    // follow CSS size changes (initially hidden HUD, enlarge animation, rotation)
    if (this.canvas.clientWidth !== Math.round(this.w || 0) || this.canvas.clientHeight !== Math.round(this.h || 0)) this.resize();
    const g = this.ctx;
    const { w, h } = this;
    if (!w || !h) return;
    g.clearRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.roundRect ? g.roundRect(0, 0, w, h, 12) : g.rect(0, 0, w, h);
    g.clip();
    g.drawImage(this.bg, 0, 0, w, h);

    // landmarks
    const big = this.big;
    g.font = `600 ${big ? 12 : 10}px "Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif`;
    g.textBaseline = 'middle';
    for (const lm of LANDMARKS) {
      const [x, y] = this.toMap(lm.x, lm.z, w, h);
      const r = big ? 6 : 4;
      g.beginPath();
      g.arc(x, y, r + 2, 0, Math.PI * 2);
      g.fillStyle = 'rgba(10, 16, 24, 0.75)';
      g.fill();
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = lm.color;
      g.fill();
      if (big) {
        const tw = g.measureText(lm.name).width;
        const left = lm.left ? x - tw - 14 > 0 : x + tw + 14 > w;
        const tx = left ? x - r - 6 - tw : x + r + 6;
        g.fillStyle = 'rgba(10, 16, 24, 0.6)';
        g.fillRect(tx - 3, y - 8, tw + 6, 16);
        g.fillStyle = '#fff';
        g.fillText(lm.name, tx, y);
      }
    }

    // you are here
    const p = camera.position;
    const [px, py] = this.toMap(p.x, p.z, w, h);
    camera.getWorldDirection(this._dir || (this._dir = p.clone()));
    const a = Math.atan2(this._dir.x, -this._dir.z);
    g.translate(px, py);
    g.rotate(a);
    const s = big ? 1.4 : 1;
    g.beginPath();
    g.moveTo(0, -9 * s);
    g.lineTo(6 * s, 7 * s);
    g.lineTo(0, 3.5 * s);
    g.lineTo(-6 * s, 7 * s);
    g.closePath();
    g.fillStyle = route ? '#ffcf8a' : '#ffffff';
    g.strokeStyle = 'rgba(10, 16, 24, 0.9)';
    g.lineWidth = 2;
    g.stroke();
    g.fill();
    g.restore();
  }
}
