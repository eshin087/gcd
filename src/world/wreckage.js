import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hash2 } from '../core/rng.js';
import { prep, lumpy, carve, mul, buildRubble, BARK } from './forest.js';
import { BREAK } from './breakTuning.js';

// Wreckage (2026-11-15; it reverses ADR-107's "a felled trunk comes apart where it lands"): what the
// fight leaves lying on the ground until it resets. A felled tree's trunk lies where it fell, a broken
// stone or boulder leaves a rubble pile, burnt wood lies black and smoulders, a thrown piece leaves its
// remains where it lands. All of it is SCENERY: no collider, it stops nothing, the hero walks over it.
//
// Drawn like every solid object, through the prop art path (render/materials.js
// `createPropArtMaterial`, the twin the breakables batch already draws): fixed pools of meshes,
// built once and batched with the breakables (destructibles.js passes its root to batchRigid), so the
// wreckage costs no draw call of its own and bones only for its pools. A free mesh is hidden (its bone
// writes a zero matrix). When a pool's share (x the quality factor) is used up, its oldest piece sinks
// into the ground; past the pool's size the oldest is taken at once (it crumbles to dust).
//
// Burning: a log can burn (it fell burning, fire landed on it, or a neighbour lit it: the spread is
// destructibles.js'): flames are heat in the fire field, the hero beside it is burned like beside a
// burning tree, and when it has burned through it lies black (a char log) and smoulders for a while:
// smoke, embers, the ground under it kept warm (the prop shader's ember glow reads the scorch map).
//
// No per-frame allocation: pooled meshes and entries, one reused fire-field record, one reused
// particle record.

const LOG_LOOKS = 3;
const CHAR_LOOKS = 2;
const RUBBLE_LOOKS = 3;
const BONE_LOOKS = 3;
// (BONES: what a broken rib, a run of vertebrae, a skull leaves lying: a heap of shards in the bone's own
// hue, 2026-11-16; it lies and sinks as a rubble pile does)
const KIND = Object.freeze({ LOG: 0, CHAR: 1, RUBBLE: 2, BONES: 3 });
const BONE_COL = [0.3, 0.285, 0.245], OLD_BONE_COL = [0.2, 0.19, 0.17]; // (landmarks.js BONE, OLD_BONE)
const CHAR_COL = [0.03, 0.026, 0.024]; // (burnt black: the ember glow under it is the scorch map's)

// cosmetic noise from this module's own stream (the seeded sims replay Math.random)
let seed = 0x2b7e1516;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** A trunk lying along +x from 0 to 1, radius 1 (scaled per use): bark, a split top, a torn base. */
function logGeometry(r, charred) {
  const g = prep(new THREE.CylinderGeometry(0.78, 1, 1, 8, 5, false));
  g.rotateZ(-Math.PI / 2); // its axis along +x
  g.translate(0.5, 0, 0);
  const p = g.attributes.position;
  const s = r() * 50;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // the top end snapped off: splinters of uneven length; the base torn from its stump
    if (x > 0.97) p.setX(i, x + hash2(y * 13 + s, z * 13) * 0.16 - 0.05);
    else if (x < 0.03) p.setX(i, x - hash2(y * 11 - s, z * 11) * 0.06);
  }
  lumpy(g, 0.1, 3.2, s, new THREE.Vector3(0.5, 0, 0));
  carve(g, {
    col: charred
      ? (px, py, pz) => mul(CHAR_COL, 0.7 + 0.6 * hash2(px * 9 + s, py * 7 + pz * 5))
      : (px, py, pz) => mul(BARK, 0.75 + 0.45 * hash2(px * 7 + s, py * 9 + pz * 3)),
    ao: (px, py) => 0.55 + 0.45 * clamp(0.5 + py, 0, 1),
    edge: (px, py, pz, nx, ny) => (ny > 0.55 ? (charred ? 0.25 : 0.45) : 0),
  });
  return g;
}

