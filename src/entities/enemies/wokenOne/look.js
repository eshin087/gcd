import { lookOf } from '../duelist/lookSwitch.js';
import { setFill } from '../ashDisciple/bodyArt.js';

// Xin Yi's look options (duelist/lookSwitch.js; never in PICKED: the owner picks from the sheets, PENDING):
//   ?oneLook=a|b|c   a the Long Coat (the fight is built with it): black, closed and still in phase 1,
//                    open from phase 2 (the tails fly); b the Cassock: buttoned to the neck, narrow,
//                    floor-length, a line of bright cells down the chest; c the Grey Coat: the same cut
//                    in dark blue-grey with a white-jade rim (for the phone).
// His body is the hero's skeleton in the hero's INK-LINE art (gear.js builds it), drawn by what rings it:
// a black coat on a dark level reads by its edge, so the fills are near black and the ink lines and the
// silhouette are lit pale jade; the face and the hands are pale; the glasses are a dark band with one
// bright cell (ADR-150's lesson: at ~40 px the silhouette and the colour carry a homage, small detail
// does not: the long coat with its split tails and the high collar).
//
// tintOne(M): his fills on HIS material instances, once after the rig is built (the class's _tint).
// dressOne(d, dt): once a frame (kit.dress). By phase (d.dressPhase ?? d.phase):
//   1  the coat closed and still (its front panels overlap; little flare, no stir), no guns (the left
//      hand behind his back is in the poses: poses.js BEHIND)
//   2  the coat thrown open (the front panels turn apart, the V of the coat's torso shows the shirt), the
//      tails flare and stir (they fly behind him with his motion: the animator's coat springs lag by his
//      speed), a handgun in each hand (hidden through the first part of his reload: they were thrown away)
//   3  no guns, the coat open, its edge of light brighter
// A phase change flips a few `visible` flags, turns two coat anchors and writes a few uniforms; any
// other frame reads three numbers. No allocation after the first call.
//
// The silhouette's ink (U.uHeroPartInk / Rim / Fill) is shared by every boss rig on the page (the
// player's rig reads its own, uSelfPart*). He is the only boss rig in his hall, so his parts' ink is
// written there (the Starless Lord's precedent: lord.js writes part 19 for his level), again on every
// phase change, so a rig built later from HERO_INK cannot leave him in the hero's lavender.

export const ONE_LOOKS = Object.freeze({ oneLook: 'a' });
export const oneLook = (name = 'oneLook') => lookOf(name, ONE_LOOKS[name] ?? 'a');
/** The outfit chosen ('a' | 'b' | 'c'; anything else draws a), read when his rig is built. */
export function oneLookNow() {
  const o = oneLook();
  return o === 'b' || o === 'c' ? o : 'a';
}

/** The dressing record on his rig (gear.js registers the switched pieces in it). */
export function dressOf(root, look = 'a') {
  return (root.userData.dress ??= { kind: 'one', look, phase: 0, at: [], guns: [], fronts: [], panels: [], inked: false, reload: false });
}
/** Show mesh `m` from phase `from` to phase `to` (hidden until then; phase 1 is the build's state). */
export function at(D, m, from, to = 9) {
  D.at.push({ m, from, to });
  m.visible = from <= 1 && to >= 1;
}

// ---------------------------------------------------------------- colours (linear)
/** The fill of each of his material instances, per outfit (gear.js says which material is which:
 *  `coat` / `collar` the coat, `lining` / `collarIn` its inside, `shirt` the shirt in the open V,
 *  `pants` the trousers, `armor` the boots and the guns, `skin` the face and the hands, `eye` the
 *  glasses' lenses, `hair` / `hairTip` the short dark hair, `flask` the bright cells: the glint on the
 *  glasses, the guns' muzzles, the Cassock's buttons). */
