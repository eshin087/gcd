// The breathed patterns (docs/COMBAT.md "Bullets", ADR-039, ADR-050): six spells built on bullets.js.
//
//   emberStorm   Ember torrent: the neck sweeps a living stream of embers across the hero (gusts,
//                gaps, a core; P2+: red orbs coughed at the sweep's extremes, and it ends in barks:
//                short dense cones snapped at him, P3's last one red)
//   fanVolley    Cinder burst: the head snaps onto the hero and coughs shotgun cones (P2+: a red orb
//                wave to finish, P3: double taps; P3 may run straight into a torrent)
//   cinderSpit   Cinder spit: a quick snap of two or three fast embers (chained between other moves)
//   emberRain    Ember rain: rears and coughs volleys high into the air; they rain down round the hero
//   fireWheel    Scouring breath: braced, the neck rakes a breath across the ground; tongues of fire
//                crawl out along it (the key is historical: nothing turns like a wheel any more)
//   fireLanes  Fire lanes (P3): the breath driven into the ground again and again, each strike
//                splitting into lanes of fire across the field; the lit lanes change every strike
//
// No spinning (2026-11-15): the wyrm never turns its body faster than its walking turn rate while it
// breathes; the neck and the head do the aiming, the body is braced (plantPose).
//
// Every bullet is BREATHED (ADR-050): spit() spawns it at rig.pt.mouth along the head's actual aim
// (pt.headFwd), from the action's hit() hook, which runs after the rig: the bullet leaves the jaws
// where they are drawn this frame. The pose aims the head first (aimHead: reach out of the neck
// base, look down the line, headExact) and the emission follows where it really points. A bullet
// leaves at mouth height and descends to hit height over a drop scaled to the hero's distance, so a
// close hero is not flown over. Every emission has a visible cause: the jaw open, the throat lit
// (d.throat), a muzzle flash, a head kick per cough. The ground tongues run out from where the
// breath strikes the ground (bullets.scour: a plan the field releases on time, from a pivot under
// the neck base, so the cue can see them coming).
//
// Same contract as fireAttacks.js: defs with { name, cooldown, phases, beats, weight, start, enter,
// update, hit, end }; numbers in tuningBullets.js. Each pattern declares ONE headline beat (announced
// by the brain like every attack: combat:tell at the windup, combat:flash flashLead s before the first
// impact, re-timed every frame; when the lead bullet is still on its way as the action ends, the
// field keeps the flash for it: bullets.holdFlash); every later impact is announced by the bullets'
// own cue (bullets.js). Bullets that will reach the hero in less than flashLead from the mouth are
// cued here BEFORE they exist, from the emission schedule, so hugging the wyrm is not a blind spot
// (nor a free pass).
//
// Imported only by attacks.js (circular: uses its hoisted helpers at call time, like fireAttacks.js).

import { TUNING, SCALE } from './tuning.js';
import { TELL } from '../../combat/rules.js';
import { clamp, angleDiff, easeInOutSine } from '../../core/math.js';
import { beat, perPhase } from './attacks.js';
import { BULLET } from './bullets.js';
import * as BFX from './bulletFx.js';

const T = TUNING.attacks;
const BK = TUNING.bullets;
const S = SCALE;
const REST_SPREAD = TUNING.rest.spread;
const ES = T.emberStorm, FV = T.fanVolley, CS = T.cinderSpit, ER = T.emberRain, FW = T.fireWheel, CL = T.fireLanes;
const wind = (d, base) => base * (d.tScale ?? 1);
const playerR = (g) => g.player?.radius ?? 0.45;
const frac = (v) => v - Math.floor(v);
const rand = (a, b) => a + Math.random() * (b - a);
const LOOK_RATE = 24; // the head's look target smoothing while breathing (1 / s)
const MOUTH_AHEAD = 1.0; // m the jaws reach past the head point (the strike point is measured from there)

function wPhase(spec, d) {
  const ph = Math.max(1, d.phase | 0);
  const w = spec.weight;
  if (Array.isArray(w)) return Number(w[Math.min(w.length - 1, ph - 1)]) || 0;
  return ph >= (spec.phase ?? 1) ? Number(w) || 0 : 0;
}

/** The head's actual aim (world yaw of rig.pt.headFwd). */
export function headYaw(d) {
  const f = d.rig.pt.headFwd;
  return Math.atan2(f.x, f.z);
}

/** Horizontal distance and bearing from the mouth to the hero (out.D, out.th). */
function mouthGeo(d, out) {
  const m = d.rig.pt.mouth, p = d.sense.pos;
  const dx = p.x - m.x, dz = p.z - m.z;
  out.D = Math.hypot(dx, dz);
  out.th = Math.atan2(dx, dz);
  return out;
}
const _geo = { D: 0, th: 0 };

/**
 * One bullet breathed out of the jaws (ADR-050): at rig.pt.mouth, flying along the head's aim + dyaw.
 * It reaches hit height after a drop scaled to the mouth-to-hero distance (a close hero is not flown
 * over). Returns the record or null.
 */
export function spit(d, kind, attack, dyaw, speed, grp = -1, life = 0) {
  const m = d.rig.pt.mouth;
  const b = d.bullets.spawn(kind, attack, m.x, m.y, m.z, headYaw(d) + dyaw, speed, grp, life);
  if (b) {
    const p = d.sense.pos, D = Math.hypot(p.x - m.x, p.z - m.z);
    b.drop = clamp((BK.dropK * (Number.isFinite(D) ? D : 10)) / Math.max(1, speed), BK.dropMin, BK.dropMax);
  }
  return b;
}

/**
 * Breathing pose of the head: it reaches `reach` (model units) out of the neck base along world yaw
 * `yaw`, dipped `dy`, and looks down that line at hit height `dist` m from the mouth (or at `look`).
 * headExact: the emission follows the head, so the head must not lag behind its aim.
 */
function aimHead(d, yaw, reach, dy, dist, look = null) {
  const pose = d.pose, pt = d.rig.pt;
  const sa = Math.sin(yaw), ca = Math.cos(yaw);
  pose.head = pose.headTarget.set(pt.neckBase.x + sa * reach * S, pt.neckBase.y + dy * S, pt.neckBase.z + ca * reach * S);
  pose.headRate = 7;
  if (look) pose.look.set(look.x, BK.height, look.z);
  else {
    const L = clamp(Number.isFinite(dist) ? dist : 10, 3, 30);
    pose.look.set(pt.mouth.x + sa * L, BK.height, pt.mouth.z + ca * L);
  }
  pose.lookRate = LOOK_RATE;
  pose.lookDown = 1.0;
  pose.headExact = true;
}