/** A heap of broken bone round 0, about 1 across (scaled per use): rib shards lying crossed, knuckles, splinters. */
function boneGeometry(r) {
  const parts = [];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const len = 0.7 + r() * 0.9, rad = 0.06 + r() * 0.07;
    const g = prep(new THREE.CylinderGeometry(rad * 0.7, rad, len, 5, 3));
    // a rib's curve: bent along its length
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) / len;
      p.setX(k, p.getX(k) + (0.25 - y * y) * 0.5 * (0.5 + r()));
    }
    g.rotateZ(Math.PI / 2 + (r() - 0.5) * 0.3);
    g.rotateY(r() * Math.PI * 2);
    const a = r() * Math.PI * 2, d = r() * 0.45;
    g.translate(Math.cos(a) * d, rad * 0.8 + i * 0.03, Math.sin(a) * d);
    parts.push(g);
  }
  for (let i = 0; i < 3; i++) {
    const s = 0.12 + r() * 0.12;
    const g = prep(new THREE.IcosahedronGeometry(s, 0));
    lumpy(g, s * 0.35, 1.6 / s, r() * 99);
    const a = r() * Math.PI * 2, d = 0.2 + r() * 0.5;
    g.translate(Math.cos(a) * d, s * 0.5, Math.sin(a) * d);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  const sd = r() * 50;
  carve(g, {
    col: (px, py, pz) => mul(hash2(px * 3 + sd, pz * 3) < 0.35 ? OLD_BONE_COL : BONE_COL, 0.75 + 0.45 * hash2(px * 9 + sd, py * 7 + pz * 5)),
    ao: (px, py) => 0.55 + 0.45 * clamp(py / 0.3, 0, 1),
    edge: (px, py, pz, nx, ny) => (ny > 0.5 ? 0.4 : 0),
  });
  return g;
}

