// The remade hero's clip engine (`?hero=new`; README.md). It plays RECORDED clips on the hero2 skeleton:
//
//   library   createLibrary(setModules): every clip set decoded once (clip.js), in the registry's order
//   player    createClipPlayer(lib): the current clip, a cross-fade from the previous one (live or a
//             frozen pose), time scale, an optional masked overlay layer; root motion as per-step
//             deltas; events and footfalls; the planted feet's contact weights
//   animator  createHero2(game, { body, library }): sample -> blend -> foot pinning -> solveFK (the
//             root at 0: whoever owns object3d moves it) -> body.update(world, dt)
//
// Pure apart from the animator's reading of object3d (no THREE import), so the headless suite runs it.
// Per-frame code allocates nothing and never throws: a missing clip holds the last pose (one warning).
import { J, JI, createPose, createWorld, restOffsets, solveFK } from './skeleton.js';
import { HDIM } from './dims.js';
import { decodeClip, sampleClip, frameIn, rootDelta, contactWeight } from './clip.js';
import { createFeet, resetFeet, pinFeet } from './feet.js';
import { fitTime } from './fit.js';
import { qslerp, qrot, smooth01, fin } from './qmath.js';

export { fitTime } from './fit.js';
export { validateClip } from './clip.js';

// ------------------------------------------------------------------ library
/**
 * Decode clip sets (each a module's default export: { set, title, clips }) in the given order.
 * Returns { sets: [{ id, title, clips }], clips: [decoded...] (the order of play), get(name), has(name),
 * problems: [{ clip, text }] }. A clip whose name is taken already is dropped (and noted).
 */
export function createLibrary(sets = []) {
  const lib = { sets: [], clips: [], byName: new Map(), problems: [] };
  for (const s of sets) {
    const mod = s?.default ?? s;
    if (!mod || !Array.isArray(mod.clips)) {
      lib.problems.push({ clip: '', text: `a set without clips (${mod?.set ?? '?'})` });
      continue;
    }
    const entry = { id: String(mod.set ?? ''), title: String(mod.title ?? mod.set ?? ''), clips: [] };
    for (const raw of mod.clips) {
      const c = decodeClip(raw, mod);
      if (lib.byName.has(c.name)) {
        lib.problems.push({ clip: c.name, text: `the name ${c.name} is taken (set ${entry.id})` });
        continue;
      }
      for (const p of c.problems) lib.problems.push({ clip: c.name, text: p });
      entry.clips.push(c);
      lib.clips.push(c);
      lib.byName.set(c.name, c);
    }
    lib.sets.push(entry);
  }
  lib.get = (name) => lib.byName.get(name) ?? null;
  lib.has = (name) => lib.byName.has(name);
  return lib;
}

// ------------------------------------------------------------------ masks
/** Joint weights for an overlay layer: 'upper' (spine half, chest up, both arms and their sockets),
 *  'arms', 'legs', or a list of joint names / indices. */
export function makeMask(spec) {
  const m = new Float32Array(J);
  const set = (j, w = 1) => {
    if (Number.isInteger(j) && j >= 0 && j < J) m[j] = w;
  };
  const upper = ['chest', 'neck', 'head', 'clavL', 'upperArmL', 'foreArmL', 'handL', 'clavR', 'upperArmR', 'foreArmR', 'handR', 'weaponR', 'weaponL'];
  if (spec === 'upper') {
    for (const n of upper) set(JI[n]);
    set(JI.spine, 0.5);
  } else if (spec === 'arms') {
    for (const n of upper.slice(3)) set(JI[n]);
  } else if (spec === 'legs') {
    for (const n of ['thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR']) set(JI[n]);
  } else if (Array.isArray(spec)) {
    for (const j of spec) set(typeof j === 'string' ? JI[j] : j);
  } else if (spec instanceof Float32Array && spec.length === J) m.set(spec);
  return m;
}

// ------------------------------------------------------------------ the clip player
const EV_MAX = 32;

/** Does frame f (in [0, n)) fall in [u0, u1) (u unwrapped for a loop)? A one-shot's last frame counts
 *  once it is reached; `first`: the clip's first step, which includes its start frame. */
function crossed(f, u0, u1, n, loop, first) {
  if (!loop) return (f >= u0 && f < u1) || (u1 >= n - 1 && f === n - 1 && f >= u0) || (first && f === u0);
  const x = f + Math.ceil((u0 - f) / n) * n;
  return x >= u0 && x < u1;
}

