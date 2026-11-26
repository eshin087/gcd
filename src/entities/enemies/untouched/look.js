import { Matrix4, Vector3 } from 'three';
import { lookOf } from '../duelist/lookSwitch.js';
import { setFill } from '../ashDisciple/bodyArt.js';
import { DIM } from '../../player/model.js';

// Bai Wuji's look (the body agent's file; the body contract: gear.js header). He is the hero's skeleton
// in the hero's INK-LINE art, printed the hero's way (bossPrint, ADR-194): lit letter cloth in his own
// hues, the pale hem below the knee. What carries him at ~40 px: the white hair (its own ink, written
// here: part 11), the dark band over the eyes (the `eye` part keeps its own dark fill), the collar, the
// hands in his pockets, the long dark legs; from phase 2 the hair down and two ice-blue points of light.
//
// His look switches (`?wj...=`, duelist/lookSwitch.js lookOf; PENDING there with their Lab rows in
// dev/labLooks.js until the owner picks; default a):
//   ?wjLook=a|b|c   the outfit (read when his rig is built: a reload). a the closest reading of the
//                   owner's words: a black high-collared coat, a black band, pure white hair, ice-blue
//                   eyes. b a step away: a long indigo-black robe with a crossed front and a sash, a
//                   white cloth band. c a further reading: a bone-white coat, its collar dark, a dark band.
//   ?wjHair=a|b     the hair's shape (a reload): a a tall swept crown (up) / long soft locks (fallen);
//                   b a shorter spikier burst / a choppier fringe.
//   ?wjLetters=a|0  his letters follow his size on screen by the hero's rule (live; core's).
//
// dressUntouched(d, dt), once a frame (kit.dress, after the animator): by phase (d.dressPhase):
//   1  the hair up, the band over the eyes, the eyes dark, the coat closed and quiet
//   2  the band round his neck, the hair down, the eyes lit (d.eyesK), the coat stirs
//   3  as 2, the eyes brighter, the coat's front parts a little and its hem lifts (the realm's air)
// A phase change flips a few `visible` flags, turns two coat anchors and sets the stir; every frame it
// writes his parts' ink (a dozen Vector4 sets: the tables are shared by every boss rig on the page and
// a rig built later writes the hero's into them), the eyes' glow and, through the hand sign, the left
// hand's sword fingers. No allocation after the first call.

export const WJ_LOOKS = Object.freeze({ wjLetters: 'a', wjLook: 'a', wjHair: 'a' });
export const wjLook = (name) => lookOf(name, WJ_LOOKS[name] ?? 'a');

/** His letters follow his size on screen by the hero's rule (`?wjLetters=a`; live). */
export function wjLettersOn() {
  return wjLook('wjLetters') === 'a';
}
/** The outfit his rig is built in: 'a' | 'b' | 'c' (anything else draws a). */
export function wjLookNow() {
  const o = wjLook('wjLook');
  return o === 'b' || o === 'c' ? o : 'a';
}
/** The hair's shape his rig is built with: 'a' | 'b'. */
export function wjHairNow() {
  return wjLook('wjHair') === 'b' ? 'b' : 'a';
}

/** The dressing record on his rig (gear.js registers the switched pieces in it). */
export function dressOf(root, look = 'a') {
  return (root.userData.dress ??= { kind: 'wj', look, phase: 0, at: [], fronts: [], panels: [], eyes: [], eyeK: 0, sign: false, handR: null, pocket: [false, false] });
}
/** Show mesh `m` from phase `from` to phase `to` (hidden until then; phase 1 is the build's state). */
export function at(D, m, from, to = 9) {
  D.at.push({ m, from, to });
  m.visible = from <= 1 && to >= 1;
}

