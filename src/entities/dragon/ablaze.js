import * as THREE from 'three';
import { ABLAZE as A } from './tuningAblaze.js';
import { SCALE, TUNING } from './tuning.js';
import { HORN_TIPS, wyrmFace } from './heads.js';

// THE WYRM ABLAZE (phase 3). The Cinder Wyrm sets itself on fire: a beat of the phase-3 roar runs fire
// out from the chest along the wing arms to the tips, down the legs to the claws and along the tail
// (ignite), it flares at every end, and from then on flames stand on its wing tips (and some of the
// trailing edge), its four claws and the last third of its tail, with a larger flame at the tail's
// end (look c: the horns and the spine's crest too). Every flame is heat in the fire field
// (render/fireField.js, ADR-113): blobs born at the part that keep only a little of its velocity, so
// at rest they stand and climb, and on a fast move they are left behind along its path (a wing sweep
// paints an arc, a tail whip a ribbon, a dive a comet's tail). Embers are small glyph particles.
//
// It burns the world, not the hero: wood a burning part passes catches (world.ignite(..., false):
// wood only, the world's own caps), and in looks b and c the grass under a planted foot or the
// dragging tail chars and glows (the scorch map) with a few small low flames for a moment; never
// world.fire, whose fire hurts. No hit volume, damage or timing of any attack changes.
//
// Readable: a timing cue (combat:flash) dims the fire round it, a red / black body glow dims all of
// it, the breath's charge dims the head's flames, and a flame next to the hero burns low.
// Life cycle: off in phases 1 and 2; lit by the roar (ignite) or, entered any other way, quickly by
// itself; it gutters through a stagger, a posture break and the plunge's reaction; it goes out along
// the body on death (douse); reset() puts it out at once.
// Its own random numbers (the fight's Math.random sequence is the same with or without it), no
// allocation per frame, every position checked for NaN.

const S = SCALE;
const LOOKS = ['off', 'a', 'b', 'c'];
let LOOK = 'b';
try {
  const v = new URLSearchParams(globalThis.location?.search ?? '').get('ablaze');
  if (LOOKS.includes(v)) LOOK = v;
} catch {
  /* headless */
}
/** The strength in use: 'off' | 'a' | 'b' | 'c' (?ablaze=, default b). */
export const ablazeLook = () => LOOK;
export const setAblazeLook = (k) => {
  if (LOOKS.includes(k)) LOOK = k;
};

