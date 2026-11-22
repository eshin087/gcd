import { clamp, wrapAngle, turnToward } from '../../../core/math.js';
import { TELL, RESULT } from '../../../combat/rules.js';
import { buildHero, setHeroGlyphScale, installLean } from '../../player/model.js';
import { HeroAnimator } from '../../player/anim.js';
import { batchRigid } from '../../../render/rigidBatch.js';
import { perPhase } from '../duelist/realise.js';

// The paper selves (ADR-131): Wen Yao's own extra bodies, as the Starless Lord's spells are his own
// things (starlessLord/spells.js). The game still has ONE boss: this is a fixed pool owned by the fox
// (`d.clones`), stepped from his brainFrame and posed from his afterPose. The roadmap's "boss slot as
// an actor list" is not this.
//
// A self looks like him and fights like a shadow of him: it tears free round the hero, walks in, cuts in
// turn (one at a time: the cutting TOKEN) and pops in one hit. It never blocks the hero's way (no body
// circle), never casts a shadow (not a shadow caster), never has the steel's sweep or lit edge, never
// holds the Pearl. The lock-on, the name tag, the boss bar and the minimap follow only the real one.
//
// Its blow is told to the cue ledger (brain.expect) as its windup starts and waits on the fairness guard
// (brain.fairDelay): two cues needing different answers are never within the guard's `sep`. It is cued
// as his blows are (combat:tell at the windup, combat:flash + the white glint flashLead before), and it
// goes through d.hitPlayer as a thrown thing (`projectile`): blockable, parryable, dodgeable; a parry
// pops the self and nicks his posture without recoiling him.
//
// Surface (fox.js): new FoxClones(d) (inside his constructor: every rig is built there, so a seeded
// fight never shifts), reset(), frame(dt), pose(dt) (after his pose: their own poses, their hurt spheres
// pushed into d.hurtSpheres), spawn(n, why), popAt(i, x, y, z, heavy, by) → popped, popAll(by),
// burnAll() (phase 3's change), live (count), alive(i), nearest(x, z) → i | -1, swapWith(i) (the real
// one and self i trade places), round(atImpact) (the Thousand-Body Round), handPoint(i, out) (the
// Pearl's thread), rootOf(i) (drawnPoint), busy (a self winding up or striking).
// Its rigs are plain hero rigs: a hero-side double (the Paper Double reward, ADR-135) can take one later.

const IN = 'in', STALK = 'stalk', WIND = 'wind', STRIKE = 'strike', RECOVER = 'recover', DEAD = 'dead';
const PARTS = ['clone0', 'clone1', 'clone2', 'clone3', 'clone4', 'clone5', 'clone6', 'clone7'];
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const SEP = 1.7; // m the selves keep apart as they stalk

