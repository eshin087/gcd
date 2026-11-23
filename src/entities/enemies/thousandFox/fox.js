import * as THREE from 'three';
import { Duelist, HERO_SCALE } from '../duelist/duelist.js';
import { GUARD_KINDS } from '../duelist/guard.js';
import { DIM } from '../../player/model.js';
import { DuelBrain } from '../duelist/brain.js';
import { perPhase } from '../duelist/realise.js';
import { densityOf } from '../duelist/director.js';
import { TELL } from '../../../combat/rules.js';
import { FOX_LOADOUT, FOX_FIST } from './gear.js';
import { FOX_POSES } from './poses.js';
import { MOVES, MOVE_NAMES, CLIP, TRANSITIONS, realise } from './moves.js';
import { TUNING } from './tuning.js';
import { LINKS } from './links.js';
import { tintFox, dressFox, foxLook } from './look.js';
import { FoxClones } from './clones.js';
import { FoxPearl } from './pearl.js';
import { FoxFx } from './fx.js';
import { FoxHowl } from './beam.js';

// Wen Yao, the Thousand-Body Fox: the boss of the Foxfire Terrace (`?level=fox`; ADR-147). A masked dao
// swordsman on the shared duelist engine (duelist/duelist.js: the body, the contract, the guard, posture,
// the duel's moments; brain.js: the mind and timeline). One health bar, three phases. What only he does:
//   - THE PAPER SELVES (clones.js FoxClones): extra bodies of his own, a fixed pool built here, stepped
//     from brainFrame and posed from afterPose. They pop in one hit (takeHit: a sphere marked 'cloneN').
//     The real one is always findable: the lock-on, the name tag, the boss bar and the minimap follow only
//     him; only he holds the Pearl (its threads end in his hand); only he casts a shadow; only his blade
//     is steel (the sweep trail, the lit edge); in phase 3 only he wears the mantle.
//   - THE PEARL (pearl.js FoxPearl): charged over the blade (fed by a thread from every live self), batted
//     at the hero, a red burst whose size grows with the live selves. Starved by popping selves,
//     interrupted by two cuts on him while he charges, dodged by a roll.
//   - THE FOX-FIRE MANTLE (phase 3): a fox's head and pelt of fire round him (FoxFx.mantle); where he
//     stands the wood and the hill's grass catch (world.ignite), the tail's sweep and the pounce hit the
//     world.
// Every hook below is the engine's (duelist.js header): no change to the engine was needed.

/** His paper self's cut, realised once (its windup is fixed: the same clip every time). */
const PAPER_CUT = () => realise('paperCut', 1, () => 0.5);

/** Everything the shared duelist needs to be him (duelist.js: kit). */
export const FOX_KIT = Object.freeze({
  id: 'thousandFox',
  TUNING, MOVES, MOVE_NAMES, CLIP, realise,
  transitions: TRANSITIONS,
  counterMove: () => 'riposte',
  streakMove: () => 'streakFlurry',
  loadout: FOX_LOADOUT,
  poses: FOX_POSES,
  // (bare-handed: the right fist on the sword joint; fox.js makes the striking limb the engine's blade)
  blade: FOX_FIST,
  dress: (d, dt) => dressFox(d, dt),
  // his ink-line letters follow his size on screen as the hero's do (render/pipeline.js: the bosses'
  // cell set from U.uBossScreen's depth by _updateHeroLetters' rule; ?foxLetters=a turns it off)
  letters: true,
});

/** His mind: the duelist's, with the trade of places counted in a string's reach and the Round
 *  realised for the selves alive as it starts. */
class FoxBrain extends DuelBrain {
  /** A beat that begins with a trade of places reaches wherever a self stands near the hero. */
  _reach(b) {
    if (b.def.swap) return Infinity;
    return super._reach(b);
  }

  /** The Howl, forced once (beam.js forced): instead of the AI's pick. */
  _choose(dist, punish = false) {
    const f = this.d.howl?.forced?.();
    if (f) return f;
    return super._choose(dist, punish);
  }

  startAct(name, phase = this.d.phase, opts = null) {
    if (name === 'foxRing') opts = { ...(opts ?? null), selves: Math.max(2, this.d.clones?.live ?? 0) };
    return super.startAct(name, phase, opts);
  }
}

const CRESCENT_POOL = 12;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** The beat a move is in at its time t (its windup or its active frames), or null. */
const beatNow = (a) => (a ? a.beats.find((b) => a.t < b.end + 1e-6) ?? null : null);

