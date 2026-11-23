import { lookOf } from '../../duelist/lookSwitch.js';

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
//   'lantern' a `cast` beat: Heaven's Lantern (the great orb gathered, thrown; a perfect parry: THE PUSH)
//   'barrage' a `cast` beat: Raining Suns (sixteen small blasts poured down from the air; then a
//             returnable `release` thrown down: release.air / yTo)
// The beam's kinds (starting with 'beam') are the beam agent's (moves/kiBeam.js).
//
// His technique (the lead's call): a blast is a palm drawn back at the ribs, the lead hand held out
// sighting, then the palm thrust; a bolt is the hand raised by the ear, then the arm flung out, two
// fingers pointing down the line.
//
// (the fourth wave, the moves agent: under `?ascOrb=c`, the great gathered sphere, Heaven's Lantern is
// gathered with BOTH ARMS STRAIGHT UP, the palms open to the sky: RAISE_UP below; read once as the
// moves are built. The orb's look itself is fx.js's, read live.)
const ORB_UP = lookOf('ascOrb', 'a') === 'c';

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
  // ---- Heaven's Lantern: he rises, both arms raised and the palms turned up (the orb gathers over
  // them); then both arms swept down together (the throw); he drops and lands low
  const TUCK = { rF: [-0.12, 0.08, -0.05], lF: [0.12, 0.12, 0.05], rK: [-0.2, 0.4, 1], lK: [0.2, 0.4, 1], flat: 0.2 };
  const RAISE = { yaw: 0, bY: -0.04, pitch: -0.14, spX: -0.1, hdX: -0.4, rH: [-0.14, 0.62, 0.12], lH: [0.14, 0.62, 0.12], rP: [-0.6, 0.6, -0.2], lP: [0.6, 0.6, -0.2], ...TUCK };
  const RAISE2 = { ...RAISE, pitch: -0.2, hdX: -0.5, rH: [-0.2, 0.66, 0.06], lH: [0.2, 0.66, 0.06] };
  // (?ascOrb=c) both arms straight up over his head, a little apart, the palms to the sky, the chest
  // opened back, the face up to the sphere
  const RAISE_UP = { ...RAISE, pitch: -0.18, spX: -0.14, hdX: -0.55, rH: [0.04, 0.56, 0.02], lH: [-0.04, 0.56, 0.02], rP: [-0.9, 0.2, 0.1], lP: [0.9, 0.2, 0.1] };
  const RAISE_UP2 = { ...RAISE_UP, pitch: -0.22, hdX: -0.62, rH: [0.03, 0.58, 0.0], lH: [-0.03, 0.58, 0.0] };
  const THROW = { yaw: 0, bY: -0.3, pitch: 0.36, spX: 0.18, hdX: 0.12, rH: [0.12, -0.12, 0.5], lH: [-0.12, -0.12, 0.5], rP: [-0.7, -0.2, -0.3], lP: [0.7, -0.2, -0.3], ...TUCK };
  const LAND = { yaw: 0, bY: -0.42, pitch: 0.3, spX: 0.12, hdX: 0.2, rH: [0.16, -0.18, 0.34], lH: [-0.16, -0.18, 0.34], rP: [-0.8, -0.5, -0.3], lP: [0.8, -0.5, -0.3], ...LOW };
  /** THE PUSH: both palms thrust out and held against the orb (his clip through the lock at range). */
  const PUSH = F({ ...BOTH.hit, bY: -0.36, bZ: 0.2, pitch: 0.16, rH: [0.14, 0.06, 0.56], lH: [-0.14, 0.06, 0.56] });
  // ---- Raining Suns: up and hanging, the legs tucked; the palms thrust down at the hero in turn
  const HANG_R = { yaw: 0.25, bY: -0.1, pitch: 0.3, spX: 0.14, hdX: 0.25, rH: [0.06, -0.06, 0.58], lH: [-0.02, 0.06, 0.14], rP: [-0.8, -0.3, -0.2], lP: [0.8, -0.6, -0.1], ...TUCK };
  const HANG_L = { ...X.mirror(HANG_R), ...TUCK };
  const sunsKeys = () => {
    const n = T.barrage.count, keys = [[0.3, F({ ...BOTH.coil })], [0.75, F({ ...RAISE, rH: [-0.3, 0.5, 0.2], lH: [0.3, 0.5, 0.2] })], [1.0, { ...F(HANG_R), e: 'i' }]];
    for (let i = 1; i < n; i++) {
      const u = 1 + i / n, p = i % 2 === 0 ? HANG_R : HANG_L;
      keys.push([u - 0.4 / n, F({ ...p, rH: [0.06, 0.04, 0.24], lH: [-0.06, 0.04, 0.24] })]);
      keys.push([u, { ...F(p), e: 'i' }]);
    }
    keys.push([2.0, F(HANG_R)]);
    return keys;
  };
  const LA = T.lantern, BA = T.barrage;

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
      label: 'Blast Dance', phase: 2, weight: [0, 1.3, 0], cooldown: 8, band: [0, 4], recovery: 0.7, cat: 'string',
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
      label: 'Sun Wheel', phase: 2, weight: [0, 1.3, 0.8], cooldown: 10, band: [4, 13], recovery: 1.5, cat: 'ranged', ki: 'disc',
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
    /** Heaven's Lantern (forms 2 - 3): he rises 2.5 m, both arms raised, and gathers the great orb over
     *  his palms (1.8 s; the ring's light dims); both arms swept down, it is thrown at where the hero
     *  will be (blue: it cues itself; a parry or a block is safe, a roll passes it). A PERFECT parry
     *  starts THE PUSH: a lock at range; won, it flies back into him; lost, it bursts on the hero. */
    skyLantern: {
      label: "Heaven's Lantern", phase: 2, weight: [0, 1.0, 0.8], cooldown: 28, band: [4, 16], recovery: LA.recovery, cat: 'hazard', ki: 'lantern',
      recoveryKeys: [[0.3, F(LAND)], [1.0, F({ ...X.HANDS, bY: -0.12, ...OR })]],
      pushPose: PUSH,
      beats: [{
        tell: B, windup: LA.windup, fixed: true, active: 0.45, damage: LA.damage, knockback: LA.knockback, knockdown: true,
        cast: { kind: 'lantern', selfCue: true }, part: 'palms', close: 0, track: 0.6, air: true, hazard: true,
        // (up through the first third of the gather, held there; down to the floor through the active frames)
        lift: [[0, 0], [0.32, LA.lift], [1.0, LA.lift], [1.1, LA.lift], [2.0, 0]],
        keys: [[0.18, F({ ...BOTH.coil })], [0.5, F(ORB_UP ? RAISE_UP : RAISE)], [0.9, F(ORB_UP ? RAISE_UP2 : RAISE2)], [1.0, { ...F(THROW), e: 'i' }], [1.6, F(THROW)], [2.0, F(LAND)]],
      }],
    },
    /** Raining Suns (forms 2 - 3): he leaps 3 m and hangs, pouring sixteen small blasts down at the hero
     *  in 2.2 s (the palms in turn; each aimed where he is, each cueing itself: block or parry them);
     *  then a returnable blast thrown down from the air, and he drops. */
    rainingSuns: {
      label: 'Raining Suns', phase: 2, weight: [0, 1.2, 1.0], cooldown: 14, band: [4, 15], recovery: 0.6, cat: 'ranged', ki: 'barrage',
      recoveryKeys: [[0.35, F(LAND)], [1.0, F({ ...X.HANDS, bY: -0.12, ...OR })]],
      beats: [
        {
          tell: N, windup: 0.7, fixed: true, active: BA.dur, damage: BA.damage, knockback: 0.8, cast: { kind: 'barrage', selfCue: true }, part: 'palms', close: 0, track: 0.6, air: true,
          lift: [[0, 0], [0.6, BA.lift], [1.0, BA.lift], [2.0, BA.lift]], keys: sunsKeys(),
        },
        {
          ...blast(B, 0.5, BA.fin.damage, { release: { speed: BA.fin.speed, size: BA.fin.size, radius: BA.fin.radius, returnable: true, air: true, yTo: BA.yTo } }),
          active: 0.4, air: true, knockback: 1.6, part: 'palms', track: 0.9,
          lift: [[0, BA.lift], [1.0, BA.lift], [1.2, BA.lift], [2.0, 0]],
          keys: [[0.3, F({ ...BOTH.coil, ...TUCK, pitch: 0.1 })], [0.92, F({ ...BOTH.coil, ...TUCK, pitch: 0.06, rH: [0.06, 0.1, 0.0], lH: [-0.06, 0.1, 0.0] })], [1.0, { ...F({ ...BOTH.hit, ...TUCK, pitch: 0.4, rH: [0.12, -0.08, 0.56], lH: [-0.12, -0.08, 0.56] }), e: 'i' }], [1.5, F({ ...THROW })], [2.0, F(LAND)]],
        },
      ],
    },
  };
  return M;
}
