import * as THREE from 'three';
import { clamp, lerp, wrapAngle, turnToward } from '../../../core/math.js';
import { TELL, RESULT } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { Duelist } from '../duelist/duelist.js';
import { DuelBrain } from '../duelist/brain.js';
import { GUARD_KINDS } from '../duelist/guard.js';
import { planFeet, feetPose } from '../duelist/feetPlan.js';
import { ONE_LOADOUT, ONE_FIST } from './gear.js';
import { tintOne, dressOne, oneLettersOn, oneLetterBias } from './look.js';
import { WokenFx } from './fx.js';
import { posesOf } from './poses.js';
import { MOVES, MOVE_NAMES, CLIP, CLIPS_BY_PHASE, CLIPS_GEAR2, TRANSITIONS, COUNTERS, STREAKS, REPLAY, INTRO_BECKON, realise } from './moves.js';
import { TUNING, GEARED } from './tuning.js';
import { LINKS } from './links.js';
import { IronMoves } from './iron.js';
import { FlurryMoves } from './flurry.js';
import { SourceMoves } from './source.js';

// Xin Yi, the One Who Woke: the boss of the Hall of Falling Script (`?level=code`; ADR-156). A duelist on
// the shared engine (duelist/duelist.js: the body, the contract, the guard, posture, the duel's moments;
// brain.js: the mind) with his own kit (moves.js, tuning.js, links.js, poses.js), effects (fx.js: WokenFx)
// and body (gear.js, look.js). Bare-handed as Tian Lei (his limb code is copied from ascendant.js: the
// engine's "blade" is the striking limb of the moment). What only he does is here and in iron.js (phase 2:
// the guns) and source.js (phase 3: the bolts, the stop, the bricks, flight):
//   - TWO BARS, THREE PHASES (lives: { total: 2 }): bar 1 holds phase 1 and phase 2 (the gate at half);
//     bar 1 empty BREAKS him (_onHpZero) and the deathblow is THE FALL: flat on his back, time slowed, the
//     script still, he lies `fall.lie` s (nothing hurts him: `_changing`), then the hall turns to code from
//     his body outward and he RISES (the transition `rising`) with bar 2 full; its ring ends in the Still
//     Hand held `rising.palm` s (a cut is CAUGHT on his raised palm). The deathblow on bar 2 kills him.
//   - THE SCENES (world/scriptHall.js `scenes`): the beckon of the intro rewrites the hall into the
//     Sparring Hall (phase 1), A Hundred Iron Seeds back into the Pillared Hall (phase 2), the rising into
//     the Source (phase 3); his death gives the hall back. Every morph runs inside one of these.
//   - THE LEAN: his guard reaction clips are slips (moves.js CLIPS); one afterimage each (fx.afterimages).
//   - THE BEND (phase 2): a returned shot, or the engine's heavy-blow evade (once in `bend.every` s): time
//     slows, he arches back, the shot / the cut passes over him; posture; open `bend.open` s and the first
//     cut crits; a second in that window lands in full.
//   - DEJA VU: a link marked `dejavu` stutters the hall and replays the string as realised the first time.
//   - THE REWORK (ADR-168, ADR-169): phase 1 in two GEARS (d.gear: one hand, then both once bar 1 is at
//     or under TUNING.gear2.at: the move `secondHand` between two moves, `dragon:gear`); THE FLURRY BURST
//     (flurry.js: a beat's `flurry`, one cue and one result for 6 - 8 drawn blows); BORROWED WALL off the
//     upright that brings him at the hero from the side (_wallPick / _wallRun); the bullets' rule (iron.js
//     slugHit / shotHit: a bullet never locks the hero).

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
// (the pose set: the phase's, or phase 1's gear 2: pilot.pset 4)
const POSES = Object.freeze({
  loco: (p, A) => posesOf(A.player?.pset ?? A.player?.form ?? 1).duelLoco(p, A),
  duel: (p, A) => {
    posesOf(A.player?.pset ?? A.player?.form ?? 1).duelClip(p, A);
    // (his feet stay planted while a move carries him: the planner's offsets, duelist/feetPlan.js; ADR-162, ADR-168)
    feetPose(p, A);
  },
});
/** The beat a move is in at its time t (its windup or its active frames), or null. */
const beatNow = (a) => (a ? a.beats.find((b) => a.t < b.end + 1e-6) ?? null : null);

/** Everything the shared duelist needs to be him (duelist.js: kit). */
export const WOKEN_KIT = Object.freeze({
  id: 'wokenOne',
  TUNING, MOVES, MOVE_NAMES, CLIP, realise,
  transitions: TRANSITIONS,
  counterMove: (ph) => COUNTERS[clamp(ph | 0, 1, COUNTERS.length) - 1],
  streakMove: (ph) => STREAKS[clamp(ph | 0, 1, STREAKS.length) - 1],
  maxPhase: 3,
  loadout: ONE_LOADOUT,
  poses: POSES,
  blade: Object.freeze({ guard: ONE_FIST?.guard ?? -0.06, tip: ONE_FIST?.tip ?? 0.075 }),
  scale: TUNING.scale,
  dress: (d, dt) => dressOne(d, dt),
  // (the Bend and the stop: held where he stands; the Bend leaves him open)
  REACT: Object.freeze({ bend: { travel: -0.3 }, stop: { travel: 0 } }),
  OPEN: Object.freeze(['bend']),
  // his ink-line letters follow his size on screen as the hero's do (ARCHITECTURE "The bosses'
  // letters"; `?oneLetters=0` the fixed cell he shipped with: read live, as Tian Lei's, ADR-155; ADR-170)
  get letters() {
    return oneLettersOn();
  },
  // ... and `?onePrint=b` draws them one cell bolder where the hero's rule rests on its floor cell
  // (a small screen: pipeline.js _updateBossLetters; 0 for every other boss, which has none)
  get letterBias() {
    return oneLetterBias();
  },
});

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** His mind: the duelist's, with each phase's reaction clips, the Bend for the heavy-blow evade (phase 2)
 *  and deja vu's replay. */
