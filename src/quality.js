export const PRESETS = {
  HIGH: {
    name: 'HIGH',
    dpr: 2,
    waterSegs: 256,
    reflection: 0.5,
    snow: 1800,
    fish: 1,
    seaweed: 1,
    causticIter: 4,
    shafts: 60,
    bubbles: 1600,
    godrays: 20,
  },
  MEDIUM: {
    name: 'MEDIUM',
    dpr: 1.5,
    waterSegs: 176,
    reflection: 0.33,
    snow: 1000,
    fish: 0.65,
    seaweed: 0.6,
    causticIter: 3,
    shafts: 36,
    bubbles: 900,
    godrays: 12,
  },
  LOW: {
    name: 'LOW',
    dpr: 1,
    waterSegs: 112,
    reflection: 0,
    snow: 450,
    fish: 0.35,
    seaweed: 0.35,
    causticIter: 2,
    shafts: 18,
    bubbles: 450,
    godrays: 0,
  },
};

export const isMobile =
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export function autoQuality() {
  if (isMobile) {
    const cores = navigator.hardwareConcurrency || 4;
    return cores >= 8 ? 'MEDIUM' : 'LOW';
  }
  return 'HIGH';
}

// Final pixel ratio: phones get an extra cap because their screens are dense.
export function pixelRatioFor(preset) {
  const dpr = window.devicePixelRatio || 1;
  const cap = isMobile ? Math.min(preset.dpr, preset.name === 'LOW' ? 1 : 1.35) : preset.dpr;
  return Math.min(dpr, cap);
}
