// THE INSTANT SLASH (ADR-240; the owner, 2026-11-26: "use the current production auto attack combo and remove
// the curvy slashes with the instant slashes", for every attack and the flurry). Where the blade passed,
// ONE STRAIGHT LINE hangs for a moment instead of the curved crescent (fx.js `trail`): thin, sharp at both
// ends, white-hot in the middle, cooling the way the arc cools; the eye gets the line, not the swing. Drawn
// with the arc's own strokes (fx.js `|` strokes in the additive pool, its colours), so it is the same ink as
// the arc it replaces. `?slash=arc` (the Lab's `slash` button) draws the crescent as before.
//
// The line IS the blade's cut, and it comes WITH the swing: the blade's drawn point is followed frame by frame,
// about his chest (a dash, a lunge or the lean into it carries him, it is not the cut); on the first frame the swing has
// ended (the point slows past its fastest step: SWING) the line is drawn the way the point crossed the screen
// over the swing's FASTEST frames (the run of frames moving at least SWING.fast of its fastest step: the cut
// proper, not the raise before it nor the follow-through after). The owner, 2026-11-27: "make sure the angle
// of the slash is accurate to the sword swing and motion ... it looks more off when attacking from the side
// angle or towards the camera": it was the way a point near the HAND crossed the screen, every frame weighed
// by speed and the dash's travel in it; seen side-on or from the front the hand's path is not the blade's
// (15-36° off, the cleave 57°, Whirling Tempest's cuts 35-150°). Per attack, from what it is (combat.js defs,
// the look the animator picked):
//   a cut     the point's way over the fastest frames (above)
//   a turn    (the picked look's `spin`: the whirl, the rising whirl, Whirling Tempest) three straight cuts
//             round him, each the point's way over a third of the swing, drawn together as it ends
//   a thrust  (a clip whose `line` is 'point', or a `thrust` def: the stab, the heavy thrust, the execution)
//             a short streak the way the point drove, as the thrust stops
// Never across him (the owner: the heavy's slash "shows behind the character and i dont like that": a heavy's
// 5.6 m line centred on a contact a metre ahead ran back over his back, the Piercing Gale's streak started
// behind the contact): a line that would pass within END.clear of his chest in the picture is slid along
// itself, away from him. How soft it is: SOFT (`?slashSoft=`).
// The look (SLASH): 'light' for a light attack, 'heavy' for a heavy one (`heavy` on the def: the slam, the
// heavies, the charged cleave, One Breath, the execution): the heavy arc's violet, longer and thicker, the
// camera kicked along the cut with a small shake. Nothing on a dead hero, no allocation a frame, no
// Math.random. The lines were first drawn for the instant cuts of ADR-233 (PR 118, closed); this is their
// drawing, driven by the production attacks.

import { SWINGS } from './swings.js';
import { DIM } from './model.js';
import { ARC_TONE } from './fx.js';
import * as THREE from 'three';

const _pv = new THREE.Vector3(), _OUT = [0, 0, 0], _FW = [0, 0], _CH = [0, 0, 0];

/** 'line' (the default): the instant slash; 'arc': the curved crescent as before. */
export const SLASH_IDS = ['line', 'arc'];
let slashNow = 'line';
export const slashMode = () => slashNow;
/** Pick the look of every swing's mark; false for an unknown id. */
export function setSlash(m) {
  if (!SLASH_IDS.includes(m)) return false;
  slashNow = m;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('slash') : null;
  if (q) setSlash(q);
}

/** THE ENDING SLASH (the owner, 2026-11-26: "I didn't mean the instant slash is showing the sword swing, it should
 *  show at the end like an ending slash feel"; shown all three places and both timings, they picked enemy, as the
 *  swing ends). Where the line is drawn once the swing has ended, the way the sword crossed the screen:
 *    enemy   across what it hit, centred on the contact; a whiff: a shorter line at the target place (default)
 *    target  through the space ahead of him where the foe stands (END.ahead m out, at the cut's height)
 *    body    across him, centred on his chest
 *    blade   along the blade's own path (the first instant slash: the chord of the swing)
 *  and when: '0' as the swing ends (default), 'beat' END.beat s later (the 'already cut' beat, the pose held). */
export const PLACE_IDS = ['enemy', 'target', 'body', 'blade'];
export const BEAT_IDS = ['0', 'beat'];
// (the owner's baseline, 2026-11-26: "combo A with the slash on the enemy", as the swing ends)
let placeNow = 'enemy', beatNow = '0';
export const placeMode = () => placeNow;
export const beatMode = () => beatNow;
export function setPlace(m) {
  if (!PLACE_IDS.includes(m)) return false;
  placeNow = m;
  return true;
}
export function setBeat(m) {
  const id = String(m);
  if (!BEAT_IDS.includes(id)) return false;
  beatNow = id;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  if (q?.get('endslash')) setPlace(q.get('endslash'));
  if (q?.get('endbeat')) setBeat(q.get('endbeat'));
}
/** The ending slash's numbers: `ahead` (m, × his scale) the target place in front of him, `y` the height
 *  range of its middle (m), `len` [light, heavy] its length (m), `thrust` a thrust's, `miss` × the length of
 *  an enemy-placed whiff, `beat` (s) the pause before it in 'beat', `star` (rad) how far a turn's three cuts
 *  are fanned round their middle. */
