// THE FINISHER'S MAGIC: a touch of the sword's green flame on the fresh chain's last cut (`?lights=fresh`,
// hit 5: swings.js / lightsFresh.js `freshSplitter`, combat.js LIGHT[4]). Four looks for the owner to
// pick from, behind `?finisher=a|b|c|d` (default 'a' while the owner picks; the Lab's PLAYER →
// `finisher` row, live). The owner: "a cool special effect of the sword effect diagonal slash that uses
// some magic in a subtle awesome way. give me 4 variations".
//   a  CRESCENT   the cut leaves a thin crescent of marks hanging in the air along the blade's path for
//                 a beat; then it dissolves upward
//   b  RIFT       where the blade meets the ground a thin seam of light runs a few metres on along the
//                 planted blade's line, holds, and closes from the back
//   c  ECHO       two faint ghost blades repeat the same diagonal a split second after it, each fainter
//   d  WAVE       a short crescent of marks leaves the blade as it cuts and flies on 2-3 m along the
//                 cut, thinning as it goes (cosmetic only: no damage, no hitbox)
//
// How it is drawn: as the sword's flame (swordMystic.js, ADR-182), the precedent for the hero's magic: in
// the HERO'S OWN MICRO LETTERS (render/glyphs.js PIXEL_3X3) through a LetterBatch on his atlas and grid,
// in its Matrix green, many tiny faint marks, never a glow, never the fire field, never a colour on the
// screen. Its own random stream and hashes (never Math.random), fixed stores (no allocation a frame), a
// capped count a frame (FIN.cells written, FIN.spawned living), nothing on a dead or hidden hero, and
// nothing at all outside the fresh chain's finisher.

import { LetterBatch } from '../../world/life/letterBatch.js';
import { pixelArtOrder } from '../../render/glyphs.js';
import { LIGHT, lightsMode } from './combat.js';
import { GREEN } from './swordMystic.js';
import { DIM } from './model.js';

const IDS = ['a', 'b', 'c', 'd'];
export const FINISHER_IDS = Object.freeze(IDS.slice());
export const FINISHER_NAMES = Object.freeze({ a: 'crescent', b: 'rift', c: 'echo', d: 'wave' });
/** The clip it rides (lightsFresh.js): the effect plays on no other swing. */
export const FINISHER_CLIP = 'freshSplitter';

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const PICK = { mode: IDS.includes(q('finisher')) ? q('finisher') : 'a' };
/** The look now ('a' | 'b' | 'c' | 'd'). */
export const finisherMode = () => PICK.mode;
/** Lab / tests / the film rig: switch it live; false for an unknown id. */
export function setFinisher(id) {
  const m = String(id);
  if (!IDS.includes(m)) return false;
  PICK.mode = m;
  return true;
}