// (the seed lives in a typed array: a module variable holding a 32-bit number boxed it on every draw)
const SEED = new Int32Array([0x5eed1a2e]);
const rnd = () => {
  const seed = (SEED[0] = (SEED[0] + 0x6d2b79f5) | 0);
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rand = (a, b) => a + rnd() * (b - a);
// the hot loops draw from a table of random numbers with an index of their own (a call that returns a
// double is boxed when it is not inlined, and the standing fire draws ~150 numbers a frame)
const RM = 8191;
const RT = new Float64Array(RM + 1);
for (let i = 0; i <= RM; i++) RT[i] = rnd();
const RI = new Int32Array(1);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// (Math.hypot boxed its arguments: ~2 KB a frame over the sites)
const dist = (a, b) => {
  const x = b.x - a.x, y = b.y - a.y, z = b.z - a.z;
  return Math.sqrt(x * x + y * y + z * z);
};
const EMBERS = ".'`*";
const EMBER_COL = [3.0, 1.0, 0.18];
const EMBER_END = [0.8, 0.08, 0.012];
const ENDS = new Set(['tip', 'claw', 'tailTip']); // where the ignition flares
const WOOD = new Set(['tip', 'edge', 'claw', 'tail', 'tailTip']);
const CUES = 3;

export class Ablaze {
  constructor(dragon) {
    this.d = dragon;
    this.game = dragon.game;
    // the horns' tips of the head it wears (heads.js HORN_TIPS, in headVis's frame: look c's horn fire)
    this._hornTip = HORN_TIPS[wyrmFace()] ?? HORN_TIPS.old;
    this._headVis = null;
    this._hornV = new THREE.Vector3();
    /** 'off' | 'igniting' | 'burning' | 'dousing' */
    this.mode = 'off';
    this.t = 0; // the mode's clock
    this.s = 0; // the ignition's front, 0 the chest .. 1 the tips (dousing: runs back)
    this.level = 0; // the gutter's level (1 burning, A.gutter.level guttering)
    this.flared = false;
    this.stamps = 0; // blobs spawned this frame (and the most in one frame since the last reset)
    this.peak = 0;
    this.lit = 0; // wood lit by the body since the last reset
    this._tokens = 1; // wood: the per-minute budget
    this._woodI = 0;
    this._emberAcc = 0;
    this._cap = 0; // stamps left this frame
    this._b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 1, sizeEnd: 1, heat: 0.3, heatEnd: 0, drag: 0, gravity: 0, kind: 0 };
    this._e = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.3, sizeEnd: 0.05, glyph: EMBERS, color: EMBER_COL, colorEnd: EMBER_END, alpha: 1, alphaEnd: 0, drag: 0.6, gravity: 1.5, flicker: 0.5 };
    this._v = { x: 0, y: 0, z: 0 }; // scratch: a point on a path
    this._lights = [null, null];
    this._cues = Array.from({ length: CUES }, () => ({ t: 0, x: 0, y: 0, z: 0 }));
    this._cueOut = new THREE.Vector3(); // scratch: a striking part's point
    this._prints = Array.from({ length: A.print.slots }, () => ({ t: 0, life: 1, x: 0, z: 0, acc: 0 }));
    this._dragT = 0;
    this._build();
    // a timing cue anywhere (the wyrm's blows, its hazards' flares): the fire round it dims
    this._onFlash = (e) => {
      if (e?.source === 'dragon' && this.mode !== 'off') this.cue(e.x, e.y ?? 1, e.z);
    };
    this.game.events?.on?.('combat:flash', this._onFlash);
  }

  /** The sites that burn and the paths the ignition runs along (references to the rig's live points). */
  _build() {
    const r = this.d.rig, pt = r.pt, tail = r.tail.p, neck = r.neck.p;
    const sites = (this.sites = []);
    const add = (kind, a, b = null, t = 0, extra = null) => {
      const T = A.sites[kind];
      // (one literal, every field a number from the start: an object built with a spread ended up a
      // dictionary, whose every double store made a new heap number, ~4 KB a frame)
      const s = {
        kind, T, a, b, t: t + 0.5 - 0.5, at: T.at + 0.5 - 0.5, head: false, upX: 0.5 - 0.5, horn: 0,
        x: 0.5, y: 0.5, z: 0.5, px: 0.5, py: 0.5, pz: 0.5, has: false, on: 0.5, lit: false, acc: 0.5, woodT: -9.5, spd: 0.5,
      };
      if (extra) {
        if (extra.at !== undefined) s.at = extra.at;
        if (extra.head !== undefined) s.head = extra.head;
        if (extra.upX !== undefined) s.upX = extra.upX;
        if (extra.horn !== undefined) s.horn = extra.horn;
      }
      s.on = s.acc = s.spd = 0;
      sites.push(s);
    };
    for (const w of pt.wings) {
      for (let f = 0; f < 4; f++) add('tip', w.tips[f]);
      for (let f = 0; f < 3; f++) add('edge', w.tips[f], w.tips[f + 1], 0.5);
    }
    for (const a of pt.arms) add('claw', a.toe);
    for (const l of pt.legs) add('claw', l.toe);
    const n = tail.length - 1, i0 = Math.max(1, Math.round(n * A.tailFrom));
    for (let i = i0; i < n; i++) add('tail', tail[i], null, 0, { at: 0.72 + (0.24 * (i - i0)) / Math.max(1, n - i0) });
    add('tailTip', tail[n]);
    // look c: the horns (from the head's frame: the face is drawn elsewhere, these sit where its
    // horns sweep back) and the spine's crest (a point above the neck, the back and the tail's root)
    for (const side of [1, -1]) add('horn', pt.head, null, 0, { head: true, horn: side });
    for (let i = 1; i < neck.length - 1; i += 2) add('crest', neck[i], null, 0, { head: true, upX: 0.55 * S, at: 0.45 - (0.3 * i) / neck.length });
    add('crest', pt.chestC, null, 0, { upX: 1.45 * S, at: 0.15 });
    add('crest', pt.chestC, pt.hips, 0.5, { upX: 1.3 * S, at: 0.2 });
    add('crest', pt.hips, null, 0, { upX: 1.15 * S, at: 0.25 });
    for (let i = 1; i < Math.min(6, i0); i += 2) add('crest', tail[i], null, 0, { upX: 0.45 * S, at: 0.3 + 0.05 * i });
    this._crest = sites.filter((s) => s.kind === 'crest' || s.kind === 'horn');
    this._woodSites = sites.filter((s) => WOOD.has(s.kind));

    // the ignition's paths, from where each limb leaves the body (inside it, the run was hidden):
    // [points, the first point it draws from] (each wing's four finger paths share the arm: only the
    // middle finger draws it)
    const paths = (this.paths = []);
    for (const w of pt.wings) for (let f = 0; f < 4; f++) paths.push({ pts: [w.root, w.elbow, w.wrist, w.knuckles[f], w.tips[f]], from: f === 1 ? 0 : 2, u: 0 });
    for (const a of pt.arms) paths.push({ pts: [a.shoulder, a.elbow, a.wrist, a.toe], from: 0, u: 0 });
    for (const l of pt.legs) paths.push({ pts: [l.hip, l.knee, l.ankle, l.toe], from: 0, u: 0 });
    paths.push({ pts: [pt.chestC, pt.hips, ...tail], from: 0, u: 0 });
    this._len = new Float32Array(32);
  }

  get look() {
    return LOOK === 'off' ? null : A.looks[LOOK];
  }

  /** On: true while any of it burns (igniting, burning or going out). */
  get on() {
    return this.mode !== 'off';
  }

  /** The roar's ignition beat (attacks.js makeRoar, phase 3); `fast`: lit without the roar. */
  ignite(fast = false) {
    if (!this.look || this.mode === 'igniting' || this.mode === 'burning') return;
    this.mode = 'igniting';
    this.t = fast ? 0 : -A.ignite.delay;
    this._time = fast ? A.ignite.fast : A.ignite.time;
    this._fast = fast;
    this.s = 0;
    this.flared = false;
    this.level = 1;
    for (const p of this.paths) p.u = 0;
    for (const s of this.sites) s.lit = false;
  }

  /** Death: it goes out along the body, the ends first (the ignition run backwards). */
  douse() {
    if (this.mode === 'off' || this.mode === 'dousing') return;
    this.mode = 'dousing';
    this.t = 0;
    this.s = 1;
    this._lightsOff();
  }

  /** Out at once (the fight's reset, the hero's respawn). */
  reset() {
    this.mode = 'off';
    this.t = this.s = 0;
    this.level = 0;
    this.flared = false;
    this.stamps = this.peak = 0;
    this.lit = 0;
    this._tokens = 1;
    this._emberAcc = 0;
    this._dragT = 0;
    for (const s of this.sites) {
      s.on = 0;
      s.lit = false;
      s.has = false;
      s.acc = 0;
      s.woodT = -9;
    }
    for (const c of this._cues) c.t = 0;
    for (const p of this._prints) p.t = 0;
    this._lightsOff(true);
  }

  /** A timing cue at (x, y, z): the fire round it dims for A.cue.time s. */
  cue(x, y, z, ttl = A.cue.time) {
    if (!Number.isFinite(x + y + z)) return;
    let slot = this._cues[0];
    for (const c of this._cues) {
      if (Math.abs(c.x - x) + Math.abs(c.z - z) < 1 && c.t > 0) {
        slot = c;
        break;
      }
      if (c.t < slot.t) slot = c;
    }
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.t = Math.max(slot.t, ttl);
  }

  /** A foot planted (dragon.onStep): a burning footprint (looks b and c, claws alight). */
  step(x, z, hind) {
    const L = this.look;
    if (!L?.prints || !(this.level > 0.5) || !Number.isFinite(x + z)) return;
    let claw = 0;
    for (const s of this.sites) if (s.kind === 'claw' && s.on > claw) claw = s.on;
    if (claw < 0.5) return;
    this._print(x, z, hind ? A.print.r[1] : A.print.r[0], A.print.life);
  }

  _print(x, z, r, life) {
    this.game.world?.scorch?.burnCircle?.(x, z, r, A.print.burn, A.print.heat);
    let slot = this._prints[0];
    for (const p of this._prints) if (p.t < slot.t) slot = p;
    slot.x = x;
    slot.z = z;
    slot.t = slot.life = life;
    slot.acc = 0;
  }

  update(dt) {
    this.stamps = 0;
    if (!(dt > 0)) return;
    const d = this.d, L = this.look;
    const alive = d.state !== 'dead' && d.state !== 'sleeping' && d.object3d?.visible !== false;
    if (!L || !alive) {
      if (this.mode !== 'off' || this.level > 0) this.reset();
      return;
    }
    // ---- the life cycle
    if (d.state === 'dying') this.douse();
    else if (d.phase >= 3) {
      // (the phase-3 roar lights it itself, as a beat of its own: wait for it)
      if (this.mode === 'off' && d.brain?.action?.name !== 'phase3') this.ignite(true);
    } else if (this.mode === 'igniting' || this.mode === 'burning') this.douse();
    if (this.mode === 'off') {
      this._tickPrints(dt, L); // (footprints still flickering out)
      return;
    }
    const gutter = A.gutter.actions.includes(d.brain?.action?.name) || d.broken ? A.gutter.level : 1;
    this.level += (gutter - this.level) * Math.min(1, A.gutter.rate * dt);

    this._cap = A.cap.perFrame * (this.mode === 'igniting' ? 2 : 1);
    if (this.mode === 'igniting') this._igniting(dt);
    else if (this.mode === 'dousing') this._dousing(dt);
    this._preCue(d);
    this._burn(dt, L);
    this._embers(dt, L);
    this._wood(dt);
    this._drag(dt, L);
    this._tickPrints(dt, L);
    this._updateLights(L);
    for (const c of this._cues) if (c.t > 0) c.t -= dt;
    if (this.stamps > this.peak) this.peak = this.stamps;
  }

  // ---------------------------------------------------------------- the beats
  _igniting(dt) {
    this.t += dt;
    if (this.t < 0) return;
    const s0 = this.s;
    this.s = clamp01(this.t / this._time);
    const u = Math.pow(this.s, 1.1); // the fire speeds up a little as it runs out
    for (const site of this.sites) if (!site.lit && u >= site.at && this._shows(site)) site.lit = true;
    if (!this._fast) this._runners(Math.pow(s0, 1.1), u);
    if (this.s >= 1 && !this.flared) {
      this.flared = true;
      this._flare();
      this.mode = 'burning';
    }
  }

  _dousing(dt) {
    this.t += dt;
    this.s = 1 - clamp01(this.t / A.douse.time);
    const u = Math.pow(this.s, 0.8);
    for (const site of this.sites) {
      if (site.lit && site.at >= u) {
        site.lit = false;
        if (site.on > 0.2) this._puff(site);
      }
    }
    if (this.s <= 0) {
      let any = false;
      for (const site of this.sites) if (site.on > 0.02) any = true;
      if (!any) this.mode = 'off';
    }
  }

  /** The ignition's fire running out along the body from `u0` to `u1` (0 the chest, 1 the ends). */
  _runners(u0, u1) {
    if (!(u1 > u0)) return;
    const R = A.ignite.runner, f = this.game.fx?.fire;
    if (!f) return;
    for (const p of this.paths) {
      const len = this._pathLen(p.pts);
      if (!(len > 0)) continue;
      const m = Math.min(R.max, Math.ceil(((u1 - u0) * len) / R.spacing));
      for (let j = 0; j < m; j++) {
        const u = u0 + ((u1 - u0) * (j + rnd())) / m;
        const seg = this._pathAt(p.pts, u, len);
        if (seg < p.from) continue;
        const v = this._v;
        const sz = R.size * rand(0.8, 1.2);
        this._blob(v.x + rand(-0.2, 0.2), Math.max(A.minY, v.y + R.up), v.z + rand(-0.2, 0.2), rand(-0.4, 0.4), rand(1.5, 3), rand(-0.4, 0.4), rand(R.life[0], R.life[1]), sz, sz * 0.4, R.heat, 0, 1.2, 2.2);
        // what it passed smoulders a moment
        this._blob(v.x, Math.max(A.minY, v.y + 0.3), v.z, 0, rand(0.5, 1.2), 0, R.linger * rand(0.8, 1.2), sz * 0.7, sz * 0.5, R.lingerHeat, 0, 1, 1.2);
        if (rnd() < 0.3) this._ember(v.x, v.y, v.z, 1);
      }
    }
  }

  /** The ignition reaches the ends: every tip, claw and the tail's end flares; a shake, a flash of light. */
  _flare() {
    const F = A.ignite.flash, g = this.game, L = this.look;
    let ends = 0;
    for (const s of this.sites) if (ENDS.has(s.kind) && s.lit) ends++;
    for (const s of this.sites) {
      if (!ENDS.has(s.kind) || !s.lit) continue;
      this._pos(s);
      for (let i = 0; i < F.blobs; i++) {
        const a = rnd() * Math.PI * 2, el = rand(-0.3, 0.9), sp = rand(F.speed[0], F.speed[1]);
        const c = Math.cos(el);
        this._blob(s.x, Math.max(A.minY, s.y + s.T.up), s.z, Math.cos(a) * c * sp, Math.sin(el) * sp + 1, Math.sin(a) * c * sp, F.life * rand(0.8, 1.2), F.size[0], F.size[1], F.heat * L.k, 0, 3, 2, 0, true);
      }
      for (let i = 0; i < Math.round(F.embers / Math.max(1, ends)); i++) this._ember(s.x, s.y + s.T.up, s.z, 2.5);
    }
    if (!this._fast) {
      g.shake?.(F.shake);
      g.punch?.(F.punch);
      const c = this.d.rig.pt.chest;
      this._addLight(c.x, c.y, c.z, F.light * L.k, F.lightR, F.lightLife);
    }
    this._lightsOn();
  }

  /** A part goes out: a puff of smoke and a few embers. */
  _puff(s) {
    this._pos(s);
    const D = A.douse;
    for (let i = 0; i < D.smoke; i++) {
      this._blob(s.x + rand(-0.3, 0.3), Math.max(A.minY, s.y + 0.3), s.z + rand(-0.3, 0.3), rand(-0.5, 0.5), rand(0.6, 1.4), rand(-0.5, 0.5), rand(1, 1.6), 0.8, 2.2, 0.5, 0, 0.8, 0.6, 1, true);
    }
    for (let i = 0; i < D.embers; i++) this._ember(s.x, s.y + 0.2, s.z, 1.6);
  }

  // ---------------------------------------------------------------- the standing fire
  _shows(site) {
    const L = this.look;
    if (site.kind === 'horn') return !!L?.horns;
    if (site.kind === 'crest') return !!L?.crest;
    return true;
  }

  /** A site's point this frame into site.x / y / z. */
  _pos(s) {
    if (s.horn) {
      // on the horn's tip of the head it wears (heads.js HORN_TIPS), through the head's own matrix
      const hv = (this._headVis ??= this.d.object3d?.getObjectByName?.('headVis') ?? false);
      if (hv && hv.matrixWorld) {
        const T = this._hornTip, v = this._hornV.set(T[0] * s.horn, T[1], T[2]).applyMatrix4(hv.matrixWorld);
        if (Number.isFinite(v.x + v.y + v.z)) {
          s.x = v.x;
          s.y = v.y;
          s.z = v.z;
          return;
        }
      }
      // (no head joint: behind and above the head, out to each side, in the head's own frame)
      const h = s.a, f = this.d.rig.pt.headFwd;
      let fx = f.x, fz = f.z;
      const l = Math.sqrt(fx * fx + fz * fz) || 1;
      fx /= l;
      fz /= l;
      s.x = h.x - fx * 0.55 * S + fz * s.horn * 0.42 * S;
      s.y = h.y + 0.7 * S;
      s.z = h.z - fz * 0.55 * S - fx * s.horn * 0.42 * S;
      return;
    }
    const a = s.a, b = s.b;
    if (b) {
      s.x = a.x + (b.x - a.x) * s.t;
      s.y = a.y + (b.y - a.y) * s.t;
      s.z = a.z + (b.z - a.z) * s.t;
    } else {
      s.x = a.x;
      s.y = a.y;
      s.z = a.z;
    }
    s.y += s.upX;
  }

  _burn(dt, L) {
    const d = this.d, f = this.game.fx?.fire;
    if (!f) return;
    const C = A.cue;
    // the governor: the attacks' own fire comes first
    const gov = 1 - smooth(A.cap.field[0], A.cap.field[1], f.count);
    const warn = 1 - A.warn * clamp01(d.warn ?? 0);
    const throat = 1 - A.throat * clamp01(d.throatGlow ?? 0);
    const K = this.level * gov * warn;
    const hero = this.game.player?.position;
    const ramp = Math.min(1, A.ramp * dt);
    const jump = A.jump * A.jump;
    let ri = RI[0];
    for (const s of this.sites) {
      const want = s.lit && this._shows(s) ? 1 : 0;
      s.on += (want - s.on) * ramp;
      if (want === 0 && s.on < 0.01) s.on = 0;
      this._pos(s);
      if (!Number.isFinite(s.x + s.y + s.z)) {
        s.has = false;
        continue;
      }
      const dx = s.x - s.px, dy = s.y - s.py, dz = s.z - s.pz, d2 = dx * dx + dy * dy + dz * dz;
      const moved = s.has && d2 <= jump;
      s.spd = moved ? Math.sqrt(d2) / dt : 0;
      const ox = moved ? s.px : s.x, oy = moved ? s.py : s.y, oz = moved ? s.pz : s.z;
      s.px = s.x;
      s.py = s.y;
      s.pz = s.z;
      s.has = true;
      if (!(s.on > 0.01)) {
        s.acc = 0;
        continue;
      }
      // readability: dimmed by the cues round it, the breath's charge (head), the hero beside it
      let k = K * s.on;
      for (const c of this._cues) {
        if (!(c.t > 0)) continue;
        const cx = s.x - c.x, cy = s.y - c.y, cz = s.z - c.z, r = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const near = C.near + (C.far - C.near) * smooth(C.r0, C.r1, r);
        k *= 1 - Math.min(1, c.t * C.fade) * (1 - near);
      }
      if (s.head) k *= throat;
      if (hero) {
        const hx = s.x - hero.x, hz = s.z - hero.z, hr = Math.sqrt(hx * hx + hz * hz);
        if (hr < A.hero.r && s.y < 3) k *= A.hero.k + (1 - A.hero.k) * smooth(A.hero.r * 0.5, A.hero.r, hr);
      }
      if (!(k > 0.02)) continue;
      const T = s.T;
      const heat = T.heat * L.k * (0.45 + 0.55 * k);
      const size = T.size * L.size;
      const vx = moved ? (dx / dt) * A.inherit : 0, vy = moved ? (dy / dt) * A.inherit : 0, vz = moved ? (dz / dt) * A.inherit : 0;
      s.acc += dt * T.rate * L.rate * k;
      let n = Math.min(6, Math.floor(s.acc));
      s.acc -= n;
      // (the record is filled in place: doubles passed to a call are boxed, ~2 KB a frame)
      const b = this._b;
      while (n-- > 0) {
        // born part-way along this frame's path: no beads on a fast part
        const u = RT[ri++ & RM], sz = size * (0.8 + 0.4 * RT[ri++ & RM]);
        b.x = ox + (s.x - ox) * u + (RT[ri++ & RM] - 0.5) * 0.5 * sz;
        b.y = Math.max(A.minY, oy + (s.y - oy) * u + T.up);
        b.z = oz + (s.z - oz) * u + (RT[ri++ & RM] - 0.5) * 0.5 * sz;
        b.vx = vx + (RT[ri++ & RM] - 0.5) * 0.7;
        b.vy = vy + (L.rise[0] + RT[ri++ & RM] * (L.rise[1] - L.rise[0])) * 0.6;
        b.vz = vz + (RT[ri++ & RM] - 0.5) * 0.7;
        b.life = L.life[0] + RT[ri++ & RM] * (L.life[1] - L.life[0]);
        b.size = sz;
        b.sizeEnd = sz * 0.35;
        b.heat = heat;
        b.heatEnd = 0;
        b.drag = A.drag;
        b.gravity = L.rise[1];
        b.kind = 0;
        this._put();
      }
      // the trail: a fast part leaves its fire along its path (looks b, c)
      const tr = L.trail;
      if (tr && moved && s.spd > tr[2] && s.kind !== 'crest') {
        const dist = Math.sqrt(d2), sp = Math.min(1, (s.spd - tr[2]) / 25);
        const tsz = size * (1 + 0.6 * sp);
        const m = Math.min(4, Math.ceil(dist / (tsz * 0.3)));
        for (let j = 0; j < m; j++) {
          const u = (j + RT[ri++ & RM]) / m;
          b.x = ox + (s.x - ox) * u;
          b.y = Math.max(A.minY, oy + (s.y - oy) * u + T.up * 0.5);
          b.z = oz + (s.z - oz) * u;
          b.vx = vx * 0.4;
          b.vy = (0.3 + RT[ri++ & RM] * (1 - 0.3));
          b.vz = vz * 0.4;
          b.life = tr[0] * (0.75 + RT[ri++ & RM] * (1.2 - 0.75));
          b.size = tsz;
          b.sizeEnd = tsz * 0.55;
          // (the tail's joints lie close: their ribbons overlap, each burns at half)
          b.heat = T.heat * tr[1] * L.k * (0.4 + 0.6 * sp) * k * (s.kind === 'tail' ? 0.5 : 1);
          b.heatEnd = 0;
          b.drag = 2;
          b.gravity = 0.8;
          b.kind = 0;
          this._put();
        }
      }
    }
    RI[0] = ri & RM;
  }

  _embers(dt, L) {
    this._emberAcc += dt * L.embers * this.level;
    let n = Math.min(8, Math.floor(this._emberAcc));
    this._emberAcc -= n;
    const S0 = this.sites;
    while (n-- > 0) {
      const s = S0[Math.floor(rnd() * S0.length)];
      if (s.on > 0.3) this._ember(s.x, s.y + s.T.up, s.z, 1);
    }
  }

  /** Wood a burning part passes catches (A.wood.perFrame sites a frame; the per-minute budget). */
  _wood(dt) {
    const W = A.wood, w = this.game.world;
    this._tokens = Math.min(2, this._tokens + (dt * W.perMin) / 60);
    if (!w?.ignite || this._tokens < 1) return;
    const list = this._woodSites;
    if (!list.length) return;
    const t = this.d.time;
    // (a few sites a frame: the tail's tip crosses a trunk in a few frames, and its sweep fells it)
    for (let i = 0; i < W.perFrame && this._tokens >= 1; i++) {
      const s = list[this._woodI++ % list.length];
      if (!(s.on > 0.5) || s.spd < W.minSpeed || s.y > W.maxY || t - s.woodT < W.every || !Number.isFinite(s.x + s.z)) continue;
      s.woodT = t;
      const n = w.ignite(s.x, s.z, W.r, W.k, false);
      if (n > 0) {
        this._tokens -= 1;
        this.lit += n;
      }
    }
  }

  /** The dragging tail chars the grass (looks b, c). */
  _drag(dt, L) {
    if (!L.prints) return;
    this._dragT -= dt;
    if (this._dragT > 0) return;
    this._dragT = A.print.drag;
    for (const s of this.sites) {
      if (s.kind !== 'tailTip' || s.on < 0.5) continue; // (its tip: the joints before it stamped the same line)
      if (s.y < A.print.dragY && s.spd > A.print.dragSpeed) this._print(s.x, s.z, A.print.r[0] * 0.8, A.print.life * 0.6);
    }
  }

  /** Footprints: a few small, low flames flicker where a foot burnt the grass. */
  _tickPrints(dt, L) {
    const P = A.print;
    for (const p of this._prints) {
      if (!(p.t > 0)) continue;
      p.t -= dt;
      const k = clamp01(p.t / p.life);
      p.acc += dt * P.rate * k;
      let n = Math.min(3, Math.floor(p.acc));
      p.acc -= n;
      const b = this._b;
      let ri = RI[0];
      while (n-- > 0) {
        const a = RT[ri++ & RM] * Math.PI * 2, r = 0.45 * RT[ri++ & RM], sz = P.size[0] + RT[ri++ & RM] * (P.size[1] - P.size[0]);
        b.x = p.x + Math.cos(a) * r;
        b.y = A.minY - 0.05;
        b.z = p.z + Math.sin(a) * r;
        b.vx = b.vz = 0;
        b.vy = 0.4 + 0.5 * RT[ri++ & RM];
        b.life = 0.25 + 0.2 * RT[ri++ & RM];
        b.size = sz;
        b.sizeEnd = sz * 0.4;
        b.heat = P.heat2 * (0.5 + 0.5 * k) * (L?.k ?? 1);
        b.heatEnd = 0;
        b.drag = 1.5;
        b.gravity = 0.8;
        b.kind = 0;
        this._put();
      }
      RI[0] = ri & RM;
    }
  }

  // ---------------------------------------------------------------- readability
  /** The running action's next timing cue: the fire round its striking part dims just before its flash. */
  _preCue(d) {
    const a = d.brain?.action, B = a?.beats;
    if (!B || typeof d.partPos !== 'function') return;
    const lead = TUNING.flashLead ?? 0.35;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b.told) break;
      if (b.flashed || !Number.isFinite(b.impactIn + b.at)) continue;
      const toFlash = b.at + b.impactIn - lead - a.T;
      if (toFlash < 0 || toFlash > A.cue.lead) continue;
      const v = this._cueOut;
      d.partPos(b.part, a, b, v);
      this.cue(v.x, v.y, v.z, A.cue.time * 0.5);
    }
  }

  // ---------------------------------------------------------------- lights
  _lightsOn() {
    const L = this.look;
    if (!L) return;
    for (let i = 0; i < 2; i++) if (!this._lights[i]) this._lights[i] = this._addLight(0, 1, 0, 0, A.lights.radius, Infinity, 0.35);
  }

  _lightsOff(now = false) {
    for (let i = 0; i < 2; i++) {
      const l = this._lights[i];
      if (!l) continue;
      if (now) {
        l.life = 0;
        l.intensity = 0;
      } else l.kill();
      this._lights[i] = null;
    }
  }

  _updateLights(L) {
    const a = this._lights[0], b = this._lights[1];
    const pt = this.d.rig.pt, tail = this.d.rig.tail;
    const k = L.light * this.level;
    if (a) {
      const t = tail.p[tail.n];
      if (Number.isFinite(t.x + t.y + t.z)) a.set(t.x, Math.max(0.8, t.y + 0.4), t.z);
      a.intensity = k;
    }
    if (b) {
      const l = pt.arms[0].toe, r = pt.arms[1].toe;
      const x = (l.x + r.x) * 0.5, z = (l.z + r.z) * 0.5;
      if (Number.isFinite(x + z)) b.set(x, Math.max(0.8, (l.y + r.y) * 0.5 + 0.6), z);
      b.intensity = k * 0.8;
    }
  }

  /** A pooled light (its own random numbers: the light pool's seed draw would shift the fight's). */
  _addLight(x, y, z, intensity, radius, life, flicker = 0.3) {
    const pool = this.game.lights;
    if (!pool?.add) return null;
    const r = Math.random;
    Math.random = rnd;
    try {
      return pool.add({ x, y, z, color: A.lights.color, intensity, radius, life, fade: 0.3, fadeIn: 0.15, flicker });
    } finally {
      Math.random = r;
    }
  }

  // ---------------------------------------------------------------- spawning
  /** One blob (the beats' rare bursts; the standing fire fills this._b in place and calls _put). */
  _blob(x, y, z, vx, vy, vz, life, size, sizeEnd, heat, heatEnd, drag, gravity, kind = 0, force = false) {
    const b = this._b;
    b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz;
    b.life = life; b.size = size; b.sizeEnd = sizeEnd; b.heat = heat; b.heatEnd = heatEnd;
    b.drag = drag; b.gravity = gravity; b.kind = kind;
    this._put(force);
  }

  /** this._b into the fire field (under the frame's cap unless `force`; never NaN). */
  _put(force = false) {
    const f = this.game.fx?.fire, b = this._b;
    if (!f || (!force && this.stamps >= this._cap)) return;
    if (!Number.isFinite(b.x + b.y + b.z + b.vx + b.vy + b.vz + b.heat + b.size + b.life)) return;
    if (f.spawn(b) >= 0) this.stamps++;
  }

  _ember(x, y, z, speed = 1) {
    const add = this.game.fx?.add;
    if (!add || !Number.isFinite(x + y + z)) return;
    const E = A.ember, e = this._e;
    e.x = x + rand(-0.3, 0.3);
    e.y = Math.max(0.4, y);
    e.z = z + rand(-0.3, 0.3);
    const a = rnd() * Math.PI * 2, sp = E.speed * speed * rand(0.3, 1);
    e.vx = Math.cos(a) * sp;
    e.vy = rand(E.rise[0], E.rise[1]) * (0.6 + 0.4 * speed);
    e.vz = Math.sin(a) * sp;
    e.life = rand(E.life[0], E.life[1]);
    e.size = rand(E.size[0], E.size[1]);
    add.spawn(e);
  }

  // ---------------------------------------------------------------- paths
  _pathLen(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      len += dist(a, b);
    }
    return Number.isFinite(len) ? len : 0;
  }

  /** The point `u` (0..1) of the way along the path into this._v; returns the segment's index. */
  _pathAt(pts, u, len) {
    let at = clamp01(u) * len;
    const v = this._v;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const l = dist(a, b);
      if (at <= l || i === pts.length - 1) {
        const t = l > 1e-6 ? Math.min(1, at / l) : 0;
        v.x = a.x + (b.x - a.x) * t;
        v.y = a.y + (b.y - a.y) * t;
        v.z = a.z + (b.z - a.z) * t;
        return i - 1;
      }
      at -= l;
    }
    v.x = pts[0].x;
    v.y = pts[0].y;
    v.z = pts[0].z;
    return 0;
  }
}
