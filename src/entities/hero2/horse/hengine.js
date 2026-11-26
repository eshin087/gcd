// The horse's clip player and animator: the hero2 engine's way (../engine.js) on the horse's skeleton.
// The hero's createClipPlayer / createHero2 / pinFeet are bound to the hero's 24 joints and two feet, so
// this is a thin copy for HJ joints and four hooves (what the engine would need to take a second
// skeleton is in the horse builder's report). Everything skeleton-free is the hero's own code.
//
//   createHorse(game, { body, library, applyRoot = true }) -> the horse:
//     object3d, pose, world (hSolveFK, the root at 0: object3d's own frame), play(name, { fade, speed,
//     loop, at, freeze }), cut(name), update(dt), clip, time, done, timeScale, contact { FL, FR, HL, HR },
//     on(event, fn) / off (events: 'footfall' (e.side = the hoof), a clip's own ('takeoff', 'land', 'kick',
//     'riderOn', 'riderOff', 'hit'), 'end'), teleported(), socket(name, out), saddle(outPos, outQuat),
//     rein(outPos), stirrup(side, outPos), pins (the hoof pin's state)
// Pure apart from reading object3d (no THREE import). Per-frame code allocates nothing and never throws.
import { HJ, HJI, LEGS, hRestOffsets, hCreatePose, hCreateWorld, hSolveFK } from './hskeleton.js';
import { HORSE } from './hdims.js';
import { HOOVES, sampleHorseClip, frameIn, rootDelta, contactWeight } from './hclip.js';
import { solveLeg, writeLeg, readLeg, toLegPlane } from './hlegs.js';
import { qslerp, smooth01, fin } from '../qmath.js';

const EV_MAX = 32;

function crossed(f, u0, u1, n, loop, first) {
  if (!loop) return (f >= u0 && f < u1) || (u1 >= n - 1 && f === n - 1 && f >= u0) || (first && f === u0);
  const x = f + Math.ceil((u0 - f) / n) * n;
  return x >= u0 && x < u1;
}

