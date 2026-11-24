import { LIFE, lifeOn } from './lifeSwitch.js';
import * as WindM from './wind.js';
import * as WeatherM from './weather.js';
import * as LitterM from './litter.js';
import * as StepsM from './steps.js';
import * as CreaturesM from './creatures.js';
import * as AnswerM from './answer.js';
import * as TremorM from './tremor.js';
import * as AftermathM from './aftermath.js';

// THE LIVING WORLD (`game.world.life`; the switch: lifeSwitch.js, `?life=`).
//
// The ambient life of a level before and round the fight: one shared wind, things that fall and lie,
// footsteps that answer the ground, slow weather, small creatures, and the world's answers to the
// fight. Every piece is a LAYER: a class in its own file with its own tuning file, built here, updated
// here, and reading the others only through this object.
//
// ---- THE CONTRACT (what every layer and every outside reader may rely on) ---------------------------
//   life.on(piece)        is the piece running in this level now? (the switch AND the level)
//   life.k                the strength of all of it (LIFE.k, 0.25..2): rates and amplitudes scale by it
//   life.quality          the phone budget, 0.3..1 (world.quality): COUNTS and RATES scale by it
//   life.levelId          'cinderwood' | 'ash' | 'starless' | 'ring' | 'fox' | 'grove' | 'lab'
//   life.set              the level's set (world.forest): its bonfire, slabs, bare, treeSpots, ...
//   life.t                seconds this page load (the layers' clock)
//   life.calm             1 before the fight; eases down to LIFE_TUNE.fightCalm while the boss is up, so
//                         the ground stays readable. Every ambient RATE multiplies by it.
//   life.hush             0..1: the world holds its breath (a great blow winds up). Creatures and the
//                         air's sound go quiet by it; set with life.hushFor(sec, k).
//   life.rand() / life.range(a, b)   the living world's own random stream. NEVER Math.random (the
//                         seeded sims replay it).
//   life.build(fn)        make GPU objects (an own pool, a mesh) through this: three.js's uuids then draw
//                         from life.rand, not Math.random
//   life.focus            the camera's focus on the ground (U.uFocus.value): spawn round it
//   life.hero             { x, z, vx, vz, speed, moving }: the hero on the ground this frame
//   life.takes(what)      true when an enabled layer draws `what` itself, so atmosphere.js skips its own:
//                         'leaves' | 'fireflies' | 'mist' | 'ash'
//   life.gust(x, z, strength, radius)   world.gust() calls this: a radial burst of air (a roar, a
//                         landing, a blow). It reaches the wind (so letters in the air and on the ground
//                         are pushed) and whoever else listens.
//   life.impact(x, z, r, power, o)      world.impact() and world.groundBlow() call this: a blow landed.
//                         Every layer with an `impact` method whose piece is on gets it.
//   life.ignite(x, z, r, k)             world.ignite() calls this: fire landed. Likewise `ignite`.
//   life.action(label, run, title)      a button on the Lab's 'life' row (a gust now, rain now, ...)
//
//   life.wind             wind.js      .at(x, z, out) .front(o) .burst(x, z, s, r) .dirX .dirZ .speed .level .still
//   life.weather          weather.js   .name .wet .mist .windK
//   life.litter           litter.js    .scatter(x, z, r, k) .count
//   life.steps            steps.js     .surfaceAt(x, z) .step(x, z, o)
//   life.creatures        creatures.js .startle(x, z, r, k)
//   life.answer           answer.js
//   life.tremor           tremor.js    (piece 'answer') what stands near a heavy blow shakes
//   life.aftermath        aftermath.js (piece 'answer') what a fight leaves in the air: smoke, dust, embers
//   (a layer is always there, also when its piece is off: its methods then do nothing and its values
//    are the still-air defaults. Outside readers still write `game.world?.life?.wind?.at(...)`: the
//    headless sims run on a world mock with no life at all.)
//
// A LAYER:  class X { constructor(life) {}  update(dt) {}  clear(why) {}  setVisible(on) {}  takes(what) {} }
//   - update(dt) is called every frame the world is drawn, piece on or off: return at once when
//     `!this.life.on('<piece>')`, and leave NOTHING on screen once the piece is switched off.
//   - GPU objects (an own particle pool) are made on the first update with the piece on, never at
//     build: a level with life off must build exactly what it built before.
//   - clear('reset'): the fight was reset (world.restore): what is in the air goes; what lies may stay.
//   - no allocation per frame, no NaN, no throw (a layer that throws three times is switched off).
//
// OFF IS FREE: with `?life=off` nothing here spawns, writes a uniform or changes a pixel.

