import * as THREE from 'three';
import { Duelist, HERO_SCALE } from '../duelist/duelist.js';
import { GUARD_KINDS } from '../duelist/guard.js';
import { DIM } from '../../player/model.js';
import { DuelBrain } from '../duelist/brain.js';
import { TELL, GUARD } from '../../../combat/rules.js';
import { wrapAngle } from '../../../core/math.js';
import { WJ_LOADOUT, WJ_FIST } from './gear.js';
import { WJ_POSES } from './poses.js';
import { MOVES, MOVE_NAMES, CLIP, TRANSITIONS, REACT, OPEN, realise, HANDLERS, COUNTER, STREAK } from './moves.js';
import { TUNING } from './tuning.js';
import { LINKS } from './links.js';
import { tintUntouched, dressUntouched, wjLettersOn, eyePoint, handPoint } from './look.js';
import { WjFx } from './fx.js';
import { Barrier } from './barrier.js';
import { Pull } from './pull.js';
import { Domain } from './domain.js';
import * as FX_DEBUG from './fxDebug.js';

// Bai Wuji, the Untouched: the boss of the Veiled Crossing (`?level=veil`). A tall, relaxed man in a
// dark high-collared coat, hands in his pockets, on the shared duelist engine (duelist/duelist.js; the
// mind: duelist/brain.js). One bar, three phases (66 %: THE BLINDFOLD COMES OFF; 30 %: THE MEASURELESS,
// fought inside the void). Bare-handed: his "blade" (the engine's hilt -> tip) is the striking limb of
// the moment (Tian Lei's and Halcyon's way).
//
// ======================================================================= THE ROUTING CONTRACT
// This file is core's and stays as it is after wave 0: the later agents work through the objects below.
//   d.barrier  (barrier.js)  THE UNREACHED: takeHit asks it first (barrier.stops); every answer of the
//              hero's to a blow through d.hitPlayer goes to barrier.answer; a posture break and the
//              flash counter open it; framed in brainFrame. (Hurt spheres grow by its shell while up.)
//   d.pull     (pull.js)     the drag toward Draw's knots: framed in brainFrame (pull.add from the spells).
//   d.domain   (domain.js)   the P2 -> P3 transition: beats with `wjDomain` (motion, hitPlayer, onHit);
//              framed in brainFrame; his death breaks the void.
//   d.fx       (fx.js WjFx)  every drawing (its header lists the surface).
//   d.parts    THE MOVE HANDLERS, one per move file that exports `create(d)` (moves.js HANDLERS: today
//              d.parts.spells = WjSpells (spells.js), d.parts.terrain = WjTerrain (terrain.js)). A beat is
//              ROUTED to the handler whose file lists one of the beat's own fields in its `FIELDS`
//              export (a beat with `wjDraw` goes to spells when moves/spells.js has FIELDS ['wjDraw', ...]).
//              A move is routed to every handler one of its beats is routed to. Hooks (all optional,
//              called through `?.`; spells.js has the full list with arguments):
//                beat:  beatMotion(b, u, s, dt) · onImpact(b, s, a) · onRelease · onCast · onSustain(b, s, a, k)
//                       hitPlayer(o) → o (before the blow reaches the hero) · onHit(o, r) (after)
//                       onParried(info, b) → true = handled · reach(b) → m | Infinity | undefined
//                move:  weigh(name, def, w, dist) → w · onActStart(A) → false refuses
//                every handler, every frame / event: frame(dt) (brainFrame) · afterPose(dt, a) ·
//                       stop() (a reaction, a break, his death) · reset() (the fight's reset)
//              A routed beat's onImpact replaces core's own world blow for it (the engine's world blow
//              and floor mark still run as for any beat unless it is selfHit / cast).
//   core's own fields (handled here; moves.js header): wjBlink (the vanish), wjCrash (a throw through
//              the world), blockPush / guardCost (a block's slide and cost; defaults TUNING.wjWeight),
//              wjMoment (the unveiling), wjDomain (domain.js).
//   Poses: poses.js merges posesMelee.js (`ml` names), posesSpells.js (`sp`), posesTerrain.js (`tr`).
//   Debug (the Lab, the film rig): d.debug.fx(name, opts) → fxDebug.js run(d, name, opts) ·
//              setPhase(n) · barrier('open' | 'up' | 'crack') · domain('escape' | 'caught' | 'break') ·
//              pull(x, z, o) · blink('behind' | 'side') · tidy().
// ======================================================================================================

