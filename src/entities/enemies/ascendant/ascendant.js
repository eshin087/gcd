import * as THREE from 'three';
import { clamp, lerp, wrapAngle } from '../../../core/math.js';
import { TELL } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { P, to3 } from '../../player/anim.js';
import { TUNE as HERO_TUNE } from '../../player/player.js';
import { Duelist } from '../duelist/duelist.js';
import { DuelBrain } from '../duelist/brain.js';
import { GUARD_KINDS } from '../duelist/guard.js';
import { answerOf, GUARD as GUARD_ANSWER } from '../duelist/director.js';
import * as GEAR from './gear.js';
import * as LOOK from './look.js';
import { AscFx } from './fx.js';
import { formPoses } from './poses.js';
import { MOVES, MOVE_NAMES, CLIP, CLIPS_BY_FORM, TRANSITIONS, COUNTERS, STREAKS, realise } from './moves.js';
import { TUNING } from './tuning.js';
import { LINKS } from './links.js';
import { KiMoves } from './ki.js';
import { TerrainMoves } from './terrain.js';

// Tian Lei, the Last Ascendant: the boss of the Skybreak Ring (`?level=ring`; MOVES.md). A duelist
// (duelist/duelist.js: the body, the contract, the guard, posture, the duel's moments; brain.js: the
// mind) with his own kit: moves (moves.js and moves/*.js), numbers (tuning.js), three stances
// (poses.js), effects (fx.js: AscFx, the effects agent's), gear and look (gear.js, look.js: the body
// agent's). What only he does is here:
//   - THREE FORMS (d.phase 1..3), each with its own health bar: the Challenger, Golden Ascension,
//     Thunder Ascension. A bar emptied or his posture broken leaves him on one knee; the hero's
//     execution is the DEATHBLOW: the form ends and he TRANSFORMS (ascend2 / ascend3); nothing lands on
//     him from the deathblow until the transformation's shock ring goes out. The third kills him.
//   - BARE HANDS: no weapon. His "blade" (the engine's hilt → tip, which the hero's parry, the trade,
//     the lock and the trails read) is the STRIKING LIMB of the moment: the forearm of a punch, the
//     shin of a kick, the thigh of a knee, the upper arm of an elbow; in a guard the blocking forearm.
//     tellPoint(part) is that limb's end.
//   - the blink (a beat's `blink`: behind the hero / where his knock-back ends / the ring's edge), the
//     dash across the gap from form 2, the closing blink in form 3.
//
// ======================================================================= THE ROUTING CONTRACT
// (for the second wave: the ki agent owns ki.js + moves/ki.js, the terrain agent terrain.js +
// moves/terrain.js; neither edits this file)
//   A beat is ROUTED to `d.ki` when it, or its move, is marked `ki: '<kind>'`, and to `d.terrain` when
//   it or its move is marked `terrain: '<kind>'` (the beat's own mark first, then the move's; `terrain`
//   before `ki` at the same level). Then every engine hook of that beat goes there:
//     onActStart(act)          → X.begin(act)            false: the move does not start (nothing changed)
//     weigh(name, def, w, d)   → X.weigh(def, w, dist)   (a move marked at the MOVE level only)
//     onImpact(b, s, act)      → X.onImpact(b, s, act)   the impact's first frame, before the zone test
//     onRelease(b, s, act)     → X.onRelease(b, s, act)  (an unmarked `release` beat goes to d.ki)
//     onCast(b, s, act)        → X.onCast(b, s, act)     (an unmarked `cast` beat goes to d.ki)
//     beatMotion(b, u, s, dt)  → X.motion(b, u, s, dt)   every frame of the beat, after his own blink
//     onSustain(b, s, act, k)  → X.onSustain(...)        a `sustain` beat's ticks (an unmarked one → d.ki)
//     hitPlayer(o) → r         → X.onHit(o, r)           after the hero answered a routed beat's blow
//   and, for both objects whatever the beat: reset() at each of his resets (created lazily there),
//   frame(dt) every frame after the brain, `busy` (something still in the air), lockEnd(won) → true
//   when it handled a lock it started (else the duelist's own onLockEnd runs).
//   His melee beats are not routed: their hooks are handled here (the blink, the craters, the burst).
// =======================================================================

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const POSES = Object.freeze({
  loco: (p, A) => {
    formPoses(A.player?.form ?? 1).duelLoco(p, A);
    // the dash (AscBrain): low and pitched into it, the arms swept back, the head down on the hero
    const k = A.player?.dashK ?? 0;
    if (k > 0.01) {
      p[P.pitch] += 0.42 * k;
      p[P.bodyY] -= 0.2 * k;
      p[P.spX] += 0.12 * k;
      p[P.hdX] -= 0.3 * k;
      to3(p, P.rH, -0.14, -0.3, -0.34, k);
      to3(p, P.lH, 0.14, -0.3, -0.34, k);
      to3(p, P.rP, -0.6, 0.2, -0.8, k);
      to3(p, P.lP, 0.6, 0.2, -0.8, k);
    }
  },
  duel: (p, A) => {
    formPoses(A.player?.form ?? 1).duelClip(p, A);
    // (his feet stay planted while a move carries him: the planner's offsets, Ascendant._planFeet)
    const o = A.player?.feetOff;
    if (o) {
      // (a foot the clip carries across the floor is lifted: a step; its speed from the last frame)
      const t = A.time ?? 0, dt = t - (o.t ?? -1), live = dt > 1e-4 && dt < 0.1;
      o.t = t;
      for (const [ch, f] of [[P.rF, o.r], [P.lF, o.l]]) {
        const x = p[ch], z = p[ch + 2], v = live ? Math.hypot(x - (f.cx ?? x), z - (f.cz ?? z)) / dt : 0;
        f.cx = x;
        f.cz = z;
        if (live) f.lift += (Math.min(FEET.lift, v * 0.06) - f.lift) * Math.min(1, dt * 30);
        if (p[ch + 1] > DIM.ankle + 0.08) continue; // (a foot in a kick: as the clip has it)
        p[ch] += f.x;
        p[ch + 1] += f.y + (f.lift > 0.02 ? f.lift : 0);
        p[ch + 2] += f.z;
      }
    }
  },
});
/** The feet's planner (Ascendant._planFeet): a planted foot is held where it stands while the root
 *  moves under it; past `reach` m off its key it steps (`time` s, lifted `lift` m) back under him. */
