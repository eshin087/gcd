import * as THREE from 'three';
import { clamp, wrapAngle } from '../../../core/math.js';
import { TELL, RESULT } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { P, to3 } from '../../player/anim.js';
import { TUNE as HERO_TUNE } from '../../player/player.js';
import { Duelist } from '../duelist/duelist.js';
import { DuelBrain } from '../duelist/brain.js';
import { GUARD_KINDS } from '../duelist/guard.js';
import * as GEAR from './gear.js';
import * as LOOK from './look.js';
import { HermitFx } from './fx.js';
import { phasePoses, BEHIND } from './poses.js';
import { MOVES, MOVE_NAMES, CLIP, CLIPS_BY_PHASE, TRANSITIONS, COUNTER, realise } from './moves.js';
import { TUNING } from './tuning.js';
import { LINKS } from './links.js';

// Gu Shan, the One-Blow Hermit: the boss of the Lone Peak Hermitage (`?level=peak`; ADR-138). A
// duelist (duelist/duelist.js: the body, the contract, the guard, posture; brain.js: the mind) with
// his own kit: moves (moves.js), numbers (tuning.js), stances (poses.js), effects (fx.js: HermitFx),
// gear and look (gear.js, look.js). What only he does is here:
//   - EVERY BLOW KILLS (ADR-139): each blow carries `lethal` (TUNING.lethal) to player.takeHit, which
//     decides it (LAST BREATH, death, a shattered guard). A hero thrown by it, or pushed off a
//     shattered guard, goes THROUGH what stands behind him (the world takes his slide).
//   - GREED: he never guards in a windup or a recovery; a cut in his windup bites at TUNING.skin.windup
//     (sparks off the gathered qi), in his recovery in full. Nothing but a posture break cancels a
//     windup (the hero's cuts never knock him out of it: the engine's hit stun leaves a windup alone).
//   - BARE HANDS, as Tian Lei's (ascendant.js): his "blade" is the striking hand of the moment
//     (_limbSeg), the left behind his back until phase 3 (BOTH HANDS).
//   - THE STEP (a beat's `step`): he is gone and stands `r` m off the hero, then winds up.
//   - THE WIND (a beat's `wind`, brain._coverFor): a line blow the first cover in its way takes.
//   - he does not punish a drink: he waits (HermitBrain._foot), and nothing weighs more for it.
//   - the world: every blow's force carries on past its zone (onImpact: TUNING.world).

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
/** The beat a move is in at its time t (its windup or its active frames), or null. */
const beatNow = (a) => (a ? a.beats.find((b) => a.t < b.end + 1e-6) ?? null : null);

const POSES = Object.freeze({
  loco: (p, A) => {
    const ph = A.player?.phase ?? 1;
    phasePoses(ph).duelLoco(p, A);
    // (phases 1 - 2: the left hand stays behind his back at a run too: the gait would swing it)
    if (ph < 3) {
      to3(p, P.lH, BEHIND.lH[0], BEHIND.lH[1], BEHIND.lH[2], 1);
      to3(p, P.lP, BEHIND.lP[0], BEHIND.lP[1], BEHIND.lP[2], 1);
    }
  },
  duel: (p, A) => phasePoses(A.player?.phase ?? 1).duelClip(p, A),
});

/** Everything the shared duelist needs to be him (duelist.js: kit). */
export const HERMIT_KIT = Object.freeze({
  id: 'hermit',
  TUNING, MOVES, MOVE_NAMES, CLIP, realise,
  transitions: TRANSITIONS,
  counterMove: () => COUNTER,
  // (no streakMove: he has no flurry; brain.onGuarded finds no such move and never starts one)
  maxPhase: 3,
  loadout: GEAR.HERMIT_LOADOUT ?? {},
  poses: POSES,
  blade: Object.freeze({ guard: GEAR.HAND?.guard ?? -0.06, tip: GEAR.HAND?.tip ?? 0.075 }),
  scale: TUNING.scale,
  dress: (d, dt) => LOOK.dressHermit?.(d, dt),
});

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** His mind: the duelist's, with each phase's reaction clips; he waits while the hero drinks. */
class HermitBrain extends DuelBrain {
  get C() {
    return CLIPS_BY_PHASE[clamp(this.d.phase | 0, 1, CLIPS_BY_PHASE.length) - 1];
  }
  set C(v) {} // (the base constructor assigns the kit's set: his is per phase)

