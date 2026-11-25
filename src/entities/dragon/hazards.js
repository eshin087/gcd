import { TUNING } from './tuning.js';
import { TELL, RESULT } from '../../combat/rules.js';
import { clamp, smoothstep } from '../../core/math.js';
import { skyMeteor, skyImpact, skyCrater, skyDeck, skyUpdate, skyReset, skyFeed, skyFrom } from './skyFx.js';
import { trailStart, trailHead, trailRelease, trailUpdate, trailReset, layFront } from './fireTrails.js';
import { TRAILS } from './tuningFire.js';

// Fire hazards (contract 3): pooled world-space threats that run on their own, independent of the
// wyrm's current action, so it can fight while meteors fall. Dragon.update calls update(dt) every
// frame (it never throws); everything is cleared on reset, death and every phase change.
//
// Shapes (SHAPE): circle (a meteor, a lava pillar, a barrage shell: one blast at `impact`), strip
// (a fire front runs A -> B, the ground it passed keeps burning `linger` s: contact ticks), ring
// (ignites at r0 and expands to r1), wall (a fire wall sweeping along its normal), line (lava
// pillars along A + dir * k * step, erupting one after another) and two emitters that spawn
// circles over time: rain (meteors round the player), chase (pillars under the player) and barrage
// (Armageddon, ADR-053: waves of meteors over the whole clearing, then one great meteor).
//
// Every hazard heats the ground under it from spawn until it goes off (ADR-052: a glow of small
// ground glyphs + scorch heat, its edge drawn in the last flashLead s), then hits through
// dragon.hitPlayer({ ..., tell: TELL.RED, plunge: false }): i-frames dodge it, block / parry fail
// (a hazard spawned with plunge: true, fire breathed or spat from the air, lets a perfect dodge plunge).
// The main hit lands at most once per hazard (a strip's lingering fire ticks: blockable contact
// damage, skipped while the hero rolls). A hazard either announces itself (`announce`, circles:
// 'combat:tell' once the hero is near its ring, 'combat:flash' flashLead s before impact) or is
// covered by the spawning attack's own tell beat (announce: false; the attack re-times its flash
// with timeTo()). Groups cap how many hits a whole rain / barrage / chase may deal.
// No per-frame allocations: pooled hazard records, reused hit / event scratch.
//
// Every fire comes from the wyrm (ADR-197, fireTrails.js): a line / chase given an origin (`cx, cz`:
// the forefeet's slam) opens a glowing crack from it (the line's pillars burst as its head reaches
// them; the chase's head runs out to the hero and every pillar bursts where it is); a wall given
// `lay` is laid along its line from `layS` (and a runner may carry the fire there first: `run`);
// the barrage's meteors fall out of the wyrm's fire in the sky (skyFx.skyFrom: its seeds / vortex).
const TC = TRAILS.crack, TM = TRAILS.meteor;
const _src = { x: 0, y: 0, z: 0 };

export const SHAPE = Object.freeze({ CIRCLE: 0, STRIP: 1, RING: 2, WALL: 3, LINE: 4, RAIN: 5, CHASE: 6, BARRAGE: 7 });
// (an Armageddon wave keeps ~10 meteors in the air plus up to two waves of burning craters, while
// the wyrm fights on with its other hazards)
const MAX = 64;
const MAX_GROUPS = 8;
const ANNOUNCE_PAD = 3.0; // m: a self-announcing circle tells once the hero is this close to its ring
export const ARENA_R = 27; // m: meteors / pillars land inside this radius (the clearing is 30)
/** m inside a barrage wave's rim a hero outside the clearing is kept (the wave follows him out through a gap in the wall: ADR-125). */
const WAVE_IN = 7;
const PILLAR_BURN = 0.75; // s a lava pillar's column keeps erupting (visual; it hits for `active`)
const CRATER = 1.3; // s a meteor crater smoulders (visual)
const FADE = 0.35; // s a ring / wall's flames die out after its travel

const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ------------------------------------------------------------------ Armageddon placement (pure)
const TAU = Math.PI * 2;
const GOLDEN = 2.399963229728653;
export const OVERLAP = 1 / 3; // two footprints of one wave may share at most this much of one
/** Lens area of two equal footprints (radius r, centres s apart) as a share of one footprint. */
export function overlapShare(s, r) {
  if (!(s < 2 * r)) return 0;
  const h = Math.max(0, s) / (2 * r);
  return (2 * Math.acos(h) - 2 * h * Math.sqrt(1 - h * h)) / Math.PI;
}
// the closest two centres may sit (x r) for an overlap of OVERLAP, with a 2 % margin
const SEP_K = (() => {
  let lo = 0, hi = 2;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (overlapShare(m, 1) > OVERLAP) lo = m;
    else hi = m;
  }
  return hi * 1.02;
})();
// sample points over a unit disc (a sunflower): coverage() counts how many fall in a footprint
const SAMPLES = (() => {
  const n = 256, out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const u = Math.sqrt((i + 0.5) / n), a = i * GOLDEN;
    out[2 * i] = Math.sin(a) * u;
    out[2 * i + 1] = Math.cos(a) * u;
  }
  return out;
})();

/** Share of the disc of radius R round (hx, hz) covered by the first n footprints (radius r) of pts [x0, z0, x1, z1, ...]. */
export function coverage(pts, n, r, hx, hz, R) {
  const m = SAMPLES.length / 2, r2 = r * r;
  let c = 0;
  for (let s = 0; s < m; s++) {
    const x = hx + SAMPLES[2 * s] * R, z = hz + SAMPLES[2 * s + 1] * R;
    for (let i = 0; i < n; i++) {
      const dx = x - pts[2 * i], dz = z - pts[2 * i + 1];
      if (dx * dx + dz * dz <= r2) {
        c++;
        break;
      }
    }
  }
  return c / m;
}

function inside(pts, i, R) {
  const l = Math.hypot(pts[2 * i], pts[2 * i + 1]);
  if (l > R) {
    pts[2 * i] *= R / l;
    pts[2 * i + 1] *= R / l;
  }
}

/** Push footprint i (and j, unless `fixJ`) apart until they overlap by at most OVERLAP. */
function separate(pts, i, j, r, R, fixJ) {
  let dx = pts[2 * i] - pts[2 * j], dz = pts[2 * i + 1] - pts[2 * j + 1];
  let l = Math.hypot(dx, dz);
  const need = SEP_K * r;
  if (l >= need) return;
  if (l < 1e-3) {
    dx = Math.sin(i * GOLDEN);
    dz = Math.cos(i * GOLDEN);
    l = 1;
  }
  const push = need - l, ux = dx / l, uz = dz / l;
  const ki = fixJ ? 1 : 0.5;
  pts[2 * i] += ux * push * ki;
  pts[2 * i + 1] += uz * push * ki;
  inside(pts, i, R);
  if (!fixJ) {
    pts[2 * j] -= ux * push * 0.5;
    pts[2 * j + 1] -= uz * push * 0.5;
    inside(pts, j, R);
  }
}

/**
 * The impact points of one Armageddon wave (ADR-053) into `pts` [x0, z0, ...]: n spots over the
 * clearing, jittered-stratified (a sunflower turned and jittered by `rng`, so the cover is even), no
 * two overlapping by more than OVERLAP, and kept off the hero: within `safeR` m of (hx, hz) they cover
 * at most `cover` of the ground (the nearest spot moves out past the safe disc, or to the far side of
 * the clearing). Pure and seeded: the tests run it directly.
 */
