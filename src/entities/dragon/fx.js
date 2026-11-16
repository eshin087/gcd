import * as THREE from 'three';
import { TUNING, SCALE } from './tuning.js';
import { DuelFx } from '../enemies/duelist/fx.js';

/** A blast as a blow on the world (world.impact). */
const FIRE_BLOW = Object.freeze({ kind: 'blast', by: 'boss' });

// Dragon FX. Everything that burns is heat in the fire field (render/fireField.js, ADR-113: blobs
// that add up into one body of fire printed in the wyrm's small digits): the breath, the fireballs
// and their blasts, meteors, lava pillars, the burning strip / ring / wall, the nova. Sparks, embers,
// rocks and dust stay small glyph particles; the roar's rings are the field's crisp kind (strokes).
// Also: pooled lights, scorch, nostril embers, eye glints, phase-2 / death embers, and the combat
// read-outs: timing flashes (red alarm burst for dodge-only tells, a white glint for parryable
// ones — no colour coding or text for parry), ground warnings as the ground heating up (ADR-052:
// no red rings, no '!' marks), white/gold parry sparks, posture break. Every light this module creates is tracked so reset() can kill them.
// Body-linked sizes / distances scale with the wyrm (SCALE); projectile blasts do not.

const S = SCALE;
const EMBER = ".'`*";
const DUST = ",.`:'";
// the timing cues' scale (DuelFx.tellFlash's k: 1 = a human's): the wyrm's are half again as big
const TELL_K = 1.5;
// parry sparks: hot white core, white + gold sparks (blue parries are bigger, not blue)
const PARRY_WHITE = [3.4, 3.2, 2.8];
const PARRY_GOLD = [3.4, 2.3, 0.75];
const PARRY_END = [0.8, 0.5, 0.2];
const PARRY_LIGHT = [1, 0.88, 0.62];
const rand = (a, b) => a + Math.random() * (b - a);
// scorch + ground flames along the breath: [distance from the mouth, radius] (v0.1 metres)
const SCORCH_STEPS = [[4, 1.4], [6.5, 1.7], [9, 2.0], [11.5, 2.2]];
// fire hazards / spells / flight (dragon-fire): atlas glyphs and linear HDR colours
const HZ_RISE = '^';
const CLAW_STREAK = '-';
const CRACK = '~^,';
const ROCK = '.,:;o';
const LAVA_DROPS = '.o•';
const EMBER_STAR = ".'*•";
const HOT = [4.6, 3.5, 1.5]; // white-yellow fire core
const FLAME = [3.4, 1.4, 0.28]; // orange
const DARK = [0.8, 0.08, 0.012]; // a dying flame
const EMBER_COL = [3.0, 1.0, 0.18];
const WHITE_HOT = [6.0, 5.2, 4.0];
const LAVA_HOT = [3.3, 1.9, 0.55];
const LAVA = [2.5, 0.8, 0.13];
const LAVA_END = [1.1, 0.12, 0.02];
const ROCK_COL = [0.17, 0.14, 0.12];
const NO_HIT = Object.freeze({ hitDone: true }); // a volley that never deals damage (visual shells)
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// ground heat (every ground warning, ADR-052, docs/STYLE.md "Ground warnings"): a sparse, stable
// fill of small ground glyphs over the footprint, coloured by heat (dark ember -> orange ->
// white-orange as k runs 0 -> 1), denser and brighter toward impact, sparks from k 0.6, and the
// true edge drawn only in the last flashLead s ('hot'). The scorch map's heat channel is stamped
// too, so the soil and grass glyphs themselves glow. Nothing rotates or marches; no red, no '!'.
const HEAT_GLYPHS = ".,:'"; // one char per point (a multi-char string would re-roll every frame)
const HEAT_SPARK = ".'`";
const HEAT_RIM = '·';
const HEAT_DARK = [0.35, 0.08, 0.02];
const HEAT_MID = [1.7, 0.55, 0.09];
const HEAT_HOT = [3.1, 1.75, 0.6];
const HEAT_EDGE = [3.8, 2.5, 1.0];
const HEAT_LIGHT = [1, 0.55, 0.2];
const HEAT_CELL = 0.7; // m^2 of footprint per fill glyph at full density
const HEAT_MAX = 180; // fill glyphs per footprint (huge discs draw bigger, sparser glyphs)
const HEAT_STAMP = 0.12; // s between scorch-heat stamps of one warning
const GOLDEN = 2.399963229728653;
const hash01 = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------------------------------------------------------------- the looks the owner picks from
// (?ring=a|b|c, ?breath=a|b|c; `a` is the default; read once, headless runs have no location)
//   ring  a: a rolling wall of fire with a dust wall behind it      b: a pressure front written in
//            crisp strokes on the ground, a dust skirt, echo ripples  c: the ground heaves: a ring of
//            thrown earth, clods and stones running out, no fire but where it started
//   breath a: a torrent: a white rod at the jaws that widens, slows and rolls up into billows, smoke
//            over it, a splash of flame on the ground at its end      b: lashing tongues: five
//            streams that whip across the cone        c: liquid fire: an arc that rains down onto the
//            ground and spreads there as a carpet of flame
const LOOKS = ['a', 'b', 'c'];
let RING_LOOK = 'a';
let BREATH_LOOK = 'a';
try {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  if (LOOKS.includes(q.get('ring'))) RING_LOOK = q.get('ring');
  if (LOOKS.includes(q.get('breath'))) BREATH_LOOK = q.get('breath');
} catch {
  /* headless */
}
/** The shock ring's look in use ('a' | 'b' | 'c'). */
export const ringLook = () => RING_LOOK;
export const setRingLook = (k) => {
  if (LOOKS.includes(k)) RING_LOOK = k;
};
/** The fire breath's look in use ('a' | 'b' | 'c'). */
export const breathLook = () => BREATH_LOOK;
export const setBreathLook = (k) => {
  if (LOOKS.includes(k)) BREATH_LOOK = k;
};

// A shock front (_shock): numbers per look. front: the leading row of blobs (spacing at the end
// radius, size at birth / at the end, heat, height); rows: the rows behind it ([speed share, count
// share, heat share, kind 0 fire / 1 smoke]); lobe: how far the front's radius wanders round the
// ring (two waves of 3 and 5 lobes); gap: below this strength a stretch of the front is left out;
// dust / rocks: glyphs kicked up off the ground per metre of front per s at full speed; scorch:
// [burn, glow] stamped where it passes; echo: thin crisp ripples sent after it ([delay share of T,
// heat]); drag: how hard it slows (x 1/T).
const SHOCK = Object.freeze({
  a: {
    front: { gap: 0.55, size: 0.85, sizeEnd: 1.9, heat: 0.6, y0: 0.8, y1: 1.3, kind: 0, gravity: 1.5 },
    rows: [[0.86, 0.65, 0.7, 0], [0.74, 0.5, 0.55, 1]],
    lobe: [0.06, 0.04], gapBelow: 0.22, dust: 2.2, rocks: 0.25, scorch: [0.09, 0.85], echo: [[0.62, 0.3, 0.5]], drag: 2.6,
  },
  b: {
    front: { gap: 0.3, size: 0.75, sizeEnd: 0.95, heat: 0.85, y0: 0.75, y1: 0.85, kind: 3, gravity: 0 },
    rows: [[0.93, 0.35, 0.35, 0], [0.84, 0.7, 0.9, 1]],
    lobe: [0.03, 0.02], gapBelow: 0.36, dust: 3.2, rocks: 0.1, scorch: [0.03, 0.55], echo: [[0.3, 0.5, 0.36], [0.6, 0.36, 0.42]], drag: 2.2,
  },
  c: {
    front: { gap: 0.5, size: 0.9, sizeEnd: 2.0, heat: 0.8, y0: 0.75, y1: 0.9, kind: 1, gravity: 0.3 },
    rows: [[0.82, 0.7, 0.75, 1]],
    lobe: [0.1, 0.06], gapBelow: 0.15, dust: 4.5, rocks: 5, scorch: [0.04, 0], echo: [], drag: 3.4, heave: true,
  },
});
const SHOCK_POOL = 14;
const SHOCK_DT = 1 / 60; // the frame the fronts are aimed with (the field's drag is per frame)
const DUST_COL = [0.2, 0.19, 0.17];
const DUST_WARM = [0.42, 0.24, 0.12];
const GRIT = ".,:'`";