const FEET = { reach: 0.24, time: 0.14, lift: 0.11, decay: 14 };
/** The beat a move is in at its time t (its windup or its active frames), or null. */
const beatNow = (a) => (a ? a.beats.find((b) => a.t < b.end + 1e-6) ?? null : null);

/** Everything the shared duelist needs to be him (duelist.js: kit). */
export const ASC_KIT = Object.freeze({
  id: 'ascendant',
  TUNING, MOVES, MOVE_NAMES, CLIP, realise,
  transitions: TRANSITIONS,
  counterMove: (form) => COUNTERS[clamp(form, 1, COUNTERS.length) - 1],
  streakMove: (form) => STREAKS[clamp(form, 1, STREAKS.length) - 1],
  maxPhase: TUNING.forms,
  loadout: GEAR.ASC_LOADOUT ?? {},
  poses: POSES,
  // (the engine's blade before his own limbs take over: the fist on the weapon joint, gear.js FIST)
  blade: Object.freeze({ guard: GEAR.FIST?.guard ?? -0.05, tip: GEAR.FIST?.tip ?? 0.1 }),
  scale: TUNING.scale,
  dress: (d, dt) => LOOK.dressAscendant?.(d, dt),
});

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** His mind: the duelist's, with each form's reaction clips, the dash and the closing blink. */
class AscBrain extends DuelBrain {
  get C() {
    return CLIPS_BY_FORM[clamp(this.d.phase | 0, 1, CLIPS_BY_FORM.length) - 1];
  }
  set C(v) {} // (the base constructor assigns the kit's set: his is per form)

  reset() {
    super.reset();
    this.dashing = null; // { dx, dz, t, max } while he dashes across the gap
    this.dashCool = 0;
    this.blinkCool = 0;
  }

  /** A blow out of a blink reaches wherever the hero is. */
  _reach(b) {
    if (b.def.blink) return Infinity;
    return super._reach(b);
  }

