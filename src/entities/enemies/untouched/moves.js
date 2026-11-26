import { TELL } from '../../../combat/rules.js';
import { makeRealise } from '../duelist/realise.js';
import { X as ASC } from '../ascendant/moves.js';
import { compileClip, completeBeat, GUARD, FRAGS, CLIPS as POSE_CLIPS, REACT as POSE_REACT, OPEN as POSE_OPEN } from './poses.js';
import { TUNING, perPhase } from './tuning.js';
import * as MELEE from './moves/melee.js';
import * as SPELLS from './moves/spells.js';
import * as TERRAIN from './moves/terrain.js';

// Bai Wuji's moves: THE ROUTER (core's; nobody owns it after wave 0: do not edit it to add a move).
// It merges the three move files, each owned by one agent:
//   moves/melee.js     his blows, strings, blinks, counters, the flurry   (the melee agent)
//   moves/spells.js    Azure Draw, Crimson Cast, Violet Null, Dark Spark   (the spells agent)
//   moves/terrain.js   thrown wreckage, the void's floating pieces         (the terrain agent)
// and holds the two TRANSITIONS (core's rules: the P1 -> P2 unveiling, the P2 -> P3 domain: domain.js).
//
// A move file exports (moves/melee.js header): `moves(X)` → { name: move }, optional `LINKS`, `FIELDS`
// (the `wj` beat fields its handler owns) and `create(d)` (its handler: spells.js shows the hooks).
// The format is the duelist's (ashDisciple/moves.js header; duelist/realise.js; duelist/brain.js for
// the engine's optional fields). X, the builders every file gets: Tian Lei's (ascendant/moves.js X:
// punch, kick, elbow, shoulder, strikeKeys, F, feet ...) plus his own: `FRAGS` (every pose fragment of
// the pose router, poses.js), `holdKeys(a, b, cock)`, `TUNING` (his), `perPhase`.
//
// HIS RULES ON THE DATA (tests/integration/veil.mjs DATA checks them):
//   - every new beat or move field is prefixed `wj` (the engine's own names: MAP-engine's list);
//   - every real blow has a tell and a windup inside TUNING.minFirstWindup / minHitGap;
//   - every blow that lands throws (`knockback` >= 2 m; 2 - 5 for hands and feet, 6 - 10 the big ones);
//   - a blow out of a blink (`wjBlink`) holds from any side (`around`, untouched.js hitPlayer);
//   - his spells are never blockable: Draw's crush, the Null and Cast's burst RED, a thing Draw throws
//     and the fist he pulls the hero onto BLUE (a held guard is opened: `breaksGuard`).
// CORE'S BEAT FIELDS (untouched.js handles them; the moves files may use them):
//   wjBlink: { behind: m } | { at: rad, r } | { side: +-1, r } [, u]   he vanishes and is behind the hero /
//            at `at` rad round from the hero's facing / to his side, at u (0.12) of the windup
//   wjCrash: false | power   a landed throw of this blow goes through the world (default: every throw of
//            TUNING.wjCrash.minKb m or more, at TUNING.wjCrash.power; false: never)
//   blockPush: m, guardCost: points   (engine fields) a block's slide and its cost (defaults: TUNING.wjWeight)
//   wjMoment: '<name>'       a transition's scripted beat (untouched.js / domain.js)
//   wjDomain: 'sign' | 'close'   the domain's two beats (domain.js)

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED;

/** A held pose's keys over a beat (u 0..2): from `a` at the cock to `b` at the impact, held. */
export const holdKeys = (a, b, cock = 0.7) => [[cock * 0.5, a], [cock, a], [1.0, { ...b, e: 'i' }], [2.0, b]];

/** The builders every move file is given. */
export const X = Object.freeze({ ...ASC, FRAGS, holdKeys, TUNING, perPhase, TELL: Object.freeze({ N, B, R, K: TELL.BLACK }) });

const FILES = [['melee', MELEE], ['spells', SPELLS], ['terrain', TERRAIN]];

