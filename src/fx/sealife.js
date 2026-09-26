// Bigger (and rarer) sea life, things on the surface, and splashes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../world/patchMaterial.js';
import { terrainHeight } from '../world/terrain.js';
import { waveHeight, waveNormal } from '../waves.js';
import { glowScale } from './glows.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _zero = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// Paint vertices by height: dark back, pale belly (counter-shading).
function shade(geo, top, belly, split = 0) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const p = geo.attributes.position;
  const a = new Float32Array(p.count * 3);
  const ct = new THREE.Color(top);
  const cb = new THREE.Color(belly);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.smoothstep(p.getY(i), split - 0.12, split + 0.12);
    c.copy(cb).lerp(ct, t);
    a.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function tri(pts, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pts.length / 3) * 6).fill(0), 2));
  const c = new THREE.Color(color);
  g.setAttribute('color', new THREE.Float32BufferAttribute(pts.flatMap(() => [c.r, c.g, c.b]), 3));
  return g;
}
// body of revolution along z with a radius profile, squashed per axis
function body(len, profile, sx = 1, sy = 1, segs = 18, rings = 16) {
  const g = new THREE.SphereGeometry(1, segs, rings);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const r = profile(z);
    p.setXYZ(i, p.getX(i) * r * sx, p.getY(i) * r * sy, z * len * 0.5);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------- whale shark ----------------
export class WhaleShark {
  constructor() {
    const L = 10;
    const prof = (z) => {
      const t = (z + 1) / 2; // 0 tail .. 1 head
      return Math.max(0.05, Math.pow(Math.sin(Math.min(t * 1.25, 1) * Math.PI * 0.5), 0.8) * (0.25 + 0.75 * t)) * 1.15;
    };
    const parts = [
      shade(body(L, prof, 1.25, 0.8), '#2f4a5c', '#dfe6e2'),
      tri([[0, 0.3, -4.2], [0, 2.4, -6.1], [0, 0.2, -5.0], [0, -0.1, -4.4], [0, -1.3, -5.7], [0, 0, -4.9]], '#2f4a5c'),
      tri([[0, 0.8, 0.4], [0, 2.0, -0.9], [0, 0.7, -1.4]], '#2f4a5c'),
      tri([[0, 0.5, -2.6], [0, 0.95, -3.1], [0, 0.45, -3.3]], '#2f4a5c'),
      tri([[0.9, -0.2, 1.8], [2.6, -0.8, 0.6], [0.9, -0.3, 0.8]], '#2f4a5c'),
      tri([[-0.9, -0.2, 1.8], [-0.9, -0.3, 0.8], [-2.6, -0.8, 0.6]], '#2f4a5c'),
    ];
    const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g;
    }));
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), {
      key: 'whaleshark',
      vertexHead: 'varying vec3 vObj;',
      vertexBegin: /* glsl */ `
        vObj = position;
        transformed.x += sin(position.z * 0.45 - uTime * 1.6) * 0.35 * smoothstep(2.0, -6.0, position.z);
      `,
      fragHead: 'varying vec3 vObj;',
      fragColor: /* glsl */ `
        {
          // white spots and faint stripes on the back
          vec2 gpos = vec2(vObj.z * 1.7, atan(vObj.x, vObj.y + 0.4) * 3.2);
          vec2 id = floor(gpos);
          vec2 f = fract(gpos) - 0.5;
          vec2 o = vec2(hash12(id), hash12(id + 7.1)) - 0.5;
          float spot = 1.0 - smoothstep(0.1, 0.19, length(f - o * 0.5));
          float stripe = 1.0 - smoothstep(0.03, 0.07, abs(fract(vObj.z * 0.55) - 0.5));
          float back = smoothstep(-0.2, 0.25, vObj.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.88), max(spot, stripe * 0.5) * back);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.center = new THREE.Vector3(0, -4.4, -190);
    this.speed = 1.3;
    this.ang = 0;
  }
  update(dt, t) {
    const rx = 55;
    const rz = 32;
    this.ang += (this.speed * dt) / Math.hypot(rx * Math.sin(this.ang), rz * Math.cos(this.ang));
    const a = this.ang;
    _p.set(this.center.x + Math.cos(a) * rx, this.center.y + Math.sin(t * 0.07) * 0.5, this.center.z + Math.sin(a) * rz);
    _v.set(-Math.sin(a) * rx, Math.cos(t * 0.07) * 0.02, Math.cos(a) * rz).normalize();
    _m.lookAt(_v, _zero, _up);
    this.mesh.quaternion.setFromRotationMatrix(_m);
    this.mesh.position.copy(_p);
  }
}

// ---------------- rays ----------------
export class Rays {
  constructor() {
    const g = new THREE.PlaneGeometry(2, 2, 12, 8);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const ax = Math.abs(x);
      p.setXYZ(i, x * 1.6, (1 - ax) * 0.12 * (1 - Math.abs(z)), z * (1 - ax * 0.75) * 0.9 - ax * ax * 0.35);
    }
    g.computeVertexNormals();
    const tail = new THREE.BoxGeometry(0.05, 0.05, 2.2).translate(0, 0, -1.9);
    const geo = mergeGeometries([shade(g, '#2f3634', '#2f3634', -5), shade(tail, '#262a28', '#262a28')]);
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), {
      key: 'ray',
      vertexBegin: /* glsl */ `
        float rph = float(gl_InstanceID) * 2.3;
        float ax = abs(position.x);
        transformed.y += sin(uTime * 1.4 + rph - ax * 0.9) * 0.45 * pow(ax / 1.6, 1.4);
      `,
      fragColor: 'if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.82, 0.85, 0.82);',
    });
    this.defs = [
      { c: new THREE.Vector3(-20, 0, 100), r: 18, s: 0.9, sc: 1.6, h: 1.8 },
      { c: new THREE.Vector3(28, 0, 88), r: 13, s: -0.8, sc: 1.2, h: 2.2 },
      { c: new THREE.Vector3(40, 0, -168), r: 15, s: 0.7, sc: 1.8, h: 1.6 },
      { c: new THREE.Vector3(-70, 0, -150), r: 12, s: -0.9, sc: 1.3, h: 2.0 },
    ];
    this.mesh = new THREE.InstancedMesh(geo, mat, this.defs.length);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.defs.forEach((d) => (d.a = Math.random() * 6));
  }
  update(dt, t) {
    this.defs.forEach((d, i) => {
      d.a += (d.s * dt) / d.r;
      const x = d.c.x + Math.cos(d.a) * d.r;
      const z = d.c.z + Math.sin(d.a) * d.r * 0.8;
      const y = terrainHeight(x, z) + d.h + Math.sin(t * 0.3 + i) * 0.4;
      _v.set(-Math.sin(d.a) * Math.sign(d.s), Math.sin(t * 0.3 + i + 1) * 0.05, Math.cos(d.a) * 0.8 * Math.sign(d.s)).normalize();
      _m.lookAt(_v, _zero, _up);
      _q.setFromRotationMatrix(_m);
      _m.compose(_p.set(x, y, z), _q, _s.setScalar(d.sc));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- splashes ----------------
export class Splashes {
  constructor(max = 360) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: glowScale },
      vertexShader: /* glsl */ `
        attribute float aSize;
        uniform float uScale;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / -mv.z, 0.0, 48.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.9) * (1.0 - d * d) * 1.4, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }
  emit(x, y, z, n, power = 1) {
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.6 * power;
      this.pos.set([x + Math.cos(a) * 0.2, y + 0.05, z + Math.sin(a) * 0.2], k * 3);
      this.vel.set([Math.cos(a) * r, (2 + Math.random() * 3) * power, Math.sin(a) * r], k * 3);
      this.size[k] = 0.05 + Math.random() * 0.07;
      this.life[k] = 1;
    }
  }
  update(dt) {
    for (let k = 0; k < this.max; k++) {
      if (this.size[k] <= 0) continue;
      const i = k * 3;
      this.vel[i + 1] -= 9.8 * dt;
      this.pos[i] += this.vel[i] * dt;
      this.pos[i + 1] += this.vel[i + 1] * dt;
      this.pos[i + 2] += this.vel[i + 2] * dt;
      if (this.pos[i + 1] < -0.2) this.size[k] = 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }
}