export const ONE_TINT = {
  // the Long Coat: black with a cold green cast (dim letters, the edge carries him), a dark jade inside
  a: {
    coat: [0.11, 0.14, 0.13], collar: [0.11, 0.14, 0.13], lining: [0.04, 0.12, 0.09], collarIn: [0.05, 0.15, 0.11],
    shirt: [0.06, 0.07, 0.07], pants: [0.09, 0.1, 0.1], armor: [0.1, 0.11, 0.11],
    skin: [1.0, 0.96, 0.9], eye: [0.01, 0.012, 0.014], hair: [0.07, 0.075, 0.08], hairTip: [0.08, 0.085, 0.09],
    flask: [0.7, 1.0, 0.86],
  },
  // the Cassock: the same black, a little warmer, the buttons bright
  b: {
    coat: [0.12, 0.13, 0.12], collar: [0.12, 0.13, 0.12], lining: [0.04, 0.11, 0.085], collarIn: [0.05, 0.13, 0.1],
    shirt: [0.05, 0.06, 0.06], pants: [0.06, 0.07, 0.07], armor: [0.08, 0.09, 0.09],
    skin: [1.0, 0.96, 0.9], eye: [0.01, 0.012, 0.014], hair: [0.05, 0.055, 0.06], hairTip: [0.06, 0.065, 0.07],
    flask: [0.7, 1.0, 0.86],
  },
  // the Grey Coat: dark blue-grey, a lighter body for a small screen
  c: {
    coat: [0.24, 0.28, 0.34], collar: [0.24, 0.28, 0.34], lining: [0.05, 0.11, 0.09], collarIn: [0.07, 0.15, 0.12],
    shirt: [0.05, 0.06, 0.065], pants: [0.09, 0.1, 0.12], armor: [0.09, 0.1, 0.11],
    skin: [1.0, 0.96, 0.9], eye: [0.01, 0.012, 0.014], hair: [0.05, 0.055, 0.06], hairTip: [0.06, 0.065, 0.07],
    flask: [0.8, 1.0, 0.92],
  },
};

/** The edge of light on the screen's left (the art source's per-instance rim, × its HERO_INK rim). */
const RIM = { coat: 0.5, collar: 0.5, pants: 0.5, armor: 0.6, hair: 0.6, hairTip: 0.6, lining: 0.5, shirt: 0.4 };

// ---------------------------------------------------------------- the ink (shared per part: see above)
// Per part id: the inner ink line [r, g, b, gain], the silhouette's ink [r, g, b, gain], and the pass's
// [fill gain, stroke style, far line, far fill] (model.js heroPartValues). An ink gain over 1.5 keeps the
// silhouette at full light at the game camera (pipeline.js: `step(pInk.a, 1.5)`): the coat's edge is the
// one thing that must read there; its inner seams fade (far line low).
const JADE = [0.62, 1.0, 0.84], WHITE_JADE = [0.86, 1.0, 0.94];
function inkTable(look, phase) {
  const rim = look === 'c' ? WHITE_JADE : JADE;
  const k = phase >= 3 ? 1.35 : 1; // phase 3: the coat's edge brighter
  const line = (c, s, a) => [c[0] * s, c[1] * s, c[2] * s, a];
  return {
    // 6 the coat and its collar: jade seams up close, a jade silhouette that holds at any distance
    6: { ink: line(rim, 0.36, 1.6), rim: line(rim, 0.95 * k, 1.0), fill: [1, 0, 0.12, 1.0] },
    // 4 the coat's inside (lining, the collar's inner face): a darker jade
    4: { ink: line(rim, 0.3, 1.6), rim: line(rim, 0.8 * k, 1.0), fill: [1, 0, 0.12, 0.9] },
    // 5 the trousers, 12 the boots and the guns: the same edge, quieter
    5: { ink: line(rim, 0.3, 1.6), rim: line(rim, 0.7 * k, 1.0), fill: [1, 0, 0.1, 0.6] },
    12: { ink: line(rim, 0.34, 1.6), rim: line(rim, 0.8 * k, 1.0), fill: [1, 0, 0.2, 0.8] },
    // 3 the shirt in the open V
    3: { ink: line(rim, 0.3, 1.0), rim: line(rim, 0.6 * k, 1.0), fill: [1, 0, 0.1, 0.5] },
    // 11 the short dark hair: a jade edge round the head
    11: { ink: line(rim, 0.34, 1.6), rim: line(rim, 0.85 * k, 1.0), fill: [1.0, 8, 0.15, 0.8] },
    // 1 the pale face and hands: a pale line, the letters lit to the edge (`open`)
    1: { ink: [0.75, 0.85, 0.8, 0.8], rim: [0.85, 0.95, 0.9, 0.9], fill: [2.2, 4, 0, 0.75] },
    // 2 the glasses: a dark band, its outline dim
    2: { ink: [0.2, 0.3, 0.26, 0.8], rim: [0.25, 0.35, 0.3, 0.8], fill: [1, 0, 0, 1] },
    // 19 the bright cells (the glint, the muzzles, the buttons): unbroken, glowing
    19: { ink: [0.9, 1.3, 1.1, 1.8], rim: [0.9, 1.3, 1.1, 1.8], fill: [1, 2, 1, 1.4] },
  };
}

