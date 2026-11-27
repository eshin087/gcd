import { RESULT, TELL } from '../../../combat/rules.js';
import { perPhase } from './tuning.js';

// THE MEASURELESS (the P2 -> P3 transition; core's rule). The transition move `measureless` (moves.js):
// a hand sign (the beat `wjDomain: 'sign'`, a feint), then the sphere closes (`wjDomain: 'close'`: a RED
// cue whose ring covers the arena). At its impact the engine's own answer decides (no second timing rule):
//   RESULT.PERFECT (a perfect dodge through the wall)  ESCAPE: the hero is inside unharmed and the barrier
//                     opens for open[phase] x TUNING.wjDomain.escapeOpen s;
//   anything else (no answer, an early roll, a guard)  CAUGHT: held `hold` s (player.hold: a stagger that
//                     cannot be cancelled, at most 1.2 s) and struck once inside it (`blow` of his max
//                     health, never lethal: at least 1 HP left; `knockback` m); the blow lands 0.4 s
//                     before the hold ends, so its own stagger ends with it: the lock is `hold` s in all.
//                     A hero who is DOWN (knocked down, dead) at the impact is never held or struck.
// Either way the scene is the void (world set's `scenes.to('void', {x, z})`, `setPhase(3)`). On his death
// the void breaks and the crossing returns as it was left (`scenes.to('crossing')`, fx.domainBreak);
// a reset (world.restore: scenes.reset) brings the crossing back and domain.reset forgets the rest.
// Phase 3's pace is the tuning's (windupScale / recoveryScale [2]).
//
// THE SURFACE:
//   domain.state      'off' | 'sign' | 'closing' | 'held' | 'inside'   ('inside': phase 3 in the void)
//   domain.inVoid     true from the close's impact until his death or a reset
//   domain.holding    true while the caught hero is held
//   domain.stats      { escapes, caught, spared (down at the impact), blows, breaks }
//   domain.motion(b, u, s, dt)   (beatMotion of a wjDomain beat)
//   domain.hitPlayer(o) → o      (the close's hit: no damage, no throw, the answer read after)
//   domain.onHit(o, r)           (after it)
//   domain.escape() / caught() / breakVoid()   (the Lab: debug.domain)
//   domain.frame(dt), reset()
// Events: `dragon:domain` { state: 'sign' | 'escape' | 'caught' | 'void' | 'break', x, z }.

const STAGGER = 0.4; // (player.js TUNE.staggerDur: the blow's own stagger)

export class Domain {
  constructor(d) {
    this.d = d;
    this.T = d.T.wjDomain;
    this.stats = { escapes: 0, caught: 0, spared: 0, blows: 0, breaks: 0 };
    this.reset();
  }

  reset() {
    this.state = 'off';
    this.inVoid = false;
    this.heldT = 0;
    this.heldFor = 0;
    this.struck = false;
    this.resolved = false;
    this._closeBeat = null;
  }

  get holding() {
    return this.state === 'held';
  }

  _emit(state) {
    this.d.emit('dragon:domain', { state, x: this.d.position.x, z: this.d.position.z });
  }

  /** Every frame of a wjDomain beat's windup (u 0..1) and its active frames (1..2). */
  motion(b, u, s, dt) {
    const d = this.d, K = b.def.wjDomain;
    void s, dt;
    if (K === 'sign') {
      if (this.state === 'off') {
        this.state = 'sign';
        this.resolved = false;
        this._emit('sign');
      }
      d.eyesK = Math.max(d.eyesK, 1);
      d.fx?.domainSign?.(d, Math.min(1, u));
    } else if (K === 'close') {
      if (this.state === 'off' || this.state === 'sign') this.state = 'closing';
      this._closeBeat = b;
      const k = Math.min(1, u);
      d.fx?.domainWall?.(d.position.x, d.position.z, this.T.r * (1 - k) + 1, k);
    }
  }

