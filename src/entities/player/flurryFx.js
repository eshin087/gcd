// The flurry's glyph particles (player/flurry.js; look: docs/STYLE.md → "The flurry"). Every glyph
// here is in the world atlas.
//   vanish / appear   the blink: the cold afterimage he leaves, the flash he arrives in
//   wake              the streak behind a pass
//   cut               a flash cut biting: a white stroke across the target, a star, sparks thrown on
//   lines             the HANGING CUTS, re-drawn every frame: fine lines of light through the target,
//                     pointed at both ends, a glimmer running along each
//   gather / glint    an art's coil: light drawn in onto him, a star on the blade
//   pass              the iai crossing: one thin flash, nothing more (the cut lands later)
//   artHit            the last blow: a crescent in the cut's own plane, a star, a ring, shards
//   burst             the hanging cuts open: each line flares wide and throws sparks off both sides
// The cuts hang through a hit-stop: what is re-drawn every frame takes its one-frame life from the
// effects clock (game.fxDt), as the duelists' do.
// THE STREAK PASS (combat/streak.js):
//   the storm (streakK('storm'); flurry.js): a storm cut's arrival, bite and vanish are thinner (`st`
//                     0..1, how deep into the storm), its afterimage is the light one, and its speed clone
//                     is printed on the contact; `streak` lays its run in as a few fast strokes
//   the tiers (streakK('tiers')): ONE idea, graded: past the full seven blows the cuts ECHO. At tier 4
//                     (streak 10) every hanging cut has one fine echo line beside it, at tier 5 (15) two,
//                     one on each side, and on the last blow the echoes split away from their cuts while
//                     rings open where they cross (one ring an echo). Written in the fire field's steel on
//                     the letter grid (STYLE.md "The fire field"; combat/impactStamp.js is the worked
//                     example): one blob to a cell, snapped, a one-copy frame clock. Lines, not light:
//                     nothing here is brighter than a hanging cut.
// `pull` (m): round the wyrm's head the cuts run THROUGH a body several metres thick, and glyph
// particles are depth-tested against the scene: drawn where they are, a cut would show only where it
// leaves the head. Every particle spawned here is moved `pull` m toward the camera along its own
// line of sight: the same place on the screen, in front of the head instead of inside it.

import { FIRE_KIND } from '../../render/firePalettes.js';
import { axes } from '../../combat/clashFx.js';
import { burstLook } from './flurryBurst.js';
import { DEFENSE } from '../../combat/rules.js';
import { slashMode } from './slashFx.js';
const CHORD = new Float32Array(6); // a swept finisher's chord (the instant slash)

// cosmetic noise from this module's own stream (never Math.random: the seeded sims replay the AI's)
let seed = 0x5f3759df;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);
/** This module's random stream now (tests: every burst level makes the same draws). */
export const fxSeed = () => seed;
/** Tests: put the stream at `v`. */
export const setFxSeed = (v) => (seed = v >>> 0);
const fin = (v) => Number.isFinite(v);

/**
 * The tiers' look (streakK('tiers') scales the number of echoes: 0 none, 0.5 half, 1 as tuned).
 *   echoes   echo lines beside every hanging cut, by tier (index = streakTier: 0..5)
 *   rings    rings opening where the cuts cross on the last blow, by tier
 *   gap      cells across the line from a cut to its first echo (the next one the other side, ...)
 *   trim     each echo is this much shorter at each end than its cut, x its number
 *   heat     an echo's steel heat at its middle (about 0.6 a dim stroke, 1.1 a bright one), `end` at its ends
 *   pull     m the steel is drawn toward the camera on the ground (round the wyrm's head: the flurry's own pull)
 *   px       a blob, frame px at a 5 x 8 px cell (one cell)
 *   minY     no blob below this height (m): heat near the floor fades into it
 *   burst    the last blow: `hold` s of fx time a frame (stepped), each frame's echo offset (cells, from
 *            the cut) and heat, the rings' radii (m at a man's size; x 1.6 round the wyrm's head; 0 none)
 *            the share of a ring's cells kept (a ring breaking up into specks) and the share of each
 *            echo's middle that is gone (the halves fly apart: no band of strokes over the target)
 */
export const TIER_LOOK = Object.freeze({
  echoes: Object.freeze([0, 0, 0, 0, 1, 2]),
  rings: Object.freeze([0, 0, 0, 0, 1, 2]),
  gap: 2,
  trim: 0.12,
  heat: 0.55,
  end: 0.3,
  pull: 1.2,
  px: 12,
  minY: 0.6,
  burst: Object.freeze({
    hold: 0.045,
    off: Object.freeze([2, 3, 4, 5]),
    heat: Object.freeze([1.1, 0.8, 0.55, 0.36]),
    hole: Object.freeze([0.2, 0.4, 0.6, 0.8]),
    ring: Object.freeze([0, 1.0, 1.6, 2.3]),
    keep: Object.freeze([0, 1, 0.7, 0.35]),
  }),
});
/**
 * The chain's last blow on the ground (STREAK_FX.chain; DEFENSE.flurry.chain): WHITE-STEEL LETTER
 * DUST in place of the slam's big 'A' shards. Many tiny letters, each about one letter cell, steel
 * white to a pale blue-grey, never brighter than the bloom threshold (CONFIG.render.bloomThreshold
 * 0.55; normal blending, the alpha pool: crisp letters, no glow, as combat/parrySparks.js keeps its
 * sparks): most thrown out low and fast along the blow and to its sides, slowed hard by their drag
 * into a faint drift that thins out; a few heavier dots fall to the floor.
 *   n / heavy  letters / heavier dots (x `k`: a landing's is smaller)
 *   size       m, [min, max] (sizeEnd the same or less: no letter grows)
 *   ahead      the share thrown along the blow (+- `cone` rad round it); most of the rest to its
 *              sides (+- `side` rad round square to it), a few back
 *   speed      m/s [min, max]; `up` m/s up; `drag` 1/s; `gravity` m/s2 (the drift's: it barely sinks)
 *   life       s [min, max]
 *   y          m, the height they are thrown from [min, max]
 *   heavyLife / heavySpeed / heavyUp / heavyGravity: the dots that fall
 *   col / colBlue / colEnd  steel white, a pale blue-grey (`blue` of them) -> a faint grey (linear; <= 0.55)
 *   alpha      at the start (fades to 0)
 *   glyphs     small strokes and dots of the world atlas
 */
