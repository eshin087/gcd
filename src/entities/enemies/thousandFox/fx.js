import { DuelFx, K_STEEL, K_VOID, K_SMOKE, K_FIRE } from '../duelist/fx.js';
import { FIRE_PALETTES } from '../../../render/firePalettes.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { TELL } from '../../../combat/rules.js';

// Wen Yao's effects (ADR-147; STYLE.md "The fox's effects"). All of it is heat in the fire field (small
// letters; many small cool blobs, at least 0.7 m up, never one big hot one) and glyph particles of one
// letter cell (paper slips, sparks). Look code draws from its own seeded stream (kr(); the inherited
// helpers it calls use DuelFx's look stream lr()), never Math.random and never the gameplay streams.
//
// FOXFIRE is a palette, not a kind: this level swaps the VOID slot (FireField.setPalette('void', ...),
// as the Skybreak Ring does for gold): here K_VOID IS FOXFIRE. `?foxfire=` a jade (the default), b the
// wyrm's orange `fire` kind (no swap: the heat is drawn as K_FIRE), c moon-white. `this.FOX` is the kind
// foxfire is drawn as; the inherited draws that name the Void's violet (a light, a spark) are turned to
// the look's colour (_light, _spawn).
//
// THE SURFACE (fox.js, clones.js and pearl.js call these; positions are world metres; a method with `dt`
// is called every frame while its thing lasts, the others once). The names and arguments are fixed.
//   pearlCharge(x, y, z, u, dt)           the Pearl in his open lead palm, u 0..1 through the charge
//   pearlThread(ax, ay, az, bx, by, bz, dt)   a crisp thread from a self's hand (a) to the Pearl (b)
//   pearlFly(x, y, z, dt)                 a batted pearl in flight
//   pearlMark(x, z, r, k, dt)             the ground it will burst on heating, k 0..1 to the burst
//   pearlBurst(x, z, r)                   it bursts (once; driven by his palm: a blast along his line first)
//   pearlFizzle(x, y, z)                  it comes apart (in his hand, or uncued in the air)
//   greatPearl(x, y, z, u, dt)            the Moon-Swallowing Pearl going dark over his head
//   greatBurst(x, z, r)                   where he lands with it
//   cloneSpawn(x, z)                      a paper self tears free here
//   clonePop(x, y, z, by)                 a paper self pops (pale one-cell paper slips, a little smoke)
//   cloneBurn(x, y, z, tx, ty, tz, k)     phase 3's change: a self burns up and streams into him
//   mantle(d, dt, k)                      the nine-tailed fox spirit, k 0..1 as it grows in (d.tails tails)
//   tailSweep(x, z, r)                    Burning Brush's tail goes round (once)
//   pounceLand(x, z, r)                   the pounce lands (once)
// Also his: phaseBurst(3, x, z) (the change: a roar of foxfire, not the Ash Disciple's ash on the wind),
// sweep (his bare hands: a fist's or a foot's short trail, not a blade's arc), update (the tails' sweep
// and the column run on, the kept lights go out).
//
// COST (the fire field holds 6000 blobs; his phase 3 stays under ~1500): the mantle ~90 alive, a thread
// one blob per letter cell it crosses, a pearl in flight ~25, a burst ~150 - 250 (its shock front), a
// pop ~20 blobs and 20 paper slips (glyph particles).

