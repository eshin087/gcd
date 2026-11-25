// Fire / flight attacks and spells (contract 3, docs/ARCHITECTURE.md "Hazards and fire attacks").
// Registered into TUNING.attacks by tuning.js (Object.assign), so the Lab, abilities() and hitPlayer
// read them like every other attack. The performances live in fireAttacks.js, the background
// threats (meteors, pillars, fire strips / rings / walls) in hazards.js.
//
// Units: seconds (phase-1 values; windups and recoveries x d.tScale in later phases, the airborne /
// travelling parts keep their speed), WORLD metres (hazards are not body-linked: they are sized
// against the 1.8 m hero, not the wyrm), HP. `phase` = the first phase the AI uses it in (the Lab
// can force any); `weight` = AI weight per phase [P1, P2, P3] (0 = never picked there), applied by
// each attack's weight(d, s) together with its range gate; `cooldown` s after it ends.
// Every hit is red (dodge-only): it glows / rings red through its windup and flashes flashLead s
// before impact (docs/COMBAT.md). Hazard hits pass `plunge: false` (dodging a meteor never
// teleports); the dive bomb's crash and the nova pass the default (a perfect dodge may plunge).

import { TELL } from '../../combat/rules.js';

export const FIRE_ATTACKS = {
  // takes off with heavy downbeats, flies low over the player in a line breathing fire down; the
  // fire front ignites a strip that keeps burning (contact ticks), then lands on the far side
  skyStrafe: {
    label: 'Burning pass (sky strafe)', tell: TELL.RED, phase: 1,
    windup: 1.0, takeoff: 0.75, pass: 1.9, land: 1.05,
    alt: 7, // root altitude of the pass (m): the head stays > 6 m up, out of sword reach
    frontLead: 8, // the fire front runs this far ahead of the root (the mouth ~5 m + the stream's reach)
    reach: [24, 40], // landing distance along the line: player distance + 14, clamped to this (and the bound)
    strip: { start: 10, width: 4.6, linger: 2.5, tick: 0.25, tickDamage: 4, tickBurn: 1.0 },
    damage: 26, burn: 2.0, knockback: 4,
    minDist: 7, maxDist: 34,
    weight: [0.1, 0.15, 0.1], cooldown: 16, // (tuning: [0.6, 0.5, 0.3]: one cue in ~5 s; the hunting flight is phase 1's) // (2nd pass: the flying combos carry the flights now; was [0.9, 1.4, 1.2])
  },
  // climbs ~14 m, hovers and tracks the player (red ring under it), then dives onto the spot; the
  // crash landing's shockwave is the hit (a perfect dodge may plunge onto its head)
  diveBomb: {
    label: 'Sky dive (dive bomb)', tell: TELL.RED, phase: 2,
    windup: 0.8, climb: 1.1, hover: 1.2, dive: 0.5, recovery: 1.4,
    alt: 13, hoverBack: 9, // hovers this far beside the target (east / west, so it stays on screen)
    track: 2.6, lead: 0.35, // the target ring follows the player (exp rate /s, velocity lead s) until the dive
    radius: 7.5, damage: 34, burn: 1.0, knockback: 7,
    minDist: 0,
    weight: [0, 0.2, 0.15], cooldown: 15, // (was [0, 1.6, 1.4]: folded into the combos' dives; tuning: [0, 0.6, 0.4])
  },
  // rises ~9 m and spits 3-5 fireballs while hovering; each shell's landing spot rings red from
  // `aim` s before the spit; then it lands
  hoverBarrage: {
    label: 'Hover barrage', tell: TELL.RED, phase: 2,
    windup: 0.8, rise: 1.0, aim: 0.4, interval: 0.5, land: 1.2,
    shots: [3, 5], // random count, inclusive
    alt: 9, standoff: 13, // hovers this far beside the player (east / west, so it stays on screen)
    lead: 0.55, // aim lead (s of the player's velocity)
    radius: 3.2, damage: 15, burn: 1.2, knockback: 2.5, maxHits: 2,
    minDist: 0,
    weight: [0, 0.4, 0.1], cooldown: 13, // (was [0, 1.4, 1.2]: folded into the combos' barrages; tuning: [0, 0.6, 0.4])
  },
  // ---- FLYING COMBOS (2026-11-15, second pass): one take-off, several cued parts strung together in
  // the air by banking turns, always ending in a dive whose crash landing is the last blow (and the
  // opening after it). `parts` in order: 'pass' (a low strafe breathing a burning strip onto the led
  // hero, as the Burning pass), 'barrage' (hovering beside the hero spitting `shots` shells, one red
  // beat each, as the Hover barrage), 'dive' (wheels round to hover beside him, tracks, dives: the
  // crash is the blow, as the Sky dive). Every part's blow is red; the strip and the shells are
  // breathed / spat from the air (plunge: true): a perfect dodge sends the hero onto the flying
  // wyrm's head, it crashes and the combo ends there. The numbers of each part live in `flight`
  // below; the three combos only choose the parts, the pacing and the AI data.
  // `links` (tuningLinks.js): ground follow-ups the AI may chain from the landing.
  skyHunt: {
    label: 'Hunting flight (pass, dive)', tell: TELL.RED, phase: 1,
    parts: ['pass', 'dive'],
    windup: 1.0, recovery: 1.3,
    minDist: 7, maxDist: 34,
    weight: [0.9, 0.25, 0.15], cooldown: 24, // (tuning: [1.0, 0.6, 0.3], cooldown 15: the phase-1 flight, about twice a phase-1 minute and a half; later phases fly the longer combos)
  },
  skyFurnace: {
    label: 'Furnace flight (shells, pass, dive)', tell: TELL.RED, phase: 2,
    parts: ['barrage', 'pass', 'dive'],
    windup: 0.85, recovery: 1.2,
    minDist: 0, maxDist: 40,
    weight: [0, 1.1, 0.2], cooldown: 17, // (tuning: [0, 1.3, 0.8]: phase 3 flies the cataclysm flight)
  },
  skyCataclysm: {
    label: 'Cataclysm flight (pass, shells, pass, dive)', tell: TELL.RED, phase: 3,
    parts: ['pass', 'barrage', 'pass', 'dive'],
    windup: 0.8, recovery: 1.1,
    minDist: 7, maxDist: 36,
    weight: [0, 0, 1.2], cooldown: 18, // (tuning: [0, 0, 1.5])
  },
  // ARMAGEDDON (key meteorRain, ADR-053; replaced the Meteor rain): rears onto its hind legs and
  // fires a salvo of `missiles` fire bolts into the sky (visual; the punish window: it is committed
  // and rearing for windup + cast), the sky answers (`hush`: an orange glow, a rumble) while it drops
  // to all fours and fights on, then `waves` x `perWave` meteors hammer the whole clearing (each heats
  // its ground for `warn` s, every `ledEvery`-th led onto the hero, never two led impacts within
  // `ledGap` s; within `safeR` m of the hero a wave covers at most `safeCover` of the ground and no
  // two of its footprints overlap by more than a third), and `finale.delay` s after the last wave a
  // single great meteor falls on the hero. P3 craters burn `craterBurn` s (contact ticks, blockable)
  meteorRain: {
    label: 'Armageddon (meteor salvo)', tell: TELL.RED, phase: 2,
    windup: 1.4, cast: 1.6, recovery: 0.9, hush: 0.8,
    missiles: [12, 12, 16], missileEvery: 0.11, missileCone: 0.15, missileSpeed: 45, // rad half-cone, m/s
    missileLean: 0.22, skyRoom: 9, // the bolts lean toward the camera (x speed); the camera keeps this many m above the jaws in view through the cast
    waves: [3, 3, 5], perWave: [8, 8, 10], // (P3 was 4 waves: more fire each phase) waveGap: 1.6, stagger: 0.12, // (P1: Lab only)
    warn: 1.5, warnLed: 1.2, ledEvery: 3, ledGap: 0.5, lead: 0.5, // s of heat warning; led: s of velocity lead
    fall: 0.9, fallHeight: 34, size: 1.3, // visible fall (s) from above the wyrm; drawn size x the old meteor
    radius: 3.4, damage: 20, burn: 1.5, knockback: 3, maxHits: 4,
    craterBurn: [0, 0, 2.0], tickDamage: 4, tickBurn: 0.5,
    safeR: 12, safeCover: 0.45,
    finale: { delay: 1.2, radius: 7, warn: 2.0, damage: 34, burn: 2, knockback: 7, fall: 1.1, size: 2.4 },
    // the three looks of the move (?apoc=a|b|c, skyFx.APOC_LOOK; the owner kept a): when the sky deck
    // starts (s after the cast starts) and how long it takes to spread over the frame; `menace` = the
    // share of the windup it holds low and still, glaring, before it rears; `drop` = the share of the
    // recovery its forefeet take to come down (then the slam). c: the flight's own timings and height
    looks: {
      a: { deckAt: 1.6, deckGrow: 0.8, menace: 0.22, drop: 0.38, cone: 0.32 }, // (cone: the salvo fans wider than missileCone: a dozen columns, not one)
      b: { deckAt: 0.35, deckGrow: 2.6, menace: 0.22, drop: 0.38 },
      c: { deckAt: 0.5, deckGrow: 1.2, windup: 0.9, rise: 0.9, alt: 10, descend: 0.75, recovery: 0.55, cone: 0.45 },
    },
    weight: [0, 1.6, 1.8], cooldown: 28, // (tuning: [0, 1.2, 1.5]: two cues a second)
  },
  // slams the forefeet: lava pillars erupt in a line toward the player one after another (each
  // rings >= `first` s); in phase 3 a chasing variant spawns pillars under the player for ~3 s
  eruptions: {
    label: 'Fire eruptions', tell: TELL.RED, phase: 2,
    windup: 0.9, slam: 0.2, recovery: 1.5,
    line: { start: 5.5, step: 3.4, beyond: 7, max: 9, first: 0.65, delay: 0.11 },
    // each pillar leaves a burning pool for pool[phase] s (contact ticks, blockable, never while rolling)
    pool: [0, 2.2, 3.2], poolR: 0.8, poolTick: 3, poolBurn: 0.5,
    chase: { chance: 0.6, time: 3.0, every: 0.42, warn: 0.7, lead: 0.3, maxHits: 2 },
    radius: 2.4, active: 0.3, damage: 20, burn: 1.2, knockback: 4,
    minDist: 6, maxDist: 28,
    weight: [0, 0.9, 1.8], cooldown: 11, // (tuning: [0, 1.5, 1.4]: P2's line is one cue, P3's chase many)
  },
  // a ring of fire ignites round the wyrm and expands outward: roll through it (or be beyond r1)
  flameRing: {
    label: 'Flame ring', tell: TELL.RED, phase: 2,
    windup: 1.1, cast: 0.25, recovery: 1.0, // recovery >= the ring's travel to r1
    r0: 3.0, r1: 20, speed: 10, width: 2.2, // r0 round the root: the band covers the flanks from ignition
    rings: [1, 2, 3], ringGap: 0.95, // rings per phase, one behind the other (each its own red beat)
    damage: 24, burn: 2.0, knockback: 4,
    maxDist: 14,
    weight: [0, 0.9, 0.7], cooldown: 12, // (tuning: [0, 1.4, 1.2]: its rings come one a second)
  },
  // a wall of fire springs up in front of the wyrm and sweeps across the arena: roll through it
  // (i-frames) or get behind the wyrm
  flameWall: {
    label: 'Flame wall', tell: TELL.RED, phase: 3,
    windup: 1.2, cast: 0.3, recovery: 1.0, // recovery >= the sweep
    start: 4, length: 40, width: 2.4, speed: 10, sweep: 30,
    walls: [1, 1, 2], wallGap: 1.2, // P3: a second wall `wallGap` s later from the hero's side, square to the first
    damage: 28, burn: 2.0, knockback: 5,
    weight: [0, 0, 0.7], cooldown: 14, // (tuning: [0, 0, 1.6]: two cues in 6 s)
  },
  // 2.5 s charge (white-hot body, embers sucked in, rising sound), then an arena-sized blast: flee
  // beyond the radius or perfect-dodge it (plunge). Also the phase-3 opener (dragon-melee's ai.js)
  nova: {
    label: 'Inferno nova', tell: TELL.RED, phase: 3,
    windup: 2.5, blast: 0.45, recovery: 1.6,
    radius: 22, damage: 70, burn: 3, knockback: 10,
    weight: [0, 0, 0.35], cooldown: 32, // (tuning: [0, 0, 0.7]; the roar into phase 3 queues it anyway)
  },
};

