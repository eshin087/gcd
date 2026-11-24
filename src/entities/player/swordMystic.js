// THE SWORD'S MYSTICAL LAYER (options for the owner's pick; `?mystic=0` / no parameter = off, exactly
// today). The owner: "i also want his sword to look a bit more mystical in a subtle way. maybe make
// the sword animation change as you get streaks". Four readings of it, each one idea that is already
// there with no streak (a quiet presence at rest, at ease and in a fight) and wakes up tier by tier
// (combat/streak.js streakTier 0..5). They are independent of each other and of the streak pass's
// pieces (it reads the hero's own streak, so `?streakfx=off` does not turn it off).
//
//   a  BREATH   a slow breath of light leaves the violet gem and runs up the ridge to the point, in
//               time with the gem's own breathing; with the streak it comes faster, longer, brighter,
//               a second one behind it, and at the top tiers it leaves the point as a mote
//   b  SCRIPT   a few tiny digits (his afterimage's letters) rise up the fuller, each fading in and out
//               on its way; with the streak there are more of them, quicker, and from tier 4 some leave
//               the point and drift off on the wind
//   c  WISPS    thin wisps of tiny letters come off the steel and go with the wind: a slow trickle off
//               the point at rest, more where the blade moves; the streak thickens them and they live
//               longer
//   d  SHADOW   the steel leaves a faint copy of itself where it stops: after a cut (where the blade
//               ends), and now and then at rest as it settles, sliding off on the wind; with the streak
//               it lingers longer, a cut leaves copies at its middle too
//
// The house rules it keeps: the steel itself stays dark until it cuts (nothing here writes a uniform);
// everything is glyph particles of the world atlas on game.fx.add (a fire cell is wider than the
// blade), tiny (about one of his letter cells) and under the bloom threshold; its own random stream
// (never Math.random); a few spawns a frame at most (`budget`); nothing on a dead, hidden or unarmed
// hero. Through the flurry it rests (he is mostly not there and the flurry has its own look); through
// the Ghostep's cold cast after a perfect dodge it goes on (it never blinks off for a second).

import { streakTier } from '../../combat/streak.js';
import { DIM } from './model.js';

const IDS = ['0', 'a', 'b', 'c', 'd'];
export const MYSTIC_IDS = Object.freeze(IDS.slice());
export const MYSTIC_NAMES = Object.freeze({ 0: 'off (today)', a: 'breath', b: 'script', c: 'wisps', d: 'shadow' });

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const PICK = { mode: IDS.includes(q('mystic')) ? q('mystic') : '0', arc: q('arc') === '1' };

/** `?arc=1`: the swing's arc grows with the streak (fx.js ARC_STREAK); off = today exactly. */
export const arcOn = () => PICK.arc;
/** Lab / tests: switch the growing arc live. Returns what is now set. */
export function setArc(on) {
  PICK.arc = on === true || on === 1 || on === '1';
  return PICK.arc;
}

/** The option drawn now ('0' = off). */
export const mysticMode = () => PICK.mode;
/** Lab / tests: switch it live (an unknown id turns it off). Returns the id now set. */
export function setMystic(id) {
  PICK.mode = IDS.includes(String(id)) ? String(id) : '0';
  return PICK.mode;
}

// its own stream (ADR-122): a look must never move the seeded sims
let mseed = 0x3c6ef372;
const rnd = () => (mseed = (Math.imul(mseed, 1664525) + 1013904223) >>> 0) / 4294967296;
const R = (a, b) => a + rnd() * (b - a);
/** Tests: put the stream at `v`. */
export const setMysticSeed = (v) => (mseed = v >>> 0);

/** Glyphs each option may spawn (all in the world atlas; the scenario checks every spawn). */
export const MYSTIC_GLYPHS = Object.freeze({ a: "|·'", b: '0123456789·', c: ".'`·", d: '|' });

/**
 * The tuning, one entry per tier (index = streakTier 0..5).
 *   budget   spawns a frame at most (every option)
 *   lift     m the strokes are drawn toward the camera (the particles' soft depth test fades a stroke
 *            on the steel's own depth: fx.js STREAK_EDGE.lift)
 *   rise     1/s: a new tier comes up this fast (it drops at once)
 *   quiet    how much of the look stays while the blade is lit by a cut (bladeHot 1): the cut is the
 *            steel's own moment
 */