/** Everything the shared duelist needs to be him (duelist.js: kit). */
export const UNTOUCHED_KIT = Object.freeze({
  id: 'untouched',
  TUNING, MOVES, MOVE_NAMES, CLIP, realise,
  transitions: TRANSITIONS,
  counterMove: () => COUNTER,
  streakMove: () => STREAK,
  loadout: WJ_LOADOUT,
  poses: WJ_POSES,
  blade: WJ_FIST,
  scale: TUNING.scale,
  REACT, OPEN,
  dress: (d, dt) => dressUntouched(d, dt),
  get letters() {
    return wjLettersOn();
  },
});

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const beatNow = (a) => (a ? a.beats.find((b) => a.t < b.end + 1e-6) ?? null : null);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** His mind: the duelist's; a blow out of a blink, and a routed beat's own reach, reach the hero anywhere. */
export class UntouchedBrain extends DuelBrain {
  _reach(b) {
    const D = b.def;
    if (D.wjBlink || D.wjDomain || D.wjMoment) return Infinity;
    const H = this.d._handlerOf?.(D);
    const r = H?.reach?.(b);
    if (r !== undefined && r !== null && !Number.isNaN(r)) return r;
    return super._reach(b);
  }

  startReact(kind) {
    const ok = super.startReact(kind);
    if (ok) this.d._stopParts?.();
    return ok;
  }
}

export class Untouched extends Duelist {
  constructor(game) {
    super(game, UNTOUCHED_KIT);
  }

  // ---------------------------------------------------------------- the engine's hooks
  _makeFx() {
    return new WjFx(this);
  }
  _makeBrain() {
    return new UntouchedBrain(this);
  }
  _tint(M) {
    tintUntouched(M);
  }

  /** Before his rig is batched: his rules, the move handlers, the Lab's API. */
  _setup() {
    this.barrier = new Barrier(this);
    this.pull = new Pull(this);
    this.domain = new Domain(this);
    this.parts = {};
    this._partList = [];
    for (const H of HANDLERS) {
      try {
        const h = H.create(this);
        if (h) {
          this.parts[H.name] = h;
          this._partList.push({ h, fields: H.fields });
        }
      } catch (err) {
        console.error(`[untouched] the ${H.name} handler failed to build`, err);
      }
    }
    this.eyesK = 0;
    this.dressPhase = 1;
    this._part = 'fistR';
    this._partPrev = '';
    this._ptsOk = false;
    this._hsR = this._hs.map((s) => s.r);
    const dbg = this.debug, d = this;
    const fight = () => {
      if (d.mode === 'sleep' || d.mode === 'intro') d.brain.startFight();
    };
    dbg.fx = (name, opts) => {
      try {
        return FX_DEBUG.run?.(d, name, opts) ?? false;
      } catch (err) {
        console.error('[untouched] fxDebug', err);
        return false;
      }
    };
    /** Into phase n through its real transition(s), one after another (each needs the one before over). */
    dbg.setPhase = (n) => {
      fight();
      const want = Math.max(1, Math.min(3, Math.round(fin(Number(n), 1))));
      if (want <= d.phase) return d.phase === want;
      return d.brain.forcePhase(d.phase + 1);
    };
    dbg.barrier = (cmd) => {
      if (cmd === 'open') return d.barrier.open('debug');
      if (cmd === 'up') return d.barrier.close();
      if (cmd === 'crack') return d.barrier.crack();
      return { up: d.barrier.up, cracks: d.barrier.cracks, openT: d.barrier.openT };
    };
    dbg.domain = (cmd) => {
      if (cmd === 'escape') return d.domain.escape(), true;
      if (cmd === 'caught') return d.domain.caught(), true;
      if (cmd === 'break') return d.domain.breakVoid();
      return d.domain.state;
    };
    dbg.pull = (x, z, o = {}) => {
      const p = d.game.player?.position;
      return d.pull.add({ x: fin(x, p?.x ?? 0), z: fin(z, p?.z ?? 0), ...o });
    };
    dbg.blink = (how = 'behind') => {
      const p = d.game.player;
      if (!p?.position) return false;
      const yaw = fin(p.yaw) + (how === 'side' ? Math.PI / 2 : Math.PI);
      d.blinkTo(p.position.x + Math.sin(yaw) * 1.8, p.position.z + Math.cos(yaw) * 1.8, p.position);
      return true;
    };
    dbg.tidy = () => {
      d.pull.stop();
      d._stopParts();
      if (d.mode === 'foot' || d.mode === 'sleep') d.position.set(0, 0, 0);
    };
  }

