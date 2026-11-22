import * as THREE from 'three';
import { CONFIG } from '../../core/config.js';
import { batchRigid } from '../../render/rigidBatch.js';
import { LET_GO, letGoRow, letGoUniforms } from '../../render/letGo.js';
import { FIRE_PALETTES } from '../../render/firePalettes.js';
import { LAYER_CASTER } from '../../render/pipeline.js';
import { clamp, damp } from '../../core/math.js';
import { TELL, TELL_STYLE, RESULT, POSTURE, tellDefaults, dodgeOnly, isFlare } from '../../combat/rules.js';
import { SHELF, rimZ } from '../../world/tideShelf.js';
import { ATTACKS, TUNING, BODY, POSE, perPhase } from './tuning.js';
import { buildColossus, SHED } from './model.js';
import { ColossusRig, poseGrip, poseHead, poseReel } from './rig.js';
import { MOVES, SPECIAL } from './attacks.js';
import { Director } from './director.js';
import { TideFx } from './fx.js';
import { TideHazards } from './hazards.js';
import { tideLookId, setTideLook } from './looks.js';
import { TideBreathCast } from '../player/techniques/tideBreath.js';

// NAERATH, THE TIDE COLOSSUS (ADR-141 – ADR-143): the level boss of Drownwatch Cliff, on the boss slot
// (docs/ARCHITECTURE.md "Levels and the boss slot"). Its own class, not a subclass of the Dragon: it does
// not walk. It stands in the sea north of the rim; what is in play is its two hands and its head. The
// hands come down on the shelf, sweep along the rim, flick; the head breathes a beam of brine along the
// shore. The hero cuts the hands to get at the head (the grip and the lurch), parries them, or dodges a
// red blow perfectly and lands on the head (the plunge). Rules: src/combat/rules.js; numbers: tuning.js.
//
//   colossus.js  the boss slot, the action runner, hits both ways, phases, posture, the Lab's debug
//   attacks.js   every move as a script over its data (ATTACKS): poses, cues, impacts, the world's calls
//   director.js  the weighted pick, the gaps, the fairness guard
//   rig.js       springs to pose targets, the arms' IK, the neck; the points gameplay reads
//   model.js     the body (the wyrm's art path), looks.js its three looks
//   fx.js        brine in the fire field (the beam, splashes, the throat), the cues (DuelFx)
//   hazards.js   the surge's wall of water and the breath's lingering lines

const TARGETABLE = new Set(['waking', 'combat', 'staggered']);
const POSTURE_STATES = new Set(['combat', 'staggered']);
const WARN = TELL_STYLE.red.warn ?? { color: [1.0, 0.12, 0.05], spike: 1.6, decay: 0.25 };
const WARN_BLACK = TELL_STYLE.black.warn;
const MAX_HURT = 16, MAX_ATK = 24;
const SLEEP = Object.freeze({ sink: 18 });
/** Actions the plunge does not cancel (the intro, a phase change, death). */
const NO_CANCEL = new Set(['intro', 'bellow', 'death']);
const v3 = () => new THREE.Vector3();

