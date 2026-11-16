import { mergeGeometries, sub, tatterStrip, skirtSheet, bandGeometry, sheetOffset, partGeometry, foldLines, ribbonCrease, rng } from '../../player/heroGeo.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { setFill } from './bodyArt.js';

// Look option `b` of Shen Hui's body (`?ashLook=b`; `c` = the same in the dragon look): his own figure,
// dressed by the phase, so the fight shows on the man himself.
//   phase 1  the fencer: as he ships.
//   phase 2  the kindled blade: the robe's hem and the free sleeve's cuff smoulder (a band of ember
//            light along each lower edge, flickering).
//   phase 3  ash on the wind: the straw hat is gone and his hair hangs loose down his back (on a
//            spring, it streams as he moves); the robe is burnt pale, its hem frays into ragged ends
//            and still smoulders.
// Each step is one big, certain change (a missing hat and a pale robe read at 30 m; a trim would not).
//
// Built only when the look is chosen at build time (gear.js reads `lookOf('ashLook')`): the default
// rig ('0') is exactly as before. The pieces are kept out of the static merge (`keep`) so they can be
// shown and hidden; no new material: the ember is the rig's unused `flask` instance (his potion flask
// is never drawn), so the draw calls stay as they are. The pieces hang on the rig and are switched by
// dressFrame(d, dt), which the actor calls once a frame (see the looks report for the line). Without
// that call the dressing stays in its phase-1 state (built hidden): harmless.

/** The option chosen: { art, dress }. */
export function ashLookNow() {
  const o = lookOf('ashLook', '0', 'b');
  return { art: o === 'a' || o === 'c', dress: o === 'b' || o === 'c' };
}

/** Colours (linear): the robe as phase 3 burns it pale; the ember. */
const PALE = { coat: [0.9, 0.86, 0.8], lining: [0.45, 0.43, 0.41] };
const EMBER = { fill: [1.0, 0.36, 0.08], glow: 1.1, ink: 0.9, flicker: 0.35 };

function dressOf(root) {
  return (root.userData.dress ??= { kind: 'ash', phase: 0, p2: [], p3: [], hideP3: [], base: null });
}

/** The hat's meshes come off in phase 3 (`made`: everything the hat item hung). */
export function dressHat(ctx, made) {
  const D = dressOf(ctx.root);
  D.hideP3.push(...made);
  // the loose hair under it: the hero's skull cap of hair, and a long fall down his back on a spring
  const { head, M, joint, mesh } = ctx;
  const cap = mesh(head, partGeometry('hair.cap'), M.hair);
  const base = joint(head, 0, 0.13, -0.085);
  base.rotation.y = Math.PI; // local +Z = its outer face, toward his back
  const s0 = joint(base);
  const L0 = 0.17, L1 = 0.22;
  const a = mesh(s0, foldLines(tatterStrip(L0, 0.15, { tip: false, curl: 0.05, seed: 811 }), ribbonCrease(0.15, 0.6)), M.hair);
  const s1 = joint(s0, 0, -L0, 0);
  const b = mesh(s1, foldLines(tatterStrip(L1, 0.14, { fork: true, curl: 0.12, seed: 823 }), ribbonCrease(0.14, 1.4)), M.hair);
  // two locks fallen forward beside the face
  const locks = mergeGeometries([-1, 1].map((s, k) => sub(tatterStrip(0.13, 0.04, { curl: 0.1, seed: 841 + k }).translate(s * 0.075, 0.09, 0.03), k)));
  const c = mesh(head, locks, M.hair);
  for (const m of [cap, a, b, c]) {
    m.visible = false;
    D.p3.push(m);
  }
  return { keep: [...made, cap, a, b, c], streamers: [{ segs: [s0, s1], len: [L0, L1], out: 0.12, lag: 0.8, max: 1.6 }] };
}

/** The free sleeve's cuff smoulders from phase 2. */
export function dressSleeves(ctx) {
  const D = dressOf(ctx.root);
  const { arms, M, DIM, BODY, mesh } = ctx;
  const fa0 = BODY.foreArm[0];
  const m = mesh(arms.L.fore, bandGeometry(fa0 + 0.04, fa0 + 0.036, 0.026, 14).translate(0, -DIM.foreArm + 0.07, 0), M.flask);
  m.visible = false;
  D.p2.push(m);
  return { keep: [m] };
}

