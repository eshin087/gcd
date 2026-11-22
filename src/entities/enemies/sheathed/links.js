// Lu Wusheng's combo links (duelist/brain.js header; director.js linkFor), in Shen Hui's order: the far
// and away pursuits first, then mid, the side, guarding, near. A shove or a kick that throws the hero
// back links to One Breath; a guarded single links to a string; from phase 2 the strings link to Moon
// Leaves the Water at close range and A Thousand Li at far range. Nothing links out of a draw before its
// click (`cut: 0.9`: the re-sheathe is the hero's opening), and no draw links into another (a chain of
// draws is one move: Three Autumns).

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });
const side = (to, chance, o) => ({ to, when: 'side', chance, ...o });
const guarding = (to, chance, o) => ({ to, when: 'guarding', chance, ...o });

/** After a blow that threw the hero back to a draw's distance: the draw. */
const THROWN = [
  far('thousandLi', [0, 0.45, 0.25]),
  mid('oneBreath', [0.75, 0.55, 0.25]),
  mid('returning', [0, 0.3, 0.12]),
  far('oneBreath', [0.6, 0.3, 0.15]),
  far('fordSteps', [0.35, 0.35, 0.35]),
];
/** After a single blow the hero guarded: a string. */
const STRINGS = [
  guarding('refusals', [0.5, 0, 0]),
  guarding('refusals2', [0, 0.45, 0.35]),
  guarding('refusalDraw', [0, 0.3, 0.35]),
  guarding('fordSteps', [0.3, 0.3, 0.3]),
];
/** After a string, from phase 2: a draw at the range the hero is at. */
const AFTER_STRING = [
  far('thousandLi', [0, 0.4, 0.25]),
  near('moonRise', [0, 0.35, 0.18]),
  mid('oneBreath', [0.3, 0.3, 0.12]),
  far('tapStone', [0.35, 0.3, 0.3]),
  away('tapStone', [0.4, 0.35, 0.3]),
];
/** After a draw (from its click on): a blunt pursuit, never another draw. */
const AFTER_DRAW = [
  far('fordSteps', [0.35, 0.35, 0.35], { cut: 0.9 }),
  far('tapStone', [0.3, 0.3, 0.3], { cut: 0.9 }),
  mid('shutDoor', [0.3, 0.3, 0.35], { cut: 0.9 }),
  near('knock', [0.3, 0.35, 0.35], { cut: 0.9 }),
  near('reedCutter', [0.2, 0.25, 0.25], { cut: 0.9 }),
];

export const LINKS = {
  // the singles: the string after a guarded one, else a close follow-up
  knock: [...STRINGS, near('lintel', [0.3, 0.3, 0.25]), mid('shutDoor', [0.3, 0.3, 0.3])],
  lintel: [...STRINGS, near('reedCutter', [0.25, 0.25, 0.25]), mid('oneBreath', [0.35, 0.3, 0.3])],
  reedCutter: [mid('oneBreath', [0.4, 0.35, 0.3]), far('fordSteps', [0.3, 0.3, 0.3]), near('knock', [0.3, 0.3, 0.3])],
  tapStone: [...STRINGS, near('refusals', [0.35, 0, 0]), near('refusals2', [0, 0.35, 0.3]), mid('oneBreath', [0.3, 0.3, 0.3])],
  falseSettle: [...STRINGS, near('moonRise', [0, 0.3, 0.3]), mid('oneBreath', [0, 0.3, 0.3])],
  // the shove and the kick string: they throw the hero back: the draw
  shutDoor: THROWN,
  fordSteps: [...THROWN.slice(0, 3), side('reedCutter', [0.3, 0.3, 0.3]), near('refusals', [0.3, 0, 0]), near('refusals2', [0, 0.3, 0.3])],
  // the strings: from phase 2, a draw at the range the hero is at
  refusals: [...AFTER_STRING, near('lintel', [0.3, 0, 0]), near('reedCutter', [0.25, 0, 0])],
  refusals2: [...AFTER_STRING, near('reedCutter', [0, 0.25, 0.25])],
  // the draws (from the click on)
  oneBreath: AFTER_DRAW,
  lightless: AFTER_DRAW,
  moonRise: AFTER_DRAW,
  thousandLi: AFTER_DRAW,
  refusalDraw: AFTER_DRAW,
  returning: AFTER_DRAW,
  threeAutumns: AFTER_DRAW,
  lateRain: [far('fordSteps', [0, 0, 0.4], { cut: 0.9 }), mid('shutDoor', [0, 0, 0.35], { cut: 0.9 }), near('knock', [0, 0, 0.35], { cut: 0.9 })],
};
