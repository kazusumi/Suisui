// Canvas-generated sign atlas + a merged mesh of sign quads.
import * as THREE from 'three';
import { patchMaterial } from './patchMaterial.js';

const FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",system-ui,sans-serif';
const FONT_M = '"Hiragino Mincho ProN","Noto Serif JP","Yu Mincho",serif';

// Atlas 1024x2048. Horizontal cells: 4 cols x 16 rows of 256x96 (top 1536px).
// Vertical cells: 2 rows of 16 cells, 64x256 each (bottom 512px).
const ATLAS_H = 2048;
const V_Y0 = 1536;
export const H_SIGNS = [
  { t: 'しおさい珈琲', bg: '#2b1a12', fg: '#ffcf8a', neon: true },
  { t: 'BOOKS 波音', bg: '#f1ead8', fg: '#1d3b52' },
  { t: 'ラーメン 凪', bg: '#b3261e', fg: '#fff4d6' },
  { t: 'HOTEL MARINA', bg: '#10141f', fg: '#5ff2ff', neon: true },
  { t: 'くすり', bg: '#1f5fbf', fg: '#ffffff' },
  { t: '喫茶 灯台', bg: '#10110f', fg: '#ff7ab8', neon: true },
  { t: 'BAKERY', bg: '#f7d9a8', fg: '#6b3a1a' },
  { t: '青果 みなと', bg: '#2f6b33', fg: '#fff7c2' },
  { t: 'CINEMA', bg: '#140a1c', fg: '#ffd84a', neon: true },
  { t: 'LAUNDRY', bg: '#dff2f7', fg: '#1a6c85' },
  { t: '寿司 汐', bg: '#f5efe2', fg: '#1b1b1b', mincho: true },
  { t: '居酒屋 潮', bg: '#120d0a', fg: '#ff9a3c', neon: true },
  { t: 'PHOTO', bg: '#e8e8e8', fg: '#d6362b' },
  { t: 'FLOWER', bg: '#f3c6d3', fg: '#6b2141' },
  { t: 'KARAOKE', bg: '#0b0a1a', fg: '#b36bff', neon: true },
  { t: 'ゆ', bg: '#1d4a8f', fg: '#ffffff', big: true },
  { t: 'しおかぜ商店街', bg: '#101a22', fg: '#9ff7e8', neon: true },
  { t: 'OPEN', bg: '#0c0c0c', fg: '#ff4d6d', neon: true },
  { t: 'CLOCK', clock: true },
  { t: 'SUISUI', bg: '#07121c', fg: '#6fe7ff', neon: true, wide: true },
  { t: '海風ビル', bg: '#d9d4c7', fg: '#2d3a45' },
  { t: 'PARKING', bg: '#1f4fa8', fg: '#ffffff' },
  { t: 'ATM', bg: '#0f6b3f', fg: '#ffffff' },
  { t: '止まれ', bg: '#c8261e', fg: '#ffffff' },
  { t: 'DIVE BAR', bg: '#06151a', fg: '#29ffc6', neon: true },
  { t: 'BUS', bg: '#f0f0f0', fg: '#1e5aa8' },
  { t: '旅館 波の音', bg: '#231b14', fg: '#ffd59a', neon: true, mincho: true },
  { t: 'ICE CREAM', bg: '#ffe3ef', fg: '#e23d7a' },
  { t: 'ARCADE', bg: '#10061a', fg: '#ff5cf0', neon: true },
  { t: '潮見台', bg: '#28323a', fg: '#e8eef0' },
  { t: 'NO SWIMMING', bg: '#f4d03f', fg: '#1a1a1a' },
  { t: 'SEA SIDE', bg: '#0a1826', fg: '#ffb86b', neon: true },
  // 32-
  { t: 'しおかぜマート', mart: true },
  { t: '牛丼 なみ屋', bg: '#f28a1d', fg: '#ffffff' },
  { t: '八百屋 みどり', bg: '#1f5a2a', fg: '#fff6b8' },
  { t: '書店 波音堂', bg: '#1e3550', fg: '#f3ead2', mincho: true },
  { t: 'SUISUI LAND', bg: '#1a0b24', fg: '#ff8fd8', neon: true },
  { t: 'チケット', bg: '#f7e2a8', fg: '#b3341e' },
  { t: '24H OPEN', bg: '#0d1a14', fg: '#5dffa8', neon: true },
  { t: 'うまい・はやい', bg: '#fff3dc', fg: '#d9641a' },
  { t: '本日特売', bg: '#d8261e', fg: '#fff6c8' },
  { t: '古本 買取', bg: '#f1e6cc', fg: '#3a2a1a', mincho: true },
  { t: 'MERRY GO ROUND', bg: '#240b1e', fg: '#ffd36b', neon: true },
  { t: 'COFFEE CUPS', bg: '#0b1a24', fg: '#7fe8ff', neon: true },
  { t: 'しおかぜ台', bg: '#f2f2f2', fg: '#1e5aa8' },
  { t: '郵便', bg: '#d42a1e', fg: '#ffffff' },
  { t: '公衆電話', bg: '#e8e8e0', fg: '#2a6b3a' },
  { t: 'たまご・とうふ', bg: '#fff8e0', fg: '#8a4a12' },
];

