import { axes, screenAngle } from './clashFx.js';
import { FIRE_KIND } from '../render/firePalettes.js';
import { perfectMode, streakTier } from './streak.js';
import { parrySparksUpdate, parrySparksClear } from './parrySparks.js';

// A SINGLE PERFECT PARRY / PERFECT DODGE, in three looks (combat/streak.js: perfectMode(), read at the
// moment of the parry / dodge):
//   today   as it has been (nothing here is read: PERFECT_FEEL.today is null and every caller keeps
//           today's own numbers)
//   sharp   short and clean: a crisp mark printed IN the letter grid at the exact point, less slow
//           motion than today, a frame flash at a quarter of today's, the bell kept
//   cinema  a longer beat: deeper slow motion and the camera closer for the LAST blow of a string (or
//           a single blow), a short beat for the blows inside a string; a bolder mark, its lines held;
//           the world dims for the beat instead of flashing white
// Nothing here touches a rule: the windows, the guard and posture given, the i-frames, the crit window,
// the riposte / flurry and where the hero ends up are the same in every mode. Slow motion changes how
// long a moment lasts in REAL time, never in game time (tests/integration/duel.mjs `perfectfx`).
//
// THE MARK (the parry's, the dodge's line, the arrival) is written in the fire field's `steel` the way
// the impact stamp is (combat/impactStamp.js, the worked example; its internals are its own, so the
// few lines below are this module's copy of the approach):
//   - one blob of steel per letter cell, snapped to the cell's centre (a soft line between two rows of
//     cells all but vanishes), offsets in whole cells; a ring is a flat hexagon (a soft circle on a
//     5 x 8 grid prints as noise);
//   - the anchor pulled toward the camera along the view ray (past the field's soft depth fade);
//   - re-drawn every frame with one copy alive (a one-copy frame clock), so it stays snapped through
//     the camera's shake and punch and never stacks in a freeze's slow fx time;
//   - STEPPED frames held `hold` s of REAL time (a mark's look must not stretch with the slow motion
//     it sits in: a cinema beat would hold a sharp mark four times as long), no fade between them;
//   - inked on black in its own colour (fireField.tint), never over the hero, never below `minY`.
// The dodge's afterimage is glyph digits as today (PlayerFx._afterimage); in `sharp` / `cinema` it
// stands still, one fixed digit to a cell, for `stand` s, then tears into its letters along the way he
// left; the tear is spawned from here (perfectUpdate) so it starts on time.
// Cosmetic noise from this module's own stream (never Math.random: the sims replay seeded fights).

let seed = 0x7f4a7c15;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const fin = (v) => Number.isFinite(v);
const K_STEEL = FIRE_KIND.steel;

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

/** Loose glyphs this module spawns as particles (the world atlas: tests/glyphcheck.mjs reads it):
 *  the afterimage's tear (the same digits the afterimage is printed in). */
