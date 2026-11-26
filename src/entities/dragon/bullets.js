// Bullets (docs/COMBAT.md "Bullets", ADR-039): the wyrm's bullet-hell projectiles and its ground
// tongues of fire. One pooled field owned by the dragon (d.bullets), stepped after the hazards every
// frame.
//
//   EMBER (orange, normal tell)  small; flies straight (breathed) or arcs down from the sky (lobbed,
//                                Ember rain); parry / block / roll / cut with a swing
//   ORB   (red)                  big, straight; dodge only (a perfect dodge counts, no plunge)
//   TONGUE (red)                 fire driven along the ground from where a breath strikes it: a
//                                front crawls out along a fixed line and every spot it passed burns
//                                for `hold` s (the Scouring breath, Cinder lanes); dodge only
//
// (kind 1 was the homing wisp, removed 2026-11-15; the numbers of EMBER / ORB stay as they were)
//
// The fairness rule (the cue): every bullet that is going to hit announces itself TUNING.flashLead s
// before impact with a glint and a paired combat:tell + combat:flash ({ hazard: true, bullet: true }).
// Impacts within K.cueGap s of an announced one ride on that cue: one parry answers them all (the
// deflect opens a short shield that pops the small bullets touching the hero, and bursts the ones
// around him). A bullet that could only be announced too late (K.cueMin) is a dud when it was
// spawned point-blank (it fizzles on touch); an impact that would land within K.clashSep s of an
// announced one of the OTHER answer (an ember beside an orb: parry vs roll) is a dud too, and sends no
// cue (the first announced keeps its cue: two answers never land together; the brood's cues bar
// them the same way, bar()); a HIT opens K.grace s in which every touching bullet
// fizzles, and each pattern caps its hits (group().max): a storm never melts the hero. A pattern's
// headline flash follows its lead bullet even after the action has ended (holdFlash). The tongues
// are announced the same way (the time until any tongue, burning or still to come from the plan,
// next touches the hero on his sensed velocity), and a tongue only hurts a hero it announced.
//
// A deflected bullet flies back to the wyrm's head and adds posture; it never interrupts the wyrm
// (dragon.onParried is for its own blows). A PERFECT parry (player.deflect.perfect: pressed within
// DEFENSE.perfectParryWindow, ADR-051) returns it instead: a bigger, faster shot that lands on the
// head for the kind's returnDamage (dragon.takeHit: phase gates and death as for a sword hit) and
// returnPosture, flinches the head and emits dragon:returned; it never interrupts either. The field
// is cleared on phase changes, death, reset, and fizzles when the wyrm's posture breaks.
//
// No per-frame allocations (pooled records, reused hit record; event payloads only when a cue
// fires); never throws out of update(): a failure logs once and clears the field.
// Must NOT import attacks.js (attacks.js -> bulletAttacks.js -> bullets.js).

import { TUNING } from './tuning.js';
import { TELL, RESULT } from '../../combat/rules.js';
import { clamp, smoothstep, angleDiff, distPointSegment } from '../../core/math.js';
import * as BFX from './bulletFx.js';
import { carryFire } from './wallReach.js';

export const BULLET = Object.freeze({ EMBER: 0, ORB: 2 });
export const CUE = Object.freeze({ NEW: 0, COVERED: 1, LATE: 2, CLASH: 3 });

const KEYS = ['ember', null, 'orb'];
const MAX = 360;
const MAX_GROUPS = 8;
const TMAX = 48; // ground tongues alive at once
const PMAX = 64; // tongues one plan may lay
const HIT_Y = 2.3; // a bullet above this flies over the hero
const TAU = Math.PI * 2;
const NEVER = -1e9;

function record(slot) {
  return {
    slot, alive: false, kind: 0, attack: '', tell: TELL.NORMAL,
    x: 0, y: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0,
    y0: 0, yT: 0, yH: 1, drop: 0.4,
    vy: 0, g: 0, tx: 0, tz: 0, fall: 1, // a lobbed ember: vertical speed, gravity (0: flat), where / when it lands
    wait: 0, launch: 0, launched: true, born: 0,
    r: 0.3, t: 0, life: 4, arm: 0, group: -1,
    cued: false, lead: false, dud: false, deflected: false, returned: false, defT: 0,
    cueAt: Infinity, // bullet time (b.t) of the impact its cue announced; Infinity: none announced
    hold: 0, mk: 0, heatT: 0, acc4: 0, acc: 0, seed: 0,
  };
}

function tongueRecord() {
  return {
    on: false, attack: '', x: 0, z: 0, ang: 0, sx: 0, sz: 1, t: 0, r0: 0, r1: 0, speed: 1, hold: 1, width: 1,
    damage: 0, burn: 0, knockback: 0, grp: -1, seed: 0, front: 0, tail: 0,
    hf: 0, acc: 0, acc2: 0, scT: 0, // (bulletFx: held blobs, spawn accumulators, scorch timer)
  };
}

/** A bullet stopped by cover, as a blow on it (world.destructibles.stop; y = the bullet's height). */
const COVER_BLOW = { kind: 'blast', by: 'boss', y: 0 };
/** A lobbed ember bursting where it lands (world.impact). */
const LAND_BLOW = { kind: 'blast', by: 'boss', y: 0.4, scar: false, fire: 0 };

