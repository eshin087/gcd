import * as THREE from 'three';
import { FAUNA_TUNE as FT } from './faunaTuning.js';

// THE FLOCKS (part of the piece 'creatures'; creatures.js owns it and draws its letters): the birds
// hidden in a level's canopy (a tree wall, the ruins, the dead trees, the tower tops). A stretch of it
// is a ROOST; when fire, a heavy blow, a falling or burning tree or a roar reaches a roost, its twenty
// to forty birds burst out over a second, rise, bank together and wheel away as a loose, changing shape
// that thins as it goes. Each bird is one tiny faint letter (`v` / `-` with its wingbeat): the flock's
// mass is what reads (STYLE.md "The living world").
//
// THE WAY IT FLIES. The game camera looks down 58 degrees through a narrow lens (32 degrees): from the
// middle of an arena the tree wall is out of the frame, and a bird high up shows FARTHER UP the screen
// than the ground under it. So a flock leaving a roost north or to the side of the camera's focus is
// routed through the SKY the camera sees: it climbs out of the crown, banks, and sweeps across the top
// band of the frame (well up the screen from the hero, never over a fighter: creatures.js drops a letter
// that would print over one), then on out of the frame on the far side. A roost behind the camera
// (south of its focus) just climbs out and away. The way is a cubic curve from the crown, planned when
// the flock goes; each bird keeps its own drifting place round the curve's point (a spring).
//
//   flocks.roosts         [{ x, y, z, tx, tz (its tree), birds (hidden there now), full, def, back }]
//   flocks.flocks         the flocks (a fixed pool): { on, inbound, age, n, roost, birds: [...] }
//   flocks.flush(roost, cx, cz, why)   that roost goes now (away from (cx, cz)) → how many birds
//   flocks.fire(x, z, r) / .blow(x, z, r, power) / .fell(x, z) / .startle(x, z, r, k)
//                         the triggers (creatures.js routes ignite / impact / world:impact / startle)
//   flocks.refill(now)    every roost full again (the Lab)
//   flocks.flown          birds that left this page load (the tests)
//
// Rate limits (FAUNA_TUNE.flush): `gap` s between two flocks anywhere, at most `max` in the air, and a
// roost that went is empty until the fight is over (a level has a finite number of birds). Nothing
// here allocates per frame or draws from Math.random (its own stream: `rand`).

const TAU = Math.PI * 2;
const MAXB = 48;
/** the game camera when there is none to read (36 m out, 58 degrees down: CONFIG.camera) */
const CAM_UP = 36 * Math.sin((58 * Math.PI) / 180), CAM_BACK = 36 * Math.cos((58 * Math.PI) / 180);
/** the way's knots: a Catmull-Rom spline through 4 points (u 0..3) */
const SPAN = 3;

