// THE STRIKER'S FINISHER SPELL: the magic on hit 5 of `?lights=striker` (combat.js LIGHT_STRIKER[4]; the
// four clips and the pick: finishers.js, `?finisher=lance|cross|talisman|flash`, the Lab's PLAYER →
// `finisher` row through combat.js setFinisherLook). The owner (2026-11-25): "the finisher needs to be a
// cool like spell effect that isn't overpowered but looks awesome to always see".
//   lance     as the thrust lands, a narrow lance of sword light shoots ~3.6 m on from the point, holds a
//             beat and fades from the hilt end; a few flecks fly off its head
//   cross     the two crossing cuts leave their X hanging in the air, bright; then it bursts into sparks
//   talisman  a seal (a ring with three strokes) is written in the air before him as his free hand
//             traces it; the cut goes through it and it bursts outward
//   flash     a few cold marks gather on the still, coiled blade; the cut leaves a thin line of light
//             hanging where it passed, which then splits apart, its halves drifting up and down
// Each is gone within about a second, so it never tires in every combo.
//
// THE SPELL'S LITTLE EXTRA REACH (gameplay; `strike`, called by player.js _slamImpact in place of the
// slam's shard burst): if the blade itself did not land, the spell hits along the blade's own path
// through the active frames, from the end of the hit segment (combat.js REACH) to SPELL.reach m past it,
// for the swing's damage, once. Only the striker chain's finishers have it, and for them it REPLACES the
// shards (1 m of reach instead of the shards' 1.7 m ring): no shards, no ground burst, no `player:slam`.
//
// How it is drawn: as the sword's flame (swordMystic.js, ADR-182): the HERO'S OWN MICRO LETTERS through a
// LetterBatch on his atlas and grid, in its Matrix green, one mark a cell along a line, never a glow sprite,
// never the fire field, never a colour on the screen. Its own random stream and hashes (never
// Math.random), fixed stores (no allocation a frame), capped counts a frame (FIN), nothing on a dead or
// hidden hero, nothing at all outside the striker chain's finisher.

import * as THREE from 'three';
import { LetterBatch } from '../../world/life/letterBatch.js';
import { pixelArtOrder } from '../../render/glyphs.js';
import { LIGHT, REACH, bandHit, lightsMode } from './combat.js';
import { finisherOfClip } from './finishers.js';
import { GREEN } from './swordMystic.js';
import { DIM } from './model.js';

/** The spell's extra reach (m past the blade's hit segment, gameplay metres). */
export const SPELL = { reach: 1.0 };

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

/** The hero's micro letters it prints (their index in PIXEL_3X3). */
const MICRO = { '.': 1, ':': 2, '-': 5, '|': 6, '/': 7, '\\': 8, '+': 12, x: 13, o: 25, B: 26 };
export const FINISHER_GLYPHS = Object.freeze(Object.keys(MICRO).join(''));

/** What it may draw, and each spell's numbers (times s, lengths m). */
export const FIN = {
  cells: 420, // written marks a frame at most
  spawned: 300, // moving marks alive at most
  perFrame: 120, // moving marks spawned a frame at most
  lift: 0.15, // m drawn toward the camera (with the batch's own soft depth)
  soft: 0.12,
  maxAlpha: 0.88, // colour x alpha <= 0.9: bright, never a glow
  minStep: 0.05, // m: the closest two marks of a line (one of his cells on the screen, at least this)
  lance: { at: 1.62, len: 3.8, speed: 30, hold: 0.2, fade: 10, maxEl: 22, sparks: 16, width: 2 },
  cross: { cuts: [[0.15, 0.56], [1.0, 2.0]], rows: [0.6, 0.7, 0.8, 0.9, 1.0], hang: 0.26, sparks: 0.5 },
  talisman: { r: 0.52, ahead: 0.75, freeze: 1.0, write: [0.1, 0.78], burst: 1.42, sparks: 2 },
  flash: { gather: [0.45, 1.38], sweep: [1.38, 1.95], rows: [0.86, 0.93, 1.0], hang: 0.3, split: 0.36 },
};

