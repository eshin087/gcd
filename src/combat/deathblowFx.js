import { axes, screenAngle } from './clashFx.js';
import { LetterBatch } from '../world/life/letterBatch.js';
import { FIRE_KIND } from '../render/firePalettes.js';

// THE DEATHBLOW'S HIT EFFECT (?dbfx=a|b|c|d; default a). The parry streak's combo of N cuts calls
// `deathblowHit` once per blow at its contact; four looks (the owner picks), the same combo. Each grows
// a little with the blow's number `i` and is biggest on the last (the finisher).
//   a  STEEL BLOOM   a round bloom of orange heat that is gone in ~0.08 s, a spray of short orange
//                    strokes that slow to dots and fall, embers that drift down. The finisher: a bloom
//                    twice the size and a long fall of embers.
//   b  SHATTER WEB   each blow leaves ONE long straight cut-line of pale steel-blue letters through the
//                    boss, hanging ~0.35 s, each new one crossing the last; on the finisher every line
//                    still hanging snaps into letter shards that fly outward and fall.
//   c  STORM CRACK   each blow throws 2-3 short jagged paths of blue letters that crawl over the body
//                    for ~0.2 s; the finisher drops one vertical bolt from ~4 m above to the floor, then
//                    crackles out.
//   d  GOLD CRESCENT each blow leaves a crescent of gold letters along the swing (a0 -> a1, ~1.6 m
//                    radius) that sweeps on a little and crumbles into falling gold embers in ~0.4 s;
//                    the finisher's is wider and thicker.
// How it is drawn (STYLE.md "The house style", "The fire field"): the BODY of a blow is a short flash of
// heat in the fire field (`game.fx.fire`), written on whole letter cells and pulled toward the camera
// (as combat/impactStamp.js), one copy alive per frame, gone in ~0.08 s; everything that flies or hangs
// is ONE house letter through a LetterBatch (as combat/parrySparks.js: one cell, strokes along their
// screen motion), colour under the bloom threshold (0.55 a channel), no white. NEVER the background: no
// dim, tint, vignette or flash of the screen. The clock is real time. Noise from this module's own seeded
// stream (never Math.random). Pooled, no allocation per frame, nothing made until the first blow.

