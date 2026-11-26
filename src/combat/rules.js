// Shared combat rules (Phantom-Blade-Zero-inspired, RPG-friendly — no stamina).
// Every attacker (dragon today, mobs later) describes its hits with these tells; every defender
// (the player today) resolves them with these windows. Numbers here are the single source of truth.
// Design + rationale: docs/COMBAT.md.

/**
 * How an attack must be answered. Read from the attacker itself (no HUD text or icons): a blow is
 * read from its windup animation and cued `flashLead` s before it lands. An ordinary blow glints
 * white; a MOMENT is cued by THE FLARE (ADR-118): a wide streak of light through the striking part
 * at the instant to act, red = dodge, blue = parry, black = dodge (a charged blow). Nothing glows
 * and no ring is drawn on the floor through the windup. See docs/COMBAT.md "Tell presentation".
 */
export const TELL = Object.freeze({
  NORMAL: 'normal', // white glint: block, parry or dodge — any defence works
  BLUE: 'blue', // big white glint: a heavy blow you should PARRY (block works but costs guard).
  //               With `flare: true` on the hit it is a parry MOMENT: the blue flare, and a parry is
  //               answered with the counter (DEFENSE.flareCounter)
  RED: 'red', // the red flare: cannot be blocked or parried — PERFECT DODGE it (the flurry answers)
  BLACK: 'black', // a CHARGED blow (darkness gathers through a long windup, then the black flare):
  //                 dodge it. A guard or a parry stops it but the whole guard meter is gone and he
  //                 is knocked open (GUARD.black); a perfect dodge is answered as a red blow's is
});

