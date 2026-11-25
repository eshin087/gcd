// The striker chain's finisher (hit 5 of `?lights=striker`, combat.js LIGHT_STRIKER): four ideas for
// the owner to pick from, `?finisher=lance|cross|talisman|flash` (the Lab's PLAYER → `finisher` row).
// Data only (no imports): combat.js reads the pick's anim block, swings.js spreads the clips into
// SWINGS, finisherFx.js draws the spell. Each is a planted, two-handed strike (no spin, no leap) that
// looks nothing like the heavy slam / Earthbreaker, with a spell on it.
//
// (A STUB until the finisher work lands: every pick plays a placeholder clip.)

export const FINISHER_IDS = Object.freeze(['lance', 'cross', 'talisman', 'flash']);
export const FINISHER_NAMES = Object.freeze({ lance: 'sword-qi lance', cross: 'crossing X', talisman: 'talisman strike', flash: 'flash cut' });

/** The anim block hit 5 plays for each pick (combat.js LIGHT_STRIKER[4].anim). */
export const FINISHER_ANIMS = Object.freeze({
  lance: { kind: 'clip', clip: 'groundSlam', hop: 0.09 },
  cross: { kind: 'clip', clip: 'groundSlam', hop: 0.09 },
  talisman: { kind: 'clip', clip: 'groundSlam', hop: 0.09 },
  flash: { kind: 'clip', clip: 'groundSlam', hop: 0.09 },
});

/** The finishers' clips (swings.js format), spread into SWINGS. */
export const FINISHER_CLIPS = {};

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const PICK = { id: FINISHER_IDS.includes(q('finisher')) ? q('finisher') : 'lance' };
/** The finisher picked now. */
export const finisherId = () => PICK.id;
/** Set it (combat.js setFinisherLook also re-points hit 5); false for an unknown id. */
export function pickFinisher(id) {
  const m = String(id);
  if (!FINISHER_IDS.includes(m)) return false;
  PICK.id = m;
  return true;
}
