import { clamp } from '../../../core/math.js';
import { TELL } from '../../../combat/rules.js';
import { perPhase } from '../duelist/realise.js';

// The Pearl of the Hollow Moon (ADR-147; COMBAT.md → "The Thousand-Body Fox" → "The Pearl"): the
// gameplay of Wen Yao's orb. The drawing is FoxFx's (fx.js: pearlCharge, pearlThread, pearlFly,
// pearlMark, pearlBurst, pearlFizzle).
//
//   THE CHARGE   the windup of `foxPearl`'s cast beat (`pearl: 'charge'`). It hangs over the blade's
//                tip and grows; a crisp thread runs to it from every live self (pop a self and its
//                thread snaps). His guard is down through it (fox.js `guarding`) and hit stun does not
//                stop it, but TUNING.pearl.interrupt.hits cuts (one heavy) burst it in his hand: he
//                reels, +posture, every ledger handle of it cancelled. Its landing is told to the ledger
//                from the charge's start (an estimate, retimed at the bat), so his selves' cuts and his
//                own blows wait for it.
//   THE BAT      the cast beat's impact: `count` pearls (one per phase entry) leave the blade for the
//                hero's spot led by `lead` s (fixed at the bat), in a row across his line of sight
//                `spread` m apart, landing together `time[0] + distance / per` s later (time[1] at most).
//                The fairness guard may lengthen that by `maxDelay`; if no wait clears it the pearls come
//                apart in the air, uncued and harmless (the kicked lantern's rule). The ground each will
//                burst on heats from the bat to the burst (a hazard's mark, ADR-052), and the middle one
//                cues itself (combat:flash, red, `hazard`) flashLead before it lands.
//   THE BURST    a ring of r0 + perClone × the selves alive at the bat (rMax at most) round each spot:
//                red (no parry, no block, a roll), damage + perCloneDamage × those selves; it pops every
//                self it reaches and hits the world (world.impact, T.world.pearl).

const MAX = 3;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