// stores (no allocation a frame)
const NS = 72; // blade samples a swing at most
const SW = 8; // per sample: the sword's origin (3), its local +z axis in world (3), fx time, phase u
const PRJ = { px: 0, py: 0, ok: false };
const V = { x: 0, y: 0, z: 0 };
const L = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, col: 0, color: GREEN.body, colorEnd: GREEN.cool, alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, flicker: 0 };
const C0 = [0, 0, 0];
const PM = new Float32Array(24 * 3); // _pathMarks: a line's marks this call
const VA = new THREE.Vector3(), VB = new THREE.Vector3(), VC = new THREE.Vector3(), VD = new THREE.Vector3();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, s) => {
  for (let i = 0; i < 3; i++) C0[i] = a[i] + (b[i] - a[i]) * s;
  return C0;
};
// the seal (talisman): a ring and three strokes, in units of its radius (x right, y up on the camera's plane)
const SEAL = [
  [0.0, 0.78, 0.0, -0.78],
  [-0.62, 0.32, 0.62, 0.32],
  [-0.48, -0.36, 0.48, -0.36],
];

export class FinisherFx {
  constructor(player) {
    this.player = player;
    this.game = player?.game ?? null;
    this.t = 0; // its own clock (fx time)
    this.w = 0; // marks written this frame (tests)
    this.n = 0; // marks spawned this frame (tests)
    this.total = 0; // everything drawn so far (tests)
    this.plays = 0; // finishers it has followed (tests)
    this.spellHits = 0; // hits its reach dealt (tests)
    this.strikes = 0; // finishers whose impact it took over from the shards (tests)
    /** Tests: called for every mark ('put' | 'spawn', glyph, alpha, colour max x alpha). */
    this.onEmit = null;
    this.lb = null;
    this._lbTried = false;
    this._mcol = null;
    this._cx = this._cy = this._cz = 0;
    this.atk = null;
    this.id = null; // the finisher this swing is ('lance' | 'cross' | 'talisman' | 'flash')
    this.ns = 0;
    this.S = new Float32Array(NS * SW);
    this.lastU = 0;
    this.end = -1; // fx time after which the last spell is surely gone
    // per spell
    this.lance = { t: -1, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, sparked: false };
    this.cross = { done: -1, burst: false, cx: 0, cy: 0, cz: 0 };
    this.seal = { set: false, frozen: false, x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, R: 0.4, bursting: false, burst: false };
    this._pch = '/';
    this.flash = { done: -1, split: false };
  }

  /** Back to nothing (a level reset, death). */
  reset() {
    this.atk = null;
    this.id = null;
    this.ns = 0;
    this.end = -1;
    this.lance.t = -1;
    if (this.lb) {
      this.lb.empty();
      this.lb.end();
    }
  }

  /** Busy: a spell is still on the screen (tests). */
  get busy() {
    return this.atk !== null || this.end > this.t || (this.lb?.np ?? 0) > 0;
  }

  /** The striker finisher this attack is, or null. */
  _which(a) {
    const P = this.player, d = a?.def;
    if (!d || d !== LIGHT[4] || lightsMode() !== 'striker' || P.anim?.atkDef !== d) return null;
    return finisherOfClip(P.anim?.atkAnim?.clip);
  }

