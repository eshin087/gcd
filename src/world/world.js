import { CONFIG } from '../core/config.js';
import { MAX_PUSH } from '../render/shaderLib.js';
import { Colliders } from './colliders.js';
import { createGround } from './ground.js';
import { createForest } from './forest.js';
import { createGrass, meadowDensity, meadowHeight } from './grass.js';
import { Scorch } from './scorch.js';
import { Atmosphere } from './atmosphere.js';
import { GroundFire } from './fire.js';
import { Scars } from './scars.js';
import { Destructibles } from './destructibles.js';
import { BLOW, SCAR, QUALITY } from './breakTuning.js';
import { resolveOn } from './edge.js';

// Owns the static environment and the shared environment-interaction APIs:
//   world.resolve(pos, radius, bound, soft, who)  circle collision vs stones/trunks + arena bound; who 'hero':
//                                           on a set with an edge the hero's ground replaces the circle
//   world.edge                              the edge of the open ground (edge.js, ADR-125) or null
//   world.heroBound(x, z)                   how far out the hero may stand in that direction (m)
//   world.setPusher(slot, x, y, z, radius)  grass trample (slot 0 = player, 1..9 = dragon)
//   world.gust(x, z, strength, radius)      radial wind impulse (wing beats, landings)
//   world.scorch.burnCircle(x, z, r, burn, heat)
//   world.debug.setVisible(bool)            Lab only: hide / restore the environment (see below)
// Destruction (ADR-107; tuning in breakTuning.js):
//   world.impact(x, z, r, power, o)         a blow lands on the world: breakables in the disc take it,
//                                           a hard one cracks the floor; o.fire: it also sets alight
//   world.ignite(x, z, r, k, grass = true)  fire lands: grass (unless grass = false) and wood catch
//   world.destructibles / .fire / .scars    the systems behind them (destructibles.js, fire.js, scars.js)
//   world.restore()                         everything stands and is unburnt again (the fight's reset;
//                                           a set with `scenes`: its first scene again, ADR-157)
//   world.setQuality(k)                     the phone budget, 0.3 .. 1 (setGrassQuality sets it from the preset)
export const PUSHER_SLOTS = MAX_PUSH;

/** A set's own night (`sky: { moonColor, moonDir, ambient, fogColor, fogNear, fogFar }`, all optional):
 *  written into the shared uniforms once, before anything reads them. */
function applySky(U, sky) {
  if (!sky || !U) return;
  const rgb = (u, c) => {
    if (u?.value?.setRGB && Array.isArray(c) && c.length === 3 && c.every(Number.isFinite)) u.value.setRGB(c[0], c[1], c[2]);
  };
  rgb(U.uMoonColor, sky.moonColor);
  rgb(U.uAmbient, sky.ambient);
  rgb(U.uFogColor, sky.fogColor);
  if (Number.isFinite(sky.fogNear) && U.uFogNear) U.uFogNear.value = sky.fogNear;
  if (Number.isFinite(sky.fogFar) && U.uFogFar) U.uFogFar.value = sky.fogFar;
  const d = sky.moonDir;
  if (Array.isArray(d) && d.length === 3 && d.every(Number.isFinite) && U.uMoonDir?.value?.set) U.uMoonDir.value.set(d[0], d[1], d[2]).normalize();
}

