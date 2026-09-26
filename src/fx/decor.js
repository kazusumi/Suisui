// Static reef life scattered over the sea floor and sunken roofs:
// coral, starfish, urchins, anemones and rocks — and glowing anemones in the trench.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../world/patchMaterial.js';
import { terrainHeight } from '../world/terrain.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function coralGeo() {
  const parts = [];
  const r = rng(3);
  for (let i = 0; i < 6; i++) {
    const h = 0.5 + r() * 0.7;
    const g = new THREE.CylinderGeometry(0.03, 0.07, h, 5).translate(0, h / 2, 0);
    g.rotateZ((r() - 0.5) * 1.1).rotateY(r() * 6);
    g.translate((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3);
    parts.push(g);
    const tip = new THREE.SphereGeometry(0.07, 5, 4).translate(0, h, 0);
    tip.rotateZ(0).translate(0, 0, 0);
    parts.push(tip);
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
function starGeo() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.07 : 0.2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);
  return g.index ? g.toNonIndexed() : g;
}
function urchinGeo() {
  const parts = [new THREE.SphereGeometry(0.12, 8, 6).scale(1, 0.7, 1)];
  const r = rng(9);
  for (let i = 0; i < 26; i++) {
    const d = new THREE.Vector3(r() - 0.5, r() * 0.8, r() - 0.5).normalize();
    const c = new THREE.ConeGeometry(0.012, 0.28, 3).translate(0, 0.14, 0);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
    parts.push(c);
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
function anemoneGeo() {
  const parts = [new THREE.CylinderGeometry(0.1, 0.14, 0.18, 8).translate(0, 0.09, 0)];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rr = 0.04 + (i % 2) * 0.05;
    parts.push(new THREE.CylinderGeometry(0.008, 0.018, 0.35, 3, 3).translate(Math.cos(a) * rr, 0.35, Math.sin(a) * rr));
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

export function createDecor(colliders, factor = 1) {
  const group = new THREE.Group();
  const r = rng(77);
  const sway = /* glsl */ `
    float sph = float(gl_InstanceID) * 1.7;
    float hy = max(transformed.y, 0.0);
    transformed.x += sin(uTime * 1.3 + sph) * 0.05 * hy * hy * 4.0;
    transformed.z += cos(uTime * 1.1 + sph) * 0.05 * hy * hy * 4.0;
  `;
  const lam = (key, vb = '') => patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff' }), { key, vertexBegin: vb });
  const types = [
    { name: 'coral', geo: coralGeo(), mat: lam('coral', sway), n: 900, cols: ['#ff7aa2', '#ff9f4a', '#b77aff', '#ffd05a', '#ff5a6a', '#7ae0d0'], sc: [0.7, 1.8] },
    { name: 'star', geo: starGeo(), mat: lam('star'), n: 450, cols: ['#ff6a3a', '#e8452e', '#3a7bff', '#ffb03a', '#c94aa0'], sc: [0.8, 1.4] },
    { name: 'urchin', geo: urchinGeo(), mat: lam('urchin'), n: 450, cols: ['#3a2440', '#1d1a24', '#5a2a5a'], sc: [0.8, 1.3] },
    { name: 'anemone', geo: anemoneGeo(), mat: lam('anemone', sway), n: 500, cols: ['#ff5ab8', '#8aff9a', '#ffd0e0', '#ff8a4a', '#b48aff'], sc: [0.8, 1.6] },
    { name: 'rock', geo: new THREE.IcosahedronGeometry(0.4, 0), mat: lam('rock'), n: 500, cols: ['#4f5652', '#5e6358', '#3f4543'], sc: [0.5, 2.2] },
  ];
  // glowing anemones in the trench (colours above 1.0 read as light)
  const glowMat = patchMaterial(new THREE.MeshBasicMaterial({ color: '#ffffff' }), { key: 'glowAnem', vertexBegin: sway });
  types.push({ name: 'glow', geo: anemoneGeo(), mat: glowMat, n: 260, cols: ['#40e0ff', '#ff5ae0', '#7aff9a', '#6a8aff'], sc: [1.0, 2.2], glow: true, deepOnly: true });

  // candidate spots: sunken roofs get a few pieces each
  const roofs = colliders.filter((c) => c.maxY < -2 && c.maxX - c.minX > 5 && c.maxZ - c.minZ > 5);

  for (const t of types) {
    const n = Math.round(t.n * Math.max(factor, 0.4));
    const im = new THREE.InstancedMesh(t.geo, t.mat, n);
    let k = 0;
    let guard = 0;
    while (k < n && guard++ < n * 30) {
      let x;
      let z;
      let y;
      if (!t.deepOnly && roofs.length && r() < 0.18) {
        const c = roofs[Math.floor(r() * roofs.length)];
        x = c.minX + 0.6 + r() * (c.maxX - c.minX - 1.2);
        z = c.minZ + 0.6 + r() * (c.maxZ - c.minZ - 1.2);
        y = c.maxY;
      } else {
        x = -130 + r() * 260;
        z = t.deepOnly ? -250 - r() * 85 : -335 + r() * 500;
        y = terrainHeight(x, z);
        if (y > -2.5) continue;
        if (t.deepOnly && y > -30) continue;
        // denser on the shallow reef flats in town and in the trench, sparser on the open sea floor
        if (y < -12 && y > -30 && r() < 0.5) continue;
      }
      const sc = t.sc[0] + r() * (t.sc[1] - t.sc[0]);
      _e.set((r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3);
      _q.setFromEuler(_e);
      _m.compose(_p.set(x, y - (t.name === 'rock' ? 0.15 * sc : 0), z), _q, _s.set(sc, sc * (t.name === 'rock' ? 0.6 : 1), sc));
      im.setMatrixAt(k, _m);
      _c.set(t.cols[Math.floor(r() * t.cols.length)]);
      if (t.glow) _c.multiplyScalar(2.2);
      im.setColorAt(k, _c);
      k++;
    }
    im.count = k;
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}
