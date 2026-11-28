import { BEHIND } from './poses.js';

// Xin Yi's motion after the reference pack (docs/art/character-packs-v04/xin-yi, ADR-285), behind
// `?oneRefMove=a` (look.js oneRefMoveNow; '0' = as shipped). A pose layer over whatever keys the shipped
// switches chose (`?oneMoves=0|a|b`): the same key times, the same eases, the same cock, so every windup,
// hold, impact, active window, zone, flash, cue and effect lands where it did (the realiser times a beat
// from its windup, never from its poses), and no root field is written (bX / bZ, travel, lift, dash are
// left as they are: the source owns the root motion). His guards are the pack's (poses.js GUARDS_REF);
// what changes in the keys, from the strips (COVERAGE.md):
//   - a hand blow on the floor lands into a lunge (A1 contact: the weight forward, the rear leg long): the
//     body a little lower and leaning in at the contact, half that through the follow; kicks keep the
//     rebuild's straight leg (A2: the support leg is the rebuild's already);
//   - the beckon's open hand further out (A5.1);
//   - the reload throws both arms wide (A4.5: the guns tossed), the hands into the coat, out low;
//   - Unwriting lifts both open palms (S1.4), the Dive Within drives in long and low (S1.5), the burst off the
//     floor goes up with the hands low at his sides (S2.1: no arms thrown wide), the Falling Fist lands low on
//     the fist (S2.2);
//   - phase 1, gear 1: the left hand stays behind his back in every key (oneHand, before this layer).
// Not touched: the guns' aims (gunAim.js puts the muzzles on the line of fire), the palm bolts' and the
// shots' release poses (a projectile leaves from the hand as drawn: handPoint / muzzlePoint), the
// transitions' kneel and rising (their own keys, S2.4 / S2.5 already), the flight's hover and pass.
// The reaction clips (refClipKey): the Lean's slips further over (T2.4), the high duck lower, the recoils,
// the stagger and the reeling bigger (T2.5 / T2.6), the Bend arched further back (S3.4), the Stop's palm
// out straighter (S1.2); in phase 1 gear 1 the left hand behind his back through all of them.

const REF = { sink: 0.05, lean: 0.06, rear: 0.05, floor: -0.42 };
/** The hand blows that land into the lunge. */
const HANDS = new Set(['jab', 'cross', 'palm', 'double', 'backfist', 'hook', 'elbow', 'uppercut']);
// (a key already lower than `floor` keeps its own height: a crouch is not pushed deeper)
const sinkTo = (bY, by) => Math.max(bY - by, Math.min(bY, REF.floor));
/** A foot on the floor ([x, z], or [x, y, z] with y at the ankle) behind him, put `d` m further back. */
const rearLong = (v, d) => {
  if (!Array.isArray(v)) return v;
  if (v.length === 2) return v[1] < 0 ? [v[0], v[1] - d] : v;
  return v[2] < 0 && v[1] <= 0.12 ? [v[0], v[1], v[2] - d] : v;
};
const lifted = (k) => Math.abs(k.pitch ?? 0) > 0.9 || Math.abs(k.roll ?? 0) > 0.9;

