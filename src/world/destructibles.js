import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAsciiObjectMaterial, createPropArtMaterial } from '../render/materials.js';
import { markCaster } from '../render/pipeline.js';
import { batchRigid } from '../render/rigidBatch.js';
import { TELL } from '../combat/rules.js';
import { BREAK, BLOW } from './breakTuning.js';

// Breakable objects (ADR-107): the trees, stones, pillars and props of a set that blows can chip,
// break, fell, burn, lift and throw. A set lists them in its output (`breakables`, built with
// world/breakableKit.js) instead of merging them into its static meshes; this module gives each its
// own node, draws them all through two rigid batches (render/rigidBatch.js: one draw call per
// material however many there are, each piece free to move or vanish) and owns their state.
//
// A definition (a set's `breakables` entry):
//   kind      'tree' | 'deadTree' | 'stone' | 'boulder' | 'pillar' | 'lantern' | ... (free; AI and tests read it)
//   mat       'wood' | 'stone' | 'metal' | 'bone' (BREAK.mats: structure, what bites, the debris)
//   look      'grid' (paint() attributes: the screen grid, trees) | 'prop' (carve() attributes: prop art)
//   x, z      its base (world);  r  footprint radius;  h  height
//   geos      its geometries in WORLD space (as the builders return them; they are moved to the base)
//   colliders the Colliders circles it stands on (taken out when it goes, put back on reset)
//   broken    { geos, look?, r? } | null: what is left standing (a stump, a jagged base); r = its collider
//   hp        structure in POWER units (default: the material's × its size); Infinity = it only chips
//   topples   it falls over when it breaks (default: h >= BREAK.topple.minH)
//   burns     fire lights it (default: the material's)
//   cover     it stops projectiles (default: h >= BREAK.cover.minH)
//   lift      0 nobody can lift it · 1 a boss's body can (the wyrm's jaws) · 2 only the Void
//   leafy     0..1 share of its debris that is leaves (a canopy)
//
// The API (world.destructibles; every caller guards it with `?.`: the tests' world mocks lack it):
//   strike(x, z, r, power, o)             a blow / blast over a disc → how many it struck
//   sweep(ax, az, bx, bz, r, power, o)    ... along a segment (a blade's edge, a dash, a wall of force)
//   stop(ax, az, bx, bz, r, power, o)     a projectile's step: the first cover it meets takes `power`
//                                          and is returned (the caller ends its projectile), else null
//   coverAt(ax, az, bx, bz, r)            the first cover on a segment, no damage (`coverT`: where, 0..1)
//   ignite(x, z, r, k)                    fire lands: wood in the disc catches
//   nearest(x, z, o)                      the nearest intact piece ({ maxDist, minDist, lift, kind, mat })
//   take(obj) / carry(obj, x, y, z, tilt, yaw) / throwTo(obj, tx, tz, o) / drop(obj)   lift and throw
//   topple(obj, dx, dz, by)               fell it that way
//   reset()                               everything stands again
//   o = { kind: BLOW.*, by: 'player' | 'boss' | 'world', dx, dz (the blow's way), y (its height), src (one id per swing),
//         only: 'wood' | ... (strike / sweep: just that material) }
// Events: 'world:impact' { kind: 'chip' | 'break' | 'topple' | 'crash' | 'burn' | 'burnout' | 'throw', mat, x, y, z, power, by }
// (one reused payload: a subscriber must not keep it), and 'combat:tell' / 'combat:flash' for a
// piece a boss felled (source 'world', red: be out from under it).
// No per-frame allocation: scratch vectors, reused hit and event records.

export const STATE = Object.freeze({ INTACT: 0, FALLING: 1, BROKEN: 2, HELD: 3, FLYING: 4, GONE: 5 });
const { INTACT, FALLING, BROKEN, HELD, FLYING, GONE } = STATE;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const NONE = Object.freeze({});
const LEAVES = 'o0O8@&';
const DIGITS = '0123456789';
const FLASH_LEAD = 0.3;
const SIDES = [-1, 1];

// cosmetic noise from this module's own stream (the seeded sims replay Math.random)
let seed = 0x3d9e42b1;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

/** Distance from (px, pz) to the segment a → b; writes where along it (0..1) into `out.t`. */
function segDist(px, pz, ax, az, bx, bz, out) {
  const abx = bx - ax, abz = bz - az;
  const l2 = abx * abx + abz * abz;
  const t = l2 > 1e-9 ? clamp(((px - ax) * abx + (pz - az) * abz) / l2, 0, 1) : 0;
  out.t = t;
  return Math.hypot(ax + abx * t - px, az + abz * t - pz);
}