export const DUST = Object.freeze({
  n: 96,
  heavy: 8,
  size: Object.freeze([0.05, 0.09]),
  ahead: 0.6,
  cone: 0.7,
  side: 0.5,
  speed: Object.freeze([4, 11]),
  up: Object.freeze([0.2, 1.8]),
  drag: Object.freeze([4.5, 7.5]),
  gravity: -0.8,
  life: Object.freeze([0.6, 0.9]),
  y: Object.freeze([0.06, 0.45]),
  heavyLife: Object.freeze([0.45, 0.65]),
  heavySpeed: Object.freeze([2, 4.5]),
  heavyUp: Object.freeze([1.5, 3]),
  heavyGravity: -12,
  col: Object.freeze([0.5, 0.53, 0.55]),
  colBlue: Object.freeze([0.36, 0.43, 0.54]),
  colEnd: Object.freeze([0.2, 0.23, 0.28]),
  blue: 0.4,
  alpha: 0.85,
  glyphs: ".,'`:;-_*+x",
  heavyGlyphs: '.·',
});
const K_STEEL = FIRE_KIND.steel;
const DF = DEFENSE.flurry.dodgefx; // the dodge looks (?dodgefx): the blooms, the tendrils, the spark cloud
const BLOOM_GLYPHS = "*+.:'";
const TENDRIL_GLYPHS = ".:,'-";
const PCAP = 192, PW = 9; // the crawling tendrils' letters not yet due (delay, x, z, vx, vz, life, size, glyph, colour)
const ONE2 = Object.freeze([1, 1]);
/** The burst level's [a, b] for `key` (flurryBurst.js; today [1, 1]). */
const lk = (L, key) => (L && Array.isArray(L[key]) ? L[key] : ONE2);
// the blob written for every cell, reused
const BLOB = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.3, sizeEnd: 0.3, heat: 1, heatEnd: 1, kind: K_STEEL, drag: 0, gravity: 0 };
// the cells of one drawn frame: screen cell (i, j), its heat, its world point; the hottest wins a cell
const MAXC = 1400;
const CI = new Int32Array(MAXC), CJ = new Int32Array(MAXC), CH = new Float32Array(MAXC), CX = new Float32Array(MAXC * 3);
const SCR = { mpp: 0.025, px: 0, py: 0, cw: 5, ch: 8, ok: false };
/** (x, y, z) on the frame (as impactStamp.js `screen`): px, py (frame px, origin bottom-left), mpp. */
function screen(game, x, y, z) {
  const S = SCR, cam = game?.camera, p = game?.pipeline;
  S.ok = false;
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

const COL = {
  core: [2.7, 3.3, 4.5], // a hanging cut's line: ice white
  veil: [0.28, 0.85, 2.1],
  last: [3.3, 2.5, 4.6], // the art's own line: the gem's violet in it
  lastVeil: [1.0, 0.4, 2.3],
  hot: [4.4, 4.2, 4.0], // the white of a blow landing
  ice: [1.3, 2.3, 3.9],
  iceEnd: [0.1, 0.3, 1.0],
  spark: [2.4, 3.0, 4.3],
  sparkEnd: [0.2, 0.45, 1.4],
  gold: [4.2, 3.0, 1.1], // a long flurry's last cuts run hot
  goldEnd: [1.3, 0.45, 0.08],
  shard: [0.9, 1.9, 4.2],
  shardEnd: [0.1, 0.25, 1.0],
  mote: [0.7, 1.7, 3.0],
  moteEnd: [0.2, 0.5, 1.6],
};
// screen axes of the fixed game camera (pitch 58°), used when there is no camera matrix (tests)
const UP_Y = 0.53, UP_Z = -0.85;
const LINE_STEP = 0.75; // m of a hanging cut per stroke

export class FlurryFx {
  /** `pfx`: the hero's PlayerFx (the afterimage, sparks and rings are its). */
  constructor(game, pfx) {
    this.game = game;
    this.pfx = pfx;
    this.cam = null;
    this.acc = 0;
    this.pull = 0; // m toward the camera (see above): the flurry sets it for its target
    this.k = 1; // the size of a cut's flare, crescent and burst (1 the wyrm's head; DEFENSE.flurry.ground.fx a man)
    this._fx = null;
    this._px = { spawn: (o) => this._spawn(o) };
    this._q = [0, 0, 0];
    // the tiers (TIER_LOOK): echo lines beside each hanging cut, written in steel
    this.echo = 0; // echo lines a cut (0: today's look)
    this.rings = 0; // rings on the last blow
    this._bRings = 0;
    this.tier = 0;
    this._now = 0; // fx time, and when the steel alive now dies (the one-copy frame clock)
    this._dl = -1;
    this._nc = 0;
    // the last blow's split (stepped): the lines it burst, where they crossed, its age (fx s; < 0 none)
    this._bl = Array.from({ length: 10 }, () => ({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, k: 1, last: false }));
    this._bn = 0;
    this._bAge = -1;
    this._bAt = { x: 0, y: 0, z: 0 };
    this._bEcho = 0;
    this._bPull = 0;
    this._bK = 1;
    this.stormClones = 0; // storm cuts' clones printed (the tests read it)
    this._cr = 1; // the crescents' alpha (the art's, at a burst level)
    // the chain (STREAK_FX.chain; the flurry sets it as it starts): every slash on the path he ran.
    // No crescent bowed off it, the split's / vault's crescent his blade's sampled path, the burst's
    // thin lines no longer than the cuts, letter dust for the last blow's shards
    this.chain = false;
    this.dustStat = { n: 0, maxSize: 0, maxCol: 0 }; // the last dust thrown (tests)
    this._pq = new Float32Array(PCAP * PW); // letters waiting their turn (tendrils crawl: a letter every DF.bloom.step s)
    this._pn = 0;
    /** The dodge looks' counts (tests): blooms, tendrils, sparks thrown; the biggest size; the brightest channel. */
    this.dodgeStat = { bloom: 0, tendrils: 0, sparks: 0, maxSize: 0, maxCol: 0 };
    /** The last burst's counts (tests): light intensity, bright spawns, thin lines. */
    this.burstStat = { light: 0, thin: 0, flare: 0, star: 0 };
    /** Counts for the tests (reused): steel cells written in the last drawn frame, in all, the most. */
    this.steelStat = { last: 0, total: 0, peak: 0, frames: 0, rings: 0 };
  }

  /** The flurry starting answers a streak at `tier` (streakTier); `k` = streakK('tiers'). */
  setTier(tier, k = 1) {
    this.tier = tier | 0;
    const e = TIER_LOOK.echoes[Math.max(0, Math.min(TIER_LOOK.echoes.length - 1, this.tier))] ?? 0;
    this.echo = k > 0 ? Math.max(0, Math.min(3, Math.round(e * k))) : 0;
    const r = TIER_LOOK.rings[Math.max(0, Math.min(TIER_LOOK.rings.length - 1, this.tier))] ?? 0;
    this.rings = k > 0 ? Math.max(0, Math.min(3, Math.round(r * k))) : 0;
  }

  /** The additive particles (null: none), through the pull. */
  get add() {
    this.cam = this.game.camera?.matrixWorld?.elements ?? null;
    this._fx = this.pfx?.add ?? this.game.fx?.add ?? null;
    return this._fx ? this._px : null;
  }

  /** (x, y, z) moved `pull` m toward the camera along its line of sight → this._q. */
  _pulled(x, y, z) {
    const C = this.cam, q = this._q, k = this.pull;
    q[0] = x;
    q[1] = y;
    q[2] = z;
    if (C && k > 0) {
      const dx = C[12] - x, dy = C[13] - y, dz = C[14] - z, l = Math.hypot(dx, dy, dz);
      // (never past the camera, never when it is nearly on top of the point)
      if (l > k + 4 && Number.isFinite(l)) {
        q[0] += (dx / l) * k;
        q[1] += (dy / l) * k;
        q[2] += (dz / l) * k;
      }
    }
    return q;
  }

  _spawn(o) {
    if (this.pull > 0) {
      const q = this._pulled(o.x ?? 0, o.y ?? 0, o.z ?? 0);
      o.x = q[0];
      o.y = q[1];
      o.z = q[2];
    }
    return this._fx.spawn(o);
  }

  /** Screen-space rotation that lays a '|' glyph along the world direction (dx, dy, dz). */
  _rot(dx, dy, dz) {
    const C = this.cam;
    if (C) {
      const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6];
      if (sx * sx + sy * sy > 1e-12 && Number.isFinite(sx + sy)) return Math.atan2(sy, sx) - Math.PI / 2;
    }
    return Math.atan2(dy * UP_Y + dz * UP_Z, dx) - Math.PI / 2;
  }

  _light(o) {
    return this.game.lights?.add?.(o) ?? null;
  }

  /** He is gone from (x, y, z): the afterimage of the pose he left (`segs`: PlayerFx._afterimage)
   *  and a pinch of motes falling in on the spot. `light`: between two cuts (fewer motes). */
  vanish(segs, nSegs, x, y, z, light = false, dx = 0, dz = 0, st = 0) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    // (where he stood: in the open, not pulled. A storm cut leaves the light afterimage: its clone on
    // the contact is the figure that stays)
    this.pfx?._afterimage?.(this._fx, segs, nSegs, st > 0 ? { dx, dz, light: true } : { dx, dz });
    const n = st > 0 ? 2 : light ? 5 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R(-0.3, 0.3), r = R(0.4, 0.8), ey = R(0.2, 1.6);
      fx.spawn({
        x: x + Math.cos(a) * r, y: y + ey, z: z + Math.sin(a) * r, vx: -Math.cos(a) * r * 4, vy: (1 - ey) * 2, vz: -Math.sin(a) * r * 4,
        life: R(0.14, 0.24), size: R(0.1, 0.16), sizeEnd: 0.03, glyph: "·'+", color: COL.mote, colorEnd: COL.moteEnd, alpha: 0.9, alphaEnd: 0,
      });
    }
  }

  /** A speed clone: the shape of him in the middle of a pass (`segs`: PlayerFx._afterimage), left
   *  hanging on the cut's line. */
  clone(segs, nSegs, storm = false) {
    if (!this.add) return;
    this.pfx?._afterimage?.(this._fx, segs, nSegs, { light: true });
    if (storm) this.stormClones++;
  }

  /** The dodge looks (?dodgefx): a smeared copy of him along a pass (`segs`: PlayerFx._afterimage), moving
   *  the way (dx, dz): short-lived and faint, the cells drifting back along the run. */
  smear(segs, nSegs, dx, dz) {
    if (!this.add) return;
    this.pfx?._afterimage?.(this._fx, segs, nSegs, { light: true, smear: true, dx, dz });
  }

  /** The dash: a few tiny letters kicked off the floor at his feet (x, z), thrown low along (dx, dz)
   *  (the way they fly: -dir at a push-off, +dir as he slows into the finish). `k` x the count. */
  kick(x, z, dx, dz, k = 1) {
    const fa = this.game.fx?.alpha ?? this._fx;
    if (!fa || !Number.isFinite(x + z + dx + dz)) return;
    const base = Math.atan2(dz, dx), n = Math.round(10 * k);
    for (let i = 0; i < n; i++) {
      const a = base + R(-0.45, 0.45), sp = R(2.5, 6), size = R(0.05, 0.09);
      fa.spawn({
        x: x + R(-0.12, 0.12), y: R(0.04, 0.16), z: z + R(-0.12, 0.12), vx: Math.cos(a) * sp, vy: R(0.2, 1.1), vz: Math.sin(a) * sp,
        life: R(0.2, 0.35), size, sizeEnd: size * R(0.6, 1), glyph: i % 3 ? '.,:' : "·'+", color: i % 2 ? DUST.col : DUST.colBlue, colorEnd: DUST.colEnd, alpha: 0.8, alphaEnd: 0,
        drag: R(3, 5), gravity: -2.5,
      });
    }
  }

  /**
   * The dodge looks (?dodgefx=b, and the Thunder Thrust): a small steel-white BLOOM at the blade's point
   * (x, y, z) as a blow lands: DF.bloom.n x `k` tiny letters puffing out and gone in 0.1 - 0.15 s. Tiny
   * and under the bloom threshold, like DUST.
   */
  bloom(x, y, z, dx, dz, k = 1) {
    const fa = this.game.fx?.alpha ?? null, B = DF.bloom, st = this.dodgeStat;
    if (!fa || !Number.isFinite(x + y + z + dx + dz + k)) return;
    const n = Math.round(B.n * k);
    st.bloom++;
    for (let i = 0; i < n; i++) {
      // (a puff in every direction, a little more of it up and along the blow)
      const a = R(0, 6.2832), up = R(-0.4, 1), sp = R(B.speed[0], B.speed[1]), size = R(B.size[0], B.size[1]);
      const c = i % 3 ? DUST.col : DUST.colBlue;
      fa.spawn({
        x: x + R(-0.04, 0.04), y: y + R(-0.04, 0.04), z: z + R(-0.04, 0.04), vx: Math.cos(a) * sp + dx * 0.6, vy: up * sp * 0.6, vz: Math.sin(a) * sp + dz * 0.6,
        life: R(B.life[0], B.life[1]), size, sizeEnd: size * R(0.5, 0.9), glyph: BLOOM_GLYPHS, color: c, colorEnd: DUST.colEnd, alpha: 0.85, alphaEnd: 0, drag: R(6, 9), gravity: 0,
      });
      this._stat(size, c);
    }
  }

  /**
   * `n` thin TENDRILS of tiny letters crawling outward over the floor from (x, z) (under the blow's
   * point): each a jagged line of DF.bloom.len letters over DF.bloom.reach m, the letters coming a
   * DF.bloom.step s apart from the root out (so it reads as crawling), each living DF.bloom.tlife s; all
   * gone by about 0.4 s. `k` x their length. The letters wait in a fixed queue (flush).
   */
  tendrils(x, z, dx, dz, n, k = 1) {
    const B = DF.bloom, st = this.dodgeStat;
    if (!this.game.fx?.alpha || !Number.isFinite(x + z + dx + dz + n + k)) return;
    const base = Math.atan2(dz, dx);
    for (let j = 0; j < n; j++) {
      let h = base + (j + R(-0.3, 0.3)) * (6.2832 / Math.max(1, n));
      const m = Math.round(R(B.len[0], B.len[1])), step = (R(B.reach[0], B.reach[1]) * Math.max(0.4, k)) / m;
      let px = x, pz = z;
      for (let i = 0; i < m; i++) {
        h += R(-0.55, 0.55); // (jagged: it kinks as it goes)
        px += Math.cos(h) * step;
        pz += Math.sin(h) * step;
        if (this._pn >= PCAP) break;
        const q = this._pq, o = this._pn++ * PW;
        q[o] = i * B.step + R(0, 0.012);
        q[o + 1] = px;
        q[o + 2] = pz;
        q[o + 3] = Math.cos(h) * R(0.3, 0.9);
        q[o + 4] = Math.sin(h) * R(0.3, 0.9);
        q[o + 5] = R(B.tlife[0], B.tlife[1]);
        q[o + 6] = R(0.045, 0.07);
        q[o + 7] = (Math.floor(rnd() * TENDRIL_GLYPHS.length)) | 0;
        q[o + 8] = i % 3 ? 0 : 1;
      }
      st.tendrils++;
    }
  }

  /** Throw the tendrils' letters that are due (`dt`: fx s since the last frame; Flurry.draw, every frame). */
  flush(dt) {
    if (this._pn <= 0) return;
    const fa = this.game.fx?.alpha ?? null, q = this._pq;
    if (!fa || !(dt >= 0)) {
      this._pn = 0;
      return;
    }
    for (let i = 0; i < this._pn; ) {
      const o = i * PW;
      q[o] -= dt;
      if (q[o] > 0) {
        i++;
        continue;
      }
      const size = q[o + 6], c = q[o + 8] ? DUST.colBlue : DUST.col;
      fa.spawn({
        x: q[o + 1], y: R(0.03, 0.07), z: q[o + 2], vx: q[o + 3], vy: 0, vz: q[o + 4],
        life: q[o + 5], size, sizeEnd: size * 0.7, glyph: TENDRIL_GLYPHS[q[o + 7] | 0] ?? '.', color: c, colorEnd: DUST.colEnd, alpha: 0.8, alphaEnd: 0, drag: 2.5, gravity: 0,
      });
      this._stat(size, c);
      // (the last queued letter takes this one's place)
      this._pn--;
      if (i < this._pn) {
        const l = this._pn * PW;
        for (let f = 0; f < PW; f++) q[o + f] = q[l + f];
      }
    }
  }

  /**
   * The dodge looks (?dodgefx=c): a spray of DF.cloud.n x `k` tiny steel sparks round a contact (x, y, z)
   * that fall slowly and live 1.2 - 2 s, so a streak of blows builds a cloud of them round the foe.
   * Thinned when the particle pool is more than DF.cloud.cap full.
   */
  sparks(x, y, z, k = 1) {
    const fa = this.game.fx?.alpha ?? null, C = DF.cloud, st = this.dodgeStat;
    if (!fa || !Number.isFinite(x + y + z + k)) return;
    let n = Math.round(C.n * k);
    if (fa.max > 0 && fa.count > fa.max * C.cap) n = Math.round(n * C.thin);
    for (let i = 0; i < n; i++) {
      const a = R(0, 6.2832), sp = R(C.speed[0], C.speed[1]), size = R(C.size[0], C.size[1]);
      const c = i % 3 ? DUST.col : DUST.colBlue;
      fa.spawn({
        x: x + R(-0.35, 0.35), y: y + R(-0.3, 0.4), z: z + R(-0.35, 0.35), vx: Math.cos(a) * sp, vy: R(-0.2, 1.2), vz: Math.sin(a) * sp,
        life: R(C.life[0], C.life[1]), size, sizeEnd: size * R(0.6, 1), glyph: ".,'`:;*+", color: c, colorEnd: DUST.colEnd, alpha: 0.8, alphaEnd: 0, drag: C.drag, gravity: C.gravity, flicker: 0.3,
      });
      st.sparks++;
      this._stat(size, c);
    }
  }

  _stat(size, c) {
    const st = this.dodgeStat;
    if (size > st.maxSize) st.maxSize = size;
    st.maxCol = Math.max(st.maxCol, c[0], c[1], c[2]);
  }

  /** A storm cut's run in: from where it started (a: root, `up` m under the blade) to where it lands
   *  (b: root), a few fast thin strokes along it (the pass he was too fast to be drawn in). */
  streak(a, b, up, dx, dz) {
    const fx = this.add;
    if (!fx || !a || !b || !Number.isFinite(a.x + a.y + a.z + b.x + b.y + b.z)) return;
    const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, l = Math.hypot(ex, ey, ez);
    if (!(l > 0.2)) return;
    const rot = this._rot(ex, ey, ez);
    for (let j = 0; j < 4; j++) {
      const f = (j + 0.5) / 4, size = R(0.07, 0.1);
      fx.spawn({
        x: a.x + ex * f, y: a.y + up * 0.9 + ey * f + R(-0.25, 0.2), z: a.z + ez * f, vx: (ex / l) * 2, vy: 0, vz: (ez / l) * 2,
        life: R(0.07, 0.12), size, sizeEnd: size * 0.3, stretch: (l / 4 / size) * 1.1, glyph: '|', rot,
        color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.75 * (0.5 + 0.5 * f), alphaEnd: 0,
      });
    }
  }

  /**
   * The ground gives under a blow on a foe who stands on it, at (x, z), the cut travelling (dx, dz):
   * a low shock ring racing out, dust thrown up along the cut, grit. k: 0.6 a flash cut … 1.6 the
   * last blow.
   */
  ground(x, z, dx, dz, k = 1) {
    const fx = this.add, fa = this.game.fx?.alpha ?? null;
    if (!fx || !Number.isFinite(x + z)) return;
    const n = Math.round(14 * k);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, sp = (5 + 4 * k) * (0.8 + 0.4 * rnd());
      fx.spawn({
        x: x + Math.cos(a) * 0.3, y: 0.1, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp,
        life: 0.2 + 0.08 * k, size: 0.16 * (0.8 + 0.3 * k), sizeEnd: 0.05, stretch: 1.8, glyph: '|', rot: this._rot(-Math.sin(a), 0, Math.cos(a)),
        color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.8, alphaEnd: 0, drag: 5,
      });
    }
    if (!fa) return;
    for (let i = 0; i < Math.round(9 * k); i++) {
      const s = R(-1, 1), sp = R(2, 6) * k;
      fa.spawn({
        x: x + R(-0.3, 0.3), y: 0.1, z: z + R(-0.3, 0.3), vx: dx * sp - dz * s * 2, vy: R(0.8, 3) * k, vz: dz * sp + dx * s * 2,
        life: R(0.4, 0.8), size: R(0.16, 0.26), sizeEnd: R(0.4, 0.6), glyph: '.,:', color: [0.2, 0.19, 0.17], colorEnd: [0.08, 0.08, 0.07],
        alpha: 0.75, alphaEnd: 0, drag: 2.6, gravity: -3,
      });
    }
  }

  /**
   * The impact frame of a heavy blow at (x, y, z): speed lines thrown out of it across the whole
   * screen (in the screen's own plane, long and thin, gone in a few frames), most along the cut
   * (dx, dz) and against it. k: 0.7 a riposte's last cut … 1 an art.
   */
  impact(x, y, z, dx, dz, k = 1) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const C = this.cam;
    const rx = C ? C[0] : 1, ry = C ? C[1] : 0, rz = C ? C[2] : 0;
    const ux = C ? C[4] : 0, uy = C ? C[5] : UP_Y, uz = C ? C[6] : UP_Z;
    // the cut's heading on the screen
    const cx = dx * rx + dz * rz, cy = dx * ux + dz * uz, base = Math.atan2(cy, cx);
    k *= this.k;
    // (the burst's level, flurryBurst.js: today null; every random draw is made at every level)
    const L = burstLook(), sa0 = L ? (L.speed ?? 1) : 1;
    const n = Math.round(30 * k);
    for (let i = 0; i < n; i++) {
      // two fans, along the cut and against it, a few strays all round
      const a = i % 5 === 0 ? R(0, Math.PI * 2) : base + (i % 2 ? Math.PI : 0) + R(-0.55, 0.55);
      const ca = Math.cos(a), sa = Math.sin(a);
      const wx = rx * ca + ux * sa, wy = ry * ca + uy * sa, wz = rz * ca + uz * sa;
      const r0 = R(1.2, 3.2), sp = R(22, 46) * k, size = R(0.07, 0.13);
      const life = R(0.09, 0.17), stretch = R(14, 30);
      if (sa0 > 0) {
        fx.spawn({
          x: x + wx * r0, y: y + wy * r0, z: z + wz * r0, vx: wx * sp, vy: wy * sp, vz: wz * sp,
          life, size, sizeEnd: size * 0.3, stretch, glyph: '|', rot: a - Math.PI / 2,
          color: i % 3 ? COL.hot : COL.ice, colorEnd: COL.iceEnd, alpha: 0.85 * sa0, alphaEnd: 0, drag: 2,
        });
      }
    }
    // a hard white core for two frames, then nothing: the frame the blow lands on
    const st = lk(L, 'star');
    if (st[0] > 0) fx.spawn({ x, y, z, life: 0.05, size: 2.2 * k * st[1], sizeEnd: 1.2 * k * st[1], glyph: '+', rot: base, color: COL.hot, colorEnd: COL.hot, alpha: st[0], alphaEnd: 0.4 * st[0] });
  }

  /** He is THERE: an upright flash of cold light at (x, y, z: his chest), streaks thrown back
   *  against his heading (dx, dz). `i` of `n`: later cuts flash brighter; `art`: the last blow's. */
  appear(x, y, z, dx, dz, i = 0, n = 1, art = false, st = 0) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const k = n > 1 ? i / (n - 1) : 0, s = art ? 1.5 : 0.9 + 0.3 * k;
    if (st > 0) {
      // a storm cut: he is in the cut already. One thin upright stroke, a couple of streaks back
      fx.spawn({ x, y, z, life: 0.05, size: 0.08 * s, sizeEnd: 0.03, stretch: 14, glyph: '|', color: COL.hot, colorEnd: COL.ice, alpha: 0.7, alphaEnd: 0 });
      for (let j = 0; j < 2; j++) {
        const sp = R(4, 9), vx = -dx * sp, vy = R(-0.4, 0.8), vz = -dz * sp;
        fx.spawn({
          x, y: y + R(-0.4, 0.3), z, vx, vy, vz, life: R(0.08, 0.14), size: R(0.1, 0.14), sizeEnd: 0.03, stretch: 1.6,
          glyph: '|', rot: this._rot(vx, vy, vz), color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.8, alphaEnd: 0, drag: 4,
        });
      }
      return;
    }
    // the way he came: characters off the afterimage he left fly here, and more rush in onto him
    this.pfx?.blinkStream?.(this._fx, x, y, z);
    this.pfx?.blinkIn?.(this._fx, x, y, z);
    // (thin: a fat upright stroke blooms into a white pill that hides him as he arrives)
    fx.spawn({ x, y, z, life: 0.07, size: 0.11 * s, sizeEnd: 0.04, stretch: 16, glyph: '|', color: COL.hot, colorEnd: COL.ice, alpha: 0.85, alphaEnd: 0 });
    fx.spawn({ x, y: y + 0.2, z, life: 0.1, size: 0.42 * s, sizeEnd: 0.1, glyph: '+', rot: 0.785, color: COL.hot, colorEnd: COL.ice, alpha: 1, alphaEnd: 0 });
    const m = art ? 12 : 5;
    for (let j = 0; j < m; j++) {
      const sp = R(3, 9), vx = -dx * sp + R(-1.5, 1.5), vy = R(-0.8, 1.6), vz = -dz * sp + R(-1.5, 1.5);
      fx.spawn({
        x, y: y + R(-0.5, 0.4), z, vx, vy, vz, life: R(0.12, 0.22), size: R(0.12, 0.18), sizeEnd: 0.04, stretch: 1.6,
        glyph: '|', rot: this._rot(vx, vy, vz), color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.9, alphaEnd: 0, drag: 4,
      });
    }
    if (art) this._light({ x, y, z, color: [0.55, 0.78, 1.4], intensity: 3, radius: 6, life: 0.25, fade: 0.2, fadeIn: 0.02 });
  }

  /** The streak behind a pass, a frame's worth, at (x, y, z), moving along (dx, dy, dz) (unit). */
  wake(x, y, z, dx, dy, dz) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z + dx + dy + dz)) return;
    const rot = this._rot(dx, dy, dz);
    for (let j = 0; j < 3; j++) {
      const back = R(0.1, 1.1), oy = R(-0.55, 0.45), size = R(0.1, 0.16);
      fx.spawn({
        x: x - dx * back + R(-0.08, 0.08), y: y + oy - dy * back, z: z - dz * back + R(-0.08, 0.08), vx: dx * R(0.5, 2), vy: dy * R(0.5, 2), vz: dz * R(0.5, 2),
        life: R(0.1, 0.2), size, sizeEnd: size * 0.3, stretch: R(4, 9), glyph: '|', rot,
        color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.7, alphaEnd: 0, drag: 3,
      });
    }
    fx.spawn({
      x: x + R(-0.2, 0.2), y: y + R(-0.6, 0.5), z: z + R(-0.2, 0.2), vx: R(-0.5, 0.5), vy: R(0.1, 0.8), vz: R(-0.5, 0.5),
      life: R(0.2, 0.36), size: R(0.07, 0.11), sizeEnd: 0.03, glyph: "·'", color: COL.mote, colorEnd: COL.moteEnd, alpha: 0.85, alphaEnd: 0, drag: 2,
    });
  }

  /** A flash cut bites at (x, y, z), the blade travelling (dx, dz): a white stroke across it, a star,
   *  sparks thrown on along the cut. `i` of `n`: each cut of a flurry bites harder than the last.
   *  `wk` (the storm's tempo: 1 at a heavy beat down to storm.fx near the storm): the flare (the
   *  stroke, the star, the light) and the sparks are scaled by it; the crescent keeps its size. */
  cut(x, y, z, dx, dz, i = 0, n = 1, st = 0, wk = 1) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    if (st > 0) {
      this._stormCut(fx, x, y, z, dx, dz, i, st);
      return;
    }
    if (!(wk > 0) || !Number.isFinite(wk)) wk = 1;
    const k = n > 1 ? i / (n - 1) : 0, s = (1 + 0.5 * k) * this.k * (wk < 1 ? wk : 1);
    const hot = k > 0.6, c0 = hot ? COL.gold : COL.spark, c1 = hot ? COL.goldEnd : COL.sparkEnd;
    const rot = this._rot(dx, 0, dz);
    // the stroke: bright for two frames, along the cut
    fx.spawn({ x, y, z, life: 0.07, size: 0.22 * s, sizeEnd: 0.05, stretch: 11, glyph: '|', rot, color: COL.hot, colorEnd: COL.ice, alpha: 1, alphaEnd: 0 });
    // the blade's own arc: a crescent through the target in the cut's plane, bowed to one side of
    // the line and up or down a little (each cut the other way)
    const sg = i % 2 ? -1 : 1, tilt = (i % 3) * 0.3 - 0.3;
    const vx = -dz * sg * Math.cos(tilt), vy = Math.sin(tilt), vz = dx * sg * Math.cos(tilt);
    const r = (2.3 + 0.5 * k) * this.k;
    // (the chain: no crescent, it bows off the path he ran; his hanging line is the slash)
    if (!this.chain) this._crescent(fx, x - vx * r, y - vy * r, z - vz * r, dx, 0, dz, vx, vy, vz, r, Math.PI / 2 + 0.95, Math.PI / 2 - 0.95, (0.4 + 0.15 * k) * this.k, 0.22, COL.hot, hot ? COL.gold : COL.ice, 0.1 * Math.sqrt(this.k));
    const CL = burstLook()?.cut, cs = CL?.star ?? ONE2, cl = CL ? CL.light ?? 1 : 1;
    if (cs[0] > 0) fx.spawn({ x, y, z, life: 0.09, size: 0.7 * s * cs[1], sizeEnd: 0.15 * cs[1], glyph: '+', rot: rot + 0.785, color: COL.hot, colorEnd: c0, alpha: cs[0], alphaEnd: 0 });
    const m = wk < 1 ? Math.max(3, Math.round((8 + 6 * k) * wk)) : 8 + Math.round(6 * k);
    for (let j = 0; j < m; j++) {
      const sp = R(5, 13) * s, vx = dx * sp + R(-3, 3), vy = R(-1, 4.5), vz = dz * sp + R(-3, 3);
      fx.spawn({
        x, y, z, vx, vy, vz, life: R(0.14, 0.3), size: R(0.1, 0.18), sizeEnd: 0.03, stretch: 1.8,
        glyph: "|'", rot: this._rot(vx, vy, vz), color: c0, colorEnd: c1, alpha: 1, alphaEnd: 0, drag: 3.5, gravity: -5,
      });
    }
    if (cl > 0) this._light({ x, y, z, color: hot ? [1.3, 0.95, 0.45] : [0.6, 0.85, 1.4], intensity: (2.4 + 1.2 * k) * cl * (wk < 1 ? wk : 1), radius: 5, life: 0.14, fade: 0.12 });
  }

  /** A storm cut bites: the stroke and a thin, short crescent (its line is the look), a small star,
   *  a few sparks. No light: a storm of cuts a few frames apart must not bloom into a white blot. */
  _stormCut(fx, x, y, z, dx, dz, i, st) {
    const s = 0.9 * this.k, rot = this._rot(dx, 0, dz), hot = st > 0.5;
    fx.spawn({ x, y, z, life: 0.06, size: 0.16 * s, sizeEnd: 0.04, stretch: 12, glyph: '|', rot, color: COL.hot, colorEnd: COL.ice, alpha: 1, alphaEnd: 0 });
    const sg = i % 2 ? -1 : 1, tilt = (i % 3) * 0.3 - 0.3;
    const vx = -dz * sg * Math.cos(tilt), vy = Math.sin(tilt), vz = dx * sg * Math.cos(tilt);
    const r = 2.5 * this.k;
    if (!this.chain) this._crescent(fx, x - vx * r, y - vy * r, z - vz * r, dx, 0, dz, vx, vy, vz, r, Math.PI / 2 + 0.8, Math.PI / 2 - 0.8, 0.22 * this.k, 0.15, COL.hot, hot ? COL.gold : COL.ice, 0.08 * Math.sqrt(this.k));
    const cs = burstLook()?.cut?.star ?? ONE2;
    if (cs[0] > 0) fx.spawn({ x, y, z, life: 0.06, size: 0.4 * s * cs[1], sizeEnd: 0.1 * cs[1], glyph: '+', rot: rot + 0.785, color: COL.hot, colorEnd: hot ? COL.gold : COL.spark, alpha: 0.9 * cs[0], alphaEnd: 0 });
    for (let j = 0; j < 4; j++) {
      const sp = R(5, 12) * s, svx = dx * sp + R(-3, 3), svy = R(-1, 4), svz = dz * sp + R(-3, 3);
      fx.spawn({
        x, y, z, vx: svx, vy: svy, vz: svz, life: R(0.12, 0.24), size: R(0.09, 0.15), sizeEnd: 0.03, stretch: 1.8,
        glyph: "|'", rot: this._rot(svx, svy, svz), color: hot ? COL.gold : COL.spark, colorEnd: hot ? COL.goldEnd : COL.sparkEnd, alpha: 1, alphaEnd: 0, drag: 3.5, gravity: -5,
      });
    }
  }

  /**
   * The hanging cuts, this frame: `lines[0..n)` = { ax, ay, az, bx, by, bz, k (0..1 drawn so far),
   * last }. Each a fine line pointed at both ends, a veil round it, a glimmer running along it.
   */
  lines(lines, n, game) {
    const fx = this.add;
    const fdt = game?.fxDt ?? game?.dt ?? 0.016;
    if (!fx || !(fdt > 0)) return; // (paused: nothing ages, so nothing is drawn again)
    const life = Math.max(0.02, fdt * 1.6), t = game?.realTime ?? game?.time ?? 0;
    // (a burst level dims the soft veil round each line: where the cuts cross the veils stack into a bloom)
    const va = burstLook()?.veil ?? 1;
    for (let li = 0; li < n; li++) {
      const L = lines[li], k = Math.min(1, Math.max(0, L.k));
      // (held back by the time rip's tear: only its hairline shows until it splits; timeRip.js)
      if (!(k > 0.02) || L.hold === true) continue;
      const dx = (L.bx - L.ax) * k, dy = (L.by - L.ay) * k, dz = (L.bz - L.az) * k;
      const len = Math.hypot(dx, dy, dz);
      if (!(len > 0.2) || !Number.isFinite(len + L.ax + L.ay + L.az)) continue;
      const rot = this._rot(dx, dy, dz);
      const m = Math.max(2, Math.ceil(len / LINE_STEP)), seg = len / m;
      const core = L.last ? COL.last : COL.core, veil = L.last ? COL.lastVeil : COL.veil;
      const full = len / Math.max(0.05, k); // the whole line's length: the taper is the finished cut's
      for (let j = 0; j < m; j++) {
        const f = (j + 0.5) / m, at = (f * len) / full;
        // pointed at both ends; a glimmer runs out along it
        const taper = Math.sqrt(Math.max(0.04, Math.sin(Math.PI * Math.min(1, at))));
        const glim = 0.72 + 0.28 * Math.sin(t * 26 - at * 9 + li * 2.1);
        const x = L.ax + dx * f, y = L.ay + dy * f, z = L.az + dz * f;
        const size = (L.last ? 0.13 : 0.1) * taper * Math.sqrt(this.k);
        fx.spawn({ x, y, z, life, size, sizeEnd: size, stretch: (seg / size) * 1.25, glyph: '|', rot, color: core, colorEnd: core, alpha: glim, alphaEnd: glim });
        const vs = size * 2.2;
        if (va > 0) fx.spawn({ x, y, z, life, size: vs, sizeEnd: vs, stretch: (seg / vs) * 1.15, glyph: '|', rot, color: veil, colorEnd: veil, alpha: 0.16 * glim * va, alphaEnd: 0.16 * glim * va });
      }
    }
  }

  /** An art's coil: light drawn in onto him (x, y, z: his chest), faster as `u` 0..1 winds up. */
  gather(dt, x, y, z, u = 0) {
    const fx = this.add;
    if (!fx || !(dt > 0) || !Number.isFinite(x + y + z)) return;
    this.acc += dt * (50 + 90 * u);
    while (this.acc >= 1) {
      this.acc -= 1;
      const a = rnd() * Math.PI * 2, r = R(0.7, 1.4);
      const ex = Math.cos(a) * r, ey = R(-0.8, 0.9), ez = Math.sin(a) * r;
      const life = R(0.08, 0.14);
      fx.spawn({
        x: x + ex, y: y + ey, z: z + ez, vx: -ex / life, vy: -ey / life, vz: -ez / life,
        life, size: R(0.09, 0.15), sizeEnd: 0.03, stretch: 1.2, glyph: "|'·", rot: this._rot(ex, ey, ez),
        color: COL.mote, colorEnd: COL.moteEnd, alpha: 0.9, alphaEnd: 0.1,
      });
    }
  }

  /** The star on the blade as the coil is wound (x, y, z: near its point). */
  glint(x, y, z) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    // (a small four-point star: a big one blooms into a white ball beside him)
    fx.spawn({ x, y, z, life: 0.12, size: 0.5, sizeEnd: 0.1, glyph: '+', color: COL.hot, colorEnd: COL.ice, alpha: 1, alphaEnd: 0, spin: 5 });
    fx.spawn({ x, y, z, life: 0.12, size: 0.24, sizeEnd: 0.7, glyph: '°', color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.6, alphaEnd: 0 });
    this._light({ x, y, z, color: [0.6, 0.85, 1.5], intensity: 1.6, radius: 4, life: 0.16, fade: 0.12 });
  }

  /** The iai crosses the target (x, y, z), heading (dx, dz): one thin flash. The cut lands later. */
  pass(x, y, z, dx, dz) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    fx.spawn({ x, y, z, life: 0.06, size: 0.16, sizeEnd: 0.04, stretch: 40, glyph: '|', rot: this._rot(dx, 0, dz), color: COL.hot, colorEnd: COL.last, alpha: 1, alphaEnd: 0 });
    fx.spawn({ x, y, z, life: 0.1, size: 0.45, sizeEnd: 0.1, glyph: '+', rot: 0.785, color: COL.hot, colorEnd: COL.last, alpha: 1, alphaEnd: 0 });
  }

  /**
   * A crescent of light: its outer edge an arc of radius r round (cx, cy, cz) from angle a0 to a1 in
   * the plane of the unit axes U (ux, uy, uz) and V, `w` m thick at its middle and pointed at both
   * ends. The edge is bright (`core`), the body behind it fades inward (`end`).
   */
  _crescent(fx, cx, cy, cz, ux, uy, uz, vx, vy, vz, r, a0, a1, w, life, core, end, stroke = 0.1) {
    const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * r) / 0.32));
    const dir = Math.sign(a1 - a0) || 1, arc = (Math.abs(a1 - a0) / n) * r;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, a = a0 + (a1 - a0) * f, c = Math.cos(a), sn = Math.sin(a);
      const taper = Math.sin(Math.PI * f);
      const rot = this._rot((-sn * ux + c * vx) * dir, (-sn * uy + c * vy) * dir, (-sn * uz + c * vz) * dir);
      for (let row = 0; row < 4; row++) {
        const q = row / 3; // 0 the edge … 1 the inside
        const rr = r - w * taper * q;
        const size = stroke * (row ? 1.3 : 1.5) * (0.3 + 0.7 * taper);
        fx.spawn({
          x: cx + (c * ux + sn * vx) * rr, y: cy + (c * uy + sn * vy) * rr, z: cz + (c * uz + sn * vz) * rr,
          life: life * (1 - 0.35 * q) * R(0.9, 1.1), size, sizeEnd: size * 0.2, stretch: (arc / size) * 1.35, glyph: '|', rot,
          color: row ? end : core, colorEnd: end, alpha: (row ? 0.3 * (1 - 0.6 * q) : 1) * (0.35 + 0.65 * taper) * this._cr, alphaEnd: 0,
        });
      }
    }
  }

  /**
   * The last blow lands at (x, y, z), its cut travelling (dx, dz). `kind`: 'iai' (the level cut
   * opens: a lens of light across the target), 'split' (a falling crescent), 'vault' (a rising one).
   */
  artHit(x, y, z, dx, dz, kind = 'iai', sw = null, swN = 0) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    // (small cores: stacked with the burst's they bloom into a white blot over the target)
    const s = this.k, L = burstLook(), st = lk(L, 'star'), ha = lk(L, 'halo'), cr = L ? L.crescent ?? 1 : 1, sh = lk(L, 'sparks'), li = lk(L, 'light');
    const r0 = R(0, 3);
    if (st[0] > 0) fx.spawn({ x, y, z, life: 0.08, size: 1.2 * s * st[1], sizeEnd: 0.3 * st[1], glyph: '*', color: COL.hot, colorEnd: COL.ice, alpha: st[0], alphaEnd: 0, rot: r0 });
    if (ha[0] > 0) fx.spawn({ x, y, z, life: 0.28, size: 1.2 * s * ha[1], sizeEnd: 4.0 * s * ha[1], glyph: '°', color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.55 * ha[0], alphaEnd: 0 });
    this._cr = cr;
    const px = -dz, pz = dx; // across the cut, in the ground plane
    // a falling / rising cut's plane is tipped 40° off upright, toward the side the camera sees more
    // of: an upright plane along the view is drawn as one fat bar up the screen
    const C = this.cam, side = C && px * C[0] + pz * C[2] < 0 ? -1 : 1;
    const ty = 0.77, tx = px * side * 0.64, tz = pz * side * 0.64;
    if (this.chain) {
      // the chain: the iai's lens is gone (two arcs beside the line, where he never ran); the split's
      // and the vault's crescent is the path his blade swept (`sw`: swN points, sampled)
      // (the instant slash, slashFx.js: the path's chord, one straight line; ?slash=arc the swept curve)
      if (kind !== 'iai' && sw && swN >= 2) {
        if (slashMode() === 'arc') this._swept(fx, sw, swN, 0.34, COL.hot, COL.last, 0.13);
        else {
          const o = (swN - 1) * 3;
          for (let c = 0; c < 3; c++) {
            CHORD[c] = sw[c];
            CHORD[3 + c] = sw[o + c];
          }
          this._swept(fx, CHORD, 2, 0.34, COL.hot, COL.last, 0.13);
        }
      }
    } else if (kind === 'split') this._crescent(fx, x, y + 0.2, z, dx, 0, dz, tx, ty, tz, 2.7 * s, 2.5, -0.75, 0.5 * s, 0.34, COL.hot, COL.last, 0.13);
    else if (kind === 'vault') this._crescent(fx, x - dx * 0.4, y - 0.3, z - dz * 0.4, dx, 0, dz, tx, ty, tz, 2.3 * s, -0.9, 2.2, 0.45 * s, 0.34, COL.hot, COL.last, 0.13);
    else {
      // the lens: two shallow arcs bowing apart on either side of the line
      for (const sg of [-1, 1]) this._crescent(fx, x + px * sg * 5.2 * s, y, z + pz * sg * 5.2 * s, -px * sg, 0, -pz * sg, dx, 0, dz, 5.7 * s, -0.62, 0.62, 0.5 * s, 0.3, COL.hot, COL.last, 0.12);
    }
    this._cr = 1;
    // shards fanned out of it, most along the cut (the chain: letter dust instead; on the ground the
    // flurry throws it from the floor, round the wyrm's head it is thrown here)
    if (this.chain && this.pull > 0) this.dust(x, y, z, dx, dz, 0.5);
    for (let i = 0; i < (this.chain ? 0 : 18); i++) {
      const a = Math.atan2(dz, dx) + R(-1.3, 1.3) + (i % 3 === 0 ? Math.PI : 0), sp = R(4, 10), up = R(0.1, 1.1);
      const vx = Math.cos(a) * sp * Math.cos(up), vy = Math.sin(up) * sp, vz = Math.sin(a) * sp * Math.cos(up);
      const life = R(0.35, 0.6), size = R(0.18, 0.36), spin = R(-2, 2);
      if (sh[0] > 0) {
        fx.spawn({
          x, y, z, vx, vy, vz, life, size: size * sh[1], sizeEnd: 0.05, stretch: 0.6,
          glyph: 'A^V', rot: this._rot(vx, vy, vz), spin, color: COL.shard, colorEnd: COL.shardEnd, alpha: sh[0], alphaEnd: 0, gravity: -11, drag: 1.2,
        });
      }
    }
    const q = this._pulled(x, y, z);
    if (!L || L.pfx !== false) {
      this.pfx?.sparks?.(q[0], q[1], q[2], dx, dz, true, true);
      this.pfx?.shockwave?.(q[0], q[1], q[2], true, true);
    }
    // (kept small, as the plunge's: a big light here turns the target's whole ASCII art white)
    // (and never near the floor: a light 1 m over the paving blows it out into a white disc)
    if (li[0] > 0) {
      this._light({ x, y: Math.max(2.2, y + 0.8), z, color: [0.7, 0.95, 1.5], intensity: 2.4 * li[0], radius: 6.5 * li[1], life: 0.26, fade: 0.22 });
      this._light({ x, y: Math.max(2.2, y + 0.4), z, color: [1.0, 0.55, 1.5], intensity: 1.4 * li[0], radius: 5 * li[1], life: 0.5, fade: 0.42 });
    }
  }

  /** A crescent along a sampled path (`pts`: n points x, y, z): the edge strokes laid segment by
   *  segment along it, pointed at both ends, bright `core` fading to `end`, living `life` s. */
  _swept(fx, pts, n, life, core, end, stroke = 0.1) {
    let total = 0;
    for (let i = 1; i < n; i++) total += Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
    if (!(total > 0.2) || !Number.isFinite(total)) return;
    let run = 0;
    for (let i = 1; i < n; i++) {
      const ax = pts[i * 3 - 3], ay = pts[i * 3 - 2], az = pts[i * 3 - 1];
      const ex = pts[i * 3] - ax, ey = pts[i * 3 + 1] - ay, ez = pts[i * 3 + 2] - az, l = Math.hypot(ex, ey, ez);
      if (!(l > 1e-3)) continue;
      const rot = this._rot(ex, ey, ez), m = Math.max(1, Math.ceil(l / 0.32)), seg = l / m;
      for (let j = 0; j < m; j++) {
        const f = (j + 0.5) / m, at = (run + f * l) / total, taper = Math.sin(Math.PI * Math.min(1, at));
        const size = stroke * 1.5 * (0.3 + 0.7 * taper);
        fx.spawn({
          x: ax + ex * f, y: ay + ey * f, z: az + ez * f, life: life * R(0.9, 1.1), size, sizeEnd: size * 0.2, stretch: (seg / size) * 1.35, glyph: '|', rot,
          color: core, colorEnd: end, alpha: (0.35 + 0.65 * taper) * this._cr, alphaEnd: 0,
        });
      }
      run += l;
    }
  }

  /**
   * White-steel letter dust (DUST) thrown from (x, y, z) by a blow travelling (dx, dz): y <= 0.05 is
   * the floor (thrown from DUST.y above it). `k` x the count. Normal blending (the alpha pool), never
   * brighter than the bloom threshold, round the wyrm's head pulled toward the camera as the rest.
   */
  dust(x, y, z, dx, dz, k = 1) {
    const fa = this.game.fx?.alpha ?? null, D = DUST, st = this.dustStat;
    st.n = 0;
    st.maxSize = 0;
    st.maxCol = 0;
    if (!fa || !Number.isFinite(x + y + z + dx + dz)) return;
    this.cam = this.game.camera?.matrixWorld?.elements ?? null;
    const floor = !(y > 0.05), base = Math.atan2(dz, dx);
    const n = Math.round(D.n * k), nh = Math.round(D.heavy * k);
    for (let i = 0; i < n + nh; i++) {
      const heavy = i >= n, q = rnd();
      // most along the blow, the rest to its sides, a few back
      let a;
      if (heavy) a = base + R(-1.6, 1.6);
      else if (q < D.ahead) a = base + R(-D.cone, D.cone);
      else if (q < 0.93) a = base + (rnd() < 0.5 ? -1 : 1) * (Math.PI / 2 + R(-D.side, D.side));
      else a = base + Math.PI + R(-0.6, 0.6);
      const sp = heavy ? R(D.heavySpeed[0], D.heavySpeed[1]) : R(D.speed[0], D.speed[1]);
      const vy = heavy ? R(D.heavyUp[0], D.heavyUp[1]) : R(D.up[0], D.up[1]);
      const size = R(D.size[0], D.size[1]);
      const c = rnd() < D.blue ? D.colBlue : D.col;
      let px = x + Math.cos(a) * R(0.05, 0.3), py = floor ? R(D.y[0], D.y[1]) : y + R(-0.3, 0.3), pz = z + Math.sin(a) * R(0.05, 0.3);
      if (this.pull > 0) {
        const q3 = this._pulled(px, py, pz);
        px = q3[0];
        py = q3[1];
        pz = q3[2];
      }
      fa.spawn({
        x: px, y: py, z: pz, vx: Math.cos(a) * sp, vy, vz: Math.sin(a) * sp,
        life: heavy ? R(D.heavyLife[0], D.heavyLife[1]) : R(D.life[0], D.life[1]), size, sizeEnd: size * (heavy ? 0.8 : R(0.6, 1)),
        glyph: heavy ? D.heavyGlyphs : D.glyphs, color: c, colorEnd: D.colEnd, alpha: D.alpha, alphaEnd: 0,
        drag: heavy ? 1.2 : R(D.drag[0], D.drag[1]), gravity: heavy ? D.heavyGravity : D.gravity,
      });
      st.n++;
      if (size > st.maxSize) st.maxSize = size;
      st.maxCol = Math.max(st.maxCol, c[0], c[1], c[2]);
    }
  }

  /**
   * The hanging cuts open, all at once, on the last blow at (x, y, z): each line flares wide for a
   * few frames and throws sparks off both its sides; the more cuts, the hotter the burst.
   */
  burst(lines, n, x, y, z) {
    // (the tiers: the echoes split away from their cuts, rings open where they cross: steel())
    if ((this.echo > 0 || this.rings > 0) && Number.isFinite(x + y + z)) {
      this._bn = Math.min(n, this._bl.length);
      for (let i = 0; i < this._bn; i++) Object.assign(this._bl[i], lines[i]);
      this._bAge = 0;
      this._bAt.x = x;
      this._bAt.y = y;
      this._bAt.z = z;
      this._bEcho = this.echo;
      this._bRings = this.rings;
      this._bPull = this.pull;
      this._bK = this.k;
    }
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const heat = Math.min(1, n / 5);
    const BL = burstLook(), fl = lk(BL, 'flare'), sp = lk(BL, 'sparks'), sr = lk(BL, 'star'), lg = lk(BL, 'light'), TH = BL?.thin;
    const bs = this.burstStat;
    bs.light = bs.thin = bs.flare = bs.star = 0;
    for (let li = 0; li < n; li++) {
      const L = lines[li];
      const dx = L.bx - L.ax, dy = L.by - L.ay, dz = L.bz - L.az, len = Math.hypot(dx, dy, dz);
      if (!(len > 0.2) || !Number.isFinite(len + L.ax + L.ay + L.az)) continue;
      const ux = dx / len, uy = dy / len, uz = dz / len;
      const rot = this._rot(dx, dy, dz);
      const m = Math.max(3, Math.ceil(len / 0.6)), seg = len / m;
      const c0 = L.last ? COL.last : li % 2 && heat > 0.5 ? COL.gold : COL.spark;
      const c1 = L.last ? COL.lastVeil : li % 2 && heat > 0.5 ? COL.goldEnd : COL.sparkEnd;
      for (let j = 0; j < m; j++) {
        const f = (j + 0.5) / m, taper = Math.sqrt(Math.max(0.05, Math.sin(Math.PI * f)));
        const px = L.ax + dx * f, py = L.ay + dy * f, pz = L.az + dz * f;
        // the line flares: fat and white, thinning fast
        const size = (L.last ? 0.3 : 0.22) * taper * this.k * fl[1], flife = R(0.13, 0.2);
        if (fl[0] > 0) {
          fx.spawn({ x: px, y: py, z: pz, life: flife, size, sizeEnd: size * 0.08, stretch: (seg / size) * 1.4, glyph: '|', rot, color: COL.hot, colorEnd: c0, alpha: fl[0], alphaEnd: 0 });
          bs.flare += fl[0] * size;
        }
        // sparks off both sides, across the line
        for (const sg of [-1, 1]) {
          if (rnd() > 0.55 + 0.3 * heat) continue;
          const v = R(3, 9) * sg * taper, al = R(-2.5, 2.5);
          const vx = -uz * v + ux * al, vy = R(0.5, 4) + uy * al, vz = ux * v + uz * al;
          const life = R(0.2, 0.42), size = R(0.1, 0.17);
          if (sp[0] > 0) {
            fx.spawn({
              x: px, y: py, z: pz, vx, vy, vz, life, size: size * sp[1], sizeEnd: 0.03, stretch: 1.5,
              glyph: "|'*", rot: this._rot(vx, vy, vz), color: c0, colorEnd: c1, alpha: sp[0], alphaEnd: 0, drag: 2.6, gravity: -7,
            });
          }
        }
      }
    }
    // where they cross: a star, brighter with every cut
    const r0 = R(0, 3);
    if (sr[0] > 0) {
      fx.spawn({ x, y, z, life: 0.12, size: (1.0 + 0.8 * heat) * this.k * sr[1], sizeEnd: 0.3 * sr[1], glyph: '*', color: COL.hot, colorEnd: COL.gold, alpha: sr[0], alphaEnd: 0, rot: r0, spin: 2 });
      bs.star = sr[0] * sr[1];
    }
    if (lg[0] > 0) {
      this._light({ x, y, z, color: [0.9, 0.9, 1.4], intensity: (1.8 + 1.4 * heat) * lg[0], radius: 6 * lg[1], life: 0.2, fade: 0.16 });
      bs.light = (1.8 + 1.4 * heat) * lg[0];
    }
    // the lines (a burst level): each hanging cut flares THIN and long, snapping out past both its
    // ends to `ext` x its length, for a few frames (no random draws: the same at every level)
    if (TH && TH.a > 0) {
      for (let li = 0; li < n; li++) {
        const L = lines[li];
        const dx = L.bx - L.ax, dy = L.by - L.ay, dz = L.bz - L.az, len = Math.hypot(dx, dy, dz);
        if (!(len > 0.2) || !Number.isFinite(len + L.ax + L.ay + L.az)) continue;
        // (the chain: no longer than the cut itself: past its ends is where he never ran)
        const ext = this.chain ? 1 : TH.ext;
        const rot = this._rot(dx, dy, dz), e = (ext - 1) * 0.5;
        const m = Math.max(4, Math.ceil((len * ext) / 0.5)), seg = (len * ext) / m;
        for (let j = 0; j < m; j++) {
          const f = -e + ((j + 0.5) / m) * ext, tp = Math.sqrt(Math.max(0.05, Math.sin(Math.PI * (j + 0.5) / m)));
          const size = TH.size * this.k * tp;
          fx.spawn({
            x: L.ax + dx * f, y: L.ay + dy * f, z: L.az + dz * f, life: TH.life * (0.7 + 0.3 * tp), size, sizeEnd: size * 0.5, stretch: (seg / size) * 1.3, glyph: '|', rot,
            color: L.last ? COL.last : COL.hot, colorEnd: L.last ? COL.lastVeil : COL.ice, alpha: TH.a, alphaEnd: 0,
          });
          bs.thin++;
        }
      }
    }
  }

  // ------------------------------------------------------------------ the tiers: steel on the grid
  /**
   * Every frame (flurry.js draw; fx time): the echo lines beside the hanging cuts (`lines[0..n)`,
   * null when none hang) and the last blow's split. Written in the fire field's steel, one blob to a
   * letter cell, snapped, one copy alive a frame. Does nothing at tier 3 and below (or tiers off).
   * Never throws.
   */
  steel(game, lines, n) {
    try {
      const d = fin(game?.fxDt) ? game.fxDt : fin(game?.dt) ? game.dt : 0;
      if (!(d > 0)) return;
      this._now += d;
      const B = TIER_LOOK.burst;
      if (this._bAge >= 0) {
        this._bAge += d;
        if (this._bAge >= B.off.length * B.hold) this._bAge = -1;
      }
      const hanging = lines && n > 0 && this.echo > 0;
      if (!hanging && this._bAge < 0) return;
      const F = game.fx?.fire;
      if (!F?.spawn) return;
      // the one-copy frame clock (impactStamp.js): what was written lives past the next frame's step
      if (this._now + d < this._dl) return;
      const life = Math.max(0.021, d * 1.6);
      this._dl = this._now + life;
      this._nc = 0;
      const A = axes(game);
      if (hanging) {
        const pull = this.pull > 0 ? this.pull : TIER_LOOK.pull;
        for (let li = 0; li < n; li++) {
          const L = lines[li];
          for (let e = 1; e <= this.echo; e++) this._echo(game, A, L, e, TIER_LOOK.gap * Math.ceil(e / 2) * (e % 2 ? 1 : -1), TIER_LOOK.heat, TIER_LOOK.end, pull, L.k);
        }
      }
      if (this._bAge >= 0) {
        const f = Math.min(B.off.length - 1, Math.floor(this._bAge / B.hold));
        const pull = this._bPull > 0 ? this._bPull : TIER_LOOK.pull;
        for (let li = 0; li < this._bn; li++) {
          const L = this._bl[li];
          for (let e = 1; e <= this._bEcho; e++) {
            const off = (B.off[f] + (Math.ceil(e / 2) - 1) * TIER_LOOK.gap) * (e % 2 ? 1 : -1);
            this._echo(game, A, L, e, off, B.heat[f], B.heat[f] * 0.5, pull, 1, B.hole[f]);
          }
        }
        // rings where the cuts crossed, one an echo, opening one inside the other
        if (B.ring[f] > 0) {
          const ra = this._bK * (this._bPull > 0 ? 1.6 : 1);
          for (let r = 0; r < this._bRings; r++) this._ring(game, A, this._bAt, (B.ring[f] + 0.35 * r) * ra, Math.min(1.1, B.heat[f] * 1.25) * (1 - 0.15 * r), B.keep[f], pull);
          this.steelStat.rings = Math.max(this.steelStat.rings, this._bRings);
        }
      }
      this._flush(game, F, A, life);
    } catch {
      /* never freeze the frame */
    }
  }

  /** One echo of hanging cut L (drawn `k` of its length), `off` cells across it on the screen,
   *  heat `h` at its middle and `h1` at its ends, the whole pulled `pull` m toward the camera. */
  _echo(game, A, L, e, off, h, h1, pull, k, hole = 0) {
    k = Math.min(1, Math.max(0, k));
    if (!(k > 0.05)) return;
    const t0 = TIER_LOOK.trim * e, t1 = Math.max(t0 + 0.1, k - TIER_LOOK.trim * e);
    if (!(t1 > t0)) return;
    const ex = L.bx - L.ax, ey = L.by - L.ay, ez = L.bz - L.az;
    const a = this._pullTo(game, L.ax + ex * t0, L.ay + ey * t0, L.az + ez * t0, pull);
    const ax = a[0], ay = a[1], az = a[2];
    const b = this._pullTo(game, L.ax + ex * t1, L.ay + ey * t1, L.az + ez * t1, pull);
    const bx = b[0], by = b[1], bz = b[2];
    const Pa = screen(game, ax, ay, az);
    if (!Pa.ok) return;
    const pax = Pa.px, pay = Pa.py, cw = Pa.cw, ch = Pa.ch;
    const Pb = screen(game, bx, by, bz);
    if (!Pb.ok) return;
    const dx = Pb.px - pax, dy = Pb.py - pay, l = Math.hypot(dx, dy);
    if (!(l > cw)) return;
    // laid on the grid as ONE clean stroke: the line's direction snapped to the nearest of the
    // grid's four (across, up, the cell's two diagonals), one cell a step, so the field prints it as
    // a single run of '-', '|', '/' or '' (a line between them would print as a staircase of '-'
    // runs: a dashed ruler, not an echo). `off` cells across it (the echo never touches its cut)
    let ang = Math.atan2(dy, dx);
    if (ang < 0) ang += Math.PI;
    if (ang >= Math.PI) ang -= Math.PI;
    const dg = Math.atan2(ch, cw);
    const cand = [0, dg, Math.PI / 2, Math.PI - dg, Math.PI];
    let best = 0;
    for (let c = 1; c < cand.length; c++) if (Math.abs(ang - cand[c]) < Math.abs(ang - cand[best])) best = c;
    const dir = best % 4; // 0 across, 1 diagonal up-right, 2 up, 3 diagonal up-left
    const di = dir === 0 || dir === 1 ? 1 : dir === 3 ? -1 : 0, dj = dir === 0 ? 0 : 1;
    const oi = dir === 0 ? 0 : Math.round(off), oj = dir === 0 ? Math.round(off) : 0;
    const stepPx = Math.hypot(di * cw, dj * ch), n = Math.max(1, Math.round(l / stepPx));
    // the middle of the echo, on its cell
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
    const M = screen(game, mx, my, mz);
    if (!M.ok) return;
    const ci = Math.floor(M.px / cw), cj = Math.floor(M.py / ch), mpp = M.mpp, px0 = M.px, py0 = M.py;
    for (let s = 0; s <= n; s++) {
      const f = s / n;
      if (hole > 0 && Math.abs(f - 0.5) < hole * 0.5) continue; // (the split: its middle is gone, the halves fly apart)
      const q = s - n / 2, i = ci + Math.round(di * q) + oi, j = cj + Math.round(dj * q) + oj;
      const ox = ((i + 0.5) * cw - px0) * mpp, oy = ((j + 0.5) * ch - py0) * mpp;
      const taper = Math.sqrt(Math.max(0, Math.sin(Math.PI * f)));
      this._put(i, j, h1 + (h - h1) * taper, mx + A.rx * ox + A.ux * oy, my + A.ry * ox + A.uy * oy, mz + A.rz * ox + A.uz * oy, null);
    }
  }

  /** A ring of radius r m round `at` (laid on the grid as a flat hexagon, as impactStamp.js does),
   *  heat h, `keep` of its cells. */
  _ring(game, A, at, r, h, keep, pull) {
    const q = this._pullTo(game, at.x, at.y, at.z, pull);
    const cx = q[0], cy = q[1], cz = q[2];
    const P = screen(game, cx, cy, cz);
    if (!P.ok) return;
    const cw = P.cw, ch = P.ch, mpp = P.mpp, ci = Math.floor(P.px / cw), cj = Math.floor(P.py / ch);
    const px0 = P.px, py0 = P.py;
    const rp = r / mpp;
    const Rr = Math.max(2, Math.round(rp / cw)), V = Math.max(1, Math.min(Rr - 1, Math.round(rp / ch))), X = Rr - V;
    let kept = 0;
    for (let e = 0; e < 6; e++) {
      const e1 = (e + 1) % 6;
      const i0 = e === 0 ? Rr : e === 1 ? X : e === 2 ? -X : e === 3 ? -Rr : e === 4 ? -X : X;
      const j0 = e === 0 || e === 3 ? 0 : e < 3 ? V : -V;
      const i1 = e1 === 0 ? Rr : e1 === 1 ? X : e1 === 2 ? -X : e1 === 3 ? -Rr : e1 === 4 ? -X : X;
      const j1 = e1 === 0 || e1 === 3 ? 0 : e1 < 3 ? V : -V;
      const m = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0));
      for (let s = 0; s < m; s++) {
        kept += keep;
        if (kept < 1) continue;
        kept -= 1;
        const t = s / m, di = Math.round(i0 + (i1 - i0) * t), dj = Math.round(j0 + (j1 - j0) * t);
        // (the cell's world point: the centre moved along the screen's axes, at the centre's depth)
        const ox = ((ci + di + 0.5) * cw - px0) * mpp, oy = ((cj + dj + 0.5) * ch - py0) * mpp;
        this._put(ci + di, cj + dj, h, cx + A.rx * ox + A.ux * oy, cy + A.ry * ox + A.uy * oy, cz + A.rz * ox + A.uz * oy, null);
      }
    }
  }

  /** (x, y, z) pulled `k` m toward the camera along its line of sight → this._q (as `_pulled`). */
  _pullTo(game, x, y, z, k) {
    const c = game.camera?.position, q = this._q;
    q[0] = x;
    q[1] = y;
    q[2] = z;
    if (c && k > 0) {
      const dx = c.x - x, dy = c.y - y, dz = c.z - z, l = Math.hypot(dx, dy, dz);
      if (l > k * 1.5 && fin(l)) {
        q[0] += (dx / l) * k;
        q[1] += (dy / l) * k;
        q[2] += (dz / l) * k;
      }
    }
    return q;
  }

  /** A cell (i, j) of the frame at heat h, for the world point (x, y, z) (P: its screen, or null when
   *  it is already on the cell's centre). The hottest wins a cell. */
  _put(i, j, h, x, y, z, P) {
    if (!(h > 0.05) || !fin(x + y + z)) return;
    let wx = x, wy = y, wz = z;
    if (P) {
      // onto the centre of its cell
      const A = axes(this.game), ox = ((i + 0.5) * P.cw - P.px) * P.mpp, oy = ((j + 0.5) * P.ch - P.py) * P.mpp;
      wx += A.rx * ox + A.ux * oy;
      wy += A.ry * ox + A.uy * oy;
      wz += A.rz * ox + A.uz * oy;
    }
    const n = this._nc;
    for (let k = n - 1; k >= 0 && k >= n - 400; k--) {
      if (CI[k] === i && CJ[k] === j) {
        if (h > CH[k]) CH[k] = h;
        return;
      }
    }
    if (n >= MAXC) return;
    CI[n] = i;
    CJ[n] = j;
    CH[n] = h;
    CX[n * 3] = wx;
    CX[n * 3 + 1] = wy;
    CX[n * 3 + 2] = wz;
    this._nc = n + 1;
  }

  /** Write this frame's cells into the fire field, each a blob one cell across, living `life` s. */
  _flush(game, F, A, life) {
    const st = this.steelStat;
    let w = 0;
    for (let k = 0; k < this._nc; k++) {
      const x = CX[k * 3], y = CX[k * 3 + 1], z = CX[k * 3 + 2];
      if (!(y >= TIER_LOOK.minY)) continue;
      const P = screen(game, x, y, z);
      BLOB.x = x;
      BLOB.y = y;
      BLOB.z = z;
      BLOB.life = life;
      BLOB.size = BLOB.sizeEnd = TIER_LOOK.px * (P.cw / 5) * P.mpp;
      BLOB.heat = BLOB.heatEnd = CH[k];
      if (F.spawn(BLOB) >= 0) w++;
    }
    st.last = w;
    st.total += w;
    if (w > st.peak) st.peak = w;
    if (w > 0) st.frames++;
  }
}
