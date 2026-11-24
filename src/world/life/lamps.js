import { lampsTuning } from './lampsTuning.js';

// THE LAMPS (piece 'answer'): the levels' stone lanterns and the Skybreak Ring's braziers. A lantern
// stands dark, or burns as the visit starts (the place is inhabited); more KINDLE as the fight heats up
// (the fight's start, each new phase of the boss: the nearest him first, one after another; fire landing
// near lights one at once); a lit one GUTTERS under a blow's shock (its flame dips and leans away, its
// light dims, it burns up again in under a second); it goes OUT when the piece that holds it breaks,
// falls or is taken (a puff of smoke), and it never relights in that fight. clear('reset') puts every
// lamp back to the level's start (lampsTuning.js says which, per level).
//
//   lamps.impact(x, z, r, power, o)   a blow landed (life.impact): the lamps near it gutter
//   lamps.ignite(x, z, r, k)          fire landed (life.ignite): a dark lamp near it catches
//   lamps.kindle(n, x, z)             n more catch, the nearest (x, z) first (the phases call it; the Lab)
//   lamps.shock(x, z, r, power)       a gutter forced (the Lab, a test); returns how many guttered
//   lamps.lit                         how many burn now (catching or lit; the braziers too)
//   lamps.list                        the lamps ({ kind: 'lantern' | 'brazier', state, x, y, z, glow, gut,
//                                     w (its light's share), b (the piece) }; the tests read it)
//   lamps.lights                      lamp lights shining now (at most light.max)
//   lamps.stat                        counts this page load (kindled, guttered, out, ...)
//
// Where a lamp is: a breakable whose def carries `lamp: { y, r }` (the window's centre height and half
// width: courtyard.js, foxTerrace.js, windlessGrove.js, starfallProps.js), and the Ring's braziers
// (set.ambience.braziers: that ambience draws their flames and lights; this layer gutters them and puffs
// them out). The flame is heat in the fire field (STYLE "The fire field"); the light is a LOW light of
// the pool (render/lights.js): only `light.max` lamps hold one, the nearest the focus, and a light that
// must give up its slot fades instead of popping.
// With the piece off: nothing burns, no light is asked of the pool. No allocation per frame, no
// Math.random (an own stream).

const DARK = 0, KINDLE = 1, LIT = 2, OUT = 3;
export const LAMP = Object.freeze({ DARK, KINDLE, LIT, OUT });
const PHASES = ['dragon:phase', 'dragon:phase2', 'dragon:phase3', 'dragon:phase4'];
const TAU = Math.PI * 2;
const INTACT = 0;
const CAM0 = { x: 0, y: 0.848, z: 0.53 };

