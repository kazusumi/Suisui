// The town: roads, buildings, shops, park + shrine island, towers and the deep district.
import * as THREE from 'three';
import { Builder, KIND, mat4, rng } from './builder.js';
import { patchMaterial } from './patchMaterial.js';
import { GROUND, ISLAND, terrainHeight } from './terrain.js';
import { routeDistance, LANDMARKS } from '../tour.js';
import { buildExtras, PARK, coasterDistance } from './extras.js';
import { SignBuilder, createSignAtlas, hSignUV, vSignUV, H_SIGNS, V_SIGNS } from './signs.js';

const col = (hex) => new THREE.Color(hex);
// square crop of the clock face inside its 256x96 atlas cell (col 2, row 4)
const CLOCK_UV = [(512 + 84) / 1024, 1 - (384 + 92) / 2048, (512 + 172) / 1024, 1 - (384 + 4) / 2048];

const PALETTE = [
  '#e3d6b8', '#d99a86', '#9cc3b0', '#93aec4', '#dcb56a', '#e8e4da', '#a8604c', '#7c8ea3',
  '#e4a9ab', '#5f9a9c', '#c9b79c', '#b7c7a0', '#f0c9a0', '#8d7fa6',
].map(col);
const OFFICE = ['#8fa3b3', '#b9b6ad', '#6f8193', '#a7b8bf', '#c7c0b1', '#5c6f7e'].map(col);

function roadTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#3d3f42';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) {
    const v = 45 + Math.random() * 40;
    ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createCity(quality) {
  const R = rng(20260926);
  const rand = (a, b) => a + (b - a) * R();
  const pick = (arr) => arr[Math.floor(R() * arr.length)];

  const B = new Builder();
  const signs = new SignBuilder();
  const colliders = []; // {minX,maxX,minY,maxY,minZ,maxZ}
  const surfaceObstacles = []; // footprints that break the surface (for foam)
  const glows = []; // {x,y,z,r,g,b,s}
  const blinkers = [];
  const trees = []; // {x,y,z,h,type}
  const poles = []; // wire anchor points
  const spots = { vents: [], schools: [] };

  const glow = (x, y, z, c, s) => glows.push({ x, y, z, r: c[0], g: c[1], b: c[2], s });

  function addCollider(cx, cz, w, d, y0, y1, rotY = 0) {
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    const ew = (w * c + d * s) / 2;
    const ed = (w * s + d * c) / 2;
    const box = { minX: cx - ew, maxX: cx + ew, minZ: cz - ed, maxZ: cz + ed, minY: y0, maxY: y1 };
    colliders.push(box);
    if (y1 > -0.3 && y0 < 0.5) surfaceObstacles.push(box);
    return box;
  }

  // ---------- buildings ----------
  function building(cx, cz, w, d, h, rotY, o = {}) {
    const base = o.base ?? GROUND;
    const color = o.color || pick(PALETTE);
    const kind = o.kind ?? KIND.HOUSE;
    const seed = Math.floor(R() * 97) + 1;
    const lit = o.lit ?? rand(0.08, 0.3);
    const m = mat4(cx, base, cz, 0, rotY, o.tilt || 0);
    B.box(m, w, h, d, color, {
      side: [kind === KIND.SHOP ? KIND.HOUSE : kind, seed, lit],
      front: [kind, seed, lit],
      top: [0, seed, 0],
      topColor: color.clone().multiplyScalar(0.7),
    });
    addCollider(cx, cz, w, d, base - 1, base + h, rotY);
    const top = base + h;
    // roof clutter
    if (!o.noRoof) {
      if (R() < 0.8) {
        const pw = w - 0.2;
        const pd = d - 0.2;
        // parapet
        const pc = color.clone().multiplyScalar(0.8);
        const ph = 0.7;
        B.box(mat4(0, 0, 0).premultiply(m).multiply(mat4(0, h, pd / 2)), pw, ph, 0.25, pc);
        B.box(mat4(0, 0, 0).premultiply(m).multiply(mat4(0, h, -pd / 2)), pw, ph, 0.25, pc);
        B.box(mat4(0, 0, 0).premultiply(m).multiply(mat4(pw / 2, h, 0)), 0.25, ph, pd, pc);
        B.box(mat4(0, 0, 0).premultiply(m).multiply(mat4(-pw / 2, h, 0)), 0.25, ph, pd, pc);
      }
      const n = Math.floor(rand(0, 4));
      for (let i = 0; i < n; i++) {
        const lx = rand(-w / 2 + 1.2, w / 2 - 1.2);
        const lz = rand(-d / 2 + 1.2, d / 2 - 1.2);
        const t = R();
        const lm = m.clone().multiply(mat4(lx, h, lz, 0, rand(0, 3), 0));
        if (t < 0.35) {
          // water tank on legs
          B.box(lm, 1.6, 1.0, 1.6, col('#7d8488'));
          B.box(lm.clone().multiply(mat4(0, 1.0, 0)), 2.0, 1.5, 2.0, col('#c9c7c0'));
        } else if (t < 0.7) {
          B.box(lm, 1.2, 0.9, 0.7, col('#b9bcbc'));
        } else {
          B.box(lm, 2.6, 2.4, 2.2, color.clone().multiplyScalar(0.9), { side: [0, seed, 0] });
        }
      }
    }
    return top;
  }

  // row of buildings along x, fronts facing +z (facing=1) or -z (facing=-1)
  function rowX(x0, x1, zFront, facing, cfg) {
    let x = x0;
    while (x < x1 - 4) {
      const w = Math.min(rand(cfg.wMin, cfg.wMax), x1 - x);
      if (w < 4) break;
      const d = rand(cfg.dMin, cfg.dMax);
      const h = cfg.h();
      const cx = x + w / 2;
      const cz = zFront - (facing * d) / 2;
      const rot = facing > 0 ? 0 : Math.PI;
      building(cx, cz, w, d, h, rot, { kind: cfg.kind ? cfg.kind() : KIND.HOUSE, lit: cfg.lit, color: cfg.color ? cfg.color() : undefined });
      if (cfg.onFront) cfg.onFront(cx, zFront, w, h, facing);
      x += w + rand(cfg.gapMin ?? 0.4, cfg.gapMax ?? 2.2);
    }
  }

  // ---------- roads ----------
  const roadGeo = [];
  const roadRects = [];
  function road(x0, x1, z0, z1, y = GROUND + 0.02) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / 8, (uv.getY(i) * (z1 - z0)) / 8);
    roadGeo.push(g);
    roadRects.push([x0, x1, z0, z1]);
  }
  const white = col('#dcdad2');
  const yellow = col('#d9b43a');
  const curb = col('#a39e92');
  const sidewalk = col('#b3a58f');

  // main avenue
  road(-7, 7, -112, 46);
  for (let z = 44; z > -112; z -= 6) B.box(mat4(0, GROUND + 0.03, z), 0.18, 0.02, 3, yellow);
  // cross streets
  road(-106, 106, 2, 10);
  road(-106, 106, -88, -80);
  road(-106, -7, -38, -30);
  for (let x = -104; x < 104; x += 6) {
    if (Math.abs(x) < 8) continue;
    B.box(mat4(x, GROUND + 0.03, 6), 3, 0.02, 0.18, white);
    B.box(mat4(x, GROUND + 0.03, -84), 3, 0.02, 0.18, white);
  }
  // crosswalks
  for (const zc of [6, -84]) {
    for (let i = -6; i <= 6; i += 1.2) {
      B.box(mat4(i, GROUND + 0.03, zc + 7), 0.6, 0.02, 3.2, white);
      B.box(mat4(i, GROUND + 0.03, zc - 7), 0.6, 0.02, 3.2, white);
    }
  }
  // sidewalks along the avenue
  for (const sx of [-1, 1]) {
    B.box(mat4(sx * 8.5, GROUND, -33), 3, 0.18, 157, sidewalk, { top: [0, 3, 0] });
    B.box(mat4(sx * 7.1, GROUND, -33), 0.25, 0.22, 157, curb);
  }
  // shopping street pavement (brick-ish tint)
  B.box(mat4(-56, GROUND + 0.01, -34), 98, 0.04, 8, col('#a0705a'));

  // ---------- seawall promenade ----------
  // the wall is breached where the avenue meets the sea (|x| < 7)
  for (const s of [-1, 1]) {
    const cx = s * 53.5;
    B.box(mat4(cx, GROUND, 47.5), 93, 2.2, 5, col('#9a958a'));
    B.box(mat4(s * 54, GROUND + 3.15, 49.6), 90, 0.08, 0.1, col('#6a6e70'));
    addCollider(cx, 47.5, 93, 5, GROUND - 1, GROUND + 2.2);
    // broken chunks at the breach
    B.box(mat4(s * 6.2, GROUND, 46.8, 0.2 * s, 0.4, 0.3 * s), 2.4, 1.6, 3, col('#8e897e'));
    B.box(mat4(s * 4.6, GROUND, 49.4, -0.3, 0.8 * s, 0.15), 1.6, 0.9, 1.8, col('#8e897e'));
  }
  for (let x = -99; x <= 99; x += 2.5) if (Math.abs(x) > 8) B.box(mat4(x, GROUND + 2.2, 49.6), 0.12, 1.0, 0.12, col('#6a6e70'));
  for (let x = -96; x <= 96; x += 16) {
    if (Math.abs(x) < 10) continue;
    B.box(mat4(x, GROUND + 2.2, 46.2), 0.18, 5.2, 0.18, col('#3d4246'));
    B.box(mat4(x, GROUND + 7.3, 46.6), 0.12, 0.12, 0.9, col('#3d4246'));
    glow(x, GROUND + 7.2, 47.0, [3.2, 1.9, 0.9], 3.2);
    addCollider(x, 46.2, 0.4, 0.4, GROUND, GROUND + 7.4);
  }

  const extras = buildExtras({ B, signs, glow, addCollider, R, landmarks: LANDMARKS });
  let bookSpot = null;

  // ---------- districts ----------
  const houseH = () => (R() < 0.25 ? rand(12, 18) : rand(6, 11));
  // front blocks (between promenade and street C)
  for (const side of [-1, 1]) {
    const xa = side < 0 ? -100 : 24;
    const xb = side < 0 ? -11 : 100;
    rowX(xa, xb, 42, 1, { wMin: 7, wMax: 13, dMin: 8, dMax: 12, h: houseH, lit: 0.18 });
    rowX(xa, xb, 13, -1, {
      wMin: 7,
      wMax: 12,
      dMin: 8,
      dMax: 11,
      h: houseH,
      lit: 0.2,
      kind: () => (R() < 0.5 ? KIND.SHOP : KIND.HOUSE),
    });
  }
  // a hotel facing the avenue
  building(-16, 27, 9, 16, 19, Math.PI / 2, { color: col('#e6ddc9'), lit: 0.35, kind: KIND.HOUSE });
  signs.quad(-11.3, 13, 27, 1.1, 4.4, Math.PI / 2, vSignUV(3), 2.4);
  glow(-10.8, 13, 27, [0.8, 2.4, 2.8], 5);
  signs.quad(-16, GROUND + 19.9, 27, 7, 2.6, Math.PI / 2, hSignUV(3), 2.6);
  glow(-15, GROUND + 19.9, 27, [0.6, 2.2, 2.6], 9);

  // shopping street (shotengai) on the west
  let hIdx = 0;
  let vIdx = 0;
  const shopSigns = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 24, 26, 27, 28];
  let hasYaoya = false;
  let hasBooks = false;
  const onShop = (cx, zFront, w, h, facing) => {
    const rot = facing > 0 ? 0 : Math.PI;
    const zf = zFront + facing * 0.08;
    if (!hasYaoya && facing < 0 && cx > -62 && w > 5.5) {
      hasYaoya = true;
      extras.yaoya(cx, zFront, w, facing);
      return;
    }
    if (!hasBooks && facing > 0 && cx > -48 && w > 5.5) {
      hasBooks = true;
      bookSpot = extras.bookstore(cx, zFront, w, facing);
      return;
    }
    // some shops closed for good: shutters down
    if (R() < 0.25) {
      B.box(mat4(cx, GROUND, zFront + facing * 0.06, 0, rot, 0), w - 0.8, 2.7, 0.08, col('#9a9c9e'), { front: [KIND.SHUTTER, 0, 0], side: [KIND.SHUTTER, 0, 0] });
    }
    // banners
    if (R() < 0.35) extras.banner(cx - w / 2 + 0.5, zFront + facing * 2.3, 16 + Math.floor(R() * 8));
    const si = shopSigns[hIdx++ % shopSigns.length];
    const neon = !!H_SIGNS[si].neon;
    // sign just above the ground-floor windows (right at the waterline)
    signs.quad(cx, GROUND + 3.55, zf, Math.min(w - 1, 4.8), 1.25, rot, hSignUV(si), neon ? 2.4 : 0.9);
    if (neon) glow(cx, GROUND + 3.55, zf + facing * 0.6, [2.2, 1.1, 1.5], 3.5);
    // striped awning
    const aw = col(pick(['#c7433a', '#2f7d6d', '#d9a441', '#3a5f9e', '#7b4a8e']));
    B.box(mat4(cx, GROUND + 2.75, zFront + facing * 0.7, -0.35 * facing, rot, 0), w - 0.6, 0.12, 1.5, aw, {
      side: [KIND.STRIPE, 0, 0],
      top: [KIND.STRIPE, 0, 0],
      bottom: true,
    });
    // vertical projecting sign
    if (R() < 0.6 && h > 6) {
      const vi = vIdx++ % 16;
      const vx = cx + (w / 2 - 0.6) * (R() < 0.5 ? -1 : 1);
      const vy = GROUND + 4.8 + rand(0, 1.2);
      signs.quad(vx, vy, zFront + facing * 0.9, 0.8, 3.2, rot + Math.PI / 2, vSignUV(vi), V_SIGNS[vi].neon ? 2.4 : 0.9, true);
      if (V_SIGNS[vi].neon) glow(vx, vy, zFront + facing * 0.9, [2.0, 1.2, 1.4], 4);
    }
    // vending machine / lantern at the door
    if (R() < 0.25) {
      const vx = cx + rand(-w / 2 + 1, w / 2 - 1);
      B.box(mat4(vx, GROUND, zFront + facing * 0.6, 0, rot, 0), 1.0, 1.8, 0.75, col(pick(['#d8d8d8', '#c23b32', '#2a62b8'])), {
        front: [KIND.VENDING, Math.floor(R() * 10), 0],
      });
      spots.vents.push([vx, GROUND + 1.8, zFront + facing * 0.6]);
    }
  };
  rowX(-100, -11, -27, -1, { wMin: 6, wMax: 9, dMin: 9, dMax: 11, h: () => rand(7, 10.5), kind: () => KIND.SHOP, lit: 0.3, gapMin: 0.2, gapMax: 0.8, onFront: onShop });
  rowX(-100, -11, -41, 1, { wMin: 6, wMax: 9, dMin: 9, dMax: 12, h: () => rand(7, 11), kind: () => KIND.SHOP, lit: 0.3, gapMin: 0.2, gapMax: 0.8, onFront: onShop });
  rowX(-100, -24, -1, 1, { wMin: 8, wMax: 14, dMin: 9, dMax: 13, h: () => rand(9, 20), lit: 0.2 });
  rowX(-100, -11, -77, -1, { wMin: 8, wMax: 14, dMin: 10, dMax: 14, h: () => rand(10, 22), lit: 0.2 });

  // arcade frames over the shopping street + paper lanterns
  const arc = col('#3e4a50');
  for (let x = -14; x > -100; x -= 8) {
    B.box(mat4(x, GROUND, -37.6), 0.3, 7.6, 0.3, arc);
    B.box(mat4(x, GROUND, -30.4), 0.3, 7.6, 0.3, arc);
    B.box(mat4(x, GROUND + 7.6, -34), 0.3, 0.35, 7.8, arc);
    B.box(mat4(x, GROUND + 7.95, -34, 0, 0, 0), 0.2, 0.9, 0.2, arc);
    addCollider(x, -37.6, 0.5, 0.5, GROUND, GROUND + 7.6);
    addCollider(x, -30.4, 0.5, 0.5, GROUND, GROUND + 7.6);
    // hanging signs from every other arcade frame
    if (((-x - 14) / 8) % 2 === 1) {
      const si = [16, 40, 47, 1, 12, 13][Math.floor(R() * 6)];
      B.box(mat4(x, GROUND + 7.1, -34.9), 0.04, 0.5, 0.04, arc);
      B.box(mat4(x, GROUND + 7.1, -33.1), 0.04, 0.5, 0.04, arc);
      signs.quad(x, GROUND + 6.7, -34, 3.0, 0.8, Math.PI / 2, hSignUV(si), 1.3, true);
    }
    if (x > -96) {
      for (const lz of [-35.6, -32.4]) {
        B.box(mat4(x - 4, GROUND + 5.4, lz), 0.5, 0.75, 0.5, col('#d4432e'));
        glow(x - 4, GROUND + 5.8, lz, [3.0, 0.9, 0.45], 2.6);
      }
    }
  }
  B.box(mat4(-56, GROUND + 8.8, -34), 88, 0.25, 0.4, arc);
  // entrance gate sign
  B.box(mat4(-11.2, GROUND + 8.0, -34, 0, Math.PI / 2, 0), 8.6, 1.6, 0.3, col('#1b262d'));
  signs.quad(-11.0, GROUND + 8.8, -34, 7.6, 1.3, Math.PI / 2, hSignUV(16), 2.6);
  glow(-10.2, GROUND + 8.8, -34, [0.9, 2.6, 2.3], 10);

  // towers
  const towerH = () => rand(24, 46);
  for (const side of [-1, 1]) {
    const xa = side < 0 ? -100 : 34;
    const xb = side < 0 ? -11 : 100;
    rowX(xa, xb, -91, 1, {
      wMin: 11,
      wMax: 17,
      dMin: 13,
      dMax: 17,
      h: towerH,
      lit: 0.35,
      kind: () => KIND.OFFICE,
      color: () => pick(OFFICE),
      gapMin: 2,
      gapMax: 5,
    });
  }
  // landmark tower with rooftop neon
  const lt = building(22, -100, 16, 16, 54, 0, { kind: KIND.OFFICE, color: col('#6f8698'), lit: 0.45, noRoof: true });
  B.box(mat4(22, lt, -100), 10, 3.5, 10, col('#4a5864'));
  B.box(mat4(22, lt + 3.5, -106), 12, 4.2, 0.4, col('#1a2026'));
  signs.quad(22, lt + 5.6, -105.7, 11, 3.7, 0, hSignUV(19), 3.0);
  glow(22, lt + 5.6, -104.5, [0.8, 2.6, 3.0], 18);
  B.box(mat4(22, lt + 3.5, -100), 0.3, 9, 0.3, col('#2a2f33'));
  blinkers.push({ x: 22, y: lt + 12.6, z: -100, r: 3.5, g: 0.3, b: 0.2, s: 2.2, rate: 1.1 });
  signs.quad(-40, GROUND + 22, -90.7, 8, 2.2, 0, hSignUV(20), 0.9);

  // ---------- street furniture along the avenue ----------
  const poleCol = col('#5a5550');
  for (const sx of [-1, 1]) {
    let prev = null;
    for (let z = 40; z >= -110; z -= 22) {
      const px = sx * 9.2;
      B.box(mat4(px, GROUND, z), 0.34, 12.5, 0.34, poleCol);
      B.box(mat4(px, GROUND + 11.6, z), 2.6, 0.18, 0.18, poleCol);
      B.box(mat4(px, GROUND + 10.4, z), 1.8, 0.14, 0.14, poleCol);
      if (R() < 0.4) B.box(mat4(px + sx * 0.4, GROUND + 8.6, z), 0.7, 1.1, 0.7, col('#7c8286'));
      addCollider(px, z, 0.4, 0.4, GROUND, GROUND + 12.5);
      const anchors = [
        [px - 1.2, GROUND + 11.7, z],
        [px + 1.2, GROUND + 11.7, z],
        [px, GROUND + 10.5, z],
      ];
      if (prev) poles.push({ a: prev, b: anchors });
      prev = anchors;
    }
  }
  // cross wires over the avenue
  for (let z = 40; z >= -110; z -= 44) poles.push({ a: [[-9.2, GROUND + 11.7, z]], b: [[9.2, GROUND + 11.7, z]] });

  // traffic signals (blinking amber) at both intersections
  for (const zc of [6, -84]) {
    for (const [sx, sz] of [
      [-8.6, zc + 5],
      [8.6, zc - 5],
    ]) {
      B.box(mat4(sx, GROUND, sz), 0.26, 6.2, 0.26, col('#6c7072'));
      B.box(mat4(sx * 0.62, GROUND + 5.9, sz), Math.abs(sx) * 0.8, 0.16, 0.16, col('#6c7072'));
      B.box(mat4(sx * 0.35, GROUND + 5.4, sz), 1.8, 0.55, 0.45, col('#2f3336'));
      blinkers.push({ x: sx * 0.35, y: GROUND + 5.68, z: sz + (sz > zc ? -0.3 : 0.3), r: 3.2, g: 1.6, b: 0.15, s: 1.6, rate: 0.9 });
      addCollider(sx, sz, 0.4, 0.4, GROUND, GROUND + 6.2);
    }
  }
  // stop sign + bus stop
  signs.quad(8.8, GROUND + 2.3, 16, 1.0, 0.45, 0, hSignUV(23), 0.9, true);
  signs.quad(-8.8, GROUND + 2.6, -46.8, 1.1, 0.5, Math.PI / 2, hSignUV(25), 0.9, true);
  B.box(mat4(-8.8, GROUND, -46.8), 0.1, 2.4, 0.1, poleCol);

  // vending machines on the avenue sidewalks (they glow under water)
  for (const [vx, vz, rot] of [
    [-9.4, 20, Math.PI / 2],
    [-9.4, 21.1, Math.PI / 2],
    [9.4, -18, -Math.PI / 2],
    [9.4, -50, -Math.PI / 2],
    [9.4, -51.1, -Math.PI / 2],
    [-9.4, -95, Math.PI / 2],
  ]) {
    B.box(mat4(vx, GROUND, vz, 0, rot, 0), 1.0, 1.8, 0.75, col(pick(['#dedede', '#c23b32', '#2a62b8', '#e7c23a'])), {
      front: [KIND.VENDING, Math.floor(R() * 10), 0],
    });
    glow(vx + (vx < 0 ? 0.7 : -0.7), GROUND + 1.4, vz, [1.2, 1.5, 1.8], 2.2);
    spots.vents.push([vx, GROUND + 1.8, vz]);
  }

  // cars left behind
  const carCols = ['#c9ccce', '#2b3a52', '#b8332a', '#e9e6dc', '#3f5f4a', '#d7b046', '#6c7a86'];
  function car(x, z, rot) {
    const c = col(pick(carCols));
    const m = mat4(x, GROUND + 0.35, z, 0, rot, rand(-0.03, 0.03));
    B.box(m, 1.75, 0.75, 4.2, c);
    B.box(m.clone().multiply(mat4(0, 0.75, -0.2)), 1.6, 0.6, 2.3, c, { side: [KIND.CAR, 0, 0], front: [KIND.CAR, 0, 0] });
    for (const [wx, wz] of [
      [-0.8, 1.3],
      [0.8, 1.3],
      [-0.8, -1.3],
      [0.8, -1.3],
    ])
      B.box(m.clone().multiply(mat4(wx, -0.35, wz)), 0.25, 0.6, 0.6, col('#1b1b1b'));
    addCollider(x, z, 2, 4.4, GROUND, GROUND + 1.7, rot);
  }
  car(-3.5, 30, 0.05);
  car(4.4, 18, Math.PI - 0.05);
  car(-3.2, -12, 0.2);
  car(3.6, -44, Math.PI + 0.05);
  car(-3.0, -70, -0.1);
  car(40, 6.5, Math.PI / 2);
  car(-60, 8.9, -Math.PI / 2 + 0.05);
  car(-30, -84, Math.PI / 2 + 0.3);
  car(62, -85, -Math.PI / 2);

  // ---------- park + shrine island (east, z -1..-77) ----------
  // school building at the far side of the park
  building(84, -12, 28, 11, 11, Math.PI, { color: col('#e8e1cf'), kind: KIND.HOUSE, lit: 0.12 });
  building(96, -40, 7, 16, 14, -Math.PI / 2, { color: col('#d8cfb9'), lit: 0.1 });
  // clock tower
  B.box(mat4(20, GROUND, -10), 1.4, 9.5, 1.4, col('#c9c1b0'));
  B.box(mat4(20, GROUND + 9.5, -10), 2.2, 2.2, 2.2, col('#b8ad98'));
  B.box(mat4(20, GROUND + 11.7, -10), 2.6, 0.3, 2.6, col('#5d4b3e'));
  signs.quad(20, GROUND + 10.6, -8.88, 1.9, 1.9, 0, CLOCK_UV, 1.1);
  signs.quad(18.88, GROUND + 10.6, -10, 1.9, 1.9, -Math.PI / 2, CLOCK_UV, 1.1);
  addCollider(20, -10, 2.2, 2.2, GROUND, GROUND + 12);
  // playground (fully submerged)
  const play = col('#d9533f');
  B.box(mat4(28, GROUND, -66, 0.18, 0, 0), 0.15, 2.8, 0.15, play);
  B.box(mat4(28, GROUND, -62, 0.18, 0, 0), 0.15, 2.8, 0.15, play);
  B.box(mat4(28, GROUND + 2.65, -64), 0.2, 0.2, 5, play);
  B.box(mat4(28, GROUND + 0.6, -65), 0.5, 0.06, 0.25, col('#2f6db3'));
  B.box(mat4(28, GROUND + 0.7, -63), 0.5, 0.06, 0.25, col('#e3b93c'));
  B.box(mat4(36, GROUND, -68, -0.6, 0.4, 0), 0.9, 0.12, 4.2, col('#3f9ad1'));
  B.box(mat4(35, GROUND, -69.6, 0, 0.4, 0), 0.9, 2.3, 0.9, col('#e5d05a'));
  for (let i = 0; i < 4; i++) B.box(mat4(18 + i * 5, GROUND, -30 - i * 7), 1.8, 0.45, 0.5, col('#8a5a3a'));

  // torii standing in the water, facing the avenue
  const tori = col('#d4432a');
  const tx = 42;
  const tz = ISLAND.z;
  for (const s of [-1, 1]) {
    B.box(mat4(tx, GROUND, tz + s * 3.2), 0.55, 9.6, 0.55, tori);
    B.box(mat4(tx, GROUND, tz + s * 3.2), 0.8, 0.8, 0.8, col('#2a2a2a'));
    addCollider(tx, tz + s * 3.2, 0.7, 0.7, GROUND, GROUND + 9.6);
  }
  B.box(mat4(tx, GROUND + 8.2, tz), 0.4, 0.5, 8.6, tori);
  B.box(mat4(tx, GROUND + 9.6, tz), 0.6, 0.5, 10.4, tori, { bottom: true });
  B.box(mat4(tx, GROUND + 10.1, tz), 0.7, 0.28, 11.2, col('#241c1a'), { bottom: true });
  B.box(mat4(tx, GROUND + 8.7, tz), 0.25, 0.9, 0.6, tori);
  surfaceObstacles.push({ minX: tx - 0.4, maxX: tx + 0.4, minZ: tz - 3.6, maxZ: tz - 2.8 }, { minX: tx - 0.4, maxX: tx + 0.4, minZ: tz + 2.8, maxZ: tz + 3.6 });

  // shrine on the island
  const sy = terrainHeight(ISLAND.x + 3, ISLAND.z) - 0.2;
  const sm = mat4(ISLAND.x + 3, sy, ISLAND.z, 0, Math.PI / 2, 0);
  B.box(sm, 6, 0.6, 5, col('#8d8a82'));
  B.box(sm.clone().multiply(mat4(0, 0.6, 0)), 4.6, 2.6, 3.6, col('#b0452e'), { front: [0, 0, 0] });
  B.gable(sm.clone().multiply(mat4(0, 3.2, 0)), 6.2, 5.2, 1.8, col('#2c2724'));
  addCollider(ISLAND.x + 3, ISLAND.z, 5, 6, sy - 1, sy + 5);
  for (const s of [-1, 1]) {
    const lx = ISLAND.x - 4;
    const lz = ISLAND.z + s * 2.2;
    const ly = terrainHeight(lx, lz);
    B.box(mat4(lx, ly, lz), 0.5, 0.9, 0.5, col('#8d8a82'));
    B.box(mat4(lx, ly + 0.9, lz), 0.7, 0.5, 0.7, col('#9a968c'));
    B.box(mat4(lx, ly + 1.4, lz), 0.9, 0.2, 0.9, col('#77736b'));
    glow(lx, ly + 1.15, lz, [3.0, 1.6, 0.6], 1.6);
  }

  // trees: sakura ring, pines on the island, green trees
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand(-0.1, 0.1);
    const r = rand(20, 30);
    const x = ISLAND.x + Math.cos(a) * r;
    const z = ISLAND.z + Math.sin(a) * r * 0.85;
    if (x < 14 || x > 92 || z > -4 || z < -74) continue;
    if (Math.abs(z - tz) < 5 && x < 50) continue;
    trees.push({ x, y: GROUND, z, h: rand(5.2, 6.8), type: 'sakura' });
  }
  for (let i = 0; i < 7; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(2, 8);
    const x = ISLAND.x + Math.cos(a) * r + 2;
    const z = ISLAND.z + Math.sin(a) * r;
    trees.push({ x, y: terrainHeight(x, z) - 0.2, z, h: rand(4, 6.5), type: 'pine' });
  }
  for (let i = 0; i < 14; i++) {
    const x = rand(14, 96);
    const z = rand(-76, -24);
    if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < 34) continue;
    trees.push({ x, y: GROUND, z, h: rand(5, 7.5), type: 'green' });
  }
  for (const [x, z] of [
    [-3, 44],
    [3.5, 44.5],
    [-50, -109],
    [60, -110],
  ])
    trees.push({ x, y: GROUND, z, h: 5.5, type: 'green' });
  // park lamps
  for (const [x, z] of [
    [16, -20],
    [16, -48],
    [16, -64],
    [34, -24],
    [34, -58],
    [80, -30],
    [80, -56],
  ]) {
    B.box(mat4(x, GROUND, z), 0.16, 5.2, 0.16, col('#2f3438'));
    B.box(mat4(x, GROUND + 5.2, z), 0.5, 0.4, 0.5, col('#f2e2c0'));
    glow(x, GROUND + 5.4, z, [3.0, 2.0, 1.0], 2.8);
    addCollider(x, z, 0.3, 0.3, GROUND, GROUND + 5.6);
  }

  // ---------- the slope and the deep district ----------
  // broken road slabs sliding down the slope
  for (let i = 0; i < 5; i++) {
    const z = -114 - i * 6.5;
    const y = terrainHeight(0, z);
    B.box(mat4(rand(-2, 2), y - 0.4, z, -0.35 - rand(0, 0.25), rand(-0.15, 0.15), rand(-0.1, 0.1)), 13, 0.5, 6.4, col('#434548'));
  }
  const deepCols = PALETTE.map((c) => c.clone().multiplyScalar(0.8));
  for (let bz = -150; bz >= -226; bz -= 26) {
    for (let bx = -84; bx <= 84; bx += 28) {
      if (Math.hypot(bx - PARK.x, bz - PARK.z) < 34) continue; // amusement park plaza
      if (coasterDistance(bx, bz) < 16) continue; // roller coaster
      const n = R() < 0.5 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const w = rand(8, 14);
        const d = rand(8, 13);
        const cx = bx + (n === 2 ? (k === 0 ? -6 : 6) : 0) + rand(-2, 2);
        const cz = bz + rand(-3, 3);
        const base = terrainHeight(cx, cz) - 0.5;
        const h = rand(7, 16);
        building(cx, cz, w, d, h, rand(-0.12, 0.12) + (R() < 0.5 ? 0 : Math.PI), {
          base,
          color: pick(deepCols),
          kind: R() < 0.3 ? KIND.OFFICE : KIND.HOUSE,
          lit: rand(0.25, 0.5),
          tilt: R() < 0.2 ? rand(-0.06, 0.06) : 0,
        });
        if (R() < 0.35) {
          const si = pick([3, 8, 14, 24, 28, 31, 5, 11]);
          signs.quad(cx, base + h - 1.2, cz + d / 2 + 0.1, Math.min(w - 1, 5), 1.4, 0, hSignUV(si), 2.6);
          glow(cx, base + h - 1.2, cz + d / 2 + 1.0, [0.8, 2.2, 2.4], 6);
        }
        spots.vents.push([cx + w / 2 + 0.5, base, cz]);
      }
    }
  }
  // sunken bus
  {
    const x = 12;
    const z = -163;
    const y = terrainHeight(x, z) + 0.2;
    const m = mat4(x, y, z, 0.05, 0.6, 0.08);
    B.box(m, 2.5, 2.9, 10.5, col('#dfe3dc'), { side: [KIND.CAR, 1, 0] });
    B.box(m.clone().multiply(mat4(0, 0.3, 0)), 2.52, 0.5, 10.52, col('#2d8a6c'));
    signs.quad(x + Math.sin(0.6) * 5.3, y + 2.5, z + Math.cos(0.6) * 5.3, 1.8, 0.45, 0.6, hSignUV(25), 1.8);
    addCollider(x, z, 3, 11, y - 1, y + 3, 0.6);
  }
  // half-sunken Ferris wheel
  const fw = { x: -45, z: -180 };
  {
    const fy = terrainHeight(fw.x, fw.z);
    const cy = fy + 17;
    const R0 = 15;
    const rim = col('#e8e2d4');
    const base = mat4(fw.x, cy, fw.z, 0, 0.35, 0.05);
    // the rotating rim, spokes and gondolas live in fx/rides.js
    B.box(base.clone().multiply(mat4(0, -0.8, 0, Math.PI / 2, 0, 0)), 1.6, 1.6, 1.6, col('#8f8a7e'));
    for (const s of [-1, 1])
      for (const k of [-1, 1]) {
        const m = mat4(fw.x, fy, fw.z, 0, 0.35, 0).multiply(mat4(k * 6.5, 0, s * 2.4, -s * 0.12, 0, k * 0.36));
        B.box(m, 0.6, 19, 0.6, col('#b9b3a4'));
      }
    // where the rim pierces the surface -> foam
    const ly = -cy;
    if (Math.abs(ly) < R0) {
      const lx = Math.sqrt(R0 * R0 - ly * ly);
      for (const sx of [-1, 1]) {
        const p = new THREE.Vector3(sx * lx, ly, 0).applyMatrix4(base);
        surfaceObstacles.push({ minX: p.x - 0.8, maxX: p.x + 0.8, minZ: p.z - 1.2, maxZ: p.z + 1.2 });
      }
    }
    spots.vents.push([fw.x, fy, fw.z + 4], [fw.x + 8, fy, fw.z - 3]);
  }

  // fish school anchors [x, y, z, radius]
  spots.schools.push(
    [0, -1.6, 22, 7],
    [-40, -1.8, -34, 8],
    [52, -1.8, -48, 9],
    [-20, -8, 90, 10],
    [0, -12, -150, 12],
    [-45, -9, -180, 14],
    [40, -12, -200, 12],
    [-70, -1.8, 6, 7],
    [25, -1.5, -95, 8],
    [60, -14, -135, 10]
  );

  // ---------- assemble ----------
  const cityGeo = B.build();
  const cityMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), { facade: true, key: 'city' });
  const cityMesh = new THREE.Mesh(cityGeo, cityMat);
  cityMesh.name = 'city';

  const rg = mergeSimple(roadGeo);
  const roadMat = patchMaterial(new THREE.MeshLambertMaterial({ map: roadTexture(), color: 0xffffff }), { key: 'road' });
  const roadMesh = new THREE.Mesh(rg, roadMat);

  const atlas = createSignAtlas();
  const signMesh = signs.build(atlas);

  const group = new THREE.Group();
  group.add(cityMesh, roadMesh, signMesh);
  group.add(createTrees(trees, surfaceObstacles, colliders));
  group.add(createWires(poles));

  return { group, colliders, surfaceObstacles, glows, blinkers, spots, roadRects, bookSpot, cityMat };
}

