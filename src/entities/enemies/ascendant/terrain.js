import { clamp, turnToward } from '../../../core/math.js';
import { TELL, RESULT } from '../../../combat/rules.js';
import { FIRE_KIND } from '../../../render/firePalettes.js';
import { BREAK } from '../../../world/breakTuning.js';
import { perPhase } from '../duelist/realise.js';

// Tian Lei uses the ring (MOVES.md; the Skybreak Ring's tiles: world/skybreakRing.js, world/floor.js).
// What his terrain moves do once they are started: the tiles he stamps up, throws and bursts, and the
// shock that runs over the whole ring. The moves are data (moves/terrain.js: a move marked `terrain:
// kind`, each beat a `cast` with `selfCue`), their numbers TUNING.terrain (tuningTerrain.js).
//   tileKick     Tile Kick     he stamps: a whole tile before him jumps up and hangs; his cross sends
//                              it at the hero (normal: a guard; a parry cuts it in two; cover in its way
//                              stops it). The tile's place is left broken
//   ringBreaker  Ring Breaker  his fists into the floor; the tiles burst up in a line toward the hero,
//                              one after another, to past him: each flares on the tile for a hero near
//                              it (red: step off the line, or roll at the tile under you). One blow
//                              at most for the whole line (the Lord's Rupture)
//   stoneStorm   Stone Storm   his aura tears three tiles up round him (four: the last is the great
//                              one); at the first blow they leave one after another (normal), at the
//                              second the great one (red, a knockdown). A stagger before a throw drops
//                              what he holds where it hangs
// And three hooks other code calls:
//   quake(x, z, o)     Heavenfall's landing (the strings agent's class): every tile within `shatter` m
//                      breaks, a great crater, and a shock front runs out over the ring from `o.from`
//                      to `o.to` m at `o.speed` m/s: it cracks each tile it crosses and strikes the hero
//                      once as it reaches him (red, cued as it comes: roll through it). A hero inside
//                      `from` at the landing is the leap's own blow, not the front's
//   nova(x, z, r)      a transformation's ring (the class, at fx.transformNova): the tiles round him crack
//   crater(x, z, r, k) a heavy blow's crater (the class, at fx.crater): rubble of the wreckage round it
// Every tile in the air and every burst is known to the cue ledger before its cue (brain.expect; the
// handles retimed as the hero moves), and the fairness guard (brain.fairDelay) lengthens a flight or
// holds a line rather than cue it beside a blow that asks the other answer; when nothing clears it,
// it lands uncued and harms nobody. His AI weighs a move only while the floor has the tiles for it
// (weigh → 0), and a move with no tile does not start (begin → false): when the ring round him is
// spent, his terrain moves stop coming (the other moves fill the gap).
// Two random streams of its own: `_g` (what decides the game: none drawn yet), `_l` (looks), never
// Math.random or the effects' stream. No per-frame allocation: fixed records, reused.
// (Its fields are named so the cue ledger's courtyard / crater readers (`shot`, `rings`, `marks`,
// `held` + `cast`) never mistake them for theirs.)

const INTACT = 0, HELD = 3, FLYING = 4;
const K_GOLD = FIRE_KIND.void; // (the void slot prints gold on this level: AscFx)
const K_STEEL = FIRE_KIND.steel;
const TAU = Math.PI * 2;
const ease = (u) => u * u * (3 - 2 * u);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const MAXL = 10; // Ring Breaker's tiles at most
const NFLY = 6; // tiles in the air at once at most
const GRIT = [0.62, 0.48, 0.32], GRIT_END = [0.18, 0.13, 0.09];
const DUST = [0.36, 0.29, 0.22], DUST_END = [0.12, 0.1, 0.08];

