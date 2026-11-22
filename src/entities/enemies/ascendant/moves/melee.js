// Tian Lei's blows (MOVES.md): the three forms' strings, closers and areas, his counters, his flurries
// and the transformations. Data only, built with the builders `X` (ascendant/moves.js header). Weights
// are [form 1, form 2, form 3]; numbers are MOVES.md's starting values (windups at form 1's pace:
// TUNING.windupScale tightens the later forms). Everything with a blast, a beam, a disc, a called
// strike or a floor piece is in moves/ki.js or moves/terrain.js (the second wave).

// ---------------------------------------------------------------- THE SIGN (the third wave)
// Before a vanish marked `sign` (ascendant.js beatMotion: he goes at u 0.5 of the windup) he stands,
// the weight settled, two fingers of his right hand raised to his brow (the elbow out), the other hand
// loose at his hip, the head turned onto the hero. Body space as moves.js: +x his LEFT, hands offsets
// from each shoulder.
const SIGN_FEET = { lF: [0.17, 0.16], rF: [-0.17, -0.12], lFy: 0.2, rFy: -0.3, rK: [-0.2, 0, 1], lK: [0.2, 0, 1] };
/** The hand on its way up (u 0.18). */
const SIGN_RISE = { yaw: -0.16, bY: -0.1, pitch: 0.0, spX: -0.02, hdX: 0.02, rH: [0.1, 0.12, 0.24], rP: [-0.9, -0.1, -0.2], lH: [0.04, -0.3, 0.08], lP: [0.8, -0.6, -0.3], sw: [0.3, 1.3], ...SIGN_FEET };
/** The sign held (u 0.5): two fingers at the brow. */
const SIGN_HELD = { yaw: -0.12, bY: -0.08, pitch: -0.04, spX: -0.04, hdX: 0.06, rH: [0.14, 0.27, 0.15], rP: [-0.9, 0.2, -0.2], lH: [0.06, -0.36, 0.06], lP: [0.8, -0.6, -0.3], sw: [0.4, 1.45], ...SIGN_FEET };

/**
 * The keys of a SIGN beat: the hand rising (u 0.18), the sign held (0.5: the vanish), then the strike
 * as any blow, its coil from just after the arrival (0.52) to its cock (>= 0.72) and the hit. `keys`:
 * a built strike's keys (X.punch / X.kick ...: those from its cock on are kept); else `coil` / `hit`
 * (/ `after`) as strikeKeys. The sign is always the right hand; `left` mirrors only the strike.
 * X: the builders object (moves.js), for F and strikeKeys.
 */
export function signKeys(X, { coil = null, hit = null, after = null, keys = null, cock = 0.76, left = false }) {
  const c = Math.max(0.72, cock);
  const strike = (keys ?? X.strikeKeys({ coil, hit, after, cock: c, left })).filter(([u]) => u >= c - 1e-6);
  const out = [[0.18, X.F(SIGN_RISE)], [0.5, X.F(SIGN_HELD)]];
  // (he arrives already in the coil: the vanish hides the change)
  if (strike.length) {
    const { e, ...coilPose } = strike[0][1];
    out.push([0.52, coilPose]);
  }
  return out.concat(strike);
}

