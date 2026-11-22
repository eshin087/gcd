import { TELL, RESULT } from '../../../combat/rules.js';
import { CONFIG } from '../../../core/config.js';
import { answerOf } from '../duelist/director.js';
import { RING } from '../../../world/skybreakRing.js';
import { FORM_POSES } from './poses.js';
import { MOVES } from './moves.js';

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
//   lanternMet(s, r)  the great orb met the hero (fx.js, with his RESULT): the push, a burst or a pass
//   lantern       { on, phase: 'off' | 'gather' | 'fly' | 'push' | 'back', s (the orb's fx.shots record) }
//
// THE THIRD WAVE (BRIEF3 "ki"):
//   Heaven's Lantern ('lantern'): the gather (motion: fx.lanternGather over his raised palms, the ring's
//     light dimmed, the ledger told at the move's start and retimed), the throw (onCast: one 'blast'
//     record with `lantern: true`, descending `yTo`, aimed where the hero will be, no homing), and what
//     meets the hero (lanternMet): a PERFECT parry starts THE PUSH (brain.startLock at range, as the
//     beam's clash: fx.lanternClash each frame; lockEnd(won): won = the orb flies back into him through
//     fx.js's return path (returned(s): T.lantern.returnDamage / returnPosture, he reels T.lantern.reel
//     s), lost = it bursts on the hero); a plain parry or a block bursts it on the guard; a roll passes
//     it (it bursts on the floor beyond). While it is out nothing else of his starts (begin / weigh for
//     his ki moves; his move is held at its landing until the orb has met the hero) and the weather
//     stands down.
//   Raining Suns ('barrage'): Golden Rain's pour generalised (_startRain with options: count, dur,
//     aim 'fan' | 'hero', speed, size, hold, from the hands' height and falling to `yTo`), then a
//     returnable blast thrown down from the air (a `release` with `air` / `yTo`).

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
const ease = (u) => u * u * (3 - 2 * u);

/** The clip he holds THE PUSH in (both palms thrust against the orb), compiled round each form's
 *  stance once (kiBeam.js clashClip's recipe). */
let PUSH_CLIPS = null;
function pushClip(form) {
  if (!PUSH_CLIPS) {
    const pose = MOVES.skyLantern?.pushPose;
    PUSH_CLIPS = pose ? FORM_POSES.map((P) => {
      const c = P.compileClip([{ t: 0, ...pose }, { t: 4, ...pose }], 4, { hold: true });
      c.name = 'lanternPush';
      return c;
    }) : [];
  }
  return PUSH_CLIPS[clamp(form | 0, 1, Math.max(1, PUSH_CLIPS.length)) - 1] ?? null;
}

