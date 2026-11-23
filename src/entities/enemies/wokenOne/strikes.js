import { X as ASC } from '../ascendant/moves.js';

// Xin Yi's own strikes (the rework, ADR-168): the acrobatic kicks and the flurry burst's keys, built with
// Tian Lei's builders (ascendant/moves.js X: F, mirror, strikeKeys, the feet). Generic martial-arts kinds,
// each with a zone that matches what is drawn:
//   spinBack   turned away, the heel driven straight back at the hero (a line)
//   spinFist   the spinning backfist: a whole turn, the right fist whipped round back-handed (a sector)
//   tornado    a jump, a full turn in the air, a round kick at head height (air; lift 0.55 m)
//   butterfly  the body flat, the legs wheeling round (a wide sector; air; travels 1.6 m)
//   flash      a back flip with the toe rising under the chin (close); he lands 2.4 m back
//   aerial     a no-hand cartwheel at the hero, the heel coming over the top (a line)
//   bicycle    hanging in the air, a front snap from one leg (`left`: the other): strings alternate
//   dropHeel   from height, the heel straight down (a ring 2.2 m, red)
//   flyKnee    a flying knee on a dash (stops 1.35 m short)
//   burst      a flurry burst's keys: the coil, then `n` blows alternating at about ten a second
//              ('chain': both fists; 'right': the right hand alone; 'kicks': the legs)
// Pose fields are anim.js's (duelist/poses.js header). Feet are MODEL space; a turn (yaw) or a flip
// (pitch, roll) does not carry them, so the keys here give a flying foot in BODY space (`rFb` / `lFb`)
// and turn it into model space through the key's own body rotation (anim.js bodyPointTo: Euler YXZ
// round the waist pivot, DIM.pivot 1.04 m up). A body-space foot straight under the hip is
// [±0.105, -0.92, 0]. A whole turn ends on a held key (e 'h') back at the turn's start, as Tian Lei's
// sweep does.

const { F, mirror, strikeKeys, feet: FT, ANK, TAU, TELL } = ASC;
const N = TELL.N;
const PIVOT = 1.04;

/** A body-space point of pose p (already through F) in model space. */
function toModel(p, v) {
  const [x0, y0, z0] = v;
  const ya = p.yaw ?? 0, pi = p.pitch ?? 0, ro = p.roll ?? 0;
  // Rz(roll)
  let x = x0 * Math.cos(ro) - y0 * Math.sin(ro), y = x0 * Math.sin(ro) + y0 * Math.cos(ro), z = z0;
  // Rx(pitch)
  const y1 = y * Math.cos(pi) - z * Math.sin(pi), z1 = y * Math.sin(pi) + z * Math.cos(pi);
  y = y1;
  z = z1;
  // Ry(yaw)
  const x2 = x * Math.cos(ya) + z * Math.sin(ya), z2 = -x * Math.sin(ya) + z * Math.cos(ya);
  return [x2 + (p.bX ?? 0), Math.max(ANK, y + PIVOT + (p.bY ?? 0)), z2 + (p.bZ ?? 0)];
}
/** The mirror image of a pose with body-space feet (his left for his right). */
function mirrorB(p) {
  const o = mirror(p);
  if ('rFb' in p || 'lFb' in p) {
    o.rFb = p.lFb ? [-p.lFb[0], p.lFb[1], p.lFb[2]] : undefined;
    o.lFb = p.rFb ? [-p.rFb[0], p.rFb[1], p.rFb[2]] : undefined;
    for (const k of ['rFb', 'lFb']) if (o[k] === undefined) delete o[k];
  }
  return o;
}
/** A key's pose: F, then any body-space foot turned into model space. */
function K(p, left = false) {
  const q = F(left ? mirrorB(p) : p);
  if (q.rFb) q.rF = toModel(q, q.rFb);
  if (q.lFb) q.lF = toModel(q, q.lFb);
  delete q.rFb;
  delete q.lFb;
  return q;
}
const key = (u, p, left, e) => [u, e ? { ...K(p, left), e } : K(p, left)];
const PART = { footR: 'footL', footL: 'footR', fistR: 'fistL', fistL: 'fistR', kneeR: 'kneeL', kneeL: 'kneeR' };
const side = (part, left) => (left ? PART[part] ?? part : part);