function layer() {
  return { clip: null, u: 0, speed: 1, loop: false, done: false, manual: false };
}

/**
 * The layered clip player. Pure: it writes `pose` (q, hips; root stays 0), `rootDelta` (this step's
 * root motion in his own frame: dx, dz, dyaw), `contact` ({ L, R } weights 0..1) and queues events.
 */
export function createClipPlayer(lib, { dims = HDIM, warn = (m) => console.warn(m) } = {}) {
  const pose = createPose(dims);
  const A = createPose(dims), B = createPose(dims), O = createPose(dims); // samples: current, previous, overlay
  const frozen = { q: new Float32Array(J * 4), hips: new Float32Array(3), cL: 0, cR: 0 };
  const cur = layer(), prev = layer(), over = layer();
  const dA = new Float64Array(3), dB = new Float64Array(3), dO = new Float64Array(3);
  const fade = { t: 0, dur: 0, live: false, active: false };
  const overlay = { mask: new Float32Array(J), w: 0, target: 0, rate: 0 };
  const warned = new Set();
  const events = Array.from({ length: EV_MAX }, () => ({ name: '', clip: '', f: 0, side: '' }));
  let evN = 0;
  const P = {
    lib,
    pose,
    rootDelta: { dx: 0, dz: 0, dyaw: 0 },
    contact: { L: 0, R: 0 },
    // for the pin (feet.js): the playing clip's own contacts and those of the clip it fades from, the
    // playing clip's weight in the blend (1 without a fade), both clips' own sampled poses; fadeSerial
    // counts play() calls, fadeLive: the faded-from clip still runs (false: a frozen pose, or a cut)
    cA: { L: 0, R: 0 },
    cB: { L: 0, R: 0 },
    fadeW: 1,
    fadeSerial: 0,
    fadeLive: false,
    poseA: A,
    poseB: B,
    timeScale: 1,
    events,
    get eventCount() {
      return evN;
    },
    /** The clip playing (decoded) or null. */
    get clip() {
      return cur.clip;
    },
    /** Its time (s), wrapped for a loop. */
    get time() {
      return cur.clip ? frameIn(cur.clip, cur.u, cur.loop) / cur.clip.fps : 0;
    },
    /** A one-shot reached its end (a loop never is). */
    get done() {
      return !cur.clip || cur.done;
    },
    get fading() {
      return fade.active;
    },
    /**
     * Play clip `name`. opts: fade (s, default 0.2; 0 = cut), speed (default 1), loop (default the
     * clip's), at (start time s, default 0), freeze (true: blend from the pose as it is now, frozen,
     * instead of letting the previous clip run on), manual (true: the time is set by setTime, the
     * attack clock). Unknown name: the pose holds (one warning). Returns false then.
     */
    play(name, opts = {}) {
      const c = lib?.get?.(name);
      if (!c) {
        if (!warned.has(name)) {
          warned.add(name);
          warn(`[hero2] no clip '${name}': holding the pose`);
        }
        return false;
      }
      const f = fin(opts.fade, 0.2);
      if (f > 0 && (cur.clip || fade.active)) {
        if (fade.active || opts.freeze || !cur.clip) {
          // a fade that begins mid-fade (or asks to): from the pose as it is now, held
          frozen.q.set(pose.q);
          frozen.hips.set(pose.hips);
          frozen.cL = P.contact.L;
          frozen.cR = P.contact.R;
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
      cur.manual = !!opts.manual;
      cur.started = true;
      P.fadeSerial++;
      P.fadeLive = fade.active && fade.live;
      return true;
    },
    /** Cut to a clip at once (no fade). */
    cut(name, opts = {}) {
      return P.play(name, { ...opts, fade: 0 });
    },
    /** Set the current clip's time (s) directly (an attack clip on the game's clock: fitTime). The step
     *  from the last time to this one is what update() reports (root motion, events). */
    setTime(t) {
      if (!cur.clip) return;
      cur.target = Math.max(0, fin(t, 0)) * cur.clip.fps;
      cur.manual = true;
    },
    /** Overlay a clip on some joints (mask: 'upper' | 'arms' | 'legs' | names): weight 0..1, faded in
     *  over `fade` s. name null fades the overlay out. */
    layer(name, { mask = 'upper', weight = 1, fade: fd = 0.2, speed = 1, loop, at = 0 } = {}) {
      if (name == null) {
        overlay.target = 0;
        overlay.rate = fd > 0 ? 1 / fd : 1e9;
        return true;
      }
      const c = lib?.get?.(name);
      if (!c) {
        if (!warned.has(name)) {
          warned.add(name);
          warn(`[hero2] no clip '${name}' for the overlay`);
        }
        return false;
      }
      over.clip = c;
      over.speed = speed;
      over.loop = loop ?? c.loop;
      over.u = at * c.fps;
      over.done = false;
      overlay.mask = makeMask(mask);
      overlay.target = Math.max(0, Math.min(1, weight));
      overlay.rate = fd > 0 ? 1 / fd : 1e9;
      return true;
    },
    /** Advance by dt game seconds and write the pose. */
    update(dt) {
      dt = fin(dt, 0);
      if (dt < 0) dt = 0;
      evN = 0;
      const k = dt * fin(P.timeScale, 1);
      const rd = P.rootDelta;
      rd.dx = rd.dz = rd.dyaw = 0;
      if (!cur.clip) return; // nothing played yet: the pose holds (rest at first)
      // the current clip
      advance(cur, k, dA, true);
      sampleClip(cur.clip, frameIn(cur.clip, cur.u, cur.loop), A, cur.loop);
      let cL = contactWeight(cur.clip, 'L', frameIn(cur.clip, cur.u, cur.loop), cur.loop);
      let cR = contactWeight(cur.clip, 'R', frameIn(cur.clip, cur.u, cur.loop), cur.loop);
      let mx = dA[0], mz = dA[1], my = dA[2];
      P.cA.L = cL;
      P.cA.R = cR;
      P.cB.L = P.cB.R = 0;
      P.fadeW = 1;
      if (fade.active) {
        fade.t += k;
        const w = fade.dur > 0 ? smooth01(fade.t / fade.dur) : 1;
        let bq, bh, bL, bR;
        if (fade.live && prev.clip) {
          advance(prev, k, dB, false);
          sampleClip(prev.clip, frameIn(prev.clip, prev.u, prev.loop), B, prev.loop);
          bq = B.q;
          bh = B.hips;
          bL = contactWeight(prev.clip, 'L', frameIn(prev.clip, prev.u, prev.loop), prev.loop);
          bR = contactWeight(prev.clip, 'R', frameIn(prev.clip, prev.u, prev.loop), prev.loop);
        } else {
          dB[0] = dB[1] = dB[2] = 0;
          bq = frozen.q;
          bh = frozen.hips;
          bL = frozen.cL;
          bR = frozen.cR;
        }
        for (let j = 0; j < J; j++) qslerp(pose.q, j * 4, bq, j * 4, A.q, j * 4, w);
        for (let i = 0; i < 3; i++) pose.hips[i] = bh[i] + (A.hips[i] - bh[i]) * w;
        P.cB.L = bL;
        P.cB.R = bR;
        P.fadeW = w;
        mx = dB[0] + (dA[0] - dB[0]) * w;
        mz = dB[1] + (dA[1] - dB[1]) * w;
        my = dB[2] + (dA[2] - dB[2]) * w;
        cL = bL + (cL - bL) * w;
        cR = bR + (cR - bR) * w;
        if (fade.t >= fade.dur) {
          fade.active = false;
          prev.clip = null;
          P.fadeLive = false;
        }
      } else {
        pose.q.set(A.q);
        pose.hips.set(A.hips);
      }
      // the overlay, on its joints only (its root motion and contacts are not used)
      if (overlay.target !== overlay.w) {
        const st = overlay.rate * k;
        overlay.w = overlay.target > overlay.w ? Math.min(overlay.target, overlay.w + st) : Math.max(overlay.target, overlay.w - st);
      }
      if (over.clip && overlay.w > 0) {
        advance(over, k, dO, false);
        sampleClip(over.clip, frameIn(over.clip, over.u, over.loop), O, over.loop);
        const M = overlay.mask, ow = smooth01(overlay.w);
        for (let j = 0; j < J; j++) if (M[j] > 0) qslerp(pose.q, j * 4, pose.q, j * 4, O.q, j * 4, M[j] * ow);
      } else if (overlay.w <= 0) over.clip = null;
      rd.dx = mx;
      rd.dz = mz;
      rd.dyaw = my;
      P.contact.L = cL;
      P.contact.R = cR;
    },
    /** Reset to nothing playing (the pose kept). */
    stop() {
      cur.clip = prev.clip = over.clip = null;
      fade.active = false;
      overlay.w = overlay.target = 0;
    },
  };

  /** Advance one layer by k s of clip time; root motion into d; events / footfalls queued when `emit`. */
  function advance(L, k, d, emit) {
    const c = L.clip, n = c.n;
    const u0 = L.u;
    let u1;
    if (L.manual && L.target != null) {
      u1 = L.target;
      L.target = null;
    } else if (L.manual) u1 = u0;
    else u1 = u0 + k * L.speed * c.fps;
    if (!L.loop) {
      if (u1 >= n - 1) {
        u1 = n - 1;
        if (!L.done && emit) push('end', c.name, n - 1, '');
        L.done = true;
      } else if (u1 < 0) u1 = 0;
      else L.done = false;
    }
    rootDelta(c, u0, u1, d, L.loop);
    if (emit && u1 !== u0) {
      crossings(c, u0, u1, L.loop, L.started);
      L.started = false;
    } else if (emit && L.started && u1 === u0) {
      crossings(c, u0, u0 + 1e-6, L.loop, true);
      L.started = false;
    }
    if (L.loop) {
      // keep u in [0, n) (the delta was taken unwrapped)
      u1 %= n;
      if (u1 < 0) u1 += n;
    }
    L.u = u1;
  }

  /** Events and footfalls (a contact span's first frame) in [u0, u1) (u unwrapped for a loop; a
   *  one-shot's last frame counts when it is reached). Backward time reports nothing. */
  function crossings(c, u0, u1, loop, first) {
    if (u1 <= u0) return;
    const n = c.n;
    for (let i = 0; i < c.events.length; i++) {
      const e = c.events[i];
      if (crossed(e.f, u0, u1, n, loop, first)) push(e.name, c.name, e.f, '');
    }
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? 'L' : 'R', spans = c.contact[side];
      for (let i = 0; i < spans.length; i++) {
        const a = spans[i][0];
        // a span already down at a one-shot's first frame is no footfall
        if (!loop && a <= 0) continue;
        if (crossed(a, u0, u1, n, loop, first)) push('footfall', c.name, a, side);
      }
    }
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

// ------------------------------------------------------------------ the animator
/**
 * The remade hero's animator. `body`: body.js's interface (buildBody), or debugBody.js's. `library`:
 * createLibrary(...) (clips/index.js loadLibrary()). applyRoot (default true): the clip's root motion
 * moves object3d itself; false: the owner moves object3d (the game's own movement) and reads rootDelta.
 *
 * Returns { object3d, pose, world, play(name, opts), cut, setTime, layer, update(dt), rootDelta, clip,
 *           time, done, on(event, fn), off, body, feet, contact, teleported(), socket(side, out),
 *           bladeSegment(side, a, b) }
 */
export function createHero2(game, { body, library, dims = HDIM, applyRoot = true } = {}) {
  // (a failing update or listener warns once: per-frame code must not flood the console)
  let warnedOnce = false;
  const warn = (m) => {
    if (warnedOnce) return;
    warnedOnce = true;
    console.warn(m);
  };
  // (a missing clip warns once per name: the player's own list)
  const player = createClipPlayer(library, { dims, warn: (m) => console.warn(m) });
  const rest = restOffsets(dims);
  const world = createWorld(), worldA = createWorld(), worldB = createWorld();
  const feet = createFeet();
  const listeners = new Map();
  const place = { x: 0, z: 0, yaw: 0, s: 1 };
  const obj = body?.object3d ?? null;
  let lastProps = { R: undefined, L: undefined };
  solveFK(player.pose, rest, world);

  const fire = (list, e) => {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](e.name, e);
      } catch (err) {
        warn(`[hero2] an '${e.name}' listener failed: ${err?.message ?? err}`);
      }
    }
  };
  const emit = (e) => {
    fire(listeners.get(e.name), e);
    fire(listeners.get('*'), e);
  };

  const H = {
    object3d: obj,
    body,
    player,
    pose: player.pose,
    world,
    rest,
    feet,
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
    applyRoot,
    play(name, opts) {
      const ok = player.play(name, opts);
      if (ok) syncProps();
      return ok;
    },
    cut(name, opts) {
      return H.play(name, { ...opts, fade: 0 });
    },
    setTime: (t) => player.setTime(t),
    layer: (name, opts) => player.layer(name, opts),
    /** fitTime for the current clip: H.setTime(H.fit(gameT, { windup, active, recovery })) */
    fit(t, win, out) {
      return player.clip ? fitTime(player.clip, t, win, out) : 0;
    },
    on(name, fn) {
      if (typeof fn !== 'function') return H;
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return H;
    },
    off(name, fn) {
      const l = listeners.get(name);
      if (l) {
        const i = l.indexOf(fn);
        if (i >= 0) l.splice(i, 1);
      }
      return H;
    },
    /** The body was moved by hand: forget the planted feet and the cloth's velocities. */
    teleported() {
      resetFeet(feet);
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
          if (H.applyRoot) {
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
        solveFK(player.pose, rest, world);
        // in a fade each clip anchors its own plants where its own ankle is: their own poses' FK
        let wA = null, wB = null;
        if (player.fadeW < 1) {
          solveFK(player.poseA, rest, worldA);
          wA = worldA;
          if (player.fadeLive) {
            solveFK(player.poseB, rest, worldB);
            wB = worldB;
          }
        }
        pinFeet(feet, player.pose, world, rest, player, wA, wB, place, dt, dims);
        for (let i = 0; i < player.eventCount; i++) emit(player.events[i]);
        body?.update?.(world, dt);
      } catch (err) {
        warn(`[hero2] update failed: ${err?.message ?? err}`);
      }
    },
    /** A socket's (or any joint's) placement in the WORLD: out = { p: [x, y, z], r: [x, y, z, w] }. */
    socket(side, out) {
      const j = typeof side === 'number' ? side : side === 'L' ? JI.weaponL : JI.weaponR;
      toWorld(world.p[j * 3], world.p[j * 3 + 1], world.p[j * 3 + 2], out.p);
      const h = place.yaw * 0.5, sy = Math.sin(h), cw = Math.cos(h);
      const r = world.r, a = j * 4, x = r[a], yy = r[a + 1], z = r[a + 2], w = r[a + 3];
      // (yaw about +Y) * r
      out.r[0] = cw * x + sy * z;
      out.r[1] = cw * yy + sy * w;
      out.r[2] = cw * z - sy * x;
      out.r[3] = cw * w - sy * yy;
      return out;
    },
    /** The gameplay blade segment of hand `side` (dims.bladeBase .. bladeTip along the socket's +Z) in
     *  WORLD space into a / b ({ x, y, z }). False when that hand holds no sword. */
    bladeSegment(side, a, b) {
      const props = player.clip?.props;
      if (!props || props[side] !== 'sword') return false;
      const j = side === 'L' ? JI.weaponL : JI.weaponR;
      qrot(_bv, 0, world.r, j * 4, 0, 0, dims.bladeBase);
      qrot(_bv, 3, world.r, j * 4, 0, 0, dims.bladeTip);
      const px = world.p[j * 3], py = world.p[j * 3 + 1], pz = world.p[j * 3 + 2];
      toWorld(px + _bv[0], py + _bv[1], pz + _bv[2], _bw);
      a.x = _bw[0];
      a.y = _bw[1];
      a.z = _bw[2];
      toWorld(px + _bv[3], py + _bv[4], pz + _bv[5], _bw);
      b.x = _bw[0];
      b.y = _bw[1];
      b.z = _bw[2];
      return true;
    },
  };

  const _bv = new Float64Array(6), _bw = new Float64Array(3);
  function toWorld(x, y, z, out) {
    const c = Math.cos(place.yaw), s = Math.sin(place.yaw), sc = place.s;
    const oy = obj ? fin(obj.position.y) : 0;
    out[0] = place.x + (c * x + s * z) * sc;
    out[1] = oy + y * sc;
    out[2] = place.z + (-s * x + c * z) * sc;
  }
  function syncProps() {
    const p = player.clip?.props;
    if (!p || !body?.setProp) return;
    for (const s of ['R', 'L']) {
      if (lastProps[s] !== p[s]) {
        lastProps[s] = p[s];
        try {
          body.setProp(s, p[s]);
        } catch {
          /* a body without that prop */
        }
      }
    }
  }
  return H;
}