export const END = { ahead: 1.9, y: [0.55, 1.7], len: [3.6, 5.6], thrust: 2.4, miss: 0.6, beat: 0.12, star: 0, reveal: 3, step: 1 / 60, clear: 1.0, back: 0.15 };
// (`reveal` pieces drawn `step` s apart, from the swing's start to its end: the slash runs the way the sword
// did; `clear` (m, × his scale) no part of it passes nearer than this to his chest in the picture (it slides
// along itself, away from him); `back` the share of a thrust's streak behind its place)

/** HOW SOFT THE SLASH IS (the owner, 2026-11-27: "soften the instant slash effect"). Each level scales the
 *  line's looks (SLASH): `size` its strokes' thickness, `n` how many, `len` its length (END.len, END.thrust,
 *  the blade place's min / max), `life` how long its strokes last, `flash` the white-hot flash's size (0: none),
 *  `hot` how white its middle burns (1 white-hot, 0 its core colour), `bright` × every colour, `alpha` × the
 *  strokes' opacity, `hair` × the hairline's life and `hairA` × its opacity, `rows` the heavy look's rows at
 *  most, `kick` × the heavy's camera kick and shake. '0' = the line as it was (ADR-240). */
export const SOFT = {
  0: { size: 1, n: 1, len: 1, life: 1, flash: 1, hot: 1, bright: 1, alpha: 1, hair: 1, hairA: 1, rows: 3, kick: 1 },
  a: { size: 0.75, n: 0.9, len: 0.85, life: 0.85, flash: 0.6, hot: 0.6, bright: 0.85, alpha: 0.9, hair: 0.65, hairA: 0.75, rows: 3, kick: 0.6 },
  b: { size: 0.55, n: 0.8, len: 0.72, life: 0.75, flash: 0, hot: 0.3, bright: 0.7, alpha: 0.8, hair: 0.45, hairA: 0.6, rows: 1, kick: 0.35 },
  c: { size: 0.4, n: 0.7, len: 0.6, life: 0.65, flash: 0, hot: 0, bright: 0.55, alpha: 0.7, hair: 0.3, hairA: 0.45, rows: 1, kick: 0 },
};
export const SOFT_IDS = ['0', 'a', 'b', 'c'];
let softNow = 'b';
export const softMode = () => softNow;
/** Pick how soft the slash is; false for an unknown id. */
export function setSoft(m) {
  const id = String(m);
  if (!SOFT_IDS.includes(id)) return false;
  softNow = id;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('slashSoft') : null;
  if (q) setSoft(q);
}
const NP = 24; // ending slashes' pieces waiting for their time
const PW = 15; // … the numbers of each

/** The line's looks: strokes, their size at the middle (m), life (s) at the ends … the middle, the
 *  four-frame flash, the hairline that outlasts it, the colours (the arc's: white-hot → its core → the
 *  colour it cools to); `ext` the share of the recorded stretch it is carried on past each end, `min` the
 *  shortest line (m), `max` the longest; `rows` strokes side by side (`gap` m apart on the screen's plane;
 *  the outer ones `outer` × the size, in `edge`'s colour); `hold` the share of its size a stroke still has
 *  at the end of its life and `fade` its opacity then; `kick` the camera's kick along the cut (m) and the
 *  shake on the frame it is drawn; `over` (m): carried on no higher than this over the higher of its two
 *  points, × (1 − its steepness²) (a cut straight down never draws a pillar into the sky); `floor` (m) the
 *  line never goes under; `thrust` (m) a thrust's streak; `ring` the turn's cuts. */
export const SLASH = {
  light: {
    n: 30, size: 0.13, life: [0.14, 0.3], flash: { size: 0.19, life: 0.05 }, hair: { size: 0.045, life: 0.95, alpha: 0.7 },
    hot: [3.0, 3.5, 4.3], core: ARC_TONE.light.core, end: ARC_TONE.light.end, ext: 0.35, min: 1.5, max: 4.2,
    rows: 1, gap: 0, outer: 1, hold: 0.12, fade: 0, kick: null, over: 1.6,
  },
  heavy: {
    n: 44, size: 0.2, life: [0.24, 0.42], flash: { size: 0.26, life: 0.05 }, hair: { size: 0.07, life: 1.3, alpha: 0.8 },
    hot: [2.6, 2.6, 3.6], core: ARC_TONE.heavy.core, end: ARC_TONE.heavy.end, ext: 0.6, min: 3.0, max: 7.0,
    rows: 3, gap: 0.07, outer: 0.8, edge: [0.95, 0.32, 2.5], hold: 0.6, fade: 0.25, kick: { m: 0.08, shake: 0.12 }, over: 2.0,
  },
  floor: 0.08,
  thrust: 0.9,
  ring: 3,
};
const LOOKS = ['light', 'heavy'];
/** When the line is drawn: the swing is followed from `from` × the windup; its fastest frame is looked for
 *  from `peakFrom` × the windup (the active window on); the swing has ended on the first frame after it whose point moves under `end`
 *  of that (the line is drawn then, with the blade); the line starts where the point was just before the
 *  first frame moving `start` of it; at the latest `late` of the recovery in. (The owner, 2026-11-26: the
 *  lines "look out of place and a bit lagged. it should show as soon as the animation swing ends": they
 *  were drawn at the end of the active window, from the frame before it opened.) */
