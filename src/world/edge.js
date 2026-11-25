import { BREAK } from './breakTuning.js';

// The edge of the open ground (ADR-125): where the hero and the boss may go follows what still STANDS
// of a set's wall. A set that wants it returns `edge: { base, outer? }` and marks the pieces that close
// its ground with `edge: <block radius, m>` in their `breakables` entry (the forest's ring of trees).
//
// The ring round the arena's centre is cut into `BREAK.edge.lanes` lanes. In each lane the ground ends
// `margin` m short of the nearest piece still standing in it (no piece left: at `outer`). Until
// something in a lane has come down the lane is SEALED at `base` (the fixed circle the level always
// had), so a fight starts on the ground it always started on; a sealed lane with no tree near the line
// gives way sideways beside open ground, as far as its own trees allow (no invisible wall where nothing stands).
//
//   edge.heroAt(x, z)        how far out the hero's ground goes in that direction (m from the centre)
//   edge.keep(pos, radius)   push a circle back onto the hero's ground (the lanes' ends and side walls)
//   edge.bossGain(x, z)      how much further than its own bound a boss may go that way (>= 0, m): the
//                            same ground narrowed (`body` m off either side of a gap, then no steeper
//                            than `slope`: a slot lets a big body in not at all, a wide gap nearly all the way)
//   edge.reaches(ax, az, bx, bz, pad)   does a segment touch the hero's ground (a falling tree's strip)
//   edge.open, edge.version  anything open at all; counts every change (the minimap re-bakes on it)
//   edge.lanes, edge.grew, edge.grewLane   lanes open; what the last reading opened (destructibles
//                            emits world:edge from it)
//   edge.R (Float32Array, per lane), edge.n, edge.base, edge.outer, edge.laneAngle(i)
// The ground is star-shaped round the centre: whoever stands on it can always walk straight back in.
//
// WALK mode (a set's `edge.walk`: Cinderwood since the fire-and-forest pass, the owner's "no invisible
// walls: if it looks like the player is able to walk there"): the hero's ground is the whole forest
// out to the set's true end (`walk.at(angle)`: m from the centre, inside its rock ridge), from the
// start; the trunks and rocks that stand in it are his walls (their colliders), the ridge's crags the
// last one, and this ground only the backstop behind them. What the wall's fallen trees open (the
// lanes above) is then the BOSS's alone (`bossGain`), and a boss follows the hero out too: its gain
// rises with how far past `base` he stands (+ BREAK.edge.walk.lead m) at once and falls at
// `walk.ease` m/s (never below how far past its own bound the boss stands: its ground is not pulled
// from under it), never past `walk.bossIn` m short of the end. `open` is true while he stands past
// `base` or a lane is torn (what reads an arena's radius off it follows him out); `reaches` reads the
// base circle (or the torn lanes) while he stands inside it. No world:edge in walk mode (his ground
// never changes; `version` counts his stepping out and back in: the minimap's zoom).
//   edge.walk (bool), edge.W (Float32Array per lane: the end), edge.out, edge.follow

const TAU = Math.PI * 2;
/**
 * The piece still closes its lanes: INTACT 0, FALLING 1 (it opens the ground once it is down) and
 * HELD 3 (destructibles.js STATE: a boss that drops what it tore up stands it back, and ground must
 * never close under the hero in a fight; only the reset shuts it).
 */
const stands = (b) => b.state <= 1 || b.state === 3;

