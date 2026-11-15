// Shared combat rules (Phantom-Blade-Zero-inspired, RPG-friendly — no stamina).
// Every attacker (dragon today, mobs later) describes its hits with these tells; every defender
// (the player today) resolves them with these windows. Numbers here are the single source of truth.
// Design + rationale: docs/COMBAT.md.

/**
 * How an attack must be answered. Read from the attacker itself (no HUD text or icons): parryable
 * hits are read from the windup animation and glint white on the timing cue; dodge-only hits make
 * the attacker glow red through the windup and flash red on the cue. See docs/COMBAT.md.
 */
export const TELL = Object.freeze({
  NORMAL: 'normal', // white glint: block, parry or dodge — any defence works
  BLUE: 'blue', // big white glint: a heavy blow you should PARRY (block works but chips hard)
  RED: 'red', // red warning glow + flash: cannot be blocked or parried — PERFECT DODGE it (Ghostep)
});

/** Resolution of a hit from the defender's point of view (returned by takeHit). */
export const RESULT = Object.freeze({
  HIT: 'hit',
  BLOCKED: 'blocked',
  PARRIED: 'parried',
  // the trade clash: the blow met the defender's own cut (DEFENSE.trade): neither is hurt
  CLASHED: 'clashed',
  DODGED: 'dodged', // i-frames, not perfectly timed
  PERFECT: 'perfectDodge', // dodge started within the perfect window → plunge / Ghostep
  IGNORED: 'ignored',
});

/**
 * Presentation for each tell. World side (linear HDR): `color` = the in-world timing flash —
 * white for the parryable tells (blue is the same white, only `glint`x larger and brighter), red
 * for dodge-only; `red.warn` = the attacker's red windup glow (creature material uniform uWarn:
 * strength ramps `from` → `to` between combat:tell and combat:flash, spikes to `spike` on the
 * flash, decays to 0 in `decay` s). `css` = the dev / UI colour (Lab chips, HUD red edge flash,
 * success call-outs); the HUD shows no per-tell colour coding during a windup.
 */
export const TELL_STYLE = Object.freeze({
  normal: { color: [3.2, 3.05, 2.8], glint: 1, css: '#f2ead8' },
  blue: { color: [3.2, 3.05, 2.8], glint: 1.5, css: '#5fb4ff' },
  red: {
    color: [3.4, 0.35, 0.2],
    glint: 1,
    css: '#ff4a3a',
    warn: { color: [1.0, 0.12, 0.05], from: 0.1, to: 0.38, spike: 1.6, decay: 0.25 },
  },
});

