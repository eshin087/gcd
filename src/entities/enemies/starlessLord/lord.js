import * as THREE from 'three';
import { CONFIG } from '../../../core/config.js';
import { clamp, damp, lerp, wrapAngle } from '../../../core/math.js';
import { TELL, RESULT } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { Duelist } from '../duelist/duelist.js';
import { DuelBrain } from '../duelist/brain.js';
import { perPhase } from '../duelist/realise.js';
import { LORD_LOADOUT, SABER, buildOffSaber } from './gear.js';
import { formPoses, glidePose } from './poses.js';
import { MOVES, MOVE_NAMES, CLIP, CLIPS_BY_FORM, clipsOf, TRANSITIONS, COUNTERS, STREAKS, realise, formOn } from './moves.js';
import { TUNING } from './tuning.js';
import { LordFx } from './fx.js';
import { LordTerrain } from './terrain.js';
import { LINKS } from './links.js';
import { LordSpecialFx, boltLook } from './specialFx.js';
import { LordSpells } from './spells.js';
import { dressFrame as dressLord } from './look.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { refLook, refMove } from './refLook.js';
import { P } from '../../player/anim.js';
import { clashOn, clashRegenK } from '../../../combat/clashDance.js';

// The Starless Lord (COMBAT.md → "The Starless Lord"): a dark lord from the stars, enthroned in the
// crater of the Obsidian Throne, who fills the boss slot of the Starless level. A duelist (duelist/duelist.js:
// the body, the contract, the guard, posture, the duel's moments; duelist/brain.js: the mind) with
// his own kit: moves (moves.js), numbers (tuning.js), gear (gear.js), four stances (poses.js), FX
// (fx.js). What only he does is here:
//   - four blade FORMS (d.phase 1..4), each with its own health bar: one blade, twin blades, the
//     staff, the cross-hilted blade. A bar emptied or his posture broken leaves him on one knee; the
//     hero's execution is the DEATHBLOW: the form ends, he rises and ignites the next (the fourth
//     kills him). `lives` = { total, left } for the HUD's pips.
//   - the blades of red light: which meshes each form ignites, the off-hand blade's joint, the glow,
//     the red light on the main blade
//   - the Void: lightning (a parry deflects it, a perfect parry sends it back), the push, the pull,
//     the Crushing Dark, the thrown blade, torn stone, the Rift, called lightning, the Dark Star,
//     the blink
//   - the glide: past a walk he does not run, the Void carries him (the root lifted, his own pose)
//   - the throne: he sits until the hero comes through the door, rises, and leaps down to the seal.

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
// (ADR-276, `?lordRefMove`: the staff held wide: in form 3 the off hand sits down the joined hilt, not
// beside the sword hand (03 / 06 F6, 15 B3); `offAt` m up the blade from the grip, negative = toward the
// back blade)
const REF_STAFF_HAND = -0.14;
const staffHands = (p, A) => {
  // (the duelist's poses never write offAt: it is set every frame here, and back to 0 out of the staff)
  if ((A.player?.form ?? 1) === 3 && refMove()) p[P.offAt] = REF_STAFF_HAND * Math.min(1, Math.max(0, p[P.twoHand]));
  else if (p[P.offAt] !== 0) p[P.offAt] = 0;
};
const POSES = Object.freeze({
  loco: (p, A) => {
    formPoses(A.player?.form ?? 1).duelLoco(p, A);
    staffHands(p, A);
  },
  duel: (p, A) => {
    formPoses(A.player?.form ?? 1).duelClip(p, A);
    staffHands(p, A);
  },
  glide: (p, A) => {
    glidePose(p, A);
    staffHands(p, A);
  },
});
/** The beat a move is in at its time t (its windup or its active frames), or null. */
const beatNow = (a) => (a ? a.beats.find((b) => a.t < b.end + 1e-6) ?? null : null);
/** A beat that works the Void (a spell, not steel): the cape lifts through it. */
const isCast = (D) => !!(D && (D.cast || D.bolt || D.pull || D.grip || D.release?.style === 'push' || D.release?.style === 'rift'));
/** A beat that is the Void alone (no steel in it): it can be cast while his main blade is in the air. */
const voidOnly = (D) => !!(D && (D.feint || D.bolt || D.pull || D.grip || D.left || D.release?.style === 'push' || (D.cast && D.cast.kind !== 'glaive' && D.cast.kind !== 'wheel')));
const _needsBlade = new WeakMap(), _asksGuard = new WeakMap();
/** Does a move ask a guard anywhere (a white or blue beat, any alternative)? */
const asksGuard = (def) => {
  let v = _asksGuard.get(def);
  if (v === undefined) {
    v = (def.beats ?? []).some((b) => (Array.isArray(b.pick) ? b.pick : [b]).some((x) => !x.feint && (x.tell === TELL.NORMAL || x.tell === TELL.BLUE)));
    _asksGuard.set(def, v);
  }
  return v;
};
/** Does a move swing his MAIN blade (any beat, any alternative)? Not while it is thrown. */
const needsBlade = (def) => {
  let v = _needsBlade.get(def);
  if (v === undefined) {
    v = (def.beats ?? []).some((b) => (Array.isArray(b.pick) ? b.pick : [b]).some((x) => !voidOnly(x)));
    _needsBlade.set(def, v);
  }
  return v;
};

/** Everything the shared duelist needs to be him (duelist.js: kit). */
export const LORD_KIT = Object.freeze({
  id: 'starlessLord',
  TUNING, MOVES, MOVE_NAMES, CLIP, realise,
  transitions: TRANSITIONS,
  counterMove: (form) => COUNTERS[clamp(form, 1, COUNTERS.length) - 1],
  streakMove: (form) => STREAKS[clamp(form, 1, STREAKS.length) - 1],
  maxPhase: TUNING.forms,
  loadout: LORD_LOADOUT,
  poses: POSES,
  blade: Object.freeze({ guard: SABER.guard, tip: SABER.tip }),
  scale: TUNING.scale,
  dress: dressLord,
  // the sword motion pass behind `?lordMotion=` (ADR-226): its numbers while on, null ('0') as before
  // (and ADR-251's form, `?lordForm=`: its thrusts open the arm further)
  motion: () => (lookOf('lordMotion', '0') === '0' ? null : formOn() ? TUNING.formMotion : TUNING.motion),
  // (ADR-251's form: a planted foot its clip lifts eases off its spot, as Shen Hui's does (ADR-250), so the
  // step keyed into a cut leaves where the foot stood instead of jumping to the key)
  animOpts: Object.freeze({ liftEase: () => (formOn() ? TUNING.formMotion.liftEase : 0) }),
});