  /** Footwork: the dash across the gap (form `dash.from` on) and the closing blink (form 3) first. */
  _foot(dt) {
    const d = this.d, s = this._sense();
    d.pilot.dashK = Math.max(this.dashing ? 1 : 0, (d.pilot.dashK ?? 0) - dt * 6);
    if (this.dashCool > 0) this.dashCool -= dt;
    if (this.blinkCool > 0) this.blinkCool -= dt;
    if (this.dashing) {
      if (this._dashStep(dt, s)) return;
    } else if (s && this.aiEnabled && !(this.pendingPhase > d.phase) && !this.counter.pending && d.game.player?.state !== 'heal' && this.gapT > 0) {
      const CB = d.T.closeBlink, D = d.T.dash;
      if (CB && d.phase >= CB.form && s.dist > CB.far && this.blinkCool <= 0) {
        this.blinkCool = CB.every;
        if (Math.random() < CB.chance) {
          const a = Math.atan2(d.position.x - s.p.x, d.position.z - s.p.z);
          d.blinkTo(s.p.x + Math.sin(a) * CB.r, s.p.z + Math.cos(a) * CB.r, s.p);
          d.groundVelSet(0, 0);
          return;
        }
      }
      if (D && d.phase >= D.from && s.dist > D.at && this.dashCool <= 0) {
        this.dashCool = D.every;
        this.dashing = { t: 0, max: Math.min(D.max, s.dist - D.stop) / D.speed };
        d.yaw = s.ang;
        d.fx.dashGhost?.(d, d.phase);
        if (this._dashStep(dt, s)) return;
      }
    }
    super._foot(dt);
  }

  /** One frame of the dash: straight at the hero at dash.speed until `stop` m short. False: over. */
  _dashStep(dt, s) {
    const d = this.d, D = d.T.dash, J = this.dashing;
    J.t += dt;
    if (!s || J.t > J.max + 0.05 || s.dist <= D.stop) {
      this.dashing = null;
      return false;
    }
    const x0 = d.position.x, z0 = d.position.z;
    const step = Math.min(D.speed * dt, s.dist - D.stop);
    d.yaw = s.ang;
    d.moveBy((s.dx / (s.dist || 1)) * step, (s.dz / (s.dist || 1)) * step);
    d.groundVelSet((d.position.x - x0) / Math.max(dt, 1e-4), (d.position.z - z0) / Math.max(dt, 1e-4));
    return true;
  }
}

export class Ascendant extends Duelist {
  constructor(game) {
    super(game, ASC_KIT);
  }

  // ---------------------------------------------------------------- build
  /** His colours (look.js: the body agent's). */
  _tint(M) {
    LOOK.tintAscendant?.(M);
  }
  _makeFx() {
    return new AscFx(this);
  }
  _makeBrain() {
    return new AscBrain(this);
  }

  /** His state (before batching and the first reset()). */
  _setup() {
    this._changing = false; // from a deathblow until the transformation's ring goes out: nothing lands on him
    this._part = 'fistR'; // the limb his "blade" is this frame
    this._partPrev = '';
    this._segPart = null; // (parryContact's stepping back: the limb it started on)
    this._ptsOk = false;
    this._hug = 0; // s the hero has stayed on him (Aura Burst is favoured past TUNING... 4 s)
    this._q = new THREE.Vector3();
    this._hand = new THREE.Vector3(); // the right palm as drawn (a disc homes to it: fx.js)
    // the form his body SHOWS (hair, light, aura): a transformation enters the new form at its start
    // (brain.startAct → enterPhase), but he only shows it as the nova goes out (onImpact)
    this.dressPhase = 1;
    this._r = new THREE.Vector3();
    const d = this;
    /** Lab: straight to form n (1..3), the bar full. */
    this.debug.setForm = (n) => {
      n = clamp(Math.round(fin(Number(n), 1)), 1, TUNING.forms);
      if (d.mode === 'dying' || d.mode === 'dead') return false;
      d.brain.startFight();
      d.enterPhase(n);
      d._changing = false;
      d.dressPhase = d.phase;
      d.brain._toFoot(0.3);
      if (n > 1) d.emit(`dragon:phase${n}`);
      return true;
    };
    Object.defineProperty(this.debug, 'form', { get: () => d.phase });
  }

  // ---------------------------------------------------------------- contract
  /** The forms still to beat, this one included (the HUD's pips). */
  get lives() {
    return { total: TUNING.forms, left: this.mode === 'dead' ? 0 : TUNING.forms - this.phase + 1 };
  }

