// Tian Lei's gear: a fighter's sleeveless tunic, bare arms, wrapped fists, a sash, loose trousers,
// and a head of hair that changes with his form.
//
// STUB: the base outfit and no weapon, so his kit can be built before his gear is. The gear's own
// items (registered into the hero's gear registry, as the other duelists' are) replace this file.

/** What he wears (player/gear: an empty slot gets the base item; no `weapon`: he is bare-handed). */
export const ASC_LOADOUT = Object.freeze({});

/** His "blade": the right fist, as a short segment along the sword joint's +Z (duelist.js kit.blade). */
export const FIST = Object.freeze({ guard: -0.05, tip: 0.1 });
