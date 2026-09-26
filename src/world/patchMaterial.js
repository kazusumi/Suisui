// Injects the "flooded world" look into standard three.js materials:
//  - caustics + depth absorption for anything below the waterline
//  - sky-matched atmospheric haze above water
//  - optional procedural facades (windows, lit rooms, shop fronts, vending machines)
import { U } from '../globals.js';
import { NOISE, SKY_GLSL, CAUSTICS_GLSL } from '../shaders/common.js';

const FACADE_FRAG = /* glsl */ `
#ifdef FACADE
{
  vec3 facadeEmissive = vec3(0.0);
  float kind = floor(vStyle.x + 0.5);
  vec2 fu = vFacade;
  vec3 wall = diffuseColor.rgb;
  vec3 Vv = normalize(cameraPosition - vWPos);
  vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float nz = vnoise(fu * vec2(0.6, 1.1) + vStyle.y * 7.0);
  wall *= 0.86 + 0.28 * nz;
  diffuseColor.rgb = wall;
  if (kind > 0.5 && kind < 3.5){
    bool office = kind > 1.5 && kind < 2.5;
    vec2 bf = office ? vec2(2.2, 3.6) : vec2(2.8, 3.0);
    vec2 cell = fu / bf;
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    vec2 hw = office ? vec2(0.43, 0.32) : vec2(0.25, 0.23);
    if (kind > 2.5 && id.y < 0.5) hw = vec2(0.46, 0.38);
    vec2 fw = fwidth(cell) * 1.5 + 1e-4;
    vec2 dd = abs(f - vec2(0.5, 0.52)) - hw;
    float win = (1.0 - smoothstep(-fw.x, fw.x, dd.x)) * (1.0 - smoothstep(-fw.y, fw.y, dd.y));
    float farF = smoothstep(0.2, 0.6, max(fw.x, fw.y));
    win = mix(win, hw.x * hw.y * 3.2, farF);
    float h = hash12(id + vStyle.y * 31.7);
    float h2 = hash12(id.yx + vStyle.y * 11.3 + 5.0);
    float lit = step(1.0 - vStyle.z, h);
    float ledge = (1.0 - smoothstep(0.0, 0.07, f.y)) * (1.0 - farF);
    wall *= 1.0 - ledge * 0.35;
    vec3 R = reflect(-Vv, wN);
    float fres = pow(1.0 - max(dot(Vv, wN), 0.0), 3.0);
    vec3 refl = skyBase(normalize(vec3(R.x, abs(R.y) + 0.02, R.z)));
    vec3 interior = mix(vec3(0.025, 0.03, 0.045), vec3(0.16, 0.10, 0.07) * h2, 0.5);
    vec3 glass = interior + refl * ((office ? 0.25 : 0.1) + 0.6 * fres);
    diffuseColor.rgb = mix(wall, glass, win);
    vec3 lc = h2 < 0.55 ? vec3(1.0, 0.6, 0.28) : (h2 < 0.82 ? vec3(0.7, 0.82, 1.0) : (h2 < 0.92 ? vec3(0.25, 1.0, 0.85) : vec3(1.0, 0.3, 0.65)));
    float glow = 0.7 + 0.6 * vnoise(f * 2.5 + id * 3.1);
    if (kind > 2.5 && id.y < 0.5){
      // shop front: shelves / goods silhouettes instead of a flat bright pane
      float shelf = step(0.5, fract(f.y * 7.0)) * 0.5 + 0.5;
      float goods = vnoise(vec2(f.x * 18.0, floor(f.y * 7.0)) + id * 7.0);
      glow *= shelf * (0.35 + 0.65 * goods) * 0.6;
    }
    facadeEmissive = mix(win * lit * lc * glow, vec3(0.9, 0.7, 0.5) * hw.x * hw.y * 3.2 * vStyle.z, farF) * 1.2;
  } else if (kind > 3.5 && kind < 4.5){
    float s = step(0.5, fract(fu.x / 0.7));
    diffuseColor.rgb = mix(vec3(0.92, 0.9, 0.84), wall, s);
  } else if (kind > 4.5 && kind < 5.5){
    // vending machine front
    float w = vStyle.w;
    float inX = step(0.08, fu.x) * step(fu.x, w - 0.08);
    float disp = inX * step(1.0, fu.y) * step(fu.y, 1.68);
    float rows = step(0.35, fract((fu.y - 1.0) / 0.22)) * step(0.25, fract(fu.x / (w / 6.0)));
    float btn = inX * step(0.78, fu.y) * step(fu.y, 0.86) * step(0.5, fract(fu.x / 0.12));
    vec3 cans = mix(vec3(1.0, 0.3, 0.2), vec3(0.2, 0.6, 1.0), hash12(floor(vec2(fu.x / (w / 6.0), (fu.y - 1.0) / 0.22)) + vStyle.y));
    diffuseColor.rgb = mix(wall, vec3(0.9), disp);
    facadeEmissive = disp * mix(vec3(1.6, 1.7, 1.8), cans * 1.5, rows * 0.7) + btn * vec3(1.5, 0.4, 0.2);
  } else if (kind > 6.5 && kind < 7.5){
    // rolled-down shutter
    float rib = 0.72 + 0.28 * step(0.45, fract(fu.y / 0.11));
    diffuseColor.rgb = vec3(0.6, 0.62, 0.64) * rib * (0.85 + 0.25 * nz);
  } else if (kind > 7.5 && kind < 8.5){
    // brightly lit glass shop front (convenience store, diner, phone box)
    float fx = fract(fu.x / 2.4);
    float mull = step(0.035, fx) * step(fx, 0.965);
    float glassY = step(0.12, fu.y) * step(fu.y, 2.9);
    float glass = mull * glassY;
    float row = floor(fu.y * 2.4);
    float shelf = step(0.45, fract(fu.y * 2.4)) * step(fu.y, 1.9);
    vec3 prod = mix(vec3(1.0, 0.45, 0.3), vec3(0.3, 0.75, 1.0), vnoise(vec2(fu.x * 7.0, row * 3.0)));
    prod = mix(prod, vec3(1.0, 0.9, 0.35), step(0.7, vnoise(vec2(fu.x * 3.0 + 9.0, row))));
    vec3 inside = vStyle.z > 0.5 ? vec3(1.5, 0.95, 0.5) : vec3(1.45, 1.55, 1.6);
    diffuseColor.rgb = mix(wall, vec3(0.08), glass);
    facadeEmissive = glass * mix(inside * 0.8, inside * 0.25 + prod * 0.9, shelf * 0.85) * 0.6;
  } else if (kind > 5.5 && kind < 6.5){
    float band = step(0.95, fu.y) * step(fu.y, 1.35);
    diffuseColor.rgb = mix(wall, vec3(0.05, 0.07, 0.09) + skyBase(reflect(-Vv, wN)) * 0.15, band);
  }
  float wl = vWPos.y;
  float wet = 1.0 - smoothstep(0.0, 0.8, wl + 0.2 * nz);
  diffuseColor.rgb *= 1.0 - 0.32 * wet;
  float algae = smoothstep(0.0, -1.8, wl) * vnoise(vWPos.xz * 0.45 + vWPos.y * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.19, 0.09), algae * 0.5);
  facadeEmissive *= 1.0 + (1.0 - smoothstep(-2.5, 0.0, wl)) * 0.6;
  totalEmissiveRadiance += facadeEmissive;
}
#endif
`;

