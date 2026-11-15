// The hero's CARRIES: how he holds the sword when he is not attacking (Track CARRY, 2026-11-15; the
// owner: "the way the character holds the sword when not attacking needs to be changed"). Data only:
// anim.js `guard()` (the rest) and `loco()` (walk, run, sprint, strafe, backpedal) read the carry the
// hero wears (`anim.carry`, through `anim.carryK`, below); the duelists never read this file (their
// footwork keeps anim.js's own numbers, which are `hip`'s).
//
// main.js reads `?carry=<id>` into `game.heroCarry`; the Player wears it (`player.carry`), and
// `player.setCarry(id)` / `game.pickHeroCarry(id)` / the Lab's 'carry' row switch it live. Unknown or
// absent: DEFAULT_CARRY. Once the owner picks one, the losers and the switch can go.
//
// After a fight action (a cut, the charge, the guard, a parry, a flurry...) he does not drop straight
// into the carry: every clip's way out (the attacks' way home, the block's and the roll's
// cross-fades) aims at the READY hold (`hip`: today's low guard at the right hip), and he RELAXES
// from it into the carry over `RELAX` (anim.js HeroAnimator: `anim.relax`, 0 ready … 1 the carry). The
// ready hold is a waypoint, not a stop: the relax starts inside the last blow's way home (`lead` s
// before the cut ends) and as the guard is let go, so the way out bends on into the carry with no
// stop (review, 2026-11-15: a beat in the ready hold read as the old hold coming back after every
// exchange, 0.33 s of it, then a second move). Straight at a carry far from the ready (a blade
// trailing behind, a reverse grip) the way home from a cut that ends over the left shoulder was a
// 250-300° sweep of the steel in a few frames.
//
// Fields (body axes: +x his LEFT, +y up, +z forward; metres; directions need not be unit):
//   rev     0..1 a REVERSE grip: the sword wrist's limit (anim.js WRIST_BACK, ADR-078) is lifted
//           for this hold only (pose channel P.rev; never in a cut: an attack lets go of it over its
//           windup), so the blade can lie back along the forearm
//   via     true: the guard started from this carry passes the sword arm round through
//           the READY hold (anim.js HeroAnimator._viaReady, one curve through it): a straight
//           cross-fade from a blade standing behind the arm to the cross ward ran it through his
//           chest; from a blade trailing low behind it turned the steel 71° in a frame
//   armFade the least cross-fade (s) of the sword arm leaving this carry for any clip but a cut
//           (the guard, a roll, a flinch, a fall...; the body keeps the clip's own fade): far from
//           every clip's pose, the 0.05 s roll / flinch fades flipped the blade 50° a frame
//   way     (optional) the blade's waypoint on the relax from the ready hold (the rest's), so the
//           lift goes round it: back's flip goes up past his front, not out level at hip height
//   relax   (optional) the carry's own RELAX: point's blade lies between the cuts' finishes and the
//           ready hold, so a way home that found the ready hold overshot the carry and came back; it
//           relaxes within the way home (0.2 s), the way home arriving at the carry itself (with a
//           few degrees of overshoot and return)
//   open    (optional) the first blow's look out of this carry, per attack (combat.js name → anim
//           blocks, `{ kind: 'clip', clip }` plus its options): a chain's first hit or the sprint
//           slash started while he stands relaxed in the carry (anim.relax ≥ OPEN_RELAX) plays one of
//           these, not the generic picks (anim.js _pickVariant: those choose by the nearest coil, and
//           every look of hit 1 coils at his right side, cocked or behind the hip). Each look is
//           shaped for where the carry holds the blade: a short wind, never a swing back and forth
//   settle  (optional) s: the way home after the last blow (anim.js SW_SETTLE, 0.35): a carry far round
//           from the cuts' finishes takes longer, so the way home is a settle, not a second cut
//   dip     (optional) rad: on that way home the point drops this much at mid-way as the blade comes
//           across his front (a relaxed arm lets it fall): a shorter path round to a low carry
//   rest    the idle hold: h the sword hand (an offset from the sword shoulder, DIM.gripShoulder),
//           rp the sword elbow's pole, d the blade, f the flat's normal; hBr / dBr: × the breath
//           (sin, 2.4 s), dSw: × the slow weight sway; free (optional): the free hand's own rest
//           { l, lp, ld: [az, el] degrees, pn } (else the ready's: sword fingers low by the left hip)
//   run / sprint / back   on the move (back = backpedalling): h, rp, d, f (f optional: run's)
//   swing   the sword hand's fore-aft swing with the stride (m) at a run, × [sprint, backpedal]
//   bob     the hand's rise with each footfall [run/sprint, backpedal] (m); dBob: the blade's (run)

