import { wrapAngle, turnToward } from '../../../core/math.js';
import { TELL, RESULT, dodgeOnly } from '../../../combat/rules.js';
import { buildHero, setHeroGlyphScale, installLean } from '../../player/model.js';
import { HeroAnimator } from '../../player/anim.js';
import { batchRigid } from '../../../render/rigidBatch.js';
import { perPhase } from '../duelist/realise.js';

// The paper selves (ADR-147, reworked by ADR-154): Wen Yao's own extra bodies, as the Starless Lord's
// spells are his own things (starlessLord/spells.js). The game still has ONE boss: this is a fixed pool
// owned by the fox (`d.clones`), stepped from his brainFrame and posed from his afterPose.
//
// A SELF EXISTS ONLY INSIDE AN ATTACK (the owner, 2026-11-22: "the clones just randomly appearing as
// sponges is boring. i want them to like appear from the air and all attack at the same time or in a
// fast sequence"). There is no self walking about waiting for a turn. A PACK (a move's beat carries
// `pack`, moves.js header) books every body at once: where it strikes from, when it appears (its blow's
// impact minus the blow's windup) and when it strikes. A body appears in the air in a puff of paper,
// already in its attack pose, falls or flies to its mark through its windup, strikes, and bursts
// `linger` s after its blow. It can be popped at any moment it is out (one hit; a parry pops it; a heavy
// cut cleaves the ones beside it): its blow never lands.
//   sequence   n blows `gap` s apart, each from another side, each its own cue and its own result.
//   together   ONE cue and ONE result: one ledger entry, one tell, one glint over the hero, one blow when
//              they all arrive. A parry bursts every body (his posture takes popPosture x n); a held guard
//              pays one blow; a roll out of the ring (`together.r` round where the hero stood as they
//              locked on) clears it.
// Every cue is told to the cue ledger as the pack is called (brain.expect: the director and the
// fairness guard see it before it comes), shifted later as a whole by the fairness guard if it must
// be (brain.fairDelay; no wait clears it: the pack is not called), and cued as his blows are
// (combat:tell as a body appears, combat:flash + the white glint flashLead before its blow). A blow
// goes through d.hitPlayer as a thrown thing (`projectile`, a guard meets it from any side: `around`).
//
// The selves also HELP him, outside packs: the one at his side shaping the Pearl (assist), the two
// lifting the Moon-Swallowing Pearl (lift), the twin who drives a second Pearl from the hero's other
// side (twin), the one he trades places with (swapIn), and the bodies of the Burial he springs off
// (the pile). Each appears in a puff and bursts when its part is done.
//
// Never the real one: the lock-on, the name tag, the boss bar and the minimap follow only him; only he
// casts a shadow; a self never blocks the hero's way (no body circle).
//
// Surface (fox.js): new FoxClones(d) (inside his constructor: every rig is built there, so a seeded
// fight never shifts), reset(), frame(dt), pose(dt) (after his pose: their poses, their hurt spheres
// pushed into d.hurtSpheres), pack(spec, o) → pack | null, packLive (a pack is out), popAt(i, x, y, z,
// heavy, by) → popped, popWithin(x, z, r, by), popAll(by), burnAll(), live, alive(i), nearest(x, z),
// swapIn() (a self dropped beside the hero, he trades places with it), assist(), lift(), twin(o),
// pile() → { x, z } | null (the Burial's pile), fed (bodies that burst into the Pearl), handPoint(i, out),
// rootOf(i), setBlows(acts) (the hidden self-moves, realised once), seat / tearSeated (the intro).

// (destructured: a capital const set to a string reads as a glyph to tests/glyphcheck.mjs)
const [DEAD, SEATED, PACK, ASSIST, LIFT, TWIN, LEFT] = ['dead', 'seated', 'pack', 'assist', 'lifting', 'twin', 'swapped'];
const PARTS = ['clone0', 'clone1', 'clone2', 'clone3', 'clone4', 'clone5', 'clone6', 'clone7'];
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const ease = (u) => u * u * (3 - 2 * u);
const TAU = Math.PI * 2;
const PACKS = 3; // packs out at once at most