export class Wreckage {
  /**
   * `root`: the group it hangs under (the breakables' root: one batch for both); `mat`: the prop art
   * twin; `owner`: the Destructibles (lights, quality, events).
   */
  constructor(game, world, root, mat, owner) {
    this.game = game;
    this.world = world;
    this.D = owner;
    this.group = new THREE.Group();
    this.group.name = 'wreckage';
    root.add(this.group);
    /** every entry, by pool: { kind, mesh, on, t (born), x, z, dx, dz, len, r, burn, burnLife, flame, heatT, smoulder, sink, light, M } */
    this.pools = [[], [], [], []];
    /** the entries lying now, oldest first per pool (unordered across pools) */
    this.live = [];
    this.burning = 0;
    this._blob = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size: 1, sizeEnd: 0.35, heat: 0.5, heatEnd: 0, drag: 1.0, gravity: 0, kind: 'fire' };
    this._smoke = { x: 0, y: 0.8, z: 0, vx: 0.15, vy: 0.7, vz: 0, life: 1.8, size: 0.9, sizeEnd: 2.2, heat: 0.22, heatEnd: 0, drag: 0.4, gravity: 0, kind: 'smoke' };
    this._p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.3, sizeEnd: 0.1, glyph: '.', color: [1, 1, 1], colorEnd: [1, 1, 1], alpha: 1, alphaEnd: 0, gravity: 0, drag: 0, spin: 0, rot: 0, flicker: 0 };
    if (!mat) return;
    const W = BREAK.wreck;
    const r = mulberry32(0x5eed1e5);
    const logs = [], chars = [], rocks = [], bones = [];
    for (let i = 0; i < LOG_LOOKS; i++) logs.push(logGeometry(r, false));
    for (let i = 0; i < CHAR_LOOKS; i++) chars.push(logGeometry(r, true));
    for (let i = 0; i < RUBBLE_LOOKS; i++) rocks.push(buildRubble(r, 0, 0, 1, { h: 0.55 })[0]);
    for (let i = 0; i < BONE_LOOKS; i++) bones.push(boneGeometry(r));
    const make = (kind, n, geos) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geos[i % geos.length], mat);
        m.matrixAutoUpdate = false;
        m.visible = false;
        m.name = 'wreck';
        this.group.add(m);
        this.pools[kind].push({
          kind, mesh: m, on: false, t: 0, x: 0, z: 0, dx: 1, dz: 0, len: 1, r: 0.3, y0: 0,
          burn: 0, burnLife: 0, flame: 0, heatT: 0, touchT: 0, smoulder: 0, sink: 0, light: null, spreadT: 0, gen: 0, M: null,
        });
      }
    };
    make(KIND.LOG, W.logs, logs);
    make(KIND.CHAR, W.chars, chars);
    make(KIND.RUBBLE, W.rubble, rocks);
    make(KIND.BONES, W.bones ?? 0, bones);
  }

  get count() {
    return this.live.length;
  }

  /** How many of a pool may lie at once (its size x the quality factor). */
  _cap(kind) {
    const n = this.pools[kind].length;
    return Math.max(2, Math.min(n, Math.round(n * (this.D?.q ?? 1))));
  }

  _used(kind) {
    let n = 0;
    const L = this.live;
    for (let i = 0; i < L.length; i++) if (L[i].kind === kind) n++;
    return n;
  }

  /** A free entry of the pool; at the cap the oldest makes room (it crumbles where it lay). */
  _take(kind) {
    const P = this.pools[kind];
    if (!P.length) return null;
    const cap = this._cap(kind);
    let used = 0, oldest = null;
    const L = this.live;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.kind !== kind) continue;
      used++;
      if (!oldest || e.t < oldest.t) oldest = e;
    }
    if (used >= cap && oldest) this._free(oldest, true);
    for (let i = 0; i < P.length; i++) if (!P[i].on) return P[i];
    return null;
  }

  _free(e, crumble = false) {
    if (!e.on) return;
    if (crumble) this._dust(e, 8);
    if (e.burn > 0) this.burning--;
    e.on = false;
    e.burn = 0;
    e.smoulder = 0;
    e.sink = 0;
    e.light?.kill?.();
    e.light = null;
    e.mesh.visible = false;
    const i = this.live.indexOf(e);
    if (i >= 0) {
      this.live[i] = this.live[this.live.length - 1];
      this.live.pop();
    }
  }

  _place(e) {
    const m = e.mesh;
    if (e.kind === KIND.RUBBLE || e.kind === KIND.BONES) {
      m.position.set(e.x, e.y0 - e.sink * (e.r * 0.7 + 0.2), e.z);
      m.rotation.set(0, e.yaw, 0);
      m.scale.set(e.r, e.r * 0.8, e.r);
    } else {
      m.position.set(e.x, e.y0 - e.sink * (e.r * 2 + 0.25), e.z);
      m.rotation.set(e.roll, Math.atan2(-e.dz, e.dx), 0, 'YXZ');
      m.scale.set(e.len, e.r, e.r);
    }
    m.updateMatrix();
  }

  _start(e, x, z) {
    e.on = true;
    e.t = this.game.time ?? 0;
    e.x = x;
    e.z = z;
    e.burn = e.burnLife = 0;
    e.flame = 0;
    e.heatT = 0;
    e.touchT = 0;
    e.smoulder = 0;
    e.sink = 0;
    e.spreadT = 0;
    e.light = null;
    e.mesh.visible = true;
    this.live.push(e);
  }

  /**
   * A trunk lies from (x, z) along (dx, dz), `len` long, `r` thick (`burn` s still alight: it fell
   * burning). `charred`: it burned through standing (a black log).
   */
  log(x, z, dx, dz, len, r, burn = 0, charred = false) {
    if (!Number.isFinite(x + z + dx + dz + len + r) || !(len > 0.2)) return null;
    const kind = charred ? KIND.CHAR : KIND.LOG;
    const e = this._take(kind);
    if (!e) return null;
    const l = Math.hypot(dx, dz) || 1;
    this._start(e, x, z);
    e.dx = dx / l;
    e.dz = dz / l;
    e.len = len;
    e.r = clamp(r, 0.12, 0.7);
    e.y0 = e.r * 0.72;
    e.roll = rnd() * 6.283;
    e.M = BREAK.mats.wood;
    if (charred) e.smoulder = BREAK.wreck.smoulder * (0.8 + 0.4 * rnd());
    this._place(e);
    // it flattens the grass it lies on (the scorch map's char, no heat: the blades shrink round it)
    for (let s = 0.3; s < len; s += 1.1) this.world.scorch?.burnCircle?.(x + e.dx * s, z + e.dz * s, e.r + 0.35, BREAK.wreck.flatten, 0);
    if (burn > 0 && !charred) this._light(e, burn);
    return e;
  }

  /** A pile of rubble at (x, z), `r` across (a broken stone, a boulder, a thrown one's remains). */
  rubble(x, z, r, M = BREAK.mats.stone) {
    if (!Number.isFinite(x + z + r) || !(r > 0.1)) return null;
    // (bone: a heap of shards, its own pool; stone and anything else: a rubble pile)
    const e = this._take(M === BREAK.mats.bone && this.pools[KIND.BONES].length ? KIND.BONES : KIND.RUBBLE);
    if (!e) return null;
    this._start(e, x, z);
    e.r = clamp(r, 0.3, 1.8);
    e.y0 = 0;
    e.yaw = rnd() * 6.283;
    e.M = M;
    this._place(e);
    this.world.scorch?.burnCircle?.(x, z, e.r * 1.3, BREAK.wreck.flatten, 0);
    return e;
  }

  // ------------------------------------------------------------------ fire
  /** It catches (if it is a log not yet alight and the fires are under their cap): true if it did. */
  _light(e, sec, gen = 0) {
    if (!e?.on || e.kind !== KIND.LOG || e.burn > 0 || e.sink > 0) return false;
    if (!this.D._fireRoom()) return false;
    e.burn = e.burnLife = sec;
    e.flame = 0;
    e.spreadT = 0;
    e.gen = gen;
    this.burning++;
    const mx = e.x + e.dx * e.len * 0.5, mz = e.z + e.dz * e.len * 0.5;
    e.light = this.D._lightAt(mx, 0.8, mz, BREAK.burn.glow.radius, sec + 0.6);
    return true;
  }

  /** Fire lands on the disc: logs in it catch. Returns how many. */
  ignite(x, z, r, k = 1) {
    if (!Number.isFinite(x + z + r) || !(k > 0)) return 0;
    let n = 0;
    const L = this.live;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.kind !== KIND.LOG || e.burn > 0) continue;
      if (this._dist(e, x, z) > r + e.r) continue;
      if (this._light(e, BREAK.wreck.burn * k * (0.85 + 0.3 * rnd()))) n++;
    }
    return n;
  }

  /** Distance from (x, z) to the log's axis (a pile: to its centre). */
  _dist(e, x, z) {
    if (e.kind >= KIND.RUBBLE) return Math.hypot(x - e.x, z - e.z);
    const t = clamp((x - e.x) * e.dx + (z - e.z) * e.dz, 0, e.len);
    return Math.hypot(e.x + e.dx * t - x, e.z + e.dz * t - z);
  }

  _burnStep(e, dt) {
    e.burn -= dt;
    const u = 1 - Math.max(0, e.burn) / (e.burnLife || 1);
    const fx = this.game.fx?.fire, q = this.D?.q ?? 1;
    if (fx) {
      e.flame += dt * (10 + e.len * 9) * (1 - 0.5 * u) * q;
      while (e.flame >= 1) {
        e.flame -= 1;
        const s = rnd() * e.len, hot = rnd();
        const b = this._blob;
        b.x = e.x + e.dx * s + (rnd() - 0.5) * e.r * 2;
        b.y = 0.7 + rnd() * 0.3;
        b.z = e.z + e.dz * s + (rnd() - 0.5) * e.r * 2;
        b.vx = (rnd() - 0.5) * 0.5;
        b.vy = 1.2 + rnd() * 1.6;
        b.vz = (rnd() - 0.5) * 0.5;
        b.life = 0.35 + rnd() * 0.4;
        b.size = 1.0 + hot * 0.6;
        b.sizeEnd = 0.35;
        b.heat = 0.46 + hot * 0.15;
        fx.spawn(b);
      }
    }
    e.heatT -= dt;
    if (e.heatT <= 0) {
      e.heatT = 0.35;
      // the ground along it glows and chars
      const s = rnd() * e.len;
      this.world.scorch?.burnCircle?.(e.x + e.dx * s, e.z + e.dz * s, e.r + 0.9, 0.06, 0.6);
    }
    // the hero beside it is burned (the ground fire's tick clock)
    const p = this.game.player?.position;
    if (p && this.world.fire?.touch) {
      const t = clamp((p.x - e.x) * e.dx + (p.z - e.z) * e.dz, 0, e.len);
      this.world.fire.touch(e.x + e.dx * t, e.z + e.dz * t, e.r + BREAK.burn.pad * 0.8);
    }
    if (e.burn <= 0) {
      // burned through: a black log in its place
      this.burning--;
      e.burn = 0;
      e.light = null; // (it fades on its own)
      const { x, z, dx, dz, len, r } = e;
      this._free(e);
      this.log(x, z, dx, dz, len * 0.92, r * 0.9, 0, true);
      this.D?._emitAt('burnout', 'wood', x + dx * len * 0.5, 0.3, z + dz * len * 0.5, 0, 'world');
    }
  }

  _smoulderStep(e, dt, on) {
    e.smoulder -= dt;
    if (!on) return;
    e.heatT -= dt;
    if (e.heatT > 0) return;
    e.heatT = 0.9 + rnd() * 0.6;
    const s = rnd() * e.len, x = e.x + e.dx * s, z = e.z + e.dz * s;
    const k = clamp(e.smoulder / BREAK.wreck.smoulder, 0, 1);
    // its embers keep the ground under it warm (the prop art's ember glow reads it)
    this.world.scorch?.burnCircle?.(x, z, e.r + 0.5, 0, 0.35 + 0.3 * k);
    const fire = this.game.fx?.fire;
    if (fire && rnd() < 0.55) {
      const m = this._smoke;
      m.x = x;
      m.z = z;
      m.y = 0.7;
      m.vy = 0.5 + rnd() * 0.6;
      m.life = 1.4 + rnd();
      m.heat = 0.18 + 0.1 * k;
      fire.spawn(m);
    }
    const add = this.game.fx?.add;
    if (add) {
      const p = this._p;
      p.x = x + (rnd() - 0.5) * e.r;
      p.y = e.r * 1.2;
      p.z = z + (rnd() - 0.5) * e.r;
      p.vx = (rnd() - 0.5) * 0.4;
      p.vy = 0.6 + rnd() * 1.2;
      p.vz = (rnd() - 0.5) * 0.4;
      p.life = 0.6 + rnd() * 0.9;
      p.size = 0.16 + rnd() * 0.1;
      p.sizeEnd = 0.05;
      p.glyph = ".'`*";
      p.color[0] = 2.2 * k + 0.6; p.color[1] = 0.55 * k + 0.1; p.color[2] = 0.08;
      p.colorEnd[0] = 0.5; p.colorEnd[1] = 0.05; p.colorEnd[2] = 0.01;
      p.alpha = 1;
      p.alphaEnd = 0;
      p.gravity = 0;
      p.drag = 0.6;
      p.spin = 0;
      p.rot = 0;
      p.flicker = 0.5;
      add.spawn(p);
    }
  }

  /** A puff of its own dust and chips (it crumbled or sank away). */
  _dust(e, n) {
    const fx = this.game.fx?.alpha;
    if (!fx) return;
    const M = e.M ?? BREAK.mats.wood, p = this._p;
    const mx = e.kind >= KIND.RUBBLE ? e.x : e.x + e.dx * e.len * 0.5, mz = e.kind >= KIND.RUBBLE ? e.z : e.z + e.dz * e.len * 0.5;
    n = Math.max(2, Math.round(n * (this.D?.q ?? 1)));
    for (let i = 0; i < n; i++) {
      p.x = mx + (rnd() - 0.5) * (e.kind >= KIND.RUBBLE ? e.r * 2 : e.len);
      p.y = 0.2 + rnd() * 0.3;
      p.z = mz + (rnd() - 0.5) * (e.kind >= KIND.RUBBLE ? e.r * 2 : e.len * 0.4);
      p.vx = (rnd() - 0.5) * 1.2;
      p.vy = 0.3 + rnd() * 0.8;
      p.vz = (rnd() - 0.5) * 1.2;
      p.life = 0.8 + rnd() * 0.8;
      p.size = 0.3;
      p.sizeEnd = 0.8;
      p.glyph = M.dust;
      for (let c = 0; c < 3; c++) p.color[c] = p.colorEnd[c] = M.colorEnd[c];
      p.alpha = 0.5;
      p.alphaEnd = 0;
      p.gravity = 0;
      p.drag = 1.2;
      p.spin = 0;
      p.rot = 0;
      p.flicker = 0;
      fx.spawn(p);
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const L = this.live;
    if (!L.length || !(dt > 0)) return;
    const W = BREAK.wreck;
    // a pool over its share: its oldest sinks into the ground
    for (let k = 0; k < 3; k++) {
      const cap = this._cap(k);
      let used = 0, sinking = 0, oldest = null;
      for (let i = 0; i < L.length; i++) {
        const e = L[i];
        if (e.kind !== k) continue;
        used++;
        if (e.sink > 0) sinking++;
        else if (!oldest || e.t < oldest.t) oldest = e;
      }
      if (used - sinking > cap - 2 && oldest && oldest.burn <= 0) {
        oldest.sink = 1e-3;
        this._dust(oldest, 5);
      }
    }
    // smouldering: only the newest few at once (the phone budget)
    const smoulderOn = Math.max(1, Math.round(W.smoulderMax * (this.D?.q ?? 1)));
    let lit = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const e = L[i];
      if (e.sink > 0) {
        e.sink += dt / W.sink;
        if (e.sink >= 1) {
          this._free(e);
          continue;
        }
        this._place(e);
        continue;
      }
      // a log lying in burning grass catches (checked twice a second at a point along it)
      if (e.kind === KIND.LOG && e.burn <= 0 && (e.touchT -= dt) <= 0) {
        e.touchT = 0.5;
        const s = rnd() * e.len;
        if ((this.world.fire?.burning?.(e.x + e.dx * s, e.z + e.dz * s) ?? 0) > 0) this._light(e, W.burn * (0.85 + 0.3 * rnd()));
      }
      if (e.burn > 0) this._burnStep(e, dt);
      else if (e.smoulder > 0) this._smoulderStep(e, dt, lit++ < smoulderOn);
    }
  }

  /** Every piece of wreckage goes (the fight's reset). */
  reset() {
    for (let i = this.live.length - 1; i >= 0; i--) this._free(this.live[i]);
    this.live.length = 0;
    this.burning = 0;
  }
}

export const WRECK = KIND;
