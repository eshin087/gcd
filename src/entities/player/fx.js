import * as THREE from 'three';
import { DIM } from './model.js';
import { CLASH, clashBurst, axes } from '../../combat/clashFx.js';
import { cutBurst } from '../../combat/cutFx.js';
import { impactK } from '../../combat/impact.js';
import { stampHit } from '../../combat/impactStamp.js';
import { calmLook, calmA, calmS } from '../../combat/impactCalm.js';
import { perfectMode } from '../../combat/streak.js';
import { perfectFeel, perfectBeat, perfectParryMark, perfectDodgeLine, perfectArrive, perfectGhost } from '../../combat/perfectFx.js';

// Glyph-particle effects owned by the Wanderer: cyan slash arcs (the light swings, the slam, the
// cleave and its impact), the thrust's long streak, the slam's crystal-shard burst, the violet gem's glow + glints, impact
// sparks, dust, heal glow, burn flames, hurt spray, and the defence set — parry burst, block
// sparks, guard-break shards, Ghostep afterimage + streak, charge gather / ready glint, crit-window
// motes. Every glyph used here is in the world atlas.

// cosmetic noise from this module's own stream: the seeded sims replay the AI's Math.random, and an
// arc stroke or a mote must never move it
let fseed = 0x51ed270b;
const rnd = () => (fseed = (Math.imul(fseed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);

const COL = {
  trail: [0.4, 1.25, 2.3], trailEnd: [0.02, 0.14, 0.45], // icy cyan arcs
  trailHeavy: [0.55, 1.6, 2.9], trailCore: [1.1, 2.1, 3.1],
  arcCore: [1.5, 2.1, 2.8], arcGlint: [3.0, 3.5, 4.3], // the sword arc's edge line (white-hot) and its glint
  arcVeil: [0.3, 0.95, 2.2], arcEnd: [0.14, 0.1, 0.8], // its veil, and the indigo everything cools to as it fades
  shard: [0.9, 1.9, 4.2], shardEnd: [0.1, 0.25, 1.0], // blue crystal burst
  gem: [1.7, 0.5, 3.4], gemEnd: [0.45, 0.08, 0.9], gemCore: [3.4, 2.2, 4.6], // violet
  spark: [3.4, 2.7, 1.6], sparkEnd: [1.4, 0.45, 0.1],
  crit: [2.2, 2.8, 4.2], critEnd: [0.3, 0.55, 1.4],
  flash: [4.2, 3.6, 2.6],
  dust: [0.2, 0.18, 0.14], dustEnd: [0.09, 0.08, 0.065],
  grassBit: [0.16, 0.26, 0.12], grassBitEnd: [0.05, 0.09, 0.04], // torn grass kicked up by a slide
  heal: [1.3, 1.9, 0.55], healEnd: [0.25, 0.6, 0.12],
  flame: [3.0, 1.35, 0.32], flameEnd: [0.9, 0.12, 0.02],
  ash: [0.34, 0.035, 0.028], ashEnd: [0.1, 0.012, 0.01],
  hurt: [2.2, 1.8, 1.6], hurtEnd: [0.6, 0.15, 0.08],
  parry: [4.0, 3.4, 2.2], parryEnd: [1.6, 0.9, 0.25],
  parryBlue: [1.6, 2.6, 4.6], parryBlueEnd: [0.25, 0.6, 1.8],
  moon: [2.6, 3.4, 4.8], moonEnd: [0.3, 0.7, 1.9], // the moonlit blade's steel light (deflect slash)
  block: [2.3, 2.0, 1.5], blockEnd: [0.7, 0.35, 0.1],
  break: [1.5, 1.5, 1.6], breakEnd: [0.3, 0.3, 0.38],
  ghost: [1.3, 1.75, 2.6], ghostEnd: [0.12, 0.25, 0.75], ghostDim: [0.42, 0.68, 1.3],
  ghostCore: [2.6, 3.0, 3.8],
  charge: [0.7, 1.7, 3.0], chargeEnd: [0.2, 0.5, 1.6],
  halo: [0.2, 0.6, 1.0], haloEnd: [0.02, 0.1, 0.25], // the blade's dot halo
  tipStreak: [0.4, 1.1, 1.9], // the edge-wave past the point
  gemGlow: [0.6, 0.15, 1.4], // the gem's always-on glow point
};

// The sword arc's look (ADR-077): a thin crescent, pointed at both ends. The arc is drawn off the
// STEEL: `at` is where its edge line runs along the hit segment (0 = the hilt … 1 = the end of the
// gameplay reach, 1.9 m out; the drawn steel's point is at 0.44). It ran at 1: a crescent twice the
// sword's length, whose end dipped under the grass on a low cut and whose glint flashed on the
// ground a metre past the point.
//   edge   the edge line's stroke size (m; the stroke is a sliver of it wide)
//   life   s the edge hangs in the air
//   veil   rows close inside the edge: [fraction of `at`, opacity]
//   motes  specks of light shed off the point per frame (at most)
// (Session 26: three looks were built behind a Lab button for the owner to choose from, a bare line,
// this crescent and afterimages of the blade; the owner picked the crescent and the others went.)
export const ARC_LOOK = { at: 0.64, edge: 0.11, life: [0.2, 0.27], veil: [[0.94, 0.3], [0.88, 0.2], [0.82, 0.12], [0.76, 0.06]], motes: 1 };
const ARC_HEAVY = 1.22; // the slam's and the cleave's arc reaches this much further out
/** The arc's colours (trail): the lights cool from white-hot to indigo; the heavy blows (the slam, the
 *  cleave, the thrusts, the plunge's dive) to the gem's violet, so a heavy reads apart from a light
 *  at a glance (the gem already burns brighter through them); a crit stays the crit's cold blue. */
export const ARC_TONE = {
  light: { core: COL.arcCore, veil: COL.arcVeil, end: COL.arcEnd },
  heavy: { core: [1.9, 2.45, 3.1], veil: [0.42, 0.8, 2.3], end: [0.3, 0.07, 0.85] },
  crit: { core: COL.crit, veil: COL.crit, end: COL.critEnd },
};

/**
 * The edge glint (edgeGlint): a small cold '+' running up the LEADING edge of the steel from the
 * forte toward the point as a cut comes in, its trail a few '|' strokes behind it; it starts `lead`
 * s before the active frames and reaches the point at `at` of them (`atCleave` for the cleave), its
 * height along the blade z[0] → z[1] (sword space, m) easing in (u^ease). Re-spawned on the steel
 * every frame (no velocity): it rides the blade and is held through a freeze.
 *   step / maxSub  m of the glint's travel per sub-step / at most this many a frame
 *   hw      the drawn blade's half width along it: [[z, half width], ...] (piecewise linear)
 *   inset   the glint sits at this share of the half width (on the edge's bevel, not past it)
 *   ridge   the blade's travel must be at least this much across its flat (normalised) for an edge
 *           to lead; under it (a thrust along the blade) the glint runs up the ridge
 *   flash   edgeFlash: the contact's mark ON the steel, n '|' strokes laid along the leading edge
 *           from the contact up toward the point, `step` m apart (× heavy for a heavy blow or a crit).
 *           It has no velocity: it lives the frames the freeze holds (the player passes them as
 *           `hold`; at most `life`, at least `lifeMin` s of fx time), fading to `holdEnd` × alpha,
 *           then is gone as the blade swings on (a longer life left a bar where the blade was)
 */
export const EDGE_GLINT = {
  lead: 0.03, at: 0.6, atCleave: 0.82, z: [0.24, 0.9], ease: 2, step: 0.08, maxSub: 4,
  hw: [[0.2, 0.042], [0.79, 0.034], [0.93, 0]], inset: 0.9, ridge: 0.35,
  head: { glyph: '+', rot: 0.785, size: 0.07, sizeFar: 0.1 }, tail: { glyph: '|', size: 0.1, len: 0.16 },
  color: [2.6, 3.2, 4.2], colorEnd: [0.4, 1.1, 2.2], alpha: 0.9, tailAlpha: 0.55, life: [0.03, 0.08],
  flash: { n: 4, step: 0.05, size: 0.12, stretch: 1.6, life: 0.1, lifeMin: 0.03, holdEnd: 0.35, alpha: 0.9, heavy: 1.25 },
};
/** The drawn blade's half width at sword-space height z (EDGE_GLINT.hw). */
export function hwAt(z) {
  const T = EDGE_GLINT.hw;
  if (!(z > T[0][0])) return T[0][1];
  for (let i = 1; i < T.length; i++) {
    if (z <= T[i][0]) {
      const [z0, w0] = T[i - 1], [z1, w1] = T[i];
      return w0 + ((w1 - w0) * (z - z0)) / (z1 - z0);
    }
  }
  return T[T.length - 1][1];
}
/** Which edge leads this frame (+1 the sword's +X edge, −1 the −X one, 0 neither: the blade moves
 *  along itself): the blade's mid travel (sweep: last frame → this one) against its X axis (`e`: the
 *  sword joint's matrixWorld elements). */
export function leadSide(sw, e) {
  const tx = (sw.a.x + sw.b.x - sw.pa.x - sw.pb.x) * 0.5, ty = (sw.a.y + sw.b.y - sw.pa.y - sw.pb.y) * 0.5, tz = (sw.a.z + sw.b.z - sw.pa.z - sw.pb.z) * 0.5;
  const tl = Math.hypot(tx, ty, tz), xl = Math.hypot(e[0], e[1], e[2]);
  if (!(tl > 1e-6) || !(xl > 1e-9)) return 0;
  const c = (tx * e[0] + ty * e[1] + tz * e[2]) / (tl * xl);
  return !Number.isFinite(c) || Math.abs(c) < EDGE_GLINT.ridge ? 0 : Math.sign(c);
}
const ARC_TURN = [0.03, 0.2]; // rad the blade turns in a frame: below, no arc; above, the full one
const TRAIL_SUB_LEN = 0.11; // m of the edge's travel per trail sub-step (short: the line bends smoothly) …
const TRAIL_SUB_MAX = 14; // … up to this many sub-steps a frame
// the swept blade between two frames: hilt lerped, direction slerped round it, length lerped
const ARC = { ax: 0, ay: 0, az: 0, dx: 0, dy: 0, dz: 0, n0: [0, 0, 1], n1: [0, 0, 1], l0: 1, l1: 1, th: 0, s: 1 };
const ARC_P = [0, 0, 0], ARC_Q = [0, 0, 0];
function arcSetup(pa, pb, a, b) {
  ARC.ax = pa.x; ARC.ay = pa.y; ARC.az = pa.z;
  ARC.dx = a.x - pa.x; ARC.dy = a.y - pa.y; ARC.dz = a.z - pa.z;
  const ux = pb.x - pa.x, uy = pb.y - pa.y, uz = pb.z - pa.z, vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
  ARC.l0 = Math.hypot(ux, uy, uz) || 1e-6;
  ARC.l1 = Math.hypot(vx, vy, vz) || 1e-6;
  const n0 = ARC.n0, n1 = ARC.n1;
  n0[0] = ux / ARC.l0; n0[1] = uy / ARC.l0; n0[2] = uz / ARC.l0;
  n1[0] = vx / ARC.l1; n1[1] = vy / ARC.l1; n1[2] = vz / ARC.l1;
  const c = Math.max(-1, Math.min(1, n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]));
  ARC.th = Math.acos(c);
  ARC.s = Math.sin(ARC.th);
}
/** Point f (0 hilt … 1 tip) of the swept blade at sub-step t (0 last frame … 1 now) → o. */
function arcPoint(t, f, o) {
  let w0 = 1 - t, w1 = t;
  if (ARC.th > 0.02 && ARC.th < 2.8) {
    w0 = Math.sin((1 - t) * ARC.th) / ARC.s;
    w1 = Math.sin(t * ARC.th) / ARC.s;
  }
  const n0 = ARC.n0, n1 = ARC.n1;
  let x = n0[0] * w0 + n1[0] * w1, y = n0[1] * w0 + n1[1] * w1, z = n0[2] * w0 + n1[2] * w1;
  const l = Math.hypot(x, y, z) || 1;
  const len = (ARC.l0 + (ARC.l1 - ARC.l0) * t) * f / l;
  o[0] = ARC.ax + ARC.dx * t + x * len;
  o[1] = ARC.ay + ARC.dy * t + y * len;
  o[2] = ARC.az + ARC.dz * t + z * len;
}
const TRAIL_NONE = [];
const ECHO_COL = [0.5, 0.8, 1.25]; // the echo lines' steel (under the bloom: fine lines, no glow)
const ECHO_STEP = 0.075; // the streak's echo lines (trail): this share of the reach apart, inward from the edge
// calm at the contact: the arc's factors at one stroke (PlayerFx._arcCalm; reused)
const CALM_ARC = { a: 1, s: 1, k: 0 };
// the halftone dot fields sit on a world lattice so their dots line up like the panel's grid
const LATTICE = 0.12;
// screen axes of the fixed camera (pitch 58°): right = +X, up ≈ (0, cos 58°, −sin 58°)
const UP_Y = 0.53, UP_Z = -0.85;
// the rendering camera's matrixWorld elements (columns: right, up): glyph particles are screen
// billboards, so a stroke laid along a world direction needs the real camera's axes. The game
// camera is the fixed 58° one, but the Lab's model views look from any angle (there the fixed
// basis turned the tip streak and the sweep strokes into stray bars across the blade).
let CAM = null;
/** Screen-space rotation that lays a '|' glyph along world direction (dx, dy, dz). */
const alongRot = (dx, dy, dz) => {
  if (CAM) {
    const sx = dx * CAM[0] + dy * CAM[1] + dz * CAM[2], sy = dx * CAM[4] + dy * CAM[5] + dz * CAM[6];
    if (sx * sx + sy * sy > 1e-12 && Number.isFinite(sx + sy)) return Math.atan2(sy, sx) - Math.PI / 2;
  }
  return Math.atan2(dy * UP_Y + dz * UP_Z, dx) - Math.PI / 2;
};

/** The blade halo's dots sit this far off the blade's axis (m, sword space): beside both edges of
 *  the slimmer moon blades too (it was 0.06-0.12). */
export const HALO_X = [0.055, 0.11];
/** The streak's edge line (bladeHalo `edge`): its cold steel, whiter at the top tiers; a reused spawn. */
const STREAK_EDGE = { off: 0.07, lift: 0.6, lo: [0.55, 0.85, 1.25], hi: [0.85, 1.05, 1.35], c: [0.55, 0.85, 1.25] }; // (kept under the bloom: a line, not a glow)
STREAK_EDGE.o = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.016, size: 0.1, sizeEnd: 0.1, glyph: '|', stretch: 1, rot: 0, color: STREAK_EDGE.c, colorEnd: STREAK_EDGE.c, alpha: 1, alphaEnd: 1 };