export class TideColossus {
  constructor(game) {
    this.game = game;
    this.name = 'NAERATH, THE TIDE COLOSSUS';
    this.kind = 'colossus';
    // brine: the void slot's palette, re-skinned for this page's one level (ADR-142; render/fireField.js)
    game.fx?.fire?.setPalette?.('void', FIRE_PALETTES.brine);
    this.model = buildColossus(game.U);
    // (the headless sims reseed their random stream here: every three.js object draws an id from it)
    game.onModelBuilt?.('dragon');
    this.object3d = this.model.root;
    // the boss slot's `position` is a FIXED point, the rim's centre: the minimap, audio, name tags and
    // the art grid's one anchor (main.js uBossScreen) read it; the body's anchor is object3d.position
    this.position = new THREE.Vector3(0, 0, SHELF.edgeZ);
    this.yaw = 0;
    this.maxHp = TUNING.maxHp;
    this.hp = this.maxHp;
    this.phase = 1;
    this.maxPosture = TUNING.posture.max[0];
    this.posture = 0;
    this.broken = false;
    this.state = 'sleeping';
    this.time = 0;
    this.flash = 0;
    this.glow = 0;
    this.throat = 0; // the breath's charge 0..1 (the drowned light climbing the throat)
    this.dissolve = 0;
    this.warn = 0;
    this.warnRGB = WARN.color;
    this._warnAt = -1;
    this._warnTell = TELL.RED;
    this.lit = 1; // (the sims check every boss's finite numbers)

    // the parts in play, refilled every frame from fixed pools (stable identities)
    this.hurtSpheres = [];
    this.bodyCircles = [];
    this.frameSpheres = [];
    this._hurt = Array.from({ length: MAX_HURT }, () => ({ x: 0, y: 0, z: 0, r: 1, part: 'hand', mult: 1, side: 0 }));
    this._circ = Array.from({ length: 8 }, () => ({ x: 0, z: 0, r: 1 }));
    this._frame = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, r: 2, part: 'hand' }));
    this._atk = Array.from({ length: MAX_ATK }, () => ({ x: 0, y: 0, z: 0, r: 0, kind: 'attack' }));
    this._atkN = 0;
    this._hbHurt = this._hurt.map(() => ({ x: 0, y: 0, z: 0, r: 0, kind: 'hurt', part: '' }));
    this._hbOut = [];

    // the hands: their mode this frame ('grip' | 'planted' | 'air' | 'reel' | 'slip' | 'sea'), let-go
    // timers, the damage they took (the grip), how long the hero has stood at a resting hand
    this.hands = [0, 1].map((i) => ({
      i, s: i === 0 ? -1 : 1, mode: 'grip', reelT: 0, log: Array.from({ length: 24 }, () => ({ t: -99, d: 0 })), logI: 0, nearT: 0, knock: { t: -1, x: 0, z: 0 },
    }));
    this.headDownT = 0; // the head lies on the rim (spent, lurch, broken, plunged): it can be cut
    this.headX = 0;
    this.lockSide = -1; // lockPoint's hysteresis: 0 / 1 a hand, 2 the head
    this.act = null; // the running action (attacks.js)
    this.queued = null;
    this.cooldowns = {};
    this.gapT = 0;
    this.answered = false; // the hero answered the last move (a parried last blow, a flurry, a counter)
    this.aiEnabled = true;
    this.pendingPhase = 0;
    this.lastMove = null;
    this.sense = { x: 0, z: 0, depth: 0, deepT: 0, vx: 0, vz: 0, lx: 0, lz: 0, has: false };
    this._lastParry = -1;
    this._lastPlunge = -1;
    this._postureSent = -1;
    this.postureTimer = 0;
    this.stats = { cues: 0, cueTimes: [] }; // (the tests read the pace)
    this._tmp = v3();
    this._tmp2 = v3();
    this._pt = v3();
    this._hitPt = v3();
    this._letGo = letGoUniforms(game.U).uWyrmLetGo.value;
    this._heat = (game.U.uWyrmHeat ??= { value: new THREE.Vector4(0, 0, 0, 0) }).value;
    this._heatFrom = (game.U.uWyrmHeatFrom ??= { value: new THREE.Vector4(0, 0, 0, 0) }).value;
    this._heatS = 0;
    this._heatW = 0;
    this._throatPrev = 0;
    /** The letters a landed cut knocks loose (render/shedDigits.js). */
    this.shed = SHED;
    this.rig = new ColossusRig(this.model);
    this.fx = new TideFx(this);
    this.hazards = new TideHazards(this);
    this.director = new Director(this);
    this.debug = createDebug(this);
    // one draw call per material instead of one per mesh (render/rigidBatch.js)
    this.batch = batchRigid(game.U, this.object3d);
    game.scene.add(this.object3d);
    this.reset();
  }

  // ---------------------------------------------------------------- the boss slot
  get tScale() {
    const k = perPhase(TUNING.phaseTimeScale, this.phase);
    return Number.isFinite(k) && k > 0 ? k : 1;
  }
  get phaseAt() {
    return TUNING.phaseAt;
  }
  get nextPhaseHp() {
    const f = TUNING.phaseAt?.[this.phase];
    return this.phase < 3 && Number.isFinite(f) ? this.maxHp * f : 0;
  }
  get alive() {
    return this.state !== 'dying' && this.state !== 'dead';
  }
  isTargetable() {
    return TARGETABLE.has(this.state);
  }

  /** The live target nearest the hero (the head while it is down, else a hand), with hysteresis: it
   *  switches only for one `3` m nearer. Lock-on, auto-aim, the flow's intro framing and the riposte read it. */
  lockPoint(out) {
    const P = this.rig.pt, p = this.game.player?.position;
    const cand = (k, v) => {
      if (k === 2) return v.copy(P.head);
      return v.copy(this.hands[k].mode === 'grip' ? P.tips[k][1] : P.palm[k]).lerp(P.palm[k], 0.5);
    };
    if (!p || !Number.isFinite(p.x + p.z)) return cand(this.headDownT > 0 ? 2 : 1, out);
    let best = -1, bd = Infinity, cur = Infinity;
    for (let k = 0; k < 3; k++) {
      if (k === 2 && !(this.headDownT > 0)) continue;
      if (k < 2 && (this.hands[k].mode === 'reel' || this.hands[k].mode === 'sea')) continue;
      cand(k, this._tmp);
      const d = Math.hypot(this._tmp.x - p.x, this._tmp.z - p.z);
      if (k === this.lockSide) cur = d;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best < 0) best = this.headDownT > 0 ? 2 : p.x < 0 ? 0 : 1;
    if (this.lockSide >= 0 && cur < Infinity && bd > cur - 3) best = this.lockSide;
    this.lockSide = best;
    cand(best, out);
    if (!Number.isFinite(out.x + out.y + out.z)) out.set(this.position.x, 2, this.position.z);
    return out;
  }

  /** The hero's plunge rides this point: the top of the head. */
  plungePoint(out) {
    const h = this.rig.pt.head;
    if (Number.isFinite(h.x + h.y + h.z)) return out.set(h.x, h.y + BODY.head.tall * 0.55, h.z);
    return out.set(0, 4, SHELF.edgeZ - 3);
  }

  startIntro() {
    if (this.state !== 'sleeping') return;
    this.wakeFallback = -1;
    this.start('intro');
  }

  /** A move's name for the player (the death screen): its label without the note in brackets. */
  attackLabel(id) {
    const l = ATTACKS[id]?.label;
    return typeof l === 'string' && l ? l.replace(/\s*\(.*\)\s*$/, '') : null;
  }

  /**
   * A hit from the player (part: 'head' | 'hand' | 'wrist' | 'finger'). `exact`: damage is final, `posture`:
   * add exactly this. The phase gate as the wyrm's (no phase is skipped while the AI runs). A hand that
   * takes TUNING.grip.hp inside its window lets go and the head drops (the lurch).
   */
  takeHit(o = {}) {
    if (!this.alive) return 0;
    o = o || {};
    const raw = Number(o.damage);
    if (!(raw > 0)) return 0;
    const M = TUNING.partMult;
    const part = M[o.part] !== undefined ? o.part : 'hand';
    const broken = this.broken;
    const dmg = o.exact ? Math.max(1, Math.round(raw)) : Math.max(1, Math.round(raw * M[part] * (broken ? POSTURE.breakCritMult : 1)));
    const crit = !!o.crit || broken;
    let hp = this.hp - dmg;
    const gate = this.nextPhaseHp;
    if (gate > 0 && this.aiEnabled && this.hp >= gate) hp = Math.max(gate, hp);
    this.hp = Math.max(0, hp);
    this.flash = Math.max(this.flash, Math.min(o.heavy || crit ? 1 : 0.8, Number.isFinite(o.flash) ? o.flash : 1));
    const pt = o.point && Number.isFinite(o.point.x + o.point.y + o.point.z) ? o.point : null;
    const side = part === 'head' ? -1 : this._sideOf(pt);
    // the struck hand flinches (visual), sprays its letters
    let dx = Number(o.cut?.x ?? o.dir?.x), dz = Number(o.cut?.z ?? o.dir?.z);
    if (!Number.isFinite(dx + dz) || dx * dx + dz * dz < 1e-6) {
      dx = 0;
      dz = -1;
    }
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    if (side >= 0) {
      const h = this.rig.hands[side];
      h.vel.x += dx * 2.5;
      h.vel.z += dz * 2.5;
      h.vel.y += 1.2;
    } else {
      this.rig.head.vel.x += dx * 2;
      this.rig.head.vel.y += 1.5;
    }
    if (pt) this.fx.hitSpark(pt.x, pt.y, pt.z, dx, dz, !!o.heavy || crit);
    this.emit('dragon:hurt', { damage: dmg, part, hp: this.hp, crit });
    if (this.state === 'sleeping' && !(this.wakeFallback > 0)) this.wakeFallback = 0.6;
    if (this.hp <= 0) {
      this.die();
      return dmg;
    }
    if (!broken && POSTURE_STATES.has(this.state)) {
      if (o.posture !== undefined) this.addPosture(Number(o.posture));
      else {
        let gain = o.heavy ? POSTURE.hit.heavy : POSTURE.hit.light;
        const poise = Number(o.poise);
        if (Number.isFinite(poise) && poise > 0) gain *= clamp(poise / (o.heavy ? 40 : 12), 0.6, 1.5);
        if (part === 'head') gain *= TUNING.posture.headMult;
        this.addPosture(gain);
      }
    }
    // the grip: damage on a hand within its window
    if (side >= 0 && part !== 'head' && this.state === 'combat') this._gripHit(side, dmg);
    if (gate > 0 && this.hp <= gate) this.pendingPhase = Math.max(this.pendingPhase, this.phase + 1);
    return dmg;
  }

  /** Which hand a point is nearest (0 / 1), or -1. */
  _sideOf(pt) {
    if (!pt) return this.sense.x < 0 ? 0 : 1;
    const P = this.rig.pt;
    const d0 = Math.hypot(pt.x - P.palm[0].x, pt.z - P.palm[0].z), d1 = Math.hypot(pt.x - P.palm[1].x, pt.z - P.palm[1].z);
    return d0 <= d1 ? 0 : 1;
  }

  _gripHit(i, dmg) {
    const h = this.hands[i], G = TUNING.grip;
    const e = h.log[h.logI];
    h.logI = (h.logI + 1) % h.log.length;
    e.t = this.time;
    e.d = dmg;
    let sum = 0;
    for (const x of h.log) if (this.time - x.t <= G.window) sum += x.d;
    if (sum >= G.hp && h.reelT <= 0) this.gripBreak(i);
  }

  /** A hand lets go (the lurch): it is pulled back off the cliff for `letGo` s; the head drops onto the
   *  rim for `headDown` s (it can be cut) and takes `posture`. */
  gripBreak(i) {
    if (!this.alive || this.state === 'sleeping' || (this.act && NO_CANCEL.has(this.act.name))) return false;
    const h = this.hands[i], G = TUNING.grip;
    for (const x of h.log) x.t = -99;
    h.reelT = G.letGo;
    this.headDownT = Math.max(this.headDownT, G.headDown);
    this.emit('dragon:stagger');
    this.start('lurch');
    this.addPosture(G.posture);
    return true;
  }

  /**
   * After player.takeHit returned 'parried'. THE DEFLECT CHAIN (contract 1): a parried string hit that
   * is not its last is only deflected (posture, the hand knocked back for a moment); the last one (or a
   * single blow, or a blue flare blow anywhere in a string) recoils the hand and ends the move.
   */
  onParried(info = {}) {
    if (!this.alive || this.state === 'sleeping') return;
    if (this.time - this._lastParry < 0.1) return;
    this._lastParry = this.time;
    const a = this.act;
    const attack = info?.attack ?? a?.name ?? null;
    const tell = info?.tell === TELL.BLUE ? TELL.BLUE : TELL.NORMAL;
    const mine = !!a && (attack == null || attack === a.name);
    const b = mine ? a.cur : null;
    const hit = Number.isFinite(b?.hit) ? b.hit : 0;
    const string = mine && !!a.def?.string;
    const moment = !!b?.flare && tell === TELL.BLUE;
    const last = !string || hit >= a.beats.length - 1 || moment;
    this.emit('dragon:parried', { attack, tell, hit, last, flare: moment });
    if (string) {
      a.chain = (a.chain ?? 0) + 1;
      if (a.chain >= 2) this.emit('combat:deflectChain', { count: a.chain });
    }
    const h = this._hitPt;
    this.fx.parrySpark(h.x, h.y, h.z, tell);
    this.flash = Math.max(this.flash, 0.6);
    if (mine && this.state === 'combat') {
      if (last) {
        this.answered = true;
        this.start('recoil', { side: b?.side ?? a.side ?? 0 });
      } else this._knock(b?.side ?? a.side ?? 0);
    }
    this.addPosture((POSTURE.parry[tell] ?? POSTURE.parry.normal) * (this.game.player?.deflect?.perfect ? POSTURE.perfect : 1));
  }

  /** A deflected hit: its hand thrown back for a moment (visual; the string's timing stands). */
  _knock(side) {
    const sides = side === 2 ? [0, 1] : [side === 0 || side === -1 ? 0 : 1];
    for (const i of sides) {
      const K = this.hands[i].knock;
      K.t = 0;
    }
  }

  /**
   * The hero's plunge (contract 2) lands on the head: `damage` (final, part head, the phase gate kept)
   * and `posture`; the running move is cancelled (not the intro, a phase change or death) and the head
   * is slammed onto the rim. An execution on a broken colossus consumes the break.
   */
  onPlunge(o = {}) {
    o = o || {};
    if (!TARGETABLE.has(this.state)) return 0;
    if (this.time - this._lastPlunge < 0.25) return 0;
    this._lastPlunge = this.time;
    const execution = !!o.execution, heavy = execution && this.broken;
    const pt = o.point && Number.isFinite(o.point.x + o.point.y + o.point.z) ? o.point : this.rig.pt.head;
    const posture = Math.max(0, Number(o.posture) || 0);
    const dmg = this.takeHit({ damage: Number(o.damage) || 0, part: 'head', point: pt, heavy: true, crit: true, exact: true, posture: 0 });
    if (!this.alive) {
      this.emit('dragon:plunged', { execution });
      return dmg;
    }
    if (!this.act || !NO_CANCEL.has(this.act.name)) {
      this._clearWarn();
      if (heavy) {
        this.broken = false;
        this.posture = 0;
        this.emitPosture(true);
      }
      this.answered = true;
      this.start('plunged', { heavy });
    }
    this.flash = Math.min(this.flash, TUNING.plunged.flash);
    if (!heavy && posture > 0 && !this.broken) this.addPosture(posture);
    this.emit('dragon:plunged', { execution });
    return dmg;
  }

  reset() {
    this.act = null;
    this.queued = null;
    this.cooldowns = {};
    this.gapT = 0;
    this.answered = false;
    this.pendingPhase = 0;
    this.lastMove = null;
    this.state = 'sleeping';
    this.hp = this.maxHp;
    this.phase = 1;
    this.maxPosture = TUNING.posture.max[0];
    this.posture = 0;
    this.broken = false;
    this.postureTimer = 0;
    this._lastParry = this._lastPlunge = -1;
    this.flash = this.glow = this.throat = this.dissolve = 0;
    this._heatS = this._heatW = this._throatPrev = 0;
    this._heat.w = this._heatFrom.w = 0;
    this._letGo.x = 0;
    this.headDownT = 0;
    this.headX = 0;
    this.lockSide = -1;
    this.wakeFallback = -1;
    this.stats.cues = 0;
    this.stats.cueTimes.length = 0;
    this.sense.deepT = 0;
    this.sense.has = false;
    for (const h of this.hands) {
      h.mode = 'sea';
      h.reelT = 0;
      h.nearT = 0;
      h.knock.t = -1;
      for (const x of h.log) x.t = -99;
    }
    this._clearWarn();
    this.fx.reset();
    this.hazards.reset();
    this.game.world?.forest?.ambience?.reset?.();
    this.game.world?.clearPushers?.(1, 10);
    this.object3d.visible = true;
    this._poseSleep();
    this.rig.phase = 1;
    this.rig.snap();
    this.rig.update(1 / 60);
    this._refresh();
    this.emitPosture(true);
  }

  update(dt) {
    if (!(dt > 0)) return;
    this._step(Math.min(dt, 0.05));
  }

  // ---------------------------------------------------------------- posture
  addPosture(amount) {
    if (this.broken || !(amount > 0) || !this.alive) return;
    this.posture = Math.min(this.maxPosture, this.posture + amount);
    this.postureTimer = 0;
    this.emitPosture();
    if (this.posture >= this.maxPosture && this.state !== 'sleeping' && this.state !== 'waking') this._requestBreak = true;
  }
  emitPosture(force = false) {
    const p = this.posture;
    if (!force && Math.abs(p - this._postureSent) < 1 && !(p === 0 && this._postureSent !== 0)) return;
    this._postureSent = p;
    this.emit('dragon:posture', { posture: p, max: this.maxPosture });
  }
  _updatePosture(dt) {
    this.postureTimer += dt;
    if (this.broken || this._requestBreak || this.posture <= 0) return;
    if (this.postureTimer > POSTURE.regenDelay) {
      this.posture = Math.max(0, this.posture - POSTURE.regenRate * dt);
      this.emitPosture();
    }
  }

  /** Phase `n` begins (its bellow's start): that phase's posture meter, emptied. */
  enterPhase(n) {
    n = clamp(Math.round(Number(n) || 2), 1, 3);
    this.phase = n;
    this.rig.phase = n;
    this.pendingPhase = 0;
    this._requestBreak = false;
    this.maxPosture = perPhase(TUNING.posture.max, n);
    this.posture = 0;
    this.postureTimer = 0;
    this.emitPosture(true);
    // the moves this phase unlocks come in one by one (a staggered first cooldown)
    let k = 0;
    for (const [name, def] of Object.entries(ATTACKS)) {
      if (def.phase === n && name !== 'surge' && name !== 'bellow') this.cooldowns[name] = Math.max(this.cooldowns[name] ?? 0, 2 + 2.5 * k++);
    }
    const gate = this.nextPhaseHp;
    if (gate > 0 && this.hp <= gate) this.pendingPhase = n + 1;
  }

  // ---------------------------------------------------------------- actions
  /** Start action `name` (a move of ATTACKS or a special: intro, bellow, lurch, recoil, plunged, broken,
   *  stagger, death). Replaces the running one (its end() runs with `cancelled`). */
  start(name, opts = {}) {
    const script = MOVES[name] ?? SPECIAL[name];
    if (!script) return false;
    const prev = this.act;
    if (prev) {
      prev.cancelled = true;
      try {
        (MOVES[prev.name] ?? SPECIAL[prev.name])?.end?.(this, prev);
      } catch (err) {
        console.error('[colossus] end failed', err);
      }
    }
    const a = {
      name, def: ATTACKS[name] ?? {}, T: 0, dur: 1, phase: 'windup', side: 1, beats: [], cur: null, chain: 0, hitDone: false,
      src: this.game.world?.destructibles?.swing?.() ?? -1, cancelled: false, opts, s: {},
    };
    this.act = a;
    try {
      script.start(this, a);
    } catch (err) {
      console.error('[colossus] start failed', err);
      this.act = null;
      return false;
    }
    if (ATTACKS[name] && name !== 'bellow') {
      this.lastMove = name;
      this.cooldowns[name] = perPhase(ATTACKS[name].cd ?? 3, this.phase);
      this.emit('dragon:windup', { name });
    }
    return true;
  }

  /** A beat: one hit of a move (its tell at `at`, its impact at `impact`, s from the action's start). */
  beat(a, o) {
    const b = { at: 0, impact: 1, tell: TELL.NORMAL, flare: false, part: 'hand', side: a.side, hit: a.beats.length, attack: a.name, told: false, flashed: false, done: false, dynamic: false, hazard: false, ...o };
    b.impactIn = Math.max(0.05, b.impact - b.at);
    a.beats.push(b);
    return b;
  }

  /** The striking part's world position (cues and flashes). */
  partPos(b, out) {
    const P = this.rig.pt;
    if (b.part === 'head' || b.part === 'maw') return out.copy(P.maw);
    if (b.part === 'front' && b.x !== undefined) return out.set(b.x, b.y ?? 1.2, b.z);
    if (b.side === 2) return out.lerpVectors(P.palm[0], P.palm[1], 0.5);
    const i = b.side === -1 || b.side === 0 ? 0 : 1;
    return out.copy(b.part === 'tips' ? P.tips[i][1] : P.palm[i]);
  }

  announceTell(a, b) {
    b.told = true;
    const p = this.partPos(b, this._pt);
    this.emit('combat:tell', { source: 'dragon', attack: b.attack, tell: b.tell, impactIn: b.impactIn, x: p.x, z: p.z, flare: isFlare(b.tell, b.flare), ...(b.hazard ? { hazard: true } : null) });
    if (b.tell === TELL.BLACK) this.emit('combat:charge', { source: 'dragon', attack: b.attack, dur: b.impactIn - TUNING.flashLead, x: p.x, z: p.z });
  }

  /** The timing cue, flashLead s before the impact: combat:flash and the flare / glint at the part. */
  flashTell(a, b) {
    b.flashed = true;
    const p = this.partPos(b, this._pt);
    const flare = isFlare(b.tell, b.flare) && !b.hazard;
    this.emit('combat:flash', { source: 'dragon', attack: b.attack, tell: b.tell, x: p.x, y: p.y, z: p.z, flare, ...(b.hazard ? { hazard: true } : null) });
    this.stats.cues++;
    if (this.stats.cueTimes.length < 2000) this.stats.cueTimes.push(this.time, b.tell === TELL.BLUE || b.tell === TELL.NORMAL ? 1 : 2);
    if (b.hazard) this.fx.hazardFlash(b.tell, p.x, p.y, p.z, 1.6);
    else this.fx.tellFlash(b.tell, p.x, p.y, p.z, 1.8, !!b.flare);
    if (dodgeOnly(b.tell) && !b.hazard) {
      this._warnAt = this.time;
      this._warnTell = b.tell;
    }
  }

  /**
   * Deal a blow to the hero with the beat's tell (`b`), from the striking part `from`. One result per
   * beat: any answer consumes it. Returns the player's RESULT; a parry calls onParried.
   */
  hitPlayer(a, b, o) {
    const p = this.game.player;
    if (!p?.takeHit || p.alive === false || !this.alive) return RESULT.IGNORED;
    if (b && b.done) return RESULT.IGNORED;
    const def = a?.def ?? {};
    const tell = o.tell ?? b?.tell ?? def.tell ?? TELL.NORMAL;
    const D = tellDefaults(tell);
    const parryable = o.parryable ?? def.parryable ?? D.parryable;
    const blockable = o.blockable ?? def.blockable ?? D.blockable;
    const from = o.from ?? { x: this.position.x, z: this.position.z };
    const pt = o.point ?? from;
    this._hitPt.set(pt.x, pt.y ?? 1.5, pt.z);
    if (a) a.cur = b;
    const string = !!def.string;
    const last = !string || !b || b.hit >= a.beats.length - 1 || (!!b.flare && tell === TELL.BLUE);
    let r;
    try {
      r = p.takeHit({
        damage: (o.damage ?? 0) * (TUNING.damageScale ?? 1),
        from: { x: from.x, z: from.z },
        knockback: o.knockback ?? 0,
        knockdown: !!o.knockdown,
        kind: o.kind ?? 'hit',
        tell, parryable, blockable,
        attack: o.attack ?? a?.name ?? 'hit',
        attacker: this,
        plunge: o.plunge ?? def.plunge,
        perfect: o.perfect,
        last,
        flare: !!b?.flare && tell === TELL.BLUE,
        melee: o.melee ?? true,
      });
    } catch (err) {
      console.error('[colossus] player.takeHit failed', err);
      return RESULT.IGNORED;
    }
    if (b && r && r !== RESULT.IGNORED) b.done = true;
    if (a && (r === RESULT.HIT || r === RESULT.BLOCKED)) a.chain = 0;
    if (r === RESULT.PARRIED) this.onParried({ attack: o.attack ?? a?.name, tell });
    return r ?? RESULT.IGNORED;
  }

  /** The hero inside a disc of radius r at (x, z) (his body's radius added). */
  heroIn(x, z, r) {
    const p = this.game.player?.position;
    if (!p) return false;
    const pr = this.game.player?.radius ?? 0.45;
    return Math.hypot(p.x - x, p.z - z) <= r + pr && (p.y ?? 0) < 2.5;
  }

  /** Debug: an attack sphere tested this frame (Lab hitbox overlay). */
  markHitbox(x, y, z, r) {
    if (this._atkN >= MAX_ATK || !Number.isFinite(x + y + z + r)) return;
    const b = this._atk[this._atkN++];
    b.x = x;
    b.y = y;
    b.z = z;
    b.r = r;
  }

  emit(name, data) {
    this.game.events?.emit(name, data);
  }

  /** Death: the hands rake the rim as they slip, the head falls back, the body lets go letter by letter. */
  die() {
    if (this.state === 'dying' || this.state === 'dead') return;
    this.hp = 0;
    this.broken = false;
    this.state = 'dying';
    this._clearWarn();
    this.hazards.reset();
    this.emit('dragon:death');
    this.start('death');
  }

  finishDeath() {
    this.state = 'dead';
    this.dissolve = 1;
    this._letGo.x = 0;
    this.act = null;
    this.object3d.visible = false;
    this.hurtSpheres.length = 0;
    this.bodyCircles.length = 0;
    this.frameSpheres.length = 0;
    this.game.world?.clearPushers?.(1, 10);
    this.emit('dragon:dead');
  }

  setShadowCasting(on) {
    for (const a of this.model.arms) {
      for (const o of [a.hand, a.fore]) o.traverse((m) => (on ? m.layers.enable(LAYER_CASTER) : m.layers.disable(LAYER_CASTER)));
    }
    this.model.head.traverse((m) => (on ? m.layers.enable(LAYER_CASTER) : m.layers.disable(LAYER_CASTER)));
  }

  // ---------------------------------------------------------------- frame
  _sense(dt) {
    const p = this.game.player?.position, s = this.sense;
    if (!p || !Number.isFinite(p.x + p.z)) return;
    if (s.has && dt > 0) {
      const vx = (p.x - s.lx) / dt, vz = (p.z - s.lz) / dt;
      if (vx * vx + vz * vz < 400) {
        const k = 1 - Math.exp(-8 * dt);
        s.vx += (vx - s.vx) * k;
        s.vz += (vz - s.vz) * k;
      } else s.vx = s.vz = 0;
    }
    s.lx = s.x = p.x;
    s.lz = s.z = p.z;
    s.has = true;
    s.depth = p.z - rimZ(p.x);
    s.deepT = s.depth > TUNING.director.deep ? s.deepT + dt : 0;
  }

  /** The poses when nothing else asks: both hands on the rim, the head looking over it (or lying on it). */
  _basePose(dt) {
    const R = this.rig, s = this.sense, lean = this.phase >= 2 ? 0.3 : 0;
    for (const h of this.hands) {
      const rh = R.hands[h.i];
      if (h.reelT > 0) {
        poseReel(rh, h.s);
        h.mode = 'reel';
      } else if (this.broken) {
        // both hands slip: below the rim, clawing at it
        poseGrip(rh, h.s, 0);
        rh.tgt.y -= 2.6;
        rh.tgt.z -= 0.8;
        rh.curlT = 1.1;
        h.mode = 'slip';
      } else {
        poseGrip(rh, h.s, lean);
        h.mode = 'grip';
      }
    }
    const want = clamp(s.x, -POSE.loom.follow, POSE.loom.follow);
    this.headX = damp(this.headX, Number.isFinite(want) ? want : 0, 1.2, dt);
    poseHead(R.head, this.headDownT > 0 ? 'down' : 'loom', this.headX);
    R.swayT.set(0, 0, 0);
  }

  _poseSleep() {
    const R = this.rig;
    for (const h of this.hands) {
      const rh = R.hands[h.i];
      rh.tgt.set(h.s * 13, SHELF.seaY - 6, SHELF.edgeZ - 14);
      rh.fwdT.set(0, -0.2, 1);
      rh.upT.set(0, 1, 0);
      rh.curlT = 0.5;
      h.mode = 'sea';
    }
    R.head.tgt.set(0, SHELF.seaY - 4, SHELF.edgeZ - 10);
    R.head.fwdT.set(0, 0, 1);
    R.head.jawT = 0;
    R.swayT.set(0, 0, 0);
    R.sinkT = SLEEP.sink;
  }

  _step(dt) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * TUNING.flashDecay);
    this._updatePosture(dt);
    this._atkN = 0;
    if (this.state === 'dead') {
      this.fx.update(dt);
      return;
    }
    this._sense(dt);
    if (this.state === 'sleeping') {
      this._poseSleep();
      if (this.wakeFallback > 0) {
        this.wakeFallback -= dt;
        if (this.wakeFallback <= 0) this.startIntro();
      }
    } else {
      for (const h of this.hands) if (h.reelT > 0) h.reelT -= dt;
      if (this.headDownT > 0) this.headDownT -= dt;
      for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
      this._basePose(dt);
      this._think(dt);
    }
    this._runAction(dt);
    this._applyKnock(dt);
    if (this.state === 'dead') return;
    this.rig.update(dt);
    this._refresh();
    this._wreck(dt);
    this.hazards.update(dt);
    this.reward?.update(dt);
    this.fx.update(dt);
    this._applyMaterials(dt);
  }

  /** Between moves: a pending phase change, a pending break, the director's next pick. */
  _think(dt) {
    if (this.state === 'dying' || this.state === 'waking') return;
    const a = this.act, busy = a && NO_CANCEL.has(a.name);
    if (this._requestBreak && !busy && this.alive) {
      this._requestBreak = false;
      this.start('broken');
      return;
    }
    if (this.pendingPhase > this.phase && this.aiEnabled && !busy && (!a || a.name === 'lurch' || a.phase !== 'active')) {
      const n = Math.min(3, this.phase + 1);
      this.start('bellow', { n });
      return;
    }
    this.director.tick(dt);
    if (a) return;
    if (this.state !== 'combat' || !this.aiEnabled) return;
    this.gapT -= dt;
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      if (this.gapT > 0.25 && q !== 'surge' && q !== 'breath') this.gapT = 0.25;
      if (MOVES[q]) this._nextQueued = q;
    }
    if (this.gapT > 0) return;
    let name = this._nextQueued, opts = {};
    this._nextQueued = null;
    if (!name) {
      name = this.director.pick();
      opts = this._pickOpts ?? {};
    }
    if (name) this.start(name, opts);
    else this.gapT = 0.3;
  }

  _runAction(dt) {
    const a = this.act;
    if (!a) return;
    a.T += dt;
    const lead = TUNING.flashLead;
    for (const b of a.beats) {
      if (!b.told && a.T >= b.at) this.announceTell(a, b);
      if (!b.flashed && !b.dynamic && b.told && a.T >= b.impact - lead) this.flashTell(a, b);
    }
    const script = MOVES[a.name] ?? SPECIAL[a.name];
    try {
      script.update(this, a, dt);
    } catch (err) {
      console.error('[colossus] action failed', a.name, err);
      a.T = a.dur;
    }
    if (this.act === a && a.T >= a.dur) {
      try {
        script.end?.(this, a);
      } catch (err) {
        console.error('[colossus] end failed', err);
      }
      if (this.act === a) {
        this.act = null;
        if (ATTACKS[a.name] && a.name !== 'bellow') this.director.onEnd(a);
      }
    }
  }

  /** A deflected hit's knock-back: its hand thrown up and back for TUNING.deflectKnock.time s. */
  _applyKnock(dt) {
    const D = TUNING.deflectKnock;
    for (const h of this.hands) {
      const K = h.knock;
      if (K.t < 0) continue;
      K.t += dt;
      if (K.t >= D.time) {
        K.t = -1;
        continue;
      }
      const f = Math.sin((Math.PI * K.t) / D.time), rh = this.rig.hands[h.i];
      rh.tgt.y += D.dist * 1.5 * f;
      rh.tgt.z -= D.dist * f;
      rh.k = 14;
    }
  }

  /** The parts in play this frame: hurt spheres, body circles, the camera's frame spheres, the pushers. */
  _refresh() {
    const P = this.rig.pt, H = this.hurtSpheres, C = this.bodyCircles, F = this.frameSpheres, M = TUNING.partMult;
    H.length = C.length = F.length = 0;
    if (!this.alive || this.state === 'sleeping') return;
    let n = 0, c = 0;
    const put = (v, r, part, side) => {
      if (n >= MAX_HURT || !Number.isFinite(v.x + v.y + v.z)) return;
      const h = this._hurt[n++];
      h.x = v.x;
      h.y = v.y;
      h.z = v.z;
      h.r = r;
      h.part = part;
      h.mult = M[part] ?? 1;
      h.side = side;
      H.push(h);
    };
    const circ = (x, z, r) => {
      if (c >= this._circ.length || !Number.isFinite(x + z)) return;
      const k = this._circ[c++];
      k.x = x;
      k.z = z;
      k.r = r;
      C.push(k);
    };
    for (const h of this.hands) {
      const i = h.i, T = P.tips[i];
      if (h.mode === 'grip') {
        for (let k = 0; k < 4; k++) if (T[k].y < 2.2) put(T[k], 0.85, 'finger', i);
        circ((T[0].x + T[1].x) / 2, (T[0].z + T[1].z) / 2, 1.2);
        circ((T[2].x + T[3].x) / 2, (T[2].z + T[3].z) / 2, 1.2);
      } else if (h.mode === 'planted') {
        put(P.palm[i], 2.0, 'hand', i);
        if (P.wrist[i].y < 3) put(P.wrist[i], 1.3, 'wrist', i);
        put(T[1], 0.85, 'finger', i);
        put(T[2], 0.85, 'finger', i);
        circ(P.palm[i].x, P.palm[i].z, 2.2);
      }
    }
    if (this.headDownT > 0 && this.state !== 'waking') {
      put(P.head, 2.8, 'head', -1);
      circ(P.chin.x, Math.max(P.chin.z, rimZ(P.chin.x) - 0.4), 2.4);
    }
    // what the camera frames (ADR-142): the acting part from its windup to the end of its recovery, the
    // head while it is down, otherwise the hand nearer the hero
    let f = 0;
    const frame = (v, r, part) => {
      if (f >= this._frame.length || !Number.isFinite(v.x + v.y + v.z)) return;
      const o = this._frame[f++];
      o.x = v.x;
      o.y = v.y;
      o.z = v.z;
      o.r = r;
      o.part = part;
      F.push(o);
    };
    const a = this.act;
    if (a?.frame) a.frame(this, frame);
    else if (a && (a.side === 0 || a.side === 1)) frame(P.palm[a.side], 2.4, 'hand');
    else if (a && a.side === 2) {
      frame(P.palm[0], 2.4, 'hand');
      frame(P.palm[1], 2.4, 'hand');
    }
    if (this.headDownT > 0) frame(P.head, 2.8, 'head');
    if (!F.length) {
      const s = this.sense, i = s.x < 0 ? 0 : 1;
      frame(this.hands[i].mode === 'grip' ? P.tips[i][1] : P.palm[i], 2.2, 'hand');
    }
    // the striking part kept on screen through its windup, the hero never cropped for it (cameraRig.keep)
    const rig = this.game.cameraRig, hp = this.game.player?.position;
    if (a && a.phase !== 'recover' && this.state === 'combat' && hp && typeof rig?.keep === 'function') {
      rig.keep(hp.x, (hp.y ?? 0) + 1.1, hp.z, 1.6, true);
      for (const o of F) rig.keep(o.x, o.y, o.z, Math.min(o.r, 2.6), false);
    }
    // grass trample: the hands and the chin
    const W = this.game.world;
    if (W?.setPusher) {
      for (let i = 0; i < 2; i++) {
        const p = this.hands[i].mode === 'grip' ? P.tips[i][1] : P.palm[i];
        if (p.y < 2) W.setPusher(1 + i, p.x, p.y, p.z, 2.2);
        else W.setPusher(1 + i, 0, 0, 0, 0);
      }
      if (this.headDownT > 0) W.setPusher(3, P.chin.x, P.chin.y, P.chin.z, 2.4);
      else W.setPusher(3, 0, 0, 0, 0);
    }
  }

  /**
   * The body against the world (ADR-107's trample, its shape): a hand or the head moving faster than
   * TUNING.world.body.min low over the shelf sweeps what it passes through. Incidental blows.
   */
  _wreck(dt) {
    const D = this.game.world?.destructibles;
    if (!D?.sweepRec || !(dt > 0) || this.state === 'sleeping') return;
    const B = TUNING.world.body, P = this.rig.pt;
    const st = (this._tr ??= {
      prev: new Float32Array(9), ready: false,
      o: { kind: 'blunt', by: 'boss', dx: 0, dz: 0, y: 0, incidental: true, brush: true, spare: null },
      w: { ax: 0, az: 0, bx: 0, bz: 0, r: 1, power: 0 },
    });
    const pts = [P.palm[0], P.palm[1], P.chin];
    for (let i = 0; i < 3; i++) {
      const v = pts[i], k = i * 3;
      if (st.ready) {
        const dx = v.x - st.prev[k], dy = v.y - st.prev[k + 1], dz = v.z - st.prev[k + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz), speed = d / dt;
        if (d < 6 && speed > B.min && v.y < B.y && Number.isFinite(speed)) {
          const w = st.w, o = st.o;
          w.ax = st.prev[k];
          w.az = st.prev[k + 2];
          w.bx = v.x;
          w.bz = v.z;
          w.r = i === 2 ? 2.2 : 1.8;
          w.power = Math.min(B.max, (speed - B.min) * B.per);
          o.dx = dx;
          o.dz = dz;
          o.y = v.y;
          if (w.power > 0.04) D.sweepRec(w, o);
        }
      }
      st.prev[k] = v.x;
      st.prev[k + 1] = v.y;
      st.prev[k + 2] = v.z;
    }
    st.ready = true;
  }

  /** Crack glow, the hit flash, the dissolve, the red / black warn, the throat's charge. */
  _applyMaterials(dt) {
    const m = this.model.mats, G = this.model.glow;
    this.glow = damp(this.glow, this.state === 'dying' ? 0.85 : this.phase >= 3 ? 0.6 : this.phase >= 2 ? 0.3 : 0, 1.2, dt);
    const t = this.time, ember = 0.82 + 0.18 * Math.sin(t * 1.3) * Math.sin(t * 0.53 + 1.1);
    const body = this.glow * (0.85 + 0.15 * Math.sin(t * 2.1));
    const throat = this.throat, flash = this.flash * 0.55, warn = this._updateWarn();
    this._riseHeat(dt);
    const lg = this._letGo;
    if (this.dissolve > 0 && this.state === 'dying') {
      if (!(lg.x > 0)) this._letGoSpan(lg);
      lg.x = this.dissolve;
      this._letGoShed(dt);
    } else lg.x = 0;
    for (const k in m) {
      const u = m[k].uniforms, g = G[k];
      if (g) {
        const r = u.uGlowRise, c = g[2] * throat;
        const v = g[0] * ember + g[1] * body + (r ? 0 : c);
        u.uGlow.value = Number.isFinite(v) ? v : 0;
        if (r) r.value = Number.isFinite(c) ? c : 0;
      }
      u.uFlash.value = flash;
      u.uDissolve.value = this.dissolve;
      const w = u.uWarn?.value;
      if (w?.isVector4) w.set(this.warnRGB[0], this.warnRGB[1], this.warnRGB[2], warn);
    }
    if (m.eye) {
      const awake = this.state === 'sleeping' ? 0 : 1;
      m.eye.uniforms.uGlow.value = awake * (0.8 + 0.4 * this.glow);
      m.eye.uniforms.uInkGlow.value = awake * 1.1;
    }
  }

  /** The drowned light climbing the throat through the breath's windup (the wyrm's _riseHeat, its shape). */
  _riseHeat(dt) {
    const H = this._heat, F = this._heatFrom, th = this.throat;
    if (!(dt > 0)) return;
    const rising = th > this._throatPrev + 1e-5 && this.alive;
    this._throatPrev = th;
    if (rising) this._heatS = Math.max(Math.pow(th, 0.85), this._heatW < 0.05 ? 0 : this._heatS);
    this._heatW = damp(this._heatW, rising ? 1 : 0, rising ? 14 : 5, dt);
    if (!(this._heatW > 0.01)) {
      H.w = F.w = 0;
      return;
    }
    const N = this.rig.pt.neck, M = this.rig.pt.maw, s = clamp(this._heatS, 0, 1) * 4;
    const k = Math.min(3, Math.floor(s)), f = s - k;
    const a = N[k], b = k < 3 ? N[k + 1] : M;
    const v = this._tmp2.lerpVectors(a, b, f);
    if (Number.isFinite(v.x + v.y + v.z)) {
      H.set(v.x, v.y, v.z, this._heatW);
      F.set(N[0].x, N[0].y, N[0].z, this._heatW * th);
    } else H.w = F.w = 0;
  }

  _letGoSpan(lg) {
    const g = this.game, cam = g.camera, P = g.pipeline, v = this._tmp;
    const cw = P?.artCell?.x, ch = P?.artCell?.y, W = P?.width, H = P?.height;
    lg.y = 30;
    lg.z = 60;
    lg.w = 140;
    if (!cam?.isCamera || !(cw > 0 && ch > 0 && W > 0 && H > 0)) return;
    v.copy(this.position).project(cam);
    const x0 = v.x, y0 = v.y;
    if (!Number.isFinite(x0 + y0)) return;
    let top = 0, bot = 0, wide = 0;
    const pts = [this.rig.pt.head, this.rig.pt.palm[0], this.rig.pt.palm[1], this.rig.pt.elbow[0], this.rig.pt.elbow[1], this.rig.pt.neck[1], this.rig.pt.root];
    for (const p of pts) {
      v.copy(p).project(cam);
      if (!Number.isFinite(v.x + v.y)) continue;
      const dy = ((v.y - y0) * 0.5 * H) / ch, dx = ((v.x - x0) * 0.5 * W) / cw;
      top = Math.max(top, dy);
      bot = Math.min(bot, dy);
      wide = Math.max(wide, Math.abs(dx));
    }
    lg.y = Math.ceil(top) + 12;
    lg.z = Math.ceil(top - bot) + 24;
    lg.w = Math.ceil(wide) + 60;
  }

  _letGoShed(dt) {
    const g = this.game, shed = g.fx?.shed, cam = g.camera, P = g.pipeline, v = this._tmp, lg = this._letGo;
    const ch = P?.artCell?.y, H = P?.height;
    if (!shed || !cam?.isCamera || !(ch > 0 && H > 0) || !(dt > 0)) return;
    v.copy(this.position).project(cam);
    const y0 = v.y;
    if (!Number.isFinite(y0)) return;
    const pts = [this.rig.pt.head, this.rig.pt.palm[0], this.rig.pt.palm[1], this.rig.pt.elbow[0], this.rig.pt.elbow[1]];
    for (const p of pts) {
      v.copy(p).project(cam);
      const at = letGoRow(((v.y - y0) * 0.5 * H) / ch, lg);
      if (lg.x > at - 0.1 && lg.x < at + LET_GO.window + 0.06) shed.stream(dt, p.x, p.y, p.z, 2, this.shed.stream ?? 16, this.shed);
    }
  }

  /** The red / black glow on the body: a spike on a red cue that decays; a black blow's charge darkens. */
  _updateWarn() {
    let w = 0, black = false;
    const a = this.act;
    if (a && this.alive) {
      for (const b of a.beats) {
        if (!b.told || b.flashed || b.tell !== TELL.BLACK) continue;
        const k = clamp((a.T - b.at) / Math.max(0.05, b.impactIn - TUNING.flashLead), 0, 1);
        const v = (WARN_BLACK.from + (WARN_BLACK.to - WARN_BLACK.from) * k) * 0.16;
        if (v > w) {
          w = v;
          black = true;
        }
      }
    }
    if (this._warnAt >= 0) {
      const W = this._warnTell === TELL.BLACK ? WARN_BLACK : WARN, age = this.time - this._warnAt;
      if (!(age >= 0) || age >= W.decay) this._warnAt = -1;
      else {
        const f = 1 - age / W.decay, v = W.spike * f * f * (this._warnTell === TELL.BLACK ? 0.16 : 0.6);
        if (v > w) {
          w = v;
          black = this._warnTell === TELL.BLACK;
        }
      }
    }
    this.warn = Number.isFinite(w) ? w : 0;
    this.warnRGB = black ? WARN_BLACK.color : WARN.color;
    return this.warn;
  }

  _clearWarn() {
    this.warn = 0;
    this._warnAt = -1;
    for (const k in this.model.mats) {
      const w = this.model.mats[k].uniforms?.uWarn?.value;
      if (w?.isVector4) w.w = 0;
    }
  }
}

