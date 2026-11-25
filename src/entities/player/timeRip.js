import { axes } from '../../combat/clashFx.js';
import { FIRE_KIND } from '../../render/firePalettes.js';

// THE TIME RIP: what the flurry's flash cuts do to the picture as they land ("the slashes ripping
// time in a cool flash instant"). Four looks for the owner to pick from film (?rip=, TIME_RIP.mode,
// live: read at every cut), plus `off` (nothing added):
//   tear      the delayed tear: on the contact only a faint hairline hangs where the blade went; a beat
//             later (RIP_LOOK.tear.delay real s; in a storm a share of the gap between cuts) it splits
//             open along its whole length at once: a bright seam of fine letters, two lips parting a
//             cell or two (a lens: pinched at the ends), closing, gone
//   strip     the torn strip: for three frames the letters already printed in a band 3 - 4 cells wide
//             along the cut are printed SHIFTED along it (one side one way, the other the other way,
//             whole cells), then snap back; a crisp seam of steel on the line itself
//   ghosts    frozen afterimages: on each cut 4 still copies of him (1 in a storm; RIP_LOOK.ghosts.cap
//             alive at most) hang along the line from where the pass began to the contact, printed as
//             the Ghostep's afterimage is (fine digits, one to a cell); they stand still for a beat,
//             then shatter into their letters thrown along the cut (on the last blow: all at once)
//   negative  the inverted line: a strip 1 - 2 cells wide along the cut prints in negative for two
//             frames (the letters dark on a pale steel cell), then gone
// Every mark sits on the line the blade travelled: `player.flurry.lines[i]` (world; `k` the drawn
// share), read live while that flurry runs. Nothing here touches a rule: the damage, the frames the
// blows land on and where the hero goes are the flurry's (tests/integration integ / duel `timerip`).
//
// How it prints:
//   - the seams and hairlines are heat in the fire field's `steel` (STYLE.md "The fire field"), the way
//     combat/impactStamp.js and combat/perfectFx.js print their marks: one blob to a letter cell,
//     snapped to the cell's centre, pulled toward the camera, re-drawn every step with one copy alive
//     (the one-copy frame clock), never over the hero, stepped frames held in REAL time (a cut's freeze
//     must not stretch them);
//   - the strip and the negative are a screen-space pass of the printed letters (render/pipeline.js
//     `cutBand`, the ASCII pass): uCutN live cuts (0: the pass reads nothing), per cut uCutA = its two
//     ends (frame px, y up), uCutB = (1 strip | 2 negative, the band's half-width in cells, the shift
//     in cells, the negative's weight), uCutTone = the negative's cell (rgb, letter contrast). Snapped
//     to whole art cells (5 x 8); written here and again by the pipeline right before the pass, after
//     the camera's last move (as render/impactRipple.js does);
//   - the ghosts are glyph digits in `game.fx.add` (the afterimage's look: PlayerFx._afterimage and
//     perfectFx's standing ghost; its numbers are copied into RIP_LOOK.ghosts).
// Per frame: no allocation, nothing throws, no Math.random (a seeded stream of its own).

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};

export const RIP_MODES = Object.freeze(['off', 'tear', 'strip', 'ghosts', 'negative']);
/** The look until the owner picks (2026-11-24). */
export const RIP_DEFAULT = 'tear';

/** The switch: ?rip=off|tear|strip|ghosts|negative. `mode` is live (the Lab's 'rip' button; read at every cut). */
export const TIME_RIP = {
  modes: RIP_MODES,
  mode: RIP_MODES.includes(q('rip')) ? q('rip') : RIP_DEFAULT,
};
export const ripMode = () => (RIP_MODES.includes(TIME_RIP.mode) ? TIME_RIP.mode : 'off');
export const setRipMode = (m) => (TIME_RIP.mode = RIP_MODES.includes(m) ? m : RIP_DEFAULT);

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