export class World {
  constructor(game) {
    this.game = game;
    const U = game.U;
    this.colliders = new Colliders();
    this.ground = createGround(U);
    game.scene.add(this.ground);
    // the level's static set (levels/index.js: createForest by default, createCourtyard for Ashfall);
    // both return the same shape, kept under the name `forest`
    const buildSet = typeof game.level?.buildSet === 'function' ? game.level.buildSet : createForest;
    this.forest = buildSet(U, this.colliders);
    game.scene.add(this.forest.group);
    // a set may lower the ground plane (`groundY`: the Skybreak Ring's butte crown stands far above
    // the badlands; the set draws its own walkable top)
    if (Number.isFinite(this.forest.groundY) && this.forest.groundY !== 0) this.ground.position.y = this.forest.groundY;
    applySky(U, this.forest.sky);
    this.scorch = new Scorch(U, game);
    const extent = 150;
    const meadow = meadowDensity(this.colliders, this.forest.treeSpots, this.forest.bare, extent, this.forest.slabs);
    // a set may thin and shorten its grass (`grass: { density(x, z) → 0..1 factor, height, ash }`):
    // the Ashfall courtyard's burned hillside
    const G = this.forest.grass ?? null;
    const density = typeof G?.density === 'function' ? (x, z) => meadow(x, z) * G.density(x, z) : meadow;
    const hk = Number.isFinite(G?.height) ? G.height : 1;
    const height = hk === 1 ? meadowHeight : (x, z, rng) => meadowHeight(x, z, rng) * hk;
    const q = CONFIG.quality[CONFIG.quality.length - 1];
    this.grass = createGrass(U, { count: q.grass, extent, density, height, ash: G?.ash ?? 0 });
    game.scene.add(this.grass.mesh);
    // destruction: what burns (the grass is the fuel), what breaks (the set's `breakables`), what is left
    this.fire = new GroundFire(game, this, density);
    this.scars = new Scars(game, this.forest.scarInk);
    this.destructibles = new Destructibles(game, this, this.forest);
    this.edge = this.destructibles.edge ?? null;
    this._impact = { kind: BLOW.BLUNT, by: 'world', dx: NaN, dz: NaN, y: undefined, src: -1 };
    this.atmosphere = new Atmosphere(game, this.forest);
    this.bonfire = this.forest.bonfire;
    this.nest = this.forest.nest;
    this._gust = { x: 0, z: 0, strength: 0, radius: 1 };
    this._hidden = null; // saved `visible` flags while world.debug.setVisible(false) holds

    // Lab hooks (ARCHITECTURE.md → game context → `world`): the model viewer's "dark" mode renders actors alone.
    //   setVisible(false) hides ground, grass and the forest group (trees, stones, flagstones, nest
    //   bones, bonfire) and stops the atmosphere (bonfire flames, fireflies, mist, leaves). Particles
    //   already in flight in the shared pools are dropped (mist lives ~10 s; actors re-emit theirs).
    //   setVisible(true) restores the exact previous `visible` flags. Lights, scorch and colliders
    //   are untouched.
    const world = this;
    this.debug = {
      setVisible: (on) => this._setVisible(on),
      get visible() {
        return world._hidden === null;
      },
    };
  }

  _setVisible(on) {
    const parts = [this.ground, this.grass?.mesh, this.forest?.group].filter(Boolean);
    if (!on && this._hidden === null) {
      this._hidden = parts.map((o) => [o, o.visible]);
      for (const o of parts) o.visible = false;
      this.forest?.ambience?.setVisible?.(false); // (a set's own glyph batch, e.g. the throne hall's inlay)
      this.scars?.setVisible(false);
      this.game.fx?.alpha?.clear?.();
      this.game.fx?.add?.clear?.();
      this.game.fx?.fire?.clear?.();
      this.game.fx?.shed?.clear?.();
      this.game.fx?.ripple?.clear?.();
      this.game.fx?.stamp?.clear?.();
    } else if (on && this._hidden !== null) {
      for (const [o, v] of this._hidden) o.visible = v;
      this._hidden = null;
      this.forest?.ambience?.setVisible?.(true);
      this.scars?.setVisible(true);
    }
    return this._hidden === null;
  }

