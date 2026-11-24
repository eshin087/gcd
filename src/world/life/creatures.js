import { CREATURES_TUNE as TUNE } from './creaturesTuning.js';
import { FAUNA_TUNE as FT } from './faunaTuning.js';
import { gi } from '../../render/glyphs.js';
import { LetterBatch } from './letterBatch.js';
import { Flocks } from './flock.js';
import { Animals } from './animals.js';

// THE CREATURES (piece 'creatures'): small living things, one letter each, that mind the hero: birds
// that lift off, moths round a flame, fireflies that part from his path. Nothing to hit, nothing that
// hits. The interface is fixed (life.js, "THE CONTRACT").
//
//   creatures.startle(x, z, r, k)   everything alive within r of (x, z) flees (k: how hard: 1 = a roar);
//                                   returns how many fled
// With the piece off: startle does nothing.
//
// Added (read-only, for the tests and the Lab):
//   creatures.fireflies / .moths / .birds / .sparks   the records (fixed arrays, built on the first update
//                                   with the piece on); a bird's `state` is 'perched' | 'flying' | 'away'
//   creatures.hawk                  the ring's hawk record or null; `hawk.on` while it is in the sky
//   creatures.drawn                { alpha, add }: letters drawn this frame per shared pool
//   creatures.returnBirds()         every bird whose perch stands goes back to it now (the Lab button)
//
// Each creature is a record in a fixed array, re-emitted every frame as a one-frame particle (as
// atmosphere.js drew its fireflies): fireflies in the additive pool, the rest in the alpha pool. The
// numbers and the per-level choices: creaturesTuning.js. No allocation per frame, no Math.random (the
// living world's own stream, life.rand), nothing outside the living world without `?.`.
//
// THE FAUNA (2026-11-23; flock.js, animals.js, faunaTuning.js): the flocks hidden in a level's canopy
// that burst out and wheel away when fire, a heavy blow, a falling or burning tree or a roar reaches
// them, and the small ground animals that bolt into cover when the hero or the fight comes near. Both
// print in the house letter, in one LetterBatch of the creatures' own (made on the first update with
// the piece on, on the fauna's own seeded stream, as the wind's wisps: how many there are never moves
// what the other layers draw). Added:
//   creatures.impact(x, z, r, power, o) / .ignite(x, z, r, k)   (life.impact / life.ignite call them)
//   creatures.fell(x, z, kind)       a tree fell, crashed or caught (answer.js routes world:impact here)
//   creatures.flocks / .animals      the two (read-only, for the tests and the Lab); drawn.letters
//   Lab: 'flock flees', 'animals bolt', 'life returns'
//
// Per level: Cinderwood: fireflies (they take over atmosphere.js's), small birds on the tree wall, moths
// round the bonfire. Ashfall: crows on the pillars, a few moths. The Obsidian Throne: nothing alive (sparks
// at the vents were tried and cut: creaturesTuning `sparks.perVent` 0). The Skybreak Ring: one hawk circling high before the fight, moths
// at the bonfire and the braziers. The Foxfire Terrace: foxfire (paler, bluer fireflies that keep wider),
// birds on the dead trees, moths. The Windless Grove: fireflies hanging almost still, moths.

const FIGHT = new Set(['bossIntro', 'boss']);
const PERCHED = 'perched', FLYING = 'flying', AWAY = 'away';
const TAU = Math.PI * 2;
/** how much alarming gust wind.at() reported (its `alarm`; `k` from a wind without one) */
const alarmAt = (w) => {
  const a = w ? (w.alarm ?? w.k) : 0;
  return Number.isFinite(a) ? a : 0;
};
const NONE = Object.freeze([]);
const BSL = String.fromCharCode(92); // (a back-slash)
// (the game camera's view down: CONFIG.camera.pitch, 58 degrees; used when the camera is not there)
const SIN_PITCH = Math.sin((58 * Math.PI) / 180), COS_PITCH = Math.cos((58 * Math.PI) / 180);

