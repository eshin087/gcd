// The free (left) hand's look (2026-11-25; the owner's pick: a, smaller): `?handLook=0|a|b|c|d`, read once
// at load (the hand is built with the rig; the Lab's `hand` row reloads the page). The owner: "the left
// hand size and color is standing out too much". The hand was drawn in the face's skin ink (the
// brightest fill on him, gain 2.2) at the gauntlet's size (BODY.hand 1.12) against a near-black sleeve.
//   0  the hand before: the skin ink, full size
//   a  smaller (× 0.8), the skin ink: THE DEFAULT, the owner's pick
//   b  smaller, the skin's letters with a fill at about half (HERO_INK.handShade)
//   c  smaller, a fill at about a third (HERO_INK.handDark)
//   d  a leather glove (× 0.85): the brown of his arm wraps (HERO_INK.leather)
//   e  a hand reshaped (gear/handShape.js), open and relaxed;  f  the same, a loose fist
// Every outfit's free hand (gear/hands.js) follows it: the open hand, the sword fingers, the fist on
// the grip and the skin of the wrist. The sword hand is not changed.
const IDS = ['0', 'a', 'b', 'c', 'd', 'e', 'f'];
export const HAND_LOOK_IDS = Object.freeze(IDS.slice());
export const HAND_LOOK_NAMES = Object.freeze({ 0: 'before', a: 'smaller (default)', b: 'smaller, shaded', c: 'smaller, dark', d: 'leather glove', e: 'a hand, open', f: 'a hand, loose fist' });
const LOOKS = {
  0: { k: 1, mat: 'skin' },
  a: { k: 0.8, mat: 'skin' },
  b: { k: 0.8, mat: 'handShade' },
  c: { k: 0.8, mat: 'handDark' },
  d: { k: 0.85, mat: 'leather' },
  // (2026-11-25, the owner: "make the left hand ... look like a hand ... right now it looks like a weird
  // stump": the hand reshaped, gear/handShape.js: a palm as wide as the bracer, jointed fingers, a thumb)
  // (k sizes the reshaped open hand; the sword fingers and the fist on the grip keep the size before: kRest)
  e: { k: 1.1, kRest: 1, mat: 'skin', shape: 0.22 },
  f: { k: 1.1, kRest: 1, mat: 'skin', shape: 0.75 },
};
const DEFAULT = 'a';
const read = () => {
  try {
    const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('handLook') : null;
    return IDS.includes(v) ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
};
const PICK = { id: read() };
/** The look in use: { id, k (× the hand's size), mat (a hero material's name) }. */
export const handLook = () => ({ id: PICK.id, ...LOOKS[PICK.id] });
/** Tests: set it before a rig is built (anything unknown: the default). Returns the id now set. */
export function setHandLook(id) {
  PICK.id = IDS.includes(String(id)) ? String(id) : DEFAULT;
  return PICK.id;
}
/** The hero materials only one look draws: built only when that look is in use (a material more on the
 *  rig draws a uuid from Math.random, which the tests seed: it would shift every seeded fight). */
export const HAND_ONLY_MATS = Object.freeze(['handShade', 'handDark']);
