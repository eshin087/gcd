import { CONFIG } from '../core/config.js';
import { LAST_BLOW_MODES, LAST_BLOW_OPTS, LAST_BLOW_DEFAULT, lastBlowFraming } from './lastBlowTuning.js';

// THE LAST BLOW (`?lastBlow=off|a|b|c`, the Lab's FIGHT row; ADR-272): when the hero's blow takes a boss's
// health to zero, the camera cuts (or pushes fast) to a close, low shot of the two fighters, time slows
// as the blow follows through and he starts to fall, the shot holds, then the camera returns and the
// fight's own death beat and the victory flow carry on unchanged. Camera and time only: no grade, no
// dim, no colour. One mechanism for every boss; the framing per level is data (lastBlowTuning.js).
//
//   new LastBlow(game, flow)     (flow.lastBlow; flow.update calls update(rdt) once a frame, real s)
//   lastBlow.update(rdt)         decides on a death seen since the last frame, runs the shot
//   lastBlow.cancel()            a reset, a respawn or a Lab jump: let go at once
//   lastBlow.active              the shot owns the camera, the clock and the hero
//   lastBlow.holding             === active: the hero cannot be hurt (player._takeHit) and his input is off
//   lastBlow.scale               the shot's time scale this frame (1 without one; the flow min-merges it)
//   lastBlow.view                what it writes to game.viewOverride ({ pos, target, focus, holdAim })
//   lastBlow.taken, lastBlow.last { kind, level, mode, side, d }   (the tests and the Lab read them)
//   lastBlow.skipped             why the last death took no shot ('' when it did)
//
// The killing blow: 'dragon:death' arms it; the hero's last landed blow ('player:hitDragon' with damage,
// not guarded, or 'dragon:returned': a returned bullet or ki shot) within `window` real s of it is the
// killing blow (it may come in the same call as the death, after it: the duelists die inside takeHit).
// A Lab kill, a burn, a death with no blow of the hero's: no shot, today's behaviour.
//
// The shot: the pair's two subject spheres (the hero's chest; the boss's chest, or the wyrm's hurt
// sphere nearest the contact) fitted in the real camera's view from the side of the line between them,
// turned `yaw` toward the hero's back (he is the nearer one), looking down `pitch` (low). The side
// facing the game camera (south) is tried first, then the other, then wider and narrower turns, a
// steeper look; a place is good when it stands on the hero's ground (world.heroBound, minus `clear`),
// off every collider and the boss's body, above the floor, and sees both subjects past every collider.
// None good: no shot (today). While it holds it follows the pair (damped), keeping its side; a pose that
// would stop being good is not taken (the last good one stays). The clock runs on real seconds and
// stops while the game is paused (and the hero's input is given back for the pause menu).
//
// Per frame: no allocation (every vector is the instance's own), never throws out (the flow wraps it),
// never writes NaN (a non-finite pose is not taken).

const q = (name) => {
  try {
    return typeof location !== 'undefined' ? new URLSearchParams(location.search).get(name) : null;
  } catch {
    return null;
  }
};
const fromUrl = q('lastBlow');
/** The switch (`?lastBlow=`): read as a death is seen (the Lab cycles it). */
export const LAST_BLOW = { opts: LAST_BLOW_OPTS, mode: LAST_BLOW_OPTS.includes(fromUrl) ? fromUrl : LAST_BLOW_DEFAULT };
export const lastBlowMode = () => LAST_BLOW.mode;
export const setLastBlow = (m) => (LAST_BLOW.mode = LAST_BLOW_OPTS.includes(m) ? m : LAST_BLOW_DEFAULT);

const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const v3 = () => ({ x: 0, y: 0, z: 0 });

/** A rigged boss's named points the body check reads (the wyrm's rig.pt), and its limbs' joints. */
const RIG_PTS = ['head', 'snout', 'chest', 'hips', 'neckBase'];
const RIG_LIMBS = [['arms', 'shoulder', 'elbow', 'wrist', 'toe'], ['legs', 'hip', 'knee', 'ankle'], ['wings', 'root', 'elbow', 'wrist']];
const near = (v, x, y, z, r) => {
  const dx = v.x - x, dy = v.y - y, dz = v.z - z;
  return dx * dx + dy * dy + dz * dz < r * r;
};

/** The turns tried off the first (rad, added to the framing's yaw), and the steeper looks. */
const YAW_TRY = [0, 0.3, -0.3, 0.6, -0.6];
const PITCH_TRY = [0, 0.17];

