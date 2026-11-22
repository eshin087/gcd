import { axes, screenAngle } from './clashFx.js';
import { FIRE_KIND } from '../render/firePalettes.js';

// THE IMPACT STAMP: a landed cut as a short ASCII animation printed IN the letter grid at the drawn
// contact, in the fire field's `steel` (STYLE.md "The fire field": a thin line of steel prints as the
// stroke character that runs along it, '-' '/' '|' '\', and a cell hotter than ~1.2 prints a white
// digit). It is made of the same small letters as the bodies, not glyph sprites on top of them.
//
// How it is written (the worked examples: the timing cues' white cross, DuelFx._ink / _drawGlint):
//   - ONE blob of steel per letter cell, 12 px across, centred on the cell (the stamp's anchor is
//     snapped to a cell centre every frame and every offset is a whole number of cells), so a line
//     prints as exactly one cell of stroke per step at exactly the heat asked for. A soft line of
//     blobs that falls between two rows of cells all but vanishes (measured: a blob 4 px off a cell
//     centre keeps ~13 % of its heat); snapped, a one-row line always prints.
//   - The anchor is the contact pulled `pull` m toward the camera (along the view ray: it does not
//     move on screen), past the field's 0.9 m soft depth fade, which would otherwise dim heat that
//     sits on (or inside) the struck body to nothing.
//   - It is re-drawn every frame (so it stays snapped through the camera's shake and punch), with
//     one copy alive per frame (a one-copy frame clock, as DuelFx._frame: held heat never stacks in
//     the hit-stop's slow fx time).
//   - The animation is STEPPED: each frame of it is held `hold` s of fx time (game.fxDt: it runs on
//     through the freeze), then the next replaces it outright. No fade between frames.
// Shapes, by the attack's tier (combat.js `contact`), laid along the blade's travel as seen on screen
// (as cutFx lays its slash line; a thrust's / the execution's along the blade):
//   slit     (light, sweep, cleave) a short hot line along the cut that grows, opens at its heart
//            and splits into two thin lines, then a few specks off its ends; the cleave's is long,
//            grows with the charge, and carries a cross stroke along the blade
//   pierce   (point) an entry mark along the blade into a hot point, a small ring opening round it
//   star     (slam) a plus, then an eight-point star of strokes, then a ring that opens and breaks up
//   puncture (execute) a hot puncture, then two rings opening one inside the other
// A crit (or a broken foe) is larger and gets the cross. Calm on purpose: thin lines, one to three
// hot cells a frame, nothing round and bright (fire field `hdr` 0.6; a bright blot hid both fighters).
// No randomness except the specks' places, from this module's own stream (never Math.random).

let seed = 0x2b7e1516;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v) => Number.isFinite(v);
const TAU = Math.PI * 2;
const K_STEEL = FIRE_KIND.steel;

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

/** Every loose glyph the stamp spawns as a particle (the world atlas: tests/glyphcheck.mjs reads
 *  this). None: the stamp is written in the fire field only. */
export const STAMP_GLYPHS = [];

/** The last stamp's counts (tests read it; reused, never reallocated). `n` counts the stamps drawn;
 *  `blobs` every blob the last stamp has written so far, `peak` the most in one drawn frame,
 *  `frames` the animation frames it has shown, `lowY` the lowest blob it wrote (world y). */
export const STAMP_LAST = { blobs: 0, peak: 0, frames: 0, n: 0, lowY: Infinity, tier: '' };

