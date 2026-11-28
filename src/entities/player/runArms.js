// The hero's free (left) arm on the run (ADR-187). anim.js loco() calls runArm() for the hero's
// animator only (A.freeHand); a duelist's footwork keeps its own swing.
//
// Three ways to carry it, for the owner to compare ("show me all 3 variations"), `?runArm=`:
//   a    NATURAL: a runner's arm. The elbow bent near a right angle, swinging against the legs from
//        the shoulder; it opens a little behind him and folds in front, the forearm crossing in
//        toward the chest; the hand open and loose (palm to the thigh, the fingers following the
//        forearm, curled a little). At a sprint the swing grows into a firm pump, chin to hip, the
//        hand straight as a blade.
//   b    THE SWORDSMAN'S DASH: the free arm swept back and low behind him, held off the coat, the
//        elbow soft, the open hand trailing; it rides the stride a little and never hangs still.
//        Only running FORWARD: strafing and backing away he swings it as in (a), since a trailing
//        arm in a sideways run reads as a broken one.
//   c    BY SPEED: (a) at the run, sweeping back into (b) as a sprint builds (A.sprintW, eased),
//        forward only, as in (b).
//   d    FULL PUMP (ADR-204, measured off the owner's reference beside the sword carry `hip`): a
//        sprinter's arm against the sword arm. Forward, the upper arm ~22° ahead of the torso and the
//        elbow near a right angle, the hand before the belly, near the midline but not across it; back,
//        the upper arm ~58° behind, the elbow high behind his back and the forearm hanging, the hand
//        behind the hip at the waist. Its angles are against the torso's own line (he leans into the
//        run). The run is the same shape at ~60 % of the swing.
//   e    OPEN (the owner, 2026-11-25: "from the back the left arm seems way too pressed in and makes
//        it seem like he has no left arm during the run"): (d)'s pump opened out from the side, the
//        upper arm standing further off his ribs, the elbow pointing back and out, the forearm hardly
//        crossing in front, so from the game camera behind him the arm is drawn clear of the coat
//        through the whole stride. Still a runner's swing: the hand passes the hip, never out like a wing.
//   f    WIDER: (e) a step further out (the upper arm ~8° more off his side, the forearm not crossing in
//        front at all), for the owner to see how far the arm should open.
//   h    THE FIST AT THE HIP (the owner, 2026-11-26, with a photo of a swordsman running with a drawn sword, his
//        free fist held at his left hip as on a scabbard at the belt: "i think its because his left hand is
//        moving around too much, lets make his hand like this pose"): the fist held at the front of the left
//        hip at the belt, the elbow bent and a little out, riding the hips (pinned to the pelvis, not swung).
//   g    THE GUARD (the owner, 2026-11-26: "make his left in a pose like hes guarding his face and chest with his
//        left hand and make it look natural during the movement run"): the forearm raised before his chest, the
//        fist up before his chin a little left of centre, the elbow bent near a right angle, down and a little
//        out; posed in the chest's frame (it leans and twists with the torso), giving a little with the stride.
//   old  the swing before this pass (anim.js loco(), kept there).
//
// Why angles: every variant is written as joint angles (the upper arm's swing and how far it stands
// off the side, the elbow, the forearm's cross in front) and turned into the hand target and the
// elbow's pole by forward kinematics on the arm's own bones. A blend between two carries blends the
// ANGLES, so the hand travels round the shoulder on a real arc instead of a straight line through his
// ribs (a hand target lerped from "in front of the chest" to "behind the hip" passes through the torso
// and the solver's rib guard pushes it out in a jump).
//
// Pose space (anim.js): body axes, x = his left, y up, z ahead; P.lH is the hand's offset from the left
// shoulder, P.lP the elbow's pole, P.lD / P.lN the fingers' and the palm's directions (their lengths
// are their weights), P.hs the hand's shape (0 open, 1 sword fingers). No allocation per frame, never
// throws, never Math.random.
import { clamp, damp, lerp, smoothstep } from '../../core/math.js';
import { DIM } from './heroDims.js';

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'old'];
export const RUN_ARM_IDS = Object.freeze(IDS.slice());
export const RUN_ARM_NAMES = Object.freeze({ a: 'natural', b: 'dash', c: 'by speed', d: 'full pump', e: 'open', f: 'wider', g: 'guard', h: 'fist at the hip', old: 'before' });
// (the owner's pick: 'a' on 2026-11-25 (they approved A on the preview; C shipped first and was reverted),
// then 'd' the same day, beside the sword carry `hip`, after their reference run: ADR-204)
// then 'e' on 2026-11-26, the free arm opened out, from close-up films and the preview; then 'h', the fist held at
// the hip, from the owner's photo; then 'g', the guard before his face and chest; then back to 'e': "lets revert
// back. i dont like the new guarding pose as it looks really bad from the other angles": ADR-229)
const DEFAULT = IDS[0]; // 'a' (listed first: a `const X = '…'` string is read as glyphs by tests/glyphcheck.mjs)

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const PICK = { mode: (() => {
  const v = q('runArm');
  return IDS.includes(v) ? v : DEFAULT;
})() };