export const SWING = { from: 0.5, peakFrom: 1, end: 0.8, start: 0.3, late: 0.35, bite: 0.05, fast: 0.5, min: 0.35 };
// (`fast`: the cut's way is the point's over the frames moving at least this share of its fastest step, around it;
// `min`: the swing has not ended before this share of the active window (the cleave's release from the coil
// jumps the blade in one frame, and Whirling Tempest slows between its two halves: either read as its end
// drew the line before the cut, the cleave's the wrong way round))
const NB = 64; // frames of the point kept (a swing from late in its windup to its end)

export class SlashFx {
  constructor(player) {
    this.p = player;
    this.game = player.game;
    this.rec = null; // the attack record the line belongs to
    this.kind = 0; // 0 a cut, 1 a turn, 2 a thrust
    this.look = 0;
    this.st = 0; // 0 following the swing, 2 drawn
    this.T = [0, 0, 0];
    this.H = [0, 0, 0];
    this.buf = new Float32Array(NB * 3); // the point, frame by frame
    this.rel = new Float32Array(NB * 3); // … from his chest (a dash's, a lunge's or a lean's travel is not the cut)
    this.tim = new Float32Array(NB); // … the attack clock then
    this.spd = new Float32Array(NB); // … and how far it moved that frame, about his chest
    this.nb = 0;
    this.peak = 0; // the fastest frame's step, and its index
    this.pi = -1;
    this.lastT = -1;
    this.W = 0; // the attack's windup (s)
    this.pend = new Float32Array(NP * PW); // ax ay az bx by bz, the time it is drawn at, thrust, kick, look, the piece [f0, f1), kind, its span
    this._dly = 0;
    this.np = 0;
    this.hitRec = null; // the attack that landed, and where (the enemy place)
    this.hit = [0, 0, 0];
    player.game?.events?.on?.('player:hitDragon', (e) => {
      const at = this.p.atk, q = e?.point;
      if (!at || !q || !Number.isFinite(q.x + q.y + q.z) || this.hitRec === at) return;
      this.hitRec = at;
      this.hit[0] = q.x;
      this.hit[1] = q.y;
      this.hit[2] = q.z;
    });
    this.span = [0, 0]; // the attack clock over the frames the line's way was taken from (tests)
    this.lines = 0; // drawn so far (tests)
    this.last = new Float32Array(8); // the last line drawn: its ends, heavy, the kind (tests)
    this.kicks = 0;
    /** Tests: (ax, ay, az, bx, by, bz, look, kind, t0, t1) as each line is decided (t0 … t1: the attack clock
     *  over the frames its way was taken from). */
    this.onLine = null;
    this._hot = [0, 0, 0]; // the look's colours at the softness now (SOFT)
    this._core = [0, 0, 0];
    this._cool = [0, 0, 0];
    this._edge = [0, 0, 0];
    this._o = { x: 0, y: 0, z: 0, life: 0.2, size: 0.1, sizeEnd: 0.02, glyph: '|', rot: 0, stretch: 1, color: SLASH.light.core, colorEnd: SLASH.light.end, alpha: 1, alphaEnd: 0, drag: 0 };
  }

  /** Does this attack draw its line here (player.js: then no crescent behind the blade)? */
  owns(at) {
    // (a deathblow's swing draws no blade line of its own, neither this line nor the arc: the owner found the
    // big slashes across the screen distracting; the deathblow's hit effect marks the cut, deathblowFx.js)
    if (at?.rip?.db) return true;
    return slashNow === 'line' && !!at?.def;
  }

  _blade() {
    const e = this.p.rig?.sword?.matrixWorld?.elements;
    if (!e) return false;
    // (the DRAWN point, model.js: the line sits on the steel the eye sees, not on the hit's reach past it)
    const zt = DIM.drawnTip, zh = DIM.bladeBase, T = this.T, H = this.H;
    T[0] = e[8] * zt + e[12];
    T[1] = e[9] * zt + e[13];
    T[2] = e[10] * zt + e[14];
    H[0] = e[8] * zh + e[12];
    H[1] = e[9] * zh + e[13];
    H[2] = e[10] * zh + e[14];
    return Number.isFinite(T[0] + T[1] + T[2] + H[0] + H[1] + H[2]);
  }

