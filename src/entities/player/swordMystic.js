// THE SWORD'S MYSTICAL LAYER: WISPS (the owner's pick, ADR-175; `?mystic=0` turns it off, exactly
// today's blade). The owner: "i also want his sword to look a bit more mystical in a subtle way. maybe
// make the sword animation change as you get streaks", then, of four readings: "lets go with c tiny
// letters peeling off the steel on the wind but with neon matrix color effect."
//
// Thin wisps of tiny letters come off the steel and go with the wind (the living world's letters,
// `game.world.life.wind`): a slow trickle at rest, more where the blade moves; with the streak (tiers
// 0..5, combat/streak.js streakTier) they come thicker, a little brighter and live longer. It reads the
// hero's own streak, so `?streakfx=off` does not turn it off, and it is already there with no streak.
//
// The colour is Matrix green: one tone (WISPS.col), a crisp letter, not a glow. The whole phosphor green
// (0, 1, 0.06) at the alphas below puts the brightest pixel of a letter at about 0.7 (tier 0) .. 0.85
// (tier 5) in the buffer before the tone map: the bloom starts at 0.55 and takes a third of the excess,
// so a handful of pixels a frame (about 1 at rest, 5 at the top) catch a hint of halo and no more. (The
// grade and the tone map lean a green toward mint: the blue stays low so it reads as phosphor.)
//
// How it is drawn. A wisp is the house letter, the wyrm's pixel font one cell a letter, a spawned letter
// of the living world's LetterBatch (world/life/letterBatch.js): a glyph particle of 5 px is a blur, the
// house letter is crisp at any size. Its mesh is built the first time the layer is on (on this module's
// own random stream: three.js draws uuids), never with the switch off.
//
// The house rules it keeps: the steel itself stays dark until it cuts (nothing here writes a uniform);
// tiny letters; its own random stream (never Math.random); a few new spawns a frame at most (`budget`);
// nothing on a dead, hidden or unarmed hero. Through the flurry it rests (he is mostly not there and the
// flurry has its own look); through the Ghostep's cold cast after a perfect dodge it goes on (it never
// blinks off). While the blade is lit by a cut the letters come fainter (half) and the extra for a moving
// point drops (the cut is the steel's own moment).

import { streakTier } from '../../combat/streak.js';
import { LetterBatch } from '../../world/life/letterBatch.js';
import { DIM } from './model.js';

const IDS = ['0', 'c'];
export const MYSTIC_IDS = Object.freeze(IDS.slice());
export const MYSTIC_NAMES = Object.freeze({ 0: 'off (today)', c: 'wisps' });

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const arcIn = (v) => (v === 2 || v === '2' ? 2 : v === true || v === 1 || v === '1' ? 1 : 0);
// on by default; `?mystic=0` is today's blade
const PICK = { mode: q('mystic') === '0' ? '0' : 'c', arc: arcIn(q('arc')) };

/** The layer drawn now ('c' = the wisps, '0' = off). */
export const mysticMode = () => PICK.mode;
/** Lab / tests: switch it live ('c' on, anything else off). Returns the id now set. */
export function setMystic(id) {
  PICK.mode = String(id) === 'c' ? 'c' : '0';
  return PICK.mode;
}
/** `?arc=1` (full) / `?arc=2` (restrained): the swing's arc grows with the streak (fx.js ARC_STREAK /
 *  ARC_STREAK_CALM); 0 = today exactly. Returns the level (0, 1, 2). */
export const arcOn = () => PICK.arc;
/** Lab / tests: switch the growing arc live (0 | 1 | 2; true = 1). Returns the level now set. */
export function setArc(v) {
  PICK.arc = arcIn(v);
  return PICK.arc;
}

