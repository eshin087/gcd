// The wyrm ablaze (phase 3): the numbers of dragon/ablaze.js. Data, not logic.
//
// In phase 3 the Cinder Wyrm sets itself on fire: the roar's ignition beat runs fire out from the
// chest along the wings, the legs and the tail, then flames stand on its wing tips, claws and the last
// third of its tail for the rest of the fight. Every flame is heat in the fire field (game.fx.fire,
// ADR-113); embers are small glyph particles. It burns the world (wood it touches catches, the grass
// under its claws chars and glows) and deals no damage to the hero.
//
// Units: seconds, WORLD metres (the body sites are already in world space), fire-field heat (~0.4 a
// cool rim, ~1 the body, 2+ the heart where blobs overlap), blobs per second.

export const ABLAZE = {
  // The three strengths behind ?ablaze=a|b|c (default b; ?ablaze=off: none). Per look:
  //   k        the heat of every flame (x site heat)        rate   blobs a second (x site rate)
  //   size     the blobs' size (x site size)                 life   their life, s [min, max]
  //   rise     how fast they climb (m/s) and gravity          trail  extra fire left along a fast
  //                                                                  part's path ([life, heat, minSpeed m/s]; null: none)
  //   prints   burning footprints and the tail's drag (bool)  horns / crest: the horns and the spine crest alight
  //   embers   embers a second off the burning parts          light  the two pooled lights' intensity
  looks: {
    a: { k: 0.85, rate: 0.8, size: 0.9, life: [0.32, 0.5], rise: [1.4, 2.4], trail: null, prints: false, horns: false, crest: false, embers: 14, light: 1.6 },
    b: { k: 1.0, rate: 1.0, size: 1.0, life: [0.4, 0.62], rise: [1.6, 2.8], trail: [0.4, 0.34, 7], prints: true, horns: false, crest: false, embers: 24, light: 2.2 },
    c: { k: 1.18, rate: 1.25, size: 1.2, life: [0.48, 0.75], rise: [2.0, 3.4], trail: [0.48, 0.42, 6], prints: true, horns: true, crest: true, embers: 40, light: 3.0 },
  },

  // The sites that burn. rate: blobs / s; size: m across at birth; heat: per blob; up: m above the
  // point (a claw's flame stands on the toe, not in it); at: how far out the ignition's front has to
  // be (0 the chest .. 1 the tips) before it lights.
  sites: {
    tip: { rate: 34, size: 1.0, heat: 0.4, up: 0.1, at: 1 },
    edge: { rate: 16, size: 0.8, heat: 0.32, up: 0, at: 0.9 },
    claw: { rate: 30, size: 0.9, heat: 0.4, up: 0.3, at: 1 },
    tail: { rate: 16, size: 0.85, heat: 0.36, up: 0.15, at: 0.72 }, // the last third (at: per joint, 0.72 .. 0.96)
    tailTip: { rate: 50, size: 1.35, heat: 0.44, up: 0.2, at: 1 }, // the larger flame at its end
    horn: { rate: 24, size: 0.8, heat: 0.36, up: 0, at: 0.45 }, // (look c)
    crest: { rate: 10, size: 0.85, heat: 0.32, up: 0, at: 0.3 }, // (look c; at: per point, 0.15 .. 0.6)
  },
  tailFrom: 0.66, // the tail burns from this share of its joints to its end
  minY: 0.75, // no blob is born lower (lower, the field's soft depth test fades it into the ground)
  inherit: 0.18, // the share of a part's velocity its flame keeps (the rest is left behind: it trails)
  drag: 1.6,
  jump: 3, // m a part may move in one frame before it counts as a teleport (no trail)
  ember: { size: [0.24, 0.36], life: [0.5, 1.1], speed: 1.2, rise: [1.2, 3.2] },

  // The ignition: a beat of the phase-3 roar (attacks.js makeRoar), `delay` s after the ring went out
  // so the ring and its red flare read first. The fire runs from the chest along the wing arms to the
  // tips, down the legs to the claws and along the tail in `time` s, then flares at every end.
  ignite: {
    delay: 0.45, time: 1.1, fast: 0.45, // (fast: lit without the roar: a Lab jump, a fight entered at low HP)
    runner: { size: 1.0, heat: 0.62, up: 0.6, life: [0.3, 0.45], spacing: 0.3, max: 6, linger: 0.7, lingerHeat: 0.24 },
    flash: { blobs: 7, size: [0.7, 1.5], heat: 0.3, speed: [2.5, 6], life: 0.38, embers: 70, shake: 0.32, punch: 0.6, light: 4, lightR: 16, lightLife: 0.45 },
  },
  // Death: the fire goes out along the body, the ends first, back to the chest, to smoke and embers.
  douse: { time: 1.5, smoke: 4, embers: 6 },
  // Stagger / posture break / the plunge's reaction: it gutters low (level) and comes back (rate / s).
  gutter: { level: 0.28, rate: 3.5, actions: ['stagger', 'postureBreak', 'plunged'] },
  ramp: 5, // a site's own fade in / out (1 / s)

  // Readability: a timing cue (combat:flash from the wyrm or its hazards) dims the fire round it for
  // `time` s: to `near` inside r0, back to `far` at r1 (m); the cue's windup end (`lead` s before the
  // flash) starts the dim. A red / black body glow (uWarn) dims all of it by up to `warn`; the breath's
  // charge (throat) dims the flames of the head and the neck (look c) by up to `throat`. A flame within
  // `hero` m of the hero burns at `heroK` (he stays seen beside a burning claw).
  cue: { time: 0.55, lead: 0.15, r0: 3.5, r1: 8, near: 0.08, far: 0.65, fade: 6 },
  warn: 0.5, throat: 0.85,
  hero: { r: 3, k: 0.4 },

  // Wood: a burning part that passes a tree or a log (moving at minSpeed m/s or more: a blow, a sweep,
  // a stride, not a flame standing beside it) lights it (world.ignite(x, z, r, k, false): wood
  // only, within the world's own caps BREAK.light / BREAK.spread). `perFrame` sites tried a frame, each at most
  // every `every` s, below `maxY` m; at most `perMin` fires a minute from the body.
  wood: { r: 0.9, k: 0.7, every: 0.12, maxY: 6.5, minSpeed: 3, perMin: 5, perFrame: 6 },
  // The grass: burning footprints (looks b and c): where a foot plants, the scorch map is charred and
  // warmed (burn, heat; it glows and cools by itself) and a few small, low flames flicker there for
  // `life` s. They never go through world.fire (that fire hurts the hero): smaller, lower and shorter
  // lived, so the player learns they are safe. The tail's drag leaves the same, every `drag` s.
  print: { r: [0.6, 0.8], burn: 0.35, heat: 0.75, life: 1.6, rate: 14, size: [0.32, 0.5], heat2: 0.3, slots: 10, drag: 0.14, dragY: 0.55, dragSpeed: 6 },

  // The two pooled lights (render/lights.js, no rig of their own): the tail's tip and low between
  // the forefeet. [color, radius]
  lights: { color: [1, 0.48, 0.15], radius: 9 },

  // Budget: at most `perFrame` blobs a frame; the fire field's count above field[0] scales the body's
  // fire down, to none at field[1] (the attacks' own fire comes first).
  cap: { perFrame: 90, field: [3300, 4200] },
};