  /** Per frame (player._updateFx). Nothing at all until a striker finisher swings. */
  update(dt) {
    this.w = this.n = 0;
    const P = this.player, g = this.game;
    if (!P) return;
    const fdt = Math.max(Number.isFinite(g?.fxDt) ? g.fxDt : 0, Number.isFinite(dt) ? dt : 0);
    const dead = !P.alive || P.state === 'dead' || P.object3d?.visible === false;
    if (dead) {
      if (this.lb?.count || this.lb?.np || this.atk) this.reset();
      return;
    }
    const a = P.atk, id = P.state === 'attack' ? this._which(a) : null;
    if (id && a !== this.atk) this._start(a, id);
    else if (!id) this.atk = null;
    if (!this.lb && !this.atk) return; // (never swung: nothing built, nothing drawn)
    if (!(fdt > 0)) return;
    this.t += fdt;
    const lb = this._letters();
    if (!lb) return;
    lb.begin();
    try {
      if (this.atk) this._follow(this.atk);
      this._camera();
      if (this.id === 'lance') this._lance(fdt);
      else if (this.id === 'cross') this._cross();
      else if (this.id === 'talisman') this._talisman();
      else if (this.id === 'flash') this._flash();
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
    this.lastU = 0;
    this.end = this.t + 2.5;
    this.lance.t = -1;
    this.lance.sparked = false;
    this.cross.done = -1;
    this.cross.burst = false;
    this.seal.set = this.seal.frozen = this.seal.burst = false;
    this.flash.done = -1;
    this.flash.split = false;
    this.plays++;
  }

  // ------------------------------------------------------------------ following the swing
  /** The sword's frame this frame (its origin and local +z axis, world), with the fx time and the phase. */
  _follow(a) {
    const d = a.def, W = d.windup, Ac = d.active, R0 = d.recovery, t = a.t;
    const u = t < W ? t / W : t < W + Ac ? 1 + (t - W) / Ac : 2 + (t - W - Ac) / R0;
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
  }

  /** The point at local z (the sword's own units: DIM) of sample i → V (world, drawn). */
  _at(i, z) {
    const S = this.S, k = i * SW;
    V.x = S[k] + S[k + 3] * z;
    V.y = S[k + 1] + S[k + 4] * z;
    V.z = S[k + 2] + S[k + 5] * z;
    return V;
  }

  // ------------------------------------------------------------------ the spell's reach (gameplay)
  /** player.js _slamImpact, as hit 5 ends its active frames: a striker finisher's spell takes the impact
   *  over from the slam's shards. Returns false (the shards as before) for anything else. If the blade
   *  did not land, the spell hits along the blade's path through the active frames, from the end of the
   *  hit segment to SPELL.reach m past it (in plan, at the blade's height), once. */
  strike(a) {
    const id = this._which(a);
    if (!id) return false;
    this.strikes++;
    const P = this.player, g = this.game, d = a.def;
    g?.shake?.(fin(d.shake, 0.3) * 0.35);
    if (a.hit) return true;
    const dr = g?.dragon;
    if (!dr || typeof dr.takeHit !== 'function' || dr.state === 'dead' || dr.state === 'dying') return true;
    const spheres = dr.hurtSpheres;
    if (!Array.isArray(spheres) || !spheres.length || this.ns < 2) return true;
    const z0 = DIM.bladeTip + REACH.tipExt, z1 = z0 + SPELL.reach, up = fin(d.up, REACH.up);
    // (the blade's frames through the active window, each swept to the next in three steps, as the
    // blade's own sweep is: combat.js SwordSweep.test)
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
        // (along the ground only, at the blade's own height: the spell reaches further ahead, never
        // higher than the blade, whose band (combat.js REACH) already covers what stands over it)
        VB.y = VA.y;
        if (bandHit(spheres, VA.x, VA.y, VA.z, VB.x, VB.y, VB.z, REACH.radius, up, REACH.down, P._hit) > 0) {
          this.spellHits++;
          P._applyHit(a, P._hit, true);
          return true;
        }
      }
    }
    return true;
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

  /** World point → screen px (y up) in PRJ; false behind the camera. */
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

  /** One of his cells on the screen, in metres, at a world point (marks of a line: one a cell). */
  _cellM(x, y, z) {
    const g = this.game, pe = g?.camera?.projectionMatrix?.elements, pl = g?.pipeline, m = g?.camera?.matrixWorldInverse?.elements;
    const H = pl?.height > 8 ? pl.height : 720, cw = pl?.heroCell?.x > 0 ? pl.heroCell.x : 4;
    if (!m || !pe || !(pe[5] > 0)) return 0.1;
    const vz = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
    if (!(vz > 0.2)) return 0.1;
    return Math.max(FIN.minStep, (cw * 2 * vz) / (H * pe[5]));
  }

  /** The stroke that runs along the screen direction from point 0 to point 1: - / | \ . */
  _stroke(x0, y0, z0, x1, y1, z1) {
    if (!this._proj(x0, y0, z0)) return '/';
    const ax = PRJ.px, ay = PRJ.py;
    if (!this._proj(x1, y1, z1)) return '/';
    let ang = (Math.atan2(PRJ.py - ay, PRJ.px - ax) * 180) / Math.PI;
    if (ang < 0) ang += 180;
    return ang < 22.5 || ang >= 157.5 ? '-' : ang < 67.5 ? '/' : ang < 112.5 ? '|' : '\\';
  }

  _put(x, y, z, ch, c, a) {
    if (this.w >= FIN.cells || !(y > 0.02)) return;
    const al = Math.min(FIN.maxAlpha, a);
    if (!(al > 0.004) || !Number.isFinite(x + y + z)) return;
    this.lb.put(x + this._cx, y + this._cy, z + this._cz, 0, this._mcol?.[ch] ?? 0, 0, c, al);
    this.w++;
    this.total++;
    this.onEmit?.('put', ch, al, Math.max(c[0], c[1], c[2]) * al);
  }

