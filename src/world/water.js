import * as THREE from 'three';
import { U } from '../globals.js';
import { NOISE, SKY_GLSL, WAVES_GLSL } from '../shaders/common.js';
import { BAKE } from './terrain.js';

// ---------- tileable detail normal map (sum of integer-frequency waves) ----------
function makeNormalMap(N = 256) {
  const h = new Float32Array(N * N);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const waves = [];
  for (let i = 0; i < 48; i++) {
    const kx = Math.round((rnd() * 2 - 1) * 14);
    const ky = Math.round((rnd() * 2 - 1) * 14);
    if (kx === 0 && ky === 0) continue;
    const k = Math.hypot(kx, ky);
    waves.push([kx, ky, rnd() * Math.PI * 2, 1 / Math.pow(k, 1.25)]);
  }
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      let v = 0;
      for (const [kx, ky, ph, a] of waves) v += a * Math.sin(((kx * i + ky * j) / N) * Math.PI * 2 + ph);
      h[j * N + i] = v;
    }
  const data = new Uint8Array(N * N * 4);
  const s = 2.2;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const l = h[j * N + ((i - 1 + N) % N)];
      const r = h[j * N + ((i + 1) % N)];
      const d = h[((j - 1 + N) % N) * N + i];
      const u = h[((j + 1) % N) * N + i];
      const nx = (l - r) * s;
      const nz = (d - u) * s;
      const len = Math.hypot(nx, nz, 1);
      const k = (j * N + i) * 4;
      data[k] = ((nx / len) * 0.5 + 0.5) * 255;
      data[k + 1] = ((nz / len) * 0.5 + 0.5) * 255;
      data[k + 2] = (1 / len) * 255;
      data[k + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ---------- grid: dense around the player, stretched towards the horizon ----------
const RANGE = 1500;
const CENTER_FRAC = 0.05;
function makeGrid(N) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const f = (u) => RANGE * (CENTER_FRAC * u + (1 - CENTER_FRAC) * Math.pow(u, 5));
  let k = 0;
  for (let j = 0; j <= N; j++) {
    const v = (j / N) * 2 - 1;
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1;
      pos[k++] = f(u);
      pos[k++] = 0;
      pos[k++] = f(v);
    }
  }
  const idx = new Uint32Array(N * N * 6);
  k = 0;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c = a + N + 1;
      const d = c + 1;
      idx[k++] = a;
      idx[k++] = c;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = c;
      idx[k++] = d;
    }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RANGE * 1.5);
  return { geo: g, step: (RANGE * CENTER_FRAC * 2) / N };
}

