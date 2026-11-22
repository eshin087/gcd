// The Clockwork Marshal's combo links (duelist/brain.js header, director.js linkFor). When a move ends on
// its own, the first entry whose `when` holds (near / mid / far / front / side / behind / away / any),
// whose `chance` passes ([phase 1, 2, 3, 4] or one number) and whose target is usable starts straight out
// of it at `cut` of the recovery. The suit's links are slow and few (it is heavy); the pilot's strings
// run into her lunge or her parting shot. The fairness guard keeps two cues that need different answers
// at least pressure.guard.sep apart whatever links.
const far = (to, chance, o) => ({ to, when: 'far', chance, ...o });
const near = (to, chance, o) => ({ to, when: 'near', chance, ...o });
const behind = (to, chance, o) => ({ to, when: 'behind', chance, ...o });
const away = (to, chance, o) => ({ to, when: 'away', chance, ...o });
const SUIT = (c) => [c, c, c, 0];
const P4 = (c) => [0, 0, 0, c];

export const LINKS = {
  // ---- the suit
  yardSweep: [behind('treadStomp', SUIT(0.6)), far('fireLance', SUIT(0.35)), near('worksHammer', [0, 0.2, 0.3, 0])],
  ramThrust: [near('yardSweep', SUIT(0.5)), far('fireLance', SUIT(0.3))],
  ironCharge: [far('fireLance', SUIT(0.55)), near('yardSweep', SUIT(0.3))],
  fireLance: [far('ironCharge', SUIT(0.4)), far('ramThrust', SUIT(0.25))],
  worksHammer: [behind('treadStomp', SUIT(0.5)), far('fireLance', SUIT(0.3))],
  treadStomp: [near('yardSweep', SUIT(0.3)), far('fireLance', SUIT(0.3))],
  fireSweep: [behind('ventBurst', [0, 0.4, 0.5, 0]), far('ironCharge', SUIT(0.3))],
  ventBurst: [far('fireLance', SUIT(0.4)), near('worksHammer', SUIT(0.3))],
  grindingWheel: [far('mortarRain', [0, 0, 0.3, 0]), far('fireLance', SUIT(0.3))],
  mortarRain: [near('yardSweep', SUIT(0.4)), far('ironCharge', SUIT(0.4))],
  // ---- the pilot
  fuseCuts: [away('marshalLunge', P4(0.5)), near('leapShot', P4(0.35)), far('lastCharge', P4(0.4))],
  sparkSteel: [away('marshalLunge', P4(0.5)), near('lowReap', P4(0.3)), far('scatterShot', P4(0.4))],
  marshalLunge: [near('fuseCuts', P4(0.35)), far('scatterShot', P4(0.35))],
  lastCharge: [near('leapShot', P4(0.4)), near('sparkSteel', P4(0.3))],
  leapShot: [far('marshalLunge', P4(0.45)), far('lastCharge', P4(0.35))],
  scatterShot: [far('lastCharge', P4(0.4)), far('marshalLunge', P4(0.4))],
  lowReap: [near('fuseCuts', P4(0.35)), away('marshalLunge', P4(0.4))],
};
