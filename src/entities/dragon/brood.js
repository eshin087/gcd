import { TUNING, SCALE } from './tuning.js';
import { BROOD } from './tuningBrood.js';
import { TELL, RESULT } from '../../combat/rules.js';
import { distPointSegment } from '../../core/math.js';
import { K_FIRE, K_SMOKE, K_VOID } from '../enemies/duelist/fx.js';
import { incantInk } from './incantation.js';

// The drakeling's look (`?drakeling=a|b`, a the default; _drawDrake): a a body of fire (a dim core in
// a hot rim), b a dark wyrm of smoke with burning seams. Read once (headless runs have no location).
const DRAKE_LOOKS = ['a', 'b'];
let DRAKE_LOOK = 'a';
try {
  const q = new URLSearchParams(globalThis.location?.search ?? '').get('drakeling');
  if (DRAKE_LOOKS.includes(q)) DRAKE_LOOK = q;
} catch {
  /* headless */
}
export const drakelingLook = () => DRAKE_LOOK;
export const setDrakelingLook = (k) => {
  if (DRAKE_LOOKS.includes(k)) DRAKE_LOOK = k;
};

// The wyrm's brood (ADR-197): small fire creatures it calls up with a roar, which fight on their own
// beside it, like the hazards (hazards.js): fire drakelings (burst out of the incantation's circle,
// circle the hero, lunge at him one at a time with a tell, die to one or two cuts, dive in and burst
// when their time runs out) and kamikaze wisps (swell on its spine and wings, tear off, home in on the
// hero in a staggered line and burst with a red tell; cut them down or roll through). They are bodies
// of fire: heat in the fire field (game.fx.fire, through the wyrm's DuelFx: _dot / _ink / _blob),
// never glyph sprites; embers and sparks are small glyph particles.
//
//   spawn(kind, o) -> id   kind 'drakeling' | 'wisp'; o: { x, y, z } where it leaves the wyrm (a wisp:
//                          `src` the body point it rides first, `delay` s before it swells), `hp`, `life`
//   count(kind?)           how many live (the AI's weight reads it: no new brood while one lives)
//   update(dt)             every frame (Dragon.update; never throws)
//   clear()                all burst harmlessly (the phase roar, the wyrm's fall)
//   reset()                nothing left (death, the level's reset)
//
// THE SEAM (hero blows reach them): the hero's swing is read the way bullets.js reads it: while
// player.isSwinging() the blade's swept quad (player.sweep: a, b this frame, pa, pb the last) is
// tested against each creature (its radius + `cut`), once per swing (player.atk is the swing). A cut
// costs 1 hp (a heavy swing 2); the hero feels it through player.feelCut (a short hit-stop, sparks, a
// jolt). A parried lunge kills the drakeling outright.
//
// THEIR BLOWS go through dragon.hitPlayer with a tell, like every boss blow (their `attack` is the move
// that called them: 'drakelings', 'wisps'): a drakeling's lunge is
// normal or blue (block / parry; 'combat:tell' at its windup, 'combat:flash' + the white cue flashLead
// s before it can land), its dive and every wisp's burst red (dodge; the red blaze where it lands:
// fx.tells.hazardFlash, the cue of a thing away from its thrower). One lunge at a time, never two dives
// within `dive.gap` s, and a lunge waits while a cue of the other answer is due near its impact
// (brain._clash: the wyrm's own blows, bullets, hazards).

