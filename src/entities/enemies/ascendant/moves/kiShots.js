// Tian Lei's ki moves, the thrown and the called (MOVES.md: Spirit Shot, Scatter, Blast Dance, Golden Rain, Sun Wheel, Heaven's Volley, Thunder Gates, Lightning Lance, Storm Cage). THE SHOTS AGENT'S FILE.
//
// A move file is a function of the builders object `X` (ascendant/moves.js header: punch, kick, elbow,
// shoulder, strikeKeys, F, mirror, W, TELL, TUNING ...) returning { name: move }. A move (or one beat of
// a string) marked `ki: '<kind>'` has its hooks routed through ki.js to this agent's class
// (ascendant/kiShots.js ShotMoves). The kinds here:
//   'blast'   a `release` beat: blasts leave his palm at the impact (release.count / spread / speed /
//             size / returnable); each cues itself flashLead before it reaches the hero (fx.js)
//   'rain'    a `cast` beat: Golden Rain (ShotMoves pours ten blasts out through the beat's active frames)
//   'disc'    a `cast` beat: Sun Wheel (the disc; it comes home to his hand: ShotMoves.discBack)
//   'bolt'    a line zone beat from his pointing fingers (17 x 1.7 m): ShotMoves draws the lightning and
//             throws it back into him on a perfect parry
//   'volley'  Heaven's Volley: the rise (a `cast` beat lifting him: the strikes are called through its
//             active frames) and the dive (an `air` ring beat whose landing spot ShotMoves steers)
//   'cage'    a `cast` beat: Storm Cage (eight orbs round the hero, each flying in on its turn)
// The beam's kinds (starting with 'beam') are the beam agent's (moves/kiBeam.js).
//
// His technique (the lead's call): a blast is a palm drawn back at the ribs, the lead hand held out
// sighting, then the palm thrust; a bolt is the hand raised by the ear, then the arm flung out, two
// fingers pointing down the line.
export function shotMoves(X) {
  const { TELL: { N, B, R }, punch, kick, strikeKeys, F, TUNING } = X;
  const T = TUNING.shots;
  const OR = X.feet.OR, LUNGE = X.feet.LUNGE, LOW = X.feet.LOW, PIVOT = X.feet.PIVOT;
  const BL = T.bolt;

  // ---------------------------------------------------------------- the poses
  /** The palm drawn back at the ribs, the lead hand out sighting along the line; then the thrust. */
  const PALM = {
    coil: { yaw: -0.7, bY: -0.25, pitch: 0.04, hip: -0.14, rH: [0.02, -0.1, -0.02], rP: [-0.8, -0.6, -0.5], lH: [-0.02, 0.1, 0.52], lP: [0.8, -0.2, -0.3], ...OR },
    hit: { yaw: 0.32, bY: -0.28, bZ: 0.16, pitch: 0.1, hip: 0.18, spY: 0.08, rH: [0.08, 0.04, 0.62], rP: [-0.8, -0.3, -0.2], lH: [0.0, -0.08, 0.12], ...LUNGE },
  };
  /** The bolt: the right hand raised by the ear, the lead arm out; then flung out pointing. */
  const BOLT = {
    coil: { yaw: -0.55, bY: -0.18, pitch: -0.04, spX: -0.06, rH: [-0.12, 0.36, 0.02], rP: [-0.7, 0.4, -0.4], lH: [-0.04, 0.06, 0.44], ...OR },
    hit: { yaw: 0.2, bY: -0.22, bZ: 0.1, pitch: 0.06, hip: 0.12, rH: [0.06, 0.12, 0.64], rP: [-0.8, 0.0, -0.3], lH: [0.02, -0.04, 0.14], ...PIVOT },
  };
  /** The disc: the arm wound across the chest, then flung out to the side (the wheel leaves the hand). */
  const WHEEL = {
    coil: { yaw: 0.7, bY: -0.24, hip: 0.14, rH: [0.36, 0.1, 0.12], rP: [-0.6, 0.3, 0.5], lH: [0.0, 0.04, 0.3], ...OR },
    hit: { yaw: -0.5, bY: -0.24, bZ: 0.08, hip: -0.14, rH: [-0.42, 0.14, 0.42], rP: [-0.9, 0.2, -0.2], lH: [0.04, 0.04, 0.24], ...OR },
  };
  /** Both palms drawn back to the hips, then thrust out together (the cage closing, the hip shot). */
  const BOTH = {
    coil: { yaw: -0.1, bY: -0.3, pitch: 0.04, rH: [0.06, -0.16, 0.04], lH: [-0.06, -0.16, 0.04], rP: [-0.8, -0.7, -0.4], lP: [0.8, -0.7, -0.4], ...LOW },
    hit: { yaw: 0.0, bY: -0.3, bZ: 0.18, pitch: 0.12, rH: [0.16, 0.0, 0.54], lH: [-0.16, 0.0, 0.54], rP: [-0.8, -0.4, -0.2], lP: [0.8, -0.4, -0.2], ...LUNGE },
  };
  const palmKeys = (cock = 0.72, left = false) => strikeKeys({ coil: PALM.coil, hit: PALM.hit, cock, left });
  const boltKeys = (cock = 0.7, left = false) => strikeKeys({ coil: BOLT.coil, hit: BOLT.hit, cock, left });

  /** One blast beat (a release: the blast leaves the palm at the impact; it cues itself). */
  const blast = (tell, windup, damage, o = {}) => {
    const { left = false, cock = 0.72, release = {}, ...extra } = o;
    return {
      tell, windup, active: 0.1, damage, knockback: 1.2, ki: 'blast', part: left ? 'fistL' : 'fistR', close: 0, track: 0.92,
      release: { style: 'blast', speed: T.spirit.speed, from: 0.9, count: 1, ...release },
      keys: palmKeys(cock, left), ...extra,
    };
  };

  /** One bolt beat (a line zone from his pointing fingers; blue: a parry; a perfect parry returns it). */
  const bolt = (windup, damage, o = {}) => {
    const { left = false, cock = 0.7, ...extra } = o;
    return {
      tell: B, windup, active: 0.08, damage, knockback: 1.4, ki: 'bolt', zone: { kind: 'line', r: BL.range, w: BL.width }, part: left ? 'fistL' : 'fistR',
      close: 0, track: 0.92, keys: boltKeys(cock, left), ...extra,
    };
  };

  // ---- Golden Rain: he stands square and pours them out, the palms alternating (the active frames)
  const rainKeys = () => {
    const keys = [[0.4, F({ ...BOTH.coil, yaw: -0.2 })], [1.0, { ...F(PALM.hit), e: 'i' }]];
    for (let i = 1; i < 10; i++) {
      const u = 1 + i * 0.1, right = i % 2 === 0;
      const p = right ? PALM.hit : X.mirror(PALM.hit);
      keys.push([u - 0.05, F({ ...p, rH: right ? [0.02, -0.06, 0.2] : p.rH, lH: right ? p.lH : [-0.02, -0.06, 0.2] })]);
      keys.push([u, { ...F(p), e: 'i' }]);
    }
    keys.push([2.0, F(PALM.hit)]);
    return keys;
  };
  // ---- Sun Wheel: thrown, then the arm held up to catch it coming home (the recovery)
  const CATCH = { yaw: -0.3, bY: -0.2, rH: [-0.2, 0.3, 0.4], rP: [-0.8, 0.3, -0.3], lH: [0.02, 0.06, 0.28], ...OR };
  // ---- Heaven's Volley: he rises, the arms spread and raised (calling the sky); then the dive, both
  // fists brought down onto the hero
  const RISE = { yaw: 0, bY: -0.08, pitch: -0.18, spX: -0.1, hdX: -0.3, rH: [-0.36, 0.42, 0.1], lH: [0.36, 0.42, 0.1], rP: [-0.7, 0.5, -0.3], lP: [0.7, 0.5, -0.3], rF: [-0.12, 0.08, -0.05], lF: [0.12, 0.12, 0.05], rK: [-0.2, 0.4, 1], lK: [0.2, 0.4, 1], flat: 0.2 };
  const DIVE_C = { yaw: 0, bY: -0.1, pitch: -0.2, rH: [0.16, 0.52, 0.1], lH: [-0.16, 0.52, 0.1], rP: [-0.7, 0.5, -0.4], lP: [0.7, 0.5, -0.4], rF: [-0.14, 0.2, -0.1], lF: [0.14, 0.25, 0.1], rK: [-0.3, 0.6, 1], lK: [0.3, 0.6, 1], flat: 0.2 };
  const DIVE_H = { yaw: 0, bY: -0.46, pitch: 0.42, spX: 0.2, hdX: 0.3, rH: [0.14, -0.22, 0.46], lH: [-0.14, -0.22, 0.46], rP: [-0.7, -0.2, -0.3], lP: [0.7, -0.2, -0.3], ...LOW };

  const M = {
    /** Spirit Shot: the palm drawn back, the lead hand sighting; a blast at 24 m/s (a parry; a PERFECT
     *  parry flies it back into him); half the time a second from the other palm. */
    spiritShot: {
      label: 'Spirit Shot', phase: 1, weight: [1.5, 0.9, 0], cooldown: 5, band: [5, 16], recovery: 0.6, cat: 'ranged', ki: 'blast',
      beats: [
        blast(B, 0.74, 22, { release: { speed: T.spirit.speed, size: T.spirit.size, radius: T.spirit.radius, returnable: true } }),
        { ...blast(B, 0.5, 20, { left: true, release: { speed: T.spirit.speed, size: T.spirit.size, radius: T.spirit.radius, returnable: true } }), chance: 0.5 },
      ],
    },
    /** Scatter: three blasts thrown in a fan from both palms. */
    scatter: {
      label: 'Scatter', phase: 1, weight: [1.2, 0.8, 0], cooldown: 7, band: [4, 13], recovery: 0.6, cat: 'ranged', ki: 'blast',
      beats: [{
        ...blast(N, 0.6, 12, { release: { speed: T.scatter.speed, count: T.scatter.count, spread: T.scatter.spread, size: T.scatter.size } }),
        part: 'palms', keys: strikeKeys({ coil: BOTH.coil, hit: BOTH.hit, cock: 0.72 }),
      }],
    },
    /** Blast Dance (form 2): a punch, a kick, a blast point-blank (a palm if he is in reach), two more
     *  blows, and a Spirit Shot from the hip (returnable). */
    blastDance: {
      label: 'Blast Dance', phase: 2, weight: [0, 1.4, 0], cooldown: 8, band: [0, 4], recovery: 0.7, cat: 'string',
      beats: [
        punch('cross', N, 0.48, 12),
        kick('round', N, 0.36, 12, { knockback: 1.0 }),
        { ...blast(N, 0.42, 12, { release: { speed: T.dance.speed, size: T.dance.size, from: 0.7 } }), zone: { kind: 'line', r: TUNING.reach.line + 0.4, w: TUNING.reach.lineW }, knockback: 1.6 },
        punch('jab', N, 0.36, 12, { step: 'L' }),
        punch('hook', N, 0.34, 12),
        { ...blast(B, 0.5, 20, { release: { speed: T.dance.hip, size: T.spirit.size, radius: T.spirit.radius, returnable: true } }), zone: { kind: 'line', r: TUNING.reach.line + 0.4, w: TUNING.reach.lineW }, knockback: 1.6, part: 'palms', keys: strikeKeys({ coil: BOTH.coil, hit: BOTH.hit, cock: 0.66 }) },
      ],
    },
    /** Golden Rain (forms 2 - 3): ten small blasts in 1.6 s, two sweeping fans; each cues itself. */
    goldenRain: {
      label: 'Golden Rain', phase: 2, weight: [0, 1.1, 0.8], cooldown: 12, band: [6, 16], recovery: 0.5, cat: 'ranged', ki: 'rain',
      beats: [{ tell: N, windup: 0.7, fixed: true, active: T.rain.dur, damage: T.rain.damage, knockback: 0.9, cast: { kind: 'rain', selfCue: true }, part: 'palms', close: 0, track: 0.9, keys: rainKeys() }],
    },
    /** Sun Wheel (forms 2 - 3): the disc out on a curve, a hang, home through the hero (red: roll);
     *  he holds his hand up to catch it. */
    sunWheel: {
      label: 'Sun Wheel', phase: 2, weight: [0, 1.1, 0.8], cooldown: 10, band: [4, 13], recovery: 1.5, cat: 'ranged', ki: 'disc',
      recoveryKeys: [[0.15, F(WHEEL.hit)], [0.5, F(CATCH)], [0.9, F(CATCH)], [1.0, F({ ...CATCH, rH: [-0.1, 0.2, 0.3] })]],
      beats: [{ tell: R, windup: 0.7, fixed: true, active: 0.1, damage: 18, knockback: 2.5, cast: { kind: 'disc', selfCue: true }, part: 'fistR', close: 0, track: 0.9, keys: strikeKeys({ coil: WHEEL.coil, hit: WHEEL.hit, cock: 0.7 }) }],
    },
    /** Heaven's Volley (form 2): he rises 4 m; six strikes called on marked ground round where the
     *  hero is heading; then he dives onto him (a red ring, a crater). */
    skyVolley: {
      label: "Heaven's Volley", phase: 2, weight: [0, 0.8, 0], cooldown: 16, band: [4, 16], recovery: 0.6, cat: 'hazard', ki: 'volley',
      beats: [
        {
          tell: R, windup: 0.9, fixed: true, active: (T.volley.count - 1) * T.volley.gap + 0.05, damage: T.volley.damage, knockback: T.volley.knockback, knockdown: true,
          cast: { kind: 'volley', selfCue: true }, part: 'palms', close: 0, track: 0.5, air: true, hazard: true,
          lift: [[0, 0], [0.5, 1.2], [1.0, T.volley.rise], [2.0, T.volley.rise]],
          keys: [[0.3, F({ ...BOTH.coil })], [0.9, F(RISE)], [1.0, { ...F(RISE), e: 'i' }], [1.5, F({ ...RISE, rH: [-0.3, 0.5, 0.2], lH: [0.3, 0.5, 0.2] })], [2.0, F(RISE)]],
        },
        {
          tell: R, windup: 0.8, fixed: true, active: 0.12, damage: 26, knockback: 3.5, knockdown: true, ki: 'volley', dive: true,
          zone: { kind: 'ring', r: 2.8 }, ring: 2.8, part: 'palms', air: true, close: 0, track: 0,
          lift: [[0, T.volley.rise], [0.5, T.volley.rise + 0.6], [1.0, 0], [2.0, 0]],
          keys: [[0.5, F(DIVE_C)], [1.0, { ...F(DIVE_H), e: 'i' }], [2.0, F(DIVE_H)]],
        },
      ],
    },
    /** Thunder Gates (form 3): nine beats with bolts between the blows, ending on a lock (a parry moment). */
    thunderGates: {
      label: 'Thunder Gates', phase: 3, weight: [0, 0, 2.0], cooldown: 6, band: [0, 4], recovery: 0.7, cat: 'string',
      beats: [
        punch('jab', N, 0.48, 12),
        punch('cross', N, 0.34, 12),
        bolt(0.44, 18),
        kick('round', N, 0.36, 12, { knockback: 1.0 }),
        punch('jab', N, 0.34, 12, { step: 'L' }),
        bolt(0.44, 18, { left: true }),
        punch('cross', N, 0.36, 13),
        kick('knee', N, 0.34, 13),
        punch('uppercut', B, 0.56, 22, { lock: true, flare: true }),
      ],
    },
    /** Lightning Lance (form 3): four bolts in rhythm. Parry them all; a perfect parry throws one back. */
    lance: {
      label: 'Lightning Lance', phase: 3, weight: [0, 0, 1.3], cooldown: 8, band: [4, 16], recovery: 0.6, cat: 'spell', ki: 'bolt',
      beats: [bolt(0.78, 20), bolt(0.46, 20, { left: true, cock: 0.5 }), bolt(0.46, 20, { cock: 0.5 }), bolt(0.46, 24, { left: true, cock: 0.5 })],
    },
    /** Storm Cage (form 3): eight orbs round the hero, open on the side away from him; they close on
     *  him one at a time (red: each its own flare; roll out through the gap). */
    stormCage: {
      label: 'Storm Cage', phase: 3, weight: [0, 0, 1.0], cooldown: 14, band: [0, 16], recovery: 0.6, cat: 'hazard', ki: 'cage',
      recoveryKeys: [[0.2, F(BOTH.hit)]],
      beats: [{ tell: R, windup: 1.0, fixed: true, active: 0.1, damage: T.cage.damage, knockback: T.cage.knockback, knockdown: true, cast: { kind: 'cage', selfCue: true }, part: 'palms', close: 0, track: 0.6, hazard: true, keys: strikeKeys({ coil: BOTH.coil, hit: BOTH.hit, cock: 0.75 }) }],
    },
  };
  return M;
}
