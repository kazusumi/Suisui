// Floaty swimming: glide on the surface, dive with Shift (or by swimming while looking down).
import * as THREE from 'three';
import { waveHeight } from './waves.js';
import { terrainHeight } from './world/terrain.js';

const EYE = 0.2;
const RADIUS = 0.55;
const BOUNDS = { x0: -140, x1: 140, z0: -325, z1: 175 };

export class Player {
  constructor(camera, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.pos = new THREE.Vector3(0, EYE, 128);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.02;
    this.roll = 0;
    this.stroke = 0;
    this.surfaceH = 0;
    this.speed = 0;
    this.atSurface = true;
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  update(dt, t, input) {
    const look = input.consumeLook();
    this.yaw -= look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y, -1.45, 1.35);

    const sh = waveHeight(this.pos.x, this.pos.z, t);
    this.surfaceH = sh;
    const depth = sh - this.pos.y;
    const nearSurface = depth < 0.45;

    // desired velocity
    const cp = Math.cos(this.pitch);
    const fwd = this._f.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const right = this._r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const under = depth > 0.25;
    const surfaceSwim = nearSurface && input.vert >= 0 && this.pitch > -0.45;
    if (surfaceSwim) {
      fwd.y = 0;
      fwd.normalize();
    }
    const spd = under ? 4.6 : 5.2;
    const target = this._t.set(0, 0, 0).addScaledVector(fwd, input.move.y * spd).addScaledVector(right, input.move.x * spd * 0.75);
    target.y += input.vert * 3.4;

    const k = 1 - Math.exp(-dt * (input.move.y || input.move.x || input.vert ? 2.2 : 1.1));
    this.vel.x += (target.x - this.vel.x) * k;
    this.vel.z += (target.z - this.vel.z) * k;
    if (input.vert !== 0 || !surfaceSwim) this.vel.y += (target.y - this.vel.y) * k;

    // buoyancy: float back to the surface when close to it and idle
    if (input.vert <= 0 && surfaceSwim) {
      const goal = sh + EYE;
      this.vel.y += ((goal - this.pos.y) * 9 - this.vel.y * 4) * dt;
    } else if (under && input.vert === 0 && input.move.y === 0 && depth < 2.5) {
      this.vel.y += 0.6 * dt;
    }

    this.pos.addScaledVector(this.vel, dt);

    // can't leave the water (keep the head just above the waves)
    const maxY = sh + EYE + 0.15;
    if (this.pos.y > maxY) {
      this.pos.y = maxY;
      if (this.vel.y > 0) this.vel.y *= 0.3;
    }
    // sea floor
    const floor = terrainHeight(this.pos.x, this.pos.z) + 0.7;
    if (this.pos.y < floor) {
      this.pos.y = floor;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    this.collide();
    // soft world bounds
    const p = this.pos;
    if (p.x < BOUNDS.x0) this.vel.x += (BOUNDS.x0 - p.x) * dt * 4;
    if (p.x > BOUNDS.x1) this.vel.x += (BOUNDS.x1 - p.x) * dt * 4;
    if (p.z < BOUNDS.z0) this.vel.z += (BOUNDS.z0 - p.z) * dt * 4;
    if (p.z > BOUNDS.z1) this.vel.z += (BOUNDS.z1 - p.z) * dt * 4;
    p.x = THREE.MathUtils.clamp(p.x, BOUNDS.x0 - 12, BOUNDS.x1 + 12);
    p.z = THREE.MathUtils.clamp(p.z, BOUNDS.z0 - 12, BOUNDS.z1 + 12);

    this.speed = Math.hypot(this.vel.x, this.vel.z, this.vel.y);
    this.atSurface = nearSurface;

    // camera: swim bob + roll into turns
    this.stroke += dt * (1.2 + this.speed * 0.5);
    const bobAmt = Math.min(this.speed / 5, 1);
    const bob = Math.sin(this.stroke * 2.2) * 0.04 * bobAmt;
    const lateral = this.vel.dot(right);
    this.roll += (-lateral * 0.025 + Math.sin(t * 0.7) * (nearSurface ? 0.015 : 0.006) - this.roll) * Math.min(dt * 3, 1);
    this.camera.position.set(p.x, p.y + bob, p.z);
    this.camera.rotation.set(this.pitch + Math.sin(this.stroke * 1.1) * 0.006 * bobAmt, this.yaw, this.roll, 'YXZ');
  }

  collide() {
    const p = this.pos;
    for (const c of this.colliders) {
      if (p.y < c.minY - RADIUS || p.y > c.maxY + RADIUS) continue;
      if (p.x < c.minX - RADIUS || p.x > c.maxX + RADIUS || p.z < c.minZ - RADIUS || p.z > c.maxZ + RADIUS) continue;
      const pl = p.x - (c.minX - RADIUS);
      const pr = c.maxX + RADIUS - p.x;
      const pb = p.z - (c.minZ - RADIUS);
      const pf = c.maxZ + RADIUS - p.z;
      const pt = c.maxY + RADIUS - p.y;
      const m = Math.min(pl, pr, pb, pf, pt);
      if (m === pt) {
        p.y = c.maxY + RADIUS;
        if (this.vel.y < 0) this.vel.y = 0;
      } else if (m === pl) {
        p.x = c.minX - RADIUS;
        this.vel.x = Math.min(this.vel.x, 0);
      } else if (m === pr) {
        p.x = c.maxX + RADIUS;
        this.vel.x = Math.max(this.vel.x, 0);
      } else if (m === pb) {
        p.z = c.minZ - RADIUS;
        this.vel.z = Math.min(this.vel.z, 0);
      } else {
        p.z = c.maxZ + RADIUS;
        this.vel.z = Math.max(this.vel.z, 0);
      }
    }
  }
}
