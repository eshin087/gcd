// THE BLINK CHAIN'S LAST HIT, DRAWN: its slash lines and its ENDING (hit 5 of `?lights=blink`, combat.js
// LIGHT_BLINK[4]; the three last hits: finishers.js, `?finisher=flurry|delayed|flick`; the four endings
// here, `?ender=blade|array|rift|dragon`, each with any last hit; the Lab's PLAYER → `finisher` and
// `ender` rows). The owner (2026-11-25): "the ending effect should be something that looks really dope
// and stunning ascii art to show off the swords mysterious power".
//
// THE SLASH LINES: where an instant cut passed, a sharp line of the house letter hangs across the target
// (the flurry: five criss-crossing in a blink; the delayed cut: one, a beat after the blade; the flick:
// one), pale as it appears, then green, then it breaks up.
// THE ENDINGS: each a LARGE picture in letters, metres across at the game camera, real ASCII art (a
// silhouette filled with small digits, a brighter outline of strokes, an inner structure), with a
// build-up, a hit and a dissolve, about 1.2 s:
//   blade   a giant phantom sword (pommel, wrapped grip, guard, a fuller down the blade) forms above
//           the target from the pommel down, hangs, drops through it, and crumbles into falling letters
//   array   eight smaller letter-swords snap into a ring round the target, points in, tremble, all
//           strike at once; a star of letters bursts at the middle and they fall apart
//   rift    the slash lines tear open into bright lenses and columns of green letters pour out of them,
//           then the lenses seal and the last of the columns falls away
//   dragon  a serpent of streaming letters (a head with an eye, horns and teeth, a scaled body that
//           tapers) uncoils from the blade along the cut, loops once round the target and scatters
// Anchor: the boss's nearest body point if it is within ENDER.near m ahead, else ENDER.ahead m ahead of
// him at chest height. The pictures are laid out on the screen's own letter grid (the art pass's cell,
// at the anchor's depth, drawn toward the camera by ENDER.lift): every letter sits in a cell, as the
// wyrm's do. Very close to the camera the letters keep their spacing in metres (a sparser grid), so the
// count stays inside the budget.
//
// THE LITTLE EXTRA REACH (gameplay; `strike`, from player.js _slamImpact in place of the slam's shards):
// if the blade did not land, the blade's path through the active frames is extended SPELL.reach m (in
// plan, at the blade's height) and hit-tested once, for the swing's damage. Only the blink chain's last
// hits have it; for them there are no shards, no ground burst and no `player:slam`.
//
// House rules: the house letter (world/life/letterBatch.js on the art pass's font: only letters the font
// has), the sword's green with a pale core (bright, never a background or screen colour, no flash), its
// own random stream and hashes (never Math.random), fixed stores (no allocation a frame), capped counts
// (FIN), nothing on a dead or hidden hero, nothing at all outside the blink chain's last hit.

import * as THREE from 'three';
import { LetterBatch } from '../../world/life/letterBatch.js';
import { LIGHT, REACH, bandHit, lightsMode } from './combat.js';
import { finisherOfClip } from './finishers.js';
import { GREEN } from './swordMystic.js';
import { DIM } from './model.js';

/** The spell's extra reach (m past the blade's hit segment, gameplay metres). */
export const SPELL = { reach: 1.0 };

// ---- the ending switch ------------------------------------------------------------------------------
export const ENDER_IDS = Object.freeze(['blade', 'array', 'rift', 'dragon']);
export const ENDER_NAMES = Object.freeze({ blade: 'phantom blade', array: 'sword array', rift: 'rift', dragon: 'dragon' });
const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const EPICK = { id: ENDER_IDS.includes(q('ender')) ? q('ender') : 'blade' };
/** The ending now. */
export const enderId = () => EPICK.id;
/** Set it (the Lab, the film rig, tests); false for an unknown id. */
export function setEnder(id) {
  const m = String(id);
  if (!ENDER_IDS.includes(m)) return false;
  EPICK.id = m;
  return true;
}