// ---------------------------------------------------------------- the transitions (core's)
const TR = TUNING.transition, DOM = TUNING.wjDomain;
const F = FRAGS;
const TRANSITION_MOVES = {
  /** THE BLINDFOLD COMES OFF (the phase-2 transition): a finger hooked in the blindfold, pulled down; the
   *  hair falls, the eyes burn; a burst from where he stands throws the hero back (a push: no damage,
   *  blockable) and flattens the nearest ruins. The dress changes at its impact (dressPhase 2). */
  unveil: {
    label: 'The Blindfold Comes Off (phase 2)', phase: 2, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.6,
    beats: [{
      tell: N, windup: 1.8, fixed: true, active: 0.2, damage: TR.damage, knockback: TR.knockback, blockPush: TR.blockPush,
      zone: { kind: 'ring', r: TR.ringRadius }, part: 'feet', track: 0, close: 0, cock: 0.85, air: true, wjMoment: 'unveil',
      keys: [[0.2, F.STAND], [0.6, F.UNVEIL], [0.85, F.UNVEIL], [1.0, { ...F.STAND, e: 'o' }], [2.0, F.STAND]],
    }],
  },
  /** THE MEASURELESS (the phase-3 transition, domain.js): the hand sign, then the sphere closes (red:
   *  a perfect dodge through it, or be caught: held and struck once, never lethal). Either way the last
   *  phase is fought inside the void. */
  measureless: {
    label: 'The Measureless (phase 3)', phase: 3, weight: [0, 0, 0], transition: true, cooldown: 0, band: [0, 99], recovery: 0.6,
    beats: [
      { feint: true, windup: DOM.sign, fixed: true, active: 0.05, close: 0, track: 0.6, wjDomain: 'sign', keys: holdKeys(F.STAND, F.SIGN, 0.4) },
      {
        tell: R, windup: DOM.close, fixed: true, active: 0.12, damage: 0, knockback: 0, zone: { kind: 'ring', r: DOM.r }, ring: DOM.r,
        part: 'palms', track: 0, close: 0, cock: 0.8, air: true, wjDomain: 'close', keys: holdKeys(F.SIGN, F.SIGN, 0.8),
      },
    ],
  },
};

// ---------------------------------------------------------------- the merge
function merge() {
  const out = {}, links = {}, owners = {};
  for (const [who, M] of FILES) {
    let mv = {};
    try {
      mv = M.moves?.(X) ?? {};
    } catch (err) {
      console.error(`[untouched] moves/${who}.js moves() failed`, err);
    }
    for (const [k, v] of Object.entries(mv)) {
      if (Object.hasOwn(out, k)) {
        console.error(`[untouched] move "${k}" of moves/${who}.js is defined twice: the first kept`);
        continue;
      }
      out[k] = v;
      owners[k] = who;
    }
    for (const [k, v] of Object.entries(M.LINKS ?? {})) links[k] = [...(links[k] ?? []), ...v];
  }
  for (const [k, v] of Object.entries(TRANSITION_MOVES)) {
    out[k] = v;
    owners[k] = 'core';
  }
  return { out, links, owners };
}
const M0 = merge();
export const MOVES = M0.out;
export const MOVE_NAMES = Object.keys(MOVES);
/** Which file each move came from ('melee' | 'spells' | 'terrain' | 'core'). */
export const MOVE_OWNERS = Object.freeze(M0.owners);
/** The merged links of the three files (links.js adds core's). */
export const FILE_LINKS = M0.links;
/** The handlers: { name, fields, create } of every move file that has one (untouched.js builds them). */
export const HANDLERS = Object.freeze(FILES.filter(([, M]) => typeof M.create === 'function').map(([name, M]) => Object.freeze({ name, fields: Object.freeze([...(M.FIELDS ?? [])]), create: M.create })));
/** The scripted move that begins each later phase. */
export const TRANSITIONS = Object.freeze({ 2: 'unveil', 3: 'measureless' });
/** His counter out of his guard, his flurry (the kit's counterMove / streakMove). */
export const COUNTER = 'notEvenClose';
export const STREAK = 'tooSlow';

// ---------------------------------------------------------------- reaction clips (the pose router's)
export const CLIP = Object.fromEntries(Object.entries(POSE_CLIPS).map(([k, c]) => [k, compileClip(c.keys.map(([t, pose]) => ({ t, ...pose })), c.dur, { hold: !!c.hold })]));
for (const [k, c] of Object.entries(CLIP)) c.name = k;
export const REACT = POSE_REACT;
export const OPEN = POSE_OPEN;

// ---------------------------------------------------------------- realising a move
export const realise = makeRealise({ TUNING, MOVES, compileClip: (keys, dur) => compileClip(keys, dur), completeBeat });

/** The guard pose (for tools). */
export { GUARD };
