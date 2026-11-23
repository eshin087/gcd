import { CREATURES_TUNE as TUNE } from './creaturesTuning.js';
import { gi } from '../../render/glyphs.js';

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
// Per level: Cinderwood: fireflies (they take over atmosphere.js's), small birds on the tree wall, moths
// round the bonfire. Ashfall: crows on the pillars, a few moths. The Obsidian Throne: nothing alive, a
// few dim sparks orbiting the vents. The Skybreak Ring: one hawk circling high before the fight, moths
// at the bonfire and the braziers. The Foxfire Terrace: foxfire (paler, bluer fireflies that keep wider),
// birds on the dead trees, moths. The Windless Grove: fireflies hanging almost still, moths.

const FIGHT = new Set(['bossIntro', 'boss']);
const PERCHED = 'perched', FLYING = 'flying', AWAY = 'away';
const TAU = Math.PI * 2;
const NONE = Object.freeze([]);
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
    life.action?.('startle at hero', () => {
      const h = this.life.hero;
      return this.startle(h.x, h.z, 14, 1);
    }, 'everything alive within 14 m of the hero flees');
    life.action?.('birds return', () => this.returnBirds(), 'every bird whose perch stands goes back to it now');
  }

  // ------------------------------------------------------------------ build (once, piece on)

  _build() {
    this.ready = true;
    const L = this.L, life = this.life;
    if (!L) return;
    const F = TUNE.firefly, M = TUNE.moth;
    this._g = {
      firefly: gi(F.glyph), moth: M.glyphs.map(gi), hawk: gi(TUNE.hawk.glyph), hawkFlap: gi(TUNE.hawk.flap),
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
    if (!this.life.on('creatures') || !this.L || !Number.isFinite(x + z + r + k) || !(r > 0)) return 0;
    if (!this.ready) this._build();
    const kk = Math.max(0, k) * this.life.k, F = TUNE.firefly;
    let n = 0;
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
  }

  clear(why) {
    if (!this.ready) return;
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
    this.drawn.alpha = this.drawn.add = 0;
    if (!life.on('creatures') || !this.L || !(dt > 0)) return;
    if (!this.ready) this._build();
    this.t += dt;
    const fx = life.game?.fx;
    const draw = this.visible;
    // (counts thin with the phone's budget and the fight's calm: a record draws while q < keep)
    const keep = Math.max(0, Math.min(1, life.quality)) * Math.max(0, Math.min(1, life.calm));
    this._fireflies(dt, keep, draw ? fx?.add : null);
    this._moths(dt, keep, draw ? fx?.alpha : null);
    this._birds(dt, draw ? fx?.alpha : null);
    this._hawk(dt, draw ? fx?.alpha : null);
    this._sparks(dt, keep, draw ? fx?.add : null);
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
          else if (A.gust < 1 && (life.wind?.at?.(b.px, b.pz, this._w)?.k ?? 0) > A.gust) {
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
    const gl = k.flap > 0 && (Math.floor(k.flap * H.flapRate * 2) & 1) ? this._g.hawkFlap : this._g.hawk;
    this._emit(pool, k.x, k.y, k.z, gl, H.size, H.color[0], H.color[1], H.color[2], H.alpha * fade, dt);
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
