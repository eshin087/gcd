import { TELL, TELL_STYLE, RESULT, isFlare } from '../../../combat/rules.js';
import { perPhase } from './realise.js';
import { CLASH, clashBurst } from '../../../combat/clashFx.js';
import { FIRE_KIND } from '../../../render/firePalettes.js';
import { DUEL_WORLD } from './worldTuning.js';
import { lookOf } from './lookSwitch.js';

/** A thrown thing stopped by cover, as a blow on it (world.destructibles.stop). */
const COVER_BLOW = Object.freeze({ kind: 'cut', by: 'boss', y: 0.9 });

// A duelist's FX, shared by every boss on duelist.js. Two layers (STYLE.md):
//   - the fire field (render/fireField.js): heat printed in the wyrm's small digits. `steel` is the
//     crisp kind (a thin line of it prints as the stroke character that runs along it): the white
//     tell, blade trails, sword qi, the streak of a flit. `fire` at a LOW heat prints red strokes and
//     red digits: the red tell, the red ground ring. `smoke`: dust.
//   - small glyph particles (about one letter cell: sizes 0.1 to 0.26) for what flies on its own:
//     sparks, embers, ash, the stars of a break. Nothing here is a big glyph sprite any more.
// The tells (COMBAT.md "Tell presentation") are gameplay signals and are drawn ON THE LETTER GRID:
// see tellFlash. Also here: the clash when a guard turns a strike (combat/clashFx.js), the Ash
// Crescent's sword qi, and the ash a fallen duelist dissolves into. A boss with more (the Starless
// Lord's spells) extends this class.
// Cosmetic randomness uses its own stream: the seeded sims replay the AI's Math.random draws.

export const K_FIRE = FIRE_KIND.fire, K_SMOKE = FIRE_KIND.smoke, K_VOID = FIRE_KIND.void, K_STEEL = FIRE_KIND.steel;
const TAU = Math.PI * 2;
const ASH = [0.5, 0.48, 0.46];
const EMBER = [3.2, 1.1, 0.25];
const GOLD = [3.2, 2.3, 0.7];
const lightColor = (c) => {
  const m = Math.max(c[0], c[1], c[2], 1e-3);
  return [c[0] / m, c[1] / m, c[2] / m];
};
// Heat that hugs the floor is faded by the field's soft depth test (0.9 m): floor marks are drawn
// GROUND_Y up and this much hotter, so they print at the heat they name.
export const GROUND_Y = 0.3, GROUND_GAIN = 2.4;
// shock fronts (shock): the frame they are aimed with (the field's drag is per frame), the pool
const FRONT_DT = 1 / 60;
const FRONT_POOL = 8;
const SHOCK_DEF = Object.freeze({});
const GRIT = ".,:'`";
const DUST = [0.3, 0.28, 0.26];
const DUST_END = [0.12, 0.11, 0.1];
const EMBER_END = [0.5, 0.06, 0.01];
const PALE = [1.6, 1.6, 1.75];
const FRONT_LIGHT = Object.freeze({ fire: [1, 0.5, 0.2], void: [0.8, 0.35, 1], ash: [0.85, 0.85, 0.92], dust: [0.9, 0.7, 0.5] });
const ASH_FROM = [0, 1, 1, 2, 2, 3, 4]; // the hurt spheres ash streams off (head, body x2, legs; duelist._hs)
const GHOST_PTS = 260; // points of his body an afterimage is printed from (_bodyPts)
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

// The white tells, in letter cells (a cell is 5 x 8 px at 720p): the half-lengths of the cross's
// arms (w across, h up), the reach of the diagonals (0 = none), a ring or not, the life (s), the
// heat at the heart / next to it / at the tips, the light. One blob per cell, 12 px across, centred
// on the cell: exactly one row of '-' and one column of '|'. See tellFlash.
export const TELL_GLINT = Object.freeze({
  normal: { w: 6, h: 3, diag: 0, ring: 0, life: 0.2, heart: 2.3, arm: 1.17, tip: 0.6, light: 1.5 },
  blue: { w: 10, h: 5, diag: 4, ring: 1, life: 0.28, heart: 2.4, arm: 1.17, tip: 0.6, light: 2.4 },
  // ?blueTell=a (ADR-264): the owner turned the big white star with its ring down ("covering too much of the
  // action"): a small cross on his blade, no rays or ring, dyed BLUE by a tint zone (`tint`) so it reads as the
  // parry cue and not as a white flash; held as long, a smaller light
  blueSmall: { w: 4, h: 2, diag: 0, ring: 0, life: 0.28, heart: 2.2, arm: 1.17, tip: 0.7, light: 1.2, tint: true, sparkle: 0.5 },
});
const BLUE_TELL_OPTS = ['0', 'a'];
export const BLUE_TELL_DEFAULT = '0'; // (until the owner picks from the films)
let BLUE_TELL = BLUE_TELL_DEFAULT;
try {
  const q = new URLSearchParams(globalThis.location?.search ?? '').get('blueTell');
  if (BLUE_TELL_OPTS.includes(q)) BLUE_TELL = q;
} catch {
  /* headless */
}
export const BLUE_TELL_LOOK = Object.freeze({ opts: BLUE_TELL_OPTS });
export const blueTellMode = () => BLUE_TELL;
export const setBlueTell = (m) => (BLUE_TELL = BLUE_TELL_OPTS.includes(m) ? m : BLUE_TELL_DEFAULT);
const BLUE_SPARK = [0.6, 1.4, 3.2]; // (the small blue tell's sparkle and light: blue, not the steel's white)
const blueGlint = () => (BLUE_TELL === 'a' ? TELL_GLINT.blueSmall : TELL_GLINT.blue);
// The red tell before ADR-118 (kept: `?flare=blaze` draws it for comparison): a ragged blaze of red
// letters, no straight line in it. Metres.
export const TELL_BLAZE = Object.freeze({ rays: 12, reach: [1.4, 3.2, 5.0], drag: 7, size: 0.44, heat: 0.52, life: [0.22, 0.34], heart: 0.4, sparks: 8, light: 3.5 });
// THE FLARE (ADR-118): the cue of a moment. A streak of light through the striking part, written on
// the letter grid in steel and dyed by the fire field's tint: red = dodge, blue = parry, black =
// dodge (a charged blow). Letter cells (5 x 8 px at 720p), at a human's size (x k for the wyrm):
//   reach   half-length of the streak (cells; it is cut at the frame's edge)
//   body    how far out the streak is three rows thick
//   spike   half-height of the upright stroke through the heart
//   halo    the cloud of letters round the heart: half-width, half-height (cells), its heat
//   diag    reach of the four diagonal rays (0 = none)
//   life    s; `hold`: the share of it the streak stays at full length before it draws in
//   heart / arm / tip   the heat at the heart, next to it, at the streak's ends
//   light   the light it throws; `sparks`: small strokes thrown out along the streak
// Three looks to choose from (the owner picks: `?flare=streak|star|lance`); `streak` is the default.
export const TELL_FLARE = Object.freeze({
  streak: { reach: 150, body: 16, spike: 5, halo: [13, 4, 0.34], diag: 0, life: 0.34, hold: 0.3, heart: 2.4, arm: 1.16, tip: 0.5, light: 7, sparks: 10 },
  star: { reach: 46, body: 12, spike: 9, halo: [10, 5, 0.34], diag: 9, life: 0.34, hold: 0.3, heart: 2.4, arm: 1.16, tip: 0.45, light: 7, sparks: 10 },
  lance: { reach: 150, body: 6, spike: 2, halo: [5, 2, 0.3], diag: 0, life: 0.3, hold: 0.4, heart: 2.2, arm: 1.16, tip: 0.6, light: 6, sparks: 6 },
});
let FLARE_LOOK = 'streak';
try {
  const q = new URLSearchParams(globalThis.location?.search ?? '').get('flare');
  if (q && (TELL_FLARE[q] || q === 'blaze')) FLARE_LOOK = q;
} catch {
  /* headless */
}
/** The flare's look in use ('streak' | 'star' | 'lance' | 'blaze' = the old red blaze, no flare). */
export const flareLook = () => FLARE_LOOK;
export const setFlareLook = (k) => {
  if (TELL_FLARE[k] || k === 'blaze') FLARE_LOOK = k;
};
// The black charge (a black blow's windup): AN ECLIPSE on the weapon. The levels are dark, so black
// is drawn by what rings it: a disc of blacked-out cells (steel inside a DARK tint zone: fireField.js
// tint) with a thin pale corona round it, and motes of pale light pulled in from all round. `rate`
// motes a second at u = 1, born `from` m out (x k), `life` s to arrive, `size` m across at birth / on
// arrival, `heat` (past the dye: pale); `knot`: the disc, m across at u = 0 / 1; `corona`: its
// ring's heat; `zone` m: the radius that is dyed; `sparks` violet strokes / s.
export const TELL_CHARGE = Object.freeze({ rate: 70, from: [1.6, 3.4], life: [0.22, 0.38], size: [0.3, 0.16], heat: 1.5, knot: [0.7, 1.9], corona: 1.55, zone: 4.4, sparks: 16 });
let FLARE_ID = 1;
const FLARE_MARGIN = [0.06, 0.1]; // of the frame's width / height: a flare's heart is never nearer an edge

// a fissure's crack behind it (the Starless Lord's rift): a segment this long, this hard
const RIFT_MARK = Object.freeze({ seg: 1.3, power: 0.7 });

