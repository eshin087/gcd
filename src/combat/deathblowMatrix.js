import { LetterBatch } from '../world/life/letterBatch.js';
import { mulberry32 } from '../core/rng.js';

// THE DEATHBLOW'S CODE (?dbmatrix=0|rain|world; default rain). While the deathblow combo runs the world shows
// what it is made of: letters. Two looks, both lasting exactly the combo (start of the first blow to the end of
// the finisher), easing in over ~0.15 s and out over ~0.3 s:
//   rain:  digital code rain in a wide ring round the two fighters: many columns of tiny falling letters in the
//          house font (digits and the few letters the font has: it has no katakana), heads a pale green-white,
//          tails fading to a dark green, falling in world space, densest 2-6 m out, thinning to ~12 m, never over
//          the two bodies. At every hit-pause the rain FREEZES mid-fall (time stops) and runs on when the blow
//          lets go; on the finisher the columns burst outward a little and fade. A light green cast on the
//          frame (the colour change the owner asked for; it replaces the dodge flurry's cold cast).
//   world: the whole frame goes to the code view: a green-on-black grade (game/grade.js `matrixSet`, the final
//          pass's uMatrix: darks to near-black green, lights to matrix green, the fighters' own colours kept as
//          far as it allows, faint scan lines) and a sparse field of letters that blink on a scan line sweeping
//          up through the room. The hit-pauses hold it; the finisher flashes it brighter, then it eases out.
//   0:     nothing (the combo's cold cast only, as before).
// Letters are printed through ONE LetterBatch (the house letter, one cell wherever it is, colour at most 0.55 a
// channel: under the bloom threshold, crisp, no halo), made the first time it is needed. Clock: the real time
// (the hit-pause is a world freeze; the code stops with it). Noise: this module's own seeded stream (never
// Math.random: the sims replay seeded fights, and three.js draws uuids from it too). Pooled: no allocation per
// frame. Never throws.