/**
 * The numbers, per mode (content is data). Times are REAL seconds. heat: the fire field's steel
 * (0.35 a dim speck, 0.6 a dim stroke, 1.1 a bright stroke, 1.5+ a white digit: kept under it).
 *   pull   m the steel is drawn toward the camera (past the field's soft depth fade on the body it crosses)
 *   px     a blob's size in px of the 5 x 8 art cell (impactStamp / flurryFx: 12)
 *   minY   m no steel cell below this (the floor)
 *   spare  the hero's figure on screen, never written over (perfectFx's MARK_LOOK.spare)
 * tear:   delay (s after the contact it splits), min (its least), gapK (in a storm / a quick string:
 *         the share of the gap since the blow before, under `delay`), hair (the hairline's heat),
 *         hold (s a frame of the split), frames: off = the lips' distance from the line in cells at the
 *         middle (pinched to 0 at the ends), h = their heat, seam = the line's own heat between them,
 *         keep = the share of cells printed
 * strip:  half (the band's half-width in cells: |distance| <= half), shift (cells along the cut per
 *         frame; 0 = back), hold (s a frame), seam (the steel seam's heat per frame)
 * negative: half, frames, hold, tone (the pale steel cell, linear rgb), k (how hard a lit letter
 *         darkens it)
 * ghosts: count (copies a shown cut), storm (a storm cut), cap (alive at most; the oldest shatters
 *         first), hold (s they stand), holdMin / gapK (in a storm: the share of the gap), tear (s over
 *         which a copy shatters, from where he started toward the contact), speed / life (the torn
 *         letters), alpha (a standing copy's), cell (m: one digit to a cell of this grid on the
 *         screen, the afterimage's GHOST_CELL), size, step (every step-th point of his body), col /
 *         hi / colEnd (the afterimage's colours: COL.ghostDim, COL.ghost, COL.ghostEnd), chest (m: the
 *         line crosses him this high, flurry.js CHEST)
 */
export const RIP_LOOK = deepFreeze({
  pull: 1.2,
  px: 12,
  minY: 0.05,
  spare: { rx: 0.24, foot: 0.05, head: 1.7, pad: 0.04 },
  tear: {
    delay: 0.16,
    min: 0.05,
    gapK: 0.55,
    hair: 0.36,
    hold: 0.035,
    frames: [
      { off: 0, h: 1.2, seam: 0, keep: 1 },
      { off: 1, h: 1.08, seam: 0.5, keep: 1 },
      { off: 2, h: 0.88, seam: 0, keep: 1 },
      { off: 1, h: 0.62, seam: 0, keep: 1 },
      { off: 0, h: 0.4, seam: 0, keep: 0.5 },
    ],
  },
  strip: { half: 1.5, shift: [3, 3, 1], hold: 1 / 60, seam: [1.15, 0.9, 0.55] },
  negative: { half: 0.75, frames: 2, hold: 1 / 60, tone: [0.5, 0.55, 0.62], k: 1.6 },
  ghosts: {
    count: 4,
    storm: 1,
    cap: 10,
    hold: 0.12,
    holdMin: 0.04,
    gapK: 0.6,
    tear: 0.08,
    speed: [3, 8],
    life: [0.08, 0.2],
    alpha: 0.55,
    cell: 0.13,
    size: 0.16,
    step: 2,
    col: [0.42, 0.68, 1.3],
    hi: [1.3, 1.75, 2.6],
    colEnd: [0.12, 0.25, 0.75],
    chest: 1.2,
  },
});

/** Loose glyphs this module spawns as particles (tests/glyphcheck.mjs: the world atlas): the ghosts' digits. */
export const RIP_GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const fin = Number.isFinite;
const K_STEEL = FIRE_KIND.steel;
const CUTS = 12; // cuts tracked at once (a flurry hangs at most DEFENSE.flurry.max + 1 lines)
const SLOTS = 2; // the screen pass's live cuts (pipeline.js uCutA / uCutB)
const MAXC = 900; // steel cells a frame
const HASH = 2048; // the cell table (open addressing, cleared by stamp)
const GPTS = 240; // points a ghost keeps (420 body points, every other one)
const GCAP = 12; // ghost slots (RIP_LOOK.ghosts.cap <= this)

// ---- the screen (perfectFx's), reused
const SCR = { mpp: 0.025, px: 0, py: 0, cw: 5, ch: 8, ok: false };
function screen(game, x, y, z) {
  const S = SCR, cam = game.camera, p = game.pipeline;
  S.ok = false;
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
}

// ---- one frame's steel cells (whole cells; the hottest wins a cell)
const CI = new Int32Array(MAXC), CJ = new Int32Array(MAXC), CH = new Float32Array(MAXC), CX = new Float32Array(MAXC * 3);
const HK = new Int32Array(HASH), HV = new Int32Array(HASH), HS = new Uint32Array(HASH);
let nc = 0, stamp = 1;

// the fire field's reused blob, the glyph pool's reused particle
const BLOB = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.3, sizeEnd: 0.3, heat: 1, heatEnd: 1, kind: K_STEEL, drag: 0, gravity: 0 };
const GP = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.16, sizeEnd: 0.16, glyph: '0', color: null, colorEnd: null, alpha: 0.55, alphaEnd: 0.55, drag: 0, stretch: 1 };

