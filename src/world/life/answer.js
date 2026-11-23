import { answerTuning } from './answerTuning.js';

// THE ANSWER (piece 'answer'): the world answers the fight. A roar sends a real gust front through the
// grass, the trees and what lies on the ground; creatures flee; the air holds its breath while a great
// blow winds up (life.hushFor). It listens to the events the bosses and the hero already emit and adds
// none; it reaches the other layers only through `life` (wind.front, creatures.startle,
// litter.scatter, life.hushFor).
//
//   dragon:roar {strength}        a front from the boss toward the hero, a startle over the arena, what
//                                 lies near the boss thrown; dragon:wake: a first, smaller one
//   dragon:land / dragon:explosion / player:slam / player:plungeHit
//                                 litter.scatter + creatures.startle round the point (the radial air
//                                 push arrives through world.gust → life.gust → wind.burst: not doubled)
//   combat:tell red | black (not a bullet's), combat:charge
//                                 life.hushFor(until the blow lands): normal and blue tells do nothing
//   dragon:phase / phase2..4      a hush of ~1 s, then one long front
//   dragon:dead / game:victory    a lull (a long hush), then the breeze returns
//   player:died                   a hush
//   answer.gust(x, z, s, r)       (life.gust calls it) a strong burst startles the creatures in its radius
// Everything is rate-limited (answerTuning.gap) and scaled by life.k. With the piece off nothing is
// subscribed (the subscriptions follow the switch, so the Lab can flip it live) and nothing runs.
// In the Windless Grove these are the only things that ever move the air: the fronts pass there too.