class WokenBrain extends DuelBrain {
  get C() {
    if ((this.d.phase | 0) <= 1 && this.d.gear >= 2) return CLIPS_GEAR2;
    return CLIPS_BY_PHASE[clamp(this.d.phase | 0, 1, CLIPS_BY_PHASE.length) - 1];
  }
  set C(v) {} // (the base constructor assigns the kit's set: his is per phase)

  /** A sent volley reaches wherever the hero is; so does a beat out of the hover (the fist, the pass). */
  _reach(b) {
    if (b.def.send || b.def.fist || b.def.pass || b.def.wall) return Infinity; // (Borrowed Wall: he goes to where the hero is)
    return super._reach(b);
  }

  /** The heavy-blow evade: in phase 2 it is THE BEND (at most once in TUNING.bend.every s); in phase 3
   *  he no longer bends (the engine's step aside). */
  _evade(s) {
    const d = this.d;
    if (d.phase !== 2) return super._evade(s);
    const pl = d.game.player;
    if (!pl || this.sideCool > 0 || !s || !(s.dist < 6)) return false;
    const charging = pl.state === 'charge' && fin(pl.chargeK) > 0.55;
    const coming = pl.state === 'heavy' || (pl.state === 'attack' && !!pl.atk?.def?.heavy && !pl.atk.exec);
    if (!charging && !coming) return false;
    this.sideCool = 3;
    if (!coming || s.dist > 3.2) return false; // (he bends under a cut on its way, not a charge)
    return d.bend('cut');
  }

  /** A deja vu link: the hall stutters and the string is realised as its first pass was. */
  _startNext(a, N, s, cut) {
    if (N?.link?.dejavu) {
      REPLAY.name = MOVES[N.to]?.mirrorOf ?? N.to;
      REPLAY.draws = a.draws ?? null;
      this.d._dejavuNext = true;
    }
    const ok = super._startNext(a, N, s, cut);
    REPLAY.name = REPLAY.draws = null;
    this.d._dejavuNext = false;
    return ok;
  }
}

export class WokenOne extends Duelist {
  constructor(game) {
    super(game, WOKEN_KIT);
  }

  // ---------------------------------------------------------------- build
  _tint(M) {
    tintOne(M);
  }
  _makeFx() {
    return new WokenFx(this);
  }
  _makeBrain() {
    return new WokenBrain(this);
  }

  /** His state and the Lab's API (before batching and the first reset). */
  _setup() {
    // ADR-162's kit (Tian Lei's; his use of it: ADR-168): his arms open as the hero's do at the end of a blow, his kicks keep a
    // little bend (TUNING.armSoft / legSoft); his feet: the planner (_animate)
    if (this.anim) {
      this.anim.armSoft = TUNING.armSoft;
      this.anim.legSoft = TUNING.legSoft;
    }
    this._changing = false; // the fall and the rising until its ring: nothing lands on him
    this._part = 'fistR';
    this._partPrev = '';
    this._ptsOk = false;
    this._q = new THREE.Vector3();
    this._hand = new THREE.Vector3();
    this._handL = new THREE.Vector3();
    this.cameraPull = 0; // m the camera eases back (main.js; flight: both stay in frame)
    const d = this;
    const dbg = this.debug;
    /** Lab: straight to phase n (1..3); phase 3 with bar 2 full and the Source. */
    dbg.setPhase = (n) => {
      n = clamp(Math.round(fin(Number(n), 1)), 1, 3);
      if (d.mode === 'dying' || d.mode === 'dead') return false;
      d.brain.startFight();
      d._changing = false;
      d._fall = null;
      d.enterPhase(n);
      if (n === 1) d.hp = d.maxHp;
      if (n === 2) d.hp = Math.min(d.hp, d.maxHp * d.T.phaseAt[1]);
      d._scene(n === 1 ? 'dojo' : n === 2 ? 'hall' : 'source', true);
      d.brain._toFoot(0.3);
      if (n > 1) d.emit(`dragon:phase${n}`);
      return true;
    };
    dbg.setForm = (n) => dbg.setPhase(n); // (the Lab and Training skip to a phase through it)
    /** Lab: phase 1's gear now (1: one hand; 2: both hands, through the opening `secondHand` unless `snap`). */
    dbg.setGear = (g = 2, snap = false) => {
      if (d.mode === 'sleep' || d.mode === 'intro') d.brain.startFight();
      if (d.phase !== 1) dbg.setPhase(1);
      if (g < 2) {
        d._setGear(1);
        return true;
      }
      if (d.gear >= 2) return true;
      if (snap) {
        d._setGear(2);
        return true;
      }
      return d._gearUp(true);
    };
    /** Lab, Training: Borrowed Wall with its blow chosen ('kick' | 'heel'). */
    dbg.wall = (which = 'kick') => {
      if (d.mode === 'sleep' || d.mode === 'intro') d.brain.startFight();
      REPLAY.name = 'wallStep';
      REPLAY.draws = [which === 'heel' ? 0.99 : 0.01];
      const ok = d.brain.trigger('wallStep');
      REPLAY.name = REPLAY.draws = null;
      return ok;
    };
    // (the Lab's phase buttons play the change: Phase 2 is A Hundred Iron Seeds (the engine's forcePhase),
    // Phase 3 is the fall and the rising)
    dbg.phase3 = () => (d.phase >= 3 ? false : dbg.fallAndRise());
    Object.defineProperty(dbg, 'currentPhase', { get: () => d.phase });
    /** Lab: THE BEND now (a returned shot's: 'shot'; a cut's: 'cut'). */
    dbg.bendNow = (why = 'shot') => {
      if (d.mode === 'sleep' || d.mode === 'intro') d.brain.startFight();
      if (d.phase < 2) dbg.setPhase(2);
      d._bendCool = 0;
      return d.bend(why, true);
    };
    /** Lab: THE FALL and the rising now (bar 1 emptied, the deathblow). */
    dbg.fallAndRise = () => {
      if (d.mode === 'sleep' || d.mode === 'intro') d.brain.startFight();
      if (d.phase >= 3) return false;
      if (d.phase < 2) dbg.setPhase(2);
      d.hp = 0;
      d.broken = true;
      return d.onExecute({ damage: 1 }) > 0;
    };
    /** Lab: a scene now, through the morph from where he stands. */
    dbg.scene = (id) => d._scene(id, false);
    /** Lab: the next string of `name` replays (deja vu). */
    dbg.dejavu = (name = 'lesson') => {
      if (d.mode === 'sleep' || d.mode === 'intro') d.brain.startFight();
      const A = d.brain.act;
      REPLAY.name = name;
      REPLAY.draws = A?.name === name ? A.draws : null;
      d._dejavuNext = true;
      const ok = d.brain.trigger(name);
      REPLAY.name = REPLAY.draws = null;
      d._dejavuNext = false;
      return ok;
    };
    /** Lab: n bolts hanging before him (phase 3's stop). */
    dbg.hold = (n = 3) => {
      if (d.phase < 3) dbg.setPhase(3);
      return d.source.holdDebug(n);
    };
    dbg.held = () => d.source?.held?.length ?? 0;
    /** Lab, Training: Leaving the Floor with its second blow chosen ('fist' | 'pass'). */
    dbg.flight = (which = 'fist') => {
      if (d.mode === 'sleep' || d.mode === 'intro') d.brain.startFight();
      if (d.phase < 3) dbg.setPhase(3);
      REPLAY.name = 'leaveFloor';
      REPLAY.draws = [which === 'pass' ? 0.99 : 0.01];
      const ok = d.brain.trigger('leaveFloor');
      REPLAY.name = REPLAY.draws = null;
      return ok;
    };
  }