  /**
   * A blow lands on the world at (x, z): every breakable the disc touches takes `power` (POWER scale,
   * breakTuning.js), and a hard one (>= SCAR.ground.min) cracks the floor. `o`: { kind: BLOW.*, by:
   * 'player' | 'boss' | 'world', dx, dz (its way), y (its height: a blow above a low piece passes
   * over it), src (one id per swing), scar: false (no floor mark), fire: k (it also sets alight) }.
   * Returns how many pieces it struck.
   */
  impact(x, z, r, power, o) {
    if (!Number.isFinite(x + z + r + power) || !(power > 0)) return 0;
    const n = this.destructibles.strike(x, z, r, power, o ?? this._impact);
    if (o?.scar !== false && power >= SCAR.ground.min) {
      this.scars.ground(x, z, power, o?.dx, o?.dz);
      // torn ground: the grass there is gone (char without heat)
      this.scorch.burnCircle(x, z, Math.min(r, 0.6 + power * 0.9), 0.5, 0);
      // a big blow leaves a crater: a rim of thrown-up earth and a charred floor that stay till the reset
      if (power >= SCAR.crater.min) {
        const cr = Math.min(r, 1.2 + power * 1.1);
        this.scars.crater(x, z, cr, power);
        this.scorch.burnCircle(x, z, cr, SCAR.crater.char, 0);
      }
    }
    if (o?.fire > 0) this.ignite(x, z, r, o.fire);
    return n;
  }

  /** Fire lands on the disc (x, z, r): the grass in it (unless `grass` is false) and the wood catch. */
  ignite(x, z, r, k = 1, grass = true) {
    const n = grass ? this.fire.ignite(x, z, r, k) : 0;
    return n + this.destructibles.ignite(x, z, r, k);
  }

  /** The fight's reset: what broke stands again, what burns goes out, the marks are gone. */
  restore() {
    this.fire.reset();
    this.scars.reset();
    this.destructibles.reset();
    // (a set whose scenes morph, ADR-157: back to its first scene, its light and its script)
    try {
      this.forest?.scenes?.reset?.();
    } catch (err) {
      console.error('[world] scenes.reset', err);
    }
  }

  /**
   * `soft`: pass through breakable wood (the wyrm's body: it fells what it walks into). `who` 'hero':
   * where the set has an edge (the forest's tree wall) the hero is kept on the ground it leaves open,
   * and `bound` is only the fallback for a set without one.
   */
  resolve(pos, radius, bound = Infinity, soft = false, who = null) {
    return resolveOn(this.colliders, this.edge, pos, radius, bound, soft, who);
  }

  /** How far from the centre the hero may stand in the direction of (x, z): m. */
  heroBound(x, z) {
    return this.edge ? this.edge.heroAt(x, z) : (CONFIG.world.playerBound ?? Infinity);
  }

  setPusher(slot, x, y, z, radius) {
    const p = this.game.U.uPushers.value[slot];
    if (p) p.set(x, y, z, radius);
  }

  clearPushers(from = 0, to = PUSHER_SLOTS) {
    for (let i = from; i < to; i++) this.game.U.uPushers.value[i].set(0, 0, 0, 0);
  }

  gust(x, z, strength = 1, radius = 12) {
    // keep the strongest recent gust
    if (strength >= this._gust.strength * 0.6) Object.assign(this._gust, { x, z, strength, radius });
  }

  setGrassQuality(count) {
    this.grass.setCount(count);
    // the destruction's phone budget follows the same preset (CONFIG.quality: LOW, MEDIUM, HIGH)
    const q = CONFIG.quality.find((p) => p.grass === count);
    if (q && QUALITY[q.name] !== undefined) this.setQuality(QUALITY[q.name]);
  }

  /** The destruction's phone budget (0.3 .. 1): debris glyphs, flames, wreckage, fires, floor marks. */
  setQuality(k) {
    if (!Number.isFinite(k)) return;
    this.quality = k;
    this.destructibles?.setQuality?.(k);
    this.scars?.setQuality?.(k);
  }

  update(dt) {
    const g = this._gust;
    g.strength *= Math.exp(-dt * 2.2);
    if (g.strength < 0.01) g.strength = 0;
    this.game.U.uGust.value.set(g.x, g.z, g.strength, g.radius);
    this.destructibles.update(dt);
    this.fire.update(dt);
    this.scars.update(this.game.fxDt ?? dt, this.game.time);
    this.scorch.update(dt);
    if (this._hidden === null) this.atmosphere.update(dt);
  }
}
