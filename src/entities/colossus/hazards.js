import { TELL, RESULT } from '../../combat/rules.js';
import { BLOW } from '../../world/breakTuning.js';
import { SHELF, rimZ } from '../../world/tideShelf.js';
import { ATTACKS, TUNING } from './tuning.js';

// The Tide Colossus's hazards (ADR-141): what its moves leave on the shelf after the blow itself.
//   the surge   a wall of water `depth` m deep crossing the whole shelf north to south at `speed` m/s
//               (ATTACKS.surge). One blow (red, a hazard: no plunge); its cue when the front is
//               flashLead from the hero; the stone wets ahead of it. A standing piece of cover splits it
//               and leaves a safe pocket behind it (`pocket` m deep). Racks and boats go, menhirs chip.
//   the lines   phase 3: each pass of the breath leaves its line glowing `linger` s: contact ticks of
//               `tickDamage` every `tick` s (a blockable chip; never while he rolls).
// Drawn as brine in the fire field (fx.js). Cleared by a phase's bellow, a posture break, death, reset.

const S = ATTACKS.surge, B = ATTACKS.breath;
const POCKET = 3.6;
const MAX_LINES = 3, MAX_PTS = 48;
const SURGE_O = { kind: BLOW.BLAST, by: 'boss', dx: 0, dz: 1, y: 1.0, src: -1 };

export class TideHazards {
  constructor(c) {
    this.c = c;
    this.surge = { on: false, z: 0, a: null, b: null, def: null, hit: false, src: -1, x0: 0, x1: 0 };
    // the breath's lines: points as [x, z] pairs, an age; `cur` the one a pass is laying now
    this.lines = Array.from({ length: MAX_LINES }, () => ({ on: false, pts: new Float32Array(MAX_PTS * 2), n: 0, age: 0, tickT: 0 }));
    this.cur = null;
  }

  reset() {
    this.surge.on = false;
    for (const L of this.lines) L.on = false;
    this.cur = null;
  }

  get active() {
    return this.surge.on || this.lines.some((L) => L.on);
  }

  /** The surge's front leaves the rim now (the move's windup is over). */
  startSurge(a, b, def) {
    const s = this.surge;
    s.on = true;
    s.a = a;
    s.b = b;
    s.def = def;
    s.z = SHELF.edgeZ - 0.5;
    s.hit = false;
    s.src = this.c.game.world?.destructibles?.swing?.() ?? -1;
  }

  /** A point of the line the breath is laying now (phase 3). */
  linePoint(x, z) {
    if (!this.cur) {
      let L = this.lines.find((l) => !l.on);
      if (!L) L = this.lines.reduce((o, l) => (l.age > o.age ? l : o), this.lines[0]);
      L.on = true;
      L.n = 0;
      L.age = 0;
      L.tickT = 0;
      this.cur = L;
    }
    const L = this.cur;
    if (L.n >= MAX_PTS) return;
    L.pts[L.n * 2] = x;
    L.pts[L.n * 2 + 1] = z;
    L.n++;
  }

  /** The pass is over: the line it laid is finished (its age runs from now). */
  flushLine() {
    if (this.cur) this.cur.age = 0;
    this.cur = null;
  }

  update(dt) {
    const c = this.c;
    if (!(dt > 0)) return;
    if (this.surge.on) this._surge(dt);
    // (one tick clock for all the lines: standing where two cross is not twice the chip)
    this.tickT = (this.tickT ?? 0) - dt;
    let touch = false;
    for (const L of this.lines) {
      if (!L.on) continue;
      if (L !== this.cur) L.age += dt;
      if (L.age >= B.linger) {
        L.on = false;
        continue;
      }
      const k = L.age > B.linger - 1 ? Math.max(0, B.linger - L.age) : 1;
      c.fx.line(L.pts, L.n, k);
      if (!touch && this.tickT <= 0) touch = this._lineTouch(L);
    }
    if (touch) this._lineTick();
  }