export class DuelFx {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this._ns = 0x51ed27;
    this._ls = 0x2f6b9d;
    this.trailAcc = 0;
    this.emberAcc = 0;
    this.ashAcc = 0;
    this._r = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.1, size: 0.3, sizeEnd: 0.3, glyph: '.', color: [1, 1, 1], colorEnd: null, alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, spin: 0, rot: 0, flicker: 0, stretch: 0 };
    // the fire field's reused blob record (no allocation per spawn)
    this._b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 1, sizeEnd: 1, heat: 0.5, heatEnd: 0, drag: 0, gravity: 0, kind: K_STEEL };
    this._fNow = -1; // the frame clock of what is re-drawn every frame (_frame)
    this._fHold = 0;
    this._fLife = 0.02;
    this._ax = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 0.53, uz: -0.85 };
    this._pt = { x: 0, y: 0, z: 0 };
    this._scr = { mpp: 0.025, px: 0, py: 0, cw: 5, ch: 8, W: 0, H: 0, ok: false }; // _screen's result
    // the white glints alive (re-drawn on the letter grid every frame of their short life)
    this.glints = Array.from({ length: 6 }, () => ({ alive: false, x: 0, y: 0, z: 0, age: 0, k: 1, frame: -1, style: TELL_GLINT.normal }));
    // the flares alive (the same: re-drawn on the letter grid every frame, and their tint zone kept)
    this.flares = Array.from({ length: 4 }, () => ({ alive: false, x: 0, y: 0, z: 0, age: 0, k: 1, frame: -1, tell: TELL.RED, id: 0, look: TELL_FLARE.streak }));
    this._chargeAcc = 0;
    // Ash Crescent projectiles (pooled)
    this.crescents = Array.from({ length: 6 }, () => ({ alive: false, x: 0, z: 0, dx: 0, dz: 1, age: 0, flashed: -1, done: false, tell: TELL.NORMAL, damage: 0, kb: 0, attack: '' }));
    // (the second pass: shock fronts in flight, short emitters, scratch option records, the body's
    // points for an afterimage and the cells it is printed on, the phase 3 wind)
    this._fronts = Array.from({ length: FRONT_POOL }, () => ({ alive: false, spawned: false, x: 0, z: 0, r0: 0, r1: 0, T: 1, D: 1, v0: 0, t: 0, delay: 0, k: 1, fk: 0, kind: 'dust', echo: false, grit: 0, scorchT: 0, p1: 0, p2: 0, p3: 0, p4: 0 }));
    this._emits = Array.from({ length: 6 }, () => ({ alive: false, kind: '', x: 0, z: 0, life: 1, k: 0, k2: 0, t: 0, acc: 0 }));
    // the wind's streaks (phase 3's gale): crisp lines written on the grid every frame, running downwind
    this._streaks = Array.from({ length: 28 }, () => ({ alive: false, x: 0, y: 1, z: 0, len: 2, sp: 8, age: 0, life: 1, h: 0.8 }));
    this._shockOpt = { k: 1, fire: 0, kind: 'dust', delay: 0, echo: false, T: undefined, r0: undefined };
    this._ghostO = { dx: 0, dz: 0, life: 0.6, light: 0, ox: 0, oz: 0, ember: 0, rise: 0, spread: 0 };
    this._gp = new Float32Array(GHOST_PTS * 3);
    this._gCells = new Set();
    this._gSrc = null;
    this._windA = 0.6;
    this._windAcc = 0;
    this._qiAcc = 0;
  }

  rnd() {
    this._ns = (Math.imul(this._ns, 1664525) + 1013904223) >>> 0;
    return this._ns / 4294967296;
  }
  rand(a, b) {
    return a + this.rnd() * (b - a);
  }
  /** The LOOKS' own stream (the second pass): the jitter of what only draws (the shock's ragged
   *  front, grit, ghosts, the new qi, dust, the break, the flit) never draws from rnd(), which other
   *  code reads (terrain.js, the Lord's storm): a look option or a blob more cannot move anything. */
  lr() {
    this._ls = (Math.imul(this._ls, 1103515245) + 12345) >>> 0;
    return this._ls / 4294967296;
  }
  lrand(a, b) {
    return a + this.lr() * (b - a);
  }
  get add() {
    return this.game.fx?.add;
  }
  get alpha() {
    return this.game.fx?.alpha;
  }
  /** The fire field (render/fireField.js): heat printed in small digits. */
  get fire() {
    return this.game.fx?.fire;
  }
  _spawn(pool, o) {
    if (!pool || !Number.isFinite(o.x + o.y + o.z)) return;
    pool.spawn(o);
  }
  _light(o) {
    return this.game.lights?.add?.(o) ?? null;
  }
  /** A light of the second pass's looks: the same as _light now (render/lights.js seeds the flicker
   *  from its own stream, never Math.random); kept by name for its callers. */
  _lookLight(o) {
    return this._light(o);
  }
  /** The reused spawn record, every field reset. */
  _rec(x, y, z, life, size, sizeEnd, glyph, color, colorEnd = null) {
    const o = this._r;
    o.x = x;
    o.y = y;
    o.z = z;
    o.vx = o.vy = o.vz = 0;
    o.life = life;
    o.size = size;
    o.sizeEnd = sizeEnd;
    o.glyph = glyph;
    o.color = color;
    o.colorEnd = colorEnd;
    o.alpha = 1;
    o.alphaEnd = 0;
    o.drag = o.gravity = o.spin = o.rot = o.flicker = o.stretch = 0;
    return o;
  }

  // ---------------------------------------------------------------- the fire field
  /** One blob of heat (reused record). size / sizeEnd: metres across; heat / heatEnd: what it adds
   *  at its centre (overlaps add up); kind: K_STEEL (default) / K_FIRE / K_VOID / K_SMOKE. */
  _blob(x, y, z, vx, vy, vz, life, size, sizeEnd, heat, heatEnd, kind = K_STEEL, drag = 0, gravity = 0) {
    const f = this.fire;
    if (!f || !Number.isFinite(x + y + z + vx + vy + vz + life + size + sizeEnd + heat + heatEnd)) return;
    const b = this._b;
    b.x = x;
    b.y = y;
    b.z = z;
    b.vx = vx;
    b.vy = vy;
    b.vz = vz;
    b.life = life;
    b.size = size;
    b.sizeEnd = sizeEnd;
    b.heat = heat;
    b.heatEnd = heatEnd;
    b.kind = kind;
    b.drag = drag;
    b.gravity = gravity;
    f.spawn(b);
  }

  /** The life of a blob that is re-drawn every frame, or 0 on a frame whose last copies still live
   *  (slow motion, a very fast display): exactly one copy shows per frame, so held heat never
   *  stacks. One clock for the whole frame, however many effects ask. */
  _frame() {
    const g = this.game, now = g.realTime ?? g.time;
    if (now === undefined || now !== this._fNow) {
      this._fNow = now;
      const dt = Math.max(0, g.fxDt ?? g.dt ?? 0.016);
      this._fHold -= dt;
      if (this._fHold > 0) this._fLife = 0;
      else {
        this._fLife = Math.max(0.011, dt * 1.5); // (the pool floors a life at 0.01)
        this._fHold = this._fLife - dt;
      }
    }
    return this._fLife;
  }

  /** A blob that shows this frame only (for what is re-drawn every frame). */
  _dot(x, y, z, size, heat, kind = K_STEEL) {
    const life = this._frame();
    if (life > 0) this._blob(x, y, z, 0, 0, 0, life, size, size, heat, heat, kind);
  }

  /** Blobs laid along a to b, `step` m apart: a thin line of steel prints as the strokes that run
   *  along it. life 0 = this frame only (then heatEnd is not used). `h1`: the heat at b (it tapers
   *  from `heat` at a). */
  _line(ax, ay, az, bx, by, bz, life, size, heat, heatEnd = 0, kind = K_STEEL, step = 0.1, h1 = heat) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(l)) return;
    const held = !(life > 0);
    if (held) {
      life = this._frame();
      if (!(life > 0)) return;
    }
    const n = Math.min(160, Math.max(1, Math.ceil(l / step)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, h = heat + (h1 - heat) * t;
      this._blob(ax + dx * t, ay + dy * t, az + dz * t, 0, 0, 0, life, size, size, h, held ? h : heatEnd, kind);
    }
  }

  /** The camera's right / up axes (the fixed fight camera's when there is none yet). */
  _axes() {
    const U = this.game.U, Rg = U?.uCamRight?.value, Up = U?.uCamUp?.value, A = this._ax;
    if (Rg && Up && Number.isFinite(Rg.x + Rg.y + Rg.z + Up.x + Up.y + Up.z) && Rg.x * Rg.x + Rg.y * Rg.y + Rg.z * Rg.z > 0.5) {
      A.rx = Rg.x;
      A.ry = Rg.y;
      A.rz = Rg.z;
      A.ux = Up.x;
      A.uy = Up.y;
      A.uz = Up.z;
    }
    return A;
  }

  /** Where a world point is on the letter grid: this._scr = { mpp (metres per pixel there), px, py
   *  (frame pixels, origin bottom-left, as the print pass counts its cells), cw, ch (the cell) }.
   *  ok = false without a camera (headless): mpp is then the fight camera's ~40 px per metre. */
  _screen(x, y, z) {
    const S = this._scr, g = this.game, cam = g.camera, p = g.pipeline;
    S.ok = false;
    S.mpp = 0.025;
    S.cw = p?.artCell?.x > 0 ? p.artCell.x : 5;
    S.ch = p?.artCell?.y > 0 ? p.artCell.y : 8;
    const W = p?.width, H = p?.height, m = cam?.matrixWorldInverse?.elements, e = cam?.projectionMatrix?.elements;
    if (!m || !e || !(W > 8) || !(H > 8)) return S;
    const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
    if (!(vz > 0.2) || !Number.isFinite(vx + vy + vz) || !(e[5] > 0)) return S;
    const mpp = (2 * vz) / (H * e[5]);
    const px = (((vx * e[0]) / vz) * 0.5 + 0.5) * W, py = (((vy * e[5]) / vz) * 0.5 + 0.5) * H;
    if (!Number.isFinite(mpp + px + py) || !(mpp > 1e-5)) return S;
    S.mpp = mpp;
    S.px = px;
    S.py = py;
    S.W = W;
    S.H = H;
    S.ok = true;
    return S;
  }

  /**
   * A line WRITTEN ON THE LETTER GRID from a to b: one blob of steel per letter cell the line
   * crosses, centred on the cell, so it prints as exactly one cell of stroke per step ('-' '/' '|'
   * '\' along the way it runs) at exactly the heat asked for, wherever it falls on the grid (a soft
   * line of blobs that falls between two rows of cells all but vanishes). heat ~1.1 = a bright
   * stroke (above 1.2 a cell prints a white digit instead: two lines crossing make a hot joint).
   * life 0 = this frame only. `h1`: the heat at b. `from` 1 = skip the first cell (the next piece of
   * a path whose last piece ended there). Headless (no camera): a plain line of blobs.
   */
  _ink(ax, ay, az, bx, by, bz, life, heat, heatEnd = 0, h1 = heat, from = 0, kind = K_STEEL) {
    if (!this.fire || !Number.isFinite(ax + ay + az + bx + by + bz + heat + h1)) return;
    const held = !(life > 0);
    if (held) {
      life = this._frame();
      if (!(life > 0)) return;
    }
    const S = this._screen(ax, ay, az);
    const ok0 = S.ok, p0x = S.px, p0y = S.py, m0 = S.mpp, cw = S.cw, ch = S.ch, W = S.W, H = S.H;
    this._screen(bx, by, bz);
    if (!ok0 || !S.ok) {
      this._line(ax, ay, az, bx, by, bz, held ? 0 : life, 0.27, heat * 0.8, heatEnd, kind, 0.1, h1 * 0.8);
      return;
    }
    const p1x = S.px, p1y = S.py, m1 = S.mpp, A = this._axes();
    const n = Math.min(240, Math.max(1, Math.ceil(Math.max(Math.abs(p1x - p0x) / cw, Math.abs(p1y - p0y) / ch))));
    let li = NaN, lj = NaN;
    for (let i = from; i <= n; i++) {
      const t = i / n, px = p0x + (p1x - p0x) * t, py = p0y + (p1y - p0y) * t;
      if (px < -12 || py < -12 || px > W + 12 || py > H + 12) continue;
      const ci = Math.floor(px / cw), cj = Math.floor(py / ch);
      if (ci === li && cj === lj) continue;
      li = ci;
      lj = cj;
      const mpp = m0 + (m1 - m0) * t, ox = ((ci + 0.5) * cw - px) * mpp, oy = ((cj + 0.5) * ch - py) * mpp, Dm = 12 * mpp, h = heat + (h1 - heat) * t;
      this._blob(ax + (bx - ax) * t + A.rx * ox + A.ux * oy, ay + (by - ay) * t + A.ry * ox + A.uy * oy, az + (bz - az) * t + A.rz * ox + A.uz * oy, 0, 0, 0, life, Dm, Dm, h, held ? h : heatEnd, kind);
    }
  }

  /** A point pulled 1 m toward the camera (past the field's soft depth fade, so the body a cue sits
   *  on does not dim it; along the view ray, so it does not move on screen). Writes this._pt. */
  _toCamera(x, y, z) {
    const P = this._pt, cam = this.game.camera?.position;
    P.x = x;
    P.y = y;
    P.z = z;
    if (cam) {
      const dx = cam.x - x, dy = cam.y - y, dz = cam.z - z, l = Math.hypot(dx, dy, dz);
      if (l > 1.5 && Number.isFinite(l)) {
        P.x += dx / l;
        P.y += dy / l;
        P.z += dz / l;
      }
    }
    return P;
  }

  reset() {
    for (const c of this.crescents) c.alive = false;
    for (const g of this.glints) g.alive = false;
    for (const f of this.flares) f.alive = false;
    for (const w of this._fronts) w.alive = false;
    for (const e of this._emits) e.alive = false;
    for (const w of this._streaks) w.alive = false;
  }

  // ---------------------------------------------------------------- tells
  /**
   * The timing cue at (x, y, z); `k` = its scale (1 at a human's size). Three shapes, told apart at
   * a glance (COMBAT.md "Tell presentation"):
   *   normal  a white CROSS on the letter grid: one row of '-' (13 cells) through one column of '|'
   *           (7 cells), white-hot digits where they meet (the heart and the cell on each side). 0.2 s.
   *   blue    (heavy) the same cross 1.6x as big (21 x 11 cells) with '\' '/' diagonals: an
   *           eight-point STAR, and a thin ring of strokes that opens round it. 0.28 s. Still white.
   *   red     (dodge-only) a ragged BLAZE of red letters thrown out of the part, with no straight
   *           line in it, red sparks, a red light. ~0.3 s.
   */
  tellFlash(tell, x, y, z, k = 1, flare = false) {
    if (!Number.isFinite(x + y + z)) return;
    // a MOMENT (ADR-118): the flare. Red and black always; a blue blow when it is marked `flare`
    if (isFlare(tell, flare) && (FLARE_LOOK !== 'blaze' || tell !== TELL.RED)) this._flare(tell, x, y, z, k);
    else if (tell === TELL.RED) this._redFlash(x, y, z, k);
    else this._glint(x, y, z, tell === TELL.BLUE ? blueGlint() : TELL_GLINT.normal, k);
  }

  /**
   * The cue of a thing that lands AWAY from its thrower (sword qi, a kicked lantern, a toll's ring,
   * a bolt from the sky, a thrown stone, a felled pillar): never the flare, which is a boss's own
   * blow (ADR-118). Red keeps the ragged red blaze where it lands, the others their white glint.
   */
  hazardFlash(tell, x, y, z, k = 1) {
    if (!Number.isFinite(x + y + z)) return;
    if (tell === TELL.RED || tell === TELL.BLACK) this._redFlash(x, y, z, k);
    else this._glint(x, y, z, tell === TELL.BLUE ? TELL_GLINT.blue : TELL_GLINT.normal, k);
  }

  /** The flare: a record, drawn now and on every frame of its life (_drawFlare), a light in its
   *  colour and small strokes thrown out along the streak. */
  _flare(tell, x0, y0, z0, k = 1) {
    const P = this._toCamera(x0, y0, z0), look = TELL_FLARE[FLARE_LOOK] ?? TELL_FLARE.streak;
    const st = TELL_STYLE[tell]?.flare ?? TELL_STYLE.red.flare;
    // a cue must be SEEN: a striking part outside the frame (the wyrm's tail behind it, a blade past
    // the screen's edge) has its flare drawn at the nearest point inside it (FLARE_MARGIN of the frame
    // from each edge), moved in the screen's plane
    const S = this._screen(P.x, P.y, P.z);
    if (S.ok) {
      const mx = S.W * FLARE_MARGIN[0], my = S.H * FLARE_MARGIN[1];
      const cx = Math.min(S.W - mx, Math.max(mx, S.px)), cy = Math.min(S.H - my, Math.max(my, S.py));
      if (cx !== S.px || cy !== S.py) {
        const A0 = this._axes(), ox = (cx - S.px) * S.mpp, oy = (cy - S.py) * S.mpp;
        P.x += A0.rx * ox + A0.ux * oy;
        P.y += A0.ry * ox + A0.uy * oy;
        P.z += A0.rz * ox + A0.uz * oy;
      }
    }
    let f = this.flares[0];
    for (const q of this.flares) {
      if (!q.alive) {
        f = q;
        break;
      }
      if (q.age > f.age) f = q;
    }
    f.alive = true;
    f.x = P.x;
    f.y = P.y;
    f.z = P.z;
    f.age = 0;
    f.k = k;
    f.tell = tell;
    f.look = look;
    f.frame = -1;
    f.id = FLARE_ID = (FLARE_ID % 100000) + 1;
    this._drawFlare(f);
    // strokes thrown out to both sides along the streak, in its colour (one letter cell each)
    const A = this._axes(), c = st.light, col = [c[0] * 4.2, c[1] * 4.2, c[2] * 4.2];
    for (let i = 0; i < look.sparks; i++) {
      const sd = i & 1 ? 1 : -1, sp = this.rand(9, 22) * k, up = this.rand(-1.6, 1.6) * k;
      const o = this._rec(P.x + A.rx * sd * 0.3 * k, P.y + A.ry * sd * 0.3 * k, P.z + A.rz * sd * 0.3 * k, this.rand(0.14, 0.26), 0.2, 0.05, '-', col, null);
      o.vx = A.rx * sd * sp + A.ux * up;
      o.vy = A.ry * sd * sp + A.uy * up;
      o.vz = A.rz * sd * sp + A.uz * up;
      o.stretch = 1.8;
      o.drag = 7;
      this._spawn(this.add, o);
    }
    this._light({ x: P.x, y: Math.max(0.9, P.y), z: P.z, color: st.light, intensity: look.light, radius: 9 * k, life: 0.3, fade: 0.26 });
  }

  /** Age the flares and re-draw them (update). */
  updateFlares(dt) {
    const step = this.game.fxDt ?? dt;
    for (const f of this.flares) {
      if (!f.alive) continue;
      f.age += step;
      if (!(f.age < f.look.life)) f.alive = false;
      else this._drawFlare(f);
    }
  }

  /**
   * One frame of a flare: steel written cell by cell (as a glint is), and the tint zone that dyes
   * it. It opens at full size on its first frame (a timing signal), holds, then the streak draws in
   * toward the heart and dims.
   */
  _drawFlare(f) {
    const life = this._frame();
    if (!(life > 0)) return;
    if (this._fNow !== undefined && f.frame === this._fNow) return;
    f.frame = this._fNow;
    const L = f.look, t = Math.min(1, f.age / L.life), A = this._axes(), S = this._screen(f.x, f.y, f.z);
    const cw = S.cw * S.mpp, ch = S.ch * S.mpp, D = 12 * S.mpp;
    let x = f.x, y = f.y, z = f.z;
    if (S.ok) {
      const ox = ((Math.floor(S.px / S.cw) + 0.5) * S.cw - S.px) * S.mpp, oy = ((Math.floor(S.py / S.ch) + 0.5) * S.ch - S.py) * S.mpp;
      x += A.rx * ox + A.ux * oy;
      y += A.ry * ox + A.uy * oy;
      z += A.rz * ox + A.uz * oy;
    }
    const k = f.k, u = t <= L.hold ? 0 : (t - L.hold) / (1 - L.hold);
    const fade = 1 - u * u, keep = 1 - 0.9 * u;
    // the streak: cut where it leaves the frame (a cell is 5 px: a 1280 px frame is 256 cells across)
    let nR = Math.round(L.reach * k), nL = nR;
    if (S.ok) {
      nR = Math.max(1, Math.min(nR, Math.ceil((S.W - S.px) / S.cw) + 1));
      nL = Math.max(1, Math.min(nL, Math.ceil(S.px / S.cw) + 1));
    } else nR = nL = Math.min(nR, 40);
    const body = Math.max(2, Math.round(L.body * k));
    // the black flare: a bar of blacked-out cells (rows of low heat: the dye darkens what is behind
    // them) round a white-hot thread (heat past the dye: fireField keeps a heart white)
    const dark = (TELL_STYLE[f.tell]?.flare?.dark ?? 0) > 0;
    this._cell(A, x, y, z, 0, 0, life, D, L.heart * fade);
    for (let sd = -1; sd <= 1; sd += 2) {
      const N = sd > 0 ? nR : nL;
      for (let n = 1; n <= N && n <= N * keep + 0.5; n++) {
        const far = n / Math.max(L.reach * k, 1);
        const h = (n <= 2 ? 1.9 : dark ? 1.9 - 1.05 * Math.min(1, n / (26 * k)) : L.arm + (L.tip - L.arm) * Math.min(1, far * 1.6)) * fade;
        this._cell(A, x, y, z, sd * n * cw, 0, life, D, h);
        if (dark) {
          // the bar: two rows each side all along it, four near the heart
          const rows = n <= body * keep ? 4 : 2;
          for (let r = 1; r <= rows; r++) {
            const hb = (r <= 2 ? 0.4 : 0.3) * (1 - 0.4 * Math.min(1, far * 1.4)) * (0.5 + 0.5 * fade);
            this._cell(A, x, y, z, sd * n * cw, r * ch, life, D, hb);
            this._cell(A, x, y, z, sd * n * cw, -r * ch, life, D, hb);
          }
          continue;
        }
        // three rows thick near the heart, tapering: the body of the light
        if (n <= body * keep) {
          const hb = 0.74 * (1 - n / body) * fade;
          if (hb > 0.12) {
            this._cell(A, x, y, z, sd * n * cw, ch, life, D, hb);
            this._cell(A, x, y, z, sd * n * cw, -ch, life, D, hb);
          }
        }
      }
    }
    const sp = Math.max(1, Math.round(L.spike * k));
    for (let n = 1; n <= sp && n <= sp * keep + 0.5; n++) {
      const h = (n === 1 ? 1.7 : 1.1 - 0.6 * (n / sp)) * fade;
      this._cell(A, x, y, z, 0, n * ch, life, D, h);
      this._cell(A, x, y, z, 0, -n * ch, life, D, h);
    }
    const dg = Math.round(L.diag * k);
    for (let n = 1; n <= dg && n <= dg * keep + 0.5; n++) {
      const h = (1.0 - 0.55 * (n / dg)) * fade;
      this._cell(A, x, y, z, n * cw, n * ch, life, D, h);
      this._cell(A, x, y, z, -n * cw, -n * ch, life, D, h);
      this._cell(A, x, y, z, n * cw, -n * ch, life, D, h);
      this._cell(A, x, y, z, -n * cw, n * ch, life, D, h);
    }
    // the halo: a soft cloud of letters round the heart (big soft blobs: they print as a body)
    const hw = L.halo[0] * k * cw, hh = L.halo[1] * k * ch, hH = L.halo[2] * fade * (1 - 0.5 * u);
    if (hH > 0.06) {
      for (let i = -2; i <= 2; i++) this._blob(x + A.rx * (i / 2) * hw * 0.7, y + A.ry * (i / 2) * hw * 0.7, z + A.rz * (i / 2) * hw * 0.7, 0, 0, 0, life, hh * 2.4, hh * 2.4, hH * (1 - 0.25 * Math.abs(i)), hH, K_STEEL);
    }
    // the dye: an ellipse of the frame round the whole flare
    const st = TELL_STYLE[f.tell]?.flare ?? TELL_STYLE.red.flare, F = this.fire;
    if (F?.tint && S.ok) {
      const rx = (Math.max(nR, nL) + 6) * S.cw, ry = (Math.max(sp, dg, L.halo[1] * k) + 5) * S.ch;
      // (a dyed zone fades over the outer 30 % of its radius: it is drawn generously wide)
      F.tint(f.id, S.px, S.py, rx * 1.5, ry * 1.8, st.tint, 1, st.dark ?? 0, 0.08);
    }
  }

  /**
   * The black charge: darkness drawn into (x, y, z) through a black blow's windup. Call every frame
   * of it; `u` 0..1 how far the charge is (it thickens), `k` the scale. Smoke (dark letters on a
   * dark backing) streaming inward, a few violet strokes with it.
   */
  charge(x0, y0, z0, u, dt, k = 1) {
    if (!Number.isFinite(x0 + y0 + z0 + u) || !(dt > 0)) return;
    const C = TELL_CHARGE, A = this._axes();
    const P = this._toCamera(x0, y0, z0), x = P.x, y = P.y, z = P.z;
    this._chargeAcc += dt * C.rate * (0.3 + 0.7 * u);
    let guard = 0;
    while (this._chargeAcc >= 1 && guard++ < 14) {
      this._chargeAcc -= 1;
      const a = this.rnd() * TAU, r = this.rand(C.from[0], C.from[1]) * k, lf = this.rand(C.life[0], C.life[1]);
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = A.rx * ca + A.ux * sa, dy = A.ry * ca + A.uy * sa, dz = A.rz * ca + A.uz * sa;
      // born on a circle round the point (in the screen's plane), it arrives as it dies: two blobs
      // one behind the other, so each mote is a short streak
      for (let j = 0; j < 2; j++) {
        const rr = r * (1 + 0.1 * j);
        this._blob(x + dx * rr, y + dy * rr, z + dz * rr, (-dx * rr) / lf, (-dy * rr) / lf, (-dz * rr) / lf, lf, C.size[0] * k, C.size[1] * k, C.heat * (0.7 + 0.3 * u) * (1 - 0.3 * j), C.heat * 0.6, K_STEEL);
      }
      if (this.rnd() < C.sparks / C.rate) {
        const o = this._rec(x + dx * r, y + dy * r, z + dz * r, lf, 0.18, 0.06, '|', [1.3, 0.4, 3.0], [0.4, 0.06, 0.9]);
        o.vx = (-dx * r) / lf;
        o.vy = (-dy * r) / lf;
        o.vz = (-dz * r) / lf;
        o.rot = a - Math.PI / 2;
        o.stretch = 1.6;
        this._spawn(this.add, o);
      }
    }
    if (this._chargeAcc > 14) this._chargeAcc = 0;
    // the heart of it: a knot of darkness on the weapon that grows, a white-hot point inside it
    // that flickers harder as the charge fills
    // the eclipse: a disc of dark (low heat: dim letters on blacked-out cells) and its corona, a thin
    // ring of pale cells that flickers; both grow with the charge
    const kn = (C.knot[0] + (C.knot[1] - C.knot[0]) * u) * k;
    const life = this._frame();
    if (life > 0) {
      const S0 = this._screen(x, y, z), D = 12 * S0.mpp, rr = kn * 0.42, n = Math.max(12, Math.round((TAU * rr) / (S0.cw * S0.mpp)));
      this._blob(x, y, z, 0, 0, 0, life, kn, kn, 0.62, 0.62, K_STEEL);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, fl = 0.55 + 0.45 * this.rnd();
        // (round on screen: a letter cell is taller than it is wide, the ring is laid in metres)
        this._cell(A, x, y, z, Math.cos(a) * rr, Math.sin(a) * rr, life, D, C.corona * fl * (0.6 + 0.4 * u));
      }
    }
    // the dye: everything steel within `zone` m of the weapon prints as dark (fireField.js tint)
    const F = this.fire, S = this._screen(x, y, z);
    if (F?.tint && S.ok) {
      const rpx = (C.zone * k) / S.mpp;
      F.tint((this._chargeId ??= 900000 + ((this.rnd() * 90000) | 0)), S.px, S.py, rpx, rpx, TELL_STYLE.black.flare.tint, 1, 1, 0.1);
    }
  }

  /** The red tell: fire at a low heat prints red (strokes at the rim, digits in the body). */
  _redFlash(x0, y0, z0, k = 1) {
    const c = TELL_STYLE.red.color, B = TELL_BLAZE, A = this._axes();
    const P = this._toCamera(x0, y0, z0), x = P.x, y = P.y, z = P.z;
    const a0 = this.rnd() * TAU;
    for (let i = 0; i < B.rays; i++) {
      const a = a0 + (i / B.rays) * TAU + this.rand(-0.14, 0.14), ca = Math.cos(a), sa = Math.sin(a);
      const dx = A.rx * ca + A.ux * sa, dy = A.ry * ca + A.uy * sa, dz = A.rz * ca + A.uz * sa;
      for (let j = 0; j < B.reach.length; j++) {
        const sp = B.reach[j] * this.rand(0.8, 1.2) * k;
        const r0 = (0.2 + 0.22 * j) * k; // (born along the ray, not stacked on the part: stacked heat is yellow, not red)
        this._blob(x + dx * r0, y + dy * r0, z + dz * r0, dx * sp, dy * sp, dz * sp, this.rand(B.life[0], B.life[1]), B.size * k, B.size * 0.45 * k, B.heat, 0, K_FIRE, B.drag);
      }
    }
    this._blob(x, y, z, 0, 0, 0, 0.2, 0.6 * k, 0.3 * k, B.heart, 0, K_FIRE);
    // red sparks: short strokes thrown out between the rays (the HDR red in it: they carry the flash)
    for (let i = 0; i < B.sparks; i++) {
      const a = a0 + ((i + 0.5) / B.sparks) * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = this.rand(5, 8) * k;
      const dx = A.rx * ca + A.ux * sa, dy = A.ry * ca + A.uy * sa, dz = A.rz * ca + A.uz * sa;
      const o = this._rec(x + dx * 0.2 * k, y + dy * 0.2 * k, z + dz * 0.2 * k, this.rand(0.16, 0.26), 0.2, 0.05, '|', c, null);
      o.vx = dx * sp;
      o.vy = dy * sp;
      o.vz = dz * sp;
      o.rot = a - Math.PI / 2;
      o.stretch = 1.6;
      o.drag = 6;
      this._spawn(this.add, o);
    }
    this._light({ x, y: Math.max(0.8, y), z, color: lightColor(c), intensity: B.light, radius: 5 * k, life: 0.3, fade: 0.25 });
  }

  /** The white tell: a glint record, drawn now and on every frame of its life (_drawGlint). */
  _glint(x0, y0, z0, style, k = 1) {
    const P = this._toCamera(x0, y0, z0);
    let g = this.glints[0];
    for (const q of this.glints) {
      if (!q.alive) {
        g = q;
        break;
      }
      if (q.age > g.age) g = q;
    }
    g.alive = true;
    g.x = P.x;
    g.y = P.y;
    g.z = P.z;
    g.age = 0;
    g.k = k;
    g.style = style;
    g.frame = -1;
    this._drawGlint(g);
    // the heart's sparkle: one small star of light (the only bloom in it)
    const c = style.tint ? BLUE_SPARK : TELL_STYLE.normal.color, sp = this._rec(P.x, P.y, P.z, 0.12, 0.26 * (style.diag ? 1.25 : 1) * (style.sparkle ?? 1), 0.1, '*', c, null);
    sp.alphaEnd = 0.3;
    this._spawn(this.add, sp);
    this._light({ x: P.x, y: Math.max(0.9, P.y), z: P.z, color: lightColor(c), intensity: style.light, radius: (2.2 + 0.1 * style.w) * k, life: 0.2, fade: 0.18 });
    if (style.tint) g.id = (this._glintId = ((this._glintId ?? 0) + 1) % 1000) + 700000; // (its tint zone's id)
  }

  /** Age the glints and re-draw them (update). */
  updateGlints(dt) {
    const step = this.game.fxDt ?? dt;
    for (const g of this.glints) {
      if (!g.alive) continue;
      g.age += step;
      if (!(g.age < g.style.life)) g.alive = false;
      else this._drawGlint(g);
    }
  }

  /**
   * One frame of a glint: one blob of steel per letter cell, snapped to the grid, so the cross is
   * exactly one row of '-' and one column of '|' (and the star's diagonals one cell wide). It opens
   * at full size on its first frame (the cue is a timing signal), dims late and draws back into its
   * heart.
   */
  _drawGlint(g) {
    const life = this._frame();
    if (!(life > 0)) return;
    // (once a frame: the frame a glint is born, tellFlash draws it and update comes after)
    if (this._fNow !== undefined && g.frame === this._fNow) return;
    g.frame = this._fNow;
    const st = g.style, t = Math.min(1, g.age / st.life), A = this._axes(), S = this._screen(g.x, g.y, g.z);
    const cw = S.cw * S.mpp, ch = S.ch * S.mpp, D = 12 * S.mpp;
    let x = g.x, y = g.y, z = g.z;
    if (S.ok) {
      // onto the centre of the cell it falls in
      const ox = ((Math.floor(S.px / S.cw) + 0.5) * S.cw - S.px) * S.mpp, oy = ((Math.floor(S.py / S.ch) + 0.5) * S.ch - S.py) * S.mpp;
      x += A.rx * ox + A.ux * oy;
      y += A.ry * ox + A.uy * oy;
      z += A.rz * ox + A.uz * oy;
    }
    const fade = 1 - t * t, keep = 1 - 0.62 * t;
    const W = Math.max(2, Math.round(st.w * g.k)), H = Math.max(1, Math.round(st.h * g.k)), Dg = Math.round(st.diag * g.k);
    this._cell(A, x, y, z, 0, 0, life, D, st.heart * fade);
    for (let n = 1; n <= W && n <= W * keep + 0.5; n++) {
      const h = (n === 1 ? 1.7 : st.arm + (st.tip - st.arm) * (n / W)) * fade;
      this._cell(A, x, y, z, n * cw, 0, life, D, h);
      this._cell(A, x, y, z, -n * cw, 0, life, D, h);
    }
    for (let n = 1; n <= H && n <= H * keep + 0.5; n++) {
      const h = (n === 1 ? 1.7 : st.arm + (st.tip - st.arm) * (n / H)) * fade;
      this._cell(A, x, y, z, 0, n * ch, life, D, h);
      this._cell(A, x, y, z, 0, -n * ch, life, D, h);
    }
    for (let n = 1; n <= Dg && n <= Dg * keep + 0.5; n++) {
      const h = (st.arm * 0.85 + (st.tip - st.arm) * (n / Dg)) * fade;
      this._cell(A, x, y, z, n * cw, n * ch, life, D, h);
      this._cell(A, x, y, z, -n * cw, -n * ch, life, D, h);
      this._cell(A, x, y, z, n * cw, -n * ch, life, D, h);
      this._cell(A, x, y, z, -n * cw, n * ch, life, D, h);
    }
    // (?blueTell=a: the cross dyed blue, a tint zone round it, as the flares are)
    const F = this.fire;
    if (st.tint && F?.tint && S.ok) F.tint(g.id ?? 700000, S.px, S.py, (W + 3) * S.cw * 1.5, (H + 3) * S.ch * 1.8, TELL_STYLE.blue.flare.tint, 1, 0, 0.08);
    if (st.ring) {
      // a thin ring of strokes opening round the star (round on screen)
      const r = (4 + 9 * t) * cw * g.k, n = 26, h = 0.62 * (1 - t);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        this._cell(A, x, y, z, Math.cos(a) * r, Math.sin(a) * r, life, D, h);
      }
    }
  }

  /** One blob of steel `ox` right and `oy` up of (x, y, z) in the screen's plane. */
  _cell(A, x, y, z, ox, oy, life, D, h) {
    this._blob(x + A.rx * ox + A.ux * oy, y + A.ry * ox + A.uy * oy, z + A.rz * ox + A.uz * oy, 0, 0, 0, life, D, D, h, h, K_STEEL);
  }

  /** The red ground warning of a dodge-only area (call every frame of its windup): the floor heats
   *  along its edge, a ring of red letters that climbs toward orange as the impact nears (`k` 0 → 1),
   *  and an inner ring closing in. */
  warnRing(x, z, r, k, dt) {
    if (!(r > 0) || !Number.isFinite(x + z + k)) return;
    const life = this._frame();
    if (!(life > 0)) return;
    const n = Math.min(90, Math.max(16, Math.round((TAU * r) / 0.3)));
    const spin = (this.game.time ?? 0) * 0.6;
    const h = (0.48 + 0.26 * k) * GROUND_GAIN;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + spin, hh = i % 4 ? h : h * 1.25; // (every fourth stands taller: the old ring's '!' marks)
      this._blob(x + Math.cos(a) * r, GROUND_Y, z + Math.sin(a) * r, 0, 0, 0, life, 0.36, 0.36, hh, hh, K_FIRE);
    }
    const ri = r * (1 - 0.85 * k);
    const m = Math.min(60, Math.max(8, Math.round((TAU * ri) / 0.34)));
    const hi = 0.34 * GROUND_GAIN;
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU - spin;
      this._blob(x + Math.cos(a) * ri, GROUND_Y, z + Math.sin(a) * ri, 0, 0, 0, life, 0.3, 0.3, hi, hi, K_FIRE);
    }
  }

  /** The ring flares as the area lands: red fire leaps up round its edge. */
  ringPulse(x, z, r) {
    if (!(r > 0) || !Number.isFinite(x + z)) return;
    const n = Math.max(20, Math.min(64, Math.round((TAU * r) / 0.32)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this._blob(x + Math.cos(a) * r, 0.35, z + Math.sin(a) * r, 0, this.rand(1.2, 3.2), 0, this.rand(0.26, 0.4), 0.42, 0.2, 1.0, 0, K_FIRE, 3);
    }
  }

  /** (the old name: an even ring of fire, never called; now a fire shock front out to r) */
  shockRing(x, z, r) {
    this.shock(x, z, r, this._opt(1, 1, 'fire', 0, true));
  }

  // ---------------------------------------------------------------- shock fronts (ADR-119's recipe at a man's size)
  /**
   * A ground shock out to r m from (x, z) (2 - 7 m: a duelist's), for every agent to call: a RAGGED
   * front (its radius wanders round the ring, weak stretches are left out) that runs out fast and
   * slows, a row of dust behind it that hangs, grit torn off the floor behind the front, the floor
   * charred where it started (`world.scorch`), a gust through the grass, a light, a thin crisp echo
   * after a strong one. Draws only (no damage, no world blow: the blow that made it does that).
   * o: { k strength 0.2 - 2 (1 = a red ring blow), fire 0..1 (how much of it burns), kind 'dust' |
   * 'fire' | 'ash' (pale strokes: phase 3) | 'void', T s (default from r), delay s, echo, r0 m }.
   * Cost: spawned once, about 40 blobs per metre of radius at k 1 (a 6 m front of fire ~ 230), then
   * grit glyphs while it runs.
   */
  shock(x, z, r, o = SHOCK_DEF) {
    if (!(r > 0.3) || !Number.isFinite(x + z + r)) return;
    const k = Math.max(0.2, Math.min(2, fin(o.k, 1))), delay = Math.max(0, fin(o.delay, 0));
    // a front leaving now replaces one only waiting to leave from the same spot (a landing's dust,
    // asked a frame ahead of the blow that lands with it)
    if (!(delay > 0)) for (const s of this._fronts) if (s.alive && !s.spawned && Math.hypot(s.x - x, s.z - z) < 1.6) s.alive = false;
    let w = null;
    for (const s of this._fronts) if (!s.alive) {
      w = s;
      break;
    }
    if (!w) {
      // all busy: the oldest stops following its front (its blobs fly on)
      w = this._fronts[0];
      for (const s of this._fronts) if (s.t - s.delay > w.t - w.delay) w = s;
    }
    const kind = o.kind ?? 'dust';
    w.alive = true;
    w.spawned = false;
    w.x = x;
    w.z = z;
    w.r0 = Math.max(0.25, Math.min(r * 0.6, fin(o.r0, Math.min(0.9, r * 0.18))));
    w.r1 = r;
    w.T = Math.max(0.2, fin(o.T, 0.32 + 0.045 * r));
    w.D = 2.4 / w.T;
    w.v0 = (w.r1 - w.r0) / this._reach(w.D, w.T);
    w.t = 0;
    w.delay = delay;
    w.k = k;
    w.fk = Math.max(0, Math.min(1, fin(o.fire, kind === 'fire' ? 1 : kind === 'void' ? 0.8 : 0.12)));
    w.kind = kind;
    w.echo = o.echo ?? k >= 0.8;
    w.grit = w.scorchT = 0;
    w.p1 = this.lr() * TAU;
    w.p2 = this.lr() * TAU;
    w.p3 = this.lr() * TAU;
    w.p4 = this.lr() * TAU;
    if (!(delay > 0)) this._frontSpawn(w);
  }

  /** A heavy body meets the floor (a landing, a stomp): a front of dust, a little heat (k 1 = a leap's
   *  landing). `delay`: s before it leaves. */
  groundShock(x, z, r, k = 1, delay = 0) {
    this.shock(x, z, r, this._opt(k, 0.1, 'dust', delay, false));
  }

  /** Distance a blob with drag D covers in t s per unit of launch speed (the field: v *= e^-D dt). */
  _reach(D, t) {
    const q = Math.exp(-D * FRONT_DT), N = Math.max(1, t / FRONT_DT);
    return Math.abs(D) > 1e-4 ? (FRONT_DT * q * (1 - Math.pow(q, N))) / (1 - q) : t;
  }

  /** A front leaves: its leading row (fire / pale steel / dust), the dust row behind it, a heart, a light. */
  _frontSpawn(w) {
    w.spawned = true;
    const k = w.k, fk = w.fk, sz = Math.min(1.3, 0.62 + 0.34 * k);
    const n = Math.max(16, Math.min(112, Math.round((TAU * w.r1) / (0.34 * sz))));
    const fire = w.kind === 'fire' ? K_FIRE : w.kind === 'void' ? K_VOID : -1, pale = w.kind === 'ash';
    for (let i = 0; i < n; i++) {
      const a = ((i + this.lrand(-0.38, 0.38)) / n) * TAU;
      const lob = (1 + 0.07 * Math.sin(3 * a + w.p1) + 0.045 * Math.sin(5 * a + w.p2) + this.lrand(-0.03, 0.03)) / 1.115;
      const st = 0.64 + 0.28 * Math.sin(2 * a + w.p3) + 0.2 * Math.sin(7 * a + w.p4) + this.lrand(-0.14, 0.14);
      if (st < 0.22) continue; // a gap: the front is torn, not drawn with a compass
      const ca = Math.cos(a), sa = Math.sin(a), v = w.v0 * lob;
      const x = w.x + ca * w.r0, z = w.z + sa * w.r0;
      if (fire >= 0 && fk > 0.05) {
        // the front: fire low over the floor, tallest and hottest where it is strong
        this._blob(x, this.lrand(0.72, 0.95), z, ca * v, 0, sa * v, w.T * this.lrand(0.9, 1.1), 0.5 * sz * this.lrand(0.8, 1.15), 1.05 * sz * this.lrand(0.75, 1.2), 0.56 * st * fk, 0.22 * st * fk, fire, w.D, 1.4);
        if (this.lr() < 0.5) this._blob(x, this.lrand(0.8, 1.1), z, ca * v * 0.84, 0, sa * v * 0.84, w.T * this.lrand(1.0, 1.25), 0.6 * sz, 1.4 * sz, 0.3 * st * fk, 0.08 * fk, fire, w.D, 2);
      } else if (pale ? this.lr() < 0.5 : this.lr() < fk * 2.5) {
        // a pressure front of pale strokes (ash: phase 3; a landing: a stroke here and there)
        const h = (pale ? 0.5 : 0.42) * st * Math.min(1.3, 0.7 + 0.3 * k), h0 = h * Math.max(0.35, Math.min(1, (1.4 * w.r0) / w.r1));
        this._blob(x, this.lrand(0.72, 0.85), z, ca * v, 0, sa * v, w.T * this.lrand(0.9, 1.05), 0.42 * sz, 0.55 * sz, h0, h * 0.5, K_STEEL, w.D, 0);
      }
      // the dust behind it: slower, taller; it hangs
      if (this.lr() < 0.72) {
        const hh = (pale ? 0.62 : 0.52) * st * Math.min(1.4, 0.6 + 0.4 * k);
        this._blob(x, this.lrand(0.75, 1.05), z, ca * v * 0.78, 0, sa * v * 0.78, w.T * this.lrand(1.7, 2.5), 0.75 * sz * this.lrand(0.8, 1.2), 2.3 * sz * this.lrand(0.8, 1.2), hh, 0, K_SMOKE, w.D * 1.1, 0.9);
      }
    }
    // the heart: a blink of heat where it went off, torn apart at once
    if (fire >= 0 && fk > 0.3) {
      const m = Math.round(4 + 3 * k);
      for (let i = 0; i < m; i++) {
        const a = this.lr() * TAU, sp = this.lrand(2, 5) * sz;
        this._blob(w.x + this.lrand(-0.3, 0.3), this.lrand(0.8, 1.2), w.z + this.lrand(-0.3, 0.3), Math.cos(a) * sp, this.lrand(1, 3), Math.sin(a) * sp, this.lrand(0.16, 0.26), 0.5 * sz, 1.3 * sz, 0.34 * fk, 0, fire, 3, 2);
      }
    }
    // the floor where it started: charred (and glowing a moment when it burns)
    this.game.world?.scorch?.burnCircle?.(w.x, w.z, w.r0 + 0.5 + 0.25 * k, (fire >= 0 ? 0.16 : 0.07) * (0.5 + 0.5 * k), fire >= 0 ? 0.55 * fk : 0);
    this.game.world?.gust?.(w.x, w.z, Math.min(2, 0.6 + 0.7 * k), w.r1 * 1.5);
    const col = w.kind === 'fire' ? FRONT_LIGHT.fire : w.kind === 'void' ? FRONT_LIGHT.void : pale ? FRONT_LIGHT.ash : FRONT_LIGHT.dust;
    this._lookLight({ x: w.x, y: 1.3, z: w.z, color: col, intensity: (0.8 + 1.6 * k) * (0.4 + 0.6 * Math.max(fk, pale ? 0.6 : 0.2)), radius: w.r1 + 3, life: w.T * 0.8, fade: w.T * 0.6 });
  }

  /** Follow every front: grit torn off the floor just behind it, the floor charred where fire passed, the echo. */
  _frontsUpdate(dt) {
    if (!(dt > 0)) return;
    const sc = this.game.world?.scorch;
    for (const w of this._fronts) {
      if (!w.alive) continue;
      w.t += dt;
      if (!w.spawned) {
        if (w.t >= w.delay) this._frontSpawn(w);
        continue;
      }
      const t = w.t - w.delay;
      if (w.echo && t >= 0.45 * w.T) {
        w.echo = false;
        this._airRipple(w.x, w.z, 0.8, w.r0, w.r1 * 1.1, w.T, 0.3 * Math.min(1.3, 0.6 + 0.4 * w.k), 0.45, 0.3, 0.42);
      }
      if (t > w.T) {
        if (!w.echo) w.alive = false;
        continue;
      }
      const rc = w.r0 + w.v0 * this._reach(w.D, t), share = Math.exp(-w.D * t), vf = Math.min(16, w.v0 * share);
      w.grit += dt * 1.6 * TAU * rc * (0.25 + 0.75 * share) * Math.min(2, w.k);
      let m = Math.min(8, Math.floor(w.grit));
      w.grit -= m;
      const warm = w.kind === 'fire' && w.fk > 0.4;
      while (m-- > 0) {
        const a = this.lr() * TAU, rr = rc * this.lrand(0.88, 1.01), ca = Math.cos(a), sa = Math.sin(a), sp = vf * this.lrand(0.2, 0.55);
        const ember = warm && m % 3 === 0;
        const o = this._rec(w.x + ca * rr, this.lrand(0.12, 0.5), w.z + sa * rr, this.lrand(0.4, 0.9), this.lrand(0.2, 0.3), 0.08, ember ? "*'." : GRIT, ember ? EMBER : w.kind === 'ash' ? ASH : DUST, ember ? EMBER_END : DUST_END);
        o.vx = ca * sp;
        o.vy = this.lrand(0.8, 2.8) * (0.6 + 0.3 * w.k);
        o.vz = sa * sp;
        o.drag = 2.2;
        o.gravity = ember ? -3 : -6;
        o.alpha = this.lrand(0.6, 0.9);
        o.spin = this.lrand(-3, 3);
        o.flicker = ember ? 0.4 : 0;
        this._spawn(ember ? this.add : this.alpha, o);
      }
      w.scorchT -= dt;
      if (sc && warm && w.scorchT <= 0 && share > 0.08) {
        w.scorchT = 0.07;
        for (let i = 0; i < 4; i++) {
          const a = this.lr() * TAU, rr = rc * this.lrand(0.85, 1);
          sc.burnCircle?.(w.x + Math.cos(a) * rr, w.z + Math.sin(a) * rr, 0.7, 0.03 * w.fk, 0.5 * w.fk);
        }
      }
    }
  }

  /** A thin crisp ripple (steel: it prints as the stroke that runs along it) from r0 to r1 in T s,
   *  slowing, of uneven strength with gaps. */
  _airRipple(x, z, y, r0, r1, T, heat, size, spacing = 0.3, gapBelow = 0.3) {
    if (!(T > 0) || !Number.isFinite(x + z + y + r0 + r1 + T + heat)) return;
    const D = 1.6 / T, v0 = (r1 - r0) / this._reach(D, T);
    const n = Math.max(12, Math.min(140, Math.round((TAU * Math.max(r0, r1)) / spacing)));
    const p1 = this.lr() * TAU, p2 = this.lr() * TAU;
    for (let i = 0; i < n; i++) {
      const a = ((i + this.lrand(-0.3, 0.3)) / n) * TAU;
      const st = 0.62 + 0.3 * Math.sin(3 * a + p1) + 0.22 * Math.sin(8 * a + p2) + this.lrand(-0.1, 0.1);
      if (st < gapBelow) continue;
      // (its radius wanders too, two waves and a jitter: never a ring drawn with a compass)
      const lob = 1 + 0.06 * Math.sin(3 * a + p2) + 0.04 * Math.sin(5 * a + p1) + this.lrand(-0.03, 0.03);
      const ca = Math.cos(a), sa = Math.sin(a), h = heat * st, h0 = h * Math.max(0.3, Math.min(1, (1.4 * Math.min(r0, r1)) / Math.max(r0, r1)));
      this._blob(x + ca * r0, y, z + sa * r0, ca * v0 * lob, 0, sa * v0 * lob, T * this.lrand(0.9, 1.05), size, size * 1.25, h0, h * 0.6, K_STEEL, D);
    }
  }

  /** (scratch option records: no allocation per call) */
  _opt(k, fire, kind, delay, echo) {
    const o = this._shockOpt;
    o.k = k;
    o.fire = fire;
    o.kind = kind;
    o.delay = delay;
    o.echo = echo;
    o.T = undefined;
    o.r0 = undefined;
    return o;
  }
  _ghostOpt(dx, dz, life, light = 0, ox = 0, oz = 0, ember = 0, rise = 0, spread = 0) {
    const o = this._ghostO;
    o.rise = rise;
    o.spread = spread;
    o.dx = dx;
    o.dz = dz;
    o.life = life;
    o.light = light;
    o.ox = ox;
    o.oz = oz;
    o.ember = ember;
    return o;
  }

  // ---------------------------------------------------------------- the phases' changes (the Ash Disciple)
  /**
   * A phase's change lands at (x, z) (its transition's impact), for the moves agents to call once
   * from that impact (`this.fx.phaseBurst?.(3, x, z)`): n 2 = the Kindling (`?kindle=a|b|c`, onBlow
   * calls it for the `kindle` transition), n 3 = ash on the wind (`?ashp3=a|b|c`). Cost: 250 - 400
   * blobs at its peak.
   */
  phaseBurst(n, x, z) {
    if (!Number.isFinite(x + z)) return;
    const d = this.d, hi = d?._hilt, tp = d?._tip, okB = !!hi && !!tp && Number.isFinite(hi.x + hi.y + hi.z + tp.x + tp.y + tp.z);
    if (n === 2) {
      const L = lookOf('kindle', 'a'), r = fin(d?.T?.transition?.ringRadius, 6);
      if (L === 'b') {
        // the ember storm: the blade bursts alight at once and throws a storm of embers out
        this.shock(x, z, r, this._opt(0.9, 0.35, 'fire', 0, true));
        this._emitter('spiral', x, z, 0.7, 1);
        this._embers(x, 1.1, z, 46, 3, 11);
      } else if (L === 'c') {
        // the cut of air first, then the fire behind it; the sweep's arc left burning a moment
        this._airRipple(x, z, 0.85, 0.6, r * 1.05, 0.32, 0.55, 0.5, 0.28, 0.38);
        this.shock(x, z, r * 0.85, this._opt(1.1, 1, 'fire', 0.12, false));
        this._emitter('arc', x, z, 0.9, d?.yaw ?? 0);
        this._embers(x, 1.0, z, 20, 2, 7);
      } else {
        // a: the Kindling: a front of fire out to the ring's edge, a gout up off the blade
        this.shock(x, z, r, this._opt(1.25, 1, 'fire', 0, true));
        if (okB) for (let i = 0; i < 26; i++) {
          const u = this.lr();
          this._blob(hi.x + (tp.x - hi.x) * u, hi.y + (tp.y - hi.y) * u, hi.z + (tp.z - hi.z) * u, this.lrand(-0.6, 0.6), this.lrand(2.5, 6), this.lrand(-0.6, 0.6), this.lrand(0.3, 0.55), 0.42, 0.9, 0.42, 0, K_FIRE, 1.8, 2.5);
        }
        this._embers(x, 1.1, z, 28, 2.5, 9);
      }
      this._lookLight({ x, y: 1.4, z, color: FRONT_LIGHT.fire, intensity: 6, radius: r * 1.6, life: 0.6, fade: 0.5 });
      return;
    }
    if (n === 3) {
      // Three ideas, not three tints (the second round): the wind takes him (a), a column of ash
      // climbs out of him (b), the fire burns out and ash falls like snow (c). Each: his whole
      // figure comes apart (a dense afterimage that goes its own way) and he re-forms out of ash.
      const L = lookOf('ashp3', 'a');
      // the wind that takes the yard from now on: from the gate's side, across the courtyard
      this._windA = 0.6 + this.lrand(-0.5, 0.5);
      const wx = Math.cos(this._windA), wz = Math.sin(this._windA);
      if (L === 'b') {
        // b: the ash storm: a whirling column climbs out of him and bursts over the yard
        this._emitter('apart', x, z, 0.2, 0.12); // (his figure comes apart once the flare's dye is gone)
        this._emitter('column', x, z, 1.5, 1);
        this.shock(x, z, 4, this._opt(0.8, 0.1, 'dust', 0, false));
        this.shock(x, z, 9, this._opt(1.6, 0.1, 'ash', 1.15, false)); // (the column's burst)
        this._emitter('reform', x, z, 1.75, 1.25);
      } else if (L === 'c') {
        // c: the fire burns out: a last flash of white fire runs out, then ash falls like snow
        this._emitter('apart', x, z, 0.2, 0.12);
        this.shock(x, z, 6, this._opt(0.95, 0.55, 'fire', 0, false));
        this._airRipple(x, z, 0.85, 0.6, 7.5, 0.4, 0.5, 0.5, 0.28, 0.38);
        this._emitter('snow', x, z, 2.4, 1);
        this._emitter('reform', x, z, 1.4, 0.9);
        this._embers(x, 1.2, z, 24, 1.5, 5);
      } else {
        // a: ash on the wind: his figure is torn off downwind as ash, a band of ash and the yard's
        // dust crosses the frame on the wind, and he re-forms out of what blows back in
        this._emitter('apart', x, z, 0.2, 0.12);
        this.shock(x, z, 7, this._opt(1.2, 0.1, 'ash', 0, false));
        this._emitter('gale', x, z, 1.8, 1);
        this._emitter('reform', x, z, 1.1, 0.6);
      }
      this._lookLight({ x, y: 1.4, z, color: FRONT_LIGHT.ash, intensity: L === 'c' ? 4 : 2.5, radius: 10, life: 0.7, fade: 0.6 });
    }
  }

  /**
   * Phase 3's kneel (call every frame of the transition's windup, u 0..1): ON THE BLADE only
   * (ADR-118): its fire goes out into ash (a), it whitens (b: the material, nothing drawn), its
   * embers die (c). Returns the kindle the blade should show.
   */
  ashCharge(ax, ay, az, bx, by, bz, u, dt, kindle = 1) {
    if (!Number.isFinite(ax + ay + az + bx + by + bz + u) || !(dt > 0)) return kindle;
    const L = lookOf('ashp3', 'a');
    u = Math.max(0, Math.min(1, u));
    this.emberAcc += dt * (L === 'b' ? 0 : 22) * (0.4 + u);
    let guard = 0;
    while (this.emberAcc >= 1 && guard++ < 5) {
      this.emberAcc -= 1;
      const v = this.lr();
      if (L === 'c') {
        const o = this._rec(ax + (bx - ax) * v, ay + (by - ay) * v, az + (bz - az) * v, this.lrand(0.5, 1), this.lrand(0.12, 0.18), 0.03, "'.", EMBER, EMBER_END);
        o.vy = this.lrand(-0.6, 0.2);
        o.gravity = -2;
        o.flicker = 0.7;
        this._spawn(this.add, o);
      } else this._blob(ax + (bx - ax) * v, ay + (by - ay) * v, az + (bz - az) * v, this.lrand(-0.15, 0.15), this.lrand(0.2, 0.6), this.lrand(-0.15, 0.15), this.lrand(0.4, 0.8), 0.2, 0.4, 0.4, 0, K_SMOKE, 0.6, 0.3);
    }
    return L === 'b' ? kindle : Math.max(L === 'c' ? 0.15 : 0, 1 - u);
  }

  /**
   * The Kindling's kneel (call every frame of the transition's windup, u 0..1): the blade catches.
   * Drawn ON THE BLADE only (ADR-118: a red blow shows nothing before its flare: no ring on the floor,
   * no glow on the body). Returns the kindle the blade's material should show (0..1).
   */
  kindleCharge(ax, ay, az, bx, by, bz, u, dt) {
    if (!Number.isFinite(ax + ay + az + bx + by + bz + u) || !(dt > 0)) return 0;
    const L = lookOf('kindle', 'a');
    u = Math.max(0, Math.min(1, u));
    if (L === 'b') {
      // smoke curls off the cold blade: it catches all at once at the impact
      this.emberAcc += dt * 16 * (0.3 + u);
      while (this.emberAcc >= 1) {
        this.emberAcc -= 1;
        const v = this.lr();
        this._blob(ax + (bx - ax) * v, ay + (by - ay) * v, az + (bz - az) * v, this.lrand(-0.1, 0.1), this.lrand(0.3, 0.8), this.lrand(-0.1, 0.1), this.lrand(0.6, 1.0), 0.25, 0.7, 0.45, 0, K_SMOKE, 0.6, 0.4);
      }
      return 0;
    }
    if (L === 'c') {
      // a few sparks off the edge, faster as it nears
      this.emberAcc += dt * 18 * u;
      while (this.emberAcc >= 1) {
        this.emberAcc -= 1;
        const v = this.lr();
        const o = this._rec(ax + (bx - ax) * v, ay + (by - ay) * v, az + (bz - az) * v, this.lrand(0.3, 0.6), this.lrand(0.12, 0.18), 0.03, "'.", EMBER, EMBER_END);
        o.vx = this.lrand(-0.6, 0.6);
        o.vy = this.lrand(0.5, 1.6);
        o.vz = this.lrand(-0.6, 0.6);
        o.drag = 1;
        o.flicker = 0.6;
        this._spawn(this.add, o);
      }
      return 0.3 * u;
    }
    // a: fire creeps up the blade from the hilt to the tip
    this.emberAcc += dt * (18 + 34 * u);
    let guard = 0;
    while (this.emberAcc >= 1 && guard++ < 6) {
      this.emberAcc -= 1;
      const v = this.lr() * (0.08 + 0.92 * u);
      this._blob(ax + (bx - ax) * v, ay + (by - ay) * v, az + (bz - az) * v, this.lrand(-0.15, 0.15), this.lrand(0.5, 1.3), this.lrand(-0.15, 0.15), this.lrand(0.16, 0.28), 0.3, 0.14, 0.3 + 0.16 * u, 0, K_FIRE, 1, 1.5);
    }
    return 0.1 + 0.55 * u;
  }

  /** Embers thrown out of (x, y, z): n small glyph particles. */
  _embers(x, y, z, n, s0, s1) {
    for (let i = 0; i < n; i++) {
      const a = this.lr() * TAU, sp = this.lrand(s0, s1);
      const o = this._rec(x + Math.cos(a) * 0.3, y + this.lrand(-0.4, 0.5), z + Math.sin(a) * 0.3, this.lrand(0.4, 1.0), this.lrand(0.14, 0.22), 0.04, "*'.", EMBER, EMBER_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(1, 5);
      o.vz = Math.sin(a) * sp;
      o.drag = 2;
      o.gravity = -4;
      o.flicker = 0.5;
      this._spawn(this.add, o);
    }
  }

  /** A short-lived emitter that draws over a few frames (a whirl, a lingering arc, the gale). */
  _emitter(kind, x, z, life, k) {
    let e = this._emits[0];
    for (const q of this._emits) {
      if (!q.alive) {
        e = q;
        break;
      }
      if (q.t / q.life > e.t / e.life) e = q;
    }
    e.alive = true;
    e.kind = kind;
    e.x = x;
    e.z = z;
    e.life = life;
    e.k = k;
    e.k2 = 0;
    e.t = 0;
    e.acc = 0;
  }

  _emittersUpdate(dt) {
    if (!(dt > 0)) return;
    for (const e of this._emits) {
      if (!e.alive) continue;
      e.t += dt;
      if (e.t >= e.life) {
        e.alive = false;
        continue;
      }
      const u = e.t / e.life, fade = 1 - u;
      let guard = 0;
      if (e.kind === 'spiral' || e.kind === 'vortex') {
        // a whirl rising round him: two arms of fire (the kindling) or of ash and dying embers
        const ash = e.kind === 'vortex', wx = Math.cos(this._windA), wz = Math.sin(this._windA);
        e.acc += dt * (ash ? 90 : 70) * fade;
        while (e.acc >= 1 && guard++ < 6) {
          e.acc -= 1;
          const arm = this.lr() < 0.5 ? 0 : Math.PI, h = this.lrand(0.2, 2.4), a = e.t * 9 + arm + h * 1.4, rr = 0.7 + 0.45 * h + 1.6 * u;
          const ca = Math.cos(a), sa = Math.sin(a), sp = 4 + 3 * u;
          if (ash) {
            this._blob(e.x + ca * rr, 0.75 + h, e.z + sa * rr, -sa * sp + wx * 2.5 * u, this.lrand(0.6, 1.6), ca * sp + wz * 2.5 * u, this.lrand(0.6, 1.1), 0.45, 1.1, 0.62, 0, K_SMOKE, 1.2, 0.5);
            if (this.lr() < 0.25) this._blob(e.x + ca * rr, 0.8 + h, e.z + sa * rr, -sa * sp, 0.8, ca * sp, this.lrand(0.2, 0.35), 0.3, 0.12, 0.3 * fade, 0, K_FIRE, 2, 1);
          } else this._blob(e.x + ca * rr, 0.75 + h * 0.8, e.z + sa * rr, -sa * sp, this.lrand(1, 2.5), ca * sp, this.lrand(0.2, 0.34), 0.42, 0.2, 0.42 * fade + 0.1, 0, K_FIRE, 1.5, 1.5);
        }
      } else if (e.kind === 'arc') {
        // the sweep's arc left burning low (a half ring in front of him), dying down
        e.acc += dt * 60 * fade;
        while (e.acc >= 1 && guard++ < 5) {
          e.acc -= 1;
          const a = e.k + this.lrand(-1.7, 1.7), rr = this.lrand(1.9, 2.6);
          this._blob(e.x + Math.sin(a) * rr, 0.75, e.z + Math.cos(a) * rr, 0, this.lrand(0.4, 1.4), 0, this.lrand(0.22, 0.4), 0.42, 0.18, 0.4 * fade + 0.06, 0, K_FIRE, 1, 1.5);
        }
      } else if (e.kind === 'whiteout') {
        // the last of the fire round him burns down to white: pale strokes rising, a little smoke
        e.acc += dt * 50 * fade;
        while (e.acc >= 1 && guard++ < 5) {
          e.acc -= 1;
          const a = this.lr() * TAU, rr = this.lrand(0.3, 1.2);
          this._blob(e.x + Math.cos(a) * rr, this.lrand(0.7, 2.2), e.z + Math.sin(a) * rr, 0, this.lrand(1.5, 3.5), 0, this.lrand(0.18, 0.3), 0.3, 0.12, 0.6 * fade, 0, K_STEEL, 1);
          if (this.lr() < 0.3) this._blob(e.x + Math.cos(a) * rr, this.lrand(0.8, 1.6), e.z + Math.sin(a) * rr, 0, this.lrand(0.5, 1.5), 0, this.lrand(0.5, 0.9), 0.5, 1.2, 0.4, 0, K_SMOKE, 0.8, 0.6);
        }
      } else if (e.kind === 'gale') {
        // the wind takes the yard: a band of ash and floor dust, 6 m wide, born upwind of him and
        // across the yard round him, streaking downwind across a good part of the frame (pale ash
        // in the field's steel at a low heat: grey-white digits; smoke under it; grit off the floor)
        const wx = Math.cos(this._windA), wz = Math.sin(this._windA), px = -wz, pz = wx;
        const k = u < 0.12 ? u / 0.12 : fade * fade;
        // the wind itself: long crisp streaks running downwind through the yard
        e.k2 += dt * 34 * k;
        while (e.k2 >= 1) {
          e.k2 -= 1;
          this._streak(e.x + wx * this.lrand(-6, 1) + px * this.lrand(-5, 5), this.lrand(0.8, 2.6), e.z + wz * this.lrand(-6, 1) + pz * this.lrand(-5, 5), this.lrand(1.5, 3.2), this.lrand(9, 14), this.lrand(0.5, 0.9), this.lrand(0.75, 1.05));
        }
        e.acc += dt * 80 * k;
        while (e.acc >= 1 && guard++ < 8) {
          e.acc -= 1;
          const along = this.lrand(-5, 3), across = this.lrand(-3, 3) * (1 - 0.4 * Math.abs(along) / 5), sp = this.lrand(5, 9);
          const bx = e.x + wx * along + px * across, bz = e.z + wz * along + pz * across, hy = this.lrand(0.75, 1.9);
          if (this.lr() < 0.55) {
            // a streak: three motes one behind the other along the wind
            const vy = this.lrand(0.1, 0.6), lf = this.lrand(0.7, 1.2), hh = this.lrand(0.42, 0.58);
            for (let j = 0; j < 3; j++) this._blob(bx - wx * 0.22 * j, hy, bz - wz * 0.22 * j, wx * sp, vy, wz * sp, lf, 0.32, 0.4, hh * (1 - 0.25 * j), 0, K_STEEL, 0.5);
          }
          else this._blob(bx, hy, bz, wx * sp * 0.8, this.lrand(0.2, 0.8), wz * sp * 0.8, this.lrand(0.8, 1.4), 0.5, 1.4, 0.55, 0, K_SMOKE, 0.6, 0.3);
          if (this.lr() < 0.4) {
            // the floor's dust lifting into it
            const o = this._rec(bx, this.lrand(0.05, 0.4), bz, this.lrand(0.6, 1.2), this.lrand(0.2, 0.3), 0.08, GRIT, this.lr() < 0.5 ? ASH : DUST, DUST_END);
            o.vx = wx * sp * 1.1;
            o.vy = this.lrand(0.8, 2.4);
            o.vz = wz * sp * 1.1;
            o.drag = 0.8;
            o.gravity = -1.5;
            o.spin = this.lrand(-3, 3);
            this._spawn(this.alpha, o);
          }
        }
      } else if (e.kind === 'column') {
        // a whirling column of ash climbs out of him (0.75 to 5 m, wider as it climbs), then bursts
        const k = u < 0.1 ? u / 0.1 : u > 0.75 ? (1 - u) / 0.25 : 1;
        // its body: two ribbons of pale ash twisting up round him, re-drawn every frame (one copy a
        // frame: _frame), climbing as it grows, unwinding as it bursts
        const fl = this._frame();
        if (fl > 0 && u < 0.8) {
          const top = 0.75 + 5.5 * Math.min(1, 0.3 + u * 1.8);
          for (let arm = 0; arm < 3; arm++) for (let j = 0; j < 22; j++) {
            const h = j / 21, y = 0.75 + (top - 0.75) * h, rr = 0.5 + 2.4 * h * h + 0.5 * u, a = e.t * 7.5 + arm * (TAU / 3) + h * 4.2;
            this._blob(e.x + Math.cos(a) * rr, y, e.z + Math.sin(a) * rr, 0, 0, 0, fl, 0.5, 0.5, (0.8 - 0.25 * h) * k, 0, K_STEEL);
          }
        }
        e.acc += dt * 160 * k;
        while (e.acc >= 1 && guard++ < 8) {
          e.acc -= 1;
          const h = this.lrand(0, 1), y = 0.75 + h * 4.2 * Math.min(1, 0.4 + u * 1.2), rr = 0.5 + 1.8 * h + 0.6 * u, a = this.lr() * TAU, sp = 5 + 4 * h;
          const ca = Math.cos(a), sa = Math.sin(a), burst = u > 0.75 ? 6 : 0;
          if (this.lr() < 0.55) this._blob(e.x + ca * rr, y, e.z + sa * rr, -sa * sp + ca * burst, this.lrand(1.2, 2.6), ca * sp + sa * burst, this.lrand(0.3, 0.55), 0.36, 0.5, this.lrand(0.48, 0.66), 0, K_STEEL, 1.2);
          else this._blob(e.x + ca * rr, y, e.z + sa * rr, -sa * sp * 0.8 + ca * burst, this.lrand(1, 2), ca * sp * 0.8 + sa * burst, this.lrand(0.6, 1.1), 0.5, 1.3, 0.55, 0, K_SMOKE, 1, 0.4);
          if (this.lr() < 0.25) {
            const o = this._rec(e.x + ca * rr, y, e.z + sa * rr, this.lrand(0.5, 1), this.lrand(0.18, 0.26), 0.06, GRIT, ASH, DUST_END);
            o.vx = -sa * sp + ca * (burst + 2);
            o.vy = this.lrand(1, 3);
            o.vz = ca * sp + sa * (burst + 2);
            o.drag = 1;
            o.gravity = -3;
            o.spin = this.lrand(-3, 3);
            this._spawn(this.alpha, o);
          }
        }
      } else if (e.kind === 'snow') {
        // the fire has burnt out: ash falls like snow over the yard round him (9 m), thick, then thin
        const k = u < 0.1 ? u / 0.1 : fade;
        e.acc += dt * 70 * k;
        while (e.acc >= 1 && guard++ < 8) {
          e.acc -= 1;
          const a = this.lr() * TAU, rr = 9 * Math.sqrt(this.lr()), y = this.lrand(2.5, 5.5), lf = this.lrand(1.2, 2.0);
          const bx = e.x + Math.cos(a) * rr, bz = e.z + Math.sin(a) * rr;
          if (this.lr() < 0.6) this._blob(bx, y, bz, this.lrand(-0.4, 0.4), -(y - 0.8) / lf, this.lrand(-0.4, 0.4), lf, 0.32, 0.32, this.lrand(0.45, 0.62), 0.25, K_STEEL, 0);
          else {
            const r = this.lr(), o = this._rec(bx, y, bz, lf, this.lrand(0.18, 0.26), 0.14, ".,'`", r < 0.15 ? EMBER : r < 0.6 ? PALE : ASH, DUST_END);
            o.vx = this.lrand(-0.4, 0.4);
            o.vy = -(y - 0.3) / lf;
            o.vz = this.lrand(-0.4, 0.4);
            o.spin = this.lrand(-2, 2);
            o.alphaEnd = 0.3;
            this._spawn(o.color === ASH ? this.alpha : this.add, o);
          }
        }
      } else if (e.kind === 'apart') {
        // phase 3's change: his whole figure comes apart, its own way per look (a downwind, b taken
        // up into the column, c settling as it burns out)
        if (e.t >= e.k && e.acc >= 0) {
          e.acc = -1;
          const d = this.d, L = lookOf('ashp3', 'a'), wx = Math.cos(this._windA), wz = Math.sin(this._windA);
          if (d) {
            if (L === 'b') this.ghost(d, this._ghostOpt(0, 0, 1.1, 0, 0, 0, 0, 2.6, 1.2));
            else if (L === 'c') this.ghost(d, this._ghostOpt(0, 0, 1.3, 0, 0, 0, 1, -0.6, 0.5));
            else this.ghost(d, this._ghostOpt(wx * 5, wz * 5, 1.2, 0, 0, 0, 0, 0.3, 1.6));
          }
        }
      } else if (e.kind === 'reform') {
        // after e.k s: ash drawn back in onto him from all round: he re-forms (on him as he is now)
        const p = this.d?.position;
        if (e.t >= e.k && p && Number.isFinite(p.x + p.z)) {
          e.acc += dt * 110;
          while (e.acc >= 1 && guard++ < 6) {
            e.acc -= 1;
            const a = this.lr() * TAU, r = this.lrand(1.2, 3), h = this.lrand(0.8, 2.6), lf = this.lrand(0.22, 0.4), ty = this.lrand(0.8, 1.9);
            this._blob(p.x + Math.cos(a) * r, h, p.z + Math.sin(a) * r, (-Math.cos(a) * r) / lf, (ty - h) / lf, (-Math.sin(a) * r) / lf, lf, 0.28, 0.18, 0.3, 0.6, K_STEEL);
          }
        }
      }
      if (guard > 5) e.acc = Math.min(e.acc, 2);
    }
  }

  /**
   * Phase 3, every frame (afterPose): ash streams off him downwind, a calm constant presence (`k`
   * 0..1 its strength as it grows in). Look by `?ashp3=`: a grey ash and pale specks, b a little ash
   * and white sparks rising (white-hot), c dark ash and the odd dying ember. About 40 blobs alive.
   */
  /** One wind streak: a crisp line `len` m long running downwind at `sp` m/s for `life` s. */
  _streak(x, y, z, len, sp, life, h) {
    let w = null;
    for (const q of this._streaks) if (!q.alive) {
      w = q;
      break;
    }
    if (!w || !Number.isFinite(x + y + z)) return;
    w.alive = true;
    w.x = x;
    w.y = y;
    w.z = z;
    w.len = len;
    w.sp = sp;
    w.age = 0;
    w.life = life;
    w.h = h;
  }

  _streaksUpdate(dt) {
    if (!(dt > 0)) return;
    const wx = Math.cos(this._windA), wz = Math.sin(this._windA);
    for (const w of this._streaks) {
      if (!w.alive) continue;
      w.age += dt;
      if (w.age >= w.life) {
        w.alive = false;
        continue;
      }
      w.x += wx * w.sp * dt;
      w.z += wz * w.sp * dt;
      const u = w.age / w.life, f = u < 0.15 ? u / 0.15 : (1 - u) / 0.85, l = w.len * (0.6 + 0.4 * f);
      this._ink(w.x - wx * l, w.y, w.z - wz * l, w.x, w.y, w.z, 0, 0.25 * f, 0, w.h * f);
    }
  }

  /** The third phase's look in use ('a' | 'b' | 'c'; `?ashp3=`), for the actor's blade and trails. */
  ashLook() {
    const L = lookOf('ashp3', 'a');
    return L === 'b' || L === 'c' ? L : 'a';
  }

  ashWind(d, dt, k = 1) {
    const hs = d?._hs;
    if (!hs?.length || !(dt > 0) || !(k > 0.02)) return;
    const L = lookOf('ashp3', 'a'), t = this.game.time ?? 0;
    const wa = this._windA + 0.35 * Math.sin(t * 0.23), wx = Math.cos(wa), wz = Math.sin(wa);
    this._windAcc += dt * (L === 'b' ? 22 : 42) * k;
    let guard = 0;
    if (L === 'b') {
      // b: the column's remnant: a low slow whirl of dust round his feet (kept under his knees: it
      // never covers his blade or a flare)
      const f = d.position, t2 = t * 2.2;
      while (this._windAcc >= 1 && guard++ < 4) {
        this._windAcc -= 1;
        const a = t2 + this.lr() * TAU, rr = this.lrand(0.6, 1.2), sp = this.lrand(1.5, 2.5);
        this._blob(f.x + Math.cos(a) * rr, this.lrand(0.75, 1.0), f.z + Math.sin(a) * rr, -Math.sin(a) * sp, 0.15, Math.cos(a) * sp, this.lrand(0.5, 0.8), 0.3, 0.7, 0.5, 0, K_SMOKE, 0.8, 0);
      }
      if (this._windAcc > 6) this._windAcc = 0;
      return;
    }
    if (L === 'c' && this.lr() < dt * 10 * k) {
      // c: a flake of ash still falling round him now and then
      const f = d.position, a = this.lr() * TAU, rr = this.lrand(0.5, 3), lf = this.lrand(1.2, 1.8);
      const o = this._rec(f.x + Math.cos(a) * rr, this.lrand(2.4, 3.4), f.z + Math.sin(a) * rr, lf, this.lrand(0.16, 0.22), 0.12, ".,'`", ASH, DUST_END);
      o.vy = -2.2 / lf;
      o.vx = wx * 0.4;
      o.vz = wz * 0.4;
      o.spin = this.lrand(-2, 2);
      this._spawn(this.alpha, o);
    }
    while (this._windAcc >= 1 && guard++ < 6) {
      this._windAcc -= 1;
      const p = hs[ASH_FROM[(this.lr() * ASH_FROM.length) | 0]];
      if (!p || !Number.isFinite(p.x + p.y + p.z)) continue;
      const x = p.x + this.lrand(-0.22, 0.22), y = p.y + this.lrand(-0.3, 0.3), z = p.z + this.lrand(-0.22, 0.22), sp = this.lrand(0.8, 1.8);
      this._blob(x, Math.max(0.75, y), z, wx * sp, this.lrand(0.25, 0.7), wz * sp, this.lrand(0.7, 1.3), 0.28, 0.8, L === 'c' ? 0.56 : 0.5, 0, K_SMOKE, 0.4, 0.3);
      // (a: a pale speck of ash in it now and then, so the stream reads at the game camera)
      if (L === 'a' && guard % 3 === 0) this._blob(x - wx * 0.3, Math.max(0.75, y), z - wz * 0.3, wx * sp * 1.3, this.lrand(0.1, 0.4), wz * sp * 1.3, this.lrand(0.5, 0.9), 0.24, 0.2, 0.3, 0, K_STEEL, 0.4);
      const r3 = this.lr();
      if (L === 'b' ? r3 < 0.45 : r3 < 0.3) {
        const o = this._rec(x, y, z, this.lrand(0.6, 1.2), this.lrand(0.12, 0.18), 0.04, L === 'b' ? "'." : ".,'`", L === 'b' ? PALE : L === 'c' && r3 < 0.08 ? EMBER : ASH, L === 'b' ? ASH : DUST_END);
        o.vx = wx * sp * 1.2;
        o.vy = L === 'b' ? this.lrand(0.8, 1.8) : this.lrand(0.1, 0.6);
        o.vz = wz * sp * 1.2;
        o.drag = 0.6;
        o.spin = this.lrand(-2, 2);
        o.flicker = L === 'b' ? 0.5 : 0;
        this._spawn(L === 'b' || o.color === EMBER ? this.add : this.alpha, o);
      }
    }
    if (this._windAcc > 6) this._windAcc = 0;
  }

  /**
   * A beat's impact (disciple.onImpact: the ONE hook): what lands with it, by DATA, never by name.
   *   - a `transition` move of phase 2 (the Kindling): phaseBurst(2) (phase 3's transition calls
   *     phaseBurst(3) itself);
   *   - a beat whose zone is a ring (`zone.kind 'ring'`, or `ring` > 0) and whose tell is red or black
   *     or which knocks down: a ground shock as it lands (after its flare: ADR-118), out to 1.3 x the
   *     ring, dust in phase 1, fire in phase 2, ash in phase 3;
   *   - phase 3: every blade blow (not a release / cast / noSweep beat) leaves a faint afterimage.
   */
  onBlow(b, s, a) {
    const d = this.d, D = b?.def;
    if (!d || !D || !Number.isFinite(d.position.x + d.position.z)) return;
    const x = d.position.x, z = d.position.z;
    if (a?.def?.transition) {
      if ((a.def.phase ?? 2) === 2) this.phaseBurst(2, x, z);
      return;
    }
    const ring = D.zone?.kind === 'ring' ? fin(D.zone.r, 0) : fin(D.ring, 0);
    const ph = d.phase ?? 1;
    if (ring > 0 && (D.tell === TELL.RED || D.tell === TELL.BLACK || D.knockdown)) {
      const kind = ph >= 3 ? 'ash' : ph >= 2 ? 'fire' : 'dust';
      this.shock(x, z, ring * 1.3, this._opt(0.55 + fin(D.damage, 20) / 50, ph >= 3 ? 0.1 : ph >= 2 ? 0.5 : 0.12, kind, 0, ph === 2));
    }
    // (a beat that flits has its afterimage where he was already: disciple.beatMotion / flit 'a')
    if (ph >= 3 && !D.release && !D.cast && !D.noSweep && !D.feint && !D.flit) {
      const L = lookOf('ashp3', 'a');
      this.ghost(d, this._ghostOpt(Math.cos(this._windA) * 1.2, Math.sin(this._windA) * 1.2, 0.5, 1, 0, 0, L === 'c' ? 1 : 0));
    }
  }

  // ---------------------------------------------------------------- afterimages
  /**
   * An afterimage of him where he stands as last drawn (his body's own points, one per letter cell of
   * the screen, printed as pale heat with ash smoke), falling apart from the feet up. For the moves
   * agents (flits, dashes, blinks). o: { dx, dz drift m/s, life s (0.4 - 0.8 reads best), light 1 =
   * every other point, ox, oz m to move the figure by, ember 1 = a few embers in it }. Returns the
   * blobs spent (about 150 - 260; light about half).
   */
  ghost(d, o = this._ghostO) {
    if (!d || !this.fire) return 0;
    const n = this._bodyPts(d), P = this._gp;
    if (n < 12) return 0;
    const S = this._screen(d.position.x, 1, d.position.z), mpp = S.mpp, cell = S.cw * mpp, D = 12 * mpp, A = this._axes();
    const q = 1 / Math.max(0.02, cell), cells = this._gCells, step = o.light ? 2 : 1, life0 = fin(o.life, 0.6);
    const dx = fin(o.dx, 0), dz = fin(o.dz, 0), ox = fin(o.ox, 0), oz = fin(o.oz, 0), rise = fin(o.rise, 0), spread = fin(o.spread, 0);
    // (the second round, read at 30 m: a paler core down his middle, a little wider than his own
    // cells so the figure prints solid, a beat longer, smoke under every third cell)
    let y0 = Infinity, s0 = Infinity, s1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      y0 = Math.min(y0, P[k + 1]);
      const sx = P[k] * A.rx + P[k + 1] * A.ry + P[k + 2] * A.rz;
      s0 = Math.min(s0, sx);
      s1 = Math.max(s1, sx);
    }
    const sMid = (s0 + s1) / 2, sHalf = Math.max(0.1, (s1 - s0) / 2);
    cells.clear();
    let spent = 0;
    for (let i = 0; i < n; i += step) {
      const px = P[i * 3] + ox, py = P[i * 3 + 1], pz = P[i * 3 + 2] + oz;
      const sx = px * A.rx + py * A.ry + pz * A.rz, sy = px * A.ux + py * A.uy + pz * A.uz;
      const cx = Math.round(sx * q), cy = Math.round(sy * q * (S.cw / S.ch));
      const key = (cx & 0xffff) * 65536 + (cy & 0xffff);
      if (cells.has(key)) continue;
      cells.add(key);
      const h = Math.min(1, Math.max(0, (py - y0) / 1.8)); // 0 his feet .. 1 his head
      const lf = life0 * (0.55 + 0.6 * h) + this.lrand(0.08, 0.2);
      const core = Math.abs(sx - ox * A.rx - oz * A.rz - sMid) < 0.45 * sHalf;
      // (spread: the figure comes apart as it goes; rise: it is taken up / settles)
      let vx = dx * this.lrand(0.1, 0.45), vy = this.lrand(0.05, 0.3), vz = dz * this.lrand(0.1, 0.45);
      if (spread > 0) {
        vx = dx * this.lrand(0.5, 1.2) + this.lrand(-1, 1) * spread;
        vy = rise * this.lrand(0.5, 1.3) + this.lrand(-0.3, 0.6) * spread;
        vz = dz * this.lrand(0.5, 1.2) + this.lrand(-1, 1) * spread;
      } else if (rise) vy = rise * this.lrand(0.5, 1.3);
      const hh = (o.light ? 0.42 : 0.55) * (core ? 1.6 : 1) * this.lrand(0.9, 1.15);
      this._blob(px, py, pz, vx, vy, vz, lf, D * 1.25, D * 0.8, hh, 0, K_STEEL, spread > 0 ? 0.6 : 1);
      spent++;
      if (spent % 3 === 0) {
        this._blob(px, Math.max(0.75, py), pz, vx * 0.7, vy + this.lrand(0.2, 0.5), vz * 0.7, lf * 1.5, 0.32, 0.8, 0.5, 0, K_SMOKE, 0.8, 0.4);
        spent++;
      }
      if (o.ember && spent % 9 === 0) {
        this._blob(px, py, pz, dx * 0.3, this.lrand(0.4, 1), dz * 0.3, lf * 0.6, 0.26, 0.1, 0.3, 0, K_FIRE, 1, 1);
        spent++;
      }
    }
    return spent;
  }

  /** Points on his body as last drawn (world) → this._gp; how many. His meshes' own vertices (as the
   *  hero's afterimage, player.js _sampleBody), picked once per rig; his bones when there are none. */
  _bodyPts(d) {
    const out = this._gp, root = d.object3d;
    let n = 0;
    try {
      const key = d.batch ?? d.rig;
      if (root?.traverse && this._gSrc?.key !== key) {
        const list = [];
        let sum = 0;
        root.traverse((m) => {
          const g = m.geometry, pos = g?.attributes?.position;
          if (!m.isMesh || !pos || pos.count < 3 || pos.isInterleavedBufferAttribute) return;
          if (g.attributes.aRigid || m.material?.name === 'rigidShadowProxy' || m.material?.side === 1) return;
          if (!g.boundingSphere) g.computeBoundingSphere?.();
          const r = g.boundingSphere?.radius;
          if (!(r > 0) || !Number.isFinite(r)) return;
          list.push({ mesh: m, pos, w: r * r, idx: null });
          sum += r * r;
        });
        for (const s of list) {
          const k = Math.max(1, Math.min(s.pos.count, 40, Math.round((GHOST_PTS * 0.92 * s.w) / Math.max(1e-6, sum))));
          s.idx = new Uint32Array(k);
          for (let j = 0; j < k; j++) s.idx[j] = Math.min(s.pos.count - 1, Math.floor(((j + 0.5) * s.pos.count) / k));
        }
        this._gSrc = { key, list };
      }
      for (const s of this._gSrc?.list ?? []) {
        let vis = true;
        for (let m = s.mesh; m && m !== root; m = m.parent) if (m.visible === false) {
          vis = false;
          break;
        }
        if (!vis) continue;
        const e = s.mesh.matrixWorld.elements, a = s.pos.array, st = s.pos.itemSize ?? 3;
        for (let j = 0; j < s.idx.length && n < GHOST_PTS; j++) {
          const i = s.idx[j] * st, x = a[i], y = a[i + 1], z = a[i + 2];
          const wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
          if (!Number.isFinite(wx + wy + wz)) continue;
          out[n * 3] = wx;
          out[n * 3 + 1] = wy;
          out[n * 3 + 2] = wz;
          n++;
        }
      }
    } catch {
      n = 0;
    }
    if (n >= 24) return n;
    // no meshes (a bare rig): points along his bones
    n = 0;
    const chains = d.rig?.ghostChains, v = (this._gv ??= d._v?.clone?.() ?? null), w = (this._gw ??= d._v?.clone?.() ?? null);
    if (!chains || !v || !w) return 0;
    for (const chain of chains) {
      for (let i = 0; i + 1 < chain.length; i++) {
        chain[i].getWorldPosition(v);
        chain[i + 1].getWorldPosition(w);
        const l = v.distanceTo(w), m = Math.max(1, Math.min(8, Math.ceil(l / 0.09)));
        for (let j = 0; j <= m && n < GHOST_PTS; j++) {
          const t = j / m, x = v.x + (w.x - v.x) * t, y = v.y + (w.y - v.y) * t, z = v.z + (w.z - v.z) * t;
          if (!Number.isFinite(x + y + z)) continue;
          out[n * 3] = x;
          out[n * 3 + 1] = y;
          out[n * 3 + 2] = z;
          n++;
        }
      }
    }
    return n;
  }

  // ---------------------------------------------------------------- contact
  /**
   * His guard turns the hero's strike (combat/clashFx.js): dull steel sparks on the crossing of the
   * blades, few and short for a light strike, a ring for a heavy one: a block, not an opening.
   * `deflect`: he beats the strike away: a hot orange burst and two rings (the hero's blade is thrown
   * back and his counter is coming: the colour is the warning). o: { heavy, deflect, e1, e2, spray }.
   */
  guard(x, y, z, o = {}) {
    if (!Number.isFinite(x + y + z)) return;
    clashBurst(this.game, x, Math.max(0.6, y), z, {
      pal: o.deflect ? CLASH.deflect : CLASH.guard,
      power: o.deflect ? 1.4 : o.heavy ? 1.05 : 0.7,
      spray: o.spray ?? null, e1: o.e1 ?? null, e2: o.e2 ?? null,
      ring: o.deflect ? 2 : o.heavy ? 1 : 0,
    });
  }

  /** (the old names) */
  clash(x, y, z, heavy = false) {
    this.guard(x, y, z, { heavy });
  }
  parrySpark(x, y, z, tell = TELL.NORMAL) {
    if (!Number.isFinite(x + y + z)) return;
    clashBurst(this.game, x, y, z, { pal: tell === TELL.BLUE ? CLASH.blue : CLASH.parry, ring: 1 });
  }

  /** Struck: a spray of ash and a few embers along the blow, a short cut of steel across it. */
  hitSpark(x, y, z, dx, dz, heavy) {
    if (!Number.isFinite(x + y + z + dx + dz)) return;
    const n = heavy ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const sp = this.rand(1.5, heavy ? 7 : 4.5), ember = this.rnd() < 0.3;
      this._spawn(ember ? this.add : this.alpha, {
        x, y, z, vx: dx * sp + this.rand(-1.5, 1.5), vy: this.rand(0.3, 3), vz: dz * sp + this.rand(-1.5, 1.5),
        life: this.rand(0.3, 0.7), size: this.rand(0.14, 0.24), sizeEnd: 0.05, glyph: ember ? "*'." : ".,'`",
        color: ember ? EMBER : ASH, colorEnd: ember ? [0.5, 0.06, 0.01] : [0.2, 0.19, 0.18], alpha: 1, alphaEnd: 0, drag: 2.2, gravity: ember ? -5 : -3,
      });
    }
    // the cut itself: a short bright stroke thrown along the blow
    const l = heavy ? 0.7 : 0.45, sp = heavy ? 5 : 3.5;
    for (let i = -2; i <= 2; i++) {
      const u = i / 2;
      this._blob(x + dx * u * l, y + 0.05 * u, z + dz * u * l, dx * sp, 0, dz * sp, 0.12, 0.26, 0.2, 0.55 - 0.15 * Math.abs(u), 0, K_STEEL, 6);
    }
  }

  /** Posture broken: a ring of steel bursts off his chest, gold sparks. */
  breakBurst(x0, y0, z0) {
    if (!Number.isFinite(x0 + y0 + z0)) return;
    const P = this._toCamera(x0, y0, z0), x = P.x, y = P.y, z = P.z, A = this._axes();
    // (the second pass: no even ring. Strokes of steel thrown out at their own angles and speeds,
    // in clumps, a few long ones; and a short shock of dust round his feet as he drops)
    for (let i = 0; i < 30; i++) {
      const a = this.lr() * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = this.lrand(4, 9) * (i % 7 === 0 ? 1.5 : 1);
      const dx = A.rx * ca + A.ux * sa, dy = A.ry * ca + A.uy * sa, dz = A.rz * ca + A.uz * sa, r0 = this.lrand(0.15, 0.45);
      this._blob(x + dx * r0, y + dy * r0, z + dz * r0, dx * sp, dy * sp, dz * sp, this.lrand(0.2, 0.34), 0.3, 0.24, this.lrand(0.55, 0.85), 0, K_STEEL, 5);
    }
    for (let i = 0; i < 12; i++) {
      const a = this.lr() * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = this.lrand(9, 13);
      this._blob(x, y, z, (A.rx * ca + A.ux * sa) * sp, (A.ry * ca + A.uy * sa) * sp, (A.rz * ca + A.uz * sa) * sp, this.lrand(0.14, 0.22), 0.28, 0.2, 0.7, 0, K_STEEL, 7);
    }
    if (Number.isFinite(this.d?.position?.x)) this.groundShock(this.d.position.x, this.d.position.z, 2.6, 0.55);
    for (let i = 0; i < 16; i++) {
      const a = this.lr() * TAU, sp = this.lrand(2.5, 7);
      this._spawn(this.add, {
        x: x0, y: y0, z: z0, vx: Math.cos(a) * sp, vy: this.lrand(1, 5), vz: Math.sin(a) * sp,
        life: this.lrand(0.35, 0.7), size: this.lrand(0.14, 0.24), sizeEnd: 0.05, glyph: "+*'",
        color: GOLD, colorEnd: [0.9, 0.3, 0.05], alpha: 1, alphaEnd: 0, drag: 2.5, gravity: -6,
      });
    }
    this._light({ x: x0, y: Math.max(1, y0), z: z0, color: [1, 0.75, 0.3], intensity: 4, radius: 7, life: 0.5, fade: 0.4 });
  }

  /** Dazed stars round the hat while his posture is broken (every frame). */
  stunStars(head) {
    if (!head || !Number.isFinite(head.x + head.y + head.z)) return;
    const t = this.game.time ?? 0, life = Math.max(0.02, (this.game.fxDt ?? this.game.dt ?? 0.016) * 1.6);
    for (let i = 0; i < 3; i++) {
      const a = t * 3.4 + (i / 3) * TAU;
      const o = this._rec(head.x + Math.cos(a) * 0.55, head.y + 0.55 + Math.sin(a * 2) * 0.06, head.z + Math.sin(a) * 0.55, life, 0.24, 0.24, i % 2 ? '+' : '*', [2.6, 2.0, 0.6]);
      o.alphaEnd = 1;
      this._spawn(this.add, o);
    }
  }

  // ---------------------------------------------------------------- the blade
  /**
   * His blade's sweep through a strike: the path of the tip between last frame's blade (pa hilt →
   * pb tip) and this frame's (a → b), laid as a thin line of steel, sub-stepped so a fast cut is one
   * unbroken arc of the strokes that run along it ('-' '/' '|' '\'), and a dimmer arc two thirds of
   * the way down the blade. `ember`: true (kindled: flame licks off the cut), 'red' (the Starless
   * Lord: the Void's violet in the cut's wake), false (bare steel).
   */
  sweep(pa, pb, a, b, ember = false) {
    if (!this.fire) return;
    if (!Number.isFinite(pa.x + pa.y + pa.z + pb.x + pb.y + pb.z + a.x + a.y + a.z + b.x + b.y + b.z)) return;
    const tipStep = Math.hypot(b.x - pb.x, b.y - pb.y, b.z - pb.z);
    if (tipStep < 0.04 || tipStep > 6) return; // a still blade leaves nothing (a teleport: nothing either)
    const nSub = Math.min(18, Math.max(1, Math.ceil(tipStep / 0.09)));
    const wake = ember === true ? K_FIRE : ember === 'red' ? K_VOID : -1;
    // the edge of the cut: the tip's path, written on the grid; a second, dimmer line inside it
    this._ink(pb.x, pb.y, pb.z, b.x, b.y, b.z, this.rand(0.22, 0.27), 1.15, 0, 1.15, 1);
    const f2 = 0.6;
    this._ink(pa.x + (pb.x - pa.x) * f2, pa.y + (pb.y - pa.y) * f2, pa.z + (pb.z - pa.z) * f2, a.x + (b.x - a.x) * f2, a.y + (b.y - a.y) * f2, a.z + (b.z - a.z) * f2, this.rand(0.13, 0.17), 0.6, 0, 0.6, 1);
    for (let s = 1; s <= nSub; s++) {
      const t = s / nSub;
      const hx = pa.x + (a.x - pa.x) * t, hy = pa.y + (a.y - pa.y) * t, hz = pa.z + (a.z - pa.z) * t;
      const tx = pb.x + (b.x - pb.x) * t, ty = pb.y + (b.y - pb.y) * t, tz = pb.z + (b.z - pb.z) * t;
      // the wake: what the blade passed through burns for a moment (a fan behind the edge)
      if (wake >= 0) {
        // (the second pass, a repair: the kindled wake a little fuller, still thin: 0.5 -> 0.56 m, heat 0.38 -> 0.42)
        const f = this.rand(0.5, 0.92), fire = wake === K_FIRE;
        this._blob(hx + (tx - hx) * f, hy + (ty - hy) * f, hz + (tz - hz) * f, this.rand(-0.2, 0.2), this.rand(0.1, 0.5), this.rand(-0.2, 0.2), this.rand(0.16, 0.28), fire ? 0.56 : 0.5, 0.26, 0.42, 0, wake, 1.5, fire ? 1.5 : 0.6);
      } else if (ember === 'ash' || ember === 'white') {
        // phase 3 (the Ash Disciple): the cut leaves ash (a) / a white-hot wash (b) behind the edge, thin
        const f = this.lrand(0.5, 0.92), white = ember === 'white';
        this._blob(hx + (tx - hx) * f, hy + (ty - hy) * f, hz + (tz - hz) * f, this.lrand(-0.15, 0.15), this.lrand(0.1, 0.4), this.lrand(-0.15, 0.15), this.lrand(0.18, 0.3), 0.42, 0.24, white ? 0.5 : 0.22, 0, K_STEEL, 1.5);
        if (!white && s & 1) this._blob(hx + (tx - hx) * f, Math.max(0.75, hy + (ty - hy) * f), hz + (tz - hz) * f, this.lrand(-0.2, 0.2), this.lrand(0.2, 0.6), this.lrand(-0.2, 0.2), this.lrand(0.5, 0.8), 0.3, 0.7, 0.45, 0, K_SMOKE, 1, 0.4);
      } else {
        // bare steel: the air the blade crossed, a wash of faint strokes behind the edge (cool
        // steel prints as dim '|' '/' '\\')
        this._blob(hx + (tx - hx) * 0.8, hy + (ty - hy) * 0.8, hz + (tz - hz) * 0.8, 0, 0, 0, this.rand(0.12, 0.18), 0.42, 0.36, 0.085, 0, K_STEEL);
        if (s & 1) this._blob(hx + (tx - hx) * 0.5, hy + (ty - hy) * 0.5, hz + (tz - hz) * 0.5, 0, 0, 0, this.rand(0.1, 0.15), 0.42, 0.36, 0.085, 0, K_STEEL);
      }
    }
  }

  /** (unused by the bosses today) a plain trail from a to b: a line of steel, or of flame. */
  trail(ax, ay, az, bx, by, bz, ember, dt) {
    if (!Number.isFinite(ax + ay + az + bx + by + bz)) return;
    if (ember) this._line(ax, ay, az, bx, by, bz, this.rand(0.14, 0.22), 0.3, 0.4, 0, K_FIRE, 0.12);
    else this._ink(ax, ay, az, bx, by, bz, this.rand(0.14, 0.22), 0.9);
  }

  /** Phase 2: the kindled blade burns: small flames along its length, embers shed. */
  emberBlade(ax, ay, az, bx, by, bz, dt, k = 1) {
    this.emberAcc += dt * 26 * k;
    while (this.emberAcc >= 1) {
      this.emberAcc -= 1;
      const u = this.rnd();
      this._spawn(this.add, {
        x: ax + (bx - ax) * u, y: ay + (by - ay) * u, z: az + (bz - az) * u,
        vx: this.rand(-0.4, 0.4), vy: this.rand(0.6, 1.6), vz: this.rand(-0.4, 0.4),
        life: this.rand(0.4, 0.9), size: this.rand(0.1, 0.18), sizeEnd: 0.03, glyph: ".'",
        color: EMBER, colorEnd: [0.4, 0.05, 0.01], alpha: 1, alphaEnd: 0, drag: 0.6, flicker: 0.5,
      });
      const v = this.rnd();
      this._blob(ax + (bx - ax) * v, ay + (by - ay) * v, az + (bz - az) * v, this.rand(-0.2, 0.2), this.rand(0.3, 0.9), this.rand(-0.2, 0.2), this.rand(0.16, 0.28), 0.34, 0.16, 0.3 * Math.min(1, k), 0, K_FIRE, 1, 1.5);
    }
  }

  /** He is gone from (x0, z0) and at (x1, z1): three thin lines of steel along the way he went
   *  (brightest where he arrives), a tall stroke where he stood and where he stands, and a ring of
   *  sparks thrown out round his feet (a blow of his flurry: duelist.flit). */
  flit(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (!Number.isFinite(len) || !(len > 0.2)) return;
    if (lookOf('flit', '0') === 'a') return this._flitAsh(x0, z0, x1, z1);
    for (let i = 0; i < 3; i++) {
      const y = 0.55 + i * 0.5 + this.rand(-0.06, 0.06), w = i === 1 ? 1 : 0.6;
      // (the line starts a third of the way along: the far end of a long step is not a streak)
      this._ink(x0 + dx * 0.3, y, z0 + dz * 0.3, x1, y, z1, this.rand(0.18, 0.3), 0.2 * w, 0, 1.12 * w);
    }
    this._ink(x0, 0.4, z0, x0, 1.8, z0, 0.12, 0.6);
    this._ink(x1, 0.3, z1, x1, 2.0, z1, 0.16, 1.1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU, sp = this.rand(4, 8);
      this._spawn(this.add, {
        x: x1 + Math.cos(a) * 0.3, y: 0.2, z: z1 + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: this.rand(0.2, 1.5), vz: Math.sin(a) * sp,
        life: this.rand(0.18, 0.3), size: this.rand(0.12, 0.2), sizeEnd: 0.04, glyph: "'*-", color: [3.2, 2.2, 1.2], colorEnd: [0.8, 0.2, 0.05], alpha: 1, alphaEnd: 0, drag: 5,
      });
    }
    this.dust(x0, z0, 0.6);
    this.dust(x1, z1, 0.9);
  }

  /**
   * The flit (`?flit=0|a`; '0' = the streak above). a: he comes apart into ash where he stood (his
   * afterimage, sampled before the move: duelist.flit calls this before the pose is redrawn, so his
   * meshes are still where he was), a stream of ash and pale motes crosses to where he is and re-forms
   * round him. About 250 blobs.
   */
  _flitAsh(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const d = this.d;
    if (d) this.ghost(d, this._ghostOpt(ux * 1.5, uz * 1.5, 0.55, 0));
    // the stream: motes leave his body's height at the old spot and arrive at the new
    for (let i = 0; i < 26; i++) {
      const h = this.lrand(0.75, 1.9), lf = this.lrand(0.09, 0.16), lag = this.lrand(-0.15, 0.25);
      const sx = x0 + this.lrand(-0.25, 0.25), sz = z0 + this.lrand(-0.25, 0.25), ex = x1 + this.lrand(-0.3, 0.3) - ux * lag, ez = z1 + this.lrand(-0.3, 0.3) - uz * lag;
      this._blob(sx, h, sz, (ex - sx) / lf, this.lrand(-0.5, 0.5), (ez - sz) / lf, lf, 0.3, 0.2, i % 3 ? 0.42 : 0.7, 0.3, i % 3 ? K_SMOKE : K_STEEL);
    }
    this._ink(x0 + dx * 0.3, 1.15, z0 + dz * 0.3, x1, 1.15, z1, 0.18, 0.15, 0, 0.9);
    // where he stands: ash drawn in onto him as he re-forms
    for (let i = 0; i < 18; i++) {
      const a = this.lr() * TAU, r = this.lrand(0.6, 1.3), h = this.lrand(0.75, 2), lf = this.lrand(0.12, 0.22);
      this._blob(x1 + Math.cos(a) * r, h, z1 + Math.sin(a) * r, (-Math.cos(a) * r) / lf, (1.2 - h) / lf * 0.3, (-Math.sin(a) * r) / lf, lf, 0.28, 0.16, 0.45, 0.6, K_STEEL);
    }
    for (let i = 0; i < 8; i++) {
      const a = this.lr() * TAU, sp = this.lrand(2.5, 6);
      const o = this._rec(x1 + Math.cos(a) * 0.3, 0.25, z1 + Math.sin(a) * 0.3, this.lrand(0.3, 0.6), this.lrand(0.16, 0.24), 0.06, GRIT, ASH, DUST_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(0.3, 1.5);
      o.vz = Math.sin(a) * sp;
      o.drag = 3;
      this._spawn(this.alpha, o);
    }
    this.dust(x1, z1, 0.8);
  }

  /** Dust kicked up by a landing or a hard step (the second pass: a body): one-letter grains thrown
   *  from anywhere inside a ring at their own speeds, a low cloud of dust over them, and from k 1.2 (a
   *  hard landing) a ground shock of dust. */
  dust(x, z, k = 1) {
    if (!Number.isFinite(x + z + k)) return;
    k = Math.max(0.1, Math.min(2.5, k));
    const r = 0.35 + 0.45 * k;
    for (let i = 0, n = Math.round(4 * k); i < n; i++) {
      const a = this.lr() * TAU, rr = r * this.lrand(0.2, 1), sp = this.lrand(0.6, 2) * k;
      // (0.75 m up and over: lower, the field's soft depth test fades it into the floor)
      this._blob(x + Math.cos(a) * rr, this.lrand(0.75, 0.95), z + Math.sin(a) * rr, Math.cos(a) * sp, this.lrand(0.1, 0.5), Math.sin(a) * sp, this.lrand(0.5, 1.0), 0.45 + 0.15 * k, 1.1 + 0.5 * k, 0.5, 0, K_SMOKE, 2.6, 0.4);
    }
    for (let i = 0, n = Math.round(7 * k); i < n; i++) {
      const a = this.lr() * TAU, rr = r * this.lrand(0.1, 1.1), sp = this.lrand(0.8, 3.4) * Math.min(1.6, k);
      const o = this._rec(x + Math.cos(a) * rr, this.lrand(0.08, 0.35), z + Math.sin(a) * rr, this.lrand(0.35, 0.8), this.lrand(0.18, 0.28), 0.1, GRIT, DUST, DUST_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(0.3, 1.8);
      o.vz = Math.sin(a) * sp;
      o.alpha = this.lrand(0.55, 0.8);
      o.drag = this.lrand(2, 3.2);
      o.gravity = -3;
      o.spin = this.lrand(-2, 2);
      this._spawn(this.alpha, o);
    }
    // (a frame late: a blow that lands with the landing replaces it with its own front)
    if (k >= 1.2) this.groundShock(x, z, 1.6 + 1.1 * k, 0.45 * k, 0.03);
  }

  /** Dying: ash lifting off his body (call every frame with a body point and the strength 0..1). */
  ashRise(x, y, z, k, dt) {
    this.ashAcc += dt * 70 * k;
    while (this.ashAcc >= 1) {
      this.ashAcc -= 1;
      this._spawn(this.alpha, {
        x: x + this.rand(-0.35, 0.35), y: y + this.rand(-0.7, 0.6), z: z + this.rand(-0.35, 0.35),
        vx: this.rand(-0.2, 0.5), vy: this.rand(0.6, 1.8), vz: this.rand(-0.3, 0.3),
        life: this.rand(1.2, 2.4), size: this.rand(0.12, 0.22), sizeEnd: 0.04, glyph: ".,'`",
        color: [0.46, 0.44, 0.42], colorEnd: [0.15, 0.14, 0.14], alpha: 0.95, alphaEnd: 0, drag: 0.5, spin: this.rand(-2, 2),
      });
      // (and a thin grey smoke of letters off him, one blob in six)
      if (this.rnd() < 0.16) this._blob(x + this.rand(-0.3, 0.3), y + this.rand(-0.5, 0.5), z + this.rand(-0.3, 0.3), this.rand(-0.1, 0.4), this.rand(0.5, 1.2), this.rand(-0.2, 0.2), this.rand(0.8, 1.4), 0.5, 1.0, 0.5, 0, K_SMOKE, 0.5);
    }
  }

  // ---------------------------------------------------------------- Ash Crescent (sword qi)
  /** Throw a crescent from (x, z) along (dx, dz). */
  throwCrescent(x, z, dx, dz, o) {
    const c = this.crescents.find((p) => !p.alive);
    if (!c) return null;
    const l = Math.hypot(dx, dz) || 1;
    Object.assign(c, { alive: true, x, z, dx: dx / l, dz: dz / l, age: 0, flashed: -1, done: false, speed: undefined, radius: undefined, half: undefined, life: undefined, style: undefined, mk: 0, tell: o.tell ?? TELL.NORMAL, damage: o.damage ?? 14, kb: o.knockback ?? 0.8, attack: o.attack ?? 'ashCrescent' });
    return c;
  }

  /** Per frame (duelist.update): everything in flight, and the glints alive. */
  update(dt, d) {
    this.updateGlints(dt);
    this.updateFlares(dt);
    this.updateCrescents(dt, d);
    // (the field's clock, fxDt: the fronts follow their blobs, which run on through a hit-stop)
    const fdt = this.game.fxDt ?? dt;
    this._frontsUpdate(fdt);
    this._emittersUpdate(fdt);
    this._streaksUpdate(fdt);
  }

  /** A fissure's crack on the floor behind it (world.groundBlow `cut`, a segment every RIFT_MARK.seg m). */
  _riftMark(c, step) {
    const w = this.game.world;
    if (!w?.groundBlow) return;
    c.mk += step;
    if (c.mk < RIFT_MARK.seg) return;
    const g = (this._riftG ??= { kind: 'cut', power: RIFT_MARK.power, dx: 0, dz: 1, len: 0, by: 'boss' });
    g.dx = c.dx;
    g.dz = c.dz;
    g.len = c.mk;
    w.groundBlow(c.x - c.dx * c.mk, c.z - c.dz * c.mk, g);
    c.mk = 0;
  }

  get crescentsAlive() {
    return this.crescents.some((c) => c.alive);
  }

  /**
   * Fly the crescents: each one cues `flashLead` before it reaches the hero (combat:flash + a glint on
   * it); a crescent that could only cue later than 0.24 s before contact fizzles on touch (fairness:
   * as the wyrm's bullets). A parry or a dodge spends it; a block chips.
   */
  updateCrescents(dt, d) {
    const T = d.T, C = T.crescent, p = this.game.player;
    if (!C) return;
    for (const c of this.crescents) {
      if (!c.alive) continue;
      // (a thrown thing may carry its own speed, size and life: the Starless Lord's push)
      const speed = c.speed ?? C.speed, radius = c.radius ?? C.radius, half = c.half ?? 1.0;
      c.age += dt;
      c.x += c.dx * speed * dt;
      c.z += c.dz * speed * dt;
      if (c.age > (c.life ?? C.life) || Math.hypot(c.x, c.z) > 60) {
        c.alive = false;
        continue;
      }
      if (c.style === 'rift') this._riftMark(c, speed * dt);
      // the world in its way (ADR-107): a crescent bursts on cover and chips it; a wall of force
      // goes through and throws down what it meets; a fissure runs under everything
      const W = this.game.world?.destructibles;
      if (W?.stop && c.style !== 'rift') {
        const WT = T.world ?? DUEL_WORLD;
        const px = c.x - c.dx * speed * dt, pz = c.z - c.dz * speed * dt;
        if (c.style === 'push') {
          // (one blow per wall per piece: a fresh id when the pooled record starts a new flight)
          if (c.wsrc === undefined || c.age < c.wAge) c.wsrc = W.swing();
          c.wAge = c.age;
          const o = (this._pushBlow ??= { kind: 'blunt', by: 'boss', dx: 0, dz: 0, src: -1 });
          o.dx = c.dx;
          o.dz = c.dz;
          o.src = c.wsrc;
          W.sweep(px, pz, c.x, c.z, half, WT.push ?? DUEL_WORLD.push, o);
        } else if (W.stop(px, pz, c.x, c.z, Math.min(0.6, half * 0.5), WT.crescent ?? DUEL_WORLD.crescent, COVER_BLOW)) {
          this._fizzle(c);
          c.alive = false;
          continue;
        }
      }
      this._drawCrescent(c, d.phase >= 2);
      const pp = p?.position;
      if (!pp || c.done || p.alive === false) continue;
      // along / across the crescent's path
      const rx = pp.x - c.x, rz = pp.z - c.z;
      const along = rx * c.dx + rz * c.dz, across = Math.abs(-rx * c.dz + rz * c.dx);
      const reach = radius + (p.radius ?? 0.45);
      if (across < half && along > 0 && c.flashed < 0) {
        const tti = (along - reach) / speed;
        if (tti <= perPhase(T.flashLead, d.phase)) {
          c.flashed = c.age;
          const fy = 0.7;
          d.emit('combat:flash', { source: 'dragon', attack: c.attack, tell: c.tell, x: c.x, y: fy, z: c.z });
          this.hazardFlash(c.tell, c.x, fy, c.z);
        }
      }
      if (across < half && Math.abs(along) <= reach) {
        c.done = true;
        // fairness: a crescent announced too late (the hero ran into it point-blank) only fizzles
        const lead = c.flashed >= 0 ? c.age - c.flashed : 0;
        if (c.flashed < 0 || lead < 0.24) {
          this._fizzle(c);
          c.alive = false;
          continue;
        }
        const r = d.hitPlayer({ damage: c.damage, knockback: c.kb, kind: 'qi', tell: c.tell, attack: c.attack, from: { x: c.x - c.dx, z: c.z - c.dz }, point: { x: c.x, y: 0.7, z: c.z }, crescent: true });
        if (r === RESULT.PARRIED || r === RESULT.BLOCKED) {
          this._fizzle(c);
          c.alive = false;
        }
      }
    }
  }

  /**
   * A bowed blade across a path, drawn this frame: a thin line of `kind` from one horn to the other
   * (`half` m to each side, bulging `bow` m forward, `y` up, lifted `lift` more in the middle, set
   * `back` m behind, a blob every `step` m). `heat` at the middle, falling to 45% at the horns.
   */
  _bow(c, half, bow, y, lift, size, heat, kind = K_STEEL, back = 0, step = 0.1) {
    const life = this._frame();
    if (!(life > 0)) return;
    const px = -c.dz, pz = c.dx;
    if (kind === K_STEEL) {
      // (an edge: written on the grid, piece by piece)
      const n = 10;
      let lx = 0, ly = 0, lz = 0, lh = 0;
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * 2 - 1, f = 1 - u * u, bw = bow * f - back, h = heat * (0.45 + 0.55 * f);
        const x = c.x + px * u * half + c.dx * bw, yy = y + lift * f, z = c.z + pz * u * half + c.dz * bw;
        if (i) this._ink(lx, ly, lz, x, yy, z, 0, lh, 0, h, i > 1 ? 1 : 0);
        lx = x;
        ly = yy;
        lz = z;
        lh = h;
      }
      return;
    }
    const n = Math.max(4, Math.ceil((half * 2.2) / step));
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * 2 - 1, f = 1 - u * u, bw = bow * f - back, h = heat * (0.45 + 0.55 * f);
      this._blob(c.x + px * u * half + c.dx * bw, y + lift * f, c.z + pz * u * half + c.dz * bw, 0, 0, 0, life, size, size, h, h, kind);
    }
  }

  /** The Ash Crescent: a bow of pale steel across its path, ash rolling off behind it; kindled
   *  (phase 2), flame in its wake. */
  _drawCrescent(c, ember) {
    const L = lookOf('qi', '0');
    if (L === 'a' || L === 'b' || L === 'c') return this._drawQi(c, L);
    this._bow(c, 0.9, 0.55, 0.55, 0.1, 0.27, 1.15);
    this._bow(c, 0.65, 0.5, 0.55, 0.1, 0.27, 0.5, K_STEEL, 0.42);
    const px = -c.dz, pz = c.dx, u = this.rand(-0.8, 0.8);
    if (ember) this._blob(c.x + px * u, 0.55, c.z + pz * u, -c.dx * 1.5, this.rand(0.2, 0.8), -c.dz * 1.5, this.rand(0.2, 0.32), 0.44, 0.2, 0.36, 0, K_FIRE, 1.5, 1.5);
    else if (this.rnd() < 0.5) this._blob(c.x + px * u - c.dx * 0.2, 0.5, c.z + pz * u - c.dz * 0.2, -c.dx * 1.5, this.rand(0.1, 0.5), -c.dz * 1.5, this.rand(0.3, 0.5), 0.45, 0.9, 0.6, 0, K_SMOKE, 1.5);
    if (this.rnd() < 0.6) {
      this._spawn(this.alpha, {
        x: c.x + this.rand(-0.6, 0.6) * px, y: 0.2, z: c.z + this.rand(-0.6, 0.6) * pz,
        vx: -c.dx * 2, vy: this.rand(0.3, 1), vz: -c.dz * 2, life: this.rand(0.3, 0.6), size: 0.18, sizeEnd: 0.05, glyph: ".,'",
        color: ASH, colorEnd: [0.15, 0.14, 0.14], alpha: 0.9, alphaEnd: 0, drag: 2,
      });
    }
  }

  /**
   * The sword qi redrawn (`?qi=a|b|c`; '0' = the bow above). A wave of cut air with a body: its edge
   * (crisp steel, as the old bow), what follows the edge, a wake that tears the floor's dust and
   * scores the floor under it (`world.scorch`), ember once kindled (phase 2), pale ash in phase 3.
   *   a  the edge, two fainter bows behind it (the body of the cut air thinning back), dust torn up
   *      off both horns, the floor scored along its path
   *   b  a standing blade of wind: three bows stacked up (the middle one hot), the wake as a
   *   c  it runs low along the floor: one low edge, the floor ploughed: a groove scored and grit
   *      thrown out to both sides like a bow wave
   * About 60 - 90 blobs a frame per crescent at the game camera; a phase 2 fan of three ~250.
   */
  _drawQi(c, L) {
    const ph = this.d?.phase ?? 1, p3 = ph >= 3, p2 = ph >= 2 && !p3;
    const edge = p3 ? 1.2 : 1.15, px = -c.dz, pz = c.dx;
    this._frame();
    if (this._qiFrame !== this._fNow) {
      // (a crowd, a fan or the storm's nine, shares one budget: about 6 wake blobs a frame in all,
      // and past three in the air the faintest bow of a is left out)
      this._qiFrame = this._fNow;
      let n = 0;
      for (const q of this.crescents) if (q.alive) n++;
      this._qiShare = Math.min(2, 6 / Math.max(1, n));
    }
    if (L === 'b') {
      this._bow(c, 0.8, 0.5, 0.5, 0.05, 0.27, edge * 0.7, K_STEEL, 0.05);
      this._bow(c, 0.95, 0.6, 0.95, 0.1, 0.27, edge);
      if (this._qiShare >= 2) this._bow(c, 0.7, 0.45, 1.45, 0.05, 0.27, edge * 0.55, K_STEEL, 0.1);
    } else if (L === 'c') {
      this._bow(c, 1.0, 0.5, 0.5, 0.0, 0.27, edge);
      this._bow(c, 0.7, 0.4, 0.5, 0.0, 0.27, 0.42, K_STEEL, 0.5);
    } else {
      this._bow(c, 0.95, 0.58, 0.6, 0.12, 0.27, edge);
      this._bow(c, 0.78, 0.5, 0.6, 0.1, 0.27, 0.62, K_STEEL, 0.28);
      if (this._qiShare >= 2) this._bow(c, 0.6, 0.42, 0.6, 0.08, 0.27, 0.36, K_STEEL, 0.58);
    }
    // the wake: dust (phase 1), flame (phase 2), ash with pale specks (phase 3), torn off behind the
    // edge. A crowd (a fan, the storm's nine) shares one budget: about 6 wake blobs a frame in all
    const nW = Math.floor(this._qiShare) + (this.lr() < this._qiShare % 1 ? 1 : 0);
    for (let i = 0; i < nW; i++) {
      const u = this.lrand(-0.9, 0.9), bx = c.x + px * u - c.dx * this.lrand(0.2, 0.7), bz = c.z + pz * u - c.dz * this.lrand(0.2, 0.7);
      const hy = L === 'b' ? this.lrand(0.75, 1.4) : this.lrand(0.75, 0.95);
      if (p2) this._blob(bx, hy, bz, -c.dx * 1.5, this.lrand(0.3, 0.9), -c.dz * 1.5, this.lrand(0.22, 0.34), 0.44, 0.2, 0.38, 0, K_FIRE, 1.5, 1.5);
      else this._blob(bx, hy, bz, -c.dx * 1.2 + px * u * 1.5, this.lrand(0.2, 0.6), -c.dz * 1.2 + pz * u * 1.5, this.lrand(0.4, 0.7) * Math.min(1, this._qiShare), 0.4, 1.0, p3 ? 0.55 : 0.48, 0, K_SMOKE, 1.5, 0.3);
      if (p3 && i === 0 && this._qiShare >= 1) this._blob(bx, hy, bz, -c.dx, this.lrand(0.2, 0.8), -c.dz, this.lrand(0.15, 0.3), 0.26, 0.14, 0.5, 0, K_STEEL, 1.5);
    }
    // grit torn up off the floor: off both horns (a), thrown out to both sides (c), under it (b)
    const nG = L === 'c' ? 2 : 1;
    for (let i = 0; i < nG; i++) if (this.lr() < 0.4 * this._qiShare) {
      const sd = this.lr() < 0.5 ? -1 : 1, u = L === 'b' ? this.lrand(-0.6, 0.6) : sd * this.lrand(0.6, 1.0), out = L === 'c' ? this.lrand(2.5, 5) : this.lrand(0.5, 1.5);
      const o = this._rec(c.x + px * u, this.lrand(0.1, 0.3), c.z + pz * u, this.lrand(0.3, 0.6), this.lrand(0.18, 0.26), 0.06, GRIT, p3 ? ASH : DUST, DUST_END);
      o.vx = -c.dx * 2 + px * sd * out;
      o.vy = this.lrand(0.8, 2.6);
      o.vz = -c.dz * 2 + pz * sd * out;
      o.drag = 2;
      o.gravity = -6;
      o.spin = this.lrand(-3, 3);
      this._spawn(this.alpha, o);
    }
    // the floor scored under its path (the scorch map: a pale line; kindled, a glowing one)
    const sc = this.game.world?.scorch;
    this._qiAcc += this.game.fxDt ?? this.game.dt ?? 0.016;
    if (sc?.burnCircle && this._qiAcc >= 0.05) {
      this._qiAcc = 0;
      sc.burnCircle(c.x, c.z, L === 'c' ? 0.45 : 0.32, L === 'c' ? 0.1 : 0.05, p2 ? 0.35 : 0);
    }
  }

  _fizzle(c) {
    if (lookOf('qi', '0') !== '0') {
      // (the redrawn qi breaks into a puff of the dust it was carrying)
      for (let i = 0; i < 6; i++) {
        const a = this.lr() * TAU, sp = this.lrand(0.8, 2.5);
        this._blob(c.x + Math.cos(a) * 0.3, this.lrand(0.75, 1.0), c.z + Math.sin(a) * 0.3, Math.cos(a) * sp, this.lrand(0.2, 0.8), Math.sin(a) * sp, this.lrand(0.4, 0.7), 0.4, 1.0, 0.45, 0, K_SMOKE, 2, 0.4);
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = this.rnd() * TAU, sp = this.rand(1, 4);
      this._spawn(this.alpha, {
        x: c.x, y: 0.6, z: c.z, vx: Math.cos(a) * sp, vy: this.rand(0, 2), vz: Math.sin(a) * sp,
        life: this.rand(0.3, 0.6), size: 0.18, sizeEnd: 0.05, glyph: ".,'`", color: ASH, colorEnd: [0.15, 0.14, 0.14], alpha: 1, alphaEnd: 0, drag: 3,
      });
    }
    // the blade breaks: its two halves fly apart and go out
    const px = -c.dz, pz = c.dx;
    for (let i = -4; i <= 4; i++) {
      if (!i) continue;
      const u = i / 4, sp = 3 * Math.sign(i) + u * 2;
      this._blob(c.x + px * u * 0.8, 0.6, c.z + pz * u * 0.8, px * sp, this.rand(0.5, 2), pz * sp, this.rand(0.12, 0.2), 0.27, 0.2, 0.5, 0, K_STEEL, 3);
    }
  }
}

/** (the name the Ash Disciple's tools knew it by) */
export { DuelFx as DiscipleFx };
