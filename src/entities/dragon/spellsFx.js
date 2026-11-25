import { LetterBatch } from '../../world/life/letterBatch.js';
import { mulberry32 } from '../../core/rng.js';

// How the roar-cast fire spells are drawn (spellsFire.js; ADR-197; docs/STYLE.md "The fire field").
// Every body of fire here is HEAT IN THE FIRE FIELD (game.fx.fire: many small soft blobs that add up
// into the wyrm's small letters): the serpent's body, head, eyes and licking back, the lane it leaves
// burning, the column of the firestorm, its skirt and its crown of smoke, both bursts. Embers are glyph
// particles (one letter cell, game.fx.add). The dust the column sucks in is MANY TINY FAINT letters
// (LetterBatch, the living world's air letters), written every frame along their spirals.
//
// Rate-based: every emitter spawns so many blobs a SECOND (an accumulator x dt), each living a fixed
// short time, so the fire's density is the same at any frame rate and in slow motion (heat re-drawn
// once a frame would stack). Look noise comes from this module's own stream (never Math.random: a look
// must never move the seeded fights; STYLE.md "Look code has its own random stream").
// Phones (settings.quality 0) draw a share of it (SPELLS.*.phone). No allocation per frame.

const rnd = mulberry32(0x5e7fe11);
const rand = (a, b) => a + rnd() * (b - a);
const TAU = Math.PI * 2;
const fin = Number.isFinite;
const EMBER = ".'`*";
const EMBER_COL = [3.0, 1.0, 0.18];
const EMBER_END = [0.7, 0.08, 0.01];
// the dust drawn into the column: dim earth, warmed by the fire as it nears the wall
const DUST_CHARS = ".,'`:";
const DUST_COL = [0.2, 0.19, 0.17];
const DUST_WARM = [0.6, 0.3, 0.12];
const DUST_MAX = 320;
// what it carries round in its spin: splinters, grit and embers, one letter each (written every frame)
const ORB_CHARS = '/\\|-*';
const ORB_MAX = 220;
const ORB_WOOD = [0.42, 0.3, 0.2];
const ORB_EMBER = [1.0, 0.55, 0.15];
const SMOKE = 'smoke';
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The spells' drawing state for one wyrm (made on first use: spellFx(d)). */
class SpellFx {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this._b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.2, size: 0.5, sizeEnd: 0.4, heat: 0.4, heatEnd: 0.1, drag: 0, gravity: 0, kind: 0 };
    this._r = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size: 0.25, sizeEnd: 0.08, glyph: '*', color: [0, 0, 0], colorEnd: [0, 0, 0], alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, spin: 0, rot: 0, flicker: 0.3, stretch: 0 };
    this._w = { x: 0, z: 0, k: 0, alarm: 0 };
    this._acc = {};
    this._dust = null; // LetterBatch (made the first time the column draws)
    this._dustFail = false;
    this._dustLive = false;
    this._dCols = new Uint8Array(DUST_CHARS.length);
    // the dust letters' own state: angle, radius, height, inflow, age, letter
    this._dA = new Float32Array(DUST_MAX);
    this._dR = new Float32Array(DUST_MAX);
    this._dY = new Float32Array(DUST_MAX);
    this._dV = new Float32Array(DUST_MAX);
    this._dT = new Float32Array(DUST_MAX);
    this._dC = new Uint8Array(DUST_MAX);
    this._dN = 0;
    this._col = [0, 0, 0];
    this._oCols = new Uint8Array(ORB_CHARS.length);
    this._oA = new Float32Array(ORB_MAX);
    this._oY = new Float32Array(ORB_MAX);
    this._oR = new Float32Array(ORB_MAX);
    this._oV = new Float32Array(ORB_MAX);
    this._oC = new Uint8Array(ORB_MAX);
    this._oN = 0;
  }

  get fire() {
    return this.game.fx?.fire;
  }
  /** A phone (the LOW preset): its share of everything. */
  get low() {
    return this.game.settings?.quality === 0;
  }

  /** One blob of heat (the reused record). kind: a FIRE_KIND name or number ('smoke': dim grey letters). */
  blob(x, y, z, vx, vy, vz, life, size, sizeEnd, heat, heatEnd, drag = 0, gravity = 0, kind = 0) {
    const f = this.fire;
    if (!f || !fin(x + y + z + vx + vy + vz + life + size + sizeEnd + heat + heatEnd)) return;
    const b = this._b;
    b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz;
    b.life = life; b.size = size; b.sizeEnd = sizeEnd; b.heat = heat; b.heatEnd = heatEnd;
    b.drag = drag; b.gravity = gravity; b.kind = kind;
    f.spawn(b);
  }

  /** One ember (a glyph particle, one letter cell). */
  ember(x, y, z, vx, vy, vz, life, k = 1) {
    const add = this.game.fx?.add;
    if (!add || !fin(x + y + z + vx + vy + vz + life)) return;
    const o = this._r;
    o.x = x; o.y = y; o.z = z; o.vx = vx; o.vy = vy; o.vz = vz;
    o.life = life;
    o.size = rand(0.2, 0.3);
    o.sizeEnd = 0.06;
    o.glyph = EMBER;
    o.drag = 0.6;
    o.gravity = 0.4;
    o.flicker = 0.35;
    for (let i = 0; i < 3; i++) {
      o.color[i] = EMBER_COL[i] * k;
      o.colorEnd[i] = EMBER_END[i] * k;
    }
    add.spawn(o);
  }

  /** How many to spawn this frame at `rate` a second (an accumulator in `st[key]`), at most `cap`. */
  count(st, key, rate, dt, cap = 60) {
    const acc = (st[key] ?? 0) + Math.max(0, rate) * Math.max(0, dt);
    const n = Math.min(cap, Math.floor(acc));
    st[key] = Math.min(acc - n, 4);
    return n;
  }

  /** The air there (the living world's one wind; still without it). */
  wind(x, z) {
    const w = this._w;
    w.x = w.z = 0;
    try {
      this.game.world?.life?.wind?.at?.(x, z, w);
    } catch {
      w.x = w.z = 0;
    }
    if (!fin(w.x + w.z)) w.x = w.z = 0;
    return w;
  }

  // ------------------------------------------------------------------ the fire serpent
  /**
   * The serpent's body this frame. `s` (spellsFire.js) gives its shape: `n` samples along it, head
   * first, in s.px / s.py / s.pz, the way it heads there (s.dx / s.dz, unit), the half width s.w, how
   * strongly each burns s.fade (it burns out from the tail as it sinks), s.glow over all of it; and the
   * head: (s.hx, s.hy, s.hz), its way (s.fx, s.fy, s.fz, unit), its jaw s.jaw 0..1, s.heat (a strike
   * burns hotter). `look` SPELL_LOOKS.serpent.*, `share` the phone's share.
   */
  serpent(s, dt, look, share) {
    const n = s.n;
    if (!(n > 1) || !(dt > 0)) return;
    const st = s.acc;
    const seg = !!look?.segmented;
    const every = seg ? Math.max(1, Math.round((look.every ?? 1) / s.step)) : 1;
    const wd = this.wind(s.hx, s.hz);
    const ribs = (s.hl?.ribs ?? 1.35) / s.step, TWO = Math.PI * 2;
    const DN = s.hl?.dens ?? 1, SZ = s.hl?.size ?? 1, HK = (s.hl?.heat ?? 1) / Math.sqrt(Math.max(0.25, share)); // (a phone: fewer blobs, each a little hotter)
    for (let i = 1; i < n; i++) {
      // dark bands across it (its scales, its ribs): the fire thins between two of them
      const rib = seg ? 1 : 0.5 + 0.5 * Math.cos((TWO * i) / ribs);
      const g = s.glow * s.fade[i] * (seg ? 1 : 0.5 + 0.5 * rib);
      if (!(g > 0.02)) continue;
      const x = s.px[i], y = s.py[i], z = s.pz[i], w = s.w[i];
      if (!fin(x + y + z + w)) continue;
      const nx = -s.dz[i], nz = s.dx[i]; // its side, square to its way
      const knot = seg && i % every === 0;
      if (seg && !knot) {
        // the segmented look: only a thin hot spine runs between two vertebrae
        let m = this.count(st, i, 22 * share * g, dt, 3);
        while (m-- > 0) this.blob(x + rand(-0.06, 0.06), y + rand(-0.05, 0.05), z + rand(-0.06, 0.06), 0, rand(0.2, 0.5), 0, rand(0.1, 0.15), 0.45, 0.36, 0.36 * g, 0.12);
        continue;
      }
      // the body: a ragged band of small cool blobs (a vertebra: a ball of them) round a hotter spine
      const ww = knot ? w * 1.3 : w;
      let m = this.count(st, i, (knot ? 170 * Math.min(DN, 1.6) : 85 * DN) * share * g * (seg ? 1 : 0.12 + 0.88 * rib * rib) * (0.5 + ww), dt, knot ? 12 : 16);
      while (m-- > 0) {
        const l = rand(-1, 1) * ww * 0.85, u = rand(-0.3, 0.45) * ww;
        const c = 1 - Math.abs(l) / Math.max(0.1, ww); // 1 on the spine, 0 at the rim
        const bs = SZ * rand(0.8, 1.2) * Math.max(0.4, ww * (knot ? 1.0 : 0.85));
        this.blob(x + nx * l, y + u, z + nz * l, 0, rand(0.2, 0.7), 0, rand(0.12, 0.19), bs, bs * 0.7, HK * (0.3 + 0.3 * c) * g * (knot ? 0.75 : 1), 0.08 * HK, 0.8);
      }
      // the hot spine (every other sample: overlaps build its heat), and flames licking up off its back
      if (!seg && i % 2 === 0) {
        let h = this.count(st, 1000 + i, 26 * share * g, dt, 3);
        while (h-- > 0) this.blob(x + rand(-0.08, 0.08), y + 0.1 * w, z + rand(-0.08, 0.08), 0, rand(0.2, 0.5), 0, rand(0.1, 0.15), 0.45 * Math.max(0.5, w), 0.32, 0.4 * g, 0.1);
      }
      let t = this.count(st, 2000 + i, 9 * share * g * rib * (0.4 + w), dt, 2);
      while (t-- > 0) {
        const l = rand(-0.5, 0.5) * w;
        this.blob(x + nx * l, y + 0.4 * w, z + nz * l, wd.x * 0.4, rand(1.2, 2.4), wd.z * 0.4, rand(0.3, 0.48), rand(0.4, 0.6), 0.2, 0.2 * g, 0, 1.0, 1.3);
      }
    }
    this.serpentHead(s, dt, share, wd);
    // embers off its back, smoke over it, into the wind
    let e = this.count(st, 'e', 30 * share * s.glow, dt, 6);
    while (e-- > 0) {
      const i = 1 + Math.floor(rnd() * (n - 1));
      if (!(s.fade[i] > 0.1)) continue;
      this.ember(s.px[i] + rand(-0.3, 0.3), s.py[i] + 0.3, s.pz[i] + rand(-0.3, 0.3), wd.x * 0.6 + rand(-0.8, 0.8), rand(1.5, 3.6), wd.z * 0.6 + rand(-0.8, 0.8), rand(0.5, 1.0), 0.9);
    }
    let k = this.count(st, 'k', 14 * share * s.glow, dt, 3);
    while (k-- > 0) {
      const i = 1 + Math.floor(rnd() * (n - 1));
      if (!(s.fade[i] > 0.1)) continue;
      this.blob(s.px[i], s.py[i] + 1.2, s.pz[i], wd.x * 0.7, rand(0.6, 1.2), wd.z * 0.7, rand(1.0, 1.5), 1.0, 2.2, 0.32, 0, 0.6, 0.4, SMOKE);
    }
  }

  /** The head: a wedge of fire (a broad skull narrowing to the snout), two white-hot eyes, the jaws apart when it strikes. */
  serpentHead(s, dt, share, wd) {
    const st = s.acc, g = s.glow;
    if (!(g > 0.02)) return;
    const hx = s.hx, hy = s.hy, hz = s.hz, fx = s.fx, fy = s.fy, fz = s.fz;
    if (!fin(hx + hy + hz + fx + fy + fz)) return;
    // its side (level) and its up, square to where the head points
    let sx = -fz, sz = fx;
    const sl = Math.hypot(sx, sz) || 1;
    sx /= sl;
    sz /= sl;
    const ux = -fy * fx, uy = fx * fx + fz * fz, uz = -fy * fz; // (up, tipped with the head)
    const W = s.hl?.w ?? 1, L = s.hl?.len ?? 2.2, jaw = s.jaw, hot = 1 + 0.5 * (s.heat ?? 0);
    let m = this.count(st, 'h', (s.hl?.dens ?? 1) * 230 * share * g, dt, 40);
    while (m-- > 0) {
      const a = rnd(); // 0 at the back of the skull, 1 at the snout
      // a wedge: the broad back of the skull, narrowing to the snout
      const half = W * (a < 0.2 ? 0.8 + a : 1 - 0.72 * ((a - 0.2) / 0.8));
      const l = rand(-1, 1) * half;
      // the jaws: the front half of the head splits into an upper and a lower jaw as it opens
      const open = jaw * a * a * 0.9;
      const u = rand(-0.25, 0.3) * half + (rnd() < 0.5 ? open : -open);
      const back = (a - 0.3) * L;
      const sz2 = (s.hl?.size ?? 1) * rand(0.55, 0.8) * Math.max(0.32, half);
      this.blob(
        hx + fx * back + sx * l + ux * u, hy + fy * back + uy * u, hz + fz * back + sz * l + uz * u,
        0, rand(0.1, 0.4), 0, rand(0.09, 0.14), sz2, sz2 * 0.75, (s.hl?.headHeat ?? 1) * (0.42 + 0.3 * (1 - Math.abs(l) / Math.max(0.1, half))) * g * hot, 0.1, 0.6,
      );
    }
    // the eyes: two small hot knots high on the skull, either side (they print as bright round digits)
    let e = this.count(st, 'eye', 50 * g, dt, 5);
    while (e-- > 0) {
      const side = rnd() < 0.5 ? -1 : 1;
      const back = 0.05 * L, o = W * 0.55, up = W * 0.4;
      this.blob(hx + fx * back + sx * side * o + ux * up, hy + fy * back + uy * up, hz + fz * back + sz * side * o + uz * up, 0, 0, 0, 0.08, 0.42, 0.36, 1.1 * g, 0.85);
    }
    // a strike: fire spits from between the jaws
    if (jaw > 0.3) {
      let f = this.count(st, 'spit', 60 * share * jaw * g, dt, 6);
      while (f-- > 0) {
        const sp = rand(3, 7);
        this.blob(hx + fx * L * 0.85, hy + fy * L * 0.85, hz + fz * L * 0.85, fx * sp + rand(-0.6, 0.6), fy * sp + rand(0, 0.8), fz * sp + rand(-0.6, 0.6), rand(0.14, 0.24), 0.45, 0.8, 0.36 * g, 0.05, 2.5);
      }
    }
    void wd;
  }

  /**
   * The lane it leaves: points of ground it burnt (s.lane: x, z, age per point in a ring), each with a
   * few low small flames that die down over `life` s (the grass fire under it burns on its own).
   */
  lane(s, dt, life, share, delay = 0) {
    const L = s.lane, n = s.laneN;
    if (!(n > 0) || !(dt > 0)) return;
    const wd = this.wind(s.hx, s.hz);
    for (let i = 0; i < n; i++) {
      const k = i * 3, age = L[k + 2] - delay;
      if (!(age >= 0) || age > life) continue;
      const f = 1 - age / life;
      let m = this.count(s.acc, 3000 + i, 4 * share * f, dt, 2);
      while (m-- > 0) {
        this.blob(L[k] + rand(-0.6, 0.6), rand(0.7, 0.9), L[k + 1] + rand(-0.6, 0.6), wd.x * 0.3, rand(0.8, 1.6), wd.z * 0.3, rand(0.25, 0.4), rand(0.4, 0.6), 0.2, 0.15 * f + 0.05, 0, 1, 1.2);
      }
      if (f < 0.75) {
        let k2 = this.count(s.acc, 4000 + i, 1.6 * share, dt, 1);
        while (k2-- > 0) this.blob(L[k] + rand(-0.4, 0.4), 1.1, L[k + 1] + rand(-0.4, 0.4), wd.x * 0.8, rand(0.4, 0.9), wd.z * 0.8, rand(1.2, 1.8), 0.9, 2.4, 0.22, 0, 0.5, 0.3, SMOKE);
      }
    }
  }

  /** Where it bursts out of the incantation circle: a gout of flame and embers thrown up. */
  serpentEmerge(x, z, dx, dz, share) {
    const n = Math.round(46 * share);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = rand(0, 1.6), up = rand(3, 8);
      this.blob(x + Math.cos(a) * r, rand(0.8, 1.6), z + Math.sin(a) * r, dx * 2 + Math.cos(a) * 1.5, up, dz * 2 + Math.sin(a) * 1.5, rand(0.3, 0.55), rand(0.6, 1.0), 0.4, rand(0.3, 0.5), 0.05, 2.2, 0);
    }
    const e = Math.round(30 * share);
    for (let i = 0; i < e; i++) {
      const a = rnd() * TAU;
      this.ember(x, 1.0, z, Math.cos(a) * rand(1, 4), rand(4, 9), Math.sin(a) * rand(1, 4), rand(0.6, 1.2));
    }
  }

  /** The head lands: a burst of fire where it struck (a shock front through the wyrm's engine, flames, embers). */
  serpentBurst(x, z, r, share) {
    const F = this.d.fx;
    try {
      F?._shock?.(x, z, 0.4, r + 1.2, 0.42, 0.9, 1);
    } catch {
      /* the look only */
    }
    const n = Math.round(60 * share);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = rand(2, 6);
      this.blob(x + Math.cos(a) * 0.4, rand(0.8, 1.6), z + Math.sin(a) * 0.4, Math.cos(a) * sp, rand(2, 6), Math.sin(a) * sp, rand(0.3, 0.6), rand(0.6, 1.0), 1.1, rand(0.3, 0.5), 0.02, 2.4, 0.6);
    }
    const e = Math.round(26 * share);
    for (let i = 0; i < e; i++) {
      const a = rnd() * TAU;
      this.ember(x, 1.0, z, Math.cos(a) * rand(2, 6), rand(3, 7), Math.sin(a) * rand(2, 6), rand(0.5, 1.1));
    }
  }

  // ------------------------------------------------------------------ the firestorm
  /**
   * The column this frame. `v` (spellsFire.js): its foot (v.x, v.z), how far it has risen v.up 0..1,
   * how hard it burns v.k 0..1 (in and out), the gather v.gather 0..1 (it narrows, spins faster, burns
   * hotter: the tell), its spin phase v.spin (rad). `look` SPELL_LOOKS.vortex.*.
   */
  vortex(v, dt, look, share) {
    if (!(dt > 0) || !(v.k > 0.01) || !fin(v.x + v.z)) return;
    const st = v.acc, k = v.k, G = v.gather ?? 0;
    const H = look.h * (0.25 + 0.75 * v.up) * (1 + 0.12 * G);
    const narrow = 1 - 0.45 * G;
    const r0 = look.r0 * narrow, r1 = look.r1 * (1 - 0.3 * G);
    const S = look.strands, tw = look.twist;
    const wd = this.wind(v.x, v.z);
    // it leans (m per m of height, along z: + toward the game camera, - away from it: north, up the screen)
    const LN = look.lean ?? 0, LJ = look.jitter ?? 0.22, FACE = look.face ?? 0;
    v._H = H;
    v._r0 = r0;
    v._r1 = r1;
    v._lean = LN;
    // the strands: helices of small blobs turning round the axis (the pattern turns: it reads as spin)
    let m = this.count(st, 'col', look.rate * share * k * (1 + 0.3 * G), dt, 120);
    while (m-- > 0) {
      const yk = rnd(), y = 0.75 + yk * H;
      const r = (r0 + (r1 - r0) * Math.pow(yk, 1.5)) * rand(0.9, 1.08);
      const strand = Math.floor(rnd() * S);
      const a = v.spin + (strand / S) * TAU - tw * y * TAU * 0.25 + rand(-LJ, LJ);
      const ca = Math.cos(a), sa = Math.sin(a);
      const tang = look.spin * r * (look.carry ?? 0.45); // along the turn
      const sz = rand(0.65, 0.95) * (0.9 + 0.4 * yk) * (look.blob ?? 1);
      // brighter where a strand turns toward the camera (+z): the turning edges read as spin
      const hot = (0.2 + 0.1 * yk + 0.14 * G) * (1 - FACE * 0.5 + FACE * Math.max(0, sa));
      // the crown leans downwind
      const lean = yk * yk * 1.2;
      this.blob(
        v.x + ca * r + wd.x * lean, y, v.z + sa * r + wd.z * lean + LN * y,
        -sa * tang, rand(1.5, 3.5) * (1 + G), ca * tang,
        rand(0.18, 0.26) * (look.life ?? 1), sz, sz * 0.8, hot * k * (look.heat ?? 1), 0.04, 1.2,
      );
    }
    // the core: a thin rope of heat up the axis (white-hot as it gathers)
    let c = this.count(st, 'core', 110 * share * k * (1 + G), dt, 12);
    while (c-- > 0) {
      const y = 0.8 + rnd() * H * 0.7;
      this.blob(v.x + rand(-1, 1) * look.core, y, v.z + rand(-1, 1) * look.core + LN * y, 0, rand(3, 6), 0, rand(0.1, 0.16), 0.45, 0.35, (0.16 + 0.3 * G) * k, 0.06, 0.8);
    }
    // the skirt: low fire torn round its foot
    let f = this.count(st, 'skirt', 150 * share * k, dt, 16);
    while (f-- > 0) {
      const a = v.spin * 1.4 + rnd() * TAU, r = rand(r0 * 1.2, r0 * 1.2 + 1.3 * narrow);
      const ca = Math.cos(a), sa = Math.sin(a);
      this.blob(v.x + ca * r, rand(0.72, 1.3), v.z + sa * r, -sa * 4 - ca * 1.5, rand(0.3, 1.2), ca * 4 - sa * 1.5, rand(0.14, 0.24), rand(0.45, 0.7), 0.3, (0.14 + 0.08 * (1 - r / 5)) * k, 0.02, 1.2);
    }
    // the crown: smoke spilling out over the top, into the wind
    let sm = this.count(st, 'smoke', 34 * share * k * v.up, dt, 5);
    while (sm-- > 0) {
      const a = rnd() * TAU;
      this.blob(v.x + Math.cos(a) * r1, H + rand(-0.5, 1), v.z + Math.sin(a) * r1 + LN * H, Math.cos(a) * 2 + wd.x, rand(0.4, 1.2), Math.sin(a) * 2 + wd.z, rand(1.2, 2.0), 1.4, 3.2, 0.34, 0, 0.6, 0.2, SMOKE);
    }
    // embers drawn in from round it: they fly to the wall and up it
    let e = this.count(st, 'emb', 46 * share * k * v.up, dt, 6);
    while (e-- > 0) {
      const a = rnd() * TAU, rr = rand(4, 10), y = rand(0.3, 2.5), T = rand(0.6, 1.1);
      const x0 = v.x + Math.cos(a) * rr, z0 = v.z + Math.sin(a) * rr;
      const ta = a + 1.2, tx = v.x + Math.cos(ta) * r0, tz = v.z + Math.sin(ta) * r0, ty = y + rand(2, 5);
      this.ember(x0, y, z0, (tx - x0) / T, (ty - y) / T, (tz - z0) / T, T * 0.95, 1);
    }
    this.vortexDust(v, dt, look, share);
  }

  /** The dust it sucks in: many tiny faint letters on spirals that tighten and climb into its wall. */
  vortexDust(v, dt, look, share) {
    const b = this._dustBatch();
    if (!b) return;
    const N = Math.min(DUST_MAX, Math.round(DUST_MAX * share));
    const reach = 9.5, k = v.k * v.up;
    const A = this._dA, R = this._dR, Y = this._dY, V = this._dV, T = this._dT, C = this._dC;
    // (letters are born across the whole disc at first, then only at its rim)
    while (this._dN < N) {
      const i = this._dN++;
      A[i] = rnd() * TAU;
      R[i] = rand(look.r0 + 1, reach);
      Y[i] = rand(0.05, 0.6);
      V[i] = rand(0.6, 1.4);
      T[i] = rand(0, 1);
      C[i] = Math.floor(rnd() * DUST_CHARS.length);
    }
    b.begin();
    const col = this._col, w0 = look.spin * 1.4;
    for (let i = 0; i < this._dN; i++) {
      const r = R[i];
      // it turns faster near the wall, falls in and lifts
      A[i] += (w0 * 1.8 / Math.max(0.8, r)) * dt * (0.6 + 0.4 * k);
      R[i] -= (0.8 + 4.5 / Math.max(0.8, r)) * V[i] * dt * k;
      Y[i] += (0.15 + 2.2 * Math.max(0, 1 - r / 5)) * V[i] * dt * k;
      T[i] += dt;
      const wall = look.r0 + 0.25 + Y[i] * 0.12;
      if (R[i] < wall || Y[i] > 7) {
        A[i] = rnd() * TAU;
        R[i] = rand(reach * 0.7, reach);
        Y[i] = rand(0.05, 0.5);
        V[i] = rand(0.6, 1.4);
        T[i] = 0;
        C[i] = Math.floor(rnd() * DUST_CHARS.length);
      }
      const rr = R[i];
      const near = Math.max(0, 1 - (rr - wall) / 3);
      const fade = Math.min(1, T[i] * 2.5) * k * (0.45 + 0.35 * near);
      if (!(fade > 0.03)) continue;
      for (let c = 0; c < 3; c++) col[c] = DUST_COL[c] + (DUST_WARM[c] - DUST_COL[c]) * near;
      b.put(v.x + Math.cos(A[i]) * rr, Y[i], v.z + Math.sin(A[i]) * rr, 0, this._dCols[C[i]], 0, col, fade);
    }
    // what it carries round: splinters and embers orbiting its wall, rising, falling back in at its foot
    const NO = Math.min(ORB_MAX, Math.round(ORB_MAX * share));
    const H = v._H ?? look.h, r0 = v._r0 ?? look.r0, r1 = v._r1 ?? look.r1, LN = v._lean ?? 0;
    const OA = this._oA, OY = this._oY, OR = this._oR, OV = this._oV, OC = this._oC;
    while (this._oN < NO) {
      const i = this._oN++;
      OA[i] = rnd() * TAU;
      OY[i] = rand(0.8, H * 0.9);
      OR[i] = rand(0.2, 1.3);
      OV[i] = rand(0.6, 1.3);
      OC[i] = Math.floor(rnd() * ORB_CHARS.length);
    }
    for (let i = 0; i < this._oN; i++) {
      OA[i] += look.spin * 0.8 * OV[i] * dt;
      OY[i] += 1.5 * OV[i] * dt * k;
      if (OY[i] > H * 0.9) OY[i] = rand(0.8, 2);
      const yk = clamp01(OY[i] / Math.max(1, H));
      const r = r0 + (r1 - r0) * Math.pow(yk, 1.5) + OR[i];
      const ember = OC[i] === ORB_CHARS.length - 1 || i % 3 === 0;
      const col = ember ? ORB_EMBER : ORB_WOOD;
      b.put(v.x + Math.cos(OA[i]) * r, OY[i], v.z + Math.sin(OA[i]) * r + LN * OY[i], 0, this._oCols[ember ? ORB_CHARS.length - 1 : OC[i]], 0, col, 0.9 * k);
    }
    b.end();
    this._dustLive = true;
  }

  /** The column's last frame: its dust letters are gone (the batch keeps what it was last written). */
  vortexEnd() {
    this._dN = 0;
    this._oN = 0;
    if (!this._dustLive || !this._dust) return;
    this._dustLive = false;
    try {
      this._dust.begin();
      this._dust.end();
    } catch {
      /* never freeze the frame */
    }
  }

  /** The burst: a ring of fire runs out (the wyrm's shock engine), the column flies apart up and out. */
  vortexBurst(v, look, R, share) {
    const F = this.d.fx;
    try {
      F?._shock?.(v.x, v.z, look.r0, R, 0.5, 1.5, 1);
    } catch {
      /* the look only */
    }
    const H = look.h;
    const n = Math.round(140 * share);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, y = 0.8 + rnd() * H * 0.8, sp = rand(4, 10);
      const r = look.r0 + (look.r1 - look.r0) * (y / H);
      this.blob(v.x + Math.cos(a) * r, y, v.z + Math.sin(a) * r, Math.cos(a) * sp, rand(1, 5), Math.sin(a) * sp, rand(0.4, 0.75), rand(0.7, 1.1), 1.5, rand(0.28, 0.45), 0.02, 2.0, 0.3);
    }
    const s = Math.round(26 * share);
    for (let i = 0; i < s; i++) {
      const a = rnd() * TAU;
      this.blob(v.x + Math.cos(a) * 2, rand(2, H), v.z + Math.sin(a) * 2, Math.cos(a) * 3, rand(0.5, 2), Math.sin(a) * 3, rand(1.6, 2.4), 1.6, 3.6, 0.34, 0, 0.5, 0.2, SMOKE);
    }
    const e = Math.round(60 * share);
    for (let i = 0; i < e; i++) {
      const a = rnd() * TAU;
      this.ember(v.x, rand(1, H * 0.6), v.z, Math.cos(a) * rand(4, 11), rand(2, 8), Math.sin(a) * rand(4, 11), rand(0.6, 1.3));
    }
  }

  /** The column climbing out of the circle: a gout of heat up the axis. */
  vortexRise(v, look, share) {
    const n = Math.round(50 * share);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = rand(0, look.r0 + 1);
      this.blob(v.x + Math.cos(a) * r, rand(0.8, 1.5), v.z + Math.sin(a) * r, -Math.sin(a) * 4, rand(5, 11), Math.cos(a) * 4, rand(0.4, 0.7), rand(0.6, 0.9), 0.5, rand(0.3, 0.45), 0.05, 1.5, 0.5);
    }
  }

  /** The dust batch (made once per game, three.js's uuids drawn from this module's stream). */
  _dustBatch() {
    if (this._dust) return this._dust;
    const g = this.game, pl = g.pipeline;
    if (this._dustFail || typeof pl?.registerParticles !== 'function' || !g.U?.uResolution) return null;
    const mr = Math.random;
    Math.random = rnd;
    try {
      const b = new LetterBatch(g, DUST_MAX + ORB_MAX, DUST_CHARS + ORB_CHARS, { additive: false, spawned: 0, rand: rnd });
      pl.registerParticles(b);
      for (let i = 0; i < DUST_CHARS.length; i++) this._dCols[i] = b.col(DUST_CHARS[i]);
      for (let i = 0; i < ORB_CHARS.length; i++) this._oCols[i] = b.col(ORB_CHARS[i]);
      this._dust = b;
      return b;
    } catch {
      this._dustFail = true;
      return null;
    } finally {
      Math.random = mr;
    }
  }
}

const FX = new WeakMap();
/** The spells' drawing state for wyrm `d` (one per wyrm, made on first use). */
export function spellFx(d) {
  let f = FX.get(d);
  if (!f) {
    f = new SpellFx(d);
    FX.set(d, f);
  }
  return f;
}
