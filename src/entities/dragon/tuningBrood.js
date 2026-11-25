// Numbers for the incantation (incantation.js), the brood (brood.js) and the moves that call it
// (broodAttacks.js); ADR-190. Metres, seconds; heats are the fire field's (render/fireField.js: ~0.4
// a cool rim, ~1 the body, 2+ the white heart).
import { TELL } from '../../combat/rules.js';

export const BROOD = {
  // ------------------------------------------------------------------ the incantation (the circle)
  // A seal of burning script: an outer ring, a second ring inside it, sigils (the dragon script: small
  // shapes of 2 - 5 strokes) between the two, a seven-point star inside, a small ring at the heart. Its
  // lines are written ON THE LETTER GRID in the fire field (one blob per cell, DuelFx._ink): fire at
  // these heats prints as orange digits whose tongues climb off the line.
  incant: {
    band: 0.74, // the second ring, x r
    sigilAt: 0.87, // the sigils' ring, x r
    sigilSize: 0.2, // a sigil's height, x r (ground); the standing look uses `standSize` m
    sigils: 10, // round the ring (the jaws' seal: `jawSigils`)
    jawSigils: 8,
    star: 0.7, // the star's points, x r (a {7/3} heptagram)
    heart: 0.2, // the small ring at its heart, x r
    spin: [0.16, -0.24], // rad/s: the band of sigils, the star (they turn against each other)
    write: 0.55, // share of the circle's life over which it is written (rings run round, sigils appear)
    heat: [0.62, 1.05], // a line's heat: written, fully charged (flare 1)
    heatFlare: 1.55, // the flash as the spell releases (flare 1 -> its first `flash` s)
    flash: 0.22,
    flicker: 0.12, // +- of the heat, each sigil on its own beat
    groundY: 0.55, // m: a ground circle's lines stand this high (the field's soft depth fades lower heat)
    groundGain: 1.25, // and this much hotter
    jawGain: 0.72, // a seal in the air: this much cooler (its lines lie close and add up to white)
    tail: 0.55, // s: end() -> burnt out (the lines tear up into tongues and die)
    segs: 44, // segments of the outer ring (the phone: `segsLow`)
    segsLow: 28,
    licks: 22, // tongues / s climbing off the lines while it burns (x flare)
    standSize: 2.0, // m: look b, a standing sigil's height
    standY: 1.6, // m: ... the height of its middle
    stream: 90, // look c: motes / s streaming off the body into the circle while it is written
    jawOffset: 1.3, // m (x SCALE): a jaws seal hangs this far before the mouth
    // the `script` ink (?incantInk): the fire's own colours, its turbulence turned down so a line of
    // it holds its shape (lick / erode / warp: firePalettes.js), boiling a little faster
    ink: { lick: 0.12, erode: 0.2, warp: 0.15, boil: 10 },
  },

  // ------------------------------------------------------------------ fire drakelings
  drakeling: {
    count: [3, 4, 5], // per phase (the move is phase 2+: P1's is the Lab's)
    hp: [1, 2, 2], // a light cut takes 1, a heavy one 2; a parry of its lunge kills it outright
    life: 8.5, // s before it dives in (each one `lifeStep` s after the one before)
    lifeStep: 0.7,
    emerge: 0.55, // s it takes to burst out of the circle and climb
    orbitR: [4.6, 6.2], // m round the hero
    orbitW: 0.85, // rad/s round him
    height: 1.9, // m it flies at (+ a bob)
    speed: 8.5, // m/s at most while it circles
    accel: 14,
    radius: 0.55, // m: its body (the blade's cut reaches `cut` further)
    cut: 0.35,
    // the lunge: one at a time; a windup you can react to, a dash at him, a recovery
    firstLunge: 1.4, // s after the cast before the first one
    gap: [0.9, 1.4], // s between one lunge's end and the next one's windup (any drakeling)
    blue: [0, 0.3, 0.35], // share of lunges that are blue (a heavy bite: parry it)
    lunge: {
      normal: { windup: 0.72, damage: 9, knockback: 2.5 },
      blue: { windup: 0.95, damage: 14, knockback: 4.5 },
      speed: 15, // m/s of the dash
      over: 1.6, // m it flies on past where he stood
      recover: 0.55,
      pull: 1.1, // m it draws back through the windup
      hitR: 0.6,
    },
    blocked: 0.6, // s it reels after a block
    // the end of its time: it climbs, glows white-hot and dives onto him (red: roll through it)
    dive: { windup: 1.05, rise: 3.6, speed: 18, radius: 2.4, damage: 16, burn: 1.5, knockback: 6, gap: 0.8 },
    burnWorld: 0.5, // fire k on the grass where it bursts (world.ignite)
  },

  // ------------------------------------------------------------------ kamikaze wisps
  wisp: {
    count: [4, 5, 7],
    gap: 0.62, // s between two wisps peeling off its body
    gather: 0.4, // s a wisp swells on the body before it tears off
    peel: 7, // m/s it is flung off the body (outward and up)
    speed: [7, 11.5], // m/s: at launch, at full homing
    turn: 2.6, // rad/s it can turn while it homes (it curves; it never snaps)
    height: 1.35, // m it homes in at
    arm: 3.0, // m from him: it commits (the red tell) and flies through where he stands
    fuse: 0.68, // s from commit to the burst (>= flashLead + a reaction)
    sep: 0.75, // s at least between two commits (the next one wheels round him till then)
    radius: 0.38, // its body; the cut reaches `cut` further
    cut: 0.4,
    blast: 1.9, damage: 12, burn: 1.0, knockback: 4,
    life: 7, // s: a wisp that never reaches him gutters out
  },

  // ------------------------------------------------------------------ the moves (broodAttacks.js)
  moves: {
    drakelings: {
      label: 'Fire drakelings', tell: TELL.BLUE, phase: 1, category: 'spell',
      windup: 1.7, cast: 0.55, recovery: 0.9,
      r: 10, // m: the circle round its feet (x 1, not SCALE): wider than the wyrm, so it is seen round it
      weight: [0, 0.55, 0.6], cooldown: 34,
    },
    wisps: {
      label: 'Kamikaze wisps', tell: TELL.RED, phase: 1, category: 'spell',
      windup: 1.25, cast: 1.1, recovery: 0.8,
      r: 2.6, // m: the seal before its jaws
      minDist: 7,
      weight: [0.35, 0.5, 0.5], cooldown: 24,
      lateP1: 0.75, // phase 1: only once it is below this share of its life
    },
  },
};