/** Shared numbers of the living world (the layers keep their own in <layer>Tuning.js). */
export const LIFE_TUNE = Object.freeze({
  /** every ambient rate is multiplied by this while the boss is up (bossIntro, boss) */
  fightCalm: 0.4,
  /** s to ease `calm` down as the fight starts, and back up after it */
  calmDown: 1.2,
  calmUp: 4,
  /** s for `hush` to fall away once its hold is over */
  hushRelease: 1.5,
  /** `calm` rises again only while `hush` is below this (the victory's lull holds the world still first) */
  calmHush: 0.5,
});

const FIGHT = new Set(['bossIntro', 'boss']);
const ORDER = ['wind', 'weather', 'litter', 'steps', 'creatures', 'answer', 'tremor', 'aftermath'];
/** the piece of the switch a layer belongs to, where it is not its own name */
const PIECE = { tremor: 'answer', aftermath: 'answer' };
const MAKERS = {
  wind: () => WindM.Wind,
  weather: () => WeatherM.Weather,
  litter: () => LitterM.Litter,
  steps: () => StepsM.Steps,
  creatures: () => CreaturesM.Creatures,
  answer: () => AnswerM.Answer,
  tremor: () => TremorM.Tremor,
  aftermath: () => AftermathM.Aftermath,
};

export class LivingWorld {
  constructor(game, world) {
    this.game = game;
    this.world = world;
    this.set = world?.forest ?? null;
    this.levelId = game?.level?.stage === 'lab' ? 'lab' : (game?.level?.id ?? 'cinderwood');
    /** the training room has no living world */
    this.enabled = this.levelId !== 'lab';
    this.t = 0;
    this.calm = 1;
    this.hush = 0;
    this._hushHold = 0;
    this._hushWant = 0;
    this._seed = 0x4c1fe5a7;
    this.hero = { x: 0, z: 0, vx: 0, vz: 0, speed: 0, moving: false };
    this._heroInit = false;
    this._focus0 = { x: 0, y: 0, z: 0 };
    this.actions = [];
    this._errs = Object.create(null);
    this.layers = [];
    for (const name of ORDER) {
      let layer = null;
      try {
        const C = MAKERS[name]();
        if (typeof C === 'function') layer = new C(this);
      } catch (err) {
        console.error(`[life] ${name} could not be built`, err);
      }
      this[name] = layer ?? NO_LAYER;
      if (layer) this.layers.push([name, layer]);
    }
    // (the arrival is the flow's, game/arrival.js: the Lab replays it from here)
    if (this.enabled) this.action('arrival (replay)', () => game?.flow?.arrival?.replay?.(), 'the camera opens wide over the level again, as on entering it');
  }

  /** Is the piece running in this level now? */
  on(piece) {
    return this.enabled && lifeOn(piece) && !(this._errs[piece] >= 3);
  }

  get k() {
    return LIFE.k;
  }

  get quality() {
    const q = this.world?.quality;
    return Number.isFinite(q) ? q : 1;
  }

  get focus() {
    return this.game?.U?.uFocus?.value ?? this._focus0;
  }

  rand() {
    this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }

  range(a, b) {
    return a + (b - a) * this.rand();
  }

  /**
   * Make GPU objects (a pool, a mesh) inside the living world: three.js draws a uuid from Math.random
   * for every geometry / material / mesh, so while `fn` runs those draws come from life.rand instead
   * and the seeded fights' Math.random is never moved. Returns what fn returns; a throw is passed on.
   */
  build(fn) {
    const mr = Math.random;
    Math.random = () => this.rand();
    try {
      return fn();
    } finally {
      Math.random = mr;
    }
  }

  /** The world holds its breath for `sec` s (k: how deeply, 0..1). */
  hushFor(sec, k = 1) {
    if (!Number.isFinite(sec) || !(sec > 0)) return;
    this._hushHold = Math.max(this._hushHold, sec);
    this._hushWant = Math.max(this._hushWant, Math.min(1, Math.max(0, Number.isFinite(k) ? k : 1)));
  }

  /** Does an enabled layer draw this itself ('leaves' | 'fireflies' | 'mist' | 'ash')? */
  takes(what) {
    if (!this.enabled) return false;
    for (const [name, layer] of this.layers) {
      if (!this.on(name)) continue;
      try {
        if (layer.takes?.(what) === true) return true;
      } catch {
        /* a layer that cannot say takes nothing */
      }
    }
    return false;
  }

  /** world.gust() lands here: a radial burst of air at (x, z). */
  gust(x, z, strength = 1, radius = 12) {
    if (!this.enabled || !Number.isFinite(x + z + strength + radius)) return;
    if (this.on('wind')) this._call('wind', 'burst', x, z, strength, radius);
    // a strong burst startles what lives in its radius (the answer's, rate-limited there)
    if (this.on('answer')) this._call('answer', 'gust', x, z, strength, radius);
  }

