import { clamp } from '../../../core/math.js';
import { TELL, RESULT } from '../../../combat/rules.js';
import { BLOW } from '../../../world/breakTuning.js';
import { Duelist } from '../duelist/duelist.js';
import { DuelBrain } from '../duelist/brain.js';
import { perPhase } from '../duelist/realise.js';
import { DUEL_POSES } from '../ashDisciple/poses.js';
import { MOVES, MOVE_NAMES, CLIP, TRANSITIONS, realise } from './moves.js';
import { TUNING } from './tuning.js';
import { LINKS } from './links.js';
import { fallenLoadout, RULE } from './gear.js';
import { fallenLookNow, tintFallen, dressFallen } from './look.js';
import { FallenFx } from './fx.js';
import { GazeMoves } from './gaze.js';
import { Seams } from './seams.js';
import { lookOf } from '../duelist/lookSwitch.js';

// Qian Yao, the Heaven-Fallen: the boss of the Skywell Vault (`?level=fallen`; ADR-133; COMBAT.md
// "Qian Yao, the Heaven-Fallen"). A duelist (duelist/duelist.js, brain.js) with his own kit: moves
// (moves.js: the Ash Disciple's authored strikes with his numbers), tuning.js, links.js, gear / look /
// bodyArt (three bodies, the art path and its ink twin), fx.js + fxGaze.js, gaze.js (his eyes),
// seams.js (the molten cuts). One bar, three phases with gates, as Shen Hui. What only he does is here:
//
// THE SUNLIGHT (`d.sun = { k 0..1, lit, eclipsed }`; the HUD reads it; getter `radiant`). He fills
// T.sun.fill a second while inside an open pool of world.sun (at any height), drains over T.sun.linger
// s out of it. RADIANT (k > 0, not eclipsed): the hero's cuts GLANCE (x T.sun.glance, a short hit-stop,
// no shove, no flinch, no brain.onStruck, no posture from a hit, his guard not used), and his posture
// neither regenerates nor breaks: at its maximum it HOLDS, and he breaks the frame his light is out.
// DIM: the duelist engine unchanged. A PERFECT answer ECLIPSES him before its reward plays (a perfect
// parry, a perfect dodge, a won blade lock, the mikiri, a full deflect, the flash counter, a returned
// Gaze): k 0, no refill for T.sun.eclipse s even in a pool. STARVED: the lid shut on the pool he stands
// in (or flies to): he reels, eclipsed T.sun.starve.eclipse s, + T.sun.starve.posture. Every parry is
// worth full posture (kept while he is radiant, paid out as he dims) and takes T.sun.parry of his light:
// defence is never punished. Without world.sun (the lab stage, the tests' mock worlds) he is dim unless
// debug.sunForce(k) holds it.
//
// FLIGHT: he hovers T.fly.hover over the floor in footwork (every hurt sphere in sword reach); he is
// aloft only inside a move (beat data: lift, leap, air, his `fly`), and every aloft move ends on the
// floor in a recovery of at least 0.9 s. T.airFall drops him if he is struck out of the air.

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
/** The beat a move is in at its time t (its windup or active frames), or null. */
const beatNow = (a) => (a ? a.beats.find((b) => a.t < b.end + 1e-6) ?? null : null);
const GROUNDED = new Set(['broken', 'dying', 'dead', 'sleep', 'intro']);

/** Everything the shared duelist needs to be him (duelist.js: kit). The loadout is read when his rig is
 *  built (?fallenLook=). */
export const FALLEN_KIT = Object.freeze({
  id: 'heavenFallen',
  TUNING, MOVES, MOVE_NAMES, CLIP, realise,
  transitions: TRANSITIONS,
  maxPhase: 3,
  get loadout() {
    return fallenLoadout(fallenLookNow().body);
  },
  poses: DUEL_POSES,
  blade: RULE,
  scale: TUNING.scale,
  dress: (d, dt) => dressFallen(d, dt),
});