// the parts of every flying combo (s, m, HP; per-phase arrays [P1, P2, P3])
export const FLIGHT = {
  takeoff: 0.75, // off the ground into the first pass (a first barrage / dive climbs `rise` instead)
  rise: 0.95,
  swoop: 0.65, // from a hover or a wheel, dropping and turning onto the next pass's line
  wheel: 1.15, // a banking turn from the end of a pass round to the next hover point
  pass: { time: 1.6, alt: 7, frontLead: 8, reach: [22, 36], start: 9, width: 4.6, linger: [2.5, 3.2, 4.5], tick: 0.25, tickDamage: 4, tickBurn: 1.0, damage: 26, burn: 2.0, knockback: 4 },
  // (barrage interval >= the hero's roll cadence, 0.5 s: one roll a shell)
  barrage: { alt: 9, standoff: 12, aim: 0.4, interval: [0.6, 0.6, 0.55], shots: [3, 3, 4], lead: 0.55, radius: 3.2, damage: 15, burn: 1.2, knockback: 2.5, maxHits: 2 },
  dive: { alt: 12, hoverBack: 9, hover: [0.95, 0.8, 0.7], dive: 0.5, track: 2.6, lead: 0.35, radius: 7.5, damage: 34, burn: 1.0, knockback: 7 },
};