export const DEFENSE = Object.freeze({
  // --- parry: tap RMB shortly before impact
  parryWindow: 0.22, // s between the RMB press and the impact
  // a parry pressed this close before the impact is PERFECT (player:parry.perfect). Today only
  // bullets use it: a perfectly parried ember / wisp flies back as a damaging shot (ADR-051)
  perfectParryWindow: 0.08,
  parryRearm: 0.25, // s RMB must be released before a new press can parry again (anti-mash)
  parryArc: (110 * Math.PI) / 180, // the attacker must be within this cone in front of the defender
  // --- the trade clash: a blade's blow (hit.steel, not red) that arrives while the defender's own
  // cut is in its active frames (`early` s before them to `late` s after) meets it: both blades are
  // thrown back, neither is hurt. The same when the defender's cut connects with an attacker whose
  // blow is at most `window` s from its impact. No button: it is two swings at the same moment.
  // After one, the next needs `rearm` s (a string's blows come ~0.4 s apart: two in a row cannot be
  // traded by mashing attack; the one between must be guarded or dodged).
  trade: { early: 0.03, late: 0.02, window: 0.1, rearm: 0.6 },
  // --- block: hold RMB
  blockArc: (130 * Math.PI) / 180,
  blockReduction: { normal: 0.8, blue: 0.5 }, // fraction of damage removed while blocking
  blockMoveSpeed: 0.45, // movement multiplier while holding block
  blockPushback: { normal: 0.6, blue: 1.6 }, // meters slid back on a blocked hit
  // --- dodge: Space
  perfectDodgeWindow: 0.2, // s between the dodge start and the impact for a perfect dodge
  // --- Ghostep: reward for a perfect dodge (any tell): slow-mo + the crit window. Against an attacker
  // that offers a plunge (plungePoint / onPlunge: the wyrm) it becomes the plunge below; against any
  // other attacker within its range it blinks `distanceBehind` m behind it (the v0.2 Ghostep)
  // (critWindow 1.6 → 2.2 s with the slower light chain, Session 25: a hit every ~0.42 s instead of
  // 0.25 s, so the window still holds about five swings and the walk back in from a plunge's landing)
  ghostep: { distanceBehind: 3.2, slowmoScale: 0.3, slowmoTime: 0.6, critWindow: 2.2, critMult: 1.8 },
  // --- the plunge (contract 2): a perfect dodge of a plungeable attacker within `range` m (the hit
  // may forbid it: takeHit `plunge: false`) → vanish, reappear `appearUp` m above its head
  // (`appearBack` m out toward the landing side), hang, dive, a reverse-grip stab into the head
  // (attacker.onPlunge once: `damage`, `posture`), ride the head down, backflip off to a landing in
  // front of it, toward where the hero came from; the crit window opens on landing. While the
  // attacker is posture-broken, attack within `execRange` m of its head starts the same move from
  // the appear step as an execution (`execDamage`, no slow-mo). Times: game seconds (the vanish +
  // hang run inside the slow-mo); `flip` = [base, max] (longer from higher up). Lengths: m.
  plunge: {
    range: 30, execRange: 9, damage: 90, posture: 40, execDamage: 260,
    vanish: 0.05, hang: 0.13, dive: 0.14, ride: 0.42, flip: [0.5, 0.85], land: 0.34, landCancel: 0.12,
    // (the 58° camera sees height at half scale: 5 m up puts him clearly above the head on screen)
    appearUp: 5, appearBack: 0.3, rideBack: 0.3, flipUp: 1.7,
    landMin: 4.5, landMax: 12, landClear: 0.8, // landing distance from the head; margin past the body
    impactStop: 0.13, impactShake: 0.6, execShake: 0.75, landIframes: 0.2,
  },
  // --- the flurry (ADR-091): perfect dodges in a row are a STREAK; it ends when the hero is hurt
  // (a blocked or parried blow, a plain dodge and a burn's ticks leave it alone). A perfect dodge
  // that can reach its attacker (the wyrm's head in the plunge's range; a foe with a body to cut
  // within the Ghostep's) answers with as many blows as the streak counts, `max` at most: all but the
  // last are FLASH CUTS (he blinks to one side of the target, dashes through it and is gone again;
  // each along a new line, so the cuts cross on it like a star and hang there), the last is an ART
  // (player/flurry.js ARTS: the plunge is one of the wyrm's), on which the hanging cuts burst.
  // While he cuts, the world runs at `world` of its speed and the hero on real time: every number
  // in `cut` and in an art's beats is REAL seconds.
  //   cut    one flash cut: hidden `blink`, the pass `dash` (it hits half way), frozen `stop` on the
  //          hit, the finish held `hold`; the later cuts of a long flurry come faster (× down to
  //          `rush`). `damage` is final (no part / break multiplier), `posture` added as is
  //   reach  m to each side of the target a pass starts and ends (in the air round the wyrm's head /
  //          on the ground round a foe)
  //   turn   rad: each pass's line is turned this much from the far end of the last one's
  //   last   the last blow against a foe without the plunge (the wyrm's is DEFENSE.plunge)
  //   keepStreak  the streak survives this long (s) without a perfect dodge; 0 = until he is hurt
  flurry: {
    max: 7,
    world: 0.07,
    cut: { blink: 0.045, dash: 0.1, stop: 0.065, hold: 0.04, rush: 0.6, damage: 28, posture: 5, reel: 0.09 },
    // after every cut the world runs at `reelWorld` for `cut.reel` s (real), so the target is SEEN to
    // reel under it (its flinch, its stagger, the shove) before it is held again
    reelWorld: 0.6,
    // the riposte (ADR-094): parrying a string's LAST blow (or a single one) answers with as many
    // flash cuts as the streak counts and puts the hero back where he parried; no art, no crit
    // window. Only when the target is within this many metres (ground distance; the head / the foe)
    riposteRange: { air: 11, ground: 6 },
    reach: { air: 4.6, ground: 2.8 },
    turn: [0.55, 0.95],
    last: { damage: 60, posture: 22 },
    keepStreak: 0,
  },
  // --- a foe's streak (ADR-094; a duelist: duelist.js): every strike of the hero's his guard turns
  // counts one; a strike that lands on him ends it. From `min`, a guard may answer with his flurry
  // (chance `launch` at min, min + 1, ...; then his guard always beats the strike away): as many
  // blows as the streak counts, `max` at most, the first from where he stands and each of the
  // others from another side of the hero (a guard meets them from any side). Every blow the hero
  // parries or blocks takes one off the streak (a perfect parry counts two toward the total); when
  // all of them were answered his posture breaks. A blow that lands, or one dodged, breaks nothing.
  foeStreak: { min: 3, max: 7, launch: [0.5, 0.75, 1] },
});

/** Attacker posture (enemy "break" meter, shown under the boss HP bar). */
export const POSTURE = Object.freeze({
  parry: { normal: 26, blue: 48 }, // posture damage dealt to the attacker by a parry
  hit: { light: 5, heavy: 16 }, // posture damage dealt by the player's weapon hits
  regenDelay: 3.0, // s without posture damage before it starts recovering
  regenRate: 14, // posture/s
  breakTime: 3.2, // s the attacker stays broken (open to crits)
  breakCritMult: 2.2,
});

/** Default defensive properties for a tell; attacks may override (e.g. a fire stream is not parryable). */
export function tellDefaults(tell) {
  switch (tell) {
    case TELL.RED:
      return { parryable: false, blockable: false };
    case TELL.BLUE:
      return { parryable: true, blockable: true };
    default:
      return { parryable: true, blockable: true };
  }
}

/** Shortest absolute angle between a defender's facing (yaw) and the direction to a point. */
export function facingDelta(yaw, fromX, fromZ, toX, toZ) {
  const want = Math.atan2(toX - fromX, toZ - fromZ);
  let d = (want - yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}