export class Bullets {
  constructor(dragon) {
    this.d = dragon;
    this.pool = [];
    for (let i = 0; i < MAX; i++) this.pool.push(record(i));
    this.groups = [];
    // hits / max: the pattern's hit cap; ret / retMax: the HP its perfect-parry returns may deal
    for (let i = 0; i < MAX_GROUPS; i++) this.groups.push({ hits: 0, max: 99, ret: 0, retMax: Infinity });
    this.time = 0;
    this.live = 0;
    this._cursor = 0;
    this._gi = 0;
    this._phase = null;
    this._grace = 0;
    this._shield = 0;
    this._wasBroken = false;
    this._lead = null;
    this._held = { on: false, a: null, beat: null, b: null, kind: 0 }; // holdFlash()
    this._cueSmall = new Float64Array(8).fill(NEVER);
    this._cueOrb = new Float64Array(8).fill(NEVER);
    this._ci = 0;
    // impacts announced elsewhere (the brood's cues, bar()): of the guard answer (they bar orbs), of
    // the dodge answer (they bar the small ones)
    this._barGuard = new Float64Array(4).fill(NEVER);
    this._barDodge = new Float64Array(4).fill(NEVER);
    this._bi = 0;
    this._failed = false;
    this._hit = {
      damage: 0, burn: 0, knockback: 0, kind: 'fire', tell: TELL.NORMAL, parryable: true, blockable: true,
      plunge: false, perfect: false, bullet: true, attack: '', from: { x: 0, z: 0 }, point: { x: 0, y: 0, z: 0 },
    };
    // a returned shot's blow on the wyrm (dragon.takeHit copies what it keeps)
    this._ret = { damage: 0, part: 'head', point: { x: 0, y: 0, z: 0 }, dir: { x: 0, z: 1 }, heavy: false, exact: true, posture: 0 };
    this._rOut = Infinity; // the exit time of the last _ray() (s)

    // ---- ground tongues: the burning ones, and the plan of the ones still to come
    this.tongues = [];
    for (let i = 0; i < TMAX; i++) this.tongues.push(tongueRecord());
    this.tonguesLive = 0;
    this.plan = {
      on: false, attack: '', x: 0, z: 0, n: 0, i: 0, at: new Float64Array(PMAX), ang: new Float64Array(PMAX),
      r0: 0, r1: 0, speed: 1, hold: 1, width: 1, damage: 0, burn: 0, knockback: 0, grp: -1,
      headline: false, // the first touch is announced by the attack's headline beat (not by the field)
    };
    this.ttT = Infinity; // s until a tongue (burning or planned) next touches the hero; Infinity: none in 2 s
    this._tcd = 0; // the tongues cannot hit again before this runs out
    this._tCueT = NEVER; // field time of the last tongue cue (or the headline flash)
    this._tx = 0; // the touch point of the last _tongueTti() hit (the cue's glint)
    this._tz = 0;
    this._lightT = 0;
  }

  get K() {
    return TUNING.bullets;
  }

  // ---------------------------------------------------------------- spawning
  /** One flying bullet; returns its record (valid until it dies) or null (bad input / pool full). */
  spawn(kind, attack, x, y, z, yaw, speed, group = -1, life = 0) {
    const K = this.K, key = KEYS[kind], spec = key ? K?.[key] : null;
    if (!spec || !Number.isFinite(x + y + z + yaw + speed)) return null;
    let b = null;
    for (let i = 0; i < MAX; i++) {
      const c = this.pool[(this._cursor + i) % MAX];
      if (!c.alive) {
        b = c;
        this._cursor = (c.slot + 1) % MAX;
        break;
      }
    }
    if (!b) return null;
    if (this._held.on && this._held.b === b) this._fireHeld(Infinity); // its record is being reused
    b.alive = true;
    b.kind = kind;
    b.attack = attack;
    b.tell = spec.tell;
    b.x = b.px = x;
    b.y = b.y0 = y;
    b.z = b.pz = z;
    b.vx = Math.sin(yaw) * speed;
    b.vz = Math.cos(yaw) * speed;
    b.vy = 0;
    b.g = 0;
    b.tx = x;
    b.tz = z;
    b.fall = 1;
    b.yT = 0;
    b.yH = K.height;
    b.drop = clamp((y - K.height) / 8, 0.3, 0.8);
    b.wait = 0;
    b.launch = speed;
    b.launched = true;
    b.born = 0;
    b.r = spec.r;
    b.t = 0;
    b.life = life > 0 ? life : spec.life ?? 4;
    b.arm = K.arm;
    b.group = group;
    b.cued = b.lead = b.dud = b.deflected = b.returned = false;
    b.cueAt = Infinity;
    b.defT = 0;
    b.hold = b.mk = b.heatT = b.acc4 = 0;
    b.acc = Math.random();
    b.seed = Math.random() * TAU;
    this.live++;
    return b;
  }

  /**
   * An ember LOBBED from (x, y, z) that falls on the ground point (tx, tz) after `T` s under
   * K.lobG (Ember rain): it passes the hero's height `yAt` m above that point. Returns the record or null.
   */
  lob(attack, x, y, z, tx, tz, T, group = -1, life = 0, yAt = 0.5) {
    const g = this.K?.lobG ?? 22;
    if (!Number.isFinite(tx + tz + T) || !(T > 0.1)) return null;
    const dx = tx - x, dz = tz - z, D = Math.hypot(dx, dz);
    const b = this.spawn(BULLET.EMBER, attack, x, y, z, Math.atan2(dx, dz), D / T, group, life || T + 1);
    if (!b) return null;
    b.g = g;
    b.vy = (yAt - y + 0.5 * g * T * T) / T;
    b.tx = tx;
    b.tz = tz;
    b.fall = T;
    return b;
  }

  /**
   * n embers burst out of a point (a slam's fire on the ground: they rise out of a puff of flame),
   * hang in the air and fly at the hero one after another.
   */
  burst(attack, x, y, z, n, wait, stagger, speed, group = -1) {
    BFX.muzzle(this.d.fx, x, y, z, 0, 0, 12, false);
    for (let i = 0; i < n; i++) {
      const b = this.spawn(BULLET.EMBER, attack, x, y, z, Math.random() * TAU, 2.2 + Math.random() * 1.2, group, 0);
      if (!b) return;
      b.launched = false;
      b.wait = wait + i * stagger;
      b.launch = speed;
      b.yH = 1.5;
      b.life = b.wait + 3;
      b.arm = 1e9;
    }
  }

