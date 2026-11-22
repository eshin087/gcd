// The Cinder Wyrm's build (?wyrmLook=0|a|b|c): the same wyrm, the same letters, colours and wings, on a
// leaner frame. The owner (2026-11-19, after three full redraws were turned down: "i dont like any of
// the remakes"): "i want the dragon to look more menacing, a bit more slender", and picked C from the
// rendered sheets (2026-11-20, ADR-123).
//
//   c  LEAN + RAGGED   THE WYRM AS IT SHIPS (nothing set): b, and quills: a mane down the neck, long
//                      thin spines down the back and the tail
//   0  the wyrm before this pass (no number here is used, no object is added)
//   a  LEAN            a tucked waist, a shallower chest, thinner neck, limbs and tail, longer talons
//   b  LEAN + FIERCE   a, and a narrower head with long fangs, long swept horns, a longer frill,
//                      carried high on a neck that rises instead of coiling
//
// Everything is drawn only (model.js): joints, bone lengths, hit volumes and timings do not move. One
// thing is not only drawn: `rest`, the neck's shape while it stands (rig/anim.js). b and c carry the
// head higher between attacks; every attack keeps its own measured neck.
//
// A build is numbers:
//   barrel  { chest, loins, rump }: [width, depth] of each part of the trunk (1 = before; the back's
//           line stays where it is, the belly rises)
//   limb / neck / tail   girth of the legs, the neck, the tail's root
//   talon   length of the talons
//   head    { size (model.js HEAD_VIS), narrow (its width), horn, fang, frill, jawFrill, eye } or null
//   rest    { neck: { pitch0, pitchStep, pitchCurve }, headDip }: the neck's resting shape (rig/anim.js
//           REST_POSE.neck is the coiled S of before) or null
//   quill   length of the spines of the neck, back, tail and the backs of the limbs; `mane` adds a
//           splayed pair of thin quills to every blade of the back

export const WYRM_LOOKS = ['0', 'a', 'b', 'c'];
export const WYRM_LOOK_SHIPPED = 'c';
let LOOK = WYRM_LOOK_SHIPPED;
try {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const v = String(q.get('wyrmLook') ?? q.get('wyrmlook') ?? '').toLowerCase();
  if (WYRM_LOOKS.includes(v)) LOOK = v;
} catch {
  /* headless */
}

const LEAN = {
  name: 'lean',
  barrel: { chest: [0.9, 0.8], loins: [0.76, 0.68], rump: [0.86, 0.8] },
  limb: 0.76,
  neck: 0.74,
  tail: 0.72,
  talon: 1.25,
  head: null,
  rest: null,
  quill: 1,
  mane: false,
};
const FIERCE = { size: 1.45, narrow: 0.8, horn: 1.28, fang: 1.7, frill: 1.5, jawFrill: 1.8, eye: 1.5 };
// the head carried high: the neck rises steeply and arches over at the top, so its last segment points
// down toward the nose-down head (today: up, back and over). (ADR-127: the first high neck still pointed
// ~16° up at the top while the head hung ~37° nose-down: a ~56° hinge at the skull, a broken neck.)
const HIGH = { neck: { pitch0: 1.6, pitchStep: -0.06, pitchCurve: -0.045 }, headDip: 0.2 };
const BUILDS = {
  a: LEAN,
  b: { ...LEAN, name: 'lean + fierce', head: FIERCE, rest: HIGH },
  c: { ...LEAN, name: 'lean + ragged', head: { ...FIERCE, frill: 2.0 }, rest: HIGH, quill: 1.5, mane: true },
};

/** The build in use ('0' | 'a' | 'b' | 'c'; 'c' with nothing set); read once from ?wyrmLook=. */
export const wyrmLookId = () => LOOK;
/** Its numbers, or null for the wyrm before this pass ('0'). */
export const wyrmLook = () => BUILDS[LOOK] ?? null;
/** Pick the build the NEXT built wyrm has (tests, the Lab). Returns false for an unknown name. */
export function setWyrmLook(k) {
  if (!WYRM_LOOKS.includes(k)) return false;
  LOOK = k;
  return true;
}