/** The layered clip player on the horse's skeleton (engine.js createClipPlayer, without the overlay). */
export function createHorsePlayer(lib, { warn = (m) => console.warn(m) } = {}) {
  const pose = hCreatePose(), A = hCreatePose(), B = hCreatePose();
  const frozen = { q: new Float32Array(HJ * 4), hips: new Float32Array(3), c: { FL: 0, FR: 0, HL: 0, HR: 0 } };
  const layer = () => ({ clip: null, u: 0, speed: 1, loop: false, done: false, started: false });
  const cur = layer(), prev = layer();
  const dA = new Float64Array(3), dB = new Float64Array(3);
  const fade = { t: 0, dur: 0, live: false, active: false };
  const warned = new Set();
  const events = Array.from({ length: EV_MAX }, () => ({ name: '', clip: '', f: 0, side: '' }));
  let evN = 0;
  const P = {
    lib, pose,
    rootDelta: { dx: 0, dz: 0, dyaw: 0 },
    contact: { FL: 0, FR: 0, HL: 0, HR: 0 },
    fadeSerial: 0,
    timeScale: 1,
    events,
    get eventCount() {
      return evN;
    },
    get clip() {
      return cur.clip;
    },
    get time() {
      return cur.clip ? frameIn(cur.clip, cur.u, cur.loop) / cur.clip.fps : 0;
    },
    get done() {
      return !cur.clip || cur.done;
    },
    play(name, opts = {}) {
      const c = lib?.get?.(name);
      if (!c) {
        if (!warned.has(name)) {
          warned.add(name);
          warn(`[horse] no clip '${name}': holding the pose`);
        }
        return false;
      }
      const f = fin(opts.fade, 0.25);
      if (f > 0 && (cur.clip || fade.active)) {
        if (fade.active || opts.freeze || !cur.clip) {
          frozen.q.set(pose.q);
          frozen.hips.set(pose.hips);
          for (const h of HOOVES) frozen.c[h] = P.contact[h];
          fade.live = false;
        } else {
          Object.assign(prev, cur);
          fade.live = true;
        }
        fade.t = 0;
        fade.dur = f;
        fade.active = true;
      } else fade.active = false;
      cur.clip = c;
      cur.speed = fin(opts.speed, 1);
      cur.loop = opts.loop ?? c.loop;
      cur.u = Math.max(0, fin(opts.at, 0)) * c.fps;
      if (!cur.loop) cur.u = Math.min(cur.u, c.n - 1);
      cur.done = false;
      cur.started = true;
      P.fadeSerial++;
      return true;
    },
    update(dt) {
      dt = fin(dt, 0);
      if (dt < 0) dt = 0;
      evN = 0;
      const k = dt * fin(P.timeScale, 1);
      const rd = P.rootDelta;
      rd.dx = rd.dz = rd.dyaw = 0;
      if (!cur.clip) return;
      advance(cur, k, dA, true);
      sampleHorseClip(cur.clip, frameIn(cur.clip, cur.u, cur.loop), A, cur.loop);
      let mx = dA[0], mz = dA[1], my = dA[2];
      const uA = frameIn(cur.clip, cur.u, cur.loop);
      if (fade.active) {
        fade.t += k;
        const w = fade.dur > 0 ? smooth01(fade.t / fade.dur) : 1;
        let bq, bh;
        if (fade.live && prev.clip) {
          advance(prev, k, dB, false);
          sampleHorseClip(prev.clip, frameIn(prev.clip, prev.u, prev.loop), B, prev.loop);
          bq = B.q;
          bh = B.hips;
        } else {
          dB[0] = dB[1] = dB[2] = 0;
          bq = frozen.q;
          bh = frozen.hips;
        }
        for (let j = 0; j < HJ; j++) qslerp(pose.q, j * 4, bq, j * 4, A.q, j * 4, w);
        for (let i = 0; i < 3; i++) pose.hips[i] = bh[i] + (A.hips[i] - bh[i]) * w;
        mx = dB[0] + (dA[0] - dB[0]) * w;
        mz = dB[1] + (dA[1] - dB[1]) * w;
        my = dB[2] + (dA[2] - dB[2]) * w;
        const uB = fade.live && prev.clip ? frameIn(prev.clip, prev.u, prev.loop) : 0;
        for (const h of HOOVES) {
          const a = contactWeight(cur.clip, h, uA, cur.loop);
          const b = fade.live && prev.clip ? contactWeight(prev.clip, h, uB, prev.loop) : frozen.c[h];
          P.contact[h] = b + (a - b) * w;
        }
        if (fade.t >= fade.dur) {
          fade.active = false;
          prev.clip = null;
        }
      } else {
        pose.q.set(A.q);
        pose.hips.set(A.hips);
        for (const h of HOOVES) P.contact[h] = contactWeight(cur.clip, h, uA, cur.loop);
      }
      rd.dx = mx;
      rd.dz = mz;
      rd.dyaw = my;
    },
    stop() {
      cur.clip = prev.clip = null;
      fade.active = false;
    },
  };

  function advance(L, k, d, emit) {
    const c = L.clip, n = c.n, u0 = L.u;
    let u1 = u0 + k * L.speed * c.fps;
    if (!L.loop) {
      if (u1 >= n - 1) {
        u1 = n - 1;
        if (!L.done && emit) push('end', c.name, n - 1, '');
        L.done = true;
      }
    }
    rootDelta(c, u0, u1, d, L.loop);
    if (emit && (u1 > u0 || L.started)) {
      const v1 = u1 > u0 ? u1 : u0 + 1e-6;
      for (const e of c.events) if (crossed(e.f, u0, v1, n, L.loop, L.started)) push(e.name, c.name, e.f, '');
      for (const h of HOOVES)
        for (const s of c.contact[h]) {
          if (!L.loop && s[0] <= 0) continue;
          if (crossed(s[0], u0, v1, n, L.loop, L.started)) push('footfall', c.name, s[0], h);
        }
      L.started = false;
    }
    if (L.loop) {
      u1 %= n;
      if (u1 < 0) u1 += n;
    }
    L.u = u1;
  }
  function push(name, clip, f, side) {
    if (evN >= EV_MAX) return;
    const e = events[evN++];
    e.name = name;
    e.clip = clip;
    e.f = f;
    e.side = side;
  }
  return P;
}

// ------------------------------------------------------------------ the hoof pin
/** s: a released hoof's correction fades over this, in the air */
export const HOOF_CARRY_S = 0.08;

function createPins() {
  const one = () => ({ pinned: false, x: 0, y: 0, z: 0, ox: 0, oy: 0, oz: 0, k: 0 });
  return { FL: one(), FR: one(), HL: one(), HR: one(), enabled: true, maxCorrect: 0, serial: -1 };
}

const _pl = new Float64Array(3), _ang = new Float64Array(5);

/**
 * Hold every planted hoof on the ground point where it landed while object3d moves (the game's own
 * movement, a blend between clips): the hoof's leg is solved again in its plane to the anchor. A hoof
 * landing anchors where it is drawn; a released one lets its correction go in the air.
 */