  // ---------------------------------------------------------------- contract
  /** The bars still to beat, this one included (the HUD's pips): bar 1 = phases 1 - 2, bar 2 = phase 3. */
  get lives() {
    return { total: this.T.bars, left: this.mode === 'dead' ? 0 : this.phase >= 3 ? 1 : 2 };
  }

  get LINKS() {
    return LINKS;
  }

  /** The victory's one line (flow.js): only the fight that taught it. */
  victoryNote() {
    return this._learned ? 'YOU LEARNED THE LONG SECOND' : null;
  }

  /** His guard: down while bent, through the reload, while he hangs in the air or lies, through the
   *  second hand coming out (gear 2's opening). */
  get guarding() {
    if (this._bendT > 0 || this.iron?.reloading || this._fall || this.position.y > 0.6) return false;
    if (this.mode === 'act' && this.brain.act?.name === 'secondHand') return false;
    return super.guarding;
  }

  reset() {
    if (this._q) {
      this._changing = false;
      this._ptsOk = false;
      this._partPrev = '';
      this.cameraPull = 0;
    }
    this.maxHp = this.T.hp;
    this._fall = null; // { t } from the deathblow on bar 1 until the rising starts
    this._palmT = 0; // s the Still Hand is still held after the rising's ring
    this._bendT = 0; // s he is still bent (open)
    this._bendCool = 0; // s until a melee Bend again
    this._bendDodge = 0; // s the cut that bent him still passes over him
    this._critOpen = false; // the first cut on him while bent crits
    this._dejavuNext = false;
    this._introT = 0;
    this._beckoned = false;
    this._learned = false;
    this._slow = 0;
    this._wallSlowT = -1e9; // (the long hang: at most once in TUNING.wall.slowEvery s)
    this.gear = 1;
    GEARED.now = 1;
    super.reset();
    (this.iron ??= new IronMoves(this)).reset();
    (this.source ??= new SourceMoves(this)).reset();
    (this.flurry ??= new FlurryMoves(this)).reset();
  }

  // ---------------------------------------------------------------- the gears (ADR-168)
  /** Set phase 1's gear (and what the brain reads through tuning.js GEARED). */
  _setGear(g) {
    this.gear = g >= 2 ? 2 : 1;
    GEARED.now = this.gear;
  }

  /** Between two moves: in his footwork, or in the recovery of a move (not a transition), no phase pending. */
  _betweenMoves() {
    if (this.brain.pendingPhase || this.broken) return false;
    if (this.mode === 'foot') return true;
    const a = this.brain.act;
    return this.mode === 'act' && !!a && !a.def.transition && a.name !== 'secondHand' && a.t >= a.recoveryStart;
  }

  /** Gear 2 now: the opening `secondHand` (his guard down `gear2.open` s), the second hand comes out. */
  _gearUp(force = false) {
    if (this.gear >= 2 || this.phase !== 1) return false;
    if (!force && !this._betweenMoves()) return false;
    if (!this.brain.startAct('secondHand', 1)) return false;
    this._setGear(2);
    this.emit('dragon:gear', { gear: 2 });
    const line = this.game.flow?._text?.('gear2');
    if (line && this.game.state === 'boss') this.game.hud?.banner?.(line, 'phase');
    return true;
  }

