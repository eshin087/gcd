// THE FEEL OF THE SWINGS (`?feel=snap|weight|flow`, ADR-240; the owner, 2026-11-26: "make variations of
// different combos and left hand to try to figure out the look and natural good animation and feel of auto
// attack. same with the heavy attack on the lagginess and attack variation"; asked, they chose the feel of
// today's moves, three variations, each with its own left hand, the heavies faster and weightier). Production's
// own clips, every one of them (the light combo and its looks, the heavies, the sprint and roll attacks, the
// charged cleave, One Breath): the same keys, played on a different clock inside the same windup / active /
// recovery (`warp`, per phase), with the body's sink and turn scaled (`gain`) and its lead ahead of the hand
// (`lead`). The hit lands in the same frames, every number is the same; only how the motion is spent changes.
//   snap    crisp: the coil reached early and held, the cut leaving fast and stopping clean, a quick settle;
//           the free hand behind his back (offHand.js `back`)
//   weight  grounded: a slow load into the coil, a cut that accelerates into the contact, the finish held
//           before he rises; a deeper sink and a bigger turn, the hips further ahead; the free hand loose at
//           his side (`side`)
//   flow    fluid: no holds, an even cut that runs on into the follow-through and home; a little more turn,
//           the hips a little ahead; production's free-hand gestures pulled in (`quiet`)
//   iai     combo A's: the coil early and held, a crisp cut, the finish held while its ending slash flashes, then he
//           rises; the hand at his left hip (offHand.js `belt`)
// '0' (the default) is production's. A look's fields:
//   warp   [windup, active, recovery]: each a curve name (CURVES) mapping the phase's own 0..1 to the clip's
//   gain   { by, hip, sy, sx }: × the keyed sink, hips' turn, chest's turn and lean (eased in over the windup's
//          first half, so the entry pose is where it starts)
//   lead   × the clip's lead (s the hips and the chest run ahead of the hand)
//   hand   the free hand's look it wears unless `?offhand=` picks one (offHand.js)

const CURVES = {
  lin: (x) => x,
  early3: (x) => 1 - (1 - x) ** 3, // there early, then held
  early2: (x) => 1 - (1 - x) ** 2,
  smoother: (x) => x * x * x * (x * (6 * x - 15) + 10), // a slow start and a slow arrival
  smooth: (x) => x * x * (3 - 2 * x),
  late16: (x) => x ** 1.6, // accelerating into the end
  late18: (x) => x ** 1.8, // the start held
};
export const FEELS = {
  snap: { warp: ['early3', 'early2', 'early2'], gain: { by: 1, hip: 1, sy: 1.05, sx: 1 }, lead: 1, hand: 'back' },
  weight: { warp: ['smoother', 'late16', 'late18'], gain: { by: 1.6, hip: 1.2, sy: 1.2, sx: 1.3 }, lead: 1.6, hand: 'side' },
  flow: { warp: ['lin', 'smooth', 'early2'], gain: { by: 1.1, hip: 1.1, sy: 1.15, sx: 1.1 }, lead: 1.3, hand: 'quiet' },
  // combo A's (the impact pass, ADR-240): the coil reached early and held, a crisp cut, and the finish HELD while
  // its ending slash flashes before he rises (the snap's quick settle hid the 'already cut' beat); a little more
  // sink and turn, the hips a little ahead
  iai: { warp: ['early3', 'early2', 'late18'], gain: { by: 1.15, hip: 1.1, sy: 1.1, sx: 1.1 }, lead: 1.2, hand: 'belt' },
};
export const FEEL_IDS = ['0', 'snap', 'weight', 'flow', 'iai'];
let feelNow = '0';
/** The swings' feel now ('0' production's, or a FEELS key). */
export const feelMode = () => feelNow;
/** Its data, or null for production's. */
export const feelLook = () => (feelNow === '0' ? null : FEELS[feelNow]);
let handOver = null;
/** The free hand 'auto' wears (offHand.js): a combo's own (combos.js, setFeelHand), else the feel's, else null. */
export const feelHand = () => handOver ?? feelLook()?.hand ?? null;
/** A combo's hand over its feel's (null: the feel's). */
export function setFeelHand(h) {
  handOver = typeof h === 'string' ? h : null;
}
/** Pick it (live from the next swing); false for an unknown id. */
export function setFeel(m) {
  const id = String(m);
  if (!FEEL_IDS.includes(id)) return false;
  feelNow = id;
  return true;
}
{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('feel') : null;
  if (q) setFeel(q);
}
/** A clip phase u (0..3) on the feel's clock: each phase's own 0..1 through its curve; u itself without one. */
export function warpPhase(u, F = feelLook()) {
  if (!F || !(u > 0)) return u;
  const i = u < 1 ? 0 : u < 2 ? 1 : 2;
  if (i === 2 && u >= 3) return u;
  const f = CURVES[F.warp[i]] ?? CURVES.lin;
  return i + f(u - i);
}