/** His mind: the duelist's, with the floor under him at his hover height. */
class FallenBrain extends DuelBrain {
  /** A beat of his eyes or his flight reaches wherever the hero is (no string to stop short). */
  _reach(b) {
    if (b.def.gaze || b.def.fly || b.def.pass) return Infinity;
    return super._reach(b);
  }

  /** Off the floor as a reaction starts: at (or under) his hover height he stays there. */
  _ground() {
    const d = this.d, h = d.hoverY ?? 0;
    if (h > 0 && d.position.y <= h + 0.05) {
      this.falling = false;
      return;
    }
    super._ground();
  }

  /** The drop out of the air ends at his hover height (on the floor when he is down). */
  _fall(dt) {
    super._fall(dt);
    const d = this.d, h = d.hoverY ?? 0;
    if (h > 0 && d.position.y < h) {
      d.position.y = h;
      this.falling = false;
    }
  }
}

export class HeavenFallen extends Duelist {
  constructor(game) {
    super(game, FALLEN_KIT);
  }

  _tint(M) {
    tintFallen(M);
  }
  _makeFx() {
    return new FallenFx(this);
  }
  _makeBrain() {
    return new FallenBrain(this);
  }

  _setup() {
    this.sun = { k: 0, lit: false, eclipsed: false, eclipseT: 0, forced: null };
    this._changing = false;
    this._great = false; // the great well is open (phase 3)
    this._greatAt = -Infinity;
    this._defendAt = -Infinity; // the hero last chipped a windlass
    this._drink = null; // { pool } while he flies to / stands in a pool
    this._glanced = false; // the feed's line on the first glancing cut, once a fight
    this._lidsSaid = 0;
    this.stats = { eclipses: 0, starves: 0, glances: 0, drinks: 0, aloft: 0 };
    const d = this;
    /** Lab / tests: hold his light at k (0..1: as if he stood in a pool of that light; an eclipse still
     *  puts it out for its time); null gives it back to the wells. */
    this.debug.sunForce = (k) => {
      d.sun.forced = k == null ? null : clamp(fin(Number(k), 0), 0, 1);
      if (d.sun.forced != null && !(d.sun.eclipseT > 0)) d.sun.k = d.sun.forced;
      return d.sun.forced;
    };
    this.debug.setSun = (k) => {
      d.sun.k = clamp(fin(Number(k), 0), 0, 1);
      return d.sun.k;
    };
    this.debug.eclipse = (secs) => d.eclipse('lab', secs);
    // (the Lab's posture break breaks him whatever his light)
    this.debug.postureBreak = () => {
      d._labBreak = true;
      try {
        d._break();
      } finally {
        d._labBreak = false;
      }
    };
    Object.defineProperty(this.debug, 'sun', { get: () => ({ ...d.sun, radiant: d.radiant }) });
    // a perfect dodge of his blow eclipses him before the hero's counter lands; a lid shut on the pool
    // he drinks in starves him; the hero chipping a windlass makes him come for him
    const ev = this.game.events;
    ev?.on?.('player:perfectDodge', () => {
      if (this.mode === 'act' || this.mode === 'react' || this.mode === 'foot') this.eclipse('dodge');
    });
    ev?.on?.('world:sun', (e) => this._onSun(e));
    ev?.on?.('world:impact', (e) => this._onImpact(e));
  }

  // ---------------------------------------------------------------- the contract
  /** He is radiant: the sun is in him and not put out. */
  get radiant() {
    return this.sun.k > 0 && !this.sun.eclipsed;
  }

  /** His hover height now (0 when he is down, asleep or rising). */
  get hoverY() {
    return GROUNDED.has(this.mode) ? 0 : this.T.fly.hover;
  }