export const V_SIGNS = [
  { t: '旅館', bg: '#1b120c', fg: '#ffcf8a', neon: true },
  { t: 'たばこ', bg: '#c62d24', fg: '#ffffff' },
  { t: 'スナック', bg: '#12091a', fg: '#ff6fd8', neon: true },
  { t: 'ホテル', bg: '#0b1420', fg: '#6ff3ff', neon: true },
  { t: '書店', bg: '#efe6cf', fg: '#233b52' },
  { t: '中華', bg: '#b4201c', fg: '#ffe16b' },
  { t: '理容', bg: '#f2f2f2', fg: '#1e3f8a' },
  { t: 'カラオケ', bg: '#0e0718', fg: '#ffd84a', neon: true },
  { t: '喫茶', bg: '#2a1b10', fg: '#ff9d5c', neon: true },
  { t: '寿司', bg: '#f5efe2', fg: '#111111' },
  { t: '焼肉', bg: '#101010', fg: '#ff5a3c', neon: true },
  { t: '薬局', bg: '#1f5fbf', fg: '#ffffff' },
  { t: '酒', bg: '#0e1a12', fg: '#7dffb0', neon: true },
  { t: '質', bg: '#1d1d1d', fg: '#ffffff' },
  { t: '銭湯', bg: '#12305f', fg: '#ffffff' },
  { t: 'バー', bg: '#08121a', fg: '#46e0ff', neon: true },
  // 16- : banners (のぼり旗) and more
  { t: '大売出し', bg: '#d8261e', fg: '#ffffff' },
  { t: '新鮮野菜', bg: '#2f8a3a', fg: '#ffffff' },
  { t: '古本', bg: '#1e3f8a', fg: '#ffffff' },
  { t: '牛丼', bg: '#f28a1d', fg: '#ffffff' },
  { t: 'いらっしゃい', bg: '#f2d23a', fg: '#b3261e' },
  { t: '朝どれ', bg: '#ffffff', fg: '#2f8a3a' },
  { t: '営業中', bg: '#ffffff', fg: '#d8261e' },
  { t: '商店街', bg: '#1f5fbf', fg: '#ffffff' },
];

function drawClock(ctx, x, y, w, h) {
  ctx.fillStyle = '#10151a';
  ctx.fillRect(x, y, w, h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = h * 0.44;
  ctx.fillStyle = '#fff6e0';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
    ctx.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
    ctx.stroke();
  }
  // Stopped at 5:47
  ctx.lineWidth = 3;
  const hA = ((5 + 47 / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  const mA = (47 / 60) * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hA) * r * 0.5, cy + Math.sin(hA) * r * 0.5);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(mA) * r * 0.78, cy + Math.sin(mA) * r * 0.78);
  ctx.stroke();
}

