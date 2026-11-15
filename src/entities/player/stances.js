// The hero's two standing stances (ADR-113; the owner's pick of three rendered options, "A · At
// ease"), and the life in them. anim.js stand() writes them over guard()'s ready stance for the
// hero's animator only, blended by the animator's fightW:
//
//   AT EASE   nothing to fight. He stands tall and a little side-on with the weight on the rear
//             leg; the sword arm hangs loose and the blade carries on down the arm's own line, out
//             to his front-right with the point a hand above the grass; the free hand rests on the
//             belt.
//   FIGHT     locked on, or a boss fight under way (HeroAnimator.update). A fencer's guard: the
//             sword side turned to the foe and stepped forward, the arm half extended with the
//             blade straight off the forearm, its point on the foe; the free hand stays on the belt.
//
// Why (Session 49, the owner on the stance before it: "something about the current idle animation
// is bothering me"; ticked: a stiff, bent sword wrist; arms that hang like a mannequin's; a statue):
// the old ready stance held the blade 27° out of line with the forearm from an elbow tucked at the
// ribs, both hands hung beside the hips at one height, and over a breath nothing travelled more
// than 1-3 cm, under half a pixel at the game camera.
//
// Pose space: body axes (x = his left, y up, z ahead); hand targets are offsets from each shoulder
// (anim.js). Every other clip, and a duelist's footwork, keeps guard() as its base.
import { TAU } from '../../core/math.js';
import { DIM } from './heroDims.js';

const ANK = DIM.ankle;
const DEG = Math.PI / 180;

/** The stance's life: periods (s) of its slow oscillators. None shares a period with another, so
 *  the stance never visibly loops: the breath (at ease / in the guard), the weight settling from
 *  foot to foot, a slower drift of the weight, the two the look-around is made of, and the two
 *  that carry the blade's point round. `arms` = how far (rad of the breath) the arms trail the chest. */
export const STAND_LIFE = { breath: [3.7, 3.1], settle: 7.9, drift: 11.9, look: [9.1, 5.3], point: [4.7, 6.4], arms: 0.9 };

const M = { br: 0, brL: 0, sw: 0, dr: 0, look: 0, tipA: 0, tipB: 0 };
function oscillate(t, breath) {
  const L = STAND_LIFE, b = (t * TAU) / breath;
  M.br = Math.sin(b);
  M.brL = Math.sin(b - L.arms);
  M.sw = Math.sin((t * TAU) / L.settle + 1.1);
  M.dr = Math.sin((t * TAU) / L.drift + 0.4);
  // (two sines: he looks one way, comes back, glances the other; never a metronome)
  M.look = 0.62 * Math.sin((t * TAU) / L.look[0] + 2.0) + 0.38 * Math.sin((t * TAU) / L.look[1]);
  M.tipA = Math.sin((t * TAU) / L.point[0] + 0.6);
  M.tipB = Math.sin((t * TAU) / L.point[1]);
  return M;
}

/** p[i..i+2] = the unit vector at azimuth az (0 ahead, + his left) and elevation el (degrees). */
function dir(p, i, az, el) {
  const a = az * DEG, e = el * DEG, c = Math.cos(e);
  p[i] = c * Math.sin(a);
  p[i + 1] = Math.sin(e);
  p[i + 2] = c * Math.cos(a);
}
function set3(p, i, x, y, z) {
  p[i] = x;
  p[i + 1] = y;
  p[i + 2] = z;
}

/** The free hand on the belt at the left hip, the elbow out behind it (both stances: one hand is
 *  enough). h: the hand from its shoulder; p: the elbow's side; d / n: the fingers and the palm; all
 *  in body axes as the chest stands at ease (turned `yaw`): a stance turns them with its own chest. */
export const BELT = { yaw: -0.14, h: [-0.004, -0.33, 0.022], p: [0.85, -0.15, -0.6], d: [-0.8, -0.2, 0.56], n: [-0.56, 0.05, -0.82] };
function turned(p, i, v, c, s) {
  p[i] = v[0] * c + v[2] * s;
  p[i + 1] = v[1];
  p[i + 2] = -v[0] * s + v[2] * c;
}
/** `yaw` = this stance's chest turn (pelvY + spY): the hand belongs to the waist, which turns with it. */
function onTheBelt(p, P, m, yaw) {
  const a = yaw - BELT.yaw, c = Math.cos(a), s = Math.sin(a);
  // the palm on the side of the waist at the belt, a hand's thickness off it …
  turned(p, P.lH, BELT.h, c, s);
  p[P.lH] += 0.004 * m.sw;
  p[P.lH + 1] += 0.01 * m.brL;
  turned(p, P.lP, BELT.p, c, s);
  // … an open hand, the fingers round the front of the hip toward the buckle, the palm in on it
  turned(p, P.lD, BELT.d, c, s);
  turned(p, P.lN, BELT.n, c, s);
  p[P.hs] = 0;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
}

/** AT EASE (see the header). P = anim.js's channel map; A = the animator (its time). */
export function atEase(p, P, A) {
  const m = oscillate(A.time, STAND_LIFE.breath[0]);
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
  onTheBelt(p, P, m, p[P.pelvY] + p[P.spY]);
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
  const m = oscillate(A.time, STAND_LIFE.breath[1]);
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
  onTheBelt(p, P, m, p[P.pelvY] + p[P.spY]);
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