/** One key of a beat in the reference's poses. `ctx.oneHand`: phase 1 gear 1 (the left hand stays). */
function refKey(u, k, b, ctx) {
  const o = { ...k };
  const hit = Math.abs(u - 1) < 1e-6, follow = u > 1 + 1e-6;
  const grounded = !b.air && !b.leap && !b.flit && !lifted(k) && !Array.isArray(b.lift) && !b.iron && !b.cast && !b.bolt && !b.aim;
  if (grounded && HANDS.has(b.blow) && (hit || follow)) {
    const f = hit ? 1 : 0.5;
    if (k.bY != null) o.bY = sinkTo(k.bY, REF.sink * f);
    o.pitch = (k.pitch ?? 0) + REF.lean * f;
    if (hit) {
      o.rF = rearLong(k.rF, REF.rear);
      o.lF = rearLong(k.lF, REF.rear);
    }
  }
  if (b.beckon && Array.isArray(k.rH)) o.rH = [k.rH[0] - 0.02, k.rH[1] + 0.02, k.rH[2] * 1.12];
  if (b.iron === 'reload') {
    // A4.5: both arms thrown wide (the guns tossed), the hands into the coat at his hips, the new pair low
    if (u > 0.2 && u < 0.45) Object.assign(o, { bY: -0.08, rH: [-0.5, 0.02, 0.14], rP: [-0.9, -0.2, -0.3], lH: [0.5, 0.02, 0.14], lP: [0.9, -0.2, -0.3], hdX: -0.06 });
    else if (u > 0.6 && u < 0.8) Object.assign(o, { rH: [0.06, -0.34, -0.02], lH: [-0.06, -0.34, -0.02] });
    else if (u > 0.9) Object.assign(o, { rH: [-0.07, -0.45, 0.13], lH: [0.07, -0.45, 0.13], bY: -0.08 });
  }
  if (b.unwrite) {
    // S1.4: both open palms low before him, turned up, then lifted (the bricks rise from the pillars)
    if (hit || follow) Object.assign(o, { rH: [-0.16, 0.08, 0.42], lH: [0.16, 0.08, 0.42], pitch: -0.08 });
    else if (u > 0.3) Object.assign(o, { rH: [-0.12, -0.24, 0.34], lH: [0.12, -0.24, 0.34] });
  }
  if (b.dive && hit) {
    // S1.5: the lunge long and low, the rear leg out behind
    if (k.bY != null) o.bY = Math.min(k.bY, -0.36);
    o.pitch = Math.max(k.pitch ?? 0, 0.46);
    o.rF = rearLong(k.rF, 0.12);
    o.lF = rearLong(k.lF, 0.12);
  }
  if (b.rise && (hit || follow)) {
    // S2.1: straight up, the hands low at his sides (no arms thrown wide)
    Object.assign(o, { rH: [-0.2, -0.42, 0.06], rP: [-0.9, -0.1, -0.3], lH: [0.2, -0.42, 0.06], lP: [0.9, -0.1, -0.3] });
  }
  if (b.fist && u >= 1 - 1e-6 && k.bY != null) o.bY = Math.min(k.bY, -0.62); // S2.2: down on the fist, low
  if (ctx.oneHand) {
    o.lH = BEHIND.lH;
    o.lP = BEHIND.lP;
  }
  return o;
}

const CACHE = new WeakMap(); // beat -> Map(ctxKey -> (keys -> ref keys))
/** A beat's keys in the reference's poses (cached per beat, per keys array and per context). */
export function refKeysOf(b, keys, ctx) {
  if (!Array.isArray(keys)) return keys;
  let M = CACHE.get(b);
  if (!M) CACHE.set(b, (M = new Map()));
  const ck = ctx.oneHand ? 1 : 0;
  let W = M.get(ck);
  if (!W) M.set(ck, (W = new WeakMap()));
  let r = W.get(keys);
  if (!r) {
    r = keys.map(([u, k]) => [u, refKey(u, k, b, ctx)]);
    W.set(keys, r);
  }
  return r;
}

const BIG = new Set(['flinch', 'stagger', 'recoil', 'reeling', 'trampled']);
const LEAN = new Set(['ward', 'wardR', 'clash', 'deflect']);
/** One key of a reaction clip in the reference's poses (`oneHand`: phase 1 gear 1). */
export function refClipKey(name, k, oneHand = false) {
  let o = k;
  if (BIG.has(name)) {
    o = { ...k };
    if (k.pitch != null) o.pitch = k.pitch * 1.3;
    if (k.bZ != null) o.bZ = k.bZ * 1.35;
    if (k.spX != null) o.spX = k.spX * 1.3;
    if (k.bY != null) o.bY = sinkTo(k.bY, 0.05);
  } else if (LEAN.has(name)) {
    o = { ...k };
    if (k.pitch != null) o.pitch = k.pitch * 1.25;
    if (k.roll != null) o.roll = k.roll * 1.3;
    if (k.bY != null) o.bY = sinkTo(k.bY, 0.04);
  } else if (name === 'wardHigh') {
    o = { ...k };
    if (k.bY != null) o.bY = sinkTo(k.bY, 0.14);
    if (k.pitch != null) o.pitch = k.pitch + 0.12;
  } else if (name === 'bend') {
    o = { ...k };
    if ((k.pitch ?? 0) < -0.9) {
      o.pitch = k.pitch * 1.15;
      o.bY = Math.min(k.bY ?? -0.5, -0.56);
    }
  } else if (name === 'stop' && Array.isArray(k.rH)) {
    o = { ...k, rH: [0.04, 0.12, 0.56] };
  }
  if (oneHand && name !== 'meditate' && name !== 'intro') o = { ...o, lH: BEHIND.lH, lP: BEHIND.lP };
  return o;
}