// Fire trails (ADR-190, the fire-and-forest pass: "all the fire should be coming from the dragon
// itself"; fireTrails.js, skyFx.js sources). Every fire visibly travels from the wyrm to where it
// burns. Visual except where noted (the crack's run IS the chase's tell: its first pillar waits for it).
export const TRAILS = {
  // the eruptions' crack (fireTrails.js): it runs from the forefeet's slam. The P2 line: its head
  // reaches each pillar as it bursts. The P3 chase: it runs out at `speed` m/s to the led hero (the
  // first pillar is laid where it catches him: `arrive` m), then follows him at `follow` m/s (over
  // his sprint, 7.2: it keeps up) and each pillar bursts at its head. `maxRun` s: past it, a hero it
  // has not caught (off in a corner) gets the first pillar where the head is.
  crack: {
    speed: 18, follow: 9, arrive: 0.3, maxRun: 1.6,
    step: 0.7, jag: 0.32, // m between the crack's points, how far each kinks to the side
    glow: 1.6, runnerGlow: 0.7, // s a stretch keeps glowing after the head passed (a runner: its flames)
    rate: 320, headRate: 50, frontRate: 70, heat: 0.75, y: 0.55, // blobs / s (x 0.6 on a phone: phoneK), peak heat
    markEvery: 2.0, markPower: 0.75, // a floor mark (`cut`) every this many m it runs; its power
    scorchR: 0.8, scorchChar: 0.25, scorchHeat: 0.7, // and the scorch map along it
    phoneK: 0.6,
  },
  // the P3 second flame wall (?wallSource=a|b): its line is laid from where it meets the wyrm's fire
  // at `laySpeed` m/s each way. b: the breath runs `breath` s (after the first wall's cast) toward
  // that point and a runner crosses the ground at `runSpeed` from where it strikes (`strike` m ahead
  // of the jaws) to the line
  wall: { laySpeed: 45, runSpeed: 32, breath: 0.6, strike: 7, strikeDelay: 0.15 },
  // Armageddon's meteors (skyFx.js METEOR_SOURCE, ?meteorSource=a|b|off): every meteor falls from the
  // wyrm's own fire in the sky, visible for its whole warning (`fall` 0: the warning; capped here)
  meteor: {
    fall: 1.35, lob: 2.5, // s of visible flight at most (the rest of the warning it waits at its source), m of arc
    // a: the salvo's bolts climb and fan out into burning seeds hung along the top of the frame (deck
    // height); each meteor drops from the seed nearest its spot
    seeds: { fly: 0.75, band: [0.62, 0.9], width: 0.85, rate: 26, life: 14 },
    // b: a vortex of fire over the wyrm, fed by a column of heat off its back the whole barrage;
    // meteors are flung out of its rim toward their spots
    vortex: { r: 4.2, spin: 1.7, rate: 150, column: 60, follow: 1.5, maxV: 0.78 },
  },
};
