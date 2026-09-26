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
// Each bubble is shaded like a tiny glass sphere: dark-ish body, bright fresnel rim,
// a sharp specular dot and light from the surface above. Big ones wobble.
export class Bubbles {
  constructor(maxCount, vents) {
    this.max = maxCount;
    this.limit = maxCount;
    this.vents = vents;
    this.pos = new Float32Array(maxCount * 3);
    this.size = new Float32Array(maxCount);
    this.vel = new Float32Array(maxCount);
    this.seed = new Float32Array(maxCount);
    this.next = 0;
    this.ventTimer = 0;
    this.ambientTimer = 0;
    this.columns = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: glowScale, uTime: U.uTime },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aSeed;
        uniform float uScale;
        uniform float uTime;
        varying float vA;
        varying float vSeed;
        varying float vPx;
        varying float vDepth;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec4 mv = viewMatrix * wp;
          float px = aSize * uScale / -mv.z;
          vA = aSize > 0.0 ? 1.0 : 0.0;
          // fade tiny, far bubbles instead of letting them alias into noise
          vA *= smoothstep(0.6, 2.5, px) * (1.0 - smoothstep(30.0, 45.0, -mv.z));
          vSeed = aSeed;
          vPx = px;
          vDepth = -wp.y;
          gl_PointSize = clamp(px, 0.0, 90.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying float vA;
        varying float vSeed;
        varying float vPx;
        varying float vDepth;
        void main(){
          if (vA <= 0.0) discard;
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          p.y = -p.y;
          // big bubbles wobble into a flattened, breathing shape
          float wob = smoothstep(8.0, 30.0, vPx);
          float a = atan(p.y, p.x);
          float r = length(p * vec2(1.0, 1.0 + 0.18 * wob)) * (1.0 + wob * 0.06 * sin(a * 3.0 + uTime * 7.0 + vSeed * 20.0));
          float aa = 2.0 / max(vPx, 1.0);
          float disk = 1.0 - smoothstep(1.0 - aa, 1.0, r);
          if (disk <= 0.0) discard;
          float nz = sqrt(max(0.0, 1.0 - r * r));
          float fres = pow(1.0 - nz, 2.5);
          // light from above: the top of the bubble reflects the bright surface
          float top = smoothstep(-0.8, 0.9, p.y);
          vec3 surf = mix(vec3(0.25, 0.55, 0.55), vec3(1.0, 0.92, 0.8), top);
          vec3 col = surf * fres * 1.3;
          // specular highlight + a soft secondary one at the bottom (light through the bubble)
          float spec = smoothstep(0.28, 0.0, length(p - vec2(-0.35, 0.42)));
          float spec2 = smoothstep(0.35, 0.0, length(p - vec2(0.25, -0.5))) * 0.35;
          col += vec3(1.0) * spec * 1.6 + vec3(0.6, 0.9, 0.85) * spec2;
          float alpha = clamp(fres * 0.85 + spec + spec2 + 0.06, 0.0, 1.0) * disk * vA;
          col *= exp(-vDepth * 0.03);
          gl_FragColor = vec4(col * alpha, alpha * 0.55);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  // size: base radius in metres (visual diameter ~ 2x)
  emit(x, y, z, count, spread = 0.3, big = 1) {
    for (let i = 0; i < count; i++) {
      const k = this.next;
      this.next = (this.next + 1) % this.limit;
      this.pos[k * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[k * 3 + 2] = z + (Math.random() - 0.5) * spread;
      const r = Math.random();
      this.size[k] = (0.018 + r * r * r * 0.16) * big;
      this.vel[k] = 0.3 + Math.random() * 0.5;
      this.seed[k] = Math.random();
    }
  }

  setLimit(n) {
    this.limit = Math.min(n, this.max);
    this.next = 0;
    this.size.fill(0);
  }

  update(dt, t, player, underwater) {
    // vents near the player: steady streams
    this.ventTimer -= dt;
    if (this.ventTimer <= 0) {
      this.ventTimer = 0.08;
      for (const v of this.vents) {
        const dx = v[0] - player.x;
        const dz = v[2] - player.z;
        if (dx * dx + dz * dz < 50 * 50 && Math.random() < 0.55) this.emit(v[0], v[1], v[2], 1 + ((Math.random() * 3) | 0), 0.35, 1);
      }
    }
    // ambient bubble columns rising from the floor around the swimmer
    if (underwater) {
      this.ambientTimer -= dt;
      if (this.ambientTimer <= 0) {
        this.ambientTimer = 0.5;
        if (this.columns.length < 7) {
          const a = Math.random() * Math.PI * 2;
          const r = 5 + Math.random() * 22;
          this.columns.push({ x: player.x + Math.cos(a) * r, z: player.z + Math.sin(a) * r, life: 6 + Math.random() * 10, rate: 0.05 + Math.random() * 0.1, acc: 0 });
        }
      }
    }
    this.columns = this.columns.filter((c) => {
      c.life -= dt;
      c.acc += dt;
      if (c.acc > c.rate) {
        c.acc = 0;
        this.emit(c.x, player.y - 12 + Math.random() * 2, c.z, 1 + ((Math.random() * 2) | 0), 0.25, 0.8);
      }
      return c.life > 0 && Math.hypot(c.x - player.x, c.z - player.z) < 40;
    });

    for (let k = 0; k < this.limit; k++) {
      if (this.size[k] <= 0) continue;
      const i = k * 3;
      const s = this.seed[k] * 100;
      const sz = this.size[k];
      // bigger bubbles rise faster and zig-zag more
      const vmax = 0.6 + sz * 9;
      this.vel[k] = Math.min(this.vel[k] + dt * 1.2, vmax);
      this.pos[i + 1] += this.vel[k] * dt;
      const zig = 0.15 + sz * 2.5;
      this.pos[i] += Math.sin(t * (2.5 + sz * 10) + s) * dt * zig;
      this.pos[i + 2] += Math.cos(t * (2.2 + sz * 9) + s) * dt * zig;
      const y = this.pos[i + 1];
      if (y > -0.35 && y > waveHeight(this.pos[i], this.pos[i + 2], t) - 0.04) this.size[k] = 0;
      // gentle growth as pressure drops
      else this.size[k] = sz * (1 + dt * 0.012);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aSeed.needsUpdate = true;
  }
}

// ---------------- light shafts ----------------
// Many soft beams, clustered around the camera. Each has streaks along its length that
// drift, so the light appears to shimmer like it does under real waves.
export function createShafts(maxCount) {
  const R = 38;
  const n = maxCount;
  const base = new Float32Array(n * 4 * 3);
  const corner = new Float32Array(n * 4 * 2);
  const params = new Float32Array(n * 4 * 4);
  const idx = [];
  for (let i = 0; i < n; i++) {
    const bx = (Math.random() * 2 - 1) * R;
    const bz = (Math.random() * 2 - 1) * R;
    const wide = Math.random() < 0.3;
    const w = wide ? 5 + Math.random() * 7 : 0.8 + Math.random() * 3;
    const len = 20 + Math.random() * 35;
    const ph = Math.random() * 100;
    const inten = wide ? 0.3 + Math.random() * 0.25 : 0.6 + Math.random() * 0.6;
    for (let k = 0; k < 4; k++) {
      base.set([bx, 0, bz], (i * 4 + k) * 3);
      corner.set([k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0], (i * 4 + k) * 2);
      params.set([w, len, ph, inten], (i * 4 + k) * 4);
    }
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uUnder: U.uUnderFade, uSunDir: U.uSunDir, uR: { value: R } },
    vertexShader: /* glsl */ `
      attribute vec2 aCorner;
      attribute vec4 aParams;
      uniform float uTime;
      uniform float uR;
      uniform vec3 uSunDir;
      varying vec2 vC;
      varying float vA;
      varying float vPh;
      varying float vW;
      varying vec3 vWP;
      void main(){
        vec3 b = position;
        // slow drift so the pattern of beams keeps changing
        b.xz += vec2(sin(uTime * 0.05 + aParams.z), cos(uTime * 0.04 + aParams.z)) * 4.0;
        b.xz = mod(b.xz - cameraPosition.xz + uR, 2.0 * uR) - uR + cameraPosition.xz;
        b.y = 0.2;
        vec3 A = normalize(vec3(-uSunDir.x * 0.45, -1.0, -uSunDir.z * 0.45));
        vec3 P = b + A * aCorner.y * aParams.y;
        vec3 toC = normalize(cameraPosition - P);
        vec3 right = normalize(cross(A, toC));
        float sway = sin(uTime * 0.35 + aParams.z) * 0.8;
        P += right * ((aCorner.x - 0.5) * aParams.x * (1.0 + aCorner.y * 0.6) + sway * aCorner.y);
        float d = length(b.xz - cameraPosition.xz);
        // beams fade when seen end-on and when far
        float side = 1.0 - abs(dot(toC, A));
        vA = (1.0 - smoothstep(uR * 0.55, uR * 0.95, d)) * (0.55 + 0.45 * sin(uTime * 0.5 + aParams.z)) * aParams.w * smoothstep(0.0, 0.35, side);
        // light dies out with depth, and beams right in front of the lens fade away
        vA *= exp(P.y * 0.07);
        vWP = P;
        vC = aCorner;
        vPh = aParams.z;
        vW = aParams.x;
        gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uUnder;
      uniform float uTime;
      varying vec2 vC;
      varying float vA;
      varying float vPh;
      varying float vW;
      varying vec3 vWP;
      void main(){
        // swimming into a beam: it thins out instead of whiting out the screen
        float near = smoothstep(2.5, 12.0, length(vWP - cameraPosition));
        float along = pow(1.0 - vC.y, 1.3);
        float across = sin(vC.x * 3.14159);
        // streaks inside the beam, drifting sideways
        float streak = 0.55 + 0.45 * sin(vC.x * (6.0 + vW) + uTime * 0.7 + vPh) * sin(vC.x * 13.0 - uTime * 0.45 + vPh * 2.0);
        float a = along * across * across * vA * uUnder * streak * near;
        gl_FragColor = vec4(vec3(0.5, 0.78, 0.62) * a * 0.22, 1.0);
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
