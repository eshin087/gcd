// Bai Wuji's hands' and feet's numbers (the melee agent's file: the strings, the blinks, Dark Spark's blow).
// Read as TUNING.melee (tuning.js merges it). The shared numbers (chain, idleGap, pressure, the phase
// scales) stay in tuning.js. Times in seconds (phase 1's: TUNING.windupScale tightens the later phases),
// distances in metres, damage before TUNING.damageScale. Per-phase values are [P1, P2, P3].
export const TUNING_MELEE = {
  // ---- FOLLOW: how far a string's later beat may step in after the last one slid the hero away (a
  // block slides him wjWeight.blockPush, a hit its knockback): the step-in budget of a following beat
  // (brain.js close-in, at TUNING.close.speed), and where a step-blink lands off him
  follow: { close: 4.6, blinkR: 1.7, blinkU: 0.4 },

  // ---- DARK SPARK (P2 on): a long charged straight punch (red)
  spark: {
    windup: 1.15, // s of the held cue (sparks gather on the fist: fx.sparkCharge)
    damage: 36,
    knockback: 10, // m: the hero goes through the first piece behind him (wjCrash)
    crash: 4.6, // the throw's power on what it meets (a car 2.4, a wall)
    blockPush: 6, // (red: never blocked; a held guard is opened, breaksGuard; kept for the Lab)
    // a miss: the fist is buried in whatever stands on its line (a sweep of the line ahead of him)
    miss: { len: 11, halfW: 0.9, power: 3.4 },
    // the doubled one (P3): the second from behind, only if the first was dodged
    second: { windup: 0.62, behind: 1.9 },
  },

  // ---- THE AXE HEEL (P1 on, red): the heel craters the road; pieces within `r` shudder or topple
  axe: { r: 3, power: 0.9 },
  // ---- THE STOMP (P2 on, red ring): everything loose thrown outward, the crossing's bars crack
  stomp: { ring: 3.4, r: 6, power: 1.8 },
  // ---- THE PLANT (P2 on): the downward palm's crater
  plant: { r: 2.2, power: 1.4 },

  // ---- EVERYWHERE (P3): three afterimages strike in turn from three sides (blue, blue, red); each
  // ghost stands at its place from the move's start, the real blow comes out of it (fx.ghostStrike)
  everywhere: { r: 2.1, at: [1.9, -1.9, Math.PI], windup: [0.78, 0.6, 0.72] },

  // ---- THE BLINK CHASE (P3): a hero thrown at least `minKb` m may find him standing where he stops
  // (a reposition, no blow of its own; never while the hero is down), once every `cooldown` s
  chase: { cooldown: 7, minKb: 5, chance: 0.6, off: 1.9, settle: 0.12 },

  // ---- MERCY: a beat of his whose impact comes while the hero is DOWN (knocked down) is not thrown (it
  // becomes a feint: no cue if it had none yet, no blow) — the owner's rule "never while he is down"
  spareDown: true,
  // ... and a beat that would keep him out of his own hands (staggered, down) longer than `lockCap` s in a
  // row is not thrown either (a gap of `free` s he is his own ends the row: time to answer the next)
  mercy: { lockCap: 1.2, free: 0.2 },
};
