import { axes } from './clashFx.js';
import { LetterBatch } from '../world/life/letterBatch.js';

// THE PERFECT PARRY'S SPIT OF SPARKS (?parryFx=0|a; `a` the default, the owner's pick 2026-11-24, ADR-181;
// `0` = the parry as it was before). On top of
// the shipped `sharp` mark (combat/perfectFx.js: the gold cross on the blades and its ring, the freeze,
// the slow motion, the sound), which stays exactly as it is, option `a` throws what real steel on steel
// throws: a FEW sparks, FAST and SHORT-LIVED, ORANGE. A tight spit leaves the crossing along the blade
// that glanced off (the attacker's edge, past the crossing toward its tip), a few the other way along
// the hero's edge; each is a short stroke while it is fast, shrinks to a dot as it slows, cools from
// yellow-orange to deep orange to a dark red and is gone in a fraction of a second; two or three
// heavier ones sag toward the floor and wink out. Sekiro's perfect deflect is the touchstone.
//
// How a spark is drawn: ONE house letter (the wyrm's pixel font through a LetterBatch, one cell
// whatever its distance, world/life/letterBatch.js), re-written every step where the spark is now.
// While it moves more than about half a cell a frame on screen it is a stroke laid along its screen
// motion (- / | \), slower it is a ' then a . Normal blending, colour at most 0.55 in any channel (the
// bloom threshold, CONFIG.render.bloomThreshold): it prints as a crisp letter with no halo. No white.
// Never drawn over a fighter's head and chest (it passes behind him there).
// The clock: real time (they leave the contact during the parry's 0.11 s freeze, and do not stretch in
// its slow motion). Noise from this module's own seeded stream (never Math.random: the sims replay
// seeded fights; the batch's three.js uuids draw from it too). Pooled, no per-frame allocation.