export class LastBlow {
  constructor(game, flow) {
    this.game = game;
    this.flow = flow;
    this.active = false;
    this.holding = false;
    this.scale = 1;
    this.t = 0;
    this.taken = 0;
    this.skipped = '';
    this.last = null;
    /** what turned the places down at the last decision (rule -> count): far, floor, edge, collider, sight, tidy, body */
    this.rejects = {};
    /** the last shot was cut back early: the boss's falling body came near the camera */
    this.cutShort = false;
    this.view = { pos: v3(), target: v3(), focus: v3(), holdAim: true, owner: 'lastBlow' };
    this._from = 1; // the push's start: how many times the shot's distance back along its line of sight
    this.M = null; // the mode's numbers while a shot runs
    this.F = null; // the level's framing while a shot runs
    this._pending = -1; // realTime of a death not decided yet (-1: none)
    this._hit = { t: -1e9, kind: '', has: false, x: 0, y: 0, z: 0 };
    this._side = 1;
    this._yaw = 0;
    this._pitch = 0;
    this._contact = false;
    this._inputOff = false;
    // the subjects and the solve's scratch (no per-frame allocation)
    this._H = { x: 0, y: 0, z: 0, r: 1 };
    this._B = { x: 0, y: 0, z: 0, r: 1 };
    this._lp = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, copy(v) { return this.set(v.x, v.y, v.z); } };
    this._pose = { cx: 0, cy: 0, cz: 0, tx: 0, ty: 0, tz: 0, d: 0, fx: 0, fz: 0, tanH: 0, near: 0 };
    this._cur = { cx: 0, cy: 0, cz: 0, tx: 0, ty: 0, tz: 0 };