export class ThousandFox extends Duelist {
  constructor(game) {
    super(game, FOX_KIT);
    const C = this.fx?.crescents;
    while (C && C.length < CRESCENT_POOL) C.push({ alive: false, x: 0, z: 0, dx: 0, dz: 1, age: 0, flashed: -1, done: false, tell: TELL.NORMAL, damage: 0, kb: 0, attack: '' });
  }

  // ---------------------------------------------------------------- the engine's hooks
  _makeFx() {
    return new FoxFx(this);
  }
  _makeBrain() {
    return new FoxBrain(this);
  }
  /** His colours (look.js). */
  _tint(M) {
    tintFox(M);
  }
  /** A paper self's colours (?clones=b: a step paler). */
  _tintSelf(M) {
    tintFox(M, { pale: foxLook('clones') === 'b' });
  }

  /** Inside the base constructor, before his rig is batched and before the first reset: the pool of
   *  paper selves (every rig now, never mid-fight: the seeded fights would shift) and the Lab's API. */
  _setup() {
    this.clones = new FoxClones(this);
    this.clones.setCut(PAPER_CUT());
    // the Howl: the Nine-Tailed Fox is built now, hidden (beam.js FoxHowl, spirit.js)
    this.howl = new FoxHowl(this);
    const dbg = this.debug, d = this;
    dbg.clones = (n = 2) => {
      if (d.mode === 'sleep' || d.mode === 'intro') d.brain.startFight();
      return d.clones.spawn(Math.max(0, n | 0), 'debug');
    };
    dbg.popAll = () => d.clones.popAll('debug');
    dbg.pearl = () => d.brain.trigger('foxPearl');
    dbg.mantle = (on = true) => {
      d._mantleForced = on ? 1 : on === false ? 0 : null;
      return d._mantleForced;
    };
    dbg.liveClones = () => d.clones.live;
    // (Training, between situations: no self and no pearl left in the field)
    dbg.tidy = () => {
      d.clones.popAll('debug');
      if (!d.pearl?.charging) d.pearl?.reset();
    };
  }

  reset() {
    (this.pearl ??= new FoxPearl(this)).reset();
    this.clones?.reset();
    this.howl?.reset();
    this.mantleK = 0;
    this.tails = 0;
    this._igniteT = 0;
    this._mantleForced = null;
    super.reset();
    // asleep he sits among four of his selves (the intro tears them away)
    this.clones?.seat(4);
  }

  /** His combo links (links.js; brain.js reads `d.LINKS`). */
  get LINKS() {
    return LINKS;
  }

  /** His guard is down through the Pearl's charge (a cut lands; two burst it). */
  get guarding() {
    if (this.pearl?.charging) return false;
    return super.guarding;
  }

  /** His AI weighs a move: the Round needs its selves, the scatter none past the cap, and a cast with no
   *  blow of its own is weighed as a move of `densityAs` cues a second (director.js densityOf). */
  weigh(name, def, w) {
    const C = this.clones;
    if (def.verdict) w = this.howl?.weigh(name, def, w) ?? 0;
    if (def.needs && (C?.live ?? 0) < def.needs) return 0;
    if (MOVES[name]?.beats?.some((b) => b.scatter) && C && C.live >= C.cap()) return 0;
    if (def.densityAs > 0) {
      const k = perPhase(this.T.pressure?.density ?? 0, this.phase);
      if (k > 0) w *= Math.pow(def.densityAs / Math.max(0.2, densityOf(def)), k);
    }
    return w;
  }

  /** A move starts: the Round tears its selves off first if there are too few (the Lab), a transition
   *  takes the selves back, the Pearl begins its charge. */
  onActStart(A) {
    const C = this.clones, def = A.def;
    if (def.verdict && this.howl && !this.howl.onActStart(A)) return false;
    if (def.needs && C && C.live < def.needs) {
      C.spawn(def.needs - C.live, 'round');
      if (C.live < def.needs) return false;
    }
    if (def.transition) {
      this.pearl?.cancel();
      if ((def.phase ?? 2) >= 3) C?.burnAll();
      else C?.popAll('phase');
    }
    if (A.beats.some((b) => b.def.pearl === 'charge' || b.def.pearl === 'drive')) this.pearl.begin(A);
    return true;
  }