/** A blow only a dodge answers cleanly (red, black). */
export const dodgeOnly = (tell) => tell === TELL.RED || tell === TELL.BLACK;
/** A known tell, else 'normal'. */
export const tellOf = (tell) => (tell === TELL.BLUE || tell === TELL.RED || tell === TELL.BLACK ? tell : TELL.NORMAL);
/** Is this blow cued by the flare (a moment)? Red and black always; a blue one when marked `flare`. */
export const isFlare = (tell, flare = false) => dodgeOnly(tell) || (tell === TELL.BLUE && !!flare);

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
 * white for an ordinary parryable blow (blue is the same white, only `glint`x larger and brighter),
 * red for dodge-only; `red.warn` = the attacker's body on a red cue (creature material uniform
 * uWarn): NOTHING through the windup (`from` = `to` = 0: the flare is the only sign, ADR-118; until
 * then it ramped 0.1 → 0.38), a spike to `spike` on the cue that decays to 0 in `decay` s.
 * `black.warn` = the charge: the body darkens toward `to` through a black blow's windup.
 * `flare` = the flare's own colours (`blue` only on a hit marked `flare`): `tint` what the streak's
 * letters are dyed (render/fireField.js tint), `light` the light it throws.
 * `css` = the dev / UI colour (Lab chips, the HUD's screen flash, success call-outs); the HUD shows
 * no per-tell colour coding during a windup.
 */
export const TELL_STYLE = Object.freeze({
  normal: { color: [3.2, 3.05, 2.8], glint: 1, css: '#f2ead8' },
  blue: { color: [3.2, 3.05, 2.8], glint: 1.5, css: '#5fb4ff', flare: { tint: [0.16, 0.5, 2.6], light: [0.25, 0.55, 1.0] } },
  red: {
    color: [3.4, 0.35, 0.2],
    glint: 1,
    css: '#ff4a3a',
    warn: { color: [1.0, 0.12, 0.05], from: 0, to: 0, spike: 1.6, decay: 0.25 },
    flare: { tint: [2.6, 0.12, 0.05], light: [1.0, 0.16, 0.08] },
    // does a boss's OWN red blow mark the floor it will hit through its windup (a duelist's ring of
    // red letters, the ground heating under the wyrm's stomp / leap / dive)? No (ADR-118: the flare
    // is the sign). What lands away from the boss (a meteor, a bolt from the sky, a shell, a falling
    // pillar) is a hazard and keeps its ground mark.
    floor: false,
  },
  black: {
    color: [0.5, 0.12, 0.7],
    glint: 1,
    css: '#1a1024',
    warn: { color: [0.42, 0.07, 0.9], from: 0.2, to: 1.0, spike: 1.4, decay: 0.3 },
    // (`dark`: the cells behind its letters are blacked out: a black bar with a white-hot thread)
    flare: { tint: [0.3, 0.06, 0.52], light: [0.5, 0.2, 0.9], dark: 1 },
  },
});

export const DEFENSE = Object.freeze({
  // --- parry: tap RMB shortly before impact
  parryWindow: 0.22, // s between the RMB press and the impact
  // a parry pressed this close before the impact is PERFECT (player:parry.perfect): a bullet flies
  // back as a shot (ADR-051), a blow pays x POSTURE.perfect and the counter cut (ADR-102), a `lock`
  // blow locks the blades. The owner's number (ADR-227): the perfect dodge's window, so a parry is as
  // forgiving as a dodge (it was 0.08 s). A press 0.20 - 0.22 s early is still a plain parry
  perfectParryWindow: 0.2,
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
  // (`critWindowWhite`: the crit window a perfect dodge of a WHITE or heavy blow opens: none. With 1.2 s
  // a bot that only dodged still beat the wyrm fastest, on crits alone; ADR-102)
  ghostep: { distanceBehind: 3.2, slowmoScale: 0.3, slowmoTime: 0.6, critWindow: 2.2, critWindowWhite: 0, critMult: 1.8 },
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
  //   on     which perfect dodges the flurry answers (ADR-102): 'red' = only a blow that nothing but a
  //          dodge answers. A perfect dodge of a white or heavy blow counts in the streak and gives the
  //          slow-mo where he stands (no crit window): the string goes on, and the streak is
  //          cashed on the next red blow (or by the riposte). 'any' = every perfect dodge (until
  //          2026-11-15: measured, a bot that only dodged beat every boss faster than one that parried)
  flurry: {
    on: 'red',
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
    // against a foe who stands on the ground (a duelist: a man, not a head three metres across) the
    // cuts are paced to be FOLLOWED and sized to him (ADR-101). Each cut: he is seen wound up where
    // he appears (`hang` s), runs in past the foe's side (`side` m off the line through him, never
    // through his body), strikes `hitPos` of the way along at `hitAt` of the dash, and slows into a
    // finish held `hold` s. `reach`: how far out he appears and ends; `line`: half the length of the
    // cut left hanging on the foe; `rush`: the pace of a long flurry's last cuts. The camera leans in
    // `zoom` m and takes `kick` of the punch and `shake` of the shake the wyrm's cuts give it; `fx`
    // scales the cut's flare, crescent and burst to a man's size.
    ground: { reach: 2.3, side: 0.55, hang: 0.035, dash: 0.12, hitAt: 0.4, hitPos: 0.42, hold: 0.085, rush: 0.75, line: 1.9, zoom: -4, kick: 0.45, shake: 0.65, fx: 0.62 },
    turn: [0.55, 0.95],
    // THE STORM (the streak pass, streakK('storm'); 0 = the pace above, exactly): the first `shown`
    // cuts are paced as above (seen, the pass, the held finish, the full weight beat), then each cut
    // takes `fall` of the time of the one before (x `fall` ^ k at the piece's strength k), never less
    // than `floor` of a shown cut, until the last land a few frames apart: a storm of crossing lines.
    // A storm cut: no wind-up seen (he is already in the cut), the freeze on its contact `stop` x its
    // pace but at least `stopMin` s (the frame he is drawn on the target), the reel beat x its pace,
    // the camera's kick and shake x `cam`, its flare and sparks x `fx`. The last shown cut and the art
    // keep their whole weight. A riposte is all flash cuts: the same rule.
    storm: { shown: { air: 3, ground: 2 }, fall: 0.56, floor: 0.12, stopMin: 0.018, cam: 0.35, fx: 0.45 },
    // THE TEMPO (STREAK_FX.tempo, on by default, ?tempo=0 off; only with the storm piece on: it
    // replaces `shown` / `fall` above): "heavy first, then faster by ratio". The first flash cut is a
    // HEAVY BEAT that can be read: hidden `blink`, SEEN wound up where he appears `hang`, the pass
    // `dash` (as fast as ever: the contrast is the point), frozen on the contact `stop`, the finish
    // held `hold` (real s; on the ground round a foe / in the air round the wyrm's head). Every later
    // cut takes `ratio` of the one before: r = lerp(ratio[0], ratio[1], (c - 2) / 4 clamped), c the
    // flash cuts paced (a flurry's all; a riposte's all but its last), pace(i) = max(storm.floor,
    // r ^ (k i)) at the storm piece's strength k: a short flurry stays weighty, a long one runs into
    // the storm. A cut whose pace is under `stormAt` is a STORM cut (as above: no wind-up seen, the
    // freeze `stop` x pace but at least storm.stopMin). The camera's kick and shake and the cut's
    // flare and sparks fall with the pace, from 1 at pace 1 to storm.cam / storm.fx at `stormAt`;
    // a cut's freeze is `stop` x its pace. A riposte's last cut is the heavy beat again.
    tempo: {
      ground: { blink: 0.06, hang: 0.11, dash: 0.12, stop: 0.11, hold: 0.15 },
      air: { blink: 0.06, hang: 0.08, dash: 0.1, stop: 0.11, hold: 0.11 },
      ratio: [0.78, 0.52],
      stormAt: 0.4,
    },
    // THE CHAIN (STREAK_FX.chain, on by default, ?chain=0 off: the ring-teleport paths above exactly):
    // every pass starts where the one before ended (A -> B -> C, never back to the start). The first
    // cut starts on the side he dodged on (`reach` out, as before); each pass then runs from where he
    // stands past the target, `off` m off its middle (on the ground past his side; round the head
    // across it), on out to `reach` beyond it. The whole run is planned as the flurry starts (a
    // depth-first search over both sides x the `off` candidates of every cut, pruned by its bound, at
    // most `nodes` steps). Its score: the lines' spread (the smallest |sin| between two of them, the
    // wyrm's neck kept clear as before; counted up to `gap`: past it a star is a star), less `near`
    // for a pass that ends within `keepOff` m of his dodge spot (never back to the start), `artNear`
    // if the art on the ground would end there too, `artNeck` if round the head the iai would run
    // along the neck (its coil then carries him round the head to where it does not), `same` for a turn the other way (a zigzag lays lines side by side); plus
    // `front` when on the ground the last flash cut ends before the foe's face (the art through him
    // then leaves the hero at his back, as before).
    // The first cut may start `start` rad round from straight toward the dodge spot (still on his
    // side), whichever spreads the star best (round the head the neck takes a place in it).
    // A run of 2, 4 or 6 flash cuts whose lines spread cannot also end before his face: the art then
    // leaves the hero past the foe on his front side. The art starts where the last cut ended: the iai from there, the split
    // rises from there, the vault steps in from there (during its coil). Every hanging line is the
    // path his chest ran (CHEST m over his root); the flash cuts' crescents and the iai's lens are gone
    // (the line is the slash), the split's / vault's crescent follows his blade's sampled path, the
    // ground's last blow throws white-steel letter dust (flurryFx.js DUST) instead of the 'A' shards.
    chain: {
      off: { ground: [0.55, 0.67, 0.79, 0.9], air: [0.85, 0.95, 1.05, 1.15] },
      start: [0, 0.2, -0.2, 0.4, -0.4],
      nodes: 8000,
      gap: 0.45,
      keepOff: 1.6,
      near: 1,
      artNear: 0.1,
      artNeck: 0.15,
      front: 0.05,
      same: 0.04,
      // THE FIGURES (player/flurryFigures.js; STREAK_FX.figure, ?figure=): the shape the passes draw,
      // one picked for each flurry (the flurry's own seeded stream, never the same twice running).
      // `min` the fewest flash cuts it reads at; `off` m off the target's middle (ground / air), `end`
      // m from it where a pass ends, `sides` the cage's polygon by the cut count (the spiral's
      // corners as a square's). A figure that does not fit (a wall, the dodge spot, the
      // neck: its cost over `fit`) is passed over; the star always fits.
      // `body`: on a man no pass nearer his middle than his side (ADR-101; the spiral's and the cross's
      // "through the middle" run past his side there); round the head right through it.
      figures: {
        body: { ground: 0.55, air: 0 },
        star: { min: 1 },
        zigzag: { min: 2, off: { ground: 1.15, air: 1.5 } },
        // (the cage and the spiral go round him on every side: round the wyrm's head one side would
        // run over its neck, through its body: on the ground only)
        cage: { min: 3, air: false, off: { ground: 1.2, air: 1.5 }, sides: [3, 6] },
        spiral: { min: 3, air: false, off: { ground: 1.3, air: 1.6 }, end: { ground: 1.0, air: 2.0 }, sides: 4 },
        cross: { min: 3, off: { ground: 1.3, air: 1.6 } },
      },
      fit: 0.5,
      turns: [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05],
    },
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
  // --- the flash counter (ADR-102): the riskiest answer pays the most. A trade clash whose cut only
  // just became a cut when his blow arrived (at most `window` s into its active frames: an attack
  // press about 0.08 - 0.14 s before his blow lands; any later and the blow lands on the hero) is not
  // thrown back: it beats his blow aside and goes through him. `damage` (final) and `posture` at
  // once, he reels (attacker.onCounter: his string is over), the crit window opens. `stop` / `shake`
  // / `punch`: the freeze, the camera
  counter: { window: 0.03, damage: 70, posture: 60, stop: 0.16, shake: 0.55, punch: 3.8 },
  // --- a PERFECT parry of a blow of the body or the blade (ADR-102; a bullet's is the return): its
  // posture damage x POSTURE.perfect, and the counter cut: the first light started within
  // `cutWindow` s winds up `cutSpeed` x as fast and crits
  perfectParry: { cutWindow: 0.9, cutSpeed: 2 },
  // --- the counter (ADR-118): a parry (any parry, not only a perfect one) of a BLUE FLARE blow is
  // answered by the hero himself, with no further press: the blow is beaten aside in a blue burst,
  // the attacker's string ends there (he recoils as from a parried last blow), and once the parry's
  // freeze is over the hero cuts: as many flash cuts as the streak counts (the riposte's), the last
  // of them the COUNTER BLOW: `damage` (final) and `posture`, he reels. Only within the riposte's
  // range. `posture`: on top of the parry's own (POSTURE.parry.blue)
  flareCounter: { damage: 64, posture: 30 },
});

/**
 * The hero's guard meter (ADR-095). A blocked blow costs GUARD instead of HP: its damage ×
 * `cost[tell]`, between `costMin` and `costMax` (a heavy blue blow, the one to parry, costs more).
 * While there is guard left a block takes no HP at all. The blow that empties the meter is still
 * blocked, but it knocks the guard OPEN: `openDur` s of stagger (no knockdown, no damage) in which
 * the next blow of a string lands.
 * It is not a stamina bar and playing defensively is never punished: it refills by itself
 * (`regenRate` / s, from `regenDelay` s after the last blow he blocked or took, `openDelay` s after
 * it was knocked open) whatever he does: standing, moving, holding the guard up, swinging.
 * Every parry gives a piece back at once (`parry[tell]`; a deflected bullet `parryLight`; a perfect
 * one `perfect` on top), and so does every cut of his own that lands (`hit`).
 * Contact streams (the fire breath's ticks, burning ground) are no blows: they keep their small
 * HP chip through a block (blockReduction) and leave the meter alone.
 */
export const GUARD = Object.freeze({
  max: 100,
  cost: { normal: 1.0, blue: 1.5 },
  costMin: 8,
  costMax: 60,
  regenDelay: 0.8,
  regenRate: 60, // empty to full in ~1.7 s
  openDur: 0.55,
  openDelay: 0.35,
  parry: { normal: 28, blue: 45 },
  parryLight: 10,
  perfect: 20,
  hit: { light: 4, heavy: 10 },
  low: 0.3, // fraction below which the HUD shows the meter as low
  // a BLACK (charged) blow met on a guard or a parry (ADR-118): it is stopped and deals nothing, but
  // the whole meter is gone and the guard is knocked open for `openDur` s (longer than a worn-out
  // guard's: the charge was the warning), thrown back `push` m
  black: { openDur: 0.8, push: 2.4 },
});

/** Attacker posture (enemy "break" meter, shown under the boss HP bar). */
export const POSTURE = Object.freeze({
  parry: { normal: 26, blue: 48 }, // posture damage dealt to the attacker by a parry
  perfect: 1.5, // ... x this when the parry was perfect (DEFENSE.perfectParryWindow; ADR-102)
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
    case TELL.BLACK:
      // (neither holds it: a guard or a parry in its way is knocked open instead, player.js)
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