export const MYSTIC = {
  budget: 6,
  lift: 0.6,
  rise: 3,
  quiet: 0.25,
  a: {
    period: [5.2, 4.4, 3.8, 3.2, 2.7, 2.2], // s from the gem to the point
    len: [0.12, 0.15, 0.19, 0.23, 0.28, 0.34], // m of the steel the breath covers
    alpha: [0.34, 0.4, 0.46, 0.52, 0.58, 0.64],
    second: [0, 0, 0, 1, 1, 1], // a second breath half a period behind
    mote: [0, 0, 0, 0, 1, 1], // it leaves the point as a mote
    size: 0.085,
    // violet at the gem cooling to the steel's cold blue at the point (under the bloom)
    from: [0.42, 0.18, 0.95], to: [0.3, 0.5, 1.0], top: [0.5, 0.62, 1.05],
  },
  b: {
    slots: [2, 2, 3, 4, 5, 6], // digits on the steel at once
    speed: [0.1, 0.12, 0.15, 0.18, 0.22, 0.27], // m/s up the fuller
    alpha: [0.38, 0.44, 0.5, 0.55, 0.6, 0.66],
    leave: [0, 0, 0, 0, 0.35, 0.6], // share of the digits that leave the point and drift off
    size: 0.12,
    col: [0.28, 0.46, 0.95], hot: [0.42, 0.62, 1.05],
  },
  c: {
    rest: [0.9, 1.2, 1.8, 2.6, 3.4, 4.4], // wisps a second at rest, off the upper steel
    move: [3, 4, 6, 8, 11, 14], // more per metre the point travels
    life: [0.7, 0.75, 0.85, 0.95, 1.05, 1.2],
    alpha: [0.4, 0.44, 0.5, 0.56, 0.62, 0.68],
    size: 0.11,
    wind: 0.55, // share of the wind they ride (and a floor of drift up and back when the air is still)
    col: [0.3, 0.5, 0.95], end: [0.06, 0.1, 0.3],
  },
  d: {
    life: [0.32, 0.4, 0.5, 0.62, 0.76, 0.92], // s a copy lingers
    alpha: [0.3, 0.34, 0.4, 0.46, 0.52, 0.58],
    mid: [0, 0, 0, 1, 1, 1], // a cut also leaves one at its middle
    rest: [2.6, 2.4, 2.1, 1.8, 1.5, 1.2], // s between copies at rest (when the blade has moved)
    strokes: 3, // strokes laid along the steel for one copy
    size: 0.07,
    slide: 0.18, // m/s the copy slides off on the wind
    col: [0.3, 0.48, 0.95], end: [0.05, 0.08, 0.25],
  },
};

// reused spawn records (no allocation per frame)
const S = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.02, size: 0.1, sizeEnd: 0.1, glyph: '|', stretch: 0, rot: 0, color: [0, 0, 0], colorEnd: [0, 0, 0], alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, flicker: 0, spin: 0 };
const C0 = [0, 0, 0], C1 = [0, 0, 0];
const WIND = { x: 0, z: 0 };
const DIG = '0123456789';
const lerp3 = (o, a, b, t) => {
  o[0] = a[0] + (b[0] - a[0]) * t;
  o[1] = a[1] + (b[1] - a[1]) * t;
  o[2] = a[2] + (b[2] - a[2]) * t;
  return o;
};

export class SwordMystic {
  constructor(player) {
    this.player = player;
    this.game = player?.game ?? null;
    this.t = 0; // its own clock (fx time)
    this.vis = 0; // 0..1: how much of the tier is up
    this.tier = 0;
    this.n = 0; // spawns this frame (tests)
    this.total = 0; // spawns so far (tests)
    this.acc = 0; // (c) wisps owed
    this.restT = 0; // (d) time since the last copy at rest
    this.moved = 0; // (d) how far the point moved since the last copy
    this.atkSeen = null; // (d) the attack whose copies were laid
    this.midDone = false;
    this.endDone = false;
    this.slots = null; // (b) the digits' phases and letters
    this.mote = [false, false]; // (a) each breath's mote left this time round
    this.tipX = NaN;
    this.tipY = 0;
    this.tipZ = 0;
    this.speed = 0; // m/s the drawn point moves (smoothed)
  }

