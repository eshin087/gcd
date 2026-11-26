// HIS PATIENCE (the tuning pass, round 2; the owner: a defender who never attacks must not outlast him).
// The Untouched waits for the hero to come to him. A hero whose blade has not reached him (a cut that
// lands, or stops on the barrier: takeHit) for `TUNING.wjPatience.after` s while the fight is on is not
// coming: he STOPS WAITING. The cue, once, as it turns: his eyes burn through whatever covers them for
// `cue` s and the unveiling's sound plays (fx.eyes, 'wjUnveil'). Then, until the hero's blade reaches him
// again, every blow of his that is blocked costs at least `guardCost` of the guard meter (untouched.js
// _weighted): one block knocks the guard open and the next blow of the string lands in it (the guard
// meter's own rule, COMBAT.md). Every blow keeps its tell and its windup; a block still costs no health;
// the mercy rules (the 1.2 s lock cap, nothing on a hero who is down) stay. Measured with
// tests/integration/bench.mjs: the pace defender (never attacks) outlasted him in every seed; a hero who
// fights never sees it.
//
//   patience.frame(dt)     the clock (brainFrame)
//   patience.touch()       the hero's blade reached him (takeHit): the clock and the impatience reset
//   patience.impatient     true while he presses
//   patience.idle          s since the hero's blade last reached him
//   patience.stats         { turns, touches }
// No allocation per frame; no Math.random.

export class Patience {
  constructor(d) {
    this.d = d;
    this.idle = 0;
    this.impatient = false;
    this.cueT = 0;
    this.stats = { turns: 0, touches: 0 };
  }

  get T() {
    return this.d.T.wjPatience ?? null;
  }

  reset() {
    this.idle = 0;
    this.impatient = false;
    this.cueT = 0;
  }

  touch() {
    this.idle = 0;
    this.stats.touches++;
    if (this.impatient) {
      this.impatient = false;
      this.cueT = 0;
    }
  }

  frame(dt) {
    const T = this.T, d = this.d, g = d.game;
    if (!T || !(T.after > 0) || !(dt > 0)) return;
    if (this.cueT > 0) this.cueT = Math.max(0, this.cueT - dt);
    // (the clock runs while the fight is on and he is himself: not through a transition, a break or the
    // domain's hold; a hero who is down or dead is not waiting on him)
    const p = g?.player, a = d.brain?.act;
    if (g?.state !== 'boss' || d.mode === 'dead' || d.mode === 'dying' || d.broken || (d.mode === 'act' && a?.def?.transition) || d.domain?.holding || !p || p.alive === false) return;
    this.idle += dt;
    if (!this.impatient && this.idle >= T.after) {
      this.impatient = true;
      this.cueT = T.cue ?? 1.2;
      this.stats.turns++;
      try {
        d.emit?.('dragon:spell', { name: 'wjUnveil', x: d.position.x, z: d.position.z, dur: 0 });
      } catch (err) {
        console.error('[untouched] patience cue', err);
      }
    }
  }

  /** The cue's strength now (0..1): his eyes burn through the band (afterPose). */
  get cueK() {
    const T = this.T, c = T?.cue ?? 1.2;
    if (!(this.cueT > 0) || !(c > 0)) return 0;
    const u = 1 - this.cueT / c;
    return u < 0.15 ? u / 0.15 : 1 - Math.max(0, (u - 0.6) / 0.4);
  }
}