  reset() {
    if (this.barrier) {
      this.barrier.reset();
      this.pull.reset();
      this.domain.reset();
      for (const { h } of this._partList) {
        try {
          h.reset?.();
        } catch (err) {
          console.error('[untouched] handler reset', err);
        }
      }
      this.eyesK = 0;
      this.dressPhase = 1;
      this._wjSurprised = false;
      this._ptsOk = false;
      this._partPrev = '';
    }
    super.reset();
    this.game.world?.forest?.setPhase?.(1);
  }

  get LINKS() {
    return LINKS;
  }

  // ---------------------------------------------------------------- the routing
  /** The handler a beat def is routed to (its first field a handler's FIELDS lists), or null. */
  _handlerOf(D) {
    if (!D || !this._partList?.length) return null;
    const M = (this._fieldOf ??= new Map()); // (beat def -> handler, per actor)
    if (M.has(D)) return M.get(D);
    let out = null;
    for (const { h, fields } of this._partList) {
      if (fields.some((f) => D[f] !== undefined)) {
        out = h;
        break;
      }
    }
    M.set(D, out);
    return out;
  }
  /** The handlers a move is routed to (any of its beats'). */
  _handlersOfMove(def) {
    const out = [];
    for (const b of def?.beats ?? []) {
      const alts = Array.isArray(b.pick) ? b.pick : [b];
      for (const x of alts) {
        const h = this._handlerOf(x);
        if (h && !out.includes(h)) out.push(h);
      }
    }
    return out;
  }
  _each(fn) {
    for (const { h } of this._partList ?? []) {
      try {
        fn(h);
      } catch (err) {
        console.error('[untouched] handler', err);
      }
    }
  }
  /** Every handler stops what it holds (a reaction, a break, the death). */
  _stopParts() {
    this._each((h) => h.stop?.());
  }

  /** His AI weighs a move: the handlers its beats are routed to have their say. */
  weigh(name, def, w, dist) {
    for (const h of this._handlersOfMove(def)) {
      if (!(w > 0)) return 0;
      w = fin(h.weigh?.(name, def, w, dist), w);
    }
    return w;
  }

  onActStart(A) {
    for (const h of this._handlersOfMove(A.def)) if (h.onActStart?.(A) === false) return false;
    return true;
  }

  // ---------------------------------------------------------------- every beat's own motion
  beatMotion(b, u, s, dt) {
    const D = b.def;
    if (D.wjBlink && !b._blinked && u >= fin(D.wjBlink.u, 0.12) && s) {
      b._blinked = true;
      this._blinkBeat(D.wjBlink, s);
    }
    if (D.wjDomain) this.domain.motion(b, u, s, dt);
    this._handlerOf(D)?.beatMotion?.(b, u, s, dt);
  }

