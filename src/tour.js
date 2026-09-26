// Auto tour: the camera glides along a looping route past the landmarks.
// The route moves you; you only turn your head. Three vantage points:
// submarine (under water), boat (on the surface) and airship (from the sky).
import * as THREE from 'three';
import { waveHeight, waveNormal } from './waves.js';
import { terrainHeight } from './world/terrain.js';

// [x, z] control points of the closed loop (follows streets / open water)
export const ROUTE = [
  [0, 135], [0, 80], [0, 32], [0, 14], [-10, 5], [-40, 5], [-75, 5], [-104, 2], [-110, -18],
  [-102, -34], [-80, -34], [-50, -34], [-18, -34], [4, -38], [22, -42], [36, -42], [46, -42],
  [50, -31], [61, -27], [73, -31], [78, -43], [72, -55], [60, -59], [52, -70],
  [38, -84], [6, -84], [0, -100], [2, -118], [8, -134], [14, -150], [4, -178],
  [-18, -200], [-42, -208], [-56, -220], [-44, -242], [-22, -266], [0, -292], [26, -276], [48, -250], [82, -214],
  [108, -168], [114, -120], [114, -60], [114, 0], [108, 42], [80, 84], [40, 118],
];

// Coarse distance-to-route lookup, used by the city generator to keep the route clear.
let _coarse = null;
export function routeDistance(x, z) {
  if (!_coarse) {
    const c = new THREE.CatmullRomCurve3(ROUTE.map(([a, b]) => new THREE.Vector3(a, 0, b)), true, 'centripetal');
    _coarse = c.getSpacedPoints(Math.ceil(c.getLength() / 2));
  }
  let best = Infinity;
  for (const p of _coarse) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
  return Math.sqrt(best);
}

export const LANDMARKS = [
  { name: 'スタート', x: 0, z: 135, color: '#ffd28a' },
  { name: '防波堤の切れ目', x: 0, z: 47, color: '#b9c4c8' },
  { name: '時計塔', x: 20, z: -10, color: '#ffe08a', left: true },
  { name: 'しおかぜ商店街', x: -50, z: -34, color: '#7ff0de' },
  { name: '鳥居', x: 42, z: -42, color: '#ff6a4d', left: true },
  { name: '神社の島', x: 64, z: -42, color: '#8fd16a' },
  { name: '学校', x: 84, z: -12, color: '#f2ead6' },
  { name: 'SUISUIタワー', x: 22, z: -100, color: '#6fe7ff' },
  { name: '沈んだバス', x: 12, z: -163, color: '#9fe0c4' },
  { name: '深海の海溝', x: 0, z: -292, color: '#5a7cff' },
];

export const VIEWS = {
  sub: { label: '潜水艦', pitch: 0.02 },
  boat: { label: '船', pitch: -0.05 },
  air: { label: '上空', pitch: -0.42 },
};
export const SPEEDS = [0, 2, 4, 8];

const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _n = new THREE.Vector3();

