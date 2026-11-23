import { TUNING } from './tuning.js';

// Xin Yi's combo links (duelist/brain.js header, director.js linkFor; the Ash Disciple's format). When a
// move ends on its own, the first entry whose `when` holds, whose `chance` roll passes ([phase 1, 2, 3])
// and whose target is usable starts straight out of it at `cut` of the recovery.
// DEJA VU (TUNING.dejavu): the first entry of each replayable string is a link back to ITSELF (`force`:
// past its cooldown; `dejavu`: wokenOne.js stutters the hall and has it realised as the first pass was);
// in phase 3 to its mirrored copy. Only a string that ended on its own links (the engine's rule): never
// one parried into a recoil.

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });
const guarding = (to, chance, o) => ({ to, when: 'guarding', chance, ...o });
const DV = TUNING.dejavu.chance;
/** Deja vu out of `name`: the same string again (phase 2), mirrored (phase 3). */
const dejavu = (name) => [
  { to: name, when: 'any', chance: [0, DV[1], 0], force: true, dejavu: true, band: false, cut: 0.6 },
  { to: `${name}M`, when: 'any', chance: [0, 0, DV[2]], force: true, dejavu: true, band: false, cut: 0.6 },
];

/** A hero who left: he comes after him. */
const PURSUE = [
  far('wallStep', [0.6, 0.35, 0.3]),
  far('stormStep', [0.35, 0, 0]),
  far('craneWater', [0.35, 0, 0]),
  far('ironRain', [0, 0.45, 0]),
  far('twoThunders', [0, 0.35, 0]),
  far('ironLeap', [0, 0.3, 0]),
  far('pushingHands', [0, 0, 0.4]),
  far('diveWithin', [0, 0, 0.3]),
  away('wallStep', [0.5, 0.3, 0.2]),
  away('craneWater', [0.3, 0, 0]),
  mid('twoThunders', [0, 0.3, 0]),
];
const STRINGS = [
  guarding('hundredHands', [0.35, 0, 0]),
  guarding('oneRoof', [0.3, 0, 0]),
  guarding('lesson', [0.35, 0.3, 0.25]),
  guarding('closeIron', [0, 0.4, 0]),
  guarding('thousandHands', [0, 0, 0.4]),
];
const melee = (...close) => [...PURSUE, ...close];
const single = (...close) => [...PURSUE, ...STRINGS, ...close];

export const LINKS = {
  lesson: [...dejavu('lesson'), ...melee(near('lowWind', [0.25, 0.25, 0.2]))],
  stairKick: [...dejavu('stairKick'), ...melee(near('idleHand', [0.3, 0.25, 0.2]))],
  closeIron: [...dejavu('closeIron'), ...melee(near('turningWheel', [0, 0.25, 0]))],
  thousandHands: [...dejavu('thousandHands'), ...melee(near('stillHand', [0, 0, 0.3]))],
  idleHand: single(near('stairKick', [0.35, 0.3, 0.25]), near('skyTurns', [0.3, 0, 0])),
  brushOff: [mid('wallStep', [0.6, 0.25, 0.2]), mid('craneWater', [0.3, 0, 0]), mid('ironRain', [0, 0.45, 0]), mid('pushingHands', [0, 0, 0.45]), mid('unwriting', [0, 0, 0.3])],
  lowWind: [away('wallStep', [0.5, 0.3, 0.2]), ...melee(near('threeOnAir', [0.3, 0, 0]), near('idleHand', [0.3, 0.25, 0.2]))],
  wallStep: single(near('moonOver', [0.3, 0, 0]), near('stairKick', [0.3, 0.25, 0.2])),
  // ---- the rework's phase 1 (ADR-168)
  threeOnAir: melee(near('oneRoof', [0.3, 0, 0]), near('idleHand', [0.25, 0, 0])),
  skyTurns: melee(near('moonOver', [0.3, 0, 0]), near('oneRoof', [0.25, 0, 0])),
  craneWater: single(near('threeOnAir', [0.3, 0, 0]), near('lesson', [0.25, 0, 0])),
  moonOver: melee(near('skyTurns', [0.3, 0, 0])),
  oneRoof: melee(near('stairKick', [0.3, 0, 0]), near('lowWind', [0.2, 0, 0])),
  hundredHands: melee(near('longLesson', [0.3, 0, 0]), near('skyTurns', [0.25, 0, 0])),
  longLesson: melee(near('hundredHands', [0.3, 0, 0])),
  stormStep: single(near('hundredHands', [0.35, 0, 0])),
  ironRain: [mid('closeIron', [0, 0.3, 0]), far('twoThunders', [0, 0.2, 0])],
  ironLeap: [mid('closeIron', [0, 0.35, 0]), far('ironRain', [0, 0.2, 0])],
  twoThunders: [mid('wallStep', [0, 0.3, 0]), near('closeIron', [0, 0.35, 0])],
  turningWheel: [away('ironRain', [0, 0.35, 0]), near('closeIron', [0, 0.3, 0])],
  pushingHands: [far('leaveFloor', [0, 0, 0.3]), mid('diveWithin', [0, 0, 0.25])],
  unwriting: [far('leaveFloor', [0, 0, 0.35]), near('thousandHands', [0, 0, 0.3])],
  leaveFloor: single(),
  stillHand: single(),
  diveWithin: single(near('thousandHands', [0, 0, 0.3])),
};