  /**
   * A blow landed on the world (world.impact and world.groundBlow call this): at (x, z), reach r m,
   * `power` on the POWER scale (0.3 light, 1 heavy, 2 the biggest), `o` the blow's record (kind, by,
   * dx, dz, len, hot; may be undefined). Every layer with an `impact(x, z, r, power, o)` method whose
   * piece is on gets it: what stands near shakes (tremor), what lives near flees (creatures), what
   * lies is thrown (litter), dust and smoke stay after (aftermath).
   */
  impact(x, z, r = 2, power = 1, o = undefined) {
    if (!this.enabled || !Number.isFinite(x + z + r + power)) return;
    for (const [name, layer] of this.layers) {
      if (typeof layer.impact !== 'function' || !this.on(PIECE[name] ?? name)) continue;
      this._call(name, 'impact', x, z, r, power, o);
    }
  }

  /** Fire landed on the disc (x, z, r) with strength k (world.ignite calls this): every layer with an
   *  `ignite(x, z, r, k)` method whose piece is on gets it (birds leave, smoke rises after). */
  ignite(x, z, r = 2, k = 1) {
    if (!this.enabled || !Number.isFinite(x + z + r + k)) return;
    for (const [name, layer] of this.layers) {
      if (typeof layer.ignite !== 'function' || !this.on(PIECE[name] ?? name)) continue;
      this._call(name, 'ignite', x, z, r, k);
    }
  }

  /** A button on the Lab's 'life' row. */
  action(label, run, title = '') {
    if (typeof label === 'string' && typeof run === 'function') this.actions.push({ label, run, title });
  }

  _call(name, method, a, b, c, d, e) {
    const layer = this[name];
    if (typeof layer?.[method] !== 'function') return undefined;
    try {
      return layer[method](a, b, c, d, e);
    } catch (err) {
      this._fail(name, err);
      return undefined;
    }
  }

  _fail(name, err) {
    const n = (this._errs[name] = (this._errs[name] ?? 0) + 1);
    if (n <= 3) console.error(`[life] ${name}${n === 3 ? ' (switched off)' : ''}`, err);
  }

  _readHero(dt) {
    const p = this.game?.player?.position, h = this.hero;
    if (!p || !Number.isFinite(p.x + p.z)) return;
    if (this._heroInit && dt > 1e-5) {
      const vx = (p.x - h.x) / dt, vz = (p.z - h.z) / dt;
      // (a teleport is not a sprint)
      const ok = Math.abs(vx) < 40 && Math.abs(vz) < 40;
      h.vx = ok ? vx : 0;
      h.vz = ok ? vz : 0;
    }
    h.x = p.x;
    h.z = p.z;
    h.speed = Math.hypot(h.vx, h.vz);
    h.moving = h.speed > 0.8;
    this._heroInit = true;
  }

  update(dt) {
    if (!this.enabled || !Number.isFinite(dt) || !(dt > 0)) return;
    this.t += dt;
    this._readHero(dt);
    // calm: the ambient life thins while the boss is up
    const want = FIGHT.has(this.game?.state) ? LIFE_TUNE.fightCalm : 1;
    const tau = want < this.calm ? LIFE_TUNE.calmDown : LIFE_TUNE.calmUp;
    // (the life comes back only once a held breath is let go: after the victory's lull, not through it)
    if (want < this.calm || this.hush < LIFE_TUNE.calmHush) this.calm += (want - this.calm) * (1 - Math.exp(-dt / tau));
    // hush: held, then let go
    if (this._hushHold > 0) {
      this._hushHold -= dt;
      this.hush += (this._hushWant - this.hush) * (1 - Math.exp(-dt / 0.25));
    } else {
      this._hushWant = 0;
      this.hush *= Math.exp(-dt / LIFE_TUNE.hushRelease);
      if (this.hush < 0.002) this.hush = 0;
    }
    for (const [name, layer] of this.layers) {
      if (this._errs[name] >= 3) continue;
      try {
        layer.update?.(dt);
      } catch (err) {
        this._fail(name, err);
      }
    }
  }

  /** why: 'reset' (the fight was reset) | 'hide' (the Lab hides the world). */
  clear(why = 'reset') {
    this.hush = this._hushHold = this._hushWant = 0;
    for (const [name, layer] of this.layers) {
      try {
        layer.clear?.(why);
      } catch (err) {
        this._fail(name, err);
      }
    }
  }

  setVisible(on) {
    for (const [name, layer] of this.layers) {
      try {
        layer.setVisible?.(!!on);
      } catch (err) {
        this._fail(name, err);
      }
    }
    if (!on) this.clear('hide');
  }
}

/** What stands in for a layer that could not be built: every call is a no-op. */
const NO_LAYER = Object.freeze({
  still: true, dirX: 1, dirZ: 0, speed: 0, level: 0, name: 'clear', wet: 0, mist: 0, windK: 1, count: 0,
  at(x, z, out) {
    if (out) out.x = out.z = out.k = 0;
    return out;
  },
  front() {}, burst() {}, scatter() {}, step() {}, startle() {}, surfaceAt: () => 'grass',
});