let seed = 0x3c6ef372;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);
const fin = (v) => Number.isFinite(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

/** Glyphs this module prints (tests/glyphcheck.mjs reads every *_GLYPHS list). */
export const DEATHBLOW_FX_GLYPHS = ['-', '/', '\\', '|', "'", '.', ','];
const CHARS = DEATHBLOW_FX_GLYPHS.join('');
const G_DASH = 0, G_SLASH = 1, G_BACK = 2, G_BAR = 3, G_TICK = 4, G_DOT = 5, G_COMMA = 6;

const OPTS = ['a', 'b', 'c', 'd'];
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
export const DBFX_DEFAULT = 'a';
/** The switch (`?dbfx=`): read at the moment of each blow (the Lab cycles it). */
export const DB_FX = { opts: OPTS, mode: OPTS.includes(q('dbfx')) ? q('dbfx') : DBFX_DEFAULT };
export const getDbFx = () => DB_FX.mode;
export const setDbFx = (m) => (DB_FX.mode = OPTS.includes(m) ? m : DBFX_DEFAULT);

/**
 * The numbers. Colours are linear, at most 0.55 a channel (the bloom threshold), never near-white.
 *   ramps   colour by life (stops [t, r, g, b]); by ramp id: 0 orange, 1 gold, 2 steel-blue, 3 storm blue
 *   pull    m a letter is drawn nearer the camera along its view ray (clear of the soft depth fade)
 *   max     letters alive at most (the oldest give way)
 *   flash   the heat: life (real s), px (a blob across, frame px at a 5 px cell), pull, per mode the
 *           kind, the centre heat and the rim heat
 */
export const DBFX_TUNE = Object.freeze({
  pull: 0.3,
  max: 360,
  stroke: 0.35,
  tick: 0.12,
  flash: Object.freeze({ life: 0.08, lifeLast: 0.1, px: 12, pull: 2.5, minY: 0.6, hero: Object.freeze({ rx: 0.24, foot: 0.05, head: 1.7, pad: 0.04 }) }),
  ramps: Object.freeze([
    Object.freeze([[0, 0.55, 0.27, 0.06], [0.3, 0.52, 0.17, 0.025], [0.65, 0.32, 0.07, 0.012], [1, 0.13, 0.02, 0.005]].map(Object.freeze)),
    Object.freeze([[0, 0.55, 0.4, 0.08], [0.5, 0.5, 0.27, 0.035], [1, 0.22, 0.08, 0.01]].map(Object.freeze)),
    Object.freeze([[0, 0.3, 0.42, 0.55], [0.4, 0.22, 0.32, 0.48], [1, 0.07, 0.1, 0.2]].map(Object.freeze)),
    Object.freeze([[0, 0.22, 0.45, 0.55], [0.4, 0.12, 0.28, 0.52], [1, 0.04, 0.07, 0.22]].map(Object.freeze)),
  ]),
});

/** What the effect did (tests read it; reused). */
export const DBFX_LAST = { hits: 0, mode: 'a', spawned: 0, alive: 0, peak: 0, flash: 0, heatCells: 0, maxCh: 0, white: 0, bad: 0, drawn: 0, snapped: 0 };

// ---- the letters' pool: one record of F floats
const MAX = DBFX_TUNE.max;
const F = 18;
// 0 x 1 y 2 z 3 vx 4 vy 5 vz 6 age 7 life 8 drag 9 gravity 10 wait (s) 11 floor y 12 glyph (-1: by its
// motion) 13 ramp 14 alpha 15 kind (0 spark, 1 hanging line, 2 shard, 3 crescent, 4 ember, 5 bolt/arc) 16 fade 17 -
const D = new Float32Array(MAX * F);
let count = 0;

/** A free record (full: the oldest gives way). */
function take() {
  if (count < MAX) return count++ * F;
  let o = 0, best = -1;
  for (let i = 0; i < count; i++) {
    const a = D[i * F + 6] / Math.max(0.01, D[i * F + 7]);
    if (a > best) {
      best = a;
      o = i;
    }
  }
  return o * F;
}

/** One letter into the pool. */
function add(x, y, z, vx, vy, vz, life, drag, gravity, glyph, ramp, alpha, kind, wait, floor, fade) {
  if (!fin(x + y + z + vx + vy + vz)) return;
  const k = take();
  D[k] = x; D[k + 1] = y; D[k + 2] = z;
  D[k + 3] = vx; D[k + 4] = vy; D[k + 5] = vz;
  D[k + 6] = 0; D[k + 7] = life; D[k + 8] = drag; D[k + 9] = gravity; D[k + 10] = wait; D[k + 11] = floor;
  D[k + 12] = glyph; D[k + 13] = ramp; D[k + 14] = alpha; D[k + 15] = kind; D[k + 16] = fade; D[k + 17] = 0;
  DBFX_LAST.spawned++;
}

// ---- the screen (as impactStamp.js), reused
const SC = { mpp: 0.025, px: 0, py: 0, cw: 5, ch: 8, ok: false };
function screen(game, x, y, z) {
  const S = SC, cam = game.camera, p = game.pipeline;
  S.ok = false;
  S.mpp = 0.025;
  S.cw = p?.artCell?.x > 0 ? p.artCell.x : 5;
  S.ch = p?.artCell?.y > 0 ? p.artCell.y : 8;
  const W = p?.width, H = p?.height, m = cam?.matrixWorldInverse?.elements, e = cam?.projectionMatrix?.elements;
  if (!m || !e || !(W > 8) || !(H > 8)) return S;
  const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
  if (!(vz > 0.2) || !fin(vx + vy + vz) || !(e[5] > 0)) return S;
  const mpp = (2 * vz) / (H * e[5]);
  const px = (((vx * e[0]) / vz) * 0.5 + 0.5) * W, py = (((vy * e[5]) / vz) * 0.5 + 0.5) * H;
  if (!fin(mpp + px + py) || !(mpp > 1e-5)) return S;
  S.mpp = mpp;
  S.px = px;
  S.py = py;
  S.ok = true;
  return S;
}

// the plane of the screen at the contact: a point at (sx, sy) m from it (right, up on the screen)
let AX = null;
const wx = (cx, sx, sy) => cx + AX.rx * sx + AX.ux * sy;
const wy = (cy, sx, sy) => cy + AX.ry * sx + AX.uy * sy;
const wz = (cz, sx, sy) => cz + AX.rz * sx + AX.uz * sy;
/** A screen-plane velocity into the world. */
const vxw = (sx, sy) => AX.rx * sx + AX.ux * sy;
const vyw = (sx, sy) => AX.ry * sx + AX.uy * sy;
const vzw = (sx, sy) => AX.rz * sx + AX.uz * sy;

/** The stroke glyph that runs along a screen angle. */
function strokeOf(ang) {
  ang = ((ang % Math.PI) + Math.PI) % Math.PI;
  const e = Math.PI / 8;
  return ang < e || ang >= 7 * e ? G_DASH : ang < 3 * e ? G_SLASH : ang < 5 * e ? G_BAR : G_BACK;
}
/** Metres between two letters along a screen direction (one letter a column or row it crosses). */
const stepAlong = (ang, cellM, rowM) => 1 / Math.max(Math.abs(Math.cos(ang)) / cellM, Math.abs(Math.sin(ang)) / rowM, 1e-3);

// ---- the heat flashes (the body of a blow): pooled, one copy of each alive per frame
const NF = 4;
const flashes = Array.from({ length: NF }, () => ({ alive: false, x: 0, y: 0, z: 0, mpp0: 0.025, age: 0, life: 0.08, shape: 0, rad: 2, heat: 0.7, rim: 0.4, kind: 0 }));
let fxNow = 0, deadline = -1;
const copyLife = (d) => Math.max(0.021, d * 1.6);
const B = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.3, sizeEnd: 0.3, heat: 1, heatEnd: 1, kind: 0, drag: 0, gravity: 0 };
let flashLive = 0; // (alive flashes after the newest update)