// ---------------------------------------------------------------- pose fragments
const GUARD_H = { rH: [0.1, 0.06, 0.24], lH: [0.02, 0.08, 0.3] };
const ARMS_OUT = { rH: [-0.36, -0.06, 0.1], lH: [0.36, -0.06, 0.1], rP: [-0.9, 0.2, -0.3], lP: [0.9, 0.2, -0.3] };
const TUCK_R = [-0.12, -0.5, 0.3], TUCK_L = [0.12, -0.52, 0.24];
const LAND = { bY: -0.26, pitch: 0.14, rF: [-0.2, -0.12], lF: [0.2, 0.16], rK: [-0.5, 0, 0.8], lK: [0.5, 0, 0.8], rFy: -0.3, lFy: 0.3 };

// ---------------------------------------------------------------- the spins
// (the kicking knee's pole one way through the whole spin kick, down and out to his right: keyed
// toward the target it was crossed by the leg and flipped in a frame, ADR-162's fix 4)
const SPIN_K = [-0.5, -1, 0.1];
/** The spinning back kick: he turns away, the heel driven straight back along the line (a line). */
export function spinBack(tell, windup, damage, o = {}) {
  const { left = false, cock = 0.72, ...extra } = o;
  const keys = [
    key(cock * 0.45, { yaw: -0.5, bY: -0.14, hdY: 0.5, ...GUARD_H, ...FT.OR }, left),
    // the coil: turned most of the way, the head over the right shoulder, the right knee drawn up
    key(cock, { yaw: -2.3, bY: -0.18, pitch: 0.12, hdY: 1.25, ...GUARD_H, lF: [0.04, 0.06], lFy: -1.9, rFb: [-0.1, -0.55, 0.22], rK: SPIN_K }, left),
    key(cock + (1 - cock) * 0.5, { yaw: -2.85, bY: -0.2, pitch: 0.3, hdY: 1.3, ...GUARD_H, lF: [0.02, 0.04], lFy: -2.5, rFb: [-0.1, -0.55, -0.18], rK: SPIN_K }, left, 'i'),
    // the heel out behind his back, at the hero; he leans away over it
    key(1.0, { yaw: -3.1, bY: -0.22, pitch: 0.5, hdY: 1.3, rH: [0.12, 0.0, 0.2], lH: [0.08, 0.02, 0.26], lF: [0.0, 0.02], lFy: -2.9, rFb: [-0.04, -0.45, -0.98], rK: SPIN_K, flat: 0.9 }, left, 'l'),
    key(1.5, { yaw: -4.2, bY: -0.16, pitch: 0.2, hdY: 0.6, ...GUARD_H, lF: [0.0, 0.0], lFy: -3.6, rFb: [-0.12, -0.6, -0.2] }, left, 'o'),
    key(2.0, { yaw: -TAU - 0.3, bY: -0.1, ...GUARD_H, hdY: 0.24, ...FT.OR }, left),
    key(2.001, { yaw: -0.3, bY: -0.1, ...GUARD_H, hdY: 0.24, ...FT.OR }, left, 'h'),
  ];
  return { tell, windup, active: 0.1, damage, knockback: tell === N ? 1.2 : 2.4, zone: { kind: 'line', r: 2.5, w: 0.8 }, part: side('footR', left), track: 0.7, keys, ...extra, cock };
}