export class ShotMoves {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this._r = stream(0x51a7e);
    this._v = d.position?.clone?.() ?? { x: 0, y: 0, z: 0 }; // (a Vector3: player.getChestPos writes into it)
    this.rain = { on: false, act: null, i: 0, n: 0, t: 0, gap: 0.16, wait: 0, base: 0, h: [], attack: '', damage: 0, kb: 0, tell: TELL.NORMAL };
    this.volley = { on: false, act: null, i: 0, n: 0, t: 0, h: [], attack: '', target: { x: 0, z: 0 } };
    this.sky = { t: 0, calls: 0, armed: false };
    this.corner = { left: 0, t: 0, i: 0 };
    this.ret = { at: -99, n: 0 }; // (the returns' cap: returns close together are worth less each)
    this.stats = { blasts: 0, returned: 0, rainSkips: 0, rainHolds: 0, skyCalls: 0, skySkips: 0, volleyCalls: 0, volleySkips: 0, cage: 0, bolts: 0, boltReturns: 0, discs: 0,
      lanterns: 0, lanternHits: 0, lanternBlocked: 0, lanternPassed: 0, pushes: 0, pushWon: 0, pushLost: 0, lanternReturns: 0, suns: 0, sunsSkips: 0, sunsHolds: 0 };
    // Heaven's Lantern: the orb from its gather to its end (s: its fx.shots record, lid: its stamp)
    this.lantern = { on: false, phase: 'off', act: null, s: null, lid: 0, h: null, t: 0, x: 0, y: 0, z: 0 };
    this._lid = 0;
    this._reel = 0; // s he is still held reeling after a won push
    this._sunsR = null; // (Raining Suns' pour: T.barrage as _startRain's options, built once)
    this._sunsOf = null;
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
    this.ret.at = -99;
    this.ret.n = 0;
    this._lanternOff();
    this._reel = 0;
  }

  /** What a perfect return is worth now (x of its damage and posture): the first in full, each one
   *  within `T.returns.window` s of the one before worth `T.returns.decay` x less (Lightning Lance's four bolts
   *  return 50 + 25 + 13 + 6, not 4 x 50: the tuning pass's cap). */
  _returnScale() {
    const R = this.T.returns ?? {}, now = this.game.time ?? 0;
    this.ret.n = now - this.ret.at <= (R.window ?? 3) ? this.ret.n + 1 : 0;
    this.ret.at = now;
    return Math.pow(R.decay ?? 1, this.ret.n);
  }

  /** Something of his is still in the air or lit (the tests wait for it; the director may read it). */
  get busy() {
    if (this.rain.on || this.volley.on || this.corner.left > 0 || this.lantern.on) return true;
    for (const s of this.d.fx?.shots ?? []) if (s.alive && (s.kind === 'blast' || s.kind === 'disc')) return true;
    return false;
  }

  /** The great orb is gathering, out, held in the push or flying back (nothing else of his starts). */
  get lanternOut() {
    return this.lantern.on;
  }

  _discOut() {
    for (const s of this.d.fx?.shots ?? []) if (s.alive && s.kind === 'disc') return true;
    return false;
  }

  /** A move of this kind starts (brain.startAct → d.onActStart): false = it cannot start now. */
  begin(act) {
    const k = act?.def?.ki;
    if (this.lantern.on) return false; // (the great orb is his attack while it is out)
    if (k === 'disc' && this._discOut()) return false;
    if ((k === 'rain' || k === 'barrage') && this.rain.on) return false;
    if (k === 'volley' && this.volley.on) return false;
    if (k === 'lantern') this._lanternBegin(act);
    return true;
  }

  /** His AI weighs a move of this kind (brain._choose → d.weigh): the weight it gets now (0 = not now). */
  weigh(def, w) {
    const k = def?.ki;
    if (this.lantern.on) return 0;
    if (k === 'disc' && this._discOut()) return 0;
    if (((k === 'rain' || k === 'barrage') && this.rain.on) || (k === 'volley' && this.volley.on)) return 0;
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
    // (thrown down from the air (`air`): it leaves the palm where it is and falls to `yTo` m at the hero)
    const air = !!R.air && Number.isFinite(R.yTo), hp = this._hero()?.position;
    const oy = air ? clamp(fin(p.y, B.y), B.y, 8) : B.y;
    const yLen = air && hp ? Math.max(1, Math.hypot(hp.x - ox, hp.z - oz)) : undefined;
    for (let i = 0; i < n; i++) {
      const a2 = ang + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      const dx = Math.sin(a2), dz = Math.cos(a2);
      fx.throwShot({
        kind: 'blast', x: ox, y: oy, z: oz, dx, dz, speed: R.speed ?? 15, size: R.size ?? B.size, radius: R.radius ?? B.radius, life: B.life, range: B.range,
        tell: D.tell, damage: D.damage, knockback: D.knockback, attack: a?.name ?? 'blast', returnable: !!R.returnable, form: d.phase,
        ...(air ? { yTo: R.yTo, yLen: yLen ?? 10 } : null),
      });
      this.stats.blasts++;
    }
    fx.muzzle?.(ox, oy, oz, Math.sin(ang), Math.cos(ang), R.size ?? 1, d.phase);
    this.game.shake?.(0.08);
  }

  /** A returnable blast came back into him (fx.js): the damage and the posture a perfect parry earns. */
  returned(s) {
    const d = this.d, P = this.T.spirit;
    if (!d || d.mode === 'dying' || d.mode === 'dead') return;
    if (s?.lantern) return this._lanternReturned(s);
    const c = d._hs?.[1] ?? { x: d.position.x, y: 1.25, z: d.position.z };
    const k = this._returnScale();
    d.emit('dragon:returned', { kind: 2, damage: P.returnDamage * k, x: c.x, y: c.y, z: c.z });
    d.takeHit({ damage: P.returnDamage * k, exact: true, heavy: true, posture: P.returnPosture * k, part: 'body', point: { x: c.x, y: c.y, z: c.z } });
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
    else if (k === 'barrage') this._startRain(b, s, a, this._suns(), 'suns');
    else if (k === 'lantern') this._throwLantern(b, s, a);
    else if (k === 'disc') this._throwDisc(b, s, a);
    else if (k === 'volley') this._startVolley(b, s, a);
    else if (k === 'cage') this._cage(b, s, a);
  }

  /** Raining Suns' pour as _startRain's options (T.barrage, aimed at the hero, from the air). */
  _suns() {
    const BA = this.T.barrage;
    if (this._sunsOf !== BA) {
      this._sunsOf = BA;
      this._sunsR = { ...BA, aim: 'hero', air: true, sweep: 0 };
    }
    return this._sunsR;
  }

  // ---- Golden Rain (and Raining Suns: the same pour with other options)
  /** Pour R.count blasts out through the beat's active frames (R: T.rain, Golden Rain's fans, or
   *  Raining Suns' options: aim 'hero' (each at where the hero is, led `lead` s, scattered `scatter`
   *  m), `air` (from the palms where they are, falling to `yTo` m at the hero)). `key`: its stats. */
  _startRain(b, s, a, R = this.T.rain, key = 'rain') {
    const d = this.d, Rn = this.rain;
    this._stopRain();
    Rn.on = true;
    Rn.R = R;
    Rn.key = key;
    Rn.act = a;
    Rn.i = 0;
    Rn.n = R.count;
    Rn.gap = R.dur / R.count;
    Rn.t = 0;
    Rn.wait = 0;
    Rn.base = s ? s.ang : d.yaw;
    Rn.attack = a?.name ?? (key === 'suns' ? 'rainingSuns' : 'goldenRain');
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
    const Rn = this.rain, d = this.d, R = Rn.R ?? this.T.rain, suns = Rn.key === 'suns';
    if (!Rn.on) return;
    // (stopped by anything that ends the move: a stagger, a break, a parry's recoil, his death)
    if (d.mode !== 'act' || d.brain?.act !== Rn.act) return this._stopRain();
    Rn.t -= dt;
    if (Rn.t > 0) return;
    const i = Rn.i, pl = this._hero();
    const half = Rn.n / 2, k = i < half ? i / Math.max(1, half - 1) : 1 - (i - half) / Math.max(1, half - 1);
    // the fans sweep across the hero as he stands NOW: left to right, then back
    const base = pl ? Math.atan2(pl.position.x - d.position.x, pl.position.z - d.position.z) : Rn.base;
    let ang = base + (k - 0.5) * 2 * (R.sweep ?? 0);
    const fly = this._flight(R.speed);
    // the fairness guard: a blast that would land near a cue asking the other answer waits (a little)
    // or is not thrown
    const w = d.brain?.fairDelay?.(fly, Rn.tell, Math.max(0, R.hold - Rn.wait), Rn.attack) ?? 0;
    if (w > 0) {
      Rn.wait += w;
      Rn.t = w;
      if (suns) this.stats.sunsHolds++;
      else this.stats.rainHolds++;
      return;
    }
    Rn.h[i]?.cancel?.();
    Rn.h[i] = null;
    if (w === 0) {
      const right = i % 2 === 0, side = right ? 'fistR' : 'fistL';
      const p = d.tellPoint(side, d._v2);
      const B = this.T.blast, x = fin(p?.x, d.position.x), z = fin(p?.z, d.position.z);
      // (from the air: out of the palm where it is, falling to `yTo` m where it is aimed)
      const air = !!R.air && Number.isFinite(R.yTo), y = air ? clamp(fin(p?.y, B.y), B.y, 8) : B.y;
      let yLen;
      if (R.aim === 'hero' && pl) {
        // at where the hero IS (led `lead` s along his way), a little scatter; all but every
        // `direct`-th land beside him (off to his sides, `side` m: the floor round him pocked, the guard
        // that holds through them all not worn through)
        const q = pl.position, a = this.rand(0, TAU), r = Math.sqrt(this.rand()) * (R.scatter ?? 0);
        let tx = q.x + fin(pl.vel?.x) * (R.lead ?? 0) + Math.cos(a) * r, tz = q.z + fin(pl.vel?.z) * (R.lead ?? 0) + Math.sin(a) * r;
        const S = R.side, direct = Math.max(1, R.direct ?? 1);
        if (S && i % direct !== 0) {
          const c = this._dir(x, z, tx, tz), sd = this.rand() < 0.5 ? -1 : 1, off = this.rand(S[0], S[1]), tw = this.rand(-0.5, 0.5);
          const ox = -c.z * sd, oz = c.x * sd; // (across the line: never on the hero's way)
          tx += (ox * Math.cos(tw) + c.x * Math.sin(tw)) * off;
          tz += (oz * Math.cos(tw) + c.z * Math.sin(tw)) * off;
        }
        if (Math.hypot(tx - x, tz - z) > 0.3) ang = Math.atan2(tx - x, tz - z);
        yLen = Math.max(1, Math.hypot(tx - x, tz - z));
      } else if (air) yLen = pl ? Math.max(1, Math.hypot(pl.position.x - x, pl.position.z - z)) : 10;
      d.fx.throwShot?.({ kind: 'blast', x, y, z, dx: Math.sin(ang), dz: Math.cos(ang), speed: R.speed, size: R.size, radius: B.radius, life: B.life, range: B.range, tell: Rn.tell, damage: Rn.damage, knockback: Rn.kb, attack: Rn.attack, form: d.phase,
        ...(air ? { yTo: R.yTo, yLen } : null) });
      d.fx.muzzle?.(x, y, z, Math.sin(ang), Math.cos(ang), 0.6, d.phase);
      this.stats.blasts++;
      if (suns) this.stats.suns++;
    } else if (suns) this.stats.sunsSkips++;
    else this.stats.rainSkips++;
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
      const fd = d.brain?.fairDelay?.(V.warn, TELL.RED, 0, Vo.attack) ?? 0;
      if (fd === 0 && d.fx.callStrike?.(m.x, m.z, V.radius, V.warn, { damage: V.damage, knockback: V.knockback, attack: Vo.attack, style: 'bolt' })) this.stats.volleyCalls++;
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
    const group = 0xca9e + this.stats.cage; // (one knockdown and the rest of the cage passes: fx.js)
    for (let i = 0; i < C.count; i++) {
      // (round from one lip of the gap to the other; each flies in on its turn, in order round)
      const ang = away + C.open / 2 + span * ((i + 0.5) / C.count);
      const k = sense > 0 ? i : C.count - 1 - i;
      const x = p.x + Math.sin(ang) * C.r, z = p.z + Math.cos(ang) * C.r;
      d.fx.throwShot?.({ kind: 'blast', x, y: 1.2, z, dx: -Math.sin(ang), dz: -Math.cos(ang), speed: C.speed, size: C.size, radius: C.radius, life: 2.5, range: C.r + 4, delay: C.first + k * C.gap, tell: TELL.RED, damage: b.def.damage, knockback: b.def.knockback, attack: a?.name ?? 'stormCage', form: d.phase, group });
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
  motion(b, u, s, dt) {
    const D = b.def, d = this.d;
    if (D.cast?.kind === 'lantern') return this._lanternMotion(b, u, s, dt);
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
    const k = this._returnScale();
    d.emit('dragon:returned', { kind: 1, damage: B.returnDamage * k, x: c.x, y: c.y, z: c.z });
    d.takeHit({ damage: B.returnDamage * k, exact: true, heavy: true, posture: B.returnPosture * k, part: 'body', point: { x: c.x, y: c.y, z: c.z } });
    this.stats.boltReturns++;
  }

  /** The blade lock ended (d.onLockEnd): THE PUSH is the shots' only lock (Heaven's Lantern). True =
   *  handled here. Won: the orb flies back into him (fx.js's return path → returned(s)) and he reels;
   *  lost: it bursts on the hero (T.lantern.lose: knockdown, thrown). */
  lockEnd(won) {
    const L = this.lantern, d = this.d, s = L.s, LA = this.T.lantern;
    if (!L.on || L.phase !== 'push') return false;
    const live = this._mine(s);
    if (d.mode === 'dying' || d.mode === 'dead' || !live) {
      if (live) d.fx.lanternBurst?.(s, 'guard');
      this._lanternOff();
      return true;
    }
    if (won) {
      this.stats.pushWon++;
      L.phase = 'back';
      s.phase = 'fly';
      s.returned = true;
      s.done = true;
      s.age = 0;
      s.speed = LA.returnSpeed;
      const c = this._dir(s.x, s.z, d.position.x, d.position.z);
      d.fx.muzzle?.(s.x, s.y, s.z, c.x, c.z, 1.4, Math.max(2, d.phase));
      d.hitstop?.(0.1, 0.05);
      d._cinematic?.('bladeLock');
      this.game.world?.forest?.ambience?.flare?.(1);
      this.game.shake?.(0.5);
      // (thrown back off the push: he reels while it comes; the orb's blow holds the reel on: returned)
      if (!d.broken && d.mode !== 'broken') {
        d.emit?.('dragon:stagger');
        if (d.brain.startReact?.('reeling')) this._reel = LA.reel + 1;
      }
      return true;
    }
    // lost: it breaks through the blade and bursts on the hero
    this.stats.pushLost++;
    const pl = this._hero(), px = pl ? pl.position.x : s.x, pz = pl ? pl.position.z : s.z;
    d.hitPlayer({
      damage: LA.lose.damage, knockback: LA.lose.knockback, knockdown: true, kind: 'blast', tell: TELL.RED, attack: L.attack || 'skyLantern',
      from: { x: d.position.x, z: d.position.z }, projectile: true, parryable: false, blockable: false, extra: { perfect: false },
    });
    d.fx.lanternBurst?.(s, 'lost', px, pz);
    this.game.shake?.(0.55);
    this._lanternOff();
    d.brain._toFoot?.(0.5);
    return true;
  }

  // ---------------------------------------------------------------- Heaven's Lantern
  /** The move starts (begin): the orb's blow told to the ledger from now (retimed through the gather). */
  _lanternBegin(act) {
    const L = this.lantern, d = this.d, b = act?.beats?.[0];
    this._lanternOff();
    L.on = true;
    L.phase = 'gather';
    L.act = act;
    L.attack = act?.name ?? 'skyLantern';
    L.t = 0;
    const T0 = fin(b?.impact, this.T.lantern.windup) + this._lanternFlight();
    L.h = d.brain?.expect?.(T0, b?.def?.tell ?? TELL.BLUE, L.attack) ?? null;
    this.stats.lanterns++;
  }

  /** s for the orb to reach the hero once thrown (its speed, its radius). */
  _lanternFlight() {
    const p = this._hero()?.position, d = this.d, LA = this.T.lantern;
    if (!p) return 1;
    return Math.max(0, Math.hypot(p.x - d.position.x, p.z - d.position.z) - LA.radius - 0.45) / Math.max(1, LA.speed);
  }

  /** Where the orb gathers: over his raised palms (writes L.x / y / z). */
  _lanternAt() {
    const d = this.d, L = this.lantern, LA = this.T.lantern;
    const p = d.tellPoint?.('palms', d._v2 ?? this._v);
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    L.x = fin(p?.x, d.position.x) + fx * 0.2;
    L.z = fin(p?.z, d.position.z) + fz * 0.2;
    L.y = Math.max(fin(p?.y, LA.y) + 0.9, 1.6);
    return L;
  }

  /** Every frame of the gather (u 0..1; the active frames: nothing): the orb over his palms, the ring's
   *  light pulled down, the ledger's handle retimed. */
  _lanternMotion(b, u, s, dt) {
    const L = this.lantern, d = this.d, LA = this.T.lantern;
    if (!(u < 1) || L.phase !== 'gather') return;
    this._lanternAt();
    d.fx.lanternGather?.(L.x, L.y, L.z, u, fin(dt, 0), d.phase);
    this.game.world?.forest?.ambience?.dim?.(ease(clamp(u * 1.2, 0, 1)) * LA.dim);
    const a = d.brain?.act;
    if (L.h && a) L.h.retime?.(Math.max(0, b.impact - a.t) + this._lanternFlight());
  }

  /** The impact (onCast): the orb is thrown at where the hero will be `lead` s on; no homing. */
  _throwLantern(b, s, a) {
    const L = this.lantern, d = this.d, LA = this.T.lantern, fx = d.fx;
    if (!L.on || L.phase !== 'gather') this._lanternBegin(a); // (a Lab start mid-move)
    L.h?.cancel?.();
    L.h = null;
    this._lanternAt();
    const pl = this._hero();
    let tx = d.position.x + Math.sin(d.yaw) * 8, tz = d.position.z + Math.cos(d.yaw) * 8;
    if (pl) {
      tx = pl.position.x + fin(pl.vel?.x) * LA.lead;
      tz = pl.position.z + fin(pl.vel?.z) * LA.lead;
    }
    const c = this._dir(L.x, L.z, tx, tz), dist = Math.max(1, Math.hypot(tx - L.x, tz - L.z));
    const y = Math.max(L.y, LA.y);
    const shot = fx?.throwShot?.({
      kind: 'blast', lantern: true, x: L.x, y, z: L.z, dx: c.x, dz: c.z, speed: LA.speed, size: LA.size, radius: LA.radius,
      life: LA.range / Math.max(1, LA.speed) + 1, range: LA.range, yTo: LA.yTo, yLen: dist,
      tell: b.def.tell, damage: b.def.damage, knockback: b.def.knockback, attack: L.attack, returnable: false, form: d.phase,
    });
    if (!shot) {
      this._lanternOff();
      return;
    }
    shot.lid = ++this._lid;
    L.lid = shot.lid;
    L.s = shot;
    L.phase = 'fly';
    L.t = 0;
    fx.muzzle?.(L.x, y, L.z, c.x, c.z, 2.4, d.phase);
    this.game.shake?.(0.3);
    this.stats.blasts++;
  }

  /** The orb met the hero (fx.js, the RESULT of his answer; 'fizzle' if it was cued too late). */
  lanternMet(s, r) {
    const L = this.lantern, d = this.d, pl = this._hero();
    if (!this._mine(s)) {
      if (r !== RESULT.DODGED && r !== RESULT.PERFECT && r !== RESULT.IGNORED) d.fx.lanternBurst?.(s, 'guard');
      return;
    }
    if (r === RESULT.PARRIED && pl?.deflect?.perfect && this._startPush(s)) return;
    if (r === RESULT.DODGED || r === RESULT.PERFECT || r === RESULT.IGNORED) {
      // rolled through: it flies on and bursts on the floor beyond (fx.js)
      this.stats.lanternPassed++;
      return;
    }
    const px = pl ? pl.position.x : s.x, pz = pl ? pl.position.z : s.z;
    if (r === RESULT.PARRIED || r === RESULT.BLOCKED) {
      // a plain parry or a block: it bursts on the guard, a crater at his feet; no second hit
      this.stats.lanternBlocked++;
      d.fx.lanternBurst?.(s, 'guard', px, pz);
    } else if (r === 'fizzle') d.fx.lanternBurst?.(s, 'fizzle');
    else {
      this.stats.lanternHits++;
      d.fx.lanternBurst?.(s, 'hero', px, pz);
    }
    this._lanternOff();
  }

  /** A PERFECT parry: THE PUSH, the blade lock at range. False if it cannot start. */
  _startPush(s) {
    const L = this.lantern, d = this.d, p = this.game.player, K = this.T.lantern.push;
    if (!p || d.broken || d.mode === 'broken' || d.mode === 'dying' || d.mode === 'dead' || !d.brain?.startLock) return false;
    const dist = Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z);
    const ok = d.brain.startLock({ start: K.start, push: K.push, decay: K.decay, dur: K.dur, hold: K.hold, dist, camera: { zoom: this._pairZoom(this.T.lantern.margin), weight: 1 } });
    if (!ok) return false;
    this.stats.pushes++;
    s.phase = 'push';
    s.done = true;
    L.phase = 'push';
    L.t = 0;
    const clip = pushClip(d.phase);
    if (clip) d.brain._play?.(clip, 0.06);
    this.game.world?.forest?.ambience?.flare?.(0.8);
    this.game.shake?.(0.45);
    return true;
  }

  /** Each frame of THE PUSH: he stands square on, the orb held between them on the hero's blade
   *  (nearer him as the hero wins), grinding (fx.lanternClash), both kept in frame. */
  _pushFrame(dt) {
    const L = this.lantern, d = this.d, s = L.s, p = this.game.player, Lk = p?.bladeLock;
    if (!this._mine(s)) return this._lanternOff();
    L.t += dt;
    if (!p || !Lk || p.state !== 'lock' || L.t > this.T.lantern.push.dur + 2) {
      // (it ended without a word: a death, the Lab): it bursts where it is
      d.fx.lanternBurst?.(s, 'guard');
      this._lanternOff();
      return;
    }
    const c = this._dir(p.position.x, p.position.z, d.position.x, d.position.z); // hero → him
    d.yaw = Math.atan2(-c.x, -c.z);
    const k = clamp(fin(Lk.meter, 0.5), 0, 1), sep = Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z);
    const off = clamp(1.7 + (k - 0.5) * 2.4, 1.1, Math.max(1.2, sep - 1.2));
    s.x = p.position.x + c.x * off;
    s.z = p.position.z + c.z * off;
    s.y = 1.9;
    d.fx.lanternClash?.(s.x, s.y, s.z, -c.x, -c.z, k, dt, d.phase);
    const rig = this.game.cameraRig;
    if (rig?.keep) {
      rig.keep(d.position.x, 1.2, d.position.z, 1.6, true);
      rig.keep(p.position.x, 1.0, p.position.z, 1.6, true);
    }
  }

  /** The orb flown back by a won push reached him (fx.js → returned): the big reward. */
  _lanternReturned(s) {
    const d = this.d, LA = this.T.lantern, c = d._hs?.[1] ?? { x: d.position.x, y: 1.25, z: d.position.z };
    d.emit('dragon:returned', { kind: 2, lantern: true, damage: LA.returnDamage, x: c.x, y: c.y, z: c.z });
    d.takeHit({ damage: LA.returnDamage, exact: true, heavy: true, posture: LA.returnPosture, part: 'body', point: { x: c.x, y: c.y, z: c.z } });
    this.stats.lanternReturns++;
    this.stats.returned++;
    this.game.world?.forest?.ambience?.flare?.(1);
    if (d.mode === 'react' && d.brain?.react?.kind === 'reeling') this._reel = Math.max(this._reel, LA.reel);
    if (this._mine(s)) this._lanternOff();
  }

  /** A won push: he reels `reel` s (the reeling clip held on its staggered pose: kiBeam _holdReel). */
  _holdReel(dt) {
    if (!(this._reel > 0)) return;
    const br = this.d.brain, R = br?.react;
    if (this.d.mode !== 'react' || R?.kind !== 'reeling') {
      this._reel = 0;
      return;
    }
    this._reel -= dt;
    if (this._reel > 0.5) {
      const hold = Math.min(0.9, R.clip.dur - 0.1);
      if (R.t > hold) R.t = hold;
      if (br.clipT > hold) br.clipT = hold;
    }
  }

  /** Every frame while the orb lives: the gather's end, the move held at its landing until the orb has
   *  met the hero, the push, the orb's end. */
  _lanternFrame(dt) {
    const L = this.lantern, d = this.d;
    if (!L.on) return;
    if (L.phase === 'gather') {
      // (the move ended before the throw: a break, a stagger, the Lab)
      if (d.mode !== 'act' || d.brain?.act !== L.act) this._lanternOff();
      return;
    }
    if (L.phase === 'push') return this._pushFrame(dt);
    const s = L.s;
    if (!this._mine(s)) return this._lanternOff();
    L.t += dt;
    const a = d.brain?.act;
    if (L.phase === 'fly' && !s.done && d.mode === 'act' && a && a === L.act) {
      // (nothing of his starts while it is out: his move waits at its landing until the orb meets the
      // hero; the recovery (and what links after it) runs from then)
      // (his clip stands on the landing (the clip's own recovery start) meanwhile)
      if (!(L.rec0 >= 0)) L.rec0 = a.recoveryStart;
      const want = a.t + 0.05;
      if (a.recoveryStart < want) {
        const sh = want - a.recoveryStart;
        a.recoveryStart += sh;
        a.end += sh;
      }
      if (a.recoveryStart > L.rec0 + 1e-6 && d.brain.clipT > L.rec0) d.brain.clipT = L.rec0;
    }
  }

  _mine(s) {
    const L = this.lantern;
    return !!s && s.alive && s.lantern && s.lid === L.lid && L.lid > 0;
  }

  _lanternOff() {
    const L = this.lantern;
    L.h?.cancel?.();
    L.h = null;
    L.on = false;
    L.phase = 'off';
    L.act = null;
    L.s = null;
    L.lid = 0;
    L.rec0 = -1;
  }

  /** The unit way from (ax, az) to (bx, bz) on the floor (this._dv; +z if they meet). */
  _dir(ax, az, bx, bz) {
    const o = (this._dv ??= { x: 0, z: 1 }), dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    o.x = l > 1e-4 ? dx / l : 0;
    o.z = l > 1e-4 ? dz / l : 1;
    return o;
  }

  /** The cinematic zoom (desktop metres) that frames him and the hero with `m` m round them (kiBeam's
   *  _pairZoom). */
  _pairZoom(m) {
    const rig = this.game.cameraRig, cam = this.game.camera, d = this.d, p = this.game.player?.position;
    if (!rig || !p) return 0;
    const tanV = Math.tan(((Number.isFinite(cam?.fov) ? cam.fov : CONFIG.camera.fov) * Math.PI) / 360);
    const asp = Number.isFinite(cam?.aspect) && cam.aspect > 0.2 ? cam.aspect : 16 / 9;
    const pitch = fin(rig.pitch, CONFIG.camera.pitch);
    const hx = Math.abs(p.x - d.position.x) / 2 + m, hz = Math.abs(p.z - d.position.z) / 2 + m;
    const need = Math.max(hx / (tanV * asp * 0.88), (hz * Math.sin(pitch) + 1.2) / (tanV * 0.78));
    const base = fin(rig.targetDistance, CONFIG.camera.distance);
    const extra = Math.max(0, need - base);
    return fin(extra * (CONFIG.camera.distance / Math.max(1, fin(rig.defaultDistance, CONFIG.camera.distance))), 0);
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
    // (never in the hero's opening: a mark not yet cued fades when he is thrown into a reaction, broken
    // or staggered (a strike may now land past the end of the move it was called in: `past`))
    if (W.fadeInOpening && (d.mode === 'react' || d.broken || d.state === 'staggered')) {
      const lead = d.T.flashLead ?? 0.26;
      for (const s of d.fx.strikes ?? []) if (s.alive && s.attack === ATTACK.weather && !s.flashed && s.at - s.t > lead) s.alive = false;
    }
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
    if (d.ki?.beams?.busy) return -1; // (never while a beam of his is lit: the hero is answering it)
    if (this.lantern.on) return -1; // (nor while the great orb gathers, flies or is pushed: the weather stands down)
    if (d.mode === 'react') return -1; // (his recoil, the reeling, a flinch: the hero's own time)
    const inAct = d.mode === 'act' && !!a;
    if (inAct && a.def.transition) return -1;
    // (inside a move: landing before its end (`inString` s), or up to `past` s after it: the next move's
    // blows know it from the ledger and hold or feint for it; a reaction fades it: _skyFrame)
    const W = this.T.weather;
    const last = inAct ? a.end - a.t - W.inString + (W.past ?? 0) : Infinity;
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
      this._holdReel(dt);
      this._lanternFrame(dt);
      this._rainFrame(dt);
      this._volleyFrame(dt);
      this._skyFrame(dt);
      this._cornerFrame(dt);
    } catch (e) {
      // never freeze the frame
      this._stopRain();
      this._stopVolley();
      this._lanternOff();
      if (!this._warned) {
        this._warned = true;
        console.warn('ascendant shots:', e);
      }
    }
  }
}