  /** His chest's world place now (the rig's chest; his root's, 1.2 m up, without one) → _CH. The swing is
   *  followed from it: a lunge, a dash, a hop or the lean into the cut carries the blade with him, the cut is the
   *  blade's way about him (as the eye follows him: the camera does). */
  _chest() {
    const e = this.p.rig?.chest?.matrixWorld?.elements, pp = this.p.position;
    if (e && Number.isFinite(e[12] + e[13] + e[14])) {
      _CH[0] = e[12];
      _CH[1] = e[13];
      _CH[2] = e[14];
    } else {
      _CH[0] = pp.x;
      _CH[1] = pp.y + 1.2;
      _CH[2] = pp.z;
    }
    return _CH;
  }

  /** Per frame, after the pose and the sweep (player.js _combat). */
  update() {
    if (this.np) this._flush();
    const P = this.p, at = P.atk, d = at?.def;
    if (slashNow !== 'line' || !(P.hp > 0) || !d || (P.state !== 'attack' && P.state !== 'heavy') || at.pending || at.rip?.db) {
      this.rec = null;
      return;
    }
    if (!this._blade()) return;
    if (this.rec !== at) {
      this.rec = at;
      this.st = 0;
      this.nb = 0;
      this.peak = 0;
      this.pi = -1;
      this.lastT = -1;
      this.W = d.windup;
      // what it is: the look the animator picked (a variant may turn or not)
      const an = P.anim?.atkDef === d && P.anim.atkAnim ? P.anim.atkAnim : d.anim;
      const C = an?.clip ? SWINGS[an.clip] : null;
      this.kind = d.kind === 'thrust' || an?.kind === 'thrust' || C?.line === 'point' ? 2 : an?.spin ? 1 : 0;
      this.look = d.heavy ? 1 : 0;
    }
    const W = d.windup, Ac = d.active, R = d.recovery, t = at.t;
    // (the point is followed from late in the windup; a frozen frame, the hit-pause, moves nothing)
    if (this.st === 2 || t < SWING.from * W || t === this.lastT) return;
    this.lastT = t;
    const T = this.T, B = this.buf, Rl = this.rel, n = this.nb, pp = this._chest();
    const rx = T[0] - pp[0], ry = T[1] - pp[1], rz = T[2] - pp[2];
    const sp = n > 0 ? Math.hypot(rx - Rl[n * 3 - 3], ry - Rl[n * 3 - 2], rz - Rl[n * 3 - 1]) : 0;
    if (!Number.isFinite(sp)) return;
    if (n < NB) {
      B[n * 3] = T[0];
      B[n * 3 + 1] = T[1];
      B[n * 3 + 2] = T[2];
      Rl[n * 3] = rx;
      Rl[n * 3 + 1] = ry;
      Rl[n * 3 + 2] = rz;
      this.tim[n] = t;
      this.spd[n] = sp;
      this.nb = n + 1;
    }
    // the swing: its fastest frame from the windup's end on; it has ENDED on the first frame after that
    // peak (the cut proper: from the active window on) whose point moves under SWING.end of it (at the latest SWING.late of the recovery in)
    if (t >= SWING.peakFrom * W && sp > this.peak) {
      this.peak = sp;
      this.pi = this.nb - 1;
    }
    // (not while a landed blow's bite holds the blade, anim.js BITE: the hit-pause and the bite slow it for a
    // few frames at the contact; read as the swing's end, the line came at the contact from the windup's last
    // motion only: a chop's raise drew its line upward)
    const biting = at.hitAt >= 0 && t - at.hitAt < SWING.bite;
    // a landed cut (not a turn, which carries on round him): drawn as the bite lets go, once the point is no
    // longer at its fastest (or the active window is over: the catch-up after the bite may not slow), and no
    // sooner than SWING.min of the active window (a blow that meets him as it starts has not swung yet); its
    // way the point's over the fastest frames so far. (It waited for the swing to slow below SWING.end of its
    // fastest step, which the catch-up after the bite never does: it came at the latest, 0.15 s after the contact)
    const cut = this.kind !== 1 && at.hitAt >= 0 && !biting && t >= W + SWING.min * Ac && (sp < this.peak || t >= W + Ac) && this._fast() >= 2;
    const ended = cut || (!biting && t >= W + SWING.min * Ac && this.pi >= 0 && this.nb - 1 > this.pi && sp < SWING.end * this.peak);
    if (!ended && t < W + Ac + SWING.late * R && this.nb < NB) return;
    this.st = 2;
    if (!(this.peak > 0)) return;
    if (this.kind === 2) this._streak(SLASH.thrust * (this.look ? 1.4 : 1));
    else if (this.kind === 1) {
      // a turn: three straight cuts between points evenly along the stretch from the first frame moving at
      // least SWING.start of its fastest step to where the point is now
      let s = 0;
      while (s < this.pi && this.spd[s] < SWING.start * this.peak) s++;
      const a = Math.max(0, s - 1), e = this.nb - 1;
      const k = SLASH.ring;
      for (let j = 1; j <= k; j++) {
        const i0 = Math.round(a + ((e - a) * (j - 1)) / k), i1 = Math.round(a + ((e - a) * j) / k);
        if (i1 > i0) this._swing(i0, i1, j === 1, (j - 1) * END.reveal * END.step);
      }
    } else {
      // a cut: the point's way over the swing's fastest frames
      this._fast();
      this._swing(_FW[0], _FW[1], true, 0);
    }
  }