export class Tour {
  constructor(colliders) {
    const pts = ROUTE.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();
    const N = Math.ceil(this.length / 0.75);
    this.N = N;
    this.step = this.length / N;
    this.xs = new Float32Array(N);
    this.zs = new Float32Array(N);
    const need = new Float32Array(N);
    this.warnings = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      this.curve.getPointAt(i / N, p);
      this.xs[i] = p.x;
      this.zs[i] = p.z;
      // submarine cruising depth: ~2 m above the floor, never deeper than 7.5 m
      // allowed a little deeper over the amusement park so the rides are visible
      const nearPark = Math.hypot(p.x + 45, p.z + 190) < 48;
      const inTrench = p.z < -238;
      let y = Math.min(-1.2, Math.max(terrainHeight(p.x, p.z) + 2.2, inTrench ? -30 : nearPark ? -11.5 : -7.5));
      for (let pass = 0; pass < 2; pass++) {
        for (const c of colliders) {
          if (p.x < c.minX - 1.3 || p.x > c.maxX + 1.3 || p.z < c.minZ - 1.3 || p.z > c.maxZ + 1.3) continue;
          if (c.maxY > y - 1.0 && c.minY < y + 1.0) y = Math.max(y, c.maxY + 1.0);
        }
      }
      if (y > -0.9) {
        this.warnings.push(`sub ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
        y = -0.9;
      }
      need[i] = y;
      // boat / airship clearance (debug only)
      for (const c of colliders) {
        if (p.x < c.minX - 1.2 || p.x > c.maxX + 1.2 || p.z < c.minZ - 1.2 || p.z > c.maxZ + 1.2) continue;
        if (c.maxY > -0.3 && c.minY < 1.8) this.warnings.push(`boat ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
        if (c.maxY > 30) this.warnings.push(`air ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
      }
    }
    // smooth the depth profile: max filter then box blur (keeps clearance, removes jolts)
    const W = 18;
    const mx = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let m = -Infinity;
      for (let k = -W; k <= W; k++) m = Math.max(m, need[(i + k + N) % N]);
      mx[i] = m;
    }
    this.subY = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -W; k <= W; k++) s += mx[(i + k + N) % N];
      this.subY[i] = s / (2 * W + 1);
    }

    this.dist = 0;
    this.speedIdx = 2;
    this.v = 0;
    this.view = 'boat';
    this.fromY = 1;
    this.fromPitch = VIEWS.boat.pitch;
    this.blend = 1;
    this.curY = 1;
    this.curPitch = VIEWS.boat.pitch;
    this.yaw = null;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.idle = 10;
    this.roll = 0;
    this.pos = new THREE.Vector3();
  }

  sample(d) {
    const L = this.length;
    d = ((d % L) + L) % L;
    const f = d / this.step;
    const i = Math.floor(f) % this.N;
    const j = (i + 1) % this.N;
    const t = f - Math.floor(f);
    return {
      x: this.xs[i] + (this.xs[j] - this.xs[i]) * t,
      z: this.zs[i] + (this.zs[j] - this.zs[i]) * t,
      sub: this.subY[i] + (this.subY[j] - this.subY[i]) * t,
    };
  }

  nearest(x, z) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.N; i++) {
      const dx = this.xs[i] - x;
      const dz = this.zs[i] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best * this.step;
  }

  heightFor(view, s, t) {
    if (view === 'sub') return s.sub + Math.sin(t * 0.4) * 0.15;
    if (view === 'air') return 34 + Math.sin(t * 0.23) * 0.6;
    return waveHeight(s.x, s.z, t) + 1.0;
  }

  // Start the tour from wherever the camera currently is.
  enterFrom(camera) {
    this.dist = this.nearest(camera.position.x, camera.position.z);
    this.fromY = camera.position.y;
    this.fromPitch = 0;
    this.blend = 0;
    this.yaw = null;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.v = 0;
    if (camera.position.y < -0.5) this.view = 'sub';
    else if (camera.position.y > 8) this.view = 'air';
    else this.view = 'boat';
  }

  setView(v) {
    if (v === this.view || !VIEWS[v]) return;
    this.fromY = this.curY;
    this.fromPitch = this.curPitch;
    this.view = v;
    this.blend = 0;
  }

  setSpeed(i) {
    this.speedIdx = THREE.MathUtils.clamp(i, 0, SPEEDS.length - 1);
  }

  get speed() {
    return this.v;
  }

  update(dt, t, input, camera) {
    // speed eases in/out so pausing and changing speed never jolt
    const target = SPEEDS[this.speedIdx] * (this.view === 'air' ? 1.6 : 1);
    this.v += (target - this.v) * Math.min(dt * 0.8, 1);
    this.dist = (this.dist + this.v * dt) % this.length;

    const s = this.sample(this.dist);
    const ahead = this.sample(this.dist + 14);
    const pathYaw = Math.atan2(-(ahead.x - s.x), -(ahead.z - s.z));
    if (this.yaw === null) this.yaw = pathYaw;
    this.yaw += wrapAngle(pathYaw - this.yaw) * Math.min(dt * 1.2, 1);

    // free look; drifts back to the direction of travel when left alone
    const l = input.consumeLook();
    if (l.x || l.y) this.idle = 0;
    else this.idle += dt;
    this.lookYaw = wrapAngle(this.lookYaw - l.x);
    this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - l.y, -1.3, 1.2);
    if (this.idle > 2.5) {
      const k = Math.exp(-dt * 0.9);
      this.lookYaw *= k;
      this.lookPitch *= k;
    }

    // glide between vantage points
    this.blend = Math.min(1, this.blend + dt / 3);
    const e = smoother(this.blend);
    this.curY = THREE.MathUtils.lerp(this.fromY, this.heightFor(this.view, s, t), e);
    this.curPitch = THREE.MathUtils.lerp(this.fromPitch, VIEWS[this.view].pitch, e);

    // boat rocks with the waves, airship banks gently into turns
    let rollT = 0;
    let pitchWob = 0;
    const boatW = this.view === 'boat' ? e : 0;
    if (boatW > 0) {
      waveNormal(s.x, s.z, t, _n);
      const c = Math.cos(this.yaw);
      const sn = Math.sin(this.yaw);
      rollT += (_n.x * c - _n.z * sn) * 0.6 * boatW;
      pitchWob += (-_n.x * sn - _n.z * c) * -0.4 * boatW;
    }
    if (this.view === 'air') rollT += wrapAngle(pathYaw - this.yaw) * -0.25 * e;
    this.roll += (rollT - this.roll) * Math.min(dt * 2, 1);

    this.pos.set(s.x, this.curY, s.z);
    camera.position.copy(this.pos);
    camera.rotation.set(this.curPitch + this.lookPitch + pitchWob, this.yaw + this.lookYaw, this.roll, 'YXZ');
  }
}
