// Varr Nihil's combo links (the second pass; duelist/brain.js header, director.js linkFor). When a
// move ends on its own, the first entry whose `when` holds (near < 3.3 m, mid < 6 m, far beyond;
// front / side / behind; away; guarding; any), whose `chance` roll passes ([form 1, 2, 3, 4] or one
// number) and whose target is usable in this form (its weight there, cooldown unless `force`, its
// band unless `band: false`) starts straight out of it, at `cut` of the recovery (default
// TUNING.pressure.linkCut). Up to pressure.chainDepth moves in a row, then a breather.
// A target that is not in the form's moveset is passed over, so each list names one choice per form
// where they differ (a chance of 0 in the other forms). Order matters: the far / away pursuits
// first, then mid range, then close. Every move has an entry: a blade move chases a hero who left
// (the Void reaches for him, a pursuit string, the blink) and goes on into another string close in;
// a spell or a thrown thing is followed by a string while it is still in the air.

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });
/** A chance in one form only. */
const f1 = (c) => [c, 0, 0, 0], f2 = (c) => [0, c, 0, 0], f3 = (c) => [0, 0, c, 0], f4 = (c) => [0, 0, 0, c];

/** After a blade move, a hero who left: the Void reaches for him (the bolt, the pull, the push), a
 *  pursuit string comes after him (the push that opens a string, the hunting wings, the walking
 *  mountain, the waltz of blinks), a dashing blow at mid range. */
const PURSUE = [
  far('voidWaltz', f4(0.55)),
  far('rend', f4(0.45)),
  far('pushOpening', f1(0.45)),
  far('wingedPursuit', f2(0.5)),
  far('grasp', [0.35, 0.35, 0.35, 0.4]),
  far('voidBolt', [0.35, 0.4, 0.4, 0]),
  away('drawnIn', f1(0.45)),
  away('wingedPursuit', f2(0.5)),
  away('walkingMountain', f3(0.5)),
  away('voidWaltz', f4(0.5)),
  away('voidPush', [0.3, 0.35, 0.4, 0.4]),
  mid('hollowStep', f1(0.35)),
  mid('severance', [0.3, 0.3, 0.35, 0.4]),
  mid('lunge', [0.3, 0, 0, 0.4]),
  mid('wingedPursuit', f2(0.45)),
  mid('scissor', f2(0.35)),
  mid('walkingMountain', f3(0.45)),
  mid('stoneWheel', f3(0.35)),
  mid('mill', f3(0.35)),
  mid('voidWaltz', f4(0.4)),
];
/** Close: the form's red sweep, the backflip away. */
const CLOSE = [
  near('reap', f1(0.2)),
  near('reap2', f2(0.25)),
  near('parting', [0, 0.15, 0.2, 0.2]),
];
const melee = (...close) => [...PURSUE, ...close, ...CLOSE];
/** Close in, each form's strings (one of them, in turn): what waits where a closer lands. */
const STRINGS = [
  near('voidVerse', f1(0.35)), near('litany', f1(0.35)), near('veiledHand', f1(0.35)),
  near('wheelingBlade', f2(0.35)), near('tempest', f2(0.35)), near('twinCartwheel', f2(0.35)),
  near('stoneWheel', f3(0.35)), near('cyclone', f3(0.35)), near('grindingWheel', f3(0.35)),
  near('thunderVerse', f4(0.35)), near('judgment', f4(0.35)), near('hollowCrown', f4(0.35)),
];
/** After a spell or a thrown thing: he comes in behind it while it is still in the air. */
const AFTER_SPELL = [
  near('voidVerse', f1(0.35)), near('litany', f1(0.3)), near('crushingVerse', f1(0.3)),
  near('wheelingBlade', f2(0.35)), near('tempest', f2(0.3)), near('twinCartwheel', f2(0.3)),
  near('stoneWheel', f3(0.35)), near('cyclone', f3(0.3)), near('starHand', f3(0.3)),
  near('thunderVerse', f4(0.35)), near('judgment', f4(0.3)), near('hollowCrown', f4(0.3)),
  mid('drawnIn', f1(0.35)),
  mid('skyfall', [0.3, 0.35, 0, 0.4]),
  mid('wingedPursuit', f2(0.4)),
  mid('scissor', f2(0.3)),
  mid('walkingMountain', f3(0.45)),
  mid('mill', f3(0.3)),
  mid('voidWaltz', f4(0.45)),
  far('pushOpening', f1(0.4)),
  far('wingedPursuit', f2(0.4)),
  far('voidWaltz', f4(0.45)),
  far('severance', [0.3, 0.3, 0.35, 0.4]),
  far('rend', f4(0.4)),
];

