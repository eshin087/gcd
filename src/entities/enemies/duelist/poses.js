import { P, N, v3, to3, dirLerp, loco, turnTwist } from '../../player/anim.js';
import { DIM } from '../../player/model.js';
import { clamp, lerp, smoothstep, TAU } from '../../../core/math.js';

// A duelist's own animation on the hero's skeleton and animator (anim.js HeroAnimator with a
// per-instance pose table: { loco, duel }). Nothing here mirrors the hero: each duelist has a guard
// STANCE of his own, and every move or reaction is a KEYFRAME CLIP compiled from data (his moves.js).
// createDuelPoses(GUARD) builds the pose functions round one stance (a boss with several stances —
// the Starless Lord's blade forms — builds one set per stance; a compiled clip remembers its set).
//
// Pose channels are anim.js's (P): body space = the waist pivot's axes, +x his LEFT, +y up, +z
// forward; hand targets are offsets from each shoulder (|offset| <= 0.55); feet are model space
// (ground-relative). Blade direction is keyed as [az, el]: azimuth round the body (0 = ahead,
// + = his left) and elevation (rad), so a swing is authored as an arc, never a lerp through the body.
//
// A clip key: { t (s from the clip start), e?: ease of the segment ending here
//   ('s' smooth, the default; 'l' linear; 'i' ease-in (a strike accelerating); 'o' ease-out; 'h' hold),
//   bX bY bZ pitch yaw roll hip hipZ hipX spX spY spZ hdX hdY hdZ two flat rFy lFy   (scalars)
//   rH rP lH lP swF rK lK   ([x, y, z])      rF lF   ([x, z] on the ground, or [x, y, z])
//   sw   ([az, el] of the blade)      lsw   ([az, el] of an off-hand blade, see below)
//   arm ext lead   larm lext llead   (not pose channels: the blade-driven arms, below) }
// The blade-driven arm: with `arm` 1 the sword hand is not keyed but follows the blade, as the hero's
// swings do (anim.js slashH): the fist on a circle round the shoulder at the blade's azimuth (+ `lead`
// rad: the fist runs ahead of the blade into a strike and the blade whips past it after), out to
// `ext` (0 folded … 1 at full reach), higher as the blade rises; the chest and hips turn with the
// blade. `arm` 0..1 blends from the keyed hand, so a clip eases in from the guard. A cut is then
// authored as the blade's path alone, and the arm can never fight the steel.
// The off-hand blade (a stance with `lsw`): its direction is not an animator channel; each evaluation
// leaves it on the animator (A.off = { az, el }) for the actor to pose the second blade with
// (duelist.js). `larm` / `lext` / `llead` drive the left hand from it the same way.
// A field missing from a key is interpolated between the keys that have it; before its first key it
// comes from the stance (the clip starts from his guard) and, unless the clip says `hold: true`, it
// returns to the stance at the clip's end.
// Between keys a field runs on a cubic through them (tangents(), below): a key is a pose he passes
// THROUGH, not a stop. An ease says how a segment arrives at its key ('i' at speed: a strike; 'o' and
// 's' slowing), and what follows it decides whether he comes to rest there: only where a field turns
// back (the cock of a cut, the end of a follow-through that the next cut reverses) does it stand
// still. With every key a stop, a string read as a row of held poses with a snap between them.

const ANK = DIM.ankle;
const SCALAR = {
  bX: P.bodyX, bY: P.bodyY, bZ: P.bodyZ, pitch: P.pitch, yaw: P.yaw, roll: P.roll,
  hip: P.pelvY, hipZ: P.pelvZ, hipX: P.pelvX, spX: P.spX, spY: P.spY, spZ: P.spZ,
  hdX: P.hdX, hdY: P.hdY, hdZ: P.hdZ, two: P.twoHand, flat: P.footFlat, rFy: P.rFy, lFy: P.lFy,
};
const VEC = { rH: P.rH, rP: P.rP, lH: P.lH, lP: P.lP, swF: P.swF, rK: P.rK, lK: P.lK, rF: P.rF, lF: P.lF };
/** The blade-driven arms' channels (not pose channels: evalClip applies them; their guard values). */
const ARM = { arm: 0, ext: 0.75, lead: 0, larm: 0, lext: 0.75, llead: 0 };
const FEET = new Set(['rF', 'lF']);
// what a beat owns (completeBeat): everything but the blades' directions, which carry from cut to cut
const BEAT_FIELDS = [...Object.keys(SCALAR), ...Object.keys(VEC), 'arm', 'larm'];
const LEGS = [P.rF, P.rF + 1, P.rF + 2, P.lF, P.lF + 1, P.lF + 2, P.rK, P.rK + 1, P.rK + 2, P.lK, P.lK + 1, P.lK + 2, P.footFlat, P.rFy, P.lFy, P.rFf, P.lFf,
  P.bodyX, P.bodyY, P.bodyZ, P.pitch, P.roll, P.pelvX, P.pelvY, P.pelvZ, P.spX, P.spZ];
