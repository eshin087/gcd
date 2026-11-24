import { MAX_PL } from './shaderLib.js';

// Pool of dynamic point lights (fire breath, fireballs, bonfire, embers). Any number can be
// alive; each frame the MAX_PL most relevant to the camera focus are written to the shaders.
//
//   const l = game.lights.add({ x, y, z, color: [1, 0.45, 0.12], intensity: 3, radius: 9,
//                               life: 0.6, fade: 0.3, flicker: 0.4 });
//   l.x = ...;      // move it any time (or l.set(x, y, z))
//   l.kill();       // fade out over `fade` seconds
//
// A LOW light (`low: true`; the living world's lanterns and the Ring's braziers, world/life/lamps.js):
// it takes only the slots the others leave free, and it never pops: it fades into a slot it is given
// and out of one it must give up over `slotFade` s (holding the slot while it fades, so for that
// moment the least of the others waits). With no low light alive the pool picks exactly as before.
//
// The flicker's phase comes from this module's own stream (as particles.js does), never Math.random:
// the seeded sims replay the AI from Math.random, and a light added or removed (a look option, one
// more spark of fire) must never change his next move.
let lseed = 0x51ed27a3;
const lrnd = () => (lseed = (Math.imul(lseed, 1664525) + 1013904223) >>> 0) / 4294967296;
export class LightPool {
  constructor(U) {
    this.U = U;
    this.lights = [];
    this.t = 0;
    /** the low lights eligible this frame (reused) */
    this._lows = [];
    /** what the last update wrote: slots used, by low lights (the tests and the Lab read it) */
    this.used = 0;
    this.usedLow = 0;
  }

  add({ x = 0, y = 1, z = 0, color = [1, 0.5, 0.15], intensity = 1, radius = 8, life = Infinity, fade = 0.25, fadeIn = 0, flicker = 0, low = false, slotFade = 0.3 } = {}) {
    const light = {
      x, y, z, color, intensity, radius, life, fade, fadeIn, flicker,
      low: !!low, slotFade, slot: 0, rank: 0,
      age: 0,
      seed: lrnd() * 100,
      current: 0,
      dead: false,
      set(nx, ny, nz) {
        this.x = nx; this.y = ny; this.z = nz;
        return this;
      },
      kill() {
        this.life = Math.min(this.life, this.age + this.fade);
      },
    };
    this.lights.push(light);
    return light;
  }

  clear() {
    this.lights.length = 0;
  }

  update(dt, focus) {
    this.t += dt;
    const live = [];
    let lowN = 0;
    for (const l of this.lights) {
      l.age += dt;
      if (l.age >= l.life) {
        l.dead = true;
        continue;
      }
      let k = 1;
      if (l.fadeIn > 0) k *= Math.min(1, l.age / l.fadeIn);
      const remaining = l.life - l.age;
      if (remaining < l.fade) k *= remaining / l.fade;
      const k0 = k;
      if (l.flicker > 0) {
        const n = Math.sin(this.t * 17.3 + l.seed) * 0.5 + Math.sin(this.t * 7.1 + l.seed * 2.3) * 0.35 + Math.sin(this.t * 31.7 + l.seed * 0.7) * 0.15;
        k *= 1 - l.flicker * (0.5 + 0.5 * n) * 0.6;
      }
      l.current = l.intensity * k;
      const d = Math.hypot(l.x - focus.x, l.z - focus.z);
      l.score = (l.current * l.radius) / (1 + Math.max(0, d - l.radius) * 0.5);
      if (l.low) {
        lowN++;
        // (its place among the low lights: without the flicker, and a light holding a slot keeps it
        // against one that would only just beat it: no trading slots back and forth)
        l.rank = ((l.intensity * k0 * l.radius) / (1 + Math.max(0, d - l.radius) * 0.5)) * (l.slot > 0 ? 1.25 : 1);
      }
      live.push(l);
    }
    this.lights = live;
    live.sort((a, b) => b.score - a.score);
    const { uPLPos, uPLCol, uPLRad } = this.U;
    if (lowN === 0) {
      let used = 0;
      for (let i = 0; i < MAX_PL; i++) {
        const l = live[i];
        if (l && l.current > 0.001) {
          uPLPos.value[i].set(l.x, l.y, l.z);
          uPLCol.value[i].set(l.color[0] * l.current, l.color[1] * l.current, l.color[2] * l.current);
          uPLRad.value[i] = l.radius;
          used++;
        } else {
          uPLRad.value[i] = 0;
        }
      }
      this.used = used;
      this.usedLow = 0;
      return;
    }
    // with low lights: the others first; the low ones take what is left, fading in and out of it
    const lows = this._lows;
    lows.length = 0;
    let hi = 0;
    for (const l of live) {
      if (l.low) {
        if (l.current > 0.001) lows.push(l);
        else l.slot = 0;
      } else if (l.current > 0.001) hi++;
    }
    lows.sort((a, b) => b.rank - a.rank);
    const free = MAX_PL - hi;
    let holders = 0;
    for (let i = 0; i < lows.length; i++) {
      const l = lows[i], s = dt / Math.max(1e-3, l.slotFade);
      l.slot = i < free ? Math.min(1, l.slot + s) : Math.max(0, l.slot - s);
      if (l.slot > 0) holders++;
    }
    const room = MAX_PL - Math.min(MAX_PL, holders);
    let i = 0;
    for (const l of live) {
      if (i >= room) break;
      if (l.low || !(l.current > 0.001)) continue;
      uPLPos.value[i].set(l.x, l.y, l.z);
      uPLCol.value[i].set(l.color[0] * l.current, l.color[1] * l.current, l.color[2] * l.current);
      uPLRad.value[i] = l.radius;
      i++;
    }
    const hiUsed = i;
    for (const l of lows) {
      if (i >= MAX_PL) break;
      if (!(l.slot > 0)) continue;
      const c = l.current * l.slot;
      uPLPos.value[i].set(l.x, l.y, l.z);
      uPLCol.value[i].set(l.color[0] * c, l.color[1] * c, l.color[2] * c);
      uPLRad.value[i] = l.radius;
      i++;
    }
    this.used = i;
    this.usedLow = i - hiUsed;
    for (; i < MAX_PL; i++) uPLRad.value[i] = 0;
    lows.length = 0;
  }
}