  /** A beat's blink: behind the hero, at a side of him, or round from his facing. */
  _blinkBeat(K, s) {
    const pl = this.game.player;
    const face = fin(pl?.yaw, wrapAngle(s.ang + Math.PI));
    let yaw, r;
    if (Number.isFinite(K.behind)) {
      yaw = face + Math.PI;
      r = K.behind;
    } else if (Number.isFinite(K.side)) {
      yaw = face + (K.side >= 0 ? 1 : -1) * Math.PI * 0.5;
      r = fin(K.r, 2);
    } else {
      yaw = face + fin(K.at, Math.PI);
      r = fin(K.r, 2);
    }
    let tx = s.p.x + Math.sin(yaw) * r, tz = s.p.z + Math.cos(yaw) * r;
    if (!this.standable(tx, tz)) {
      tx = s.p.x - Math.sin(yaw) * r;
      tz = s.p.z - Math.cos(yaw) * r;
    }
    this.blinkTo(tx, tz, s.p);
  }

  /** He is gone from where he stands and at (tx, tz), facing `face`. */
  blinkTo(tx, tz, face) {
    const x0 = this.position.x, z0 = this.position.z;
    this.fx.blinkOut?.(this);
    this.fx.afterimage?.(this, 0, 0, 0.45);
    this.position.x = tx;
    this.position.z = tz;
    this.moveBy(0, 0);
    if (face && Number.isFinite(face.x + face.z)) this.yaw = Math.atan2(face.x - this.position.x, face.z - this.position.z);
    this.object3d.rotation.y = this.yaw;
    this.anim.teleported?.();
    this.fx.vanish?.(this, x0, z0, this.position.x, this.position.z, 1);
    this.fx.blinkIn?.(this);
  }

  onImpact(b, s, a) {
    const D = b.def, W = this.game.world;
    if (a?.def?.transition && D.wjMoment === 'unveil') {
      // THE BLINDFOLD COMES OFF: the dress, the eyes, a burst that flattens the nearest ruins
      this.dressPhase = 2;
      this.eyesK = 1;
      W?.forest?.setPhase?.(2);
      const o = (this._wbo ??= { kind: 'blast', by: 'boss', dx: NaN, dz: NaN, y: 1, src: -1, scar: true });
      o.src = W?.destructibles?.swing?.() ?? -1;
      W?.impact?.(this.position.x, this.position.z, this.T.transition.ringRadius + 1, this.T.transition.power, o);
      this.fx.shock?.(this.position.x, this.position.z, this.T.transition.ringRadius, this.fx._opt(1.2, 0.1, 'void', 0, true));
      this.game.shake?.(0.5);
      return;
    }
    if (D.wjDomain === 'close') {
      this.dressPhase = 3;
      this.game.shake?.(0.4);
    }
    this._handlerOf(D)?.onImpact?.(b, s, a);
  }

  onRelease(b, s, a) {
    this._handlerOf(b.def)?.onRelease?.(b, s, a);
  }
  onCast(b, s, a) {
    this._handlerOf(b.def)?.onCast?.(b, s, a);
  }
  onSustain(b, s, a, k) {
    this._handlerOf(b.def)?.onSustain?.(b, s, a, k);
  }

  /** Every frame after the brain: the rules, the handlers; the hands come out of the pockets after phase 1. */
  brainFrame(dt) {
    this.barrier.frame(dt);
    this.pull.frame(dt);
    this.domain.frame(dt);
    this._each((h) => h.frame?.(dt));
    this.pilot.armsK = (this.pilot.armsK ?? 1) + ((this.phase <= 1 ? 1 : 0) - (this.pilot.armsK ?? 1)) * Math.min(1, dt * 3);
  }