export class FoxClones {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T.clones;
    const n = Math.max(1, this.T.pool | 0);
    /** the pool: one record per rig, built now and never again */
    this.list = [];
    for (let i = 0; i < n; i++) this.list.push(this._make(i));
    // the gameplay stream (its own: no look can move it) and the look stream
    this._gs = 0x1f83d9ab;
    this._ls = 0x5be0cd19;
    this.tokenAt = 0; // the clock time the next self may begin a windup
    this.clock = 0;
    this._flash = { source: 'dragon', attack: 'paperCut', tell: TELL.NORMAL, x: 0, y: 0, z: 0, perilous: false, flare: false };
    this._tell = { source: 'dragon', attack: 'paperCut', tell: TELL.NORMAL, impactIn: 0.5, x: 0, z: 0, flare: false };
    this._ev = { kind: 'spawn', x: 0, z: 0, by: '' };
    this._from = { x: 0, z: 0 };
    this._extra = { around: true };
    this._v = d._v.clone();
    this._clip = null; // the paperCut clip (realised once: its windup is fixed)
    this._cut = null; // that realised move (its beat's impact / end)
    this.reset();
  }

  /** One rig of the pool, in his colours, hidden. */
  _make(i) {
    const d = this.d, K = d.kit;
    const rig = buildHero(this.game.U, K.loadout);
    d._tintSelf?.(rig.materials);
    const root = rig.root;
    root.name = `paperSelf${i}`;
    root.visible = false;
    const pilot = {
      position: root.position, yaw: 0, state: 'duel', stateT: 0, animT: 0, atk: { def: null },
      groundVel: { x: 0, z: 0 }, kb: { x: 0, z: 0 }, chargeK: 0, releaseK: 0, recoil: 0, lockOn: false, guardHold: 0, ward: 0, wardClip: null,
    };
    const anim = new HeroAnimator(rig, pilot, K.poses);
    const scale = d.drawScale;
    pilot.drawScale = scale;
    const lean = installLean(root, scale);
    // (not markCaster: a self casts no shadow. One draw call per material, as his own rig)
    const batch = batchRigid(this.game.U, root);
    this.game.scene?.add?.(root);
    const hs = [
      { x: 0, y: 0, z: 0, r: this.T.hurt[0], part: PARTS[i], mult: 1 },
      { x: 0, y: 0, z: 0, r: this.T.hurt[1], part: PARTS[i], mult: 1 },
    ];
    return {
      i, rig, root, pilot, anim, lean, batch, hs, mats: rig.mats,
      alive: false, state: DEAD, t: 0, x: 0, z: 0, yaw: 0, slot: 0, handle: null,
      W: 0, impact: 0, end: 0, flashed: false, struck: false, round: false, closed: 0, fade: 0, ox: 0, oz: 0,
    };
  }

  /** The gameplay stream 0..1 (positions, slots; never Math.random, never the looks'). */
  _g() {
    this._gs = (Math.imul(this._gs, 1664525) + 1013904223) >>> 0;
    return this._gs / 4294967296;
  }

  reset() {
    for (const c of this.list) this._hide(c);
    this.tokenAt = 0;
    this.clock = 0;
    this._gs = 0x1f83d9ab;
  }

  _hide(c) {
    c.alive = false;
    c.state = DEAD;
    c.round = false;
    c.handle?.cancel?.();
    c.handle = null;
    c.root.visible = false;
  }

  get live() {
    let n = 0;
    for (const c of this.list) if (c.alive) n++;
    return n;
  }

  alive(i) {
    return !!this.list[i]?.alive;
  }

  /** A self winding up or striking (its blow is coming). */
  get busy() {
    for (const c of this.list) if (c.alive && (c.state === WIND || c.state === STRIKE)) return true;
    return false;
  }

  /** The cap this phase. */
  cap() {
    return Math.min(this.list.length, perPhase(this.T.max, this.d.phase));
  }

  // ---------------------------------------------------------------- spawning
  /**
   * Tear `n` selves off him (to the phase's cap) on a ring round the hero, at least `apart` m from each
   * other and from him, each on ground he may stand on. `why`: 'scatter' | 'phase' | 'debug'. Returns
   * how many tore free.
   */
  spawn(n, why = 'scatter') {
    const d = this.d, p = this.game.player?.position, T = this.T;
    if (!p || !Number.isFinite(p.x + p.z)) return 0;
    let made = 0;
    const want = Math.min(Math.max(0, n | 0), this.cap() - this.live);
    for (let k = 0; k < want; k++) {
      const c = this.list.find((x) => !x.alive);
      if (!c) break;
      let ok = false, x = 0, z = 0;
      for (let tries = 0; tries < 14 && !ok; tries++) {
        const a = this._g() * Math.PI * 2, r = T.ring[0] + (T.ring[1] - T.ring[0]) * this._g();
        x = p.x + Math.sin(a) * r;
        z = p.z + Math.cos(a) * r;
        if (!d.standable(x, z)) continue;
        if (Math.hypot(x - d.position.x, z - d.position.z) < T.apart) continue;
        ok = true;
        for (const o of this.list) if (o.alive && Math.hypot(o.x - x, o.z - z) < T.apart) ok = false;
      }
      if (!ok) continue;
      this._wake(c, x, z, Math.atan2(p.x - x, p.z - z));
      made++;
      d.fx.cloneSpawn?.(x, z);
      this._emit('spawn', x, z, why);
    }
    return made;
  }

  _wake(c, x, z, yaw) {
    c.alive = true;
    c.state = IN;
    c.t = 0;
    c.x = x;
    c.z = z;
    c.yaw = yaw;
    c.round = false;
    c.handle = null;
    c.fade = 1;
    c.root.position.set(x, 0, z);
    c.root.visible = true;
    c.pilot.yaw = yaw;
    c.root.rotation.y = yaw;
    c.anim.reset();
    c.anim.play('loco', 0.01);
    c.anim.teleported?.();
  }

  _emit(kind, x, z, by) {
    const e = this._ev;
    e.kind = kind;
    e.x = x;
    e.z = z;
    e.by = by;
    this.d.emit('dragon:clone', e);
  }

  // ---------------------------------------------------------------- popping
  /** Pop self i (and every other self within `cleave` of the hit point x, z). `by`: what popped it. Returns how many. */
  popAt(i, x, y, z, heavy = false, by = 'cut') {
    const c = this.list[i];
    if (!c?.alive) return 0;
    let n = this._pop(c, by);
    const r = heavy ? this.T.cleaveHeavy : this.T.cleave;
    if (Number.isFinite(x + z)) for (const o of this.list) if (o.alive && Math.hypot(o.x - x, o.z - z) <= r) n += this._pop(o, by);
    return n;
  }

  /** Every self within r of (x, z) pops (his own blast tears them). */
  popWithin(x, z, r, by = 'blast') {
    let n = 0;
    for (const c of this.list) if (c.alive && Math.hypot(c.x - x, c.z - z) <= r) n += this._pop(c, by);
    return n;
  }

  popAll(by = 'all') {
    let n = 0;
    for (const c of this.list) if (c.alive) n += this._pop(c, by);
    return n;
  }

  /** Phase 3's change: the selves burn up and stream into him (no pops: they go into the mantle). */
  burnAll() {
    const d = this.d, c1 = d._hs[1];
    for (const c of this.list) {
      if (!c.alive) continue;
      d.fx.cloneBurn?.(c.x, 1.1, c.z, c1.x, c1.y, c1.z, 1);
      this._emit('pop', c.x, c.z, 'mantle');
      this._hide(c);
    }
  }

  _pop(c, by) {
    if (!c.alive) return 0;
    const d = this.d;
    const h = c.hs[0];
    d.fx.clonePop?.(c.x, Number.isFinite(h.y) && h.y > 0 ? h.y : 1.1, c.z, by);
    this._emit('pop', c.x, c.z, by);
    // the cut it was making is gone: the ledger forgets it; the token frees up
    if (c.state === WIND || c.state === STRIKE) this.tokenAt = Math.min(this.tokenAt, this.clock + 0.3);
    this._hide(c);
    return 1;
  }

  // ---------------------------------------------------------------- the real one trades places
  /** The live self nearest (x, z), or -1. */
  nearest(x, z) {
    let best = -1, bd = Infinity;
    for (const c of this.list) {
      if (!c.alive) continue;
      const dd = Math.hypot(c.x - x, c.z - z);
      if (dd < bd) {
        bd = dd;
        best = c.i;
      }
    }
    return best;
  }

  /** He and self i trade places (Changing Places, Hand to Hand): he stands where it stood, facing the
   *  hero; it stands where he stood (a puff of paper on both). True if done. */
  swapWith(i) {
    const c = this.list[i], d = this.d;
    if (!c?.alive) return false;
    const x0 = d.position.x, z0 = d.position.z;
    d.position.x = c.x;
    d.position.z = c.z;
    d.position.y = 0;
    d.moveBy(0, 0);
    const p = this.game.player?.position;
    if (p) d.yaw = Math.atan2(p.x - d.position.x, p.z - d.position.z);
    d.object3d.rotation.y = d.yaw;
    d.anim.teleported?.();
    // the self he left: where he stood, its windup (if any) gone
    c.handle?.cancel?.();
    c.handle = null;
    if (c.state === WIND || c.state === STRIKE) this.tokenAt = Math.min(this.tokenAt, this.clock + 0.3);
    c.state = RECOVER;
    c.t = 0;
    c.round = false;
    c.x = x0;
    c.z = z0;
    c.root.position.set(x0, 0, z0);
    c.anim.teleported?.();
    d.fx.flit?.(x0, z0, d.position.x, d.position.z);
    return true;
  }

  // ---------------------------------------------------------------- the Thousand-Body Round
  /**
   * The Round: every live self cuts in turn, `T.round` s apart, the last one `T.round` s before his own
   * blow lands (`hisImpactIn` s from now). Filled from the last slot back, so there is never a gap
   * before his blow. Each cut is told to the ledger as its windup starts, and a guard meets it from
   * any side (`around`).
   */
  round(hisImpactIn) {
    const live = this.list.filter((c) => c.alive);
    const gap = this.T.round, n = live.length;
    // the order: round the hero, so the cuts come from one side after another
    const p = this.game.player?.position;
    if (p) live.sort((a, b) => Math.atan2(a.x - p.x, a.z - p.z) - Math.atan2(b.x - p.x, b.z - p.z));
    for (let k = 0; k < n; k++) {
      const c = live[k];
      const at = hisImpactIn - gap * (n - k);
      c.handle?.cancel?.();
      c.handle = null;
      c.round = true;
      c.roundAt = this.clock + Math.max(this.T.windup, at); // its impact on the clones' clock
      c.state = STALK;
      c.t = 0;
    }
    return n;
  }

  // ---------------------------------------------------------------- the frame
  frame(dt) {
    const d = this.d;
    this.clock += dt;
    if (!this.list.some((c) => c.alive)) return;
    const pl = this.game.player, p = pl?.position;
    // he is gone: so are they
    if (d.mode === 'dying' || d.mode === 'dead') {
      this.popAll('death');
      return;
    }
    if (!p) return;
    const T = this.T;
    const pearlFlying = !!d.pearl?.flying;
    const free = d.mode === 'foot' || (d.mode === 'act' && !!d.brain.act?.def?.clonesFight);
    for (const c of this.list) {
      if (!c.alive) continue;
      c.t += dt;
      if (c.fade > 0) c.fade = Math.max(0, c.fade - dt / Math.max(0.05, T.in));
      const dx = p.x - c.x, dz = p.z - c.z, dist = Math.hypot(dx, dz) || 1e-3;
      switch (c.state) {
        case IN:
          c.yaw = turnToward(c.yaw, Math.atan2(dx, dz), 10 * dt);
          this._walk(c, 0, dt);
          if (c.t >= T.in) {
            c.state = STALK;
            c.t = 0;
          }
          break;
        case STALK: {
          c.yaw = turnToward(c.yaw, Math.atan2(dx, dz), 9 * dt);
          if (c.round) {
            // the Round: in close at a run, then its cut at its slot
            const lead = c.roundAt - this.clock;
            this._approach(c, dx, dz, dist, 1.7, lead < T.windup + 0.6 ? 7 : 4, dt);
            if (lead <= T.windup + 1e-4) this._startCut(c, Math.max(0.05, lead), true);
            break;
          }
          this._approach(c, dx, dz, dist, T.slot, T.walk, dt);
          // the token: one self cuts at a time
          if (free && !pearlFlying && dist <= T.reach && this.clock >= this.tokenAt && !this.busy && pl.alive !== false) {
            const dl = d.brain.fairDelay?.(T.windup, TELL.NORMAL, 0.4, 'paperCut') ?? 0;
            if (dl >= 0) {
              if (dl > 0 && d.brain.stats) d.brain.stats.delays++;
              this._startCut(c, T.windup + dl, false);
            } else this.tokenAt = this.clock + 0.25; // not now: ask again in a moment
          }
          break;
        }
        case WIND:
          this._wind(c, dx, dz, dist, dt);
          break;
        case STRIKE:
          if (this.clock >= c.end) {
            c.state = RECOVER;
            c.t = 0;
          }
          break;
        case RECOVER:
          this._walk(c, 0, dt);
          if (c.t >= T.recover) {
            c.state = STALK;
            c.t = 0;
          }
          break;
        default:
          break;
      }
    }
    this._separate(dt);
  }

  /** Walk toward a spot `stand` m from the hero (along the line it is on), at most `speed` m/s. */
  _approach(c, dx, dz, dist, stand, speed, dt) {
    const gap = dist - stand;
    if (Math.abs(gap) < 0.08) {
      this._walk(c, 0, dt);
      return;
    }
    const s = clamp(gap, -speed * dt, speed * dt);
    this._step(c, (dx / dist) * s, (dz / dist) * s, dt);
  }

  _walk(c, s, dt) {
    c.pilot.groundVel.x = 0;
    c.pilot.groundVel.z = 0;
  }

  _step(c, mx, mz, dt) {
    const x0 = c.x, z0 = c.z;
    c.x += mx;
    c.z += mz;
    // (inside his bound, out of the world's stones: d.standable's resolve)
    const B = this.d.bound + 1.2, r = Math.hypot(c.x, c.z);
    if (r > B) {
      c.x *= B / r;
      c.z *= B / r;
    }
    const o = this._from;
    o.x = c.x;
    o.z = c.z;
    this.game.world?.resolve?.(o, 0.35, Infinity);
    if (Number.isFinite(o.x + o.z)) {
      c.x = o.x;
      c.z = o.z;
    }
    c.pilot.groundVel.x = (c.x - x0) / Math.max(dt, 1e-4);
    c.pilot.groundVel.z = (c.z - z0) / Math.max(dt, 1e-4);
  }

  /** The selves keep apart (and off the real one) as they stalk. */
  _separate(dt) {
    const L = this.list, d = this.d;
    for (const a of L) {
      if (!a.alive || a.state === WIND || a.state === STRIKE) continue;
      let px = 0, pz = 0;
      for (const b of L) {
        if (b === a || !b.alive) continue;
        const dx = a.x - b.x, dz = a.z - b.z, dd = Math.hypot(dx, dz);
        if (dd > 1e-3 && dd < SEP) {
          px += (dx / dd) * (SEP - dd);
          pz += (dz / dd) * (SEP - dd);
        }
      }
      const dx = a.x - d.position.x, dz = a.z - d.position.z, dd = Math.hypot(dx, dz);
      if (dd > 1e-3 && dd < SEP) {
        px += (dx / dd) * (SEP - dd);
        pz += (dz / dd) * (SEP - dd);
      }
      if (px || pz) {
        const k = Math.min(1, dt * 3);
        a.x += px * k;
        a.z += pz * k;
      }
    }
  }

  /** A self's windup begins (`W` s to its impact): told to the ledger, announced. */
  _startCut(c, W, round) {
    const d = this.d;
    c.state = WIND;
    c.t = 0;
    c.W = W;
    c.impact = this.clock + W;
    c.end = c.impact + (this._cut?.beats?.[0]?.A ?? 0.08);
    c.flashed = false;
    c.struck = false;
    c.closed = 0;
    c.handle?.cancel?.();
    c.handle = d.brain.expect?.(W, TELL.NORMAL, 'paperCut') ?? null;
    if (!round) this.tokenAt = c.impact + perPhase(this.T.every, d.phase);
    const tl = this._tell;
    tl.impactIn = W;
    tl.x = c.x;
    tl.z = c.z;
    d.emit('combat:tell', tl);
    c.anim.play('duel', 0.1, true);
  }

  /** Through its windup: it turns to the hero, steps in if he backed off, glints, then cuts. */
  _wind(c, dx, dz, dist, dt) {
    const d = this.d, T = this.T, left = c.impact - this.clock;
    const u = 1 - left / Math.max(0.05, c.W);
    if (u < 0.75) c.yaw = turnToward(c.yaw, Math.atan2(dx, dz), 14 * dt);
    // the step-in (as his `close`): it arrives where its cut reaches
    const want = dist - 1.5;
    if (want > 0.02 && c.closed < 1.6 && left > 0) {
      const s = Math.min(want, Math.min(want / Math.max(left, dt), 9) * dt, 1.6 - c.closed);
      c.closed += s;
      this._step(c, (dx / dist) * s, (dz / dist) * s, dt);
    } else this._walk(c, 0, dt);
    const lead = perPhase(d.T.flashLead, d.phase);
    if (!c.flashed && left <= lead) {
      c.flashed = true;
      const tip = this._tipOf(c);
      const f = this._flash;
      f.x = tip.x;
      f.y = tip.y;
      f.z = tip.z;
      d.emit('combat:flash', f);
      d.fx.tellFlash(TELL.NORMAL, tip.x, tip.y, tip.z, 1, false);
    }
    if (left > 0) return;
    // the impact: one result (the hero inside its reach), then its follow-through
    c.state = STRIKE;
    c.handle = null; // (the ledger's entry expires by itself after the impact)
    const pl = this.game.player;
    if (!pl || pl.alive === false) return;
    const pr = pl.radius ?? 0.45, reach = 2.1 + pr;
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - c.yaw));
    if (dist > reach || (dist > pr + 0.3 && ang > 0.9 + Math.asin(Math.min(1, pr / Math.max(dist, 1e-3))))) return;
    const from = this._from;
    from.x = c.x;
    from.z = c.z;
    const r = d.hitPlayer({
      damage: T.damage, knockback: T.knockback, tell: TELL.NORMAL, attack: 'paperCut', from, projectile: true, parryPosture: T.parryPosture,
      extra: c.round ? this._extra : null,
    });
    // a parry spends it: it pops (hitPlayer nicked his posture: no recoil of the real one)
    if (r === RESULT.PARRIED) this._pop(c, 'parry');
  }

  /** Where self c's blade tip is drawn (its rig's sword joint). */
  _tipOf(c) {
    const v = this._v, K = this.d.kit.blade;
    const s = c.rig.sword;
    if (s?.matrixWorld) v.set(0, 0, K.tip).applyMatrix4(s.matrixWorld);
    if (!Number.isFinite(v.x + v.y + v.z)) v.set(c.x, 1.3, c.z);
    return v;
  }

  /** Self i's free hand (the Pearl's thread starts there), into `out`. */
  handPoint(i, out) {
    const c = this.list[i];
    if (!c?.alive) return null;
    const w = c.rig.arms?.L?.wrist;
    if (w?.getWorldPosition) w.getWorldPosition(out);
    else out.set(c.x, 1.2, c.z);
    if (!Number.isFinite(out.x + out.y + out.z)) out.set(c.x, 1.2, c.z);
    return out;
  }

  /** Self i's root (drawnPoint scales and leans a sphere about it), or null. */
  rootOf(i) {
    const c = this.list[i];
    return c?.alive ? c : null;
  }

  // ---------------------------------------------------------------- the pose (after his)
  /**
   * Pose every live self (its clip: walking, or its cut at its time), then push its two hurt spheres
   * (upright gameplay points, as his own) into d.hurtSpheres. Called from his afterPose: his own
   * spheres are already there.
   */
  pose(dt) {
    const d = this.d, H = d.hurtSpheres, L = d.lean, cam = this.game.camera?.position;
    for (const c of this.list) {
      if (!c.alive) continue;
      const pl = c.pilot, root = c.root;
      root.position.set(c.x, 0, c.z);
      c.yaw = wrapAngle(fin(c.yaw));
      pl.yaw = c.yaw;
      root.rotation.y = c.yaw;
      if (c.state === WIND || c.state === STRIKE) {
        // its cut's clip, on its own clock: a windup the fairness guard lengthened (or a Round cut's
        // shorter one) holds at the cock (or skips into it), as his own held blows do
        const B = this._cut?.beats?.[0];
        const impT = B ? B.impact : 0.62, cockT = impT * 0.7;
        const elapsed = c.W - Math.max(0, c.impact - this.clock), h = c.W - impT;
        let ct = elapsed - h; // (past the cock: the clip runs to its impact as authored)
        if (h > 0 && elapsed < cockT) ct = elapsed;
        else if (h > 0 && elapsed < cockT + h) ct = cockT;
        pl.atk.def = this._clip;
        pl.stateT = pl.animT = Math.max(0, ct);
      } else if (c.state === RECOVER && c.t < (this._cut ? this._cut.end - this._cut.beats[0].impact : 0.6)) {
        const B = this._cut?.beats?.[0];
        pl.atk.def = this._clip;
        pl.stateT = pl.animT = (B ? B.impact : 0.62) + 0.08 + c.t;
      } else {
        if (pl.atk.def) {
          pl.atk.def = null;
          c.anim.play('loco', 0.18);
        }
      }
      // the lean: his own (the camera's)
      c.lean.k = L.k;
      c.lean.dx = L.dx;
      c.lean.dz = L.dz;
      c.lean.on = false;
      c.anim.update(dt);
      // two hurt spheres from the upright body
      const r = c.rig, v = this._v;
      r.chest.getWorldPosition(v);
      const a = c.hs[0], b = c.hs[1];
      a.x = v.x;
      a.y = v.y + 0.05;
      a.z = v.z;
      r.pelvis.getWorldPosition(v);
      b.x = v.x;
      b.y = v.y;
      b.z = v.z;
      c.lean.on = true;
      root.updateMatrixWorld(true);
      if (Number.isFinite(a.x + a.y + a.z)) H.push(a);
      if (Number.isFinite(b.x + b.y + b.z)) H.push(b);
      // its materials: the glyph scale at its distance, tearing in (dissolve), no warn glow
      if (cam) setHeroGlyphScale(c.mats, Math.hypot(cam.x - c.x, cam.y - 1.1, cam.z - c.z));
      for (const m of c.mats) {
        const u = m.uniforms;
        if (!u) continue;
        if (u.uDissolve) u.uDissolve.value = c.fade * 0.85;
        if (u.uFlash) u.uFlash.value = 0;
        if (u.uWarn) u.uWarn.value.w = 0;
      }
    }
  }

  /** The selves' cut, realised once (its windup is fixed: the clip is the same every time). */
  setCut(act) {
    this._cut = act;
    this._clip = act?.clip ?? null;
  }
}