export function placeWave(n, r, rng, hx, hz, pts, safeR = 12, cover = 0.45) {
  const R = ARENA_R - 0.35 * r;
  const rot = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const rr = R * Math.sqrt((i + 0.25 + 0.5 * rng()) / n);
    const a = rot + i * GOLDEN + (rng() - 0.5) * 0.6;
    pts[2 * i] = Math.sin(a) * rr;
    pts[2 * i + 1] = Math.cos(a) * rr;
  }
  const apart = () => {
    for (let pass = 0; pass < 4; pass++) for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) separate(pts, i, j, r, R, false);
  };
  apart();
  const hxa = Number.isFinite(hx) ? hx : 0, hza = Number.isFinite(hz) ? hz : 0;
  for (let it = 0; it < n * 2 && coverage(pts, n, r, hxa, hza, safeR) > cover; it++) {
    // the spot nearest the hero (that is not already out of his safe disc) moves out of it
    let k = -1, best = Infinity;
    for (let i = 0; i < n; i++) {
      const dd = Math.hypot(pts[2 * i] - hxa, pts[2 * i + 1] - hza);
      if (dd < best && dd < safeR + r) {
        best = dd;
        k = i;
      }
    }
    if (k < 0) break;
    let dx = pts[2 * k] - hxa, dz = pts[2 * k + 1] - hza;
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) {
      dx = Math.sin(rot + k);
      dz = Math.cos(rot + k);
    } else {
      dx /= l;
      dz /= l;
    }
    let x = hxa + dx * (safeR + r), z = hza + dz * (safeR + r);
    if (Math.hypot(x, z) > R) {
      // no room that way: the far side of the clearing from the hero, a little turned
      const hl = Math.hypot(hxa, hza) || 1, tw = (rng() - 0.5) * 1.6;
      const bx = -hxa / hl, bz = -hza / hl;
      x = (bx * Math.cos(tw) + bz * Math.sin(tw)) * R * (0.6 + 0.4 * rng());
      z = (bz * Math.cos(tw) - bx * Math.sin(tw)) * R * (0.6 + 0.4 * rng());
    }
    pts[2 * k] = x;
    pts[2 * k + 1] = z;
    inside(pts, k, R);
    for (let j = 0; j < n; j++) if (j !== k) separate(pts, k, j, r, R, true);
  }
  return pts;
}

/**
 * A led meteor (k of a wave of n placed by placeWave) wants the hero's led position (cx, cz): pushed
 * clear of the wave's other footprints (overlap <= OVERLAP), it takes slot k if the wave still covers
 * at most `cover` of the hero's safe disc with it; else the slot keeps its spot. Returns whether it led.
 */
export function leadInto(pts, k, n, r, cx, cz, hx, hz, safeR = 12, cover = 0.45) {
  if (!Number.isFinite(cx + cz)) return false;
  const R = ARENA_R - 0.35 * r;
  const ox = pts[2 * k], oz = pts[2 * k + 1];
  pts[2 * k] = cx;
  pts[2 * k + 1] = cz;
  inside(pts, k, R);
  for (let pass = 0; pass < 3; pass++) for (let j = 0; j < n; j++) if (j !== k) separate(pts, k, j, r, R, true);
  let ok = true;
  for (let j = 0; j < n && ok; j++) if (j !== k && overlapShare(Math.hypot(pts[2 * k] - pts[2 * j], pts[2 * k + 1] - pts[2 * j + 1]), r) > OVERLAP) ok = false;
  if (ok && Number.isFinite(hx + hz) && coverage(pts, n, r, hx, hz, safeR) > cover) ok = false;
  if (!ok) {
    pts[2 * k] = ox;
    pts[2 * k + 1] = oz;
  }
  return ok;
}

function blank(i) {
  return {
    slot: i, id: 0, alive: false, shape: 0, kind: '', attack: '',
    t: 0, impact: 0, end: 0, fired: false, hit: false,
    // geometry
    x: 0, z: 0, r: 0, ax: 0, az: 0, dx: 0, dz: 1, len: 0, w: 0,
    r0: 0, r1: 0, speed: 0, dist: 0, n: 0, step: 0, delay: 0, active: 0,
    f: 0, // last front / radius / sweep position (swept hit tests)
    // blow (noBlow: none at all: a strip that only burns, a cinder falling out of reach)
    damage: 0, burn: 0, knockback: 0, knockdown: false, plunge: false, noBlow: false,
    // strip contact fire
    linger: 0, tick: 0, tickT: 0, tickDamage: 0, tickBurn: 0,
    // tells
    announce: false, told: false, flashed: false, group: -1,
    // projectile (meteor / shell): origin + visible fall; size: drawn scale; great: Armageddon's last
    // meteor (the biggest impact); dark: no light of its own (a wave keeps ~10 in the air)
    fall: 0, ox: 0, oy: 0, oz: 0, fell: false, shell: false, size: 1, great: false, dark: false,
    // barrage (Armageddon): waves x perWave meteors, the wave in pts, which have spawned / were led
    waves: 0, perWave: 0, waveGap: 0, glowAt: 0, crater: 0, wave: -1, wx: 0, wz: 0, ledLast: -9, skyDone: false,
    fin: null, finDone: false, finAt: 0, pts: null, spawned: null, ledMask: 0, rng: null,
    fallY: 0, lead2: 0, ledGap: 0, safeR: 12, cover: 0.45,
    // the sky over it (skyFx.skyDeck): from deckAt s, spreading over the frame in deckGrow s from (dcx, dcz)
    deckAt: 0, deckGrow: 0, dcx: 0, dcz: 0,
    // emitters
    count: 0, done: 0, first: 0, span: 0, warn: 0, warnLed: 0, ledEvery: 0, lo: 0, hi: 0, every: 0, until: 0,
    lead: 0, linkFirst: false,
    // the trail from the wyrm (fireTrails.js): a crack's origin and head, its run; a laid wall; a meteor's arc
    trail: null, crack: false, cx: 0, cz: 0, hx: 0, hz: 0, arrived: false, arriveT: 0, firstAt: -1,
    lay: false, layS: 0, layAt: 0, laySpeed: 0, rx0: 0, rz0: 0, rx1: 0, rz1: 0, rAt: 0, rSpeed: 0, lfA: 0, lfB: 0, lob: 0,
    // burning pools a line of pillars / a chase leaves (s, radius; ticks: tickDamage / tickBurn)
    pool: 0, poolR: 0,
    // fx scratch (accumulators, held sprites, scorch-heat stamp timer, pillars burst bitmask, lights)
    hold: 0, acc: 0, acc2: 0, acc3: 0, acc4: 0, heatT: 0, seed: 0, mask: 0,
    l0: null, l1: null, l2: null,
  };
}

export class Hazards {
  constructor(dragon) {
    this.d = dragon;
    this.game = dragon.game;
    this.list = Array.from({ length: MAX }, (_, i) => blank(i));
    this.groups = Array.from({ length: MAX_GROUPS }, () => ({ hits: 0, max: 1e9 }));
    this._g = 0;
    this._serial = 0;
    this._next = 0;
    this._phase = dragon.phase;
    this.alive = 0;
    // reused hit record (hitPlayer copies what it keeps)
    this._from = { x: 0, z: 0 };
    this._pt = { x: 0, y: 0, z: 0 };
    this._hit = {
      damage: 0, from: this._from, knockback: 0, knockdown: false, kind: '', burn: 0,
      tell: TELL.RED, parryable: false, blockable: false, attack: '', plunge: false, point: this._pt,
    };
  }

  get player() {
    return this.game.player;
  }

  /** Live hazards of `kind` (or of every kind), emitters included. */
  count(kind = null) {
    let n = 0;
    for (const h of this.list) if (h.alive && (!kind || h.kind === kind)) n++;
    return n;
  }

  /** The live hazard spawned as (slot, id), or null (gone or recycled). */
  get(ref) {
    const h = ref && this.list[ref.slot];
    return h && h.alive && h.id === ref.id ? h : null;
  }

  /** A hit cap shared by several hazards (a rain, a barrage, a chase): returns its index. */
  group(max) {
    const i = this._g;
    this._g = (this._g + 1) % MAX_GROUPS;
    const g = this.groups[i];
    g.hits = 0;
    g.max = max > 0 ? max : 1e9;
    return i;
  }

  clear() {
    for (const h of this.list) if (h.alive) this._kill(h);
    skyReset(this.d.fx);
    trailReset(this.d.fx);
    for (const g of this.groups) g.hits = 0;
    this.alive = 0;
  }

  // ------------------------------------------------------------------ spawning
  _take(shape, o) {
    let h = null;
    for (let k = 0; k < MAX && !h; k++) {
      const c = this.list[(this._next + k) % MAX];
      if (!c.alive) h = c;
    }
    if (!h) return null; // pool full: the hazard is dropped (never throws)
    this._next = (h.slot + 1) % MAX;
    const slot = h.slot;
    Object.assign(h, blank(slot)); // (spawns are rare: a fresh record keeps every field honest)
    h.id = ++this._serial;
    h.alive = true;
    h.shape = shape;
    h.kind = o.kind ?? 'hazard';
    h.attack = o.attack ?? 'hazard';
    h.damage = num(o.damage, 0);
    h.burn = num(o.burn, 0);
    h.knockback = num(o.knockback, 0);
    h.knockdown = !!o.knockdown;
    // plunge: true = a perfect dodge of this hazard's blow may send the hero onto the wyrm's head (fire
    // the wyrm breathes or spits from the air: the strafe's front, the hover barrage's shells). Spells
    // that fall from the sky or burst from the ground (meteors, pillars, rings, walls) never do.
    h.plunge = o.plunge === true;
    // noBlow: the hazard deals no blow and sends no cue (a strip set burning by a fire blow: only its
    // contact ticks; a cinder falling beyond the hero's reach: fire on the field). Its fire is drawn as ever
    h.noBlow = o.noBlow === true;
    h.announce = o.announce !== false && !h.noBlow;
    h.group = Number.isInteger(o.group) ? o.group : -1;
    h.impact = Math.max(0.05, num(o.delay, 1));
    h.seed = Math.random() * 100;
    this.alive++;
    return h;
  }