export class Water {
  constructor(waterData, quality) {
    this.reflMatrix = new THREE.Matrix4();
    this.uniforms = {
      uTime: U.uTime,
      uWaves: U.uWaves,
      uSunDir: U.uSunDir,
      uCamUnder: U.uCamUnder,
      uFogDensity: U.uFogDensity,
      uNormalMap: { value: makeNormalMap() },
      uWaterData: { value: waterData },
      uBake: { value: new THREE.Vector4(BAKE.x0, BAKE.z0, 1 / (BAKE.x1 - BAKE.x0), 1 / (BAKE.z1 - BAKE.z0)) },
      uRefl: { value: null },
      uReflMatrix: { value: this.reflMatrix },
      uUseRefl: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.setQuality(quality);

    // planar reflection
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.virtualCam = new THREE.PerspectiveCamera();
    this.reflScale = quality.reflection;
  }

  setQuality(q) {
    const { geo, step } = makeGrid(q.waterSegs);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.step = step;
    this.reflScale = q.reflection;
  }

  update(camera) {
    this.mesh.position.set(Math.round(camera.position.x / this.step) * this.step, 0, Math.round(camera.position.z / this.step) * this.step);
  }

  // Render the mirrored scene into this.rt (skipped when under water or on LOW).
  renderReflection(renderer, scene, camera, hide) {
    const use = this.reflScale > 0 && camera.position.y > 0.05;
    this.uniforms.uUseRefl.value = use ? 1 : 0;
    if (!use) return;
    const size = renderer.getDrawingBufferSize(_size);
    const w = Math.max(4, Math.floor(size.x * this.reflScale));
    const h = Math.max(4, Math.floor(size.y * this.reflScale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);

    const vc = this.virtualCam;
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);
    vc.position.set(_camPos.x, -_camPos.y, _camPos.z);
    _target.set(_look.x, -_look.y, _look.z);
    vc.up.set(0, 1, 0).applyMatrix4(_rot);
    vc.up.y *= -1;
    vc.lookAt(_target);
    vc.near = camera.near;
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    this.reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.reflMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    // oblique near plane = water plane (clips everything below the surface)
    _plane.setFromNormalAndCoplanarPoint(_up, _zero).applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = vc.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + pm[8]) / pm[0];
    _q.y = (Math.sign(_clip.y) + pm[9]) / pm[5];
    _q.z = -1;
    _q.w = (1 + pm[10]) / pm[14];
    _clip.multiplyScalar(2 / _clip.dot(_q));
    pm[2] = _clip.x;
    pm[6] = _clip.y;
    pm[10] = _clip.z + 1;
    pm[14] = _clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();

    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevRT);
    hide.forEach((o, i) => (o.visible = vis[i]));
    this.uniforms.uRefl.value = this.rt.texture;
  }
}

const _size = new THREE.Vector2();
const _camPos = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
const _up = new THREE.Vector3(0, 1, 0);
const _zero = new THREE.Vector3();