const ARM_R = [0.2, 0.46]; // the fist's radius round the shoulder: folded … full reach
const SCR = new Float32Array(N);
const SCR_W = new Float32Array(N);
// the channels the raised guard (pilot.ward) takes over from his footwork: the arms, the blade, the chest
const WARD_CH = [P.rH, P.rH + 1, P.rH + 2, P.rP, P.rP + 1, P.rP + 2, P.lH, P.lH + 1, P.lH + 2, P.lP, P.lP + 1, P.lP + 2, P.swF, P.swF + 1, P.swF + 2, P.spX, P.spY, P.hdY, P.bodyY, P.pitch];
const AX = { arm: 0, ext: 0.75, lead: 0, larm: 0, lext: 0.75, llead: 0, laz: 0, lel: 0, az: 0, el: 0, keyed: false };

const _az = [0, 0];
/** [az, el] of a direction (body axes). */
export function azEl(x, y, z, out = _az) {
  out[0] = Math.atan2(x, z);
  out[1] = Math.atan2(y, Math.hypot(x, z));
  return out;
}
/** Point the blade along [az, el] (body axes). */
export function setSw(p, az, el) {
  const c = Math.cos(el);
  v3(p, P.swD, c * Math.sin(az), Math.sin(el), c * Math.cos(az));
}

/**
 * The hit jolt (A.recoil 0..1: the pilot's `recoil`, set by the actor when a blow lands on him and
 * decaying over ~0.2 s): the chest and head snap back from the blow, the sword hand is knocked back,
 * the body sags a little. Additive on any pose, so a strike landed mid-move shows without cancelling it.
 */
function jolt(p, A) {
  const k = clamp(A?.recoil ?? 0, 0, 1);
  if (!(k > 0.001)) return;
  p[P.spX] -= 0.24 * k;
  p[P.hdX] -= 0.28 * k;
  p[P.pitch] -= 0.1 * k;
  p[P.bodyZ] -= 0.07 * k;
  p[P.bodyY] -= 0.04 * k;
  p[P.spZ] += 0.08 * k;
  p[P.rH + 2] -= 0.1 * k;
  p[P.rH + 1] += 0.05 * k;
}

/** How high a blade at elevation `el` carries its fist, and how far out: past the vertical (a blade
 *  laid back over the head, el > π/2) the fist keeps rising a little and comes in over the shoulder. */
const HALF_PI = Math.PI / 2;
const armLift = (el) => (el <= HALF_PI ? el : HALF_PI + 0.35 * (el - HALF_PI));
const armOut = (el) => 0.5 + 0.5 * Math.max(-0.6, Math.cos(el));

/**
 * The sword hand (and elbow, chest, hips) from the blade (see the header): blended in by `w`.
 * `az` / `el` are the blade's as KEYED (evalClip), not read back from its direction: a blade keyed
 * past the vertical (el > π/2) reads back with its azimuth turned half a circle, and the fist jumped
 * from before him to behind him in one frame.
 */
