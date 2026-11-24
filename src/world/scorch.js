import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { STEPS } from './life/stepsTuning.js';
import { GRASS } from './grassTuning.js';
import { lookOf } from '../entities/enemies/duelist/lookSwitch.js';

/** Does the grass tear (`?mow=0`: nothing is torn, today's grass)? Read per tear (a Map lookup). */
export const mowOn = () => lookOf('mow', '1') !== '0';

// World-space burn map sampled by grass + ground shaders.
//   R = burn (persistent char: grass shrinks to ash glyphs)
//   G = heat (glowing embers, decays over a few seconds)
//   B = trample (grass trodden by a foot, 0..1; the living world's steps write it, the grass lies
//       flatter and darker by it; it stands up again over STEPS.trample.decay s)
//   A = torn (grass the sword mowed or a blow tore out, 0..1: 1 cut to stubble; it stays until
//       reset(); grassTuning.js; the fire never reads it)
// Dragon fire calls scorch.burnCircle(x, z, radius, burnAmount, heatAmount); a footstep
// scorch.trample(x, z, r, k) (max-blended, its own decay, no random draw); a blade or a mark
// scorch.tear(x, z, r, k) / tearLine(ax, az, bx, bz, w, k, k2) (max-blended, persistent, no random draw).
export class Scorch {
  constructor(U, game, size = 256) {
    this.game = game;
    this.size = size;
    this.extent = CONFIG.world.worldExtent;
    this.min = -this.extent / 2;
    this.cellSize = this.extent / size;
    this.burn = new Float32Array(size * size);
    this.heat = new Float32Array(size * size);
    this.active = new Set();
    this.data = new Uint8Array(size * size * 4);
    this.tex = new THREE.DataTexture(this.data, size, size, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    U.uScorch.value = this.tex;
    U.uScorchBounds.value.set(this.min, this.min, this.extent, 0);
    this.dirty = false;
    this.emberTimer = 0;
    // a wisp of smoke off hot ground (a reused fire-field record: no per-spawn object)
    this._smoke = { x: 0, y: 1.0, z: 0, vx: 0.2, vy: 0.8, vz: 0, life: 1.6, size: 1.0, sizeEnd: 2.4, heat: 0.25, heatEnd: 0, drag: 0.4, gravity: 0, kind: 'smoke' };
    // an ember off hot ground (a reused glyph-particle record: spawn copies it)
    this._ember = { x: 0, y: 0.15, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.2, sizeEnd: 0.05, glyph: ".'`*", color: [1, 0.5, 0.1], colorEnd: [0.6, 0.06, 0.01], alpha: 1, alphaEnd: 0, drag: 0.6, flicker: 0.5 };
    // the hot cells the embers are drawn from: a sample taken while the decay walks the active set
    // (no array copied out of the Set each frame)
    this._pick = new Int32Array(64);
    this._picks = 0;
    this._seen = 0;
    this._dt = 0;
    this._decay = 1;
    this._step = (i) => this._cool(i); // (made once: Set.forEach with it allocates nothing per frame)
    // the trodden grass (B): its own cells, list and decay; nothing here touches R, G or their timing
    this.tram = new Float32Array(size * size);
    this._tramIn = new Uint8Array(size * size);
    this._tramList = new Int32Array(STEPS.trample.maxCells);
    this._tramN = 0;
    // the torn grass (A): what the sword mowed, what a mark tore out; it stays till reset(). Its own
    // cells and count; nothing here touches R, G, B or the fire (nothing in fire.js reads A)
    this.torn = new Float32Array(size * size);
    this.tornCells = 0;
  }

  /** How torn the grass is at (x, z): 0 (standing) .. 1 (mown to stubble). */
  tornAt(x, z) {
    const i = this._idx(x, z);
    return i < 0 ? 0 : this.torn[i];
  }

  /** One cell's tear: max-blended into A where grass grows; returns how much it grew. */
  _tear(i, v, dens, wx, wz) {
    if (v <= this.torn[i]) return 0;
    if (dens && !(dens(wx, wz) >= GRASS.mow.minDensity)) return 0;
    const was = this.torn[i];
    if (!(was > 0)) this.tornCells++;
    this.torn[i] = v;
    this.data[i * 4 + 3] = Math.round(v * 255);
    this.dirty = true;
    return v - was;
  }

  /** The meadow's density function (the fire's fuel: world.js's meadow), or null (none: every cell). */
  _grassDensity() {
    const d = this.game?.world?.fire?.density;
    return typeof d === 'function' ? d : null;
  }

  /**
   * The grass is torn at (x, z): a disc r m wide, k deep (0..1: 1 mown to stubble), full out to r (and
   * GRASS.full of a cell more: the cell a point falls in is never short), its edge soft over GRASS.soft m; max-blended into A, only where grass grows. Persistent until reset(). No random draw.
   * Returns the tear it added (the sum over its cells).
   */
  tear(x, z, r, k = 1) {
    if (!mowOn() || !Number.isFinite(x + z + r + k) || !(r > 0) || !(k > 0)) return 0;
    k = Math.min(1, k);
    const s = this.size, cs = this.cellSize, soft = GRASS.soft, R = r + cs * GRASS.full + soft;
    const dens = this._grassDensity();
    const c0x = Math.max(0, Math.floor((x - R - this.min) / cs)), c1x = Math.min(s - 1, Math.floor((x + R - this.min) / cs));
    const c0z = Math.max(0, Math.floor((z - R - this.min) / cs)), c1z = Math.min(s - 1, Math.floor((z + R - this.min) / cs));
    let add = 0;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const wx = this.min + (cx + 0.5) * cs, wz = this.min + (cz + 0.5) * cs;
        const d = Math.hypot(wx - x, wz - z);
        if (d >= R) continue;
        const v = k * Math.min(1, (R - d) / soft);
        add += this._tear(cz * s + cx, v, dens, wx, wz);
      }
    }
    return add;
  }

  /**
   * A strip of torn grass from (ax, az) to (bx, bz), w m wide: k deep at a, k2 at b (a blade's arc, a
   * gash, a furrow: cheaper than many discs). As tear(): soft-edged, max-blended, grass only.
   */
  tearLine(ax, az, bx, bz, w, k = 1, k2 = k) {
    if (!mowOn() || !Number.isFinite(ax + az + bx + bz + w + k + k2) || !(w > 0) || !(Math.max(k, k2) > 0)) return 0;
    k = Math.min(1, Math.max(0, k));
    k2 = Math.min(1, Math.max(0, k2));
    const s = this.size, cs = this.cellSize, soft = GRASS.soft, R = w * 0.5 + cs * GRASS.full + soft;
    const dens = this._grassDensity();
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    const c0x = Math.max(0, Math.floor((Math.min(ax, bx) - R - this.min) / cs)), c1x = Math.min(s - 1, Math.floor((Math.max(ax, bx) + R - this.min) / cs));
    const c0z = Math.max(0, Math.floor((Math.min(az, bz) - R - this.min) / cs)), c1z = Math.min(s - 1, Math.floor((Math.max(az, bz) + R - this.min) / cs));
    let add = 0;
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const wx = this.min + (cx + 0.5) * cs, wz = this.min + (cz + 0.5) * cs;
        const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((wx - ax) * ex + (wz - az) * ez) / l2)) : 0;
        const d = Math.hypot(ax + ex * t - wx, az + ez * t - wz);
        if (d >= R) continue;
        const v = (k + (k2 - k) * t) * Math.min(1, (R - d) / soft);
        if (v > 0) add += this._tear(cz * s + cx, v, dens, wx, wz);
      }
    }
    return add;
  }

  trampleAt(x, z) {
    const i = this._idx(x, z);
    return i < 0 ? 0 : this.tram[i];
  }

  /** A foot treads the grass at (x, z): a disc r m wide, k deep (0..1), max-blended into B. */
  trample(x, z, r = 0.45, k = 1) {
    if (!Number.isFinite(x + z + r + k) || !(r > 0) || !(k > 0)) return;
    k = Math.min(1, k);
    const s = this.size, cs = this.cellSize, R = r + cs * 0.7;
    const c0x = Math.max(0, Math.floor((x - R - this.min) / cs)), c1x = Math.min(s - 1, Math.floor((x + R - this.min) / cs));
    const c0z = Math.max(0, Math.floor((z - R - this.min) / cs)), c1z = Math.min(s - 1, Math.floor((z + R - this.min) / cs));
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const d = Math.hypot(this.min + (cx + 0.5) * cs - x, this.min + (cz + 0.5) * cs - z);
        if (d >= R) continue;
        // a flat middle, a soft edge
        const v = k * Math.min(1, 2 * (1 - d / R));
        const i = cz * s + cx;
        if (v <= this.tram[i]) continue;
        if (!this._tramIn[i]) {
          if (this._tramN >= this._tramList.length) continue; // (full: the cells already trodden stand up first)
          this._tramIn[i] = 1;
          this._tramList[this._tramN++] = i;
        }
        this.tram[i] = v;
        this.data[i * 4 + 2] = Math.round(v * 255);
        this.dirty = true;
      }
    }
  }

  /** The trodden grass stands up again (linear, STEPS.trample.decay s from fully trodden). */
  _standUp(dt) {
    const rate = dt / Math.max(0.1, STEPS.trample.decay), L = this._tramList;
    for (let n = 0; n < this._tramN; ) {
      const i = L[n];
      const v = this.tram[i] - rate;
      if (v <= 0) {
        this.tram[i] = 0;
        this._tramIn[i] = 0;
        this.data[i * 4 + 2] = 0;
        L[n] = L[--this._tramN];
        continue;
      }
      this.tram[i] = v;
      this.data[i * 4 + 2] = Math.round(v * 255);
      n++;
    }
    this.dirty = true;
  }

  /** One active cell's frame: its heat decays, it chars under heat, it leaves the set when cold. */
  _cool(i) {
    this.heat[i] *= this._decay;
    if (this.heat[i] > 0.4) this.burn[i] = Math.min(1, this.burn[i] + this._dt * 0.08);
    if (this.heat[i] < 0.01) {
      this.heat[i] = 0;
      this.active.delete(i);
    } else if (this.heat[i] >= 0.15) {
      // reservoir sample of the hot cells
      const n = ++this._seen, P = this._pick;
      if (this._picks < P.length) P[this._picks++] = i;
      else {
        const j = Math.floor(Math.random() * n);
        if (j < P.length) P[j] = i;
      }
    }
    this._write(i);
  }

  _idx(x, z) {
    const cx = Math.floor((x - this.min) / this.cellSize);
    const cz = Math.floor((z - this.min) / this.cellSize);
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return -1;
    return cz * this.size + cx;
  }

  burnAt(x, z) {
    const i = this._idx(x, z);
    return i < 0 ? 0 : this.burn[i];
  }
  heatAt(x, z) {
    const i = this._idx(x, z);
    return i < 0 ? 0 : this.heat[i];
  }

  burnCircle(x, z, radius, burnAmount = 0.5, heatAmount = 1) {
    const s = this.size;
    const c0x = Math.floor((x - radius - this.min) / this.cellSize);
    const c1x = Math.floor((x + radius - this.min) / this.cellSize);
    const c0z = Math.floor((z - radius - this.min) / this.cellSize);
    const c1z = Math.floor((z + radius - this.min) / this.cellSize);
    for (let cz = Math.max(0, c0z); cz <= Math.min(s - 1, c1z); cz++) {
      for (let cx = Math.max(0, c0x); cx <= Math.min(s - 1, c1x); cx++) {
        const wx = this.min + (cx + 0.5) * this.cellSize;
        const wz = this.min + (cz + 0.5) * this.cellSize;
        const d = Math.hypot(wx - x, wz - z);
        if (d > radius) continue;
        const k = 1 - d / radius;
        const jitter = 0.75 + 0.5 * Math.random();
        const i = cz * s + cx;
        this.burn[i] = Math.min(1, this.burn[i] + burnAmount * k * jitter);
        this.heat[i] = Math.min(1, Math.max(this.heat[i], heatAmount * Math.sqrt(k) * jitter));
        this.active.add(i);
        this._write(i);
      }
    }
    this.dirty = true;
  }

  _write(i) {
    this.data[i * 4] = Math.round(this.burn[i] * 255);
    this.data[i * 4 + 1] = Math.round(this.heat[i] * 255);
  }

  reset() {
    this.burn.fill(0);
    this.heat.fill(0);
    this.data.fill(0);
    this.active.clear();
    this.tram.fill(0);
    this._tramIn.fill(0);
    this._tramN = 0;
    this.torn.fill(0);
    this.tornCells = 0;
    this.tex.needsUpdate = true;
  }

  update(dt) {
    this._picks = 0;
    this._seen = 0;
    if (this.active.size) {
      this._decay = Math.exp(-dt * 0.45);
      this._dt = dt;
      this.active.forEach(this._step);
      this.dirty = true;
    }
    if (this._tramN && dt > 0) this._standUp(dt);
    if (this.dirty) {
      this.tex.needsUpdate = true;
      this.dirty = false;
    }

    // drifting embers above hot ground
    const fx = this.game.fx?.add, fire = this.game.fx?.fire;
    if (fx && this.active.size) {
      this.emberTimer += dt * Math.min(60, this.active.size * 0.25);
      const P = this._pick, np = this._picks;
      if (!np) this.emberTimer = Math.min(this.emberTimer, 1);
      while (this.emberTimer >= 1 && np) {
        this.emberTimer -= 1;
        const i = P[Math.floor(Math.random() * np)];
        const h = this.heat[i];
        if (h < 0.15) continue;
        const cx = i % this.size, cz = Math.floor(i / this.size);
        // now and then a wisp of smoke off the hottest ground (grey letters in the fire field:
        // it reads as burnt, never as fire that still hurts)
        if (h > 0.5 && fire && Math.random() < 0.12) {
          const s = this._smoke;
          s.x = this.min + (cx + Math.random()) * this.cellSize;
          s.z = this.min + (cz + Math.random()) * this.cellSize;
          s.vy = 0.6 + Math.random() * 0.7;
          s.life = 1.3 + Math.random() * 0.9;
          s.heat = 0.2 + 0.14 * h;
          fire.spawn(s);
        }
        const e = this._ember;
        e.x = this.min + (cx + Math.random()) * this.cellSize;
        e.z = this.min + (cz + Math.random()) * this.cellSize;
        e.vx = (Math.random() - 0.5) * 0.6;
        e.vy = 0.8 + Math.random() * 1.6;
        e.vz = (Math.random() - 0.5) * 0.6;
        e.life = 0.6 + Math.random() * 1.2;
        e.size = 0.16 + Math.random() * 0.12;
        e.color[0] = 2.6 * h + 0.6;
        e.color[1] = 0.9 * h;
        e.color[2] = 0.12;
        fx.spawn(e);
      }
    }
  }
}
