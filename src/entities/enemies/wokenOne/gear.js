import { ASC_LOADOUT, FIST } from '../ascendant/gear.js';

// Xin Yi's gear (registered into the hero's gear registry on import: player/gear/index.js registerItem).
// THE BODY AGENT'S FILE: one `one.*` item per slot (one.head: short dark hair and the small dark glasses;
// one.chest: the high collar; one.coat: the long black coat whose split tails swing and spread; one.arms:
// pale hands; one.legs; one.guns: a small dark handgun in each hand, one bright cell at the muzzle, shown in
// phase 2 only). The look options (?oneLook=a|b|c) are look.js's.
// LEAD'S STUB: Tian Lei's loadout until the body lands.

/** What he wears (no `weapon`: he is bare-handed; the right fist hangs on the sword joint). */
export const ONE_LOADOUT = ASC_LOADOUT;

/** His "blade": the right fist along the sword joint's +Z (duelist.js kit.blade), metres. */
export const ONE_FIST = FIST;