export const PERFECT_GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Per mode: what the moment adds or changes. null = today's (every caller keeps its own numbers).
 *
 * parry (a perfect parry of a blow; a perfectly parried bullet is today's in every mode):
 *   stop      s the freeze-frame (today TUNE.parryStop.perfect 0.14)
 *   shake     camera trauma (today 0.42; + 0.03 a chained parry, as today)
 *   punch     m the camera's punch in (today TUNE.parryPunch.perfect 3.6)
 *   beat      the slow motion (flow.cinematic: slowmo x for dur REAL s, zoom m, weight toward the
 *             crossing; ease [in, out] shares of dur the camera eases over, back the share the slow
 *             motion eases back over); today { slowmo 0.35, dur 0.36, zoom -2.5, weight 0.25 }
 *   flash     the white frame flash (today 0.55); dim / dimHold: the world dims (exposure) instead
 *   clash     the glyph clash (PlayerFx.parry -> clashBurst): power x (0.4 is its least), its rings,
 *             its cross of glyph strokes (false: the mark draws the cross), its pooled light, its
 *             falling embers (the mark carries the moment: lines, not light)
 *   mark      the fire-field mark: hold (real s a frame), size (x the lengths), the lengths (m at the
 *             crossing), echo (rings that follow the first), cross (frames the cross stays)
 * cinema only:
 *   full / short   the beat for a single blow or a string's LAST blow (full) and for a blow inside a
 *             string (short: perfect parries can come several a second there); `gap` real s after a
 *             full beat in which another perfect parry gets the short one (it must hold up when it
 *             repeats every 0.3 s)
 *   echoTier  at this streak tier (streak.js streakTier) the ring gets one more echo: the one thing
 *             here the streak changes
 *
 * dodge (a perfect dodge answered by the Ghostep; a red blow's flurry is another piece's):
 *   slow      the hitstop slow motion { scale, time } (today DEFENSE.ghostep 0.3 / 0.6 s); cinema uses
 *             `beat` (flow.cinematic, the camera in) instead: a long hitstop min-merges with the
 *             freeze of the next landed cut into a long freeze
 *   pulse     s the cool grade holds (today the slow motion's 0.6)
 *   ghost     the afterimage: stand (real s it stands still), tear (real s over which it tears, from
 *             the side he left toward the other), speed / life of the torn letters, alpha the
 *             standing figure's (a still figure re-drawn every frame reads brighter than today's
 *             fading one)
 *   line      the clean line from where he was to where he is (fire field): hold, frames, min (m:
 *             when he did not move, the line runs this far the way he left)
 *   arrive    the arrival mark round him where he is (cinema): hold, rings (m), lift (m: the ring's
 *             centre above his chest)
 *   blink     today's streams of characters to and onto him (blinkStream / blinkIn) and the ground
 *             streak: kept or not
 */
export const PERFECT_FEEL = deepFreeze({
  today: null,
  sharp: {
    parry: {
      stop: 0.11,
      shake: 0.3,
      punch: 2.4,
      beat: { slowmo: 0.6, dur: 0.18, zoom: -1.2, weight: 0.15 },
      flash: 0.14,
      dim: 0,
      dimHold: 0,
      clash: { power: 0.4, ring: 0, cross: false, light: false, embers: false },
      mark: { hold: 0.04, size: 1, len0: 0.2, len1: 0.42, r: [0.3, 0.42, 0.52], echo: 0, cross: 2 },
    },
    dodge: {
      slow: { scale: 0.35, time: 0.36 },
      beat: null,
      pulse: 0.36,
      ghost: { stand: 0.1, tear: 0.07, speed: [4, 10], life: [0.07, 0.16], alpha: 0.55 },
      line: { hold: 0.035, frames: 4, min: 0.9 },
      arrive: null,
      blink: false,
    },
  },
  cinema: {
    parry: {
      full: { stop: 0.16, shake: 0.42, punch: 4.2, beat: { slowmo: 0.22, dur: 0.72, zoom: -4.6, weight: 0.4, ease: [0.3, 0.3], back: 0.3 }, dim: 0.42, dimHold: 0.5 },
      short: { stop: 0.1, shake: 0.32, punch: 2.6, beat: { slowmo: 0.55, dur: 0.16, zoom: -2.0, weight: 0.2 }, dim: 0.16, dimHold: 0.08 },
      gap: 0.9,
      flash: 0,
      clash: { power: 0.6, ring: 0, cross: false, light: false, embers: true },
      mark: { hold: 0.065, size: 1.4, len0: 0.24, len1: 0.6, r: [0.34, 0.5, 0.66, 0.8], echo: 1, cross: 4 },
      markShort: { hold: 0.045, size: 1.15, len0: 0.22, len1: 0.5, r: [0.32, 0.46, 0.58], echo: 0, cross: 2 },
      echoTier: 3,
    },
    dodge: {
      slow: null,
      beat: { slowmo: 0.25, dur: 0.85, zoom: -3.4, weight: 0.3, ease: [0.3, 0.35], back: 0.3 },
      pulse: 0.8,
      ghost: { stand: 0.3, tear: 0.12, speed: [2.5, 7], life: [0.12, 0.26], alpha: 0.6 },
      line: { hold: 0.07, frames: 5, min: 0.9 },
      arrive: { hold: 0.07, rings: [0.5, 0.68, 0.84], lift: 0.35 },
      blink: false,
    },
  },
});

/** The feel of a mode (null: today's). Read at the moment of the parry / dodge. */
export const perfectFeel = (mode = perfectMode()) => PERFECT_FEEL[mode] ?? null;

/** What the last moment did (tests read it; reused). `beat`: 'full' | 'short' | '' (the parry's). */
export const PERFECT_LAST = {
  n: 0, mode: 'today', kind: '', beat: '', blobs: 0, peak: 0, frames: 0, lowY: Infinity, ended: false,
  ghost: 0, tear: 0, lineN: 0, arriveN: 0, echo: 0,
};

/** The look of the mark's cells. heat: the fire field's (0.35 a dim speck, 0.6 a dim stroke, 1.1 a
 *  bright stroke, 1.5+ a white digit). ink: the colour the steel is dyed on black (fireField.tint),
 *  gold for the parry, the afterimage's cold blue for the dodge; `id` the zone's number (the stamp
 *  takes 800001). spare: the hero's figure on screen the mark is never written over (impactStamp's). */
export const MARK_LOOK = deepFreeze({
  pull: 2.5,
  minY: 0.7,
  px: 12,
  heat: { hot: 1.22, joint: 1.15, line: 0.95, mid: 0.72, dim: 0.52, speck: 0.36 },
  ink: { parry: [2.5, 1.75, 0.5], dodge: [1.2, 1.7, 2.6], dark: 1, pad: 1.4, id: 800101 },
  spare: { rx: 0.24, foot: 0.05, head: 1.7, pad: 0.04 },
});

// ---- the cinema gate: the real time of the last full beat
let fullAt = -Infinity;
/** cinema: 'full' for a single blow / a string's last blow (unless a full beat played within `gap`
 *  real s), else 'short'. Other modes: ''. */
export function perfectBeat(mode, last, realTime) {
  const F = PERFECT_FEEL[mode];
  if (mode !== 'cinema' || !F) return '';
  const now = fin(realTime) ? realTime : 0;
  if (last !== false && now - fullAt >= F.parry.gap) {
    fullAt = now;
    return 'full';
  }
  return 'short';
}

// ---- the screen (as impactStamp's), reused
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

// ---- the cells of one drawn frame (whole-cell offsets from the anchor; the hottest wins a cell)
const MAXC = 260;
const CI = new Int16Array(MAXC), CJ = new Int16Array(MAXC), CH = new Float32Array(MAXC);
let nc = 0;
let cw = 5, ch = 8, ppm = 40;
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
const at = (ox, oy, h) => put(Math.round(ox / cw), Math.round(oy / ch), h);
/** A line along screen angle a from r0 to r1 m off the anchor (heat h0 -> h1), one cell a step. */
const ray = (a, r0, r1, h0, h1, keep = 1) => {
  const c = Math.cos(a), s = Math.sin(a);
  const p0 = r0 * ppm, p1 = r1 * ppm;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(c * (p1 - p0)) / cw, Math.abs(s * (p1 - p0)) / ch)));
  let kept = 0;
  for (let i = 0; i <= n; i++) {
    kept += keep;
    if (kept < 1) continue;
    kept -= 1;
    const t = i / n, r = p0 + (p1 - p0) * t;
    at(c * r, s * r, h0 + (h1 - h0) * t);
  }
};
const line2 = (a, r0, r1, h0, h1) => {
  ray(a, r0, r1, h0, h1);
  ray(a + Math.PI, r0, r1, h0, h1);
};
/** A line in frame px from (x0, y0) to (x1, y1) off the anchor, heat h0 -> h1, every `keep` share. */
const seg = (x0, y0, x1, y1, h0, h1, keep = 1) => {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0) / cw, Math.abs(y1 - y0) / ch)));
  let kept = 0;
  for (let i = 0; i <= n; i++) {
    kept += keep;
    if (kept < 1) continue;
    kept -= 1;
    const t = i / n;
    at(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, h0 + (h1 - h0) * t);
  }
};
/** A ring of radius r m laid as a flat hexagon (impactStamp's ring); keep < 1: that share of it. */
const ring = (r, h, keep = 1) => {
  const rp = r * ppm;
  const R = Math.max(2, Math.round(rp / cw)), V = Math.max(1, Math.min(R - 1, Math.round(rp / ch)));
  const X = R - V;
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
      put(Math.round(i0 + (i1 - i0) * t), Math.round(j0 + (j1 - j0) * t), h);
    }
  }
};