function bladeArm(p, w, ext, lead, az, el) {
  if (!(w > 0.001)) return;
  w = Math.min(1, w);
  const e = clamp(ext, 0, 1);
  const ha = az + lead, hs = Math.sin(ha), hc = Math.cos(ha);
  // both hands on the hilt: the fist's circle is smaller and sits toward his middle, where the other
  // hand can follow it (at a one-handed reach the left arm was dragged out straight, 176° at the elbow)
  const two = clamp(p[P.twoHand], 0, 1);
  const r = lerp(ARM_R[0], ARM_R[1], e) * armOut(el) * (1 - 0.2 * two), g = armLift(el);
  // folded, the fist sits nearer shoulder height whatever the blade's pitch (a cocked arm)
  const hy = lerp(-0.18 + g * 0.3, -0.32 + g * 0.55, e) + 0.12 * Math.max(0, hs) * e;
  // … and never far out at his sword side, past where the left hand reaches: the chest turns
  // further with the blade instead (below)
  let hx = hs * r + 0.1 * two;
  if (hx < -0.1) hx = lerp(hx, -0.1 + (hx + 0.1) * 0.3, two);
  to3(p, P.rH, hx, hy, hc * r + 0.12 * e, w);
  to3(p, P.rP, lerp(-0.85, -0.35, e), lerp(-0.4, -0.95, e), lerp(-0.3, -0.4, e), w);
  // the chest and hips turn with the blade, the eyes stay on the opponent
  const tw = clamp(az, -2.3, 2.2);
  p[P.pelvY] += tw * 0.12 * w;
  p[P.spY] += tw * (0.2 + 0.12 * two) * w;
  p[P.hdY] -= tw * (0.24 + 0.12 * two) * w;
  // a blade low across the body leans the chest over it; raised, the chest opens
  p[P.spX] += (0.08 - 0.08 * Math.max(0, Math.min(el, HALF_PI))) * w * e;
}

/** The off hand from the off-hand blade (az, el), the mirror of bladeArm; the chest turns less. */
function offArm(p, w, ext, lead, az, el) {
  if (!(w > 0.001)) return;
  w = Math.min(1, w);
  const e = clamp(ext, 0, 1);
  const ha = az + lead, hs = Math.sin(ha), hc = Math.cos(ha);
  const r = lerp(ARM_R[0], ARM_R[1], e) * armOut(el), g = armLift(el);
  const hy = lerp(-0.18 + g * 0.3, -0.32 + g * 0.55, e) + 0.12 * Math.max(0, -hs) * e;
  to3(p, P.lH, hs * r, hy, hc * r + 0.12 * e, w);
  to3(p, P.lP, lerp(0.85, 0.35, e), lerp(-0.4, -0.95, e), lerp(-0.3, -0.4, e), w);
  const tw = clamp(az, -2.2, 2.3);
  p[P.spY] += tw * 0.1 * w;
}

const T_LIM = 2.2; // the steepest tangent (× the segment's own slope) a cubic takes without overshooting
/**
 * The tangents (per second) of one track at each key: MI[k] the slope it arrives at key k with, MO[k]
 * the slope it leaves with (see the header: an ease names how the segment ENDING at a key runs).
 * `dim` 0 = a scalar track, else the vector's size. Build time only.
 */
function tangents(T, V, E, dim) {
  const n = T.length, MI = new Array(n), MO = new Array(n);
  const nc = dim || 1;
  for (let k = 0; k < n; k++) {
    const mi = new Array(nc), mo = new Array(nc);
    const a = k > 0 ? E[k] : null, b = k < n - 1 ? E[k + 1] : null;
    for (let c = 0; c < nc; c++) {
      const v = (j) => (dim ? V[j][c] : V[j]);
      const dA = a ? (v(k) - v(k - 1)) / Math.max(1e-6, T[k] - T[k - 1]) : 0;
      const dB = b ? (v(k + 1) - v(k)) / Math.max(1e-6, T[k + 1] - T[k]) : 0;
      const same = dA * dB > 0;
      const flow = same ? (2 * dA * dB) / (dA + dB) : 0; // (the harmonic mean: never past either slope)
      const cap = (m, d) => Math.sign(d) * Math.min(Math.abs(m), T_LIM * Math.abs(d));
      // arriving
      let i_ = 0;
      if (a === 'l') i_ = dA;
      else if (a === 'i') i_ = 2 * dA;
      else if (a === 's' || a === 'o') i_ = b === null || b === 'h' ? 0 : b === 'l' ? (same ? cap(dB, dA) : 0) : flow;
      // leaving
      let o_ = 0;
      if (b === 'l') o_ = dB;
      else if (b === 'o') o_ = (a === 'i' || a === 'l') && same ? cap(i_, dB) : 2 * dB;
      else if (b === 's' || b === 'i') o_ = a === null || a === 'h' ? 0 : a === 'l' || a === 'i' ? (same ? cap(i_, dB) : 0) : flow;
      mi[c] = i_;
      mo[c] = o_;
    }
    MI[k] = dim ? mi : mi[0];
    MO[k] = dim ? mo : mo[0];
  }
  return { MI, MO };
}

/**
 * The pose functions round one guard stance. `GUARD`: every SCALAR and VEC field, `sw` [az, el], and
 * optionally `lsw` [az, el] (an off-hand blade). `opt.run`: how the blade is carried at a run
 * ({ hand, pole, blade [az, el], flat }). `opt.breath`: { k (the breath's size, 1 = the default),
 * period (s) }: a heavier, slower breath for a bigger man.
 */
