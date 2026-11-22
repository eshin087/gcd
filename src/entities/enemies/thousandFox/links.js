// Wen Yao's combo links (duelist/brain.js header, director.js linkFor; Shen Hui's format, ashDisciple/
// links.js). When a move ends on its own, the first entry whose `when` holds (near < 3.3 m, mid < 6 m,
// far beyond; side / behind; away: backing off; guarding), whose `chance` roll passes ([phase 1, 2, 3])
// and whose target is usable starts straight out of it at `cut` of the recovery. A target of a later
// phase is skipped until that phase (its chance there is 0 anyway).

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });
const guarding = (to, chance, o) => ({ to, when: 'guarding', chance, ...o });

/** A hero who left: he comes after him (a glide, a swap through a self, phase 3's pounce). */
const PURSUE = [
  far('foxPounce', [0, 0, 0.5]),
  far('changingPlaces', [0.4, 0.5, 0.45]),
  far('foxBite', [0.4, 0.35, 0.25]),
  away('foxBite', [0.4, 0.35, 0.3]),
  mid('foxBite', [0.35, 0.3, 0.25]),
  mid('changingPlaces', [0.25, 0.35, 0.35]),
];
/** After a single blow the hero guarded: a string. */
const STRINGS = [
  guarding('relay', [0, 0.45, 0.4]),
  guarding('brushstrokes', [0.45, 0.4, 0.35]),
];
const melee = (...close) => [...PURSUE, ...close];
const single = (...close) => [...PURSUE, ...STRINGS, ...close];

export const LINKS = {
  // ---- the selves torn off: the Pearl when the hero is far, else he comes in behind them
  scatter: [far('foxPearl', [0.55, 0.55, 0.45]), mid('foxBite', [0.4, 0.4, 0.3]), near('brushstrokes', [0.4, 0.35, 0.3])],
  // ---- through a self: the string where he lands
  changingPlaces: single(near('brushstrokes', [0.5, 0.45, 0.35]), near('relay', [0, 0.45, 0.4]), near('burningBrush', [0, 0, 0.45])),
  // ---- the ankles swept: a bite at a hero who rolled away
  sweepingBrush: [away('foxBite', [0.55, 0.5, 0.4]), ...melee(near('brushstrokes', [0.35, 0.35, 0.3]))],
  // ---- the strings and the blade's close moves
  brushstrokes: melee(near('sweepingBrush', [0.3, 0.3, 0.25]), near('burningBrush', [0, 0, 0.4])),
  relay: melee(near('moonLadder', [0, 0.3, 0.25]), near('burningBrush', [0, 0, 0.4])),
  moonLadder: single(near('sweepingBrush', [0.3, 0.3, 0.25])),
  foxBite: single(near('brushstrokes', [0.4, 0.4, 0.3]), near('relay', [0, 0.4, 0.35])),
  foxRing: melee(near('sweepingBrush', [0.3, 0.3, 0.3])),
  // ---- from range: he comes in behind it
  foxPearl: [far('changingPlaces', [0.45, 0.5, 0.45]), mid('foxBite', [0.4, 0.4, 0.35]), near('brushstrokes', [0.35, 0.35, 0.3])],
  paperBlades: [far('changingPlaces', [0, 0.5, 0.45]), mid('foxBite', [0, 0.4, 0.35])],
  // ---- phase 3: the tail, then the pounce at a hero it threw clear
  burningBrush: [far('foxPounce', [0, 0, 0.6]), away('foxPounce', [0, 0, 0.5]), ...melee(near('brushstrokes', [0, 0, 0.3]))],
  foxPounce: single(near('burningBrush', [0, 0, 0.45])),
  greatPearl: melee(near('burningBrush', [0, 0, 0.4])),
};
