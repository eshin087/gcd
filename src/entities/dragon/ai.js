import * as THREE from 'three';
import { TUNING, SCALE } from './tuning.js';
import { ATTACKS, MELEE, PHASE2_ROAR, PHASE3_ROAR, roarFx, roarPose, perPhase } from './attacks.js';
import { FIRE_ATTACKS } from './tuningFire.js';
import { BULLET_ATTACKS } from './tuningBullets.js';
import { TERRAIN_ATTACKS } from './tuningTerrain.js';
import { resetPose } from './rig/anim.js';
import { POSTURE, TELL, TELL_STYLE } from '../../combat/rules.js';
import { clamp, damp, angleDiff, lerp, smoothstep } from '../../core/math.js';

// Boss brain: owns the action runner (attacks + scripted sequences, tell beats) and the combat
// decision loop. Acts only while game.state === 'boss' and the AI is enabled; otherwise idles /
// faces the player / taunts their corpse. Lab triggers (debug.trigger) bypass the decision loop.

const S = SCALE;
const REST = TUNING.rest; // resting body language (wings HALF, jaw open)
const rand = (a, b) => a + Math.random() * (b - a);
const ATTACK_NAMES = new Set(Object.keys(ATTACKS));
const NO_BEATS = [];
const PL = TUNING.plunged;

// ------------------------------------------------------------------ death performance
// A timed collapse (s since the killing blow) instead of one smoothed blend, so the parts land one
// after another: a throe (reared, head flung back, jaw wide, wings flared), the front buckles, the
// body falls ACCELERATING onto its right side (pose.dead = u², the roll and the drop ride on it),
// the chest hits the ground (thud, rebound), the wings crumple (the upper one draped half-open,
// the lower one folded under), the head slaps down last, one last heave of the chest. The feet stay
// where they stand (the rig locks them while dying), so no leg swings through the body.
const DEATH = {
  collapse: 2.5, // the 'collapse' phase (then 'dissolve')
  fall0: 0.3, // the legs give way
  fall1: 1.1, // the chest hits the ground (the thud)
  head0: 0.34, // the head starts to fall from the throe
  head1: 1.22, // the head hits the ground
  breath: [1.75, 2.9], // the last heave of the chest
};
function deathPose(d, a, T) {
  const pose = d.pose;
  const u = clamp((T - DEATH.fall0) / (DEATH.fall1 - DEATH.fall0), 0, 1);
  pose.dead = u * u;
  pose.stateRate = 40; // s.dead follows the curve (the fall accelerates into its impact)
  const throe = smoothstep(0, 0.12, T) * (1 - smoothstep(0.26, 0.52, T));
  const front = smoothstep(0.22, 0.68, T) * (1 - smoothstep(0.95, 1.55, T));
  const tb = T - DEATH.fall1;
  const bounce = tb > 0 && tb < 0.3 ? Math.sin((Math.PI * tb) / 0.3) : 0;
  pose.lower = -0.2 * throe + 0.38 * front - 0.14 * bounce;
  pose.pitch = -0.12 * throe + 0.3 * front + 0.04 * u;
  pose.roll = 0.06 * bounce - 0.3 * u; // (the rig rolls a dead body 0.75 rad: it settles leaning 0.45 onto its right side)
  pose.bodyRate = 16;
  pose.elbowsOut = Math.max(front, u);
  pose.restep = 0;
  pose.swell = T > DEATH.breath[0] && T < DEATH.breath[1] ? 0.85 * Math.sin((Math.PI * (T - DEATH.breath[0])) / (DEATH.breath[1] - DEATH.breath[0])) : 0;
  // head: flung up and back in the throe, then it falls (accelerating) to the ground ahead and to the
  // right of the chest, a small bounce on landing; the neck follows it down
  if (!a.head0Set) {
    a.head0Set = true;
    d.rootPt(a.head0, 0, 6.1, 2.1);
    d.rootPt(a.head1, -2.4, 0.72, 4.3);
  }
  const v = clamp((T - DEATH.head0) / (DEATH.head1 - DEATH.head0), 0, 1);
  const th = T - DEATH.head1;
  const hb = th > 0 && th < 0.24 ? Math.sin((Math.PI * th) / 0.24) : 0;
  pose.head = pose.headTarget.lerpVectors(a.head0, a.head1, Math.pow(v, 1.3));
  pose.head.y += 0.32 * S * hb;
  pose.headRate = T < DEATH.head0 ? 6.5 : 24;
  pose.lookDown = 1.0;
  d.rootPt(pose.look, -5.5, 0, 9.5); // (far ahead: a target the falling head passes over flipped its aim)
  pose.jaw = T < 0.5 ? 1 : lerp(0.8, 0.42, smoothstep(0.5, 1.8, T));
  pose.jawRate = 14;
  pose.eyes = T < 0.35 ? 1 : Math.max(0, 1 - (T - 0.35) / 1.3);
  // wings: a flare in the throe, then they crumple onto the ground (pose.drape, world space): the
  // lower (right) one splayed out flat beside the body, the upper one half-draped over the flank
  if (T < 0.24) {
    pose.spread[0] = pose.spread[1] = 0.8;
    pose.spreadRate = 9;
  } else {
    pose.spread[0] = 0.35;
    pose.spread[1] = 0.25;
    pose.spreadRate = 2.6;
    pose.drape[0] = 0.72;
    pose.drape[1] = 1;
  }
  pose.tailWave = 0;
}