  reset() {
    if (this.sun) {
      this.sun.k = 0;
      this.sun.lit = false;
      this.sun.eclipsed = false;
      this.sun.eclipseT = 0;
      this.sun.forced = null; // (a fight's reset gives his light back to the wells)
      this._changing = false;
      this._great = false;
      this._greatAt = -Infinity;
      this._defendAt = -Infinity;
      this._drink = null;
      this._glanced = false;
      this._lidsSaid = 0;
    }
    super.reset();
    (this.gaze ??= new GazeMoves(this)).reset();
    (this.seams ??= new Seams(this)).reset();
  }

  enterPhase(n) {
    super.enterPhase(n);
    // (through a transition nothing lands on him until its ring goes out: onImpact)
    if (this.brain?.act?.def?.transition && this.mode === 'act') this._changing = true;
  }

  takeHit(o = {}) {
    if (this._changing) return 0;
    if (!this.radiant || o.exact || this.broken || this.mode === 'dying' || this.mode === 'dead') return super.takeHit(o);
    const raw = Number(o.damage);
    if (!(raw > 0)) return 0;
    if (this.mode === 'sleep') this.startIntro();
    // (a cut that meets his blow in its last moment is still the trade: the blades meet)
    if (o.swing && this._tradeNow()) return 0;
    const P = this.T.parts, part = P[o.part] !== undefined ? o.part : 'body';
    const dmg = Math.max(1, Math.round(raw * P[part] * this.T.sun.glance));
    this._applyDamage(dmg);
    this.flash = Math.max(this.flash, 0.3);
    this.hitstop(this.T.sun.glanceStop, 0.06);
    this._streakSet(0);
    const pt = o.point;
    if (pt && Number.isFinite(pt.x + pt.y + pt.z)) this.fx.glance?.(pt.x, pt.y, pt.z, fin(o.dir?.x), fin(o.dir?.z));
    this.stats.glances++;
    this.emit('dragon:hurt', { damage: dmg, part, hp: this.hp, crit: false, glance: true });
    if (!this._glanced) {
      this._glanced = true;
      this.game.hud?.log?.('The sun is on him: your blade glances.', 'warn');
    }
    if (this.hp <= 0) this._onHpZero();
    return dmg;
  }

  // ---------------------------------------------------------------- posture: it holds while he is radiant
  addPosture(amount) {
    if (!this.radiant || !(amount > 0) || this.broken || this.mode === 'dying' || this.mode === 'dead') return super.addPosture(amount);
    this.posture = Math.min(this.maxPosture, this.posture + amount);
    this.postureTimer = 0;
    this.emitPosture();
  }

  /** Every way he breaks (a full meter, an answered flurry) waits for his light to go out: radiant, the
   *  meter holds at its maximum and the break comes the frame he dims (brainFrame). */
  _break() {
    if (this.radiant && !this._labBreak && !this.broken && this.mode !== 'dying' && this.mode !== 'dead') {
      this.posture = this.maxPosture;
      this.emitPosture(true);
      return;
    }
    return super._break();
  }

  _updatePosture(dt) {
    if (this.radiant) {
      this.postureTimer = 0; // (no regeneration in the light: the hero's parries are kept)
      return;
    }
    super._updatePosture(dt);
  }

  // ---------------------------------------------------------------- perfect answers eclipse him first
  onParried(info = {}) {
    if (this.mode === 'dying' || this.mode === 'dead' || this.time - this._lastParry < 0.1) return super.onParried(info);
    const p = this.game.player, a = this.brain.act, b = a?.striking;
    const F = this.T.fullDeflect, last = !a || !b || !!b.last;
    const fullDeflect = !!a && last && a.hits >= F.minHits && (a.parried ?? 0) + 1 >= a.hits;
    if (p?.deflect?.perfect || fullDeflect) this.eclipse(fullDeflect ? 'deflect' : 'parry');
    else this.sunParried();
    return super.onParried(info);
  }

  /** A parry of his blow takes T.sun.parry of his light. */
  sunParried() {
    if (this.sun.forced != null) return;
    this.sun.k = Math.max(0, this.sun.k - this.T.sun.parry);
  }