export class Edge {
  /**
   * `list`: the destructibles' pieces (each with `def.edge` > 0 closes lanes). `cfg`: the set's `edge`.
   * `game` (optional): where the hero is (walk mode: `game.player.position`).
   */
  constructor(list, cfg, game = null) {
    const E = BREAK.edge;
    const base = Number(cfg?.base);
    this.base = Number.isFinite(base) && base > 0 ? base : 31;
    const outer = Number(cfg?.outer ?? E.outer);
    this.outer = Math.max(this.base, Number.isFinite(outer) ? outer : this.base);
    const N = (this.n = Math.max(8, E.lanes | 0));
    this.step = TAU / N;
    /** the hero's ground per lane (m from the centre) */
    this.R = new Float32Array(N).fill(this.base);
    /** a boss's gain per lane (m past its own bound) */
    this.G = new Float32Array(N);
    this._F = new Float32Array(N); // the nearest standing piece's line per lane
    this._F0 = new Float32Array(N); // ... with everything standing
    this._opened = new Uint8Array(N);
    this._open = false;
    this.version = 0;
    this.game = game;
    // walk mode: the hero's ground is the set's whole forest out to its end (`cfg.walk.at(angle)`)
    const at = typeof cfg?.walk?.at === 'function' ? cfg.walk.at : null;
    this.walk = !!at;
    /** walk mode: the hero's ground per lane (m from the centre): the end, read at the lane's sides and middle (the least) */
    this.W = new Float32Array(N).fill(this.base);
    if (at) {
      for (let i = 0; i < N; i++) {
        let w = Infinity;
        for (let k = 0; k <= 4; k++) {
          const v = Number(at(-Math.PI + (i + k / 4) * this.step));
          if (Number.isFinite(v) && v < w) w = v;
        }
        this.W[i] = Number.isFinite(w) ? Math.max(this.base, w) : this.base;
      }
    }
    /** the lanes' torn ground (what the fallen wall opened): R itself in the classic mode, the boss's alone in walk mode */
    this.T = this.walk ? new Float32Array(N).fill(this.base) : this.R;
    /** walk mode: the hero stands past `base`; the boss's follow gain (m) */
    this.out = false;
    this.follow = 0;
    this._torn = false;
    this.lanes = 0;
    this.grew = 0;
    this.grewLane = -1;
    this._t = 0;
    // each lane's pieces, nearest first
    const lanes = Array.from({ length: N }, () => []);
    let count = 0;
    for (const b of Array.isArray(list) ? list : []) {
      const block = Number(b?.def?.edge);
      if (!(block > 0)) continue;
      const rad = Math.hypot(b.x, b.z);
      if (!(rad > this.base)) continue; // (what stands inside the base circle is the clearing's)
      const th = Math.atan2(b.z, b.x), half = Math.asin(Math.min(1, block / rad));
      const i0 = Math.floor((th - half + Math.PI) / this.step), i1 = Math.floor((th + half + Math.PI) / this.step);
      const at = Math.max(this.base, rad - E.margin);
      for (let i = i0; i <= i1; i++) lanes[((i % N) + N) % N].push({ b, at });
      count++;
    }
    for (const l of lanes) l.sort((p, q) => p.at - q.at);
    this._lanes = lanes;
    /** pieces that close a lane */
    this.count = count;
    this._scan();
    this._F0.set(this._F);
    if (this.walk) this.R.set(this.W);
    this.refresh();
    this.version = 0;
  }

  /** Any ground past the base circle in play: a lane torn open, or (walk mode) the hero standing out past it. */
  get open() {
    return this._open || (this.walk && this.out);
  }
  set open(v) {
    this._open = !!v;
  }

  _scan() {
    const F = this._F, L = this._lanes;
    for (let i = 0; i < this.n; i++) {
      const l = L[i];
      let f = this.outer;
      for (let k = 0; k < l.length; k++) {
        if (stands(l[k].b)) {
          f = l[k].at;
          break;
        }
      }
      F[i] = f < this.outer ? f : this.outer;
    }
  }