/**
 * The stamp's numbers. Lengths are metres AT THE CONTACT (they follow the fighters' size on screen,
 * whatever the frame's resolution), turned into whole letter cells; heat is the fire field's (about
 * 0.35 a dim speck / digit, 0.6 a dim stroke, 1.1 a bright stroke, 1.5+ a white digit).
 *   hold     s of fx time each animation frame is held (stepped, not faded)
 *   pull     m the anchor is pulled toward the camera (past the field's soft depth fade). Measured:
 *            1 m (the duelists' cues) is enough on a human, but the wyrm's drawn contact sits inside
 *            the bulk of its body, and at 1 m the whole stamp faded to nothing behind its surface
 *   minY     no blob is written below this height (m): heat near the floor fades into it
 *   px       a blob's size, frame px at a 5 x 8 px cell (one cell; scaled with the cell)
 *   minLen   a line is never shorter than this many cells from its heart (else it is not a line)
 *   lowQ     the LOW quality preset: rings keep this share of their cells, the specks frame is dropped
 *   crit     a crit: lengths x size, the cross added to a slit (`cross` m half-length)
 *   kMin/kMax  the piece's strength k scales the lengths (0.5 small, 1, 1.5 large), clamped here
 *   specks   cells thrown off a line's ends in the last frame, per end
 * Per tier: `shape` and its lengths (m): len0/len1/len2 the line's half-length in frames 0/1/2,
 * lenK the extra a full charge adds (x len), cross (m, 0 none), r0/r1/r2 ring radii.
 */
export const STAMP_LOOK = deepFreeze({
  hold: 0.04,
  pull: 2.5,
  minY: 0.7,
  px: 12,
  minLen: 1,
  lowQ: 0.6,
  kMin: 0.3,
  kMax: 2,
  crit: { size: 1.2, cross: 0.22 },
  heat: { hot: 1.22, joint: 1.15, line: 0.95, mid: 0.72, dim: 0.52, speck: 0.36 },
  tier: {
    light: { shape: 'slit', len0: 0.22, len1: 0.5, len2: 0.62, gap: 0.1, cross: 0, specks: 1 },
    sweep: { shape: 'slit', len0: 0.26, len1: 0.62, len2: 0.78, gap: 0.12, cross: 0, specks: 1 },
    cleave: { shape: 'slit', len0: 0.34, len1: 0.85, len2: 1.05, lenK: 0.4, gap: 0.14, cross: 0.28, specks: 2 },
    point: { shape: 'pierce', len0: 0.36, r1: 0.18, r2: 0.34, r3: 0.46 },
    slam: { shape: 'star', len0: 0.2, len1: 0.45, r2: 0.5, r3: 0.7 },
    execute: { shape: 'puncture', len0: 0.3, r1: 0.2, r2: 0.46, r3: 0.66, r4: 0.82 },
  },
  // the ink (fireField.js tint): the stamp's cells print on black (`dark` 0..1) in `rgb` (a colour
  // the steel is dyed: x 0.62 x its brightness; a near-white keeps it white), `crit` a crit's cold
  // blue; `pad` how much wider than the stamp the zone is drawn; `id` the zone's number (the flares
  // take 1..100000, the black charge 900000+)
  // the hero is spared: no cell of the stamp inside an ellipse round his figure on screen, from his
  // feet (`foot` m up) to his crown (`head`), `rx` m to each side, `pad` m beyond his ends. He stands
  // in front of the wound
  spare: { rx: 0.24, foot: 0.05, head: 1.7, pad: 0.04 },
  ink: { dark: 1, rgb: [1.62, 1.62, 1.7], crit: [1.05, 1.5, 2.4], pad: 1.45, id: 800001 },
  // the frames of each shape (how many; the last is the specks' frame, dropped on LOW)
  frames: { slit: 4, pierce: 4, star: 4, puncture: 5 },
});

/** Where the stamp sits beside today's slash line (cutFx.js): 'over' (both: the default) or
 *  'instead' (the stamp replaces the slash line and its cross; the sparks, core, motes stay).
 *  ?stamp=instead in the URL, or setStampMode. Read at the moment of the hit. */
let mode = (() => {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('stamp') : null;
    return q === 'instead' ? 'instead' : 'over';
  } catch {
    return 'over';
  }
})();
export const setStampMode = (m) => {
  mode = m === 'instead' ? 'instead' : 'over';
};
export const stampMode = () => mode;
/** The ink (STAMP_LOOK.ink) on or off (?stampInk=0: off; the sheets' comparison row). */
let inkOn = (() => {
  try {
    return (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('stampInk') : null) !== '0';
  } catch {
    return true;
  }
})();
export const setStampInk = (on) => {
  inkOn = !!on;
};
let replacePending = false;
/** cutFx.js asks once per cut: did the stamp just drawn replace the slash line? (Clears the answer.) */
export const takeStampReplace = () => {
  const r = replacePending;
  replacePending = false;
  return r;
};

