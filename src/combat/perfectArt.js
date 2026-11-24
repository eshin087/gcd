import { axes, screenAngle } from './clashFx.js';
import { LetterBatch } from '../world/life/letterBatch.js';

// SUBTLE EPIC ASCII VARIATIONS FOR PERFECT PARRY & PERFECT DODGE (?perfectArt=0|a|b|c; Lab 'streak' row).
//
//   0   default (today's `sharp` look, untouched: zero allocations, zero RNG draws, zero GPU work)
//   a   "Whispered Steel & Silk" — clumped micro-letter shear ribbons that curl on the wind, a crisp
//       silhouette-stroked pixel-font husk that peels into a silk wisp, and a boss ASCII ripple
//   b   "Severed Moment" — a 1-cell grid-snapped typographic horizon cut that fractures into falling
//       type over a brief shadow hush, blade-edge counter script, and 3 stroboscopic ASCII echoes
//   c   "Wuxia Qi Shock" — a concentric ground shock-ring of tiny directional strokes + dark trough,
//       a curved deflection crescent with floor-skittering code sparks, and helical vortex reassembly
//
// Every letter prints in THE HOUSE LETTER (wyrmGlyphs.js: 5 x 8 px at 720p, 4 x 6 on a phone, 6 x 9 at
// 1080p) via LetterBatch, pulled slightly along the camera ray so ground/body depth-fade never eats
// low strokes, and kept below whiteout bloom so individual characters stay razor-sharp.

export const PERFECT_ART_MODES = ['0', 'a', 'b', 'c'];
/** The owner's pick (2026-11-23): A · Whispered Steel & Silk (`?perfectArt=0` restores the look before; `b` / `c` keep the other options). */
export const PERFECT_ART_DEFAULT = 'a';
export const PERFECT_ART_NAMES = Object.freeze({
  '0': '0 (before)',
  a: 'a (silk)',
  b: 'b (sever)',
  c: 'c (qi)',
});

// Every character here exists in FONT_3X5, FONT_4X6 and FONT_5X7 (wyrmGlyphs.js) AND world SRC.
const HOUSE_CHARS = ".:;'!ivr0123456789A@-/|\\,`~=*+";
const DIGITS_DIM = '17ivr.:;';
const DIGITS_MID = '01234789iv';
const PUNCT = ".,':;`";
const WISP_CHARS = "~-.,'`17";
const SPARK_CHARS = "71*+':.";