// ---------------------------------------------------------------- colours (linear)
// The fill of each of his material instances, per outfit. Under the boss print (ADR-194) a cloth fill
// gives its HUE (the print lifts every cloth part to the hero's lit letter body); the band (`eye`), the
// face and hands (`skin`) and the eyes (`flask`) keep their own fill.
export const WJ_TINT = {
  // the black coat: a cold blue-black, the band black, the hair pure white
  a: {
    coat: [0.06, 0.065, 0.095], collar: [0.06, 0.065, 0.095], lining: [0.04, 0.045, 0.07], pants: [0.05, 0.052, 0.072], armor: [0.05, 0.05, 0.06],
    skin: [0.96, 0.82, 0.72], eye: [0.008, 0.008, 0.012], hair: [0.94, 0.96, 1.0], hairTip: [1.0, 1.0, 1.0], facing: [0.9, 0.9, 0.92], leather: [0.05, 0.05, 0.07],
  },
  // the robe: indigo-black, a white cloth band, a dark sash
  b: {
    coat: [0.05, 0.06, 0.16], collar: [0.05, 0.06, 0.16], lining: [0.04, 0.045, 0.1], pants: [0.045, 0.05, 0.09], armor: [0.05, 0.05, 0.06],
    skin: [0.96, 0.82, 0.72], eye: [0.008, 0.008, 0.012], hair: [0.94, 0.96, 1.0], hairTip: [1.0, 1.0, 1.0], facing: [0.92, 0.92, 0.94], leather: [0.03, 0.03, 0.05],
  },
  // the bone-white coat: a dark collar, dark trousers, a dark band
  c: {
    coat: [0.72, 0.68, 0.6], collar: [0.05, 0.05, 0.07], lining: [0.3, 0.28, 0.25], pants: [0.05, 0.05, 0.065], armor: [0.05, 0.05, 0.06],
    skin: [0.96, 0.82, 0.72], eye: [0.008, 0.008, 0.012], hair: [0.94, 0.96, 1.0], hairTip: [1.0, 1.0, 1.0], facing: [0.9, 0.9, 0.92], leather: [0.05, 0.05, 0.07],
  },
};
/** The cool edge of light on the screen's left (× the material's own), per part name. */
const RIM = { coat: 0.6, collar: 0.6, pants: 0.5, armor: 0.5, lining: 0.5, hair: 1.0, hairTip: 1.0 };
/** The eyes' light (the `flask` part): ice blue. */
const EYES = { fill: [0.5, 1.0, 1.8], ink: [0.65, 1.2, 1.9], em: [0.45, 0.95, 1.9] };

// ---------------------------------------------------------------- the ink (shared per part)
// Per part id: the inner ink line [r, g, b, gain], the silhouette's ink [r, g, b, gain], and the pass's
// [fill gain, stroke style, far line, far fill] (model.js heroPartValues; style 8 = a dotted rim). The
// hero's hair (part 11) has gold ink; his is white with a cold cast, its fill lifted so the hair is the
// brightest thing on him at the game camera; the band (part 2) a dark band with a dim edge; his eyes
// (part 19) ice blue.
const ICE = [0.86, 0.94, 1.0];
const line = (c, s, a) => [c[0] * s, c[1] * s, c[2] * s, a];
export const WJ_INK = Object.freeze({
  11: { ink: line(ICE, 1.0, 0.95), rim: line(ICE, 1.1, 1.0), fill: [1.55, 8, 0.4, 1.3] },
  2: { ink: [0.22, 0.24, 0.3, 0.8], rim: [0.3, 0.32, 0.4, 0.85], fill: [1, 0, 0, 1] },
  19: { ink: [0.6, 1.0, 1.4, 1.6], rim: [0.6, 1.0, 1.4, 1.6], fill: [1, 2, 1, 1.4] },
});
/** b's white band (part 7, `facing`): the cloth's own lines, a pale edge. */
const INK_B = Object.freeze({ 7: { ink: [0.9, 0.92, 1.0, 0.9], rim: [0.9, 0.92, 1.0, 0.95], fill: [1.2, 8, 0.3, 1.0] } });

function writeInk(U, look) {
  const I = U?.uHeroPartInk?.value, R = U?.uHeroPartRim?.value, F = U?.uHeroPartFill?.value;
  if (!I || !R || !F) return false;
  for (const T of look === 'b' ? [WJ_INK, INK_B] : [WJ_INK]) {
    for (const p in T) {
      const t = T[p];
      I[p]?.set(t.ink[0], t.ink[1], t.ink[2], t.ink[3]);
      R[p]?.set(t.rim[0], t.rim[1], t.rim[2], t.rim[3]);
      F[p]?.set(t.fill[0], t.fill[1], t.fill[2], t.fill[3]);
    }
  }
  return true;
}

/** His colours (the kit's _tint), once after his rig is built. */
export function tintUntouched(M) {
  if (!M) return;
  const T = WJ_TINT[wjLookNow()] ?? WJ_TINT.a;
  for (const k in T) if (M[k]) setFill(M[k], T[k][0], T[k][1], T[k][2]);
  for (const k in RIM) {
    const u = M[k]?.uniforms?.uArtRim;
    if (u) u.value *= RIM[k];
  }
  const fu = M.flask?.uniforms;
  if (fu) {
    if (fu.uGlowMask) fu.uGlowMask.value = 1;
    fu.uInk?.value.setRGB(...EYES.ink);
    fu.uEmissive?.value.setRGB(...EYES.em);
    fu.uArtFill?.value.setRGB(...EYES.fill);
  }
}