  reset() {
    if (this._q) {
      this._changing = false;
      this._ptsOk = false;
      this._hug = 0;
      this._partPrev = '';
      this.dressPhase = 1;
    }
    super.reset();
    // (the base constructor resets before this class's own fields could exist: made here)
    (this.ki ??= new KiMoves(this)).reset();
    (this.terrain ??= new TerrainMoves(this)).reset();
  }

  takeHit(o = {}) {
    if (this._changing) return 0;
    return super.takeHit(o);
  }

  /** The Sekiro rule: his posture is hard to move while the bar is full, and gives way as it empties. */
  addPosture(amount) {
    if (!(amount > 0)) return;
    const G = TUNING.posture.gainByHp, miss = 1 - clamp(this.hp / this.maxHp, 0, 1);
    super.addPosture(amount * lerp(G[0], G[1], miss));
  }

  _updatePosture(dt) {
    this.postureTimer += dt;
    if (this.broken || this.posture <= 0) return;
    const P = TUNING.posture;
    if (this.postureTimer > P.regenDelay) {
      const k = lerp(P.regenByHp[1], P.regenByHp[0], clamp(this.hp / this.maxHp, 0, 1));
      this.posture = Math.max(0, this.posture - P.regenRate * k * dt);
      this.emitPosture();
    }
  }

  /** The bar is empty: he does not die, he breaks (the deathblow's opening). */
  _onHpZero() {
    this.hp = 0;
    if (!this.broken) this._break();
  }

  /** A break nobody answered: he rises with a little of the bar back and half the meter. */
  endBreak() {
    const S = TUNING.posture.spared;
    this.broken = false;
    this.posture = this.maxPosture * S.posture;
    this.postureTimer = 0;
    if (this.hp <= 0) this.hp = this.maxHp * S.hp;
    this.emitPosture(true);
  }

  /** The deathblow: this form ends. Thrown onto one knee, he rises into the next form's
   *  transformation; the last form's deathblow kills him. */
  onExecute(o = {}) {
    if (!this.broken || this.mode === 'dying' || this.mode === 'dead') return 0;
    const dmg = Math.max(1, Math.round(fin(o.damage, TUNING.execution.damage)));
    this.hp = 0;
    this.flash = 1;
    this.emit('dragon:hurt', { damage: dmg, part: 'body', hp: 0, crit: true });
    this.emit('dragon:plunged', { execution: true, deathblow: true, form: this.phase });
    this.broken = false;
    this.posture = 0;
    this.emitPosture(true);
    this._cinematic('execution');
    const c = this._hs[1], p = this.game.player?.position;
    const dx = p ? this.position.x - p.x : 0, dz = p ? this.position.z - p.z : 1, l = Math.hypot(dx, dz) || 1;
    this.fx.deathblowBurst?.(c.x, c.y, c.z, dx / l, dz / l);
    if (this.phase >= TUNING.forms) {
      this._die();
      return dmg;
    }
    this._changing = true;
    this.brain.startReact('executed');
    this.brain.pendingPhase = this.phase + 1;
    return dmg;
  }

  /** Form n begins (its transformation's start): a full bar, its posture meter, its stance. */
  enterPhase(n) {
    const was = this.phase;
    super.enterPhase(n);
    this.hp = this.maxHp;
    // (through a transformation he still SHOWS the old form until its nova: onImpact)
    this.dressPhase = this.brain?.act?.def?.transition && this.mode === 'act' ? was : this.phase;
  }

  /** A returnable blast of his came back off the hero's perfect parry and struck him (fx.js). */
  onShotReturned(s) {
    this.ki?.shots?.returned?.(s);
  }

  /** His thrown disc is back in his hand (fx.js). */
  onShotBack(s) {
    this.ki?.shots?.discBack?.(s);
  }

  _die() {
    this._changing = false;
    super._die();
  }

  _animate(dt) {
    this.pilot.form = this.phase;
    this._planFeet(dt);
    super._animate(dt);
  }