  _ref(h) {
    return h ? { slot: h.slot, id: h.id } : null;
  }

  /**
   * One blast at (x, z) radius r, `delay` s from now. kind 'meteor' (falls from `from` over the last
   * `fall` s), 'pillar' (a lava column), 'shell' (the barrage: the shell is drawn by DragonFx unless
   * `drawShell`). `active` s it keeps hitting after impact (a pillar's column).
   */
  circle(o) {
    const h = this._take(SHAPE.CIRCLE, o);
    if (!h) return null;
    h.x = num(o.x, 0);
    h.z = num(o.z, 0);
    h.r = Math.max(0.3, num(o.r, 3));
    h.active = Math.max(1 / 60, num(o.active, 0.1));
    h.fall = Math.max(0, num(o.fall, 0));
    h.shell = !!o.drawShell;
    const f = o.from;
    h.ox = num(f?.x, h.x);
    h.oy = num(f?.y, 0);
    h.oz = num(f?.z, h.z);
    h.size = Math.max(0.3, num(o.size, 1));
    h.great = !!o.great;
    h.dark = !!o.dark;
    h.lob = Math.max(0, num(o.lob, 0));
    // a meteor's crater may burn on (`craterBurn` s): blockable contact ticks like a burning strip
    // (2nd pass: a pillar may leave a burning pool too, and a 'pool' is only that: no blow of its own)
    h.linger = h.kind === 'meteor' || h.kind === 'pillar' || h.kind === 'pool' ? Math.max(0, num(o.craterBurn, 0)) : 0;
    if (h.kind === 'pool') h.hit = true;
    h.tick = 0.25;
    h.tickDamage = num(o.tickDamage, 0);
    h.tickBurn = num(o.tickBurn, 0);
    const linger = h.kind === 'pillar' ? Math.max(PILLAR_BURN + 0.6, h.linger) : h.kind === 'meteor' ? Math.max(CRATER, h.linger) : h.kind === 'pool' ? h.linger : 0.3;
    h.end = h.impact + h.active + linger;
    return this._ref(h);
  }

  /**
   * Fire front from A to B (unit dir, length) starting `delay` s from now at `speed` m/s, width w.
   * `noBlow: true`: the front deals no blow (ground a fire blow set burning: only the contact ticks).
   */
  strip(o) {
    const h = this._take(SHAPE.STRIP, o);
    if (!h) return null;
    h.ax = num(o.ax, 0);
    h.az = num(o.az, 0);
    const bx = num(o.bx, h.ax), bz = num(o.bz, h.az + 1);
    const l = Math.hypot(bx - h.ax, bz - h.az) || 1;
    h.dx = (bx - h.ax) / l;
    h.dz = (bz - h.az) / l;
    h.len = l;
    h.w = Math.max(0.5, num(o.w, 4));
    h.speed = Math.max(0.5, num(o.speed, 12));
    h.linger = Math.max(0, num(o.linger, 2.5));
    h.tick = Math.max(0.05, num(o.tick, 0.25));
    h.tickDamage = num(o.tickDamage, 0);
    h.tickBurn = num(o.tickBurn, 0);
    h.end = h.impact + h.len / h.speed + h.linger;
    return this._ref(h);
  }

  /** Ring of fire round (x, z): ignites at r0 `delay` s from now, expands at `speed` to r1, band w. */
  ring(o) {
    const h = this._take(SHAPE.RING, o);
    if (!h) return null;
    h.x = num(o.x, 0);
    h.z = num(o.z, 0);
    h.r0 = Math.max(0, num(o.r0, 2));
    h.r1 = Math.max(h.r0 + 1, num(o.r1, 20));
    h.speed = Math.max(0.5, num(o.speed, 10));
    h.w = Math.max(0.5, num(o.w, 2));
    h.f = h.r0;
    h.end = h.impact + (h.r1 - h.r0) / h.speed + FADE;
    return this._ref(h);
  }

  /** Wall of fire: centre (x, z), sweeping along unit (dx, dz) `dist` m at `speed`, length len, thickness w. */
  wall(o) {
    const h = this._take(SHAPE.WALL, o);
    if (!h) return null;
    h.x = num(o.x, 0);
    h.z = num(o.z, 0);
    const l = Math.hypot(num(o.dx, 0), num(o.dz, 1)) || 1;
    h.dx = num(o.dx, 0) / l;
    h.dz = num(o.dz, 1) / l;
    h.len = Math.max(2, num(o.len, 40));
    h.w = Math.max(0.5, num(o.w, 2.4));
    h.speed = Math.max(0.5, num(o.speed, 10));
    h.dist = Math.max(1, num(o.dist, 30));
    h.end = h.impact + h.dist / h.speed + FADE;
    // laid from the wyrm's fire (`lay` { s, at, speed, run? { x, z, at, speed } }): its warning shows
    // only over the stretch laid so far, which grows both ways from `s` (m along it from its centre)
    // from `at` s at `speed` m/s; fast enough to be laid whole by its ignition
    const L = o.lay;
    if (L && Number.isFinite(num(L.s, NaN))) {
      const half = h.len / 2;
      h.lay = true;
      h.layS = clamp(num(L.s, 0), -half, half);
      h.layAt = clamp(num(L.at, 0), 0, h.impact);
      const far = half + Math.abs(h.layS);
      h.laySpeed = Math.max(num(L.speed, 45), far / Math.max(0.1, h.impact - h.layAt - 0.05));
      const R = L.run;
      if (R && Number.isFinite(num(R.x, NaN) + num(R.z, NaN))) {
        const qx = -h.dz, qz = h.dx;
        h.rx0 = num(R.x, 0);
        h.rz0 = num(R.z, 0);
        h.rx1 = h.x + qx * h.layS;
        h.rz1 = h.z + qz * h.layS;
        h.rAt = Math.max(0, num(R.at, 0));
        h.rSpeed = Math.max(1, num(R.speed, 30));
      }
    }
    return this._ref(h);
  }

  /** Lava pillars at A + dir * k * step (k < n), pillar k erupting `delay + k * stagger` s from now. */
  line(o) {
    const h = this._take(SHAPE.LINE, o);
    if (!h) return null;
    h.ax = num(o.ax, 0);
    h.az = num(o.az, 0);
    const l = Math.hypot(num(o.dx, 0), num(o.dz, 1)) || 1;
    h.dx = num(o.dx, 0) / l;
    h.dz = num(o.dz, 1) / l;
    h.n = clamp(Math.round(num(o.n, 5)), 1, 30);
    h.step = Math.max(0.5, num(o.step, 3));
    h.r = Math.max(0.3, num(o.r, 2.4));
    h.delay = Math.max(0, num(o.stagger, 0.1));
    h.active = Math.max(1 / 60, num(o.active, 0.3));
    h.pool = Math.max(0, num(o.pool, 0));
    h.poolR = Math.max(0.3, num(o.poolR, h.r * 0.8));
    h.tickDamage = num(o.tickDamage, 0);
    h.tickBurn = num(o.tickBurn, 0);
    h.end = h.impact + (h.n - 1) * h.delay + PILLAR_BURN + 0.6;
    // a crack from (cx, cz) (the slam) whose head reaches each pillar as it bursts
    if (o.crack && Number.isFinite(num(o.cx, NaN) + num(o.cz, NaN))) {
      h.crack = true;
      h.cx = h.hx = num(o.cx, 0);
      h.cz = h.hz = num(o.cz, 0);
    }
    return this._ref(h);
  }