  /** A blow out of a step reaches wherever the hero is. */
  _reach(b) {
    if (b.def.step) return Infinity;
    return super._reach(b);
  }

  /** Footwork. While the hero drinks a flask he only watches him (no move starts, no closing in):
   *  the base brain would punish the drink. */
  _foot(dt) {
    const d = this.d, pl = d.game.player;
    if (pl?.state === 'heal' && this.aiEnabled) {
      const s = this._sense();
      if (s) d.yaw = wrapAngle(d.yaw + clamp(wrapAngle(s.ang - d.yaw), -3 * dt, 3 * dt));
      d.groundVelSet(0, 0);
      this.gapT = Math.max(this.gapT, 0.35);
      return;
    }
    super._foot(dt);
  }
}

export class Hermit extends Duelist {
  constructor(game) {
    super(game, HERMIT_KIT);
  }

  // ---------------------------------------------------------------- build
  _tint(M) {
    LOOK.tintHermit?.(M);
  }
  _makeFx() {
    return new HermitFx(this);
  }
  _makeBrain() {
    return new HermitBrain(this);
  }

  _setup() {
    this._part = 'fistR';
    this._partPrev = '';
    this._ptsOk = false;
    this._q = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._blowO = { kind: 'blunt', by: 'boss', dx: 0, dz: 0, y: 1, src: -1, scar: true, falloff: 0, down: false };
    const d = this;
    /** Lab, tests: straight into phase n (1..3) with no transition: his bar at that phase's top. */
    this.debug.setPhase = (n) => {
      n = clamp(Math.round(fin(Number(n), 1)), 1, 3);
      if (d.mode === 'dying' || d.mode === 'dead') return false;
      d.brain.startFight();
      d.brain.pendingPhase = 0;
      d.enterPhase(n);
      d.hp = d.maxHp * (TUNING.phaseAt[n - 1] ?? 1);
      d.brain._toFoot(0.3);
      return true;
    };
  }

  // ---------------------------------------------------------------- contract
  reset() {
    if (this._q) {
      this._ptsOk = false;
      this._partPrev = '';
    }
    super.reset();
  }

  /**
   * A hit from the hero. He is greedy: no guard in a windup, so the cut lands, but only bites
   * (TUNING.skin.windup) while his blow is coming; final damage (a counter, a flurry, an execution:
   * `exact`) ignores his skin. Nothing the hero does in a windup knocks him out of it (the engine's
   * hit stun leaves a windup alone; a crushing heavy needs his guard up, and it never is in a windup).
   */
  takeHit(o = {}) {
    if (o && !o.exact && this.mode === 'act' && !this.broken) {
      const a = this.brain.act, b = beatNow(a);
      if (a && !a.def.transition && b && !b.feint && a.t < b.impact) {
        const k = fin(this.T.skin?.windup, 1);
        if (k < 1) {
          o = { ...o, damage: fin(Number(o.damage)) * k };
          const pt = o.point;
          if (pt) this.fx.skin?.(pt.x, pt.y, pt.z, fin(o.dir?.x), fin(o.dir?.z));
        }
      }
    }
    return super.takeHit(o);
  }

  _animate(dt) {
    this.pilot.phase = this.phase;
    this._introTurn(dt);
    super._animate(dt);
  }