export class Lamps {
  constructor(life) {
    this.life = life;
    this.T = lampsTuning(life.levelId);
    /** the flame's fire-field kind (the films try 'fire' against 'void' on the Foxfire Terrace) */
    this.kind = this.T.kind;
    this.list = [];
    this.lights = 0;
    this.stat = { kindled: 0, guttered: 0, out: 0, ignited: 0, blobs: 0, puffs: 0 };
    this._found = false;
    this._findT = 0;
    this._phase = 1;
    this._fight = false;
    this._visible = true;
    this._offs = null;
    this._s = 0x1a3b5c7d;
    this._blob = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.4, size: 0.3, sizeEnd: 0.12, heat: 0.4, heatEnd: 0, drag: 1.4, gravity: 0, kind: 'fire' };
    this._smoke = { x: 0, y: 0, z: 0, vx: 0, vy: 0.6, vz: 0, life: 1.4, size: 0.35, sizeEnd: 1.1, heat: 0.28, heatEnd: 0, drag: 0.4, gravity: 0, kind: 'smoke' };
    this._cam = { x: 0, y: 0, z: 0 };
    this._pick = [];
    if (life.enabled) {
      life.action?.('light lamps', () => this.kindle(99, life.hero.x, life.hero.z, 0.2), 'every lamp that stands catches, the nearest the hero first');
      life.action?.('gutter at hero', () => this.gutterAtHero(), "a heavy blow's shock at the hero: the lamps near him gutter (the nearest lit one at least)");
      life.action?.('lamps out', () => this.douse(), 'every burning lantern goes dark in a puff (they can be lit again)');
    }
  }

  get on() {
    return !!this.life.on?.('answer');
  }

  /** How many burn now (catching or lit). */
  get lit() {
    if (!this.on) return 0;
    let n = 0;
    for (const L of this.list) if (L.state === KINDLE || L.state === LIT) n++;
    return n;
  }

  _r() {
    this._s = (Math.imul(this._s, 1664525) + 1013904223) >>> 0;
    return this._s / 4294967296;
  }

  _range(a) {
    return a[0] + (a[1] - a[0]) * this._r();
  }

  // ------------------------------------------------------------------ finding them
  /** The lamps of the level, once its breakables exist (world.destructibles). */
  _find() {
    const D = this.life.world?.destructibles;
    const A = this.life.set?.ambience;
    if (!Array.isArray(D?.list)) return false;
    const list = this.list;
    list.length = 0;
    for (const b of D.list) {
      const lp = b?.def?.lamp;
      if (!lp || !Number.isFinite(lp.y)) continue;
      list.push(this._rec('lantern', b, b.x, lp.y, b.z, Number(lp.r) || 0.15, null));
    }
    if (Array.isArray(A?.braziers)) {
      for (const br of A.braziers) {
        if (!Number.isFinite(br?.x + br?.y + br?.z)) continue;
        const b = D.list.find((o) => o.def === br.def) ?? null;
        list.push(this._rec('brazier', b, br.x, br.y, br.z, 0.3, br));
      }
    }
    this._found = true;
    this._start();
    return true;
  }

  _rec(kind, b, x, y, z, r, br) {
    return {
      i: this.list.length, kind, b, br, x, y, z, r,
      state: kind === 'brazier' ? LIT : DARK, glow: kind === 'brazier' ? 1 : 0,
      t: 0, kt: 1, wait: -1, gut: 0, gx: 0, gz: 0, acc: 0, sndT: -1e9,
      light: null, w: 0, lg: 0, fx: x, fy: y, fz: z, seed: this._r() * 100,
    };
  }

  /** The level's start: the `start` lanterns nearest the way in burn, the rest stand dark. */
  _start() {
    const T = this.T, sp = this.life.game?.CONFIG?.world?.playerSpawn ?? { x: 0, z: 20 };
    for (const L of this.list) {
      L.gut = L.acc = 0;
      L.wait = -1;
      if (L.kind === 'brazier') {
        L.state = LIT;
        L.glow = 1;
        continue;
      }
      L.state = DARK;
      L.glow = 0;
    }
    this._phase = 1;
    this._fight = false;
    const n = this._nearest(T.start, Number(sp.x) || 0, Number(sp.z) || 0);
    for (let k = 0; k < n; k++) {
      const L = this._pick[k];
      L.state = LIT;
      L.glow = 1;
      L.t = L.kt = 1;
    }
    this._pick.length = 0;
  }

  /** The n dark, standing lanterns nearest (x, z), into this._pick (nearest first). Returns how many. */
  _nearest(n, x, z) {
    const P = this._pick;
    P.length = 0;
    if (!(n > 0)) return 0;
    for (const L of this.list) {
      if (L.kind !== 'lantern' || L.state !== DARK || L.wait >= 0 || !this._stands(L)) continue;
      L._d = Math.hypot(L.x - x, L.z - z);
      let k = P.length;
      P.push(L);
      while (k > 0 && P[k - 1]._d > L._d) {
        P[k] = P[k - 1];
        k--;
      }
      P[k] = L;
    }
    if (P.length > n) P.length = n;
    return P.length;
  }

  _stands(L) {
    const b = L.b;
    return !b || (b.state === INTACT && !b.absent);
  }

  // ------------------------------------------------------------------ what lights them
  /** Subscribe to the phases while the piece is on. */
  _sync() {
    const ev = this.life.game?.events;
    const want = this.on && typeof ev?.on === 'function';
    if (want && !this._offs) {
      const offs = [];
      for (const name of PHASES) {
        const fn = (d) => {
          if (!this.on) return;
          const n = name === 'dragon:phase' ? Number(d?.n) : Number(name.slice(-1));
          this.phaseUp(n);
        };
        const off = ev.on(name, fn);
        offs.push(typeof off === 'function' ? off : () => ev.off?.(name, fn));
      }
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
    }
  }

  /** The boss's phase n began (the wyrm sends dragon:phase {n} and dragon:phaseN: once each). */
  phaseUp(n) {
    if (!Number.isFinite(n) || n <= this._phase) return 0;
    this._phase = n;
    const k = this.T.phase[Math.min(n, this.T.phase.length - 1)] ?? 0;
    const p = this._bossAt();
    return this.kindle(k, p.x, p.z);
  }

  _bossAt() {
    const g = this.life.game, p = g?.dragon?.position ?? g?.boss?.position;
    if (p && Number.isFinite(p.x + p.z)) return p;
    return this.life.hero;
  }

  /**
   * n more lanterns catch, the nearest (x, z) first, one after another (`stagger`; `first` s before the
   * first). Returns how many will.
   */
  kindle(n, x = 0, z = 0, first = 0.15) {
    if (!this.on) return 0;
    if (!this._found) this._find();
    const m = this._nearest(n, x, z), S = this.T.stagger;
    let t = Math.max(0, first);
    for (let k = 0; k < m; k++) {
      const L = this._pick[k];
      L.wait = t;
      L.kt = this.T.kindle.sec;
      t += this._range(S);
    }
    this._pick.length = 0;
    return m;
  }

  /** Fire landed on the disc (x, z, r): a dark lantern within reach catches at once. */
  ignite(x, z, r = 2, k = 1) {
    if (!this.on || !Number.isFinite(x + z + r) || !(k > 0)) return 0;
    if (!this._found) this._find();
    const R = Math.max(0, r) + this.T.ignite.r;
    let n = 0;
    for (const L of this.list) {
      if (L.kind !== 'lantern' || L.state !== DARK || !this._stands(L)) continue;
      if (Math.hypot(L.x - x, L.z - z) - L.r > R) continue;
      if (L.wait >= 0 && L.wait <= 0.05) continue;
      L.wait = 0;
      L.kt = this.T.ignite.kindle;
      n++;
    }
    this.stat.ignited += n;
    return n;
  }

  _catch(L) {
    L.state = KINDLE;
    L.t = 0;
    L.wait = -1;
    this.stat.kindled++;
    this.life.sound?.('lampCatch', L.x, L.z);
  }

  // ------------------------------------------------------------------ what shakes them
  impact(x, z, r, power) {
    if (!this.on) return 0;
    return this._shock(x, z, r, power, false);
  }

  /** A gutter forced past the power floor (the Lab, a test). Returns how many guttered. */
  shock(x, z, r = 2.5, power = 1.4) {
    if (!this.on) return 0;
    return this._shock(x, z, r, power, true);
  }

  _shock(x, z, r, power, force) {
    if (!Number.isFinite(x + z + r + power) || !(power > 0)) return 0;
    if (!this._found) this._find();
    const G = this.T.gutter, R = G.reach, p = power * (Number.isFinite(this.life.k) ? this.life.k : 1);
    if (!force && p < G.power) return 0;
    const reach = Math.min(R.max, Math.max(0, r) * R.r + R.k * Math.pow(p, R.pow));
    const A = this.life.set?.ambience;
    let n = 0, loud = null, loudK = 0;
    for (const L of this.list) {
      if (!(L.state === KINDLE || L.state === LIT)) continue;
      const dx = L.x - x, dz = L.z - z, d = Math.hypot(dx, dz);
      if (!(d - L.r < reach)) continue;
      let s = p * Math.pow(1 - Math.max(0, d - L.r) / reach, R.fall);
      if (L.kind === 'brazier') s *= this.T.brazier.k;
      if (!(s >= G.min)) continue;
      const k = Math.min(1, s * G.k);
      if (L.kind === 'brazier') {
        if (!A?.gutter?.(L.br, k, dx, dz)) continue;
      } else {
        if (k < L.gut) continue;
        L.gut = k;
        L.gx = d > 1e-3 ? dx / d : 0;
        L.gz = d > 1e-3 ? dz / d : 0;
      }
      n++;
      if (k > loudK && this.life.t - L.sndT >= G.sound) {
        loud = L;
        loudK = k;
      }
    }
    this.stat.guttered += n;
    // (one sound a blow, at the lamp it shook hardest)
    if (loud) {
      loud.sndT = this.life.t;
      this.life.sound?.('lampGutter', loud.x, loud.z, { k: loudK });
    }
    return n;
  }

  /** The Lab: a heavy shock at the hero; with no lamp in its reach, the nearest lit one gutters anyway. */
  gutterAtHero() {
    const h = this.life.hero;
    const n = this.shock(h.x, h.z, 2.5, 1.4);
    if (n > 0) return n;
    let best = null, bd = Infinity;
    for (const L of this.list) {
      if (!(L.state === KINDLE || L.state === LIT)) continue;
      const d = Math.hypot(L.x - h.x, L.z - h.z);
      if (d < bd) {
        bd = d;
        best = L;
      }
    }
    if (!best) return 0;
    const ux = (best.x - h.x) / Math.max(bd, 1e-3), uz = (best.z - h.z) / Math.max(bd, 1e-3);
    return this.shock(best.x - ux * 2, best.z - uz * 2, 1.5, 1.3);
  }

  /** The Lab: every burning lantern goes dark in a puff (they may be lit again). */
  douse() {
    let n = 0;
    for (const L of this.list) {
      if (L.kind !== 'lantern' || !(L.state === KINDLE || L.state === LIT)) continue;
      this._puff(L);
      L.state = DARK;
      L.glow = 0;
      L.gut = 0;
      n++;
    }
    return n;
  }

  // ------------------------------------------------------------------ going out
  _out(L) {
    const burning = L.state === KINDLE || L.state === LIT;
    L.state = OUT;
    L.wait = -1;
    L.gut = 0;
    if (!burning) return;
    this.stat.out++;
    this._puff(L);
    this.life.sound?.('lampOut', L.fx, L.fz);
  }

  /** The flame dies: a puff of smoke from where it burned and a last lick of fire. */
  _puff(L) {
    const fire = this.life.game?.fx?.fire, O = this.T.out;
    if (!fire?.spawn || !this._visible) return;
    const c = this._toCam(L.fx, L.fy, L.fz), off = this.T.flame.toCam;
    const px = L.fx + c.x * off, py = L.fy + c.y * off, pz = L.fz + c.z * off;
    const s = this._smoke;
    for (let i = 0; i < O.puff; i++) {
      const a = this._r() * TAU, rr = this._r() * L.r;
      s.x = px + Math.cos(a) * rr;
      s.y = py + 0.1 + this._r() * 0.2;
      s.z = pz + Math.sin(a) * rr;
      s.vx = (this._r() - 0.5) * 0.3;
      s.vy = 0.45 + this._r() * 0.45;
      s.vz = (this._r() - 0.5) * 0.3;
      s.life = this._range(O.puffLife);
      s.size = O.puffSize[0] * (0.8 + 0.4 * this._r());
      s.sizeEnd = O.puffSize[1] * (0.8 + 0.4 * this._r());
      fire.spawn(s);
    }
    const b = this._blob;
    for (let i = 0; i < O.flare; i++) {
      b.x = px + (this._r() - 0.5) * L.r;
      b.y = py;
      b.z = pz + (this._r() - 0.5) * L.r;
      b.vx = (this._r() - 0.5) * 0.4;
      b.vy = 0.6 + this._r() * 0.5;
      b.vz = (this._r() - 0.5) * 0.4;
      b.life = 0.22 + this._r() * 0.12;
      b.size = 0.3;
      b.sizeEnd = 0.1;
      b.heat = 0.42;
      b.kind = L.kind === 'brazier' ? 'fire' : this.kind;
      fire.spawn(b);
    }
    this.stat.puffs++;
  }

  // ------------------------------------------------------------------ the frame
  /** The unit way from (x, y, z) to the camera (headless: the game camera's way, 58 degrees down). */
  _toCam(x, y, z) {
    const c = this._cam, p = this.life.game?.camera?.position;
    if (p && Number.isFinite(p.x + p.y + p.z)) {
      const dx = p.x - x, dy = p.y - y, dz = p.z - z, l = Math.hypot(dx, dy, dz);
      if (l > 1e-3) {
        c.x = dx / l;
        c.y = dy / l;
        c.z = dz / l;
        return c;
      }
    }
    c.x = CAM0.x;
    c.y = CAM0.y;
    c.z = CAM0.z;
    return c;
  }

  /** Where the flame sits now: the window's centre through the piece's pivot (a shudder leans it). */
  _place(L) {
    const pv = L.b?.pivot?.matrixWorld?.elements;
    if (L.kind === 'lantern' && pv && Number.isFinite(pv[12])) {
      L.fx = pv[4] * L.y + pv[12];
      L.fy = pv[5] * L.y + pv[13];
      L.fz = pv[6] * L.y + pv[14];
    } else {
      L.fx = L.x;
      L.fy = L.y;
      L.fz = L.z;
    }
  }

  update(dt) {
    this._sync();
    if (!this.on) {
      this._dark();
      return;
    }
    if (!Number.isFinite(dt) || !(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    if (!this._found) {
      // (the breakables are built with the world; look again now and then until they are there)
      this._findT -= dt;
      if (this._findT > 0 || !this._find()) {
        if (this._findT <= 0) this._findT = 1;
        return;
      }
    }
    // the fight's start lights a few more
    const fight = this.life.game?.state === 'boss';
    if (fight && !this._fight) {
      this._fight = true;
      const p = this._bossAt();
      this.kindle(this.T.fight, p.x, p.z, 0.6);
    }
    const T = this.T, F = T.flame, G = T.gutter, q = Math.max(0.3, Math.min(1, this.life.quality));
    const fire = this.life.game?.fx?.fire;
    for (const L of this.list) {
      // a piece that is down puts its flame out for the fight
      if (L.state !== OUT && L.b && L.b.state !== INTACT && !L.b.absent) this._out(L);
      if (L.kind === 'brazier') {
        // (the ambience draws a brazier and settles its gutter; here only its going out)
        L.glow = L.state === LIT ? 1 : 0;
        if (L.br) L.gut = L.br.gut || 0;
        continue;
      }
      if (L.wait >= 0 && L.state === DARK) {
        L.wait -= dt;
        if (L.wait < 0) {
          if (this._stands(L)) this._catch(L);
          else L.wait = -1;
        }
      }
      // the glow: a stutter that catches, then steady
      if (L.state === KINDLE) {
        L.t += dt;
        const u = Math.min(1, L.t / Math.max(0.05, L.kt));
        const e = u * u * (3 - 2 * u), st = T.kindle.stutter * (1 - u);
        const n = 0.5 + 0.5 * Math.sin(this.life.t * 23 + L.seed) * Math.sin(this.life.t * 9.1 + L.seed * 1.7);
        L.glow = Math.max(0, e * (1 - st * n));
        if (u >= 1) {
          L.state = LIT;
          L.glow = 1;
        }
      } else if (L.state === LIT) {
        L.glow = 1;
      } else {
        L.glow = 0;
      }
      if (L.gut > 0) {
        L.gut = L.gut * Math.exp(-dt / G.tau) - dt * G.drop;
        if (L.gut <= 0.01) L.gut = 0;
      }
      // (what its light follows: the glow, except that it dies over light.out s when the flame does)
      L.lg = L.glow >= L.lg ? L.glow : L.lg > 0.01 ? L.lg * Math.exp(-dt / (T.light.out / 3)) : 0;
      if (!(L.glow > 0)) continue;
      this._place(L);
      if (!fire?.spawn || !this._visible) continue;
      // the flame: small blobs of heat in the window, drawn along the view ray toward the camera
      const gut = L.gut;
      L.acc += dt * F.rate * q * (0.35 + 0.65 * L.glow);
      if (L.acc < 1) continue;
      const c = this._toCam(L.fx, L.fy, L.fz), off = F.toCam;
      const b = this._blob;
      b.kind = this.kind;
      while (L.acc >= 1) {
        L.acc -= 1;
        const a = this._r() * TAU, rr = this._r() * L.r * F.spread, hot = this._r();
        b.x = L.fx + Math.cos(a) * rr + c.x * off;
        b.y = L.fy - 0.06 + this._r() * 0.08 + c.y * off;
        b.z = L.fz + Math.sin(a) * rr * 0.5 + c.z * off;
        b.vx = (this._r() - 0.5) * 0.12;
        b.vy = this._range(F.rise);
        b.vz = (this._r() - 0.5) * 0.12;
        b.life = this._range(F.life);
        b.size = F.size[0] + (F.size[1] - F.size[0]) * hot;
        b.sizeEnd = b.size * 0.4;
        b.heat = (F.heat[0] + (F.heat[1] - F.heat[0]) * hot) * (0.45 + 0.55 * L.glow);
        b.drag = 1.4;
        if (gut > 0) {
          // guttering: low, pushed over, smaller (the bonfire's answer, smaller)
          b.vx += L.gx * gut * G.lean;
          b.vz += L.gz * gut * G.lean;
          b.vy *= 1 - 0.7 * gut;
          b.size *= 1 - 0.4 * gut;
          b.heat *= 1 - 0.35 * gut;
        }
        fire.spawn(b);
        this.stat.blobs++;
      }
    }
    this._light(dt);
  }

  /** The lamps' lights: at most light.max, the nearest the focus, each fading in and out of its share. */
  _light(dt) {
    const Lt = this.T.light, f = this.life.focus, pool = this.life.game?.lights;
    const fx = Number.isFinite(f?.x) ? f.x : 0, fz = Number.isFinite(f?.z) ? f.z : 0;
    let holders = 0;
    for (const L of this.list) {
      if (L.kind !== 'lantern') continue;
      L._d = L.lg > 0 && this._visible ? Math.hypot(L.fx - fx, L.fz - fz) * (L.w > 0 ? 0.85 : 1) : Infinity;
      if (L.w > 0) holders++;
    }
    const step = dt / Math.max(0.05, Lt.fade);
    let shining = 0;
    for (const L of this.list) {
      if (L.kind !== 'lantern') continue;
      // (its rank among the lamps that burn: how many nearer ones there are)
      let want = 0;
      if (L._d < Lt.reach) {
        let nearer = 0;
        for (const M of this.list) if (M !== L && M.kind === 'lantern' && M._d < L._d) nearer++;
        want = nearer < Lt.max ? 1 : 0;
      }
      if (want && L.w <= 0) {
        // (a new one waits for a light to be free: never more than light.max at once)
        if (holders >= Lt.max) want = 0;
        else holders++;
      }
      if (want) L.w = Math.min(1, L.w + step);
      else if (L.w > 0) {
        L.w = Math.max(0, L.w - step);
        if (L.w <= 0) holders--;
      }
      if (L.w > 0 && !L.light && pool?.add) {
        L.light = this.life.build(() => pool.add({ x: L.fx, y: L.fy, z: L.fz, color: this._lightColor(), intensity: 0, radius: Lt.radius, flicker: Lt.flicker, low: true, slotFade: 0.3 }));
      }
      if (L.light) {
        L.light.set(L.fx, L.fy, L.fz);
        L.light.color = this._lightColor();
        L.light.intensity = L.w > 0 ? Lt.intensity * L.w * L.lg * (1 - this.T.gutter.dim * L.gut) : 0;
        if (L.light.intensity > 0) shining++;
      }
    }
    this.lights = shining;
  }

  _lightColor() {
    const Lt = this.T.light;
    return this.kind === 'void' && Lt.colorVoid ? Lt.colorVoid : Lt.color;
  }

  /** Nothing burns and no light is asked (the piece off, the Lab hiding the world). */
  _dark() {
    for (const L of this.list) {
      L.w = L.lg = 0;
      if (L.light) L.light.intensity = 0;
    }
    this.lights = 0;
  }

  clear(why = 'reset') {
    if (why !== 'reset') {
      this._dark();
      return;
    }
    if (!this._found) return;
    for (const L of this.list) {
      L.w = L.lg = 0;
      if (L.light) L.light.intensity = 0;
    }
    this._start();
  }

  setVisible(on) {
    this._visible = !!on;
    if (!on) this._dark();
  }

  takes() {
    return false;
  }
}
