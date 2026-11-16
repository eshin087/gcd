import { TELL, TELL_STYLE, RESULT, isFlare } from '../../../combat/rules.js';
import { perPhase } from './realise.js';
import { CLASH, clashBurst } from '../../../combat/clashFx.js';
import { FIRE_KIND } from '../../../render/firePalettes.js';
import { DUEL_WORLD } from './worldTuning.js';

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

// The white tells, in letter cells (a cell is 5 x 8 px at 720p): the half-lengths of the cross's
// arms (w across, h up), the reach of the diagonals (0 = none), a ring or not, the life (s), the
// heat at the heart / next to it / at the tips, the light. One blob per cell, 12 px across, centred
// on the cell: exactly one row of '-' and one column of '|'. See tellFlash.
export const TELL_GLINT = Object.freeze({
  normal: { w: 6, h: 3, diag: 0, ring: 0, life: 0.2, heart: 2.3, arm: 1.17, tip: 0.6, light: 1.5 },
  blue: { w: 10, h: 5, diag: 4, ring: 1, life: 0.28, heart: 2.4, arm: 1.17, tip: 0.6, light: 2.4 },
});
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

export class DuelFx {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this._ns = 0x51ed27;
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
  }

  rnd() {
    this._ns = (Math.imul(this._ns, 1664525) + 1013904223) >>> 0;
    return this._ns / 4294967296;
  }
  rand(a, b) {
    return a + this.rnd() * (b - a);
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
    else this._glint(x, y, z, tell === TELL.BLUE ? TELL_GLINT.blue : TELL_GLINT.normal, k);
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
    const c = TELL_STYLE.normal.color, sp = this._rec(P.x, P.y, P.z, 0.12, 0.26 * (style.diag ? 1.25 : 1), 0.1, '*', c, null);
    sp.alphaEnd = 0.3;
    this._spawn(this.add, sp);
    this._light({ x: P.x, y: Math.max(0.9, P.y), z: P.z, color: lightColor(TELL_STYLE.normal.color), intensity: style.light, radius: (2.2 + 0.1 * style.w) * k, life: 0.2, fade: 0.18 });
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

  /** The kindling's shock ring racing out to radius r: a ring of fire. */
  shockRing(x, z, r) {
    if (!(r > 0) || !Number.isFinite(x + z)) return;
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      this._blob(x + ca * 0.8, 0.5, z + sa * 0.8, ca * (r / 0.3), 0, sa * (r / 0.3), 0.32, 0.55, 0.95, 0.85, 0, K_FIRE, 0.5);
    }
    this._light({ x, y: 1, z, color: [1, 0.45, 0.15], intensity: 5, radius: r * 1.2, life: 0.4, fade: 0.35 });
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
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = 7.5;
      const dx = A.rx * ca + A.ux * sa, dy = A.ry * ca + A.uy * sa, dz = A.rz * ca + A.uz * sa;
      this._blob(x + dx * 0.3, y + dy * 0.3, z + dz * 0.3, dx * sp, dy * sp, dz * sp, 0.3, 0.3, 0.3, 0.75, 0, K_STEEL, 5);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.26, ca = Math.cos(a), sa = Math.sin(a), sp = this.rand(9, 13);
      this._blob(x, y, z, (A.rx * ca + A.ux * sa) * sp, (A.ry * ca + A.uy * sa) * sp, (A.rz * ca + A.uz * sa) * sp, this.rand(0.14, 0.22), 0.28, 0.2, 0.7, 0, K_STEEL, 7);
    }
    for (let i = 0; i < 16; i++) {
      const a = this.rnd() * TAU, sp = this.rand(2.5, 7);
      this._spawn(this.add, {
        x: x0, y: y0, z: z0, vx: Math.cos(a) * sp, vy: this.rand(1, 5), vz: Math.sin(a) * sp,
        life: this.rand(0.35, 0.7), size: this.rand(0.14, 0.24), sizeEnd: 0.05, glyph: "+*'",
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
        const f = this.rand(0.5, 0.92), fire = wake === K_FIRE;
        this._blob(hx + (tx - hx) * f, hy + (ty - hy) * f, hz + (tz - hz) * f, this.rand(-0.2, 0.2), this.rand(0.1, 0.5), this.rand(-0.2, 0.2), this.rand(0.16, 0.28), 0.5, 0.26, fire ? 0.38 : 0.42, 0, wake, 1.5, fire ? 1.5 : 0.6);
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

  /** Dust and ash kicked up by a landing or a hard step: grey letters that roll out and thin. */
  dust(x, z, k = 1) {
    if (!Number.isFinite(x + z + k)) return;
    for (let i = 0; i < Math.round(5 * k); i++) {
      const a = this.rnd() * TAU, sp = this.rand(0.8, 2.2) * k;
      this._blob(x + Math.cos(a) * 0.2, 0.3, z + Math.sin(a) * 0.2, Math.cos(a) * sp, this.rand(0.1, 0.5), Math.sin(a) * sp, this.rand(0.45, 0.8), 0.5, 1.1, 0.75, 0, K_SMOKE, 3);
    }
    for (let i = 0; i < Math.round(4 * k); i++) {
      const a = this.rnd() * TAU, sp = this.rand(1, 3) * k;
      this._spawn(this.alpha, {
        x, y: 0.15, z, vx: Math.cos(a) * sp, vy: this.rand(0.2, 1), vz: Math.sin(a) * sp,
        life: this.rand(0.4, 0.8), size: 0.16, sizeEnd: 0.24, glyph: ",.`", color: [0.22, 0.21, 0.2], alpha: 0.7, alphaEnd: 0, drag: 3,
      });
    }
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
    Object.assign(c, { alive: true, x, z, dx: dx / l, dz: dz / l, age: 0, flashed: -1, done: false, speed: undefined, radius: undefined, half: undefined, life: undefined, style: undefined, tell: o.tell ?? TELL.NORMAL, damage: o.damage ?? 14, kb: o.knockback ?? 0.8, attack: o.attack ?? 'ashCrescent' });
    return c;
  }

  /** Per frame (duelist.update): everything in flight, and the glints alive. */
  update(dt, d) {
    this.updateGlints(dt);
    this.updateFlares(dt);
    this.updateCrescents(dt, d);
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

  _fizzle(c) {
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