  _surge(dt) {
    const c = this.c, s = this.surge, D = s.def ?? S, p = c.game.player?.position, lead = TUNING.flashLead;
    const z0 = s.z;
    s.z += D.speed * dt;
    const hx = p?.x ?? 0;
    s.x0 = hx - 22;
    s.x1 = hx + 22;
    c.fx.surgeFront(s.z, s.x0, s.x1, D.depth);
    // the stone wets ahead of it
    if (Math.random() < dt * 30) c.fx.wetSpeck(hx + (Math.random() - 0.5) * 30, s.z + 1 + Math.random() * 3, 0.5);
    // the world: what stands in the front's way (each piece once)
    const DS = c.game.world?.destructibles;
    if (DS?.sweep) {
      SURGE_O.src = s.src;
      DS.sweep(-34, s.z, 34, s.z, Math.max(0.8, s.z - z0 + 0.6), TUNING.world.surge, SURGE_O);
    }
    const b = s.b, a = s.a;
    if (p && b && a) {
      const pr = c.game.player?.radius ?? 0.45;
      b.x = hx;
      b.z = Math.min(s.z, p.z);
      // its cue: the front flashLead from him (a hazard's cue: the red blaze where it lands)
      if (!b.flashed && s.z + D.speed * lead >= p.z - pr) {
        if (!b.told) c.announceTell(a, b);
        c.flashTell(a, b);
      }
      if (!s.hit && s.z >= p.z - pr && s.z - D.depth <= p.z + pr) {
        s.hit = true;
        if (!this._pocket(p.x, p.z)) {
          if (!b.flashed) c.flashTell(a, b);
          c.hitPlayer(a, b, { damage: D.damage, knockback: D.knockback, kind: 'surge', tell: TELL.RED, plunge: false, from: { x: p.x, y: 1, z: p.z - 3 }, point: { x: p.x, y: 1, z: p.z }, melee: false, attack: 'surge' });
        } else b.done = true;
      }
    }
    if (s.z > SHELF.scarpZ + 3) s.on = false;
  }

  /** A standing piece of cover just north of (x, z) splits the surge: a safe pocket behind it. */
  _pocket(x, z) {
    const L = this.c.game.world?.destructibles?.list;
    if (!L) return false;
    for (const q of L) {
      if (q.state !== 0 || !q.cover || q.floor) continue;
      const dz = z - q.z;
      if (dz > 0 && dz < POCKET + q.r && Math.abs(x - q.x) < q.r + 0.25) return true;
    }
    return false;
  }

  /** Is the hero on line L (and not rolling)? */
  _lineTouch(L) {
    const c = this.c, pl = c.game.player, p = pl?.position;
    if (!p || pl.alive === false || pl.state === 'roll') return false;
    const pr = pl.radius ?? 0.45;
    for (let i = 0; i + 1 < L.n; i++) {
      const ax = L.pts[i * 2], az = L.pts[i * 2 + 1], bx = L.pts[i * 2 + 2], bz = L.pts[i * 2 + 3];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-6;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l2));
      if (Math.hypot(p.x - (ax + dx * t), p.z - (az + dz * t)) <= 0.5 + pr) return true;
    }
    return false;
  }

  /** One contact tick on the hero. */
  _lineTick() {
    const c = this.c, p = c.game.player?.position;
    if (!p) return;
    this.tickT = B.tick;
    // a contact tick (no knockback, no knockdown, under 8: player.js counts it a stream): a block chips
    c.hitPlayer(null, null, { damage: B.tickDamage, knockback: 0, kind: 'brine', tell: TELL.NORMAL, parryable: false, blockable: true, perfect: false, plunge: false, from: { x: p.x, y: 0.5, z: p.z - 0.5 }, point: { x: p.x, y: 0.5, z: p.z }, melee: false, attack: 'breath' });
  }
}

export { RESULT, rimZ };
