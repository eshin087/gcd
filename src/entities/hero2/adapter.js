// The remade hero, PLAYABLE (`?hero=new` without `show`): the gameplay adapter. It stands in for today's
// animator (player.anim) with the same surface, and plays the recorded clips on the remade hero:
//
//   - today's animator keeps running on today's rig (hidden: its meshes are not drawn), so everything
//     the player's code reads from it (noise(), kickCoat(), spell, forceVariant, the flurry's clips,
//     every joint of the rig) works as before; every other property reads through to it;
//   - the remade hero (createHero2, applyRoot false: the GAME moves him, the clips' root motion is not
//     used) stands where the player stands, facing his yaw, and plays what moves.js maps each state to;
//   - after the player's matrices are updated (player.js calls anim.afterWorld, a no-op on today's
//     animator) the remade hero's joints are put on today's rig, so the hit test (SwordSweep reads
//     rig.sword.matrixWorld, then un-leans it as before) and the effects read the REMADE hero. Mirrored:
//     the sword (and the gem, its child), the chest, the pelvis, the head, both upper arms, both legs'
//     thigh / shin / foot.
//
// LOCOMOTION (moves.js LOCO). The travel direction relative to his facing picks a SECTOR (F the plain
// gaits, L / R the side steps, B the backpedal; 50 / 130 degree edges with a little hysteresis, the legs
// turned at the hips the rest of the way); inside it a speed-matched blend over idle and the sector's
// loops, phase-synced (each loop's right plant starts its cycle), run at the rate that makes the feet
// match the ground speed (a strafe loop at most LOCO.rateMax x its own; the pin stretches the rest).
// One-shots on top, each handing back to the blend at the matching phase:
//   start   from standing, setting off the way he faces: the clip played by DISTANCE (its own travel
//           matched to the game's, 1..start.rateMax x real speed)
//   stop    the input ends while moving forward: the stop (the foot variant whose legs match his pose),
//           entered where its remaining travel is the game's remaining slide, by distance, then the settle
//   pivot   the input reverses at speed: the pivot; its ROOT YAW is drawn (the body at the yaw he had
//           when it began plus the clip's root yaw), the game's own yaw (which turns him in a quarter of
//           a second) catches up under it, and the difference fades out when it hands back
//   turn    standing, the aim swings past LOCO.turn.minAngle: the turn on the spot, drawn the same way
// The game's yaw is never changed: the body is drawn turned against it (turnAll) while a clip's root
// yaw leads, so the gameplay facing (attacks commit to it) stays the game's.
import * as THREE from 'three';
import { createHero2, createClipPlayer } from './engine.js';
import { fitTime } from './fit.js';
import { J, JI, createPose, createWorld, restOffsets, solveFK } from './skeleton.js';
import { qmul, qconjmul, qaxis, qrot, smooth01, fin } from './qmath.js';
import { sampleClip } from './clip.js';
import { LOCO, ATTACKS, ATTACK_DEFAULT, STATES, STATE_DEFAULT, ROLLS, HEAL, RECOVER, FACE, resolveClip, resolveAll } from './moves.js';
import { TUNE } from '../player/player.js';

const TAU = Math.PI * 2;
const wrap = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const plantStart = (c, side) => (c.contact[side]?.[0]?.[0] ?? 0) / c.n;

// ------------------------------------------------------------------ clip measures (once per clip)
const _travel = new WeakMap();
/** A one-shot's ground travel up to each frame (m, the root's path). */
export function travelOf(c) {
  let T = _travel.get(c);
  if (T) return T;
  T = new Float32Array(c.n);
  const R = c.root;
  for (let f = 1; f < c.n; f++) T[f] = T[f - 1] + Math.hypot(R[f * 3] - R[f * 3 - 3], R[f * 3 + 1] - R[f * 3 - 2]);
  _travel.set(c, T);
  return T;
}
/** The (fractional) frame where the clip's travel reaches d. */
export function frameAtTravel(c, d) {
  const T = travelOf(c), n = c.n;
  if (d <= 0) return 0;
  if (d >= T[n - 1]) return n - 1;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (T[m] < d) lo = m;
    else hi = m;
  }
  const s = T[hi] - T[lo];
  return lo + (s > 1e-6 ? (d - T[lo]) / s : 0);
}
/** The clip's travel at frame position u (m). */
export function travelAt(c, u) {
  const T = travelOf(c), n = c.n;
  u = clamp(u, 0, n - 1);
  const i = Math.min(n - 2, Math.floor(u));
  return n < 2 ? 0 : T[i] + (T[i + 1] - T[i]) * (u - i);
}
/** The root's yaw at frame position u (unwrapped as stored). */
export function rootYaw(c, u) {
  const n = c.n, R = c.root;
  u = clamp(u, 0, n - 1);
  const i = Math.min(n - 2, Math.floor(u)), t = u - i;
  if (n < 2) return 0;
  return R[i * 3 + 2] + (R[i * 3 + 5] - R[i * 3 + 2]) * t;
}
/** A one-shot's net forward travel (m, along his facing at frame 0). */
export const forwardTravel = (c) => c.root[(c.n - 1) * 3 + 1];
/** The direction a one-shot travels, in his own frame (rad, + = to his left). */
export const travelDir = (c) => Math.atan2(c.root[(c.n - 1) * 3], c.root[(c.n - 1) * 3 + 1]);
/** A clip's landing frame (its `land` event), else `fallback`. */
export const landFrame = (c, fallback) => c.events.find((e) => e.name === 'land')?.f ?? fallback;