export const LINKS = {
  // ---- form 1: the blade and the hand
  litany: melee(near('voidVerse', f1(0.3)), near('crushingVerse', f1(0.25))),
  cadence: melee(near('crushingVerse', f1(0.3)), near('litany', f1(0.25))),
  dirge: melee(near('veiledHand', f1(0.3)), near('litany', f1(0.25))),
  reap: melee(near('cadence', f1(0.3)), near('voidVerse', f1(0.25))),
  veiledHand: melee(near('voidVerse', f1(0.3)), near('drawnIn', f1(0.25))),
  voidVerse: melee(near('crushingVerse', f1(0.3)), near('veiledHand', f1(0.25))),
  drawnIn: melee(near('litany', f1(0.3)), near('voidVerse', f1(0.25))),
  pushOpening: melee(near('veiledHand', f1(0.35)), near('cadence', f1(0.25))),
  // (the Crushing Dark as the last word: the hero rolled out of its line)
  crushingVerse: melee(near('litany', f1(0.3)), near('voidVerse', f1(0.25))),
  hollowStep: [near('veiledHand', f1(0.45)), near('crushingVerse', f1(0.3)), mid('drawnIn', f1(0.4)), far('grasp', f1(0.35))],
  // ---- form 2: twin blades
  tempest: melee(near('wheelingBlade', f2(0.3)), near('gale', f2(0.25))),
  gale: melee(near('twinCartwheel', f2(0.3)), near('tempest', f2(0.25))),
  reap2: melee(near('crossedTides', f2(0.35)), near('tempest', f2(0.25))),
  wheelingBlade: melee(near('twinCartwheel', f2(0.35)), near('tempest', f2(0.25))),
  wingedPursuit: melee(near('tempest', f2(0.35)), near('wheelingBlade', f2(0.3))),
  crossedTides: melee(near('gale', f2(0.35)), near('wheelingBlade', f2(0.3))),
  twinCartwheel: melee(near('wheelingBlade', f2(0.35)), near('crossedTides', f2(0.25))),
  // ---- form 3: the staff
  cyclone: melee(near('stoneWheel', f3(0.3)), near('undertow', f3(0.2))),
  mill: melee(near('grindingWheel', f3(0.3)), near('cyclone', f3(0.25))),
  // (it ends in fissures with the hero a vault away: the stones or the walk again)
  walkingMountain: [mid('stoneWheel', f3(0.45)), mid('mill', f3(0.35)), far('starfall', f3(0.4)), ...melee(near('grindingWheel', f3(0.35)))],
  // (its stones may still be in the air: he closes behind them)
  stoneWheel: melee(near('cyclone', f3(0.35)), near('starHand', f3(0.3))),
  starHand: melee(near('grindingWheel', f3(0.35)), near('cyclone', f3(0.25))),
  grindingWheel: melee(near('starHand', f3(0.3)), near('stoneWheel', f3(0.3))),
  // ---- form 4: the Void
  judgment: melee(near('thunderVerse', f4(0.3)), near('eclipse', f4(0.25))),
  eclipse: melee(near('hollowCrown', f4(0.3)), near('judgment', f4(0.25))),
  rend: melee(near('judgment', f4(0.35)), near('thunderVerse', f4(0.3))),
  voidWaltz: melee(near('thunderVerse', f4(0.35)), near('judgment', f4(0.3))),
  thunderVerse: melee(near('hollowCrown', f4(0.3)), near('voidWaltz', f4(0.3))),
  hollowCrown: melee(near('eclipse', f4(0.3)), near('thunderVerse', f4(0.25))),
  // ---- the moments and the gap closers: what waits where they land
  lunge: [...STRINGS, far('grasp', [0.3, 0, 0, 0.4])],
  skyfall: [...STRINGS, mid('drawnIn', f1(0.3)), mid('wingedPursuit', f2(0.35)), mid('voidWaltz', f4(0.35))],
  scissor: [near('wheelingBlade', f2(0.35)), near('tempest', f2(0.35)), mid('wingedPursuit', f2(0.35)), far('glaive', f2(0.3))],
  severance: [...STRINGS, mid('drawnIn', f1(0.3)), mid('walkingMountain', f3(0.35))],
  meridian: [...STRINGS, mid('wingedPursuit', f2(0.35)), mid('walkingMountain', f3(0.35)), mid('voidWaltz', f4(0.35))],
  nightfall: [...STRINGS, far('voidBolt', [0.3, 0.3, 0.35, 0]), far('chain', f4(0.4))],
  starfall: [near('grindingWheel', f3(0.35)), near('cyclone', f3(0.35)), near('hollowCrown', f4(0.35)), near('eclipse', f4(0.35)), mid('walkingMountain', f3(0.35)), mid('voidWaltz', f4(0.35))],
  pinwheel: [near('tempest', f2(0.3)), near('twinCartwheel', f2(0.3)), far('glaive', f2(0.3))],
  grasp: [...STRINGS],
  undertow: [near('cyclone', f3(0.35)), near('starHand', f3(0.3))],
  // ---- the spells and the thrown things: a string while it is still in the air
  voidBolt: AFTER_SPELL,
  voidPush: AFTER_SPELL,
  grip: AFTER_SPELL,
  glaive: AFTER_SPELL,
  debris: AFTER_SPELL,
  rift: AFTER_SPELL,
  chain: AFTER_SPELL,
  tide: AFTER_SPELL,
  storm: AFTER_SPELL,
  star: AFTER_SPELL,
  voidHurl: AFTER_SPELL,
  glassRain: AFTER_SPELL,
  crownFall: AFTER_SPELL,
  parting: [far('voidBolt', f2(0.35)), far('voidBolt', f3(0.4)), far('tide', f4(0.45)), mid('wingedPursuit', f2(0.4)), mid('walkingMountain', f3(0.4)), mid('voidWaltz', f4(0.4)), mid('voidPush', [0, 0.3, 0.35, 0.4])],
  // (the waves are still running over the crater: the mixed-answer rule keeps his blade back until they are past)
  starlessNight: [far('voidWaltz', f4(0.4)), near('thunderVerse', f4(0.35))],
  // ---- his counters out of a guard: on into a string
  riposte: [near('veiledHand', f1(0.25)), near('voidVerse', f1(0.2))],
  riposte2: [near('wheelingBlade', f2(0.25)), near('twinCartwheel', f2(0.2))],
  riposte3: [near('grindingWheel', f3(0.25)), near('stoneWheel', f3(0.2))],
  riposte4: [near('thunderVerse', f4(0.25)), near('hollowCrown', f4(0.2))],
};