  /** After the pose: his eyes, the trail off the striking limb through a blow, the stars of a break. */
  afterPose(dt, a) {
    const fx = this.fx;
    if (this.mode !== 'dead' && this.eyesK > 0.02) fx.eyes?.(this, this.eyesK);
    // THE BLINDFOLD COMES OFF: the band's light and the eyes' flare through the unveiling's windup (the
    // flare lands at u 0.9, just before the impact that sets eyesK; fx.unveil's only caller)
    if (a?.def?.transition && this.mode === 'act') {
      const b = a.beats[0];
      if (b?.def?.wjMoment === 'unveil' && a.t < b.impact) {
        const u = Math.min(1, Math.max(0, (a.t - b.start) / Math.max(1e-4, b.W)));
        fx.unveil?.(this, Math.min(1, Math.max(0, (u - 0.6) / 0.3)));
      }
    }
    if (a && this._tipOk && !this.shuddering && !a.def.transition) {
      for (const b of a.beats) {
        if (b.feint || a.t < b.impact - 0.32 * b.W - 0.02 || a.t > b.impact + 1.6 * b.A + 0.05) continue;
        const D = b.def, heavy = D.tell === TELL.RED || D.tell === TELL.BLACK || !!D.knockdown;
        fx.limbTrail?.(this._tipPrev.x, this._tipPrev.y, this._tipPrev.z, this._tip.x, this._tip.y, this._tip.z, 1, heavy);
        break;
      }
    }
    if (this.mode === 'broken') fx.stunStars(this._hs[0]);
    this._each((h) => h.afterPose?.(dt, a));
  }

  // ---------------------------------------------------------------- the barrier
  /** The hero's cut: the barrier first (it stops short, deals nothing), then the engine's. */
  takeHit(o = {}) {
    if (this.barrier?.stops(o)) return 0;
    const first = this.barrier && !this.barrier.up && !this._wjSurprised && this._surpriseOk(o);
    const dmg = super.takeHit(o);
    // the first cut that lands while the barrier is open (once a fight): he is surprised (the body's
    // `surprised` clip, an open reaction, in place of the flinch the engine gave him)
    if (first && dmg > 0 && !this.broken && this.mode !== 'dying' && this.mode !== 'dead' && this.brain.startReact('surprised')) this._wjSurprised = true;
    return dmg;
  }

  /** Where a surprise may play: his footwork, a guard's or a flinch's reaction, a move's recovery (never
   *  a windup, a transition, a break, the hero's flurry or the execution: those keep theirs). */
  _surpriseOk(o) {
    if (o?.exact || fin(o?.reel, 0) > 0 || this.broken) return false;
    const br = this.brain, a = br.act, k = br.react?.kind;
    if (this.mode === 'foot') return true;
    if (this.mode === 'react') return k === 'flinch' || GUARD_KINDS.has(k);
    return this.mode === 'act' && !!a && !a.def.transition && Number.isFinite(a.recoveryStart) && a.t >= a.recoveryStart;
  }

  /** The flash counter (a perfect trade; One Breath's counter): it passes (exact) and opens the barrier. */
  onCounter(o = {}) {
    if (this.mode !== 'dying' && this.mode !== 'dead') this.barrier.open('counter');
    return super.onCounter(o);
  }

  /** A posture break opens the barrier (it stays open through the break). */
  _break() {
    super._break();
    if (this.broken) this.barrier.open('break', this.T.posture.breakTime + 0.5);
  }

  /** The hurt spheres grow by the shell while the barrier is up (the blade meets it a hand's width off). */
  _gameplayPoints() {
    const sh = this.barrier?.up ? fin(this.T.wjBarrier.shell, 0) : 0, R = this._hsR;
    if (R) for (let i = 0; i < this._hs.length; i++) this._hs[i].r = R[i] + sh;
    super._gameplayPoints();
  }

  // ---------------------------------------------------------------- his blows: weight, the answers
  /**
   * A blow at the hero. WEIGHT (R2): a block slides him (blockPush) and costs a share of the meter
   * (guardCost); a landed throw goes through the world (wjCrash, R3); a blow out of a blink holds from
   * any side. Then the engine's; then the barrier reads the answer, the domain its close, the handler
   * its own.
   */
  hitPlayer(o) {
    const D = o?.beat?.def, H = this._handlerOf(D);
    if (H?.hitPlayer) o = H.hitPlayer(o) ?? o;
    if (D?.wjDomain) o = this.domain.hitPlayer(o);
    else o = this._weighted(o, D);
    const r = super.hitPlayer(o);
    this.barrier.answer(r, o);
    if (D?.wjDomain === 'close') this.domain.onHit(o, r);
    H?.onHit?.(o, r);
    return r;
  }