let seed = 0x6b43a9b5;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);
const fin = (v) => Number.isFinite(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Glyphs this module prints (tests/glyphcheck.mjs reads every *_GLYPHS list). */
export const PARRY_SPARK_GLYPHS = ['-', '/', '\\', '|', "'", '.'];
const CHARS = PARRY_SPARK_GLYPHS.join('');

const OPTS = ['0', 'a'];
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
/** The look a perfect parry gets when nothing asks for another (the owner's pick, 2026-11-24). */
export const PARRY_FX_DEFAULT = 'a';
/** The switch: read at the moment of the parry (the Lab sets it). '0' = the parry as it was before. */
export const PARRY_FX = { opts: OPTS, mode: OPTS.includes(q('parryFx')) ? q('parryFx') : PARRY_FX_DEFAULT };
export const parryFxMode = () => PARRY_FX.mode;
export const setParryFx = (m) => (PARRY_FX.mode = OPTS.includes(m) ? m : PARRY_FX_DEFAULT);

/**
 * The spit (per option; only `a`). n: sparks per perfect parry [min, max] (seeded per moment); heavy:
 * how many of them are the heavier ones [min, max]; main: the share that leaves along the attacker's
 * edge (the rest along the hero's, the other way); cone: half-angle (deg) around the edge; coneFree:
 * around the way the blow was pushed aside when no steel met (the wyrm's claw, a fist); up: the upward
 * part added to each direction; born: real s over which they are born (the first two frames); speed
 * (m/s), life (real s), gravity: light / heavy; glide: m a light spark coasts at most (its drag is
 * speed / glide; the further it coasts the longer it lives); drag (1/s): the heavy ones'; pull: m a letter is drawn nearer the
 * camera along its view ray (the same place on screen; clear of the soft depth fade against the two
 * bodies right behind the crossing); max: sparks alive at most (a string of parries).
 * Look: stroke / tick: the screen motion per frame (in letter cells) above which a spark prints as a
 * stroke / a ' (below: a .); ramp: colour by life (t 0 .. 1; linear, under the bloom threshold); fade:
 * the share of its life at the end in which it goes out.
 */
export const PARRY_SPARKS = Object.freeze({
  a: Object.freeze({
    n: [12, 16], heavy: [2, 3], main: 0.7, cone: 25, coneFree: 35, up: [0.08, 0.3], born: 1 / 60,
    speed: [[4, 7], [4, 4.4]], glide: [0.12, 0.56], drag: [9.5, 11], life: [[0.12, 0.3], [0.35, 0.44]], gravity: [-9.8, -13],
    pull: 0.12, max: 48,
    stroke: 0.35, tick: 0.12,
    ramp: Object.freeze([
      Object.freeze([0.0, 0.55, 0.27, 0.06]),
      Object.freeze([0.3, 0.52, 0.17, 0.025]),
      Object.freeze([0.65, 0.32, 0.07, 0.012]),
      Object.freeze([1.0, 0.13, 0.02, 0.005]),
    ]),
    fade: 0.25,
  }),
});

/** The option's spec now (null: '0', as shipped). */
export const parryFxSpec = (m = PARRY_FX.mode) => PARRY_SPARKS[m] ?? null;

/** What the sparks did (tests read it; reused). The per-spit counts are the newest spit's. */
export const PARRY_SPARKS_LAST = {
  n: 0, mode: '0', spawned: 0, heavy: 0, main: 0, died: 0, near: 0, floor: 0, reachMax: 0, lifeMax: 0,
  alive: 0, peak: 0, drawn: 0, hidden: 0, maxCh: 0, white: 0, bad: 0, ended: true,
};

// ---- the pool: one record of F floats per spark
const MAX = 64;
const F = 18;
// 0 x 1 y 2 z 3 vx 4 vy 5 vz 6 age 7 life 8 drag 9 gravity 10 wait (real s before it shows) 11 floor y
// 12 ox 13 oy 14 oz (the crossing) 15 heavy 16 spit (which spit: its own, for the per-spit counts) 17 -
const D = new Float32Array(MAX * F);
let count = 0;
let spit = 0; // the newest spit's number
let spec = PARRY_SPARKS.a;
let tSpit = 0; // real s since the newest spit

const COL = [0, 0, 0];
function rampCol(X, t) {
  const A = X.ramp;
  t = clamp(t, 0, 1);
  let i = 1;
  while (i < A.length - 1 && A[i][0] < t) i++;
  const a = A[i - 1], b = A[i], u = (t - a[0]) / (b[0] - a[0] || 1);
  COL[0] = a[1] + (b[1] - a[1]) * u;
  COL[1] = a[2] + (b[2] - a[2]) * u;
  COL[2] = a[3] + (b[3] - a[3]) * u;
  return COL;
}

/** A free record (full: the oldest gives way, counted as died where it was). */
function take() {
  if (count < MAX && count < spec.max) return count++ * F;
  let o = 0, best = -1;
  for (let i = 0; i < count; i++) {
    const a = D[i * F + 6] / Math.max(0.01, D[i * F + 7]);
    if (a > best) {
      best = a;
      o = i;
    }
  }
  die(o * F, false);
  return o * F;
}

/** Count a spark's death (its reach from the crossing) in the newest spit's numbers. */
function die(k, floor) {
  const P = PARRY_SPARKS_LAST;
  if (D[k + 16] !== spit) return;
  const r = Math.hypot(D[k] - D[k + 12], D[k + 1] - D[k + 13], D[k + 2] - D[k + 14]);
  P.died++;
  if (r <= 0.6) P.near++;
  if (floor) P.floor++;
  if (r > P.reachMax) P.reachMax = r;
  if (tSpit > P.lifeMax) P.lifeMax = tSpit;
}

const V = { x: 0, y: 0, z: 0 };
const norm = (x, y, z) => {
  const l = Math.hypot(x, y, z);
  if (!(l > 1e-6) || !fin(l)) {
    V.x = V.y = V.z = 0;
    return 0;
  }
  V.x = x / l;
  V.y = y / l;
  V.z = z / l;
  return l;
};

// the two ways (reused): the main one and the other
const W0 = { x: 0, y: 0, z: 0, ok: false }, W1 = { x: 0, y: 0, z: 0, ok: false };
const setW = (W, x, y, z) => {
  W.ok = norm(x, y, z) > 0;
  W.x = V.x;
  W.y = V.y;
  W.z = V.z;
  return W.ok;
};

/** A direction within `deg` of the unit way W (uniform over the cone's disc), into V. */
function cone(W, deg) {
  // two axes square to W
  let ax = 0, ay = 1, az = 0;
  if (Math.abs(W.y) > 0.9) {
    ax = 1;
    ay = 0;
  }
  // u = W x a, v = W x u
  let ux = W.y * az - W.z * ay, uy = W.z * ax - W.x * az, uz = W.x * ay - W.y * ax;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = W.y * uz - W.z * uy, vy = W.z * ux - W.x * uz, vz = W.x * uy - W.y * ux;
  const th = ((deg * Math.PI) / 180) * Math.sqrt(rnd()), ph = rnd() * Math.PI * 2;
  const c = Math.cos(th), s = Math.sin(th), cp = Math.cos(ph) * s, sp = Math.sin(ph) * s;
  V.x = W.x * c + ux * cp + vx * sp;
  V.y = W.y * c + uy * cp + vy * sp;
  V.z = W.z * c + uz * cp + vz * sp;
}

/**
 * The spit of one perfect parry at the crossing (x, y, z). o: { e1, e2 (the hero's / the attacker's
 * blade, hilt to tip, world), met (the blades crossed), fdx, fdz (toward the blow: the way it was
 * pushed aside, on the floor), spray (fallback way), mode (default the switch) }. Returns the sparks
 * spawned; never throws.
 */
export function parrySparks(game, x, y, z, o = {}) {
  try {
    const mode = o.mode ?? PARRY_FX.mode, X = PARRY_SPARKS[mode];
    if (!X || !fin(x + y + z)) return 0;
    const P = PARRY_SPARKS_LAST;
    P.n++;
    P.mode = mode;
    P.ended = false;
    P.spawned = P.heavy = P.main = P.died = P.near = P.floor = 0;
    P.reachMax = P.lifeMax = 0;
    seed = (Math.imul(P.n + 7, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
    spec = X;
    spit = (spit + 1) % 65536;
    tSpit = 0;
    // the ways: steel met: along the attacker's edge past the crossing (toward his tip), and the
    // other way along the hero's edge; none met: the way the blow was pushed aside
    let free = !(o.met && o.e2 && setW(W0, o.e2.x, o.e2.y, o.e2.z));
    W1.ok = false;
    if (!free && o.e1 && setW(W1, o.e1.x, o.e1.y, o.e1.z)) {
      if (W1.x * W0.x + W1.y * W0.y + W1.z * W0.z > 0) {
        W1.x = -W1.x;
        W1.y = -W1.y;
        W1.z = -W1.z;
      }
    }
    if (free) {
      const fx = o.fdx, fz = o.fdz;
      if (!(fin(fx) && fin(fz) && setW(W0, fx, 0, fz)) && !(o.spray && setW(W0, o.spray.x, 0, o.spray.z))) setW(W0, 0, 0, 1);
    }
    const py = game?.player?.position?.y;
    const floor = fin(py) ? Math.min(py, y - 0.05) : y - 1.2;
    const n = Math.round(R(X.n[0], X.n[1] + 0.999) - 0.5);
    const nh = Math.round(R(X.heavy[0], X.heavy[1] + 0.999) - 0.5);
    for (let i = 0; i < n; i++) {
      const heavy = i < nh ? 1 : 0;
      const along = free || !W1.ok || rnd() < X.main;
      cone(along ? W0 : W1, free ? X.coneFree : X.cone);
      norm(V.x, V.y + R(X.up[0], X.up[1]), V.z);
      const k = take();
      const sp = R(X.speed[heavy][0], X.speed[heavy][1]);
      const o0 = R(0, 0.03);
      D[k] = x + V.x * o0;
      D[k + 1] = y + V.y * o0;
      D[k + 2] = z + V.z * o0;
      D[k + 3] = V.x * sp;
      D[k + 4] = V.y * sp;
      D[k + 5] = V.z * sp;
      D[k + 6] = 0;
      // (a light one: how far it coasts and how long it lives go together, so the spit strings out
      // along its way, the short ones gone first, instead of flying as one clump)
      const u = rnd(), ul = clamp(u + R(-0.15, 0.15), 0, 1);
      D[k + 7] = heavy ? R(X.life[1][0], X.life[1][1]) : X.life[0][0] + (X.life[0][1] - X.life[0][0]) * ul;
      D[k + 8] = heavy ? R(X.drag[0], X.drag[1]) : sp / (X.glide[0] + (X.glide[1] - X.glide[0]) * u);
      D[k + 9] = X.gravity[heavy];
      D[k + 10] = rnd() < 0.5 ? 0 : X.born;
      D[k + 11] = floor;
      D[k + 12] = x;
      D[k + 13] = y;
      D[k + 14] = z;
      D[k + 15] = heavy;
      D[k + 16] = spit;
      P.spawned++;
      if (heavy) P.heavy++;
      if (along && !free) P.main++;
    }
    P.alive = count;
    return n;
  } catch {
    return 0;
  }
}

/**
 * Per simulation step (perfectFx.perfectUpdate calls it, from the flow). d: the effects clock (fxDt);
 * r: real s (the sparks fly on it). Never throws.
 */
export function parrySparksUpdate(game, d, r) {
  try {
    if (!count) return;
    if (!(r > 0)) return; // a pause
    tSpit += r;
    const P = PARRY_SPARKS_LAST;
    let w = 0;
    for (let i = 0; i < count; i++) {
      const k = i * F;
      if (D[k + 10] > 0) {
        D[k + 10] -= r;
        if (w !== i) D.copyWithin(w * F, k, k + F);
        w++;
        continue;
      }
      D[k + 6] += r;
      const dr = Math.exp(-D[k + 8] * r);
      D[k + 3] *= dr;
      D[k + 5] *= dr;
      D[k + 4] = D[k + 4] * dr + D[k + 9] * r;
      D[k] += D[k + 3] * r;
      D[k + 1] += D[k + 4] * r;
      D[k + 2] += D[k + 5] * r;
      if (!fin(D[k] + D[k + 1] + D[k + 2] + D[k + 3] + D[k + 4] + D[k + 5])) {
        P.bad++;
        continue;
      }
      // (it reaches the floor: it dies there)
      if (D[k + 1] <= D[k + 11]) {
        D[k + 1] = D[k + 11];
        die(k, true);
        continue;
      }
      if (D[k + 6] >= D[k + 7]) {
        die(k, false);
        continue;
      }
      if (w !== i) D.copyWithin(w * F, k, k + F);
      w++;
    }
    count = w;
    P.alive = w;
    if (w > P.peak) P.peak = w;
    if (!w) P.ended = true;
    draw(game);
  } catch {
    /* never freeze the frame */
  }
}

// ---- the letters: one LetterBatch per game, made the first time a spit is drawn
let BG = null, BB = null, BFAIL = null;
function batch(game) {
  if (BG === game) return BB;
  const pl = game?.pipeline;
  if (BFAIL === game || typeof pl?.registerParticles !== 'function' || !game.U?.uResolution) return null;
  const mr = Math.random;
  Math.random = rnd; // (three.js's uuids: never the sims' stream)
  try {
    const b = new LetterBatch(game, MAX, CHARS, { additive: false, spawned: 0, rand: rnd });
    b.uniforms.uSoft.value = 0.15;
    pl.registerParticles(b);
    BG = game;
    BB = b;
    return b;
  } catch {
    BFAIL = game;
    return null;
  } finally {
    Math.random = mr;
  }
}

const COLS = new Float32Array(PARRY_SPARK_GLYPHS.length);
function draw(game) {
  const b = batch(game);
  const P = PARRY_SPARKS_LAST, X = spec;
  if (b) b.begin();
  if (count) {
    figures(game);
    const A = axes(game);
    const cp = game?.camera?.position;
    const cw = game?.pipeline?.artCell?.x > 0 ? game.pipeline.artCell.x : 5;
    if (b) for (let i = 0; i < COLS.length; i++) COLS[i] = b.col(PARRY_SPARK_GLYPHS[i]);
    for (let i = 0; i < count; i++) {
      const k = i * F;
      if (D[k + 10] > 0) continue;
      const x = D[k], y = D[k + 1], z = D[k + 2];
      const s = proj(x, y, z);
      if (NF && covers(s)) {
        P.hidden++;
        continue;
      }
      const t = D[k + 6] / D[k + 7];
      const c = rampCol(X, t);
      const a = t > 1 - X.fade ? clamp((1 - t) / X.fade, 0, 1) : 1;
      const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
      if (mx > P.maxCh) P.maxCh = mx;
      if (mn > 0.6 * mx) P.white++;
      // its screen motion this frame, in letter cells: a stroke along it, a tick, a dot
      const vx = D[k + 3], vy = D[k + 4], vz = D[k + 5];
      const sx = vx * A.rx + vy * A.ry + vz * A.rz, sy = vx * A.ux + vy * A.uy + vz * A.uz;
      const cells = s.ok && s.mpp > 0 ? Math.hypot(sx, sy) / s.mpp / 60 / cw : Math.hypot(sx, sy) / 60 / 0.12;
      let g = 5;
      if (cells > X.stroke) {
        let ang = Math.atan2(sy, sx);
        if (ang < 0) ang += Math.PI;
        const e = Math.PI / 8;
        g = ang < e || ang >= 7 * e ? 0 : ang < 3 * e ? 1 : ang < 5 * e ? 3 : 2;
      } else if (cells > X.tick) g = 4;
      P.drawn++;
      if (!b) continue;
      let px = x, py = y, pz = z;
      if (cp) {
        const dx = cp.x - x, dy = cp.y - y, dz = cp.z - z, l = Math.hypot(dx, dy, dz);
        if (l > X.pull * 2 && fin(l)) {
          px += (dx / l) * X.pull;
          py += (dy / l) * X.pull;
          pz += (dz / l) * X.pull;
        }
      }
      b.put(px, py, pz, 0, COLS[g], 0, c, a);
    }
  }
  if (b) b.end();
}

// ---- the fighters' figures on screen (a spark is never drawn over their head and chest)
const FIG = [
  { x: 0, y: 0, rx: 0, ry: 0, z: 0 },
  { x: 0, y: 0, rx: 0, ry: 0, z: 0 },
];
let NF = 0;
const SC = { x: 0, y: 0, z: 0, mpp: 0, ok: false };
let M = null, PM = null, Wd = 0, Ht = 0;
function proj(x, y, z) {
  SC.ok = false;
  const m = M, e = PM;
  if (!m || !e) return SC;
  const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
  if (!(vz > 0.2) || !(e[5] > 0)) return SC;
  SC.x = ((vx * e[0]) / vz * 0.5 + 0.5) * Wd;
  SC.y = ((vy * e[5]) / vz * 0.5 + 0.5) * Ht;
  SC.z = vz;
  SC.mpp = (2 * vz) / (Ht * e[5]);
  SC.ok = fin(SC.x + SC.y + SC.mpp);
  return SC;
}
/** A figure standing at p: from `from` to `tall` m up, `half` m wide each side (a screen ellipse: his
 *  head and chest, which a spark never crosses in front of; past his cloak and legs it may). */
function figure(p, tall, half, from = 0) {
  if (!p || !fin(p.x + p.y + p.z) || NF >= 2) return;
  const a = proj(p.x, p.y + from, p.z);
  if (!a.ok) return;
  const fx = a.x, fy = a.y, fz = a.z;
  const b = proj(p.x, p.y + tall, p.z);
  if (!b.ok) return;
  const f = FIG[NF++];
  f.x = (fx + b.x) * 0.5;
  f.y = (fy + b.y) * 0.5;
  f.rx = half / b.mpp;
  f.ry = Math.hypot(b.x - fx, b.y - fy) * 0.5 + 0.06 / b.mpp;
  f.z = fz;
}
function figures(game) {
  NF = 0;
  const cam = game?.camera, p = game?.pipeline;
  M = cam?.matrixWorldInverse?.elements ?? null;
  PM = cam?.projectionMatrix?.elements ?? null;
  Wd = p?.width;
  Ht = p?.height;
  if (!M || !PM || !(Wd > 8) || !(Ht > 8)) {
    M = PM = null;
    return;
  }
  figure(game.player?.position, 1.72, 0.12, 1.0);
  // a duelist (a man: he has a blade to meet); the wyrm is too big to step round
  const d = game.dragon;
  if (typeof d?.parryContact === 'function') figure(d.position, 1.85, 0.13, 1.05);
}
function covers(a) {
  if (!a.ok) return false;
  for (let i = 0; i < NF; i++) {
    // (in front of him and on his figure: behind him the scene's depth already hides it)
    const f = FIG[i], ex = (a.x - f.x) / f.rx, ey = (a.y - f.y) / f.ry;
    if (ex * ex + ey * ey < 1 && a.z < f.z - 0.12) return true;
  }
  return false;
}

/** Drop every spark (a level reset). */
export function parrySparksClear() {
  count = 0;
  PARRY_SPARKS_LAST.alive = 0;
  PARRY_SPARKS_LAST.ended = true;
  try {
    BB?.empty?.();
  } catch {
    /* (a lost context) */
  }
}

/** Any spark still alive (tests). */
export const parrySparksBusy = () => count > 0;