export class Destructibles {
  constructor(game, world, set) {
    this.game = game;
    this.world = world;
    this._blob = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size: 1, sizeEnd: 0.35, heat: 0.5, heatEnd: 0, drag: 1.0, gravity: 0, kind: 'fire' }; // the fire field's reused record
    /** every breakable of the set, by id */
    this.list = [];
    /** those with something going on (falling, flying, burning, shuddering) */
    this.active = [];
    this.root = new THREE.Group();
    this.root.name = 'breakables';
    this.batch = null;
    /** where along the segment the last coverAt / stop found its cover (0..1) */
    this.coverT = 1;
    this._src = 1;
    this._seg = { t: 0 };
    this._axis = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._ev = { kind: '', mat: '', x: 0, y: 0, z: 0, power: 0, by: '', id: -1 };
    this._tell = { source: 'world', attack: 'fallingDebris', tell: TELL.RED, impactIn: 0, x: 0, z: 0, hazard: true };
    this._flash = { source: 'world', attack: 'fallingDebris', tell: TELL.RED, x: 0, y: 0.6, z: 0, hazard: true };
    this._heroHit = {
      damage: 0, from: { x: 0, z: 0 }, knockback: 0, knockdown: true, kind: 'crush', tell: TELL.RED,
      parryable: false, blockable: false, attack: 'fallingDebris', attacker: null, plunge: false, perfect: false,
    };
    this._bossHit = { damage: 0, exact: true, heavy: true, posture: 0, point: { x: 0, y: 1, z: 0 }, dir: { x: 0, z: 1 }, part: 'body', world: true };

