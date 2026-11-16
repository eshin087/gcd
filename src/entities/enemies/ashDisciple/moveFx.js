import { TELL } from '../../../combat/rules.js';
import { K_FIRE, K_SMOKE, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { perPhase } from '../duelist/realise.js';

// The Ash Disciple's move effects of the second pass (wave 2): BURNING GROUND. From phase 2 a beat
// marked `burn` (moves.js) leaves a line of fire on the stones where it cut (TUNING.burn): a level cut
// across his front, a vertical cut or a thrust along it, a glide the way he came, the Heaven-Splitting
// Fall a ring of arcs round where he lands. It is ground to step off, not a blow: it has no cue, and it
// burns by the rule of fire on grass (world/fire.js; COMBAT.md "The world breaks"): TUNING.burn.damage
// every `tick` s to a hero standing in it after its first `grace` s, blockable, never while he rolls.
// The wood it touches catches (world.ignite).
//
// Drawn as heat in the fire field (STYLE.md "The fire field"): a low seam of fire along the stones and
// short flames off it (the grass fire's own recipe: orange letters, red tongues), a few embers (glyph
// particles one letter in size). The flames stay low (under his knees) so his blade and his flare read
// over them. Cost at its peak: about 60 blobs alive a line (flames) + 20 a frame (the seam); the cap of
// lines alive (9 in phase 3) holds it near 700 of the field's 6000.
//
// Its look jitter draws from its own stream (never fx.rnd / Math.random: gameplay reads those).

const EMBER = [3.2, 1.1, 0.25];
const EMBER_END = [0.5, 0.06, 0.01];
const POOL = 12;

export class AshMoveFx {
  constructor(d) {
    this.d = d;
    this.game = d.game;
    this.lines = Array.from({ length: POOL }, () => ({ alive: false, ax: 0, az: 0, bx: 0, bz: 0, len: 0, w: 0.8, life: 3, age: 0, acc: 0, emb: 0, attack: '', id: 0, act: null, arm: 0 }));
    this._seed = 0x3c6ef372;
    this._id = 0;
    this._tick = 0;
    this._hit = {
      damage: 5, from: { x: 0, z: 0 }, knockback: 0, knockdown: false, kind: 'fire', burn: 0,
      tell: TELL.NORMAL, parryable: false, blockable: true, attack: 'burningGround', attacker: null,
      plunge: false, perfect: false, light: true,
    };
    this.stats = { lines: 0, burns: 0, capped: 0 };
  }

  get T() {
    return this.d.T.burn;
  }

  /** The look's own random stream (0..1). */
  lr() {
    this._seed = (Math.imul(this._seed, 1103515245) + 12345) >>> 0;
    return this._seed / 4294967296;
  }

  reset() {
    for (const L of this.lines) L.alive = false;
    this._tick = 0;
  }

  /** Lines of fire alive now. */
  get alive() {
    let n = 0;
    for (const L of this.lines) if (L.alive) n++;
    return n;
  }

  // ---------------------------------------------------------------- making lines
  /**
   * Beat `b` (a realised beat whose def carries `burn`) of move `act` has struck: its fire on the
   * stones, from where he stands and faces now. Nothing before phase TUNING.burn.from. While `act`
   * still has blows coming the line does not burn (the hero defends the string where he stands; then
   * he has to move off the ground he defended: `arm` s after its last blow, its grace at least).
   */
  burn(b, act = null) {
    const T = this.T, d = this.d, spec = b?.def?.burn;
    if (!T || !spec || !((d.phase ?? 1) >= (T.from ?? 2))) return 0;
    this._act = act;
    try {
      return this._burn(b, spec, act?.name ?? '');
    } finally {
      this._act = null;
    }
  }

  _burn(b, spec, attack) {
    const T = this.T, d = this.d;
    const x = d.position.x, z = d.position.z, fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    if (!Number.isFinite(x + z + fx + fz)) return 0;
    const len = spec.len ?? T.len, w = spec.w ?? T.width, life = spec.life ?? T.life;
    switch (spec.kind) {
      case 'across': {
        const cx = x + fx * (spec.at ?? 1.5), cz = z + fz * (spec.at ?? 1.5), h = len / 2;
        return this.add(cx - fz * h, cz + fx * h, cx + fz * h, cz - fx * h, w, life, attack);
      }
      case 'path': {
        const D = b._dash;
        if (D && Math.hypot(x - D.x, z - D.z) > 1) {
          const dx = x - D.x, dz = z - D.z, l = Math.hypot(dx, dz);
          // (the way he came, and on a step past where he stopped: under where he cut)
          return this.add(D.x + (dx / l) * 0.3, D.z + (dz / l) * 0.3, x + (dx / l) * 1.2, z + (dz / l) * 1.2, w, life, attack);
        }
        return this.add(x + fx * 0.8, z + fz * 0.8, x + fx * (0.8 + len), z + fz * (0.8 + len), w, life, attack);
      }
      case 'ring': {
        // arcs (as chords) round him, the gaps between them facing the hero and his sides: ways through
        const n = Math.max(2, spec.arcs ?? 4), r = spec.r ?? 2, share = spec.share ?? T.ring ?? 0.6;
        const p = this.game.player?.position;
        const a0 = p ? Math.atan2(p.x - x, p.z - z) : d.yaw;
        const half = (Math.PI / n) * share;
        let made = 0;
        for (let i = 0; i < n; i++) {
          const a = a0 + ((i + 0.5) / n) * Math.PI * 2;
          made += this.add(x + Math.sin(a - half) * r, z + Math.cos(a - half) * r, x + Math.sin(a + half) * r, z + Math.cos(a + half) * r, w, life, attack);
        }
        return made;
      }
      default: {
        const f0 = spec.from ?? 0.6;
        return this.add(x + fx * f0, z + fz * f0, x + fx * (f0 + len), z + fz * (f0 + len), w, life, attack);
      }
    }
  }

  /** A line of fire from (ax, az) to (bx, bz), `w` m wide, `life` s. Past the phase's cap the oldest
   *  line goes out (fast). Returns 1 if a line was made. */
  add(ax, az, bx, bz, w, life, attack = '') {
    const T = this.T, d = this.d;
    if (!T || !Number.isFinite(ax + az + bx + bz + w + life)) return 0;
    const cap = perPhase(T.cap, d.phase ?? 1);
    if (!(cap > 0)) return 0;
    const fade = T.fade ?? 0.6;
    const burning = (L) => L.alive && L.age < L.life - fade;
    let n = 0, free = null, first = null;
    for (const L of this.lines) {
      if (!L.alive) free ??= L;
      else if (!first || L.id < first.id) first = L;
      if (burning(L)) n++;
    }
    while (n >= cap) {
      // (the cap: the oldest still burning goes out now, in a short fade)
      let oldest = null;
      for (const L of this.lines) if (burning(L) && (!oldest || L.id < oldest.id)) oldest = L;
      if (!oldest) break;
      oldest.life = oldest.age + fade * 0.5;
      this.stats.capped++;
      n--;
    }
    // (the pool full: the oldest line of all makes way)
    const L = free ?? first ?? this.lines[0];
    L.alive = true;
    L.ax = ax;
    L.az = az;
    L.bx = bx;
    L.bz = bz;
    L.len = Math.hypot(bx - ax, bz - az);
    L.w = w;
    L.life = life;
    L.age = 0;
    L.acc = 0;
    L.emb = 0;
    L.attack = attack;
    L.act = this._act ?? null;
    L.arm = T.grace ?? 0.45;
    L.id = ++this._id;
    this.stats.lines++;
    this._catch(L);
    return 1;
  }

  /** As a line catches: a flare-up along it, the stones charred and glowing, the wood on it alight,
   *  one light. */
  _catch(L) {
    const fx = this.d.fx, w = this.game.world, T = this.T;
    const n = Math.max(1, Math.ceil(L.len / 1.2));
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = L.ax + (L.bx - L.ax) * u, z = L.az + (L.bz - L.az) * u;
      w?.scorch?.burnCircle?.(x, z, L.w * 0.6, 0.3, 0.55);
      if (i % 2 === 0) w?.ignite?.(x, z, L.w * 0.5 + 0.3, T.ignite ?? 0.8);
    }
    if (!fx) return;
    // the flare-up: a line of fire that leaps up off the cut and dies in a quarter second
    fx._line?.(L.ax, 0.75, L.az, L.bx, 0.75, L.bz, 0.22, 0.7, 0.62, 0, K_FIRE, 0.16);
    const mx = (L.ax + L.bx) / 2, mz = (L.az + L.bz) / 2;
    const o = { x: mx, y: 0.9, z: mz, color: [1.0, 0.42, 0.1], intensity: 1.3, radius: Math.min(5, L.len * 0.5 + 2), life: L.life, fade: 0.8, flicker: 0.5 };
    (fx._lookLight ?? fx._light)?.call(fx, o);
  }

  // ---------------------------------------------------------------- every frame
  frame(dt) {
    if (!(dt >= 0)) return;
    const T = this.T;
    if (!T) return;
    if (this._tick > 0) this._tick -= dt;
    let any = false;
    for (const L of this.lines) {
      if (!L.alive) continue;
      L.age += dt;
      if (L.age >= L.life) {
        L.alive = false;
        continue;
      }
      any = true;
      // (its move's blows are over: it burns from `armAfter` s on, its grace at least)
      if (L.act) {
        const A = this.d.brain?.act;
        if (A !== L.act || !(A.t < A.recoveryStart)) {
          L.act = null;
          L.arm = Math.max(L.arm, L.age + (T.armAfter ?? 0.35));
        }
      }
      this._draw(L, dt);
    }
    if (any) this._hurt();
  }

  /** The hero standing in a burning line: small blockable burns, never while he rolls. */
  _hurt() {
    const T = this.T, g = this.game, p = g.player;
    if (this._tick > 0 || !p?.takeHit || p.alive === false || (g.state && g.state !== 'boss')) return;
    if (p.state === 'roll' || p.isInvulnerable?.()) return;
    const px = p.position?.x, pz = p.position?.z, pr = (p.radius ?? 0.45) * 0.8;
    if (!Number.isFinite(px + pz)) return;
    for (const L of this.lines) {
      if (!L.alive || L.act || L.age < L.arm || L.age > L.life - (T.fade ?? 0.6) * 0.5) continue;
      const dx = L.bx - L.ax, dz = L.bz - L.az, l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((px - L.ax) * dx + (pz - L.az) * dz) / l2));
      const cx = L.ax + dx * u, cz = L.az + dz * u;
      if (Math.hypot(px - cx, pz - cz) > L.w / 2 + pr) continue;
      this._tick = T.tick ?? 0.55;
      const h = this._hit;
      h.damage = T.damage ?? 5;
      h.from.x = cx;
      h.from.z = cz;
      if (Math.hypot(cx - px, cz - pz) < 1e-3) h.from.x += 0.01;
      this.stats.burns++;
      try {
        p.takeHit(h);
      } catch (err) {
        console.error('[ash burn] player.takeHit failed', err);
      }
      return;
    }
  }

  /** One line this frame: the seam on the stones and the flames off it. */
  _draw(L, dt) {
    const fx = this.d.fx, T = this.T;
    if (!fx?.fire) return;
    const fade = T.fade ?? 0.6;
    const k = Math.min(1, L.age / 0.12) * Math.min(1, (L.life - L.age) / fade);
    if (!(k > 0.02)) return;
    // the seam: a low line of fire along the stones (held: re-drawn every frame)
    fx._line?.(L.ax, GROUND_Y, L.az, L.bx, GROUND_Y, L.bz, 0, L.w * 0.7, 0.2 * GROUND_GAIN * k, 0, K_FIRE, 0.2);
    // flames: short, low tongues all along it (born 0.7 m up: lower, the field's depth fade eats them)
    const dx = L.bx - L.ax, dz = L.bz - L.az, l = L.len || 1, nx = -dz / l, nz = dx / l;
    L.acc += dt * (T.flames ?? 26) * L.len * k;
    let guard = 0;
    while (L.acc >= 1 && guard++ < 12) {
      L.acc -= 1;
      const u = this.lr(), s = (this.lr() - 0.5) * L.w, hot = this.lr();
      const x = L.ax + dx * u + nx * s, z = L.az + dz * u + nz * s;
      fx._blob(x, 0.7 + this.lr() * 0.2, z, (this.lr() - 0.5) * 0.4, (0.8 + hot * 1.0) * (0.6 + 0.4 * k), (this.lr() - 0.5) * 0.4,
        0.28 + this.lr() * 0.3, (0.8 + hot * 0.5) * (0.7 + 0.3 * k), 0.25, 0.44 + hot * 0.14, 0, K_FIRE, 1.2, 0);
      // (a wisp of smoke now and then over the older fire)
      if (hot < 0.1 && L.age > 1) fx._blob(x, 1.0, z, 0, 0.6, 0, 0.9, 0.5, 1.0, 0.3, 0, K_SMOKE, 0.6, 0);
    }
    if (L.acc > 6) L.acc = 0;
    // embers: a letter now and then, rising off it
    L.emb += dt * 5 * k;
    if (L.emb >= 1 && fx.add) {
      L.emb -= 1;
      const u = this.lr();
      const o = fx._rec?.(L.ax + dx * u, 0.4, L.az + dz * u, 0.6 + this.lr() * 0.6, 0.14, 0.04, ".'`", EMBER, EMBER_END);
      if (o) {
        o.vx = (this.lr() - 0.5) * 0.6;
        o.vy = 1.2 + this.lr() * 1.2;
        o.vz = (this.lr() - 0.5) * 0.6;
        o.drag = 0.8;
        o.flicker = 0.4;
        fx._spawn(fx.add, o);
      }
    }
  }
}