  onMikiri() {
    if (this.mode === 'act') this.eclipse('mikiri');
    return super.onMikiri();
  }

  onLockEnd(won) {
    if (won && this.brain.react?.kind === 'lock') this.eclipse('lock');
    return super.onLockEnd(won);
  }

  onCounter(o = {}) {
    this.eclipse('counter');
    return super.onCounter(o);
  }

  /** His light is put out for `secs` (a perfect answer: T.sun.eclipse; a starving: longer). */
  eclipse(kind = 'perfect', secs = this.T.sun.eclipse) {
    const S = this.sun;
    if (this.mode === 'dying' || this.mode === 'dead') return false;
    const was = this.radiant;
    S.eclipseT = Math.max(S.eclipseT, fin(secs, this.T.sun.eclipse));
    S.eclipsed = true;
    S.k = 0;
    this.stats.eclipses++;
    if (was) this.fx.eclipse?.(this, kind === 'starve');
    return true;
  }

  /** A pool changed (world/sun.js): a lid shut on the pool he stands in, or flies to, starves him. */
  _onSun(e) {
    const sun = this.game.world?.sun;
    if (!sun || !e || e.open) return;
    if (!e.temp) {
      const n = 4 - sun.openCount;
      if (n > this._lidsSaid) {
        this._lidsSaid = n;
        this.game.hud?.log?.(n >= 4 ? 'THE SKY IS SHUT' : 'A lid falls shut.', n >= 4 ? 'warn' : 'lore');
      }
    }
    if (this.mode === 'dying' || this.mode === 'dead' || this.mode === 'sleep' || this.mode === 'intro') return;
    const p = sun.pools[e.id];
    if (!p) return;
    const inside = Math.hypot(this.position.x - p.x, this.position.z - p.z) <= p.r + 0.3;
    const going = this._drink?.pool === p && this.mode === 'act';
    if (!inside && !going) return;
    const T = this.T.sun.starve;
    this.stats.starves++;
    this.eclipse('starve', T.eclipse);
    this.fx.eclipse?.(this, true);
    this.addPosture(T.posture);
    if (!this.broken && this.brain.act?.def?.transition !== true) this.brain.startReact('reeling');
    this.game.hud?.log?.('The lid falls on him: the light is torn out of him.', 'warn');
  }

  /** The world was struck (world:impact): the hero chipping or breaking a windlass. */
  _onImpact(e) {
    if (!e || e.by !== 'player' || e.mat !== 'wood') return;
    const sun = this.game.world?.sun;
    if (!sun) return;
    for (const p of sun.pools) {
      if (p.temp) continue;
      if (Math.hypot(e.x - (p.wx ?? p.x), e.z - (p.wz ?? p.z)) < 1.5) {
        this._defendAt = this.time;
        return;
      }
    }
  }

  // ---------------------------------------------------------------- the moves' hooks
  weigh(name, def, w) {
    const sun = this.game.world?.sun, S = this.sun;
    if (def.gaze && this.gaze?.busy) return 0;
    if (name === 'sunDrink') {
      if (!sun || S.forced != null || S.eclipsed || S.k >= this.T.sun.drinkBelow) return 0;
      if (sun.poolAt(this.position.x, this.position.z) || !sun.nearestOpen(this.position.x, this.position.z)) return 0;
      return w * 3;
    }
    if (name === 'openSky') {
      if (!sun || this.phase < 2) return 0;
      const cap = perPhase(this.T.bore.cap, this.phase) + (this._great ? 1 : 0);
      if (sun.boredCount >= cap && !this._greatReady()) return 0;
      const near = sun.nearestOpen(this.position.x, this.position.z, { fixed: true });
      const far = !near || Math.hypot(near.x - this.position.x, near.z - this.position.z) > 9;
      if (!((S.k < 0.35 && far) || sun.openCount < 2)) return 0;
      return w * 2;
    }
    // (after the hero chips a windlass, the moves that close distance weigh more)
    if (this.time - this._defendAt < this.T.sun.defend.time && (def.cat === 'closer' || def.beats.some((b) => b.dash?.max >= 3 || b.leap || b.pass))) w *= this.T.sun.defend.weight;
    return w;
  }

