import { TELL, RESULT } from '../../../combat/rules.js';
import { answerOf } from '../duelist/director.js';
import { RING } from '../../../world/skybreakRing.js';

// Tian Lei's ki, the things he throws and calls: blasts, the disc, bolts, called strikes, the volley
// from the air, the weather. THE SHOTS AGENT'S FILE (moves: moves/kiShots.js; numbers: tuningShots.js,
// d.T.shots).
//
// ki.js (KiMoves) routes here every engine hook of a beat or a move whose `ki` kind does NOT start with
// 'beam', and every unmarked `release` / `cast` beat (the routing contract: the top of ascendant.js).
// What flies is in the effects' pools (fx.shots: 'blast' / 'disc'; fx.strikes: called lightning), which
// the cue ledger reads by field name; what is planned but not yet thrown or called (Golden Rain's
// blasts still in his hands, the volley's strikes still to call) is told to the ledger with
// brain.expect() handles, and each throw or call asks brain.fairDelay() first. Nothing here reads
// Math.random or fx.rnd(): game rolls (a side, a scatter) come from this class's own seeded stream
// (`rand`, reseeded at each reset), look jitter from fx.lr().
//
// Public (other files call these):
//   returned(s)   a returnable blast struck back by a perfect parry reached him (fx.js calls it when the
//                 class has no onShotReturned): 50 damage, 34 posture, `dragon:returned`
//   discBack(s)   the disc is home in his hand (fx.js calls it when the class has no onShotBack)
//   corners()     ascend3's four bolts on the ring's corners (the class calls it as the ring goes out)

const TAU = Math.PI * 2;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
/** A small seeded stream (mulberry32): game rolls that must not touch the AI's Math.random. */
const stream = (seed) => {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.seed = (s) => (a = s >>> 0);
  return f;
};
const ATTACK = Object.freeze({ weather: 'thunderfall', corners: 'thunderCorners' });