const v = (x, y, z) => Object.freeze([x, y, z]);

/** Today's hold (ADR-040 … Session 30): the grip out beside the right hip, the elbow bent 60°, the
 *  blade 52° down and out to his right, the point just off the grass. Also the READY hold every
 *  carry relaxes from. Its numbers are anim.js's own (the duelists' footwork reads those). */
const HIP = Object.freeze({
  id: 'hip',
  name: 'At the hip (today)',
  what: 'the grip beside the right hip, the blade 52° down and out to his right',
  rev: 0,
  rest: Object.freeze({ h: v(-0.19, -0.435, 0.06), hBr: v(0, 0.006, 0), rp: v(0.5, -0.3, -1), d: v(-0.6, -0.79, 0.12), dBr: v(0.01, 0.008, 0), dSw: v(0, 0, 0.015), f: v(0.15, 0.05, 1), free: null }),
  run: Object.freeze({ h: v(-0.13, -0.44, -0.08), rp: v(-0.4, -0.3, -0.95), d: v(-0.42, -0.56, -0.71), f: v(-0.3, 1, 0) }),
  sprint: Object.freeze({ h: v(-0.15, -0.37, -0.28), rp: v(-0.5, 0.2, -0.95), d: v(-0.36, -0.2, -0.91), f: v(-0.3, 1, 0) }),
  back: Object.freeze({ h: v(-0.02, -0.38, 0.3), rp: v(-0.85, -0.3, -0.5), d: v(-0.15, -0.22, 1), f: v(0, 1, 0.2) }),
  swing: v(0.09, 0.6, 0.6),
  bob: v(0.02, 0.025, 0),
  dBob: 0.03,
});

