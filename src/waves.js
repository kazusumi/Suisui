// Gerstner wave definitions shared by the CPU (player / floaters) and the GPU (water shader).
// Each wave: [dirX, dirZ, steepness, wavelength]
import * as THREE from 'three';

const RAW = [
  [0.18, -1.0, 0.15, 21.0],
  [-0.45, -1.0, 0.13, 12.5],
  [0.62, -1.0, 0.11, 7.3],
  [-0.9, -0.6, 0.09, 4.1],
];

export const WAVES = RAW.map(([x, z, s, l]) => {
  const len = Math.hypot(x, z);
  return [x / len, z / len, s, l];
});

export const waveUniformValue = WAVES.map((w) => new THREE.Vector4(w[0], w[1], w[2], w[3]));

const G = 9.8;

// Waves are calmer inside the town than out on the open sea.
export function shelter(z) {
  const t = Math.min(Math.max((z + 10) / 90, 0), 1);
  const s = t * t * (3 - 2 * t);
  return 0.4 + 0.6 * s;
}

// Displacement of a surface point that started at (x, z).
function displace(x, z, t, out) {
  let dx = 0;
  let dy = 0;
  let dz = 0;
  const sh = shelter(z);
  for (let i = 0; i < WAVES.length; i++) {
    const [wx, wz, st, L] = WAVES[i];
    const k = (2 * Math.PI) / L;
    const c = Math.sqrt(G / k);
    const f = k * (wx * x + wz * z - c * t);
    const a = (st * sh) / k;
    const cf = Math.cos(f);
    dx += wx * a * cf;
    dz += wz * a * cf;
    dy += a * Math.sin(f);
  }
  out.x = dx;
  out.y = dy;
  out.z = dz;
  return out;
}

const tmp = { x: 0, y: 0, z: 0 };

// Water height at world (x, z). Inverts the horizontal displacement with a
// few fixed-point iterations so it lines up with what the GPU draws.
export function waveHeight(x, z, t) {
  let px = x;
  let pz = z;
  for (let i = 0; i < 3; i++) {
    displace(px, pz, t, tmp);
    px = x - tmp.x;
    pz = z - tmp.z;
  }
  displace(px, pz, t, tmp);
  return tmp.y;
}

// Approximate surface normal (finite differences), used for floating objects.
export function waveNormal(x, z, t, out) {
  const e = 0.6;
  const hL = waveHeight(x - e, z, t);
  const hR = waveHeight(x + e, z, t);
  const hD = waveHeight(x, z - e, t);
  const hU = waveHeight(x, z + e, t);
  out.set(hL - hR, 2 * e, hD - hU).normalize();
  return out;
}
