// The hero's standing stances (ADR-114; the owner's pick of three rendered options, "A · At
// ease"), the life in them, and the STANCE SETS a move style brings (styles/index.js): anim.js
// stand() writes them over guard()'s ready stance for the hero's animator only, blended by the
// animator's fightW:
//
//   AT EASE   nothing to fight. He stands tall and a little side-on with the weight on the rear
//             leg; the sword arm hangs loose and the blade carries on down the arm's own line, out
//             to his front-right with the point a hand above the grass; the free hand rests on the
//             belt.
//   FIGHT     locked on, or a boss fight under way (HeroAnimator.update). A fencer's guard: the
//             sword side turned to the foe and stepped forward, the arm half extended with the
//             blade straight off the forearm, its point on the foe; the free hand stays on the belt.
//
// Why (Session 51, the owner on the stance before it: "something about the current idle animation
// is bothering me"; ticked: a stiff, bent sword wrist; arms that hang like a mannequin's; a statue):
// the old ready stance held the blade 27° out of line with the forearm from an elbow tucked at the
// ribs, both hands hung beside the hips at one height, and over a breath nothing travelled more
// than 1-3 cm, under half a pixel at the game camera.
//
// THE SETS (a style's `stances`: { ease: [STANCE], fight: [STANCE] }, styles/STANCES.md): per set
// the animator holds one STANCE for a random dwell, then cross-fades to another (stanceStep below,
// run once a frame by HeroAnimator.update). Today's style brings none: TODAY_SETS, the two above,
// one stance a set, so nothing is ever picked and the pose is today's exactly.
//
// Pose space: body axes (x = his left, y up, z ahead); hand targets are offsets from each shoulder
// (anim.js). Every other clip, and a duelist's footwork, keeps guard() as its base.
import { DIM } from './heroDims.js';
// (no import of styles/: a style file may import this one)
import { set3, dir, handBelt, standLife, STAND_LIFE, BELT, smoother } from './poseKit.js';
import { streakTier } from '../../combat/streak.js';

export { STAND_LIFE, BELT };
const ANK = DIM.ankle;

/** AT EASE (see the header). P = anim.js's channel map; A = the animator (its time). */
export function atEase(p, P, A) {
  const m = standLife(A.time, STAND_LIFE.breath[0]);
  p[P.bodyX] = -0.028 - 0.022 * m.sw; // the hips over the rear (right) leg; the weight settles
  p[P.bodyY] = -0.012 + 0.007 * m.br;
  p[P.bodyZ] = -0.012;
  p[P.pelvX] = 0;
  p[P.pelvY] = -0.24; // the left hip ahead: a little side-on
  p[P.pelvZ] = -0.05 - 0.022 * m.sw; // the weight hip rides higher
  p[P.spX] = -0.025 + 0.024 * m.br; // the chest open; it rises with the breath
  p[P.spY] = 0.1;
  p[P.spZ] = 0.05 + 0.02 * m.sw; // the shoulders tilt against the hips
  p[P.hdX] = 0.02 - 0.02 * m.br; // the head up (the old stance bowed it)
  p[P.hdY] = 0.14 + 0.16 * m.look; // the eyes wander over the field
  p[P.hdZ] = -0.03 - 0.01 * m.sw;
  // the sword arm: the upper arm hangs a little out and back, the elbow soft (~137°), and the
  // forearm lies on the blade's own line (about 6° between them; the old stance: 27°)
  set3(p, P.rH, -0.172 + 0.006 * m.tipB, -0.478 + 0.012 * m.brL, 0.04 + 0.01 * m.tipA);
  set3(p, P.rP, 0.55, -0.25, -0.8);
  // the blade: down and out to his front-right, the point a hand above the grass; it drifts in a
  // slow lazy figure and lifts a little as the chest fills
  dir(p, P.swD, -56 + 3.2 * m.tipA, -55 + 2.4 * m.tipB + 1.2 * m.brL);
  // the flat to the front and the back, square to the blade: as broad as a blade this steep can be
  // to the game camera on all four sides of him (≥ 0.29 of its width; tipped 6° it showed 0.19 to one)
  set3(p, P.swF, 0.62, -0.05, 0.79);
  handBelt(p, m, p[P.pelvY] + p[P.spY]);
  set3(p, P.rF, -0.135, ANK, -0.09); // the weight leg under the hips, the toes out
  set3(p, P.lF, 0.13, ANK, 0.15); // the left foot ahead, the knee soft
  set3(p, P.rK, -0.5, 0.05, 1);
  set3(p, P.lK, 0.2, 0.05, 1);
  p[P.rFy] = -0.6;
  p[P.lFy] = 0.12;
  p[P.footFlat] = 0.95;
}