/** The cell offsets (i, j) of a flash into a reused list, shape 0: a disc of `rad` cells (a bloom, hottest
 *  at the centre), 1: a plus of arm `rad`. Returns the count. */
const MAXC = 200;
const CI = new Int16Array(MAXC), CJ = new Int16Array(MAXC), CH = new Float32Array(MAXC);
function cells(Fl, cw, ch) {
  let n = 0;
  const r = Fl.rad;
  if (Fl.shape === 0) {
    const ri = Math.ceil(r), rj = Math.ceil((r * cw) / ch);
    for (let j = -rj; j <= rj; j++) {
      for (let i = -ri; i <= ri; i++) {
        const d = Math.hypot(i * cw, j * ch) / (r * cw);
        if (d > 1 || n >= MAXC) continue;
        CI[n] = i;
        CJ[n] = j;
        CH[n++] = Fl.heat + (Fl.rim - Fl.heat) * d;
      }
    }
  } else {
    CI[n] = 0;
    CJ[n] = 0;
    CH[n++] = Fl.heat;
    const arm = Math.max(1, Math.round(r));
    for (let k = 1; k <= arm && n < MAXC - 4; k++) {
      const h = Fl.heat + (Fl.rim - Fl.heat) * (k / (arm + 1));
      CI[n] = k; CJ[n] = 0; CH[n++] = h;
      CI[n] = -k; CJ[n] = 0; CH[n++] = h;
      CI[n] = 0; CJ[n] = k; CH[n++] = h;
      CI[n] = 0; CJ[n] = -k; CH[n++] = h;
    }
  }
  return n;
}

/** Write flash Fl as heat blobs living `life` s, snapped to the letter cells. Returns the cells written. */
function drawFlash(game, Fl, life) {
  const Fire = game.fx?.fire;
  if (!Fire?.spawn) return 0;
  const T = DBFX_TUNE.flash;
  AX = axes(game);
  const hp = game.player?.position;
  let hx = 0, hy = 0, hrx = 0, hry = 0;
  if (hp && fin(hp.x + hp.y + hp.z)) {
    const Q = screen(game, hp.x, hp.y + T.hero.foot, hp.z);
    const fx = Q.px, fy = Q.py, ok = Q.ok;
    screen(game, hp.x, hp.y + T.hero.head, hp.z);
    if (ok && Q.ok) {
      hx = (fx + Q.px) * 0.5;
      hy = (fy + Q.py) * 0.5;
      hrx = T.hero.rx / Q.mpp;
      hry = Math.hypot(Q.px - fx, Q.py - fy) * 0.5 + T.hero.pad / Q.mpp;
    }
  }
  const P = screen(game, Fl.x, Fl.y, Fl.z);
  const cw = P.cw, ch = P.ch, mpp = P.mpp, ok = P.ok, px = P.px, py = P.py;
  const nc = cells(Fl, cw, ch);
  let x = Fl.x, y = Fl.y, z = Fl.z;
  if (ok) {
    const ox = ((Math.floor(px / cw) + 0.5) * cw - px) * mpp, oy = ((Math.floor(py / ch) + 0.5) * ch - py) * mpp;
    x += AX.rx * ox + AX.ux * oy;
    y += AX.ry * ox + AX.uy * oy;
    z += AX.rz * ox + AX.uz * oy;
  }
  const ax0 = ok ? (Math.floor(px / cw) + 0.5) * cw : 0, ay0 = ok ? (Math.floor(py / ch) + 0.5) * ch : 0;
  B.life = life;
  B.size = B.sizeEnd = T.px * (cw / 5) * mpp;
  B.kind = Fl.kind;
  let n = 0;
  for (let k = 0; k < nc; k++) {
    if (hrx > 0 && ok) {
      const ex = (ax0 + CI[k] * cw - hx) / hrx, ey = (ay0 + CJ[k] * ch - hy) / hry;
      if (ex * ex + ey * ey < 1) continue; // (never written over the hero)
    }
    const ox = CI[k] * cw * mpp, oy = CJ[k] * ch * mpp;
    B.x = x + AX.rx * ox + AX.ux * oy;
    B.y = y + AX.ry * ox + AX.uy * oy;
    B.z = z + AX.rz * ox + AX.uz * oy;
    if (!(B.y >= T.minY) || !fin(B.x + B.z)) continue;
    B.heat = B.heatEnd = CH[k];
    if (Fire.spawn(B) >= 0) n++;
  }
  DBFX_LAST.heatCells += n;
  return n;
}