/** The spinning backfist: a whole turn, the right fist whipped round at head height (a sector). */
export function spinFist(tell, windup, damage, o = {}) {
  const { left = false, cock = 0.7, ...extra } = o;
  const keys = [
    key(cock * 0.45, { yaw: -0.4, bY: -0.14, hdY: 0.4, ...GUARD_H, ...FT.OR }, left),
    key(cock, { yaw: -2.2, bY: -0.17, hdY: 1.2, rH: [0.3, 0.06, 0.14], rP: [-0.6, 0.2, 0.5], lH: [0.04, 0.06, 0.26], lF: [0.06, 0.1], lFy: -1.8, rF: [-0.3, -0.24], rFy: -2.0 }, left),
    key(cock + (1 - cock) * 0.5, { yaw: -3.6, bY: -0.18, hdY: 1.0, rH: [0.2, 0.06, 0.3], lH: [0.04, 0.06, 0.24], lF: [0.04, 0.06], lFy: -3.0, rFb: [-0.2, -0.85, -0.2] }, left, 'i'),
    // round to face him again, the fist whipped out back-handed across the line
    key(1.0, { yaw: -TAU + 0.55, bY: -0.2, bZ: 0.06, hdY: -0.4, rH: [-0.28, 0.06, 0.5], rP: [-0.9, 0.2, -0.2], lH: [0.02, 0.06, 0.24], lF: [0.04, 0.12], lFy: -TAU + 0.6, rF: [-0.26, 0.2], rFy: -TAU + 0.2 }, left, 'l'),
    key(1.6, { yaw: -TAU + 0.1, bY: -0.16, ...GUARD_H, lF: [0.18, 0.22], rF: [-0.2, -0.2], lFy: 0.25 - TAU, rFy: -0.5 - TAU }, left, 'o'),
    key(2.0, { yaw: -TAU - 0.3, bY: -0.12, ...GUARD_H, ...FT.OR, lFy: 0.25 - TAU, rFy: -0.55 - TAU }, left),
    key(2.001, { yaw: -0.3, bY: -0.12, ...GUARD_H, ...FT.OR }, left, 'h'),
  ];
  return { tell, windup, active: 0.08, damage, knockback: tell === N ? 0.8 : 1.6, zone: { kind: 'sector', r: 1.8, ang: 0.95 }, part: side('fistR', left), track: 0.7, keys, ...extra, cock };
}

/** The tornado kick: a jump, a full turn, the round kick at head height (air). */
export function tornado(tell, windup, damage, o = {}) {
  const { left = false, cock = 0.52, ...extra } = o;
  const keys = [
    // wound up the other way, sunk, the arms swung across
    key(cock * 0.5, { yaw: 0.8, bY: -0.32, pitch: 0.12, hdY: -0.4, rH: [0.3, -0.1, 0.24], lH: [0.26, -0.06, 0.1], ...FT.LOW }, left),
    // off the floor, turned away, the knees tucked
    key(cock, { yaw: -1.7, bY: -0.12, pitch: -0.04, hdY: 1.1, rH: [-0.16, 0.1, 0.2], lH: [0.2, 0.14, 0.2], rFb: TUCK_R, lFb: TUCK_L, flat: 0.2 }, left),
    // the jump leg (the left) swings up in a crescent as he turns
    key(cock + (1 - cock) * 0.5, { yaw: -3.7, bY: -0.1, roll: 0.2, hdY: 1.1, rH: [-0.2, 0.0, 0.16], lH: [0.24, 0.1, 0.2], rFb: [-0.12, -0.48, 0.34], lFb: [0.38, -0.42, 0.3], flat: 0.2 }, left, 'i'),
    // the right shin round level at the head (Tian Lei's round kick, a whole turn later)
    key(1.0, { yaw: 1.2 - TAU, roll: -0.4, bY: -0.12, hdY: -0.9, rH: [0.04, 0.0, 0.1], lH: [0.06, 0.12, 0.28], rF: [0.08, 1.06, 0.82], rK: [-0.4, 0.85, 0.35], lFb: [0.12, -0.55, 0.2], flat: 0.2 }, left, 'l'),
    key(1.55, { yaw: 0.4 - TAU, bY: -0.18, hdY: -0.3, ...GUARD_H, rFb: [-0.18, -0.7, 0.2], lFb: [0.14, -0.8, 0.05] }, left, 'o'),
    key(2.0, { yaw: -0.3 - TAU, ...LAND, hdY: 0.2, ...GUARD_H }, left),
    key(2.001, { yaw: -0.3, ...LAND, hdY: 0.2, ...GUARD_H }, left, 'h'),
  ];
  return {
    tell, windup, active: 0.1, damage, knockback: tell === N ? 1.2 : 2.4, zone: { kind: 'sector', r: 2.2, ang: 0.9 }, part: side('footR', left),
    air: true, lift: [[cock * 0.85, 0], [cock + (1 - cock) * 0.5, 0.5], [1.0, 0.55], [1.55, 0.25], [2.0, 0]], track: 0.6, keys, ...extra, cock,
  };
}