/**
 * The head's reach (model units) for a hero `D` m from the neck base: `base`, drawn in over a close
 * hero so the jaws stay ~2 m short of him and point down at him (not over his head).
 */
function reachFor(d, base) {
  const nb = d.rig.pt.neckBase, p = d.sense.pos;
  const Dn = Math.hypot(p.x - nb.x, p.z - nb.z);
  return Number.isFinite(Dn) ? clamp((Dn - 2.2) / S, 0.6, base) : base;
}

/** Feet planted wide for a sustained breath, the body a little lowered. */
function plantPose(d, k) {
  const pose = d.pose;
  pose.stanceF = 0.3;
  pose.stanceH = 0.25;
  pose.restep = 1;
  pose.lower = 0.3 * k;
  pose.pitch = 0.04;
  pose.elbowsOut = 0.4;
  pose.spread[0] = pose.spread[1] = 1;
  pose.spreadRate = 3;
  pose.mantle = 1;
}

/** The headline beat: follow the lead bullet while it is on its way; register its impact once flashed. */
function headline(d, a, kind) {
  const b = a.beats?.[0];
  if (!b) return;
  if (!b.flashed) {
    const tt = d.bullets.leadTti();
    if (Number.isFinite(tt)) b.impactIn = Math.max(0.05, a.T - b.at + tt);
  } else if (!a.covered) {
    a.covered = true;
    d.bullets.headlined(kind, Math.max(0, b.at + b.impactIn - a.T));
  }
}

/**
 * A pattern that ends without its flash. Its lead bullet still on its way (a far hero): the field
 * flashes flashLead s before THAT lands (bullets.holdFlash). No lead left (`kind` omitted, or it
 * died): flash now, so tell / flash stay paired.
 */
function flush(d, a, interrupted, kind) {
  const b = a.beats?.[0];
  if (interrupted || !b || !b.told || b.flashed) return;
  if (kind !== undefined && d.bullets.holdFlash(a, b, kind)) return;
  b.flashed = true;
  d.flashTell(a, b);
}

/** Settling after a breath: the body rises, the wings fold, the jaw closes, the throat dims. */
function settlePose(d, k) {
  const pose = d.pose;
  pose.lower = 0.35 * (1 - k);
  pose.spread[0] = pose.spread[1] = k < 0.3 ? 0.55 : REST_SPREAD;
  pose.spreadRate = 3;
  pose.jaw = 0.3;
  pose.restep = 1;
  d.throat = Math.max(0, 1 - k * 3);
}

/** Embers gathering in the jaws while the throat charges (k 0..1). */
function charge(d, dt, k) {
  const pt = d.rig.pt;
  d.fx.mouthEmbers?.(dt, pt.mouth, 8 + 30 * k, pt.headFwd);
}

/**
 * Cue a cone the jaws will cough `tFire` s from now with a bullet dead on the hero, for a hero it
 * reaches in less than flashLead from the mouth (see the header). bullets.cue() de-duplicates.
 */
function coneCue(d, attack, kind, tFire, speed) {
  const FL = TUNING.flashLead;
  const G = mouthGeo(d, _geo);
  if (!Number.isFinite(G.D + G.th)) return;
  const orb = kind === BULLET.ORB;
  const R = (orb ? BK.orb.r : BK.ember.r) + playerR(d.game);
  const fl = Math.max(0, G.D - R) / speed;
  if (fl >= FL) return;
  const tt = Math.max(0, tFire) + fl;
  if (tt > FL + (orb ? 0.04 : 0) || tt < BK.cueMin + (orb ? 0.03 : 0)) return;
  const m = d.rig.pt.mouth;
  d.bullets.cue(kind, attack, orb ? TELL.RED : TELL.NORMAL, tt, m.x, m.y, m.z);
}

/** A cone of n bullets coughed from the jaws, its q = 0 bullet dead on the head's aim (`off` in spacings). */
function cone(d, attack, kind, n, half, speed, off, grp, life, lead = false) {
  const spacing = n > 1 ? (2 * half) / (n - 1) : 0;
  for (let j = 0; j < n; j++) {
    const q = j - (n - 1) / 2 + off;
    const b = spit(d, kind, attack, q * spacing, speed, grp, life);
    if (lead && Math.abs(q) < 1e-6 && b) d.bullets.setLead(b);
  }
}

// ------------------------------------------------------------------ ember torrent
/** Yaw offset of lane j of n: a forked tongue, laneGap apart, centred on the head's aim. */
const laneOff = (n, j) => (j - (n - 1) / 2) * ES.laneGap;
/** The stream breathes in gusts: true while cast time `t` falls in a gust (not in a gap). */
const gustOn = (a, t) => frac(a.gph + t * ES.gustHz) >= ES.gustGap;

/** The torrent's target aim `te` s from now (the sweep; coughs and barks aside). */
function torrentAim(a, te) {
  return a.cy + a.dir * a.arc * Math.sin(a.ph + 2 * Math.PI * a.hz * te);
}

/**
 * Cue the stream for a hero the bullets reach in less than flashLead from the mouth (see the header):
 * the next breaths' predicted aim (the head trails its target by ~1 / LOOK_RATE s) against his bearing.
 * A coming orb cough and the barks are cued the same way.
 */
function streamCue(d, a) {
  const FL = TUNING.flashLead;
  const G = mouthGeo(d, _geo);
  if (!Number.isFinite(G.D + G.th)) return;
  const m = d.rig.pt.mouth;
  const R = BK.ember.r + playerR(d.game);
  const fl = Math.max(0, G.D - R) / ES.speed;
  if (fl < FL && a.t < a.barkAt) {
    const half = Math.asin(Math.min(1, R / Math.max(G.D, 0.5)));
    for (let k = 0; k < 8; k++) {
      const te = Math.max(0, a.next + k * ES.every - a.t);
      const tt = te + fl;
      if (tt > FL || a.t + te >= a.barkAt) break;
      if (tt < BK.cueMin || a.cough > te || !gustOn(a, a.t + te)) continue;
      const y = torrentAim(a, te - 1 / LOOK_RATE);
      let hit = false;
      for (let j = 0; j < a.lanes && !hit; j++) hit = Math.abs(angleDiff(y + laneOff(a.lanes, j), G.th)) <= half;
      if (hit) {
        d.bullets.cue(BULLET.EMBER, 'emberStorm', TELL.NORMAL, tt, m.x, m.y, m.z);
        break;
      }
    }
  }
  if (a.cough > 0 && !a.coughFired) {
    const Ro = BK.orb.r + playerR(d.game);
    const tt = Math.max(0, a.cough - ES.cough * 0.5) + Math.max(0, G.D - Ro) / ES.orbSpeed;
    if (tt <= FL + 0.04 && tt >= BK.cueMin + 0.03) d.bullets.cue(BULLET.ORB, 'emberStorm', TELL.RED, tt, m.x, m.y, m.z);
  }
  if (a.bi < a.nb) {
    const orb = a.bi === a.nb - 1 && a.barkOrbs > 0;
    coneCue(d, 'emberStorm', orb ? BULLET.ORB : BULLET.EMBER, a.barkAt + 0.25 + a.bi * ES.barkGap - a.t, orb ? ES.orbSpeed : ES.barkSpeed);
  }
}