/** His mind: the duelist's, with each form's own reaction clips. */
class LordBrain extends DuelBrain {
  get C() {
    return clipsOf(clamp(this.d.phase | 0, 1, CLIPS_BY_FORM.length)); // (ADR-276: the reference's while ?lordRefMove is on)
  }
  set C(v) {} // (the base constructor assigns the kit's set: his is per form)

  /** Into the duel. If the intro was skipped or cut short (the Lab, a flow jump), he is put where
   *  its leap would have landed him: off the dais, on the crater's floor. */
  _toCombat() {
    const d = this.d;
    if (d.mode === 'sleep' || (d.mode === 'intro' && !d._introLanded)) {
      const L = TUNING.intro.land;
      d.position.set(L.x, 0, L.z);
    }
    super._toCombat();
  }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _m4 = new THREE.Matrix4();

export class StarlessLord extends Duelist {
  constructor(game) {
    super(game, LORD_KIT);
  }

  // ---------------------------------------------------------------- build
  /** His colours: the hero's material set, recoloured on HIS instances (gear.js says which is which). */
  _tint(M) {
    const fill = (m, r, g, b) => m?.uniforms?.uArtFill?.value.setRGB(r, g, b);
    fill(M.coat, 0.055, 0.05, 0.06); // black cloth: the cape, the war-skirt, the sleeves
    fill(M.collar, 0.07, 0.06, 0.07);
    fill(M.lining, 0.42, 0.035, 0.03); // crimson inside the cape and the skirt
    fill(M.collarIn, 0.42, 0.04, 0.035);
    fill(M.facing, 0.34, 0.03, 0.03);
    fill(M.piping, 0.42, 0.06, 0.05);
    fill(M.hem, 0.26, 0.045, 0.05); // the cloth's lower edge: ember-red
    fill(M.shirt, 0.028, 0.028, 0.034); // the undersuit, the breather's slots, the grip
    fill(M.pants, 0.04, 0.04, 0.05);
    fill(M.leather, 0.07, 0.06, 0.065);
    fill(M.armor, 0.09, 0.09, 0.112); // black plate
    fill(M.spike, 0.12, 0.115, 0.14);
    fill(M.bevel, 0.3, 0.26, 0.29); // the plates' edges
    fill(M.trim, 0.21, 0.2, 0.23); // dark gunmetal: the hilt, the clasps
    fill(M.welt, 0.2, 0.08, 0.08);
    fill(M.flask, 1.0, 0.07, 0.04); // the blades and the visor: red light
    // the `flask` part's ink lines are amber for every rig (a shared per-part tint): in this level
    // (one level per page load) they burn red, so the blades' core is red-white, not gold
    const U = this.game.U;
    U.uHeroPartInk?.value?.[19]?.set(1.7, 0.34, 0.24, 1.6);
    U.uHeroPartRim?.value?.[19]?.set(1.7, 0.34, 0.24, 1.6);
    const fu = M.flask?.uniforms;
    if (fu) {
      fu.uInk?.value.setRGB(1.5, 0.16, 0.1);
      fu.uEmissive?.value.setRGB(2.6, 0.22, 0.12);
      if (fu.uGlowMask) fu.uGlowMask.value = 1;
    }
    if (M.lining?.uniforms?.uInk) M.lining.uniforms.uInk.value.setRGB(0.7, 0.1, 0.08);
    // (ADR-276, `?lordRef`: the reference's crimson reads at a glance: the cape's lining, the sash, the
    // hems printed in a stronger red, the same hue)
    if (refLook()) {
      const ink = (m, r, g, b) => m?.uniforms?.uInk?.value.setRGB(r, g, b);
      ink(M.lining, 1.15, 0.13, 0.1);
      ink(M.piping, 1.2, 0.16, 0.12);
      ink(M.hem, 0.95, 0.12, 0.1);
      fill(M.lining, 0.5, 0.04, 0.035);
      fill(M.piping, 0.5, 0.06, 0.05);
    }
  }

  _makeFx() {
    return new LordFx(this);
  }
  _makeBrain() {
    return new LordBrain(this);
  }