  /** The hit with his weight's fields (a beat's own win; the caller's `extra` wins over both). */
  _weighted(o, D) {
    const Wt = this.T.wjWeight, C = this.T.wjCrash;
    const kb = Math.max(fin(o.knockback, 0), fin(o.damage, 0) > 0 ? fin(Wt.knockback, 0) : 0);
    const bp = Number.isFinite(D?.blockPush) ? D.blockPush : Wt.blockPush;
    const gc = Number.isFinite(D?.guardCost) ? D.guardCost : Wt.guardCost * (GUARD.max ?? 100);
    const crash = D?.wjCrash === false ? 0 : Number.isFinite(D?.wjCrash) ? D.wjCrash : kb >= C.minKb ? C.power : 0;
    const extra = { blockPush: bp, guardCost: gc, wjCrash: crash, wjCrashDamage: C.damage, ...(D?.wjBlink ? { around: true } : null), ...(o.extra ?? null) };
    return { ...o, knockback: kb, extra };
  }

  /** A parried blow: a routed beat's handler first (true: handled), else the engine's. */
  onParried(info = {}) {
    const b = this.brain.act?.striking ?? null;
    const H = this._handlerOf(b?.def);
    if (H?.onParried?.(info, b) === true) return;
    super.onParried(info);
  }

  // ---------------------------------------------------------------- the body's points (the body contract)
  eyePoint(out) {
    return eyePoint(this, out);
  }
  handPoint(side, out) {
    return handPoint(this, side, out);
  }

  // ---------------------------------------------------------------- his limbs (bare hands; Tian Lei's way)
  _strikePart() {
    const br = this.brain;
    if (this.mode === 'act') {
      const b = beatNow(br.act);
      if (b && !br.act.def.transition) return b.def.part === 'eyes' ? 'fistR' : b.def.part ?? 'fistR';
    } else if (this.mode === 'react' && GUARD_KINDS.has(br.react?.kind)) return br.react.kind === 'wardR' ? 'fistR' : 'fistL';
    else if (this.mode === 'foot' && br.wardK > 0.5) return 'fistL';
    return 'fistR';
  }

  _limbSeg(part, a, b) {
    const r = this.rig, A = r.arms, L = r.legs;
    const at = (j, v) => v.setFromMatrixPosition(j.matrixWorld);
    switch (part) {
      case 'fistL':
        at(A.L.fore, a);
        b.set(0, -DIM.foreArm - 0.06, 0).applyMatrix4(A.L.fore.matrixWorld);
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
      case 'feet':
        a.set(this.position.x, this.position.y + 0.25, this.position.z);
        b.set(this.position.x, this.position.y + 0.6, this.position.z);
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

  /** Where a beat's cue pops: the striking limb's end; 'eyes' his eyes; 'palms' between his hands. */
  tellPoint(part, out) {
    if (part === 'eyes') return this.eyePoint(out);
    if (!this._ptsOk) return super.tellPoint(part === 'feet' ? 'feet' : 'tip', out);
    if (part === 'palms') {
      this._limbSeg('fistR', _a, out);
      this._limbSeg('fistL', _a, _b);
      return out.set((out.x + _b.x) * 0.5, (out.y + _b.y) * 0.5, (out.z + _b.z) * 0.5);
    }
    if (part === 'feet') return out.set(this.position.x, this.position.y + 0.6, this.position.z);
    this._limbSeg(part ?? 'fistR', _a, out);
    if (!Number.isFinite(out.x + out.y + out.z)) out.set(this.position.x, 1.3, this.position.z);
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
    this._tipOk = ok;
    this._ptsOk = ok;
  }

  _poseAt(t) {
    super._poseAt(t);
    this._limbSeg(this._part ?? 'fistR', this._hilt, this._tip);
  }

  /** The kill: every handler stops; the void breaks and the crossing returns. */
  _die() {
    this.pull?.stop();
    this._stopParts?.();
    super._die();
    this.domain?.breakVoid();
  }
}

export { HERO_SCALE };