// ---- the marks alive (pooled)
const POOL = 4;
const marks = Array.from({ length: POOL }, () => ({
  alive: false, kind: 'parry', x: 0, y: 0, z: 0, mpp0: 0.025, age: 0, hold: 0.04, frames: 5,
  e1: 0, e2: 0, M: null, echo: 0, ink: null, ex: 0, ey: 0, seed: 1, shown: -1, last: false,
}));
// the one-copy frame clock: fx time counted at the start of each step (before the fire field's
// update), and the clock value at which the copies alive now die
let fxNow = 0, deadline = -1;
const copyLife = (d) => Math.max(0.021, d * 1.5);
/** This step's fx time (main.js game.fxDt; the headless sims age the field on game.dt). */
const fxStep = (game, dflt) => (fin(game?.fxDt) ? game.fxDt : fin(game?.dt) ? game.dt : dflt);

/** The cells of frame f of mark S. */
function shape(S, f) {
  const H = MARK_LOOK.heat;
  const minL = Math.max(cw, ch) / ppm;
  if (S.kind === 'parry') {
    // frame 0 a short cross along the two edges round a hot heart; frames 1 .. cross-1 the cross
    // grown (held in cinema, its heat stepping down); then it snaps to a ring that opens and breaks,
    // `echo` rings following one frame behind
    const M = S.M, s = M.size, e1 = S.e1, e2 = S.e2, r = M.r, xc = Math.max(1, M.cross), nf = S.frames;
    if (f === 0) {
      at(0, 0, H.hot);
      line2(e1, minL * 0.5, Math.max(minL, M.len0 * s), H.line, H.mid);
      line2(e2, minL * 0.5, Math.max(minL, M.len0 * s), H.line, H.mid);
      return;
    }
    if (f < xc) {
      const k = xc > 2 ? (f - 1) / (xc - 2) : 0;
      const hl = H.line - (H.line - H.dim) * k, he = H.mid - (H.mid - H.speck) * k;
      at(0, 0, f === 1 ? H.joint : H.dim);
      line2(e1, minL, Math.max(minL * 2, M.len1 * s), hl, he);
      line2(e2, minL, Math.max(minL * 2, M.len1 * s), hl, he);
      return;
    }
    for (let e = 0; e <= S.echo; e++) {
      const q = f - xc - e;
      if (q < 0 || q >= r.length) continue;
      const end = q === r.length - 1 || f === nf - 1;
      const h = end ? H.speck : q === 0 ? (e ? H.mid : H.line) : e ? H.dim : H.mid;
      ring(r[q] * s, h, end ? 0.45 : q >= 2 ? 0.75 : 1);
    }
  } else if (S.kind === 'line') {
    // from where he was (the anchor) to where he is (ex, ey frame px): whole, dimmer, broken, specks
    const nf = S.frames;
    if (f === 0) {
      at(0, 0, H.joint);
      seg(0, 0, S.ex, S.ey, H.line, H.line);
      at(S.ex, S.ey, H.hot);
    } else if (f < nf - 2) {
      seg(0, 0, S.ex, S.ey, H.dim, H.mid);
      at(S.ex, S.ey, H.joint);
    } else if (f < nf - 1) {
      seg(0, 0, S.ex, S.ey, H.speck, H.dim, 0.5);
    } else {
      seg(S.ex * 0.6, S.ey * 0.6, S.ex, S.ey, H.speck, H.speck, 0.34);
    }
  } else {
    // the arrival: a ring round him that closes in to him, then breaks
    const r = S.M.rings, q = r.length - 1 - f; // outer first, closing
    if (q >= 0) ring(r[q], f === 0 ? H.mid : f === r.length - 1 ? H.line : H.dim, f === 0 ? 0.6 : 1);
    else ring(r[0] * 1.1, H.speck, 0.35);
  }
}

