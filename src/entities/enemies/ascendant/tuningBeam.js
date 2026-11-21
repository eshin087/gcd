// Tian Lei's numbers, the beams and the clash (d.T.beam; tuning.js spreads this in). THE BEAM AGENT'S FILE.
// Timings, damage, speeds, radii, counts and world powers of that agent's moves live here, not in logic.
// Times in seconds, distances in metres, angles in degrees. Damage is before TUNING.damageScale.
//
// Every beam (kiBeam.js BeamMoves; the moves in moves/kiBeam.js):
//   the technique: the rear palm drawn back at the ribs where the light gathers, the lead hand held out
//   sighting along the line, then the palm thrust (both palms for the great beam). He aims through the
//   windup; at `fix` of it (the cue: the red flare at the palm, flashLead before it fires) the line is
//   FIXED and a thin sighting thread runs from the lead hand along it. Lit, the beam hits who stands in
//   its strip (len x w): the FIRST CONTACT in its active frames (a blow: damage, knockdown, thrown along
//   it), then a TICK every `tick` s on a hero still inside (a stream: no stagger; not on a hero already
//   thrown down). A held guard facing him pays guard for each, never health, and is pushed along it.
export const BEAM_TUNING = {
  tick: 0.18, // s between the ticks of a lit beam
  active: 0.1, // s: the first contact's window (the beat's active frames)

  // Rising Tide (form 1): one palm, a fixed line
  rising: {
    windup: 1.1, len: 16, w: 1.6, lit: 0.7,
    // the line is fixed at this share of the windup (MOVES.md says 85 %; measured, 0.76 puts the fixing
    // AT the cue: from the flare the hero has the whole flashLead to leave the line: tests BEAMS)
    fix: 0.76,
    first: { damage: 22, knockback: 5 }, tick: 8, push: 0.45, // push: m slid along it per blocked tick
  },
  // Rising Tide, sweeping (forms 2 - 3): dragged toward the side the hero is on
  sweep: {
    windup: 1.2, len: 20, w: 2, lit: 1.1, fix: 0.76,
    turn: 36, arc: 40, // deg/s, deg at most
    first: { damage: 24, knockback: 5 }, tick: 8, push: 0.45,
  },
  // Twin Tide (form 3): one palm, then the other aimed where the hero is heading
  twin: {
    windup: [0.9, 0.7], len: 16, w: 1.4, lit: 0.5, fix: 0.72,
    lead: 0.5, // s of the hero's way the second palm leads him by
    first: { damage: 20, knockback: 4 }, tick: 8, push: 0.45,
  },
  // Heaven-Splitting Tide (form 3, the great spell)
  great: {
    charge: 2.4, len: 26, w: 3.4, lit: 2.2,
    turn: 30, // deg/s after the hero
    first: { damage: 26, knockback: 8 }, tick: 12, push: 0.54, // ~3 m/s on a held guard
    from: 14, every: 35, // s into form 3 at the earliest, s between two at least (weigh)
    reach: 45, // m: a butte on its line this close is where the drawn beam (and its strip) ends
    dim: 0.9, // the light of the ring held down this far at the charge's end (ambience.dim)
    cine: { zoom: -3, weight: 0.45, dur: 1.2 }, // the short look at him as the charge begins
  },
  // THE CLASH: a perfect parry of the great beam's head (brain.startLock at range)
  clash: {
    start: 0.5, push: 0.085, decay: 0.3, dur: 3.0, hold: 0.55, // the lock's meter (the duel's: 0.5 / 0.085 / 0.38 / 2.6 / 0.6)
    posture: 2, // x TUNING.lock.posture on a win
    reel: 4.0, // s he reels after a won clash (the hero has ~26 m to cross)
    split: 12, // m the split beam is drawn past the hero
    lose: { damage: 40, knockback: 12 },
    margin: 4, // m round the pair the camera keeps in frame
  },

  // what a beam does to the world (ADR-107): every `every` s while lit
  world: {
    every: 0.2,
    y: 1.2, // the height it passes at (a low piece under it is spared by the sweep: the trench takes it)
    sweep: 1.5, // power on what stands in its strip (1.5: a butte's top comes off in 3 ticks)
    carry: 45, carryR: 1.7, // m past the drawn end the sweep carries on (the great beam reaches the buttes)
    trench: 0.7, trenchGreat: 1.05, trenchR: 0.7, step: 1.4, // world.impact stations along the line
    ignite: 0.6, // fire on the ground outside the ring's floor
    reachSmall: 1.35, // x its length: a butte this close ends a small beam's drawn line at it
  },

  // the look (fxBeam.js draws it): a short white peak, then the held beam gold
  look: { peak: 0.1, held: 0.72, fadeOut: 0.16, endY: 0.35, splash: 0.55, sight: 0.55 },
};