  /** Phase 3: the great well may be torn open again. */
  _greatReady() {
    return this.phase >= 3 && this.time - this._greatAt >= this.T.bore.greatEvery && !this._greatAlive();
  }

  _greatAlive() {
    const sun = this.game.world?.sun, G = sun?.data?.great;
    return !!(sun && G && sun.pools.some((p) => p.temp && p.live && Math.hypot(p.x - G.x, p.z - G.z) < 0.5 && p.r >= G.r - 0.1));
  }

  onActStart(A) {
    if (A.def.beats.some((b) => b.gaze) && this.gaze?.busy && this.gaze.B.phase === 'lit') return false;
    this._drink = null;
    return true;
  }

  beatMotion(b, u, s, dt) {
    const D = b.def;
    if (D.gaze) this.gaze.motion(b, u, s, dt);
    if (D.fly?.kind === 'drink') this._flyDrink(b, u, dt);
    else if (D.fly?.kind === 'awaken3') this._flyAwaken3(b, u, dt);
    if (D.pass && u >= (D.dash?.from ?? 0.5)) {
      // Exile's Passage: what stands on his way is swept down
      const W = this.game.world?.destructibles, x0 = b._px ?? this.position.x, z0 = b._pz ?? this.position.z;
      if (W?.sweep && Math.hypot(this.position.x - x0, this.position.z - z0) > 0.05) {
        const o = (this._po ??= { kind: BLOW.BLAST, by: 'boss', dx: 0, dz: 0, y: 1, src: -1 });
        if (!b._psrc) b._psrc = W.swing?.() ?? -1;
        o.src = b._psrc;
        o.dx = Math.sin(this.yaw);
        o.dz = Math.cos(this.yaw);
        W.sweep(x0, z0, this.position.x, this.position.z, 0.9, this.T.world.passage, o);
      }
      b._px = this.position.x;
      b._pz = this.position.z;
    }
  }

  /** He Drinks the Sun: low and fast to the nearest open pool, and he stands in it. */
  _flyDrink(b, u, dt) {
    const sun = this.game.world?.sun, F = this.T.fly.drink;
    if (!sun) return;
    if (!b._pool) {
      b._pool = sun.nearestOpen(this.position.x, this.position.z) ?? null;
      this._drink = b._pool ? { pool: b._pool } : null;
      if (b._pool) this.stats.drinks++;
    }
    const p = b._pool;
    if (!p) return;
    const dx = p.x - this.position.x, dz = p.z - this.position.z, l = Math.hypot(dx, dz);
    if (l > 0.35) {
      const step = Math.min(l - 0.3, F.speed * dt);
      this.yaw = Math.atan2(dx, dz);
      this.moveBy((dx / l) * step, (dz / l) * step);
      this.position.y += (F.height - this.position.y) * Math.min(1, dt * 8);
      this.fx.drinkWake?.(this, dt);
    } else this.position.y += (this.T.fly.hover - this.position.y) * Math.min(1, dt * 6);
  }