const DR = BROOD.drakeling, WP = BROOD.wisp, LG = DR.lunge, DV = DR.dive, HOLD = BROOD.hold, DK = DR.look;
const S = SCALE;
const MAXD = 6;
const MAXW = 8;
const SEGS = 9; // a drakeling's body: head + 8 links (neck, chest, tail)
const LINK = 0.44; // m between them (head to tail tip ~4 m: 60 - 80 px at the game camera)
const TAU = Math.PI * 2;
const EMBER = ".'`*";
const SPARK = "'`.";
const HOT = [4.6, 3.5, 1.5];
const FLAME = [3.4, 1.4, 0.28];
const DARK = [0.8, 0.08, 0.012];
const FIRE_BLOW = Object.freeze({ kind: 'blast', by: 'boss', falloff: TUNING.world?.falloff, hot: true, mark: 'blast' });
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const perPh = (v, ph) => (Array.isArray(v) ? v[Math.max(0, Math.min(v.length - 1, (ph | 0) - 1))] : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function blank(kind) {
  return {
    alive: false, kind, id: 0, state: '', st: 0, t: 0, hp: 1, life: 8,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fz: 1,
    tx: 0, ty: 0, tz: 0, // a locked target (lunge, dive, commit)
    slot: 0, wing: 0, swing: null, told: false, flashed: false, tell: TELL.NORMAL, hitDone: false,
    src: 0, delay: 0, acc: 0, seed: 0, held: 0,
    chain: kind === 'drakeling' ? new Float32Array(SEGS * 3) : null,
  };
}

export class Brood {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this._next = 1;
    this.drakes = Array.from({ length: MAXD }, () => blank('drakeling'));
    this.wisps = Array.from({ length: MAXW }, () => blank('wisp'));
    this.live = 0;
    this.time = 0;
    this.nextLunge = 0;
    this.lunger = null;
    this.lastDive = -9;
    this.lastCommit = -9;
    this._ls = 0x2b7e15; // the look's own stream (never Math.random: the sims replay that one)
    this._from = { x: 0, z: 0 };
    this._pt = { x: 0, y: 0, z: 0 };
    this._hit = { damage: 0, from: this._from, point: this._pt, knockback: 0, knockdown: false, kind: 'fire', burn: 0, tell: TELL.NORMAL, parryable: true, blockable: true, attack: 'drakelings', plunge: false };
    this._b = { x: 0, y: 0, z: 0 };
    this.stats = { spawned: 0, cut: 0, burst: 0, hits: 0, lunges: 0, dives: 0 };
  }

  /** look jitter 0..1 */
  lr() {
    this._ls = (Math.imul(this._ls, 1664525) + 1013904223) >>> 0;
    return this._ls / 4294967296;
  }
  lrand(a, b) {
    return a + this.lr() * (b - a);
  }
  get fx() {
    return this.d.fx?.tells ?? null;
  }
  get look() {
    return DRAKE_LOOK;
  }
  /** The kind its lines are written in: the incantation's script ink (the void slot, dressed). */
  get _ink() {
    const I = this.d.incantation, ink = incantInk() === 'blood' ? 'blood' : 'script';
    I?._dress?.(ink);
    return I?._inkSet ? K_VOID : K_FIRE;
  }
  get low() {
    return (this.game.settings?.quality ?? 2) === 0;
  }

  // ---------------------------------------------------------------- the interface
  spawn(kind, o = {}) {
    const pool = kind === 'wisp' ? this.wisps : kind === 'drakeling' ? this.drakes : null;
    if (!pool) return 0;
    let c = null;
    for (const e of pool) if (!e.alive) {
      c = e;
      break;
    }
    if (!c) return 0;
    const d = this.d, ph = d.phase ?? 1;
    c.alive = true;
    c.id = this._next++;
    c.t = 0;
    c.st = 0;
    c.x = fin(o.x, d.position?.x ?? 0);
    c.y = fin(o.y, 0.6);
    c.z = fin(o.z, d.position?.z ?? 0);
    c.vx = c.vy = c.vz = 0;
    c.swing = null;
    c.told = c.flashed = c.hitDone = false;
    c.seed = this.lr() * 100;
    c.acc = 0;
    if (kind === 'drakeling') {
      c.hp = fin(o.hp, perPh(DR.hp, ph));
      c.life = fin(o.life, DR.life);
      c.state = 'emerge';
      c.slot = fin(o.slot, Math.random() * TAU);
      // it bursts up out of the circle: thrown up and out
      const ox = c.x - (d.position?.x ?? 0), oz = c.z - (d.position?.z ?? 0), ol = Math.hypot(ox, oz) || 1;
      c.vx = (ox / ol) * 3;
      c.vz = (oz / ol) * 3;
      c.vy = 7;
      c.fx = ox / ol;
      c.fz = oz / ol;
      for (let i = 0; i < SEGS; i++) {
        c.chain[i * 3] = c.x;
        c.chain[i * 3 + 1] = c.y - i * LINK;
        c.chain[i * 3 + 2] = c.z;
      }
      this._burstOut(c);
    } else {
      c.hp = 1;
      c.life = WP.life;
      c.state = 'wait';
      c.src = fin(o.src, 0) | 0;
      c.delay = Math.max(0, fin(o.delay, 0));
    }
    this.stats.spawned++;
    this.live++;
    return c.id;
  }

  count(kind) {
    let n = 0;
    if (kind !== 'wisp') for (const c of this.drakes) if (c.alive) n++;
    if (kind !== 'drakeling') for (const c of this.wisps) if (c.alive) n++;
    return n;
  }

  /** All burst harmlessly (a puff of fire and embers where each one was). */
  clear() {
    for (const c of this.drakes) if (c.alive) this._die(c, false);
    for (const c of this.wisps) if (c.alive) this._die(c, false);
    this.lunger = null;
    this.live = 0;
  }

  reset() {
    for (const c of this.drakes) c.alive = false;
    for (const c of this.wisps) c.alive = false;
    this.lunger = null;
    this.live = 0;
    this.time = 0;
    this.nextLunge = 0;
    this.lastDive = -9;
    this.lastCommit = -9;
    this._ls = 0x2b7e15;
  }

  update(dt) {
    if (this.live <= 0) return;
    const d = this.d;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this.time += step;
    if (d.state === 'dying' || d.state === 'dead' || d.state === 'sleeping') {
      this.clear();
      return;
    }
    const pl = this.game.player;
    const p = pl?.position && pl.alive !== false && Number.isFinite(pl.position.x + pl.position.z) ? pl.position : null;
    const sw = p && pl.isSwinging?.() && pl.sweep?.valid ? pl.sweep : null;
    let n = 0;
    for (const c of this.drakes) {
      if (!c.alive) continue;
      try {
        this._drake(c, step, p, sw, pl);
      } catch (err) {
        console.error('[brood] drakeling failed', err);
        c.alive = false;
      }
      if (c.alive) n++;
    }
    for (const c of this.wisps) {
      if (!c.alive) continue;
      try {
        this._wisp(c, step, p, sw, pl);
      } catch (err) {
        console.error('[brood] wisp failed', err);
        c.alive = false;
      }
      if (c.alive) n++;
    }
    if (this.lunger && !this.lunger.alive) this.lunger = null;
    this.live = n;
  }

  // ---------------------------------------------------------------- the seam: the hero's blade
  /** Does this swing's blade (its swept quad this frame) pass within R of (x, y, z)? Once per swing. */
  _cutBy(c, sw, pl, R) {
    if (!sw || !pl.atk || c.swing === pl.atk) return false;
    const A = sw.a, B = sw.b, PA = sw.pa, PB = sw.pb;
    if (
      distPointSegment(c.x, c.y, c.z, A.x, A.y, A.z, B.x, B.y, B.z) <= R ||
      distPointSegment(c.x, c.y, c.z, PA.x, PA.y, PA.z, PB.x, PB.y, PB.z) <= R ||
      distPointSegment(c.x, c.y, c.z, (A.x + PA.x) / 2, (A.y + PA.y) / 2, (A.z + PA.z) / 2, (B.x + PB.x) / 2, (B.y + PB.y) / 2, (B.z + PB.z) / 2) <= R
    ) {
      c.swing = pl.atk;
      return true;
    }
    return false;
  }

  /** A cut landed on c: the hero feels it; it loses hp (a heavy swing 2). Returns true if it died. */
  _cut(c, sw, pl) {
    const heavy = !!pl.atk?.def?.heavy;
    const dx = (sw.a.x + sw.b.x - sw.pa.x - sw.pb.x) * 0.5, dz = (sw.a.z + sw.b.z - sw.pa.z - sw.pb.z) * 0.5, l = Math.hypot(dx, dz) || 1;
    pl.feelCut?.(c.x, c.y, c.z, dx / l, dz / l, heavy);
    c.hp -= heavy ? 2 : 1;
    if (c.hp <= 0) {
      this.stats.cut++;
      this._die(c, true, dx / l, dz / l);
      return true;
    }
    // knocked back along the cut, reeling
    c.vx = (dx / l) * 7;
    c.vz = (dz / l) * 7;
    c.vy = 2;
    this._reel(c, DR.blocked);
    this._puff(c.x, c.y, c.z, 6, dx / l, dz / l);
    return false;
  }

  // ---------------------------------------------------------------- drakelings
  _drake(c, dt, p, sw, pl) {
    const d = this.d;
    c.t += dt;
    c.st += dt;
    // the blade (not while it bursts out of the circle: it is still fire on the ground)
    if (c.state !== 'emerge' && sw && this._cutBy(c, sw, pl, DR.radius + DR.cut)) {
      if (this._cut(c, sw, pl)) return;
    }
    if (!p) {
      this._die(c, false);
      return;
    }
    const lead = TUNING.flashLead;
    switch (c.state) {
      case 'emerge': {
        c.vy -= 14 * dt;
        this._move(c, dt);
        if (c.st >= DR.emerge) this._to(c, 'circle');
        break;
      }
      case 'circle': {
        this._orbit(c, dt, p);
        // its time is up: it climbs and dives onto him (one dive at a time)
        const busy = this._wyrmBusy();
        if (c.t >= c.life && this.lunger !== c && this.time - this.lastDive >= DV.gap && (!busy || c.t >= c.life + BROOD.busyWait)) {
          this._startDive(c, p);
          break;
        }
        if (!this.lunger && this.time >= this.nextLunge && c.t >= DR.emerge + 0.3 && (!busy || this.time >= this.nextLunge + BROOD.busyWait)) this._tryLunge(c, p);
        break;
      }
      case 'windup': {
        // it draws back from him, rises a little, wings spread: the bite coils
        const W = c.tell === TELL.BLUE ? LG.blue.windup : LG.normal.windup;
        const hx = p.x - c.x, hz = p.z - c.z, hl = Math.hypot(hx, hz) || 1;
        c.fx = hx / hl;
        c.fz = hz / hl;
        const pull = LG.pull / W;
        c.vx += (-c.fx * pull - c.vx) * Math.min(1, dt * 8);
        c.vz += (-c.fz * pull - c.vz) * Math.min(1, dt * 8);
        c.vy += (DR.height + 0.4 - c.y - c.vy * 0.3) * dt * 6;
        this._move(c, dt);
        const tti = W - c.st + Math.max(0, hl - 0.8) / LG.speed;
        if (!c.flashed && tti <= lead + 0.1 && this._hold(c, dt, tti, 'guard', 'drakelings')) break;
        if (!c.flashed && tti <= lead) {
          c.flashed = true;
          this._flash(c, c.tell);
        }
        if (c.st >= W) {
          c.tx = p.x;
          c.tz = p.z;
          c.ty = 1.0;
          c.hitDone = false;
          this._to(c, 'lunge');
          this.stats.lunges++;
        }
        break;
      }
      case 'lunge': {
        const dx = c.tx - c.x, dz = c.tz - c.z, dl = Math.hypot(dx, dz);
        if (c.st < 0.02) {
          // the dash: straight through where he stood, and on past it
          const l = dl || 1;
          c.fx = dx / l;
          c.fz = dz / l;
          c.vx = c.fx * LG.speed;
          c.vz = c.fz * LG.speed;
          c.vy = ((c.ty - c.y) * LG.speed) / Math.max(1, dl);
          c.delay = Math.min(0.75, (dl + LG.over) / LG.speed); // (its run, fixed as it leaves)
          if (!c.flashed) {
            c.flashed = true;
            this._flash(c, c.tell);
          }
        }
        this._move(c, dt);
        c.vy *= Math.exp(-3 * dt);
        if (!c.hitDone && this._touches(c, p, LG.hitR)) {
          c.hitDone = true;
          const L = c.tell === TELL.BLUE ? LG.blue : LG.normal;
          const r = this._blow(c, c.tell, L.damage, L.knockback, 0, 'drakelings');
          if (r === RESULT.PARRIED) {
            // a parried bite: it is thrown back into embers
            this.stats.cut++;
            this._die(c, true, -c.fx, -c.fz);
            return;
          }
          if (r === RESULT.BLOCKED || r === RESULT.CLASHED) {
            c.vx = -c.fx * 6;
            c.vz = -c.fz * 6;
            c.vy = 3;
            this._reel(c, DR.blocked);
            break;
          }
        }
        if (c.st >= c.delay || (c.st > 0.1 && c.vx * dx + c.vz * dz < 0 && dl > LG.over)) {
          this._to(c, 'recover');
        }
        break;
      }
      case 'recover': {
        c.vx *= Math.exp(-4 * dt);
        c.vz *= Math.exp(-4 * dt);
        c.vy += (DR.height - c.y) * dt * 4;
        this._move(c, dt);
        if (c.st >= LG.recover) this._endLunge(c);
        break;
      }
      case 'reel': {
        c.vx *= Math.exp(-3 * dt);
        c.vz *= Math.exp(-3 * dt);
        c.vy += (DR.height - c.y) * dt * 3 - c.vy * dt * 2;
        this._move(c, dt);
        if (c.st >= c.delay) this._endLunge(c);
        break;
      }
      case 'rise': {
        // the end of its time: it climbs over him, white-hot, and hangs there
        const hx = p.x - c.x, hz = p.z - c.z;
        c.vx += (hx * 1.2 - c.vx) * Math.min(1, dt * 3);
        c.vz += (hz * 1.2 - c.vz) * Math.min(1, dt * 3);
        c.vy += (DV.rise - c.y) * dt * 5 - c.vy * dt * 3;
        this._move(c, dt);
        const fall = Math.hypot(DV.rise, Math.hypot(hx, hz)) / DV.speed;
        if (!c.flashed && DV.windup - c.st + fall <= lead + 0.1 && this._hold(c, dt, DV.windup - c.st + fall, 'dodge', 'drakelings')) break;
        if (!c.flashed && DV.windup - c.st + fall <= lead) {
          c.flashed = true;
          this._flash(c, TELL.RED, p.x, 0.6, p.z);
        }
        // (a dive whose flash is still to come waits here too: its first frame flashes)
        if (c.st >= DV.windup && !c.flashed && this._hold(c, dt, fall, 'dodge', 'drakelings')) break;
        if (c.st >= DV.windup) {
          c.tx = p.x;
          c.tz = p.z;
          this._to(c, 'dive');
          this.stats.dives++;
        }
        break;
      }
      case 'dive': {
        const dx = c.tx - c.x, dy = 0.4 - c.y, dz = c.tz - c.z, l = Math.hypot(dx, dy, dz) || 1;
        c.vx = (dx / l) * DV.speed;
        c.vy = (dy / l) * DV.speed;
        c.vz = (dz / l) * DV.speed;
        if (!c.flashed) {
          c.flashed = true;
          this._flash(c, TELL.RED, c.tx, 0.6, c.tz);
        }
        this._move(c, dt);
        if (c.y <= 0.45 || l < DV.speed * dt || c.st > 1.2) {
          this._burst(c, c.tx, c.tz, DV.radius, DV.damage, DV.burn, DV.knockback, 'drakelings');
          return;
        }
        break;
      }
      default:
        this._to(c, 'circle');
    }
    if (!Number.isFinite(c.x + c.y + c.z)) {
      c.alive = false;
      return;
    }
    // (the ground and the wyrm's body: it never sinks into the grass)
    if (c.y < 0.5 && c.state !== 'dive') {
      c.y = 0.5;
      if (c.vy < 0) c.vy = 0;
    }
    this._chain(c);
    this._drawDrake(c, dt);
  }

  /** A new state (a new cue starts with `cue`: its tell and flash not yet out). */
  _to(c, state, cue = false) {
    c.state = state;
    c.st = 0;
    if (cue) {
      c.told = c.flashed = false;
      c.held = 0;
    }
  }

  _reel(c, s) {
    if (this.lunger === c) {
      this.lunger = null;
      this.nextLunge = this.time + this._gap();
    }
    c.delay = s;
    this._to(c, 'reel');
  }

  _endLunge(c) {
    if (this.lunger === c) {
      this.lunger = null;
      this.nextLunge = this.time + this._gap();
    }
    this._to(c, 'circle');
  }

  _gap() {
    return DR.gap[0] + Math.random() * (DR.gap[1] - DR.gap[0]);
  }

  /** It steers for its place on the ring round him (a slow wheel), bobbing. */
  _orbit(c, dt, p) {
    const rr = DR.orbitR[0] + (DR.orbitR[1] - DR.orbitR[0]) * (0.5 + 0.5 * Math.sin(c.seed + c.t * 0.6));
    c.slot += DR.orbitW * dt * (c.id % 2 ? 1 : 0.8);
    const gx = p.x + Math.cos(c.slot) * rr, gz = p.z + Math.sin(c.slot) * rr;
    const gy = DR.height + Math.sin(c.t * 2.3 + c.seed) * 0.3;
    const ax = gx - c.x, az = gz - c.z;
    const al = Math.hypot(ax, az);
    const want = Math.min(DR.speed, al * 2.2);
    const tvx = al > 1e-3 ? (ax / al) * want : 0, tvz = al > 1e-3 ? (az / al) * want : 0;
    const k = Math.min(1, (DR.accel / Math.max(1, DR.speed)) * dt * 2);
    c.vx += (tvx - c.vx) * k;
    c.vz += (tvz - c.vz) * k;
    c.vy += (gy - c.y) * dt * 4 - c.vy * dt * 2;
    // keep apart from the others
    for (const o of this.drakes) {
      if (!o.alive || o === c) continue;
      const sx = c.x - o.x, sz = c.z - o.z, s2 = sx * sx + sz * sz;
      if (s2 < 2.2 && s2 > 1e-4) {
        c.vx += (sx / s2) * dt * 6;
        c.vz += (sz / s2) * dt * 6;
      }
    }
    this._move(c, dt);
    // it faces him as it wheels
    const hx = p.x - c.x, hz = p.z - c.z, hl = Math.hypot(hx, hz) || 1, sp = Math.hypot(c.vx, c.vz);
    const fx = sp > 2 ? c.vx / sp : hx / hl, fz = sp > 2 ? c.vz / sp : hz / hl;
    c.fx += (fx - c.fx) * Math.min(1, dt * 6);
    c.fz += (fz - c.fz) * Math.min(1, dt * 6);
    const fl = Math.hypot(c.fx, c.fz) || 1;
    c.fx /= fl;
    c.fz /= fl;
  }

  _move(c, dt) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.z += c.vz * dt;
  }

  /** Does a blow of the wyrm's running move, told or still to be told (a string's later hits are
   *  told only at their own windup: the ledger does not know them yet), land within HOLD.sep of
   *  `tti` s from now asking for the other answer? */
  _beatNear(tti, ans) {
    const a = this.d.brain?.action, B = a?.beats;
    if (!B || !B.length) return false;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      const at = b.at + b.impactIn - a.T;
      if (at < -0.1) continue;
      const other = b.tell === TELL.RED || b.tell === TELL.BLACK ? 'dodge' : 'guard';
      if (other !== ans && Math.abs(at - tti) < HOLD.sep) return true;
    }
    return false;
  }

  /** Has the wyrm's running move a blow still to come (a beat not yet flashed)? */
  _wyrmBusy() {
    const d = this.d;
    if (d.state === 'airborne') return true; // (a flight's blows are timed as it goes)
    const a = d.brain?.action, B = a?.beats;
    if (!B || !B.length) return false;
    for (let i = 0; i < B.length; i++) if (!B[i].flashed) return true;
    return false;
  }

  /** Pick this one to lunge (blue by the phase's share), unless a cue of the other answer is due then. */
  _tryLunge(c, p) {
    const d = this.d;
    const blue = Math.random() < perPh(DR.blue, d.phase ?? 1);
    const tell = blue ? TELL.BLUE : TELL.NORMAL;
    const W = blue ? LG.blue.windup : LG.normal.windup;
    const dist = Math.hypot(p.x - c.x, p.z - c.z);
    if (dist > DR.orbitR[1] + 1.5) return; // (still coming round to him)
    const impactIn = W + Math.max(0, dist - 0.8) / LG.speed;
    const now = this.game.time ?? this.time;
    // (the wyrm's own blows, bullets and hazards are in the brain's cue ledger: a lunge never lands
    // among cues that ask for a dodge)
    const clash = d.brain?._clash?.(now + impactIn, 'guard', 0.45, null);
    if (clash) {
      this.nextLunge = this.time + 0.35;
      return;
    }
    c.tell = tell;
    this.lunger = c;
    this._to(c, 'windup', true);
    c.told = true;
    d.emit?.('combat:tell', { source: 'dragon', attack: 'drakelings', tell, impactIn, x: c.x, z: c.z, hazard: true, brood: true });
  }

  _startDive(c, p) {
    const d = this.d;
    this.lastDive = this.time;
    if (this.lunger === c) this.lunger = null;
    this._to(c, 'rise', true);
    c.told = true;
    const fall = Math.hypot(DV.rise, Math.hypot(p.x - c.x, p.z - c.z)) / DV.speed;
    d.emit?.('combat:tell', { source: 'dragon', attack: 'drakelings', tell: TELL.RED, impactIn: DV.windup + fall, x: p.x, z: p.z, hazard: true, brood: true });
  }

  /**
   * Its cue waits (its clock held back this frame) while a cue that asks for the other answer is due
   * within `sep` s of its impact (the wyrm's own blows, bullets, hazards: brain._clash, the ledger the
   * wyrm's blows hold on too), at most `maxHold` s per cue. True while it holds.
   */
  _hold(c, dt, tti, ans, attack) {
    if (c.held >= HOLD.max) return false;
    const now = this.game.time ?? this.time;
    // (bullets in flight cue themselves only flashLead s ahead: a red brood cue waits for the air to
    // clear of them, as the wyrm's own dodge blows wait for its shots)
    const B = this.d.bullets, shots = ans === 'dodge' && !!B && B.count(0) + B.count(1) + B.count(2) > 0;
    if (!shots && !this._beatNear(tti, ans) && !this.d.brain?._clash?.(now + tti, ans, HOLD.sep, attack)) return false;
    c.held += dt;
    c.st -= dt;
    return true;
  }

  /** The cue flashLead s before it can land: 'combat:flash' + the shared design (a white cross for a
   *  normal bite, the star for a blue one, the red blaze where a dive or a wisp will burst). */
  _flash(c, tell, x = c.x, y = c.y, z = c.z) {
    const d = this.d;
    d.emit?.('combat:flash', { source: 'dragon', attack: c.kind === 'wisp' ? 'wisps' : 'drakelings', tell, x, y, z, hazard: true, brood: true });
    this.fx?.hazardFlash?.(tell, x, y, z, tell === TELL.RED ? 1.2 : 1.1);
  }

  _touches(c, p, r) {
    const pr = this.game.player?.radius ?? 0.45;
    const dh = Math.max(0, Math.hypot(c.x - p.x, c.z - p.z) - pr);
    const cy = Math.min(Math.max(c.y, p.y ?? 0), (p.y ?? 0) + 1.8);
    const dy = c.y - cy;
    return dh * dh + dy * dy <= r * r;
  }

  /** Its blow on the hero (dragon.hitPlayer: the tell's rules, the hero's i-frames, guard, parry). */
  _blow(c, tell, damage, knockback, burn, attack) {
    const o = this._hit, p = this.game.player.position;
    o.damage = damage;
    o.knockback = knockback;
    o.knockdown = false;
    o.kind = 'fire';
    o.burn = burn;
    o.tell = tell;
    const red = tell === TELL.RED;
    o.parryable = !red;
    o.blockable = !red;
    o.attack = attack;
    o.plunge = false;
    this._from.x = c.x;
    this._from.z = c.z;
    this._pt.x = p.x;
    this._pt.y = Math.max(0.5, Math.min(1.6, c.y));
    this._pt.z = p.z;
    const r = this.d.hitPlayer(o, null);
    if (r === RESULT.HIT) this.stats.hits++;
    return r;
  }

  /** It bursts at (x, z): the blast hits the hero inside it (red), the world takes it. */
  _burst(c, x, z, R, damage, burn, kb, attack) {
    const p = this.game.player?.position;
    if (p && Math.hypot(p.x - x, p.z - z) <= R + (this.game.player.radius ?? 0.45)) {
      const cx = c.x, cz = c.z;
      c.x = x;
      c.z = z;
      this._blow(c, TELL.RED, damage, kb, burn, attack);
      c.x = cx;
      c.z = cz;
    }
    const w = this.game.world;
    w?.impact?.(x, z, R, 0.35, FIRE_BLOW);
    w?.ignite?.(x, z, R * 0.6, DR.burnWorld);
    w?.groundBlow?.(x, z, { kind: 'blast', power: 0.4, r: R * 0.7, by: 'boss', hot: true });
    const f = this.d.fx;
    f?._fireBlast?.(x, z, R, c.kind === 'wisp' ? 0.45 : 0.7);
    f?._light?.({ x, y: 1.2, z, color: [1, 0.55, 0.2], intensity: 6, radius: R * 4, life: 0.4, fade: 0.35 });
    this.game.shake?.(c.kind === 'wisp' ? 0.18 : 0.3);
    this.stats.burst++;
    c.alive = false;
    if (this.lunger === c) this.lunger = null;
  }

  // ---------------------------------------------------------------- wisps
  _wisp(c, dt, p, sw, pl) {
    c.t += dt;
    c.st += dt;
    if (!p) {
      this._die(c, false);
      return;
    }
    if (c.state !== 'wait' && c.state !== 'gather' && sw && this._cutBy(c, sw, pl, WP.radius + WP.cut)) {
      if (this._cut(c, sw, pl)) return;
    }
    switch (c.state) {
      case 'wait':
        if (c.st >= c.delay) this._to(c, 'gather');
        this._bodyPt(c.src, this._b);
        c.x = this._b.x;
        c.y = this._b.y;
        c.z = this._b.z;
        return; // (nothing to draw yet)
      case 'gather': {
        // it swells where it rides on the body (the spine, a wing), then tears off
        this._bodyPt(c.src, this._b);
        c.x = this._b.x;
        c.y = this._b.y;
        c.z = this._b.z;
        if (c.st >= WP.gather) {
          const d = this.d, ox = c.x - d.position.x, oz = c.z - d.position.z, ol = Math.hypot(ox, oz) || 1;
          c.vx = (ox / ol) * WP.peel * 0.6;
          c.vz = (oz / ol) * WP.peel * 0.6;
          c.vy = WP.peel * 0.8;
          this._puff(c.x, c.y, c.z, 5, ox / ol, oz / ol);
          this._to(c, 'fly');
        }
        break;
      }
      case 'fly': {
        // it homes in on him, curving (a limited turn), climbing or sinking to his height
        const sp0 = Math.hypot(c.vx, c.vz);
        const hx = p.x - c.x, hz = p.z - c.z, hl = Math.hypot(hx, hz) || 1;
        const ready = this.time - this.lastCommit >= WP.sep;
        // (waiting its turn near him it slows and wheels round him, so it can turn in tight)
        const wait = hl <= WP.arm * 1.8 && !ready;
        const want = wait ? WP.speed[0] : WP.speed[0] + (WP.speed[1] - WP.speed[0]) * clamp01(c.st / 1.2);
        let a = Math.atan2(c.vx, c.vz);
        const goal = Math.atan2(hx, hz);
        let da = goal + (wait ? 1.6 * (c.id % 2 ? 1 : -1) : 0) - a;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const turn = WP.turn * dt * (sp0 < 2 ? 4 : 1);
        a += Math.max(-turn, Math.min(turn, da));
        const sp = sp0 + (want - sp0) * Math.min(1, dt * 3);
        c.vx = Math.sin(a) * sp;
        c.vz = Math.cos(a) * sp;
        c.vy += (WP.height + 0.25 * Math.sin(c.t * 5 + c.seed) - c.y) * dt * 5 - c.vy * dt * 2.5;
        this._move(c, dt);
        // (one commits at a time, `sep` s apart: the next one wheels round him until its turn)
        if (ready && ((hl <= WP.arm && Math.abs(da) < 1.2) || (hl <= WP.arm * 1.5 && c.st > 1.5))) this._commit(c, p);
        else if (c.st >= c.life) {
          // (its life counts from the moment it tears off: one queued late on the body, or wheeling
          // round him for its turn, used to gutter out before it came in)
          this._die(c, false);
          return;
        }
        break;
      }
      case 'commit': {
        // at him: until its flash it keeps turning onto where he is (he may have been thrown by the
        // burst before it), then straight through that spot; it bursts when its fuse runs out
        if (!c.flashed) {
          const left = Math.max(0.12, WP.fuse - c.st);
          let dx = p.x - c.x, dz = p.z - c.z;
          const l = Math.hypot(dx, dz) || 1, sp = Math.min(WP.reaim, l / left);
          c.tx = p.x;
          c.tz = p.z;
          const k = Math.min(1, dt * 10);
          dx /= l;
          dz /= l;
          c.vx += (dx * sp - c.vx) * k;
          c.vz += (dz * sp - c.vz) * k;
        }
        this._move(c, dt);
        c.vy += (WP.height - c.y) * dt * 4;
        if (!c.flashed && WP.fuse - c.st <= TUNING.flashLead + 0.1 && this._hold(c, dt, WP.fuse - c.st, 'dodge', 'wisps')) {
          c.vx *= Math.exp(-6 * dt); // (it hangs, throbbing, until its turn)
          c.vz *= Math.exp(-6 * dt);
          break;
        }
        if (!c.flashed && WP.fuse - c.st <= TUNING.flashLead) {
          c.flashed = true;
          this._flash(c, TELL.RED, c.tx, 1.0, c.tz);
        }
        if (c.st >= WP.fuse) {
          this._burst(c, c.x, c.z, WP.blast, WP.damage, WP.burn, WP.knockback, 'wisps');
          return;
        }
        break;
      }
      default:
        this._to(c, 'fly');
    }
    if (!Number.isFinite(c.x + c.y + c.z)) {
      c.alive = false;
      return;
    }
    if (c.y < 0.5) {
      c.y = 0.5;
      if (c.vy < 0) c.vy = 0;
    }
    this._drawWisp(c, dt);
  }

  /** It commits: aimed through where he stands to burst there when the fuse runs out (red). */
  _commit(c, p) {
    const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
    // the speed that carries it to his spot as the fuse runs out
    const sp = l / WP.fuse;
    c.vx = (dx / l) * sp;
    c.vz = (dz / l) * sp;
    c.tx = p.x;
    c.tz = p.z;
    this.lastCommit = this.time;
    this._to(c, 'commit', true);
    c.told = true;
    this.d.emit?.('combat:tell', { source: 'dragon', attack: 'wisps', tell: TELL.RED, impactIn: WP.fuse, x: p.x, z: p.z, hazard: true, brood: true });
  }

  /** A point of the wyrm's body a wisp rides before it tears off: along the spine, the wing arms. */
  _bodyPt(i, out) {
    const d = this.d, pt = d.rig?.pt, nk = d.rig?.neck?.p, tl = d.rig?.tail?.p;
    let v = null;
    const k = ((i % 8) + 8) % 8;
    if (pt) {
      if (k === 0) v = pt.chest;
      else if (k === 1) v = pt.wings?.[0]?.wrist;
      else if (k === 2) v = pt.wings?.[1]?.wrist;
      else if (k === 3) v = nk?.[3] ?? pt.neckBase;
      else if (k === 4) v = pt.hips;
      else if (k === 5) v = pt.wings?.[0]?.tips?.[1];
      else if (k === 6) v = pt.wings?.[1]?.tips?.[1];
      else v = tl?.[2] ?? pt.hips;
    }
    if (v && Number.isFinite(v.x + v.y + v.z)) {
      out.x = v.x;
      out.y = v.y + (k === 0 || k === 4 || k === 3 ? 0.6 * S : 0.2);
      out.z = v.z;
    } else {
      out.x = d.position?.x ?? 0;
      out.y = 4;
      out.z = d.position?.z ?? 0;
    }
    return out;
  }

  // ---------------------------------------------------------------- death
  /** It dies: `cut` (the blade, a parry) throws it apart along (dx, dz); else it gutters out. */
  _die(c, cut, dx = 0, dz = 0) {
    c.alive = false;
    if (this.lunger === c) {
      this.lunger = null;
      this.nextLunge = this.time + this._gap();
    }
    if (!Number.isFinite(c.x + c.y + c.z)) return;
    const n = c.kind === 'drakeling' ? (cut ? 22 : 12) : cut ? 12 : 7;
    this._embers(c.x, c.y, c.z, n, dx, dz, cut ? 6 : 3);
    this._puff(c.x, c.y, c.z, c.kind === 'drakeling' ? 9 : 5, dx, dz);
    if (cut) this.d.fx?._light?.({ x: c.x, y: c.y, z: c.z, color: [1, 0.6, 0.25], intensity: 4, radius: 6, life: 0.22, fade: 0.2 });
    // (the pieces fall and smoke)
    const fx = this.fx;
    if (fx) for (let i = 0; i < 3; i++) fx._blob(c.x, c.y, c.z, this.lrand(-1, 1), this.lrand(0.5, 2), this.lrand(-1, 1), this.lrand(0.8, 1.3), 0.8, 1.8, 0.5, 0, K_SMOKE, 0.8, 0.6);
  }

  _embers(x, y, z, n, dx, dz, push) {
    const f = this.d.fx;
    if (!f?.add || !f._rec) return;
    if (this.low) n = Math.ceil(n * 0.5);
    for (let i = 0; i < n; i++) {
      const a = this.lr() * TAU, sp = this.lrand(1.5, 5);
      const o = f._rec(x, y, z, this.lrand(0.5, 1.1), this.lrand(0.18, 0.28), 0.05, i % 3 ? EMBER : SPARK);
      o.vx = Math.cos(a) * sp + dx * push;
      o.vy = this.lrand(1, 6);
      o.vz = Math.sin(a) * sp + dz * push;
      o.drag = 1.2;
      o.gravity = -9;
      o.flicker = 0.4;
      f._col(HOT, 1, DARK, 1);
      f._spawn(f.add, o);
    }
  }

  /** A puff of flame thrown along (dx, dz). */
  _puff(x, y, z, n, dx, dz) {
    const fx = this.fx;
    if (!fx) return;
    for (let i = 0; i < n; i++) {
      fx._blob(x + this.lrand(-0.3, 0.3), y + this.lrand(-0.2, 0.3), z + this.lrand(-0.3, 0.3), dx * this.lrand(1, 4) + this.lrand(-1.5, 1.5), this.lrand(0.5, 2.5), dz * this.lrand(1, 4) + this.lrand(-1.5, 1.5), this.lrand(0.25, 0.45), 0.6, 1.4, 0.75, 0, K_FIRE, 2.5, 2);
    }
  }

  /** It bursts out of the circle: a gout of flame up out of the ground, grit, a light. */
  _burstOut(c) {
    const fx = this.fx;
    if (!fx) return;
    for (let i = 0; i < 10; i++) {
      fx._blob(c.x + this.lrand(-0.4, 0.4), 0.7 + this.lrand(0, 0.5), c.z + this.lrand(-0.4, 0.4), this.lrand(-1.2, 1.2), this.lrand(4, 9), this.lrand(-1.2, 1.2), this.lrand(0.35, 0.6), 0.7, 1.5, 0.7, 0, K_FIRE, 2.2, 2);
    }
    this._embers(c.x, 0.8, c.z, 8, 0, 0, 0);
    this.d.fx?.dustRing?.(c.x, c.z, 1.2, this.low ? 6 : 10, 0.6);
  }

  // ---------------------------------------------------------------- drawing
  /** The body follows the head link by link. */
  _chain(c) {
    const C = c.chain;
    C[0] = c.x;
    C[1] = c.y;
    C[2] = c.z;
    for (let i = 1; i < SEGS; i++) {
      const j = i * 3, k = j - 3;
      let dx = C[j] - C[k], dy = C[j + 1] - C[k + 1], dz = C[j + 2] - C[k + 2];
      let l = Math.hypot(dx, dy, dz);
      if (!(l > 1e-4) || !Number.isFinite(l)) {
        dx = -c.fx;
        dy = 0;
        dz = -c.fz;
        l = 1;
      }
      C[j] = C[k] + (dx / l) * LINK;
      C[j + 1] = C[k + 1] + (dy / l) * LINK;
      C[j + 2] = C[k + 2] + (dz / l) * LINK;
    }
  }

  /**
   * A drakeling: a tiny dragon, drawn so its silhouette holds in one still at the game camera (it flies
   * at ~1.9 m, ~40 m from the camera: 50 - 70 px). Its lines are written on the letter grid in the
   * script ink (the incantation's: the fire's colours with the tongues kept short, so it does not
   * dissolve into flame): a wedge of a head with horns and two hot eyes, an outline that follows the
   * body link by link (a neck, a chest, a tail that whips to a spade), and two wings seen from above,
   * each a hot leading spar to the wrist and tip, two finger spars and a scalloped trailing edge, the
   * span opening and closing as they beat. The look (`?drakeling=a|b`):
   *   a  a body of fire: a dim core of the same ink inside a hot rim (the wyrm's dark body, bright edge)
   *   b  a dark wyrm with burning seams: a body of smoke (dim grey letters) inside the burning outline
   * Its windup heats it toward white; its dive burns white-hot. A short trail of flame off the tail.
   */
  _drawDrake(c, dt) {
    const fx = this.fx;
    if (!fx || !this.game.fx?.fire) return;
    const C = c.chain, low = this.low, K = DK;
    const windK = c.state === 'windup' ? clamp01(c.st / (c.tell === TELL.BLUE ? LG.blue.windup : LG.normal.windup)) : c.state === 'rise' ? clamp01(c.st / DV.windup) : c.state === 'dive' || c.state === 'lunge' ? 1 : 0;
    const hk = 1 + K.windHeat * windK + (c.state === 'rise' || c.state === 'dive' ? 0.3 : 0);
    const ink = this._ink, rim = K.rim * hk, spar = K.spar * hk, edge = K.edge * hk;
    // its frame: forward along the head link, flat right
    let fx0 = C[0] - C[3], fz0 = C[2] - C[5];
    let fl = Math.hypot(fx0, fz0);
    if (!(fl > 1e-3)) { fx0 = c.fx; fz0 = c.fz; fl = 1; }
    const f_x = fx0 / fl, f_z = fz0 / fl, r_x = f_z, r_z = -f_x;
    const hx = C[0], hy = C[1], hz = C[2];
    const dark = this.look === 'b';
    // ONE line down its length (the letters of a soft line add up: two outlines a few cells apart
    // printed as one white knot at this size), snout to tail tip: hot at the head, cooling to the tail
    const sx = hx + f_x * K.snout, sz = hz + f_z * K.snout;
    const sp0 = rim * (dark ? K.darkSpine : 1); // (b: the spine a seam of low red strokes in a smoke body)
    fx._ink(sx, hy, sz, hx, hy, hz, 0, sp0, 0, sp0, 0, ink);
    const n = SEGS;
    for (let i = 1; i < n; i++) {
      const j = i * 3, u = i / (n - 1);
      fx._ink(C[j - 3], C[j - 2], C[j - 1], C[j], C[j + 1], C[j + 2], 0, sp0 * (1 - 0.35 * u), 0, sp0 * (1 - 0.35 * u), 1, ink);
      // the body's mass: a dim core (a) or a dark body of smoke (b), as wide as the body there
      const w = K.width[i] ?? 0;
      if (w > 0.12 && (dark || i !== 2) && (!low || i % 2)) {
        if (dark) fx._dot(C[j], C[j + 1], C[j + 2], w * 3.2, K.smoke, K_SMOKE);
        else fx._dot(C[j], C[j + 1], C[j + 2], w * 2.2, K.core * hk, ink);
      }
    }
    // horns swept back off the head, two hot eyes (one cell each)
    const jw = K.head;
    for (let side = -1; side <= 1; side += 2) {
      const ox = r_x * side * jw, oz = r_z * side * jw;
      fx._ink(hx + ox * 0.5, hy, hz + oz * 0.5, hx + ox * 1.6 - f_x * K.horn, hy + 0.15, hz + oz * 1.6 - f_z * K.horn, 0, rim * 0.75, 0, rim * 0.5, 0, ink);
    }
    fx._dot(hx + f_x * 0.12, hy + 0.08, hz + f_z * 0.12, 0.14, K.eye * hk, ink);
    // the spade at the tail's tip
    const T = (n - 1) * 3, T2 = (n - 2) * 3;
    let tx = C[T] - C[T2], tz = C[T + 2] - C[T2 + 2];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const ex = C[T] + tx * K.spade, ey = C[T + 1], ez = C[T + 2] + tz * K.spade;
    fx._ink(C[T2] + tz * K.spade, ey, C[T2 + 2] - tx * K.spade, ex, ey, ez, 0, rim * 0.7, 0, rim * 0.7, 0, ink);
    fx._ink(C[T2] - tz * K.spade, ey, C[T2 + 2] + tx * K.spade, ex, ey, ez, 0, rim * 0.7, 0, rim * 0.7, 0, ink);
    // the wings, from the shoulders (link 2), beating: seen from above the span opens and closes and
    // the tips lift; each a hot leading spar (shoulder, wrist, tip), one finger, a trailing edge back
    // to the body (link 5)
    const W = 2 * 3, wx = C[W], wy = C[W + 1], wz = C[W + 2];
    const fast = c.state === 'lunge' || c.state === 'dive';
    const ph = c.t * (fast ? K.beatFast : K.beat) + c.seed;
    const sp = fast ? K.swept : 0.7 + 0.3 * Math.cos(ph);
    const lift = 0.6 * Math.sin(ph);
    const back = Math.min(T, 5 * 3);
    for (let side = -1; side <= 1; side += 2) {
      const ox = r_x * side, oz = r_z * side;
      const wrx = wx + ox * K.span * 0.5 * sp + f_x * 0.35, wry = wy + lift * 0.5, wrz = wz + oz * K.span * 0.5 * sp + f_z * 0.35;
      const tpx = wx + ox * K.span * sp - f_x * 0.5, tpy = wy + lift, tpz = wz + oz * K.span * sp - f_z * 0.5;
      // (the spar starts a little off the spine: where every line met, the heat added up to white)
      fx._ink(wx + ox * K.root, wy, wz + oz * K.root, wrx, wry, wrz, 0, spar * 0.8, 0, spar, 0, ink);
      fx._ink(wrx, wry, wrz, tpx, tpy, tpz, 0, spar, 0, spar * 0.85, 1, ink);
      fx._ink(tpx, tpy, tpz, C[back] + ox * K.root, C[back + 1], C[back + 2] + oz * K.root, 0, edge, 0, edge * 0.7, 1, ink);
      if (!low) {
        const mx = (tpx + C[back]) * 0.5, my = (tpy + C[back + 1]) * 0.5, mz = (tpz + C[back + 2]) * 0.5;
        fx._ink(wrx, wry, wrz, mx, my, mz, 0, edge * 0.9, 0, edge * 0.6, 1, ink);
        if (dark) fx._dot((wrx + mx + wx) / 3, (wry + my + wy) / 3, (wrz + mz + wz) / 3, K.span * 0.5 * sp, K.smoke * 0.85, K_SMOKE);
      }
    }
    // a short trail of flame off the tail (more as it flies fast)
    const spd = Math.hypot(c.vx, c.vy, c.vz);
    c.acc += dt * (low ? 8 : 14) * (0.4 + Math.min(1.5, spd / 8));
    let k = 0;
    while (c.acc >= 1 && k++ < 4) {
      c.acc -= 1;
      fx._blob(ex + this.lrand(-0.1, 0.1), ey, ez + this.lrand(-0.1, 0.1), c.vx * -0.1, this.lrand(0.3, 1), c.vz * -0.1, this.lrand(0.18, 0.3), 0.4, 0.7, 0.5, 0, K_FIRE, 2, 2);
    }
  }

  /** A wisp: a small knot of fire with a burning tail; it swells on the body first; committed, it burns
   *  white-hot and throbs. */
  _drawWisp(c, dt) {
    const fx = this.fx;
    if (!fx || !this.game.fx?.fire) return;
    const g = c.state === 'gather' ? clamp01(c.st / WP.gather) : 1;
    const hot = c.state === 'commit' ? 1.3 + 0.3 * Math.sin(c.st * 30) : 1;
    const s = 0.4 + 0.3 * g;
    // a white-hot heart in an orange knot that boils round it
    fx._dot(c.x, c.y, c.z, s + 0.25, 1.05 * hot * (0.5 + 0.5 * g), K_FIRE);
    fx._dot(c.x + Math.sin(c.t * 13 + c.seed) * 0.16, c.y + 0.12, c.z + Math.cos(c.t * 11 + c.seed) * 0.16, s, 0.75 * hot * g, K_FIRE);
    fx._dot(c.x - Math.sin(c.t * 9 + c.seed) * 0.14, c.y - 0.08, c.z + Math.sin(c.t * 7 + c.seed) * 0.14, s * 0.8, 0.6 * hot * g, K_FIRE);
    if (c.state === 'gather') return;
    // its burning tail
    c.acc += dt * (this.low ? 22 : 42);
    let k = 0;
    while (c.acc >= 1 && k++ < 8) {
      c.acc -= 1;
      fx._blob(c.x + this.lrand(-0.1, 0.1), c.y, c.z + this.lrand(-0.1, 0.1), c.vx * -0.05, this.lrand(0.2, 0.9), c.vz * -0.05, this.lrand(0.32, 0.5), 0.55, 0.22, 0.72 * hot, 0, K_FIRE, 1.5, 1.2);
    }
  }
}