  /** The swing's fastest frames → _FW: the frame before the first and the last of the run of frames round the
   *  fastest one moving at least SWING.fast of its step. The run's steps. */
  _fast() {
    const S = this.spd, e = this.nb - 1;
    let pk = this.peak, pi = this.pi;
    if (!(pi >= 1 && pi <= e)) {
      pk = 0;
      pi = -1;
      const w0 = SWING.peakFrom * (this.W || 0) - 1e-6;
      for (let i = 1; i <= e; i++) {
        if (this.tim[i] >= w0 && S[i] > pk) {
          pk = S[i];
          pi = i;
        }
      }
      if (pi < 0) {
        _FW[0] = Math.max(0, e - 1);
        _FW[1] = e;
        return 0;
      }
    }
    const k = SWING.fast * pk;
    let i0 = Math.max(1, pi), i1 = i0;
    while (i0 > 1 && S[i0 - 1] >= k) i0--;
    while (i1 < e && S[i1 + 1] >= k) i1++;
    _FW[0] = i0 - 1;
    _FW[1] = Math.min(e, i1);
    return _FW[1] - _FW[0];
  }

  /** The way the point went from buffered frame i0 to i1 (about his chest, drawn where he stands now) across
   *  the screen, as a world direction in the screen's plane → _OUT; false when it barely moved there. */
  _way(i0, i1) {
    const R = this.rel, cam = this.game?.camera, pp = this._chest();
    if (!cam) return false;
    _pv.set(pp[0] + R[i0 * 3], pp[1] + R[i0 * 3 + 1], pp[2] + R[i0 * 3 + 2]).project(cam);
    const x0 = _pv.x, y0 = _pv.y;
    _pv.set(pp[0] + R[i1 * 3], pp[1] + R[i1 * 3 + 1], pp[2] + R[i1 * 3 + 2]).project(cam);
    const sx = (_pv.x - x0) * (cam.aspect || 1), sy = _pv.y - y0;
    return Math.hypot(sx, sy) > 2e-3 && this._screen(sx, sy);
  }

  /** A cut from buffered frame i0 to i1: along the blade's point (the `blade` place), or, at every other
   *  place, the way the point crossed the screen between them (straight at the camera: its 3D way). */
  _swing(i0, i1, kick, delay) {
    this._dly = delay;
    this.span[0] = this.tim[i0];
    this.span[1] = this.tim[i1];
    const B = this.buf;
    if (placeNow === 'blade') this._cut(B[i0 * 3], B[i0 * 3 + 1], B[i0 * 3 + 2], B[i1 * 3], B[i1 * 3 + 1], B[i1 * 3 + 2], kick);
    else {
      const ax = B[i0 * 3], ay = B[i0 * 3 + 1], az = B[i0 * 3 + 2], R = this.rel;
      if (this._way(i0, i1)) this._end(ax, ay, az, ax + _OUT[0], ay + _OUT[1], az + _OUT[2], false, kick);
      else this._end(ax, ay, az, ax + R[i1 * 3] - R[i0 * 3], ay + R[i1 * 3 + 1] - R[i0 * 3 + 1], az + R[i1 * 3 + 2] - R[i0 * 3 + 2], false, kick);
    }
    this._dly = 0;
  }

  /** A direction across the screen (sx right, sy up, in pixels' proportions) as a world direction in the
   *  screen's plane → _OUT; false when there is none. */
  _screen(sx, sy) {
    const C = this.game?.camera?.matrixWorld?.elements, l = Math.hypot(sx, sy);
    if (!C || !(l > 1e-9)) return false;
    sx /= l;
    sy /= l;
    _OUT[0] = C[0] * sx + C[4] * sy;
    _OUT[1] = C[1] * sx + C[5] * sy;
    _OUT[2] = C[2] * sx + C[6] * sy;
    return Number.isFinite(_OUT[0] + _OUT[1] + _OUT[2]);
  }