function fitText(ctx, text, maxW, size, family) {
  let s = size;
  ctx.font = `bold ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 2;
    ctx.font = `bold ${s}px ${family}`;
  }
  return s;
}

export function createSignAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = ATLAS_H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, ATLAS_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  H_SIGNS.forEach((s, i) => {
    const x = (i % 4) * 256;
    const y = Math.floor(i / 4) * 96;
    if (s.clock) {
      drawClock(ctx, x, y, 256, 96);
      return;
    }
    if (s.mart) {
      // convenience-store fascia: white with coloured bands
      ctx.fillStyle = '#f7f7f2';
      ctx.fillRect(x, y, 256, 96);
      ctx.fillStyle = '#2aa35a';
      ctx.fillRect(x, y + 8, 256, 14);
      ctx.fillStyle = '#f29a1d';
      ctx.fillRect(x, y + 24, 256, 8);
      ctx.fillStyle = '#2a6fd1';
      ctx.fillRect(x, y + 74, 256, 12);
      fitText(ctx, s.t, 230, 34, FONT);
      ctx.fillStyle = '#1b5e37';
      ctx.fillText(s.t, x + 128, y + 54);
      return;
    }
    ctx.fillStyle = s.bg;
    ctx.fillRect(x, y, 256, 96);
    ctx.strokeStyle = s.neon ? s.fg : 'rgba(0,0,0,0.25)';
    ctx.lineWidth = s.neon ? 3 : 4;
    ctx.strokeRect(x + 6, y + 6, 244, 84);
    const fam = s.mincho ? FONT_M : FONT;
    fitText(ctx, s.t, 220, s.big ? 72 : 46, fam);
    if (s.neon) {
      ctx.shadowColor = s.fg;
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = s.fg;
    ctx.fillText(s.t, x + 128, y + 50);
    ctx.shadowBlur = 0;
  });

  V_SIGNS.forEach((s, i) => {
    const x = (i % 16) * 64;
    const y = V_Y0 + Math.floor(i / 16) * 256;
    ctx.fillStyle = s.bg;
    ctx.fillRect(x, y, 64, 256);
    ctx.strokeStyle = s.neon ? s.fg : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 4, y + 4, 56, 248);
    const chars = [...s.t];
    const step = Math.min(56, 236 / chars.length);
    ctx.font = `bold ${Math.floor(step * 0.86)}px ${FONT}`;
    if (s.neon) {
      ctx.shadowColor = s.fg;
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = s.fg;
    const start = y + 128 - (step * chars.length) / 2 + step / 2;
    chars.forEach((c, k) => ctx.fillText(c, x + 32, start + k * step));
    ctx.shadowBlur = 0;
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function hSignUV(i, inset = 0) {
  const x = (i % 4) * 256;
  const y = Math.floor(i / 4) * 96;
  const ix = inset * 256;
  const iy = inset * 96;
  return [(x + ix) / 1024, 1 - (y + 96 - iy) / ATLAS_H, (x + 256 - ix) / 1024, 1 - (y + iy) / ATLAS_H];
}
export function vSignUV(i) {
  const x = (i % 16) * 64;
  const y = V_Y0 + Math.floor(i / 16) * 256;
  return [x / 1024, 1 - (y + 256) / ATLAS_H, (x + 64) / 1024, 1 - y / ATLAS_H];
}

export class SignBuilder {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
  }
  // Quad centred at (x,y,z) facing direction rotY (0 = +z). uvr = [u0,v0,u1,v1]
  quad(x, y, z, w, h, rotY, uvr, bright, doubleSided = false) {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const add = (flip) => {
      const base = this.n;
      const corners = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ];
      const off = flip ? -0.02 : 0.02;
      corners.forEach(([lx, ly], k) => {
        const px = flip ? -lx : lx;
        // local (px, ly, off) rotated around Y
        this.pos.push(x + px * c + off * s, y + ly, z - px * s + off * c);
        const u = k === 0 || k === 3 ? uvr[0] : uvr[2];
        const v = k < 2 ? uvr[1] : uvr[3];
        this.uv.push(u, v);
        this.col.push(bright, bright, bright);
      });
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.n += 4;
    };
    add(false);
    if (doubleSided) add(true);
  }
  build(tex) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const mat = patchMaterial(new THREE.MeshBasicMaterial({ map: tex, vertexColors: true }), { key: 'sign' });
    return new THREE.Mesh(g, mat);
  }
}