function startFlash(game, x, y, z, shape, rad, heat, rim, kind, last) {
  const T = DBFX_TUNE.flash;
  let S = flashes[0];
  for (const f of flashes) {
    if (!f.alive) {
      S = f;
      break;
    }
    if (f.age > S.age) S = f;
  }
  // the anchor: pulled toward the camera along the view ray (it does not move on screen)
  let ax = x, ay = y, az = z;
  const cam = game.camera?.position;
  if (cam) {
    const dx = cam.x - x, dy = cam.y - y, dz = cam.z - z, l = Math.hypot(dx, dy, dz);
    if (l > T.pull * 1.5 && fin(l)) {
      ax += (dx / l) * T.pull;
      ay += (dy / l) * T.pull;
      az += (dz / l) * T.pull;
    }
  }
  S.alive = true;
  S.x = ax; S.y = ay; S.z = az;
  S.age = 0;
  S.life = last ? T.lifeLast : T.life;
  S.shape = shape; S.rad = rad; S.heat = heat; S.rim = rim; S.kind = kind;
  const dt = Math.max(0, fin(game.fxDt) ? game.fxDt : 1 / 60);
  let life;
  if (deadline > fxNow + dt) life = deadline - fxNow;
  else {
    life = copyLife(dt);
    deadline = fxNow + life;
  }
  drawFlash(game, S, life);
}

// ---- the four looks
const FIRE = FIRE_KIND.fire, STEEL = FIRE_KIND.steel;
let prevAng = 0, side = 1; // b: the last line's angle, and which way the next one turns
let snapIn = -1, snapX = 0, snapY = 0, snapZ = 0; // b: the finisher's line hangs a moment, then every line snaps
let flip = 1; // d: the crescent's sweep alternates

/** a: STEEL BLOOM */
function lookA(game, x, y, z, ang, i, last, floor, cellM) {
  const rad = last ? 8 : Math.min(5, 2 + 0.5 * (i - 1));
  startFlash(game, x, y, z, 0, rad, 0.72, 0.42, FIRE, last);
  const ns = last ? 20 : Math.min(18, 11 + i);
  for (let k = 0; k < ns; k++) {
    const heavy = k < (last ? 3 : 2);
    const a = ang + R(-0.9, 0.9);
    const sp = heavy ? R(4, 4.4) : R(4, 7);
    const sx = Math.cos(a) * sp, sy = Math.sin(a) * sp + R(0.2, 1.2);
    const life = heavy ? R(0.35, 0.44) : R(0.12, 0.3);
    const drag = heavy ? R(9.5, 11) : sp / R(0.12, 0.56);
    add(x, y, z, vxw(sx, sy), vyw(sx, sy), vzw(sx, sy), life, drag, heavy ? -13 : -9.8, -1, 0, 1, 0, rnd() < 0.5 ? 0 : 1 / 60, floor, 0.25);
  }
  const ne = last ? 16 : Math.min(8, 3 + i);
  for (let k = 0; k < ne; k++) {
    const a = R(0, TAU), sp = R(0.2, 1.0);
    const sx = Math.cos(a) * sp, sy = Math.sin(a) * sp * 0.5 + 0.3;
    const o = R(0, 0.25);
    add(x + vxw(Math.cos(a) * o, Math.sin(a) * o), y + vyw(Math.cos(a) * o, Math.sin(a) * o), z + vzw(Math.cos(a) * o, Math.sin(a) * o), vxw(sx, sy), vyw(sx, sy), vzw(sx, sy),
      last ? R(0.55, 0.72) : R(0.35, 0.5), 2, -1.2, rnd() < 0.5 ? G_DOT : G_COMMA, 0, 0.7, 4, R(0, 0.07), floor, 0.35);
  }
}

/** b: SHATTER WEB */
function lookB(game, x, y, z, ang, i, last, floor, cellM, rowM) {
  startFlash(game, x, y, z, 1, last ? 3 : 1 + Math.min(1, i / 5), 0.58, 0.45, STEEL, last);
  // each new line turns across the last
  let a = i === 1 ? ang : prevAng + side * R(0.5, 0.95);
  if (i === 1) side = rnd() < 0.5 ? -1 : 1;
  else side = -side;
  prevAng = a;
  const len = Math.min(4.2, 3 + 0.15 * (i - 1) + (last ? 0.5 : 0));
  const step = stepAlong(a, cellM, rowM);
  const n = Math.max(2, Math.floor(len / step));
  const g = strokeOf(a), ca = Math.cos(a), sa = Math.sin(a);
  const off = R(-0.12, 0.12), ox = -sa * off, oy = ca * off;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), t = (u - 0.5) * len;
    const al = 0.55 + 0.45 * (1 - Math.pow(Math.abs(2 * u - 1), 2));
    const sx = ox + ca * t, sy = oy + sa * t;
    add(wx(x, sx, sy), wy(y, sx, sy), wz(z, sx, sy), 0, 0, 0, 0.35, 0, 0, g, 2, al, 1, Math.abs(2 * u - 1) * 0.06, -1e9, 0.3);
  }
  if (last) {
    snapIn = 0.12;
    snapX = x;
    snapY = y;
    snapZ = z;
  }
}