// ------------------------------------------------------------------ scripted sequences
export const SEQ = {
  intro: {
    name: 'intro',
    phases: () => [['wake', 1.0], ['rise', 1.3], ['roar', 1.3], ['settle', 0.4]],
    start(d, a) {
      d.state = 'waking';
      a.snorted = false;
      d.emit('dragon:wake');
    },
    enter(d, a, phase) {
      if (phase === 'roar') roarFx(d, 1);
    },
    update(d, a, dt) {
      const pose = d.pose, s = d.sense;
      pose.eyes = 1;
      if (a.phase === 'wake') {
        pose.sleep = 0.7;
        pose.stateRate = 1.5;
        if (!a.snorted && a.t > 0.25) {
          a.snorted = true;
          d.fx.snort(d.rig.pt.nostrils, d.rig.pt.headFwd, 1.4);
        }
      } else if (a.phase === 'rise') {
        pose.sleep = 0;
        pose.stateRate = 2.4;
        d.turnToward(s.yawTo, 1.3, dt);
        pose.speed = 1.5;
        pose.spread[0] = pose.spread[1] = 0.5 * a.k; // wings rise to the mantled HALF pose
        pose.spreadRate = 2.5;
        pose.jaw = 0.35;
      } else if (a.phase === 'roar') {
        d.turnToward(s.yawTo, 0.8, dt);
        roarPose(d, a, 1);
      } else {
        pose.spread[0] = pose.spread[1] = 0.5;
        pose.spreadRate = 3;
        pose.jaw = 0.35;
      }
    },
    end(d, a, interrupted) {
      if (!interrupted && d.state === 'waking') d.brain.beginCombat();
    },
  },

  /** Ordinary short stagger (Lab button, charging head-first into a stone). */
  stagger: {
    name: 'stagger',
    phases: () => [['stagger', TUNING.stagger.time]],
    start(d) {
      d.state = 'staggered';
      d.throat = 0;
      d.emit('dragon:stagger');
      d.game.shake?.(0.25);
    },
    update(d, a) {
      // the front collapses onto buckling forelegs (chest down, hips up, hind legs braced wide), neck
      // limp and low, wings drooping half-open to the ground
      const pose = d.pose;
      const rec = a.k > 0.78;
      pose.stagger = rec ? 0 : 1;
      pose.lower = rec ? 0.2 : 0.35;
      pose.pitch = rec ? 0.05 : 0.24;
      pose.bodyRate = 4;
      pose.elbowsOut = rec ? 0.2 : 0.85;
      pose.stanceH = 0.2;
      pose.restep = 1;
      pose.jaw = rec ? 0.1 : 0.35;
      pose.eyes = 0.45;
      pose.spread[0] = pose.spread[1] = rec ? 0.3 : 0.35;
      pose.spreadRate = 2;
      pose.droop = rec ? 0 : 0.75;
      pose.tailWave = 0.02;
      pose.lookDown = 0.8;
      d.rootPt(pose.look, Math.sin(d.time * 1.3) * 1.5, 0, 9);
    },
    end(d) {
      if (d.state === 'staggered' && !d.broken) d.state = 'combat';
    },
  },

  /** Posture break: head slumps to the ground in front, open to crits for POSTURE.breakTime. */
  postureBreak: {
    name: 'postureBreak',
    phases: () => [['break', POSTURE.breakTime]],
    start(d) {
      d.state = 'staggered';
      d.broken = true;
      d.throat = 0;
      d.posture = d.maxPosture;
      d.brain.pendingBreak = false;
      d.emitPosture(true);
      d.emit('dragon:postureBreak');
      d.game.shake?.(0.35);
      d.hitstop(0.1, 0.05);
      const h = d.rig.pt.head;
      d.fx.breakBurst(h.x, h.y, h.z);
    },
    update(d, a, dt) {
      const pose = d.pose;
      const rec = a.k > 0.86; // last ~0.45 s: pull the head back up
      // the meter drains over the break: a visible timer for the punish window
      d.posture = d.maxPosture * (1 - a.k);
      d.emitPosture();
      // the front collapses: chest dropped onto buckled forelegs (elbows out) while the hips stay up
      // on braced hind legs; the neck goes limp, the head on the ground in front within sword reach;
      // the wings droop half-open with their tips on the ground; the tail lies limp
      pose.stagger = rec ? 0.3 : 1;
      pose.lower = rec ? 0.25 : 0.42;
      pose.pitch = rec ? 0.08 : 0.32;
      pose.bodyRate = rec ? 3 : 5;
      pose.elbowsOut = rec ? 0.3 : 1;
      pose.stanceH = 0.25;
      pose.restep = 1;
      if (!rec) {
        pose.head = d.rootPt(pose.headTarget, 0, 0.75, 4.8);
        pose.headRate = a.t < 0.4 ? 5 : 2.5;
        pose.headOffset.y += Math.sin(d.time * 2.1) * 0.05 * S;
      } else pose.headRate = 3;
      d.rootPt(pose.look, Math.sin(d.time * 0.9) * 1.2, 0, 9);
      pose.lookRate = 2;
      pose.lookDown = 1.0; // head slumped to the ground
      pose.jaw = rec ? 0.15 : 0.45;
      pose.eyes = rec ? 0.7 : 0.3;
      pose.spread[0] = pose.spread[1] = rec ? 0.3 : 0.35;
      pose.spreadRate = 2;
      pose.droop = rec ? 0 : 1;
      pose.tailWave = 0;
      if (!rec) d.fx.stunStars(dt, d.rig.pt.head);
    },
    end(d) {
      d.broken = false;
      d.posture = 0;
      d.postureTimer = 0;
      d.emitPosture(true);
      if (d.state === 'staggered') d.state = 'combat';
    },
  },

  /** Parried: the attack is cancelled, the head snaps back (punish window). */
  recoil: {
    name: 'recoil',
    phases: () => [['recoil', TUNING.recoilTime]],
    start(d, a) {
      d.throat = 0;
      // where the parry caught the head, and where the blow throws it (up and back over the withers)
      a.h0 = new THREE.Vector3().copy(d.rig.pt.head);
      a.h1 = new THREE.Vector3();
      // a foot caught mid-step by the parry plants where it is: its home (led far ahead by the lunge)
      // swings back with the recoil's slide, and the swing used to land there, metres back, in one frame
      const G = d.rig.gait;
      for (let i = 0; i < 4; i++) if (G.limbs[i].stepping) G.plantAt(i, G.limbs[i].pos);
    },
    update(d, a, dt) {
      // head and shoulders snap back, the forefeet hop back once (the body slides back a little)
      const pose = d.pose, f = d.fwd;
      const e = 1 - a.k * a.k; // snap back, ease out
      // the head is thrown back along a smooth arc (out of the caught position, up and back in
      // ~0.2 s, a dazed shake), then released to the stance. It used to chase an offset from the
      // rest shape while that shape blended in: the neck chain flipped between solutions, the head
      // jumping 2.7 m and the neck tip turning 137° in one frame
      if (a.k < 0.72) {
        d.rootPt(a.h1, 0, 5.4, 1.9);
        const u = 1 - Math.pow(1 - Math.min(1, a.k / 0.36), 3); // ease-out
        pose.head = pose.headTarget.lerpVectors(a.h0, a.h1, u);
        const daze = a.k > 0.3 ? Math.sin((a.k - 0.3) * 30) * (1 - (a.k - 0.3) / 0.42) * 0.22 * S : 0;
        pose.head.x += d.fwd.z * daze;
        pose.head.z -= d.fwd.x * daze;
        pose.headRate = 20;
      } else pose.headRate = 4;
      pose.jaw = 0.55 * e + 0.1;
      pose.jawRate = 20;
      pose.pitch = -0.14 * e;
      pose.lower = -0.1 * e;
      pose.bodyRate = 8;
      pose.rear = a.k < 0.45 ? 0.55 * Math.sin((Math.PI * a.k) / 0.45) : 0;
      if (a.k < 0.35) d.moveForward(-1.4 * S * (1 - a.k / 0.35), dt);
      pose.eyes = 0.8;
      pose.spread[0] = pose.spread[1] = REST.spread + 0.15 * e;
      if (a.k > 0.6) d.turnToward(d.sense.yawTo, d.turnRate * 0.4, dt);
    },
  },

  phase2: PHASE2_ROAR,
  phase3: PHASE3_ROAR,

  /**
   * Plunged (contract 2): the hero's head-stab slams the head down to the ground, it thrashes, then it
   * rises. Airborne it first falls (`fall`) and crash-lands (dust ring, shake), then the same. An
   * execution on a broken wyrm (`heavy`) is heavier and longer. The head stays on its joints (the
   * hero rides Dragon.plungePoint) the whole time. Options come from Brain.plunged().
   */
  plunged: {
    name: 'plunged',
    phases: (d) => {
      const o = d.brain.plungeOpts ?? {};
      const X = o.heavy ? PL.exec : PL;
      const list = [];
      // the fall takes longer from higher up (~0.6 s from 8 m)
      if (o.air) list.push(['fall', PL.fall * clamp(Math.sqrt(Math.max(0.5, o.alt ?? 0) / 8), 0.6, 1.3)]);
      list.push(['slam', X.slam], ['thrash', X.thrash], ['rise', X.rise]);
      return list;
    },
    start(d, a) {
      const o = d.brain.plungeOpts ?? {};
      a.air = !!o.air;
      a.alt0 = Math.max(0, o.alt ?? 0);
      a.heavy = !!o.heavy;
      a.slammed = false;
      a.crashed = false;
      a.side = Math.random() < 0.5 ? -1 : 1; // which way the thrash starts
      d.throat = 0;
      if (!a.air) d.state = 'staggered';
      // a foot caught mid-step plants where it is (as the recoil does)
      const G = d.rig.gait;
      for (let i = 0; i < 4; i++) if (G.limbs[i].stepping) G.plantAt(i, G.limbs[i].pos);
    },
    enter(d, a, phase) {
      if (phase !== 'slam' || !a.air || a.crashed) return;
      // the crash landing: the whole body hits the ground
      a.crashed = true;
      const g = d.game, p = d.position;
      d.state = 'staggered';
      d.emit('dragon:land', { x: p.x, z: p.z });
      g.shake?.(PL.crashShake);
      g.world?.gust?.(p.x, p.z, 2.0, 20 * S);
      d.fx.dustRing(p.x, p.z, 2.4 * S, 60, 1.6);
      d.fx.groundShock?.(p.x, p.z, 6, 1);
      d.hitstop(0.07);
    },
    update(d, a, dt) {
      const pose = d.pose, t = d.time;
      pose.eyes = 0.65;
      pose.lookDown = 1.2;
      pose.tailLift = 0;
      if (a.phase === 'fall') {
        // knocked out of the air: the wings flail lopsided, the nose pitches down, the legs reach
        const u = a.k;
        pose.alt = a.alt0 * (1 - u * u);
        pose.airborne = u < 0.7 ? 1 : 0.3;
        pose.airReach = u > 0.45 ? 1 : 0;
        pose.spread[0] = 0.9;
        pose.spread[1] = 0.55;
        pose.spreadRate = 7;
        pose.flap = 0.45;
        pose.flapHz = 3.4;
        pose.pitch = 0.28 + 0.08 * Math.sin(t * 9);
        pose.roll = 0.16 * Math.sin(t * 6.5);
        pose.bodyRate = 7;
        pose.head = d.rootPt(pose.headTarget, 0, 2.4, 4.4);
        pose.headRate = 9;
        pose.jaw = 0.85;
        pose.tailWave = 0.25;
        return;
      }
      const heavy = a.heavy;
      if (a.phase === 'slam') {
        // the head is driven into the ground in front, the forelegs buckle, the wings fling up
        pose.head = d.rootPt(pose.headTarget, 0.25 * a.side, heavy ? 0.5 : 0.6, heavy ? 4.3 : 4.5);
        pose.headRate = heavy ? 18 : 15;
        pose.lower = heavy ? 0.55 : 0.45;
        pose.pitch = heavy ? 0.4 : 0.34;
        pose.bodyRate = 12;
        pose.elbowsOut = 0.9;
        pose.jaw = 0.85;
        pose.jawRate = 20;
        pose.spread[0] = pose.spread[1] = 0.85;
        pose.spreadRate = 10;
        pose.tailWave = 0.2;
        pose.stanceH = 0.3;
        if (!a.slammed && a.k > 0.5) {
          a.slammed = true;
          const h = d.rig.pt.head;
          d.fx.dustRing(h.x, h.z, 1.2 * S, 26, 1.0);
          d.emit('dragon:step', { x: h.x, z: h.z, heavy: true });
          d.game.shake?.(heavy ? 0.45 : 0.3);
        }
      } else if (a.phase === 'thrash') {
        // pinned and furious: the head thrashes side to side on the ground, the jaw snaps, the wings
        // beat erratically, the body rocks; an execution weakens as it goes
        const w = heavy ? 1 - a.k * 0.85 : 1 - a.k * 0.5;
        const sw = Math.sin(a.t * 14.5) * a.side;
        pose.head = d.rootPt(pose.headTarget, sw * 1.35 * w, 0.62 + Math.abs(Math.sin(a.t * 9.2)) * 0.55 * w, 4.4);
        pose.headRate = 11;
        pose.jaw = 0.35 + 0.5 * Math.abs(Math.sin(a.t * 12.5)) * w;
        pose.jawRate = 26;
        pose.lower = heavy ? 0.5 : 0.42;
        pose.pitch = heavy ? 0.36 : 0.32;
        pose.roll = 0.09 * sw * w;
        pose.bodyRate = 8;
        pose.elbowsOut = 0.8;
        pose.spread[0] = pose.spread[1] = 0.7;
        pose.spreadRate = 6;
        pose.flap = 0.32 * w;
        pose.flapHz = 3.6;
        pose.tailWave = 0.32 * w;
        pose.stanceH = 0.3;
        d.fx.stunStars(dt, d.rig.pt.head);
      } else {
        // it tears the head free and rises, shaking it
        const e = smoothstep(0, 1, a.k);
        pose.head = d.rootPt(pose.headTarget, Math.sin(a.t * 11) * 0.4 * (1 - e), lerp(0.7, 4.6, e), lerp(4.4, 3.3, e));
        pose.headRate = 6;
        pose.lookDown = lerp(1.2, 0.6, e);
        pose.jaw = 0.3;
        pose.lower = 0.42 * (1 - e);
        pose.pitch = 0.32 * (1 - e);
        pose.bodyRate = 5;
        pose.elbowsOut = 0.8 * (1 - e);
        pose.spread[0] = pose.spread[1] = lerp(0.7, REST.spread, e);
        pose.spreadRate = 4;
        pose.restep = 1;
        pose.tailLift = e > 0.6 ? 1 : 0;
      }
    },
    end(d) {
      if (d.state === 'airborne' || (d.state === 'staggered' && !d.broken)) d.state = 'combat';
    },
  },

  taunt: {
    name: 'taunt',
    phases: () => [['windup', 0.6], ['roar', 1.3], ['recovery', 0.6]],
    enter(d, a, phase) {
      if (phase === 'roar') roarFx(d, 0.7);
    },
    update(d, a, dt) {
      const pose = d.pose;
      d.turnToward(d.sense.yawTo, d.turnRate * 0.5, dt);
      pose.spread[0] = pose.spread[1] = 0.5;
      if (a.phase === 'windup') {
        pose.head = d.rootPt(pose.headTarget, 0, 6.0, 2.6);
        pose.headRate = 4;
        pose.jaw = 0.25;
      } else if (a.phase === 'roar') roarPose(d, a, 0.6);
      else pose.jaw = 0.35;
    },
  },

  /** Lab trigger prelude: turn quickly toward the player (or away, for the tail) then attack. */
  face: {
    name: 'face',
    phases: () => [['turn', TUNING.forceTurn.maxTime]],
    update(d, a, dt) {
      const want = d.sense.yawTo + (a.away ? Math.PI : 0);
      d.turnToward(want, TUNING.forceTurn.rate, dt);
      d.pose.speed = Math.max(d.pose.speed, 3);
      // turning away = the tail sweep's prelude: its tail is already the measured v0.4 solve
      if (a.away) d.pose.tailLegacy = true;
      if (Math.abs(angleDiff(d.yaw, want)) < 0.12) a.finish = true;
    },
  },

  death: {
    name: 'death',
    phases: () => [['collapse', 2.5], ['dissolve', 2.5]],
    start(d, a) {
      d.state = 'dying';
      d.throat = 0;
      d.glowTarget = 0.85;
      a.thud = false;
      a.headThud = false;
      a.noShadow = false;
      a.head0 = new THREE.Vector3();
      a.head1 = new THREE.Vector3();
      d.emit('dragon:death');
      d.hitstop(0.12, 0.05);
    },
    update(d, a, dt) {
      const pose = d.pose, g = d.game;
      deathPose(d, a, a.phase === 'collapse' ? a.t : DEATH.collapse + a.t);
      if (a.phase === 'collapse') {
        // the chest hits the ground (the end of the fall: DEATH.fall1)
        if (!a.thud && a.t > DEATH.fall1) {
          a.thud = true;
          g.shake?.(0.4);
          const c = d.rig.pt.chest;
          g.world?.gust?.(c.x, c.z, 1.2, 14 * S);
          d.fx.dustRing(c.x, c.z, 2.5 * S, 44, 1.0);
        }
        // a beat later the head slaps down, last
        if (!a.headThud && a.t > DEATH.head1) {
          a.headThud = true;
          g.shake?.(0.15);
          const h = d.rig.pt.head;
          d.fx.dustRing(h.x, h.z, 1.1 * S, 18, 0.6);
        }
        d.fx.bodyEmbers(dt, d._hurtPool, 30 + a.k * 60, false);
      } else {
        d.dissolve = a.k;
        d.fx.bodyEmbers(dt, d._hurtPool, 220 * (1 - a.k * 0.6), true);
        if (!a.noShadow && a.k > 0.4) {
          a.noShadow = true;
          d.setShadowCasting(false);
        }
      }
    },
    end(d, a, interrupted) {
      if (!interrupted) d.finishDeath();
    },
  },
};