// ---------------------------------------------------------------- the coat by phase
/** By phase: the coat's stir (anim.js reads a panel's `flare`, `breeze`, `idleFlare` every frame) and
 *  whether the front parts (phase 3: the realm's air lifts the hem). `front` scales the front panels'. */
export const COAT_DRESS = Object.freeze([
  null,
  { open: false, flare: 0.05, breeze: 0.02, idle: 0.02, tail: 0.1, front: 0.3 },
  { open: false, flare: 0.07, breeze: 0.035, idle: 0.035, tail: 0.16, front: 0.45 },
  { open: true, flare: 0.12, breeze: 0.07, idle: 0.07, tail: 0.26, front: 0.8 },
]);
/** How far a coat panel may swing in all (rad, both segments; Xin Yi's limits: his flips and kicks
 *  would throw a panel across his chest or through his legs). */
export const COAT_SWING = Object.freeze({ out: 0.87, in: 0.3 });

/** A coat anchor turned to `az` round the pelvis (sheet.js panelSkirt's placement, the same numbers). */
function turnFront(F, az) {
  const { C, R } = F;
  const sa = Math.sin(az), ca = Math.cos(az);
  const r0 = 1 / Math.hypot(sa / R.coatR, ca / (R.coatR * 0.69)) + (C.def.out ?? 0) * 0.5;
  C.anchor.position.set(sa * r0, R.coatY, ca * r0);
  C.anchor.rotation.y = az;
  C.def.az = az;
  C.r0 = r0;
}

/** After the animator: hold each panel inside COAT_SWING (the spring's state too). */
function clampCoat(d) {
  const st = d.anim?.coatState, coat = d.rig?.coat;
  if (!st || !coat) return;
  for (let i = 0; i < coat.length; i++) {
    const s = st[i], C = coat[i];
    if (!s || !C?.segs) continue;
    const a = s[0], b = s[1], tot = a.x + b.x;
    const want = tot < -COAT_SWING.out ? -COAT_SWING.out : tot > COAT_SWING.in ? COAT_SWING.in : tot;
    if (want === tot || !Number.isFinite(tot) || Math.abs(tot) < 1e-6) continue;
    const k = want / tot;
    a.x *= k;
    b.x *= k;
    if (tot < 0) {
      if (a.vx < 0) a.vx = 0;
      if (b.vx < 0) b.vx = 0;
    } else {
      if (a.vx > 0) a.vx = 0;
      if (b.vx > 0) b.vx = 0;
    }
    C.segs[0].rotation.x = a.x;
    C.segs[1].rotation.x = b.x;
    C.segs[0].updateMatrixWorld(true);
  }
}

const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
/** The eyes' size at the game camera (x across, y up: × their close size), from `near` to `far` m. */
export const EYE_FAR = Object.freeze({ near: 6, far: 26, x: 1.7, y: 2.7 });

/** The hand sign is being made (the P2 -> P3 transition's beats: domain.js `wjDomain`). */
function signing(d) {
  if (d.mode !== 'act') return false;
  const a = d.brain?.act;
  return !!a?.def?.transition && !!a.def.beats?.some?.((b) => b.wjDomain);
}

/**
 * Once a frame (kit.dress): the dress of his phase; his ink; the eyes' light (dark behind the band,
 * then d.eyesK, brighter in phase 3, a slow pulse; out when he is dead); the left hand's sword fingers
 * (two fingers raised) through the hand sign.
 */