// the fire field's reused blob record
const B = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.3, sizeEnd: 0.3, heat: 1, heatEnd: 1, kind: K_STEEL, drag: 0, gravity: 0 };
let newest = null;

function draw(game, S, life) {
  const F = game.fx?.fire;
  if (!F?.spawn) return 0;
  const L = MARK_LOOK;
  const f = Math.min(S.frames - 1, Math.floor(S.age / S.hold));
  const A = axes(game);
  // the hero's figure on screen: never written over him
  let hx = 0, hy = 0, hrx = 0, hry = 0;
  const hp = game.player?.position, SP = L.spare;
  if (hp && fin(hp.x + hp.y + hp.z)) {
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
  ppm = 1 / S.mpp0;
  nc = 0;
  seed = S.seed;
  shape(S, f);
  let x = S.x, y = S.y, z = S.z;
  if (P.ok) {
    const ox = ((Math.floor(P.px / cw) + 0.5) * cw - P.px) * mpp, oy = ((Math.floor(P.py / ch) + 0.5) * ch - P.py) * mpp;
    x += A.rx * ox + A.ux * oy;
    y += A.ry * ox + A.uy * oy;
    z += A.rz * ox + A.uz * oy;
  }
  const D = L.px * (cw / 5) * mpp;
  B.life = life;
  B.size = B.sizeEnd = D;
  const ax0 = P.ok ? (Math.floor(P.px / cw) + 0.5) * cw : 0, ay0 = P.ok ? (Math.floor(P.py / ch) + 0.5) * ch : 0;
  let n = 0, mi = 0, mj = 0;
  for (let k = 0; k < nc; k++) {
    if (hrx > 0 && P.ok) {
      const ex = (ax0 + CI[k] * cw - hx) / hrx, ey = (ay0 + CJ[k] * ch - hy) / hry;
      if (ex * ex + ey * ey < 1) continue;
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
      const ai = CI[k] < 0 ? -CI[k] : CI[k], aj = CJ[k] < 0 ? -CJ[k] : CJ[k];
      if (ai > mi) mi = ai;
      if (aj > mj) mj = aj;
      if (S === newest && by < PERFECT_LAST.lowY) PERFECT_LAST.lowY = by;
    }
  }
  // the ink: the newest mark's cells print on black in its colour (a line's zone round its middle)
  const I = L.ink;
  if (S === newest && n > 0 && P.ok && F.tint) {
    let cx = ax0, cy = ay0;
    if (S.kind === 'line') {
      cx += S.ex * 0.5;
      cy += S.ey * 0.5;
      mi = Math.abs(S.ex) / cw * 0.5 + 1;
      mj = Math.abs(S.ey) / ch * 0.5 + 1;
    }
    F.tint(I.id, cx, cy, (mi + 1.5) * cw * I.pad, (mj + 1.5) * ch * I.pad, S.ink, 1, I.dark, life + 0.004);
  }
  if (S === newest) {
    PERFECT_LAST.blobs += n;
    if (n > PERFECT_LAST.peak) PERFECT_LAST.peak = n;
    if (f > S.shown) PERFECT_LAST.frames = f + 1;
  }
  if (f > S.shown) S.shown = f;
  return n;
}

/** A slot (a free one, or the oldest) set up at the pulled anchor of (x, y, z). */
function take(game, kind, x, y, z) {
  let S = marks[0];
  for (const q of marks) {
    if (!q.alive) {
      S = q;
      break;
    }
    if (q.age > S.age) S = q;
  }
  const mpp0 = screen(game, x, y, z).mpp;
  let ax = x, ay = y, az = z;
  const cam = game.camera?.position, pull = MARK_LOOK.pull;
  if (cam) {
    const dx = cam.x - x, dy = cam.y - y, dz = cam.z - z, l = Math.hypot(dx, dy, dz);
    if (l > pull * 1.5 && fin(l)) {
      ax += (dx / l) * pull;
      ay += (dy / l) * pull;
      az += (dz / l) * pull;
    }
  }
  S.alive = true;
  S.kind = kind;
  S.x = ax;
  S.y = ay;
  S.z = az;
  S.mpp0 = mpp0;
  S.age = 0;
  S.shown = -1;
  S.seed = (Math.imul(PERFECT_LAST.n + 1, 0x9e3779b1) ^ 0x2545f491) >>> 0;
  return S;
}

/** Start the newest mark and draw its first frame now (it shows this frame). */
function begin(game, S, mode, kind) {
  newest = S;
  PERFECT_LAST.n++;
  PERFECT_LAST.mode = mode;
  PERFECT_LAST.kind = kind;
  PERFECT_LAST.blobs = 0;
  PERFECT_LAST.peak = 0;
  PERFECT_LAST.frames = 0;
  PERFECT_LAST.lowY = Infinity;
  PERFECT_LAST.ended = false;
  const dt = Math.max(0, fxStep(game, 1 / 60));
  // (born this step, it is aged dt by this step's fire update: it dies with the copies alive now,
  // or lives one more step)
  let life;
  if (deadline > fxNow) life = deadline - fxNow + dt;
  else {
    life = copyLife(dt);
    deadline = fxNow - dt + life;
  }
  return draw(game, S, life);
}

/**
 * The perfect parry's mark at the crossing (x, y, z). `o`: e1 / e2 (the two blades, world), mode,
 * beat ('full' | 'short': cinema's), streak. Returns the blobs drawn now; never throws.
 */
// THE CLASH'S SIZE (`?parryClash=`, the Lab's `parryClash`; ADR-264): the perfect parry's gold clash and its mark drawn
// smaller so the two blades crossing stay in sight (the owner: the swords can't be seen meeting). a) the mark 0.55 x
// (its X and its rings), the clash burst 0.6 x; b) the mark's X alone at 0.4 x (no rings), the clash 0.4 x. The spit
// of sparks off the steel (parrySparks) is left as it is. c (below) is the default, the owner's pick; '0' as before.
const qs = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
export const PARRY_CLASH = Object.freeze({
  opts: Object.freeze(['0', 'a', 'b', 'c']),
  spec: Object.freeze({
    a: Object.freeze({ mark: 0.55, rings: true, clash: 0.6 }),
    b: Object.freeze({ mark: 0.4, rings: false, clash: 0.4 }),
    // c (the owner turned b down: "doesnt feel like a parry effect, covering too much"): no gold burst, no rings;
    // a pinpoint where the blades cross (the X at its least, a cell or two) and the spit of sparks carries the parry
    c: Object.freeze({ mark: 0.12, rings: false, clash: 0 }),
  }),
});
export const PARRY_CLASH_DEFAULT = 'c'; // (the owner's pick from the films, 2026-11-27: 'Yes, new look'; '0' as before)
const PC = { mode: PARRY_CLASH.opts.includes(qs('parryClash')) ? qs('parryClash') : PARRY_CLASH_DEFAULT };
export const parryClashMode = () => PC.mode;
export const setParryClash = (m) => (PC.mode = PARRY_CLASH.opts.includes(m) ? m : PARRY_CLASH_DEFAULT);
/** The clash's size spec now ({ mark, rings, clash }), null when off. */
export const parryClashSpec = () => PARRY_CLASH.spec[PC.mode] ?? null;
const SMALL = new Map(); // (a mark's scaled copy, by its base and the mode)
function smallMark(M) {
  const C = parryClashSpec();
  if (!C || !M) return M;
  const key = PC.mode;
  let m = SMALL.get(M);
  if (!m) SMALL.set(M, (m = {}));
  return (m[key] ??= Object.freeze({ ...M, size: M.size * C.mark, r: C.rings ? M.r : [], echo: C.rings ? M.echo : 0 }));
}

export function perfectParryMark(game, x, y, z, o = {}) {
  try {
    const mode = o.mode ?? perfectMode(), F = PERFECT_FEEL[mode];
    if (!F || !game?.fx?.fire?.spawn || !fin(x + y + z)) return 0;
    const M = smallMark(mode === 'cinema' && o.beat === 'short' ? F.parry.markShort : F.parry.mark);
    const A = axes(game);
    let a1 = o.e1 ? screenAngle(A, o.e1.x, o.e1.y, o.e1.z) : NaN, a2 = o.e2 ? screenAngle(A, o.e2.x, o.e2.y, o.e2.z) : NaN;
    if (!fin(a1)) a1 = 0.75;
    if (!fin(a2)) a2 = -0.75;
    // (two edges nearly along one line on screen: open them into a visible X, as clashBurst does)
    let apart = Math.abs(a1 - a2) % Math.PI;
    if (apart > Math.PI / 2) apart = Math.PI - apart;
    if (apart < 0.35) a2 = a1 + 1.1;
    const S = take(game, 'parry', x, Math.max(0.75, y), z);
    S.M = M;
    S.e1 = a1;
    S.e2 = a2;
    S.hold = M.hold;
    S.echo = M.echo + (mode === 'cinema' && F.parry.echoTier > 0 && streakTier(o.streak) >= F.parry.echoTier ? 1 : 0);
    S.frames = Math.max(1, M.cross) + M.r.length + S.echo;
    S.ink = MARK_LOOK.ink.parry;
    PERFECT_LAST.echo = S.echo;
    PERFECT_LAST.beat = o.beat ?? '';
    return begin(game, S, mode, 'parry');
  } catch {
    return 0;
  }
}

/** The dodge's clean line: from (x0, y0, z0) where he was to (x1, y1, z1) where he is. */
export function perfectDodgeLine(game, x0, y0, z0, x1, y1, z1, mode = perfectMode()) {
  try {
    const F = PERFECT_FEEL[mode];
    if (!F?.dodge?.line || !game?.fx?.fire?.spawn || !fin(x0 + y0 + z0 + x1 + y1 + z1)) return 0;
    const Lf = F.dodge.line;
    const P1 = screen(game, x1, y1, z1), p1x = P1.px, p1y = P1.py, ok1 = P1.ok;
    const P0 = screen(game, x0, y0, z0);
    let ex = p1x - P0.px, ey = p1y - P0.py;
    if (!ok1 || !P0.ok) {
      // (no projection yet: the camera's axes at the anchor's scale)
      const A = axes(game), dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, m = P0.mpp;
      ex = (dx * A.rx + dy * A.ry + dz * A.rz) / m;
      ey = (dx * A.ux + dy * A.uy + dz * A.uz) / m;
    }
    if (!fin(ex + ey)) return 0;
    const S = take(game, 'line', x0, y0, z0);
    S.ex = ex;
    S.ey = ey;
    S.hold = Lf.hold;
    S.frames = Lf.frames;
    S.ink = MARK_LOOK.ink.dodge;
    PERFECT_LAST.lineN++;
    return begin(game, S, mode, 'line');
  } catch {
    return 0;
  }
}

/** The arrival mark round him at (x, y, z: his chest), cinema. */
export function perfectArrive(game, x, y, z, mode = perfectMode()) {
  try {
    const F = PERFECT_FEEL[mode];
    const Ar = F?.dodge?.arrive;
    if (!Ar || !game?.fx?.fire?.spawn || !fin(x + y + z)) return 0;
    const S = take(game, 'arrive', x, y + Ar.lift, z);
    S.M = Ar;
    S.hold = Ar.hold;
    S.frames = Ar.rings.length + 1;
    S.ink = MARK_LOOK.ink.dodge;
    PERFECT_LAST.arriveN++;
    return begin(game, S, mode, 'arrive');
  } catch {
    return 0;
  }
}

// ---- the afterimage that stands, then tears (PlayerFx._afterimage hands its cells here)
const GMAX = 480;
const ghost = { alive: false, n: 0, pos: new Float32Array(GMAX * 3), ord: new Float32Array(GMAX), done: new Uint8Array(GMAX), t: 0, stand: 0, tear: 0, dx: 0, dy: 0, dz: 0, G: null, col: null, hi: null, colEnd: null, size: 0.16 };
/**
 * The afterimage's cells (flat xyz, n of them: one to a cell of his own grid) stand still, each a
 * fixed digit, for G.stand real s (re-drawn every step with one copy alive, as the marks are: the
 * figure must be gone the moment it tears, whatever the slow motion does to the particles' clock),
 * then tear along the world direction (dx, dy, dz) over G.tear s: the cells on the side he left
 * toward go first, each a letter thrown off along it. col / hi: the standing figure's colours (hi
 * one cell in eleven), colEnd the torn letters' end colour. Returns n; never throws.
 */
export function perfectGhost(game, pos, n, dx, dy, dz, G, col, hi, colEnd, size) {
  try {
    const m = Math.min(GMAX, n | 0);
    if (!(m > 0) || !G || !game?.fx?.add?.spawn) return 0;
    let l = Math.hypot(dx, dy, dz);
    if (!(l > 1e-4) || !fin(l)) {
      dx = 1;
      dy = dz = 0;
      l = 1;
    }
    ghost.dx = dx / l;
    ghost.dy = dy / l;
    ghost.dz = dz / l;
    let lo = Infinity, hi2 = -Infinity;
    for (let i = 0; i < m; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      ghost.pos[i * 3] = x;
      ghost.pos[i * 3 + 1] = y;
      ghost.pos[i * 3 + 2] = z;
      const o = x * ghost.dx + y * ghost.dy + z * ghost.dz;
      ghost.ord[i] = o;
      if (o < lo) lo = o;
      if (o > hi2) hi2 = o;
      ghost.done[i] = 0;
    }
    // 0: the leading side (the way he left) ... 1: the trailing side, plus a little noise
    const span = hi2 - lo > 1e-3 ? hi2 - lo : 1;
    for (let i = 0; i < m; i++) ghost.ord[i] = Math.min(1, Math.max(0, ((hi2 - ghost.ord[i]) / span) * 0.85 + rnd() * 0.15));
    ghost.n = m;
    ghost.t = 0;
    ghost.stand = G.stand;
    ghost.tear = Math.max(0.001, G.tear);
    ghost.G = G;
    ghost.col = col;
    ghost.hi = hi ?? col;
    ghost.colEnd = colEnd;
    ghost.size = fin(size) ? size : 0.16;
    ghost.alive = true;
    ghostDeadline = -1;
    PERFECT_LAST.ghost = m;
    PERFECT_LAST.tear = 0;
    ghostTick(game, fxStep(game, 1 / 60));
    return m;
  } catch {
    return 0;
  }
}

let ghostDeadline = -1;
const GP = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.16, sizeEnd: 0.16, glyph: '0', color: null, colorEnd: null, alpha: 0.9, alphaEnd: 0.9, drag: 0, stretch: 1 };
function ghostTick(game, d) {
  const add = game.fx?.add;
  if (!add?.spawn) {
    ghost.alive = false;
    return;
  }
  const g = ghost, G = g.G, u = (g.t - g.stand) / g.tear;
  const sp = G.speed, lf = G.life;
  // (one standing copy alive at a time: a particle lives at least 0.01 s, longer than a step of the
  // cinema beat's slow fx time, so a copy is only drawn once the last one is gone)
  const fresh = fxNow >= ghostDeadline, life = Math.max(0.01, d * 1.5);
  if (fresh) ghostDeadline = fxNow - d + life;
  let left = 0;
  for (let i = 0; i < g.n; i++) {
    if (g.done[i]) continue;
    const k = i * 3;
    GP.x = g.pos[k];
    GP.y = g.pos[k + 1];
    GP.z = g.pos[k + 2];
    GP.glyph = PERFECT_GLYPHS[(i * 7 + 3) % 10];
    GP.size = g.size;
    if (u >= g.ord[i]) {
      // torn off: thrown along the way he left, stretched, gone
      g.done[i] = 1;
      const v = sp[0] + rnd() * (sp[1] - sp[0]);
      GP.vx = g.dx * v;
      GP.vy = g.dy * v + (rnd() - 0.5) * 0.4;
      GP.vz = g.dz * v;
      GP.life = lf[0] + rnd() * (lf[1] - lf[0]);
      GP.sizeEnd = g.size * 0.5;
      GP.color = g.col;
      GP.colorEnd = g.colEnd;
      GP.alpha = 0.9;
      GP.alphaEnd = 0;
      GP.drag = 1.5;
      GP.stretch = 1.6;
      add.spawn(GP);
      PERFECT_LAST.tear++;
      continue;
    }
    left++;
    if (!fresh) continue;
    // standing: one still copy for this frame
    GP.vx = GP.vy = GP.vz = 0;
    GP.life = life;
    GP.sizeEnd = g.size;
    GP.color = GP.colorEnd = i % 11 === 0 ? g.hi : g.col;
    GP.alpha = GP.alphaEnd = G.alpha ?? 0.6;
    GP.drag = 0;
    GP.stretch = 1;
    add.spawn(GP);
  }
  if (!left) g.alive = false;
}