const TAU = Math.PI * 2;
const PULL_M = 0.92; // m along camera ray so LetterBatch uSoft (0.6m) never erases ground/body letters
const fin = (v) => Number.isFinite(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

// Module-local deterministic LCG (never Math.random: seeded fight suites stay identical).
let pseed = 0x3c6ef372;
const rnd = () => (pseed = (Math.imul(pseed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + (b - a) * rnd();

function withRand(fn) {
  const mr = Math.random;
  Math.random = rnd;
  try {
    return fn();
  } finally {
    Math.random = mr;
  }
}

const readUrl = () => {
  try {
    if (typeof location === 'undefined') return '0'; // headless: off by default so seeded suites stay untouched
    const v = new URLSearchParams(location.search).get('perfectArt');
    if (v === 'default' || v === 'off') return '0';
    if (v === 'silk') return 'a';
    if (v === 'sever') return 'b';
    if (v === 'qi') return 'c';
    return PERFECT_ART_MODES.includes(v) ? v : PERFECT_ART_DEFAULT;
  } catch {
    return '0';
  }
};

let artMode = readUrl();
export const perfectArtMode = () => artMode;
export const setPerfectArtMode = (m) => {
  artMode = PERFECT_ART_MODES.includes(m) ? m : '0';
  return artMode;
};
/** True when a non-zero ASCII variation is active AND a WebGL pipeline can render LetterBatch. */
export const perfectArtCanDraw = (game) => artMode !== '0' && typeof game?.pipeline?.registerParticles === 'function';

// Pre-ACES linear RGB kept strictly below the bloom threshold (~0.85) except 1-2 focal contact cells,
// paired with a normal-blended dark-ink backing so every 5x8 px character reads razor-sharp with ZERO white blot.
export const PERFECT_ART_TUNE = Object.freeze({
  a: {
    kiss: [1.25, 1.02, 0.52],
    ribbonHi: [0.68, 0.55, 0.28],
    ribbonLo: [0.28, 0.22, 0.12],
    dust: [0.34, 0.32, 0.28],
    huskRim: [0.52, 0.68, 0.88],
    huskFill: [0.16, 0.23, 0.36],
    wispHi: [0.48, 0.64, 0.84],
    wispLo: [0.18, 0.27, 0.42],
    inkBack: [0.015, 0.02, 0.035],
  },
  b: {
    kiss: [1.3, 1.18, 0.82],
    lineHi: [0.76, 0.68, 0.46],
    lineLo: [0.32, 0.3, 0.24],
    script: [0.54, 0.72, 0.92],
    echo0: [0.5, 0.66, 0.86],
    echo1: [0.3, 0.42, 0.6],
    echo2: [0.18, 0.26, 0.4],
    rail: [0.42, 0.58, 0.78],
    inkBack: [0.015, 0.02, 0.035],
    dimAmt: 0.24,
    dimHold: 0.15,
  },
  c: {
    kiss: [1.28, 1.02, 0.5],
    ringHi: [0.68, 0.54, 0.28],
    ringLo: [0.3, 0.24, 0.13],
    trough: [0.015, 0.02, 0.03],
    sparkHi: [0.84, 0.64, 0.28],
    sparkLo: [0.34, 0.2, 0.08],
    vortexHi: [0.54, 0.72, 0.92],
    vortexLo: [0.2, 0.32, 0.5],
    inkBack: [0.015, 0.02, 0.035],
  },
});

export const PERFECT_ART_LAST = {
  parries: 0,
  dodges: 0,
  mode: '0',
  snapPeak: 0,
  flowPeak: 0,
  dimPeak: 0,
};

const STATES = new WeakMap();

// Free-particle stride:
// 0 x, 1 y, 2 z, 3 vx, 4 vy, 5 vz, 6 age, 7 life, 8 drag, 9 grav, 10 bounceY,
// 11 r0, 12 g0, 13 b0, 14 r1, 15 g1, 16 b1, 17 a0, 18 a1, 19 col, 20 batch (0 flow, 1 snap, 2 dim), 21 windK
const PF = 22;
const MAX_FREE = 760;
const MAX_HUSK = 260;

function makeState(game) {
  let batches = null;
  if (typeof game?.pipeline?.registerParticles === 'function' && typeof document !== 'undefined') {
    batches = withRand(() => {
      const snap = new LetterBatch(game, 1500, HOUSE_CHARS, { additive: true, spawned: 0, snap: 1, rand: rnd });
      const flow = new LetterBatch(game, 1800, HOUSE_CHARS, { additive: true, spawned: 0, snap: 0, rand: rnd });
      const dim = new LetterBatch(game, 1200, HOUSE_CHARS, { additive: false, spawned: 0, snap: 1, rand: rnd });
      game.pipeline.registerParticles(dim);
      game.pipeline.registerParticles(flow);
      game.pipeline.registerParticles(snap);
      const strokes = [snap.col('-'), snap.col('/'), snap.col('|'), snap.col('\\')];
      const mapCols = (b, str) => [...str].map((ch) => b.col(ch)).filter((c) => c > 0);
      return {
        snap,
        flow,
        dim,
        strokes,
        digitsDim: mapCols(snap, DIGITS_DIM),
        digitsMid: mapCols(snap, DIGITS_MID),
        punct: mapCols(flow, PUNCT),
        punctDim: mapCols(dim, PUNCT),
        solidBack: dim.col('@'),
        wisp: mapCols(flow, WISP_CHARS),
        sparks: mapCols(flow, SPARK_CHARS),
        plus: snap.col('+'),
        star: snap.col('*'),
        colon: snap.col(':'),
        dot: snap.col('.'),
        tick: snap.col("'"),
        eq: snap.col('='),
        tilde: snap.col('~'),
      };
    });
  }
  return {
    batches,
    t: 0,
    free: new Float32Array(MAX_FREE * PF),
    nFree: 0,
    events: Array.from({ length: 6 }, () => ({
      on: false,
      kind: '',
      mode: 'a',
      age: 0,
      dur: 0.4,
      x: 0, y: 0, z: 0,
      nx: 0, ny: 0, nz: 0,
      dx: 1, dz: 0,
      a1: 0.7, a2: -0.7,
      gy: 0,
      seed: 1,
      flurry: false,
    })),
    husks: Array.from({ length: 3 }, () => ({
      on: false,
      mode: 'a',
      age: 0,
      stand: 0.14,
      tear: 0.16,
      n: 0,
      pos: new Float32Array(MAX_HUSK * 3),
      ord: new Float32Array(MAX_HUSK),
      rim: new Uint8Array(MAX_HUSK),
      done: new Uint8Array(MAX_HUSK),
      dx: 1, dz: 0,
      alpha: 0.75,
      echoIdx: 0,
    })),
    cells: new Map(),
    colTmp: [0, 0, 0],
    windTmp: { x: 0, z: 0, k: 0 },
    camPos: { x: 0, y: 20, z: 18, ok: false },
  };
}

function getState(game) {
  if (!game || typeof game !== 'object') return null;
  let S = STATES.get(game);
  if (!S) {
    S = makeState(game);
    STATES.set(game, S);
  }
  return S;
}

/** Write one letter pulled `PULL_M` toward the camera along its view ray (zero screen shift, no floor fade). */
function putPulled(S, batch, x, y, z, colIdx, rgb, a) {
  const cp = S.camPos;
  if (cp.ok) {
    const dx = cp.x - x, dy = cp.y - y, dz = cp.z - z;
    const l = Math.hypot(dx, dy, dz);
    if (l > PULL_M * 1.6) {
      const k = PULL_M / l;
      batch.put(x + dx * k, y + dy * k, z + dz * k, 0, colIdx, 0, rgb, a);
      return;
    }
  }
  batch.put(x, y, z, 0, colIdx, 0, rgb, a);
}

function strokeCol(strokes, dr, du) {
  const k = (du / (Math.abs(dr) + 1e-4)) * (dr < 0 ? -1 : 1);
  return k > 2.414 || k < -2.414 ? strokes[2] : k > 0.414 ? strokes[1] : k < -0.414 ? strokes[3] : strokes[0];
}

function pushFree(S, o) {
  if (S.nFree >= MAX_FREE) return;
  const d = S.free, k = S.nFree * PF;
  d[k] = o.x; d[k + 1] = o.y; d[k + 2] = o.z;
  d[k + 3] = o.vx ?? 0; d[k + 4] = o.vy ?? 0; d[k + 5] = o.vz ?? 0;
  d[k + 6] = o.age ?? 0; d[k + 7] = Math.max(0.02, o.life ?? 0.3);
  d[k + 8] = o.drag ?? 2; d[k + 9] = o.grav ?? 0; d[k + 10] = o.bounceY ?? -999;
  const c0 = o.c0, c1 = o.c1 ?? c0;
  d[k + 11] = c0[0]; d[k + 12] = c0[1]; d[k + 13] = c0[2];
  d[k + 14] = c1[0]; d[k + 15] = c1[1]; d[k + 16] = c1[2];
  d[k + 17] = o.a0 ?? 0.7; d[k + 18] = o.a1 ?? 0;
  d[k + 19] = o.col ?? 1; d[k + 20] = o.batch ?? 0; d[k + 21] = o.windK ?? 0;
  S.nFree++;
}

function allocEvent(S, kind, mode, dur) {
  let E = S.events[0];
  for (const q of S.events) {
    if (!q.on) { E = q; break; }
    if (q.age > E.age) E = q;
  }
  E.on = true;
  E.kind = kind;
  E.mode = mode;
  E.age = 0;
  E.dur = dur;
  E.flurry = false;
  E.seed = (Math.imul((PERFECT_ART_LAST.parries + PERFECT_ART_LAST.dodges + 1) | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  return E;
}

export const perfectArtSuppressesFlash = (mode = artMode) => mode === 'b';

/**
 * Trigger the subtle ASCII enhancement for a Perfect Parry at crossing (x, y, z).
 */
export function perfectArtParry(game, x, y, z, o = {}) {
  const mode = artMode;
  if (mode === '0' || !game || !fin(x + y + z)) return 0;
  try {
    const S = getState(game);
    PERFECT_ART_LAST.parries++;
    PERFECT_ART_LAST.mode = mode;
    const B = S?.batches;
    const A = axes(game);
    const p = game.player?.position;
    const px = fin(p?.x) ? p.x : x, pz = fin(p?.z) ? p.z : z;
    const gy = fin(game.world?.forest?.groundY) ? game.world.forest.groundY : fin(p?.y) ? Math.min(0.2, p.y) : 0;
    const cy = Math.max(gy + 0.75, y);

    let a1 = o.e1 ? screenAngle(A, o.e1.x, o.e1.y, o.e1.z) : NaN;
    let a2 = o.e2 ? screenAngle(A, o.e2.x, o.e2.y, o.e2.z) : NaN;
    if (!fin(a1)) a1 = 0.72;
    if (!fin(a2)) a2 = -0.78;
    let apart = Math.abs(a1 - a2) % Math.PI;
    if (apart > Math.PI / 2) apart = Math.PI - apart;
    if (apart < 0.35) a2 = a1 + 1.08;

    const rippleK = mode === 'c' ? 1.15 : mode === 'a' ? 0.95 : 0.8;
    if (o.attacker) {
      game.fx?.ripple?.hit?.(
        x, cy, z,
        { tier: o.big ? 'sweep' : 'point', target: o.attacker, crit: true, cut: o.e1 ?? null },
        rippleK,
      );
    }

    if (mode === 'a') {
      const T = PERFECT_ART_TUNE.a;
      game.world?.life?.litter?.scatter?.(px, pz, 2.8, 0.95);
      if (!B) return 1;
      const E = allocEvent(S, 'parryA', 'a', 0.42);
      E.x = x; E.y = cy; E.z = z; E.nx = px; E.nz = pz; E.gy = gy; E.a1 = a1; E.a2 = a2;

      // Two opposing tangential micro-letter shear ribbons peeling off the crossing and curling on wind.
      for (let side = -1; side <= 1; side += 2) {
        const baseA = a1 + (side < 0 ? Math.PI : 0);
        for (let i = 0; i < 52; i++) {
          const u = (i + rnd() * 0.5) / 52;
          const ang = baseA + R(-0.3, 0.3) * (0.3 + 0.7 * u) + side * u * 0.36;
          const dirX = A.rx * Math.cos(ang) + A.ux * Math.sin(ang);
          const dirY = A.ry * Math.cos(ang) + A.uy * Math.sin(ang);
          const dirZ = A.rz * Math.cos(ang) + A.uz * Math.sin(ang);
          const r0 = 0.06 + u * 0.28 + R(-0.02, 0.03);
          const sp = (2.6 + 6.4 * (1 - u * 0.5)) * R(0.8, 1.2);
          const hot = i < 4;
          const col = hot ? B.star : i % 3 === 0
            ? strokeCol(B.strokes, Math.cos(ang), Math.sin(ang))
            : B.wisp[(i * 5 + (side > 0 ? 1 : 0)) % B.wisp.length];
          pushFree(S, {
            x: x + dirX * r0, y: cy + dirY * r0 + R(-0.04, 0.04), z: z + dirZ * r0,
            vx: dirX * sp, vy: dirY * sp + R(-0.15, 0.65), vz: dirZ * sp,
            life: hot ? 0.12 : R(0.28, 0.48),
            drag: R(3.8, 6.2), grav: -0.7, windK: 1.35,
            c0: hot ? T.kiss : T.ribbonHi, c1: T.ribbonLo,
            a0: hot ? 0.95 : R(0.58, 0.8), a1: 0,
            col, batch: 0,
          });
        }
      }
      // Subtle boot ring of parting ground punctuation.
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU + R(-0.05, 0.05);
        const sp = R(2.4, 3.8);
        pushFree(S, {
          x: px + Math.cos(a) * 0.26, y: gy + 0.05, z: pz + Math.sin(a) * 0.26,
          vx: Math.cos(a) * sp, vy: R(0.05, 0.22), vz: Math.sin(a) * sp,
          life: R(0.3, 0.46), drag: 3.6, grav: -0.4, windK: 0.55,
          c0: T.dust, c1: T.ribbonLo, a0: 0.62, a1: 0,
          col: B.wisp[i % B.wisp.length], batch: 0,
        });
      }
      return 1;
    }

    if (mode === 'b') {
      const T = PERFECT_ART_TUNE.b;
      game.flow?.grade?.dimPulse?.(T.dimAmt, T.dimHold);
      game.world?.life?.hushFor?.(0.45, 0.75);
      if (!B) return 1;
      const E = allocEvent(S, 'parryB', 'b', 0.46);
      E.x = x; E.y = cy; E.z = z; E.nx = px; E.nz = pz; E.gy = gy; E.a1 = a1; E.a2 = a2;
      return 1;
    }

    if (mode === 'c') {
      const T = PERFECT_ART_TUNE.c;
      game.world?.gust?.(px, pz, 0.58, 4.0);
      game.world?.life?.litter?.scatter?.(px, pz, 3.4, 1.15);
      if (!B) return 1;
      const E = allocEvent(S, 'parryC', 'c', 0.38);
      E.x = x; E.y = cy; E.z = z; E.nx = px; E.nz = pz; E.gy = gy; E.a1 = a1; E.a2 = a2;
      const sprayA = o.spray ? screenAngle(A, o.spray.x, o.spray.y, o.spray.z) : a2 + Math.PI * 0.5;
      E.dx = fin(sprayA) ? sprayA : a1 + 1.2;

      for (let i = 0; i < 52; i++) {
        const fan = (fin(sprayA) ? sprayA : R(0, TAU)) + (i % 4 === 0 ? R(0, TAU) : R(-0.85, 0.85));
        const dirX = A.rx * Math.cos(fan) + A.ux * Math.sin(fan);
        const dirY = A.ry * Math.cos(fan) + A.uy * Math.sin(fan);
        const dirZ = A.rz * Math.cos(fan) + A.uz * Math.sin(fan);
        const sp = R(3.5, 9.2);
        const hot = i < 5;
        pushFree(S, {
          x: x + dirX * R(0.06, 0.18), y: cy + dirY * 0.1, z: z + dirZ * R(0.06, 0.18),
          vx: dirX * sp, vy: Math.max(0.9, dirY * sp + R(1.4, 4.2)), vz: dirZ * sp,
          life: R(0.36, 0.64), drag: 1.7, grav: -14.5, bounceY: gy + 0.05, windK: 0.35,
          c0: hot ? T.kiss : T.sparkHi, c1: T.sparkLo,
          a0: hot ? 0.95 : R(0.68, 0.88), a1: 0,
          col: B.sparks[i % B.sparks.length], batch: 0,
        });
      }
      return 1;
    }
  } catch {
    /* cosmetic only */
  }
  return 0;
}

function captureHusk(S, B, A, pts, nPts, offX, offZ, dx, dz, delay, stand, tear, alpha, echoIdx, mode) {
  let H = S.husks[0];
  for (const q of S.husks) {
    if (!q.on) { H = q; break; }
    if (q.age > H.age) H = q;
  }
  const cellM = 0.09, inv = 1 / cellM;
  const cells = S.cells;
  cells.clear();
  const n = Math.min(nPts | 0, pts ? Math.floor(pts.length / 3) : 0);
  if (n < 16) return null;

  let m = 0;
  for (let i = 0; i < n && m < MAX_HUSK; i++) {
    const px = pts[i * 3] + offX, py = pts[i * 3 + 1], pz = pts[i * 3 + 2] + offZ;
    if (!fin(px + py + pz)) continue;
    const sx = px * A.rx + py * A.ry + pz * A.rz;
    const sy = px * A.ux + py * A.uy + pz * A.uz;
    const ci = Math.round(sx * inv), cj = Math.round(sy * inv);
    const key = ((ci + 32768) & 0xffff) * 65536 + ((cj + 32768) & 0xffff);
    if (cells.has(key)) continue;
    cells.set(key, m);
    const mx = ci * cellM - sx, my = cj * cellM - sy;
    H.pos[m * 3] = px + A.rx * mx + A.ux * my;
    H.pos[m * 3 + 1] = py + A.ry * mx + A.uy * my;
    H.pos[m * 3 + 2] = pz + A.rz * mx + A.uz * my;
    H.done[m] = 0;
    m++;
  }
  if (m < 8) return null;

  let lo = Infinity, hi = -Infinity;
  for (const [key, idx] of cells) {
    const ci = (key >>> 16) - 32768, cj = (key & 0xffff) - 32768;
    const kL = ((ci - 1 + 32768) & 0xffff) * 65536 + ((cj + 32768) & 0xffff);
    const kR = ((ci + 1 + 32768) & 0xffff) * 65536 + ((cj + 32768) & 0xffff);
    const kD = ((ci + 32768) & 0xffff) * 65536 + ((cj - 1 + 32768) & 0xffff);
    const kU = ((ci + 32768) & 0xffff) * 65536 + ((cj + 1 + 32768) & 0xffff);
    const l = cells.has(kL) ? 1 : 0, r = cells.has(kR) ? 1 : 0;
    const d = cells.has(kD) ? 1 : 0, u = cells.has(kU) ? 1 : 0;
    if (l + r + d + u < 4) {
      const nx = l - r, ny = d - u;
      const tx2 = -ny, ty2 = nx;
      const sc = Math.abs(tx2) + Math.abs(ty2) > 0
        ? (Math.abs(ty2) > Math.abs(tx2) * 1.8 ? 2 : Math.abs(tx2) > Math.abs(ty2) * 1.8 ? 0 : tx2 * ty2 > 0 ? 1 : 3)
        : 2;
      H.rim[idx] = sc + 1;
    } else {
      H.rim[idx] = 0;
    }
    const x = H.pos[idx * 3], y = H.pos[idx * 3 + 1], z = H.pos[idx * 3 + 2];
    const ord = mode === 'b' ? y : -(x * dx + z * dz) + y * 0.15;
    H.ord[idx] = ord;
    if (ord < lo) lo = ord;
    if (ord > hi) hi = ord;
  }
  const span = hi - lo > 1e-3 ? hi - lo : 1;
  for (let i = 0; i < m; i++) {
    H.ord[i] = clamp(((H.ord[i] - lo) / span) * 0.86 + rnd() * 0.14, 0, 1);
  }
  H.on = true;
  H.mode = mode;
  H.age = -Math.max(0, delay);
  H.stand = stand;
  H.tear = Math.max(0.02, tear);
  H.n = m;
  H.dx = dx; H.dz = dz;
  H.alpha = alpha;
  H.echoIdx = echoIdx;
  return H;
}

/**
 * Trigger the subtle ASCII enhancement for a Perfect Dodge (Ghostep, Flurry, Plunge).
 */
export function perfectArtDodge(game, o = {}) {
  const mode = artMode;
  if (mode === '0' || !game) return 0;
  try {
    const S = getState(game);
    PERFECT_ART_LAST.dodges++;
    PERFECT_ART_LAST.mode = mode;
    const B = S?.batches;
    const A = axes(game);
    const ox = fin(o.ox) ? o.ox : 0, oz = fin(o.oz) ? o.oz : 0;
    const nx = fin(o.nx) ? o.nx : ox, nz = fin(o.nz) ? o.nz : oz;
    let ux = nx - ox, uz = nz - oz;
    let dist = Math.hypot(ux, uz);
    if (dist > 0.25) {
      ux /= dist;
      uz /= dist;
    } else {
      const dl = Math.hypot(fin(o.dx) ? o.dx : 0, fin(o.dz) ? o.dz : 0);
      ux = dl > 1e-3 ? o.dx / dl : Math.sin(game.player?.yaw || 0);
      uz = dl > 1e-3 ? o.dz / dl : Math.cos(game.player?.yaw || 0);
      dist = 0;
    }
    const gy = fin(game.world?.forest?.groundY) ? game.world.forest.groundY : 0;
    game.world?.life?.litter?.scatter?.(ox, oz, 2.4, 0.85);
    if (!B) return 1;

    const pts = o.pts, nPts = o.nPts | 0;

    if (mode === 'a') {
      const T = PERFECT_ART_TUNE.a;
      captureHusk(S, B, A, pts, nPts, 0, 0, ux, uz, 0, 0.16, 0.18, 0.82, 0, 'a');
      const E = allocEvent(S, 'dodgeA', 'a', 0.48);
      E.x = ox; E.y = gy + 0.95; E.z = oz;
      E.nx = dist > 0.25 ? nx : ox + ux * 1.6;
      E.ny = gy + 1.0;
      E.nz = dist > 0.25 ? nz : oz + uz * 1.6;
      E.dx = ux; E.dz = uz; E.gy = gy; E.flurry = !!o.flurry;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU;
        pushFree(S, {
          x: ox + Math.cos(a) * 0.26, y: gy + 0.05, z: oz + Math.sin(a) * 0.26,
          vx: Math.cos(a) * R(1.4, 2.5) - ux * 0.8, vy: R(0.05, 0.22), vz: Math.sin(a) * R(1.4, 2.5) - uz * 0.8,
          life: R(0.28, 0.42), drag: 3.2, grav: -0.3, windK: 0.7,
          c0: T.wispHi, c1: T.wispLo, a0: 0.62, a1: 0,
          col: B.wisp[i % B.wisp.length], batch: 0,
        });
      }
      return 1;
    }

    if (mode === 'b') {
      // 3 stroboscopic ASCII chrono silhouettes spaced clearly along the dodge wake!
      const span = dist > 0.35 ? Math.min(dist * 0.84, 3.2) : 1.45;
      const dirSign = dist > 0.35 ? 1 : -1;
      const fracs = dist > 0.35 ? [0, 0.42, 0.78] : [0, 0.48, 0.92];
      const alphas = [0.85, 0.62, 0.42];
      for (let e = 0; e < 3; e++) {
        const f = fracs[e];
        const sx = ux * span * f * dirSign, sz = uz * span * f * dirSign;
        captureHusk(S, B, A, pts, nPts, sx, sz, ux, uz, e * 0.032, 0.12 + e * 0.035, 0.14, alphas[e], e, 'b');
      }
      const E = allocEvent(S, 'dodgeB', 'b', 0.38);
      E.x = dist > 0.35 ? ox : ox - ux * span;
      E.y = gy + 0.06;
      E.z = dist > 0.35 ? oz : oz - uz * span;
      E.nx = dist > 0.35 ? ox + ux * span : ox + ux * 0.35;
      E.nz = dist > 0.35 ? oz + uz * span : oz + uz * 0.35;
      E.dx = ux; E.dz = uz; E.gy = gy;
      return 1;
    }

    if (mode === 'c') {
      captureHusk(S, B, A, pts, nPts, 0, 0, ux, uz, 0, 0.08, 0.12, 0.78, 0, 'c');
      const E = allocEvent(S, 'dodgeC', 'c', 0.38);
      E.x = ox; E.y = gy + 1.0; E.z = oz;
      E.nx = dist > 0.25 ? nx : ox + ux * 1.35;
      E.ny = gy + 1.0;
      E.nz = dist > 0.25 ? nz : oz + uz * 1.35;
      E.dx = ux; E.dz = uz; E.gy = gy; E.flurry = !!o.flurry;
      game.world?.gust?.(ox, oz, 0.48, 3.2);
      return 1;
    }
  } catch {
    /* cosmetic only */
  }
  return 0;
}

function drawEvent(game, S, B, A, E) {
  const snap = B.snap, flow = B.flow, dim = B.dim, col = S.colTmp;
  const u = clamp(E.age / E.dur, 0, 1);

  if (E.kind === 'parryA') {
    const T = PERFECT_ART_TUNE.a;
    if (E.age < 0.17) {
      const k = 1 - E.age / 0.17;
      for (const ang of [E.a1, E.a2]) {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const wx = A.rx * ca + A.ux * sa, wy = A.ry * ca + A.uy * sa, wz = A.rz * ca + A.uz * sa;
        const sc = strokeCol(B.strokes, ca, sa);
        const steps = 6;
        for (let i = -steps; i <= steps; i++) {
          const r = i * 0.068 * (1 + (1 - k) * 0.35);
          const hot = Math.abs(i) <= 1;
          const src = hot ? T.kiss : T.ribbonHi;
          col[0] = src[0]; col[1] = src[1]; col[2] = src[2];
          const al = (hot ? 0.92 : 0.75 * (1 - Math.abs(i) / (steps + 1))) * k;
          putPulled(S, snap, E.x + wx * r, E.y + wy * r, E.z + wz * r, i === 0 ? B.plus : sc, col, al);
        }
      }
    }
    return;
  }

  if (E.kind === 'parryB') {
    const T = PERFECT_ART_TUNE.b;
    const ca = Math.cos(E.a1), sa = Math.sin(E.a1);
    const wx = A.rx * ca + A.ux * sa, wy = A.ry * ca + A.uy * sa, wz = A.rz * ca + A.uz * sa;
    const sc = strokeCol(B.strokes, ca, sa);
    const hp = game.player?.position;
    const hcx = fin(hp?.x) ? hp.x : -999, hcy = (fin(hp?.y) ? hp.y : 0) + 0.9, hcz = fin(hp?.z) ? hp.z : -999;

    if (E.age < 0.28) {
      const ku = E.age / 0.28;
      const gap = ku < 0.26 ? 0 : (ku - 0.26) * 1.25;
      const reach = 1.45 + ku * 0.42;
      const step = 0.062;
      const n = Math.round(reach / step);
      for (let i = -n; i <= n; i++) {
        const dist = Math.abs(i) * step;
        if (dist < gap) continue;
        const h = ((Math.imul(i + 64, 0x27d4eb2d) ^ E.seed) >>> 0) / 4294967296;
        if (ku > 0.52 && h < (ku - 0.52) * 1.85) continue;
        const bx = E.x + wx * (i * step), by = E.y + wy * (i * step), bz = E.z + wz * (i * step);
        if (by < E.gy + 0.15) continue;
        const dxH = bx - hcx, dyH = (by - hcy) * 0.65, dzH = bz - hcz;
        if (dxH * dxH + dyH * dyH + dzH * dzH < 0.055 && Math.abs(i) > 2) continue;
        const endFade = 1 - Math.pow(dist / (reach + 0.05), 1.6);
        const hot = Math.abs(i) <= 1 && ku < 0.28;
        const src = hot ? T.kiss : ku < 0.38 ? T.lineHi : T.lineLo;
        col[0] = src[0]; col[1] = src[1]; col[2] = src[2];
        const ch = ku > 0.6 && h > 0.65 ? B.colon : hot ? B.plus : sc;
        putPulled(S, snap, bx, by, bz, ch, col, (hot ? 0.95 : 0.86) * endFade * (1 - smooth(0.68, 1, ku)));
      }
      if (ku < 0.28) {
        const c2 = Math.cos(E.a2), s2 = Math.sin(E.a2);
        const vx = A.rx * c2 + A.ux * s2, vy = A.ry * c2 + A.uy * s2, vz = A.rz * c2 + A.uz * s2;
        const sc2 = strokeCol(B.strokes, c2, s2);
        col[0] = T.lineHi[0]; col[1] = T.lineHi[1]; col[2] = T.lineHi[2];
        for (let j = -5; j <= 5; j++) {
          if (!j) continue;
          const r = j * 0.062;
          putPulled(S, snap, E.x + vx * r, E.y + vy * r, E.z + vz * r, sc2, col, 0.78 * (1 - ku / 0.28));
        }
      } else if (E.flurry === false) {
        E.flurry = true;
        for (let i = 0; i < 34; i++) {
          const r = R(-1.3, 1.3);
          pushFree(S, {
            x: E.x + wx * r, y: E.y + wy * r, z: E.z + wz * r,
            vx: wx * R(-0.4, 0.4), vy: R(-0.3, 0.35), vz: wz * R(-0.4, 0.4),
            life: R(0.22, 0.38), drag: 1.5, grav: -6.2, windK: 0.45,
            c0: T.lineHi, c1: T.lineLo, a0: R(0.62, 0.84), a1: 0,
            col: B.punct[i % B.punct.length], batch: 0,
          });
        }
      }
    }
    const sw = game.player?.sweep;
    if (sw?.valid) {
      const fade = (1 - smooth(0.65, 1, u)) * smooth(0, 0.08, u);
      col[0] = T.script[0]; col[1] = T.script[1]; col[2] = T.script[2];
      const glyphs = [B.dot, B.colon, B.plus, B.tick];
      for (let i = 0; i < 10; i++) {
        const f = ((i / 10) + u * 1.5) % 1;
        const bx = sw.a.x + (sw.b.x - sw.a.x) * f;
        const by = sw.a.y + (sw.b.y - sw.a.y) * f;
        const bz = sw.a.z + (sw.b.z - sw.a.z) * f;
        const al = 0.78 * fade * Math.sin(f * Math.PI);
        putPulled(S, snap, bx, by, bz, glyphs[i & 3], col, al);
      }
    }
    return;
  }

  if (E.kind === 'parryC') {
    const T = PERFECT_ART_TUNE.c;
    const r = 0.28 + 2.25 * (1 - Math.pow(1 - u, 2.2));
    const rTrough = Math.max(0.18, r - 0.18);
    const ringFade = (1 - smooth(0.58, 1, u)) * smooth(0, 0.05, u);
    const N = 108;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const h = ((Math.imul(i + 17, 0x165667b1) ^ E.seed) >>> 0) / 4294967296;
      if (u > 0.5 && h < (u - 0.5) * 1.45) continue;
      const ca = Math.cos(a), sa = Math.sin(a);
      const dr = -sa * A.rx + ca * A.rz, du = -sa * A.ux + ca * A.uz;
      const sc = h > 0.72 ? B.tilde : strokeCol(B.strokes, dr, du);
      col[0] = T.ringHi[0] * (0.78 + 0.22 * h);
      col[1] = T.ringHi[1] * (0.78 + 0.22 * h);
      col[2] = T.ringHi[2] * (0.78 + 0.22 * h);
      putPulled(S, flow, E.nx + ca * r, E.gy + 0.05, E.nz + sa * r, sc, col, 0.72 * ringFade);
      if ((i & 1) === 0) {
        putPulled(S, dim, E.nx + ca * rTrough, E.gy + 0.04, E.nz + sa * rTrough, B.punctDim[i % B.punctDim.length], T.trough, 0.55 * ringFade);
      }
    }
    if (E.age < 0.25) {
      const ku = E.age / 0.25;
      const arcR = 0.34 + ku * 0.54;
      const arcFade = 1 - smooth(0.42, 1, ku);
      for (let row = 0; row < 3; row++) {
        const rr = arcR - row * 0.068;
        const M = 24 - row * 4;
        for (let i = 0; i < M; i++) {
          const f = i / (M - 1) - 0.5;
          const ang = E.dx + f * 1.75;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const wx = A.rx * ca + A.ux * sa, wy = A.ry * ca + A.uy * sa, wz = A.rz * ca + A.uz * sa;
          const sc = row === 0 ? strokeCol(B.strokes, -sa, ca) : B.digitsDim[(i + row) % B.digitsDim.length];
          const src = row === 0 ? T.kiss : T.ringLo;
          const endK = 1 - 3.0 * f * f;
          if (endK <= 0.05) continue;
          col[0] = src[0]; col[1] = src[1]; col[2] = src[2];
          putPulled(S, snap, E.x + wx * rr, E.y + wy * rr, E.z + wz * rr, sc, col, (row === 0 ? 0.88 : 0.58) * endK * arcFade);
        }
      }
    }
    return;
  }

  if (E.kind === 'dodgeA') {
    const T = PERFECT_ART_TUNE.a;
    const wind = game.world?.life?.wind?.at?.(E.x, E.z, S.windTmp) ?? null;
    const wx = wind ? wind.x * 0.18 : 0, wz = wind ? wind.z * 0.18 : 0;
    const px = -E.dz, pz = E.dx;
    const sx = E.nx - E.x, sy = E.ny - E.y, sz = E.nz - E.z;
    const N = 88;
    for (let i = 0; i < N; i++) {
      const seedF = ((Math.imul(i + 11, 0x85ebca6b) ^ E.seed) >>> 0) / 4294967296;
      const seedG = ((Math.imul(i + 97, 0xc2b2ae35) ^ E.seed) >>> 0) / 4294967296;
      const born = seedF * 0.22;
      const die = 0.62 + seedG * 0.38;
      if (u < born || u > die) continue;
      const lu = (u - born) / (die - born);
      const along = clamp(seedF * 0.35 + lu * 0.82, 0, 1.1);
      const wave = Math.sin(along * 6.4 - E.age * 11 + seedG * TAU) * (0.18 + 0.2 * lu);
      const spread = (seedG - 0.5) * (0.24 + 0.28 * lu);
      const bx = E.x + sx * along + px * (wave + spread) + wx * E.age;
      const by = E.y + sy * along + (seedF - 0.5) * 1.05 + Math.sin(lu * Math.PI) * 0.14;
      const bz = E.z + sz * along + pz * (wave + spread) + wz * E.age;
      const env = smooth(0, 0.16, lu) * (1 - smooth(0.62, 1, lu));
      const hi = i % 7 === 0;
      const src = hi ? T.wispHi : T.wispLo;
      col[0] = src[0]; col[1] = src[1]; col[2] = src[2];
      const ch = i % 4 === 0
        ? strokeCol(B.strokes, sx * A.rx + sz * A.rz, sx * A.ux + sz * A.uz)
        : B.wisp[(i + (E.seed & 7)) % B.wisp.length];
      putPulled(S, flow, bx, Math.max(E.gy + 0.08, by), bz, ch, col, (hi ? 0.78 : 0.54) * env);
    }
    return;
  }

  if (E.kind === 'dodgeB') {
    const T = PERFECT_ART_TUNE.b;
    const px = -E.dz * 0.18, pz = E.dx * 0.18;
    const sx = E.nx - E.x, sz = E.nz - E.z;
    const sc = strokeCol(B.strokes, sx * A.rx + sz * A.rz, sx * A.ux + sz * A.uz);
    const tail = smooth(0.18, 0.96, u);
    const head = smooth(0, 0.3, u);
    const fade = 1 - smooth(0.72, 1, u);
    col[0] = T.rail[0]; col[1] = T.rail[1]; col[2] = T.rail[2];
    const M = 28;
    for (let i = 0; i <= M; i++) {
      const f = i / M;
      if (f < tail || f > head) continue;
      const bx = E.x + sx * f, bz = E.z + sz * f;
      const ch = i % 3 === 0 ? B.eq : i % 5 === 0 ? B.dot : sc;
      putPulled(S, snap, bx + px, E.y, bz + pz, ch, col, 0.76 * fade);
      putPulled(S, snap, bx - px, E.y, bz - pz, ch, col, 0.76 * fade);
    }
    return;
  }

  if (E.kind === 'dodgeC') {
    const T = PERFECT_ART_TUNE.c;
    const p = game.player?.position;
    if (p && !E.flurry && fin(p.x + p.z)) {
      E.nx = p.x;
      E.ny = (fin(p.y) ? p.y : E.gy) + 1.0;
      E.nz = p.z;
    }
    const sx = E.nx - E.x, sy = E.ny - E.y, sz = E.nz - E.z;
    const px = -E.dz, pz = E.dx;
    const N = 104;
    for (let i = 0; i < N; i++) {
      const strand = i & 1 ? 1 : -1;
      const off = ((i >> 1) / (N >> 1)) * 0.36;
      const lu = clamp((u - off * 0.62) / (1 - off * 0.62), 0, 1);
      if (lu <= 0 || lu >= 1) continue;
      const ease = lu * lu * (3 - 2 * lu);
      const amp = Math.sin(lu * Math.PI) * 0.48 * strand;
      const th = lu * TAU * 1.2 + (strand > 0 ? 0 : Math.PI);
      const rx = px * Math.cos(th) * amp;
      const ry = Math.sin(th) * Math.abs(amp) * 0.68 + (((i * 19) % 13) / 13 - 0.5) * 0.75 * (1 - ease);
      const rz = pz * Math.cos(th) * amp;
      const bx = E.x + sx * ease + rx;
      const by = Math.max(E.gy + 0.08, E.y + sy * ease + ry);
      const bz = E.z + sz * ease + rz;
      const hi = i % 6 === 0;
      const src = hi ? T.vortexHi : T.vortexLo;
      col[0] = src[0]; col[1] = src[1]; col[2] = src[2];
      const ch = i % 3 === 0 ? B.digitsMid[i % B.digitsMid.length] : B.wisp[i % B.wisp.length];
      const al = (hi ? 0.86 : 0.6) * Math.sin(lu * Math.PI);
      putPulled(S, flow, bx, by, bz, ch, col, al);
    }
    if (u > 0.34) {
      const ku = (u - 0.34) / 0.66;
      const rr = 1.25 * (1 - smooth(0, 0.76, ku)) + 0.22;
      const rf = Math.sin(ku * Math.PI);
      col[0] = T.vortexHi[0] * 0.72; col[1] = T.vortexHi[1] * 0.72; col[2] = T.vortexHi[2] * 0.72;
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU + ku * 1.3;
        putPulled(S, flow, E.nx + Math.cos(a) * rr, E.gy + 0.06, E.nz + Math.sin(a) * rr, B.wisp[i % B.wisp.length], col, 0.68 * rf);
      }
    }
  }
}

function tickHusk(S, B, H, dt) {
  H.age += dt;
  if (H.age < 0) return true;
  const u = (H.age - H.stand) / H.tear;
  const snap = B.snap, col = S.colTmp;
  const T = PERFECT_ART_TUNE[H.mode] ?? PERFECT_ART_TUNE.a;
  let left = 0;

  for (let i = 0; i < H.n; i++) {
    if (H.done[i]) continue;
    const k = i * 3;
    let x = H.pos[k], y = H.pos[k + 1], z = H.pos[k + 2];
    if (H.mode === 'c' && H.age < H.stand) {
      const pop = (H.age / H.stand) * 0.085;
      x += H.dx * pop;
      z += H.dz * pop;
    }
    if (u >= H.ord[i]) {
      H.done[i] = 1;
      if (H.mode === 'a') {
        const sp = R(2.0, 4.8);
        pushFree(S, {
          x, y, z,
          vx: H.dx * sp + R(-0.35, 0.35), vy: R(-0.1, 0.5), vz: H.dz * sp + R(-0.35, 0.35),
          life: R(0.18, 0.34), drag: 2.6, grav: 0.35, windK: 1.15,
          c0: T.huskRim, c1: T.wispLo, a0: 0.72, a1: 0,
          col: B.wisp[i % B.wisp.length], batch: 0,
        });
      } else if (H.mode === 'b') {
        pushFree(S, {
          x, y, z,
          vx: R(-0.15, 0.15), vy: R(0.65, 1.45), vz: R(-0.15, 0.15),
          life: R(0.15, 0.28), drag: 1.4, grav: 0.4, windK: 0.35,
          c0: H.echoIdx === 0 ? T.echo0 : T.echo1, c1: T.echo2, a0: H.alpha * 0.88, a1: 0,
          col: (i & 1) === 0 ? B.tick : B.dot, batch: 0,
        });
      }
      continue;
    }
    left++;
    const rim = H.rim[i];
    let src, al, ch;
    if (H.mode === 'b') {
      src = H.echoIdx === 0 ? T.echo0 : H.echoIdx === 1 ? T.echo1 : T.echo2;
      al = H.alpha * (rim ? 1.05 : 0.72);
      ch = rim ? B.strokes[rim - 1] : B.digitsDim[(i * 7 + H.echoIdx * 3) % B.digitsDim.length];
    } else {
      src = rim ? T.huskRim : T.huskFill;
      al = H.alpha * (rim ? 1.08 : 0.74);
      ch = rim ? B.strokes[rim - 1] : B.digitsDim[(i * 5 + 3) % B.digitsDim.length];
    }
    col[0] = src[0]; col[1] = src[1]; col[2] = src[2];
    const ca = clamp(al, 0, 0.85);
    if (T.inkBack) putPulled(S, B.dim, x, y, z, B.solidBack, T.inkBack, ca * 0.65);
    putPulled(S, snap, x, y, z, ch, col, ca);
  }
  if (!left) H.on = false;
  return left > 0;
}

export function perfectArtUpdate(game, dt, realDt) {
  if (!game) return;
  const S = STATES.get(game);
  if (!S?.batches) return;
  const B = S.batches;
  if (artMode === '0' && S.nFree === 0 && !S.events.some((e) => e.on) && !S.husks.some((h) => h.on)) {
    if (B.snap.count || B.flow.count || B.dim.count) {
      B.snap.empty();
      B.flow.empty();
      B.dim.empty();
    }
    return;
  }
  try {
    const rdt = clamp(fin(realDt) ? realDt : fin(dt) ? dt : 0, 0, 0.08);
    const fdt = clamp(fin(game.fxDt) ? game.fxDt : fin(dt) ? dt : rdt, 0, 0.08);
    const step = rdt * 0.78 + fdt * 0.22;
    if (!(step > 0)) return;
    S.t += step;

    const cp = game.camera?.position;
    if (cp && fin(cp.x + cp.y + cp.z)) {
      S.camPos.x = cp.x; S.camPos.y = cp.y; S.camPos.z = cp.z; S.camPos.ok = true;
    } else {
      S.camPos.ok = false;
    }

    B.snap.begin();
    B.flow.begin();
    B.dim.begin();

    const A = axes(game);
    for (const H of S.husks) {
      if (H.on) tickHusk(S, B, H, step);
    }
    for (const E of S.events) {
      if (!E.on) continue;
      E.age += step;
      if (E.age >= E.dur) {
        E.on = false;
        continue;
      }
      drawEvent(game, S, B, A, E);
    }

    const d = S.free, col = S.colTmp, wind = game.world?.life?.wind;
    let w = 0;
    for (let i = 0; i < S.nFree; i++) {
      const k = i * PF;
      const age = d[k + 6] + step, life = d[k + 7];
      if (age >= life) continue;
      if (w !== i) d.copyWithin(w * PF, k, k + PF);
      const o = w * PF;
      d[o + 6] = age;
      const drag = Math.exp(-d[o + 8] * step);
      let vx = d[o + 3] * drag, vy = d[o + 4] * drag + d[o + 9] * step, vz = d[o + 5] * drag;
      if (d[o + 21] > 0 && wind?.at) {
        const wa = wind.at(d[o], d[o + 2], S.windTmp);
        vx += (wa.x * 0.65 - vx * 0.08) * d[o + 21] * step * 2.4;
        vz += (wa.z * 0.65 - vz * 0.08) * d[o + 21] * step * 2.4;
      }
      let x = d[o] + vx * step, y = d[o + 1] + vy * step, z = d[o + 2] + vz * step;
      if (y < d[o + 10]) {
        y = d[o + 10];
        vy = Math.abs(vy) * 0.42;
        vx *= 0.74;
        vz *= 0.74;
      }
      d[o] = x; d[o + 1] = y; d[o + 2] = z;
      d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
      const t = age / life;
      const al = (d[o + 17] + (d[o + 18] - d[o + 17]) * t) * Math.min(1, t * 9);
      col[0] = d[o + 11] + (d[o + 14] - d[o + 11]) * t;
      col[1] = d[o + 12] + (d[o + 15] - d[o + 12]) * t;
      col[2] = d[o + 13] + (d[o + 16] - d[o + 13]) * t;
      const target = d[o + 20] === 2 ? B.dim : d[o + 20] === 1 ? B.snap : B.flow;
      putPulled(S, target, x, y, z, d[o + 19], col, al);
      w++;
    }
    S.nFree = w;

    B.snap.end();
    B.flow.end();
    B.dim.end();
    if (B.snap.count > PERFECT_ART_LAST.snapPeak) PERFECT_ART_LAST.snapPeak = B.snap.count;
    if (B.flow.count > PERFECT_ART_LAST.flowPeak) PERFECT_ART_LAST.flowPeak = B.flow.count;
    if (B.dim.count > PERFECT_ART_LAST.dimPeak) PERFECT_ART_LAST.dimPeak = B.dim.count;
  } catch {
    /* never freeze the frame */
  }
}

export function perfectArtClear(game) {
  if (!game) {
    PERFECT_ART_LAST.snapPeak = PERFECT_ART_LAST.flowPeak = PERFECT_ART_LAST.dimPeak = 0;
    return;
  }
  const S = STATES.get(game);
  if (!S) return;
  S.nFree = 0;
  for (const E of S.events) E.on = false;
  for (const H of S.husks) H.on = false;
  S.batches?.snap.empty();
  S.batches?.flow.empty();
  S.batches?.dim.empty();
}
