// Shen Hui's combo links (the second pass; duelist/brain.js header, director.js linkFor). When a move
// ends on its own, the first entry whose `when` holds (where the hero is: near < 3.3 m, mid < 6 m,
// far beyond; front / side / behind; away: backing or rolling off; guarding; any), whose `chance`
// roll passes ([phase 1, 2, 3] or one number) and whose target is usable (its phase, weight, cooldown
// unless `force`, its band unless `band: false`) starts straight out of it, at `cut` of the recovery
// (default TUNING.pressure.linkCut). Up to pressure.chainDepth moves in a row, then a breather.
// Order matters: the far / away pursuits first, then the follow-ups by where the hero stands (behind or
// at his side: a spin or a sweep; guarding: a string after a single blow; at range: the qi), then close.
// A target of a later phase is skipped until that phase (its chance in the earlier ones is 0 anyway).

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });
const side = (to, chance, o) => ({ to, when: 'side', chance, ...o });
const behind = (to, chance, o) => ({ to, when: 'behind', chance, ...o });
const guarding = (to, chance, o) => ({ to, when: 'guarding', chance, ...o });

/** The pursuit after any blade move: sword qi or the storm at range, the glides and the dash chain,
 *  the thrust at a hero who backed off. */
const PURSUE = [
  far('qiStorm', [0, 0, 0.45]),
  far('emberFan', [0, 0.4, 0.3]),
  far('zigzag', [0, 0.35, 0.3]),
  far('windStep', [0.45, 0.5, 0.55]),
  far('ashCrescent', [0.35, 0.4, 0.4]),
  // (a flagstone kicked at a hero who keeps his distance; terrain agent's suggestion)
  far('flagKick', [0.2, 0.2, 0.2]),
  away('ghostDash', [0, 0, 0.6]),
  away('glideKick', [0.4, 0.45, 0.5]),
  away('piercingAsh', [0.3, 0.4, 0.45]),
  mid('leapingString', [0, 0.5, 0.5]),
  mid('leapSpin', [0.4, 0.45, 0.5]),
  mid('glideKick', [0.35, 0.4, 0.45]),
  mid('plumThrust', [0.3, 0.4, 0.5]),
  mid('severingWind', [0.25, 0.35, 0.45]),
];
/** At his side or behind him as a move ends: a spin, a sweep, a cut from where he is gone to. */
const ROUND = [
  behind('flitLotus', [0, 0, 0.6]),
  behind('windSpin', [0.5, 0.55, 0.5]),
  behind('lotus', [0.35, 0.45, 0.5]),
  side('ashString', [0, 0, 0.5]),
  side('windSpin', [0.35, 0.4, 0.4]),
  side('crane', [0.3, 0.35, 0.35]),
];
const melee = (...close) => [...PURSUE, ...ROUND, ...close];
/** After a single blow the hero guarded: a string. */
const STRINGS = [
  guarding('ashFlurry', [0, 0, 0.45]),
  guarding('burningCross', [0, 0.5, 0.4]),
  guarding('chaseRain', [0.45, 0.45, 0.45]),
  guarding('mirrorFeint', [0.35, 0.4, 0.4]),
];
const single = (...close) => [...PURSUE, ...ROUND, ...STRINGS, ...close];
/** After a thrown piece of the yard: he closes in behind it while it flies (as after his sword qi). */
const THROWN = [
  far('windStep', [0.4, 0.45, 0.45]),
  far('ghostDash', [0, 0, 0.5]),
  mid('glideKick', [0.4, 0.4, 0.45]),
  mid('leapingString', [0, 0.4, 0.4]),
  near('swallow', [0.35, 0.35, 0.3]),
  near('burningCross', [0, 0.4, 0.35]),
  near('ashString', [0, 0, 0.45]),
];