/** Lab / dev API (the generic shape every boss implements; ARCHITECTURE.md), plus the colossus's own. */
function createDebug(d) {
  const alive = () => d.alive;
  const dbg = {
    abilities() {
      const out = [];
      for (const name in ATTACKS) {
        if (name === 'bellow') continue;
        const t = ATTACKS[name];
        out.push({ name, label: t.label ?? name, tell: t.tell ?? t.hits?.[t.hits.length - 1]?.tell ?? TELL.NORMAL, phase: t.phase ?? 1 });
      }
      return out;
    },
    /** Force a move now (wakes / starts the fight first). */
    trigger(name) {
      if (!MOVES[name] || !alive()) return false;
      if (d.state === 'sleeping' || d.state === 'waking') dbg.startFight();
      d.queued = null;
      d.start(name, { forced: true });
      return true;
    },
    setAI(enabled) {
      d.aiEnabled = !!enabled;
      if (!enabled) d.queued = null;
      return d.aiEnabled;
    },
    get aiEnabled() {
      return d.aiEnabled;
    },
    currentAction() {
      return d.act;
    },
    wake() {
      if (d.state !== 'sleeping') return false;
      d.startIntro();
      return true;
    },
    /** Skip the intro: risen, hands on the rim, combat, 'dragon:introDone'. */
    startFight() {
      if (!alive()) return false;
      if (d.state !== 'sleeping' && d.state !== 'waking') return true;
      d.act = null;
      d.state = 'combat';
      d.rig.sinkT = 0;
      d._basePose(1 / 60);
      d.rig.snap();
      d.cooldowns.breath = ATTACKS.breath.open;
      d.gapT = 1.0;
      d.emit('dragon:introDone');
      return true;
    },
    phase2() {
      if (!alive()) return false;
      if (d.state === 'sleeping' || d.state === 'waking') dbg.startFight();
      d.start('bellow', { n: 2 });
      return true;
    },
    phase3() {
      if (!alive()) return false;
      if (d.state === 'sleeping' || d.state === 'waking') dbg.startFight();
      d.start('bellow', { n: 3 });
      return true;
    },
    stagger() {
      if (!alive() || d.state === 'sleeping' || d.state === 'waking') return false;
      d.start('stagger');
      return true;
    },
    postureBreak() {
      if (!alive()) return false;
      if (d.state === 'sleeping' || d.state === 'waking') dbg.startFight();
      d.posture = d.maxPosture;
      d.start('broken');
      return true;
    },
    kill() {
      if (!alive()) return false;
      d.hp = 0;
      d.die();
      return true;
    },
    reset() {
      d.reset();
      return true;
    },
    setHp(fraction) {
      if (!alive()) return false;
      const f = clamp(Number(fraction), 0, 1);
      if (!Number.isFinite(f)) return false;
      d.hp = Math.round(d.maxHp * f);
      if (d.hp <= 0) return dbg.kill();
      const gate = d.nextPhaseHp;
      if (gate > 0 && d.hp <= gate) d.pendingPhase = d.phase + 1;
      return true;
    },
    hitboxes() {
      const out = d._hbOut;
      out.length = 0;
      for (let i = 0; i < d.hurtSpheres.length && i < d._hbHurt.length; i++) {
        const s = d.hurtSpheres[i], b = d._hbHurt[i];
        b.x = s.x;
        b.y = s.y;
        b.z = s.z;
        b.r = s.r;
        b.part = s.part;
        out.push(b);
      }
      for (let i = 0; i < d._atkN; i++) out.push(d._atk[i]);
      return out;
    },
    // ---- the colossus's own
    /** The look of the NEXT build ('a' | 'b' | 'c'; a reload shows it: ?tideLook=). No argument: the one in use. */
    look(k) {
      if (k !== undefined) setTideLook(String(k));
      return tideLookId();
    },
    /** Lay the head on the rim for `sec` s (it can be cut there). */
    exposeHead(sec = 3) {
      if (!alive() || d.state === 'sleeping') return false;
      if (d.state === 'waking') dbg.startFight();
      d.headDownT = Math.max(d.headDownT, Number(sec) || 3);
      return true;
    },
    /** A hand lets go (the lurch): side 0 / 'L' the left, 1 / 'R' the right. */
    gripBreak(side = 0) {
      if (!alive()) return false;
      if (d.state === 'sleeping' || d.state === 'waking') dbg.startFight();
      const i = side === 1 || side === 'R' || side === 'r' ? 1 : 0;
      return d.gripBreak(i);
    },
    /** The Lab's extra buttons for this boss (dev/lab.js FIGHT): [{ label, method, args, title }]. */
    labButtons() {
      return [
        { label: 'Expose head', method: 'exposeHead', args: [3], title: 'lay the head on the rim for 3 s (it can be cut)' },
        { label: 'Grip break L', method: 'gripBreak', args: [0], title: 'the left hand lets go: the lurch' },
        { label: 'Grip break R', method: 'gripBreak', args: [1], title: 'the right hand lets go: the lurch' },
        { label: 'Tidebreath', method: 'tidebreath', args: [], title: 'the reward technique (Lab only until the technique system exists, ADR-143)' },
        // the three looks wait for the owner's pick: no row in the Lab's LOOKS yet (it lists picks only)
        ...['a', 'b', 'c'].map((k) => ({ label: `Look ${k}${k === tideLookId() ? ' *' : ''}`, method: 'lookReload', args: [k], title: `the colossus in look ${k} (?tideLook=${k}; a reload)` })),
      ];
    },
    /** Reload the page with ?tideLook=k (the Lab opens again). */
    lookReload(k) {
      try {
        const u = new URL(globalThis.location.href);
        u.searchParams.set('tideLook', String(k));
        u.searchParams.set('lab', '');
        globalThis.location.assign(u.toString());
        return true;
      } catch {
        return false;
      }
    },
    /** The reward: the hero casts Tidebreath (player/techniques/tideBreath.js) along his facing. The cast
     *  is ticked by this boss's frame until the technique system exists (ADR-143). */
    tidebreath() {
      if (!d.game.player?.alive) return false;
      d.reward ??= new TideBreathCast(d.game);
      return d.reward.start();
    },
  };
  return dbg;
}

export { CONFIG };