// its own stream (ADR-122): a look never moves the seeded sims
let fseed = 0x7f4a7c15;
const rnd = () => (fseed = (Math.imul(fseed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);
/** Tests / the film rig: put the stream at `v` (every take of a variation alike). */
export const setFinisherSeed = (v) => (fseed = v >>> 0);
const hash2 = (a, b) => {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The hero's micro letters it prints (their index in PIXEL_3X3). */
const MICRO = { '.': 1, ':': 2, '-': 5, '|': 6, '/': 7, '\\': 8, '+': 12, x: 13, v: 16, A: 18, s: 20, o: 25, B: 26 };
const DUST = '.:+x';
const HOT = 'oB';
export const FINISHER_GLYPHS = Object.freeze(Object.keys(MICRO).join(''));

/** What it may draw, and each look's numbers. Times in s, lengths in m. */
export const FIN = {
  cells: 240, // written marks a frame at most
  spawned: 220, // moving marks alive at most
  perFrame: 80, // moving marks spawned a frame at most
  lift: 0.15, // m drawn toward the camera (with the batch's own soft depth)
  soft: 0.12,
  maxAlpha: 0.82, // no mark brighter than the flame's own hottest (colour x alpha <= 0.9: not a glow)
  // a: the hanging crescent
  crescent: { from: 1.0, rows: [0.7, 0.8, 0.9, 1.0], life: [0.6, 1.0], rise: 1.4, drag: 0.7, drift: 0.04, alpha: 0.8 },
  // b: the rift
  rift: { len: 4.6, speed: 14, hold: 0.22, close: 8, jag: 0.06, tick: 0.5, y: 0.1, lift: 0.35, sparks: 3 },
  // c: the echo
  echo: { delays: [0.16, 0.3], alpha: [0.82, 0.6], f: [0.22, 1.0], trail: 0.012, lines: 6, arc: 4 },
  // d: the wave
  wave: { at: 1.6, back: 6, points: 28, speed: 10, damp: 2.6, life: [0.34, 0.6], dip: 0.2, inner: [0.9, 0.8] },
  minStep: 0.05, // m: the closest two marks of a line are (one of his cells on the screen, at least this)
};

// stores (no allocation a frame)
const NS = 48; // blade samples a swing at most (u 1 → 2 and the follow-through)
const PRJ = { px: 0, py: 0, ok: false };
const V = { x: 0, y: 0, z: 0 };
const L = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, col: 0, color: GREEN.body, colorEnd: GREEN.cool, alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, flicker: 0 };
const C0 = [0, 0, 0];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, s) => {
  for (let i = 0; i < 3; i++) C0[i] = a[i] + (b[i] - a[i]) * s;
  return C0;
};

export class FinisherFx {
  constructor(player) {
    this.player = player;
    this.game = player?.game ?? null;
    this.t = 0; // its own clock (fx time)
    this.w = 0; // marks written this frame (tests)
    this.n = 0; // marks spawned this frame (tests)
    this.total = 0; // everything drawn so far (tests)
    this.plays = 0; // finishers it has played (tests)
    /** Tests: called for every mark ('put' | 'spawn', glyph, alpha, colour max x alpha). */
    this.onEmit = null;
    this.lb = null;
    this._lbTried = false;
    this._mcol = null;
    // the swing it is following, and the blade's samples through it (world: forte and drawn point, time)
    this.atk = null;
    this.mode = PICK.mode;
    this.ns = 0;
    this.S = new Float32Array(NS * 7);
    this.lastU = 0;
    this.impact = false;
    // b: the rift (origin, direction, its own clock; -1 = none)
    this.rift = { x: 0, z: 0, dx: 0, dz: 1, t: -1 };
    // d: the wave (its points at launch, the velocity, its own clock; -1 = none)
    this.wave = { t: -1, n: 0, P: new Float32Array(3 * 32 * 3), vx: 0, vy: 0, vz: 0, seed: 0, launched: false };
    // c: the echo plays until this fx time
    this.echoEnd = -1;
    this._lastCres = -1; // a: the last sample it filled from
  }

  /** Back to nothing (a level reset). */
  reset() {
    this.atk = null;
    this.ns = 0;
    this.rift.t = -1;
    this.wave.t = -1;
    this.wave.launched = false;
    this.echoEnd = -1;
    if (this.lb) {
      this.lb.empty();
      this.lb.end();
    }
  }

  /** Busy: a finisher's magic is still on the screen (tests). */
  get busy() {
    return this.rift.t >= 0 || this.wave.t >= 0 || this.echoEnd > this.t || (this.lb?.np ?? 0) > 0 || this.atk !== null;
  }

  /** Per frame (player._updateFx). Nothing at all until the fresh chain's finisher swings. */
  update(dt) {
    this.w = this.n = 0;
    const P = this.player, g = this.game;
    if (!P) return;
    const fdt = Math.max(Number.isFinite(g?.fxDt) ? g.fxDt : 0, Number.isFinite(dt) ? dt : 0);
    const a = P.atk, d = a?.def;
    const mine = !!d && d === LIGHT[4] && P.state === 'attack' && lightsMode() === 'fresh' && P.anim?.atkDef === d && P.anim?.atkAnim?.clip === FINISHER_CLIP;
    const dead = !P.alive || P.state === 'dead' || P.object3d?.visible === false;
    if (dead) {
      if (this.lb?.count || this.lb?.np) this.reset();
      this.atk = null;
      return;
    }
    // a new finisher: start following it (its look is fixed for the swing)
    if (mine && a !== this.atk) {
      this.atk = a;
      this.mode = PICK.mode;
      this.ns = 0;
      this.lastU = 0;
      this.impact = false;
      this.wave.launched = false;
      this.plays++;
    } else if (!mine) this.atk = null;
    if (!this.atk && !this.busy && !this.lb) return; // (never swung: nothing built, nothing drawn)
    if (!(fdt > 0)) return;
    this.t += fdt;
    const lb = this._letters();
    if (!lb) return;
    lb.begin();
    try {
      if (this.atk) this._follow(this.atk, d);
      this._camera();
      const m = this.mode;
      if (m === 'a') this._crescent();
      else if (m === 'b') this._rift(fdt);
      else if (m === 'c') this._echo();
      else if (m === 'd') this._wave(fdt);
    } catch (err) {
      console.error('[finisherFx]', err);
    }
    lb.flow(fdt, this.t);
    lb.end();
    if (!this.atk && !lb.np && this.rift.t < 0 && this.wave.t < 0 && !(this.echoEnd > this.t) && lb.count) {
      lb.empty();
      lb.end();
    }
  }

  // ------------------------------------------------------------------ following the swing
  /** The blade's forte and drawn point (world) this frame, stored with the fx time, from the coil to a
   *  little past the cut; the impact (player.js sets atk.impact as the blade meets the ground). */
  _follow(a, d) {
    const W = d.windup, Ac = d.active, R0 = d.recovery, t = a.t;
    const u = t < W ? t / W : t < W + Ac ? 1 + (t - W) / Ac : 2 + (t - W - Ac) / R0;
    this.lastU = u;
    const e = this.player.rig?.sword?.matrixWorld?.elements;
    if (e && u >= 1 && u <= 2.15 && this.ns < NS) {
      const z0 = DIM.forte, z1 = DIM.drawnTip ?? DIM.steelTip, k = this.ns * 7, S = this.S;
      S[k] = e[8] * z0 + e[12];
      S[k + 1] = e[9] * z0 + e[13];
      S[k + 2] = e[10] * z0 + e[14];
      S[k + 3] = e[8] * z1 + e[12];
      S[k + 4] = e[9] * z1 + e[13];
      S[k + 5] = e[10] * z1 + e[14];
      S[k + 6] = this.t;
      if (Number.isFinite(S[k] + S[k + 1] + S[k + 2] + S[k + 3] + S[k + 4] + S[k + 5])) this.ns++;
    }
    if (a.impact && !this.impact) {
      this.impact = true;
      this._onImpact();
    }
    if (this.mode === 'd' && !this.wave.launched && u >= FIN.wave.at && this.ns >= 3) {
      this.wave.launched = true;
      this._launchWave();
    }
    if (this.mode === 'c' && this.ns > 1) this.echoEnd = this.S[(this.ns - 1) * 7 + 6] + FIN.echo.delays[1] + 0.05;
  }

  _onImpact() {
    if (this.mode !== 'b' || this.ns < 1) return;
    // the rift runs on along the planted blade's line, from where its point went in
    const k = (this.ns - 1) * 7, S = this.S;
    let dx = S[k + 3] - S[k], dz = S[k + 5] - S[k + 2];
    const l = Math.hypot(dx, dz);
    const yaw = this.player.yaw ?? 0;
    if (l < 0.05) {
      dx = Math.sin(yaw);
      dz = Math.cos(yaw);
    } else {
      dx /= l;
      dz /= l;
    }
    const Rf = this.rift;
    Rf.x = S[k + 3];
    Rf.z = S[k + 5];
    Rf.dx = dx;
    Rf.dz = dz;
    Rf.t = 0;
  }

  // ------------------------------------------------------------------ drawing helpers
  _letters() {
    if (this.lb || this._lbTried) return this.lb;
    this._lbTried = true;
    const g = this.game, mr = Math.random;
    try {
      Math.random = rnd;
      const lb = new LetterBatch(g, FIN.cells + FIN.spawned, '|', { spawned: FIN.spawned, snap: 1, rand: rnd });
      const order = pixelArtOrder();
      this._mcol = {};
      for (const k in MICRO) this._mcol[k] = order[MICRO[k]] ?? 0;
      // the hero's atlas and cell (as the sword's flame: his letters, his grid)
      lb._sync = () => {
        const Pl = g?.pipeline, art = Pl?.heroArt, c = Pl?.heroCell, U = lb.uniforms;
        if (c?.x > 0 && c?.y > 0) U.uCell.value.set(c.x, c.y);
        if (art?.texture && U.tArt.value !== art.texture) {
          U.tArt.value = art.texture;
          U.uCols.value = art.cols;
        }
      };
      if (lb.uniforms?.uSoft) lb.uniforms.uSoft.value = FIN.soft;
      this.lb = lb;
      g?.pipeline?.registerParticles?.(lb);
    } catch (err) {
      console.error('[finisherFx] letters', err);
      this.lb = null;
    } finally {
      Math.random = mr;
    }
    return this.lb;
  }

  _camera() {
    const cam = this.game?.camera?.matrixWorld?.elements;
    this._cx = cam ? cam[8] * FIN.lift : 0;
    this._cy = cam ? cam[9] * FIN.lift : 0;
    this._cz = cam ? cam[10] * FIN.lift : 0;
  }

  /** World point → screen px (y up) in PRJ; false behind the camera or with no frame size. */
  _proj(x, y, z) {
    const g = this.game, cam = g?.camera, pl = g?.pipeline;
    const m = cam?.matrixWorldInverse?.elements, pe = cam?.projectionMatrix?.elements;
    const W = pl?.width > 8 ? pl.width : 1280, H = pl?.height > 8 ? pl.height : 720;
    PRJ.ok = false;
    if (!m || !pe || !(pe[5] > 0)) return false;
    const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
    if (!(vz > 0.2)) return false;
    PRJ.px = (((vx * pe[0]) / vz) * 0.5 + 0.5) * W;
    PRJ.py = (((vy * pe[5]) / vz) * 0.5 + 0.5) * H;
    PRJ.ok = Number.isFinite(PRJ.px + PRJ.py);
    return PRJ.ok;
  }

  /** One of his cells on the screen, in metres, at a world point (the marks of a line are this far apart:
   *  one a cell, as the flame's). */
  _cellM(x, y, z) {
    const g = this.game, pe = g?.camera?.projectionMatrix?.elements, pl = g?.pipeline;
    const H = pl?.height > 8 ? pl.height : 720, cw = pl?.heroCell?.x > 0 ? pl.heroCell.x : 4;
    const m = g?.camera?.matrixWorldInverse?.elements;
    if (!m || !pe || !(pe[5] > 0)) return 0.1;
    const vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
    if (!(vz > 0.2)) return 0.1;
    return Math.max(FIN.minStep, (cw * 2 * vz) / (H * pe[5]));
  }

  /** The stroke that runs along the screen direction from (x0,y0,z0) to (x1,y1,z1): - / | \ . */
  _stroke(x0, y0, z0, x1, y1, z1) {
    if (!this._proj(x0, y0, z0)) return '/';
    const ax = PRJ.px, ay = PRJ.py;
    if (!this._proj(x1, y1, z1)) return '/';
    let ang = (Math.atan2(PRJ.py - ay, PRJ.px - ax) * 180) / Math.PI;
    if (ang < 0) ang += 180;
    return ang < 22.5 || ang >= 157.5 ? '-' : ang < 67.5 ? '/' : ang < 112.5 ? '|' : '\\';
  }

  /** One written mark (drawn toward the camera), alpha capped. */
  _put(x, y, z, ch, c, a) {
    if (this.w >= FIN.cells || !(y > 0.02)) return;
    const al = Math.min(FIN.maxAlpha, a);
    if (!(al > 0.004) || !Number.isFinite(x + y + z)) return;
    this.lb.put(x + this._cx, y + this._cy, z + this._cz, 0, this._mcol?.[ch] ?? 0, 0, c, al);
    this.w++;
    this.total++;
    this.onEmit?.('put', ch, al, Math.max(c[0], c[1], c[2]) * al);
  }

  /** One moving mark (L filled by the caller). */
  _spawn(ch) {
    if (this.n >= FIN.perFrame || !(L.y > 0.02) || !Number.isFinite(L.x + L.y + L.z)) return;
    L.alpha = Math.min(FIN.maxAlpha, L.alpha);
    L.col = this._mcol?.[ch] ?? 0;
    L.x += this._cx;
    L.y += this._cy;
    L.z += this._cz;
    if (!this.lb.spawn(L)) return;
    this.n++;
    this.total++;
    this.onEmit?.('spawn', ch, L.alpha, Math.max(L.color[0], L.color[1], L.color[2]) * L.alpha);
  }

  /** A point f (0 forte … 1 drawn point) along blade sample i → V. */
  _at(i, f) {
    const S = this.S, k = i * 7;
    V.x = S[k] + (S[k + 3] - S[k]) * f;
    V.y = S[k + 1] + (S[k + 4] - S[k + 1]) * f;
    V.z = S[k + 2] + (S[k + 5] - S[k + 2]) * f;
    return V;
  }

  // ------------------------------------------------------------------ a: the hanging crescent
  /** Each frame of the cut, the outer blade's swept band since the last frame is filled, one mark a cell
   *  along each of a few rows (a thin crescent); the marks hang where they were left, then rise ever
   *  faster and fade: the crescent dissolves upward. */
  _crescent() {
    const C = FIN.crescent, ns = this.ns;
    if (!this.atk || this.lastU < C.from || this.lastU > 2.05 || ns < 2 || this._lastCres === ns) return;
    this._lastCres = ns;
    const W = this.game?.world?.life?.wind;
    let wx = 0, wz = 0;
    if (W && typeof W.at === 'function') {
      const o = W.at(this.player.position.x, this.player.position.z, V);
      if (o && Number.isFinite(o.x + o.z)) {
        wx = o.x;
        wz = o.z;
      }
    }
    for (let r = 0; r < C.rows.length; r++) {
      const f = C.rows[r];
      const ax = this._at(ns - 2, f).x, ay = V.y, az = V.z;
      const bx = this._at(ns - 1, f).x, by = V.y, bz = V.z;
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      const step = this._cellM(bx, by, bz);
      if (!(len > 0.01)) continue; // (a frozen frame: the hit-stop)
      const n = Math.min(20, Math.max(1, Math.round(len / step)));
      const ch0 = this._stroke(ax, ay, az, bx, by, bz);
      for (let k = 0; k < n; k++) {
        const s = (k + rnd()) / n;
        L.x = ax + (bx - ax) * s;
        L.y = ay + (by - ay) * s;
        L.z = az + (bz - az) * s;
        L.vx = wx * C.drift + R(-0.03, 0.03);
        L.vy = R(0, 0.04);
        L.vz = wz * C.drift + R(-0.03, 0.03);
        L.life = R(C.life[0], C.life[1]) * (0.8 + 0.2 * f);
        L.gravity = C.rise;
        L.drag = C.drag;
        L.flicker = 0.2;
        const edge = r === C.rows.length - 1, hot = edge && rnd() < 0.18;
        L.color = hot ? GREEN.hot : edge ? GREEN.body : GREEN.cool;
        L.colorEnd = GREEN.cool;
        L.alpha = hot ? 0.82 : C.alpha * (edge ? 1 : 0.7) * R(0.75, 1);
        L.alphaEnd = 0;
        this._spawn(hot ? HOT[Math.floor(rnd() * HOT.length)] : edge || rnd() < 0.5 ? ch0 : DUST[Math.floor(rnd() * DUST.length)]);
      }
    }
  }

  // ------------------------------------------------------------------ b: the rift
  /** From where the point went in, a seam runs on along the blade's line at `speed`, holds, and closes
   *  from the back; a thin jagged line of strokes with a pale head, a few flecks rising off the head. */
  _rift(fdt) {
    const Rf = this.rift, C = FIN.rift;
    if (Rf.t < 0) return;
    Rf.t += fdt;
    const run = C.len / C.speed, end = run + C.hold + C.len / C.close;
    if (Rf.t >= end) {
      Rf.t = -1;
      return;
    }
    const front = Math.min(C.len, Rf.t * C.speed);
    const back = Rf.t > run + C.hold ? Math.min(front, (Rf.t - run - C.hold) * C.close) : 0;
    const px = -Rf.dz, pz = Rf.dx; // across the seam
    const step = this._cellM(Rf.x, C.y, Rf.z), n = Math.floor(front / step);
    const lx = this._cx, ly = this._cy, lz = this._cz, k2 = C.lift / FIN.lift;
    this._cx *= k2;
    this._cy *= k2;
    this._cz *= k2;
    const fade = Rf.t > run + C.hold ? 1 - 0.5 * clamp01((Rf.t - run - C.hold) / (C.len / C.close)) : 1;
    for (let i = 0; i <= n; i++) {
      const s = i * step;
      if (s < back) continue;
      const j = (hash2(i, 31) - 0.5) * 2 * C.jag * (0.4 + s / C.len);
      const x = Rf.x + Rf.dx * s + px * j, z = Rf.z + Rf.dz * s + pz * j;
      const x1 = Rf.x + Rf.dx * (s + step) + px * (hash2(i + 1, 31) - 0.5) * 2 * C.jag, z1 = Rf.z + Rf.dz * (s + step) + pz * (hash2(i + 1, 31) - 0.5) * 2 * C.jag;
      const head = front - s; // m behind the running head
      const hot = head < 0.3 && front < C.len;
      const ch = hot ? (head < 0.12 ? 'B' : 'o') : this._stroke(x, C.y, z, x1, C.y, z1);
      const tail = clamp01((s - back) / 0.6);
      const c = hot ? GREEN.hot : mix(GREEN.cool, GREEN.body, clamp01(1 - head / C.len + 0.35));
      this._put(x, C.y, z, ch, c, (hot ? 0.82 : 0.62) * fade * (0.45 + 0.55 * tail));
      // a tick across it here and there (the seam is torn, not ruled)
      if (hash2(i, 77) < C.tick) {
        const side = hash2(i, 78) < 0.5 ? -1 : 1;
        this._put(x + px * side * step, C.y, z + pz * side * step, ':', GREEN.cool, 0.45 * fade * tail);
      }
    }
    this._cx = lx;
    this._cy = ly;
    this._cz = lz;
    // flecks rising off the running head
    if (front < C.len) {
      for (let k = 0; k < C.sparks; k++) {
        L.x = Rf.x + Rf.dx * front + px * R(-0.08, 0.08);
        L.y = C.y + 0.03;
        L.z = Rf.z + Rf.dz * front + pz * R(-0.08, 0.08);
        L.vx = R(-0.1, 0.1);
        L.vy = R(0.6, 1.2);
        L.vz = R(-0.1, 0.1);
        L.life = R(0.22, 0.4);
        L.gravity = 0;
        L.drag = 1.5;
        L.flicker = 0.3;
        L.color = GREEN.body;
        L.colorEnd = GREEN.cool;
        L.alpha = 0.7;
        L.alphaEnd = 0;
        this._spawn(rnd() < 0.5 ? '|' : '.');
      }
    }
  }

  // ------------------------------------------------------------------ c: the echo
  /** The blade's own samples replayed `delays` later: each ghost is the outer blade drawn in strokes along
   *  itself, with a fainter line a moment behind it (its swept edge), fading as it ends. */
  _echo() {
    const C = FIN.echo, ns = this.ns, S = this.S;
    if (ns < 2) return;
    const t0 = S[6], t1 = S[(ns - 1) * 7 + 6];
    for (let gi = 0; gi < C.delays.length; gi++) {
      for (let tr = 0; tr < C.lines; tr++) {
        const tt = this.t - C.delays[gi] - tr * C.trail;
        if (tt < t0 || tt > t1) continue;
        // the sample pair round tt
        let i = 0;
        while (i < ns - 2 && S[(i + 1) * 7 + 6] < tt) i++;
        const ta = S[i * 7 + 6], tb = S[(i + 1) * 7 + 6], s = tb > ta ? clamp01((tt - ta) / (tb - ta)) : 0;
        const ka = i * 7, kb = (i + 1) * 7;
        const hx = S[ka] + (S[kb] - S[ka]) * s, hy = S[ka + 1] + (S[kb + 1] - S[ka + 1]) * s, hz = S[ka + 2] + (S[kb + 2] - S[ka + 2]) * s;
        const px = S[ka + 3] + (S[kb + 3] - S[ka + 3]) * s, py = S[ka + 4] + (S[kb + 4] - S[ka + 4]) * s, pz = S[ka + 5] + (S[kb + 5] - S[ka + 5]) * s;
        const len = Math.hypot(px - hx, py - hy, pz - hz);
        if (!(len > 0.05)) continue;
        const ch0 = this._stroke(hx, hy, hz, px, py, pz);
        const life = clamp01((t1 - tt) / 0.05 + 0.3); // fading as its replay ends
        const a = C.alpha[gi] * (1 - tr / C.lines) * life;
        const nst = Math.min(40, Math.max(2, Math.floor(((C.f[1] - C.f[0]) * len) / this._cellM(px, py, pz))));
        if (!tr) {
          // the ghost's point drags a short arc of its own last positions
          for (let q = 1; q <= C.arc; q++) {
            const tq = tt - q * 0.012;
            if (tq < t0) break;
            let iq = 0;
            while (iq < ns - 2 && S[(iq + 1) * 7 + 6] < tq) iq++;
            const qa = S[iq * 7 + 6], qb = S[(iq + 1) * 7 + 6], sq = qb > qa ? clamp01((tq - qa) / (qb - qa)) : 0;
            const ca = iq * 7 + 3, cb = (iq + 1) * 7 + 3;
            const x = S[ca] + (S[cb] - S[ca]) * sq, y = S[ca + 1] + (S[cb + 1] - S[ca + 1]) * sq, z = S[ca + 2] + (S[cb + 2] - S[ca + 2]) * sq;
            this._put(x, y, z, q < 2 ? ch0 : ':', GREEN.cool, a * (1 - q / (C.arc + 1)));
          }
        }
        for (let k = 0; k <= nst; k++) {
          const f = C.f[0] + ((C.f[1] - C.f[0]) * k) / nst;
          const x = hx + (px - hx) * f, y = hy + (py - hy) * f, z = hz + (pz - hz) * f;
          const tip = f > 0.92 && !tr;
          this._put(x, y, z, tip ? 'o' : ch0, tip ? GREEN.hot : mix(GREEN.cool, GREEN.body, f), a * (0.55 + 0.45 * f));
        }
      }
    }
  }

  // ------------------------------------------------------------------ d: the wave
  /** As the cut passes his front, the arc its outer blade swept over the last frames leaves it: a short
   *  crescent of marks flying on along the cut (forward and a little down) 2-3 m, each mark going out on
   *  its own beat; a mark that goes leaves a fleck drifting up. */
  _launchWave() {
    const C = FIN.wave, ns = this.ns, Wv = this.wave;
    const i0 = Math.max(0, ns - 1 - C.back), span = ns - 1 - i0;
    if (span < 1) return;
    // three rows along the arc, older → newer: the outer edge whole, the inner ones shorter toward the
    // ends (the crescent tapers); P holds row r's point k at (r * PTS + k)
    const PTS = C.points;
    for (let r = 0; r < 3; r++) {
      const f = r ? C.inner[r - 1] : 1;
      for (let k = 0; k < PTS; k++) {
        const x = (k / (PTS - 1)) * span, i = Math.min(ns - 2, i0 + Math.floor(x)), s = x - Math.floor(x);
        const ax = this._at(i, f).x, ay = V.y, az = V.z;
        this._at(i + 1, f);
        const o = (r * PTS + k) * 3;
        Wv.P[o] = ax + (V.x - ax) * s;
        Wv.P[o + 1] = ay + (V.y - ay) * s;
        Wv.P[o + 2] = az + (V.z - az) * s;
      }
    }
    const yaw = this.player.yaw ?? 0;
    Wv.vx = Math.sin(yaw) * C.speed;
    Wv.vz = Math.cos(yaw) * C.speed;
    Wv.vy = -C.speed * C.dip;
    Wv.n = PTS;
    Wv.t = 0;
    Wv.seed = (fseed >>> 8) & 0xffff;
  }

  _wave(fdt) {
    const C = FIN.wave, Wv = this.wave;
    if (Wv.t < 0) return;
    const was = Wv.t;
    Wv.t += fdt;
    if (Wv.t >= C.life[1]) {
      Wv.t = -1;
      return;
    }
    // travelled so far (an exponential ease: fast off the blade, slowing)
    const go = (1 - Math.exp(-C.damp * Wv.t)) / C.damp;
    const ox = Wv.vx * go, oy = Wv.vy * go, oz = Wv.vz * go;
    const n = Wv.n;
    for (let r = 0; r < 3; r++) {
      // the inner rows are shorter: only their middle (the crescent's belly)
      const cut = r === 0 ? 0 : r === 1 ? 0.18 : 0.32;
      for (let k = 0; k < n; k++) {
        const along = k / Math.max(1, n - 1), mid = 1 - Math.abs(along - 0.5) * 2;
        if (along < cut || along > 1 - cut) continue;
        const o = (r * n + k) * 3;
        const die = (C.life[0] + (C.life[1] - C.life[0]) * hash2(r * 64 + k, Wv.seed | 0)) * (0.7 + 0.3 * mid);
        const x = Wv.P[o] + ox, z = Wv.P[o + 2] + oz, y = Math.max(0.25, Wv.P[o + 1] + oy);
        if (Wv.t >= die) {
          // gone this frame: a fleck drifts up where it was
          if (was < die && r === 0 && k % 2 === 0) {
            L.x = x;
            L.y = y;
            L.z = z;
            L.vx = Wv.vx * 0.08;
            L.vy = R(0.3, 0.6);
            L.vz = Wv.vz * 0.08;
            L.life = R(0.2, 0.35);
            L.gravity = 0;
            L.drag = 2;
            L.flicker = 0.3;
            L.color = GREEN.body;
            L.colorEnd = GREEN.cool;
            L.alpha = 0.55;
            L.alphaEnd = 0;
            this._spawn('.');
          }
          continue;
        }
        const kk = k < n - 1 ? k + 1 : k - 1, q = (r * n + kk) * 3;
        const jx = Wv.P[q] + ox, jy = Math.max(0.25, Wv.P[q + 1] + oy), jz = Wv.P[q + 2] + oz;
        const age = Wv.t / die;
        const hot = r === 0 && mid > 0.6 && age < 0.5;
        const ch = hot ? 'o' : r === 2 ? (hash2(k, 5) < 0.5 ? ':' : '.') : this._stroke(x, y, z, jx, jy, jz);
        const col = hot ? GREEN.hot : r === 0 ? mix(GREEN.body, GREEN.cool, age) : GREEN.cool;
        this._put(x, y, z, ch, col, (r === 0 ? 0.8 : r === 1 ? 0.55 : 0.4) * (1 - age * age) * (0.55 + 0.45 * mid));
      }
    }
  }
}