  /** The intro (moves.js CLIPS.intro): his back to the path, he turns his head, then his whole body
   *  round to the hero between `turn` s of the clip (his root, not the clip: a clip's yaw is the waist). */
  _introTurn(dt) {
    if (this.mode !== 'intro') {
      this._turn0 = null;
      return;
    }
    const p = this.game.player?.position, t = this.brain.modeT;
    if (!p) return;
    if (this._turn0 == null) this._turn0 = this.yaw;
    const want = Math.atan2(p.x - this.position.x, p.z - this.position.z);
    const k = clamp((t - 0.9) / 0.6, 0, 1), e = k * k * (3 - 2 * k);
    this.yaw = wrapAngle(this._turn0 + wrapAngle(want - this._turn0) * e);
  }

  // ---------------------------------------------------------------- his blows
  /** Every blow of his kills (ADR-139): `lethal` goes with it. A hero thrown by it (a Last Breath)
   *  or pushed off his shattered guard slides THROUGH what stands behind him. */
  hitPlayer(o) {
    o = { ...o, extra: { ...(o.extra ?? null), lethal: this.T.lethal } };
    const r = super.hitPlayer(o);
    const pl = this.game.player, L = pl?.lethalLast;
    if (L && L.t === pl.time && (L.kind === 'breath' || L.kind === 'shatter' || L.kind === 'death' || L.kind === 'god')) this._slide(pl, L);
    // the palm's force past the hero: a parry turns it aside at an angle; a roll lets it go on straight;
    // a blow that landed (he is thrown along its line) sends it across, never onto where he will lie
    if (this._palmDue && o.beat === this._palmDue) {
      this._palmDue = null;
      if (r !== RESULT.IGNORED) this._palmCarry(o.beat.def, r === RESULT.PARRIED ? 'deflected' : r === RESULT.DODGED || r === RESULT.PERFECT ? 'straight' : 'across');
    }
    return r;
  }

  /** The palm's force carried on past his reach (T.world.palm): `straight` down its line, `deflected` (a
   *  parry) turned 0.6 rad aside past the hero, `across` (it landed) the same line with what it fells
   *  thrown across it. */
  _palmCarry(D, mode) {
    const W = this.game.world?.destructibles, WT = this.T.world ?? {};
    if (!W?.sweep) return;
    const r0 = D.zone?.r ?? 3, L = WT.palm?.len ?? 9, x = this.position.x, z = this.position.z;
    let a = this.yaw;
    if (mode === 'deflected') {
      const p = this.game.player?.position, side = p ? Math.sign(Math.sin(this.yaw - Math.atan2(p.x - x, p.z - z)) || 1) : 1;
      a += 0.6 * side;
    }
    const yf = Math.sin(a), zf = Math.cos(a), o = this._blowO;
    o.kind = 'blast';
    o.dx = mode === 'across' ? -zf : yf;
    o.dz = mode === 'across' ? yf : zf;
    o.y = 1;
    o.falloff = 0;
    o.down = false;
    o.scar = true;
    o.src = W.swing();
    W.sweep(x + yf * r0, z + zf * r0, x + yf * (r0 + L), z + zf * (r0 + L), 0.7, mode === 'deflected' ? WT.deflected ?? 1.6 : WT.palm?.power ?? 1.4, o);
    if (mode === 'deflected') this.fx.lane?.(x + yf * r0, z + zf * r0, yf, zf, L * 0.7, 0.9, 0.7);
  }

