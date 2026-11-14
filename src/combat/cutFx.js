import { axes, screenAngle, clashRing } from './clashFx.js';

// A cut that lands on a body: lines, not light (STYLE.md "Steel on steel" rules), drawn once at the
// DRAWN contact (player.js _contactPoint: where the drawn blade meets the drawn body, not the upright
// gameplay point the hit test found). What makes it read as a cut at the game camera (a ~90 px hero):
//   - a tapered cold SLASH line laid across the body along the cut's screen direction, through the
//     contact (heavy blows: a second, fainter line beside it; its far end breaks off in dry-brush gaps);
//   - a short TICK across it along the blade (heavy blows, a crit: the cross);
//   - thin SPARKS thrown along the cut in the screen's plane, falling MOTES, a puff for a thrust;
//   - one small two-frame CORE, an optional thin RING, one small pooled light.
// Nothing is a big bright glyph: a 0.75-1.15 m '*' blot hid both figures through the freeze-frame.
// Cosmetic noise from its own stream (the seeded sims replay the AI's Math.random); single-char
// glyphs only (a multi-char glyph string would make the particle pool pick one at random).

let seed = 0x6c8e9cf5;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);
const RR = (r) => r[0] + rnd() * (r[1] - r[0]);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v) => Number.isFinite(v);

/** Every glyph a cut draws (the world atlas: tests/glyphcheck.mjs reads this array). */
export const CUT_GLYPHS = ['|', '*', '·', "'", '`', '.'];
const MOTE_GLYPHS = ['·', "'", '`', '.'];

/** The last burst's spawn counts (the tests slice their captures by it; reused, never reallocated).
 *  `n` counts the bursts drawn. */
export const CUT_LAST = { slash: 0, tick: 0, sparks: 0, core: 0, motes: 0, puff: 0, ring: 0, total: 0, n: 0 };

// the look (the owner's pick; the Lab's 'cut' row, or ?cutfx=fan): 'gash' (the slash line) or 'fan'
// (no line: a wider fan of sparks, closest to the look before the line)
let style = (() => {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cutfx') : null;
    return q === 'fan' ? 'fan' : 'gash';
  } catch {
    return 'gash';
  }
})();
export const setCutStyle = (s) => {
  style = s === 'fan' ? 'fan' : 'gash';
};
export const cutStyle = () => style;

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

/**
 * The cut's numbers. Colours are linear HDR (> 1 blooms).
 *   from     where along the hit segment the drawn contact search starts (0 hilt … 1 reach end); it
 *            ends at the arc's edge (fx.arcAt)
 *   toBody   how far the drawn contact moves from the blade toward the body's surface (0..1) …
 *   offMax   … but never more than this many metres off the surface (the wyrm: its reach band hits
 *            a chest 1-2 m above the drawn blade, and 30 % of that gap left the cut in the air)
 *   lowQ     sparks, motes (and the ring) × this on the LOW quality preset
 * Per tier (combat.js `contact`):
 *   len (m, + lenK × charge), n strokes, size (m), life [s, fx-time], ahead (share of the line ahead
 *   of the contact, along the cut), lines (1 | 2), tick (m: the stroke across along the blade; 0
 *   none), sparks (+ sparksK × charge), fan (rad), sp [m/s], spLife [s], core (m), motes, ring (0 |
 *   1 | 2), light [intensity, radius], puff (points round a thrust's entry)
 */