/** The carry in use ('a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'old'). */
export const runArmMode = () => PICK.mode;
/** Lab / tests: switch it live. Returns the id now set (anything unknown: the default). */
export function setRunArm(id) {
  PICK.mode = IDS.includes(String(id)) ? String(id) : DEFAULT;
  return PICK.mode;
}

const D = Math.PI / 180;
// The carries' numbers (degrees; `sw` = the swing's phase, +1 the hand forward, −1 back):
//   phi    the upper arm's swing from hanging (+ forward): centre, half range
//   ab     how far it stands off his side (+ out to his left)
//   el     the elbow's inside angle (180 straight) with the hand back / forward
//   cross  the forearm turned in toward his chest when the hand is in front
//   lag    the swing's lag behind the legs (cycles): an arm follows the stride, it does not lead it
//   curl   the relaxed fingers' bend toward the palm (0 = in line with the forearm), droop = down
export const RUN_ARMS = {
  // (a) a natural run: the walk's swing is small and nearly straight; the run's ~70° of shoulder,
  // the elbow 115° behind → 76° in front (it opens and folds ≥ 35° a stride: the stiff 87° crook of
  // Session 30 is what the owner called stiff); the sprint's pump ~104° of shoulder, chin to hip
  walk: { phi: [-4, 14], ab: 7, el: [158, 140], cross: 6, curl: 0.3, droop: 0.25 },
  run: { phi: [-9, 35], ab: 10, el: [118, 78], cross: 20, curl: 0.3, droop: 0.15 },
  sprint: { phi: [-9, 52], ab: 9, el: [110, 64], cross: 22, curl: 0.06, droop: 0.04 },
  lag: 0.035,
  // (b) the dash: swept back and up behind him, ~34° off his side so it shows past the cape from the
  // game camera (straight back, the cape hid all of it and from behind he seemed to have a hand on his
  // hip; less far back, the side view read a hand hanging by the hip). The elbow soft, the open hand
  // trailing. `ride` the stride's sway (deg of shoulder and of elbow each way: it never hangs still),
  // `sprint*` what a sprint adds (further back and up, a little further out), `palm` the trailing
  // palm (body axes: in and up)
  dash: { phi: -58, ride: 10, ab: 30, el: 152, elRide: 8, cross: -10, sprintPhi: -12, sprintAb: 4, sprintEl: 4, palm: [-0.55, 0.62, -0.55] },
  // the chest's lean into the dash (rad, × its weight), forward only
  dashLean: 0.05,
  // (b, c) forward only: the share of the dash by the move's fore-aft direction (mz)
  fwd: [0.35, 0.8],
  // (c) the sprint (A.sprintW, eased in update()) over which the run's swing becomes the dash
  byS: [0.15, 0.85],
  // (b, c) 1/s: how fast the dash comes and goes (~0.6 s to settle)
  dashRate: 5,
  // (d) the full pump, against the torso's line (the walk is (a)'s): back and forward of the swing
  pump: {
    run: { phi: [-7, 24], ab: 9, el: [120, 88], cross: 32, curl: 0.12, droop: 0.04 },
    sprint: { phi: [-11, 39], ab: 10, el: [99, 98], cross: 45, curl: 0.08, droop: 0 },
  },
  // (e) the pump opened out: `ab` the upper arm off his side (its back swing adds `abBack` more: the
  // elbow out past the coat's flare), `cross` the forearm in front, `side` how much of the stand-off
  // the forearm keeps (d: 0.6), `walk` the walk's own stand-off
  open: {
    run: { phi: [-7, 24], ab: 20, el: [118, 90], cross: 10, curl: 0.12, droop: 0.04 },
    sprint: { phi: [-11, 38], ab: 22, el: [100, 96], cross: 16, curl: 0.08, droop: 0 },
    abBack: 6,
    side: 0.95,
    walkAb: 11,
  },
  // (f) (e) a step wider
  wide: {
    run: { phi: [-7, 24], ab: 28, el: [118, 92], cross: 4, curl: 0.12, droop: 0.04 },
    sprint: { phi: [-11, 38], ab: 30, el: [100, 98], cross: 8, curl: 0.08, droop: 0 },
    abBack: 8,
    side: 1.0,
    walkAb: 14,
  },
};