  /** A beat's own motion: the trade of places as a swap beat's windup starts, the scatter and the
   *  Round's call at their impact. */
  beatMotion(b, u, s, dt) {
    const D = b.def, C = this.clones;
    if (D.verdict) return this.howl?.beatMotion(b, u, s, dt);
    // the springboard (Fox Descending): to the self nearest him, then off its hands into the leap
    if (D.spring) {
      if (b._spring === undefined) {
        b._spring = C.nearest(this.position.x, this.position.z);
        if (b._spring >= 0) C.brace(b._spring, this);
      }
      const c = b._spring >= 0 ? C.list[b._spring] : null;
      const from = D.leap?.from ?? 0.3;
      if (c?.alive && u < from) {
        const k = Math.min(1, dt / Math.max(0.05, (from - u) * b.W));
        this.moveBy((c.x - this.position.x) * k, (c.z - this.position.z) * k);
      } else if (c?.alive && !b._sprung) {
        b._sprung = true;
        C.popAt(c.i, c.x, 1, c.z, false, 'spring');
      }
    }
    // the drive: a self at his side helps shape the Pearl
    if (D.pearl === 'drive' && !b._assist && u < 0.6) {
      b._assist = true;
      const i = C.nearest(this.position.x, this.position.z);
      if (i >= 0) C.assist(i, this);
    }
    if (D.swap && !b._swapped) {
      b._swapped = true;
      const p = s?.p;
      const i = p ? C.nearest(p.x, p.z) : -1;
      if (i < 0 || !C.swapWith(i)) {
        if (s) this.flit(s, { r: 2.4 }, b.hit);
      }
    }
    if (D.scatter && u >= 1 && !b._scattered) {
      b._scattered = true;
      C.spawn(perPhase(this.T.clones.scatter, this.phase), 'scatter');
    }
    if (D.round && u >= 1 && !b._called) {
      b._called = true;
      const a = this.brain.act, next = a?.beats?.[b.index + 1];
      if (next) C.round(next.impact - a.t);
    }
  }