const emberStorm = {
  name: 'emberStorm',
  cooldown: ES.cooldown,
  phases: (d) => [['windup', wind(d, ES.windup)], ['cast', perPhase(ES.cast, d.phase)], ['recovery', wind(d, ES.recovery)]],
  beats: (d, a) => [beat('emberStorm', 0, a.list[0][1] + 0.5, ES, 'bullet')],
  weight: (d, s) => (s.dist <= ES.maxDist ? wPhase(ES, d) : 0),
  start(d, a) {
    a.grp = d.bullets.group(ES.maxHits);
    a.dir = Math.random() < 0.5 ? 1 : -1;
    a.lanes = Math.max(1, perPhase(ES.lanes, d.phase) | 0);
    a.arc = perPhase(ES.arc, d.phase);
    a.hz = perPhase(ES.sweepHz, d.phase);
    a.orbs = perPhase(ES.orbs, d.phase) | 0;
    // the closing barks: the last nb x barkGap (+ the snap) of the cast
    a.nb = perPhase(ES.barks, d.phase) | 0;
    a.barkN = Math.max(1, perPhase(ES.barkCount, d.phase) | 0) | 1; // (odd: one bullet dead on him)
    a.barkOrbs = perPhase(ES.barkOrbs, d.phase) | 0;
    const Tc = perPhase(ES.cast, d.phase);
    a.barkAt = a.nb > 0 ? Tc - a.nb * ES.barkGap - 0.15 : Infinity;
    a.bi = 0;
    // the lane nearest the middle points straight at the hero on the first breath (the lead ember)
    a.j0 = (a.lanes - 1) >> 1;
    a.ph = Math.asin(clamp(-laneOff(a.lanes, a.j0) / (a.dir * a.arc), -1, 1));
    a.cy = d.sense.yawTo;
    a.gph = ES.gustGap; // a gust starts with the cast
    a.next = 0;
    a.first = true;
    a.covered = false;
    a.cough = 0;
    a.coughFired = true;
    a.lastCos = Math.cos(a.ph);
    a.kick = 0;
    a.wasGust = false;
    a.breathing = false;
  },
  enter(d, a, phase) {
    if (phase === 'cast') {
      d.emit('dragon:spell', { name: 'emberStorm', x: d.position.x, z: d.position.z });
      d.emit('dragon:breathStart');
      a.breathing = true;
      a.next = 0;
    } else if (phase === 'recovery' && a.breathing) {
      a.breathing = false;
      d.emit('dragon:breathEnd');
    }
  },
  update(d, a, dt) {
    const pose = d.pose, s = d.sense, k = a.k, b0 = a.beats?.[0];
    const G = mouthGeo(d, _geo);
    a.kick = Math.max(0, a.kick - dt * 6);
    if (a.phase === 'windup') {
      // plants its feet and lowers the head onto the hero, the throat filling with fire
      a.cy = s.yawTo;
      d.turnToward(s.yawTo, d.turnRate, dt);
      plantPose(d, k);
      aimHead(d, a.cy + a.dir * a.arc * Math.sin(a.ph), reachFor(d, ES.reach) - 0.9 * (1 - k), ES.dy + 0.4 * (1 - k), G.D);
      pose.jaw = 0.25 + 0.55 * k;
      pose.swell = k;
      d.throat = k;
      charge(d, dt, k);
      if (b0 && !b0.flashed && Number.isFinite(G.D)) {
        b0.impactIn = Math.max(0.05, a.list[0][1] + Math.max(0, G.D - BK.ember.r - playerR(d.game)) / ES.speed);
      }
    } else if (a.phase === 'cast') {
      plantPose(d, 1);
      pose.swell = 1;
      pose.jawRate = 16;
      d.throat = 1;
      // the neck sweeps the stream; the body only turns to re-centre on the hero, at a walk's turn
      a.cy += clamp(angleDiff(a.cy, s.yawTo), -ES.recentre * dt, ES.recentre * dt);
      d.turnToward(a.cy, d.turnRate * 0.7, dt);
      let aim;
      if (a.t >= a.barkAt) {
        // the barks: the neck stops, the head snaps onto him, the jaw shut between barks
        aim = G.th;
        const tb = a.bi < a.nb ? a.barkAt + 0.25 + a.bi * ES.barkGap - a.t : 9;
        pose.jaw = tb < 0.08 || a.kick > 0.6 ? 1 : 0.35;
        pose.jawRate = 26;
      } else if (a.cough > 0) {
        a.cough -= dt;
        aim = G.th; // the head snaps round onto him for the cough
        pose.jaw = 1;
      } else {
        a.ph += 2 * Math.PI * a.hz * dt;
        const c = Math.cos(a.ph);
        // an extreme of the sweep: P2+ coughs a tight fan of red orbs at him (not into the barks)
        if (a.orbs > 0 && c * a.lastCos < 0 && a.t > 0.3 && a.t < a.barkAt - 0.45) {
          a.cough = ES.cough;
          a.coughFired = false;
        }
        a.lastCos = c;
        aim = a.cy + a.dir * a.arc * Math.sin(a.ph);
        pose.jaw = gustOn(a, a.t) ? 0.95 : 0.7; // (the jaw works with the gusts)
      }
      aimHead(d, aim, reachFor(d, ES.reach), ES.dy, G.D, a.cough > 0 || a.t >= a.barkAt ? s.pos : null);
      pose.headOffset.y += a.kick * 0.3 * S;
    } else {
      plantPose(d, 1 - k);
      settlePose(d, k);
    }
    headline(d, a, BULLET.EMBER);
  },
  // (after the rig: the bullets leave the jaws where they are drawn this frame)
  hit(d, a) {
    if (a.phase !== 'cast') return;
    const pt = d.rig.pt, m = pt.mouth, f = pt.headFwd;
    if (a.t >= a.barkAt) {
      if (a.bi < a.nb && a.t >= a.barkAt + 0.25 + a.bi * ES.barkGap) {
        const orb = a.bi === a.nb - 1 && a.barkOrbs > 0;
        if (orb) cone(d, 'emberStorm', BULLET.ORB, a.barkOrbs | 1, ES.orbSpread * 2, ES.orbSpeed, 0, a.grp, 5);
        else cone(d, 'emberStorm', BULLET.EMBER, a.barkN, ES.barkSpread, ES.barkSpeed, 0, a.grp, ES.life);
        BFX.muzzle(d.fx, m.x, m.y, m.z, f.x, f.z, orb ? 18 : 14);
        a.kick = 1;
        a.bi++;
        d.game.shake?.(orb ? 0.3 : 0.2);
      }
    } else if (a.cough > 0) {
      if (!a.coughFired && a.cough <= ES.cough * 0.5) {
        a.coughFired = true;
        for (let j = 0; j < a.orbs; j++) spit(d, BULLET.ORB, 'emberStorm', (j - (a.orbs - 1) / 2) * ES.orbSpread, ES.orbSpeed, a.grp, 5);
        BFX.muzzle(d.fx, m.x, m.y, m.z, f.x, f.z, 14);
        a.kick = 1;
        d.game.shake?.(0.2);
      }
      a.next = Math.max(a.next, a.t); // the stream picks up again after the cough
    } else {
      let n = 0, gust = false;
      while (a.t >= a.next && n++ < 4) {
        if (gustOn(a, a.next)) {
          gust = true;
          for (let j = 0; j < a.lanes; j++) {
            // the lead ember flies true; the rest stray a little in aim and speed (the stream's body)
            const lead = a.first && j === a.j0;
            const dy = lead ? 0 : rand(-ES.aimJit, ES.aimJit), sp = lead ? ES.speed : ES.speed * (1 + rand(-ES.speedJit, ES.speedJit));
            const b = spit(d, BULLET.EMBER, 'emberStorm', laneOff(a.lanes, j) + dy, sp, a.grp, ES.life);
            if (lead && b) d.bullets.setLead(b);
          }
          a.first = false;
        }
        a.next += ES.every;
      }
      if (a.t >= a.next) a.next = a.t + ES.every; // (a long frame: no catch-up burst)
      if (gust) BFX.muzzle(d.fx, m.x, m.y, m.z, f.x, f.z, gust && !a.wasGust ? 7 : 2); // a gust bursts out, then pours
      if (n > 0) a.wasGust = gust;
    }
    streamCue(d, a);
  },
  end(d, a, interrupted) {
    d.throat = 0;
    if (a.breathing) {
      a.breathing = false;
      d.emit('dragon:breathEnd');
    }
    flush(d, a, interrupted, BULLET.EMBER);
  },
};