  /** Per frame (player._updateFx). With the option off it returns at once: nothing spawned. */
  update(dt) {
    this.n = 0;
    const mode = PICK.mode;
    if (mode === '0') return;
    const P = this.player, g = this.game;
    const fdt = Math.max(Number.isFinite(g?.fxDt) ? g.fxDt : 0, Number.isFinite(dt) ? dt : 0);
    if (!(fdt > 0) || !P) return;
    const add = g?.fx?.add, sw = P.rig?.sword, e = sw?.matrixWorld?.elements;
    const armed = !!P.rig?.loadout?.weapon;
    const hidden = (P.state === 'flurry') || (P.state === 'plunge' && P.pl?.phase === 0) || P.object3d?.visible === false;
    if (!add || !e || !armed || !P.alive || P.state === 'dead' || hidden) {
      this.tipX = NaN;
      return;
    }
    this.t += fdt;
    // the tier (the hero's own streak; it comes up in ~1/rise s and drops at once)
    const t = Math.min(5, Math.max(0, streakTier(P.streak | 0)));
    if (t < this.tier) this.vis = 0;
    this.tier = t;
    this.vis = Math.min(1, this.vis + fdt * MYSTIC.rise);
    // the drawn point and its speed
    const tip = DIM.drawnTip ?? DIM.steelTip;
    const px = e[8] * tip + e[12], py = e[9] * tip + e[13], pz = e[10] * tip + e[14];
    if (!Number.isFinite(px + py + pz)) return;
    let step = 0;
    if (Number.isFinite(this.tipX)) step = Math.hypot(px - this.tipX, py - this.tipY, pz - this.tipZ);
    if (!(step < 3)) step = 0; // (a teleport, a respawn)
    this.tipX = px;
    this.tipY = py;
    this.tipZ = pz;
    const sp = step / fdt;
    this.speed += (Math.min(40, sp) - this.speed) * Math.min(1, fdt * 20);
    // the cut's own light quiets it (bladeHot 1 → MYSTIC.quiet)
    const hot = Math.min(1, Math.max(0, Number(P.bladeHot) || 0));
    const quiet = 1 - (1 - MYSTIC.quiet) * hot;
    const cam = g.camera?.matrixWorld?.elements;
    this._cx = cam ? cam[8] * MYSTIC.lift : 0;
    this._cy = cam ? cam[9] * MYSTIC.lift : 0;
    this._cz = cam ? cam[10] * MYSTIC.lift : 0;
    this._cam = cam ?? null;
    try {
      if (mode === 'a') this._breath(add, e, t, fdt, quiet);
      else if (mode === 'b') this._script(add, e, t, fdt, quiet);
      else if (mode === 'c') this._wisps(add, e, t, fdt, quiet, step);
      else if (mode === 'd') this._shadow(add, e, t, fdt, quiet, step);
    } catch (err) {
      console.error('[swordMystic]', err);
    }
  }

  /** Tier value from a table, blended toward the tier below while it comes up. */
  _k(arr, t) {
    const lo = arr[Math.max(0, t - 1)], hi = arr[t];
    return t > 0 ? lo + (hi - lo) * this.vis : hi;
  }