export const LINKS = {
  // ---- the strings and the blade's close moves: a pursuit, the round, else a close follow-up
  ashRain: melee(near('lotus', [0.3, 0.35, 0.3]), near('flitLotus', [0, 0, 0.5])),
  swallow: melee(near('mirrorFeint', [0.35, 0.4, 0.4]), near('kickBrand', [0, 0.45, 0.4]), near('ashString', [0, 0, 0.5]), near('lotus', [0.3, 0.4, 0.4])),
  crane: melee(near('hesitate', [0.3, 0.35, 0.3]), near('kickBrand', [0, 0.45, 0.4]), near('ashString', [0, 0, 0.5])),
  hesitate: melee(near('fallingAsh', [0.35, 0.4, 0.4]), near('swallow', [0.3, 0.4, 0.4])),
  needles: melee(near('emberWhirl', [0, 0.45, 0.4]), near('flitLotus', [0, 0, 0.5])),
  petals: melee(near('fallingStar', [0, 0.45, 0.45]), near('ashString', [0, 0, 0.5])),
  emberWhirl: melee(near('needles', [0, 0.45, 0.4]), near('ashString', [0, 0, 0.5])),
  glideKick: melee(near('windSpin', [0.4, 0.45, 0.4]), near('burningCross', [0, 0.5, 0.45]), near('flitLotus', [0, 0, 0.5])),
  leapSpin: melee(near('partingWind', [0.4, 0.45, 0.4]), near('kickBrand', [0, 0.45, 0.4]), near('ashString', [0, 0, 0.5])),
  mirrorFeint: melee(near('swallow', [0.4, 0.4, 0.35]), near('ashFlurry', [0, 0, 0.45]), near('burningCross', [0, 0.45, 0.4])),
  chaseRain: melee(near('lotus', [0.3, 0.35, 0.3]), near('flitLotus', [0, 0, 0.5])),
  windSpin: melee(near('partingWind', [0.45, 0.45, 0.4]), near('ashFlurry', [0, 0, 0.45]), near('needles', [0, 0.4, 0.3])),
  partingWind: [away('ghostDash', [0, 0, 0.6]), away('glideKick', [0.5, 0.5, 0.5]), ...melee(near('windSpin', [0.4, 0.45, 0.45]), near('ashString', [0, 0, 0.5]))],
  burningCross: melee(near('kickBrand', [0, 0.45, 0.4]), near('emberWhirl', [0, 0.4, 0.35]), near('ashString', [0, 0, 0.5])),
  kickBrand: melee(near('burningCross', [0, 0.45, 0.4]), near('ashFlurry', [0, 0, 0.45])),
  ashString: melee(near('ashFlurry', [0, 0, 0.5]), near('flitLotus', [0, 0, 0.45])),
  ashFlurry: melee(near('flitLotus', [0, 0, 0.5])),
  flitLotus: melee(near('ashString', [0, 0, 0.55]), near('ashFlurry', [0, 0, 0.45])),
  // ---- the single blows: openers now; the string after a guarded one, the pursuit, a close follow-up
  lotus: single(near('fallingStar', [0.35, 0.45, 0.45]), near('ashString', [0, 0, 0.5])),
  fallingAsh: single(near('swallow', [0.4, 0.45, 0.4]), near('ashString', [0, 0, 0.5])),
  fallingStar: single(near('crane', [0.35, 0.35, 0.3]), near('kickBrand', [0, 0.45, 0.4]), near('ashString', [0, 0, 0.5])),
  // ---- the ones that cover ground: what waits where they land
  windStep: [near('swallow', [0.45, 0.4, 0.35]), near('burningCross', [0, 0.5, 0.4]), near('ashString', [0, 0, 0.55]), near('fallingStar', [0.35, 0.4, 0.4]), mid('glideKick', [0.4, 0.45, 0.45]), mid('plumThrust', [0.3, 0.4, 0.45])],
  plumThrust: [...STRINGS, near('swallow', [0.45, 0.45, 0.4]), near('ashString', [0, 0, 0.55]), far('windStep', [0.4, 0.5, 0.55]), mid('glideKick', [0.35, 0.4, 0.45])],
  piercingAsh: [near('fallingStar', [0.4, 0.45, 0.4]), near('ashString', [0, 0, 0.55]), far('emberFan', [0, 0.4, 0.3]), far('qiStorm', [0, 0, 0.45]), far('ashCrescent', [0.35, 0.4, 0.4])],
  severingWind: [...STRINGS, near('fallingAsh', [0.4, 0.4, 0.35]), near('flitLotus', [0, 0, 0.5]), far('windStep', [0.35, 0.45, 0.5])],
  twinEmbers: [near('swallow', [0.4, 0.45, 0.4]), near('ashString', [0, 0, 0.55]), far('emberFan', [0, 0.4, 0.3]), far('ashCrescent', [0.35, 0.4, 0.4])],
  blackTide: [near('lotus', [0.35, 0.4, 0.35]), near('flitLotus', [0, 0, 0.5]), far('windStep', [0.35, 0.45, 0.5])],
  heavenFall: [near('emberWhirl', [0, 0.55, 0.45]), near('flitLotus', [0, 0, 0.55]), near('kickBrand', [0, 0.45, 0.45]), far('emberFan', [0, 0.45, 0.35]), far('ashCrescent', [0, 0.35, 0.35])],
  zigzag: [near('burningCross', [0, 0.5, 0.45]), near('ashString', [0, 0, 0.5]), near('kickBrand', [0, 0.45, 0.45]), far('emberFan', [0, 0.4, 0.35]), mid('leapingString', [0, 0.45, 0.45])],
  leapingString: [near('kickBrand', [0, 0.5, 0.45]), near('emberWhirl', [0, 0.4, 0.35]), near('ashString', [0, 0, 0.5]), far('zigzag', [0, 0.45, 0.4]), far('emberFan', [0, 0.35, 0.3])],
  ghostDash: [near('ashFlurry', [0, 0, 0.5]), near('ashString', [0, 0, 0.5]), far('qiStorm', [0, 0, 0.5]), mid('leapSpin', [0, 0, 0.45])],
  // ---- sword qi from afar: he comes in behind it
  ashCrescent: [far('windStep', [0.45, 0.5, 0.5]), far('ghostDash', [0, 0, 0.5]), mid('glideKick', [0.45, 0.45, 0.45]), mid('plumThrust', [0.35, 0.4, 0.4]), near('swallow', [0.35, 0.4, 0.4])],
  emberFan: [far('zigzag', [0, 0.55, 0.45]), far('windStep', [0, 0.45, 0.45]), mid('leapingString', [0, 0.5, 0.45]), mid('glideKick', [0, 0.4, 0.4]), near('burningCross', [0, 0.45, 0.4])],
  qiStorm: [far('ghostDash', [0, 0, 0.6]), far('windStep', [0, 0, 0.45]), mid('ghostDash', [0, 0, 0.55]), mid('leapSpin', [0, 0, 0.45]), near('ashString', [0, 0, 0.5])],
  // ---- the thrown pieces (terrain.js): he comes in behind the piece, or kicks another at a hero who
  // backs away (the terrain agent's suggestions; modest chances, the tuning pass sets them)
  lanternKick: [away('flagKick', 0.25), ...THROWN],
  flagKick: [away('flagKick', 0.2), ...THROWN],
  flagVolley: THROWN,
  flagFan: THROWN,
};
