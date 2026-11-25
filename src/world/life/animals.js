import { FAUNA_TUNE as FT } from './faunaTuning.js';
import { lifeSay } from '../../audio/lifeSfx.js';

// THE ANIMALS (part of the piece 'creatures'; creatures.js owns them and draws their letters): small
// ground animals, two to five tiny letters each, that you notice by how they move. They sit still
// (nearly invisible) at the edge of the arena or in cover; when the hero or the fight comes near they
// BOLT, each kind with its own gait (FAUNA_TUNE.kinds: a rabbit's hops, a deer's long bounds, a rat's
// low dart along a wall, a lizard's stop-start scuttle, the fox's trot and its look back), and vanish
// into cover. They never enter the fighting ground (FAUNA_TUNE.levels[id].keepOut), never draw over a
// fighter, cannot be hit (a blow near one just puts it up). After the fight some come back.
//
//   animals.list          the records: { kind, K, x, z, hx, hz, state 'sit' | 'wait' | 'run' | 'hid' | 'gone', ... }
//   animals.alarm(x, z, r, why)   everything sitting within r of (x, z) bolts away from it → how many
//   animals.returnAll()   every hidden one is back at its place now (the Lab)
// No allocation per frame, no Math.random (the fauna's own stream).
// The sound: one 'animalBolt' of its kind as it starts to run (audio/lifeSfx.js; a herd's are spread
// by their reactions and the sound's own gap).

const SIT = 'sit', WAIT = 'wait', RUN = 'run', HID = 'hid', GONE = 'gone';
/** the bolt's sound options (reused) */
const SND = { kind: '' };
const TAU = Math.PI * 2;

export class Animals {
  constructor(life, L, rand) {
    this.life = life;
    this.rand = rand;
    this.L = L ?? null;
    this.list = [];
    this.bolted = 0;
    if (this.L?.animals) this._build(life.set ?? {}, life.world?.colliders?.circles ?? []);
  }

  range(a, b) {
    return a + (b - a) * this.rand();
  }

  /** Is (x, z) on the fighting ground? */
  inside(x, z) {
    const k = this.L?.keepOut ?? 0;
    return this.L?.square ? Math.max(Math.abs(x), Math.abs(z)) < k : Math.hypot(x, z) < k;
  }

  _free(x, z, circles, pad) {
    if (this.inside(x, z)) return false;
    // (not where the hero arrives: it would be gone before he could see it)
    const sp = this.life.game?.CONFIG?.world?.playerSpawn;
    if (sp && Math.hypot(sp.x - x, sp.z - z) < 14) return false;
    for (const c of circles) if (Math.hypot(c.x - x, c.z - z) < c.r + pad) return false;
    // (nor under anything that stands: a butte, a pillar, a trunk draws far wider than its collider)
    for (const d of this.life.set?.breakables ?? []) {
      if (!d || !(d.h >= 0.4) || !Number.isFinite(d.x + d.z)) continue;
      if (Math.hypot(d.x - x, d.z - z) < (d.r ?? 0.5) * (d.h > 3 ? 2.2 : 1.3) + pad) return false;
    }
    for (const a of this.list) if (Math.hypot(a.hx - x, a.hz - z) < 2.2) return false;
    return true;
  }

