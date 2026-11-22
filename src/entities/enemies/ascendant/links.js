// Tian Lei's combo links (duelist/brain.js header, director.js linkFor; the Lord's links.js explains
// the format). When a move ends on its own, the first entry whose `when` holds (near < 3.3 m, mid < 6 m,
// far beyond; front / side / behind; away; guarding; any), whose `chance` roll passes ([form 1, 2, 3]
// or one number) and whose target is usable in this form starts straight out of it, at `cut` of the
// recovery (default TUNING.pressure.linkCut). Up to pressure.chainDepth moves in a row, then a breather.
// A target that is not in the form's moveset is passed over. The far / away pursuits first (a hero he
// threw or who backed off is chased down), then mid range, then close. The second wave adds its own
// moves' entries here (its ki / terrain moves as pursuits and as what a string is followed by).

const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const mid = (to, chance, o) => ({ to, when: 'mid', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });
/** A chance in one form only. */
const f1 = (c) => [c, 0, 0], f2 = (c) => [0, c, 0], f3 = (c) => [0, 0, c];

/** After a blow, a hero who is far: he crosses the gap (the flying kick, the leap, the blinks). */
const PURSUE = [
  far('vanishStep', [0, 0.5, 0.35]),
  far('stormWaltz', f3(0.55)),
  // (the third wave: the sign, he is gone, and the blow from behind)
  far('signStep', [0, 0.4, 0.3]),
  far('threeSigns', f3(0.4)),
  far('cometHeel', [0.3, 0.3, 0.3]),
  far('meteorStep', [0.5, 0.4, 0.35]),
  // (or he answers the distance from where he stands: a beam down the line, the floor torn up at him)
  far('risingTide', f1(0.25)),
  far('tideSweep', [0, 0.15, 0.15]),
  far('ringBreaker', [0, 0.2, 0.2]),
  far('tileKick', [0.2, 0.15, 0]),
  far('sunbreaker', f2(0.25)),
  far('mirage', f3(0.45)),
  far('heavenfall', f3(0.25)),
  away('meteorStep', [0.45, 0.4, 0.35]),
  away('tiger', [0.4, 0.35, 0]),
  away('vanishStep', [0, 0.4, 0.4]),
  away('signStep', [0, 0.4, 0.3]),
  away('threeSigns', f3(0.4)),
  mid('tiger', [0.4, 0.35, 0]),
  mid('piercingPalm', [0.5, 0.35, 0.3]),
  mid('meteorStep', [0.35, 0.3, 0.3]),
  mid('splitFist', f1(0.3)),
  mid('cometHeel', f1(0.4)),
  mid('vanishStep', [0, 0.35, 0.35]),
  mid('mirage', f3(0.35)),
];
/** Close in: another string of the form, or the burst of his aura when the hero will not leave. */
const CLOSE = [
  near('piercingPalm', f1(0.35)),
  near('auraBurst', [0, 0.2, 0.25]),
  near('skyHammer', [0, 0.3, 0.15]),
  near('heavenEarth', f3(0.3)),
  near('tiger', f1(0.45)),
  near('ironMountain', f1(0.3)),
  near('hundred', [0.3, 0.2, 0]),
  near('gates', f1(0.3)),
  near('goldenGates', [0, 0.3, 0.25]),
  near('thousand', f3(0.35)),
  // (the third wave: a counter stance out of a string is a trap: rarely, and only when nothing else ran)
  near('stillWater', [0.12, 0.06, 0]),
  near('goldenMirror', f2(0.12)),
  near('thunderMirror', f3(0.12)),
];
const melee = (...first) => [...first, ...PURSUE, ...CLOSE];

/**
 * AFTER A RED THING OF HIS (the shots agent's rule): a disc, a cage, the volley, a beam, the floor torn
 * up at the hero. The hero's answer was a roll: he follows with a red blow or keeps his distance,
 * never a guard string inside its window (a white cue 0.4 s after a red one asks two answers at once).
 * Only the entries listed: none of PURSUE / CLOSE.
 */
