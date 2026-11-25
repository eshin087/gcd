// The five heavy branches as INSTANT cuts (`?lights=blink`: combat.js setLights swaps HEAVY[0..4]'s
// look to HEAVY_BLINK; the charged cleave keeps its own). The owner (2026-11-25): "the heavy attack also
// needs to be instant and feel weight", and asked for more weight, a more obvious cut, the lone heavy as a
// slash and no whirl. Each heavy keeps its clock, damage, dash / lunge / leap and its JOB (combat.js, the
// comment over HEAVY); what changes is the picture. A light FLOWS; a heavy LANDS (BEATS, `heavyCut`):
//   both hands on the grip (`two: 1` on every key that places the hand), the free hand closed on it
//   a long STILL hold of the coil through the windup (two equal keys, from u 0.4 to the cut)
//   the cut in two or three frames, wide: the blade sweeps 150-220° across his whole front
//   then the weight LANDS: two or three frames in which the hips drop, the chest leans in and both turn
//   on past the cut while the blade carries on a little and brakes; a HARD STOP (an equal key right
//   after it), a long still hold of the finish, and a slow way home (`home` 0.62)
//   the arms long through the cut (at least 0.8 of their reach at its end), the wrists under 60°
//   a thick, long violet line and a kick of the camera along the cut (`slashLook: 'heavy'`, blinkFx.js)
// The poses are written by hand the way two arms swing a sword (the hands travel an arc round the
// shoulders, out in front of him; `rp` keeps the sword elbow down under the grip); the line is the chord
// of the cut (blinkFx.js). Clip format: swings.js's header; `slash`: blinkFx.js's header. Spread into
// SWINGS. Each stroke is its own plane and differs from the light hit it follows:
//   Piercing Gale       (alone) the dash carries him in with the blade held up over his right shoulder,
//                       still; at the dash's end one big falling diagonal from high right to past his left
//                       hip: he arrives and the line is already across him (a slash now, not the thrust:
//                       its contact is drawn as a sweep)
//   Rising Crescent     (after the falling diagonal) sunk at the left hip, still; one steep rising cut to
//                       high over his right shoulder (it throws a duelist out of what he is doing)
//   Whirling Tempest    (after the level backhand) wound up to his right with the blade behind him, still;
//                       one level forehand at the waist that unwinds the whole torso, the blade crossing
//                       more than 200° round him: a blade across his whole front and both sides. No turn
//                       of the feet: the whirl is gone (the owner: no twirls, no spins)
//   Mountain Splitter   (after the other diagonal) the blade up behind the left shoulder, still; one steep
//                       falling cut down to beside the right foot, the deepest drop of the five
//   Earthbreaker        (after the thrust) the leap kept (its `hop`): the blade straight up over his head
//                       through it, then one instant vertical cut down into the ground ahead as he lands;
//                       the shards burst where the point went in (player.js _slamImpact)

/** The heavy's beats (clip phase u: 0-1 the windup, 1-2 the active frames, 2-3 the recovery; a clip may
 *  give its own `beats`): the coil reached at `coil[0]` (still moving), settled at `coil[1]` and held
 *  dead still to `coil[3]` (four equal keys: the spline's tangents are zero through the hold), the cut's
 *  three keys (its last the end of the cut, where the line ends), the weight landing, the hard stop held
 *  from `stop[0]` to `stop[1]`, and the finish still held at `rest` (a hair settled) before `home` takes
 *  him back. */
export const BEATS = { wind: 0.2, coil: [0.4, 0.48, 1.12, 1.2], cut: [1.3, 1.41, 1.52], land: 1.64, stop: [1.76, 1.88], rest: 2.62 };
const TWO = { two: 1, hs: 0 };
// (`lead`: the hips run half a frame ahead of the hand, not two: in a cut two frames long they would turn
// and sink before the blade moved, and the weight would land before the cut)
const OPTS = { home: 0.62, slashLook: 'heavy', lead: [0.008, 0] };

/** A heavy clip from its poses (each a key's fields without `u`): `wind` (optional: a way into the coil
 *  for the blade, so it does not swing through the wrist on the way), `coil`, `cut` [3], `land`, `stop`;
 *  both hands go on the grip wherever the hand is placed. */
function heavyCut(opts, P) {
  const B = { ...BEATS, ...opts.beats }, k = (u, f) => ({ u, ...f, ...(f.h ? TWO : null) });
  const rest = { ...P.stop, ...(P.stop.by != null ? { by: P.stop.by + 0.02 } : null) };
  return {
    ...OPTS,
    ...opts,
    // (the line: from the first frame the blade has left the coil to the cut's end)
    slash: [[B.cut[0] - 0.06, B.cut[2]]],
    keys: [
      ...(P.wind ? [k(B.wind, { ...P.wind, lp: [0.7, -0.6, 0.3] })] : []),
      ...B.coil.map((u, i) => k(u, i ? P.coil : { ...P.coil, lp: [0.7, -0.6, 0.3] })),
      ...P.cut.map((f, i) => k(B.cut[i], f)),
      k(B.land, P.land),
      ...B.stop.map((u) => k(u, P.stop)),
      k(B.rest, rest),
    ],
  };
}