  /** The line through the point's two places, carried on past both (no shorter than its min), kept off
   *  the ground and under its ceiling. `kick`: this line may kick the camera (a turn's first cut only). */
  _cut(x0, y0, z0, x1, y1, z1, kick) {
    const L = SLASH[LOOKS[this.look]];
    let dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const d = Math.hypot(dx, dy, dz);
    if (!(d > 1e-3)) return;
    dx /= d;
    dy /= d;
    dz /= d;
    const sl = (SOFT[softNow] ?? SOFT[0]).len;
    const len = Math.min(L.max * sl, Math.max(L.min * sl, d * (1 + 2 * L.ext)));
    const pad = (len - d) / 2;
    let s0 = -pad, s1 = d + pad; // along the line from the first point
    if (Math.abs(dy) > 1e-6) {
      const sF = (SLASH.floor - y0) / dy; // where it meets the floor
      if (dy < 0) s1 = Math.min(s1, sF);
      else s0 = Math.max(s0, sF);
      const sT = (Math.max(y0, y1) + L.over * (1 - dy * dy) - y0) / dy; // where it reaches its ceiling
      if (dy > 0) s1 = Math.min(s1, sT);
      else s0 = Math.max(s0, sT);
    } else if (y0 < SLASH.floor) return;
    if (!(s1 - s0 > 0.2)) return;
    this._end(x0 + dx * s0, y0 + dy * s0, z0 + dz * s0, x0 + dx * s1, y0 + dy * s1, z0 + dz * s1, false, kick);
  }

  /** A thrust: a short streak the way the point drove (the `blade` place: straight on off the point, along the
   *  blade). */
  _streak(len) {
    const T = this.T, H = this.H, cam = this.game?.camera;
    if (placeNow !== 'blade' && cam) {
      this._fast();
      this.span[0] = this.tim[_FW[0]];
      this.span[1] = this.tim[_FW[1]];
      if (this._way(_FW[0], _FW[1])) {
        this._end(T[0], T[1], T[2], T[0] + _OUT[0] * len, T[1] + _OUT[1] * len, T[2] + _OUT[2] * len, true, true);
        return;
      }
      // (a thrust straight at the camera: the blade's own way across the screen, through the camera's projection)
      _pv.set(H[0], H[1], H[2]).project(cam);
      const hx = _pv.x, hy = _pv.y;
      _pv.set(T[0], T[1], T[2]).project(cam);
      if (this._screen((_pv.x - hx) * (cam.aspect || 1), _pv.y - hy)) {
        this._end(T[0], T[1], T[2], T[0] + _OUT[0] * len, T[1] + _OUT[1] * len, T[2] + _OUT[2] * len, true, true);
        return;
      }
    }
    let dx = T[0] - H[0], dy = T[1] - H[1], dz = T[2] - H[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l;
    dy /= l;
    dz /= l;
    this._end(T[0], T[1], T[2], T[0] + dx * len, T[1] + dy * len, T[2] + dz * len, true, true);
  }

  /** The ending slash: the cut's line (a → b) moved to its place (placeNow) at the cut's angle, kept off the
   *  floor, drawn now or after the beat (beatNow). */
  _end(ax, ay, az, bx, by, bz, thrust, kick) {
    if (placeNow !== 'blade') {
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const l = Math.hypot(dx, dy, dz);
      if (!(l > 1e-4)) return;
      dx /= l;
      dy /= l;
      dz /= l;
      // (laid in the screen's plane: the slash crosses the picture the way the sword did, whatever its
      // depth; a cut toward or away from the camera no longer turns into a stub, or its mirror)
      const C = this.game?.camera?.matrixWorld?.elements;
      if (C) {
        const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6], sl = Math.hypot(sx, sy);
        if (sl > 0.05) {
          dx = (C[0] * sx + C[4] * sy) / sl;
          dy = (C[1] * sx + C[5] * sy) / sl;
          dz = (C[2] * sx + C[6] * sy) / sl;
        }
      }
      const P = this.p, sc = P.drawScale || 1, E = END;
      let cx, cy, cz, L = (thrust ? E.thrust : E.len[this.look]) * sc * (SOFT[softNow] ?? SOFT[0]).len;
      const ch = P.rig?.chest?.matrixWorld?.elements;
      if (placeNow === 'body' && ch) {
        cx = ch[12];
        cy = ch[13];
        cz = ch[14];
      } else if (placeNow === 'enemy' && this.hitRec === this.rec) {
        cx = this.hit[0];
        cy = this.hit[1];
        cz = this.hit[2];
      } else {
        const y = P.yaw ?? 0;
        cx = P.position.x + Math.sin(y) * E.ahead * sc;
        cz = P.position.z + Math.cos(y) * E.ahead * sc;
        cy = Math.min(E.y[1] * sc, Math.max(E.y[0] * sc, (ay + by) / 2));
        if (placeNow === 'enemy') L *= E.miss;
      }
      if (!Number.isFinite(cx + cy + cz)) return;
      // (a thrust's streak runs on from just behind the place; a cut is centred on it)
      const f0 = thrust ? -E.back : -0.5, f1 = thrust ? 1 - E.back : 0.5;
      let s0 = f0 * L, s1 = f1 * L;
      if (placeNow !== 'body' && C) {
        // never across him on the screen: slid along itself, away from him, until no part of it passes nearer
        // than END.clear to his chest in the picture (in the screen's plane)
        const ex = (ch ? ch[12] : P.position.x) - cx, ey = (ch ? ch[13] : P.position.y + 1.2) - cy, ez = (ch ? ch[14] : P.position.z) - cz;
        const ux = ex * C[0] + ey * C[1] + ez * C[2], uy = ex * C[4] + ey * C[5] + ez * C[6];
        const lx = dx * C[0] + dy * C[1] + dz * C[2], ly = dx * C[4] + dy * C[5] + dz * C[6], ll = Math.hypot(lx, ly);
        const R = E.clear * sc, q = ll > 1e-3 ? Math.abs(ux * ly - uy * lx) / ll : Infinity;
        if (q < R) {
          // (his place along the line, and the stretch of it within R of him, in the line's own metres)
          const sm = (ux * lx + uy * ly) / (ll * ll), wm = Math.sqrt(R * R - q * q) / ll;
          const m = sm >= (s0 + s1) / 2 ? Math.min(0, sm - wm - s1) : Math.max(0, sm + wm - s0);
          s0 += m;
          s1 += m;
        }
      }
      if (Math.abs(dy) > 1e-6) {
        const sF = (SLASH.floor - cy) / dy;
        if (dy < 0) s1 = Math.min(s1, sF);
        else s0 = Math.max(s0, sF);
      } else if (cy < SLASH.floor) return;
      if (!(s1 - s0 > 0.2)) return;
      ax = cx + dx * s0;
      ay = cy + dy * s0;
      az = cz + dz * s0;
      bx = cx + dx * s1;
      by = cy + dy * s1;
      bz = cz + dz * s1;
    }
    // drawn in END.reveal pieces END.step apart from where the swing began (a) to where it ended (b): the slash
    // runs the sword's way; after the beat (beatNow) and a turn's later cuts' delay
    const now = this.game?.time ?? 0, t0 = now + (beatNow === 'beat' ? END.beat : 0) + (this._dly || 0), R = Math.max(1, END.reveal | 0);
    for (let i = 0; i < R; i++) {
      const f0 = i / R, f1 = (i + 1) / R, at = t0 + i * END.step;
      if (!(at > now)) {
        this._draw(ax, ay, az, bx, by, bz, thrust, kick && i === 0, f0, f1);
        continue;
      }
      if (this.np >= NP) return;
      const o = this.np++ * PW, Q = this.pend;
      Q[o] = ax;
      Q[o + 1] = ay;
      Q[o + 2] = az;
      Q[o + 3] = bx;
      Q[o + 4] = by;
      Q[o + 5] = bz;
      Q[o + 6] = at;
      Q[o + 7] = thrust ? 1 : 0;
      Q[o + 8] = kick && i === 0 ? 1 : 0;
      Q[o + 9] = this.look;
      Q[o + 10] = f0;
      Q[o + 11] = f1;
      Q[o + 12] = this.kind;
      Q[o + 13] = this.span[0];
      Q[o + 14] = this.span[1];
    }
  }

