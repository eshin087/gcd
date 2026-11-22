import * as THREE from 'three';
import { clamp } from '../../../core/math.js';
import { TELL, RESULT } from '../../../combat/rules.js';
import { BLOW } from '../../../world/breakTuning.js';
import { Duelist } from '../duelist/duelist.js';
import { DuelBrain } from '../duelist/brain.js';
import { AshMoveFx } from '../ashDisciple/moveFx.js';
import { MARSHAL_LOADOUT, BLADES, LANCE, buildHusk } from './gear.js';
import { bodyPoses } from './poses.js';
import { MOVES, MOVE_NAMES, CLIP, CLIPS_BY_BODY, TRANSITIONS, COUNTER, STREAK, realise } from './moves.js';
import { TUNING } from './tuning.js';
import { MarshalFx } from './fx.js';
import { LINKS } from './links.js';
import { Plates, PLATE_NAMES } from './plates.js';

// The Clockwork Marshal (COMBAT.md → "The Clockwork Marshal"; ADR-135): Gongshu Yan, an old
// artificer-marshal, in a bronze war-suit with a fire lance, who fills the boss slot of the Brazen Foundry
// (levels/foundry.js). ONE duelist, ONE rig, TWO bodies (a second actor swapped into the boss slot was
// rejected: the player, camera, HUD and audio hold game.dragon's position, object3d and batch):
//   - phases 1 - 3: the SUIT, drawn at TUNING.suit.scale on one bar (gates at 66 % and 33 %). It has no
//     sword guard: its five PLATES are its guard (plates.js): a blow meets the plate on the side it comes
//     from; three ways strip one (cuts on that side, a deathblow, a returned Fire Lance bolt) and each
//     loss changes the fight (TUNING.plates.<name>.lost). A transition's impact sheds the least-sound
//     plates to TUNING.plates.minOff; the bar empty blows off every plate left.
//   - the hand-over: the suit's bar empty breaks it; the deathblow (or a break left unanswered) starts
//     the `eject`: the husk stays kneeling where the suit knelt, the pilot climbs out of its hatch,
//     somersaults forward and lands in a red shock ring.
//   - phase 4: the PILOT, at TUNING.pilot.scale on a bar of her own, with the duelist's guard, counter and
//     flurry; at zero she breaks like the Lord's last form and the deathblow kills her.
// The body is picked per frame by pilot.form (1 suit, 2 pilot): the stance, the clips (MarshalBrain C),
// the meshes shown (gear.js groups), the drawn size (lean.scale), the hurt spheres' scale, the body
// circle, the blade's ends.

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const POSES = Object.freeze({
  loco: (p, A) => bodyPoses(A.player?.form ?? 1).duelLoco(p, A),
  duel: (p, A) => bodyPoses(A.player?.form ?? 1).duelClip(p, A),
});
const PILOT_PHASE_AT = Object.freeze([1]);
const HS_R = [0.2, 0.3, 0.3, 0.2, 0.2]; // the hurt spheres' radii (duelist.js _hs) before the body's scale
const BOLT_BLOW = Object.freeze({ kind: BLOW.BLAST, by: 'boss', fire: 1 });
const COVER_BLOW = Object.freeze({ kind: BLOW.BLAST, by: 'boss', y: 1.0 });

/** The kit, one per Marshal (its TUNING is this Marshal's own: the live body circle and footwork). */
function makeKit(holder) {
  const T = Object.create(TUNING);
  T.radius = TUNING.suit.radius;
  T.move = { ...TUNING.moveSuit };
  return {
    id: 'marshal',
    TUNING: T, MOVES, MOVE_NAMES, CLIP,
    // (the Fire Lance's extra bolt once the breastplate is gone: realise is told the plate)
    realise: (name, phase, rnd, opts) => realise(name, phase, rnd, holder.d?.plates?.off('breast') ? { ...(opts ?? {}), breastLost: true } : opts),
    transitions: TRANSITIONS,
    counterMove: () => COUNTER,
    streakMove: () => STREAK,
    maxPhase: 4,
    loadout: MARSHAL_LOADOUT,
    poses: POSES,
    blade: BLADES.suit,
    scale: TUNING.suit.scale,
  };
}