/** The finisher's snap: every hanging line breaks into shards that fly outward and fall. */
function snap(floor) {
  for (let i = 0; i < count; i++) {
    const k = i * F;
    if (D[k + 15] !== 1) continue;
    let dx = D[k] - snapX, dy = D[k + 1] - snapY, dz = D[k + 2] - snapZ;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const sp = R(1.2, 3.4) * (0.6 + Math.min(1, l / 2));
    D[k + 3] = dx * sp + R(-0.3, 0.3);
    D[k + 4] = dy * sp + R(0.4, 1.4);
    D[k + 5] = dz * sp + R(-0.3, 0.3);
    D[k + 6] = 0;
    D[k + 7] = R(0.35, 0.55);
    D[k + 8] = 3;
    D[k + 9] = -7;
    D[k + 10] = 0;
    D[k + 11] = floor;
    D[k + 14] = R(0.7, 1);
    D[k + 15] = 2;
    D[k + 16] = 0.4;
    if (rnd() < 0.45) D[k + 12] = rnd() < 0.5 ? G_TICK : G_DOT;
    DBFX_LAST.snapped++;
  }
}

/** c: STORM CRACK */
function lookC(game, x, y, z, ang, i, last, floor, cellM, rowM) {
  startFlash(game, x, y, z, 1, last ? 3 : 1, last ? 0.7 : 0.55, 0.45, STEEL, last);
  const np = last || i >= 4 ? 3 : 2;
  const segs = Math.min(7, 4 + (i >> 1));
  for (let p = 0; p < np; p++) {
    let sx = R(-0.35, 0.35), sy = R(-0.2, 0.6), h = R(0, TAU), run = 0;
    const w0 = p * 0.012;
    for (let s = 0; s < segs; s++) {
      const L = R(0.18, 0.32);
      const step = stepAlong(h, cellM, rowM), n = Math.max(1, Math.round(L / step));
      const gl = strokeOf(h), c = Math.cos(h), sn = Math.sin(h);
      for (let k = 0; k < n; k++) {
        const t = ((k + 1) / n) * L, px = sx + c * t, py = sy + sn * t;
        add(wx(x, px, py), wy(y, px, py), wz(z, px, py), 0, 0, 0, R(0.09, 0.14), 0, 0, gl, 3, 0.9, 5, w0 + (run + t) * 0.012, -1e9, 0.3);
      }
      sx += c * L;
      sy += sn * L;
      run += L;
      h += (s & 1 ? -1 : 1) * R(0.6, 1.2);
    }
  }
  if (!last) return;
  // the bolt: ~4 m of letters from above, straight down through him to the floor, then it crackles out
  const rows = Math.max(4, Math.round(4 / (rowM / Math.max(0.5, Math.abs(AX.uy)))));
  const dy = Math.max(0.05, (y + 4 - floor) / rows);
  let sx = 0, prev = 0;
  for (let j = 0; j <= rows; j++) {
    const yy = y + 4 - j * dy;
    sx += j > 0 && j < rows ? R(-0.5, 0.5) * cellM : 0;
    sx = clamp(sx, -0.14, 0.14);
    const dxs = sx - prev;
    prev = sx;
    add(x + AX.rx * sx, yy, z + AX.rz * sx, 0, 0, 0, 0.15, 0, 0, dxs > 1e-4 ? G_SLASH : dxs < -1e-4 ? G_BACK : G_BAR, 3, 1, 5, (j / rows) * 0.07, -1e9, 0.35);
  }
  for (let p = 0; p < 3; p++) {
    // (out along the floor's line on screen, both ways)
    const h = p === 1 ? 0 : p === 0 ? Math.PI + R(-0.3, 0.3) : R(-0.3, 0.3);
    let px = 0, py = y - floor > 0 ? -(y - floor) * Math.abs(AX.uy) : 0, hh = h;
    for (let s = 0; s < 3; s++) {
      const L = R(0.14, 0.26), step = stepAlong(hh, cellM, rowM), n = Math.max(1, Math.round(L / step)), gl = strokeOf(hh);
      for (let k = 0; k < n; k++) {
        const t = ((k + 1) / n) * L, qx = px + Math.cos(hh) * t, qy = py + Math.sin(hh) * t * 0.6;
        add(wx(x, qx, qy), Math.max(floor + 0.05, wy(y, qx, qy)), wz(z, qx, qy), 0, 0, 0, R(0.1, 0.16), 0, 0, gl, 3, 0.8, 5, 0.16 + p * 0.03 + s * 0.04, -1e9, 0.3);
      }
      px += Math.cos(hh) * L;
      py += Math.sin(hh) * L * 0.6;
      hh += (s & 1 ? -1 : 1) * R(0.5, 1.0);
    }
  }
}

