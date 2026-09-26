// Sunken amusement park rides that still turn, very slowly, under water.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../world/patchMaterial.js';
import { terrainHeight } from '../world/terrain.js';
import { createGlows } from './glows.js';
import { MERRY, CUPS, WHEEL, COASTER } from '../world/extras.js';
import { Builder, KIND, mat4 } from '../world/builder.js';

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
  constructor(facadeMat) {
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
    const cupGeo = mergeGeometries([
      colored(new THREE.LatheGeometry(pts, 20), '#ffffff'),
      // the steering wheel in the middle of each cup
      colored(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 8).translate(0, 0.35, 0), '#dcdcdc'),
      colored(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20).translate(0, 0.72, 0), '#f5f0e6'),
    ]);
    const cupMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#1a1210' }), { key: 'cup' });
    this.cups = new THREE.InstancedMesh(cupGeo, cupMat, 5);
    this.cups.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const cc = ['#e8567a', '#6fc3e0', '#f2c94c', '#9be07a', '#c9a0f0'];
    cc.forEach((c, i) => this.cups.setColorAt(i, new THREE.Color(c)));
    this.table.add(this.cups);
    this.group.add(this.table);
    this.cupAng = [0, 1, 2, 3, 4];
    this.cupVel = 0;
    this.cup0 = new THREE.Matrix4();
    this.horse0 = new THREE.Matrix4();

    // Ferris wheel + roller coaster share the city's facade material (lit windows etc.)
    this.wheel = new FerrisWheel(facadeMat);
    this.coaster = new Coaster(facadeMat, (x, z, down) => this.onCross && this.onCross(x, z, down));
    this.group.add(this.wheel.group, this.coaster.group);
  }

  update(t, dt) {
    // ~25 s per turn for the merry-go-round
    this.merry.rotation.y = t * 0.25;
    this.horseSlots.forEach((h, i) => {
      _p.set(h.x, 1.25 + Math.sin(t * 1.3 + h.ph) * 0.35, h.z);
      _e.set(0, -h.a + Math.PI, Math.sin(t * 1.3 + h.ph + 1.2) * 0.12);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      this.horses.setMatrixAt(i, _m);
      if (i === 0) this.horse0.copy(_m);
    });
    this.horses.instanceMatrix.needsUpdate = true;

    this.table.rotation.y = -t * 0.12;
    // the rider's cup (0) also spins with whatever the rider puts into the wheel
    this.cupVel *= Math.exp(-dt * 0.35);
    for (let i = 0; i < 5; i++) {
      this.cupAng[i] += (0.35 + i * 0.07) * dt + (i === 0 ? this.cupVel * dt : 0);
      const a = (i / 5) * Math.PI * 2;
      _p.set(Math.cos(a) * 4, 0.18, Math.sin(a) * 4);
      _e.set(0, this.cupAng[i], 0);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      this.cups.setMatrixAt(i, _m);
      if (i === 0) this.cup0.copy(_m);
    }
    this.cups.instanceMatrix.needsUpdate = true;
    this.wheel.update(t, dt);
    this.coaster.update(t, dt);
  }

  // Put a rider's eye position + base orientation for a ride into pos/quat.
  seat(id, pos, quat) {
    if (id === 'merry') {
      this.merry.updateMatrixWorld();
      _m.multiplyMatrices(this.merry.matrixWorld, this.horse0);
      pos.set(0, 0.95, -0.05).applyMatrix4(_m);
      quat.setFromRotationMatrix(_m).multiply(_flip);
    } else if (id === 'cups') {
      this.table.updateMatrixWorld();
      _m.multiplyMatrices(this.table.matrixWorld, this.cup0);
      pos.set(0, 1.75, 0.5).applyMatrix4(_m);
      quat.setFromRotationMatrix(_m);
    } else if (id === 'wheel') this.wheel.seat(pos, quat);
    else if (id === 'coaster') this.coaster.seat(pos, quat);
  }
}

const _flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