  /** The world under the hero's slide (a Last Breath, a shattered guard): what stands in his way along
   *  it takes T.world.thrown, so he goes through the stone behind him. */
  _slide(pl, L) {
    const p = pl.position, W = this.game.world?.destructibles;
    const k = HERO_TUNE?.knockbackDecay ?? 6;
    const ex = p.x + fin(pl.kb?.x) / k, ez = p.z + fin(pl.kb?.z) / k;
    const len = Math.hypot(ex - p.x, ez - p.z);
    if (!(len > 0.3)) return;
    this.fx.slide?.(p.x, p.z, ex - p.x, ez - p.z, len / 10);
    if (!W?.sweep) return;
    const o = this._blowO;
    o.kind = 'blunt';
    // (what he goes through falls ACROSS his slide, never onto where he will lie: a falling stone is a
    // red blow of the world, and a Last Breath is one health left)
    o.dx = -(ez - p.z) / len;
    o.dz = (ex - p.x) / len;
    o.src = W.swing();
    o.scar = false;
    o.falloff = 0;
    o.down = false;
    W.sweep(p.x, p.z, ex, ez, 0.5, this.T.world?.thrown ?? 2.4, o);
  }

  // ---------------------------------------------------------------- his limbs
  /** The limb his "blade" is now: the striking hand of the beat under way, the right palm of a ward. */
  _strikePart() {
    const br = this.brain;
    if (this.mode === 'act') {
      const b = beatNow(br.act);
      if (b && !br.act.def.transition) return b.def.part ?? 'fistR';
    } else if (this.mode === 'react' && GUARD_KINDS.has(br.react?.kind)) return 'fistR';
    return 'fistR';
  }

  /** Hand `part` as drawn now: a (the forearm's root) → b (the hand), world space. */
  _limbSeg(part, a, b) {
    const r = this.rig, A = r.arms;
    if (part === 'fistL') {
      a.setFromMatrixPosition(A.L.fore.matrixWorld);
      b.set(0, -DIM.foreArm - 0.06, 0).applyMatrix4(A.L.fore.matrixWorld);
      return b;
    }
    if (part === 'feet') {
      a.set(this.position.x, 0.25, this.position.z);
      b.set(this.position.x, 0.6, this.position.z);
      return b;
    }
    a.setFromMatrixPosition(A.R.fore.matrixWorld);
    b.setFromMatrixPosition(r.sword.matrixWorld);
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = Math.hypot(dx, dy, dz) || 1;
    b.x += (dx / l) * 0.05;
    b.y += (dy / l) * 0.05;
    b.z += (dz / l) * 0.05;
    return b;
  }

  /** Where a beat's glint pops: the striking hand (both hands' middle for `palms`). */
  tellPoint(part, out) {
    if (part === 'feet' || !this._ptsOk) return super.tellPoint(part === 'feet' ? 'feet' : 'tip', out);
    if (part === 'palms') {
      this._limbSeg('fistR', _a, out);
      this._limbSeg('fistL', _a, _b);
      return out.set((out.x + _b.x) * 0.5, (out.y + _b.y) * 0.5, (out.z + _b.z) * 0.5);
    }
    this._limbSeg(part ?? 'fistR', _a, out);
    if (!Number.isFinite(out.x + out.y + out.z)) out.set(this.position.x, 1.3, this.position.z);
    return out;
  }