// ------------------------------------------------------------------ cinder burst
/** Even coughs and the orb wave put a bullet exactly on the hero; odd coughs put him in a gap. */
const fanOnHero = (i, orbWave) => orbWave || !(i & 1);

/**
 * Shift (in bullet spacings) of cough i off the symmetric cone q = j - (n - 1) / 2, which has a
 * bullet on the centre line only for an odd count: an even count is shifted half a spacing to get
 * one (and an odd count to open the gap).
 */
function fanOffset(i, n, orbWave) {
  return !!(n & 1) === fanOnHero(i, orbWave) ? 0 : 0.5;
}

/** The cough schedule: { t (cast s), i, orb, off, tap, done } (P3: odd coughs get a double tap). */
function burstSchedule(d, a) {
  const S0 = (a.sched = []);
  const tap = perPhase(FV.doubleTap, d.phase) > 0;
  for (let i = 0; i < a.n; i++) {
    const off = fanOffset(i, a.cnt, false);
    S0.push({ t: i * FV.gap, i, orb: false, off, tap: false, done: false });
    if (tap && i & 1) S0.push({ t: i * FV.gap + FV.tapGap, i, orb: false, off: (off + 0.5) % 1, tap: true, done: false });
  }
  if (a.orb > 0) S0.push({ t: a.n * FV.gap, i: a.n, orb: true, off: fanOffset(a.n, a.orb, true), tap: false, done: false });
}

function cough(d, a, e) {
  const B = d.bullets, pt = d.rig.pt, m = pt.mouth, f = pt.headFwd;
  const n = e.orb ? a.orb : a.cnt;
  const half = e.orb ? FV.orbSpread : FV.spread;
  const speed = e.orb ? FV.orbSpeed : FV.speed;
  const spacing = n > 1 ? (2 * half) / (n - 1) : 0;
  for (let j = 0; j < n; j++) {
    const q = j - (n - 1) / 2 + e.off;
    const b = spit(d, e.orb ? BULLET.ORB : BULLET.EMBER, 'fanVolley', q * spacing, speed, a.grp, e.orb ? 5 : FV.life);
    if (e.i === 0 && !e.tap && Math.abs(q) < 1e-6 && b) B.setLead(b);
  }
  BFX.muzzle(d.fx, m.x, m.y, m.z, f.x, f.z, e.orb ? 16 : 10);
  a.last = a.t;
  a.kick = 1;
  d.game.shake?.(e.orb ? 0.3 : 0.14);
}

/** The next cough's cue for a hero it reaches in less than flashLead from the mouth (see the header). */
function burstCue(d, a) {
  const FL = TUNING.flashLead;
  let e = null;
  for (const x of a.sched) {
    if (!x.done) {
      e = x;
      break;
    }
  }
  if (!e || e.i === 0) return; // (the first cough is the headline beat's)
  const G = mouthGeo(d, _geo);
  if (!Number.isFinite(G.D + G.th)) return;
  const R = (e.orb ? BK.orb.r : BK.ember.r) + playerR(d.game);
  const speed = e.orb ? FV.orbSpeed : FV.speed;
  const fl = Math.max(0, G.D - R) / speed;
  if (fl >= FL) return;
  const tt = Math.max(0, e.t - a.t) + fl;
  if (tt > FL + (e.orb ? 0.04 : 0) || tt < BK.cueMin + (e.orb ? 0.03 : 0)) return;
  const n = e.orb ? a.orb : a.cnt;
  const spacing = n > 1 ? (2 * (e.orb ? FV.orbSpread : FV.spread)) / (n - 1) : 0;
  const q = e.off === 0 ? 0 : 0.5; // spacings from the hero to the nearest bullet (the head is on him)
  if (G.D * Math.sin(Math.min(1.5, q * spacing)) > R) return;
  const m = d.rig.pt.mouth;
  d.bullets.cue(e.orb ? BULLET.ORB : BULLET.EMBER, 'fanVolley', e.orb ? TELL.RED : TELL.NORMAL, tt, m.x, m.y, m.z);
}