// actions a posture break / ordinary stagger may NOT interrupt (a break waits for the plunge reaction)
const NO_BREAK = new Set(['intro', 'phase2', 'phase3', 'death', 'stagger', 'postureBreak', 'taunt', 'plunged']);
/** Actions a plunge (contract 2) may NOT cancel: the damage still lands, the reaction doesn't play. */
export const NO_PLUNGE = new Set(['intro', 'phase2', 'phase3', 'death']);
// a pending phase transition waits for these to end
const NO_TRANSITION = new Set(['intro', 'phase2', 'phase3', 'death', 'plunged']);

/**
 * Selection weight of any ATTACKS entry, generic (the dragon-fire attacks register with the same
 * fields): `phase` = first phase (on the def or TUNING.attacks[name]), `weight` = a number, a
 * per-phase array [P1, P2, P3] or a function of (d, sense) returning either, `air` = usable while
 * airborne (ground attacks never are). 0 = not now.
 */
export function attackWeight(def, name, d, s) {
  const spec = TUNING.attacks[name];
  if ((d.phase ?? 1) < (def.phase ?? spec?.phase ?? 1)) return 0;
  if (d.state === 'airborne' && !def.air) return 0;
  let w = def.weight ?? spec?.weight;
  if (typeof w === 'function') w = w(d, s);
  w = perPhase(w, d.phase);
  return Number.isFinite(w) && w > 0 ? w : 0;
}

// ------------------------------------------------------------------ the director (TUNING.pressure)
const PR = TUNING.pressure ?? {};
const GUARD = PR.guard ?? { sep: 0.3, margin: 0.05, maxHold: 0.5, safeMin: 6, horizon: 1.4, roll: 4.2 };
export const CATEGORIES = Object.freeze(['melee', 'wing', 'tail', 'fire', 'flight', 'spell', 'terrain']);
const _cat = new Map();
// a string hit's kind -> the part of the body it is thrown with (attacks.js KINDS): tail, wing, fire;
// anything else (claws, jaws, a hop, a stomp) is melee
const kindGroup = (k) => (k.startsWith('tail') ? 'tail' : k.startsWith('wing') ? 'wing' : k === 'fireSnap' || k === 'emberRake' ? 'fire' : 'melee');
/**
 * The move category of an attack (melee / wing / tail / fire / flight / spell / terrain), for the
 * director's mix: its tuning's (or definition's) `category`, else TUNING.pressure.category, else where
 * it is tuned (terrain moves; bullet patterns = fire; fire attacks = flight when they fly: an `alt`, a
 * flying combo's `parts`, an air move; else spell) and what its hits are: a string is thrown mostly
 * with what most of its hits use. Its tail, wing or fire hits (a burst hit counts as fire too) make it
 * that category when they are at least two of them or a third of the string (the most of them wins;
 * a tie goes tail, wing, fire), else it is melee: so Pivot lash and Rear guard (two tail blows) are
 * tail, the Wing buffet and the Sky hammer wing, the Cinder rake and the Cataclysm (their raking
 * fire) and the Furnace maw (a snap of fire and a burning slam) fire; the claw strings stay melee.
 */
export function categoryOf(name) {
  let c = _cat.get(name);
  if (c) return c;
  const spec = TUNING.attacks[name] ?? {}, def = ATTACKS[name] ?? {};
  c = spec.category ?? def.category ?? PR.category?.[name];
  if (!c) {
    const hits = Array.isArray(spec.hits) ? spec.hits : [];
    if (name in TERRAIN_ATTACKS) c = 'terrain';
    else if (name in BULLET_ATTACKS) c = 'fire';
    else if (name in FIRE_ATTACKS) c = spec.alt > 0 || Array.isArray(spec.parts) || def.air ? 'flight' : 'spell';
    else if (hits.length) {
      let tail = 0, wing = 0, fire = 0;
      for (const h of hits) {
        const g = kindGroup(String(h?.kind ?? ''));
        if (g === 'tail') tail++;
        else if (g === 'wing') wing++;
        else if (g === 'fire') fire++;
        if (h?.burst && g !== 'fire') fire++;
      }
      const best = Math.max(tail, wing, fire);
      c = best >= 2 || (best > 0 && best * 3 >= hits.length) ? (tail === best ? 'tail' : wing === best ? 'wing' : 'fire') : 'melee';
    } else if (def.air) c = 'flight';
    else c = 'melee';
  }
  if (CATEGORIES.indexOf(c) < 0) c = 'melee';
  _cat.set(name, c);
  return c;
}

/** The answer a tell asks for: 'dodge' (red, black) or 'guard' (blue parry, normal parry / block). */
const answerOf = (tell) => (tell === TELL.RED || tell === TELL.BLACK ? 'dodge' : 'guard');

/** Does the link condition `when` hold for the sensed hero (TUNING.pressure front / behind / near / far)? */
export function linkWhen(when, s) {
  switch (when ?? 'any') {
    case 'any':
      return true;
    case 'front':
      return s.absAng <= (PR.front ?? 0.9);
    case 'side':
      return s.absAng > (PR.front ?? 0.9) && s.absAng <= (PR.behind ?? 1.75);
    case 'behind':
      return s.absAng > (PR.behind ?? 1.75);
    case 'near':
      return s.dist < (PR.near ?? 9);
    case 'mid':
      return s.dist >= (PR.near ?? 9) && s.dist <= (PR.far ?? 18);
    case 'far':
      return s.dist > (PR.far ?? 18);
    default:
      return false;
  }
}