function pinHooves(pins, pl, pose, world, rest, place, dt) {
  if (!pins.enabled) return;
  const c = Math.cos(place.yaw), s = Math.sin(place.yaw), sc = place.s > 0 ? place.s : 1;
  const decay = dt > 0 ? Math.exp(-dt / HOOF_CARRY_S) : 1;
  let changed = false;
  pins.maxCorrect = 0;
  // a new clip: the anchors stay (the hooves are where they are); a planted hoof of the new clip lands anew
  pins.serial = pl.fadeSerial;
  for (let i = 0; i < 4; i++) {
    const leg = LEGS[i], F = pins[leg.key], w = pl.contact[leg.key];
    const h = leg.j[4] * 3;
    const lx = world.p[h], ly = world.p[h + 1], lz = world.p[h + 2];
    let tx, ty, tz;
    if (w > 0.01) {
      if (!F.pinned) {
        F.pinned = true;
        // land where it is drawn (with the correction it still carries), on the ground
        const ax = lx + F.ox, az = lz + F.oz;
        F.x = place.x + (c * ax + s * az) * sc;
        F.z = place.z + (-s * ax + c * az) * sc;
        F.y = 0;
      }
      const dx = (F.x - place.x) / sc, dz = (F.z - place.z) / sc;
      const ax = c * dx - s * dz, az = s * dx + c * dz, ay = 0;
      const k = Math.min(1, w);
      tx = lx + (ax - lx) * k;
      ty = ly + (ay - ly) * k;
      tz = lz + (az - lz) * k;
      F.ox = tx - lx;
      F.oy = ty - ly;
      F.oz = tz - lz;
    } else {
      F.pinned = false;
      F.ox *= decay;
      F.oy *= decay;
      F.oz *= decay;
      tx = lx + F.ox;
      ty = ly + F.oy;
      tz = lz + F.oz;
    }
    if (ty < 0) ty = 0;
    const moved = Math.hypot(tx - lx, ty - ly, tz - lz);
    if (moved > 1e-4) {
      if (moved > pins.maxCorrect) pins.maxCorrect = moved;
      // solve the leg to the target in its plane, keeping the pose's own folds
      const ah = readLeg(pose.q, leg, _ang, 0);
      const fold = leg.fore ? _ang[1] - _ang[2] : _ang[2];
      const ap = _ang[3];
      toLegPlane(world, leg, tx, ty, tz, _pl);
      const t = leg.j[0] * 3;
      solveLeg(leg, rest[t], rest[t + 1], rest[t + 2], _pl[2], _pl[1], _pl[0], ap, fold, _ang, 0);
      writeLeg(pose.q, leg, _ang, 0, ah);
      changed = true;
    }
  }
  if (changed) hSolveFK(pose, rest, world);
}