  /**
   * Meteor rain (emitter): `count` meteors whose impacts spread over `span` s from `first` s on; every
   * `ledEvery`-th one lands on the hero's led position (rings `warnLed` s), the rest `lo`-`hi` m round
   * him (rings `warn` s). Meteors share `group` (hit cap) and announce themselves.
   */
  rain(o) {
    const h = this._take(SHAPE.RAIN, { ...o, delay: 0.05, announce: false });
    if (!h) return null;
    h.kind = 'rain';
    h.count = clamp(Math.round(num(o.count, 10)), 1, 30);
    h.first = Math.max(0.2, num(o.first, 1.3));
    h.span = Math.max(0, num(o.span, 5));
    h.warn = Math.max(0.6, num(o.warn, 1.5));
    h.warnLed = Math.max(0.6, num(o.warnLed, 1.1));
    h.ledEvery = Math.max(1, Math.round(num(o.ledEvery, 3)));
    h.lo = Math.max(0, num(o.lo, 4));
    h.hi = Math.max(h.lo, num(o.hi, 14));
    h.r = Math.max(0.5, num(o.r, 3.4));
    h.fall = Math.max(0.2, num(o.fall, 0.75));
    h.group = Number.isInteger(o.group) ? o.group : -1;
    h.end = h.first + h.span + 0.2; // (all spawned by then; the meteors live on their own)
    return this._ref(h);
  }

  /**
   * Armageddon (emitter, ADR-053): `waves` x `perWave` meteors, wave w's j-th landing `first + w x
   * waveGap + j x stagger` s from now over the whole clearing (placeWave: even cover, no two
   * overlapping by more than a third, the hero's safe ground kept), each heating its ground `warn` s
   * (led ones `warnLed` s: every `ledEvery`-th onto the hero's led position, never two led impacts
   * within `ledGap` s, see leadInto) and falling `fall` s on a slant from `fallY` m above the wyrm;
   * `crater` s of burning craters (tickDamage). `finale` { delay, radius, warn, damage, burn, knockback,
   * fall, size }: `delay` s after the last wave one great meteor on the hero (no hit cap). From
   * `glowAt` s the sky glows orange over the clearing (world.atmosphere.skyGlow) until the finale
   * lands. Meteors share `group` (hit cap) and announce themselves.
   */
  barrage(o) {
    const h = this._take(SHAPE.BARRAGE, { ...o, delay: 0.05, announce: false });
    if (!h) return null;
    h.kind = 'barrage';
    h.waves = clamp(Math.round(num(o.waves, 3)), 1, 6);
    h.perWave = clamp(Math.round(num(o.perWave, 8)), 1, 12);
    h.waveGap = Math.max(0.3, num(o.waveGap, 1.6));
    h.delay = Math.max(0, num(o.stagger, 0.12)); // (the stagger inside a wave)
    h.first = Math.max(0.6, num(o.first, 3.9));
    h.glowAt = Math.max(0, num(o.glowAt, 1.6));
    h.warn = Math.max(0.6, num(o.warn, 1.5));
    h.warnLed = Math.max(0.6, num(o.warnLed, 1.2));
    h.ledEvery = Math.max(1, Math.round(num(o.ledEvery, 3)));
    h.ledGap = Math.max(0, num(o.ledGap, 0.5));
    h.lead2 = Math.max(0, num(o.lead, 0.5));
    h.r = Math.max(0.5, num(o.r, 3.4));
    h.fall = Math.max(0.2, num(o.fall, 0.9));
    h.fallY = Math.max(5, num(o.fallY, 34));
    h.size = Math.max(0.3, num(o.size, 1.3));
    h.crater = Math.max(0, num(o.crater, 0));
    h.tickDamage = num(o.tickDamage, 0);
    h.tickBurn = num(o.tickBurn, 0);
    h.safeR = Math.max(1, num(o.safeR, 12));
    h.cover = clamp(num(o.cover, 0.45), 0.05, 1);
    h.group = Number.isInteger(o.group) ? o.group : -1;
    h.pts = new Float64Array(h.perWave * 2);
    h.spawned = new Uint8Array(h.waves * h.perWave);
    let seed = (Math.random() * 4294967296) >>> 0;
    h.rng = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const last = h.first + (h.waves - 1) * h.waveGap + (h.perWave - 1) * h.delay;
    const F = o.finale;
    h.fin = F ? { r: Math.max(0.5, num(F.radius, 7)), warn: Math.max(0.6, num(F.warn, 2)), damage: num(F.damage, 34), burn: num(F.burn, 2), knockback: num(F.knockback, 7), fall: Math.max(0.2, num(F.fall, 1.1)), size: Math.max(0.3, num(F.size, 2.4)) } : null;
    h.finAt = last + (F ? Math.max(0.3, num(F.delay, 1.2)) : 0);
    h.end = h.finAt + 1.0; // (the sky fades as the last one lands; the meteors live on their own)
    h.deckAt = Math.max(0, num(o.deckAt, h.glowAt));
    h.deckGrow = Math.max(0, num(o.deckGrow, 0.8));
    h.dcx = num(o.cx, this.d.position.x);
    h.dcz = num(o.cz, this.d.position.z);
    return this._ref(h);
  }

  /** Pillar chase (emitter): every `every` s for `until` s a pillar rings under the led hero, erupting `warn` s later. */
  chase(o) {
    const h = this._take(SHAPE.CHASE, { ...o, delay: 0.05, announce: false });
    if (!h) return null;
    h.kind = 'chase';
    h.every = Math.max(0.15, num(o.every, 0.42));
    h.until = Math.max(0, num(o.until, 3));
    h.warn = Math.max(0.6, num(o.warn, 0.7));
    h.lead = Math.max(0, num(o.lead, 0.3));
    h.r = Math.max(0.3, num(o.r, 2.4));
    h.active = Math.max(1 / 60, num(o.active, 0.3));
    h.group = Number.isInteger(o.group) ? o.group : -1;
    h.linkFirst = !!o.linkFirst; // the first pillar is covered by the attack's own beat
    h.pool = Math.max(0, num(o.pool, 0)); // each pillar burns on this long (s)
    h.tickDamage = num(o.tickDamage, 0);
    h.tickBurn = num(o.tickBurn, 0);
    h.acc = 0; // s until the next pillar
    h.end = h.until + 0.05;
    // a crack from (cx, cz) (the slam): its head runs out to the led hero at TC.speed (the pillars
    // wait for it: the first is laid where it catches him), then follows him and each pillar bursts
    // at its head; `until` counts from the catch
    if (o.crack && Number.isFinite(num(o.cx, NaN) + num(o.cz, NaN))) {
      h.crack = true;
      h.cx = h.hx = num(o.cx, 0);
      h.cz = h.hz = num(o.cz, 0);
      h.end = TC.maxRun + h.until + 0.05;
    }
    return this._ref(h);
  }

  /** Stop a strip's fire front where it is (the wyrm was knocked out of its pass); the burnt part lingers. */
  cutStrip(ref) {
    const h = this.get(ref);
    if (!h || h.shape !== SHAPE.STRIP) return;
    const f = clamp((h.t - h.impact) * h.speed, 0, h.len);
    h.len = Math.max(0.01, f);
    h.end = Math.min(h.end, h.t + h.linger);
  }

  /**
   * Take back a hazard that has not gone off yet (a flying combo knocked out of the air: the strip it
   * had not started breathing, the shells it had not spat). A burning strip or a fired circle stays.
   */
  cancel(ref) {
    const h = this.get(ref);
    if (!h) return;
    if ((h.shape === SHAPE.STRIP && h.t < h.impact) || (h.shape === SHAPE.CIRCLE && !h.fired)) this._kill(h);
  }

