import { lookOf } from './lookSwitch.js';

// The bosses drawn in the hero's style (ADR-220): per boss, one look switch for how the art pass draws
// him, never what he wears or his colours (the owner, 2026-11-26: "i didnt mean make it the same color or
// cloth texture as the main character. i meant the style and engine look"; Shen Hui's hat keeps "its own
// color and detailed ascii look"). The two levers the owner named (docs/STYLE.md "The bosses drawn in the
// hero's style"):
//   shade   shaded as the hero is (U.uBossHero.x, materials.js): his own colours and brightness where the
//           key light catches him and on his shoulders, falling off toward dark marks on the shadow side
//           and down his body; his head and hat, his face and the pale hem as ADR-194 prints them
//   lines   outlined as the hero is (uBossLike.z, pipeline.js): his ink lines (the silhouette, the dotted
//           rim, the lines between parts) at the hero's line width, his letters on his own fine cell
// Option '0' is each boss as he shipped (ADR-194's print); a shading, b outline, c both. The owner picks per
// boss (PICKED in lookSwitch.js). Read every frame by main.js (a Map lookup, no allocation): live.

/** The options every boss's switch offers: { shade (0..1), lines }. */
export const HERO_STYLE = Object.freeze({
  a: Object.freeze({ shade: 1, lines: false }),
  b: Object.freeze({ shade: 0, lines: true }),
  c: Object.freeze({ shade: 1, lines: true }),
});

/** level id -> its boss's switch. */
export const HERO_PRINT = Object.freeze({
  ash: 'ashHero',
  starless: 'lordHero',
  ring: 'ascHero',
  grove: 'sheathHero',
  city: 'halHero',
});

const NONE = Object.freeze({ shade: 0, lines: false });

/** The style drawn now for level `id` (NONE for a level without a switch, or its option '0'). */
export function heroPrint(id) {
  const name = HERO_PRINT[id];
  return name ? HERO_STYLE[lookOf(name, '0')] ?? NONE : NONE;
}