// ------------------------------------------------------------------ the animator
export function createHorse(game, { body = null, library = null, applyRoot = true } = {}) {
  let warnedOnce = false;
  const warn = (m) => {
    if (warnedOnce) return;
    warnedOnce = true;
    console.warn(m);
  };
  const player = createHorsePlayer(library, { warn: (m) => console.warn(m) });
  const rest = hRestOffsets(HORSE);
  const world = hCreateWorld();
  const pins = createPins();
  const listeners = new Map();
  const place = { x: 0, z: 0, yaw: 0, s: 1 };
  const obj = body?.object3d ?? null;
  hSolveFK(player.pose, rest, world);

  const emit = (e) => {
    for (const key of [e.name, '*']) {
      const list = listeners.get(key);
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        try {
          list[i](e.name, e);
        } catch (err) {
          warn(`[horse] an '${e.name}' listener failed: ${err?.message ?? err}`);
        }
      }
    }
  };

  const Hs = {
    object3d: obj, body, player, pose: player.pose, world, rest, pins, applyRoot,
    get rootDelta() {
      return player.rootDelta;
    },
    get contact() {
      return player.contact;
    },
    get clip() {
      return player.clip;
    },
    get time() {
      return player.time;
    },
    get done() {
      return player.done;
    },
    get timeScale() {
      return player.timeScale;
    },
    set timeScale(v) {
      player.timeScale = fin(v, 1);
    },
    play: (name, opts) => player.play(name, opts),
    cut: (name, opts) => player.play(name, { ...opts, fade: 0 }),
    on(name, fn) {
      if (typeof fn !== 'function') return Hs;
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return Hs;
    },
    off(name, fn) {
      const l = listeners.get(name);
      const i = l ? l.indexOf(fn) : -1;
      if (i >= 0) l.splice(i, 1);
      return Hs;
    },
    /** The body was moved by hand: forget the planted hooves and the hair's velocities. */
    teleported() {
      for (const h of HOOVES) {
        const F = pins[h];
        F.pinned = false;
        F.ox = F.oy = F.oz = 0;
      }
      try {
        body?.reset?.();
      } catch {
        /* a body without reset */
      }
    },
    update(dt) {
      dt = fin(dt, 0);
      try {
        player.update(dt);
        const rd = player.rootDelta;
        if (obj) {
          if (Hs.applyRoot) {
            const y = fin(obj.rotation.y), c = Math.cos(y), s = Math.sin(y), sc = fin(obj.scale?.x, 1) || 1;
            obj.position.x += (c * rd.dx + s * rd.dz) * sc;
            obj.position.z += (-s * rd.dx + c * rd.dz) * sc;
            obj.rotation.y = y + rd.dyaw;
          }
          place.x = fin(obj.position.x);
          place.z = fin(obj.position.z);
          place.yaw = fin(obj.rotation.y);
          place.s = fin(obj.scale?.x, 1) || 1;
        }
        hSolveFK(player.pose, rest, world);
        pinHooves(pins, player, player.pose, world, rest, place, dt);
        for (let i = 0; i < player.eventCount; i++) emit(player.events[i]);
        body?.update?.(world, dt);
      } catch (err) {
        warn(`[horse] update failed: ${err?.message ?? err}`);
      }
    },
    /** Joint `name` (or index) in the WORLD: out = { p: [x, y, z], r: [x, y, z, w] }. */
    socket(name, out) {
      const j = typeof name === 'number' ? name : HJI[name] ?? HJI.saddle;
      toWorld(world.p[j * 3], world.p[j * 3 + 1], world.p[j * 3 + 2], out.p);
      const h = place.yaw * 0.5, sy = Math.sin(h), cw = Math.cos(h);
      const r = world.r, a = j * 4, x = r[a], yy = r[a + 1], z = r[a + 2], w = r[a + 3];
      out.r[0] = cw * x + sy * z;
      out.r[1] = cw * yy + sy * w;
      out.r[2] = cw * z - sy * x;
      out.r[3] = cw * w - sy * yy;
      return out;
    },
    /**
     * Where the rider's hips go, in the world, this step (after update): outPos ({x, y, z} or [x, y, z])
     * and outQuat ({x, y, z, w} or [x, y, z, w]; optional): the saddle's axes, +Z the horse's front.
     */
    saddle(outPos, outQuat) {
      return sock(HJI.saddle, outPos, outQuat);
    },
    /** Where the rider's hands hold the reins (world). */
    rein(outPos, outQuat) {
      return sock(HJI.rein, outPos, outQuat);
    },
    /** A stirrup's tread, side 'L' | 'R' (the rider's ankles; world). */
    stirrup(side, outPos, outQuat) {
      return sock(side === 'R' ? HJI.stirrupR : HJI.stirrupL, outPos, outQuat);
    },
  };

  const _s = { p: new Float64Array(3), r: new Float64Array(4) };
  function sock(j, outPos, outQuat) {
    Hs.socket(j, _s);
    if (outPos) {
      if (!Array.isArray(outPos) && !ArrayBuffer.isView(outPos)) {
        outPos.x = _s.p[0];
        outPos.y = _s.p[1];
        outPos.z = _s.p[2];
      } else {
        outPos[0] = _s.p[0];
        outPos[1] = _s.p[1];
        outPos[2] = _s.p[2];
      }
    }
    if (outQuat) {
      if (outQuat.isQuaternion) outQuat.set(_s.r[0], _s.r[1], _s.r[2], _s.r[3]);
      else if (!Array.isArray(outQuat) && !ArrayBuffer.isView(outQuat)) {
        outQuat.x = _s.r[0];
        outQuat.y = _s.r[1];
        outQuat.z = _s.r[2];
        outQuat.w = _s.r[3];
      } else for (let i = 0; i < 4; i++) outQuat[i] = _s.r[i];
    }
    return outPos;
  }
  function toWorld(x, y, z, out) {
    const c = Math.cos(place.yaw), s = Math.sin(place.yaw), sc = place.s;
    const oy = obj ? fin(obj.position.y) : 0;
    out[0] = place.x + (c * x + s * z) * sc;
    out[1] = oy + y * sc;
    out[2] = place.z + (-s * x + c * z) * sc;
  }
  return Hs;
}
