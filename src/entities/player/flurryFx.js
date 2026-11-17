// The flurry's glyph particles (player/flurry.js; look: docs/STYLE.md → "The flurry"). Every glyph
// here is in the world atlas.
//   vanish / appear   the blink: the cold afterimage he leaves, the flash he arrives in
//   wake              the streak behind a pass
//   cut               a flash cut biting: a white stroke across the target, a star, sparks thrown on
//   lines             the HANGING CUTS, re-drawn every frame: fine lines of light through the target,
//                     pointed at both ends, a glimmer running along each
//   gather / glint    an art's coil: light drawn in onto him, a star on the blade
//   pass              the iai crossing: one thin flash, nothing more (the cut lands later)
//   artHit            the last blow: a crescent in the cut's own plane, a star, a ring, shards
//   burst             the hanging cuts open: each line flares wide and throws sparks off both sides
// The cuts hang through a hit-stop: what is re-drawn every frame takes its one-frame life from the
// effects clock (game.fxDt), as the duelists' do.
// `pull` (m): round the wyrm's head the cuts run THROUGH a body several metres thick, and glyph
// particles are depth-tested against the scene: drawn where they are, a cut would show only where it
// leaves the head. Every particle spawned here is moved `pull` m toward the camera along its own
// line of sight: the same place on the screen, in front of the head instead of inside it.

const R = (a, b) => a + Math.random() * (b - a);

const COL = {
  // (the hooded hero, 2026-11-17: the crystal's lavender-white; it was ice blue and the gem's violet)
  core: [3.0, 2.95, 4.3], // a hanging cut's line: crystal white
  veil: [0.85, 0.8, 1.9],
  last: [3.4, 3.2, 4.6], // the art's own line
  lastVeil: [1.1, 0.95, 2.2],
  hot: [4.4, 4.2, 4.0], // the white of a blow landing
  ice: [2.0, 1.95, 3.5],
  iceEnd: [0.25, 0.22, 0.7],
  spark: [3.0, 2.95, 4.2],
  sparkEnd: [0.5, 0.45, 1.2],
  gold: [4.2, 3.0, 1.1], // a long flurry's last cuts run hot
  goldEnd: [1.3, 0.45, 0.08],
  shard: [1.9, 1.85, 3.6],
  shardEnd: [0.3, 0.28, 0.8],
  mote: [1.5, 1.45, 2.8],
  moteEnd: [0.45, 0.4, 1.3],
};
// screen axes of the fixed game camera (pitch 58°), used when there is no camera matrix (tests)
const UP_Y = 0.53, UP_Z = -0.85;
const LINE_STEP = 0.75; // m of a hanging cut per stroke

export class FlurryFx {
  /** `pfx`: the hero's PlayerFx (the afterimage, sparks and rings are its). */
  constructor(game, pfx) {
    this.game = game;
    this.pfx = pfx;
    this.cam = null;
    this.acc = 0;
    this.pull = 0; // m toward the camera (see above): the flurry sets it for its target
    this.k = 1; // the size of a cut's flare, crescent and burst (1 the wyrm's head; DEFENSE.flurry.ground.fx a man)
    this._fx = null;
    this._px = { spawn: (o) => this._spawn(o) };
    this._q = [0, 0, 0];
  }

  /** The additive particles (null: none), through the pull. */
  get add() {
    this.cam = this.game.camera?.matrixWorld?.elements ?? null;
    this._fx = this.pfx?.add ?? this.game.fx?.add ?? null;
    return this._fx ? this._px : null;
  }

  /** (x, y, z) moved `pull` m toward the camera along its line of sight → this._q. */
  _pulled(x, y, z) {
    const C = this.cam, q = this._q, k = this.pull;
    q[0] = x;
    q[1] = y;
    q[2] = z;
    if (C && k > 0) {
      const dx = C[12] - x, dy = C[13] - y, dz = C[14] - z, l = Math.hypot(dx, dy, dz);
      // (never past the camera, never when it is nearly on top of the point)
      if (l > k + 4 && Number.isFinite(l)) {
        q[0] += (dx / l) * k;
        q[1] += (dy / l) * k;
        q[2] += (dz / l) * k;
      }
    }
    return q;
  }

  _spawn(o) {
    if (this.pull > 0) {
      const q = this._pulled(o.x ?? 0, o.y ?? 0, o.z ?? 0);
      o.x = q[0];
      o.y = q[1];
      o.z = q[2];
    }
    return this._fx.spawn(o);
  }

