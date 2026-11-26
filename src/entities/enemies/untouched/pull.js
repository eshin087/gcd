import { TUNE as HERO_TUNE } from '../../player/player.js';

// THE PULL (R5 of the brief; core's rule): a knot of Azure Draw drags the hero toward it against his
// input for its life. A steady drag added to player.kb every frame (stepped from brainFrame): the
// hero's knock-back velocity decays at TUNE.knockbackDecay (6 /s), so adding `v x decay x dt` a frame
// holds a drift of v m/s toward the knot; he can run against it (at about half his speed at the
// knot's middle: measured in tests/integration/veil.mjs PULL) and a ROLL ignores it (TUNING.wjPull.rollK
// = 0: its own travel carries him out). Nothing drags a hero who is down, dead, or in a move of his
// own out of reach (plunge, flurry, lock, the Ghostep), and nothing while he is held (the domain).
// What flies to a knot (loose pieces, bricks, dust) is the spells agent's and the fx agent's: they
// read `pull.knots`.
//
// THE SURFACE:
//   pull.add({ x, z, strength, r, life, falloff }) → the knot record, or null (all T.max in use)
//       strength  m/s of drift at the knot's middle (default T.strength)
//       r         m: beyond this, no drag (default T.r)
//       life      s (default T.life); falloff: the drift is strength x (1 - dist / r) ^ falloff
//   knot: { on, x, z, strength, r, life, falloff, t, k (0..1 through its life), id }: the caller may move
//       it (x, z) every frame (a wrecking ball dragged across the crossing) or end it (knot.on = false)
//   pull.drift(x, z, out) → out {x, z}: the drift (m/s) all knots give at (x, z) now
//   pull.live        how many knots are on
//   pull.frame(dt), pull.stop() (every knot off), pull.reset()

const BLOCKED = new Set(['knockdown', 'dead', 'plunge', 'flurry', 'lock', 'ghostep', 'mikiri']);

export class Pull {
  constructor(d) {
    this.d = d;
    this.T = d.T.wjPull;
    this.knots = Array.from({ length: Math.max(1, this.T.max | 0) }, (_, i) => ({ on: false, x: 0, z: 0, strength: 0, r: 1, life: 1, falloff: 1, t: 0, k: 0, id: i }));
    this._v = { x: 0, z: 0 };
    this._n = 0;
  }

  get live() {
    let n = 0;
    for (const k of this.knots) if (k.on) n++;
    return n;
  }

  add(o = {}) {
    const T = this.T, x = Number(o.x), z = Number(o.z);
    if (!Number.isFinite(x + z)) return null;
    const k = this.knots.find((q) => !q.on);
    if (!k) return null;
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    k.on = true;
    k.x = x;
    k.z = z;
    k.strength = Math.max(0, num(o.strength, T.strength));
    k.r = Math.max(0.5, num(o.r, T.r));
    k.life = Math.max(0.05, num(o.life, T.life));
    k.falloff = Math.max(0, num(o.falloff, T.falloff));
    k.t = 0;
    k.k = 0;
    k.id = ++this._n;
    return k;
  }

  /** The drift (m/s) every knot gives at (x, z) now. */
  drift(x, z, out = this._v) {
    out.x = out.z = 0;
    for (const k of this.knots) {
      if (!k.on) continue;
      const dx = k.x - x, dz = k.z - z, dist = Math.hypot(dx, dz);
      if (!(dist > 0.15) || dist >= k.r) continue;
      const v = k.strength * Math.pow(1 - dist / k.r, k.falloff);
      out.x += (dx / dist) * v;
      out.z += (dz / dist) * v;
    }
    if (!Number.isFinite(out.x + out.z)) out.x = out.z = 0;
    return out;
  }

  frame(dt) {
    if (!(dt > 0)) return;
    let any = false;
    for (const k of this.knots) {
      if (!k.on) continue;
      k.t += dt;
      k.k = Math.min(1, k.t / k.life);
      if (k.t >= k.life) k.on = false;
      else any = true;
    }
    if (!any) return;
    const p = this.d.game.player;
    if (!p?.alive || !p.kb || BLOCKED.has(p.state) || this.d.domain?.holding) return;
    const kr = p.state === 'roll' ? this.T.rollK ?? 0 : 1;
    if (!(kr > 0)) return;
    const v = this.drift(p.position.x, p.position.z);
    const decay = HERO_TUNE?.knockbackDecay ?? 6; // (the drift holds at v m/s)
    p.kb.x += v.x * decay * dt * kr;
    p.kb.z += v.z * decay * dt * kr;
  }

  stop() {
    for (const k of this.knots) k.on = false;
  }

  reset() {
    this.stop();
  }
}
