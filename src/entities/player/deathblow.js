// THE DEATHBLOW COMBO (?parryRiposte=deathblow; DEFENSE.deathblow). Against a duelist, a parry that BREAKS his
// posture, or any parry of a BLUE-tell blow (the blue flare included), is answered where the hero stands by a
// planted combo of N blows (N = the perfect parries behind it, `player.parryRun`, 1..7), each one of his own
// attack clips, never the same combo twice: the first blow and the finisher come from small pools, the
// blows between from the lights, no clip twice in a row, from this module's own seeded stream (the last
// sequence is remembered and not repeated). The tempo quickens blow by blow, the hero turns a little to
// alternating sides between them (inside a disc of DEFENSE.deathblow.step m round where he parried, never
// nearer than minGap to his centre) and the finisher is a held, heavy blow. Planted: no vanish, teleport,
// leap or afterimage; nothing touches the screen's grade (flow.js skips events marked `planted`); unhurt
// from the start to `iframePad` s after the end. Every blow's contact calls combat/deathblowFx.js (the hit
// effect, `?dbfx=`). Player.js arms it in `_parry`, ticks it from `_tickRiposte`, and every blow runs through
// the ordinary attack state (`atk.rip` with `db: true`: `_tryHit`, `_applyHit`).
//
// Phases (P.db.phase): 'watch' (armed by the parry; starts when the trigger is seen and the parry's freeze is
// over) -> 'combo' (the blows) -> 'tail' (the finisher's recovery: still unhurt) -> ''.
import { clamp, lerp } from '../../core/math.js';
import { mulberry32 } from '../../core/rng.js';
import { DEFENSE } from '../../combat/rules.js';
import { CONFIG } from '../../core/config.js';
import { streakTier } from '../../combat/streak.js';
import { deathblowHit } from '../../combat/deathblowFx.js';
import { LIGHT, HEAVY, THRUST, ROLL_ATK, CHARGE, HIT_FEEL, chargeStats } from './combat.js';
import * as THREE from 'three';

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** Glyphs this module prints: none of its own (the hit effect is combat/deathblowFx.js'). */
export const DEATHBLOW_GLYPHS = [];

const SAMPLES = 8; // the blade tip's screen samples kept (a ring), for the swing's angles

/** The deathblow's own state on the player (one object, reused). */
export function newDeathblowState() {
  return {
    phase: '', att: null, was: false, blue: false, t: 0, attack: null, tell: 'normal',
    run: 0, n: 0, i: 0, dealt: 0, done: false, started: false,
    ox: 0, oz: 0, dx: 0, dz: 1, side: 1, rip: null, point: { x: 0, y: 0, z: 0 },
    last: '', lastFin: '', moveOf: null, clips: [], seq: [], rng: mulberry32(0x0db10c5), // (the stream: advances over every combo of the run)
    tip: new Float32Array(SAMPLES * 3), tipN: 0, tipI: 0, // the blade tip's NDC x, y and the time, a ring
  };
}

/** Damage of the blows of a combo of `n`: [each non-final blow, the finisher] (final, exact). */
export const deathblowDamage = (n) => {
  const D = DEFENSE.deathblow, k = clamp(Math.round(fin(n, 1)), 1, D.cap);
  return [D.mid.base + D.mid.per * k, D.fin.base + D.fin.per * k];
};
/** The whole combo's damage for `n` blows. */
export const deathblowTotal = (n) => {
  const k = clamp(Math.round(fin(n, 1)), 1, DEFENSE.deathblow.cap), [m, f] = deathblowDamage(k);
  return m * (k - 1) + f;
};

// --- THE MOVE LIBRARY (built on first use: nothing exists with the switch off) -------------------------------
// Each move is one of the hero's own clips, picked for a silhouette that reads at the game camera (he is ~34 px
// tall): its blade line (a level cut, a rising or a falling diagonal, an overhead cleave, a thrust, a turn, a
// crouch), and `yaw`, how far (rad) he turns from the foe's bearing, to alternating sides, for it (0: square on).
// Never a leap: a clip's hop is 0 here.
let POOLS = null;
const mv = (id, name, base, anim, yaw) => Object.freeze({ id, name, base, anim: Object.freeze({ kind: 'clip', hop: 0, ...anim }), yaw, kind: 'swing' });
function pools() {
  if (POOLS) return POOLS;
  const L = LIGHT, H = HEAVY;
  const cutRL = mv('cutRL', 'a level cut, right to left', L[0], { clip: 'drawCut', turn: 0.3 }, 0.4),
    cutLR = mv('cutLR', 'a level cut, left to right', L[1], { clip: 'flatBackhand', turn: -0.4 }, 0.4),
    fallR = mv('fallR', 'a falling diagonal from high right', L[0], { clip: 'fallingCut' }, 0.3),
    fallL = mv('fallL', 'a falling diagonal from high left', L[1], { clip: 'fallingBackhand' }, 0.3),
    riseL = mv('riseL', 'a rising diagonal from low left', L[1], { clip: 'risingBackhand' }, 0.3),
    riseR = mv('riseR', 'a rising diagonal from low right', L[0], { clip: 'risingSlash' }, 0.3),
    lunge = mv('lunge', 'a lunging stab', L[3], { clip: 'lunge' }, 0.15),
    lowCut = mv('lowCut', 'a crouching sweep', L[2], { clip: 'lowSweep' }, 0.45),
    rise = mv('rise', 'a low cut rising out of the crouch', ROLL_ATK, { clip: 'rollCut' }, 0.35),
    spin = mv('spin', 'a back-cut, a turn', L[2], { clip: 'whirl', spin: -1 }, 0),
    overhead = mv('overhead', 'an overhead cleave', H[4], { clip: 'slam' }, 0),
    spinFin = mv('spinFin', 'a spinning cut', H[2], { clip: 'heavySpin', spin: -1 }, 0),
    thrust = Object.freeze({ id: 'thrust', name: 'a thrust through him', base: THRUST, anim: THRUST.anim, yaw: 0, kind: 'thrust' });
  POOLS = Object.freeze({
    open: [cutRL, cutLR, fallR, fallL, riseL, riseR],
    mid: [cutRL, cutLR, fallR, fallL, riseL, riseR, lunge, lowCut, rise, spin],
    fin: [overhead, thrust, spinFin],
  });
  return POOLS;
}
/** The move library's ids (tests). */
export const deathblowMoves = () => {
  const P = pools();
  return [...new Set([...P.open, ...P.mid, ...P.fin].map((e) => e.id))];
};

/** The attack definition of blow `i` (0-based) of `n` (its own clip and contact look, the combo's weights). */
const blowStop = (i, n) => {
  const D = DEFENSE.deathblow;
  return i >= n - 1 ? D.finStop : lerp(D.stop[0], D.stop[1], n > 2 ? clamp(i / (n - 2), 0, 1) : 1);
};
function blowDef(e, wind, last, i, n) {
  const D = DEFENSE.deathblow, b = e.base, stop = blowStop(i, n);
  return Object.freeze({
    ...b, name: `db:${b.name}`, anim: e.anim, variants: null, button: null, keepYaw: true, chain: 9, lunge: 0, travel: 0,
    windup: wind, active: last ? D.finActive : D.active, recovery: last ? D.finRecover : D.recover,
    hitstop: stop / HIT_FEEL.crit.stop, shake: 0, punch: 0, kick: 0, // (the contact's weights are `deathblowLanded`'s)
  });
}

/** The tempo: blow `i` (0-based) of `n`: its wind-up (s). */
export const deathblowWind = (i, n) => {
  const D = DEFENSE.deathblow;
  return i === n - 1 ? D.finWind : Math.max(D.windMin, D.wind0 * Math.pow(D.windK, i));
};
/** About how long a combo of `n` blows runs (s): the cast's hold. */
export const deathblowDuration = (n) => {
  const D = DEFENSE.deathblow;
  let t = 0;
  for (let i = 0; i < n; i++) t += deathblowWind(i, n) + (i === n - 1 ? D.finActive + D.finStop : D.active + D.stop[1] * 0.8 + D.gap);
  return t;
};

/** Pick the sequence of moves for `n` blows (entries): none twice in a row (nor the one before it where the
 *  pool allows), never the last combo's sequence. */
function pickSeq(S, n) {
  const P = pools(), r = S.rng, pk = (a, not) => {
    let e = a[Math.floor(r() * a.length) % a.length], g = 0;
    while (not.length && g++ < 12 && not.includes(e.id)) e = a[Math.floor(r() * a.length) % a.length];
    return e;
  };
  const seq = [];
  for (let tries = 0; tries < 6; tries++) {
    seq.length = 0;
    for (let i = 0; i < n; i++) {
      const pool = i === n - 1 ? P.fin : i === 0 ? P.open : P.mid;
      const not = [];
      if (i > 0) not.push(seq[i - 1].id);
      if (i > 1) not.push(seq[i - 2].id);
      if (i === n - 1 && S.lastFin) not.push(S.lastFin);
      seq.push(pk(pool, not));
    }
    if (seq.map((e) => e.id).join('|') !== S.last) break;
    if (tries === 5) { // (stuck on the same one: the finisher moves on by one)
      const j = P.fin.indexOf(seq[n - 1]);
      seq[n - 1] = P.fin[(j + 1) % P.fin.length];
    }
  }
  return seq;
}

/** Arm the watch: the parry just met a blow of `att` (a duelist); a break, if it comes, comes in this call stack. */
export function armDeathblow(P, att, attack, tell, blue = false) {
  const S = P.db;
  if (S.phase && S.phase !== 'watch') return; // (one running: leave it)
  S.phase = 'watch';
  S.att = att;
  S.was = att?.broken === true;
  S.blue = !!blue;
  S.t = 0;
  S.attack = attack ?? null;
  S.tell = tell;
}

const clear = (P) => {
  const S = P.db;
  S.phase = '';
  S.att = null;
};

const AT = [0, 0];
const FROM = new Set(['parry', 'block', 'idle', 'run', 'sprint']); // (the states a riposte may start from, as player.js)
const V = new THREE.Vector3();

/** Per frame (player.js `_tickRiposte`). True while it owns the riposte (a new one cannot start). */
export function tickDeathblow(P, dt) {
  const S = P.db, g = P.game;
  if (!S.phase) return false;
  const att = S.att;
  const alive = att && att.mode !== 'dying' && att.mode !== 'dead' && att.state !== 'dying' && att.state !== 'dead';
  if (S.phase === 'watch') {
    S.t += dt > 0 ? fin(g.realDt, dt) : 0;
    // a break comes in the parry's own call stack: not broken by the first frame = it never will (a blue blow needs none)
    const broke = att?.broken === true && !S.was;
    // (a foe whose parry has an answer of its own, Halcyon's crash into the cover, is left to it)
    if (!P.alive || !alive || (!broke && !S.blue) || S.t > 0.6 || att.flight?.cr?.on) {
      clear(P);
      return false;
    }
    if (fin(g.hitstopTimer) > 0) return true;
    if (!FROM.has(P.state)) {
      clear(P);
      return false;
    }
    return startCombo(P, att);
  }
  // running: unhurt until `iframePad` s after the end; ended when the hero is gone, the foe dead or the state left
  P.iframeT = Math.max(fin(P.iframeT), S.phase === 'tail' ? DEFENSE.deathblow.iframePad : DEFENSE.deathblow.iframePad + 0.1);
  P.buf.action = null; // (the combo is not cancelled by a press)
  const a = P.atk, inAtk = P.state === 'attack' || P.state === 'heavy';
  if (S.phase === 'combo') {
    if (!P.alive || !inAtk || !a?.rip?.db) return finish(P);
    sampleTip(P, g);
    if (a.hit) {
      const d = a.def;
      // (a non-final blow gives way to the next the moment its freeze is over: the blows are one rush; the finisher plays out)
      if (fin(g.hitstopTimer) > 0 || (S.i >= S.n - 1 && a.t < d.windup + d.active + DEFENSE.deathblow.gap)) return true;
      if (S.i >= S.n - 1) {
        S.phase = 'tail';
        end(P);
        return true;
      }
      if (!alive) return finish(P);
      return startBlow(P, att, S.i + 1);
    }
    if (a.t > a.def.windup + a.def.active + 0.3) return finish(P); // (no contact: give up)
    return true;
  }
  if (S.phase === 'tail') {
    if (!inAtk || !a?.rip?.db) clear(P);
    return true;
  }
  clear(P);
  return false;
}

/** The blade tip's screen position this frame, into the ring (the swing's angles at contact read it). */
function sampleTip(P, g) {
  const cam = g.camera, S = P.db;
  if (!cam?.isCamera || !(P.sweep?.valid)) return;
  P._bladePoint(1, V);
  V.project(cam);
  if (!Number.isFinite(V.x + V.y)) return;
  const k = S.tipI * 3;
  S.tip[k] = V.x;
  S.tip[k + 1] = V.y;
  S.tip[k + 2] = fin(g.time, 0);
  S.tipI = (S.tipI + 1) % SAMPLES;
  S.tipN = Math.min(SAMPLES, S.tipN + 1);
}

/** The blade's swing in the screen round a contact at (cx, cy) NDC: start / end angles (y up), NaN when unknown. */
function swingAngles(S, cx, cy, aspect, now, out) {
  out[0] = out[1] = NaN;
  if (S.tipN < 2) return out;
  let newest = -1, oldest = -1;
  for (let j = 0; j < S.tipN; j++) {
    const k = ((S.tipI - 1 - j + SAMPLES * 2) % SAMPLES);
    if (now - S.tip[k * 3 + 2] > 0.09) break;
    if (newest < 0) newest = k;
    oldest = k;
  }
  if (newest < 0 || oldest === newest) return out;
  const ang = (k) => Math.atan2(S.tip[k * 3 + 1] - cy, (S.tip[k * 3] - cx) * aspect);
  out[0] = ang(oldest);
  out[1] = ang(newest);
  return out;
}

/** The sequence is over early (the hero hurt, a state change, no contact): close it with what it dealt. */
function finish(P) {
  const S = P.db;
  if (S.phase === 'combo') end(P);
  clear(P);
  return false;
}

function end(P) {
  const S = P.db;
  if (S.done) return;
  S.done = true;
  P.parryRun = 0;
  P._emit('player:flurryEnd', { strikes: S.n, damage: Math.round(S.dealt), art: 'deathblow', label: 'Deathblow' });
}

function aim(P, att, S) {
  const p = P.position, tp = att.position;
  const dx = tp.x - p.x, dz = tp.z - p.z, dist = Math.hypot(dx, dz);
  if (!(dist > 1e-3) || !Number.isFinite(dist)) return -1;
  S.dx = dx / dist;
  S.dz = dz / dist;
  return dist;
}

function startCombo(P, att) {
  const S = P.db, D = DEFENSE.deathblow, g = P.game, p = P.position;
  const kind = P.flurry.reach(att, true);
  const tp = att?.position;
  if (kind !== 'ground' || !tp || !(Math.hypot(tp.x - p.x, tp.z - p.z) <= DEFENSE.flurry.riposteRange.ground)) {
    clear(P);
    return false;
  }
  S.run = clamp(Math.round(fin(P.parryRun)), 0, 99);
  S.n = clamp(S.run, 1, D.cap);
  S.dealt = 0;
  S.done = false;
  S.started = true;
  S.ox = p.x;
  S.oz = p.z;
  S.tipN = 0;
  S.tipI = 0;
  S.side = S.rng() < 0.5 ? 1 : -1;
  const seq = pickSeq(S, S.n);
  S.seq = seq;
  S.last = seq.map((e) => e.id).join('|');
  S.lastFin = seq[S.n - 1].id;
  S.clips.length = 0;
  P.riposte.att = null; // (a flare counter waiting is replaced by this)
  P.kb.x = P.kb.z = 0;
  if (!startBlow(P, att, 0)) {
    clear(P);
    return false;
  }
  S.phase = 'combo';
  P.parryRun = 0; // spent
  // the camera leans in on him for the whole combo, as the dodge's flurry does (no slow motion: the owner
  // asked for a faster combo; the zoom in metres at the desktop distance, scaled for the phone's camera)
  const zk = g.cameraRig?.defaultDistance > 0 ? g.cameraRig.defaultDistance / CONFIG.camera.distance : 1;
  g.flow?.cinematic?.({ x: tp.x, z: tp.z, slowmo: D.slow.slowmo, dur: deathblowDuration(S.n) + D.slow.dur, zoom: D.slow.zoom * zk, weight: D.slow.weight, ease: [0.12, 0.3], kind: 'deathblow' });
  AT[0] = deathblowWind(0, S.n);
  AT[1] = AT[0] + D.active + D.gap;
  P._emit('player:flurry', {
    strikes: S.n, art: 'deathblow', air: false, dur: deathblowDuration(S.n), streak: S.n, tier: streakTier(S.n), storm: false, at: AT, figure: '', planted: true,
  });
  return true;
}

/** Blow `i` (0-based): its clip on its tempo, turned a little to alternating sides, a step inside the disc. */
function startBlow(P, att, i) {
  const S = P.db, D = DEFENSE.deathblow, p = P.position, e = S.seq[i], last = i === S.n - 1;
  const dist = aim(P, att, S);
  if (dist < 0) return finish(P);
  const def = blowDef(e, deathblowWind(i, S.n), last, i, S.n);
  // the turn: the foe's bearing, a little to this blow's side (alternating); the finisher faces him square
  S.side = -S.side;
  const off = last ? 0 : S.side * e.yaw * (0.8 + 0.4 * S.rng());
  const yaw = Math.atan2(S.dx, S.dz) + off;
  P.yaw = yaw;
  P.quickUntil = -Infinity;
  P.kb.x = P.kb.z = 0;
  if (e.kind === 'thrust' ? !startThrust(P, def) : !P._startAttack(def)) return finish(P);
  P.yaw = yaw;
  P.object3d.rotation.y = yaw;
  const a = P.atk;
  // the step: forward on every other blow (always on the finisher), as far as the disc round the parry and the
  // gap to his centre allow
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = p.x - S.ox, rz = p.z - S.oz, b = rx * fx + rz * fz, c = rx * rx + rz * rz - D.step * D.step;
  const room = c > 0 ? 0 : -b + Math.sqrt(Math.max(0, b * b - c)); // (to the disc's edge along the facing)
  const step = i % 2 === 0 || last ? clamp(Math.min(dist - D.minGap, room, last ? D.step : D.stepMid), 0, D.step) : 0;
  if (def.dash) a.travel = step;
  else a.lunge = step;
  a.rip = S.rip ??= { db: true, damage: 0, posture: 0, dx: 0, dz: 1, ox: 0, oz: 0, n: 1, counter: false, attack: null };
  a.rip.damage = deathblowDamage(S.n)[last ? 1 : 0];
  a.rip.dx = S.dx;
  a.rip.dz = S.dz;
  a.crit = true;
  P.buf.action = null;
  P.critTimer = 0;
  P.hb.held = false;
  P.iframeT = Math.max(fin(P.iframeT), def.windup + def.active + def.recovery + D.iframePad);
  S.i = i;
  S.clips.push(e.id);
  S.moveOf = e;
  return true;
}

/** The thrust runs as the heavy's machinery (uncharged: a charged thrust's tip streak prints a white blot). */
function startThrust(P, def) {
  const st = chargeStats(CHARGE.hold, THRUST);
  P._startHeavy(def, st);
  return !!P.atk;
}

/** What `_applyHit` puts to the duelist's takeHit for a blow. */
export function deathblowTakeHit(P, point, out) {
  const S = P.db, p = P.position, last = S.i >= S.n - 1;
  out.damage = S.rip.damage;
  out.part = 'body';
  out.point = point;
  out.dir = { x: S.dx, z: S.dz };
  out.heavy = true;
  out.crit = true;
  out.exact = true;
  out.posture = 0;
  out.flash = DEFENSE.deathblow.flash;
  out.reel = last ? 2 : 1;
  if (last) out.away = { x: p.x, z: p.z };
  S.point.x = point.x;
  S.point.y = point.y;
  S.point.z = point.z;
  return out;
}

const ANG = [NaN, NaN];
/** A blow's contact weight and its events (after `_applyHit` dealt `dealt`), and the hit effect. */
export function deathblowLanded(P, dealt) {
  const S = P.db, D = DEFENSE.deathblow, R = DEFENSE.riposteCut, g = P.game, G = DEFENSE.flurry.ground, PL = DEFENSE.plunge;
  const n = S.n, i = S.i, last = i >= n - 1, k = last ? D.wLast : D.wMid * (0.7 + 0.6 * (i / Math.max(1, n - 1))); // (each blow heavier than the last)
  dealt = fin(dealt);
  S.dealt += dealt;
  g.shake?.(Math.min(1, (PL.impactShake + R.shakePerN * n) * k) * G.shake);
  g.punch?.((R.punch + R.punchPerN * n) * k * G.kick);
  P.anim?.kickCoat?.(1.1, P.anim.noise);
  // (the foe's own crit freeze is longer than a rush of blows can bear: the combo's freeze grows blow by blow)
  const stop = blowStop(i, n);
  if (fin(g.hitstopTimer) > stop) g.hitstopTimer = stop;
  // his body jolts with every blow (the finisher's stagger is takeHit's reel 2)
  const att = S.att;
  if (att && Number.isFinite(att.jolt)) att.jolt = Math.max(att.jolt, last ? 1.2 : D.jolt);
  P._emit('player:flurryHit', { n: i + 1, of: n, last, damage: dealt, planted: true });
  // the hit effect at the contact: the blade's own direction, its swing in the screen
  let a0 = NaN, a1 = NaN;
  const cam = g.camera, pt = S.point;
  if (cam?.isCamera) {
    V.set(pt.x, pt.y, pt.z).project(cam);
    if (Number.isFinite(V.x + V.y)) {
      const asp = fin(cam.aspect, 1);
      swingAngles(S, V.x, V.y, asp, fin(g.time, 0), ANG);
      a0 = ANG[0];
      a1 = ANG[1];
    }
  }
  try {
    deathblowHit?.(g, { x: pt.x, y: pt.y, z: pt.z, dx: S.dx, dz: S.dz, i: i + 1, n, last, a0, a1, thrust: S.moveOf?.kind === 'thrust' });
  } catch (err) {
    console.error('[deathblow] fx failed', err);
  }
}