    const ev = game?.events;
    ev?.on?.('dragon:death', () => {
      this._pending = fin(this.game.realTime, 0);
    });
    ev?.on?.('player:hitDragon', (d) => {
      if (!(fin(d?.damage) > 0) || d?.guarded) return;
      this._noteHit(String(d?.kind ?? 'hit'), d?.point);
    });
    ev?.on?.('dragon:returned', (d) => {
      if (!(fin(d?.damage, 1) > 0)) return;
      this._noteHit('returned', d);
    });
  }

  _noteHit(kind, p) {
    const h = this._hit;
    h.t = fin(this.game.realTime, 0);
    h.kind = kind;
    h.has = !!p && Number.isFinite(p.x + p.y + p.z);
    if (h.has) {
      h.x = p.x;
      h.y = p.y;
      h.z = p.z;
    }
  }

  /** Once a frame (real s), from flow._update. */
  update(rdt) {
    if (this._pending >= 0) {
      const at = this._pending;
      this._pending = -1;
      if (!this.active) this._decide(at);
    }
    if (!this.active) {
      this.scale = 1;
      return;
    }
    const g = this.game;
    // a pause holds the shot where it stands; the pause menu needs the input
    if (g.state === 'paused') {
      this._input(false);
      return;
    }
    // the flow left the fight (a death screen cannot come: he is unhurt; a reset or a jump cancels)
    if (g.state !== 'boss' && g.state !== 'bossIntro' && g.state !== 'victory') {
      this.cancel();
      return;
    }
    this._input(true);
    const dt = clamp(fin(rdt), 0, 0.1);
    this.t += dt;
    const M = this.M, F = this.F;
    if (this.t >= M.hold) {
      this._end(true);
      return;
    }
    const u = this.t / M.hold;
    this.scale = clamp(M.slow[0] + (M.slow[1] - M.slow[0]) * smooth(u), 0.05, 1);
    // follow the pair (its side kept); a pose that is not good is not taken
    if (this._subjects() && this._fit(this._side, this._yaw, this._pitch) && this._good()) {
      const k = 1 - Math.exp(-F.lambda * dt), P = this._pose, C = this._cur;
      C.cx += (P.cx - C.cx) * k;
      C.cy += (P.cy - C.cy) * k;
      C.cz += (P.cz - C.cz) * k;
      C.tx += (P.tx - C.tx) * k;
      C.ty += (P.ty - C.ty) * k;
      C.tz += (P.tz - C.tz) * k;
    }
    // his falling body comes at the camera (the wyrm rolling over, a wing): cut back now, never through him
    const C = this._cur;
    if (this._bodyNear(C.cx, C.cy, C.cz, F.keep)) {
      this.cutShort = true;
      this._end(true);
      return;
    }
    this._write();
  }

  /** A reset, a respawn, a Lab jump: let go at once (no shot counted). */
  cancel() {
    this._pending = -1;
    if (this.active) this._end(false);
  }

  // ---------------------------------------------------------------- deciding
  _decide(at) {
    for (const k in this.rejects) this.rejects[k] = 0;
    const why = this._why(at);
    this.skipped = why;
    if (why) return;
    const F = this.F;
    // the contact (a boss framed where the blade met him, the wyrm: its body too big to fit beside the
    // hero): the blow's point, kept where it landed; a blow with no point (a returned shot): his chest
    const h = this._hit;
    this._contact = !!F.contact && h.has && Math.hypot(h.x - this.game.player.position.x, h.z - this.game.player.position.z) <= F.maxGap;
    if (!this._subjects()) {
      this.skipped = 'no subjects';
      return;
    }
    const H = this._H, B = this._B;
    if (Math.hypot(B.x - H.x, B.z - H.z) > F.maxGap) {
      this.skipped = 'too far apart';
      return;
    }
    // the side the game camera looks from (south, +z) first: the cut keeps the screen's left and right
    const ux = B.x - H.x, uz = B.z - H.z;
    let first = ux >= 0 ? 1 : -1; // n = (-uz, ux) * s: its z is ux * s
    // (a boss that falls to one side, the wyrm onto its right: the camera stands on the other side first)
    const d = this.game.dragon;
    if (F.fall && Number.isFinite(d?.yaw)) {
      const rx = -Math.cos(d.yaw) * F.fall, rz = Math.sin(d.yaw) * F.fall;
      first = -uz * rx + ux * rz > 0 ? -1 : 1;
    }
    // (the game camera's side before anything else: a cut to the other side swaps who stands left and
    // right; on a side, first with nothing standing near the camera inside the frame, then without that)
    for (const s of [first, -first]) for (const tidy of [true, false]) {
      for (const p of PITCH_TRY) {
        for (const y of YAW_TRY) {
          if (this._fit(s, F.yaw + y, F.pitch + p) && this._good(tidy)) {
            this._side = s;
            this._yaw = F.yaw + y;
            this._pitch = F.pitch + p;
            this._start();
            return;
          }
        }
      }
    }
    this.skipped = 'no clear place for the camera';
  }

  /** Why this death takes no shot ('' = it takes one). Sets this.M and this.F. */
  _why(at) {
    const g = this.game;
    const mode = LAST_BLOW.mode;
    this.M = LAST_BLOW_MODES[mode] ?? null;
    this.F = lastBlowFraming(g.level?.id);
    if (!this.M) return 'off';
    if (this.F.skip) return this.F.why || 'this boss keeps today';
    if (g.state !== 'boss' && g.state !== 'bossIntro') return 'not in the fight';
    const p = g.player;
    if (!p?.position || p.alive === false) return 'the hero is down';
    if (!g.dragon) return 'no boss';
    if (g.viewOverride && g.viewOverride !== this.view) return 'the camera is taken (the Lab viewer)';
    const h = this._hit;
    if (!(at - h.t <= this.F.window && h.t - at <= 0.25)) return "no blow of the hero's";
    return '';
  }

  /** The two subjects now → this._H / this._B. False when one is not finite. */
  _subjects() {
    const g = this.game, F = this.F, p = g.player?.position, d = g.dragon;
    if (!p || !d) return false;
    const H = this._H, B = this._B;
    H.x = fin(p.x, NaN);
    H.y = fin(p.y, 0) + F.heroY;
    H.z = fin(p.z, NaN);
    H.r = F.heroR;
    if (this._contact) {
      const h = this._hit;
      B.x = h.x;
      B.y = h.y;
      B.z = h.z;
      B.r = F.bossR;
    } else {
      // (a duelist's chest; once he is gone, where he was)
      const lp = this._lp;
      if (typeof d.lockPoint === 'function' && d.object3d?.visible !== false) d.lockPoint(lp);
      else if (!this.active) lp.set(fin(d.position?.x), fin(d.position?.y) + 1.2, fin(d.position?.z));
      B.x = lp.x;
      B.y = lp.y;
      B.z = lp.z;
      B.r = F.bossR;
    }
    return Number.isFinite(H.x + H.y + H.z + B.x + B.y + B.z);
  }

  /** The pose for side s, turn yaw, look-down pitch → this._pose. False when the pair cannot fit. */
  _fit(s, yaw, pitch) {
    const F = this.F, H = this._H, B = this._B, cam = this.game.camera;
    let ux = B.x - H.x, uz = B.z - H.z;
    const L = Math.hypot(ux, uz);
    if (L > 1e-3) {
      ux /= L;
      uz /= L;
    } else {
      const yw = fin(this.game.player?.yaw);
      ux = Math.sin(yw);
      uz = Math.cos(yw);
    }
    // from the pair's middle toward the camera: the side (n), turned toward the hero's back (-u)
    const nx = -uz * s, nz = ux * s;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const vx = nx * cy - ux * sy, vz = nz * cy - uz * sy;
    const mx = (H.x + B.x) / 2, my = (H.y + B.y) / 2, mz = (H.z + B.z) / 2;
    // the view's axes (forward from the camera to the middle, right, up)
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = -vx * cp, fy = -sp, fz = -vz * cp;
    const rx = -fz, rz = fx; // right = forward x up(0,1,0), normalised by cp
    const rl = Math.hypot(rx, rz) || 1;
    const Rx = rx / rl, Rz = rz / rl;
    const Ux = -Rz * fy, Uy = Rz * fx - Rx * fz, Uz = Rx * fy; // up = right x forward
    const tanV = Math.tan((fin(cam?.fov, CONFIG.camera.fov) * Math.PI) / 360);
    const asp = fin(cam?.aspect, 16 / 9) > 0.1 ? fin(cam?.aspect, 16 / 9) : 16 / 9;
    const tanH = tanV * asp;
    let D = F.dMin;
    for (let i = 0; i < 2; i++) {
      const S = i ? B : H;
      const ox = S.x - mx, oy = S.y - my, oz = S.z - mz;
      const lx = Math.abs(ox * Rx + oz * Rz);
      const ly = Math.abs(ox * Ux + oy * Uy + oz * Uz);
      const df = ox * fx + oy * fy + oz * fz; // toward the camera (< 0): nearer, so it needs more room
      D = Math.max(D, -df + (lx + S.r) / (F.fill * tanH), -df + (ly + S.r) / (F.fill * tanV));
    }
    if (!(D <= F.dMax) || !Number.isFinite(D)) return this._no('far');
    const P = this._pose;
    P.cx = mx + vx * cp * D;
    P.cy = my + sp * D;
    P.cz = mz + vz * cp * D;
    P.tx = mx;
    P.ty = my;
    P.tz = mz;
    P.d = D;
    const fl = Math.hypot(fx, fz) || 1;
    P.fx = fx / fl;
    P.fz = fz / fl;
    P.tanH = tanH;
    P.near = D * cp; // (the ground distance from the camera to the pair's middle)
    return Number.isFinite(P.cx + P.cy + P.cz);
  }

  /** Is this._pose a place the camera may stand? (the floor, the ground's edge, colliders, his body, the
   *  sight lines; `tidy`: also no collider inside the frame between the camera and the pair, a pillar
   *  filling an edge of the shot) */
  _good(tidy = false) {
    const g = this.game, F = this.F, P = this._pose, H = this._H, B = this._B;
    const floor = fin(g.player?.position?.y, 0);
    if (P.cy < floor + F.floor) return this._no('floor');
    const w = g.world;
    let bound = fin(CONFIG.world?.playerBound, Infinity);
    try {
      if (typeof w?.heroBound === 'function') bound = fin(w.heroBound(P.cx, P.cz), bound);
    } catch {
      /* the default bound */
    }
    if (Math.hypot(P.cx, P.cz) > bound - F.clear) return this._no('edge');
    const C = w?.colliders;
    if (C?.circles) {
      for (const c of C.circles) {
        if (!c) continue;
        const dx = P.cx - c.x, dz = P.cz - c.z, r = fin(c.r) + F.clear;
        if (dx * dx + dz * dz < r * r) return this._no('collider');
      }
      if (typeof C.blocked === 'function' && (C.blocked(P.cx, P.cz, H.x, H.z, 0.3) || C.blocked(P.cx, P.cz, B.x, B.z, 0.3))) return this._no('sight');
      if (tidy) {
        const near = P.near * 0.6; // (what stands near the camera fills the frame; nearer the pair, it is the scene)
        for (const c of C.circles) {
          if (!c || !(c.r >= 0.3)) continue;
          const dx = c.x - P.cx, dz = c.z - P.cz;
          const depth = dx * P.fx + dz * P.fz;
          if (depth <= 0 || depth > near) continue;
          if (Math.abs(dx * P.fz - dz * P.fx) < depth * P.tanH + c.r) return this._no('tidy');
        }
      }
    }
    if (this._bodyNear(P.cx, P.cy, P.cz, F.clear)) return this._no('body');
    return true;
  }

  /** Does the boss's body come within `m` m of (x, y, z)? His hurt spheres, his body circles and, for a
   *  boss with a rig of named points (the wyrm: its hurt spheres go as it dies), those points as spheres
   *  of the framing's `bodyR`. */
  _bodyNear(x, y, z, m) {
    const d = this.game.dragon, F = this.F;
    if (!d) return false;
    const BC = d.bodyCircles;
    if (Array.isArray(BC)) {
      for (const c of BC) {
        if (!c || !Number.isFinite(c.x + c.z + c.r)) continue;
        const dx = x - c.x, dz = z - c.z, r = c.r + m;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    const HS = d.hurtSpheres;
    if (Array.isArray(HS)) for (const s of HS) if (s && near(s, x, y, z, s.r + m)) return true;
    const pt = F.bodyR > 0 ? d.rig?.pt : null;
    if (pt) {
      const r = F.bodyR + m;
      for (const k of RIG_PTS) if (pt[k] && near(pt[k], x, y, z, r)) return true;
      for (const set of RIG_LIMBS) {
        const L = pt[set[0]];
        if (!Array.isArray(L)) continue;
        for (const limb of L) for (let i = 1; i < set.length; i++) if (limb?.[set[i]] && near(limb[set[i]], x, y, z, r)) return true;
      }
      for (const w of pt.wings ?? []) for (const t of w?.tips ?? []) if (t && near(t, x, y, z, r)) return true;
    }
    return false;
  }

  /** A rule turned a place down: counted (lastBlow.rejects, read by the tests and the Lab), false. */
  _no(k) {
    const R = this.rejects;
    R[k] = (R[k] | 0) + 1;
    return false;
  }

  // ---------------------------------------------------------------- running
  _start() {
    const P = this._pose, C = this._cur;
    C.cx = P.cx;
    C.cy = P.cy;
    C.cz = P.cz;
    C.tx = P.tx;
    C.ty = P.ty;
    C.tz = P.tz;
    this.active = true;
    this.holding = true;
    this.cutShort = false;
    this.t = 0;
    this.scale = this.M.slow[0];
    // the push (c): the shot starts `from` x further back along its own line of sight and dollies in, out
    // the same way at the end; that far place must pass the same rules (or a nearer one: or none, a cut)
    this._from = 1;
    if (this.M.push > 0) {
      const x = P.cx, y = P.cy, z = P.cz, n = P.near;
      for (const f of [this.M.from, (this.M.from + 1) / 2]) {
        P.cx = P.tx + (x - P.tx) * f;
        P.cy = P.ty + (y - P.ty) * f;
        P.cz = P.tz + (z - P.tz) * f;
        P.near = n * f;
        const ok = this._good(false);
        P.cx = x;
        P.cy = y;
        P.cz = z;
        P.near = n;
        if (ok) {
          this._from = f;
          break;
        }
      }
    }
    this.last = { kind: this._hit.kind, level: this.game.level?.id ?? '', mode: LAST_BLOW.mode, side: this._side, d: +P.d.toFixed(2), from: this._from };
    this._input(true);
    this._write();
  }

  _write() {
    const C = this._cur, V = this.view, M = this.M;
    // (the push: how far back along the line of sight, 1 = on the shot; the dolly eases in and out)
    const k = this._from > 1 ? 1 + (this._from - 1) * (1 - smooth(Math.min(this.t, M.hold - this.t) / M.push)) : 1;
    V.pos.x = C.tx + (C.cx - C.tx) * k;
    V.pos.y = C.ty + (C.cy - C.ty) * k;
    V.pos.z = C.tz + (C.cz - C.tz) * k;
    V.target.x = C.tx;
    V.target.y = C.ty;
    V.target.z = C.tz;
    // (the light pool, the fog and the shadow box: round the pair on the ground)
    V.focus.x = C.tx;
    V.focus.y = 0;
    V.focus.z = C.tz;
    const g = this.game;
    if (!g.viewOverride || g.viewOverride === V) g.viewOverride = V;
  }

  /** The hero's input off while the shot runs (on for a pause menu); given back once. */
  _input(off) {
    const inp = this.game.input;
    if (!inp) return;
    if (off && !this._inputOff) {
      if (inp.enabled === false) return; // (someone else holds it: leave it to them)
      inp.enabled = false;
      this._inputOff = true;
    } else if (!off && this._inputOff) {
      inp.enabled = true;
      this._inputOff = false;
    }
  }

  _end(counted) {
    const g = this.game;
    this.active = false;
    this.holding = false;
    this.scale = 1;
    this.t = 0;
    this._input(false);
    if (g.viewOverride === this.view) g.viewOverride = null;
    if (counted) this.taken++;
  }
}