/** What it did (tests read it; reused). */
export const RIP_STAT = { cuts: 0, blobs: 0, peak: 0, ghosts: 0, ghostPts: 0, torn: 0, splits: 0, screenN: 0, writes: 0, errors: 0 };

export class TimeRip {
  constructor(game) {
    this.game = game;
    this._seed = 0x51ed27a3;
    this._gen = 0; // counts flurries (a line is read live only while its flurry runs)
    this._markGen = -1; // the newest line marked (a line is marked once: an art's last blow draws none)
    this._markLi = -1;
    this._now = 0; // fx time (the one-copy frame clocks)
    this._dl = -1; // when the steel alive now dies
    this._gdl = -1; // when the standing ghosts alive now die
    this.cuts = Array.from({ length: CUTS }, () => ({
      alive: false, mode: 'off', gen: 0, li: -1, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, k: 0,
      age: 0, delay: 0, split: false, drawn: false, seq: 0, L: null,
    }));
    this._seq = 0;
    // the screen pass's slots (live strip / negative cuts), what was written last
    this._lastN = 0;
    // the ghosts: points (world, still), torn flags, per slot its life
    this._gpos = new Float32Array(GCAP * GPTS * 3);
    this._gdone = new Uint8Array(GCAP * GPTS);
    this._gord = new Float32Array(GCAP * GPTS);
    this.ghosts = Array.from({ length: GCAP }, () => ({ alive: false, n: 0, age: 0, hold: 0, dx: 1, dy: 0, dz: 0, seq: 0, drawn: false, cx: 0, cy: 0, cz: 0 }));
    /** The chests of the ghosts spawned last (tests: on the line). */
    this.ghostAnchors = new Float32Array(GCAP * 3);
    this.ghostAnchorN = 0;
    // the hero's figure on screen this frame (never written over)
    this._hx = this._hy = this._hrx = this._hry = 0;
    const ev = game?.events;
    if (ev?.on) {
      ev.on('player:flurry', () => {
        this._gen++;
      });
      ev.on('player:flurryHit', (e) => this._onHit(e));
      ev.on('player:flurryEnd', () => this._onEnd());
    }
    game?.pipeline?.setTimeRip?.(this);
  }

  _rnd() {
    this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }

  /** Anything running (tests). */
  get busy() {
    return this.cuts.some((c) => c.alive) || this.ghosts.some((g) => g.alive);
  }

  // ------------------------------------------------------------------ the events
  _onHit(e) {
    try {
      const mode = ripMode();
      const fl = this.game?.player?.flurry;
      if (e?.last) {
        // the last blow: what still waits goes now (the hairlines split, the ghosts shatter)
        for (const c of this.cuts) if (c.alive && c.mode === 'tear' && !c.split) c.delay = c.age;
        // (all at once: every standing copy is past its tear)
        for (const g of this.ghosts) if (g.alive && g.age < g.hold + RIP_LOOK.ghosts.tear) g.hold = g.age - RIP_LOOK.ghosts.tear - 1e-3;
      }
      if (mode === 'off' || !fl) return;
      const li = (fl.nLines | 0) - 1, L = li >= 0 ? fl.lines?.[li] : null;
      if (!L || !fin(L.ax + L.ay + L.az + L.bx + L.by + L.bz)) return;
      // (the last blow of an art draws no line of its own: the newest one is the cut before, marked
      // already; a riposte's last cut has its own)
      if (this._markGen === this._gen && li <= this._markLi) return;
      this._markGen = this._gen;
      this._markLi = li;
      const storm = (e?.storm | 0) > 0, gap = fin(e?.gap) ? e.gap : 0;
      RIP_STAT.cuts++;
      if (mode === 'ghosts') {
        this._spawnGhosts(L, storm, gap, !!e?.last);
        return;
      }
      const c = this._take();
      if (c.L) c.L.hold = false; // (a slot taken from a mark still holding its line lets it go)
      c.alive = true;
      c.mode = mode;
      c.gen = this._gen;
      c.li = li;
      this._copy(c, L);
      c.age = 0;
      c.split = false;
      c.drawn = false;
      c.seq = ++this._seq;
      c.L = null;
      if (mode === 'tear') {
        const T = RIP_LOOK.tear;
        c.delay = e?.last ? 0 : gap > 0 ? Math.min(T.delay, Math.max(T.min, gap * T.gapK)) : T.delay;
        // the flurry's own white line is held back until the tear splits: the beat is only a hairline
        if (c.delay > 0) {
          L.hold = true;
          c.L = L;
        }
      } else c.delay = 0;
      this._writeNow();
    } catch {
      RIP_STAT.errors++; // (never freeze the frame; the tests read it)
    }
  }