// one carry, as angles (rad), filled per frame: A = the swing, B = the dash, O = the blend
const A_ = { phi: 0, ab: 0, el: 0, cross: 0, curl: 0, droop: 0 };
const B_ = { phi: 0, ab: 0, el: 0, cross: 0, curl: 0, droop: 0 };
const U = [0, 0, 0], F = [0, 0, 0], H = [0, 0, 0];

function swingAngles(o, sw, runK, walkK, s, tab) {
  const R = RUN_ARMS, W = R.walk, Rn = tab ? tab.run : R.run, S = tab ? tab.sprint : R.sprint;
  const pick = (k, i) => {
    const wv = k === 'ab' && tab?.walkAb !== undefined ? tab.walkAb : i === undefined ? W[k] : W[k][i];
    const rv = i === undefined ? Rn[k] : Rn[k][i], sv = i === undefined ? S[k] : S[k][i];
    return lerp(lerp(wv, rv, runK), sv, s);
  };
  const f = 0.5 + 0.5 * sw; // 0 back … 1 forward
  o.phi = (pick('phi', 0) + pick('phi', 1) * sw * lerp(0.6, 1, walkK)) * D;
  o.ab = (pick('ab') + (tab?.abBack ?? 3) * (1 - f)) * D; // a little further out on the back swing: past the coat
  o.el = lerp(pick('el', 0), pick('el', 1), f) * D;
  o.cross = pick('cross') * f * D;
  o.curl = pick('curl');
  o.droop = pick('droop');
}

function dashAngles(o, sw, s) {
  const B = RUN_ARMS.dash;
  o.phi = (B.phi + B.sprintPhi * s + B.ride * sw) * D;
  o.ab = (B.ab + B.sprintAb * s) * D;
  o.el = (B.el + B.sprintEl * s + B.elRide * sw) * D;
  o.cross = B.cross * D;
  o.curl = 0.12;
  o.droop = 0.1;
}

/** The free arm on the run, written over what loco() has so far (weight `w` = A.moveW). Returns
 *  false for 'old' (loco() then writes the swing before this pass). `cs` the stride's driver
 *  (cos 2π·phase, +1 as the left foot lands in front), `armF` its signed size (A.armSign × |mz|,
 *  never under 0.65), `s` the sprint, `runK` walk → run, `mz` the move's fore-aft direction. */
