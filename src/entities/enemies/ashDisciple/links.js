// Shen Hui's combo links (the second pass; duelist/brain.js header, director.js linkFor). When a move
// ends on its own, the first entry whose `when` holds (where the hero is: near < 3.3 m, mid < 6 m,
// far beyond; front / side / behind; away: backing or rolling off; guarding; any), whose `chance`
// roll passes ([phase 1, 2, 3] or one number) and whose target is usable (its phase, weight, cooldown
// unless `force`, its band unless `band: false`) starts straight out of it, at `cut` of the recovery
// (default TUNING.pressure.linkCut). Up to pressure.chainDepth moves in a row, then a breather.
// A first table over today's moves (core); the moves agent extends it. Order matters: the far /
// away pursuits first, then the follow-ups at mid range, then close.

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });

/** The pursuit after any blade move: the dash in, sword qi at a hero who backed off, the thrust. */
const PURSUE = [
  far('windStep', [0.45, 0.6, 0.75]),
  far('ashCrescent', [0.35, 0.55, 0.75]),
  away('piercingAsh', [0.35, 0.5, 0.65]),
  mid('plumThrust', [0.35, 0.5, 0.65]),
  mid('severingWind', [0.3, 0.45, 0.6]),
];
const melee = (...close) => [...PURSUE, ...close];

export const LINKS = {
  // ---- the strings and the blade's close moves: a pursuit, else a close follow-up
  ashRain: melee(near('lotus', [0.25, 0.4, 0.55])),
  swallow: melee(near('lotus', [0.3, 0.45, 0.6]), near('fallingStar', [0.25, 0.4, 0.55])),
  lotus: melee(near('fallingStar', [0.3, 0.45, 0.6])),
  fallingAsh: melee(near('swallow', [0.3, 0.45, 0.6])),
  fallingStar: melee(near('crane', [0.25, 0.4, 0.55])),
  crane: melee(near('hesitate', [0.25, 0.4, 0.55])),
  hesitate: melee(near('fallingAsh', [0.3, 0.45, 0.6])),
  needles: melee(near('emberWhirl', [0.3, 0.45, 0.6])),
  petals: melee(near('fallingStar', [0.3, 0.45, 0.6])),
  emberWhirl: melee(near('needles', [0.3, 0.45, 0.6])),
  // ---- the ones that cover ground: what waits where they land
  windStep: [near('swallow', [0.4, 0.55, 0.7]), near('fallingStar', [0.3, 0.45, 0.6]), mid('plumThrust', [0.3, 0.45, 0.6])],
  plumThrust: [near('swallow', [0.35, 0.5, 0.65]), far('windStep', [0.35, 0.5, 0.65])],
  piercingAsh: [near('fallingStar', [0.35, 0.5, 0.65]), far('ashCrescent', [0.3, 0.45, 0.6])],
  severingWind: [near('fallingAsh', [0.35, 0.5, 0.65]), far('windStep', [0.3, 0.45, 0.6])],
  twinEmbers: [near('swallow', [0.35, 0.5, 0.65]), far('ashCrescent', [0.3, 0.45, 0.6])],
  blackTide: [near('lotus', [0.3, 0.45, 0.6]), far('windStep', [0.3, 0.45, 0.6])],
  heavenFall: [near('emberWhirl', [0.4, 0.55, 0.7]), far('ashCrescent', [0.3, 0.45, 0.6])],
  // ---- sword qi from afar: he comes in behind it
  ashCrescent: [far('windStep', [0.4, 0.55, 0.7]), mid('plumThrust', [0.35, 0.5, 0.65]), near('swallow', [0.3, 0.45, 0.6])],
};
