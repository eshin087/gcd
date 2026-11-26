import * as THREE from 'three';
import { AscFx } from '../ascendant/fx.js';
import { K_FIRE, K_SMOKE, K_VOID, K_STEEL, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { FIRE_PALETTES } from '../../../render/firePalettes.js';
import * as SPELL_FX from './fxSpells.js';
import * as DOMAIN_FX from './fxDomain.js';
import * as FX_DEBUG from './fxDebug.js';

// Bai Wuji's effects (the FX AGENT's file): Tian Lei's AscFx (the beam's helpers, the crater, the kept
// lights, every draw on its own stream) under his own surface. Everything that glows or strikes as a
// body is heat in the fire field; small things that fly are glyph particles of one letter cell; nothing
// is a big glyph sprite (STYLE.md "The fire field"). Look jitter comes from lr() / hashes, never from
// Math.random or the stream game code reads (every method below runs on LordFx's drawing stream).
// Positions are world metres; `d` the boss; `k` 0..1 a strength / progress; `dt` the frame's.
//
// THE SLOTS (the fire field has three coloured slots: fire, void, steel; BRIEF 6):
//   void   AZURE (firePalettes.js `azure`) at rest: the Draw's knots, his eyes from phase 2, the blink.
//          VIOLET (`void`'s colours without its tongues: VIOLET below) while the Null is merged, lit or
//          its trench glows, and while the realm's sign, wall or break draws. A Draw knot cuts a trench's
//          glow short (the knot is blue). The merged ball over his fingers IS the swap.
//   fire   CRIMSON (`crimson`) while the fight is live (he is on foot / acting / reacting / broken) and
//          for 2 s after any Cast drawn outside it (the Lab); the engine's `fire` before the fight, on a
//          reset, from his death on. Its rim keeps the fire's red: the red cues read as everywhere.
//   steel  steel: the barrier, its cracks and ripples, the strokes, the noise of the catch.
// Every slot comes back on reset() (the fight's reset, the hero's retry). A level is its own page load
// (the boss rush too: rush.js reloads), so leaving the level needs nothing more.
//
// THE SURFACE (C = the caller calls it every frame while the thing lives; 1 = once):
//   THE BARRIER (barrier.js; its state: d.barrier.up / cracks / openT / openDur)
//   barrierIdle(d, dt)              C  (barrier.frame) the shell up (?wjShell), its cracks, the open sign,
//                                      the knit-back cue in the last 0.5 s
//   barrierStop(point, dir, heavy)  1  the blade stopped on the shell at point {x,y,z}, dir {x,z} its way in
//   barrierCrack(n, of)             1  an ordinary parry added a crack: n of `of` (drawn on until it opens/fades)
//   barrierOpen(d)                  1  it breaks open: shards of strokes falling, a flash of the whole shell
//   barrierClose(d)                 1  it knits back whole
//   THE BODY
//   blinkOut(d) / blinkIn(d)        1  he is gone (the air falls in) / he is there (a thin displaced outline)
//   afterimage(d, dx, dz, life)     1  a figure left where he was (DuelFx.ghost), drifting along (dx, dz)
//   vanish(d, x0, z0, x1, z1)       1  (the engine's blink hook: here only a little dust, no streak)
//   eyes(d, k)                      C  his eyes (k 0..1): two blue points, a short trail when his head moves fast
//   THE SPELLS (fxSpells.js; the spells agent calls them)
//   drawKnot(knot, dt)              C  an Azure Draw knot (pull.js record {x, z, r, strength, t, life, k, id}; y optional)
//   drawCollapse(knot)              1  it folds in and bursts (its crush)
//   castPoint(p, dt)                C  a Crimson Cast point {x, y, z, k}
//   castBurst(x, z, r, power)       1  its burst (r m, power ~1 - 2)
//   nullCharge(d, k, blue, red)     C  the merge over his fingers, k 0..1 (blue / red {x,y,z} or null: his hands)
//   nullBeam(seg, k)                C  the Violet Null lit: seg {ax, az, bx, bz, w [, y]}, k 0..1 through its life
//   nullEnd(seg)                    1  the air closes on the line; its trench's edges glow for 3 s
//   THE DOMAIN (fxDomain.js; domain.js calls them)
//   domainSign(d, k)                C  the hand sign (k 0..1 through its beat)
//   domainWall(x, z, r, k)          C  the sphere's wall closing round (x, z): `r` the rule's radius (read
//                                      once as the rim), k 0..1 its close; DRAWN to reach the hero at k = 1
//   domainCaught(hero, k)           C  the hero held (k 0..1 through the hold)
//   domainBreak(x, z)               1  the void cracks like glass from (x, z) and falls in shards
//   WEIGHT
//   shove(x, z, dx, dz, dist)       1  the hero slides dist m along (dx, dz) from (x, z): heels' skid, dust
//   crash(x, z, dx, dz, power)      1  a thrown hero goes through a piece at (x, z) (player.js calls it)
//   weight(kind, dx, dz)            1  the camera for a blow of his: kind in WJ_WEIGHT; (dx, dz) the blow's
//                                      way (a kick along it); returns the row used
// Sounds: the barrier's and the domain's through their events (audio.js); the rest through
// `dragon:spell { name: 'wj...', x, z, dur }` that these methods emit once per effect (audio.js maps them).

/** The look switches of his effects (duelist/lookSwitch.js PENDING; the owner picks from the strips). */
export const WJ_FX_LOOKS = Object.freeze({ wjShell: 'a', wjNull: 'a' });
export const wjFxLook = (name) => lookOf(name, WJ_FX_LOOKS[name] ?? 'a', WJ_FX_LOOKS[name] ?? 'a');

/** The camera for a blow of his (BRIEF R2: weight), sized by the blow: shake (trauma), punch (m of
 *  zoom-in), kick (m the picture is thrown along the blow). The moves call fx.weight(kind, dx, dz). */
export const WJ_WEIGHT = Object.freeze({
  light: { shake: 0.16, punch: 0.6, kick: 0.12 }, // a flick, a palm, a kick, a knee
  heavy: { shake: 0.26, punch: 1.2, kick: 0.22 }, // the end of a string, the Yank's fist
  huge: { shake: 0.42, punch: 2.2, kick: 0.34 }, // Dark Spark, a thrown car / slab / tower top
  spell: { shake: 0.5, punch: 2.6, kick: 0.38 }, // Cast's burst, Draw's collapse
  null: { shake: 0.65, punch: 3.4, kick: 0.45 }, // the Violet Null, the realm's close, the domain's blow
  block: { shake: 0.18, punch: 0.8, kick: 0.2 }, // a blocked blow (the slide)
});

/** The Null's and the realm's violet: the Lord's `void` colours with no tongues (it erases, it does not burn). */
export const VIOLET = Object.freeze({ ...FIRE_PALETTES.void, lick: 0, erode: 0.35, boil: 13, warp: 0.35 });

const TAU = Math.PI * 2;
const PALE = [1.5, 1.6, 1.85], PALE_END = [0.25, 0.28, 0.36];
const SHARD = [1.3, 1.45, 1.8], SHARD_END = [0.18, 0.2, 0.3];
const DUSTC = [0.3, 0.28, 0.26], DUST_END = [0.12, 0.11, 0.1];
const SKID = [0.6, 0.6, 0.64], SKID_END = [0.28, 0.28, 0.32]; // (pale: dark grit on the night asphalt is not seen)
const STONE = [0.44, 0.43, 0.42], STONE_END = [0.16, 0.15, 0.15];
const AZURE_G = [0.9, 1.7, 3.4], AZURE_G_END = [0.1, 0.3, 1.0];
export const L_AZURE = [0.45, 0.68, 1.0], L_CRIMSON = [1.0, 0.14, 0.12], L_VIOLET = [0.74, 0.4, 1.0], L_PALE = [0.86, 0.9, 1.0];
const LIVE = new Set(['foot', 'act', 'react', 'broken']);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** A steady hash 0..1 of a number. */
export const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Violet (the Lord's colour: blue the highest channel, green well under it)? */
const violet = (c) => Array.isArray(c) && c[2] > c[0] * 1.05 && c[1] < c[2] * 0.62;
/** The engine's fire light (orange)? */
const orange = (c) => Array.isArray(c) && c[0] > 0.85 && c[1] > 0.3 && c[1] < 0.75 && c[2] < 0.35;

// every drawing method of this class runs on LordFx's drawing stream (see ascendant/fx.js ASC_DRAW)
const WJ_DRAW = [
  'barrierIdle', 'barrierStop', 'barrierCrack', 'barrierOpen', 'barrierClose', 'blinkOut', 'blinkIn', 'eyes', 'afterimage', 'vanish',
  'drawKnot', 'drawCollapse', 'castPoint', 'castBurst', 'nullCharge', 'nullBeam', 'nullEnd', 'domainSign', 'domainWall', 'domainCaught',
  'domainBreak', 'shove', 'crash', '_wjUpdate',
];

// the barrier's shell: how far its drawn edge sits off his body (m), the ripple, the open sign
const SHELL = Object.freeze({
  pad: 0.16, // the drawn shell this far outside his hurt spheres (the blade stops 0.14 off: TUNING.wjBarrier.shell)
  near: 2.6, // the hero's blade within this of the shell lights it (look a; b and c too)
  ripple: { T: 0.34, r: 0.95, heavy: 1.3, rings: 2, lag: 0.08, seg: 12, heat: 1.05 },
  crack: { heat: 0.72, fresh: 1.0, freshT: 0.3, steps: 4, len: 0.27 },
  sign: { r: 0.55, heat: 0.44, blink: 0.5 }, // the open sign: a ring on the floor this far outside the shell
  knit: 0.45, // s the knit-back lasts
});

export class WjFx extends AscFx {
  constructor(d) {
    super(d);
    this.spellFx = SPELL_FX;
    this.domainFx = DOMAIN_FX;
    // the slots: AscFx put its gold in the void slot; his rest is azure, the fire slot the engine's
    this._slot = { void: '', fire: '' };
    this._violetT = 0; // s the void slot stays violet (hard: the Null, the realm)
    this._violetSoftT = 0; // s it stays violet for a trench's glow (a knot cuts it)
    this._crimsonT = 0; // s the fire slot stays crimson outside the fight (a Cast in the Lab)
    this._setSlot('void', 'azure');
    this._setSlot('fire', 'fire');
    // the shell's frame this frame (camera plane) and scratch
    this._sh = { ok: false, x: 0, y: 0, z: 0, rx: 0.6, hu: 1, fy: 0, px: 0, pz: 0, top: 2 };
    this._wp = { x: 0, y: 0, z: 0 };
    this._wq = { x: 0, y: 0, z: 0 };
    this._ripples = Array.from({ length: 4 }, () => ({ alive: false, t: 0, s: 0, u: 0, heavy: false, x: 0, y: 0, z: 0 }));
    this._crackAt = new Float32Array(8); // the time each crack appeared (its fresh flash)
    this._crackN = 0;
    this._knit = { alive: false, t: 0 };
    this._openFlash = { alive: false, t: 0 };
    this._eyePrev = new THREE.Vector3();
    this._eyeOk = false;
    this._eye = new THREE.Vector3();
    this._shoves = Array.from({ length: 3 }, () => ({ alive: false, t: 0, T: 0.5, x: 0, z: 0, dx: 0, dz: 1, dist: 0, done: 0, acc: 0 }));
    this._spellState = SPELL_FX.createState?.() ?? null;
    this._domainState = DOMAIN_FX.createState?.() ?? null;
    this._drive = null; // fxDebug's timeline (dragon.debug.fx)
    this._debugNear = 0; // fxDebug: the shell lit as if the blade neared it (0..1)
    this.blobPeak = 0; // the fire field's count at its highest (the film rig and the fx scenario read it)
    for (const n of WJ_DRAW) {
      const f = this[n];
      if (typeof f !== 'function') continue;
      this[n] = function (a, b, c, d2, e, f2, g, h) {
        this._drawing++;
        try {
          return f.call(this, a, b, c, d2, e, f2, g, h);
        } finally {
          this._drawing--;
        }
      };
    }
  }

  // ---------------------------------------------------------------- the slots
  /** Put palette `name` (a firePalettes.js block, or 'violet') in slot `kind`, if it is not there. */
  _setSlot(kind, name) {
    if (this._slot[kind] === name) return;
    const pal = name === 'violet' ? VIOLET : FIRE_PALETTES[name];
    const f = this.game.fx?.fire;
    if (pal && f?.setPalette?.(kind, pal)) this._slot[kind] = name;
  }
  /** The palettes the slots hold now: { void, fire } (the tests read it). */
  get slots() {
    return { void: this._slot.void, fire: this._slot.fire };
  }
  /** Keep the void slot violet for at least `s` s (soft: a trench's glow a knot may cut). */
  _violet(s = 0.25, soft = false) {
    if (soft) this._violetSoftT = Math.max(this._violetSoftT, s);
    else this._violetT = Math.max(this._violetT, s);
    this._setSlot('void', 'violet');
  }
  /** A knot wants the void slot blue: a trench's glow gives way (the Null itself does not). */
  _azure() {
    this._violetSoftT = 0;
    if (!(this._violetT > 0)) this._setSlot('void', 'azure');
  }
  _crimson(s = 2) {
    this._crimsonT = Math.max(this._crimsonT, s);
    this._setSlot('fire', 'crimson');
  }
  /** Which palette the slots should hold now (every frame). */
  _slots(d, fdt) {
    this._violetT = Math.max(0, this._violetT - fdt);
    this._violetSoftT = Math.max(0, this._violetSoftT - fdt);
    this._crimsonT = Math.max(0, this._crimsonT - fdt);
    this._setSlot('void', this._violetT > 0 || this._violetSoftT > 0 ? 'violet' : 'azure');
    const live = d && LIVE.has(d.mode);
    this._setSlot('fire', live || this._crimsonT > 0 ? 'crimson' : 'fire');
  }

  /** A light: the inherited draws' violet is azure while the void slot is (violet under the Null), the
   *  engine's orange fire light is crimson while the fire slot is. */
  _light(o) {
    if (o) {
      if (violet(o.color) && this._slot.void === 'azure') o.color = L_AZURE;
      else if (orange(o.color) && this._slot.fire === 'crimson') o.color = L_CRIMSON;
    }
    return this.game.lights?.add?.(o) ?? null;
  }
  /** A glyph particle (the inherited draws' violet motes are blue while the slot is). */
  _spawn(pool, o) {
    if (!pool || !o || !Number.isFinite(o.x + o.y + o.z)) return;
    if (this._slot.void === 'azure') {
      if (violet(o.color)) o.color = AZURE_G;
      if (violet(o.colorEnd)) o.colorEnd = AZURE_G_END;
    }
    pool.spawn(o);
  }
  /** A light kept while asked for every frame, in the colour asked (AscFx turns it gold). */
  _keep(key, x, y, z, color, intensity, radius, flicker = 0) {
    return super._keep(key, x, y, z, color, intensity, radius, flicker);
  }
  /** One-shot sound of an effect (audio.js maps `dragon:spell` names starting with 'wj'). */
  _say(name, x, z, extra = 0) {
    try {
      this.d?.emit?.('dragon:spell', { name, x: fin(x), z: fin(z), dur: fin(extra) });
    } catch (err) {
      console.error('[untouched] fx sound', err);
    }
  }

  reset() {
    super.reset();
    for (const r of this._ripples) r.alive = false;
    for (const s of this._shoves) s.alive = false;
    this._crackN = 0;
    this._knit.alive = false;
    this._openFlash.alive = false;
    this._eyeOk = false;
    this._drive = null;
    this._debugNear = 0;
    SPELL_FX.resetState?.(this, this._spellState);
    DOMAIN_FX.resetState?.(this, this._domainState);
    this._violetT = this._violetSoftT = this._crimsonT = 0;
    this._setSlot('void', 'azure');
    this._setSlot('fire', 'fire');
  }

  update(dt, d) {
    super.update(dt, d);
    const fdt = Math.max(0, Math.min(0.1, fin(this.game.fxDt, dt)));
    this._wjUpdate(fdt, d);
  }

  /** Every frame: the debug timeline, the held records, the slots. */
  _wjUpdate(fdt, d) {
    if (this._drive) {
      try {
        if (FX_DEBUG.step?.(d, this._drive, fdt) === false) this._drive = null;
      } catch (err) {
        console.error('[untouched] fxDebug step', err);
        this._drive = null;
      }
    }
    if (fdt > 0) {
      this._ripplesUpdate(fdt);
      this._shovesUpdate(fdt);
      if (this._knit.alive) this._knitDraw(d, fdt);
      if (this._openFlash.alive) this._openFlashDraw(d, fdt);
      SPELL_FX.update?.(this, this._spellState, fdt);
      DOMAIN_FX.update?.(this, this._domainState, fdt);
    }
    this._slots(d, fdt);
    const c = this.game.fx?.fire?.count;
    if (c > this.blobPeak) this.blobPeak = c;
  }

  // ---------------------------------------------------------------- the shell's frame
  /** The shell this frame, in the camera's plane: centre (pulled toward the camera, so it is drawn in
   *  front of his body), half-width rx along the camera's right, half-height hu along its up. */
  _shell(d) {
    const S = this._sh;
    S.ok = false;
    const p = d?.position;
    if (!p || !Number.isFinite(p.x + p.y + p.z)) return S;
    let top = 0, R = 0.3;
    const hs = d._hs ?? [], base = d._hsR;
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i], r = fin(base?.[i], h.r);
      if (!Number.isFinite(h.x + h.y + h.z + r)) continue;
      top = Math.max(top, h.y + r - p.y);
      R = Math.max(R, Math.hypot(h.x - p.x, h.z - p.z) + r);
    }
    if (!(top > 0.8)) top = 2.1;
    const rx = R + SHELL.pad, ry = top * 0.5 + SHELL.pad;
    const A = this._axes();
    // (a standing ellipsoid seen down the camera's axis: its outline's half-height along the camera's up)
    const cu = Math.abs(A.uy), su = Math.sqrt(Math.max(0, 1 - cu * cu));
    S.rx = rx;
    S.hu = Math.hypot(ry * cu, rx * su);
    S.top = top;
    S.px = p.x;
    S.pz = p.z;
    S.fy = p.y;
    const P = this._toCamera(p.x, p.y + top * 0.5, p.z);
    S.x = P.x;
    S.y = P.y;
    S.z = P.z;
    S.ok = true;
    return S;
  }
  /** A point of the shell's plane: (s, u) in units of its half-width / half-height (1 = on its outline). */
  _shellPt(s, u, out = this._wp) {
    const S = this._sh, A = this._axes(), a = s * S.rx, b = u * S.hu;
    out.x = S.x + A.rx * a + A.ux * b;
    out.y = S.y + A.ry * a + A.uy * b;
    out.z = S.z + A.rz * a + A.uz * b;
    return out;
  }
  /** Where a world point falls on the shell's plane: this._wq = { x: s, y: u } (units of its radii). */
  _onShell(x, y, z) {
    const S = this._sh, A = this._axes(), dx = x - S.x, dy = y - S.y, dz = z - S.z, Q = this._wq;
    Q.x = (dx * A.rx + dy * A.ry + dz * A.rz) / Math.max(0.05, S.rx);
    Q.y = (dx * A.ux + dy * A.uy + dz * A.uz) / Math.max(0.05, S.hu);
    return Q;
  }
  /** The shell's outline from angle a0 to a1 (rad, 0 = his right as the camera sees him), written on
   *  the letter grid this frame at `heat` (h1 at a1); `dash` > 0 leaves every other piece out. */
  _rim(a0, a1, heat, h1 = heat, scale = 1, dash = 0, step = 0.13) {
    if (!(heat > 0.02 || h1 > 0.02)) return;
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n, P = this._shellPt(Math.cos(a) * scale, Math.sin(a) * scale);
      if (i > 0 && !(dash > 0 && i % 2 === 0)) {
        const h = heat + ((h1 - heat) * i) / n;
        this._ink(px, py, pz, P.x, P.y, P.z, 0, h, 0, h, 1);
      }
      px = P.x;
      py = P.y;
      pz = P.z;
    }
  }

  // ---------------------------------------------------------------- the barrier
  /** Every frame (barrier.frame): the shell while up (?wjShell), its cracks, the open sign. */
  barrierIdle(d, dt) {
    void dt;
    const B = d?.barrier;
    if (!B || !this.fire || d.mode === 'dead' || d.mode === 'sleep') return;
    const S = this._shell(d);
    if (!S.ok || !(this._frame() > 0)) return;
    const t = this._now();
    if (B.up) {
      const look = wjFxLook('wjShell');
      // where something nears it: the hero's blade (his swing) lights the side of the shell it comes at
      const near = this._nearShell(d);
      if (near.k > 0.02) {
        const a = near.a, w = 0.55 + 0.35 * near.k;
        this._rim(a - w, a, 0.12, 0.62 * near.k);
        this._rim(a, a + w, 0.62 * near.k, 0.12);
      }
      if (look === 'b') {
        // a faint standing shell: sparse short strokes crawling slowly round it
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + t * 0.35 + hash(i * 3.1) * 0.5, h = 0.3 + 0.1 * Math.sin(t * 1.7 + i * 2.3);
          this._rim(a, a + 0.22, h, h);
        }
      } else if (look === 'c') {
        // concentric rings that breathe: two dashed outlines, the inner one swelling out to the outer
        const br = 0.5 + 0.5 * Math.sin(t * 2.1);
        this._rim(0, TAU, 0.24 + 0.1 * br, 0.24 + 0.1 * br, 1, 1, 0.16);
        this._rim(0.08, TAU + 0.08, 0.18 + 0.12 * (1 - br), 0.18 + 0.12 * (1 - br), 0.72 + 0.22 * br, 1, 0.2);
      }
      this._cracksDraw(d, B, t);
    } else {
      this._openSign(d, B, t);
    }
  }

  /** How near the hero's blade is to the shell: { k 0..1, a its angle on the shell's outline }. */
  _nearShell(d) {
    const o = (this._nr ??= { k: 0, a: 0 });
    o.k = 0;
    const p = this.game.player, S = this._sh;
    if (!p?.position) return o;
    const atk = !!p.atk, tip = p._tip;
    const usTip = atk && tip && Number.isFinite(tip.x + tip.y + tip.z);
    const x = usTip ? tip.x : p.position.x, y = usTip ? tip.y : 1.1, z = usTip ? tip.z : p.position.z;
    const dist = Math.hypot(x - S.px, z - S.pz) - S.rx;
    const k = (atk ? 1 : 0) * clamp01(1 - dist / SHELL.near);
    o.k = Math.max(k, this._debugNear);
    const Q = this._onShell(p.position.x, 1.1, p.position.z);
    o.a = Math.atan2(Q.y, Q.x);
    void y;
    return o;
  }

  /** The cracks on the shell (n of N), each its own seeded line in from the outline; a fresh one flashes. */
  _cracksDraw(d, B, t) {
    const n = Math.min(8, Math.round(fin(B.cracks, 0)));
    if (n < this._crackN) this._crackN = n; // (they faded)
    if (!(n > 0)) return;
    const C = SHELL.crack, fade = 1 - 0.45 * clamp01(fin(B.crackT, 0) / Math.max(1, fin(B.T?.crackFade, 9)));
    for (let i = 0; i < n; i++) {
      const fresh = clamp01(1 - (t - this._crackAt[i]) / C.freshT);
      const h = (C.heat + (C.fresh - C.heat) * fresh) * fade;
      // where it starts on the outline (spread round it, the first on the side the hero came from)
      const a0 = 0.7 + i * 2.35 + hash(i + 0.37) * 0.5;
      let s = Math.cos(a0) * 0.98, u = Math.sin(a0) * 0.98;
      this._rim(a0 - 0.3, a0 + 0.3, 0.1, 0.1 + 0.32 * fade); // the outline at its root, a little
      let P = this._shellPt(s, u), px = P.x, py = P.y, pz = P.z;
      let dir = Math.atan2(-u, -s);
      for (let j = 0; j < C.steps; j++) {
        dir += (hash(i * 7.3 + j * 1.9) - 0.5) * 1.3;
        const L = C.len * (0.8 + 0.5 * hash(i * 2.9 + j * 5.1));
        s += Math.cos(dir) * L;
        u += Math.sin(dir) * L;
        P = this._shellPt(s, u);
        this._ink(px, py, pz, P.x, P.y, P.z, 0, h, 0, h * 0.9, 1);
        // a branch off the second joint
        if (j === 1) {
          const bd = dir + (hash(i + 9.1) < 0.5 ? 0.9 : -0.9), bs = s + Math.cos(bd) * C.len * 0.8, bu = u + Math.sin(bd) * C.len * 0.8;
          const Q = this._shellPt(bs, bu, this._wq);
          this._ink(P.x, P.y, P.z, Q.x, Q.y, Q.z, 0, h * 0.8, 0, h * 0.6, 1);
          P = this._shellPt(s, u);
        }
        px = P.x;
        py = P.y;
        pz = P.z;
      }
    }
  }

  /** While open: a ring of steel on the floor round him that runs out with the time left (the player
   *  times his cuts by it); in its last 0.5 s it blinks and the shell knits back in pieces. */
  _openSign(d, B, t) {
    const dur = Math.max(0.1, fin(B.openDur, 1)), left = Math.max(0, fin(B.openT, 0)), f = clamp01(left / dur);
    const S = this._sh, G = SHELL.sign, r = S.rx + G.r, x = S.px, z = S.pz, y = S.fy + GROUND_Y;
    const late = left < G.blink;
    const on = !late || Math.floor(t * 10) % 2 === 0;
    if (f > 0.005 && on) {
      // (the arc starts nearest the camera and runs round: what is left of it is the time left)
      const A = this._axes(), a0 = Math.atan2(-A.uz, -A.ux);
      const n = Math.max(2, Math.ceil((f * TAU) / 0.16)), h = G.heat * GROUND_GAIN;
      let px = x + Math.cos(a0) * r, pz = z + Math.sin(a0) * r;
      for (let i = 1; i <= n; i++) {
        const a = a0 + (f * TAU * i) / n, qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r;
        this._ink(px, y, pz, qx, y, qz, 0, h, 0, h, 1);
        px = qx;
        pz = qz;
      }
      this._dot(px, y + 0.05, pz, 0.24, 1.3 * GROUND_GAIN * 0.6, K_STEEL); // the hand of the clock
    }
    if (late) {
      // it knits back in pieces: more of the outline each frame, toward whole
      const q = clamp01(1 - left / G.blink), m = 16;
      for (let i = 0; i < m; i++) if (hash(i * 4.7 + 0.3) < q) this._rim((i / m) * TAU, ((i + 1) / m) * TAU, 0.5 * q, 0.5 * q);
    }
  }

  /** The blade stopped on the shell: a ripple of crisp strokes spreading over a patch of it from the
   *  point, a white point where it stopped, a short dull push of air back at the hero. */
  barrierStop(point, dir, heavy = false) {
    if (!point || !Number.isFinite(point.x + point.y + point.z)) return;
    const d = this.d, S = this._shell(d);
    if (!S.ok) return;
    const dx = fin(dir?.x), dz = fin(dir?.z);
    // (a free ripple, else the oldest)
    let r = this._ripples[0];
    for (const q of this._ripples) {
      if (!q.alive) {
        r = q;
        break;
      }
      if (q.t > r.t) r = q;
    }
    const Q = this._onShell(point.x, point.y, point.z);
    // (a point inside the outline stays where it is; one outside is brought onto it)
    const l = Math.hypot(Q.x, Q.y);
    r.alive = true;
    r.t = 0;
    r.s = l > 0.95 ? (Q.x / l) * 0.95 : Q.x;
    r.u = l > 0.95 ? (Q.y / l) * 0.95 : Q.y;
    r.heavy = !!heavy;
    const P = this._shellPt(r.s, r.u);
    this._blob(P.x, P.y, P.z, 0, 0, 0, 0.09, 0.26, 0.16, 1.55, 0.4, K_STEEL);
    // the push of air: a small ring thrown out of the point, a few strokes back toward the hero
    this._shock(P.x, P.y, P.z, heavy ? 1.3 : 0.95, 12, 0.16, 0.3, 0.46, 0.42, K_STEEL, 0.15, 3);
    for (let i = 0; i < (heavy ? 8 : 5); i++) {
      const a = this.lrand(-0.7, 0.7), sp = this.lrand(2.5, 5.5), c = Math.cos(a), sn = Math.sin(a);
      const o = this._rec(P.x, P.y, P.z, this.lrand(0.12, 0.22), 0.13, 0.04, "-'", PALE, PALE_END);
      o.vx = (-dx * c + dz * sn) * sp;
      o.vy = this.lrand(-0.5, 1.5);
      o.vz = (-dz * c - dx * sn) * sp;
      o.drag = 5;
      this._spawn(this.add, o);
    }
    this._light({ x: P.x, y: P.y, z: P.z, color: L_PALE, intensity: heavy ? 2.4 : 1.6, radius: 3.5, life: 0.12, fade: 0.1 });
  }

  _ripplesUpdate(fdt) {
    const R = SHELL.ripple, S = this._sh;
    let framed = false;
    for (const r of this._ripples) {
      if (!r.alive) continue;
      r.t += fdt;
      if (r.t > R.T + R.lag * (R.rings - 1)) {
        r.alive = false;
        continue;
      }
      if (!framed) {
        this._shell(this.d);
        framed = true;
        if (!S.ok || !(this._frame() > 0)) return;
      }
      for (let q = 0; q < R.rings; q++) {
        const tt = r.t - q * R.lag;
        if (tt < 0 || tt > R.T) continue;
        const f = tt / R.T, rad = (0.06 + R.r * (r.heavy ? R.heavy : 1) * Math.pow(f, 0.6)) / Math.max(0.3, S.rx);
        const h = R.heat * (1 - f) * (q ? 0.7 : 1);
        // a ring round the point on the shell's plane, cut where it leaves the outline
        let px = 0, py = 0, pz = 0, ok = false;
        for (let i = 0; i <= R.seg; i++) {
          const a = (i / R.seg) * TAU + q * 0.4, s = r.s + Math.cos(a) * rad, u = r.u + Math.sin(a) * rad * (S.rx / Math.max(0.3, S.hu)) * 1.4;
          const inside = s * s + u * u < 1.08;
          const P = this._shellPt(s, u);
          if (ok && inside) this._ink(px, py, pz, P.x, P.y, P.z, 0, h, 0, h, 1);
          ok = inside;
          px = P.x;
          py = P.y;
          pz = P.z;
        }
      }
    }
  }

  /** An ordinary parry added a crack (n of `of`): it is drawn every frame from now on (barrierIdle). */
  barrierCrack(n, of) {
    const i = Math.max(0, Math.min(7, Math.round(fin(n, 1)) - 1));
    this._crackAt[i] = this._now();
    this._crackN = Math.max(this._crackN, i + 1);
    const S = this._shell(this.d);
    if (!S.ok) return;
    // a snap: a few strokes off where it starts
    const a0 = 0.7 + i * 2.35 + hash(i + 0.37) * 0.5, P = this._shellPt(Math.cos(a0) * 0.98, Math.sin(a0) * 0.98);
    for (let j = 0; j < 6; j++) {
      const o = this._rec(P.x, P.y, P.z, this.lrand(0.25, 0.45), 0.14, 0.05, "/\\'", SHARD, SHARD_END);
      o.vx = this.lrand(-1.5, 1.5);
      o.vy = this.lrand(-0.5, 1.2);
      o.vz = this.lrand(-1.5, 1.5);
      o.gravity = -6;
      o.drag = 2;
      this._spawn(this.add, o);
    }
    this._light({ x: P.x, y: P.y, z: P.z, color: L_PALE, intensity: 1.4 + 0.6 * fin(n / Math.max(1, of), 0), radius: 3, life: 0.14, fade: 0.12 });
  }

  /** It breaks: the whole shell flashes once, shards of strokes fall off it as letters, a ring of air. */
  barrierOpen(d) {
    const S = this._shell(d);
    if (!S.ok) return;
    this._openFlash.alive = true;
    this._openFlash.t = 0;
    const n = 44;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.lrand(-0.06, 0.06), rr = this.lrand(0.45, 1.02);
      const P = this._shellPt(Math.cos(a) * rr, Math.sin(a) * rr);
      const A = this._axes(), out = this.lrand(1.2, 3.2), c = Math.cos(a), s = Math.sin(a);
      const o = this._rec(P.x, P.y, P.z, this.lrand(0.55, 1.0), this.lrand(0.15, 0.22), 0.07, i % 3 ? "/\\|-" : "_'", SHARD, SHARD_END);
      o.vx = (A.rx * c + A.ux * s) * out;
      o.vy = (A.ry * c + A.uy * s) * out + this.lrand(0.2, 1.4);
      o.vz = (A.rz * c + A.uz * s) * out;
      o.gravity = -9;
      o.drag = 1.2;
      o.spin = this.lrand(-5, 5);
      this._spawn(i % 2 ? this.add : this.alpha, o);
    }
    this._shock(S.px, S.fy + 1.1, S.pz, 2.4, 26, 0.26, 0.36, 0.7, 0.5, K_STEEL, 0.4, 2.5);
    this._light({ x: S.px, y: S.fy + 1.3, z: S.pz, color: L_PALE, intensity: 4.5, radius: 7, life: 0.22, fade: 0.2 });
  }

  _openFlashDraw(d, fdt) {
    const F = this._openFlash;
    F.t += fdt;
    if (F.t > 0.16 || !d?.barrier || d.barrier.up) {
      F.alive = false;
      return;
    }
    const S = this._shell(d);
    if (!S.ok || !(this._frame() > 0)) return;
    const h = 0.85 * (1 - F.t / 0.16);
    this._rim(0, TAU, h, h);
  }

  /** It knits back: the whole outline drawn in and fading to the quiet shell; motes drawn to it. */
  barrierClose(d) {
    this._knit.alive = true;
    this._knit.t = 0;
    const S = this._shell(d);
    if (!S.ok) return;
    for (let i = 0; i < 18; i++) {
      const a = this.lr() * TAU, P = this._shellPt(Math.cos(a), Math.sin(a)), lf = this.lrand(0.16, 0.26);
      const A = this._axes(), out = this.lrand(0.6, 1.2), c = Math.cos(a), s = Math.sin(a);
      const ox = (A.rx * c + A.ux * s) * out, oy = (A.ry * c + A.uy * s) * out, oz = (A.rz * c + A.uz * s) * out;
      const o = this._rec(P.x + ox, P.y + oy, P.z + oz, lf, 0.12, 0.05, ".'", PALE, PALE_END);
      o.vx = -ox / lf;
      o.vy = -oy / lf;
      o.vz = -oz / lf;
      o.alpha = 0.3;
      o.alphaEnd = 1;
      this._spawn(this.add, o);
    }
  }

  _knitDraw(d, fdt) {
    const K = this._knit;
    K.t += fdt;
    if (K.t > SHELL.knit || !d?.barrier?.up) {
      K.alive = false;
      return;
    }
    const S = this._shell(d);
    if (!S.ok || !(this._frame() > 0)) return;
    const f = K.t / SHELL.knit, h = f < 0.25 ? 0.62 * (f / 0.25) : 0.62 * (1 - (f - 0.25) / 0.75);
    this._rim(0, TAU, h, h);
  }

  // ---------------------------------------------------------------- the body
  /** He is gone: the air falls into where he stood (quiet; the afterimage is afterimage's). */
  blinkOut(d) {
    const p = d?.position;
    if (!p || !Number.isFinite(p.x + p.z)) return;
    for (let i = 0; i < 12; i++) {
      const a = this.lr() * TAU, r = this.lrand(0.6, 1.2), h = this.lrand(0.3, 2.0), lf = this.lrand(0.14, 0.24);
      const o = this._rec(p.x + Math.cos(a) * r, h, p.z + Math.sin(a) * r, lf, 0.13, 0.04, "-'.", PALE, PALE_END);
      o.vx = (-Math.cos(a) * r) / lf;
      o.vy = (1.1 - h) / lf;
      o.vz = (-Math.sin(a) * r) / lf;
      o.alpha = 0.25;
      o.alphaEnd = 0.9;
      this._spawn(this.add, o);
    }
    this._say('wjBlink', p.x, p.z);
  }

  /** He is there: a thin outline of him a hand's width off his body, gone at once; a tick of strokes. */
  blinkIn(d) {
    const p = d?.position;
    if (!p || !Number.isFinite(p.x + p.z)) return;
    const A = this._axes(), side = this.lr() < 0.5 ? -1 : 1;
    this.ghost(d, this._ghostOpt(0, 0, 0.18, 1, A.rx * 0.16 * side, A.rz * 0.16 * side));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + this.lr() * 0.6, c = Math.cos(a), s = Math.sin(a);
      const x0 = p.x + c * 0.55, z0 = p.z + s * 0.55;
      this._ink(x0, 0.9 + i * 0.25, z0, x0 + c * 0.5, 0.9 + i * 0.25, z0 + s * 0.5, 0.1, 0.55, 0, 0.2);
    }
  }

  /** The engine's blink hook (core's blinkTo calls it between blinkOut and blinkIn): no streak, a breath of dust. */
  vanish(d, x0, z0, x1, z1) {
    if (!Number.isFinite(x0 + z0 + x1 + z1)) return;
    this.dust(x0, z0, 0.45);
    this.dust(x1, z1, 0.55);
  }

  /** His eyes: two points of blue (the void slot), white hearts as k rises; a short blue trail when his head turns fast. */
  eyes(d, k) {
    if (!this.fire || !d || !(k > 0.02)) return;
    const e = d.eyePoint?.(this._eye);
    if (!e || !Number.isFinite(e.x + e.y + e.z)) return;
    const life = this._frame();
    if (!(life > 0)) return;
    const rx = Math.cos(d.yaw), rz = -Math.sin(d.yaw);
    const fdt = Math.max(1e-3, fin(this.game.fxDt, 0.016));
    for (const s of [-1, 1]) {
      const ex = e.x + rx * 0.045 * s, ez = e.z + rz * 0.045 * s;
      this._blob(ex, e.y, ez, 0, 0, 0, life, 0.1 + 0.1 * k, 0.1 + 0.1 * k, 0.45 + 0.5 * k, 0.45 + 0.5 * k, K_VOID);
      if (k > 0.4) this._blob(ex, e.y, ez, 0, 0, 0, life, 0.06, 0.06, 0.5 + 0.4 * (k - 0.4), 0.5, K_STEEL);
    }
    if (this._eyeOk) {
      const P = this._eyePrev, mv = Math.hypot(e.x - P.x, e.y - P.y, e.z - P.z), sp = mv / fdt;
      if (sp > 2.2 && mv < 1.2) {
        const n = Math.min(6, Math.ceil(mv / 0.06));
        for (let i = 0; i < n; i++) {
          const u = i / n;
          this._blob(P.x + (e.x - P.x) * u, P.y + (e.y - P.y) * u, P.z + (e.z - P.z) * u, 0, 0.1, 0, 0.12 + 0.08 * u, 0.16, 0.08, 0.34 * k, 0, K_VOID);
        }
      }
    }
    this._eyePrev.copy(e);
    this._eyeOk = true;
    if (k > 0.3) this._keep('wjEyes', e.x, e.y, e.z, L_AZURE, 0.3 + 1.0 * k, 1.6 + 2 * k, 0.1);
  }

  /** A figure of steel left where he was (DuelFx.ghost), drifting the way he went. */
  afterimage(d, dx = 0, dz = 0, life = 0.4) {
    if (!d) return 0;
    return this.ghost(d, this._ghostOpt(fin(dx), fin(dz), fin(life, 0.4), 1, 0, 0, 0, 0, 0));
  }

  // ---------------------------------------------------------------- the spells
  drawKnot(knot, dt) {
    this.spellFx.drawKnot?.(this, knot, dt);
  }
  drawCollapse(knot) {
    this.spellFx.drawCollapse?.(this, knot);
  }
  castPoint(p, dt) {
    this.spellFx.castPoint?.(this, p, dt);
  }
  castBurst(x, z, r, power) {
    this.spellFx.castBurst?.(this, x, z, r, power);
  }
  nullCharge(d, k, blue, red) {
    this.spellFx.nullCharge?.(this, d, k, blue, red);
  }
  nullBeam(seg, k) {
    this.spellFx.nullBeam?.(this, seg, k);
  }
  nullEnd(seg) {
    this.spellFx.nullEnd?.(this, seg);
  }

  // ---------------------------------------------------------------- the domain
  domainSign(d, k) {
    this.domainFx.domainSign?.(this, d, k);
  }
  domainWall(x, z, r, k) {
    this.domainFx.domainWall?.(this, x, z, r, k);
  }
  domainCaught(hero, k) {
    this.domainFx.domainCaught?.(this, hero, k);
  }
  domainBreak(x, z) {
    this.domainFx.domainBreak?.(this, x, z);
  }

  // ---------------------------------------------------------------- weight
  /** The camera for a blow of his (WJ_WEIGHT[kind]); (dx, dz): the blow's way. Returns the row. */
  weight(kind = 'light', dx = 0, dz = 0) {
    const W = WJ_WEIGHT[kind] ?? WJ_WEIGHT.light, g = this.game;
    g.shake?.(W.shake);
    g.punch?.(W.punch);
    const l = Math.hypot(fin(dx), fin(dz));
    if (l > 1e-3) g.kick?.(dx / l, 0, dz / l, W.kick);
    return W;
  }

  /** The hero thrown / slid dist m along (dx, dz) from (x, z): his heels' skid on the floor, dust and
   *  grit kicked up along it as he goes (drawn over the slide's time, ~dist / 7 s). */
  shove(x, z, dx, dz, dist) {
    const l = Math.hypot(fin(dx), fin(dz));
    if (!Number.isFinite(x + z) || !(l > 1e-4) || !(dist > 0.2)) return;
    const s = this._shoves.find((q) => !q.alive) ?? this._shoves[0];
    s.alive = true;
    s.t = 0;
    s.T = Math.min(0.9, Math.max(0.25, dist / 7));
    s.x = x;
    s.z = z;
    s.dx = dx / l;
    s.dz = dz / l;
    s.dist = Math.min(16, dist);
    s.done = 0;
    s.acc = 0;
    this.dust(x, z, 0.6 + 0.08 * Math.min(10, dist));
    this._say('wjShove', x, z, dist);
  }

  _shovesUpdate(fdt) {
    for (const s of this._shoves) {
      if (!s.alive) continue;
      s.t += fdt;
      const f = clamp01(s.t / s.T), to = s.dist * (1 - (1 - f) * (1 - f)); // (it slows as it ends)
      const rot = this._screenRot(s.dx, 0, s.dz) + Math.PI / 2, px = -s.dz, pz = s.dx;
      while (s.done < to) {
        s.done += 0.14;
        const x = s.x + s.dx * s.done, z = s.z + s.dz * s.done, slow = 1 - s.done / Math.max(0.5, s.dist);
        // the heels' two lines, lying on the floor
        for (const side of [-1, 1]) {
          const o = this._rec(x + px * 0.13 * side, 0.04, z + pz * 0.13 * side, this.lrand(1.0, 1.6), 0.26, 0.24, '-=_', SKID, SKID_END);
          o.rot = rot;
          o.alpha = 0.85;
          o.alphaEnd = 0;
          this._spawn(this.alpha, o);
        }
        s.acc += 1;
        if (s.acc % 3 === 0) {
          this._blob(x, 0.75, z, s.dx * 1.4 * slow + this.lrand(-0.3, 0.3), this.lrand(0.3, 0.8), s.dz * 1.4 * slow + this.lrand(-0.3, 0.3), this.lrand(0.5, 0.8), 0.55, 1.4, 0.5, 0, K_SMOKE, 1.5, 0.5);
          const g = this._rec(x, 0.15, z, this.lrand(0.4, 0.7), 0.2, 0.08, ".,'`", SKID, SKID_END);
          g.vx = s.dx * this.lrand(2, 5) * slow + px * this.lrand(-1.5, 1.5);
          g.vy = this.lrand(1, 3);
          g.vz = s.dz * this.lrand(2, 5) * slow + pz * this.lrand(-1.5, 1.5);
          g.gravity = -9;
          g.drag = 1.5;
          this._spawn(this.alpha, g);
        }
      }
      if (f >= 1) s.alive = false;
    }
  }

  /** A thrown hero went through a piece at (x, z) along (dx, dz): a burst of its letters thrown on along
   *  his path, dust, a ring of air. power ~1 - 2. */
  crash(x, z, dx, dz, power = 1) {
    const l = Math.hypot(fin(dx), fin(dz));
    if (!Number.isFinite(x + z) || !(l > 1e-4)) return;
    const ux = dx / l, uz = dz / l, k = Math.min(2, Math.max(0.5, fin(power, 1)));
    for (let i = 0; i < Math.round(22 * k); i++) {
      const a = Math.atan2(uz, ux) + this.lrand(-0.9, 0.9), sp = this.lrand(3, 9) * (0.7 + 0.3 * k);
      const o = this._rec(x, this.lrand(0.3, 1.5), z, this.lrand(0.5, 1.0), this.lrand(0.15, 0.24), 0.07, '#%&=+.,', STONE, STONE_END);
      o.vx = Math.cos(a) * sp;
      o.vy = this.lrand(1, 5.5);
      o.vz = Math.sin(a) * sp;
      o.drag = 1.3;
      o.gravity = -12;
      o.spin = this.lrand(-6, 6);
      this._spawn(this.alpha, o);
    }
    this._shock(x, 1.0, z, 1.6 * k, 16, 0.2, 0.34, 0.6, 0.42, K_STEEL, 0.3, 3);
    this.dust(x, z, 0.9 * k);
  }
}

export { K_FIRE, K_SMOKE, K_VOID, K_STEEL, GROUND_Y, GROUND_GAIN };