  /** The close's blow at the hero: no damage, no throw; a guard holds nothing (it is read as caught). */
  hitPlayer(o) {
    return { ...o, damage: 0, knockback: 0, knockdown: false, extra: { ...(o.extra ?? null), around: true, blockable: true, parryable: false, guardCost: 0, blockPush: 0, wjCrash: 0 } };
  }

  /** The close's answer (the engine's result). */
  onHit(o, r) {
    void o;
    if (this.resolved) return;
    if (r === RESULT.PERFECT) this.escape();
    else this.caught();
  }

  /** The hero dodged through the wall: inside unharmed, the barrier open. */
  escape() {
    const d = this.d;
    this.resolved = true;
    this.stats.escapes++;
    d.barrier?.open?.('domain', perPhase(d.T.wjBarrier.open, 3) * (this.T.escapeOpen ?? 2));
    this._emit('escape');
    this.toVoid();
    this.state = 'inside';
  }

  /** Caught: held, struck once (never lethal, never on a hero who is down). */
  caught() {
    const d = this.d, p = d.game.player;
    this.resolved = true;
    const down = !p?.alive || p.state === 'knockdown' || p.state === 'dead';
    if (down) {
      this.stats.spared++;
      this.toVoid();
      this.state = 'inside';
      return;
    }
    const H = Math.min(1.2, Math.max(STAGGER + 0.05, this.T.hold));
    const ok = p.hold?.(H) ?? false;
    this.stats.caught++;
    this._emit('caught');
    this.toVoid();
    if (!ok) {
      this.state = 'inside';
      return;
    }
    this.state = 'held';
    this.heldT = 0;
    this.heldFor = H;
    this.struck = false;
  }

  /** The one blow inside the hold: `blow` of his max health, at least 1 HP left. */
  _blow() {
    const d = this.d, p = d.game.player;
    this.struck = true;
    if (!p?.alive || p.state === 'knockdown') return;
    const dmg = Math.max(0, Math.min(this.T.blow * (p.maxHp ?? 100), (p.hp ?? 0) - 1));
    this.stats.blows++;
    try {
      p.takeHit({
        damage: dmg, from: { x: d.position.x, z: d.position.z }, knockback: this.T.knockback, knockdown: false, kind: 'blast', tell: TELL.RED,
        parryable: false, blockable: false, perfect: false, plunge: false, attack: 'measureless', attacker: d,
      });
    } catch (err) {
      console.error('[untouched] the domain blow failed', err);
    }
    d.game.shake?.(0.5);
  }

  /** The scene is the void (the set's scenes; its light). */
  toVoid() {
    const d = this.d, set = d.game.world?.forest;
    if (this.inVoid) return;
    this.inVoid = true;
    try {
      set?.scenes?.to?.('void', { x: d.position.x, z: d.position.z });
      set?.setPhase?.(3);
    } catch (err) {
      console.error('[untouched] scenes.to void', err);
    }
    this._emit('void');
  }

  /** His death: the void breaks, the crossing returns as it was left. */
  breakVoid() {
    const d = this.d, set = d.game.world?.forest;
    if (!this.inVoid) return false;
    this.inVoid = false;
    this.state = 'off';
    this.stats.breaks++;
    d.fx?.domainBreak?.(d.position.x, d.position.z);
    try {
      set?.scenes?.to?.('crossing', { x: d.position.x, z: d.position.z });
      set?.setPhase?.(2);
    } catch (err) {
      console.error('[untouched] scenes.to crossing', err);
    }
    this._emit('break');
    return true;
  }

  frame(dt) {
    const d = this.d;
    // the close's beat ended and nothing reached the hero (out of every zone): he is caught all the same
    const b = this._closeBeat;
    if (b && !this.resolved && b.done) {
      this._closeBeat = null;
      this.caught();
    }
    if (this.state === 'held') {
      this.heldT += dt;
      const p = d.game.player;
      d.fx?.domainCaught?.(p, Math.min(1, this.heldT / Math.max(0.05, this.heldFor)));
      if (!this.struck && this.heldT >= this.heldFor - STAGGER) this._blow();
      if (this.heldT >= this.heldFor || !p?.alive) this.state = 'inside';
    }
  }
}