export function runArm(p, P, A, ph, armF, s, runK, w, mz, modeIn = null) {
  // (`modeIn`: a run style's own carry, runStyle.js; else the switch's)
  const mode = modeIn && IDS.includes(modeIn) ? modeIn : PICK.mode;
  if (mode === 'old') return false;
  if (mode === 'h') return fistAtHip(p, P, w);
  if (mode === 'g') return guardArm(p, P, ph, armF, s, w);
  const R = RUN_ARMS;
  // the swing's phase: +1 = the hand forward (the left hand comes forward with the right leg)
  const cs = Math.cos(2 * Math.PI * (ph - R.lag));
  const sw = clamp(-cs * (Number.isFinite(armF) ? armF : 1), -1, 1);
  const walkK = clamp(fin(A.speedS) / 1.6, 0, 1);
  const pump = mode === 'd' || mode === 'e' || mode === 'f';
  const tab = mode === 'd' ? R.pump : mode === 'e' ? R.open : mode === 'f' ? R.wide : null;
  swingAngles(A_, sw, runK, walkK, s, tab);
  let want = 0;
  if (mode === 'b' || mode === 'c') {
    const fw = smoothstep(R.fwd[0], R.fwd[1], fin(mz));
    want = mode === 'b' ? fw : fw * smoothstep(R.byS[0], R.byS[1], s);
  }
  // the dash's weight eases on its own clock (A.time: loco() runs more than once a frame, and each
  // run of it must give the same pose): the aim swung behind him flips mz in ~0.1 s, and the arm
  // came forward out of the dash in four frames, 28 cm a frame²
  const S = (A.runArmS ??= { bw: want, t: fin(A.time) });
  const now = fin(A.time), dt = clamp(now - S.t, 0, 0.1);
  S.bw = fin(damp(S.bw, want, R.dashRate, dt), want);
  S.t = now;
  const bw = clamp(S.bw, 0, 1);
  let O = A_;
  if (bw > 0.001) {
    dashAngles(B_, sw, s);
    const k = bw * bw * (3 - 2 * bw);
    A_.phi = lerp(A_.phi, B_.phi, k);
    A_.ab = lerp(A_.ab, B_.ab, k);
    A_.el = lerp(A_.el, B_.el, k);
    A_.cross = lerp(A_.cross, B_.cross, k);
    A_.curl = lerp(A_.curl, B_.curl, k);
    A_.droop = lerp(A_.droop, B_.droop, k);
    O = A_;
    // the chest leans into the dash a little (only where the dash is drawn: forward)
    p[P.spX] += R.dashLean * k * w;
  }
  // forward kinematics on the arm's own bones (body axes): the upper arm, then the forearm bent
  // forward from it in the swing's plane, turned in across the chest by `cross`
  const ca = Math.cos(O.ab), sa = Math.sin(O.ab);
  U[0] = sa;
  U[1] = -ca * Math.cos(O.phi);
  U[2] = ca * Math.sin(O.phi);
  const fa = O.phi + (Math.PI - O.el); // the forearm's angle from hanging, in the swing's plane
  const fz = Math.sin(fa), fy = -Math.cos(fa);
  const cc = Math.cos(O.cross), sc = Math.sin(O.cross);
  // (the forearm keeps most of the upper arm's stand-off: the elbow out, the hand not tucked under it)
  F[0] = -fz * sc + sa * (tab?.side ?? 0.6);
  F[1] = fy;
  F[2] = fz * cc;
  normalize(F);
  // (d: the angles are against the torso's line: the arm turns with his lean, about x)
  if (pump) {
    const tl = clamp(fin(p[P.spX]) + fin(p[P.pelvX]), -0.6, 1.0);
    tiltX(U, tl);
    tiltX(F, tl);
  }
  const a = DIM.upperArm, b = DIM.foreArm;
  for (let i = 0; i < 3; i++) H[i] = a * U[i] + b * F[i];
  to3(p, P.lH, H[0], H[1], H[2], w);
  // the elbow's pole: the elbow itself, off the shoulder → hand line (the solver keeps only that part)
  const hh = H[0] * H[0] + H[1] * H[1] + H[2] * H[2];
  const t = hh > 1e-6 ? (a * (U[0] * H[0] + U[1] * H[1] + U[2] * H[2])) / hh : 0;
  let px = a * U[0] - t * H[0], py = a * U[1] - t * H[1], pz = a * U[2] - t * H[2];
  const pl = Math.hypot(px, py, pz);
  if (pl > 1e-4) {
    px /= pl;
    py /= pl;
    pz /= pl;
  } else {
    px = 0.3;
    py = -0.3;
    pz = -0.9;
  }
  to3(p, P.lP, px, py, pz, w);
  // the hand: open (hs 0), the palm to the thigh (in, −x) or, trailing in the dash, in and up; the
  // fingers along the forearm, curled a little toward the palm and drooping, straight in a pump
  const k = bw * bw * (3 - 2 * bw);
  const DP = R.dash.palm;
  let nx = lerp(-0.95, DP[0], k), ny = lerp(-0.05, DP[1], k), nz = lerp(0.12, DP[2], k);
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  let dx = F[0] + O.curl * nx, dy = F[1] + O.curl * ny - O.droop, dz = F[2] + O.curl * nz;
  const dl = Math.hypot(dx, dy, dz) || 1;
  const dW = 0.85;
  dx *= dW / dl;
  dy *= dW / dl;
  dz *= dW / dl;
  to3(p, P.lD, dx, dy, dz, w);
  to3(p, P.lN, nx * 0.9, ny * 0.9, nz * 0.9, w);
  p[P.hs] = lerp(p[P.hs], 0, clamp(w * 2, 0, 1));
  return true;
}