/** The butterfly kick: the body flat, the legs wheeling round over it (a wide sector, air, 1.6 m on). */
export function butterfly(tell, windup, damage, o = {}) {
  const { left = false, cock = 0.62, ...extra } = o;
  const keys = [
    key(cock * 0.5, { yaw: 1.0, bY: -0.3, pitch: 0.3, hdY: -0.8, rH: [0.3, -0.2, 0.2], lH: [0.3, -0.1, 0.0], ...FT.LOW }, left),
    // wound, the chest dropped forward, the arms swung low across
    key(cock, { yaw: 1.3, bY: -0.36, pitch: 0.7, hdY: -1.0, rH: [0.34, -0.3, 0.1], lH: [0.3, -0.2, -0.1], ...FT.LOW, flat: 0.6 }, left),
    // flat out, the arms thrown wide, the right leg wheeling up behind him
    key(cock + (1 - cock) * 0.5, { yaw: -1.6, bY: -0.2, pitch: 1.3, hdY: -0.2, ...ARMS_OUT, rFb: [-0.3, -0.8, -0.3], lFb: [0.2, -0.85, 0.1], flat: 0.2 }, left, 'i'),
    // the legs split wide in the air, wheeling round over the flat body
    key(1.0, { yaw: -3.55, bY: -0.12, pitch: 1.35, roll: 0.3, hdY: 0.6, ...ARMS_OUT, rFb: [-0.62, -0.62, 0.1], lFb: [0.4, -0.75, -0.3], flat: 0.2 }, left, 'l'),
    key(1.5, { yaw: -4.9, bY: -0.16, pitch: 0.8, hdY: 0.9, ...ARMS_OUT, rFb: [-0.3, -0.85, 0.1], lFb: [0.4, -0.7, 0.2], flat: 0.2 }, left, 'o'),
    key(2.0, { yaw: -0.3 - TAU, ...LAND, hdY: 0.2, ...GUARD_H }, left),
    key(2.001, { yaw: -0.3, ...LAND, hdY: 0.2, ...GUARD_H }, left, 'h'),
  ];
  return {
    tell, windup, active: 0.14, damage, knockback: tell === N ? 1.2 : 2.4, zone: { kind: 'sector', r: 2.3, ang: 1.3 }, part: side('footR', left),
    air: true, lift: [[cock * 0.9, 0], [cock + (1 - cock) * 0.5, 0.5], [1.0, 0.62], [1.5, 0.3], [2.0, 0]],
    travel: [[cock, 0], [1.0, 1.1], [2.0, 1.6]], track: 0.6, keys, ...extra, cock,
  };
}

