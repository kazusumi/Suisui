// Ambient sea life that keeps the water around the swimmer busy, wherever they are.
// Each species lives in a depth band; creatures that drift too far from the camera are
// re-spawned somewhere nearby (mostly ahead) at a depth that suits them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../world/patchMaterial.js';
import { terrainHeight } from '../world/terrain.js';
import { fishGeometry } from './life.js';
import { glowScale } from './glows.js';
import { U } from '../globals.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _zero = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

function paint(geo, fn) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const p = geo.attributes.position;
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), _c);
    a.set([_c.r, _c.g, _c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}
const solid = (hex) => (x, y, z, c) => c.set(hex);
function body(len, prof, sx, sy, segs = 14, rings = 10) {
  const g = new THREE.SphereGeometry(1, segs, rings);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const r = prof(z);
    p.setXYZ(i, p.getX(i) * r * sx, p.getY(i) * r * sy, z * len * 0.5);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------- geometries ----------------
function turtleGeo() {
  const shell = paint(new THREE.SphereGeometry(1, 16, 10).scale(0.55, 0.22, 0.7), (x, y, z, c) => {
    const k = Math.sin(x * 9) * Math.sin(z * 8) > 0.2 ? 1 : 0;
    c.set(y < -0.02 ? '#d9c79a' : k ? '#6b5a2f' : '#8a7440');
  });
  const head = paint(new THREE.SphereGeometry(0.16, 10, 8).scale(1, 0.8, 1.3).translate(0, 0.02, 0.78), solid('#8f8a5a'));
  const fl = (x, z, w, l, rot) => paint(new THREE.BoxGeometry(w, 0.04, l).rotateY(rot).translate(x, -0.02, z), solid('#7d7a4d'));
  return mergeGeometries([shell, head, fl(0.62, 0.3, 0.7, 0.28, -0.5), fl(-0.62, 0.3, 0.7, 0.28, 0.5), fl(0.4, -0.5, 0.35, 0.2, 0.4), fl(-0.4, -0.5, 0.35, 0.2, -0.4)]);
}
function squidGeo() {
  const mantle = paint(new THREE.ConeGeometry(0.12, 0.7, 10).rotateX(-Math.PI / 2).translate(0, 0, 0.1), solid('#f1d6cf'));
  const fin = paint(new THREE.BoxGeometry(0.34, 0.01, 0.16).translate(0, 0, 0.4), solid('#f4ddd6'));
  const arms = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    arms.push(paint(new THREE.CylinderGeometry(0.012, 0.02, 0.35, 4).rotateX(Math.PI / 2).translate(Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.42), solid('#e8c4bb')));
  }
  return mergeGeometries([mantle, fin, ...arms]);
}
function sunfishGeo() {
  const b = paint(new THREE.SphereGeometry(1, 18, 12).scale(0.25, 1.0, 1.1), (x, y, z, c) => c.set(y > 0.2 ? '#7c8a95' : '#b9c2c8'));
  const fin = (y, h) => paint(new THREE.BoxGeometry(0.06, h, 0.35).translate(0, y, -0.2), solid('#7c8a95'));
  const tail = paint(new THREE.BoxGeometry(0.05, 1.4, 0.18).translate(0, 0, -1.1), solid('#8e9aa3'));
  return mergeGeometries([b, fin(1.4, 1.1), fin(-1.4, 1.1), tail]);
}
function anglerGeo() {
  const b = paint(new THREE.SphereGeometry(0.4, 14, 10).scale(1, 0.85, 1.1), solid('#231d1f'));
  const jaw = paint(new THREE.BoxGeometry(0.5, 0.06, 0.25).translate(0, -0.12, 0.42), solid('#3a2e2e'));
  const teeth = [];
  for (let i = -3; i <= 3; i++) teeth.push(paint(new THREE.ConeGeometry(0.02, 0.1, 4).translate(i * 0.06, -0.05, 0.48), solid('#e8e4d8')));
  const rod = paint(new THREE.CylinderGeometry(0.01, 0.015, 0.5, 4).rotateX(0.9).translate(0, 0.45, 0.35), solid('#3a2e2e'));
  const tail = paint(new THREE.BoxGeometry(0.03, 0.3, 0.3).translate(0, 0, -0.55), solid('#231d1f'));
  return mergeGeometries([b, jaw, ...teeth, rod, tail]);
}
function crabGeo() {
  const parts = [paint(new THREE.SphereGeometry(0.2, 10, 6).scale(1.3, 0.45, 1), solid('#d2512d'))];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) parts.push(paint(new THREE.BoxGeometry(0.28, 0.025, 0.025).translate(s * 0.34, -0.03, (i - 1) * 0.1), solid('#b8431f')));
    parts.push(paint(new THREE.SphereGeometry(0.07, 6, 4).scale(1.3, 0.7, 1).translate(s * 0.22, 0, 0.26), solid('#e0643a')));
    parts.push(paint(new THREE.SphereGeometry(0.025, 4, 3).translate(s * 0.07, 0.1, 0.17), solid('#111111')));
  }
  return mergeGeometries(parts);
}
function oarGeo() {
  // a long silver ribbon with a red crest, bent by the vertex shader
  const g = new THREE.PlaneGeometry(0.28, 7, 1, 60).rotateX(-Math.PI / 2).rotateZ(Math.PI / 2);
  const crest = new THREE.PlaneGeometry(0.2, 7, 1, 60).rotateX(-Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0.22, 0);
  const head = new THREE.SphereGeometry(0.16, 8, 6).scale(0.6, 1, 1.3).translate(0, 0, 3.5);
  return mergeGeometries([paint(g, solid('#d9dde2')), paint(crest, solid('#e2412f')), paint(head, solid('#c9cfd6'))]);
}