export function createDuelPoses(GUARD, opt = {}) {
  const RUN = { hand: [-0.13, -0.42, -0.1], pole: [-0.8, -0.3, -0.5], blade: [-2.55, -0.42], flat: [0.2, 1, 0], ...(opt.run ?? {}) };
  const BR = { k: 1, period: 2.8, ...(opt.breath ?? {}) };
  const OFF = Array.isArray(GUARD.lsw) ? GUARD.lsw : null;
  const api = {};

  /** Leave the off-hand blade's direction on the animator for the actor. */
  const setOff = (A, az, el) => {
    if (!A) return;
    const o = A.off ?? (A.off = { az: 0, el: 0 });
    o.az = az;
    o.el = el;
  };

  /** Write the guard into p (with a slow breath when `A` has a time). */
  function duelStance(p, A) {
    const G = GUARD;
    const ph = (A?.time ?? 0) * (TAU / BR.period);
    const br = Math.sin(ph) * BR.k, sw = Math.sin(ph * 0.5 + 0.7);
    for (const k in SCALAR) p[SCALAR[k]] = G[k];
    for (const k in VEC) v3(p, VEC[k], G[k][0], G[k][1], G[k][2]);
    p[P.bodyY] += 0.006 * br;
    p[P.spX] += 0.012 * br;
    p[P.bodyX] += 0.006 * sw;
    p[P.lH + 1] += 0.008 * br;
    p[P.rH + 1] += 0.004 * (BR.k - 1) * Math.sin(ph); // (a heavier breath lifts the sword hand too)
    setSw(p, G.sw[0] + 0.012 * sw, G.sw[1] + 0.01 * br);
    if (OFF) setOff(A, OFF[0] - 0.012 * sw, OFF[1] + 0.01 * br);
    p[P.rFf] = 1;
    p[P.lFf] = 1;
    p[P.flask] = 0;
  }

  /**
   * Locomotion: his guard on the hero's gait. Walking and circling he keeps the guard up; at a run
   * the blade trails low behind him and the free arm swings. The legs, hips and the body's bob and
   * lean come from the hero's gait (anim.js loco), so the foot planner keeps his feet planted.
   */
  function duelLoco(p, A) {
    duelStance(p, A);
    const w = A.moveW;
    if (w < 0.002 && A.swordW < 0.002) {
      raiseWard(p, A);
      turnTwist(p, A);
      jolt(p, A);
      return;
    }
    // the hero's gait into scratch, without its turn twist (applied once, below, to the whole pose)
    const lag = A.turnLag;
    A.turnLag = 0;
    loco(SCR, A);
    A.turnLag = lag;
    // circling he keeps his body turned (the stance's yaw); running he squares up to the run
    const runK = smoothstep(2.4, 4.2, A.speedS);
    for (const i of LEGS) p[i] += (SCR[i] - p[i]) * w;
    // (walking he keeps most of his side-on guard; running he squares up to the run)
    p[P.yaw] = lerp(GUARD.yaw, lerp(0.45, 0.06, runK), w);
    p[P.spY] = lerp(GUARD.spY, 0, runK);
    p[P.hdY] = lerp(GUARD.hdY + 0.06, -0.04, runK);
    // the sword arm: guard while walking → trailing low behind at a run
    const k = runK * w;
    to3(p, P.rH, RUN.hand[0], RUN.hand[1], RUN.hand[2], k);
    to3(p, P.rP, RUN.pole[0], RUN.pole[1], RUN.pole[2], k);
    {
      const a0 = Math.atan2(p[P.swD], p[P.swD + 2]), e0 = Math.asin(clamp(p[P.swD + 1], -1, 1));
      setSw(p, lerp(a0, RUN.blade[0], k), lerp(e0, RUN.blade[1], k));
    }
    to3(p, P.swF, RUN.flat[0], RUN.flat[1], RUN.flat[2], k);
    if (OFF) {
      // the off-hand blade trails on its own side, its hand low behind the hip
      to3(p, P.lH, -RUN.hand[0], RUN.hand[1], RUN.hand[2], k);
      to3(p, P.lP, -RUN.pole[0], RUN.pole[1], RUN.pole[2], k);
      const o = A.off;
      if (o) setOff(A, lerp(o.az, -RUN.blade[0], k), lerp(o.el, RUN.blade[1], k));
    } else {
      // the free arm: it comes down to swing with the stride at a run
      to3(p, P.lH, SCR[P.lH], SCR[P.lH + 1], SCR[P.lH + 2], k);
      to3(p, P.lP, SCR[P.lP], SCR[P.lP + 1], SCR[P.lP + 2], k);
    }
    raiseWard(p, A);
    turnTwist(p, A);
    jolt(p, A);
  }

  /** The guard RAISED over his footwork (the pilot's `ward` 0..1 and `wardClip`, guard.js wardHold):
   *  the hero is swinging at him and he will turn it. The arms, the blade and the chest take the
   *  ward's pose; the legs keep walking. */
  function raiseWard(p, A) {
    const k = clamp(A.player?.ward ?? 0, 0, 1), clip = A.player?.wardClip;
    if (!(k > 0.002) || !clip?.tracks) return;
    const off = A.off ? A.off.az : 0, offE = A.off ? A.off.el : 0;
    const rc = A.recoil;
    A.recoil = 0; // (the jolt is applied once, by the caller)
    (clip.kit && clip.kit !== api ? clip.kit : api).evalClip(SCR_W, clip, 0, A);
    A.recoil = rc;
    if (A.off) {
      A.off.az = off; // (the off-hand blade keeps its carry)
      A.off.el = offE;
    }
    const e = k * k * (3 - 2 * k);
    const ax = p[P.swD], ay = p[P.swD + 1], az = p[P.swD + 2];
    for (const i of WARD_CH) p[i] += (SCR_W[i] - p[i]) * e;
    dirLerp(p, P.swD, ax, ay, az, SCR_W[P.swD], SCR_W[P.swD + 1], SCR_W[P.swD + 2], e);
  }

  /** A field's value in the guard (the implicit first / last key). */
  function guardValue(k) {
    if (k === 'sw') return [GUARD.sw[0], GUARD.sw[1]];
    if (k === 'lsw') return OFF ? [OFF[0], OFF[1]] : [0.5, -0.9];
    if (k in ARM) return ARM[k];
    const v = GUARD[k];
    return Array.isArray(v) ? v.slice() : v;
  }

  function normValue(k, v) {
    if (FEET.has(k) && Array.isArray(v) && v.length === 2) return [v[0], ANK, v[1]];
    return Array.isArray(v) ? v.slice() : v;
  }

  /**
   * Compile keys into tracks. `keys`: [{ t, e?, ...fields }] (any order; t in seconds), `dur` the clip's
   * length, `hold` (default false): the fields keep their last keyed value to the end instead of
   * returning to the guard by `dur`. Build time only (allocates).
   */
  function compileClip(keys, dur, { hold = false } = {}) {
    const list = keys.filter((k) => k && Number.isFinite(k.t)).sort((a, b) => a.t - b.t);
    const fields = new Set();
    for (const k of list) for (const f of Object.keys(k)) if (f !== 't' && f !== 'e' && (f in SCALAR || f in VEC || f in ARM || f === 'sw' || f === 'lsw')) fields.add(f);
    const tracks = [];
    for (const f of fields) {
      const T = [], V = [], E = [];
      const first = list.find((k) => f in k);
      if (first.t > 1e-4) {
        T.push(0);
        V.push(guardValue(f));
        E.push('s');
      }
      for (const k of list) {
        if (!(f in k)) continue;
        T.push(k.t);
        V.push(normValue(f, k[f]));
        E.push(k.e ?? 's');
      }
      if (!hold && T[T.length - 1] < dur - 1e-4) {
        T.push(dur);
        V.push(guardValue(f));
        E.push('s');
      }
      const dim = f in VEC ? 3 : f === 'sw' || f === 'lsw' ? 2 : 0;
      const { MI, MO } = tangents(T, V, E, dim);
      tracks.push({ f, T, V, E, MI, MO, vec: f in VEC, sw: f === 'sw', lsw: f === 'lsw', arm: f in ARM, ch: f in VEC ? VEC[f] : SCALAR[f] });
    }
    return { tracks, dur, kit: api };
  }

  /**
   * One beat's keys made whole: a field NONE of them sets is written with its guard value on the
   * beat's first and last key. Without it a field keyed by an earlier beat (a chop's bowed chest and
   * two-handed grip, a kick's lifted foot, the blade-driven arm) ran on through every later beat that
   * did not mention it, until the clip's end. `keys`: [{ t, ...pose }] of one beat, in time order.
   */
  function completeBeat(keys) {
    if (!keys.length) return keys;
    const has = new Set();
    for (const k of keys) for (const f in k) has.add(f);
    const first = keys[0], last = keys[keys.length - 1];
    for (const f of BEAT_FIELDS) {
      if (has.has(f)) continue;
      first[f] = guardValue(f);
      if (last !== first) last[f] = guardValue(f);
    }
    return keys;
  }

  /** Evaluate a compiled clip at time t into p (over the guard). */
  function evalClip(p, clip, t, A) {
    duelStance(p, A);
    AX.arm = ARM.arm;
    AX.ext = ARM.ext;
    AX.lead = ARM.lead;
    AX.larm = ARM.larm;
    AX.lext = ARM.lext;
    AX.llead = ARM.llead;
    AX.laz = A?.off?.az ?? (OFF ? OFF[0] : 0);
    AX.lel = A?.off?.el ?? (OFF ? OFF[1] : 0);
    AX.keyed = false;
    if (!clip?.tracks) {
      jolt(p, A);
      return;
    }
    for (const tr of clip.tracks) {
      const T = tr.T, n = T.length;
      let i = 1;
      while (i < n && t > T[i]) i++;
      // the cubic of this segment: h00 a + h10 (h m0) + h01 b + h11 (h m1); a held key keeps a
      let a, b, m0 = null, m1 = null, h00 = 1, h10 = 0, h01 = 0, h11 = 0;
      if (i >= n) a = b = tr.V[n - 1];
      else if (t <= T[0]) a = b = tr.V[0];
      else {
        a = tr.V[i - 1];
        b = tr.V[i];
        if (tr.E[i] !== 'h') {
          const h = Math.max(1e-6, T[i] - T[i - 1]), u = clamp((t - T[i - 1]) / h, 0, 1), u2 = u * u, u3 = u2 * u;
          h00 = 2 * u3 - 3 * u2 + 1;
          h10 = (u3 - 2 * u2 + u) * h;
          h01 = -2 * u3 + 3 * u2;
          h11 = (u3 - u2) * h;
          m0 = tr.MO[i - 1];
          m1 = tr.MI[i];
        }
      }
      if (tr.sw || tr.lsw || tr.vec) {
        const x = m0 ? h00 * a[0] + h10 * m0[0] + h01 * b[0] + h11 * m1[0] : a[0];
        const y = m0 ? h00 * a[1] + h10 * m0[1] + h01 * b[1] + h11 * m1[1] : a[1];
        if (tr.sw) {
          AX.az = x;
          AX.el = y;
          AX.keyed = true;
          setSw(p, x, y);
        } else if (tr.lsw) {
          AX.laz = x;
          AX.lel = y;
        } else v3(p, tr.ch, x, y, m0 ? h00 * a[2] + h10 * m0[2] + h01 * b[2] + h11 * m1[2] : a[2]);
      } else {
        const x = m0 !== null ? h00 * a + h10 * m0 + h01 * b + h11 * m1 : a;
        if (tr.arm) AX[tr.f] = x;
        else p[tr.ch] = x;
      }
    }
    if (AX.arm > 0.001) {
      // (a clip that never keys the blade: its direction is the stance's, read back once)
      if (!AX.keyed) {
        AX.az = Math.atan2(p[P.swD], p[P.swD + 2]);
        AX.el = Math.asin(clamp(p[P.swD + 1], -1, 1));
      }
      bladeArm(p, AX.arm, AX.ext, AX.lead, AX.az, AX.el);
    }
    if (OFF || AX.larm > 0.001) {
      setOff(A, AX.laz, AX.lel);
      offArm(p, AX.larm, AX.lext, AX.llead, AX.laz, AX.lel);
    }
    jolt(p, A);
  }

  /** The clip the animator plays under the key 'duel': the pilot's atk.def is a compiled clip. A
   *  clip compiled round another stance (a blade form just left) is evaluated by its own set. */
  function duelClip(p, A) {
    const kit = A.def?.kit;
    if (kit && kit !== api) kit.evalClip(p, A.def, A.t, A);
    else evalClip(p, A.def, A.t, A);
  }

  Object.assign(api, { GUARD, duelStance, duelLoco, compileClip, completeBeat, evalClip, duelClip, POSES: Object.freeze({ loco: duelLoco, duel: duelClip }) });
  return api;
}

export { dirLerp };