function mergeSimple(geos) {
  let count = 0;
  geos.forEach((g) => (count += g.attributes.position.count));
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const idx = [];
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function createTrees(list, surfaceObstacles, colliders) {
  // keep the tour route clear of trunks and canopies
  list = list.filter((t) => routeDistance(t.x, t.z) > 4.5);
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#4a3a2e' }), { key: 'trunk' });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
  const blobGeo = new THREE.IcosahedronGeometry(1, 1);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  const canopyMat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff' }), { key: 'canopy' });
  const blobs = [];
  const cones = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const rr = rng(7);
  list.forEach((t, i) => {
    e.set((rr() - 0.5) * 0.08, 0, (rr() - 0.5) * 0.08);
    q.setFromEuler(e);
    m.compose(p.set(t.x, t.y, t.z), q, s.set(1, t.h, 1));
    trunks.setMatrixAt(i, m);
    colliders.push({ minX: t.x - 0.3, maxX: t.x + 0.3, minZ: t.z - 0.3, maxZ: t.z + 0.3, minY: t.y, maxY: t.y + t.h });
    surfaceObstacles.push({ minX: t.x - 0.3, maxX: t.x + 0.3, minZ: t.z - 0.3, maxZ: t.z + 0.3 });
    const top = t.y + t.h;
    if (t.type === 'pine') {
      for (let k = 0; k < 3; k++) cones.push({ x: t.x, y: top - 1.2 + k * 1.1, z: t.z, r: 1.8 - k * 0.5, h: 2.2, c: new THREE.Color().setHSL(0.3, 0.35, 0.18 + rr() * 0.05) });
    } else {
      const n = t.type === 'sakura' ? 5 : 4;
      for (let k = 0; k < n; k++) {
        const c =
          t.type === 'sakura'
            ? new THREE.Color(['#f7a3d6', '#fbb8e2', '#f59ccf', '#ffc6ea'][Math.floor(rr() * 4)])
            : new THREE.Color().setHSL(0.24 + rr() * 0.06, 0.4, 0.22 + rr() * 0.08);
        blobs.push({ x: t.x + (rr() - 0.5) * 2.6, y: top - 0.2 + rr() * 1.4, z: t.z + (rr() - 0.5) * 2.6, r: 1.3 + rr() * 0.9, c });
      }
    }
  });
  const blobMesh = new THREE.InstancedMesh(blobGeo, canopyMat, blobs.length);
  blobs.forEach((b, i) => {
    q.identity();
    m.compose(p.set(b.x, b.y, b.z), q, s.set(b.r, b.r * 0.8, b.r));
    blobMesh.setMatrixAt(i, m);
    blobMesh.setColorAt(i, b.c);
  });
  const coneMesh = new THREE.InstancedMesh(coneGeo, canopyMat, cones.length);
  cones.forEach((b, i) => {
    q.identity();
    m.compose(p.set(b.x, b.y, b.z), q, s.set(b.r, b.h, b.r));
    coneMesh.setMatrixAt(i, m);
    coneMesh.setColorAt(i, b.c);
  });
  [trunks, blobMesh, coneMesh].forEach((im) => {
    im.computeBoundingSphere();
    group.add(im);
  });
  return group;
}

function createWires(poles) {
  const pts = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const { a: A, b: Bs } of poles) {
    const n = Math.min(A.length, Bs.length);
    for (let k = 0; k < n; k++) {
      a.fromArray(A[k]);
      b.fromArray(Bs[k]);
      const sag = 0.5 + a.distanceTo(b) * 0.02;
      const segs = 14;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const p0 = a.clone().lerp(b, t0);
        const p1 = a.clone().lerp(b, t1);
        p0.y -= Math.sin(t0 * Math.PI) * sag;
        p1.y -= Math.sin(t1 * Math.PI) * sag;
        pts.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = patchMaterial(new THREE.LineBasicMaterial({ color: '#141414' }), { key: 'wire' });
  return new THREE.LineSegments(g, mat);
}
