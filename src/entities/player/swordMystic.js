// THE SWORD'S MYSTICAL LAYER: A GREEN FLAME ON THE STEEL (ADR-182; on by default, `?mystic=0` turns it
// off: exactly today's blade). The owner: "i also want his sword to look a bit more mystical in a subtle
// way. maybe make the sword animation change as you get streaks"; then, over a day of picks (green wisps
// first): "i want the sword effect to not be wisps but like a fiery subtle flame cool ascii effect on the
// sword", "make the sword color matrix green color", "more cooler flame enveloping the sword ascii
// looking", "the glow is way too big, make the ascii characters much more smaller", and of two: "A: tight".
//
// What it is: a tight envelope of burning marks round the steel, in Matrix green. The cells touching the
// steel on the screen (never the steel's own: it is never covered) each burn on their own beat, their mark
// re-rolling a few times a second (the fire boils); short tongues climb off the top and break away, and
// strokes lick up off the steel and climb cell by cell. With the streak (combat/streak.js streakTier
// 0..5, the hero's own streak, so `?streakfx=off` does not turn it off) it burns denser and hotter,
// tongues climb higher, the licks come faster, and toward the point the marks pale to green-white (the
// lit head). Already there with no streak.
//
// How it is drawn. In the HERO'S OWN MICRO LETTERS (render/glyphs.js PIXEL_3X3: 3 x 3 marks in his 4 x 4
// px cells at 720p, half the world letter's height), printed through a LetterBatch (world/life/
// letterBatch.js) that takes the pipeline's own hero atlas and cell and snaps to his grid: the flame is at
// his scale, not the world's. Heat picks the mark as the fire field picks its letter: a stroke at a cool
// tip, a tiny letter shape in the body, a dense mark at the hot heart. Not the fire field itself: the
// field prints only its three hues (red fire, the Lord's violet, steel) in world-sized letters, and its
// dye slots belong to the bosses' timing tells (ADR-182 says why).
//
// The house rules it keeps: the steel itself stays dark until it cuts (nothing here writes a uniform);
// its own random stream and hashes (never Math.random); a capped count a frame (`cells`, `budget`);
// nothing over his body (his torso's column below his head); nothing on a dead, hidden or unarmed hero.
// Through the flurry it rests; through the Ghostep's cold cast after a perfect dodge it goes on.

import { TAU, lerp, smoothstep } from '../../core/math.js';
import { streakTier } from '../../combat/streak.js';
import { LetterBatch } from '../../world/life/letterBatch.js';
import { pixelArtOrder } from '../../render/glyphs.js';
import { DIM } from './model.js';

const IDS = ['0', 'c'];
export const MYSTIC_IDS = Object.freeze(IDS.slice());
export const MYSTIC_NAMES = Object.freeze({ 0: 'off (today)', c: 'flame' });

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
// on by default; `?mystic=0` is today's blade
const PICK = { mode: q('mystic') === '0' ? '0' : 'c' };

/** The layer drawn now ('c' = the flame, '0' = off). */
export const mysticMode = () => PICK.mode;
/** Lab / tests: switch it live ('c' on, anything else off). Returns the id now set. */
export function setMystic(id) {
  PICK.mode = String(id) === 'c' ? 'c' : '0';
  return PICK.mode;
}

