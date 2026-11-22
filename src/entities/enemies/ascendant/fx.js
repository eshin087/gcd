import { TELL, RESULT } from '../../../combat/rules.js';
import { LordFx } from '../starlessLord/fx.js';
import { K_SMOKE, K_VOID, K_STEEL, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { perPhase } from '../duelist/realise.js';
import { DUEL_WORLD } from '../duelist/worldTuning.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { FIRE_PALETTES } from '../../../render/firePalettes.js';
import { drawBeam, drawBeamCharge, drawBeamSplash, drawBeamClash, drawSplit } from './fxBeam.js';

// Tian Lei's effects: the aura of his forms, his blasts, the beam, the vanish, the transformation.
// All of it is heat in the fire field (STYLE.md "The fire field") and glyph particles of one letter
// cell; look code draws from lr() / lrand() (and every drawing method below runs on LordFx's private
// drawing stream: see ASC_DRAW), never from the stream the AI reads.
//
// GOLD: the fire field has no gold kind. This level swaps the VOID slot's palette for gold
// (FIRE_PALETTES.gold, FireField.setPalette) as this class is built: here K_VOID IS GOLD. Energy, not
// fire: an amber rim, a gold body, a pale yellow-white heart. The Lord's inherited draws follow (his
// called lightning's sheath, the stones' grip, the shock fronts of kind 'void'); the violet lights and
// glyph colours they name are turned gold (or storm white near lightning) by _light / _spawn below.
//
// Surface (his class and his moves call these; positions are world metres, `form` 1..3; a method
// with `dt` is called every frame while its thing lasts, the others once):
//   formAura(d, dt, form)                           limbTrail(ax, ay, az, bx, by, bz, form, heavy)
//   muzzle(x, y, z, dx, dz, k, form)                beamCharge(x, y, z, u, dt, form)
//   beam(ax, ay, az, bx, by, bz, w, k, dt, form)    beamSplash(x, y, z, k, dt, form)
//   beamClash(x, y, z, dx, dz, k, dt, form)         beamSplit(x, y, z, dx, dz, len, form)   (once or every frame)
//   vanish(d, x0, z0, x1, z1, form)                 dashGhost(d, form)
//   signSnap(x, y, z, form)                         stanceGlow(d, dt, form)
//   auraBurst(x, z, r, form)                        crater(x, z, r, k)
//   transformGather(x, z, u, dt, form)              transformNova(x, z, r, form)
//   lanternGather(x, y, z, u, dt, form)             lanternClash(x, y, z, dx, dz, k, dt, form)
//   lanternBurst(s, how, x, z)                      (Heaven's Lantern: the gather, THE PUSH, the burst)
// Thrown things are LordFx's pool, grown to 24: throwShot({ kind: 'blast' | 'disc', ... }) (see
// throwShot below for the fields), and callStrike(.., { style: 'bolt' }) for called lightning.
//
// LOOK OPTIONS (duelist/lookSwitch.js; the owner picks from the fx sheets):
//   ?ascAura=a|b|c   forms 2 and 3. a: a tall flame standing round him, tapering above his head, a
//                    wheel of light on the floor; b: a tight sheath hugging his outline with long
//                    streamers climbing off his shoulders; c: a broad low blaze flaring out to his
//                    sides over a wide wheel that spins.
//   ?ascBeam=a|b     the beam's body. a: a column (a white core on the grid, a gold body that swells
//                    and boils along it); b: a braid (two strands of gold winding round a thinner
//                    core, rings of light running down it).
//   ?ascOrb=a|b      Heaven's Lantern's great orb (the gather, the flight, the push). a: a SUN, a round
//                    ball of gold heat with a white heart and a few hot letters orbiting it; b: a
//                    LANTERN, a ball with a bright rim and a darker heart that pulses, trailing motes.
export const ASC_LOOKS = Object.freeze({ ascAura: 'a', ascBeam: 'a', ascOrb: 'a' });
const look = (name) => lookOf(name, ASC_LOOKS[name] ?? 'a');

/** What his thrown energy does to the world (ADR-107; POWER: 1 fells a tree). His tuning's
 *  `T.world` fields win over these. */
export const ASC_WORLD = Object.freeze({ blast: 0.8, bigBlast: 1.4, disc: 0.6 });
const BLAST_BLOW = Object.freeze({ kind: 'blast', by: 'boss', y: 1.0 });

const TAU = Math.PI * 2;
const GOLD = [4.0, 3.0, 1.1], GOLD_END = [0.8, 0.4, 0.04]; // glyph sparks of his energy
const WHITE = [3.6, 3.5, 3.0];
const STORM = [2.6, 3.1, 4.2], STORM_END = [0.3, 0.4, 0.8]; // the third form's lightning (glyphs)
const PALE = [1.3, 1.3, 1.4], DUSTC = [0.32, 0.3, 0.27], DUST_END = [0.12, 0.11, 0.1], STONE = [0.42, 0.4, 0.38];
// lights
const L_GOLD = [1.0, 0.78, 0.36], L_STORM = [0.72, 0.84, 1.0], L_PALE = [0.9, 0.88, 0.8];
// the inherited draws' violet, turned (glyph colours: a mote, an end, a spark)
const GLYPH_GOLD = [3.4, 2.5, 0.8], GLYPH_GOLD_END = [0.5, 0.25, 0.03];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
/** A steady hash 0..1 of a number. */
export const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Violet (the Lord's colour: blue the highest channel, green well under it)? */
const violet = (c) => Array.isArray(c) && c[2] > c[0] * 1.05 && c[1] < c[2] * 0.62;

/** The share of a scorch's glowing heat his energy leaves (see the constructor). */
const SCORCH_HEAT = 0.12;
/** The game as this effects object sees it: the same, but its world's scorch leaves less heat. */
function scorchedGame(real) {
  if (!real || typeof Proxy !== 'function') return real;
  const bound = new Map();
  const bind = (t, v) => {
    let f = bound.get(v);
    if (!f) bound.set(v, (f = v.bind(t)));
    return f;
  };
  const scorch = {
    burnCircle: (x, z, r, burn = 0.5, heat = 1) => real.world?.scorch?.burnCircle?.(x, z, r, burn, heat * SCORCH_HEAT),
  };
  const world = new Proxy({}, {
    get(_, k) {
      const w = real.world;
      if (!w) return undefined;
      if (k === 'scorch') return w.scorch ? scorch : w.scorch;
      const v = w[k];
      return typeof v === 'function' ? bind(w, v) : v;
    },
  });
  return new Proxy(real, {
    get(t, k) {
      if (k === 'world') return t.world ? world : t.world;
      const v = t[k];
      return typeof v === 'function' ? bind(t, v) : v;
    },
  });
}

// every drawing method of this class runs on LordFx's drawing stream (its rnd() inside them), so the
// inherited helpers they call (_shock, arc, lightning ...) never draw from the stream game code reads
const ASC_DRAW = [
  'formAura', 'limbTrail', 'muzzle', 'beamCharge', 'beam', 'beamSplash', 'beamClash', 'beamSplit', 'vanish', 'dashGhost', 'auraBurst',
  'transformGather', 'transformNova', 'crater', 'updateShots', 'signSnap', 'stanceGlow', 'lanternGather', 'lanternClash', 'lanternBurst',
];

export class AscFx extends LordFx {
  constructor(d) {
    super(d);
    // the pools: ten blasts in the air (Golden Rain) with room for the rest; the cue ledger reads
    // fx.shots by field name (alive, done, flashed, phase, x, z, dx, dz, speed, back, wait, radius ...)
    this.shots = Array.from({ length: 24 }, () => ({ alive: false }));
    this.strikes = Array.from({ length: 12 }, () => ({ alive: false }));
    // gold in the fire field: this level borrows the void slot
    this.game.fx?.fire?.setPalette?.('void', FIRE_PALETTES.gold);
    // His energy chars the floor but leaves no embers: every scorch this object asks for (its own and
    // the inherited shock fronts' and called strikes', which ask for a fire's glowing heat) keeps
    // SCORCH_HEAT of its heat (the red-orange glow under them read as fire). Everything else on the
    // game and the world is the real thing (functions bound to it).
    this.game = scorchedGame(d.game);
    this._auraAcc = 0;
    this._gritAcc = 0;
    this._boltAcc = 0;
    this._trailAcc = 0;
    this._gatherAcc = 0;
    this._stoneAcc = 0;
    this._beamAcc = 0;
    this._splashAcc = 0;
    this._clashAcc = 0;
    this._chargeAcc2 = 0;
    this._pillarAcc = 0;
    this._storm = 0; // > 0 while lightning draws: its lights are storm white, not gold
    this._lights = new Map(); // key -> { L, t } lights kept alive by being asked for every frame
    this._split = { alive: false, x: 0, y: 0, z: 0, dx: 1, dz: 0, len: 10, form: 3, t: 0, last: 0 };
    this._pillar = { alive: false, x: 0, z: 0, t: 0, T: 1, H: 9, form: 2 };
    this._ac = { x: 0, y: 0, z: 0 };
    this._bv = { x: 0, y: 0, z: 0 };
    for (const n of ASC_DRAW) {
      const f = this[n];
      if (typeof f !== 'function') continue;
      this[n] = function (a, b, c, d2, e, f2, g, h, i, j, k, l) {
        this._drawing++;
        try {
          return f.call(this, a, b, c, d2, e, f2, g, h, i, j, k, l);
        } finally {
          this._drawing--;
        }
      };
    }
  }

  /** The look of switch `name` now (?ascAura= ?ascBeam=; the Lord's own names go to his table). */
  look(name) {
    return ASC_LOOKS[name] !== undefined ? look(name) : super.look(name);
  }

  reset() {
    super.reset();
    this._split.alive = false;
    this._pillar.alive = false;
    for (const v of this._lights.values()) v.L?.kill?.();
    this._lights.clear();
  }

  /** Called lightning (LordFx's). While he is up in the air (Heaven's Volley) a strike rolled through
   *  perfectly is a roll, not the hero's counter: there is nobody on the ground to Ghostep to, and he
   *  cannot be struck up there (the move's own rule). */
  updateStrikes(dt, d) {
    if (!(d?.position?.y > 0.6) || typeof d.hitPlayer !== 'function') return super.updateStrikes(dt, d);
    const own = Object.prototype.hasOwnProperty.call(d, 'hitPlayer'), orig = d.hitPlayer;
    d.hitPlayer = (this._airHit ??= (o) => orig.call(d, { ...o, extra: { ...(o.extra ?? null), perfect: false, plunge: false } }));
    try {
      return super.updateStrikes(dt, d);
    } finally {
      if (own) d.hitPlayer = orig;
      else delete d.hitPlayer;
    }
  }

  update(dt, d) {
    super.update(dt, d);
    const fdt = this.game.fxDt ?? dt;
    if (this._split.alive) drawSplit(this, this._split, fdt);
    if (this._pillar.alive) this._drawPillar(this._pillar, fdt);
    // the kept lights: one not asked for this frame goes out
    const now = this._now();
    for (const [key, v] of this._lights) {
      if (now - v.t > 0.07 || v.L?.dead) {
        v.L?.kill?.();
        this._lights.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------- colour: the level's gold
  /** A light. The inherited draws name the Lord's violet: here it is his gold, or storm white while
   *  lightning draws. */
  _light(o) {
    if (o && violet(o.color)) o.color = this._storm > 0 ? L_STORM : L_GOLD;
    return super._light(o);
  }

  /** A glyph particle: the inherited draws' violet motes and sparks are gold (storm white in a bolt). */
  _spawn(pool, o) {
    if (o) {
      if (violet(o.color)) o.color = this._storm > 0 ? STORM : GLYPH_GOLD;
      if (violet(o.colorEnd)) o.colorEnd = this._storm > 0 ? STORM_END : GLYPH_GOLD_END;
    }
    super._spawn(pool, o);
  }

  /** Lightning (LordFx's: steel strokes in a sheath of the void slot = gold here): its light and
   *  sparks are storm white. */
  lightning(ax, ay, az, bx, by, bz, k = 1, lit = true, gold = false) {
    this._storm++;
    try {
      return super.lightning(ax, ay, az, bx, by, bz, k, lit, gold);
    } finally {
      this._storm--;
    }
  }

  _now() {
    const g = this.game;
    return g.realTime ?? g.time ?? 0;
  }

  /** A light kept alive while it is asked for every frame (it goes out a frame after the last ask). */
  _keep(key, x, y, z, color, intensity, radius, flicker = 0) {
    if (!Number.isFinite(x + y + z + intensity)) return null;
    let v = this._lights.get(key);
    if (!v || v.L?.dead) {
      const L = super._light({ x, y, z, color, intensity, radius, flicker, fade: 0.15 });
      if (!L) return null;
      v = { L, t: 0 };
      this._lights.set(key, v);
    }
    v.t = this._now();
    const L = v.L;
    L.x = x;
    L.y = y;
    L.z = z;
    L.color = color;
    L.intensity = intensity;
    L.radius = radius;
    return L;
  }

  /** The unit vector toward the camera (from the camera's axes). */
  _toCam() {
    const A = this._axes(), B = this._bv;
    B.x = A.ry * A.uz - A.rz * A.uy;
    B.y = A.rz * A.ux - A.rx * A.uz;
    B.z = A.rx * A.uy - A.ry * A.ux;
    return B;
  }

  /** A world unit vector ACROSS the segment a → b as the camera sees it (in the camera's plane). */
  _across(dx, dy, dz) {
    const A = this._axes(), C = this._ac;
    const sx = dx * A.rx + dy * A.ry + dz * A.rz, sy = dx * A.ux + dy * A.uy + dz * A.uz, sl = Math.hypot(sx, sy) || 1;
    const cx = -sy / sl, cy = sx / sl;
    C.x = A.rx * cx + A.ux * cy;
    C.y = A.ry * cx + A.uy * cy;
    C.z = A.rz * cx + A.uz * cy;
    return C;
  }

  /** His chest (the hurt sphere of his body, or 1.25 m over his feet). */
  _chest(d) {
    const c = d?._hs?.[1];
    if (c && Number.isFinite(c.x + c.y + c.z)) return c;
    const P = (this._cp ??= { x: 0, y: 0, z: 0 });
    P.x = d?.position?.x ?? 0;
    P.y = 1.25;
    P.z = d?.position?.z ?? 0;
    return P;
  }

  // ---------------------------------------------------------------- the aura
  /**
   * Every frame after his pose: the aura of his form. Form 1: none. Forms 2 and 3 (?ascAura=a|b|c):
   * gold heat standing round him and streaming up, spawned BEHIND him as the camera sees him (the
   * field's depth fade hides heat a body covers, so it licks round his outline and never covers his
   * limbs), grit and small stones lifting round his feet; form 3 tighter, taller, brighter, with
   * blue-white lightning crawling over him and snapping to the floor. ~60 - 160 blobs alive.
   */
  formAura(d, dt, form) {
    if (!d?.position || !this.fire || !(form >= 2) || !(dt > 0)) return;
    if (d.mode === 'dead' || d.mode === 'sleep') return;
    const x = d.position.x, z = d.position.z;
    if (!Number.isFinite(x + z)) return;
    const f3 = form >= 3, t = d.time ?? this._now(), A = this._axes(), B = this._toCam();
    const L = look('ascAura');
    // behind him: 0.7 m away from the camera
    const ox = x - B.x * 0.7, oy = -B.y * 0.7, oz = z - B.z * 0.7;
    const H = 2.05;
    if (L === 'b') this._auraSheath(d, dt, f3, ox, oy, oz, H, A, B, t);
    else if (L === 'c') this._auraBlaze(dt, f3, x, z, ox, oy, oz, H, A, t);
    else this._auraFlame(dt, f3, x, z, ox, oy, oz, H, A, t);
    // grit and small stones lifting round his feet (all three)
    this._gritAcc += dt * (f3 ? 22 : 15);
    while (this._gritAcc >= 1) {
      this._gritAcc -= 1;
      const a = this.lr() * TAU, r = this.lrand(0.5, L === 'c' ? 2.4 : 1.9), stone = this.lr() < 0.22;
      const o = this._rec(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, this.lrand(0.7, 1.3), stone ? 0.2 : 0.16, 0.08, stone ? '#%&' : ",.'`", stone ? STONE : DUSTC, DUST_END);
      o.vx = L === 'c' ? -Math.sin(a) * 1.6 : 0;
      o.vz = L === 'c' ? Math.cos(a) * 1.6 : 0;
      o.vy = this.lrand(0.9, 2.2) * (stone ? 0.6 : 1) * (f3 ? 1.3 : 1);
      o.drag = 0.8;
      o.alpha = 0.85;
      o.spin = this.lrand(-2, 2);
      this._spawn(this.alpha, o);
    }
    // form 3: lightning crawling over him, snapping to the floor
    if (f3) {
      const c = this._chest(d);
      this._boltAcc += dt * 9;
      while (this._boltAcc >= 1) {
        this._boltAcc -= 1;
        if (this.lr() < 0.68) {
          const sx = this.lrand(-0.45, 0.45), sy = this.lrand(-0.9, 0.7);
          this.arc(c.x + A.rx * sx * 0.4, c.y + sy * 0.5, c.z + A.rz * sx * 0.4, c.x + A.rx * sx, c.y + sy, c.z + A.rz * sx, 0.3, null, null, 3);
        } else {
          const a = this.lr() * TAU, r = this.lrand(0.9, 1.9);
          this.arc(c.x + this.lrand(-0.2, 0.2), c.y + this.lrand(-0.6, 0.3), c.z + this.lrand(-0.2, 0.2), x + Math.cos(a) * r, GROUND_Y, z + Math.sin(a) * r, 0.32, null, null, 5);
          const o = this._rec(x + Math.cos(a) * r, 0.25, z + Math.sin(a) * r, this.lrand(0.15, 0.3), 0.15, 0.04, "+'*", STORM, STORM_END);
          o.vy = this.lrand(1, 3);
          o.vx = this.lrand(-2, 2);
          o.vz = this.lrand(-2, 2);
          o.drag = 3;
          this._spawn(this.add, o);
        }
      }
    }
    this._keep('aura', x, 1.3, z, f3 ? L_STORM : L_GOLD, f3 ? 2.0 : 1.5, f3 ? 7 : 6, f3 ? 0.35 : 0.12);
  }

  /** ?ascAura=a: a tall flame standing round him, its tongues drawn in to a point above his head. */
  _auraFlame(dt, f3, x, z, ox, oy, oz, H, A, t) {
    const W = f3 ? 0.66 : 0.86, up = f3 ? 1.3 : 1, hk = f3 ? 1.2 : 1;
    this._auraAcc += dt * (f3 ? 135 : 105);
    while (this._auraAcc >= 1) {
      this._auraAcc -= 1;
      // (hollow behind him: the flame stands round his outline, so its tongues do not lick over his body)
      const s = (this.lr() < 0.5 ? -1 : 1) * this.lrand(0.3, W), h = this.lrand(0.05, H * 0.92), edge = Math.abs(s) / W;
      this._blob(ox + A.rx * s, oy + h, oz + A.rz * s, -A.rx * s * 0.22, this.lrand(2.2, 4.2) * up, -A.rz * s * 0.22, this.lrand(0.5, 0.9) * (f3 ? 1.1 : 1), f3 ? 0.7 : 0.82, f3 ? 0.3 : 0.36, (0.15 + 0.1 * edge) * hk, 0.07, K_VOID, 0.6, 1.4);
    }
    // the tip: tongues licking up off the top of the flame
    this._trailAcc += dt * (f3 ? 22 : 15);
    while (this._trailAcc >= 1) {
      this._trailAcc -= 1;
      const s = this.lrand(-0.3, 0.3);
      this._blob(ox + A.rx * s, oy + H * this.lrand(0.85, 1.05), oz + A.rz * s, -A.rx * s, this.lrand(3.5, 6) * up, -A.rz * s, this.lrand(0.3, 0.5), 0.46, 0.2, 0.34 * hk, 0.05, K_VOID, 0.4, 1);
    }
    // the wheel on the floor: a ring of gold, four hotter spokes of it turning
    this._ring(x, GROUND_Y, z, f3 ? 1.25 : 1.45, f3 ? 30 : 34, 0.42, (f3 ? 0.5 : 0.44) * GROUND_GAIN, K_VOID, 4, t * (f3 ? 2.2 : 1.4));
  }

  /** ?ascAura=b: a tight sheath along his outline and long streamers climbing off his shoulders. */
  _auraSheath(d, dt, f3, ox, oy, oz, H, A, B, t) {
    const n = this._bodyPts(d), P = this._gp, x = d.position.x, z = d.position.z, hk = f3 ? 1.25 : 1;
    if (n >= 12) {
      this._auraAcc += dt * (f3 ? 170 : 140);
      while (this._auraAcc >= 1) {
        this._auraAcc -= 1;
        const i = Math.floor(this.lr() * n) * 3;
        const px = P[i], py = P[i + 1], pz = P[i + 2];
        // pushed behind him and a little out from his middle on screen: a rim round the figure
        const sx = (px - x) * A.rx + (pz - z) * A.rz, out = sx >= 0 ? 0.2 : -0.2;
        this._blob(px - B.x * 0.4 + A.rx * out, py - B.y * 0.4 + 0.05, pz - B.z * 0.4 + A.rz * out, A.rx * out, this.lrand(0.8, 1.7) * (f3 ? 1.3 : 1), A.rz * out, this.lrand(0.25, 0.42), 0.42, 0.22, 0.6 * hk, 0.05, K_VOID, 0.5, 0.8);
      }
    }
    // the streamers: five, swaying, off his shoulders and head
    this._trailAcc += dt * (f3 ? 110 : 85);
    while (this._trailAcc >= 1) {
      this._trailAcc -= 1;
      const j = Math.floor(this.lr() * 5), s = (j - 2) * 0.24 + 0.08 * Math.sin(t * 3 + j * 1.7);
      this._blob(ox + A.rx * s, oy + this.lrand(1.35, 1.85), oz + A.rz * s, A.rx * s * 0.3, this.lrand(6, 8) * (f3 ? 1.3 : 1), A.rz * s * 0.3, this.lrand(0.42, 0.6), 0.44, 0.2, 0.62 * hk, 0.12, K_VOID, 0, 1.5);
    }
    this._ring(x, GROUND_Y, z, 0.9, 20, 0.38, 0.42 * GROUND_GAIN, K_VOID, 3, t * 1.8);
  }

  /** ?ascAura=c: a broad low blaze flaring out to his sides over a wide wheel that spins. */
  _auraBlaze(dt, f3, x, z, ox, oy, oz, H, A, t) {
    const W = f3 ? 1.25 : 1.45, hk = f3 ? 1.2 : 1;
    this._auraAcc += dt * (f3 ? 125 : 100);
    while (this._auraAcc >= 1) {
      this._auraAcc -= 1;
      const s = this.lrand(-W, W), h = this.lrand(0.05, f3 ? 1.6 : 1.25);
      this._blob(ox + A.rx * s, oy + h, oz + A.rz * s, A.rx * s * 0.7, this.lrand(0.9, 2.0) * (f3 ? 1.3 : 1), A.rz * s * 0.7, this.lrand(0.4, 0.7), 0.8, 0.38, 0.4 * hk, 0.08, K_VOID, 0.8, 0.8);
    }
    const sp = t * (f3 ? 5.5 : 3.8);
    this._ring(x, GROUND_Y, z, 1.95, 44, 0.42, 0.48 * GROUND_GAIN * hk, K_VOID, 6, sp);
    this._ring(x, GROUND_Y, z, 1.1, 24, 0.38, 0.42 * GROUND_GAIN * hk, K_VOID, 3, -sp * 1.4);
    if (f3 && this.lr() < dt * 6) {
      const a = this.lr() * TAU;
      this.arc(x + Math.cos(a) * 1.95, GROUND_Y, z + Math.sin(a) * 1.95, x + Math.cos(a + 0.6) * 1.1, GROUND_Y, z + Math.sin(a + 0.6) * 1.1, 0.3, null, null, 3);
    }
  }

  // ---------------------------------------------------------------- blows
  /** A blow's trail off a fist, a foot, an elbow or a knee: the limb's point last frame → now. Form
   *  1 a faint pale smear and dust; forms 2 - 3 a gold streak (a white edge in form 3); heavier for
   *  `heavy`. ~6 - 20 blobs a frame of the blow. */
  limbTrail(ax, ay, az, bx, by, bz, form, heavy) {
    if (!this.fire || !Number.isFinite(ax + ay + az + bx + by + bz)) return;
    const dx = bx - ax, dy = by - ay, dz = bz - az, st = Math.hypot(dx, dy, dz);
    if (!(st > 0.03 && st < 4)) return;
    const hv = heavy ? 1 : 0;
    if (!(form >= 2)) {
      this._ink(ax, ay, az, bx, by, bz, this.lrand(0.14, 0.2), heavy ? 0.62 : 0.42, 0, heavy ? 0.7 : 0.5, 1);
      const n = Math.max(1, Math.round(st / 0.3));
      for (let i = 0; i < n; i++) {
        const u = (i + this.lr()) / n;
        this._blob(ax + dx * u, Math.max(0.75, ay + dy * u), az + dz * u, this.lrand(-0.2, 0.2), this.lrand(0.1, 0.4), this.lrand(-0.2, 0.2), this.lrand(0.3, 0.5), 0.34, 0.6, 0.32 + 0.1 * hv, 0, K_SMOKE, 1.5);
      }
      if (heavy && this.lr() < 0.5) {
        const o = this._rec(bx, by, bz, this.lrand(0.3, 0.6), 0.16, 0.06, GRIT_S, DUSTC, DUST_END);
        o.vx = dx * 4 + this.lrand(-1, 1);
        o.vy = this.lrand(-0.5, 1);
        o.vz = dz * 4 + this.lrand(-1, 1);
        o.drag = 3;
        o.gravity = -4;
        this._spawn(this.alpha, o);
      }
      return;
    }
    const f3 = form >= 3;
    this._ink(ax, ay, az, bx, by, bz, this.lrand(0.15, 0.2), f3 ? 1.15 : 0.75, 0, f3 ? 1.15 : 0.85, 1);
    const n = Math.min(14, Math.max(1, Math.ceil(st / 0.12)));
    for (let i = 0; i < n; i++) {
      const u = (i + this.lr() * 0.6) / n;
      this._blob(ax + dx * u, ay + dy * u, az + dz * u, this.lrand(-0.2, 0.2), this.lrand(0.1, 0.6), this.lrand(-0.2, 0.2), this.lrand(0.16, 0.26) * (1 + 0.4 * hv), heavy ? 0.5 : 0.38, 0.2, (heavy ? 0.5 : 0.38) * (f3 ? 1.15 : 1), 0, K_VOID, 1.5, 0.8);
    }
    if (this.lr() < (heavy ? 0.8 : 0.35)) {
      const o = this._rec(bx, by, bz, this.lrand(0.2, 0.4), 0.14, 0.04, "'+.", f3 ? WHITE : GOLD, GOLD_END);
      o.vx = dx * 5 + this.lrand(-1.5, 1.5);
      o.vy = this.lrand(-0.5, 1.5);
      o.vz = dz * 5 + this.lrand(-1.5, 1.5);
      o.drag = 3;
      this._spawn(this.add, o);
    }
  }

  /** A palm's flash as a blast leaves it, along (dx, dz); `k` its size (1 a blast, 1.4 the Spirit
   *  Shot). A disc of light at the palm, a fan of strokes thrown forward, sparks. ~50 blobs, once. */
  muzzle(x, y, z, dx, dz, k = 1, form = 1) {
    if (!this.fire || !Number.isFinite(x + y + z + dx + dz + k)) return;
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, base = Math.atan2(uz, ux);
    const P = this._toCamera(x, y, z), A = this._axes(), px = P.x, py = P.y, pz = P.z;
    const R = 0.34 * k;
    for (let i = 0; i < 12; i++) {
      const rr = R * Math.sqrt((i + 0.5) / 12), a = i * 2.39996, ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
      this._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, ux * 2, 0, uz * 2, 0.12, R * 0.8, R * 1.4, 0.75, 0, K_VOID, 3);
    }
    // (no white star: a white cross or star on the field is a CUE; the palm's flash stays gold)
    this._blob(px, py, pz, 0, 0, 0, 0.1, 0.3 * k, 0.45 * k, 1.05, 0, K_VOID);
    for (let i = -3; i <= 3; i++) {
      const a = base + (i / 3) * 0.55 + this.lrand(-0.08, 0.08), len = this.lrand(0.6, 1.1) * k * (1 - 0.15 * Math.abs(i));
      this._ink(x + Math.cos(a) * 0.2, y + this.lrand(-0.1, 0.1), z + Math.sin(a) * 0.2, x + Math.cos(a) * len, y + this.lrand(-0.2, 0.2), z + Math.sin(a) * len, this.lrand(0.08, 0.12), 0.5, 0, 0.3, 0, K_VOID);
    }
    for (let i = 0; i < 8; i++) {
      const a = base + this.lrand(-0.6, 0.6), sp = this.lrand(5, 10);
      this._blob(x, y, z, Math.cos(a) * sp, this.lrand(-0.5, 1), Math.sin(a) * sp, this.lrand(0.12, 0.2), 0.42 * k, 0.2, 0.5, 0, K_VOID, 4);
    }
    for (let i = 0; i < 9; i++) {
      const a = base + this.lrand(-0.9, 0.9), sp = this.lrand(3, 9);
      const o = this._rec(x, y, z, this.lrand(0.18, 0.36), this.lrand(0.12, 0.2), 0.04, "+*'", form >= 3 ? WHITE : GOLD, GOLD_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(-1, 2.5);
      o.vz = Math.sin(a) * sp;
      o.drag = 3.5;
      this._spawn(this.add, o);
    }
    super._light({ x, y, z, color: L_GOLD, intensity: 2 * k, radius: 5 * k, life: 0.14, fade: 0.12 });
  }

  // ---------------------------------------------------------------- the beam (fxBeam.js draws it)
  /** Energy gathering in the drawn-back palm through a beam's windup (u 0..1): motes drawn in, a
   *  bulb growing, coils of light round it, the floor lit; arcs to the floor late. ~40 - 90 blobs. */
  beamCharge(x, y, z, u, dt, form = 1) {
    if (!this.fire || !Number.isFinite(x + y + z + u) || !(dt >= 0)) return;
    drawBeamCharge(this, x, y, z, clamp01(u), dt, form);
  }

  /** The lit beam this frame: muzzle a → end b, `w` m wide (1.4 - 3.4), `k` 0..1 its strength (it
   *  fades out by k). ?ascBeam=a|b. ~250 - 700 blobs a frame (the great beam at 26 m). */
  beam(ax, ay, az, bx, by, bz, w, k, dt, form = 1) {
    if (!this.fire || !Number.isFinite(ax + ay + az + bx + by + bz + w + k) || !(k > 0.01)) return;
    drawBeam(this, ax, ay, az, bx, by, bz, Math.max(0.4, w), clamp01(k), Math.max(0, fin(dt)), form);
  }

  /** Where the beam ends on something this frame (the floor, a butte, a guard). ~40 blobs. */
  beamSplash(x, y, z, k, dt, form = 1) {
    if (!this.fire || !Number.isFinite(x + y + z + k) || !(k > 0.01)) return;
    drawBeamSplash(this, x, y, z, clamp01(k), Math.max(0, fin(dt)), form);
  }

  /** The beam clash: the beam's head grinding on the hero's blade at (x, y, z), the beam running
   *  along (dx, dz); `k` = the struggle's meter 0..1 (1: the hero is winning: the head is pushed
   *  back, the light parts round the blade). ~80 blobs. */
  beamClash(x, y, z, dx, dz, k, dt, form = 3) {
    if (!this.fire || !Number.isFinite(x + y + z + dx + dz + k)) return;
    drawBeamClash(this, x, y, z, dx, dz, clamp01(k), Math.max(0, fin(dt)), form);
  }

  /** The clash won: the beam split in two round (x, z), on for `len` m along (dx, dz). Call once (it
   *  burns on and fades ~0.9 s) or every frame while it lasts (it holds). */
  beamSplit(x, y, z, dx, dz, len, form = 3) {
    if (!Number.isFinite(x + y + z + dx + dz + len)) return;
    const S = this._split, l = Math.hypot(dx, dz) || 1, fresh = !S.alive;
    S.alive = true;
    S.x = x;
    S.y = y;
    S.z = z;
    S.dx = dx / l;
    S.dz = dz / l;
    S.len = Math.max(2, len);
    S.form = form;
    S.last = 0; // s since the last call
    if (fresh) {
      S.t = 0;
      this._splitBurst(S);
    }
  }

  _splitBurst(S) {
    const A = this._axes(), P = this._toCamera(S.x, S.y, S.z), px = P.x, py = P.y, pz = P.z;
    for (let i = 0; i < 26; i++) {
      const a = this.lr() * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = this.lrand(5, 11);
      const ux = A.rx * ca + A.ux * sa, uy = A.ry * ca + A.uy * sa, uz = A.rz * ca + A.uz * sa;
      this._blob(px + ux * 0.2, py + uy * 0.2, pz + uz * 0.2, ux * sp, uy * sp, uz * sp, this.lrand(0.14, 0.24), 0.28, 0.2, 0.75, 0, K_STEEL, 5);
    }
    for (let i = 0; i < 24; i++) {
      const a = this.lr() * TAU, sp = this.lrand(3, 10);
      const o = this._rec(S.x, S.y, S.z, this.lrand(0.3, 0.7), this.lrand(0.14, 0.22), 0.04, "+*'", i & 1 ? WHITE : GOLD, GOLD_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(0, 5);
      o.vz = Math.sin(a) * sp;
      o.drag = 2.5;
      o.gravity = -5;
      this._spawn(this.add, o);
    }
    super._light({ x: S.x, y: S.y + 0.4, z: S.z, color: L_GOLD, intensity: 7, radius: 12, life: 0.5, fade: 0.4 });
  }

  // ---------------------------------------------------------------- the vanish
  /** He vanishes at (x0, z0) and is at (x1, z1): the shape he leaves (printed from his own body),
   *  the streak between, a puff at each end. Form 1 pale dust; forms 2 - 3 gold (form 3: a crack of
   *  lightning along the streak). ~200 - 330 blobs, once. Call it before or after he is moved: the
   *  shape is printed at (x0, z0) either way. */
  vanish(d, x0, z0, x1, z1, form = 1) {
    if (!Number.isFinite(x0 + z0 + x1 + z1)) return;
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ux = len > 1e-3 ? dx / len : 0, uz = len > 1e-3 ? dz / len : 0;
    const gx = d?.position ? x0 - d.position.x : 0, gz = d?.position ? z0 - d.position.z : 0;
    if (form >= 2) {
      if (d) this._ghostGold(d, ux * 1.6, uz * 1.6, 0.6, gx, gz, false, form);
      const n = Math.min(30, Math.max(3, Math.round(len / 0.35)));
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        for (let h = 0; h < 3; h++) this._blob(x0 + dx * u + this.lrand(-0.12, 0.12), 0.75 + h * 0.55, z0 + dz * u + this.lrand(-0.12, 0.12), ux * 1.5, this.lrand(0, 0.4), uz * 1.5, this.lrand(0.14, 0.26) + 0.12 * u, 0.42, 0.22, 0.22 + 0.32 * u, 0, K_VOID, 1, 0.6);
      }
      for (let i = 0; i < 2; i++) this._ink(x0 + dx * 0.25, 0.95 + i * 0.6, z0 + dz * 0.25, x1, 0.95 + i * 0.6, z1, this.lrand(0.14, 0.2), 0.2, 0, i ? 0.9 : 1.15);
      if (form >= 3 && len > 1) this.lightning(x0 + dx * 0.2, 1.2, z0 + dz * 0.2, x1, 1.1, z1, 0.65, false);
      // where he stood: the air falls in; where he is: a ring thrown out
      for (let i = 0; i < 12; i++) {
        const a = this.lr() * TAU, r = this.lrand(0.8, 1.5), h = this.lrand(0.3, 2.1), lf = this.lrand(0.14, 0.26);
        const o = this._rec(x0 + Math.cos(a) * r, h, z0 + Math.sin(a) * r, lf, 0.16, 0.05, "-'", GOLD, GOLD_END);
        o.vx = (-Math.cos(a) * r) / lf;
        o.vy = (1.2 - h) / lf;
        o.vz = (-Math.sin(a) * r) / lf;
        o.alpha = 0.4;
        o.alphaEnd = 1;
        this._spawn(this.add, o);
      }
      this._shock(x1, 0.85, z1, 1.8, 22, 0.22, 0.42, 0.75, 0.55, K_VOID, 0.25, 4);
      super._light({ x: x1, y: 1.2, z: z1, color: form >= 3 ? L_STORM : L_GOLD, intensity: 3.2, radius: 6, life: 0.2, fade: 0.18 });
    } else {
      if (d) this.ghost(d, this._ghostOpt(ux * 1.4, uz * 1.4, 0.55, 0, gx, gz));
      for (let i = 0; i < 3; i++) {
        const y = 0.6 + i * 0.5, w = i === 1 ? 1 : 0.6;
        this._ink(x0 + dx * 0.3, y, z0 + dz * 0.3, x1, y, z1, this.lrand(0.16, 0.26), 0.15 * w, 0, 0.85 * w);
      }
    }
    this.dust(x0, z0, form >= 2 ? 0.9 : 0.7);
    this.dust(x1, z1, form >= 2 ? 1.1 : 0.9);
  }

  /** THE SIGN's snap (the third wave): the moment he goes, at the two fingers on his brow: a crisp
   *  flash the size of a hand, strokes thrown out of it, a small ring of air, a short light; pale in
   *  form 1, gold from form 2, storm-white in form 3. ~20 blobs, once (the vanish's streak follows). */
  signSnap(x, y, z, form = 1) {
    if (!Number.isFinite(x + y + z)) return;
    const gold = form >= 2, storm = form >= 3;
    const col = storm ? STORM : gold ? GOLD : PALE, end = storm ? STORM_END : gold ? GOLD_END : DUST_END, kind = gold ? K_VOID : K_STEEL;
    const P = this._toCamera(x, y, z);
    this._blob(P.x, P.y, P.z, 0, 0, 0, 0.1, 0.2, 0.5, 1.5, 0, K_STEEL);
    this._blob(P.x, P.y, P.z, 0, 0, 0, 0.18, 0.3, 0.7, gold ? 0.6 : 0.35, 0, kind);
    for (let i = 0; i < 7; i++) {
      const a = this.lr() * TAU, sp = this.lrand(1.5, 3.5);
      const o = this._rec(x, y, z, this.lrand(0.14, 0.26), 0.12, 0.03, "*'", i & 1 ? WHITE : col, end);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(-0.5, 1.6);
      o.vz = Math.sin(a) * sp;
      o.drag = 4;
      this._spawn(this.add, o);
    }
    this._shock(x, y, z, 0.7, 10, 0.16, 0.3, 0.5, gold ? 0.5 : 0.3, kind, 0.2, 4);
    super._light({ x, y, z, color: storm ? L_STORM : gold ? L_GOLD : L_PALE, intensity: 2.4, radius: 4, life: 0.14, fade: 0.12 });
  }

  /** The counter stance (a beat marked `catch`, every frame he is catching): light drawn INTO his
   *  open palms, the reverse of a muzzle: motes converging on each hand out of the air round it and a
   *  soft heat on the palm; pale in form 1, gold later. ~10 blobs a frame. */
  stanceGlow(d, dt, form = 1) {
    if (!d?.tellPoint || !(dt > 0)) return;
    const gold = form >= 2, kind = gold ? K_VOID : K_STEEL, col = form >= 3 ? STORM : gold ? GOLD : PALE, end = gold ? GOLD_END : DUST_END;
    const life = this._frame(), v = d._v2 ?? d._q;
    if (!v?.set) return;
    const R = d.tellPoint('fistR', v);
    const rx = R.x, ry = R.y, rz = R.z;
    const L = d.tellPoint('fistL', v);
    const lx = L.x, ly = L.y, lz = L.z;
    if (!Number.isFinite(rx + ry + rz + lx + ly + lz)) return;
    if (life > 0) {
      for (const [x, y, z] of [[rx, ry, rz], [lx, ly, lz]]) {
        const P = this._toCamera(x, y, z);
        this._blob(P.x, P.y, P.z, 0, 0, 0, life, 0.24, 0.24, gold ? 0.55 : 0.4, gold ? 0.55 : 0.4, kind);
        this._blob(P.x, P.y, P.z, 0, 0, 0, life, 0.12, 0.12, 1.0, 1.0, K_STEEL);
      }
    }
    this._stanceAcc = (this._stanceAcc ?? 0) + dt * 34;
    while (this._stanceAcc >= 1) {
      this._stanceAcc -= 1;
      const right = this.lr() < 0.5, x = right ? rx : lx, y = right ? ry : ly, z = right ? rz : lz;
      const a = this.lr() * TAU, r = this.lrand(0.5, 1.0), h = this.lrand(-0.5, 0.5), lf = this.lrand(0.16, 0.26);
      const mx = x + Math.cos(a) * r, my = y + h, mz = z + Math.sin(a) * r;
      const o = this._rec(mx, my, mz, lf, 0.12, 0.04, ".'", col, end);
      o.vx = (x - mx) / lf;
      o.vy = (y - my) / lf;
      o.vz = (z - mz) / lf;
      o.alpha = 0.3;
      o.alphaEnd = 1;
      this._spawn(this.add, o);
    }
  }

  /** The shape he leaves behind as a dash starts: a light afterimage (pale in form 1, gold later)
   *  and dust at his feet. ~100 - 150 blobs, once. */
  dashGhost(d, form = 1) {
    if (!d?.position || !Number.isFinite(d.position.x + d.position.z)) return;
    const yaw = d.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (form >= 2) this._ghostGold(d, -fx * 0.8, -fz * 0.8, 0.45, 0, 0, true, form);
    else this.ghost(d, this._ghostOpt(-fx * 0.8, -fz * 0.8, 0.45, 1));
    this.dust(d.position.x, d.position.z, 0.8);
  }

  /** An afterimage of him printed from his body's own points (DuelFx.ghost's recipe) in GOLD: a
   *  hotter core down his middle, coming apart from the feet up, gold wisps rising off it. */
  _ghostGold(d, dx, dz, life0, ox, oz, light, form) {
    if (!d || !this.fire) return 0;
    const n = this._bodyPts(d), P = this._gp;
    if (n < 12) return 0;
    const S = this._screen(d.position.x, 1, d.position.z), mpp = S.mpp, cell = S.cw * mpp, D = 12 * mpp, A = this._axes();
    const q = 1 / Math.max(0.02, cell), cells = this._gCells, step = light ? 2 : 1, hk = form >= 3 ? 1.1 : 1;
    let y0 = Infinity, s0 = Infinity, s1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      y0 = Math.min(y0, P[k + 1]);
      const sx = P[k] * A.rx + P[k + 1] * A.ry + P[k + 2] * A.rz;
      s0 = Math.min(s0, sx);
      s1 = Math.max(s1, sx);
    }
    const sMid = (s0 + s1) / 2, sHalf = Math.max(0.1, (s1 - s0) / 2);
    cells.clear();
    let spent = 0;
    for (let i = 0; i < n; i += step) {
      const px = P[i * 3] + ox, py = P[i * 3 + 1], pz = P[i * 3 + 2] + oz;
      const sx = px * A.rx + py * A.ry + pz * A.rz, sy = px * A.ux + py * A.uy + pz * A.uz;
      const cx = Math.round(sx * q), cy = Math.round(sy * q * (S.cw / S.ch));
      const key = (cx & 0xffff) * 65536 + (cy & 0xffff);
      if (cells.has(key)) continue;
      cells.add(key);
      const h = clamp01((py - y0) / 1.9);
      const lf = life0 * (0.55 + 0.6 * h) + this.lrand(0.06, 0.16);
      const core = Math.abs(sx - ox * A.rx - oz * A.rz - sMid) < 0.42 * sHalf;
      const vx = dx * this.lrand(0.1, 0.5), vy = this.lrand(0.1, 0.5), vz = dz * this.lrand(0.1, 0.5);
      const hh = (light ? 0.3 : 0.36) * (core ? 1.45 : 1) * hk * this.lrand(0.9, 1.15);
      this._blob(px, py, pz, vx, vy, vz, lf, D * 1.3, D * 0.8, hh, 0, K_VOID, 1, 0.3);
      spent++;
      if (spent % 4 === 0) {
        this._blob(px, Math.max(0.75, py), pz, vx * 0.6, vy + this.lrand(0.6, 1.4), vz * 0.6, lf * 1.2, 0.34, 0.16, 0.3, 0, K_VOID, 0.6, 1);
        spent++;
      }
    }
    return spent;
  }

  // ---------------------------------------------------------------- bursts
  /** A shock ring thrown out from his body to `r` m (Aura Burst; a landing): a flash of light off his
   *  body, a front of gold heat (dust in form 1) with grit, a crisp ripple at his waist, strokes
   *  thrown out, sparks; form 3 bolts along the floor. ~250 - 420 blobs, once. */
  auraBurst(x, z, r, form = 2) {
    if (!Number.isFinite(x + z + r) || !(r > 0)) return;
    const f2 = form >= 2, f3 = form >= 3, A = this._axes();
    this.shock(x, z, r, this._opt(1.3, f2 ? 0.85 : 0.1, f2 ? 'void' : 'dust', 0, true));
    this._airRipple(x, z, 1.15, 0.6, r * 1.05, 0.34 + 0.03 * r, 0.62, 0.42, 0.3, 0.25);
    const P = this._toCamera(x, 1.2, z), px = P.x, py = P.y, pz = P.z;
    for (let i = 0; i < 18; i++) {
      const rr = 1.0 * Math.sqrt((i + 0.5) / 18), a = i * 2.39996, ox = Math.cos(a) * rr, oy = Math.sin(a) * rr * 1.3;
      this._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, 0, 0, 0, 0.14, 0.7, 1.3, f2 ? 0.6 : 0.4, 0, f2 ? K_VOID : K_STEEL);
    }
    this._blob(px, py, pz, 0, 0, 0, 0.12, 0.5, 0.9, 1.8, 0, K_STEEL);
    for (let i = 0; i < 26; i++) {
      const a = this.lr() * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = this.lrand(7, 12);
      this._blob(x + ca * 0.6, this.lrand(0.8, 1.6), z + sa * 0.6, ca * sp, this.lrand(-0.5, 0.8), sa * sp, this.lrand(0.16, 0.26), 0.28, 0.22, 0.7, 0, K_STEEL, 4);
    }
    for (let i = 0; i < 18; i++) {
      const a = this.lr() * TAU, sp = this.lrand(3, 9);
      const o = this._rec(x, 1.1, z, this.lrand(0.3, 0.6), this.lrand(0.12, 0.2), 0.04, "+*'", f3 ? STORM : f2 ? GOLD : PALE, f3 ? STORM_END : GOLD_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(0.5, 4);
      o.vz = Math.sin(a) * sp;
      o.drag = 2;
      o.gravity = -5;
      this._spawn(this.add, o);
    }
    if (f3) for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + this.lr(), rr = r * this.lrand(0.55, 0.9);
      this.lightning(x, GROUND_Y, z, x + Math.cos(a) * rr, GROUND_Y, z + Math.sin(a) * rr, 0.6, false);
    }
    super._light({ x, y: 1.3, z, color: f3 ? L_STORM : f2 ? L_GOLD : L_PALE, intensity: 5, radius: r * 1.8, life: 0.35, fade: 0.3 });
  }

  /** A heavy blow meets the floor at (x, z): dust, chips of stone, cracks of the floor lit a moment,
   *  a ground shock to `r` m; `k` its weight (1 an axe kick, 1.6 a dive). Draws only: the blow
   *  calls the world (world.impact) and the floor's own break. ~120 - 220 blobs, once. */
  crater(x, z, r, k = 1) {
    if (!Number.isFinite(x + z + r + k) || !(r > 0)) return;
    k = Math.max(0.3, Math.min(2.2, k));
    this.shock(x, z, r * 1.25, this._opt(0.7 + 0.4 * k, 0.12, 'dust', 0, k > 1.2));
    for (let i = 0, n = Math.round(16 * k); i < n; i++) {
      const a = this.lr() * TAU, sp = this.lrand(2, 7) * Math.min(1.5, k), rr = this.lrand(0, 0.5 * r);
      const o = this._rec(x + Math.cos(a) * rr, 0.2, z + Math.sin(a) * rr, this.lrand(0.5, 1.0), this.lrand(0.16, 0.26), 0.08, "#%&@,.", STONE, [0.14, 0.13, 0.12]);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(3, 8) * Math.min(1.4, k);
      o.vz = Math.sin(a) * sp;
      o.drag = 1.2;
      o.gravity = -14;
      o.spin = this.lrand(-6, 6);
      this._spawn(this.alpha, o);
    }
    // the cracks: ragged strokes run out over the floor, lit a moment
    const m = Math.round(5 + 2 * k), seed = this.lr() * 100;
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU + (hash(seed + i) - 0.5) * 0.8, L = r * (0.45 + 0.4 * hash(seed + i + 7));
      let lx = x, lz = z;
      for (let q = 1; q <= 3; q++) {
        const u = q / 3, w = (hash(seed + i * 7 + q) - 0.5) * 0.45 * r * 0.3;
        const nx = x + Math.cos(a) * L * u - Math.sin(a) * w, nz = z + Math.sin(a) * L * u + Math.cos(a) * w;
        this._ink(lx, 0.45, lz, nx, 0.45, nz, this.lrand(0.35, 0.55), 0.8 - 0.16 * q, 0, 0.7 - 0.16 * q, 1);
        lx = nx;
        lz = nz;
      }
    }
    for (let i = 0; i < Math.round(8 * k); i++) {
      const a = this.lr() * TAU, sp = this.lrand(0.6, 2.4);
      this._blob(x + Math.cos(a) * 0.5, this.lrand(0.75, 1.1), z + Math.sin(a) * 0.5, Math.cos(a) * sp, this.lrand(0.3, 1.2), Math.sin(a) * sp, this.lrand(0.8, 1.5), 0.7, 1.8, 0.55, 0, K_SMOKE, 1.5, 0.5);
    }
    this.game.world?.scorch?.burnCircle?.(x, z, r * 0.45, 0.25 * Math.min(1.5, k), 0);
  }

  // ---------------------------------------------------------------- the transformation
  /** Through the transformation's windup (u 0..1 over ~2.3 s): energy drawn in along the floor to
   *  him, stones and grit lifting all round, a column of light building behind him, cracks of light
   *  running out round his feet; `form` = the form he is becoming (3: lightning snapping round him).
   *  ~80 - 220 blobs alive. */
  transformGather(x, z, u, dt, form = 2) {
    if (!this.fire || !Number.isFinite(x + z + u) || !(dt > 0)) return;
    u = clamp01(u);
    const f3 = form >= 3, A = this._axes(), B = this._toCam(), t = this.d?.time ?? this._now();
    // energy drawn in along the floor
    this._gatherAcc += dt * (30 + 70 * u);
    while (this._gatherAcc >= 1) {
      this._gatherAcc -= 1;
      const a = this.lr() * TAU, r = this.lrand(2.2, 6.5), lf = this.lrand(0.35, 0.6);
      const sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
      this._blob(sx, 0.78, sz, (x - sx) / lf, this.lrand(0, 0.6), (z - sz) / lf, lf, 0.5, 0.3, 0.42 + 0.35 * u, 0.6, K_VOID, 0);
    }
    // stones and grit lifting
    this._stoneAcc += dt * (18 + 40 * u);
    while (this._stoneAcc >= 1) {
      this._stoneAcc -= 1;
      const a = this.lr() * TAU, r = this.lrand(1.2, 4.5), stone = this.lr() < 0.35;
      const o = this._rec(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, this.lrand(0.9, 1.6), stone ? this.lrand(0.2, 0.28) : 0.16, stone ? 0.14 : 0.06, stone ? '#%&@' : ",.'`", stone ? STONE : DUSTC, DUST_END);
      o.vy = this.lrand(0.8, 2.2) * (0.5 + u);
      o.vx = -Math.sin(a) * 0.6 * u;
      o.vz = Math.cos(a) * 0.6 * u;
      o.drag = 0.6;
      o.alpha = 0.9;
      o.spin = this.lrand(-1.5, 1.5);
      this._spawn(this.alpha, o);
    }
    // a column building behind him
    const ox = x - B.x * 0.7, oy = -B.y * 0.7, oz = z - B.z * 0.7;
    this._pillarAcc += dt * (20 + 90 * u * u);
    while (this._pillarAcc >= 1) {
      this._pillarAcc -= 1;
      const s = this.lrand(-0.7, 0.7) * (1 - 0.4 * u);
      this._blob(ox + A.rx * s, oy + this.lrand(0.1, 1.6), oz + A.rz * s, -A.rx * s * 0.6, this.lrand(2, 4) * (0.6 + u), -A.rz * s * 0.6, this.lrand(0.45, 0.85), 0.75, 0.3, 0.36 + 0.42 * u, 0.1, K_VOID, 0.4, 2);
    }
    // the floor: a wheel widening, cracks of light lengthening
    const life = this._frame();
    if (life > 0) {
      this._ring(x, GROUND_Y, z, 0.8 + 1.4 * u, Math.round(18 + 22 * u), 0.34, (0.2 + 0.25 * u) * GROUND_GAIN, K_VOID, 5, t * (1.5 + 4 * u));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + hash(i + 3.1) * 0.6, L = (0.6 + 3.2 * u) * (0.7 + 0.3 * hash(i));
        let lx = x, lz = z;
        for (let q = 1; q <= 3; q++) {
          const v = q / 3, w = (hash(i * 7 + q) - 0.5) * 0.5;
          const nx = x + Math.cos(a) * L * v - Math.sin(a) * w, nz = z + Math.sin(a) * L * v + Math.cos(a) * w;
          this._ink(lx, 0.45, lz, nx, 0.45, nz, 0, (0.5 + 0.5 * u) * (1.1 - 0.2 * q), 0, (0.5 + 0.5 * u) * (1 - 0.2 * q), q > 1 ? 1 : 0);
          lx = nx;
          lz = nz;
        }
      }
      // the heart at his chest, swelling as the change nears
      if (u > 0.55) {
        const P = this._toCamera(x, 1.25, z);
        this._dot(P.x, P.y, P.z, 0.3 + 0.5 * (u - 0.55), 0.9 + 1.4 * (u - 0.55) * (1 + 0.3 * Math.sin(t * 40)), K_STEEL);
      }
    }
    if (this.lr() < dt * (f3 ? 10 : 4) * u) {
      const a = this.lr() * TAU, r = this.lrand(1, 3);
      this.arc(x + this.lrand(-0.2, 0.2), this.lrand(0.6, 1.8), z + this.lrand(-0.2, 0.2), x + Math.cos(a) * r, GROUND_Y, z + Math.sin(a) * r, 0.3, null, null, 5);
    }
    if (f3 && u > 0.4 && this.lr() < dt * 2.2 * u) {
      const a = this.lr() * TAU, r = this.lrand(2.5, 5.5);
      this.lightning(x + Math.cos(a) * r + this.lrand(-1, 1), 8, z + Math.sin(a) * r, x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, 1.3, true);
    }
    this._keep('gather', x, 1.4, z, f3 ? L_STORM : L_GOLD, 1 + 3.5 * u, 5 + 6 * u, 0.2 + 0.3 * u);
  }

  /** The new form stands: a pillar of light 9 m (form 3: 12 m) through him that burns ~0.9 s, a
   *  shock ring out to `r` m, lightning along the floor (form 3: bolts out of the sky round him),
   *  stones and sparks thrown out. ~450 - 650 blobs at the burst, ~120 a frame while the pillar
   *  burns. */
  transformNova(x, z, r, form = 2) {
    if (!Number.isFinite(x + z + r)) return;
    const f3 = form >= 3;
    Object.assign(this._pillar, { alive: true, x, z, t: 0, T: f3 ? 1.0 : 0.85, H: f3 ? 12 : 9, form });
    this.shock(x, z, r, this._opt(1.7, 0.9, 'void', 0, true));
    this._shock(x, 0.9, z, r * 0.7, 48, 0.3, 0.6, 1.1, 0.6, K_VOID, 0.8, 1.2);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + this.lr() * 0.5, rr = r * this.lrand(0.5, 0.9);
      this.lightning(x, GROUND_Y, z, x + Math.cos(a) * rr, GROUND_Y, z + Math.sin(a) * rr, 0.65, false);
    }
    if (f3) for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + this.lr() * 0.8, rr = r * this.lrand(0.45, 0.75);
      this.lightning(x + Math.cos(a) * rr + this.lrand(-1, 1), 9, z + Math.sin(a) * rr, x + Math.cos(a) * rr, 0.1, z + Math.sin(a) * rr, 1.25, i === 0);
    }
    for (let i = 0; i < 30; i++) {
      const a = this.lr() * TAU, sp = this.lrand(3, 10);
      const stone = i % 3 === 0;
      const o = this._rec(x, 0.4, z, this.lrand(0.5, 1.1), this.lrand(0.15, 0.26), 0.05, stone ? '#%&' : "+*'", stone ? STONE : f3 ? STORM : GOLD, stone ? [0.14, 0.13, 0.12] : GOLD_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(3, 10);
      o.vz = Math.sin(a) * sp;
      o.drag = 1.2;
      o.gravity = stone ? -12 : -5;
      this._spawn(stone ? this.alpha : this.add, o);
    }
    super._light({ x, y: 2, z, color: f3 ? L_STORM : L_GOLD, intensity: 7, radius: r * 2.2, life: 0.8, fade: 0.6 });
  }

  /** The pillar of a transformation, drawn every frame of its life (update). */
  _drawPillar(p, dt) {
    p.t += dt;
    if (p.t >= p.T) {
      p.alive = false;
      return;
    }
    const u = p.t / p.T, k = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88, f3 = p.form >= 3, A = this._axes();
    const H = p.H * (0.5 + 0.5 * Math.min(1, u * 5));
    const life = this._frame();
    if (life > 0 && k > 0.05) {
      // the core: white lines written on the grid, the middle one white-hot
      const S = this._screen(p.x, 1, p.z), cs = (S.ok ? S.mpp * S.cw : 0.15) * 1.0;
      const nl = k > 0.5 ? 2 : 1;
      for (let j = -nl; j <= nl; j++) {
        const h = j === 0 ? 1.45 : Math.abs(j) === 1 ? 1.12 : 0.8;
        this._ink(p.x + A.rx * cs * j, 0.4, p.z + A.rz * cs * j, p.x + A.rx * cs * j, H, p.z + A.rz * cs * j, 0, h * k, 0, h * k * 0.6);
      }
      // the body: gold round the core all the way up
      const B = this._toCam();
      for (let i = 0; i < 26; i++) {
        const y = 0.4 + (i / 25) * (H - 0.4), s = (hash(i + Math.floor(p.t * 14)) - 0.5) * 1.1 * (f3 ? 0.8 : 1);
        this._blob(p.x + A.rx * s - B.x * 0.3, y, p.z + A.rz * s - B.z * 0.3, 0, 0, 0, life, 0.9, 0.9, 0.42 * k, 0.42 * k, K_VOID);
      }
    }
    this._pillarAcc += dt * 140 * k;
    while (this._pillarAcc >= 1) {
      this._pillarAcc -= 1;
      const a = this.lr() * TAU, rr = this.lrand(0, 0.7);
      this._blob(p.x + Math.cos(a) * rr, this.lrand(0.3, 2.5), p.z + Math.sin(a) * rr, 0, this.lrand(9, 20), 0, this.lrand(0.3, 0.6), 0.6, 0.3, 0.5 * k, 0, K_VOID, 0.5, 2);
    }
    if (f3 && this.lr() < dt * 14 * k) this.arc(p.x, this.lrand(1, H * 0.6), p.z, p.x + this.lrand(-1.4, 1.4), this.lrand(1, H * 0.7), p.z + this.lrand(-1.4, 1.4), 0.3, null, null, 4);
    this._keep('pillar', p.x, 3, p.z, f3 ? L_STORM : L_GOLD, 6 * k, 14, 0.2);
  }

  // ---------------------------------------------------------------- thrown energy: blasts and the disc
  /**
   * Throw something (LordFx's pool, grown to 24). Besides the Lord's 'glaive' / 'stone':
   *   kind 'blast'  a ball of his energy: { x, y (1.1), z, dx, dz, speed, radius (0.5), life (2.5),
   *                 range (m it flies before it drops to the floor and bursts: 22), size (its drawn
   *                 size: 1, the Spirit Shot 1.4, Golden Rain 0.8), tell, damage, knockback, attack,
   *                 delay (s it hangs, charging, before it flies at the hero), returnable (a PERFECT
   *                 parry sends it back at him), returned (it is already flying back at him) }.
   *                 A returned blast flies at his chest; when it reaches him `d.onShotReturned?.(s)`
   *                 is called (his class deals the damage; `s.damage` is the blast's) and it bursts.
   *   kind 'disc'   a spinning cutting disc: { x, y (1.1), z, dx, dz, speed, back (its speed home),
   *                 range (12), curve (rad/s it turns while it flies out: + left, - right), hang (s
   *                 it hangs at the turn: 0.3), through (true: home THROUGH where the hero was at the
   *                 turn, then to his hand), radius (0.7), tell, damage, knockback, attack }. Home:
   *                 `d.onShotBack?.(s)` when it reaches his hand. It cuts what it crosses.
   *                 Thrown down from the air: { yTo, yLen } (it falls from `y` to `yTo` over `yLen` m
   *                 of its way, and on to the floor). Heaven's Lantern's orb: { lantern: true } (drawn,
   *                 met and burst by the lantern* methods; its shots class decides what follows).
   * Fields added to the record: size, returnable, returned, curve, hang, through, tx, tz, leg, path,
   * form, seed, hitKind, yTo, y0, yLen, lantern, lid. The cue ledger's fields (alive, done, flashed, phase, x, z, dx, dz, speed,
   * back, wait, radius, delay, age, tell, attack) keep their meaning; dx / dz are the way it flies
   * NOW (a disc turns as it flies).
   */
  throwShot(o) {
    if (o?.kind !== 'blast' && o?.kind !== 'disc') return super.throwShot(o);
    const s = super.throwShot({ ...o, radius: o.radius ?? (o.kind === 'disc' ? 0.7 : 0.5), range: o.range ?? (o.kind === 'disc' ? 12 : 22), life: o.life ?? (o.kind === 'disc' ? 6 : 2.5), knockback: o.knockback ?? 1.2 });
    if (!s) return null;
    s.y = o.y ?? 1.1;
    s.size = o.size ?? 1;
    s.returnable = !!o.returnable;
    s.returned = !!o.returned;
    s.curve = o.curve ?? 0;
    s.hang = o.hang ?? 0.3;
    s.through = o.through ?? true;
    s.tx = s.tz = NaN;
    s.leg = 0;
    s.path = 0;
    s.form = o.form ?? this.d?.phase ?? 1;
    s.seed = this.lr() * 100;
    s.hitKind = o.hitKind ?? 'thrown';
    s.group = o.group ?? 0;
    s.lx = s.lz = NaN;
    // (a blast thrown down from the air falls from `y` to `yTo` over `yLen` m of its way, and on to the
    // floor past it; Heaven's Lantern's orb is a blast with `lantern`: drawn, met and burst by the
    // lantern* methods below)
    s.yTo = Number.isFinite(o.yTo) ? o.yTo : NaN;
    s.y0 = s.y;
    s.yLen = Math.max(0.5, fin(o.yLen, s.range));
    s.lantern = !!o.lantern;
    s.lid = 0;
    if (s.returned) {
      s.phase = 'fly';
      s.done = true; // (it is not the hero's to meet)
    }
    return s;
  }

  updateShots(dt, d) {
    // the Lord's kinds fly as his do; this boss's own are hidden from his loop meanwhile
    const S = this.shots;
    let other = false;
    for (const s of S) {
      if (!s.alive) continue;
      if (s.kind === 'blast' || s.kind === 'disc') {
        s._mine = true;
        s.alive = false;
      } else other = true;
    }
    if (other) super.updateShots(dt, d);
    for (const s of S) {
      if (!s._mine) continue;
      s._mine = false;
      s.alive = true;
    }
    const p = this.game.player, pp = p?.position, lead = perPhase(d?.T?.flashLead ?? 0.26, d?.phase ?? 1);
    for (const s of S) {
      if (!s.alive || (s.kind !== 'blast' && s.kind !== 'disc')) continue;
      try {
        if (s.kind === 'blast') this._flyBlast(s, dt, d, p, pp, lead);
        else this._flyDisc(s, dt, d, p, pp, lead);
      } catch (e) {
        s.alive = false; // never freeze the frame
      }
    }
  }

  /** The disc is home: the class's onShotBack, else his shots' own catch (kiShots.js discBack). */
  _shotBack(d, s) {
    if (typeof d.onShotBack === 'function') d.onShotBack(s);
    else d.ki?.shots?.discBack?.(s);
  }

  /** The cue (flashLead before contact) and the contact, shared by blasts and discs. Returns the
   *  hit's result, or null when nothing met the hero this frame. */
  _shotMeets(s, d, p, pp, lead, speed) {
    if (!pp || s.done || p.alive === false) return null;
    const rx = pp.x - s.x, rz = pp.z - s.z;
    const along = rx * s.dx + rz * s.dz, across = Math.abs(-rx * s.dz + rz * s.dx);
    const reach = s.radius + (p.radius ?? 0.45), half = s.radius + 0.5;
    if (across < half && along > 0 && s.flashed < 0 && (along - reach) / Math.max(0.1, speed) + Math.max(0, s.wait ?? 0) <= lead) {
      s.flashed = s.age;
      d.emit?.('combat:flash', { source: 'dragon', attack: s.attack, tell: s.tell, x: s.x, y: s.y, z: s.z, hazard: true, bullet: true });
      this.hazardFlash(s.tell, s.x, s.y, s.z);
    }
    if (!(across < half && Math.abs(along) <= reach)) return null;
    s.done = true;
    const cued = s.flashed >= 0 ? s.age - s.flashed : 0;
    if (s.flashed < 0 || cued < 0.2) return 'fizzle'; // announced too late (fairness): it only fizzles
    const red = s.tell === TELL.RED;
    const r = d.hitPlayer({
      damage: s.damage, knockback: s.kb, knockdown: red, kind: s.hitKind, tell: s.tell, attack: s.attack, from: { x: s.x - s.dx, z: s.z - s.dz },
      projectile: true, light: !red, parryPosture: s.kind === 'disc' ? 14 : 8, extra: red ? { plunge: false } : null,
    });
    // (the string-lock rule for a volley of red shots, Storm Cage's orbs: once one has thrown the hero
    // down, the rest of its group pass over him, uncued and harmless)
    if (red && s.group && r === RESULT.HIT) for (const o of this.shots) if (o !== s && o.alive && o.group === s.group) o.done = true;
    return r;
  }

  _flyBlast(s, dt, d, p, pp, lead) {
    s.age += dt;
    if (s.phase === 'push') return; // (the great orb held on the hero's blade: his shots draw it)
    if (s.phase === 'hang') {
      this._drawBlast(s, true);
      if (s.age >= s.delay) {
        s.phase = 'fly';
        s.age = 0;
        // (an orb of a group, Storm Cage's, that leaves while the hero lies knocked down passes over him:
        // the tuning pass's string-lock rule; the worst second was a palm, an orb and the aura on him)
        if (s.group && p?.state === 'knockdown') s.done = true;
        if (pp) {
          const dx = pp.x - s.x, dz = pp.z - s.z, l = Math.hypot(dx, dz) || 1;
          s.dx = dx / l;
          s.dz = dz / l;
        }
        this.muzzle(s.x, s.y, s.z, s.dx, s.dz, 0.7 * s.size, s.form);
      }
      return;
    }
    if (s.returned) {
      // thrown back: it flies at his chest
      const c = this._chest(d), dx = c.x - s.x, dy = c.y - s.y, dz = c.z - s.z, l = Math.hypot(dx, dy, dz);
      if (l < 0.9 || d.mode === 'dead') {
        this._blastBurst(s, false, true);
        if (d.mode !== 'dead') {
          if (typeof d.onShotReturned === 'function') d.onShotReturned(s);
          else d.ki?.shots?.returned?.(s);
        }
        return;
      }
      if (s.age > 3) {
        this._blastBurst(s, false, false);
        return;
      }
      const sp = s.speed * 1.25, hl = Math.hypot(dx, dz) || 1;
      s.dx = dx / hl;
      s.dz = dz / hl;
      s.x += (dx / l) * sp * dt;
      s.y += (dy / l) * sp * dt;
      s.z += (dz / l) * sp * dt;
      this._drawBlast(s, false);
      return;
    }
    const step = s.speed * dt;
    s.x += s.dx * step;
    s.z += s.dz * step;
    s.path += step;
    if (Number.isFinite(s.yTo)) s.y = s.y0 + (s.yTo - s.y0) * (s.path / s.yLen); // (thrown down: it falls along its way)
    else {
      // near the end of its range it drops toward the floor; there it bursts
      const drop = clamp01((s.path - s.range * 0.72) / (s.range * 0.28));
      if (drop > 0) s.y += (0.3 - s.y) * Math.min(1, dt * 7 * drop);
    }
    if (s.path >= s.range || s.y < (s.lantern ? 0.9 : 0.42) || s.age > s.life + 2 || Math.hypot(s.x, s.z) > (d.bound ?? 30) + 25) {
      this._blastBurst(s, true, false);
      return;
    }
    // cover stops it: it bursts there
    const W = this.game.world?.destructibles;
    if (W?.stop) {
      const WT = d.T?.world ?? {};
      if (W.stop(s.x - s.dx * step, s.z - s.dz * step, s.x, s.z, s.radius, s.size > 1.2 ? WT.bigBlast ?? ASC_WORLD.bigBlast : WT.blast ?? ASC_WORLD.blast, BLAST_BLOW)) {
        this._blastBurst(s, false, false);
        return;
      }
    }
    this._drawBlast(s, false);
    if (s.lantern) {
      // the great orb: its own meeting (a heavy blue blow); his shots decide what follows (the push, a
      // burst on the guard or the hero, or it flies on past a roll)
      const r = this.lanternMeet(s, d, p, pp, lead);
      if (r === null) return;
      const sh = d.ki?.shots;
      if (typeof sh?.lanternMet === 'function') sh.lanternMet(s, r);
      else if (r !== RESULT.DODGED && r !== RESULT.PERFECT && r !== RESULT.IGNORED) this.lanternBurst(s, r === 'fizzle' ? 'fizzle' : 'guard');
      return;
    }
    const r = this._shotMeets(s, d, p, pp, lead, s.speed);
    if (r === null) return;
    if (r === 'fizzle') return this._blastFizzle(s);
    if (r === RESULT.PARRIED && s.returnable && p?.deflect?.perfect && d.mode !== 'dying' && d.mode !== 'dead') {
      // a perfect parry: struck back at him
      s.returned = true;
      s.age = 0;
      s.speed = Math.max(s.speed, 18);
      this.muzzle(s.x, s.y, s.z, -s.dx, -s.dz, 0.8 * s.size, 2);
      return;
    }
    if (r === RESULT.DODGED || r === RESULT.PERFECT || r === RESULT.IGNORED) return; // through him: it flies on
    this._blastBurst(s, false, false);
  }

  _flyDisc(s, dt, d, p, pp, lead) {
    s.age += dt;
    s.spin += dt * 24;
    let speed = s.speed;
    if (s.phase === 'fly') {
      if (s.curve) {
        const a = s.curve * dt, c = Math.cos(a), sn = Math.sin(a), dx = s.dx * c - s.dz * sn, dz = s.dx * sn + s.dz * c;
        s.dx = dx;
        s.dz = dz;
      }
      const step = s.speed * dt;
      s.x += s.dx * step;
      s.z += s.dz * step;
      s.path += step;
      if (s.path >= s.range || Math.hypot(s.x, s.z) > (d.bound ?? 30) + 6) this._discTurn(s, d, pp);
    } else if (s.phase === 'back') {
      const h = d._hand ?? d._hilt ?? this._chest(d);
      let gx = h.x, gz = h.z;
      if (s.leg === 0 && Number.isFinite(s.tx + s.tz)) {
        gx = s.tx;
        gz = s.tz;
        // past the point it aimed through: home to his hand
        if ((s.tx - s.x) * s.dx + (s.tz - s.z) * s.dz < 0.3) s.leg = 1;
      } else s.leg = 1;
      const hx = gx - s.x, hz = gz - s.z, l = Math.hypot(hx, hz);
      if (s.leg === 1 && (Math.hypot(h.x - s.x, h.z - s.z) < 1.1 || d.mode === 'dying' || d.mode === 'dead')) {
        s.alive = false;
        this._shotBack(d, s);
        return;
      }
      if (l > 1e-3 && !(s.leg === 0 && l < 0.3)) {
        s.dx = hx / l;
        s.dz = hz / l;
      }
      speed = s.back;
      if (s.wait > 0) {
        s.wait -= dt;
        speed = 0;
      } else {
        s.x += s.dx * s.back * dt;
        s.z += s.dz * s.back * dt;
      }
    }
    if (s.age > s.life + 4) {
      s.alive = false;
      this._shotBack(d, s);
      return;
    }
    // it cuts what it crosses, out and home (one blow per pass per piece)
    const W = this.game.world?.destructibles;
    if (W?.sweep && speed > 0) {
      if (s.wsrc === undefined || s.wPhase !== s.phase) s.wsrc = W.swing?.() ?? -1;
      s.wPhase = s.phase;
      const o = (this._discBlow ??= { kind: 'cut', by: 'boss', dx: 0, dz: 0, y: 1.0, src: -1 });
      o.dx = s.dx;
      o.dz = s.dz;
      o.src = s.wsrc;
      W.sweep(s.x - s.dx * speed * dt, s.z - s.dz * speed * dt, s.x, s.z, s.radius, d.T?.world?.disc ?? ASC_WORLD.disc, o);
    }
    this._drawDisc(s);
    const r = this._shotMeets(s, d, p, pp, lead, s.phase === 'back' ? s.back : s.speed);
    if (r === RESULT.PARRIED && s.phase === 'fly') this._discTurn(s, d, null, true);
    else if (r !== null && r !== 'fizzle' && r !== RESULT.DODGED && r !== RESULT.PERFECT) {
      for (let i = 0; i < 8; i++) {
        const a = this.lr() * TAU, sp = this.lrand(2, 6);
        const o = this._rec(s.x, s.y, s.z, this.lrand(0.2, 0.4), 0.15, 0.04, "+'*", GOLD, GOLD_END);
        o.vx = Math.cos(a) * sp;
        o.vy = this.lrand(0, 3);
        o.vz = Math.sin(a) * sp;
        o.drag = 3;
        this._spawn(this.add, o);
      }
    }
  }

  /** The disc turns for home: it hangs a moment (time for its cue), then comes back through where
   *  the hero is now (or straight home when struck aside). */
  _discTurn(s, d, pp, struck = false) {
    s.phase = 'back';
    s.wait = struck ? 0 : s.hang;
    s.flashed = -1;
    s.done = !!struck;
    s.leg = struck || !s.through || !pp ? 1 : 0;
    s.tx = pp ? pp.x : NaN;
    s.tz = pp ? pp.z : NaN;
    if (s.leg === 0) {
      const hx = s.tx - s.x, hz = s.tz - s.z, l = Math.hypot(hx, hz);
      if (l > 1e-3) {
        s.dx = hx / l;
        s.dz = hz / l;
      }
    }
    // the fairness guard on its way home (as the Lord's blade's): a wait that clears a conflict, or
    // a pass that is harmless
    const br = d.brain, hp = this.game.player?.position;
    if (!struck && br?.fairDelay && hp && s.tell) {
      const home = s.wait + Math.max(0, Math.hypot(hp.x - s.x, hp.z - s.z) - s.radius - (this.game.player?.radius ?? 0.45)) / Math.max(1, s.back);
      const w = br.fairDelay(home, s.tell, d.T?.shots?.disc?.homeWait ?? d.T?.disc?.homeWait ?? 0.4, 'disc');
      if (w > 0) {
        s.wait += w;
        if (br.stats) br.stats.delays++;
      } else if (w < 0) {
        s.done = true;
        if (br.stats) br.stats.fizzles++;
      }
    }
    // the turn: a flare of light on its rim
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      this._blob(s.x + Math.cos(a) * 0.7, s.y, s.z + Math.sin(a) * 0.7, Math.cos(a) * 3, 0, Math.sin(a) * 3, 0.16, 0.3, 0.2, 0.7, 0, K_STEEL, 4);
    }
  }

  /** A blast: a white-hot heart in a ball of gold, a short comet tail of strokes and heat, sparks.
   *  Charging (`hang`): it swells, motes drawn in. ~25 - 45 blobs a frame. */
  _drawBlast(s, hang) {
    if (s.lantern) return this.lanternDraw(s);
    const life = this._frame(), k = s.size ?? 1, A = this._axes(), ret = s.returned;
    const grow = hang ? Math.min(1, s.age / Math.max(0.15, s.delay)) : 1, R = 0.56 * k * (0.5 + 0.5 * grow);
    const P = this._toCamera(s.x, s.y, s.z), px = P.x, py = P.y, pz = P.z;
    if (life > 0) {
      const pulse = 1 + 0.12 * Math.sin((s.age + s.seed) * 38);
      for (let i = 0; i < 9; i++) {
        const rr = R * pulse * Math.sqrt((i + 0.5) / 9), a = i * 2.39996 + s.age * 9, ox = Math.cos(a) * rr, oy = Math.sin(a) * rr;
        this._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, 0, 0, 0, life, R * 0.75, R * 0.75, 0.42, 0.42, K_VOID);
      }
      this._blob(px, py, pz, 0, 0, 0, life, R * 0.55, R * 0.55, ret ? 1.5 : 1.25, ret ? 1.5 : 1.25, K_STEEL);
    }
    if (hang) {
      if (this.lr() < 0.6) {
        const a = this.lr() * TAU, R2 = this.lrand(0.6, 1.2), lf = this.lrand(0.16, 0.26), mx = s.x + Math.cos(a) * R2, my = s.y + this.lrand(-0.5, 0.5), mz = s.z + Math.sin(a) * R2;
        const o = this._rec(mx, my, mz, lf, 0.12, 0.04, ".'", GOLD, GOLD_END);
        o.vx = (s.x - mx) / lf;
        o.vy = (s.y - my) / lf;
        o.vz = (s.z - mz) / lf;
        o.alpha = 0.3;
        o.alphaEnd = 1;
        this._spawn(this.add, o);
      }
      return;
    }
    // the tail: a stroke back along the way it came (written on the grid), heat shed behind it
    const tl = Math.min(0.9 * k, 0.07 * s.speed * (0.4 + Math.min(1, s.age * 4))) + R;
    // (one thrown down from the air: its tail runs back UP the way it fell; sl = its fall a metre)
    const sl = !ret && Number.isFinite(s.yTo) ? (s.yTo - s.y0) / s.yLen : 0;
    this._ink(s.x - s.dx * tl, s.y - sl * tl, s.z - s.dz * tl, s.x - s.dx * R * 0.9, s.y - sl * R * 0.9, s.z - s.dz * R * 0.9, 0, 0.2, 0, ret ? 0.75 : 0.55);
    for (let i = 0; i < 3; i++) this._blob(s.x - s.dx * (0.25 + 0.25 * i) * k, s.y - sl * (0.25 + 0.25 * i) * k + this.lrand(-0.06, 0.06), s.z - s.dz * (0.25 + 0.25 * i) * k, -s.dx * 1.5 + this.lrand(-0.3, 0.3), this.lrand(0, 0.4), -s.dz * 1.5 + this.lrand(-0.3, 0.3), this.lrand(0.14, 0.24), 0.48 * k, 0.18, 0.42, 0, K_VOID, 2);
    if (this.lr() < 0.35) {
      const o = this._rec(s.x, s.y, s.z, this.lrand(0.15, 0.3), 0.13, 0.03, ".'", ret ? WHITE : GOLD, GOLD_END);
      o.vx = -s.dx * 3 + this.lrand(-1.5, 1.5);
      o.vy = this.lrand(-1, 1.5);
      o.vz = -s.dz * 3 + this.lrand(-1.5, 1.5);
      o.drag = 3;
      this._spawn(this.add, o);
    }
  }

  /** A blast bursts (on the floor, on cover, on a guard, or on him when returned): a flash, heat
   *  thrown out, strokes, sparks; on the floor a small ragged shock and a scorch. ~70 blobs. */
  _blastBurst(s, floor, onHim) {
    if (s.lantern) return this.lanternBurst(s, onHim ? 'him' : floor ? 'floor' : 'cover');
    s.alive = false;
    const k = s.size ?? 1, x = s.x, y = Math.max(0.35, s.y), z = s.z, A = this._axes();
    const P = this._toCamera(x, y, z);
    this._blob(P.x, P.y, P.z, 0, 0, 0, 0.12, 0.5 * k, 1.1 * k, 1.6, 0, K_STEEL);
    for (let i = 0; i < 16; i++) {
      const a = this.lr() * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = this.lrand(2, 5) * k;
      const ux = A.rx * ca + A.ux * sa, uy = A.ry * ca + A.uy * sa, uz = A.rz * ca + A.uz * sa;
      this._blob(x + ux * 0.2, y + uy * 0.2, z + uz * 0.2, ux * sp, Math.abs(uy * sp) + 0.5, uz * sp, this.lrand(0.2, 0.36), 0.55 * k, 0.3, 0.55, 0, K_VOID, 3, 1);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + this.lr() * 0.4, ca = Math.cos(a), sa = Math.sin(a), sp = this.lrand(6, 10) * Math.min(1.4, k);
      const ux = A.rx * ca + A.ux * sa, uy = A.ry * ca + A.uy * sa, uz = A.rz * ca + A.uz * sa;
      this._blob(x + ux * 0.15, y + uy * 0.15, z + uz * 0.15, ux * sp, uy * sp, uz * sp, this.lrand(0.12, 0.2), 0.27, 0.2, 0.7, 0, K_STEEL, 6);
    }
    for (let i = 0; i < 10; i++) {
      const a = this.lr() * TAU, sp = this.lrand(2, 7);
      const o = this._rec(x, y, z, this.lrand(0.25, 0.5), this.lrand(0.12, 0.2), 0.04, "+*'.", i & 1 ? WHITE : GOLD, GOLD_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(0, 4);
      o.vz = Math.sin(a) * sp;
      o.drag = 2.5;
      o.gravity = -6;
      this._spawn(this.add, o);
    }
    if (floor) {
      this._shock(x, 0.8, z, 1.6 * k, 18, 0.24, 0.45, 0.8, 0.45, K_VOID, 0.3, 3);
      for (let i = 0; i < 3; i++) this._blob(x + this.lrand(-0.3, 0.3), 0.8, z + this.lrand(-0.3, 0.3), this.lrand(-0.6, 0.6), this.lrand(0.4, 1), this.lrand(-0.6, 0.6), this.lrand(0.7, 1.1), 0.6, 1.4, 0.5, 0, K_SMOKE, 1.5, 0.4);
      this.game.world?.scorch?.burnCircle?.(x, z, 0.8 * k, 0.22, 0.15);
      const W = this.game.world;
      W?.impact?.(x, z, 1.1 * k, k > 1.2 ? this.d?.T?.world?.bigBlast ?? ASC_WORLD.bigBlast : this.d?.T?.world?.blast ?? ASC_WORLD.blast, BLAST_BLOW);
    }
    super._light({ x, y: y + 0.3, z, color: L_GOLD, intensity: (onHim ? 6 : 3.5) * k, radius: 6 * k, life: 0.22, fade: 0.2 });
    if (onHim) this.game.shake?.(0.25);
  }

  /** A blast that could only be cued too late goes out on touch: a puff of gold and a few sparks. */
  _blastFizzle(s) {
    s.alive = false;
    for (let i = 0; i < 8; i++) {
      const a = this.lr() * TAU, sp = this.lrand(0.8, 2);
      this._blob(s.x, s.y, s.z, Math.cos(a) * sp, this.lrand(0.2, 1), Math.sin(a) * sp, this.lrand(0.18, 0.3), 0.36, 0.2, 0.3, 0, K_VOID, 2, 0.8);
    }
    for (let i = 0; i < 5; i++) {
      const a = this.lr() * TAU, sp = this.lrand(1, 3);
      const o = this._rec(s.x, s.y, s.z, this.lrand(0.2, 0.35), 0.12, 0.03, ".'", GOLD, GOLD_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(0, 2);
      o.vz = Math.sin(a) * sp;
      o.drag = 3;
      this._spawn(this.add, o);
    }
  }

  /** The disc: a thin bright ring seen at the camera's slant, turning (two white-hot notches run
   *  round it), a sheath of gold on its rim, the wake its rim leaves. ~40 blobs a frame. */
  _drawDisc(s) {
    const R = 0.85, sp = s.spin;
    const life = this._frame();
    if (life > 0) {
      // the rim: a ring of gold, hotter on the side the notches turn past
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU, h = 0.7 + 0.45 * Math.max(0, Math.cos(2 * (a - sp)));
        this._blob(s.x + Math.cos(a) * R, s.y + Math.sin(a) * 0.08, s.z + Math.sin(a) * R * 0.9, 0, 0, 0, life, 0.34, 0.34, h, h, K_VOID);
      }
      for (let e = 0; e < 2; e++) {
        const a = sp + e * Math.PI;
        this._blob(s.x + Math.cos(a) * R, s.y, s.z + Math.sin(a) * R * 0.9, 0, 0, 0, life, 0.27, 0.27, 1.22, 1.22, K_STEEL);
      }
      this._blob(s.x, s.y, s.z, 0, 0, 0, life, 0.4, 0.4, 0.3, 0.3, K_VOID);
    }
    // the wake: what the rim leaves where it passed
    for (let e = 0; e < 2; e++) {
      const a = sp + e * Math.PI + this.lrand(-0.3, 0.3);
      this._blob(s.x + Math.cos(a) * R, s.y, s.z + Math.sin(a) * R * 0.9, -s.dx * 1.2, 0.2, -s.dz * 1.2, this.lrand(0.14, 0.24), 0.36, 0.18, 0.4, 0, K_VOID, 1);
    }
    if (this.lr() < 0.5) {
      const a = sp + this.lr() * TAU, o = this._rec(s.x + Math.cos(a) * R, s.y, s.z + Math.sin(a) * R, this.lrand(0.15, 0.3), 0.13, 0.03, "'.", GOLD, GOLD_END);
      o.vx = -Math.sin(a) * 4 - s.dx * 2;
      o.vz = Math.cos(a) * 4 - s.dz * 2;
      o.vy = this.lrand(-0.5, 1);
      o.drag = 3;
      this._spawn(this.add, o);
    }
  }

  // ---------------------------------------------------------------- Heaven's Lantern (the third wave)
  /** The great orb at (x, y, z), `R` m round, `k` its strength (1 full), `t` its clock (?ascOrb): a SUN
   *  (a: a round ball of gold heat, a white heart, a few hot letters orbiting it) or a LANTERN (b: a
   *  bright rim round a darker heart that pulses). This frame only, facing the camera. ~25 - 55 blobs. */
  lanternOrb(x, y, z, R, k, t, seed = 0) {
    const life = this._frame();
    if (!(life > 0) || !Number.isFinite(x + y + z + R + k + t + seed) || !(R > 0.02)) return;
    const A = this._axes(), P = this._toCamera(x, y, z), px = P.x, py = P.y, pz = P.z;
    // (a smaller orb has fewer blobs over less of itself: its body's heat is raised to read the same)
    const kb = k * Math.min(2.2, Math.max(1, 1.5 / Math.max(0.3, R)));
    const at = (ox, oy, sz, h, kind) => this._blob(px + A.rx * ox + A.ux * oy, py + A.ry * ox + A.uy * oy, pz + A.rz * ox + A.uz * oy, 0, 0, 0, life, sz, sz, h, h, kind);
    if (look('ascOrb') === 'b') {
      // the rim: a bright ring, hot stretches running round it
      const pulse = 0.5 + 0.5 * Math.sin(t * 5.5 + seed), n = Math.min(36, Math.max(12, Math.round(R * 16)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + t * 0.7, rr = R * (0.9 + 0.08 * hash(seed + i));
        const hot = Math.max(0, Math.cos(3 * (a - t * 2.4)));
        at(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.42, (0.42 + 0.3 * hot) * kb, K_VOID);
      }
      // the heart: dim gold breathing in and out, a small core that brightens at the top of the pulse
      const m = Math.min(16, Math.max(6, Math.round(R * 8)));
      for (let i = 0; i < m; i++) {
        const rr = R * 0.6 * Math.sqrt((i + 0.5) / m), a = i * 2.39996 - t * 0.9;
        at(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.75, (0.13 + 0.12 * pulse) * kb, K_VOID);
      }
      at(0, 0, R * 0.3, (0.35 + 0.55 * pulse) * k, K_STEEL);
      return;
    }
    // the ball: gold heat, hotter toward the middle; a crisp round edge
    const n = Math.min(44, Math.max(10, Math.round(R * 22)));
    for (let i = 0; i < n; i++) {
      const u = Math.sqrt((i + 0.5) / n), rr = R * 0.8 * u, a = i * 2.39996 + t * 1.4;
      at(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.8, (0.16 + 0.14 * (1 - u)) * kb, K_VOID);
    }
    const m = Math.min(30, Math.max(8, Math.round(R * 14)));
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU - t * 0.6, rr = R * (0.92 + 0.06 * hash(seed + i * 3.1));
      at(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.36, 0.3 * kb, K_VOID);
    }
    // the white heart
    at(0, 0, R * 0.55, 0.45 * kb, K_VOID);
    at(0, 0, R * 0.36, 1.3 * k, K_STEEL);
    // the letters orbiting it: four hot points on a ring tilted round it
    for (let e = 0; e < 4; e++) {
      const a = t * 2.4 + (e / 4) * TAU;
      at(Math.cos(a) * R * 1.25, Math.sin(a) * R * 0.42, 0.2, 1.12 * k, K_STEEL);
    }
  }

  /** Through Heaven's Lantern's gather (u 0..1, every frame): the orb at (x, y, z) over his palms
   *  growing from a spark to ~2 m across, motes drawn up into it off the whole ring, heat streaming in
   *  from near, the floor under him lit gold. ~60 - 140 blobs. */
  lanternGather(x, y, z, u, dt, form = 2) {
    if (!this.fire || !Number.isFinite(x + y + z + u) || !(dt >= 0)) return;
    u = clamp01(u);
    const t = this.d?.time ?? this._now(), e = u * u * (3 - 2 * u), R = 0.15 + 1.35 * e;
    this.lanternOrb(x, y, z, R, 0.6 + 0.45 * u, t, 7.7);
    this._lgAcc = (this._lgAcc ?? 0) + dt * (28 + 72 * u);
    while (this._lgAcc >= 1) {
      this._lgAcc -= 1;
      // a mote drawn up off the ring into it
      const a = this.lr() * TAU, r = this.lrand(3, 13), sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r, lf = this.lrand(0.6, 1.1);
      const o = this._rec(sx, 0.25, sz, lf, 0.14, 0.1, ".'", form >= 3 && this.lr() < 0.3 ? STORM : GOLD, GOLD_END);
      o.vx = (x - sx) / lf;
      o.vy = (y - 0.25) / lf;
      o.vz = (z - sz) / lf;
      o.alpha = 0.35;
      o.alphaEnd = 1;
      this._spawn(this.add, o);
      if (this.lr() < 0.4) {
        // heat streaming in from near
        const a2 = this.lr() * TAU, r2 = this.lrand(1.4, 3.2), l2 = this.lrand(0.3, 0.5), hx = x + Math.cos(a2) * r2, hy = y + this.lrand(-1.2, 0.6), hz = z + Math.sin(a2) * r2;
        this._blob(hx, hy, hz, (x - hx) / l2, (y - hy) / l2, (z - hz) / l2, l2, 0.42, 0.2, 0.26 + 0.3 * u, 0.1, K_VOID);
      }
    }
    // the floor under him lit gold, a wheel widening
    const gx = fin(this.d?.position?.x, x), gz = fin(this.d?.position?.z, z);
    if (this._frame() > 0) this._ring(gx, GROUND_Y, gz, 0.9 + 1.8 * u, Math.round(16 + 22 * u), 0.34, (0.16 + 0.3 * u) * GROUND_GAIN, K_VOID, 4, t * (1 + 3 * u));
    this._keep('lantern', x, y, z, L_GOLD, 1.2 + 3.4 * u, 6 + 7 * u, 0.15);
    this._keep('lanternFloor', gx, 0.6, gz, L_GOLD, 0.6 + 1.8 * u, 5 + 4 * u, 0);
  }

  /** The orb in flight (a blast record with `lantern`; drawn by _drawBlast): the orb, heat and motes
   *  shed behind it, the floor lit under it. ~45 - 70 blobs a frame. */
  lanternDraw(s) {
    const R = (s.radius ?? 2) * 0.8, t = s.age + s.seed;
    this.lanternOrb(s.x, s.y, s.z, R, 1, t, s.seed);
    const b = look('ascOrb') === 'b';
    for (let i = 0; i < 3; i++) {
      const back = R * 0.5 + this.lrand(0, R), oy = this.lrand(-0.5, 0.5) * R;
      this._blob(s.x - s.dx * back, s.y + oy, s.z - s.dz * back, -s.dx * 2 + this.lrand(-0.4, 0.4), this.lrand(0, 0.6), -s.dz * 2 + this.lrand(-0.4, 0.4), this.lrand(0.25, 0.4), R * 0.4, R * 0.15, 0.3, 0, K_VOID, 2);
    }
    if (this.lr() < (b ? 0.9 : 0.4)) {
      const a = this.lr() * TAU, o = this._rec(s.x + Math.cos(a) * R * 0.8 - s.dx * R * 0.5, s.y + Math.sin(a) * R * 0.6, s.z + Math.sin(a) * R * 0.8 - s.dz * R * 0.5, this.lrand(0.4, 0.7), 0.14, 0.06, ".'", GOLD, GOLD_END);
      o.vx = -s.dx * 3 + this.lrand(-0.8, 0.8);
      o.vy = this.lrand(-0.3, 0.8);
      o.vz = -s.dz * 3 + this.lrand(-0.8, 0.8);
      o.drag = 2;
      this._spawn(this.add, o);
    }
    this._dot(s.x, GROUND_Y, s.z, R * 0.9, 0.12 * GROUND_GAIN, K_VOID);
    this._keep('lanternFly', s.x, s.y, s.z, L_GOLD, 2.6, 7, 0.12);
  }

  /** THE PUSH, every frame: the orb at (x, y, z) held on the hero's blade, pressing along (dx, dz)
   *  toward him; `k` the lock's meter (1: the hero is winning). It grinds: sparks thrown off the
   *  contact, the orb shuddering. ~60 - 80 blobs. */
  lanternClash(x, y, z, dx, dz, k, dt, form = 2) {
    if (!this.fire || !Number.isFinite(x + y + z + dx + dz + k) || !(dt >= 0)) return;
    const t = this.d?.time ?? this._now(), R = 1.5 * (1 + 0.06 * Math.sin(t * 31)), l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    this.lanternOrb(x, y, z, R, 1.25, t, 3.3);
    const cx = x + ux * R * 0.85, cy = y - 0.1, cz = z + uz * R * 0.85;
    this._dot(cx, cy, cz, 0.55, 0.85 + 0.3 * Math.sin(t * 40), K_STEEL);
    this._lcAcc = (this._lcAcc ?? 0) + dt * (40 + 30 * Math.abs(k - 0.5));
    while (this._lcAcc >= 1) {
      this._lcAcc -= 1;
      // sparks thrown off the contact, out to the sides
      const side = this.lr() < 0.5 ? -1 : 1, sp = this.lrand(3, 8);
      const o = this._rec(cx, cy, cz, this.lrand(0.2, 0.36), this.lrand(0.12, 0.18), 0.04, "+*'", this.lr() < 0.4 ? WHITE : form >= 3 ? STORM : GOLD, GOLD_END);
      o.vx = -uz * side * sp - ux * this.lrand(0, 2);
      o.vy = this.lrand(0, 3.5);
      o.vz = ux * side * sp - uz * this.lrand(0, 2);
      o.drag = 2.5;
      o.gravity = -6;
      this._spawn(this.add, o);
      if (this.lr() < 0.3) this._blob(cx, cy, cz, -uz * side * sp * 0.6, this.lrand(0, 1), ux * side * sp * 0.6, this.lrand(0.15, 0.25), 0.4, 0.15, 0.5, 0, K_VOID, 3);
    }
    if (this.lr() < dt * 6) this.dust(x, z, 0.5);
    this._keep('lanternClash', x, y, z, L_GOLD, 5, 11, 0.3);
  }

  /** The orb bursts (`how`: 'floor' / 'cover' at the end of its way, 'guard' on a parry or a block,
   *  'hero' on the hero, 'lost' a lost push, 'him' flown back into him, 'fizzle'); the crater and the
   *  shock ring at (x, z) (default where it is). The ring is LOOK ONLY. Calls the world (a crater of
   *  T.lantern.crater m at the floor, guardCrater on the guard / the hero). ~250 - 350 blobs, once. */
  lanternBurst(s, how = 'floor', x, z) {
    if (!s) return;
    s.alive = false;
    if (how === 'fizzle') return this._blastFizzle(s);
    const LA = this.d?.T?.shots?.lantern ?? {}, bx = fin(s.x), by = Math.max(0.6, fin(s.y, 1.2)), bz = fin(s.z);
    const gx = Number.isFinite(x) ? x : bx, gz = Number.isFinite(z) ? z : bz;
    const ground = how !== 'him', far = how === 'floor' || how === 'cover', r = far ? LA.crater ?? 4 : LA.guardCrater ?? 3;
    const A = this._axes(), P = this._toCamera(bx, by, bz);
    // the flash (short; a ring of heat round a small hot heart, never one big white disc), the orb
    // coming apart
    this._blob(P.x, P.y, P.z, 0, 0, 0, 0.1, 0.5, 0.9, 1.15, 0, K_STEEL);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU, ox = Math.cos(a) * 1.0, oy = Math.sin(a) * 1.0;
      this._blob(P.x + A.rx * ox + A.ux * oy, P.y + A.ry * ox + A.uy * oy, P.z + A.rz * ox + A.uz * oy, 0, 0, 0, 0.14, 0.8, 1.3, 0.42, 0, K_VOID);
    }
    for (let i = 0; i < 34; i++) {
      const a = this.lr() * TAU, ca = Math.cos(a), sa = Math.sin(a), sp = this.lrand(4, 9);
      const ux = A.rx * ca + A.ux * sa, uy = A.ry * ca + A.uy * sa, uz = A.rz * ca + A.uz * sa;
      this._blob(P.x + ux * 0.5, P.y + uy * 0.5, P.z + uz * 0.5, ux * sp, uy * sp + 0.5, uz * sp, this.lrand(0.3, 0.5), 0.9, 0.35, 0.55, 0, K_VOID, 3);
    }
    for (let i = 0; i < 22; i++) {
      const a = this.lr() * TAU, sp = this.lrand(3, 10);
      const o = this._rec(bx, by, bz, this.lrand(0.3, 0.6), this.lrand(0.13, 0.2), 0.04, "+*'.", i & 1 ? WHITE : GOLD, GOLD_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(0.5, 5);
      o.vz = Math.sin(a) * sp;
      o.drag = 2;
      o.gravity = -6;
      this._spawn(this.add, o);
    }
    if (ground) {
      // the ring of gold thrown out over the floor (look only), the crater
      this._shock(gx, 0.7, gz, r * 1.4, 44, 0.42, 0.6, 1.1, 0.7, K_VOID, 0.6, 2.2);
      this.crater(gx, gz, r * 0.75, far ? 1.8 : 1.3);
      this.game.world?.impact?.(gx, gz, r, LA.world ?? 2, BLAST_BLOW);
    }
    super._light({ x: bx, y: by + 0.4, z: bz, color: L_GOLD, intensity: 9, radius: 15, life: 0.45, fade: 0.4 });
    this.game.shake?.(how === 'him' ? 0.4 : 0.5);
    this.game.world?.forest?.ambience?.flare?.(0.7);
  }

  /** The orb's meeting with the hero (_shotMeets for a heavy blow): its cue flashLead before contact
   *  on the orb itself, then one result; a knockdown. Returns the RESULT, 'fizzle', or null. */
  lanternMeet(s, d, p, pp, lead) {
    if (!pp || s.done || p.alive === false) return null;
    const rx = pp.x - s.x, rz = pp.z - s.z;
    const along = rx * s.dx + rz * s.dz, across = Math.abs(-rx * s.dz + rz * s.dx);
    const reach = s.radius + (p.radius ?? 0.45), half = s.radius + 0.5;
    if (across < half && along > 0 && s.flashed < 0 && (along - reach) / Math.max(0.1, s.speed) <= lead) {
      s.flashed = s.age;
      // (the cue on the orb's leading edge, toward the hero: inside its heart it would be lost)
      const e = s.radius * 0.7, fx = s.x + s.dx * e, fz = s.z + s.dz * e;
      d.emit?.('combat:flash', { source: 'dragon', attack: s.attack, tell: s.tell, x: fx, y: s.y, z: fz, hazard: true, bullet: true });
      this.hazardFlash(s.tell, fx, s.y, fz);
    }
    if (!(across < half && Math.abs(along) <= reach)) return null;
    s.done = true;
    const cued = s.flashed >= 0 ? s.age - s.flashed : 0;
    if (s.flashed < 0 || cued < 0.2) return 'fizzle';
    return d.hitPlayer({
      damage: s.damage, knockback: s.kb, knockdown: true, kind: 'blast', tell: s.tell, attack: s.attack, from: { x: s.x - s.dx, z: s.z - s.dz },
      projectile: true, light: false, parryPosture: 0,
    });
  }
}

const GRIT_S = ",.'`";