const fin = (v) => Number.isFinite(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ss = (t) => t * t * (3 - 2 * t);

/** Glyphs this module prints (tests/glyphcheck.mjs reads every *_GLYPHS list): the house font's digits and letters. */
export const DEATHBLOW_MATRIX_GLYPHS = '0123456789:;!rivxcsAB=*+|/\\^o'.split('');
const CHARS = DEATHBLOW_MATRIX_GLYPHS.join('');
const NG = DEATHBLOW_MATRIX_GLYPHS.length;

const OPTS = ['0', 'rain', 'world'];
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
export const DB_MATRIX_DEFAULT = '0'; // off: the owner skipped the matrix effect (2026-11-26); ?dbmatrix=rain|world keeps it to try
/** The switch: read at the moment the combo starts (the Lab cycles it). */
export const DB_MATRIX = { opts: OPTS, mode: OPTS.includes(q('dbmatrix')) ? q('dbmatrix') : DB_MATRIX_DEFAULT };
export const getDbMatrix = () => DB_MATRIX.mode;
export const setDbMatrix = (m) => (DB_MATRIX.mode = OPTS.includes(m) ? m : DB_MATRIX_DEFAULT);

/**
 * The numbers. in / out: the ease in / out (s). Rain: cols: columns at most (and `letters` their letters in all:
 * the budget); len: letters in a column [min, max]; r: the ring's radius round the two fighters' middle [min, max]
 * (m): `near` of the columns in [r0, rMid], the rest out to r1; top: the height a column starts at (m);
 * cells: fall speed in letter cells a second [min, max]; head / tail: colours (linear, each channel under the
 * bloom threshold 0.55); alpha: the faintness; far: m from the camera where it thins; cast: the frame's green
 * (grade); burst: the finisher's outward push (m) and its fade (s). World: n: letters; band: the scan line's
 * rise (s per room height) and its thickness (m); cast: 1 (the whole grade). Both: body: the ellipse round a
 * fighter in which nothing prints (half width, half height, m, as the screen sees them), flash: the finisher's
 * flash and its decay (s).
 */
export const DB_MATRIX_TUNING = Object.freeze({
  in: 0.15, out: 0.3,
  rain: Object.freeze({
    cols: 150, letters: 1500, len: [7, 13], r: [1.9, 12], near: 0.68, rMid: 6, top: 6.5, cells: [7, 15],
    head: Object.freeze([0.5, 0.55, 0.5]), mid: Object.freeze([0.12, 0.5, 0.18]), tail: Object.freeze([0.02, 0.15, 0.05]),
    alpha: 0.8, far: 14, cast: 0.3, burst: 1.6, burstFade: 0.55, glyphHz: 3.5,
  }),
  world: Object.freeze({
    n: 520, r: [1.6, 11], top: 5.8, cast: 1, band: 1.7, thick: 0.5, hz: 9, duty: 0.55,
    dim: Object.freeze([0.06, 0.38, 0.12]), lit: Object.freeze([0.3, 0.55, 0.34]), alpha: 0.75,
  }),
  body: Object.freeze([0.85, 1.25]), flash: Object.freeze([1, 0.3]),
});

/** What it did (tests read it; reused). */
export const DB_MATRIX_LAST = {
  mode: '0', starts: 0, active: false, env: 0, letters: 0, peak: 0, clock: 0, frozen: false, maxCh: 0, bad: 0,
  hits: 0, burst: false, flash: 0, grade: 0, made: false,
};

// ---- the state (one object; arrays made the first time they are needed)
const MAXL = 1500;
const A = {
  on: false, mode: '0', env: 0, clock: 0, hold: 0, bt: -1, bwait: 0, flash: 0, n: 0, starts: 0,
  cx: 0, cz: 0, hero: null, boss: null, floor: 0, dirty: false,
  // rain columns / world letters (arrays below), by index
  nc: 0, ox: null, oz: null, spd: null, off: null, len: null, ph: null, cell: null, uy: null,
  rng: null,
};

let BG = null, BB = null, BFAIL = null, COLS = null;
function batch(game) {
  if (BG === game) return BB;
  const pl = game?.pipeline;
  if (BFAIL === game || typeof pl?.registerParticles !== 'function' || !game.U?.uResolution) return null;
  const mr = Math.random;
  const r = A.rng ?? (A.rng = mulberry32(0x3a7c1d));
  Math.random = r; // (three.js's uuids: never the sims' stream)
  try {
    const b = new LetterBatch(game, MAXL, CHARS, { additive: false, spawned: 0, rand: r });
    b.uniforms.uSoft.value = 0.3;
    pl.registerParticles(b);
    BG = game;
    BB = b;
    COLS = new Float32Array(NG);
    DB_MATRIX_LAST.made = true;
    return b;
  } catch {
    BFAIL = game;
    return null;
  } finally {
    Math.random = mr;
  }
}

function arrays() {
  if (A.ox) return;
  const n = MAXL;
  A.ox = new Float32Array(n);
  A.oz = new Float32Array(n);
  A.spd = new Float32Array(n);
  A.off = new Float32Array(n);
  A.len = new Float32Array(n);
  A.ph = new Float32Array(n);
  A.cell = new Float32Array(n);
  A.uy = new Float32Array(n);
}

const hash = (a, b) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The metres one letter cell is tall at (x, z): the art pass's cell (px) x the metres a pixel covers there. */
function cellM(game, x, y, z) {
  const cam = game?.camera, cp = cam?.position, H = game?.pipeline?.height > 0 ? game.pipeline.height : 720;
  const ch = game?.pipeline?.artCell?.y > 0 ? game.pipeline.artCell.y : 8;
  if (!cp || !(cam.fov > 0)) return ch * 0.05;
  const d = Math.hypot(cp.x - x, cp.y - y, cp.z - z);
  const m = ch * ((2 * d * Math.tan((cam.fov * Math.PI) / 360)) / H);
  return fin(m) && m > 0.03 ? m : ch * 0.05;
}

// ---- the combo's calls

/**
 * The combo starts (player/deathblow.js). o: { n (blows), dur (s), boss (his position, a live object), hero
 * (his position) }. Draws the columns / letters of this combo from the stream seeded by the combo's number.
 */
export function deathblowMatrixStart(game, o = {}) {
  try {
    const mode = DB_MATRIX.mode;
    if (mode === '0' || !OPTS.includes(mode)) return;
    arrays();
    const b = batch(game);
    A.starts++;
    A.rng = mulberry32((Math.imul(A.starts + 11, 0x9e3779b1) ^ 0x2545f491) >>> 0);
    const r = A.rng;
    const hero = o.hero ?? game?.player?.position ?? null, boss = o.boss ?? null;
    A.hero = hero;
    A.boss = boss;
    const hx = fin(hero?.x) ? hero.x : 0, hz = fin(hero?.z) ? hero.z : 0;
    const bx = fin(boss?.x) ? boss.x : hx, bz = fin(boss?.z) ? boss.z : hz + 2;
    A.cx = (hx + bx) / 2;
    A.cz = (hz + bz) / 2;
    A.floor = fin(hero?.y) ? hero.y : 0;
    A.mode = mode;
    A.on = true;
    A.dirty = true;
    A.clock = 0;
    A.hold = 0;
    A.bt = -1;
    A.bwait = 0;
    A.flash = 0;
    const T = DB_MATRIX_TUNING;
    const X = mode === 'rain' ? T.rain : T.world;
    const cy = A.floor + 1;
    let nc = 0, used = 0;
    const want = mode === 'rain' ? T.rain.cols : T.world.n;
    while (nc < want && used < MAXL) {
      const rr = mode === 'rain'
        ? (r() < X.near ? X.r[0] + (X.rMid - X.r[0]) * r() : X.rMid + (X.r[1] - X.rMid) * r())
        : X.r[0] + (X.r[1] - X.r[0]) * Math.sqrt(r());
      const th = r() * Math.PI * 2;
      const x = A.cx + Math.cos(th) * rr, z = A.cz + Math.sin(th) * rr;
      A.ox[nc] = Math.cos(th) * rr; // (offsets from the middle: the burst pushes along them)
      A.oz[nc] = Math.sin(th) * rr;
      A.ph[nc] = r();
      if (mode === 'rain') {
        const len = Math.round(X.len[0] + (X.len[1] - X.len[0]) * r());
        if (used + len > Math.min(MAXL, X.letters)) break;
        used += len;
        A.len[nc] = len;
        A.cell[nc] = cellM(game, x, cy, z);
        A.spd[nc] = (X.cells[0] + (X.cells[1] - X.cells[0]) * r()) * A.cell[nc];
        A.off[nc] = r() * 40;
      } else {
        used++;
        A.len[nc] = 1;
        A.uy[nc] = 0.3 + (X.top - 0.3) * r(); // (its height)
      }
      nc++;
    }
    A.nc = nc;
    const L = DB_MATRIX_LAST;
    L.mode = mode;
    L.starts = A.starts;
    L.active = true;
    L.hits = 0;
    L.burst = false;
    L.peak = 0;
    void b;
  } catch {
    /* never freeze the frame */
  }
}

/** A blow lands (player/deathblow.js): o: { last, hold (real s) }. The code stops for the hit-pause. */
export function deathblowMatrixHit(game, o = {}) {
  try {
    if (!A.on) return;
    const hold = fin(o.hold) ? clamp(o.hold, 0, 2) : 0;
    A.hold = Math.max(A.hold, hold);
    DB_MATRIX_LAST.hits++;
    if (o.last) {
      A.bwait = hold; // (the burst waits for the release)
      A.bt = -1;
      A.flash = A.mode === 'world' ? DB_MATRIX_TUNING.flash[0] : 0;
    } else if (A.mode === 'world') A.flash = Math.max(A.flash, 0.12);
  } catch {
    /* never freeze the frame */
  }
}

/** The combo is over (its finisher done, or it ended early): the effect eases out. Idempotent. */
export function deathblowMatrixEnd() {
  if (!A.on) return;
  A.on = false;
}

/** A fight reset / a level change: gone at once. */
export function deathblowMatrixClear(game) {
  try {
    A.on = false;
    A.env = 0;
    A.hold = 0;
    A.bt = -1;
    A.nc = 0;
    A.flash = 0;
    A.hero = A.boss = null;
    if (A.dirty) release(game);
    DB_MATRIX_LAST.active = false;
    DB_MATRIX_LAST.env = 0;
  } catch {
    /* never freeze the frame */
  }
}

/** Empty the batch and give the grade back. */
function release(game) {
  A.dirty = false;
  const b = BG === game ? BB : null;
  if (b) {
    b.begin();
    b.end();
  }
  game?.flow?.grade?.matrixSet?.(0, 0, 0);
  DB_MATRIX_LAST.letters = 0;
  DB_MATRIX_LAST.grade = 0;
}

// ---- per frame (player.js `_updateFx`, on the real clock: it runs through the hit-pauses)
const C = [0, 0, 0];
const body = { hx: 0, hy: 0, hz: 0, bx: 0, by: 0, bz: 0, nb: 0 };

export function deathblowMatrixUpdate(game, dt) {
  try {
    if (!A.dirty) return;
    dt = fin(dt) ? clamp(dt, 0, 0.1) : 0.016;
    const T = DB_MATRIX_TUNING, L = DB_MATRIX_LAST;
    if (A.on) A.env = Math.min(1, A.env + dt / T.in);
    else A.env = Math.max(0, A.env - dt / T.out);
    if (!A.on && A.env <= 0) {
      deathblowMatrixClear(game);
      return;
    }
    const frozen = A.hold > 0;
    if (frozen) A.hold = Math.max(0, A.hold - dt);
    else A.clock += dt;
    if (A.bwait > 0) {
      A.bwait = Math.max(0, A.bwait - dt);
      if (A.bwait <= 0) A.bt = 0;
    } else if (A.bt >= 0) A.bt += dt;
    A.flash = Math.max(0, A.flash - dt / T.flash[1]);
    const env = ss(A.env);
    // the grade
    const X = A.mode === 'rain' ? T.rain : T.world;
    game?.flow?.grade?.matrixSet?.(env, X.cast, A.flash);
    L.grade = env * X.cast;
    L.env = env;
    L.active = A.on;
    L.clock = A.clock;
    L.frozen = frozen;
    L.burst = A.bt >= 0;
    L.flash = A.flash;
    draw(game, env);
  } catch {
    /* never freeze the frame */
  }
}

/** The fighters' middles (the code prints nowhere near them, on the screen). */
function bodies() {
  const h = A.hero, b = A.boss;
  body.nb = 0;
  if (h && fin(h.x + h.z)) {
    body.hx = h.x;
    body.hz = h.z;
    body.hy = (fin(h.y) ? h.y : A.floor) + 0.95;
    body.nb = 1;
  }
  if (b && fin(b.x + b.z)) {
    body.bx = b.x;
    body.bz = b.z;
    body.by = (fin(b.y) ? b.y : A.floor) + 0.95;
    body.nb = body.nb ? 3 : 2;
  }
}

let RX = 1, RY = 0, RZ = 0, UX = 0, UY = 1, UZ = 0;
/** 0 at a fighter's body (as the screen sees it), 1 clear of it: a smooth ellipse in the screen's own axes. */
function clearOf(x, y, z) {
  const T = DB_MATRIX_TUNING.body;
  let k = 1;
  for (let i = 0; i < 2; i++) {
    if (i === 0 ? !(body.nb & 1) : !(body.nb & 2)) continue;
    const dx = x - (i === 0 ? body.hx : body.bx), dy = y - (i === 0 ? body.hy : body.by), dz = z - (i === 0 ? body.hz : body.bz);
    const sx = (dx * RX + dy * RY + dz * RZ) / T[0], sy = (dx * UX + dy * UY + dz * UZ) / T[1];
    const e = sx * sx + sy * sy;
    if (e < 1.8) k = Math.min(k, e < 0.7 ? 0 : (e - 0.7) / 1.1);
  }
  return k;
}

function draw(game, env) {
  const b = batch(game), L = DB_MATRIX_LAST;
  if (!b) return;
  b.begin();
  const T = DB_MATRIX_TUNING;
  const cam = game.camera, cp = cam?.position, me = cam?.matrixWorld?.elements;
  if (me) {
    RX = me[0]; RY = me[1]; RZ = me[2];
    UX = me[4]; UY = me[5]; UZ = me[6];
  }
  bodies();
  for (let i = 0; i < NG; i++) COLS[i] = b.col(DEATHBLOW_MATRIX_GLYPHS[i]);
  L.maxCh = 0;
  if (A.mode === 'rain') drawRain(b, cp, env, T.rain);
  else drawWorld(b, cp, env, T.world);
  b.end();
  L.letters = b.n;
  if (b.n > L.peak) L.peak = b.n;
}

function put(b, x, y, z, ch, c, a) {
  const L = DB_MATRIX_LAST;
  const mx = Math.max(c[0], c[1], c[2]);
  if (mx > L.maxCh) L.maxCh = mx;
  if (!(a > 0.004)) return;
  if (!fin(x + y + z)) {
    L.bad++;
    return;
  }
  b.put(x, y, z, 0, COLS[ch], 0, c, a);
}

function drawRain(b, cp, env, X) {
  const bt = A.bt, ba = bt >= 0 ? Math.max(0, 1 - bt / X.burstFade) : 1;
  if (ba <= 0 || env <= 0) return;
  const push = bt >= 0 ? X.burst * (1 - Math.exp(-5 * bt)) : 0;
  const gl = Math.floor(A.clock * X.glyphHz);
  const floor = A.floor + 0.02;
  for (let j = 0; j < A.nc; j++) {
    const len = A.len[j], cell = A.cell[j], span = X.top + len * cell + 0.4;
    // the column's own place, pushed out a little by the finisher's burst
    let ox = A.ox[j], oz = A.oz[j];
    if (push > 0) {
      const l = Math.hypot(ox, oz) || 1;
      ox += (ox / l) * push;
      oz += (oz / l) * push;
    }
    const x = A.cx + ox, z = A.cz + oz;
    let dist = 8;
    if (cp) dist = Math.hypot(cp.x - x, cp.z - z);
    const far = clamp(1.6 - dist / X.far, 0, 1); // (thins with the distance from the camera)
    // the ring thins from 6 m to 12 m
    const rr = Math.hypot(A.ox[j], A.oz[j]);
    const ring = rr < X.rMid ? 1 : clamp(1 - (rr - X.rMid) / (X.r[1] - X.rMid + 1) * 0.6, 0.35, 1);
    const head = X.top - ((A.off[j] * cell + A.spd[j] * A.clock) % span) + (bt >= 0 ? -bt * cell * 8 : 0);
    for (let k = 0; k < len; k++) {
      const y = head + k * cell;
      if (y < floor || y > X.top) continue;
      const t = k / Math.max(1, len - 1); // 0 head .. 1 end of the tail
      const c = k === 0 ? X.head : (t < 0.3 ? mix3(X.head, X.mid, (t - 0.0) / 0.3 * 0.9 + 0.1) : mix3(X.mid, X.tail, (t - 0.3) / 0.7));
      const cl = clearOf(x, y, z);
      if (cl <= 0) continue;
      const a = X.alpha * env * ba * far * ring * cl * (k === 0 ? 1 : 0.75 * (1 - 0.8 * t));
      const g = Math.floor(hash(j * 131 + k, gl + (k === 0 ? gl : 0)) * NG) % NG;
      put(b, x, y, z, g, c, a);
    }
  }
}

function mix3(a, b, t) {
  t = clamp(t, 0, 1);
  C[0] = a[0] + (b[0] - a[0]) * t;
  C[1] = a[1] + (b[1] - a[1]) * t;
  C[2] = a[2] + (b[2] - a[2]) * t;
  return C;
}

function drawWorld(b, cp, env, X) {
  const yb = ((A.clock / X.band) % 1) * (X.top + 1) - 0.5;
  const tick = Math.floor(A.clock * X.hz);
  const fl = 1 + A.flash * 0.9;
  for (let j = 0; j < A.nc; j++) {
    const x = A.cx + A.ox[j], z = A.cz + A.oz[j], y = A.floor + A.uy[j];
    const near = Math.abs(y - A.floor - yb) < X.thick;
    // blinks: on for `duty` of the time by its own hash; the scan line lights what it crosses
    const on = near || hash(j * 17 + 3, tick + Math.floor(A.ph[j] * 5)) < X.duty;
    if (!on) continue;
    const cl = clearOf(x, y, z);
    if (cl <= 0) continue;
    const c = near ? X.lit : X.dim;
    const a = Math.min(1, X.alpha * env * cl * (near ? 1 : 0.55) * fl);
    const g = Math.floor(hash(j * 977 + 5, tick >> 1) * NG) % NG;
    put(b, x, y, z, g, c, a);
  }
}