  _build(set, circles) {
    for (const o of this.L.animals) {
      const K = FT.kinds[o.kind];
      if (!K) continue;
      const n = o.n | 0;
      // a herd stands together; the others each their own place
      let gx = 0, gz = 0;
      for (let i = 0; i < n; i++) {
        let x = 0, z = 0, ok = false;
        for (let tries = 0; tries < 60 && !ok; tries++) {
          if (o.at) {
            x = o.at[0]; z = o.at[1]; ok = true;
            break;
          }
          if (o.group && i > 0) {
            const a = this.rand() * TAU, r = this.range(1.4, 3);
            x = gx + Math.cos(a) * r; z = gz + Math.sin(a) * r;
          } else if (o.near) {
            const near = (set.breakables ?? []).filter((d) => o.near.includes(d.kind));
            const d = near[Math.floor(this.rand() * near.length)];
            if (!d) break;
            const a = this.rand() * TAU, r = (d.r ?? 0.5) + this.range(0.4, o.nearR ?? 2);
            x = d.x + Math.cos(a) * r; z = d.z + Math.sin(a) * r;
          } else if (o.square) {
            // a band round the square: |x| or |z| in r
            const side = Math.floor(this.rand() * 4), u = this.range(-o.r[1], o.r[1]), v = this.range(o.r[0], o.r[1]);
            x = side === 0 ? v : side === 1 ? -v : u;
            z = side === 2 ? v : side === 3 ? -v : u;
          } else {
            const a = this.rand() * TAU, r = this.range(o.r[0], o.r[1]);
            x = Math.cos(a) * r; z = Math.sin(a) * r;
          }
          ok = this._free(x, z, circles, 0.5);
        }
        if (!ok) continue;
        if (i === 0) { gx = x; gz = z; }
        this.list.push({
          kind: o.kind, K, o, x, z, y: 0, hx: x, hz: z, yaw: this.rand() * TAU, state: SIT,
          t: 0, wait: 0, ph: this.rand(), step: 0, hop: 0, pause: 0, moving: true, look: 0, looked: false,
          dx: 0, dz: 0, tx: 0, tz: 0, a: 1, back: -1, glint: 0, gx: 0, gz: 0, idle: this.range(2, 6), twitch: 0,
          q: this.rand(),
        });
      }
    }
  }