  _onEnd() {
    // (the lines are gone: the marks still running keep their copies of them)
    this._gen++;
  }

  _take() {
    let s = null;
    for (const c of this.cuts) if (!c.alive) { s = c; break; }
    if (!s) {
      s = this.cuts[0];
      for (const c of this.cuts) if (c.seq < s.seq) s = c;
    }
    return s;
  }

  _copy(c, L) {
    c.ax = L.ax; c.ay = L.ay; c.az = L.az;
    c.bx = L.bx; c.by = L.by; c.bz = L.bz;
    c.k = Math.min(1, Math.max(0, fin(L.k) ? L.k : 1));
  }

  /** The cut's line, live while its flurry runs (the blade draws it on past the contact). */
  _refresh(c) {
    const fl = this.game?.player?.flurry;
    if (!fl || c.gen !== this._gen || !(c.li >= 0) || c.li >= (fl.nLines | 0)) return;
    const L = fl.lines?.[c.li];
    if (L && fin(L.ax + L.ay + L.az + L.bx + L.by + L.bz + L.k)) this._copy(c, L);
  }

  // ------------------------------------------------------------------ per step
  /**
   * Per simulation step (main.js, before the particle pools and the fire field age: what is drawn
   * here shows this frame). `dt`: fx time (the blobs' and particles' clock), `realDt`: the marks'
   * clock. Never throws, never allocates.
   */
  update(dt, realDt) {
    try {
      const d = fin(dt) && dt > 0 ? dt : 0;
      const r = fin(realDt) && realDt > 0 ? realDt : d;
      if (!(r > 0) || !(d > 0)) return; // (a pause: nothing ages)
      this._now += d;
      let steel = false;
      for (const c of this.cuts) {
        if (!c.alive) continue;
        c.age += r;
        this._refresh(c);
        if (this._done(c)) { c.alive = false; continue; }
        if (c.mode === 'tear' || c.mode === 'strip') steel = true;
      }
      let anyG = false;
      for (const g of this.ghosts) {
        if (!g.alive) continue;
        g.age += r;
        anyG = true;
      }
      if (anyG) this._ghostTick(d);
      if (steel) this._steel(d);
      this._writeNow();
    } catch {
      RIP_STAT.errors++; // (never freeze the frame; the tests read it)
    }
  }

  _done(c) {
    if (c.mode === 'tear') {
      const T = RIP_LOOK.tear;
      return c.age >= c.delay + T.frames.length * T.hold;
    }
    if (c.mode === 'strip') return c.age >= RIP_LOOK.strip.shift.length * RIP_LOOK.strip.hold;
    if (c.mode === 'negative') return c.age >= RIP_LOOK.negative.frames * RIP_LOOK.negative.hold;
    return true;
  }

  /** Drop everything (a level reset). */
  clear() {
    for (const c of this.cuts) {
      if (c.L) c.L.hold = false;
      c.L = null;
      c.alive = false;
    }
    for (const g of this.ghosts) g.alive = false;
    this._dl = this._gdl = -1;
    const u = this.game?.pipeline?.asciiMat?.uniforms;
    if (u?.uCutN) u.uCutN.value = 0;
    this._lastN = 0;
  }

