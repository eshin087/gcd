import { TELL } from '../../../combat/rules.js';
import { DIM } from '../../player/model.js';
import { makeRealise } from '../duelist/realise.js';
import { FORM_POSES, FIST_UP, FIST_FLAT } from './poses.js';
import { TUNING } from './tuning.js';
import { meleeMoves } from './moves/melee.js';
import { kiMoves } from './moves/ki.js';
import { terrainMoves } from './moves/terrain.js';

// Tian Lei's moves and reaction clips, as data (MOVES.md, the owner's approved moveset). The format is
// the duelist's (ashDisciple/moves.js header; duelist/realise.js: `pick` alternatives, `fixed`
// windups; starlessLord/moves.js: `blink`, per-form weights). He is BARE-HANDED: every blow is a
// limb, built here by four builders in the style of the Lord's `cut(...)`:
//   punch(kind, tell, windup, damage, o)   jab · cross · hook · uppercut · backfist · palm · double · hammer
//   kick(kind, tell, windup, damage, o)    front · side · round · sweep · axe · flying · knee
//   elbow(tell, windup, damage, o)         the dash elbow (a line)
//   shoulder(tell, windup, damage, o)      the shoulder check (a line)
// each with its key poses: a coil that reads as the windup (the hips loaded, the limb drawn back), the
// strike (the hips and the planted foot driving it), a follow-through; its `part` (where the glint
// pops and the trail is drawn: fistR, fistL, footR, footL, kneeR, kneeL, elbowR, elbowL, palms,
// shoulder: ascendant.js tellPoint) and its zone. `o`: { left (the mirror image: the other limb),
// cock, step ('L' / 'R': which foot the strike drives off, so a string walks), ...beat overrides }.
// Root motion is never in the keys (beat `close`, `dash`, `travel`, `lift`, `leap`, `blink`).
//
// His own beat fields (ascendant.js; the engine's are in duelist/brain.js):
//   blink: { behind }      he vanishes at the windup's start and is `behind` m behind the hero
//   blink: { land: true }  ... beside where the hero's knock-back will END (Sky Hammer: the second wave)
//   blink: { edge: true }  ... at the ring's edge farthest from the hero (the great beam: the second wave)
//   ki: '<kind>'           on a beat or a move: its hooks go to d.ki (ki.js); `terrain: '<kind>'` to d.terrain
//   air: true              (engine) the beat hits whatever his height (a flying kick)
//   sustain: { dur, tick } (engine) the beat stays live `dur` s after its impact, d.onSustain every `tick` s
//   zone.fwd / zone.side   (engine) the zone's centre `fwd` m ahead of him, `side` m to his left
//
// Where the moves live (the second wave works in parallel, one file each):
//   moves/melee.js     his blows: forms 1 - 3, counters, flurries, the transformations (this task)
//   moves/ki.js        blasts, beams, discs, called strikes (the ki agent)
//   moves/terrain.js   floor pieces, slabs, craters (the terrain agent)
// Each exports a function of the builders object `X` (below) returning { name: move }: no import of
// this file (a cycle), so a new move file needs nothing but `X`.
// A move's `weight` is per FORM [1, 2, 3] (0 = not in that form). Rules (tests/integration/asc.mjs
// DATA): a tell on every real hit, a move's first real windup >= TUNING.minFirstWindup in every form it
// is used in, impacts >= TUNING.minHitGap apart, exactly one black move per form.

const N = TELL.NORMAL, B = TELL.BLUE, R = TELL.RED, K = TELL.BLACK;
const TAU = Math.PI * 2;
const ANK = DIM.ankle;
const RE = TUNING.reach;

// ---------------------------------------------------------------- pose fragments
// (body space: +x his LEFT, +y up, +z forward; hands = offsets from each shoulder; feet model space
// [x, z] on the floor or [x, y, z]; knees = the knee's pole direction)
/** The fields every strike key carries, so nothing one blow keyed leaks into the next. */
const NEUTRAL = {
  bX: 0, bZ: 0, pitch: 0, roll: 0, hip: 0, hipZ: 0, hipX: 0, spX: 0, spY: 0, spZ: 0, hdX: 0.04, hdZ: 0,
  flat: 0.95, rK: [-0.35, -0.05, 0.95], lK: [0.35, 0, 1], rFy: -0.5, lFy: 0.25, swF: FIST_FLAT, sw: FIST_UP,
  rP: [-0.8, -0.7, -0.1], lP: [0.8, -0.7, -0.1],
};
/** Feet: the orthodox set (the left foot leads) and the steps out of it. */
const OR = { lF: [0.2, 0.28], rF: [-0.2, -0.24], lFy: 0.25, rFy: -0.55 };
const OR_IN = { lF: [0.2, 0.5], rF: [-0.2, -0.2], lFy: 0.2, rFy: -0.5, lK: [0.35, 0, 1] }; // the lead foot steps in
const PIVOT = { lF: [0.2, 0.32], rF: [-0.17, -0.18], lFy: 0.2, rFy: 0.15, rK: [-0.1, 0, 1], lK: [0.3, -0.1, 0.9] }; // the rear foot turns over: the hips drive through
const LOW = { lF: [0.28, 0.34], rF: [-0.28, -0.3], lFy: 0.3, rFy: -0.6, rK: [-0.6, 0, 0.8], lK: [0.6, 0, 0.8] };
const LUNGE = { lF: [0.2, 0.58], rF: [-0.22, -0.4], lFy: 0.15, rFy: -0.15, lK: [0.3, 0, 1], rK: [-0.2, -0.3, 0.9] };
/** The southpaw twins (the right foot leads): a string's other step. */
const SOUTH = (p) => mirrorFeet(p);
/** Hands in his guard (the rear fist by the chin, the lead out front). */
const HANDS = { rH: [0.12, 0.06, 0.22], lH: [0.02, 0.1, 0.32] };

/** A key's pose: the neutral fields, then the pose; the head turned back onto the opponent. */
function F(p) {
  const out = { ...NEUTRAL, ...p };
  if (p.hdY === undefined) out.hdY = -((p.yaw ?? 0) + (p.spY ?? 0)) * 0.82;
  return out;
}