// The answers an attack's blows ask for, as bits: 1 a guard (a blue parry, a normal parry / block), 2 a
// dodge (red, black). From its data: each string hit's tell, its headline tell, the red orbs a bullet
// pattern coughs (BULLETS.orb: orbs / orbWave / barkOrbs), the flights and spells (every part is
// red). And learned from the cues it really sends (_onCue): an attack that turns out to mix answers
// is known as mixing from its first cue on.
const GUARD_BIT = 1, DODGE_BIT = 2;
const _answers = new Map();
const tellBit = (t) => (t === TELL.RED || t === TELL.BLACK ? DODGE_BIT : GUARD_BIT);
const anyPositive = (v) => (Array.isArray(v) ? v.some((x) => x > 0) : v > 0);
function answers(name) {
  let m = _answers.get(name);
  if (m !== undefined) return m;
  const spec = TUNING.attacks[name] ?? {};
  m = 0;
  if (Array.isArray(spec.hits) && spec.hits.length) for (const h of spec.hits) m |= tellBit(h?.tell ?? spec.tell);
  else m |= tellBit(spec.tell ?? ATTACKS[name]?.tell);
  if (name in BULLET_ATTACKS && (anyPositive(spec.orbs) || anyPositive(spec.orbWave) || anyPositive(spec.barkOrbs))) m |= DODGE_BIT;
  const cat = categoryOf(name);
  if (cat === 'flight' || cat === 'spell') m |= DODGE_BIT;
  _answers.set(name, m);
  return m;
}
/** A cue of `name` asked for `tell`: remembered (the attack's answers grow; no allocation once known). */
function learnTell(name, tell) {
  if (!name || !(name in ATTACKS)) return;
  const m = answers(name), b = tellBit(tell);
  if ((m & b) === 0) _answers.set(name, m | b);
}
/** Does any blow of the attack ask for a guard (a blue or normal tell: a parry, a block)? */
const guardTell = (name) => (answers(name) & GUARD_BIT) !== 0;
/** Does any blow of the attack ask for a dodge (red, black; every flight and spell; a pattern's red orbs)? */
const redTell = (name) => (answers(name) & DODGE_BIT) !== 0;

// actions after which the hero keeps the old (longer) opening (TUNING.pressure.openingGap)
const OPENINGS = new Set(['recoil', 'stagger', 'postureBreak', 'plunged']);
// blows whose impact the brain may hold back a little (their timing is their own phases: a held
// windup moves the flash and the impact together)
const HOLDABLE = (name) => MELEE.has(name) || name === 'tail' || name === 'stomp';
const LEDGER = 32;

export class Brain {
  constructor(d) {
    this.d = d;
    this.action = null;
    this.aiEnabled = true; // Lab: off = stays in combat, tracks the player, never attacks by itself
    this._cands = [];
    this._zone = new THREE.Vector3();
    // the director's counters (the pressure meter reads them)
    this.stats = { links: 0, ambient: 0, holds: 0, picks: 0, floors: 0 };
    // upcoming impacts announced by other sources (combat:tell / combat:flash): a ring of records
    this._ledger = Array.from({ length: LEDGER }, () => ({ t: -1, ans: '', attack: '' }));
    this._li = 0;
    this._fake = { pos: null, chest: null, vel: null, dist: 0, ang: 0, absAng: 0, yawTo: 0 };
    this._amb = { x: 0, z: 0 };
    const ev = d.game?.events;
    if (ev?.on) {
      ev.on('combat:tell', (e) => this._onCue(e, false));
      ev.on('combat:flash', (e) => this._onCue(e, true));
      // the hero answered with his own art: his opening is kept (no link, the old pause)
      const answered = () => {
        if (this.action) this.action.answered = true;
      };
      ev.on('player:flurry', answered);
      ev.on('player:flareCounter', answered);
      ev.on('player:counter', answered);
    }
    this.reset();
  }

  /** A cue from anywhere (bullets, hazards, the world, the running move): kept as an upcoming impact. */
  _onCue(e, flash) {
    if (!e || (e.source !== 'dragon' && e.source !== 'world')) return;
    if (e.source === 'dragon') learnTell(e.attack, e.tell);
    const now = this.d.game?.time ?? 0;
    const lead = TUNING.flashLead;
    const L = this._ledger;
    if (flash) {
      // the flash is authoritative: re-time the matching record (or add one)
      let best = null;
      for (const r of L) if (r.attack === e.attack && r.t > now - 0.2 && Math.abs(r.t - now - lead) < 0.6 && (!best || Math.abs(r.t - now - lead) < Math.abs(best.t - now - lead))) best = r;
      if (best) {
        best.t = now + lead;
        best.ans = answerOf(e.tell);
        return;
      }
    } else if (!Number.isFinite(e.impactIn)) return;
    const r = L[this._li];
    this._li = (this._li + 1) % LEDGER;
    r.t = now + (flash ? lead : e.impactIn);
    r.ans = answerOf(e.tell);
    r.attack = e.attack ?? '';
  }

  /**
   * Is an impact of another source due within `sep` s of time `t` (game time) that asks for a
   * different answer than `ans` (any answer when `ans` is null)? Hazard circles are read directly
   * (also those not announced yet), the rest from the cue ledger. `skip` = the running move's name.
   */
  _clash(t, ans, sep, skip) {
    const now = this.d.game?.time ?? 0;
    let hit = null;
    this._clashT = -1e9;
    for (const r of this._ledger) {
      if (r.t < now - 0.1 || r.attack === skip) continue;
      if (Math.abs(r.t - t) < sep && (ans === null || r.ans !== ans)) {
        hit = r.attack || 'cue';
        this._clashT = Math.max(this._clashT, r.t);
      }
    }
    if (ans !== 'dodge') {
      const H = this.d.hazards?.list;
      if (H) {
        const p = this.d.game?.player?.position;
        for (const h of H) {
          if (!h.alive || h.shape !== 0 || h.fired || h.noBlow) continue;
          // (a blast he cannot reach in a roll is no clash)
          if (p && Math.hypot(p.x - h.x, p.z - h.z) > h.r + GUARD.roll + 1.5) continue;
          const ht = now + (h.impact - h.t);
          if (Math.abs(ht - t) < sep) {
            hit = h.attack || 'hazard';
            this._clashT = Math.max(this._clashT, ht);
          }
        }
      }
    }
    return hit;
  }

  /** Upcoming impacts of `name` in the ledger are dropped (its move ended without them). */
  _forget(name) {
    const now = this.d.game?.time ?? 0;
    for (const r of this._ledger) if (r.attack === name && r.t > now - 0.1) r.t = -1;
  }

  reset() {
    this.queued = null;
    if (this.action) this.stopAction(true);
    this.cooldowns = {};
    this.history = [];
    this.idleTimer = 1.0;
    this.pendingPhase = 0; // the phase to transition into once allowed (0 = none)
    this.pendingBreak = false;
    this.plungeOpts = null;
    this.sleepPuff = rand(1.5, 3);
    this.snortTimer = rand(3, 6);
    this.jawTwitch = 0;
    this.tauntTimer = 0;
    this.tauntDone = false;
    this.wakeFallback = -1;
    this.walkSpeed = 0;
    // the director
    this.clock = 0; // s of fight (the brain's own clock: category floors)
    this.chain = 0; // links started in a row
    this.lastCat = '';
    this.catRun = 0;
    this.catSeen = {}; // category -> clock of its last pick
    this.airShare = 0; // ~20 s running share of time airborne
    this.ambientT = 1.5; // s to the next ambient cinders (near the hero)
    this.ambientFarT = 1.5; // (far from him)
    this.strafeSide = 1;
    this.strafeSpeed = 0;
    this.seek = { on: false, cat: '', dist: 0, absAng: 0, t: 0, max: 0, next: 0 };
    this.forceCat = '';
    this._clashT = -1e9;
    for (const r of this._ledger) r.t = -1;
  }

  // ---------------------------------------------------------------- action runner
  startAction(def) {
    if (this.action) this.stopAction(true);
    const d = this.d;
    const list = def.phases(d);
    const a = {
      def, name: def.name, list, i: 0, t: 0, T: 0, k: 0, hitDone: false, prev: null,
      phase: list[0][0], dur: Math.max(0.01, list[0][1]), beats: NO_BEATS, cur: null, finish: false,
    };
    this.action = a;
    def.start?.(d, a);
    if (this.action !== a) return a;
    a.beats = def.beats?.(d, a) ?? NO_BEATS;
    def.enter?.(d, a, a.phase);
    if (this.action !== a) return a;
    if (ATTACK_NAMES.has(def.name)) d.emit('dragon:windup', { name: def.name });
    this._beats(a);
    return a;
  }

  stopAction(interrupted) {
    const a = this.action;
    if (!a) return;
    this.action = null;
    try {
      a.def.end?.(this.d, a, interrupted);
    } catch (err) {
      console.error('[dragon] action end failed', err);
    }
    if (interrupted && a.name === 'face') this.queued = null;
    // a move cut short (parried into a recoil, staggered, broken) or abandoned (a terrain move whose
    // piece went: aborted) never lands the blows it announced: they leave the ledger, or the guard
    // would keep holding other blows (or giving up on them) for an impact that never comes
    if (interrupted || a.aborted) this._forget(a.name);
    const isAttack = ATTACK_NAMES.has(a.name);
    if (isAttack) {
      this.cooldowns[a.name] = a.def.cooldown ?? 0;
      this.history.unshift(a.name);
      if (this.history.length > 3) this.history.length = 3;
    }
    if (!interrupted) {
      const ph = this.d.phase;
      let gap = TUNING.idleGap;
      if (OPENINGS.has(a.name) || a.answered) {
        // the hero's opening stays what it was (a recoil, a break, his flurry / counter)
        gap = PR.openingGap ?? gap;
        this.chain = 0;
      } else if (isAttack) {
        const link = this.queued || a.aborted ? null : this._link(a);
        if (link) {
          this.queued = link;
          this.chain++;
          this.stats.links++;
          this._picked(link.name);
          this.idleTimer = 0;
          return;
        }
        if (this.chain > 0 && this.chain >= perPhase(PR.chainDepth ?? 2, ph)) gap = PR.chainRest ?? gap;
        this.chain = 0;
      }
      const g = perPhase(gap, ph);
      this.idleTimer = rand(g[0], g[1]);
      this.strafeSide = Math.random() < 0.5 ? -1 : 1;
    }
  }