export const CARRIES = Object.freeze({
  hip: HIP,
  // 提剑 (the sword carried trailing): a relaxed, nearly straight arm, the hand just outside and a
  // little behind the right hip, the blade trailing back and down beside the right leg, the edge
  // down. Hit 1's draw cut and rising slash coil right here (swings.js: the hand behind the right
  // hip, the blade back, −12° / −34°): from the trail they need almost no wind. On the run the blade
  // stands further out (38° off straight back) and less steeply down (28°): 24° out it hid behind
  // the cloak and the legs from the camera behind him at 30-36 m in parts of each stride
  trail: Object.freeze({
    id: 'trail',
    name: 'Trailing (提剑)',
    what: 'a relaxed arm, the blade trailing back and down beside the right leg',
    rev: 0,
    via: true,
    armFade: 0.12,
    // (the way home from a finish on his left sweeps ~270° round his front into the trail: in the
    // flow's 0.35 s it peaked at 27 m/s, nearly the cut's speed. Slower than 0.37 s, a click again as
    // the attack ends finds the blade still far on his left and winds across his front faster than
    // its cut (0.45 s: 1.1 of it); the point dropping 0.9 rad at mid-way shortens the way round)
    settle: 0.37,
    dip: 0.9,
    rest: Object.freeze({ h: v(-0.09, -0.54, -0.12), hBr: v(0, 0.006, 0.004), rp: v(-0.3, 0, -1), d: v(-0.372, -0.669, -0.644), dBr: v(0, 0.012, 0), dSw: v(0.01, 0, 0), f: v(0.87, 0, -0.5), free: null }),
    run: Object.freeze({ h: v(-0.1, -0.5, -0.14), rp: v(-0.35, -0.1, -1), d: v(-0.544, -0.469, -0.696), f: v(1, 0.1, -0.4) }),
    sprint: Object.freeze({ h: v(-0.12, -0.4, -0.3), rp: v(-0.5, 0.2, -0.95), d: v(-0.3, -0.2, -0.93), f: v(-0.2, 1, 0) }),
    back: Object.freeze({ h: v(-0.02, -0.38, 0.3), rp: v(-0.85, -0.3, -0.5), d: v(-0.15, -0.22, 1), f: v(0, 1, 0.2) }),
    swing: v(0.06, 0.6, 0.6),
    bob: v(0.015, 0.025, 0),
    dBob: 0.03,
  }),
  // 背剑 (the sword carried behind the arm): a reverse grip, the hand by the right hip, the blade
  // standing up behind the sword arm along the back of the upper arm, the point a forearm above the
  // right shoulder and canted out (≥ 0.26 m from the head's axis; the hand out past the coat skirt:
  // inside it the steel came up through the panels; and a hand's width ahead of the right panel: as
  // the panels flared after a turn or a stop the steel's foot crossed them, 34 of 3698 frames); the
  // free forearm across the belt, the sword
  // fingers pointing to his right. Hit 1's falling cut coils with the blade at the same azimuth: the
  // wind lifts the hand, the steel already stands there
  back: Object.freeze({
    id: 'back',
    name: 'Behind the arm (背剑)',
    what: 'a reverse grip, the blade standing up behind the sword arm',
    rev: 1,
    via: true,
    armFade: 0.16,
    // (the flip into the hold goes up past his front: round a point ahead and a little to his left;
    // straight from the ready hold it swung out level at hip height, a bar off his right side from
    // the camera behind him)
    way: v(0.554, 0.259, 0.791),
    // (a falling cut from a high cock over his right side, swings.js backFall / sprintFall: the hand
    // rises to the chest as the upright steel lowers into it. The draw cut the picker also allowed
    // swung the steel 80° down beside the leg and cut at 45 m/s; the falling cut's own cock at the
    // shoulder lifted the hand 0.55 m in six frames; the rising sprint slash coils low behind the hip:
    // 100° down at 27 m/s, then a 51 m/s cut)
    open: Object.freeze({
      fallingCut: Object.freeze([Object.freeze({ kind: 'clip', clip: 'backFall' })]),
      sprintSlash: Object.freeze([Object.freeze({ kind: 'clip', clip: 'sprintFall', feet: 'dash' })]),
    }),
    rest: Object.freeze({
      h: v(-0.09, -0.55, 0.15), hBr: v(0, 0.006, 0), rp: v(-0.5, 0, -1), d: v(-0.27, 0.95, -0.15), dBr: v(0, 0, -0.01), dSw: v(-0.008, 0, 0), f: v(0, 0.15, 0.99),
      free: Object.freeze({ l: v(-0.18, -0.38, 0.17), lp: v(0.6, -0.7, -0.3), ld: v(-80, -15), pn: v(0, -0.3, -1) }),
    }),
    run: Object.freeze({ h: v(-0.1, -0.54, 0.11), rp: v(-0.5, -0.1, -1), d: v(-0.28, 0.95, -0.12), f: v(0, 0.12, 0.99) }),
    sprint: Object.freeze({ h: v(-0.11, -0.51, 0.05), rp: v(-0.5, 0, -1), d: v(-0.3, 0.94, -0.16), f: v(0, 0.15, 0.99) }),
    back: Object.freeze({ h: v(-0.09, -0.54, 0.17), rp: v(-0.5, 0, -1), d: v(-0.27, 0.95, -0.15), f: v(0, 0.15, 0.99) }),
    swing: v(0.03, 1, 1),
    bob: v(0.012, 0.012, 0),
    dBob: 0,
  }),
  // 垂剑 (the point lowered): on guard. The hand before the right hip, the elbow in by the ribs, the
  // blade forward, out and down toward the foe's feet, past his right knee (40° out: further in, the
  // cloak hid it from the camera behind him); the free hand in sword fingers by the left hip. On the
  // move it trails like the ready hold (today's run). (It replaced `waist`, the blade level across the
  // small of his back. From the fixed north camera a blade lying across him is drawn over his back or
  // down his side whenever he faces east or west, and from behind his back the guard, a roll, the roll
  // cut and a flinch swung it ~260° in 3-5 frames, through his hips and chest: 9 cm deep.)
  point: Object.freeze({
    id: 'point',
    name: 'Point lowered (垂剑)',
    what: 'on guard: the hand before the right hip, the point lowered toward the foe',
    rev: 0,
    armFade: 0.1,
    relax: Object.freeze({ lead: 0.15, drop: 0.15, dur: 0.2 }),
    // (the point's own rising cut, swings.js pointRise: every generic look of hit 1 coils behind his
    // right hip, a swing of the blade back from before him and a reversal at the coil)
    open: Object.freeze({
      fallingCut: Object.freeze([Object.freeze({ kind: 'clip', clip: 'pointRise', hop: 0.12 })]),
    }),
    rest: Object.freeze({
      h: v(-0.15, -0.46, 0.12), hBr: v(0, 0.006, 0.003), rp: v(-0.3, -0.4, -1), d: v(-0.492, -0.643, 0.587), dBr: v(0, 0.01, 0), dSw: v(0.01, 0, 0), f: v(-0.766, 0.0, -0.642),
      free: Object.freeze({ l: v(0.04, -0.44, 0.15), lp: v(0.36, -0.2, -0.9), ld: v(0, -40), pn: v(-0.35, -0.6, -0.72) }),
    }),
    run: HIP.run,
    sprint: HIP.sprint,
    back: HIP.back,
    swing: HIP.swing,
    bob: HIP.bob,
    dBob: HIP.dBob,
  }),
});
export const CARRY_IDS = Object.keys(CARRIES);
export const DEFAULT_CARRY = 'trail';
/** The ready hold every carry relaxes from after a fight action (and the duelists' numbers). */
export const READY_CARRY = HIP;
/** The relax into the carry (anim.relax, a smootherstep of its clock: no speed at either end). A
 *  fight action winds it back toward the ready hold over `drop` s (a tap of the guard barely leaves
 *  the carry; a cut's way home finds the ready hold); it runs on into the carry over `dur` s as the
 *  action ends, or `lead` s before the last blow of a chain ends (inside its way home: no next blow
 *  buffered). */