  /**
   * His feet through a move: the clip keys them in the root's space, so a root that moves (a step-in,
   * a dash, a slide back) would skate them. A foot on the floor is held where it stands in the world
   * (an offset from its key, in model space); once it is FEET.reach m off its key it steps back under
   * him, lifted, one foot at a time. Out of a move (footwork has the animator's own planner), a jump
   * of the root (a blink, a flit) or a foot off the floor: the offsets go.
   */
  _planFeet(dt) {
    const pl = this.pilot, pos = this.position;
    const F = (this._feet ??= { px: pos.x, pz: pos.z, r: { x: 0, y: 0, z: 0, t: -1, x0: 0, z0: 0, lift: 0 }, l: { x: 0, y: 0, z: 0, t: -1, x0: 0, z0: 0, lift: 0 } });
    pl.feetOff = F;
    const dx = pos.x - F.px, dz = pos.z - F.pz;
    F.px = pos.x;
    F.pz = pos.z;
    const jump = dx * dx + dz * dz > 0.6 * 0.6;
    if (this.mode !== 'act' || jump || !(dt > 0) || pos.y > 0.3) {
      const k = jump ? 1 : Math.min(1, dt * FEET.decay);
      for (const f of [F.r, F.l]) {
        f.x -= f.x * k;
        f.z -= f.z * k;
        f.y -= f.y * k;
        f.t = -1;
      }
      return;
    }
    const s = this.drawScale || 1, c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const mx = (dx * c - dz * sn) / s, mz = (dx * sn + dz * c) / s;
    let stepping = false;
    for (const f of [F.r, F.l]) {
      if (f.t >= 0) {
        // stepping: back to its key, lifted on the way
        f.t += dt;
        const k = Math.min(1, f.t / FEET.time), e = k * k * (3 - 2 * k);
        f.x = f.x0 * (1 - e);
        f.z = f.z0 * (1 - e);
        f.y = FEET.lift * Math.sin(Math.PI * k);
        if (k >= 1) f.t = -1;
        else stepping = true;
      } else {
        f.x -= mx;
        f.z -= mz;
        f.y = 0;
      }
    }
    if (!stepping) {
      const r = Math.hypot(F.r.x, F.r.z), l = Math.hypot(F.l.x, F.l.z);
      const f = r >= l ? F.r : F.l;
      if (Math.max(r, l) > FEET.reach) {
        f.t = 0;
        f.x0 = f.x;
        f.z0 = f.z;
      }
    }
  }

  // ---------------------------------------------------------------- his limbs
  /** The limb his "blade" is now: the striking part of the beat under way, the blocking forearm of a
   *  guard (his left; his right for `wardR`), else the right fist. */
  _strikePart() {
    const br = this.brain;
    if (this.mode === 'act') {
      const b = beatNow(br.act);
      if (b && !br.act.def.transition) return b.def.part ?? 'fistR';
    } else if (this.mode === 'react' && GUARD_KINDS.has(br.react?.kind)) return br.react.kind === 'wardR' ? 'fistR' : 'fistL';
    else if (this.mode === 'foot' && br.wardK > 0.5) return 'fistL';
    return 'fistR';
  }

