// Sunken amusement park rides that still turn, very slowly, under water.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../world/patchMaterial.js';
import { terrainHeight } from '../world/terrain.js';
import { createGlows } from './glows.js';
import { MERRY, CUPS } from '../world/extras.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

function colored(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}

// Radial stripes baked into vertex colours (canopy / valance).
function striped(geo, a, b, n) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const p = geo.attributes.position;
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    // colour per triangle using its centroid angle
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const k = Math.floor(((Math.atan2(z, x) / (Math.PI * 2)) + 1) * n) % 2;
    const c = k ? ca : cb;
    for (let j = 0; j < 3; j++) arr.set([c.r, c.g, c.b], (i + j) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function horseGeometry() {
  const parts = [];
  const box = (w, h, d, x, y, z, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateX(rx);
    g.translate(x, y, z);
    parts.push(g);
  };
  box(0.42, 0.45, 1.1, 0, 0, 0); // body
  box(0.26, 0.6, 0.3, 0, 0.35, 0.55, -0.5); // neck
  box(0.24, 0.26, 0.5, 0, 0.62, 0.78); // head
  for (const [x, z] of [
    [-0.13, 0.4],
    [0.13, 0.4],
    [-0.13, -0.4],
    [0.13, -0.4],
  ])
    box(0.1, 0.55, 0.1, x, -0.45, z, z > 0 ? 0.5 : -0.5);
  box(0.08, 0.4, 0.12, 0, 0.05, -0.62, 0.7); // tail
  box(0.46, 0.08, 0.5, 0, 0.26, 0); // saddle
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

export class Rides {
  constructor() {
    this.group = new THREE.Group();
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#1a1210' }), { key: 'ride' });

    // ---------- merry-go-round ----------
    const my = terrainHeight(MERRY.x, MERRY.z);
    const base = new THREE.Mesh(
      mergeGeometries([
        colored(new THREE.CylinderGeometry(6.6, 6.9, 0.6, 32).translate(0, 0.3, 0), '#b89e7a'),
        colored(new THREE.CylinderGeometry(0.9, 0.9, 7.4, 16).translate(0, 3.7, 0), '#e8c9d6'),
      ]),
      mat
    );
    base.position.set(MERRY.x, my, MERRY.z);
    this.group.add(base);

    this.merry = new THREE.Group();
    this.merry.position.set(MERRY.x, my + 0.6, MERRY.z);
    const spin = mergeGeometries([
      colored(new THREE.CylinderGeometry(6.3, 6.3, 0.22, 32).translate(0, 0.11, 0), '#f1e4cc'),
      striped(new THREE.ConeGeometry(7.2, 2.4, 24, 1).translate(0, 5.9, 0), '#e8465f', '#fbf1e2', 24),
      striped(new THREE.CylinderGeometry(7.2, 7.2, 0.7, 24, 1, true).translate(0, 4.4, 0), '#fbf1e2', '#2f8fb0', 24),
      colored(new THREE.SphereGeometry(0.45, 10, 8).translate(0, 7.3, 0), '#ffd36b'),
    ]);
    this.merry.add(new THREE.Mesh(spin, mat));
    // brass poles
    const poleGeo = colored(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6).translate(0, 2.2, 0), '#e2b44a');
    const nH = 14;
    const poles = new THREE.InstancedMesh(poleGeo, mat, nH);
    this.horses = new THREE.InstancedMesh(colored(horseGeometry(), '#ffffff'), mat, nH);
    this.horses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.horseSlots = [];
    const hc = ['#f7f3ea', '#f3c2d4', '#bfe3d6', '#f1d27a', '#c9d6f3', '#e6b48c'];
    for (let i = 0; i < nH; i++) {
      const outer = i < 8;
      const a = (i / (outer ? 8 : 6)) * Math.PI * 2 + (outer ? 0 : 0.3);
      const r = outer ? 5.0 : 3.3;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      _m.makeTranslation(x, 0.2, z);
      poles.setMatrixAt(i, _m);
      this.horses.setColorAt(i, new THREE.Color(hc[i % hc.length]));
      this.horseSlots.push({ x, z, a, ph: i * 0.9 });
    }
    this.merry.add(poles, this.horses);
    // bulbs under the canopy rim
    const bulbs = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      bulbs.push({ x: Math.cos(a) * 7.0, y: 4.1, z: Math.sin(a) * 7.0, r: 3.0, g: 2.2, b: 1.1, s: 0.9 });
    }
    bulbs.push({ x: 0, y: 7.3, z: 0, r: 3.0, g: 2.4, b: 1.0, s: 3.5 });
    this.merry.add(createGlows(bulbs));
    this.group.add(this.merry);

    // ---------- coffee cups ----------
    const cy = terrainHeight(CUPS.x, CUPS.z);
    const cupBase = new THREE.Mesh(colored(new THREE.CylinderGeometry(7, 7.3, 0.5, 32).translate(0, 0.25, 0), '#9fb6c2'), mat);
    cupBase.position.set(CUPS.x, cy, CUPS.z);
    this.group.add(cupBase);
    this.table = new THREE.Group();
    this.table.position.set(CUPS.x, cy + 0.5, CUPS.z);
    this.table.add(
      new THREE.Mesh(
        mergeGeometries([
          striped(new THREE.CylinderGeometry(6.5, 6.5, 0.18, 32).translate(0, 0.09, 0), '#f4efe6', '#7fc6d8', 16),
          colored(new THREE.CylinderGeometry(1.1, 1.3, 1.2, 16).translate(0, 0.6, 0), '#f3d27a'),
        ]),
        mat
      )
    );
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector2(0.55 + Math.sin(t * Math.PI * 0.5) * 0.75, t * 1.2));
    }
    const cupGeo = colored(new THREE.LatheGeometry(pts, 20), '#ffffff');
    const cupMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#1a1210' }), { key: 'cup' });
    this.cups = new THREE.InstancedMesh(cupGeo, cupMat, 5);
    this.cups.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const cc = ['#e8567a', '#6fc3e0', '#f2c94c', '#9be07a', '#c9a0f0'];
    cc.forEach((c, i) => this.cups.setColorAt(i, new THREE.Color(c)));
    this.table.add(this.cups);
    this.group.add(this.table);
  }

  update(t) {
    // ~25 s per turn for the merry-go-round
    this.merry.rotation.y = t * 0.25;
    this.horseSlots.forEach((h, i) => {
      _p.set(h.x, 1.25 + Math.sin(t * 1.3 + h.ph) * 0.35, h.z);
      _e.set(0, -h.a + Math.PI, Math.sin(t * 1.3 + h.ph + 1.2) * 0.12);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      this.horses.setMatrixAt(i, _m);
    });
    this.horses.instanceMatrix.needsUpdate = true;

    this.table.rotation.y = -t * 0.12;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      _p.set(Math.cos(a) * 4, 0.18, Math.sin(a) * 4);
      _e.set(0, t * (0.35 + i * 0.07) + i, 0);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      this.cups.setMatrixAt(i, _m);
    }
    this.cups.instanceMatrix.needsUpdate = true;
  }
}