// ---------------- Ferris wheel (rim, spokes and gondolas turn; the stand is in city.js) ----------------
export class FerrisWheel {
  constructor(facadeMat) {
    const fy = terrainHeight(WHEEL.x, WHEEL.z);
    this.hub = new THREE.Vector3(WHEEL.x, fy + 17, WHEEL.z);
    this.group = new THREE.Group();
    this.group.position.copy(this.hub);
    this.group.rotation.set(0, WHEEL.rotY, WHEEL.tilt, 'YXZ');
    this.spinner = new THREE.Group();
    this.group.add(this.spinner);
    const R0 = WHEEL.R;
    this.R0 = R0;
    const B = new Builder();
    const rim = new THREE.Color('#e8e2d4');
    const segs = 36;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const len = (2 * Math.PI * R0) / segs + 0.1;
      for (const off of [-0.8, 0.8]) {
        const m = mat4(Math.cos(a) * R0, Math.sin(a) * R0, off, 0, 0, a);
        B.box(m.multiply(mat4(0, -len / 2, 0)), 0.3, len, 0.3, rim);
      }
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      for (const off of [-0.8, 0.8]) B.box(mat4(0, 0, off, 0, 0, a - Math.PI / 2), 0.14, R0, 0.14, rim);
      B.box(mat4(Math.cos(a) * R0, Math.sin(a) * R0, -0.9, Math.PI / 2, 0, 0), 0.12, 1.8, 0.12, rim);
    }
    this.spinner.add(new THREE.Mesh(B.build(), facadeMat));
    const lights = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      lights.push({ x: Math.cos(a) * R0, y: Math.sin(a) * R0, z: 0.9, r: i % 2 ? 3.0 : 1.2, g: i % 2 ? 1.2 : 2.4, b: i % 2 ? 1.8 : 3.0, s: 1.3 });
    }
    this.spinner.add(createGlows(lights));
    // gondolas: stay upright while the rim turns
    const G = new Builder();
    const white = new THREE.Color('#ffffff');
    // gondolas hang in front of the rim so riders see out freely
    G.box(mat4(0, -1.9, 1.8), 1.6, 1.8, 1.6, white, { side: [KIND.CAR, 3, 0], front: [KIND.CAR, 3, 0], topColor: new THREE.Color('#dddddd') });
    G.box(mat4(0, -0.1, 1.8), 1.8, 0.2, 1.8, new THREE.Color('#cfcfcf'), { bottom: true });
    G.box(mat4(0, -0.05, 1.3), 0.12, 0.12, 1.0, rim, { bottom: true });
    this.gondolas = new THREE.InstancedMesh(G.build(), facadeMat, 18);
    this.gondolas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gondolas.frustumCulled = false;
    const gc = ['#e56b5d', '#5bb3c4', '#e8c35a', '#8ac47a', '#c98ad0'];
    for (let i = 0; i < 18; i++) this.gondolas.setColorAt(i, new THREE.Color(gc[i % gc.length]));
    this.group.add(this.gondolas);
    this.angle = 0;
    this.g0 = new THREE.Matrix4();
  }
  update(t, dt) {
    // one turn every ~100 s
    this.angle += dt * 0.063;
    this.spinner.rotation.z = this.angle;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + this.angle;
      _p.set(Math.cos(a) * this.R0, Math.sin(a) * this.R0, 0);
      _q.setFromAxisAngle(_z, Math.sin(t * 0.8 + i) * 0.03);
      _m.compose(_p, _q, _s);
      this.gondolas.setMatrixAt(i, _m);
      if (i === 0) this.g0.copy(_m);
    }
    this.gondolas.instanceMatrix.needsUpdate = true;
  }
  seat(pos, quat) {
    this.group.updateMatrixWorld();
    _m.multiplyMatrices(this.group.matrixWorld, this.g0);
    pos.set(0, -1.1, 1.8).applyMatrix4(_m);
    // look out of the gondola, towards the town
    quat.setFromRotationMatrix(this.group.matrixWorld).multiply(_flip);
  }
}
const _z = new THREE.Vector3(0, 0, 1);