// ---- the stamps alive (pooled; the oldest is replaced)
const POOL = 4;
const stamps = Array.from({ length: POOL }, () => ({ alive: false, x: 0, y: 0, z: 0, mpp0: 0.025, age: 0, ca: 0, ea: 0, tier: 'light', T: null, s: 1, crit: false, low: false, power: 0, frames: 4, seed: 1, shown: -1 }));

// the one-copy frame clock (see the header): fx time, and when the blobs alive now die
let fxNow = 0;
let deadline = -1;
/** A copy's life: past the next frame's fx step even when it grows (a hit-stop ends: 0.6 x a frame
 *  becomes a whole frame; a copy that lives 1.5 x the shorter step dies unseen and the stamp blinks
 *  out for a frame), short enough to be replaced within two frames. The deadline keeps it one copy. */
const copyLife = (d) => Math.max(0.021, d * 1.6);

// ---- the screen (as DuelFx._screen), reused
const SCR = { mpp: 0.025, px: 0, py: 0, cw: 5, ch: 8, ok: false };
const screen = (game, x, y, z) => {
  const S = SCR, cam = game.camera, p = game.pipeline;
  S.ok = false;
  S.mpp = 0.025;
  S.cw = p?.artCell?.x > 0 ? p.artCell.x : 5;
  S.ch = p?.artCell?.y > 0 ? p.artCell.y : 8;
  const W = p?.width, H = p?.height, m = cam?.matrixWorldInverse?.elements, e = cam?.projectionMatrix?.elements;
  if (!m || !e || !(W > 8) || !(H > 8)) return S;
  const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
  if (!(vz > 0.2) || !fin(vx + vy + vz) || !(e[5] > 0)) return S;
  const mpp = (2 * vz) / (H * e[5]);
  const px = (((vx * e[0]) / vz) * 0.5 + 0.5) * W, py = (((vy * e[5]) / vz) * 0.5 + 0.5) * H;
  if (!fin(mpp + px + py) || !(mpp > 1e-5)) return S;
  S.mpp = mpp;
  S.px = px;
  S.py = py;
  S.ok = true;
  return S;
};

// ---- the cells of one drawn frame: whole-cell offsets from the anchor, the hottest wins a cell
const MAXC = 200;
const CI = new Int16Array(MAXC), CJ = new Int16Array(MAXC), CH = new Float32Array(MAXC);
let nc = 0;
let cw = 5, ch = 8, ppm = 40; // this stamp's cell (px) and px per metre at the contact
const put = (i, j, h) => {
  if (!(h > 0.05)) return;
  for (let k = 0; k < nc; k++) {
    if (CI[k] === i && CJ[k] === j) {
      if (h > CH[k]) CH[k] = h;
      return;
    }
  }
  if (nc >= MAXC) return;
  CI[nc] = i;
  CJ[nc] = j;
  CH[nc] = h;
  nc++;
};
let oi = 0, oj = 0; // a whole-cell shift applied to what is laid (a split line's halves)
/** A cell at (ox, oy) frame px from the anchor (rounded to the nearest whole cell). */
const at = (ox, oy, h) => put(Math.round(ox / cw) + oi, Math.round(oy / ch) + oj, h);
/** A line along screen angle `a` from r0 to r1 m off the anchor, heat h0 → h1: one cell per step. */
const ray = (a, r0, r1, h0, h1) => {
  const c = Math.cos(a), s = Math.sin(a);
  const p0 = r0 * ppm, p1 = r1 * ppm;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(c * (p1 - p0)) / cw, Math.abs(s * (p1 - p0)) / ch)));
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = p0 + (p1 - p0) * t;
    at(c * r, s * r, h0 + (h1 - h0) * t);
  }
};
/** A line through the anchor both ways along `a`, from r0 to r1 m each side. */
const line2 = (a, r0, r1, h0, h1) => {
  ray(a, r0, r1, h0, h1);
  ray(a + Math.PI, r0, r1, h0, h1);
};
/**
 * A ring of radius r m, laid on the grid as a flat hexagon: a run of '-' along its top and bottom,
 * its four sides one cell a step on the cell's diagonal (so each prints as a clean '/' or ''),
 * the points at the sides. A small circle of soft cells on a 5 x 8 grid prints as a jumble of
 * strokes pointing every way; this prints as a ring. `keep` < 1: only that share of its cells
 * (evenly spread: a ring breaking up into specks).
 */
