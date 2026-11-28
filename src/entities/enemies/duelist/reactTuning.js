// REACT (the impact pass, combat/impact.js `react`): a struck duelist's body answers by WHERE it was
// hit and by the blade's travel. A drawn, additive layer like the jolt and the shudder (duelist/
// react.js): it never moves his hurt spheres, his hit stun, his shove, his guard or his move's clock.
// Every angle is radians, every distance metres of the upright model (he is drawn drawScale x that),
// and every number is the reaction at its PEAK for a light cut at strength 1 (impactK('react')).
//
// The time line (game time, so the hit-stop's freeze holds it):
//   snap    the share of the peak shown in the hit's own tick, the frame the freeze holds (the cut's
//           line and his spray are drawn on that body: the struck part may move only a few cm, STYLE.md
//           "A cut that lands" holds it within ~0.09 m: `snapM` m is the most the snap may carry the
//           struck surface off the contact; a bigger reaction shows a smaller share in the freeze)
//   rise    s from the snap to the peak (after the freeze); `heavyRise` for a heavy blow (a bigger swing
//           over more frames: no part of him jumps)
//   back    s from the peak back to rest; `heavyBack` for a heavy blow
//   hipLag  s the hips trail the chest (body hits)
export const REACT = Object.freeze({
  snap: 0.4,
  snapM: 0.06,
  rise: 0.07,
  heavyRise: 0.1,
  back: 0.3,
  heavyBack: 0.46,
  hipLag: 0.045,
  // a heavy blow (slam, cleave, a heavy chain cut, the execution's thrust, a crushed guard): all of it
  // larger; a crit a little more; a cut of the hero's flurry (`reel`: he is not shoved) a little less
  heavyK: 1.55,
  critK: 1.12,
  reelK: 0.7,
  // the head: knocked along the blade's travel (sideways for a cut across, back for a thrust)
  //   tilt   the head rolls over along the travel   yaw   the face turned with a sideways cut
  //   neck   the shoulders follow (the spine, along the same line)   neckYaw  the chest turns a little
  head: { tilt: 0.26, yaw: 0.24, neck: 0.1, neckYaw: 0.06, shift: 0.015 },
  // the body: twisted about the spine with the cut (the struck shoulder back, the other round)
  //   twist   at |torque| 1: the contact `arm` m off the spine, the blade across it
  //   lean    the chest leans with the blow's sideways part    hips  the share of the twist the hips take (late)
  //   low     a cut at the belly / hips: the share of the twist that goes into the hips at once
  //   cut     the blow's push is into him (the hero's drive) plus this much of the blade's travel
  //   fold    a thrust: the hips go back (m), the chest folds over the point (rad), the head lifts
  //           to keep his eyes on the hero, the knees soften (m)
  body: { twist: 0.26, arm: 0.2, lean: 0.07, hips: 0.35, low: 0.55, cut: 0.45, shift: 0.02,
    fold: { hips: 0.065, chest: 0.2, pelvis: 0.07, head: 0.1, drop: 0.02 } },
  // a leg: that knee buckles, he drops on that side and catches himself
  //   drop    m the body sinks    roll   rad the hips roll down onto the struck side
  //   catch   the share of the roll the chest takes back (he keeps his head over his feet)
  //   pitch   the body tips forward over the bent knee   shift  m toward the struck side
  leg: { drop: 0.065, roll: 0.12, catch: 0.7, pitch: 0.06, shift: 0.015 },
  // an arm (CONTACT, ?contact=a: the struck capsule says so): a body hit on the chest, its twist `twist` x
  // (the shoulder is far off the spine), that shoulder dropped (`roll`) and back (`pitch`, rad), the head
  // turned away from it (`head`)
  arm: { twist: 1.35, roll: 0.1, pitch: -0.05, head: 0.08 },
  // where it answers, by the drawn contact's height on the upright body (m over his feet: the hurt
  // spheres' head 1.3 - 1.7, chest 0.8 - 1.4, hips 0.5 - 1.1, shins 0.1 - 0.5): over `head` the head
  // (over `headPart` when the hit test says head), under `leg` a leg (under `legPart` when it says
  // leg); a 'leg' hit drawn higher is a body hit that buckles the knee `legMix` of a leg hit. The
  // body's twist goes into the chest above `high`, into the hips below `low`
  zones: { head: 1.4, headPart: 1.22, leg: 0.45, legPart: 0.62, legMix: 0.5, low: 0.8, high: 1.25 },
  // thrust-ness when the blow does not say (takeHit reads the hero's attack: a `point` / `execute`
  // contact is a thrust): how far the blade's travel runs along the hero's facing [from, to]
  thrust: [0.93, 0.99],
  // the slots: a new hit while one is still on adds to it (the oldest, faintest one is dropped)
  slots: 3,
  // the most any joint is turned in all (rad) and the body moved (m), whatever adds up
  maxAngle: 0.7,
  maxShift: 0.14,
  // a heavy blow that shoves him: his feet skid, a little dust kicked up at each foot (small glyph
  // particles, one letter cell; few). Per boss: its floor's dust, or null where there is none
  dust: { perFoot: 3, size: [0.12, 0.17], life: [0.32, 0.55], speed: [0.7, 1.6], up: [0.25, 0.7], glyphs: ".,'`" },
  // per boss (kit.id): `k` scales the whole reaction (the Starless Lord is a heavier man), `dust` the
  // colour of his floor's dust [start, end] (linear rgb) or null
  kits: {
    ashDisciple: { k: 1, dust: [[0.3, 0.28, 0.26], [0.12, 0.11, 0.1]] },
    starlessLord: { k: 0.82, dust: [[0.22, 0.2, 0.22], [0.08, 0.07, 0.08]] },
    ascendant: { k: 1, dust: [[0.34, 0.32, 0.28], [0.13, 0.12, 0.1]] },
  },
});