  onImpact(b, s, a) {
    const D = b.def, W = this.game.world, WT = this.T.world;
    if (D.verdict) return this.howl?.onImpact(b, s, a);
    // a transition's ring goes out: the selves tear free to the cap; phase 3's mantle lights
    if (a?.def?.transition) {
      const ph = a.def.phase ?? 2;
      this.clones.spawn(this.clones.cap(), 'phase');
      if (ph >= 3) {
        this.mantleK = Math.max(this.mantleK, 0.05);
        this.fx.phaseBurst?.(3, this.position.x, this.position.z);
      }
      return;
    }
    const o = (this._wbo ??= { kind: 'blast', by: 'boss', dx: NaN, dz: NaN, y: 1, src: -1, scar: true });
    o.src = W?.destructibles?.swing?.() ?? -1;
    if (D.mantle === 'tail') {
      const r = D.zone?.r ?? 3.6, TL = this.T.mantle.tail;
      W?.impact?.(this.position.x, this.position.z, r, WT.tail, o);
      // the tail's flame reaches past the cut: what it sweeps catches (the terrace's charm posts)
      W?.ignite?.(this.position.x, this.position.z, r + TL.reach, TL.k * Math.max(0.3, this.mantleK));
      this.fx.tailSweep?.(this.position.x, this.position.z, r);
    } else if (D.mantle === 'pounce') {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), x = this.position.x + fx * 1.2, z = this.position.z + fz * 1.2;
      const L = D.zone?.r ?? 2.4;
      W?.impact?.(x, z, 1.6, WT.pounce, o);
      // (where he lands, and the far end of the line he drives the cut along)
      W?.ignite?.(x, z, 1.8, WT.pounceFire);
      W?.ignite?.(this.position.x + fx * L, this.position.z + fz * L, 1.8, WT.pounceFire);
      this.fx.pounceLand?.(x, z, 1.8);
    } else if (D.pearl === 'drive') {
      this.pearl.drive(b, s, a);
    } else if (D.pearl === 'great') {
      const r = D.zone?.r ?? 3.4;
      W?.impact?.(this.position.x, this.position.z, r, WT.greatPearl, o);
      this.fx.greatBurst?.(this.position.x, this.position.z, r);
      this.clones.popWithin(this.position.x, this.position.z, r, 'pearl');
    }
  }

  /** A `sustain` beat's ticks: the Howl's beam (beam.js). */
  onSustain(b, s, a, k) {
    if (b.def.verdict) this.howl?.onSustain(b, s, a, k);
  }

  onCast(b, s, a) {
    if (b.def.cast?.kind === 'pearl') this.pearl.bat(b, s, a);
  }

  /** Paper Blades: sword qi along the ground toward the hero (Shen Hui's crescents, a fan of three). */
  onRelease(b, s, act) {
    const R = b.def.release;
    const n = perPhase(R.count, this.phase);
    const base = s ? s.ang : this.yaw;
    const C = this.T.crescent, p = this.game.player?.position, pr = this.game.player?.radius ?? 0.45;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * R.spread;
      const sx = this.position.x + Math.sin(a) * 1.0, sz = this.position.z + Math.cos(a) * 1.0;
      const speed = R.speed ?? C.speed;
      if (p && C) {
        const dx = Math.sin(a), dz = Math.cos(a), rx = p.x - sx, rz = p.z - sz, along = rx * dx + rz * dz, across = Math.abs(-rx * dz + rz * dx);
        if (across < 1.0 && (along - (C.radius ?? 0.7) - pr) / speed < (C.minLead ?? 0.27)) continue;
      }
      this.fx.throwCrescent(sx, sz, Math.sin(a), Math.cos(a), { tell: b.def.tell, damage: b.def.damage, knockback: b.def.knockback, attack: act?.name ?? 'paperBlades' });
    }
  }

  /** Every frame after the brain: the selves, the pearls in flight, the mantle's fire on the world. */
  brainFrame(dt) {
    const P = this.pearl;
    // the charge ended without the bat (a parry, a break, a reaction, the death): it comes apart
    if (P.charging && (this.mode !== 'act' || this.brain.act !== P.act)) P.cancel();
    // the intro: the seated selves tear into paper one by one as he rises (all at once if it was skipped)
    if (this.clones.seated && this.mode !== 'sleep') this.clones.tearSeated(this.mode === 'intro' ? this.brain.modeT : Infinity);
    this.clones.frame(dt);
    P.frame(dt);
    this.howl?.frame(dt);
    // the mantle (phase 3): grows in over T.mantle.grow s after the change; where he stands, catches
    const M = this.T.mantle;
    const want = this._mantleForced ?? (this.phase >= 3 && this.mode !== 'dying' && this.mode !== 'dead' && this.mantleK > 0 ? 1 : 0);
    // the fox spirit's tails (FoxFx.mantle reads d.tails): one as the mantle wakes, nine as his bar runs out
    const gate = this.maxHp * (this.T.phaseAt[2] ?? 0.33);
    this.tails = this.phase >= 3 ? Math.max(1, Math.min(M.tails, 1 + Math.round((M.tails - 1) * (1 - this.hp / Math.max(1, gate))))) : want > 0 ? 3 : 0;
    if (want > 0) this.mantleK = Math.min(1, Math.max(this.mantleK, 0.001) + dt / Math.max(0.1, M.grow));
    else this.mantleK = Math.max(0, this.mantleK - dt * 2);
    if (this.mantleK > 0.3 && this.mode !== 'sleep') {
      this._igniteT -= dt;
      if (this._igniteT <= 0) {
        this._igniteT = M.ignite.every;
        this.game.world?.ignite?.(this.position.x, this.position.z, M.ignite.r, M.ignite.k * this.mantleK);
      }
    }
  }

  /** After the pose: his blade's sweep (the real steel only), the Pearl over his blade, the black
   *  pearl over his head, the mantle, then the selves' poses and hurt spheres. */
  afterPose(dt, a) {
    super.afterPose(dt, a);
    if (a) {
      for (const b of a.beats) {
        if (!b.def.pearl || b.feint || a.t < b.start || a.t >= b.impact) continue;
        const u = (a.t - b.start) / Math.max(0.05, b.impact - b.start);
        if (b.def.pearl === 'charge' || b.def.pearl === 'drive') this.pearl.charge(b, u, dt);
        else if (b.def.pearl === 'great') {
          const h = this._hs[0];
          this.fx.greatPearl?.(h.x, h.y + 0.9, h.z, u, dt);
        }
        break;
      }
    }
    if (this.mantleK > 0 && this.mode !== 'dead') this.fx.mantle?.(this, dt, this.mantleK);
    if (this.mode !== 'dead') this.clones.pose(dt);
    this.howl?.pose(dt);
  }

  /**
   * A hit from the player. On a paper self (a sphere marked 'cloneN'): it pops, and every other self
   * within `cleave` of the hit point; each adds `popPosture` to the real one's; 0 damage (no number, no
   * call-out). On him: the duelist's rules, and a cut that lands while he charges the Pearl counts
   * toward bursting it in his hand.
   */
  takeHit(o = {}) {
    const part = o?.part;
    if (typeof part === 'string' && part.startsWith('clone')) {
      const i = Number(part.slice(5));
      const pt = o.point;
      const n = this.clones.popAt(i, pt?.x, pt?.y, pt?.z, !!o.heavy, 'cut');
      if (n > 0) {
        this.addPosture(this.T.clones.popPosture * n);
        this.hitstop(o.heavy ? 0.06 : 0.04, 0.05);
      }
      return 0;
    }
    const charging = !!this.pearl?.charging;
    const dmg = super.takeHit(o);
    if (charging && dmg > 0 && this.pearl.charging && this.mode === 'act') this.pearl.struck(!!o.heavy);
    return dmg;
  }

  /** A blow at the hero: the drive's grows with the selves that fed it (pearl.js drive). */
  hitPlayer(o) {
    if (o?.beat?.def?.pearl === 'drive') {
      const P = this.T.pearl, n = this.pearl?.selves ?? 0;
      o = { ...o, damage: o.damage + P.perCloneDamage * n, extra: { ...(o.extra ?? null), plunge: false } };
    }
    return super.hitPlayer(o);
  }

  // ---------------------------------------------------------------- his limbs (bare hands; Tian Lei's way)
  /** The limb his "blade" is now: the striking part of the beat under way, the blocking forearm of a
   *  guard, else the right fist. */
  _strikePart() {
    const br = this.brain;
    if (this.mode === 'act') {
      const b = beatNow(br.act);
      if (b && !br.act.def.transition) return b.def.part ?? 'fistR';
    } else if (this.mode === 'react' && GUARD_KINDS.has(br.react?.kind)) return br.react.kind === 'wardR' ? 'fistR' : 'fistL';
    else if (this.mode === 'foot' && br.wardK > 0.5) return 'fistL';
    return 'fistR';
  }

  /** Limb `part` as drawn now: a (its root) → b (its end), world space (ascendant.js _limbSeg). */
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
    if (!ok || !this._tipOk || part !== this._partPrev) {
      this._tipPrev.copy(this._tip);
      this._hiltPrev.copy(this._hilt);
    }
    this._partPrev = part;
    this._tipOk = ok;
    this._ptsOk = ok;
  }

  /** Posed at clip time t now (parryContact steps the pose back along the strike): the striking limb. */
  _poseAt(t) {
    super._poseAt(t);
    this._limbSeg(this._part ?? 'fistR', this._hilt, this._tip);
  }

  /** The Pearl's spot: over his lead palm (the open hand it is shaped in). */
  palmPoint(out) {
    if (!this._ptsOk) return out.set(this.position.x, 1.2, this.position.z);
    this._limbSeg('fistL', _a, out);
    this._limbSeg('fistR', _a, _b);
    return out.set((out.x * 2 + _b.x) / 3, (out.y * 2 + _b.y) / 3 + 0.12, (out.z * 2 + _b.z) / 3);
  }

  /** His posture breaks: every self pops at once (the payoff), and a Pearl in his hand comes apart. */
  _break() {
    super._break();
    if (this.broken) {
      this.clones.popAll('break');
      this.pearl?.cancel();
    }
  }

  /** Upright gameplay point → where it is drawn: scaled and leaned about the NEAREST body's root (his,
   *  or a paper self's: the base scales about his position, which would misplace a cut on a self). */
  drawnPoint(v) {
    let px = this.position.x, py = this.position.y, pz = this.position.z, L = this.lean;
    const C = this.clones;
    if (C) {
      let bd = (v.x - px) ** 2 + (v.z - pz) ** 2;
      for (const c of C.list) {
        if (!c.alive) continue;
        const dd = (v.x - c.x) ** 2 + (v.z - c.z) ** 2;
        if (dd < bd) {
          bd = dd;
          px = c.x;
          py = 0;
          pz = c.z;
          L = c.lean;
        }
      }
    }
    const k = L?.k || 0, S = this.drawScale;
    const x = (v.x - px) * S, y = (v.y - py) * S, z = (v.z - pz) * S;
    return v.set(px + x + k * (L?.dx || 0) * y + (L?.ox || 0), py + y, pz + z + k * (L?.dz || 0) * y + (L?.oz || 0));
  }
}

export { HERO_SCALE };