  /**
   * Combo links (TUNING.attacks[name].links, data any attack may carry): the first link whose `when`
   * holds for where the hero is now, whose roll for this phase passes and whose target is usable
   * right now (exists, its phase reached, off cooldown, weight > 0: `band: false` on a link skips the
   * target's distance / angle band) starts with no pause. Only for a move that ended on its own (not
   * parried, staggered, broken or plunged: those end interrupted) and below the chain cap.
   */
  _link(a) {
    const d = this.d, g = d.game;
    const links = TUNING.attacks[a.name]?.links ?? a.def.links;
    if (!Array.isArray(links) || !links.length) return null;
    if (!this.aiEnabled || g?.state !== 'boss' || g.player?.alive === false) return null;
    if (d.state !== 'combat' || d.broken || this.pendingBreak || this.pendingPhase > d.phase) return null;
    if (this.chain >= perPhase(PR.chainDepth ?? 2, d.phase)) return null;
    const s = d.sense;
    const sky = this._emitterLive(), shots = this._bulletsLive();
    for (const L of links) {
      const def = L && ATTACKS[L.to];
      if (!def || !linkWhen(L.when, s)) continue;
      const ch = perPhase(L.chance ?? 1, d.phase);
      if (!(Number.isFinite(ch) && ch > 0 && Math.random() < ch)) continue;
      if ((this.cooldowns[L.to] ?? 0) > 0) continue;
      if ((sky && guardTell(L.to)) || (shots && redTell(L.to))) continue; // (the director's rule: see _choose)
      let w = 0;
      try {
        w = attackWeight(def, L.to, d, L.band === false ? this._inBand(L.to, s) : s);
      } catch (err) {
        console.error('[dragon] link weight failed', L.to, err);
      }
      if (w > 0) return def;
    }
    return null;
  }

  /** The sensed hero moved inside an attack's tuned band (range / maxAng / minAng): a link's `band: false`. */
  _inBand(name, s) {
    const spec = TUNING.attacks[name] ?? {}, f = this._fake;
    f.pos = s.pos;
    f.chest = s.chest;
    f.vel = s.vel;
    f.yawTo = s.yawTo;
    f.dist = s.dist;
    f.ang = s.ang;
    f.absAng = s.absAng;
    const r = spec.range;
    if (Array.isArray(r)) f.dist = clamp(s.dist, r[0] * S + 0.01, r[1] * S - 0.01);
    if (Number.isFinite(spec.minDist)) f.dist = Math.max(f.dist, spec.minDist + 0.01);
    if (Number.isFinite(spec.maxDist)) f.dist = Math.min(f.dist, spec.maxDist - 0.01);
    let lo = 0, hi = Math.PI;
    if (Number.isFinite(spec.minAng)) lo = spec.minAng + 0.01;
    if (Number.isFinite(spec.maxAng)) hi = spec.maxAng - 0.01;
    f.absAng = clamp(s.absAng, lo, Math.max(lo, hi));
    f.ang = (s.ang < 0 ? -1 : 1) * f.absAng;
    return f;
  }

  _tick(dt) {
    const a = this.action, d = this.d;
    if (this._hold(a, dt)) {
      // FAIRNESS: the blow about to be cued waits (its windup held) for a blast / bullet that asks
      // for a different answer: the pose keeps updating (and tracking), the action's clock does not
      a.def.update?.(d, a, dt);
      return;
    }
    a.t += dt;
    a.T += dt;
    if (a.finish) {
      this.stopAction(false);
      return;
    }
    while (a.t >= a.dur) {
      a.t -= a.dur;
      a.i++;
      if (a.i >= a.list.length) {
        this.stopAction(false);
        return;
      }
      a.phase = a.list[a.i][0];
      a.dur = Math.max(0.01, a.list[a.i][1]);
      if (ATTACK_NAMES.has(a.name) && (a.i === 1 || a.phase.startsWith('active'))) d.emit('dragon:attack', { name: a.name });
      a.def.enter?.(d, a, a.phase);
      if (this.action !== a) return;
    }
    a.k = clamp(a.t / a.dur, 0, 1);
    this._beats(a);
    this._warnZone(a, dt);
    this._charge(a, dt);
    a.def.update?.(d, a, dt);
  }

  /**
   * FAIRNESS guard: a melee blow (HOLDABLE) whose flash is due this frame waits while an impact of
   * another source that asks for a different answer is due within guard.sep (+ margin) of its own.
   * At most guard.maxHold s per blow; only in a windup (the flash and the impact move together).
   */
  _hold(a, dt) {
    if (!a.phase.startsWith('windup') || !HOLDABLE(a.name)) return false;
    const b = a.cur;
    if (!b || !b.told || b.flashed) return false;
    const lead = TUNING.flashLead;
    const toFlash = b.at + b.impactIn - lead - a.T;
    if (toFlash > dt + 1e-6) return false;
    if ((b.held ?? 0) >= GUARD.maxHold) return false;
    const now = this.d.game?.time ?? 0;
    const sep = GUARD.sep + GUARD.margin, at = now + lead + Math.max(0, toFlash);
    if (!this._clash(at, answerOf(b.tell), sep, a.name)) return false;
    // (only a wait that clears it: one that would end inside the other blow's window is worse)
    if (this._clashT + sep - at > GUARD.maxHold - (b.held ?? 0)) return false;
    if (!b.held) this.stats.holds++;
    b.held = (b.held ?? 0) + dt;
    return true;
  }

