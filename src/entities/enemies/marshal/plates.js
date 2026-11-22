import * as THREE from 'three';
import { wrapAngle } from '../../../core/math.js';
import { createPropArtMaterial } from '../../../render/materials.js';
import { prep, carve, mul } from '../../../world/forest.js';
import { BLOW } from '../../../world/breakTuning.js';

// The suit's plates (ADR-135; COMBAT.md "The Clockwork Marshal"): the fight's own rule. Five plates:
// breast (front), back (the furnace door), left and right (each flank: the pauldron, the tasset and the
// greave of that side as one plate), helm. A blow meets the plate on the side it comes from (the hero's
// bearing off his facing: under pressure.front rad the breast, over pressure.behind the back, else the
// flank on that side); the helm is never met by a cut. A plated blow: the bar takes `soak` of it, the
// plate's structure the raw damage (heavyK more for a heavy blow); off when its structure is spent. Also
// torn off by a deathblow (the helm first, then the most damaged plate left) and struck by a returned
// Fire Lance bolt. What each lost plate changes is TUNING.plates.<name>.lost (marshal.js applies it).
//
// A plate shed flies off on an arc as one of five pooled meshes drawn through the PROP art path (off the
// body it is a background object, ADR-100), lands with a blow on the world and lies there as scenery
// until reset(). No allocation per frame.

export const PLATE_NAMES = Object.freeze(['breast', 'back', 'left', 'right', 'helm']);
const BRONZE = [0.16, 0.2, 0.15];
const EDGE = [0.36, 0.34, 0.24];