  /** Phase n begins (its transition's start): phase 3 is bar 2, full. */
  enterPhase(n) {
    super.enterPhase(n);
    if (this.phase === 1 && this.hp >= this.maxHp) this._setGear(1);
    if (this.phase >= 3) {
      this.maxHp = this.T.hp2;
      this.hp = this.maxHp;
    } else this.maxHp = this.T.hp;
  }

  takeHit(o = {}) {
    if (this._changing) return 0;
    if (this.mode === 'dying' || this.mode === 'dead') return 0;
    // THE STILL HAND held after the rising: a cut is caught on his palm (no damage, the blade thrown back)
    if (this._palmT > 0 && !o.exact && !this.broken && Number(o.damage) > 0) {
      this._palmCatch(!!o.heavy, o.point);
      return 0;
    }
    // THE BEND: the heavy cut that bent him passes over him; the first cut while he is bent crits
    if (this._bendT > 0 && !o.exact) {
      if (this._bendDodge > 0 && o.heavy) {
        this._bendDodge = 0;
        const p = this.game.player?.position;
        this.fx.bendWake?.(this, p ? this.position.x - p.x : 0, p ? this.position.z - p.z : 1);
        return 0;
      }
      if (this._critOpen) {
        this._critOpen = false;
        o = { ...o, damage: Number(o.damage) * this.T.bend.crit, crit: true };
      }
    }
    return super.takeHit(o);
  }

  /** The Sekiro rule (Tian Lei's): his posture is hard to move while the bar is full. */
  addPosture(amount) {
    if (!(amount > 0)) return;
    const G = this.T.posture.gainByHp, miss = 1 - clamp(this.hp / this.maxHp, 0, 1);
    super.addPosture(amount * lerp(G[0], G[1], miss));
  }

  _updatePosture(dt) {
    this.postureTimer += dt;
    if (this.broken || this.posture <= 0) return;
    const P = this.T.posture;
    if (this.postureTimer > P.regenDelay) {
      const k = lerp(P.regenByHp[1], P.regenByHp[0], clamp(this.hp / this.maxHp, 0, 1));
      this.posture = Math.max(0, this.posture - P.regenRate * k * dt);
      this.emitPosture();
    }
  }

  /** A bar is empty: he does not die, he breaks (the deathblow's opening). */
  _onHpZero() {
    this.hp = 0;
    if (!this.broken) this._break();
  }

  /** A break nobody answered: he rises with a little of the bar back and half the meter. */
  endBreak() {
    const S = this.T.posture.spared;
    this.broken = false;
    this.posture = this.maxPosture * S.posture;
    this.postureTimer = 0;
    if (this.hp <= 0) this.hp = this.maxHp * S.hp;
    this.emitPosture(true);
  }

  /** The deathblow: on bar 2 it kills him; on bar 1 it is THE FALL (then the rising, phase 3). A
   *  deathblow on a break that left bar 1 standing is the engine's execution. */
  onExecute(o = {}) {
    if (!this.broken || this.mode === 'dying' || this.mode === 'dead') return 0;
    if (this.phase >= 3) {
      const dmg = Math.max(1, Math.round(fin(o.damage, this.T.execution.damage)));
      this.hp = 0;
      this.flash = 1;
      this.emit('dragon:hurt', { damage: dmg, part: 'body', hp: 0, crit: true });
      this.emit('dragon:plunged', { execution: true, deathblow: true, form: this.phase });
      this.broken = false;
      this.posture = 0;
      this.emitPosture(true);
      this._cinematic('execution');
      this._die();
      return dmg;
    }
    // (a deathblow on a break that would empty bar 1 is THE FALL too, never his death in phase 1 - 2)
    if (this.hp > fin(o.damage, this.T.execution.damage)) return super.onExecute(o);
    this.hp = 0;
    // THE FALL
    const dmg = Math.max(1, Math.round(fin(o.damage, this.T.execution.damage)));
    this.flash = 1;
    this.emit('dragon:hurt', { damage: dmg, part: 'body', hp: 0, crit: true });
    this.emit('dragon:plunged', { execution: true, deathblow: true, form: this.phase });
    this.broken = false;
    this.posture = 0;
    this.emitPosture(true);
    const F = this.T.fall;
    this._cinematic('fall', { slowmo: F.slowmo, dur: F.slowDur, zoom: -6, weight: 0.5 });
    this._changing = true;
    this._fall = { t: 0 };
    this._palmT = 0;
    this._bendT = 0;
    this.iron?.drop();
    this.source?.drop();
    this.cameraPull = 0;
    this.brain.startReact('executed');
    this.brain.pendingPhase = 3;
    this._world()?.scenes?.hold?.(F.lie + 0.5);
    this.emit('dragon:fall', { x: this.position.x, z: this.position.z, lie: F.lie });
    this.fx.fallStill?.(this);
    return dmg;
  }

  /** He falls: the hero learns the Long Second (ADR-158; game.unlocks, absent in some tests' worlds). */
  _die() {
    const fresh = this.mode !== 'dying' && this.mode !== 'dead';
    if (fresh) this._learned = !!this.game.unlocks?.grant?.('longSecond');
    this._changing = false;
    this._fall = null;
    this._palmT = 0;
    this.cameraPull = 0;
    this.iron?.drop();
    this.source?.drop();
    super._die();
    // the rain stops and the Pillared Hall returns
    this._scene('hall', false);
  }

  // ---------------------------------------------------------------- the world
  /** The set (the scenes, the ambience), or null (a test's mock). */
  _world() {
    return this.game.world?.forest ?? null;
  }

