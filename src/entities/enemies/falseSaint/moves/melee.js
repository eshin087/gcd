import { TUNING_MELEE } from '../tuningMelee.js';

// The False Saint's ground game (the MELEE AGENT's file; moves.js is the router: its header has the format
// and the rules). Open hands, sweeps, knees, the grab, the long walk, his counter and his phase-1 flurry.
// The boosters (the booster punch, the plated arm's flurry, the jet dash) are moves/boost.js's.
// Exports:
//   moves(X)        → { name: move }   (X: the builders, moves.js; no import of moves.js: a cycle)
//   LINKS           { from: [link, ...] } his combo links for these moves (links.js format)
//   FIELDS          the beat fields this file's HANDLER owns (below)
//   create(d)       → the handler (FsMelee)
// Every new beat or move field is prefixed `fs`.
//
// THE BEAT FIELDS (this handler's):
//   fsBlow: 'light' | 'heavy'   the weight of a hand or foot blow (every beat of this file has one: it is
//            what routes the beat to this handler)
//
// MOVE FIELDS the router reads (moves.js header): fsFlurry [phases] (this move is his flurry in those
// phases), fsCounter [phases] (his counter out of his guard in those phases).
//
// CORE'S STAND-IN (wave 0): Benediction, Genuflect, Rebuke (the counter), Litany (the flurry), enough to
// fight in every phase; the melee agent owns them from here.

/** The beat fields this handler owns (moves.js routes a beat with one of them here). */
export const FIELDS = Object.freeze(['fsBlow']);

const TM = TUNING_MELEE;
const pp = (v, i) => (Array.isArray(v) ? v[Math.min(v.length - 1, i)] : v);

export function moves(X) {
  const { punch, kick, elbow, TELL } = X;
  const { N, B } = TELL;
  const FOL = TM.follow, BN = TM.benediction, GN = TM.genuflect, RB = TM.rebuke, LT = TM.litany;
  const follows = (beat, extra = {}) => ({ ...beat, close: FOL.close, ...extra });
  const litany = [];
  for (let i = 0; i < LT.blows; i++) {
    litany.push({ ...punch(i % 2 ? 'cross' : 'jab', N, pp(LT.windup, i === 0 ? 0 : 1), LT.damage, { left: i % 2 === 0 }), knockback: LT.knockback, flit: { r: 2.4 }, fsBlow: 'light' });
  }
  return {
    /** Benediction: palm, palm, then a heel-palm shove that sends the hero far (n, n, blue). */
    benediction: {
      label: 'Benediction', phase: 1, weight: [2.2, 1.6, 1.2, 1.0], cooldown: 3.5, band: [0, 3.4], recovery: 0.6, cat: 'string',
      beats: [
        { ...punch('jab', N, pp(BN.windup, 0), pp(BN.damage, 0), { left: true }), knockback: pp(BN.knockback, 0), fsBlow: 'light' },
        follows({ ...punch('cross', N, pp(BN.windup, 1), pp(BN.damage, 1)), knockback: pp(BN.knockback, 1), fsBlow: 'light' }),
        follows({ ...punch('palm', B, pp(BN.windup, 2), pp(BN.damage, 2), { flare: true }), knockback: pp(BN.knockback, 2), blockPush: BN.blockPush, fsBlow: 'heavy' }),
      ],
    },
    /** Genuflect: a low sweep at the ankles into a rising knee (n, blue). */
    genuflect: {
      label: 'Genuflect', phase: 1, weight: [1.6, 1.2, 1.0, 0.8], cooldown: 4.5, band: [0, 3.0], recovery: 0.7,
      beats: [
        { ...kick('sweep', N, pp(GN.windup, 0), pp(GN.damage, 0)), knockback: pp(GN.knockback, 0), fsBlow: 'light' },
        follows({ ...kick('knee', B, pp(GN.windup, 1), pp(GN.damage, 1), { flare: true }), knockback: pp(GN.knockback, 1), groundMark: { kind: 'slam' }, fsBlow: 'heavy' }),
      ],
    },
    /** Rebuke (his counter): a slip aside and a short elbow (blue). */
    rebuke: {
      label: 'Rebuke', phase: 1, weight: [0, 0, 0, 0], counter: true, fsCounter: [1, 2, 3, 4], cooldown: 0, band: [0, 5], recovery: 0.55,
      beats: [{ ...elbow(B, RB.windup, RB.damage), knockback: RB.knockback, fsBlow: 'heavy' }],
    },
    /** Litany (his phase-1 flurry, out of a streak of guards): quick alternating palms (normal). */
    litany: {
      label: 'Litany', phase: 1, weight: [0, 0, 0, 0], counter: true, streak: true, fsFlurry: [1, 2, 3, 4], cooldown: 0, band: [0, 6], recovery: 0.75,
      beats: litany,
    },
  };
}

// ---------------------------------------------------------------- his combo links (links.js format)
const L = (to, when, chance) => ({ to, when, chance });
export const LINKS = {
  benediction: [L('genuflect', 'near', [0.3, 0.3, 0.3, 0.3])],
  genuflect: [L('benediction', 'near', [0.3, 0.3, 0.3, 0.3])],
};

// ================================================================== THE HANDLER
/**
 * FsMelee: the melee beats' own behaviour (the routing contract, saint.js header; every hook optional).
 * THE SURFACE others may read: `stats` { blows, landed, blocked }.
 */
export class FsMelee {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T?.melee ?? TM;
    this.reset();
  }
  reset() {
    this.stats = { blows: 0, landed: 0, blocked: 0 };
  }
  stop() {}
  frame() {}
  onImpact() {
    this.stats.blows++;
  }
  onHit(o, r) {
    if (r === 'hit') this.stats.landed++;
    else if (r === 'blocked') this.stats.blocked++;
  }
}
export const create = (d) => new FsMelee(d);
