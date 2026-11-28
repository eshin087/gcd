import { RESULT } from '../../../combat/rules.js';
import { perPhase } from './tuning.js';

// THE UNREACHED (R1 of the brief; core's rule). While it is up, the hero's blade stops short on a shell
// round him (`TUNING.wjBarrier.shell` m off his hurt spheres: untouched.js grows them while it is up),
// deals nothing (no health, no posture), and the swing ends there: the hero is thrown back off it by a
// short bounce (player.onGuarded { deflect, push }: a guard or a roll cancels it at once). `exact` hits
// pass (the hero's flurry, the flash counter / One Breath's counter, the execution).
// It OPENS:
//   - at once, for open[phase] s, on a PERFECT parry or a PERFECT dodge of any blow of his (the
//     engine's own results through d.hitPlayer: RESULT.PARRIED with player.deflect.perfect,
//     RESULT.PERFECT), and on the hero's flash counter (a perfect trade: untouched.js onCounter);
//   - on a posture break, and stays open through it;
//   - by cracks: every ordinary parry adds one; `cracks` of them open it for openCracked[phase] s;
//     they fade after `crackFade` s without a new one (`cracks: 0` turns cracks off).
// While open he is hit like any duelist, harder: every cut of the hero's that is not `exact` deals
// `openDamage` x its damage (the tuning pass, round 3: the owner's "the barrier opens easier"; no new mark:
// the open ring on the floor is the sign, and the damage numbers read it). It closes on the timer, never while a cut of the hero's that
// already landed is still in its active frames.
// Two strikes on the shell in a row (within counterWindow s) and he answers with his counter.
//
// THE SURFACE (the fx reads the state; the rules call the methods; all safe every frame):
//   barrier.up          true while it stands
//   barrier.cracks      0 .. T.cracks
//   barrier.openT       s left open (0 while up)
//   barrier.openDur     s it was opened for (the last opening)
//   barrier.why         what opened it last ('parry' | 'dodge' | 'cracks' | 'break' | 'counter' | 'domain' | 'debug')
//   barrier.stats       { stops, cracks, opens: { why: n }, closes, passed }
//   barrier.stops(o)    from Untouched.takeHit: true = the blade stopped on the shell (deal nothing)
//   barrier.scaled(o)   from Untouched.takeHit, after stops: the cut with openDamage on it while open (o itself otherwise)
//   barrier.answer(r, o)   from Untouched.hitPlayer: the hero's answer to one of his blows
//   barrier.open(why, dur) / close() / crack()    (the domain, the Lab)
//   barrier.frame(dt), reset()
// Events: `dragon:barrier` { state: 'stop' | 'crack' | 'open' | 'close', why, cracks, dur }.

export class Barrier {
  constructor(d) {
    this.d = d;
    this.T = d.T.wjBarrier;
    this.stats = { stops: 0, cracks: 0, opens: {}, closes: 0, passed: 0 };
    this._stopEvt = { state: 'stop', why: '', cracks: 0, dur: 0 };
    this.reset();
  }

  reset() {
    this.up = true;
    this.cracks = 0;
    this.crackT = 0;
    this.openT = 0;
    this.openDur = 0;
    this.why = '';
    this.strikes = 0;
    this.lastStrike = -9;
  }

  _emit(state, why = '', dur = 0) {
    this.d.emit('dragon:barrier', { state, why, cracks: this.cracks, dur });
  }

  /** Open it for `dur` s (a longer opening already running is kept). */
  open(why = 'debug', dur = perPhase(this.T.open, this.d.phase)) {
    const t = Number.isFinite(dur) && dur > 0 ? dur : perPhase(this.T.open, this.d.phase);
    const was = this.up;
    this.why = why;
    if (!was && this.openT >= t) return false;
    this.up = false;
    this.openT = t;
    this.openDur = t;
    this.cracks = 0;
    this.crackT = 0;
    this.stats.opens[why] = (this.stats.opens[why] ?? 0) + 1;
    this.d.fx?.barrierOpen?.(this.d);
    this._emit('open', why, t);
    return true;
  }

  /** It stands again. */
  close() {
    if (this.up) return false;
    this.up = true;
    this.openT = 0;
    this.cracks = 0;
    this.crackT = 0;
    this.stats.closes++;
    this.d.fx?.barrierClose?.(this.d);
    this._emit('close', this.why);
    return true;
  }