  // ------------------------------------------------------------------ timing (attack beats re-time on this)
  /**
   * Seconds from now until hazard `ref` reaches the point (px, pz) moving at (vx, vz) (the hero), or
   * until it ends if it never would. Used by the spawning attack to re-time its own timing flash.
   */
  timeTo(ref, px, pz, vx = 0, vz = 0, pr = 0.45) {
    const h = this.get(ref);
    if (!h) return 0;
    const t0 = h.impact - h.t; // to ignition (may be < 0)
    const left = Math.max(0, h.end - h.t);
    switch (h.shape) {
      case SHAPE.STRIP: {
        const s = (px - h.ax) * h.dx + (pz - h.az) * h.dz;
        const vs = vx * h.dx + vz * h.dz;
        const run = h.len / h.speed;
        if (s <= pr) return Math.max(0, t0);
        if (s >= h.len + pr) return Math.max(0, t0 + run);
        const tau = (s - pr - (h.t - h.impact) * h.speed) / Math.max(0.5, h.speed - vs);
        return clamp(tau, Math.max(0, t0), Math.max(0, t0 + run));
      }
      case SHAPE.RING: {
        const ex = px - h.x, ez = pz - h.z, dist = Math.hypot(ex, ez) || 1e-3;
        const vr = (vx * ex + vz * ez) / dist;
        const edge = h.w / 2 + pr;
        const tau = dist - h.r0 - edge <= 0 ? t0 : (dist - h.r0 - edge + t0 * h.speed) / Math.max(0.5, h.speed - vr);
        return clamp(tau, Math.max(0, t0), Math.max(0, t0 + (h.r1 - h.r0) / h.speed));
      }
      case SHAPE.WALL: {
        const s = (px - h.x) * h.dx + (pz - h.z) * h.dz;
        const vs = vx * h.dx + vz * h.dz;
        const edge = h.w / 2 + pr;
        const tau = s - edge <= 0 ? t0 : (s - edge + t0 * h.speed) / Math.max(0.5, h.speed - vs);
        return clamp(tau, Math.max(0, t0), Math.max(0, t0 + h.dist / h.speed));
      }
      case SHAPE.LINE: {
        const s = (px - h.ax) * h.dx + (pz - h.az) * h.dz;
        const k = clamp(Math.round(s / h.step), 0, h.n - 1);
        return Math.max(0, t0 + k * h.delay);
      }
      case SHAPE.CIRCLE:
        return Math.max(0, t0);
      case SHAPE.CHASE: {
        // (the crack: until it has caught him, its run to him plus the pillar's warning)
        if (!h.crack) return Math.max(0, h.warn - h.t);
        if (h.firstAt >= 0) return Math.max(0, h.firstAt - h.t);
        const run = Math.max(0, Math.hypot(px + vx * h.lead - h.hx, pz + vz * h.lead - h.hz) - TC.arrive) / TC.speed;
        return Math.min(run, Math.max(0, TC.maxRun - h.t)) + h.warn;
      }
      default:
        return left;
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (!(dt > 0)) return;
    skyUpdate(this.d.fx, dt); // (the salvo's columns and the sky deck: skyFx.js, guarded on its own)
    trailUpdate(this.d.fx, dt); // (the cracks and runners cooling: fireTrails.js, guarded on its own)
    try {
      this._update(dt);
    } catch (err) {
      // never freeze the frame: a broken hazard is dropped, the rest keep going next frame
      console.error('[dragon] hazards update failed', err);
      this.clear();
    }
  }

  _update(dt) {
    const d = this.d;
    // phase transitions, death and resets clear the field
    if (d.phase !== this._phase) {
      this._phase = d.phase;
      this.clear();
    }
    if (d.state === 'dying' || d.state === 'dead' || d.state === 'sleeping') {
      if (this.alive) this.clear();
      return;
    }
    if (!this.alive) return;
    const p = this.player?.position;
    const px = p && Number.isFinite(p.x) ? p.x : 1e6, pz = p && Number.isFinite(p.z) ? p.z : 1e6;
    let n = 0;
    for (let i = 0; i < MAX; i++) {
      const h = this.list[i];
      if (!h.alive) continue;
      h.t += dt;
      switch (h.shape) {
        case SHAPE.CIRCLE:
          this._circle(h, dt, px, pz);
          break;
        case SHAPE.STRIP:
          this._strip(h, dt, px, pz);
          break;
        case SHAPE.RING:
          this._ring(h, dt, px, pz);
          break;
        case SHAPE.WALL:
          this._wall(h, dt, px, pz);
          break;
        case SHAPE.LINE:
          this._line(h, dt, px, pz);
          break;
        case SHAPE.RAIN:
          this._rain(h, px, pz);
          break;
        case SHAPE.CHASE:
          this._chase(h, dt, px, pz);
          break;
        case SHAPE.BARRAGE:
          this._barrage(h, px, pz);
          break;
      }
      if (h.alive && h.t >= h.end) this._kill(h);
      if (h.alive) n++;
    }
    this.alive = n;
  }

  _kill(h) {
    h.alive = false;
    if (h.trail) trailRelease(this.d.fx, h.trail);
    h.trail = null;
    h.l0?.kill?.();
    h.l1?.kill?.();
    h.l2?.kill?.();
    h.l0 = h.l1 = h.l2 = null;
  }

  // ------------------------------------------------------------------ hits
  _pr() {
    return this.player?.radius ?? 0.45;
  }

  _capped(h) {
    return h.group >= 0 && this.groups[h.group].hits >= this.groups[h.group].max;
  }

  /** The hazard's one blow (red, unblockable, i-frames dodge it, never a plunge). */
  _blow(h, fx, fz, y = 0.8) {
    h.hit = true;
    if (h.noBlow || this._capped(h)) return RESULT.IGNORED;
    const o = this._hit;
    o.damage = h.damage;
    o.knockback = h.knockback;
    o.knockdown = h.knockdown;
    o.kind = h.kind;
    o.burn = h.burn;
    o.tell = TELL.RED;
    o.parryable = false;
    o.blockable = false;
    o.attack = h.attack;
    o.plunge = h.plunge === true;
    this._from.x = fx;
    this._from.z = fz;
    const p = this.player.position;
    this._pt.x = p.x;
    this._pt.y = y;
    this._pt.z = p.z;
    const r = this.d.hitPlayer(o, null);
    if (r === RESULT.HIT && h.group >= 0) this.groups[h.group].hits++;
    return r;
  }

  /** Lingering fire: blockable contact damage (like the breath's stream), skipped while the hero rolls. */
  _tick(h, fx, fz) {
    const p = this.player;
    if (!p || p.alive === false || p.state === 'roll' || p.isInvulnerable?.()) return;
    const o = this._hit;
    o.damage = h.tickDamage;
    o.knockback = 0;
    o.knockdown = false;
    o.kind = 'fire';
    o.burn = h.tickBurn;
    o.tell = TELL.NORMAL;
    o.parryable = false;
    o.blockable = true;
    o.attack = h.attack;
    o.plunge = false;
    this._from.x = fx;
    this._from.z = fz;
    this._pt.x = p.position.x;
    this._pt.y = 0.5;
    this._pt.z = p.position.z;
    this.d.hitPlayer(o, null);
  }

  // ------------------------------------------------------------------ tells (self-announcing circles)
  _announce(h, x, z, near) {
    const lead = TUNING.flashLead;
    const left = h.impact - h.t;
    if (!h.told && left > 0 && near) {
      h.told = true;
      this.d.emit('combat:tell', { source: 'dragon', attack: h.attack, tell: TELL.RED, impactIn: Math.max(0.05, left), x, z, hazard: true });
    }
    if (h.told && !h.flashed && left <= lead + 1e-6) {
      h.flashed = true;
      this.d.emit('combat:flash', { source: 'dragon', attack: h.attack, tell: TELL.RED, x, y: 0.6, z, hazard: true });
      this.d.fx.hazardFlash(x, z, h.r);
    }
  }

  // ------------------------------------------------------------------ shapes
  _circle(h, dt, px, pz) {
    const fx = this.d.fx;
    const left = h.impact - h.t;
    const pr = this._pr();
    const dist = Math.hypot(px - h.x, pz - h.z);
    if (h.announce) this._announce(h, h.x, h.z, dist <= h.r + pr + ANNOUNCE_PAD);
    const life = fx.holdLife(h, dt);
    if (left > 0) {
      // the ground heats up until impact (its edge shows in the last flashLead s), the projectile
      const k = clamp(1 - left / Math.max(0.3, h.impact), 0, 1);
      fx.heatDisc(life, h, dt, h.x, h.z, h.r, k, h.flashed || left <= TUNING.flashLead, h.seed, h.kind === 'pillar' ? 1 : 0);
      if (h.kind === 'pillar') fx.pillarRumble(h, dt, h.x, h.z, h.r, k);
      if (h.fall > 0 && left <= h.fall) {
        if (!h.fell) {
          h.fell = true;
          if (h.kind === 'meteor') this.d.emit('dragon:hazard', { kind: 'meteor', stage: 'fall', x: h.x, z: h.z, radius: h.r });
        }
        const u = 1 - left / h.fall;
        const e = u * (0.75 + 0.25 * u); // a little acceleration
        if (h.kind === 'meteor') {
          // (from its source: an arc, `lob` m over the straight line, its tail along the way it goes)
          const de = 0.75 + 0.5 * u, arc = h.lob * 4 * u * (1 - u);
          skyMeteor(fx, life, h, dt, h.ox + (h.x - h.ox) * e, h.oy * (1 - e) + arc, h.oz + (h.z - h.oz) * e, (h.x - h.ox) * de, -h.oy * de + h.lob * 4 * (1 - 2 * u), (h.z - h.oz) * de, h.size);
        }
        else if (h.shell) fx.meteor(life, h, dt, h.ox + (h.x - h.ox) * e, h.oy * (1 - e), h.oz + (h.z - h.oz) * e, h.x - h.ox, -h.oy, h.z - h.oz, false);
      }
      return;
    }
    if (!h.fired) {
      h.fired = true;
      if (h.announce && !h.flashed && h.told) this._announce(h, h.x, h.z, true); // (late tell: flash now)
      if (h.kind === 'meteor') skyImpact(fx, h, h.x, h.z, h.r);
      else if (h.kind === 'pillar') fx.pillarBurst(h, h.x, h.z, h.r);
      else if (h.shell) fx.shellImpact(h.x, h.z, h.r);
      if (h.kind === 'meteor' || h.kind === 'pillar') this.d.emit('dragon:hazard', { kind: h.kind, stage: 'hit', x: h.x, z: h.z, radius: h.r });
    }
    const since = h.t - h.impact;
    if (!h.hit && since <= h.active + 1e-6 && dist <= h.r + pr) this._blow(h, h.x, h.z);
    // a burning crater (Armageddon, P3): contact ticks once the blow is over, never while rolling
    const burning = h.linger > 0 && since < h.linger;
    if (burning && since > h.active && h.tickDamage > 0) {
      h.tickT -= dt;
      if (h.tickT <= 0) {
        h.tickT = h.tick;
        if (dist <= h.r * 0.8 + pr) this._tick(h, h.x, h.z);
      }
    }
    if (h.kind === 'meteor') skyCrater(fx, h, dt, h.x, h.z, h.r, clamp(1 - since / Math.max(CRATER, h.linger), 0, 1), burning);
    else if (h.kind === 'pillar') {
      if (since < PILLAR_BURN) fx.pillarBurn(h, dt, h.x, h.z, h.r, clamp(1 - since / PILLAR_BURN, 0, 1));
      else if (burning) fx.crater(h, dt, h.x, h.z, h.r * 0.8, clamp(1 - since / h.linger, 0.3, 1), true);
    } else if (h.kind === 'pool' && burning) fx.crater(h, dt, h.x, h.z, h.r, clamp(1 - since / h.linger, 0.3, 1), true);
  }

  _strip(h, dt, px, pz) {
    const fx = this.d.fx;
    const pr = this._pr();
    const run = h.t - h.impact;
    const f = clamp(run * h.speed, 0, h.len);
    const b0 = clamp((run - h.linger) * h.speed, 0, h.len); // start of the part still burning
    const life = fx.holdLife(h, dt);
    // the ground heats up ahead of the front; flames behind it
    if (f < h.len) fx.stripWarn(life, h, dt, f, clamp(1 - Math.max(0, -run) / Math.max(0.3, h.impact), 0, 1), run > -TUNING.flashLead);
    if (run > 0) fx.stripFire(h, dt, b0, f, run < h.len / h.speed);
    const ex = px - h.ax, ez = pz - h.az;
    const s = ex * h.dx + ez * h.dz;
    const l = Math.abs(ex * h.dz - ez * h.dx);
    const inW = l <= h.w / 2 + pr;
    const ox = h.ax + h.dx * clamp(s, 0, h.len), oz = h.az + h.dz * clamp(s, 0, h.len);
    // the front passing over the hero (swept from last frame's front)
    if (!h.hit && run > 0 && f > h.f && inW && s >= h.f - pr && s <= f + pr) {
      this._blow(h, ox - h.dz * 0.01, oz + h.dx * 0.01);
      h.tickT = h.tick;
    }
    h.f = f;
    // lingering fire: contact ticks while standing in the burnt part
    if (run > 0 && h.tickDamage > 0) {
      h.tickT -= dt;
      if (h.tickT <= 0) {
        h.tickT = h.tick;
        if (inW && s >= b0 - pr && s <= f + pr && b0 < f) this._tick(h, ox, oz);
      }
    }
    if (run > 0 && !h.l0) {
      // (ground a fire blow set burning, noBlow: one low light. A string lays two to four of them at
      // once and the grass they light brings its own: with two bright lights each they flooded the field)
      h.l0 = h.noBlow ? fx.hazardLight(h.ax, h.az, [1, 0.45, 0.12], 1.8, 7) : fx.hazardLight(h.ax, h.az, [1, 0.45, 0.12], 3.2, 10);
      if (!h.noBlow) h.l1 = fx.hazardLight(h.ax, h.az, [1, 0.4, 0.1], 2.6, 9);
    }
    if (h.l0) {
      const a = b0 + (f - b0) * 0.75, c = b0 + (f - b0) * 0.25;
      h.l0.set(h.ax + h.dx * a, 1.2, h.az + h.dz * a);
      h.l1?.set(h.ax + h.dx * c, 1.2, h.az + h.dz * c);
      if (b0 >= f - 1e-3 && run > 0.1) {
        h.l0.kill();
        h.l1?.kill();
      }
    }
  }

  _ring(h, dt, px, pz) {
    const fx = this.d.fx;
    const pr = this._pr();
    const run = h.t - h.impact;
    const life = fx.holdLife(h, dt);
    if (run < 0) {
      fx.ringWarn(life, h, dt, clamp(1 - -run / Math.max(0.3, h.impact), 0, 1), -run <= TUNING.flashLead);
      return;
    }
    const r = Math.min(h.r1, h.r0 + run * h.speed);
    const fading = h.r0 + run * h.speed >= h.r1;
    fx.ringFire(life, h, dt, r, fading ? clamp(1 - (h.t - (h.impact + (h.r1 - h.r0) / h.speed)) / FADE, 0, 1) : 1);
    if (!h.l0) {
      h.l0 = fx.hazardLight(h.x, h.z, [1, 0.45, 0.12], 4, 12);
      h.l1 = fx.hazardLight(h.x, h.z, [1, 0.42, 0.1], 4, 12);
      h.l2 = fx.hazardLight(h.x, h.z, [1, 0.42, 0.1], 4, 12);
    }
    // three lights ride the band (the side toward the hero first)
    const a0 = Math.atan2(pz - h.z, px - h.x);
    for (let k = 0; k < 3; k++) {
      const l = h[k === 0 ? 'l0' : k === 1 ? 'l1' : 'l2'];
      const a = a0 + (k - 1) * 1.1;
      l?.set(h.x + Math.cos(a) * r, 1.0, h.z + Math.sin(a) * r);
    }
    if (!h.hit && !fading) {
      const dist = Math.hypot(px - h.x, pz - h.z);
      const edge = h.w / 2 + pr;
      if (dist >= h.f - edge && dist <= r + edge) {
        const k = dist > 1e-3 ? 1 / dist : 0;
        this._blow(h, px - (px - h.x) * k * 0.5, pz - (pz - h.z) * k * 0.5);
      }
    }
    h.f = r;
  }

  _wall(h, dt, px, pz) {
    const fx = this.d.fx;
    const pr = this._pr();
    const run = h.t - h.impact;
    const life = fx.holdLife(h, dt);
    if (run < 0) {
      const k = clamp(1 - -run / Math.max(0.3, h.impact), 0, 1), hot = -run <= TUNING.flashLead;
      if (h.lay) this._lay(h, dt, life, k, hot);
      else fx.wallWarn(life, h, dt, k, hot);
      return;
    }
    if (h.trail) {
      trailRelease(fx, h.trail);
      h.trail = null;
    }
    const s = Math.min(h.dist, run * h.speed);
    const fading = run * h.speed >= h.dist;
    const cx = h.x + h.dx * s, cz = h.z + h.dz * s;
    fx.wallFire(life, h, dt, cx, cz, fading ? clamp(1 - (run - h.dist / h.speed) / FADE, 0, 1) : 1);
    if (!h.l0) {
      h.l0 = fx.hazardLight(cx, cz, [1, 0.45, 0.12], 4.5, 13);
      h.l1 = fx.hazardLight(cx, cz, [1, 0.42, 0.1], 3.5, 11);
      h.l2 = fx.hazardLight(cx, cz, [1, 0.42, 0.1], 3.5, 11);
    }
    const qx = -h.dz, qz = h.dx; // along the wall
    const pl = (px - h.x) * qx + (pz - h.z) * qz;
    const lc = clamp(pl, -h.len / 2, h.len / 2);
    h.l0?.set(cx + qx * lc, 1.4, cz + qz * lc);
    h.l1?.set(cx + qx * (lc - 9), 1.4, cz + qz * (lc - 9));
    h.l2?.set(cx + qx * (lc + 9), 1.4, cz + qz * (lc + 9));
    if (!h.hit && !fading && Math.abs(pl) <= h.len / 2 + pr) {
      const sp = (px - h.x) * h.dx + (pz - h.z) * h.dz;
      const edge = h.w / 2 + pr;
      if (sp >= h.f - edge && sp <= s + edge) this._blow(h, px - h.dx, pz - h.dz);
    }
    h.f = s;
  }

  /** A laid wall before its ignition: the runner carrying the fire to its line, the stretch laid so far, its ends burning. */
  _lay(h, dt, life, k, hot) {
    const fx = this.d.fx;
    const half = h.len / 2, qx = -h.dz, qz = h.dx;
    if (h.rSpeed > 0 && h.t >= h.rAt && h.t < h.layAt + 0.05) {
      // (?wallSource=b: the fire runs over the ground from the breath's strike to the line)
      if (!h.trail) h.trail = trailStart(fx, h.rx0, h.rz0, 'runner');
      const L = Math.hypot(h.rx1 - h.rx0, h.rz1 - h.rz0) || 1;
      const u = clamp(((h.t - h.rAt) * h.rSpeed) / L, 0, 1);
      trailHead(fx, h.trail, h.rx0 + (h.rx1 - h.rx0) * u, h.rz0 + (h.rz1 - h.rz0) * u);
    }
    if (h.t < h.layAt) return;
    const e = (h.t - h.layAt) * h.laySpeed;
    const lo = Math.max(-half, h.layS - e), hi = Math.min(half, h.layS + e);
    if (!(hi > lo)) return;
    fx.heatBand(life, h, dt, h.x - qx * half, h.z - qz * half, qx, qz, lo + half, hi + half, h.w / 2, k, hot, h.seed);
    if (lo > -half) layFront(fx, h, 'lfA', dt, h.x + qx * lo, h.z + qz * lo, 1);
    if (hi < half) layFront(fx, h, 'lfB', dt, h.x + qx * hi, h.z + qz * hi, 1);
  }

  /** Where a crack's head is `tt` s into a line (it reaches pillar k just as it bursts), into _src. */
  _lineHead(h, tt) {
    const lead = 0.02; // (s: the head gets to a pillar just before it bursts)
    const t0 = Math.max(0.05, h.impact - lead);
    if (tt <= t0) {
      const u = clamp(tt / t0, 0, 1);
      _src.x = h.cx + (h.ax - h.cx) * u;
      _src.z = h.cz + (h.az - h.cz) * u;
      return;
    }
    const k = h.delay > 0 ? (tt - t0) / h.delay : h.n;
    const s = clamp(k, 0, h.n - 1) * h.step;
    _src.x = h.ax + h.dx * s;
    _src.z = h.az + h.dz * s;
  }

  _line(h, dt, px, pz) {
    const fx = this.d.fx;
    const pr = this._pr();
    const life = fx.holdLife(h, dt);
    if (h.crack) {
      if (!h.trail && !h.arrived) {
        h.trail = trailStart(fx, h.cx, h.cz, 'crack');
        h.arrived = !h.trail; // (no free trail: none, never again)
      }
      if (h.trail) {
        this._lineHead(h, h.t);
        h.hx = _src.x;
        h.hz = _src.z;
        trailHead(fx, h.trail, h.hx, h.hz);
        if (h.t >= h.impact + (h.n - 1) * h.delay) {
          trailRelease(fx, h.trail);
          h.trail = null;
          h.arrived = true;
        }
      }
    }
    let burst = false;
    for (let k = 0; k < h.n; k++) {
      const x = h.ax + h.dx * k * h.step, z = h.az + h.dz * k * h.step;
      const ik = h.impact + k * h.delay;
      const left = ik - h.t;
      if (left > 0) {
        const kk = clamp(1 - left / Math.max(0.3, ik), 0, 1);
        fx.heatDisc(life, h, dt, x, z, h.r, kk, left <= TUNING.flashLead, h.seed + k * 13.1, 1);
        fx.pillarRumble(h, dt, x, z, h.r, kk);
        continue;
      }
      const bit = 1 << k;
      if (!(h.mask & bit)) {
        h.mask |= bit;
        fx.pillarBurst(h, x, z, h.r);
        burst = true;
        // (2nd pass) the pillar's ground burns on: a pool, contact ticks, no blow
        if (h.pool > 0) this.circle({ kind: 'pool', attack: h.attack, x, z, r: h.poolR, delay: PILLAR_BURN * 0.6, craterBurn: h.pool, tickDamage: h.tickDamage, tickBurn: h.tickBurn, announce: false });
      }
      const since = -left;
      if (!h.hit && since <= h.active + 1e-6 && Math.hypot(px - x, pz - z) <= h.r + pr) this._blow(h, x, z);
      if (since < PILLAR_BURN) fx.pillarBurn(h, dt, x, z, h.r, clamp(1 - since / PILLAR_BURN, 0, 1));
    }
    // (one sound cue per frame for the pillars bursting together)
    if (burst) this.d.emit('dragon:hazard', { kind: 'pillar', stage: 'hit', x: h.ax, z: h.az, radius: h.r });
  }

  _rain(h, px, pz) {
    const d = this.d;
    const n = h.count;
    for (let i = 0; i < n; i++) {
      const bit = 1 << i;
      if (h.mask & bit) continue;
      const led = i % h.ledEvery === 0;
      const jit = (hash(h.seed, i) - 0.5) * 0.3;
      const impact = h.first + (n > 1 ? (h.span * i) / (n - 1) : 0) + jit;
      const warn = led ? h.warnLed : h.warn;
      if (h.t < impact - warn) continue;
      h.mask |= bit;
      // where: the led hero, or a random spot round him (inside the clearing)
      let x, z;
      const s = d.sense, lead = led ? 0.5 : 0;
      const bx = (Number.isFinite(px) && px < 1e5 ? px : d.position.x) + (s?.vel?.x ?? 0) * lead;
      const bz = (Number.isFinite(pz) && pz < 1e5 ? pz : d.position.z) + (s?.vel?.z ?? 0) * lead;
      if (led) {
        x = bx;
        z = bz;
      } else {
        const a = hash(h.seed + 3.1, i) * Math.PI * 2;
        const rr = h.lo + (h.hi - h.lo) * Math.sqrt(hash(h.seed + 7.7, i));
        x = bx + Math.cos(a) * rr;
        z = bz + Math.sin(a) * rr;
      }
      // (inside the clearing, or the ground the wall's fallen trees have opened that way: dragon.arenaAt)
      const rl = Math.hypot(x, z), Ra = d.arenaAt?.(x, z, ARENA_R) ?? ARENA_R;
      if (rl > Ra) {
        x *= Ra / rl;
        z *= Ra / rl;
      }
      // it streaks in from the sky, up-screen (north) and to one side, so it reads at the game camera
      const side = hash(h.seed + 11.3, i) < 0.5 ? -1 : 1;
      const left = Math.max(0.6, impact - h.t);
      this.circle({
        kind: 'meteor', attack: h.attack, x, z, r: h.r, delay: left, damage: h.damage, burn: h.burn, knockback: h.knockback,
        group: h.group, active: 0.12, fall: Math.min(h.fall, left - 0.05),
        from: { x: x + side * (5 + 3 * hash(h.seed + 5.5, i)), y: 30, z: z - 11 - 3 * hash(h.seed + 9.2, i) },
      });
    }
  }

  _barrage(h, px, pz) {
    const d = this.d;
    const hx = Number.isFinite(px) && px < 1e5 ? px : d.position.x, hz = Number.isFinite(pz) && pz < 1e5 ? pz : d.position.z;
    // the sky answers: an orange glow over the clearing from the hush until the last one lands
    const glow = smoothstep(h.glowAt, h.glowAt + 0.8, h.t) * (1 - smoothstep(h.end - 1.0, h.end, h.t));
    this.game.world?.atmosphere?.skyGlow?.(glow);
    // the burning deck over the clearing (skyFx): it spreads from over the wyrm's cast
    if (h.t >= h.deckAt) {
      const k = smoothstep(h.deckAt, h.deckAt + 0.6, h.t) * (1 - smoothstep(h.end - 1.0, h.end, h.t));
      skyDeck(d.fx, k, h.dcx, h.dcz, h.deckGrow > 0 ? clamp((h.t - h.deckAt) / h.deckGrow, 0, 1) : 1);
    }
    // the wyrm's fire in the sky the meteors fall out of (skyFx: its seeds / its vortex), from the cast
    if (h.t >= h.glowAt * 0.5 && h.t < h.finAt + 0.3) skyFeed(d.fx, smoothstep(h.glowAt * 0.5, h.glowAt + 0.4, h.t), d);
    if (!h.skyDone && h.t >= h.glowAt) {
      h.skyDone = true;
      d.emit('dragon:hazard', { kind: 'meteor', stage: 'sky', x: d.position.x, z: d.position.z, radius: ARENA_R });
    }
    const s = d.sense, n = h.perWave;
    const lx = hx + (s?.vel?.x ?? 0) * h.lead2, lz = hz + (s?.vel?.z ?? 0) * h.lead2;
    for (let w = 0; w < h.waves; w++) {
      const base = h.first + w * h.waveGap;
      if (h.t < base - h.warn - 0.01) break; // (waves in time order)
      if (h.wave < w) {
        // the wave's spots, placed when its first warning is due; which of them are led
        h.wave = w;
        // the wave is laid over the clearing; a hero who has left it through a gap in the wall takes
        // the wave with him (its disc moves until he stands WAVE_IN m inside its rim: no shelter out there)
        h.wx = h.wz = 0;
        const hr = Math.hypot(hx, hz);
        if (d.game.world?.edge?.open && hr > ARENA_R - WAVE_IN && hr < 1e5) {
          h.wx = (hx / hr) * (hr - (ARENA_R - WAVE_IN));
          h.wz = (hz / hr) * (hr - (ARENA_R - WAVE_IN));
        }
        placeWave(n, h.r, h.rng, hx - h.wx, hz - h.wz, h.pts, h.safeR, h.cover - (h.cover > 0.2 ? 0.08 : 0));
        h.ledMask = 0;
        for (let j = 0; j < n; j++) {
          const at = base + j * h.delay;
          if ((w * n + j) % h.ledEvery === 0 && at - h.ledLast >= h.ledGap - 1e-6) {
            h.ledMask |= 1 << j;
            h.ledLast = at;
          }
        }
      }
      if (h.wave !== w) continue;
      for (let j = 0; j < n; j++) {
        const i = w * n + j;
        if (h.spawned[i]) continue;
        const led = !!(h.ledMask & (1 << j));
        const impact = base + j * h.delay;
        if (h.t < impact - (led ? h.warnLed : h.warn)) continue;
        h.spawned[i] = 1;
        if (led) leadInto(h.pts, j, n, h.r, lx - h.wx, lz - h.wz, hx - h.wx, hz - h.wz, h.safeR, h.cover);
        this._meteorAt(h, h.pts[2 * j] + h.wx, h.pts[2 * j + 1] + h.wz, impact, h.r, h.fall, h.size, h.group, (j & 1) === 1, h.damage, h.burn, h.knockback, h.crater);
      }
    }
    if (h.fin && !h.finDone && h.t >= h.finAt - h.fin.warn) {
      // the last one: a great meteor on the hero's led position
      h.finDone = true;
      let x = lx, z = lz;
      const rl = Math.hypot(x, z), Rm = (d.arenaAt?.(x, z, ARENA_R) ?? ARENA_R) - 0.35 * h.fin.r;
      if (rl > Rm) {
        x *= Rm / rl;
        z *= Rm / rl;
      }
      const F = h.fin;
      this._meteorAt(h, x, z, h.finAt, F.r, F.fall, F.size, -1, false, F.damage, F.burn, F.knockback, h.crater, true);
    }
  }

  /** One Armageddon meteor at (x, z) landing at the barrage's time `impact`, falling from above the wyrm. */
  _meteorAt(h, x, z, impact, r, fall, size, group, dark, damage, burn, knockback, crater, great = false) {
    const d = this.d;
    const left = Math.max(0.6, impact - h.t);
    const wx = d.position.x, wz = d.position.z;
    // out of the wyrm's own fire in the sky (its seeds / its vortex: skyFx.skyFrom), seen leaving it as
    // its spot starts to heat; or (no source: ?meteorSource=off) on a slant from the sky over the wyrm
    const src = skyFrom(d.fx, x, z, great, _src);
    this.circle({
      kind: 'meteor', attack: h.attack, x, z, r, delay: left, damage, burn, knockback, group, active: 0.12,
      fall: src ? Math.min(TM.fall * (great ? 1.15 : 1), left - 0.05) : Math.min(fall, left - 0.05), size, dark, great, craterBurn: crater, tickDamage: h.tickDamage, tickBurn: h.tickBurn,
      lob: src ? TM.lob : 0,
      from: src ? { x: _src.x, y: _src.y, z: _src.z } : { x: wx + (x - wx) * 0.25, y: h.fallY, z: wz + (z - wz) * 0.25 },
    });
  }

  _chase(h, dt, px, pz) {
    if (h.crack) return this._chaseCrack(h, dt, px, pz);
    if (h.t > h.until) return;
    h.acc -= dt;
    if (h.acc > 0) return;
    h.acc += h.every;
    const d = this.d, s = d.sense;
    if (!(px < 1e5)) return;
    let x = px + (s?.vel?.x ?? 0) * h.lead, z = pz + (s?.vel?.z ?? 0) * h.lead;
    const rl = Math.hypot(x, z), Ra = d.arenaAt?.(x, z, ARENA_R) ?? ARENA_R;
    if (rl > Ra) {
      x *= Ra / rl;
      z *= Ra / rl;
    }
    const first = h.done === 0;
    h.done++;
    this.circle({
      kind: 'pillar', attack: h.attack, x, z, r: h.r, delay: h.warn, damage: h.damage, burn: h.burn, knockback: h.knockback,
      group: h.group, active: h.active, announce: !(first && h.linkFirst),
      craterBurn: h.pool, tickDamage: h.tickDamage, tickBurn: h.tickBurn,
    });
  }

  /** The chase along its crack: the head runs out to the led hero, then follows him; a pillar bursts at it every `every` s. */
  _chaseCrack(h, dt, px, pz) {
    const d = this.d, s = d.sense, fx = d.fx;
    if (h.arrived && h.t - h.arriveT > h.until) {
      if (h.trail) {
        trailRelease(fx, h.trail);
        h.trail = null;
      }
      return;
    }
    if (!h.trail && h.t < 0.1) h.trail = trailStart(fx, h.cx, h.cz, 'crack');
    // where it wants to be: the led hero (inside the clearing, or the ground the wall opened)
    let x = h.hx, z = h.hz;
    if (px < 1e5) {
      x = px + (s?.vel?.x ?? 0) * h.lead;
      z = pz + (s?.vel?.z ?? 0) * h.lead;
      const rl = Math.hypot(x, z), Ra = d.arenaAt?.(x, z, ARENA_R) ?? ARENA_R;
      if (rl > Ra) {
        x *= Ra / rl;
        z *= Ra / rl;
      }
    }
    const ex = x - h.hx, ez = z - h.hz, el = Math.hypot(ex, ez);
    const v = (h.arrived ? TC.follow : TC.speed) * dt;
    if (el > 1e-4) {
      const m = Math.min(el, v) / el;
      h.hx += ex * m;
      h.hz += ez * m;
    }
    if (!h.arrived && (el <= TC.arrive + v || h.t >= TC.maxRun)) {
      // it has caught him: the pillars start here
      h.arrived = true;
      h.arriveT = h.t;
      h.acc = 0;
      h.end = h.t + h.until + 0.05;
    }
    if (h.trail) trailHead(fx, h.trail, h.hx, h.hz);
    if (!h.arrived) return;
    h.acc -= dt;
    if (h.acc > 0) return;
    h.acc += h.every;
    const first = h.done === 0;
    h.done++;
    if (first) h.firstAt = h.t + h.warn;
    this.circle({
      kind: 'pillar', attack: h.attack, x: h.hx, z: h.hz, r: h.r, delay: h.warn, damage: h.damage, burn: h.burn, knockback: h.knockback,
      group: h.group, active: h.active, announce: !(first && h.linkFirst),
      craterBurn: h.pool, tickDamage: h.tickDamage, tickBurn: h.tickBurn,
    });
  }
}

function num(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}
