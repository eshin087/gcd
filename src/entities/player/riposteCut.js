// THE PLANTED RIPOSTE (?parryRiposte=planted|old; `old` = the riposte as shipped: the flurry's flash cuts).
// A parried last blow against a duelist is answered where the hero stands: his own heavy cut (the
// Rising Crescent's clip, trail and contact, combat.js HEAVY[1]) with a step in of at most
// DEFENSE.riposteCut.step m, ONE blow at the contact worth what the flurry's riposte would have dealt
// for the streak (n flash cuts), the duelist reeling from it. No vanish, no afterimage, no leap, no
// world hold. Player.js drives it through the ordinary attack state: `_startAttack` here, `_tryHit`
// and `_applyHit` branch on `atk.rip` (the contact), and the state ends as any heavy's does.
import { clamp } from '../../core/math.js';
import { DEFENSE } from '../../combat/rules.js';
import { streakTier } from '../../combat/streak.js';
import { HEAVY } from './combat.js';

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const OPTS = ['old', 'planted'];
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
/** The riposte a perfect parry gets when nothing asks for another (the lead flips it once the owner approves). */
export const RIPOSTE_DEFAULT = 'old';
/** The switch: read at the moment the riposte starts (the Lab sets it). */
export const RIPOSTE_CUT = { opts: OPTS, mode: OPTS.includes(q('parryRiposte')) ? q('parryRiposte') : RIPOSTE_DEFAULT };
export const riposteMode = () => RIPOSTE_CUT.mode;
export const setRiposteMode = (m) => (RIPOSTE_CUT.mode = OPTS.includes(m) ? m : RIPOSTE_DEFAULT);

let DEF = null; // the heavy cut's definition, built on first use (nothing exists with the switch off)
const def = () => {
  if (DEF) return DEF;
  const R = DEFENSE.riposteCut;
  // the Rising Crescent as combat.js has it (its clip, arc, contact look, `reel: 2`), on this timeline:
  // no lunge of its own (the step is the atk's), never chained into, never held for a charge
  DEF = Object.freeze({
    ...HEAVY[1], name: 'riposteCut', button: null, windup: R.wind, active: R.active, recovery: R.recover, chain: 9, lunge: 0,
  });
  return DEF;
};

const RIP = { damage: 0, posture: 0, dx: 0, dz: 1, ox: 0, oz: 0, n: 1, counter: false, attack: null };
const AT = [0];
const BODY = { part: 'body' };

/**
 * Start the planted cut against `att` (a duelist in reach). `streak`: the streak it cashes. False when
 * it cannot start (the caller falls back to the flurry).
 */
export function startRiposteCut(P, att, streak, attack, counter) {
  const R = DEFENSE.riposteCut, p = P.position, tp = att?.position;
  if (!tp) return false;
  const dx = tp.x - p.x, dz = tp.z - p.z, dist = Math.hypot(dx, dz);
  if (!(dist > 1e-3) || !Number.isFinite(dist)) return false;
  const n = clamp(Math.round(fin(streak, 1)), 1, DEFENSE.flurry.max);
  const streakN = Math.max(n, Math.round(fin(streak, 1)), 1);
  const K = counter ? DEFENSE.flareCounter : null, C = DEFENSE.flurry.cut;
  RIP.damage = C.damage * (K ? n - 1 : n) + (K ? K.damage : 0);
  RIP.posture = C.posture * (K ? n - 1 : n) + (K ? K.posture : 0);
  RIP.dx = dx / dist;
  RIP.dz = dz / dist;
  RIP.n = n;
  RIP.counter = !!counter;
  RIP.attack = attack ?? null;
  P.yaw = Math.atan2(dx, dz);
  P.kb.x = P.kb.z = 0;
  const quick = P.quickUntil; // (the counter cut's window is the parry's, not this cut's)
  if (!P._startAttack(def())) return false;
  P.quickUntil = quick;
  P.yaw = Math.atan2(dx, dz);
  const a = P.atk;
  a.lunge = clamp(dist - R.minGap, 0, R.step);
  a.rip = RIP;
  a.crit = true; // (the contact reads as a crit's: heavier freeze and flare)
  P.buf.action = null;
  P.critTimer = 0;
  P.iframeT = Math.max(fin(P.iframeT), R.wind + R.active + R.recover + R.iframePad);
  AT[0] = R.wind;
  P._emit('player:flurry', {
    strikes: n, art: counter ? 'counter' : 'riposte', air: false, dur: R.wind, streak: streakN, tier: streakTier(streakN), storm: false, at: AT, figure: '', planted: true,
  });
  return true;
}

/** What `_applyHit` puts to the duelist's takeHit for the planted cut. */
export function riposteTakeHit(P, point, out) {
  const p = P.position;
  RIP.ox = p.x;
  RIP.oz = p.z;
  out.damage = RIP.damage;
  out.part = 'body';
  out.point = point;
  out.dir = { x: RIP.dx, z: RIP.dz };
  out.heavy = true;
  out.crit = true;
  out.exact = true;
  out.posture = RIP.posture;
  out.flash = DEFENSE.riposteCut.flash;
  out.reel = 2;
  out.away = { x: p.x, z: p.z };
  return out;
}

/** The contact's own weight and the events (after `_applyHit` dealt `dealt`): the freeze of a flurry's
 *  last blow, a shake and punch about its size, then the count and its name, as a flurry gives them. */
export function riposteCutLanded(P, dealt) {
  const R = DEFENSE.riposteCut, g = P.game, G = DEFENSE.flurry.ground, n = RIP.n, PL = DEFENSE.plunge;
  P._hitstop(PL.impactStop * R.stopK, 0.03);
  g.shake?.(Math.min(1, PL.impactShake + R.shakePerN * n) * G.shake);
  g.punch?.((R.punch + R.punchPerN * n) * G.kick);
  P.anim?.kickCoat?.(1.1, P.anim.noise);
  dealt = fin(dealt);
  if (RIP.counter) P._emit('player:flareCounter', { attack: RIP.attack, damage: dealt, strikes: n });
  P._emit('player:flurryHit', { n, of: n, last: true, damage: dealt, planted: true });
  P._emit('player:flurryEnd', { strikes: n, damage: Math.round(dealt), art: RIP.counter ? 'counter' : 'riposte', label: RIP.counter ? 'Counter' : 'Riposte' });
}

/** The contact when the blade's own test found no body (a cut thrown a little short): the duelist's chest. */
export function riposteContact(att, h) {
  const tp = att.position;
  if (!h.sphere || typeof h.sphere.part !== 'string') h.sphere = BODY;
  h.x = tp.x;
  h.y = fin(tp.y) + 1.2;
  h.z = tp.z;
  return h;
}
