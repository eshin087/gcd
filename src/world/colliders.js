// Static circle colliders on the XZ plane (stones, trunks, bonfire) + circular arena bounds.
export class Colliders {
  constructor() {
    this.circles = [];
    /** Counts every change of the set (a breakable going, the reset): what bakes the circles (the minimap) re-bakes on it. */
    this.version = 0;
  }

  add(x, z, r, tag = 'static') {
    const c = { x, z, r, tag };
    this.circles.push(c);
    this.version++;
    return c;
  }

  /** Take a circle out (a breakable that fell: world/destructibles.js). True if it was in. */
  remove(c) {
    const i = this.circles.indexOf(c);
    if (i < 0) return false;
    this.circles.splice(i, 1);
    this.version++;
    return true;
  }

  /** Put a removed circle back (the fight's reset). No duplicate. */
  restore(c) {
    if (c && !this.circles.includes(c)) {
      this.circles.push(c);
      this.version++;
    }
    return c;
  }

  /**
   * Push a moving circle (pos.x/pos.z, radius) out of all colliders and keep it within `bound`
   * (radius around the origin). Mutates pos. Returns true if any correction happened.
   */
  resolve(pos, radius, bound = Infinity) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.circles) {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const min = radius + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1e-4;
          const push = min - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
          hit = true;
        }
      }
    }
    if (bound !== Infinity) {
      const d = Math.hypot(pos.x, pos.z);
      const max = bound - radius;
      if (d > max) {
        pos.x *= max / d;
        pos.z *= max / d;
        hit = true;
      }
    }
    return hit;
  }

  /** True if the segment (ax,az)->(bx,bz) passes through a collider of at least minR. */
  blocked(ax, az, bx, bz, minR = 0.5) {
    const abx = bx - ax, abz = bz - az;
    const len2 = abx * abx + abz * abz || 1e-6;
    for (const c of this.circles) {
      if (c.r < minR) continue;
      const t = Math.max(0, Math.min(1, ((c.x - ax) * abx + (c.z - az) * abz) / len2));
      const px = ax + abx * t - c.x, pz = az + abz * t - c.z;
      if (px * px + pz * pz < c.r * c.r) return true;
    }
    return false;
  }
}
