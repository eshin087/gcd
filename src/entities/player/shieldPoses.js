// Sword and shield (the owner, 2026-11-16: "we are adding the shield and also adjust the block /
// guard animation and heavy attack to look good with the sword and shield look"; asked first: the
// heavies one-handed with the shield as the counterweight, the shield blocks AND parries, a look
// only: no rule or number of the fight changes).
//
// With an `offhand` shield equipped (rig.shield → HeroAnimator.shield) anim.js calls into this file:
// the free arm carries the shield instead of holding sword fingers, no hand ever joins the grip, the
// held guard is the shield raised before him with the sword cocked behind it, a parry is a swat of
// the shield onto the blow, and the two-handed clips (the heavies, the slam, the charge and its
// cleave) are swung in one hand while the shield arm answers them (SHIELD_ARM). The sword hand's
// keys of every swing are untouched: the blade cuts where it cut.
//
// Pose space as anim.js: body axes (x = his left, y up, z ahead); a hand target is an offset from
// its shoulder. The shield hangs on the free forearm (model.js rig.arms.L.shield): the HAND target
// below is its fist, the plate's centre lies DIM.shieldAt down the forearm from the elbow, and
// HeroAnimator._shield turns the plate about the forearm so its face looks away from his body.
import { TAU } from '../../core/math.js';

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
function set3(p, i, v) {
  p[i] = v[0];
  p[i + 1] = v[1];
  p[i + 2] = v[2];
}
function to3(p, i, v, t) {
  if (!(t > 0)) return;
  p[i] += (v[0] - p[i]) * t;
  p[i + 1] += (v[1] - p[i + 1]) * t;
  p[i + 2] += (v[2] - p[i + 2]) * t;
}
/** A vector given as the chest stands square (`v`), turned with a chest that stands `yaw` round. */
function turned(p, i, v, yaw, t = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const x = v[0] * c + v[2] * s, z = -v[0] * s + v[2] * c;
  p[i] += (x - p[i]) * t;
  p[i + 1] += (v[1] - p[i + 1]) * t;
  p[i + 2] += (z - p[i + 2]) * t;
}

/**
 * Where the shield arm is, by name: `l` the fist from the left shoulder, `lp` the elbow's side.
 * Written for a chest that stands square to his front; a stance turns them with its own chest.
 */
export const SHIELD_AT = {
  // at his left side, the forearm level and a little in across his front: the plate upright
  // beside the hip, its face out to his left and ahead
  // (the fist a little OUT from the shoulder's line: the plate stands off his hip and turns its
  // back a little to the game camera behind him, which saw none of a shield held in across his front)
  carry: { l: [0.07, -0.33, 0.19], lp: [0.6, -0.2, -0.78] },
  // in a fight: before the left of his chest, the forearm across, the face to the foe
  ready: { l: [-0.1, -0.2, 0.31], lp: [0.66, -0.72, -0.1] },
  // the held guard: raised before the chest and the chin, the face square to the foe
  // (a little to his LEFT of his middle: from the game camera behind him its left half and its top
  // show past his shoulder; square before the chest his own back hid all of it)
  block: { l: [-0.07, -0.04, 0.31], lp: [0.6, -0.78, 0.0] },
  // tucked hard against the chest (a windup, a turn)
  tuck: { l: [-0.18, -0.2, 0.2], lp: [0.7, -0.7, -0.05] },
  // swung out to his left, a little behind the shoulder line: the counterweight to a cut
  out: { l: [0.32, -0.2, -0.04], lp: [0.2, -0.6, -0.78] },
  // low behind the left hip (a thrust's opposition, a falling cut's finish)
  back: { l: [0.22, -0.34, -0.22], lp: [0.55, -0.3, -0.75] },
  // the arm let down straight beside the left thigh: the plate lies level along it, under a blade
  // that crosses at chest height
  hang: { l: [0.03, -0.5, 0.05], lp: [0.5, -0.2, -0.85] },
  // lifted before the brow (the leap of the slam)
  high: { l: [-0.12, 0.06, 0.32], lp: [0.75, -0.55, 0.1] },
};