  /** The blades' meshes, the off-hand blade's joint and his state (before batching and reset()). */
  _setup() {
    const r = this.rig, find = (n) => r.root.getObjectByName(n) ?? null;
    this.blades = { A: find('lordBladeA'), B: find('lordBladeB'), hiltB: find('lordHiltB'), Q: find('lordQuillons'), L: null, off: null };
    const off = buildOffSaber(r.materials);
    r.body.add(off.root);
    this.blades.off = off.root;
    this.blades.L = off.blade;
    // (ADR-276, `?lordRef`: the split blades' dark slits, each kept with its blade by _showForm)
    const cores = [[this.blades.A, find('lordCoreA')], [this.blades.B, find('lordCoreB')], [this.blades.Q, find('lordCoreQ')], [off.blade, off.core]];
    this.blades.cores = cores.filter(([b, c]) => b && c);
    this._split = this.blades.cores.length > 0;
    off.root.visible = false;
    this.lit = 0; // how far the blades are lit 0..1 (they extend from the hilt)
    this.litWant = 0;
    this.glaiveOut = false; // the main blade is in the air (Returning Blade)
    this._changing = false; // between a deathblow and the next form's ignition: nothing lands on him
    this._storm = { left: 0, t: 0 };
    this._offDir = new THREE.Vector3(0.5, 0.4, 0.75).normalize();
    this._offTip = new THREE.Vector3();
    this._offHilt = new THREE.Vector3();
    this._offTipPrev = new THREE.Vector3();
    this._offHiltPrev = new THREE.Vector3();
    this._backTip = new THREE.Vector3();
    this._backHilt = new THREE.Vector3();
    this._backTipPrev = new THREE.Vector3();
    this._backHiltPrev = new THREE.Vector3();
    this._hand = new THREE.Vector3();
    this._ptsOk = false;
    this._introLanded = false;
    this._hover = 0; // the glide 0..1 (the root lifted off the floor)
    this._grip = { x: 0, z: 0 }; // where the Crushing Dark is closing
    this._ghost = new Float32Array(16 * 6);
    const d = this;
    this.debug.phase4 = () => this.brain.forcePhase(4);
    /** Lab: straight to form n (1..4), blades lit, bar full. */
    this.debug.setForm = (n) => {
      n = clamp(Math.round(fin(Number(n), 1)), 1, TUNING.forms);
      if (d.mode === 'dying' || d.mode === 'dead') return false;
      d.brain.startFight();
      d.enterPhase(n);
      d.litWant = 1;
      d._changing = false;
      d.brain._toFoot(0.3);
      d.emit(`dragon:phase${n}`);
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
    if (this.blades) {
      this.lit = 0;
      this.litWant = 0;
      this.glaiveOut = false;
      this._changing = false;
      this._storm.left = 0;
      this._introLanded = false;
      this._ptsOk = false;
      this._hover = 0;
      this.pilot.updraft = 0;
    }
    super.reset();
    // (the base constructor resets before this class's own fields could exist: made here)
    (this.terrain ??= new LordTerrain(this)).reset();
    (this.spells ??= new LordSpells(this)).reset();
    (this.specialFx ??= new LordSpecialFx(this)).reset(); // the specials' looks (specialFx.js, ADR-251)
    // enthroned: the root sits at the seat (the pose's hips are lowered to it)
    this.position.y = TUNING.intro.seatY;
    if (this.blades) {
      this._showForm();
      this._animate(0);
    }
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
      // (the clash dance, ADR-247: the steps by his health replace the curve)
      const f = clamp(this.hp / this.maxHp, 0, 1);
      const k = clashOn() ? clashRegenK(f) : lerp(P.regenByHp[1], P.regenByHp[0], f);
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

  /** The deathblow (player.js: an attack near a broken duelist): this form ends. He is thrown back
   *  onto one knee, then rises into the next form's ignition; the last form's deathblow kills him. */
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
    this.fx.deathblowBurst(c.x, c.y, c.z, dx / l, dz / l);
    if (this.phase >= TUNING.forms) {
      this._die();
      return dmg;
    }
    this._changing = true;
    this.litWant = 0; // the blades gutter out
    this.brain.startReact('executed');
    this.brain.pendingPhase = this.phase + 1;
    return dmg;
  }

  /** Form n begins (its ignition's start): a full bar, its posture meter, its stance and its blades
   *  (dark until the ignition lands). */
  enterPhase(n) {
    super.enterPhase(n);
    this.hp = this.maxHp;
    this.lit = 0;
    this.litWant = 0;
    this.glaiveOut = false;
    this.spells?.onForm(this.phase);
    // (the great spell is not how a form opens)
    const night = MOVES.starlessNight;
    if (this.brain && night && perPhase(night.weight, this.phase) > 0) this.brain.cooldowns.starlessNight = Math.max(this.brain.cooldowns.starlessNight ?? 0, TUNING.night.firstAfter);
    this._showForm();
  }

  _die() {
    this._changing = false;
    this.litWant = 0;
    this._storm.left = 0;
    this.spells?.clear();
    super._die();
  }

  /** Where a beat's glint pops: the casting hand, the off-hand blade, his feet, or the main blade. */
  tellPoint(part, out) {
    if (part === 'hand' && this._ptsOk) return out.copy(this._hand);
    if (part === 'off' && this._ptsOk && this.phase === 2) return out.copy(this._offTip);
    return super.tellPoint(part, out);
  }

  // ---------------------------------------------------------------- the crater's floor
  /** Keep a point where he may stand, `pad` m more: inside his circle round the seal (the duelist's
   *  bound) and south of the dais (the level's CONFIG.world.bossFloor.zN; absent on the lab stage). */
  clampTarget(p, pad = 0) {
    const B = this.bound + pad, r = Math.hypot(p.x, p.z);
    if (r > B) {
      p.x *= B / r;
      p.z *= B / r;
    }
    const zN = CONFIG.world.bossFloor?.zN;
    if (Number.isFinite(zN) && p.z < zN - pad) p.z = zN - pad;
    return p;
  }

  /** Whether (x, z) is on that floor. */
  onFloor(x, z) {
    const zN = CONFIG.world.bossFloor?.zN;
    return Math.hypot(x, z) <= this.bound && !(Number.isFinite(zN) && z < zN);
  }

  standable(x, z) {
    return this.onFloor(x, z) && super.standable(x, z);
  }

  // ---------------------------------------------------------------- the crater's pieces (terrain.js)
  /** His AI weighs a move: one that needs a piece of the crater weighs nothing while there is none. */
  weigh(name, def, w) {
    if (def.motionOnly && lookOf('lordMotion', '0') === '0') return 0; // (ADR-226: only behind its switch)
    if (def.terrain) return this.terrain.weigh(def, w);
    // while his main blade is in the air (the Returning Blade, the wheeling blade) he works the Void
    // or the off-hand blade: nothing that swings the blade he threw
    if (this.glaiveOut && needsBlade(def)) return 0;
    // while Starless Night's waves run over the crater, nothing that asks a guard (he stands in the
    // eye of it: two answers are never asked at once)
    if (this.spells?.nightLive && asksGuard(def)) return 0;
    return w;
  }

  /** A move starts: one of the crater's takes its pieces (false: there is none, it does not start).
   *  One that needs the blade he threw (a counter, the Lab) calls it home first. */
  onActStart(A) {
    if (A.def.terrain) return this.terrain.begin(A);
    if (this.glaiveOut && needsBlade(A.def)) this._recallBlade();
    return true;
  }

  /** His thrown blade comes home now (not cued yet on this pass: it gives the pass up, no hit). */
  _recallBlade() {
    this.spells?.recall();
    for (const s of this.fx.shots ?? []) {
      if (!s.alive || s.kind !== 'glaive') continue;
      if (s.phase === 'fly' && s.flashed < 0) {
        s.phase = 'back';
        s.wait = 0;
        s.done = true;
      }
      if (s.phase === 'back') {
        s.wait = 0;
        s.back = Math.max(s.back, TUNING.glaive.back * 1.8);
      }
    }
  }

  moveBy(dx, dz) {
    super.moveBy(dx, dz);
    this.clampTarget(this.position);
  }

  // ---------------------------------------------------------------- the blades
  /** Show what the current form ignites (lit 0..1 scales each blade out of its emitter). */
  _showForm() {
    const B = this.blades, f = this.phase, S = SABER;
    if (!B?.A) return;
    const k = Math.max(0.001, this.lit);
    const on = k > 0.02 && !this.glaiveOut;
    B.A.visible = on;
    B.A.scale.z = ((f === 4 ? S.tip4 : S.tip) - S.guard) * k;
    B.hiltB.visible = f === 3;
    B.B.visible = f === 3 && on;
    B.B.scale.z = (S.tipB - S.hiltB) * k;
    B.Q.visible = f === 4 && k > 0.5;
    B.off.visible = f === 2;
    B.L.visible = f === 2 && k > 0.02;
    B.L.scale.z = (S.tip - S.guard) * k;
    for (const [b, c] of B.cores ?? []) {
      c.visible = b.visible;
      c.scale.z = b.scale.z;
    }
    // the off hand: closed on the off-hand blade's hilt in form 2 (that joint carries its own fist)
    const H = this.rig.offHand;
    if (H?.open && f === 2) {
      H.open.visible = false;
      if (H.grip) H.grip.visible = false;
      if (H.fingers) H.fingers.visible = false;
    }
  }

  /** The off-hand blade's joint: at the left wrist, along the direction the pose left on the animator. */
  _poseOff(dt) {
    const off = this.blades?.off;
    if (!off || this.phase !== 2) return;
    const r = this.rig, fore = r.arms.L.fore;
    fore.updateWorldMatrix(true, false);
    _v.set(0, -DIM.foreArm, 0).applyMatrix4(fore.matrixWorld);
    r.body.worldToLocal(_v);
    off.position.copy(_v);
    const o = this.anim.off ?? { az: 0.72, el: 0.42 };
    const c = Math.cos(o.el);
    _w.set(c * Math.sin(o.az), Math.sin(o.el), c * Math.cos(o.az));
    // (the pose's direction is not a blended channel: ease it so a change of clip does not snap it)
    const k = dt > 0 ? 1 - Math.exp(-dt * 28) : 1;
    this._offDir.lerp(_w, k).normalize();
    _bz.copy(this._offDir);
    _by.set(0, 1, 0).addScaledVector(_bz, -_bz.y);
    if (_by.lengthSq() < 1e-6) _by.set(1, 0, 0);
    _by.normalize();
    _bx.crossVectors(_by, _bz);
    off.quaternion.setFromRotationMatrix(_m4.makeBasis(_bx, _by, _bz));
  }

  _gameplayPoints() {
    this._poseOff(this._dt ?? 0);
    super._gameplayPoints();
  }

  _animate(dt) {
    this.pilot.form = this.phase;
    this._dt = dt;
    super._animate(dt);
  }

  /** Drawn points for FX: every lit blade's ends and the casting hand (leaned, HERO_SCALE). */
  _drawnPoints() {
    const s = this.rig.sword, S = SABER, f = this.phase;
    this._tipPrev.copy(this._tip);
    this._hiltPrev.copy(this._hilt);
    this._offTipPrev.copy(this._offTip);
    this._offHiltPrev.copy(this._offHilt);
    this._backTipPrev.copy(this._backTip);
    this._backHiltPrev.copy(this._backHilt);
    const ok = this._tipOk;
    this._hilt.set(0, 0, S.guard).applyMatrix4(s.matrixWorld);
    this._tip.set(0, 0, f === 4 ? S.tip4 : S.tip).applyMatrix4(s.matrixWorld);
    this._backHilt.set(0, 0, -S.hiltB).applyMatrix4(s.matrixWorld);
    this._backTip.set(0, 0, -S.tipB).applyMatrix4(s.matrixWorld);
    const off = this.blades.off;
    this._offHilt.set(0, 0, S.guard).applyMatrix4(off.matrixWorld);
    this._offTip.set(0, 0, S.tip).applyMatrix4(off.matrixWorld);
    this._hand.set(0, -DIM.foreArm - 0.06, 0).applyMatrix4(this.rig.arms.L.fore.matrixWorld);
    this._tipOk = Number.isFinite(this._tip.x + this._tip.y + this._tip.z) && Number.isFinite(this._hilt.x + this._hilt.y + this._hilt.z);
    const all = this._tipOk && Number.isFinite(this._offTip.x + this._offHilt.y + this._backTip.z + this._hand.x + this._hand.y + this._hand.z);
    if (!ok || !this._ptsOk) {
      this._tipPrev.copy(this._tip);
      this._hiltPrev.copy(this._hilt);
      this._offTipPrev.copy(this._offTip);
      this._offHiltPrev.copy(this._offHilt);
      this._backTipPrev.copy(this._backTip);
      this._backHiltPrev.copy(this._backHilt);
    }
    this._ptsOk = all;
  }

  /** The blades' material (his `flask` instance): it burns brighter through a strike and in form 4. */
  _bladeMaterials(dt, M) {
    const u = M.flask?.uniforms;
    if (!u) return;
    const act = this.brain.act, striking = !!act && act.striking && act.t >= act.striking.impact - 0.06 && act.t <= act.striking.end + 0.1;
    const hot = this.phase >= 4 ? 1.5 : 1;
    const glow = (1.2 + (striking ? 0.8 : 0)) * hot * this.lit;
    // (ADR-276, `?lordRef`: the split blade's rails bloom a little less, so the dark slit between them reads; the
    // bloom is most of the blade's red at 720p: halved, the blades printed white)
    const want = this._split ? glow * 0.8 : glow;
    u.uGlow.value = dt > 0 ? damp(u.uGlow.value, want, 14, dt) : want;
    u.uInkGlow.value = 1.0 + (striking ? 0.6 : 0) + 0.4 * (hot - 1);
  }

  // ---------------------------------------------------------------- frame hooks (duelist/brain.js)
  /** Each frame after the brain: the blades' ignition, the intro's leap, the storm's marks. */
  brainFrame(dt) {
    // the blades extend / retract
    if (this.lit !== this.litWant) {
      this.lit = this.litWant > this.lit ? Math.min(this.litWant, this.lit + dt * 5) : Math.max(this.litWant, this.lit - dt * 4);
    }
    // out of the intro and the ignitions his blades are always lit (a skipped intro included)
    const act = this.brain.act, m = this.mode;
    if (this.litWant < 1 && !this._changing && (m === 'foot' || m === 'react' || m === 'broken' || (m === 'act' && act && !act.def.transition))) this.litWant = 1;
    this._showForm();
    if (this.mode === 'intro') this._intro(dt);
    this._glide(dt);
    this.terrain.frame(dt);
    this.spells.frame(dt);
    // the Void's wind under his cape: through a cast, a little always in form 4, a gust at an ignition
    {
      const cur = beatNow(act);
      let up = this.phase >= 4 && this.lit > 0.5 && m !== 'dying' ? 0.3 : 0;
      if (m === 'act' && cur && !cur.feint && isCast(cur.def)) up = Math.max(up, 0.35 + 0.65 * clamp((act.t - cur.start) / Math.max(0.05, cur.impact - cur.start), 0, 1));
      if (m === 'act' && act?.def.transition && cur && act.t >= cur.impact - 0.5) up = 1;
      this.pilot.updraft = up;
    }
    // The Starless Sky: one mark every `gap` s, led onto where the hero is going
    const St = this._storm;
    if (St.left > 0 && this.mode !== 'dying' && this.mode !== 'dead') {
      St.t -= dt;
      if (St.t <= 0) {
        St.t = TUNING.storm.gap;
        St.left--;
        const pl = this.game.player, p = pl?.position;
        if (p) {
          const lead = TUNING.storm.lead, j = St.left % 3 === 2 ? 2.6 : 0.5;
          // (a mark may fall a stride past his own floor: a hero at the rim is not out of the storm)
          // (its scatter from the spells' own stream: never the fx object's, which the drawing shares)
          const m = this.clampTarget(_w.set(p.x + fin(pl.vel?.x) * lead + this.spells.rand(-j, j), 0, p.z + fin(pl.vel?.z) * lead + this.spells.rand(-j, j)), 0.6);
          this.fx.callStrike(m.x, m.z, TUNING.storm.radius, TUNING.storm.warn, { damage: St.damage, knockback: St.kb, attack: 'storm' });
        }
      }
    }
  }

  /**
   * The glide. In footwork, past TUNING.glide.on m/s he stops walking: the animator takes his glide
   * pose, the root lifts off the floor and a wake streams off under him; below .off he comes down
   * and walks. Stepping back or aside (the backstep, the sidestep) he is carried the same way.
   */
  _glide(dt) {
    const G = TUNING.glide, m = this.mode, b = this.brain;
    const vx = this.pilot.groundVel.x, vz = this.pilot.groundVel.z, sp = Math.hypot(vx, vz);
    if (m === 'foot') {
      if (this.anim.key !== 'glide' && sp > G.on) this.anim.play('glide', 0.24);
      else if (this.anim.key === 'glide' && sp < G.off) this.anim.play('loco', 0.28);
    }
    const gliding = m === 'foot' && this.anim.key === 'glide';
    this._hover = damp(this._hover, gliding ? 1 : 0, gliding ? 7 : 12, dt);
    if (!(this._hover > 0.002)) this._hover = 0;
    const R = b.react;
    const carried = m === 'react' && R && (R.kind === 'backstep' || R.kind === 'sidestep');
    if (m === 'foot') this.position.y = G.hover * this._hover;
    else if (carried) this.position.y = G.back * Math.sin(Math.PI * clamp(R.t / Math.max(0.05, R.clip.dur), 0, 1));
    else if (m === 'act') {
      // (a beat with its own flight owns the height: a flip, a leap)
      const cur = beatNow(b.act);
      if (!b.leap && !cur?.def.lift && !cur?.def.leap) this.position.y = G.hover * this._hover;
    }
    if ((gliding || carried) && sp > 1) this.fx.glideWake(this.position.x, this.position.z, vx, vz, dt, carried ? 1 : this._hover);
  }

  /** The intro's root motion: off the throne onto the dais, the blade lit, the leap down to the seal. */
  _intro() {
    const I = TUNING.intro, t = this.brain.modeT;
    const S = CONFIG.world.dragonSleep ?? { x: 0, z: 0 };
    const sx = fin(S.x), sz = fin(S.z);
    const standZ = sz + I.stand, standY = I.daisY;
    if (t < 0.5) this.position.set(sx, I.seatY, sz);
    else if (t < 1.2) {
      const k = (t - 0.5) / 0.7, e = k * k * (3 - 2 * k);
      this.position.set(sx, lerp(I.seatY, standY, e), lerp(sz, standZ, e));
    } else if (t < I.leapFrom) this.position.set(sx, standY, standZ);
    else {
      const k = clamp((t - I.leapFrom) / Math.max(0.1, I.leapTo - I.leapFrom), 0, 1), e = k * k * (3 - 2 * k);
      this.position.set(lerp(sx, I.land.x, e), k >= 1 ? 0 : lerp(standY, 0, k) + I.apex * 4 * k * (1 - k), lerp(standZ, I.land.z, e));
      this.state = k < 1 ? 'airborne' : 'waking';
      if (k >= 1 && !this._introLanded) {
        this._introLanded = true;
        this.emit('dragon:land', { x: this.position.x, z: this.position.z });
        this.fx.dust(this.position.x, this.position.z, 2);
        this.game.shake?.(0.35);
        this.game.world?.forest?.ambience?.flare?.(1);
      }
    }
    if (t >= 1.15 && this.litWant < 1) {
      this.litWant = 1;
      this.fx.igniteBurst(this._hilt, this._tip, 1);
      this.emit('dragon:roar', { strength: 0.5 });
    }
  }

  /** After the pose: every lit blade's glow and sweep, the red light, form 4's aura, the Void in his
   *  hand through a cast, the stars of a break. */
  afterPose(dt, a) {
    const f = this.phase, fx = this.fx, lit = this.lit;
    if (!this._ptsOk) return;
    const hot = f >= 4 ? 1.35 : 1;
    const main = lit > 0.02 && !this.glaiveOut;
    if (main) {
      fx.bladeGlow(this._hilt, this._tip, lit, hot);
      if (f === 3) fx.bladeGlow(this._backHilt, this._backTip, lit, hot);
      fx.bladeEmbers(this._hilt, this._tip, dt, f >= 4 ? 2.4 : 0.7);
    }
    if (f === 2 && lit > 0.02) fx.bladeGlow(this._offHilt, this._offTip, lit, hot);
    fx.bladeLight(this._hilt, this._tip, this.mode === 'dying' ? 0 : main ? lit : f === 2 ? lit * 0.6 : 0, hot);
    if (f >= 4 && this.mode !== 'dying' && this.mode !== 'sleep' && lit > 0.5) {
      const c = this._hs[1];
      fx.aura(c.x, c.y, c.z, dt, 1, this.position.x, this.position.z);
    }
    // ?presence=a: forms 2 and 3 carry something of their own (fx.presence)
    if (fx.look?.('presence') === 'a') fx.presence?.(f, dt);
    // ?void=a: his death: the Void goes out of him at once, then leaves his bones as he falls
    const dying = this.mode === 'dying';
    if (dying && fx.look?.('void') === 'a') {
      if (!this._fxDying) {
        const c = this._hs[1];
        fx.deathBurst?.(c.x, c.y, c.z);
      }
      fx.unravel?.(this._ghost, this._sampleGhost(), clamp(1 - (this.brain.modeT ?? 0) / 3, 0, 1), dt);
    }
    this._fxDying = dying;
    if (a) {
      // the sweep trail of whichever blade is cutting, from the snap out of the cock on (not through a
      // shudder: its flicker is no swing)
      for (const b of a.beats) {
        if (this.shuddering) break;
        if (b.feint || a.t < b.impact - 0.32 * b.W - 0.02 || a.t > b.end + 0.6 * b.A + 0.05) continue;
        const D = b.def;
        if (isCast(D)) break;
        if (D.left) fx.sweep(this._offHiltPrev, this._offTipPrev, this._offHilt, this._offTip, 'red');
        else if (main) {
          fx.sweep(this._hiltPrev, this._tipPrev, this._hilt, this._tip, 'red');
          if (f === 3) fx.sweep(this._backHiltPrev, this._backTipPrev, this._backHilt, this._backTip, 'red');
          if (f === 2 && D.zone?.kind === 'ring') fx.sweep(this._offHiltPrev, this._offTipPrev, this._offHilt, this._offTip, 'red');
        }
        break;
      }
      // the Void gathering in his hand through a cast's windup
      const cur = a.beats.find((b) => a.t < b.impact);
      const each = fx.look?.('void') === 'a';
      if (cur && !cur.feint && a.def.transition) {
        // an ignition's kneel (?ignite=a|b): the Void drawn in to him along the floor
        if (fx.look?.('ignite') !== '0') fx.igniteGather?.(this.position.x, this.position.z, clamp((a.t - cur.start) / Math.max(0.05, cur.impact - cur.start), 0, 1), dt, f);
      } else if (cur && !cur.feint && each) {
        // ?void=a: each spell gathers its own way (fx.gather); the grip's talons and the pull's line
        // round the hero stay as they are
        const D = cur.def, k = clamp((a.t - cur.start) / Math.max(0.05, cur.impact - cur.start), 0, 1), h = this._hand;
        const kind = D.bolt ? 'bolt' : D.pull ? 'pull' : D.grip ? 'grip' : D.cast?.kind === 'star' ? 'star' : D.release?.style === 'rift' ? 'rift' : D.release?.style === 'push' ? 'push' : D.cast?.kind === 'debris' ? 'debris' : D.cast?.kind === 'storm' ? 'storm' : null;
        // (a Void Lightning look, ?boltFx, draws its own windup in place of the bolt's gather: specialFx.js)
        if (kind && !(kind === 'bolt' && boltLook() !== '0')) fx.gather(kind, h, k, dt);
        if (D.pull) {
          const p = this.game.player;
          if (p?.getChestPos && k > 0.25) {
            p.getChestPos(_v, true);
            fx.pullStream(h.x, h.y, h.z, _v.x, _v.y, _v.z, k, dt);
          }
        } else if (D.grip) {
          const p = this.game.player?.position;
          const dist = clamp(p ? Math.hypot(p.x - this.position.x, p.z - this.position.z) : 4, 1.5, TUNING.grip.range);
          this._grip.x = this.position.x + Math.sin(this.yaw) * dist;
          this._grip.z = this.position.z + Math.cos(this.yaw) * dist;
          fx.gripClaw(this._grip.x, 1.15, this._grip.z, k);
        }
      } else if (cur && !cur.feint) {
        const D = cur.def, k = clamp((a.t - cur.start) / Math.max(0.05, cur.impact - cur.start), 0, 1), h = this._hand;
        if (D.bolt) { if (boltLook() === '0') fx.crackle(h.x, h.y, h.z, k, dt); }
        else if (D.pull) {
          fx.crackle(h.x, h.y, h.z, k, dt, [2.8, 0.2, 0.3]);
          const p = this.game.player;
          if (p?.getChestPos && k > 0.25) {
            p.getChestPos(_v, true);
            fx.pullStream(h.x, h.y, h.z, _v.x, _v.y, _v.z, k, dt);
          }
        } else if (D.grip) {
          // the Crushing Dark closes where his hand is aimed: on the hero while it still tracks him
          fx.crackle(h.x, h.y, h.z, k, dt, [2.8, 0.2, 0.3]);
          const p = this.game.player?.position;
          const dist = clamp(p ? Math.hypot(p.x - this.position.x, p.z - this.position.z) : 4, 1.5, TUNING.grip.range);
          this._grip.x = this.position.x + Math.sin(this.yaw) * dist;
          this._grip.z = this.position.z + Math.cos(this.yaw) * dist;
          fx.gripClaw(this._grip.x, 1.15, this._grip.z, k);
        } else if (D.cast?.kind === 'star') fx.crackle(h.x, h.y, h.z, k, dt, [2.2, 0.4, 3.0]);
        else if (D.release?.style === 'rift') fx.crackle(this._tip.x, this._tip.y, this._tip.z, k, dt, [3.0, 0.3, 0.2]);
        else if (D.release?.style === 'push' || D.cast?.kind === 'debris' || D.cast?.kind === 'storm') fx.crackle(h.x, h.y, h.z, k * 0.7, dt, [2.4, 1.6, 2.0]);
      }
    }
    this.specialFx?.frame(dt, a); // (Void Lightning's, the ignitions' looks: ?boltFx / ?igniteFx)
    if (this.mode === 'broken') fx.stunStars(this._hs[0]);
  }

  /** A beat's impact, its first frame. */
  onImpact(b, s, a) {
    const D = b.def;
    if (a?.def?.transition) {
      // the ignition: the new form's blades light, the shock ring goes out, the seal flares
      this.litWant = 1;
      this._changing = false;
      this.fx.igniteNova(this.position.x, this.position.z, TUNING.ignite.ringRadius, this.phase);
      this.fx.igniteBurst(this._hilt, this._tip, 1.5);
      this.specialFx?.ignite(this.phase);
      this.game.shake?.(0.4);
      this.game.world?.forest?.ambience?.flare?.(1);
      return;
    }
    if (D.grip) this.fx.gripSnap(this._grip.x, 1.15, this._grip.z); // (on him: hitPlayer adds the crush)
    if (D.bolt) {
      // the bolt: from his hand to the hero (in its line) or out along his facing
      const h = this._hand, p = this.game.player;
      const inLine = !!s && this.brain._inZone(D.zone, s);
      if (inLine && b.cover) {
        // the hero stands behind cover: the bolt strikes that (brain._coverFor already blasted it)
        this.fx.lightning(h.x, h.y, h.z, b.cover.x, Math.min(1.4, b.cover.h * 0.6), b.cover.z, 1.1, true);
        _v.set(b.cover.x, Math.min(1.4, b.cover.h * 0.6), b.cover.z);
      } else if (inLine && p?.getChestPos) {
        p.getChestPos(_v, true);
        this.fx.lightning(h.x, h.y, h.z, _v.x, _v.y, _v.z, 1.1, true);
      } else {
        const r = TUNING.bolt.range * 0.8;
        _v.set(this.position.x + Math.sin(this.yaw) * r, 0.4, this.position.z + Math.cos(this.yaw) * r);
        this.fx.lightning(h.x, h.y, h.z, _v.x, _v.y, _v.z, 1.1, true);
      }
      this.specialFx?.bolt(h, _v); // (?boltFx: its look over the bolt)
      this.emit('dragon:explosion', { x: h.x, z: h.z, radius: 2 });
    }
  }

  /** A blow at the hero. The pull drags him toward the lord; a bolt met by a perfect parry comes back. */
  hitPlayer(o) {
    const D = o.beat?.def, p = this.game.player;
    if (D?.pull && p?.position) {
      // (the hero's push is "away from the source": put the source on his far side)
      const px = p.position.x, pz = p.position.z;
      o = { ...o, from: { x: px + (px - this.position.x), z: pz + (pz - this.position.z) }, kind: 'pull' };
    } else if (D?.bolt) o = { ...o, kind: 'lightning' };
    // a blow out of a blink comes from wherever he appeared: a guard meets it from any side, as his
    // flurry's (the hero cannot turn to it in the time its cue gives)
    if (D?.blink) o = { ...o, extra: { ...(o.extra ?? null), around: true } };
    else if (D?.grip) o = { ...o, kind: 'grip', extra: { plunge: false } };
    const r = super.hitPlayer(o);
    if (D?.grip && r === RESULT.HIT && p?.position) {
      // caught: thrown to the floor, and the Void presses down on him
      this.fx.gripCrush(p.position.x, p.position.z, TUNING.grip.crush);
      this.game.shake?.(0.3);
    }
    if (D?.bolt && r === RESULT.PARRIED && p?.deflect?.perfect && this.mode !== 'dying' && this.mode !== 'dead') {
      // thrown back: it strikes him
      const B = TUNING.bolt, c = this._hs[1];
      if (p.getChestPos) {
        p.getChestPos(_v, true);
        this.fx.lightning(_v.x, _v.y, _v.z, c.x, c.y, c.z, 1.2, true, true);
      }
      this.emit('dragon:returned', { kind: 1, damage: B.returnDamage, x: c.x, y: c.y, z: c.z });
      super.takeHit({ damage: B.returnDamage, exact: true, heavy: true, posture: B.returnPosture, part: 'body', point: { x: c.x, y: c.y, z: c.z } });
    }
    return r;
  }

  /** The push's wall of force / the crescents of red light, thrown at a release beat's impact. */
  onRelease(b, s, act) {
    const R = b.def.release, base = s ? s.ang : this.yaw;
    if (R.style === 'push') {
      const P = TUNING.push;
      const sx = this.position.x + Math.sin(base) * 1.1, sz = this.position.z + Math.cos(base) * 1.1;
      this.fx.throwCrescent(sx, sz, Math.sin(base), Math.cos(base), { tell: b.def.tell, damage: b.def.damage, knockback: b.def.knockback, attack: act?.name ?? 'voidPush', style: 'push', speed: P.speed, radius: P.radius, half: P.half, life: P.life });
      this.fx.pushBurst(this._hand.x, this._hand.y, this._hand.z, Math.sin(base), Math.cos(base));
      this.game.shake?.(0.15);
      this.game.world?.gust?.(sx, sz, 1.4, 6);
      return;
    }
    if (R.style === 'rift') {
      // fissures from where the staff's point went in, fanned across his front
      // (a string's last fissures may run slower and start nearer: R.speed, R.from)
      const n = perPhase(R.count ?? 3, this.phase), F = TUNING.rift, off = R.from ?? 1.2;
      const ox = this.position.x + Math.sin(base) * off, oz = this.position.z + Math.cos(base) * off;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * (R.spread ?? 0.36);
        this.fx.throwCrescent(ox, oz, Math.sin(a), Math.cos(a), { tell: b.def.tell, damage: b.def.damage, knockback: b.def.knockback, attack: act?.name ?? 'rift', style: 'rift', speed: R.speed ?? F.speed, radius: F.radius, life: F.life });
      }
      this.fx.igniteBurst(this._hilt, this._tip, 0.8);
      this.fx.dust(ox, oz, 1.6);
      this.game.shake?.(0.3);
      this.game.world?.forest?.ambience?.flare?.(0.6);
      return;
    }
    const n = perPhase(R.count ?? 1, this.phase), C = TUNING.crescent;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * (R.spread ?? 0.34);
      const off = R.from ?? 1;
      this.fx.throwCrescent(this.position.x + Math.sin(a) * off, this.position.z + Math.cos(a) * off, Math.sin(a), Math.cos(a), { tell: b.def.tell, damage: b.def.damage, knockback: b.def.knockback, attack: act?.name ?? 'tide', style: 'crescent', speed: R.speed ?? C.speed, radius: C.radius, life: C.life });
    }
  }