const AFTER_RED = [far('meteorStep', [0.45, 0.4, 0.35]), mid('piercingPalm', [0.4, 0.35, 0.3]), near('auraBurst', [0, 0.45, 0.4])];
/** After his volleys at range (blue / white blasts, bolts): he closes, by a blink or the flying kick. */
const AFTER_VOLLEY = [far('vanishStep', [0, 0.45, 0.35]), far('stormWaltz', f3(0.45)), mid('meteorStep', [0.4, 0.35, 0.3])];
/** After a beam (the hero rolled out of its line, or is down at its end): the chase across the ring. */
const AFTER_BEAM = [far('meteorStep', [0.5, 0.4, 0.3]), far('vanishStep', [0, 0.45, 0.35]), far('mirage', f3(0.4)), mid('piercingPalm', [0.35, 0.3, 0.3])];

export const LINKS = {
  // --- his ki (kiShots.js / kiBeam.js) and the floor (terrain.js)
  sunWheel: AFTER_RED,
  stormCage: AFTER_RED,
  // (the third wave: the great orb and the barrage from the air end at range, the hero rolled or held)
  skyLantern: AFTER_RED,
  rainingSuns: AFTER_RED,
  skyVolley: AFTER_RED,
  ringBreaker: AFTER_RED,
  stoneStorm: AFTER_RED,
  goldenRain: AFTER_VOLLEY,
  scatter: AFTER_VOLLEY,
  spiritShot: AFTER_VOLLEY,
  lance: AFTER_VOLLEY,
  tileKick: AFTER_VOLLEY,
  risingTide: AFTER_BEAM,
  tideSweep: AFTER_BEAM,
  twinTide: AFTER_BEAM,
  // (the great beam ends in the clash, his reel or the hero thrown 12 m: no link; Thunder Gates and
  // Blast Dance are strings in reach: as his melee)
  thunderGates: melee(),
  blastDance: melee(),
  // --- his melee

  gates: melee(),
  hundred: melee(),
  tiger: melee(),
  // Iron Mountain's double palm throws the hero 9 m: the flying kick after him
  ironMountain: melee(far('meteorStep', 0.85, { band: false }), mid('meteorStep', 0.6)),
  meteorStep: melee(near('gates', f1(0.45)), near('goldenGates', f2(0.45)), near('thousand', f3(0.45))),
  cometHeel: melee(near('hundred', [0.4, 0.3, 0]), near('thousand', f3(0.4))),
  piercingPalm: melee(),
  splitFist: melee(),
  goldenGates: melee(),
  vanishStep: melee(),
  auraBurst: melee(far('meteorStep', 0.5), far('vanishStep', [0, 0.5, 0.5])),
  sunbreaker: melee(),
  stormWaltz: melee(),
  thousand: melee(),
  // the launches: the hero thrown 9 - 11 m and knocked down: the chase
  skyHammer: melee(far('vanishStep', [0, 0.6, 0.4]), far('meteorStep', 0.6), mid('meteorStep', 0.5)),
  heavenEarth: melee(far('stormWaltz', f3(0.5)), far('mirage', f3(0.5)), mid('mirage', f3(0.4))),
  mirage: melee(),
  heavenfall: melee(near('thousand', f3(0.4)), near('heavenEarth', f3(0.35))),
  // --- the third wave: the sign and the counter stances
  signStep: melee(),
  threeSigns: melee(),
  stillWater: melee(),
  // (Golden Mirror's uppercut throws the hero 11 m and the hammer meets him there: as Sky Hammer)
  goldenMirror: melee(far('vanishStep', [0, 0.5, 0.4]), far('signStep', [0, 0.4, 0.3]), mid('meteorStep', 0.5)),
  thunderMirror: melee(),
};
