// The False Saint's terrain numbers (the TERRAIN AGENT's file: the ladles' pour, the thrown relics, and
// the molten pools' damage to the hero and to him). Read as TUNING.terrain (tuning.js merges it). Times
// in seconds, distances in metres, damage before TUNING.damageScale (the pools' damage to the hero goes
// through d.hitPlayer, so damageScale applies; to him it is raw).
export const TUNING_TERRAIN = {
  // ---- THE MOLTEN POOLS (terrain.js FsTerrain, core's working stub): a pool the set lays
  // (foundry.molten.add) is cued RED from where it lands (`arm` s before it burns), then burns whoever
  // stands in it every `tick` s for its life. The hero: `hero` damage, thrown `knockback` m out of it
  // (a roll through it is not hurt: the player's own i-frames). Him: `boss` damage and `posture`, and
  // `strip` of his shell (d.onMolten), at most once per `tick`.
  molten: { arm: 0.55, tick: 0.5, hero: 9, knockback: 2.2, boss: 60, posture: 70, strip: 0.06, pad: 0.15 },
};
