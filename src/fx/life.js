// Living things and drifting things: fish schools, seaweed, birds, floating objects.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../world/patchMaterial.js';
import { terrainHeight } from '../world/terrain.js';
import { waveHeight, waveNormal } from '../waves.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _zero = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const _q2 = new THREE.Quaternion();

// ---------------- fish ----------------
function fishGeometry() {
  const body = new THREE.SphereGeometry(0.5, 10, 6);
  body.scale(0.2, 0.36, 1);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.42, 0, 0.2, -0.75, 0, -0.2, -0.75], 3));
  tail.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  tail.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 1, 1, 0], 2));
  const fin = new THREE.BufferGeometry();
  fin.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.16, 0.1, 0, 0.3, -0.15, 0, 0.14, -0.25], 3));
  fin.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  fin.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 1, 1, 0], 2));
  return mergeGeometries([body.toNonIndexed(), tail, fin]);
}

export class Fish {
  constructor(schools, factor) {
    this.schools = [];
    const perSchool = [34, 30, 40, 26, 44, 50, 36, 22, 26, 30];
    const total = perSchool.reduce((a, b) => a + b, 0);
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#0a1a1c', side: THREE.DoubleSide }), {
      key: 'fish',
      vertexBegin: /* glsl */ `
        float fph = float(gl_InstanceID) * 1.37;
        float tailW = smoothstep(0.25, -0.75, transformed.z);
        transformed.x += sin(transformed.z * 4.0 + uTime * 10.0 + fph) * 0.13 * tailW;
      `,
    });
    this.mesh = new THREE.InstancedMesh(fishGeometry(), mat, total);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const palettes = [
      ['#b9c9d1', '#9fb4c0', '#d0dde2'],
      ['#e0894a', '#f0b25c', '#d9d1c4'],
      ['#6a8fb0', '#8fb2c9', '#c4d6de'],
      ['#e8d27a', '#caa24a', '#ffffff'],
    ];
    let offset = 0;
    schools.forEach((s, si) => {
      const n = perSchool[si % perSchool.length];
      const pal = palettes[si % palettes.length];
      const fish = [];
      const scale = s[1] < -6 ? 1.1 : 0.62;
      for (let i = 0; i < n; i++) {
        const o = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 2).multiplyScalar(s[3] * 0.35);
        const p = new THREE.Vector3(s[0], s[1], s[2]).add(o);
        fish.push({ p, v: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5), o, sc: scale * (0.7 + Math.random() * 0.6) });
        _c.set(pal[Math.floor(Math.random() * pal.length)]);
        this.mesh.setColorAt(offset + i, _c);
      }
      this.schools.push({ anchor: new THREE.Vector3(s[0], s[1], s[2]), r: s[3], fish, offset, ph: Math.random() * 10, flee: new THREE.Vector3(), target: new THREE.Vector3() });
      offset += n;
    });
    this.total = total;
    this.setFactor(factor);
  }

  setFactor(f) {
    this.factor = f;
    // hide a fraction of each school
    this.visibleFrac = f;
  }

  update(dt, t, player, playerSpeed) {
    const dtc = Math.min(dt, 0.05);
    for (const s of this.schools) {
      const dx = s.anchor.x - player.x;
      const dz = s.anchor.z - player.z;
      const far = dx * dx + dz * dz > 170 * 170;
      const tgt = s.target.set(
        s.anchor.x + Math.sin(t * 0.09 + s.ph) * s.r,
        s.anchor.y + Math.sin(t * 0.17 + s.ph) * Math.min(1.2, s.r * 0.15),
        s.anchor.z + Math.cos(t * 0.07 + s.ph * 2) * s.r
      );
      // the whole school drifts away from the player
      _v.subVectors(tgt, player);
      const dt2 = _v.length();
      if (dt2 < 12) s.flee.addScaledVector(_v.normalize(), (12 - dt2) * dtc * 1.2);
      s.flee.multiplyScalar(1 - dtc * 0.15);
      if (s.flee.length() > 14) s.flee.setLength(14);
      tgt.add(s.flee);
      const nVis = Math.floor(s.fish.length * this.visibleFrac);
      for (let i = 0; i < s.fish.length; i++) {
        const f = s.fish[i];
        const idx = s.offset + i;
        if (i >= nVis) {
          _m.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(idx, _m);
          continue;
        }
        if (!far) {
          const a = t * 0.3 + i;
          _p.set(f.o.x * Math.cos(a * 0.2) - f.o.z * Math.sin(a * 0.2), f.o.y, f.o.x * Math.sin(a * 0.2) + f.o.z * Math.cos(a * 0.2));
          _v.copy(tgt).add(_p).sub(f.p);
          f.v.addScaledVector(_v, dtc * 0.9);
          // flee the swimmer
          _v.subVectors(f.p, player);
          const d = _v.length();
          const fr = 5 + playerSpeed * 0.8;
          if (d < fr) f.v.addScaledVector(_v.normalize(), ((fr - d) / fr) * 22 * dtc);
          f.v.multiplyScalar(1 - dtc * 0.9);
          const sp = f.v.length();
          if (sp > 7) f.v.multiplyScalar(7 / sp);
          if (sp < 0.5) f.v.multiplyScalar(0.5 / Math.max(sp, 1e-3));
          f.p.addScaledVector(f.v, dtc);
          if (f.p.y > -0.45) {
            f.p.y = -0.45;
            f.v.y = -Math.abs(f.v.y);
          }
          const g = terrainHeight(f.p.x, f.p.z) + 0.5;
          if (f.p.y < g) {
            f.p.y = g;
            f.v.y = Math.abs(f.v.y);
          }
        }
        _m.lookAt(f.v, _zero, _up);
        _q.setFromRotationMatrix(_m);
        _m.compose(f.p, _q, _s.setScalar(f.sc));
        this.mesh.setMatrixAt(idx, _m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- seaweed / kelp ----------------
export function createSeaweed(factor) {
  const blade = new THREE.PlaneGeometry(0.35, 1, 1, 7);
  blade.translate(0, 0.5, 0);
  const blade2 = blade.clone().rotateY(Math.PI / 2);
  const geo = mergeGeometries([blade, blade2]);
  const items = [];
  const rnd = mulberry(99);
  const tryPlace = (x, z, hMin, hMax) => {
    const g = terrainHeight(x, z);
    if (g > -1.5) return;
    const h = Math.min(hMin + rnd() * (hMax - hMin), -g - 0.6);
    if (h < 0.5) return;
    items.push({ x, y: g - 0.1, z, h, w: 0.7 + rnd() * 0.8, r: rnd() * Math.PI });
  };
  const n = Math.floor(900 * factor);
  for (let i = 0; i < n; i++) {
    const t = rnd();
    if (t < 0.4) tryPlace(-95 + rnd() * 190, -135 - rnd() * 95, 1.5, 6);
    else if (t < 0.65) tryPlace(-80 + rnd() * 160, 58 + rnd() * 95, 3, 11);
    else if (t < 0.8) tryPlace(10 + rnd() * 90, -2 - rnd() * 75, 0.8, 2.4);
    else tryPlace(-104 + rnd() * 208, -110 + rnd() * 155, 0.5, 1.8);
  }
  const mat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }), {
    key: 'weed',
    vertexBegin: /* glsl */ `
      float wph = float(gl_InstanceID) * 2.17;
      float yy = transformed.y;
      transformed.x += sin(uTime * 1.1 + wph + yy * 1.6) * 0.35 * yy * yy;
      transformed.z += cos(uTime * 0.8 + wph + yy * 1.2) * 0.25 * yy * yy;
    `,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    _q.setFromAxisAngle(_up, it.r);
    _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.w, it.h, it.w));
    mesh.setMatrixAt(i, _m);
    _c.setHSL(0.18 + rnd() * 0.12, 0.45, 0.16 + rnd() * 0.1);
    mesh.setColorAt(i, _c);
  });
  mesh.computeBoundingSphere();
  return mesh;
}

