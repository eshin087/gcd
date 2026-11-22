// THE WYRM ANSWERS WHERE IT IS HIT (the impact pass's `react` piece, react.js). Every number of the
// drawn reaction lives here. Distances are metres of the struck point's displacement at a HEAVY blow
// and strength 1 (impactK('react')); a light cut is `weight.light` of that. Times are game seconds
// (a hit-stop holds game time at 2 - 4 %: the first pose is there in the hit's own tick and holds
// through the freeze; the recovery runs after it).
//
// The curves (react.js):
//   snap(t)   starts AT the peak in the hit's tick, comes back with one small overshoot: the release of
//             a damped spring, frequency `w` (rad / s), damping `z` (0.5 → ~16 % overshoot; back within
//             5 % after ~3.1 / (z w) s)
//   wave      the same snap reaching a point `travel` s per segment later (a whip running along the
//             neck or the tail), eased in over `ease` s so a far point does not pop
export const REACT = {
  // how much of a heavy blow's answer a cut gets (the slam, the charged cleave, the execution = heavy)
  weight: { light: 0.4, heavy: 1, crit: 1.25 },
  // the snap's spring: a light cut is a small quick give, a heavy blow a slower, deeper one
  spring: { light: { w: 26, z: 0.5 }, heavy: { w: 15, z: 0.45 } },
  ease: 0.03, // s: a delayed point's ease-in
  // a new hit's amplitude shrinks by this share of what is still moving in the same part (three light
  // cuts in a second stay three small gives, not a wobble that builds)
  stack: 0.6,
  stackMin: 0.35,
  maxAngle: 0.35, // rad: the most any one joint is turned by the reaction
  pool: 6, // reactions alive at once (the oldest is dropped)
  // while an attack's hit spheres ride the snout (pose.headExact: the bite, the lunge, the breath), the
  // head and neck answer at this share: the strike must stay where it is seen
  headExact: 0.5,

  // the head: the snout snaps away along the cut (back and up for a thrust into the face), the neck
  // carries it on a beat later and lets it come back
  head: { amp: 1.4, up: 0.55, top: 0.3, follow: 0.6, delay: 0.04, travel: 0.012 },
  // the neck: bent at once below the contact to carry it `amp` m; above it `carry` of that at once and
  // the rest as a whip running up to the head (`travel` s per segment), `whip` more at the head
  neck: { amp: 0.8, up: 0.15, carry: 0.5, travel: 0.028, whip: 0.4 },
  // chest / waist / hips: the trunk is shoved `shove` m along the blade's travel (the feet stay
  // planted), swings on the hips so the struck end goes `swing` m further (none for a blow on the rump),
  // and the struck side sinks `give` m; the neck holds `neckHold` of the head still, the tail base
  // `tailHold`, then a lash of `tailLash` m runs down to the tip. (`lever` m: a contact closer to its
  // joint than this turns it no more than one this far out would)
  body: { shove: 0.3, swing: 0.45, give: 0.25, neckHold: 0.7, tailHold: 0.85, tailLash: 0.35, travel: 0.03, lever: 2.5 },
  // a leg: the knee / elbow is driven along the cut and down (the foot stays), the body dips to that
  // side (`dip` m at the leg's root)
  leg: { amp: 0.55, down: 0.4, dip: 0.15, lever: 2 },
  // a wing: the wrist jerks along the cut and down, the hand folds in toward the body a little
  wing: { amp: 1.1, down: 0.4, fold: 0.5 },
  // the tail: as the neck, a lash running from the contact to the tip, `grow` more at the tip
  tail: { amp: 0.9, carry: 0.4, travel: 0.022, grow: 0.8 },

  // the flinch the wyrm had before this piece (dragon.js / ai.js: the head pushed along the blow) stays
  // in the simulation (its hurt spheres and attacks are measured on it); with the piece on its LOOK is
  // taken back off the drawn head, by this share of the strength (1: all of it at strength >= 1)
  cancelOld: 1,
};