const NEG = ['bX', 'yaw', 'roll', 'hip', 'hipZ', 'spY', 'spZ', 'hdY', 'hdZ'];
const PAIRS = [['rH', 'lH'], ['rP', 'lP'], ['rK', 'lK'], ['rF', 'lF']];
const flipX = (v) => (Array.isArray(v) ? [-v[0], ...v.slice(1)] : v);
/** Only the feet of a pose, mirrored (left ↔ right). */
function mirrorFeet(p) {
  const o = { ...p };
  if ('rF' in p || 'lF' in p) {
    o.rF = flipX(p.lF);
    o.lF = flipX(p.rF);
  }
  if ('rK' in p || 'lK' in p) {
    o.rK = flipX(p.lK);
    o.lK = flipX(p.rK);
  }
  if ('rFy' in p || 'lFy' in p) {
    o.rFy = -(p.lFy ?? 0);
    o.lFy = -(p.rFy ?? 0);
  }
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
/** The mirror image of a pose (his left side for his right). The right fist's grip turns with it. */
export function mirror(p) {
  const o = { ...p };
  for (const k of NEG) if (k in p) o[k] = -p[k];
  for (const [a, b] of PAIRS) {
    if (a in p || b in p) {
      o[a] = flipX(p[b] ?? NEUTRAL[b]);
      o[b] = flipX(p[a] ?? NEUTRAL[a]);
    }
  }
  if ('rFy' in p || 'lFy' in p) {
    o.rFy = -(p.lFy ?? NEUTRAL.lFy);
    o.lFy = -(p.rFy ?? NEUTRAL.rFy);
  }
  if ('sw' in p) o.sw = [-p.sw[0], p.sw[1]];
  if ('swF' in p) o.swF = flipX(p.swF);
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
const PART_MIRROR = { fistR: 'fistL', fistL: 'fistR', footR: 'footL', footL: 'footR', kneeR: 'kneeL', kneeL: 'kneeR', elbowR: 'elbowL', elbowL: 'elbowR' };

/** A hand pulled `k` of the way back toward his guard (a follow-through). */
const back = (v, g, k) => v.map((x, i) => x + (g[i] - x) * k);
/** The follow-through of a strike pose: the striking hand(s) drawn back a little, the rest held. */
function follow(hit, k = 0.25) {
  const o = { ...hit };
  if (hit.rH) o.rH = back(hit.rH, HANDS.rH, k);
  if (hit.lH) o.lH = back(hit.lH, HANDS.lH, k);
  if (Array.isArray(hit.rF) && hit.rF.length === 3 && hit.rF[1] > ANK + 0.1) o.rF = [hit.rF[0], hit.rF[1] - (hit.rF[1] - ANK) * k * 0.6, hit.rF[2] * (1 - k * 0.4)];
  if (Array.isArray(hit.lF) && hit.lF.length === 3 && hit.lF[1] > ANK + 0.1) o.lF = [hit.lF[0], hit.lF[1] - (hit.lF[1] - ANK) * k * 0.6, hit.lF[2] * (1 - k * 0.4)];
  return o;
}

/**
 * A strike's keys: (load) the coil, held through any bait hold, (1.0) the strike, easing in like a
 * blow that accelerates, (1.6 - 2.0) the follow-through. `pre`: a pose half way into the coil (the
 * weight shifting first); `left`: the mirror image.
 */
export function strikeKeys({ coil, hit, after = null, pre = null, cock = 0.7, left = false }) {
  const m = left ? mirror : (p) => p;
  const fo = after ?? follow(hit);
  const keys = [];
  if (pre) keys.push([cock * 0.45, F(m(pre))]);
  const c = F(m(coil)), h = F(m(hit));
  keys.push([cock, c]);
  // half way through the strike: a foot that moves from the coil to the strike is LIFTED (a step, not
  // a slide); the rest of the body a quarter of the way (the strike eases in)
  keys.push([cock + (1 - cock) * 0.5, { ...stepMid(c, h, 0.25), e: 'i' }]);
  keys.push([1.0, { ...h, e: 'l' }]);
  keys.push([1.6, { ...F(m(fo)), e: 'o' }]);
  keys.push([2.0, F(m(fo))]);
  return keys;
}

const v3 = (p) => (p.length === 2 ? [p[0], ANK, p[1]] : p);
/** A key between two key poses at k (every field), the feet that move between them lifted 0.12 m. */
function stepMid(a, b, k) {
  const o = {};
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (f === 'e') continue;
    const x = a[f] ?? b[f], y = b[f] ?? a[f];
    if (f === 'rF' || f === 'lF') {
      const p = v3(x), q = v3(y), d = Math.hypot(q[0] - p[0], q[2] - p[2]);
      o[f] = [p[0] + (q[0] - p[0]) * 0.5, (p[1] + q[1]) * 0.5 + (d > 0.12 ? 0.12 : 0), p[2] + (q[2] - p[2]) * 0.5];
    } else if (Array.isArray(x)) o[f] = x.map((v, i) => v + ((y[i] ?? v) - v) * k);
    else if (typeof x === 'number') o[f] = x + (y - x) * k;
    else o[f] = y;
  }
  return o;
}

/** Feet for the driving foot: 'R' (the default authoring) or 'L' (the mirror steps: a string walks). */
const stepFeet = (p, step) => (step === 'L' ? { ...p, ...mirrorFeet(pickFeet(p)) } : p);
const pickFeet = (p) => {
  const o = {};
  for (const k of ['rF', 'lF', 'rK', 'lK', 'rFy', 'lFy']) if (k in p) o[k] = p[k];
  return o;
};

// ---------------------------------------------------------------- the punches
/** The key poses of each punch (right-side authoring; `left` mirrors). `z`: its zone. */
const PUNCH = {
  // the lead (left) hand snapped straight out, the lead foot stepping in
  jab: {
    part: 'fistL', cock: 0.78,
    coil: { yaw: -0.52, bY: -0.17, pitch: 0.06, rH: [0.12, 0.06, 0.2], lH: [0.02, 0.04, 0.24], lP: [0.8, -0.7, -0.2], ...OR },
    hit: { yaw: -0.7, bY: -0.2, bZ: 0.1, pitch: 0.1, spY: -0.1, rH: [0.12, 0.06, 0.18], lH: [-0.04, 0.02, 0.55], lP: [0.8, -0.3, -0.4], ...OR_IN },
    z: () => ({ kind: 'sector', r: RE.fist, ang: 0.55 }),
  },
  // the rear (right) hand driven straight through, the hips and the rear foot turning over
  cross: {
    part: 'fistR', cock: 0.76,
    coil: { yaw: -0.62, bY: -0.19, pitch: 0.06, hip: -0.12, rH: [0.06, 0.02, 0.16], lH: [0.02, 0.1, 0.34], ...OR },
    hit: { yaw: 0.36, bY: -0.22, bZ: 0.12, pitch: 0.1, hip: 0.18, spY: 0.1, rH: [0.12, 0.0, 0.55], rP: [-0.8, -0.3, -0.4], lH: [-0.04, 0.08, 0.18], ...PIVOT },
    z: () => ({ kind: 'sector', r: RE.fist, ang: 0.55 }),
  },
  // the rear fist swung round level, the elbow up, the whole body turning behind it
  hook: {
    part: 'fistR',
    coil: { yaw: -0.74, bY: -0.21, hip: -0.16, rH: [-0.24, 0.06, 0.18], rP: [-0.9, 0.1, -0.3], lH: [0.02, 0.12, 0.3], ...OR },
    hit: { yaw: 0.62, bY: -0.23, bZ: 0.1, roll: -0.06, hip: 0.22, spY: 0.12, rH: [0.28, 0.02, 0.46], rP: [-0.6, 0.5, 0.2], lH: [-0.04, 0.1, 0.18], ...PIVOT },
    z: () => ({ kind: 'sector', r: RE.fist, ang: 0.95 }),
  },
  // sunk low, the rear fist driven up under the guard as the legs straighten
  uppercut: {
    part: 'fistR',
    coil: { yaw: -0.42, bY: -0.38, pitch: 0.2, hip: -0.1, rH: [0.02, -0.3, 0.2], rP: [-0.8, -0.6, 0.0], lH: [0.0, 0.1, 0.3], ...LOW },
    hit: { yaw: 0.3, bY: -0.04, pitch: -0.14, spX: -0.08, hip: 0.14, rH: [0.12, 0.2, 0.47], rP: [-0.8, -0.6, 0.3], lH: [-0.04, 0.0, 0.2], ...PIVOT, rF: [-0.18, -0.12] },
    z: () => ({ kind: 'sector', r: RE.fist, ang: 0.6 }),
  },
  // the rear arm folded across the chest, whipped out back-handed to the side
  backfist: {
    part: 'fistR',
    coil: { yaw: 0.5, bY: -0.2, hip: 0.1, rH: [0.32, 0.06, 0.16], rP: [-0.6, 0.2, 0.5], lH: [0.0, 0.06, 0.3], ...OR },
    hit: { yaw: -0.52, bY: -0.21, bZ: 0.06, hip: -0.12, rH: [-0.26, 0.04, 0.5], rP: [-0.9, 0.2, -0.2], lH: [0.02, 0.06, 0.26], ...OR_IN },
    z: () => ({ kind: 'sector', r: RE.fist, ang: 0.95 }),
  },
  // the right palm drawn back to the hip, thrown out on a long lunge
  palm: {
    part: 'palms',
    coil: { yaw: -0.62, bY: -0.27, pitch: 0.06, hip: -0.12, rH: [0.0, -0.14, 0.06], rP: [-0.8, -0.6, -0.4], lH: [0.0, 0.06, 0.36], ...LOW },
    hit: { yaw: 0.3, bY: -0.3, bZ: 0.2, pitch: 0.12, hip: 0.16, spY: 0.06, rH: [0.1, -0.06, 0.55], rP: [-0.8, -0.5, -0.2], lH: [-0.06, -0.12, 0.1], ...LUNGE },
    z: () => ({ kind: 'line', r: RE.line, w: RE.lineW }),
  },
  // both palms drawn to the hips, thrust out together, the body square
  double: {
    part: 'palms',
    coil: { yaw: -0.12, bY: -0.32, pitch: 0.04, rH: [0.06, -0.16, 0.08], lH: [-0.06, -0.16, 0.08], rP: [-0.8, -0.7, -0.4], lP: [0.8, -0.7, -0.4], ...LOW },
    hit: { yaw: 0.0, bY: -0.33, bZ: 0.22, pitch: 0.14, rH: [0.16, -0.06, 0.52], lH: [-0.16, -0.06, 0.52], rP: [-0.8, -0.4, -0.2], lP: [0.8, -0.4, -0.2], ...LUNGE },
    z: () => ({ kind: 'line', r: RE.line, w: 1.0 }),
  },
  // both fists raised over the head, brought down together onto the floor before him
  hammer: {
    part: 'palms',
    coil: { yaw: 0.0, bY: -0.06, pitch: -0.14, spX: -0.08, rH: [0.16, 0.5, 0.1], lH: [-0.16, 0.5, 0.1], rP: [-0.7, 0.5, -0.4], lP: [0.7, 0.5, -0.4], ...OR },
    hit: { yaw: 0.0, bY: -0.46, pitch: 0.42, spX: 0.2, hdX: 0.3, rH: [0.14, -0.22, 0.46], lH: [-0.14, -0.22, 0.46], rP: [-0.7, -0.2, -0.3], lP: [0.7, -0.2, -0.3], ...LOW },
    z: () => ({ kind: 'ring', r: 3.0 }),
  },
};

/**
 * One punch beat. `kind`: a PUNCH name; `o`: { left, cock, step, ...beat overrides }. Knock-back: a
 * white blow 0.7 m, the others 1.5 (as the Lord's cuts).
 */
export function punch(kind, tell, windup, damage, o = {}) {
  const P = PUNCH[kind];
  if (!P) throw new Error(`ascendant: no punch "${kind}"`);
  const { left = false, cock = P.cock ?? 0.7, step = null, ...extra } = o;
  const coil = step ? stepFeet(P.coil, step) : P.coil, hit = step ? stepFeet(P.hit, step) : P.hit;
  const part = left ? PART_MIRROR[P.part] ?? P.part : P.part;
  return {
    tell, windup, active: kind === 'hammer' ? 0.12 : 0.08, damage, knockback: tell === N ? 0.7 : 1.5,
    zone: P.z(), part, keys: strikeKeys({ coil, hit, cock, left }), ...extra, cock,
  };
}

// ---------------------------------------------------------------- the kicks
const rotXZ = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
const KICK = {
  // the rear knee chambered high, the foot snapped straight out at the belly; he leans back over it
  front: {
    part: 'footR',
    coil: { yaw: -0.2, bY: -0.12, pitch: -0.08, rF: [-0.12, 0.44, 0.16], rK: [0, 0.3, 1], lF: [0.16, 0.08], lFy: 0.1, ...HANDS },
    hit: { yaw: -0.1, bY: -0.12, pitch: -0.24, spX: -0.06, rF: [-0.08, 0.8, 0.8], rK: [0, 0.6, 1], lF: [0.16, 0.04], lFy: 0.1, rH: [0.1, 0.04, 0.16], lH: [-0.02, 0.04, 0.28] },
    z: () => ({ kind: 'sector', r: RE.kick, ang: 0.55 }),
  },
  // turned side-on, the knee drawn across, the heel driven out along the line of the hips
  side: {
    part: 'footR',
    coil: { yaw: 1.0, roll: -0.1, bY: -0.16, rF: [-0.02, 0.46, 0.1], rK: [-0.6, 0.3, 0.6], lF: [0.1, -0.06], lFy: 1.3, rH: [0.1, 0.1, 0.2], lH: [0.0, 0.06, 0.2] },
    hit: { yaw: 1.45, roll: -0.38, bY: -0.16, pitch: 0.05, rF: [0.0, 0.86, 0.92], rK: [-0.9, 0.3, 0.2], lF: [0.1, -0.1], lFy: 1.5, rH: [0.08, 0.0, 0.1], lH: [0.1, 0.1, 0.2] },
    // (the heel is out a metre ahead of his root: a zone round the foot, not round him)
    z: () => ({ kind: 'sector', r: 1.25, ang: 0.6, fwd: 0.95 }),
  },
  // the hip turned over, the shin swung round level at the ribs
  round: {
    part: 'footR',
    // (the knee points up and over through the whole kick, the chamber's: a knee keyed toward the target
    // was crossed by the leg as it swung from his side to his front, and it flipped from frame to frame,
    // ADR-162)
    coil: { yaw: 0.4, bY: -0.14, roll: -0.08, rF: [-0.36, 0.5, 0.0], rK: [-0.6, 0.7, 0.4], lF: [0.12, 0.08], lFy: 0.9, ...HANDS },
    hit: { yaw: 1.2, roll: -0.35, bY: -0.14, rF: [0.06, 1.0, 0.78], rK: [-0.4, 0.85, 0.35], lF: [0.12, 0.04], lFy: 1.6, rH: [0.04, 0.0, 0.1], lH: [0.06, 0.12, 0.28] },
    z: () => ({ kind: 'sector', r: RE.kick, ang: 0.85 }),
  },
  // the leg raised straight up over his head, the heel brought down like an axe
  axe: {
    part: 'footR',
    // (the leg swung up from the side in a crescent first: which leg, and that it is going high)
    pre: { yaw: 0.3, bY: -0.12, pitch: -0.1, roll: -0.12, rF: [-0.5, 0.75, 0.25], rK: [-0.6, 0.2, 0.6], lF: [0.14, 0.0], lFy: 0.4, rH: [0.06, 0.14, 0.22], lH: [0.06, 0.16, 0.3] },
    coil: { yaw: -0.1, bY: -0.06, pitch: -0.22, spX: -0.08, rF: [-0.08, 1.45, 0.45], rK: [0, 0, 1], lF: [0.14, 0.0], lFy: 0.2, rH: [0.08, 0.14, 0.24], lH: [0.04, 0.16, 0.3] },
    hit: { yaw: -0.05, bY: -0.32, pitch: 0.24, hdX: 0.2, rF: [-0.1, ANK + 0.02, 0.82], rK: [0, 0, 1], lF: [0.15, -0.22], rH: [0.1, 0.0, 0.2], lH: [0.0, 0.0, 0.24] },
    z: () => ({ kind: 'ring', r: 2.6, fwd: 0.6 }),
  },
  // off the floor: the rear leg tucked, the lead heel driven out (the beat lifts him: FLY_LIFT)
  flying: {
    part: 'footR',
    coil: { yaw: 0.3, bY: -0.42, pitch: 0.16, rF: [-0.18, -0.12], lF: [0.18, 0.22], rK: [-0.4, 0.2, 1], lK: [0.4, 0.2, 1], rH: [0.08, -0.1, 0.2], lH: [0.0, -0.06, 0.26] },
    hit: { yaw: 0.9, roll: -0.2, bY: -0.04, pitch: -0.26, rF: [-0.02, 0.56, 0.92], rK: [-0.4, 0.6, 0.6], lF: [0.16, 0.6, -0.05], lK: [0.3, 1, 0.6], flat: 0, rH: [0.06, 0.1, 0.14], lH: [0.1, 0.16, 0.24] },
    z: () => ({ kind: 'line', r: RE.line, w: RE.lineW }),
  },
  // both hands on the opponent's neck drawing him down onto a rising knee
  knee: {
    part: 'kneeR',
    coil: { yaw: -0.3, bY: -0.14, rH: [0.12, 0.12, 0.36], lH: [-0.02, 0.12, 0.42], rF: [-0.18, -0.3], lF: [0.18, 0.2] },
    hit: { yaw: -0.1, bY: -0.05, pitch: -0.06, bZ: 0.1, rF: [-0.1, 0.44, 0.18], rK: [0, 0.7, 1], lF: [0.16, 0.06], lFy: 0.1, rH: [0.12, -0.05, 0.42], lH: [-0.06, -0.05, 0.44] },
    z: () => ({ kind: 'sector', r: 1.25, ang: 0.75, fwd: 0.4 }),
  },
};
/** The flying kick's root: up off the floor through the windup, still in the air at the impact. */
const FLY_LIFT = (cock) => [[cock * 0.9, 0], [cock + (1 - cock) * 0.55, 1.2], [1.0, 0.82], [1.6, 0.4], [2.0, 0]];

/** The low sweep: dropped to the floor, the leg swung round once at the ankles (a ring). */
function sweepKeys(cock, left) {
  const m = left ? mirror : (p) => p;
  const body = { bY: -0.58, pitch: 0.2, hdX: 0.2, rH: [0.1, -0.48, 0.24], lH: [-0.06, -0.5, 0.3], flat: 0.8 };
  // (the planted foot under him, the sweeping leg out at `a` rad round: feet are model space, so they
  // are carried round with the body by hand, as the Lord's spinFeet)
  const legs = (a) => {
    const r = rotXZ(-0.72, 0.18, a), l = rotXZ(0.16, -0.04, a);
    return { rF: [r[0], ANK, r[1]], lF: [l[0], ANK, l[1]], rK: [-0.6, 0.3, 0.6], lK: [0.6, 0.4, 0.6], rFy: -1.2 + a, lFy: 0.4 + a };
  };
  // the coil reads as the sweep coming: he drops onto his hands with the sweeping leg drawn in under him
  // (knee to the chest), wound round the other way, then it shoots out and goes round at the ankles
  const tuck = { bY: -0.62, pitch: 0.3, hdX: 0.25, rH: [0.12, -0.5, 0.3], lH: [-0.08, -0.52, 0.34], flat: 0.8, yaw: 1.2, rF: [-0.1, ANK + 0.08, 0.04], lF: [0.18, -0.06], rK: [-0.3, 0.6, 1], lK: [0.6, 0.4, 0.6], rFy: -0.4, lFy: 0.6 };
  return [
    [cock * 0.5, F(m({ ...tuck, bY: -0.4, pitch: 0.16, rF: [-0.2, -0.1] }))],
    [cock, F(m(tuck))],
    [cock + (1 - cock) * 0.5, { ...F(m({ ...body, yaw: 0.8, ...legs(0.4) })), e: 'i' }],
    [1.0, { ...F(m({ ...body, yaw: 0.4, ...legs(0) })), e: 'l' }],
    [1.33, { ...F(m({ ...body, yaw: 0.4 - TAU / 3, ...legs(-TAU / 3) })), e: 'l' }],
    [1.66, { ...F(m({ ...body, yaw: 0.4 - (2 * TAU) / 3, ...legs((-2 * TAU) / 3) })), e: 'l' }],
    [2.0, { ...F(m({ ...body, yaw: 0.4 - TAU, ...legs(-TAU) })), e: 'l' }],
    [2.001, { ...F(m({ ...body, yaw: 0.4, ...legs(0) })), e: 'h' }],
  ];
}

/**
 * One kick beat. `kind`: front · side · round · sweep · axe · flying · knee; `o`: { left, cock, ...beat
 * overrides }. The flying kick lifts him (`lift`) and hits in the air (`air`); the sweep is a ring.
 */
export function kick(kind, tell, windup, damage, o = {}) {
  const { left = false, cock: c0 = null, ...extra } = o;
  if (kind === 'sweep') {
    const cock = c0 ?? 0.62;
    return {
      tell, windup, active: 0.22, damage, knockback: 2.4, zone: { kind: 'ring', r: 2.2 }, part: left ? 'footL' : 'footR', sweep: true,
      track: 0.65, keys: sweepKeys(cock, left), ...extra, cock,
    };
  }
  const P = KICK[kind];
  if (!P) throw new Error(`ascendant: no kick "${kind}"`);
  const cock = c0 ?? (kind === 'flying' ? 0.58 : 0.68);
  const beat = {
    tell, windup, active: 0.1, damage, knockback: tell === N ? 1.0 : 2.0, zone: P.z(), part: left ? PART_MIRROR[P.part] : P.part,
    track: 0.7, keys: strikeKeys({ coil: P.coil, hit: P.hit, pre: P.pre ?? null, cock, left }),
  };
  if (kind === 'flying') Object.assign(beat, { air: true, lift: FLY_LIFT(cock), track: 0.55 });
  return { ...beat, ...extra, cock };
}

// ---------------------------------------------------------------- the elbow, the shoulder
const ELBOW = {
  coil: { yaw: -0.82, bY: -0.22, hip: -0.12, rH: [0.02, 0.08, 0.06], rP: [-0.9, 0.0, -0.4], lH: [0.0, 0.1, 0.32], ...LOW },
  hit: { yaw: 0.95, bY: -0.27, bZ: 0.16, pitch: 0.08, hip: 0.2, rH: [0.3, 0.12, 0.12], rP: [-0.4, 0.15, 1], lH: [0.06, 0.06, 0.16], ...LUNGE },
};
/** The dash elbow: the rear elbow driven point-first through the opponent on a lunge (a line). */
export function elbow(tell, windup, damage, o = {}) {
  const { left = false, cock = 0.72, ...extra } = o;
  return {
    tell, windup, active: 0.1, damage, knockback: tell === N ? 1.0 : 2.0, zone: { kind: 'line', r: RE.line, w: RE.lineW }, part: left ? 'elbowL' : 'elbowR',
    keys: strikeKeys({ coil: ELBOW.coil, hit: ELBOW.hit, cock, left }), ...extra, cock,
  };
}
const SHOULDER = {
  coil: { yaw: -0.9, bY: -0.32, pitch: 0.16, rH: [0.12, 0.0, 0.18], lH: [0.06, -0.06, 0.14], ...LOW },
  hit: { yaw: -1.32, bY: -0.29, bZ: 0.2, pitch: 0.1, roll: 0.1, rH: [0.14, 0.0, 0.16], lH: [0.08, -0.12, 0.06], ...LUNGE },
};
/** The shoulder check: sunk low and driven in lead shoulder first (a line). */
export function shoulder(tell, windup, damage, o = {}) {
  const { left = false, cock = 0.72, ...extra } = o;
  return {
    tell, windup, active: 0.1, damage, knockback: tell === N ? 1.2 : 2.4, zone: { kind: 'line', r: RE.line, w: 1.0 }, part: 'shoulder',
    keys: strikeKeys({ coil: SHOULDER.coil, hit: SHOULDER.hit, cock, left }), ...extra, cock,
  };
}

// ---------------------------------------------------------------- the transformation
/** A form's transformation (a transition): he sinks, the fists clenched at his hips, the power drawn
 *  up through him (fx.transformGather); then he straightens and throws his arms wide as it breaks
 *  out of him: the shock ring (fx.transformNova). */
export function transform(form) {
  const T = TUNING.transform;
  return {
    label: form === 2 ? 'Golden Ascension' : 'Thunder Ascension', phase: form, weight: 0, transition: true, cooldown: 0, band: [0, 99], recovery: 0.6,
    beats: [{
      tell: R, windup: T.windup, fixed: true, active: 0.15, damage: T.damage, knockback: T.knockback,
      zone: { kind: 'ring', r: T.ringRadius }, ring: T.ringRadius, part: 'feet', track: 0, close: 0,
      // (an act in five beats over the 2.3 s: the foot planted, up with the fists clenched, the head
      // thrown back and the chest opened as the light rises, a last gathering, and the burst; the
      // hair and the light of the new form show at the burst: ascendant.js dressPhase)
      cock: 0.9,
      keys: [
        // on one knee (where the deathblow left him), the head bowed, a fist on the floor
        [0.0, F({ bY: -0.55, pitch: 0.28, yaw: 0, hdX: 0.55, rH: [0.06, -0.52, 0.32], lH: [0.02, -0.4, 0.3], rF: [-0.14, 0.3], lF: [0.17, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7 })],
        // the fist pushes off the floor; he plants the back foot and lifts his head
        [0.14, F({ bY: -0.5, pitch: 0.2, yaw: 0, hdX: 0.2, rH: [0.0, -0.4, 0.3], lH: [0.0, -0.36, 0.3], rF: [-0.16, 0.3], lF: [0.18, -0.3], rK: [0, 0, 1], lK: [0.2, -0.5, 0.7], flat: 0.8 })],
        // up: a wide, low stance, both fists clenched at his sides, the arms tense
        [0.34, F({ bY: -0.36, pitch: 0.06, yaw: 0, hdX: 0.05, rH: [-0.1, -0.44, 0.02], rP: [-0.9, -0.3, -0.6], lH: [0.1, -0.44, 0.02], lP: [0.9, -0.3, -0.6], rF: [-0.32, 0.02], lF: [0.32, -0.02], rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7], rFy: -0.3, lFy: 0.3, sw: [0.0, -1.3] })],
        // the light rises through him: the head goes back, the chest opens, the fists pushed down and out
        [0.62, F({ bY: -0.3, pitch: -0.14, yaw: 0, hdX: -0.45, spX: -0.2, rH: [-0.2, -0.42, -0.04], rP: [-0.9, -0.2, -0.5], lH: [0.2, -0.42, -0.04], lP: [0.9, -0.2, -0.5], rF: [-0.34, 0.02], lF: [0.34, -0.02], rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7], rFy: -0.3, lFy: 0.3, sw: [-0.5, -1.0] })],
        [0.8, F({ bY: -0.26, pitch: -0.2, yaw: 0, hdX: -0.5, spX: -0.24, rH: [-0.26, -0.38, -0.06], lH: [0.26, -0.38, -0.06], rF: [-0.34, 0.02], lF: [0.34, -0.02], rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7], rFy: -0.3, lFy: 0.3, sw: [-0.6, -0.9] })],
        // the last gathering: he folds over it, the forearms crossed before the chest
        [0.94, F({ bY: -0.42, pitch: 0.22, yaw: 0, hdX: 0.3, spX: 0.1, rH: [0.2, -0.04, 0.24], rP: [-0.8, -0.5, -0.3], lH: [-0.2, -0.02, 0.26], lP: [0.8, -0.5, -0.3], rF: [-0.34, 0.02], lF: [0.34, -0.02], rK: [-0.7, 0, 0.7], lK: [0.7, 0, 0.7], rFy: -0.3, lFy: 0.3, sw: [1.0, 0.2] })],
        // it breaks out of him: he straightens, the arms thrown wide, the head back
        [1.0, { ...F({ bY: -0.08, pitch: -0.22, yaw: 0, hdX: -0.35, spX: -0.16, rH: [-0.44, 0.1, 0.12], rP: [-0.9, 0.2, -0.3], lH: [0.44, 0.1, 0.12], lP: [0.9, 0.2, -0.3], rF: [-0.3, 0.0], lF: [0.3, 0.0], rK: [-0.5, 0, 0.8], lK: [0.5, 0, 0.8], rFy: -0.3, lFy: 0.3, sw: [-1.2, 0.2] }), e: 'o' }],
        [2.0, F({ bY: -0.1, pitch: -0.16, yaw: 0, hdX: -0.25, rH: [-0.4, 0.06, 0.14], lH: [0.4, 0.06, 0.14], rF: [-0.3, 0.0], lF: [0.3, 0.0], rK: [-0.5, 0, 0.8], lK: [0.5, 0, 0.8], rFy: -0.3, lFy: 0.3, sw: [-1.2, 0.2] })],
      ],
    }],
  };
}

