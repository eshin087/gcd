// Qian Yao's combo links (duelist/brain.js header, director.js linkFor): when a move ends on its own,
// the first entry whose `when` holds (near / mid / far / away ...), whose `chance` passes ([P1, P2, P3]
// or one number) and whose target is usable (its phase, weight, cooldown unless `force`, band unless
// `band: false`) starts out of it at `cut` of the recovery (default TUNING.pressure.linkCut: the first
// part of every recovery stays the hero's punish window). Order matters: pursuits first, then close.
//   - Palm of Noon throws the hero far back: the Gaze follows him out.
//   - A drink never ends in standing about: the Gaze or Noonfall out of the pool (forced).
//   - After a red beam a red follow-up (the Rule Pierces, Noonfall), never a guard string the fairness
//     guard would have to feint (the Lord's AFTER_RED lesson).

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });
const any = (to, chance, o) => ({ to, when: 'any', chance, ...o });

/** A hero who left after a blade move: his eyes, the dive, the passage, the thrust across the gap. */
const PURSUE = [
  far('heavenGaze', [0.4, 0.35, 0.3]),
  far('noonfall', [0.3, 0.3, 0.3]),
  far('exilesPassage', [0, 0.35, 0.3]),
  far('passageReturn', [0, 0, 0.3]),
  away('rulePierces', [0.45, 0.4, 0.4]),
  mid('rulePierces', [0.35, 0.35, 0.35]),
  mid('sweepingGaze', [0, 0.3, 0.3]),
  mid('crossedGaze', [0, 0, 0.3]),
];
/** Close in: his strings in turn. */
const CLOSE = [
  near('threeJudgments', [0.3, 0.3, 0.3]),
  near('turningDay', [0, 0.35, 0.4]),
  near('pillarOfLaw', [0.25, 0.2, 0.2]),
  near('palmOfNoon', [0.2, 0.2, 0.25]),
  near('lightGoesOut', [0, 0.12, 0.15]),
];
const melee = (...first) => [...first, ...PURSUE, ...CLOSE];
/** After a red beam or a red blow: red, or nothing. */
const AFTER_RED = [
  near('turningDay', [0, 0.25, 0.3]),
  mid('rulePierces', [0.35, 0.35, 0.4]),
  far('noonfall', [0.35, 0.35, 0.35]),
];

export const LINKS = {
  decree: melee(),
  threeJudgments: melee(),
  pillarOfLaw: melee(),
  rulePierces: [...AFTER_RED, ...CLOSE],
  palmOfNoon: [any('heavenGaze', [0.75, 0.6, 0.5], { band: false }), any('sweepingGaze', [0, 0.5, 0.5], { band: false })],
  heavenGaze: melee(),
  noonfall: melee(),
  // a drink never ends in standing about
  sunDrink: [far('heavenGaze', 1, { force: true, band: false }), any('noonfall', 1, { force: true, band: false }), any('heavenGaze', 1, { force: true, band: false })],
  sweepingGaze: AFTER_RED,
  gazeOnHigh: AFTER_RED,
  turningDay: melee(),
  exilesPassage: [...AFTER_RED, ...CLOSE],
  lightGoesOut: melee(),
  openSky: melee(),
  crossedGaze: AFTER_RED,
  passageReturn: [...AFTER_RED, ...CLOSE],
};