export const CUT_LOOK = deepFreeze({
  from: 0.12,
  toBody: 0.7,
  offMax: 0.12,
  lowQ: 0.65,
  pal: {
    cut: {
      slash: [1.25, 1.75, 2.3], hot: [2.3, 2.8, 3.3], end: [0.14, 0.1, 0.8],
      spark: [1.9, 2.5, 3.1], sparkEnd: [0.2, 0.45, 1.3], core: [2.6, 3.0, 3.4],
      mote: [1.1, 1.7, 2.5], moteEnd: [0.08, 0.16, 0.6], light: [0.55, 0.8, 1.3],
    },
    crit: {
      slash: [1.4, 1.9, 3.0], hot: [2.4, 2.9, 4.2], end: [0.3, 0.55, 1.4],
      spark: [2.2, 2.8, 4.2], sparkEnd: [0.3, 0.55, 1.4], core: [2.6, 3.0, 3.8],
      mote: [1.6, 2.2, 3.6], moteEnd: [0.2, 0.4, 1.2], light: [0.6, 0.8, 1.3],
    },
  },
  tier: {
    light: { len: 0.9, n: 7, size: 0.14, life: [0.18, 0.24], ahead: 0.6, lines: 1, tick: 0, sparks: 8, fan: 0.45, sp: [7, 13], spLife: [0.08, 0.16], core: 0.22, motes: 3, ring: 0, light: [1.2, 3.5], puff: 0 },
    sweep: { len: 1.2, n: 9, size: 0.15, life: [0.2, 0.26], ahead: 0.6, lines: 1, tick: 0, sparks: 10, fan: 0.5, sp: [8, 14], spLife: [0.08, 0.18], core: 0.24, motes: 3, ring: 0, light: [1.4, 4], puff: 0 },
    point: { len: 0.55, n: 5, size: 0.15, life: [0.16, 0.22], ahead: 1.0, lines: 1, tick: 0, sparks: 8, fan: 0.6, sp: [6, 12], spLife: [0.08, 0.16], core: 0.22, motes: 2, ring: 0, light: [1.3, 3.5], puff: 6 },
    slam: { len: 1.5, n: 11, size: 0.18, life: [0.26, 0.34], ahead: 0.55, lines: 2, tick: 0.45, sparks: 14, fan: 0.55, sp: [9, 16], spLife: [0.1, 0.2], core: 0.28, motes: 6, ring: 1, light: [2.0, 5], puff: 0 },
    cleave: { len: 1.6, lenK: 0.3, n: 12, size: 0.18, life: [0.3, 0.4], ahead: 0.55, lines: 2, tick: 0.5, sparks: 14, sparksK: 8, fan: 0.5, sp: [10, 18], spLife: [0.1, 0.2], core: 0.3, motes: 6, ring: 1, light: [2.0, 5], puff: 0 },
    execute: { len: 0.9, n: 7, size: 0.18, life: [0.24, 0.32], ahead: 1.0, lines: 1, tick: 0.7, sparks: 14, fan: 0.6, sp: [8, 15], spLife: [0.1, 0.2], core: 0.3, motes: 6, ring: 2, light: [2.2, 5], puff: 0 },
  },
  crit: { tick: 0.7, tickN: 5, sparks: 6, light: 1.1, core: 0.04, coreMax: 0.3 },
  fanStyle: { sparks: 1.6, motes: 1.5 }, // 'fan': no slash or tick; closest to the look before the line
  dry: { from: 0.7, p: 0.3, max: 2 }, // the dry brush (飞白): the line's far end breaks off in gaps
  line2: { off: 0.08, len: 0.75, less: 3, alpha: 0.45, size: 0.8 }, // the second line of a heavy blow
});

const D = [0, 0, 0]; // dir() scratch
let A = null;
/** World direction of screen angle `a` (from the camera's right toward its up) → D. */
const dir = (a) => {
  const c = Math.cos(a), s = Math.sin(a);
  D[0] = A.rx * c + A.ux * s;
  D[1] = A.ry * c + A.uy * s;
  D[2] = A.rz * c + A.uz * s;
  return D;
};

/**
 * One landed cut at (x, y, z), the drawn contact. Returns the number of particles spawned (0 when
 * there is no pool or the point is not finite); never throws.
 *   o.tier    a CUT_LOOK.tier key (combat.js `contact`)
 *   o.cut     {x, y, z}: the blade's travel at the contact (world; NaN: unknown → across the edge)
 *   o.edge    {x, y, z}: the blade's direction, hilt → point (world)
 *   o.hilt    {x, y, z} | null: the hilt (a heavy blow's second line goes on its side)
 *   o.crit    a crit / a broken foe: the colder palette, the cross, more sparks
 *   o.power   0..1: the cleave's charge
 *   o.low     the LOW quality preset (fewer sparks and motes)
 */