const WATER_FRAG = /* glsl */ `
{
  float wd = -vWPos.y + 0.06 * sin(vWPos.x * 0.3 + uTime * 0.8);
  if (wd > 0.0){
    float cw = 1.0;
    #ifdef WP_NORMAL
      vec3 wn2 = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
      cw = 0.3 + 0.7 * max(wn2.y, 0.0);
    #endif
    // sunlight loses its red on the way down: lit surfaces turn blue-green with depth (emissive untouched)
    vec3 lightTint = mix(vec3(1.0), vec3(0.5, 0.82, 0.92), smoothstep(0.0, 4.0, wd));
    #ifdef WP_NORMAL
      outgoingLight = (outgoingLight - totalEmissiveRadiance) * lightTint + totalEmissiveRadiance;
    #else
      outgoingLight *= mix(vec3(1.0), lightTint, 0.5);
    #endif
    float c = caustics(vWPos.xz / 7.0 + vec2(vWPos.y * 0.02), uTime * 0.55);
    float att = exp(-wd * 0.06) * smoothstep(0.0, 0.6, wd);
    outgoingLight += diffuseColor.rgb * c * att * cw * uCausticStr * vec3(0.85, 1.1, 1.0);
    if (uCamUnder < 0.5){
      vec3 Vd = normalize(vWPos - cameraPosition);
      float path = wd / max(-Vd.y, 0.12);
      vec3 absorb = exp(-path * vec3(0.32, 0.11, 0.085));
      outgoingLight = outgoingLight * absorb + vec3(0.018, 0.10, 0.11) * (1.0 - exp(-path * 0.2));
    }
  }
}
`;

const HAZE_FRAG = /* glsl */ `
if (uCamUnder < 0.5){
  vec3 dv = vWPos - cameraPosition;
  float dist = length(dv);
  float ff = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor(dv / max(dist, 1e-3)), ff);
}
`;

export function patchMaterial(mat, opts = {}) {
  const { facade = false, vertexHead = '', vertexBegin = '', fragHead = '', fragColor = '', uniforms = {}, key = '' } = opts;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uCamUnder = U.uCamUnder;
    shader.uniforms.uSunDir = U.uSunDir;
    shader.uniforms.uFogDensity = U.uFogDensity;
    shader.uniforms.uCausticStr = U.uCausticStr;
    shader.uniforms.uCausticIter = U.uCausticIter;
    Object.assign(shader.uniforms, uniforms);

    let vs = shader.vertexShader;
    vs =
      `uniform float uTime;\nvarying vec3 vWPos;\n` +
      (facade ? 'attribute vec4 aStyle;\nattribute vec2 aFacade;\nflat varying vec4 vStyle;\nvarying vec2 vFacade;\n' : '') +
      vertexHead +
      '\n' +
      vs;
    vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBegin}`);
    vs = vs.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWPos = (modelMatrix * wp4).xyz;
      }
      ${facade ? 'vStyle = aStyle; vFacade = aFacade;' : ''}`
    );
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    const hasNormal = fs.includes('#include <normal_fragment_begin>');
    fs =
      `uniform float uTime;\nuniform float uCamUnder;\nuniform float uFogDensity;\nuniform float uCausticStr;\nvarying vec3 vWPos;\n` +
      (hasNormal ? '#define WP_NORMAL\n' : '') +
      (facade ? '#define FACADE\nflat varying vec4 vStyle;\nvarying vec2 vFacade;\n' : '') +
      NOISE +
      SKY_GLSL +
      CAUSTICS_GLSL +
      fs;
    if (facade) {
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FACADE_FRAG}`);
    }
    if (fragColor) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${fragColor}`);
    fs = fragHead + '\n' + fs;
    fs = fs.replace('#include <opaque_fragment>', `${WATER_FRAG}\n#include <opaque_fragment>`);
    fs = fs.replace('#include <fog_fragment>', HAZE_FRAG);
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `wp-${facade ? 1 : 0}-${key}`;
  return mat;
}