  /** A cast beat's impact: the thrown blade, torn stone, called lightning. */
  onCast(b, s, act) {
    const D = b.def, C = D.cast, name = act?.name ?? C.kind;
    if (act?.def?.terrain) return this.terrain.onCast(b, s, act);
    // the second pass's Void: the wheeling blade, the orbit, Starless Night (spells.js)
    if (this.spells.cast(b, s, act)) return;
    const ang = s ? s.ang : this.yaw, dx = Math.sin(ang), dz = Math.cos(ang);
    if (C.kind === 'glaive') {
      const G = TUNING.glaive;
      const shot = this.fx.throwShot({ kind: 'glaive', x: this._hilt.x, y: 1.05, z: this._hilt.z, dx, dz, speed: G.speed, back: G.back, range: G.range, radius: G.radius, life: G.life, tell: D.tell, damage: D.damage, knockback: D.knockback, attack: name });
      if (shot) this.glaiveOut = true;
    } else if (C.kind === 'debris') {
      const T = TUNING.debris, n = C.count ?? 3;
      for (let i = 0; i < n + (C.big ? 1 : 0); i++) {
        const big = i >= n;
        const a = ang + (i - (n - 1) / 2) * 0.9 + Math.PI * 0.5 * (i & 1 ? 1 : -1) * 0.4;
        const r = big ? 2.2 : 1.7;
        const x = this.position.x + Math.sin(a) * r, z = this.position.z + Math.cos(a) * r;
        this.fx.tearUp(x, z);
        this.game.world?.scars?.ground?.(x, z, big ? 1.1 : 0.75); // (the floor it was torn from stays cracked)
        this.fx.throwShot({
          // (it hangs turning round him in the Void's grip until its turn: fx.js `orbit`, angle from +x)
          orbit: { r, a: Math.atan2(z - this.position.z, x - this.position.x), w: i & 1 ? -1.6 : 1.6 },
          kind: 'stone', x, y: 0.2, z, dx, dz, speed: T.speed * (big ? 0.85 : 1), radius: big ? 1.25 : T.radius, life: T.life, delay: 0.4 + i * T.gap + (big ? 0.25 : 0), rise: T.rise + (big ? 0.5 : 0) + 0.2 * (i & 1),
          tell: big ? TELL.RED : D.tell, damage: big ? D.damage * 1.9 : D.damage, knockback: big ? 4 : D.knockback, attack: name, big,
        });
      }
      this.game.shake?.(0.2);
    } else if (C.kind === 'storm') {
      this._storm.left = C.count ?? 6;
      this._storm.t = 0;
      this._storm.damage = D.damage;
      this._storm.kb = D.knockback;
      this.fx.lightning(this._tip.x, this._tip.y, this._tip.z, this._tip.x + this.spells.lr(-2, 2), 24, this._tip.z + this.spells.lr(-2, 2), 1.6, true);
    } else if (C.kind === 'star') {
      // the Dark Star leaves his hand: it gathers a few steps before him and goes after the hero
      const S = TUNING.star, h = this._hand;
      const star = { x: this.position.x + dx * 2.6, z: this.position.z + dz * 2.6 };
      this.clampTarget(star);
      // cast inside a string (`after`): it drifts after the hero while the string runs and bursts
      // `after` s past the string's last blow
      let warn = S.warn;
      if (C.after && act) {
        let last = act.t;
        for (const x of act.beats) if (!x.feint && x !== b && x.impact > last) last = x.impact;
        warn = Math.max(S.minWarn ?? 1.2, last - act.t + (S.after ?? 0.45));
      }
      this.fx.callStrike(star.x, star.z, S.radius, warn, { damage: D.damage, knockback: D.knockback, attack: name, style: 'star', drift: S.drift });
      this.fx.arc(h.x, h.y, h.z, star.x, 1.25, star.z, 0.3, [2.6, 0.5, 3.4], [0.35, 0.05, 0.6], 7);
      this.game.shake?.(0.15);
    }
  }