  /** Limb `part` as drawn now: a (its root: the elbow, the knee, the hip, the shoulder) → b (its end:
   *  the fist, the heel, the knee, the elbow), world space. */
  _limbSeg(part, a, b) {
    const r = this.rig, A = r.arms, L = r.legs;
    const at = (j, v) => v.setFromMatrixPosition(j.matrixWorld);
    const hand = (side, v) => v.set(0, -DIM.foreArm - 0.06, 0).applyMatrix4(A[side].fore.matrixWorld);
    switch (part) {
      case 'fistL':
        at(A.L.fore, a);
        hand('L', b);
        break;
      case 'footR':
      case 'footL': {
        const S = L[part === 'footR' ? 'R' : 'L'];
        at(S.shin, a);
        at(S.foot, b);
        break;
      }
      case 'kneeR':
      case 'kneeL': {
        const S = L[part === 'kneeR' ? 'R' : 'L'];
        at(S.thigh, a);
        at(S.shin, b);
        break;
      }
      case 'elbowR':
      case 'elbowL': {
        const S = A[part === 'elbowR' ? 'R' : 'L'];
        at(S.upper, a);
        at(S.fore, b);
        break;
      }
      case 'shoulder':
        at(r.chest, a);
        at(A.L.upper, b);
        break;
      case 'feet':
        a.set(this.position.x, 0.25, this.position.z);
        b.set(this.position.x, 0.6, this.position.z);
        break;
      default: {
        // fistR, palms: the right forearm to the fist (a hand's breadth past the grip: the knuckles)
        at(A.R.fore, a);
        at(r.sword, b);
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz) || 1;
        b.x += (dx / l) * 0.05;
        b.y += (dy / l) * 0.05;
        b.z += (dz / l) * 0.05;
      }
    }
    return b;
  }

  /** Where a beat's glint pops: the end of the limb that strikes (both hands' middle for `palms`). */
  tellPoint(part, out) {
    if (!this._ptsOk) return super.tellPoint(part === 'feet' ? 'feet' : 'tip', out);
    if (part === 'palms') {
      this._limbSeg('fistR', _a, out);
      this._limbSeg('fistL', _a, _b);
      return out.set((out.x + _b.x) * 0.5, (out.y + _b.y) * 0.5, (out.z + _b.z) * 0.5);
    }
    if (part === 'feet') return super.tellPoint('feet', out);
    this._limbSeg(part ?? 'fistR', _a, out);
    if (!Number.isFinite(out.x + out.y + out.z)) out.set(this.position.x, 1.3, this.position.z);
    return out;
  }

  /** Drawn points for FX: the striking limb's root and end (the engine's hilt and tip). */
  _drawnPoints() {
    this._tipPrev.copy(this._tip);
    this._hiltPrev.copy(this._hilt);
    const part = this._strikePart();
    this._part = part;
    this._limbSeg(part, this._hilt, this._tip);
    const ok = Number.isFinite(this._tip.x + this._tip.y + this._tip.z) && Number.isFinite(this._hilt.x + this._hilt.y + this._hilt.z);
    // (a new limb: no trail from the old one's end to this one's)
    if (!ok || !this._tipOk || part !== this._partPrev) {
      this._tipPrev.copy(this._tip);
      this._hiltPrev.copy(this._hilt);
    }
    this._partPrev = part;
    this._limbSeg('fistR', _a, this._hand);
    this._tipOk = ok;
    this._ptsOk = ok;
  }

  /** Posed at clip time t now (parryContact steps the pose back along the strike): the striking limb. */
  _poseAt(t) {
    super._poseAt(t);
    this._limbSeg(this._part, this._hilt, this._tip);
  }

  // ---------------------------------------------------------------- the routing (see the header)
  /** The object a beat's hooks go to (`b` may be null: the move's mark alone), or null. */
  _route(b, a) {
    const D = b?.def, M = a?.def;
    if (D?.terrain) return this.terrain;
    if (D?.ki) return this.ki;
    if (M?.terrain) return this.terrain;
    if (M?.ki) return this.ki;
    return null;
  }

  /** A beam of his is lit (any phase but its last fade): a move whose blows ask a GUARD may not start
   *  (its cue would ask a guard while the hero is answering the beam). */
  _beamBars(def) {
    const B = this.ki?.beams;
    if (!B?.busy || B.phase === 'fade') return false;
    return (def?.beats ?? []).some((b) => (Array.isArray(b.pick) ? b.pick : [b]).some((x) => !x.feint && x.tell != null && answerOf(x.tell) === GUARD_ANSWER));
  }

  weigh(name, def, w, dist) {
    if (this._beamBars(def)) return 0;
    if (def.terrain) return this.terrain.weigh(def, w, dist);
    if (def.ki) return this.ki.weigh(def, w, dist);
    // (Aura Burst: favoured once the hero has stayed on him for a while)
    if (def.beats?.[0]?.burst && this._hug >= 4) w *= 3;
    return w;
  }

  onActStart(A, opts) {
    if (!A.def.transition && this._beamBars(A.def)) return false;
    if (A.def.terrain) return this.terrain.begin(A, opts) !== false;
    if (A.def.ki) return this.ki.begin(A, opts) !== false;
    return true;
  }

  /** Every frame after the brain: what flies or is lit (ki, terrain), how long the hero has hugged him. */
  brainFrame(dt) {
    this.ki.frame(dt);
    this.terrain.frame(dt);
    const p = this.game.player?.position;
    const near = !!p && this.mode !== 'dying' && Math.hypot(p.x - this.position.x, p.z - this.position.z) < 2.6;
    this._hug = near ? this._hug + dt : Math.max(0, this._hug - dt * 2);
  }

  /** A beat's impact, its first frame: the transformation's ring; a heavy blow's crater; routed hooks. */
  onImpact(b, s, a) {
    const D = b.def, fx = this.fx, f = this.phase;
    if (a?.def?.transition) {
      this._changing = false;
      this.dressPhase = f; // (the hair, the light and the aura change now, with the nova)
      fx.transformNova?.(this.position.x, this.position.z, TUNING.transform.ringRadius, f);
      this.terrain?.nova?.(this.position.x, this.position.z, TUNING.transform.ringRadius); // the tiles round him crack
      // Thunder Ascension: four bolts strike the ring's corners as the ring goes out (kiShots.js)
      if (f === 3) this.ki?.shots?.corners?.();
      this.game.shake?.(0.45);
      this.game.world?.forest?.ambience?.flare?.(1);
      return;
    }
    const R = this._route(b, a);
    if (R) {
      R.onImpact(b, s, a);
      return;
    }
    if (D.quake) this.terrain?.quake?.(this.position.x, this.position.z, D.quake);
    if (D.burst) fx.auraBurst?.(this.position.x, this.position.z, D.zone?.r ?? 4.5, f);
    else if (D.zone?.kind === 'ring' && (D.knockdown || D.tell === TELL.RED)) {
      const c = this.zoneCentre(D.zone, this._q);
      fx.crater?.(c.x, c.z, D.zone.r * 0.6, D.knockdown ? 1 : 0.6);
      this.terrain?.crater?.(c.x, c.z, D.zone.r * 0.6, D.knockdown ? 1 : 0.6); // rubble round the blow
      this.game.shake?.(0.3);
    }
  }

  onRelease(b, s, a) {
    (this._route(b, a) ?? this.ki).onRelease(b, s, a);
  }

  onCast(b, s, a) {
    (this._route(b, a) ?? this.ki).onCast(b, s, a);
  }

  /** A `sustain` beat's tick (duelist/brain.js). */
  onSustain(b, s, a, k) {
    (this._route(b, a) ?? this.ki).onSustain(b, s, a, k);
  }

  /** A blow at the hero: one out of a blink comes from wherever he appeared (a guard meets it from any
   *  side, as his flurry's); a routed beat's answer goes to its object. */
  hitPlayer(o) {
    const D = o.beat?.def;
    if (D?.blink) o = { ...o, extra: { ...(o.extra ?? null), around: true } };
    // (a bolt off his fist strikes as lightning, as the Lord's: the hero's hurt and the sound read it)
    if (D && (D.bolt || (D.ki ?? this.brain.act?.def?.ki) === 'bolt')) o = { ...o, kind: 'lightning' };
    const r = super.hitPlayer(o);
    if (o.beat) this._route(o.beat, this.brain.act)?.onHit(o, r);
    return r;
  }

  /** The blade lock is decided: a lock one of the move objects started is theirs to end. */
  onLockEnd(won) {
    if (this.ki.lockEnd(won) === true || this.terrain.lockEnd(won) === true) return;
    super.onLockEnd(won);
  }

  /** The centre of a zone (a zone may sit `fwd` m ahead of him and `side` m to his left). */
  zoneCentre(z, out) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), f = fin(z?.fwd), sd = fin(z?.side);
    return out.set(this.position.x + fx * f + fz * sd, 0, this.position.z + fz * f - fx * sd);
  }

  // ---------------------------------------------------------------- the blink
  /** He is gone from where he stands and at (tx, tz), facing `face` (a point): the vanish drawn. */
  blinkTo(tx, tz, face) {
    const x0 = this.position.x, z0 = this.position.z;
    this.position.x = tx;
    this.position.z = tz;
    this.moveBy(0, 0);
    if (face && Number.isFinite(face.x + face.z)) this.yaw = Math.atan2(face.x - this.position.x, face.z - this.position.z);
    this.object3d.rotation.y = this.yaw;
    this.anim.teleported?.();
    this.fx.vanish?.(this, x0, z0, this.position.x, this.position.z, this.phase);
  }

  /** Where the hero's knock-back will end (his slide decays exponentially: player.js _setKb). */
  _slideEnd(out) {
    const pl = this.game.player, p = pl?.position, k = HERO_TUNE?.knockbackDecay ?? 6;
    if (!p) return out.copy(this.position);
    return out.set(p.x + fin(pl.kb?.x) / k, 0, p.z + fin(pl.kb?.z) / k);
  }

  /**
   * A beat's own root motion: the blink, at u 0.1 of its windup, once:
   *   { behind: m }    behind the hero (his facing), else beside him where he may stand
   *   { land: true }   beside where the hero's knock-back will end (`side` m, default 1.8)
   *   { edge: true }   at the ring's edge farthest from the hero (`pad` m inside his bound, default 1.2)
   *   { at: rad, r }   at a side of the hero: `at` rad round from his facing (0 before him, PI behind)
   * Then a routed beat's own motion.
   */
  beatMotion(b, u, s, dt) {
    const K = b.def.blink;
    if (K && !b._blinked && u >= 0.1 && s) {
      b._blinked = true;
      const pl = this.game.player;
      let tx, tz;
      if (K.edge) {
        const B = this.bound - fin(K.pad, 1.2), l = Math.hypot(s.p.x, s.p.z);
        const ux = l > 0.5 ? -s.p.x / l : -Math.sin(fin(pl?.yaw)), uz = l > 0.5 ? -s.p.z / l : -Math.cos(fin(pl?.yaw));
        tx = ux * B;
        tz = uz * B;
      } else if (K.land) {
        const e = this._slideEnd(this._r), r = fin(K.side, 1.8);
        // (on the side of the landing he came from: he is waiting there when the hero arrives)
        const a = Math.atan2(this.position.x - e.x, this.position.z - e.z);
        tx = e.x + Math.sin(a) * r;
        tz = e.z + Math.cos(a) * r;
        if (!this.standable(tx, tz)) {
          tx = e.x - Math.sin(a) * r;
          tz = e.z - Math.cos(a) * r;
        }
      } else if (Number.isFinite(K.at)) {
        // at a side of the hero: `at` rad round from where he faces (0 before him, PI behind), `r` m off
        const yaw = fin(pl?.yaw, wrapAngle(s.ang + Math.PI)) + K.at, r = fin(K.r, 2.2);
        tx = s.p.x + Math.sin(yaw) * r;
        tz = s.p.z + Math.cos(yaw) * r;
        if (!this.standable(tx, tz)) {
          tx = s.p.x - Math.sin(yaw) * r;
          tz = s.p.z - Math.cos(yaw) * r;
        }
      } else {
        const yaw = fin(pl?.yaw, wrapAngle(s.ang + Math.PI)), r = fin(K.behind, 2);
        tx = s.p.x - Math.sin(yaw) * r;
        tz = s.p.z - Math.cos(yaw) * r;
        if (!this.standable(tx, tz)) {
          // no room behind him: to one side, else the other
          tx = s.p.x + Math.cos(yaw) * r;
          tz = s.p.z - Math.sin(yaw) * r;
          if (!this.standable(tx, tz)) {
            tx = s.p.x - Math.cos(yaw) * r;
            tz = s.p.z + Math.sin(yaw) * r;
          }
        }
      }
      this.blinkTo(tx, tz, K.edge ? s.p : this._slideOrHero(K, s));
    }
    this._route(b, this.brain.act)?.motion(b, u, s, dt);
  }

  _slideOrHero(K, s) {
    return K.land ? this._slideEnd(this._r) : s.p;
  }

  // ---------------------------------------------------------------- after the pose
  /** The aura of his form; the trail off the striking limb through a blow; the transformation's
   *  gathering; the stars of a break. */
  afterPose(dt, a) {
    const fx = this.fx, f = this.phase;
    if (this.mode !== 'dead' && this.mode !== 'sleep') fx.formAura?.(this, dt, this.dressPhase ?? f);
    if (a && this._tipOk) {
      const cur = a.beats.find((b) => a.t < b.impact);
      if (a.def.transition) {
        if (cur) fx.transformGather?.(this.position.x, this.position.z, clamp((a.t - cur.start) / Math.max(0.05, cur.impact - cur.start), 0, 1), dt, f);
      } else if (!this.shuddering) {
        for (const b of a.beats) {
          if (b.feint || a.t < b.impact - 0.32 * b.W - 0.02 || a.t > b.impact + 1.6 * b.A + 0.05) continue;
          if (!b.def.burst && !this._route(b, a)) {
            const D = b.def, heavy = D.tell === TELL.RED || D.tell === TELL.BLACK || !!D.knockdown;
            fx.limbTrail?.(this._tipPrev.x, this._tipPrev.y, this._tipPrev.z, this._tip.x, this._tip.y, this._tip.z, f, heavy);
          }
          break;
        }
      }
    }
    if (this.mode === 'broken') fx.stunStars(this._hs[0]);
  }

  // ---------------------------------------------------------------- combo links
  get LINKS() {
    return LINKS;
  }
}