export function meleeMoves(X) {
  const { TELL: { N, B, R, K }, punch, kick, elbow, shoulder, transform, strikeKeys, F, TUNING } = X;
  const RE = TUNING.reach;
  const ST = TUNING.stance, SG = TUNING.sign;
  /** A dash on a beat: from `from` of the windup to the impact, stopping `stop` m short, `max` m at most. */
  const dash = (max, from = 0.6, stop = 1.0) => ({ dash: { from, to: 1.0, stop, max }, close: 0 });
  const blink = (behind = 2.0) => ({ blink: { behind }, close: 1.0, track: 0.8 });
  /**
   * A beat out of THE SIGN: the strike `beat` (built with its cock >= 0.72) re-keyed with the sign before
   * it; he vanishes at u 0.5 to `where` (blink fields: { behind } | { at, r }) and covers what is left to
   * the hero's reach in a short step after the arrival (a dash from u SG.stepFrom: a close-in would be
   * spent walking at the hero during the sign, before the vanish).
   */
  const signed = (beat, where = { behind: SG.behind }) => {
    // (where the zone wants the hero: duelist/brain.js _ideal)
    const z = beat.zone, f = z?.fwd ?? 0;
    const reach = !z ? 1.5 : z.kind === 'ring' ? z.r * 0.55 + f : z.r * (z.kind === 'line' ? 0.72 : 0.66) + f;
    return {
      ...beat, keys: signKeys(X, { keys: beat.keys, cock: beat.cock ?? 0.76 }), blink: { ...where, sign: true },
      close: 0, track: 0.85, dash: { from: SG.stepFrom, to: 0.96, stop: reach, max: SG.step },
    };
  };

  // ---------------------------------------------------------------- the counter stances (the third wave)
  // A stance is a FEINT beat with a bait hold and `catch` (duelist/brain.js): a sword cut into it from
  // `from` of its windup is caught (the hero's blade thrown back) and the punish after it starts at once;
  // a stance nobody cut into ends the move at its impact and leaves him open. Each reads as a catch, not a
  // guard: the palms OPEN and forward (not fists by the chin), the weight settled; light is drawn into
  // the palms while he is catching (fx.stanceGlow).
  const STANCE = {
    // Still Water (form 1): sunk deep, both palms open and forward, the lead one high before the face
    // and the rear one low before the belly (not the fists at the chin of his guard), the weight back
    still: { yaw: -0.34, bY: -0.4, bZ: -0.08, pitch: -0.04, hip: -0.06, spX: -0.06, hdX: 0.04, rH: [0.12, -0.16, 0.44], rP: [-0.8, -0.8, -0.2], lH: [-0.06, 0.16, 0.52], lP: [0.8, -0.8, -0.1], sw: [0.0, 1.5], lF: [0.3, 0.38], rF: [-0.28, -0.34], lFy: 0.3, rFy: -0.6, rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7] },
    // Golden Mirror (form 2): upright, the lead palm open before him at the face, the rear fist at the hip
    mirror: { yaw: -0.36, bY: -0.1, bZ: -0.02, pitch: -0.02, hdX: 0.02, rH: [0.04, -0.3, 0.04], rP: [-0.8, -0.5, -0.5], lH: [0.0, 0.16, 0.52], lP: [0.8, -0.7, -0.1], sw: [0.3, 0.9], lF: [0.18, 0.26], rF: [-0.18, -0.2], lFy: 0.25, rFy: -0.5, rK: [-0.3, 0, 1], lK: [0.3, 0, 1] },
    // Thunder Mirror (form 3): square, the arms low and a little out, both hands open toward the hero
    thunder: { yaw: -0.08, bY: -0.12, bZ: -0.04, pitch: -0.04, spX: -0.04, hdX: 0.04, rH: [-0.1, -0.36, 0.3], rP: [-0.9, -0.4, -0.2], lH: [0.1, -0.36, 0.3], lP: [0.9, -0.4, -0.2], sw: [0.0, 0.2], lF: [0.2, 0.12], rF: [-0.2, -0.08], lFy: 0.2, rFy: -0.25, rK: [-0.3, 0, 1], lK: [0.3, 0, 1] },
  };
  /** A counter stance's keys: settling into it (0.4), held from the cock (0.8) to the end. */
  const stanceKeys = (P) => [
    [0.4, F({ ...P, bY: P.bY * 0.6, rH: P.rH.map((v, i) => (i === 2 ? v * 0.7 : v)), lH: P.lH.map((v, i) => (i === 2 ? v * 0.7 : v)) })],
    [0.8, F(P)], [1.0, F({ ...P, bY: P.bY - 0.02 })], [2.0, F(P)],
  ];
  /** The stance beat: a feint (no blow), held, catching from ST.from of its windup. */
  const stance = (P) => ({
    tell: N, windup: ST.windup, fixed: true, hold: ST.hold, active: 0.05, damage: 0, feint: true, catch: { from: ST.from, open: ST.open },
    part: 'palms', close: 0, track: 0.9, keys: stanceKeys(P),
  });

  /** The bolt (moves/kiShots.js's builder, its shape copied): the right hand raised by the ear, then
   *  flung out, two fingers pointing down the line (17 x 1.7 m; a perfect parry throws it back). */
  const BOLT = {
    coil: { yaw: -0.55, bY: -0.18, pitch: -0.04, spX: -0.06, rH: [-0.12, 0.36, 0.02], rP: [-0.7, 0.4, -0.4], lH: [-0.04, 0.06, 0.44], ...X.feet.OR },
    hit: { yaw: 0.2, bY: -0.22, bZ: 0.1, pitch: 0.06, hip: 0.12, rH: [0.06, 0.12, 0.64], rP: [-0.8, 0.0, -0.3], lH: [0.02, -0.04, 0.14], ...X.feet.PIVOT },
  };
  const bolt = (windup, damage, o = {}) => {
    const { cock = 0.7, ...extra } = o;
    const BL = TUNING.shots.bolt;
    return {
      tell: B, windup, active: 0.08, damage, knockback: 1.4, ki: 'bolt', zone: { kind: 'line', r: BL.range, w: BL.width }, part: 'fistR',
      close: 0, track: 0.92, keys: strikeKeys({ coil: BOLT.coil, hit: BOLT.hit, cock }), ...extra,
    };
  };

  /** The burst of his aura: crouched, the fists at his hips, then the arms thrown out (a ring round him). */
  const burstKeys = (cock = 0.7) => strikeKeys({
    cock,
    coil: { yaw: 0, bY: -0.4, pitch: 0.14, hdX: 0.2, rH: [-0.04, -0.4, 0.0], rP: [-0.8, -0.4, -0.6], lH: [0.04, -0.4, 0.0], lP: [0.8, -0.4, -0.6], rF: [-0.32, 0.0], lF: [0.32, 0.0], rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7], rFy: -0.3, lFy: 0.3 },
    hit: { yaw: 0, bY: -0.16, pitch: -0.16, hdX: -0.2, spX: -0.1, rH: [-0.42, 0.04, 0.16], rP: [-0.9, 0.2, -0.3], lH: [0.42, 0.04, 0.16], lP: [0.9, 0.2, -0.3], rF: [-0.32, 0.0], lF: [0.32, 0.0], rK: [-0.5, 0, 0.8], lK: [0.5, 0, 0.8], rFy: -0.3, lFy: 0.3 },
  });

  /** His answer to a streak of guards (DEFENSE.foeStreak), one per form: the first blow from where he
   *  stands, each of the others from another side of the hero (`flit`). */
  const storm = (form, kinds) => ({
    label: `Thousand Shadows${form > 1 ? ` (${form})` : ''}`, phase: form, weight: 0, counter: true, streak: true, cooldown: 0, band: [0, 6], recovery: 0.7,
    beats: kinds.map(([fn, kind], i) => (fn === 'kick' ? kick : punch)(kind, N, i ? 0.48 : 0.62, 12, i ? { flit: { r: 2.4 } } : { track: 0.7 })),
  });

  const M = {
    // ============================================================ form 1: the Challenger
    /** Eight Gates: jab, cross, knee, a roundhouse held a beat (a lock) or a back-fist, the low sweep,
     *  and the rising uppercut (a parry moment). */
    gates: {
      label: 'Eight Gates', phase: 1, weight: [2.6, 0, 0], cooldown: 6, band: [0, 3.6], recovery: 0.75,
      beats: [
        punch('jab', N, 0.48, 12),
        punch('cross', N, 0.34, 12),
        kick('knee', N, 0.36, 13),
        { pick: [kick('round', B, 0.44, 20, { lock: true, hold: [0.1, 0.3] }), punch('backfist', N, 0.34, 12)] },
        kick('sweep', N, 0.38, 13, { left: true }),
        punch('uppercut', B, 0.56, 22, { flare: true }),
      ],
    },
    /** Hundred Hands: a jab, six straight blows from alternating fists, and the palm thrust on a dash
     *  (a parry moment). */
    hundred: {
      label: 'Hundred Hands', phase: 1, weight: [2.4, 1.0, 0], cooldown: 8, band: [0, 3.2], recovery: 0.75,
      beats: [
        punch('jab', N, 0.5, 9),
        punch('cross', N, 0.34, 9),
        punch('jab', N, 0.34, 9, { step: 'L' }),
        punch('cross', N, 0.34, 9),
        punch('jab', N, 0.34, 9, { step: 'L' }),
        punch('cross', N, 0.34, 9),
        punch('jab', N, 0.34, 9, { step: 'L' }),
        { ...punch('palm', B, 0.44, 20, { flare: true, lock: true }), ...dash(2.4) },
      ],
    },
    /** Tiger Descends: a dashing elbow, a back-fist, and the axe kick that breaks the floor (red). */
    tiger: {
      label: 'Tiger Descends', phase: 1, weight: [2.8, 1.0, 0], cooldown: 7, band: [1.6, 6], recovery: 0.7, gapCloser: true,
      beats: [
        { ...elbow(N, 0.5, 15), ...dash(4, 0.6, 0.7) },
        punch('backfist', N, 0.36, 12),
        kick('axe', R, 0.62, 24, { knockdown: true, knockback: 2.4, ring: 2.6 }),
      ],
    },
    /** Iron Mountain: the shoulder check on a dash, and the double palm that throws you 9 m (links to
     *  Meteor Step when you land far). */
    ironMountain: {
      label: 'Iron Mountain', phase: 1, weight: [1.8, 0, 0], cooldown: 8, band: [0, 4], recovery: 0.7,
      beats: [
        { ...shoulder(N, 0.5, 14), ...dash(3, 0.55, 0.6) },
        punch('double', N, 0.4, 15, { knockback: 9 }),
      ],
    },
    /** Meteor Step: a flying kick across the gap (he is in the air as it lands: `air`). */
    meteorStep: {
      label: 'Meteor Step', phase: 1, weight: [2.0, 1.2, 1.0], cooldown: 3, band: [2.6, 7], recovery: 0.55, gapCloser: true,
      beats: [{ ...kick('flying', N, 0.5, 17), ...dash(5.5, 0.4, 1.0) }],
    },
    /** Comet Heel: a leap high over the gap and the heel brought down where you stand (red: roll). */
    cometHeel: {
      label: 'Comet Heel', phase: 1, weight: [2.2, 1.0, 0.8], cooldown: 9, band: [3.5, 13], recovery: 0.7, cat: 'area',
      beats: [{ ...kick('axe', R, 1.1, 28, { cock: 0.7 }), zone: { kind: 'ring', r: 2.8 }, ring: 2.8, knockdown: true, knockback: 3, leap: { from: 0.25, lock: 0.78, apex: 3.8 }, close: 0, track: 0.8 }],
    },
    /** Piercing Palm: a deep coil, then a palm driven home on a lunge. Red, a perilous thrust: roll INTO it. */
    piercingPalm: {
      label: 'Piercing Palm', phase: 1, weight: [2.4, 1.5, 1.0], cooldown: 6, band: [1.6, 6], recovery: 0.6, gapCloser: true,
      beats: [{ ...punch('palm', R, 0.64, 26, { cock: 0.8, mikiri: true, knockback: 2.5 }), zone: { kind: 'line', r: 2.4, w: 0.7 }, ...dash(2.8, 0.84, 0.8), track: 0.7 }],
    },
    /** Mountain-Splitting Fist: the CHARGED blow. The fist drawn back while the power gathers on it, a
     *  held beat that is never the same, then one long dashing cross. Black: dodge it. */
    splitFist: {
      label: 'Mountain-Splitting Fist', phase: 1, weight: [1.5, 0, 0], cooldown: 10, band: [2.4, 9], recovery: 0.8, gapCloser: true,
      beats: [{
        ...punch('cross', K, 1.45, 36, { cock: 0.86 }), fixed: true, hold: [0.1, 0.5], active: 0.14, knockback: 4, knockdown: true,
        zone: { kind: 'sector', r: 2.4, ang: 0.8 }, ...dash(7.5, 0.88, 1.2), track: 0.88,
      }],
    },

    // ============================================================ form 2: Golden Ascension
    /** Golden Gates: three blows, he is gone and behind you (a lock), two more, and the axe kick (red)
     *  or the uppercut (a parry moment). */
    goldenGates: {
      label: 'Golden Gates', phase: 2, weight: [0, 2.6, 1.4], cooldown: 6, band: [0, 3.8], recovery: 0.72,
      beats: [
        punch('jab', N, 0.48, 12),
        punch('cross', N, 0.34, 12),
        punch('hook', N, 0.36, 13),
        punch('palm', B, 0.5, 20, { lock: true, ...blink(2.0) }),
        punch('backfist', N, 0.36, 12),
        punch('cross', N, 0.34, 12),
        { pick: [kick('axe', R, 0.62, 24, { zone: { kind: 'ring', r: 2.8 }, ring: 2.8, knockdown: true, knockback: 2.4 }), punch('uppercut', B, 0.56, 22, { flare: true })] },
      ],
    },
    /** Vanishing Step: three blows, each out of a blink behind you (the first out of THE SIGN); the
     *  last a lock. */
    vanishStep: {
      label: 'Vanishing Step', phase: 2, weight: [0, 2.0, 1.2], cooldown: 8, band: [0, 12], recovery: 0.65,
      beats: [
        signed(punch('cross', N, 0.72, 14, { cock: 0.76 })),
        kick('round', N, 0.58, 14, { ...blink(2.0) }),
        punch('palm', B, 0.66, 24, { lock: true, ...blink(2.1) }),
      ],
    },
    /** Aura Burst: his aura thrown out round him (red: roll out of it). His AI favours it once you
     *  have stayed on him for a while (ascendant.js weigh). */
    auraBurst: {
      label: 'Aura Burst', phase: 2, weight: [0, 1.8, 0.9], cooldown: 9, band: [0, 3], recovery: 0.6, cat: 'area',
      beats: [{ tell: R, windup: 0.7, active: 0.14, damage: 20, knockback: 7, zone: { kind: 'ring', r: 4.5 }, ring: 4.5, part: 'feet', close: 0, track: 0.3, keys: burstKeys(0.7), burst: true }],
    },
    /** Sunbreaker: the CHARGED blow of the golden form: the fist drawn back while the gold gathers, a
     *  held beat, then a rushing punch across 12 m. Black: dodge it. */
    sunbreaker: {
      label: 'Sunbreaker', phase: 2, weight: [0, 1.1, 0], cooldown: 12, band: [3, 12], recovery: 0.8, gapCloser: true,
      beats: [{
        ...punch('cross', K, 1.5, 36, { cock: 0.86 }), fixed: true, hold: [0.1, 0.5], active: 0.14, knockback: 4, knockdown: true,
        zone: { kind: 'sector', r: 2.4, ang: 0.8 }, ...dash(12, 0.86, 1.2), track: 0.88, rush: true,
      }],
    },

    /** Sky Hammer: a blow, the rising uppercut that LAUNCHES you (thrown 11 m, knocked down), and he is
     *  waiting where you land: both fists brought down on you (red), a crater. */
    skyHammer: {
      label: 'Sky Hammer', phase: 2, weight: [0, 2.0, 1.0], cooldown: 10, band: [0, 3.6], recovery: 0.75,
      beats: [
        punch('jab', N, 0.48, 12),
        punch('uppercut', B, 0.58, 20, { knockback: 11, knockdown: true, launch: true }),
        punch('hammer', R, 0.7, 26, { blink: { land: true, side: 1.6 }, zone: { kind: 'ring', r: 3.0 }, ring: 3.0, knockdown: true, knockback: 2.6, close: 0, track: 0.5 }),
      ],
    },

    // ============================================================ form 3: Thunder Ascension
    /** Storm Waltz: five blows, each out of a blink to behind you (the first out of THE SIGN, the
     *  others a chain of afterimages), and a sixth that locks. */
    stormWaltz: {
      label: 'Storm Waltz', phase: 3, weight: [0, 0, 2.4], cooldown: 8, band: [0, 12], recovery: 0.65,
      beats: [
        signed(punch('cross', N, 0.72, 13, { cock: 0.76 })),
        kick('round', N, 0.54, 13, { ...blink(2.0) }),
        punch('hook', N, 0.54, 13, { ...blink(2.0) }),
        kick('front', N, 0.54, 13, { ...blink(2.0) }),
        punch('backfist', N, 0.54, 13, { ...blink(2.0) }),
        punch('palm', B, 0.6, 24, { lock: true, ...blink(2.1) }),
      ],
    },
    /** Thousand Hands: a jab, eight straight blows, and both fists brought down on the floor (red). */
    thousand: {
      label: 'Thousand Hands', phase: 3, weight: [0, 0, 2.6], cooldown: 9, band: [0, 3.2], recovery: 0.75,
      beats: [
        punch('jab', N, 0.5, 9),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (i % 2 ? punch('jab', N, 0.34, 9, { step: 'L' }) : punch('cross', N, 0.34, 9))),
        punch('hammer', R, 0.6, 24, { zone: { kind: 'ring', r: 3.2 }, ring: 3.2, knockdown: true, knockback: 2.6 }),
      ],
    },

    /** Heaven and Earth: the uppercut that launches you, the hammer where you land (red), the shock of
     *  his landing thrown out round him (red), and a palm on a dash as you rise (a parry moment). */
    heavenEarth: {
      label: 'Heaven and Earth', phase: 3, weight: [0, 0, 1.8], cooldown: 11, band: [0, 3.6], recovery: 0.7,
      beats: [
        punch('uppercut', B, 0.56, 20, { knockback: 11, knockdown: true, launch: true }),
        punch('hammer', R, 0.66, 26, { blink: { land: true, side: 1.6 }, zone: { kind: 'ring', r: 3.0 }, ring: 3.0, knockdown: true, knockback: 2.6, close: 0, track: 0.5 }),
        { tell: R, windup: 0.6, active: 0.14, damage: 20, knockback: 6, zone: { kind: 'ring', r: 4.4 }, ring: 4.4, part: 'feet', close: 0, track: 0.3, keys: burstKeys(0.7), burst: true },
        { ...punch('palm', B, 0.5, 22, { flare: true }), zone: { kind: 'line', r: RE.line, w: RE.lineW }, ...dash(5, 0.55, 0.9) },
      ],
    },
    /** Mirage: three FEINTS, each out of a blink to another side of you (a shape of him left at each:
     *  no glint, no blow; the first out of THE SIGN), then the real one from behind (red). */
    mirage: {
      label: 'Mirage', phase: 3, weight: [0, 0, 1.6], cooldown: 9, band: [2, 10], recovery: 0.65, cat: 'string', // (its three feints are not hits: the director would call it a single)
      beats: [
        { ...signed(punch('cross', N, 0.72, 0, { cock: 0.76 }), { at: -1.4, r: 2.3 }), feint: true, damage: 0 },
        { ...kick('round', N, 0.5, 0, { blink: { at: 1.4, r: 2.3 }, close: 0 }), feint: true, damage: 0 },
        { ...punch('hook', N, 0.5, 0, { blink: { at: 0.2, r: 2.4 }, close: 0 }), feint: true, damage: 0 },
        { ...punch('palm', R, 0.66, 26, { ...blink(2.0) }), zone: { kind: 'line', r: RE.line, w: RE.lineW }, knockdown: true, knockback: 2.4 },
      ],
    },
    /** Heavenfall: the CHARGED blow of the thunder form: a leap 4.5 m up and down onto you (black: dodge;
     *  a guard is emptied), and the shock of it runs out across the whole ring (terrain.js quake: roll
     *  through it as it reaches you). */
    heavenfall: {
      label: 'Heavenfall', phase: 3, weight: [0, 0, 1.1], cooldown: 14, band: [3, 13], recovery: 0.85, cat: 'area',
      beats: [{
        ...kick('axe', K, 1.5, 36, { cock: 0.7 }), fixed: true, zone: { kind: 'ring', r: 3.4 }, ring: 3.4, knockdown: true, knockback: 3.5,
        leap: { from: 0.2, lock: 0.8, apex: 4.5 }, close: 0, track: 0.85, quake: { from: 3.4, to: 14, speed: 9, damage: 22 },
      }],
    },

    // ============================================================ THE SIGN (the third wave)
    /** Sign Step (form 2): two fingers to the brow, he is gone, and a hook from behind you; a knee and a
     *  palm that locks. */
    signStep: {
      label: 'Sign Step', phase: 2, weight: [0, 1.6, 0.9], cooldown: 8, band: [0, 14], recovery: 0.65,
      beats: [
        signed(punch('hook', N, 0.8, 14, { cock: 0.76 })),
        kick('knee', N, 0.4, 13),
        punch('palm', B, 0.5, 22, { lock: true }),
      ],
    },
    /** Three Signs (form 3): a sign and he is at your LEFT (a cross), a sign and at your RIGHT (a round
     *  kick), a sign and BEHIND you: the axe kick that cracks the floor (red). Each blow out of its own sign. */
    threeSigns: {
      label: 'Three Signs', phase: 3, weight: [0, 0, 1.8], cooldown: 9, band: [0, 14], recovery: 0.7,
      beats: [
        signed(punch('cross', N, 0.8, 13, { cock: 0.76 }), { at: SG.side, r: SG.sideR }),
        signed(kick('round', N, 0.7, 13, { cock: 0.76 }), { at: -SG.side, r: SG.sideR }),
        signed(kick('axe', R, 0.72, 24, { cock: 0.76, knockdown: true, knockback: 2.4, ring: 2.6 })),
      ],
    },

    // ============================================================ the counter stances (the third wave)
    /** Still Water (form 1): he sinks, the palms open: cut into it and he catches the blade, then a
     *  cross and a palm on a dash (a lock). Wait, and he stands open. */
    stillWater: {
      label: 'Still Water', phase: 1, weight: [0.8, 0.4, 0], cooldown: 10, band: [0, 3.2], recovery: 0.6, cat: 'single',
      beats: [
        stance(STANCE.still),
        punch('cross', N, 0.46, 14, { track: 0.7 }),
        { ...punch('palm', B, 0.4, 22, { lock: true }), ...dash(2.4) },
      ],
    },
    /** Golden Mirror (form 2): the lead palm open before him: a cut into it is caught, he is gone and
     *  behind you, the uppercut LAUNCHES you, and he waits where you land (the hammer, red). */
    goldenMirror: {
      label: 'Golden Mirror', phase: 2, weight: [0, 0.7, 0.4], cooldown: 13, band: [0, 3.2], recovery: 0.75, cat: 'single',
      beats: [
        stance(STANCE.mirror),
        punch('uppercut', B, 0.56, 20, { knockback: 11, knockdown: true, launch: true, ...blink(2.0) }),
        punch('hammer', R, 0.7, 26, { blink: { land: true, side: 1.6 }, zone: { kind: 'ring', r: 3.0 }, ring: 3.0, knockdown: true, knockback: 2.6, close: 0, track: 0.5 }),
      ],
    },
    /** Thunder Mirror (form 3): the arms low, the hands open: a cut into it is caught; a bolt point-blank
     *  (a parry), then a sign, he is behind you, and the axe kick (red). */
    thunderMirror: {
      label: 'Thunder Mirror', phase: 3, weight: [0, 0, 1.2], cooldown: 11, band: [0, 3.2], recovery: 0.7, cat: 'single',
      beats: [
        stance(STANCE.thunder),
        bolt(0.48, 20),
        signed(kick('axe', R, 0.72, 24, { cock: 0.76, knockdown: true, knockback: 2.4, ring: 2.6 })),
      ],
    },

    // ============================================================ counters (out of his guard)
    riposte: {
      label: 'Riposte', phase: 1, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
      beats: [punch('cross', N, 0.46, 14, { track: 0.7 }), { ...punch('palm', B, 0.36, 20), ...dash(2.4) }],
    },
    riposte2: {
      label: 'Riposte (golden)', phase: 2, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
      beats: [punch('hook', N, 0.46, 13, { track: 0.7 }), punch('jab', N, 0.34, 13), { ...punch('palm', B, 0.36, 20), ...dash(2.4) }],
    },
    riposte3: {
      label: 'Riposte (thunder)', phase: 3, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
      beats: [signed(punch('cross', N, 0.72, 14, { cock: 0.76 })), { ...punch('palm', B, 0.36, 22), zone: { kind: 'line', r: RE.line, w: RE.lineW } }],
    },
    // (the third wave: more counters, one drawn at random out of his deflect: moves.js COUNTER_LISTS)
    /** A knee driven up into the opening, then a round kick. */
    riposteKnee: {
      label: 'Riposte (knee)', phase: 1, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
      beats: [kick('knee', N, 0.46, 13, { track: 0.7 }), kick('round', N, 0.36, 14)],
    },
    /** Gone and behind you (no sign: a counter is quick): a hook, then a palm (a line). */
    riposteVanish: {
      label: 'Riposte (vanish)', phase: 2, weight: 0, counter: true, cooldown: 0, band: [0, 5], recovery: 0.55,
      beats: [punch('hook', N, 0.5, 13, { ...blink(2.0) }), { ...punch('palm', B, 0.36, 20), zone: { kind: 'line', r: RE.line, w: RE.lineW } }],
    },
    /** A hop back out of reach, then a bolt down the line (a parry; a perfect parry throws it back). */
    riposteBolt: {
      label: 'Riposte (bolt)', phase: 3, weight: 0, counter: true, cooldown: 0, band: [0, 6], recovery: 0.6,
      beats: [{ ...bolt(0.5, 20), travel: [[0, 0], [0.45, -SG.hop], [1, -SG.hop]] }],
    },

    // ============================================================ the transformations
    ascend2: transform(2),
    ascend3: transform(3),
  };
  M.streakFlurry = storm(1, [['punch', 'cross'], ['kick', 'round'], ['punch', 'hook'], ['punch', 'backfist']]);
  M.streakFlurry2 = storm(2, [['punch', 'hook'], ['kick', 'side'], ['punch', 'cross'], ['kick', 'round']]);
  M.streakFlurry3 = storm(3, [['kick', 'round'], ['punch', 'cross'], ['kick', 'front'], ['punch', 'hook']]);
  return M;
}