/** FIGHT, the fencer's guard (see the header). The point draws a slow small circle on the foe. */
export function fencerGuard(p, P, A) {
  const m = standLife(A.time, STAND_LIFE.breath[1]);
  p[P.bodyX] = 0.0 - 0.01 * m.sw;
  p[P.bodyY] = -0.06 + 0.006 * m.br; // the knees soft
  p[P.bodyZ] = 0.0 + 0.012 * m.dr; // the weight rides a little on and off the front foot
  p[P.pelvX] = 0;
  // the sword side to the foe: half of the turn in the hips, half in the waist (all of it in the
  // hips, 24°, a light's windup whipped them 16.8° in its first frame)
  p[P.pelvY] = 0.26;
  p[P.pelvZ] = 0.02;
  p[P.spX] = 0.0 + 0.02 * m.br;
  p[P.spY] = 0.25;
  p[P.spZ] = -0.03;
  p[P.hdX] = 0.03 - 0.012 * m.br;
  p[P.hdY] = -0.44; // the eyes stay on the foe over the sword shoulder
  p[P.hdZ] = 0.02;
  set3(p, P.rH, -0.1 + 0.005 * m.tipB, -0.215 + 0.012 * m.brL, 0.35 + 0.008 * m.tipA);
  set3(p, P.rP, 0.06, -0.9, -0.45); // the elbow down under the hand, in beside the ribs: the forearm on the blade's line
  // (a little out to the sword side and up: straight ahead, the blade stood behind his own head
  // from the game camera behind him)
  dir(p, P.swD, -9 + 2.4 * m.tipA, 13 + 2.2 * m.tipB + 1.2 * m.brL);
  // the flat up: broad to the game camera from every side (edge up, it vanished from behind)
  set3(p, P.swF, 0.25, 1, 0);
  handBelt(p, m, p[P.pelvY] + p[P.spY]);
  set3(p, P.rF, -0.1, ANK, 0.25); // the sword foot forward
  set3(p, P.lF, 0.11, ANK, -0.22); // the rear foot turned out
  set3(p, P.rK, -0.4, 0, 1);
  set3(p, P.lK, 0.75, 0, 0.65);
  // (the front toes out as the swings' own stance has them: pointed straight at the foe, the foot
  // already stood past a light's pivot and did not turn with it)
  p[P.rFy] = -0.45;
  p[P.lFy] = 0.95;
  p[P.footFlat] = 0.95;
}

// ================================================================ THE STANCE SETS
/** Today's sets: one stance each, so the engine never picks, never draws noise, never fades. */
export const TODAY_SETS = Object.freeze({
  ease: Object.freeze([Object.freeze({ id: 'atEase', fn: atEase, w: 1, dwell: [1e9, 1e9] })]),
  fight: Object.freeze([Object.freeze({ id: 'fencer', fn: fencerGuard, w: 1, dwell: [1e9, 1e9] })]),
});
export const SET_NAMES = ['ease', 'fight'];
/** The cross-fade between two stances of a set when the style names none (s, smootherstep). */
export const SHIFT_FADE = 1.2;
const TIER_MAX = 5;
/** How fast A.streakK (0..1, the streak's tier / 5) follows the tier (1/s). */
const STREAK_K_RATE = 3;

/** The sets a style stands in (its `stances`, each set falling back to today's when it is missing,
 *  empty or malformed). */
export function setsOf(style) {
  const S = style?.stances;
  if (!S || typeof S !== 'object') return TODAY_SETS;
  return S;
}
export function listOf(style, set) {
  const L = setsOf(style)[set];
  return Array.isArray(L) && L.length && L.every((s) => s && typeof s.fn === 'function') ? L : TODAY_SETS[set];
}
const okTier = (s, tier) => tier >= (Number.isFinite(s.minTier) ? s.minTier : 0) && tier <= (Number.isFinite(s.maxTier) ? s.maxTier : TIER_MAX);

/** A set's selection state on the animator (HeroAnimator.stanceSel[set]). */
export const newSel = () => ({ list: null, cur: null, prev: null, k: 1, t: 0, dwell: 0, n: 0 });

/** Pick the next stance of `list` by weight, among those whose tier range holds `tier` (all of
 *  them when none does), never `not` while another is eligible. `rnd` 0..1 noise (called only when
 *  there is a choice to make). */
