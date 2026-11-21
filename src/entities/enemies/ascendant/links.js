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
  far('cometHeel', [0.3, 0.3, 0.3]),
  far('meteorStep', [0.5, 0.4, 0.35]),
  far('sunbreaker', f2(0.25)),
  far('mirage', f3(0.45)),
  far('heavenfall', f3(0.25)),
  away('meteorStep', [0.45, 0.4, 0.35]),
  away('tiger', [0.4, 0.35, 0]),
  away('vanishStep', [0, 0.4, 0.4]),
  mid('tiger', [0.4, 0.35, 0]),
  mid('piercingPalm', [0.35, 0.3, 0.3]),
  mid('meteorStep', [0.35, 0.3, 0.3]),
  mid('splitFist', f1(0.2)),
  mid('cometHeel', f1(0.3)),
  mid('vanishStep', [0, 0.35, 0.35]),
  mid('mirage', f3(0.35)),
];
/** Close in: another string of the form, or the burst of his aura when the hero will not leave. */
const CLOSE = [
  near('auraBurst', [0, 0.2, 0.25]),
  near('skyHammer', [0, 0.3, 0.15]),
  near('heavenEarth', f3(0.3)),
  near('tiger', f1(0.3)),
  near('ironMountain', f1(0.3)),
  near('hundred', [0.3, 0.2, 0]),
  near('gates', f1(0.3)),
  near('goldenGates', [0, 0.3, 0.25]),
  near('thousand', f3(0.35)),
];
const melee = (...first) => [...first, ...PURSUE, ...CLOSE];

export const LINKS = {
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
};