/** The flash kick: a back flip, the toe rising up under the chin as he goes over; he lands 2.4 m back. */
export function flash(tell, windup, damage, o = {}) {
  const { left = false, cock = 0.68, ...extra } = o;
  const keys = [
    key(cock * 0.5, { bY: -0.2, pitch: 0.1, ...GUARD_H, ...FT.OR }, left),
    // sunk, the arms swung down and back
    key(cock, { bY: -0.4, pitch: 0.28, hdX: 0.1, rH: [-0.06, -0.46, -0.04], lH: [0.06, -0.46, -0.04], rP: [-0.9, 0.2, -0.3], lP: [0.9, 0.2, -0.3], rF: [-0.18, -0.06], lF: [0.18, 0.04], rK: [-0.6, 0, 0.8], lK: [0.6, 0, 0.8], rFy: -0.2, lFy: 0.2 }, left),
    // off the floor, arching back, the arms thrown up
    key(cock + (1 - cock) * 0.5, { bY: -0.02, pitch: -0.9, hdX: -0.4, rH: [-0.1, 0.5, -0.1], lH: [0.1, 0.5, -0.1], rFb: [-0.1, -0.9, 0.12], lFb: [0.1, -0.88, 0.0], flat: 0.2 }, left, 'i'),
    // going over: the right leg straight, its toe rising up in front; the left tucked
    key(1.0, { bY: 0.0, pitch: -1.9, hdX: -0.5, rH: [-0.2, 0.36, -0.1], lH: [0.2, 0.36, -0.1], rFb: [-0.1, -0.95, 0.12], lFb: [0.12, -0.5, 0.32], flat: 0.2 }, left, 'l'),
    key(1.45, { bY: 0.0, pitch: -4.1, hdX: -0.2, rH: [-0.2, -0.2, 0.1], lH: [0.2, -0.2, 0.1], rFb: [-0.12, -0.78, 0.24], lFb: [0.12, -0.8, 0.14], flat: 0.2 }, left, 'o'),
    key(2.0, { pitch: 0.14 - TAU, ...LAND, ...GUARD_H }, left),
    key(2.001, { pitch: 0.14, ...LAND, ...GUARD_H }, left, 'h'),
  ];
  return {
    tell, windup, active: 0.32, follow: 0.32, damage, knockback: tell === N ? 1.2 : 2.4, zone: { kind: 'sector', r: 1.9, ang: 0.7 }, part: side('footR', left),
    air: true, lift: [[cock + (1 - cock) * 0.3, 0], [cock + (1 - cock) * 0.6, 0.12], [1.0, 0.2], [1.45, 0.85], [1.85, 0.25], [2.0, 0]],
    travel: [[1.0, 0], [1.3, -0.5], [2.0, -2.4]], track: 0.5, keys, ...extra, cock,
  };
}

/** The no-hand cartwheel at the hero, the trailing heel coming over the top down onto him (a line). */
export function aerial(tell, windup, damage, o = {}) {
  // (an early cock: the whole wheel runs through the second half of the windup, not its last 0.13 s)
  const { left = false, cock = 0.42, ...extra } = o;
  // (side-on, his right side to the hero: yaw +1.57 turns his body -x onto the hero's line; roll +
  // tips his head toward the hero)
  const Y = 1.5;
  const keys = [
    key(cock * 0.5, { yaw: 1.0, bY: -0.2, hdY: -1.0, ...GUARD_H, ...FT.OR }, left),
    key(cock, { yaw: Y, roll: 0.35, bY: -0.34, hdY: -1.3, rH: [-0.12, 0.46, 0.0], lH: [0.12, 0.46, 0.0], rF: [-0.04, -0.3], lF: [0.04, 0.24], rK: [0, 0, 1], lK: [0, 0, 1], rFy: 1.4, lFy: 1.4, flat: 0.7 }, left),
    // over the top: no hands, the legs split wide
    key(cock + (1 - cock) * 0.5, { yaw: Y, roll: 1.9, bY: -0.1, hdY: -1.0, ...ARMS_OUT, rFb: [-0.3, -0.85, 0.0], lFb: [0.42, -0.78, 0.0], flat: 0.2 }, left, 'i'),
    // the left heel over the top and down onto the line
    key(1.0, { yaw: Y, roll: 3.7, bY: -0.1, hdY: -0.6, ...ARMS_OUT, rFb: [-0.32, -0.82, 0.0], lFb: [0.5, -0.72, 0.06], flat: 0.2 }, left, 'l'),
    key(1.5, { yaw: Y, roll: 5.2, bY: -0.2, hdY: -0.8, ...ARMS_OUT, rFb: [-0.2, -0.9, 0.0], lFb: [0.3, -0.8, 0.04], flat: 0.4 }, left, 'o'),
    key(2.0, { yaw: Y - 0.4, roll: TAU, ...LAND, hdY: -0.8, ...GUARD_H }, left),
    key(2.001, { yaw: Y - 0.4, roll: 0, ...LAND, hdY: -0.8, ...GUARD_H }, left, 'h'),
  ];
  return {
    tell, windup, active: 0.12, follow: 0.3, damage, knockback: tell === N ? 1.2 : 2.4, zone: { kind: 'line', r: 2.4, w: 0.8 }, part: side('footL', left),
    air: true, lift: [[cock + (1 - cock) * 0.2, 0], [cock + (1 - cock) * 0.6, 0.4], [1.0, 0.5], [1.5, 0.3], [2.0, 0]],
    travel: [[cock, 0], [2.0, 1.2]], track: 0.6, keys, ...extra, cock,
  };
}