// ---------------- birds ----------------
export class Birds {
  constructor(n = 14) {
    const body = new THREE.BoxGeometry(0.16, 0.12, 0.6);
    const wings = new THREE.BufferGeometry();
    wings.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0.15, 0, 0, -0.15, -1.1, 0, -0.05, 0, 0, -0.15, 0, 0, 0.15, 1.1, 0, -0.05], 3)
    );
    wings.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    wings.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    const geo = mergeGeometries([body.toNonIndexed(), wings]);
    const mat = patchMaterial(new THREE.MeshBasicMaterial({ color: '#1a1418', side: THREE.DoubleSide }), {
      key: 'bird',
      vertexBegin: /* glsl */ `
        float bph = float(gl_InstanceID) * 0.9;
        float flap = sin(uTime * 7.0 + bph) * step(0.0, sin(uTime * 0.7 + bph * 1.7) + 0.3);
        transformed.y += flap * abs(transformed.x) * 0.7;
      `,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.birds = [];
    for (let i = 0; i < n; i++) {
      const flock = i < n / 2 ? 0 : 1;
      this.birds.push({
        flock,
        r: flock ? 70 : 110,
        off: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 12),
        s: 1.4 + Math.random() * 0.6,
      });
    }
  }
  update(t) {
    const c = [
      [-10, 38, -50, 0.045],
      [30, 26, 10, -0.06],
    ];
    this.birds.forEach((b, i) => {
      const [cx, cy, cz, sp] = c[b.flock];
      const a = t * sp + b.off.x * 0.01;
      _p.set(cx + Math.cos(a) * b.r + b.off.x, cy + b.off.y + Math.sin(t * 0.3 + i) * 1.5, cz + Math.sin(a) * b.r + b.off.z);
      _v.set(-Math.sin(a) * sp, 0, Math.cos(a) * sp).normalize();
      _m.lookAt(_v, _zero, _up);
      _q.setFromRotationMatrix(_m);
      _m.compose(_p, _q, _s.setScalar(b.s));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- floating objects ----------------
export class Floaters {
  constructor(colliders) {
    this.colliders = colliders;
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff' }), { key: 'float' });
    const defs = [];
    const rnd = mulberry(5);
    const spot = (xa, xb, za, zb) => [xa + rnd() * (xb - xa), za + rnd() * (zb - za)];
    // beach balls
    const ballCols = ['#e8473a', '#f2c230', '#3a8fe0', '#f4f1ea', '#3fbf7f'];
    for (let i = 0; i < 9; i++) defs.push({ type: 0, at: i < 3 ? spot(-6, 6, 60, 120) : spot(-6, 6, -60, 40), col: ballCols[i % ballCols.length], sink: 0.12 });
    // wooden crates & planks
    for (let i = 0; i < 8; i++) defs.push({ type: 1, at: spot(-60, 60, -80, 45), col: '#8a6a45', sink: 0.25 });
    for (let i = 0; i < 8; i++) defs.push({ type: 2, at: spot(-90, 90, -100, 60), col: '#9b7b55', sink: 0.03 });
    // lifebuoys
    for (let i = 0; i < 4; i++) defs.push({ type: 3, at: spot(-40, 40, 20, 90), col: '#e8e2d6', sink: 0.05 });
    // lily pads around the shrine island
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 15 + rnd() * 10;
      defs.push({ type: 4, at: [62 + Math.cos(a) * r, -42 + Math.sin(a) * r], col: rnd() < 0.2 ? '#e8a7c0' : '#4f7d3a', sink: -0.02 });
    }
    // sakura petals drifting on the surface of the park
    for (let i = 0; i < 140; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 8 + rnd() * 30;
      defs.push({ type: 6, at: [58 + Math.cos(a) * r, -42 + Math.sin(a) * r * 0.9], col: rnd() < 0.5 ? '#ffc4dc' : '#ffdbe8', sink: -0.01, petal: true });
    }
    // floating traffic cones
    for (let i = 0; i < 4; i++) defs.push({ type: 5, at: spot(-8, 8, -100, 30), col: '#e8622c', sink: 0.1 });
    const geos = [
      new THREE.SphereGeometry(0.35, 14, 10),
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.BoxGeometry(2.4, 0.1, 0.32),
      new THREE.TorusGeometry(0.45, 0.13, 8, 20).rotateX(Math.PI / 2),
      new THREE.CylinderGeometry(0.55, 0.55, 0.03, 12),
      new THREE.ConeGeometry(0.25, 0.7, 10).rotateZ(Math.PI / 2),
      new THREE.CircleGeometry(0.07, 5).rotateX(-Math.PI / 2),
    ];
    this.meshes = geos.map((g, ti) => {
      const list = defs.filter((d) => d.type === ti);
      const im = new THREE.InstancedMesh(g, mat, list.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      list.forEach((d, i) => {
        im.setColorAt(i, _c.set(d.col));
        if (ti === 0) {
          // stripe the balls slightly lighter per instance
        }
      });
      im.userData.list = list;
      return im;
    });
    this.items = defs.map((d) => ({
      ...d,
      x: d.at[0],
      z: d.at[1],
      ph: rnd() * 100,
      spin: (rnd() - 0.5) * 0.3,
      yaw: rnd() * Math.PI * 2,
      dx: (rnd() - 0.5) * 0.25,
      dz: (rnd() - 0.5) * 0.25,
    }));
    this.meshes.forEach((im) => (im.userData.list = im.userData.list.map((d) => this.items[defs.indexOf(d)])));
    this.group = new THREE.Group();
    this.meshes.forEach((m) => this.group.add(m));
    this.n = new THREE.Vector3();
  }

  update(dt, t, player) {
    for (const im of this.meshes) {
      im.userData.list.forEach((it, i) => {
        it.x += (it.dx + Math.sin(t * 0.1 + it.ph) * 0.15) * dt;
        it.z += (it.dz + Math.cos(t * 0.08 + it.ph) * 0.15) * dt;
        if (it.petal) {
          it.yaw += it.spin * dt;
          _q.setFromAxisAngle(_up, it.yaw);
          _m.compose(_p.set(it.x, waveHeight(it.x, it.z, t) + 0.01, it.z), _q, _s.setScalar(1));
          im.setMatrixAt(i, _m);
          return;
        }
        // pushed by the swimmer
        const px = it.x - player.x;
        const pz = it.z - player.z;
        const d2 = px * px + pz * pz;
        if (d2 < 2.2 && player.y > -1.5) {
          const d = Math.sqrt(d2) || 1;
          it.x += (px / d) * (1.5 - d) * dt * 3;
          it.z += (pz / d) * (1.5 - d) * dt * 3;
          it.spin += (Math.random() - 0.5) * dt;
        }
        // keep out of buildings
        for (const c of this.colliders) {
          if (c.maxY < 0 || it.x < c.minX || it.x > c.maxX || it.z < c.minZ || it.z > c.maxZ) continue;
          const l = it.x - c.minX;
          const r = c.maxX - it.x;
          const b = it.z - c.minZ;
          const f = c.maxZ - it.z;
          const m = Math.min(l, r, b, f);
          if (m === l) it.x = c.minX - 0.05;
          else if (m === r) it.x = c.maxX + 0.05;
          else if (m === b) it.z = c.minZ - 0.05;
          else it.z = c.maxZ + 0.05;
          it.dx *= -1;
          it.dz *= -1;
        }
        it.yaw += it.spin * dt;
        const h = waveHeight(it.x, it.z, t);
        waveNormal(it.x, it.z, t, this.n);
        _q.setFromUnitVectors(_up, this.n);
        _q.multiply(_q2.setFromAxisAngle(_up, it.yaw));
        _m.compose(_p.set(it.x, h - it.sink, it.z), _q, _s.setScalar(1));
        im.setMatrixAt(i, _m);
      });
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