  /** He tears the sky: up through the roof (out of frame), the great well opens over the centre, he
   *  comes down in it at the impact. */
  _flyAwaken3(b, u, dt) {
    const sun = this.game.world?.sun, G = sun?.data?.great ?? { x: 0, z: 0, r: 4.2 };
    if (!b._from) b._from = { x: this.position.x, z: this.position.z };
    const top = 10;
    if (u < 0.45) this.position.y = this.T.fly.hover + (top - this.T.fly.hover) * clamp(u / 0.45, 0, 1) ** 1.5;
    else if (u < 0.8) {
      const k = clamp((u - 0.45) / 0.35, 0, 1), e = k * k * (3 - 2 * k);
      this.position.x = b._from.x + (G.x - b._from.x) * e;
      this.position.z = b._from.z + (G.z - b._from.z) * e;
      this.position.y = top;
    } else {
      this.position.x = G.x;
      this.position.z = G.z;
      const k = clamp((u - 0.8) / 0.2, 0, 1);
      this.position.y = u >= 1 ? 0 : top * (1 - k * k);
    }
    if (!b._bored && u >= 0.35) {
      b._bored = true;
      if (sun) {
        sun.bore(G.x, G.z, G.r, this.T.bore.greatLife);
        this._great = true;
        this._greatAt = this.time;
      }
      this.fx.boreBeam?.(G.x, G.z);
      this.game.world?.forest?.ambience?.flare?.(1);
    }
    const p = this.game.player?.position;
    if (p && u < 0.8) this.yaw = Math.atan2(p.x - this.position.x, p.z - this.position.z);
  }

  onImpact(b, s, a) {
    const D = b.def, fx = this.fx;
    if (a?.def?.transition) {
      this._changing = false;
      const r = this.T.transition.ringRadius;
      fx.transformNova?.(this.position.x, this.position.z, D.zone?.r ?? r, 2);
      this.game.world?.forest?.ambience?.flare?.(1);
      this.game.shake?.(0.4);
      if ((a.def.phase ?? 2) === 2) {
        const sun = this.game.world?.sun;
        if (sun) sun.bore(this.position.x, this.position.z, sun.data?.bore?.r ?? 2.8, this.T.bore.awakenLife);
        fx.boreBeam?.(this.position.x, this.position.z);
      } else {
        const o = (this._io ??= { kind: BLOW.BLUNT, by: 'boss', dx: NaN, dz: NaN, src: -1 });
        o.src = this.game.world?.destructibles?.swing?.() ?? -1;
        this.game.world?.impact?.(this.position.x, this.position.z, 3, this.T.world.dive, o);
        fx.crater?.(this.position.x, this.position.z, 2.4, 1);
      }
      return;
    }
    if (D.gaze) {
      this.gaze.onImpact(b, s, a);
      return;
    }
    const w = this.game.world;
    if (D.dive) {
      const o = (this._io ??= { kind: BLOW.BLUNT, by: 'boss', dx: NaN, dz: NaN, src: -1 });
      o.kind = BLOW.BLUNT;
      o.dx = o.dz = NaN;
      o.src = w?.destructibles?.swing?.() ?? -1;
      w?.impact?.(this.position.x, this.position.z, D.zone?.r ?? 2.8, this.T.world.dive, o);
      fx.crater?.(this.position.x, this.position.z, 2.0, 1);
      this.game.shake?.(0.35);
    } else if (D.crack && D.zone) {
      const fx0 = Math.sin(this.yaw), fz0 = Math.cos(this.yaw), r = D.zone.r * 0.8;
      const o = (this._io ??= { kind: BLOW.BLUNT, by: 'boss', dx: NaN, dz: NaN, src: -1 });
      o.kind = BLOW.BLUNT;
      o.dx = fx0;
      o.dz = fz0;
      o.src = w?.destructibles?.swing?.() ?? -1;
      w?.impact?.(this.position.x + fx0 * r, this.position.z + fz0 * r, 1.2, ((D.damage ?? 20) / this.T.world.per) * (D.tell === TELL.BLACK ? 1.6 : 1.1), o);
      this.game.shake?.(D.tell === TELL.BLACK ? 0.4 : 0.22);
    }
  }

  onSustain() {}
  onRelease() {}
  onCast() {}

  /** A blow at the hero: from the air a perfect roll is only a roll (nobody to Ghostep to up there). */
  hitPlayer(o) {
    if (this.position.y > 1.2 && o.tell === TELL.RED) o = { ...o, extra: { ...(o.extra ?? null), perfect: false, plunge: false } };
    return super.hitPlayer(o);
  }