export class TerrainMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    /** Tile Kick: the tile stamped up, hanging before him until his cross */
    this.kick = { act: null, piece: null, up: false, t: 0, x0: 0, z0: 0, hx: 0, hz: 0 };
    /** tiles in the air (Tile Kick, Stone Storm): each told to the cue ledger (`h`) */
    this.fly = Array.from({ length: NFLY }, () => ({ live: false, piece: null, flashed: false, quiet: false, tell: TELL.NORMAL, damage: 0, kb: 0, knockdown: false, attack: '', dx: 0, dz: 1, hit: 1, parryPosture: 0, h: null }));
    /** Ring Breaker's line */
    this.line = {
      live: false, t: 0, n: 0, hitDone: false, damage: 0, kb: 0, attack: 'ringBreaker', dx: 0, dz: 1, quiet: 0,
      x: new Float32Array(MAXL), z: new Float32Array(MAXL), at: new Float32Array(MAXL), flashed: new Uint8Array(MAXL), done: new Uint8Array(MAXL), h: new Array(MAXL).fill(null),
    };
    /** Stone Storm: the tiles his aura holds (slot -1: the great one), the throws still to come */
    this.storm = {
      act: null, lifted: false,
      hold: Array.from({ length: 4 }, () => ({ piece: null, slot: 0, t: 0, x0: 0, z0: 0, px: 0, py: 0, pz: 0, at: -1, h: null, damage: 0, kb: 0, tell: TELL.NORMAL, knockdown: false, attack: '' })),
      t: 0,
    };
    /** the quake's fronts */
    this.quakes = Array.from({ length: 2 }, () => ({ live: false, x: 0, z: 0, r: 0, rPrev: 0, from: 0, to: 0, speed: 1, wait: 0, damage: 0, kb: 0, flashed: false, struck: false, quiet: false, h: null, draw: 0, attack: 'heavenfall' }));
    this._throw = { time: 0.6, power: 1, radius: 1.3, by: 'boss', onLand: (b, x, z) => this._landed(b, x, z) };
    this._pop = { time: 0.5, power: 0.8, radius: 1.2, by: 'boss', onLand: null };
    this._blow = { kind: 'blast', by: 'boss', dx: 0, dz: 0, src: -1, down: true }; // (no `y`: a blow given a height passes over the floor's slabs)
    this._tell = { source: 'dragon', attack: '', tell: TELL.RED, impactIn: 0, x: 0, z: 0, hazard: true };
    this._flash = { source: 'dragon', attack: '', tell: TELL.RED, x: 0, y: 0, z: 0, hazard: true, flare: true };
    this._tflash = { source: 'dragon', attack: '', tell: TELL.NORMAL, x: 0, y: 0, z: 0, flare: true };
    this._from = { x: 0, z: 0 };
    this._v = { x: 0, z: 0 };
    this._near = [];
    this._one = [];
    this._shockO = { k: 0.7, fire: 0.2, kind: 'dust' };
    this._gs = 0x9b05688c;
    this._ls = 0x1f83d9ab;
  }

  get W() {
    return this.game.world?.destructibles ?? null;
  }
  get T() {
    return this.d.T.terrain;
  }
  /** The gameplay stream (its own: no look can move it). */
  _g() {
    this._gs = (Math.imul(this._gs, 1664525) + 1013904223) >>> 0;
    return this._gs / 4294967296;
  }
  /** The looks' stream. */
  _l() {
    this._ls = (Math.imul(this._ls, 1103515245) + 12345) >>> 0;
    return this._ls / 4294967296;
  }
  _lr(a, b) {
    return a + this._l() * (b - a);
  }

  /** Every reset of his: nothing of his left in the air (the world's reset puts the tiles back). */
  reset() {
    const K = this.kick;
    K.act = null;
    K.piece = null;
    K.up = false;
    for (const f of this.fly) {
      f.live = false;
      f.piece = null;
      f.h?.cancel?.();
      f.h = null;
    }
    this._endLine();
    this._dropStorm(false);
    for (const q of this.quakes) {
      q.live = false;
      q.h?.cancel?.();
      q.h = null;
    }
    this._gs = 0x9b05688c;
    this._ls = 0x1f83d9ab;
  }

  /** Something of his is still in the air or bursting. */
  get busy() {
    return !!this.kick.piece || this.fly.some((f) => f.live) || this.line.live || this.storm.hold.some((h) => h.piece) || this.quakes.some((q) => q.live);
  }

  /** Where the hero is (a point ahead of him when there is none). */
  _hero() {
    const d = this.d, me = d.position, p = this.game.player?.position, v = this._v;
    v.x = Number.isFinite(p?.x) ? p.x : me.x + Math.sin(d.yaw) * 4;
    v.z = Number.isFinite(p?.z) ? p.z : me.z + Math.cos(d.yaw) * 4;
    return v;
  }

  // ------------------------------------------------------------------ the tiles for a move
  /** A whole tile `ahead` m in front of him toward the hero (within `reach` of that point), or null. */
  _tileAhead(K, forced) {
    const W = this.W, d = this.d, me = d.position, out = this._one;
    if (!W?.floorNear) return null;
    const H = this._hero();
    let ux = H.x - me.x, uz = H.z - me.z;
    const l = Math.hypot(ux, uz);
    if (!forced && (l < K.heroMin || l > K.heroMax)) return null;
    if (l > 0.05) {
      ux /= l;
      uz /= l;
    } else {
      ux = Math.sin(d.yaw);
      uz = Math.cos(d.yaw);
    }
    const n = W.floorNear(me.x + ux * K.ahead, me.z + uz * K.ahead, forced ? K.reach * 3 : K.reach, out, { kind: 'tile', whole: true, max: 1 });
    return n ? out[0] : null;
  }

  /** Whole tiles within `near` m of him for Stone Storm, into this._near (count + 1 at most). */
  _tilesRound(K) {
    const W = this.W, me = this.d.position;
    this._near.length = 0;
    if (!W?.floorNear) return 0;
    return W.floorNear(me.x, me.z, K.near, this._near, { kind: 'tile', whole: true, max: K.count + 1 });
  }

  /** His AI weighs a terrain move: 0 while the floor has nothing for it, or one of its kind runs. */
  weigh(def, w) {
    const kind = def.terrain, T = this.T;
    if (!kind || !T) return w;
    if (kind === 'tileKick') return this.kick.act || this.fly.some((f) => f.live) || !this._tileAhead(T.tileKick, false) ? 0 : w;
    if (kind === 'ringBreaker') return this.line.live || !this.W?.floor?.some((b) => b.state === INTACT) ? 0 : w;
    if (kind === 'stoneStorm') return this.storm.act || this._tilesRound(T.stoneStorm) < 2 ? 0 : w;
    return w;
  }

  /** A terrain move starts: its tiles. False: there are none (the move does not start). */
  begin(A) {
    const kind = A?.def?.terrain, T = this.T, W = this.W, d = this.d;
    if (!kind || !T) return true;
    if (!W?.floor?.length) return false;
    if (kind === 'tileKick') {
      const b = this._tileAhead(T.tileKick, true);
      if (!b) return false;
      const K = this.kick;
      K.act = A;
      K.piece = b;
      K.up = false;
      K.t = 0;
      return true;
    }
    if (kind === 'ringBreaker') return W.floor.some((b) => b.state === INTACT);
    if (kind === 'stoneStorm') {
      if (this._tilesRound(T.stoneStorm) < 2) return false;
      const S = this.storm, n = this._near.length;
      this._dropStorm(false);
      S.act = A;
      S.lifted = false;
      S.t = 0;
      for (let i = 0; i < n && i < S.hold.length; i++) {
        const h = S.hold[i];
        h.piece = this._near[i];
        // (the last one taken is the great one, when there are enough for both)
        h.slot = i === n - 1 && n > 1 ? -1 : i;
        h.at = -1;
        h.t = 0;
      }
      void d;
      return true;
    }
    return true;
  }

  // ------------------------------------------------------------------ his motion
  /** Every frame of a terrain beat: he faces the hero; the stamp; the aura tearing tiles up. */
  motion(b, u, s, dt) {
    const d = this.d, kind = this.d.brain.act?.def?.terrain;
    if (s) d.yaw = turnToward(d.yaw, Math.atan2(s.p.x - d.position.x, s.p.z - d.position.z), 10 * dt);
    if (kind === 'tileKick') {
      const K = this.kick;
      if (K.act === d.brain.act && !K.up && u >= this.T.tileKick.stamp && u < 1) this._stamp();
    } else if (kind === 'stoneStorm') {
      const S = this.storm;
      if (S.act === d.brain.act && !S.lifted && b.def.cast?.kind === 'stormThrow' && u >= 0.1) this._liftStorm();
    }
  }

  /** Tile Kick's stamp: his foot comes down, the tile before him jumps up out of the ring. */
  _stamp() {
    const K = this.kick, W = this.W, d = this.d, T = this.T.tileKick;
    K.up = true;
    let pc = K.piece;
    if (!pc || pc.state !== INTACT) pc = this._tileAhead(T, true);
    if (!pc || !W?.take?.(pc)) {
      K.piece = null;
      return;
    }
    K.piece = pc;
    K.t = 0;
    K.x0 = pc.x;
    K.z0 = pc.z;
    const H = this._hero(), me = d.position;
    const l = Math.hypot(H.x - me.x, H.z - me.z) || 1;
    // it comes to hang just before his lead hand, between him and the hero
    K.hx = me.x + ((H.x - me.x) / l) * 1.2;
    K.hz = me.z + ((H.z - me.z) / l) * 1.2;
    W.carry(pc, pc.x, 0.05, pc.z, 0, 0);
    const fx = d.fx;
    fx.dust?.(me.x, me.z, 0.9);
    this._burst(pc.x, 0.15, pc.z, 10, DUST, DUST_END, 2.6);
    this.game.shake?.(0.1);
  }

  /** Stone Storm: the aura takes the tiles round him; they rise to hang about him. */
  _liftStorm() {
    const S = this.storm, W = this.W;
    S.lifted = true;
    let any = false;
    for (const h of S.hold) {
      const pc = h.piece;
      if (!pc) continue;
      if (pc.state !== INTACT || !W?.take?.(pc)) {
        h.piece = null;
        continue;
      }
      h.t = 0;
      h.x0 = pc.x;
      h.z0 = pc.z;
      W.carry(pc, pc.x, 0.05, pc.z, 0, 0);
      this._burst(pc.x, 0.15, pc.z, 6, GRIT, GRIT_END, 2.2);
      for (let q = 0; q < 4; q++) this.d.fx._blob?.(pc.x + this._lr(-0.4, 0.4), 0.3, pc.z + this._lr(-0.4, 0.4), 0, this._lr(1.5, 3), 0, this._lr(0.3, 0.5), 0.5, 0.2, 0.4, 0, this.d.phase >= 2 ? K_GOLD : K_STEEL, 1);
      any = true;
    }
    if (any) this.game.shake?.(0.08);
  }

  // ------------------------------------------------------------------ the impacts
  /** A terrain beat's impact, its first frame: Ring Breaker's fists into the floor. */
  onImpact(b, s, a) {
    if (b.def.cast?.kind !== 'ringBreaker') return;
    const d = this.d, K = this.T.ringBreaker, fx = d.fx;
    const x = d.position.x + Math.sin(d.yaw) * K.fist, z = d.position.z + Math.cos(d.yaw) * K.fist;
    fx.crater?.(x, z, 1.4, 0.9);
    const o = this._blow;
    o.dx = Math.sin(d.yaw);
    o.dz = Math.cos(d.yaw);
    o.src = this.W?.swing?.() ?? -1;
    this.game.world?.impact?.(x, z, 1.0, 1.0, o);
    this.game.shake?.(0.2);
    void s;
    void a;
  }

  /** A cast beat's impact: the cross that sends the tile, the line, the storm's throws. */
  onCast(b, s, a) {
    const kind = b.def.cast?.kind;
    if (kind === 'tileKick') this._kickTile(b, s, a);
    else if (kind === 'ringBreaker') this._castLine(b.def, s, a);
    else if (kind === 'stormThrow') this._stormThrow(b, s, a);
    else if (kind === 'stormGreat') this._stormGreat(b, s, a);
  }

  onRelease() {}
  onSustain() {}
  onHit() {}
  lockEnd() {
    return false;
  }

  // ------------------------------------------------------------------ throwing a tile
  /**
   * Throw the held tile `pc` at the hero: a flight of `time` s (lengthened by the fairness guard, or
   * uncued and harmless when nothing clears it); cover in its way takes it instead. Returns the
   * flight record or null.
   */
  _throwTile(pc, D, attack, time, o) {
    const W = this.W, d = this.d;
    if (!pc || pc.state !== HELD || !W?.throwTo) return null;
    const H = this._hero(), s = d.brain?._sense?.();
    let tx = H.x, tz = H.z;
    if (s && Number.isFinite(s.vx + s.vz)) {
      tx += s.vx * o.lead;
      tz += s.vz * o.lead;
    }
    const sx = fin(pc.px, pc.x), sz = fin(pc.pz, pc.z);
    let dist = Math.hypot(tx - sx, tz - sz);
    const l = dist || 1, dx = (tx - sx) / l, dz = (tz - sz) / l;
    // cover between him and the hero takes it (a pillar, a post, a drum)
    let quiet = false;
    const c = W.coverAt?.(sx, sz, tx, tz, 0.3);
    if (c && c !== pc) {
      const t = fin(W.coverT, 1);
      tx = sx + (tx - sx) * t;
      tz = sz + (tz - sz) * t;
      dist *= t;
      quiet = true;
    }
    let fl = Math.max(time, o.minFlight ?? 0.42);
    if (!quiet) {
      const dl = d.brain?.fairDelay?.(fl, D.tell, o.maxDelay, attack) ?? 0;
      if (dl > 0) {
        fl += dl;
        if (d.brain.stats) d.brain.stats.delays++;
      } else if (dl < 0) quiet = true;
    }
    const tw = this._throw;
    tw.time = fl;
    tw.power = o.power;
    tw.radius = o.radius;
    if (!W.throwTo(pc, tx, tz, tw)) {
      W.drop?.(pc);
      return null;
    }
    const R = this.fly.find((f) => !f.live);
    if (!R) return null;
    R.live = true;
    R.piece = pc;
    R.flashed = false;
    R.quiet = quiet;
    R.tell = D.tell;
    R.damage = D.damage;
    R.kb = D.knockback ?? 2;
    R.knockdown = !!D.knockdown;
    R.attack = attack;
    R.dx = dx;
    R.dz = dz;
    R.hit = o.hit;
    R.parryPosture = o.parryPosture ?? 0;
    R.h?.cancel?.();
    R.h = quiet ? null : d.brain?.expect?.(fl, D.tell, attack) ?? null;
    // the blow that sends it: pale strokes the way it goes, grit off the tile
    const fx = d.fx, y = fin(pc.py, 1);
    for (let q = -2; q <= 2; q++) {
      const w = q * 0.2;
      fx._ink?.(sx - dz * w, y + 0.1, sz + dx * w, sx - dz * w * 1.5 + dx * 1.3, y + 0.15, sz + dx * w * 1.5 + dz * 1.3, 0.13, 0.85, 0);
    }
    this._burst(sx, y, sz, 6, GRIT, GRIT_END, 2.6, dx, dz);
    return R;
  }

  /** Tile Kick: the cross sends the hanging tile at the hero (16 m/s). */
  _kickTile(b, s, a) {
    const K = this.kick, T = this.T.tileKick;
    if (!K.up) this._stamp();
    const pc = K.piece;
    K.piece = null;
    K.act = null;
    if (!pc || pc.state !== HELD) return;
    const H = this._hero();
    const dist = Math.hypot(H.x - fin(pc.px, pc.x), H.z - fin(pc.pz, pc.z));
    this._throwTile(pc, b.def, a?.name ?? 'tileKick', dist / T.speed, T);
    this.game.shake?.(0.12);
    void s;
  }

  /** Stone Storm, the first blow: the tiles he holds leave one after another, `gap` s apart. */
  _stormThrow(b, s, a) {
    const S = this.storm, K = this.T.stoneStorm, d = this.d;
    if (!S.lifted) this._liftStorm();
    let i = 0;
    const H = this._hero();
    for (const h of S.hold) {
      if (!h.piece || h.slot < 0) continue;
      h.at = S.t + i * K.gap;
      h.damage = b.def.damage;
      h.kb = b.def.knockback ?? 2;
      h.tell = b.def.tell;
      h.knockdown = false;
      h.attack = a?.name ?? 'stoneStorm';
      // told to the ledger now: it lands about a flight after it leaves
      const fl = clamp(Math.hypot(H.x - fin(h.piece.px, h.piece.x), H.z - fin(h.piece.pz, h.piece.z)) / K.per, K.time[0], K.time[1]);
      h.h?.cancel?.();
      h.h = d.brain?.expect?.(i * K.gap + fl, h.tell, h.attack) ?? null;
      i++;
    }
    // the great one: told now, thrown by the second blow
    const g = S.hold.find((x) => x.piece && x.slot < 0), act = d.brain.act;
    const b2 = act?.beats?.find((x) => x !== b && x.def.cast?.kind === 'stormGreat');
    if (g && b2) {
      const fl = clamp(Math.hypot(H.x - fin(g.piece.px, g.piece.x), H.z - fin(g.piece.pz, g.piece.z)) / K.per, K.time[0], K.time[1]);
      g.h?.cancel?.();
      g.h = d.brain?.expect?.(Math.max(0, b2.impact - act.t) + fl, TELL.RED, a?.name ?? 'stoneStorm') ?? null;
    }
    this._stormDue();
    void s;
  }

  /** Stone Storm, the second blow: the great one. */
  _stormGreat(b, s, a) {
    const S = this.storm, K = this.T.stoneStorm;
    const g = S.hold.find((x) => x.piece && x.slot < 0) ?? S.hold.find((x) => x.piece && x.at < 0);
    if (!g) return;
    const pc = g.piece;
    g.piece = null;
    g.h?.cancel?.();
    g.h = null;
    const H = this._hero();
    const fl = clamp(Math.hypot(H.x - fin(pc.px, pc.x), H.z - fin(pc.pz, pc.z)) / K.per, K.time[0], K.time[1]);
    this._throwTile(pc, b.def, a?.name ?? 'stoneStorm', fl, { lead: K.lead, minFlight: 0.45, maxDelay: K.maxDelay, power: K.greatPower, radius: K.greatRadius, hit: K.greatHit });
    this.game.shake?.(0.18);
    // (the storm is over once it leaves: nothing to drop if he staggers now)
    if (!S.hold.some((x) => x.piece)) S.act = null;
    void s;
  }

  /** The storm's throws whose time has come. */
  _stormDue() {
    const S = this.storm, K = this.T.stoneStorm;
    for (const h of S.hold) {
      if (!h.piece || h.slot < 0 || h.at < 0 || S.t < h.at) continue;
      const pc = h.piece;
      h.piece = null;
      h.at = -1;
      const H = this._hero();
      const fl = clamp(Math.hypot(H.x - fin(pc.px, pc.x), H.z - fin(pc.pz, pc.z)) / K.per, K.time[0], K.time[1]);
      const D = { tell: h.tell, damage: h.damage, knockback: h.kb, knockdown: false };
      const R = this._throwTile(pc, D, h.attack, fl, { lead: K.lead, minFlight: 0.42, maxDelay: K.maxDelay, power: K.power, radius: K.radius, hit: K.hit });
      // (its own handle now: the one told at the cast goes)
      h.h?.cancel?.();
      h.h = null;
      if (!R) continue;
      this.game.shake?.(0.08);
    }
  }

  /** What he holds falls where it hangs (a stagger, a break, a reset). */
  _dropStorm(drop = true) {
    const S = this.storm, W = this.W;
    for (const h of S.hold) {
      if (drop && h.piece?.state === HELD) W?.drop?.(h.piece);
      h.piece = null;
      h.at = -1;
      h.h?.cancel?.();
      h.h = null;
    }
    S.act = null;
    S.lifted = false;
  }

  /** A thrown tile has landed (the world's onLand): its blow at the hero, if he is under it and it was cued. */
  _landed(pc, x, z) {
    const R = this.fly.find((f) => f.live && f.piece === pc);
    if (!R) return;
    R.live = false;
    R.piece = null;
    R.h?.cancel?.();
    R.h = null;
    const d = this.d, p = this.game.player;
    d.fx.dust?.(x, z, 0.8);
    if (!p?.position || p.alive === false || !R.flashed || R.quiet) return;
    if (Math.hypot(p.position.x - x, p.position.z - z) > R.hit + (p.radius ?? 0.45)) return;
    this._from.x = x - R.dx * 1.4;
    this._from.z = z - R.dz * 1.4;
    const r = d.hitPlayer({
      damage: R.damage, knockback: R.kb, knockdown: R.knockdown, kind: 'stone', tell: R.tell, attack: R.attack,
      from: this._from, projectile: true, parryPosture: R.parryPosture,
    });
    // a parry cuts it in two: two halves of grit thrown either side of the blade
    if (r === RESULT.PARRIED) {
      for (const sgn of [-1, 1]) this._burst(x, 0.9, z, 8, GRIT, GRIT_END, 4, -R.dz * sgn, R.dx * sgn);
      d.fx._ink?.(x - R.dz * 0.6, 1.0, z + R.dx * 0.6, x + R.dz * 0.6, 1.0, z - R.dx * 0.6, 0.18, 1.0, 0);
    }
  }

  // ------------------------------------------------------------------ Ring Breaker's line
  _castLine(D, s, a) {
    const d = this.d, K = this.T.ringBreaker, R = this.line, me = d.position, p = this.game.player?.position;
    let dx = fin(s?.p?.x, fin(p?.x, me.x + Math.sin(d.yaw))) - me.x, dz = fin(s?.p?.z, fin(p?.z, me.z + Math.cos(d.yaw))) - me.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      dx /= dist;
      dz /= dist;
    } else {
      dx = Math.sin(d.yaw);
      dz = Math.cos(d.yaw);
    }
    const gap = perPhase(K.gap, d.phase);
    const n = clamp(Math.floor((Math.max(dist, K.first) + K.past - K.first) / K.step) + 1, 2, Math.min(MAXL, K.max));
    this._endLine();
    R.live = true;
    R.t = 0;
    R.n = n;
    R.hitDone = false;
    R.damage = D.damage;
    R.kb = D.knockback ?? 3;
    R.attack = a?.name ?? 'ringBreaker';
    R.dx = dx;
    R.dz = dz;
    let near = 0, nd = Infinity;
    for (let i = 0; i < n; i++) {
      const s0 = K.first + i * K.step;
      R.x[i] = me.x + dx * s0;
      R.z[i] = me.z + dz * s0;
      R.at[i] = K.delay + i * gap;
      R.flashed[i] = 0;
      R.done[i] = 0;
      const e = p ? Math.hypot(p.x - R.x[i], p.z - R.z[i]) : Infinity;
      if (e < nd) {
        nd = e;
        near = i;
      }
    }
    const dl = this._lineDelay(R, n, near, p, K);
    R.quiet = dl < 0 ? 1 : 0;
    if (dl > 0) {
      for (let i = 0; i < n; i++) R.at[i] += dl;
      if (d.brain.stats) d.brain.stats.delays++;
    }
    if (!R.quiet) for (let i = 0; i < n; i++) if (p && Math.hypot(p.x - R.x[i], p.z - R.z[i]) < K.radius + K.cue + 1.5) R.h[i] = d.brain?.expect?.(R.at[i], TELL.RED, R.attack) ?? null;
  }

  /** The least wait that clears every tile of the line that may cue; -1 when none up to maxDelay does. */
  _lineDelay(R, n, near, p, K) {
    const B = this.d.brain;
    if (!B?.fairDelay) return 0;
    let sh = 0;
    for (let it = 0; it < 12; it++) {
      let need = 0;
      for (let i = 0; i < n; i++) {
        if (i !== near && !(p && Math.hypot(p.x - R.x[i], p.z - R.z[i]) < K.radius + K.cue + 1.5)) continue;
        const dl = B.fairDelay(R.at[i] + sh, TELL.RED, K.maxDelay - sh, R.attack);
        if (dl < 0) return -1;
        if (dl > need) need = dl;
      }
      if (!(need > 0)) return sh;
      sh += need;
      if (sh > K.maxDelay + 1e-6) return -1;
    }
    return -1;
  }

  _endLine() {
    const R = this.line;
    R.live = false;
    for (let i = 0; i < MAXL; i++) {
      R.h[i]?.cancel?.();
      R.h[i] = null;
    }
  }

  /** Every frame of the line: a tile quivers, flares (for a hero near it), and bursts up. */
  _lineFrame(dt, lead) {
    const R = this.line;
    if (!R.live) return;
    const d = this.d, K = this.T.ringBreaker, W = this.W, fx = d.fx, pl = this.game.player, pp = pl?.position;
    R.t += dt;
    let left = 0;
    for (let i = 0; i < R.n; i++) {
      if (R.done[i]) continue;
      left++;
      const x = R.x[i], z = R.z[i], until = R.at[i] - R.t;
      if (until < K.quiver && until > 0 && this._l() < 0.7) {
        const a = this._l() * TAU, rr = this._lr(0.2, 0.9);
        const o = fx._rec(x + Math.cos(a) * rr, 0.1, z + Math.sin(a) * rr, this._lr(0.25, 0.45), 0.16, 0.08, ",.`'", GRIT, GRIT_END);
        o.vy = this._lr(1, 3);
        o.drag = 1.5;
        o.gravity = -8;
        o.alpha = 0.9;
        fx._spawn(fx.alpha, o);
      }
      if (!R.flashed[i] && !R.quiet && until <= lead && pp && pl.alive !== false && Math.hypot(pp.x - x, pp.z - z) < K.radius + K.cue) {
        R.flashed[i] = 1;
        this._cue(R.attack, x, 0.45, z, Math.max(0.02, until));
      }
      if (until > 0) continue;
      R.done[i] = 1;
      R.h[i]?.cancel?.();
      R.h[i] = null;
      // it bursts: the tile there torn up and thrown a little way, gold (dust in form 1) out of the hole
      if (W?.floorNear && W.floorNear(x, z, K.take, this._one, { max: 1 }) && W.take(this._one[0])) {
        const b = this._one[0];
        W.carry(b, b.x, 0.1, b.z, 0.5, Math.atan2(R.dx, R.dz));
        const o = this._pop;
        o.time = K.pop;
        o.power = K.power * 0.6;
        o.radius = K.radius;
        W.throwTo(b, b.x + R.dx * K.skid, b.z + R.dz * K.skid, o);
      }
      const bo = this._blow;
      bo.dx = R.dx;
      bo.dz = R.dz;
      bo.src = W?.swing?.() ?? -1;
      this.game.world?.impact?.(x, z, K.radius * 0.9, K.power, bo);
      this._shockO.k = 0.75;
      this._shockO.kind = d.phase >= 2 ? 'void' : 'dust';
      fx.shock?.(x, z, K.radius * 1.4, this._shockO);
      for (let q = 0; q < 5; q++) fx._blob?.(x + this._lr(-0.4, 0.4), 0.4, z + this._lr(-0.4, 0.4), this._lr(-0.6, 0.6), this._lr(3, 6), this._lr(-0.6, 0.6), this._lr(0.25, 0.4), 0.5, 0.9, 0.42, 0, d.phase >= 2 ? K_GOLD : K_STEEL, 1.5);
      this.game.shake?.(0.1);
      if (!R.hitDone && R.flashed[i] && pp && pl.alive !== false && Math.hypot(pp.x - x, pp.z - z) <= K.radius + (pl.radius ?? 0.45) * 0.5) {
        R.hitDone = true;
        this._from.x = x - R.dx;
        this._from.z = z - R.dz;
        d.hitPlayer({ damage: R.damage, knockback: R.kb, knockdown: true, kind: 'crush', tell: TELL.RED, parryable: false, blockable: false, attack: R.attack, from: this._from });
      }
    }
    if (!left) this._endLine();
  }

  // ------------------------------------------------------------------ the quake, the nova, a crater
  /**
   * Heavenfall's landing at (x, z): every tile within `shatter` m breaks, a great crater, and a front
   * runs out over the ring (o: { from, to, speed, damage, knockback } m, m/s; TUNING.terrain.quake
   * for what is left out). Returns true when a front left.
   */
  quake(x, z, o = {}) {
    const K = this.T?.quake, W = this.W, d = this.d;
    if (!K || !Number.isFinite(x + z)) return false;
    const q = this.quakes.find((f) => !f.live) ?? this.quakes[0];
    q.h?.cancel?.();
    q.live = true;
    q.x = x;
    q.z = z;
    q.from = fin(o.from, K.from);
    q.to = Math.max(q.from + 0.5, fin(o.to, K.to));
    q.speed = Math.max(1, fin(o.speed, K.speed));
    q.damage = fin(o.damage, K.damage);
    q.kb = fin(o.knockback, K.knockback);
    q.r = q.rPrev = q.from;
    q.flashed = false;
    q.struck = false;
    q.draw = 0;
    q.attack = o.attack ?? d.brain?.act?.name ?? 'heavenfall';
    // a hero inside `from` now: the leap's own blow is his, the front passes behind him
    const p = this.game.player?.position, dh = p ? Math.hypot(p.x - x, p.z - z) : Infinity;
    q.struck = !(dh > q.from && dh < q.to + 0.5);
    // the fairness guard: the front may wait a little to reach him clear of a cue that asks a guard
    q.wait = 0;
    q.quiet = false;
    if (!q.struck) {
      const t = (dh - q.from) / q.speed;
      const dl = d.brain?.fairDelay?.(t, TELL.RED, K.maxDelay, q.attack) ?? 0;
      if (dl > 0) q.wait = dl;
      else if (dl < 0) q.quiet = true;
      q.h = q.quiet ? null : d.brain?.expect?.(t + q.wait, TELL.RED, q.attack) ?? null;
    }
    // the landing: the tiles round it shatter, a great crater
    if (W?.strike) {
      const bo = this._blow;
      bo.dx = 0;
      bo.dz = 0;
      bo.src = W.swing();
      W.strike(x, z, K.shatter, 3.2, bo);
    }
    const bo = this._blow;
    bo.src = W?.swing?.() ?? -1;
    this.game.world?.impact?.(x, z, 3, K.crater, bo);
    this.crater(x, z, 3, 2);
    d.fx?.crater?.(x, z, 3.2, 2);
    this.game.shake?.(0.5);
    return true;
  }

  _quakeFrame(dt, lead) {
    const W = this.W, d = this.d, fx = d.fx, pl = this.game.player, pp = pl?.position;
    for (const q of this.quakes) {
      if (!q.live) continue;
      if (q.wait > 0) {
        q.wait -= dt;
        continue;
      }
      q.rPrev = q.r;
      q.r = Math.min(q.to, q.r + q.speed * dt);
      // each tile the front crosses heaves: it shows cracked (a whole one) or breaks (one cracked)
      if (W?.floor && W.strike) {
        const K = this.T.quake, bo = this._blow;
        for (const b of W.floor) {
          if (b.state !== INTACT) continue;
          const e = Math.hypot(b.x - q.x, b.z - q.z);
          if (e < q.rPrev || e >= q.r) continue;
          bo.dx = (b.x - q.x) / (e || 1);
          bo.dz = (b.z - q.z) / (e || 1);
          bo.src = W.swing(); // (one id a slab: a neighbour's touch must not use up its own)
          W.strike(b.x, b.z, 0.05, K.crack, bo);
        }
      }
      // the front: dust (gold from form 2) in a ring that runs with it, grit off the floor
      q.draw += dt;
      if (q.draw >= 0.07) {
        q.draw = 0;
        const n = Math.min(90, Math.round((TAU * q.r) / 0.9)), kind = d.phase >= 2 ? K_GOLD : K_STEEL;
        for (let i = 0; i < n; i++) {
          if (this._l() < 0.25) continue; // (a ragged front)
          const a = (i / n) * TAU + this._lr(-0.03, 0.03), ca = Math.cos(a), sa = Math.sin(a);
          fx._blob?.(q.x + ca * q.r, this._lr(0.3, 0.6), q.z + sa * q.r, ca * q.speed * 0.9, this._lr(0.3, 1.2), sa * q.speed * 0.9, 0.18, 0.7, 0.9, 0.34, 0, kind, 0.5);
        }
      }
      // its blow: once, as it reaches the hero (roll through it); its cue `lead` s before
      if (!q.struck && pp && pl.alive !== false) {
        const dh = Math.hypot(pp.x - q.x, pp.z - q.z), until = (dh - q.r) / q.speed;
        if (dh < q.rPrev - 0.6 || dh > q.to + 0.6) {
          // he is behind the front now (a dash, a roll), or out past where it stops: it misses him
          q.struck = true;
          q.h?.cancel?.();
          q.h = null;
        } else {
          q.h?.retime?.(Math.max(0, until));
          if (!q.flashed && !q.quiet && until <= lead) {
            q.flashed = true;
            this._cue(q.attack, pp.x, 0.4, pp.z, Math.max(0.02, until));
          }
          const K = this.T.quake;
          if (q.r >= dh - K.width * 0.5) {
            q.struck = true;
            q.h?.cancel?.();
            q.h = null;
            if (q.flashed && !q.quiet) {
              this._from.x = q.x;
              this._from.z = q.z;
              d.hitPlayer({ damage: q.damage, knockback: q.kb, knockdown: true, kind: 'crush', tell: TELL.RED, parryable: false, blockable: false, attack: q.attack, from: this._from });
            }
          }
        }
      }
      if (q.r >= q.to) {
        q.live = false;
        q.h?.cancel?.();
        q.h = null;
      }
    }
  }

  /** A transformation's ring at (x, z): the tiles within r of him crack, those within `breakR` break. */
  nova(x, z, r) {
    const K = this.T?.nova, W = this.W;
    if (!K || !W?.strike || !Number.isFinite(x + z + r) || !(r > 0)) return 0;
    const bo = this._blow;
    bo.dx = 0;
    bo.dz = 0;
    bo.src = W.swing();
    let n = W.strike(x, z, K.breakR, K.power, bo);
    bo.src = W.swing();
    n += W.strike(x, z, r, K.crack, bo);
    return n;
  }

  /** A heavy blow's crater at (x, z), r m, weight k (1 an axe kick): rubble of the wreckage round it. */
  crater(x, z, r, k = 1) {
    const K = this.T?.crater, Wk = this.W?.wreck;
    if (!K || !Wk?.rubble || !Number.isFinite(x + z + r + k) || k < K.minK) return 0;
    const n = Math.max(1, Math.round(K.rubble * k));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this._lr(-0.5, 0.5), rr = r * this._lr(0.55, 0.85);
      Wk.rubble(x + Math.cos(a) * rr, z + Math.sin(a) * rr, this._lr(0.35, 0.55) * Math.min(1.5, k), BREAK.mats.stone);
    }
    return n;
  }

  // ------------------------------------------------------------------ frame
  /** Every frame after the brain: a move cut short drops its tiles; what hangs, flies and bursts. */
  frame(dt) {
    const d = this.d, act = d.brain?.act, lead = perPhase(d.T.flashLead, d.phase);
    const K = this.kick, S = this.storm, W = this.W;
    // Tile Kick cut short (a stagger, a break): the tile it stamped up falls where it hangs
    if (K.act && act !== K.act) {
      if (K.piece?.state === HELD) W?.drop?.(K.piece);
      K.act = null;
      K.piece = null;
    }
    if (K.piece && K.up) {
      const pc = K.piece;
      if (pc.state !== HELD) K.piece = null;
      else {
        K.t += dt;
        const T = this.T.tileKick, k = ease(clamp(K.t / T.riseT, 0, 1)), bob = Math.sin(K.t * 10) * 0.04 * k;
        W?.carry?.(pc, K.x0 + (K.hx - K.x0) * k, 0.05 + (T.rise - 0.05) * k + bob, K.z0 + (K.hz - K.z0) * k, 0.3 * k, K.t * 3);
      }
    }
    // Stone Storm: a stagger before a throw drops what he holds; else the tiles hang round him, turning
    if (S.act && act !== S.act && S.hold.some((h) => h.piece && h.at < 0)) this._dropStorm(true);
    // (a storm that never lifted: its tiles were only chosen)
    else if (S.act && act !== S.act && !S.lifted) this._dropStorm(false);
    if (S.lifted) {
      S.t += dt;
      const T = this.T.stoneStorm, me = d.position, fx0 = Math.sin(d.yaw), fz0 = Math.cos(d.yaw);
      for (const h of S.hold) {
        const pc = h.piece;
        if (!pc) continue;
        if (pc.state !== HELD) {
          h.piece = null;
          continue;
        }
        h.t += dt;
        const sl = h.slot < 0 ? T.great : T.slots[h.slot % T.slots.length];
        const k = ease(clamp(h.t / T.liftT, 0, 1)), bob = Math.sin(h.t * 3 + h.slot) * 0.1 * k;
        // his frame: sl[0] to his left, sl[1] up, sl[2] forward
        const tx = me.x + fx0 * sl[2] + fz0 * sl[0], tz = me.z + fz0 * sl[2] - fx0 * sl[0];
        W?.carry?.(pc, h.x0 + (tx - h.x0) * k, 0.05 + (sl[1] - 0.05) * k + bob, h.z0 + (tz - h.z0) * k, 0.35 * k, h.t * (h.slot < 0 ? 0.8 : 1.6));
        if (this._l() < 0.25) this._burst(pc.px, pc.py - 0.2, pc.pz, 1, GRIT, GRIT_END, 0.8);
      }
      this._stormDue();
      if (!S.hold.some((h) => h.piece)) S.lifted = false;
    }
    // the tiles in the air: their handles retimed, grit off them, the flare on each lead s before it lands
    for (const R of this.fly) {
      if (!R.live) continue;
      const pc = R.piece;
      if (!pc || pc.state !== FLYING) {
        R.live = false;
        R.piece = null;
        R.h?.cancel?.();
        R.h = null;
        continue;
      }
      const left = pc.T - pc.t;
      R.h?.retime?.(Math.max(0, left));
      const y = Math.max(0.2, fin(pc.py, 1) + 0.15);
      if (this._l() < 0.5) this._burst(pc.px, y, pc.pz, 1, GRIT, GRIT_END, 1.5, -R.dx, -R.dz);
      if (!R.flashed && !R.quiet && left <= lead) {
        R.flashed = true;
        this._flare(R.attack, R.tell, pc.px, y + 0.2, pc.pz);
      }
    }
    this._lineFrame(dt, lead);
    this._quakeFrame(dt, lead);
  }

  // ------------------------------------------------------------------ cues and looks
  /** A thrown tile's flare, ON the tile: the cue the ledger, the HUD, the sound and the AI read. */
  _flare(attack, tell, x, y, z) {
    const f = this._tflash, d = this.d;
    f.attack = attack;
    f.tell = tell;
    f.x = x;
    f.y = y;
    f.z = z;
    d.emit('combat:flash', f);
    d.fx.tellFlash?.(tell, x, y, z, 1, true);
  }

  /** A red cue of his that lands away from him (a hazard): combat:tell + combat:flash, its flare at (x, y, z). */
  _cue(attack, x, y, z, impactIn) {
    const d = this.d, t = this._tell, f = this._flash;
    t.attack = attack;
    t.impactIn = impactIn;
    t.x = x;
    t.z = z;
    d.emit('combat:tell', t);
    f.attack = attack;
    f.x = x;
    f.y = y;
    f.z = z;
    d.emit('combat:flash', f);
    d.fx.tellFlash?.(TELL.RED, x, y, z, 1, true);
  }

  /** A little burst of grit / dust (glyph particles about a cell, the looks' own stream). */
  _burst(x, y, z, n, color, colorEnd, speed, dx = 0, dz = 0) {
    const fx = this.d.fx;
    if (!fx?._rec || !Number.isFinite(x + y + z)) return;
    for (let i = 0; i < n; i++) {
      const a = this._l() * TAU, sp = this._lr(0.4, 1) * speed;
      const o = fx._rec(x + this._lr(-0.25, 0.25), y + this._lr(-0.1, 0.2), z + this._lr(-0.25, 0.25), this._lr(0.35, 0.7), this._lr(0.16, 0.24), 0.06, ".,:'`", color, colorEnd);
      o.vx = Math.cos(a) * sp * 0.6 + dx * speed * 0.6;
      o.vy = this._lr(0.6, 2.4);
      o.vz = Math.sin(a) * sp * 0.6 + dz * speed * 0.6;
      o.drag = 1.6;
      o.gravity = -9;
      o.alpha = 0.9;
      fx._spawn(fx.alpha, o);
    }
  }
}
