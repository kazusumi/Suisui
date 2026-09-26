// Shared GLSL snippets.

export const NOISE = /* glsl */ `
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++){
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return v;
}
`;

export const WAVES_GLSL = /* glsl */ `
uniform vec4 uWaves[4];
float waveShelter(float z){
  return 0.4 + 0.6 * smoothstep(-10.0, 80.0, z);
}
// Returns displacement; writes normal and jacobian.
vec3 gerstner(vec2 p, float t, float ampScale, out vec3 N, out float J){
  vec3 d = vec3(0.0);
  float nx = 0.0, nz = 0.0, ny = 1.0;
  float jxx = 1.0, jzz = 1.0, jxz = 0.0;
  float sh = waveShelter(p.y) * ampScale;
  for (int i = 0; i < 4; i++){
    vec4 w = uWaves[i];
    float k = 6.28318530718 / w.w;
    float c = sqrt(9.8 / k);
    float f = k * (dot(w.xy, p) - c * t);
    float s = w.z * sh;
    float a = s / k;
    float cf = cos(f);
    float sf = sin(f);
    d.x += w.x * a * cf;
    d.z += w.y * a * cf;
    d.y += a * sf;
    nx -= w.x * s * cf;
    nz -= w.y * s * cf;
    ny -= s * sf;
    jxx -= w.x * w.x * s * sf;
    jzz -= w.y * w.y * s * sf;
    jxz -= w.x * w.y * s * sf;
  }
  N = normalize(vec3(nx, ny, nz));
  J = jxx * jzz - jxz * jxz;
  return d;
}
vec3 gerstnerDisp(vec2 p, float t){
  vec3 d = vec3(0.0);
  float sh = waveShelter(p.y);
  for (int i = 0; i < 4; i++){
    vec4 w = uWaves[i];
    float k = 6.28318530718 / w.w;
    float c = sqrt(9.8 / k);
    float f = k * (dot(w.xy, p) - c * t);
    float a = w.z * sh / k;
    float cf = cos(f);
    d.x += w.x * a * cf;
    d.z += w.y * a * cf;
    d.y += a * sin(f);
  }
  return d;
}
float waterHeightAt(vec2 xz, float t){
  vec2 p = xz;
  for (int i = 0; i < 2; i++){
    vec3 d = gerstnerDisp(p, t);
    p = xz - d.xz;
  }
  return gerstnerDisp(p, t).y;
}
`;

// Sunset sky. Colours are linear HDR (tone mapped in the post pass).
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
vec3 skyBase(vec3 d){
  float y = d.y;
  float h = max(y, 0.0);
  float sunDot = max(dot(d, uSunDir), 0.0);
  vec3 zenith  = vec3(0.07, 0.10, 0.30);
  vec3 mid     = vec3(0.42, 0.26, 0.46);
  vec3 horizon = vec3(1.30, 0.58, 0.30);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.2, h));
  col = mix(col, zenith, smoothstep(0.14, 0.75, h));
  vec2 hd = normalize(d.xz + 1e-4);
  vec2 hs = normalize(uSunDir.xz);
  float side = pow(max(dot(hd, hs), 0.0), 3.0);
  col += vec3(1.1, 0.40, 0.10) * side * exp(-h * 5.0) * 0.8;
  // opposite side: cool violet band
  col += vec3(0.10, 0.12, 0.30) * pow(max(-dot(hd, hs), 0.0), 2.0) * exp(-h * 4.0);
  col += vec3(1.6, 0.75, 0.30) * pow(sunDot, 10.0) * 0.55;
  col += vec3(2.5, 1.3, 0.55) * pow(sunDot, 180.0) * 1.2;
  if (y < 0.0){
    vec3 below = vec3(0.06, 0.13, 0.16);
    col = mix(horizon * 0.55 + side * vec3(0.3, 0.12, 0.03), below, smoothstep(0.0, -0.12, y));
  }
  return col;
}
vec3 hazeColor(vec3 d){
  return skyBase(normalize(vec3(d.x, max(d.y, 0.0) * 0.4 + 0.015, d.z)));
}
`;

// Tileable water caustics (after joltz0r / Dave Hoskins).
export const CAUSTICS_GLSL = /* glsl */ `
uniform int uCausticIter;
float caustics(vec2 p, float time){
  vec2 q = mod(p * 6.28318530718, 6.28318530718) - 250.0;
  vec2 i = q;
  float c = 1.0;
  float inten = 0.005;
  float cnt = 0.0;
  for (int n = 0; n < 4; n++){
    if (n >= uCausticIter) break;
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = q + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(q.x / (sin(i.x + t) / inten), q.y / (cos(i.y + t) / inten)));
    cnt += 1.0;
  }
  c /= max(cnt, 1.0);
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 2.0);
}
`;