  /** Screen rotation that lays a '|' along the blade (the rendering camera's axes, as fx.js alongRot). */
  _rot(e) {
    const C = this._cam, dl = Math.hypot(e[8], e[9], e[10]) || 1;
    const dx = e[8] / dl, dy = e[9] / dl, dz = e[10] / dl;
    if (C) {
      const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6];
      if (sx * sx + sy * sy > 1e-12 && Number.isFinite(sx + sy)) return Math.atan2(sy, sx) - Math.PI / 2;
    }
    return 0;
  }

  _spawn(add) {
    if (this.n >= MYSTIC.budget) return false;
    if (!Number.isFinite(S.x + S.y + S.z) || S.y < 0.03) return false;
    add.spawn(S);
    this.n++;
    this.total++;
    return true;
  }

  /** Sword-space point (xx, 0, zz) → S.x/y/z, drawn toward the camera. */
  _at(e, xx, zz) {
    S.x = e[0] * xx + e[8] * zz + e[12] + this._cx;
    S.y = e[1] * xx + e[9] * zz + e[13] + this._cy;
    S.z = e[2] * xx + e[10] * zz + e[14] + this._cz;
  }

  _reset(life) {
    S.vx = S.vy = S.vz = 0;
    S.life = life;
    S.stretch = 0;
    S.rot = 0;
    S.drag = 0;
    S.gravity = 0;
    S.flicker = 0;
    S.spin = 0;
    S.alphaEnd = 0;
  }

  // ------------------------------------------------------------------ a: the breath
  _breath(add, e, t, fdt, quiet) {
    const A = MYSTIC.a, z0 = DIM.gem, z1 = (DIM.drawnTip ?? DIM.steelTip) - 0.02;
    const period = this._k(A.period, t), len = this._k(A.len, t), alpha = this._k(A.alpha, t) * quiet;
    const rot = this._rot(e);
    const dl = Math.hypot(e[8], e[9], e[10]) || 1;
    const n = 1 + (A.second[t] ? 1 : 0);
    for (let i = 0; i < n; i++) {
      // 0..1 through one breath; the second half a period behind
      const u = (((this.t / period) + i * 0.5) % 1 + 1) % 1;
      // it eases out of the gem, runs, and thins at the point
      const s = u * u * (3 - 2 * u);
      const zc = z0 + (z1 - z0) * s;
      const fade = Math.sin(Math.PI * Math.min(1, u * 1.08)); // in from nothing, out at the point
      const a = alpha * Math.max(0, fade) * (i ? 0.7 : 1);
      if (!(a > 0.02)) continue;
      this._reset(fdt * 1.6);
      this._at(e, 0, zc);
      S.glyph = '|';
      S.size = S.sizeEnd = A.size;
      S.stretch = Math.min(12, (len * dl) / A.size);
      S.rot = rot;
      lerp3(C0, A.from, t >= 4 ? A.top : A.to, s);
      S.color = C0;
      S.colorEnd = C0;
      S.alpha = S.alphaEnd = Math.min(1, a);
      this._spawn(add);
      // the top tiers: past the point it leaves the steel as a mote, once a breath
      if (A.mote[t] && u > 0.93 && !this.mote[i]) {
        this.mote[i] = true;
        this._reset(R(0.5, 0.8));
        this._at(e, 0, z1 + 0.02);
        S.glyph = "·'";
        S.size = 0.09;
        S.sizeEnd = 0.05;
        S.vx = R(-0.1, 0.1);
        S.vy = R(0.25, 0.45);
        S.vz = R(-0.1, 0.1);
        S.drag = 1;
        S.color = A.top;
        S.colorEnd = A.from;
        S.alpha = Math.min(1, alpha * 1.1);
        S.alphaEnd = 0;
        this._spawn(add);
      } else if (u < 0.5) this.mote[i] = false;
    }
  }

  // ------------------------------------------------------------------ b: the script in the fuller
  _script(add, e, t, fdt, quiet) {
    const B = MYSTIC.b, z0 = DIM.forte + 0.03, z1 = (DIM.drawnTip ?? DIM.steelTip) - 0.06, L = z1 - z0;
    const nSlot = B.slots[t], speed = this._k(B.speed, t), alpha = this._k(B.alpha, t) * quiet;
    if (!this.slots) {
      this.slots = [];
      for (let i = 0; i < 8; i++) this.slots.push({ u: i / 8 + R(0, 0.1), d: '0', left: false });
      for (const s of this.slots) s.d = DIG[Math.floor(rnd() * 10)];
    }
    const du = (speed * fdt) / L;
    for (let i = 0; i < nSlot; i++) {
      const s = this.slots[i];
      s.u += du * (0.85 + 0.3 * ((i * 0.37) % 1));
      if (s.u >= 1) {
        // it reached the point: from tier 4 some leave the steel and drift off
        if (rnd() < B.leave[t] && this.n < MYSTIC.budget) {
          this._reset(R(0.8, 1.2));
          this._at(e, 0, z1 + 0.04);
          const w = this._wind();
          S.glyph = s.d;
          S.size = B.size;
          S.sizeEnd = B.size * 0.8;
          S.vx = w.x * 0.5 + R(-0.05, 0.05);
          S.vy = R(0.2, 0.35);
          S.vz = w.z * 0.5 + R(-0.05, 0.05);
          S.drag = 0.8;
          S.color = B.hot;
          S.colorEnd = B.col;
          S.alpha = alpha * 0.9;
          S.alphaEnd = 0;
          S.flicker = 0.2;
          this._spawn(add);
        }
        s.u -= 1;
        s.d = DIG[Math.floor(rnd() * 10)];
      }
      const fade = Math.sin(Math.PI * s.u);
      const a = alpha * fade * fade;
      if (!(a > 0.03)) continue;
      this._reset(fdt * 1.6);
      this._at(e, 0, z0 + L * s.u);
      S.glyph = s.d;
      S.size = S.sizeEnd = B.size;
      S.color = S.colorEnd = lerp3(C0, B.col, B.hot, s.u * (t / 5));
      S.alpha = S.alphaEnd = Math.min(1, a);
      this._spawn(add);
    }
  }

  // ------------------------------------------------------------------ c: wisps off the steel
  _wind() {
    const W = this.game?.world?.life?.wind;
    WIND.x = 0;
    WIND.z = 0;
    if (W && typeof W.at === 'function') {
      const P = this.player.position;
      const o = W.at(P.x, P.z, WIND);
      if (o && Number.isFinite(o.x + o.z)) {
        WIND.x = o.x;
        WIND.z = o.z;
      }
    }
    return WIND;
  }

  _wisps(add, e, t, fdt, quiet, step) {
    const Cc = MYSTIC.c, z0 = DIM.forte + 0.1, z1 = (DIM.drawnTip ?? DIM.steelTip) - 0.02;
    const rate = this._k(Cc.rest, t) + this._k(Cc.move, t) * Math.min(1.5, step / fdt) * (0.4 + 0.6 * quiet);
    this.acc = Math.min(MYSTIC.budget, this.acc + fdt * rate);
    if (this.acc < 1) return;
    const w = this._wind(), k = Cc.wind;
    const life = this._k(Cc.life, t), alpha = this._k(Cc.alpha, t) * (0.5 + 0.5 * quiet);
    while (this.acc >= 1 && this.n < MYSTIC.budget) {
      this.acc -= 1;
      // the upper steel more than the forte
      const f = Math.sqrt(rnd());
      this._reset(life * R(0.8, 1.2));
      this._at(e, R(-0.02, 0.02), z0 + (z1 - z0) * f);
      S.glyph = ".'`·";
      S.size = Cc.size * R(0.85, 1.1);
      S.sizeEnd = Cc.size * 0.6;
      // the wind, a little up, a floor of drift when the air is still
      S.vx = w.x * k + R(-0.08, 0.08);
      S.vy = R(0.12, 0.32);
      S.vz = w.z * k + R(-0.08, 0.08);
      S.drag = 0.6;
      S.color = Cc.col;
      S.colorEnd = Cc.end;
      S.alpha = Math.min(1, alpha);
      S.alphaEnd = 0;
      S.flicker = 0.15;
      this._spawn(add);
    }
  }

  // ------------------------------------------------------------------ d: the steel's shadow
  _shadow(add, e, t, fdt, quiet, step) {
    const D = MYSTIC.d, P = this.player, a = P.atk;
    this.restT += fdt;
    this.moved += step;
    const cutting = !!a && !a.pending && (P.state === 'attack' || P.state === 'heavy') && a.def;
    if (cutting) {
      if (this.atkSeen !== a) {
        this.atkSeen = a;
        this.midDone = this.endDone = false;
      }
      const W = a.def.windup, end = W + a.def.active;
      if (D.mid[t] && !this.midDone && a.t >= W + a.def.active * 0.5) {
        this.midDone = true;
        this._copy(add, e, t, 0.75);
      }
      if (!this.endDone && a.t >= end) {
        this.endDone = true;
        this._copy(add, e, t, 1);
      }
      this.restT = 0;
      this.moved = 0;
      return;
    }
    this.atkSeen = null;
    // at rest: now and then, when the blade has moved a little since the last copy (it settles)
    if (this.restT >= this._k(D.rest, t) && this.moved > 0.04) {
      this.restT = 0;
      this.moved = 0;
      this._copy(add, e, t, 0.6 * (0.5 + 0.5 * quiet));
    }
  }

  /** One faint copy of the steel: D.strokes '|' laid along it, sliding off on the wind. */
  _copy(add, e, t, k) {
    const D = MYSTIC.d, z0 = DIM.forte, z1 = (DIM.drawnTip ?? DIM.steelTip) - 0.03;
    const rot = this._rot(e);
    const dl = Math.hypot(e[8], e[9], e[10]) || 1, seg = ((z1 - z0) / D.strokes) * dl;
    const w = this._wind(), wl = Math.hypot(w.x, w.z);
    const life = this._k(D.life, t), alpha = this._k(D.alpha, t) * k;
    for (let i = 0; i < D.strokes; i++) {
      const zz = z0 + (z1 - z0) * ((i + 0.5) / D.strokes);
      this._reset(life);
      this._at(e, 0, zz);
      S.glyph = '|';
      S.size = D.size;
      S.sizeEnd = D.size * 0.7;
      S.stretch = Math.min(14, (seg * 1.05) / D.size);
      S.rot = rot;
      S.vx = wl > 0.05 ? (w.x / wl) * D.slide : 0;
      S.vz = wl > 0.05 ? (w.z / wl) * D.slide : 0;
      S.vy = 0.04;
      S.color = D.col;
      S.colorEnd = D.end;
      S.alpha = Math.min(1, alpha * (i === D.strokes - 1 ? 1 : 0.85));
      S.alphaEnd = 0;
      this._spawn(add);
    }
  }
}