// ---------------------------------------------------------------- the move files
/** Weights for one form only. */
const W = (f, w) => [1, 2, 3].map((k) => (k === f ? w : 0));
/** The builders object every move file is given (see the header). */
export const X = Object.freeze({
  TELL: Object.freeze({ N, B, R, K }), TUNING, W, F, mirror, strikeKeys, follow, rotXZ,
  punch, kick, elbow, shoulder, transform,
  feet: Object.freeze({ OR, OR_IN, PIVOT, LOW, LUNGE, SOUTH }), HANDS, FIST_UP, FIST_FLAT, ANK, TAU,
});

export const MOVES = { ...meleeMoves(X), ...kiMoves(X), ...terrainMoves(X) };
export const MOVE_NAMES = Object.keys(MOVES);
/** Each form's flurry (the kit's `streakMove`), its transformation, its counter out of his guard. */
export const STREAKS = Object.freeze(['streakFlurry', 'streakFlurry2', 'streakFlurry3']);
export const TRANSITIONS = Object.freeze({ 2: 'ascend2', 3: 'ascend3' });
export const COUNTERS = Object.freeze(['riposte', 'riposte2', 'riposte3']);
/** Every counter of each form (the kit draws one at random out of his deflect; the first is COUNTERS'). */
export const COUNTER_LISTS = Object.freeze([
  Object.freeze(['riposte', 'riposteKnee']),
  Object.freeze(['riposte2', 'riposteVanish']),
  Object.freeze(['riposte3', 'riposteBolt']),
]);

