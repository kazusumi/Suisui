// Marine snow (GPU-wrapped around the camera), bubbles (CPU pool) and light shafts.
import * as THREE from 'three';
import { U } from '../globals.js';
import { glowScale } from './glows.js';
import { waveHeight } from '../waves.js';

// ---------------- marine snow ----------------
export function createSnow(maxCount) {
  const size = 44;
  const pos = new Float32Array(maxCount * 3);
  const rnd = new Float32Array(maxCount);
  for (let i = 0; i < maxCount; i++) {
    pos[i * 3] = Math.random() * size;
    pos[i * 3 + 1] = Math.random() * size;
    pos[i * 3 + 2] = Math.random() * size;
    rnd[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uUnder: U.uUnderFade, uScale: glowScale, uSize: { value: size } },
    vertexShader: /* glsl */ `
      attribute float aRnd;
      uniform float uTime;
      uniform float uScale;
      uniform float uSize;
      varying float vA;
      void main(){
        vec3 p = position;
        p.y -= uTime * (0.05 + aRnd * 0.12);
        p.x += sin(uTime * 0.3 + aRnd * 30.0) * 0.6;
        p.z += cos(uTime * 0.25 + aRnd * 20.0) * 0.6;
        vec3 h = vec3(uSize * 0.5);
        p = mod(p - cameraPosition + h, uSize) - h + cameraPosition;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = length(p - cameraPosition);
        vA = (1.0 - smoothstep(uSize * 0.3, uSize * 0.5, d)) * step(p.y, -0.2) * (0.35 + aRnd * 0.65);
        gl_PointSize = clamp((0.035 + aRnd * 0.05) * uScale / -mv.z, 1.0, 10.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uUnder;
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.3, 1.0, d)) * vA * uUnder;
        gl_FragColor = vec4(vec3(0.55, 0.8, 0.75) * a * 0.8, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  pts.setCount = (n) => geo.setDrawRange(0, Math.min(n, maxCount));
  return pts;
}

// ---------------- bubbles ----------------
export class Bubbles {
  constructor(maxCount, vents) {
    this.max = maxCount;
    this.limit = maxCount;
    this.vents = vents;
    this.pos = new Float32Array(maxCount * 3);
    this.size = new Float32Array(maxCount);
    this.life = new Float32Array(maxCount);
    this.vel = new Float32Array(maxCount);
    this.seed = new Float32Array(maxCount);
    this.next = 0;
    this.ventTimer = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: glowScale },
      vertexShader: /* glsl */ `
        attribute float aSize;
        uniform float uScale;
        varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vA = aSize > 0.0 ? 1.0 : 0.0;
          gl_PointSize = clamp(aSize * uScale / -mv.z, 0.0, 64.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float rim = smoothstep(0.55, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
          float spec = smoothstep(0.25, 0.0, length(p - vec2(-0.15, 0.15)));
          float a = (rim * 0.8 + spec * 0.9 + 0.05) * vA * step(d, 1.0);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * a, 1.0);
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

  emit(x, y, z, count, spread = 0.3, big = 1) {
    for (let i = 0; i < count; i++) {
      const k = this.next;
      this.next = (this.next + 1) % this.limit;
      this.pos[k * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.size[k] = (0.03 + Math.random() * 0.08) * big;
      this.life[k] = 1;
      this.vel[k] = 0.6 + Math.random() * 0.8;
      this.seed[k] = Math.random() * 100;
    }
  }

  setLimit(n) {
    this.limit = Math.min(n, this.max);
    this.next = 0;
    this.size.fill(0);
  }

  update(dt, t, player) {
    // ambient vents near the player
    this.ventTimer -= dt;
    if (this.ventTimer <= 0) {
      this.ventTimer = 0.12;
      for (const v of this.vents) {
        const dx = v[0] - player.x;
        const dz = v[2] - player.z;
        if (dx * dx + dz * dz < 55 * 55 && Math.random() < 0.35) this.emit(v[0], v[1], v[2], 1 + (Math.random() * 2) | 0, 0.4, 1);
      }
    }
    for (let k = 0; k < this.limit; k++) {
      if (this.size[k] <= 0) continue;
      const i = k * 3;
      const s = this.seed[k];
      this.vel[k] = Math.min(this.vel[k] + dt * 0.8, 2.2);
      this.pos[i + 1] += this.vel[k] * dt;
      this.pos[i] += Math.sin(t * 3 + s) * dt * 0.25;
      this.pos[i + 2] += Math.cos(t * 2.6 + s) * dt * 0.25;
      const y = this.pos[i + 1];
      if (y > -0.3 && y > waveHeight(this.pos[i], this.pos[i + 2], t) - 0.05) this.size[k] = 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

// ---------------- light shafts ----------------
export function createShafts(maxCount) {
  const R = 45;
  const n = maxCount;
  const base = new Float32Array(n * 4 * 3);
  const corner = new Float32Array(n * 4 * 2);
  const params = new Float32Array(n * 4 * 3);
  const idx = [];
  for (let i = 0; i < n; i++) {
    const bx = (Math.random() * 2 - 1) * R;
    const bz = (Math.random() * 2 - 1) * R;
    const w = 1.5 + Math.random() * 4;
    const len = 18 + Math.random() * 22;
    const ph = Math.random() * 100;
    for (let k = 0; k < 4; k++) {
      base.set([bx, 0, bz], (i * 4 + k) * 3);
      corner.set([k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0], (i * 4 + k) * 2);
      params.set([w, len, ph], (i * 4 + k) * 3);
    }
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('aParams', new THREE.BufferAttribute(params, 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uUnder: U.uUnderFade, uSunDir: U.uSunDir, uR: { value: R } },
    vertexShader: /* glsl */ `
      attribute vec2 aCorner;
      attribute vec3 aParams;
      uniform float uTime;
      uniform float uR;
      uniform vec3 uSunDir;
      varying vec2 vC;
      varying float vA;
      void main(){
        vec3 b = position;
        b.xz = mod(b.xz - cameraPosition.xz + uR, 2.0 * uR) - uR + cameraPosition.xz;
        b.y = 0.2;
        vec3 A = normalize(vec3(-uSunDir.x * 0.45, -1.0, -uSunDir.z * 0.45));
        vec3 P = b + A * aCorner.y * aParams.y;
        vec3 toC = normalize(cameraPosition - P);
        vec3 right = normalize(cross(A, toC));
        float sway = sin(uTime * 0.35 + aParams.z) * 0.8;
        P += right * ((aCorner.x - 0.5) * aParams.x + sway * aCorner.y);
        float d = length(b.xz - cameraPosition.xz);
        vA = (1.0 - smoothstep(uR * 0.55, uR * 0.95, d)) * (0.5 + 0.5 * sin(uTime * 0.6 + aParams.z));
        vC = aCorner;
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uUnder;
      varying vec2 vC;
      varying float vA;
      void main(){
        float along = pow(1.0 - vC.y, 1.6);
        float across = sin(vC.x * 3.14159);
        float a = along * across * across * vA * uUnder;
        gl_FragColor = vec4(vec3(0.45, 0.7, 0.55) * a * 0.32, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  mesh.setCount = (c) => geo.setDrawRange(0, Math.min(c, n) * 6);
  return mesh;
}
