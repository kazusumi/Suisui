import * as THREE from 'three';
import { patchMaterial } from './patchMaterial.js';

export const GROUND = -3.2;
export const ISLAND = { x: 62, z: -42, r: 13 };

const sstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

export function terrainHeight(x, z) {
  const sea = -15 + 1.4 * Math.sin(x * 0.045) * Math.cos(z * 0.037) + 0.6 * Math.sin(x * 0.13 + z * 0.08);
  const side = 1 - sstep(100, 128, Math.abs(x));
  const cityZ = sstep(80, 50, z) * side;
  let h = lerp(sea, GROUND, cityZ);
  // the deep, sunken district
  const deep = sstep(-112, -142, z) * side;
  const deepH = -22 + 0.8 * Math.sin(x * 0.07) + 0.6 * Math.cos(z * 0.09);
  h = lerp(h, deepH, deep);
  // small shrine island in the park
  const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  const isl = 1 - sstep(ISLAND.r - 5, ISLAND.r + 5, di);
  h = lerp(h, 1.5 - di * 0.05, isl);
  return h;
}

export function createTerrain() {
  const W = 560;
  const D = 640;
  const geo = new THREE.PlaneGeometry(W, D, 170, 194);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -40);
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const sand = new THREE.Color('#b8a47e');
  const concrete = new THREE.Color('#8f8a80');
  const silt = new THREE.Color('#4b5a4c');
  const grass = new THREE.Color('#5c7a35');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const h = terrainHeight(x, z);
    p.setY(i, h);
    const n = Math.sin(x * 0.9) * Math.cos(z * 0.7) * 0.5 + Math.sin(x * 0.23 + z * 0.31) * 0.5;
    const side = 1 - sstep(100, 128, Math.abs(x));
    const city = sstep(80, 50, z) * side * (1 - sstep(-112, -142, z) * side);
    c.copy(sand).lerp(concrete, city);
    c.lerp(silt, sstep(-8, -20, h) * (1 - city) * 0.8 + sstep(-112, -142, z) * side * 0.6);
    if (h > -0.3) c.copy(grass).lerp(sand, sstep(0.6, -0.3, h));
    c.multiplyScalar(0.85 + n * 0.12);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'terrain' });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

// Bakes a data texture used by the water shader:
//  R: water depth (0..1 => 0..25 m), G: proximity to things sticking out of the water (shore foam)
export const BAKE = { x0: -170, x1: 170, z0: -270, z1: 190, size: 512 };

export function bakeWaterData(obstacles) {
  const N = BAKE.size;
  const data = new Uint8Array(N * N * 4);
  const dist = new Float32Array(N * N);
  const cw = (BAKE.x1 - BAKE.x0) / N;
  const ch = (BAKE.z1 - BAKE.z0) / N;
  const INF = 1e6;
  for (let j = 0; j < N; j++) {
    const z = BAKE.z0 + (j + 0.5) * ch;
    for (let i = 0; i < N; i++) {
      const x = BAKE.x0 + (i + 0.5) * cw;
      const h = terrainHeight(x, z);
      const k = j * N + i;
      data[k * 4] = Math.min(255, Math.max(0, (-h / 25) * 255));
      dist[k] = h > -0.15 ? 0 : INF;
    }
  }
  for (const o of obstacles) {
    const i0 = Math.max(0, Math.floor((o.minX - BAKE.x0) / cw));
    const i1 = Math.min(N - 1, Math.floor((o.maxX - BAKE.x0) / cw));
    const j0 = Math.max(0, Math.floor((o.minZ - BAKE.z0) / ch));
    const j1 = Math.min(N - 1, Math.floor((o.maxZ - BAKE.z0) / ch));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) dist[j * N + i] = 0;
  }
  // two-pass chamfer distance transform (in metres)
  const dd = Math.hypot(cw, ch);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      let v = dist[k];
      if (i > 0) v = Math.min(v, dist[k - 1] + cw);
      if (j > 0) v = Math.min(v, dist[k - N] + ch);
      if (i > 0 && j > 0) v = Math.min(v, dist[k - N - 1] + dd);
      if (i < N - 1 && j > 0) v = Math.min(v, dist[k - N + 1] + dd);
      dist[k] = v;
    }
  for (let j = N - 1; j >= 0; j--)
    for (let i = N - 1; i >= 0; i--) {
      const k = j * N + i;
      let v = dist[k];
      if (i < N - 1) v = Math.min(v, dist[k + 1] + cw);
      if (j < N - 1) v = Math.min(v, dist[k + N] + ch);
      if (i < N - 1 && j < N - 1) v = Math.min(v, dist[k + N + 1] + dd);
      if (i > 0 && j < N - 1) v = Math.min(v, dist[k + N - 1] + dd);
      dist[k] = v;
    }
  for (let k = 0; k < N * N; k++) {
    const g = Math.max(0, 1 - dist[k] / 3.5);
    data[k * 4 + 1] = Math.round(g * g * 255);
    data[k * 4 + 2] = 0;
    data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