// ---------------------------------------------------------------- reaction clips (no hits)
// His guard is his FOREARMS (the engine's guard keys, duelist/guard.js semantics): `wardHold` both
// forearms raised before the face; `ward` the left forearm stood up across his left side, `wardR` the
// right across his right, `wardHigh` both crossed over the head; `deflect` the lead palm beats the
// blade aside and the body turns in behind it; `clash` (the lost lock's shove) as a ward.
const WARD_L = { yaw: -0.36, bY: -0.24, bZ: -0.06, pitch: -0.04, spX: 0.04, hdY: 0.34, lH: [0.04, 0.36, 0.3], lP: [0.9, -0.5, 0.1], rH: [0.14, 0.22, 0.26], rP: [-0.8, -0.7, -0.1], sw: FIST_UP };
const WARD_R = { yaw: 0.16, bY: -0.24, bZ: -0.06, pitch: -0.04, hdY: -0.1, rH: [-0.04, 0.36, 0.3], rP: [-0.9, -0.5, 0.1], lH: [-0.08, 0.22, 0.28], lP: [0.8, -0.7, -0.1], sw: FIST_UP };
const WARD_HIGH = { yaw: -0.1, bY: -0.27, bZ: -0.03, pitch: -0.05, spX: -0.04, hdX: 0.08, hdY: 0.08, rH: [0.18, 0.44, 0.24], rP: [-0.9, 0.1, -0.3], lH: [-0.16, 0.46, 0.26], lP: [0.9, 0.1, -0.3], sw: [0.9, 0.3] };
const HOLD = { yaw: -0.34, bY: -0.24, hdY: 0.3, hdX: 0.12, rH: [0.12, 0.32, 0.28], rP: [-0.8, -0.6, 0.0], lH: [-0.04, 0.34, 0.32], lP: [0.8, -0.6, 0.0], sw: FIST_UP };
const BEAT = { yaw: -0.78, bY: -0.24, bZ: 0.08, pitch: 0.07, hdY: 0.6, lH: [-0.32, 0.06, 0.42], lP: [0.9, -0.2, -0.2], rH: [0.14, 0.04, 0.3], rP: [-0.8, -0.6, -0.2], sw: FIST_UP };
const met = (Wd, dur = 0.34) => ({
  dur, hold: true,
  keys: [
    [0, { ...Wd }],
    [0.07, { e: 'o', ...Wd, bZ: Wd.bZ - 0.12, bY: Wd.bY - 0.04, pitch: Wd.pitch - 0.08, spX: (Wd.spX ?? 0.02) - 0.08 }],
    [0.2, { ...Wd, bZ: Wd.bZ - 0.03 }],
  ],
});
/** On one knee: one fist on the floor, the head bowed (the deathblow's opening). */
const KNEEL = { bY: -0.52, pitch: 0.24, spX: 0.1, hdX: 0.5, yaw: 0, rF: [-0.12, 0.32], lF: [0.17, -0.42], rK: [0, 0, 1], lK: [0.1, -0.85, 0.5], flat: 0.7 };
/** Standing, the arms folded, the eyes closed (he waits for a challenger). */
const FOLDED = {
  bY: -0.02, bZ: 0, pitch: -0.03, yaw: 0, roll: 0, hip: 0, spX: -0.04, spY: 0, hdX: 0.14, hdY: 0,
  rH: [0.2, -0.12, 0.17], rP: [-0.9, -0.3, -0.4], lH: [-0.2, -0.08, 0.19], lP: [0.9, -0.3, -0.4],
  rF: [-0.15, 0.0], lF: [0.15, 0.0], rK: [-0.1, 0, 1], lK: [0.1, 0, 1], rFy: -0.15, lFy: 0.15, flat: 1, sw: [1.4, 0.2],
};