  /** The thrown blade is back in his hand (fx.js). */
  onGlaiveBack() {
    if (!this.glaiveOut) return;
    this.glaiveOut = false;
    this.fx.igniteBurst(this._hilt, this._tip, 0.6);
  }

  /** His bones as drawn this frame (world), for the shape a blink leaves: fills this._ghost, returns
   *  how many segments. */
  _sampleGhost() {
    const out = this._ghost;
    let n = 0;
    for (const chain of this.rig.ghostChains) {
      for (let i = 0; i + 1 < chain.length && n < 15; i++) {
        chain[i].getWorldPosition(_v);
        chain[i + 1].getWorldPosition(_w);
        if (!Number.isFinite(_v.x + _v.y + _v.z + _w.x + _w.y + _w.z)) continue;
        out.set([_v.x, _v.y, _v.z, _w.x, _w.y, _w.z], n * 6);
        n++;
      }
    }
    if (this._tipOk && n < 16) {
      out.set([this._hilt.x, this._hilt.y, this._hilt.z, this._tip.x, this._tip.y, this._tip.z], n * 6);
      n++;
    }
    return n;
  }

  /** A beat's own root motion: the blink (he is gone, and behind the hero). */
  beatMotion(b, u, s) {
    // the catch: the wheeling blade comes home to his hand
    if (b.def.catch && !b._caught && u >= 0.2) {
      b._caught = true;
      this.spells.catch();
    }
    const K = b.def.blink;
    if (!K || b._blinked || u < 0.1 || !s) return;
    b._blinked = true;
    this.fx.afterimage(this._ghost, this._sampleGhost());
    const pl = this.game.player, yaw = fin(pl?.yaw, wrapAngle(s.ang + Math.PI));
    const x0 = this.position.x, z0 = this.position.z;
    let tx = s.p.x - Math.sin(yaw) * K.behind, tz = s.p.z - Math.cos(yaw) * K.behind;
    if (!this.onFloor(tx, tz)) {
      // no room behind him: to his side instead
      tx = s.p.x + Math.cos(yaw) * K.behind;
      tz = s.p.z - Math.sin(yaw) * K.behind;
    }
    this.position.x = tx;
    this.position.z = tz;
    this.moveBy(0, 0);
    this.yaw = Math.atan2(s.p.x - this.position.x, s.p.z - this.position.z);
    this.anim.teleported?.();
    this.fx.blinkTrail(x0, z0, this.position.x, this.position.z);
  }

  // ---------------------------------------------------------------- the second pass (core)
  /** His combo links (links.js; duelist/brain.js reads `d.LINKS`). */
  get LINKS() {
    return LINKS;
  }
}