/** The robe's hem: an ember band from phase 2, ragged ends from phase 3 (`out`: the skirt item's handles). */
export function dressSkirt(ctx, out) {
  const D = dressOf(ctx.root);
  const { M, mesh } = ctx;
  const keep = [];
  (out?.coat ?? []).forEach((C, i) => {
    const P = C.def, s1 = C.segs[1];
    const L0 = P.len[0], L1 = P.len[1], R1 = C.r0 + 0.25 * L0, R2 = R1 + 0.25 * L1;
    const sk = P.skew ?? 0, w0 = P.w[0];
    const nF = Math.max(1, Math.round(P.w[2] / 0.09)) + 0.5, fph = i * 2.3 + 0.4;
    // the band of ember along the lower edge, a hair proud of the cloth
    const band = skirtSheet(L1, P.w[1], P.w[2], R1 + 0.006, 0.25, 0.008, 71 + i, [0.012, 0.024, nF, fph], 0.84, 1, sk, w0);
    const e = mesh(s1, band, M.flask);
    e.visible = false;
    D.p2.push(e);
    // the frayed ends: ragged strips of the robe hanging past the hem
    const r = rng(907 + i * 13), n = 4, frays = [];
    for (let k = 0; k < n; k++) {
      const u = ((k + 0.5) / n - 0.5) * P.w[2] * 0.9 + sheetOffset(P.w[2], w0, sk);
      const a = u / R2;
      const g = tatterStrip(0.06 + 0.07 * r(), (P.w[2] / n) * 0.8, { fork: r() < 0.5, curl: 0.2, seed: 950 + i * 7 + k });
      frays.push(sub(g.rotateY(a).translate(Math.sin(a) * R2, -L1 - 0.012, (Math.cos(a) - 1) * R2), k & 1));
    }
    const f = mesh(s1, mergeGeometries(frays), M.coat);
    f.visible = false;
    D.p3.push(f);
    keep.push(e, f);
  });
  return { ...out, keep: [...(out?.keep ?? []), ...keep] };
}

const toRGB = (c) => [c.r, c.g, c.b];
function colourOf(m) {
  const u = m?.uniforms;
  const c = u?.uWInk?.value ?? u?.uArtFill?.value;
  return c ? toRGB(c) : null;
}

/**
 * Once a frame (the actor's): show the dressing of his phase, and let the ember flicker. Cheap: a
 * phase change flips a few `visible` flags; otherwise two uniforms. No allocation after the first call.
 */
export function dressFrame(d, dt) {
  const D = d?.rig?.root?.userData?.dress;
  if (!D || D.kind !== 'ash') return;
  const M = d.rig.materials;
  if (!D.base) D.base = { coat: colourOf(M.coat), lining: colourOf(M.lining) };
  const n = Math.min(3, Math.max(1, d.phase | 0));
  if (n !== D.phase) {
    D.phase = n;
    for (const m of D.p2) m.visible = n >= 2;
    for (const m of D.p3) m.visible = n >= 3;
    for (const m of D.hideP3) m.visible = n < 3;
    const pale = n >= 3;
    for (const k of ['coat', 'lining']) {
      const c = pale ? PALE[k] : D.base[k];
      if (c) setFill(M[k], c[0], c[1], c[2]);
    }
    setFill(M.flask, ...EMBER.fill);
    const fu = M.flask?.uniforms;
    if (fu && !fu.uWInk) {
      // (the ink-line path: the ember's letters and its glow seams)
      fu.uInk?.value.setRGB(0.95, 0.34, 0.07);
      fu.uEmissive?.value.setRGB(1.5, 0.42, 0.08);
    }
  }
  // the ember breathes
  const u = M.flask?.uniforms;
  if (u && n >= 2) {
    const t = Number.isFinite(d.time) ? d.time : 0;
    const f = 1 - EMBER.flicker * (0.5 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1.1));
    u.uGlow.value = EMBER.glow * f;
    u.uInkGlow.value = EMBER.ink * f;
    if (u.uGlowMask) u.uGlowMask.value = 1;
  }
}
