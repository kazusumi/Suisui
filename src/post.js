// Scene -> HDR render target -> one full-screen pass that decides per pixel
// whether we look through air or water (so the waterline can split the lens),
// applies underwater absorption/fog/distortion, then tone maps.
import * as THREE from 'three';
import { U } from './globals.js';
import { NOISE, WAVES_GLSL } from './shaders/common.js';

export class Post {
  constructor(renderer, hdr) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthTexture: new THREE.DepthTexture(4, 4),
      samples: 0,
    });
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.uniforms = {
      tColor: { value: this.rt.texture },
      tDepth: { value: this.rt.depthTexture },
      uInvProjView: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uTime: U.uTime,
      uWaves: U.uWaves,
      uUnder: { value: 0 },
      uDrops: { value: 0 },
      uExposure: { value: 0.82 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uDistort: { value: 1 },
      uGodN: { value: 0 },
      uLightUV: { value: new THREE.Vector2(0.5, 1.2) },
      uLightOn: { value: 0 },
      uFilter: { value: 0 },
      uFlash: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h) {
    this.rt.setSize(w, h);
    this.uniforms.uRes.value.set(w, h);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    this.uniforms.uInvProjView.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
    this.uniforms.uCamPos.value.copy(camera.position);
    r.render(this.scene, this.cam);
  }
}

const FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInvProjView;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uUnder;
uniform float uDrops;
uniform float uExposure;
uniform vec2 uRes;
uniform float uDistort;
uniform int uGodN;
uniform vec2 uLightUV;
uniform float uLightOn;
uniform int uFilter;
uniform float uFlash;
varying vec2 vUv;
${NOISE}
${WAVES_GLSL}

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 worldAt(vec2 uv, float depth){
  vec4 p = uInvProjView * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
void main(){
  vec2 uv = vUv;
  // point on the near plane for this pixel: is the lens itself under water here?
  vec3 np = worldAt(vUv, 0.0);
  float wh = waterHeightAt(np.xz, uTime);
  float lineD = np.y - wh;
  float under = 1.0 - smoothstep(-0.004, 0.004, lineD);
  // only allow the split when we're near the surface; otherwise trust the global state
  under = mix(uUnder, under, step(abs(uCamPos.y - wh), 0.6));

  // wobble under water, droplets right after surfacing
  vec2 wob = vec2(sin(uv.y * 22.0 + uTime * 1.9), cos(uv.x * 17.0 + uTime * 1.6)) * 0.0022 * under * uDistort;
  float drop = 0.0;
  if (uDrops > 0.001){
    vec2 g = uv * vec2(uRes.x / uRes.y, 1.0) * 7.0;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash12(id);
    vec2 c = vec2(hash12(id + 3.1), hash12(id + 7.7)) - 0.5;
    c.y -= fract(uTime * 0.15 + h) * 0.4 * h;
    float r = 0.12 + 0.2 * h;
    float dd = length(f - c * 0.6);
    drop = smoothstep(r, r * 0.3, dd) * step(0.45, h) * uDrops;
    wob += (f - c * 0.6) * drop * 0.05;
    wob += (vec2(vnoise(uv * 9.0 + uTime), vnoise(uv * 9.0 - uTime)) - 0.5) * 0.008 * uDrops;
  }
  vec2 suv = clamp(uv + wob, 0.001, 0.999);
  vec3 col = texture2D(tColor, suv).rgb;
  float depth = texture2D(tDepth, suv).x;

  if (under > 0.001){
    vec3 wp = worldAt(suv, depth);
    vec3 rd = wp - np;
    float dist = depth >= 0.99999 ? 400.0 : length(rd);
    vec3 dir = normalize(rd);
    float camDepth = max(-uCamPos.y, 0.0);
    // fog colour: brighter & greener looking up, darker blue looking down / deeper
    vec3 fogUp = vec3(0.07, 0.30, 0.30);
    vec3 fogDown = vec3(0.008, 0.045, 0.07);
    vec3 fogCol = mix(fogDown, fogUp, smoothstep(-0.6, 0.9, dir.y));
    fogCol *= exp(-camDepth * 0.045);
    // warm light leaking in towards the sun
    fogCol += vec3(0.06, 0.07, 0.035) * pow(max(dot(dir, normalize(vec3(-0.35, 0.8, -0.45))), 0.0), 6.0) * exp(-camDepth * 0.08);
    vec3 absorb = exp(-dist * vec3(0.09, 0.035, 0.03));
    float fogF = 1.0 - exp(-dist * 0.028);
    vec3 uw = mix(col * absorb, fogCol, fogF);
    col = mix(col, uw, under);

    // god rays: march toward the light's screen position, gathering the bright surface
    if (uGodN > 0 && uLightOn > 0.001){
      vec2 dir = uLightUV - vUv;
      vec2 stepv = dir / float(uGodN) * 0.85;
      vec2 q = vUv + stepv * 0.5;
      float acc = 0.0;
      float w = 1.0;
      for (int i = 0; i < 32; i++){
        if (i >= uGodN) break;
        q += stepv;
        vec2 qc = clamp(q, 0.001, 0.999);
        vec3 c = texture2D(tColor, qc).rgb;
        float lum = dot(c, vec3(0.3, 0.55, 0.15));
        acc += max(lum - 0.28, 0.0) * w;
        w *= 0.955;
      }
      acc /= float(uGodN);
      col += vec3(0.55, 0.85, 0.72) * acc * 1.6 * uLightOn * under * exp(-camDepth * 0.05);
    }
  }
  // meniscus: a thin dark/bright seam where the waterline crosses the lens
  float seam = exp(-abs(lineD) * 220.0) * step(abs(uCamPos.y - wh), 0.6);
  col = mix(col, col * 0.4 + vec3(0.12, 0.2, 0.2), seam * 0.8);
  col += drop * vec3(0.05, 0.06, 0.06);

  col *= uExposure;
  col = aces(col);
  // gentle grade: lift shadows toward teal, keep highlights warm
  col = mix(col, col * vec3(0.93, 1.02, 1.05) + vec3(0.0, 0.01, 0.015), 0.5 + 0.5 * under);
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * (0.55 + 0.6 * under);
  col *= vig;
  if (uFilter == 1){
    // vivid
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = clamp(mix(vec3(l), col, 1.35) * 1.05, 0.0, 1.0);
  } else if (uFilter == 2){
    // film: warm, lifted blacks, soft contrast, grain
    col = col * vec3(1.06, 1.0, 0.9) * 0.92 + vec3(0.045, 0.035, 0.03);
    col += (hash12(gl_FragCoord.xy * 0.73 + fract(uTime * 7.0) * 311.0) - 0.5) * 0.06;
  } else if (uFilter == 3){
    // monochrome
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = vec3(pow(l, 0.95)) * vec3(1.0, 0.99, 0.96);
  } else if (uFilter == 4){
    // dreamy: glow the highlights, pastel tint
    vec3 blur = vec3(0.0);
    for (int i = 0; i < 8; i++){
      float a = float(i) * 0.785;
      blur += aces(texture2D(tColor, suv + vec2(cos(a), sin(a)) * 0.012).rgb * uExposure);
    }
    blur /= 8.0;
    col = col + max(blur - 0.45, 0.0) * 0.9;
    col = mix(col, col * vec3(1.02, 0.96, 1.06) + 0.04, 0.6);
  } else if (uFilter == 5){
    // deep blue cinema
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l) * vec3(0.7, 0.95, 1.1), col, 0.55);
    col = smoothstep(0.02, 0.98, col);
  }
  col = mix(col, vec3(1.0), uFlash);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