  /** Read the pieces again (destructibles.update does, every BREAK.edge.every s; reset at once). True if the ground changed. */
  refresh() {
    const N = this.n, F = this._F, F0 = this._F0, R = this.T, G = this.G, op = this._opened, base = this.base;
    this._scan();
    let changed = false, open = false;
    // a lane something came down in ends at its nearest standing piece; the others are sealed at the base
    const prev = this._prev ?? (this._prev = new Float32Array(N));
    prev.set(R);
    for (let i = 0; i < N; i++) {
      op[i] = F[i] > F0[i] + 1e-3 ? 1 : 0;
      R[i] = op[i] ? F[i] : base;
    }
    // ... and a sealed lane with no tree near the line (a natural gap in the wall, the path south) gives
    // way sideways: as far as the more open of its neighbours, never past its own trees. One whose
    // trees stand within `seal` m of the line stays shut (or the whole ring would shift at the first breach)
    const least = base + BREAK.edge.seal;
    for (let k = 0; k < 2 * N; k++) {
      const i = k % N;
      if (op[i]) continue;
      const a = R[(i + N - 1) % N], b = R[(i + 1) % N], v = Math.min(F[i], a > b ? a : b);
      if (v > least && v > R[i]) R[i] = v;
    }
    for (let k = 2 * N - 1; k >= 0; k--) {
      const i = k % N;
      if (op[i]) continue;
      const a = R[(i + N - 1) % N], b = R[(i + 1) % N], v = Math.min(F[i], a > b ? a : b);
      if (v > least && v > R[i]) R[i] = v;
    }
    // a boss's share of it: what the hero has, less `body` m at either side of a gap (its shoulders do
    // not fit a slot), and from there no steeper than `slope` (m out per m along the ring), so a
    // radial clamp never drags a big body hard sideways
    const rise = BREAK.edge.slope * this.step * base, wide = Math.max(0, Math.ceil(BREAK.edge.body / (this.step * base)));
    for (let i = 0; i < N; i++) {
      let g = R[i] - base;
      for (let k = 1; k <= wide && g > 0; k++) {
        const a = R[(i + k) % N] - base, b = R[(i - k + N) % N] - base;
        if (a < g) g = a;
        if (b < g) g = b;
      }
      G[i] = g > 0 ? g : 0;
    }
    for (let k = 0; k < 2 * N; k++) {
      const i = k % N, v = G[(i + N - 1) % N] + rise;
      if (v < G[i]) G[i] = v;
    }
    for (let k = 2 * N - 1; k >= 0; k--) {
      const i = k % N, v = G[(i + 1) % N] + rise;
      if (v < G[i]) G[i] = v;
    }
    let lanes = 0, grew = 0, at = -1;
    for (let i = 0; i < N; i++) {
      if (R[i] > base + 1e-3) {
        open = true;
        lanes++;
      }
      const d = R[i] - prev[i];
      if (Math.abs(d) > 1e-4) changed = true;
      if (d > grew) {
        grew = d;
        at = i;
      }
    }
    this._open = open;
    this._torn = open;
    /** lanes open; the lane that moved furthest out at the last reading and by how much (m; 0: none did) */
    this.lanes = lanes;
    this.grew = grew;
    this.grewLane = at;
    if (this.walk) {
      // (the hero's ground never moves in walk mode: what opened is the boss's, and no world:edge)
      this.grew = 0;
      this.grewLane = -1;
      return false;
    }
    if (changed) this.version++;
    return changed;
  }

  /** Reads the pieces every BREAK.edge.every s. True when ground opened at this reading (`grew`, `grewLane`). */
  update(dt) {
    if (this.walk) this._follow(dt);
    this._t -= dt;
    if (this._t > 0) return false;
    this._t = BREAK.edge.every;
    return this.refresh() && this.grew > 0;
  }

  /** Walk mode: is the hero out past `base` (`version` counts it: the minimap's zoom), and the boss's follow gain. */
  _follow(dt) {
    const p = this.game?.player?.position, WK = BREAK.edge.walk;
    const hr = p ? Math.hypot(p.x, p.z) : 0;
    if (!Number.isFinite(hr)) return;
    const out = hr > this.base;
    if (out !== this.out) {
      this.out = out;
      this.version++;
    }
    const want = out ? hr - this.base + WK.lead : 0;
    const ease = Number.isFinite(dt) && dt > 0 ? WK.ease * dt : 0;
    if (want >= this.follow) this.follow = want;
    else {
      // (falling, it never pulls the ground from under the boss: no lower than how far past its own
      // bound it stands now; it walks back in after the hero and the ground comes in with it)
      const B = this.game?.boss ?? this.game?.dragon, bp = B?.position, bb = Number(B?.bound);
      const keep = bp && Number.isFinite(bb) ? Math.hypot(bp.x, bp.z) - bb : 0;
      this.follow = Math.max(want, this.follow - ease, Math.min(this.follow, Number.isFinite(keep) ? keep : 0));
    }
  }

  lane(x, z) {
    const i = Math.floor((Math.atan2(z, x) + Math.PI) / this.step);
    return i >= this.n ? this.n - 1 : i < 0 ? 0 : i;
  }

  /** The angle of lane i's middle (rad, atan2(z, x)); its sides are step / 2 either way. */
  laneAngle(i) {
    return -Math.PI + (i + 0.5) * this.step;
  }

  /** How far out the hero's ground goes in the direction of (x, z): m from the centre. */
  heroAt(x, z) {
    if (this.walk) return this.W[this.lane(x, z)];
    return this.open ? this.R[this.lane(x, z)] : this.base;
  }

  /** How much further out than its own bound a boss may stand in the direction of (x, z): m, >= 0. */
  bossGain(x, z) {
    if (!this.open) return 0;
    const N = this.n, u = (Math.atan2(z, x) + Math.PI) / this.step - 0.5;
    const f = Math.floor(u), t = u - f, i = ((f % N) + N) % N;
    let g = this._torn ? this.G[i] * (1 - t) + this.G[(i + 1) % N] * t : 0;
    if (this.walk) {
      // (it follows the hero out, never past `bossIn` m short of the end in that direction)
      if (this.follow > g) g = this.follow;
      const W = this.W, cap = Math.min(W[i], W[(i + 1) % N]) - this.base - BREAK.edge.walk.bossIn;
      if (g > cap) g = cap;
    }
    return g > 0 ? g : 0;
  }