/** The shape each plate takes once off the body (world-scale: the suit's 1.75 x). */
function plateGeo(name) {
  const g = (() => {
    switch (name) {
      case 'breast': {
        const s = new THREE.SphereGeometry(0.55, 10, 6, -1.2, 2.4, 0.6, 1.4);
        s.scale(1, 1.1, 0.75);
        return s;
      }
      case 'back': {
        const s = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 10, 1, true, Math.PI - 0.7, 1.4);
        return s;
      }
      case 'helm': {
        const s = new THREE.LatheGeometry([[0.36, -0.2], [0.34, 0], [0.37, 0.04], [0.26, 0.05], [0.24, 0.22], [0.2, 0.38], [0.12, 0.48], [0.02, 0.52]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
        return s;
      }
      default: {
        const s = new THREE.SphereGeometry(0.3, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
        s.scale(1, 0.8, 1.05);
        return s;
      }
    }
  })();
  const p = prep(g);
  carve(p, { col: (x, y, z, nx, ny) => (ny > 0.7 ? mul(EDGE, 1) : BRONZE), ao: 0.9, moss: 0.02, edge: (x, y, z, nx, ny) => (Math.abs(ny) < 0.3 ? 1 : 0) });
  return p;
}

export class Plates {
  constructor(d) {
    this.d = d;
    this.T = d.T.plates;
    /** name → { hp, max, on } */
    this.s = {};
    for (const n of PLATE_NAMES) this.s[n] = { hp: this.T[n].hp, max: this.T[n].hp, on: true };
    this.shedQueue = 0; // the bar empty: every plate left blows off, one each blowGap s
    this._qT = 0;
    this.lostCount = 0;
    this.flying = null; // built on first use (needs the scene / U)
    this._v = new THREE.Vector3();
  }

  reset() {
    for (const n of PLATE_NAMES) {
      const S = this.s[n];
      S.hp = S.max;
      S.on = true;
    }
    this.shedQueue = 0;
    this._qT = 0;
    this.lostCount = 0;
    if (this.flying) for (const f of this.flying) {
      f.mesh.visible = false;
      f.t = -1;
    }
  }

  on(name) {
    return !!this.s[name]?.on;
  }
  off(name) {
    return !!this.s[name] && !this.s[name].on;
  }
  /** Plates still on (the helm included). */
  get left() {
    let n = 0;
    for (const k of PLATE_NAMES) if (this.s[k].on) n++;
    return n;
  }
  /** Plates gone (the helm included). */
  get gone() {
    return PLATE_NAMES.length - this.left;
  }
  /** A plain object of the state (the Lab, the tests). */
  state() {
    const o = {};
    for (const k of PLATE_NAMES) o[k] = { on: this.s[k].on, hp: Math.round(this.s[k].hp), max: this.s[k].max };
    return o;
  }

  /** Which side of him a point is on: 'breast' (front), 'back', 'left' or 'right'. */
  sideOf(x, z) {
    const d = this.d, P = d.T.pressure;
    const a = wrapAngle(Math.atan2(x - d.position.x, z - d.position.z) - d.yaw), b = Math.abs(a);
    if (b < (P?.front ?? 0.9)) return 'breast';
    if (b > (P?.behind ?? 2.2)) return 'back';
    // (+x of his body is his left: a positive bearing is on his left)
    return a > 0 ? 'left' : 'right';
  }

  /** A blow of `raw` damage on `name`'s structure: true if that took it off. */
  strike(name, raw) {
    const S = this.s[name];
    if (!S?.on || !(raw > 0) || name === 'helm') return false;
    S.hp -= raw;
    if (S.hp <= 0) {
      this.shed(name, 'cut');
      return true;
    }
    return false;
  }

  /** The least-sound plate still on (never the helm), or null. `most`: the most damaged (lowest share). */
  weakest() {
    let best = null, k = Infinity;
    for (const n of PLATE_NAMES) {
      const S = this.s[n];
      if (!S.on || n === 'helm') continue;
      const f = S.hp / S.max;
      if (f < k) {
        k = f;
        best = n;
      }
    }
    return best;
  }

  /** Take `name` off now (`how`: 'cut' | 'execute' | 'return' | 'phase' | 'empty' | 'lab'). */
  shed(name, how = 'cut') {
    const S = this.s[name], d = this.d;
    if (!S?.on) return false;
    S.on = false;
    S.hp = 0;
    this.lostCount++;
    d.onPlateLost?.(name, how);
    d.emit('dragon:plate', { plate: name, left: this.left, how });
    this._fly(name);
    return true;
  }

  /** Shed the least-sound plates until `n` are gone (a transition's impact). */
  shedTo(n) {
    let k = 0;
    while (this.gone < n && k++ < 8) {
      const w = this.weakest();
      if (!w) break;
      this.shed(w, 'phase');
    }
  }

  /** The bar is empty: every plate left blows off, one each blowGap s. */
  blowAll() {
    this.shedQueue = this.left;
    this._qT = 0;
  }

  /** Per frame (marshal.js brainFrame): the blow-off queue, the flying plates. */
  update(dt) {
    if (this.shedQueue > 0) {
      this._qT -= dt;
      if (this._qT <= 0) {
        this._qT = this.T.blowGap;
        let n = null;
        for (const k of PLATE_NAMES) if (this.s[k].on) { n = k; break; }
        if (n) this.shed(n, 'empty');
        this.shedQueue = n ? this.shedQueue - 1 : 0;
      }
    }
    if (!this.flying) return;
    const T = this.T.fly, d = this.d;
    for (const f of this.flying) {
      if (f.t < 0 || f.t >= T) continue;
      f.t = Math.min(T, f.t + dt);
      const k = f.t / T;
      const m = f.mesh;
      m.position.set(f.x0 + f.vx * k, f.y0 * (1 - k) + 0.12 * k + 4 * f.h * k * (1 - k), f.z0 + f.vz * k);
      m.rotation.set(f.rx * k * 6, f.ry + k * 3, f.rz * k * 6);
      if (f.t >= T) {
        // landed: it lies there as scenery (no collider), a blow on the world where it fell
        m.position.y = 0.12;
        m.rotation.set(f.rx > 0 ? 2.6 : 0.4, f.ry, f.rz * 0.3);
        d.game.world?.impact?.(m.position.x, m.position.z, 0.9, d.T.world.plate, this._blow ?? (this._blow = { kind: BLOW.BLUNT, by: 'boss' }));
        d.fx?.dust?.(m.position.x, m.position.z, 0.7);
        d.game.shake?.(0.08);
      }
      m.updateMatrix();
    }
  }

  /** Launch plate `name`'s pooled mesh from where it sat on the body. */
  _fly(name) {
    const d = this.d, g = d.game;
    if (!g?.scene) return;
    if (!this.flying) {
      let mat = null;
      try {
        mat = g.U ? createPropArtMaterial(g.U, { fadeNearPlayer: true }) : null;
      } catch (err) {
        console.error('[marshal] plate material failed', err);
      }
      this.flying = PLATE_NAMES.map((n) => {
        const mesh = new THREE.Mesh(plateGeo(n), mat ?? new THREE.MeshBasicMaterial());
        mesh.name = `marshalPlate:${n}`;
        mesh.visible = false;
        mesh.matrixAutoUpdate = false;
        g.scene.add(mesh);
        return { name: n, mesh, t: -1, x0: 0, y0: 0, z0: 0, vx: 0, vz: 0, h: 1.5, rx: 0, ry: 0, rz: 0 };
      });
    }
    const f = this.flying[PLATE_NAMES.indexOf(name)];
    if (!f) return;
    const S = d.drawScale0 ?? 1.75;
    const side = name === 'left' ? 1 : name === 'right' ? -1 : 0;
    const fwd = name === 'breast' ? 1 : name === 'back' ? -1 : 0;
    const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
    // out from the side it sat on (+x of his body is his left), up, and down a few metres off
    const ox = c * side + s * fwd, oz = -s * side + c * fwd;
    const rnd = d.fx?.lr ? () => d.fx.lr() : () => 0.5;
    const dirX = ox || (rnd() - 0.5), dirZ = oz || (rnd() - 0.5), l = Math.hypot(dirX, dirZ) || 1;
    const far = 2.2 + 1.6 * rnd();
    f.x0 = d.position.x + (dirX / l) * 0.4 * S;
    f.z0 = d.position.z + (dirZ / l) * 0.4 * S;
    f.y0 = (name === 'helm' ? 1.65 : name === 'left' || name === 'right' ? 1.35 : 1.2) * S;
    f.vx = (dirX / l) * far;
    f.vz = (dirZ / l) * far;
    f.h = 1.2 + rnd();
    f.rx = rnd() - 0.5;
    f.ry = d.yaw;
    f.rz = rnd() - 0.5;
    f.t = 0;
    f.mesh.visible = true;
    f.mesh.position.set(f.x0, f.y0, f.z0);
    f.mesh.updateMatrix();
    // the shed: sparks and grit, a hit-stop
    d.fx?.plateBurst?.(f.x0, f.y0, f.z0, dirX / l, dirZ / l);
    d.hitstop?.(0.08, 0.05);
    g.shake?.(0.25);
  }
}