  /** An ordinary parry: one crack (cracks enough: it opens). */
  crack() {
    const max = Math.round(this.T.cracks ?? 0);
    if (!this.up || !(max > 0)) return false;
    this.cracks = Math.min(max, this.cracks + 1);
    this.crackT = 0;
    this.stats.cracks++;
    this.d.fx?.barrierCrack?.(this.cracks, max);
    this._emit('crack', 'parry');
    if (this.cracks >= max) this.open('cracks', perPhase(this.T.openCracked, this.d.phase));
    return true;
  }

  /**
   * The hero's cut reaches him (Untouched.takeHit, before the engine's). True: it stopped on the shell
   * (the caller deals nothing). An `exact` hit, no damage, or the barrier open: false (the engine's).
   */
  stops(o) {
    const d = this.d;
    if (!this.up || !o || o.exact || !(Number(o.damage) > 0) || d.mode === 'dying' || d.mode === 'dead') {
      if (o?.exact && this.up) this.stats.passed++;
      return false;
    }
    if (d.mode === 'sleep') d.startIntro();
    this.stats.stops++;
    const p = d.game.player, pt = o.point;
    // the stop on the shell: a ripple where the blade stopped, a short freeze, the hero thrown back
    let dx = Number(o.dir?.x), dz = Number(o.dir?.z);
    if (!Number.isFinite(dx + dz)) {
      dx = d.position.x - (p?.position?.x ?? 0);
      dz = d.position.z - (p?.position?.z ?? 0);
    }
    const l = Math.hypot(dx, dz) || 1;
    d.fx?.barrierStop?.(pt && Number.isFinite(pt.x + pt.y + pt.z) ? pt : { x: d.position.x, y: 1.2, z: d.position.z }, { x: dx / l, z: dz / l }, !!o.heavy);
    d.hitstop?.(0.06, 0.04);
    d.game.shake?.(o.heavy ? 0.22 : 0.14);
    try {
      p?.onGuarded?.({ deflect: true, heavy: !!o.heavy, attacker: d, shell: true, push: this.T.push });
    } catch (err) {
      console.error('[untouched] player.onGuarded failed', err);
    }
    this._emit('stop');
    // two strikes in a row on the shell: his counter
    const now = d.time;
    this.strikes = now - this.lastStrike <= this.T.counterWindow ? this.strikes + 1 : 1;
    this.lastStrike = now;
    if (this.strikes >= this.T.counterAfter && d.mode === 'foot' && d.brain.aiEnabled) {
      this.strikes = 0;
      const mv = d.kit.counterMove?.();
      if (mv) d.brain.startAct(mv);
    }
    return true;
  }

  /** The hero's cut while it is open: `openDamage` x its damage (an exact hit, or it standing: o as it is). */
  scaled(o) {
    const k = Number(this.T.openDamage);
    if (this.up || !o || o.exact || !(Number(o.damage) > 0) || !Number.isFinite(k) || k === 1 || !(k > 0)) return o;
    return { ...o, damage: Number(o.damage) * k };
  }

  /** The hero's answer to a blow of his (Untouched.hitPlayer, after the engine's). */
  answer(r, o) {
    const p = this.d.game.player;
    if (r === RESULT.PERFECT) this.open('dodge');
    else if (r === RESULT.PARRIED) {
      if (p?.deflect?.perfect) this.open('parry');
      else this.crack();
    }
    void o;
  }

  frame(dt) {
    const d = this.d;
    if (!this.up) {
      // (a posture break holds it open; a cut of the hero's that landed and is still live closes after it)
      if (d.broken) this.openT = Math.max(this.openT, 0.25);
      this.openT -= dt;
      if (this.openT <= 0) {
        const a = d.game.player?.atk;
        const live = a && a.hit && Number.isFinite(a.t) && a.def && a.t <= a.def.windup + a.def.active + 0.02;
        if (live) this.openT = 0;
        else this.close();
      }
    } else if (this.cracks > 0) {
      this.crackT += dt;
      if (this.crackT >= this.T.crackFade) {
        this.cracks = 0;
        this.crackT = 0;
      }
    }
    d.fx?.barrierIdle?.(d, dt);
  }
}