const fanVolley = {
  name: 'fanVolley',
  cooldown: FV.cooldown,
  phases: (d) => {
    const n = (perPhase(FV.volleys, d.phase) | 0) + (perPhase(FV.orbWave, d.phase) > 0 ? 1 : 0);
    return [['windup', wind(d, FV.windup)], ['cast', n * FV.gap + 0.25], ['recovery', wind(d, FV.recovery)]];
  },
  beats: (d, a) => [beat('fanVolley', 0, a.list[0][1] + 0.4, FV, 'bullet')],
  weight: (d, s) => (s.dist >= FV.minDist && s.dist <= FV.maxDist ? wPhase(FV, d) : 0),
  start(d, a) {
    a.grp = d.bullets.group(FV.maxHits);
    a.n = perPhase(FV.volleys, d.phase) | 0;
    a.cnt = perPhase(FV.count, d.phase) | 0;
    a.orb = perPhase(FV.orbWave, d.phase) | 0;
    burstSchedule(d, a);
    a.last = -9;
    a.kick = 0;
    a.covered = false;
  },
  enter(d, a, phase) {
    if (phase === 'cast') d.emit('dragon:spell', { name: 'fanVolley', x: d.position.x, z: d.position.z });
  },
  update(d, a, dt) {
    const pose = d.pose, s = d.sense, k = a.k, b0 = a.beats?.[0];
    const G = mouthGeo(d, _geo);
    if (a.phase !== 'recovery') d.turnToward(s.yawTo, d.turnRate, dt);
    a.kick = Math.max(0, a.kick - dt * 7);
    plantPose(d, 0.5);
    pose.rear = 0.12;
    if (a.phase === 'windup') {
      // the neck coils back, the throat glows: the head snaps out onto the hero
      aimHead(d, s.yawTo, Math.min(reachFor(d, 2.6), 1.4 + 0.5 * k), 0.1, G.D, s.pos);
      pose.jaw = 0.2 + 0.3 * k;
      pose.swell = 0.7 * k;
      d.throat = 0.7 * k;
      charge(d, dt, k);
      if (b0 && !b0.flashed && Number.isFinite(G.D)) {
        b0.impactIn = Math.max(0.05, a.list[0][1] + Math.max(0, G.D - BK.ember.r - playerR(d.game)) / FV.speed);
      }
    } else if (a.phase === 'cast') {
      // between coughs the neck coils back and the jaw closes; each cough snaps the head out at him,
      // the jaw wide, the head kicking up
      let nextT = Infinity;
      for (const x of a.sched) {
        if (!x.done) {
          nextT = x.t;
          break;
        }
      }
      const since = a.t - a.last, until = nextT - a.t;
      const coil = since < 0.12 ? 0 : clamp(1 - until / 0.32, 0, 1);
      aimHead(d, s.yawTo, Math.max(0.6, reachFor(d, 2.6) - 0.8 * coil), -0.1 + 0.25 * coil, G.D, s.pos);
      pose.headOffset.y += a.kick * FV.recoil;
      pose.jaw = since < 0.14 ? 1 : 0.3 + 0.35 * coil;
      pose.jawRate = 22;
      d.throat = 0.6 + 0.4 * coil;
    } else {
      pose.rear = 0.12 * (1 - k);
      pose.spread[0] = pose.spread[1] = k < 0.3 ? 0.55 : REST_SPREAD;
      pose.spreadRate = 3;
      pose.restep = 1;
      d.throat = Math.max(0, 0.7 - k * 2);
    }
    headline(d, a, BULLET.EMBER);
  },
  hit(d, a) {
    if (a.phase !== 'cast') return;
    for (const e of a.sched) {
      if (e.done) continue;
      if (a.t < e.t) break;
      e.done = true;
      cough(d, a, e);
    }
    burstCue(d, a);
  },
  end(d, a, interrupted) {
    d.throat = 0;
    flush(d, a, interrupted, BULLET.EMBER);
    // P3: the burst may run straight into an Ember torrent, no idle between (the brain's queue)
    const br = d.brain;
    if (!interrupted && br?.aiEnabled && d.state === 'combat' && !br.queued && d.sense.dist <= ES.maxDist &&
      (br.cooldowns?.emberStorm ?? 0) <= 0 && Math.random() < perPhase(FV.chain, d.phase)) {
      br.queued = emberStorm;
    }
  },
};

// ------------------------------------------------------------------ cinder spit
const cinderSpit = {
  name: 'cinderSpit',
  cooldown: CS.cooldown,
  phases: (d) => {
    const two = perPhase(CS.twice, d.phase) > 0;
    return [['windup', wind(d, CS.windup)], ['cast', CS.cast + (two ? CS.twiceGap : 0)], ['recovery', wind(d, CS.recovery)]];
  },
  beats: (d, a) => [beat('cinderSpit', 0, a.list[0][1] + Math.max(0, d.sense.dist - 4) / CS.speed, CS, 'bullet')],
  weight: (d, s) =>
    s.dist >= CS.minDist && s.dist <= CS.maxDist && Math.abs(angleDiff(d.yaw, s.yawTo)) <= CS.arcMax ? wPhase(CS, d) : 0,
  start(d, a) {
    a.grp = d.bullets.group(CS.maxHits);
    a.n = Math.max(1, perPhase(CS.count, d.phase) | 0);
    a.two = perPhase(CS.twice, d.phase) > 0;
    a.shots = 0;
    a.kick = 0;
    a.covered = false;
  },
  enter(d, a, phase) {
    if (phase === 'cast') d.emit('dragon:spell', { name: 'cinderSpit', x: d.position.x, z: d.position.z });
  },
  update(d, a, dt) {
    const pose = d.pose, s = d.sense, k = a.k, b0 = a.beats?.[0];
    const G = mouthGeo(d, _geo);
    a.kick = Math.max(0, a.kick - dt * 8);
    if (a.phase !== 'recovery') d.turnToward(s.yawTo, d.turnRate, dt);
    if (a.phase === 'windup') {
      // a flick: the neck draws back and the head cocks, the jaw cracks, sparks in the teeth
      aimHead(d, s.yawTo, Math.max(0.6, reachFor(d, 2.4) - 0.9 * k), 0.25 * k, G.D, s.pos);
      pose.headRate = 12;
      pose.jaw = 0.15 + 0.35 * k;
      pose.swell = 0.5 * k;
      d.throat = 0.8 * k;
      charge(d, dt, 0.5 * k);
      if (b0 && !b0.flashed && Number.isFinite(G.D)) {
        b0.impactIn = Math.max(0.05, a.list[0][1] + Math.max(0, G.D - BK.ember.r - playerR(d.game)) / CS.speed);
      }
    } else if (a.phase === 'cast') {
      aimHead(d, s.yawTo, reachFor(d, 2.4), -0.1, G.D, s.pos);
      pose.headRate = 16;
      pose.jaw = 1;
      pose.jawRate = 28;
      d.throat = 1;
      pose.headOffset.y += a.kick * 0.35 * S;
    } else {
      pose.jaw = 0.3 * (1 - k);
      d.throat = Math.max(0, 0.6 - 2 * k);
      pose.restep = 1;
    }
    headline(d, a, BULLET.EMBER);
  },
  hit(d, a) {
    if (a.phase !== 'cast') return;
    const pt = d.rig.pt, m = pt.mouth, f = pt.headFwd;
    // even counts: one ember on him and one beside (q = 0, 1); the second spit half a spacing over
    const even = !(a.n & 1);
    if (a.shots === 0) {
      a.shots = 1;
      cone(d, 'cinderSpit', BULLET.EMBER, a.n, (CS.spread * (a.n - 1)) / 2, CS.speed, even ? 0.5 : 0, a.grp, CS.life, true);
      BFX.muzzle(d.fx, m.x, m.y, m.z, f.x, f.z, 9);
      a.kick = 1;
      d.game.shake?.(0.1);
    } else if (a.shots === 1 && a.two && a.t >= CS.twiceGap) {
      a.shots = 2;
      cone(d, 'cinderSpit', BULLET.EMBER, a.n, (CS.spread * (a.n - 1)) / 2, CS.speed, even ? 0 : 0.5, a.grp, CS.life);
      BFX.muzzle(d.fx, m.x, m.y, m.z, f.x, f.z, 7);
      a.kick = 1;
    }
  },
  end(d, a, interrupted) {
    d.throat = 0;
    flush(d, a, interrupted, BULLET.EMBER);
  },
};