const VERT = /* glsl */ `
uniform float uTime;
uniform mat4 uReflMatrix;
${WAVES_GLSL}
varying vec3 vW;
varying vec3 vN;
varying float vJ;
varying float vDisp;
varying vec4 vRefl;
void main(){
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  float dist = length(wp.xz - cameraPosition.xz);
  float amp = 1.0 - smoothstep(220.0, 700.0, dist);
  vec3 N; float J;
  vec3 d = gerstner(wp.xz, uTime, amp, N, J);
  wp += d;
  vW = wp;
  vN = N;
  vJ = J;
  vDisp = d.y;
  vRefl = uReflMatrix * vec4(wp.x, 0.0, wp.z, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uCamUnder;
uniform float uFogDensity;
uniform sampler2D uNormalMap;
uniform sampler2D uWaterData;
uniform vec4 uBake;
uniform sampler2D uRefl;
uniform float uUseRefl;
varying vec3 vW;
varying vec3 vN;
varying float vJ;
varying float vDisp;
varying vec4 vRefl;
${NOISE}
${SKY_GLSL}
void main(){
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float detail = 1.0 - smoothstep(30.0, 380.0, dist);

  vec2 n1 = texture2D(uNormalMap, vW.xz * 0.043 + uTime * vec2(0.011, -0.019)).xy * 2.0 - 1.0;
  vec2 n2 = texture2D(uNormalMap, vW.xz * 0.107 + uTime * vec2(-0.024, -0.013)).xy * 2.0 - 1.0;
  vec2 n3 = texture2D(uNormalMap, vW.xz * 0.29 + uTime * vec2(0.035, 0.041)).xy * 2.0 - 1.0;
  vec2 nd = (n1 * 0.55 + n2 * 0.45 + n3 * 0.3 * detail) * (0.25 + 0.75 * detail);
  vec3 N = normalize(vN + vec3(nd.x, 0.0, nd.y) * 0.6);

  vec4 wd = texture2D(uWaterData, (vW.xz - uBake.xy) * uBake.zw);
  float depth = wd.r * 25.0;
  float shore = wd.g;

  // foam: steep crests (jacobian) + contact foam around things sticking out of the water
  float fn = vnoise(vW.xz * 1.3 + uTime * vec2(0.25, -0.2)) * 0.6 + vnoise(vW.xz * 3.7 - uTime * 0.3) * 0.4;
  float crest = smoothstep(0.78, 0.42, vJ) * smoothstep(0.35, 0.65, fn);
  float ring = 0.55 + 0.45 * sin(shore * 18.0 - uTime * 2.2 + fn * 4.0);
  float contact = smoothstep(0.35, 0.95, shore * ring + shore * 0.3) * smoothstep(0.3, 0.6, fn + shore * 0.25);
  float foam = clamp(crest * 0.85 + contact, 0.0, 1.0) * (0.35 + 0.65 * detail);

  vec3 col;
  float alpha;

  if (gl_FrontFacing){
    float NdV = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
    vec3 R = reflect(-V, N);
    R.y = abs(R.y);
    vec3 refl = skyBase(R);
    if (uUseRefl > 0.5){
      vec4 rc = vRefl;
      rc.xy += (N.xz - vN.xz * 0.5) * 0.9 * rc.w * 0.05;
      vec3 rt = texture2DProj(uRefl, rc).rgb;
      refl = mix(refl, rt, 0.92);
    }
    vec3 deep = vec3(0.010, 0.045, 0.060);
    vec3 shallow = vec3(0.035, 0.17, 0.165);
    float sh = exp(-depth * 0.22);
    vec3 body = mix(deep, shallow, sh);
    // warm sky light scattered in the water body
    body += vec3(0.05, 0.035, 0.02) * (0.5 + 0.5 * N.y);
    // subsurface glow through wave crests when looking towards the sun
    vec2 vh = normalize(-V.xz + 1e-4);
    float toward = pow(max(dot(vh, normalize(uSunDir.xz)), 0.0), 3.0);
    float sss = toward * clamp(vDisp * 1.4 + 0.25, 0.0, 1.0) * (1.0 - F);
    body += vec3(0.07, 0.34, 0.28) * sss;

    col = mix(body, refl, F);
    float sd = max(dot(R, uSunDir), 0.0);
    col += vec3(3.4, 2.0, 1.05) * (pow(sd, 1200.0) * 60.0 + pow(sd, 160.0) * 2.0 + pow(sd, 18.0) * 0.08);

    vec3 foamCol = vec3(1.0, 0.86, 0.76) * (0.75 + 0.25 * max(dot(N, uSunDir), 0.0));
    col = mix(col, foamCol, foam * 0.9);
    alpha = mix(mix(0.5, 0.94, 1.0 - sh), 1.0, F);
    alpha = max(alpha, foam);
    alpha = mix(alpha, 1.0, smoothstep(60.0, 300.0, dist));

    if (uCamUnder < 0.5){
      float ff = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
      col = mix(col, hazeColor(-V), ff);
    }
  } else {
    // looking up from below: Snell's window + total internal reflection
    vec3 Nd = -N;
    vec3 I = -V;
    vec3 T = refract(I, Nd, 1.333);
    vec3 under = vec3(0.012, 0.075, 0.085);
    if (dot(T, T) < 1e-4){
      col = under * (0.8 + 0.4 * nd.x) ;
    } else {
      float edge = pow(1.0 - clamp(dot(T, -Nd), 0.0, 1.0), 2.0);
      vec3 sky = skyBase(normalize(vec3(T.x, max(T.y, 0.02), T.z)));
      float sd = max(dot(T, uSunDir), 0.0);
      sky += vec3(4.0, 2.4, 1.2) * (pow(sd, 60.0) * 3.0 + pow(sd, 8.0) * 0.3);
      col = mix(sky * 0.85, under * 1.6, edge * 0.8);
    }
    col = mix(col, vec3(0.5, 0.62, 0.6), foam * 0.18);
    alpha = 1.0;
  }
  gl_FragColor = vec4(col, alpha);
}
`;
