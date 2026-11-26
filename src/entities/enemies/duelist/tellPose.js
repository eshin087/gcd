// The held tell poses (ADR-226): a blue (parry) or red (perfect-dodge) blow of a sword duelist shows what
// it is from the body before its flare, in a pose HELD through the middle of its windup, one family per
// tell so the player learns two silhouettes:
//
//   blue  HIGH   the blade raised high over the sword shoulder, the point to the sky, tall on the legs,
//                the free hand out at the opponent: a cut coming down that the hero meets (cuts)
//         AIM    the blade drawn back level by the cheek, the point on the opponent, the free hand laid
//                forward along its line: a thrust that is met (thrusts)
//   red   COIL   sunk low and coiled away, the blade trailing low behind the sword hip, its point near
//                the floor, the free hand reaching for the opponent: a lunge or a sweep to get out of
//                the way of (every red blade blow)
//
// tellKeys(keys, tell, kind) rebuilds a beat's pose keys ([u, pose] as moves.js writes them: u 0..1 the
// windup, 1 the impact) with the family's pose at TELL_U[0] of the windup, held to TELL_U[1], and the
// beat's own strike from there: the windup's length, the impact, the zone and the root motion stay the
// beat's (the gameplay is untouched; only the keys change). The strike from the hold is the fast part.
// A beat it cannot read (no key before the impact) comes back as it was. Build time only.

/** u of the windup: the tell pose is reached at [0] and held to [1]; the strike runs [1] → 1. The pose
 *  forms before the flare (flashLead 0.26 - 0.3 s before the impact: u ≈ 0.5 of a 0.6 s windup), so the
 *  silhouette is read first and the flare times it. */
export const TELL_U = [0.36, 0.8];
/** … the hold's end when the strike keys the hand (the two-handed chop, the lunge): a longer strike. */
export const TELL_U_KEYED = 0.72;

const W2B = (az, yaw) => az - yaw; // a world-relative blade azimuth → body space at that yaw

/** The families: body fields, the blade's WORLD direction [az, el] (az 0 = at the opponent, + his left)
 *  and the body's yaw it is read at. Feet are left to the beat (its own stance) unless given. */
const FAMILY = {
  high: {
    yaw: 0.32, sw: [-0.42, 1.3], arm: 1, ext: 0.45, lead: 0, hand: [0.04, 0.36, 0.12], pole: [-0.8, 0.35, -0.3],
    bY: -0.1, bZ: -0.04, pitch: -0.05, spX: -0.06, hdX: 0.04,
    lH: [0.08, 0.02, 0.44], lP: [0.6, -0.6, 0.1],
  },
  aim: {
    yaw: 0.78, sw: [-0.06, 0.06], arm: 0, rH: [-0.06, 0.06, -0.12], rP: [-0.85, 0.15, -0.5],
    bY: -0.2, bZ: -0.08, pitch: 0.02, spX: 0.02,
    lH: [0.12, 0.0, 0.48], lP: [0.6, -0.5, 0.2],
  },
  coil: {
    yaw: 0.95, sw: [-2.45, -0.38], arm: 1, ext: 0.55, lead: 0.1, hand: [-0.12, -0.34, -0.1], pole: [-0.6, -0.5, -0.6],
    bY: -0.42, bZ: -0.1, pitch: 0.2, spX: 0.1, hip: 0.12,
    lH: [0.1, -0.06, 0.5], lP: [0.7, -0.4, 0.2],
    rF: [-0.16, 0.42], lF: [0.24, -0.5], rK: [-0.4, 0, 1], lK: [0.6, 0, 0.8], flat: 0.9,
  },
};

/** The family of a blow: 'high' / 'aim' (blue), 'coil' (red); null for any other tell. */
export function familyOf(tell, kind) {
  if (tell === 'blue') return kind === 'thrust' ? 'aim' : 'high';
  if (tell === 'red') return 'coil';
  return null;
}

/**
 * The beat's keys with its tell pose held (see the header). `keys`: [[u, pose], ...]; `tell`: 'blue' |
 * 'red'; `kind`: 'thrust' | 'cut'; `o.keep`: field names the beat's cock keeps whatever the family says
 * (a two-handed or twin form: `two`, `larm`, `lsw`, ...); `o.headYaw` the head's turn back onto the
 * opponent (default: against the body's yaw).
 */
export function tellKeys(keys, tell, kind, o = {}) {
  const fam = FAMILY[familyOf(tell, kind)];
  if (!fam || !Array.isArray(keys)) return keys;
  const pre = keys.filter(([u]) => u < 1 - 1e-6).sort((a, b) => a[0] - b[0]);
  if (!pre.length) return keys;
  const cock = pre[pre.length - 1][1];
  const { yaw, sw, hand, pole, ...body } = fam;
  const pose = {};
  // what the beat's cock carries that the family does not set (its feet, a second blade, the grip)
  for (const [f, v] of Object.entries(cock)) if (f !== 'e' && f !== 'gather' && f !== 'settle') pose[f] = Array.isArray(v) ? v.slice() : v;
  Object.assign(pose, body, { yaw, sw: [W2B(sw[0], yaw), sw[1]], hdY: o.headYaw ?? -yaw * 0.85 });
  for (const f of o.keep ?? []) if (f in cock) pose[f] = cock[f];
  // the hand as the beat's strike holds it: a strike with a keyed hand (the two-handed chop, the lunge) is
  // wound up with a keyed hand too, so the strike never swaps a blade-driven arm for a keyed one in 0.1 s
  const hit = keys.find(([u]) => Math.abs(u - 1) < 1e-6)?.[1];
  let end = TELL_U[1];
  if (pose.arm > 0 && hit && !(hit.arm > 0) && hand) {
    end = TELL_U_KEYED; // (a keyed hand travels further in its strike: as the overhead was authored, from 0.72)
    pose.arm = 0;
    pose.rH = hand.slice();
    pose.rP = pole.slice();
  } else if (pose.arm > 0) delete pose.rH;
  // a beat's first draw toward the cock, authored from the guard, keeps its gather flag
  const out = [];
  for (const [u, k] of pre) if (k.gather && u < TELL_U[0] * 0.8) out.push([u, k]);
  out.push([TELL_U[0], { ...pose }]);
  out.push([end, { ...pose, e: 'h' }]);
  for (const [u, k] of keys) if (u >= 1 - 1e-6) out.push([u, k]);
  return out;
}

/** Every blue / red blade blow of a move table gets `motionKeys` (its keys with the tell pose held):
 *  not a feint, a cast, a thrown or released thing, nor a somersault or a cartwheel (a key turning him
 *  past a radian round his pitch or roll), nor a counter. `keep`: fields the beat's own cock keeps. Build time only. */
export function motionize(MOVES, keep = ['two', 'larm', 'lext', 'llead', 'lsw']) {
  for (const def of Object.values(MOVES)) {
    if (def.counter) continue; // (a counter out of his guard comes at once: no held windup)
    for (const raw of def.beats ?? []) {
      for (const b of Array.isArray(raw.pick) ? raw.pick : [raw]) {
        if (!Array.isArray(b.keys) || b.feint || b.cast || b.release || b.bolt || b.pull || b.grip) continue;
        if (b.keys.some(([, k]) => Math.abs(k.pitch ?? 0) > 1 || Math.abs(k.roll ?? 0) > 1)) continue;
        const kind = b.zone?.kind === 'line' ? 'thrust' : 'cut';
        if (!familyOf(b.tell, kind)) continue;
        b.motionKeys = tellKeys(b.keys, b.tell, kind, { keep });
      }
    }
  }
  return MOVES;
}