  /** A hit budget for one pattern; `retMax`: the HP its returned shots may deal (TUNING.bullets.returnBudget). Returns the group id. */
  group(max, retMax = this.K?.returnBudget ?? Infinity) {
    const i = this._gi++ % MAX_GROUPS;
    const g = this.groups[i];
    g.hits = 0;
    g.max = max > 0 ? max : 99;
    g.ret = 0;
    g.retMax = retMax >= 0 ? retMax : Infinity;
    return i;
  }

  count(kind) {
    let n = 0;
    for (let i = 0; i < MAX; i++) if (this.pool[i].alive && this.pool[i].kind === kind) n++;
    return n;
  }

  /** The bullet the pattern's headline tell stands for (announced by the brain, not by the cue). */
  setLead(b) {
    if (!b) return;
    b.lead = true;
    b.cued = true;
    this._lead = b;
  }
  leadAlive() {
    const b = this._lead;
    return !!b && b.alive && b.lead && !b.deflected;
  }
  leadPos(out) {
    const b = this._lead;
    if (!b || !b.alive || !b.lead) return false;
    out.set(b.x, b.y, b.z);
    return true;
  }
  leadTti() {
    return this.leadAlive() ? this.tti(this._lead) : Infinity;
  }

  /** The headline flash went out `tti` s before the lead bullet's impact: register that impact. */
  headlined(kind, tti) {
    this.cover(kind, tti);
    if (this.leadAlive() && Number.isFinite(tti)) this._lead.cueAt = this._lead.t + tti;
  }

  /**
   * A pattern ended before its headline flash (beat record `beat` of the ended action `a`). While
   * its lead bullet is still on its way to the hero the field keeps the flash and fires it
   * flashLead s before THAT impact; at once if the lead dies first (tell / flash stay paired);
   * dropped when the field is cleared or fizzles. Returns false when there is nothing to wait for:
   * the caller flashes now, and a lead still in the air is handed to its own cue.
   */
  holdFlash(a, beat, kind) {
    if (!a || !beat || !this.leadAlive()) return false;
    const b = this._lead;
    if (!Number.isFinite(this.tti(b))) {
      b.cued = false;
      return false;
    }
    const h = this._held;
    if (h.on) this._fireHeld(Infinity); // one at a time: the older one goes out now
    h.on = true;
    h.a = a;
    h.beat = beat;
    h.b = b;
    h.kind = kind;
    return true;
  }

  _heldFlash() {
    const h = this._held;
    if (!h.on) return;
    const b = h.b;
    if (!b.alive || !b.lead || b.deflected) {
      this._fireHeld(Infinity);
      return;
    }
    const tt = this.tti(b);
    if (tt <= TUNING.flashLead) this._fireHeld(tt);
  }

  _fireHeld(tt) {
    const h = this._held, K = this.K;
    const b = h.b, a = h.a, beat = h.beat, kind = h.kind;
    this._dropHeld();
    beat.flashed = true;
    const keep = this._lead;
    this._lead = b; // the flash is drawn at ITS bullet (dragon.partPos 'bullet')
    try {
      this.d.flashTell(a, beat);
    } finally {
      this._lead = keep;
    }
    if (!b.alive || !b.lead || b.deflected) return;
    if (!Number.isFinite(tt)) b.cued = false; // flashed early: its own cue announces the impact
    else if (tt < K.cueMin && b.t - b.born < K.young) b.dud = true;
    else {
      this.cover(kind, tt);
      b.cueAt = b.t + tt;
    }
  }

  _dropHeld() {
    const h = this._held;
    h.on = false;
    h.a = h.beat = h.b = null;
  }

  /** Silent: every bullet and every tongue gone, the plan dropped (phase change, death, reset). */
  clear() {
    for (let i = 0; i < MAX; i++) this.pool[i].alive = false;
    this.live = 0;
    for (let i = 0; i < TMAX; i++) this.tongues[i].on = false;
    this.tonguesLive = 0;
    this.plan.on = false;
    this.plan.headline = false;
    this.ttT = Infinity;
    this._tcd = 0;
    this._grace = this._shield = 0;
    this._lead = null;
    this._dropHeld();
    this._cueSmall.fill(NEVER);
    this._cueOrb.fill(NEVER);
    this._barGuard.fill(NEVER);
    this._barDodge.fill(NEVER);
  }

  // ---------------------------------------------------------------- the cue
  /** Seconds until this bullet touches the hero on its present course (Infinity: it will not). */
  tti(b) {
    if (!b.alive || b.deflected || b.dud) return Infinity;
    const d = this.d, p = d.game.player?.position;
    if (!p) return Infinity;
    const R = b.r + (d.game.player.radius ?? 0.45);
    const dx = p.x - b.x, dz = p.z - b.z;
    const dist = Math.hypot(dx, dz);
    if (!Number.isFinite(dist)) return Infinity;
    if (!b.launched) return Math.max(0, b.wait - b.t) + Math.max(0, dist - R) / Math.max(1, b.launch);
    let t = this._ray(b, dx, dz, R);
    if (!Number.isFinite(t)) return Infinity;
    if (b.g > 0) {
      // a lobbed ember: inside his circle while low enough (under HIT_Y, above the ground)
      const g = b.g, out = this._rOut;
      let low = 0;
      if (b.y > HIT_Y) {
        const disc = b.vy * b.vy - 2 * g * (HIT_Y - b.y);
        if (disc < 0) return Infinity;
        low = (b.vy + Math.sqrt(disc)) / g;
      }
      const ground = (b.vy + Math.sqrt(b.vy * b.vy + 2 * g * Math.max(0, b.y))) / g;
      t = Math.max(t, low, b.arm - b.t);
      if (t > Math.min(out, ground) || b.t + t > b.life) return Infinity;
      return t;
    }
    t = Math.max(t, b.arm - b.t);
    if (b.t + t > b.life) return Infinity;
    const yk = smoothstep(0, 1, clamp((b.t + t - b.yT) / b.drop, 0, 1));
    if (b.y0 + (b.yH - b.y0) * yk > HIT_Y) return Infinity;
    return t;
  }