/** His mind: the duelist's, with each body's reaction clips; the suit raises no sword guard. */
class MarshalBrain extends DuelBrain {
  get C() {
    return CLIPS_BY_BODY[this.d.phase >= 4 ? 1 : 0];
  }
  set C(v) {} // (the base constructor assigns the kit's set: his is per body)
  guardUp() {
    return this.d.phase >= 4 ? super.guardUp() : false;
  }
  /** A beat with its own world power (`power`): the actor deals it (marshal.js onImpact), not this. */
  _worldBlow(b) {
    if (b?.def?.power && b.def.power !== 'sweep') return;
    super._worldBlow(b);
  }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class ClockworkMarshal extends Duelist {
  constructor(game) {
    const holder = {};
    super(game, makeKit(holder));
    holder.d = this;
  }

  /** The lance and the sabre stay on today's material (thinner than an art cell): dark bronze and iron. */
  _tint(M) {
    const fill = (m, r, g, b) => m?.uniforms?.uArtFill?.value.setRGB(r, g, b);
    fill(M.trim, 0.11, 0.095, 0.07);
    fill(M.blade, 0.2, 0.19, 0.17);
    fill(M.bladeTip, 0.24, 0.22, 0.2);
  }

  _makeFx() {
    return new MarshalFx(this);
  }
  _makeBrain() {
    return new MarshalBrain(this);
  }

  // ---------------------------------------------------------------- build
  _setup() {
    const r = this.rig;
    this.parts = []; // every body group (gear.js: userData.mBody / mPlate)
    r.root.traverse((o) => {
      if (o.userData?.mBody) this.parts.push(o);
    });
    this.handLance = r.root.getObjectByName('marshal:handLance') ?? null;
    // the body's own face (buildHero hangs it on the head before any gear): the pilot's; hidden in the suit
    this.face = r.head.children.filter((c) => c.isMesh && !c.userData.slot);
    this.plates = new Plates(this);
    this.body = 'suit';
    this.hurtK = TUNING.suit.game;
    this.drawScale0 = TUNING.suit.scale;
    this._changing = false;
    this._muzzle = new THREE.Vector3();
    this._handMuzzle = new THREE.Vector3();
    this._back = new THREE.Vector3();
    this._ptsOk = false;
    this._mortar = { left: 0, t: 0 };
    this._rs = 0x6d2b79f5; // the mortars' scatter (a stream of its own: never Math.random, never the fx's)
    this._sweepRec = { ax: 0, az: 0, bx: 0, bz: 0, r: 0.9, power: 0.6 };
    this._bodyBlow = { brush: true, by: 'boss', kind: BLOW.BLUNT, dx: 0, dz: 0, src: -1 };
    this._chargeBlow = { kind: BLOW.BLUNT, by: 'boss', dx: 0, dz: 0, src: -1 };
    this._lastX = NaN;
    this._lastZ = NaN;
    this.husk = null;
    try {
      this.husk = buildHusk(this.game.U);
      this.husk.visible = false;
      this.game.scene?.add?.(this.husk);
    } catch (err) {
      console.error('[marshal] husk build failed', err);
    }
    this._huskFire = new THREE.Vector3();
    const d = this;
    /** Lab: straight to phase n (1..4): the suit's phases with their plates gone (minOff), the pilot's. */
    this.debug.setForm = (n) => {
      n = clamp(Math.round(fin(Number(n), 1)), 1, 4);
      if (d.mode === 'dying' || d.mode === 'dead') return false;
      d.brain.startFight();
      if (n <= 3 && d.phase >= 4) {
        d.plates.reset();
        if (d.husk) d.husk.visible = false;
        d._setBody('suit');
      }
      d.enterPhase(n);
      if (n <= 3) {
        d.maxHp = TUNING.suit.hp;
        d.hp = d.maxHp * (n === 1 ? 1 : TUNING.phaseAt[n - 1]);
        d.plates.shedTo(TUNING.plates.minOff[n - 1]);
      }
      d._changing = false;
      d.position.y = 0;
      d.brain._toFoot(0.3);
      d.emit(`dragon:phase${n}`);
      return true;
    };
    this.debug.phase4 = () => {
      // the suit's bar emptied and broken: the deathblow's opening (or it ejects on its own)
      if (d.phase >= 4) return false;
      d.brain.startFight();
      d.hp = 0;
      d._onHpZero();
      return true;
    };
    /** Lab: tear plate `name` off now. */
    this.debug.shedPlate = (name) => (PLATE_NAMES.includes(name) && d.phase <= 3 ? d.plates.shed(name, 'lab') : false);
    /** Lab: the hand-over now (the suit ejects its pilot). */
    this.debug.eject = () => {
      if (d.phase >= 4 || d.mode === 'dying' || d.mode === 'dead') return false;
      d.brain.startFight();
      d.hp = 0;
      d.broken = false;
      d._changing = true;
      d.brain.pendingPhase = 0;
      return d.brain.startAct('eject', d.phase);
    };
    Object.defineProperty(this.debug, 'plates', { get: () => d.plates.state() });
    Object.defineProperty(this.debug, 'form', { get: () => d.phase });
    Object.defineProperty(this.debug, 'body', { get: () => d.body });
  }

  // ---------------------------------------------------------------- the two bodies
  /** Show one body: its meshes (the plates still on), its drawn size, hurt scale, body circle, blade. */
  _setBody(b) {
    const pilot = b === 'pilot', B = pilot ? TUNING.pilot : TUNING.suit;
    this.body = pilot ? 'pilot' : 'suit';
    this.hurtK = B.game;
    this.drawScale0 = B.scale;
    if (this.lean) this.lean.scale = B.scale;
    this.pilot.drawScale = B.scale;
    // (the hero's cut reads drawScale with drawnPoint: the spheres are already scaled by hurtK)
    this.drawScale = B.scale / Math.max(0.01, B.game);
    this.T.radius = B.radius;
    this.radius = B.radius;
    this._bc.r = B.radius;
    this.kit.blade = pilot ? BLADES.pilot : BLADES.suit;
    this._applyMove();
    this._showBody();
  }

  _showBody() {
    const suit = this.body === 'suit';
    for (const o of this.parts ?? []) {
      const P = o.userData.mPlate;
      o.visible = P ? suit && this.plates.on(P) : o.userData.mBody === this.body;
    }
    for (const m of this.face ?? []) m.visible = !suit;
  }

  /** The live footwork: the body's, with the flank plates' losses (turns and runs slower). */
  _applyMove() {
    const pilot = this.body === 'pilot', src = pilot ? TUNING.movePilot : TUNING.moveSuit;
    let k = 1;
    if (!pilot) for (const n of ['left', 'right']) if (this.plates?.off(n)) k *= TUNING.plates[n].lost.turn;
    const M = { ...src, turn: src.turn.map((v) => v * k), trackTurn: src.trackTurn.map((v) => v * k), run: src.run * k, sprint: src.sprint * k };
    this.T.move = M;
  }

  /** A plate came off (plates.js): what it changes. */
  onPlateLost(name) {
    if (name === 'left' || name === 'right') this._applyMove();
    this._showBody();
  }

  // ---------------------------------------------------------------- contract
  get lives() {
    return { total: 2, left: this.mode === 'dead' ? 0 : this.phase <= 3 ? 2 : 1 };
  }
  get phaseAt() {
    return this.phase >= 4 ? PILOT_PHASE_AT : this.T.phaseAt;
  }
  get nextPhaseHp() {
    if (this.phase >= 4) return 0;
    return super.nextPhaseHp;
  }

  reset() {
    if (this.plates) {
      this._changing = false;
      this._mortar.left = 0;
      this._ptsOk = false;
      this.plates.reset();
      if (this.husk) this.husk.visible = false;
      this.maxHp = TUNING.suit.hp;
      this._setBody('suit');
      this._lastX = this._lastZ = NaN;
    }
    super.reset();
    (this.moveFx ??= new AshMoveFx(this)).reset();
  }

  /** A blow on him. In the suit (phases 1 - 3) the plate on the side it came from takes it (plates.js). */
  takeHit(o = {}) {
    if (this._changing) return 0;
    if (!o || this.phase > 3 || this.mode === 'dying' || this.mode === 'dead' || o.exact || !(Number(o.damage) > 0) || !this.plates) return super.takeHit(o);
    const p = this.game.player?.position;
    const side = p ? this.plates.sideOf(p.x, p.z) : 'breast';
    const P = TUNING.plates;
    if (this.plates.on(side)) {
      const raw = Number(o.damage);
      o.damage = raw * P.soak;
      this._plateHit = true;
      let r = 0;
      try {
        r = super.takeHit(o);
      } finally {
        this._plateHit = false;
      }
      this.plates.strike(side, raw * (o.heavy ? P.heavyK : 1));
      return r;
    }
    if (side === 'back') o.damage = Number(o.damage) * P.backBare;
    return super.takeHit(o);
  }

  /** The helm off: every posture gain heavier. */
  addPosture(amount) {
    if (!(amount > 0)) return;
    const k = this.phase <= 3 && this.plates?.off('helm') ? TUNING.plates.helm.lost.posture : 1;
    super.addPosture(amount * k);
  }

  /** The bar is empty: he does not die, he breaks (the suit: its plates blow off, the hand-over waits). */
  _onHpZero() {
    this.hp = 0;
    if (this.phase <= 3) this.plates.blowAll();
    if (!this.broken) this._break();
  }

  /** A break nobody answered. The suit's bar empty: the hand-over starts anyway (the fight cannot stall);
   *  the pilot's: she rises with a little of the bar back. */
  endBreak() {
    this.broken = false;
    this.posture = 0;
    this.postureTimer = 0;
    if (this.hp <= 0) {
      if (this.phase <= 3) {
        this._changing = true;
        this.brain.pendingPhase = 4;
      } else {
        const S = TUNING.posture.spared;
        this.posture = this.maxPosture * S.posture;
        this.hp = this.maxHp * S.hp;
      }
    }
    this.emitPosture(true);
  }

  /** The deathblow. The suit: a plate torn off (the helm first) and the blow; with the bar empty it is
   *  the hand-over. The pilot: the duelist's (at zero it kills her). */
  onExecute(o = {}) {
    if (!this.broken || this.mode === 'dying' || this.mode === 'dead') return 0;
    if (this.phase >= 4) return super.onExecute(o);
    const dmg = Math.max(1, Math.round(fin(o.damage, TUNING.execution.damage)));
    const empty = this.hp <= 0;
    if (!empty) {
      const name = this.plates.on('helm') ? 'helm' : this.plates.weakest();
      if (name) this.plates.shed(name, 'execute');
      this._applyDamage(dmg);
    }
    this.flash = 1;
    this.emit('dragon:hurt', { damage: dmg, part: 'body', hp: this.hp, crit: true });
    this.emit('dragon:plunged', { execution: true, deathblow: empty || this.hp <= 0, form: this.phase });
    this.broken = false;
    this.posture = 0;
    this.emitPosture(true);
    this._cinematic('execution');
    const c = this._hs[1];
    this.fx.breakBurst(c.x, c.y, c.z);
    this.brain.startReact('executed');
    if (this.hp <= 0) {
      this.hp = 0;
      this.plates.blowAll();
      this._changing = true;
      this.brain.pendingPhase = 4;
    }
    return dmg;
  }

  /** Phase n begins (its transition's start). Phase 4: the hand-over (the husk, the pilot's body and bar). */
  enterPhase(n) {
    super.enterPhase(n);
    if (this.phase >= 4 && this.body !== 'pilot') {
      if (this.husk) {
        this.husk.position.set(this.position.x, 0, this.position.z);
        this.husk.rotation.set(0, this.yaw, 0);
        this.husk.updateMatrixWorld(true);
        this.husk.visible = true;
        this._huskFire.set(0, 1.95, -0.62).applyMatrix4(this.husk.matrixWorld);
      }
      this.plates.shedQueue = 0;
      this._setBody('pilot');
      this.maxHp = TUNING.pilot.hp;
      this.hp = this.maxHp;
      this._mortar.left = 0;
    }
  }

  _die() {
    this._changing = false;
    this._mortar.left = 0;
    super._die();
  }

  /** The transition is over: the eject's ring has gone out, she can be struck. */
  onTransitionEnd() {
    this._changing = false;
  }

  /** Where a beat's glint pops: the lance's fire tube, the hand-lance, his feet, or the blade. */
  tellPoint(part, out) {
    if (part === 'muzzle' && this._ptsOk && this.body === 'suit') return out.copy(this._muzzle);
    if (part === 'hand' && this._ptsOk && this.body === 'pilot') return out.copy(this._handMuzzle);
    return super.tellPoint(part, out);
  }

  // ---------------------------------------------------------------- his AI's say on a move
  weigh(name, def, w) {
    const P = this.plates, ph = this.phase;
    if (ph >= 4) return w;
    // Sweeping Fire: phase 2 on; in phase 1 only once the breastplate is gone
    if (name === 'fireSweep' && ph < 2 && !P.off('breast')) return 0;
    // Bellows Vent: double with the back plate gone and the hero behind him
    if (name === 'ventBurst' && P.off('back')) {
      const p = this.game.player?.position;
      if (p && P.sideOf(p.x, p.z) === 'back') return w * TUNING.plates.back.lost.ventBehind;
    }
    // Iron Charge: never with both flanks gone
    if (name === 'ironCharge' && P.off('left') && P.off('right')) return 0;
    return w;
  }

  // ---------------------------------------------------------------- frame
  _gameplayPoints() {
    super._gameplayPoints();
    // (the suit's hurt spheres: scaled out from the root by hurtK, so what is drawn is what is hit)
    const K = this.hurtK ?? 1, p = this.position, H = this._hs;
    for (let i = 0; i < H.length; i++) {
      const s = H[i];
      s.r = HS_R[i] * K;
      if (K === 1) continue;
      s.x = p.x + (s.x - p.x) * K;
      s.y = p.y + (s.y - p.y) * K;
      s.z = p.z + (s.z - p.z) * K;
    }
  }

  _animate(dt) {
    this.pilot.form = this.body === 'pilot' ? 2 : 1;
    super._animate(dt);
  }

  _drawnPoints() {
    super._drawnPoints();
    const ok = this._tipOk;
    this._muzzle.set(LANCE.muzzle[0], LANCE.muzzle[1], LANCE.muzzle[2]).applyMatrix4(this.rig.sword.matrixWorld);
    if (this.handLance) this._handMuzzle.set(0, -0.3, 0).applyMatrix4(this.handLance.matrixWorld);
    this._back.set(0, 0.08, -0.32).applyMatrix4(this.rig.chest.matrixWorld);
    this._ptsOk = ok && Number.isFinite(this._muzzle.x + this._muzzle.y + this._muzzle.z + this._handMuzzle.x + this._handMuzzle.y + this._handMuzzle.z + this._back.x);
  }

  /** The frame's gears and belts glow hotter by phase (one emissive material: `welt`). */
  _bladeMaterials(dt, M) {
    const u = M.welt?.uniforms;
    if (!u?.uGlow) return;
    const want = this.body === 'pilot' ? 0.2 : [0.35, 0.7, 1.1][clamp(this.phase, 1, 3) - 1];
    u.uGlow.value = dt > 0 ? u.uGlow.value + (want - u.uGlow.value) * Math.min(1, dt * 3) : want;
  }

  brainFrame(dt) {
    this.plates.update(dt);
    this.moveFx?.frame?.(dt);
    const m = this.mode, suit = this.body === 'suit';
    // the suit shoulders pieces over as it walks (its body circle through the world, ADR-107)
    const x = this.position.x, z = this.position.z;
    if (suit && (m === 'foot' || m === 'act') && Number.isFinite(this._lastX) && this.position.y < 0.3) {
      const W = this.game.world?.destructibles;
      const moved = Math.hypot(x - this._lastX, z - this._lastZ);
      if (W?.sweepRec && moved > 0.01 && moved < 2) {
        const R = this._sweepRec, o = this._bodyBlow;
        R.ax = this._lastX;
        R.az = this._lastZ;
        R.bx = x;
        R.bz = z;
        R.r = TUNING.suit.radius;
        R.power = this.T.world.body;
        o.dx = (x - this._lastX) / moved;
        o.dz = (z - this._lastZ) / moved;
        if (o.src < 0 || !this._bodySrcT || this.time - this._bodySrcT > 0.5) {
          o.src = W.swing?.() ?? -1;
          this._bodySrcT = this.time;
        }
        W.sweepRec(R, o);
      }
    }
    this._lastX = x;
    this._lastZ = z;
    // Sky-Splitting Mortars: one shell every `gap` s, each placed clear of the other answer's cues
    const Mo = this._mortar;
    if (Mo.left > 0 && m !== 'dying' && m !== 'dead') {
      Mo.t -= dt;
      if (Mo.t <= 0) {
        Mo.t = TUNING.mortar.gap;
        Mo.left--;
        this._dropShell();
      }
    }
  }

  /** One mortar shell: where the hero is going, scattered (its own stream), warned, clear of guard cues. */
  _dropShell() {
    const Mt = TUNING.mortar, pl = this.game.player, p = pl?.position;
    if (!p) return;
    const j = Mt.scatter;
    const x = p.x + fin(pl.vel?.x) * Mt.lead + (this._rnd() * 2 - 1) * j, z = p.z + fin(pl.vel?.z) * Mt.lead + (this._rnd() * 2 - 1) * j;
    const r = Math.hypot(x, z), B = this.bound + 1;
    const k = r > B ? B / r : 1;
    const sh = this.brain.fairDelay(Mt.warn, TELL.RED, this.T.pressure.guard.maxDelay, 'mortarRain');
    if (sh < 0) return; // (no slot clear of a guard cue: this shell is not thrown)
    if (sh > 0) this.brain.stats.delays++;
    this.fx.callStrike(x * k, z * k, Mt.radius, Mt.warn + sh, { damage: Mt.damage, knockback: Mt.knockback, attack: 'mortarRain' });
  }

  _rnd() {
    this._rs = (Math.imul(this._rs, 1664525) + 1013904223) >>> 0;
    return this._rs / 4294967296;
  }

  /** After the pose: the muzzle heating through a windup, the furnace on his back, the husk's fire. */
  afterPose(dt, a) {
    super.afterPose(dt, a);
    if (!this._ptsOk) return;
    const fx = this.fx;
    if (a && this.mode === 'act') {
      const cur = a.beats.find((b) => a.t < b.impact);
      if (cur && !cur.feint && (cur.def.bolt || cur.def.fire || cur.def.release?.style === 'fire')) {
        const k = clamp((a.t - cur.start) / Math.max(0.05, cur.impact - cur.start), 0, 1);
        const M = this.body === 'suit' ? this._muzzle : this._handMuzzle;
        fx.muzzleHeat(M.x, M.y, M.z, k, dt);
      }
    }
    // the furnace breathing out of his back once its door is off (hotter by phase)
    if (this.body === 'suit' && this.plates.off('back') && this.mode !== 'dead') fx.backFire(this._back.x, this._back.y, this._back.z, 0.4 + 0.3 * this.phase, dt);
    if (this.husk?.visible) fx.standingFire(this._huskFire.x, this._huskFire.y, this._huskFire.z, 1);
  }

  // ---------------------------------------------------------------- the beats' impacts
  onImpact(b, s, a) {
    const D = b.def, w = this.game.world, WT = this.T.world, x = this.position.x, z = this.position.z;
    if (a?.def?.transition) {
      const S = D.eject ? TUNING.eject : TUNING.shock;
      this.fx.shock(x, z, S.ringRadius, this._shockO ?? (this._shockO = { k: 1.2, fire: 1, kind: 'fire' }));
      this.fx.dust(x, z, 1.6);
      this.game.shake?.(0.4);
      w?.impact?.(x, z, S.ringRadius * 0.6, WT.vent, this._ringBlow ?? (this._ringBlow = { kind: BLOW.BLAST, by: 'boss', fire: 1 }));
      // the furnace opens / the works run wild: the least-sound plates blow off
      if (!D.eject) this.plates.shedTo(TUNING.plates.minOff[clamp(this.phase, 1, 3) - 1]);
      return;
    }
    if (D.bolt) {
      this._fireBolt(b, s);
      return;
    }
    if (D.fire) {
      this.fx.fireFan(x, z, this.yaw, D.zone?.r ?? 5.5, D.zone?.ang ?? 1.2);
      for (const f of [-0.8, 0, 0.8]) {
        const ang = this.yaw + f;
        w?.ignite?.(x + Math.sin(ang) * 3, z + Math.cos(ang) * 3, 1.4, WT.sweepFire);
      }
      this.moveFx?.burn(b, a);
    }
    if (D.vent) {
      this.fx.ventRing(x, z, D.zone?.r ?? 3.6);
      w?.ignite?.(x, z, D.zone?.r ?? 3.6, 1);
    }
    if (D.power && D.power !== 'sweep') {
      const r = D.zone?.kind === 'ring' ? D.zone.r : 2.4;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const cx = D.zone?.kind === 'ring' ? x : x + fx * r * 0.6, cz = D.zone?.kind === 'ring' ? z : z + fz * r * 0.6;
      const o = this._powBlow ?? (this._powBlow = { kind: BLOW.BLUNT, by: 'boss', dx: NaN, dz: NaN, scar: true, fire: 0 });
      o.fire = D.fire || D.vent ? 1 : 0;
      w?.impact?.(cx, cz, r, fin(WT[D.power], 0.8), o);
      if (D.zone?.kind === 'ring') this.fx.groundShock(x, z, r, 1);
    }
  }

  /** The Fire Lance's bolt (the suit's lance, the pilot's hand-lance): to the hero in its line, to the
   *  cover he stands behind (it takes the blow and catches), or out to its far end, stopped by whatever
   *  cover stands in its way. Drawn as heat (fx.lanceBolt). */
  _fireBolt(b, s) {
    const D = b.def, suit = this.body === 'suit', M = suit ? this._muzzle : this._handMuzzle, WT = this.T.world, w = this.game.world;
    const p = this.game.player;
    const inLine = !!s && this.brain._inZone(D.zone, s);
    let ex, ey, ez;
    if (inLine && b.cover) {
      // the hero is behind cover: brain._coverFor dealt it the blow (T.world.bolt); it catches fire
      ex = b.cover.x;
      ez = b.cover.z;
      ey = Math.min(1.4, (b.cover.h ?? 2) * 0.6);
      w?.ignite?.(ex, ez, 1.6, WT.lanceFire);
    } else if (inLine && p?.getChestPos) {
      p.getChestPos(_v, true);
      ex = _v.x;
      ey = _v.y;
      ez = _v.z;
      w?.impact?.(ex, ez, 1.0, WT.lance * 0.5, BOLT_BLOW);
    } else {
      const range = D.zone?.r ?? TUNING.lance.range;
      ex = this.position.x + Math.sin(this.yaw) * range;
      ez = this.position.z + Math.cos(this.yaw) * range;
      ey = 0.4;
      const W = w?.destructibles, c = W?.stop?.(M.x, M.z, ex, ez, 0.3, WT.lance, COVER_BLOW);
      if (c) {
        ex = c.x;
        ez = c.z;
        ey = Math.min(1.4, (c.h ?? 2) * 0.6);
        w?.ignite?.(ex, ez, 1.6, WT.lanceFire);
      } else w?.impact?.(ex, ez, 1.8, WT.lance, BOLT_BLOW);
    }
    this.fx.lanceBolt(M.x, M.y, M.z, ex, ey, ez, suit);
    this.emit('dragon:explosion', { x: ex, z: ez, radius: suit ? 1.8 : 1 });
  }

  /** A blow at the hero. A bolt met by a PERFECT parry is thrown back: it strikes the plate facing the
   *  hero (the suit) or her posture (the pilot). */
  hitPlayer(o) {
    const D = o.beat?.def, p = this.game.player;
    if (D?.bolt) o = { ...o, kind: 'fire' };
    const r = super.hitPlayer(o);
    if (D?.bolt && r === RESULT.PARRIED && p?.deflect?.perfect && this.mode !== 'dying' && this.mode !== 'dead') {
      const L = TUNING.lance, c = this._hs[1];
      if (p.getChestPos) {
        p.getChestPos(_w, true);
        this.fx.lanceBolt(_w.x, _w.y, _w.z, c.x, c.y, c.z, false);
      }
      this.emit('dragon:returned', { kind: 2, damage: 0, x: c.x, y: c.y, z: c.z });
      if (this.phase <= 3 && p.position) {
        const side = this.plates.sideOf(p.position.x, p.position.z);
        if (this.plates.on(side)) {
          const S = this.plates.s[side];
          S.hp -= L.returnPlate;
          if (S.hp <= 0) this.plates.shed(side, 'return');
        }
      }
      this.addPosture(L.returnPosture);
    }
    return r;
  }

  /** The pilot's fire bolts thrown at a release beat's impact (duelist fx crescents, style 'fire'). */
  onRelease(b, s, act) {
    const R = b.def.release, base = s ? s.ang : this.yaw, n = R.count ?? 1, M = this._handMuzzle;
    const ox = this._ptsOk ? M.x : this.position.x, oz = this._ptsOk ? M.z : this.position.z;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * (R.spread ?? 0.3);
      const c = this.fx.throwCrescent(ox + Math.sin(a) * (R.from ?? 0.5), oz + Math.cos(a) * (R.from ?? 0.5), Math.sin(a), Math.cos(a), { tell: b.def.tell, damage: b.def.damage, knockback: b.def.knockback, attack: act?.name ?? 'scatterShot' });
      if (c) {
        c.style = 'fire';
        c.speed = R.speed ?? TUNING.shot.speed;
        c.radius = TUNING.shot.radius;
        c.life = TUNING.shot.life;
        c.half = 0.6;
      }
    }
    this.fx.fireBurst(ox, 1.0, oz, 0.4);
  }

