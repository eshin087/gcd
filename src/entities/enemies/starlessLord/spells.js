import { TELL, RESULT } from '../../../combat/rules.js';
import { clamp, lerp } from '../../../core/math.js';
import { perPhase } from '../duelist/realise.js';
import { lookOf } from '../duelist/lookSwitch.js';
import { DUEL_WORLD } from '../duelist/worldTuning.js';
import { K_FIRE, K_SMOKE, K_VOID, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { answerOf } from '../duelist/director.js';
import { TUNING } from './tuning.js';

// The Starless Lord's second-pass Void (COMBAT.md → "The Starless Lord"): what flies, waits or falls
// WHILE he fights on, each one cued like his blade and reported to his cue ledger (duelist/brain.js
// `expect` / `fairDelay`), so the fairness guard keeps two answers apart. Owned by lord.js
// (`d.spells`), stepped from his brainFrame, drawn here through his fx object's fire field
// (`_blob` / `_ink` / `_dot`) and its public (wrapped) methods.
//   the WHEELING BLADE  form 2: his main blade thrown in the middle of a string (moves.js
//                       `cast: { kind: 'wheel' }`); it wheels wide round the hero and comes in from
//                       the side between two off-hand cuts (white: parry or guard; it may come from
//                       any side), then home to his hand: the `catch` beat. While it flies his main
//                       blade is out of his hand (d.glaiveOut), as the Returning Blade's is.
//   the ORBIT           form 3: torn stones that turn round HIM (fx.throwShot `orbit`) and fly one at
//                       a time into the gaps of the string he is cutting (`cast: { kind: 'debris',
//                       orbit: true }`), each a fixed flight long so its cue always comes in time.
//   the STARLESS SKY    form 4: weather. Strikes called down in ones and twos through the whole form
//                       (fx.callStrike, red: be out of the ring or roll), near where the hero is
//                       heading, more as his bar empties, each landing in a slot clear of his blade.
//   STARLESS NIGHT      form 4's great spell (`cast: { kind: 'night' }`): the blade driven into the
//                       floor, and three waves of the Void run out across the whole crater (red: roll
//                       through each as it reaches you). Look: ?great=a|b|c.
// Random numbers: gameplay draws (the weather's scatter, the storm's scatter in lord.js, which side
// the blade wheels to) come from this module's own seeded stream (`rand`), looks from another (`lr`):
// neither is the AI's Math.random nor the fx object's shared stream.

const TAU = Math.PI * 2;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
/** A steady hash 0..1 of a number (ragged fronts that do not boil frame to frame). */
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** A small seeded stream (mulberry32). */
const stream = (seed) => {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.seed = (s) => (a = s >>> 0);
  return f;
};
const G_SEED = 0x51a7e55, L_SEED = 0x6e16c7;

/** The attack names his new Void carries (combat events, hits). */
export const SPELL_ATTACK = Object.freeze({ wheel: 'wheelingBlade', sky: 'starlessSky', night: 'starlessNight' });
/** The great spell's looks (`?great=`): a the dark tide (default), b the sky's edge, c the floor answers. */
export const GREAT_LOOKS = Object.freeze(['a', 'b', 'c']);
const greatLook = () => lookOf('great', 'a');

const STONE = [0.42, 0.4, 0.46];

export class LordSpells {
  constructor(d) {
    this.d = d;
    this._g = stream(G_SEED);
    this._l = stream(L_SEED);
    this.wheel = { alive: false, phase: 'out', h: null, quiet: false, recall: false, flashed: false, x: 0, y: 1, z: 0, dx: 0, dz: 1, spin: 0, pspin: NaN, wsrc: -1 };
    this.orbit = []; // { s: fx.shots record, gen }
    this._gen = 0;
    this.sky = { t: 0, calls: 0 };
    this.night = { alive: false, x: 0, z: 0, t: 0, attack: SPELL_ATTACK.night, waves: Array.from({ length: 4 }, () => ({ start: 0, r: 0, flashed: false, flashT: -9, done: true, h: null, seed: 0 })), n: 0 };
    this._blow = { kind: 'cut', by: 'boss', dx: 0, dz: 0, y: 0.95, src: -1 };
    this.stats = { wheels: 0, wheelHits: 0, orbitStones: 0, skyCalls: 0, skySkips: 0, nights: 0, nightHits: 0 };
  }

  /** The spells' gameplay stream (never the AI's, never the drawing's). */
  rand(a = 0, b = 1) {
    return a + this._g() * (b - a);
  }
  /** The looks' stream. */
  lr(a = 0, b = 1) {
    return a + this._l() * (b - a);
  }

  reset() {
    this._g.seed(G_SEED);
    this._l.seed(L_SEED);
    this.clear();
    this.sky.t = TUNING.weather.start;
    this.sky.calls = 0;
    for (const k of Object.keys(this.stats)) this.stats[k] = 0;
  }

  /** Everything of his in the air or on the floor goes out (his death, a reset). */
  clear() {
    const w = this.wheel;
    w.h?.cancel?.();
    w.h = null;
    if (w.alive) {
      w.alive = false;
      if (this.d.glaiveOut) this.d.onGlaiveBack?.();
    }
    this.orbit.length = 0;
    const n = this.night;
    n.alive = false;
    for (const v of n.waves) {
      v.h?.cancel?.();
      v.h = null;
      v.done = true;
    }
  }

  /** A form begins: the weather's first strike waits a little. */
  onForm(n) {
    this.sky.t = TUNING.weather.start;
    this._home(true);
  }

  /** Starless Night's waves are still to reach the hero. */
  get nightLive() {
    const n = this.night;
    if (!n.alive) return false;
    for (let i = 0; i < n.n; i++) if (!n.waves[i].done) return true;
    return false;
  }

  /** Anything of the new Void still live (the tests wait for it). */
  get busy() {
    if (this.wheel.alive || this.night.alive) return true;
    for (const o of this.orbit) if (o.s.alive && o.s._mine === o.gen) return true;
    return false;
  }

  /** A cast beat's impact (lord.js onCast): true if it was one of these. */
  cast(b, s, act) {
    const C = b.def.cast;
    if (!C) return false;
    if (C.kind === 'wheel') return this.castWheel(b, s, act), true;
    if (C.kind === 'night') return this.castNight(b, s, act), true;
    if (C.kind === 'debris' && C.orbit) return this.castOrbit(b, s, act), true;
    return false;
  }

  /** Each frame (lord.js brainFrame). */
  frame(dt) {
    if (!(dt > 0)) return;
    this._wheel(dt);
    this._orbit(dt);
    this._hang(dt);
    this._sky(dt);
    this._night(dt);
  }

  // ---------------------------------------------------------------- shared
  get _lead() {
    return perPhase(TUNING.flashLead, this.d.phase);
  }
  /** The hero (alive, in the fight) or null. */
  _hero() {
    const p = this.d.game.player;
    return p?.position && p.alive !== false ? p : null;
  }
  /** A cue of one of these (the glint the hero answers): the tell, the glint, the ledger's ring. */
  _cue(attack, tell, x, y, z, hazard, bullet, impactIn) {
    const d = this.d;
    if (hazard && !bullet) d.emit('combat:tell', { source: 'dragon', attack, tell, impactIn, x, z, hazard: true });
    d.emit('combat:flash', { source: 'dragon', attack, tell, x, y, z, hazard: true, ...(bullet ? { bullet: true } : null) });
    d.fx.hazardFlash?.(tell, x, y, z);
  }

  /**
   * Would an impact `T` s from now, needing the answer `tell` asks, land clear of the running move's
   * own blows that need the other answer (by the fairness guard's sep + margin, and a little more)?
   * The blows not cued yet are not in the ledger's sight until their cue: a call made now that lands
   * on one would make the guard hold that blow (or turn it into a feint); this keeps them apart.
   */
  _clearOfAct(T, tell, pad = 0) {
    const d = this.d, br = d.brain, a = br?.act;
    if (d.mode !== 'act' || !a) return true;
    const G = TUNING.pressure.guard, sep = (G.sep ?? 0.3) + (G.margin ?? 0) + 0.04 + pad, ans = answerOf(tell);
    for (const b of a.beats) {
      if (b.feint || b.done) continue;
      if (b.def.cast && !b.def.release) continue; // (what a cast makes reports itself)
      if (answerOf(b.def.tell) === ans) continue;
      let t = b.impact - a.t;
      if (b.def.release) t += fin(br.ledger?.travel?.(b), 0);
      if (Math.abs(t - T) < sep) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- the wheeling blade
  /** Thrown at a `wheel` cast beat: it comes in on the hero between the cut before the string's
   *  `catch` beat and the blow after it. */
  castWheel(b, s, act) {
    const d = this.d, W = TUNING.wheel, w = this.wheel;
    if (w.alive) this._home(true);
    let T = W.flight;
    if (act) {
      const i = act.beats.indexOf(b);
      const ci = act.beats.findIndex((x, k) => k > i && x.def.catch);
      if (ci > 0) {
        let prev = null, next = null;
        for (let k = ci - 1; k > i; k--) if (!act.beats[k].feint) { prev = act.beats[k]; break; }
        for (let k = ci + 1; k < act.beats.length; k++) if (!act.beats[k].feint) { next = act.beats[k]; break; }
        const t0 = prev ? prev.impact : act.t, t1 = next ? next.impact : t0 + 0.9;
        T = (t0 + t1) / 2 - act.t;
      }
    }
    T = clamp(T, W.min, W.max);
    // (fair: a dodge landing where it would come in moves it later, or it is thrown without a cue)
    const fd = d.brain?.fairDelay?.(T, TELL.NORMAL, W.yield) ?? 0;
    w.quiet = fd < 0;
    if (fd > 0) {
      T += fd;
      d.brain.stats.delays++;
    }
    const h = d._hilt;
    Object.assign(w, {
      alive: true, phase: 'out', t: 0, T, x0: fin(h?.x, d.position.x), z0: fin(h?.z, d.position.z), x: fin(h?.x, d.position.x), y: 1.05, z: fin(h?.z, d.position.z),
      hx: s?.p?.x ?? d.position.x, hz: s?.p?.z ?? d.position.z, side: this.rand() < 0.5 ? -1 : 1, flashed: false, flashT: -9, recall: false,
      spin: 0, pspin: NaN, dx: Math.sin(d.yaw), dz: Math.cos(d.yaw), damage: b.def.damage, kb: b.def.knockback, attack: act?.name ?? SPELL_ATTACK.wheel, wsrc: -1, wPhase: '',
    });
    w.h?.cancel?.();
    w.h = w.quiet ? null : d.brain?.expect?.(T, TELL.NORMAL, w.attack) ?? null;
    d.glaiveOut = true;
    this.stats.wheels++;
    d.fx.igniteBurst?.(d._hilt, d._tip, 0.5);
  }

  /** The `catch` beat (lord.js beatMotion): its pass made, it comes home fast. */
  catch() {
    if (this.wheel.alive) this.wheel.recall = true;
  }

  /** A move that needs the main blade now (lord.js onActStart): it comes home at once (not cued yet:
   *  it gives up its pass: a feint never glints). */
  recall() {
    const w = this.wheel;
    if (!w.alive) return;
    w.recall = true;
    if (w.phase === 'out' && !w.flashed) {
      w.phase = 'back';
      w.h?.cancel?.();
      w.h = null;
    }
  }

  _home(now = false) {
    const w = this.wheel, d = this.d;
    if (!w.alive) return;
    if (!now) {
      this.recall();
      return;
    }
    w.alive = false;
    w.h?.cancel?.();
    w.h = null;
    d.onGlaiveBack?.();
  }

  _wheel(dt) {
    const w = this.wheel, d = this.d, W = TUNING.wheel;
    if (!w.alive) return;
    if (d.mode === 'dying' || d.mode === 'dead' || d.mode === 'sleep') return this._home(true);
    w.t += dt;
    w.spin += dt * 26;
    const pl = this._hero(), px0 = w.x, pz0 = w.z;
    if (w.phase === 'out') {
      // homing on the hero: out wide to one side, round, and in on him from there
      if (pl) {
        w.hx = pl.position.x;
        w.hz = pl.position.z;
      }
      const u = clamp(w.t / Math.max(0.05, w.T), 0, 1);
      const ax = w.hx - w.x0, az = w.hz - w.z0, L = Math.hypot(ax, az) || 1;
      const nx = (-az / L) * w.side, nz = (ax / L) * w.side;
      const cx = (w.x0 + w.hx) / 2 + nx * W.wide + (ax / L) * W.beyond, cz = (w.z0 + w.hz) / 2 + nz * W.wide + (az / L) * W.beyond;
      const a = (1 - u) * (1 - u), bb = 2 * u * (1 - u), c = u * u;
      w.x = a * w.x0 + bb * cx + c * w.hx;
      w.z = a * w.z0 + bb * cz + c * w.hz;
      w.y = 1.05 + Math.sin(Math.PI * u) * W.rise;
      const left = w.T - w.t;
      w.h?.retime?.(Math.max(0, left));
      if (!w.flashed && !w.quiet && left <= this._lead && pl) {
        w.flashed = true;
        w.flashT = d.time;
        this._cue(w.attack, TELL.NORMAL, w.x, w.y, w.z, true, true);
      }
      if (w.t >= w.T) {
        w.phase = 'back';
        w.h?.cancel?.();
        w.h = null;
        if (pl && w.flashed && d.time - w.flashT >= 0.2 && Math.hypot(pl.position.x - w.x, pl.position.z - w.z) <= W.radius + (pl.radius ?? 0.45) + W.reach) {
          const r = d.hitPlayer({
            damage: w.damage, knockback: w.kb, kind: 'thrown', tell: TELL.NORMAL, attack: w.attack, from: { x: w.x - w.dx, z: w.z - w.dz },
            projectile: true, light: true, parryPosture: 14, extra: { around: true },
          });
          if (r === RESULT.HIT) this.stats.wheelHits++;
        }
      }
    } else {
      // home to his hand
      const h = d._hilt, hx = fin(h?.x, d.position.x) - w.x, hz = fin(h?.z, d.position.z) - w.z, l = Math.hypot(hx, hz);
      if (l < 1.0) return this._home(true);
      const sp = W.back * (w.recall ? 1.8 : 1), step = Math.min(l, sp * dt);
      w.x += (hx / l) * step;
      w.z += (hz / l) * step;
      w.y += (fin(h?.y, 1.1) - w.y) * Math.min(1, dt * 8);
      if (w.t > w.T + W.home) return this._home(true);
    }
    const mx = w.x - px0, mz = w.z - pz0, ml = Math.hypot(mx, mz);
    if (ml > 1e-4) {
      w.dx = mx / ml;
      w.dz = mz / ml;
    }
    // the world in its way: the blade cuts through what it crosses (as the Returning Blade)
    const Wd = d.game.world?.destructibles;
    if (Wd?.sweep && ml > 1e-4) {
      if (w.wsrc < 0 || w.wPhase !== w.phase) w.wsrc = Wd.swing?.() ?? 0;
      w.wPhase = w.phase;
      const o = this._blow;
      o.dx = w.dx;
      o.dz = w.dz;
      o.src = w.wsrc;
      Wd.sweep(px0, pz0, w.x, w.z, W.radius, (d.T.world ?? DUEL_WORLD).glaive ?? DUEL_WORLD.glaive, o);
    }
    this._drawWheel(w);
  }

  /** The wheeling blade: a line of red-white strokes turning, the wheel its points cut, the Void at
   *  its hub, a few embers shed (the Returning Blade's drawing, on this module's own stream). */
  _drawWheel(w) {
    const fx = this.d.fx, life = fx._frame?.() ?? 0;
    if (!(life > 0)) return;
    const c = Math.cos(w.spin), sn = Math.sin(w.spin), R = 0.95;
    fx._ink(w.x - c * R * 0.86, w.y, w.z - sn * R * 0.86, w.x + c * R * 0.86, w.y, w.z + sn * R * 0.86, 0, 0.85);
    fx._dot(w.x, w.y, w.z, 0.6, 0.34, K_VOID);
    const p0 = Number.isFinite(w.pspin) && Math.abs(w.spin - w.pspin) < 1.2 ? w.pspin : w.spin - 0.4;
    w.pspin = w.spin;
    for (let e = 0; e < 2; e++) {
      let lx = w.x + Math.cos(p0 + e * Math.PI) * R, lz = w.z + Math.sin(p0 + e * Math.PI) * R;
      for (let q = 1; q <= 3; q++) {
        const a = p0 + (w.spin - p0) * (q / 3) + e * Math.PI, x = w.x + Math.cos(a) * R, z = w.z + Math.sin(a) * R;
        fx._ink(lx, w.y, lz, x, w.y, z, 0.13, 0.5, 0, 0.5, 1);
        lx = x;
        lz = z;
      }
    }
    for (let i = -3; i <= 3; i++) {
      const u = (i / 3) * R * 0.8;
      fx._blob(w.x + c * u, w.y + 0.06, w.z + sn * u, 0, 0, 0, life, 0.22, 0.22, 0.3, 0.3, K_FIRE);
    }
    if (this.lr() < 0.5) fx._blob(w.x, w.y, w.z, -w.dx * 1.5, this.lr(0, 0.6), -w.dz * 1.5, this.lr(0.16, 0.3), 0.34, 0.18, 0.3, 0, K_VOID, 1);
  }

  // ---------------------------------------------------------------- the orbit (form 3)
  /** Torn stones turning round him, each flying into a gap of the string still to come. */
  castOrbit(b, s, act) {
    const d = this.d, T = TUNING.orbit, C = b.def.cast, n = Math.max(1, Math.round(C.count ?? T.count));
    const at = [];
    if (act) {
      const imp = [];
      for (const x of act.beats) if (x !== b && !x.feint && x.impact > act.t + 1e-4) imp.push(x.impact - act.t);
      // (early in the pause: its glint after the cut before it has landed, its contact well before
      // the next cut's glint, even if the hero is knocked back a little and it lands late)
      const lead = this._lead;
      for (let k = 0; k + 1 < imp.length && at.length < n; k++) {
        const m = Math.min((imp[k] + imp[k + 1]) / 2, imp[k] + lead + T.early);
        if (imp[k + 1] - imp[k] >= T.minGap && m - T.flight >= T.minDelay) at.push(m);
      }
      // (a pause for each stone: no more stones than the string has pauses, none thrown after it)
      if (!at.length) at.push(Math.max(imp.length ? imp[imp.length - 1] + T.after : 0, T.minDelay + T.flight));
    } else for (let i = 0; i < n; i++) at.push(T.minDelay + T.flight + i * T.after);
    // each stone set on the wheel so that, turning, it is at his side (not between him and the hero,
    // nor behind him) when its turn to fly comes: from there its flight is long enough to be cued
    const yaw = d.yaw, pl = this._hero();
    const toHero = pl ? Math.atan2(pl.position.z - d.position.z, pl.position.x - d.position.x) : Math.atan2(Math.cos(yaw), Math.sin(yaw)); // (from +x)
    for (let i = 0; i < at.length; i++) {
      const delay = Math.max(T.minDelay, at[i] - T.flight), side = i & 1 ? -1 : 1;
      const a = toHero + side * T.side - T.w * delay, x = d.position.x + Math.cos(a) * T.r, z = d.position.z + Math.sin(a) * T.r;
      d.fx.tearUp?.(x, z);
      d.game.world?.scars?.ground?.(x, z, 0.7);
      const sh = d.fx.throwShot?.({
        orbit: { r: T.r, a, w: T.w }, kind: 'stone', x, y: 0.2, z, dx: Math.sin(yaw), dz: Math.cos(yaw), speed: T.speed[0], radius: T.radius, life: T.life,
        delay, rise: T.rise + 0.25 * (i & 1), tell: TELL.NORMAL, damage: b.def.damage, knockback: b.def.knockback, attack: act?.name ?? 'stoneWheel',
      });
      if (!sh) continue;
      sh._mine = ++this._gen;
      sh._wait = 0;
      this.orbit.push({ s: sh, gen: sh._mine, act });
      this.stats.orbitStones++;
    }
    d.game.shake?.(0.18);
  }

  /** Each stone's flight is `flight` s long whatever the distance (its cue always comes in time);
   *  one about to fly from too near the hero turns on round him a little longer. */
  _orbit(dt) {
    const L = this.orbit;
    if (!L.length) return;
    const T = TUNING.orbit, pl = this._hero();
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i].s;
      if (!s.alive || s._mine !== L[i].gen) {
        L.splice(i, 1);
        continue;
      }
      if (s.phase !== 'hang') continue;
      // (the string they belong to is over or was cut short: the stones crumble in the grip; they
      // never fly into another move's blows)
      const own = L[i].act;
      if (!pl || (own && (this.d.brain?.act !== own || this.d.mode !== 'act'))) {
        s.alive = false;
        this.d.fx.dust?.(s.x, s.z, 0.5);
        L.splice(i, 1);
        continue;
      }
      const reach = (s.radius ?? 0.8) + (pl.radius ?? 0.45);
      const fly = Math.max(0, Math.hypot(pl.position.x - s.x, pl.position.z - s.z) - reach);
      if (s.age + dt >= s.delay && fly < T.minDist) {
        if (s._wait < T.maxWait) {
          s.delay += 0.1;
          s._wait += 0.1;
        } else {
          // (the hero keeps to the stone's side of him: it crumbles in the grip, never thrown uncued)
          s.alive = false;
          this.d.fx.dust?.(s.x, s.z, 0.5);
          L.splice(i, 1);
          continue;
        }
      }
      s.speed = clamp(fly / T.flight, T.speed[0], T.speed[1]);
    }
  }

  /**
   * Every torn stone about to leave the Void's grip (Torn Stone's, the orbit's) waits in it while it
   * would land within the guard's reach of a blow of the running string that asks the other answer
   * and is not cued yet (the brain's guard sees those blows only at their cue: a great red stone
   * thrown now could not be held back then). At most `T.yield` s a stone in all.
   */
  _hang(dt) {
    const d = this.d, pl = this._hero(), Y = TUNING.orbit.yield;
    if (!pl || d.mode !== 'act' || !d.brain?.act) return;
    for (const s of d.fx.shots ?? []) {
      if (!s.alive || s.kind !== 'stone' || s.phase !== 'hang' || s.age + dt < s.delay - 1e-4) continue;
      if ((s._yield ?? 0) >= Y) continue;
      const fly = Math.max(0, Math.hypot(pl.position.x - s.x, pl.position.z - s.z) - (s.radius ?? 0.8) - (pl.radius ?? 0.45)) / Math.max(1, s.speed);
      if (this._clearOfAct(Math.max(0, s.delay - s.age) + fly, s.tell, 0.12)) continue;
      s.delay += 0.05;
      s._yield = (s._yield ?? 0) + 0.05;
    }
  }

  // ---------------------------------------------------------------- the Starless Sky as weather (form 4)
  _skyOn() {
    const d = this.d;
    if (!(d.phase >= TUNING.weather.form) || !d.brain?.aiEnabled || d._changing || d.broken) return false;
    if (d.mode !== 'foot' && d.mode !== 'act' && d.mode !== 'react') return false;
    if (d.brain.act?.def?.transition) return false;
    const st = d.game.state;
    return !!this._hero() && (st === undefined || st === 'boss');
  }

  _sky(dt) {
    const S = TUNING.weather, d = this.d, Sk = this.sky;
    if (!this._skyOn()) return;
    Sk.t -= dt;
    if (Sk.t > 0) return;
    let live = 0;
    for (const s of d.fx.strikes ?? []) if (s.alive && s.attack === SPELL_ATTACK.sky) live++;
    if (live >= S.maxLive) {
      Sk.t = S.retry;
      return;
    }
    const miss = 1 - clamp(d.hp / Math.max(1, d.maxHp), 0, 1);
    const T = this._skySlot(S.warn, S.slack);
    if (T < 0) {
      Sk.t = S.retry * 0.5;
      this.stats.skySkips++;
      return;
    }
    const pl = this._hero(), p = pl.position;
    const vx = fin(pl.vel?.x), vz = fin(pl.vel?.z);
    const a = this.rand(0, TAU), r = Math.sqrt(this.rand()) * S.scatter;
    const m = { x: p.x + vx * S.lead + Math.cos(a) * r, z: p.z + vz * S.lead + Math.sin(a) * r };
    d.clampTarget(m, 0.6);
    const o = { damage: S.damage, knockback: S.knockback, attack: SPELL_ATTACK.sky };
    if (d.fx.callStrike?.(m.x, m.z, S.radius, T, o)) {
      this.stats.skyCalls++;
      Sk.calls++;
    }
    // a second, in the other half of the floor round him: never on the way out of the first
    if (live + 1 < S.maxLive && this.rand() < lerp(S.pair[0], S.pair[1], miss)) {
      const T2 = T + S.pairGap;
      if (this._clearOfAct(T2, TELL.RED) && (d.brain.fairDelay?.(T2, TELL.RED, 0) ?? 0) === 0) {
        const sp = Math.hypot(vx, vz), ux = sp > 0.5 ? vx / sp : Math.cos(a), uz = sp > 0.5 ? vz / sp : Math.sin(a);
        const side = this.rand() < 0.5 ? -1 : 1;
        const m2 = { x: p.x - uz * side * S.apart, z: p.z + ux * side * S.apart };
        d.clampTarget(m2, 0.6);
        if (Math.hypot(m2.x - m.x, m2.z - m.z) > S.radius * 2 + 0.6 && d.fx.callStrike?.(m2.x, m2.z, S.radius, T2, o)) this.stats.skyCalls++;
      }
    }
    Sk.t = lerp(S.gap[0], S.gap[1], miss) * this.rand(0.85, 1.15);
  }

  /** The first landing time from `warn` s on (up to `slack` more) clear of his own blows and of every
   *  known impact needing a guard; -1 if none. */
  _skySlot(warn, slack) {
    const d = this.d, br = d.brain, a = br.act;
    // (never in the hero's opening: his recoil, a stagger, the reeling; inside a move of his: in a
    // pause of it or in its recovery, the hero's own time (TUNING.weather.inString); in his footwork:
    // the blow of the move he starts next waits for it at its cue if it must)
    if (d.state === 'staggered') return -1;
    const inAct = d.mode === 'act' && !!a;
    if (inAct && a.def.transition) return -1;
    const last = inAct ? a.end - a.t - TUNING.weather.inString : Infinity;
    for (let e = 0; e <= slack + 1e-6; e += 0.05) {
      const T = warn + e;
      if (T > last) break;
      if (!this._clearOfAct(T, TELL.RED)) continue;
      if ((br.fairDelay?.(T, TELL.RED, 0) ?? 0) !== 0) continue;
      return T;
    }
    return -1;
  }

  // ---------------------------------------------------------------- Starless Night (form 4's great spell)
  /** The blade in the floor: the waves leave him one after another and run out over the crater. */
  castNight(b, s, act) {
    const d = this.d, N = TUNING.night, n = this.night;
    for (const v of n.waves) v.h?.cancel?.();
    n.alive = true;
    n.x = d.position.x;
    n.z = d.position.z;
    n.t = 0;
    n.n = Math.min(n.waves.length, N.waves);
    n.attack = act?.name ?? SPELL_ATTACK.night;
    n.damage = b.def.damage;
    n.kb = b.def.knockback;
    const pl = this._hero(), D = pl ? Math.hypot(pl.position.x - n.x, pl.position.z - n.z) : 0, pr = pl?.radius ?? 0.45;
    for (let i = 0; i < n.waves.length; i++) {
      const v = n.waves[i];
      v.h = null;
      v.done = i >= n.n;
      if (v.done) continue;
      v.start = i * N.gap;
      v.r = N.r0;
      v.flashed = false;
      v.flashT = -9;
      v.seed = this.lr(0, 100);
      const gap = D - pr - N.r0;
      if (gap > 0) v.h = d.brain?.expect?.(v.start + gap / N.speed, TELL.RED, n.attack) ?? null;
    }
    this.stats.nights++;
    // the look of the moment: the sky answers his blade, the Void bursts out of the floor round him
    const tip = d._tip;
    if (tip) d.fx.lightning?.(tip.x, tip.y, tip.z, tip.x + this.lr(-1.5, 1.5), 26, tip.z + this.lr(-1.5, 1.5), 1.8, true);
    d.fx.shock?.(n.x, n.z, 5.5, { k: 1.6, kind: 'void', fire: 0.2 });
    d.game.world?.impact?.(n.x, n.z, 2.6, ((d.T.world ?? DUEL_WORLD).strike ?? DUEL_WORLD.strike) * 0.8, { kind: 'blast', by: 'boss' });
    d.game.world?.forest?.ambience?.flare?.(1);
    d.game.shake?.(0.45);
    d.emit('dragon:explosion', { x: n.x, z: n.z, radius: 3 });
  }

  _night(dt) {
    const n = this.night, d = this.d;
    if (!n.alive) return;
    if (d.mode === 'dying' || d.mode === 'dead' || d.mode === 'sleep') {
      this.clear();
      return;
    }
    const N = TUNING.night, lead = this._lead;
    n.t += dt;
    const pl = this._hero(), pr = pl?.radius ?? 0.45;
    const D = pl ? Math.hypot(pl.position.x - n.x, pl.position.z - n.z) : 0;
    let any = false;
    const L = greatLook();
    for (let i = 0; i < n.n; i++) {
      const v = n.waves[i];
      const run = n.t - v.start;
      v.r = N.r0 + Math.max(0, run) * N.speed;
      if (v.r < N.reach) any = true;
      if (run < 0) {
        if (pl && v.h) v.h.retime(-run + Math.max(0, D - pr - N.r0) / N.speed);
        continue;
      }
      if (v.r < N.reach) this._drawFront(n.x, n.z, v.r, clamp(1.4 - v.r / N.reach, 0.35, 1), v.seed, L);
      if (v.done) continue;
      if (!pl) {
        v.done = true;
        v.h?.cancel?.();
        continue;
      }
      const gap = D - pr - v.r; // m until the front reaches him
      if (!v.flashed) {
        if (gap <= 0) {
          // (he was inside it before it could be cued: in the eye, or he ran into it: it passes)
          v.done = true;
          v.h?.cancel?.();
          v.h = null;
          continue;
        }
        const left = gap / N.speed;
        v.h?.retime?.(left);
        if (left > lead) continue;
        v.flashed = true;
        v.flashT = d.time;
        const a = Math.atan2(pl.position.z - n.z, pl.position.x - n.x);
        this._cue(n.attack, TELL.RED, n.x + Math.cos(a) * (v.r + gap * 0.5), 0.6, n.z + Math.sin(a) * (v.r + gap * 0.5), true, false, left);
        continue;
      }
      // cued: it strikes him once, `lead` after its cue, if the front is on him then (a roll at the
      // flare, whichever way, is under it then or has taken him out of its way)
      if (d.time < v.flashT + lead - 1e-4) continue;
      v.done = true;
      v.h?.cancel?.();
      v.h = null;
      if (Math.abs(gap) > N.width + pr) continue;
      const r = d.hitPlayer({ damage: n.damage, knockback: n.kb, knockdown: true, kind: 'void', tell: TELL.RED, parryable: false, blockable: false, attack: n.attack, from: { x: n.x, z: n.z }, extra: { plunge: false } });
      if (r === RESULT.HIT) {
        this.stats.nightHits++;
        d.game.world?.impact?.(pl.position.x, pl.position.z, 1.2, ((d.T.world ?? DUEL_WORLD).strike ?? DUEL_WORLD.strike) * 0.6, { kind: 'blast', by: 'boss' });
      }
    }
    if (!any) {
      n.alive = false;
      for (let i = 0; i < n.n; i++) {
        n.waves[i].h?.cancel?.();
        n.waves[i].h = null;
      }
    }
  }

  /**
   * One wave's front at radius r round (x, z), `k` its strength (it thins as it runs out). Three looks
   * (?great=): a the dark tide: a wall of the Void along the floor, a red seam on its leading edge,
   * darkness left hanging behind it; b the sky's edge: a ring of standing white strokes, the Void at
   * their feet, lightning leaping up off it; c the floor answers: the floor thrown up in dust and chips
   * along a red seam. Cost of one front at the crater's edge (r 14, 160 points): a ~480 frame blobs +
   * ~32 a frame that live 0.25 - 0.42 s (~1000 live), b ~240 + 2 arcs, c ~160 frame blobs + ~80 a
   * frame living 0.3 - 0.5 s (~3000 live at the peak) + ~12 glyph chips a frame (life 0.35 s).
   */
  _drawFront(x, z, r, k, seed, L) {
    const fx = this.d.fx, life = fx._frame?.() ?? 0;
    if (!(life > 0) || !(r > 0.2)) return;
    const n = Math.min(180, Math.max(20, Math.round((TAU * r) / 0.55)));
    const spin = seed * 0.37;
    if (L === 'b') {
      for (let i = 0; i < n; i++) {
        const a = ((i + hash(seed + i) * 0.7) / n) * TAU + spin, rr = r + (hash(seed + i + 3.1) - 0.5) * 0.3;
        const bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr;
        fx._blob(bx, GROUND_Y, bz, 0, 0, 0, life, 0.4, 0.4, 0.5 * GROUND_GAIN * k, 0.5 * GROUND_GAIN * k, K_VOID);
        if (i % 2 === 0) {
          const hh = (1.0 + 1.8 * hash(seed + i * 1.7 + Math.floor(r * 3))) * k;
          fx._ink(bx, 0.15, bz, bx, 0.15 + hh, bz, 0, 0.95 * k, 0.25, 0.95 * k);
        }
      }
      if (this.lr() < 0.12 * k) {
        const a = this.lr(0, TAU), bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
        fx.arc?.(bx, 0.2, bz, bx + this.lr(-0.8, 0.8), this.lr(2.4, 4.2), bz + this.lr(-0.8, 0.8), 0.3, null, null, 4);
      }
      return;
    }
    if (L === 'c') {
      for (let i = 0; i < n; i++) {
        const a = ((i + hash(seed + i) * 0.7) / n) * TAU + spin, rr = r + (hash(seed + i + 3.1) - 0.5) * 0.3;
        const ca = Math.cos(a), sa = Math.sin(a), bx = x + ca * rr, bz = z + sa * rr;
        fx._blob(x + ca * (rr + 0.2), GROUND_Y, z + sa * (rr + 0.2), 0, 0, 0, life, 0.3, 0.3, 0.5 * GROUND_GAIN * k, 0.5 * GROUND_GAIN * k, K_FIRE);
        if (i % 2 === 0) fx._blob(bx, 0.35, bz, ca * 0.8, this.lr(0.8, 2.4) * k, sa * 0.8, this.lr(0.3, 0.5), 0.55, 1.2, 0.8 * k, 0, K_SMOKE, 2);
        if (i % 14 === 0 && fx.alpha) {
          fx._spawn(fx.alpha, { x: bx, y: 0.15, z: bz, vx: ca * this.lr(0.5, 2), vy: this.lr(2, 5) * k, vz: sa * this.lr(0.5, 2), life: this.lr(0.25, 0.4), size: 0.18, sizeEnd: 0.08, glyph: "#%,.'", color: STONE, alpha: 0.9, alphaEnd: 0, drag: 2, gravity: -9 });
        }
      }
      return;
    }
    // a: the dark tide
    for (let i = 0; i < n; i++) {
      const a = ((i + hash(seed + i) * 0.7) / n) * TAU + spin, rr = r + (hash(seed + i + 3.1) - 0.5) * 0.35;
      const ca = Math.cos(a), sa = Math.sin(a), bx = x + ca * rr, bz = z + sa * rr;
      const hh = (0.72 + 0.3 * hash(seed + i + 7.7)) * k;
      fx._blob(bx, GROUND_Y + 0.22, bz, 0, 0, 0, life, 0.55, 0.55, hh, hh, K_VOID);
      fx._blob(bx, GROUND_Y + 0.75, bz, 0, 0, 0, life, 0.45, 0.45, hh * 0.7, hh * 0.7, K_VOID);
      fx._blob(x + ca * (rr + 0.32), GROUND_Y, z + sa * (rr + 0.32), 0, 0, 0, life, 0.3, 0.3, 0.5 * GROUND_GAIN * k, 0.5 * GROUND_GAIN * k, K_FIRE);
      if (i % 5 === 0) fx._blob(bx, 0.55, bz, -ca * 0.7, this.lr(0.3, 1.2), -sa * 0.7, this.lr(0.25, 0.42), 0.6, 1.0, 0.5 * k, 0, K_VOID, 1.5);
    }
  }
}