  /** Screen-space rotation that lays a '|' glyph along the world direction (dx, dy, dz). */
  _rot(dx, dy, dz) {
    const C = this.cam;
    if (C) {
      const sx = dx * C[0] + dy * C[1] + dz * C[2], sy = dx * C[4] + dy * C[5] + dz * C[6];
      if (sx * sx + sy * sy > 1e-12 && Number.isFinite(sx + sy)) return Math.atan2(sy, sx) - Math.PI / 2;
    }
    return Math.atan2(dy * UP_Y + dz * UP_Z, dx) - Math.PI / 2;
  }

  _light(o) {
    return this.game.lights?.add?.(o) ?? null;
  }

  /** He is gone from (x, y, z): the afterimage of the pose he left (`segs`: PlayerFx._afterimage)
   *  and a pinch of motes falling in on the spot. `light`: between two cuts (fewer motes). */
  vanish(segs, nSegs, x, y, z, light = false, dx = 0, dz = 0) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    this.pfx?._afterimage?.(this._fx, segs, nSegs, { dx, dz }); // (where he stood: in the open, not pulled)
    const n = light ? 5 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R(-0.3, 0.3), r = R(0.4, 0.8), ey = R(0.2, 1.6);
      fx.spawn({
        x: x + Math.cos(a) * r, y: y + ey, z: z + Math.sin(a) * r, vx: -Math.cos(a) * r * 4, vy: (1 - ey) * 2, vz: -Math.sin(a) * r * 4,
        life: R(0.14, 0.24), size: R(0.1, 0.16), sizeEnd: 0.03, glyph: "·'+", color: COL.mote, colorEnd: COL.moteEnd, alpha: 0.9, alphaEnd: 0,
      });
    }
  }

  /** A speed clone: the shape of him in the middle of a pass (`segs`: PlayerFx._afterimage), left
   *  hanging on the cut's line. */
  clone(segs, nSegs) {
    if (!this.add) return;
    this.pfx?._afterimage?.(this._fx, segs, nSegs, { light: true });
  }

  /**
   * The ground gives under a blow on a foe who stands on it, at (x, z), the cut travelling (dx, dz):
   * a low shock ring racing out, dust thrown up along the cut, grit. k: 0.6 a flash cut … 1.6 the
   * last blow.
   */
  ground(x, z, dx, dz, k = 1) {
    const fx = this.add, fa = this.game.fx?.alpha ?? null;
    if (!fx || !Number.isFinite(x + z)) return;
    const n = Math.round(14 * k);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, sp = (5 + 4 * k) * (0.8 + 0.4 * Math.random());
      fx.spawn({
        x: x + Math.cos(a) * 0.3, y: 0.1, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp,
        life: 0.2 + 0.08 * k, size: 0.16 * (0.8 + 0.3 * k), sizeEnd: 0.05, stretch: 1.8, glyph: '|', rot: this._rot(-Math.sin(a), 0, Math.cos(a)),
        color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.8, alphaEnd: 0, drag: 5,
      });
    }
    if (!fa) return;
    for (let i = 0; i < Math.round(9 * k); i++) {
      const s = R(-1, 1), sp = R(2, 6) * k;
      fa.spawn({
        x: x + R(-0.3, 0.3), y: 0.1, z: z + R(-0.3, 0.3), vx: dx * sp - dz * s * 2, vy: R(0.8, 3) * k, vz: dz * sp + dx * s * 2,
        life: R(0.4, 0.8), size: R(0.16, 0.26), sizeEnd: R(0.4, 0.6), glyph: '.,:', color: [0.2, 0.19, 0.17], colorEnd: [0.08, 0.08, 0.07],
        alpha: 0.75, alphaEnd: 0, drag: 2.6, gravity: -3,
      });
    }
  }

  /**
   * The impact frame of a heavy blow at (x, y, z): speed lines thrown out of it across the whole
   * screen (in the screen's own plane, long and thin, gone in a few frames), most along the cut
   * (dx, dz) and against it. k: 0.7 a riposte's last cut … 1 an art.
   */
  impact(x, y, z, dx, dz, k = 1) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const C = this.cam;
    const rx = C ? C[0] : 1, ry = C ? C[1] : 0, rz = C ? C[2] : 0;
    const ux = C ? C[4] : 0, uy = C ? C[5] : UP_Y, uz = C ? C[6] : UP_Z;
    // the cut's heading on the screen
    const cx = dx * rx + dz * rz, cy = dx * ux + dz * uz, base = Math.atan2(cy, cx);
    k *= this.k;
    const n = Math.round(30 * k);
    for (let i = 0; i < n; i++) {
      // two fans, along the cut and against it, a few strays all round
      const a = i % 5 === 0 ? R(0, Math.PI * 2) : base + (i % 2 ? Math.PI : 0) + R(-0.55, 0.55);
      const ca = Math.cos(a), sa = Math.sin(a);
      const wx = rx * ca + ux * sa, wy = ry * ca + uy * sa, wz = rz * ca + uz * sa;
      const r0 = R(1.2, 3.2), sp = R(22, 46) * k, size = R(0.07, 0.13);
      fx.spawn({
        x: x + wx * r0, y: y + wy * r0, z: z + wz * r0, vx: wx * sp, vy: wy * sp, vz: wz * sp,
        life: R(0.09, 0.17), size, sizeEnd: size * 0.3, stretch: R(14, 30), glyph: '|', rot: a - Math.PI / 2,
        color: i % 3 ? COL.hot : COL.ice, colorEnd: COL.iceEnd, alpha: 0.85, alphaEnd: 0, drag: 2,
      });
    }
    // a hard white core for two frames, then nothing: the frame the blow lands on
    fx.spawn({ x, y, z, life: 0.05, size: 2.2 * k, sizeEnd: 1.2 * k, glyph: '+', rot: base, color: COL.hot, colorEnd: COL.hot, alpha: 1, alphaEnd: 0.4 });
  }

  /** He is THERE: an upright flash of cold light at (x, y, z: his chest), streaks thrown back
   *  against his heading (dx, dz). `i` of `n`: later cuts flash brighter; `art`: the last blow's. */
  appear(x, y, z, dx, dz, i = 0, n = 1, art = false) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const k = n > 1 ? i / (n - 1) : 0, s = art ? 1.5 : 0.9 + 0.3 * k;
    // the way he came: characters off the afterimage he left fly here, and more rush in onto him
    this.pfx?.blinkStream?.(this._fx, x, y, z);
    this.pfx?.blinkIn?.(this._fx, x, y, z);
    // (thin: a fat upright stroke blooms into a white pill that hides him as he arrives)
    fx.spawn({ x, y, z, life: 0.07, size: 0.11 * s, sizeEnd: 0.04, stretch: 16, glyph: '|', color: COL.hot, colorEnd: COL.ice, alpha: 0.85, alphaEnd: 0 });
    fx.spawn({ x, y: y + 0.2, z, life: 0.1, size: 0.42 * s, sizeEnd: 0.1, glyph: '+', rot: 0.785, color: COL.hot, colorEnd: COL.ice, alpha: 1, alphaEnd: 0 });
    const m = art ? 12 : 5;
    for (let j = 0; j < m; j++) {
      const sp = R(3, 9), vx = -dx * sp + R(-1.5, 1.5), vy = R(-0.8, 1.6), vz = -dz * sp + R(-1.5, 1.5);
      fx.spawn({
        x, y: y + R(-0.5, 0.4), z, vx, vy, vz, life: R(0.12, 0.22), size: R(0.12, 0.18), sizeEnd: 0.04, stretch: 1.6,
        glyph: '|', rot: this._rot(vx, vy, vz), color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.9, alphaEnd: 0, drag: 4,
      });
    }
    if (art) this._light({ x, y, z, color: [0.55, 0.78, 1.4], intensity: 3, radius: 6, life: 0.25, fade: 0.2, fadeIn: 0.02 });
  }

  /** The streak behind a pass, a frame's worth, at (x, y, z), moving along (dx, dy, dz) (unit). */
  wake(x, y, z, dx, dy, dz) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z + dx + dy + dz)) return;
    const rot = this._rot(dx, dy, dz);
    for (let j = 0; j < 3; j++) {
      const back = R(0.1, 1.1), oy = R(-0.55, 0.45), size = R(0.1, 0.16);
      fx.spawn({
        x: x - dx * back + R(-0.08, 0.08), y: y + oy - dy * back, z: z - dz * back + R(-0.08, 0.08), vx: dx * R(0.5, 2), vy: dy * R(0.5, 2), vz: dz * R(0.5, 2),
        life: R(0.1, 0.2), size, sizeEnd: size * 0.3, stretch: R(4, 9), glyph: '|', rot,
        color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.7, alphaEnd: 0, drag: 3,
      });
    }
    fx.spawn({
      x: x + R(-0.2, 0.2), y: y + R(-0.6, 0.5), z: z + R(-0.2, 0.2), vx: R(-0.5, 0.5), vy: R(0.1, 0.8), vz: R(-0.5, 0.5),
      life: R(0.2, 0.36), size: R(0.07, 0.11), sizeEnd: 0.03, glyph: "·'", color: COL.mote, colorEnd: COL.moteEnd, alpha: 0.85, alphaEnd: 0, drag: 2,
    });
  }

  /** A flash cut bites at (x, y, z), the blade travelling (dx, dz): a white stroke across it, a star,
   *  sparks thrown on along the cut. `i` of `n`: each cut of a flurry bites harder than the last. */
  cut(x, y, z, dx, dz, i = 0, n = 1) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const k = n > 1 ? i / (n - 1) : 0, s = (1 + 0.5 * k) * this.k;
    const hot = k > 0.6, c0 = hot ? COL.gold : COL.spark, c1 = hot ? COL.goldEnd : COL.sparkEnd;
    const rot = this._rot(dx, 0, dz);
    // the stroke: bright for two frames, along the cut
    fx.spawn({ x, y, z, life: 0.07, size: 0.22 * s, sizeEnd: 0.05, stretch: 11, glyph: '|', rot, color: COL.hot, colorEnd: COL.ice, alpha: 1, alphaEnd: 0 });
    // the blade's own arc: a crescent through the target in the cut's plane, bowed to one side of
    // the line and up or down a little (each cut the other way)
    const sg = i % 2 ? -1 : 1, tilt = (i % 3) * 0.3 - 0.3;
    const vx = -dz * sg * Math.cos(tilt), vy = Math.sin(tilt), vz = dx * sg * Math.cos(tilt);
    const r = (2.3 + 0.5 * k) * this.k;
    this._crescent(fx, x - vx * r, y - vy * r, z - vz * r, dx, 0, dz, vx, vy, vz, r, Math.PI / 2 + 0.95, Math.PI / 2 - 0.95, (0.4 + 0.15 * k) * this.k, 0.22, COL.hot, hot ? COL.gold : COL.ice, 0.1 * Math.sqrt(this.k));
    fx.spawn({ x, y, z, life: 0.09, size: 0.7 * s, sizeEnd: 0.15, glyph: '+', rot: rot + 0.785, color: COL.hot, colorEnd: c0, alpha: 1, alphaEnd: 0 });
    const m = 8 + Math.round(6 * k);
    for (let j = 0; j < m; j++) {
      const sp = R(5, 13) * s, vx = dx * sp + R(-3, 3), vy = R(-1, 4.5), vz = dz * sp + R(-3, 3);
      fx.spawn({
        x, y, z, vx, vy, vz, life: R(0.14, 0.3), size: R(0.1, 0.18), sizeEnd: 0.03, stretch: 1.8,
        glyph: "|'", rot: this._rot(vx, vy, vz), color: c0, colorEnd: c1, alpha: 1, alphaEnd: 0, drag: 3.5, gravity: -5,
      });
    }
    this._light({ x, y, z, color: hot ? [1.3, 0.95, 0.45] : [0.6, 0.85, 1.4], intensity: 2.4 + 1.2 * k, radius: 5, life: 0.14, fade: 0.12 });
  }

  /**
   * The hanging cuts, this frame: `lines[0..n)` = { ax, ay, az, bx, by, bz, k (0..1 drawn so far),
   * last }. Each a fine line pointed at both ends, a veil round it, a glimmer running along it.
   */
  lines(lines, n, game) {
    const fx = this.add;
    const fdt = game?.fxDt ?? game?.dt ?? 0.016;
    if (!fx || !(fdt > 0)) return; // (paused: nothing ages, so nothing is drawn again)
    const life = Math.max(0.02, fdt * 1.6), t = game?.realTime ?? game?.time ?? 0;
    for (let li = 0; li < n; li++) {
      const L = lines[li], k = Math.min(1, Math.max(0, L.k));
      if (!(k > 0.02)) continue;
      const dx = (L.bx - L.ax) * k, dy = (L.by - L.ay) * k, dz = (L.bz - L.az) * k;
      const len = Math.hypot(dx, dy, dz);
      if (!(len > 0.2) || !Number.isFinite(len + L.ax + L.ay + L.az)) continue;
      const rot = this._rot(dx, dy, dz);
      const m = Math.max(2, Math.ceil(len / LINE_STEP)), seg = len / m;
      const core = L.last ? COL.last : COL.core, veil = L.last ? COL.lastVeil : COL.veil;
      const full = len / Math.max(0.05, k); // the whole line's length: the taper is the finished cut's
      for (let j = 0; j < m; j++) {
        const f = (j + 0.5) / m, at = (f * len) / full;
        // pointed at both ends; a glimmer runs out along it
        const taper = Math.sqrt(Math.max(0.04, Math.sin(Math.PI * Math.min(1, at))));
        const glim = 0.72 + 0.28 * Math.sin(t * 26 - at * 9 + li * 2.1);
        const x = L.ax + dx * f, y = L.ay + dy * f, z = L.az + dz * f;
        const size = (L.last ? 0.13 : 0.1) * taper * Math.sqrt(this.k);
        fx.spawn({ x, y, z, life, size, sizeEnd: size, stretch: (seg / size) * 1.25, glyph: '|', rot, color: core, colorEnd: core, alpha: glim, alphaEnd: glim });
        const vs = size * 2.2;
        fx.spawn({ x, y, z, life, size: vs, sizeEnd: vs, stretch: (seg / vs) * 1.15, glyph: '|', rot, color: veil, colorEnd: veil, alpha: 0.16 * glim, alphaEnd: 0.16 * glim });
      }
    }
  }

  /** An art's coil: light drawn in onto him (x, y, z: his chest), faster as `u` 0..1 winds up. */
  gather(dt, x, y, z, u = 0) {
    const fx = this.add;
    if (!fx || !(dt > 0) || !Number.isFinite(x + y + z)) return;
    this.acc += dt * (50 + 90 * u);
    while (this.acc >= 1) {
      this.acc -= 1;
      const a = Math.random() * Math.PI * 2, r = R(0.7, 1.4);
      const ex = Math.cos(a) * r, ey = R(-0.8, 0.9), ez = Math.sin(a) * r;
      const life = R(0.08, 0.14);
      fx.spawn({
        x: x + ex, y: y + ey, z: z + ez, vx: -ex / life, vy: -ey / life, vz: -ez / life,
        life, size: R(0.09, 0.15), sizeEnd: 0.03, stretch: 1.2, glyph: "|'·", rot: this._rot(ex, ey, ez),
        color: COL.mote, colorEnd: COL.moteEnd, alpha: 0.9, alphaEnd: 0.1,
      });
    }
  }

  /** The star on the blade as the coil is wound (x, y, z: near its point). */
  glint(x, y, z) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    // (a small four-point star: a big one blooms into a white ball beside him)
    fx.spawn({ x, y, z, life: 0.12, size: 0.5, sizeEnd: 0.1, glyph: '+', color: COL.hot, colorEnd: COL.ice, alpha: 1, alphaEnd: 0, spin: 5 });
    fx.spawn({ x, y, z, life: 0.12, size: 0.24, sizeEnd: 0.7, glyph: '°', color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.6, alphaEnd: 0 });
    this._light({ x, y, z, color: [0.6, 0.85, 1.5], intensity: 1.6, radius: 4, life: 0.16, fade: 0.12 });
  }

  /** The iai crosses the target (x, y, z), heading (dx, dz): one thin flash. The cut lands later. */
  pass(x, y, z, dx, dz) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    fx.spawn({ x, y, z, life: 0.06, size: 0.16, sizeEnd: 0.04, stretch: 40, glyph: '|', rot: this._rot(dx, 0, dz), color: COL.hot, colorEnd: COL.last, alpha: 1, alphaEnd: 0 });
    fx.spawn({ x, y, z, life: 0.1, size: 0.45, sizeEnd: 0.1, glyph: '+', rot: 0.785, color: COL.hot, colorEnd: COL.last, alpha: 1, alphaEnd: 0 });
  }

  /**
   * A crescent of light: its outer edge an arc of radius r round (cx, cy, cz) from angle a0 to a1 in
   * the plane of the unit axes U (ux, uy, uz) and V, `w` m thick at its middle and pointed at both
   * ends. The edge is bright (`core`), the body behind it fades inward (`end`).
   */
  _crescent(fx, cx, cy, cz, ux, uy, uz, vx, vy, vz, r, a0, a1, w, life, core, end, stroke = 0.1) {
    const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * r) / 0.32));
    const dir = Math.sign(a1 - a0) || 1, arc = (Math.abs(a1 - a0) / n) * r;
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, a = a0 + (a1 - a0) * f, c = Math.cos(a), sn = Math.sin(a);
      const taper = Math.sin(Math.PI * f);
      const rot = this._rot((-sn * ux + c * vx) * dir, (-sn * uy + c * vy) * dir, (-sn * uz + c * vz) * dir);
      for (let row = 0; row < 4; row++) {
        const q = row / 3; // 0 the edge … 1 the inside
        const rr = r - w * taper * q;
        const size = stroke * (row ? 1.3 : 1.5) * (0.3 + 0.7 * taper);
        fx.spawn({
          x: cx + (c * ux + sn * vx) * rr, y: cy + (c * uy + sn * vy) * rr, z: cz + (c * uz + sn * vz) * rr,
          life: life * (1 - 0.35 * q) * R(0.9, 1.1), size, sizeEnd: size * 0.2, stretch: (arc / size) * 1.35, glyph: '|', rot,
          color: row ? end : core, colorEnd: end, alpha: (row ? 0.3 * (1 - 0.6 * q) : 1) * (0.35 + 0.65 * taper), alphaEnd: 0,
        });
      }
    }
  }

  /**
   * The last blow lands at (x, y, z), its cut travelling (dx, dz). `kind`: 'iai' (the level cut
   * opens: a lens of light across the target), 'split' (a falling crescent), 'vault' (a rising one).
   */
  artHit(x, y, z, dx, dz, kind = 'iai') {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    // (small cores: stacked with the burst's they bloom into a white blot over the target)
    const s = this.k;
    fx.spawn({ x, y, z, life: 0.08, size: 1.2 * s, sizeEnd: 0.3, glyph: '*', color: COL.hot, colorEnd: COL.ice, alpha: 1, alphaEnd: 0, rot: R(0, 3) });
    fx.spawn({ x, y, z, life: 0.28, size: 1.2 * s, sizeEnd: 4.0 * s, glyph: '°', color: COL.ice, colorEnd: COL.iceEnd, alpha: 0.55, alphaEnd: 0 });
    const px = -dz, pz = dx; // across the cut, in the ground plane
    // a falling / rising cut's plane is tipped 40° off upright, toward the side the camera sees more
    // of: an upright plane along the view is drawn as one fat bar up the screen
    const C = this.cam, side = C && px * C[0] + pz * C[2] < 0 ? -1 : 1;
    const ty = 0.77, tx = px * side * 0.64, tz = pz * side * 0.64;
    if (kind === 'split') this._crescent(fx, x, y + 0.2, z, dx, 0, dz, tx, ty, tz, 2.7 * s, 2.5, -0.75, 0.5 * s, 0.34, COL.hot, COL.last, 0.13);
    else if (kind === 'vault') this._crescent(fx, x - dx * 0.4, y - 0.3, z - dz * 0.4, dx, 0, dz, tx, ty, tz, 2.3 * s, -0.9, 2.2, 0.45 * s, 0.34, COL.hot, COL.last, 0.13);
    else {
      // the lens: two shallow arcs bowing apart on either side of the line
      for (const sg of [-1, 1]) this._crescent(fx, x + px * sg * 5.2 * s, y, z + pz * sg * 5.2 * s, -px * sg, 0, -pz * sg, dx, 0, dz, 5.7 * s, -0.62, 0.62, 0.5 * s, 0.3, COL.hot, COL.last, 0.12);
    }
    // shards fanned out of it, most along the cut
    for (let i = 0; i < 18; i++) {
      const a = Math.atan2(dz, dx) + R(-1.3, 1.3) + (i % 3 === 0 ? Math.PI : 0), sp = R(4, 10), up = R(0.1, 1.1);
      const vx = Math.cos(a) * sp * Math.cos(up), vy = Math.sin(up) * sp, vz = Math.sin(a) * sp * Math.cos(up);
      fx.spawn({
        x, y, z, vx, vy, vz, life: R(0.35, 0.6), size: R(0.18, 0.36), sizeEnd: 0.05, stretch: 0.6,
        glyph: 'A^V', rot: this._rot(vx, vy, vz), spin: R(-2, 2), color: COL.shard, colorEnd: COL.shardEnd, alpha: 1, alphaEnd: 0, gravity: -11, drag: 1.2,
      });
    }
    const q = this._pulled(x, y, z);
    this.pfx?.sparks?.(q[0], q[1], q[2], dx, dz, true, true);
    this.pfx?.shockwave?.(q[0], q[1], q[2], true, true);
    // (kept small, as the plunge's: a big light here turns the target's whole ASCII art white)
    // (and never near the floor: a light 1 m over the paving blows it out into a white disc)
    this._light({ x, y: Math.max(2.2, y + 0.8), z, color: [0.7, 0.95, 1.5], intensity: 2.4, radius: 6.5, life: 0.26, fade: 0.22 });
    this._light({ x, y: Math.max(2.2, y + 0.4), z, color: [1.0, 0.55, 1.5], intensity: 1.4, radius: 5, life: 0.5, fade: 0.42 });
  }

  /**
   * The hanging cuts open, all at once, on the last blow at (x, y, z): each line flares wide for a
   * few frames and throws sparks off both its sides; the more cuts, the hotter the burst.
   */
  burst(lines, n, x, y, z) {
    const fx = this.add;
    if (!fx || !Number.isFinite(x + y + z)) return;
    const heat = Math.min(1, n / 5);
    for (let li = 0; li < n; li++) {
      const L = lines[li];
      const dx = L.bx - L.ax, dy = L.by - L.ay, dz = L.bz - L.az, len = Math.hypot(dx, dy, dz);
      if (!(len > 0.2) || !Number.isFinite(len + L.ax + L.ay + L.az)) continue;
      const ux = dx / len, uy = dy / len, uz = dz / len;
      const rot = this._rot(dx, dy, dz);
      const m = Math.max(3, Math.ceil(len / 0.6)), seg = len / m;
      const c0 = L.last ? COL.last : li % 2 && heat > 0.5 ? COL.gold : COL.spark;
      const c1 = L.last ? COL.lastVeil : li % 2 && heat > 0.5 ? COL.goldEnd : COL.sparkEnd;
      for (let j = 0; j < m; j++) {
        const f = (j + 0.5) / m, taper = Math.sqrt(Math.max(0.05, Math.sin(Math.PI * f)));
        const px = L.ax + dx * f, py = L.ay + dy * f, pz = L.az + dz * f;
        // the line flares: fat and white, thinning fast
        const size = (L.last ? 0.3 : 0.22) * taper * this.k;
        fx.spawn({ x: px, y: py, z: pz, life: R(0.13, 0.2), size, sizeEnd: size * 0.08, stretch: (seg / size) * 1.4, glyph: '|', rot, color: COL.hot, colorEnd: c0, alpha: 1, alphaEnd: 0 });
        // sparks off both sides, across the line
        for (const sg of [-1, 1]) {
          if (Math.random() > 0.55 + 0.3 * heat) continue;
          const sp = R(3, 9) * sg * taper, al = R(-2.5, 2.5);
          const vx = -uz * sp + ux * al, vy = R(0.5, 4) + uy * al, vz = ux * sp + uz * al;
          fx.spawn({
            x: px, y: py, z: pz, vx, vy, vz, life: R(0.2, 0.42), size: R(0.1, 0.17), sizeEnd: 0.03, stretch: 1.5,
            glyph: "|'*", rot: this._rot(vx, vy, vz), color: c0, colorEnd: c1, alpha: 1, alphaEnd: 0, drag: 2.6, gravity: -7,
          });
        }
      }
    }
    // where they cross: a star, brighter with every cut
    fx.spawn({ x, y, z, life: 0.12, size: (1.0 + 0.8 * heat) * this.k, sizeEnd: 0.3, glyph: '*', color: COL.hot, colorEnd: COL.gold, alpha: 1, alphaEnd: 0, rot: R(0, 3), spin: 2 });
    this._light({ x, y, z, color: [0.9, 0.9, 1.4], intensity: 1.8 + 1.4 * heat, radius: 6, life: 0.2, fade: 0.16 });
  }
}