  /** The hall rewrites itself into scene `id` from where he stands (`snap`: at once). */
  _scene(id, snap = false) {
    const S = this._world()?.scenes;
    if (!S) return false;
    try {
      return snap ? S.snap(id) : S.to(id, { x: this.position.x, z: this.position.z });
    } catch (err) {
      console.error('[wokenOne] scene', err);
      return false;
    }
  }

  // ---------------------------------------------------------------- the Bend, the palm
  /**
   * THE BEND (phase 2): `why` 'shot' (a returned shot reached him) or 'cut' (a heavy cut on its way).
   * Time slows for everyone, he arches back under it; it costs him posture; for bend.open s he has no
   * guard and the first cut crits. He cannot bend twice: false (it lands in full) while he is still bent,
   * or for a cut while the melee Bend cools. `force`: the Lab.
   */
  bend(why = 'shot', force = false) {
    const Bd = this.T.bend;
    if (this.mode === 'dying' || this.mode === 'dead' || this.broken || this._changing) return false;
    if (this.phase !== 2 && !force) return false;
    if (this._bendT > 0) return false;
    if (why === 'cut' && this._bendCool > 0 && !force) return false;
    if (!this.brain.startReact('bend')) return false;
    this._bendT = Bd.open;
    this._critOpen = true;
    this._bendDodge = why === 'cut' ? 0.6 : 0;
    if (why === 'cut') this._bendCool = Bd.every;
    this.addPosture(why === 'cut' ? Bd.posture.cut : Bd.posture.shot);
    const p = this.game.player?.position;
    const dx = p ? this.position.x - p.x : 0, dz = p ? this.position.z - p.z : 1;
    this.fx.bendWake?.(this, dx, dz);
    this.game.flow?.cinematic?.({ x: this.position.x, z: this.position.z, zoom: -4, weight: 0.3, slowmo: Bd.slowmo, dur: Bd.dur, kind: 'bend' });
    this.emit('dragon:bend', { why });
    return true;
  }

  /** A returnable shot of his came back off the hero's perfect parry and reached him (fx.js): phase 2,
   *  the Bend (bent already: it lands in full); phase 3 (a bolt the stop missed) it lands in full. */
  onShotReturned(s) {
    if (this.mode === 'dying' || this.mode === 'dead' || this._changing) return;
    if (this.phase === 2 && this.bend('shot')) return;
    const c = this._hs[1];
    this.takeHit({ damage: this.T.bend.returned, exact: true, heavy: true, part: 'body', point: c, posture: 34, flash: 1 });
    this.emit('dragon:returned', { attack: s?.attack ?? 'shot' });
  }

  /** The Still Hand held after the rising caught a cut: the hero's blade thrown back off his palm. */
  _palmCatch(heavy, point) {
    const p = this.game.player;
    const h = this._hand;
    const x = Number.isFinite(h.x) ? h.x : point?.x ?? this.position.x, y = Number.isFinite(h.y) ? h.y : 1.4, z = Number.isFinite(h.z) ? h.z : point?.z ?? this.position.z;
    this.fx.guard(x, y, z, { heavy, deflect: true });
    this.emit('dragon:guard', { heavy, deflect: true, caught: true });
    this.hitstop(this.T.guard.deflectStop ?? 0.1, 0.03);
    this.game.shake?.(0.3);
    this.game.punch?.(2.2);
    try {
      p?.onGuarded?.({ deflect: true, heavy, attacker: this, caught: true });
    } catch (err) {
      console.error('[wokenOne] player.onGuarded failed', err);
    }
  }

  // ---------------------------------------------------------------- the moves' hooks
  weigh(name, def, w, dist) {
    // the gears (phase 1): gear 2's moves wait for it; gear 1's lighter once it is on
    if (def.gear === 2 && (this.phase !== 1 || this.gear < 2)) return 0;
    if (this.phase === 1 && this.gear >= 2 && def.phase === 1 && !def.gear) w *= 0.55;
    if (def.needs === 'held3' && (this.source?.held.length ?? 0) < this.T.stop.max) return 0;
    if (this.source?.held.length >= this.T.stop.max && !def.transition && def.needs !== 'held3') w *= 0.15; // (three hang: he sends them)
    if (def.unwrite || def.beats?.some((b) => b.unwrite)) {
      if (!this.source?.canUnwrite()) return 0;
    }
    return this.iron?.weigh(name, def, w, dist) ?? w;
  }

  onActStart(A, opts) {
    const def = A.def;
    if (def.transition) {
      // the morph runs inside the transition: A Hundred Iron Seeds gives back the Pillared Hall WHOLE
      // (fresh cover for the shots), the rising turns it into the Source
      if (A.name === 'ironSeeds') this._scene('hall', false);
      if (A.name === 'rising') {
        this._fall = null;
        this._scene('source', false);
        this._world()?.scenes?.script?.(1);
      }
      return true;
    }
    if (def.needs === 'held3' && (this.source?.held.length ?? 0) < 1) return false;
    if (def.beats.some((b) => b.unwrite) && !this.source?.canUnwrite()) return false;
    if (this._dejavuNext) {
      // DEJA VU: the hall stutters (a cell sideways and back), the script pulses, the two-note blip
      const D = this.T.dejavu, S = this._world()?.scenes;
      S?.stutter?.(D.stutter);
      S?.script?.(1, D.pulse);
      this.emit('dragon:dejavu', { name: A.name });
    }
    this.iron?.begin(A);
    this.source?.begin(A);
    // Borrowed Wall: the upright he will run up (the nearest by his path), if one is in reach
    if (A.beats.some((b) => b.def.wall)) this._wallPick(A);
    return true;
  }

