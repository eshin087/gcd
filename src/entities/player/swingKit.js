// What a swing clip may borrow, in a module that imports nothing: swings.js and the style files
// (styles/<id>.js) both read it, so a style's clips can use the free hand's places without an import
// cycle (swings.js adds the styles' clips to SWINGS, so a style must never import swings.js).
// The clip format itself: the header of swings.js. The combo format: styles/COMBOS.md.

/** The free hand's places (a key's `fh`; the key's own fields win): where it is (`l`), its elbow
 *  (`lp`), where the sword fingers point (`ld`), the palm (`pn`) and the sword wrist (`lk`). */
export const FH = {
  aim: { l: [-0.02, 0, 0.4], lp: [0.35, -0.9, -0.1], ld: [-6, 10], pn: [-1, 0, 0], lk: 0 }, // 立剑指: at the foe, the thumb up, the elbow dropped
  aimLo: { l: [0.06, -0.26, 0.36], lp: [0.45, -0.85, -0.2], ld: [-4, -12], pn: [0, -1, 0], lk: 0 }, // 平剑指: a low point, the palm down
  chest: { l: [-0.1, -0.22, 0.26], lp: [0.6, -0.75, -0.2], ld: [22, 55], pn: [-1, 0, 0], lk: 0 }, // tucked before the left chest, the fingers up (arms in)
  wrist: { l: [-0.1, -0.25, 0.3], lp: [0.5, -0.85, -0.1], ld: [-60, -20], pn: [0, -1, 0], lk: 1 }, // 合: on the sword wrist (give `l` per clip)
  highWing: { l: [0.3, -0.02, -0.2], lp: [0.35, -0.8, -0.45], ld: [130, 25], pn: [-0.5, -1, 0.2], lk: 0 }, // drawn back-left at shoulder height (a bow draw)
  // (Session 30: it was LEVEL at shoulder height, [0.46, -0.06, -0.1]: with the whirl's and the flat
  // backhand's finish he stood like a scarecrow, one arm straight out. The hand sits a hand's width
  // under the shoulder now and the elbow hangs: a line that slopes away from the blade)
  wing: { l: [0.44, -0.17, -0.12], lp: [0.2, -0.75, -0.65], ld: [100, -8], pn: [0, -1, 0], lk: 0 }, // 展: out to his left, sloping down from the shoulder
  wingLo: { l: [0.4, -0.3, -0.14], lp: [0.3, -0.45, -0.85], ld: [110, -35], pn: [0, -1, 0], lk: 0 }, // low, out to his left
  tail: { l: [0.22, -0.38, -0.22], lp: [0.75, -0.3, -0.6], ld: [170, -58], pn: [-1, 0, 0], lk: 0 }, // behind the hip, the fingers back and down
  high: { l: [0.2, 0.3, -0.1], lp: [0.85, -0.3, 0.4], ld: [-10, 75], pn: [0.2, 0, 1], lk: 0 }, // RARE (the low sweep only): beside the head, never over the crown
};