export const CLIPS = {
  ward: met(WARD_L),
  wardR: met(WARD_R),
  wardHigh: met(WARD_HIGH, 0.38),
  clash: met(WARD_L, 0.26),
  deflect: { dur: 0.24, keys: [[0, { ...WARD_L, bZ: 0.0 }], [0.07, { e: 'o', ...BEAT }], [0.17, { ...BEAT, bZ: 0.05 }]] },
  wardHold: { dur: 1, hold: true, keys: [[0, { ...HOLD }]] },
  flinch: { dur: 0.26, keys: [[0.07, { e: 'o', spX: -0.08, hdX: -0.14, bZ: -0.05, yaw: -0.2 }]] },
  // a hop back, both feet off the floor for a moment
  backstep: {
    dur: 0.42,
    keys: [
      [0.1, { bY: -0.1, pitch: -0.1, rF: [-0.16, 0.12, -0.1], lF: [0.16, 0.16, 0.12], rK: [-0.2, 0.2, 1], lK: [0.2, 0.2, 1], flat: 0.3 }],
      [0.26, { bY: -0.08, pitch: -0.06, rF: [-0.16, 0.1, -0.14], lF: [0.16, 0.12, 0.08], flat: 0.4 }],
      [0.38, { bY: -0.2, pitch: 0.04, rF: [-0.2, -0.24], lF: [0.2, 0.26], flat: 0.95 }],
    ],
  },
  sidestep: {
    dur: 0.38,
    keys: [
      [0.12, { bY: -0.1, roll: 0.12, rF: [-0.2, 0.1, -0.1], lF: [0.2, 0.14, 0.1], rK: [-0.2, 0.2, 1], lK: [0.2, 0.2, 1], flat: 0.4 }],
      [0.28, { bY: -0.16, roll: 0.04, rF: [-0.22, -0.2], lF: [0.22, 0.24], flat: 0.9 }],
    ],
  },
  stagger: {
    dur: 0.8,
    keys: [
      [0.12, { e: 'o', pitch: -0.22, bZ: -0.1, bY: -0.14, rH: [-0.26, -0.12, 0.12], lH: [0.26, -0.06, 0.14], hdX: -0.22, rF: [-0.16, -0.36], lF: [0.2, 0.1] }],
      [0.5, { pitch: -0.08, bY: -0.16, rH: [-0.2, -0.16, 0.18], lH: [0.2, -0.1, 0.2] }],
    ],
  },
  // his last blow parried: the striking arm knocked up and away, a step back
  recoil: {
    dur: 1.0,
    keys: [
      [0.1, { e: 'o', pitch: -0.24, bZ: -0.1, yaw: -0.5, rH: [-0.2, 0.3, 0.12], rP: [-0.8, 0.4, -0.4], lH: [0.28, 0.0, 0.08], hdX: -0.2, rF: [-0.18, -0.4], lF: [0.2, 0.08] }],
      [0.6, { pitch: -0.12, yaw: -0.4, rH: [-0.1, 0.08, 0.2], lH: [0.2, 0.04, 0.16] }],
    ],
  },
  reeling: {
    dur: 1.45,
    keys: [
      [0.12, { e: 'o', pitch: -0.34, bZ: -0.14, bY: -0.12, yaw: -0.3, rH: [-0.34, 0.08, 0.04], rP: [-0.9, 0.3, -0.3], lH: [0.32, 0.1, 0.0], lP: [0.9, 0.3, 0.0], hdX: -0.3, rF: [-0.12, 0.05], lF: [0.2, -0.5] }],
      [0.6, { pitch: -0.2, bY: -0.2, yaw: -0.1, rH: [-0.3, -0.05, 0.12], lH: [0.3, 0.0, 0.1], hdX: -0.1, rF: [-0.14, -0.15], lF: [0.18, -0.45] }],
      [1.1, { pitch: -0.05, bY: -0.18, rH: [-0.1, -0.1, 0.24], lH: [0.1, -0.05, 0.28] }],
    ],
  },
  // stepped on (a mikiri): pitched forward over the planted arm, then thrown back
  trampled: {
    dur: 1.5,
    keys: [
      [0.1, { e: 'o', pitch: 0.42, bY: -0.34, bZ: 0.1, rH: [0.06, -0.36, 0.46], rP: [-0.6, -0.6, 0.2], lH: [0.0, -0.2, 0.3], hdX: 0.45, rF: [-0.08, -0.48], lF: [0.22, 0.7] }],
      [0.75, { pitch: 0.35, bY: -0.3, rH: [0.04, -0.34, 0.42], hdX: 0.4 }],
      [1.0, { e: 'o', pitch: -0.2, bY: -0.16, bZ: -0.1, rH: [-0.2, 0.0, 0.16], lH: [0.24, 0.04, 0.1], hdX: -0.1, rF: [-0.18, -0.4], lF: [0.2, 0.08] }],
    ],
  },
  // the lock: both forearms crossed against the blade, pressing in
  lock: {
    dur: 3, hold: true,
    keys: [
      [0.1, { e: 'o', bY: -0.24, bZ: 0.1, pitch: 0.14, yaw: -0.1, hdY: 0.1, rH: [0.14, 0.18, 0.4], rP: [-0.7, -0.3, -0.2], lH: [-0.12, 0.2, 0.42], lP: [0.7, -0.3, -0.2], rF: [-0.2, -0.4], lF: [0.2, 0.36], sw: [0.9, 0.3] }],
      [3, { bY: -0.26, bZ: 0.12, pitch: 0.16, yaw: -0.1, rH: [0.14, 0.18, 0.42], lH: [-0.12, 0.2, 0.44], rF: [-0.2, -0.42], lF: [0.2, 0.38], sw: [0.9, 0.3] }],
    ],
  },
  broken: {
    dur: 4.5, hold: true,
    keys: [
      [0.25, { e: 'o', ...KNEEL, rH: [0.06, -0.52, 0.32], rP: [-0.7, -0.4, -0.3], lH: [0.06, -0.4, 0.2], lP: [0.6, -0.3, 0.3], sw: [0.2, -1.2] }],
      [4.2, { ...KNEEL, hdX: 0.4, rH: [0.06, -0.52, 0.32], lH: [0.06, -0.38, 0.2], sw: [0.2, -1.2] }],
      [4.5, { ...KNEEL, bY: -0.4, hdX: 0.2, rH: [0.04, -0.4, 0.3], lH: [0.06, -0.3, 0.24] }],
    ],
  },
  executed: {
    dur: 1.2, hold: true,
    keys: [
      [0.0, { ...KNEEL, rH: [0.06, -0.52, 0.32], lH: [0.06, -0.4, 0.2] }],
      [0.2, { e: 'o', ...KNEEL, pitch: -0.32, hdX: -0.38, bY: -0.45, rH: [-0.3, -0.2, 0.05], lH: [0.3, -0.1, 0.1] }],
      [0.75, { ...KNEEL, pitch: 0.3, hdX: 0.5, bY: -0.55, rH: [0.06, -0.52, 0.3], lH: [0.0, -0.42, 0.24] }],
      [1.2, { ...KNEEL, pitch: 0.26, hdX: 0.5, bY: -0.54, rH: [0.06, -0.52, 0.3], lH: [0.04, -0.44, 0.18] }],
    ],
  },
  death: {
    dur: 2.6, hold: true,
    keys: [
      [0.4, { e: 'o', ...KNEEL, pitch: 0.1, rH: [-0.2, -0.36, 0.2], lH: [0.2, -0.36, 0.2] }],
      [1.3, { bY: -0.62, pitch: 0.16, hdX: 0.5, rH: [-0.22, -0.44, 0.16], lH: [0.22, -0.44, 0.16], rF: [-0.13, -0.3], lF: [0.13, -0.3], rK: [-0.05, -0.6, 0.8], lK: [0.05, -0.6, 0.8], flat: 0.2 }],
      [2.6, { bY: -0.8, pitch: 1.2, hdX: 0.3, rH: [-0.3, -0.2, 0.3], lH: [0.3, -0.2, 0.3], rF: [-0.13, -0.5], lF: [0.13, -0.5], rK: [-0.05, -0.6, 0.8], lK: [0.05, -0.6, 0.8], flat: 0.1 }],
    ],
  },
  /** He waits: standing, the arms folded, the eyes closed. */
  meditate: { dur: 1, hold: true, keys: [[0, { ...FOLDED }]] },
  /** The intro: the head lifts (he opens his eyes), the arms unfold, and he drops into his stance. */
  intro: {
    dur: 1.8,
    keys: [
      [0, { ...FOLDED }],
      [0.5, { ...FOLDED, hdX: -0.04 }],
      [0.9, { ...FOLDED, hdX: -0.02, bY: -0.04, rH: [0.1, -0.2, 0.12], lH: [-0.1, -0.18, 0.14] }],
      // the arms swept down and out, the weight dropping
      [1.25, { e: 'o', bY: -0.2, pitch: 0.04, yaw: -0.3, hdX: 0.04, hdY: 0.26, rH: [-0.14, -0.36, 0.1], lH: [0.16, -0.34, 0.1], rF: [-0.2, -0.22], lF: [0.2, 0.26], rFy: -0.5, lFy: 0.25 }],
    ],
  },
};