  /**
   * BORROWED WALL (the rework, ADR-168): among the standing uprights within wall.seek m, the one he reaches
   * by wall.runTo of the windup at wall.speed whose line of flight (from its face toward the hero, out of
   * his bound never) comes at the hero most from the SIDE of the hero's facing. None in reach: the same
   * off the floor, from a spot beside the hero. A.wall = { b (or null: the floor), x, z (where he springs
   * from), ... }; _wallRun drives his root through the whole beat.
   */
  _wallPick(A) {
    A.wall = null;
    const p = this.game.player?.position;
    if (!p) return;
    const WT = this.T.wall, W = this.game.world?.destructibles, me = this.position, R = this.T.radius;
    const bound = (this.bound ?? this.T.bound) - 0.6;
    const hy = fin(this.game.player?.yaw), hx = Math.sin(hy), hz = Math.cos(hy);
    const beat = A.beats.find((b) => b.def.wall);
    const reach = WT.speed * Math.max(0.2, WT.runTo * (beat?.W ?? 1.05));
    let best = null, bs = -Infinity;
    for (const b of W?.list ?? []) {
      if (!b || b.state !== 0 || b.absent || b.floor || !(b.h > 1.6) || !(b.r > 0)) continue;
      if (Math.hypot(b.x - me.x, b.z - me.z) > WT.seek) continue;
      let nx = p.x - b.x, nz = p.z - b.z;
      const nl = Math.hypot(nx, nz);
      if (nl < 2.2 || nl > 9.5) continue;
      nx /= nl;
      nz /= nl;
      const off = b.r + R + 0.15, x = b.x + nx * off, z = b.z + nz * off;
      if (Math.hypot(x, z) > bound) continue;
      const run = Math.hypot(x - me.x, z - me.z);
      if (run > reach) continue;
      // (from the side: the flight comes across the screen (the game camera looks north: east / west) and
      // across the hero's facing; a short run and a mid-length flight help)
      const side = 0.7 * Math.abs(nx) + 0.3 * Math.abs(nx * hz - nz * hx);
      const score = side + 0.25 * (1 - run / reach) - 0.05 * Math.abs(nl - 5);
      if (score > bs) {
        bs = score;
        best = { b, x, z };
      }
    }
    if (!best) {
      // the floor: a spot 3.2 m east or west of the hero (across the screen), on the side nearer Xin Yi
      const sx = 1, sz = 0, sgn = me.x - p.x >= 0 ? 1 : -1;
      let x = p.x + sx * sgn * 3.2, z = p.z + sz * sgn * 3.2;
      const l = Math.hypot(x, z);
      if (l > bound) {
        x *= bound / l;
        z *= bound / l;
      }
      best = { b: null, x, z };
    }
    A.wall = { ...best, sx: me.x, sz: me.z, kicked: false, tx: p.x, tz: p.z, dx: 0, dz: 1, y0: 0, yHit: 0, slow: false };
  }

  onImpact(b, s, a) {
    const D = b.def, fx = this.fx;
    if (a?.def?.transition) {
      this._changing = false;
      fx.transformNova?.(this.position.x, this.position.z, D.zone?.r ?? 6, this.phase);
      this.game.shake?.(0.45);
      if (a.name === 'rising') {
        this._palmT = this.T.rising.palm;
        this.emit('dragon:stillHand', { dur: this._palmT });
      }
      return;
    }
    if (this.flurry?.onImpact(b, s, a)) return;
    if (this.iron?.onImpact(b, s, a)) return;
    if (this.source?.onImpact(b, s, a)) return;
    if (D.zone?.kind === 'ring' && (D.knockdown || D.tell === TELL.RED)) {
      fx.crater?.(this.position.x, this.position.z, D.zone.r * 0.5, 0.6);
      this.game.shake?.(0.25);
    }
  }

  onCast(b, s, a) {
    if (this.iron?.onCast(b, s, a)) return;
    this.source?.onCast(b, s, a);
  }

  onSustain(b, s, a, k) {
    this.flurry?.onSustain(b, s, a, k);
    this.iron?.onSustain(b, s, a, k);
  }

  /** A beat's own motion: Borrowed Wall's run up the upright; the guns' strafe; the dive; the pass. */
  beatMotion(b, u, s, dt) {
    const a = this.brain.act;
    if (b.def.wall && a?.wall) this._wallRun(a.wall, b, u, dt);
    this.iron?.motion(b, u, s, dt);
    this.source?.motion(b, u, s, dt);
  }