  // ------------------------------------------------------------------ the steel (tear, strip's seam)
  _steel(d) {
    const game = this.game, F = game?.fx?.fire;
    if (!F?.spawn) return;
    // the one-copy frame clock: while the copy alive now still shows, only a cut not yet drawn is
    // (living as long as that copy: it joins the clock)
    const fresh = this._now >= this._dl;
    let life;
    if (fresh) {
      life = Math.max(0.0101, d * 1.5);
      this._dl = this._now - d + life;
    } else {
      let undrawn = false;
      for (const c of this.cuts) if (c.alive && !c.drawn && (c.mode === 'tear' || c.mode === 'strip')) { undrawn = true; break; }
      if (!undrawn) return;
      life = Math.max(0.0101, this._dl - this._now + d);
    }
    nc = 0;
    stamp = (stamp + 1) >>> 0 || 1;
    this._spareAt(game);
    const A = axes(game);
    for (const c of this.cuts) {
      if (!c.alive || (!fresh && c.drawn)) continue;
      c.drawn = true;
      if (c.mode === 'tear') {
        const T = RIP_LOOK.tear;
        if (c.age < c.delay) {
          this._seg(game, A, c, 0, T.hair, 1);
          continue;
        }
        const f = Math.min(T.frames.length - 1, Math.floor((c.age - c.delay) / T.hold));
        const Fr = T.frames[f];
        if (!c.split) {
          c.split = true;
          RIP_STAT.splits++;
          // (the line it held comes back as it opens; a later flurry's reuse of it has its own gen)
          if (c.L && c.gen === this._gen) c.L.hold = false;
          c.L = null;
        }
        if (Fr.off > 0) {
          this._seg(game, A, c, Fr.off, Fr.h, Fr.keep);
          this._seg(game, A, c, -Fr.off, Fr.h, Fr.keep);
          if (Fr.seam > 0) this._seg(game, A, c, 0, Fr.seam, 1);
        } else this._seg(game, A, c, 0, Fr.h, Fr.keep);
      } else if (c.mode === 'strip') {
        const S = RIP_LOOK.strip;
        const f = Math.min(S.seam.length - 1, Math.floor(c.age / S.hold));
        this._seg(game, A, c, 0, S.seam[f], 1);
      }
    }
    let w = 0;
    for (let k = 0; k < nc; k++) {
      const x = CX[k * 3], y = CX[k * 3 + 1], z = CX[k * 3 + 2];
      const P = screen(game, x, y, z);
      BLOB.x = x;
      BLOB.y = y;
      BLOB.z = z;
      BLOB.life = life;
      BLOB.size = BLOB.sizeEnd = RIP_LOOK.px * (P.cw / 5) * P.mpp;
      BLOB.heat = BLOB.heatEnd = CH[k];
      if (F.spawn(BLOB) >= 0) w++;
    }
    RIP_STAT.blobs += w;
    if (w > RIP_STAT.peak) RIP_STAT.peak = w;
  }

  /** The hero's figure on screen this frame (an ellipse; 0: none). */
  _spareAt(game) {
    this._hrx = 0;
    const hp = game.player?.position, SP = RIP_LOOK.spare;
    if (!hp || !fin(hp.x + hp.y + hp.z) || game.player?.flurry?.hidden) return;
    const Q = screen(game, hp.x, hp.y + SP.foot, hp.z);
    const fx = Q.px, fy = Q.py, ok = Q.ok;
    screen(game, hp.x, hp.y + SP.head, hp.z);
    if (!ok || !Q.ok) return;
    this._hx = (fx + Q.px) * 0.5;
    this._hy = (fy + Q.py) * 0.5;
    this._hrx = SP.rx / Q.mpp;
    this._hry = Math.hypot(Q.px - fx, Q.py - fy) * 0.5 + SP.pad / Q.mpp;
  }

  /**
   * Cut c's drawn line as cells of the letter grid, `off` cells to one side (pinched to the line at
   * both ends: a lens), heat h (a little lower at the ends), `keep` of its cells.
   */
  _seg(game, A, c, off, h, keep) {
    const pull = RIP_LOOK.pull, cam = game.camera?.position;
    const k = c.k;
    if (!(k > 0.03)) return;
    let ax = c.ax, ay = c.ay, az = c.az;
    let bx = ax + (c.bx - ax) * k, by = ay + (c.by - ay) * k, bz = az + (c.bz - az) * k;
    const pa = screen(game, ax, ay, az);
    if (!pa.ok) return;
    const pax = pa.px, pay = pa.py, cw = pa.cw, ch = pa.ch;
    const pb = screen(game, bx, by, bz);
    if (!pb.ok) return;
    const dx = pb.px - pax, dy = pb.py - pay;
    const n = Math.ceil(Math.max(Math.abs(dx) / cw, Math.abs(dy) / ch));
    if (!(n >= 1) || n > 400) return;
    // across the line in whole cells: a line more along the rows moves its lips by rows, else by columns
    const rows = Math.abs(dx) / cw >= Math.abs(dy) / ch;
    let kept = 0;
    for (let s = 0; s <= n; s++) {
      kept += keep;
      if (kept < 1) continue;
      kept -= 1;
      const t = s / n;
      const lens = Math.sin(Math.PI * t);
      const o = off === 0 ? 0 : Math.round(off * Math.sqrt(Math.max(0, lens)));
      if (off !== 0 && o === 0) continue; // (pinched: the lips meet the seam at the ends)
      const wx = ax + (bx - ax) * t, wy = ay + (by - ay) * t, wz = az + (bz - az) * t;
      const P = screen(game, wx, wy, wz);
      if (!P.ok) continue;
      const i = Math.floor(P.px / cw) + (rows ? 0 : o), j = Math.floor(P.py / ch) + (rows ? o : 0);
      if (this._hrx > 0) {
        const ex = ((i + 0.5) * cw - this._hx) / this._hrx, ey = ((j + 0.5) * ch - this._hy) / this._hry;
        if (ex * ex + ey * ey < 1) continue;
      }
      const ox = ((i + 0.5) * cw - P.px) * P.mpp, oy = ((j + 0.5) * ch - P.py) * P.mpp;
      let x = wx + A.rx * ox + A.ux * oy, y = wy + A.ry * ox + A.uy * oy, z = wz + A.rz * ox + A.uz * oy;
      if (cam) {
        const qx = cam.x - x, qy = cam.y - y, qz = cam.z - z, l = Math.hypot(qx, qy, qz);
        if (l > pull * 1.5 && fin(l)) {
          x += (qx / l) * pull;
          y += (qy / l) * pull;
          z += (qz / l) * pull;
        }
      }
      if (!(y >= RIP_LOOK.minY) || !fin(x + z)) continue;
      const taper = 0.8 + 0.2 * lens;
      this._put(i, j, h * taper, x, y, z);
    }
  }