const BLOWS = ['dragon:land', 'dragon:explosion', 'player:slam', 'player:plungeHit'];
const PHASES = ['dragon:phase', 'dragon:phase2', 'dragon:phase3', 'dragon:phase4'];
const GREAT = new Set(['red', 'black']);

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class Answer {
  constructor(life) {
    this.life = life;
    this.T = answerTuning(life.levelId);
    /** the time each kind last answered (life.t), for the rate limits */
    this._last = Object.create(null);
    this._offs = null;
    /** a front waiting for its hush to end (a new form): s left, -1 = none */
    this._phaseFront = -1;
    /** answers made this page load, by kind (the Lab and the tests read it) */
    this.counts = Object.create(null);
    this._sync();
    life.action?.("roar's answer", () => this.answerRoar(1, true), 'the world answers a roar: a front from the boss, the creatures flee, what lies is thrown');
    life.action?.('hush 2 s', () => life.hushFor(2, 1), 'the world holds its breath for 2 s');
  }

  get on() {
    return !!this.life.on?.('answer');
  }

  /** Subscribe while the piece is on, unsubscribe when it goes off. */
  _sync() {
    const ev = this.life.game?.events;
    const want = this.on && typeof ev?.on === 'function';
    if (want && !this._offs) {
      const offs = [];
      const sub = (name, fn) => {
        const off = ev.on(name, (d) => {
          if (this.on) fn(d ?? {});
        });
        offs.push(typeof off === 'function' ? off : () => ev.off?.(name, fn));
      };
      sub('dragon:roar', (d) => this.answerRoar(num(d.strength, 1)));
      sub('dragon:wake', () => this.answerWake());
      for (const n of BLOWS) sub(n, (d) => this.answerBlow(n, d));
      sub('combat:tell', (d) => this.answerTell(d));
      sub('combat:charge', (d) => this.answerCharge(d));
      for (const n of PHASES) sub(n, () => this.answerPhase());
      sub('dragon:dead', () => this.answerLull());
      sub('game:victory', () => this.answerLull());
      sub('player:died', () => this.answerDied());
      this._offs = offs;
    } else if (!want && this._offs) {
      for (const off of this._offs) {
        try {
          off();
        } catch {
          /* already gone */
        }
      }
      this._offs = null;
      this._phaseFront = -1;
    }
  }

  /** May an answer of this kind run now? (marks it when it may) */
  _gate(kind) {
    const t = this.life.t, last = this._last[kind];
    if (last !== undefined && t - last < (this.T.gap[kind] ?? 0)) return false;
    this._last[kind] = t;
    this.counts[kind] = (this.counts[kind] ?? 0) + 1;
    return true;
  }

  /** Where the boss stands (null when there is none). */
  _boss() {
    const p = this.life.game?.dragon?.position ?? this.life.game?.boss?.position;
    return p && Number.isFinite(p.x + p.z) ? p : null;
  }

  /** A front from (x, z) toward the hero (the prevailing wind's way when he stands on the point). */
  _front(o, x, z, k) {
    const L = this.life, h = L.hero;
    let dx = num(h?.x, 0) - x, dz = num(h?.z, 0) - z;
    const len = Math.hypot(dx, dz);
    if (len > 0.5) {
      dx /= len;
      dz /= len;
    } else {
      dx = num(L.wind?.dirX, 1);
      dz = num(L.wind?.dirZ, 0);
    }
    // (x, z: where it starts; a wind that sends fronts only from the level's edge may ignore them)
    L._call?.('wind', 'front', { strength: o.strength * k * L.k, speed: o.speed, width: o.width, dirX: dx, dirZ: dz, x, z });
  }

  _startle(x, z, r, k) {
    if (r > 0 && k > 0) this.life._call?.('creatures', 'startle', x, z, r, k * this.life.k);
  }

  _scatter(x, z, r, k) {
    if (r > 0 && k > 0) this.life._call?.('litter', 'scatter', x, z, r, k * this.life.k);
  }

  answerRoar(strength = 1, force = false) {
    if (!force && !this._gate('roar')) return false;
    const R = this.T.roar, b = this._boss(), h = this.life.hero;
    const x = b ? b.x : num(h?.x, 0), z = b ? b.z : num(h?.z, 0);
    const s = Math.min(2, Math.max(0.3, num(strength, 1)));
    this._front(R.front, x, z, s);
    this._startle(x, z, R.startleR, R.startleK * s);
    this._scatter(x, z, R.scatterR, R.scatterK * s);
    return true;
  }

  answerWake() {
    if (!this._gate('wake')) return false;
    const W = this.T.wake, b = this._boss();
    if (!b) return false;
    this._front(W.front, b.x, b.z, 1);
    this._startle(b.x, b.z, W.startleR, W.startleK);
    this._scatter(b.x, b.z, W.scatterR, W.scatterK);
    return true;
  }

  answerBlow(name, d) {
    const B = this.T.blow;
    // the hero's own blows carry no point: they land where he stands
    let x = num(d?.x, NaN), z = num(d?.z, NaN);
    if (!Number.isFinite(x + z)) {
      const p = name.startsWith('player:') ? this.life.hero : this._boss();
      if (!p) return false;
      x = num(p.x, NaN);
      z = num(p.z, NaN);
      if (!Number.isFinite(x + z)) return false;
    }
    if (!this._gate('blow')) return false;
    const r = Math.min(B.maxR, Math.max(B.scatterR, num(d?.radius, 0) * B.radiusK));
    this._scatter(x, z, r, B.scatterK);
    this._startle(x, z, Math.max(B.startleR, r * 1.5), B.startleK);
    return true;
  }

  _hush(sec, k) {
    const H = this.T.hush;
    if (!this._gate('hush')) return false;
    this.life.hushFor(Math.min(H.maxSec, Math.max(H.minSec, num(sec, H.minSec))), k);
    return true;
  }

  answerTell(d) {
    // a bullet's tell (a volley of them) is not a great blow
    if (!d || !GREAT.has(d.tell) || d.bullet) return false;
    return this._hush(d.impactIn, this.T.hush.k);
  }

  answerCharge(d) {
    return this._hush(d?.dur, this.T.hush.chargeK);
  }

  answerPhase() {
    if (!this._gate('phase')) return false;
    const P = this.T.phase;
    this.life.hushFor(P.hushSec, P.hushK);
    this._phaseFront = P.hushSec;
    return true;
  }

  answerLull() {
    if (!this._gate('lull')) return false;
    this._phaseFront = -1;
    this.life.hushFor(this.T.lull.sec, this.T.lull.k);
    return true;
  }

  answerDied() {
    if (!this._gate('died')) return false;
    this.life.hushFor(this.T.died.sec, this.T.died.k);
    return true;
  }

  /** life.gust calls this: a strong burst startles what lives within its radius. */
  gust(x, z, strength, radius) {
    if (!this.on) return false;
    const G = this.T.gust;
    if (!(strength >= G.minStrength) || !Number.isFinite(x + z + radius)) return false;
    if (!this._gate('gust')) return false;
    this._startle(x, z, radius, G.startleK * Math.min(2, strength / G.minStrength));
    return true;
  }

  update(dt) {
    this._sync();
    if (!this.on) return;
    if (this._phaseFront >= 0) {
      this._phaseFront -= dt;
      if (this._phaseFront < 0) {
        const P = this.T.phase, b = this._boss(), h = this.life.hero;
        const x = b ? b.x : num(h?.x, 0), z = b ? b.z : num(h?.z, 0);
        this._front(P.front, x, z, 1);
        this._startle(x, z, P.startleR, P.startleK);
      }
    }
  }

  clear() {
    this._phaseFront = -1;
  }

  setVisible() {}

  takes() {
    return false;
  }
}