  /** Entry time (s) of the bullet into the hero's circle (relative motion); the exit time goes to _rOut. */
  _ray(b, dx, dz, R) {
    const v = this.d.sense?.vel;
    const hvx = Number.isFinite(v?.x) ? v.x : 0, hvz = Number.isFinite(v?.z) ? v.z : 0;
    const rx = b.vx - hvx, rz = b.vz - hvz;
    const c = dx * dx + dz * dz - R * R;
    const a = rx * rx + rz * rz;
    const bq = -(dx * rx + dz * rz); // q . rv, q = bullet - hero
    this._rOut = Infinity;
    if (a < 1e-6) return c <= 0 ? 0 : Infinity;
    const disc = bq * bq - a * c;
    if (disc < 0) return Infinity;
    const sq = Math.sqrt(disc);
    this._rOut = (-bq + sq) / a;
    if (c <= 0) return 0;
    if (bq >= 0) return Infinity;
    return (-bq - sq) / a;
  }

  /**
   * Announce an impact `tti` s from now. NEW: glint + combat:tell + combat:flash went out;
   * COVERED: an announced impact of the same class is close enough to answer it too;
   * LATE: too late to react to (the caller decides: dud or hit); CLASH: an announced impact of the
   * other class (the other answer) is within K.clashSep s of it: not announced (the caller makes the
   * bullet a dud).
   */
  cue(kind, attack, tell, tti, x, y, z) {
    if (!Number.isFinite(tti)) return CUE.LATE;
    const K = this.K, orb = kind === BULLET.ORB;
    const tr = orb ? this._cueOrb : this._cueSmall;
    const at = this.time + tti;
    const pre = orb ? 0.05 : 0.08;
    for (let i = 0; i < 8; i++) if (at >= tr[i] - pre && at <= tr[i] + K.cueGap) return CUE.COVERED;
    const ot = orb ? this._cueSmall : this._cueOrb, sep = K.clashSep ?? 0.35;
    for (let i = 0; i < 8; i++) if (Math.abs(at - ot[i]) < sep) return CUE.CLASH;
    const bar = orb ? this._barGuard : this._barDodge;
    for (let i = 0; i < 4; i++) if (Math.abs(at - bar[i]) < sep) return CUE.CLASH;
    if (tti < K.cueMin + (orb ? 0.03 : 0)) return CUE.LATE;
    tr[this._ci++ & 7] = at;
    const d = this.d;
    d.emit('combat:tell', { source: 'dragon', attack, tell, impactIn: tti, x, z, hazard: true, bullet: true });
    d.emit('combat:flash', { source: 'dragon', attack, tell, x, y, z, hazard: true, bullet: true });
    BFX.cueGlint(d.fx, x, y, z, tell);
    return CUE.NEW;
  }

  /**
   * An impact `tti` s from now that something outside the field announced with `tell` (a brood
   * cue): a bullet of the other answer due within K.clashSep s of it is not announced (a dud: CLASH),
   * as for an orb beside an ember. It covers nothing (the bullets of its answer cue themselves).
   */
  bar(tell, tti) {
    if (!Number.isFinite(tti)) return;
    const tr = tell === TELL.RED || tell === TELL.BLACK ? this._barDodge : this._barGuard;
    tr[this._bi++ & 3] = this.time + tti;
  }

  /** Register an impact that something else announces (a pattern's headline tell). */
  cover(kind, tti) {
    if (!Number.isFinite(tti)) return;
    const tr = kind === BULLET.ORB ? this._cueOrb : this._cueSmall;
    const at = this.time + tti;
    for (let i = 0; i < 8; i++) if (Math.abs(tr[i] - at) < 0.06) return;
    tr[this._ci++ & 7] = at;
  }

  // ---------------------------------------------------------------- the ground tongues
  /**
   * Lay a plan of tongues: o = { attack, x, z (the pivot every tongue runs out from), times (s from
   * now, ascending), angs (world yaw of each), r0, r1 (the stretch from the pivot that burns), speed
   * (m/s of the front), hold (s each spot burns behind it), width, damage, burn, knockback, grp (hit
   * cap group), headline }. The field releases each tongue at its time; a new plan replaces the old
   * (its tongues still burning burn on).
   */
  scour(o) {
    const P = this.plan;
    const n = Math.min(PMAX, o?.times?.length | 0);
    if (!n || !Number.isFinite(o.x + o.z + o.r0 + o.r1 + o.speed + o.hold)) return false;
    P.on = true;
    P.attack = o.attack ?? 'fireWheel';
    P.x = o.x;
    P.z = o.z;
    P.n = n;
    P.i = 0;
    for (let i = 0; i < n; i++) {
      P.at[i] = this.time + (Number(o.times[i]) || 0);
      P.ang[i] = Number(o.angs[i]) || 0;
    }
    P.r0 = o.r0;
    P.r1 = o.r1;
    P.speed = Math.max(0.5, o.speed);
    P.hold = Math.max(0.1, o.hold);
    P.width = o.width ?? 1.1;
    P.damage = o.damage ?? 0;
    P.burn = o.burn ?? 0;
    P.knockback = o.knockback ?? 0;
    P.grp = o.grp ?? -1;
    P.headline = !!o.headline;
    return true;
  }
  /** Shift the plan's pivot (the breath's body moved before its first tongue). */
  movePlan(x, z) {
    if (Number.isFinite(x + z)) {
      this.plan.x = x;
      this.plan.z = z;
    }
  }
  /** The tongues still to come are dropped (the ones burning burn out). */
  stopScour() {
    this.plan.on = false;
    this.plan.headline = false;
  }
  /** The attack's headline flash went out: from here on the field announces its own touches. */
  scourHeadlined() {
    this.plan.headline = false;
    this._tCueT = this.time;
  }
  /** Tongues burning or still to come. */
  get scouring() {
    return this.plan.on || this.tonguesLive > 0;
  }
  /** The next planned tongue's index and time from now (s; Infinity: none). */
  planNext() {
    const P = this.plan;
    return P.on && P.i < P.n ? P.at[P.i] - this.time : Infinity;
  }