export const RELAX = Object.freeze({ lead: 0.15, drop: 0.15, dur: 0.5 });
/** How far into the carry he must have relaxed (anim.relax) for a first blow to play the carry's own
 *  look (`open`): out of a fight's way home the blade is nearer the generic coils. */
export const OPEN_RELAX = 0.6;

/** The carry registered under `id`, or null. */
export const getCarry = (id) => (typeof id === 'string' && Object.hasOwn(CARRIES, id) ? CARRIES[id] : null);

/** The carry a URL query asks for (`?carry=back`, case-insensitive); the default when absent or unknown. */
export function carryFromSearch(search) {
  let id = null;
  try {
    id = new URLSearchParams(search ?? '').get('carry');
  } catch {
    id = null;
  }
  const k = typeof id === 'string' ? id.trim().toLowerCase() : '';
  return getCarry(k) ? k : DEFAULT_CARRY;
}

/** `href` with `?carry=<id>` set (removed for the default); other params kept. */
export function carryUrl(id, href) {
  const u = new URL(href);
  if (id === DEFAULT_CARRY) u.searchParams.delete('carry');
  else u.searchParams.set('carry', id);
  return u.toString();
}

// ---------------------------------------------------------------- the blend (anim.js)
// The carry the poses read is the ready hold blended into the worn carry by the relax (0..1):
// `carryInto(out, carry, k, dir)` writes it into `out` (a mutable copy made by `carryScratch()`, one
// per animator: nothing is allocated per frame). Positions, poles, flats and the breath are lerped;
// the blade's directions are turned by `dir` (anim.js passes its dirLerp: round the outside, never
// through the body). At k 0 it is the ready hold exactly, at k 1 the carry exactly.
const SETS = ['rest', 'run', 'sprint', 'back'];
const VECS = ['h', 'hBr', 'rp', 'dBr', 'dSw', 'f'];
const NUMS = ['swing', 'bob'];
const ZERO = v(0, 0, 0);
const WAY0 = [0, 0, 0], WAY1 = [0, 0, 0]; // (the waypoint's two legs, carryInto)
const copy3 = (o, a) => {
  o[0] = a[0];
  o[1] = a[1];
  o[2] = a[2];
};
// a set's field: its own, else (a moving set's flat) the run's, else zero (the breath on the move)
const field = (C, S, f) => C[S][f] ?? (f === 'f' ? C.run.f : null) ?? ZERO;