export class Creatures {
  constructor(life) {
    this.life = life;
    this.L = TUNE.levels[life.levelId] ?? null;
    this.visible = true;
    this.ready = false;
    this.fireflies = NONE;
    this.moths = NONE;
    this.birds = NONE;
    this.sparks = NONE;
    this.hawk = null;
    this.t = 0;
    /** letters drawn this frame per pool (the tests, the Lab) */
    this.drawn = { alpha: 0, add: 0 };
    // the spawn record and its colour (reused: no allocation per frame)
    this._c = [0, 0, 0];
    this._p = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.2, sizeEnd: 0.2, glyph: 0,
      color: this._c, colorEnd: this._c, alpha: 1, alphaEnd: 1, rot: 0, spin: 0, drag: 0, gravity: 0, flicker: 0,
    };
    this._w = { x: 0, z: 0, k: 0 };
    this._g = null; // glyph indices (looked up on the first update)
    // the fauna (flocks, animals) and their letters: built on the first update with the piece on
    this.FL = FT.levels[life.levelId] ?? null;
    this.flocks = null;
    this.animals = null;
    this.letters = null;
    this._hidden = false;
    this._fs = 0;
    this._fought = false;
    /** s since the boss was last up (or since the page loaded): the fauna's return clock */
    this._calmT = 0;
    this._ar = 0; // (round-robin: the animal whose gust check runs this frame)
    this.drawn.letters = 0;
    this._fc = [0, 0, 0];
    this._makePutters();
    life.action?.('startle at hero', () => {
      const h = this.life.hero;
      return this.startle(h.x, h.z, 14, 1);
    }, 'everything alive within 14 m of the hero flees');
    life.action?.('birds return', () => this.returnBirds(), 'every bird whose perch stands goes back to it now');
    life.action?.('flock flees', () => this.flockFlees(), 'the roost nearest the camera that still has birds bursts out, away from the hero');
    life.action?.('animals bolt', () => {
      const h = this.life.hero;
      return this._ready() ? this.animals.alarm(h.x, h.z, 60, 'lab') : 0;
    }, 'every animal within 60 m of the hero bolts for cover');
    life.action?.('life returns', () => this.lifeReturns(), 'the roosts fill again (a few birds fly in), the animals are back, the birds on their perches');
  }

  /** The fauna's own stream (an LCG seeded once from the level: never life.rand, never Math.random). */
  _fr() {
    this._fs = (Math.imul(this._fs, 1664525) + 1013904223) >>> 0;
    return this._fs / 4294967296;
  }

  /** Build the fauna (once, the piece on). True when there is any. */
  _ready() {
    if (!this.life.on('creatures')) return false;
    if (!this.ready) this._build();
    return !!this.flocks;
  }

  _buildFauna() {
    const life = this.life;
    let h = 0x6fa1ab3d;
    for (const ch of String(life.levelId)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    this._fs = h;
    const rand = () => this._fr();
    this.flocks = new Flocks(life, this.FL, rand);
    this.animals = new Animals(life, this.FL, rand);
    if (!this.flocks.roosts.length && !this.animals.list.length) return;
    if (!life.game?.U) return;
    // the letters: one batch (normal blending), made with the fauna's stream standing in for Math.random
    const mr = Math.random;
    Math.random = rand;
    try {
      this.letters = new LetterBatch(life.game, FT.max, FT.letters, { rand });
      this._lc = {};
      for (const c of FT.letters) this._lc[c] = this.letters.col(c);
      const F = this.flocks.F;
      this._wing = F.wings.map((c) => this.letters.col(c));
      this.letters.mesh.visible = this.visible;
      life.game.pipeline?.registerParticles?.(this.letters);
    } catch {
      this.letters = null;
    } finally {
      Math.random = mr;
    }
  }

  /** The Lab: the roost nearest the camera's focus with birds in it bursts out, away from the hero. */
  flockFlees() {
    if (!this._ready()) return 0;
    const f = this.life.focus, h = this.life.hero, F = this.flocks;
    F._last = -1e9; // (the Lab does not wait for the gap)
    const R = F._nearest(f.x ?? 0, f.z ?? 0, 1e9);
    return R ? F.flush(R, h.x, h.z, 'lab') : 0;
  }

  /** The Lab: life comes back now (the roosts, the animals, the perched birds). */
  lifeReturns() {
    if (!this._ready()) return 0;
    const F = this.flocks;
    F._last = -1e9;
    // (one flies in where it shows; the rest are simply full again)
    const R = F.roosts.find((o) => o.birds < o.full && F._standing(o));
    if (R) F._inbound(R);
    return F.refill(true) + this.animals.returnAll() + this.returnBirds();
  }

  /** A blow landed (life.impact): a roost near a heavy one goes, the animals near it bolt. */
  impact(x, z, r, power, o) {
    if (!Number.isFinite(x + z + r + power) || !this._ready()) return 0;
    const n = this.flocks.blow(x, z, r, power);
    return n + this.animals.alarm(x, z, r + 6 + 6 * Math.min(2, Math.max(0, power)), 'blow');
  }

  /** Fire landed (life.ignite): the roost it reaches goes, the animals near it bolt. */
  ignite(x, z, r, k) {
    if (!Number.isFinite(x + z + r) || !this._ready()) return 0;
    return this.flocks.fire(x, z, r) + this.animals.alarm(x, z, r + 8, 'fire');
  }

  /** A tree fell, crashed or caught at (x, z) (answer.js, from world:impact). */
  fell(x, z, kind = '') {
    if (!Number.isFinite(x + z) || !this._ready()) return 0;
    return this.flocks.fell(x, z) + this.animals.alarm(x, z, 10, kind || 'fell');
  }

  // ------------------------------------------------------------------ build (once, piece on)

  _build() {
    this.ready = true;
    const L = this.L, life = this.life;
    this._buildFauna();
    if (!L) return;
    const F = TUNE.firefly, M = TUNE.moth;
    this._g = {
      firefly: gi(F.glyph), moth: M.glyphs.map(gi), hawk: gi(TUNE.hawk.glyph), hawkFlap: gi(TUNE.hawk.flap),
      wing: gi(TUNE.hawk.wing), wingL: gi(TUNE.hawk.wingUpL), wingR: gi(TUNE.hawk.wingUpR),
      shadow: gi(TUNE.hawk.shadow), spark: gi(TUNE.spark.glyph),
      small: { rest: gi(TUNE.birds.small.perched), wings: TUNE.birds.small.wings.map(gi) },
      crow: { rest: gi(TUNE.birds.crow.perched), wings: TUNE.birds.crow.wings.map(gi) },
    };
    const set = life.set ?? {};
    // fireflies: most where they always were (r 22 - 46), some inside the clearing's rim
    if (L.fireflies) {
      const o = L.fireflies, n = o.n | 0, inner = Math.min(n, o.inner | 0);
      this.fireflies = new Array(n);
      for (let i = 0; i < n; i++) {
        const a = life.rand() * TAU;
        const rr = i < inner ? o.innerR : o.r;
        const r = life.range(rr[0], rr[1]);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        this.fireflies[i] = {
          x, z, y: life.range(F.y[0], F.y[1]), hx: x, hz: z, vx: 0, vz: 0, fx: 0, fz: 0,
          p: life.rand() * 100, s: life.range(0.4, 1), q: life.rand(),
        };
      }
      this._ff = {
        color: o.color ?? F.color, r: o.hr ?? F.r, runR: o.runR ?? F.runR,
        wander: o.wander ?? F.wander, wind: o.windK ?? F.wind,
      };
    }
    // moths: round the bonfire, and (the ring) round each brazier
    if (L.moths) {
      const fires = [];
      const bf = set.bonfire;
      if (bf && Number.isFinite(bf.x + bf.z)) fires.push({ x: bf.x, z: bf.z, y: 0, n: L.moths.n | 0, def: null });
      if (L.moths.braziers) {
        for (const d of set.breakables ?? NONE) {
          if (d?.kind === 'post' && Number.isFinite(d.x + d.z + d.h)) fires.push({ x: d.x, z: d.z, y: Math.max(0, d.h - 0.6), n: L.moths.braziers | 0, def: d });
        }
      }
      const list = [];
      for (const f of fires) {
        const P = { def: f.def, piece: undefined };
        for (let i = 0; i < f.n; i++) {
          list.push({
            cx: f.x, cz: f.z, cy: f.y, post: P,
            r: life.range(M.r[0], M.r[1]), a: life.rand() * TAU, w: life.range(M.w[0], M.w[1]) * (life.rand() < 0.5 ? -1 : 1),
            y: life.range(M.y[0], M.y[1]), beat: life.range(M.beat[0], M.beat[1]), wf: life.range(M.wobbleHz[0], M.wobbleHz[1]),
            p: life.rand() * 100, fear: 0, q: life.rand(), x: f.x, z: f.z, py: f.y,
          });
        }
      }
      this.moths = list;
    }
    // birds: perches computed once from the set's data (its breakables' positions and heights)
    if (L.birds) this.birds = this._perch(L.birds, set);
    // the throne: a few dim sparks on slow orbits round each vent
    if (L.sparks) {
      const S = TUNE.spark, vents = set.vents ?? VENTS_STARLESS, list = [];
      for (const v of vents) {
        for (let i = 0; i < (L.sparks.perVent | 0); i++) {
          list.push({
            cx: v[0], cz: v[1], r: life.range(S.r[0], S.r[1]), y: life.range(S.y[0], S.y[1]), a: life.rand() * TAU,
            w: life.range(S.w[0], S.w[1]) * (life.rand() < 0.5 ? -1 : 1), pulse: life.range(S.pulse[0], S.pulse[1]),
            p: life.rand() * 100, q: life.rand(),
          });
        }
      }
      this.sparks = list;
    }
    if (L.hawk) {
      const f = life.focus;
      this.hawk = {
        on: true, leaving: false, gone: 0, a: life.rand() * TAU,
        cx: f.x ?? 0, cz: (f.z ?? 0) + TUNE.hawk.south, x: 0, y: TUNE.hawk.y, z: 0, vx: 0, vy: 0, vz: 0,
        flapT: life.range(TUNE.hawk.flapEvery[0], TUNE.hawk.flapEvery[1]), flap: 0,
      };
    }
  }

  /** The perches of a level: canopy or pillar tops of the set's breakables, picked once. */
  _perch(o, set) {
    const life = this.life, A = TUNE.alarm;
    const B0 = o.kind === 'crow' ? TUNE.birds.crow : TUNE.birds.small;
    // (a level may dress its birds: `look` overrides the kind's numbers there)
    const B = o.look ? Object.freeze({ ...B0, ...o.look }) : B0;
    const cand = [];
    for (const d of set.breakables ?? NONE) {
      if (!d || !o.kinds.includes(d.kind) || !Number.isFinite(d.x + d.z + d.h)) continue;
      const rad = Math.hypot(d.x, d.z);
      if (rad < o.r[0] || rad > o.r[1] || d.h < (o.minH ?? 2)) continue;
      cand.push(d);
    }
    const birds = [];
    const groups = Math.min(o.groups | 0, cand.length);
    for (let gi2 = 0; gi2 < groups; gi2++) {
      const j = gi2 + Math.floor(life.rand() * (cand.length - gi2));
      const d = cand[j];
      cand[j] = cand[gi2];
      cand[gi2] = d;
      const rad = Math.hypot(d.x, d.z) || 1;
      const ix = -d.x / rad, iz = -d.z / rad; // toward the clearing
      const crown = (o.inK ?? 0) * (d.r / 0.45) * 2.6;
      const bx = d.x + ix * crown, bz = d.z + iz * crown, by = d.h * (o.yK ?? 1);
      const P = { def: d, piece: undefined };
      const n = Math.round(life.range(o.perGroup[0], o.perGroup[1]));
      for (let i = 0; i < n; i++) {
        const s = (i - (n - 1) / 2) * A.spread * (o.kind === 'crow' ? 0.6 : 1);
        const px = bx - iz * s + life.range(-0.15, 0.15), pz = bz + ix * s + life.range(-0.15, 0.15);
        const py = by + life.range(-0.25, 0.15);
        birds.push({
          B, crow: o.kind === 'crow', post: P, px, py, pz, x: px, y: py, z: pz, vx: 0, vy: 0, vz: 0,
          state: PERCHED, t: 0, delay: 0, beat: life.range(B.beat[0], B.beat[1]), p: life.rand() * 10, q: life.rand(),
        });
      }
    }
    return birds;
  }

  // ------------------------------------------------------------------ the interface

  /** Everything alive within r of (x, z) flees (k: how hard). Returns how many fled. */
  startle(x, z, r = 10, k = 1) {
    if (!this.life.on('creatures') || !Number.isFinite(x + z + r + k) || !(r > 0)) return 0;
    if (!this.ready) this._build();
    const kk = Math.max(0, k) * this.life.k, F = TUNE.firefly;
    // the fauna: one roost (the nearest, the flocks' limits hold the rest), the animals in reach
    let n = this.flocks ? this.flocks.startle(x, z, r, k) + (k >= 0.3 ? this.animals.alarm(x, z, r, 'startle') : 0) : 0;
    for (const f of this.fireflies) {
      const dx = f.x - x, dz = f.z - z, d = Math.hypot(dx, dz);
      if (d > r) continue;
      const s = (F.flee * kk * (1 - (0.5 * d) / r)) / (d || 1);
      f.fx += (d > 1e-3 ? dx : 1) * s;
      f.fz += (d > 1e-3 ? dz : 0) * s;
      n++;
    }
    for (const m of this.moths) {
      if (Math.hypot(m.x - x, m.z - z) > r) continue;
      m.fear = 1;
      n++;
    }
    for (const b of this.birds) {
      if (b.state !== PERCHED || Math.hypot(b.px - x, b.pz - z) > r) continue;
      this._takeOff(b, x, z, 0);
      n++;
    }
    return n;
  }

  /** Every bird whose perch stands goes back to it now (the Lab). */
  returnBirds() {
    let n = 0;
    for (const b of this.birds) {
      if (b.state === PERCHED || !this._standing(b.post)) continue;
      this._land(b);
      n++;
    }
    return n;
  }

  takes(what) {
    return what === 'fireflies' && !!this.L?.fireflies;
  }

  setVisible(on) {
    this.visible = !!on;
    if (this.letters) {
      this.letters.mesh.visible = this.visible;
      if (!this.visible) this.letters.empty();
    }
  }

  clear(why) {
    if (!this.ready) return;
    this.flocks?.clear(why);
    this.animals?.clear(why);
    if (why === 'reset') this._calmT = 0;
    for (const f of this.fireflies) f.vx = f.vz = f.fx = f.fz = 0;
    for (const m of this.moths) m.fear = 0;
    if (why !== 'reset') return;
    // the fight was reset: perches are refilled where the camera does not look; the rest stay away
    for (const b of this.birds) {
      if (b.state === PERCHED) continue;
      if (this._standing(b.post) && !this._inView(b.px, b.pz)) this._land(b);
      else if (b.state === FLYING) this._away(b);
    }
    const h = this.hawk;
    if (h) {
      h.leaving = false;
      h.on = true;
      h.gone = 0;
    }
  }

  // ------------------------------------------------------------------ the frame

  update(dt) {
    const life = this.life;
    this.drawn.alpha = this.drawn.add = this.drawn.letters = 0;
    if (!life.on('creatures') || !(dt > 0)) {
      // (switched off: nothing stays on screen)
      if (this.letters && this.letters.count) this.letters.empty();
      return;
    }
    if (!this.ready) this._build();
    this._fauna(dt);
    if (!this.L) return;
    this.t += dt;
    const fx = life.game?.fx;
    const draw = this.visible;
    // (counts thin with the phone's budget and the fight's calm: a record draws while q < keep)
    // (the fight thins them more than its calm: calm^1.5, so the ground the fight is read on clears)
    const cm = Math.max(0, Math.min(1, life.calm));
    const keep = Math.max(0, Math.min(1, life.quality)) * cm * Math.sqrt(cm);
    this._fireflies(dt, keep, draw ? fx?.add : null);
    this._moths(dt, keep, draw ? fx?.alpha : null);
    this._birds(dt, draw ? fx?.alpha : null);
    this._hawk(dt, draw ? fx?.alpha : null);
    this._sparks(dt, keep, draw ? fx?.add : null);
  }

  // ------------------------------------------------------------------ the fauna

  _fauna(dt) {
    const life = this.life, F = this.flocks, A = this.animals;
    if (!F) return;
    const fight = FIGHT.has(life.game?.state);
    if (fight) {
      this._calmT = 0;
      this._fought = true;
    } else this._calmT += dt;
    const back = fight ? -1 : this._calmT;
    const B = this.letters, draw = !!B && this.visible;
    if (draw) {
      B.begin();
      this._cam();
    }
    F.update(dt, fight, back, draw ? this._putBird : null);
    // a gust's alarm reaches one sitting animal a frame (round-robin): it bolts away from the wind
    const n = A.list.length;
    if (n && TUNE.alarm.gust < 1) {
      const a = A.list[(this._ar = (this._ar + 1) % n)];
      if (a.state === 'sit' && alarmAt(life.wind?.at?.(a.x, a.z, this._w)) > TUNE.alarm.gust) {
        A.alarm(a.x, a.z, 3, 'gust');
      }
    }
    A.update(dt, fight, back, life.hero, draw ? this._putAnimal : null);
    if (draw) {
      B.end();
      this.drawn.letters = B.count;
    }
  }

  /** The camera this frame, for the letters (right, up, where it is, metres a pixel per metre away). */
  _cam() {
    const g = this.life.game, U = g?.U, cam = g?.camera, c = this._camR;
    const R = U?.uCamRight?.value, Up = U?.uCamUp?.value, P = cam?.position;
    c.rx = R?.x ?? 1; c.ry = R?.y ?? 0; c.rz = R?.z ?? 0;
    c.ux = Up?.x ?? 0; c.uy = Up?.y ?? 1; c.uz = Up?.z ?? 0;
    const f = this.life.focus;
    if (P && Number.isFinite(P.x + P.y + P.z)) {
      c.x = P.x; c.y = P.y; c.z = P.z;
    } else {
      c.x = f.x ?? 0; c.y = 30.5; c.z = (f.z ?? 0) + 19.1;
    }
    const fov = Number.isFinite(cam?.fov) ? cam.fov : 50, resY = U?.uResolution?.value?.y || 720;
    c.mk = (2 * Math.tan((fov * Math.PI) / 360)) / resY;
    const cell = g?.pipeline?.artCell;
    c.cw = cell?.x > 0 ? cell.x : 5;
    c.ch = cell?.y > 0 ? cell.y : 8;
    const b = g?.dragon?.position ?? g?.boss?.position;
    c.bx = b && Number.isFinite(b.x + b.z) ? b.x : 1e9;
    c.bz = b && Number.isFinite(b.x + b.z) ? b.z : 1e9;
    c.hush = 1 - 0.5 * this.life.hush;
    this._boss = g?.dragon ?? g?.boss ?? null;
  }

  /** Where (x, y, z) shows on the ground (the camera's line of sight through it), into this._gp. */
  _ground(x, y, z) {
    const c = this._camR, o = this._gp;
    o[0] = x; o[1] = z;
    if (y > 0.02 && c.y > y + 0.1) {
      const t = c.y / (c.y - y);
      o[0] = c.x + (x - c.x) * t;
      o[1] = c.z + (z - c.z) * t;
    }
    return o;
  }

  /** Does a letter at (x, y, z) print over a fighter? (the hero within `clear` m where it shows on the
   *  ground; the boss: over any of its hurt spheres (the wyrm's, a duelist's) with `clear` to spare, else
   *  within 2 x clear of where it stands) */
  _overFighter(x, y, z, clear) {
    const h = this.life.hero, g = this._ground(x, y, z), gx = g[0], gz = g[1];
    if (Math.hypot(gx - h.x, gz - h.z) < clear) return true;
    const b = this._boss;
    const H = b?.hurtSpheres;
    if (Array.isArray(H) && H.length) {
      for (let i = 0; i < H.length; i++) {
        const s = H[i];
        if (!s || !Number.isFinite(s.x + s.y + s.z)) continue;
        const q = this._ground(s.x, s.y, s.z), r = (s.r || 1) * (s.y > 0.5 ? this._camR.y / Math.max(1, this._camR.y - s.y) : 1) + clear;
        if (Math.abs(q[0] - gx) < r && Math.abs(q[1] - gz) < r && Math.hypot(q[0] - gx, q[1] - gz) < r) return true;
      }
      // (_ground overwrote _gp: the letter's point again for the next test)
      return false;
    }
    const c = this._camR;
    return Math.hypot(gx - c.bx, gz - c.bz) < clear * 2;
  }

  _makePutters() {
    this._gp = [0, 0];
    this._boss = null;
    this._camR = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, x: 0, y: 30, z: 19, mk: 0.001, cw: 5, ch: 8, bx: 1e9, bz: 1e9, hush: 1 };
    /** one bird: a wing letter (0, 1: the beat; 2: a glide) */
    this._putBird = (x, y, z, g, a) => {
      const F = this.flocks.F, c = this._camR;
      if (this._overFighter(x, y, z, F.clear)) return;
      const col = this._fc, k = c.hush;
      col[0] = F.color[0] * k; col[1] = F.color[1] * k; col[2] = F.color[2] * k;
      this.letters.put(x, y, z, 0, this._wing[g] ?? 0, 0, col, F.alpha * a);
    };
    /** one animal: its body's letters laid on the screen's grid round its point, facing its way */
    this._putAnimal = (a) => {
      const K = a.K, c = this._camR, B = this.letters, life = this.life;
      if (!(a.q < Math.max(0.34, life.quality)) && !a.o.once) return;
      const col = this._fc;
      if (a.state === 'hid' || a.state === 'gone') {
        // the fox's foxfire glint, hanging where it slipped into the dark
        if (!(a.glint > 0) || !K.tail) return;
        const t = a.glint / K.glint;
        col[0] = K.tail[0]; col[1] = K.tail[1]; col[2] = K.tail[2];
        B.put(a.gx, K.y + 0.2 + (1 - t) * 0.4, a.gz, 0, this._lc["'"], 0, col, 0.55 * t * Math.min(1, (1 - t) * 6));
        return;
      }
      let frame = K.sit;
      const moving = a.state === 'run';
      if (moving) {
        const R = K.run;
        if (K.air && a.y > K.arc * 0.55) frame = K.air;
        else if (a.look > 0) frame = K.sit;
        else if (K.gait === 'hop' && a.pause > 0) frame = R[0];
        else if (K.gait === 'scuttle' && a.pause > 0) frame = K.sit;
        else if (K.gait === 'dart' && a.pause > 0) frame = K.sit;
        else frame = R[(K.gait === 'hop' ? (a.hop < 0.5 ? 1 : 0) : Math.floor(a.hop * 2)) % R.length];
      } else if (a.twitch > 0 && K.run) frame = K.run[0];
      const alpha = (moving ? K.alpha[1] : K.alpha[0]) * a.a;
      if (!(alpha > 0.01)) return;
      // its point, drawn `front` m toward the camera (the grass and the stones are depth-tested)
      let x = a.x, y = K.y + a.y, z = a.z;
      if (this._overFighter(x, y, z, 1.4)) return;
      let dx = c.x - x, dy = c.y - y, dz = c.z - z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      const f = (K.front ?? 1) / dist;
      x += dx * f; y += dy * f; z += dz * f;
      // facing: the way it runs on screen (the fox looking back: at the hero)
      let fx = Math.cos(a.yaw), fz = Math.sin(a.yaw);
      if (a.look > 0 || a.state === 'wait') { fx = life.hero.x - a.x; fz = life.hero.z - a.z; }
      const s = fx * c.rx + fz * c.rz < 0 ? -1 : 1;
      const m = (dist - (K.front ?? 1)) * c.mk, pw = c.cw * m, ph = c.ch * m;
      const k = c.hush;
      for (let i = 0; i < frame.length; i++) {
        const L = frame[i];
        const ox = s * L[0] * pw, oy = L[1] * ph;
        let ch = L[2];
        if (s < 0) ch = ch === '/' ? BSL : ch === BSL ? '/' : ch;
        const tail = K.tail && i === 0;
        const cc = tail ? K.tail : K.color;
        col[0] = cc[0] * k; col[1] = cc[1] * k; col[2] = cc[2] * k;
        B.put(x + c.rx * ox + c.ux * oy, y + c.ry * ox + c.uy * oy, z + c.rz * ox + c.uz * oy, 0, this._lc[ch] ?? 0, 0, col, alpha * (tail ? 0.8 : 1));
      }
    };
  }

  _emit(pool, x, y, z, glyph, size, r, g, b, alpha, dt) {
    if (!pool) return;
    const p = this._p, c = this._c;
    p.x = x; p.y = y; p.z = z;
    p.life = dt * 1.5 + 0.001;
    p.size = p.sizeEnd = size;
    p.glyph = glyph;
    c[0] = r; c[1] = g; c[2] = b;
    p.alpha = p.alphaEnd = alpha;
    if (pool.spawn(p) >= 0) {
      if (pool === this.life.game?.fx?.add) this.drawn.add++;
      else this.drawn.alpha++;
    }
  }

  /** As _emit, moved `front` m toward the camera along its view of the point: the same place on screen,
   *  but in front of the crown or pillar it sits on (the particles are depth-tested against the scene). */
  _emitFront(pool, x, y, z, front, glyph, size, r, g, b, alpha, dt) {
    if (!pool) return;
    const cam = this.life.game?.camera?.position;
    let dx = 0, dy = SIN_PITCH, dz = COS_PITCH;
    if (cam && Number.isFinite(cam.x + cam.y + cam.z)) {
      dx = cam.x - x; dy = cam.y - y; dz = cam.z - z;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
    }
    const f = front || 0;
    this._emit(pool, x + dx * f, y + dy * f, z + dz * f, glyph, size, r, g, b, alpha, dt);
  }

  _fireflies(dt, keep, pool) {
    if (!this.fireflies.length) return;
    const life = this.life, F = TUNE.firefly, O = this._ff, h = life.hero, k = life.k;
    const w = life.wind?.at?.(0, 0, this._w);
    const wx = (w?.x || 0) * O.wind, wz = (w?.z || 0) * O.wind;
    const R = h.moving && h.speed > TUNE.alarm.run ? O.runR : O.r;
    const flee = Math.exp(-dt * F.fleeDecay), ease = 1 - Math.exp(-dt * F.ease), home = 1 - Math.exp(-dt * F.home);
    const dim = 1 - F.hush * life.hush;
    const col = O.color;
    for (const f of this.fireflies) {
      const t = this.t * f.s + f.p;
      // its own wander (as before), the wind, and an ease back to where it lives
      f.x += Math.sin(t * 0.7) * dt * O.wander + wx * dt + (f.hx - f.x) * home;
      f.z += Math.cos(t * 0.53 + 1.3) * dt * O.wander + wz * dt + (f.hz - f.z) * home;
      f.y = Math.min(3.4, Math.max(0.3, f.y + Math.sin(t * 1.3) * dt * 0.35 * (O.wander / F.wander)));
      // the hero: a soft push out of R (it closes again behind him: the ease home)
      const dx = f.x - h.x, dz = f.z - h.z, d = Math.hypot(dx, dz);
      let tx = 0, tz = 0;
      if (d < R) {
        const s = (F.push * k * (1 - d / R)) / (d || 1);
        tx = (d > 1e-3 ? dx : 1) * s;
        tz = (d > 1e-3 ? dz : 0) * s;
      }
      f.vx += (tx - f.vx) * ease;
      f.vz += (tz - f.vz) * ease;
      // (a startle: its own flight outward, slower to die away)
      f.fx *= flee;
      f.fz *= flee;
      f.x += (f.vx + f.fx) * dt;
      f.z += (f.vz + f.fz) * dt;
      if (!pool || f.q >= keep) continue;
      const blink = Math.max(0, Math.sin(t * F.blinkRate)) ** F.blinkPow * dim;
      if (blink < F.min) continue;
      this._emit(pool, f.x, f.y, f.z, this._g.firefly, F.size, col[0] * blink, col[1] * blink, col[2] * blink, 1, dt);
    }
  }

  _moths(dt, keep, pool) {
    if (!this.moths.length) return;
    const life = this.life, M = TUNE.moth, h = life.hero, k = life.k;
    const lit = this._fireLit();
    const dim = 1 - 0.8 * life.hush;
    for (const m of this.moths) {
      // the hero at the fire scatters them; they come back once he has gone
      const at = Math.hypot(h.x - m.cx, h.z - m.cz) < M.near;
      const up = at || !lit || (m.post.def && !this._standing(m.post));
      m.fear = up ? Math.min(1, m.fear + dt * M.fearUp) : Math.max(0, m.fear - dt * M.fearDown);
      m.a += m.w * dt * (1 + m.fear * 0.8) * k;
      const t = this.t * m.wf + m.p;
      const r = m.r * (1 + (M.scatterR - 1) * m.fear) + Math.sin(t) * M.wobble;
      m.x = m.cx + Math.cos(m.a) * r;
      m.z = m.cz + Math.sin(m.a) * r;
      m.py = m.cy + m.y + Math.sin(t * 1.37 + 2) * M.wobble + m.fear * M.scatterY;
      if (!pool || m.q >= keep) continue;
      const a = M.alpha * (1 - M.fade * m.fear) * dim;
      if (a < 0.04) continue;
      const gl = this._g.moth[(Math.floor(this.t * m.beat + m.p) & 1)];
      this._emit(pool, m.x, m.py, m.z, gl, M.size, M.color[0], M.color[1], M.color[2], a, dt);
    }
  }

  _fireLit() {
    return this.life.world?.atmosphere?.bonfireLit !== false;
  }

  _birds(dt, pool) {
    if (!this.birds.length) return;
    const life = this.life, A = TUNE.alarm, h = life.hero;
    const run = h.moving && h.speed > A.run;
    const fight = life.calm < 0.99;
    const dim = 1 - 0.6 * life.hush;
    for (const b of this.birds) {
      const B = b.B;
      if (b.state === PERCHED) {
        if (!this._standing(b.post)) {
          this._takeOff(b, b.px, b.pz - 1, 0); // its tree is coming down
        } else {
          const d = Math.hypot(h.x - b.px, h.z - b.pz);
          if (d < A.close || (run && d < A.r)) this._flock(b, h.x, h.z);
          // (a gust that alarms: wind.at's `alarm`, not a quiet front such as the arrival's)
          else if (A.gust < 1 && alarmAt(life.wind?.at?.(b.px, b.pz, this._w)) > A.gust) {
            const w = this._w;
            this._flock(b, b.px - (w.x || 1), b.pz - (w.z || 0));
          }
        }
        if (b.state === PERCHED) {
          if (pool) this._emitFront(pool, b.px, b.py, b.pz, B.front, this._g[b.crow ? 'crow' : 'small'].rest, B.size, B.restColor[0] * dim, B.restColor[1] * dim, B.restColor[2] * dim, B.restAlpha, dt);
          continue;
        }
      }
      if (b.state === FLYING) {
        b.t += dt;
        if (b.t < 0) {
          // (waiting its turn in the flock: still on the perch)
          if (pool) this._emitFront(pool, b.px, b.py, b.pz, B.front, this._g[b.crow ? 'crow' : 'small'].rest, B.size, B.restColor[0], B.restColor[1], B.restColor[2], B.restAlpha, dt);
          continue;
        }
        // rising fast and away; the climb eases as it gets going
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.y += b.vy * dt;
        b.vy *= Math.exp(-dt * 0.35);
        if (b.t > B.flight) {
          this._away(b);
          continue;
        }
        if (!pool) continue;
        const gl = this._g[b.crow ? 'crow' : 'small'].wings[Math.floor(b.t * b.beat + b.p) & 1];
        const fade = Math.min(1, (B.flight - b.t) / 1.2);
        this._emitFront(pool, b.x, b.y, b.z, B.front, gl, B.flySize ?? B.size, B.flyColor[0], B.flyColor[1], B.flyColor[2], B.flyAlpha * fade * dim, dt);
        continue;
      }
      // away: back to its perch after a while, where the camera does not look; never in the fight
      b.t -= dt;
      if (b.t <= 0 && !fight && this._standing(b.post) && !this._inView(b.px, b.pz)) this._land(b);
    }
  }

  /** b and the others perched near it take off, away from (cx, cz). */
  _flock(b, cx, cz) {
    const A = TUNE.alarm, life = this.life;
    for (const o of this.birds) {
      if (o.state !== PERCHED || Math.hypot(o.px - b.px, o.pz - b.pz) > A.flock) continue;
      this._takeOff(o, cx, cz, o === b ? 0 : life.range(0, o.B.stagger));
    }
  }

  _takeOff(b, cx, cz, delay) {
    const life = this.life, B = b.B;
    let dx = b.px - cx, dz = b.pz - cz;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = b.px; dz = b.pz; }
    // away from the cause and out of the arena (into the forest, off the ruins), a little spread: it
    // leaves the frame up and away instead of crossing the ground the fight is read on
    const rad = Math.hypot(b.px, b.pz) || 1;
    const ux = dx / (Math.hypot(dx, dz) || 1) + B.out * (b.px / rad), uz = dz / (Math.hypot(dx, dz) || 1) + B.out * (b.pz / rad);
    const a = Math.atan2(uz, ux) + life.range(-B.spread, B.spread);
    const s = life.range(B.speed[0], B.speed[1]) * life.k;
    b.vx = Math.cos(a) * s;
    b.vz = Math.sin(a) * s;
    b.vy = life.range(B.climb[0], B.climb[1]) * life.k;
    b.x = b.px; b.y = b.py; b.z = b.pz;
    b.state = FLYING;
    b.t = -delay;
  }

  _away(b) {
    const B = b.B;
    b.state = AWAY;
    b.t = this.life.range(B.away[0], B.away[1]);
  }

  _land(b) {
    b.state = PERCHED;
    b.x = b.px; b.y = b.py; b.z = b.pz;
    b.vx = b.vy = b.vz = 0;
    b.t = 0;
  }

  /** Does the perch's tree / pillar still stand? (world.destructibles, through `?.`; unknown: yes) */
  _standing(P) {
    if (!P?.def) return true;
    if (P.piece === undefined) {
      const list = this.life.world?.destructibles?.list;
      if (!Array.isArray(list)) return true;
      P.piece = list.find((o) => o?.def === P.def) ?? null;
    }
    return !P.piece || P.piece.state === 0;
  }

  _inView(x, z) {
    const f = this.life.focus, V = TUNE.view;
    const dx = x - (f.x ?? 0), dz = z - (f.z ?? 0);
    return Math.abs(dx) < V.x && dz > -V.north && dz < V.south;
  }

  _hawk(dt, pool) {
    const k = this.hawk;
    if (!k) return;
    const H = TUNE.hawk, life = this.life;
    if (FIGHT.has(life.game?.state) && k.on && !k.leaving) {
      // the boss wakes: it climbs away out of the frame and does not come back this fight
      k.leaving = true;
      k.gone = 0;
      const a = k.a + Math.PI / 2;
      k.vx = Math.cos(a) * H.leaveSpeed;
      k.vz = Math.sin(a) * H.leaveSpeed - H.leaveSpeed * 0.5;
      k.vy = H.leaveClimb;
    }
    if (!k.on) return;
    if (k.leaving) {
      k.gone += dt;
      k.x += k.vx * dt; k.y += k.vy * dt; k.z += k.vz * dt;
      if (k.gone > H.leave) {
        k.on = false;
        return;
      }
    } else {
      const f = life.focus, e = 1 - Math.exp(-dt / H.follow);
      k.cx += ((f.x ?? 0) - k.cx) * e;
      k.cz += ((f.z ?? 0) + H.south - k.cz) * e;
      k.a += (TAU / H.lap) * dt;
      k.x = k.cx + Math.cos(k.a) * H.r;
      k.z = k.cz + Math.sin(k.a) * H.r;
      k.y = H.y + Math.sin(this.t * 0.21) * 0.4;
      k.flapT -= dt;
      if (k.flapT <= 0) {
        k.flap = H.flapBeats / H.flapRate;
        k.flapT = life.range(H.flapEvery[0], H.flapEvery[1]);
      }
      if (k.flap > 0) k.flap -= dt;
    }
    if (!pool) return;
    const fade = k.leaving ? Math.max(0, 1 - k.gone / H.leave) : 1;
    const up = k.flap > 0 && (Math.floor(k.flap * H.flapRate * 2) & 1);
    const a = H.alpha * fade, c = H.color;
    this._emit(pool, k.x, k.y, k.z, up ? this._g.hawkFlap : this._g.hawk, H.size, c[0], c[1], c[2], a, dt);
    // the wings: a letter either side along the camera's right, the far one a little higher (banked)
    const R = life.game?.U?.uCamRight?.value, Up = life.game?.U?.uCamUp?.value;
    const rx = R?.x ?? 1, ry = R?.y ?? 0, rz = R?.z ?? 0, ux = Up?.x ?? 0, uy = Up?.y ?? 1, uz = Up?.z ?? 0;
    const s = H.span, bk = H.bank * s;
    const gl = up ? this._g.wingL : this._g.wing, gr = up ? this._g.wingR : this._g.wing;
    this._emit(pool, k.x - rx * s + ux * bk, k.y - ry * s + uy * bk, k.z - rz * s + uz * bk, gl, H.size, c[0], c[1], c[2], a, dt);
    this._emit(pool, k.x + rx * s - ux * bk, k.y + ry * s - uy * bk, k.z + rz * s - uz * bk, gr, H.size, c[0], c[1], c[2], a, dt);
    if (!(H.shadowAlpha > 0)) return;
    // its shadow on the floor, offset along the light (at most maxOff m)
    const sky = life.set?.sky?.moonDir;
    let ox = 0, oz = 0;
    if (Array.isArray(sky) && sky[1] > 0.05) {
      ox = (-sky[0] / sky[1]) * k.y;
      oz = (-sky[2] / sky[1]) * k.y;
      const o = Math.hypot(ox, oz);
      if (o > H.maxOff) { ox *= H.maxOff / o; oz *= H.maxOff / o; }
    }
    this._emit(pool, k.x + ox, 0.04, k.z + oz, this._g.shadow, H.shadowSize, H.shadowColor[0], H.shadowColor[1], H.shadowColor[2], H.shadowAlpha * fade, dt);
  }

  _sparks(dt, keep, pool) {
    if (!this.sparks.length) return;
    const S = TUNE.spark, dim = 1 - 0.8 * this.life.hush;
    for (const s of this.sparks) {
      s.a += s.w * dt;
      if (!pool || s.q >= keep) continue;
      const v = (0.5 + 0.5 * Math.sin(this.t * s.pulse * TAU + s.p)) ** 2 * dim;
      if (v < 0.05) continue;
      this._emit(pool, s.cx + Math.cos(s.a) * s.r, s.y + Math.sin(this.t * 0.7 + s.p) * 0.15, s.cz + Math.sin(s.a) * s.r,
        this._g.spark, S.size, S.color[0] * v, S.color[1] * v, S.color[2] * v, 1, dt);
    }
  }
}

/** THRONE.vents (world/throneHall.js), when the set does not carry them. */
const VENTS_STARLESS = Object.freeze([[-8.6, -1.6], [8.8, 0.2], [-7.0, 10.2], [8.4, 6.4]]);