/** The rest every clip is written over (anim.js guard()): the carry, the fist closed. */
export function shieldRest(p, P) {
  const C = SHIELD_AT.carry;
  set3(p, P.lH, C.l);
  set3(p, P.lP, C.lp);
  freeHandOff(p, P);
}
function freeHandOff(p, P) {
  p[P.lD] = p[P.lD + 1] = p[P.lD + 2] = 0;
  p[P.lN] = p[P.lN + 1] = p[P.lN + 2] = 0;
  p[P.hs] = 0;
  p[P.lk] = 0;
  p[P.twoHand] = 0;
  p[P.offAt] = 0;
}

/**
 * Standing (anim.js stand(), after the stance is written): the shield arm at ease and in the fight
 * stance, blended by `fight` (0..1). `m` = { br, sw }: the stance's breath and its settle (−1..1).
 */
export function shieldStand(p, P, A, fight) {
  const yaw = p[P.pelvY] + p[P.spY];
  const t = A.time, br = Math.sin((t * TAU) / 3.4 - 0.9), sw = Math.sin((t * TAU) / 7.9 + 1.1);
  const C = SHIELD_AT.carry, R = SHIELD_AT.ready, f = fight * fight * (3 - 2 * fight);
  const l = [mix(C.l[0], R.l[0], f) + 0.006 * sw, mix(C.l[1], R.l[1], f) + 0.012 * br, mix(C.l[2], R.l[2], f) + 0.006 * br];
  const lp = [mix(C.lp[0], R.lp[0], f), mix(C.lp[1], R.lp[1], f), mix(C.lp[2], R.lp[2], f)];
  turned(p, P.lH, l, yaw);
  turned(p, P.lP, lp, yaw);
  freeHandOff(p, P);
}

/**
 * On the move (anim.js loco(), in place of the free arm's swing): the shield rides the stride, a
 * third of the swing a bare arm makes, held nearer the body the faster he runs; in a fight it
 * stays up before him. k = 0..1 the stride (1 = this arm forward), w = the gait's weight,
 * s = the sprint's.
 */
export function shieldRun(p, P, A, k, w, s) {
  const fight = Math.min(1, Math.max(0, A.fightW ?? 0)) * (1 - s);
  const sw = (k - 0.5) * 2; // −1 back … 1 forward
  const run = [0.05 + 0.02 * sw, -0.3 - 0.03 * sw + 0.03 * s, 0.14 + 0.07 * sw - 0.04 * s];
  const R = SHIELD_AT.ready;
  const l = [mix(run[0], R.l[0], fight), mix(run[1], R.l[1] + 0.012 * sw, fight), mix(run[2], R.l[2] + 0.02 * sw, fight)];
  to3(p, P.lH, l, w);
  to3(p, P.lP, [mix(0.6, R.lp[0], fight), mix(-0.25, R.lp[1], fight), mix(-0.78, R.lp[2], fight)], w);
}

/**
 * The held guard (anim.js blockPose, over its stance and its body): the shield raised before him,
 * the sword cocked low behind it, the point up past the shield's right edge. `r` = a blocked
 * blow's recoil (0..1): the shield is driven back into the chest.
 */
export function shieldBlock(p, P, A, r) {
  const yaw = p[P.pelvY] + p[P.spY], B = SHIELD_AT.block;
  const br = Math.sin(A.time * (TAU / 2.4));
  turned(p, P.lH, [B.l[0], B.l[1] + 0.008 * br, B.l[2] + 0.004 * br], yaw);
  turned(p, P.lP, B.lp, yaw);
  // the sword: the hand drawn back by the right ribs, the blade ahead and up, a little out to the
  // sword side so the game camera behind him sees it past his body and the shield
  p[P.rH] = -0.13;
  p[P.rH + 1] = -0.3 + 0.006 * br;
  p[P.rH + 2] = 0.02;
  p[P.rP] = -0.5;
  p[P.rP + 1] = -0.45;
  p[P.rP + 2] = -0.75;
  dirSet(p, P.swD, -24, 30);
  p[P.swF] = 0.3;
  p[P.swF + 1] = 1;
  p[P.swF + 2] = 0;
  freeHandOff(p, P);
  if (r > 0.001) {
    p[P.lH + 1] += 0.03 * r;
    p[P.lH + 2] -= 0.1 * r;
    p[P.rH + 2] -= 0.05 * r;
  }
}