  _release(P, ang) {
    let tg = null;
    for (let i = 0; i < TMAX; i++) {
      if (!this.tongues[i].on) {
        tg = this.tongues[i];
        break;
      }
    }
    if (!tg) return;
    tg.on = true;
    tg.attack = P.attack;
    tg.x = P.x;
    tg.z = P.z;
    tg.ang = ang;
    tg.sx = Math.sin(ang);
    tg.sz = Math.cos(ang);
    tg.t = 0;
    tg.r0 = P.r0;
    tg.r1 = P.r1;
    tg.speed = P.speed;
    tg.hold = P.hold;
    tg.width = P.width;
    tg.damage = P.damage;
    tg.burn = P.burn;
    tg.knockback = P.knockback;
    tg.grp = P.grp;
    tg.seed = Math.random() * 100;
    tg.front = tg.tail = P.r0;
    tg.hf = tg.acc = tg.acc2 = tg.scT = 0;
    this.tonguesLive++;
    BFX.tongueRelease(this.d.fx, tg);
  }

  /** Does a tongue laid from (x, z) along `ang`, `age` s old, cover the hero at (hx, hz)? */
  static _covers(x, z, ang, r0, r1, speed, hold, width, age, hx, hz, hr) {
    if (age < 0) return false;
    const dx = hx - x, dz = hz - z, r = Math.hypot(dx, dz);
    const front = Math.min(r1, r0 + speed * age), tail = r0 + speed * Math.max(0, age - hold);
    if (r < tail - hr || r > front + hr || r < 0.5 || tail >= r1) return false;
    const half = Math.asin(Math.min(1, (width / 2 + hr / 2) / r));
    return Math.abs(angleDiff(ang, Math.atan2(dx, dz))) <= half;
  }

  /**
   * Seconds until a tongue (burning, or one the plan still holds) first covers the hero, him on his
   * sensed velocity (Infinity: not within 2 s). The touch point goes to _tx / _tz.
   */
  _tongueTti(hx, hz, hr) {
    const v = this.d.sense?.vel, P = this.plan;
    const vx = Number.isFinite(v?.x) ? v.x : 0, vz = Number.isFinite(v?.z) ? v.z : 0;
    const C = Bullets._covers;
    let tau = 0;
    for (let s = 0; s < 64; s++) {
      if (s > 0) tau += s <= 36 ? 1 / 60 : 1 / 20;
      if (tau > 2.0) break;
      const x = hx + vx * tau, z = hz + vz * tau;
      for (let i = 0; i < TMAX; i++) {
        const tg = this.tongues[i];
        if (tg.on && C(tg.x, tg.z, tg.ang, tg.r0, tg.r1, tg.speed, tg.hold, tg.width, tg.t + tau, x, z, hr)) {
          this._tx = x;
          this._tz = z;
          return tau;
        }
      }
      if (P.on) {
        const now = this.time + tau;
        for (let i = P.i; i < P.n && P.at[i] <= now; i++) {
          if (C(P.x, P.z, P.ang[i], P.r0, P.r1, P.speed, P.hold, P.width, now - P.at[i], x, z, hr)) {
            this._tx = x;
            this._tz = z;
            return tau;
          }
        }
      }
    }
    return Infinity;
  }