export class FoxPearl {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.T = d.T.pearl;
    /** the pearls in flight */
    this.shots = Array.from({ length: MAX }, () => ({ live: false, x0: 0, y0: 0, z0: 0, x: 0, y: 0, z: 0, tx: 0, tz: 0, T: 1, t: 0 }));
    this._flash = { source: 'dragon', attack: 'foxPearl', tell: TELL.RED, x: 0, y: 0, z: 0, perilous: false, flare: true, hazard: true };
    this._blow = { kind: 'blast', by: 'boss', dx: NaN, dz: NaN, y: 1, src: -1, scar: true };
    this._from = { x: 0, z: 0 };
    this._extra = { plunge: false };
    this._v = d._v.clone();
    this._w = d._v.clone();
    this.reset();
  }

  reset() {
    this.charging = false;
    this.flying = false;
    this.quiet = false;
    this.hits = 0;
    this.heavy = 0;
    this.u = 0;
    this.selves = 0;
    this.handle?.cancel?.();
    this.handle = null;
    this.flashed = false;
    this.attack = 'foxPearl';
    for (const s of this.shots) s.live = false;
    this.landed = 0; // (tests: pearls that burst since the last reset)
    this.interrupts = 0;
  }

  /** The move starts (onActStart): the charge is ahead; tell the ledger where it will roughly land. */
  begin(act) {
    const b = act.beats.find((x) => x.def.pearl === 'charge');
    if (!b) return;
    this.charging = true;
    this.hits = 0;
    this.heavy = 0;
    this.u = 0;
    this.act = act;
    this.beat = b;
    this.attack = act.name;
    this.handle?.cancel?.();
    // (the estimate: the bat at the beat's impact, then a mid flight; retimed at the bat)
    this.handle = this.d.brain.expect?.(b.impact + this.T.time[0] + 0.15, TELL.RED, act.name) ?? null;
  }

  /** Every frame of the charge beat (fox.js beatMotion): the Pearl over the tip, the threads. */
  charge(b, u, dt) {
    const d = this.d;
    if (!this.charging || b !== this.beat) return;
    this.u = clamp(u, 0, 1);
    // its spot: a little past the blade's tip, up
    const t = d._tip, h = d._hilt, P = this._v;
    if (!d._tipOk) return;
    const ex = t.x - h.x, ey = t.y - h.y, ez = t.z - h.z, l = Math.hypot(ex, ey, ez) || 1;
    P.set(t.x + (ex / l) * 0.18, t.y + (ey / l) * 0.18 + 0.12, t.z + (ez / l) * 0.18);
    d.fx.pearlCharge?.(P.x, P.y, P.z, this.u, dt);
    const C = d.clones, W = this._w;
    if (C) for (let i = 0; i < C.list.length; i++) if (C.handPoint(i, W)) d.fx.pearlThread?.(W.x, W.y, W.z, P.x, P.y, P.z, dt);
  }

  /** A cut landed on him while he charges (fox.js takeHit). True: it burst in his hand. */
  struck(heavy) {
    if (!this.charging) return false;
    const I = this.T.interrupt;
    this.hits++;
    if (heavy) this.heavy++;
    if (this.hits < I.hits && this.heavy < I.heavy) return false;
    this.interrupt();
    return true;
  }

  /** It bursts in his hand: he reels (`interrupt.react`), +posture, the ledger forgets it. */
  interrupt() {
    const d = this.d, I = this.T.interrupt;
    this.charging = false;
    this.handle?.cancel?.();
    this.handle = null;
    this.interrupts++;
    if (d._tipOk) d.fx.pearlFizzle?.(d._tip.x, d._tip.y + 0.12, d._tip.z);
    d.emit('dragon:stagger');
    d.hitstop?.(0.08, 0.05);
    d.game.shake?.(0.22);
    d.addPosture(I.posture);
    if (!d.broken && d.mode === 'act') d.brain.startReact(I.react);
  }

  /** The move ended without the bat (a parry, a break, a phase): the Pearl comes apart quietly. */
  cancel() {
    if (!this.charging) return;
    this.charging = false;
    this.handle?.cancel?.();
    this.handle = null;
    const d = this.d;
    if (d._tipOk) d.fx.pearlFizzle?.(d._tip.x, d._tip.y + 0.12, d._tip.z);
  }

  /** The bat (the cast beat's impact: fox.js onCast). */
  bat(b, s, act) {
    const d = this.d, T = this.T, ph = d.phase;
    if (!this.charging) return;
    this.charging = false;
    const p = s?.p ?? this.game.player?.position;
    if (!p) {
      this.cancel();
      return;
    }
    const lead = T.lead;
    const cx = p.x + fin(s?.vx) * lead, cz = p.z + fin(s?.vz) * lead;
    const x0 = d._tipOk ? d._tip.x : d.position.x, y0 = d._tipOk ? d._tip.y : 1.3, z0 = d._tipOk ? d._tip.z : d.position.z;
    const dist = Math.hypot(cx - x0, cz - z0);
    let time = clamp(T.time[0] + dist / T.per, T.time[0], T.time[1]);
    // the fairness guard: a longer flight, or no cue and no burst
    const dl = d.brain.fairDelay?.(time, TELL.RED, T.maxDelay, act?.name ?? 'foxPearl') ?? 0;
    this.quiet = dl < 0;
    if (dl > 0) {
      time += dl;
      if (d.brain.stats) d.brain.stats.delays++;
    }
    if (this.quiet) {
      this.handle?.cancel?.();
      this.handle = null;
    } else if (this.handle?.alive) this.handle.retime(time);
    else this.handle = d.brain.expect?.(time, TELL.RED, act?.name ?? 'foxPearl') ?? null;
    // a row across his line of sight, the middle one at the hero
    const n = Math.max(1, Math.min(MAX, perPhase(T.count, ph) | 0));
    this.n = n;
    const lx = cx - d.position.x, lz = cz - d.position.z, ll = Math.hypot(lx, lz) || 1;
    const px = -lz / ll, pz = lx / ll;
    this.selves = d.clones?.live ?? 0;
    this.damage = T.damage + T.perCloneDamage * this.selves;
    this.radius = Math.min(T.rMax, T.r0 + T.perClone * this.selves);
    this.kb = b.def.knockback ?? 2.4;
    this.attack = act?.name ?? 'foxPearl';
    this.flashed = false;
    this.hit = false;
    for (let i = 0; i < MAX; i++) {
      const S = this.shots[i];
      S.live = i < n;
      if (!S.live) continue;
      const off = (i - (n - 1) / 2) * T.spread;
      let tx = cx + px * off, tz = cz + pz * off;
      // (inside the terrace: a pearl aimed off the edge comes down on its rim)
      const r = Math.hypot(tx, tz), B = d.bound + 2.5;
      if (r > B) {
        tx *= B / r;
        tz *= B / r;
      }
      S.x0 = x0;
      S.y0 = y0;
      S.z0 = z0;
      S.tx = tx;
      S.tz = tz;
      S.T = time;
      S.t = 0;
      S.x = x0;
      S.y = y0;
      S.z = z0;
    }
    this.flying = true;
    d.game.shake?.(0.12);
  }

  /** Every frame (fox.js brainFrame): the pearls in flight, their marks, the cue, the burst. */
  frame(dt) {
    if (!this.flying) return;
    const d = this.d, lead = perPhase(d.T.flashLead, d.phase);
    let any = false;
    for (let i = 0; i < MAX; i++) {
      const S = this.shots[i];
      if (!S.live) continue;
      S.t += dt;
      const k = clamp(S.t / Math.max(0.05, S.T), 0, 1);
      S.x = S.x0 + (S.tx - S.x0) * k;
      S.z = S.z0 + (S.tz - S.z0) * k;
      S.y = S.y0 * (1 - k) + 0.9 * k + 2.2 * k * (1 - k); // a low arc down onto its spot
      if (this.quiet) {
        // uncued and harmless: it comes apart in the air halfway
        if (k >= 0.5) {
          S.live = false;
          d.fx.pearlFizzle?.(S.x, S.y, S.z);
          continue;
        }
        d.fx.pearlFly?.(S.x, S.y, S.z, dt);
        any = true;
        continue;
      }
      d.fx.pearlFly?.(S.x, S.y, S.z, dt);
      d.fx.pearlMark?.(S.tx, S.tz, this.radius, k, dt);
      // the cue: on the middle pearl, flashLead before they land
      if (!this.flashed && i === (this.n - 1) >> 1 && S.T - S.t <= lead) {
        this.flashed = true;
        const f = this._flash;
        f.attack = this.attack;
        f.x = S.x;
        f.y = S.y;
        f.z = S.z;
        d.emit('combat:flash', f);
        d.fx.tellFlash(TELL.RED, S.x, S.y, S.z, 1, true);
      }
      if (k >= 1) {
        S.live = false;
        this._burst(S);
        continue;
      }
      any = true;
    }
    if (!any) {
      this.flying = false;
      this.handle = null;
    }
  }

  /** One pearl bursts on its spot: the hero once (red), the selves it reaches, the world. */
  _burst(S) {
    const d = this.d, r = this.radius, x = S.tx, z = S.tz;
    this.landed++;
    d.fx.pearlBurst?.(x, z, r);
    d.game.shake?.(0.3);
    // his own blast tears his selves
    d.clones?.popWithin(x, z, r, 'pearl');
    // the world: it chips the floor, the lanterns, the statues
    const W = d.game.world, o = this._blow;
    o.src = W?.destructibles?.swing?.() ?? -1;
    W?.impact?.(x, z, r, d.T.world.pearl, o);
    // the hero: once for the whole volley (a roll through it, never a guard)
    const pl = this.game.player, p = pl?.position;
    if (this.hit || !p || pl.alive === false || !this.flashed) return;
    const pr = pl.radius ?? 0.45;
    if (Math.hypot(p.x - x, p.z - z) > r + pr) return;
    this.hit = true;
    const from = this._from;
    from.x = x;
    from.z = z;
    d.hitPlayer({ damage: this.damage, knockback: this.kb, knockdown: true, kind: 'blast', tell: TELL.RED, parryable: false, blockable: false, attack: this.attack, from, extra: this._extra });
  }
}