  // ---------------------------------------------------------------- every frame
  brainFrame(dt) {
    this._sunFrame(dt);
    this._hover(dt);
    // the break waits for the light to go out (radiant, his posture holds at its maximum)
    if (!this.radiant && !this.broken && this.posture >= this.maxPosture - 1e-6 && !GROUNDED.has(this.mode)) this._break();
    if (this.position.y > 1.2) this.stats.aloft += dt;
    this.gaze.frame(dt);
    this.seams.frame(dt);
    if (this._great && !this._greatAlive()) this._great = false;
  }

  /** The sun in him this frame (the HUD's row, his body's light, the radiance rule). */
  _sunFrame(dt) {
    const S = this.sun, T = this.T.sun;
    if (S.eclipseT > 0) {
      S.eclipseT = Math.max(0, S.eclipseT - dt);
      S.k = 0;
      S.eclipsed = S.eclipseT > 0;
      S.lit = false;
      return;
    }
    S.eclipsed = false;
    // (held by the Lab or a test: as if he stood in a pool of exactly that light; an eclipse still
    // puts it out for its time)
    if (S.forced != null) {
      S.k = S.forced;
      S.lit = S.k > 0;
      return;
    }
    const sun = this.game.world?.sun;
    const asleep = this.mode === 'dead' || this.mode === 'dying';
    S.lit = !!sun && !asleep && !!sun.poolAt(this.position.x, this.position.z);
    if (S.lit) S.k = Math.min(1, S.k + T.fill * dt);
    else S.k = Math.max(0, S.k - dt / T.linger);
  }

  /** He hovers over the floor; out of a flight he comes down to it (a beat that flies owns the height). */
  _hover(dt) {
    const h = this.hoverY, br = this.brain, y = this.position.y;
    if (!(h > 0) || br.falling) return;
    if (this.mode === 'act') {
      const cur = beatNow(br.act);
      if (br.leap || cur?.def?.lift || cur?.def?.fly || (cur && cur.def.air && y > h + 0.05 && br.act?.def?.transition)) return;
    }
    if (y > h + 0.01) this.position.y = Math.max(h, y - this.T.fly.descend * dt);
    else if (y < h - 0.01) this.position.y = Math.min(h, y + 2.5 * dt);
  }

  /** The bar's sweep through his cuts (not his eyes' beats, not the palm), the rings he comes down
   *  on, his light, the stars of a break. */
  afterPose(dt, a) {
    const fx = this.fx;
    if (a && this._tipOk && !this.shuddering) {
      for (const b of a.beats) {
        if (b.feint || b.def.gaze || b.def.noSweep || a.t < b.impact - 0.32 * b.W - 0.02 || a.t > b.end + 0.6 * b.A + 0.05) continue;
        fx.sweep(this._hiltPrev, this._tipPrev, this._hilt, this._tip, false);
        break;
      }
    }
    // Noonfall's ring follows the hero and locks (the leap's landing spot)
    const L = this.brain.leap;
    if (a && L && !L.landed) {
      const b = L.beat, k = clamp((a.t - b.start) / Math.max(0.05, b.impact - b.start), 0, 1);
      fx.warnRing?.(L.target.x, L.target.z, b.def.zone?.r ?? 2.8, k, dt);
    }
    // the great well's ring, marked 1.2 s before he comes down in it
    if (a?.def === MOVES.awaken3) {
      const b = a.beats[0], sun = this.game.world?.sun, G = sun?.data?.great ?? { x: 0, z: 0 };
      if (b && a.t >= b.impact - 1.2 && a.t < b.impact) fx.awakenRing?.(G.x, G.z, b.def.zone.r, clamp((a.t - (b.impact - 1.2)) / 1.2, 0, 1), dt);
    }
    if (this.radiant && lookOf('radiant', 'a', 'a') !== 'b' && this.mode !== 'dead') fx.radiance?.(this, this.sun.k, dt);
    if (this.mode === 'broken') fx.stunStars(this._hs[0]);
  }

  get LINKS() {
    return LINKS;
  }
}

export { RESULT };