  /** Everything sitting within r of (x, z) bolts away from it. Returns how many. */
  alarm(x, z, r, why = '') {
    if (!Number.isFinite(x + z + r) || !(r > 0)) return 0;
    let n = 0;
    for (const a of this.list) {
      if (a.state !== SIT) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d > r) continue;
      this._bolt(a, x, z, d / Math.max(1, r));
      n++;
    }
    this.lastWhy = why;
    return n;
  }

  /** It goes (after its reaction: `far` 0..1 how far from the cause; a herd's far one first). */
  _bolt(a, cx, cz, far) {
    const K = a.K, o = a.o;
    a.state = WAIT;
    a.wait = this.range(K.react[0], K.react[1]) * (o.group ? 1.6 - far : 1);
    // the way to cover: away from the cause, never inward; a rat runs along its wall first
    let ox, oz;
    if (this.L.square) {
      // outward from the square: the axis it sits beyond
      if (Math.abs(a.x) > Math.abs(a.z)) { ox = Math.sign(a.x); oz = 0; } else { ox = 0; oz = Math.sign(a.z); }
    } else {
      const r = Math.hypot(a.x, a.z) || 1;
      ox = a.x / r; oz = a.z / r;
    }
    let ax = a.x - cx, az = a.z - cz;
    const al = Math.hypot(ax, az);
    if (al < 1e-3) { ax = ox; az = oz; } else { ax /= al; az /= al; }
    // keep it outward: at least half of the way is out of the arena
    let dx = ax + ox * 1.2, dz = az + oz * 1.2;
    const dot = dx * ox + dz * oz;
    if (dot < 0.5) { dx += ox * (0.5 - dot); dz += oz * (0.5 - dot); }
    let l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const cover = o.cover ?? 8;
    if (o.along) {
      // first along the wall (the tangent the cause pushes it to), then out
      const tx = -oz, tz = ox, s = Math.sign(ax * tx + az * tz) || (this.rand() < 0.5 ? -1 : 1);
      a.gx = a.x + tx * s * cover * o.along;
      a.gz = a.z + tz * s * cover * o.along;
      a.tx = a.gx + ox * cover * (1 - o.along) + dx * 1.5;
      a.tz = a.gz + oz * cover * (1 - o.along) + dz * 1.5;
    } else {
      a.gx = a.gz = NaN;
      a.tx = a.x + dx * cover;
      a.tz = a.z + dz * cover;
    }
    l = Math.hypot(a.tx - a.x, a.tz - a.z) || 1;
    a.dx = (a.tx - a.x) / l;
    a.dz = (a.tz - a.z) / l;
    a.t = 0;
    a.step = 0;
    a.hop = 0;
    a.pause = 0;
    a.moving = true;
    a.looked = false;
    a.look = 0;
    this.bolted++;
  }

  /** Every hidden one back at its place now (the Lab; the fox stays gone). */
  returnAll() {
    let n = 0;
    for (const a of this.list) {
      if (a.state !== HID) continue;
      this._home(a);
      n++;
    }
    return n;
  }

  _home(a) {
    a.state = SIT;
    a.x = a.hx;
    a.z = a.hz;
    a.y = 0;
    a.a = 0; // (it fades in)
    a.back = -1;
    a.t = 0;
  }

  clear(why) {
    if (why !== 'reset') return;
    // the fight's reset: whatever was running is in cover
    for (const a of this.list) if (a.state === RUN || a.state === WAIT) this._hide(a);
  }

  _hide(a) {
    a.state = a.o.once ? GONE : HID;
    a.back = -1;
    a.a = 0;
  }

  /** The frame: `fight` the boss is up (nothing returns), `back` s since the fight ended (or -1 when the
   *  hero has not fought: things that hid before it come back on the same clock from when they hid). */
  update(dt, fight, back, hero, draw) {
    const life = this.life, k = life.k;
    const run = hero.moving && hero.speed > 3.4;
    for (const a of this.list) {
      const K = a.K;
      if (a.state === SIT) {
        a.a = Math.min(1, a.a + dt / FT.back.fadeIn);
        const d = Math.hypot(hero.x - a.x, hero.z - a.z);
        if (d < (run ? K.runR : K.r)) this._bolt(a, hero.x, hero.z, d / K.runR);
        else {
          // at rest: a twitch now and then (a turn of the head, a shift), so it is alive, not a stamp
          a.idle -= dt;
          if (a.idle <= 0) {
            a.idle = this.range(2.5, 7);
            a.twitch = 0.35;
            if (this.rand() < 0.4) a.yaw += this.range(-1.2, 1.2);
          }
          if (a.twitch > 0) a.twitch -= dt;
        }
      } else if (a.state === WAIT) {
        a.wait -= dt;
        // the fox: it turns its head to him while it decides
        if (a.wait <= 0) {
          a.state = RUN;
          // the sound of it going: its kind's (a rabbit's rustle, a deer's hooves, a rat's skitter...)
          SND.kind = a.kind;
          lifeSay(life, 'animalBolt', a.x, a.z, SND);
        }
      } else if (a.state === RUN) {
        this._gait(a, dt, k);
      } else {
        if (a.glint > 0) {
          a.glint -= dt;
          if (draw) draw(a);
        }
        // back after the fight (or, before it, on its own clock), at its place, the hero well away;
        // in the fight nothing returns (and its clock starts again when the fight ends)
        if (a.state !== HID) continue;
        if (fight) { a.t = 0; a.back = -1; continue; }
        a.t += dt;
        if (a.back < 0) a.back = this.range(FT.back.animal[0], FT.back.animal[1]);
        if (a.t >= a.back && Math.hypot(hero.x - a.hx, hero.z - a.hz) > K.runR * FT.back.far) this._home(a);
        continue;
      }
      if (draw) draw(a);
    }
  }

  _gait(a, dt, k) {
    const K = a.K;
    a.t += dt;
    let v = 0;
    a.y = 0;
    switch (K.gait) {
      case 'hop': {
        // an arc, a pause, an arc: the hop's length is speed / hz, its pause its own
        if (a.pause > 0) {
          a.pause -= dt;
          if (a.pause <= 0) {
            // a zig at the start of a hop
            this._zig(a, K.zig);
          }
          break;
        }
        a.hop += dt * K.hz;
        if (a.hop >= 1) {
          a.hop = 0;
          a.pause = this.range(K.pause[0], K.pause[1]);
          break;
        }
        v = K.speed * k;
        a.y = Math.sin(a.hop * Math.PI) * K.arc;
        break;
      }
      case 'bound': {
        a.hop = (a.hop + dt * K.hz) % 1;
        v = K.speed * k * (0.8 + 0.4 * Math.sin(a.hop * Math.PI));
        a.y = Math.sin(a.hop * Math.PI) * K.arc;
        if (a.hop < dt * K.hz) this._zig(a, K.zig);
        break;
      }
      case 'dart': {
        // low and fast; one stop halfway (at the turn off the wall), its nose up
        if (a.pause > 0) { a.pause -= dt; break; }
        v = K.speed * k;
        a.hop += dt * K.hz;
        if (!a.looked && Number.isFinite(a.gx) && Math.hypot(a.gx - a.x, a.gz - a.z) < 0.4) {
          a.looked = true;
          a.pause = this.range(K.pause[0], K.pause[1]);
          const l = Math.hypot(a.tx - a.x, a.tz - a.z) || 1;
          a.dx = (a.tx - a.x) / l;
          a.dz = (a.tz - a.z) / l;
        }
        break;
      }
      case 'scuttle': {
        // stop-start: a burst, a freeze, a burst; a little sideways each time
        if (a.pause > 0) {
          a.pause -= dt;
          if (a.pause <= 0) { a.step = this.range(K.move[0], K.move[1]); this._zig(a, K.zig); }
          break;
        }
        if (a.step <= 0) a.step = this.range(K.move[0], K.move[1]);
        a.step -= dt;
        v = K.speed * k;
        a.hop += dt * K.hz;
        if (a.step <= 0) a.pause = this.range(K.pause[0], K.pause[1]);
        break;
      }
      case 'trot': {
        // a steady trot; once, a little way in, it stops and looks back at him; then on into the dark
        if (a.look > 0) {
          a.look -= dt;
          break;
        }
        if (!a.looked && a.t > K.lookAt) {
          a.looked = true;
          a.look = K.look;
          break;
        }
        v = K.speed * k * (a.looked ? 1.25 : 1);
        a.hop = (a.hop + dt * K.hz) % 1;
        a.y = Math.abs(Math.sin(a.hop * TAU)) * K.arc;
        break;
      }
      default:
        v = K.speed * k;
    }
    if (v > 0) {
      // (the rat's first leg goes to the turn off the wall)
      let gx = a.tx, gz = a.tz;
      if (K.gait === 'dart' && !a.looked && Number.isFinite(a.gx)) { gx = a.gx; gz = a.gz; }
      const ex = gx - a.x, ez = gz - a.z, el = Math.hypot(ex, ez) || 1;
      // steer onto the target (a zig bends it for a moment)
      const s = 1 - Math.exp(-dt * 4);
      a.dx += (ex / el - a.dx) * s;
      a.dz += (ez / el - a.dz) * s;
      const dl = Math.hypot(a.dx, a.dz) || 1;
      a.dx /= dl;
      a.dz /= dl;
      let nx = a.x + a.dx * v * dt, nz = a.z + a.dz * v * dt;
      // never onto the fighting ground
      if (this.inside(nx, nz)) { nx = a.x; nz = a.z; }
      a.x = nx;
      a.z = nz;
      a.yaw = Math.atan2(a.dz, a.dx);
    }
    // in cover: it fades into the dark as it gets there
    const left = Math.hypot(a.tx - a.x, a.tz - a.z);
    a.a = Math.min(1, left / 1.6);
    if (left < 0.35 || a.t > 12) {
      if (K.glint) a.glint = K.glint;
      a.gx = a.x; a.gz = a.z; // (the glint hangs where it went)
      this._hide(a);
      a.t = 0;
    }
  }

  _zig(a, z) {
    if (!(z > 0)) return;
    const ang = this.range(-z, z), c = Math.cos(ang), s = Math.sin(ang);
    const dx = a.dx * c - a.dz * s, dz = a.dx * s + a.dz * c;
    a.dx = dx;
    a.dz = dz;
  }
}

export const ANIMAL_STATES = Object.freeze({ SIT, WAIT, RUN, HID, GONE });
