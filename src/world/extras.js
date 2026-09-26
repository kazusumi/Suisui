// Familiar Japanese street scenery and the sunken amusement park grounds.
// Everything static is merged into the city geometry (no extra draw calls).
import * as THREE from 'three';
import { KIND, mat4 } from './builder.js';
import { GROUND, terrainHeight } from './terrain.js';
import { hSignUV, vSignUV } from './signs.js';

const col = (hex) => new THREE.Color(hex);

export const PARK = { x: -45, z: -180, r: 30 };
export const MERRY = { x: -30, z: -196 };
export const CUPS = { x: -62, z: -197 };
export const WHEEL = { x: -45, z: -180, rotY: 0.35, tilt: 0.05, R: 15 };

// Roller coaster: closed loop west of the park that dives under and leaps out of the water.
export const COASTER = [
  [-72, 1.0, -150], [-72, 6, -165], [-74, 14, -180], [-78, 10, -192], [-84, -8, -205],
  [-90, -12, -217], [-98, -5, -225], [-104, 7, -214], [-105, 4, -199], [-101, -9, -186],
  [-98, -6, -173], [-102, 6, -160], [-98, 3, -146], [-88, -6, -137], [-80, -2.5, -140],
];
export function coasterDistance(x, z) {
  let best = Infinity;
  const n = COASTER.length;
  for (let i = 0; i < n; i++) {
    const [ax, , az] = COASTER[i];
    const [bx, , bz] = COASTER[(i + 1) % n];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export function buildExtras(ctx) {
  const { B, signs, glow, addCollider, R, landmarks } = ctx;
  const rand = (a, b) => a + (b - a) * R();

  // ---------- convenience store (east side of the avenue, facing it) ----------
  {
    const cx = 17;
    const cz = 27;
    const m = mat4(cx, GROUND, cz, 0, -Math.PI / 2, 0);
    B.box(m, 12, 4.2, 10, col('#ecebe6'), { front: [KIND.STOREFRONT, 3, 0], side: [0, 3, 0], topColor: col('#9a9c9c') });
    // coloured band under the eaves
    B.box(m.clone().multiply(mat4(0, 3.3, 5.05)), 12.1, 0.9, 0.12, col('#f7f7f2'));
    signs.quad(cx - 5.2, GROUND + 3.75, cz, 6.5, 0.9, -Math.PI / 2, hSignUV(32), 1.6);
    addCollider(cx, cz, 12, 10, GROUND - 1, GROUND + 4.2, -Math.PI / 2);
    // pylon sign that sticks out of the water
    const px = 11.2;
    const pz = 20.5;
    B.box(mat4(px, GROUND, pz), 0.35, 6.2, 0.35, col('#8d9194'));
    B.box(mat4(px, GROUND + 6.2, pz), 0.3, 2.3, 2.4, col('#f2f2ee'));
    signs.quad(px + 0.17, GROUND + 7.75, pz, 2.2, 0.8, Math.PI / 2, hSignUV(32), 1.7);
    signs.quad(px - 0.17, GROUND + 7.75, pz, 2.2, 0.8, -Math.PI / 2, hSignUV(32), 1.7);
    signs.quad(px + 0.17, GROUND + 6.85, pz, 2.2, 0.7, Math.PI / 2, hSignUV(38), 2.4);
    signs.quad(px - 0.17, GROUND + 6.85, pz, 2.2, 0.7, -Math.PI / 2, hSignUV(38), 2.4);
    glow(px - 0.6, GROUND + 7.4, pz, [1.2, 2.0, 1.6], 5);
    addCollider(px, pz, 0.5, 2.4, GROUND, GROUND + 8.5);
    for (let z = cz - 5; z <= cz + 5; z += 2.5) glow(cx - 5.6, GROUND + 1.6, z, [1.1, 1.3, 1.4], 3.2);
    landmarks.push({ name: 'コンビニ', x: cx, z: cz, color: '#5fe08a' });
  }

  // ---------- gyudon diner (west side, facing the avenue) ----------
  {
    const cx = -17.5;
    const cz = -8;
    const m = mat4(cx, GROUND, cz, 0, Math.PI / 2, 0);
    B.box(m, 11, 3.9, 10, col('#e7ddcc'), { front: [KIND.STOREFRONT, 5, 1], side: [0, 5, 0], topColor: col('#6d5a4a') });
    B.box(m.clone().multiply(mat4(0, 2.95, 5.05)), 11.1, 1.0, 0.14, col('#f28a1d'));
    signs.quad(cx + 5.25, GROUND + 3.45, cz, 7.5, 0.95, Math.PI / 2, hSignUV(33), 1.05);
    // roof sign above the water
    B.box(m.clone().multiply(mat4(0, 3.9, 2.5)), 0.2, 1.4, 0.2, col('#555'));
    B.box(m.clone().multiply(mat4(0, 5.2, 2.5)), 6.4, 1.6, 0.25, col('#f28a1d'));
    signs.quad(cx + 2.65, GROUND + 6.0, cz, 6.0, 1.3, Math.PI / 2, hSignUV(33), 1.15);
    signs.quad(cx + 2.35, GROUND + 6.0, cz, 6.0, 1.3, -Math.PI / 2, hSignUV(39), 1.2);
    glow(cx + 3.4, GROUND + 6.0, cz, [2.6, 1.3, 0.4], 6);
    addCollider(cx, cz, 11, 10, GROUND - 1, GROUND + 6.8, Math.PI / 2);
    banner(cx + 6.2, cz - 4.8, 19);
    for (let z = cz - 4.5; z <= cz + 4.5; z += 3) glow(cx + 5.8, GROUND + 1.5, z, [2.0, 1.3, 0.7], 3.2);
    landmarks.push({ name: '牛丼屋', x: cx, z: cz, color: '#ffa04a', left: true });
  }

  // ---------- pedestrian bridge over the avenue ----------
  {
    const z = -100;
    const deckY = GROUND + 5.2;
    const blue = col('#4f8aa6');
    B.box(mat4(0, deckY, z), 21.5, 0.35, 2.2, blue, { bottom: true });
    for (const s of [-1, 1]) {
      B.box(mat4(0, deckY + 0.35, z + s * 1.05), 21.5, 1.05, 0.08, col('#dfe6e8'));
      B.box(mat4(0, deckY + 1.35, z + s * 1.05), 21.5, 0.08, 0.14, blue);
      // stairs down to both sidewalks (toward -z)
      const sx = s * 9.4;
      const len = Math.hypot(5.2, 8);
      const ang = Math.atan2(5.2, 8);
      const sm = mat4(sx, GROUND + 2.6 - 0.15, z - 1.1 - 4, -ang, 0, 0);
      B.box(sm, 1.7, 0.3, len, blue, { bottom: true });
      for (const k of [-1, 1]) B.box(sm.clone().multiply(mat4(k * 0.85, 0.3, 0)), 0.06, 0.95, len, col('#dfe6e8'));
      addCollider(sx, z - 5.1, 1.9, 8, GROUND, deckY);
      for (const pz of [z - 0.8, z + 0.8]) {
        B.box(mat4(s * 7.6, GROUND, pz), 0.4, 5.2, 0.4, col('#6e7f88'));
        addCollider(s * 7.6, pz, 0.5, 0.5, GROUND, deckY);
      }
    }
    addCollider(0, z, 21.5, 2.3, deckY, deckY + 1.5);
    signs.quad(0, deckY + 0.85, z + 1.12, 3.2, 0.8, 0, hSignUV(44), 0.9);
    signs.quad(0, deckY + 0.85, z - 1.12, 3.2, 0.8, Math.PI, hSignUV(44), 0.9);
    landmarks.push({ name: '歩道橋', x: 0, z, color: '#7fb8d6' });
  }

  // ---------- street furniture ----------
  // post box
  B.box(mat4(-9.3, GROUND + 0.15, 37), 0.55, 1.25, 0.45, col('#d42a1e'));
  B.box(mat4(-9.3, GROUND + 1.4, 37), 0.65, 0.12, 0.55, col('#b8231a'));
  signs.quad(-9.3 + 0.28, GROUND + 1.05, 37, 0.4, 0.16, Math.PI / 2, hSignUV(45), 1.0);
  // phone box that still glows
  B.box(mat4(9.5, GROUND + 0.15, -29, 0, -Math.PI / 2, 0), 1.0, 2.2, 1.0, col('#6d8a78'), {
    front: [KIND.STOREFRONT, 1, 0],
    side: [KIND.STOREFRONT, 2, 0],
  });
  B.box(mat4(9.5, GROUND + 2.35, -29), 1.15, 0.2, 1.15, col('#3f5a48'));
  signs.quad(9.5 - 0.56, GROUND + 2.2, -29, 0.9, 0.22, -Math.PI / 2, hSignUV(46), 1.2);
  glow(9.5, GROUND + 1.3, -29, [0.8, 1.6, 1.2], 3.5);
  addCollider(9.5, -29, 1.1, 1.1, GROUND, GROUND + 2.5);
  // curve mirrors at the corner
  for (const [x, z, r] of [
    [8.7, 12.4, -2.4],
    [-8.7, -78.6, 0.8],
  ]) {
    B.box(mat4(x, GROUND, z), 0.12, 3.9, 0.12, col('#e8752a'));
    B.box(mat4(x, GROUND + 3.4, z, 0.1, r, 0), 0.9, 0.9, 0.08, col('#e8752a'));
    B.box(mat4(x, GROUND + 3.45, z, 0.1, r, 0).multiply(mat4(0, 0, 0.05)), 0.75, 0.8, 0.04, col('#c9d4dc'));
  }
  // guard rails along the curb
  const rail = (x, z0, z1) => {
    for (let z = z0; z <= z1; z += 2) B.box(mat4(x, GROUND, z), 0.1, 0.8, 0.1, col('#cfcfc8'));
    B.box(mat4(x, GROUND + 0.55, (z0 + z1) / 2), 0.06, 0.3, z1 - z0, col('#e9e9e2'));
  };
  rail(-7.4, 20, 34);
  rail(7.4, 30, 40);
  rail(-7.4, -64, -48);
  rail(7.4, -76, -60);
  // bus stop bench
  B.box(mat4(-9.3, GROUND, -45.5), 0.5, 0.45, 1.8, col('#6a4a34'));
  B.box(mat4(-9.55, GROUND + 0.45, -45.5), 0.08, 0.5, 1.8, col('#6a4a34'));

  // ---------- amusement park grounds ----------
  const P = PARK;
  const g = (x, z) => terrainHeight(x, z);
  const gateA = Math.atan2(-205.7 - P.z, -29.6 - P.x);
  // fence ring
  const posts = 72;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    let da = Math.abs(Math.atan2(Math.sin(a - gateA), Math.cos(a - gateA)));
    if (da < 0.13) continue;
    const x = P.x + Math.cos(a) * P.r;
    const z = P.z + Math.sin(a) * P.r;
    const y = g(x, z);
    const seg = (2 * Math.PI * P.r) / posts;
    B.box(mat4(x, y, z), 0.14, 1.3, 0.14, col('#f1ede2'));
    const m = mat4(x, y, z, 0, -a, 0);
    B.box(m.clone().multiply(mat4(0, 1.15, seg / 2)), 0.08, 0.1, seg, col('#e8a5b8'));
    B.box(m.clone().multiply(mat4(0, 0.6, seg / 2)), 0.06, 0.08, seg, col('#e8a5b8'));
  }
  // entrance gate
  {
    const gx = P.x + Math.cos(gateA) * P.r;
    const gz = P.z + Math.sin(gateA) * P.r;
    const y = g(gx, gz);
    const rot = -gateA + Math.PI / 2;
    const m = mat4(gx, y, gz, 0, rot, 0);
    for (const s of [-1, 1]) {
      const pm = m.clone().multiply(mat4(s * 3.4, 0, 0));
      for (let k = 0; k < 7; k++) B.box(pm.clone().multiply(mat4(0, k * 1.0, 0)), 0.9, 1.0, 0.9, col(k % 2 ? '#f4efe6' : '#e8567a'));
      B.box(pm.clone().multiply(mat4(0, 7, 0)), 1.3, 0.5, 1.3, col('#ffd36b'));
    }
    B.box(m.clone().multiply(mat4(0, 7.2, 0)), 8.2, 1.6, 0.5, col('#241a2e'));
    // the gate faces outward (towards +z of its local frame)
    const out = new THREE.Vector3(0, 0, 0.28).applyMatrix4(new THREE.Matrix4().makeRotationY(rot));
    signs.quad(gx + out.x, y + 8.0, gz + out.z, 7.4, 1.35, rot, hSignUV(36), 2.8);
    signs.quad(gx - out.x, y + 8.0, gz - out.z, 7.4, 1.35, rot + Math.PI, hSignUV(36), 2.8);
    for (let k = -3; k <= 3; k++) {
      const p = new THREE.Vector3(k * 1.15, 8.95, 0).applyMatrix4(m);
      glow(p.x, p.y, p.z, k % 2 ? [3.0, 1.2, 2.2] : [3.0, 2.4, 1.0], 1.4);
    }
    // ticket booth just inside
    const bm = m.clone().multiply(mat4(5.8, 0, -3, 0, 0, 0));
    B.box(bm, 2.2, 2.4, 2.0, col('#f3e3c0'), { front: [KIND.STOREFRONT, 7, 1] });
    B.box(bm.clone().multiply(mat4(0, 2.4, 0.2)), 2.8, 0.25, 2.6, col('#d9534a'));
    const tp = new THREE.Vector3(0, 2.1, 1.02).applyMatrix4(bm);
    signs.quad(tp.x, tp.y, tp.z, 1.8, 0.5, rot, hSignUV(37), 1.3);
    const gl = new THREE.Vector3(0, 1.2, 1.3).applyMatrix4(bm);
    glow(gl.x, gl.y, gl.z, [2.2, 1.6, 0.9], 3);
  }
  // benches and lamps around the plaza
  for (let i = 0; i < 7; i++) {
    const a = gateA + 0.6 + i * 0.75;
    const x = P.x + Math.cos(a) * 21;
    const z = P.z + Math.sin(a) * 21;
    const y = g(x, z);
    const m = mat4(x, y, z, 0, -a - Math.PI / 2, 0);
    B.box(m, 1.8, 0.45, 0.5, col('#8a5a3a'));
    B.box(m.clone().multiply(mat4(0, 0.45, -0.25)), 1.8, 0.5, 0.08, col('#8a5a3a'));
    const la = a + 0.37;
    const lx = P.x + Math.cos(la) * 24;
    const lz = P.z + Math.sin(la) * 24;
    const ly = g(lx, lz);
    B.box(mat4(lx, ly, lz), 0.14, 4.2, 0.14, col('#2f3438'));
    B.box(mat4(lx, ly + 4.2, lz), 0.45, 0.45, 0.45, col('#f6e6c2'));
    glow(lx, ly + 4.45, lz, [3.0, 2.1, 1.1], 3.2);
  }
  // ride signs on poles
  for (const [r, si] of [
    [MERRY, 42],
    [CUPS, 43],
  ]) {
    const x = r.x + 8.2;
    const z = r.z + 3;
    const y = g(x, z);
    B.box(mat4(x, y, z), 0.12, 3.2, 0.12, col('#c9c4b8'));
    signs.quad(x, y + 3.6, z, 3.4, 0.9, 0, hSignUV(si), 2.4, true);
  }
  landmarks.push({ name: '遊園地', x: P.x, z: P.z - 8, color: '#ff9ad5' });
  landmarks.push({ name: 'ジェットコースター', x: -92, z: -182, color: '#ffcf4a', left: true });

  // ---------- helpers exposed for the shotengai ----------
  function banner(x, z, vi) {
    B.box(mat4(x, GROUND, z), 0.07, 5.1, 0.07, col('#c9c4b8'));
    B.box(mat4(x + 0.3, GROUND + 4.95, z), 0.6, 0.05, 0.05, col('#c9c4b8'));
    signs.quad(x + 0.3, GROUND + 3.75, z, 0.55, 2.3, Math.PI / 2, vSignUV(vi), 1.0, true);
  }

  // greengrocer: stepped display of crates of produce in front of the shop
  function yaoya(cx, zFront, w, facing) {
    const rot = facing > 0 ? 0 : Math.PI;
    const produce = ['#d8322a', '#f08a1f', '#6fae3a', '#f2d23a', '#9b2f5a', '#3f8a2e', '#e8e0c8'];
    for (let tier = 0; tier < 3; tier++) {
      const z = zFront + facing * (1.6 - tier * 0.5);
      const y = GROUND + 0.5 + tier * 0.35;
      for (let x = cx - w / 2 + 0.8; x < cx + w / 2 - 0.6; x += 0.62) {
        B.box(mat4(x, y, z, 0, rot, 0), 0.56, 0.22, 0.45, col('#9a7248'));
        B.box(mat4(x, y + 0.22, z, 0, rot, 0), 0.5, 0.1, 0.4, col(produce[Math.floor(R() * produce.length)]));
      }
      B.box(mat4(cx, GROUND, z, 0, rot, 0), w - 0.8, 0.5 + tier * 0.35, 0.44, col('#6a5038'));
    }
    signs.quad(cx, GROUND + 3.55, zFront + facing * 0.09, Math.min(w - 1, 4.8), 1.25, rot, hSignUV(34), 1.0);
    banner(cx - w / 2 + 0.4, zFront + facing * 2.4, 17);
    banner(cx + w / 2 - 0.4, zFront + facing * 2.4, 21);
    signs.quad(cx + 1.2, GROUND + 1.9, zFront + facing * 2.1, 1.3, 0.45, rot, hSignUV(40), 1.1);
    landmarks.push({ name: '八百屋', x: cx, z: zFront, color: '#9be05a' });
  }

  // bookstore: a cart of books outside (floating books are added as animated props)
  function bookstore(cx, zFront, w, facing) {
    const rot = facing > 0 ? 0 : Math.PI;
    const z = zFront + facing * 1.3;
    B.box(mat4(cx, GROUND, z, 0, rot, 0), w - 1.6, 0.8, 0.9, col('#6a4a30'));
    for (let x = cx - w / 2 + 1.0; x < cx + w / 2 - 1.0; x += 0.24) {
      B.box(mat4(x, GROUND + 0.8, z + (R() - 0.5) * 0.3, 0, rot + (R() - 0.5) * 0.3, 0), 0.2, 0.05 + R() * 0.08, 0.3, col(['#8a2d2d', '#2d4a8a', '#e0d6b8', '#2f6b4a', '#c9a13a'][Math.floor(R() * 5)]));
    }
    signs.quad(cx, GROUND + 3.55, zFront + facing * 0.09, Math.min(w - 1, 4.8), 1.25, rot, hSignUV(35), 1.0);
    banner(cx + w / 2 - 0.4, zFront + facing * 2.2, 18);
    signs.quad(cx - 1.6, GROUND + 2.2, zFront + facing * 0.1, 1.6, 0.5, rot, hSignUV(41), 1.0);
    landmarks.push({ name: '本屋', x: cx, z: zFront, color: '#8ab8ff' });
    return { x: cx, z: zFront + facing * 3, facing };
  }

  return { banner, yaoya, bookstore };
}