export class FoxClones {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T.clones;
    const n = Math.max(1, this.T.pool | 0);
    /** the pool: one record per rig, built now and never again */
    this.list = [];
    for (let i = 0; i < n; i++) this.list.push(this._make(i));
    /** the packs out (fixed records) */
    this.packs = Array.from({ length: PACKS }, (_, i) => ({ i, on: false, bodies: [] }));
    // the gameplay stream (its own: no look can move it)
    this._gs = 0x1f83d9ab;
    this.clock = 0;
    this._flash = { source: 'dragon', attack: 'pack', tell: TELL.NORMAL, x: 0, y: 0, z: 0, perilous: false, flare: false };
    this._tell = { source: 'dragon', attack: 'pack', tell: TELL.NORMAL, impactIn: 0.5, x: 0, z: 0, flare: false };
    this._ev = { kind: 'spawn', x: 0, z: 0, by: '' };
    this._from = { x: 0, z: 0 };
    this._extra = { around: true };
    this._v = d._v.clone();
    this._frameN = 0;
    /** the hidden self-moves, realised once: { dive, cross, upkick, slam } → { act, clip, B } */
    this.blows = {};
    this.stats = { packs: 0, bodies: 0, struck: 0, parried: 0, popped: 0, refused: 0 };
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
      alive: false, state: DEAD, t: 0, x: 0, y: 0, z: 0, yaw: 0, handle: null, pack: null, k: 0, blow: 'cross',
      W: 0, at: 0, impact: 0, until: 0, flashed: false, struck: false, fade: 0, ax: 0, ay: 0, az: 0, ang: 0, r: 1.5,
      mx: 0, mz: 0, sx: undefined, sz: 0, acc: 0,
    };
  }

  /** The gameplay stream 0..1 (sides, rolls; never Math.random, never the looks'). */
  _g() {
    this._gs = (Math.imul(this._gs, 1664525) + 1013904223) >>> 0;
    return this._gs / 4294967296;
  }

  reset() {
    for (const c of this.list) this._hide(c);
    for (const P of this.packs) this._endPack(P);
    this.clock = 0;
    this.fed = 0;
    this._gs = 0x1f83d9ab;
    this._pileAt = null;
  }

  /** The hidden self-moves (fox.js, once): { dive, cross, upkick, slam } → realised acts. */
  setBlows(acts) {
    for (const k in acts) {
      const a = acts[k];
      if (!a) continue;
      this.blows[k] = { act: a, clip: a.clip ?? null, B: a.beats?.[0] ?? null };
    }
  }

  // ---------------------------------------------------------------- the seated intro
  /**
   * Asleep he sits among `n` of his selves, seated round him `r` m off (not alive: no spheres, no blow;
   * only a look). As he wakes they tear into paper one by one (tearSeated, from his brainFrame); a
   * fight started without the intro (the Lab) tears the rest at once.
   */
  seat(n = 4, r = 1.7) {
    const d = this.d;
    for (let k = 0; k < Math.min(n, this.list.length); k++) {
      const c = this.list[k];
      const a = d.yaw + Math.PI * (0.25 + (k / Math.max(1, n - 1)) * 1.5);
      const x = d.position.x + Math.sin(a) * r, z = d.position.z + Math.cos(a) * r;
      this._show(c, x, 0, z, Math.atan2(d.position.x - x, d.position.z - z) + Math.PI);
      c.alive = false;
      c.state = SEATED;
      c.fade = 0;
      c.tearAt = 0.35 + k * 0.42;
    }
  }

  /** Tear the seated selves whose time has come (`t` s into his intro; Infinity: all now). */
  tearSeated(t) {
    for (const c of this.list) {
      if (c.state !== SEATED || t < c.tearAt) continue;
      this.d.fx.clonePop?.(c.x, 0.7, c.z, 'intro');
      this._emit('pop', c.x, c.z, 'intro');
      this._hide(c);
    }
  }

  get seated() {
    return this.list.some((c) => c.state === SEATED);
  }

  _hide(c) {
    c.alive = false;
    c.state = DEAD;
    c.handle?.cancel?.();
    c.handle = null;
    c.pack = null;
    c.root.visible = false;
    c.y = 0;
  }

  /** A rig shown at (x, y, z) facing `yaw` (its animator reset). */
  _show(c, x, y, z, yaw) {
    c.alive = true;
    c.t = 0;
    c.x = x;
    c.y = y;
    c.z = z;
    c.yaw = yaw;
    c.fade = 0;
    c.acc = 0;
    c.sx = undefined;
    c.root.position.set(x, y, z);
    c.root.visible = true;
    c.pilot.yaw = yaw;
    c.root.rotation.y = yaw;
    c.anim.reset();
    c.anim.play('loco', 0.01);
    c.anim.teleported?.();
  }

  get live() {
    let n = 0;
    for (const c of this.list) if (c.alive) n++;
    return n;
  }

  alive(i) {
    return !!this.list[i]?.alive;
  }

  /** The selves feeding the Pearl now: the one shaping it with him, and every pack body that struck
   *  and burst into it (pearl.js: its burst and the drive's blow grow with them). */
  get feeding() {
    let n = this.fed;
    for (const c of this.list) if (c.alive && c.state === ASSIST) n++;
    return n;
  }

  /** A pack is out (booked, or its bodies still in the air). */
  get packLive() {
    return this.packs.some((P) => P.on);
  }

  /** The rigs not in use. */
  get free() {
    let n = 0;
    for (const c of this.list) if (c.state === DEAD) n++;
    return n;
  }

  _take() {
    return this.list.find((c) => c.state === DEAD) ?? null;
  }

  _emit(kind, x, z, by) {
    const e = this._ev;
    e.kind = kind;
    e.x = x;
    e.z = z;
    e.by = by;
    this.d.emit('dragon:clone', e);
  }

  // ---------------------------------------------------------------- the packs
  /**
   * Book a pack now (moves.js header: `pack`). `spec`: { n, mode, gap, form, blow, tell, from, flare,
   * r, linger, feed }; `o`: { attack, phase, cap (n at most), shift (s the whole pack may wait at most) }.
   * Every body's mark, its appearing time and its impact are set here and every cue is told to the
   * ledger. Returns the pack record, or null (no rig, no hero, or the fairness guard found no slot).
   */
  pack(spec, o = {}) {
    const d = this.d, T = this.T, p = this.game.player?.position;
    if (!spec || !p || !Number.isFinite(p.x + p.z) || d.mode === 'dying' || d.mode === 'dead' || d.mode === 'sleep') return null;
    const P = this.packs.find((x) => !x.on);
    if (!P) return null;
    const phase = o.phase ?? d.phase;
    let n = Math.max(0, Math.round(perPhase(spec.n, phase) ?? 0));
    if (o.cap != null) n = Math.min(n, o.cap);
    n = Math.min(n, this.free);
    if (n <= 0) return null;
    const together = spec.mode === 'together';
    const blow = this.blows[spec.blow] ?? this.blows.cross;
    const W = blow?.act ? Math.max(0.42, T.blows[spec.blow] ?? 0.56) : 0.56;
    const gap = together ? 0 : Math.max(d.T.minHitGap ?? 0.32, spec.gap ?? 0.34);
    const tell = spec.tell ?? TELL.NORMAL;
    const from0 = Math.max(W + 0.05, spec.from ?? W + 0.3);
    // the fairness guard: the whole pack later by as little as clears every cue (or not at all)
    const B = d.brain, maxShift = o.shift ?? d.T.pressure?.guard?.maxDelay ?? 0.6;
    let shift = 0;
    if (B?.fairDelay) {
      for (let k = 0, m = together ? 1 : n; k < m; k++) {
        const dl = B.fairDelay(from0 + gap * k + shift, tell, Math.max(0, maxShift - shift), o.attack ?? 'pack');
        if (dl < 0) {
          this.stats.refused++;
          return null;
        }
        if (dl > 0) {
          shift += dl;
          if (B.stats) B.stats.delays++;
        }
      }
    }
    const from = from0 + shift;
    P.on = true;
    P.spec = spec;
    P.mode = together ? 'together' : 'sequence';
    P.attack = o.attack ?? 'pack';
    P.tell = tell;
    P.flare = !!spec.flare;
    P.n = n;
    P.left = n; // bodies not yet burst or popped
    P.form = spec.form ?? 'ring';
    P.blow = spec.blow ?? 'cross';
    P.W = W;
    P.r = spec.r ?? T.together.r;
    P.linger = spec.linger ?? T.linger;
    P.feed = !!spec.feed;
    P.impact = this.clock + from; // the first (together: the one) impact on this clock
    P.gap = gap;
    P.cx = p.x;
    P.cz = p.z;
    P.locked = false;
    P.flashed = false;
    P.told = false;
    P.hit = false;
    P.result = null;
    P.parried = 0;
    P.act = o.act ?? null;
    P.bodies.length = 0;
    P.handle?.cancel?.();
    P.handle = together ? B?.expect?.(from, tell, P.attack) ?? null : null;
    // the sides they come from: round the hero, starting from a side away from him (the real one)
    const toHim = Math.atan2(d.position.x - p.x, d.position.z - p.z);
    const a0 = toHim + Math.PI * (0.35 + 0.3 * this._g()) * (this._g() < 0.5 ? 1 : -1);
    const turn = this._g() < 0.5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const c = this._take();
      if (!c) break;
      let ang, r;
      switch (P.form) {
        case 'sides': // left and right of the hero as he faces the real one
          ang = toHim + (k % 2 ? -1 : 1) * Math.PI * 0.5 + (k >> 1) * 0.5;
          r = T.ring;
          break;
        case 'fan': // across his front, between him and the real one
          ang = toHim + (n > 1 ? (k / (n - 1) - 0.5) * 2.2 : 0);
          r = T.ring;
          break;
        case 'above': // close in from overhead
          ang = a0 + turn * (k / n) * TAU;
          r = T.ring * 0.7;
          break;
        case 'low': // sliding in along the floor
          ang = a0 + turn * (k / n) * TAU;
          r = T.ring;
          break;
        default: // 'ring': round him, one side after another
          ang = a0 + turn * (k / n) * TAU;
          r = T.ring;
      }
      c.state = PACK;
      c.alive = false; // (it appears at c.at)
      c.pack = P;
      c.k = k;
      c.blow = P.blow;
      c.W = W;
      c.impact = P.impact + gap * k;
      c.at = c.impact - W;
      c.until = c.impact + P.linger;
      c.ang = ang;
      c.r = r;
      c.flashed = false;
      c.struck = false;
      c.handle?.cancel?.();
      c.handle = together ? null : B?.expect?.(c.impact - this.clock, tell, P.attack) ?? null;
      P.bodies.push(c);
    }
    this.stats.packs++;
    this.stats.bodies += P.bodies.length;
    // the full deflect (duelist.js onParried): a long pack inside a move counts its blows as the move's
    const F = d.T.fullDeflect;
    if (P.act && !together && P.bodies.length >= (F?.minHits ?? 5) - 1) P.act.hits = (P.act.hits ?? 0) + P.bodies.length;
    return P;
  }

  _endPack(P) {
    if (!P) return;
    P.on = false;
    P.handle?.cancel?.();
    P.handle = null;
    P.bodies.length = 0;
  }

  /** Where a pack body's mark is now (round the hero, or round the locked centre of a `together`). */
  _mark(c, P, p) {
    if (!P.locked) {
      P.cx = p.x;
      P.cz = p.z;
    }
    c.mx = P.cx + Math.sin(c.ang) * c.r;
    c.mz = P.cz + Math.cos(c.ang) * c.r;
  }

  /** A pack body appears (its puff in the air), already in its attack pose. */
  _appear(c, P, p) {
    const T = this.T;
    this._mark(c, P, p);
    let x, y, z;
    if (c.blow === 'dive') {
      // high over its mark, a little further out
      x = P.cx + Math.sin(c.ang) * (c.r + 0.8);
      z = P.cz + Math.cos(c.ang) * (c.r + 0.8);
      y = T.drop.h;
    } else {
      const R = c.blow === 'upkick' ? T.appearR + 0.8 : T.appearR;
      x = P.cx + Math.sin(c.ang) * R;
      z = P.cz + Math.cos(c.ang) * R;
      y = c.blow === 'upkick' ? 0.15 : T.hop * 0.8;
    }
    c.ax = x;
    c.ay = y;
    c.az = z;
    this._show(c, x, y, z, Math.atan2(p.x - x, p.z - z));
    c.state = PACK;
    c.pack = P;
    c.fade = 1;
    c.anim.play('duel', 0.01, true);
    this.d.fx.packPuff?.(x, y + 1.0, z);
    this._emit('spawn', x, z, P.attack);
    // its cue: a sequence body's own; a together pack's one, as its first body shows
    if (P.mode === 'sequence' || !P.told) {
      P.told = true;
      const tl = this._tell;
      tl.attack = P.attack;
      tl.tell = P.tell;
      tl.flare = P.flare;
      tl.impactIn = Math.max(0.05, c.impact - this.clock);
      tl.x = x;
      tl.z = z;
      this.d.emit('combat:tell', tl);
    }
  }

  /** A pack body through its windup: to its mark (falling, leaping or sliding), its glint, its blow. */
  _packFrame(c, P, p, dt) {
    const T = this.T, d = this.d;
    if (!c.alive) {
      if (this.clock >= c.at) this._appear(c, P, p);
      else return;
    }
    const left = c.impact - this.clock;
    if (left > 0) {
      const u = Math.min(1, Math.max(0, 1 - left / Math.max(0.05, c.W)));
      if (u >= T.lock && !P.locked && P.mode === 'together') P.locked = true;
      if (u < T.lock) this._mark(c, P, p);
      const e = ease(Math.min(1, u / Math.max(0.3, T.lock + 0.1)));
      c.x = c.ax + (c.mx - c.ax) * e;
      c.z = c.az + (c.mz - c.az) * e;
      if (c.blow === 'dive') c.y = c.ay * (1 - u) * (1 - u);
      else if (c.blow === 'upkick') c.y = 0;
      else c.y = Math.max(0, c.ay * (1 - u) + T.hop * 4 * u * (1 - u) * 0.5);
      const tx = P.mode === 'together' ? P.cx : p.x, tz = P.mode === 'together' ? P.cz : p.z;
      c.yaw = turnToward(c.yaw, Math.atan2(tx - c.x, tz - c.z), 14 * dt);
      // the glint: each body's own (sequence), or one over the hero (together)
      const lead = perPhase(d.T.flashLead, d.phase);
      if (left <= lead && !c.flashed) {
        c.flashed = true;
        if (P.mode === 'sequence') this._glint(P, this._tipOf(c));
        else if (!P.flashed) {
          P.flashed = true;
          const v = this._v.set(P.cx, 1.6, P.cz);
          this._glint(P, v);
        }
      }
      return;
    }
    if (!c.struck) {
      c.struck = true;
      c.y = 0;
      if (P.mode === 'sequence') this._strikeOne(c, P, p);
      else if (!P.hit) this._strikeTogether(P, p);
      if (!c.alive) return;
    }
    if (this.clock >= c.until) this._burst(c, P);
  }

  _glint(P, v) {
    const f = this._flash, d = this.d;
    f.attack = P.attack;
    f.tell = P.tell;
    f.flare = P.flare;
    f.perilous = dodgeOnly(P.tell);
    f.x = v.x;
    f.y = v.y;
    f.z = v.z;
    d.emit('combat:flash', f);
    d.fx.tellFlash(P.tell, v.x, v.y, v.z, 1, P.flare);
  }

  /** A sequence body's blow: one result if the hero is in its reach and in front of it. */
  _strikeOne(c, P, p) {
    const d = this.d, T = this.T, pl = this.game.player;
    c.handle = null; // (the ledger's entry expires by itself after the impact)
    if (!pl || pl.alive === false) return;
    const pr = pl.radius ?? 0.45, dx = p.x - c.x, dz = p.z - c.z, dist = Math.hypot(dx, dz);
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - c.yaw));
    if (dist > T.reach + pr || (dist > pr + 0.3 && ang > 1.0 + Math.asin(Math.min(1, pr / Math.max(dist, 1e-3))))) return;
    const from = this._from;
    from.x = c.x;
    from.z = c.z;
    this.stats.struck++;
    const r = d.hitPlayer({
      damage: T.damage, knockback: T.knockback, tell: P.tell, attack: P.attack, from, projectile: true, parryPosture: T.parryPosture,
      flare: P.flare, extra: this._extra,
    });
    if (r === RESULT.PARRIED) {
      this.stats.parried++;
      P.parried++;
      if (P.act && P.act === d.brain.act) P.act.parried = (P.act.parried ?? 0) + 1;
      this._pop(c, 'parry');
    }
  }

  /** A together pack lands: ONE result for all of them. */
  _strikeTogether(P, p) {
    const d = this.d, T = this.T, pl = this.game.player;
    P.hit = true;
    P.handle = null;
    if (!pl || pl.alive === false) return;
    let any = false;
    for (const c of P.bodies) if (c.alive) any = true;
    if (!any) return;
    const pr = pl.radius ?? 0.45;
    if (Math.hypot(p.x - P.cx, p.z - P.cz) > P.r + pr) return;
    const from = this._from;
    // (from the side the most bodies came: the knock-back pushes him out of the ring)
    let sx = 0, sz = 0;
    for (const c of P.bodies) if (c.alive) {
      sx += c.x - P.cx;
      sz += c.z - P.cz;
    }
    const sl = Math.hypot(sx, sz);
    from.x = P.cx + (sl > 1e-3 ? sx / sl : Math.sin(d.yaw)) * 1.2;
    from.z = P.cz + (sl > 1e-3 ? sz / sl : Math.cos(d.yaw)) * 1.2;
    this.stats.struck++;
    const TG = T.together;
    const r = d.hitPlayer({
      damage: P.spec.damage ?? TG.damage, knockback: TG.knockback, knockdown: dodgeOnly(P.tell), tell: P.tell, attack: P.attack, from, projectile: true,
      parryPosture: TG.parryPosture, flare: P.flare, extra: this._extra,
    });
    P.result = r;
    if (r === RESULT.PARRIED) {
      // one parry bursts them all; each popped self adds to his posture
      this.stats.parried++;
      let n = 0;
      for (const c of P.bodies) if (c.alive) n += this._pop(c, 'parry');
      d.addPosture(T.popPosture * n);
    }
  }

  /** A body done with its blow bursts (fed into the Pearl if its pack feeds it). */
  _burst(c, P) {
    const h = c.hs[0];
    if (P?.feed && this.d.pearl?.charging) {
      this.fed++;
      this.d.fx.cloneBurn?.(c.x, 1.1, c.z, ...this._palm(), 0.6);
    } else this.d.fx.clonePop?.(c.x, Number.isFinite(h.y) && h.y > 0 ? h.y : 1.1, c.z, 'burst');
    this._emit('pop', c.x, c.z, 'burst');
    this._leave(c, P);
  }

  _palm() {
    const v = this._v;
    this.d.palmPoint?.(v);
    return [v.x, v.y, v.z];
  }

  /** A body leaves its pack (burst or popped); the pack ends with its last body. */
  _leave(c, P) {
    this._hide(c);
    if (!P) return;
    P.left--;
    if (P.left <= 0) this._endPack(P);
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

  /** Every self pops, and every pack still to come is called off (a break, his death, a reset). */
  popAll(by = 'all') {
    let n = 0;
    for (const c of this.list) {
      if (c.alive) n += this._pop(c, by);
      else if (c.state === PACK) this._leave(c, c.pack);
    }
    return n;
  }

  /** Phase 3's change: the selves burn up and stream into him (no pops: they go into the mantle). */
  burnAll() {
    const d = this.d, c1 = d._hs[1];
    for (const c of this.list) {
      if (c.state === SEATED || c.state === DEAD) continue;
      if (c.alive) {
        d.fx.cloneBurn?.(c.x, 1.1, c.z, c1.x, c1.y, c1.z, 1);
        this._emit('pop', c.x, c.z, 'mantle');
      }
      this._leave(c, c.pack);
    }
  }

  _pop(c, by) {
    if (!c.alive) return 0;
    const d = this.d, P = c.pack;
    const h = c.hs[0];
    d.fx.clonePop?.(c.x, Number.isFinite(h.y) && h.y > 0 ? h.y : 1.1, c.z, by);
    this._emit('pop', c.x, c.z, by);
    this.stats.popped++;
    // its blow is gone: the ledger forgets it (a together pack's one blow goes when no body is left)
    c.handle?.cancel?.();
    c.handle = null;
    if (P?.mode === 'together' && !P.hit && !P.bodies.some((o) => o !== c && (o.alive || (o.state === PACK && !o.alive)))) {
      P.handle?.cancel?.();
      P.handle = null;
    }
    this._leave(c, P);
    return 1;
  }

  // ---------------------------------------------------------------- he trades places with a self
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

  /**
   * Changing Places, Hand to Hand: a self drops in beside the hero (a puff, `T.swapAt` m off, on a side
   * he may stand on) and he trades places with it at once: he stands where it landed, facing the hero;
   * it stands where he stood and bursts `swapLinger` s later. True if done.
   */
  swapIn() {
    const d = this.d, p = this.game.player?.position, c = this._take();
    if (!c || !p || !Number.isFinite(p.x + p.z)) return false;
    const a0 = Math.atan2(d.position.x - p.x, d.position.z - p.z), r = this.T.swapAt;
    let x = NaN, z = NaN;
    const turn = (this._g() < 0.5 ? 1 : -1) * (1.3 + 0.8 * this._g());
    for (const da of [turn, -turn, turn * 0.5, -turn * 0.5, Math.PI]) {
      const tx = p.x + Math.sin(a0 + da) * r, tz = p.z + Math.cos(a0 + da) * r;
      if (!d.standable(tx, tz)) continue;
      x = tx;
      z = tz;
      break;
    }
    if (!Number.isFinite(x + z)) return false;
    const x0 = d.position.x, z0 = d.position.z;
    d.fx.packPuff?.(x, 1.0, z);
    d.position.x = x;
    d.position.z = z;
    d.position.y = 0;
    d.moveBy(0, 0);
    d.yaw = Math.atan2(p.x - d.position.x, p.z - d.position.z);
    d.object3d.rotation.y = d.yaw;
    d.anim.teleported?.();
    // the self he left: where he stood, for a moment
    this._show(c, x0, 0, z0, Math.atan2(p.x - x0, p.z - z0));
    c.state = LEFT;
    c.until = this.clock + this.T.swapLinger;
    this._emit('spawn', x0, z0, 'swap');
    d.fx.flit?.(x0, z0, d.position.x, d.position.z);
    return true;
  }

  // ---------------------------------------------------------------- helping him
  /** The self at his side shaping the Pearl with him (the drive): it appears at his left, holds the
   *  Pearl with him, and bursts into it `helperLinger` s after the charge ends. Its index or -1. */
  assist() {
    const c = this._take(), d = this.d;
    if (!c) return -1;
    const { x, z } = this._side(d.T.pearl.assist, 0.2);
    this._show(c, x, 0, z, d.yaw);
    c.state = ASSIST;
    c.until = Infinity;
    c.fade = 1;
    d.fx.packPuff?.(x, 1.0, z);
    this._emit('spawn', x, z, 'assist');
    return c.i;
  }

  /** The two selves lifting the Moon-Swallowing Pearl with him: at his sides, arms up, until `until`
   *  (s from now) then they burst. Returns how many came. */
  lift(until = 1.5) {
    const d = this.d;
    let n = 0;
    for (const s of [1, -1]) {
      const c = this._take();
      if (!c) break;
      const { x, z } = this._side(0.95 * s, -0.15);
      this._show(c, x, 0, z, d.yaw);
      c.state = LIFT;
      c.side = s;
      c.until = this.clock + until;
      c.fade = 1;
      d.fx.packPuff?.(x, 1.0, z);
      this._emit('spawn', x, z, 'lift');
      n++;
    }
    return n;
  }

  /**
   * The Twin Pearls' second body: it appears across the hero from him (`dist` m from the hero, on a side
   * it may stand on), shapes its own Pearl and drives it along its line into the hero at the same
   * instant as his (`impactIn` s from now): no cue of its own (his red cue is the one), its own result.
   * o: { impactIn, damage, knockback, w, dash }. Its index or -1.
   */
  twin(o) {
    const d = this.d, p = this.game.player?.position, c = this._take();
    if (!c || !p) return -1;
    const a = Math.atan2(d.position.x - p.x, d.position.z - p.z) + Math.PI;
    const R = Math.max(2.5, Math.hypot(d.position.x - p.x, d.position.z - p.z));
    let x = p.x + Math.sin(a) * R, z = p.z + Math.cos(a) * R;
    if (!d.standable(x, z)) {
      x = p.x + Math.sin(a + 0.6) * R;
      z = p.z + Math.cos(a + 0.6) * R;
    }
    this._show(c, x, 0, z, Math.atan2(p.x - x, p.z - z));
    c.state = TWIN;
    c.fade = 1;
    c.impact = this.clock + Math.max(0.3, o.impactIn);
    c.W = Math.max(0.3, o.impactIn);
    c.until = c.impact + 0.25;
    c.ax = x;
    c.az = z;
    c.struck = false;
    c.twin = o;
    c.handle?.cancel?.();
    c.handle = d.brain.expect?.(o.impactIn, TELL.RED, 'twinPearl') ?? null;
    d.fx.packPuff?.(x, 1.0, z);
    this._emit('spawn', x, z, 'twin');
    return c.i;
  }

  /** The twin through its charge and its drive (its own Pearl drawn at its palm). */
  _twinFrame(c, p, dt) {
    const d = this.d, o = c.twin, left = c.impact - this.clock;
    if (left > 0) {
      const u = 1 - left / c.W;
      if (u < 0.8) {
        c.yaw = turnToward(c.yaw, Math.atan2(p.x - c.x, p.z - c.z), 12 * dt);
        c.lx = p.x;
        c.lz = p.z;
      } else {
        // the drive: a dash along its line, stopping a metre short of where it aimed
        const dx = c.lx - c.ax, dz = c.lz - c.az, L = Math.hypot(dx, dz) || 1;
        const go = Math.max(0, Math.min(o.dash ?? 5, L - 1.0)), k = ease((u - 0.8) / 0.2);
        c.x = c.ax + (dx / L) * go * k;
        c.z = c.az + (dz / L) * go * k;
      }
      const P = this._palmOf(c);
      d.fx.pearlCharge?.(P.x, P.y, P.z, Math.min(1, u / 0.8), dt);
      return;
    }
    if (!c.struck) {
      c.struck = true;
      c.handle = null;
      const pl = this.game.player;
      const dx = c.lx - c.ax, dz = c.lz - c.az, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
      const rx = p.x - c.x, rz = p.z - c.z, along = rx * ux + rz * uz, across = Math.abs(-rx * uz + rz * ux);
      const pr = pl?.radius ?? 0.45;
      const bx = c.x + ux * 1.4, bz = c.z + uz * 1.4;
      d.fx.pearlBurst?.(bx, bz, 2.0);
      d.game.world?.impact?.(bx, bz, 2.0, d.T.world.pearl, d._wbo ?? { kind: 'blast', by: 'boss', dx: NaN, dz: NaN, y: 1, src: -1, scar: true });
      if (pl && pl.alive !== false && along > -0.6 && along < 2.6 + pr && across < (o.w ?? 1.3) * 0.5 + pr) {
        const from = this._from;
        from.x = c.x;
        from.z = c.z;
        d.hitPlayer({ damage: o.damage, knockback: o.knockback, knockdown: true, tell: TELL.RED, attack: 'twinPearl', from, projectile: true });
      }
    }
    if (this.clock >= c.until) {
      d.fx.clonePop?.(c.x, 1.1, c.z, 'burst');
      this._emit('pop', c.x, c.z, 'burst');
      this._hide(c);
    }
  }

  /** The point `side` m to his left (negative: right) and `fwd` m ahead. */
  _side(side, fwd) {
    const d = this.d, lx = Math.cos(d.yaw), lz = -Math.sin(d.yaw);
    return { x: d.position.x + lx * side + Math.sin(d.yaw) * fwd, z: d.position.z + lz * side + Math.cos(d.yaw) * fwd };
  }

  /**
   * The Burial's pile: the bodies of a `together` pack that has struck and lies piled (its linger), or
   * null. { x, z } its centre (the hero's spot as they locked on).
   */
  pile() {
    for (const P of this.packs) {
      if (!P.on || P.mode !== 'together' || !P.hit) continue;
      if (P.bodies.some((c) => c.alive)) return { x: P.cx, z: P.cz };
    }
    return null;
  }

  /** The pile's bodies burst (he springs off them). */
  springOff(by = 'spring') {
    for (const P of this.packs) {
      if (!P.on || P.mode !== 'together' || !P.hit) continue;
      for (const c of P.bodies.slice()) if (c.alive) this._pop(c, by);
    }
  }

  // ---------------------------------------------------------------- the frame
  frame(dt) {
    const d = this.d;
    this.clock += dt;
    if (!d.pearl?.charging && !this.list.some((c) => c.state === ASSIST)) this.fed = 0;
    if (!this.list.some((c) => c.state !== DEAD && c.state !== SEATED)) return;
    const pl = this.game.player, p = pl?.position;
    // he is gone: so are they
    if (d.mode === 'dying' || d.mode === 'dead') {
      this.popAll('death');
      return;
    }
    if (!p) return;
    const T = this.T;
    for (const c of this.list) {
      if (c.state === DEAD || c.state === SEATED) continue;
      c.t += dt;
      if (c.fade > 0) c.fade = Math.max(0, c.fade - dt / 0.18);
      switch (c.state) {
        case PACK:
          if (c.pack?.on) this._packFrame(c, c.pack, p, dt);
          else this._hide(c);
          break;
        case TWIN:
          this._twinFrame(c, p, dt);
          break;
        case ASSIST: {
          // at his left, facing the way he faces; it bursts into the Pearl once the charge is over
          if (!d.pearl?.charging && c.until === Infinity) c.until = this.clock + T.helperLinger;
          if (this.clock >= c.until) {
            d.fx.clonePop?.(c.x, 1.1, c.z, 'burst');
            this._emit('pop', c.x, c.z, 'burst');
            this._hide(c);
            break;
          }
          const { x, z } = this._side(d.T.pearl.assist, 0.2);
          const k = Math.min(1, dt * 10);
          c.x += (x - c.x) * k;
          c.z += (z - c.z) * k;
          c.yaw = turnToward(c.yaw, d.yaw, 10 * dt);
          break;
        }
        case LIFT: {
          if (this.clock >= c.until || d.mode !== 'act') {
            d.fx.clonePop?.(c.x, 1.1, c.z, 'burst');
            this._emit('pop', c.x, c.z, 'burst');
            this._hide(c);
            break;
          }
          const { x, z } = this._side(0.95 * c.side, -0.15);
          const k = Math.min(1, dt * 10);
          c.x += (x - c.x) * k;
          c.z += (z - c.z) * k;
          c.y = Math.max(0, d.position.y);
          c.yaw = turnToward(c.yaw, d.yaw, 10 * dt);
          break;
        }
        case LEFT:
          if (this.clock >= c.until) {
            d.fx.clonePop?.(c.x, 1.1, c.z, 'burst');
            this._emit('pop', c.x, c.z, 'burst');
            this._hide(c);
          }
          break;
        default:
          break;
      }
    }
  }

  /** Where self c's striking end is drawn (its fist on the sword joint; a foot for a kick). */
  _tipOf(c) {
    const v = this._v, K = this.d.kit.blade;
    const kick = c.blow === 'dive' || c.blow === 'upkick';
    const j = kick ? c.rig.legs?.R?.foot : c.rig.sword;
    if (j?.matrixWorld) {
      if (kick) v.setFromMatrixPosition(j.matrixWorld);
      else v.set(0, 0, K.tip).applyMatrix4(j.matrixWorld);
    }
    if (!Number.isFinite(v.x + v.y + v.z)) v.set(c.x, c.y + 1.3, c.z);
    return v;
  }

  /** Self c's palms (its own Pearl). */
  _palmOf(c) {
    const v = this._v, w = c.rig.arms?.L?.wrist, s = c.rig.sword;
    if (w?.matrixWorld && s?.matrixWorld) {
      v.setFromMatrixPosition(w.matrixWorld);
      const ax = v.x, ay = v.y, az = v.z;
      v.setFromMatrixPosition(s.matrixWorld);
      v.set((ax * 2 + v.x) / 3, (ay * 2 + v.y) / 3 + 0.12, (az * 2 + v.z) / 3);
    } else v.set(c.x, 1.2, c.z);
    if (!Number.isFinite(v.x + v.y + v.z)) v.set(c.x, 1.2, c.z);
    return v;
  }

  /** Self i's free hand (the Pearl's thread starts there), into `out`. */
  handPoint(i, out) {
    const c = this.list[i];
    // (the twin shapes its own Pearl: no thread of its runs to his)
    if (!c?.alive || c.state === TWIN) return null;
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
   * Pose every self that is out (its blow's clip on its own clock; a helper's held pose), then push
   * its two hurt spheres (upright gameplay points, as his own) into d.hurtSpheres. Called from his
   * afterPose: his own spheres are already there. A pack body is posed every frame (it is out for
   * under a second, all of it within half a second of its blow); a helper that only holds a pose,
   * every other frame.
   */
  pose(dt) {
    const d = this.d, H = d.hurtSpheres, L = d.lean, cam = this.game.camera?.position, CL = d.kit.CLIP;
    this._frameN = (this._frameN + 1) | 0;
    for (const c of this.list) {
      if (c.state === SEATED) {
        this._poseSeated(c, dt, L, cam);
        continue;
      }
      if (!c.alive) continue;
      const pl = c.pilot, root = c.root;
      root.position.set(c.x, c.y, c.z);
      c.yaw = wrapAngle(fin(c.yaw));
      pl.yaw = c.yaw;
      root.rotation.y = c.yaw;
      let full = true;
      if (c.state === PACK || c.state === TWIN) {
        // its blow's clip on its own clock: a windup longer than the clip's holds at the cock, a
        // shorter one skips into it (as his own held blows do); past the impact the clip runs on
        const bl = c.state === TWIN ? null : this.blows[c.blow];
        const B = bl?.B, clip = c.state === TWIN ? CL?.orbHold : bl?.clip;
        if (clip && pl.atk.def !== clip) {
          pl.atk.def = clip;
          c.anim.play('duel', 0.01, true);
        }
        if (B) {
          const impT = B.impact, cockT = impT * (B.def?.cock ?? 0.7);
          const elapsed = c.W - (c.impact - this.clock), h = c.W - impT;
          let ct = elapsed - h;
          if (h > 0 && elapsed < cockT) ct = elapsed;
          else if (h > 0 && elapsed < cockT + h) ct = cockT;
          // (it appears already in its attack pose: a short windup starts at the cock)
          if (h <= 0) ct = Math.max(ct, cockT * 0.6);
          pl.stateT = pl.animT = Math.max(0, ct);
        } else pl.stateT = pl.animT = 0;
      } else {
        const want = c.state === ASSIST ? CL?.orbHold : c.state === LIFT ? CL?.liftHold ?? CL?.orbHold : null;
        if (want && pl.atk.def !== want) {
          pl.atk.def = want;
          c.anim.play('duel', 0.12, true);
        } else if (!want && pl.atk.def) {
          pl.atk.def = null;
          c.anim.play('loco', 0.18);
        }
        pl.stateT = pl.animT = 0;
        full = c.fade > 0 || ((c.i + this._frameN) & 1) === 0 || c.sx === undefined;
      }
      c.acc += dt;
      const a = c.hs[0], b = c.hs[1];
      if (full) {
        c.lean.k = L.k;
        c.lean.dx = L.dx;
        c.lean.dz = L.dz;
        c.lean.on = false;
        c.anim.update(c.acc);
        c.acc = 0;
        // two hurt spheres from the upright body (the animator left its world matrices upright)
        const r = c.rig, v = this._v;
        r.chest.getWorldPosition(v);
        a.x = v.x;
        a.y = v.y + 0.05;
        a.z = v.z;
        r.pelvis.getWorldPosition(v);
        b.x = v.x;
        b.y = v.y;
        b.z = v.z;
        c.lean.on = true;
        root.updateMatrix();
        c.sx = c.x;
        c.sz = c.z;
        if (cam) setHeroGlyphScale(c.mats, Math.hypot(cam.x - c.x, cam.y - 1.1 - c.y, cam.z - c.z));
        for (const m of c.mats) {
          const u = m.uniforms;
          if (!u) continue;
          if (u.uDissolve) u.uDissolve.value = c.fade * 0.85;
          if (u.uFlash) u.uFlash.value = 0;
          if (u.uWarn) u.uWarn.value.w = 0;
        }
      } else {
        const mx = c.x - c.sx, mz = c.z - c.sz;
        a.x += mx;
        a.z += mz;
        b.x += mx;
        b.z += mz;
        c.sx = c.x;
        c.sz = c.z;
      }
      if (Number.isFinite(a.x + a.y + a.z)) H.push(a);
      if (Number.isFinite(b.x + b.y + b.z)) H.push(b);
    }
  }

  /** A seated self of the intro: his meditation clip, no spheres. */
  _poseSeated(c, dt, L, cam) {
    const pl = c.pilot, root = c.root, M = this.d.kit.CLIP?.meditate;
    root.position.set(c.x, 0, c.z);
    pl.yaw = c.yaw;
    root.rotation.y = c.yaw;
    if (pl.atk.def !== M) {
      pl.atk.def = M;
      c.anim.play('duel', 0.01, true);
    }
    pl.stateT = pl.animT = 0;
    c.lean.k = L.k;
    c.lean.dx = L.dx;
    c.lean.dz = L.dz;
    c.anim.update(dt);
    root.updateMatrixWorld(true);
    if (cam) setHeroGlyphScale(c.mats, Math.hypot(cam.x - c.x, cam.y - 1.1, cam.z - c.z));
  }
}