/**
 * The parry (anim.js deflectPose, over the held guard): the shield swats the blow aside. D =
 * player.deflect { n, side, high }: the blow from his front-right (side > 0: the shield punches
 * across to meet it) or his front-left (it sweeps out to the left), from above (it is thrown up
 * before the brow) or low (it is punched down past the knee). The body turns into it and rocks
 * back with the push; the sword hand draws further back, wound for the riposte. t = the clip's time.
 */
export function shieldParry(p, P, A, D, t) {
  const side = D?.side < 0 ? -1 : 1, n = Number.isFinite(D?.n) ? D.n : 1;
  const f = 1 - sstep(0.07, 0.22, t), s = Math.min(1.15, Math.max(0.85, 0.85 + 0.06 * (n - 1)));
  const yaw0 = p[P.pelvY] + p[P.spY];
  // the swat: the fist driven out ahead of the shoulder, across (right) or out (left)
  const at = side > 0 ? [-0.3, -0.05, 0.36] : [0.06, -0.06, 0.44];
  const pole = side > 0 ? [0.45, -0.85, 0.2] : [0.8, -0.5, -0.3];
  turned(p, P.lH, at, yaw0, f);
  turned(p, P.lP, pole, yaw0, f);
  p[P.spY] += (side > 0 ? -0.34 : 0.3) * f * s;
  p[P.pelvY] += (side > 0 ? -0.12 : 0.1) * f * s;
  p[P.hdY] += (side > 0 ? 0.26 : -0.2) * f;
  const hi = Number.isFinite(D?.high) ? D.high : 0;
  const h = Math.min(1, Math.max(0, hi)) * f, lo = Math.min(1, Math.max(0, -hi)) * f;
  if (h > 0.001) {
    turned(p, P.lH, [-0.1, 0.3, 0.36], yaw0, h);
    turned(p, P.lP, [0.85, -0.4, 0.2], yaw0, h);
    p[P.spX] -= 0.1 * h;
    p[P.hdX] -= 0.1 * h;
    p[P.bodyY] -= 0.04 * h;
  }
  if (lo > 0.001) {
    turned(p, P.lH, [side > 0 ? -0.22 : 0.04, -0.36, 0.34], yaw0, lo);
    turned(p, P.lP, [0.6, -0.5, -0.5], yaw0, lo);
    p[P.bodyY] -= 0.06 * lo;
    p[P.spX] += 0.12 * lo;
  }
  // the nudge onto the blow's steel (player.js _meetShield; the fist stays inside the arm's reach)
  const nx = (Number.isFinite(D?.nx) ? D.nx : 0) * f, ny = (Number.isFinite(D?.ny) ? D.ny : 0) * f, nz = (Number.isFinite(D?.nz) ? D.nz : 0) * f;
  if (nx || ny || nz) {
    let x = p[P.lH] + nx, y = p[P.lH + 1] + ny, z = p[P.lH + 2] + nz;
    const l = Math.hypot(x, y, z), R = 0.54;
    if (l > R) {
      x *= R / l;
      y *= R / l;
      z *= R / l;
    }
    p[P.lH] = x;
    p[P.lH + 1] = y;
    p[P.lH + 2] = z;
  }
  // the sword winds back for the answer
  p[P.rH + 2] -= 0.07 * f;
  p[P.rH + 1] += 0.03 * f;
  // the rock back: the chest gives with the blow, the weight onto the back foot
  const push = 1 - sstep(0.02, 0.22, t);
  p[P.spX] -= 0.1 * push * s;
  p[P.bodyZ] -= 0.05 * push;
  p[P.hdX] -= 0.06 * push;
  freeHandOff(p, P);
}