export function dressUntouched(d) {
  const D = d?.rig?.root?.userData?.dress;
  if (!D || D.kind !== 'wj') return;
  const n = Math.min(3, Math.max(1, fin(d.dressPhase, 1) | 0));
  writeInk(d.game?.U, D.look);
  if (n !== D.phase) {
    D.phase = n;
    for (const e of D.at) e.m.visible = n >= e.from && n <= e.to;
    const S = COAT_DRESS[n];
    for (const F of D.fronts) turnFront(F, S.open ? F.open : F.closed);
    for (const P of D.panels) {
      P.def.flare = P.tail ? S.tail : P.front ? S.flare * 0.6 : S.flare;
      P.def.breeze = S.breeze * (P.tail ? 1.6 : P.front ? S.front : 1);
      P.def.idleFlare = S.idle * (P.tail ? 1.4 : P.front ? 0.3 * S.front : 1);
    }
  }
  clampCoat(d);
  // the eyes: dark behind the band (phase 1 shows none: the band covers them)
  const fu = d.rig.materials?.flask?.uniforms;
  if (fu) {
    const dead = d.mode === 'dead' || (d.mode === 'dying' && fin(d.brain?.modeT) > 1.6);
    const e = Math.min(1, Math.max(0, fin(d.eyesK)));
    const k = dead || n < 2 ? 0 : (n >= 3 ? 1.6 : 1.2) * (0.55 + 0.45 * e) + 0.06 * Math.sin(fin(d.time) * 2.2);
    if (fu.uGlow) fu.uGlow.value = k;
    if (fu.uInkGlow) fu.uInkGlow.value = k;
  }
  // the eyes grow with the camera's distance (1 up close ... EYE_FAR at the game camera), so each still
  // fills a letter cell there: two blue points, not lost between the letters
  const cam = d.game?.camera?.position, hp = d.position;
  if (D.eyes.length && cam && hp) {
    const dist = Math.hypot(cam.x - hp.x, cam.y - hp.y - 1.9, cam.z - hp.z);
    const f = Math.min(1, Math.max(0, (fin(dist, 30) - EYE_FAR.near) / (EYE_FAR.far - EYE_FAR.near)));
    if (Math.abs(f - D.eyeK) > 0.01) {
      D.eyeK = f;
      for (const e of D.eyes) e.scale.set(1 + (EYE_FAR.x - 1) * f, 1 + (EYE_FAR.y - 1) * f, 1);
    }
  }
  // the hand sign: the free hand shows its two raised fingers (the animator chose the open hand)
  const oh = d.rig.offHand;
  const sign = signing(d);
  if (oh?.fingers && oh.open && (sign || D.sign)) {
    D.sign = sign;
    oh.fingers.visible = sign;
    oh.open.visible = !sign && !oh.grip?.visible;
  }
  // a hand in its pocket is hidden (the sleeve ends at the coat's side): the hand's point in his
  // pelvis's own frame, inside the pocket's box
  const pel = d.rig.pelvis;
  if (pel?.matrixWorld && D.handR) {
    _inv.copy(pel.matrixWorld).invert();
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 'R' : 'L';
      handPoint(d, side, _hp).applyMatrix4(_inv);
      const sx = i === 0 ? -_hp.x : _hp.x;
      const inP = sx > POCKET_BOX.x[0] && sx < POCKET_BOX.x[1] && _hp.y > POCKET_BOX.y[0] && _hp.y < POCKET_BOX.y[1] && _hp.z > POCKET_BOX.z[0] && _hp.z < POCKET_BOX.z[1];
      if (i === 0) {
        if (inP !== D.pocket[0]) for (const m of D.handR) m.visible = !inP;
      } else if (inP && oh) {
        oh.open.visible = false;
        if (oh.grip) oh.grip.visible = false;
        if (oh.fingers) oh.fingers.visible = false;
      } else if (D.pocket[1] && oh && !sign) oh.open.visible = !oh.grip?.visible && !oh.fingers?.visible;
      D.pocket[i] = inP;
    }
  }
}
/** The pocket (his pelvis's frame, metres: x out to his side, y up from the pelvis joint, z forward):
 *  a hand whose point is in this box is in its pocket. */
export const POCKET_BOX = Object.freeze({ x: [0.03, 0.16], y: [0.02, 0.18], z: [-0.06, 0.16] });
const _inv = new Matrix4(), _hp = new Vector3();

/** His eyes as drawn (world): out a Vector3; finite even before the rig has a matrix. */
export function eyePoint(d, out) {
  const h = d?.rig?.head;
  if (h?.matrixWorld) {
    out.set(0, 0.128, 0.11).applyMatrix4(h.matrixWorld);
    if (Number.isFinite(out.x + out.y + out.z)) return out;
  }
  const p = d.position;
  return out.set(p.x + Math.sin(d.yaw) * 0.2, p.y + 2.0, p.z + Math.cos(d.yaw) * 0.2);
}

/** His right ('R') or left ('L') hand as drawn (world). */
export function handPoint(d, side, out) {
  const A = d?.rig?.arms?.[side === 'L' ? 'L' : 'R'];
  if (A?.fore?.matrixWorld) {
    out.set(0, -DIM.foreArm, 0).applyMatrix4(A.fore.matrixWorld);
    if (Number.isFinite(out.x + out.y + out.z)) return out;
  }
  const p = d.position, s = side === 'L' ? 1 : -1;
  return out.set(p.x + Math.cos(d.yaw) * 0.3 * s, p.y + 1.0, p.z - Math.sin(d.yaw) * 0.3 * s);
}