  _put(i, j, h, x, y, z) {
    if (!(h > 0.05)) return;
    let s = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & (HASH - 1);
    for (let p = 0; p < HASH; p++) {
      if (HS[s] !== stamp) {
        if (nc >= MAXC) return;
        HS[s] = stamp;
        HK[s] = i;
        HV[s] = nc;
        CI[nc] = i;
        CJ[nc] = j;
        CH[nc] = h;
        CX[nc * 3] = x;
        CX[nc * 3 + 1] = y;
        CX[nc * 3 + 2] = z;
        nc++;
        return;
      }
      const v = HV[s];
      if (HK[s] === i && CJ[v] === j) {
        if (h > CH[v]) CH[v] = h;
        return;
      }
      s = (s + 1) & (HASH - 1);
    }
  }

  // ------------------------------------------------------------------ the screen pass (strip, negative)
  _writeNow() {
    const pipe = this.game?.pipeline;
    if (pipe) this.write(pipe);
  }

  /**
   * The live strip / negative cuts into the ASCII pass's uniforms, projected with the pipeline's
   * camera (called by update and by the pipeline right before the pass). Writes nothing while idle
   * (uCutN is set to 0 once when the last one ends).
   */
  write(pipe) {
    const u = pipe?.asciiMat?.uniforms;
    if (!u?.uCutN || !u.uCutA || !u.uCutB) return;
    let live = false;
    for (const c of this.cuts) if (c.alive && (c.mode === 'strip' || c.mode === 'negative')) { live = true; break; }
    if (!live) {
      if (this._lastN !== 0 || u.uCutN.value !== 0) {
        u.uCutN.value = 0;
        RIP_STAT.writes++;
      }
      this._lastN = 0;
      return;
    }
    const cam = pipe.camera, W = pipe.width, H = pipe.height;
    const Av = u.uCutA.value, Bv = u.uCutB.value, cap = Math.min(SLOTS, Av.length, Bv.length);
    let n = 0;
    if (cam?.matrixWorldInverse && W > 8 && H > 8) {
      // the newest first: two strips at once in a storm keep the latest
      for (let pass = 0; pass < 2 && n < cap; pass++) {
        for (const c of this.cuts) {
          if (n >= cap) break;
          if (!c.alive || (c.mode !== 'strip' && c.mode !== 'negative')) continue;
          // (two passes: the newest cut, then the others by age)
          const newest = c.seq === this._seq;
          if ((pass === 0) !== newest) continue;
          if (this._slot(c, cam, W, H, Av[n], Bv[n])) n++;
        }
      }
    }
    if (u.uCutTone) {
      const N = RIP_LOOK.negative;
      u.uCutTone.value.set(N.tone[0], N.tone[1], N.tone[2], N.k);
    }
    u.uCutN.value = n;
    this._lastN = n;
    RIP_STAT.writes++;
    if (n > RIP_STAT.screenN) RIP_STAT.screenN = n;
  }

  /** One cut into slot (A, B); false when it is off screen. */
  _slot(c, cam, W, H, Av, Bv) {
    const k = c.k;
    if (!(k > 0.03)) return false;
    const a = this._proj(cam, W, H, c.ax, c.ay, c.az);
    if (!a) return false;
    const ax = this._sx, ay = this._sy;
    const b = this._proj(cam, W, H, c.ax + (c.bx - c.ax) * k, c.ay + (c.by - c.ay) * k, c.az + (c.bz - c.az) * k);
    if (!b) return false;
    Av.set(ax, ay, this._sx, this._sy);
    if (c.mode === 'strip') {
      const S = RIP_LOOK.strip, f = Math.min(S.shift.length - 1, Math.floor(c.age / S.hold));
      Bv.set(1, S.half, S.shift[f], 0);
    } else {
      Bv.set(2, RIP_LOOK.negative.half, 0, 1);
    }
    return true;
  }