export class ShotMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this._r = stream(0x51a7e);
    this._v = { x: 0, y: 0, z: 0 };
    this._w = { x: 0, y: 0, z: 0 };
    this.rain = { on: false, act: null, i: 0, n: 0, t: 0, gap: 0.16, wait: 0, base: 0, h: [], attack: '', damage: 0, kb: 0, tell: TELL.NORMAL };
    this.volley = { on: false, act: null, i: 0, n: 0, t: 0, h: [], attack: '', target: { x: 0, z: 0 } };
    this.sky = { t: 0, calls: 0, armed: false };
    this.corner = { left: 0, t: 0, i: 0 };
    this.stats = { blasts: 0, returned: 0, rainSkips: 0, rainHolds: 0, skyCalls: 0, skySkips: 0, volleyCalls: 0, volleySkips: 0, cage: 0, bolts: 0, boltReturns: 0, discs: 0 };
  }

  get T() {
    return this.d.T.shots;
  }

  rand(a = 0, b = 1) {
    return a + this._r() * (b - a);
  }

  /** A point kept on his floor (`pad` m inside his bound round the ring's centre). Writes it. */
  _clamp(m, pad = 0) {
    const B = Math.max(1, fin(this.d.bound, 16) - pad), r = Math.hypot(m.x, m.z);
    if (r > B) {
      m.x *= B / r;
      m.z *= B / r;
    }
    return m;
  }

  _hero() {
    const p = this.game.player;
    return p && p.alive !== false && p.position ? p : null;
  }

  /** Every reset of his (the duelist's reset, a death, the Lab): nothing of his left in the air. */
  reset() {
    this._r.seed(0x51a7e);
    this._stopRain();
    this._stopVolley();
    this.sky.t = this.T?.weather?.start ?? 3;
    this.sky.calls = 0;
    this.corner.left = 0;
  }

  /** Something of his is still in the air or lit (the tests wait for it; the director may read it). */
  get busy() {
    if (this.rain.on || this.volley.on || this.corner.left > 0) return true;
    for (const s of this.d.fx?.shots ?? []) if (s.alive && (s.kind === 'blast' || s.kind === 'disc')) return true;
    return false;
  }

  _discOut() {
    for (const s of this.d.fx?.shots ?? []) if (s.alive && s.kind === 'disc') return true;
    return false;
  }

  /** A move of this kind starts (brain.startAct → d.onActStart): false = it cannot start now. */
  begin(act) {
    const k = act?.def?.ki;
    if (k === 'disc' && this._discOut()) return false;
    if (k === 'rain' && this.rain.on) return false;
    if (k === 'volley' && this.volley.on) return false;
    return true;
  }

  /** His AI weighs a move of this kind (brain._choose → d.weigh): the weight it gets now (0 = not now). */
  weigh(def, w) {
    const k = def?.ki;
    if (k === 'disc' && this._discOut()) return 0;
    if ((k === 'rain' && this.rain.on) || (k === 'volley' && this.volley.on)) return 0;
    return w;
  }

  // ---------------------------------------------------------------- blasts (release beats)
  /** A `release` beat's impact: the blast(s) leave the striking palm at the hero. */
  onRelease(b, s, a) {
    const D = b.def, R = D.release ?? {}, d = this.d, fx = d.fx;
    if (!fx?.throwShot) return;
    const B = this.T.blast, p = d.tellPoint(D.part ?? 'fistR', d._v2 ?? new d.position.constructor());
    const ang = s ? s.ang : d.yaw, n = Math.max(1, R.count ?? 1), spread = R.spread ?? 0;
    // (out of the palm, but never further from his root than `from` m: a palm thrust inside a body)
    const ox = Number.isFinite(p.x) ? p.x : d.position.x + Math.sin(ang) * (R.from ?? 0.9);
    const oz = Number.isFinite(p.z) ? p.z : d.position.z + Math.cos(ang) * (R.from ?? 0.9);
    for (let i = 0; i < n; i++) {
      const a2 = ang + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      const dx = Math.sin(a2), dz = Math.cos(a2);
      fx.throwShot({
        kind: 'blast', x: ox, y: B.y, z: oz, dx, dz, speed: R.speed ?? 15, size: R.size ?? B.size, radius: R.radius ?? B.radius, life: B.life, range: B.range,
        tell: D.tell, damage: D.damage, knockback: D.knockback, attack: a?.name ?? 'blast', returnable: !!R.returnable, form: d.phase,
      });
      this.stats.blasts++;
    }
    fx.muzzle?.(ox, B.y, oz, Math.sin(ang), Math.cos(ang), R.size ?? 1, d.phase);
    this.game.shake?.(0.08);
  }

  /** A returnable blast came back into him (fx.js): the damage and the posture a perfect parry earns. */
  returned(s) {
    const d = this.d, P = this.T.spirit;
    if (!d || d.mode === 'dying' || d.mode === 'dead') return;
    const c = d._hs?.[1] ?? { x: d.position.x, y: 1.25, z: d.position.z };
    d.emit('dragon:returned', { kind: 2, damage: P.returnDamage, x: c.x, y: c.y, z: c.z });
    d.takeHit({ damage: P.returnDamage, exact: true, heavy: true, posture: P.returnPosture, part: 'body', point: { x: c.x, y: c.y, z: c.z } });
    this.stats.returned++;
  }

  /** The disc is home in his hand (fx.js): caught, a small flare of it on the palm. */
  discBack(s) {
    const d = this.d, fx = d.fx;
    const h = d.tellPoint?.('fistR', d._v2 ?? this._v) ?? d.position;
    fx?.muzzle?.(h.x, h.y, h.z, -fin(s?.dx), -fin(s?.dz, 1), 0.6, d.phase);
  }

  // ---------------------------------------------------------------- casts
  /** A `cast` beat's impact (d.onCast): the rain, the disc, the volley, the cage. */
  onCast(b, s, a) {
    const k = b.def.cast?.kind;
    if (k === 'rain') this._startRain(b, s, a);
    else if (k === 'disc') this._throwDisc(b, s, a);
    else if (k === 'volley') this._startVolley(b, s, a);
    else if (k === 'cage') this._cage(b, s, a);
  }

  // ---- Golden Rain
  _startRain(b, s, a) {
    const R = this.T.rain, d = this.d, Rn = this.rain;
    this._stopRain();
    Rn.on = true;
    Rn.act = a;
    Rn.i = 0;
    Rn.n = R.count;
    Rn.gap = R.dur / R.count;
    Rn.t = 0;
    Rn.wait = 0;
    Rn.base = s ? s.ang : d.yaw;
    Rn.attack = a?.name ?? 'goldenRain';
    Rn.damage = b.def.damage;
    Rn.kb = b.def.knockback;
    Rn.tell = b.def.tell;
    // the blasts still in his hands, told to the ledger (each handle is dropped as its blast leaves:
    // in the air, the predictor reads it from fx.shots)
    const fly = this._flight(R.speed);
    for (let i = 0; i < R.count; i++) Rn.h[i] = d.brain?.expect?.(i * Rn.gap + fly, Rn.tell, Rn.attack) ?? null;
  }

  _stopRain() {
    const Rn = this.rain;
    for (const h of Rn.h) h?.cancel?.();
    Rn.h.length = 0;
    Rn.on = false;
    Rn.act = null;
  }

  /** s for a blast at `speed` to reach the hero from where he stands. */
  _flight(speed) {
    const p = this._hero()?.position, d = this.d;
    if (!p) return 0.5;
    return Math.max(0, Math.hypot(p.x - d.position.x, p.z - d.position.z) - 1.4) / Math.max(1, speed);
  }

  _rainFrame(dt) {
    const Rn = this.rain, d = this.d, R = this.T.rain;
    if (!Rn.on) return;
    // (stopped by anything that ends the move: a stagger, a break, a parry's recoil, his death)
    if (d.mode !== 'act' || d.brain?.act !== Rn.act) return this._stopRain();
    Rn.t -= dt;
    if (Rn.t > 0) return;
    const i = Rn.i, pl = this._hero();
    const half = Rn.n / 2, k = i < half ? i / Math.max(1, half - 1) : 1 - (i - half) / Math.max(1, half - 1);
    // the fans sweep across the hero as he stands NOW: left to right, then back
    const base = pl ? Math.atan2(pl.position.x - d.position.x, pl.position.z - d.position.z) : Rn.base;
    const ang = base + (k - 0.5) * 2 * R.sweep;
    const fly = this._flight(R.speed);
    // the fairness guard: a blast that would land near a cue asking the other answer waits (a little)
    // or is not thrown
    const w = d.brain?.fairDelay?.(fly, Rn.tell, Math.max(0, R.hold - Rn.wait), Rn.attack) ?? 0;
    if (w > 0) {
      Rn.wait += w;
      Rn.t = w;
      this.stats.rainHolds++;
      return;
    }
    Rn.h[i]?.cancel?.();
    Rn.h[i] = null;
    if (w === 0) {
      const right = i % 2 === 0, side = right ? 'fistR' : 'fistL';
      const p = d.tellPoint(side, d._v2);
      const B = this.T.blast, x = fin(p?.x, d.position.x), z = fin(p?.z, d.position.z);
      d.fx.throwShot?.({ kind: 'blast', x, y: B.y, z, dx: Math.sin(ang), dz: Math.cos(ang), speed: R.speed, size: R.size, radius: B.radius, life: B.life, range: B.range, tell: Rn.tell, damage: Rn.damage, knockback: Rn.kb, attack: Rn.attack, form: d.phase });
      d.fx.muzzle?.(x, B.y, z, Math.sin(ang), Math.cos(ang), 0.6, d.phase);
      this.stats.blasts++;
    } else this.stats.rainSkips++;
    Rn.i++;
    Rn.wait = 0;
    Rn.t += Rn.gap;
    if (Rn.i >= Rn.n) this._stopRain();
  }

  // ---- Sun Wheel
  _throwDisc(b, s, a) {
    const D = this.T.disc, d = this.d, fx = d.fx;
    const ang = s ? s.ang : d.yaw, side = this.rand() < 0.5 ? -1 : 1;
    // (thrown out to a side: it curves back across, the turn far past the hero, home through him)
    const a0 = ang + side * 0.55;
    const h = d.tellPoint('fistR', d._v2);
    fx.throwShot?.({ kind: 'disc', x: fin(h?.x, d.position.x), y: 1.1, z: fin(h?.z, d.position.z), dx: Math.sin(a0), dz: Math.cos(a0), speed: D.speed, back: D.back, range: D.range, curve: -side * D.curve, hang: D.hang, radius: D.radius, tell: b.def.tell, damage: b.def.damage, knockback: b.def.knockback, attack: a?.name ?? 'sunWheel', form: d.phase });
    this.stats.discs++;
  }

  // ---- Heaven's Volley
  _startVolley(b, s, a) {
    const V = this.T.volley, Vo = this.volley, d = this.d;
    this._stopVolley();
    Vo.on = true;
    Vo.act = a;
    Vo.i = 0;
    Vo.n = V.count;
    Vo.t = 0;
    Vo.attack = a?.name ?? 'skyVolley';
    for (let i = 0; i < V.count; i++) Vo.h[i] = d.brain?.expect?.(i * V.gap + V.warn, TELL.RED, Vo.attack) ?? null;
  }

  _stopVolley() {
    const Vo = this.volley;
    for (const h of Vo.h) h?.cancel?.();
    Vo.h.length = 0;
    Vo.on = false;
    Vo.act = null;
  }

  _volleyFrame(dt) {
    const Vo = this.volley, d = this.d, V = this.T.volley;
    if (!Vo.on) return;
    if (d.mode !== 'act' || d.brain?.act !== Vo.act) return this._stopVolley();
    Vo.t -= dt;
    if (Vo.t > 0) return;
    const pl = this._hero();
    Vo.h[Vo.i]?.cancel?.();
    Vo.h[Vo.i] = null;
    if (pl) {
      // round where he is and is heading: the first on him, the rest scattered round his way
      const p = pl.position, vx = fin(pl.vel?.x), vz = fin(pl.vel?.z);
      const j = Vo.i === 0 ? 0 : V.scatter, a = this.rand(0, TAU), r = Math.sqrt(this.rand()) * j;
      const m = { x: p.x + vx * V.lead + Math.cos(a) * r, z: p.z + vz * V.lead + Math.sin(a) * r };
      this._clamp(m, 0.6);
      if ((d.brain?.fairDelay?.(V.warn, TELL.RED, 0, Vo.attack) ?? 0) === 0 && d.fx.callStrike?.(m.x, m.z, V.radius, V.warn, { damage: V.damage, knockback: V.knockback, attack: Vo.attack, style: 'bolt' })) this.stats.volleyCalls++;
      else this.stats.volleySkips++;
      // (a stroke of light from his raised hands down to the mark)
      const h = d._hs?.[0];
      if (h) d.fx.arc?.(h.x, h.y + 0.4, h.z, m.x, 1.5, m.z, 0.26, null, null, 6);
    }
    Vo.i++;
    Vo.t += V.gap;
    if (Vo.i >= Vo.n) {
      Vo.on = false;
      Vo.act = null;
    }
  }

  // ---- Storm Cage
  _cage(b, s, a) {
    const C = this.T.cage, d = this.d, pl = this._hero();
    if (!pl) return;
    const p = pl.position;
    // the gap: the side of the hero away from him
    const away = Math.atan2(p.x - d.position.x, p.z - d.position.z);
    const span = TAU - C.open, sense = this.rand() < 0.5 ? 1 : -1;
    for (let i = 0; i < C.count; i++) {
      // (round from one lip of the gap to the other; each flies in on its turn, in order round)
      const ang = away + C.open / 2 + span * ((i + 0.5) / C.count);
      const k = sense > 0 ? i : C.count - 1 - i;
      const x = p.x + Math.sin(ang) * C.r, z = p.z + Math.cos(ang) * C.r;
      d.fx.throwShot?.({ kind: 'blast', x, y: 1.2, z, dx: -Math.sin(ang), dz: -Math.cos(ang), speed: C.speed, size: C.size, radius: C.radius, life: 2.5, range: C.r + 4, delay: C.first + k * C.gap, tell: TELL.RED, damage: b.def.damage, knockback: b.def.knockback, attack: a?.name ?? 'stormCage', form: d.phase });
    }
    this.stats.cage++;
    this.game.shake?.(0.15);
  }

  // ---------------------------------------------------------------- bolts and the dive (zone beats)
  /** A routed beat's impact, its first frame: a bolt's lightning; the dive's crater. */
  onImpact(b, s, a) {
    const D = b.def, d = this.d, fx = d.fx;
    if (D.ki === 'bolt') {
      const h = d.tellPoint(D.part ?? 'fistR', d._v2), hx = h.x, hy = h.y, hz = h.z;
      const pl = this._hero(), inLine = !!s && d.brain._inZone(D.zone, s);
      if (inLine && b.cover) fx.lightning?.(hx, hy, hz, b.cover.x, Math.min(1.4, (b.cover.h ?? 2) * 0.6), b.cover.z, 1.1, true);
      else if (inLine && pl?.getChestPos) {
        const c = pl.getChestPos(this._v, true);
        fx.lightning?.(hx, hy, hz, c.x, c.y, c.z, 1.1, true);
      } else {
        const r = D.zone.r * 0.85;
        fx.lightning?.(hx, hy, hz, d.position.x + Math.sin(d.yaw) * r, 0.5, d.position.z + Math.cos(d.yaw) * r, 1.1, true);
      }
      this.stats.bolts++;
      d.emit('dragon:explosion', { x: hx, z: hz, radius: 2 });
    } else if (D.dive) {
      const x = d.position.x, z = d.position.z, r = D.zone?.r ?? 2.8;
      fx.crater?.(x, z, r * 0.7, 1.6);
      fx.auraBurst?.(x, z, r * 1.1, d.phase);
      this.game.shake?.(0.45);
      this.game.world?.impact?.(x, z, r * 0.8, this.T.world.dive, { kind: 'blunt', by: 'boss' });
      this.game.world?.forest?.ambience?.flare?.(0.6);
      d.emit('dragon:land', { x, z });
    }
  }

  /** Every frame of a routed beat (d.beatMotion; u 0..1 the windup, 1..2 the active frames): the dive
   *  carries him across to where the hero is (the spot fixed at u 0.7: the roll that answers it). */
  motion(b, u, s) {
    const D = b.def, d = this.d;
    if (!D.dive) return;
    const V = this.volley;
    if (!b._dive) b._dive = { x: d.position.x, z: d.position.z, tx: d.position.x, tz: d.position.z };
    const J = b._dive;
    if (s && u < 0.7) {
      J.tx = s.p.x;
      J.tz = s.p.z;
      const t = (V.target ??= { x: 0, z: 0 });
      t.x = J.tx;
      t.z = J.tz;
      this._clamp(t, 0.5);
      J.tx = t.x;
      J.tz = t.z;
    }
    const k = clamp((u - 0.35) / 0.65, 0, 1), e = k * k * (3 - 2 * k);
    d.position.x = J.x + (J.tx - J.x) * e;
    d.position.z = J.z + (J.tz - J.z) * e;
    if (u < 1 && Math.hypot(J.tx - J.x, J.tz - J.z) > 0.2) d.yaw = Math.atan2(J.tx - J.x, J.tz - J.z);
  }

  /** A `sustain` beat's tick: none of the shots' beats sustains. */
  onSustain() {}

  /** A routed beat's blow met the hero: a bolt struck back by a perfect parry hits him. */
  onHit(o, r) {
    const D = o?.beat?.def, d = this.d, pl = this.game.player;
    if (D?.ki !== 'bolt' || r !== RESULT.PARRIED || !pl?.deflect?.perfect || d.mode === 'dying' || d.mode === 'dead') return;
    const B = this.T.bolt, c = d._hs?.[1];
    if (!c) return;
    if (pl.getChestPos) {
      const v = pl.getChestPos(this._v, true);
      d.fx.lightning?.(v.x, v.y, v.z, c.x, c.y, c.z, 1.2, true, true);
    }
    d.emit('dragon:returned', { kind: 1, damage: B.returnDamage, x: c.x, y: c.y, z: c.z });
    d.takeHit({ damage: B.returnDamage, exact: true, heavy: true, posture: B.returnPosture, part: 'body', point: { x: c.x, y: c.y, z: c.z } });
    this.stats.boltReturns++;
  }

  /** The blade lock ended while a move of this kind started it: none of the shots' moves locks. */
  lockEnd() {
    return false;
  }

  // ---------------------------------------------------------------- the weather (Thunderfall)
  _skyOn() {
    const d = this.d, W = this.T.weather;
    if (!(d.phase >= W.form) || !d.brain?.aiEnabled || d._changing || d.broken) return false;
    if (d.mode !== 'foot' && d.mode !== 'act' && d.mode !== 'react') return false;
    if (d.brain.act?.def?.transition && d.mode === 'act') return false;
    const st = this.game.state;
    return !!this._hero() && (st === undefined || st === 'boss');
  }

  _skyFrame(dt) {
    const W = this.T.weather, d = this.d, Sk = this.sky;
    if (!this._skyOn()) return;
    Sk.t -= dt;
    if (Sk.t > 0) return;
    let live = 0;
    for (const s of d.fx.strikes ?? []) if (s.alive && s.attack === ATTACK.weather) live++;
    if (live >= W.maxLive) {
      Sk.t = W.retry;
      return;
    }
    const T = this._skySlot(W.warn, W.slack);
    if (T < 0) {
      Sk.t = W.retry * 0.5;
      this.stats.skySkips++;
      return;
    }
    const pl = this._hero(), p = pl.position;
    const a = this.rand(0, TAU), r = Math.sqrt(this.rand()) * W.scatter;
    const m = { x: p.x + fin(pl.vel?.x) * W.lead + Math.cos(a) * r, z: p.z + fin(pl.vel?.z) * W.lead + Math.sin(a) * r };
    this._clamp(m, 0.6);
    if (d.fx.callStrike?.(m.x, m.z, W.radius, T, { damage: W.damage, knockback: W.knockback, attack: ATTACK.weather, style: 'bolt' })) {
      this.stats.skyCalls++;
      Sk.calls++;
    }
    const miss = 1 - clamp(d.hp / Math.max(1, d.maxHp), 0, 1);
    Sk.t = lerp(W.gap[0], W.gap[1], miss) * this.rand(0.85, 1.15);
  }

  /** The first landing time from `warn` s on (up to `slack` more) clear of his own blows and of every
   *  known impact asking a guard; -1 if none. Never in the hero's opening: his stagger, a recoil, a
   *  break, a transformation (the weather waits until he moves again). */
  _skySlot(warn, slack) {
    const d = this.d, br = d.brain, a = br.act;
    if (d.state === 'staggered' || d.broken) return -1;
    if (d.mode === 'react') return -1; // (his recoil, the reeling, a flinch: the hero's own time)
    const inAct = d.mode === 'act' && !!a;
    if (inAct && a.def.transition) return -1;
    const last = inAct ? a.end - a.t - this.T.weather.inString : Infinity;
    for (let e = 0; e <= slack + 1e-6; e += 0.05) {
      const T = warn + e;
      if (T > last) break;
      if (!this._clearOfAct(T, TELL.RED)) continue;
      if ((br.fairDelay?.(T, TELL.RED, 0, ATTACK.weather) ?? 0) !== 0) continue;
      return T;
    }
    return -1;
  }

  /** No blow of the running move asking the other answer lands within the guard's `sep` of T. */
  _clearOfAct(T, tell, pad = 0) {
    const d = this.d, br = d.brain, a = br?.act;
    if (d.mode !== 'act' || !a) return true;
    const G = d.T.pressure?.guard ?? {}, sep = (G.sep ?? 0.3) + (G.margin ?? 0) + 0.04 + pad, ans = answerOf(tell);
    for (const b of a.beats) {
      if (b.feint || b.done) continue;
      if (b.def.cast && !b.def.release) continue;
      if (answerOf(b.def.tell) === ans) continue;
      let t = b.impact - a.t;
      if (b.def.release) t += fin(br.ledger?.travel?.(b), 0);
      if (Math.abs(t - T) < sep) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- ascend3: the four corners
  /** Four bolts on the ring's corners, `gap` s apart (the class calls it as ascend3's ring goes out). */
  corners() {
    this.corner.left = (RING?.corners?.length ?? 0) | 0;
    this.corner.i = 0;
    this.corner.t = 0;
  }

  _cornerFrame(dt) {
    const Cn = this.corner, d = this.d, C = this.T.corners;
    if (!(Cn.left > 0)) return;
    Cn.t -= dt;
    if (Cn.t > 0) return;
    const c = RING.corners[Cn.i % RING.corners.length];
    Cn.i++;
    Cn.left--;
    Cn.t = C.gap;
    if (!c) return;
    const x = c[0], z = c[1], pl = this._hero();
    if (pl && Math.hypot(pl.position.x - x, pl.position.z - z) < C.r) {
      // the hero stands on it: a strike with its ring and its cue
      if ((d.brain?.fairDelay?.(C.warn, TELL.RED, 0.6, ATTACK.corners) ?? 0) >= 0) d.fx.callStrike?.(x, z, C.r, C.warn, { damage: C.damage, knockback: C.knockback, attack: ATTACK.corners, style: 'bolt' });
    } else {
      // harmless: the bolt only, the corner scorched and struck
      d.fx.lightning?.(x + this.rand(-1, 1), 12, z + this.rand(-1, 1), x, 0.1, z, 2.0, true);
      d.fx.ringPulse?.(x, z, 1.6);
      this.game.world?.scorch?.burnCircle?.(x, z, 1.2, 0.3, 0.2);
      this.game.world?.impact?.(x, z, 1.4, this.T.world.corner, { kind: 'blast', by: 'boss' });
      this.game.shake?.(0.12);
    }
  }

  // ---------------------------------------------------------------- every frame
  /** Every frame, after the brain (d.brainFrame). */
  frame(dt) {
    if (!(dt > 0)) return;
    try {
      this._rainFrame(dt);
      this._volleyFrame(dt);
      this._skyFrame(dt);
      this._cornerFrame(dt);
    } catch (e) {
      // never freeze the frame
      this._stopRain();
      this._stopVolley();
      if (!this._warned) {
        this._warned = true;
        console.warn('ascendant shots:', e);
      }
    }
  }
}
