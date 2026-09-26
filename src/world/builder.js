// Accumulates transformed boxes/quads into one merged BufferGeometry with the
// attributes the facade shader needs (aStyle, aFacade) plus vertex colours.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export const KIND = { PLAIN: 0, HOUSE: 1, OFFICE: 2, SHOP: 3, STRIPE: 4, VENDING: 5, CAR: 6, SHUTTER: 7, STOREFRONT: 8 };

export function mat4(x, y, z, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(1, 1, 1);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export class Builder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.sty = [];
    this.fac = [];
    this.idx = [];
    this.count = 0;
  }

  // Corners in local space, CCW seen from the outside. fu/fv = facade coords per corner.
  quad(m, corners, nLocal, color, style, fcoords) {
    _nm.getNormalMatrix(m);
    _n.copy(nLocal).applyMatrix3(_nm).normalize();
    const base = this.count;
    for (let i = 0; i < 4; i++) {
      _v.copy(corners[i]).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      this.nrm.push(_n.x, _n.y, _n.z);
      this.col.push(color.r, color.g, color.b);
      this.sty.push(style[0], style[1], style[2], style[3]);
      this.fac.push(fcoords[i * 2], fcoords[i * 2 + 1]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }

  // Box whose local origin is the centre of its bottom face.
  // opts: side / front / top styles ([kind, seed, lit]), bottom: bool, frontColor, topColor
  box(m, w, h, d, color, opts = {}) {
    const hw = w / 2;
    const hd = d / 2;
    const side = opts.side || [0, 0, 0];
    const front = opts.front || side;
    const top = opts.top || [0, side[1], 0];
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const st = (s, width) => [s[0], s[1], s[2], width];
    const fc = opts.frontColor || color;
    const tc = opts.topColor || color;
    // +z (front)
    this.quad(m, [V(-hw, 0, hd), V(hw, 0, hd), V(hw, h, hd), V(-hw, h, hd)], V(0, 0, 1), fc, st(front, w), [0, 0, w, 0, w, h, 0, h]);
    // -z
    this.quad(m, [V(hw, 0, -hd), V(-hw, 0, -hd), V(-hw, h, -hd), V(hw, h, -hd)], V(0, 0, -1), color, st(side, w), [0, 0, w, 0, w, h, 0, h]);
    // +x
    this.quad(m, [V(hw, 0, hd), V(hw, 0, -hd), V(hw, h, -hd), V(hw, h, hd)], V(1, 0, 0), color, st(side, d), [0, 0, d, 0, d, h, 0, h]);
    // -x
    this.quad(m, [V(-hw, 0, -hd), V(-hw, 0, hd), V(-hw, h, hd), V(-hw, h, -hd)], V(-1, 0, 0), color, st(side, d), [0, 0, d, 0, d, h, 0, h]);
    if (opts.top !== false) {
      this.quad(m, [V(-hw, h, hd), V(hw, h, hd), V(hw, h, -hd), V(-hw, h, -hd)], V(0, 1, 0), tc, st(top, w), [0, 0, w, 0, w, d, 0, d]);
    }
    if (opts.bottom) {
      this.quad(m, [V(-hw, 0, -hd), V(hw, 0, -hd), V(hw, 0, hd), V(-hw, 0, hd)], V(0, -1, 0), color, st([0, 0, 0], w), [0, 0, w, 0, w, d, 0, d]);
    }
  }

  // Gable roof: ridge along local x. Base at y=0, width w (x), depth d (z), rise h.
  gable(m, w, d, h, color) {
    const hw = w / 2;
    const hd = d / 2;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const s = [0, 0, 0, w];
    const slope = Math.hypot(hd, h);
    const n1 = V(0, hd, h).normalize();
    const n2 = V(0, hd, -h).normalize();
    this.quad(m, [V(-hw, 0, hd), V(hw, 0, hd), V(hw, h, 0), V(-hw, h, 0)], n1, color, s, [0, 0, w, 0, w, slope, 0, slope]);
    this.quad(m, [V(hw, 0, -hd), V(-hw, 0, -hd), V(-hw, h, 0), V(hw, h, 0)], n2, color, s, [0, 0, w, 0, w, slope, 0, slope]);
    // gable ends (triangles as degenerate quads)
    this.quad(m, [V(hw, 0, hd), V(hw, 0, -hd), V(hw, h, 0), V(hw, h, 0)], V(1, 0, 0), color, s, [0, 0, d, 0, hd, h, hd, h]);
    this.quad(m, [V(-hw, 0, -hd), V(-hw, 0, hd), V(-hw, h, 0), V(-hw, h, 0)], V(-1, 0, 0), color, s, [0, 0, d, 0, hd, h, hd, h]);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aStyle', new THREE.Float32BufferAttribute(this.sty, 4));
    g.setAttribute('aFacade', new THREE.Float32BufferAttribute(this.fac, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