/** One snap of the bicycle: hanging in the air, a front kick from the right leg (`left`: the left). */
export function bicycle(tell, windup, damage, o = {}) {
  const { left = false, cock = 0.62, h = 0.6, first = false, ...extra } = o;
  const keys = [
    key(cock, { bY: -0.08, pitch: -0.22, hdX: 0.2, ...ARMS_OUT, rFb: [-0.1, -0.4, 0.34], lFb: [0.1, -0.55, 0.55], rK: [0, 0.6, 1], lK: [0, 0.4, 1], flat: 0.1 }, left),
    key(cock + (1 - cock) * 0.5, { bY: -0.08, pitch: -0.26, hdX: 0.22, ...ARMS_OUT, rFb: [-0.1, -0.36, 0.5], lFb: [0.1, -0.5, 0.36], rK: [0, 0.6, 1], lK: [0, 0.5, 1], flat: 0.1 }, left, 'i'),
    key(1.0, { bY: -0.08, pitch: -0.34, hdX: 0.25, ...ARMS_OUT, rFb: [-0.08, -0.3, 0.86], lFb: [0.1, -0.5, 0.22], rK: [0, 0.6, 1], lK: [0, 0.6, 1], flat: 0.1 }, left, 'l'),
    key(1.6, { bY: -0.08, pitch: -0.26, hdX: 0.22, ...ARMS_OUT, rFb: [-0.1, -0.42, 0.5], lFb: [0.1, -0.45, 0.4], flat: 0.1 }, left, 'o'),
    key(2.0, { bY: -0.08, pitch: -0.22, hdX: 0.2, ...ARMS_OUT, rFb: [-0.1, -0.48, 0.36], lFb: [0.1, -0.42, 0.5], flat: 0.1 }, left),
  ];
  return {
    tell, windup, active: 0.08, damage, knockback: tell === N ? 0.8 : 1.6, zone: { kind: 'sector', r: 1.9, ang: 0.6, fwd: 0.2 }, part: side('footR', left),
    air: true, lift: first ? [[0.2, 0], [0.6, h + 0.1], [1.0, h], [2.0, h]] : [[0, h], [2.0, h]], track: 0.8, keys, ...extra, cock,
  };
}