/** A mutable carry (every field its own array): the blend's output. */
export function carryScratch() {
  const set = () => ({ h: [0, 0, 0], hBr: [0, 0, 0], rp: [0, 0, 0], d: [0, 0, 0], dBr: [0, 0, 0], dSw: [0, 0, 0], f: [0, 0, 0] });
  const free = { l: [0, 0, 0], lp: [0, 0, 0], ld: [0, 0], pn: [0, 0, 0], w: 0 };
  return { id: '', rev: 0, rest: set(), run: set(), sprint: set(), back: set(), free, swing: [0, 0, 0], bob: [0, 0, 0], dBob: 0, k: -1, of: null };
}

/** out ← the ready hold blended into the carry `C` by k (0..1); `dir(o, x0, y0, z0, x1, y1, z1, t)`
 *  writes a turned blade direction into o. The free hand's rest: `out.free.w` is how far it is the
 *  carry's own (0: the ready's). Allocates nothing; skips the work when nothing changed. */
export function carryInto(out, C, k, dir) {
  const R = READY_CARRY;
  k = k > 0 ? (k < 1 ? k : 1) : 0;
  if (out.of === C && out.k === k) return out;
  out.of = C;
  out.k = k;
  out.id = C.id;
  out.rev = (C.rev ?? 0) * k;
  // (exact at the ends: the ready hold itself at k 0, the carry itself at k 1)
  const A = k >= 1 ? C : R, s = k >= 1 ? 0 : k;
  for (let si = 0; si < SETS.length; si++) {
    const S = SETS[si], o = out[S];
    for (let fi = 0; fi < VECS.length; fi++) {
      const f = VECS[fi];
      if (s > 0) {
        const a = field(R, S, f), b = field(C, S, f);
        for (let i = 0; i < 3; i++) o[f][i] = a[i] + (b[i] - a[i]) * s;
      } else copy3(o[f], field(A, S, f));
    }
    const a = R[S].d, b = C[S].d, W = S === 'rest' ? C.way : null;
    if (s > 0 && W) {
      // round the waypoint: one curve (a quadratic Bézier of turns), not two arcs meeting in a corner
      dir(WAY0, a[0], a[1], a[2], W[0], W[1], W[2], s);
      dir(WAY1, W[0], W[1], W[2], b[0], b[1], b[2], s);
      dir(o.d, WAY0[0], WAY0[1], WAY0[2], WAY1[0], WAY1[1], WAY1[2], s);
    } else if (s > 0) dir(o.d, a[0], a[1], a[2], b[0], b[1], b[2], s);
    else copy3(o.d, A[S].d);
  }
  for (let ni = 0; ni < NUMS.length; ni++) {
    const f = NUMS[ni];
    for (let i = 0; i < 3; i++) out[f][i] = s > 0 ? R[f][i] + (C[f][i] - R[f][i]) * s : A[f][i];
  }
  out.dBob = s > 0 ? R.dBob + (C.dBob - R.dBob) * s : A.dBob;
  // the free hand: the carry's own rest (if it has one) by k
  const F = C.rest.free, o = out.free;
  o.w = F ? k : 0;
  if (F) {
    copy3(o.l, F.l);
    copy3(o.lp, F.lp);
    o.ld[0] = F.ld[0];
    o.ld[1] = F.ld[1];
    copy3(o.pn, F.pn);
  }
  return out;
}