// its own stream (ADR-122): a look never moves the seeded sims
let fseed = 0x7f4a7c15;
const rnd = () => (fseed = (Math.imul(fseed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);
/** Tests / the film rig: put the stream at `v` (every take alike). */
export const setFinisherSeed = (v) => (fseed = v >>> 0);
const hash2 = (a, b) => {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

/** The house letters it prints (all in every art font: render/wyrmGlyphs.js). */
const CHARS = "0123456789.:;'!rivxcsA@-/|\\,`~=*+^o";
export const FINISHER_GLYPHS = CHARS;
const FILL = '0123456789';
const FILL2 = 'icsrxv';
const DUST = ".,'`:;";
const SPARK = '*+^.~';

/** Colours (linear). The sword's green; a pale green-white core where it is hottest. */
const COL = {
  dim: [0.02, 0.42, 0.05], // the body's fill
  body: GREEN.body, // its outline
  pale: [0.62, 1.0, 0.6], // its structure (the fuller, the guard's edge)
  core: [0.86, 1.0, 0.84], // the hottest letters (bloom is welcome there)
  cool: GREEN.cool,
};

/** What it may draw (marks a frame), and each piece's numbers (s, m). */
export const FIN = {
  cells: 2200, // written letters a frame at most
  spawned: 700, // moving letters alive at most
  perFrame: 160, // moving letters spawned a frame at most
  soft: 0.3,
  pitch: [0.135, 0.216], // m: the letter pitch at the game camera (its 5 x 8 px cell at ~37 px a metre)
  lines: { len: 3.4, hot: 0.07, hold: 0.34, fade: 0.22 },
};
export const ENDER = {
  near: 4.2, // m: a boss body point within this ahead is the anchor
  ahead: 2.5, // m ahead of him otherwise, at chest height (y)
  y: 1.35,
  lift: 1.6, // m the picture is drawn toward the camera (in front of the target's body)
  blade: { len: 5.6, hw: 0.7, gw: 1.85, top: 6.1, form: 0.32, hang: 0.12, drop: 0.14, fall: 3.2, crumble: 0.6 },
  array: { n: 8, len: 2.4, hw: 0.24, gw: 0.6, r0: 4.8, r1: 2.7, r2: 0.4, form: 0.34, hold: 0.18, strike: 0.08, after: 0.55 },
  rift: { open: 0.12, pour: 0.62, seal: 0.2, width: 0.95, cols: 1, speed: [6, 11], trail: [6, 16], up: 0.25 },
  dragon: { speed: 21, body: 5.6, r: [0.72, 0.14], loop: 2.5, exit: 3.6, scatter: 0.36, head: [1.35, 0.62] },
};

// ---- stores (no allocation a frame) ------------------------------------------------------------------
const NS = 72; // blade samples a swing at most
const SW = 8; // a sample: the sword's origin (3), its local +z axis in world (3), fx time, phase u
const V = { x: 0, y: 0, z: 0 };
const L = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, col: 0, color: COL.body, colorEnd: COL.cool, alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, flicker: 0 };
const VA = new THREE.Vector3(), VB = new THREE.Vector3(), VC = new THREE.Vector3(), VD = new THREE.Vector3();
const C0 = [0, 0, 0];
const mix = (a, b, s) => {
  for (let i = 0; i < 3; i++) C0[i] = a[i] + (b[i] - a[i]) * s;
  return C0;
};
// the screen frame of the picture: the anchor's screen point, metres a pixel there, the art cell, the
// grid step (cells a letter: 1 at the game camera), the camera's right / up / position
const FR = { ok: false, ax: 0, ay: 0, az: 0, px: 0, py: 0, mpp: 0.027, cw: 5, ch: 8, kx: 1, ky: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, cx: 0, cy: 0, cz: 0, W: 1280, H: 720, lift: 1.6 };
// a cell's shape sample (the rasterizers write it)
const SH = { on: false, ch: '0', c: COL.dim, a: 0 };
// this frame's claimed cells (open addressing, stamped by frame)
const OCC_N = 8192;
const OCC_K = new Int32Array(OCC_N), OCC_S = new Int32Array(OCC_N);
// the slash lines (local, metres on the picture's plane round the anchor): ax ay bx by t0
const LN = new Float32Array(8 * 5);
// the dragon's path: polyline points (local)
const DP = new Float32Array(96 * 2);

const strokeOf = (dx, dy) => {
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang < 0) ang += 180;
  return ang < 22.5 || ang >= 157.5 ? '-' : ang < 67.5 ? '/' : ang < 112.5 ? '|' : '\\';
};
const pick = (set, h) => set[Math.min(set.length - 1, Math.floor(h * set.length))];

export class FinisherFx {
  constructor(player) {
    this.player = player;
    this.game = player?.game ?? null;
    this.t = 0;
    this.w = 0; // letters written this frame (tests)
    this.n = 0; // letters spawned this frame (tests)
    this.total = 0;
    this.plays = 0; // last hits followed (tests)
    this.enders = 0; // endings played (tests)
    this.spellHits = 0;
    this.strikes = 0;
    /** Tests: called for every letter ('put' | 'spawn', glyph, alpha, colour max x alpha). */
    this.onEmit = null;
    this.lb = null;
    this._lbTried = false;
    this.atk = null;
    this.id = null;
    this.ns = 0;
    this.S = new Float32Array(NS * SW);
    this.lastU = 0;
    this.end = -1;
    this.frame = 0;
    // the anchor (world), set as the last hit starts
    this.anc = { set: false, x: 0, y: 0, z: 0 };
    this.nl = 0; // slash lines
    this.ender = { id: null, t0: -1, sparked: false, crumble: false };
    this.arrive = -1; // fx time the ending goes off at
    this.sx = 0; // the blade tip on the picture's plane at the cut (the dragon's start)
    this.sy = 0;
    this._hd = { hx: 0, hy: 0, tx: 1, ty: 0, hl: 0.85, hw: 0.38, fade: 1 };
    this._dpt = -1;
    this._dpn = 0;
    this._pty = 0;
    this._sw = { ox: 0, oy: 0, dx: 0, dy: 1, len: 1, hw: 0.2, gw: 0.5, reveal: 1, glow: 0, edge: 0.1 };
  }

  reset() {
    this.atk = null;
    this.id = null;
    this.ns = 0;
    this.nl = 0;
    this.end = -1;
    this.arrive = -1;
    this.ender.id = null;
    this.anc.set = false;
    if (this.lb) {
      this.lb.empty();
      this.lb.end();
    }
  }

  get busy() {
    return this.atk !== null || this.end > this.t || (this.lb?.np ?? 0) > 0;
  }

  _which(a) {
    const P = this.player, d = a?.def;
    if (!d || d !== LIGHT[4] || lightsMode() !== 'blink' || P.anim?.atkDef !== d) return null;
    return finisherOfClip(P.anim?.atkAnim?.clip);
  }

  update(dt) {
    this.w = this.n = 0;
    const P = this.player, g = this.game;
    if (!P) return;
    const fdt = Math.max(Number.isFinite(g?.fxDt) ? g.fxDt : 0, Number.isFinite(dt) ? dt : 0);
    const dead = !P.alive || P.state === 'dead' || P.object3d?.visible === false;
    if (dead) {
      if (this.lb?.count || this.lb?.np || this.atk || this.end > this.t) this.reset();
      return;
    }
    const a = P.atk, id = P.state === 'attack' ? this._which(a) : null;
    if (id && a !== this.atk) this._start(a, id);
    else if (!id) this.atk = null;
    if (!this.lb && !this.atk) return; // (never swung: nothing built, nothing drawn)
    if (!(fdt > 0)) return;
    this.t += fdt;
    this.frame++;
    const lb = this._letters();
    if (!lb) return;
    lb.begin();
    try {
      if (this.atk) this._follow(this.atk);
      if (this.anc.set && this._frame()) {
        this._lines();
        if (this.arrive >= 0 && this.t >= this.arrive && !this.ender.id) this._goOff();
        const E = this.ender;
        if (E.id) {
          const t = this.t - E.t0;
          if (E.id === 'blade') this._blade(t);
          else if (E.id === 'array') this._array(t);
          else if (E.id === 'rift') this._rift(t);
          else if (E.id === 'dragon') this._dragon(t);
        }
      }
    } catch (err) {
      console.error('[finisherFx]', err);
    }
    lb.flow(fdt, this.t);
    lb.end();
  }

  _start(a, id) {
    this.atk = a;
    this.id = id;
    this.ns = 0;
    this.nl = 0;
    this.lastU = 0;
    this.arrive = -1;
    this.ender.id = null;
    this.end = this.t + 3.5;
    this.plays++;
    this._anchor();
  }

  /** The boss's nearest body point within ENDER.near ahead, else a point ENDER.ahead ahead at chest height. */
  _anchor() {
    const P = this.player, A = this.anc, p = P.position, yaw = P.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best = Infinity;
    const hs = this.game?.dragon?.hurtSpheres;
    if (Array.isArray(hs)) {
      for (let i = 0; i < hs.length; i++) {
        const h = hs[i];
        if (!h || !Number.isFinite(h.x + h.y + h.z)) continue;
        const dx = h.x - p.x, dz = h.z - p.z, ahead = dx * fx + dz * fz, d = Math.hypot(dx, dz) - (h.r || 0);
        if (ahead <= 0 || d > ENDER.near || d >= best) continue;
        best = d;
        A.x = h.x;
        A.y = Math.min(h.y, 2.4);
        A.z = h.z;
      }
    }
    if (!(best < Infinity)) {
      A.x = p.x + fx * ENDER.ahead;
      A.y = p.y + ENDER.y;
      A.z = p.z + fz * ENDER.ahead;
    }
    A.set = true;
  }

  // ------------------------------------------------------------------ following the swing
  _follow(a) {
    const d = a.def, W = d.windup, Ac = d.active, R0 = d.recovery, t = a.t;
    const u = t < W ? t / W : t < W + Ac ? 1 + (t - W) / Ac : 2 + (t - W - Ac) / R0;
    const was = this.lastU;
    this.lastU = u;
    const e = this.player.rig?.sword?.matrixWorld?.elements;
    if (e && u <= 2.2 && this.ns < NS) {
      const k = this.ns * SW, S = this.S;
      S[k] = e[12];
      S[k + 1] = e[13];
      S[k + 2] = e[14];
      S[k + 3] = e[8];
      S[k + 4] = e[9];
      S[k + 5] = e[10];
      S[k + 6] = this.t;
      S[k + 7] = u;
      let ok = true;
      for (let i = 0; i < 6; i++) ok &&= Number.isFinite(S[k + i]);
      if (ok) this.ns++;
    }
    // the last hit's slash lines (angles in degrees on the picture; they cross the anchor) and when the
    // ending goes off
    const at = (uu) => was < uu && u >= uu;
    if (this.id === 'flurry') {
      if (at(1.06)) this._line(28, 0, 0.1);
      if (at(1.17)) this._line(-38, 0.15, -0.12);
      if (at(1.28)) this._line(-4, -0.1, 0.18);
      if (at(1.4)) this._line(64, 0.08, -0.05);
      if (at(1.62)) this._line(-62, -0.05, 0);
      if (at(1.66)) this.arrive = this.t + 0.02;
    } else if (this.id === 'delayed') {
      if (at(2.0)) this.arrive = this.t + 0.16; // (a beat after the blade: the cut "arrives")
    } else if (this.id === 'flick') {
      if (at(1.3)) this._line(-34, 0, 0, 1.1);
      if (at(1.75)) this.arrive = this.t + 0.02;
    }
  }

  /** A slash line through the anchor (offset ox, oy m) at `deg`, now. */
  _line(deg, ox, oy, k = 1) {
    if (this.nl >= 8) return;
    const h = (FIN.lines.len * k) / 2, r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), o = this.nl * 5;
    LN[o] = ox - c * h;
    LN[o + 1] = oy - s * h;
    LN[o + 2] = ox + c * h;
    LN[o + 3] = oy + s * h;
    LN[o + 4] = this.t;
    this.nl++;
  }

  _goOff() {
    const E = this.ender;
    this.arrive = -1; // (once a swing)
    E.id = EPICK.id;
    E.t0 = this.t;
    E.sparked = false;
    E.crumble = false;
    this.enders++;
    this.end = this.t + 1.8;
    if (this.id === 'delayed') this._line(26, 0, 0, 1.25); // (the delayed cut's line opens as it arrives)
    // the blade's point on the picture's plane, for the dragon's start
    if (this.ns > 0) {
      this._at(this.ns - 1, DIM.drawnTip ?? DIM.steelTip);
      this._local(V.x, V.y, V.z);
      this.sx = V.x;
      this.sy = V.y;
    }
  }

  _at(i, z) {
    const S = this.S, k = i * SW;
    V.x = S[k] + S[k + 3] * z;
    V.y = S[k + 1] + S[k + 4] * z;
    V.z = S[k + 2] + S[k + 5] * z;
    return V;
  }

  // ------------------------------------------------------------------ the spell's reach (gameplay)
  /** player.js _slamImpact as hit 5 ends its active frames: a blink last hit takes the impact over from
   *  the slam's shards (false: the shards as before, for anything else). If the blade did not land, its
   *  path through the active frames is extended SPELL.reach m past the hit segment (in plan, at the
   *  blade's height) and hit-tested once. */
  strike(a) {
    const id = this._which(a);
    if (!id) return false;
    this.strikes++;
    const P = this.player, g = this.game, d = a.def;
    g?.shake?.(fin(d.shake, 0.3) * 0.3);
    if (a.hit) return true;
    const dr = g?.dragon;
    if (!dr || typeof dr.takeHit !== 'function' || dr.state === 'dead' || dr.state === 'dying') return true;
    const spheres = dr.hurtSpheres;
    if (!Array.isArray(spheres) || !spheres.length || this.ns < 2) return true;
    const z0 = DIM.bladeTip + REACH.tipExt, z1 = z0 + SPELL.reach, up = fin(d.up, REACH.up);
    for (let i = 1; i < this.ns; i++) {
      const u0 = this.S[(i - 1) * SW + 7], u1 = this.S[i * SW + 7];
      if (u1 < 1 || u0 > 2.0) continue;
      for (let s = 1; s <= 3; s++) {
        const f = s / 3;
        this._at(i - 1, z0);
        VA.set(V.x, V.y, V.z);
        this._at(i, z0);
        VA.lerp(VC.set(V.x, V.y, V.z), f);
        this._at(i - 1, z1);
        VB.set(V.x, V.y, V.z);
        this._at(i, z1);
        VB.lerp(VD.set(V.x, V.y, V.z), f);
        P.unlean?.(VA);
        P.unlean?.(VB);
        VB.y = VA.y; // (further ahead, never higher than the blade)
        if (bandHit(spheres, VA.x, VA.y, VA.z, VB.x, VB.y, VB.z, REACH.radius, up, REACH.down, P._hit) > 0) {
          this.spellHits++;
          P._applyHit(a, P._hit, true);
          return true;
        }
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ the letters and the grid
  _letters() {
    if (this.lb || this._lbTried) return this.lb;
    this._lbTried = true;
    const g = this.game, mr = Math.random;
    try {
      Math.random = rnd;
      const lb = new LetterBatch(g, FIN.cells + FIN.spawned, CHARS, { spawned: FIN.spawned, snap: 1, rand: rnd });
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

  /** The picture's screen frame at the anchor (FR); false when it cannot be placed. */
  _frame() {
    const g = this.game, cam = g?.camera, pl = g?.pipeline, A = this.anc;
    const m = cam?.matrixWorldInverse?.elements, pe = cam?.projectionMatrix?.elements, cp = cam?.matrixWorld?.elements;
    FR.ok = false;
    if (!m || !pe || !cp || !(pe[5] > 0)) return false;
    const W = pl?.width > 8 ? pl.width : 1280, H = pl?.height > 8 ? pl.height : 720;
    const vx = m[0] * A.x + m[4] * A.y + m[8] * A.z + m[12], vy = m[1] * A.x + m[5] * A.y + m[9] * A.z + m[13], vz = -(m[2] * A.x + m[6] * A.y + m[10] * A.z + m[14]);
    if (!(vz > 0.5)) return false;
    FR.W = W;
    FR.H = H;
    FR.px = (((vx * pe[0]) / vz) * 0.5 + 0.5) * W;
    FR.py = (((vy * pe[5]) / vz) * 0.5 + 0.5) * H;
    FR.mpp = (2 * vz) / (H * pe[5]);
    FR.cw = pl?.artCell?.x > 0 ? pl.artCell.x : 5;
    FR.ch = pl?.artCell?.y > 0 ? pl.artCell.y : 8;
    FR.kx = Math.max(1, Math.round(FIN.pitch[0] / (FR.cw * FR.mpp)));
    FR.ky = Math.max(1, Math.round(FIN.pitch[1] / (FR.ch * FR.mpp)));
    FR.ax = A.x;
    FR.ay = A.y;
    FR.az = A.z;
    FR.rx = cp[0];
    FR.ry = cp[1];
    FR.rz = cp[2];
    FR.ux = cp[4];
    FR.uy = cp[5];
    FR.uz = cp[6];
    FR.cx = cp[12];
    FR.cy = cp[13];
    FR.cz = cp[14];
    FR.lift = Math.min(ENDER.lift, vz * 0.6);
    FR.ok = Number.isFinite(FR.px + FR.py + FR.mpp);
    return FR.ok;
  }

  /** A world point → its place on the picture's plane (metres right / up of the anchor) → V. */
  _local(x, y, z) {
    const dx = x - FR.ax, dy = y - FR.ay, dz = z - FR.az;
    V.x = dx * FR.rx + dy * FR.ry + dz * FR.rz;
    V.y = dx * FR.ux + dy * FR.uy + dz * FR.uz;
    return V;
  }

  /** Claim grid cell (ci, cj) for this frame; false when a letter is there already. */
  _claim(ci, cj) {
    const key = (ci * 73856093) ^ (cj * 19349663);
    let h = (key >>> 0) % OCC_N;
    for (let n = 0; n < 64; n++) {
      if (OCC_S[h] !== this.frame) {
        OCC_S[h] = this.frame;
        OCC_K[h] = key;
        return true;
      }
      if (OCC_K[h] === key) return false;
      h = (h + 1) % OCC_N;
    }
    return false;
  }

  /** One letter in grid cell (ci, cj) (cell units of the art pass), colour c, alpha a. */
  _cell(ci, cj, ch, c, a) {
    if (this.w >= FIN.cells || !(a > 0.01) || !this._claim(ci, cj)) return;
    const lx = ((ci + 0.5) * FR.cw - FR.px) * FR.mpp, ly = ((cj + 0.5) * FR.ch - FR.py) * FR.mpp;
    let x = FR.ax + FR.rx * lx + FR.ux * ly, y = FR.ay + FR.ry * lx + FR.uy * ly, z = FR.az + FR.rz * lx + FR.uz * ly;
    // toward the camera along its own ray (it stays in its cell)
    const dx = x - FR.cx, dy = y - FR.cy, dz = z - FR.cz, dl = Math.hypot(dx, dy, dz) || 1, k = 1 - FR.lift / dl;
    x = FR.cx + dx * k;
    y = FR.cy + dy * k;
    z = FR.cz + dz * k;
    if (!Number.isFinite(x + y + z)) return;
    const al = Math.min(1, a);
    this.lb.put(x, y, z, 0, this.lb.col(ch), 0, c, al);
    this.w++;
    this.total++;
    this.onEmit?.('put', ch, al, Math.max(c[0], c[1], c[2]) * al);
  }

  /** The grid cell of local point (lx, ly) → [ci, cj] in V.x, V.y (snapped to the letter step). */
  _cellOf(lx, ly) {
    V.x = Math.floor((FR.px + lx / FR.mpp) / FR.cw / FR.kx) * FR.kx;
    V.y = Math.floor((FR.py + ly / FR.mpp) / FR.ch / FR.ky) * FR.ky;
    return V;
  }

  /** A moving letter from a grid cell's world point (drawn toward the camera), velocity in metres on
   *  the picture's plane (right, up). */
  _spawnAt(lx, ly, vr, vu, life, ch, c0, a) {
    if (this.n >= FIN.perFrame) return;
    let x = FR.ax + FR.rx * lx + FR.ux * ly, y = FR.ay + FR.ry * lx + FR.uy * ly, z = FR.az + FR.rz * lx + FR.uz * ly;
    const dx = x - FR.cx, dy = y - FR.cy, dz = z - FR.cz, dl = Math.hypot(dx, dy, dz) || 1, k = 1 - FR.lift / dl;
    x = FR.cx + dx * k;
    y = FR.cy + dy * k;
    z = FR.cz + dz * k;
    L.x = x;
    L.y = y;
    L.z = z;
    L.vx = FR.rx * vr + FR.ux * vu;
    L.vy = FR.ry * vr + FR.uy * vu;
    L.vz = FR.rz * vr + FR.uz * vu;
    L.life = life;
    L.gravity = 0;
    L.drag = 1.2;
    L.flicker = 0.25;
    L.color = c0;
    L.colorEnd = COL.cool;
    L.alpha = Math.min(1, a);
    L.alphaEnd = 0;
    L.col = this.lb.col(ch);
    if (!Number.isFinite(L.x + L.y + L.z) || !this.lb.spawn(L)) return;
    this.n++;
    this.total++;
    this.onEmit?.('spawn', ch, L.alpha, Math.max(c0[0], c0[1], c0[2]) * L.alpha);
  }

  /** Rasterize a shape (this._shape: a method writing SH for a local point) over the local box: one
   *  letter a grid cell. */
  _raster(x0, y0, x1, y1, shape) {
    const c0 = this._cellOf(x0, y0), ci0 = V.x, cj0 = V.y;
    this._cellOf(x1, y1);
    const ci1 = V.x, cj1 = V.y;
    if ((ci1 - ci0) / FR.kx * ((cj1 - cj0) / FR.ky) > 40000) return;
    for (let cj = cj0; cj <= cj1; cj += FR.ky) {
      const ly = ((cj + 0.5 * FR.ky) * FR.ch - FR.py) * FR.mpp;
      for (let ci = ci0; ci <= ci1; ci += FR.kx) {
        const lx = ((ci + 0.5 * FR.kx) * FR.cw - FR.px) * FR.mpp;
        SH.on = false;
        shape.call(this, lx, ly, ci, cj);
        if (SH.on) this._cell(ci, cj, SH.ch, SH.c, SH.a);
      }
    }
    return c0;
  }

  // ------------------------------------------------------------------ the slash lines
  /** Each line: pale as it appears, then green, held, then breaking up from its ends. One letter a cell
   *  along it, in the stroke that runs its way; a short bright core where it crosses the anchor. */
  _lines() {
    const C = FIN.lines;
    for (let i = 0; i < this.nl; i++) {
      const o = i * 5, age = this.t - LN[o + 4];
      if (age < 0 || age > C.hot + C.hold + C.fade) continue;
      const ax = LN[o], ay = LN[o + 1], bx = LN[o + 2], by = LN[o + 3];
      const ch = strokeOf(bx - ax, by - ay), len = Math.hypot(bx - ax, by - ay);
      const step = Math.min(FR.cw * FR.kx, FR.ch * FR.ky) * FR.mpp * 0.7, n = Math.max(2, Math.ceil(len / step));
      const hot = age < C.hot, gone = clamp01((age - C.hot - C.hold) / C.fade);
      for (let k = 0; k <= n; k++) {
        const s = k / n;
        // it breaks up from the ends as it goes
        if (gone > 0 && Math.abs(s - 0.5) * 2 > 1 - gone + 0.15 * hash2(i, k)) continue;
        const mid = 1 - Math.abs(s - 0.5) * 2;
        this._cellOf(ax + (bx - ax) * s, ay + (by - ay) * s);
        const c = hot ? COL.core : mid > 0.75 ? COL.pale : COL.body;
        this._cell(V.x, V.y, hot && mid > 0.85 ? '@' : ch, c, (hot ? 1 : 0.92) * (0.55 + 0.45 * mid));
      }
    }
  }

  // ------------------------------------------------------------------ a sword in letters
  /** The sword shape at local (lx, ly) for the sword in this._sw: pommel, wrapped grip, guard, blade with
   *  a fuller, a point; outline strokes, digit fill, a pale structure; `reveal` 0..1 from the pommel. */
  _swordAt(lx, ly, ci, cj) {
    const s = this._sw, dx = lx - s.ox, dy = ly - s.oy;
    const u = dx * s.dx + dy * s.dy, v = -dx * s.dy + dy * s.dx, Lt = s.len;
    if (u < 0 || u > Lt || u > s.reveal * Lt) return;
    const av = Math.abs(v), e = s.edge;
    const uP = 0.07 * Lt, uG = 0.21 * Lt, uB = 0.25 * Lt, uT = 0.84 * Lt;
    const ang = Math.atan2(s.dy, s.dx);
    const lit = s.glow;
    const decode = s.reveal < 1 && u > s.reveal * Lt - 0.6; // (fresh letters flicker in)
    if (u < uP) {
      // pommel: a round knot
      const r = 0.5 * uP, cu = u - r;
      if (Math.hypot(cu, v) > r * 1.25) return;
      SH.on = true;
      SH.ch = Math.hypot(cu, v) > r * 0.6 ? 'o' : '@';
      SH.c = COL.pale;
      SH.a = 0.95;
      return;
    }
    if (u < uG) {
      // the grip, wrapped
      const gw = s.hw * 0.42;
      if (av > gw) return;
      SH.on = true;
      if (av > gw - e) {
        SH.ch = strokeOf(Math.cos(ang), Math.sin(ang));
        SH.c = COL.body;
        SH.a = 0.95;
      } else {
        SH.ch = (ci + cj) & 1 ? 'x' : '+';
        SH.c = COL.dim;
        SH.a = 0.85;
      }
      return;
    }
    if (u < uB) {
      // the guard: a bar across, its ends tipped
      if (av > s.gw) return;
      SH.on = true;
      const edgeU = u < uG + e * 0.7 || u > uB - e * 0.7;
      if (av > s.gw - e) {
        SH.ch = '*';
        SH.c = COL.core;
        SH.a = 1;
      } else if (edgeU) {
        SH.ch = strokeOf(-Math.sin(ang), Math.cos(ang));
        SH.c = COL.pale;
        SH.a = 0.95;
      } else {
        SH.ch = '=';
        SH.c = COL.body;
        SH.a = 0.9;
      }
      return;
    }
    // the blade: full width to uT, then tapering to the point
    const hw = u < uT ? s.hw : s.hw * Math.max(0, (Lt - u) / (Lt - uT));
    if (av > hw + e * 0.3) return;
    SH.on = true;
    if (av > hw - e) {
      // the edges: along the blade, or converging to the point
      if (u < uT) SH.ch = strokeOf(Math.cos(ang), Math.sin(ang));
      else {
        const t = s.hw / (Lt - uT), side = v > 0 ? 1 : -1;
        SH.ch = strokeOf(Math.cos(ang) - side * t * Math.sin(ang), Math.sin(ang) + side * t * Math.cos(ang));
      }
      SH.c = lit > 0.5 ? COL.core : COL.body;
      SH.a = 0.95;
      if (u > Lt - e * 1.5) SH.ch = 'v';
    } else if (av < s.hw * 0.18 && u > uB + e && u < uT - e) {
      // the fuller, down the middle
      SH.ch = '!';
      SH.c = lit > 0.2 ? COL.core : COL.pale;
      SH.a = 0.9;
    } else {
      const h = hash2(ci * 7 + cj, Math.floor(this.t * (decode ? 30 : 6)));
      SH.ch = decode ? pick(FILL2, h) : pick(FILL, h);
      SH.c = lit > 0.7 ? mix(COL.body, COL.pale, 0.4) : COL.body;
      SH.a = 0.55 + 0.35 * lit;
    }
  }

  /** Draw a sword: base at (ox, oy) local, pointing (dx, dy), length len, half widths hw (blade), gw
   *  (guard); reveal 0..1; glow 0..1. */
  _sword(ox, oy, dx, dy, len, hw, gw, reveal, glow) {
    const s = this._sw;
    s.ox = ox;
    s.oy = oy;
    s.dx = dx;
    s.dy = dy;
    s.len = len;
    s.hw = hw;
    s.gw = gw;
    s.reveal = reveal;
    s.glow = glow;
    s.edge = Math.max(FR.cw * FR.kx, FR.ch * FR.ky) * FR.mpp * 0.75;
    const ex = dx * len, ey = dy * len, pad = gw + 0.2;
    this._raster(Math.min(ox, ox + ex) - pad, Math.min(oy, oy + ey) - pad, Math.max(ox, ox + ex) + pad, Math.max(oy, oy + ey) + pad, this._swordAt);
  }

  /** A sword's letters thrown off as falling characters (one in `every` cells). */
  _crumbleSword(ox, oy, dx, dy, len, hw, every, fall) {
    const step = Math.max(FR.cw * FR.kx, FR.ch * FR.ky) * FR.mpp;
    for (let u = 0; u <= len; u += step) {
      const w = u < 0.25 * len ? hw * 0.5 : hw;
      for (let v = -w; v <= w; v += step) {
        if (hash2(Math.round(u * 50), Math.round(v * 50)) * every > 1) continue;
        const lx = ox + dx * u - dy * v, ly = oy + dy * u + dx * v;
        this._spawnAt(lx, ly, R(-0.3, 0.3), -R(0.5, fall), R(0.4, 0.75), pick(FILL + DUST, rnd()), rnd() < 0.2 ? COL.pale : COL.body, 0.9);
      }
    }
  }

  /** A burst of sparks from (lx, ly), n of them, speed sp. */
  _burst(lx, ly, n, sp) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + R(-0.2, 0.2), v = sp * R(0.5, 1.2);
      this._spawnAt(lx, ly, Math.cos(a) * v, Math.sin(a) * v, R(0.3, 0.6), pick(SPARK, rnd()), k % 3 ? COL.body : COL.core, 1);
    }
  }

  // ------------------------------------------------------------------ BLADE: the phantom sword
  _blade(t) {
    const C = ENDER.blade, E = this.ender;
    const tForm = C.form, tHang = tForm + C.hang, tDrop = tHang + C.drop, tEnd = tDrop + C.crumble;
    if (t > tEnd + 0.8) {
      E.id = null;
      return;
    }
    // it hangs point down above the target, its point C.top - len above it; then drops C.fall
    const drop = t < tHang ? 0 : t < tDrop ? C.fall * ((t - tHang) / C.drop) ** 2 : C.fall;
    const top = C.top - drop; // the pommel's height over the anchor
    if (t < tDrop + 0.05) {
      const reveal = smooth(t / tForm), glow = t < tForm ? 0.3 : t < tHang ? 0.9 : 1;
      this._sword(0, top, 0, -1, C.len, C.hw, C.gw, reveal, glow);
      return;
    }
    if (!E.sparked) {
      E.sparked = true;
      this._burst(0, 0, 40, 4.5);
      this._crumbleSword(0, top, 0, -1, C.len, C.hw, 2.2, 3.2);
    }
    // what is left of it stands a moment, fading from the pommel down
    const k = (t - tDrop) / C.crumble;
    if (k < 1) this._sword(0, top, 0, -1, C.len * (1 - k * 0.95), C.hw, C.gw, 1, 1 - k);
  }

  // ------------------------------------------------------------------ ARRAY: the ring of swords
  _array(t) {
    const C = ENDER.array, E = this.ender, n = C.n;
    const tStrike = C.form + C.hold, tHit = tStrike + C.strike, tEnd = tHit + C.after;
    if (t > tEnd + 0.6) {
      E.id = null;
      return;
    }
    if (t >= tHit && !E.sparked) {
      E.sparked = true;
      this._burst(0, 0, 56, 5);
    }
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2 + 0.2, dx = -Math.cos(th), dy = -Math.sin(th); // pointing in
      const my = clamp01((t - i * 0.03) / (C.form - n * 0.03 + 0.03));
      if (!(my > 0)) continue;
      let r;
      if (t < C.form) r = C.r0 + (C.r1 - C.r0) * smooth(my);
      else if (t < tStrike) r = C.r1 + 0.04 * Math.sin(t * 70 + i); // (they tremble)
      else if (t < tHit) r = C.r1 + (C.r2 - C.r1) * ((t - tStrike) / C.strike);
      else r = C.r2;
      // the sword's point sits at radius r: its base len further out
      const base = r + C.len;
      const ox = -dx * base, oy = -dy * base;
      if (t < tHit) this._sword(ox, oy, dx, dy, C.len, C.hw, C.gw, t < C.form ? smooth(my * 1.4) : 1, t < C.form ? 0.3 : 0.9);
      else {
        const k = (t - tHit) / C.after;
        if (k < 1 && hash2(i, 3) > k * 0.6) this._sword(ox, oy, dx, dy, C.len * (1 - k * 0.7), C.hw, C.gw, 1, 1 - k);
        if (!E.crumble && i === n - 1) {
          E.crumble = true;
          for (let j = 0; j < n; j++) {
            const tj = (j / n) * Math.PI * 2 + 0.2, ddx = -Math.cos(tj), ddy = -Math.sin(tj), bb = C.r2 + C.len;
            this._crumbleSword(-ddx * bb, -ddy * bb, ddx, ddy, C.len, C.hw, 3, 2.4);
          }
        }
      }
    }
    // the star at the middle as they strike
    if (t >= tHit && t < tHit + 0.14) {
      const s = 1 - (t - tHit) / 0.14;
      for (let a = 0; a < 8; a++) {
        const th = (a / 8) * Math.PI;
        for (let k = -6; k <= 6; k++) {
          const lx = Math.cos(th) * k * 0.14 * (0.6 + s), ly = Math.sin(th) * k * 0.14 * (0.6 + s);
          this._cellOf(lx, ly);
          this._cell(V.x, V.y, k === 0 ? '@' : strokeOf(Math.cos(th), Math.sin(th)), Math.abs(k) < 3 ? COL.core : COL.body, s);
        }
      }
    }
  }

  // ------------------------------------------------------------------ RIFT: the cuts tear open
  _rift(t) {
    const C = ENDER.rift, E = this.ender, tPour = C.open + C.pour, tEnd = tPour + C.seal;
    if (t > tEnd + 0.5) {
      E.id = null;
      return;
    }
    const w = t < C.open ? C.width * smooth(t / C.open) : t < tPour ? C.width : C.width * (1 - smooth((t - tPour) / C.seal));
    const stepX = FR.cw * FR.kx * FR.mpp, stepY = FR.ch * FR.ky * FR.mpp;
    const nl = Math.max(1, this.nl);
    for (let i = 0; i < nl; i++) {
      let ax = -1.6, ay = -0.8, bx = 1.6, by = 0.8;
      if (this.nl) {
        const o = i * 5;
        ax = LN[o];
        ay = LN[o + 1];
        bx = LN[o + 2];
        by = LN[o + 3];
      }
      const len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len, nx = -ty, ny = tx;
      const n = Math.max(4, Math.ceil(len / (stepX * 0.8)));
      const edge = strokeOf(tx, ty);
      // the lens: two edges parting, the light inside
      for (let k = 0; k <= n; k++) {
        const s = k / n, open = w * Math.sin(Math.PI * s) * (0.75 + 0.25 * hash2(i, k));
        const cx = ax + (bx - ax) * s, cy = ay + (by - ay) * s;
        for (let sg = -1; sg <= 1; sg += 2) {
          this._cellOf(cx + nx * open * 0.5 * sg, cy + ny * open * 0.5 * sg);
          this._cell(V.x, V.y, edge, COL.body, 0.95);
        }
        const m = Math.floor(open / stepY);
        for (let j = -m; j <= m; j++) {
          this._cellOf(cx + nx * j * stepY * 0.5, cy + ny * j * stepY * 0.5);
          this._cell(V.x, V.y, pick(FILL, hash2(k * 13 + j, Math.floor(this.t * 24))), Math.abs(j) < m * 0.5 ? COL.core : COL.pale, 0.95);
        }
        // the columns pouring out of it (Matrix rain: a bright head, a fading tail), while it is open
        if (t >= C.open * 0.5 && k % C.cols === 0 && w > 0.05) {
          const h = hash2(i * 97 + k, 5), dir = h < C.up ? 1 : -1;
          const sp = C.speed[0] + (C.speed[1] - C.speed[0]) * hash2(i, k + 9);
          const tr = Math.round(C.trail[0] + (C.trail[1] - C.trail[0]) * hash2(k, i + 3));
          const head = (t - C.open * 0.5) * sp; // m travelled
          const cut = t > tPour ? (t - tPour) * sp : 0; // (sealed: the column's root has left the cut)
          for (let j = 0; j < tr; j++) {
            const d = head - j * stepY;
            if (d < cut || d < 0) continue;
            this._cellOf(cx, cy + dir * d);
            const lead = j === 0;
            this._cell(V.x, V.y, lead ? '@' : pick(FILL + FILL2, hash2(k * 31 + j, Math.floor((this.t + j * 0.05) * 18))), lead ? COL.core : j < 3 ? COL.pale : COL.body, (1 - j / tr) * 0.95);
          }
        }
      }
    }
    if (t >= tPour && !E.sparked) {
      E.sparked = true;
      for (let i = 0; i < nl; i++) {
        const o = i * 5;
        const mx = this.nl ? (LN[o] + LN[o + 2]) / 2 : 0, my = this.nl ? (LN[o + 1] + LN[o + 3]) / 2 : 0;
        this._burst(mx, my, 10, 2.5);
      }
    }
  }

  // ------------------------------------------------------------------ DRAGON: the serpent of letters
  /** Its path (local): from the blade's point along the cut to the target, once round it, out and up. */
  _dragonPath() {
    const C = ENDER.dragon;
    let n = 0;
    const put = (x, y) => {
      if (n >= 96) return;
      DP[n * 2] = x;
      DP[n * 2 + 1] = y;
      n++;
    };
    const sx = Number.isFinite(this.sx) ? this.sx : -2, sy = Number.isFinite(this.sy) ? this.sy : -1.2;
    // in: from the blade's point to the ring's near side
    const a0 = Math.atan2(sy, sx), rr = C.loop;
    for (let k = 0; k <= 10; k++) {
      const s = k / 10;
      put(sx + (Math.cos(a0) * rr - sx) * s, sy + (Math.sin(a0) * rr - sy) * s + Math.sin(Math.PI * s) * 0.4);
    }
    // round the target once
    for (let k = 1; k <= 48; k++) {
      const a = a0 - (k / 48) * Math.PI * 2;
      put(Math.cos(a) * rr * (1 + 0.08 * Math.sin(k * 0.5)), Math.sin(a) * rr);
    }
    // out and up
    for (let k = 1; k <= 14; k++) {
      const s = k / 14;
      put(Math.cos(a0) * rr * (1 - s) + 0.6 * s, Math.sin(a0) * rr * (1 - s) + C.exit * s);
    }
    return n;
  }

  _dragon(t) {
    const C = ENDER.dragon, E = this.ender;
    if (this._dpt !== E.t0) {
      this._dpt = E.t0;
      this._dpn = this._dragonPath();
    }
    const n = this._dpn;
    // the path's length so far at each point (in the same store: computed on the fly)
    let total = 0;
    for (let i = 1; i < n; i++) total += Math.hypot(DP[i * 2] - DP[i * 2 - 2], DP[i * 2 + 1] - DP[i * 2 - 1]);
    const run = total / C.speed, tEnd = run + C.scatter;
    if (t > tEnd + 0.6) {
      E.id = null;
      return;
    }
    const head = Math.min(total + C.body, t * C.speed); // the head's distance along the path
    const scat = t > run ? (t - run) / C.scatter : 0;
    if (scat > 0 && !E.sparked) {
      E.sparked = true;
      // it scatters: the body's letters fly off
      for (let d = 0; d < C.body; d += 0.12) {
        this._pathAt(n, Math.min(total, head - d));
        const lx = V.x, ly = V.y;
        this._spawnAt(lx, ly, R(-3, 3), R(-1, 3.5), R(0.35, 0.7), pick(FILL + SPARK, rnd()), rnd() < 0.3 ? COL.pale : COL.body, 0.95);
      }
    }
    if (scat >= 1) return;
    const fade = 1 - scat;
    const step = Math.min(FR.cw * FR.kx, FR.ch * FR.ky) * FR.mpp;
    // the body: discs along the path behind the head, tapering; scales inside, an outline outside
    for (let d = C.body; d >= 0.15; d -= step * 0.9) {
      const sd = head - d;
      if (sd < 0) continue;
      this._pathAt(n, Math.min(total, sd));
      const cx = V.x, cy = V.y, tx = V.z, ty = this._pty;
      const f = d / C.body, r = (C.r[0] + (C.r[1] - C.r[0]) * f) * (scat > 0 ? 1 - scat * 0.5 : 1);
      const m = Math.ceil(r / step);
      for (let j = -m; j <= m; j++) {
        const off = j * step * 0.9;
        if (Math.abs(off) > r) continue;
        this._cellOf(cx - ty * off, cy + tx * off);
        const rim = Math.abs(off) > r - step;
        const ring = Math.floor(sd / (step * 2.2));
        const ch = rim ? strokeOf(tx, ty) : j === 0 ? (ring & 1 ? '=' : ':') : (ring + j) & 1 ? 'v' : 's';
        this._cell(V.x, V.y, ch, rim ? COL.body : j === 0 ? COL.pale : COL.dim, (rim ? 0.95 : 0.8) * fade * (1 - 0.4 * f));
      }
    }
    // the head: a long skull along the path, an eye, horns swept back, teeth at the jaw
    if (head > 0.2) {
      this._pathAt(n, Math.min(total, head));
      const hx = V.x, hy = V.y, tx = V.z, ty = this._pty;
      const hl = C.head[0], hw = C.head[1];
      const Hd = this._hd;
      Hd.hx = hx;
      Hd.hy = hy;
      Hd.tx = tx;
      Hd.ty = ty;
      Hd.hl = hl;
      Hd.hw = hw;
      Hd.fade = fade;
      const pad = hl + 0.6;
      this._raster(hx - pad, hy - pad, hx + pad, hy + pad, this._headAt);
    }
  }

  /** The dragon's head at local (lx, ly). */
  _headAt(lx, ly, ci, cj) {
    const H = this._hd, dx = lx - H.hx, dy = ly - H.hy;
    const u = dx * H.tx + dy * H.ty, v = -dx * H.ty + dy * H.tx; // u ahead, v across
    // the skull: an egg from u -0.35 (back) to u hl (snout)
    const back = H.hl * 0.4, k = (u + back) / (H.hl + back);
    const step = Math.max(FR.cw * FR.kx, FR.ch * FR.ky) * FR.mpp;
    if (k >= 0 && k <= 1) {
      const w = H.hw * Math.sin(Math.PI * Math.min(1, k * 1.1 + 0.05)) * (1 - 0.45 * k);
      if (Math.abs(v) <= w) {
        SH.on = true;
        const eye = Math.abs(u - H.hl * 0.22) < step * 0.9 && Math.abs(Math.abs(v) - w * 0.45) < step * 0.9 && v > 0;
        if (eye) {
          SH.ch = '@';
          SH.c = COL.core;
          SH.a = 1;
        } else if (Math.abs(v) > w - step) {
          SH.ch = k > 0.7 && v < 0 ? 'v' : strokeOf(H.tx, H.ty); // (teeth along the lower jaw)
          SH.c = COL.body;
          SH.a = H.fade;
        } else {
          SH.ch = pick(FILL, hash2(ci, cj));
          SH.c = COL.pale;
          SH.a = 0.85 * H.fade;
        }
        return;
      }
    }
    // horns: two strokes swept back from the crown
    for (let sg = -1; sg <= 1; sg += 2) {
      const hu = -(u + H.hl * 0.1), hv = v - sg * H.hw * 0.7;
      if (hu > 0 && hu < H.hl * 0.9 && Math.abs(hv - sg * hu * 0.55) < step * 0.7) {
        SH.on = true;
        SH.ch = '^';
        SH.c = COL.pale;
        SH.a = H.fade;
        return;
      }
    }
  }

  /** The point at distance d along the dragon's path → V.x, V.y, its direction → V.z, this._pty. */
  _pathAt(n, d) {
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const x0 = DP[i * 2 - 2], y0 = DP[i * 2 - 1], x1 = DP[i * 2], y1 = DP[i * 2 + 1];
      const l = Math.hypot(x1 - x0, y1 - y0);
      if (acc + l >= d || i === n - 1) {
        const s = l > 1e-6 ? clamp01((d - acc) / l) : 0;
        V.x = x0 + (x1 - x0) * s;
        V.y = y0 + (y1 - y0) * s;
        V.z = l > 1e-6 ? (x1 - x0) / l : 1;
        this._pty = l > 1e-6 ? (y1 - y0) / l : 0;
        return;
      }
      acc += l;
    }
    V.x = DP[0];
    V.y = DP[1];
    V.z = 1;
    this._pty = 0;
  }
}

function fin(v, d) {
  return Number.isFinite(v) ? v : d;
}