  /** A cast beat's impact: Sky-Splitting Mortars (the shells fall one by one: brainFrame). */
  onCast(b) {
    if (b.def.cast?.kind === 'mortar') {
      this._mortar.left = TUNING.mortar.count;
      this._mortar.t = 0;
      this.fx.fireBurst(this._back.x, this._back.y + 0.6, this._back.z, 0.8);
      this.game.shake?.(0.2);
    }
  }

  /** A beat's own motion: Iron Charge ploughs through the yard along its dash. */
  beatMotion(b, u) {
    const D = b.def;
    if (!D.charge || !b._dash) return;
    const W = this.game.world?.destructibles;
    if (!W?.sweepRec) return;
    const x = this.position.x, z = this.position.z;
    if (b._cx === undefined) {
      b._cx = b._dash.x;
      b._cz = b._dash.z;
      b._csrc = W.swing?.() ?? -1;
    }
    const moved = Math.hypot(x - b._cx, z - b._cz);
    if (moved < 0.05) return;
    const R = this._sweepRec, o = this._chargeBlow;
    R.ax = b._cx;
    R.az = b._cz;
    R.bx = x;
    R.bz = z;
    R.r = 0.8;
    R.power = this.T.world.charge;
    o.dx = b._dash.dx;
    o.dz = b._dash.dz;
    o.src = b._csrc;
    W.sweepRec(R, o);
    b._cx = x;
    b._cz = z;
    void u;
  }

  get LINKS() {
    return LINKS;
  }
}

/** Everything the shared duelist needs to be him (the per-instance kit is makeKit's). */
export const MARSHAL_KIT = Object.freeze({ id: 'marshal', TUNING, MOVES, MOVE_NAMES, transitions: TRANSITIONS, maxPhase: 4, loadout: MARSHAL_LOADOUT });
