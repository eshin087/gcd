// The False Saint's ground game's numbers (the MELEE AGENT's file: the open-hand strings, the sweep and
// knee, the grab, the long walk, the counter, the phase-1 flurry). Read as TUNING.melee (tuning.js merges
// it). The shared numbers (chain, idleGap, pressure, the phase scales) stay in tuning.js. Times in
// seconds (phase 1's: TUNING.windupScale tightens the later phases), distances in metres, damage before
// TUNING.damageScale. Per-phase values are [P1, P2, P3, P4]. Every field the moves read is named here.
export const TUNING_MELEE = {
  // ---- FOLLOW: how far a string's later beat may step in after the last one slid the hero away
  follow: { close: 3.6 },
  // ---- BENEDICTION (core's stand-in, wave 0): palm, palm, the heel-palm shove (n, n, blue)
  benediction: { windup: [0.52, 0.44, 0.58], damage: [14, 14, 22], knockback: [2, 2.4, 6.5], blockPush: 3.2 },
  // ---- GENUFLECT (core's stand-in): the low sweep (a ring at the ankles), the rising knee (blue)
  genuflect: { windup: [0.6, 0.5], damage: [12, 20], knockback: [2.2, 4.5] },
  // ---- REBUKE (his counter): a slip aside and a short elbow (blue)
  rebuke: { windup: 0.5, damage: 18, knockback: 3.5 },
  // ---- LITANY (his phase-1 flurry): quick alternating palms (normal)
  litany: { windup: [0.56, 0.44], damage: 12, knockback: 1.8, blows: 5 },
};