const ring = (r, h, keep = 1) => {
  const rp = r * ppm;
  const R = Math.max(2, Math.round(rp / cw)), V = Math.max(1, Math.min(R - 1, Math.round(rp / ch)));
  const X = R - V; // the half-length of the top run
  // the six corners, counter-clockwise from the right point
  let kept = 0;
  for (let e = 0; e < 6; e++) {
    const i0 = e === 0 ? R : e === 1 ? X : e === 2 ? -X : e === 3 ? -R : e === 4 ? -X : X;
    const j0 = e === 0 || e === 3 ? 0 : e < 3 ? V : -V;
    const e1 = (e + 1) % 6;
    const i1 = e1 === 0 ? R : e1 === 1 ? X : e1 === 2 ? -X : e1 === 3 ? -R : e1 === 4 ? -X : X;
    const j1 = e1 === 0 || e1 === 3 ? 0 : e1 < 3 ? V : -V;
    const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0));
    for (let k = 0; k < n; k++) {
      kept += keep;
      if (kept < 1) continue;
      kept -= 1;
      const t = k / n;
      put(Math.round(i0 + (i1 - i0) * t) + oi, Math.round(j0 + (j1 - j0) * t) + oj, h);
    }
  }
};

/** The cells of animation frame `f` of stamp `S` into the cell list. */
function shape(S, f) {
  const L = STAMP_LOOK, H = L.heat, T = S.T, s = S.s, ca = S.ca;
  const minL = (L.minLen * Math.max(cw, ch)) / ppm; // a line reaches at least one cell out
  const q = S.low ? L.lowQ : 1;
  oi = oj = 0;
  if (T.shape === 'slit') {
    const g = 1 + (T.lenK ?? 0) * S.power;
    const cross = Math.max(T.cross, S.crit ? L.crit.cross : 0) * s;
    // the cross stroke along the blade, or square across the line when the blade runs along it
    let ta = S.ea;
    const dd = (((ta - ca) % Math.PI) + Math.PI) % Math.PI;
    if (Math.min(dd, Math.PI - dd) < 0.5) ta = ca + Math.PI / 2;
    if (f === 0) {
      // a short hot line along the cut
      at(0, 0, H.hot);
      line2(ca, 0, Math.max(minL, T.len0 * s * g), H.line, H.mid);
    } else if (f === 1) {
      // grown, its heart opening (dim), the cross (heavy / crit) laid through it
      line2(ca, T.gap * s, Math.max(minL * 2, T.len1 * s * g), H.line, H.dim);
      if (cross > 0) {
        at(0, 0, H.joint);
        line2(ta, 0, Math.max(minL, cross), H.line, H.mid);
      } else at(0, 0, H.dim);
    } else if (f === 2) {
      // split: the two halves slip apart, one cell across the line each way, the heart gone
      const flat = Math.abs(Math.cos(ca)) >= Math.abs(Math.sin(ca));
      const r0 = Math.max(minL, T.len1 * 0.4 * s * g), r1 = Math.max(minL * 2, T.len2 * s * g);
      for (let sd = -1; sd <= 1; sd += 2) {
        oi = flat ? 0 : sd;
        oj = flat ? -sd : 0;
        ray(ca + (sd < 0 ? Math.PI : 0), r0, r1, H.mid, H.speck);
      }
      oi = oj = 0;
      if (cross > 0) {
        ray(ta, cross * 0.7, cross * 1.15, H.dim, H.speck);
        ray(ta + Math.PI, cross * 0.7, cross * 1.15, H.dim, H.speck);
      }
    } else {
      // specks off the ends
      const r = Math.max(minL * 2, T.len2 * s * g) * 1.12;
      for (let sd = 0; sd < 2; sd++) {
        const a = ca + sd * Math.PI;
        for (let i = 0; i < T.specks; i++) {
          const rr = r * (1 + 0.18 * i) + (rnd() - 0.5) * 0.08, aa = a + (rnd() - 0.5) * 0.5;
          at(Math.cos(aa) * rr * ppm, Math.sin(aa) * rr * ppm, H.speck);
        }
      }
    }
  } else if (T.shape === 'pierce') {
    const ea = S.ea; // the blade, hilt → point: the entry mark runs back from the point
    if (f === 0) {
      at(0, 0, H.hot);
      ray(ea + Math.PI, minL * 0.5, Math.max(minL * 2, T.len0 * s), H.line, H.dim);
    } else if (f === 1) {
      at(0, 0, H.joint);
      ring(T.r1 * s, H.mid, q);
    } else if (f === 2) {
      at(0, 0, H.dim);
      ring(T.r2 * s, H.dim, q);
    } else {
      ring(T.r3 * s, H.speck, 0.4 * q);
    }
  } else if (T.shape === 'star') {
    // the rays on the grid's own lines: across, up, and the cell's diagonals (one cell a step, so
    // each prints as one clean '/' or '')
    const dg = Math.atan2(ch, cw);
    if (f === 0) {
      at(0, 0, H.hot);
      for (let i = 0; i < 4; i++) ray((i * Math.PI) / 2, minL * 0.5, Math.max(minL, T.len0 * s), H.line, H.mid);
    } else if (f === 1) {
      at(0, 0, H.joint);
      for (let i = 0; i < 4; i++) ray((i * Math.PI) / 2, minL, Math.max(minL * 2, T.len1 * s), H.line, H.dim);
      for (let i = 0; i < 4; i++) ray((i & 1 ? Math.PI - dg : dg) + (i & 2 ? Math.PI : 0), minL, Math.max(minL * 1.5, T.len1 * 0.8 * s), H.mid, H.dim);
    } else if (f === 2) {
      ring(T.r2 * s, H.mid, q);
    } else {
      ring(T.r3 * s, H.speck, 0.5 * q);
    }
  } else {
    // puncture
    const ea = S.ea;
    if (f === 0) {
      at(0, 0, H.hot);
      ray(ea + Math.PI, minL * 0.5, Math.max(minL * 1.5, T.len0 * s), H.line, H.dim);
    } else if (f === 1) {
      at(0, 0, H.joint);
      ring(T.r1 * s, H.line, q);
    } else if (f === 2) {
      at(0, 0, H.dim);
      ring(T.r2 * s, H.mid, q);
    } else if (f === 3) {
      ring(T.r3 * s, H.dim, q);
      ring(T.r1 * s, H.speck, q);
    } else {
      ring(T.r4 * s, H.speck, 0.4 * q);
    }
  }
}

