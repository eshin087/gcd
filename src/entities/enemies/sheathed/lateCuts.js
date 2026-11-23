import { TELL } from '../../../combat/rules.js';
import { perPhase } from '../duelist/realise.js';

// Phase 3's hanging cuts (The Sound Arrives Late; COMBAT.md → "The Sheathed"). Three flicks of the bare
// blade at the air leave lines of heat marked across the ground (TUNING.late: `len` m long, `w` m wide,
// through where the hero stands, at angles spread round him); they cut one by one, the first `first` s
// after the flicks and the others `gap` s apart. Each is told to the cue ledger as it is made
// (brain.expect) and placed by the fairness guard (brain.fairDelay: a line that cannot be placed clear
// of another answer's impact fades uncut), cued `lead` s before it cuts with its own red flash (a
// hazard's: away from his body), and deals through hitPlayer({ projectile: true }). Every call to the
// world is guarded. Its own looks stream; the line angles draw from a gameplay stream of its own.
const POOL = 6;

export class LateCuts {
  constructor(d) {
    this.d = d;
    this.lines = Array.from({ length: POOL }, () => ({ live: false, ax: 0, az: 0, bx: 0, bz: 0, at: 0, flashed: false, h: null, t0: 0 }));
    this.t = 0;
    this._g = 0x1d2c3b4a;
    this._flash = { source: 'dragon', attack: 'lateRain', tell: TELL.RED, x: 0, y: 0.6, z: 0, hazard: true, perilous: false, flare: false };
    this._tell = { source: 'dragon', attack: 'lateRain', tell: TELL.RED, impactIn: 1, x: 0, z: 0, hazard: true, flare: false };
    this._wb = { kind: 'cut', by: 'boss', dx: 0, dz: 0, y: 1.05, src: -1 };
  }

  /** Its own gameplay stream (never Math.random: the seeded fights replay that). */
  rnd() {
    this._g = (Math.imul(this._g, 1664525) + 1013904223) >>> 0;
    return this._g / 4294967296;
  }

  reset() {
    for (const l of this.lines) {
      l.live = false;
      l.h?.cancel?.();
      l.h = null;
    }
    this.t = 0;
  }

  /** Something of his still hangs in the air. */
  get busy() {
    return this.lines.some((l) => l.live);
  }

  /** The flicks are done (the move's cast beat): mark the lines. */
  cast() {
    const d = this.d, L = d.T.late, br = d.brain, p = d.game.player?.position;
    if (!p) return 0;
    const n = d.hp < d.maxHp * 0.18 ? perPhase(L.count, 2) : perPhase(L.count, 1);
    const a0 = this.rnd() * Math.PI;
    let at = L.first, made = 0;
    for (let i = 0; i < n; i++) {
      const l = this.lines.find((x) => !x.live);
      if (!l) break;
      // through where the hero stands (a little off for the later ones), at angles spread round him
      const ang = a0 + (i * Math.PI) / n + (this.rnd() - 0.5) * 0.3;
      const dx = Math.sin(ang), dz = Math.cos(ang), off = i ? (this.rnd() - 0.5) * 1.2 : 0;
      const cx = p.x - dz * off, cz = p.z + dx * off;
      // (the fairness guard: placed clear of any other answer's impact, or not at all)
      const sh = br?.fairDelay ? br.fairDelay(at, TELL.RED, br.P?.guard?.maxDelay ?? 0.6, 'lateRain') : 0;
      if (sh < 0) {
        br.stats && br.stats.delays++;
        at += L.gap;
        continue;
      }
      if (sh > 0 && br.stats) br.stats.delays++;
      at += sh;
      l.live = true;
      l.ax = cx - dx * L.len * 0.5;
      l.az = cz - dz * L.len * 0.5;
      l.bx = cx + dx * L.len * 0.5;
      l.bz = cz + dz * L.len * 0.5;
      l.at = this.t + at;
      l.t0 = this.t;
      l.flashed = false;
      l.h = br?.expect?.(at, TELL.RED, 'lateRain') ?? null;
      const T = this._tell;
      T.impactIn = at;
      T.x = cx;
      T.z = cz;
      d.emit('combat:tell', T);
      made++;
      at += L.gap;
    }
    return made;
  }

  /** The hero's distance to a line, and the nearest point on it (into `o`). */
  _near(l, p, o) {
    const ex = l.bx - l.ax, ez = l.bz - l.az, ll = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((p.x - l.ax) * ex + (p.z - l.az) * ez) / ll));
    o.x = l.ax + ex * u;
    o.z = l.az + ez * u;
    return Math.hypot(p.x - o.x, p.z - o.z);
  }

  frame(dt) {
    if (!(dt > 0)) return;
    this.t += dt;
    const d = this.d, L = d.T.late, p = d.game.player, pp = p?.position, fx = d.fx;
    if (d.mode === 'dying' || d.mode === 'dead') {
      for (const l of this.lines) l.live = false;
      return;
    }
    const o = this._o ?? (this._o = { x: 0, z: 0 });
    for (const l of this.lines) {
      if (!l.live) continue;
      const k = Math.max(0, Math.min(1, (this.t - l.t0) / Math.max(0.05, l.at - l.t0)));
      fx?.lateLine?.(l.ax, l.az, l.bx, l.bz, k);
      if (!l.flashed && this.t >= l.at - L.lead) {
        l.flashed = true;
        if (pp) this._near(l, pp, o);
        else {
          o.x = (l.ax + l.bx) / 2;
          o.z = (l.az + l.bz) / 2;
        }
        const F = this._flash;
        F.x = o.x;
        F.z = o.z;
        d.emit('combat:flash', F);
        fx?.hazardFlash?.(TELL.RED, o.x, 0.9, o.z, 1);
      }
      if (this.t >= l.at) {
        l.live = false;
        l.h = null;
        fx?.lateCut?.(l.ax, l.az, l.bx, l.bz);
        const W = d.game.world, Dz = W?.destructibles;
        if (Dz?.sweep) {
          const b = this._wb, ex = l.bx - l.ax, ez = l.bz - l.az, ln = Math.hypot(ex, ez) || 1;
          b.dx = ex / ln;
          b.dz = ez / ln;
          b.src = Dz.swing?.() ?? -1;
          Dz.sweep(l.ax, l.az, l.bx, l.bz, L.w * 0.5, d.T.world?.late ?? 0.8, b);
        }
        d.game.shake?.(0.18);
        if (pp && p.alive !== false && this._near(l, pp, o) <= L.w * 0.5 + (p.radius ?? 0.45)) {
          d.hitPlayer({ damage: L.damage, knockback: L.knockback, tell: TELL.RED, attack: 'lateRain', projectile: true, from: { x: o.x - (pp.x - o.x) * 0.01, z: o.z - (pp.z - o.z) * 0.01 } });
        }
      }
    }
  }
}
