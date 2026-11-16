// Varr Nihil's combo links (the second pass; duelist/brain.js header, director.js linkFor). When a
// move ends on its own, the first entry whose `when` holds (near < 3.3 m, mid < 6 m, far beyond;
// front / side / behind; away; guarding; any), whose `chance` roll passes ([form 1, 2, 3, 4] or one
// number) and whose target is usable in this form (its weight there, cooldown unless `force`, its
// band unless `band: false`) starts straight out of it, at `cut` of the recovery (default
// TUNING.pressure.linkCut). Up to pressure.chainDepth moves in a row, then a breather.
// A first table over today's moves (core); the moves agent extends it. A target that is not in the
// form's moveset is passed over, so each list names one choice per form where they differ. Order
// matters: the far / away pursuits first, then mid range, then close.

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });

/** After a blade move: the Void reaches for a hero who left (the bolt, the pull, the push), the
 *  blink in form 4, a dashing blow at mid range. */
const PURSUE = [
  far('rend', [0, 0, 0, 0.6]),
  far('grasp', [0.35, 0.35, 0.4, 0.45]),
  far('voidBolt', [0.4, 0.45, 0.5, 0]),
  away('voidPush', [0.4, 0.45, 0.5, 0.55]),
  mid('severance', [0.3, 0.35, 0.4, 0.45]),
  mid('lunge', [0.3, 0, 0, 0.45]),
  mid('scissor', [0, 0.4, 0, 0]),
  mid('mill', [0, 0, 0.4, 0]),
];
/** Close: the form's own strings and its red sweep. */
const CLOSE = [
  near('reap', [0.25, 0, 0, 0]),
  near('reap2', [0, 0.3, 0, 0]),
  near('parting', [0, 0.2, 0.25, 0.25]),
];
const melee = (...close) => [...PURSUE, ...close, ...CLOSE];
/** After a spell or a thrown thing: he comes in behind it. */
const AFTER_SPELL = [
  near('litany', [0.4, 0, 0, 0]),
  near('tempest', [0, 0.45, 0, 0]),
  near('cyclone', [0, 0, 0.45, 0]),
  near('judgment', [0, 0, 0, 0.5]),
  mid('skyfall', [0.35, 0.4, 0, 0.45]),
  mid('scissor', [0, 0.4, 0, 0]),
  mid('mill', [0, 0, 0.4, 0]),
  far('severance', [0.3, 0.35, 0.4, 0.45]),
  far('rend', [0, 0, 0, 0.5]),
];

export const LINKS = {
  // ---- the strings (each form's) and the close blows
  litany: melee(near('cadence', [0.25, 0, 0, 0])),
  cadence: melee(near('litany', [0.25, 0, 0, 0])),
  dirge: melee(near('litany', [0.25, 0, 0, 0])),
  reap: melee(near('cadence', [0.3, 0, 0, 0])),
  tempest: melee(near('gale', [0, 0.3, 0, 0])),
  gale: melee(near('tempest', [0, 0.3, 0, 0])),
  reap2: melee(near('tempest', [0, 0.35, 0, 0])),
  cyclone: melee(near('undertow', [0, 0, 0.25, 0])),
  mill: melee(near('cyclone', [0, 0, 0.3, 0])),
  judgment: melee(near('eclipse', [0, 0, 0, 0.3])),
  eclipse: melee(near('judgment', [0, 0, 0, 0.3])),
  rend: melee(near('judgment', [0, 0, 0, 0.35])),
  // ---- the gap closers: what waits where they land
  lunge: [near('litany', [0.35, 0, 0, 0]), near('judgment', [0, 0, 0, 0.4]), far('grasp', [0.3, 0, 0, 0.4])],
  skyfall: [near('litany', [0.35, 0, 0, 0]), near('tempest', [0, 0.4, 0, 0]), near('judgment', [0, 0, 0, 0.4])],
  scissor: [near('tempest', [0, 0.4, 0, 0]), far('glaive', [0, 0.35, 0, 0])],
  severance: [near('litany', [0.3, 0, 0, 0]), near('tempest', [0, 0.35, 0, 0]), near('cyclone', [0, 0, 0.35, 0]), near('eclipse', [0, 0, 0, 0.4])],
  meridian: [near('cadence', [0.3, 0, 0, 0]), near('gale', [0, 0.35, 0, 0]), near('cyclone', [0, 0, 0.35, 0]), near('judgment', [0, 0, 0, 0.4])],
  nightfall: [far('voidBolt', [0.3, 0.3, 0.35, 0]), far('chain', [0, 0, 0, 0.4])],
  starfall: [near('cyclone', [0, 0, 0.4, 0]), near('eclipse', [0, 0, 0, 0.4])],
  pinwheel: [near('tempest', [0, 0.35, 0, 0]), far('glaive', [0, 0.3, 0, 0])],
  grasp: [near('litany', [0.4, 0, 0, 0]), near('tempest', [0, 0.4, 0, 0]), near('cyclone', [0, 0, 0.4, 0]), near('judgment', [0, 0, 0, 0.45])],
  undertow: [near('cyclone', [0, 0, 0.4, 0])],
  // ---- the spells and the thrown things: a close follow-up
  voidBolt: AFTER_SPELL,
  voidPush: AFTER_SPELL,
  grip: AFTER_SPELL,
  glaive: AFTER_SPELL,
  debris: AFTER_SPELL,
  rift: AFTER_SPELL,
  chain: AFTER_SPELL,
  tide: AFTER_SPELL,
  parting: [far('voidBolt', [0, 0.35, 0.4, 0]), far('tide', [0, 0, 0, 0.45]), mid('voidPush', [0, 0.3, 0.35, 0.4])],
};