// the fire field's reused blob record
const B = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.3, sizeEnd: 0.3, heat: 1, heatEnd: 1, kind: K_STEEL, drag: 0, gravity: 0 };

/** Write the current frame of stamp S with blobs living `life` s. Returns the blobs written. */
function draw(game, S, life) {
  const F = game.fx?.fire;
  if (!F?.spawn) return 0;
  const L = STAMP_LOOK;
  const f = Math.min(S.frames - 1, Math.floor(S.age / L.hold));
  const A = axes(game);
  // the hero's figure on screen (an ellipse round his middle): the stamp is never written over him
  let hx = 0, hy = 0, hrx = 0, hry = 0;
  const hp = game.player?.position, SP = L.spare;
  if (hp && SP.rx > 0 && fin(hp.x + hp.y + hp.z)) {
    // (his feet and his crown projected: the camera looks down, a standing figure is foreshortened)
    const Q = screen(game, hp.x, hp.y + SP.foot, hp.z);
    const fx = Q.px, fy = Q.py, ok = Q.ok;
    screen(game, hp.x, hp.y + SP.head, hp.z);
    if (ok && Q.ok) {
      hx = (fx + Q.px) * 0.5;
      hy = (fy + Q.py) * 0.5;
      hrx = SP.rx / Q.mpp;
      hry = Math.hypot(Q.px - fx, Q.py - fy) * 0.5 + SP.pad / Q.mpp;
    }
  }
  const P = screen(game, S.x, S.y, S.z);
  cw = P.cw;
  ch = P.ch;
  const mpp = P.mpp;
  ppm = 1 / S.mpp0; // lengths are metres at the contact
  nc = 0;
  seed = S.seed; // the specks fall in the same places on every redraw of a frame
  shape(S, f);
  // onto the centre of the cell the anchor falls in
  let x = S.x, y = S.y, z = S.z;
  if (P.ok) {
    const ox = ((Math.floor(P.px / cw) + 0.5) * cw - P.px) * mpp, oy = ((Math.floor(P.py / ch) + 0.5) * ch - P.py) * mpp;
    x += A.rx * ox + A.ux * oy;
    y += A.ry * ox + A.uy * oy;
    z += A.rz * ox + A.uz * oy;
  }
  const D = L.px * (cw / 5) * mpp;
  let n = 0;
  B.life = life;
  B.size = B.sizeEnd = D;
  const ax0 = P.ok ? (Math.floor(P.px / cw) + 0.5) * cw : 0, ay0 = P.ok ? (Math.floor(P.py / ch) + 0.5) * ch : 0;
  for (let k = 0; k < nc; k++) {
    if (hrx > 0 && P.ok) {
      const ex = (ax0 + CI[k] * cw - hx) / hrx, ey = (ay0 + CJ[k] * ch - hy) / hry;
      if (ex * ex + ey * ey < 1) {
        CH[k] = 0; // (spared: not counted for the ink's extent either)
        continue;
      }
    }
    const ox = CI[k] * cw * mpp, oy = CJ[k] * ch * mpp;
    const bx = x + A.rx * ox + A.ux * oy, by = y + A.ry * ox + A.uy * oy, bz = z + A.rz * ox + A.uz * oy;
    if (!(by >= L.minY) || !fin(bx + bz)) continue;
    B.x = bx;
    B.y = by;
    B.z = bz;
    B.heat = B.heatEnd = CH[k];
    if (F.spawn(B) >= 0) {
      n++;
      if (S === last && by < STAMP_LAST.lowY) STAMP_LAST.lowY = by;
    }
  }
  // the ink: the newest stamp's cells print on BLACK (the fire field's tint zone, `dark`): on the
  // wyrm's field of bright digits a steel stroke is one bright letter among many; on a black cell it
  // is a cut line. Only cells holding steel are blacked out (fireField.js tint), nothing else
  const I = L.ink;
  if (S === last && n > 0 && inkOn && P.ok && F.tint && I.dark > 0) {
    let mi = 0, mj = 0;
    for (let k = 0; k < nc; k++) {
      if (!(CH[k] > 0)) continue;
      const ai = CI[k] < 0 ? -CI[k] : CI[k], aj = CJ[k] < 0 ? -CJ[k] : CJ[k];
      if (ai > mi) mi = ai;
      if (aj > mj) mj = aj;
    }
    // (a zone dyes fully only inside 70 % of its radius: drawn wide)
    const cx = (Math.floor(P.px / cw) + 0.5) * cw, cy = (Math.floor(P.py / ch) + 0.5) * ch;
    F.tint(I.id, cx, cy, (mi + 1.5) * cw * I.pad, (mj + 1.5) * ch * I.pad, S.crit ? I.crit : I.rgb, 1, I.dark, life + 0.004);
  }
  if (S === last) {
    STAMP_LAST.blobs += n;
    if (n > STAMP_LAST.peak) STAMP_LAST.peak = n;
    if (f > S.shown) STAMP_LAST.frames = f + 1;
  }
  if (f > S.shown) S.shown = f;
  return n;
}
let last = null;

