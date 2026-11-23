// The sound of a duelist's blow travelling through the air: what it is, as data. The brain (brain.js)
// sends `dragon:attack` once per real blow (not a feint, not a beat that only throws or casts, not a
// phase change's burst) `lead` s before its impact, never before the beat's glint (a fairness hold or
// the honor gate can still move the impact until then). The audio layer picks the sound from the
// payload: { name, weapon, weight, shape, tell, impactIn, x, z } (audio/audio.js, sampleList.js).
//
//   weapon  'sword' | 'fist'   the boss's TUNING.weapon (declared once per boss; default 'sword')
//   weight  'light' | 'heavy'  heavy: damage >= heavyDamage, a knockdown, or a black (charged) blow
//   shape   'cut' | 'thrust' | 'kick' | 'draw'
//             draw    a draw (the Sheathed's `draw: true`)
//             kick    a blow struck with a leg: `part` in kickParts[weapon]; for a sword, a 'feet' blow
//                     whose zone is a ring is the blade swept round at the ankles (a cut), not a kick
//             thrust  a `line` zone
//             cut     everything else
//   A beat may say it itself: `whoosh: false` (no sound) or `whoosh: { weapon, weight, shape }` (any of
//   the three, the rest derived as above).

export const ATTACK_SOUND = {
  lead: 0.3, // s before the impact (the audio lines the clip's loudest moment up with the impact)
  heavyDamage: 20,
  kickParts: {
    fist: ['footR', 'footL', 'kneeR', 'kneeL', 'feet'],
    sword: ['feet'],
  },
};

const KICK = {
  fist: new Set(ATTACK_SOUND.kickParts.fist),
  sword: new Set(ATTACK_SOUND.kickParts.sword),
};
const cache = new WeakMap(); // beat def -> { weapon, weight, shape } | null (beat defs belong to one boss)

/**
 * The sound a beat makes through the air, or null (none): `weapon` the boss's, `def` the beat's data.
 * Only for a beat that strikes with the body (it has a zone; not a cast, a pure throw, a burst, or a
 * beat whose hits the actor deals itself unless it is a draw). Cached per beat def: no allocation per blow.
 */
export function beatSound(weapon, def) {
  if (!def || typeof def !== 'object') return null;
  const hit = cache.get(def);
  if (hit !== undefined) return hit;
  let out = null;
  const o = def.whoosh;
  if (o !== false && def.zone && !def.cast && !def.burst && (!def.selfHit || def.draw)) {
    const w = o?.weapon === 'fist' || o?.weapon === 'sword' ? o.weapon : weapon === 'fist' ? 'fist' : 'sword';
    let shape = o?.shape;
    if (shape !== 'cut' && shape !== 'thrust' && shape !== 'kick' && shape !== 'draw') {
      const kick = KICK[w].has(def.part) && !(w === 'sword' && def.zone.kind === 'ring');
      shape = def.draw ? 'draw' : kick ? 'kick' : def.zone.kind === 'line' ? 'thrust' : 'cut';
    }
    let weight = o?.weight;
    if (weight !== 'light' && weight !== 'heavy') {
      weight = (Number(def.damage) || 0) >= ATTACK_SOUND.heavyDamage || def.knockdown || def.tell === 'black' ? 'heavy' : 'light';
    }
    out = Object.freeze({ weapon: w, weight, shape });
  }
  cache.set(def, out);
  return out;
}