// ------------------------------------------------------------------ ember rain
const _land = { x: 0, z: 0 };

const emberRain = {
  name: 'emberRain',
  cooldown: ER.cooldown,
  phases: (d) => {
    const n = perPhase(ER.volleys, d.phase) | 0;
    return [['windup', wind(d, ER.windup)], ['cast', n * perPhase(ER.gap, d.phase) + 0.2], ['recovery', wind(d, ER.recovery)]];
  },
  beats: (d, a) => [beat('emberRain', 0, a.list[0][1] + perPhase(ER.flight, d.phase), ER, 'bullet')],
  weight: (d, s) => (s.dist >= ER.minDist && s.dist <= ER.maxDist ? wPhase(ER, d) : 0),
  start(d, a) {
    a.grp = d.bullets.group(ER.maxHits);
    a.n = perPhase(ER.volleys, d.phase) | 0;
    a.gap = perPhase(ER.gap, d.phase);
    a.ring = perPhase(ER.ring, d.phase) | 0;
    a.ring2 = perPhase(ER.ring2, d.phase) | 0;
    a.fl = perPhase(ER.flight, d.phase);
    a.lead = perPhase(ER.lead, d.phase) || 0;
    a.rot = Math.random() * Math.PI * 2;
    a.vi = 0;
    a.kick = 0;
    a.covered = false;
  },
  enter(d, a, phase) {
    if (phase === 'cast') d.emit('dragon:spell', { name: 'emberRain', x: d.position.x, z: d.position.z });
  },
  update(d, a, dt) {
    const pose = d.pose, s = d.sense, k = a.k, b0 = a.beats?.[0], pt = d.rig.pt;
    const G = mouthGeo(d, _geo);
    a.kick = Math.max(0, a.kick - dt * 5);
    if (a.phase !== 'recovery') d.turnToward(s.yawTo, d.turnRate, dt);
    plantPose(d, 0.6);
    if (a.phase === 'windup' || a.phase === 'cast') {
      // reared on its haunches, the neck thrown up and back: it coughs at the sky over the hero
      const up = a.phase === 'windup' ? k : 1;
      aimHead(d, s.yawTo, 1.7 - 0.5 * up, 0.4 + 1.5 * up, G.D);
      pose.look.set(pt.mouth.x + Math.sin(s.yawTo) * 4, pt.mouth.y + 6 + 4 * up, pt.mouth.z + Math.cos(s.yawTo) * 4);
      pose.lookDown = 0;
      pose.pitch = -0.1 * up;
      pose.rear = 0.25 * up;
      pose.headOffset.y += a.kick * 0.5 * S;
      pose.jaw = a.phase === 'windup' ? 0.2 + 0.5 * k : a.kick > 0.4 ? 1 : 0.55;
      pose.jawRate = 20;
      pose.swell = a.phase === 'windup' ? k : 0.8 + 0.2 * a.kick;
      d.throat = a.phase === 'windup' ? k : 0.8;
      if (a.phase === 'windup') charge(d, dt, k);
      if (b0 && !b0.flashed && a.phase === 'windup') b0.impactIn = Math.max(0.05, a.list[0][1] + a.fl - 0.05);
    } else {
      pose.rear = 0.25 * (1 - k);
      settlePose(d, k);
    }
    headline(d, a, BULLET.EMBER);
  },
  hit(d, a) {
    if (a.phase !== 'cast' || a.vi >= a.n || a.t < a.vi * a.gap) return;
    const B = d.bullets, pt = d.rig.pt, m = pt.mouth, p = d.sense.pos, v = d.sense.vel;
    const i = a.vi++;
    // the middle one falls where he stands (P3: a little ahead along his run), the rings round it
    const lx = Number.isFinite(v?.x) ? v.x * a.lead : 0, lz = Number.isFinite(v?.z) ? v.z * a.lead : 0;
    const cx = p.x + lx, cz = p.z + lz;
    const b = B.lob('emberRain', m.x, m.y, m.z, cx, cz, a.fl, a.grp);
    if (i === 0 && b) B.setLead(b);
    const rot = a.rot + i * 0.55;
    for (let j = 0; j < a.ring; j++) {
      const t = rot + (j / a.ring) * Math.PI * 2;
      _land.x = cx + Math.sin(t) * ER.ringR;
      _land.z = cz + Math.cos(t) * ER.ringR;
      B.lob('emberRain', m.x, m.y, m.z, _land.x, _land.z, a.fl + rand(-0.04, 0.06), a.grp);
    }
    for (let j = 0; j < a.ring2; j++) {
      const t = rot + ((j + 0.5) / a.ring2) * Math.PI * 2;
      B.lob('emberRain', m.x, m.y, m.z, cx + Math.sin(t) * ER.ring2R, cz + Math.cos(t) * ER.ring2R, a.fl + rand(0, 0.1), a.grp);
    }
    const f = pt.headFwd;
    BFX.muzzle(d.fx, m.x, m.y, m.z, f.x * 0.5, f.z * 0.5, 16);
    a.kick = 1;
    d.game.shake?.(0.16);
  },
  end(d, a, interrupted) {
    d.throat = 0;
    flush(d, a, interrupted, BULLET.EMBER);
  },
};