// the legs' pose distance (pose matching: a hand-off to a loop at its matching phase, a stop's foot)
const LEGJ = [JI.thighL, JI.shinL, JI.footL, JI.thighR, JI.shinR, JI.footR];
const _pa = createPose(), _pb = createPose();
function legDist(qa, qb) {
  let d = 0;
  for (let k = 0; k < LEGJ.length; k++) {
    const i = LEGJ[k] * 4;
    d += 1 - Math.abs(qa[i] * qb[i] + qa[i + 1] * qb[i + 1] + qa[i + 2] * qb[i + 2] + qa[i + 3] * qb[i + 3]);
  }
  return d;
}
/** The frame of loop `cyc` whose legs best match clip `c` at frame u (or a given pose's q). */
export function matchFrame(cyc, q) {
  let best = 0, bd = Infinity;
  for (let f = 0; f < cyc.n; f++) {
    sampleClip(cyc, f, _pb);
    const d = legDist(q, _pb.q);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return { f: best, d: bd };
}
const clipQ = (c, u) => (sampleClip(c, u, _pa), _pa.q);

const _T = new Float64Array(8);
/** The whole figure turned by a about his root (the hips, and with them everything). */
export function turnAll(pose, a) {
  const q = pose.q, hi = JI.hips * 4, T = _T;
  qaxis(T, 0, 0, 1, 0, a);
  qmul(T, 4, T, 0, q, hi);
  q[hi] = T[4];
  q[hi + 1] = T[5];
  q[hi + 2] = T[6];
  q[hi + 3] = T[7];
  const c = Math.cos(a), s = Math.sin(a), x = pose.hips[0], z = pose.hips[2];
  pose.hips[0] = c * x + s * z;
  pose.hips[2] = -s * x + c * z;
}

/** An attack clip's aim: the turn that puts its blade straight ahead of him at its hit (the footage's
 *  swings are not all filmed toward the camera's axis); measured once per clip. */
const _aims = new WeakMap(), _aps = new WeakMap();
const _aw = createWorld(), _arest = restOffsets(), _av = new Float64Array(3);
export function aimOf(lib, c) {
  let aims = _aims.get(lib);
  if (!aims) _aims.set(lib, (aims = new Map()));
  if (aims.has(c.name)) return aims.get(c.name);
  let _ap = _aps.get(lib);
  if (!_ap) _aps.set(lib, (_ap = createClipPlayer(lib, { warn: () => {} })));
  let a = 0;
  try {
    const f = c.events.find((e) => e.name === 'hit')?.f ?? (c.phases ? (c.phases.windup + c.phases.active) * 0.5 : c.n * 0.5);
    _ap.play(c.name, { fade: 0, manual: true });
    _ap.setTime(f / c.fps);
    _ap.update(0);
    _ap.pose.hips[0] = c.hips[0];
    _ap.pose.hips[2] = c.hips[2];
    solveFK(_ap.pose, _arest, _aw);
    const j = JI.weaponR;
    qrot(_av, 0, _aw.r, j * 4, 0, 0, 1.2);
    const x = _aw.p[j * 3] + _av[0], z = _aw.p[j * 3 + 2] + _av[2];
    a = -Math.atan2(x - c.hips[0], z - c.hips[2]);
    if (!Number.isFinite(a)) a = 0;
  } catch {
    a = 0;
  }
  aims.set(c.name, a);
  return a;
}

/** The attack correction the game plays (and the suite measures): the hips held over his root where the
 *  clip began (the game moves him), the clip turned by its aim. */
export function fixAttackPose(pose, c, aim) {
  pose.hips[0] = c.hips[0];
  pose.hips[2] = c.hips[2];
  if (Math.abs(aim) > 1e-3) turnAll(pose, aim);
}

/** An attack clip's time (s) at game time t of the attack def `win` (fit.js), optionally begun at frame
 *  `u0` (the release of a held coil: the game's windup runs from there to the clip's coil) and with the
 *  game's free moment on frame `recF` (moves.js recoverAt) instead of the clip's `recover`. */
const _ps = { fps: 60, dur: 1, phases: { windup: 1, active: 2, recover: 3 } };
export function attackTime(c, t, win, u0 = 0, recF = null) {
  const ph = c?.phases;
  if (!ph || (!(u0 > 0) && recF == null)) return fitTime(c, t, win);
  const W = ph.windup, A = ph.active;
  u0 = clamp(fin(u0, 0), 0, Math.max(0, W - 2));
  const Rf = recF != null ? clamp(recF, A + 1, c.n - 1) : ph.recover;
  _ps.fps = c.fps;
  _ps.dur = c.dur - u0 / c.fps;
  _ps.phases.windup = W - u0;
  _ps.phases.active = A - u0;
  _ps.phases.recover = Rf - u0;
  return u0 / c.fps + fitTime(_ps, t, win);
}
/** A clip's event frame by name (or null). */
export const eventFrame = (c, name) => c?.events?.find((e) => e.name === name)?.f ?? null;
/** The frames a held coil plays to and holds (`holdAt`, else the clip's holdStart / holdEnd events). */
export function holdFrames(c, e) {
  if (e?.holdAt != null) return [e.holdAt, e.holdAt];
  const hs = eventFrame(c, 'holdStart') ?? (c.phases ? c.phases.windup : c.n * 0.4);
  return [hs, Math.max(hs, eventFrame(c, 'holdEnd') ?? hs)];
}

/** Piecewise-straight game time -> frame through knots (flat [t0, f0, t1, f1, ...], k pairs); after the
 *  last, `tail` x real speed. */
function knotFrame(K, k, t, tail, fps) {
  if (k <= 0) return 0;
  if (t <= K[0]) return K[1];
  for (let i = 1; i < k; i++) {
    const t1 = K[i * 2];
    if (t <= t1) {
      const t0 = K[i * 2 - 2], f0 = K[i * 2 - 1], f1 = K[i * 2 + 1];
      return t1 - t0 > 1e-6 ? f0 + ((f1 - f0) * (t - t0)) / (t1 - t0) : f1;
    }
  }
  return K[k * 2 - 1] + (t - K[k * 2 - 2]) * fps * tail;
}

const CENTER = { F: 0, L: Math.PI / 2, R: -Math.PI / 2, B: Math.PI };

/**
 * The adapter. `old`: today's animator (it keeps running); `body`: the remade hero's body (body.js or
 * debugBody.js), already in the scene. Returns { proxy (what player.anim becomes), hero, rewrap(old) }.
 */
export function createAdapter(game, player, old, { lib, body }) {
  const hero = createHero2(game, { body, library: lib, applyRoot: false });
  // the game's hero never lets go of his sword (R); the left hand holds what the clips give it (the flask)
  hero.props = { R: 'sword', L: undefined };
  hero.syncProps();
  const obj = body.object3d;

  // ---- the clips (resolved once)
  const idleC = resolveClip(lib, LOCO.idle), fightC = resolveClip(lib, LOCO.fightIdle) ?? idleC;
  const loopOf = (c) => ({ c, v: c.speed ?? Math.hypot(c.cyc[0], c.cyc[1]) / c.dur, off: plantStart(c, 'R') });
  const sectors = {};
  for (const k of ['F', 'L', 'R', 'B']) {
    sectors[k] = (LOCO.sectors[k] ?? [])
      .map((e) => resolveClip(lib, e))
      .filter((c) => c && c.loop)
      .map(loopOf)
      .filter((g) => g.v > 0.1)
      .sort((a, b) => a.v - b.v);
  }
  if (!sectors.F.length) for (const k of ['L', 'R', 'B']) sectors[k] = [];
  const GAITS = ['walk', 'run', 'sprint'];
  const loopFor = (name) => sectors.F.find((g) => g.c.name === name) ?? sectors.F[sectors.F.length > 1 ? 1 : 0] ?? null;
  const starts = {}, stops = {}, pivots = {}, turns = {};
  for (const k of GAITS) {
    starts[k] = resolveClip(lib, LOCO.start[k]);
    stops[k] = resolveAll(lib, LOCO.stop[k], (c) => !c.loop && forwardTravel(c) >= LOCO.stop.minTravel);
    pivots[k] = resolveClip(lib, LOCO.pivot[k]);
  }
  for (const k of ['L90', 'R90', 'L180', 'R180']) turns[k] = resolveClip(lib, LOCO.turn[k]);
  const drinkC = resolveClip(lib, HEAL.drink), emptyC = resolveClip(lib, HEAL.empty);

  // ---- state
  const S = {
    mode: 'loco', key: 'loco', prevKey: '', entry: null, clip: null,
    phi: 0, vs: 0, loop: '', locoT: 0, legYaw: 0, aim: 0, idleU: 0, gait: 'walk', sector: 'F', cs: 1, csWant: 1,
    u: 0, dist: 0, Y0: 0, settled: fin(player.yaw), rollTurn: 0, heal: false, yawOff: 0,
    K: new Float64Array(16), k: 0, tail: 1,
    // attacks: the clip now and the one it chained from, a coil's start frame, the free frame
    atkClip: null, atkPrev: null, u0: 0, recF: null, tailAim: 0,
    // a held coil (the charge, the draw stance): its clip and the frame it stands at
    chargeClip: null, cu: 0, cu0: 0,
    // the end facing kept as drawn (moves.js FACE): fading over the steps; a turn's root yaw scale
    faceOff: 0, turnK: 1, yawBase: 0, blockBeat: false, blockBeatT: 0, turnUpper: false, tailHips: false,
  };
  // the guard's own facing (rad, the hips' yaw in its first frame): what a clip's end facing is read against
  const hipsYaw = (q) => {
    qrot(_fv, 0, q, JI.hips * 4, 0, 0, 1);
    return Math.atan2(_fv[0], _fv[2]);
  };
  const _fv = new Float64Array(3);
  const idleFace = { fight: fightC ? hipsYaw(clipQ(fightC, 0)) : 0, plain: idleC ? hipsYaw(clipQ(idleC, 0)) : 0 };
  /** How far the body is drawn turned off the guard's facing now (rad, + = to his left). */
  const faceNow = () => {
    const fight = player.lockOn || game?.state === 'boss' || player.debug?.fightStance === true;
    return wrap(hipsYaw(hero.world.r) - (fight ? idleFace.fight : idleFace.plain));
  };
  let A = null; // the proxy (set below)
  let oldAnim = old;

  const setContact = (v) => (S.csWant = Math.max(0, Math.min(1, fin(v, 1))));
  const intentLen = () => fin(player.intent?.len, 0);
  /** Where the game will face him for a travel direction (the sprint faces the travel, else his aim). */
  const faceFor = (moveYaw) => {
    if (player.state === 'sprint' || player.intent?.sprint) return moveYaw;
    try {
      return fin(player._aimYaw?.(moveYaw), moveYaw);
    } catch {
      return moveYaw;
    }
  };
  /** A game duration by name (moves.js knots). */
  const mark = (v) => {
    if (typeof v === 'number') return v;
    switch (v) {
      case 'stagger':
        return fin(player.staggerLen, TUNE.staggerDur);
      case 'guardBreak':
        return player.state === 'guardBreak' ? TUNE.guardBreakDur : fin(player.staggerLen, TUNE.staggerDur);
      case 'knockdown':
        return TUNE.knockdownDur;
      case 'getUp':
        return TUNE.knockdownDur - TUNE.getUpIframes;
      case 'heal':
        return TUNE.heal.dur;
      case 'parry':
        return fin(TUNE.parryDur, 0.3);
      case 'bounce':
        return fin(TUNE.bounceDur, 0.42);
      default:
        return 0;
    }
  };

  /** The heal's layer off (a state that is not standing / walking takes the arms). */
  function healOff(keepTail) {
    if (!S.heal) return;
    S.heal = false;
    if (keepTail) hero.layerTime(null); // it runs on at its own speed and fades itself at its end
    else hero.layer(null, { fade: 0.1 });
  }

  /**
   * A clip hands back to the game (an attack, its recovery): the turn his body ends in (moves.js FACE)
   * is kept as drawn. Standing: the quarter turn on the spot back to his facing (true: it started);
   * moving: the turn fades out over his steps (S.faceOff). Call after toLoco.
   */
  function keepFacing(d) {
    if (!(Math.abs(d) >= FACE.min)) return false;
    // the blend from the drawn pose: that pose is already turned by d, and what follows is drawn turned
    // by d on top of the blend (turnAll in onPose): the pose it fades from is taken back by d first
    turnAll(hero.pose, -d);
    hero.transition(0.25);
    if (intentLen() < 0.1 && S.vs < 0.6) {
      const c = turns[d < 0 ? 'L90' : 'R90'];
      if (c) {
        const from = Math.min(c.n - 2, fin(FACE.from, 0));
        const span = rootYaw(c, c.n - 1) - rootYaw(c, from);
        if (Math.abs(span) > 0.3) {
          startOne('turn', c, from, { speed: fin(FACE.speed, 1), loop: false });
          S.Y0 = fin(player.yaw) + d;
          S.turnK = -d / span;
          S.yawBase = rootYaw(c, from);
          S.settled = fin(player.yaw);
          // (the turns on the spot are filmed unarmed, arms hanging: the sword's guard stays on the upper
          // body while the legs step round)
          const up = fightC ?? idleC;
          if (up && up.loop) {
            hero.layer(up.name, { mask: 'upper', weight: 1, fade: 0.12, loop: true });
            S.turnUpper = true;
          }
          return true;
        }
      }
    }
    S.faceOff = d;
    return false;
  }

  /** Enter what the player's state asks for (from play(key)). */
  function enter(key, blend) {
    S.prevKey = S.key;
    S.key = key;
    const wasMode = S.mode, wasAtk = S.mode === 'attack' ? S.atkClip : null;
    if (S.turnUpper) {
      S.turnUpper = false;
      hero.layer(null, { fade: 0.15 });
    }
    if (key !== 'loco' && key !== 'heal') S.faceOff = 0; // (the state's own blend takes it from the drawn pose)
    if (S.blockBeat) {
      S.blockBeat = false;
      hero.layer(null, { fade: 0.1 });
    }
    const tr = () => hero.transition(Math.max(0.04, Math.min(0.25, fin(blend, 0.15))));
    if (key !== 'heal') healOff(key === 'loco');
    else {
      // the flask: an upper-body layer, the legs go on walking / standing
      S.entry = STATES.heal;
      if (S.mode !== 'loco') {
        tr();
        toLoco(0, false);
      }
      if (drinkC) {
        S.heal = true;
        const K = HEAL.drink.knots;
        S.k = Math.min(8, K.length);
        for (let i = 0; i < S.k; i++) {
          S.K[i * 2] = mark(K[i][0]);
          S.K[i * 2 + 1] = K[i][1];
        }
        hero.layer(drinkC.name, { mask: 'upper', weight: 1, fade: 0.12, speed: fin(HEAL.drink.tail, 1), loop: false, out: 0.25 });
        hero.layerTime(S.K[1] / drinkC.fps);
      }
      return;
    }
    if (key === 'loco') {
      // the chain stops at this swing: its recovery back to the guard, while he stands
      if (S.mode === 'attack' && intentLen() < 0.1 && S.clip) {
        if (S.entry?.recover === 'self' && hero.clip === S.clip && !hero.done) {
          // the same clip plays on at real speed to its end (the riposte's pull and settle)
          S.mode = 'tail';
          S.entry = { settle: 1 };
          S.tailAim = S.aim;
          S.tailHips = true;
          hero.play(S.clip.name, { fade: 0, at: hero.time, loop: false });
          setContact(1);
          return;
        }
        const rn = S.entry?.recover ?? RECOVER[S.clip.name];
        const rc = rn && rn !== 'self' ? resolveClip(lib, { want: rn }) : null;
        if (rc) {
          S.mode = 'tail';
          S.clip = rc;
          S.entry = { settle: 1 };
          S.yawOff = 0;
          S.tailAim = S.aim; // the swing's aim carried on through its recovery
          S.tailHips = false;
          hero.transition(0.12);
          hero.cut(rc.name, { loop: false });
          setContact(1);
          return;
        }
      }
      // a state's clip that plays on to its end while he stands (a get-up, a flinch's recovery)
      if (S.mode === 'track' && S.entry?.settle && intentLen() < 0.1 && S.clip && !hero.done) {
        S.mode = 'tail';
        S.tailAim = 0;
        S.tailHips = false;
        hero.play(S.clip.name, { fade: 0, at: hero.time, speed: S.entry.settle, loop: false });
        setContact(1);
        return;
      }
      const d = wasMode === 'attack' || wasMode === 'tail' ? faceNow() : 0;
      tr();
      toLoco(0, false);
      keepFacing(d);
      return;
    }
    S.entry = null;
    S.clip = null;
    S.yawOff = 0;
    if (key === 'attack') {
      const def = player.atk?.def;
      const e = ATTACKS[def?.name] ?? ATTACK_DEFAULT;
      // which clip: a held coil's release goes on with the coil's clip; a swing straight after the one
      // the footage chains it from plays the footage's next; out of a sprint, the running one
      let c = null, u0 = 0;
      if (e.from === 'charge' && wasMode === 'charge' && S.chargeClip) {
        c = S.chargeClip;
        u0 = S.cu;
      } else if (e.after && wasAtk && e.after[wasAtk] && lib.has(e.after[wasAtk])) c = lib.get(e.after[wasAtk]);
      else if (e.sprint && S.prevKey === 'loco' && S.vs > TUNE.runSpeed * 1.05 && lib.has(e.sprint)) c = lib.get(e.sprint);
      c = c ?? resolveClip(lib, e) ?? resolveClip(lib, ATTACK_DEFAULT);
      if (c) {
        tr();
        S.atkPrev = wasAtk;
        S.atkClip = c.name;
        S.u0 = u0;
        const rf = e.recoverAt ? eventFrame(c, e.recoverAt) : null;
        S.recF = rf;
        S.mode = 'attack';
        S.entry = e;
        S.clip = c;
        // the clip's own facing when it says so (`face`: +Z is the aim at 0), else measured
        S.aim = e.aim ?? (c.face != null ? -c.face : aimOf(lib, c));
        hero.cut(c.name, { manual: true, at: u0 / c.fps });
        setContact(e.contact ?? 1);
        return;
      }
    }
    let e = STATES[key] ?? STATE_DEFAULT;
    // One Breath's draw stance plays on the flurry's key
    if (key === 'flurry' && player.state === 'iai' && STATES.iai) e = STATES.iai;
    if (key === 'dead' && (S.prevKey === 'plunge' || fin(player.position?.y, 0) > 0.4)) e = STATES.deadAir;
    let c = null;
    S.rollTurn = 0;
    if (e.how === 'roll' && e.dir && player.lockOn) {
      // locked on: he keeps facing the target and rolls the way the input points
      const aim = faceFor(NaN);
      const rel = Number.isFinite(aim) ? wrap(fin(player.yaw) - aim) : 0;
      const side = Math.abs(rel) < Math.PI / 4 ? 'F' : Math.abs(rel) > (3 * Math.PI) / 4 ? 'B' : rel > 0 ? 'L' : 'R';
      c = resolveClip(lib, ROLLS[side]);
      if (c) S.rollTurn = -travelDir(c);
    }
    if (e.how === 'charge' && e.after) {
      // the coil straight after the clip the footage chains it from (a held heavy press waits at its
      // swing's coil first: the swing before THAT one is what it follows)
      const ref = wasMode === 'attack' ? S.atkPrev : null;
      if (ref && e.after[ref] && lib.has(e.after[ref])) c = lib.get(e.after[ref]);
    }
    c = c ?? resolveClip(lib, e) ?? resolveClip(lib, STATE_DEFAULT);
    if (!c) {
      toLoco(0, false);
      return;
    }
    S.entry = e;
    S.mode = e.how ?? 'loop';
    setContact(e.contact ?? 1);
    if (S.mode === 'track') {
      // a state carrying on the clip already playing (the guard break's stumble into the knockdown) is
      // not restarted
      const K = e.knots ?? [[0, 0]];
      const same = hero.clip === c && K[0][1] === 'cur';
      const cur = hero.clip === c ? hero.time * c.fps : 0;
      S.k = Math.min(8, K.length);
      for (let i = 0; i < S.k; i++) {
        S.K[i * 2] = mark(K[i][0]);
        S.K[i * 2 + 1] = K[i][1] === 'cur' ? cur : fin(K[i][1], 0);
      }
      // frames only go forward
      for (let i = 1; i < S.k; i++) S.K[i * 2 + 1] = Math.max(S.K[i * 2 + 1], S.K[i * 2 - 1]);
      S.tail = fin(e.tail, 1);
      if (!same) tr();
      S.clip = c;
      hero.cut(c.name, { manual: true, at: S.K[1] / c.fps });
      return;
    }
    S.clip = c;
    tr();
    if (S.mode === 'charge') {
      // out of a swing waiting at its coil (a held heavy press): from partway into the coil
      S.chargeClip = c;
      S.cu0 = wasMode === 'attack' ? holdFrames(c, e)[0] * 0.6 : 0;
      S.cu = S.cu0;
      S.atkClip = c.name;
      hero.cut(c.name, { manual: true, at: S.cu / c.fps });
      return;
    }
    if (S.mode === 'once') hero.cut(c.name, { at: fin(e.from, 0) / c.fps, speed: fin(e.rate, 1), loop: false });
    else if (S.mode === 'loop') hero.cut(c.name, { loop: true });
    else hero.cut(c.name, { manual: true }); // roll, charge, hold: on the game's clock
  }

  // ---- locomotion
  /** Back to the blend (from a one-shot: `fadeS` s of fade from the drawn pose; at the loop's phase that
   *  matches the legs now when `match`). */
  function toLoco(fadeS, match = true) {
    if (match && S.clip && S.mode !== 'loco') {
      const g = sectors.F.find((x) => x.c.name === S.clip.to) ?? loopFor(S.gait === 'walk' ? sectors.F[0]?.c.name : 'run');
      if (g) {
        const m = matchFrame(g.c, hero.pose.q);
        S.phi = (((m.f / g.c.n - g.off) % 1) + 1) % 1;
      }
    }
    S.mode = 'loco';
    S.locoT = 0;
    S.clip = null;
    S.entry = null;
    S.yawOff = 0;
    setContact(1);
    if (fadeS > 0) hero.transition(fadeS);
  }

  function startOne(mode, c, at, opts) {
    S.mode = mode;
    S.clip = c;
    S.u = at;
    S.dist = 0;
    S.Y0 = fin(player.yaw);
    S.turnK = 1;
    S.yawBase = 0;
    hero.transition(0.16);
    hero.cut(c.name, { at: at / c.fps, ...opts });
    setContact(1);
  }

  const _vel = { x: 0, z: 0 };
  function loco(dt) {
    const gv = player.groundVel ?? _vel;
    const v = Math.hypot(fin(gv.x), fin(gv.z));
    const yaw = fin(player.yaw), I = player.intent, il = intentLen();
    const moveYaw = il > 0.1 ? Math.atan2(fin(I.x), fin(I.z)) : yaw;
    const sprinting = player.state === 'sprint';
    S.locoT += dt;
    // ---- the one-shots
    if (il < 0.1 && S.vs < 0.3) {
      // standing: the turn on the spot when the aim swings far from where he settled
      const aim = faceFor(yaw);
      const d = wrap(aim - S.settled), T = LOCO.turn;
      if (Math.abs(d) > T.minAngle) {
        const c = turns[(d > 0 ? 'L' : 'R') + (Math.abs(d) > T.big ? '180' : '90')];
        if (c) {
          startOne('turn', c, T.from, { speed: T.rate, loop: false });
          S.Y0 = S.settled;
          S.settled = aim;
          return;
        }
      }
      if (Math.abs(wrap(aim - yaw)) < 0.2) S.settled = yaw;
    } else S.settled = yaw;
    if (il >= 0.1) {
      const face = faceFor(moveYaw), facing = Math.abs(wrap(face - moveYaw)) < 0.6;
      // set off from standing, the way he will face: the start
      if (S.vs < 0.4 && facing && Math.abs(wrap(moveYaw - yaw)) < 1.2) {
        const kind = sprinting || I.sprint ? 'sprint' : il * TUNE.runSpeed > 2.6 ? 'run' : 'walk';
        const c = starts[kind];
        if (c) {
          S.gait = kind;
          // (its first steps of weight shift in place skipped: the game is at speed in a fifth of a second)
          const at = frameAtTravel(c, fin(LOCO.start.skip, 0));
          startOne('start', c, at, { manual: true });
          S.dist = travelAt(c, at);
          return;
        }
      }
      // the input reverses at speed (and he will face the new way): the pivot
      const P = LOCO.pivot;
      if (S.vs > P.minSpeed && facing && S.sector === 'F' && v > 0.3 && Math.abs(wrap(moveYaw - Math.atan2(gv.x, gv.z))) > P.minAngle) {
        const c = pivots[S.gait] ?? pivots.run;
        if (c) {
          startOne('pivot', c, P.from, { speed: P.rate, loop: false });
          return;
        }
      }
    } else if (S.vs > 1.0 && S.sector === 'F' && S.locoT > 0.25) {
      // (not straight out of a roll or a swing: the game's slide after them is no run to stop)
      // the input ends while running forward: the stop whose legs match his now
      const list = stops[S.gait]?.length ? stops[S.gait] : stops.run;
      if (list?.length) {
        // (at least the last step: the game's own slide is a few centimetres at a walk)
        const left = Math.max(S.vs / TUNE.decel, fin(LOCO.stop.minLeft, 0));
        let best = null, bd = Infinity, bf = 0;
        for (const c of list) {
          const T = travelOf(c), f = frameAtTravel(c, Math.max(0, T[c.n - 1] - left));
          const d = legDist(hero.pose.q, clipQ(c, f));
          if (d < bd) {
            bd = d;
            best = c;
            bf = f;
          }
        }
        startOne('stop', best, bf, { manual: true });
        S.dist = travelAt(best, bf); // where the clip's own travel stands
        return;
      }
    }
    // ---- the sectors (the travel's direction off his facing)
    let rel = 0;
    if (v > 0.3) rel = wrap(Math.atan2(gv.x, gv.z) - yaw);
    let want = S.sector;
    if (sprinting || !sectors.L.length) want = 'F';
    else if (v > 0.3) {
      const off = Math.abs(wrap(rel - CENTER[S.sector]));
      if (off > Math.PI / 4 + 0.17) {
        const a = Math.abs(rel);
        want = a < (5 * Math.PI) / 18 ? 'F' : a > (13 * Math.PI) / 18 ? 'B' : rel > 0 ? 'L' : 'R';
      }
    }
    if (!sectors[want]?.length) want = 'F';
    if (want !== S.sector) {
      S.sector = want;
      hero.transition(0.2);
    }
    const legWant = v > 0.3 ? clamp(wrap(rel - CENTER[S.sector]), -LOCO.legMax, LOCO.legMax) : 0;
    S.legYaw = damp(S.legYaw, legWant, 10, dt);
    const fight = player.lockOn || game.state === 'boss' || player.debug?.fightStance === true;
    const idle = (fight ? fightC : idleC) ?? sectors.F[0]?.c;
    if (!idle) return;
    S.idleU = (S.idleU + dt * idle.fps) % idle.n;
    const list = sectors[S.sector];
    if (!list.length) {
      hero.drive(idle.name, S.idleU, idle.name, S.idleU, 1);
      return;
    }
    const vs = S.vs, capped = S.sector !== 'F', g0 = list[0];
    let a, b, w, rate;
    if (vs <= g0.v) {
      // idle -> the slowest loop (slowed with the speed, weighted in over its first 60 %)
      a = null;
      b = g0;
      w = smooth01(vs / (g0.v * 0.6));
      rate = vs / g0.v / g0.c.dur;
      if (S.sector === 'F') S.gait = GAITS[0];
      S.loop = w > 0.5 ? g0.c.name : idle.name;
    } else {
      let i = 0;
      while (i < list.length - 1 && vs > list[i + 1].v) i++;
      if (i >= list.length - 1) {
        a = b = list[list.length - 1];
        w = 1;
        rate = vs / b.v / b.c.dur;
        if (capped) rate = Math.min(rate, LOCO.rateMax / b.c.dur);
      } else {
        a = list[i];
        b = list[i + 1];
        w = (vs - a.v) / (b.v - a.v);
        const T = a.c.dur + (b.c.dur - a.c.dur) * w, vb = a.v + (b.v - a.v) * w;
        rate = vs / vb / T;
      }
      if (S.sector === 'F') S.gait = GAITS[Math.min(2, sectors.F.indexOf(w > 0.5 ? b : a))] ?? 'run';
    }
    S.phi = (((S.phi + rate * dt) % 1) + 1) % 1;
    const u = (g) => ((((S.phi + g.off) % 1) + 1) % 1) * g.c.n;
    if (a) S.loop = (w > 0.5 ? b : a).c.name;
    if (a) hero.drive(a.c.name, u(a), b.c.name, u(b), w);
    else hero.drive(idle.name, S.idleU, b.c.name, u(b), w);
  }

  // ---- the pose's last word (onPose): the legs turned to the travel, a clip's root yaw drawn
  const T = new Float64Array(12);
  hero.onPose = (pose) => {
    const m = S.mode;
    if (m === 'attack' || m === 'roll') {
      // the clip's own travel (in its hips) is the game's to make: the hips stay over his root
      const c = S.clip;
      if (c) {
        pose.hips[0] = c.hips[0];
        pose.hips[2] = c.hips[2];
      }
      if (m === 'attack' && Math.abs(S.aim) > 1e-3) turnAll(pose, S.aim);
      if (m === 'roll' && Math.abs(S.rollTurn) > 1e-3) turnAll(pose, S.rollTurn);
      return;
    }
    if (m === 'tail') {
      // a swing's recovery (or the swing itself playing on): turned by the swing's aim as it was
      const c = S.clip;
      if (S.tailHips && c) {
        pose.hips[0] = c.hips[0];
        pose.hips[2] = c.hips[2];
      }
      if (Math.abs(S.tailAim) > 1e-3) turnAll(pose, S.tailAim);
      return;
    }
    if ((m === 'pivot' || m === 'turn') && S.clip) {
      // the body at the yaw it had when the clip began plus the clip's root yaw (scaled by turnK from
      // yawBase: a turn back from an end facing); the game's yaw under it
      S.yawOff = wrap(S.Y0 + S.turnK * (rootYaw(S.clip, hero.time * S.clip.fps) - S.yawBase) - fin(player.yaw));
      turnAll(pose, S.yawOff);
      return;
    }
    if (Math.abs(S.faceOff) > 1e-3) turnAll(pose, S.faceOff);
    const a = m === 'loco' ? S.legYaw : 0;
    if (Math.abs(a) < 1e-3) return;
    const q = pose.q, hi = JI.hips * 4, si = JI.spine * 4;
    qaxis(T, 0, 0, 1, 0, a);
    qmul(T, 4, T, 0, q, hi); // the hips turned
    qmul(T, 8, q, hi, q, si); // hips * spine as it was
    qconjmul(q, si, T, 4, T, 8); // the spine under the turned hips keeps the chest where it was
    q[hi] = T[4];
    q[hi + 1] = T[5];
    q[hi + 2] = T[6];
    q[hi + 3] = T[7];
    const c = Math.cos(a), s = Math.sin(a), x = pose.hips[0], z = pose.hips[2];
    pose.hips[0] = c * x + s * z;
    pose.hips[2] = -s * x + c * z;
  };

  // ---- footsteps: the clips' footfalls are the game's (dust, the living world's steps, sound)
  hero.on('footfall', (n, e) => {
    if (S.mode !== 'attack' && S.mode !== 'roll' && S.mode !== 'track' && S.vs > 0.4) A?.onFootstep?.(e.side === 'R' ? -1 : 1, 0);
  });
  // no flask left: the empty flask shaken over whatever he does (the game does not stop him)
  game.events?.on?.('player:noFlask', () => {
    if (emptyC && (S.mode === 'loco' || S.mode === 'stop' || S.mode === 'start')) {
      hero.layer(emptyC.name, { mask: 'upper', weight: 1, fade: 0.15, at: fin(HEAL.empty.from, 0) / emptyC.fps, speed: fin(HEAL.empty.rate, 1), loop: false, out: 0.25 });
    }
  });

  // a blow taken on the guard: the guard counter's block beat over the upper body (moves.js block)
  game.events?.on?.('player:block', () => {
    const bb = S.mode === 'loop' && S.key === 'block' ? S.entry?.blocked : null;
    const c = bb ? resolveClip(lib, bb) : null;
    if (!c) return;
    S.blockBeat = true;
    S.blockBeatT = 0;
    hero.layer(c.name, { mask: 'upper', weight: 1, fade: 0.05, at: fin(bb.from, 0) / c.fps, speed: 1, loop: false, out: 0.15 });
  });

  /** One step of the remade hero (after today's animator's). */
  function step(dt) {
    dt = fin(dt, 0);
    const p = player.position;
    obj.position.set(fin(p.x), fin(p.y), fin(p.z));
    obj.rotation.y = fin(player.yaw);
    const gv = player.groundVel ?? _vel, v = Math.hypot(fin(gv.x), fin(gv.z)), il = intentLen();
    S.vs = damp(S.vs, v, 14, dt);
    switch (S.mode) {
      case 'loco':
        loco(dt);
        break;
      case 'start': {
        // by distance: the clip's travel follows the game's, between 1 and rateMax x real speed
        const c = S.clip, f = c.fps * dt;
        S.dist += v * dt;
        S.u = clamp(frameAtTravel(c, S.dist), S.u + f, S.u + f * LOCO.start.rateMax);
        hero.setTime(S.u / c.fps);
        if (S.u >= c.n - 2 || il < 0.1 || Math.abs(wrap(Math.atan2(fin(player.intent.x), fin(player.intent.z)) - fin(player.yaw))) > 1.4) {
          toLoco(0.22);
          loco(dt);
        }
        break;
      }
      case 'stop': {
        const c = S.clip, f = c.fps * dt;
        if (v > 0.05) {
          S.dist += v * dt;
          S.u = clamp(frameAtTravel(c, S.dist), S.u + f * 0.6, S.u + f * 3);
        } else S.u += f;
        hero.setTime(Math.min(c.n - 1, S.u) / c.fps);
        if (il > 0.1 || S.u >= c.n - 1) {
          toLoco(il > 0.1 ? 0.2 : 0.3, il > 0.1);
          loco(dt);
        }
        break;
      }
      case 'pivot':
      case 'turn': {
        const c = S.clip, end = S.mode === 'pivot' ? Math.min(c.n - 1, LOCO.pivot.out) : c.n - 1;
        const cancel = S.mode === 'pivot' ? il < 0.1 : il > 0.1;
        if (hero.time * c.fps >= end - 0.5 || cancel) {
          // a turn cut short (he moves off): what is left of it fades out over his steps
          const left = S.mode === 'turn' && cancel ? S.yawOff : 0;
          if (S.turnUpper) {
            S.turnUpper = false;
            hero.layer(null, { fade: 0.25 });
          }
          toLoco(0.25, S.mode === 'pivot');
          S.faceOff = left;
          S.settled = fin(player.yaw);
          loco(dt);
        }
        break;
      }
      case 'tail':
        if (hero.done || il > 0.1) {
          const d = faceNow();
          toLoco(0.3, false);
          if (!keepFacing(d)) loco(dt);
        }
        break;
      case 'attack': {
        const a = player.atk;
        if (a?.def && S.clip) hero.setTime(attackTime(S.clip, fin(a.t), a.def, S.u0, S.recF));
        break;
      }
      case 'charge': {
        // the coil reached in `coil` s, then on through the held frames as the charge fills; never back
        const c = S.clip, e = S.entry, [hs, he] = holdFrames(c, e), t = fin(player.stateT), coil = Math.max(0.05, fin(e.coil, 0.3));
        const u = t < coil ? S.cu0 + (Math.max(S.cu0, hs) - S.cu0) * smooth01(t / coil) : hs + (he - hs) * clamp(fin(player.chargeK, 0), 0, 1);
        S.cu = clamp(Math.max(S.cu, u), 0, c.n - 1);
        hero.setTime(S.cu / c.fps);
        break;
      }
      case 'roll': {
        // the clip's flight fitted to the roll's: its landing (the `land` event) on the game's landAt
        const c = S.clip, R = player._rollTune?.() ?? { dur: 0.6, landAt: 0.48 }, land = Math.min(c.n - 2, landFrame(c, c.n * 0.45));
        _pseudo.fps = c.fps;
        _pseudo.dur = c.dur;
        _pseudo.phases.windup = land * 0.5;
        _pseudo.phases.active = land;
        _pseudo.phases.recover = c.n - 1;
        _win.windup = R.landAt * 0.5;
        _win.active = R.landAt * 0.5;
        _win.recovery = Math.max(0.05, R.dur - R.landAt);
        hero.setTime(fitTime(_pseudo, fin(player.stateT), _win));
        break;
      }
      case 'track': {
        const c = S.clip;
        hero.setTime(Math.min(c.n - 1, knotFrame(S.K, S.k, fin(player.stateT), S.tail, c.fps)) / c.fps);
        break;
      }
      case 'hold':
        hero.setTime(fin(S.entry.at, 0) / S.clip.fps);
        break;
      default:
        break;
    }
    // the flask on the drink's clock
    if (S.heal && drinkC) {
      if (player.state === 'heal') hero.layerTime(knotFrame(S.K, S.k, fin(player.stateT), 1, drinkC.fps) / drinkC.fps);
      else healOff(true);
    }
    // an end facing kept as drawn fades out over his steps
    if (S.faceOff !== 0) {
      S.faceOff = damp(S.faceOff, 0, fin(FACE.rate, 5), dt);
      if (Math.abs(S.faceOff) < 1e-3) S.faceOff = 0;
    }
    // the guard's block beat ends where the counter would begin
    if (S.blockBeat) {
      const bb = S.entry?.blocked;
      S.blockBeatT += dt;
      if (!bb || (S.blockBeatT > 0.1 && !hero.overlayClip) || (hero.overlayClip && hero.overlayTime * hero.overlayClip.fps >= fin(bb.to, 30))) {
        S.blockBeat = false;
        hero.layer(null, { fade: 0.15 });
      }
    }
    S.cs = damp(S.cs, S.csWant, 12, dt);
    hero.contactScale = S.cs;
    hero.update(dt);
  }
  const _pseudo = { fps: 30, dur: 1, phases: { windup: 1, active: 2, recover: 3 } };
  const _win = { windup: 0.1, active: 0.1, recovery: 0.1 };


  // ---- today's rig: hidden, and fed the remade hero's joints
  let hidden = [];
  const collectHidden = () => {
    hidden = [];
    player.object3d.traverse((o) => {
      if (o !== player.object3d && (o.isMesh || o.isLine || o.isPoints || o.isSprite)) hidden.push(o);
    });
  };
  collectHidden();
  const rig = () => player.rig ?? {};
  let pairs = [];
  const collectPairs = () => {
    const r = rig();
    // parents before children: each is set through its LOCAL transform (whatever recomputes the rig's
    // world matrices from its locals, getWorldPosition included, then lands on the remade hero)
    pairs = [
      [r.pelvis, JI.hips], [r.chest, JI.chest], [r.head, JI.head],
      [r.arms?.R?.upper, JI.upperArmR], [r.arms?.L?.upper, JI.upperArmL],
      [r.legs?.L?.thigh, JI.thighL], [r.legs?.L?.shin, JI.shinL], [r.legs?.L?.foot, JI.footL],
      [r.legs?.R?.thigh, JI.thighR], [r.legs?.R?.shin, JI.shinR], [r.legs?.R?.foot, JI.footR],
      [r.sword, JI.weaponR],
    ].filter(([n]) => n && n.matrixWorld && n.parent);
  };
  collectPairs();
  const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _sc = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  function mirror() {
    for (let i = 0; i < hidden.length; i++) hidden[i].visible = false;
    const M = player.object3d.matrixWorld, P = hero.world.p, R = hero.world.r;
    for (let i = 0; i < pairs.length; i++) {
      const [node, j] = pairs[i];
      _p.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
      _q.set(R[j * 4], R[j * 4 + 1], R[j * 4 + 2], R[j * 4 + 3]);
      _m.compose(_p, _q, _one);
      _t.multiplyMatrices(M, _m); // where it must be (drawn: the player's lean and drawn scale in M)
      _inv.copy(node.parent.matrixWorld).invert();
      _m.multiplyMatrices(_inv, _t);
      _m.decompose(_p, _q, _sc);
      node.position.copy(_p);
      node.quaternion.copy(_q);
      node.updateMatrixWorld(true); // itself and what hangs from it
    }
  }

  // ---- the surface player.js expects (everything else reads through to today's animator)
  const own = {
    hero,
    adapter: S,
    onFootstep: null,
    play(key, blend = 0.15, easeOut = false) {
      oldAnim.play(key, blend, easeOut);
      enter(key, blend);
    },
    update(dt) {
      oldAnim.update(dt);
      step(dt);
    },
    reset() {
      oldAnim.reset?.();
      hero.teleported();
    },
    teleported() {
      oldAnim.teleported?.();
      hero.teleported();
    },
    afterWorld(dt) {
      mirror(dt);
    },
  };
  const bound = new Map();
  A = new Proxy(own, {
    get(t, k) {
      if (k in t) return t[k];
      const v = oldAnim[k];
      if (typeof v !== 'function') return v;
      let f = bound.get(k);
      if (!f || f.src !== v) {
        f = v.bind(oldAnim);
        f.src = v;
        bound.set(k, f);
      }
      return f;
    },
    set(t, k, v) {
      if (k in t) t[k] = v;
      else oldAnim[k] = v;
      return true;
    },
  });
  enter('loco', 0);
  return {
    proxy: A,
    hero,
    state: S,
    /** Today's animator was rebuilt (an outfit change): run on the new one, re-read the rig. */
    rewrap(next) {
      oldAnim = next;
      bound.clear();
      collectHidden();
      collectPairs();
    },
  };
}

/**
 * The play stand (index.js, `?hero=new` without `show`): build the body (body.js, or the debug body
 * while body.js draws nothing / with `?body=debug`), put the adapter in place of player.anim, print the
 * remade hero through what covers him. Returns { update(dt) } (re-wraps after an outfit change).
 */
export async function mount(game, params) {
  const [{ loadLibrary }, bodyModule, { buildDebugBody }] = await Promise.all([import('./clips/index.js'), import('./body.js'), import('./debugBody.js')]);
  const lib = await loadLibrary();
  for (const p of lib.problems.slice(0, 8)) console.warn(`[hero2] ${p.clip}: ${p.text}`);
  const player = game.player;
  let body = null;
  if (params?.get?.('body') !== 'debug') {
    try {
      body = bodyModule.buildBody(game, {});
      if (!bodyModule.BODY_READY && !(body?.object3d?.children?.length > 0)) {
        body.dispose?.();
        body = null;
      }
    } catch (e) {
      console.warn('[hero2] body.js failed, the debug body stands in:', e);
      body = null;
    }
  }
  if (!body) body = buildDebugBody(game, { scale: fin(player.drawScale, 1.08) });
  game.scene.add(body.object3d);
  const ad = createAdapter(game, player, player.anim, { lib, body });
  player.anim = ad.proxy;
  game.pipeline?.setSeenThrough?.(body.object3d);
  // the body's lean and letter size from the camera that renders the frame (set right before it)
  const pl = game.pipeline;
  if (pl && typeof pl.render === 'function' && typeof body.prepareView === 'function') {
    const render0 = pl.render.bind(pl), LEAN = { lean: true };
    pl.render = (...a) => {
      try {
        body.prepareView(game.camera, LEAN);
      } catch {
        /* a body without it */
      }
      return render0(...a);
    };
  }
  return {
    adapter: ad,
    body,
    lib,
    update() {
      // an outfit change rebuilt today's animator (player.setLook): run on the new one
      const a = player.anim;
      if (a && a !== ad.proxy) {
        ad.rewrap(a);
        player.anim = ad.proxy;
      }
    },
  };
}