// ---------------- dolphins (a pod that sometimes leaps) ----------------
export class Dolphins {
  constructor(splash, onLeap) {
    this.splash = splash;
    this.onLeap = onLeap;
    const prof = (z) => {
      const t = (z + 1) / 2;
      return Math.max(0.04, Math.sin(Math.pow(t, 0.8) * Math.PI) * (0.35 + 0.65 * t));
    };
    const b = shade(body(2.3, prof, 0.34, 0.4), '#3f4f5e', '#c4ccd2', -0.04);
    const beak = shade(new THREE.ConeGeometry(0.08, 0.35, 8).rotateX(Math.PI / 2).translate(0, -0.05, 1.3), '#3f4f5e', '#c4ccd2', -0.04);
    const fins = [
      tri([[0, 0.3, 0.1], [0, 0.62, -0.25], [0, 0.28, -0.35]], '#3a4856'),
      tri([[0, 0, -1.05], [0.42, 0.02, -1.35], [0, 0, -1.2], [0, 0, -1.05], [0, 0, -1.2], [-0.42, 0.02, -1.35]], '#3a4856'),
      tri([[0.14, -0.1, 0.35], [0.45, -0.3, 0.05], [0.12, -0.12, 0.1], [-0.14, -0.1, 0.35], [-0.12, -0.12, 0.1], [-0.45, -0.3, 0.05]], '#3a4856'),
    ];
    const geo = mergeGeometries([b, beak, ...fins].map((g) => {
      g = g.index ? g.toNonIndexed() : g;
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g;
    }));
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), {
      key: 'dolphin',
      vertexBegin: /* glsl */ `
        float dph = float(gl_InstanceID) * 1.1;
        transformed.y += sin(position.z * 2.2 - uTime * 7.0 + dph) * 0.07 * smoothstep(0.4, -1.3, position.z);
      `,
    });
    this.n = 6;
    this.mesh = new THREE.InstancedMesh(geo, mat, this.n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.center = new THREE.Vector3(8, 0, 104);
    this.R = 42;
    this.ang = 0;
    this.d = [];
    for (let i = 0; i < this.n; i++) {
      this.d.push({
        off: new THREE.Vector3((Math.random() - 0.5) * 7, 0, (i - this.n / 2) * 2.2 + (Math.random() - 0.5)),
        jump: -1,
        timer: 3 + Math.random() * 10,
        prevY: -1.5,
        pos: new THREE.Vector3(),
        last: new THREE.Vector3(),
      });
    }
  }
  update(dt, t) {
    const speed = 5.5;
    this.ang += (speed * dt) / this.R;
    const a = this.ang;
    const tx = -Math.sin(a);
    const tz = Math.cos(a);
    this.d.forEach((d, i) => {
      // formation relative to the travel direction
      const side = d.off.x;
      const back = d.off.z;
      let x = this.center.x + Math.cos(a) * (this.R + side) - tx * back;
      let z = this.center.z + Math.sin(a) * (this.R + side) - tz * back;
      let y = -1.6 + Math.sin(t * 0.8 + i) * 0.4;
      d.timer -= dt;
      if (d.jump < 0 && d.timer <= 0) {
        d.jump = 0;
        // neighbours often follow a moment later
        this.d.forEach((o, j) => {
          if (j !== i && o.jump < 0 && Math.random() < 0.35) o.timer = 0.2 + Math.random() * 0.6;
        });
      }
      if (d.jump >= 0) {
        d.jump += dt / 1.8;
        const u = d.jump;
        // swim up, arc out of the water, dive back in
        y += Math.sin(Math.min(u, 1) * Math.PI) * 3.4;
        if (u >= 1) {
          d.jump = -1;
          d.timer = 6 + Math.random() * 10;
        }
      }
      d.last.copy(d.pos);
      d.pos.set(x, y, z);
      const surf = Math.abs(y) < 1.5 || Math.abs(d.prevY) < 1.5 ? waveHeight(x, z, t) : 0;
      if ((d.prevY < surf && y >= surf) || (d.prevY > surf && y <= surf)) {
        this.splash.emit(x, surf, z, 22, 1);
        if (this.onLeap) this.onLeap(x, z);
      }
      d.prevY = y;
      _v.subVectors(d.pos, d.last);
      if (_v.lengthSq() < 1e-6) _v.set(tx, 0, tz);
      _m.lookAt(_v, _zero, _up);
      _q.setFromRotationMatrix(_m);
      _m.compose(d.pos, _q, _s.setScalar(1));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- ducks & gulls on the surface ----------------
function birdGeo(bodyC, backC, headC, beakC) {
  const b = new THREE.SphereGeometry(1, 10, 8).scale(0.17, 0.12, 0.27).translate(0, 0.06, 0);
  const back = new THREE.SphereGeometry(1, 8, 6).scale(0.13, 0.06, 0.2).translate(0, 0.15, -0.04);
  const h = new THREE.SphereGeometry(0.08, 8, 6).translate(0, 0.25, 0.2);
  const beak = new THREE.BoxGeometry(0.05, 0.03, 0.09).translate(0, 0.23, 0.3);
  const tail = new THREE.BoxGeometry(0.08, 0.03, 0.12).rotateX(-0.4).translate(0, 0.12, -0.3);
  const c = (g, hex) => shade(g, hex, hex);
  return mergeGeometries([c(b, bodyC), c(back, backC), c(h, headC), c(beak, beakC), c(tail, backC)]);
}

export class SurfaceBirds {
  constructor(colliders) {
    this.colliders = colliders;
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'duck' });
    this.flocks = [
      { geo: birdGeo('#8a6a4a', '#6b5038', '#2f6b3a', '#e0b23a'), n: 9, c: new THREE.Vector3(30, 0, -56), r: 9, sc: 1.4 },
      { geo: birdGeo('#f2f2ee', '#9aa3a8', '#f7f7f4', '#e8b23a'), n: 7, c: new THREE.Vector3(-18, 0, 96), r: 7, sc: 1.6 },
      { geo: birdGeo('#8a6a4a', '#6b5038', '#6b5038', '#e0b23a'), n: 5, c: new THREE.Vector3(-45, 0, 6), r: 5, sc: 1.4 },
    ];
    this.group = new THREE.Group();
    for (const f of this.flocks) {
      f.mesh = new THREE.InstancedMesh(f.geo, mat, f.n);
      f.mesh.frustumCulled = false;
      f.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      f.birds = [];
      f.flee = new THREE.Vector3();
      for (let i = 0; i < f.n; i++) {
        f.birds.push({ p: f.c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)), yaw: Math.random() * 6, ph: Math.random() * 10, v: new THREE.Vector3() });
      }
      this.group.add(f.mesh);
    }
  }
  update(dt, t, player) {
    for (const f of this.flocks) {
      _v.subVectors(f.c, player);
      _v.y = 0;
      const dc = _v.length();
      if (dc < 16) f.flee.addScaledVector(_v.normalize(), (16 - dc) * dt * 0.6);
      f.flee.multiplyScalar(1 - dt * 0.05);
      if (f.flee.length() > 18) f.flee.setLength(18);
      const cx = f.c.x + f.flee.x + Math.sin(t * 0.05 + f.r) * f.r;
      const cz = f.c.z + f.flee.z + Math.cos(t * 0.04 + f.r) * f.r;
      f.birds.forEach((b, i) => {
        const tx = cx + Math.sin(i * 2.4) * 2.2 - b.p.x;
        const tz = cz + Math.cos(i * 2.4) * 2.2 - b.p.z;
        b.v.x += tx * dt * 0.08;
        b.v.z += tz * dt * 0.08;
        const px = b.p.x - player.x;
        const pz = b.p.z - player.z;
        const d = Math.hypot(px, pz);
        if (d < 5 && player.y > -2) {
          b.v.x += (px / d) * (5 - d) * dt * 1.5;
          b.v.z += (pz / d) * (5 - d) * dt * 1.5;
        }
        b.v.multiplyScalar(1 - dt * 0.8);
        const sp = Math.hypot(b.v.x, b.v.z);
        if (sp > 2) b.v.multiplyScalar(2 / sp);
        b.p.x += b.v.x * dt;
        b.p.z += b.v.z * dt;
        for (const c of this.colliders) {
          if (c.maxY < 0 || b.p.x < c.minX || b.p.x > c.maxX || b.p.z < c.minZ || b.p.z > c.maxZ) continue;
          const l = b.p.x - c.minX;
          const r = c.maxX - b.p.x;
          const bb = b.p.z - c.minZ;
          const ff = c.maxZ - b.p.z;
          const m = Math.min(l, r, bb, ff);
          if (m === l) b.p.x = c.minX;
          else if (m === r) b.p.x = c.maxX;
          else if (m === bb) b.p.z = c.minZ;
          else b.p.z = c.maxZ;
        }
        if (sp > 0.05) {
          const diff = Math.atan2(Math.sin(Math.atan2(b.v.x, b.v.z) - b.yaw), Math.cos(Math.atan2(b.v.x, b.v.z) - b.yaw));
          b.yaw += THREE.MathUtils.clamp(diff, -dt * 2, dt * 2);
        }
        const h = waveHeight(b.p.x, b.p.z, t);
        waveNormal(b.p.x, b.p.z, t, _n);
        _q.setFromUnitVectors(_up, _n);
        _q.multiply(_q2.setFromAxisAngle(_up, b.yaw + Math.sin(t * 0.7 + b.ph) * 0.2));
        _m.compose(_p.set(b.p.x, h - 0.02 + Math.sin(t * 2 + b.ph) * 0.01, b.p.z), _q, _s.setScalar(f.sc));
        f.mesh.setMatrixAt(i, _m);
      });
      f.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// ---------------- swan boats ----------------
export class SwanBoats {
  constructor() {
    const white = '#f4f2ec';
    const parts = [
      shade(new THREE.BoxGeometry(1.5, 0.55, 2.4).translate(0, 0.1, 0), white, white),
      shade(new THREE.BoxGeometry(1.2, 0.5, 0.8).translate(0, 0.45, -0.4), '#e8e2d6', '#e8e2d6'),
      shade(new THREE.BoxGeometry(1.3, 0.35, 0.12).translate(0, 0.6, 0.35), '#6fc3e0', '#6fc3e0'),
    ];
    // S-shaped neck
    const neck = [
      [0, 0.45, 1.05],
      [0, 0.75, 1.3],
      [0, 1.1, 1.28],
      [0, 1.45, 1.12],
      [0, 1.72, 1.1],
    ];
    neck.forEach(([x, y, z], i) => parts.push(shade(new THREE.SphereGeometry(0.2 - i * 0.015, 8, 6).translate(x, y, z), white, white)));
    parts.push(shade(new THREE.SphereGeometry(0.22, 10, 8).translate(0, 1.85, 1.2), white, white));
    parts.push(shade(new THREE.ConeGeometry(0.08, 0.3, 8).rotateX(Math.PI / 2).translate(0, 1.82, 1.45), '#f08a1f', '#f08a1f'));
    parts.push(shade(new THREE.SphereGeometry(0.04, 6, 4).translate(0.15, 1.92, 1.3), '#111', '#111'));
    parts.push(shade(new THREE.SphereGeometry(0.04, 6, 4).translate(-0.15, 1.92, 1.3), '#111', '#111'));
    // wings
    parts.push(shade(new THREE.SphereGeometry(1, 10, 6).scale(0.16, 0.35, 0.9).translate(0.78, 0.45, 0), white, white));
    parts.push(shade(new THREE.SphereGeometry(1, 10, 6).scale(0.16, 0.35, 0.9).translate(-0.78, 0.45, 0), white, white));
    const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), { key: 'swan' });
    this.boats = [
      { x: 30, z: -64, yaw: 0.8, ph: 0 },
      { x: 34, z: -22, yaw: 2.2, ph: 2 },
      { x: 86, z: -62, yaw: 4.0, ph: 4 },
      { x: 58, z: -72, yaw: 1.4, ph: 6 },
    ];
    this.mesh = new THREE.InstancedMesh(geo, mat, this.boats.length);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  update(dt, t) {
    this.boats.forEach((b, i) => {
      const x = b.x + Math.sin(t * 0.03 + b.ph) * 3;
      const z = b.z + Math.cos(t * 0.025 + b.ph) * 3;
      const yaw = b.yaw + Math.sin(t * 0.05 + b.ph) * 0.8;
      waveNormal(x, z, t, _n);
      _q.setFromUnitVectors(_up, _n);
      _q.multiply(_q2.setFromAxisAngle(_up, yaw));
      _m.compose(_p.set(x, waveHeight(x, z, t) - 0.12, z), _q, _s.setScalar(1));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- fish that jump out near you ----------------
export class JumpingFish {
  constructor(fishGeo, splash, onJump) {
    this.splash = splash;
    this.onJump = onJump;
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#c9d6de', emissive: '#16222a', side: THREE.DoubleSide }), { key: 'jfish' });
    this.mesh = new THREE.InstancedMesh(fishGeo, mat, 2);
    this.mesh.frustumCulled = false;
    this.slots = [0, 1].map(() => ({ u: -1, p0: new THREE.Vector3(), dir: new THREE.Vector3(), h: 1, len: 2 }));
    this.timer = 4;
    this.slots.forEach((_, i) => this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)));
  }
  update(dt, t, camera) {
    this.timer -= dt;
    const cp = camera.position;
    if (this.timer <= 0) {
      this.timer = 3 + Math.random() * 6;
      const slot = this.slots.find((s) => s.u < 0);
      if (slot && cp.y > -4 && cp.y < 12) {
        camera.getWorldDirection(_v);
        _v.y = 0;
        _v.normalize();
        const dist = 7 + Math.random() * 16;
        const side = (Math.random() - 0.5) * 14;
        const x = cp.x + _v.x * dist - _v.z * side;
        const z = cp.z + _v.z * dist + _v.x * side;
        if (terrainHeight(x, z) < -1.5) {
          slot.u = 0;
          slot.p0.set(x, 0, z);
          const a = Math.random() * Math.PI * 2;
          slot.dir.set(Math.cos(a), 0, Math.sin(a));
          slot.h = 0.6 + Math.random() * 0.6;
          slot.len = 1.5 + Math.random() * 1.5;
          this.splash.emit(x, waveHeight(x, z, t), z, 10, 0.6);
          if (this.onJump) this.onJump(x, z);
        }
      }
    }
    this.slots.forEach((s, i) => {
      if (s.u < 0) return;
      s.u += dt / 0.9;
      const u = Math.min(s.u, 1);
      const x = s.p0.x + s.dir.x * s.len * u;
      const z = s.p0.z + s.dir.z * s.len * u;
      const y = waveHeight(x, z, t) + Math.sin(u * Math.PI) * s.h - 0.1;
      _v.set(s.dir.x * s.len, Math.cos(u * Math.PI) * s.h * Math.PI, s.dir.z * s.len);
      _m.lookAt(_v, _zero, _up);
      _q.setFromRotationMatrix(_m);
      _m.compose(_p.set(x, y, z), _q, _s.setScalar(0.7));
      this.mesh.setMatrixAt(i, _m);
      if (s.u >= 1) {
        s.u = -1;
        this.splash.emit(x, waveHeight(x, z, t), z, 12, 0.6);
        this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- books drifting out of the bookstore ----------------
export class FloatingBooks {
  constructor(spot) {
    const n = spot ? 46 : 0;
    const geo = new THREE.BoxGeometry(0.22, 0.04, 0.3);
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff' }), { key: 'book' });
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
    this.mesh.count = n;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.books = [];
    const cols = ['#8a2d2d', '#2d4a8a', '#e6dcc0', '#2f6b4a', '#c9a13a', '#5a3a6b', '#d9d2c2', '#b3542a'];
    for (let i = 0; i < n; i++) {
      const surface = i < 8;
      this.books.push({
        a: new THREE.Vector3(spot.x + (Math.random() - 0.5) * 9, surface ? 0 : -0.5 - Math.random() * 2.3, spot.z + spot.facing * Math.random() * 3.5),
        ph: Math.random() * 100,
        rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4),
        surface,
      });
      this.mesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    }
    this._e = new THREE.Euler();
  }
  update(dt, t) {
    this.books.forEach((b, i) => {
      if (b.surface) {
        const x = b.a.x + Math.sin(t * 0.07 + b.ph) * 1.5;
        const z = b.a.z + Math.cos(t * 0.06 + b.ph) * 1.5;
        this._e.set(0, b.rot.y + t * b.spin.y * 0.3, 0);
        _q.setFromEuler(this._e);
        _m.compose(_p.set(x, waveHeight(x, z, t) - 0.01, z), _q, _s.setScalar(1.2));
      } else {
        const x = b.a.x + Math.sin(t * 0.13 + b.ph) * 0.8;
        const y = b.a.y + Math.sin(t * 0.21 + b.ph * 2) * 0.35;
        const z = b.a.z + Math.cos(t * 0.11 + b.ph) * 0.8;
        this._e.set(b.rot.x + t * b.spin.x, b.rot.y + t * b.spin.y, b.rot.z + t * b.spin.z);
        _q.setFromEuler(this._e);
        _m.compose(_p.set(x, y, z), _q, _s.setScalar(1.2));
      }
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