// ---------------- generic ambient species ----------------
class Species {
  constructor(cfg) {
    Object.assign(this, { yMin: -30, yMax: -1, rMin: 10, rMax: 38, speed: 1, group: 1, spread: 2, flee: 0, rare: 0, bottom: false, turn: 0.5 }, cfg);
    this.mesh = new THREE.InstancedMesh(cfg.geo, cfg.mat, cfg.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.items = [];
    for (let i = 0; i < cfg.count; i++) {
      this.items.push({ p: new THREE.Vector3(), h: new THREE.Vector3(1, 0, 0), alive: false, wait: Math.random() * 2, floor: -99, k: i, sc: 1, ph: Math.random() * 100 });
      if (cfg.colors) this.mesh.setColorAt(i, _c.set(cfg.colors[i % cfg.colors.length]));
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.active = cfg.count;
  }

  pickSpot(cam, fwd, out) {
    for (let tries = 0; tries < 5; tries++) {
      let a = Math.random() * Math.PI * 2;
      if (Math.random() < 0.7) a = Math.atan2(fwd.z, fwd.x) + (Math.random() - 0.5) * 2.2;
      const r = this.rMin + Math.random() * (this.rMax - this.rMin);
      const x = cam.x + Math.cos(a) * r;
      const z = cam.z + Math.sin(a) * r;
      const floor = terrainHeight(x, z);
      if (this.bottom) {
        if (floor > -1.5 || floor < this.yMin || floor > this.yMax) continue;
        out.set(x, floor + 0.08, z);
        return true;
      }
      const lo = Math.max(this.yMin, floor + 1.0);
      const hi = Math.min(this.yMax, -0.8);
      if (hi - lo < 0.5) continue;
      // bias towards the camera's own depth so they are actually seen
      const cy = THREE.MathUtils.clamp(cam.y + (Math.random() - 0.5) * 10, lo, hi);
      out.set(x, Math.random() < 0.6 ? cy : lo + Math.random() * (hi - lo), z);
      return true;
    }
    return false;
  }

  update(dt, t, cam, fwd, frame) {
    const n = this.active;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[i];
      if (i >= n) {
        if (c.alive) {
          c.alive = false;
          this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        }
        continue;
      }
      if (!c.alive) {
        c.wait -= dt;
        if (c.wait > 0) continue;
        // members of a group spawn around their leader
        const lead = this.group > 1 ? this.items[i - (i % this.group)] : null;
        if (lead && lead !== c && lead.alive) {
          c.p.copy(lead.p).add(_v.set((Math.random() - 0.5) * this.spread, (Math.random() - 0.5) * this.spread * 0.4, (Math.random() - 0.5) * this.spread));
          c.h.copy(lead.h);
        } else {
          if (this.rare && Math.random() > this.rare) {
            c.wait = 4 + Math.random() * 6;
            continue;
          }
          if (!this.pickSpot(cam, fwd, c.p)) {
            c.wait = 1 + Math.random();
            continue;
          }
          const a = Math.random() * Math.PI * 2;
          c.h.set(Math.cos(a), (Math.random() - 0.5) * 0.1, Math.sin(a)).normalize();
        }
        c.alive = true;
        c.sc = (this.scale || 1) * (0.8 + Math.random() * 0.4);
        c.floor = terrainHeight(c.p.x, c.p.z);
      }
      // too far away (or somewhere it doesn't belong) -> respawn later
      const dx = c.p.x - cam.x;
      const dz = c.p.z - cam.z;
      if (dx * dx + dz * dz > this.rMax * this.rMax * 1.6) {
        c.alive = false;
        c.wait = Math.random() * 1.5;
        this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      if ((frame + i) % 8 === 0) c.floor = terrainHeight(c.p.x, c.p.z);
      const lead = this.group > 1 ? this.items[i - (i % this.group)] : c;
      if (this.bottom) {
        // crabs: scuttle sideways, pause now and then
        const go = Math.sin(t * 0.7 + c.ph) > -0.2 ? 1 : 0;
        c.h.applyAxisAngle(_up, Math.sin(t * 0.3 + c.ph) * dt * 0.8);
        c.p.addScaledVector(c.h, this.speed * dt * go);
        c.p.y = c.floor + 0.08;
      } else {
        // wander + follow leader + keep inside the water column
        _v.set(Math.sin(t * 0.3 + c.ph) * this.turn, Math.sin(t * 0.21 + c.ph * 1.7) * 0.15, Math.cos(t * 0.27 + c.ph) * this.turn);
        c.h.addScaledVector(_v, dt);
        if (lead !== c && lead.alive) c.h.addScaledVector(_f.subVectors(lead.p, c.p), dt * 0.25);
        if (c.p.y < c.floor + 1.2) c.h.y += dt * 1.5;
        if (c.p.y > Math.min(this.yMax, -0.7)) c.h.y -= dt * 1.5;
        if (c.p.y < this.yMin) c.h.y += dt * 0.8;
        if (this.flee) {
          _f.subVectors(c.p, cam);
          const d = _f.length();
          if (d < this.flee) c.h.addScaledVector(_f.normalize(), ((this.flee - d) / this.flee) * dt * 6);
        }
        c.h.y = THREE.MathUtils.clamp(c.h.y, -0.5, 0.5);
        c.h.normalize();
        c.p.addScaledVector(c.h, this.speed * dt);
      }
      _m.lookAt(c.h, _zero, _up);
      _q.setFromRotationMatrix(_m);
      _m.compose(c.p, _q, _s.setScalar(c.sc));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- bait ball: a spinning tornado of sardines ----------------
class BaitBall {
  constructor(count) {
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#d7e2e8', emissive: '#1b2a30', side: THREE.DoubleSide }), {
      key: 'sardine',
      vertexBegin: /* glsl */ `
        float sph = float(gl_InstanceID) * 0.73;
        transformed.x += sin(transformed.z * 5.0 + uTime * 14.0 + sph) * 0.08 * smoothstep(0.25, -0.75, transformed.z);
      `,
    });
    this.mesh = new THREE.InstancedMesh(fishGeometry(), mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.fish = [];
    for (let i = 0; i < count; i++) this.fish.push({ a: Math.random() * Math.PI * 2, r: 2 + Math.random() * 3.2, y: (Math.random() - 0.5) * 6, w: 0.7 + Math.random() * 0.5, ph: Math.random() * 10 });
    this.center = new THREE.Vector3(0, -6, 90);
    this.hole = 0;
    this.active = count;
  }
  update(dt, t, cam, fwd) {
    const dx = this.center.x - cam.x;
    const dz = this.center.z - cam.z;
    if (dx * dx + dz * dz > 70 * 70 && cam.y < 0) {
      // move the ball somewhere ahead with enough depth
      for (let k = 0; k < 6; k++) {
        const a = Math.atan2(fwd.z, fwd.x) + (Math.random() - 0.5) * 1.6;
        const r = 25 + Math.random() * 20;
        const x = cam.x + Math.cos(a) * r;
        const z = cam.z + Math.sin(a) * r;
        const fl = terrainHeight(x, z);
        if (fl < -9) {
          this.center.set(x, THREE.MathUtils.clamp(cam.y, fl + 5, -4), z);
          break;
        }
      }
    }
    // the ball opens up around the swimmer
    const d = cam.distanceTo(this.center);
    this.hole += ((d < 7 ? 1 : 0) - this.hole) * Math.min(dt * 2, 1);
    this.center.x += Math.sin(t * 0.1) * dt * 0.6;
    this.center.z += Math.cos(t * 0.13) * dt * 0.6;
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (i >= this.active) {
        this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      f.a += f.w * dt * (1 + this.hole * 0.6);
      const r = f.r * (1 + this.hole * 0.9) + Math.sin(t * 0.8 + f.ph) * 0.3;
      _v.set(this.center.x + Math.cos(f.a) * r, this.center.y + f.y + Math.sin(t * 0.5 + f.ph) * 0.4, this.center.z + Math.sin(f.a) * r);
      _f.set(-Math.sin(f.a), Math.cos(t * 0.5 + f.ph) * 0.05, Math.cos(f.a));
      _m.lookAt(_f, _zero, _up);
      _q.setFromRotationMatrix(_m);
      _m.compose(_v, _q, _s.setScalar(0.42));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- jellyfish (instanced, translucent, pulsing, some glow) ----------------
function jellyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime },
    vertexShader: /* glsl */ `
      attribute vec3 aTint;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vTint;
      varying float vY;
      void main(){
        float ph = float(gl_InstanceID) * 1.9;
        vec3 p = position;
        float pulse = sin(uTime * 2.2 + ph);
        if (p.y > -0.05) { p.xz *= 1.0 + pulse * 0.12; p.y *= 1.0 - pulse * 0.1; }
        else { p.x += sin(uTime * 1.5 + ph + p.y * 3.0) * 0.08 * -p.y; p.z += cos(uTime * 1.3 + ph + p.y * 2.0) * 0.08 * -p.y; }
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vTint = aTint;
        vY = position.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vTint;
      varying float vY;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
        float bell = step(-0.05, vY);
        vec3 c = vTint * (0.15 + f * 1.4) * (bell > 0.5 ? 1.0 : 0.6);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
function jellyGeo() {
  const bell = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.7, 1);
  const parts = [bell];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(new THREE.CylinderGeometry(0.008, 0.004, 1.3, 3, 6).translate(Math.cos(a) * 0.32, -0.65, Math.sin(a) * 0.32));
  }
  parts.push(new THREE.CylinderGeometry(0.06, 0.02, 0.7, 6, 4).translate(0, -0.35, 0));
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

// ---------------- glowing points: firefly squid swarms, lures, deep plankton ----------------
function glowPointsMaterial(size, blink) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uScale: glowScale, uSize: { value: size }, uBlink: { value: blink } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSeed;
      uniform float uTime;
      uniform float uScale;
      uniform float uSize;
      uniform float uBlink;
      varying vec3 vC;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float b = mix(1.0, 0.25 + 0.75 * smoothstep(-0.2, 0.8, sin(uTime * (1.3 + aSeed * 2.0) + aSeed * 40.0)), uBlink);
        vC = aColor * b;
        gl_PointSize = clamp(uSize * uScale / -mv.z, 1.5, 40.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 4.0) * 0.8 + exp(-d * d * 30.0);
        gl_FragColor = vec4(vC * a, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
function glowPoints(n, size, blink) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const seed = new Float32Array(n).map(() => Math.random());
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const pts = new THREE.Points(geo, glowPointsMaterial(size, blink));
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}

// ---------------- the whole community ----------------
export class Ambient {
  constructor(factor) {
    this.group = new THREE.Group();
    this.frame = 0;
    const fishMat = (key, extra = {}) =>
      patchMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: extra.emissive || '#0a1418', side: THREE.DoubleSide }), {
        key,
        vertexBegin: /* glsl */ `
          float aph = float(gl_InstanceID) * 1.37;
          transformed.x += sin(transformed.z * 4.0 + uTime * ${extra.beat || '10.0'} + aph) * 0.12 * smoothstep(0.25, -0.75, transformed.z);
        `,
        fragHead: extra.fragHead || '',
        fragColor: extra.fragColor || '',
      });
    const fg = fishGeometry();
    const lambert = (key, vb = '') => patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { key, vertexBegin: vb });
    const S = (cfg) => {
      const sp = new Species(cfg);
      sp.base = cfg.count;
      this.species.push(sp);
      this.group.add(sp.mesh);
      return sp;
    };
    this.species = [];

    // shallow & mid water
    S({ name: 'tropical', geo: fg, mat: fishMat('tropical'), count: 96, group: 8, spread: 3, yMin: -12, yMax: -0.8, speed: 1.6, scale: 0.45, flee: 3.5, rMin: 6, rMax: 30,
      colors: ['#ff8a2a', '#ffd23a', '#2f7fe0', '#ff5a8a', '#45d0c8', '#ffffff', '#a86bff', '#ffb0d0'] });
    S({ name: 'silver', geo: fg, mat: fishMat('silver'), count: 80, group: 16, spread: 4, yMin: -20, yMax: -1, speed: 2.4, scale: 0.6, flee: 5, rMin: 10, rMax: 40,
      colors: ['#b8c8d2', '#9fb4c2', '#d6e0e6'] });
    S({ name: 'turtle', geo: turtleGeo(), mat: lambert('turtle', `
        float tph = float(gl_InstanceID) * 2.0;
        float ax = abs(transformed.x);
        transformed.y += sin(uTime * 1.6 + tph) * 0.25 * smoothstep(0.45, 0.9, ax);
      `), count: 5, yMin: -18, yMax: -1.5, speed: 1.0, scale: 1.3, rMin: 10, rMax: 40, turn: 0.25 });
    S({ name: 'squid', geo: squidGeo(), mat: lambert('squid'), count: 20, group: 5, spread: 2, yMin: -24, yMax: -2, speed: 1.3, scale: 1.0, flee: 4, rMin: 8, rMax: 32 });
    S({ name: 'sunfish', geo: sunfishGeo(), mat: lambert('sunfish', `
        float fph = float(gl_InstanceID);
        if (abs(transformed.y) > 0.9) transformed.x += sin(uTime * 1.8 + fph) * 0.3 * sign(transformed.y);
      `), count: 1, yMin: -16, yMax: -3, speed: 0.6, scale: 1.6, rMin: 14, rMax: 40, rare: 0.35, turn: 0.15 });

    // deep sea (the trench and the sunken district)
    S({ name: 'lanternfish', geo: fg, mat: fishMat('lantern', {
        emissive: '#000000',
        fragHead: 'varying vec3 vObjL;',
        fragColor: /* glsl */ `
          {
            float row = smoothstep(0.04, 0.0, abs(vObjL.y + 0.06));
            float dots = step(0.55, fract(vObjL.z * 9.0));
            totalEmissiveRadiance += vec3(0.2, 0.7, 1.6) * row * dots * 2.0;
          }
        `,
      }), count: 96, group: 12, spread: 5, yMin: -60, yMax: -18, speed: 1.5, scale: 0.5, flee: 3, rMin: 6, rMax: 32, colors: ['#262a36', '#1d2230'] });
    S({ name: 'angler', geo: anglerGeo(), mat: lambert('angler'), count: 5, yMin: -60, yMax: -24, speed: 0.5, scale: 1.3, rMin: 6, rMax: 28, turn: 0.3 });
    S({ name: 'oarfish', geo: oarGeo(), mat: lambert('oarfish', `
        float oph = float(gl_InstanceID) * 3.0;
        transformed.x += sin(transformed.z * 0.9 - uTime * 2.2 + oph) * 0.35;
        transformed.y += sin(transformed.z * 0.6 - uTime * 1.5 + oph) * 0.15;
      `), count: 2, yMin: -45, yMax: -12, speed: 0.9, scale: 1.0, rMin: 12, rMax: 36, rare: 0.5, turn: 0.2 });
    S({ name: 'crab', geo: crabGeo(), mat: lambert('crab', `
        float cph = float(gl_InstanceID) * 1.3;
        if (abs(transformed.x) > 0.2 && transformed.y < 0.0) transformed.y += abs(sin(uTime * 9.0 + cph + transformed.z * 20.0)) * 0.04;
      `), count: 24, bottom: true, yMin: -60, yMax: -1.5, speed: 0.35, scale: 1.0, rMin: 4, rMax: 22 });

    // lanternfish photophores need the object-space position in the fragment shader
    const lf = this.species.find((s) => s.name === 'lanternfish').mesh.material;
    const prev = lf.onBeforeCompile;
    lf.onBeforeCompile = (sh) => {
      prev(sh);
      sh.vertexShader = 'varying vec3 vObjL;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjL = position;');
    };

    // jellyfish: pale in the shallows, glowing in the deep
    const jn = 36;
    this.jellySp = new Species({ name: 'jelly', geo: jellyGeo(), mat: jellyMaterial(), count: jn, yMin: -55, yMax: -1.5, speed: 0.25, scale: 0.85, rMin: 5, rMax: 30, turn: 0.2 });
    this.jellySp.base = jn;
    this.jelly = this.jellySp.mesh;
    this.jelly.renderOrder = 5;
    this.jelly.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(jn * 3), 3));
    this.species.push(this.jellySp);
    this.group.add(this.jelly);

    this.bait = new BaitBall(220);
    this.bait.base = 220;
    this.group.add(this.bait.mesh);

    // firefly squid swarm (ホタルイカ) and lures
    this.firefly = glowPoints(420, 0.2, 1);
    this.ff = [];
    const fc = this.firefly.geometry.attributes.aColor;
    for (let i = 0; i < 420; i++) {
      this.ff.push({ o: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 16), ph: Math.random() * 100 });
      fc.setXYZ(i, 0.5, 1.8, 4.5);
    }
    this.ffCenter = new THREE.Vector3(0, -30, -280);
    this.lures = glowPoints(5, 0.22, 0.4);
    const lc = this.lures.geometry.attributes.aColor;
    for (let i = 0; i < 5; i++) lc.setXYZ(i, 1.6, 2.8, 2.2);
    this.group.add(this.firefly, this.lures);

    this.setFactor(factor);
  }

  setFactor(f) {
    for (const s of this.species) s.active = Math.max(s.base >= 5 ? 1 : s.base, Math.round(s.base * Math.max(f, 0.35)));
    this.bait.active = Math.round(220 * Math.max(f, 0.4));
    this.firefly.geometry.setDrawRange(0, Math.round(420 * Math.max(f, 0.4)));
  }

  update(dt, t, camera) {
    this.frame++;
    const cam = camera.position;
    if (cam.y > 6) return; // nothing to see from the sky
    camera.getWorldDirection(_f);
    const fwd = _f.clone();
    fwd.y = 0;
    fwd.normalize();
    for (const s of this.species) s.update(dt, t, cam, fwd, this.frame);

    // jellies: tint by depth (moon jelly -> glowing deep jelly)
    const tint = this.jelly.geometry.attributes.aTint;
    this.jellySp.items.forEach((c, i) => {
      const deep = THREE.MathUtils.smoothstep(-c.p.y, 10, 28);
      const hue = (i * 0.137) % 1;
      _c.setHSL(0.5 + hue * 0.45, 0.8, 0.6);
      tint.setXYZ(i, THREE.MathUtils.lerp(0.55, _c.r * 1.8, deep), THREE.MathUtils.lerp(0.7, _c.g * 1.8, deep), THREE.MathUtils.lerp(0.8, _c.b * 1.8, deep));
    });
    tint.needsUpdate = true;

    this.bait.update(dt, t, cam, fwd);

    // firefly squid: follow the camera when it's deep, loosely
    const deepHere = cam.y < -14;
    if (deepHere && this.ffCenter.distanceTo(cam) > 40) this.ffCenter.set(cam.x + fwd.x * 14, Math.min(cam.y, -8), cam.z + fwd.z * 14);
    this.ffCenter.x += Math.sin(t * 0.13) * dt * 0.8;
    this.ffCenter.z += Math.cos(t * 0.11) * dt * 0.8;
    const fp = this.firefly.geometry.attributes.position;
    this.ff.forEach((f, i) => {
      const x = this.ffCenter.x + f.o.x + Math.sin(t * 0.4 + f.ph) * 1.2;
      const y = this.ffCenter.y + f.o.y + Math.sin(t * 0.33 + f.ph * 2) * 0.6;
      const z = this.ffCenter.z + f.o.z + Math.cos(t * 0.37 + f.ph) * 1.2;
      fp.setXYZ(i, x, deepHere || cam.y < -3 ? y : -999, z);
    });
    fp.needsUpdate = true;

    // lures hang in front of each anglerfish
    const ang = this.species.find((s) => s.name === 'angler');
    const lp = this.lures.geometry.attributes.position;
    ang.items.forEach((c, i) => {
      if (!c.alive || i >= ang.active) {
        lp.setXYZ(i, 0, -999, 0);
        return;
      }
      _v.set(0, 0.62, 0.62).multiplyScalar(c.sc);
      _m.lookAt(c.h, _zero, _up);
      _v.applyMatrix4(_m).add(c.p);
      lp.setXYZ(i, _v.x, _v.y, _v.z);
    });
    lp.needsUpdate = true;
  }
}