export class DragonFx {
  constructor(dragon) {
    this.d = dragon;
    this.game = dragon.game;
    this.lights = new Set();
    this.breathLights = [];
    this.breathing = false;
    this.breathAcc = 0;
    this.smokeAcc = 0;
    this.scorchTimer = 0;
    this.emberAcc = 0;
    this._bodyAcc = 0;
    this._held = { glint: 0, warn: 0, stars: 0, flare: 0 };
    this._coreAcc = 0;
    this._tongueAcc = 0;
    this._sparkAcc = 0;
    this._claw = [{ t: -9, x: 0, y: 0, z: 0 }, { t: -9, x: 0, y: 0, z: 0 }]; // clawTrail: the last toe position per foreleg
    this._zoneHeat = { hold: 0, acc4: 0, heatT: 0, seed: 1, lastT: -9 }; // warnRing's heat state
    // heat-spark samplers (bound once: no per-frame closures) and their footprint scratch
    this._heatPt = { x: 0, z: 0 };
    this._discX = this._discZ = this._discR = 0;
    this._bandAx = this._bandAz = this._bandDx = this._bandDz = this._bandS0 = this._bandL = this._bandHw = 0;
    this._discAt = (q) => {
      const a = Math.random() * Math.PI * 2, rr = this._discR * Math.sqrt(Math.random());
      q.x = this._discX + Math.cos(a) * rr;
      q.z = this._discZ + Math.sin(a) * rr;
    };
    this._bandAt = (q) => {
      const s = this._bandS0 + Math.random() * this._bandL, l = (Math.random() * 2 - 1) * this._bandHw;
      q.x = this._bandAx + this._bandDx * s - this._bandDz * l;
      q.z = this._bandAz + this._bandDz * s + this._bandDx * l;
    };
    this.projectiles = Array.from({ length: 6 }, () => ({
      alive: false,
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      light: null,
      volley: null,
      age: 0,
      trail: 0,
      smoke: 0,
      hold: 0,
    }));
    // fire hazards / spells (see the "fire" section): one reused spawn record + colour scratch
    this._r = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.1, size: 0.4, sizeEnd: 0.4, glyph: '*', color: null, colorEnd: null, alpha: 1, alphaEnd: 0, drag: 0, gravity: 0, spin: 0, rot: 0, flicker: 0, stretch: 0 };
    // the timing cues (tellFlash): the one design every boss shares, drawn by the duelists' effects
    // (a white cross / star written on the letter grid, a red blaze), at the wyrm's size
    this.tells = new DuelFx(dragon);
    this._b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 1, sizeEnd: 1, heat: 0.5, heatEnd: 0.2, drag: 0, gravity: 0, kind: 0 }; // _blob's record
    this._c0 = [0, 0, 0];
    this._c1 = [0, 0, 0];
    this.skyLights = [];
    this.skyAcc = 0;
    this.bolts = Array.from({ length: 20 }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, hold: 0, acc: 0 }));
    this._novaAcc = 0;
    this._novaRing = 0;
    this._gatherAcc = 0;
    this._lickAcc = 0;
    // shock fronts in flight (_shock): the blobs are spawned once and roll out by themselves; the
    // record follows the front to kick dust and rocks off the ground, scorch it, send the echoes
    this._shocks = Array.from({ length: SHOCK_POOL }, () => ({
      alive: false, spawned: false, x: 0, z: 0, y: 1, r0: 0, r1: 0, T: 1, D: 1, v0: 0, t: 0, delay: 0,
      k: 1, fk: 1, look: 'a', dust: 0, rock: 0, scorchT: 0, echo: 0, p1: 0, p2: 0, p3: 0, p4: 0,
    }));
    this._brT = 0; // the breath's own clock (tongues, billows)
    this._brAcc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // the breath's emitters' accumulators
  }

  get add() {
    return this.game.fx?.add;
  }
  get alpha() {
    return this.game.fx?.alpha;
  }
  /** The fire field (render/fireField.js): fire as one body of heat printed in small digits. */
  get fire() {
    return this.game.fx?.fire;
  }

  /**
   * One blob of heat into the fire field (reused record: no per-frame allocation). size / sizeEnd in
   * metres across, heat / heatEnd what it adds at its centre (overlaps add up), gravity > 0 rises.
   */
  _blob(x, y, z, vx, vy, vz, life, size, sizeEnd, heat, heatEnd, drag = 0, gravity = 0, kind = 0) {
    const f = this.fire;
    if (!f) return;
    const b = this._b;
    b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz;
    b.life = life; b.size = size; b.sizeEnd = sizeEnd; b.heat = heat; b.heatEnd = heatEnd;
    b.drag = drag; b.gravity = gravity; b.kind = kind;
    f.spawn(b);
  }

  /**
   * A wave along the ground from r0 to r1 in about T s (the old call: a blast's edge). Now a shock
   * front in the look in use (_shock), its strength read from the old numbers; kind 3 (steel, an
   * air ring) is a crisp ragged ripple (_ripple).
   */
  _wave(x, z, r0, r1, T, n, y, size, sizeEnd, heat, kind = 0) {
    if (!Number.isFinite(x + z + r0 + r1 + T)) return;
    if (kind === 3) {
      this._ripple(x, z, Math.max(0.8, y), r0, r1, T, Math.min(0.9, heat), Math.max(0.6, size), 0.32, 1.5);
      return;
    }
    const k = Math.max(0.3, Math.min(1.6, (heat * sizeEnd) / 1.25));
    this._shock(x, z, r0, r1, Math.max(0.25, T * 1.5), k);
  }

  /** Distance a blob with drag D covers in t s per unit of launch speed (the field: v *= e^-D dt, then x += v dt). */
  _reach(D, t) {
    const q = Math.exp(-D * SHOCK_DT), N = Math.max(1, t / SHOCK_DT);
    return Math.abs(D) > 1e-4 ? (SHOCK_DT * q * (1 - Math.pow(q, N))) / (1 - q) : t;
  }

  /**
   * A shock front rolls out from r0 to r1 (the blast's edge: where it stops hurting) in about T s,
   * fast at first and slowing (drag), in the look in use (SHOCK[ringLook()]): a ragged front of uneven
   * strength with gaps, rows behind it, dust and grit torn off the ground behind it, the ground
   * glowing then charring where it passed, rocks thrown, a light, a last thin ripple. k: strength
   * (1 = a meteor's strike, 2 = the nova); fk: how much of it is fire (0.2 = a landing: dust, a
   * little heat); delay: s before it leaves (a second wave behind the first).
   */
  _shock(x, z, r0, r1, T, k = 1, fk = 1, delay = 0, look = RING_LOOK) {
    if (!(r1 > r0) || !(T > 0) || !Number.isFinite(x + z + r0 + r1 + T + k)) return;
    let w = null;
    for (const s of this._shocks) if (!s.alive) {
      w = s;
      break;
    }
    if (!w) {
      // all busy: the oldest one stops following its front (its blobs fly on)
      w = this._shocks[0];
      for (const s of this._shocks) if (s.t - s.delay > w.t - w.delay) w = s;
    }
    const L = SHOCK[look] ?? SHOCK.a;
    w.alive = true;
    w.spawned = false;
    w.x = x;
    w.z = z;
    w.r0 = r0;
    w.r1 = r1;
    w.T = T;
    w.D = L.drag / T;
    w.v0 = (r1 - r0) / this._reach(w.D, T);
    w.t = 0;
    w.delay = Math.max(0, delay);
    w.k = k;
    w.fk = fk;
    w.look = look;
    w.dust = w.rock = w.scorchT = 0;
    w.echo = k >= 0.9 ? 0 : 99; // (weak fronts send no echo)
    w.p1 = Math.random() * 6.283;
    w.p2 = Math.random() * 6.283;
    w.p3 = Math.random() * 6.283;
    w.p4 = Math.random() * 6.283;
    if (w.delay <= 0) this._shockSpawn(w);
  }

  /** A front leaves: its rows of blobs, aimed so that the strongest lobes end on r1, and a flash of light. */
  _shockSpawn(w) {
    w.spawned = true;
    const L = SHOCK[w.look] ?? SHOCK.a, F = L.front;
    const k = w.k, fk = w.fk, sz = Math.min(1.6, 0.55 + 0.45 * k);
    const lobe = 1 + L.lobe[0] + L.lobe[1];
    const gap = F.gap * sz;
    const n = Math.max(10, Math.min(Math.round(200 + 40 * k), Math.round((6.283 * w.r1) / gap)));
    const fire = F.kind !== 1;
    for (let i = 0; i < n; i++) {
      const a = ((i + rand(-0.38, 0.38)) / n) * 6.283;
      const lob = (1 + L.lobe[0] * Math.sin(3 * a + w.p1) + L.lobe[1] * Math.sin(5 * a + w.p2) + rand(-0.025, 0.025)) / lobe;
      const st = 0.64 + 0.28 * Math.sin(2 * a + w.p3) + 0.2 * Math.sin(7 * a + w.p4) + rand(-0.14, 0.14);
      if (st < L.gapBelow) continue; // a gap in the front: it is torn, not drawn with a compass
      const ca = Math.cos(a), sa = Math.sin(a), v = w.v0 * lob;
      const x = w.x + ca * w.r0, z = w.z + sa * w.r0;
      // the front: fire (a), crisp steel strokes (b) or dust lit from inside (c)
      const h = F.heat * st * (fire ? fk : Math.min(1.3, 0.7 + 0.3 * k));
      if (h > 0.03) {
        // (crisp steel is born cooler where the ring is still small and its blobs crowd)
        const h0 = F.kind === 3 ? h * Math.max(0.3, Math.min(1, (1.4 * w.r0) / w.r1)) : h;
        this._blob(
          x, rand(F.y0, F.y1), z, ca * v, 0, sa * v, w.T * rand(0.95, 1.1),
          F.size * sz * rand(0.8, 1.15), F.sizeEnd * sz * rand(0.75, 1.2), h0, h * (F.kind === 3 ? 0.6 : 0.5), w.D, F.gravity, F.kind,
        );
      }
      // the rows behind it: slower, taller, cooler; the last of them smoke (dust) that hangs
      for (let j = 0; j < L.rows.length; j++) {
        const R = L.rows[j];
        if (Math.random() > R[1]) continue;
        const smoke = R[3] === 1;
        const hh = (smoke ? 0.55 * Math.min(1.4, 0.6 + 0.4 * k) : 0.5 * fk) * R[2] * st;
        if (!(hh > 0.03)) continue;
        this._blob(
          x, rand(0.85, 1.4 + 0.4 * j), z, ca * v * R[0], 0, sa * v * R[0], w.T * (smoke ? rand(1.6, 2.3) : rand(1.0, 1.25)),
          (smoke ? 1.2 : 1.0) * sz * rand(0.8, 1.2), (smoke ? 3.4 : 2.4) * sz * rand(0.8, 1.2), hh, smoke ? 0 : hh * 0.3,
          w.D * (smoke ? 1.1 : 1), smoke ? 1.4 : 2.4, smoke ? 1 : 0,
        );
      }
    }
    if (fk > 0.3 && w.look === 'c') {
      // the heave carries no fire out: it burns only where it started, a low bed that dies down
      const m = Math.round(8 + 6 * k);
      for (let i = 0; i < m; i++) {
        const a = Math.random() * 6.283, rr = Math.max(0.6, w.r0 * 1.4) * Math.sqrt(Math.random());
        this._blob(w.x + Math.cos(a) * rr, rand(0.8, 1.0), w.z + Math.sin(a) * rr, 0, rand(1, 2.5), 0, rand(0.5, 0.9), rand(1.0, 1.5), rand(0.6, 0.9), 0.3 * fk, 0.05, 0.8, 2);
      }
    } else if (fk > 0.3 && w.look !== 'b') {
      // the heart: a blink of heat where it went off, torn apart at once
      const m = Math.round(4 + 4 * k);
      for (let i = 0; i < m; i++) {
        const a = Math.random() * 6.283, sp = rand(2, 6) * sz;
        this._blob(w.x + rand(-0.4, 0.4), rand(0.9, 1.4), w.z + rand(-0.4, 0.4), Math.cos(a) * sp, rand(1, 4), Math.sin(a) * sp, rand(0.18, 0.3), rand(0.8, 1.2) * sz, rand(1.6, 2.4) * sz, 0.32 * fk, 0, 3, 2);
      }
    }
    if (fk > 0.05) this._light({
      x: w.x, y: 1.6, z: w.z, color: w.look === 'b' ? [1, 0.82, 0.62] : [1, 0.58, 0.25],
      intensity: (1.2 + 2.4 * Math.min(2, k)) * (0.35 + 0.65 * fk), radius: w.r1 * 1.15 + 4, life: w.T * 0.8, fade: w.T * 0.6, flicker: 0.3,
    });
  }

  /** Follow every front: dust and grit kicked up behind it, rocks, scorch where it passed, the echoes. */
  _updateShocks(dt) {
    if (!(dt > 0)) return;
    const sc = this.game.world?.scorch;
    for (const w of this._shocks) {
      if (!w.alive) continue;
      w.t += dt;
      if (!w.spawned) {
        if (w.t >= w.delay) this._shockSpawn(w);
        continue;
      }
      const L = SHOCK[w.look] ?? SHOCK.a;
      const t = w.t - w.delay;
      const ec = L.echo;
      if (t > w.T * 1.05 && w.echo >= ec.length) {
        w.alive = false;
        continue;
      }
      // the echoes: thin crisp ripples sent after the front
      while (w.echo < ec.length && t >= ec[w.echo][0] * w.T) {
        this._ripple(w.x, w.z, 0.8, w.r0, w.r1 * 1.08, w.T * 0.95, ec[w.echo][1] * Math.min(1.3, 0.6 + 0.4 * w.k), 0.7, 0.3, L.drag, ec[w.echo][2]);
        w.echo++;
      }
      if (t > w.T) continue;
      const rc = w.r0 + w.v0 * this._reach(w.D, t);
      const share = Math.exp(-w.D * t); // the front's speed / its launch speed
      const vf = Math.min(22, w.v0 * share);
      const circ = 6.283 * rc, k = Math.min(2, w.k);
      // dust and grit torn off the ground just behind the front: one letter each, thrown out and up
      w.dust += dt * L.dust * circ * (0.25 + 0.75 * share) * k;
      let m = Math.min(12, Math.floor(w.dust));
      w.dust -= m;
      const warm = w.fk > 0.5 && w.look !== 'b';
      while (m-- > 0) {
        const a = Math.random() * 6.283, rr = rc * rand(0.9, 1.01), ca = Math.cos(a), sa = Math.sin(a);
        const o = this._rec(w.x + ca * rr, rand(0.15, 0.6), w.z + sa * rr, rand(0.45, 1.1), rand(0.3, 0.46), rand(0.4, 0.55), GRIT);
        const sp = vf * rand(0.2, 0.6);
        o.vx = ca * sp;
        o.vy = rand(0.8, 3.2) * (0.6 + 0.4 * k);
        o.vz = sa * sp;
        o.drag = 2.2;
        o.gravity = -5;
        o.alpha = rand(0.55, 0.85);
        o.spin = rand(-3, 3);
        this._col(warm && Math.random() < 0.5 ? DUST_WARM : DUST_COL, rand(0.8, 1.4) * (L.heave ? 1.6 : 1), DUST_COL, 0.7);
        this._spawn(this.alpha, o);
        if (warm && m % 3 === 0) {
          // a spark off the burning front
          const e = this._rec(w.x + ca * rr, rand(0.4, 1.2), w.z + sa * rr, rand(0.35, 0.7), rand(0.22, 0.32), 0.05, EMBER_STAR);
          e.vx = ca * vf * rand(0.4, 0.8);
          e.vy = rand(2, 6);
          e.vz = sa * vf * rand(0.4, 0.8);
          e.drag = 1.4;
          e.gravity = -10;
          e.flicker = 0.4;
          this._col(HOT, 0.9, DARK, 1);
          this._spawn(this.add, e);
        }
      }
      // rocks and clods flung up in arcs where the front tears the ground
      w.rock += dt * L.rocks * circ * share * k;
      m = Math.min(L.heave ? 16 : 6, Math.floor(w.rock));
      w.rock -= m;
      while (m-- > 0) {
        const a = Math.random() * 6.283, ca = Math.cos(a), sa = Math.sin(a);
        const low = L.heave && m % 2 === 0; // the ground heaving: clods popped up just ahead of the front
        const o = this._rec(w.x + ca * rc, 0.4, w.z + sa * rc, rand(0.6, 1.1), rand(0.32, 0.46), 0.26, ROCK);
        const sp = low ? vf * rand(0.6, 0.9) : vf * rand(0.3, 0.7) + rand(1, 3);
        o.vx = ca * sp;
        o.vy = low ? rand(2, 4.5) : rand(4, 10);
        o.vz = sa * sp;
        o.gravity = -22;
        o.drag = 0.4;
        o.alpha = 0.95;
        o.alphaEnd = 0.6;
        o.spin = rand(-6, 6);
        this._col(ROCK_COL, L.heave ? rand(1.8, 2.8) : rand(0.9, 1.4), ROCK_COL, L.heave ? 1.4 : 0.7);
        this._spawn(this.alpha, o);
      }
      // the ground where it passed: glowing, then charred (the scorch map cools it by itself)
      w.scorchT -= dt;
      if (w.scorchT <= 0 && share > 0.06 && sc) {
        w.scorchT = 0.06;
        const sr = 0.8 + 0.4 * Math.min(1.5, w.k);
        const pts = Math.min(10, Math.ceil(circ / 5));
        for (let i = 0; i < pts; i++) {
          const a = Math.random() * 6.283, rr = rc * rand(0.85, 1.0);
          sc.burnCircle?.(w.x + Math.cos(a) * rr, w.z + Math.sin(a) * rr, sr, L.scorch[0] * w.fk, L.scorch[1] * (0.3 + 0.7 * w.fk));
        }
      }
    }
  }

  /**
   * A thin crisp ripple (the field's steel: it prints as the stroke that runs along it) from r0 to r1
   * in T s, slowing (drag x 1/T), of uneven strength with gaps; r1 < r0 draws it in (a charge).
   */
  _ripple(x, z, y, r0, r1, T, heat, size, spacing = 0.3, drag = 1.5, gapBelow = 0.25) {
    if (!(T > 0) || !Number.isFinite(x + z + y + r0 + r1 + T + heat)) return;
    const D = drag / T, v0 = (r1 - r0) / this._reach(D, T);
    const n = Math.max(12, Math.min(280, Math.round((6.283 * Math.max(r0, r1)) / (spacing * Math.max(0.6, size)))));
    const p1 = Math.random() * 6.283, p2 = Math.random() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = ((i + rand(-0.3, 0.3)) / n) * 6.283;
      const st = 0.62 + 0.3 * Math.sin(3 * a + p1) + 0.22 * Math.sin(8 * a + p2) + rand(-0.1, 0.1);
      if (st < gapBelow) continue;
      const ca = Math.cos(a), sa = Math.sin(a), lob = 1 + 0.02 * Math.sin(4 * a + p2);
      // (born where the ring is small and its blobs crowd: cooler, so it does not start as a white loop)
      const h = heat * st, h0 = h * Math.max(0.3, Math.min(1, (1.4 * Math.min(r0, r1)) / Math.max(r0, r1)));
      this._blob(x + ca * r0, y, z + sa * r0, ca * v0 * lob, 0, sa * v0 * lob, T * rand(0.9, 1.05), size, size * 1.25, r1 > r0 ? h0 : h, r1 > r0 ? h * 0.6 : h0, D, 0, 3);
    }
  }

  /**
   * A blast of radius r as one body of fire (a fireball's burst, a meteor's strike): blobs born on
   * top of each other at the centre (the white heart, for a blink) fly apart into a ball of flame
   * that swells to the blast's edge, a wave of fire runs along the ground out to r, the middle rolls
   * up, and smoke is left where it burned. k scales the amount (1 = a fireball).
   */
  _fireBlast(x, z, r, k = 1) {
    const q = Math.sqrt(r / 3);
    // (drag 2.6 over these lives carries a blob 0.3 x its speed: each one is aimed at its own spot
    // of the disc, so the ball fills the blast and stops at its edge)
    let n = Math.round(26 * k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = (r * 0.82 * Math.sqrt(Math.random())) / 0.3;
      this._blob(
        x + rand(-0.4, 0.4) * q, rand(0.8, 1.4), z + rand(-0.4, 0.4) * q, Math.cos(a) * sp, rand(0.5, 3.5) * q, Math.sin(a) * sp,
        rand(0.45, 0.8), rand(0.9, 1.3) * q, rand(1.9, 2.7) * q, 0.42, 0, 2.6, 2,
      );
    }
    // its edge: a shock front of fire rolling out to r (a meteor's: k about 1.3)
    this._shock(x, z, r * 0.2, r * 0.95, 0.3 + 0.03 * r, Math.max(0.35, Math.min(1.6, 0.4 * k * q * q)), 1);
    // the roll: the hot middle climbs and curls over
    n = Math.round(9 * k);
    for (let i = 0; i < n; i++) {
      this._blob(
        x + rand(-0.5, 0.5) * q, rand(0.9, 1.8), z + rand(-0.5, 0.5) * q, rand(-1.2, 1.2), rand(5, 10) * q, rand(-1.2, 1.2),
        rand(0.6, 1.05), rand(1.0, 1.4) * q, rand(2.0, 2.8) * q, 0.45, 0, 1.6, 3,
      );
    }
    n = Math.round(7 * k);
    for (let i = 0; i < n; i++) {
      this._blob(
        x + rand(-1, 1) * q, rand(1.2, 2.6), z + rand(-1, 1) * q, rand(-0.8, 0.8), rand(1.6, 3.4), rand(-0.8, 0.8),
        rand(1.2, 1.9), 1.5 * q, 3.6 * q, 0.5, 0, 0.8, 0, 1,
      );
    }
    // sparks and burning scraps flung high: they fall back
    n = Math.round(22 * k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = rand(2, 9) * q;
      const o = this._rec(x, 0.6, z, rand(0.7, 1.4), rand(0.2, 0.32), 0.06, EMBER_STAR);
      o.vx = Math.cos(a) * sp;
      o.vy = rand(4, 12) * q;
      o.vz = Math.sin(a) * sp;
      o.drag = 0.7;
      o.gravity = -15;
      o.flicker = 0.45;
      this._col(HOT, 1, DARK, 1.2);
      this._spawn(this.add, o);
    }
  }

  _spawn(pool, o) {
    if (!pool) return;
    if (!(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z))) return;
    pool.spawn(o);
  }

  _light(opts) {
    const l = this.game.lights?.add?.(opts);
    if (l) this.lights.add(l);
    return l || null;
  }

  _pruneLights() {
    for (const l of this.lights) if (l.dead) this.lights.delete(l);
  }

  /**
   * Sprites glued to a moving point (eye glints, fireball cores, the landing ring) are re-spawned
   * with a ~1.5-frame life only when the previous copy expires this frame, so exactly one copy is
   * visible at any frame rate. (A fixed minimum life stacked 3x at 60 fps, 7x at 144 fps and ~15x
   * during hit-stop, all additive.) Returns the life to spawn with, or 0 = keep the current copy.
   */
  _hold(obj, key, dt) {
    obj[key] -= dt;
    if (obj[key] > 0) return 0;
    const life = Math.max(0.011, dt * 1.5); // the pool floors life at 0.01
    obj[key] = life - dt;
    return life;
  }

  reset() {
    this.tells.reset();
    this.breathing = false;
    this.breathLights.length = 0;
    for (const l of this.lights) {
      l.life = 0;
      l.intensity = 0;
    }
    this.lights.clear();
    for (const p of this.projectiles) {
      p.alive = false;
      p.light = null;
      p.volley = null;
    }
    this.breathAcc = this.smokeAcc = this.emberAcc = this._bodyAcc = 0;
    this.scorchTimer = 0;
    this._held.glint = this._held.warn = this._held.stars = this._held.flare = 0;
    this._coreAcc = this._tongueAcc = this._sparkAcc = 0;
    this._claw[0].t = this._claw[1].t = -9;
    this._zoneHeat.hold = this._zoneHeat.acc4 = this._zoneHeat.heatT = 0;
    this._zoneHeat.lastT = -9;
    this.skyLights.length = 0;
    for (const b of this.bolts) b.alive = false;
    for (const w of this._shocks) w.alive = false;
    this._brT = 0;
    this._brAcc.fill(0);
    this.skyAcc = this._novaAcc = this._novaRing = this._gatherAcc = this._lickAcc = 0;
    this.d.hazards?.clear(); // (their lights were just killed with the rest)
    this.d.bullets?.clear();
  }

  // ---------------------------------------------------------------- fire breath
  breathBegin() {
    if (this.breathing) return;
    this.breathing = true;
    this.breathLights.length = 0;
    for (let i = 0; i < 3; i++) {
      const l = this._light({ x: 0, y: 1.2, z: 0, color: [1, 0.5, 0.16], intensity: 4.2 - i * 0.5, radius: (10 + i) * S, fadeIn: 0.15, fade: 0.35, flicker: 0.5 });
      if (l) this.breathLights.push(l);
    }
  }

  breathEnd() {
    if (!this.breathing) return;
    this.breathing = false;
    for (const l of this.breathLights) l.kill();
    this.breathLights.length = 0;
  }

  /**
   * Emit one frame of the stream from `mouth` along `aimYaw`, pitched down by `pitch`, in the look in
   * use (?breath=a|b|c). Whatever the look, the fire fills the hit cone (+-halfAngle out to range):
   * white-hot at the jaws, cooling to orange and red at the rim and the far end, blobs that slow, curl
   * and climb, smoke off the top and the end, a splash of flame where it meets the ground, the ground
   * left glowing. Each blob is placed along this frame's path (born part-way through it): no beads.
   */
  breathEmit(dt, mouth, aimYaw, pitch = 0.17) {
    if (!mouth || !(dt > 0) || !Number.isFinite(mouth.x + mouth.y + mouth.z + aimYaw + pitch)) return;
    const T = TUNING.attacks.breath;
    const R = T.range, HA = T.halfAngle;
    this.breathBody(dt, mouth, aimYaw, pitch, R, HA, 1);
    this._breathCommon(dt, mouth, aimYaw, pitch, Math.cos(aimYaw), Math.sin(aimYaw), R, HA);
  }

  /**
   * The body of a breath, for every fire the wyrm breathes (the breath, the fire snap of its strings,
   * the strafe of its flights): the same fire in the look in use (?breath=a|b|c), shaped to reach `R` m
   * within +-`HA` rad of `aimYaw`, pitched down by `pitch`, at `k` x the full breath's rate (k 1 is
   * about 650 blobs / s; the lights, smoke, sparks and scorch are the caller's: breathEmit adds the
   * breath's own).
   */
  breathBody(dt, mouth, aimYaw, pitch, R, HA, k = 1) {
    if (!mouth || !(dt > 0) || !(R > 0) || !(k > 0) || !Number.isFinite(mouth.x + mouth.y + mouth.z + aimYaw + pitch + R + HA)) return;
    this._brT += dt;
    const look = BREATH_LOOK;
    if (look === 'c') {
      this._breathLiquid(dt, mouth, aimYaw, pitch, R, HA, k);
      return;
    }
    // the rod: small hot blobs close to the jaws (where they pile up: the white heart). A shorter fire
    // packs them into less room: fewer of them, or the heart is a white ball at the jaws
    const kr = k * Math.min(1, R / TUNING.attacks.breath.range);
    this._brStreams(dt, 0, (look === 'b' ? 140 : 240) * kr, mouth, aimYaw, pitch, 0, Math.min(0.04, HA), R * 0.2, R * 0.34, 0.3, 0.4, 2.6, 0.3, 0.75, 0.24, 0.08, 1);
    if (look === 'b') {
      // lashing tongues: five streams that whip across the cone, each drawing a curved lick
      for (let i = 0; i < 5; i++) {
        const t = this._brT, f = 1.3 + 0.45 * i;
        let off = HA * 0.95 * Math.sin(t * f + i * 1.9);
        off = Math.max(-HA, Math.min(HA, off));
        const len = 0.78 + 0.22 * hash01(i, 3.7);
        this._brStreams(dt, 6 + i, 46 * k, mouth, aimYaw + off, pitch, 0, 0.025, R * 0.8 * len, R * len, 0.55, 0.7, 1.4, 0.3, 0.95, 0.62, 0.22, 2);
      }
    } else {
      // the torrent: the body fills the cone (most of it near the axis), it slows and swells
      this._brStreams(dt, 1, TUNING.attacks.breath.particlesPerSec * 1.5 * k, mouth, aimYaw, pitch, 0, HA * 0.95, R * 0.5, R * 1.02, 0.6, 0.85, 1.6, 0.5, 3.0, 0.15, 0.19, 2.5, true);
      // licks along the edges: slower, cooler, they curl up off the rim of the cone
      this._brStreams(dt, 3, 90 * k, mouth, aimYaw, pitch, HA * 0.72, HA, R * 0.55, R * 0.95, 0.5, 0.7, 2.0, 0.45, 1.8, 0.3, 0.08, 6);
      // billows: at the far end the fire has slowed; it rolls up and over in big cool balls
      this._brAcc[4] += dt * 26 * k;
      let n = Math.min(4, Math.floor(this._brAcc[4]));
      this._brAcc[4] -= n;
      while (n-- > 0) {
        const off = rand(-HA, HA) * 0.85, dd = R * rand(0.72, 1.0), y = aimYaw + off;
        const gy = Math.max(1.0, mouth.y - Math.sin(pitch) * dd) + rand(0, 0.8);
        this._blob(
          mouth.x + Math.sin(y) * dd, gy, mouth.z + Math.cos(y) * dd, Math.sin(y) * rand(1, 4), rand(1.5, 4), Math.cos(y) * rand(1, 4),
          rand(0.6, 1.0), rand(1.4, 2.0), rand(3.0, 4.2), rand(0.14, 0.2), 0, 1, 3,
        );
      }
    }
  }

  /**
   * Streams of blobs from the jaws (`slot`: its accumulator, `rate` per s): yaw off the aim within
   * [aMin, aMax] either side (`bell`: most near the axis), each flying dMin..dMax in its life (drag
   * aimed so it slows to a stop there), size 0.5..1 x S at the jaws -> sizeEnd x S, heat -> heatEnd,
   * gravity > 0 climbs.
   */
  _brStreams(dt, slot, rate, mouth, aim, pitch, aMin, aMax, dMin, dMax, lMin, lMax, drag, size, sizeEnd, heat, heatEnd, gravity, bell = false) {
    this._brAcc[slot] += dt * rate;
    let n = Math.min(14, Math.floor(this._brAcc[slot]));
    this._brAcc[slot] -= n;
    while (n-- > 0) {
      let off = bell ? (Math.random() + Math.random() - 1) * aMax : rand(aMin, aMax) * (Math.random() < 0.5 ? -1 : 1);
      if (off > aMax) off = aMax - Math.random() * 0.1;
      if (off < -aMax) off = -aMax + Math.random() * 0.1;
      const y = aim + off, pj = pitch + rand(-0.04, 0.05);
      const life = rand(lMin, lMax), dist = rand(dMin, dMax);
      const sp = (dist * drag) / (1 - Math.exp(-drag * life));
      const cp = Math.cos(pj);
      const vx = Math.sin(y) * cp * sp, vy = -Math.sin(pj) * sp, vz = Math.cos(y) * cp * sp;
      const back = Math.random() * dt; // born part-way through this frame: spread along its path
      this._blob(
        mouth.x + vx * back + rand(-0.08, 0.08), mouth.y + vy * back + rand(-0.08, 0.08), mouth.z + vz * back + rand(-0.08, 0.08),
        vx, vy, vz, life, size * S * rand(0.8, 1.2), sizeEnd * S * rand(0.75, 1.2), heat * rand(0.8, 1.15), heatEnd, drag, gravity,
      );
    }
  }

  /** Liquid fire (breath look c): an arc that rains down onto the ground and spreads there as a carpet of flame. */
  _breathLiquid(dt, mouth, aim, pitch, R, HA, k = 1) {
    // three jets (left, middle, right of the cone) of hot drops that arc down and rain onto the ground
    this._brAcc[1] += dt * 165 * k;
    let n = Math.min(12, Math.floor(this._brAcc[1]));
    this._brAcc[1] -= n;
    const g = 16, t = this._brT;
    while (n-- > 0) {
      const jet = (n % 3) - 1;
      const sway = 0.12 * Math.sin(t * 2.3 + jet * 2.1);
      const y = aim + Math.max(-HA, Math.min(HA, jet * HA * 0.62 + sway + rand(-0.04, 0.04)));
      const dl = R * rand(0.5, 0.95), tf = rand(0.8, 0.95);
      const vh = dl / tf, vy = (1.0 - mouth.y + 0.5 * g * tf * tf) / tf;
      const vx = Math.sin(y) * vh, vz = Math.cos(y) * vh, back = Math.random() * dt;
      this._blob(mouth.x + vx * back, mouth.y + vy * back, mouth.z + vz * back, vx, vy, vz, tf, rand(0.22, 0.3) * S, rand(0.3, 0.42) * S, rand(0.6, 0.75), 0.5, 0, -g);
    }
    // the rod at the jaws before it splits into the jets
    this._brStreams(dt, 0, 50 * k, mouth, aim, pitch - 0.1, 0, 0.05, R * 0.15, R * 0.25, 0.2, 0.28, 2.0, 0.32, 0.7, 0.5, 0.15, -4);
    // the pool: where the jets land the fire lies low and flat and spreads, fed as long as it rains
    this._brAcc[2] += dt * 170 * k;
    n = Math.min(10, Math.floor(this._brAcc[2]));
    this._brAcc[2] -= n;
    while (n-- > 0) {
      const off = rand(-HA, HA) * 0.9, y = aim + off, dd = R * rand(0.45, 1.0);
      const sp = rand(0.5, 2.5);
      this._blob(
        mouth.x + Math.sin(y) * dd, rand(0.75, 0.9), mouth.z + Math.cos(y) * dd, Math.sin(y) * sp + rand(-1.2, 1.2), rand(0.4, 1.2), Math.cos(y) * sp + rand(-1.2, 1.2),
        rand(1.1, 1.9), rand(1.8, 2.4), rand(2.8, 3.6), rand(0.24, 0.3), 0.12, 1.4, 0.2,
      );
    }
    // drops splashing where the jets land: sparks thrown up off the pool
    this._brAcc[11] += dt * 40 * k;
    n = Math.min(4, Math.floor(this._brAcc[11]));
    this._brAcc[11] -= n;
    while (n-- > 0) {
      const jet = (n % 3) - 1, y = aim + jet * HA * 0.62 + rand(-0.08, 0.08), dd = R * rand(0.5, 0.95);
      const o = this._rec(mouth.x + Math.sin(y) * dd, 0.5, mouth.z + Math.cos(y) * dd, rand(0.4, 0.8), rand(0.26, 0.4), 0.06, LAVA_DROPS);
      o.vx = rand(-2.5, 2.5);
      o.vy = rand(3, 7);
      o.vz = rand(-2.5, 2.5);
      o.gravity = -18;
      this._col(LAVA_HOT, 1, LAVA_END, 1);
      this._spawn(this.add, o);
    }
  }

  /** What every breath look shares: sparks, the maw, smoke, the splash on the ground, lights, scorch. */
  _breathCommon(dt, mouth, aimYaw, pitch, ca, sa, R, HA) {
    const add = this.add;
    // sparks torn off the stream: they arc out sideways and fall
    this._sparkAcc += dt * 55;
    let n = Math.min(5, Math.floor(this._sparkAcc));
    this._sparkAcc -= n;
    while (n-- > 0) {
      const dd = rand(1.5, 11) * S, sd = Math.random() < 0.5 ? -1 : 1, lat = rand(2, 7) * sd;
      const o = this._rec(mouth.x + sa * dd, Math.max(0.3, mouth.y - Math.sin(pitch) * dd) + rand(-0.3, 0.3), mouth.z + ca * dd, rand(0.5, 1.0), rand(0.3, 0.46), 0.08, EMBER_STAR);
      o.vx = sa * rand(6, 14) + ca * lat;
      o.vy = rand(1.5, 6.5);
      o.vz = ca * rand(6, 14) - sa * lat;
      o.drag = 1.6;
      o.gravity = -9;
      o.flicker = 0.4;
      this._col(HOT, 1, DARK, 1);
      this._spawn(add, o);
    }
    // the maw: a few small hot blobs that jitter (held: one copy a frame), never one white disc
    const flare = this._hold(this._held, 'flare', dt);
    if (flare > 0) {
      for (let i = 0; i < 3; i++) {
        const f = (0.25 + 0.2 * i) * S;
        this._blob(mouth.x + sa * f + rand(-0.15, 0.15) * S, mouth.y + rand(-0.1, 0.1) * S, mouth.z + ca * f + rand(-0.15, 0.15) * S, 0, 0, 0, flare, rand(0.7, 1.0) * S, 0.9 * S, 0.26, 0.26);
      }
    }
    // smoke: curling up off the jaws, rolling off the top of the stream and its far end
    this.smokeAcc += dt * 26;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const u = Math.random();
      if (u < 0.2) {
        this._blob(mouth.x + rand(-0.3, 0.3), mouth.y + 0.4 * S, mouth.z + rand(-0.3, 0.3), sa * 1.5, rand(1.5, 2.5), ca * 1.5, rand(0.7, 1.0), 0.6 * S, 1.6 * S, 0.45, 0, 1, 1, 1);
        continue;
      }
      const off = rand(-HA, HA) * 0.8, y = aimYaw + off, dd = R * (u < 0.6 ? rand(0.4, 0.8) : rand(0.85, 1.1));
      this._blob(
        mouth.x + Math.sin(y) * dd + rand(-1, 1), Math.max(1.5, mouth.y - Math.sin(pitch) * dd) + rand(1.2, 2.8), mouth.z + Math.cos(y) * dd + rand(-1, 1),
        Math.sin(y) * 2 + rand(-0.6, 0.6), rand(1.2, 2.6), Math.cos(y) * 2 + rand(-0.6, 0.6),
        rand(1.0, 1.6), 1.4 * S, 3.4 * S, 0.5, 0, 0.8, 1.5, 1,
      );
    }
    // the splash where the stream meets the ground: flames thrown out sideways and forward
    if (BREATH_LOOK !== 'c') {
      this._brAcc[5] += dt * 28;
      n = Math.min(4, Math.floor(this._brAcc[5]));
      this._brAcc[5] -= n;
      while (n-- > 0) {
        const off = rand(-HA, HA) * 0.9, y = aimYaw + off, dd = R * rand(0.62, 1.0);
        const lat = rand(-5, 5), fw = rand(2, 5);
        this._blob(
          mouth.x + Math.sin(y) * dd, rand(0.8, 1.1), mouth.z + Math.cos(y) * dd,
          Math.sin(y) * fw + Math.cos(y) * lat, rand(1.5, 3.5), Math.cos(y) * fw - Math.sin(y) * lat,
          rand(0.4, 0.7), rand(1.0, 1.4), rand(1.8, 2.4), rand(0.2, 0.28), 0, 1.5, 2,
        );
      }
    }
    // lights along the stream
    for (let i = 0; i < this.breathLights.length; i++) {
      const dd = (3 + i * 4) * S;
      this.breathLights[i].set(mouth.x + sa * dd, 1.2, mouth.z + ca * dd);
    }
    // scorch: the ground under the cone glows, then chars; what the breath lands on catches
    this.scorchTimer -= dt;
    if (this.scorchTimer <= 0) {
      this.scorchTimer = 0.08;
      const scorch = this.game.world?.scorch;
      for (const [d0, r0] of SCORCH_STEPS) {
        const dd = d0 * S, r = r0 * S;
        const x = mouth.x + sa * dd + rand(-0.4, 0.4), z = mouth.z + ca * dd + rand(-0.4, 0.4);
        scorch?.burnCircle?.(x, z, r, 0.05, 0.9);
        this.game.world?.ignite?.(x, z, r, TUNING.world.ignite.breath); // what the breath lands on catches
        this.game.world?.fire?.hush?.(x, z, r * 1.6, 0.3); // (and its flames burn low while the breath is on them)
      }
    }
  }

  /** Embers leaking from the mouth / nostrils while the throat charges. */
  mouthEmbers(dt, mouth, rate, fwd, up = 0) {
    this.emberAcc += dt * rate;
    const fx = fwd?.x ?? 0, fz = fwd?.z ?? 0;
    while (this.emberAcc >= 1) {
      this.emberAcc -= 1;
      // fire licking out between the teeth: small cool blobs. A slow leak shows as red tongues; as
      // the rate climbs they pile up into an orange glow in the throat
      if (Math.random() < 0.4) {
        this._blob(
          mouth.x + rand(-0.12, 0.12) * S, mouth.y + rand(-0.08, 0.08) * S, mouth.z + rand(-0.12, 0.12) * S,
          fx * 1.2 * S + rand(-0.4, 0.4), rand(0.3, 1.2) + up * rand(0.5, 1), fz * 1.2 * S + rand(-0.4, 0.4),
          rand(0.25, 0.42), rand(0.4, 0.62) * S, 0.2 * S, 0.3, 0, 1.5, 2,
        );
      }
      const o = this._rec(mouth.x + rand(-0.15, 0.15) * S, mouth.y + rand(-0.1, 0.1) * S, mouth.z + rand(-0.15, 0.15) * S, rand(0.4, 0.8), rand(0.12, 0.18) * S, 0.05 * S, EMBER);
      o.vx = fx * 1.5 * S + rand(-0.6, 0.6);
      o.vy = rand(0.4, 1.6) + up * rand(0.6, 1.2);
      o.vz = fz * 1.5 * S + rand(-0.6, 0.6);
      o.drag = 1.2;
      o.gravity = 1.2;
      o.flicker = 0.5;
      this._col(EMBER_COL, 1.05, DARK, 0.75);
      this._spawn(this.add, o);
    }
  }

  // ---------------------------------------------------------------- fireballs
  /**
   * `volley`: shared {hitDone} so a whole volley damages the player at most once.
   * Returns the shell's flight time (s) to the ground, 0 if no shell slot was free.
   */
  launchFireball(from, target, volley = null) {
    const T = TUNING.attacks.fireball;
    const slot = this.projectiles.find((p) => !p.alive);
    if (!slot) return 0;
    const dx = target.x - from.x, dz = target.z - from.z;
    const dist = Math.hypot(dx, dz);
    const flight = Math.min(1.3, Math.max(0.7, dist / 18));
    slot.alive = true;
    slot.volley = volley;
    slot.age = 0;
    slot.trail = 0;
    slot.smoke = 0;
    slot.hold = 0;
    slot.p.copy(from);
    slot.v.set(dx / flight, (0 - from.y + 0.5 * T.gravity * flight * flight) / flight, dz / flight);
    slot.light = this._light({ x: from.x, y: from.y, z: from.z, color: [1, 0.55, 0.2], intensity: 4.6, radius: 10, fade: 0.2, flicker: 0.35 });
    this.game.events?.emit('dragon:fireball', { x: from.x, y: from.y, z: from.z });
    // the spit: a puff of flame at the maw, a few sparks
    for (let i = 0; i < 9; i++) {
      this._blob(
        from.x, from.y, from.z, slot.v.x * 0.15 + rand(-3, 3), rand(-1, 3), slot.v.z * 0.15 + rand(-3, 3),
        rand(0.2, 0.36), rand(0.7, 1.0), rand(1.3, 1.8), 0.4, 0, 3, 1.5,
      );
    }
    for (let i = 0; i < 6; i++) {
      const o = this._rec(from.x, from.y, from.z, rand(0.3, 0.55), rand(0.2, 0.3), 0.05, EMBER_STAR);
      o.vx = slot.v.x * 0.2 + rand(-4, 4);
      o.vy = rand(-1, 4);
      o.vz = slot.v.z * 0.2 + rand(-4, 4);
      o.drag = 2;
      o.gravity = -8;
      o.flicker = 0.4;
      this._col(HOT, 1, DARK, 1);
      this._spawn(this.add, o);
    }
    return flight;
  }

  _updateProjectiles(dt) {
    const T = TUNING.attacks.fireball;
    for (const pr of this.projectiles) {
      if (!pr.alive) continue;
      pr.age += dt;
      pr.v.y -= T.gravity * dt;
      pr.p.addScaledVector(pr.v, dt);
      const p = pr.p;
      if (!Number.isFinite(p.x + p.y + p.z)) {
        pr.alive = false;
        pr.light?.kill();
        pr.light = null;
        continue;
      }
      pr.light?.set(p.x, p.y, p.z);
      // the shell: a ball of fire. Two held blobs on top of each other, a white-hot heart inside an
      // orange skin (exactly one copy a frame, see _hold); behind it the heat it sheds, a burning tail
      const life = this._hold(pr, 'hold', dt);
      if (life > 0) {
        // a knot of small blobs re-dealt every frame round the shell: a hot heart that boils, an
        // orange skin with a ragged edge (two stacked hot blobs were a featureless white disc)
        for (let i = 0; i < 7; i++) {
          const j = i < 2 ? 0.15 : 0.42;
          const ht = i < 2 ? 0.42 : rand(0.22, 0.32);
          const sz = i < 2 ? rand(0.7, 0.9) : rand(0.8, 1.2);
          this._blob(p.x + rand(-j, j), p.y + rand(-j, j), p.z + rand(-j, j), 0, 0, 0, life, sz, sz, ht, ht);
        }
      }
      pr.trail += dt * 95;
      let tn = Math.min(8, Math.floor(pr.trail));
      pr.trail -= tn;
      while (tn-- > 0) {
        const back = Math.random() * dt; // (spread along this frame's path: no beads)
        this._blob(
          p.x - pr.v.x * back + rand(-0.15, 0.15), p.y - pr.v.y * back + rand(-0.15, 0.15), p.z - pr.v.z * back + rand(-0.15, 0.15),
          pr.v.x * 0.18 + rand(-0.5, 0.5), rand(0.2, 1.4), pr.v.z * 0.18 + rand(-0.5, 0.5),
          rand(0.34, 0.6), rand(1.0, 1.3), 0.45, 0.5, 0, 1.5, 1.5,
        );
        if (tn % 3 === 0) {
          // sparks shed from the shell: they fall behind it
          const o = this._rec(p.x + rand(-0.25, 0.25), p.y + rand(-0.25, 0.25), p.z + rand(-0.25, 0.25), rand(0.45, 0.8), rand(0.2, 0.3), 0.05, EMBER_STAR);
          o.vx = pr.v.x * 0.25 + rand(-2, 2);
          o.vy = rand(-1, 2.5);
          o.vz = pr.v.z * 0.25 + rand(-2, 2);
          o.drag = 1.2;
          o.gravity = -9;
          o.flicker = 0.4;
          this._col(HOT, 1, DARK, 1);
          this._spawn(this.add, o);
        }
      }
      pr.smoke += dt * 14;
      while (pr.smoke >= 1) {
        pr.smoke -= 1;
        this._blob(p.x + rand(-0.2, 0.2), p.y + rand(-0.1, 0.3), p.z + rand(-0.2, 0.2), pr.v.x * 0.05, rand(0.3, 0.9), pr.v.z * 0.05, rand(0.8, 1.2), 0.9, 2.2, 0.4, 0, 0.8, 0, 1);
      }
      if (p.y <= 0.15 || pr.age > 3) {
        pr.alive = false;
        pr.light?.kill();
        pr.light = null;
        const volley = pr.volley;
        pr.volley = null;
        this.explode(p.x, p.z, T.radius, volley);
      }
    }
  }

  /**
   * A blast of fire lands on the world (ADR-107): the breakables in it take `power` and the floor
   * cracks (world.impact), and the grass and the wood within ig[1] of its radius catch for ig[0] of
   * a full burn (world.ignite). Numbers: TUNING.world.
   */
  _landed(x, z, r, power, ig) {
    const w = this.game.world;
    w?.impact?.(x, z, r, power, FIRE_BLOW);
    w?.ignite?.(x, z, r * ig[1], ig[0]);
  }

  explode(x, z, radius, volley = null) {
    this._light({ x, y: 1.2, z, color: [1, 0.58, 0.22], intensity: 9, radius: 14, life: 0.6, fade: 0.45, flicker: 0.3 });
    if (Number.isFinite(x + z + radius)) this._fireBlast(x, z, radius, 1);
    this.dustRing(x, z, radius * 0.6, 26, 1);
    this.game.world?.scorch?.burnCircle?.(x, z, radius, 0.55, 1);
    this._landed(x, z, radius, TUNING.world.explosion, TUNING.world.ignite.explosion);
    this.d.onExplosion?.(x, z, radius, volley);
  }

  /**
   * A raking paw's wake (call every frame of the swing with the toe position; `wi` = foreleg 0 / 1):
   * three burning claw lines of stretched '-' strokes laid along the paw's path, and embers torn off.
   */
  clawTrail(wi, toe, heavy = false) {
    const L = this._claw[wi ? 1 : 0];
    if (!toe || !Number.isFinite(toe.x + toe.y + toe.z)) return;
    const t = this.d.time ?? 0;
    const fresh = !(t - L.t >= 0 && t - L.t < 0.1);
    const dx = toe.x - L.x, dy = toe.y - L.y, dz = toe.z - L.z;
    L.t = t;
    L.x = toe.x;
    L.y = toe.y;
    L.z = toe.z;
    const len = Math.hypot(dx, dy, dz);
    if (fresh || !(len > 0.12 * S) || len > 6 * S) return; // (a slow paw leaves no wake)
    const add = this.add;
    const n = Math.min(5, Math.ceil(len / (0.32 * S)));
    const rot = this._screenRot(dx, dy, dz);
    // the three claws sit across the path: stacked for a raking sweep, side by side (across the
    // wyrm's facing) for a paw coming straight down
    const gap = (heavy ? 0.36 : 0.3) * S;
    const rake = Math.hypot(dx, dz) > 0.3 * len, f = this.d.fwd;
    const ox = rake ? 0 : (f?.z ?? 1) * gap, oy = rake ? gap : 0, oz = rake ? 0 : -(f?.x ?? 0) * gap;
    for (let i = 0; i < n; i++) {
      const u = (i + Math.random()) / n;
      for (let c = -1; c <= 1; c++) {
        const o = this._rec(
          toe.x - dx * u + ox * c, toe.y - dy * u + oy * c, toe.z - dz * u + oz * c,
          rand(0.16, 0.26), (heavy ? 0.8 : 0.62) * S, 0.1, CLAW_STREAK,
        );
        o.rot = rot;
        o.stretch = 1.8;
        this._col(c === 0 ? WHITE_HOT : HOT, c === 0 ? 0.7 : 0.9, FLAME, 0.5);
        this._spawn(add, o);
      }
    }
    const o = this._rec(toe.x, toe.y, toe.z, rand(0.3, 0.55), rand(0.2, 0.32), 0.05, EMBER_STAR);
    o.vx = (dx / len) * rand(3, 8) + rand(-1.5, 1.5);
    o.vy = rand(0.5, 3.5);
    o.vz = (dz / len) * rand(3, 8) + rand(-1.5, 1.5);
    o.drag = 1.6;
    o.gravity = -8;
    o.flicker = 0.4;
    this._col(HOT, 1, DARK, 1);
    this._spawn(add, o);
  }

  /** A smashing paw / maw meets the ground: a low wave of fire runs out from it, flames spit up, embers fly. */
  slamBurst(x, z, r) {
    if (!(r > 0) || !Number.isFinite(x + z)) return;
    this._shock(x, z, r * 0.3, r * 1.6, 0.32, 0.35, 0.7);
    // flames spat up where it hit: of every size, leaning out from the blow, not one puff a slot
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, rr = r * Math.sqrt(Math.random()), sp = rand(1, 5);
      this._blob(
        x + Math.cos(a) * rr, rand(0.75, 1.1), z + Math.sin(a) * rr, Math.cos(a) * sp, rand(2, 7), Math.sin(a) * sp,
        rand(0.25, 0.6), rand(0.6, 1.4), rand(0.2, 0.6), rand(0.25, 0.45), 0, 2.2, 1.5,
      );
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(3, 8);
      const o = this._rec(x, 0.4, z, rand(0.5, 0.9), rand(0.2, 0.3), 0.05, EMBER_STAR);
      o.vx = Math.cos(a) * sp;
      o.vy = rand(4, 9);
      o.vz = Math.sin(a) * sp;
      o.gravity = -16;
      o.drag = 0.6;
      o.flicker = 0.4;
      this._col(HOT, 1, DARK, 1.2);
      this._spawn(this.add, o);
    }
    this._light({ x, y: 0.9, z, color: [1, 0.55, 0.2], intensity: 4.5, radius: 8, life: 0.3, fade: 0.25, flicker: 0.3 });
  }

  // ---------------------------------------------------------------- shock / dust / roar
  /**
   * Dust thrown up off the ground round (x, z) out past r (a step, a landing, a blast): n grains of
   * one letter each, from anywhere inside the ring at their own speeds (no circle of them), and a
   * low cloud of dust in the field's smoke under them.
   */
  dustRing(x, z, r, n = 36, strength = 1) {
    if (!Number.isFinite(x + z + r + n + strength)) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = r * rand(0.35, 1.1), ca = Math.cos(a), sa = Math.sin(a);
      const sp = rand(1.5, 10) * strength * S * rand(0.5, 1);
      const o = this._rec(x + ca * rr, rand(0.12, 0.5), z + sa * rr, rand(0.5, 1.2), rand(0.3, 0.46), rand(0.36, 0.55), DUST);
      o.vx = ca * sp;
      o.vy = rand(0.3, 2.6) * Math.min(1.5, strength);
      o.vz = sa * sp;
      o.alpha = rand(0.5, 0.8);
      o.drag = rand(2, 3.4);
      o.gravity = -2;
      o.spin = rand(-2, 2);
      this._col(DUST_COL, rand(0.85, 1.35), DUST_COL, 0.8);
      this._spawn(this.alpha, o);
    }
    const m = Math.min(10, Math.round((n / 7) * Math.min(1.6, strength)));
    const sz = Math.max(0.9, Math.min(2.4, r * 0.55));
    for (let i = 0; i < m; i++) {
      const a = Math.random() * Math.PI * 2, rr = r * rand(0.3, 1), sp = rand(1, 4) * strength;
      this._blob(x + Math.cos(a) * rr, rand(0.8, 1.1), z + Math.sin(a) * rr, Math.cos(a) * sp, rand(0.3, 1.2), Math.sin(a) * sp, rand(0.7, 1.3), sz, sz * rand(1.8, 2.6), rand(0.32, 0.45), 0, 2, 0.8, 1);
    }
  }

  /**
   * The sound of a roar: three rings racing out from the maw, drawn in the field's crisp kind (a thin
   * line of it prints as the stroke that runs along it), so they read as air, not as fire.
   */
  roarWave(x, y, z, strength = 1) {
    if (!Number.isFinite(x + y + z + strength)) return;
    // the sound is pressure on the ground, not rings in the air: ragged crisp ripples running out
    // along the ground from under the head, one after the other, and the dust they lift (no fire)
    const s = Math.max(0.4, Math.min(1.6, strength));
    const r1 = 8 * s * S;
    this._ripple(x, z, 0.85, 1.2 * S, r1, 0.75, 0.48, 0.8, 0.3, 2.2, 0.42);
    this._ripple(x, z, 0.85, 1.0 * S, r1 * 0.82, 0.9, 0.34, 0.75, 0.32, 2.2, 0.48);
    this._shock(x, z, 1.4 * S, r1 * 0.7, 0.7, 0.45 * s, 0, 0.05, 'b');
  }

  /** Ember puff from the nostrils (sleeping breaths, snorts). */
  snort(nostrils, fwd, strength = 1) {
    const fx = fwd?.x ?? 0, fz = fwd?.z ?? 0;
    for (const p of nostrils) {
      if (!Number.isFinite(p.x + p.y + p.z)) continue;
      for (let i = 0; i < Math.round(5 * strength); i++) {
        const o = this._rec(p.x, p.y, p.z, rand(0.6, 1.2), rand(0.11, 0.16) * S, 0.04 * S, EMBER);
        o.vx = fx * 1.2 * strength * S + rand(-0.4, 0.4);
        o.vy = rand(0.3, 1.2);
        o.vz = fz * 1.2 * strength * S + rand(-0.4, 0.4);
        o.drag = 1.4;
        o.gravity = 0.8;
        o.flicker = 0.6;
        this._col(EMBER_COL, 0.8, DARK, 0.7);
        this._spawn(this.add, o);
      }
      this._blob(p.x, p.y, p.z, fx * 0.8, 0.6, fz * 0.8, 1.2, 0.5 * S, 1.3 * S, 0.34 * Math.min(1.4, strength), 0, 1, 0, 1);
    }
  }

  /** Per-frame glint over each glowing eye (offset toward the camera so it isn't depth-faded). */
  eyeGlints(dt, eyes, glow) {
    if (glow < 0.05) {
      this._held.glint = 0;
      return;
    }
    const life = this._hold(this._held, 'glint', dt);
    if (!life) return;
    const cam = this.game.camera?.position;
    for (const e of eyes) {
      let x = e.x, y = e.y, z = e.z;
      if (cam) {
        const dx = cam.x - x, dy = cam.y - y, dz = cam.z - z;
        const l = Math.hypot(dx, dy, dz) || 1;
        x += (dx / l) * 0.45 * S; y += (dy / l) * 0.45 * S; z += (dz / l) * 0.45 * S;
      }
      // a small hot-orange glint (the reference's eye glows orange with a small halo; a 0.64 m
      // yellow-white dot bloomed into a ball over the ASCII head)
      this._spawn(this.add, {
        x, y, z, life, size: 0.2 * S, sizeEnd: 0.18 * S, glyph: '•',
        color: [2.0 * glow, 0.38 * glow, 0.05 * glow], alpha: 1, alphaEnd: 1,
      });
    }
  }

  /** Embers drifting off the body (phase 2, death); `big` (phase 3, dying): it burns, licks of flame come off it too. points: array of {x,y,z,r}. */
  bodyEmbers(dt, points, rate, big = false) {
    if (!points.length) return;
    this._bodyAcc = (this._bodyAcc || 0) + dt * rate;
    let n = Math.min(80, Math.floor(this._bodyAcc));
    this._bodyAcc -= n;
    while (n-- > 0) {
      const s = points[Math.floor(Math.random() * points.length)];
      const r = s.r ?? 0.5;
      const o = this._rec(s.x + rand(-r, r), s.y + rand(-r, r) * 0.7, s.z + rand(-r, r), big ? rand(0.9, 1.8) : rand(0.6, 1.2), (big ? rand(0.14, 0.2) : rand(0.11, 0.16)) * S, 0.04 * S, big ? EMBER_STAR : EMBER);
      o.vx = rand(-0.4, 0.4);
      o.vy = big ? rand(1.5, 4) : rand(0.6, 1.8);
      o.vz = rand(-0.4, 0.4);
      o.drag = 0.6;
      o.gravity = big ? 1.5 : 0.6;
      o.flicker = 0.5;
      this._col(EMBER_COL, big ? 1.1 : 0.8, DARK, 0.7);
      this._spawn(this.add, o);
      if (big && Math.random() < 0.22) {
        // a lick of flame off the hide: cool (red tongues), born on the upper side so the body does not hide it
        this._blob(s.x + rand(-r, r), s.y + r * rand(0.5, 1), s.z + rand(-r, r), rand(-0.4, 0.4), rand(1.5, 3.5), rand(-0.4, 0.4), rand(0.4, 0.7), rand(0.45, 0.7) * S, 0.2 * S, 0.3, 0, 0.6, 1.5);
      }
    }
  }

  // ---------------------------------------------------------------- combat read-outs
  /**
   * A red AoE melee zone (a slam, a pounce, the sky dive's target): the ground heats up under it
   * (heatDisc). Call every frame while it shows; `k` 0..1 ramps toward impact, `hot` = past the
   * timing flash. One zone at a time (the AI's current hit); a zone not drawn for 0.25 s starts over
   * with a new fill pattern.
   */
  warnRing(dt, x, z, r, k, hot = false) {
    if (!(r > 0) || !Number.isFinite(x + z)) return;
    const st = this._zoneHeat, t = this.game.time ?? 0;
    if (t - st.lastT > 0.25) {
      st.seed = 1 + Math.random() * 97;
      st.heatT = 0;
    }
    st.lastT = t;
    this.heatDisc(this._hold(st, 'hold', dt), st, dt, x, z, r, k, hot, st.seed);
  }

  /**
   * Timing flash of a tell at the striking part (combat:flash): the design every boss shares
   * (DuelFx.tellFlash, COMBAT.md "Tell presentation"): normal a white cross written on the letter
   * grid, blue a larger eight-point star with a ring, red a ragged red blaze.
   */
  tellFlash(tell, x, y, z, flare = false) {
    this.tells.tellFlash(tell, x, y, z, TELL_K, flare);
  }

  /** A black blow's charge (DuelFx.charge): darkness drawn into the striking part; `u` 0..1. */
  charge(x, y, z, u, dt) {
    this.tells.charge(x, y, z, u, dt, TELL_K * 1.6);
  }

  /** Impact cue for AoE tells (the zone's combat:flash): the heated ground flares (heatFlare). */
  ringPulse(x, z, r) {
    this.heatFlare(x, z, r);
  }

  /**
   * The roar's damaging shock ring (an effect, not a tell): a shock front in the look in use rolls
   * out to the ring's edge and slows there, a second, weaker one behind it, the grass thrown flat.
   */
  shockRing(x, z, r) {
    if (!(r > 0) || !Number.isFinite(x + z)) return;
    this._shock(x, z, 1.5 * S, r, 0.6, 1.3, 1);
    this._shock(x, z, 1.2 * S, r * 0.78, 0.7, 0.6, 0.7, 0.12);
    this.game.world?.gust?.(x, z, 2, r * 1.3);
  }

  /**
   * A heavy body meets the ground (a landing, a stomp, a crash; for every agent to call): a shock
   * front of dust in the look in use, out to r, a little heat in it (k: strength, 1 = the leap's
   * landing), grit and clods thrown, the grass flattened. Draws only: no damage, no ground fire.
   */
  groundShock(x, z, r, k = 1) {
    if (!(r > 0) || !Number.isFinite(x + z + r + k)) return;
    k = Math.max(0.2, Math.min(2, k));
    this._shock(x, z, Math.min(1.2 * S, r * 0.25), r, 0.45 + 0.1 * k, k, 0.22);
    this.game.world?.gust?.(x, z, 0.8 + 0.8 * k, r * 1.6);
  }

  /** Parry: a hard white/gold spark burst where the blow was turned aside (blue: bigger, still white/gold). */
  parrySpark(x, y, z, tell = 'normal') {
    if (!Number.isFinite(x + y + z)) return;
    const big = tell === 'blue';
    const w = PARRY_WHITE;
    this._spawn(this.add, {
      x, y, z, life: big ? 0.26 : 0.22, size: (big ? 2.3 : 1.8) * S, sizeEnd: 0.5 * S, glyph: '*',
      color: [w[0] * 1.5, w[1] * 1.5, w[2] * 1.5], colorEnd: PARRY_GOLD, alpha: 1, alphaEnd: 0,
    });
    const n = big ? 36 : 26;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(5, big ? 15 : 13);
      this._spawn(this.add, {
        x, y, z,
        vx: Math.cos(a) * sp, vy: rand(-1, 6), vz: Math.sin(a) * sp,
        life: rand(0.2, 0.45), size: rand(0.25, 0.45), sizeEnd: 0.05, glyph: "*+x'`",
        color: Math.random() < 0.5 ? w : PARRY_GOLD, colorEnd: PARRY_END, alpha: 1, alphaEnd: 0, drag: 3, gravity: 8, stretch: 0.3,
      });
    }
    // the shower: heavier sparks that arc out and fall to the ground, still glowing
    for (let i = 0; i < (big ? 18 : 12); i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(2.5, 8);
      this._spawn(this.add, {
        x, y, z,
        vx: Math.cos(a) * sp, vy: rand(3, 9), vz: Math.sin(a) * sp,
        life: rand(0.55, 1.0), size: rand(0.16, 0.28), sizeEnd: 0.04, glyph: ".'`•",
        color: Math.random() < 0.35 ? w : PARRY_GOLD, colorEnd: PARRY_END, alpha: 1, alphaEnd: 0, drag: 0.9, gravity: -17, flicker: 0.3,
      });
    }
    this._light({ x, y: Math.max(0.8, y), z, color: PARRY_LIGHT, intensity: big ? 6 : 5, radius: big ? 8.5 : 7, life: 0.25, fade: 0.2 });
  }

  /** Posture break: a gold burst off the head as it slumps. */
  breakBurst(x, y, z) {
    if (!Number.isFinite(x + y + z)) return;
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(3, 9) * S;
      this._spawn(this.add, {
        x, y, z,
        vx: Math.cos(a) * sp, vy: rand(1, 6), vz: Math.sin(a) * sp,
        life: rand(0.35, 0.7), size: rand(0.35, 0.6) * S, sizeEnd: 0.1, glyph: '#*+',
        color: [3.4, 2.4, 0.7], colorEnd: [0.9, 0.3, 0.05], alpha: 1, alphaEnd: 0, drag: 2.5, gravity: 4,
      });
    }
    this._light({ x, y: Math.max(1, y), z, color: [1, 0.75, 0.3], intensity: 4.5, radius: 9 * S, life: 0.5, fade: 0.4 });
  }

  /** Dazed stars circling the head while the posture is broken (call every frame). */
  stunStars(dt, head) {
    const life = this._hold(this._held, 'stars', dt);
    if (!life || !head || !Number.isFinite(head.x + head.y + head.z)) return;
    const t = this.game.time ?? 0;
    for (let i = 0; i < 4; i++) {
      const a = t * 3.2 + (i / 4) * Math.PI * 2;
      this._spawn(this.add, {
        x: head.x + Math.cos(a) * 0.9 * S, y: head.y + 1.0 * S + Math.sin(a * 2) * 0.12, z: head.z + Math.sin(a) * 0.9 * S,
        life, size: 0.45 * S, sizeEnd: 0.45 * S, glyph: i % 2 ? '+' : '*',
        color: [2.6, 2.0, 0.6], alpha: 1, alphaEnd: 1,
      });
    }
  }

  /** Current position of the first live shell of `volley` (fireball tell flash). */
  shellPos(volley, out) {
    for (const p of this.projectiles) {
      if (p.alive && p.volley === volley) {
        out.copy(p.p);
        return true;
      }
    }
    return false;
  }

  /** Small spray of embers where the dragon was struck. */
  hitSpark(x, y, z, dx, dz, heavy) {
    const n = heavy ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const sp = rand(2, heavy ? 8 : 5);
      this._spawn(this.add, {
        x, y, z,
        vx: dx * sp + rand(-2, 2), vy: rand(0.5, 4), vz: dz * sp + rand(-2, 2),
        life: rand(0.25, 0.55), size: rand(0.2, 0.35), sizeEnd: 0.05, glyph: "*+'`.",
        color: [3.5, 1.3, 0.3], colorEnd: [0.6, 0.06, 0.01], alpha: 1, alphaEnd: 0, drag: 2, gravity: -6,
      });
    }
  }

  // ================================================================ fire hazards, spells and flight
  // (dragon-fire, contract 3). Heat in the fire field, small glyph particles from the world atlas and
  // pooled lights; the emitters reuse one spawn record each (_rec for glyphs, _blob for heat; the
  // pools copy the fields): no per-particle objects.

  /** The reused spawn record with every field reset (colours: the _c0 / _c1 scratch, see _col). */
  _rec(x, y, z, life, size, sizeEnd, glyph) {
    const o = this._r;
    o.x = x;
    o.y = y;
    o.z = z;
    o.vx = o.vy = o.vz = 0;
    o.life = life;
    o.size = size;
    o.sizeEnd = sizeEnd;
    o.glyph = glyph;
    o.color = this._c0;
    o.colorEnd = this._c1;
    o.alpha = 1;
    o.alphaEnd = 0;
    o.drag = o.gravity = o.spin = o.rot = o.flicker = o.stretch = 0;
    return o;
  }

  /** Start / end colours of the next spawns: c0 x k0 -> c1 x k1. */
  _col(c0, k0, c1, k1) {
    const a = this._c0, b = this._c1;
    a[0] = c0[0] * k0;
    a[1] = c0[1] * k0;
    a[2] = c0[2] * k0;
    b[0] = c1[0] * k1;
    b[1] = c1[1] * k1;
    b[2] = c1[2] * k1;
  }

  /** Screen-space rotation that turns a glyph's +x (or, with `up`, its +y) along world direction (dx, dy, dz). */
  _screenRot(dx, dy, dz, up = false) {
    const U = this.game.U, R = U?.uCamRight?.value, Up = U?.uCamUp?.value;
    const sx = R ? dx * R.x + dy * R.y + dz * R.z : dx;
    const sy = Up ? dx * Up.x + dy * Up.y + dz * Up.z : -dz;
    return up ? Math.atan2(-sx, sy) : Math.atan2(sy, sx);
  }

  /** Life (s) for hazard `h`'s held sprites this frame (0 = last frame's copy still shows). */
  holdLife(h, dt) {
    return this._hold(h, 'hold', dt);
  }

  /** A light a hazard owns (tracked: reset() kills it; the hazard kills it when it ends). */
  hazardLight(x, z, color, intensity, radius) {
    return this._light({ x, y: 1.2, z, color, intensity, radius, fadeIn: 0.12, fade: 0.35, flicker: 0.45 });
  }

  // ---------------------------------------------------------------- ground heat (ADR-052)
  /** Fill colour of heat k (0 dark ember .. 0.6 orange .. 1 white-orange) x mul into _c0 / _c1; lava 0..1 tints it molten. */
  _heatCol(k, mul, lava = 0) {
    const c = this._c0, e = this._c1;
    const lo = k < 0.6, u = lo ? k / 0.6 : (k - 0.6) / 0.4;
    const A = lo ? HEAT_DARK : HEAT_MID, B = lo ? HEAT_MID : HEAT_HOT;
    for (let i = 0; i < 3; i++) {
      let v = A[i] + (B[i] - A[i]) * u;
      if (lava > 0) v += (LAVA[i] * (0.4 + 0.6 * k) - v) * lava;
      c[i] = e[i] = v * mul;
    }
  }

  /** The scorch map's heat channel under a warning (no char): stamped every HEAT_STAMP s per state `st`. */
  _heatStamp(st, dt, x, z, r, k) {
    st.heatT = (st.heatT || 0) - dt;
    if (st.heatT > 0) return;
    st.heatT = HEAT_STAMP;
    this.game.world?.scorch?.burnCircle?.(x, z, r, 0, 0.2 + 0.45 * k);
  }

  /** Rising sparks / heat shimmer once k passes 0.6: `rate` per s at k 1, at points the sampler `at` picks. */
  _heatSparks(st, dt, k, rate, at) {
    if (k <= 0.6) return;
    st.acc4 = (st.acc4 || 0) + dt * rate * ((k - 0.6) / 0.4);
    let m = Math.min(6, Math.floor(st.acc4));
    st.acc4 -= m;
    while (m-- > 0) {
      at(this._heatPt);
      const o = this._rec(this._heatPt.x, 0.15, this._heatPt.z, rand(0.35, 0.65), rand(0.22, 0.34), 0.06, HEAT_SPARK);
      o.vx = rand(-0.25, 0.25);
      o.vy = rand(0.8, 2.2);
      o.vz = rand(-0.25, 0.25);
      o.drag = 0.8;
      o.flicker = 0.5;
      this._col(HEAT_HOT, 0.55 + 0.4 * k, HEAT_DARK, 1);
      this._spawn(this.add, o);
    }
  }

  /**
   * The ground heating up over a disc: a meteor, a lava pillar, a barrage shell, the nova, a melee
   * slam zone. `life` from holdLife / _hold (0: last frame's copy still shows), `st` the warning's
   * state ({ acc4, heatT }: a hazard record or _zoneHeat), k 0..1 toward impact, `hot` = the last
   * flashLead s (the true edge is drawn), `seed` keeps the fill pattern stable for this warning.
   * style 1 = a lava pillar (a molten tint, a few '^' when hot).
   */
  heatDisc(life, st, dt, x, z, r, k, hot, seed = 0, style = 0) {
    if (!(r > 0) || !Number.isFinite(x + z + r)) return;
    k = clamp01(k);
    const pool = this.add;
    const area = Math.PI * r * r;
    const n = Math.max(8, Math.min(HEAT_MAX, Math.round(area / HEAT_CELL)));
    const sp = Math.sqrt(area / n); // spacing between fill glyphs
    if (life && pool) {
      const t = this.game.time ?? 0;
      const sz = 0.42 * Math.min(1.7, sp / Math.sqrt(HEAT_CELL));
      const dens = 0.35 + 0.65 * k, alpha = 0.22 + 0.48 * k;
      const lava = style === 1 ? 0.35 : 0;
      const o = this._rec(x, 0.12, z, life, sz, sz, '.');
      for (let i = 0; i < n; i++) {
        const h1 = hash01(seed, i);
        if (h1 > dens) continue; // the low-hash points show first: the fill thickens, it never reshuffles
        const h2 = hash01(seed + 1.37, i), h3 = hash01(seed + 2.71, i);
        const u = Math.sqrt((i + 0.5) / n);
        const a = seed + i * GOLDEN; // sunflower spiral: even cover, no rings
        const rr = Math.min(r * 0.97, r * u + (h2 - 0.5) * sp * 0.45);
        o.x = x + Math.cos(a) * rr + (h3 - 0.5) * sp * 0.35;
        o.z = z + Math.sin(a) * rr + (h2 - 0.5) * sp * 0.35;
        const fl = 0.72 + 0.28 * Math.sin(t * (1.6 + 2.6 * h2) + 6.283 * h3);
        this._heatCol(k * (0.82 + 0.18 * (1 - u)), 1, lava); // the middle runs a little hotter
        o.alpha = o.alphaEnd = alpha * fl;
        o.glyph = HEAT_GLYPHS[(h3 * 4) | 0];
        pool.spawn(o);
      }
      if (hot) {
        // the true edge, only now: a thin bright rim, steady (no march), a fast shimmer
        const m = Math.max(16, Math.min(150, Math.round((Math.PI * 2 * r) / 0.6)));
        const b = 0.85 + 0.15 * Math.sin(t * 30);
        o.glyph = HEAT_RIM;
        o.size = o.sizeEnd = 0.5;
        o.alpha = o.alphaEnd = 0.9;
        this._col(HEAT_EDGE, b, HEAT_EDGE, b);
        for (let i = 0; i < m; i++) {
          const a = seed + (i / m) * Math.PI * 2;
          o.x = x + Math.cos(a) * r;
          o.z = z + Math.sin(a) * r;
          pool.spawn(o);
        }
        if (style === 1) {
          // a pillar about to erupt: a few rising '^' where the crust is splitting
          o.glyph = HZ_RISE;
          o.size = o.sizeEnd = 0.55;
          this._col(LAVA_HOT, 0.9 * b, LAVA_HOT, 0.9 * b);
          for (let i = 0; i < 3; i++) {
            const a = seed * 3 + i * 2.1, rr = r * (0.25 + 0.2 * i);
            o.x = x + Math.cos(a) * rr;
            o.z = z + Math.sin(a) * rr;
            pool.spawn(o);
          }
        }
      }
    }
    this._discX = x;
    this._discZ = z;
    this._discR = r;
    this._heatSparks(st, dt, k, Math.min(40, area * 0.35), this._discAt);
    this._heatStamp(st, dt, x, z, r, k);
  }

  /**
   * The ground heating up along a band: from A along unit (dx, dz), the stretch [s0, s1] of half
   * width hw (a burning pass's strip ahead of its front, a flame wall's line, a fire wheel's spokes).
   * Points sit at fixed s steps, so a band that shrinks (a front eating it) never reshuffles.
   * `front` >= 0: the stretch just past it runs hotter and denser (the fire is coming from there);
   * the edges are drawn from s0 to `rimTo` while `hot`.
   */
  heatBand(life, st, dt, ax, az, dx, dz, s0, s1, hw, k, hot, seed = 0, front = -1, rimTo = s1, stamp = true) {
    if (!(s1 > s0) || !Number.isFinite(ax + az + dx + dz + s0 + s1 + hw)) return;
    k = clamp01(k);
    const pool = this.add;
    const qx = -dz, qz = dx;
    const step = 0.9;
    const lanes = Math.max(1, Math.round((2 * hw) / 1.15));
    const lw = (2 * hw) / lanes;
    if (life && pool) {
      const t = this.game.time ?? 0;
      const o = this._rec(0, 0.12, 0, life, 0.42, 0.42, '.');
      let budget = 320;
      for (let i = Math.ceil(s0 / step); i * step <= s1 && budget > 0; i++) {
        const s = i * step;
        const near = front >= 0 ? clamp01(1 - (s - front) / 7) : 0;
        const kk = Math.min(1, k * (front >= 0 ? 0.8 : 1) + 0.45 * near);
        const dens = 0.35 + 0.65 * kk, alpha = 0.22 + 0.48 * kk;
        for (let j = 0; j < lanes; j++) {
          const id = i * 7 + j;
          if (hash01(seed, id) > dens) continue;
          const h2 = hash01(seed + 1.37, id), h3 = hash01(seed + 2.71, id);
          const ss = s + (h2 - 0.5) * step * 0.6, l = -hw + (j + 0.5) * lw + (h3 - 0.5) * lw * 0.6;
          o.x = ax + dx * ss + qx * l;
          o.z = az + dz * ss + qz * l;
          const fl = 0.72 + 0.28 * Math.sin(t * (1.6 + 2.6 * h2) + 6.283 * h3);
          this._heatCol(kk, 1);
          o.alpha = o.alphaEnd = alpha * fl;
          o.glyph = HEAT_GLYPHS[(h3 * 4) | 0];
          pool.spawn(o);
          budget--;
        }
      }
      if (hot && rimTo > s0) {
        const b = 0.85 + 0.15 * Math.sin(t * 30);
        o.glyph = HEAT_RIM;
        o.size = o.sizeEnd = 0.5;
        o.alpha = o.alphaEnd = 0.9;
        this._col(HEAT_EDGE, b, HEAT_EDGE, b);
        for (let s = s0; s <= Math.min(s1, rimTo); s += 0.6) {
          o.x = ax + dx * s + qx * hw;
          o.z = az + dz * s + qz * hw;
          pool.spawn(o);
          o.x = ax + dx * s - qx * hw;
          o.z = az + dz * s - qz * hw;
          pool.spawn(o);
        }
      }
    }
    const L = s1 - s0;
    this._bandAx = ax;
    this._bandAz = az;
    this._bandDx = dx;
    this._bandDz = dz;
    this._bandS0 = s0;
    this._bandL = L;
    this._bandHw = hw;
    this._heatSparks(st, dt, k, Math.min(40, L * hw * 0.7), this._bandAt);
    if (stamp) {
      st.heatT = (st.heatT || 0) - dt;
      if (st.heatT <= 0) {
        st.heatT = HEAT_STAMP;
        const sc = this.game.world?.scorch;
        const m = Math.min(6, 1 + Math.floor(L / 6));
        for (let i = 0; i < m; i++) {
          const s = s0 + Math.random() * L;
          sc?.burnCircle?.(ax + dx * s, az + dz * s, Math.max(1, hw * 1.1), 0, 0.2 + 0.45 * k);
        }
      }
    }
  }

  /** A warning's timing flash (combat:flash): its heated ground flares, hot glyphs thrown up off the edge, a warm light. */
  heatFlare(x, z, r) {
    if (!(r > 0) || !Number.isFinite(x + z + r)) return;
    const add = this.add;
    const n = Math.max(14, Math.min(40, Math.round((Math.PI * 2 * r) / 0.9)));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, rr = r * rand(0.86, 1.04), out = rand(0, 1.6);
      const o = this._rec(x + Math.cos(a) * rr, rand(0.15, 0.4), z + Math.sin(a) * rr, rand(0.2, 0.45), rand(0.3, 0.46), 0.12, HEAT_SPARK);
      o.vx = Math.cos(a) * out;
      o.vy = rand(1.5, 5);
      o.vz = Math.sin(a) * out;
      o.drag = rand(2, 3.5);
      o.flicker = 0.3;
      this._col(HEAT_EDGE, 1.1, HEAT_MID, 0.6);
      this._spawn(add, o);
    }
    this._light({ x, y: 1, z, color: HEAT_LIGHT, intensity: 2.6, radius: 5 + r, life: 0.28, fade: 0.22 });
  }

  /** A hazard's timing flash (combat:flash): the heat flare at its edge. */
  hazardFlash(x, z, r) {
    this.heatFlare(x, z, r);
  }

  /** Before a lava pillar: the ground cracks glow and spit sparks, faster as the eruption nears. */
  pillarRumble(h, dt, x, z, r, k) {
    h.acc2 += dt * (5 + 30 * k * k);
    let m = Math.min(6, Math.floor(h.acc2));
    h.acc2 -= m;
    while (m-- > 0) {
      const a = Math.random() * Math.PI * 2, rr = r * 0.85 * Math.sqrt(Math.random());
      const o = this._rec(x + Math.cos(a) * rr, 0.15, z + Math.sin(a) * rr, rand(0.35, 0.7), rand(0.3, 0.45), 0.1, CRACK);
      o.vy = rand(0.5, 1.8 + 2 * k);
      o.flicker = 0.4;
      this._col(LAVA, 0.45 + 0.6 * k, LAVA_END, 0.6);
      this._spawn(this.add, o);
    }
  }

  /**
   * A falling meteor at (x, y, z) moving along (vx, vy, vz): a white-hot core in an orange halo, a
   * streak of '|' strokes laid along its screen-space motion, a fire trail, smoke, its own light
   * (none when h.dark). `big`: true (a meteor), false (a barrage shell, 0.7) or a drawn scale.
   */
  meteor(life, h, dt, x, y, z, vx, vy, vz, big = true) {
    if (!Number.isFinite(x + y + z + vx + vy + vz)) return;
    const s = typeof big === 'number' ? big : big ? 1 : 0.7;
    const vl = Math.hypot(vx, vy, vz) || 1;
    const ux = vx / vl, uy = vy / vl, uz = vz / vl;
    if (life) {
      // the head: a white-hot heart in an orange skin, and three more blobs strung out behind it so
      // the tail stays joined to the head however fast it falls (held: one copy a frame)
      this._blob(x, y, z, 0, 0, 0, life, 2.5 * s, 2.5 * s, 1.0, 1.0);
      this._blob(x, y, z, 0, 0, 0, life, 1.3 * s, 1.3 * s, 1.3, 1.3);
      for (let i = 1; i <= 3; i++) {
        const back = i * 1.1 * s, hh = 0.8 - i * 0.17;
        this._blob(x - ux * back, y - uy * back, z - uz * back, 0, 0, 0, life, (2.3 - i * 0.35) * s, (2.3 - i * 0.35) * s, hh, hh);
      }
    }
    // the fire it sheds: strewn along the last stretch of its path, it hangs there and burns out
    h.acc += dt * 110 * Math.min(1.5, s);
    let m = Math.min(10, Math.floor(h.acc));
    h.acc -= m;
    while (m-- > 0) {
      const back = rand(1.5, 4.5) * s;
      this._blob(
        x - ux * back + rand(-0.3, 0.3) * s, y - uy * back + rand(-0.3, 0.3) * s, z - uz * back + rand(-0.3, 0.3) * s,
        ux * 3 + rand(-1, 1), uy * 3 + rand(-0.5, 1.5), uz * 3 + rand(-1, 1),
        rand(0.3, 0.55), rand(1.3, 1.8) * s, 0.5 * s, 0.45, 0, 2.5, 1,
      );
      if (m % 4 === 0) {
        const o = this._rec(x + rand(-0.4, 0.4), y + rand(-0.4, 0.4), z + rand(-0.4, 0.4), rand(0.5, 0.9), rand(0.2, 0.3), 0.05, EMBER_STAR);
        o.vx = ux * 5 + rand(-3, 3);
        o.vy = uy * 5 + rand(-1, 3);
        o.vz = uz * 5 + rand(-3, 3);
        o.drag = 1.2;
        o.gravity = -9;
        o.flicker = 0.4;
        this._col(HOT, 1, DARK, 1);
        this._spawn(this.add, o);
      }
    }
    h.acc2 += dt * 26;
    while (h.acc2 >= 1) {
      h.acc2 -= 1;
      const back = rand(3, 7) * s;
      this._blob(x - ux * back + rand(-0.4, 0.4), y - uy * back, z - uz * back + rand(-0.4, 0.4), ux * 1.5, 0.8, uz * 1.5, rand(0.9, 1.4), 1.4 * s, 3.2 * s, 0.4, 0, 1.2, 0, 1);
    }
    if (!h.l0 && !h.dark) h.l0 = this._light({ x, y, z, color: [1, 0.6, 0.25], intensity: 4.5 * Math.min(1.6, s), radius: 11 * Math.min(1.6, s), fade: 0.15, flicker: 0.3 });
    h.l0?.set(x, Math.max(1, y), z);
  }

  /**
   * A meteor strikes: a ball of fire that fills its footprint and rolls up into smoke (_fireBlast),
   * flung rocks, dust, scorch, a crater glow. h.great (Armageddon's last one): the biggest impact in
   * the fight, with a column of fire thrown up out of the crater and a second, slower wave.
   */
  meteorImpact(h, x, z, r) {
    if (!Number.isFinite(x + z + r)) return;
    const g = this.game;
    const gr = !!h.great;
    h.l0?.kill();
    h.l0 = null;
    this._fireBlast(x, z, r, gr ? 3.2 : 1.3);
    let o;
    if (gr) {
      this._wave(x, z, r * 0.3, r * 0.95, 0.5, 56, 1.2, 1.6, 2.8, 0.5);
      for (let i = 0; i < 36; i++) {
        const a = Math.random() * Math.PI * 2, rr = r * 0.35 * Math.sqrt(Math.random());
        this._blob(
          x + Math.cos(a) * rr, rand(0.8, 2), z + Math.sin(a) * rr, Math.cos(a) * rand(0.5, 3), rand(9, 22), Math.sin(a) * rand(0.5, 3),
          rand(0.6, 1.1), rand(2.0, 2.8), rand(1.0, 1.6), 0.5, 0, 0.8, -9,
        );
      }
      this._light({ x, y: 3, z, color: [1, 0.75, 0.45], intensity: 14, radius: 26, life: 0.7, fade: 0.6, flicker: 0.2 });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(4, 10);
      o = this._rec(x, 0.4, z, rand(0.6, 1.0), rand(0.24, 0.4), 0.2, ROCK);
      o.vx = Math.cos(a) * sp;
      o.vy = rand(5, 11);
      o.vz = Math.sin(a) * sp;
      o.gravity = -22;
      o.drag = 0.4;
      o.alpha = 0.95;
      o.alphaEnd = 0.6;
      o.spin = rand(-6, 6);
      this._col(ROCK_COL, 1, ROCK_COL, 0.7);
      this._spawn(this.alpha, o);
    }
    this.dustRing(x, z, r * 0.6, 24, 0.9);
    g.world?.scorch?.burnCircle?.(x, z, r, 0.6, 1);
    this._landed(x, z, r, TUNING.world.meteor, TUNING.world.ignite.meteor);
    g.world?.gust?.(x, z, 1.2, 9);
    this._light({ x, y: 1.5, z, color: [1, 0.62, 0.3], intensity: 8, radius: 13, life: 0.5, fade: 0.4, flicker: 0.2 });
    h.l1 = this._light({ x, y: 0.8, z, color: [1, 0.38, 0.08], intensity: 2.2, radius: 6, life: 1.3, fade: 1.0, flicker: 0.5 });
    const p = g.player?.position;
    const dist = p ? Math.hypot(p.x - x, p.z - z) : 99;
    g.shake?.(gr ? (dist < 16 ? 0.9 : 0.6) : dist < 8 ? 0.32 : dist < 16 ? 0.16 : 0.07);
  }

  /**
   * The meteor's crater (k 1 -> 0). Smouldering: the last cool licks dying, embers, smoke. `burning`
   * (it is on fire: contact ticks): a bed of flame over it, tall and hot enough to read as fire.
   */
  crater(h, dt, x, z, r, k, burning = false) {
    if (k <= 0) return;
    h.acc3 += dt * (burning ? 80 : 30) * k;
    let m = Math.min(burning ? 6 : 4, Math.floor(h.acc3));
    h.acc3 -= m;
    while (m-- > 0) {
      const a = Math.random() * Math.PI * 2, rr = r * (burning ? 0.72 : 0.55) * Math.sqrt(Math.random());
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (burning) {
        this._blob(px, rand(0.7, 1.1), pz, rand(-0.4, 0.4), rand(1.5, 3.2), rand(-0.4, 0.4), rand(0.45, 0.8), rand(1.3, 1.8), 0.5, 0.44, 0.04, 0.8, 1.5);
      } else if (Math.random() < 0.6) {
        this._blob(px, rand(0.6, 0.9), pz, rand(-0.3, 0.3), rand(0.8, 1.8), rand(-0.3, 0.3), rand(0.4, 0.7), rand(0.8, 1.2), 0.3, 0.3 * k, 0, 0.8, 1);
      }
      if (!burning || Math.random() < 0.3) {
        const o = this._rec(px, 0.2, pz, rand(0.4, 0.9), rand(0.18, 0.28), 0.06, EMBER);
        o.vx = rand(-0.4, 0.4);
        o.vy = rand(1, 3.2);
        o.vz = rand(-0.4, 0.4);
        o.drag = 0.8;
        o.flicker = 0.5;
        this._col(EMBER_COL, 0.6 + 0.6 * k, DARK, 0.6);
        this._spawn(this.add, o);
      }
    }
    h.acc2 += dt * 5 * k;
    while (h.acc2 >= 1) {
      h.acc2 -= 1;
      this._blob(x + rand(-0.5, 0.5) * r, rand(1.5, 2.6), z + rand(-0.5, 0.5) * r, rand(-0.3, 0.3), rand(1, 2), rand(-0.3, 0.3), rand(1.2, 1.8), 1.4, 3.4, 0.4, 0, 0.6, 0, 1);
    }
  }

  /**
   * A lava pillar erupts: a column of fire. Blobs shot up at spread speeds, so the heat strings out
   * along it (a white-hot foot, an orange shaft, red tongues at the top); fire bursts out sideways at
   * its foot to the pillar's edge; molten drops fly; scorch.
   */
  pillarBurst(h, x, z, r) {
    if (!Number.isFinite(x + z + r)) return;
    const g = this.game;
    // (the column stands at once: the blobs are born strung out up its height, most of them low,
    // smaller and cooler toward the top, all still climbing)
    for (let i = 0; i < 36; i++) {
      const u = Math.random(), a = Math.random() * Math.PI * 2, rr = r * 0.34 * Math.sqrt(Math.random()) * (1 - 0.5 * u);
      this._blob(
        x + Math.cos(a) * rr, 0.8 + u * u * 6, z + Math.sin(a) * rr, Math.cos(a) * rand(0, 1), rand(5, 11) * (0.6 + u), Math.sin(a) * rand(0, 1),
        rand(0.55, 0.95), rand(1.2, 1.7) * (1 - 0.45 * u), rand(0.7, 1.0), 0.42 * (1 - 0.4 * u), 0.08, 0.6, -10,
      );
    }
    this._shock(x, z, r * 0.3, r * 0.95, 0.35, 0.4, 0.8);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(3, 7);
      const o = this._rec(x, rand(2, 6), z, rand(0.7, 1.1), rand(0.22, 0.34), 0.1, LAVA_DROPS);
      o.vx = Math.cos(a) * sp;
      o.vy = rand(4, 10);
      o.vz = Math.sin(a) * sp;
      o.gravity = -20;
      this._col(LAVA_HOT, 1, LAVA_END, 1);
      this._spawn(this.add, o);
    }
    for (let i = 0; i < 3; i++) {
      this._blob(x + rand(-0.6, 0.6), rand(3, 6), z + rand(-0.6, 0.6), rand(-0.4, 0.4), rand(2, 3.5), rand(-0.4, 0.4), rand(1.2, 1.8), 1.4, 3.2, 0.45, 0, 0.6, 0, 1);
    }
    g.world?.scorch?.burnCircle?.(x, z, r * 1.1, 0.7, 1);
    this._landed(x, z, r * 1.1, TUNING.world.pillar, TUNING.world.ignite.pillar);
    this._light({ x, y: 2.5, z, color: [1, 0.5, 0.15], intensity: 7, radius: 11, life: 0.85, fade: 0.6, flicker: 0.3 });
    const p = g.player?.position;
    const dist = p ? Math.hypot(p.x - x, p.z - z) : 99;
    g.shake?.(dist < 6 ? 0.18 : 0.06);
  }

  /** The erupting column (k 1 -> 0 as it dies down). */
  pillarBurn(h, dt, x, z, r, k) {
    if (k <= 0) return;
    h.acc3 += dt * 100 * k;
    let m = Math.min(8, Math.floor(h.acc3));
    h.acc3 -= m;
    while (m-- > 0) {
      const u = Math.random(), a = Math.random() * Math.PI * 2, rr = r * 0.34 * Math.sqrt(Math.random()) * (1 - 0.5 * u);
      this._blob(
        x + Math.cos(a) * rr, 0.8 + u * u * 5.5 * k, z + Math.sin(a) * rr, 0, rand(5, 11) * (0.5 + u) * (0.5 + 0.5 * k), 0,
        rand(0.4, 0.65), rand(1.1, 1.6) * (1 - 0.45 * u), rand(0.7, 1.0), 0.38 * (1 - 0.4 * u) * (0.6 + 0.4 * k), 0.06, 0, -8,
      );
      if (m % 2 === 0) {
        // a lick torn off the side of the column: it leans out and climbs on its own
        const la = Math.random() * Math.PI * 2, lo = r * rand(0.3, 0.5);
        this._blob(x + Math.cos(la) * lo, rand(1, 3.5) * (0.5 + 0.5 * k), z + Math.sin(la) * lo, Math.cos(la) * rand(1, 2.5), rand(2, 5), Math.sin(la) * rand(1, 2.5), rand(0.35, 0.6), rand(0.7, 1.0), 0.3, rand(0.2, 0.3), 0, 0.8, 3);
      }
      if (m % 3 === 0) {
        const o = this._rec(x + Math.cos(a) * rr, rand(1, 3), z + Math.sin(a) * rr, rand(0.5, 0.9), rand(0.2, 0.3), 0.06, LAVA_DROPS);
        o.vx = Math.cos(a) * rand(1, 4);
        o.vy = rand(3, 9);
        o.vz = Math.sin(a) * rand(1, 4);
        o.gravity = -18;
        this._col(LAVA_HOT, 1, LAVA_END, 1);
        this._spawn(this.add, o);
      }
    }
  }

  /** A barrage shell the hazard drew itself (no free shell slot): the usual blast, no damage. */
  shellImpact(x, z, r) {
    this.explode(x, z, r, NO_HIT);
  }

  /**
   * A strip's warning: the ground heats up from the fire front `f` to the strip's end, hottest just
   * ahead of the front (no chevrons: the front shows the way). `hot` (ignition or the front within
   * flashLead s): the band's edges for the stretch the front reaches in flashLead s.
   */
  stripWarn(life, h, dt, f, k, hot = false) {
    const rimTo = f + h.speed * TUNING.flashLead;
    this.heatBand(life, h, dt, h.ax, h.az, h.dx, h.dz, f, h.len, h.w / 2, k, hot, h.seed, f, rimTo);
  }

  /**
   * Flames over a strip's burning stretch [b0, f]: a bed of blobs that overlap into one body of fire
   * as wide as the strip; the fresh front burns tallest and hottest and scorches as it runs; smoke
   * rolls off it.
   */
  stripFire(h, dt, b0, f, front) {
    const L = f - b0;
    if (!(L > 0.01)) return;
    const hw = h.w / 2, dx = h.dx, dz = h.dz, qx = -dz, qz = dx;
    h.acc += dt * Math.min(380, L * h.w * 2.2);
    let m = Math.min(14, Math.floor(h.acc));
    h.acc -= m;
    while (m-- > 0) {
      const s = b0 + Math.random() * L, l = (Math.random() * 2 - 1) * hw * 0.8;
      const young = clamp01(1 - (f - s) / 6);
      this._blob(
        h.ax + dx * s + qx * l, rand(0.7, 1.2), h.az + dz * s + qz * l, rand(-0.4, 0.4), rand(1.5, 3.2) * (1 + young), rand(-0.4, 0.4),
        rand(0.45, 0.8), rand(1.5, 2.1) * (1 + 0.3 * young), 0.9, 0.5 + 0.15 * young, 0.2, 1.2, 1.5,
      );
    }
    if (front) {
      const fx = h.ax + dx * f, fz = h.az + dz * f;
      h.acc2 -= dt;
      if (h.acc2 <= 0) {
        h.acc2 = 0.07;
        this.game.world?.scorch?.burnCircle?.(fx, fz, hw * 1.1, 0.16, 1);
        this.game.world?.ignite?.(fx, fz, hw, TUNING.world.ignite.strip); // the pass sets what it crosses alight
        for (let i = 0; i < 4; i++) {
          // the front: flames of every height, one leaning ahead now and then
          const l = (Math.random() * 2 - 1) * hw * 0.9, tall = Math.random() < 0.3;
          this._blob(fx + qx * l, rand(0.8, 1.3), fz + qz * l, dx * rand(1, 5), tall ? rand(6, 10) : rand(2, 5), dz * rand(1, 5), rand(0.35, 0.7), rand(1.0, 1.9), rand(0.4, 0.8), rand(0.38, 0.55), 0, 1.6, tall ? 3 : 1);
        }
        const l = (Math.random() * 2 - 1) * hw;
        const o = this._rec(fx + qx * l, 0.6, fz + qz * l, rand(0.5, 0.9), rand(0.2, 0.3), 0.05, EMBER_STAR);
        o.vx = dx * rand(2, 6) + rand(-2, 2);
        o.vy = rand(3, 8);
        o.vz = dz * rand(2, 6) + rand(-2, 2);
        o.gravity = -12;
        o.drag = 0.8;
        o.flicker = 0.4;
        this._col(HOT, 1, DARK, 1);
        this._spawn(this.add, o);
      }
    }
    h.acc3 += dt * Math.min(16, L * 0.5);
    while (h.acc3 >= 1) {
      h.acc3 -= 1;
      const s = b0 + Math.random() * L;
      this._blob(h.ax + dx * s, rand(2, 3.5), h.az + dz * s, 0, rand(0.8, 1.8), 0, rand(1.2, 1.8), 1.8, 4.2, 0.4, 0, 0.6, 0, 1);
    }
  }

  /**
   * What a moving fire leaves behind it: low red licks that stand where it passed and die out, and
   * embers. ring: on the circle of radius `back` round (h.x, h.z); else behind the wall at
   * (this._cx, this._cz), `back` behind its centre line, along +-half. Uses h.acc4.
   */
  _smoulder(h, dt, k, rate, ring, back, half) {
    if (!(k > 0.3)) return;
    h.acc4 = (h.acc4 || 0) + dt * rate * k;
    let m = Math.min(5, Math.floor(h.acc4));
    h.acc4 -= m;
    while (m-- > 0) {
      let x, z;
      if (ring) {
        const a = Math.random() * Math.PI * 2, rr = Math.max(0.5, back - rand(0, 2.2));
        x = h.x + Math.cos(a) * rr;
        z = h.z + Math.sin(a) * rr;
      } else {
        const l = rand(-half, half), b = back + rand(0, 2.4);
        x = this._cx - h.dz * l - h.dx * b;
        z = this._cz + h.dx * l - h.dz * b;
      }
      if (!Number.isFinite(x + z)) return;
      this._blob(x, rand(0.8, 1.0), z, rand(-0.2, 0.2), rand(0.6, 1.4), rand(-0.2, 0.2), rand(0.8, 1.5), rand(0.9, 1.4), rand(0.5, 0.8), rand(0.2, 0.3), 0.04, 0.5, 1.2);
      if (m % 2 === 0) {
        const o = this._rec(x, 0.3, z, rand(0.6, 1.2), rand(0.22, 0.32), 0.05, EMBER);
        o.vx = rand(-0.3, 0.3);
        o.vy = rand(0.8, 2.4);
        o.vz = rand(-0.3, 0.3);
        o.drag = 0.8;
        o.flicker = 0.5;
        this._col(EMBER_COL, 0.9, DARK, 0.6);
        this._spawn(this.add, o);
      }
    }
  }

  /**
   * Before a flame ring ignites: the ground heats up in a band round the wyrm's footprint where it
   * will catch (r0 itself lies under the belly); `hot`: the band's outer edge. Its reach is not
   * drawn: the ring itself shows it once lit.
   */
  ringWarn(life, h, dt, k, hot = false) {
    k = clamp01(k);
    const rw = Math.max(h.r0, 6.5), hw = 1.4;
    const pool = this.add;
    if (life && pool) {
      const t = this.game.time ?? 0;
      const o = this._rec(0, 0.12, 0, life, 0.42, 0.42, '.');
      const n = Math.max(16, Math.min(90, Math.round((Math.PI * 2 * rw) / 0.9)));
      const dens = 0.35 + 0.65 * k, alpha = 0.22 + 0.48 * k;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < 3; j++) {
          const id = i * 7 + j;
          if (hash01(h.seed, id) > dens) continue;
          const h2 = hash01(h.seed + 1.37, id), h3 = hash01(h.seed + 2.71, id);
          const a = ((i + (h2 - 0.5) * 0.6) / n) * Math.PI * 2;
          const rr = rw - hw + ((j + 0.5) / 3) * 2 * hw + (h3 - 0.5) * 0.5;
          o.x = h.x + Math.cos(a) * rr;
          o.z = h.z + Math.sin(a) * rr;
          const fl = 0.72 + 0.28 * Math.sin(t * (1.6 + 2.6 * h2) + 6.283 * h3);
          this._heatCol(k, 1);
          o.alpha = o.alphaEnd = alpha * fl;
          o.glyph = HEAT_GLYPHS[(h3 * 4) | 0];
          pool.spawn(o);
        }
      }
      if (hot) {
        const re = rw + hw, m = Math.max(24, Math.min(150, Math.round((Math.PI * 2 * re) / 0.6)));
        const b = 0.85 + 0.15 * Math.sin(t * 30);
        o.glyph = HEAT_RIM;
        o.size = o.sizeEnd = 0.5;
        o.alpha = o.alphaEnd = 0.9;
        this._col(HEAT_EDGE, b, HEAT_EDGE, b);
        for (let i = 0; i < m; i++) {
          const a = (i / m) * Math.PI * 2;
          o.x = h.x + Math.cos(a) * re;
          o.z = h.z + Math.sin(a) * re;
          pool.spawn(o);
        }
      }
    }
    this._discX = h.x;
    this._discZ = h.z;
    this._discR = rw + hw;
    this._heatSparks(h, dt, k, 30, this._discAt);
    h.heatT = (h.heatT || 0) - dt;
    if (h.heatT <= 0) {
      h.heatT = HEAT_STAMP;
      const sc = this.game.world?.scorch;
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        sc?.burnCircle?.(h.x + Math.cos(a) * rw, h.z + Math.sin(a) * rw, 1.8, 0, 0.2 + 0.45 * k);
      }
    }
  }

  /**
   * The expanding ring of fire at r (k fades it out): a band of blobs that ride out with the ring and
   * climb, so it stands as one unbroken wall of flame as wide as it hurts; a thin hot line marks its
   * leading edge; scorch.
   */
  ringFire(life, h, dt, r, k) {
    const add = this.add;
    if (!(k > 0)) return;
    const hw = h.w / 2;
    h.acc += dt * Math.min(1400, Math.PI * 2 * r * 12) * k;
    let m = Math.min(30, Math.floor(h.acc));
    h.acc -= m;
    while (m-- > 0) {
      const a = Math.random() * Math.PI * 2, rr = r + (Math.random() * 2 - 1) * hw * 0.7;
      const ca = Math.cos(a), sa = Math.sin(a);
      if (m % 3 === 0) {
        // the heart of the band: smaller, hotter blobs down its middle (close enough to run together)
        this._blob(h.x + ca * r, rand(0.8, 1.3), h.z + sa * r, ca * h.speed * 0.95, rand(1.5, 3.5), sa * h.speed * 0.95, rand(0.3, 0.45), rand(1.1, 1.4), 0.9, 0.28 * k, 0.12 * k, 0.2, 1.5);
        continue;
      }
      this._blob(
        h.x + ca * rr, rand(0.7, 1.5), h.z + sa * rr, ca * h.speed * 0.9, rand(2, 5), sa * h.speed * 0.9,
        rand(0.32, 0.52), rand(1.4, 1.9), rand(1.1, 1.4), 0.44 * k, 0.16 * k, 0.4, 2.5,
      );
    }
    if (life && k > 0.5) {
      // the leading edge: a ragged hem of small flames (held heat, one copy a frame), each its own
      // size and strength, re-dealt a few times a second; no ruler-even line of dots
      const re = r + hw * 0.85;
      const n = Math.max(24, Math.min(220, Math.round((Math.PI * 2 * re) / 0.5)));
      const beat = Math.floor((this.game.time ?? 0) * 7);
      for (let i = 0; i < n; i++) {
        const h1 = hash01(h.seed + beat, i), h2 = hash01(h.seed + 3.1, i + beat * 0.37);
        if (h1 < 0.18) continue;
        const a = ((i + h2 * 0.8) / n) * Math.PI * 2, rr = re + (h1 - 0.5) * 1.1;
        const sz = 0.55 + 0.4 * h2, ht = (0.08 + 0.17 * h1) * k;
        this._blob(h.x + Math.cos(a) * rr, 0.85, h.z + Math.sin(a) * rr, 0, 0, 0, life, sz, sz, ht, ht);
      }
    }
    this._smoulder(h, dt, k, Math.min(70, r * 4), true, r - hw, 0);
    h.acc2 -= dt;
    if (h.acc2 <= 0 && k > 0.5) {
      h.acc2 = 0.12;
      const sc = this.game.world?.scorch;
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        sc?.burnCircle?.(h.x + Math.cos(a) * r, h.z + Math.sin(a) * r, hw * 1.4, 0.18, 0.9);
        // (a sweeping ring lights the wood it crosses, not the whole field's grass)
        this.game.world?.ignite?.(h.x + Math.cos(a) * r, h.z + Math.sin(a) * r, hw * 1.4, 1, false);
      }
    }
  }

  /**
   * Before a flame wall: the ground heats up along the line where it springs up (no chevron field:
   * the lit wall shows which way it goes); `hot`: the line's edges.
   */
  wallWarn(life, h, dt, k, hot = false) {
    const qx = -h.dz, qz = h.dx, half = h.len / 2;
    this.heatBand(life, h, dt, h.x - qx * half, h.z - qz * half, qx, qz, 0, h.len, h.w / 2, k, hot, h.seed);
  }

  /**
   * The sweeping wall at centre (cx, cz) (k fades it out): blobs that ride with it, born at its foot
   * and higher up, so it stands two storeys tall and unbroken along its whole length; a thin hot
   * line marks its leading edge; scorch.
   */
  wallFire(life, h, dt, cx, cz, k) {
    const add = this.add;
    if (!(k > 0)) return;
    const qx = -h.dz, qz = h.dx, half = h.len / 2, hw = h.w / 2;
    h.acc += dt * Math.min(900, h.len * 20) * k;
    let m = Math.min(26, Math.floor(h.acc));
    h.acc -= m;
    while (m-- > 0) {
      const l = (Math.random() * 2 - 1) * half, s = (Math.random() * 2 - 1) * hw * 0.6;
      if (m % 3 === 0) {
        // the heart of the wall: smaller, hotter blobs along its foot (close enough to run together)
        this._blob(cx + qx * l, rand(0.8, 1.4), cz + qz * l, h.dx * h.speed * 0.95, rand(2, 4), h.dz * h.speed * 0.95, rand(0.3, 0.45), rand(1.1, 1.4), 1.0, 0.32 * k, 0.14 * k, 0.2, 1.5);
        continue;
      }
      const high = Math.random() < 0.45;
      this._blob(
        cx + qx * l + h.dx * s, high ? rand(1.8, 3.6) : rand(0.7, 1.3), cz + qz * l + h.dz * s, h.dx * h.speed * 0.9, rand(3, 7), h.dz * h.speed * 0.9,
        rand(0.35, 0.6), rand(1.5, 2.1), rand(1.2, 1.6), (high ? 0.3 : 0.38) * k, 0.14 * k, 0.4, high ? 3 : 2,
      );
    }
    if (life && k > 0.5) {
      // the leading edge: a ragged hem of small flames (held heat, re-dealt a few times a second)
      const ex = cx + h.dx * hw * 0.85, ez = cz + h.dz * hw * 0.85;
      const beat = Math.floor((this.game.time ?? 0) * 7);
      let i = 0;
      for (let l = -half; l <= half; l += 0.5, i++) {
        const h1 = hash01(h.seed + beat, i), h2 = hash01(h.seed + 3.1, i + beat * 0.37);
        if (h1 < 0.18) continue;
        const ll = l + h2 * 0.4, ff = (h1 - 0.5) * 1.1, sz = 0.55 + 0.4 * h2, ht = (0.08 + 0.17 * h1) * k;
        this._blob(ex + qx * ll + h.dx * ff, 0.85, ez + qz * ll + h.dz * ff, 0, 0, 0, life, sz, sz, ht, ht);
      }
    }
    this._cx = cx;
    this._cz = cz;
    this._smoulder(h, dt, k, Math.min(60, h.len * 1.5), false, hw, half);
    h.acc2 -= dt;
    if (h.acc2 <= 0 && k > 0.5) {
      h.acc2 = 0.12;
      const sc = this.game.world?.scorch;
      for (let i = 0; i < 9; i++) {
        const l = (Math.random() * 2 - 1) * half;
        sc?.burnCircle?.(cx + qx * l, cz + qz * l, hw * 1.6, 0.15, 0.9);
        this.game.world?.ignite?.(cx + qx * l, cz + qz * l, hw * 1.6, 1, false); // (wood only, as the ring)
      }
    }
  }

  // ---------------------------------------------------------------- flight + spell casts
  /** The aerial breath (sky strafe): lights along the stream, created / killed with the pass. */
  skyBegin() {
    this.skyEnd();
    for (let i = 0; i < 3; i++) {
      const l = this._light({ x: 0, y: 1, z: 0, color: [1, 0.46, 0.13], intensity: 3.6 - i * 0.5, radius: 9 + 2 * i, fadeIn: 0.12, fade: 0.35, flicker: 0.5 });
      if (l) this.skyLights.push(l);
    }
  }

  skyEnd() {
    for (const l of this.skyLights) l.kill();
    this.skyLights.length = 0;
  }

  /**
   * One frame of fire streaming from the mouth down onto the ground front (fx, fz): the breath's body
   * (breathBody: the same fire as the breath, in the look in use, a narrow cone reaching the ground
   * front), and the splash where it lands: flames thrown up off the ground front.
   */
  skyStream(dt, mouth, fx, fz) {
    if (!mouth || !Number.isFinite(mouth.x + mouth.y + mouth.z + fx + fz)) return;
    const dx = fx - mouth.x, dy = 0.3 - mouth.y, dz = fz - mouth.z;
    const hz = Math.hypot(dx, dz), L = Math.hypot(hz, dy) || 1;
    this.breathBody(dt, mouth, Math.atan2(dx, dz), Math.atan2(-dy, Math.max(0.01, hz)), L, 0.15, 0.24);
    let n;
    this._tongueAcc += dt * 45;
    n = Math.min(4, Math.floor(this._tongueAcc));
    this._tongueAcc -= n;
    while (n-- > 0) {
      const a = Math.random() * 6.283, rr = rand(0, 1.8);
      this._blob(
        fx + Math.cos(a) * rr, rand(0.7, 1.2), fz + Math.sin(a) * rr, Math.cos(a) * rand(1, 5), rand(2, 5.5), Math.sin(a) * rand(1, 5),
        rand(0.35, 0.6), rand(1.3, 1.9), 0.6, 0.46, 0, 1.6, 1.5,
      );
    }
    this._sparkAcc += dt * 26;
    while (this._sparkAcc >= 1) {
      this._sparkAcc -= 1;
      const o = this._rec(fx + rand(-1, 1), 0.5, fz + rand(-1, 1), rand(0.5, 1.0), rand(0.2, 0.3), 0.05, EMBER_STAR);
      o.vx = rand(-6, 6);
      o.vy = rand(3, 9);
      o.vz = rand(-6, 6);
      o.drag = 1.2;
      o.gravity = -12;
      o.flicker = 0.4;
      this._col(HOT, 1, DARK, 1);
      this._spawn(this.add, o);
    }
    const L0 = this.skyLights;
    L0[0]?.set(mouth.x, mouth.y, mouth.z);
    L0[1]?.set(mouth.x + dx * 0.55, mouth.y + dy * 0.55, mouth.z + dz * 0.55);
    L0[2]?.set(fx, 1.2, fz);
  }

  /** A wingbeat's downdraft near the ground: a dust ring and the grass flattened under the flier. */
  wingDust(x, z, strength) {
    if (!(strength > 0.05) || !Number.isFinite(x + z)) return;
    this.dustRing(x, z, 1.4 * S, Math.round(10 + 18 * strength), 0.5 + 0.7 * strength);
    this.game.world?.gust?.(x, z, Math.min(2, 0.8 + 1.2 * strength), 12 * S);
  }

  /** The meteor cast: a fireball spat straight up into the sky (a rising column of fire and a light). */
  castBolt(m) {
    if (!m || !Number.isFinite(m.x + m.y + m.z)) return;
    for (let i = 0; i < 22; i++) {
      this._blob(
        m.x + rand(-0.3, 0.3), m.y + rand(0, 2), m.z + rand(-0.3, 0.3), rand(-1, 1), rand(18, 42), rand(-1, 1),
        rand(0.4, 0.9), rand(1.2, 1.8), 0.5, i < 4 ? 0.9 : 0.45, 0, 1.0, 0,
      );
    }
    this._light({ x: m.x, y: m.y + 4, z: m.z, color: [1, 0.55, 0.2], intensity: 6, radius: 12, life: 0.7, fade: 0.5 });
  }

  /**
   * Fire gathering round the wyrm before a flame ring (k 0 -> 1): wisps of flame swirl in on a circle
   * round (x, z). Each is small and cool (red and orange tongues, not a burning body): it is the
   * cast, not the fire that hurts.
   */
  gatherFire(dt, x, z, r, k) {
    if (!Number.isFinite(x + z + r)) return;
    this._gatherAcc += dt * (30 + 140 * k);
    let n = Math.min(14, Math.floor(this._gatherAcc));
    this._gatherAcc -= n;
    while (n-- > 0) {
      const a = Math.random() * Math.PI * 2, rr = r * rand(1.2, 2.6);
      const ca = Math.cos(a), sa = Math.sin(a);
      this._blob(
        x + ca * rr, rand(0.8, 2.6), z + sa * rr, -sa * 7 - ca * 3, rand(0.3, 1.5), ca * 7 - sa * 3,
        rand(0.5, 0.8), rand(0.8, 1.2), 0.35, 0.26 + 0.2 * k, 0, 0.5, 0,
      );
    }
  }

  /**
   * The nova's charge (k 0 -> 1): embers and wisps of flame sucked in from all round onto the chest
   * (cx, cy, cz), rings of air contracting onto it (the field's crisp kind: strokes, not fire),
   * glowing cracks round its feet.
   */
  novaCharge(dt, cx, cy, cz, k) {
    if (!Number.isFinite(cx + cy + cz)) return;
    const add = this.add;
    this._novaAcc += dt * (50 + 300 * k * k);
    let n = Math.min(24, Math.floor(this._novaAcc));
    this._novaAcc -= n;
    while (n-- > 0) {
      const a = Math.random() * Math.PI * 2, rr = rand(9, 18);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, y = rand(0.3, 10);
      const T = rand(0.5, 0.75);
      if (n % 4 === 0) {
        // a wisp of flame drawn in with them: cool out there, they pile up hot against the body
        this._blob(x, Math.max(1, y), z, (cx - x) / T, (cy - y) / T, (cz - z) / T, T * 0.97, rand(0.9, 1.3), 0.5, 0.2 + 0.25 * k, 0.3 + 0.3 * k);
      }
      const o = this._rec(x, y, z, T * 0.97, rand(0.2, 0.32), 0.08, EMBER_STAR);
      o.vx = (cx - x) / T;
      o.vy = (cy - y) / T;
      o.vz = (cz - z) / T;
      o.flicker = 0.3;
      this._col(EMBER_COL, 0.9, WHITE_HOT, 0.8 + 0.4 * k);
      this._spawn(add, o);
    }
    this._novaRing -= dt;
    if (this._novaRing <= 0) {
      this._novaRing = rand(0.32, 0.5) - 0.18 * k;
      // the air drawn in: a ragged crisp ripple closing on the wyrm, and dust dragged in with it
      this._ripple(cx, cz, 0.85, rand(12, 16), 1.5, 0.55, 0.45 + 0.4 * k, 0.8, 0.32, -1.2);
      for (let i = 0; i < 6 + 10 * k; i++) {
        const a = Math.random() * 6.283, rr = rand(6, 15), T = rand(0.5, 0.8);
        const o = this._rec(cx + Math.cos(a) * rr, rand(0.15, 0.5), cz + Math.sin(a) * rr, T, rand(0.3, 0.44), 0.2, GRIT);
        o.vx = (-Math.cos(a) * rr * 0.9) / T;
        o.vy = rand(0.2, 1.2);
        o.vz = (-Math.sin(a) * rr * 0.9) / T;
        o.alpha = 0.7;
        this._col(DUST_COL, 1.2, DUST_COL, 0.8);
        this._spawn(this.alpha, o);
      }
    }
    this._gatherAcc += dt * (10 + 50 * k);
    while (this._gatherAcc >= 1) {
      this._gatherAcc -= 1;
      const a = Math.random() * Math.PI * 2, rr = rand(2, 9);
      const o = this._rec(cx + Math.cos(a) * rr, 0.15, cz + Math.sin(a) * rr, rand(0.4, 0.8), rand(0.28, 0.4), 0.1, CRACK);
      o.vy = rand(0.6, 2.2);
      o.flicker = 0.4;
      this._col(LAVA, 0.5 + 0.8 * k, LAVA_END, 0.6);
      this._spawn(add, o);
    }
  }

  /**
   * The nova goes off at (x, y, z): walls of fire race out to r one behind the other, so the whole
   * disc burns for a moment; a fireball swells over the wyrm and rolls up; flames are flung out low
   * over the ground; smoke hangs over the scorched disc.
   */
  novaBlast(x, y, z, r) {
    if (!Number.isFinite(x + y + z + r)) return;
    const g = this.game;
    // three fronts, one behind the other, each slower and weaker: the whole disc burns for a moment
    this._shock(x, z, 2, r * 0.97, 0.7, 2.0, 1);
    this._shock(x, z, 1.5, r * 0.78, 0.8, 1.2, 0.85, 0.09);
    this._shock(x, z, 1, r * 0.52, 0.85, 0.8, 0.7, 0.2);
    this._fireBlast(x, z, 8, 1.3);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(8, 30);
      this._blob(
        x + Math.cos(a) * 2, rand(0.8, 2.5), z + Math.sin(a) * 2, Math.cos(a) * sp, rand(0.5, 5), Math.sin(a) * sp,
        rand(0.5, 0.95), rand(1.4, 2.0), rand(2.4, 3.4), 0.36, 0, 1.7, 1.5,
      );
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, rr = r * 0.8 * Math.sqrt(Math.random());
      this._blob(x + Math.cos(a) * rr, rand(1.5, 3), z + Math.sin(a) * rr, 0, rand(1.2, 2.6), 0, rand(1.4, 2.4), 2.5, 6, 0.45, 0, 0.5, 0, 1);
    }
    for (let i = 0; i < 44; i++) {
      const o = this._rec(x + rand(-3, 3), y + rand(-2, 2), z + rand(-3, 3), rand(1, 1.8), rand(0.2, 0.32), 0.08, EMBER);
      o.vx = rand(-6, 6);
      o.vy = rand(8, 18);
      o.vz = rand(-6, 6);
      o.gravity = -5;
      o.drag = 0.6;
      o.flicker = 0.5;
      this._col(EMBER_COL, 1.2, DARK, 1);
      this._spawn(this.add, o);
    }
    this.dustRing(x, z, 3 * S, 48, 1.6);
    g.world?.scorch?.burnCircle?.(x, z, r * 0.85, 0.32, 0.6);
    g.world?.ignite?.(x, z, r * TUNING.world.ignite.nova[1], TUNING.world.ignite.nova[0], false); // (wood only)
    g.world?.gust?.(x, z, 2, r * 1.4);
    this._light({ x, y: 4, z, color: [1, 0.85, 0.6], intensity: 14, radius: 34, life: 0.55, fade: 0.45 });
    this._light({ x, y: 2, z, color: [1, 0.45, 0.12], intensity: 4, radius: 22, life: 1.8, fade: 1.4, flicker: 0.4 });
  }

  /**
   * The dive bomb's crash landing: two waves of fire out to the radius, flames flung out low from
   * under the wyrm, rocks, smoke, a big dust ring.
   */
  crashWave(x, z, r) {
    if (!Number.isFinite(x + z + r)) return;
    const g = this.game;
    this._shock(x, z, 2, r * 0.97, 0.5, 1.3, 1);
    this._shock(x, z, 1.5, r * 0.7, 0.6, 0.6, 0.6, 0.1);
    let o;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(4, 13);
      this._blob(
        x + Math.cos(a) * 2, rand(0.8, 1.6), z + Math.sin(a) * 2, Math.cos(a) * sp, rand(1, 5), Math.sin(a) * sp,
        rand(0.4, 0.75), rand(1.1, 1.6), rand(2.0, 2.8), 0.4, 0, 2.2, 1.5,
      );
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, rr = r * 0.6 * Math.sqrt(Math.random());
      this._blob(x + Math.cos(a) * rr, rand(1.5, 2.6), z + Math.sin(a) * rr, 0, rand(1.2, 2.6), 0, rand(1.2, 1.9), 1.8, 4.2, 0.45, 0, 0.6, 0, 1);
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(5, 13);
      o = this._rec(x + Math.cos(a) * 2, 0.5, z + Math.sin(a) * 2, rand(0.6, 1.1), rand(0.26, 0.42), 0.2, ROCK);
      o.vx = Math.cos(a) * sp;
      o.vy = rand(6, 13);
      o.vz = Math.sin(a) * sp;
      o.gravity = -22;
      o.alpha = 0.95;
      o.alphaEnd = 0.6;
      o.spin = rand(-6, 6);
      this._col(ROCK_COL, 1, ROCK_COL, 0.7);
      this._spawn(this.alpha, o);
    }
    this.dustRing(x, z, 2.2 * S, 60, 1.7);
    g.world?.scorch?.burnCircle?.(x, z, r * 0.7, 0.4, 0.8);
    g.world?.ignite?.(x, z, r * TUNING.world.ignite.dive[1], TUNING.world.ignite.dive[0]);
    g.world?.gust?.(x, z, 2, 24 * S);
    this._light({ x, y: 2, z, color: [1, 0.6, 0.25], intensity: 9, radius: 16, life: 0.6, fade: 0.45 });
  }

  /**
   * One of Armageddon's salvo (visual only, ADR-053): a bolt of fire with a white-hot head and a long
   * burning tail shot up out of the jaws; it flies on until it leaves the top of the view.
   */
  launchBolt(x, y, z, vx, vy, vz) {
    if (!Number.isFinite(x + y + z + vx + vy + vz)) return;
    let b = null;
    for (const c of this.bolts) if (!c.alive) {
      b = c;
      break;
    }
    if (!b) return;
    b.alive = true;
    b.x = x;
    b.y = y;
    b.z = z;
    b.vx = vx;
    b.vy = vy;
    b.vz = vz;
    b.age = 0;
    b.hold = 0;
    b.acc = 0;
    for (let i = 0; i < 4; i++) {
      this._blob(x, y, z, vx * 0.1 + rand(-3, 3), rand(0, 4), vz * 0.1 + rand(-3, 3), rand(0.2, 0.34), rand(0.8, 1.1), rand(1.4, 1.9), 0.4, 0, 3, 1);
    }
  }

  _updateBolts(dt) {
    for (const b of this.bolts) {
      if (!b.alive) continue;
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.age > 1.6 || b.y > 80 || !Number.isFinite(b.x + b.y + b.z)) {
        b.alive = false;
        continue;
      }
      const vl = Math.hypot(b.vx, b.vy, b.vz) || 1;
      const ux = b.vx / vl, uy = b.vy / vl, uz = b.vz / vl;
      const life = this._hold(b, 'hold', dt);
      if (life) {
        // the head and, strung out behind it, the start of the tail (held: one copy a frame)
        this._blob(b.x, b.y, b.z, 0, 0, 0, life, 1.7, 1.7, 1.0, 1.0);
        this._blob(b.x, b.y, b.z, 0, 0, 0, life, 0.9, 0.9, 1.2, 1.2);
        for (let i = 1; i <= 3; i++) {
          const back = i * 0.9, hh = 0.75 - i * 0.16;
          this._blob(b.x - ux * back, b.y - uy * back, b.z - uz * back, 0, 0, 0, life, 1.5 - i * 0.25, 1.5 - i * 0.25, hh, hh);
        }
      }
      b.acc += dt * 60;
      let m = Math.min(5, Math.floor(b.acc));
      b.acc -= m;
      while (m-- > 0) {
        const back = rand(1.5, 4);
        this._blob(
          b.x - ux * back + rand(-0.2, 0.2), b.y - uy * back + rand(-0.2, 0.2), b.z - uz * back + rand(-0.2, 0.2),
          ux * 4 + rand(-0.8, 0.8), uy * 4 + rand(-1, 0.5), uz * 4 + rand(-0.8, 0.8),
          rand(0.35, 0.6), rand(0.9, 1.3), 0.35, 0.42, 0, 2, 0,
        );
      }
    }
  }

  update(dt) {
    this.tells.updateGlints(dt);
    this.tells.updateFlares(dt);
    this._updateProjectiles(dt);
    this._updateBolts(dt);
    this._updateShocks(dt);
    this._pruneLights();
  }
}