/** Write his parts' ink into the shared per-part tables (the boss rigs' only: the player reads his own). */
function writeInk(U, look, phase) {
  const I = U?.uHeroPartInk?.value, R = U?.uHeroPartRim?.value, F = U?.uHeroPartFill?.value;
  if (!I || !R || !F) return false;
  const T = inkTable(look, phase);
  for (const p in T) {
    const t = T[p];
    I[p]?.set(t.ink[0], t.ink[1], t.ink[2], t.ink[3]);
    R[p]?.set(t.rim[0], t.rim[1], t.rim[2], t.rim[3]);
    F[p]?.set(t.fill[0], t.fill[1], t.fill[2], t.fill[3]);
  }
  return true;
}

/** His colours (the class's _tint): the outfit's fills and edge light on HIS material instances. */
export function tintOne(M) {
  if (!M) return;
  const T = ONE_TINT[oneLookNow()] ?? ONE_TINT.a;
  for (const k in T) setFill(M[k], T[k][0], T[k][1], T[k][2]);
  for (const k in RIM) {
    const u = M[k]?.uniforms?.uArtRim;
    if (u) u.value *= RIM[k];
  }
  // the bright cells glow in jade-white (the flask part's own ink is amber for every rig)
  const fu = M.flask?.uniforms;
  if (fu) {
    if (fu.uGlowMask) fu.uGlowMask.value = 1;
    fu.uInk?.value.setRGB(0.8, 1.2, 1.0);
    fu.uEmissive?.value.setRGB(0.7, 1.3, 1.0);
    if (fu.uGlow) fu.uGlow.value = 0.6;
  }
}

/** By phase: the coat's stir (anim.js reads a panel's `flare`, `breeze`, `idleFlare` every frame) and
 *  whether the front stands open. Per outfit: the Cassock never opens and barely stirs. */
const COAT_DRESS = {
  a: [null, { open: false, flare: 0.06, breeze: 0.0, idle: 0.0, tail: 0.1 }, { open: true, flare: 0.1, breeze: 0.04, idle: 0.04, tail: 0.22 }, { open: true, flare: 0.12, breeze: 0.06, idle: 0.06, tail: 0.27 }],
  b: [null, { open: false, flare: 0.04, breeze: 0.0, idle: 0.0, tail: 0.06 }, { open: false, flare: 0.06, breeze: 0.02, idle: 0.02, tail: 0.12 }, { open: false, flare: 0.08, breeze: 0.03, idle: 0.03, tail: 0.16 }],
};
COAT_DRESS.c = COAT_DRESS.a;

const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
/** How long into his reload the guns are gone (s: thrown away, the next pair not yet drawn). */
const RELOAD_EMPTY = 0.32;

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

/**
 * Once a frame (the actor's): show the dressing of his phase. A phase change flips the pieces'
 * `visible` flags, opens or closes the coat's front and sets its stir, and writes his ink; otherwise
 * only the reload's empty hands are read.
 */
export function dressOne(d, dt) {
  const D = d?.rig?.root?.userData?.dress;
  if (!D || D.kind !== 'one') return;
  const n = Math.min(3, Math.max(1, fin(d.dressPhase ?? d.phase, 1) | 0));
  if (!D.inked || n !== D.phase) D.inked = writeInk(d.game?.U, D.look, n);
  if (n !== D.phase) {
    D.phase = n;
    for (const e of D.at) e.m.visible = n >= e.from && n <= e.to;
    const S = (COAT_DRESS[D.look] ?? COAT_DRESS.a)[n];
    for (const F of D.fronts) turnFront(F, S.open ? F.open : F.closed);
    for (const P of D.panels) {
      P.def.flare = P.tail ? S.tail : P.front ? S.flare * 0.6 : S.flare;
      P.def.breeze = S.breeze * (P.tail ? 1.6 : 1);
      P.def.idleFlare = S.idle * (P.tail ? 1.4 : P.front ? 0.3 : 1);
    }
    D.reload = !D.reload; // (re-read the guns below)
  }
  // the guns: phase 2 only; gone from the start of his reload until he draws the next pair
  const empty = !!d.iron?.reloading && fin(d.brain?.act?.t, 1) < RELOAD_EMPTY;
  if (empty !== D.reload) {
    D.reload = empty;
    for (const g of D.guns) g.visible = n === 2 && !empty;
  }
}
