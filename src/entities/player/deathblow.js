// THE DEATHBLOW (?parryRiposte=deathblow; DEFENSE.deathblow). Against a duelist, parries fill his posture;
// the parry whose posture damage BREAKS him is answered where the hero stands: a beat of slow motion, a
// heavy cut, then a thrust through him, final damage that grows with the perfect parries that built it
// (`player.parryRun`). Planted: a step in of at most DEFENSE.deathblow.step m in all, never nearer than
// minGap; no vanish, teleport, leap or afterimage; nothing touches the screen's grade (flow.js skips
// events marked `planted`). Player.js arms it in `_parry`, ticks it from `_tickRiposte`, and its two
// blows run through the ordinary attack state (`atk.rip` with `db: true`: `_tryHit`, `_applyHit`).
//
// Phases (P.db.phase): 'watch' (armed by the parry; starts when his break is seen and the parry's freeze
// is over) -> 'cut' (beat 1) -> 'thrust' (beat 2) -> 'tail' (the thrust's recovery: still unhurt) -> ''.
import { clamp } from '../../core/math.js';
import { DEFENSE } from '../../combat/rules.js';
import { streakTier } from '../../combat/streak.js';
import { parrySparks } from '../../combat/parrySparks.js';
import { HEAVY, THRUST, CHARGE, chargeStats } from './combat.js';

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** Glyphs this module prints: none of its own (the burst is parrySparks'). */
export const DEATHBLOW_GLYPHS = [];

/** The deathblow's own state on the player (one object, reused). */
export function newDeathblowState() {
  return {
    phase: '', att: null, was: false, t: 0, attack: null, tell: 'normal', run: 0, total: 0, d1: 0, d2: 0, dealt: 0,
    beat: 0, ox: 0, oz: 0, dx: 0, dz: 1, done: false, rip: null,
  };
}

let DEF1 = null, DEF2 = null;
const def1 = () => {
  if (DEF1) return DEF1;
  const C = DEFENSE.deathblow.cut;
  // the Rising Crescent's clip and look on this timeline, as riposteCut.js has it
  DEF1 = Object.freeze({ ...HEAVY[1], name: 'deathblowCut', button: null, windup: C.wind, active: C.active, recovery: C.recover, chain: 9, lunge: 0 });
  return DEF1;
};
const def2 = () => (DEF2 ??= Object.freeze({ ...THRUST, name: 'deathblowThrust', chain: 9 }));

/** Total damage for `run` perfect parries. */
export const deathblowDamage = (run) => {
  const D = DEFENSE.deathblow;
  return D.base + D.per * Math.min(Math.max(0, Math.round(fin(run))), D.cap);
};

/** Arm the watch: the parry just met a blow of `att` (a duelist); the break, if it comes, comes in this call stack. */
export function armDeathblow(P, att, attack, tell) {
  const S = P.db;
  if (S.phase && S.phase !== 'watch') return; // (one running: leave it)
  S.phase = 'watch';
  S.att = att;
  S.was = att?.broken === true;
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

/** Per frame (player.js `_tickRiposte`). True while it owns the riposte (a new one cannot start). */
export function tickDeathblow(P, dt) {
  const S = P.db, g = P.game;
  if (!S.phase) return false;
  const att = S.att;
  const alive = att && att.mode !== 'dying' && att.mode !== 'dead' && att.state !== 'dying' && att.state !== 'dead';
  if (S.phase === 'watch') {
    S.t += dt > 0 ? fin(g.realDt, dt) : 0;
    // the break comes in the parry's own call stack: not broken by the first frame = it never will
    if (!P.alive || !alive || !att.broken || S.was || S.t > 0.6) {
      clear(P);
      return false;
    }
    if (fin(g.hitstopTimer) > 0) return true;
    if (!FROM.has(P.state)) {
      clear(P);
      return false;
    }
    return startCut(P, att);
  }
  // running: unhurt until 0.05 s after the end; dropped (ended) when the hero is gone, the foe dead or the state left
  P.iframeT = Math.max(fin(P.iframeT), S.phase === 'tail' ? DEFENSE.deathblow.iframePad : DEFENSE.deathblow.iframePad + 0.1);
  P.buf.action = null; // (the finisher is not cancelled by a press)
  const a = P.atk, inAtk = P.state === 'attack' || P.state === 'heavy';
  if (S.phase === 'cut') {
    if (!P.alive || !inAtk || !a?.rip?.db) return finish(P);
    if (a.hit) {
      const d = a.def;
      if (fin(g.hitstopTimer) > 0 || a.t < d.windup + d.active + DEFENSE.deathblow.gap) return true;
      if (!alive) return finish(P);
      return startThrust(P, att);
    }
    if (a.t > a.def.windup + a.def.active + 0.3) return finish(P); // (no contact: give up)
    return true;
  }
  if (S.phase === 'thrust') {
    if (!P.alive || !inAtk || !a?.rip?.db) return finish(P);
    if (!a.hit && a.t > a.def.windup + a.def.active + 0.3) return finish(P);
    return true;
  }
  if (S.phase === 'tail') {
    if (!inAtk || !a?.rip?.db) clear(P);
    return true;
  }
  clear(P);
  return false;
}

/** The sequence is over early (the hero hurt, a state change, no contact): close it with what it dealt. */
function finish(P) {
  const S = P.db;
  if (S.phase === 'cut' || S.phase === 'thrust') end(P);
  clear(P);
  return false;
}

function end(P) {
  const S = P.db;
  if (S.done) return;
  S.done = true;
  P.parryRun = 0;
  P._emit('player:flurryEnd', { strikes: S.run, damage: Math.round(S.dealt), art: 'deathblow', label: 'Deathblow' });
}

function aim(P, att, S) {
  const p = P.position, tp = att.position;
  const dx = tp.x - p.x, dz = tp.z - p.z, dist = Math.hypot(dx, dz);
  if (!(dist > 1e-3) || !Number.isFinite(dist)) return -1;
  S.dx = dx / dist;
  S.dz = dz / dist;
  P.yaw = Math.atan2(dx, dz);
  return dist;
}

function startCut(P, att) {
  const S = P.db, D = DEFENSE.deathblow, g = P.game, p = P.position;
  const kind = P.flurry.reach(att, true);
  const tp = att?.position;
  if (kind !== 'ground' || !tp || !(Math.hypot(tp.x - p.x, tp.z - p.z) <= DEFENSE.flurry.riposteRange.ground)) {
    clear(P);
    return false;
  }
  S.run = clamp(Math.round(fin(P.parryRun)), 0, 99);
  S.total = deathblowDamage(S.run);
  S.d1 = Math.round(S.total * D.share);
  S.d2 = S.total - S.d1;
  S.dealt = 0;
  S.done = false;
  S.ox = p.x;
  S.oz = p.z;
  const dist = aim(P, att, S);
  if (dist < 0) {
    clear(P);
    return false;
  }
  P.riposte.att = null; // (a flare counter waiting is replaced by this)
  P.kb.x = P.kb.z = 0;
  if (!P._startAttack(def1())) {
    clear(P);
    return false;
  }
  P.quickUntil = -Infinity;
  P.yaw = Math.atan2(S.dx, S.dz);
  const a = P.atk;
  a.lunge = clamp(dist - D.minGap, 0, D.step);
  a.rip = S.rip ??= { db: true, damage: 0, posture: 0, dx: 0, dz: 1, ox: 0, oz: 0, n: 1, counter: false, attack: null, beat: 1 };
  a.rip.damage = S.d1;
  a.rip.beat = 1;
  a.rip.dx = S.dx;
  a.rip.dz = S.dz;
  a.crit = true;
  P.buf.action = null;
  P.critTimer = 0;
  P.iframeT = Math.max(fin(P.iframeT), D.cut.wind + D.cut.active + D.iframePad + 0.1);
  S.phase = 'cut';
  S.beat = 1;
  // the beat of slow motion: real-time, no zoom, a light lean (flow.js cinematic; no grade, no tint)
  g.flow?.cinematic?.({ x: tp.x, z: tp.z, slowmo: D.slow.slowmo, dur: D.slow.dur, zoom: D.slow.zoom, weight: D.slow.weight, kind: 'deathblow' });
  AT[0] = D.cut.wind;
  AT[1] = D.cut.wind + D.cut.active + D.gap + THRUST.windup;
  P._emit('player:flurry', {
    strikes: S.run, art: 'deathblow', air: false, dur: D.cut.wind, streak: S.run, tier: streakTier(S.run), storm: false, at: AT, figure: '', planted: true,
  });
  return true;
}

function startThrust(P, att) {
  const S = P.db, D = DEFENSE.deathblow, p = P.position;
  const dist = aim(P, att, S);
  if (dist < 0) return finish(P);
  const st = chargeStats(CHARGE.full, THRUST);
  P._startHeavy(def2(), st);
  P.yaw = Math.atan2(S.dx, S.dz);
  P.object3d.rotation.y = P.yaw;
  const a = P.atk;
  // (what is left of the step after the cut's: the whole finisher stays within `step` m of where he parried)
  const moved = Math.hypot(p.x - S.ox, p.z - S.oz);
  a.travel = clamp(Math.min(dist - D.minGap, D.step - moved), 0, D.step);
  a.rip = S.rip;
  a.rip.damage = S.d2;
  a.rip.beat = 2;
  a.rip.dx = S.dx;
  a.rip.dz = S.dz;
  a.crit = true;
  P.hb.held = false;
  P.buf.action = null;
  P.iframeT = Math.max(fin(P.iframeT), THRUST.windup + THRUST.active + THRUST.recovery + D.iframePad);
  S.phase = 'thrust';
  S.beat = 2;
  return true;
}

/** What `_applyHit` puts to the duelist's takeHit for a deathblow beat. */
export function deathblowTakeHit(P, point, out) {
  const S = P.db, p = P.position;
  out.damage = S.rip.damage;
  out.part = 'body';
  out.point = point;
  out.dir = { x: S.dx, z: S.dz };
  out.heavy = true;
  out.crit = true;
  out.exact = true;
  out.posture = 0;
  out.flash = DEFENSE.deathblow.flash;
  if (S.beat === 2) {
    out.reel = 2;
    out.away = { x: p.x, z: p.z };
  }
  return out;
}

/** A beat's contact weight and its events (after `_applyHit` dealt `dealt`). */
export function deathblowLanded(P, dealt) {
  const S = P.db, D = DEFENSE.deathblow, R = DEFENSE.riposteCut, g = P.game, G = DEFENSE.flurry.ground, PL = DEFENSE.plunge;
  const n = Math.max(1, Math.min(D.cap, S.run)), k = S.beat === 2 ? D.w2 : D.w1;
  dealt = fin(dealt);
  S.dealt += dealt;
  P._hitstop(PL.impactStop * R.stopK * k, 0.03);
  g.shake?.(Math.min(1, (PL.impactShake + R.shakePerN * n) * k) * G.shake);
  g.punch?.((R.punch + R.punchPerN * n) * k * G.kick);
  P.anim?.kickCoat?.(1.1, P.anim.noise);
  const last = S.beat === 2;
  P._emit('player:flurryHit', { n: S.beat, of: 2, last, damage: dealt, planted: true });
  if (!last) return;
  // the biggest moment of the chain: the growing spit read at a tier-5 streak scaled by the run, with its heat flash
  const tp = S.att?.position;
  if (tp) {
    parrySparks(g, tp.x - S.dx * 0.3, fin(tp.y) + D.reach, tp.z - S.dz * 0.3, {
      mode: 'a', grow: 'a', met: false, fdx: S.dx, fdz: S.dz, streak: D.burst.base + D.burst.per * S.run, last: true,
    });
  }
  S.phase = 'tail';
  end(P);
}