  /**
   * Tell beats: at each hit's windup start announce it (combat:tell) and arm `a.cur` (fresh hit
   * lock + sweep history for that hit); flashLead s before its impact fire the timing flash.
   */
  _beats(a) {
    const B = a.beats;
    if (!B.length) return;
    const d = this.d, lead = TUNING.flashLead, now = a.T + 1e-6;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.told) {
        if (now < b.at) break; // beats are in time order
        b.told = true;
        a.cur = b;
        a.hitDone = false;
        a.prev = null;
        d.announceTell(a, b);
      }
      if (!b.flashed && now >= b.at + b.impactIn - lead) {
        b.flashed = true;
        d.flashTell(a, b);
      }
    }
  }

  /** A black blow CHARGES (ADR-118): darkness is drawn into the striking part through its windup,
   *  thicker toward the cue (the body darkens with it: Dragon._updateWarn). */
  _charge(a, dt) {
    const b = a.cur;
    if (!b || b.tell !== TELL.BLACK || b.flashed) return;
    const d = this.d, lead = TUNING.flashLead;
    const k = smoothstep(0, 1, clamp((a.T - b.at) / Math.max(0.05, b.impactIn - lead), 0, 1));
    const p = d.partPos(b.part, a, b, d._part);
    d.fx.charge(p.x, p.y, p.z, k, dt);
    if (!b.charging) {
      b.charging = true;
      d.emit('combat:charge', { source: 'dragon', attack: b.attack, dur: Math.max(0.05, b.at + b.impactIn - lead - a.T), x: p.x, z: p.z });
    }
  }

  /** Red AoE attacks: the ground heats up over the danger area until impact (ADR-052). Off since
   *  ADR-118 (TELL_STYLE.red.floor): a boss's own blow is cued by the flare alone. */
  _warnZone(a, dt) {
    const b = a.cur, def = a.def;
    if (!TELL_STYLE.red.floor) return;
    if (!b || b.tell !== 'red' || typeof def.zone !== 'function') return;
    const left = b.at + b.impactIn - a.T;
    if (left < 0) return;
    const d = this.d;
    const r = def.zone(d, a, this._zone);
    if (!(r > 0)) return;
    const k = clamp(1 - left / Math.max(0.05, b.impactIn), 0, 1);
    d.fx.warnRing(dt, this._zone.x, this._zone.z, r, 0.3 + 0.7 * k, b.flashed);
  }

  postRig(dt) {
    const a = this.action;
    if (a?.def.hit) a.def.hit(this.d, a, dt);
  }

  /** A posture break / ordinary stagger may start now (not mid-air, not during scripted beats). */
  canStagger() {
    const d = this.d, a = this.action;
    if (d.state !== 'combat' && !(d.state === 'staggered' && !d.broken)) return false;
    if (!a) return true;
    if (NO_BREAK.has(a.name)) return a.name === 'stagger' && !d.broken; // a break upgrades a stagger
    if (a.name === 'leap' && a.phase !== 'recovery') return false;
    if (a.def?.noBreak?.(a)) return false; // a string hit that can't be cut (the pounce's hop)
    return true;
  }

  stagger() {
    this.startAction(SEQ.stagger);
  }

  /** Posture full: break now if possible, otherwise as soon as the wyrm is back on its feet. */
  requestBreak() {
    if (this.canStagger()) this.startAction(SEQ.postureBreak);
    else this.pendingBreak = true;
  }

  /** Parried melee swing (a single attack or a string's last hit): cancel it with a recoil. */
  recoil() {
    this.startAction(SEQ.recoil);
  }

  /**
   * A plunge landed (Dragon.onPlunge, contract 2; the caller already checked NO_PLUNGE): cancel the
   * running action and play the plunged reaction. `opts` = { air, alt, heavy }. An airborne wyrm
   * falls from where it was hit: a flight's end() sees `d.crashing` and must not land it elsewhere.
   */
  plunged(opts) {
    const d = this.d;
    this.queued = null;
    this.plungeOpts = opts;
    const px = d.position.x, pz = d.position.z, yaw = d.yaw;
    if (this.action) {
      d.crashing = !!opts.air;
      try {
        this.stopAction(true);
      } finally {
        d.crashing = false;
      }
    }
    if (opts.air) {
      d.position.x = px;
      d.position.z = pz;
      d.yaw = yaw;
      d.state = 'airborne';
    } else if (d.state === 'airborne') d.state = 'combat';
    return this.startAction(SEQ.plunged);
  }

  beginCombat() {
    const d = this.d;
    d.state = 'combat';
    // open the fight by advancing: ranged attacks unlock after a few seconds
    Object.assign(this.cooldowns, TUNING.openingCooldowns);
    this.idleTimer = Math.max(this.idleTimer, 0.6);
    d.emit('dragon:introDone');
  }

  die() {
    this.queued = null;
    if (this.action) this.stopAction(true);
    this.startAction(SEQ.death);
  }

  /** Lab: force an ability now (ignores cooldowns / selection / AI switch). */
  force(def) {
    const d = this.d;
    this.queued = null;
    if (this.action) this.stopAction(true);
    if (d.state !== 'combat') d.state = 'combat'; // a stagger / break just ended above
    const want = d.sense.yawTo + (def.faceAway ? Math.PI : 0);
    if (Math.abs(angleDiff(d.yaw, want)) < 0.3) {
      this.startAction(def);
      return;
    }
    const f = this.startAction(SEQ.face);
    f.away = !!def.faceAway;
    this.queued = def;
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const d = this.d, pose = d.pose;
    resetPose(pose);
    pose.vel.set(0, 0, 0);
    pose.speed = 0;
    pose.look.copy(d.sense.chest);
    // resting baseline while awake (actions override): jaw open so the lit maw and the fangs show,
    // wings mantled HALF like the painting's tall sails (both phases: at 0.3 the sails were edge-on
    // from the game camera and read as two white lances); phase 2 opens the jaw wider
    if (d.state !== 'sleeping' && d.state !== 'dead') {
      pose.jaw = perPhase(REST.jaw, d.phase);
      pose.spread[0] = pose.spread[1] = REST.spread;
    }
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    this.clock += dt;
    this.airShare += ((d.state === 'airborne' ? 1 : 0) - this.airShare) * Math.min(1, dt / 20);

    // a full posture meter breaks as soon as allowed (e.g. right after landing a leap)
    if (this.pendingBreak && !d.broken && this.canStagger()) this.startAction(SEQ.postureBreak);
    // a phase transition interrupts whatever the boss is doing once it is back on the ground (never a
    // break, a plunge reaction or another transition). Checked before the decision loop so a fresh
    // attack is not announced and cancelled the same frame. With the Lab AI off it waits (the
    // damaging roar would be an attack of its own; debug.phase2 / phase3 force it).
    const next = d.phase + 1;
    if (
      this.pendingPhase >= next && next <= 3 && this.aiEnabled && !d.broken &&
      (d.state === 'combat' || d.state === 'staggered') && !NO_TRANSITION.has(this.action?.name)
    ) {
      this.pendingPhase = 0;
      this.queued = null;
      this.startAction(next >= 3 ? SEQ.phase3 : SEQ.phase2);
    }

    switch (d.state) {
      case 'sleeping':
        this._sleeping(dt);
        break;
      case 'dead':
        pose.dead = 1;
        pose.eyes = 0;
        break;
      default:
        if (this.action) this._tick(dt);
        if (!this.action && this.queued && d.state === 'combat') {
          const q = this.queued;
          this.queued = null;
          this.startAction(q);
        }
        if (!this.action && d.state === 'combat') this._combat(dt);
        this._ambient(dt);
    }
    // a deflected (parried, not last) string hit: the struck part is knocked back (visual only)
    d.applyDeflectKnock?.(dt);

    // hit flinch: head knocked along the blow direction
    if (d.flinch > 0.001 && d.state !== 'sleeping' && d.state !== 'dying' && d.state !== 'dead') {
      const f = Math.min(1, d.flinch);
      pose.headOffset.x += d.flinchDir.x * f * 0.8 * S;
      pose.headOffset.z += d.flinchDir.z * f * 0.8 * S;
      pose.headOffset.y += f * 0.45 * S;
      if (d.flinchHead) pose.jaw = Math.max(pose.jaw, f * 0.5);
    }
  }

  _sleeping(dt) {
    const d = this.d, pose = d.pose, pt = d.rig.pt, g = d.game;
    pose.sleep = 1;
    pose.eyes = 0;
    pose.tailWave = 0.02;
    pose.look.copy(pt.snout).addScaledVector(pt.headFwd, 3 * S);
    this.sleepPuff -= dt;
    if (this.sleepPuff <= 0) {
      this.sleepPuff = rand(3.5, 5.5);
      d.fx.snort(pt.nostrils, pt.headFwd, 0.6);
    }
    if (this.wakeFallback > 0) {
      this.wakeFallback -= dt;
      if (this.wakeFallback <= 0) d.startIntro(); // flow didn't react to the hit: wake anyway
    }
    if (g.state === 'boss') d.startIntro();
  }

  _combat(dt) {
    const d = this.d, g = d.game, s = d.sense, pose = d.pose;
    pose.idle = 1; // no attack running: the rig's idle life (breathing wings, weight shifts) may play
    const playerDown = g.player?.alive === false || g.state === 'dead';
    if (playerDown) {
      // stop, turn to the fallen player, roar once
      this.walkSpeed = 0;
      d.turnToward(s.yawTo, d.turnRate * 0.5, dt);
      this.tauntTimer += dt;
      if (!this.tauntDone && this.tauntTimer > 1.0 && this.aiEnabled) {
        this.tauntDone = true;
        this.startAction(SEQ.taunt);
      }
      this._idleLife(dt);
      return;
    }
    this.tauntDone = false;
    this.tauntTimer = 0;
    if (g.state !== 'boss' || !this.aiEnabled) {
      // waiting (intro camera, pause, Lab AI off...): just watch the player
      this.walkSpeed = damp(this.walkSpeed, 0, 4, dt);
      if (this.walkSpeed > 0.05) d.moveForward(this.walkSpeed, dt);
      d.turnToward(s.yawTo, d.turnRate * (this.aiEnabled ? 0.5 : 0.8), dt);
      pose.speed = Math.max(pose.speed, 1);
      this._idleLife(dt);
      return;
    }

    this.idleTimer -= dt;
    // the director repositions for a category that has been absent too long (a bound back to open
    // the range for a wing, a turn that brings the tail round, a few strides in)
    if (this.seek.on) {
      this._seeking(dt, s);
      if (this.seek.on) {
        this._idleLife(dt);
        return;
      }
    }
    // a predator between its moves: it walks at where the hero is going (cuts him off) when he is
    // farther than `approach`, turns fast (turnSpeed x pressure.turn: rolling behind it is a moment,
    // not a place to stay), and through a longer pause circles him, sidestepping as it turns
    const ph = d.phase;
    const lead = PR.lead ?? 0.6;
    const tx = s.pos.x + s.vel.x * lead, tz = s.pos.z + s.vel.z * lead;
    const cut = Math.atan2(tx - d.position.x, tz - d.position.z);
    const yawGoal = Number.isFinite(cut) && s.dist > 6 ? cut : s.yawTo;
    const far = s.dist > perPhase(PR.approach ?? 16, ph);
    const ws = perPhase(TUNING.walkSpeed, ph);
    const offNose = Math.abs(angleDiff(d.yaw, yawGoal));
    const want = far && offNose < 1.2 ? ws * (s.dist > 14 * S ? 1 : 0.8) : 0;
    this.walkSpeed = damp(this.walkSpeed, want, 3, dt);
    d.turnToward(yawGoal, d.turnRate * perPhase(PR.turn ?? 1, ph), dt);
    if (this.walkSpeed > 0.05) d.moveForward(this.walkSpeed, dt);
    else pose.speed = Math.max(pose.speed, 1);
    // the sidestep: only through a pause long enough to read as one (a chain's breather), near him
    const strafe = !far && this.idleTimer > 0.3 && s.dist < 14 && offNose < 0.6 ? perPhase(PR.strafe ?? 0, ph) : 0;
    this.strafeSpeed = damp(this.strafeSpeed, strafe, 4, dt);
    if (this.strafeSpeed > 0.05 && this.walkSpeed < 0.3) this._sidestep(this.strafeSide * this.strafeSpeed, dt);
    pose.tailWave = 0.08 + this.walkSpeed * 0.02;
    pose.lower = d.phase >= 2 ? 0.03 : 0.15; // combat idle a little lower than standing tall; phases 2-3 stand tall
    if (this.walkSpeed > 0.5) pose.spread[0] = pose.spread[1] = Math.min(pose.spread[0], REST.walkSpread); // tucked while walking
    this._idleLife(dt);

    if (this.idleTimer <= 0) {
      if (this._startSeek(s)) return;
      const def = this._choose(s);
      if (def) {
        this.walkSpeed = 0;
        this.startAction(def);
      } else this.idleTimer = 0.15;
    }
  }

  /** Snorts / jaw twitches between attacks. */
  _idleLife(dt) {
    const d = this.d, pose = d.pose;
    this.snortTimer -= dt;
    if (this.snortTimer <= 0) {
      this.snortTimer = rand(3.5, 7);
      d.fx.snort(d.rig.pt.nostrils, d.rig.pt.headFwd, 0.8);
      this.jawTwitch = 0.35;
    }
    if (this.jawTwitch > 0) {
      this.jawTwitch -= dt;
      pose.jaw = Math.max(pose.jaw, 0.25);
    }
  }

  /** Is any attack of category `cat` usable now (off cooldown, weight > 0)? */
  _catUsable(cat, s) {
    const d = this.d;
    for (const name in ATTACKS) {
      if (categoryOf(name) !== cat || (this.cooldowns[name] ?? 0) > 0) continue;
      let w = 0;
      try {
        w = attackWeight(ATTACKS[name], name, d, s);
      } catch {
        w = 0;
      }
      if (w > 0) return true;
    }
    return false;
  }

  /**
   * A category absent past its floor that nothing can use from here: find the smallest change of
   * place (distance from the hero, his bearing off the nose) from which one of its attacks could be
   * picked, and go there (pressure.seek: at most `max` s, then the pick goes on as it is).
   */
  _startSeek(s) {
    const K = PR.seek, d = this.d, ph = d.phase, sk = this.seek;
    if (!K || this.clock < sk.next) return false;
    const floor = perPhase(PR.floorAfter ?? 1e9, ph);
    const ws = perPhase(TUNING.walkSpeed, ph) * (K.back ?? 1), tr = d.turnRate * perPhase(PR.turn ?? 1, ph);
    const f = this._fake;
    let best = null, cost = perPhase(K.max, ph);
    for (const cat of CATEGORIES) {
      if (this.clock - (this.catSeen[cat] ?? 0) <= floor || this._catUsable(cat, s)) continue;
      for (const name in ATTACKS) {
        if (categoryOf(name) !== cat || (this.cooldowns[name] ?? 0) > 0) continue;
        for (const dd of K.dist) {
          for (const aa of K.ang) {
            const nd = s.dist + dd, na = aa < 0 ? s.absAng : aa;
            if (nd < 3) continue;
            const c = Math.abs(dd) / ws + Math.abs(na - s.absAng) / tr;
            if (c >= cost) continue;
            f.pos = s.pos;
            f.chest = s.chest;
            f.vel = s.vel;
            f.yawTo = s.yawTo;
            f.dist = nd;
            f.absAng = na;
            f.ang = (s.ang < 0 ? -1 : 1) * na;
            let w = 0;
            try {
              w = attackWeight(ATTACKS[name], name, d, f);
            } catch {
              w = 0;
            }
            if (w > 0) {
              cost = c;
              best = cat;
              sk.dist = nd;
              sk.absAng = na;
            }
          }
        }
      }
    }
    sk.next = this.clock + (K.every ?? 4);
    if (!best) return false;
    sk.on = true;
    sk.cat = best;
    sk.t = 0;
    sk.max = cost + 0.4;
    this.stats.seeks = (this.stats.seeks ?? 0) + 1;
    return true;
  }

  /** Moving for the seek: back off / close in along the facing, turn to put the hero at the bearing. */
  _seeking(dt, s) {
    const d = this.d, sk = this.seek, ph = d.phase, pose = d.pose;
    sk.t += dt;
    if (sk.t > sk.max || this._catUsable(sk.cat, s)) {
      // in place: the next pick is of that category (the floor brings it back)
      if (sk.t <= sk.max) this.forceCat = sk.cat;
      sk.on = false;
      this.idleTimer = Math.min(this.idleTimer, 0);
      this.walkSpeed = 0;
      return;
    }
    const side = s.ang < 0 ? -1 : 1;
    d.turnToward(s.yawTo - side * sk.absAng, d.turnRate * perPhase(PR.turn ?? 1, ph), dt);
    const ws = perPhase(TUNING.walkSpeed, ph);
    const dd = sk.dist - s.dist;
    // (it backs off at a bound, nose on the hero; it closes in at a walk)
    const v = Math.abs(dd) < 0.4 ? 0 : dd > 0 ? -ws * (PR.seek.back ?? 1) : ws;
    this.walkSpeed = damp(this.walkSpeed, v, 5, dt);
    if (Math.abs(this.walkSpeed) > 0.05) d.moveForward(this.walkSpeed, dt);
    else pose.speed = Math.max(pose.speed, 1.2);
    if (this.walkSpeed < -0.5) {
      pose.lower = 0.2; // crouched, gathering as it springs back
      pose.spread[0] = pose.spread[1] = 0.7;
    }
  }

  /** Model-left (+1) / right (-1) step of the root at `v` m/s (collides like a walk). */
  _sidestep(v, dt) {
    const d = this.d, c = Math.cos(d.yaw), s = Math.sin(d.yaw);
    const x0 = d.position.x, z0 = d.position.z;
    d.position.x += c * v * dt;
    d.position.z -= s * v * dt;
    d._collide?.();
    if (dt > 0) d.pose.vel.set((d.position.x - x0) / dt, 0, (d.position.z - z0) / dt);
    d.pose.speed = Math.max(d.pose.speed, Math.abs(v));
  }

  /**
   * THE DIRECTOR: a weighted pick over every ATTACKS entry (attackWeight: phase, weight, air;
   * cooldowns), steered by TUNING.pressure: the last two picks damped (`repeat`), no more than
   * `maxRun` of one category in a row, the last category damped (`sameCat`), a category absent for
   * `floorAfter` s boosted (`floorBoost`), gap closers when the hero is far, tail moves when he is
   * behind, flights held back past `maxAir` of the recent time airborne, spells while `maxCast`
   * hazards burn. Melee stays allowed while hazards burn: the fight layers.
   */
  _choose(s) {
    const d = this.d, c = this._cands, ph = d.phase;
    c.length = 0;
    let total = 0;
    const rep = PR.repeat ?? [0.3, 0.65];
    const maxRun = perPhase(PR.maxRun ?? 99, ph), floor = perPhase(PR.floorAfter ?? 1e9, ph);
    const far = s.dist > (PR.farDist ?? 1e9), behind = s.absAng > (PR.behind ?? 1.75);
    const airFull = this.airShare >= perPhase(PR.maxAir ?? 1, ph);
    const castFull = (d.hazards?.alive ?? 0) >= perPhase(PR.maxCast ?? 99, ph);
    const brood = (d.brood?.count?.() ?? 0) > 0;
    // spells and bullet patterns do not layer on each other (a barrage of meteors over a cone of
    // embers asks for a roll and a parry in the same breath): one waits while the other is live
    const layered = this._castLive();
    // blows that would land among cues of the other answer at times nobody knows yet wait: moves
    // that ask for a guard while meteors / a chase come down, moves that ask for a dodge while
    // bullets (embers, orbs) fly
    const sky = this._emitterLive(), shots = this._bulletsLive();
    // a category absent past floorForce x its floor that can be used from here is the pick (the floor
    // boost alone does not bring it back once every category is past its floor: with about fifty
    // attacks, a category of three, the terrain moves, was a few % of a phase-3 pick). The most
    // overdue first; never a flight past maxAir or a spell past maxCast. It stands until one of its
    // attacks is picked (a pick it could not take, its moves waiting on a cue of the other answer,
    // goes to another) or it cannot be used from here any more
    if (this.forceCat && !this._catUsable(this.forceCat, s)) this.forceCat = '';
    if (!this.forceCat) {
      const fk = PR.floorForce;
      let best = '', ba = 0;
      if (fk > 0) {
        for (const cat of CATEGORIES) {
          const absent = this.clock - (this.catSeen[cat] ?? 0);
          if (absent <= floor * fk || absent <= ba || (airFull && cat === 'flight') || (castFull && cat === 'spell')) continue;
          if (this._catUsable(cat, s)) {
            best = cat;
            ba = absent;
          }
        }
      }
      if (best) this.forceCat = best;
    }
    for (const name in ATTACKS) {
      const def = ATTACKS[name];
      if (!def || (this.cooldowns[name] ?? 0) > 0) continue;
      let w;
      try {
        w = attackWeight(def, name, d, s);
      } catch (err) {
        console.error('[dragon] weight failed', name, err);
        w = 0;
      }
      if (!(w > 0)) continue;
      if (this.history[0] === name) w *= rep[0];
      else if (this.history[1] === name) w *= rep[1];
      const cat = categoryOf(name);
      const bias = PR.bias?.[cat];
      if (bias !== undefined) w *= perPhase(bias, ph);
      if (cat === this.lastCat) w *= this.catRun >= maxRun ? (PR.overRun ?? 0.03) : (PR.sameCat ?? 1);
      const absent = this.clock - (this.catSeen[cat] ?? 0);
      const due = absent > floor;
      // (the longer it has been away, the stronger it comes back: up to x3 the boost)
      if (due) w *= (PR.floorBoost ?? 1) * Math.min(3, absent / floor);
      if (far && (TUNING.attacks[name]?.closer || PR.closers?.includes(name))) w *= PR.closerBoost ?? 1;
      if (behind && cat === 'tail') w *= PR.behindBoost ?? 1;
      if (airFull && cat === 'flight') w *= 0.05;
      if (castFull && cat === 'spell') w *= 0.05;
      // while its brood lives it fights lighter beside it: no other spell, flight or heavy blow (ADR-190)
      if (brood && (cat === 'spell' || cat === 'flight' || TUNING.attacks[name]?.heavy)) w *= PR.layer ?? 0.05;
      if (layered && (cat === 'spell' || name in BULLET_ATTACKS)) w *= PR.layer ?? 0.05;
      if ((sky && guardTell(name)) || (shots && redTell(name))) w *= PR.mixed ?? 0;
      if (this.forceCat && cat !== this.forceCat) w *= 0.02;
      c.push(def, w);
      total += w;
    }
    if (total <= 0) return null;
    let r = Math.random() * total, pick = c[c.length - 2];
    for (let i = 0; i < c.length; i += 2) {
      r -= c[i + 1];
      if (r <= 0) {
        pick = c[i];
        break;
      }
    }
    this._picked(pick.name);
    if (categoryOf(pick.name) === this.forceCat) this.forceCat = '';
    return pick;
  }

  _bulletsLive() {
    const B = this.d.bullets;
    return !!B && B.count(0) + B.count(1) + B.count(2) > 0;
  }

  /** A spell's emitter (a meteor barrage, a rain, a chase of pillars) still dropping blasts? */
  _emitterLive() {
    const H = this.d.hazards?.list;
    if (H) {
      for (const h of H) {
        if (!h.alive) continue;
        if (h.shape >= 5) return true;
        // (an ambient cinder still to land near him: red, its time known only to its circle. A move
        // cut short (a terrain move whose piece went) leaves the ones it dropped falling into the next
        // pick: a guard move waits for them. Tuning pass, 2026-11-15: a fire brand aborted, a torrent
        // picked at once, its first ember cued 0.25 s after a cinder's)
        if (h.attack === 'cinders' && !h.fired && !h.noBlow) return true;
      }
    }
    return false;
  }

  /** Is a spell's emitter (meteors, a chase, a rain) or a bullet still live on the field? */
  _castLive() {
    const d = this.d, H = d.hazards?.list;
    if (H) for (const h of H) if (h.alive && h.shape >= 5) return true;
    const B = d.bullets;
    return !!B && B.count(0) + B.count(1) + B.count(2) > 0;
  }

  /** Book a pick for the director (category run, the floors). Links are booked too. */
  _picked(name) {
    const cat = categoryOf(name);
    if (this.clock - (this.catSeen[cat] ?? 0) > perPhase(PR.floorAfter ?? 1e9, this.d.phase)) this.stats.floors++;
    this.catRun = cat === this.lastCat ? this.catRun + 1 : 1;
    this.lastCat = cat;
    this.catSeen[cat] = this.clock;
    this.stats.picks++;
  }

  // ---------------------------------------------------------------- ambient fire (from phase 2)
  /**
   * Cinders shaken from the wings / spat from the jaws, falling near the hero while it fights
   * (TUNING.pressure.ambient): self-announcing small blasts through d.hazards (their ground heats,
   * the red flash, a roll answers). Only while a ground move runs with time left: a cinder lands
   * before that move ends (so nothing that starts after it can land on top), never within guard.sep
   * of a known blow (its own beats, a blast, a bullet), and only where enough ground stays clear.
   * When none may fall near him (a fire pattern runs, bullets fly, a pause), they fall FAR: beyond
   * what he can reach before they land (ambient.far m), so they never cue nor hit: the field burns.
   */
  _ambient(dt) {
    const d = this.d, g = d.game, A = PR.ambient;
    if (!A || !(dt > 0)) return;
    const ph = d.phase;
    const every = perPhase(A.every, ph);
    if (!(every > 0) || !this.aiEnabled || g?.state !== 'boss' || g.player?.alive === false) return;
    this.ambientT -= dt;
    this.ambientFarT -= dt;
    if (this.ambientT > 0 && this.ambientFarT > 0) return;
    const a = this.action;
    // a move with enough of it left (not a transition or a reaction). A cinder is red: it may land
    // among red blasts (the same answer), never where a guard is due. So not during a fire pattern
    // (embers, orbs, the breath's stream: guard cues that come late), not during a string that
    // scatters embers of its own, nothing while bullets fly; the running move's own blows are known
    if ((a && !ATTACK_NAMES.has(a.name)) || (d.state !== 'combat' && d.state !== 'airborne') || d.broken) return;
    if (this._ambientAlive() >= perPhase(A.alive, ph)) return;
    const warn = perPhase(A.warn, ph);
    let left = 0;
    if (a) {
      left = a.dur - a.t;
      for (let i = a.i + 1; i < a.list.length; i++) left += a.list[i][1];
    }
    const near = !!a && left >= warn + GUARD.sep + 0.1 && !((a.name in BULLET_ATTACKS && guardTell(a.name)) || a.name === 'breath' || this._bursts(a.name) || this._bulletsLive());
    if (!near) {
      if (this.ambientFarT <= 0) this._ambientFar(warn, ph);
      return;
    }
    if (this.ambientT > 0) return;
    // retry soon if this frame does not suit; the next window otherwise
    this.ambientT = 0.15;
    const nr = perPhase(A.n, ph);
    const n = Math.max(1, Math.round(rand(nr[0], nr[1])));
    const now = g.time;
    const p = g.player.position, s = d.sense;
    const R = perPhase(A.radius, ph);
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      // each one a little later than the one before (a scatter, not a volley)
      const delay = warn + k * 0.38;
      if (delay > left - GUARD.sep - 0.05) break;
      const t = now + delay;
      if (this._clash(t, null, GUARD.sep + GUARD.margin, null) || this._beatClash(a, delay)) continue;
      // a melee move's blows may still be held later (never earlier): a cinder lands before its next one
      if (HOLDABLE(a.name) && delay > this._nextImpact(a) - GUARD.sep - GUARD.margin) break;
      let ok = false;
      for (let tries = 0; tries < 6 && !ok; tries++) {
        if (Math.random() < perPhase(A.onHero, ph)) {
          this._amb.x = p.x + s.vel.x * A.lead;
          this._amb.z = p.z + s.vel.z * A.lead;
        } else {
          const ang = Math.random() * Math.PI * 2, rr = rand(A.spread[0], A.spread[1]);
          this._amb.x = p.x + Math.cos(ang) * rr;
          this._amb.z = p.z + Math.sin(ang) * rr;
        }
        // inside the clearing, not under the wyrm's own body
        const cx = this._amb.x, cz = this._amb.z;
        if (Math.hypot(cx, cz) > 25 || Math.hypot(cx - d.position.x, cz - d.position.z) < 4.5) continue;
        ok = this._freeSpots(p.x, p.z, cx, cz, R) >= GUARD.safeMin;
      }
      if (!ok) continue;
      // it leaves a wing's wrist or the jaws
      if (this._spawnCinder(this._amb.x, this._amb.z, R, delay)) {
        spawned++;
        this.stats.ambient++;
      }
    }
    if (spawned) this.ambientT = every * rand(0.6, 1.4);
  }

  /** Cinders that fall beyond the hero's reach (ambient.far [min, max] m from him): fire on the field, no cue, no hit. */
  _ambientFar(warn, ph) {
    const d = this.d, A = PR.ambient, p = d.game.player.position;
    const F = A.far;
    this.ambientFarT = 0.15;
    if (!F) return;
    const nr = perPhase(A.n, ph), R = perPhase(A.radius, ph);
    const n = Math.max(1, Math.round(rand(nr[0], nr[1])));
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 4; tries++) {
        const ang = Math.random() * Math.PI * 2, rr = rand(F[0], F[1]) + R;
        const cx = p.x + Math.cos(ang) * rr, cz = p.z + Math.sin(ang) * rr;
        if (Math.hypot(cx, cz) > 25 || Math.hypot(cx - d.position.x, cz - d.position.z) < 4.5) continue;
        if (this._spawnCinder(cx, cz, R, warn + k * 0.38, true)) spawned++;
        break;
      }
    }
    if (spawned) {
      this.stats.ambientFar = (this.stats.ambientFar ?? 0) + spawned;
      this.ambientFarT = perPhase(A.every, ph) * rand(0.8, 1.6);
    }
  }

  /**
   * One cinder (a self-announcing hazard circle) from a wing's wrist or the jaws onto (x, z). `far`: one
   * that falls out of the hero's reach: no cue and no blow even if he runs under it (noBlow; it was
   * dropped while a guard was due: a red cue of it then would ask for the other answer).
   */
  _spawnCinder(x, z, R, delay, far = false) {
    const d = this.d, A = PR.ambient, pt = d.rig?.pt;
    const src = !pt ? null : Math.random() < 0.6 ? pt.wings[Math.random() < 0.5 ? 0 : 1].wrist : pt.mouth;
    return d.hazards?.circle({
      kind: 'shell', attack: 'cinders', drawShell: true, announce: true,
      x, z, r: R, delay, fall: Math.min(A.fall, delay),
      from: src && Number.isFinite(src.x + src.y + src.z) ? src : { x: d.position.x, y: 8, z: d.position.z },
      damage: A.damage, burn: A.burn, knockback: A.knockback, active: 0.12, noBlow: far,
    });
  }

  _bursts(name) {
    const hits = TUNING.attacks[name]?.hits;
    return Array.isArray(hits) && hits.some((h) => h?.burst);
  }

  _ambientAlive() {
    let n = 0;
    const H = this.d.hazards?.list;
    const p = this.d.game?.player?.position, far = PR.ambient?.far?.[0] ?? 8;
    if (H && p) for (const h of H) if (h.alive && h.attack === 'cinders' && !h.fired && Math.hypot(h.x - p.x, h.z - p.z) < far) n++;
    return n;
  }

  /** s from now to the next blow of the running move that has not landed (Infinity: none left). */
  _nextImpact(a) {
    const B = a.beats;
    for (let i = 0; i < B.length; i++) {
      const at = B[i].at + B[i].impactIn - a.T;
      if (at > -0.05) return at;
    }
    return Infinity;
  }

  /** Would a cinder landing `delay` s from now fall within guard.sep of a blow of the running move (or its active)? */
  _beatClash(a, delay) {
    const B = a.beats;
    const sep = GUARD.sep + GUARD.margin;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      const at = b.at + b.impactIn - a.T; // s from now (a held windup holds a.T too)
      if (at < -0.4) continue;
      if (delay > at - sep && delay < at + Math.max(sep, 0.3)) return true;
    }
    return false;
  }

  /**
   * Free spots of 17 (the hero's own and 16 a roll away round him) that no blast due within
   * guard.horizon s covers, with one more blast of radius r at (cx, cz) counted.
   */
  _freeSpots(px, pz, cx, cz, r) {
    const H = this.d.hazards?.list, pr = this.d.game?.player?.radius ?? 0.45, R = GUARD.roll;
    let free = 0;
    for (let k = -1; k < 16; k++) {
      const x = k < 0 ? px : px + Math.cos((k / 16) * Math.PI * 2) * R;
      const z = k < 0 ? pz : pz + Math.sin((k / 16) * Math.PI * 2) * R;
      if (Math.hypot(x, z) > 27) continue; // out of the clearing is no refuge
      if (Math.hypot(x - cx, z - cz) <= r + pr) continue;
      let hit = false;
      if (H) {
        for (const h of H) {
          if (!h.alive || h.shape !== 0 || h.noBlow) continue;
          const left = h.impact - h.t;
          if (left > GUARD.horizon || h.t - h.impact > h.active) continue;
          if (Math.hypot(x - h.x, z - h.z) <= h.r + pr) {
            hit = true;
            break;
          }
        }
      }
      if (!hit) free++;
    }
    return free;
  }
}