  /**
   * The ground that counts for a falling piece's warning: the hero's (walk mode: the forest while he
   * stands out in it; the base circle and the torn lanes while he stands inside it).
   */
  _ground(x, z) {
    if (!this.walk || this.out) return this.heroAt(x, z);
    return this._torn ? this.T[this.lane(x, z)] : this.base;
  }

  /** Does the segment a → b come within `pad` m of ground the hero can stand on? */
  reaches(ax, az, bx, bz, pad = 0) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 1.5));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (Math.hypot(x, z) <= this._ground(x, z) + pad) return true;
    }
    return false;
  }

  /**
   * Keep a circle (pos.x / pos.z, radius) on the hero's ground: inside its lane's end, off the side
   * walls of the lanes that end sooner. Mutates pos. Returns true if it moved.
   */
  keep(pos, radius = 0) {
    const base = this.base;
    let r = Math.hypot(pos.x, pos.z);
    if (!this.open && !this.walk) {
      const max = base - radius;
      if (r <= max) return false;
      pos.x *= max / r;
      pos.z *= max / r;
      return true;
    }
    if (r <= base - radius - 1e-6) return false;
    const N = this.n, R = this.R, step = this.step;
    let th = Math.atan2(pos.z, pos.x);
    let L = this.lane(pos.x, pos.z), hit = false;
    if (r > R[L]) {
      // outside (a step sideways out of a deep lane, a teleport): back into the lane beside it if
      // that is nearer than the way straight in
      const inward = r - R[L] + radius;
      let best = inward, to = -1, side = 0, wall = 0;
      for (let s = -3; s <= 3; s++) {
        if (!s) continue;
        const j = (((L + s) % N) + N) % N;
        if (R[j] < r) continue;
        // (the side of lane j that faces this one)
        const edgeA = -Math.PI + (s > 0 ? L + s : L + s + 1) * step;
        const d = Math.abs(edgeA - th) * r + radius;
        if (d < best) {
          best = d;
          to = j;
          side = s > 0 ? 1 : -1;
          wall = edgeA;
        }
      }
      if (to >= 0) {
        const a = wall + side * Math.min(radius / Math.max(1, r), step * 0.45);
        pos.x = Math.cos(a) * r;
        pos.z = Math.sin(a) * r;
        th = a;
        L = to;
        hit = true;
      }
    }
    for (let it = 0; it < 2; it++) {
      // the lane's end
      const max = R[L] - radius;
      if (r > max) {
        const k = max / (r || 1);
        pos.x *= k;
        pos.z *= k;
        r = max;
        hit = true;
      }
      // the side walls: where a neighbour ends sooner, a radial wall from its end outward
      let pushed = false;
      for (let s = -1; s <= 1; s += 2) {
        const j = (L + s + N) % N;
        if (R[j] >= R[L] || r + radius <= R[j]) continue;
        const wa = -Math.PI + (s > 0 ? L + 1 : L) * step, ux = Math.cos(wa), uz = Math.sin(wa);
        const along = pos.x * ux + pos.z * uz;
        const t = along < R[j] ? R[j] : along > R[L] ? R[L] : along;
        const qx = ux * t, qz = uz * t;
        let dx = pos.x - qx, dz = pos.z - qz;
        const d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        if (d < 1e-5) {
          // on the wall: into the lane, across it
          dx = s > 0 ? uz : -uz;
          dz = s > 0 ? -ux : ux;
          pos.x = qx + dx * radius;
          pos.z = qz + dz * radius;
        } else {
          pos.x = qx + (dx / d) * radius;
          pos.z = qz + (dz / d) * radius;
        }
        pushed = hit = true;
      }
      if (!pushed) break;
      r = Math.hypot(pos.x, pos.z);
      L = this.lane(pos.x, pos.z);
    }
    return hit;
  }
}

/**
 * world.resolve's rule, shared with the tests' mock worlds: push a circle out of the colliders, then
 * keep it inside `bound` (a circle round the centre), or, for `who` = 'hero' on a set with an edge,
 * on the hero's ground (`bound` is then only the fallback).
 */
export function resolveOn(colliders, edge, pos, radius, bound = Infinity, soft = false, who = null) {
  if (edge && who === 'hero') {
    const a = colliders.resolve(pos, radius, Infinity, soft);
    const b = edge.keep(pos, radius);
    return a || b;
  }
  return colliders.resolve(pos, radius, bound, soft);
}