// (h) the fist's spot at the left hip in the pelvis's frame (m: out to his left, up from the pelvis joint, ahead),
// the elbow's pole (body axes: out and back), the fingers (ahead and down) and the palm (in, to the hip)
export const HIP_FIST = { at: [0.215, 0.12, 0.09], pole: [0.85, -0.1, -0.5], fingers: [0.1, -0.55, 0.6], palm: [-0.9, 0.0, 0.15] };
const _hp = [0, 0, 0], _sh = [0, 0, 0], _t = [0, 0, 0];
// v ← R(x, y, z) · v, the rig's Euler order 'YXZ' (R = Ry · Rx · Rz)
function eulYXZ(v, x, y, z) {
  let a = v[0], b = v[1], c = v[2];
  let cz = Math.cos(z), sz = Math.sin(z);
  [a, b] = [a * cz - b * sz, a * sz + b * cz];
  const cx = Math.cos(x), sx = Math.sin(x);
  [b, c] = [b * cx - c * sx, b * sx + c * cx];
  const cy = Math.cos(y), sy = Math.sin(y);
  [a, c] = [a * cy + c * sy, -a * sy + c * cy];
  v[0] = a;
  v[1] = b;
  v[2] = c;
}
// (g) the guard, in the chest's frame (m from the chest joint: x his left, y up, z ahead), run → sprint: `fist` where
// the fist sits (before his chin, a little left of centre: the chest's neck joint is 0.31 up), `pole` where the elbow
// points (down, a little out and ahead: tucked before the ribs), `ride` the stride's give (m: up and down, fore and
// aft), the fist's fingers (ahead and up) and palm (in, toward the face)
export const GUARD = {
  run: { fist: [0.07, 0.34, 0.29], pole: [0.35, -0.85, 0.35] },
  sprint: { fist: [0.07, 0.33, 0.3], pole: [0.35, -0.85, 0.4] },
  ride: [0.012, 0.01],
  fingers: [-0.2, 0.5, 0.8],
  palm: [-0.75, 0.15, -0.55],
};
const _u = [0, 0, 0], _f = [0, 0, 0], _d = [0, 0, 0], _n = [0, 0, 0];
/** (g) the guard: the fist placed before the chin in the chest's frame and the elbow's pole set down and in; the
 *  solver bends the arm. Both turned by the spine's and the pelvis's rotation as posed this frame (body axes). */