const SPRAY = new THREE.Vector3(); // parry(): the default spray (back toward the blow and up)
// the parry shockwave's rings (shockwave): bright, but not so hot that bloom swallows the duel
const RING = { white: [1.5, 1.55, 1.75], warm: [1.6, 1.3, 0.8], gold: [2.0, 1.45, 0.45] };

// (the characters an afterimage is made of: fine digits, as the wyrm is printed)
const GHOST_DIGITS = '0123456789';
const GHOST_STAND = [0.3, 0.5, 0.95]; // the sharp / cinema afterimage standing still: dimmer than COL.ghostDim
const GHOST_CELL = 0.13; // m: an afterimage's character cell (about the cell his coat is printed in)

export class PlayerFx {
  constructor(game, rig) {
    this.body = null; // points on his body as last sampled (world xyz …; player.js _sampleBody)
    this.bodyN = 0;
    this._ghostCells = new Set(); // (reused: the cells one afterimage has printed in)
    this.game = game;
    this.rig = rig;
    this._v = new THREE.Vector3();
    this.flameAcc = 0;
    this.healAcc = 0;
    this.chargeAcc = 0;
    this.critAcc = 0;
    this.gemAcc = 0;
    this.haloAcc = 0;
    this.gemGlowAcc = 0;
    this.tipAcc = 0;
    this.skidAcc = [0, 0]; // per sliding contact (skid)
    this.scrapeAcc = 0;
    this.plAcc = 0; // the plunge's hang motes / ride embers
  }

  get add() {
    CAM = this.game.camera?.matrixWorld?.elements ?? null; // every spawner starts here (alongRot)
    return this.game.fx?.add ?? null;
  }
  get alpha() {
    return this.game.fx?.alpha ?? null;
  }

  _light(o) {
    return this.game.lights?.add?.(o) ?? null;
  }

