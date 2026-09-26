import * as THREE from 'three';
import { U } from '../globals.js';
import { NOISE, SKY_GLSL } from '../shaders/common.js';

export function createSky() {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSunDir: U.uSunDir, uTime: U.uTime },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position * 1800.0, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vDir;
      ${NOISE}
      ${SKY_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = skyBase(d);
        if (d.y > 0.0){
          vec2 uv = d.xz / (d.y + 0.08) * 0.9;
          uv += vec2(uTime * 0.004, uTime * 0.002);
          float n = fbm(uv * 0.9);
          float n2 = fbm(uv * 3.1 + 4.0);
          float cloud = smoothstep(0.48, 0.78, n * 0.8 + n2 * 0.3);
          cloud *= smoothstep(0.0, 0.08, d.y) * (1.0 - smoothstep(0.55, 0.9, d.y));
          float sd = max(dot(d, uSunDir), 0.0);
          vec3 lit = mix(vec3(0.55, 0.28, 0.42), vec3(1.9, 0.85, 0.35), pow(sd, 4.0));
          lit += vec3(2.5, 1.2, 0.5) * pow(sd, 30.0) * (1.0 - cloud) * 2.0;
          vec3 shade = vec3(0.22, 0.14, 0.26);
          vec3 cc = mix(lit, shade, smoothstep(0.55, 1.0, n2) * 0.7);
          col = mix(col, cc, cloud * 0.85);
          // sun disc (occluded by thick cloud)
          col += vec3(28.0, 16.0, 8.0) * smoothstep(0.99935, 0.9997, sd) * (1.0 - cloud * 0.8);
        }
        // subtle dithering against banding
        col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
