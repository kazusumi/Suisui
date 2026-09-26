// Additive glow sprites for lamps, neon and signals.
import * as THREE from 'three';
import { U } from '../globals.js';

export const glowScale = { value: 800 };

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aRate;
uniform float uScale;
uniform float uTime;
varying vec3 vColor;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float blink = aRate > 0.0 ? smoothstep(0.0, 0.25, sin(uTime * aRate * 3.14159) ) : 1.0;
  vColor = aColor * blink;
  gl_PointSize = clamp(aSize * uScale / -mv.z, 0.0, 400.0);
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */ `
varying vec3 vColor;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float a = exp(-d * d * 5.0) * 0.55 + exp(-d * d * 40.0) * 0.8;
  a *= 1.0 - smoothstep(0.85, 1.0, d);
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

export function createGlows(list) {
  const n = list.length;
  const pos = new Float32Array(n * 3);
  const colr = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const rate = new Float32Array(n);
  list.forEach((g, i) => {
    pos.set([g.x, g.y, g.z], i * 3);
    colr.set([g.r, g.g, g.b], i * 3);
    size[i] = g.s;
    rate[i] = g.rate || 0;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colr, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aRate', new THREE.BufferAttribute(rate, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: glowScale, uTime: U.uTime },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = 5;
  return pts;
}