export class Flocks {
  /** life: the living world; L: the level's FAUNA block; rand: the fauna's own stream */
  constructor(life, L, rand) {
    this.life = life;
    this.rand = rand;
    this.L = L ?? null;
    this.roosts = [];
    this.flocks = [];
    this.flown = 0;
    this.F = L?.roosts?.look ? Object.freeze({ ...FT.flock, ...L.roosts.look }) : FT.flock;
    this._last = -1e9;
    this._q = [0, 0, 0];
    this._v = { fx: 0, fz: 0, cx: 0, cy: CAM_UP, cz: CAM_BACK };
    this._sp = [0, 0];
    this._sv = null;
    if (!this.L?.roosts) return;
    this._build(life.set ?? {});
    for (let i = 0; i < FT.flush.max; i++) {
      const birds = new Array(MAXB);
      for (let j = 0; j < MAXB; j++) {
        birds[j] = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, quit: 1, oa: 0, os: 0, ou: 0, pa: 0, ps: 0, pu: 0, w: 0.2, beat: 1, ph: 0, a: 0 };
      }
      // P: the way's four points (x, y, z each); u its parameter; (cx, cy, cz) the point now, (hx, hy, hz) its way
      this.flocks.push({ on: false, inbound: false, routed: false, age: 0, n: 0, roost: null, P: new Float32Array(12), u: 0, len: 1, life: 1, sp: 0, cx: 0, cy: 0, cz: 0, hx: 1, hy: 0, hz: 0, birds });
    }
  }

  range(a, b) {
    return a + (b - a) * this.rand();
  }

  _build(set) {
    const o = this.L.roosts, kinds = o.kinds;
    const cand = [];
    for (const d of set.breakables ?? []) {
      if (!d || !kinds.includes(d.kind) || !Number.isFinite(d.x + d.z + d.h)) continue;
      const rad = Math.hypot(d.x, d.z);
      if (rad < o.r[0] || rad > o.r[1] || d.h < (o.minH ?? 2)) continue;
      cand.push(d);
    }
    if (!cand.length) return;
    // spread round the level: the candidates by angle, one roost near the middle of each of n sectors
    cand.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
    const n = Math.min(o.n | 0, cand.length), per = cand.length / n;
    for (let i = 0; i < n; i++) {
      const d = cand[Math.min(cand.length - 1, Math.floor((i + 0.3 + 0.4 * this.rand()) * per))];
      const rad = Math.hypot(d.x, d.z) || 1;
      const ix = -d.x / rad, iz = -d.z / rad, k = o.inK ?? 0;
      const full = Math.round(this.range(o.birds[0], o.birds[1]));
      this.roosts.push({
        x: d.x + ix * k, z: d.z + iz * k, y: d.h * (o.yK ?? 0.8), tx: d.x, tz: d.z, ox: -ix, oz: -iz,
        crown: Math.max(1.2, (d.r ?? 0.5) * 3), def: d, piece: undefined, full, birds: full, back: -1,
      });
    }
  }

  get count() {
    let n = 0;
    for (const f of this.flocks) if (f.on) n++;
    return n;
  }

  /** Birds in the air now (the tests, the budget). */
  get airborne() {
    let n = 0;
    for (const f of this.flocks) {
      if (!f.on) continue;
      for (let i = 0; i < f.n; i++) if (f.birds[i].t >= 0 && f.birds[i].a > 0) n++;
    }
    return n;
  }

  /** May a flock go now? (the gap, the sky's room) */
  _may() {
    if (this.life.t - this._last < FT.flush.gap) return null;
    for (const f of this.flocks) if (!f.on) return f;
    return null;
  }

  /** The roost nearest (x, z) with birds in it, within `reach` m of its tree (null: none). */
  _nearest(x, z, reach) {
    let best = null, bd = reach;
    for (const R of this.roosts) {
      if (R.birds <= 0) continue;
      const d = Math.hypot(R.tx - x, R.tz - z);
      if (d <= bd) {
        bd = d;
        best = R;
      }
    }
    return best;
  }

  fire(x, z, r) {
    const R = this._nearest(x, z, FT.flush.fire + Math.max(0, r));
    return R ? this.flush(R, x, z, 'fire') : 0;
  }

  blow(x, z, r, power) {
    if (!(power >= FT.flush.power)) return 0;
    const R = this._nearest(x, z, FT.flush.blow + Math.max(0, r));
    return R ? this.flush(R, x, z, 'blow') : 0;
  }

  fell(x, z) {
    const R = this._nearest(x, z, FT.flush.fell);
    return R ? this.flush(R, x, z, 'fell') : 0;
  }

  startle(x, z, r, k) {
    if (!(k >= FT.flush.startleK)) return 0;
    const R = this._nearest(x, z, Math.min(r, FT.flush.startleR));
    return R ? this.flush(R, x, z, 'startle') : 0;
  }

  /** Where the camera looks now (its focus on the ground) and how far up the screen height lifts a thing. */
  _view() {
    const f = this.life.focus, cam = this.life.game?.camera?.position, V = this._v;
    V.fx = Number.isFinite(f?.x) ? f.x : 0;
    V.fz = Number.isFinite(f?.z) ? f.z : 0;
    if (cam && cam.y > 4 && Number.isFinite(cam.x + cam.z)) {
      V.cx = cam.x; V.cy = cam.y; V.cz = cam.z;
    } else {
      V.cx = V.fx; V.cy = CAM_UP; V.cz = V.fz + CAM_BACK;
    }
    return V;
  }

  /** Knot i of P: the point `y` m up that SHOWS at the screen point (nx, ny) (-1..1, y up): on the
   *  camera's line of sight through it (no camera, headless: the game camera's numbers round the focus). */
  _shows(P, i, nx, ny, y) {
    const V = this._v, cam = this.life.game?.camera;
    if (cam?.matrixWorld && cam.projectionMatrixInverse && cam.position.y > y + 1) {
      const v = (this._sv ??= new THREE.Vector3()).set(nx, ny, 0.5).unproject(cam);
      const dx = v.x - cam.position.x, dy = v.y - cam.position.y, dz = v.z - cam.position.z;
      if (dy < -1e-4) {
        const t = (y - cam.position.y) / dy;
        P[i] = cam.position.x + dx * t;
        P[i + 1] = y;
        P[i + 2] = cam.position.z + dz * t;
        return;
      }
    }
    // (the game camera sees about 20 m either side and 16 m up the screen from its focus)
    const gx = V.fx + nx * 20, gz = V.fz - ny * 15, k = Math.max(0.2, (V.cy - y) / V.cy);
    P[i] = V.cx + (gx - V.cx) * k;
    P[i + 1] = y;
    P[i + 2] = V.cz + (gz - V.cz) * k;
  }

  /** Where (x, y, z) is on the screen, into this._sp ([nx, ny], -1..1, y up; headless: from the focus). */
  _ndc(x, y, z) {
    const cam = this.life.game?.camera, o = this._sp;
    if (cam?.matrixWorldInverse && cam.projectionMatrix) {
      const v = (this._sv ??= new THREE.Vector3()).set(x, y, z).project(cam);
      o[0] = v.x; o[1] = v.y;
    } else {
      o[0] = (x - this._v.fx) / 20;
      o[1] = (this._v.fz - z) / 15;
    }
    return o;
  }

  /** That roost goes now, away from (cx, cz). Returns how many birds took off (0: the limits held it). */
  flush(R, cx, cz, why = '') {
    if (!R || R.birds <= 0) return 0;
    const f = this._may();
    if (!f) return 0;
    const F = this.F, life = this.life;
    const n = Math.max(4, Math.min(MAXB, R.birds, Math.round(R.birds * Math.max(0.3, Math.min(1, life.quality)))));
    R.birds = 0;
    R.back = -1;
    this._last = life.t;
    this.flown += n;
    this.lastWhy = why;
    // away from the cause, and out
    let ax = R.x - cx, az = R.z - cz;
    const al = Math.hypot(ax, az);
    if (al < 1e-3) { ax = R.ox; az = R.oz; } else { ax /= al; az /= al; }
    const ux = ax + R.ox * 1.5, uz = az + R.oz * 1.5, ul = Math.hypot(ux, uz) || 1;
    const ox = ux / ul, oz = uz / ul;
    this._view();
    const P = f.P, W = F.way;
    P[0] = R.x; P[1] = R.y + 0.5; P[2] = R.z;
    const sp = this._ndc(R.x, R.y, R.z);
    let s = Math.sign(sp[0]);
    if (Math.abs(sp[0]) < 0.12) s = this.rand() < 0.5 ? -1 : 1;
    f.routed = sp[1] > W.behind;
    // out of the crown: up, and a little away (routed: already toward the sky it will cross)
    P[3] = R.x + ox * W.out; P[4] = R.y + W.rise; P[5] = R.z + oz * W.out;
    if (f.routed) {
      // across the sky the camera sees: into the top band on the roost's side, over to the far side and
      // out of the frame (knots placed where they SHOW: on the camera's line of sight)
      const y2 = this.range(W.high[0], W.high[1]), y3 = y2 + W.climbOut;
      this._shows(P, 6, s * this.range(W.near[0], W.near[1]), this.range(W.band[0], W.band[1]), y2);
      this._shows(P, 9, -s * W.far, W.top, y3);
      // (the climb out bends toward that band at once: the flock shows soon after it goes)
      const wx = P[6] - R.x, wz = P[8] - R.z, wl = Math.hypot(wx, wz) || 1;
      P[3] = R.x + (wx / wl) * W.out + ox; P[5] = R.z + (wz / wl) * W.out + oz;
    } else {
      // behind the camera: it climbs out and away (along the tree line, then out)
      const tx = -R.oz * s, tz = R.ox * s;
      P[6] = R.x + ox * 10 + tx * 10; P[7] = R.y + 12; P[8] = R.z + oz * 10 + tz * 10;
      P[9] = R.x + ox * 28 + tx * 30; P[10] = R.y + 18; P[11] = R.z + oz * 28 + tz * 30;
    }
    this._start(f, R, n, false);
    for (let i = 0; i < n; i++) this._launch(f.birds[i], R, f, i);
    return n;
  }

  /** Common start of a flock on the way f.P. */
  _start(f, R, n, inbound) {
    const P = f.P;
    // the way's length (a coarse sum along it): how long it flies at speed, and the drop-outs' clock
    let len = 0, px = P[0], py = P[1], pz = P[2];
    for (let i = 1; i <= 24; i++) {
      cr(P, (i / 24) * SPAN, this._q);
      len += Math.hypot(this._q[0] - px, this._q[1] - py, this._q[2] - pz);
      px = this._q[0]; py = this._q[1]; pz = this._q[2];
    }
    f.len = Math.max(1, len);
    f.on = true;
    f.inbound = inbound;
    f.age = 0;
    f.n = n;
    f.roost = R;
    f.u = 0;
    f.sp = inbound ? this.F.speed[1] * 0.7 : this.F.speed[0];
    f.life = inbound ? f.len / f.sp + 1 : Math.min(this.F.life, f.len / this.F.speed[1] + 2.5);
    f.cx = P[0]; f.cy = P[1]; f.cz = P[2];
    f.hx = 0; f.hy = 1; f.hz = 0;
  }

  _launch(b, R, f, i) {
    const F = this.F, k = this.life.k;
    // its own moment: more go early than late, never all on one frame
    b.t = i === 0 ? 0 : -FT.flock.burst * Math.pow(this.rand(), 1.6);
    const a = this.rand() * TAU, rr = R.crown * Math.sqrt(this.rand());
    b.x = R.x + Math.cos(a) * rr;
    b.z = R.z + Math.sin(a) * rr;
    b.y = R.y + this.range(-1.2, 0.4);
    const out = this.range(F.launchOut[0], F.launchOut[1]) * k;
    const dx = f.P[3] - f.P[0], dz = f.P[5] - f.P[2], dl = Math.hypot(dx, dz) || 1;
    b.vx = (dx / dl) * out + Math.cos(a) * 0.8;
    b.vz = (dz / dl) * out + Math.sin(a) * 0.8;
    b.vy = this.range(F.launchUp[0], F.launchUp[1]) * k;
    // its place in the shape (-1..1 each way; the late ones trail) and its own slow drift through it
    b.oa = this.range(-1, 0.6) + b.t * 0.9;
    b.os = this.range(-1, 1);
    b.ou = this.range(-1, 1);
    b.pa = this.rand() * TAU; b.ps = this.rand() * TAU; b.pu = this.rand() * TAU;
    b.w = this.range(F.drift[0], F.drift[1]) * TAU;
    b.quit = this.range(F.quit[0], F.quit[1]) * f.life;
    b.beat = this.range(0.8, 1.2);
    b.ph = this.rand();
    b.a = 0;
  }

  /** A few birds fly back in to a roost (after the fight): from the sky the camera sees, down into the crown. */
  _inbound(R) {
    const f = this._may();
    const F = this.F, B = FT.back;
    if (!f) return false;
    const n = Math.min(MAXB, Math.round(this.range(B.inbound[0], B.inbound[1]) * Math.max(0.5, this.life.quality)));
    this._view();
    const s = this._ndc(R.x, R.y, R.z)[0] < 0 ? -1 : 1;
    const P = f.P, y0 = 12;
    // from out of the frame on the far side, across the top band, down into the crown
    this._shows(P, 0, -s * 1.3, 0.75, y0);
    this._shows(P, 3, 0, 0.6, y0 - 1);
    P[6] = R.x + R.ox * 2; P[7] = R.y + 6; P[8] = R.z + R.oz * 2;
    P[9] = R.x; P[10] = R.y; P[11] = R.z;
    this._start(f, R, n, true);
    for (let i = 0; i < n; i++) {
      const b = f.birds[i];
      b.t = -this.range(0, 0.8);
      b.oa = this.range(-1, 1); b.os = this.range(-1, 1); b.ou = this.range(-1, 1);
      b.pa = this.rand() * TAU; b.ps = this.rand() * TAU; b.pu = this.rand() * TAU;
      b.w = this.range(F.drift[0], F.drift[1]) * TAU;
      b.x = P[0] + b.oa * 2; b.y = P[1] + b.ou; b.z = P[2] + b.os * 2;
      b.vx = b.vy = b.vz = 0;
      b.quit = 1e9;
      b.beat = this.range(0.8, 1.2);
      b.ph = this.rand();
      b.a = 0;
    }
    this._last = this.life.t;
    return true;
  }

  /** Every roost full again (the Lab). */
  refill() {
    let n = 0;
    for (const R of this.roosts) {
      if (R.birds >= R.full || !this._standing(R)) continue;
      R.birds = R.full;
      R.back = -1;
      n++;
    }
    return n;
  }

  /** Does the roost's tree still stand? (world.destructibles; unknown: yes) */
  _standing(R) {
    if (R.piece === undefined) {
      const list = this.life.world?.destructibles?.list;
      if (!Array.isArray(list)) return true;
      R.piece = list.find((o) => o?.def === R.def) ?? null;
    }
    return !R.piece || R.piece.state === 0;
  }

  /** The fight was reset: what is in the air goes (its birds come back with the roost's return). */
  clear(why) {
    if (why !== 'reset') return;
    for (const f of this.flocks) f.on = false;
  }

  /**
   * The frame. `fight`: the boss is up (nothing returns); `back` the s since the fight ended (-1 in it).
   * Writes its letters through put(x, y, z, wing (0, 1 the beat, 2 a glide), alpha).
   */
  update(dt, fight, back, put) {
    if (!this.roosts.length) return;
    for (const R of this.roosts) {
      // a roost whose tree came down sends its birds up (once)
      if (R.birds > 0 && !this._standing(R)) this.flush(R, R.tx - R.ox, R.tz - R.oz, 'felled');
      // after the fight: each empty roost fills again in its own time (a few birds fly in to it)
      if (fight || back < 0 || R.birds >= R.full || !this._standing(R)) continue;
      if (R.back < 0) R.back = back + this.range(FT.back.roost[0], FT.back.roost[1]);
      if (back >= R.back && (this._inbound(R) || R.back + 30 < back)) {
        R.birds = R.full;
        R.back = -1;
      }
    }
    for (const f of this.flocks) if (f.on) this._fly(f, dt, put);
  }

  _fly(f, dt, put) {
    const F = this.F, life = this.life, k = life.k, P = f.P, q = this._q;
    f.age += dt;
    // the point on its way: it gathers speed along the curve (past its end: on along the last tangent)
    f.sp += (F.speed[1] * (f.inbound ? 0.7 : 1) * k - f.sp) * (1 - Math.exp(-dt / F.accel));
    const u0 = f.u;
    crD(P, Math.min(SPAN, u0), q);
    const dl = Math.hypot(q[0], q[1], q[2]) || 1;
    f.hx = q[0] / dl; f.hy = q[1] / dl; f.hz = q[2] / dl;
    f.u += (f.sp * dt) / dl;
    if (f.u <= SPAN) {
      cr(P, f.u, q);
      f.cx = q[0]; f.cy = q[1]; f.cz = q[2];
    } else {
      f.cx += f.hx * f.sp * dt; f.cy += f.hy * f.sp * dt; f.cz += f.hz * f.sp * dt;
    }
    if (f.age > f.life + F.fade || (f.inbound && f.u > SPAN + 0.05)) {
      f.on = false;
      return;
    }
    // the shape round the point: along its way (flat), across it, up and down; it loosens as it goes
    let hx = f.hx, hz = f.hz;
    const hl = Math.hypot(hx, hz);
    if (hl > 1e-3) { hx /= hl; hz /= hl; } else { hx = 1; hz = 0; }
    const grow = 1 + (F.loose - 1) * Math.min(1, f.age / f.life);
    const len = F.along * grow, wid = F.across * grow, hgt = F.up * grow;
    const gather = f.inbound ? 1 : Math.min(1, f.age / F.gather);
    const K = F.spring * (0.2 + 0.8 * gather), C = F.damp;
    const vcx = f.hx * f.sp, vcy = f.hy * f.sp, vcz = f.hz * f.sp;
    const beat0 = F.beat[0], beat1 = F.beat[1];
    for (let i = 0; i < f.n; i++) {
      const b = f.birds[i];
      b.t += dt;
      if (b.t < 0) continue;
      if (b.t > b.quit + F.fade) {
        b.a = 0;
        continue;
      }
      // its place in the shape now (each on its own slow drift: the shape stretches, curls and thins)
      const t = f.age;
      const oa = (b.oa + 0.35 * Math.sin(t * b.w + b.pa)) * len;
      const os = (b.os + 0.35 * Math.sin(t * b.w * 1.3 + b.ps)) * wid * (f.inbound ? 1 - 0.8 * Math.min(1, f.u / SPAN) : 1);
      const ou = (b.ou + 0.4 * Math.sin(t * b.w * 0.8 + b.pu)) * hgt;
      const tx = f.cx + hx * oa - hz * os, tz = f.cz + hz * oa + hx * os, ty = f.cy + ou;
      // (the burst: the climb out of the crown first, then the spring gathers it in)
      const up = f.inbound ? 1 : Math.min(1, b.t / 0.7);
      b.vx += (K * (tx - b.x) + C * (vcx - b.vx)) * dt * up;
      b.vy += (K * (ty - b.y) + C * (vcy - b.vy)) * dt * up;
      b.vz += (K * (tz - b.z) + C * (vcz - b.vz)) * dt * up;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      // fade in out of the crown, out as it drops off (the flock thins), out into the crown coming home
      let a = Math.min(1, b.t / 0.18);
      if (b.t > b.quit) a *= Math.max(0, 1 - (b.t - b.quit) / F.fade);
      if (f.inbound) a *= Math.min(1, Math.max(0, (SPAN + 0.05 - f.u) / 0.35));
      b.a = a;
      if (!(a > 0.01) || !put) continue;
      // the wingbeat: hard as it bursts out, slower under way, with glides
      const hz2 = (beat1 + (beat0 - beat1) * Math.exp(-b.t / 1.2)) * b.beat;
      b.ph += hz2 * dt;
      const glide = b.t > 1.8 && Math.sin(b.t * 0.9 + b.pa) > 0.55;
      put(b.x, b.y, b.z, glide ? 2 : (b.ph % 1) < 0.5 ? 0 : 1, a);
    }
  }
}

/** The point at u (0..3) on the Catmull-Rom spline through the 4 knots of P (12 numbers), into q. */
function cr(P, u, q) {
  const i = Math.min(2, Math.max(0, Math.floor(u))), t = Math.min(1, Math.max(0, u - i));
  const t2 = t * t, t3 = t2 * t;
  for (let c = 0; c < 3; c++) {
    const p1 = P[i * 3 + c], p2 = P[(i + 1) * 3 + c];
    const p0 = i > 0 ? P[(i - 1) * 3 + c] : 2 * p1 - p2;
    const p3 = i < 2 ? P[(i + 2) * 3 + c] : 2 * p2 - p1;
    q[c] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
}

/** Its derivative at u, into q. */
function crD(P, u, q) {
  const i = Math.min(2, Math.max(0, Math.floor(u))), t = Math.min(1, Math.max(0, u - i));
  const t2 = t * t;
  for (let c = 0; c < 3; c++) {
    const p1 = P[i * 3 + c], p2 = P[(i + 1) * 3 + c];
    const p0 = i > 0 ? P[(i - 1) * 3 + c] : 2 * p1 - p2;
    const p3 = i < 2 ? P[(i + 2) * 3 + c] : 2 * p2 - p1;
    q[c] = 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2);
  }
}
