import { FIRE } from './breakTuning.js';
import { TELL } from '../combat/rules.js';

// Ground fire (ADR-107): grass that a boss's fire lands on catches, burns for a few seconds as a
// hazard, and is ash for the rest of the fight. It never spreads (the owner's pick: "burns where it
// lands"), and ash cannot catch again, so the field burns down as the fight goes on.
//
//   world.fire.ignite(x, z, r, k = 1)   light the grass in a disc; returns the cells that caught
//   world.fire.burning(x, z)            seconds this spot still burns (0 = not alight)
//   world.fire.count                    cells alight now
//   world.fire.reset()
//
// It lives on the scorch map's grid (world/scorch.js: 0.625 m cells): a burning cell holds the map's
// heat up (the ember glow, the grass's burning tips) and chars it to ash by the time it goes out.
// Contact burns the hero like a burning crater does (hazards.js `_tick`): small blockable ticks,
// never while he rolls. No per-frame allocation: fixed arrays, one reused hit record.

const lerp = (a, b, t) => a + (b - a) * t;

// cosmetic noise from this module's own stream (the seeded sims replay Math.random)
let seed = 0x51f15e3d;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

export class GroundFire {
  /** `density(x, z)` → grass density 0..1 there (world.js's meadow), the fire's fuel. */
  constructor(game, world, density) {
    this.game = game;
    this.world = world;
    this.density = typeof density === 'function' ? density : () => 0;
    const s = world.scorch;
    this.size = s.size;
    this.cell = s.cellSize;
    this.min = s.min;
    const n = this.size * this.size;
    this.left = new Float32Array(n); // s still to burn (0 = not alight)
    this.life = new Float32Array(n); // s it burns in all
    this.cells = new Int32Array(FIRE.maxCells); // the cells alight (unordered)
    this.count = 0;
    this._flame = 0;
    this._tick = 0;
    this._lightT = 0;
    this._blob = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size: 1, sizeEnd: 0.3, heat: 0.5, heatEnd: 0, drag: 1.1, gravity: 0, kind: 'fire' }; // the fire field's reused record
    this._hit = {
      damage: FIRE.damage, from: { x: 0, z: 0 }, knockback: 0, knockdown: false, kind: 'fire', burn: 0,
      tell: TELL.NORMAL, parryable: false, blockable: true, attack: 'groundFire', attacker: null,
      plunge: false, perfect: false, light: true,
    };
  }

  _idx(x, z) {
    const cx = Math.floor((x - this.min) / this.cell), cz = Math.floor((z - this.min) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return -1;
    return cz * this.size + cx;
  }

  /** Seconds the ground at (x, z) still burns; 0 when it is not alight. */
  burning(x, z) {
    const i = this._idx(x, z);
    return i < 0 ? 0 : this.left[i];
  }

  /**
   * Fire lands on the disc (x, z, r): every cell of it with grass left catches (k scales how long it
   * burns). Returns how many caught. Ash, bare ground and paving do not burn.
   */
  ignite(x, z, r, k = 1) {
    if (!Number.isFinite(x + z + r) || !(r > 0) || !(k > 0)) return 0;
    const s = this.world.scorch, N = this.size, c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r - this.min) / c)), x1 = Math.min(N - 1, Math.floor((x + r - this.min) / c));
    const z0 = Math.max(0, Math.floor((z - r - this.min) / c)), z1 = Math.min(N - 1, Math.floor((z + r - this.min) / c));
    let lit = 0;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const wx = this.min + (cx + 0.5) * c, wz = this.min + (cz + 0.5) * c;
        if (Math.hypot(wx - x, wz - z) > r) continue;
        const i = cz * N + cx;
        if (this.left[i] > 0 || this.count >= FIRE.maxCells) continue;
        const fuel = this.density(wx, wz) * (1 - s.burn[i]);
        if (!(fuel >= FIRE.minFuel)) continue;
        const life = lerp(FIRE.life[0], FIRE.life[1], Math.min(1, fuel)) * k;
        this.left[i] = this.life[i] = life;
        this.cells[this.count++] = i;
        lit++;
      }
    }
    if (lit) {
      // one light per blaze, not per cell (and not more often than every 0.25 s)
      if (this._lightT <= 0) {
        this._lightT = 0.25;
        // (a local glow over the blaze, FIRE.glow: it was r + 6 m at 2.2, a flood that washed out the
        // burning cells' own pattern)
        this.game.lights?.add?.({ x, y: 1.2, z, color: [1.0, 0.42, 0.1], intensity: FIRE.glow.intensity, radius: Math.min(FIRE.glow.max, r + FIRE.glow.pad), life: FIRE.life[1] * k, fade: 1.4, flicker: 0.5 });
      }
      this.game.events?.emit?.('world:fire', { x, z, radius: r, cells: lit });
    }
    return lit;
  }

  /**
   * Something burning stands at (x, z) (a tree alight: world/destructibles.js): the hero within r of
   * it is burned like one standing in burning grass (the same tick clock). Call every frame it burns.
   */
  touch(x, z, r) {
    const p = this.game.player;
    if (this._tick > 0 || !p?.takeHit || p.alive === false || this.game.state !== 'boss') return false;
    if (p.state === 'roll' || p.isInvulnerable?.()) return false;
    const px = p.position.x, pz = p.position.z;
    if (Math.hypot(px - x, pz - z) > r + (p.radius ?? 0.45)) return false;
    return this._burn(p, x, z);
  }

  _burn(p, fx, fz) {
    this._tick = FIRE.tick;
    const h = this._hit;
    h.from.x = fx;
    h.from.z = fz;
    // (dead centre: no direction to be pushed in; takeHit falls back to "backwards")
    if (Math.hypot(fx - p.position.x, fz - p.position.z) < 1e-3) h.from.x += 0.01;
    try {
      p.takeHit(h);
    } catch (err) {
      console.error('[fire] player.takeHit failed', err);
    }
    return true;
  }

  reset() {
    for (let n = 0; n < this.count; n++) this.left[this.cells[n]] = 0;
    this.count = 0;
    this._flame = 0;
    this._tick = 0;
  }

  update(dt) {
    if (this._lightT > 0) this._lightT -= dt;
    if (this._tick > 0) this._tick -= dt;
    if (!this.count) return;
    const s = this.world.scorch, N = this.size, c = this.cell;
    // burn down: heat held up, char rising to ash as each cell goes out
    for (let n = this.count - 1; n >= 0; n--) {
      const i = this.cells[n];
      const left = (this.left[i] -= dt);
      const done = left <= 0;
      const u = done ? 1 : 1 - left / this.life[i];
      // (one even glow and one even char over the blaze: the scorch map's own jitter would chequer it)
      if (!done) s.heat[i] = FIRE.heat;
      s.burn[i] = done ? 1 : Math.max(0.3 + 0.7 * u, Math.min(s.burn[i], 0.3 + 0.7 * u + 0.08));
      s.active.add(i);
      s._write(i);
      if (done) {
        this.left[i] = 0;
        this.cells[n] = this.cells[--this.count];
      }
    }
    s.dirty = true;

    // flames: heat in the fire field (render/fireField.js) over cells picked at random, a budget for
    // the whole blaze. Cool blobs that overlap: the grass burns orange with red tongues, and only a
    // thick blaze has a yellow heart. (Born 0.7 m up: lower, the field's depth fade eats them.)
    const fx = this.game.fx?.fire;
    if (fx && this.count) {
      const area = this.count * c * c;
      this._flame += dt * Math.min(FIRE.maxFlames, area * FIRE.flames);
      while (this._flame >= 1) {
        this._flame -= 1;
        const i = this.cells[Math.floor(rnd() * this.count)];
        const u = 1 - this.left[i] / this.life[i];
        const tall = 1 - 0.55 * u; // the flames sink as the grass goes
        const hot = rnd();
        const b = this._blob;
        b.x = this.min + ((i % N) + rnd()) * c;
        b.y = 0.7 + rnd() * 0.3;
        b.z = this.min + (Math.floor(i / N) + rnd()) * c;
        b.vx = (rnd() - 0.5) * 0.5;
        b.vy = (1.3 + rnd() * 1.6) * tall;
        b.vz = (rnd() - 0.5) * 0.5;
        b.life = 0.34 + rnd() * 0.42;
        b.size = (1.1 + hot * 0.7) * (0.7 + 0.3 * tall);
        b.sizeEnd = 0.3;
        b.heat = 0.46 + hot * 0.14;
        fx.spawn(b);
      }
    }

    // the hero standing in it: small blockable burns, never while he rolls
    const p = this.game.player;
    if (this._tick > 0 || !p?.takeHit || p.alive === false || this.game.state !== 'boss') return;
    if (p.state === 'roll' || p.isInvulnerable?.()) return;
    const px = p.position.x, pz = p.position.z, pr = (p.radius ?? 0.45) * 0.8;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = this._idx(px + dx * pr, pz + dz * pr);
        if (i < 0 || !(this.left[i] > 0) || this.life[i] - this.left[i] < FIRE.grace) continue;
        this._burn(p, this.min + ((i % N) + 0.5) * c, this.min + (Math.floor(i / N) + 0.5) * c);
        return;
      }
    }
  }
}