export function cutBurst(game, x, y, z, o) {
  try {
    const add = game?.fx?.add;
    if (!add || !fin(x + y + z) || !o) return 0;
    const L = CUT_LOOK, T = L.tier[o.tier] ?? L.tier.light, crit = !!o.crit, P = crit ? L.pal.crit : L.pal.cut;
    const k = clamp(fin(o.power) ? o.power : 0, 0, 1), q = o.low ? L.lowQ : 1, fan = style === 'fan';
    A = axes(game);
    const c = o.cut, e = o.edge;
    let ca = c ? screenAngle(A, c.x, c.y, c.z) : NaN, ea = e ? screenAngle(A, e.x, e.y, e.z) : NaN;
    if (!fin(ca)) ca = fin(ea) ? ea + Math.PI / 2 : 0.6;
    if (!fin(ea)) ea = ca + Math.PI / 2;
    if (o.tier === 'point' || o.tier === 'execute') ca = ea; // a puncture: the line runs along the blade
    const spawn = (s) => {
      add.spawn(s);
      return 1;
    };
    const len = T.len + (T.lenK ?? 0) * k;
    let nSlash = 0, nTick = 0, nSpark = 0, nCore = 0, nMote = 0, nPuff = 0, nRing = 0;

    // ---- SLASH: the line across the body along the cut
    if (!fan) {
      const ux = Math.cos(ca), uy = Math.sin(ca);
      const line = (n, ln, ox, oy, oz, aK, sK, dry) => {
        let skipped = 0;
        for (let j = 0; j < n; j++) {
          const s = n > 1 ? j / (n - 1) : 0.5;
          if (dry && s > L.dry.from && skipped < L.dry.max && rnd() < L.dry.p) {
            skipped++;
            continue;
          }
          const w = Math.pow(Math.sin(Math.PI * s), 0.6);
          const d = (s - (1 - T.ahead)) * ln;
          const size = T.size * (0.45 + 0.55 * w) * sK;
          const v = R(0.3, 0.7);
          dir(ca);
          nSlash += spawn({
            x: x + ox + D[0] * d, y: y + oy + D[1] * d, z: z + oz + D[2] * d,
            vx: D[0] * v, vy: D[1] * v, vz: D[2] * v,
            life: RR(T.life) * (0.7 + 0.3 * w), size, sizeEnd: size * 0.5,
            glyph: '|', rot: ca - Math.PI / 2, stretch: clamp((1.5 * (ln / Math.max(1, n - 1))) / (0.7 * size) - 1, 0.6, 6),
            color: w > 0.75 ? P.hot : P.slash, colorEnd: P.end, alpha: (0.35 + 0.65 * w) * aK, alphaEnd: 0, drag: 3,
          });
        }
      };
      line(T.n, len, 0, 0, 0, 1, 1, true);
      if (T.lines > 1) {
        // the second line, on the hilt's side of the first (the blade's own width laid along it)
        let side = 1;
        const h = o.hilt;
        if (h && fin(h.x + h.y + h.z)) {
          const hx = h.x - x, hy = h.y - y, hz = h.z - z;
          const sx = hx * A.rx + hy * A.ry + hz * A.rz, sy = hx * A.ux + hy * A.uy + hz * A.uz;
          const off = -sx * uy + sy * ux; // the hilt's screen offset across the line
          if (Math.abs(off) > 1e-4) side = Math.sign(off);
        }
        const L2 = L.line2;
        dir(ca + (Math.PI / 2) * side);
        const ox = D[0] * L2.off, oy = D[1] * L2.off, oz = D[2] * L2.off;
        line(Math.max(2, T.n - L2.less), len * L2.len, ox, oy, oz, L2.alpha, L2.size, false);
      }
      // ---- TICK: a short stroke across the line, along the blade (heavy blows; a crit's cross)
      const lt = Math.max(T.tick, crit ? L.crit.tick : 0);
      if (lt > 0) {
        const N = L.crit.tickN;
        dir(ea);
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1) - 0.5, au = Math.abs(2 * u); // −0.5 … 0.5; 0 at the centre, 1 at the ends
          const size = 0.12 * (1 - 0.4 * au);
          nTick += spawn({
            x: x + D[0] * u * lt, y: y + D[1] * u * lt, z: z + D[2] * u * lt,
            life: R(0.1, 0.12), size, sizeEnd: size * 0.5,
            glyph: '|', rot: ea - Math.PI / 2, stretch: clamp((1.4 * (lt / (N - 1))) / (0.7 * size) - 1, 0.4, 6),
            color: P.hot, colorEnd: P.end, alpha: 1 - 0.6 * au, alphaEnd: 0,
          });
        }
      }
    }

    // ---- SPARKS: thin streaks thrown along the cut in the screen's plane (a quarter across it)
    const nS = Math.round((T.sparks + (T.sparksK ?? 0) * k + (crit ? L.crit.sparks : 0)) * q * (fan ? L.fanStyle.sparks : 1));
    for (let i = 0; i < nS; i++) {
      const a = i % 4 !== 3 ? ca + R(-T.fan, T.fan) * R(0.3, 1) : ca + (rnd() < 0.5 ? -1 : 1) * (Math.PI / 2 + R(-0.5, 0.5));
      dir(a);
      const o0 = R(0.06, 0.2), sp = RR(T.sp);
      nSpark += spawn({
        x: x + D[0] * o0, y: y + D[1] * o0, z: z + D[2] * o0, vx: D[0] * sp, vy: D[1] * sp, vz: D[2] * sp,
        life: RR(T.spLife), size: R(0.12, 0.2), sizeEnd: 0.03, glyph: '|', rot: a - Math.PI / 2, stretch: R(1.4, 2.8),
        color: P.spark, colorEnd: P.sparkEnd, alpha: 1, alphaEnd: 0, drag: R(6, 9), gravity: -4,
      });
    }

    // ---- CORE: one small star, two frames
    nCore += spawn({
      x, y, z, life: 0.045, size: Math.min(L.crit.coreMax, T.core + (crit ? L.crit.core : 0)), sizeEnd: 0.1,
      glyph: '*', color: P.core, colorEnd: P.spark, alpha: 1, alphaEnd: 0, rot: R(0, 1.5),
    });

    // ---- MOTES: slower specks that arc and fall
    const nM = Math.round(T.motes * q * (fan ? L.fanStyle.motes : 1));
    for (let i = 0; i < nM; i++) {
      const a = ca + R(-1.1, 1.1), sp = R(1.5, 4.5);
      dir(a);
      nMote += spawn({
        x, y, z, vx: D[0] * sp, vy: D[1] * sp + R(1, 3), vz: D[2] * sp,
        life: R(0.3, 0.55), size: R(0.08, 0.14), sizeEnd: 0.03, glyph: MOTE_GLYPHS[Math.floor(rnd() * MOTE_GLYPHS.length) % MOTE_GLYPHS.length],
        color: P.mote, colorEnd: P.moteEnd, alpha: 1, alphaEnd: 0, gravity: -12, drag: 1.2, flicker: 0.35,
      });
    }

    // ---- PUFF: a thrust's entry, a ring of points opening on screen
    for (let i = 0; i < (T.puff | 0); i++) {
      const a = (i / T.puff) * Math.PI * 2 + R(-0.3, 0.3);
      dir(a);
      nPuff += spawn({
        x: x + D[0] * 0.1, y: y + D[1] * 0.1, z: z + D[2] * 0.1, vx: D[0] * 2.5, vy: D[1] * 2.5, vz: D[2] * 2.5,
        life: 0.12, size: 0.09, sizeEnd: 0.04, glyph: '·', color: P.slash, colorEnd: P.end, alpha: 1, alphaEnd: 0,
      });
    }

    // ---- RING
    if (T.ring >= 1) {
      const n1 = o.low ? 10 : 14;
      clashRing(game, x, y, z, P.slash, 0.3, 1.1, 0.16, n1);
      nRing += n1;
      if (T.ring >= 2) {
        const n2 = o.low ? 12 : 16;
        clashRing(game, x, y, z, P.slash, 0.26, 1.6, 0.22, n2);
        nRing += n2;
      }
    }

    // ---- one small light (never at the floor: a light near the paving blooms into a white disc)
    game.lights?.add?.({ x, y: Math.max(0.8, y), z, color: P.light, intensity: T.light[0] * (crit ? L.crit.light : 1), radius: T.light[1], life: 0.12, fade: 0.1 });

    const C = CUT_LAST;
    C.slash = nSlash;
    C.tick = nTick;
    C.sparks = nSpark;
    C.core = nCore;
    C.motes = nMote;
    C.puff = nPuff;
    C.ring = nRing;
    C.total = nSlash + nTick + nSpark + nCore + nMote + nPuff + nRing;
    C.n++;
    return C.total;
  } catch {
    return 0;
  }
}