/** Compiled reaction clips, one set per form (each round its form's stance). */
export const CLIPS_BY_FORM = FORM_POSES.map((P) => {
  const out = Object.fromEntries(Object.entries(CLIPS).map(([k, c]) => [k, P.compileClip(c.keys.map(([t, pose]) => ({ t, ...pose })), c.dur, { hold: !!c.hold })]));
  for (const [k, c] of Object.entries(out)) c.name = k;
  return out;
});
/** (form 1's set: the kit's default) */
export const CLIP = CLIPS_BY_FORM[0];

// ---------------------------------------------------------------- realising a move
// (ADR-126, as the other two bosses: a beat's keys made whole (completeBeat); every strike key here
// carries NEUTRAL, so it only writes `two` / `arm` / `larm` back to his guard's 0)
const REALISERS = FORM_POSES.map((P) => makeRealise({ TUNING, MOVES, compileClip: (keys, dur) => P.compileClip(keys, dur), completeBeat: P.completeBeat }));
/**
 * A move as it will play this time (duelist/realise.js), compiled round the stance of the form it is
 * used in; a transformation is compiled round the NEW form's stance, so it ends in that guard.
 */
export function realise(name, phase = 1, rnd = Math.random, opts = null) {
  const def = MOVES[name];
  if (!def) return null;
  const form = def.transition ? def.phase : phase;
  return REALISERS[Math.min(REALISERS.length, Math.max(1, form)) - 1](name, phase, rnd, opts);
}
