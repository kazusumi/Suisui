import * as THREE from 'three';
import { waveUniformValue } from './waves.js';

export const SUN_DIR = new THREE.Vector3(-0.62, 0.15, -0.77).normalize();

// Uniform objects shared (by reference) between every patched material.
export const U = {
  uTime: { value: 0 },
  uCamUnder: { value: 0 },
  uSunDir: { value: SUN_DIR },
  uFogDensity: { value: 0.0031 },
  uCausticStr: { value: 1.0 },
  uCausticIter: { value: 4 },
  uWaves: { value: waveUniformValue },
  uUnderFade: { value: 0 },
};

export const WATER_TINT = new THREE.Color(0.03, 0.2, 0.2);
