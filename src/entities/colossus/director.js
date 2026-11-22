import { ATTACKS, TUNING, perPhase } from './tuning.js';
import { MOVES } from './attacks.js';

// The Tide Colossus's director (ADR-141): a weighted pick over the moves off cooldown, by phase and by
// where the hero stands (his x picks the hand; his depth from the rim weighs sweep / slam / breath), a
// repeat penalty, the moves' links, the gaps between moves (shorter by phase; longer after a move the
// hero answered), the flick against a hero who stands at a resting hand, and no safe spot (a hero deep
// on the shelf for long draws the breath and the surge). Fairness (COMBAT.md rule 10): one move runs at
// a time (the surge's front is its move: nothing else starts until it has crossed the shelf), every first
// windup is at least TUNING.fair.minWindup in phase 1, a string's impacts at least TUNING.fair.stringGap
// apart (the data; tide.mjs `data` checks both), so no two cues that need different answers come within
// TUNING.fair.apart of each other (tide.mjs `bounds` measures it).

const DIR = TUNING.director;

export class Director {
  constructor(c) {
    this.c = c;
    this.opts = null;
  }

  /** The gap after a move the hero answered (a parried last blow, the plunge, a break). */
  opening() {
    const c = this.c, g = perPhase(TUNING.openingGap, c.phase);
    c.gapT = Math.max(c.gapT, g[0] + Math.random() * (g[1] - g[0]));
    c.answered = false;
  }

  /** A move ended: its gap, maybe its link. */
  onEnd(a) {
    const c = this.c;
    if (c.answered) {
      this.opening();
      return;
    }
    const g = perPhase(TUNING.idleGap, c.phase);
    c.gapT = g[0] + Math.random() * (g[1] - g[0]);
    for (const L of a.def?.links ?? []) {
      const d = ATTACKS[L.to];
      if (d && d.phase <= c.phase && !(c.cooldowns[L.to] > 0) && Math.random() < L.chance) {
        c.queued = L.to;
        break;
      }
    }
  }

  /** Every frame: how long the hero has stood within reach of each resting hand's fingers. */
  tick(dt) {
    const c = this.c, s = c.sense, F = ATTACKS.flick;
    for (const h of c.hands) {
      const tips = c.rig.pt.tips[h.i];
      const near = h.mode === 'grip' && Math.hypot(s.x - (tips[1].x + tips[2].x) / 2, s.z - (tips[1].z + tips[2].z) / 2) < F.near;
      h.nearT = near ? h.nearT + dt : 0;
    }
  }

  /** The next move's name (null: none can go now); c._pickOpts holds its options. */
  pick() {
    const c = this.c, s = c.sense, ph = c.phase;
    c._pickOpts = null;
    // the flick: a hero who has stood within reach of a resting hand's fingers
    const F = ATTACKS.flick;
    for (const h of c.hands) {
      if (h.nearT >= F.after && !(c.cooldowns.flick > 0) && h.reelT <= 0) {
        h.nearT = 0;
        c._pickOpts = { side: h.i };
        return 'flick';
      }
    }
    const depth = s.depth, deep = s.deepT >= DIR.deepT;
    let total = 0;
    const pool = this._pool ?? (this._pool = []);
    pool.length = 0;
    for (const name in MOVES) {
      const d = ATTACKS[name];
      if (!d || name === 'flick' || name === 'bellow') continue;
      if ((d.phase ?? 1) > ph || c.cooldowns[name] > 0) continue;
      let w = perPhase(d.w, ph);
      if (!(w > 0)) continue;
      // where he stands: out of the sweep's band, it is wasted; deep on the shelf, the breath reaches
      if (name === 'sweep' || name === 'crossSweep') w *= depth > d.band ? 0.15 : depth < 5 ? 1.5 : 1;
      if (name === 'breath' || name === 'surge') w *= deep ? DIR.deepK : depth > 9 ? 1.4 : 1;
      if (name === 'breaker' && Math.abs(s.x) > 16) w *= 0.3;
      // a hand that has let go: the moves that need both wait
      if ((name === 'breaker' || name === 'crossSweep') && (c.hands[0].reelT > 0 || c.hands[1].reelT > 0)) continue;
      if (c.hands[0].reelT > 0 && c.hands[1].reelT > 0 && name !== 'breath' && name !== 'surge') continue;
      if (name === c.lastMove) w *= DIR.repeat;
      pool.push(name, w);
      total += w;
    }
    if (!(total > 0)) return null;
    let r = Math.random() * total;
    for (let k = 0; k < pool.length; k += 2) {
      r -= pool[k + 1];
      if (r <= 0) return pool[k];
    }
    return pool[pool.length - 2];
  }
}