/** The drop heel: from height (`from` m), the right leg up over his head, the heel straight down (a ring). */
export function dropHeel(tell, windup, damage, o = {}) {
  const { left = false, cock = 0.62, from = 0, ...extra } = o;
  const top = Math.max(0.9, from + 0.4);
  const keys = [
    key(cock * 0.5, { bY: -0.1, pitch: -0.1, ...ARMS_OUT, rFb: [-0.3, -0.4, 0.35], lFb: [0.12, -0.7, 0.0], flat: 0.2 }, left),
    // the leg raised straight up over the head, the body leaning back under it
    key(cock, { bY: -0.06, pitch: -0.28, spX: -0.08, hdX: 0.1, ...ARMS_OUT, rFb: [-0.08, 0.5, 0.5], rK: [0, 0, 1], lFb: [0.12, -0.75, -0.05], flat: 0.2 }, left),
    key(cock + (1 - cock) * 0.5, { bY: -0.12, pitch: 0.0, ...ARMS_OUT, rFb: [-0.08, 0.1, 0.8], rK: [0, 0, 1], lFb: [0.12, -0.8, -0.05], flat: 0.3 }, left, 'i'),
    // down: the heel into the floor before him, sunk over it
    key(1.0, { bY: -0.4, pitch: 0.3, hdX: 0.25, rH: [0.1, -0.1, 0.24], lH: [-0.02, -0.06, 0.28], rF: [-0.1, ANK + 0.02, 0.8], rK: [0, 0, 1], lF: [0.15, -0.24], flat: 0.8 }, left, 'l'),
    key(1.6, { bY: -0.34, pitch: 0.24, hdX: 0.2, ...GUARD_H, rF: [-0.12, ANK, 0.7], lF: [0.15, -0.24] }, left, 'o'),
    key(2.0, { bY: -0.3, pitch: 0.18, ...GUARD_H, rF: [-0.14, ANK, 0.6], lF: [0.15, -0.24] }, left),
  ];
  return {
    tell, windup, active: 0.12, damage, knockback: 2.2, zone: { kind: 'ring', r: 2.2, fwd: 0.6 }, ring: 2.2, part: side('footR', left),
    air: true, dropHeel: true, lift: [[0, from], [cock, top], [cock + (1 - cock) * 0.5, top * 0.8], [1.0, 0], [2.0, 0]], track: 0.75, keys, ...extra, cock,
  };
}

/** The flying knee on a dash: a run, the jump, the right knee driven up into the chest. */
export function flyKnee(tell, windup, damage, o = {}) {
  const { left = false, cock = 0.6, dash = 5, ...extra } = o;
  const keys = [
    key(cock * 0.5, { bY: -0.22, pitch: 0.3, hdX: -0.1, rH: [-0.06, -0.2, -0.1], lH: [0.06, -0.2, 0.2], ...FT.LUNGE }, left),
    key(cock, { bY: -0.3, pitch: 0.36, hdX: -0.2, rH: [-0.04, -0.3, -0.16], lH: [0.08, -0.14, 0.3], rF: [-0.18, -0.4], lF: [0.18, 0.2], rK: [-0.3, 0, 1], lK: [0.3, 0, 1] }, left),
    key(cock + (1 - cock) * 0.5, { bY: -0.1, pitch: 0.1, rH: [0.08, 0.1, 0.3], lH: [-0.02, 0.1, 0.34], rFb: [-0.1, -0.6, 0.2], lFb: [0.1, -0.85, -0.2], rK: [0, 0.6, 1], flat: 0.2 }, left, 'i'),
    // the knee up and through, both hands drawing down onto it
    key(1.0, { bY: 0.0, pitch: -0.12, bZ: 0.1, rH: [0.12, -0.02, 0.44], lH: [-0.06, -0.02, 0.46], rFb: [-0.1, -0.52, 0.22], lFb: [0.1, -0.88, -0.32], rK: [0, 0.9, 1], flat: 0.2 }, left, 'l'),
    key(1.6, { bY: -0.1, pitch: 0.0, ...GUARD_H, rFb: [-0.12, -0.75, 0.2], lFb: [0.1, -0.88, -0.1], flat: 0.4 }, left, 'o'),
    key(2.0, { ...LAND, ...GUARD_H }, left),
  ];
  return {
    tell, windup, active: 0.1, damage, knockback: tell === N ? 1.2 : 2.4, zone: { kind: 'line', r: 1.8, w: 0.9 }, part: side('kneeR', left),
    air: true, lift: [[cock + (1 - cock) * 0.3, 0], [cock + (1 - cock) * 0.8, 0.5], [1.0, 0.45], [1.6, 0.2], [2.0, 0]],
    dash: { from: 0.45, to: 1.0, stop: 1.35, max: dash }, close: 0, track: 0.7, keys, ...extra, cock,
  };
}