const TAU = Math.PI * 2;
const GOLDEN = 2.399963229728653;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
/** A steady hash 0..1 of two numbers (a mark's fill pattern: it never reshuffles frame to frame). */
const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Violet (the Void's colour: blue the highest channel, green well under it)? */
const violet = (c) => Array.isArray(c) && c[2] > c[0] * 1.05 && c[1] < c[2] * 0.62;

// The colours that are not heat (lights, glyph sparks, the hazard's ground specks), per `?foxfire=`.
// mark: the specks' colour at k 0 / 0.6 / 1 (ADR-052: the colour is the heat; foxfire's own heat here).
const LOOKS = Object.freeze({
  a: {
    light: [0.42, 1.0, 0.66], spark: [1.0, 3.0, 1.7], sparkEnd: [0.03, 0.28, 0.12],
    mark: [[0.03, 0.3, 0.12], [0.3, 1.7, 0.8], [1.3, 3.4, 2.2]], rim: [1.5, 3.4, 2.3],
  },
  b: {
    light: [1.0, 0.55, 0.22], spark: [3.2, 1.1, 0.25], sparkEnd: [0.5, 0.06, 0.01],
    mark: [[0.35, 0.08, 0.02], [1.7, 0.55, 0.09], [3.1, 1.75, 0.6]], rim: [3.8, 2.5, 1.0],
  },
  c: {
    light: [0.78, 0.85, 1.0], spark: [2.4, 2.65, 3.4], sparkEnd: [0.22, 0.27, 0.5],
    mark: [[0.14, 0.16, 0.28], [1.1, 1.25, 1.8], [2.7, 2.8, 3.4]], rim: [3.0, 3.1, 3.7],
  },
});
// paper (the selves): pale, not lit (the alpha pool); burnt paper: charcoal
const PAPER = [1.05, 1.0, 0.86], PAPER_END = [0.34, 0.32, 0.28], PAPER_LIT = [1.25, 1.2, 1.02];
const CHAR = [0.2, 0.18, 0.16], CHAR_END = [0.06, 0.05, 0.05];
const SLIPS = "--=~'"; // one-cell paper slips (one char picked per slip, then it tumbles)
const SPECK = ".,:'"; // the hazard's ground specks (one char per point: a fixed pick, so no re-roll)
// the brush tail: a short chain from his hips (nodes), its profile (blob size per node), the segment
const TAIL_N = 7;
const TAILS = 9; // the most tails the fox spirit grows (TUNING.mantle.tails)
const TAIL_SIZE = [0.26, 0.38, 0.5, 0.6, 0.64, 0.58, 0.42];
const TAIL_SEG = 0.26;

export class FoxFx extends DuelFx {
  constructor(d) {
    super(d);
    const q = lookOf('foxfire', 'a');
    this.look = q === 'b' || q === 'c' ? q : 'a';
    const pal = this.look === 'c' ? FIRE_PALETTES.moon : this.look === 'b' ? null : FIRE_PALETTES.foxfire;
    if (pal) this.game.fx?.fire?.setPalette?.('void', pal);
    /** the kind foxfire is drawn as (K_VOID with a palette swapped in; the wyrm's fire for look b) */
    this.FOX = this.look === 'b' ? K_FIRE : K_VOID;
    /** the same, as a shock front's kind */
    this._front = this.look === 'b' ? 'fire' : 'void';
    // PHASE 3'S FIRE (?foxFire3=): the mantle, the bodies wreathed in it, the Nine-Tailed Fox and its
    // beam. a the wyrm's orange-red fire (the default), b jade (the void slot turned to foxfire: an orb
    // drawn on that slot in another colour moves to the steel kind, pale white)
    const q3 = lookOf('foxFire3', 'a');
    this.look3 = q3 === 'b' ? 'b' : 'a';
    /** the kind phase 3's fire is drawn as */
    this.FIRE3 = K_FIRE;
    if (this.look3 === 'b') {
      if (this.look !== 'a' && this.FOX === K_VOID) this.FOX = K_STEEL;
      this.game.fx?.fire?.setPalette?.('void', FIRE_PALETTES.foxfire);
      this.FIRE3 = K_VOID;
    }
    this.L = LOOKS[this.look];
    this._ks = 0x7f4a7c15;
    this._col = [0, 0, 0]; // scratch colour (the pools copy it at spawn)
    this._tb = { x: 0, y: 0, z: 0 }; // _toCam's result
    this._q = d._v.clone(); // scratch for drawnPoint
    this._lights = new Map(); // key -> { L, t }: lights kept alive by being asked for every frame
    this._tail = new Float32Array(TAILS * TAIL_N * 3);
    this._tailN = 0;
    this._tailT = -1; // the clock of the tail's last frame (a gap: it starts again where it hangs)
    this._chargeAcc2 = 0;
    this._flyAcc = 0;
    this._peltAcc = 0;
    this._earAcc = 0;
    this._tailAcc = 0;
    this._greatAcc = 0;
    this._flyF = -1;
    this._flyN = 0;
    // the tail's sweep (Burning Brush) and the change's column: short emitters run on by update()
    this._sw = { alive: false, x: 0, z: 0, r: 3, t: 0, T: 0.32, a0: 0, dir: 1, acc: 0, a: 0 };
    this._colm = { alive: false, x: 0, z: 0, t: 0, T: 1, acc: 0 };
  }

  /** The fox's look stream 0..1 (only what draws reads it). */
  kr() {
    this._ks = (Math.imul(this._ks, 1664525) + 1013904223) >>> 0;
    return this._ks / 4294967296;
  }
  krand(a, b) {
    return a + this.kr() * (b - a);
  }

  reset() {
    super.reset();
    this._sw.alive = false;
    this._colm.alive = false;
    this._tailT = -1;
    for (const v of this._lights.values()) v.L?.kill?.();
    this._lights.clear();
  }

  update(dt, d) {
    super.update(dt, d);
    const fdt = this.game.fxDt ?? dt;
    if (this._sw.alive) this._sweepRun(fdt);
    if (this._colm.alive) this._columnRun(fdt);
    // the kept lights: one not asked for this frame goes out
    const now = this._now();
    for (const [key, v] of this._lights) {
      if (now - v.t > 0.07 || v.L?.dead) {
        v.L?.kill?.();
        this._lights.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------- colour
  /** A light: the inherited draws' Void violet (a void front's light) is the look's colour here. */
  _light(o) {
    if (o && violet(o.color)) o.color = this.L.light;
    return super._light(o);
  }

  /** A glyph particle: the inherited draws' violet sparks are the look's colour here. */
  _spawn(pool, o) {
    if (o) {
      if (violet(o.color)) o.color = this.L.spark;
      if (violet(o.colorEnd)) o.colorEnd = this.L.sparkEnd;
    }
    super._spawn(pool, o);
  }

  /** A shock front of foxfire leaves: the floor is charred, but foxfire leaves no glowing heat on it
   *  (the scorch map's glow is a fire's orange). */
  _frontSpawn(w) {
    const sc = this.game.world?.scorch;
    if (!sc?.burnCircle || w.kind !== 'void') return super._frontSpawn(w);
    const f = sc.burnCircle, own = Object.prototype.hasOwnProperty.call(sc, 'burnCircle');
    sc.burnCircle = (x, z, r, burn, heat = 0) => f.call(sc, x, z, r, burn, heat * 0.1);
    try {
      super._frontSpawn(w);
    } finally {
      if (own) sc.burnCircle = f;
      else delete sc.burnCircle;
    }
  }

  _now() {
    const g = this.game;
    return g.realTime ?? g.time ?? 0;
  }

  /** A light kept alive while it is asked for every frame (it goes out a frame after the last ask). */
  _keep(key, x, y, z, intensity, radius, flicker = 0) {
    if (!Number.isFinite(x + y + z + intensity)) return null;
    let v = this._lights.get(key);
    if (!v || v.L?.dead) {
      const L = super._light({ x, y, z, color: this.L.light, intensity, radius, flicker, fade: 0.15 });
      if (!L) return null;
      v = { L, t: 0 };
      this._lights.set(key, v);
    }
    v.t = this._now();
    const L = v.L;
    L.x = x;
    L.y = y;
    L.z = z;
    L.intensity = intensity;
    L.radius = radius;
    return L;
  }

  /** The unit vector toward the camera (from its axes). */
  _toCam() {
    const A = this._axes(), B = this._tb;
    B.x = A.ry * A.uz - A.rz * A.uy;
    B.y = A.rz * A.ux - A.rx * A.uz;
    B.z = A.rx * A.uy - A.ry * A.ux;
    return B;
  }

  /** One of his upright gameplay points (a hurt sphere) where it is DRAWN (the lean, his size), into
   *  `out` ({x, y, z}); false when it is not there. */
  _drawn(d, s, out) {
    if (!s || !Number.isFinite(s.x + s.y + s.z)) return false;
    const q = this._q.set(s.x, s.y, s.z);
    if (typeof d.drawnPoint === 'function') d.drawnPoint(q);
    if (!Number.isFinite(q.x + q.y + q.z)) return false;
    out.x = q.x;
    out.y = q.y;
    out.z = q.z;
    return true;
  }

  /** A glyph spark of the look's colour thrown from (x, y, z). */
  _sparks(x, y, z, n, s0, s1, up = 2) {
    for (let i = 0; i < n; i++) {
      const a = this.kr() * TAU, sp = this.krand(s0, s1);
      const o = this._rec(x + Math.cos(a) * 0.2, y + this.krand(-0.2, 0.3), z + Math.sin(a) * 0.2, this.krand(0.3, 0.7), this.krand(0.14, 0.22), 0.04, "*'.", this.L.spark, this.L.sparkEnd);
      o.vx = Math.cos(a) * sp;
      o.vy = this.krand(0.5, up + 2);
      o.vz = Math.sin(a) * sp;
      o.drag = 2.4;
      o.gravity = -3;
      o.flicker = 0.4;
      this._spawn(this.add, o);
    }
  }

  // ---------------------------------------------------------------- the Pearl
  /**
   * Every frame of the charge: the Pearl shaped in his open lead palm (fox.js palmPoint; pulled toward
   * the camera, so the hand it sits in does not dim it). BIG and unmistakable (ADR-151: the owner could
   * not see the old one): about 0.9 m across at the end of the charge. A ball of pale blue-white heat
   * (`?foxfire=c`, the default) with a white core; three bright SPIRAL ARMS of ink turning on the letter
   * grid round it (they wind in from its rim to its heart, faster as it fills); points on its surface
   * turning round a tilted axis (it spins); threads of light pulled in from the air round it, curling as
   * they come. It grows with `u`. ~70 blobs a frame at the end.
   */
  pearlCharge(x, y, z, u, dt) {
    if (!this.fire || !Number.isFinite(x + y + z + u) || !(dt > 0)) return;
    u = Math.max(0, Math.min(1, u));
    const P = this._toCamera(x, y, z), px = P.x, py = P.y, pz = P.z, A = this._axes(), B = this._toCam(), F = this.FOX;
    const t = this.game.time ?? 0, r = 0.14 + 0.32 * u;
    const life = this._frame();
    if (life > 0) {
      // the body: a dense ball of the orb's heat, a white core inside it
      this._blob(px, py, pz, 0, 0, 0, life, r * 1.7, r * 1.7, 0.56 + 0.2 * u, 0.56 + 0.2 * u, F);
      this._blob(px, py, pz, 0, 0, 0, life, r * 0.75, r * 0.75, 0.85 + 0.25 * u, 0.85 + 0.25 * u, K_STEEL);
      // its surface: three bands of points turning round an axis tilted toward the camera; a point on
      // the far side is drawn dimmer (the sphere's own body hides it)
      const spin = t * (7 + 6 * u), tilt = 0.5;
      for (let band = 0; band < 3; band++) {
        const lat = (band - 1) * 0.62, cl = Math.cos(lat), sl = Math.sin(lat), m = band === 1 ? 9 : 6;
        for (let i = 0; i < m; i++) {
          const lon = spin + (i / m) * TAU + band * 0.7;
          const sx = Math.cos(lon) * cl, sz = Math.sin(lon) * cl, sy = sl;
          const uy = sy * Math.cos(tilt) - sz * Math.sin(tilt), uz = sy * Math.sin(tilt) + sz * Math.cos(tilt);
          const front = 0.55 + 0.45 * uz;
          const ox = sx * r, oy = uy * r, oz = uz * r;
          this._dot(px + A.rx * ox + A.ux * oy + B.x * oz, py + A.ry * ox + A.uy * oy + B.y * oz, pz + A.rz * ox + A.uz * oy + B.z * oz, 0.16 + 0.1 * u, (0.4 + 0.3 * u) * front, F);
        }
      }
      // the spiral arms: three crisp strokes winding from past its rim in to its heart, turning fast
      const R0 = r * 1.45, hk = 0.6 + 0.45 * u, turn = -t * (8 + 7 * u);
      for (let q = 0; q < 3; q++) {
        const a0 = turn + (q / 3) * TAU;
        let lx = 0, ly = 0;
        for (let j = 0; j <= 6; j++) {
          const k = j / 6, a = a0 + k * 2.4, rr = R0 * (1 - 0.85 * k);
          const ex = Math.cos(a) * rr, ey = Math.sin(a) * rr;
          if (j > 0) this._ink(px + A.rx * lx + A.ux * ly, py + A.ry * lx + A.uy * ly, pz + A.rz * lx + A.uz * ly, px + A.rx * ex + A.ux * ey, py + A.ry * ex + A.uy * ey, pz + A.rz * ex + A.uz * ey, 0, hk * (0.45 + 0.5 * k), 0, hk * (0.45 + 0.5 * (k + 1 / 6)), 1);
          lx = ex;
          ly = ey;
        }
      }
      // the wind round it: two wide arcs turning the other way, closing in as it fills
      const W = r * (2.2 - 0.5 * u) + 0.14, wk = 0.4 + 0.25 * u;
      for (let q = 0; q < 2; q++) {
        const a0 = t * (6 + 4 * u) + q * Math.PI, span = 1.3;
        let lx = 0, ly = 0;
        for (let j = 0; j <= 4; j++) {
          const a = a0 + (j / 4) * span, ex = Math.cos(a) * W, ey = Math.sin(a) * W * 0.8;
          if (j > 0) this._ink(px + A.rx * lx + A.ux * ly, py + A.ry * lx + A.uy * ly, pz + A.rz * lx + A.uz * ly, px + A.rx * ex + A.ux * ey, py + A.ry * ex + A.uy * ey, pz + A.rz * ex + A.uz * ey, 0, wk, 0, wk, 1);
          lx = ex;
          ly = ey;
        }
      }
    }
    // threads of light pulled in from the air round it, turning as they come (born tangential: they curl in)
    this._chargeAcc2 += dt * (24 + 44 * u);
    let g = 0;
    while (this._chargeAcc2 >= 1 && g++ < 8) {
      this._chargeAcc2 -= 1;
      const a = this.kr() * TAU, R = this.krand(0.7, 1.2) * (0.9 + 0.8 * u), lf = this.krand(0.2, 0.3);
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = A.rx * ca + A.ux * sa, dy = A.ry * ca + A.uy * sa, dz = A.rz * ca + A.uz * sa;
      const tx = -A.rx * sa + A.ux * ca, ty = -A.ry * sa + A.uy * ca, tz = -A.rz * sa + A.uz * ca, ts = (R * 0.35) / lf;
      this._blob(px + dx * R, py + dy * R, pz + dz * R, (-dx * R) / lf + tx * ts, (-dy * R) / lf + ty * ts, (-dz * R) / lf + tz * ts, lf, 0.18, 0.1, 0.32, 0.55, F);
    }
    if (this._chargeAcc2 > 8) this._chargeAcc2 = 0;
    this._keep('pearl', px, Math.max(0.9, py), pz, 0.9 + 1.8 * u, 3 + 2.5 * u, 0.15);
  }
  /** Every frame of the charge, per live self: a crisp thread of steel on the letter grid from its hand
   *  to the Pearl (dim at the hand, bright at the Pearl), and two beads of foxfire running along it to
   *  the Pearl (the self feeds it). One blob per letter cell it crosses, + 2. */
  pearlThread(ax, ay, az, bx, by, bz, dt) {
    if (!this.fire || !Number.isFinite(ax + ay + az + bx + by + bz)) return;
    // (stopped short of the Pearl: five threads meeting in one cell would print a white-hot knot)
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz);
    if (!(l > 0.6)) return;
    const e = 1 - 0.42 / l;
    this._ink(ax, ay, az, ax + dx * e, ay + dy * e, az + dz * e, 0, 0.34, 0, 0.58);
    const t = this.game.time ?? 0, ph = hash(Math.round(ax * 4), Math.round(az * 4));
    for (let q = 0; q < 2; q++) {
      const s = (t * 1.3 + ph + q * 0.5) % 1;
      this._dot(ax + (bx - ax) * s, ay + (by - ay) * s, az + (bz - az) * s, 0.22, 0.32 + 0.2 * s, this.FOX);
    }
  }

  /** Every frame of a batted pearl's flight: the ball (smaller and denser than the charge's) and a
   *  short tail of foxfire it leaves hanging behind it. ~25 blobs a pearl. */
  pearlFly(x, y, z, dt) {
    if (!this.fire || !Number.isFinite(x + y + z) || !(dt > 0)) return;
    const F = this.FOX, A = this._axes(), t = this.game.time ?? 0;
    const P = this._toCamera(x, y, z), px = P.x, py = P.y, pz = P.z;
    const life = this._frame();
    if (life > 0) {
      this._blob(px, py, pz, 0, 0, 0, life, 0.32, 0.32, 0.72, 0.72, F);
      for (let i = 0; i < 4; i++) {
        const a = t * 9 + (i / 4) * TAU, ca = Math.cos(a) * 0.1, sa = Math.sin(a) * 0.1;
        this._dot(px + A.rx * ca + A.ux * sa, py + A.ry * ca + A.uy * sa, pz + A.rz * ca + A.uz * sa, 0.22, 0.3, F);
      }
      this._dot(px, py, pz, 0.1, 0.6, K_STEEL);
    }
    // the tail: blobs left where it was (the pearl flies on)
    this._flyAcc += dt * 70;
    let g = 0;
    while (this._flyAcc >= 1 && g++ < 4) {
      this._flyAcc -= 1;
      this._blob(x + this.krand(-0.08, 0.08), Math.max(0.75, y + this.krand(-0.08, 0.08)), z + this.krand(-0.08, 0.08), this.krand(-0.3, 0.3), this.krand(-0.15, 0.2), this.krand(-0.3, 0.3), this.krand(0.18, 0.28), 0.3, 0.14, 0.5, 0.06, F, 1.5, 0);
    }
    if (this._flyAcc > 4) this._flyAcc = 0;
    // a light on each pearl in the air (keyed by its order this frame)
    const now = this._now();
    if (now !== this._flyF) {
      this._flyF = now;
      this._flyN = 0;
    }
    this._keep(this._flyN === 0 ? 'fly0' : this._flyN === 1 ? 'fly1' : 'fly2', x, Math.max(0.9, y), z, 1.2, 3.5, 0.2);
    this._flyN++;
  }

  /**
   * Every frame of a pearl's flight: the ground it will burst on heats (a hazard's mark, ADR-052): a
   * sparse fill of small ground specks `. , : '` on a sunflower spiral, hashed per mark (nothing
   * marches), denser and brighter toward the burst in foxfire's colours; only once the cue has flashed
   * (pearl.js `flashed`, flashLead before the burst) a thin bright rim of `·` on the true radius, and a
   * low glow of foxfire along it. Glyph particles re-drawn each frame on the one-copy clock (they never
   * stack); the rim's glow: one blob per 0.4 m of it.
   */
  pearlMark(x, z, r, k, dt) {
    if (!(r > 0) || !Number.isFinite(x + z + r + k)) return;
    const pool = this.add;
    const life = this._frame();
    if (!(life > 0) || !pool) return;
    k = Math.max(0, Math.min(1, k));
    const t = this.game.time ?? 0, seed = hash(Math.round(x * 8) * 0.37, Math.round(z * 8) * 0.53) * 97;
    const hot = !!this.d?.pearl?.flashed || k > 0.82;
    const area = Math.PI * r * r, n = Math.max(10, Math.min(90, Math.round(area / 0.55))), sp = Math.sqrt(area / n);
    const dens = 0.35 + 0.65 * k, M = this.L.mark, C = this._col;
    const o = this._rec(x, 0.12, z, life, 0.5, 0.5, '.', C, C);
    for (let i = 0; i < n; i++) {
      const h1 = hash(seed, i);
      if (h1 > dens) continue; // (the low-hash points show first: the fill thickens, it never reshuffles)
      const h2 = hash(seed + 1.37, i), h3 = hash(seed + 2.71, i);
      const uu = Math.sqrt((i + 0.5) / n), a = seed + i * GOLDEN;
      const rr = Math.min(r * 0.97, r * uu + (h2 - 0.5) * sp * 0.45);
      o.x = x + Math.cos(a) * rr + (h3 - 0.5) * sp * 0.35;
      o.z = z + Math.sin(a) * rr + (h2 - 0.5) * sp * 0.35;
      // the colour is the heat: dark at the bat, bright at the burst (the middle a little hotter)
      const hk = Math.min(1, k * (0.82 + 0.18 * (1 - uu)));
      const lo = hk < 0.6 ? M[0] : M[1], hi = hk < 0.6 ? M[1] : M[2], f = hk < 0.6 ? hk / 0.6 : (hk - 0.6) / 0.4;
      const fl = 0.75 + 0.25 * Math.sin(t * (1.6 + 2.6 * h2) + TAU * h3);
      C[0] = (lo[0] + (hi[0] - lo[0]) * f) * fl;
      C[1] = (lo[1] + (hi[1] - lo[1]) * f) * fl;
      C[2] = (lo[2] + (hi[2] - lo[2]) * f) * fl;
      o.color = o.colorEnd = C;
      o.alpha = o.alphaEnd = 0.4 + 0.55 * k;
      o.glyph = SPECK[(h3 * 4) | 0];
      pool.spawn(o);
    }
    if (hot) {
      // the true edge, only now: a thin bright rim, steady, a fast shimmer; a low glow of foxfire on it
      const m = Math.max(16, Math.min(120, Math.round((TAU * r) / 0.5))), b = 0.85 + 0.15 * Math.sin(t * 30);
      const R = this.L.rim;
      C[0] = R[0] * b;
      C[1] = R[1] * b;
      C[2] = R[2] * b;
      o.color = o.colorEnd = C;
      o.glyph = '·';
      o.size = o.sizeEnd = 0.5;
      o.alpha = o.alphaEnd = 0.9;
      for (let i = 0; i < m; i++) {
        const a = seed + (i / m) * TAU;
        o.x = x + Math.cos(a) * r;
        o.z = z + Math.sin(a) * r;
        pool.spawn(o);
      }
      const g = Math.max(12, Math.min(70, Math.round((TAU * r) / 0.4)));
      for (let i = 0; i < g; i++) {
        const a = seed + (i / g) * TAU;
        this._blob(x + Math.cos(a) * r, 0.78, z + Math.sin(a) * r, 0, 0, 0, life, 0.34, 0.34, 0.3, 0.3, this.FOX);
      }
    }
  }

  /** A pearl bursts on its spot (once): a ragged front of foxfire out to its radius (the duelists'
   *  shock, kind void = foxfire here), the ball thrown apart, a heart that blinks, sparks, a light.
   *  ~150 - 250 blobs. */
  pearlBurst(x, z, r) {
    if (!this.fire || !Number.isFinite(x + z + r)) return;
    const F = this.FOX, Pd = this.d?.pearl;
    // the drive (pearl.js drive: driven into the hero by his palm): a short blast along his line first,
    // the ring a moment after it
    const drive = Pd?.kind === 'drive' && !Pd.flying;
    if (drive) this._driveBlast(x, z, r);
    this.shock(x, z, Math.max(1, r * 1.05), this._opt(1.05, 0.9, this._front, drive ? 0.07 : 0, false));
    // (driven: fewer, and no blinking heart: the blast is already there, and heat piled on one spot prints a white disc)
    // (a SPIRAL, not a plain ring: every blob thrown out turning the same way round, and three arms of
    // ink winding out over the floor from where it bursts)
    for (let i = 0, m = drive ? 14 : 22; i < m; i++) {
      const a = this.kr() * TAU, sp = this.krand(2, 5), up = this.krand(-0.5, 2.5), ca = Math.cos(a), sa = Math.sin(a);
      this._blob(x + ca * 0.15, this.krand(0.85, 1.2), z + sa * 0.15, (ca - sa * 0.9) * sp, up, (sa + ca * 0.9) * sp, this.krand(0.25, 0.4), 0.36, 0.7, 0.5, 0, F, 3.5, 1);
    }
    const a0 = this.kr() * TAU;
    for (let q = 0; q < 3; q++) {
      let lx = x, lz = z;
      for (let j = 1; j <= 5; j++) {
        const k = j / 5, a = a0 + (q / 3) * TAU + k * 2.2, rr = r * 0.95 * k;
        const ex = x + Math.cos(a) * rr, ez = z + Math.sin(a) * rr;
        this._ink(lx, 0.12, lz, ex, 0.12, ez, 0.35, 0.9 - 0.4 * k, 0, 0.8 - 0.4 * k);
        lx = ex;
        lz = ez;
      }
    }
    if (!drive) for (let i = 0; i < 6; i++) this._blob(x + this.krand(-0.2, 0.2), this.krand(0.9, 1.2), z + this.krand(-0.2, 0.2), 0, this.krand(0.5, 1.5), 0, this.krand(0.14, 0.22), 0.45, 1.0, 0.45, 0, F, 2);
    this._sparks(x, 1.0, z, 10, 2.5, 6);
    this._light({ x, y: 1.3, z, color: this.L.light, intensity: 3.5, radius: r + 4, life: 0.35, fade: 0.3 });
  }

  /** The drive's blast (once): heat thrown along his facing out of his palm past the contact, three
   *  crisp streaks along the line (brightest at the far end), sparks. ~40 blobs. */
  _driveBlast(x, z, r) {
    const d = this.d, F = this.FOX, yaw = fin(d?.yaw, 0), fx = Math.sin(yaw), fz = Math.cos(yaw), sx = -fz, sz = fx;
    const x0 = x - fx * 0.5, z0 = z - fz * 0.5, L = r + 0.6;
    for (let i = 0; i < 28; i++) {
      const sp = this.krand(5, 11), lat = this.krand(-1.6, 1.6);
      const along = this.krand(-0.2, 0.9);
      this._blob(x0 + fx * along + sx * this.krand(-0.2, 0.2), this.krand(0.9, 1.4), z0 + fz * along + sz * this.krand(-0.2, 0.2), fx * sp + sx * lat, this.krand(-0.3, 1.0), fz * sp + sz * lat, this.krand(0.2, 0.32), 0.34, 0.62, 0.42, 0, F, 4, 0.5);
    }
    // the drill: two strokes winding round his line (a helix), brightest at the far end
    for (let q = 0; q < 2; q++) {
      let lx = x0, ly = 1.15, lz = z0;
      for (let j = 1; j <= 8; j++) {
        const k = j / 8, a = q * Math.PI + k * TAU * 1.5, w = 0.32 * (1 - 0.4 * k);
        const ex = x0 + fx * L * k + sx * Math.cos(a) * w, ey = 1.15 + Math.sin(a) * w, ez = z0 + fz * L * k + sz * Math.cos(a) * w;
        this._ink(lx, ly, lz, ex, ey, ez, 0.16, 0.3 + 0.6 * k, 0, 0.35 + 0.65 * k);
        lx = ex;
        ly = ey;
        lz = ez;
      }
    }
    for (let i = 0; i < 8; i++) {
      const sp = this.krand(4, 9), lat = this.krand(-2, 2);
      const o = this._rec(x0, 1.15, z0, this.krand(0.25, 0.45), this.krand(0.14, 0.2), 0.04, "*'.", this.L.spark, this.L.sparkEnd);
      o.vx = fx * sp + sx * lat;
      o.vy = this.krand(0, 2);
      o.vz = fz * sp + sz * lat;
      o.drag = 3;
      this._spawn(this.add, o);
    }
  }

  /** A pearl comes apart (burst in his hand, or uncued in the air): its foxfire drifts off and dims, a
   *  puff of smoke, a few sparks. ~20 blobs. */
  pearlFizzle(x, y, z) {
    if (!this.fire || !Number.isFinite(x + y + z)) return;
    const F = this.FOX, Y = Math.max(0.8, y);
    for (let i = 0; i < 14; i++) {
      const a = this.kr() * TAU, sp = this.krand(0.6, 1.8);
      this._blob(x + Math.cos(a) * 0.1, Y + this.krand(-0.1, 0.1), z + Math.sin(a) * 0.1, Math.cos(a) * sp, this.krand(-0.3, 1.2), Math.sin(a) * sp, this.krand(0.3, 0.5), 0.26, 0.46, 0.36, 0, F, 2, 0.6);
    }
    for (let i = 0; i < 4; i++) this._blob(x + this.krand(-0.15, 0.15), Y + this.krand(0, 0.2), z + this.krand(-0.15, 0.15), this.krand(-0.3, 0.3), this.krand(0.3, 0.9), this.krand(-0.3, 0.3), this.krand(0.5, 0.8), 0.4, 1.0, 0.45, 0, K_SMOKE, 1.2, 0.4);
    this._sparks(x, Y, z, 6, 1.2, 3, 1);
  }

  /**
   * Every frame of the black blow's windup: the Moon-Swallowing Pearl over his head going dark. A disc
   * of dark (steel at a low heat: the engine's black charge dyes it black; pale while it is small), a
   * corona of foxfire round it that thickens, motes of foxfire drawn in. ~30 blobs (it draws on the\n   * costliest frame of his fight: the engine's black charge and flare).
   */
  greatPearl(x, y, z, u, dt) {
    if (!this.fire || !Number.isFinite(x + y + z + u) || !(dt > 0)) return;
    u = Math.max(0, Math.min(1, u));
    const P = this._toCamera(x, y, z), px = P.x, py = P.y, pz = P.z, A = this._axes(), F = this.FOX;
    // (giant: about 2.2 m across at the end, ADR-151; two selves lift it with him)
    const kn = 0.6 + 1.7 * u, t = this.game.time ?? 0;
    const life = this._frame();
    if (life > 0) {
      // the disc: a moon going dark (pale and small at first, dark and wide at the end)
      this._blob(px, py, pz, 0, 0, 0, life, kn, kn, 1.05 - 0.45 * u, 1.05 - 0.45 * u, K_STEEL);
      const rr = kn * 0.5, n = Math.max(12, Math.round(14 + 16 * u));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + t * 1.5, fl = 0.7 + 0.3 * hash(i, Math.floor(t * 12));
        const ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
        this._dot(px + A.rx * ca + A.ux * sa, py + A.ry * ca + A.uy * sa, pz + A.rz * ca + A.uz * sa, 0.26, (0.32 + 0.3 * u) * fl, F);
      }
    }
    this._greatAcc += dt * (16 + 28 * u);
    let g = 0;
    while (this._greatAcc >= 1 && g++ < 6) {
      this._greatAcc -= 1;
      const a = this.kr() * TAU, R = this.krand(1.0, 1.9) * (0.7 + 0.4 * u), lf = this.krand(0.24, 0.36);
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = A.rx * ca + A.ux * sa, dy = A.ry * ca + A.uy * sa, dz = A.rz * ca + A.uz * sa;
      this._blob(px + dx * R, py + dy * R, pz + dz * R, (-dx * R) / lf, (-dy * R) / lf, (-dz * R) / lf, lf, 0.26, 0.14, 0.34, 0.45, F);
    }
    if (this._greatAcc > 6) this._greatAcc = 0;
    this._keep('great', px, Math.max(1, py), pz, 1.2 + 1.6 * u, 4 + 2 * u, 0.25);
  }

  /** He lands with the black pearl: a strong ragged front of foxfire, a column of foxfire thrown up,
   *  sparks, a light. ~120 blobs. */
  greatBurst(x, z, r) {
    if (!this.fire || !Number.isFinite(x + z + r)) return;
    const F = this.FOX;
    // (no crisp ripple and a short column: it lands with the engine's black flare, the costliest frame
    // of his fight, ~1500 blobs before this)
    this.shock(x, z, Math.max(1.5, r * 1.05), this._opt(1.35, 0.9, this._front, 0, false));
    for (let i = 0; i < 12; i++) {
      const a = this.kr() * TAU, rr = this.krand(0, 0.7);
      this._blob(x + Math.cos(a) * rr, this.krand(0.8, 1.3), z + Math.sin(a) * rr, Math.cos(a) * this.krand(0.3, 1.5), this.krand(3, 7), Math.sin(a) * this.krand(0.3, 1.5), this.krand(0.35, 0.65), 0.5, 0.9, 0.42, 0, F, 1.6, 1.5);
    }
    this._sparks(x, 1.0, z, 18, 3, 8, 4);
    this._light({ x, y: 1.4, z, color: this.L.light, intensity: 5.5, radius: r + 6, life: 0.5, fade: 0.4 });
  }

  // ---------------------------------------------------------------- the paper selves
  /** A self tears free (once): a crisp vertical tear on the grid where it stands, paper slips drawn
   *  in onto it, a breath of smoke, a wisp of foxfire. ~25 blobs, 12 slips. Softer than a pop. */
  cloneSpawn(x, z) {
    if (!Number.isFinite(x + z)) return;
    this._ink(x, 0.35, z, x, 1.95, z, 0.2, 0.95, 0, 0.75);
    for (let i = 0; i < 12; i++) {
      const a = this.kr() * TAU, R = this.krand(0.9, 1.5), h = this.krand(0.4, 1.9), lf = this.krand(0.3, 0.45), ty = this.krand(0.7, 1.6);
      const o = this._rec(x + Math.cos(a) * R, h, z + Math.sin(a) * R, lf, this.krand(0.18, 0.24), 0.14, SLIPS, PAPER, PAPER_END);
      o.vx = (-Math.cos(a) * R * 0.9) / lf;
      o.vy = ((ty - h) * 0.9) / lf;
      o.vz = (-Math.sin(a) * R * 0.9) / lf;
      o.spin = this.krand(-6, 6);
      o.rot = this.kr() * TAU;
      o.alpha = 0.95;
      o.alphaEnd = 0.2;
      this._spawn(this.alpha, o);
    }
    for (let i = 0; i < 3; i++) this._blob(x + this.krand(-0.25, 0.25), this.krand(0.8, 1.4), z + this.krand(-0.25, 0.25), this.krand(-0.3, 0.3), this.krand(0.2, 0.6), this.krand(-0.3, 0.3), this.krand(0.4, 0.6), 0.4, 0.9, 0.4, 0, K_SMOKE, 1.4, 0.3);
    for (let i = 0; i < 4; i++) this._blob(x + this.krand(-0.2, 0.2), this.krand(0.9, 1.7), z + this.krand(-0.2, 0.2), 0, this.krand(1, 2), 0, this.krand(0.25, 0.4), 0.26, 0.14, 0.3, 0, this.FOX, 1, 0.5);
  }

  /** A pack body appears in the air (once): a puff of smoke round it, paper slips thrown out of the
   *  puff, a crisp ring of ink on the letter grid opening round it, a wisp of foxfire. ~22 blobs, 10
   *  slips: many come at once (five in a Round). */
  packPuff(x, y, z) {
    if (!Number.isFinite(x + y + z)) return;
    const A = this._axes();
    // the ring: a crisp circle on the screen's plane, gone at once
    let lx = 0.55, ly = 0;
    for (let j = 1; j <= 8; j++) {
      const a = (j / 8) * TAU, ex = Math.cos(a) * 0.55, ey = Math.sin(a) * 0.55;
      this._ink(x + A.rx * lx + A.ux * ly, y + A.ry * lx + A.uy * ly, z + A.rz * lx + A.uz * ly, x + A.rx * ex + A.ux * ey, y + A.ry * ex + A.uy * ey, z + A.rz * ex + A.uz * ey, 0.12, 0.8, 0, 0.8, 1);
      lx = ex;
      ly = ey;
    }
    for (let i = 0; i < 14; i++) {
      const a = this.kr() * TAU, b = this.krand(-0.9, 0.9), ca = Math.cos(a) * Math.cos(b), sa = Math.sin(a) * Math.cos(b), sb = Math.sin(b), sp = this.krand(1.2, 2.6);
      this._blob(x + ca * 0.3, y + sb * 0.3, z + sa * 0.3, ca * sp, sb * sp + 0.4, sa * sp, this.krand(0.35, 0.6), 0.5, 1.1, 0.5, 0, K_SMOKE, 1.6, 0.4);
    }
    for (let i = 0; i < 10; i++) {
      const a = this.kr() * TAU, sp = this.krand(2, 4.5), lit = i & 1;
      const o = this._rec(x, y + this.krand(-0.3, 0.3), z, this.krand(0.5, 0.9), this.krand(0.2, 0.26), 0.16, SLIPS, lit ? PAPER_LIT : PAPER, PAPER_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.krand(0.5, 2.5);
      o.vz = Math.sin(a) * sp;
      o.drag = 2.6;
      o.gravity = -2.4;
      o.spin = this.krand(-7, 7);
      o.rot = this.kr() * TAU;
      o.alpha = 1;
      o.alphaEnd = 0;
      this._spawn(lit ? this.add : this.alpha, o);
    }
    for (let i = 0; i < 4; i++) this._blob(x + this.krand(-0.2, 0.2), y + this.krand(-0.2, 0.3), z + this.krand(-0.2, 0.2), 0, this.krand(1, 2), 0, this.krand(0.25, 0.4), 0.26, 0.14, 0.3, 0, this.FOX, 1, 0.5);
  }

  /** A self pops (once): a burst of pale one-cell paper slips that tumble and settle, short pale
   *  strokes thrown out (torn edges), a crisp tear across its chest, a small puff of smoke, a wisp of
   *  foxfire leaving it. ~30 blobs, 24 slips (16 when many go at once). */
  clonePop(x, y, z, by) {
    if (!Number.isFinite(x + y + z)) return;
    const Y = Math.max(0.9, y), many = by === 'pearl' || by === 'break' || by === 'all' || by === 'death' || by === 'phase';
    // (the springboard: he springs off its hands, and it is thrown UP: a fountain of paper)
    const up = by === 'spring', n = up ? 30 : many ? 16 : 24;
    for (let i = 0; i < n; i++) {
      // (every other slip in the additive pool: pale paper must read on the night paving at 30 m)
      const a = this.kr() * TAU, sp = up ? this.krand(0.4, 1.8) : this.krand(1.8, 5.2), lit = i & 1;
      const o = this._rec(x + Math.cos(a) * 0.15, Y + this.krand(-0.55, 0.55), z + Math.sin(a) * 0.15, this.krand(0.8, 1.4), this.krand(0.2, 0.27), 0.16, SLIPS, lit ? PAPER_LIT : PAPER, PAPER_END);
      o.vx = Math.cos(a) * sp;
      o.vy = up ? this.krand(3, 6.5) : this.krand(0.8, 3.4);
      o.vz = Math.sin(a) * sp;
      o.drag = 2.4;
      o.gravity = -2.4; // (it settles slowly: paper, not grit)
      o.spin = this.krand(-7, 7);
      o.rot = this.kr() * TAU;
      o.alpha = 1;
      o.alphaEnd = 0;
      this._spawn(lit ? this.add : this.alpha, o);
    }
    // the burst: short pale strokes thrown out of it (torn edges), gone in a moment
    const A0 = this._axes();
    // (many at once, by his own blast or a break: no torn edges, less smoke; the paper carries it)
    for (let i = 0, m = many ? 0 : 10; i < m; i++) {
      const a = up ? Math.PI / 2 + this.krand(-1.0, 1.0) : (i / 10) * TAU + this.krand(-0.25, 0.25), ca = Math.cos(a), sa = Math.sin(a), sp = this.krand(4, 7) * (up ? 1.3 : 1);
      const dx = A0.rx * ca + A0.ux * sa, dy = A0.ry * ca + A0.uy * sa, dz = A0.rz * ca + A0.uz * sa;
      this._blob(x + dx * 0.2, Y + 0.1 + dy * 0.2, z + dz * 0.2, dx * sp, dy * sp, dz * sp, this.krand(0.16, 0.26), 0.26, 0.18, 0.6, 0, K_STEEL, 6);
    }
    // the tear: one crisp stroke across the chest, gone at once
    const A = this._axes(), s = this.kr() < 0.5 ? 1 : -1;
    this._ink(x - A.rx * 0.3, Y + 0.28 * s, z - A.rz * 0.3, x + A.rx * 0.3, Y - 0.28 * s, z + A.rz * 0.3, 0.13, 0.95, 0, 0.95);
    for (let i = 0, m = many ? 3 : 6; i < m; i++) {
      const a = this.kr() * TAU;
      this._blob(x + Math.cos(a) * 0.2, this.krand(0.8, 1.7), z + Math.sin(a) * 0.2, Math.cos(a) * 0.7, this.krand(0.2, 0.7), Math.sin(a) * 0.7, this.krand(0.5, 0.8), 0.6, 1.5, 0.58, 0, K_SMOKE, 1.5, 0.4);
    }
    for (let i = 0, m = many ? 2 : 5; i < m; i++) this._blob(x + this.krand(-0.2, 0.2), this.krand(1.0, 1.7), z + this.krand(-0.2, 0.2), this.krand(-0.3, 0.3), this.krand(1.5, 2.6), this.krand(-0.3, 0.3), this.krand(0.3, 0.5), 0.3, 0.15, 0.36, 0, this.FOX, 1, 0.5);
  }

  /** Phase 3's change, per self (once): it burns up where it stands (foxfire climbing it, burnt slips
   *  rising) and streams into him (blobs that leave its body and arrive at his chest as they die, of
   *  different lives: a stream that keeps arriving). ~55 blobs, 10 slips. */
  cloneBurn(x, y, z, tx, ty, tz, k = 1) {
    if (!this.fire || !Number.isFinite(x + y + z + tx + ty + tz)) return;
    const F = this.FOX, kk = Math.max(0.3, Math.min(1, fin(k, 1)));
    for (let i = 0; i < 18; i++) {
      const a = this.kr() * TAU, rr = this.krand(0.05, 0.3);
      this._blob(x + Math.cos(a) * rr, this.krand(0.8, 1.9), z + Math.sin(a) * rr, 0, this.krand(1.2, 2.6), 0, this.krand(0.35, 0.6), 0.44, 0.24, 0.4 * kk, 0, F, 1.2, 1);
    }
    for (let i = 0; i < 36; i++) {
      const lf = this.krand(0.25, 0.8), sx = x + this.krand(-0.25, 0.25), sy = this.krand(0.85, 1.8), sz = z + this.krand(-0.25, 0.25);
      const ex = tx + this.krand(-0.15, 0.15), ey = Math.max(0.8, ty + this.krand(-0.2, 0.2)), ez = tz + this.krand(-0.15, 0.15);
      this._blob(sx, sy, sz, (ex - sx) / lf, (ey - sy) / lf, (ez - sz) / lf, lf, 0.3, 0.22, 0.34 * kk, 0.42 * kk, F);
    }
    for (let i = 0; i < 10; i++) {
      const ember = i % 2 === 0, a = this.kr() * TAU;
      const o = this._rec(x + Math.cos(a) * 0.2, this.krand(0.8, 1.8), z + Math.sin(a) * 0.2, this.krand(0.6, 1.1), this.krand(0.16, 0.22), 0.1, ember ? "'." : SLIPS, ember ? this.L.spark : CHAR, ember ? this.L.sparkEnd : CHAR_END);
      o.vx = Math.cos(a) * this.krand(0.3, 1);
      o.vy = this.krand(1.5, 3);
      o.vz = Math.sin(a) * this.krand(0.3, 1);
      o.drag = 1.4;
      o.spin = this.krand(-5, 5);
      o.flicker = ember ? 0.5 : 0;
      this._spawn(ember ? this.add : this.alpha, o);
    }
  }

  // ---------------------------------------------------------------- the Fox-Fire Mantle
  /**
   * Every frame of phase 3 (k 0..1 as it grows in): the nine-tailed fox of folklore as a spirit of
   * foxfire round him. Spawned BEHIND him as the camera sees him (the field's depth fade hides heat his
   * body covers: it wreathes his outline and never covers him):
   *   - a fox's head over his: two tall ears (spread on screen, so they read from every side), a ruff
   *     at each cheek, a muzzle reaching out along his facing over the mask;
   *   - a mane of cool licks round his shoulders and back (low: the ears stand clear over his head);
   *   - `d.tails` tails (1..9: fox.js grows them as his bar runs out) fanning out behind his hips,
   *     each a short lagging chain (a turn trails, they sway each on its own beat, the outer ones rise
   *     higher: a fan), each with a pale tip; they swing round with Burning Brush's sweep. The more
   *     tails, the thinner each (one blob budget for all of them).
   * ~90 blobs alive with one tail, ~200 with nine.
   */
  mantle(d, dt, k) {
    if (!d?.position || !this.fire || !(dt > 0) || !(k > 0)) return;
    if (d.mode === 'dead') return;
    const x = d.position.x, z = d.position.z;
    if (!Number.isFinite(x + z + d.position.y)) return;
    k = Math.min(1, k);
    const A = this._axes(), B = this._toCam(), F = this.FOX, t = this.game.time ?? 0;
    const H = (this._mH ??= { x: 0, y: 0, z: 0 }), C = (this._mC ??= { x: 0, y: 0, z: 0 }), Pv = (this._mP ??= { x: 0, y: 0, z: 0 });
    const hs = d._hs;
    if (!this._drawn(d, hs?.[0], H) || !this._drawn(d, hs?.[1], C) || !this._drawn(d, hs?.[2], Pv)) return;
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    const n = Math.max(1, Math.min(TAILS, Math.round(fin(d.tails, 1))));
    const life = this._frame();
    // (a black blow under way: the engine's charge and flare are the costliest frames of his fight, so the
    // spirit holds its shape but stops shedding licks until it lands)
    const shed = this._blackAct(d) ? 0 : 1;
    // the mane: cool licks round his shoulders and back, behind him (widest at the shoulders; it licks
    // out sideways and only a little up, so the ears stand clear over his head)
    this._peltAcc += dt * 64 * k * shed;
    let g = 0;
    while (this._peltAcc >= 1 && g++ < 6) {
      this._peltAcc -= 1;
      const u = this.kr() * 0.55, s = (this.kr() < 0.5 ? -1 : 1) * this.krand(0.22, 0.6 - 0.3 * u), back = 0.45 + 0.2 * u;
      const bx = C.x + (Pv.x - C.x) * u, by = C.y + 0.18 + (Pv.y - C.y - 0.18) * u, bz = C.z + (Pv.z - C.z) * u;
      this._blob(bx + A.rx * s - B.x * back, Math.max(0.75, by + this.krand(-0.1, 0.12)), bz + A.rz * s - B.z * back, A.rx * s * 1.1, this.krand(0.2, 0.7), A.rz * s * 1.1, this.krand(0.35, 0.55), 0.56 * k + 0.12, 0.26, this.krand(0.26, 0.34) * k, 0.05, F, 1.2, 0.4);
    }
    if (this._peltAcc > 6) this._peltAcc = 0;
    if (life > 0) {
      // the fox's head over his: the ears
      for (let e = -1; e <= 1; e += 2) {
        const b0x = H.x + A.rx * 0.13 * e - B.x * 0.22, b0y = H.y + 0.1, b0z = H.z + A.rz * 0.13 * e - B.z * 0.22;
        const fl = 0.035 * Math.sin(t * 7 + e * 1.3);
        const b1x = H.x + A.rx * (0.32 + fl) * e - B.x * 0.22, b1y = H.y + 0.1 + 0.72 * k, b1z = H.z + A.rz * (0.32 + fl) * e - B.z * 0.22;
        for (let j = 0; j < 6; j++) {
          const s = j / 5;
          this._blob(b0x + (b1x - b0x) * s, b0y + (b1y - b0y) * s, b0z + (b1z - b0z) * s, 0, 0, 0, life, 0.3 - 0.15 * s, 0.3 - 0.15 * s, (0.85 - 0.25 * s) * k, (0.85 - 0.25 * s) * k, F);
        }
        // the ruff at the cheek: a tuft swept back and out
        for (let j = 0; j < 3; j++) {
          const s = j / 2, o = 0.24 + 0.16 * s;
          this._blob(H.x + A.rx * o * e - B.x * 0.25 - fx * 0.1 * s, H.y - 0.12 - 0.1 * s, H.z + A.rz * o * e - B.z * 0.25 - fz * 0.1 * s, 0, 0, 0, life, 0.26 - 0.06 * s, 0.26 - 0.06 * s, (0.55 - 0.15 * s) * k, (0.55 - 0.15 * s) * k, F);
        }
      }
      // the muzzle: over the mask, along his facing, a little down, to a point
      for (let j = 0; j < 5; j++) {
        const s = j / 4, f = 0.1 + 0.5 * s * k;
        this._blob(H.x + fx * f, H.y - 0.02 - 0.1 * s, H.z + fz * f, 0, 0, 0, life, 0.3 - 0.14 * s, 0.3 - 0.14 * s, (0.4 - 0.12 * s) * k, (0.4 - 0.12 * s) * k, F);
      }
    }
    // tongues licking up off the ear tips
    this._earAcc += dt * 18 * k * shed;
    while (this._earAcc >= 1) {
      this._earAcc -= 1;
      const e = this.kr() < 0.5 ? -1 : 1;
      this._blob(H.x + A.rx * 0.32 * e - B.x * 0.22, H.y + 0.1 + 0.72 * k, H.z + A.rz * 0.32 * e - B.z * 0.22, A.rx * 0.2 * e, this.krand(1.5, 2.5), A.rz * 0.2 * e, this.krand(0.2, 0.32), 0.24, 0.1, 0.26 * k, 0, F, 0.8, 1);
    }
    // the tails
    this._tailsFrame(d, Pv, fx, fz, dt, k, t, life, n, shed);
    this._keep('mantle', x, 1.4, z, (1.2 + 0.08 * n) * k, 5.5 + 0.2 * n, 0.18);
  }

  /** Is a black blow (the engine's charge and flare) under way in his move? */
  _blackAct(d) {
    const bs = d?.mode === 'act' ? d.brain?.act?.beats : null;
    if (!bs) return false;
    for (let i = 0; i < bs.length; i++) if (bs[i].def?.tell === TELL.BLACK && !bs[i].feint) return true;
    return false;
  }
  /** The tails: `n` chains of TAIL_N nodes from his hips, fanned across his back (the outer ones lifted
   *  higher), each lagging the node before it (a turn trails), each swaying on its own beat; during
   *  the sweep they swing round with it. */
  _tailsFrame(d, Pv, fx, fz, dt, k, t, life, n, shed = 1) {
    const N = this._tail, F = this.FOX;
    const fresh = !(this._tailT >= 0) || Math.abs(t - this._tailT) > 0.25 || n !== this._tailN;
    this._tailT = t;
    this._tailN = n;
    // where they hang from: the small of his back (Burning Brush: the way the sweep is going round)
    let a0 = Math.atan2(-fx, -fz);
    if (this._sw.alive) a0 = this._sw.a;
    const ry = Math.max(0.8, Pv.y + 0.1);
    // (the tails radiate from his hips over a half-wheel behind him: from out at one side, up, to out at
    // the other, each leaning back from him; so they part from every side the camera sees them from)
    const thin = n <= 2 ? 1 : n <= 5 ? 0.82 : 0.68, lean = n === 1 ? 0.3 : 0.95, cl = Math.cos(lean), sl = Math.sin(lean);
    let bx = Math.sin(a0), bz = Math.cos(a0), sx = -bz, sz = bx;
    if (n > 1 && !this._sw.alive) {
      // (many tails fan out across the SCREEN, as the ears do: behind him and away from the camera, the
      // half-wheel laid in the camera's plane, so the fan reads whichever way he faces)
      const A = this._axes(), B = this._toCam();
      const wx = bx * 0.5 - B.x, wz = bz * 0.5 - B.z, wl = Math.hypot(wx, wz) || 1;
      bx = wx / wl;
      bz = wz / wl;
      const al = Math.hypot(A.rx, A.rz) || 1;
      sx = A.rx / al;
      sz = A.rz / al;
    }
    for (let q = 0; q < n; q++) {
      const psi = n === 1 ? Math.PI / 2 : 0.3 + (Math.PI - 0.6) * (q / (n - 1));
      // its own direction: back, and out round the half-wheel (side, up)
      const ox = sx * Math.cos(psi) * sl, oy = Math.sin(psi) * sl, oz = sz * Math.cos(psi) * sl;
      const dxq = bx * cl + ox, dyq = oy, dzq = bz * cl + oz;
      const rx = Pv.x + bx * 0.2, rz = Pv.z + bz * 0.2;
      const beat = q * 1.7, len0 = n === 1 ? 1 : 0.9;
      for (let i = 0; i < TAIL_N; i++) {
        // along its direction, curling up toward the tip (a brush), swaying across on its own beat
        const len = TAIL_SEG * i * (0.55 + 0.45 * k) * len0, curl = 0.035 * i * i, sw = 0.15 * Math.sin(t * 2.3 - i * 0.7 + beat) * (i / TAIL_N);
        const tx = rx + dxq * len + sx * sw, ty = ry + (n === 1 ? -0.12 * len : 0) + dyq * len + curl, tz = rz + dzq * len + sz * sw;
        const j = (q * TAIL_N + i) * 3;
        if (fresh || i === 0) {
          N[j] = tx;
          N[j + 1] = ty;
          N[j + 2] = tz;
        } else {
          const a = 1 - Math.exp(-(this._sw.alive ? 22 : 15 - 1.6 * i - 0.3 * q) * dt);
          N[j] += (tx - N[j]) * a;
          N[j + 1] += (ty - N[j + 1]) * a;
          N[j + 2] += (tz - N[j + 2]) * a;
          // (never further from the node before than a segment and a half: it lags, it does not stretch)
          const px = N[j - 3], py = N[j - 2], pz = N[j - 1], dx = N[j] - px, dy = N[j + 1] - py, dz = N[j + 2] - pz, l = Math.hypot(dx, dy, dz), M = TAIL_SEG * 1.5;
          if (l > M) {
            N[j] = px + (dx / l) * M;
            N[j + 1] = py + (dy / l) * M;
            N[j + 2] = pz + (dz / l) * M;
          }
        }
        if (!Number.isFinite(N[j] + N[j + 1] + N[j + 2])) {
          N[j] = tx;
          N[j + 1] = ty;
          N[j + 2] = tz;
        }
      }
      if (life > 0) {
        // (with many tails the roots are left out: nine roots in one place would print a white knot)
        for (let i = n > 5 ? 3 : n > 3 ? 2 : 1; i < TAIL_N; i++) {
          const j = (q * TAIL_N + i) * 3, s = TAIL_SIZE[i] * (0.6 + 0.4 * k) * thin, h = (n > 3 ? 0.45 + 0.4 * (i / TAIL_N) : 0.7 + 0.12 * (i / TAIL_N)) * k * (0.5 + 0.5 * thin);
          this._blob(N[j], Math.max(0.75, N[j + 1]), N[j + 2], 0, 0, 0, life, s, s, h, h, F);
        }
        // its pale tip
        const j = (q * TAIL_N + TAIL_N - 1) * 3;
        this._blob(N[j], Math.max(0.75, N[j + 1]), N[j + 2], 0, 0, 0, life, 0.2, 0.2, 0.55 * k, 0.55 * k, K_STEEL);
      }
    }
    // the brushes' licks rising off their upper halves (one budget for all the tails)
    this._tailAcc += dt * (18 + 3 * n) * k * shed;
    let g = 0;
    while (this._tailAcc >= 1 && g++ < 5) {
      this._tailAcc -= 1;
      const q = Math.floor(this.kr() * n), j = (q * TAIL_N + 3 + Math.floor(this.kr() * (TAIL_N - 3))) * 3;
      this._blob(N[j] + this.krand(-0.12, 0.12), Math.max(0.75, N[j + 1] + this.krand(-0.1, 0.1)), N[j + 2] + this.krand(-0.12, 0.12), 0, this.krand(1, 2), 0, this.krand(0.3, 0.5), 0.4 * thin, 0.18, 0.3 * k, 0, F, 1, 1);
    }
    if (this._tailAcc > 5) this._tailAcc = 0;
  }

  /** Burning Brush's tail goes round (once): a front of foxfire out to its ring, and a sweep of it run
   *  round the ring over a third of a second (update), the tail swinging with it. */
  tailSweep(x, z, r) {
    if (!Number.isFinite(x + z + r)) return;
    const S = this._sw, yaw = fin(this.d?.yaw, 0);
    S.alive = true;
    S.x = x;
    S.z = z;
    S.r = Math.max(1, r);
    S.t = 0;
    S.acc = 0;
    S.a0 = yaw + Math.PI;
    S.a = S.a0;
    S.dir = 1;
    this.shock(x, z, S.r, this._opt(0.9, 0.8, this._front, 0, false));
  }

  _sweepRun(dt) {
    const S = this._sw;
    if (!(dt > 0)) return;
    S.t += dt;
    if (S.t >= S.T) {
      S.alive = false;
      return;
    }
    const u = S.t / S.T;
    S.a = S.a0 + S.dir * TAU * u;
    S.acc += dt * 280;
    let g = 0;
    while (S.acc >= 1 && g++ < 12) {
      S.acc -= 1;
      const a = S.a - S.dir * this.krand(0, 0.35), rr = S.r * this.krand(0.5, 0.95), ca = Math.cos(a), sa = Math.sin(a);
      // (a = 0 points +z: positions use sin for x, cos for z, as his yaw)
      this._blob(S.x + sa * rr, this.krand(0.8, 1.3), S.z + ca * rr, ca * S.dir * 4 + sa * 1.5, this.krand(0.5, 1.5), -sa * S.dir * 4 + ca * 1.5, this.krand(0.25, 0.4), 0.5, 0.28, 0.42, 0, this.FOX, 2, 1.2);
    }
  }

  /** The pounce lands (once): a front of foxfire, flames licking up off the ground where he came down,
   *  sparks, dust, a light. ~200 blobs. */
  pounceLand(x, z, r) {
    if (!this.fire || !Number.isFinite(x + z + r)) return;
    const F = this.FOX, R = Math.max(0.8, r);
    this.shock(x, z, R * 1.7, this._opt(1.2, 1, this._front, 0, false));
    for (let i = 0; i < 24; i++) {
      const a = this.kr() * TAU, rr = R * Math.sqrt(this.kr());
      this._blob(x + Math.cos(a) * rr, this.krand(0.78, 1.0), z + Math.sin(a) * rr, 0, this.krand(1.5, 3.5), 0, this.krand(0.4, 0.7), 0.5, 0.28, 0.4, 0, F, 1, 1.5);
    }
    this._sparks(x, 0.9, z, 14, 2.5, 6);
    this.dust(x, z, 1.0);
    this._light({ x, y: 1.2, z, color: this.L.light, intensity: 4, radius: R + 5, life: 0.45, fade: 0.35 });
  }

  // ---------------------------------------------------------------- the change
  /**
   * The phase change lands (fox.js onImpact; his transition's ring). Phase 3, the nine-tailed fox wakes:
   * A ROAR OF FOXFIRE. Three ragged fronts of foxfire one after another (the roar's waves; no crisp
   * echo: at this size a steel ripple prints as an even white polygon), a gout of foxfire thrown out of
   * the fox's head along his facing, a column climbing round him for a second (update), sparks, a light.
   * Not the Ash Disciple's ash on the wind. Other phases: the duelists'. ~450 blobs at its peak.
   */
  phaseBurst(n, x, z) {
    if (n !== 3) return super.phaseBurst(n, x, z);
    if (!Number.isFinite(x + z)) return;
    const d = this.d, r = fin(d?.T?.transition?.ringRadius, 6), F = this.FOX;
    this.shock(x, z, r, this._opt(1.3, 1, this._front, 0, false));
    this.shock(x, z, r * 0.75, this._opt(0.7, 0.8, this._front, 0.16, false));
    this.shock(x, z, r * 0.5, this._opt(0.45, 0.7, this._front, 0.32, false));
    // the roar's breath: out of the fox's head, along his facing, widening
    const yaw = fin(d?.yaw, 0), fx = Math.sin(yaw), fz = Math.cos(yaw), sx = -fz, sz = fx, hy = Math.max(1.4, fin(d?._hs?.[0]?.y, 1.5) * 1.1);
    for (let i = 0; i < 34; i++) {
      const sp = this.krand(5, 10), lat = this.krand(-1, 1) * sp * 0.45;
      this._blob(x + fx * 0.3, hy + this.krand(-0.15, 0.15), z + fz * 0.3, fx * sp + sx * lat, this.krand(-0.8, 1.2), fz * sp + sz * lat, this.krand(0.3, 0.5), 0.36, 0.9, 0.5, 0, F, 2.6, 0.8);
    }
    const Cm = this._colm;
    Cm.alive = true;
    Cm.x = x;
    Cm.z = z;
    Cm.t = 0;
    Cm.T = 1.0;
    Cm.acc = 0;
    this._sparks(x, 1.1, z, 20, 2, 7, 3);
    this.game.world?.gust?.(x, z, 1.6, r * 2);
    this._light({ x, y: 1.5, z, color: this.L.light, intensity: 4.5, radius: r * 1.6, life: 0.7, fade: 0.6 });
  }

  // ---------------------------------------------------------------- his bare hands
  /**
   * A blow's trail (the engine calls this through every strike: his striking limb is its "blade", root
   * pa → a, end pb → b): the path of the fist or the foot, written on the letter grid (a short crisp
   * streak, not a blade's arc), the air it crossed in faint pale strokes; with the mantle lit (phase 3)
   * foxfire licks off the path instead. A kick also kicks up a little dust. ~6 - 14 blobs a frame.
   */
  sweep(pa, pb, a, b) {
    if (!this.fire || !Number.isFinite(pb.x + pb.y + pb.z + b.x + b.y + b.z)) return;
    const dx = b.x - pb.x, dy = b.y - pb.y, dz = b.z - pb.z, st = Math.hypot(dx, dy, dz);
    if (!(st > 0.04 && st < 4)) return; // (a still limb leaves nothing; a teleport: nothing either)
    const d = this.d, part = String(d?._part ?? ''), leg = part.startsWith('foot') || part.startsWith('knee') || part === 'feet';
    const lit = fin(d?.mantleK, 0) > 0.3;
    this._ink(pb.x, pb.y, pb.z, b.x, b.y, b.z, this.lrand(0.12, 0.17), 0.45, 0, 0.95, 1);
    const n = Math.min(6, Math.max(1, Math.ceil(st / 0.12)));
    for (let i = 1; i <= n; i++) {
      const u = i / n, x = pb.x + dx * u, y = pb.y + dy * u, z = pb.z + dz * u;
      if (lit) this._blob(x, Math.max(0.75, y), z, this.lrand(-0.2, 0.2), this.lrand(0.2, 0.7), this.lrand(-0.2, 0.2), this.lrand(0.16, 0.26), 0.36, 0.2, 0.42, 0, this.FOX, 1.5, 1.2);
      else this._blob(x, y, z, 0, 0, 0, this.lrand(0.1, 0.15), 0.4, 0.34, 0.09, 0, K_STEEL);
    }
    if (leg && b.y < 0.7 && this.lr() < 0.35) this._blob(b.x, this.lrand(0.75, 0.9), b.z, dx * 2, this.lrand(0.2, 0.5), dz * 2, this.lrand(0.4, 0.7), 0.4, 1.0, 0.42, 0, K_SMOKE, 2.4, 0.3);
  }
  _columnRun(dt) {
    const Cm = this._colm;
    if (!(dt > 0)) return;
    Cm.t += dt;
    if (Cm.t >= Cm.T) {
      Cm.alive = false;
      return;
    }
    const u = Cm.t / Cm.T, k = u < 0.15 ? u / 0.15 : (1 - u) / 0.85;
    // (round him as he is now: he may have stepped)
    const p = this.d?.position, x = Number.isFinite(p?.x) ? p.x : Cm.x, z = Number.isFinite(p?.z) ? p.z : Cm.z;
    Cm.acc += dt * 130 * k;
    let g = 0;
    while (Cm.acc >= 1 && g++ < 8) {
      Cm.acc -= 1;
      const a = this.kr() * TAU, rr = this.krand(0.5, 1.2), sp = this.krand(1.5, 3);
      this._blob(x + Math.cos(a) * rr, this.krand(0.8, 1.4), z + Math.sin(a) * rr, -Math.sin(a) * sp, this.krand(3, 6), Math.cos(a) * sp, this.krand(0.4, 0.7), 0.46, 0.22, 0.38, 0, this.FOX, 1.2, 1.5);
    }
  }
}

export { K_STEEL, K_SMOKE };