  _tongues(dt, p, hr) {
    const P = this.plan, d = this.d, fx = d.fx, KT = this.K.tongue;
    this.ttT = Infinity;
    this._tcd -= dt;
    if (P.on) {
      while (P.i < P.n && this.time >= P.at[P.i]) this._release(P, P.ang[P.i++]);
      if (P.i >= P.n) {
        P.on = false;
        P.headline = false;
      }
    }
    if (!P.on && this.tonguesLive <= 0) return;
    const hx = p ? p.x : NaN, hz = p ? p.z : NaN;
    let live = 0, near = null, nearD = Infinity;
    for (let i = 0; i < TMAX; i++) {
      const tg = this.tongues[i];
      if (!tg.on) continue;
      tg.t += dt;
      tg.front = Math.min(tg.r1, tg.r0 + tg.speed * tg.t);
      tg.tail = tg.r0 + tg.speed * Math.max(0, tg.t - tg.hold);
      if (tg.tail >= tg.r1 || !Number.isFinite(tg.front + tg.tail)) {
        tg.on = false;
        continue;
      }
      live++;
      BFX.tongueLive(fx, tg, dt);
      if (p) {
        // the light rides the front nearest the hero
        const fxp = tg.x + tg.sx * tg.front, fzp = tg.z + tg.sz * tg.front;
        const dd = (fxp - hx) * (fxp - hx) + (fzp - hz) * (fzp - hz);
        if (dd < nearD) {
          nearD = dd;
          near = tg;
        }
      }
    }
    this.tonguesLive = live;
    this._lightT -= dt;
    if (near && this._lightT <= 0) {
      this._lightT = 0.12;
      BFX.tongueLight(fx, near);
    }
    if (!p || !Number.isFinite(hx + hz)) return;
    // a touch: dodge only, and only off an announced touch
    if (this._tcd <= 0 && this._grace <= 0) {
      for (let i = 0; i < TMAX; i++) {
        const tg = this.tongues[i];
        if (!tg.on || !Bullets._covers(tg.x, tg.z, tg.ang, tg.r0, tg.r1, tg.speed, tg.hold, tg.width, tg.t, hx, hz, hr)) continue;
        const grp = tg.grp >= 0 ? this.groups[tg.grp] : null;
        if ((grp && grp.hits >= grp.max) || this.time - this._tCueT > KT.cueHold) {
          this._tcd = KT.cdOther; // (unannounced, or the pattern has hit its cap: it licks him harmlessly)
          break;
        }
        const h = this._hit;
        h.damage = tg.damage;
        h.burn = tg.burn;
        h.knockback = tg.knockback;
        h.kind = 'fire';
        h.tell = TELL.RED;
        h.parryable = h.blockable = false;
        h.plunge = false;
        h.perfect = true;
        h.attack = tg.attack;
        h.from.x = tg.x;
        h.from.z = tg.z;
        h.point.x = hx;
        h.point.y = 1;
        h.point.z = hz;
        const res = d.hitPlayer(h, null);
        if (res === RESULT.HIT) {
          if (grp) grp.hits++;
          this._tcd = KT.cd;
        } else this._tcd = res === RESULT.DODGED || res === RESULT.PERFECT ? KT.cdDodge : KT.cdOther;
        return;
      }
    }
    // the cue: the next touch, flashLead s ahead
    const tt = this._tongueTti(hx, hz, hr);
    this.ttT = tt;
    if (!Number.isFinite(tt) || P.headline || this._tcd > TUNING.flashLead || this.time - this._tCueT < 0.4) return;
    if (tt >= KT.cueMin && tt <= TUNING.flashLead + 0.04) {
      this._tCueT = this.time;
      const att = P.attack || 'fireWheel';
      d.emit('combat:tell', { source: 'dragon', attack: att, tell: TELL.RED, impactIn: tt, x: hx, z: hz, hazard: true, bullet: true });
      d.emit('combat:flash', { source: 'dragon', attack: att, tell: TELL.RED, x: this._tx, y: 1.2, z: this._tz, hazard: true, bullet: true });
      BFX.cueGlint(fx, this._tx, 1.4, this._tz, TELL.RED);
    }
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    if (!(dt > 0)) return;
    try {
      this._update(dt);
    } catch (err) {
      if (!this._failed) console.error('[dragon] bullets update failed', err);
      this._failed = true;
      this.clear();
    }
  }

  _kill(b) {
    if (!b.alive) return;
    b.alive = false;
    b.lead = false;
    this.live = Math.max(0, this.live - 1);
  }

  _fizzleAll() {
    const fx = this.d.fx;
    this._dropHeld();
    for (let i = 0; i < MAX; i++) {
      const b = this.pool[i];
      if (!b.alive) continue;
      BFX.fizzle(fx, b.x, b.y, b.z, b.kind);
      this._kill(b);
    }
  }

  /** A lobbed ember reaches the ground: a splash of fire, the ground scorched, the world struck. */
  _landed(b) {
    const d = this.d, K = this.K, W = K.world;
    BFX.lobLand(d.fx, b.x, b.z);
    const w = d.game.world;
    if (w) {
      LAND_BLOW.fire = W?.landFire ?? 0;
      w.impact?.(b.x, b.z, 0.9, W?.land ?? 0.2, LAND_BLOW);
      w.scorch?.burnCircle?.(b.x, b.z, 0.9, 0.35, 0.8);
    }
    this._kill(b);
  }