  /**
   * Borrowed Wall, every frame of its beat: the run to the spring spot (to wall.runTo), two steps up the
   * upright's face (to wall.springAt, wall.up m up; off the floor: a crouch), THE SPRING (the kick-off's
   * bite on the upright, a thump; the target fixed here), the flat arc to the hero, the blow in the air,
   * the landing through the active frames. Horizontal moves go through moveBy (the colliders hold him).
   */
  _wallRun(Wl, b, u, dt) {
    const WT = this.T.wall, p = this.game.player?.position, D = b.def;
    const heel = D.wallBlow === 'heel';
    const B = Wl.b && Wl.b.state === 0 && !Wl.b.absent ? Wl.b : null;
    const pos = this.position;
    const ease = (k) => k * k * (3 - 2 * k);
    if (u < WT.runTo) {
      // the run: there by runTo
      const k = ease(clamp(u / WT.runTo, 0, 1));
      const wx = Wl.sx + (Wl.x - Wl.sx) * k, wz = Wl.sz + (Wl.z - Wl.sz) * k;
      const dx = wx - pos.x, dz = wz - pos.z;
      if (Math.hypot(dx, dz) > 1e-4) {
        this.moveBy(dx, dz);
        this.yaw = turnToward(this.yaw, Math.atan2(Wl.x - Wl.sx, Wl.z - Wl.sz), 18 * dt);
      }
      pos.y = 0;
      return;
    }
    if (u < WT.springAt) {
      // up the face (facing it), or crouched on the floor (facing the hero)
      const k = clamp((u - WT.runTo) / (WT.springAt - WT.runTo), 0, 1);
      if (B) this.yaw = turnToward(this.yaw, Math.atan2(B.x - pos.x, B.z - pos.z), 16 * dt);
      else if (p) this.yaw = turnToward(this.yaw, Math.atan2(p.x - pos.x, p.z - pos.z), 16 * dt);
      pos.y = B ? WT.up * ease(k) : 0;
      return;
    }
    if (!Wl.kicked) {
      // THE SPRING: the target fixed here
      Wl.kicked = true;
      Wl.y0 = pos.y;
      Wl.fx = pos.x;
      Wl.fz = pos.z;
      Wl.tx = p?.x ?? pos.x + Math.sin(this.yaw) * 3;
      Wl.tz = p?.z ?? pos.z + Math.cos(this.yaw) * 3;
      const ddx = Wl.tx - pos.x, ddz = Wl.tz - pos.z, l = Math.hypot(ddx, ddz) || 1;
      Wl.dx = ddx / l;
      Wl.dz = ddz / l;
      // where the blow lands from: the kick stops 1.4 m short of him, the heel comes down on the spot
      const stop = heel ? 1.15 : 1.4; // (the heel lands beside the fixed spot: never inside the hero's body)
      Wl.hx = Wl.tx - Wl.dx * Math.min(stop, l);
      Wl.hz = Wl.tz - Wl.dz * Math.min(stop, l);
      Wl.yHit = heel ? 0 : 0.55;
      if (B) {
        const W = this.game.world?.destructibles;
        W?.strike?.(B.x, B.z, B.r + 0.3, this.T.world.kickOff, { kind: 'blunt', by: 'boss', y: Math.max(0.6, Wl.y0), dx: -Wl.dx, dz: -Wl.dz, src: W.swing?.() ?? -1 });
      }
      this.fx.crater?.(pos.x, pos.z, 0.5, 0.25);
      this.game.shake?.(0.1);
      this.emit('dragon:wallKick', { x: pos.x, z: pos.z, wall: !!B, blow: heel ? 'heel' : 'kick' });
      // THE LONG HANG: the hero in the kick's line at the spring, at most once in wall.slowEvery s
      if (!heel && p && fin(this.time) - this._wallSlowT >= WT.slowEvery) {
        const along = (p.x - pos.x) * Wl.dx + (p.z - pos.z) * Wl.dz, across = Math.abs(-(p.x - pos.x) * Wl.dz + (p.z - pos.z) * Wl.dx);
        if (along > 0 && across < 0.9) {
          this._wallSlowT = fin(this.time);
          Wl.slow = true;
        }
      }
    }
    if (u <= 1) {
      // the flight: a flat arc from the spring to where the blow lands (the heel goes up to 2.6 m first)
      const k = clamp((u - WT.springAt) / (1 - WT.springAt), 0, 1), e = ease(k);
      const wx = Wl.fx + (Wl.hx - Wl.fx) * e, wz = Wl.fz + (Wl.hz - Wl.fz) * e;
      this.moveBy(wx - pos.x, wz - pos.z);
      const top = heel ? 2.6 : Math.max(Wl.y0, 0.9) + 0.35;
      pos.y = Math.max(0, k < 0.55 ? Wl.y0 + (top - Wl.y0) * ease(k / 0.55) : top + (Wl.yHit - top) * ease((k - 0.55) / 0.45));
      this.yaw = turnToward(this.yaw, Math.atan2(Wl.dx, Wl.dz), 20 * dt);
      if (Wl.slow && k > 0.45) {
        Wl.slow = false;
        this.game.flow?.cinematic?.({ x: pos.x, z: pos.z, zoom: -3, weight: 0.25, slowmo: WT.slow, dur: WT.slowDur, kind: 'wall' });
      }
      return;
    }
    // the landing through the active frames
    pos.y = Math.max(0, Wl.yHit * (1 - clamp(u - 1, 0, 1)));
  }

  hitPlayer(o) {
    const D = o.beat?.def;
    if (D?.flit) o = { ...o, extra: { ...(o.extra ?? null), around: true } };
    const rain = o.attack === 'ironRain' || o.attack === 'ironLeap';
    if (rain && o.projectile) o = { ...o, extra: { ...(o.extra ?? null), guardCost: o.damage >= this.T.ironRain.last ? this.T.ironRain.lastCost : this.T.ironRain.guardCost } };
    // THE BULLETS' RULE (ADR-169, iron.js): a slug of a burst is its burst's one result; any other shot
    // inside TUNING.shotMercy of a bullet that hit him goes harmless
    const call = (q) => super.hitPlayer(q);
    let r;
    if (o.projectile && this.iron) r = rain && o.damage < this.T.ironRain.last ? this.iron.slugHit(o, call) : this.iron.shotHit(o, call);
    else r = call(o);
    if (D?.send) this.source?.sent(r);
    return r;
  }