  /** The ending slashes whose beat is up (dropped if he has died since). */
  _flush() {
    const Q = this.pend, now = this.game?.time ?? 0, alive = this.p.hp > 0;
    for (let i = 0; i < this.np; ) {
      const o = i * PW;
      if (alive && now < Q[o + 6]) {
        i++;
        continue;
      }
      if (alive) {
        const look = this.look, kind = this.kind, s0 = this.span[0], s1 = this.span[1];
        this.look = Q[o + 9];
        this.kind = Q[o + 12];
        this.span[0] = Q[o + 13];
        this.span[1] = Q[o + 14];
        this._draw(Q[o], Q[o + 1], Q[o + 2], Q[o + 3], Q[o + 4], Q[o + 5], Q[o + 7] > 0, Q[o + 8] > 0, Q[o + 10], Q[o + 11]);
        this.look = look;
        this.kind = kind;
        this.span[0] = s0;
        this.span[1] = s1;
      }
      const l = --this.np * PW;
      for (let k = 0; k < PW; k++) Q[o + k] = Q[l + k];
    }
  }

  /** Draw the line a → b, or its piece [f0, f1) of it (the strokes of the whole line that fall there). */
  _draw(ax, ay, az, bx, by, bz, thrust, kick, f0 = 0, f1 = 1) {
    const look = this.look, Lk = SLASH[LOOKS[look]];
    if (f0 <= 0) {
      this.onLine?.(ax, ay, az, bx, by, bz, LOOKS[look], this.kind, this.span[0], this.span[1]);
      const la = this.last;
      la[0] = ax;
      la[1] = ay;
      la[2] = az;
      la[3] = bx;
      la[4] = by;
      la[5] = bz;
      la[6] = look;
      la[7] = this.kind;
      this.lines++;
    }
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-4)) return;
    dx /= len;
    dy /= len;
    dz /= len;
    // the weight of a heavy line: the picture thrown along the cut, a small shake
    const K = Lk.kick, S = SOFT[softNow] ?? SOFT[0];
    if (K && kick && S.kick > 0) {
      const g = this.game;
      g?.kick?.(dx, dy, dz, K.m * S.kick);
      g?.shake?.(K.shake * S.kick);
      this.kicks++;
    }
    // the look's colours at this softness: the white-hot middle toward the core (S.hot), all of it dimmed (S.bright)
    const hot = this._hot, core = this._core, cool = this._cool, edge = this._edge, Le = Lk.edge ?? Lk.core;
    for (let c = 0; c < 3; c++) {
      hot[c] = (Lk.core[c] + (Lk.hot[c] - Lk.core[c]) * S.hot) * S.bright;
      core[c] = Lk.core[c] * S.bright;
      cool[c] = Lk.end[c] * S.bright;
      edge[c] = Le[c] * S.bright;
    }
    const fx = this.p.fx?.add;
    if (!fx?.spawn) return;
    const cx = (ax + bx) / 2, cy = (ay + by) / 2, cz = (az + bz) / 2;
    // the stroke's turn on the screen (as fx.js alongRot), and the screen's across (for the rows)
    const C = this.game?.camera?.matrixWorld?.elements;
    let rot = Math.atan2(dy, dx) - Math.PI / 2;
    let px = 0, py = 1, pz = 0;
    if (C) {
      const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6];
      if (sx * sx + sy * sy > 1e-10) rot = Math.atan2(sy, sx) - Math.PI / 2;
      const qx = dy * C[10] - dz * C[9], qy = dz * C[8] - dx * C[10], qz = dx * C[9] - dy * C[8], ql = Math.hypot(qx, qy, qz);
      if (ql > 1e-6) {
        px = qx / ql;
        py = qy / ql;
        pz = qz / ql;
      }
    }
    // (a thrust's streak: fewer strokes, thinner, sharp toward its far end)
    const n = thrust ? Math.max(8, Math.round(Lk.n * 0.4 * S.n)) : Math.max(8, Math.round(Lk.n * S.n));
    const o = this._o, seg = len / n, k0 = (thrust ? 0.75 : 1) * S.size, kh = (thrust ? 0.75 : 1) * Math.sqrt(S.size);
    const rows = thrust ? 1 : Math.max(1, Math.min(Lk.rows | 0, S.rows | 0));
    o.rot = rot;
    o.colorEnd = cool;
    for (let r = 0; r < rows; r++) {
      // (the middle row is the line; the rows beside it thinner, shorter, no flash, no hairline)
      const mid = (rows - 1) / 2, off = rows > 1 ? (r - mid) * Lk.gap : 0, side = off !== 0, k = side ? k0 * Lk.outer : k0;
      const wMin = side ? 0.3 + (0.25 * Math.abs(r - mid)) / mid : 0;
      for (let pass = 0; pass < 3; pass++) {
        if (side && pass > 0) break;
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n, s = (f - 0.5) * len;
          if (f < f0 || f >= f1) continue;
          const y = cy + dy * s + py * off;
          if (y < SLASH.floor) continue;
          // sharp at both ends (a thrust: full at the point, sharp at its far end)
          const w = thrust ? Math.pow(Math.max(0, 1 - f), 0.6) : Math.pow(Math.sin(Math.PI * f), 0.7);
          if (side && w < wMin) continue;
          o.x = cx + dx * s + px * off;
          o.y = y;
          o.z = cz + dz * s + pz * off;
          if (pass === 0) {
            const size = Lk.size * k * (0.25 + 0.75 * w);
            o.size = size;
            o.sizeEnd = size * Lk.hold;
            o.stretch = Math.min(30, (seg / size) * 1.8);
            o.life = (Lk.life[0] + (Lk.life[1] - Lk.life[0]) * w) * (side ? 0.9 : 1) * S.life;
            o.alphaEnd = Lk.fade;
            o.color = side ? edge : w > 0.92 ? hot : core;
            o.alpha = (0.55 + 0.45 * w) * (side ? 0.7 : 1) * S.alpha;
          } else if (pass === 2) {
            // the flash: for a few frames the middle of the line is a blade of light
            if (w < 0.55 || !(S.flash > 0)) continue;
            o.size = Lk.flash.size * k * w * S.flash;
            o.sizeEnd = Lk.size * k;
            o.stretch = Math.min(30, (seg / o.size) * 1.8);
            o.life = Lk.flash.life;
            o.color = hot;
            o.alpha = S.alpha;
            o.alphaEnd = 0;
          } else {
            // the hairline: thinner, fainter, the last of it to go (the lines of a chain hang together)
            const kk = side ? k : (kh * k) / k0;
            o.size = Lk.hair.size * kk;
            o.sizeEnd = Lk.hair.size * kk * 0.5;
            o.stretch = Math.min(40, (seg / o.size) * 1.6);
            o.life = Lk.hair.life * (0.6 + 0.4 * w) * S.hair;
            o.color = core;
            o.alpha = Lk.hair.alpha * w * S.hairA;
            o.alphaEnd = 0;
          }
          fx.spawn(o);
        }
      }
    }
  }
}