export const HEAVIES_BLINK = {
  /** Piercing Gale (HEAVY[0]): the dash, then one big falling diagonal from over the right shoulder */
  blinkGale: heavyCut(
    { line: 'right', rF: [-0.17, -0.52], fy: [0.1, -0.8], drag: 0.12, lF: [0.14, 0.58] },
    {
      coil: { h: [0.06, 0.12, 0.28], a: [-96, 62], rp: [-0.35, -0.9, 0.1], by: -0.24, bz: -0.06, bx: -0.04, hip: -0.38, sy: -0.42, sx: 0.14 },
      cut: [
        { h: [0.06, 0.08, 0.42], a: [-44, 36], rp: [-0.6, -0.7, 0] },
        { h: [0.18, -0.06, 0.5], a: [14, 2], rp: [-0.7, -0.6, -0.1], by: -0.25, bz: 0.08, bx: 0, hip: -0.02, sy: 0.0, sx: 0.28 },
        { h: [0.34, -0.28, 0.34], a: [72, -32], rp: [-0.4, -0.9, -0.1], by: -0.27, bz: 0.12, bx: 0.03, hip: 0.28, sy: 0.28, sx: 0.36 },
      ],
      land: { h: [0.37, -0.33, 0.29], a: [84, -38], rp: [-0.4, -0.9, -0.1], by: -0.4, bz: 0.18, bx: 0.04, hip: 0.42, sy: 0.44, sx: 0.52 },
      stop: { h: [0.38, -0.34, 0.28], a: [88, -40], rp: [-0.4, -0.9, -0.1], by: -0.45, bz: 0.2, bx: 0.04, hip: 0.46, sy: 0.48, sx: 0.57 },
    },
  ),
  /** Rising Crescent (HEAVY[1]): from the left hip, one steep rising cut to high over the right shoulder */
  blinkRise: heavyCut(
    { line: 'right', step: [0.3, 1.05], lF: [0.17, 0.58], rF: [-0.18, -0.5], fy: [0.45, -0.7], drag: 0.14 },
    {
      coil: { h: [0.34, -0.4, 0.06], a: [148, -30], by: -0.36, bz: -0.08, bx: -0.06, hip: 0.5, sy: 0.56, sx: 0.4 },
      cut: [
        { h: [0.32, -0.3, 0.34], a: [84, -28] },
        { h: [0.14, -0.06, 0.5], a: [6, 12], by: -0.24, bz: 0.1, bx: 0.01, hip: -0.04, sy: 0.02, sx: 0.26 },
        { h: [-0.1, 0.22, 0.38], a: [-48, 48], by: -0.2, bz: 0.13, bx: 0.04, hip: -0.32, sy: -0.32, sx: 0.12 },
      ],
      land: { h: [-0.13, 0.27, 0.33], a: [-58, 52], by: -0.32, bz: 0.17, bx: 0.05, hip: -0.45, sy: -0.45, sx: 0.2 },
      stop: { h: [-0.14, 0.28, 0.32], a: [-61, 53], by: -0.36, bz: 0.18, bx: 0.05, hip: -0.49, sy: -0.49, sx: 0.23 },
    },
  ),
  /** Whirling Tempest (HEAVY[2]): one level forehand at the waist, unwinding the whole torso, the blade
   *  crossing more than 200° round him; no turn of the feet */
  blinkTempest: heavyCut(
    { line: 'flat', beats: { cut: [1.3, 1.39, 1.48], land: 1.6, stop: [1.72, 1.84] } },
    {
      coil: { h: [-0.32, -0.24, 0.24], a: [-98, 0], rp: [0.5, -0.7, 0.3], by: -0.3, bz: 0, bx: -0.05, hip: -0.55, sy: -0.5, sx: 0.2 },
      cut: [
        { h: [-0.1, -0.12, 0.42], a: [-58, 2], rp: [-0.7, -0.6, -0.3] },
        { h: [0.2, -0.1, 0.58], a: [6, 2], rp: [-0.7, -0.6, -0.2], by: -0.3, bz: 0.08, bx: 0, hip: 0.0, sy: 0.0, sx: 0.28 },
        { h: [0.5, -0.12, 0.32], a: [84, 0], rp: [-0.35, -0.9, -0.2], by: -0.3, bz: 0.11, bx: 0.04, hip: 0.44, sy: 0.42, sx: 0.32 },
      ],
      land: { h: [0.56, -0.15, 0.22], a: [104, -2], rp: [-0.35, -0.9, -0.2], by: -0.44, bz: 0.15, bx: 0.05, hip: 0.58, sy: 0.56, sx: 0.42 },
      stop: { h: [0.58, -0.16, 0.2], a: [112, -2], rp: [-0.35, -0.9, -0.2], by: -0.48, bz: 0.16, bx: 0.05, hip: 0.63, sy: 0.61, sx: 0.46 },
    },
  ),
  /** Mountain Splitter (HEAVY[3]): from up behind the left shoulder, one steep falling cut to beside
   *  the right foot */
  blinkCrush: heavyCut(
    { line: 'left', step: [0.3, 1.05], lF: [0.16, 0.6], rF: [-0.18, -0.52], fy: [0.15, -0.75], drag: 0.2 },
    {
      wind: { h: [0.12, 0.08, 0.32], a: [-40, 76], rp: [-0.5, -0.85, 0.15] },
      coil: { h: [0.28, 0.18, 0.1], a: [146, 50], rp: [-0.2, -0.95, 0.15], by: -0.12, bz: -0.08, bx: -0.06, hip: 0.46, sy: 0.54, sx: -0.04, sz: -0.05 },
      cut: [
        { h: [0.32, -0.02, 0.42], a: [76, 2], rp: [-0.5, -0.85, 0.1] },
        { h: [0.06, 0.0, 0.56], a: [-10, 0], rp: [-0.7, -0.6, -0.1], by: -0.22, bz: 0.12, bx: 0.02, hip: -0.06, sy: 0.0, sx: 0.4, sz: 0 },
        { h: [-0.3, -0.2, 0.5], a: [-56, -22], rp: [-0.8, -0.5, -0.2], by: -0.3, bz: 0.14, bx: 0.05, hip: -0.32, sy: -0.34, sx: 0.46, sz: 0.06 },
      ],
      land: { h: [-0.38, -0.23, 0.4], a: [-62, -26], rp: [-0.8, -0.5, -0.2], by: -0.48, bz: 0.19, bx: 0.06, hip: -0.45, sy: -0.47, sx: 0.62, sz: 0.07 },
      stop: { h: [-0.4, -0.24, 0.38], a: [-64, -27], rp: [-0.8, -0.5, -0.2], by: -0.54, bz: 0.2, bx: 0.06, hip: -0.5, sy: -0.52, sx: 0.68, sz: 0.07 },
    },
  ),
  /** Earthbreaker (HEAVY[4], the leap kept): the blade straight up over his head, then one vertical cut
   *  down into the ground ahead as he lands */
  blinkBreak: heavyCut(
    { line: 'down', step: [0.45, 1.5], drag: 0.25 },
    {
      coil: { h: [0.14, 0.34, 0.12], a: [180, 82], rp: [-0.35, -0.85, 0.35], by: -0.1, bz: 0, hip: -0.12, sy: -0.14, sx: -0.12, hx: -0.18, hy: 0.16 },
      cut: [
        { h: [0.15, 0.26, 0.4], a: [0, 46], rp: [-0.55, -0.75, 0.2] },
        { h: [0.16, 0.0, 0.52], a: [0, -6], rp: [-0.7, -0.6, 0], by: -0.24, bz: 0.1, hip: -0.04, sy: -0.04, sx: 0.36, hx: 0, hy: 0 },
        { h: [0.17, -0.3, 0.42], a: [-2, -46], rp: [-0.7, -0.6, -0.1], by: -0.34, bz: 0.13, hip: 0, sy: 0, sx: 0.56, hx: 0.12, hy: -0.2 },
      ],
      land: { h: [0.17, -0.36, 0.38], a: [-4, -55], rp: [-0.7, -0.6, -0.1], by: -0.52, bz: 0.17, hip: 0.05, sy: 0.05, sx: 0.72, hx: 0.2, hy: -0.26 },
      stop: { h: [0.17, -0.38, 0.37], a: [-5, -58], rp: [-0.7, -0.6, -0.1], by: -0.58, bz: 0.18, hip: 0.07, sy: 0.07, sx: 0.78, hx: 0.22, hy: -0.28 },
    },
  ),
};

/** The anim block each heavy branch plays under `?lights=blink` (combat.js setLights): Gale keeps its
 *  dash, Earthbreaker its leap; Whirling Tempest no longer turns (no `spin`). */
export const HEAVY_BLINK_ANIMS = [
  { kind: 'clip', clip: 'blinkGale', feet: 'dash', dashW: true },
  { kind: 'clip', clip: 'blinkRise' },
  { kind: 'clip', clip: 'blinkTempest' },
  { kind: 'clip', clip: 'blinkCrush' },
  { kind: 'clip', clip: 'blinkBreak', hop: 0.36, tuck: 1.3 },
];

/** The LOOK each heavy branch wears under `?lights=blink` (combat.js setLights `wear`): its `anim`, and
 *  any of `contact` / `glint` it changes. Piercing Gale is a slash now, so its contact is drawn as the
 *  other two-handed sweeps' (cutFx.js tier 'sweep'), without the thrust's ridge glint. Never a number of
 *  the hit. */
export const HEAVY_BLINK = HEAVY_BLINK_ANIMS.map((anim, i) => (i === 0 ? { anim, contact: 'sweep', glint: null } : { anim }));