/**
 * How a parry finds the blow with the plate (player.js _meetShield): `passes` nudges of the fist by
 * the gap between the plate's middle and his steel, each clamped to `nudge` ([±x, ±y, z min, z max],
 * body axes, model metres); a blow still further than `far` from the plate is met by the SWORD
 * (deflect.sword: anim.js deflectPose poses the blade's parry, the plate held in the guard).
 */
export const SHIELD_MEET = { passes: 3, nudge: [0.45, 0.4, -0.45, 0.35], far: 0.2 };

/** Blades locked (anim.js lockPose): the sword is his alone; the shield braces behind it, its rim
 *  under the sword forearm. */
export function shieldLock(p, P, A, r) {
  const yaw = p[P.pelvY] + p[P.spY];
  turned(p, P.lH, [-0.2, -0.18, 0.3 + 0.03 * r], yaw);
  turned(p, P.lP, [0.6, -0.78, -0.05], yaw);
  freeHandOff(p, P);
}

/**
 * The charge held (anim.js chargePose): one hand cocks the sword back beside the head; the shield
 * leads, before the chest, lifting as the charge fills. k = the charge 0..1, s = how far into the
 * stance 0..1.
 */
export function shieldCharge(p, P, A, k, s) {
  // (body axes, not the chest's: the charge winds the chest far to his right, and a shield held
  // square before THAT chest stood with its far corner in the upright blade)
  const R = SHIELD_AT.ready, B = SHIELD_AT.block, u = s * (0.55 + 0.45 * k);
  p[P.lH] = mix(R.l[0], -0.06, s);
  p[P.lH + 1] = mix(R.l[1], -0.17 + 0.03 * k, s);
  p[P.lH + 2] = mix(R.l[2], 0.34, s);
  to3(p, P.lP, [mix(R.lp[0], B.lp[0], u), mix(R.lp[1], B.lp[1], u), mix(R.lp[2], B.lp[2], u)], 1);
  // (one hand: the grip comes back beside the right shoulder, the blade as it stood)
  p[P.rH] += (-0.16 - p[P.rH]) * s;
  p[P.rH + 1] += (-0.04 + 0.02 * k - p[P.rH + 1]) * s;
  p[P.rH + 2] += (0.16 - p[P.rH + 2]) * s;
  freeHandOff(p, P);
}

function dirSet(p, i, az, el) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180, c = Math.cos(e);
  p[i] = c * Math.sin(a);
  p[i + 1] = Math.sin(e);
  p[i + 2] = c * Math.cos(a);
}

/**
 * The shield arm through the clips that were two-handed (swings.js keys carry `two: 1` and no
 * free hand): extra keys merged into the clip when it is compiled for a shield (anim.js swingClip).
 * Each key: u (the clip's phase), l and lp (as SHIELD_AT). The rule: the shield covers him through
 * the windup, and goes the other way from the blade as the cut lands (never across the steel's
 * path); a heavy holds its finish, so the last key is a pose worth holding.
 */