// its own stream (ADR-122): a look must never move the seeded sims
let mseed = 0x3c6ef372;
const rnd = () => (mseed = (Math.imul(mseed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);
/** Tests: put the stream at `v`. */
export const setMysticSeed = (v) => (mseed = v >>> 0);
/** 0..1 from three integers (the flame's own hash: no random stream read). */
const hash3 = (a, b, c) => {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * The marks it prints: the hero's micro letters (render/glyphs.js PIXEL_3X3), by their index in that list.
 * The flame's cool tips are strokes, its body tiny letter shapes, its hot heart dense marks.
 */
const MICRO = { ':': 2, '|': 6, '/': 7, '\\': 8, r: 9, '+': 12, x: 13, T: 14, v: 16, n: 17, A: 18, s: 20, z: 23, o: 25, B: 26 };
const TIP = '|||/\\:'; // (mostly upright, as the fire field's tips)
const BODY = '+xvnAszrT';
const HOT = 'oBA';
export const MYSTIC_GLYPHS = Object.freeze({ c: TIP + BODY + HOT });

/** Shared: what a frame may draw, how fast a new tier comes up (it drops at once). */
export const MYSTIC = {
  budget: 6, // licks a frame at most
  cells: 110, // flame marks a frame at most (the envelope and its tongues)
  lift: 0.15, // m everything is drawn toward the camera (with the batch's own soft depth, `soft`)
  soft: 0.12, // m: the batch's soft depth test (a mark fades this close in front of what is behind it)
  rise: 3,
};

/**
 * The flame, one entry per tier (index = streakTier 0..5).
 *   heat     a burning cell's heat (its mark's band: under GREEN.tip a stroke, above a tiny letter,
 *            from GREEN.hot0 a dense mark paling to green-white); `below` x for a cell under the steel
 *   tip      extra heat toward the point (x u², u 0 at the forte, 1 at the point)
 *   cover    share of the cells lit at once (each its own beat)
 *   tongue   cells a tongue climbs off a top cell at most; tongueP the chance it has one
 *   lick     rising strokes a second off the steel (snapped to his grid: they climb cell by cell), their
 *            life s and speed m/s
 */
export const FLAME = {
  heat: [0.36, 0.38, 0.4, 0.42, 0.45, 0.48],
  below: 0.7,
  tip: [0.02, 0.04, 0.06, 0.09, 0.13, 0.18],
  cover: [0.62, 0.67, 0.72, 0.78, 0.84, 0.9],
  tongue: [1, 1, 2, 2, 2, 3],
  tongueP: [0.2, 0.24, 0.3, 0.36, 0.42, 0.5],
  lick: { rate: [6, 7, 8.5, 10, 12, 14], life: [0.28, 0.42], rise: [0.9, 1.4] },
  from: 0.04, // share of the steel (forte → point) the flame starts at
  beat: 6, // a cell re-rolls whether it is lit this many times a second
  boil: 8, // a lit cell re-rolls its mark this many times a second (the fire boils)
  tongueRate: 3, // tongues a second per top cell slot
  body: 0.24, // m: half his torso's width on the screen (no flame over him there)
  head: 1.55, // m: below this height the torso column is his (above it, beside his head, the flame may burn)
};

/**
 * The spells (ADR-186: idle actions of the hero's, idles.js SPELLS; the animator publishes the one playing as
 * `anim.spell` = { kind, u, w }). Each swells the flame (to tier `surge` at full weight) and writes a few of
 * the same marks:
 *   rite    embers off the point as his sword fingers leave it (`rite.rate` a second, while u is in `at`)
 *   sigil   a ring of marks on the ground round him (`r` m, `n` of them), written over `at`, all fading together
 *   breath  a thread circling him at chest height (`r` m, `turns`), back into the steel at the end
 */
export const SPELL = {
  surge: 5,
  rite: { at: [0.62, 0.86], rate: 60, life: [0.8, 1.3], rise: [0.3, 0.65] },
  // (at knee height: written on the ground, or at the shin, it hid under the grass; a mark every ~3.5 cm
  // reads as a line of his tiny letters at the game camera, 52 of them read as specks)
  sigil: { at: [0.22, 0.6], r: 0.85, n: 150, life: [1.9, 2.6], y: 0.55 },
  breath: { at: [0.28, 0.8], r: 0.75, turns: 1.5, y: 1.2, rate: 150, life: 0.7 },
  // the flame through a spell: every cell lit, hotter by `heat`, tongues `tongue` cells longer; the rite's
  // flame burns only below the fingers' front (above it dim by `dim`)
  heat: 0.16,
  tongue: 2,
  dim: 0.45,
};

/** Matrix green (linear: the grade and the tone map lean a green toward mint, so the blue is kept low). */
export const GREEN = {
  cool: [0.0, 0.5, 0.04], // a tongue's tip, a dying lick
  body: [0.06, 1.0, 0.06],
  hot: [0.62, 1.0, 0.6], // the lit head: the hottest cells, pale
  tip: 0.31, // heat under which a cell prints a stroke
  hot0: 0.5, // heat from which a cell prints a dense mark and pales toward `hot` (fully at hot0 + 0.25)
  alpha: [0.5, 0.9], // a cell's alpha from the coolest to the hottest
};

/** How far a spell lifts the flame (0..1) at its u: the rite as the fingers climb, the sigil while the ring
 *  is written, the breath through the breath. */
function spellSurge(kind, u) {
  if (kind === 'rite') return smoothstep(0.3, 0.72, u) * (1 - smoothstep(0.8, 0.92, u));
  if (kind === 'sigil') return 0.6 * smoothstep(0.18, 0.3, u) * (1 - smoothstep(0.66, 0.8, u));
  if (kind === 'breath') return smoothstep(0.22, 0.36, u) * (1 - smoothstep(0.72, 0.84, u));
  return 0;
}

// reused records (no allocation per frame)
const L = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, col: 0, color: [0, 0, 0], colorEnd: [0, 0, 0], alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, flicker: 0 };
const C0 = [0, 0, 0];
const WIND = { x: 0, z: 0 };
const PRJ = { px: 0, py: 0, mpp: 0.025 };
const CI = new Int32Array(32), CJ = new Int32Array(32), CU = new Float32Array(32); // the steel's cells this frame
const NI = new Int32Array(128), NJ = new Int32Array(128), NU = new Float32Array(128), NB = new Uint8Array(128); // the flame's cells
/** The index of cell (ci, cj) among the first n of I / J, or -1. */
const cellAt = (I, J, n, ci, cj) => {
  for (let k = 0; k < n; k++) if (I[k] === ci && J[k] === cj) return k;
  return -1;
};
const cmax = (c) => Math.max(c[0], c[1], c[2]);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** The flame's colour at heat h → C0. */
const heatCol = (h) => {
  const G = GREEN;
  if (h < G.hot0) {
    const s = clamp01((h - 0.15) / (G.hot0 - 0.15));
    for (let i = 0; i < 3; i++) C0[i] = G.cool[i] + (G.body[i] - G.cool[i]) * s;
  } else {
    const s = clamp01((h - G.hot0) / 0.25);
    for (let i = 0; i < 3; i++) C0[i] = G.body[i] + (G.hot[i] - G.body[i]) * s;
  }
  return C0;
};

export class SwordMystic {
  constructor(player) {
    this.player = player;
    this.game = player?.game ?? null;
    this.t = 0; // its own clock (fx time)
    this.vis = 0; // 0..1: how much of the tier is up
    this.tier = 0;
    this.n = 0; // licks spawned this frame (tests)
    this.w = 0; // flame marks written this frame (tests)
    this.heat = 0; // the flame's heat written this frame (tests)
    this.total = 0; // everything drawn so far (tests)
    /** Tests: called for every mark, (kind 'spawn' | 'flame', glyph, alpha, life, size, colour max x alpha). */
    this.onEmit = null;
    this.lb = null; // the marks' batch (built the first time the layer is on)
    this._lbTried = false;
    this._mcol = null; // mark → the hero atlas's column
    this.acc = 0; // licks owed
    this._cx = this._cy = this._cz = 0;
    this.sp = { k: '', n: 0, acc: 0, a0: 0 }; // the spell being written (its marks so far)
    this.surge = 0; // 0..1: how far a spell lifts the flame now (tests)
    this.front = -1; // the rite: the share of the blade below his fingers (-1: no rite)
  }

  /** Back to its first frame (a level reset; the film rig stages every row alike). */
  reset() {
    this.t = this.vis = this.tier = this.acc = 0;
    if (this.lb) this._lbClear();
  }

  /** Per frame (player._updateFx). With the layer off it returns at once: nothing drawn. */
  update(dt) {
    this.n = this.w = 0;
    this.heat = 0;
    if (PICK.mode === '0') {
      if (this.lb?.count) this._lbClear(); // (switched off live: its marks go)
      return;
    }
    const P = this.player, g = this.game;
    const fdt = Math.max(Number.isFinite(g?.fxDt) ? g.fxDt : 0, Number.isFinite(dt) ? dt : 0);
    if (!(fdt > 0) || !P) return;
    const e = P.rig?.sword?.matrixWorld?.elements;
    const armed = !!P.rig?.loadout?.weapon;
    const hidden = P.state === 'flurry' || (P.state === 'plunge' && P.pl?.phase === 0) || P.object3d?.visible === false;
    const lb = this._letters();
    if (lb) lb.begin();
    if (!lb || !e || !armed || !P.alive || P.state === 'dead' || hidden) {
      if (lb) {
        lb.np = 0;
        lb.end();
      }
      return;
    }
    this.t += fdt;
    // the tier (the hero's own streak; it comes up in ~1/rise s and drops at once)
    const t = Math.min(5, Math.max(0, streakTier(P.streak | 0)));
    if (t < this.tier) this.vis = 0;
    this.tier = t;
    this.vis = Math.min(1, this.vis + fdt * MYSTIC.rise);
    const cam = g.camera?.matrixWorld?.elements;
    this._cx = cam ? cam[8] * MYSTIC.lift : 0;
    this._cy = cam ? cam[9] * MYSTIC.lift : 0;
    this._cz = cam ? cam[10] * MYSTIC.lift : 0;
    // a spell (idles.js) lifts the flame toward the top tier while it plays
    const S = P.anim?.spell;
    this.surge = S && S.w > 0.01 ? S.w * spellSurge(S.kind, S.u) : 0;
    // the rite's front: the share of the blade below the fingers (they climb it over u 0.34 .. 0.72)
    this.front = S && S.w > 0.01 && S.kind === 'rite' && S.u > 0.3 && S.u < 0.84 ? smoothstep(0.34, 0.72, S.u) : -1;
    const tt = Math.max(t, Math.min(5, Math.round(SPELL.surge * this.surge)));
    try {
      this._flame(e, tt);
      this._licks(e, tt, fdt);
      this._spell(e, fdt, S);
    } catch (err) {
      console.error('[swordMystic]', err);
    }
    lb.flow(fdt, this.t);
    lb.end();
  }

  // ------------------------------------------------------------------ drawing
  /** The batch, built once (on this module's stream) and registered with the frame: it prints the
   *  HERO'S micro letters (the pipeline's own hero atlas, never disposed here) on his grid (snapped),
   *  with its own short soft depth. */
  _letters() {
    if (this.lb || this._lbTried) return this.lb;
    this._lbTried = true;
    const g = this.game, mr = Math.random;
    try {
      Math.random = rnd;
      const lb = new LetterBatch(g, 320 + MYSTIC.cells, '|', { spawned: 320, snap: 1, rand: rnd });
      const order = pixelArtOrder();
      this._mcol = {};
      for (const k in MICRO) this._mcol[k] = order[MICRO[k]] ?? 0;
      // (in place of the batch's own: the hero's atlas and cell, followed as the frame size changes)
      lb._sync = () => {
        const Pl = g?.pipeline, art = Pl?.heroArt, c = Pl?.heroCell, U = lb.uniforms;
        if (c?.x > 0 && c?.y > 0) U.uCell.value.set(c.x, c.y);
        if (art?.texture && U.tArt.value !== art.texture) {
          U.tArt.value = art.texture;
          U.uCols.value = art.cols;
        }
      };
      if (lb.uniforms?.uSoft) lb.uniforms.uSoft.value = MYSTIC.soft;
      this.lb = lb;
      g?.pipeline?.registerParticles?.(this.lb);
    } catch (err) {
      console.error('[swordMystic] letters', err);
      this.lb = null;
    } finally {
      Math.random = mr;
    }
    return this.lb;
  }

  _lbClear() {
    this.lb.empty();
    this.lb.end();
  }

  /** Tier value from a table, blended toward the tier below while it comes up. */
  _k(arr, t) {
    const lo = arr[Math.max(0, t - 1)], hi = arr[t];
    return t > 0 ? lo + (hi - lo) * this.vis : hi;
  }

  _wind() {
    const W = this.game?.world?.life?.wind;
    WIND.x = 0;
    WIND.z = 0;
    if (W && typeof W.at === 'function') {
      const P = this.player.position;
      const o = W.at(P.x, P.z, WIND);
      if (o && Number.isFinite(o.x + o.z)) {
        WIND.x = o.x;
        WIND.z = o.z;
      }
    }
    return WIND;
  }

  // ------------------------------------------------------------------ licks: strokes climbing off the steel
  /** Strokes that leave the upper steel and climb (the batch snaps them to his grid: cell by cell),
   *  green cooling as they go: the flame's tongues tearing off. */
  _licks(e, t, fdt) {
    const K = FLAME.lick, z0 = DIM.forte + 0.1, z1 = (DIM.drawnTip ?? DIM.steelTip) - 0.02;
    this.acc = Math.min(MYSTIC.budget, this.acc + fdt * this._k(K.rate, t));
    if (this.acc < 1) return;
    const w = this._wind(), lb = this.lb;
    while (this.acc >= 1 && this.n < MYSTIC.budget) {
      this.acc -= 1;
      const f = Math.sqrt(rnd()); // the upper steel more than the forte
      const xx = (rnd() < 0.5 ? -1 : 1) * R(0.03, 0.09), zz = z0 + (z1 - z0) * f;
      L.x = e[0] * xx + e[8] * zz + e[12] + this._cx;
      L.y = e[1] * xx + e[9] * zz + e[13] + this._cy;
      L.z = e[2] * xx + e[10] * zz + e[14] + this._cz;
      L.life = R(K.life[0], K.life[1]);
      L.vx = w.x * 0.2 + R(-0.05, 0.05);
      L.vy = R(K.rise[0], K.rise[1]);
      L.vz = w.z * 0.2 + R(-0.05, 0.05);
      L.color = GREEN.body;
      L.colorEnd = GREEN.cool;
      L.alpha = 0.8;
      L.alphaEnd = 0.1;
      L.drag = 0.5;
      L.gravity = 0;
      L.flicker = 0.3;
      if (!Number.isFinite(L.x + L.y + L.z) || L.y < 0.03) continue;
      const ch = TIP[Math.floor(rnd() * TIP.length)];
      L.col = this._mcol?.[ch] ?? 0;
      if (!lb.spawn(L)) break;
      this.n++;
      this.total++;
      this.onEmit?.('spawn', ch, L.alpha, L.life, 1, cmax(L.color) * L.alpha);
    }
  }

  // ------------------------------------------------------------------ spells: marks a spell writes (SPELL)
  _spell(e, fdt, S) {
    const sp = this.sp, lb = this.lb;
    if (!S || !(S.w > 0.02) || !S.kind || !lb) {
      sp.k = '';
      return;
    }
    const P = this.player, q = P.position, u = S.u, w = S.w;
    const tipZ = (DIM.drawnTip ?? DIM.steelTip) - 0.03;
    const tx = e[8] * tipZ + e[12], ty = e[9] * tipZ + e[13], tz = e[10] * tipZ + e[14];
    if (sp.k !== S.kind) {
      sp.k = S.kind;
      sp.n = 0;
      sp.acc = 0;
      sp.a0 = Math.atan2(tx - q.x, tz - q.z); // (the ring and the thread start where the point is)
    }
    if (!Number.isFinite(q.x + q.z + tx + ty + tz)) return;
    if (S.kind === 'rite') {
      const K = SPELL.rite;
      if (u < K.at[0] || u > K.at[1]) return;
      sp.acc = Math.min(8, sp.acc + fdt * K.rate * w);
      while (sp.acc >= 1) {
        sp.acc -= 1;
        this._mark(tx + R(-0.04, 0.04), ty + R(-0.02, 0.06), tz + R(-0.04, 0.04), R(-0.08, 0.08), R(K.rise[0], K.rise[1]), R(-0.08, 0.08), R(K.life[0], K.life[1]), 0.9, 0.3, 1);
      }
    } else if (S.kind === 'sigil') {
      const K = SPELL.sigil;
      const want = Math.floor(K.n * smoothstep(K.at[0], K.at[1], u) * Math.min(1, w * 1.5));
      while (sp.n < want) {
        const a = sp.a0 - (TAU * sp.n) / K.n; // (round from the point, his right to his front to his left)
        // all fade near together: the first written lives the longest
        const life = lerp(K.life[1], K.life[0], sp.n / K.n);
        sp.n++;
        this._mark(q.x + Math.sin(a) * K.r, K.y, q.z + Math.cos(a) * K.r, 0, 0.05, 0, life, 0.9, 0.5, 1);
      }
    } else if (S.kind === 'breath') {
      const K = SPELL.breath;
      if (u < K.at[0] || u > K.at[1]) return;
      const f = (u - K.at[0]) / (K.at[1] - K.at[0]);
      const a = sp.a0 - TAU * K.turns * f;
      // the last fifth: the thread closes in on the blade's middle
      const c = smoothstep(0.8, 1, f), mz = tipZ * 0.5;
      const mx = e[8] * mz + e[12], my = e[9] * mz + e[13], mzz = e[10] * mz + e[14];
      const x = lerp(q.x + Math.sin(a) * K.r, mx, c), y = lerp(K.y, my, c), z = lerp(q.z + Math.cos(a) * K.r, mzz, c);
      sp.acc = Math.min(6, sp.acc + fdt * K.rate * w);
      while (sp.acc >= 1) {
        sp.acc -= 1;
        this._mark(x + R(-0.03, 0.03), y + R(-0.03, 0.03), z + R(-0.03, 0.03), 0, R(0.02, 0.1), 0, K.life * R(0.8, 1.2), 0.9, 0.4, 1);
      }
    }
  }

  /** One mark of a spell: the flame's green, a stroke or a tiny letter (hot = 1: a tiny letter shape). */
  _mark(x, y, z, vx, vy, vz, life, alpha, flicker, hot) {
    L.x = x + this._cx;
    L.y = y + this._cy;
    L.z = z + this._cz;
    L.vx = vx;
    L.vy = vy;
    L.vz = vz;
    L.life = life;
    // (born at the flame's lit head, cooling to its tips: the spell's marks are the flame's hottest)
    L.color = GREEN.hot;
    L.colorEnd = GREEN.cool;
    L.alpha = Math.min(0.9, alpha);
    L.alphaEnd = 0;
    L.drag = 0.4;
    L.gravity = 0;
    L.flicker = flicker;
    if (!Number.isFinite(L.x + L.y + L.z)) return false;
    const set = hot ? HOT + BODY : BODY, ch = set[Math.floor(rnd() * set.length)];
    L.col = this._mcol?.[ch] ?? 0;
    if (!this.lb.spawn(L)) return false;
    this.n++;
    this.total++;
    this.onEmit?.('spawn', ch, L.alpha, L.life, 1, cmax(L.color) * L.alpha);
    return true;
  }

  // ------------------------------------------------------------------ the flame: marks enveloping the steel
  /**
   * The steel's cells on his grid (forte → point) are found; the flame burns in the cells touching them
   * (never the steel's own, so its letters are never covered; at most one cell below it: a flame climbs).
   * A cell over his body (his torso's column below his head) is left out. One mark a lit cell, at the
   * steel's depth drawn a little toward the camera; each cell breathes on its own beat and re-rolls its
   * mark (the fire boils); from the top cells tongues climb and break off.
   */
  _flame(e, t) {
    const S = FLAME, P = this.player, lb = this.lb;
    const g = this.game, cam = g.camera, pl = g.pipeline;
    const m = cam?.matrixWorldInverse?.elements, pe = cam?.projectionMatrix?.elements, cp = cam?.matrixWorld?.elements;
    const W = pl?.width, H = pl?.height;
    if (!m || !pe || !cp || !(W > 8) || !(H > 8) || !(pe[5] > 0)) return;
    const cw = pl?.heroCell?.x > 0 ? pl.heroCell.x : 4, chh = pl?.heroCell?.y > 0 ? pl.heroCell.y : 4; // (his own grid)
    const proj = (x, y, z) => {
      const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
      if (!(vz > 0.2)) return false;
      const px = (((vx * pe[0]) / vz) * 0.5 + 0.5) * W, py = (((vy * pe[5]) / vz) * 0.5 + 0.5) * H;
      if (!Number.isFinite(px + py)) return false;
      PRJ.px = px;
      PRJ.py = py;
      PRJ.mpp = (2 * vz) / (H * pe[5]);
      return true;
    };
    // his torso's column on the screen (below his head): no flame there
    const q = P.position;
    let bx0 = 1e9, bx1 = -1e9, byTop = -1e9;
    if (q && proj(q.x, q.y + 1.0, q.z)) {
      const half = S.body / PRJ.mpp;
      bx0 = PRJ.px - half;
      bx1 = PRJ.px + half;
      if (proj(q.x, q.y + S.head, q.z)) byTop = PRJ.py;
    }
    // the steel's cells, forte → point (each once)
    const z1 = DIM.drawnTip ?? DIM.steelTip, z0 = DIM.forte + (z1 - DIM.forte) * S.from;
    let n = 0;
    for (let s = 0; s <= 24 && n < CI.length; s++) {
      const u = s / 24, zz = z0 + (z1 - z0) * u;
      if (!proj(e[8] * zz + e[12], e[9] * zz + e[13], e[10] * zz + e[14])) continue;
      const ci = Math.floor(PRJ.px / cw), cj = Math.floor(PRJ.py / chh);
      if (cellAt(CI, CJ, n, ci, cj) >= 0) continue;
      CI[n] = ci;
      CJ[n] = cj;
      CU[n] = u;
      n++;
    }
    if (n === 0) return;
    // the envelope: the cells touching them (not the steel's own), each once
    let nn = 0, topJ = -1e9;
    for (let k = 0; k < n; k++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ci = CI[k] + dx, cj = CJ[k] + dy;
          if (cellAt(CI, CJ, n, ci, cj) >= 0) continue;
          const o = cellAt(NI, NJ, nn, ci, cj);
          if (o >= 0) {
            if (CU[k] > NU[o]) NU[o] = CU[k];
            if (dy >= 0) NB[o] = 0;
            continue;
          }
          if (nn >= NI.length) continue;
          // not on him: his torso's column below his head
          const cx = (ci + 0.5) * cw, cy = (cj + 0.5) * chh;
          if (cx > bx0 && cx < bx1 && cy < byTop) continue;
          NI[nn] = ci;
          NJ[nn] = cj;
          NU[nn] = CU[k];
          NB[nn] = dy < 0 ? 1 : 0;
          if (cj > topJ) topJ = cj;
          nn++;
        }
      }
    }
    // the anchor: the blade's middle at its depth (cell centres are placed round it)
    const zm = (z0 + z1) * 0.5, ax0 = e[8] * zm + e[12], ay0 = e[9] * zm + e[13], az0 = e[10] * zm + e[14];
    if (!proj(ax0, ay0, az0)) return;
    const ax = PRJ.px, ay = PRJ.py, mpp = PRJ.mpp;
    const sg = this.surge, fr = this.front;
    const heat0 = this._k(S.heat, t) + SPELL.heat * sg, tip = this._k(S.tip, t), cover = Math.max(this._k(S.cover, t), sg);
    const tongue = S.tongue[t] + Math.round(SPELL.tongue * sg), tp = Math.max(this._k(S.tongueP, t), 0.7 * sg), clock = this.t;
    const G = GREEN, col = this._mcol;
    const put = (ci, cj, h) => {
      if (this.w >= MYSTIC.cells) return;
      const ox = ((ci + 0.5) * cw - ax) * mpp, oy = ((cj + 0.5) * chh - ay) * mpp;
      // the cell's centre at the steel's depth (the camera's right / up axes), drawn toward the camera
      const x = ax0 + cp[0] * ox + cp[4] * oy + this._cx, y = ay0 + cp[1] * ox + cp[5] * oy + this._cy, z = az0 + cp[2] * ox + cp[6] * oy + this._cz;
      if (!(y > 0.05) || !Number.isFinite(x + y + z)) return;
      // the mark: a stroke at a cool tip, a tiny letter in the body, a dense mark at the hot heart; it
      // re-rolls `boil` times a second on its own beat
      const roll = hash3(ci, cj, Math.floor(clock * S.boil + hash3(cj, ci, 5) * 3));
      const set = h < G.tip ? TIP : h >= G.hot0 ? HOT : BODY;
      const ch = set[Math.floor(roll * set.length)];
      const c = heatCol(h), a = G.alpha[0] + (G.alpha[1] - G.alpha[0]) * clamp01((h - 0.15) / 0.4);
      lb.put(x, y, z, 0, col?.[ch] ?? 0, 0, c, a);
      this.w++;
      this.heat += h;
      this.total++;
      this.onEmit?.('flame', ch, a, 0, 1, cmax(c) * a);
    };
    for (let k = 0; k < nn; k++) {
      const ci = NI[k], cj = NJ[k], u = NU[k];
      // its own beat: lit while its hash is under the coverage
      const beat = Math.floor(clock * S.beat + hash3(ci, cj, 7) * 4);
      if (hash3(ci, cj, beat) >= cover) continue;
      let h = heat0 + tip * u * u;
      if (fr >= 0 && u > fr) h *= SPELL.dim; // (the rite: above the fingers the flame waits)
      if (NB[k]) h *= S.below;
      put(ci, cj, h);
      // a tongue off the top: nothing of the steel or the flame above it
      if (!(tongue > 0) || cellAt(CI, CJ, n, ci, cj + 1) >= 0 || cellAt(NI, NJ, nn, ci, cj + 1) >= 0) continue;
      const slot = Math.floor(clock * S.tongueRate + hash3(ci, 3, 11) * 3);
      if (hash3(ci, slot, 13) >= tp * (cj === topJ ? 1.5 : 1)) continue;
      const Lt = 1 + Math.floor(hash3(ci, slot, 17) * tongue);
      const ph = clock * S.tongueRate + hash3(ci, 3, 11) * 3 - slot; // 0..1 through the slot
      const lift = Math.floor(ph * 2.2); // the tongue climbs as it goes, and breaks off the flame late
      for (let kk = 1; kk <= Lt; kk++) put(ci, cj + kk + lift, Math.min(h, 0.3) * (1 - (0.25 * kk) / Lt));
    }
  }
}