/** d: GOLD CRESCENT */
function lookD(game, x, y, z, ang, i, last, floor, cellM, rowM, a0, a1) {
  startFlash(game, x, y, z, 0, last ? 2.5 : 1.2, 0.6, 0.4, FIRE, last);
  let mid, span;
  if (fin(a0) && fin(a1)) {
    // (the swing's middle by the short way round)
    const dlt = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    mid = a0 + dlt / 2;
    span = clamp(Math.abs(dlt), 0.8, 1.5);
    flip = dlt >= 0 ? 1 : -1;
  } else {
    mid = ang;
    span = 1.2;
    flip = -flip;
  }
  if (last) span = 2.2;
  const Rr = last ? 1.9 : 1.6 + 0.02 * i;
  const rows = last ? 2 : 1;
  // the arc passes through the contact: its centre sits R behind it along `mid`
  const ccx = -Math.cos(mid) * Rr, ccy = -Math.sin(mid) * Rr;
  for (let r = 0; r < rows; r++) {
    const rr = Rr - r * 0.13;
    let a = mid - span / 2;
    const aEnd = mid + span / 2;
    while (a <= aEnd) {
      const tang = a + Math.PI / 2, step = stepAlong(tang, cellM, rowM);
      const u = (a - (mid - span / 2)) / span;
      const sx = ccx + Math.cos(a) * rr, sy = ccy + Math.sin(a) * rr;
      const tx = Math.cos(tang) * flip, ty = Math.sin(tang) * flip;
      const sp = R(0.8, 1.4);
      const life = R(0.34, 0.46) * (last ? 1.1 : 1);
      add(wx(x, sx, sy), wy(y, sx, sy), wz(z, sx, sy), vxw(tx * sp, ty * sp), vyw(tx * sp, ty * sp), vzw(tx * sp, ty * sp), life, 4, -3, strokeOf(tang), 1, 0.9, 3,
        (flip > 0 ? u : 1 - u) * 0.06, floor, 0.3);
      a += step / rr;
    }
  }
  if (last) {
    for (let k = 0; k < 8; k++) {
      const u = R(0, 1), a = mid - span / 2 + span * u, sx = ccx + Math.cos(a) * Rr, sy = ccy + Math.sin(a) * Rr;
      add(wx(x, sx, sy), wy(y, sx, sy), wz(z, sx, sy), R(-0.3, 0.3), R(0, 0.4), R(-0.3, 0.3), R(0.35, 0.55), 1.5, -2.5, rnd() < 0.5 ? G_DOT : G_COMMA, 1, 0.8, 4, R(0.1, 0.2), floor, 0.35);
    }
  }
}

/**
 * THE EXIT: every blow goes THROUGH him. On the far side of his body, along the blow's direction, the blade's
 * tip stands out (a short straight streak of letters, held a beat on a thrust) and letters spray out of his
 * back in the look's own colours. Grows with the blow's number; the finisher's is the largest.
 */
function exitBurst(game, o, mode, ang, i, last, floor) {
  const ramp = mode === 'b' ? 2 : mode === 'c' ? 3 : mode === 'd' ? 1 : 0;
  let dx = fin(o.dx) ? o.dx : 0, dz = fin(o.dz) ? o.dz : 1;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  const depth = last ? 0.75 : 0.6, x = o.x + dx * depth, z = o.z + dz * depth, y = o.y;
  const thrust = o.thrust === true;
  // the tip: a straight streak out of his back along the blow, on the screen's cell grid
  const S = screen(game, x, y, z), cellM = S.cw * S.mpp, rowM = S.ch * S.mpp;
  const g = strokeOf(ang), len = (thrust ? 1.4 : 0.8) + (last ? 0.4 : 0), step = stepAlong(ang, cellM, rowM), nt = Math.max(3, Math.min(14, Math.floor(len / step)));
  const hold = thrust ? 0.12 : last ? 0.1 : 0.07;
  for (let k = 0; k < nt; k++) {
    const u = k / (nt - 1), t = u * len;
    add(x + dx * t, y + R(-0.03, 0.03), z + dz * t, 0, 0, 0, hold * (1 - 0.4 * u), 0, 0, g, ramp, 0.9 - 0.4 * u, 5, u * 0.02, -1e9, 0.35);
  }
  // the spray: letters thrown out of his back (the far side), fanned across the blow's direction
  const ns = last ? 30 : Math.min(18, 6 + 2 * i);
  for (let k = 0; k < ns; k++) {
    const sp = R(3.5, 7.5) * (last ? 1.2 : 1), fan = R(-0.5, 0.5), c = Math.cos(fan), sn = Math.sin(fan);
    const vx = (dx * c - dz * sn) * sp, vz = (dx * sn + dz * c) * sp, vy = R(-0.4, 2.2);
    add(x + R(-0.12, 0.12), y + R(-0.3, 0.3), z + R(-0.12, 0.12), vx, vy, vz, R(0.16, 0.4), sp / R(0.15, 0.5), -9, -1, ramp, 1, 0, 0, floor, 0.3);
  }
}