const K = (u, at, o = null) => ({ u, l: (o?.l ?? SHIELD_AT[at].l).slice(), lp: (o?.lp ?? SHIELD_AT[at].lp).slice() });
export const SHIELD_ARM = {
  // Piercing Gale: the shield leads the dash; as the arm drives the point out it is thrown back
  // behind the left hip, one line through the shoulders from the rim to the point
  // (at the coil the chest is wound a radian to his right, the left shoulder forward: the fist stays
  // LEFT of it, or the plate's far edge stands in the blade's line, 6 frames through the steel)
  heavyThrust: [K(0.6, 'ready', { l: [-0.08, -0.18, 0.32] }), K(1.0, 'block', { l: [-0.03, -0.12, 0.34] }), K(1.45, 'tuck', { l: [-0.06, -0.2, 0.22] }), K(1.9, 'back'), K(2.55, 'back', { l: [0.2, -0.36, -0.2] })],
  // Rising Crescent: the blade sinks to the left hip under the lifted shield, then rises to the
  // right as the shield arm is flung down and out to the left
  heavyRise: [K(0.6, 'block', { l: [-0.1, 0.0, 0.3] }), K(1.0, 'high', { l: [-0.04, 0.04, 0.3] }), K(1.5, 'out', { l: [0.24, -0.16, 0.12] }), K(2.0, 'out', { l: [0.34, -0.3, -0.08] }), K(2.55, 'back', { l: [0.3, -0.34, -0.14] })],
  // Whirling Tempest: tucked to the chest through the turn, thrown wide as the brake
  heavySpin: [K(0.5, 'tuck'), K(1.0, 'tuck'), K(1.5, 'tuck', { l: [-0.14, -0.22, 0.22] }), K(2.0, 'out'), K(2.45, 'out', { l: [0.3, -0.26, -0.08] })],
  // Mountain Splitter: the blade goes up over the LEFT shoulder, so the shield drops low before
  // him, out of its way; as the cut falls to the right hip it is drawn back past the left hip
  // (the windup's first key is the SWORD's, for the shield only: the blade is carried up and over to
  // the left shoulder. Without it the steel swept level across his front at chest height on its way
  // there, through the shield he holds before him, for four frames. The cut itself is untouched)
  heavyCrush: [{ u: 0.22, h: [0.0, -0.1, 0.24], a: [40, 62] }, K(0.3, 'ready', { l: [-0.14, -0.3, 0.28] }), K(0.6, 'hang', { l: [-0.02, -0.44, 0.16] }), K(1.0, 'hang'), K(1.5, 'carry', { l: [0.1, -0.36, 0.14] }), K(2.0, 'back'), K(2.55, 'back')],
  // the slam: the shield lifts before the brow with the leap and is swept down and out as the blade
  // comes down
  slam: [K(0.3, 'ready'), K(0.7, 'high'), K(1.0, 'high', { l: [-0.08, 0.1, 0.3] }), K(1.5, 'out', { l: [0.22, -0.1, 0.14] }), K(2.0, 'out', { l: [0.32, -0.3, 0.0] }), K(2.55, 'out', { l: [0.32, -0.32, -0.02] })],
  // the charged cleave: the shield leads the dash, swings out as the blade crosses, and comes back
  // before him as he holds the finish: the shield to the foe, the blade trailing behind
  cleave: [K(0.9, 'block', { l: [-0.06, -0.16, 0.34] }), K(1.3, 'block', { l: [-0.04, -0.16, 0.36] }), K(1.7, 'out', { l: [0.2, -0.16, 0.16] }), K(2.0, 'out'), K(2.25, 'ready', { l: [-0.1, -0.16, 0.36] }), K(2.6, 'ready', { l: [-0.1, -0.16, 0.36] })],
  // The two backhands coil the blade at his LEFT side, where the shield hangs (the free hand used to
  // gather on the sword wrist there): the shield lifts clear over the coil (the rising one, coiled at
  // the hip) or drops under it (the flat one, coiled at the chest), and is flung out to his left as
  // the cut goes out to the right
  risingBackhand: [K(0.6, 'high', { l: [0.02, 0.12, 0.26] }), K(1.0, 'high', { l: [0.05, 0.14, 0.25] }), K(1.25, 'out', { l: [0.3, -0.1, 0.1] }), K(2.0, 'out', { l: [0.36, -0.3, -0.1] }), K(2.4, 'out', { l: [0.36, -0.3, -0.1] })],
  flatBackhand: [K(0.6, 'hang'), K(1.0, 'hang'), K(1.5, 'out', { l: [0.3, -0.26, 0.04] }), K(2.0, 'out'), K(2.4, 'out')],
};