  // ---------------------------------------------------------------- every frame
  brainFrame(dt) {
    const rdt = fin(this.game.realDt, dt);
    if (this._bendT > 0) {
      this._bendT = Math.max(0, this._bendT - dt);
      this._bendDodge = Math.max(0, this._bendDodge - dt);
      if (this._bendT <= 0) this._critOpen = false;
    }
    if (this._bendCool > 0) this._bendCool -= dt;
    if (this._palmT > 0) this._palmT = Math.max(0, this._palmT - dt);
    // the intro: the turn, then THE BECKON rewrites the hall into the Sparring Hall
    if (this.mode === 'intro') {
      this._introT += dt;
      const p = this.game.player?.position;
      if (p && this._introT > 0.9) this.yaw = turnToward(this.yaw, Math.atan2(p.x - this.position.x, p.z - this.position.z), 4.5 * dt);
      if (!this._beckoned && this._introT >= INTRO_BECKON) {
        this._beckoned = true;
        this._scene('dojo', false);
      }
    } else if (this.mode !== 'sleep' && !this._beckoned && this.phase === 1) {
      // (a fight started without the intro: the Lab, a strike that woke him)
      this._beckoned = true;
      this._scene('dojo', false);
    }
    if (this._fall) {
      this._fall.t += dt;
      // (he rises straight off the floor as the fall's clip ends: no footwork between, no standing pop)
      if (this._fall.t >= 0.5 + this.T.fall.lie && this.mode === 'react' && this.brain.react?.kind === 'executed') {
        this.brain.pendingPhase = 0;
        this.brain.startAct('rising', 3);
      }
    }
    this.iron.frame(dt);
    this.source.frame(dt, rdt);
    this.flurry.frame(dt);
    // GEAR 2: bar 1 at or under gear2.at, between two moves (never inside a string: in his footwork, or in a
    // move's recovery, which a link or the flow roll would otherwise run straight on from)
    if (this.phase === 1 && this.gear < 2 && this.brain.aiEnabled && this.hp > 0 && this.hp <= this.maxHp * this.T.gear2.at && this._betweenMoves()) this._gearUp(true);
  }

  // ---------------------------------------------------------------- his limbs (Tian Lei's: ascendant.js)
  _strikePart() {
    const br = this.brain;
    if (this.mode === 'act') {
      const b = beatNow(br.act);
      if (b && !br.act.def.transition) return b.def.part ?? 'fistR';
    } else if (this.mode === 'react' && GUARD_KINDS.has(br.react?.kind)) return br.react.kind === 'wardR' ? 'fistR' : 'fistL';
    return 'fistR';
  }

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
      case 'feet':
        a.set(this.position.x, 0.25, this.position.z);
        b.set(this.position.x, 0.6, this.position.z);
        break;
      default: {
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

  /**
   * The fairness guard on a thing he throws (brain.fairDelay): `flight` s from now it would meet the hero
   * needing the answer `tell` asks. Returns the s it should hang before it flies (0: now), or -1: no wait
   * clears it, it goes uncued and harmless (the caller marks it done). Counted in brain.stats.
   */
  fairThrow(flight, tell, source) {
    const br = this.brain;
    if (!br?.fairDelay || !Number.isFinite(flight)) return 0;
    const w = br.fairDelay(Math.max(0, flight), tell, this.T.pressure?.guard?.maxDelay ?? 0.6, source);
    if (w > 0) br.stats.delays++;
    else if (w < 0) br.stats.fizzles++;
    return w;
  }

  /** The right / left hand as drawn (a muzzle, a bolt's start; fx). */
  handPoint(left, out) {
    const h = left ? this._handL : this._hand;
    out.x = h.x;
    out.y = h.y;
    out.z = h.z;
    return out;
  }

  _drawnPoints() {
    this._tipPrev.copy(this._tip);
    this._hiltPrev.copy(this._hilt);
    const part = this._strikePart();
    this._part = part;
    this._limbSeg(part, this._hilt, this._tip);
    const ok = Number.isFinite(this._tip.x + this._tip.y + this._tip.z) && Number.isFinite(this._hilt.x + this._hilt.y + this._hilt.z);
    if (!ok || !this._tipOk || part !== this._partPrev) {
      this._tipPrev.copy(this._tip);
      this._hiltPrev.copy(this._hilt);
    }
    this._partPrev = part;
    this._limbSeg('fistR', _a, this._hand);
    this._limbSeg('fistL', _a, this._handL);
    this._tipOk = ok;
    this._ptsOk = ok;
  }

  _poseAt(t) {
    super._poseAt(t);
    this._limbSeg(this._part, this._hilt, this._tip);
  }

  _animate(dt) {
    this.pilot.form = this.phase;
    this.pilot.pset = this.phase === 1 && this.gear >= 2 ? 4 : this.phase;
    planFeet(this, dt);
    super._animate(dt);
  }

  // ---------------------------------------------------------------- after the pose
  /** The trail off the striking limb through a blow; the stance's stilled air; the held palm; the
   *  hanging bolts; one afterimage on each slip of the Lean; the stars of a break. */
  afterPose(dt, a) {
    const fx = this.fx, ph = this.phase;
    if (a && this.brain.catching?.()) fx.stanceGlow?.(this, dt, 3);
    if (this._palmT > 0) fx.palmHold?.(this, dt);
    if (a && this._tipOk && !a.def.transition && !this.shuddering) {
      for (const b of a.beats) {
        if (b.feint || a.t < b.impact - 0.32 * b.W - 0.02 || a.t > b.impact + 1.6 * b.A + 0.05) continue;
        if (!b.def.cast && !b.def.selfHit && !b.def.iron) {
          const heavy = b.def.tell === TELL.RED || b.def.tell === TELL.BLACK || !!b.def.knockdown;
          fx.limbTrail?.(this._tipPrev.x, this._tipPrev.y, this._tipPrev.z, this._tip.x, this._tip.y, this._tip.z, ph, heavy);
        }
        break;
      }
    }
    if (this.mode === 'react' && GUARD_KINDS.has(this.brain.react?.kind) && this.brain.modeT < dt * 1.5) fx.afterimages?.(this, 1);
    this.source?.draw(dt);
    if (this.mode === 'broken') fx.stunStars(this._hs[0]);
  }
}

export { MOVES, TUNING };