  _update(dt) {
    const d = this.d, g = d.game, fx = d.fx, K = this.K;
    this.time += dt;
    if (this._phase !== d.phase) {
      if (this._phase !== null) this.clear();
      this._phase = d.phase;
    }
    const st = d.state;
    if (st === 'dying' || st === 'dead' || st === 'sleeping') {
      if (this.live > 0) this._fizzleAll();
      if (this.scouring) {
        for (let i = 0; i < TMAX; i++) this.tongues[i].on = false;
        this.tonguesLive = 0;
        this.plan.on = false;
      }
      this._dropHeld();
      return;
    }
    if (d.broken && !this._wasBroken) this._fizzleAll(); // a posture break clears the air
    this._wasBroken = !!d.broken;
    if (this._grace > 0) this._grace -= dt;
    if (this._shield > 0) this._shield -= dt;

    const pl = g.player;
    const p = pl?.position && Number.isFinite(pl.position.x + pl.position.z) ? pl.position : null;
    const hr = pl?.radius ?? 0.45;
    this._tongues(dt, p, hr);
    this._heldFlash();
    if (this.live <= 0) return;

    const sw = p && pl.isSwinging?.() && pl.sweep?.valid ? pl.sweep : null;
    const FL = TUNING.flashLead;
    const bound2 = K.bound * K.bound;
    for (let i = 0; i < MAX; i++) {
      const b = this.pool[i];
      if (!b.alive) continue;
      b.t += dt;
      b.px = b.x;
      b.pz = b.z;
      if (b.deflected) {
        this._ricochet(b, dt);
        if (b.alive) {
          if (b.returned) BFX.drawReturned(fx, b, dt, K.returnSize);
          else BFX.drawBullet(fx, b, dt);
        }
        continue;
      }
      if (!b.launched) {
        // hanging: drifts out of the burst and rises, then flies at the hero
        const dec = Math.exp(-3 * dt);
        b.vx *= dec;
        b.vz *= dec;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.y = b.y0 + (b.yH - b.y0) * smoothstep(0, 1, clamp(b.t / 0.45, 0, 1));
        if (b.t >= b.wait) {
          if (!p) {
            BFX.fizzle(fx, b.x, b.y, b.z, b.kind);
            this._kill(b);
            continue;
          }
          const yaw = Math.atan2(p.x - b.x, p.z - b.z);
          b.vx = Math.sin(yaw) * b.launch;
          b.vz = Math.cos(yaw) * b.launch;
          b.launched = true;
          b.y0 = b.y;
          b.yT = b.t;
          b.yH = K.height;
          b.drop = 0.2;
          b.born = b.t;
          b.arm = b.t + 0.05;
          b.life = b.t + 2.5;
          BFX.muzzle(fx, b.x, b.y, b.z, b.vx / b.launch, b.vz / b.launch, 3, false);
        }
      } else if (b.g > 0) {
        // lobbed: a ballistic arc down onto its spot
        b.vy -= b.g * dt;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.y += b.vy * dt;
        if (b.y <= 0.05 && b.vy < 0) {
          this._landed(b);
          continue;
        }
        BFX.lobMark(fx, b, dt);
      } else {
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.y = b.y0 + (b.yH - b.y0) * smoothstep(0, 1, clamp((b.t - b.yT) / b.drop, 0, 1));
      }
      if (!Number.isFinite(b.x + b.y + b.z)) {
        this._kill(b);
        continue;
      }
      if (b.t >= b.life) {
        BFX.fizzle(fx, b.x, b.y, b.z, b.kind);
        if (b.launched) carryFire(d, b.x, b.z, b.vx, b.vz, 'shot', b.y); // (a shot that missed flies on into the trees)
        this._kill(b);
        continue;
      }
      const ox = b.x - d.position.x, oz = b.z - d.position.z;
      if (ox * ox + oz * oz > bound2) {
        if (b.launched) carryFire(d, b.x, b.z, b.vx, b.vz, 'shot', b.y);
        this._kill(b);
        continue;
      }
      // cover (ADR-107): a bullet that meets a standing stone, a pillar or a trunk bursts on it and
      // chips it (one the hero sent back flies on: it is his now)
      if (!b.deflected && (b.x !== b.px || b.z !== b.pz)) {
        const cover = d.game.world?.destructibles;
        if (cover?.stop) {
          COVER_BLOW.y = b.y;
          if (cover.stop(b.px, b.pz, b.x, b.z, b.r, (TUNING.world?.bullet ?? 0.12) * (b.kind === BULLET.ORB ? 3 : 1), COVER_BLOW)) {
            BFX.fizzle(fx, b.x, b.y, b.z, b.kind);
            this._kill(b);
            continue;
          }
        }
      }
      // a swing cuts the small ones out of the air
      if (sw && b.kind !== BULLET.ORB) {
        const R = b.r + K.cut;
        const A = sw.a, B = sw.b, PA = sw.pa, PB = sw.pb;
        if (
          distPointSegment(b.x, b.y, b.z, A.x, A.y, A.z, B.x, B.y, B.z) <= R ||
          distPointSegment(b.x, b.y, b.z, PA.x, PA.y, PA.z, PB.x, PB.y, PB.z) <= R ||
          distPointSegment(b.x, b.y, b.z, (A.x + PA.x) / 2, (A.y + PA.y) / 2, (A.z + PA.z) / 2, (B.x + PB.x) / 2, (B.y + PB.y) / 2, (B.z + PB.z) / 2) <= R
        ) {
          BFX.cutSpark(fx, b.x, b.y, b.z, b.kind);
          this._kill(b);
          continue;
        }
      }
      if (p) {
        if (!b.cued && !b.dud) {
          const tt = this.tti(b);
          if (tt <= FL + (b.kind === BULLET.ORB ? 0.04 : 0)) {
            const r = this.cue(b.kind, b.attack, b.tell, tt, b.x, b.y, b.z);
            if ((r === CUE.LATE && b.t - b.born < K.young) || r === CUE.CLASH) b.dud = true;
            b.cued = true;
            b.cueAt = b.t + tt;
          }
        }
        if (b.launched && b.t >= b.arm && b.y <= HIT_Y) {
          const R = b.r + hr;
          if (distPointSegment(p.x, 0, p.z, b.px, 0, b.pz, b.x, 0, b.z) <= R) {
            this._touch(b, p);
            if (!b.alive) continue;
          }
        }
      }
      BFX.drawBullet(fx, b, dt);
    }
  }

  _ricochet(b, dt) {
    const d = this.d, K = this.K;
    const head = d.rig?.pt?.head;
    b.defT += dt;
    if (!head || !Number.isFinite(head.x + head.y + head.z) || b.defT > 1.5) {
      BFX.burst(d.fx, b.x, b.y, b.z, b.kind);
      this._kill(b);
      return;
    }
    const dx = head.x - b.x, dy = head.y - b.y, dz = head.z - b.z;
    const l = Math.hypot(dx, dy, dz);
    const sp = b.returned ? K.returnSpeed : K.ricochet;
    const step = sp * dt;
    if (l <= step + 1) {
      if (b.returned) this._land(b, head);
      else {
        BFX.burst(d.fx, head.x, head.y, head.z, b.kind);
        d.flash = Math.max(d.flash || 0, 0.3);
      }
      this._kill(b);
      return;
    }
    b.vx = (dx / l) * sp;
    b.vz = (dz / l) * sp;
    b.x += (dx / l) * step;
    b.y += (dy / l) * step;
    b.z += (dz / l) * step;
  }