  /** Drawn points for FX: the striking hand's root and end (the engine's hilt and tip). */
  _drawnPoints() {
    this._tipPrev.copy(this._tip);
    this._hiltPrev.copy(this._hilt);
    const part = this._strikePart() === 'palms' ? 'fistR' : this._strikePart();
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

  /** Posed at clip time t now (parryContact steps the pose back along the strike): the striking hand. */
  _poseAt(t) {
    super._poseAt(t);
    this._limbSeg(this._part, this._hilt, this._tip);
  }

  // ---------------------------------------------------------------- the AI's say
  /**
   * The weight of a move right now (brain._choose). The One Blow weighs more against a hero far away or
   * behind cover (he would kite; the lane is the answer); nothing starts while the hero drinks.
   */
  weigh(name, def, w, dist) {
    if (this.game.player?.state === 'heal') return 0;
    if (name === 'oneBlow') {
      if (dist > 7) w *= 2;
      const p = this.game.player?.position, W = this.game.world?.destructibles;
      if (p && W?.coverAt?.(this.position.x, this.position.z, p.x, p.z, 0.2)) w *= 2.5;
    }
    return w;
  }

  // ---------------------------------------------------------------- the step
  /** One Step / Closing Mountains (a beat's `step: { r }`): at the windup's start, once, he is gone and
   *  stands `r` m from the hero on the side he came from, facing him (an afterimage where he stood). */
  beatMotion(b, u, s) {
    const K = b.def.step;
    if (!K || b._stepped || !s || u < 0.02) return;
    b._stepped = true;
    const r = fin(K.r, 2.2), a = Math.atan2(this.position.x - s.p.x, this.position.z - s.p.z);
    let tx = s.p.x + Math.sin(a) * r, tz = s.p.z + Math.cos(a) * r;
    if (!this.standable(tx, tz)) {
      // (no room on his side: round the hero, the nearest side he may stand on)
      for (const da of [0.8, -0.8, 1.6, -1.6, Math.PI]) {
        const x = s.p.x + Math.sin(a + da) * r, z = s.p.z + Math.cos(a + da) * r;
        if (!this.standable(x, z)) continue;
        tx = x;
        tz = z;
        break;
      }
    }
    const x0 = this.position.x, z0 = this.position.z;
    this.position.x = tx;
    this.position.z = tz;
    this.moveBy(0, 0);
    this.yaw = Math.atan2(s.p.x - this.position.x, s.p.z - this.position.z);
    this.object3d.rotation.y = this.yaw;
    this.anim.teleported?.();
    this.fx.afterimage?.(this, x0, z0, this.position.x, this.position.z);
  }

  // ---------------------------------------------------------------- impacts
  /** The centre of a zone (a zone may sit `fwd` m ahead of him and `side` m to his left). */
  zoneCentre(z, out) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), f = fin(z?.fwd), sd = fin(z?.side);
    return out.set(this.position.x + fx * f + fz * sd, 0, this.position.z + fz * f - fx * sd);
  }

  /**
   * A beat's impact, its first frame (before the zone test; b.cover already found): the force of the
   * blow carries on past its zone (TUNING.world), drawn as air, dust and stone.
   *   palm    the palm's push: `palm.len` m of force past his reach (destructibles.sweep)
   *   lane    The One Blow: the whole lane at `lane`, a scar down it, the pines it passes catch; a
   *           cover the hero stood behind stops it there
   *   crater  a fist in the floor: world.impact at `crater`
   *   stamp / clap   a transition: the ring of air out to the zone's edge (falloff), the stones crack
   *           or fall outward
   */
  onImpact(b, s, a) {
    const D = b.def, fx = this.fx, w = this.game.world, W = w?.destructibles, WT = this.T.world ?? {};
    const yf = Math.sin(this.yaw), zf = Math.cos(this.yaw);
    const o = this._blowO;
    o.dx = yf;
    o.dz = zf;
    o.y = 1;
    o.falloff = 0;
    o.down = false;
    o.scar = true;
    o.src = W?.swing?.() ?? -1;
    const x = this.position.x, z = this.position.z;
    switch (D.carry) {
      case 'palm': {
        fx.palmBurst?.(x + yf * 0.6, z + zf * 0.6, yf, zf, 1);
        // (with the hero in its reach the force goes where his answer sends it: hitPlayer)
        if (s && this.brain._inZone(D.zone, s)) this._palmDue = b;
        else this._palmCarry(D, 'straight');
        break;
      }
      case 'lane': {
        // (a cover the hero stood behind: the lane ends there, the cover took it: brain._coverFor)
        const len = b.cover ? Math.max(1, Math.hypot(b.cover.x - x, b.cover.z - z)) : D.zone?.r ?? 14, half = (D.zone?.w ?? 1.6) / 2;
        fx.lane?.(x + yf * 0.5, z + zf * 0.5, yf, zf, len, half * 2, 1.4);
        this.game.world?.forest?.ambience?.flare?.(0.6);
        if (!b.cover) {
          o.kind = 'blast';
          W?.sweep?.(x + yf * 0.5, z + zf * 0.5, x + yf * len, z + zf * len, half, WT.lane ?? 3, o);
          for (let d = 1.5; d < len; d += 2.2) w?.scars?.ground?.(x + yf * d, z + zf * d, 1.6, yf, zf);
          w?.ignite?.(x + yf * len * 0.5, z + zf * len * 0.5, len * 0.5, WT.burn ?? 0.6, false);
        }
        this.game.shake?.(0.5);
        break;
      }
      case 'crater': {
        const c = this.zoneCentre(D.zone, this._q), C = WT.crater ?? { r: 4.5, power: 2.4 };
        fx.crater?.(c.x, c.z, Math.min(C.r, (D.zone?.r ?? 3.6) * 0.9), 1.3);
        o.kind = 'blunt';
        o.dx = o.dz = NaN;
        w?.impact?.(c.x, c.z, C.r, C.power, o);
        break;
      }
      case 'stamp':
      case 'clap': {
        const r = D.zone?.r ?? 6.5, S = WT.stamp ?? { power: 2.5, falloff: 0.5 };
        fx.stamp?.(x, z, r, D.carry === 'clap' ? 1.3 : 1.1);
        o.kind = 'blast';
        o.dx = o.dz = NaN;
        o.falloff = S.falloff;
        w?.impact?.(x, z, r, S.power, o);
        // the ring's inner striking stones answer the whole ledge: the stamp cracks them, the clap fells
        // them outward (the arena is the clock: the cover thins at each phase)
        // (and the clap cracks the rim's stones too: the last phase's blows bring them down)
        const inner = WT.inner?.[D.carry] ?? 0, rim = WT.rim?.[D.carry] ?? 0;
        if ((inner > 0 || rim > 0) && W?.list) {
          const io = this._innerO ?? (this._innerO = { kind: 'blast', by: 'boss', dx: 0, dz: 0, y: 1, src: -1, scar: false });
          io.src = W.swing();
          for (const P of W.list) {
            if (P.kind !== 'post' || P.state !== 0) continue;
            const pw = P.def?.inner ? inner : rim;
            if (!(pw > 0)) continue;
            const l = Math.hypot(P.x - x, P.z - z) || 1;
            io.dx = (P.x - x) / l;
            io.dz = (P.z - z) / l;
            W.strike(P.x, P.z, 0.2, pw, io);
          }
        }
        W?.wind?.(x, z, 1.2, 26, { from: 12 });
        this.game.world?.forest?.ambience?.flare?.(1);
        this.game.shake?.(0.5);
        break;
      }
      default: {
        // a hand's blow with no carry: a puff of dust where it meets the air
        const c = this.zoneCentre(D.zone, this._q);
        if (D.zone?.kind === 'ring') fx.crater?.(c.x, c.z, D.zone.r * 0.6, 0.8);
        else fx.dust?.(x + yf * 1.2, z + zf * 1.2, 0.6);
      }
    }
    // (a line blow's cover: brain._coverFor struck it; drawn here as the lane ending on it)
    if (b.cover && D.carry !== 'lane') fx.dust?.(b.cover.x, b.cover.z, 1.2);
  }

  /** Split Earth's release: a fissure (a fan of three in phase 3) runs along the floor at the hero. */
  onRelease(b, s, a) {
    const D = b.def, R = D.release ?? {}, ph = this.phase;
    const n = Array.isArray(R.fan) ? R.fan[clamp(ph, 1, R.fan.length) - 1] : 1;
    const ang = s ? s.ang : this.yaw;
    const C = this.T.crescent;
    for (let i = 0; i < n; i++) {
      const da = n > 1 ? (i - (n - 1) / 2) * 0.32 : 0, dx = Math.sin(ang + da), dz = Math.cos(ang + da);
      const c = this.fx.throwCrescent(this.position.x + dx * 0.8, this.position.z + dz * 0.8, dx, dz, { tell: D.tell ?? TELL.RED, damage: D.damage, knockback: 2.5, attack: a?.name ?? 'splitEarth' });
      if (c) {
        c.style = 'fissure';
        c.speed = C?.speed ?? 13;
        c.radius = C?.radius ?? 0.9;
        c.half = 0.9;
        c.life = C?.life ?? 1.8;
      }
    }
    this.fx.crater?.(this.position.x + Math.sin(ang) * 1.0, this.position.z + Math.cos(ang) * 1.0, 1.4, 0.8);
    this.game.shake?.(0.3);
  }

  /** The fissures tear the floor as they run (the crescent pool flies them: DuelFx.updateCrescents). */
  brainFrame(dt) {
    const W = this.game.world?.destructibles;
    if (!W?.sweep) return;
    for (const c of this.fx.crescents) {
      if (!c.alive || c.style !== 'fissure') continue;
      if (c.wsrc === undefined || c.age < (c.wAge ?? 0)) c.wsrc = W.swing();
      c.wAge = c.age;
      const sp = (c.speed ?? 13) * dt, o = this._fissO ?? (this._fissO = { kind: 'blunt', by: 'boss', dx: 0, dz: 0, y: 0.4, src: -1, down: true });
      // a striking stone in its way takes it (T.world.crescent) and falls ACROSS its path (not onto a hero
      // behind it, as the pool's own stop would throw it): the fissure ends there
      const cov = W.coverAt?.(c.x, c.z, c.x + c.dx * sp * 1.5, c.z + c.dz * sp * 1.5, 0.45);
      if (cov) {
        const pp = this.game.player?.position, sd = pp && (cov.x - pp.x) * c.dz - (cov.z - pp.z) * c.dx >= 0 ? 1 : -1;
        const so = this._fissC ?? (this._fissC = { kind: 'blast', by: 'boss', dx: 0, dz: 0, y: 0.6, src: -1, scar: false });
        so.dx = -c.dz * sd;
        so.dz = c.dx * sd;
        so.src = W.swing();
        W.strike(cov.x, cov.z, 0.2, this.T.world?.crescent ?? 3, so);
        this.fx._fizzle?.(c);
        this.fx.dust?.(cov.x, cov.z, 1.2);
        c.alive = false;
        continue;
      }
      o.dx = c.dx;
      o.dz = c.dz;
      o.src = c.wsrc;
      W.sweep(c.x - c.dx * sp, c.z - c.dz * sp, c.x, c.z, 0.5, this.T.world?.fissure ?? 1.2, o);
    }
  }

  // ---------------------------------------------------------------- after the pose
  /** The smear off the striking hand through a blow; The One Blow's still air; the stars of a break. */
  afterPose(dt, a) {
    const fx = this.fx;
    if (a && this._tipOk && !a.def.transition && !this.shuddering) {
      for (const b of a.beats) {
        if (b.feint || a.t < b.impact - 0.32 * b.W - 0.02 || a.t > b.impact + 1.6 * b.A + 0.05) continue;
        const D = b.def, heavy = D.tell === TELL.RED || D.tell === TELL.BLACK;
        fx.limbTrail?.(this._tipPrev.x, this._tipPrev.y, this._tipPrev.z, this._tip.x, this._tip.y, this._tip.z, heavy);
        break;
      }
      const cur = beatNow(a);
      if (cur && !cur.feint && cur.def.tell === TELL.BLACK && a.t < cur.flash) {
        const k = clamp((a.t - cur.start) / Math.max(0.05, cur.flash - cur.start), 0, 1);
        fx.stillAir?.(this._tip.x, this._tip.y, this._tip.z, k, dt);
      }
    }
    if (this.mode === 'broken') fx.stunStars(this._hs[0]);
  }

  // ---------------------------------------------------------------- combo links
  get LINKS() {
    return LINKS;
  }
}