// ---------------------------------------------------------------- the flurry burst
const CHAIN_SET = { yaw: -0.08, bY: -0.24, pitch: 0.08, hdY: 0.06, ...FT.OR_IN, rK: [-0.4, 0, 0.9], lK: [0.4, 0, 0.9] };
/** The blows a burst alternates: [pose out, pose back] for blow i. */
const BURST = {
  // the chain punch: vertical fists down the centre line, one out as the other comes back
  chain: (i) => {
    const r = i % 2 === 0;
    const out = r ? { rH: [0.0, 0.06, 0.58], lH: [-0.02, 0.02, 0.22] } : { lH: [0.0, 0.06, 0.58], rH: [0.02, 0.02, 0.22] };
    return { ...CHAIN_SET, yaw: r ? 0.18 : -0.26, spY: r ? 0.08 : -0.08, rP: [-0.8, -0.6, -0.1], lP: [0.8, -0.6, -0.1], ...out };
  },
  // the right hand alone (the left behind his back): palm, backfist, palm high, low
  right: (i) => {
    const a = [[0.04, 0.06, 0.58], [-0.18, 0.12, 0.52], [0.06, 0.24, 0.55], [0.02, -0.12, 0.56]][i % 4];
    return { ...CHAIN_SET, yaw: 0.3 + (i % 2 ? -0.2 : 0.1), spY: 0.08, rH: a, rP: [-0.8, -0.5, -0.2], lH: [0.0, 0.02, 0.24] };
  },
  // the legs: front snaps from alternate legs, the hands up
  kicks: (i) => {
    const r = i % 2 === 0;
    return { yaw: r ? -0.1 : 0.1, bY: -0.12, pitch: -0.2, ...GUARD_H, rF: r ? [-0.08, 0.78, 0.78] : [-0.16, -0.1], lF: r ? [0.16, 0.04] : [0.08, 0.78, 0.78], rK: [0, 0.6, 1], lK: [0, 0.6, 1], lFy: 0.1, rFy: -0.1 };
  },
};
const BURST_COIL = {
  chain: { yaw: -0.3, bY: -0.28, pitch: 0.06, rH: [0.02, -0.02, 0.2], lH: [-0.02, 0.02, 0.26], ...FT.OR },
  right: { yaw: -0.5, bY: -0.26, pitch: 0.06, rH: [0.06, -0.12, 0.1], rP: [-0.8, -0.6, -0.4], lH: [0.0, 0.02, 0.24], ...FT.OR },
  kicks: { yaw: -0.1, bY: -0.16, pitch: -0.06, ...GUARD_H, rF: [-0.12, 0.44, 0.16], rK: [0, 0.3, 1], lF: [0.16, 0.08], lFy: 0.1 },
};
/** A flurry burst's keys: the coil to `cock`, then `n` blows over the lit window (u 1..2). */
export function burstKeys(kind = 'chain', n = 7, cock = 0.72, left = false) {
  const blow = BURST[kind] ?? BURST.chain;
  const keys = [key(cock * 0.5, { ...BURST_COIL[kind], bY: (BURST_COIL[kind].bY ?? -0.2) * 0.6 }, left), key(cock, BURST_COIL[kind], left)];
  for (let i = 0; i < n; i++) {
    const u = 1 + i / n;
    keys.push(key(u === 1 ? 1.0 : u, blow(i), left, 'l'));
    // half way to the next blow: drawn back (the arms pass, they do not lerp through each other)
    const back = { ...blow(i + 1) };
    if (back.rH) back.rH = [back.rH[0], back.rH[1], Math.min(back.rH[2], 0.3)];
    if (back.lH) back.lH = [back.lH[0], back.lH[1], Math.min(back.lH[2], 0.3)];
    keys.push(key(u + 0.5 / n, back, left));
  }
  keys.push(key(2.0, { ...BURST_COIL[kind], bY: -0.18 }, left));
  return keys;
}
/** The striking part a burst draws its glint and trail on. */
export const BURST_PART = { chain: 'palms', right: 'fistR', kicks: 'footR' };

export { strikeKeys };