  /** Grey-brown ground puff (roll start/end, landings). */
  dust(x, z, n = 8, power = 1, y = 0.08) {
    const fx = this.alpha;
    if (!fx) return;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const sp = R(0.6, 1.6) * power;
      fx.spawn({
        x: x + Math.cos(a) * 0.2, y: y + R(0, 0.1), z: z + Math.sin(a) * 0.2,
        vx: Math.cos(a) * sp, vy: R(0.2, 0.7) * power, vz: Math.sin(a) * sp,
        life: R(0.45, 0.85), size: R(0.18, 0.28), sizeEnd: R(0.35, 0.5),
        glyph: '.,:', color: COL.dust, colorEnd: COL.dustEnd,
        alpha: 0.75, alphaEnd: 0, drag: 3, gravity: -0.6, spin: R(-2, 2),
      });
    }
  }

  /** Where the arc's edge runs along the hit segment for a swing of `kind` (0 hilt … 1 reach end). */
  arcAt(kind = 'light') {
    return Math.min(1, ARC_LOOK.at * (kind === 'slam' || kind === 'heavy' || kind === 'cleave' ? ARC_HEAVY : 1));
  }

  /**
   * The sword arc (ADR-077; its numbers: ARC_LOOK). Fills the gap between last
   * frame's blade (pa→pb) and this one's (a→b) with:
   *  - the EDGE: one fine line of light just past the steel's point, laid along its path in strokes
   *    that overlap, white-hot as it is drawn and cooling to indigo as it thins away: the cut hangs
   *    in the air for a moment as a drawn line, its tail tapering to nothing;
   *  - the VEIL: four faint rows inside the line, close to it, the faintest at 6 %;
   *  - MOTES: a speck of light shed off the point now and then.
   * The arc is the blade TURNING: its strength follows how far the blade turned this frame (`gate`),
   * so it swells and tapers with the cut and a blade merely carried along (a dash, a lunge) leaves
   * none. kind: 'light' | 'slam' | 'cleave' (both reach further and hang longer) | 'thrust' (the
   * edge only: thrustStreak draws the beam).
   * The heavy blows cool to violet, not indigo (ARC_TONE). `bite`: the cut just landed (player.js, the
   * first 0.06 s after the contact): the edge is drawn white-hot and a little thicker.
   * (Session 25: a line at the end of the reach with a four-row veil, in place of a slab of bright
   * strokes under a rim of letters. Session 26, owner: "make the sword trail effect look way cooler
   * and more subtle": that veil was still a glowing band half the reach wide, its edge was a row of
   * dashes, and it ran a metre past the steel.)
   */
  trail(pa, pb, a, b, kind = 'light', crit = false, gate = true, bite = false) {
    const fx = this.add;
    if (!fx) return;
    const S = ARC_LOOK;
    const cleave = kind === 'cleave';
    const heavy = kind === 'slam' || kind === 'heavy' || cleave;
    const thrust = kind === 'thrust';
    arcSetup(pa, pb, a, b);
    const turn = gate ? Math.min(1, Math.max(0, (ARC.th - ARC_TURN[0]) / (ARC_TURN[1] - ARC_TURN[0]))) : 1;
    if (!(turn > 0.02) || !Number.isFinite(turn)) return;
    const at = this.arcAt(kind);
    // sub-steps follow the edge's travel (a fast frame sweeps a metre), each stroke covering its own
    // and a little of the next, so the line is unbroken at any speed
    const tipStep = Math.hypot(b.x - pb.x, b.y - pb.y, b.z - pb.z) * at;
    const nSub = Math.min(TRAIL_SUB_MAX, Math.max(2, Math.ceil(tipStep / TRAIL_SUB_LEN)));
    const T = crit ? ARC_TONE.crit : ARC_TONE[heavy || thrust ? 'heavy' : 'light'];
    const core = T.core, veil = T.veil, end = T.end;
    const linger = cleave ? 1.7 : heavy ? 1.3 : 1;
    const rows = thrust ? TRAIL_NONE : S.veil;
    // the streak's echo lines (player/streakFx.js `echoes`; 0 = none, today): fine lines inside the
    // edge, ECHO_STEP of the reach apart, fainter inward, hanging longer than the edge
    const SK = this.game.fx?.streak, nEcho = thrust ? 0 : Math.min(4, SK?.echoes | 0), echoA = nEcho > 0 ? Math.min(1, Number(SK.echoA) || 0) : 0;
    for (let s = 1; s <= nSub; s++) {
      const t = s / nSub, t0 = (s - 1) / nSub;
      // the edge
      arcPoint(t, at, ARC_P);
      arcPoint(t0, at, ARC_Q);
      let dx = ARC_P[0] - ARC_Q[0], dy = ARC_P[1] - ARC_Q[1], dz = ARC_P[2] - ARC_Q[2];
      let step = Math.hypot(dx, dy, dz);
      if (step > 0.01) {
        const mx = (ARC_P[0] + ARC_Q[0]) / 2, my = (ARC_P[1] + ARC_Q[1]) / 2, mz = (ARC_P[2] + ARC_Q[2]) / 2;
        // calm at the contact: dimmer and thinner where it crosses a fresh contact (1 elsewhere, today)
        const K = this._arcCalm(mx, my, mz), hot = bite && !(K.k > 0 && this._calmZ.L.arc.bite === false);
        const size = S.edge * (heavy ? 1.25 : 1) * (0.6 + 0.4 * turn) * (bite ? 1.15 : 1) * K.s;
        fx.spawn({
          x: mx, y: my, z: mz,
          life: R(S.life[0], S.life[1]) * linger, size, sizeEnd: size * 0.15,
          glyph: '|', rot: alongRot(dx, dy, dz), stretch: Math.min(30, (step / size) * 1.7),
          color: hot ? COL.arcGlint : core, colorEnd: end, alpha: (bite ? 1 : 0.45 + 0.55 * turn) * K.a, alphaEnd: 0, drag: 2,
        });
      }
      for (let j = 1; j <= nEcho && echoA > 0; j++) {
        const f = at - ECHO_STEP * j;
        if (!(f > 0.12)) break;
        arcPoint(t, f, ARC_P);
        arcPoint(t0, f, ARC_Q);
        const ex = ARC_P[0] - ARC_Q[0], ey = ARC_P[1] - ARC_Q[1], ez = ARC_P[2] - ARC_Q[2], es = Math.hypot(ex, ey, ez);
        if (!(es > 0.01)) continue;
        const size = S.edge * 0.8 * (heavy ? 1.2 : 1);
        fx.spawn({
          x: (ARC_P[0] + ARC_Q[0]) / 2, y: (ARC_P[1] + ARC_Q[1]) / 2, z: (ARC_P[2] + ARC_Q[2]) / 2,
          life: S.life[1] * linger * (1 + 0.3 * j), size, sizeEnd: size * 0.2,
          glyph: '|', rot: alongRot(ex, ey, ez), stretch: Math.min(30, (es / size) * 1.7),
          color: ECHO_COL, colorEnd: end, alpha: (echoA / (0.6 + 0.4 * j)) * (0.4 + 0.6 * turn), alphaEnd: 0, drag: 2,
        });
      }
      // the veil
      for (let k = 0; k < rows.length; k++) {
        const f = at * (rows[k][0] + R(-0.015, 0.015));
        arcPoint(t, f, ARC_P);
        arcPoint(t0, f, ARC_Q);
        dx = ARC_P[0] - ARC_Q[0];
        dy = ARC_P[1] - ARC_Q[1];
        dz = ARC_P[2] - ARC_Q[2];
        step = Math.hypot(dx, dy, dz);
        if (!(step > 0.02)) continue;
        const vx = (ARC_P[0] + ARC_Q[0]) / 2, vy = (ARC_P[1] + ARC_Q[1]) / 2, vz = (ARC_P[2] + ARC_Q[2]) / 2;
        const K = this._arcCalm(vx, vy, vz);
        const size = (heavy ? 0.12 : 0.1) * K.s;
        fx.spawn({
          x: vx, y: vy, z: vz,
          life: R(0.08, 0.13) * linger, size, sizeEnd: size * 0.4,
          glyph: '|', rot: alongRot(dx, dy, dz), stretch: Math.min(24, (step / size) * 1.5),
          color: veil, colorEnd: end, alpha: rows[k][1] * turn * K.a, alphaEnd: 0, drag: 2.5,
        });
      }
    }
    // motes off the point, carried on along the cut
    const n = thrust ? 0 : S.motes + (heavy ? 1 : 0);
    const tx = b.x - pb.x, ty = b.y - pb.y, tz = b.z - pb.z, tl = Math.hypot(tx, ty, tz) || 1;
    for (let i = 0; i < n; i++) {
      if (rnd() > turn * 0.7) continue;
      arcPoint(rnd(), at * R(0.9, 1), ARC_P);
      const sp = R(0.5, 2);
      fx.spawn({
        x: ARC_P[0], y: ARC_P[1], z: ARC_P[2],
        vx: (tx / tl) * sp + R(-0.3, 0.3), vy: (ty / tl) * sp + R(-0.1, 0.5), vz: (tz / tl) * sp + R(-0.3, 0.3),
        life: R(0.26, 0.46) * Math.sqrt(linger), size: R(0.06, 0.1), sizeEnd: 0.03,
        glyph: "·'`.", color: core, colorEnd: end, alpha: 0.85, alphaEnd: 0, drag: 3, gravity: -1.2,
      });
    }
  }

  /** The glint as a cut comes through: a small four-point star on the arc's edge for a few frames
   *  and a pinch of sparks thrown on along the cut (dx, dy, dz: the point's travel). Once a swing
   *  (player.js, at the arc's edge: arcAt). */
  arcGlint(x, y, z, dx = 0, dy = 0, dz = 0, heavy = false, crit = false) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const core = crit ? COL.ghostCore : COL.arcGlint, c1 = crit ? COL.critEnd : COL.arcEnd;
    const size = heavy ? 0.4 : 0.26;
    fx.spawn({ x, y, z, life: 0.09, size, sizeEnd: size * 0.2, glyph: '+', rot: R(0.5, 1.1), color: core, colorEnd: c1, alpha: 0.95, alphaEnd: 0 });
    const l = Math.hypot(dx, dy, dz) || 1, n = heavy ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const sp = R(2.5, 6);
      fx.spawn({
        x, y, z,
        vx: (dx / l) * sp + R(-1.2, 1.2), vy: (dy / l) * sp + R(-0.6, 1.4), vz: (dz / l) * sp + R(-1.2, 1.2),
        life: R(0.14, 0.26), size: R(0.07, 0.11), sizeEnd: 0.03, glyph: "·'", color: core, colorEnd: c1,
        alpha: 0.95, alphaEnd: 0, drag: 4, gravity: -2,
      });
    }
  }

  /**
   * The edge glint as a cut comes in (EDGE_GLINT; player.js _combat, from just before the active
   * frames until it lands or reaches the point): this frame it runs from z0 to z1 (sword-space height
   * along the blade) up the LEADING edge (leadSide; the ridge for a thrust), a '+' head at z1 and '|'
   * strokes behind it. Spawned on the steel this frame, no velocity: it rides the blade and holds in
   * a freeze. `far` 0..1 grows the head at the game camera; `realDt` sets its life (it lasts about a
   * frame and a half); `ridge`: up the ridge whatever leads (a thrust's point-first drive: its coil's
   * last flick into line led with an edge). No Math.random.
   */
  edgeGlint(sw, z0, z1, far = 1, crit = false, realDt = 1 / 60, ridge = false) {
    const fx = this.add, s = this.rig?.sword;
    if (!fx || !s || !sw?.valid || !Number.isFinite(z0 + z1)) return;
    const G = EDGE_GLINT, e = s.matrixWorld.elements, side = ridge ? 0 : leadSide(sw, e);
    const n = Math.max(1, Math.min(G.maxSub, Math.ceil(Math.abs(z1 - z0) / G.step)));
    const life = Math.min(G.life[1], Math.max(G.life[0], 1.6 * (Number.isFinite(realDt) ? realDt : 1 / 60)));
    const zl = Math.hypot(e[8], e[9], e[10]) || 1, rot = alongRot(e[8] / zl, e[9] / zl, e[10] / zl);
    for (let i = 1; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n, xx = side * G.inset * hwAt(z);
      const x = e[0] * xx + e[8] * z + e[12], y = e[1] * xx + e[9] * z + e[13], wz = e[2] * xx + e[10] * z + e[14];
      if (!Number.isFinite(x + y + wz) || y < 0.02) continue;
      if (i === n) {
        const size = G.head.size + G.head.sizeFar * (Number.isFinite(far) ? far : 1);
        fx.spawn({ x, y, z: wz, life, size, sizeEnd: size * 0.6, glyph: '+', rot: G.head.rot, color: crit ? COL.ghostCore : G.color, colorEnd: G.colorEnd, alpha: G.alpha, alphaEnd: 0 });
      } else {
        fx.spawn({ x, y, z: wz, life, size: G.tail.size, sizeEnd: G.tail.size * 0.6, glyph: '|', rot, stretch: G.tail.len / G.tail.size, color: G.color, colorEnd: G.colorEnd, alpha: G.tailAlpha, alphaEnd: 0 });
      }
    }
  }

  /**
   * The contact's mark ON the steel (player.js, a landed cut): EDGE_GLINT.flash.n white '|' strokes
   * laid along the leading edge from zc (sword-space height of the contact) up toward the point (a
   * contact too near the point, or past it out in the arc, ends them at the point instead of stacking
   * them there). No star: the cut's core is the beat's one. Lives in fx time (held through the
   * freeze): `hold` (fx s, optional) = the frames the freeze holds, so it is gone as the blade swings
   * on (EDGE_GLINT.flash). `ridge`: as edgeGlint.
   */
  edgeFlash(sw, zc, heavy = false, crit = false, ridge = false, hold = NaN) {
    const fx = this.add, s = this.rig?.sword;
    if (!fx || !s || !sw?.valid || !Number.isFinite(zc)) return;
    const G = EDGE_GLINT, F = G.flash, e = s.matrixWorld.elements, side = ridge ? 0 : leadSide(sw, e);
    const zl = Math.hypot(e[8], e[9], e[10]) || 1, rot = alongRot(e[8] / zl, e[9] / zl, e[10] / zl);
    // calm at the contact (the level contact() just read; exactly 1 today)
    const CL = this._calmZ?.L ?? null, eA = calmA(CL, 'edge');
    const size = F.size * (heavy || crit ? F.heavy : 1) * calmS(CL, 'edge');
    const held = Number.isFinite(hold) && hold > 0, life = held ? Math.min(F.life, Math.max(F.lifeMin, hold)) : F.life;
    const aEnd = held ? F.alpha * F.holdEnd * eA : 0;
    const zTop = DIM.drawnTip - 0.02, z0 = Math.max(DIM.forte, Math.min(zc, zTop - (F.n - 1) * F.step));
    for (let i = 0; i < F.n; i++) {
      const z = Math.min(zTop, z0 + i * F.step), xx = side * G.inset * hwAt(z);
      const x = e[0] * xx + e[8] * z + e[12], y = e[1] * xx + e[9] * z + e[13], wz = e[2] * xx + e[10] * z + e[14];
      if (!Number.isFinite(x + y + wz)) continue;
      fx.spawn({ x, y, z: wz, life, size, sizeEnd: size * 0.5, glyph: '|', rot, stretch: F.stretch, color: COL.arcGlint, colorEnd: COL.arcEnd, alpha: F.alpha * eA, alphaEnd: aEnd });
    }
  }

  /** A thrust's (the execution's, the plunge's) long cyan beam along the point's path (from → to, world): a thin
   *  white-cyan core of '-' / '=' laid along the line with a '·' halo, lingering as one line behind
   *  the lunge; k = charge 0..1. */
  thrustStreak(from, to, k = 0, crit = false) {
    const fx = this.add;
    if (!fx) return;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-3) || !Number.isFinite(len) || len > 8) return;
    const rot = alongRot(dx, dy, dz) + Math.PI / 2; // '-' laid along the line
    const col = crit ? COL.crit : COL.trailCore;
    const n = Math.min(24, Math.max(1, Math.ceil(len / 0.1)));
    for (let i = 0; i < n; i++) {
      const f = (i + rnd()) / n;
      const size = R(0.16, 0.2) * (1 + 0.2 * k);
      const x = from.x + dx * f, y = from.y + dy * f, z = from.z + dz * f;
      fx.spawn({
        x, y, z,
        vx: (dx / len) * R(0.1, 0.5), vy: 0, vz: (dz / len) * R(0.1, 0.5),
        life: R(0.3, 0.42) * (1 + 0.3 * k), size, sizeEnd: size * 0.6, stretch: 1.6,
        glyph: '-=', rot, color: col, colorEnd: COL.trailEnd, alpha: 0.95, alphaEnd: 0, drag: 2,
      });
      if (rnd() < 0.5) {
        const L = LATTICE * 0.75;
        const side = rnd() < 0.5 ? -1 : 1;
        fx.spawn({
          x: Math.round(x / L) * L, y: Math.round((y + side * R(0.05, 0.1)) / L) * L, z: Math.round(z / L) * L,
          life: R(0.3, 0.45), size: 0.09, sizeEnd: 0.04,
          glyph: '·', color: COL.trail, colorEnd: COL.trailEnd, alpha: 0.8, alphaEnd: 0,
        });
      }
    }
  }

  /** The slam's ground impact: 10–14 kite crystal shards fanned up and out across ~160° (mostly in
   *  the plane facing the camera), a few big crystals standing for a moment, dark rock debris, a
   *  cyan ground ring ~1.2 m across, a cold flash + light. */
  slamShards(x, z, crit = false) {
    const fx = this.add;
    if (fx) {
      const c0 = crit ? COL.crit : COL.shard, c1 = crit ? COL.critEnd : COL.shardEnd;
      // the fan of kite shards
      const nS = 12;
      for (let i = 0; i < nS; i++) {
        const ph = ((i + 0.5) / nS - 0.5) * 2.8 + R(-0.1, 0.1); // −80° … +80° from vertical
        const sp = R(2.4, 4.6);
        const vx = Math.sin(ph) * sp, vy = Math.cos(ph) * sp * 1.15;
        fx.spawn({
          x: x + Math.sin(ph) * 0.15, y: R(0.05, 0.2), z: z + R(-0.15, 0.15),
          vx, vy, vz: R(-0.6, 0.6),
          life: R(0.4, 0.6), size: R(0.14, 0.34), sizeEnd: 0.06, stretch: 0.6,
          glyph: 'A^V', rot: alongRot(vx, vy, 0), spin: R(-2, 2),
          color: c0, colorEnd: c1, alpha: 1, alphaEnd: 0, gravity: -11, drag: 1.2,
        });
      }
      // crystals jutting from the ground, leaning outward
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + R(-0.25, 0.25);
        const r = R(0.3, 0.9);
        const size = R(0.38, 0.62) * (1.2 - r * 0.3);
        fx.spawn({
          x: x + Math.cos(a) * r, y: size * 0.45, z: z + Math.sin(a) * r,
          vy: R(0.2, 0.5), life: R(0.4, 0.6), size, sizeEnd: size * 0.6,
          glyph: 'A^', rot: -Math.cos(a) * 0.45, stretch: 0.5,
          color: c0, colorEnd: c1, alpha: 1, alphaEnd: 0, drag: 3,
        });
      }
      // ground ring ~1.2 m across
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        fx.spawn({
          x: x + Math.cos(a) * 0.25, y: 0.08, z: z + Math.sin(a) * 0.25,
          vx: Math.cos(a) * 3.2, vz: Math.sin(a) * 3.2,
          life: 0.3, size: 0.2, sizeEnd: 0.08,
          glyph: '-~', rot: -a, color: c0, colorEnd: c1, alpha: 0.9, alphaEnd: 0, drag: 5,
        });
      }
      fx.spawn({ x, y: 0.3, z, life: 0.14, size: 1.6, sizeEnd: 0.5, glyph: '*', color: COL.trailCore, colorEnd: c0, alpha: 1, alphaEnd: 0, rot: R(0, 3) });
      fx.spawn({ x, y: 0.2, z, life: 0.2, size: 1.0, sizeEnd: 2.2, glyph: '°', color: c0, colorEnd: c1, alpha: 0.7, alphaEnd: 0 });
    }
    // dark rock debris thrown 0.3–0.8 m
    const fa = this.alpha;
    if (fa) {
      for (let i = 0; i < 8; i++) {
        const a = rnd() * Math.PI * 2, sp = R(0.8, 2.2);
        fa.spawn({
          x: x + Math.cos(a) * 0.15, y: 0.08, z: z + Math.sin(a) * 0.15,
          vx: Math.cos(a) * sp, vy: R(1.5, 3.2), vz: Math.sin(a) * sp,
          life: R(0.4, 0.6), size: R(0.08, 0.14), sizeEnd: 0.06,
          glyph: '#%&', color: COL.dust, colorEnd: COL.dustEnd, alpha: 1, alphaEnd: 0, gravity: -12, drag: 1, spin: R(-5, 5),
        });
      }
    }
    this.dust(x, z, 10, 1.3);
    this._light({ x, y: 0.6, z, color: [0.35, 0.75, 1.5], intensity: 4.5, radius: 7, life: 0.35, fade: 0.3 });
  }

  /** A small violet four-point glint ON the gem (s 0..1 = size / brightness): a white-hot core
   *  star, short-lived (≤ 0.16 s) and moving with the gem's own velocity (vx, vy, vz), so it never
   *  floats off the hilt. */
  gemGlint(x, y, z, s = 0.5, vx = 0, vz = 0, vy = 0) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z + vx + vy + vz)) return;
    const k = Math.max(0.2, Math.min(1.2, s));
    fx.spawn({ x, y, z, vx, vy, vz, life: 0.16, size: 0.22 * k + 0.08, sizeEnd: 0.05, glyph: '+', color: COL.gemCore, colorEnd: COL.gem, alpha: 1, alphaEnd: 0, rot: 0.785, spin: 3 });
    fx.spawn({ x, y, z, vx, vy, vz, life: 0.1, size: 0.12 * k + 0.06, sizeEnd: 0.18 * k + 0.08, glyph: '°', color: COL.gem, colorEnd: COL.gemEnd, alpha: 0.5, alphaEnd: 0 });
  }

  /** The gem's steady glow: an always-on violet glow point (~0.24 m: a 3–4 px violet dot at the
   *  game camera) plus a few motes, kept alive at the hilt (k 0..1.5 = strength). */
  gemTick(dt, x, y, z, k, vx = 0, vz = 0, vy = 0) {
    const fx = this.add;
    if (!fx || !(k > 0) || !Number.isFinite(x + y + z + vx + vy + vz)) return;
    this.gemGlowAcc += dt;
    if (this.gemGlowAcc >= 0.03) {
      this.gemGlowAcc = 0;
      const s = 0.22 + 0.04 * Math.min(1, k);
      fx.spawn({ x, y, z, vx, vy, vz, life: 0.06, size: s, sizeEnd: s, glyph: '•', color: COL.gemGlow, colorEnd: COL.gemGlow, alpha: 0.5, alphaEnd: 0.35 });
    }
    this.gemAcc += dt * (8 + 30 * k);
    while (this.gemAcc >= 1) {
      this.gemAcc -= 1;
      fx.spawn({
        x: x + R(-0.015, 0.015), y: y + R(-0.015, 0.015), z: z + R(-0.015, 0.015),
        vx, vy: vy + R(0, 0.15), vz, life: R(0.06, 0.1), size: R(0.06, 0.1) * (0.8 + 0.4 * k), sizeEnd: 0.04,
        glyph: '•', color: COL.gem, colorEnd: COL.gemEnd, alpha: 0.5, alphaEnd: 0.15,
      });
    }
  }

  /**
   * The blade passes through a piece of the world (BREAK.chip.pass; player.js `_cutWorld`): on the
   * face the steel crossed, at (x, y, z) (the piece's footprint centre bx, bz, radius r), as it travels
   * (tx, ty, tz) (unit, world): steel on stone or metal throws a short spray of sparks off the face
   * ALONG the cut; wood splinters and sheds a breath of bark dust the same way; and a faint pale line
   * marks where the edge crossed the face for a moment (a slice, not a hole). `P` = BREAK.chip.pass,
   * `M` = the piece's material (its dim hue for the splinters), `q` = the world's quality (0.3 .. 1).
   * Returns how many glyphs it spawned.
   */
  cutPass(x, y, z, bx, bz, r, tx, ty, tz, mat, M, heavy, P, q = 1) {
    const add = this.add, solid = this.alpha;
    if (!add || !solid || !P || !Number.isFinite(x + y + z + tx + ty + tz + bx + bz + r)) return 0;
    let n = 0;
    // the face's outward normal where it was struck (on the ground plane)
    let nx = x - bx, nz = z - bz;
    const nl = Math.hypot(nx, nz);
    if (nl > 1e-3) {
      nx /= nl;
      nz /= nl;
    } else {
      nx = -tz;
      nz = tx;
    }
    const hl = Math.hypot(tx, tz) || 1, hx = tx / hl, hz = tz / hl;
    const k = Math.max(0.3, Math.min(1, q));
    if (mat === 'stone' || mat === 'metal') {
      // a short spray of hot specks off the face, carried on along the cut (never back at him)
      const m = Math.max(2, Math.round((heavy ? P.sparks[1] : P.sparks[0]) * k));
      for (let i = 0; i < m; i++) {
        const sp = R(2.5, 6) * (heavy ? 1.25 : 1);
        add.spawn({
          x, y, z,
          vx: hx * sp + nx * R(0.4, 1.8) + R(-0.8, 0.8), vy: ty * sp * 0.5 + R(0.3, 2.4), vz: hz * sp + nz * R(0.4, 1.8) + R(-0.8, 0.8),
          life: R(0.12, 0.3), size: R(0.2, 0.28), sizeEnd: 0.06,
          glyph: "+'.", color: COL.spark, colorEnd: COL.sparkEnd,
          alpha: 1, alphaEnd: 0, gravity: -9, drag: 2.4,
        });
        n++;
      }
      if (heavy) this._light({ x, y, z, color: [1, 0.78, 0.5], intensity: 1.2, radius: 2.6, life: 0.08, fade: 0.07 });
    } else if (mat === 'wood' || mat === 'bone') {
      // splinters torn out along the cut, and a breath of bark dust drifting after them
      const m = Math.max(2, Math.round((heavy ? P.splinters[1] : P.splinters[0]) * k));
      const c0 = M?.color ?? COL.dust, c1 = M?.colorEnd ?? COL.dustEnd;
      for (let i = 0; i < m; i++) {
        const sp = R(1.4, 3.6) * (heavy ? 1.3 : 1);
        solid.spawn({
          x: x + R(-0.08, 0.08), y: y + R(-0.1, 0.1), z: z + R(-0.08, 0.08),
          vx: hx * sp + nx * R(0.2, 1.2) + R(-0.5, 0.5), vy: R(0.6, 2.6), vz: hz * sp + nz * R(0.2, 1.2) + R(-0.5, 0.5),
          life: R(0.35, 0.65), size: R(0.24, 0.34), sizeEnd: 0.16,
          glyph: "/\\|-'`", color: c0, colorEnd: c1,
          alpha: 1, alphaEnd: 0, gravity: -13, drag: 0.8, spin: R(-10, 10), rot: R(0, 6.283),
        });
        n++;
      }
      const d = Math.round(3 * k);
      for (let i = 0; i < d; i++) {
        solid.spawn({
          x: x + R(-0.15, 0.15), y: y + R(-0.15, 0.15), z: z + R(-0.15, 0.15),
          vx: hx * R(0.5, 1.2) + nx * 0.3, vy: R(0.1, 0.4), vz: hz * R(0.5, 1.2) + nz * 0.3,
          life: R(0.6, 1.0), size: 0.2, sizeEnd: 0.42,
          glyph: ".,'", color: c1, colorEnd: c1, alpha: 0.5, alphaEnd: 0, drag: 1.6, gravity: 0,
        });
        n++;
      }
    }
    // the line where the edge crossed the face: a few faint strokes laid along the cut on the side it
    // came in by, at the blade's height, gone in a blink
    if (P.line && r > 0.05) {
      const span = Math.min(1.3, (Math.min(1.1, 2 * r) / r) * 0.5); // rad either side of the struck point
      const a0 = Math.atan2(nz, nx), dir = nx * hz - nz * hx >= 0 ? 1 : -1; // (which way the cut runs round it)
      const steps = Math.max(2, Math.min(P.lineMax, Math.round((2 * span * r) / P.lineStep)));
      const rr = r + 0.03;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps, ang = a0 + dir * span * (u * 2 - 1);
        const c = Math.cos(ang), s = Math.sin(ang);
        // (along the circle: its tangent, tilted as the blade travels up or down)
        const ex = -s * dir, ez = c * dir;
        add.spawn({
          x: bx + c * rr, y: y + ty * (u - 0.5) * span * r * 1.2, z: bz + s * rr,
          life: P.lineLife * (0.7 + 0.6 * u), size: 0.12, sizeEnd: 0.1,
          glyph: '|', rot: alongRot(ex, ty * 0.6, ez), stretch: (P.lineStep / 0.12) * 2,
          color: COL.arcCore, colorEnd: COL.arcEnd, alpha: 0.35, alphaEnd: 0,
        });
        n++;
      }
    }
    return n;
  }

  /** White-gold sparks at a sword contact (cold blue-white on a crit). (dx, dz) = swing direction. */
  sparks(x, y, z, dx, dz, heavy, crit = false) {
    const fx = this.add;
    if (!fx) return;
    const n = heavy || crit ? 22 : 12;
    const c0 = crit ? COL.crit : COL.spark, c1 = crit ? COL.critEnd : COL.sparkEnd;
    for (let i = 0; i < n; i++) {
      const sp = R(1, 4) * (heavy ? 1.4 : 1);
      fx.spawn({
        x, y, z,
        vx: dx * sp + R(-3, 3), vy: R(0.5, 4.5), vz: dz * sp + R(-3, 3),
        life: R(0.18, 0.42), size: R(0.16, 0.26), sizeEnd: 0.05,
        glyph: '+x*', color: c0, colorEnd: c1,
        alpha: 1, alphaEnd: 0, gravity: -9, drag: 1.8, spin: R(-6, 6),
      });
    }
    fx.spawn({
      x, y, z, life: 0.1, size: heavy || crit ? 1.15 : 0.75, sizeEnd: 0.2,
      glyph: '*', color: crit ? COL.ghostCore : COL.flash, colorEnd: c0, alpha: 1, alphaEnd: 0, rot: R(0, 3),
    });
    this._light({ x, y, z, color: crit ? [0.6, 0.8, 1.2] : [1, 0.8, 0.5], intensity: heavy || crit ? 3.5 : 2.4, radius: heavy ? 6 : 4.5, life: 0.16, fade: 0.14 });
  }

  /**
   * A cut that lands (combat/cutFx.js) at p (the drawn contact): `tier` = the attack's `contact`
   * (combat.js), C = player._cut (the blade's travel and direction there) or null (the cut's line
   * then falls back across the blade), crit, k = the charge. Returns the spawn count.
   */
  contact(p, tier, C, crit = false, k = 0) {
    if (!p || !this.add) return 0;
    const o = this._co ?? (this._co = { tier, cut: { x: 0, y: 0, z: 0 }, edge: { x: 0, y: 0, z: 0 }, hilt: null, crit, power: 0, low: false, target: null });
    o.tier = tier;
    o.crit = !!crit;
    o.power = k;
    o.low = this.game.settings?.quality === 0;
    if (C) {
      o.cut.x = C.cx; o.cut.y = C.cy; o.cut.z = C.cz;
      o.edge.x = C.ex; o.edge.y = C.ey; o.edge.z = C.ez;
    } else {
      o.cut.x = o.cut.y = o.cut.z = NaN;
      o.edge.x = o.edge.y = o.edge.z = NaN;
    }
    const sw = this.rig?.sword;
    o.hilt = sw?.matrixWorld ? (this._hiltV ?? (this._hiltV = new THREE.Vector3())).set(0, 0, DIM.guard).applyMatrix4(sw.matrixWorld) : null;
    // the weight of the hit beyond the cut's line (combat/impact.js): the stamp printed in the letter
    // grid, the struck body's letters taking the blow. Each behind its own switch; neither may throw
    o.target = this.game.dragon ?? null;
    this._calmAt(p, tier);
    try {
      const ks = impactK('stamp', o.target?.kind === 'duelist' ? 'duelist' : 'wyrm'), kr = impactK('ripple');
      if (ks > 0) stampHit(this.game, p.x, p.y, p.z, o, ks);
      if (kr > 0) this.game.fx?.ripple?.hit?.(p.x, p.y, p.z, o, kr);
    } catch (err) {
      console.error('[impact] the contact failed', err);
    }
    return cutBurst(this.game, p.x, p.y, p.z, o);
  }

  /**
   * Calm at the contact (combat/impactCalm.js), read at the moment of the hit: snapshots the level
   * for this hit's own effects (edgeFlash, cleaveImpact, the steel's gain: calmBlade) and opens the
   * zone round the contact where the swing arc is dimmed in the frames after it (trail). Today
   * (level 0): no zone, every factor 1.
   */
  _calmAt(p, tier) {
    const L = calmLook(), Z = (this._calmZ ??= { L: null, on: false, x: 0, y: 0, z: 0, t0: 0, until: 0, r0: 0, r1: 1, atk: null });
    Z.L = L;
    Z.on = false;
    const A = L?.arc;
    if (!A || !p || !Number.isFinite(p.x + p.y + p.z)) return;
    const g = this.game, heavy = tier === 'slam' || tier === 'cleave' || tier === 'execute';
    const rk = heavy && Number.isFinite(A.rHeavy) ? A.rHeavy : 1;
    Z.on = true;
    Z.x = p.x; Z.y = p.y; Z.z = p.z;
    Z.r0 = (A.r?.[0] ?? 0.5) * rk;
    Z.r1 = Math.max(Z.r0 + 0.05, (A.r?.[1] ?? 1) * rk);
    const now = Number.isFinite(g.realTime) ? g.realTime : 0;
    // the zone lasts the freeze (set just before the contact draws) and then `win` real s
    Z.t0 = now;
    Z.until = now + Math.max(0, Number.isFinite(g.hitstopTimer) ? g.hitstopTimer : 0) + (Number.isFinite(A.win) ? A.win : 0.12);
    Z.atk = g.player?.atk ?? null; // only the swing that landed
  }

  /** The steel's lit gain x this (player.js), `w` = how much of the hit's flare is still held (1 at
   *  the contact ... 0 cooled). Exactly 1 today. */
  calmBlade(w) {
    const L = this._calmZ?.L;
    if (!L || !Number.isFinite(L.blade)) return 1;
    const ww = Number.isFinite(w) ? Math.max(0, Math.min(1, w)) : 0;
    return 1 - (1 - Math.max(0, L.blade)) * ww;
  }

  /** The hit's own flare value (player.js sets the steel's flare): x the level's `flare` (today: v). */
  calmFlare(v) {
    const L = this._calmZ?.L;
    return L && Number.isFinite(L.flare) ? v * Math.max(0, L.flare) : v;
  }

  /** The arc's dimming at (x, y, z) this frame: 1 outside the zone (and always today), else the
   *  level's `a` near the contact easing to 1 at r1 (screen-plane distance). -> CALM_ARC { a, s, k }. */
  _arcCalm(x, y, z) {
    const Z = this._calmZ, R = CALM_ARC;
    R.a = R.s = 1;
    R.k = 0;
    if (!Z?.on) return R;
    const g = this.game, now = Number.isFinite(g.realTime) ? g.realTime : 0;
    if (now > Z.until || now < Z.t0 || (g.player?.atk ?? null) !== Z.atk) {
      Z.on = false;
      return R;
    }
    const A = axes(g), dx = x - Z.x, dy = y - Z.y, dz = z - Z.z;
    const sx = dx * A.rx + dy * A.ry + dz * A.rz, sy = dx * A.ux + dy * A.uy + dz * A.uz;
    const d = Math.sqrt(sx * sx + sy * sy);
    if (!Number.isFinite(d) || d >= Z.r1) return R;
    const u = d <= Z.r0 ? 0 : (d - Z.r0) / (Z.r1 - Z.r0), f = u * u * (3 - 2 * u); // 0 at the contact ... 1 at r1
    const C = Z.L.arc;
    R.k = 1 - f;
    R.a = (C.a ?? 1) + (1 - (C.a ?? 1)) * f;
    R.s = (C.size ?? 1) + (1 - (C.size ?? 1)) * f;
    return R;
  }

  /**
   * The charged cleave bites: a ring bursting out of the contact in the camera's plane, a fan of long
   * cyan-white streaks thrown on along the cut's way (dx, dz), and a cold flash of light; k = charge.
   * `bare`: the fan only (a landed cut's contact() draws the ring and the light).
   */
  cleaveImpact(x, y, z, dx, dz, k = 0, crit = false, bare = false) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    if (!bare) this.shockwave(x, y, z, k > 0.5);
    const c0 = crit ? COL.crit : COL.trailCore, c1 = crit ? COL.critEnd : COL.trailEnd;
    const base = Math.atan2(dz, dx), n = 10 + Math.round(8 * k);
    // calm at the contact (a landed cleave: the level contact() just read; exactly 1 today)
    const CL = bare ? this._calmZ?.L ?? null : null, cA = calmA(CL, 'cleave'), cS = calmS(CL, 'cleave');
    for (let i = 0; i < n; i++) {
      const a = base + R(-1.1, 1.1), sp = R(7, 14) * (1 + 0.3 * k);
      const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp, vy = R(-1, 5);
      fx.spawn({
        x, y, z, vx, vy, vz,
        life: R(0.16, 0.3), size: R(0.2, 0.3) * cS, sizeEnd: 0.05, glyph: '-=', rot: alongRot(vx, vy, vz) + Math.PI / 2, stretch: 2.2,
        color: c0, colorEnd: c1, alpha: cA, alphaEnd: 0, drag: 3.5,
      });
    }
    if (!bare) this._light({ x, y, z, color: crit ? [0.6, 0.8, 1.3] : [0.55, 0.85, 1.25], intensity: 4 + 2 * k, radius: 7, life: 0.2, fade: 0.18 });
  }

  /** Charged heavy's release: a short ground gust ring of dust and glints around the feet. */
  release(x, z, k) {
    this.dust(x, z, 6 + Math.round(8 * k), 0.8 + 0.8 * k);
  }

  /**
   * Parry (deflect): steel on steel at (x, y, z) (combat/clashFx.js: a starburst of thin streaks, a
   * cross of light along the two edges, a two-frame core, falling embers; cold blue for a heavy blow,
   * gold for a perfect parry). `chain` = the deflect chain count (player.deflect): each deflect in
   * rhythm throws more and further; (dx, dz) = toward the blow.
   * `o`: { e1, e2 (the two blades' directions), spray (the turned blade's way), perfect, light (a
   * bullet: a small burst), ring (0 none, 1, 2) }.
   * (Until 2026-11-14 this was a 0.7 m '*' core, a '°' bloom ring and a 4.5 light on top of the
   * attacker's own burst: through the freeze-frame, two white blots where the blades should cross.)
   */
  parry(x, y, z, blue, chain = 1, dx = 0, dz = 0, o = null) {
    if (!this.add || !Number.isFinite(x + y + z)) return;
    // (never at the floor: a light ~0.3 m above the paving blows it out into a white disc)
    y = Math.max(0.75, y);
    const n = Math.max(1, Math.min(6, Number.isFinite(chain) ? chain : 1));
    const fdx = Number.isFinite(dx) ? dx : 0, fdz = Number.isFinite(dz) ? dz : 0;
    const spray = o?.spray ?? (fdx || fdz ? SPRAY.set(fdx * 0.7, 0.6, fdz * 0.7) : null);
    // a perfect parry in the sharp / cinema look (o.feel: perfectMoment's): the gold clash smaller,
    // no rings or cross of glyphs, and the mark printed in the letter grid at the crossing
    const PF = o?.perfect && !o?.light ? o?.feel?.F : null;
    if (PF) {
      clashBurst(this.game, x, y, z, { pal: CLASH.perfect, power: (1 + 0.12 * (n - 1)) * PF.clash.power, spray, e1: o?.e1 ?? null, e2: o?.e2 ?? null, ring: PF.clash.ring, cross: PF.clash.cross, light: PF.clash.light, embers: PF.clash.embers });
      perfectParryMark(this.game, x, y, z, { e1: o?.e1 ?? null, e2: o?.e2 ?? null, mode: o.feel.mode, beat: o.feel.beat, streak: o.feel.streak });
      return;
    }
    clashBurst(this.game, x, y, z, {
      pal: o?.perfect ? CLASH.perfect : blue ? CLASH.blue : CLASH.parry,
      power: (o?.light ? 0.55 : 1) * (1 + 0.12 * (n - 1)) * (o?.perfect ? 1.25 : 1),
      spray, e1: o?.e1 ?? null, e2: o?.e2 ?? null,
      ring: o?.ring ?? (o?.light ? 0 : 1),
    });
  }

  /**
   * A shockwave ring in the screen's plane bursting out of a contact (the cleave's bite; `big`:
   * wider, a second slower ring; `perfect` adds a gold ring and a spray of gold sparks).
   */
  shockwave(x, y, z, big = false, perfect = false) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const rx = CAM ? CAM[0] : 1, ry = CAM ? CAM[1] : 0, rz = CAM ? CAM[2] : 0;
    const ux = CAM ? CAM[4] : 0, uy = CAM ? CAM[5] : UP_Y, uz = CAM ? CAM[6] : UP_Z;
    // (the ring is born already open: the parry's freeze-frame holds it there, a crisp ring round the
    // clash; born at the centre, its strokes stacked into one blooming white blot for the whole freeze)
    const rings = big ? [[0.55, 1.9, 0.2, 20, RING.white], [0.42, 1.2, 0.28, 14, perfect ? RING.gold : RING.warm]] : [[0.48, 1.4, 0.18, 16, RING.white]];
    for (const [R0, R1, life, n, col] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const dx = rx * ca + ux * sa, dy = ry * ca + uy * sa, dz = rz * ca + uz * sa;
        const sp = (R1 - R0) / life;
        fx.spawn({
          x: x + dx * R0, y: y + dy * R0, z: z + dz * R0, vx: dx * sp, vy: dy * sp, vz: dz * sp,
          life, size: 0.17, sizeEnd: 0.06, glyph: '-', rot: a + Math.PI / 2, stretch: 1.4,
          color: col, colorEnd: COL.parryEnd, alpha: 1, alphaEnd: 0, drag: 1.5,
        });
      }
    }
    // (no core of its own: parry() has one, and stacked cores bloom into a white blot that hides
    // both fighters through the freeze-frame)
    if (perfect) {
      for (let i = 0; i < 14; i++) {
        const a = R(0, Math.PI * 2), sp = R(5, 10);
        fx.spawn({
          x, y, z, vx: (rx * Math.cos(a) + ux * Math.sin(a)) * sp, vy: (ry * Math.cos(a) + uy * Math.sin(a)) * sp + R(0, 2), vz: (rz * Math.cos(a) + uz * Math.sin(a)) * sp,
          life: R(0.18, 0.3), size: R(0.18, 0.28), sizeEnd: 0.04, glyph: "*+'", color: [4.2, 2.9, 0.9], colorEnd: [1.4, 0.5, 0.1], alpha: 1, alphaEnd: 0, drag: 3,
        });
      }
    }
  }

  /**
   * A perfect parry of a bullet (ADR-051): a gold star on the blade and a fan of gold sparks thrown
   * back along the shot's way out (dx, dz = toward the blow), on top of the usual clash.
   */
  perfectParry(x, y, z, dx = 0, dz = 0) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const fdx = Number.isFinite(dx) ? dx : 0, fdz = Number.isFinite(dz) ? dz : 0;
    fx.spawn({ x, y, z, life: 0.16, size: 1.5, sizeEnd: 0.3, glyph: '*', color: [4.6, 3.4, 1.2], colorEnd: [2.0, 0.9, 0.2], alpha: 1, alphaEnd: 0, rot: R(0, 3), spin: 3 });
    for (let i = 0; i < 16; i++) {
      const a = Math.atan2(fdz, fdx) + R(-0.7, 0.7), sp = R(6, 12);
      fx.spawn({
        x, y, z,
        vx: Math.cos(a) * sp, vy: R(0.5, 4), vz: Math.sin(a) * sp,
        life: R(0.18, 0.32), size: R(0.2, 0.32), sizeEnd: 0.04,
        glyph: "*+'", color: [4.2, 2.9, 0.9], colorEnd: [1.4, 0.5, 0.1], alpha: 1, alphaEnd: 0, drag: 3, gravity: -5,
      });
    }
    this._light({ x, y, z, color: [1.3, 0.95, 0.45], intensity: 5, radius: 7, life: 0.22, fade: 0.2 });
  }

  /** A blue flare blow parried (the counter's opening, ADR-118): blue-white sparks thrown wide off
   *  the crossing and a blue light, on top of the parry's own clash. Small sparks only. */
  flareParry(x, y, z, dx = 0, dz = 0) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    y = Math.max(0.75, y);
    const a0 = Math.atan2(Number.isFinite(dz) ? dz : 0, Number.isFinite(dx) ? dx : 0);
    for (let i = 0; i < 22; i++) {
      const a = a0 + R(-1.5, 1.5), sp = R(7, 15);
      fx.spawn({
        x, y, z,
        vx: Math.cos(a) * sp, vy: R(-1, 5), vz: Math.sin(a) * sp,
        life: R(0.2, 0.36), size: R(0.18, 0.28), sizeEnd: 0.04,
        glyph: "-+'", color: [1.2, 2.6, 5.2], colorEnd: [0.1, 0.4, 1.6], alpha: 1, alphaEnd: 0, drag: 3.2, gravity: -4, stretch: 1.4,
      });
    }
    this._light({ x, y, z, color: [0.3, 0.6, 1.0], intensity: 6, radius: 8, life: 0.26, fade: 0.22 });
  }

  /** A flare blow dodged in time (ADR-118; red or black): where he stood, a burst of small strokes in
   *  the flare's colour thrown out flat and up, and a light: the moment the answer begins. */
  flareDodge(x, y, z, black = false) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const c0 = black ? [1.6, 0.5, 3.6] : [4.6, 0.5, 0.25], c1 = black ? [0.3, 0.05, 0.8] : [1.4, 0.08, 0.04];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + R(-0.1, 0.1), sp = R(7, 15);
      fx.spawn({
        x, y: y + R(-0.3, 0.3), z,
        vx: Math.cos(a) * sp, vy: R(-0.5, 3.5), vz: Math.sin(a) * sp,
        life: R(0.16, 0.3), size: R(0.18, 0.26), sizeEnd: 0.04,
        glyph: "-'|", color: c0, colorEnd: c1, alpha: 1, alphaEnd: 0, drag: 4.5, stretch: 1.6,
      });
    }
    this._light({ x, y: Math.max(0.9, y), z, color: black ? [0.5, 0.2, 0.9] : [1.0, 0.18, 0.1], intensity: 5, radius: 7, life: 0.22, fade: 0.2 });
  }

  /** A black (charged) blow met on the guard (ADR-118): the guard's shards go dark, thrown back
   *  with the hero (on top of guardBreak's). */
  blackBreak(x, y, z, nx, nz) {
    const fx = this.alpha ?? this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    for (let i = 0; i < 20; i++) {
      const sp = R(3, 8);
      fx.spawn({
        x, y, z,
        vx: nx * sp + R(-3, 3), vy: R(0.5, 5), vz: nz * sp + R(-3, 3),
        life: R(0.35, 0.7), size: R(0.18, 0.28), sizeEnd: 0.06,
        glyph: '/\\#|', color: [0.03, 0.02, 0.05], colorEnd: [0.2, 0.05, 0.35], alpha: 1, alphaEnd: 0, gravity: -9, drag: 1.6, spin: R(-9, 9),
      });
    }
    this._light({ x, y, z, color: [0.5, 0.2, 0.9], intensity: 3, radius: 5, life: 0.2, fade: 0.18 });
  }

  /** Blocked blow: '#' sparks thrown off the guard, away from the attacker (nx, nz). */
  block(x, y, z, nx, nz, heavy) {
    const fx = this.add;
    if (!fx) return;
    const n = heavy ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const sp = R(1.5, 4) * (heavy ? 1.3 : 1);
      fx.spawn({
        x, y, z,
        vx: -nx * sp * 0.4 + R(-2.5, 2.5), vy: R(0.5, 3.5), vz: -nz * sp * 0.4 + R(-2.5, 2.5),
        life: R(0.18, 0.36), size: R(0.16, 0.24), sizeEnd: 0.05,
        glyph: '#=+', color: COL.block, colorEnd: COL.blockEnd, alpha: 1, alphaEnd: 0, gravity: -9, drag: 2, spin: R(-5, 5),
      });
    }
    fx.spawn({ x, y, z, life: 0.08, size: heavy ? 0.9 : 0.6, sizeEnd: 0.2, glyph: '#', color: COL.flash, colorEnd: COL.block, alpha: 1, alphaEnd: 0 });
    this._light({ x, y, z, color: [1, 0.85, 0.6], intensity: heavy ? 2.6 : 1.6, radius: 4, life: 0.12, fade: 0.1 });
  }

  /** Small chip sparks for a blocked stream tick (fire breath on the guard). */
  blockChip(x, y, z) {
    const fx = this.add;
    if (!fx) return;
    for (let i = 0; i < 2; i++) {
      fx.spawn({
        x, y, z, vx: R(-1.5, 1.5), vy: R(0.5, 2), vz: R(-1.5, 1.5),
        life: R(0.12, 0.22), size: R(0.12, 0.18), sizeEnd: 0.04,
        glyph: '#+', color: COL.block, colorEnd: COL.blockEnd, alpha: 1, alphaEnd: 0, gravity: -6, drag: 2,
      });
    }
  }

  /** Guard break: the guard shatters — grey shards + a hot flash, thrown back with the hero. */
  guardBreak(x, y, z, nx, nz) {
    const fx = this.add;
    if (fx) {
      for (let i = 0; i < 18; i++) {
        const sp = R(2, 5);
        fx.spawn({
          x, y, z,
          vx: nx * sp + R(-2.5, 2.5), vy: R(1, 4.5), vz: nz * sp + R(-2.5, 2.5),
          life: R(0.3, 0.6), size: R(0.18, 0.28), sizeEnd: 0.06,
          glyph: '/\\#|', color: COL.break, colorEnd: COL.breakEnd, alpha: 1, alphaEnd: 0, gravity: -10, drag: 1.4, spin: R(-9, 9),
        });
      }
      fx.spawn({ x, y, z, life: 0.12, size: 1.4, sizeEnd: 0.4, glyph: 'X', color: [3.6, 1.2, 0.5], colorEnd: [1.2, 0.2, 0.05], alpha: 1, alphaEnd: 0 });
    }
    this.dust(x, z, 10, 1.2);
    this._light({ x, y, z, color: [1.2, 0.5, 0.25], intensity: 3, radius: 5, life: 0.18, fade: 0.16 });
  }

  /**
   * Ghostep: a cold blue-white afterimage traced along the hero's pose at the old spot (`segs`:
   * flat [ax, ay, az, bx, by, bz, ...] world segments sampled before the blink), a streak to the
   * new spot, and a reappear burst.
   */
  ghostep(segs, nSegs, ox, oz, nx, nz, o = undefined) {
    const fx = this.add;
    if (!fx) return;
    const sx = nx - ox, sz = nz - oz;
    const dist = Math.hypot(sx, sz);
    const ok = dist > 0.3 && Number.isFinite(dist);
    if (o?.feel?.F) {
      this._ghostepFeel(fx, segs, nSegs, ox, oz, nx, nz, ok ? sx / dist : NaN, ok ? sz / dist : NaN, o);
      return;
    }
    this._afterimage(fx, segs, nSegs, ok ? { dx: sx / dist, dz: sz / dist } : null);
    this.blinkStream(fx, nx, 1.1, nz);
    this.blinkIn(fx, nx, 1.1, nz);
    // streak from the old spot to the new one
    if (dist > 0.3 && Number.isFinite(dist)) {
      const rot = alongRot(sx, 0, sz) + Math.PI / 2; // '-' laid along the ground path
      const n = Math.min(60, Math.round(dist / 0.18));
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        for (let j = 0; j < 2; j++) {
          fx.spawn({
            x: ox + sx * f + R(-0.12, 0.12), y: R(0.35, 1.45), z: oz + sz * f + R(-0.12, 0.12),
            vx: (sx / dist) * R(0.5, 2), vy: R(-0.1, 0.2), vz: (sz / dist) * R(0.5, 2),
            life: R(0.25, 0.5) * (0.5 + 0.5 * f), size: R(0.18, 0.26), sizeEnd: 0.05, stretch: 1.5,
            glyph: '-=~·', rot: rot + R(-0.1, 0.1), color: COL.ghost, colorEnd: COL.ghostEnd,
            alpha: 0.85, alphaEnd: 0, drag: 2.5,
          });
        }
      }
    }
    // reappear: a ring of motes collapsing upward + a core flash
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      fx.spawn({
        x: nx + Math.cos(a) * 0.7, y: R(0.1, 1.5), z: nz + Math.sin(a) * 0.7,
        vx: -Math.cos(a) * 1.4, vy: R(0.4, 1.4), vz: -Math.sin(a) * 1.4,
        life: R(0.3, 0.5), size: R(0.14, 0.2), sizeEnd: 0.04,
        glyph: '·+°', color: COL.ghost, colorEnd: COL.ghostEnd, alpha: 1, alphaEnd: 0, drag: 2, flicker: 0.3,
      });
    }
    fx.spawn({ x: nx, y: 0.95, z: nz, life: 0.18, size: 1.8, sizeEnd: 0.4, glyph: '|', color: COL.ghostCore, colorEnd: COL.ghost, alpha: 1, alphaEnd: 0 });
    this._light({ x: nx, y: 1.1, z: nz, color: [0.55, 0.75, 1.3], intensity: 3.2, radius: 6, life: 0.5, fade: 0.45, fadeIn: 0.02 });
  }

  /**
   * The Ghostep in the sharp / cinema look (combat/perfectFx.js PERFECT_FEEL[mode].dodge; o.feel:
   * perfectMoment's, o.wx / o.wz the way he was going): the afterimage stands as a clear figure, then
   * tears into its letters along the way he left (ux, uz: toward where he is; NaN when he stayed: the
   * way he was going); ONE clean line in the letter grid from where he was to where he is (when he
   * stayed: the last `line.min` m of the way he came, ending on him); cinema adds the arrival mark
   * round him. Today's streams to and onto him, the ground streak, the motes and the big '|' core are
   * not drawn; a smaller light.
   */
  _ghostepFeel(fx, segs, nSegs, ox, oz, nx, nz, ux, uz, o) {
    const D = o.feel.F, mode = o.feel.mode, g = this.game, y = 1.1;
    let dx = ux, dz = uz;
    const moved = Number.isFinite(dx + dz);
    if (!moved) {
      const l = Math.hypot(Number(o.wx) || 0, Number(o.wz) || 0);
      dx = l > 1e-3 ? o.wx / l : 0;
      dz = l > 1e-3 ? o.wz / l : 0;
    }
    this._afterimage(fx, segs, nSegs, { dx, dz, feel: D });
    if (moved) perfectDodgeLine(g, ox, y, oz, nx, y, nz, mode);
    else if (dx || dz) perfectDodgeLine(g, nx - dx * D.line.min, y, nz - dz * D.line.min, nx, y, nz, mode);
    if (D.arrive) perfectArrive(g, nx, y, nz, mode);
    if (D.blink) {
      this.blinkStream(fx, nx, y, nz);
      this.blinkIn(fx, nx, y, nz);
    }
    this._light({ x: nx, y, z: nz, color: [0.55, 0.75, 1.3], intensity: 1.8, radius: 5, life: 0.3, fade: 0.28, fadeIn: 0.02 });
  }

  /**
   * The look of a perfect parry / dodge NOW (combat/streak.js perfectMode(), or `mode`): a record
   * reused per kind: mode ('today' when its feel is null), F (PERFECT_FEEL[mode][kind] or null), and
   * for a parry beat (cinema: 'full' for a single blow / a string's last blow, else 'short') and T (the
   * numbers of the freeze, shake, punch and slow motion: cinema's full / short, sharp's own; null =
   * today's). `streak`: the count the moment makes (the mark's echo reads its tier).
   */
  perfectMoment(kind, last = true, streak = 0, mode = perfectMode()) {
    const all = this._pm ?? (this._pm = {});
    const R = all[kind] ?? (all[kind] = { kind, mode: 'today', F: null, T: null, beat: '', streak: 0 });
    const feel = perfectFeel(mode);
    R.mode = feel ? mode : 'today';
    R.F = feel?.[kind] ?? null;
    R.streak = Number.isFinite(streak) ? streak : 0;
    R.beat = kind === 'parry' && R.F ? perfectBeat(R.mode, last, this.game.realTime) : '';
    R.T = kind === 'parry' && R.F ? (R.beat ? R.F[R.beat] : R.F) : null;
    return R;
  }

  /**
   * The afterimage (ADR-101): the hero as he stood, drawn in fine digits where he was, cold
   * blue-white, falling apart from the feet up. Its points are his body's own (`this.body`,
   * `this.bodyN`: player.js _sampleBody, taken with the pose's `segs`); without them (no meshes: a
   * bare test rig) it is strokes along his bones, as it used to be.
   * `o`: { dx, dz } the way he left (unit, ground plane; 0, 0 = unknown), `light`: a lesser one (a
   * clone left mid-pass: every other point, shorter-lived).
   * (Three looks were built; the owner picked this one, "Digits", over an "Echo" of fainter copies
   * stepping off the way he left and a "Shatter" that burst the figure into its characters.)
   */
  _afterimage(fx, segs, nSegs, o = null) {
    const pts = this.body, n = Math.min(this.bodyN | 0, pts ? Math.floor(pts.length / 3) : 0);
    if (!(n >= 24)) {
      this._afterimageBones(fx, segs, nSegs);
      return;
    }
    const light = !!o?.light, step = light ? 2 : 1;
    let dx = Number(o?.dx), dz = Number(o?.dz);
    if (!Number.isFinite(dx + dz)) dx = dz = 0;
    let y0 = Infinity;
    for (let i = 0; i < n; i++) y0 = Math.min(y0, pts[i * 3 + 1]);
    const lifeK = light ? 0.7 : 1;
    const feel = o?.feel ?? null; // sharp / cinema: the cells go to perfectGhost (stand, then tear)
    let nG = 0;
    const GP = feel ? this._ghostPos ?? (this._ghostPos = new Float32Array(480 * 3)) : null;
    // one character to a cell of a GHOST_CELL grid ON THE SCREEN, as he is printed himself: a point
    // that falls in a cell already taken is dropped (characters on top of one another bloom into a
    // white blot), and each is moved onto its cell, so they stand in rows and columns
    const cells = this._ghostCells, q = 1 / GHOST_CELL, C = CAM;
    const rx = C ? C[0] : 1, ry = C ? C[1] : 0, rz = C ? C[2] : 0, ux = C ? C[4] : 0, uy = C ? C[5] : 1, uz = C ? C[6] : 0;
    cells.clear();
    for (let i = 0; i < n; i += step) {
      const k = i * 3, px = pts[k], py = pts[k + 1], pz = pts[k + 2];
      const sx = px * rx + py * ry + pz * rz, sy = px * ux + py * uy + pz * uz;
      const cx = Math.round(sx * q), cy = Math.round(sy * q);
      const key = (cx & 0xffff) * 65536 + (cy & 0xffff);
      if (cells.has(key)) continue;
      cells.add(key);
      const mx = cx * GHOST_CELL - sx, my = cy * GHOST_CELL - sy;
      const x = px + rx * mx + ux * my, y = py + ry * mx + uy * my, z = pz + rz * mx + uz * my;
      if (GP) {
        if (nG < 480) {
          GP[nG * 3] = x;
          GP[nG * 3 + 1] = y;
          GP[nG * 3 + 2] = z;
          nG++;
        }
        continue;
      }
      const h = Math.min(1, Math.max(0, (y - y0) / 1.8)); // 0 his feet … 1 his head
      // (it drifts a little the way he left, and rises)
      fx.spawn({
        x, y, z, vx: dx * R(0.05, 0.3), vy: R(0.02, 0.16), vz: dz * R(0.05, 0.3),
        life: (0.24 + 0.3 * h + R(0, 0.14)) * lifeK, size: GHOST_CELL * 1.25, sizeEnd: GHOST_CELL * 0.8, glyph: GHOST_DIGITS,
        color: i % 11 === 0 ? COL.ghost : COL.ghostDim, colorEnd: COL.ghostEnd, alpha: 0.9, alphaEnd: 0, drag: 1.2, flicker: 0.3,
      });
    }
    if (GP && nG) perfectGhost(this.game, GP, nG, dx, 0, dz, feel.ghost, GHOST_STAND, COL.ghostDim, COL.ghostEnd, GHOST_CELL * 1.25);
  }

  /**
   * The way he went: characters torn off the afterimage just left (`this.body`) fly to where he is
   * now (tx, ty, tz: his chest) and are gone as they reach it. The eye is carried from the one to
   * the other. Call it as he appears.
   */
  blinkStream(fx, tx, ty, tz) {
    const pts = this.body, n = Math.min(this.bodyN | 0, pts ? Math.floor(pts.length / 3) : 0);
    if (!fx || !(n >= 24) || !Number.isFinite(tx + ty + tz)) return;
    const m = 34, st = n / m;
    for (let j = 0; j < m; j++) {
      const k = Math.min(n - 1, Math.floor(j * st + rnd() * st)) * 3;
      const x = pts[k], y = pts[k + 1], z = pts[k + 2];
      const ex = tx + R(-0.25, 0.25) - x, ey = ty + R(-0.6, 0.5) - y, ez = tz + R(-0.25, 0.25) - z;
      const d = Math.hypot(ex, ey, ez);
      if (!(d > 0.4) || d > 40) continue;
      const life = R(0.07, 0.17);
      fx.spawn({
        x, y, z, vx: ex / life, vy: ey / life, vz: ez / life, life, size: GHOST_CELL * 1.3, sizeEnd: GHOST_CELL * 0.8, glyph: GHOST_DIGITS,
        color: COL.ghost, colorEnd: COL.ghostDim, alpha: 0.9, alphaEnd: 0.2,
      });
    }
  }

  /** He resolves at (x, y, z: his chest): characters rush in onto him from all round. */
  blinkIn(fx, x, y, z) {
    if (!fx || !Number.isFinite(x + y + z)) return;
    for (let j = 0; j < 18; j++) {
      const a = R(0, Math.PI * 2), r = R(0.8, 1.5), ey = R(-0.9, 0.7);
      const life = R(0.08, 0.15);
      const tx = x + Math.cos(a) * R(0, 0.22), tz = z + Math.sin(a) * R(0, 0.22), ty = y + ey;
      const sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r, sy = ty + R(-0.3, 0.3);
      fx.spawn({
        x: sx, y: sy, z: sz, vx: (tx - sx) / life, vy: (ty - sy) / life, vz: (tz - sz) / life, life, size: GHOST_CELL * 1.2, sizeEnd: GHOST_CELL * 0.8,
        glyph: GHOST_DIGITS, color: COL.ghostDim, colorEnd: COL.ghost, alpha: 0.3, alphaEnd: 0.9,
      });
    }
  }

  /** The afterimage without a body to sample: strokes along each bone of the pose (`segs`: flat
   *  [ax, ay, az, bx, by, bz, ...] world segments), oriented to their screen direction. */
  _afterimageBones(fx, segs, nSegs) {
    for (let s = 0; s < nSegs; s++) {
      const k = s * 6;
      const ax = segs[k], ay = segs[k + 1], az = segs[k + 2];
      const dx = segs[k + 3] - ax, dy = segs[k + 4] - ay, dz = segs[k + 5] - az;
      const len = Math.hypot(dx, dy, dz);
      if (!(len > 1e-3) || !Number.isFinite(len + ax + ay + az)) continue;
      const rot = alongRot(dx, dy, dz);
      const n = Math.max(1, Math.round(len / 0.11));
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        fx.spawn({
          x: ax + dx * f, y: ay + dy * f, z: az + dz * f,
          vx: R(-0.15, 0.15), vy: R(0.05, 0.35), vz: R(-0.15, 0.15),
          life: R(0.45, 0.65), size: R(0.2, 0.26), sizeEnd: 0.12,
          glyph: '|', rot: rot + R(-0.15, 0.15), color: COL.ghost, colorEnd: COL.ghostEnd,
          alpha: 0.9, alphaEnd: 0, drag: 1.5, flicker: 0.25,
        });
      }
    }
  }

  // ------------------------------------------------------------------ the plunge (player.js)
  /**
   * The plunge's blink: the afterimage at the dodge spot (ox, oz), a cold streak rising from it to
   * the hang point above the head (nx, ny, nz: the root there) and the reappear burst round him.
   */
  plungeBlink(segs, nSegs, ox, oz, nx, ny, nz) {
    const fx = this.add;
    if (!fx || !Number.isFinite(ox + oz + nx + ny + nz)) return;
    this._afterimage(fx, segs, nSegs);
    this.blinkStream(fx, nx, ny + 1.1, nz);
    // the rising streak, laid along the 3D path (it reads as the way he went)
    const sx = nx - ox, sy = ny + 0.4, sz = nz - oz;
    const dist = Math.hypot(sx, sy, sz);
    if (dist > 0.3 && dist < 60) {
      const rot = alongRot(sx, sy, sz) + Math.PI / 2;
      const n = Math.min(70, Math.round(dist / 0.16));
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        fx.spawn({
          x: ox + sx * f + R(-0.1, 0.1), y: 0.9 + sy * f + R(-0.1, 0.1), z: oz + sz * f + R(-0.1, 0.1),
          vx: (sx / dist) * R(0.3, 1.2), vy: (sy / dist) * R(0.3, 1.2), vz: (sz / dist) * R(0.3, 1.2),
          life: R(0.25, 0.5) * (0.45 + 0.55 * f), size: R(0.18, 0.26), sizeEnd: 0.05, stretch: 1.5,
          glyph: '-=~·', rot: rot + R(-0.1, 0.1), color: COL.ghost, colorEnd: COL.ghostEnd,
          alpha: 0.85, alphaEnd: 0, drag: 2.5,
        });
      }
    }
    // reappear: motes collapsing onto him + a cold core flash
    const cy = ny + 1.0;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2, r = R(0.7, 1.1);
      const ex = Math.cos(a) * r, ey = R(-0.6, 0.7), ez = Math.sin(a) * r;
      fx.spawn({
        x: nx + ex, y: cy + ey, z: nz + ez, vx: -ex * 2.4, vy: -ey * 2.4, vz: -ez * 2.4,
        life: R(0.28, 0.4), size: R(0.14, 0.22), sizeEnd: 0.04,
        glyph: '·+°', color: COL.ghost, colorEnd: COL.ghostEnd, alpha: 1, alphaEnd: 0, drag: 2, flicker: 0.3,
      });
    }
    // (short: it runs in the slow-mo, and a long flare hid him for most of the hang)
    fx.spawn({ x: nx, y: cy, z: nz, life: 0.1, size: 1.7, sizeEnd: 0.4, glyph: '+', color: COL.ghostCore, colorEnd: COL.ghost, alpha: 1, alphaEnd: 0, rot: 0.785 });
    this._light({ x: nx, y: cy, z: nz, color: [0.55, 0.78, 1.4], intensity: 3, radius: 6, life: 0.3, fade: 0.25, fadeIn: 0.02 });
  }

  /** The hang at the apex: cold motes drawn in onto him (x, y, z: his chest). */
  plungeHang(dt, x, y, z) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    this.plAcc += dt * 60;
    while (this.plAcc >= 1) {
      this.plAcc -= 1;
      const a = rnd() * Math.PI * 2, r = R(0.6, 1.2);
      const ex = Math.cos(a) * r, ey = R(-0.7, 0.9), ez = Math.sin(a) * r;
      const life = R(0.16, 0.26);
      fx.spawn({
        x: x + ex, y: y + ey, z: z + ez, vx: -ex / life, vy: -ey / life, vz: -ez / life,
        life, size: R(0.09, 0.15), sizeEnd: 0.03, glyph: "·'.+", color: COL.charge, colorEnd: COL.chargeEnd, alpha: 0.85, alphaEnd: 0.1,
      });
    }
  }

  /**
   * The blade meets the head (x, y, z: the wound): a white-cyan flash, cold crystal shards fanned
   * up and out, molten blood thrown up from the wyrm, a shock ring round the skull, two lights.
   * (dx, dz) = his spring-off side; exec: the execution (bigger, gold-white).
   */
  plungeImpact(x, y, z, dx, dz, exec = false) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const k = exec ? 1.35 : 1;
    const c0 = exec ? COL.parry : COL.shard, c1 = exec ? COL.parryEnd : COL.shardEnd;
    fx.spawn({ x, y: y + 0.3, z, life: 0.16, size: 3.2 * k, sizeEnd: 0.6, glyph: '*', color: COL.flash, colorEnd: COL.trailCore, alpha: 1, alphaEnd: 0, rot: R(0, 3) });
    fx.spawn({ x, y: y + 0.2, z, life: 0.3, size: 1.4 * k, sizeEnd: 4.2 * k, glyph: '°', color: COL.trailCore, colorEnd: COL.shardEnd, alpha: 0.85, alphaEnd: 0 });
    // the crystal fan: kite shards up and out all round
    const nS = Math.round(16 * k);
    for (let i = 0; i < nS; i++) {
      const a = (i / nS) * Math.PI * 2 + R(-0.15, 0.15), up = R(0.35, 1.25), sp = R(3.5, 7) * k;
      const vx = Math.cos(a) * sp * Math.cos(up), vy = Math.sin(up) * sp, vz = Math.sin(a) * sp * Math.cos(up);
      fx.spawn({
        x: x + Math.cos(a) * 0.25, y: y + 0.1, z: z + Math.sin(a) * 0.25, vx, vy, vz,
        life: R(0.4, 0.7), size: R(0.2, 0.42) * k, sizeEnd: 0.06, stretch: 0.6,
        glyph: 'A^V', rot: alongRot(vx, vy, vz), spin: R(-2, 2),
        color: c0, colorEnd: c1, alpha: 1, alphaEnd: 0, gravity: -12, drag: 1.1,
      });
    }
    // molten blood: hot embers thrown up out of the wound, falling back
    for (let i = 0; i < Math.round(26 * k); i++) {
      const a = rnd() * Math.PI * 2, sp = R(1.5, 6);
      fx.spawn({
        x, y: y + 0.1, z, vx: Math.cos(a) * sp * 0.6 + dx * 1.2, vy: R(3, 9), vz: Math.sin(a) * sp * 0.6 + dz * 1.2,
        life: R(0.4, 0.85), size: R(0.15, 0.3), sizeEnd: 0.05,
        glyph: "*^~'", color: COL.flame, colorEnd: COL.flameEnd, alpha: 1, alphaEnd: 0, gravity: -14, drag: 0.8, spin: R(-5, 5),
      });
    }
    // the shock ring round the skull
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      fx.spawn({
        x: x + Math.cos(a) * 0.4, y: y + 0.15, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * 7 * k, vz: Math.sin(a) * 7 * k,
        life: 0.28, size: 0.28, sizeEnd: 0.1, stretch: 1.6, glyph: '-~', rot: -a, color: c0, colorEnd: c1, alpha: 1, alphaEnd: 0, drag: 6,
      });
    }
    // white-gold sparks off the steel
    this.sparks(x, y + 0.2, z, dx, dz, true, exec);
    // (kept small: a big light here turns the whole wyrm's ASCII art white)
    this._light({ x, y: y + 0.6, z, color: [0.7, 0.95, 1.5], intensity: 3 * k, radius: 6, life: 0.25, fade: 0.22 });
    this._light({ x, y: y + 0.3, z, color: [1.4, 0.5, 0.15], intensity: 2.2 * k, radius: 5, life: 0.6, fade: 0.5 });
  }

  /** Riding the head: embers spurting from the wound round the buried blade (k 0..1 = strength). */
  plungeRide(dt, x, y, z, dx, dz, k = 1) {
    const fx = this.add;
    if (!fx || !(k > 0) || !Number.isFinite(x + y + z)) return;
    this.plAcc += dt * 70 * k;
    while (this.plAcc >= 1) {
      this.plAcc -= 1;
      const a = rnd() * Math.PI * 2, sp = R(0.5, 2.5);
      const cold = rnd() < 0.25;
      fx.spawn({
        x: x + R(-0.15, 0.15), y: y + R(0, 0.2), z: z + R(-0.15, 0.15),
        vx: Math.cos(a) * sp - dx * 0.8, vy: R(2, 6), vz: Math.sin(a) * sp - dz * 0.8,
        life: R(0.3, 0.6), size: R(0.12, 0.24), sizeEnd: 0.04,
        glyph: cold ? "·'" : "*^~'", color: cold ? COL.crit : COL.flame, colorEnd: cold ? COL.critEnd : COL.flameEnd,
        alpha: 1, alphaEnd: 0, gravity: -11, drag: 1, spin: R(-4, 4),
      });
    }
  }

  /** The blade ripped out of the head as he springs off: a gout of embers and a cold flick. */
  plungeRip(x, y, z, dx, dz) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    for (let i = 0; i < 18; i++) {
      const sp = R(2, 6);
      fx.spawn({
        x, y: y + 0.2, z, vx: dx * sp + R(-1.5, 1.5), vy: R(3, 7), vz: dz * sp + R(-1.5, 1.5),
        life: R(0.35, 0.7), size: R(0.15, 0.28), sizeEnd: 0.05,
        glyph: "*^~'", color: COL.flame, colorEnd: COL.flameEnd, alpha: 1, alphaEnd: 0, gravity: -13, drag: 0.8, spin: R(-5, 5),
      });
    }
    fx.spawn({ x, y: y + 0.4, z, life: 0.12, size: 1.3, sizeEnd: 0.3, glyph: '*', color: COL.trailCore, colorEnd: COL.trail, alpha: 1, alphaEnd: 0, rot: R(0, 3) });
    this._light({ x, y: y + 0.5, z, color: [1.3, 0.55, 0.2], intensity: 3, radius: 6, life: 0.3, fade: 0.25 });
  }

  /** Touchdown in front of the head: a dust ring, a low cold ring, a puff where he slides. */
  plungeLand(x, z, dx, dz) {
    const fa = this.alpha, fx = this.add;
    if (!Number.isFinite(x + z)) return;
    if (fa) {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        fa.spawn({
          x: x + Math.cos(a) * 0.3, y: 0.06, z: z + Math.sin(a) * 0.3,
          vx: Math.cos(a) * 2.2 + dx * 1.2, vy: R(0.1, 0.5), vz: Math.sin(a) * 2.2 + dz * 1.2,
          life: R(0.45, 0.7), size: R(0.16, 0.24), sizeEnd: 0.4,
          glyph: '.,:', color: COL.dust, colorEnd: COL.dustEnd, alpha: 0.85, alphaEnd: 0, drag: 3,
        });
      }
    }
    if (fx) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        fx.spawn({
          x: x + Math.cos(a) * 0.2, y: 0.08, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3,
          life: 0.26, size: 0.18, sizeEnd: 0.06, glyph: '-~', rot: -a, color: COL.trail, colorEnd: COL.trailEnd, alpha: 0.85, alphaEnd: 0, drag: 5,
        });
      }
    }
    this.dust(x, z, 8, 1.1);
  }

  /** Charging: cold motes drawn in toward the blade, and past half charge jagged cyan lightning
   *  strokes ('/' '\' '^', 0.1–0.3 m) crawling along the blade and round the hands (rate and
   *  brightness scale with k 0..1). */
  chargeTick(dt, a, b, k) {
    const fx = this.add;
    if (!fx || !(k >= 0)) return;
    this.chargeAcc += dt * (10 + 40 * k);
    while (this.chargeAcc >= 1) {
      this.chargeAcc -= 1;
      const f = R(0.3, 1);
      const px = a.x + (b.x - a.x) * f, py = a.y + (b.y - a.y) * f, pz = a.z + (b.z - a.z) * f;
      if (k > 0.45 && rnd() < 0.35 + 0.4 * k) {
        // a lightning stroke hugging the blade
        const g = R(0, 0.85);
        fx.spawn({
          x: a.x + (b.x - a.x) * g + R(-0.08, 0.08), y: a.y + (b.y - a.y) * g + R(-0.06, 0.1), z: a.z + (b.z - a.z) * g + R(-0.08, 0.08),
          life: R(0.08, 0.18), size: R(0.12, 0.24) * (0.8 + 0.4 * k), sizeEnd: 0.06, rot: R(-0.6, 0.6),
          glyph: "/\\^'", color: COL.trailCore, colorEnd: COL.charge, alpha: 1, alphaEnd: 0, flicker: 0.5,
        });
        continue;
      }
      const ang = rnd() * Math.PI * 2, r = R(0.35, 0.8);
      const ox = Math.cos(ang) * r, oz = Math.sin(ang) * r, oy = R(-0.2, 0.5);
      const life = R(0.22, 0.34);
      fx.spawn({
        x: px + ox, y: py + oy, z: pz + oz,
        vx: -ox / life, vy: -oy / life, vz: -oz / life,
        life, size: R(0.08, 0.13) * (0.8 + 0.5 * k), sizeEnd: 0.03,
        glyph: "·'.+", color: COL.charge, colorEnd: COL.chargeEnd, alpha: 0.5 + 0.5 * k, alphaEnd: 0.1,
      });
    }
  }

  /** Full charge reached: a glint on the blade + a dust ring at the feet (x, z). */
  chargeReady(x, y, z, fx0, fz0) {
    const fx = this.add;
    if (fx) {
      fx.spawn({ x, y, z, life: 0.18, size: 0.75, sizeEnd: 0.15, glyph: '+', color: COL.ghostCore, colorEnd: COL.charge, alpha: 1, alphaEnd: 0, spin: 4 });
      fx.spawn({ x, y, z, life: 0.12, size: 0.35, sizeEnd: 0.8, glyph: '°', color: COL.charge, colorEnd: COL.chargeEnd, alpha: 0.8, alphaEnd: 0 });
    }
    const fa = this.alpha;
    if (fa && Number.isFinite(fx0 + fz0)) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        fa.spawn({
          x: fx0 + Math.cos(a) * 0.3, y: 0.06, z: fz0 + Math.sin(a) * 0.3,
          vx: Math.cos(a) * 1.6, vy: R(0.1, 0.4), vz: Math.sin(a) * 1.6,
          life: R(0.4, 0.6), size: R(0.14, 0.2), sizeEnd: 0.3,
          glyph: '.,:', color: COL.dust, colorEnd: COL.dustEnd, alpha: 0.8, alphaEnd: 0, drag: 3,
        });
      }
    }
    this._light({ x, y, z, color: [0.5, 0.75, 1.4], intensity: 2.2, radius: 4, life: 0.25, fade: 0.2 });
  }

  /**
   * The blade's halo (hero.md §3.2): a sparse field of cold '·' dots on a 0.06 m lattice beside
   * both edges, and a short dot streak 0.2–0.3 m past the steel point (the visible reach of the
   * edge wave). k = strength 0..2 (dim at idle, brighter through strikes and the charge); far
   * 0..1 = close-up … game camera (the dots grow so they still print at 36 m). The blade plane
   * comes from the sword's own matrix.
   * `edge` (the streak, player/streakFx.js; 0 = none, today): a fine steady line of light along the
   * blade's edge from the forte up `edge` of the steel (0..1), at alpha `edgeA`, `top` 0..1 whitening
   * it a little at the top tiers. One stretched stroke a frame, re-spawned on the steel (no velocity).
   * With k = 0 only the edge line is drawn.
   */
  bladeHalo(dt, k, far = 1, edge = 0, edgeA = 0, top = 0) {
    const fx = this.add;
    const sw = this.rig?.sword;
    if (!fx || !sw || !(k > 0 || edge > 0)) return;
    const e = sw.matrixWorld.elements;
    const tip = DIM.drawnTip ?? DIM.steelTip; // the drawn point (model.js), not anim's grass-clamp point
    if (edge > 0) {
      // the edge line: from the forte up the leading (+X) edge, on the bevel (EDGE_GLINT.inset)
      const z0 = DIM.forte, z1 = z0 + (tip - 0.02 - z0) * Math.min(1, edge), zc = (z0 + z1) * 0.5;
      // (just off the steel, past its leading edge: on the steel it vanished into the lit blade the
      // game camera draws; a hair of dark between keeps the blade's own line and its direction)
      const xx = hwAt(zc) + STREAK_EDGE.off * (0.4 + 0.6 * far);
      // (drawn STREAK_EDGE.lift m toward the camera: the particles' soft depth test fades a stroke that
      // lies on the steel's own depth to nothing)
      const cz = CAM, lf = STREAK_EDGE.lift;
      const x = e[0] * xx + e[8] * zc + e[12] + (cz ? cz[8] * lf : 0), y = e[1] * xx + e[9] * zc + e[13] + (cz ? cz[9] * lf : 0), z = e[2] * xx + e[10] * zc + e[14] + (cz ? cz[10] * lf : 0);
      const dl = Math.hypot(e[8], e[9], e[10]) || 1, len = (z1 - z0) * dl;
      const size = 0.075 * (1 + 0.6 * far);
      if (Number.isFinite(x + y + z + len) && len > 0.01 && y > 0.02) {
        const c = STREAK_EDGE, w = Math.min(1, Math.max(0, top));
        c.c[0] = c.lo[0] + (c.hi[0] - c.lo[0]) * w;
        c.c[1] = c.lo[1] + (c.hi[1] - c.lo[1]) * w;
        c.c[2] = c.lo[2] + (c.hi[2] - c.lo[2]) * w;
        // (it is uploaded at the next frame's particle update, drawn that frame and gone at the one after:
        // one stroke on screen at a time, riding the steel a frame behind, as the edge glint does)
        const o = c.o;
        o.x = x; o.y = y; o.z = z; o.life = dt * 1.5; o.size = o.sizeEnd = size;
        o.stretch = Math.min(30, len / size); o.rot = alongRot(e[8] / dl, e[9] / dl, e[10] / dl);
        o.alpha = o.alphaEnd = Math.min(1, edgeA);
        fx.spawn(o);
      }
      if (!(k > 0)) return;
    }
    // the edge-wave: a short bright streak laid along the blade at the drawn point (it sat 0.06–0.26 m
    // past it, × HERO_SCALE: a dash floating off the sword, left behind by every roll and swing)
    this.tipAcc += dt * 14;
    while (this.tipAcc >= 1) {
      this.tipAcc -= 1;
      const zz = tip - R(0.05, 0.12); // the glyph is ~0.15 m long: centred here its far end stops at the point
      const x = e[8] * zz + e[12], y = e[9] * zz + e[13], z = e[10] * zz + e[14];
      const dl = Math.hypot(e[8], e[9], e[10]) || 1;
      if (!Number.isFinite(x + y + z) || y < 0.02) continue;
      fx.spawn({
        x, y, z, life: 0.07, size: 0.1 * (1 + far), sizeEnd: 0.06, glyph: '|', stretch: 1.4,
        rot: alongRot(e[8] / dl, e[9] / dl, e[10] / dl),
        color: COL.tipStreak, colorEnd: COL.halo, alpha: Math.min(1, 0.55 + 0.25 * k), alphaEnd: 0,
      });
    }
    this.haloAcc += dt * (9 + 10 * k);
    if (this.haloAcc < 1) return;
    const L = 0.06;
    while (this.haloAcc >= 1) {
      this.haloAcc -= 1;
      const past = rnd() < 0.3;
      const zz = past ? tip + R(0.0, 0.1) : R(DIM.forte, tip);
      const xx = past ? R(-0.02, 0.02) : (rnd() < 0.5 ? -1 : 1) * R(HALO_X[0], HALO_X[1]);
      // sword space (xx, 0, zz) → world
      const x = e[0] * xx + e[8] * zz + e[12], y = e[1] * xx + e[9] * zz + e[13], z = e[2] * xx + e[10] * zz + e[14];
      if (!Number.isFinite(x + y + z) || y < 0.02) continue;
      fx.spawn({
        x: Math.round(x / L) * L, y: Math.round(y / L) * L, z: Math.round(z / L) * L,
        life: 0.4, size: (past ? 0.09 : 0.08) * (1 + 1.2 * far), sizeEnd: 0.04, glyph: '·',
        color: COL.halo, colorEnd: COL.haloEnd, alpha: Math.min(1, 0.6 + 0.2 * k), alphaEnd: 0,
      });
    }
  }

  /** Crit window open: faint cold motes peeling off the blade. */
  critTick(dt, a, b) {
    const fx = this.add;
    if (!fx) return;
    this.critAcc += dt * 24;
    while (this.critAcc >= 1) {
      this.critAcc -= 1;
      const f = R(0.2, 1);
      fx.spawn({
        x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f,
        vx: R(-0.2, 0.2), vy: R(0.3, 0.8), vz: R(-0.2, 0.2),
        life: R(0.25, 0.45), size: R(0.1, 0.15), sizeEnd: 0.03,
        glyph: "·'", color: COL.crit, colorEnd: COL.critEnd, alpha: 0.9, alphaEnd: 0, drag: 1, flicker: 0.4,
      });
    }
  }

  /** Spray away from the attacker when the hero is hit. (nx, nz) = push direction. */
  hurt(x, y, z, nx, nz, big) {
    const fa = this.alpha, fx = this.add;
    const n = big ? 14 : 8;
    if (fa) {
      for (let i = 0; i < n; i++) {
        const sp = R(1, 3.2);
        fa.spawn({
          x, y: y + R(-0.15, 0.15), z,
          vx: nx * sp + R(-1, 1), vy: R(0.4, 2.2), vz: nz * sp + R(-1, 1),
          life: R(0.35, 0.7), size: R(0.14, 0.24), sizeEnd: 0.06,
          glyph: '.,;', color: COL.ash, colorEnd: COL.ashEnd, alpha: 0.9, alphaEnd: 0, gravity: -6, drag: 1.5,
        });
      }
    }
    if (fx) {
      for (let i = 0; i < (big ? 5 : 3); i++) {
        fx.spawn({
          x, y, z, vx: nx * R(1, 3) + R(-1.5, 1.5), vy: R(0.5, 2.5), vz: nz * R(1, 3) + R(-1.5, 1.5),
          life: R(0.12, 0.25), size: R(0.18, 0.28), sizeEnd: 0.05, glyph: '+x', color: COL.hurt, colorEnd: COL.hurtEnd,
          alpha: 1, alphaEnd: 0, drag: 2, gravity: -4,
        });
      }
    }
  }

  /** Ring of rising gold-green motes the moment a flask takes effect. */
  healBurst(x, z) {
    const fx = this.add;
    if (!fx) return;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + R(-0.1, 0.1);
      const r = R(0.3, 0.5);
      fx.spawn({
        x: x + Math.cos(a) * r, y: R(0.1, 0.5), z: z + Math.sin(a) * r,
        vx: Math.cos(a) * 0.3, vy: R(1.2, 2.2), vz: Math.sin(a) * 0.3,
        life: R(0.7, 1.1), size: R(0.15, 0.22), sizeEnd: 0.05, glyph: '+·', color: COL.heal, colorEnd: COL.healEnd,
        alpha: 1, alphaEnd: 0, drag: 1.2, flicker: 0.3,
      });
    }
  }

  /** Continuous glow while healing (rate scales with k 0..1). */
  healTick(dt, x, z, k) {
    const fx = this.add;
    if (!fx || k <= 0) return;
    this.healAcc += dt * 34 * k;
    while (this.healAcc >= 1) {
      this.healAcc -= 1;
      const a = rnd() * Math.PI * 2, r = R(0.15, 0.45);
      fx.spawn({
        x: x + Math.cos(a) * r, y: R(0.2, 1.5), z: z + Math.sin(a) * r,
        vx: 0, vy: R(0.6, 1.2), vz: 0,
        life: R(0.6, 1.0), size: R(0.12, 0.18), sizeEnd: 0.04, glyph: '+··', color: COL.heal, colorEnd: COL.healEnd,
        alpha: 0.9, alphaEnd: 0, drag: 0.8, flicker: 0.4,
      });
    }
  }

  /** Small flames licking off random body joints while burning (k 0..1). */
  flames(dt, k) {
    const fx = this.add;
    if (!fx || k <= 0) return;
    this.flameAcc += dt * 28 * k;
    const pts = this.rig.fxPoints;
    while (this.flameAcc >= 1) {
      this.flameAcc -= 1;
      const j = pts[(rnd() * pts.length) | 0];
      j.getWorldPosition(this._v);
      fx.spawn({
        x: this._v.x + R(-0.12, 0.12), y: this._v.y + R(-0.08, 0.12), z: this._v.z + R(-0.12, 0.12),
        vx: R(-0.3, 0.3), vy: R(0.9, 1.8), vz: R(-0.3, 0.3),
        life: R(0.25, 0.5), size: R(0.16, 0.26), sizeEnd: 0.05, glyph: "*^~'", color: COL.flame, colorEnd: COL.flameEnd,
        alpha: 1, alphaEnd: 0, drag: 1.2, flicker: 0.4, spin: R(-3, 3),
      });
    }
  }

  /**
   * A sliding contact (the roll's kneel: the shin, the planted foot): a low spray of dust and torn
   * grass kicked off the ground spot (x, z), thrown back against the slide (dx, dz unit) and
   * outward, faster and denser with the slide speed sp (m/s). `slot` keeps one rate accumulator
   * per contact.
   */
  skid(dt, slot, x, z, dx, dz, sp, k = 1) {
    const fx = this.alpha;
    if (!fx || !(sp > 0.3)) return;
    const acc = this.skidAcc;
    acc[slot] += dt * 40 * k * Math.min(1.5, sp / 4);
    while (acc[slot] >= 1) {
      acc[slot] -= 1;
      const s = sp * R(0.15, 0.45), side = R(-0.9, 0.9);
      const grass = rnd() < 0.3;
      fx.spawn({
        x: x + R(-0.08, 0.08), y: R(0.03, 0.12), z: z + R(-0.08, 0.08),
        vx: -dx * s - dz * side, vy: R(0.4, 1.5), vz: -dz * s + dx * side,
        life: R(0.3, 0.6), size: grass ? R(0.12, 0.17) : R(0.14, 0.22), sizeEnd: grass ? 0.08 : R(0.3, 0.42),
        glyph: grass ? "/\\'," : '.,:', color: grass ? COL.grassBit : COL.dust, colorEnd: grass ? COL.grassBitEnd : COL.dustEnd,
        alpha: 0.85, alphaEnd: 0, drag: 2.2, gravity: -2.4, spin: R(-4, 4),
      });
    }
  }

  /**
   * The cut tops fly (world/grass.js mowSwing, GRASS.mow.bits `B`): `n` tiny grass letters off the
   * strip the steel mowed this frame (a -> b on the ground), thrown on along the blade's travel (ux,
   * uz unit) and up, in the grass's own green, falling back fast (the slide's torn grass, COL.grassBit).
   * `top`: the grass's height there (m). The module's own stream: no Math.random.
   */
  mowBits(ax, az, bx, bz, n, ux, uz, top, B) {
    const fx = this.alpha;
    if (!fx || !(n > 0) || !Number.isFinite(ax + az + bx + bz + ux + uz + top)) return;
    const h = Math.max(0.1, top);
    for (let i = 0; i < n; i++) {
      const t = 0.25 + 0.75 * rnd(), f = R(B.fling[0], B.fling[1]), side = R(-0.5, 0.5);
      fx.spawn({
        x: ax + (bx - ax) * t + R(-0.1, 0.1), y: h * R(0.45, 0.9), z: az + (bz - az) * t + R(-0.1, 0.1),
        vx: ux * f - uz * side, vy: R(B.up[0], B.up[1]), vz: uz * f + ux * side,
        life: R(B.life[0], B.life[1]), size: R(B.size[0], B.size[1]), sizeEnd: 0.07,
        glyph: "/\\',|", color: COL.grassBit, colorEnd: COL.grassBitEnd,
        alpha: 0.8, alphaEnd: 0, drag: 2.4, gravity: -3.2, spin: R(-6, 6),
      });
    }
  }

  /** The blade's point dragging in the grass (the roll's slide): cold sparks flicked off it, back
   *  against the slide (dx, dz unit). */
  scrape(dt, x, y, z, dx, dz, sp) {
    const fx = this.add;
    if (!fx || !(sp > 0.3)) return;
    this.scrapeAcc += dt * 30 * Math.min(1.5, sp / 4);
    while (this.scrapeAcc >= 1) {
      this.scrapeAcc -= 1;
      const s = sp * R(0.2, 0.6), side = R(-1.2, 1.2);
      const vx = -dx * s - dz * side, vy = R(0.6, 2.2), vz = -dz * s + dx * side;
      fx.spawn({
        x: x + R(-0.04, 0.04), y: y + R(0, 0.05), z: z + R(-0.04, 0.04),
        vx, vy, vz,
        life: R(0.12, 0.26), size: R(0.08, 0.14), sizeEnd: 0.03,
        glyph: "'|", rot: alongRot(vx, vy, vz), stretch: 0.8,
        color: COL.trailCore, colorEnd: COL.trailEnd, alpha: 1, alphaEnd: 0, drag: 1.5, gravity: -4,
      });
    }
  }

  reset() {
    this.flameAcc = 0;
    this.healAcc = 0;
    this.chargeAcc = 0;
    this.critAcc = 0;
    this.gemAcc = 0;
    this.haloAcc = 0;
    this.gemGlowAcc = 0;
    this.tipAcc = 0;
    this.skidAcc[0] = this.skidAcc[1] = 0;
    this.scrapeAcc = 0;
    this.plAcc = 0;
  }
}
