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
  // drive(): two clips mixed by a weight the caller sets every step (a gait blend), both on the
  // caller's clock; transition(): a fade from the pose as drawn now, over whatever plays next
  const mix = { on: false, w: 0 };
  const outer = { active: false, t: 0, dur: 0, q: new Float32Array(J * 4), hips: new Float32Array(3), cL: 0, cR: 0 };
  const overlay = { mask: new Float32Array(J), w: 0, target: 0, rate: 0, out: 0 };
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
      mix.on = false;
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
    /**
     * Mix two clips on the caller's clock (a gait blend): clip a at frame position ua, clip b at ub
     * (frames; a loop's may run on past n), weight w of b. Each step's call sets the next times; the
     * events and footfalls are b's. Returns false when b is missing (a missing a: b alone).
     */
    drive(a, ua, b, ub, w) {
      const cb = lib?.get?.(b);
      if (!cb) {
        if (!warned.has(b)) {
          warned.add(b);
          warn(`[hero2] no clip '${b}': holding the pose`);
        }
        return false;
      }
      const ca = lib?.get?.(a) ?? cb;
      if (!mix.on || cur.clip !== cb) {
        cur.clip = cb;
        cur.loop = cb.loop;
        cur.u = fin(ub, 0);
        cur.done = false;
        cur.started = true;
      }
      if (!mix.on || prev.clip !== ca) {
        prev.clip = ca;
        prev.loop = ca.loop;
        prev.u = fin(ua, 0);
        prev.done = false;
      }
      cur.manual = prev.manual = true;
      cur.target = fin(ub, cur.u);
      prev.target = fin(ua, prev.u);
      mix.on = true;
      mix.w = Math.max(0, Math.min(1, fin(w, 1)));
      fade.active = false;
      return true;
    },
    /** From the pose as it is drawn now, fade over `dur` s into whatever plays next (a state change). */
    transition(dur = 0.15) {
      dur = fin(dur, 0);
      if (dur <= 0) {
        outer.active = false;
        return;
      }
      outer.q.set(pose.q);
      outer.hips.set(pose.hips);
      outer.cL = P.contact.L;
      outer.cR = P.contact.R;
      outer.t = 0;
      outer.dur = dur;
      outer.active = true;
      P.fadeSerial++;
      P.fadeLive = false;
    },
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
    /** The overlay's clip (decoded) while it shows, else null. */
    get overlayClip() {
      return over.clip && overlay.w > 0 ? over.clip : null;
    },
    /** The overlay's weight now (0..1). */
    get overlayWeight() {
      return overlay.w;
    },
    /** The overlay's time (s). */
    get overlayTime() {
      return over.clip ? frameIn(over.clip, over.u, over.loop) / over.clip.fps : 0;
    },
    /** Put the overlay on the caller's clock (its time set each step, s); null: back to its own speed. */
    layerTime(t) {
      if (!over.clip) return;
      if (t == null) {
        over.manual = false;
        over.target = null;
        return;
      }
      over.target = Math.max(0, fin(t, 0)) * over.clip.fps;
      over.manual = true;
    },
    /** Overlay a clip on some joints (mask: 'upper' | 'arms' | 'legs' | names): weight 0..1, faded in
     *  over `fade` s; `out` (s, a one-shot): it fades itself out over that when it reaches its end.
     *  name null fades the overlay out (over `fade` s). */
    layer(name, { mask = 'upper', weight = 1, fade: fd = 0.2, speed = 1, loop, at = 0, out = 0 } = {}) {
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
      over.manual = false;
      over.target = null;
      overlay.out = Math.max(0, fin(out, 0));
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
      if (mix.on) {
        driveStep(k);
        finish(k);
        return;
      }
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
      rd.dx = mx;
      rd.dz = mz;
      rd.dyaw = my;
      P.contact.L = cL;
      P.contact.R = cR;
      finish(k);
    },
    /** Reset to nothing playing (the pose kept). */
    stop() {
      cur.clip = prev.clip = over.clip = null;
      fade.active = false;
      mix.on = false;
      outer.active = false;
      overlay.w = overlay.target = 0;
    },
  };

  /** A drive() step: both clips to the caller's times, mixed. */
  function driveStep(k) {
    advance(cur, k, dA, true);
    advance(prev, k, dB, false);
    const w = mix.w, ub = frameIn(cur.clip, cur.u, cur.loop), ua = frameIn(prev.clip, prev.u, prev.loop);
    sampleClip(cur.clip, ub, A, cur.loop);
    sampleClip(prev.clip, ua, B, prev.loop);
    for (let j = 0; j < J; j++) qslerp(pose.q, j * 4, B.q, j * 4, A.q, j * 4, w);
    for (let i = 0; i < 3; i++) pose.hips[i] = B.hips[i] + (A.hips[i] - B.hips[i]) * w;
    const aL = contactWeight(prev.clip, 'L', ua, prev.loop), aR = contactWeight(prev.clip, 'R', ua, prev.loop);
    const bL = contactWeight(cur.clip, 'L', ub, cur.loop), bR = contactWeight(cur.clip, 'R', ub, cur.loop);
    P.contact.L = aL + (bL - aL) * w;
    P.contact.R = aR + (bR - aR) * w;
    const rd = P.rootDelta;
    rd.dx = dB[0] + (dA[0] - dB[0]) * w;
    rd.dz = dB[1] + (dA[1] - dB[1]) * w;
    rd.dyaw = dB[2] + (dA[2] - dB[2]) * w;
    // for the pin the mix is ONE source (its plants are phase-synced): its own pose is the mix
    A.q.set(pose.q);
    A.hips.set(pose.hips);
    P.cA.L = P.contact.L;
    P.cA.R = P.contact.R;
    P.cB.L = P.cB.R = 0;
    P.fadeW = 1;
    P.fadeLive = false;
  }

  /** After the clips: the transition fade from the drawn pose, then the overlay. */
  function finish(k) {
    if (outer.active) {
      outer.t += k;
      const w = outer.dur > 0 ? smooth01(outer.t / outer.dur) : 1;
      // the pin: the playing clips' own pose (slot A) against the pose faded from (frozen, slot B)
      A.q.set(pose.q);
      A.hips.set(pose.hips);
      P.cA.L = P.contact.L;
      P.cA.R = P.contact.R;
      P.cB.L = outer.cL;
      P.cB.R = outer.cR;
      P.fadeW = Math.min(P.fadeW, w);
      P.fadeLive = false;
      for (let j = 0; j < J; j++) qslerp(pose.q, j * 4, outer.q, j * 4, pose.q, j * 4, w);
      for (let i = 0; i < 3; i++) pose.hips[i] = outer.hips[i] + (pose.hips[i] - outer.hips[i]) * w;
      P.contact.L = outer.cL + (P.contact.L - outer.cL) * w;
      P.contact.R = outer.cR + (P.contact.R - outer.cR) * w;
      if (outer.t >= outer.dur) outer.active = false;
    }
    // the overlay, on its joints only (its root motion and contacts are not used)
    if (overlay.target !== overlay.w) {
      const st = overlay.rate * k;
      overlay.w = overlay.target > overlay.w ? Math.min(overlay.target, overlay.w + st) : Math.max(overlay.target, overlay.w - st);
    }
    if (over.clip && overlay.w > 0) {
      advance(over, k, dO, false);
      if (over.done && overlay.out > 0 && overlay.target > 0) {
        overlay.target = 0;
        overlay.rate = 1 / overlay.out;
      }
      sampleClip(over.clip, frameIn(over.clip, over.u, over.loop), O, over.loop);
      const M = overlay.mask, ow = smooth01(overlay.w);
      for (let j = 0; j < J; j++) if (M[j] > 0) qslerp(pose.q, j * 4, pose.q, j * 4, O.q, j * 4, M[j] * ow);
    } else if (overlay.w <= 0) over.clip = null;
  }

  /** Advance one layer by k s of clip time; root motion into d; events / footfalls queued when `emit`. */
  function advance(L, k, d, emit) {
    const c = L.clip, n = c.n;
    const u0 = L.u;
    let u1;
    if (L.manual && L.target != null) {
      u1 = L.target;
      L.target = null;
      // a loop driven by hand runs on through its wrap (a time set just past it is the next cycle)
      if (L.loop && u1 < u0 - n * 0.5) u1 += n * Math.ceil((u0 - u1 - n * 0.5) / n);
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
  const sheathed = { R: false, L: false };
  let lastProps = { R: undefined, L: undefined }, lastHands = { R: undefined, L: undefined };
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
      if (ok) {
        // a clip that draws the sword (a `draw` event) starts with it sheathed; one without draw or
        // sheathe events shows what its props say
        const ev = player.clip?.events ?? [];
        sheathed.R = ev.some((e) => e.name === 'draw');
        sheathed.L = ev.some((e) => e.name === 'drawL');
        syncProps();
      }
      return ok;
    },
    cut(name, opts) {
      return H.play(name, { ...opts, fade: 0 });
    },
    /** A gait blend on the caller's clock (clip.js frames): see createClipPlayer().drive. */
    drive(a, ua, b, ub, w) {
      const ok = player.drive(a, ua, b, ub, w);
      if (ok) syncProps();
      return ok;
    },
    /** Fade from the pose as drawn now into what plays next (a state change), over dur s. */
    transition: (dur) => player.transition(dur),
    /** null, or { R, L }: what the hands hold whatever the clips say (the game's hero never lets go of his sword). */
    props: null,
    /** 0..1: how much the planted feet are pinned (1: fully). */
    contactScale: 1,
    /** Optional (pose, dt) => void, called after sampling, before the forward kinematics and the pin. */
    onPose: null,
    syncProps: () => syncProps(),
    setTime: (t) => player.setTime(t),
    layer(name, opts) {
      const ok = player.layer(name, opts);
      syncProps();
      return ok;
    },
    layerTime: (t) => player.layerTime(t),
    get overlayClip() {
      return player.overlayClip;
    },
    /** The overlay's time (s) and weight (0..1). */
    get overlayTime() {
      return player.overlayTime;
    },
    get overlayWeight() {
      return player.overlayWeight;
    },
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
        // the owner's last word on the sampled pose (the adapter turns the legs to the travel there)
        if (H.onPose) H.onPose(player.pose, dt);
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
        // contactScale (0..1): how much the plants are pinned (the owner lowers it where its own movement
        // runs away from the clip's, e.g. a roll that travels four times the clip's distance)
        const cs = Math.max(0, Math.min(1, fin(H.contactScale, 1)));
        if (cs < 1) {
          player.cA.L *= cs;
          player.cA.R *= cs;
          player.cB.L *= cs;
          player.cB.R *= cs;
          player.contact.L *= cs;
          player.contact.R *= cs;
        }
        pinFeet(feet, player.pose, world, rest, player, wA, wB, place, dt, dims);
        for (let i = 0; i < player.eventCount; i++) {
          const e = player.events[i];
          // `draw` shows the right hand's prop, `sheathe` hides it (equip / unequip); `drawL` /
          // `sheatheL` the left hand's (the paired swords)
          if (e.name === 'draw') sheathed.R = false;
          else if (e.name === 'sheathe') sheathed.R = true;
          else if (e.name === 'drawL') sheathed.L = false;
          else if (e.name === 'sheatheL') sheathed.L = true;
          emit(e);
        }
        // the blade lights while it cuts (body.hot, optional): 1 from the coil to the cut's end, eased
        if (body && 'hot' in body) {
          const c = player.clip, f = c?.phases ? player.time * c.fps : -1;
          const want = c?.phases && f >= c.phases.windup && f <= c.phases.active ? 1 : 0;
          const h = fin(body.hot, 0);
          body.hot = want > h ? Math.min(1, h + dt * 30) : Math.max(0, h - dt * 4);
        }
        syncProps();
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
      const props = H.props ?? player.clip?.props;
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
  /** What a hand holds and its shape: H.props[side] when the owner fixes it (a side it leaves
   *  undefined, or no H.props: the clips'), else the overlay's clip while it shows (it says what it holds
   *  or how the hand closes), else the playing clip's. Called every step (it compares, then tells the body). */
  function clipSide(c, field, s) {
    const v = c?.[field]?.[s];
    return v === undefined ? null : v;
  }
  function syncProps() {
    const oc = player.overlayClip, cc = player.clip;
    for (let i = 0; i < 2; i++) {
      const s = i ? 'L' : 'R';
      const fixed = H.props ? H.props[s] : undefined;
      let p = fixed !== undefined ? fixed : oc && clipSide(oc, 'props', s) != null ? clipSide(oc, 'props', s) : clipSide(cc, 'props', s);
      if (sheathed[s]) p = null;
      let h = oc && clipSide(oc, 'hands', s) != null ? clipSide(oc, 'hands', s) : clipSide(cc, 'hands', s);
      if (lastProps[s] !== p && body?.setProp) {
        lastProps[s] = p;
        try {
          body.setProp(s, p);
        } catch {
          /* a body without that prop */
        }
      }
      if (lastHands[s] !== h && body?.setHand) {
        lastHands[s] = h;
        try {
          body.setHand(s, h);
        } catch {
          /* a body without hand shapes */
        }
      }
    }
  }
  return H;
}