// ---------------- roller coaster ----------------
export class Coaster {
  constructor(facadeMat, onCross) {
    this.onCross = onCross;
    const pts = COASTER.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    const N = Math.ceil(this.length / 0.8);
    this.N = N;
    const frames = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const p = this.curve.getPointAt(u);
      const T = this.curve.getTangentAt(u).normalize();
      const r = new THREE.Vector3().crossVectors(T, up).normalize();
      const n = new THREE.Vector3().crossVectors(r, T).normalize();
      frames.push({ p, T, r, n });
    }
    this.frames = frames;
    this.top = Math.max(...pts.map((p) => p.y));
    const B = new Builder();
    const railC = new THREE.Color('#e04a3a');
    const tieC = new THREE.Color('#6f6a62');
    const postC = new THREE.Color('#d9d4c8');
    const basis = new THREE.Matrix4();
    const crossings = [];
    for (let i = 0; i < N; i++) {
      const a = frames[i];
      const b = frames[(i + 1) % N];
      const len = a.p.distanceTo(b.p) + 0.05;
      const mid = a.p.clone().add(b.p).multiplyScalar(0.5);
      const T = b.p.clone().sub(a.p).normalize();
      const r = new THREE.Vector3().crossVectors(T, up).normalize();
      const n = new THREE.Vector3().crossVectors(r, T).normalize();
      // right-handed frame (x = -right) so normals stay outward
      basis.makeBasis(r.clone().negate(), n, T);
      for (const side of [-0.55, 0.55]) {
        const m = basis.clone().setPosition(mid.clone().addScaledVector(r, side));
        B.box(m.multiply(mat4(0, -0.06, 0)), 0.12, 0.12, len, railC, { bottom: true });
      }
      const spine = basis.clone().setPosition(mid.clone().addScaledVector(n, -0.35));
      B.box(spine.multiply(mat4(0, -0.12, 0)), 0.26, 0.24, len, railC, { bottom: true });
      if (i % 2 === 0) B.box(basis.clone().setPosition(a.p).multiply(mat4(0, -0.2, 0)), 1.3, 0.1, 0.25, tieC, { bottom: true });
      if (i % 9 === 0) {
        const g = terrainHeight(a.p.x, a.p.z);
        const h = a.p.y - 0.45 - g;
        if (h > 1.5) B.box(mat4(a.p.x, g, a.p.z), 0.35, h, 0.35, postC);
      }
      if ((a.p.y < 0) !== (b.p.y < 0)) crossings.push(mid);
    }
    this.crossings = crossings;
    this.track = new THREE.Mesh(B.build(), facadeMat);
    // train of three cars
    const C = new Builder();
    const white = new THREE.Color('#ffffff');
    C.box(mat4(0, 0, 0), 1.5, 0.7, 2.1, white, { topColor: new THREE.Color('#2a2a2a') });
    C.box(mat4(0, 0.7, -0.35), 1.3, 0.55, 0.12, white);
    C.box(mat4(0, 0.7, 0.55), 1.3, 0.55, 0.12, white);
    C.box(mat4(0, 0.1, 1.05, -0.5, 0, 0), 1.4, 0.5, 0.6, new THREE.Color('#f2d23a'));
    this.cars = new THREE.InstancedMesh(C.build(), facadeMat, 3);
    this.cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cars.frustumCulled = false;
    ['#2f7fd1', '#f2c230', '#e0463c'].forEach((c, i) => this.cars.setColorAt(i, new THREE.Color(c)));
    this.group = new THREE.Group();
    this.group.add(this.track, this.cars);
    this.s = 0;
    this.v = 4;
    this.car0 = new THREE.Matrix4();
    this.prevY = [0, 0, 0];
    this.station = frames[0].p.clone();
  }
  frameAt(s) {
    const L = this.length;
    s = ((s % L) + L) % L;
    const f = (s / L) * this.N;
    const i = Math.floor(f) % this.N;
    const j = (i + 1) % this.N;
    const t = f - Math.floor(f);
    const a = this.frames[i];
    const b = this.frames[j];
    _fp.lerpVectors(a.p, b.p, t);
    _fT.lerpVectors(a.T, b.T, t).normalize();
    return { p: _fp, T: _fT };
  }
  update(t, dt) {
    const f0 = this.frameAt(this.s);
    const y = f0.p.y;
    // chain lift on the climb out of the station, gravity + drag after that
    const lifting = this.s / this.length < 0.14;
    let target = lifting ? 4.5 : Math.max(4, Math.sqrt(2 * 9.8 * Math.max(this.top + 1.2 - y, 0)) * 0.9);
    if (y < 0) target *= 0.72;
    this.v += (target - this.v) * Math.min(dt * 1.5, 1);
    this.s = (this.s + this.v * dt) % this.length;
    for (let k = 0; k < 3; k++) {
      const f = this.frameAt(this.s - k * 2.35);
      const T = f.T;
      const r = _r.crossVectors(T, _up).normalize();
      const n = _n.crossVectors(r, T).normalize();
      _m.makeBasis(_l.copy(r).negate(), n, T).setPosition(f.p.x + n.x * 0.1, f.p.y + n.y * 0.1, f.p.z + n.z * 0.1);
      this.cars.setMatrixAt(k, _m);
      if (k === 0) this.car0.copy(_m);
      const cy = f.p.y;
      if (this.onCross && (cy < 0) !== (this.prevY[k] < 0)) this.onCross(f.p.x, f.p.z, cy < 0);
      this.prevY[k] = cy;
    }
    this.cars.instanceMatrix.needsUpdate = true;
  }
  seat(pos, quat) {
    pos.set(0, 1.75, -0.2).applyMatrix4(this.car0);
    // car forward is +z; the camera looks down -z
    quat.setFromRotationMatrix(this.car0).multiply(_flip);
  }
}
const _fp = new THREE.Vector3();
const _fT = new THREE.Vector3();
const _r = new THREE.Vector3();
const _n = new THREE.Vector3();
const _l = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
