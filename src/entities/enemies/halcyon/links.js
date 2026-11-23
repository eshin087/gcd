// Halcyon's combo links (duelist/brain.js header, director.js linkFor; the Fox's format). When a move ends
// on its own, the first entry whose `when` holds (near < 3.3 m, mid < 6 m, far beyond; away: backing off;
// guarding), whose `chance` roll passes ([phase 1, 2, 3]) and whose target is usable starts straight out
// of it at `cut` of the recovery. Short chains only in phase 1 (ADR-154); in phase 3 Fly-By links into The
// Stare (the pass carries him past you; the eyes follow).

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });
const guarding = (to, chance, o) => ({ to, when: 'guarding', chance, ...o });

/** A hero who left: the eyes, or the pass. */
const PURSUE = [
  far('stare', [0.25, 0.3, 0.3]),
  far('meteor', [0, 0.35, 0.3]),
  far('flyBy', [0.25, 0, 0]),
  away('redGlare', [0.2, 0.3, 0.3]),
  mid('backhand', [0.2, 0.25, 0.2]),
];
const STRINGS = [guarding('meetAndGreet', [0.3, 0.35, 0.3]), guarding('blink', [0, 0.35, 0.35])];
const melee = (...close) => [...PURSUE, ...close];

export const LINKS = {
  meetAndGreet: melee(near('backhand', [0.25, 0.3, 0.25]), near('applause', [0, 0.3, 0.3])),
  backhand: [far('stare', [0.35, 0.35, 0.3]), mid('redGlare', [0.25, 0.3, 0.3]), ...STRINGS],
  smile: melee(),
  stare: [near('meetAndGreet', [0.25, 0.3, 0.3]), mid('curbside', [0.2, 0.25, 0.2])],
  redGlare: [near('meetAndGreet', [0.25, 0.3, 0.25]), far('flyBy', [0.2, 0, 0]), far('flyBy2', [0, 0.3, 0])],
  flyBy: [near('meetAndGreet', [0.3, 0, 0]), far('stare', [0.25, 0, 0])],
  flyBy2: [near('blink', [0, 0.35, 0]), far('scorchedAvenue', [0, 0.3, 0])],
  flyBy3: [far('stare', [0, 0, 0.6]), mid('stare', [0, 0, 0.5]), near('crossedGlare', [0, 0, 0.3])],
  curbside: [far('flyBy', [0.3, 0, 0]), far('flyBy2', [0, 0.3, 0]), mid('stare', [0.25, 0.25, 0.25])],
  blink: melee(near('applause', [0, 0.3, 0.3])),
  applause: [away('meteor', [0, 0.4, 0.35]), far('scorchedAvenue', [0, 0.3, 0.3]), ...STRINGS],
  meteor: melee(near('meetAndGreet', [0, 0.3, 0.3])),
  scorchedAvenue: [far('meteor', [0, 0.35, 0.3]), mid('blink', [0, 0.3, 0.3])],
  seeTheWorld: [far('stare', [0, 0.4, 0.4])],
  monument: [far('crossedGlare', [0, 0, 0.35]), near('blink', [0, 0, 0.35])],
  crossedGlare: [far('flyBy3', [0, 0, 0.35]), near('blink', [0, 0, 0.3])],
};