  /**
   * A returned shot reaches the head: the kind's returnDamage through dragon.takeHit (final, part
   * head: the phase gate holds, it may kill) with returnPosture instead of the weapon gain, a head
   * flinch (visual), a burst, a small shake; 'dragon:returned' { kind, damage, x, y, z }. The wyrm's
   * action goes on (takeHit never interrupts it).
   */
  _land(b, head) {
    const d = this.d, K = this.K, key = KEYS[b.kind], spec = key ? K[key] : null;
    BFX.returnBurst(d.fx, head.x, head.y, head.z, b.kind);
    const o = this._ret;
    o.damage = spec?.returnDamage ?? 0;
    o.posture = spec?.returnPosture ?? 0;
    o.heavy = false;
    o.point.x = head.x;
    o.point.y = head.y;
    o.point.z = head.z;
    const sp = Math.hypot(b.vx, b.vz) || 1;
    o.dir.x = b.vx / sp;
    o.dir.z = b.vz / sp;
    let dmg = 0;
    try {
      dmg = d.takeHit?.(o) ?? 0;
    } catch (err) {
      console.error('[dragon] returned shot takeHit failed', err);
    }
    d.flinchHead = true;
    d.flash = Math.max(d.flash || 0, 0.7);
    d.game.shake?.(0.12);
    if (dmg > 0) d.emit('dragon:returned', { kind: b.kind, damage: dmg, x: head.x, y: head.y, z: head.z });
  }

  _touch(b, p) {
    const d = this.d, fx = d.fx, K = this.K;
    const grp = b.group >= 0 ? this.groups[b.group] : null;
    if (b.dud || this._grace > 0 || (grp && grp.hits >= grp.max)) {
      BFX.fizzle(fx, b.x, b.y, b.z, b.kind);
      this._kill(b);
      return;
    }
    const orb = b.kind === BULLET.ORB;
    if (this._shield > 0 && !orb) {
      BFX.cutSpark(fx, b.x, b.y, b.z, b.kind);
      this._kill(b);
      return;
    }
    const spec = K[KEYS[b.kind]];
    const sp = Math.hypot(b.vx, b.vz) || 1;
    const h = this._hit;
    h.damage = spec.damage;
    h.burn = spec.burn ?? 0;
    h.knockback = spec.knockback ?? 0;
    h.kind = orb ? 'fireball' : 'fire';
    h.tell = b.tell;
    h.parryable = h.blockable = !orb;
    h.plunge = false;
    h.perfect = orb;
    h.attack = b.attack;
    h.from.x = p.x - (b.vx / sp) * 3;
    h.from.z = p.z - (b.vz / sp) * 3;
    h.point.x = b.x;
    h.point.y = b.y;
    h.point.z = b.z;
    const r = d.hitPlayer(h, null);
    if (r === RESULT.PARRIED) this._deflect(b, spec, p, !!d.game.player?.deflect?.perfect);
    else if (r === RESULT.HIT) {
      BFX.burst(fx, b.x, b.y, b.z, b.kind);
      if (grp) grp.hits++;
      this._grace = K.grace;
      this._kill(b);
    } else if (r === RESULT.BLOCKED) {
      BFX.burst(fx, b.x, b.y, b.z, b.kind);
      this._kill(b);
    } else if (r === RESULT.DODGED || r === RESULT.PERFECT) {
      b.arm = b.t + 0.7; // rolled through: it flies on
      b.cued = true;
    } else b.arm = b.t + 0.3;
  }

  /**
   * A parried bullet flies back to the head. Normal: the kind's posture now, no damage. `perfect`
   * (an ember parried within DEFENSE.perfectParryWindow): it is RETURNED, and its damage and
   * returnPosture land with it (_land). Only the struck bullet comes back: the clump it opens the
   * shield for is popped as usual.
   */
  _deflect(b, spec, p, perfect = false) {
    const d = this.d, fx = d.fx, K = this.K;
    const grp = b.group >= 0 ? this.groups[b.group] : null;
    b.deflected = true;
    b.g = 0; // (a lobbed one flies back straight like the rest)
    // a pattern gives back at most its group's return budget (a well-played pattern returns <= ~8 %
    // of a phase's HP): past it a perfect parry is a plain deflect
    b.returned = !!perfect && spec.returnDamage > 0 && (!grp || grp.ret + spec.returnDamage <= grp.retMax + 1e-6);
    if (b.returned && grp) grp.ret += spec.returnDamage;
    b.defT = 0;
    b.lead = false;
    b.y0 = b.yH = b.y;
    if (!b.returned) d.addPosture?.(spec.posture ?? 0);
    BFX.deflectSpark(fx, b.x, b.y, b.z, b.kind);
    if (b.returned) BFX.returnLaunch(fx, b.x, b.y, b.z);
    d.emit('dragon:parried', { attack: b.attack, tell: b.tell, hit: 0, last: false, bullet: true, perfect: !!perfect });
    this._shield = K.cueGap;
    // the clash bursts the small bullets round the hero and the ones about to land
    const pop2 = K.pop * K.pop;
    for (let i = 0; i < MAX; i++) {
      const o = this.pool[i];
      if (!o.alive || o === b || o.deflected || !o.launched || o.kind === BULLET.ORB) continue;
      const dx = o.x - p.x, dz = o.z - p.z;
      if (dx * dx + dz * dz <= pop2 || this.tti(o) < K.cueGap + 0.03) {
        BFX.cutSpark(fx, o.x, o.y, o.z, o.kind);
        this._kill(o);
      }
    }
  }
}