const wOf = (s) => Math.max(0, Number.isFinite(s.w) ? s.w : 1);
function pick(list, tier, not, rnd) {
  let n = 0, sum = 0;
  for (const s of list) if (s !== not && okTier(s, tier)) { n++; sum += wOf(s); }
  const byTier = n > 0;
  if (!n) for (const s of list) if (s !== not) { n++; sum += wOf(s); }
  if (!n) return not ?? list[0]; // (a list of one)
  const ok = (s) => s !== not && (!byTier || okTier(s, tier));
  if (n === 1 || !(sum > 0)) {
    for (const s of list) if (ok(s)) return s;
  }
  let r = rnd() * sum, last = null;
  for (const s of list) {
    if (!ok(s)) continue;
    last = s;
    r -= wOf(s);
    if (r <= 0) return s;
  }
  return last ?? list[0];
}
function dwellOf(s, rnd, many) {
  const d = Array.isArray(s?.dwell) ? s.dwell : null;
  if (!many) return Infinity; // (one stance: it never moves on)
  const a = Number.isFinite(d?.[0]) ? Math.max(0.5, d[0]) : 6, b = Number.isFinite(d?.[1]) ? Math.max(a, d[1]) : a * 2;
  return a + (b - a) * rnd();
}

/**
 * Once a frame (HeroAnimator.update, beside fightW; the hero only): for each set, hold the stance
 * for its dwell, then start a cross-fade to the next one (only while `calm`: in the loco clip, no
 * idle action running, no guard held). A pin (player.debug.stance[set]), a style switch or a streak
 * tier that leaves the current stance out move on at once, but only once a running fade is done
 * (a fade never restarts half way: no pop). Noise: the animator's own stance stream (A.stanceNoise,
 * drawn only when there is a choice: today's sets never draw it). `style`: styles/index.js's.
 */
export function stanceStep(A, dt, calm, style) {
  const pl = A.player;
  const tier = streakTier(Number.isFinite(pl?.streak) ? pl.streak : 0);
  A.streakTier = tier;
  const want = tier / TIER_MAX, rate = 1 - Math.exp(-STREAK_K_RATE * Math.max(0, dt));
  A.streakK = Number.isFinite(A.streakK) ? A.streakK + (want - A.streakK) * rate : want;
  const fade = Number.isFinite(style?.shift?.fade) && style.shift.fade > 0.05 ? style.shift.fade : SHIFT_FADE;
  const pins = pl?.debug?.stance;
  for (const set of SET_NAMES) {
    const S = A.stanceSel[set], list = listOf(style, set);
    if (S.k < 1) S.k = Math.min(1, S.k + dt / (S.fade || fade));
    S.t += dt;
    if (!S.cur) {
      // the first frame (or after a reset): straight into a stance, no fade
      S.list = list;
      S.cur = pick(list, tier, null, A.stanceNoise);
      S.prev = null;
      S.k = 1;
      S.t = 0;
      S.dwell = dwellOf(S.cur, A.stanceNoise, list.length > 1);
      continue;
    }
    if (S.k < 1) continue; // a fade runs to its end before anything else starts
    const pinId = typeof pins?.[set] === 'string' ? pins[set] : null;
    const pinned = pinId ? list.find((s) => s.id === pinId) ?? null : null;
    let next = null;
    if (pinned) {
      if (S.cur !== pinned) next = pinned;
    } else if (S.list !== list || !list.includes(S.cur)) {
      next = pick(list, tier, null, A.stanceNoise);
    } else if (!okTier(S.cur, tier) && list.some((s) => okTier(s, tier))) {
      next = pick(list, tier, S.cur, A.stanceNoise);
    } else if (calm && S.t >= S.dwell && list.length > 1) {
      next = pick(list, tier, S.cur, A.stanceNoise);
      if (next === S.cur) S.t = 0;
    }
    S.list = list;
    if (!next || next === S.cur) continue;
    S.prev = S.cur;
    S.cur = next;
    S.k = 0;
    S.fade = fade;
    S.t = 0;
    S.n++;
    S.dwell = dwellOf(next, A.stanceNoise, list.length > 1);
  }
}

/** Write a set's stance into p (p holds guard()'s base): the current one, or mid-fade the previous
 *  one (into `scr`, from the same base) blended toward it. `blend(out, a, b, t)` = anim.js's. */
export function writeSet(p, P, A, S, scr, blend) {
  const cur = S.cur;
  if (!cur) return;
  if (S.prev && S.k < 1) {
    scr.set(p);
    S.prev.fn(scr, P, A);
    cur.fn(p, P, A);
    blend(p, scr, p, smoother(S.k), S.mem ?? (S.mem = { d: 0, ok: false }));
  } else {
    cur.fn(p, P, A);
    if (S.mem) S.mem.ok = false;
  }
}
/** The weight (0..1) the CURRENT stance of a set has in the pose (1 out of a fade). */
export const curWeight = (S) => (S.prev && S.k < 1 ? smoother(S.k) : 1);