// ------------------------------------------------------------------ ground tongues (shared)
/** The pivot every tongue of a breath runs out from (under the neck base) and r0 (where it strikes). */
function scourPivot(d, a, spec) {
  const nb = d.rig.pt.neckBase;
  a.px = nb.x;
  a.pz = nb.z;
  a.r0 = spec.reach * S + MOUTH_AHEAD + spec.strike;
}

/** A first-touch estimate (s from now) of a plan against the standing hero, for the headline beat. */
function planEstimate(d, a, times, angs, spec) {
  const p = d.sense.pos, hr = playerR(d.game);
  const dx = p.x - a.px, dz = p.z - a.pz, r = Math.hypot(dx, dz), th = Math.atan2(dx, dz);
  if (!Number.isFinite(r + th) || r < a.r0 - hr) return times[0] + 1;
  const half = Math.asin(Math.min(1, (spec.width / 2 + hr / 2) / Math.max(r, 0.5)));
  for (let i = 0; i < times.length; i++) {
    if (Math.abs(angleDiff(angs[i], th)) <= half) return times[i] + Math.max(0, r - hr - a.r0) / spec.speed;
  }
  return times[0] + 1;
}

/** The headline beat of a tongue pattern: re-timed from the field's look-ahead until it flashes. */
function scourHeadline(d, a) {
  const b0 = a.beats?.[0], B = d.bullets;
  if (!b0) return;
  if (!b0.flashed) {
    if (Number.isFinite(B.ttT)) b0.impactIn = Math.max(0.05, a.T - b0.at + B.ttT);
  } else if (!a.covered) {
    a.covered = true;
    B.scourHeadlined();
  }
}

// ------------------------------------------------------------------ scouring breath
/** The rake's aim `u` s into the cast: eased from side to side, held at each stop. */
function rakeAim(a, u) {
  const per = a.rt + FW.pause;
  let k = Math.floor(Math.max(0, u) / per);
  let s = Math.max(0, u) - k * per;
  if (k >= a.n) {
    k = a.n - 1;
    s = a.rt;
  }
  const dk = k & 1 ? -a.dir : a.dir;
  const from = a.c - (dk * FW.arc) / 2;
  return from + dk * FW.arc * easeInOutSine(clamp(s / a.rt, 0, 1));
}
/** True while the head holds still between two rakes (the breath drawn in). */
const rakePaused = (a, u) => {
  const per = a.rt + FW.pause;
  const s = u - Math.floor(u / per) * per;
  return s > a.rt || u >= a.n * per - FW.pause; // (and the tail after the last rake)
};

const fireWheel = {
  name: 'fireWheel',
  cooldown: FW.cooldown,
  phases: (d) => {
    const n = perPhase(FW.rakes, d.phase) | 0, rt = perPhase(FW.rakeTime, d.phase);
    return [['windup', wind(d, FW.windup)], ['cast', n * rt + (n - 1) * FW.pause + 0.3], ['recovery', wind(d, FW.recovery)]];
  },
  beats: (d, a) => [beat('fireWheel', 0, a.est ?? a.list[0][1] + 1, FW, 'mouth')],
  weight: (d, s) => (s.dist >= FW.minDist && s.dist <= FW.maxDist ? wPhase(FW, d) : 0),
  start(d, a) {
    a.n = Math.max(1, perPhase(FW.rakes, d.phase) | 0);
    a.rt = perPhase(FW.rakeTime, d.phase);
    a.dir = Math.random() < 0.5 ? 1 : -1;
    scourPivot(d, a, FW);
    const p = d.sense.pos;
    a.c = Math.atan2(p.x - a.px, p.z - a.pz); // the arc is centred on the hero
    if (!Number.isFinite(a.c)) a.c = d.yaw;
    // the plan: a tongue every `every` s along each rake (the rake back shifted into the gaps)
    // the plan: `tongues` lines evenly over the arc (the middle one on the hero), each released as
    // the eased rake passes it; the rake back lays its tongues `interleave` of a step into the gaps
    const W = a.list[0][1], m = Math.max(2, perPhase(FW.tongues, d.phase) | 0), il = perPhase(FW.interleave, d.phase);
    const times = [], angs = [];
    for (let k = 0; k < a.n; k++) {
      const t0 = k * (a.rt + FW.pause), dk = k & 1 ? -a.dir : a.dir, from = a.c - (dk * FW.arc) / 2;
      const sh = k & 1 ? il : 0;
      for (let i = 0; i + sh <= m - 1 + 1e-6 && times.length < 64; i++) {
        const u = (i + sh) / (m - 1); // share of the arc; the eased aim reaches it at s = rt x acos(1 - 2u) / pi
        times.push(W + t0 + (a.rt * Math.acos(clamp(1 - 2 * u, -1, 1))) / Math.PI);
        angs.push(from + dk * FW.arc * u);
      }
    }
    a.est = planEstimate(d, a, times, angs, FW);
    a.u = 0;
    a.aim = rakeAim(a, 0);
    a.covered = false;
    a.breathing = false;
    a.warm = { hold: 0, acc4: 0, heatT: 0 };
    d.bullets.scour({
      attack: 'fireWheel', x: a.px, z: a.pz, times, angs, r0: a.r0, r1: FW.r1, speed: FW.speed, hold: perPhase(FW.hold, d.phase),
      width: FW.width, damage: FW.damage, burn: FW.burn, knockback: FW.knockback, grp: d.bullets.group(FW.maxHits), headline: true,
    });
  },
  enter(d, a, phase) {
    if (phase === 'cast') {
      d.emit('dragon:spell', { name: 'fireWheel', x: d.position.x, z: d.position.z });
      d.emit('dragon:breathStart');
      a.breathing = true;
      d.game.shake?.(0.3);
    } else if (phase === 'recovery' && a.breathing) {
      a.breathing = false;
      d.emit('dragon:breathEnd');
    }
  },
  update(d, a, dt) {
    const pose = d.pose, k = a.k;
    scourHeadline(d, a);
    if (a.phase === 'windup') {
      // braces facing the middle of the arc, crouches; the head swings low to where the rake starts:
      // the throat charges, the ground there warms
      d.turnToward(a.c, d.turnRate, dt);
      plantPose(d, k);
      a.aim = rakeAim(a, 0);
      aimHead(d, a.aim, FW.reach - 0.6 * (1 - k), FW.dy + 0.3 * (1 - k), a.r0);
      pose.jaw = 0.3 + 0.5 * k;
      pose.swell = k;
      d.throat = k;
      charge(d, dt, k);
      BFX.strikeWarn(d.fx, a.warm, dt, a.px + Math.sin(a.aim) * a.r0, a.pz + Math.cos(a.aim) * a.r0, 1.4, 0.3 + 0.6 * k);
    } else if (a.phase === 'cast') {
      // braced: the neck rakes the breath across the ground, the body still
      a.u += dt;
      a.aim = rakeAim(a, a.u);
      const held = rakePaused(a, a.u);
      plantPose(d, 1);
      aimHead(d, a.aim, FW.reach, FW.dy + (held ? 0.25 : 0), a.r0);
      pose.jaw = held ? 0.55 : 0.95;
      pose.jawRate = 14;
      pose.swell = held ? 0.7 : 1;
      d.throat = 1;
    } else {
      plantPose(d, 1 - k);
      settlePose(d, k);
    }
  },
  // (after the rig: the breath pours from the jaws as drawn down to the line its tongues run along)
  hit(d, a, dt) {
    if (a.phase !== 'cast') return;
    const m = d.rig.pt.mouth;
    const held = rakePaused(a, a.u);
    BFX.breathBeam(d.fx, m, a.px + Math.sin(a.aim) * a.r0, a.pz + Math.cos(a.aim) * a.r0, dt, held ? 0.3 : 1);
  },
  end(d, a, interrupted) {
    d.throat = 0;
    d.bullets.stopScour();
    if (a.breathing) {
      a.breathing = false;
      d.emit('dragon:breathEnd');
    }
    flush(d, a, interrupted);
  },
};