function guardArm(p, P, ph, armF, s, w) {
  const G = GUARD, R0 = G.run, S0 = G.sprint;
  const cs = Math.cos(2 * Math.PI * (ph - RUN_ARMS.lag));
  const st = Math.cos(4 * Math.PI * ph); // twice a stride: every foot's landing
  const sw = clamp(-cs * (Number.isFinite(armF) ? armF : 1), -1, 1);
  // the fist less the left shoulder (chest frame), giving a little with each landing and the stride
  _u[0] = lerp(R0.fist[0], S0.fist[0], s) - (DIM.shoulder[0]);
  _u[1] = lerp(R0.fist[1], S0.fist[1], s) - DIM.shoulder[1] - G.ride[0] * st;
  _u[2] = lerp(R0.fist[2], S0.fist[2], s) - DIM.shoulder[2] + G.ride[1] * sw;
  _f[0] = lerp(R0.pole[0], S0.pole[0], s);
  _f[1] = lerp(R0.pole[1], S0.pole[1], s);
  _f[2] = lerp(R0.pole[2], S0.pole[2], s);
  normalize(_f);
  for (const [v, src] of [[_d, G.fingers], [_n, G.palm]]) {
    v[0] = src[0];
    v[1] = src[1];
    v[2] = src[2];
  }
  // chest frame → body axes: R(pelvis) · R(spine)
  const sx = fin(p[P.spX]), sy = fin(p[P.spY]), sz = fin(p[P.spZ]), px = fin(p[P.pelvX]), py = fin(p[P.pelvY]), pz = fin(p[P.pelvZ]);
  for (const v of [_u, _f, _d, _n]) {
    eulYXZ(v, sx, sy, sz);
    eulYXZ(v, px, py, pz);
  }
  to3(p, P.lH, _u[0], _u[1], _u[2], w);
  to3(p, P.lP, _f[0], _f[1], _f[2], w);
  to3(p, P.lD, _d[0] * 0.85, _d[1] * 0.85, _d[2] * 0.85, w);
  to3(p, P.lN, _n[0] * 0.9, _n[1] * 0.9, _n[2] * 0.9, w);
  p[P.hs] = lerp(p[P.hs], 0, clamp(w * 2, 0, 1));
  return true;
}
/** (h) the free fist held at the left hip: its target is the hip's belt point (pinned to the pelvis as posed this
 *  frame) less the left shoulder's place (the spine's lean and twist), both in body axes. */
function fistAtHip(p, P, w) {
  const px = fin(p[P.pelvX]), py = fin(p[P.pelvY]), pz = fin(p[P.pelvZ]);
  // the hip's point: pelvis joint (DIM.pelvis off the body) + R(pelvis) · `at`
  _hp[0] = HIP_FIST.at[0];
  _hp[1] = HIP_FIST.at[1];
  _hp[2] = HIP_FIST.at[2];
  eulYXZ(_hp, px, py, pz);
  // the left shoulder: R(pelvis) · (spine + R(spine) · (chest + shoulder))
  _sh[0] = DIM.chest[0] + DIM.shoulder[0];
  _sh[1] = DIM.chest[1] + DIM.shoulder[1];
  _sh[2] = DIM.chest[2] + DIM.shoulder[2];
  eulYXZ(_sh, fin(p[P.spX]), fin(p[P.spY]), fin(p[P.spZ]));
  _sh[0] += DIM.spine[0];
  _sh[1] += DIM.spine[1];
  _sh[2] += DIM.spine[2];
  eulYXZ(_sh, px, py, pz);
  // (both share the pelvis joint's place: it cancels)
  to3(p, P.lH, _hp[0] - _sh[0], _hp[1] - _sh[1], _hp[2] - _sh[2], w);
  // the elbow out and back, the fingers ahead and down round the belt, the palm to the hip, a fist
  const PL = HIP_FIST.pole;
  _t[0] = PL[0];
  _t[1] = PL[1];
  _t[2] = PL[2];
  to3(p, P.lP, _t[0], _t[1], _t[2], w);
  const FG = HIP_FIST.fingers, PM = HIP_FIST.palm;
  to3(p, P.lD, FG[0] * 0.85, FG[1] * 0.85, FG[2] * 0.85, w);
  to3(p, P.lN, PM[0] * 0.9, PM[1] * 0.9, PM[2] * 0.9, w);
  p[P.hs] = lerp(p[P.hs], 0, clamp(w * 2, 0, 1));
  return true;
}
function tiltX(v, t) {
  const c = Math.cos(t), s = Math.sin(t), y = v[1], z = v[2];
  v[1] = y * c - z * s;
  v[2] = y * s + z * c;
}
function fin(v, d = 0) {
  return Number.isFinite(v) ? v : d;
}
function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l > 1e-8) {
    v[0] /= l;
    v[1] /= l;
    v[2] /= l;
  } else {
    v[0] = 0;
    v[1] = -1;
    v[2] = 0;
  }
}
function to3(p, i, x, y, z, w) {
  p[i] += (x - p[i]) * w;
  p[i + 1] += (y - p[i + 1]) * w;
  p[i + 2] += (z - p[i + 2]) * w;
}