// its own stream (ADR-122): a look must never move the seeded sims
let mseed = 0x3c6ef372;
const rnd = () => (mseed = (Math.imul(mseed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);
/** Tests: put the stream at `v`. */
export const setMysticSeed = (v) => (mseed = v >>> 0);

/** The house letters a wisp may print (all in the wyrm's fonts and the world atlas). */
const WISP = ".,'`~";
export const MYSTIC_GLYPHS = Object.freeze({ c: WISP });

/**
 * The tuning, one entry per tier (index = streakTier 0..5).
 *   budget   new spawns a frame at most
 *   lift     m everything is drawn toward the camera (the soft depth test fades a mark on the steel's
 *            own depth)
 *   rise     1/s: a new tier comes up this fast (it drops at once)
 *   quiet    how much of the look stays while the blade is lit by a cut (bladeHot 1; the alpha x 0.5 + 0.5 quiet)
 */
export const MYSTIC = {
  budget: 6,
  lift: 0.6,
  rise: 3,
  quiet: 0.25,
};

export const WISPS = {
  rest: [6, 6.8, 8, 9.2, 10.5, 12], // wisps a second at rest, off the upper steel
  move: [4, 5, 7, 9, 12, 15], // more per m/s the point moves
  life: [1.2, 1.3, 1.4, 1.5, 1.65, 1.8],
  alpha: [0.7, 0.73, 0.76, 0.8, 0.84, 0.88],
  off: [0.05, 0.11], // m off the steel's axis they start (either side: not printed on his blade)
  wind: 0.55, // share of the wind they ride (and a floor of drift up and back when the air is still)
  col: [0.06, 1.0, 0.06], // Matrix green (linear: the grade and the tone map lean it toward mint, so the blue is low)
  end: [0.0, 0.55, 0.05], // as it dies it dims a little toward a deeper green
};

// reused records (no allocation per frame)
const L = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, col: 0, color: [0, 0, 0], colorEnd: [0, 0, 0], alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, flicker: 0 };
const WIND = { x: 0, z: 0 };
const cmax = (c) => Math.max(c[0], c[1], c[2]);

export class SwordMystic {
  constructor(player) {
    this.player = player;
    this.game = player?.game ?? null;
    this.t = 0; // its own clock (fx time)
    this.vis = 0; // 0..1: how much of the tier is up
    this.tier = 0;
    this.n = 0; // new spawns this frame (tests)
    this.total = 0; // everything drawn so far (tests)
    /** Tests: called for every letter spawned, (kind 'spawn', glyph, alpha, life, size, colour max). */
    this.onEmit = null;
    this.lb = null; // the house letters (built the first time the layer is on)
    this._lbTried = false;
    this.acc = 0; // wisps owed
    this.tipX = NaN;
    this.tipY = 0;
    this.tipZ = 0;
    this._cx = this._cy = this._cz = 0;
  }

  /** Back to its first frame (a level reset; the film rig stages every row alike). */
  reset() {
    this.t = this.vis = this.tier = this.acc = 0;
    this.tipX = NaN;
    if (this.lb) this._lbClear();
  }

  /** Per frame (player._updateFx). With the layer off it returns at once: nothing drawn. */
  update(dt) {
    this.n = 0;
    if (PICK.mode === '0') {
      if (this.lb?.count) this._lbClear(); // (switched off live: its letters go)
      return;
    }
    const P = this.player, g = this.game;
    const fdt = Math.max(Number.isFinite(g?.fxDt) ? g.fxDt : 0, Number.isFinite(dt) ? dt : 0);
    if (!(fdt > 0) || !P) return;
    const sw = P.rig?.sword, e = sw?.matrixWorld?.elements;
    const armed = !!P.rig?.loadout?.weapon;
    const hidden = P.state === 'flurry' || (P.state === 'plunge' && P.pl?.phase === 0) || P.object3d?.visible === false;
    const lb = this._letters();
    if (lb) lb.begin();
    if (!lb || !e || !armed || !P.alive || P.state === 'dead' || hidden) {
      this.tipX = NaN;
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
    // the drawn point and how far it moved
    const tip = DIM.drawnTip ?? DIM.steelTip;
    const px = e[8] * tip + e[12], py = e[9] * tip + e[13], pz = e[10] * tip + e[14];
    let step = 0;
    if (Number.isFinite(px + py + pz)) {
      if (Number.isFinite(this.tipX)) step = Math.hypot(px - this.tipX, py - this.tipY, pz - this.tipZ);
      if (!(step < 3)) step = 0; // (a teleport, a respawn)
      this.tipX = px;
      this.tipY = py;
      this.tipZ = pz;
    }
    // the cut's own light quiets it (bladeHot 1 → MYSTIC.quiet)
    const hot = Math.min(1, Math.max(0, Number(P.bladeHot) || 0));
    const quiet = 1 - (1 - MYSTIC.quiet) * hot;
    const cam = g.camera?.matrixWorld?.elements;
    this._cx = cam ? cam[8] * MYSTIC.lift : 0;
    this._cy = cam ? cam[9] * MYSTIC.lift : 0;
    this._cz = cam ? cam[10] * MYSTIC.lift : 0;
    try {
      this._wisps(e, t, fdt, quiet, step);
    } catch (err) {
      console.error('[swordMystic]', err);
    }
    lb.flow(fdt, this.t);
    lb.end();
  }

  // ------------------------------------------------------------------ drawing
  /** The house letters' batch, built once (on this module's stream) and registered with the frame. */
  _letters() {
    if (this.lb || this._lbTried) return this.lb;
    this._lbTried = true;
    const g = this.game, mr = Math.random;
    try {
      Math.random = rnd;
      this.lb = new LetterBatch(g, 64, WISP, { spawned: 48, rand: rnd });
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

  /** A house letter that moves and fades by itself, from L (its glyph `ch`). */
  _lspawn(ch) {
    const lb = this.lb;
    if (!lb || this.n >= MYSTIC.budget) return false;
    if (!Number.isFinite(L.x + L.y + L.z) || L.y < 0.03) return false;
    L.col = lb.col(ch);
    if (!lb.spawn(L)) return false;
    this.n++;
    this.total++;
    this.onEmit?.('spawn', ch, L.alpha, L.life, 1, cmax(L.color) * L.alpha);
    return true;
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

  // ------------------------------------------------------------------ wisps off the steel
  _wisps(e, t, fdt, quiet, step) {
    const Cc = WISPS, z0 = DIM.forte + 0.1, z1 = (DIM.drawnTip ?? DIM.steelTip) - 0.02;
    const rate = this._k(Cc.rest, t) + this._k(Cc.move, t) * Math.min(1.5, step / fdt) * (0.4 + 0.6 * quiet);
    this.acc = Math.min(MYSTIC.budget, this.acc + fdt * rate);
    if (this.acc < 1) return;
    const w = this._wind(), k = Cc.wind;
    const life = this._k(Cc.life, t), alpha = this._k(Cc.alpha, t) * (0.5 + 0.5 * quiet);
    while (this.acc >= 1 && this.n < MYSTIC.budget) {
      this.acc -= 1;
      const f = Math.sqrt(rnd()); // the upper steel more than the forte
      // a point on the steel's axis (sword space x = off the axis, z = along it), a little to either side,
      // drawn toward the camera
      const xx = (rnd() < 0.5 ? -1 : 1) * R(Cc.off[0], Cc.off[1]), zz = z0 + (z1 - z0) * f;
      L.x = e[0] * xx + e[8] * zz + e[12] + this._cx;
      L.y = e[1] * xx + e[9] * zz + e[13] + this._cy;
      L.z = e[2] * xx + e[10] * zz + e[14] + this._cz;
      L.life = life * R(0.8, 1.2);
      L.vx = w.x * k + R(-0.08, 0.08);
      L.vy = R(0.12, 0.32);
      L.vz = w.z * k + R(-0.08, 0.08);
      L.color = Cc.col;
      L.colorEnd = Cc.end;
      L.alpha = alpha;
      L.alphaEnd = 0;
      L.drag = 0.6;
      L.gravity = 0;
      L.flicker = 0.15;
      this._lspawn(WISP[Math.floor(rnd() * WISP.length)]);
    }
  }
}