    const defs = Array.isArray(set?.breakables) ? set.breakables : [];
    if (!defs.length) return;
    const U = game.U;
    this.gridMat = createAsciiObjectMaterial(U, { fadeNearPlayer: true, side: THREE.DoubleSide, rigid: true });
    this.propMat = createPropArtMaterial(U, { fadeNearPlayer: true, gain: set.stoneMaterial?.uniforms?.uGain?.value ?? 1, rigid: true });
    for (const def of defs) this._build(def);
    markCaster(this.root);
    set.group?.add(this.root);
    this.batch = batchRigid(U, this.root);
  }

  // ------------------------------------------------------------------ build
  _mesh(geos, look, x, z) {
    for (const g of geos) g.translate(-x, 0, -z);
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos);
    if (!geo) return null;
    const m = new THREE.Mesh(geo, look === 'prop' ? this.propMat : this.gridMat);
    m.matrixAutoUpdate = false;
    return m;
  }

  _build(def) {
    const x = Number(def?.x), z = Number(def?.z);
    if (!Number.isFinite(x + z) || !def.geos?.length) return null;
    const M = BREAK.mats[def.mat] ?? BREAK.mats.stone;
    const r = Math.max(0.1, Number(def.r) || 0.5), h = Math.max(0.2, Number(def.h) || 2);
    const size = clamp(r / 0.5, 0.6, 2.4) * clamp(h / 3, 0.5, 2);
    const hpMax = def.hp ?? M.hp * size;
    const body = this._mesh(def.geos, def.look, x, z);
    if (!body) return null;
    const node = new THREE.Group();
    node.position.set(x, 0, z);
    const pivot = new THREE.Group();
    pivot.add(body);
    node.add(pivot);
    let stub = null;
    if (def.broken?.geos?.length) {
      stub = this._mesh(def.broken.geos, def.broken.look ?? def.look, x, z);
      if (stub) {
        stub.visible = false;
        node.add(stub);
      }
    }
    this.root.add(node);
    const o = {
      id: this.list.length, def, kind: def.kind ?? 'thing', mat: BREAK.mats[def.mat] ? def.mat : 'stone', M,
      x, z, r, h, weight: def.weight ?? clamp(size, 0.5, 2.2),
      hp: hpMax, hpMax, state: INTACT,
      node, pivot, body, stub,
      colliders: Array.isArray(def.colliders) ? def.colliders : [],
      stubR: Number(def.broken?.r) || 0, stubCollider: null,
      burns: def.burns ?? !!M.burns,
      topples: def.topples ?? h >= BREAK.topple.minH,
      cover: def.cover ?? h >= BREAK.cover.minH,
      lift: def.lift ?? 0,
      leafy: clamp(Number(def.leafy) || 0, 0, 1),
      // dynamics
      t: 0, T: 1, dx: 0, dz: 1, by: 'world', src: -1, srcT: -1e9,
      burn: 0, burnLife: 0, burnt: false, flame: 0, heatT: 0, light: null,
      shake: 0, shakeAmp: 0, mark: 0,
      told: false, flashed: false,
      // thrown
      px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, ang: 0, tilt: 0, tx: 0, tz: 0, blast: 0, blastR: 0, onLand: null,
      on: false,
    };
    this.list.push(o);
    return o;
  }

  // ------------------------------------------------------------------ queries
  /** Intact pieces. */
  get standing() {
    let n = 0;
    for (const o of this.list) if (o.state === INTACT) n++;
    return n;
  }

  /**
   * The nearest intact piece to (x, z), or null. `o`: maxDist, minDist (from the point), lift (at most
   * this lift class: 1 = what a body can carry, 2 = also what only the Void can), kind, mat,
   * from: { x, z, min } (at least `min` from that point: not the one the hero stands against).
   */
  nearest(x, z, o = NONE) {
    let best = null, bd = o.maxDist ?? Infinity;
    for (const b of this.list) {
      if (b.state !== INTACT || b.hpMax === Infinity) continue;
      if (o.lift !== undefined && !(b.lift > 0 && b.lift <= o.lift)) continue;
      if (o.kind !== undefined && b.kind !== o.kind) continue;
      if (o.mat !== undefined && b.mat !== o.mat) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d >= bd || d < (o.minDist ?? 0)) continue;
      if (o.from && Math.hypot(b.x - o.from.x, b.z - o.from.z) < (o.from.min ?? 0)) continue;
      best = b;
      bd = d;
    }
    return best;
  }

  /** The first cover the segment a → b (widened by r) meets, or null; `coverT` = where along it. */
  coverAt(ax, az, bx, bz, r = 0) {
    let best = null, bt = 2;
    if (!Number.isFinite(ax + az + bx + bz)) return null;
    const s = this._seg;
    for (const b of this.list) {
      if (b.state !== INTACT || !b.cover) continue;
      if (segDist(b.x, b.z, ax, az, bx, bz, s) > b.r + r) continue;
      if (s.t < bt) {
        bt = s.t;
        best = b;
      }
    }
    this.coverT = best ? bt : 1;
    return best;
  }

  // ------------------------------------------------------------------ blows
  /** A blow or blast over the disc (x, z, r): every intact piece it touches takes `power`. */
  strike(x, z, r, power, o = NONE) {
    if (!Number.isFinite(x + z + r + power) || !(power > 0)) return 0;
    let n = 0;
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (b.state !== INTACT || (o.only !== undefined && b.mat !== o.only)) continue;
      const ox = b.x - x, oz = b.z - z;
      const d = Math.hypot(ox, oz);
      if (d > r + b.r) continue;
      if (o.y !== undefined && o.y - r > b.h) continue; // it passed over
      // the blow's way: as given, else out from its centre
      let dx = o.dx, dz = o.dz;
      if (!Number.isFinite(dx + dz) || dx * dx + dz * dz < 1e-6) {
        dx = d > 1e-3 ? ox / d : rnd() - 0.5;
        dz = d > 1e-3 ? oz / d : rnd() - 0.5;
      }
      const k = d > 1e-3 ? Math.min(1, b.r / d) : 0;
      if (this._hit(b, power, o, b.x - ox * k, clamp(o.y ?? 1, 0.2, b.h), b.z - oz * k, dx, dz)) n++;
    }
    return n;
  }

  /** A blow along the segment a → b (a blade's edge, a dash, a wall of force), r wide. */
  sweep(ax, az, bx, bz, r, power, o = NONE) {
    if (!Number.isFinite(ax + az + bx + bz + r + power) || !(power > 0)) return 0;
    let n = 0;
    const L = this.list, s = this._seg;
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (b.state !== INTACT || (o.only !== undefined && b.mat !== o.only)) continue;
      if (segDist(b.x, b.z, ax, az, bx, bz, s) > r + b.r) continue;
      if (o.y !== undefined && o.y - r > b.h) continue;
      let dx = o.dx, dz = o.dz;
      if (!Number.isFinite(dx + dz) || dx * dx + dz * dz < 1e-6) {
        dx = bx - ax;
        dz = bz - az;
      }
      const cx = ax + (bx - ax) * s.t, cz = az + (bz - az) * s.t;
      if (this._hit(b, power, o, cx, clamp(o.y ?? 1, 0.2, b.h), cz, dx, dz)) n++;
    }
    return n;
  }

  /** A projectile's step a → b: the first cover in its way takes `power` and is returned; else null. */
  stop(ax, az, bx, bz, r, power, o = NONE) {
    const b = this.coverAt(ax, az, bx, bz, r);
    if (!b) return null;
    const t = this.coverT;
    this._hit(b, power, o, ax + (bx - ax) * t, clamp(o.y ?? 1, 0.2, b.h), az + (bz - az) * t, bx - ax, bz - az);
    return b;
  }

  /** A fresh id for one swing / one blast: a piece takes at most one blow per id. */
  swing() {
    return (this._src = (this._src % 1e9) + 1);
  }

  _emit(kind, b, x, y, z, power, by) {
    const e = this._ev;
    e.kind = kind; e.mat = b.mat; e.x = x; e.y = y; e.z = z; e.power = power; e.by = by; e.id = b.id;
    this.game.events?.emit?.('world:impact', e);
  }

  _hit(b, power, o, px, py, pz, dx, dz) {
    const now = this.game.time ?? 0;
    const src = o.src ?? -1;
    if (src >= 0 ? b.src === src : now - b.srcT < BREAK.rehit) return false;
    b.src = src;
    b.srcT = now;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const kind = o.kind ?? BLOW.BLUNT, by = o.by ?? 'world';
    const dmg = power * (b.M.take[kind] ?? 1);
    this._chips(b, px, py, pz, dx, dz, power);
    if (dmg < BREAK.scratch || b.hpMax === Infinity || (b.hp -= dmg) > 0) {
      // it holds: a nick, a shudder
      this.world.scars?.object(b.id, px, py, pz, power, b.M);
      b.shake = 0.28;
      b.shakeAmp = Math.min(0.09, 0.02 + power * 0.05) / Math.max(0.6, b.weight);
      b.dx = dx;
      b.dz = dz;
      this._wake(b);
      this._emit('chip', b, px, py, pz, power, by);
      return true;
    }
    this._break(b, dx, dz, by, kind);
    return true;
  }

  /** Fell a piece along (dx, dz) (a boss pulls a pillar down; a test). */
  topple(b, dx, dz, by = 'world') {
    if (!b || b.state !== INTACT) return false;
    this._break(b, dx, dz, by, BLOW.BLUNT, true);
    return true;
  }

  _break(b, dx, dz, by, kind, force = false) {
    this._free(b);
    this._stopBurn(b);
    b.hp = 0;
    b.by = by;
    b.shake = 0;
    b.pivot.rotation.set(0, 0, 0);
    if (b.stub) {
      b.stub.visible = true;
      if (b.stubR > 0 && !b.stubCollider) b.stubCollider = this.world.colliders?.add?.(b.x, b.z, b.stubR, b.mat === 'wood' ? 'trunk' : 'stone') ?? null;
      else if (b.stubCollider) this.world.colliders?.restore?.(b.stubCollider);
    }
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) {
      const a = rnd() * 6.283;
      dx = Math.cos(a);
      dz = Math.sin(a);
    } else {
      dx /= l;
      dz /= l;
    }
    b.dx = dx;
    b.dz = dz;
    if ((b.topples || force) && kind !== BLOW.FIRE) {
      b.state = FALLING;
      b.t = 0;
      b.T = clamp(BREAK.topple.time * Math.sqrt(b.h / 5), 0.55, 1.5);
      b.told = b.flashed = false;
      b.mark = 0;
      this._wake(b);
      this._burst(b, b.x, 0.4, b.z, dx, dz, 10, 0.4);
      this._emit('topple', b, b.x, 0.5, b.z, b.weight, by);
    } else {
      this._crumble(b, dx, dz, false);
      b.state = BROKEN;
      this.world.scars?.rubble(b.x, b.z, b.r * 1.8 + 0.4, b.M, 6 + Math.round(b.weight * 6), b.def.look === 'prop' ? DIGITS : '.,:o');
      this.game.shake?.(clamp(0.12 + 0.12 * b.weight, 0.1, 0.4));
      this._emit('break', b, b.x, b.h * 0.5, b.z, b.weight, by);
    }
  }

  /** Its colliders and nicks go. */
  _free(b) {
    const C = this.world.colliders;
    for (const c of b.colliders) C?.remove?.(c);
    this.world.scars?.drop(b.id);
  }

  _wake(b) {
    if (b.on) return;
    b.on = true;
    this.active.push(b);
  }

  // ------------------------------------------------------------------ fire
  /** Fire lands on the disc (x, z, r): wood standing in it catches (k scales how long it burns). */
  ignite(x, z, r, k = 1) {
    if (!Number.isFinite(x + z + r) || !(k > 0)) return 0;
    let n = 0;
    for (const b of this.list) {
      if (b.state !== INTACT || !b.burns || b.burn > 0 || b.burnt) continue;
      if (Math.hypot(b.x - x, b.z - z) > r + b.r) continue;
      b.burn = b.burnLife = BREAK.burn.time * k * (0.85 + 0.3 * rnd());
      b.flame = 0;
      b.heatT = 0;
      b.light = this.game.lights?.add?.({ x: b.x, y: Math.min(3, b.h * 0.5), z: b.z, color: [1.0, 0.4, 0.1], intensity: 2.6, radius: 9 + b.h, life: b.burn + 0.6, fade: 1.2, flicker: 0.55 }) ?? null;
      this._wake(b);
      this._emit('burn', b, b.x, b.h * 0.5, b.z, k, 'world');
      n++;
    }
    return n;
  }

  _stopBurn(b) {
    if (b.burn > 0) {
      b.burn = 0;
      b.light?.kill?.();
      b.light = null;
    }
  }

  _burnStep(b, dt) {
    b.burn -= dt;
    const u = 1 - b.burn / b.burnLife; // 0 → 1 as it burns down
    // flames up the trunk and through the crown: heat in the fire field (render/fireField.js)
    const fx = this.game.fx?.fire;
    if (fx) {
      b.flame += dt * (22 + b.h * 13) * (1 - 0.4 * u);
      const wide = b.leafy > 0 ? b.r * 3.2 : b.r * 1.2;
      while (b.flame >= 1) {
        b.flame -= 1;
        const hy = rnd(), a = rnd() * 6.283;
        const rr = (hy > 0.45 ? wide : b.r) * Math.sqrt(rnd());
        const hot = rnd();
        const q = this._blob;
        q.x = b.x + Math.cos(a) * rr;
        q.y = Math.max(0.7, 0.2 + hy * b.h * (1 - 0.35 * u));
        q.z = b.z + Math.sin(a) * rr;
        q.vx = (rnd() - 0.5) * 0.6;
        q.vy = 1.6 + rnd() * 2.2;
        q.vz = (rnd() - 0.5) * 0.6;
        q.life = 0.4 + rnd() * 0.5;
        q.size = 1.1 + hot * 0.8;
        q.heat = 0.48 + hot * 0.16;
        fx.spawn(q);
      }
    }
    // the ground round it glows and chars; the ring round it burns the hero
    b.heatT -= dt;
    if (b.heatT <= 0) {
      b.heatT = 0.3;
      this.world.scorch?.burnCircle?.(b.x, b.z, b.r + BREAK.burn.pad, 0.05, 0.6);
    }
    this.world.fire?.touch?.(b.x, b.z, b.r + BREAK.burn.pad);
    if (b.burn <= 0) {
      // burned through: what is left of it comes down as embers and ash
      b.burn = 0;
      b.burnt = true;
      b.light = null; // (it fades out on its own)
      this._free(b);
      if (b.stub) {
        b.stub.visible = true;
        if (b.stubR > 0 && !b.stubCollider) b.stubCollider = this.world.colliders?.add?.(b.x, b.z, b.stubR, 'trunk') ?? null;
        else if (b.stubCollider) this.world.colliders?.restore?.(b.stubCollider);
      }
      this._crumble(b, 0, 0, false, true);
      b.state = BROKEN;
      b.hp = 0;
      this._emit('burnout', b, b.x, b.h * 0.4, b.z, b.weight, 'world');
    }
  }

  // ------------------------------------------------------------------ lifting and throwing
  /** A boss lifts a piece: it leaves the ground (no collider, no nicks). The caller moves it with carry(). */
  take(b) {
    if (!b || b.state !== INTACT || !(b.lift > 0)) return false;
    this._free(b);
    this._stopBurn(b);
    b.state = HELD;
    b.shake = 0;
    b.px = b.x;
    b.py = 0;
    b.pz = b.z;
    b.pivot.rotation.set(0, 0, 0);
    this._burst(b, b.x, 0.3, b.z, 0, 0, 12, 0.5); // torn out of the ground
    this.world.scars?.ground(b.x, b.z, 0.6 + 0.3 * b.weight);
    this._wake(b);
    this._emit('throw', b, b.x, 0.5, b.z, 0, 'boss');
    return true;
  }

  /** Where a held piece is this frame: its base at (x, y, z), leaning `tilt` rad toward heading `yaw`. */
  carry(b, x, y, z, tilt = 0, yaw = 0) {
    if (!b || b.state !== HELD || !Number.isFinite(x + y + z + tilt + yaw)) return;
    b.px = x;
    b.py = y;
    b.pz = z;
    b.pivot.position.set(x - b.x, y, z - b.z);
    b.pivot.quaternion.setFromAxisAngle(this._axis.set(Math.cos(yaw), 0, -Math.sin(yaw)), tilt);
  }

  /**
   * Throw a held piece at (tx, tz): it flies there in `time` s (default by distance), turning end over
   * end, and bursts where it lands: a blast of `power` over `radius` on the other pieces, a scar, and
   * `onLand(b, x, z, radius)` for the thrower's own blow at the hero (the move's tell is the thrower's).
   */
  throwTo(b, tx, tz, o = NONE) {
    if (!b || b.state !== HELD || !Number.isFinite(tx + tz)) return false;
    const dist = Math.hypot(tx - b.px, tz - b.pz);
    const T = clamp(o.time ?? 0.45 + dist / 26, 0.25, 3);
    const g = BREAK.thrown.gravity;
    b.state = FLYING;
    b.t = 0;
    b.T = T;
    b.tx = tx;
    b.tz = tz;
    b.vx = (tx - b.px) / T;
    b.vz = (tz - b.pz) / T;
    b.vy = (0 - b.py + 0.5 * g * T * T) / T;
    b.ang = 0;
    const l = dist > 1e-3 ? dist : 1;
    b.dx = (tx - b.px) / l;
    b.dz = (tz - b.pz) / l;
    b.blast = o.power ?? BREAK.thrown.blast * b.weight;
    b.blastR = o.radius ?? Math.max(1.6, b.h * 0.4);
    b.by = o.by ?? 'boss';
    b.onLand = typeof o.onLand === 'function' ? o.onLand : null;
    return true;
  }

  /** Let a held piece go: it falls where it is and bursts. */
  drop(b) {
    if (!b || b.state !== HELD) return false;
    return this.throwTo(b, b.px, b.pz, { time: Math.max(0.25, Math.sqrt((2 * Math.max(0, b.py)) / BREAK.thrown.gravity)), power: 0.3 });
  }

  _fly(b, dt) {
    b.t += dt;
    const g = BREAK.thrown.gravity;
    b.px += b.vx * dt;
    b.pz += b.vz * dt;
    b.vy -= g * dt;
    b.py += b.vy * dt;
    b.ang += BREAK.thrown.spin * dt;
    b.pivot.position.set(b.px - b.x, Math.max(0, b.py), b.pz - b.z);
    b.pivot.quaternion.setFromAxisAngle(this._axis.set(b.dz, 0, -b.dx), b.ang);
    if (b.t < b.T && b.py > -0.2) return;
    // it lands
    const x = b.tx, z = b.tz;
    b.pivot.position.set(x - b.x, 0, z - b.z);
    this._crumble(b, b.dx, b.dz, false);
    b.state = GONE;
    this.world.scars?.ground(x, z, 0.7 + 0.5 * b.weight, b.dx, b.dz);
    this.world.scars?.rubble(x, z, b.blastR, b.M, 8 + Math.round(b.weight * 6), b.def.look === 'prop' ? DIGITS : '.,:o');
    this.world.gust?.(x, z, 1.2, b.blastR + 4);
    this.game.shake?.(clamp(BREAK.thrown.shake * b.weight, 0.15, 0.6));
    this.strike(x, z, b.blastR, b.blast, { kind: BLOW.BLAST, by: b.by, src: this.swing() });
    this._emit('crash', b, x, 0.4, z, b.blast, b.by);
    const cb = b.onLand;
    b.onLand = null;
    if (cb) {
      try {
        cb(b, x, z, b.blastR);
      } catch (err) {
        console.error('[destructibles] onLand failed', err);
      }
    }
  }

  // ------------------------------------------------------------------ falling over
  _fall(b, dt) {
    b.t += dt;
    const u = Math.min(1, b.t / b.T);
    b.pivot.quaternion.setFromAxisAngle(this._axis.set(b.dz, 0, -b.dx), (Math.PI / 2 - 0.06) * Math.pow(u, 2.4));
    const mx = b.x + b.dx * b.h * 0.55, mz = b.z + b.dz * b.h * 0.55;
    if (b.by !== 'player') {
      // a boss felled it: red. Marked on the ground from the moment it starts to go
      const ev = this.game.events;
      if (!b.told) {
        b.told = true;
        const t = this._tell;
        t.impactIn = Math.max(0.05, b.T - b.t);
        t.x = mx;
        t.z = mz;
        ev?.emit?.('combat:tell', t);
      }
      if (!b.flashed && b.T - b.t <= FLASH_LEAD) {
        b.flashed = true;
        const f = this._flash;
        f.x = mx;
        f.z = mz;
        ev?.emit?.('combat:flash', f);
      }
      const fx = this.game.fx?.add;
      b.mark -= dt;
      if (b.mark <= 0) {
        b.mark = 0.08;
        const hot = b.flashed ? 1 : 0.5, w = BREAK.topple.pad + b.r * 0.6;
        const rot = Math.atan2(-b.dz * 0.848, b.dx);
        // where it will land: red strokes down both edges of the strip, a row of marks down its
        // middle, brighter once its flash has come (glyphs only: no heat, nothing here burns)
        for (let s = 0.9; fx && s < b.h + 0.3; s += 0.45) {
          const cx = b.x + b.dx * s, cz = b.z + b.dz * s;
          for (const side of SIDES) {
            fx.spawn({
              x: cx - b.dz * side * w, y: 0.45, z: cz + b.dx * side * w,
              life: 0.2, size: 0.6, sizeEnd: 0.6, glyph: '-', color: [3.4 * hot, 0.22 * hot, 0.13 * hot], colorEnd: [1.5 * hot, 0.06, 0.04],
              alpha: 1, alphaEnd: 0, rot,
            });
          }
          fx.spawn({
            x: cx + (rnd() - 0.5) * w, y: 0.4, z: cz + (rnd() - 0.5) * w,
            life: 0.2, size: 0.34, sizeEnd: 0.34, glyph: 'x', color: [1.8 * hot * u, 0.1 * hot, 0.06 * hot], colorEnd: [0.8 * hot * u, 0.03, 0.02], alpha: 1, alphaEnd: 0,
          });
        }
      }
    }
    if (u >= 1) this._land(b);
  }

  _land(b) {
    const T = BREAK.topple;
    const dx = b.dx, dz = b.dz, len = b.h;
    const pad = T.pad + b.r * 0.6;
    this._crumble(b, dx, dz, true);
    b.state = BROKEN;
    const sc = this.world.scars;
    sc?.ground(b.x + dx * len * 0.4, b.z + dz * len * 0.4, 0.5 + 0.35 * b.weight, dx, dz);
    sc?.ground(b.x + dx * len * 0.85, b.z + dz * len * 0.85, 0.45 + 0.25 * b.weight, dx, dz);
    for (let s = 0.2; s < 1; s += 0.2) sc?.rubble(b.x + dx * len * s, b.z + dz * len * s, pad + 0.3, b.M, 3, b.def.look === 'prop' ? DIGITS : '.,:o');
    this.world.gust?.(b.x + dx * len * 0.5, b.z + dz * len * 0.5, 0.9, len * 0.7 + 3);
    this.game.shake?.(clamp(T.shake * b.weight, 0.15, 0.6));
    // what stood under it
    const ax = b.x + dx * 0.9, az = b.z + dz * 0.9, ex = b.x + dx * len, ez = b.z + dz * len;
    this.sweep(ax, az, ex, ez, pad, 0.7 * b.weight, { kind: BLOW.BLUNT, by: b.by, dx, dz, src: this.swing() });
    // who stood under it: the hero under a piece a boss (or the world) felled, the boss under the hero's
    const s = this._seg, g = this.game;
    const w = clamp(b.weight, 0.6, 1.3);
    if (b.by === 'player') {
      const boss = g.boss ?? g.dragon;
      const bp = boss?.position;
      if (bp && boss.takeHit && boss.isTargetable?.() !== false && Number.isFinite(bp.x + bp.z)) {
        // his body: the circles the hero collides with (the wyrm's are many), else one round his root
        let under = false;
        const BC = boss.bodyCircles;
        if (BC?.length) {
          for (let i = 0; i < BC.length && !under; i++) under = segDist(BC[i].x, BC[i].z, ax, az, ex, ez, s) <= pad + (BC[i].r ?? 0.5);
        } else under = segDist(bp.x, bp.z, ax, az, ex, ez, s) <= pad + (boss.T?.radius ?? boss.radius ?? 0.6);
        if (under) {
          const h = this._bossHit;
          h.damage = T.bossDamage * w;
          h.posture = T.bossPosture * w;
          h.point.x = bp.x;
          h.point.y = 1.2;
          h.point.z = bp.z;
          h.dir.x = dx;
          h.dir.z = dz;
          try {
            boss.takeHit(h);
          } catch (err) {
            console.error('[destructibles] boss.takeHit failed', err);
          }
        }
      }
    } else {
      const p = g.player;
      if (p?.takeHit && p.alive !== false && g.state === 'boss' && segDist(p.position.x, p.position.z, ax, az, ex, ez, s) <= pad + (p.radius ?? 0.45)) {
        const h = this._heroHit;
        h.damage = T.damage * w;
        h.knockback = T.knock;
        h.from.x = ax + (ex - ax) * s.t - dz * 0.01;
        h.from.z = az + (ez - az) * s.t + dx * 0.01;
        try {
          p.takeHit(h);
        } catch (err) {
          console.error('[destructibles] player.takeHit failed', err);
        }
      }
    }
    this._emit('crash', b, b.x + dx * len * 0.5, 0.4, b.z + dz * len * 0.5, b.weight, b.by);
  }

  // ------------------------------------------------------------------ debris (glyph particles)
  /** Chips off a struck piece: they fly back off the face and to the sides. */
  _chips(b, x, y, z, dx, dz, power) {
    const fx = b.M.sparks ? this.game.fx?.add : this.game.fx?.alpha;
    if (!fx) return;
    const n = Math.round(clamp(3 + power * 12, 3, 18));
    const M = b.M;
    for (let i = 0; i < n; i++) {
      const side = (rnd() - 0.5) * 2, back = 0.8 + rnd() * 2.6 * Math.min(1.4, 0.5 + power);
      fx.spawn({
        x: x + (rnd() - 0.5) * 0.25, y: y + (rnd() - 0.5) * 0.3, z: z + (rnd() - 0.5) * 0.25,
        vx: -dx * back - dz * side * 2.2, vy: 1.2 + rnd() * 3.2, vz: -dz * back + dx * side * 2.2,
        life: 0.45 + rnd() * 0.45, size: 0.3 + rnd() * 0.2 + power * 0.1, sizeEnd: 0.14, glyph: M.chips,
        color: M.color, colorEnd: M.colorEnd, alpha: 1, alphaEnd: 0, gravity: -15, drag: 0.5, spin: (rnd() - 0.5) * 12, rot: rnd() * 6.283,
      });
    }
    // dust off stone, a breath of it off wood
    const dust = this.game.fx?.alpha;
    if (dust && !M.sparks) {
      for (let i = 0; i < 2 + Math.round(power * 4); i++) {
        dust.spawn({
          x: x + (rnd() - 0.5) * 0.4, y: y + (rnd() - 0.5) * 0.4, z: z + (rnd() - 0.5) * 0.4,
          vx: -dx * 0.6 + (rnd() - 0.5) * 0.8, vy: 0.3 + rnd() * 0.6, vz: -dz * 0.6 + (rnd() - 0.5) * 0.8,
          life: 0.6 + rnd() * 0.6, size: 0.2, sizeEnd: 0.5, glyph: M.dust, color: M.colorEnd, colorEnd: M.colorEnd, alpha: 0.55, alphaEnd: 0, drag: 1.4,
        });
      }
    }
  }

  /** A burst of a piece's own debris at a point (its base as it goes, the ground it is torn from). */
  _burst(b, x, y, z, dx, dz, n, k) {
    const fx = this.game.fx?.alpha;
    if (!fx) return;
    const M = b.M;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, v = (1 + rnd() * 3) * k * 2;
      fx.spawn({
        x: x + Math.cos(a) * b.r * 0.6, y: y + rnd() * 0.3, z: z + Math.sin(a) * b.r * 0.6,
        vx: Math.cos(a) * v + dx * 1.5, vy: 1.5 + rnd() * 3.5 * k * 2, vz: Math.sin(a) * v + dz * 1.5,
        life: 0.5 + rnd() * 0.4, size: 0.3 + rnd() * 0.22, sizeEnd: 0.14, glyph: M.chips,
        color: M.color, colorEnd: M.colorEnd, alpha: 1, alphaEnd: 0, gravity: -15, drag: 0.5, spin: (rnd() - 0.5) * 10, rot: rnd() * 6.283,
      });
    }
  }

  /**
   * The piece comes apart into a shower of its own characters (the digits prop art prints it in, a
   * tree's round leaves and strokes), wherever its body is now: standing, lying where it fell, or
   * where it was thrown. `fallen`: it already lies along (dx, dz); `ember`: it burned through.
   * (The owner's pick of three filmed looks, 2026-11-15; bigger lumps and long shards were turned down.)
   */
  _crumble(b, dx, dz, fallen, ember = false) {
    b.body.visible = false;
    const solid = this.game.fx?.alpha, glow = this.game.fx?.add;
    if (!solid) return;
    const M = b.M;
    const n = Math.round(clamp(b.r * b.h * 26, 26, 130));
    const prop = b.def.look === 'prop';
    const wx = b.x + b.pivot.position.x, wy = b.pivot.position.y, wz = b.z + b.pivot.position.z;
    const q = b.pivot.quaternion, v = this._v;
    const wide = b.leafy > 0 ? b.r * 3.4 : b.r * 1.1;
    for (let i = 0; i < n; i++) {
      const t = rnd();
      const leaf = b.leafy > 0 && t > 1 - b.leafy;
      const a = rnd() * 6.283, rr = (leaf ? wide : b.r) * Math.sqrt(rnd());
      v.set(Math.cos(a) * rr, t * b.h, Math.sin(a) * rr).applyQuaternion(q);
      const x = wx + v.x, y = Math.max(0.1, wy + v.y), z = wz + v.z;
      const out = 0.6 + rnd() * 2.2;
      const up = fallen ? 0.6 + rnd() * 2.4 : 0.5 + rnd() * 3.2;
      const fall = Math.sqrt((2 * y) / 15) + up / 15;
      const hot = ember || (M.sparks && rnd() < 0.35);
      (hot && glow ? glow : solid).spawn({
        x, y, z,
        vx: Math.cos(a) * out + dx * (fallen ? 1.2 : 2.6), vy: up, vz: Math.sin(a) * out + dz * (fallen ? 1.2 : 2.6),
        life: clamp(fall + 0.3 + rnd() * 0.35, 0.5, 1.7), size: (leaf ? 0.46 : 0.42) + rnd() * 0.24, sizeEnd: 0.2,
        glyph: leaf ? LEAVES : prop ? DIGITS : M.chips,
        color: hot ? [2.8, 0.9 + rnd() * 0.6, 0.18] : leaf ? [0.26, 0.42, 0.2] : M.color,
        colorEnd: hot ? [0.5, 0.04, 0.02] : leaf ? [0.07, 0.11, 0.06] : M.colorEnd,
        alpha: 1, alphaEnd: 0, gravity: leaf ? -5 : -15, drag: leaf ? 1.6 : 0.4, spin: (rnd() - 0.5) * (leaf ? 4 : 9), rot: rnd() * 6.283,
        flicker: hot ? 0.4 : 0,
      });
    }
    // the dust it raises
    for (let i = 0; i < 6 + Math.round(b.weight * 5); i++) {
      const t = rnd();
      v.set((rnd() - 0.5) * b.r * 2, t * b.h, (rnd() - 0.5) * b.r * 2).applyQuaternion(q);
      solid.spawn({
        x: wx + v.x, y: Math.max(0.15, wy + v.y) * 0.5 + 0.2, z: wz + v.z,
        vx: (rnd() - 0.5) * 1.6, vy: 0.4 + rnd() * 0.9, vz: (rnd() - 0.5) * 1.6,
        life: 0.9 + rnd() * 0.9, size: 0.3, sizeEnd: 0.9, glyph: M.dust, color: M.colorEnd, colorEnd: M.colorEnd, alpha: 0.5, alphaEnd: 0, drag: 1.2,
      });
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const A = this.active;
    if (!A.length || !(dt > 0)) return;
    const time = this.game.time ?? 0;
    for (let i = A.length - 1; i >= 0; i--) {
      const b = A[i];
      let busy = false;
      if (b.state === FALLING) {
        this._fall(b, dt);
        busy = b.state === FALLING;
      } else if (b.state === FLYING) {
        this._fly(b, dt);
        busy = b.state === FLYING;
      } else if (b.state === HELD) busy = true;
      else if (b.state === INTACT) {
        if (b.burn > 0) {
          this._burnStep(b, dt);
          busy = b.burn > 0;
        }
        if (b.state === INTACT && b.shake > 0) {
          // a struck piece shudders along the blow
          b.shake = Math.max(0, b.shake - dt);
          const k = Math.sin(time * 58) * b.shakeAmp * (b.shake / 0.28);
          b.pivot.rotation.set(b.dz * k, 0, -b.dx * k);
          busy = busy || b.shake > 0;
        }
      }
      if (!busy) {
        b.on = false;
        A[i] = A[A.length - 1];
        A.pop();
      }
    }
  }

  /** Everything stands again (the fight's reset: flow.js, the Lab). */
  reset() {
    const C = this.world.colliders;
    for (const b of this.list) {
      this._stopBurn(b);
      if (b.stubCollider) C?.remove?.(b.stubCollider);
      for (const c of b.colliders) C?.restore?.(c);
      b.state = INTACT;
      b.hp = b.hpMax;
      b.burnt = false;
      b.shake = 0;
      b.src = -1;
      b.srcT = -1e9;
      b.onLand = null;
      b.on = false;
      b.body.visible = true;
      if (b.stub) b.stub.visible = false;
      b.pivot.position.set(0, 0, 0);
      b.pivot.quaternion.identity();
    }
    this.active.length = 0;
  }
}