/**
 * Per simulation step, from the flow (GameFlow.update: it runs before the fire field's update, so a
 * copy drawn here shows this frame). `realDt`: the marks' clock; the blobs live on fx time
 * (game.fxDt, else `dt`). Never throws.
 */
export function perfectUpdate(game, dt, realDt) {
  try {
    const d = fxStep(game, fin(dt) ? dt : 0);
    const r = fin(realDt) ? realDt : d;
    if (!(r > 0) || !(d > 0)) return; // (a pause: nothing ages)
    fxNow += d;
    parrySparksUpdate(game, d, r); // (?parryFx=: combat/parrySparks.js, the perfect parry's spit of sparks)
    if (ghost.alive) {
      ghost.t += r;
      ghostTick(game, d);
    }
    let any = false;
    for (const S of marks) {
      if (!S.alive) continue;
      S.age += r;
      if (S.age >= S.frames * S.hold) {
        S.alive = false;
        if (S === newest) PERFECT_LAST.ended = true;
      } else any = true;
    }
    if (!any || !game.fx?.fire?.spawn) return;
    if (fxNow < deadline) return; // the copy alive now shows this frame too
    const life = copyLife(d);
    deadline = fxNow - d + life;
    for (const S of marks) if (S.alive) draw(game, S, life);
  } catch {
    /* never freeze the frame */
  }
}

/** Drop every running mark and the tear (a level reset). */
export function perfectClear() {
  for (const S of marks) S.alive = false;
  ghost.alive = false;
  parrySparksClear();
  deadline = -1;
  fullAt = -Infinity;
}

/** Any mark or tear still running (tests). */
export const perfectBusy = () => ghost.alive || marks.some((S) => S.alive);