/**
 * One blow of the combo lands. o: { x, y, z (contact, m), dx, dz (the blow's direction on the floor, unit),
 * i (1..n), n, last, a0, a1 (the blade's swing on the screen, rad; may be NaN), thrust (the blow is a thrust) }. Returns the letters now
 * alive; never throws.
 */
export function deathblowHit(game, o) {
  try {
    if (!game || !o) return 0;
    const x = o.x, y = o.y, z = o.z;
    if (!fin(x + y + z)) return 0;
    const P = DBFX_LAST;
    P.hits++;
    const mode = DB_FX.mode;
    P.mode = mode;
    seed = (Math.imul(P.hits + 11, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
    AX = axes(game);
    const i = clamp(Math.round(fin(o.i) ? o.i : 1), 1, 99), last = !!o.last;
    let ang = fin(o.dx + o.dz) ? screenAngle(AX, o.dx, 0, o.dz) : NaN;
    if (!fin(ang)) ang = fin(o.a1) ? o.a1 : 0.5;
    const S = screen(game, x, y, z);
    const cellM = S.cw * S.mpp, rowM = S.ch * S.mpp;
    const py = game.player?.position?.y;
    const floor = fin(py) ? Math.min(py, y - 0.05) : y - 1.2;
    if (mode === 'b') lookB(game, x, y, z, ang, i, last, floor, cellM, rowM);
    else if (mode === 'c') lookC(game, x, y, z, ang, i, last, floor, cellM, rowM);
    else if (mode === 'd') lookD(game, x, y, z, ang, i, last, floor, cellM, rowM, o.a0, o.a1);
    else lookA(game, x, y, z, ang, i, last, floor, cellM);
    exitBurst(game, o, mode, ang, i, last, floor);
    P.alive = count;
    if (count > P.peak) P.peak = count;
    return count;
  } catch {
    return 0;
  }
}

// ---- the colour
const COL = [0, 0, 0];
function rampCol(id, t) {
  const A = DBFX_TUNE.ramps[id] ?? DBFX_TUNE.ramps[0];
  t = clamp(t, 0, 1);
  let i = 1;
  while (i < A.length - 1 && A[i][0] < t) i++;
  const a = A[i - 1], b = A[i], u = (t - a[0]) / (b[0] - a[0] || 1);
  COL[0] = a[1] + (b[1] - a[1]) * u;
  COL[1] = a[2] + (b[2] - a[2]) * u;
  COL[2] = a[3] + (b[3] - a[3]) * u;
  return COL;
}

// ---- the letters: one LetterBatch per game, made the first time a blow is drawn
let BG = null, BB = null, BFAIL = null;
function batch(game) {
  if (BG === game) return BB;
  const pl = game?.pipeline;
  if (BFAIL === game || typeof pl?.registerParticles !== 'function' || !game.U?.uResolution) return null;
  const mr = Math.random;
  Math.random = rnd; // (three.js's uuids: never the sims' stream)
  try {
    const b = new LetterBatch(game, MAX, CHARS, { additive: false, spawned: 0, rand: rnd });
    b.uniforms.uSoft.value = 0.25;
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

const COLS = new Float32Array(DEATHBLOW_FX_GLYPHS.length);
function draw(game) {
  const b = batch(game), P = DBFX_LAST, T = DBFX_TUNE;
  if (b) b.begin();
  if (count) {
    AX = axes(game);
    const cp = game?.camera?.position;
    if (b) for (let i = 0; i < COLS.length; i++) COLS[i] = b.col(DEATHBLOW_FX_GLYPHS[i]);
    for (let i = 0; i < count; i++) {
      const k = i * F;
      if (D[k + 10] > 0) continue;
      const t = D[k + 6] / D[k + 7], kind = D[k + 15];
      let g = D[k + 12];
      if (kind === 3 && t > 0.55) g = t > 0.8 ? G_DOT : G_TICK; // (the crescent crumbles to embers)
      const c = rampCol(D[k + 13], t);
      const fade = D[k + 16], a = (t > 1 - fade ? clamp((1 - t) / fade, 0, 1) : 1) * D[k + 14];
      const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
      if (mx > P.maxCh) P.maxCh = mx;
      if (mn > 0.6 * mx) P.white++;
      if (g < 0) {
        // by its screen motion this frame, in letter cells: a stroke along it, a tick, a dot
        const vx = D[k + 3], vy = D[k + 4], vz = D[k + 5];
        const sx = vx * AX.rx + vy * AX.ry + vz * AX.rz, sy = vx * AX.ux + vy * AX.uy + vz * AX.uz;
        const s = screen(game, D[k], D[k + 1], D[k + 2]);
        const cells = s.ok ? Math.hypot(sx, sy) / s.mpp / 60 / s.cw : Math.hypot(sx, sy) / 60 / 0.12;
        if (cells > T.stroke) g = strokeOf(Math.atan2(sy, sx));
        else g = cells > T.tick ? G_TICK : G_DOT;
      }
      P.drawn++;
      if (!b) continue;
      let px = D[k], py = D[k + 1], pz = D[k + 2];
      if (cp) {
        const dx = cp.x - px, dy = cp.y - py, dz = cp.z - pz, l = Math.hypot(dx, dy, dz);
        if (l > T.pull * 2 && fin(l)) {
          px += (dx / l) * T.pull;
          py += (dy / l) * T.pull;
          pz += (dz / l) * T.pull;
        }
      }
      b.put(px, py, pz, 0, COLS[g], 0, c, a);
    }
  }
  if (b) b.end();
}

/**
 * Per frame (the player's fx update). r: real s (this runs on the real clock, through the hit-stop and
 * the slow motion). Never throws.
 */
export function deathblowFxUpdate(game, realDt) {
  try {
    if (!(realDt > 0)) return; // (a pause)
    const P = DBFX_LAST;
    const dB = fin(game?.fxDt) && game.fxDt > 0 ? game.fxDt : realDt;
    fxNow += dB;
    // the heat: age, then one copy of each alive flash for the next frame
    let any = false;
    for (const S of flashes) {
      if (!S.alive) continue;
      S.age += realDt;
      if (S.age >= S.life) S.alive = false;
      else any = true;
    }
    flashLive = 0;
    for (const S of flashes) if (S.alive) flashLive++;
    P.flash = flashLive;
    if (any && game?.fx?.fire?.spawn && fxNow + dB >= deadline) {
      const life = copyLife(dB);
      deadline = fxNow + life;
      for (const S of flashes) if (S.alive) drawFlash(game, S, life);
    }
    // the finisher's snap
    if (snapIn >= 0) {
      snapIn -= realDt;
      if (snapIn < 0) {
        const py = game?.player?.position?.y;
        snap(fin(py) ? Math.min(py, snapY - 0.05) : snapY - 1.2);
        snapIn = -1;
      }
    }
    if (!count) return;
    let w = 0;
    for (let i = 0; i < count; i++) {
      const k = i * F;
      if (D[k + 10] > 0) {
        D[k + 10] -= realDt;
        if (w !== i) D.copyWithin(w * F, k, k + F);
        w++;
        continue;
      }
      D[k + 6] += realDt;
      const dr = Math.exp(-D[k + 8] * realDt);
      D[k + 3] *= dr;
      D[k + 5] *= dr;
      const crumbling = D[k + 15] !== 3 || D[k + 6] > 0.55 * D[k + 7];
      D[k + 4] = D[k + 4] * dr + (crumbling ? D[k + 9] * realDt : 0);
      D[k] += D[k + 3] * realDt;
      D[k + 1] += D[k + 4] * realDt;
      D[k + 2] += D[k + 5] * realDt;
      if (!fin(D[k] + D[k + 1] + D[k + 2] + D[k + 3] + D[k + 4] + D[k + 5])) {
        P.bad++;
        continue;
      }
      if (D[k + 1] <= D[k + 11] || D[k + 6] >= D[k + 7]) continue; // (the floor, or its life)
      if (w !== i) D.copyWithin(w * F, k, k + F);
      w++;
    }
    count = w;
    P.alive = w;
    if (w > P.peak) P.peak = w;
    draw(game);
  } catch {
    /* never freeze the frame */
  }
}

/** Drop everything (a fight reset, a level change). */
export function deathblowFxClear(game) {
  count = 0;
  snapIn = -1;
  deadline = -1;
  for (const S of flashes) S.alive = false;
  DBFX_LAST.alive = 0;
  DBFX_LAST.flash = 0;
  try {
    BB?.empty?.();
  } catch {
    /* (a lost context) */
  }
}

/** Anything still alive (tests): the letters, the flashes, a snap pending. */
export const deathblowFxBusy = () => count > 0 || flashes.some((f) => f.alive) || snapIn >= 0;