  /** World → frame px (y up) with the camera that draws → this._sx / _sy; false behind it. */
  _proj(cam, W, H, x, y, z) {
    const m = cam.matrixWorldInverse.elements, e = cam.projectionMatrix?.elements;
    if (!e) return false;
    const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
    if (!(vz > 0.05) || !fin(vx + vy + vz)) return false;
    const sx = (((vx * e[0]) / vz) * 0.5 + 0.5) * W, sy = (((vy * e[5]) / vz) * 0.5 + 0.5) * H;
    if (!fin(sx + sy)) return false;
    this._sx = sx;
    this._sy = sy;
    return true;
  }

  // ------------------------------------------------------------------ the ghosts
  _spawnGhosts(L, storm, gap, last) {
    const game = this.game, P = game?.player, G = RIP_LOOK.ghosts;
    if (!game?.fx?.add?.spawn || !P || typeof P._sampleBody !== 'function') return;
    const nB = P._sampleBody() | 0, pts = P._ghostPts;
    if (!(nB >= 24) || !pts) return;
    const want = last ? 0 : storm ? G.storm : G.count;
    if (!(want > 0)) return;
    // the cap: the oldest standing copies shatter now
    let alive = 0;
    for (const g of this.ghosts) if (g.alive) alive++;
    const cap = Math.min(GCAP, G.cap);
    while (alive + want > cap) {
      let o = null;
      for (const g of this.ghosts) if (g.alive && g.age < g.hold && (!o || g.seq < o.seq)) o = g;
      if (!o) break;
      o.hold = o.age; // (it shatters this step; its slot frees when its letters are thrown)
      alive--;
    }
    const k = Math.min(1, Math.max(0, fin(L.k) ? L.k : 1));
    const ex = L.bx - L.ax, ey = L.by - L.ay, ez = L.bz - L.az;
    // his chest at the contact: the drawn end of the line; the copies' chests along it before that
    const hx = L.ax + ex * k, hy = L.ay + ey * k, hz = L.az + ez * k;
    let dl = Math.hypot(ex, ey, ez);
    let dx = 1, dy = 0, dz = 0;
    if (dl > 1e-4 && fin(dl)) { dx = ex / dl; dy = ey / dl; dz = ez / dl; }
    else dl = 0;
    const hold = storm || gap > 0 ? Math.min(G.hold, Math.max(G.holdMin, gap * G.gapK)) : G.hold;
    // the cell grid on the screen (the afterimage's: one digit to a cell of G.cell m)
    const A = axes(game), qc = 1 / G.cell;
    this.ghostAnchorN = 0;
    for (let j = 0; j < want; j++) {
      const t = want > 1 ? (k * j) / want : k * 0.5;
      const cx = L.ax + ex * t, cy = L.ay + ey * t, cz = L.az + ez * t;
      const g = this._takeGhost();
      if (!g) break;
      const gi = this.ghosts.indexOf(g), base = gi * GPTS;
      const ox = cx - hx, oy = cy - hy, oz = cz - hz;
      let m = 0;
      // (cells already taken in this copy are dropped: digits on top of one another bloom)
      stamp = (stamp + 1) >>> 0 || 1;
      for (let i = 0; i < nB && m < GPTS; i += G.step) {
        const px = pts[i * 3] + ox, py = pts[i * 3 + 1] + oy, pz = pts[i * 3 + 2] + oz;
        if (!fin(px + py + pz)) continue;
        const sx = px * A.rx + py * A.ry + pz * A.rz, sy = px * A.ux + py * A.uy + pz * A.uz;
        const ci = Math.round(sx * qc), cj = Math.round(sy * qc);
        if (this._seen(ci, cj)) continue;
        const mx = ci * G.cell - sx, my = cj * G.cell - sy;
        const b = (base + m) * 3;
        this._gpos[b] = px + A.rx * mx + A.ux * my;
        this._gpos[b + 1] = py + A.ry * mx + A.uy * my;
        this._gpos[b + 2] = pz + A.rz * mx + A.uz * my;
        this._gdone[base + m] = 0;
        m++;
      }
      if (!m) continue;
      // the order it shatters in: from where he started toward the contact, plus a little noise
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < m; i++) {
        const b = (base + i) * 3, o = this._gpos[b] * dx + this._gpos[b + 1] * dy + this._gpos[b + 2] * dz;
        this._gord[base + i] = o;
        if (o < lo) lo = o;
        if (o > hi) hi = o;
      }
      const span = hi - lo > 1e-3 ? hi - lo : 1;
      for (let i = 0; i < m; i++) this._gord[base + i] = Math.min(1, Math.max(0, ((this._gord[base + i] - lo) / span) * 0.85 + this._rnd() * 0.15));
      g.alive = true;
      g.n = m;
      g.age = 0;
      g.hold = hold;
      g.dx = dx;
      g.dy = dy;
      g.dz = dz;
      g.seq = ++this._seq;
      g.drawn = false;
      g.cx = cx;
      g.cy = cy;
      g.cz = cz;
      if (this.ghostAnchorN < GCAP) {
        const a = this.ghostAnchorN * 3;
        this.ghostAnchors[a] = cx;
        this.ghostAnchors[a + 1] = cy;
        this.ghostAnchors[a + 2] = cz;
        this.ghostAnchorN++;
      }
      RIP_STAT.ghosts++;
      RIP_STAT.ghostPts += m;
    }
    // (the new copies are drawn by this step's update, which runs before the pools age)
  }

  /** (the ghost's cell table: true when (i, j) is taken in this copy) */
  _seen(i, j) {
    let s = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) & (HASH - 1);
    for (let p = 0; p < HASH; p++) {
      if (HS[s] !== stamp) {
        HS[s] = stamp;
        HK[s] = i;
        HV[s] = j;
        return false;
      }
      if (HK[s] === i && HV[s] === j) return true;
      s = (s + 1) & (HASH - 1);
    }
    return true;
  }

  _takeGhost() {
    for (const g of this.ghosts) if (!g.alive) return g;
    return null;
  }

  /** The standing copies (one copy alive a frame) and the letters torn off them. */
  _ghostTick(d) {
    const add = this.game?.fx?.add, G = RIP_LOOK.ghosts;
    if (!add?.spawn) {
      for (const g of this.ghosts) g.alive = false;
      return;
    }
    const step = d > 0 ? d : 1 / 60;
    // the one-copy frame clock (as the steel's): a copy not yet drawn joins the one alive now
    const fresh = this._now >= this._gdl;
    const life = fresh ? Math.max(0.0101, step * 1.5) : Math.max(0.0101, this._gdl - this._now + step);
    if (fresh) this._gdl = this._now - step + life;
    for (let gi = 0; gi < GCAP; gi++) {
      const g = this.ghosts[gi];
      if (!g.alive) continue;
      const base = gi * GPTS, u = g.age >= g.hold ? (g.age - g.hold) / Math.max(0.001, G.tear) : -1;
      let left = 0;
      for (let i = 0; i < g.n; i++) {
        if (this._gdone[base + i]) continue;
        const b = (base + i) * 3;
        GP.x = this._gpos[b];
        GP.y = this._gpos[b + 1];
        GP.z = this._gpos[b + 2];
        GP.glyph = RIP_GLYPHS[(i * 7 + 3) % 10];
        GP.size = G.size;
        if (u >= this._gord[base + i]) {
          // torn off: thrown along the cut, stretched, gone
          this._gdone[base + i] = 1;
          const v = G.speed[0] + this._rnd() * (G.speed[1] - G.speed[0]);
          GP.vx = g.dx * v;
          GP.vy = g.dy * v + (this._rnd() - 0.5) * 0.4;
          GP.vz = g.dz * v;
          GP.life = G.life[0] + this._rnd() * (G.life[1] - G.life[0]);
          GP.sizeEnd = G.size * 0.5;
          GP.color = G.col;
          GP.colorEnd = G.colEnd;
          GP.alpha = 0.9;
          GP.alphaEnd = 0;
          GP.drag = 1.5;
          GP.stretch = 1.6;
          add.spawn(GP);
          RIP_STAT.torn++;
          continue;
        }
        left++;
        if (!fresh && g.drawn) continue;
        // standing: perfectly still, one copy for this frame
        GP.vx = GP.vy = GP.vz = 0;
        GP.life = life;
        GP.sizeEnd = G.size;
        GP.color = GP.colorEnd = i % 11 === 0 ? G.hi : G.col;
        GP.alpha = GP.alphaEnd = G.alpha;
        GP.drag = 0;
        GP.stretch = 1;
        add.spawn(GP);
      }
      g.drawn = true;
      if (!left) g.alive = false;
    }
  }
}