/**
 * One landed cut at (x, y, z), the drawn contact. `o`: combat/impact.js (tier, cut, edge, hilt, crit,
 * power, low, target). `k`: the piece's strength (impactK('stamp')): it scales the stamp's size.
 * Returns the blobs written now (the first frame); never throws.
 */
export function stampHit(game, x, y, z, o, k = 1) {
  replacePending = false;
  try {
    if (!game?.fx?.fire?.spawn || !o || !fin(x + y + z) || !(k > 0)) return 0;
    const L = STAMP_LOOK, T = L.tier[o.tier] ?? L.tier.light;
    const A = axes(game);
    const c = o.cut, e = o.edge;
    let ca = c ? screenAngle(A, c.x, c.y, c.z) : NaN, ea = e ? screenAngle(A, e.x, e.y, e.z) : NaN;
    if (!fin(ca)) ca = fin(ea) ? ea + Math.PI / 2 : 0.6;
    if (!fin(ea)) ea = ca + Math.PI / 2;
    if (o.tier === 'point' || o.tier === 'execute') ca = ea;
    // the scale at the contact, before the pull (lengths are metres there)
    const mpp0 = screen(game, x, y, z).mpp;
    // the anchor: pulled toward the camera along the view ray
    let ax = x, ay = y, az = z;
    const cam = game.camera?.position;
    if (cam) {
      const dx = cam.x - x, dy = cam.y - y, dz = cam.z - z, l = Math.hypot(dx, dy, dz);
      if (l > L.pull * 1.5 && fin(l)) {
        ax += (dx / l) * L.pull;
        ay += (dy / l) * L.pull;
        az += (dz / l) * L.pull;
      }
    }
    // a slot: a free one, or the oldest
    let S = stamps[0];
    for (const q of stamps) {
      if (!q.alive) {
        S = q;
        break;
      }
      if (q.age > S.age) S = q;
    }
    S.alive = true;
    S.x = ax;
    S.y = ay;
    S.z = az;
    S.mpp0 = mpp0;
    S.age = 0;
    S.ca = ca;
    S.ea = ea;
    S.tier = o.tier in L.tier ? o.tier : 'light';
    S.T = T;
    S.crit = !!o.crit;
    S.low = !!o.low;
    S.power = clamp(fin(o.power) ? o.power : 0, 0, 1);
    S.s = clamp(k, L.kMin, L.kMax) * (S.crit ? L.crit.size : 1);
    S.frames = (L.frames[T.shape] ?? 4) - (S.low ? 1 : 0);
    S.shown = -1;
    S.seed = (Math.imul(STAMP_LAST.n + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
    last = S;
    STAMP_LAST.blobs = 0;
    STAMP_LAST.peak = 0;
    STAMP_LAST.frames = 0;
    STAMP_LAST.lowY = Infinity;
    STAMP_LAST.tier = S.tier;
    STAMP_LAST.n++;
    // draw the first frame now (before this frame's fire update: it is aged dt and shows this frame)
    const dt = Math.max(0, fin(game.fxDt) ? game.fxDt : 1 / 60);
    let life;
    if (deadline > fxNow + dt) life = deadline - fxNow; // the copies alive now show this frame: join them
    else {
      life = copyLife(dt);
      deadline = fxNow + life;
    }
    const n = draw(game, S, life);
    replacePending = mode === 'instead' && n > 0;
    return n;
  } catch {
    return 0;
  }
}

/** Per frame (fx time: it runs on through a hit-stop). Never throws. */
export function stampUpdate(game, dt) {
  try {
    const d = fin(game?.fxDt) ? game.fxDt : fin(dt) ? dt : 0;
    if (!(d > 0)) return;
    fxNow += d;
    let any = false;
    for (const S of stamps) {
      if (!S.alive) continue;
      S.age += d;
      if (S.age >= S.frames * STAMP_LOOK.hold) S.alive = false;
      else any = true;
    }
    if (!any || !game.fx?.fire?.spawn) return;
    // (drawn after this frame's fire update: these show NEXT frame, once; one copy per frame)
    if (fxNow + d < deadline) return;
    const life = copyLife(d);
    deadline = fxNow + life;
    for (const S of stamps) if (S.alive) draw(game, S, life);
  } catch {
    /* never freeze the frame */
  }
}

/** Drop every running stamp (a level reset). */
export function stampClear(game) {
  for (const S of stamps) S.alive = false;
  deadline = -1;
  replacePending = false;
}