// ------------------------------------------------------------------ cinder lanes
const fireLanes = {
  name: 'fireLanes',
  cooldown: CL.cooldown,
  phases: (d) => {
    const n = perPhase(CL.strikes, d.phase) | 0, g = perPhase(CL.strikeGap, d.phase);
    return [['windup', wind(d, CL.windup)], ['cast', (n - 1) * g + 0.55], ['recovery', wind(d, CL.recovery)]];
  },
  beats: (d, a) => [beat('fireLanes', 0, a.est ?? a.list[0][1] + 1, CL, 'mouth')],
  weight: (d, s) => (s.dist >= CL.minDist && s.dist <= CL.maxDist ? wPhase(CL, d) : 0),
  start(d, a) {
    a.n = Math.max(1, perPhase(CL.strikes, d.phase) | 0);
    a.g = perPhase(CL.strikeGap, d.phase);
    scourPivot(d, a, CL);
    const p = d.sense.pos;
    a.c = Math.atan2(p.x - a.px, p.z - a.pz);
    if (!Number.isFinite(a.c)) a.c = d.yaw;
    a.flip = Math.random() < 0.5; // (the pattern read left to right or right to left)
    const W = a.list[0][1], times = [], angs = [];
    for (let j = 0; j < a.n; j++) {
      const lit = CL.pattern[j % CL.pattern.length];
      for (let i = 0; i < CL.lanes; i++) {
        if (!((lit >> i) & 1)) continue;
        const lane = a.c + (a.flip ? -1 : 1) * (i - (CL.lanes - 1) / 2) * CL.laneGap;
        for (let b = 0; b < CL.band; b++) {
          times.push(W + j * a.g);
          angs.push(lane + (b - (CL.band - 1) / 2) * CL.bandGap);
        }
      }
    }
    a.est = planEstimate(d, a, times, angs, CL);
    a.si = 0;
    a.kick = 0;
    a.covered = false;
    a.warm = { hold: 0, acc4: 0, heatT: 0 };
    d.bullets.scour({
      attack: 'fireLanes', x: a.px, z: a.pz, times, angs, r0: a.r0, r1: CL.r1, speed: CL.speed, hold: CL.hold,
      width: CL.width, damage: CL.damage, burn: CL.burn, knockback: CL.knockback, grp: d.bullets.group(CL.maxHits), headline: true,
    });
  },
  enter(d, a, phase) {
    if (phase === 'cast') {
      d.emit('dragon:spell', { name: 'fireLanes', x: d.position.x, z: d.position.z });
      d.emit('dragon:breathStart');
      a.breathing = true;
    } else if (phase === 'recovery' && a.breathing) {
      a.breathing = false;
      d.emit('dragon:breathEnd');
    }
  },
  update(d, a, dt) {
    const pose = d.pose, k = a.k;
    scourHeadline(d, a);
    a.kick = Math.max(0, a.kick - dt * 4);
    const sx = a.px + Math.sin(a.c) * a.r0, sz = a.pz + Math.cos(a.c) * a.r0;
    if (a.phase === 'windup') {
      d.turnToward(a.c, d.turnRate, dt);
      plantPose(d, k);
      // the head drawn up and back, then down: it will drive the breath into the ground at its feet
      aimHead(d, a.c, CL.reach - 0.4 * k, CL.dy + 1.4 * (1 - k) + 0.6 * Math.sin(Math.PI * k), a.r0);
      pose.jaw = 0.3 + 0.5 * k;
      pose.swell = k;
      d.throat = k;
      charge(d, dt, k);
      BFX.strikeWarn(d.fx, a.warm, dt, sx, sz, 1.8, 0.3 + 0.6 * k);
    } else if (a.phase === 'cast') {
      // each strike: the head lifts (between) and slams the breath down (on the strike)
      const next = a.si * a.g;
      if (a.si < a.n && a.t >= next) {
        a.si++;
        a.kick = 1;
        d.game.shake?.(0.35);
      }
      const until = a.si < a.n ? a.si * a.g - a.t : 9;
      const lift = a.kick > 0.5 ? 0 : clamp(1 - until / 0.45, 0, 1) * 0.6 + (1 - a.kick) * 0.4;
      plantPose(d, 1);
      aimHead(d, a.c, CL.reach, CL.dy + 0.9 * lift, a.r0);
      pose.jaw = a.kick > 0.3 ? 1 : 0.4 + 0.3 * lift;
      pose.jawRate = 22;
      pose.swell = 0.8 + 0.2 * a.kick;
      d.throat = 1;
    } else {
      plantPose(d, 1 - k);
      settlePose(d, k);
    }
  },
  hit(d, a, dt) {
    if (a.phase !== 'cast' || a.kick < 0.35) return;
    const m = d.rig.pt.mouth;
    BFX.breathBeam(d.fx, m, a.px + Math.sin(a.c) * a.r0, a.pz + Math.cos(a.c) * a.r0, dt, 1.4 * a.kick);
  },
  end(d, a, interrupted) {
    d.throat = 0;
    d.bullets.stopScour();
    if (a.breathing) {
      a.breathing = false;
      d.emit('dragon:breathEnd');
    }
    flush(d, a, interrupted);
  },
};

export const BULLET_HELL = { emberStorm, fanVolley, cinderSpit, emberRain, fireWheel, fireLanes };