  /** A moving mark from L (filled by the caller). */
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

  /** A spark flying from (x, y, z) with velocity (vx, vy, vz). */
  _spark(x, y, z, vx, vy, vz, life, hot) {
    L.x = x;
    L.y = y;
    L.z = z;
    L.vx = vx;
    L.vy = vy;
    L.vz = vz;
    L.life = life;
    L.gravity = -1.5;
    L.drag = 2.2;
    L.flicker = 0.35;
    L.color = hot ? GREEN.hot : GREEN.body;
    L.colorEnd = GREEN.cool;
    L.alpha = hot ? 0.88 : 0.75;
    L.alphaEnd = 0;
    this._spawn(hot ? 'x' : rnd() < 0.5 ? '.' : '+');
  }

  /** The marks of a line of the blade's path, one a cell, from sample i-1 to i at local z: into PM
   *  (x, y, z each), their stroke in this._pch; returns how many. */
  _pathMarks(i, z) {
    const ax = this._at(i - 1, z).x, ay = V.y, az = V.z;
    const bx = this._at(i, z).x, by = V.y, bz = V.z;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (!(len > 0.01)) return 0;
    const n = Math.min(24, Math.max(1, Math.round(len / this._cellM(bx, by, bz))));
    this._pch = this._stroke(ax, ay, az, bx, by, bz);
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      PM[k * 3] = ax + (bx - ax) * f;
      PM[k * 3 + 1] = ay + (by - ay) * f;
      PM[k * 3 + 2] = az + (bz - az) * f;
    }
    return n;
  }

  // ------------------------------------------------------------------ lance
  /** As the thrust lands, a narrow lance of light shoots on from the point along the blade (its rise
   *  kept low, so it reads ahead of him from the camera behind), holds a beat and fades from its root;
   *  its head is pale and bright, a fleck spray flies off it as it arrives. */
  _lance(fdt) {
    const C = FIN.lance, Ln = this.lance, ns = this.ns;
    if (Ln.t < 0 && this.atk && this.lastU >= C.at && ns > 0) {
      const k = (ns - 1) * SW, S = this.S;
      let dx = S[k + 3], dy = S[k + 4], dz = S[k + 5];
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      const maxY = Math.sin((C.maxEl * Math.PI) / 180);
      if (dy > maxY) {
        const hz = Math.hypot(dx, dz) || 1, c = Math.sqrt(1 - maxY * maxY);
        dx = (dx / hz) * c;
        dz = (dz / hz) * c;
        dy = maxY;
      }
      this._at(ns - 1, DIM.drawnTip ?? DIM.steelTip);
      Ln.t = 0;
      Ln.x = V.x;
      Ln.y = V.y;
      Ln.z = V.z;
      Ln.dx = dx;
      Ln.dy = dy;
      Ln.dz = dz;
      Ln.sparked = false;
      this.end = this.t + 1.2;
    }
    if (Ln.t < 0) return;
    Ln.t += fdt;
    const grow = C.len / C.speed, fadeT = C.len / C.fade, total = grow + C.hold + fadeT;
    if (Ln.t >= total) {
      Ln.t = -1;
      return;
    }
    const front = Math.min(C.len, Ln.t * C.speed);
    const back = Ln.t > grow + C.hold ? Math.min(front, (Ln.t - grow - C.hold) * C.fade) : 0;
    const step = this._cellM(Ln.x, Ln.y, Ln.z);
    // across the lance on the screen: the camera's view direction x the lance
    const cam = this.game?.camera?.matrixWorld?.elements;
    let px = 0, py = 1, pz = 0;
    if (cam) {
      px = cam[9] * Ln.dz - cam[10] * Ln.dy;
      py = cam[10] * Ln.dx - cam[8] * Ln.dz;
      pz = cam[8] * Ln.dy - cam[9] * Ln.dx;
      const pl = Math.hypot(px, py, pz) || 1;
      px /= pl;
      py /= pl;
      pz /= pl;
    }
    const ch = this._stroke(Ln.x, Ln.y, Ln.z, Ln.x + Ln.dx, Ln.y + Ln.dy, Ln.z + Ln.dz);
    const n = Math.floor(front / step);
    for (let i = 0; i <= n; i++) {
      const s = i * step;
      if (s < back) continue;
      const x = Ln.x + Ln.dx * s, y = Ln.y + Ln.dy * s, z = Ln.z + Ln.dz * s;
      const head = front - s, tail = clamp01((s - back) / 0.5);
      const hot = head < 0.35;
      this._put(x, y, z, hot ? (head < 0.15 ? 'B' : 'o') : ch, hot ? GREEN.hot : mix(GREEN.body, GREEN.hot, 0.25), (hot ? 0.88 : 0.8) * (0.4 + 0.6 * tail));
      // its edges: a cell to each side, thinning toward the head (a lance, not a bar)
      for (let wd = 1; wd <= C.width; wd++) {
        // its edges, thinning toward the head and outward (a lance, not a bar)
        if (!(s < front - 0.3 * wd) || hash2(i, 3 + wd) > 0.95 - 0.2 * wd) continue;
        for (let sg = -1; sg <= 1; sg += 2) this._put(x + px * sg * step * wd, y + py * sg * step * wd, z + pz * sg * step * wd, hash2(i, sg + 7 + wd) < 0.6 ? ch : ':', wd === 1 ? GREEN.body : GREEN.cool, (wd === 1 ? 0.62 : 0.42) * tail);
      }
    }
    // the fleck spray off its head as it arrives; flecks shed along it as it fades
    if (!Ln.sparked && front >= C.len) {
      Ln.sparked = true;
      const hx = Ln.x + Ln.dx * C.len, hy = Ln.y + Ln.dy * C.len, hz = Ln.z + Ln.dz * C.len;
      for (let k = 0; k < C.sparks; k++) this._spark(hx, hy, hz, Ln.dx * R(1, 3) + R(-1, 1), R(0.2, 1.4), Ln.dz * R(1, 3) + R(-1, 1), R(0.25, 0.45), k < 4);
    }
    if (back > 0) {
      for (let k = 0; k < 2; k++) {
        const s = back + rnd() * Math.max(0, front - back);
        this._spark(Ln.x + Ln.dx * s, Ln.y + Ln.dy * s, Ln.z + Ln.dz * s, R(-0.2, 0.2), R(0.3, 0.8), R(-0.2, 0.2), R(0.2, 0.35), false);
      }
    }
  }

  // ------------------------------------------------------------------ cross
  /** The two cuts' outer blade, a band of three rows, written where the blade passed as it passes; the
   *  X hangs bright a beat after the second cut, then bursts into sparks flying out from its middle. */
  _cross() {
    const C = FIN.cross, Cr = this.cross, ns = this.ns, S = this.S;
    if (Cr.burst || ns < 2) return;
    if (Cr.done < 0 && this.lastU >= C.cuts[1][1] - 0.02) {
      Cr.done = this.t;
      this.end = this.t + C.hang + 0.6;
    }
    const burst = Cr.done >= 0 && this.t - Cr.done >= C.hang;
    // the middle of the X (the mean of its marks), for the burst's direction
    let mx = 0, my = 0, mz = 0, mn = 0;
    if (burst) {
      for (let i = 1; i < ns; i++) {
        const u = S[i * SW + 7];
        if (!((u >= C.cuts[0][0] && u <= C.cuts[0][1]) || (u >= C.cuts[1][0] && u <= C.cuts[1][1]))) continue;
        this._at(i, 0.95);
        mx += V.x;
        my += V.y;
        mz += V.z;
        mn++;
      }
      if (mn) {
        mx /= mn;
        my /= mn;
        mz /= mn;
      }
    }
    const zt = DIM.drawnTip ?? DIM.steelTip;
    for (let i = 1; i < ns; i++) {
      const u = S[i * SW + 7], u0 = S[(i - 1) * SW + 7];
      const cut = u0 >= C.cuts[0][0] && u <= C.cuts[0][1] ? 0 : u0 >= C.cuts[1][0] && u <= C.cuts[1][1] ? 1 : -1;
      if (cut < 0) continue;
      const age = this.t - S[i * SW + 6];
      for (let r = 0; r < C.rows.length; r++) {
        const edge = r === C.rows.length - 1;
        const n = this._pathMarks(i, C.rows[r] * zt), ch = this._pch;
        for (let k = 0; k < n; k++) {
          const x = PM[k * 3], y = PM[k * 3 + 1], z = PM[k * 3 + 2];
          if (burst) {
            if (hash2(i * 8 + r, k) < C.sparks) {
              const dx = x - mx, dy = y - my, dz = z - mz, dl = Math.hypot(dx, dy, dz) || 1, sp = R(1.5, 3.2);
              this._spark(x, y, z, (dx / dl) * sp, (dy / dl) * sp + 0.6, (dz / dl) * sp, R(0.25, 0.45), edge && k % 3 === 0);
            }
            continue;
          }
          // fresh marks flare pale, then settle to the body green; the edge row bright, the inner ones cooler
          const fresh = clamp01(1 - age / 0.12);
          const c = edge ? mix(GREEN.body, GREEN.hot, fresh) : mix(GREEN.cool, GREEN.body, 0.5 + 0.5 * fresh);
          this._put(x, y, z, edge || hash2(i, k + 17 * r) < 0.6 ? ch : ':', c, edge ? 0.86 : 0.55);
        }
      }
    }
    if (burst) Cr.burst = true;
  }

  // ------------------------------------------------------------------ talisman
  /** The seal: a ring and three strokes on the camera's plane before his chest, written as his free
   *  hand traces it (the windup), riding with him until the cut starts, then left in the air; as the
   *  blade goes through it, it bursts outward. */
  _talisman() {
    const C = FIN.talisman, Sl = this.seal, P = this.player;
    if (Sl.burst) return;
    const u = this.lastU;
    const cam = this.game?.camera?.matrixWorld?.elements;
    if (!Sl.frozen && this.atk) {
      // in front of his chest (it rides with him until the cut, then stays where the cut will pass)
      const ch = P.rig?.chest?.matrixWorld?.elements, yaw = P.yaw ?? 0, S = P.drawScale || 1;
      if (ch && cam) {
        const ahead = C.ahead * S;
        Sl.x = ch[12] + Math.sin(yaw) * ahead;
        Sl.y = ch[13] - 0.05 * S;
        Sl.z = ch[14] + Math.cos(yaw) * ahead;
        Sl.rx = cam[0];
        Sl.ry = cam[1];
        Sl.rz = cam[2];
        Sl.ux = cam[4];
        Sl.uy = cam[5];
        Sl.uz = cam[6];
        Sl.set = true;
        if (u >= C.freeze) Sl.frozen = true;
      }
    }
    if (!Sl.set) return;
    const S = P.drawScale || 1, Rr = C.r * S;
    Sl.R = Rr;
    const wrote = clamp01((u - C.write[0]) / (C.write[1] - C.write[0])); // how much of it is written
    const burst = u >= C.burst || (!this.atk && Sl.frozen);
    Sl.bursting = burst;
    const step = this._cellM(Sl.x, Sl.y, Sl.z);
    const mark = this._sealMark;
    // the ring: written first (0 … 0.6 of the writing), clockwise from the top as the fingers go round
    const nRing = Math.max(12, Math.min(64, Math.round((2 * Math.PI * Rr) / step)));
    const ringW = clamp01(wrote / 0.6);
    const last = Math.floor(ringW * nRing);
    for (let k = 0; k < last; k++) {
      const th = (k / nRing) * 2 * Math.PI;
      const lx = -Math.sin(th), ly = Math.cos(th); // (his fingers go round to his left first: the camera's left)
      const ch = Math.abs(lx) > 0.92 ? '|' : Math.abs(ly) > 0.92 ? '-' : lx * ly > 0 ? '\\' : '/';
      mark.call(this, lx, ly, ch, k === last - 1 && ringW < 1, k);
      if (k % 2 === 0) mark.call(this, lx * 0.86, ly * 0.86, ':', false, 300 + k); // (an inner ring, dotted)
    }
    // the strokes: the rest of the writing, one after another
    for (let s = 0; s < SEAL.length; s++) {
      const w = clamp01((wrote - 0.6) / 0.4 * SEAL.length - s);
      if (!(w > 0)) continue;
      const x0 = SEAL[s][0], y0 = SEAL[s][1], x1 = SEAL[s][2], y1 = SEAL[s][3], len = Math.hypot(x1 - x0, y1 - y0) * Rr;
      const n = Math.max(3, Math.round(len / step)), m = Math.max(1, Math.round(n * w));
      const ch = Math.abs(x1 - x0) < 0.01 ? '|' : '-';
      for (let k = 0; k < m; k++) mark.call(this, x0 + ((x1 - x0) * k) / (n - 1), y0 + ((y1 - y0) * k) / (n - 1), ch, k === m - 1 && w < 1, 100 + s * 40 + k);
    }
    if (burst) {
      Sl.burst = true;
      this.end = this.t + 0.6;
    }
  }

  /** One mark of the seal at (lx, ly) on its plane (units of its radius): written, or, bursting, a spark. */
  _sealMark(lx, ly, ch, head, k) {
    const Sl = this.seal, Rr = Sl.R, C = FIN.talisman;
    const x = Sl.x + (Sl.rx * lx + Sl.ux * ly) * Rr, y = Sl.y + (Sl.ry * lx + Sl.uy * ly) * Rr, z = Sl.z + (Sl.rz * lx + Sl.uz * ly) * Rr;
    if (Sl.bursting) {
      for (let j = 0; j < C.sparks; j++) {
        const sp = R(1.6, 3.6);
        this._spark(x, y, z, (Sl.rx * lx + Sl.ux * ly) * sp + R(-0.4, 0.4), (Sl.ry * lx + Sl.uy * ly) * sp + 0.6, (Sl.rz * lx + Sl.uz * ly) * sp + R(-0.4, 0.4), R(0.3, 0.55), (k + j) % 3 === 0);
      }
      return;
    }
    const shimmer = 0.85 + 0.15 * Math.sin(this.t * 31 + k * 1.7);
    this._put(x, y, z, head ? 'o' : ch, head ? GREEN.hot : mix(GREEN.body, GREEN.hot, 0.2), (head ? 0.88 : 0.82) * shimmer);
  }

  // ------------------------------------------------------------------ flash
  /** Through the still coil a few cold marks gather on the blade; the cut leaves a thin line of light
   *  (two rows of the outer blade's path) hanging where it passed, bright, which then splits: its upper
   *  row drifts up, its lower down, and both fade. */
  _flash() {
    const C = FIN.flash, Fl = this.flash, ns = this.ns, S = this.S, u = this.lastU;
    if (Fl.split || ns < 1) return;
    const zt = DIM.drawnTip ?? DIM.steelTip;
    // the gathering: cold marks along the held blade
    if (this.atk && u >= C.gather[0] && u < C.gather[1]) {
      const k = (ns - 1);
      for (let j = 0; j < 6; j++) {
        if (hash2(j, Math.floor(this.t * 14)) < 0.45) continue;
        const z = DIM.forte + (zt - DIM.forte) * (0.25 + 0.7 * hash2(j, 9));
        this._at(k, z);
        this._put(V.x, V.y + 0.04, V.z, j % 2 ? ':' : '.', GREEN.cool, 0.7);
      }
    }
    if (Fl.done < 0 && this.lastU >= C.sweep[1]) {
      Fl.done = this.t;
      this.end = this.t + C.hang + C.split + 0.4;
    }
    const split = Fl.done >= 0 && this.t - Fl.done >= C.hang;
    for (let i = 1; i < ns; i++) {
      const u0 = S[(i - 1) * SW + 7], u1 = S[i * SW + 7];
      if (u0 < C.sweep[0] || u1 > C.sweep[1] + 0.05) continue;
      const age = this.t - S[i * SW + 6];
      for (let r = 0; r < C.rows.length; r++) {
        const outer = r === C.rows.length - 1;
        const n = this._pathMarks(i, C.rows[r] * zt), ch = this._pch;
        for (let k = 0; k < n; k++) {
          const x = PM[k * 3], y = PM[k * 3 + 1], z = PM[k * 3 + 2];
          if (split) {
            // its halves part: the outer row up, the inner one down
            L.x = x;
            L.y = y;
            L.z = z;
            L.vx = R(-0.15, 0.15);
            L.vy = (outer ? 1 : -1) * R(0.5, 0.9);
            L.vz = R(-0.15, 0.15);
            L.life = R(0.24, C.split);
            L.gravity = 0;
            L.drag = 2.5;
            L.flicker = 0.2;
            L.color = outer ? GREEN.hot : GREEN.body;
            L.colorEnd = GREEN.cool;
            L.alpha = 0.85;
            L.alphaEnd = 0;
            this._spawn(hash2(i * 3 + r, k) < 0.25 ? '.' : ch);
            continue;
          }
          const fresh = clamp01(1 - age / 0.1);
          this._put(x, y, z, ch, outer ? mix(GREEN.body, GREEN.hot, 0.35 + 0.65 * fresh) : GREEN.body, outer ? 0.88 : 0.66);
        }
      }
    }
    if (split) Fl.split = true;
  }
}

function fin(v, d) {
  return Number.isFinite(v) ? v : d;
}
