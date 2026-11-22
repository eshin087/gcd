// Gu Shan's combo links (duelist/brain.js header, director.js linkFor; the Lord's links.js explains the
// format). He links little: one move at a time in phase 1 (pressure.chainDepth 1), at most two in a row
// after. When a move ends on its own, the first entry whose `when` holds, whose chance passes ([phase
// 1, 2, 3]) and whose target is usable in this phase starts out of it at `cut` of the recovery.

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });

/** A hero who backed off after a blow: from phase 2 he takes One Step to him (phase 3: Closing
 *  Mountains too), or answers from where he stands. */
const PURSUE = [
  far('oneStep', [0, 0.6, 0.45]),
  far('closingMountains', [0, 0, 0.4]),
  far('idleFinger', [0, 0.2, 0.2]),
  mid('splitEarth', [0, 0.3, 0.3]),
];
/** Close in: one more blow of the phase. */
const CLOSE = [
  near('fallingPeak', [0, 0.25, 0.25]),
  near('mountainPalm', [0, 0.2, 0.25]),
  near('heavenEarth', [0, 0, 0.3]),
];

export const LINKS = {
  fallingPeak: [...PURSUE, near('mountainPalm', [0, 0.3, 0.3]), near('heavenEarth', [0, 0, 0.3])],
  idleFinger: [far('oneStep', [0, 0.7, 0.5]), far('closingMountains', [0, 0, 0.4])],
  mountainPalm: [...PURSUE, ...CLOSE],
  twinPeaks: [...PURSUE],
  oneStep: [near('fallingPeak', [0, 0.3, 0.3]), near('heavenEarth', [0, 0, 0.3])],
  splitEarth: [far('oneStep', [0, 0.5, 0.4]), far('closingMountains', [0, 0, 0.4]), mid('oneStep', [0, 0.3, 0.3])],
  heavenEarth: [...PURSUE],
  closingMountains: [...PURSUE, ...CLOSE],
  // (The One Blow and the transitions end the exchange: no link)
};
