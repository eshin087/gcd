// Bai Wuji's effects driven alone (the FX AGENT's file), before the moves exist: the Lab and the film
// rig call `dragon.debug.fx(name, opts)`, which calls `run(d, name, opts)` here (untouched.js); WjFx.update
// then steps the timeline every frame (`step`, real time) until it ends. `d` is the boss (d.fx the WjFx).
// Each driver calls the WjFx methods with the arguments of the contract (fx.js header), as a move will:
// every frame for the held ones, once for the others. Nothing here deals damage or breaks the world; the
// barrier's drivers use the real rule (d.barrier.crack / open / close), so its state is the real one.
//
//   name        what it plays (s)                                            opts
//   'stop'      three blades stopped on the shell, the last heavy (1.2)      -
//   'crack'     a crack every 0.7 s until it opens (the rule's count)        -
//   'open' / 'close'   the barrier opens (for opts.dur s) / closes now       dur
//   'barrier'   all of it: up, a stop, two cracks, the third opens it, the window runs out, it knits
//   'near'      the shell lit as if the hero's blade came at it (2.0)       k (0..1)
//   'blink'     he blinks to the hero's side (the real blinkTo) (0.6)       -
//   'eyes'      his eyes lit, his head turned fast left and right (2.0)     -
//   'unveil'    the band's light leaking (0.6 s), the flare, then his eyes on  -
//   'spark'     Dark Spark: held on his right fist (0.9), then the hit     landed (false: a miss)
//   'ghosts'    Everywhere: three afterimages round the hero strike in turn a (the first one's angle)
//   'draw'      a knot 3 m ahead of him for 2.4 s, then its collapse        x, z, r, life
//   'cast'      a point flicked from his hand to the hero (0.5 s), the burst  x, z, r, power
//   'null'      the merge (1.6 s), held 0.3 s, the line 1.3 s, its end       len, w
//   'sign'      the hand sign (1.0)                                         -
//   'wall'      the sphere closing from the rim to the hero (2.2), the seal  r
//   'caught'    the hero held in the noise (1.0)                            -
//   'break'     the void breaks at him                                      -
//   'shove'     the hero slid 3.6 m back from him (the real slide: kb)      dist
//   'crash'     a crash burst at the hero's back                            power
//   'weight'    the camera of a blow                                        kind
//   'stopAll'   ends the timeline

import * as THREE from 'three';

const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** His facing (unit x, z), the hero's position and the way from him to the hero. */
function frame(d) {
  const p = d.game.player?.position ?? { x: d.position.x, z: d.position.z + 4 };
  const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
  let hx = p.x - d.position.x, hz = p.z - d.position.z;
  const l = Math.hypot(hx, hz) || 1;
  hx /= l;
  hz /= l;
  return { p, fx, fz, hx, hz, dist: l };
}

const DRIVERS = {
  stop: { T: 1.25, step(d, D, t) {
    const F = d.fx;
    for (const [at, heavy] of [[0.05, false], [0.45, false], [0.85, true]]) {
      if (D.prev < at && t >= at) {
        const f = frame(d), s = F._shell(d);
        const y = 1.25 + (heavy ? 0.25 : -0.1);
        F.barrierStop({ x: d.position.x - f.hx * (s.rx ?? 0.6), y, z: d.position.z - f.hz * (s.rx ?? 0.6) }, { x: f.hx, z: f.hz }, heavy);
      }
    }
  } },
  crack: { T: 2.4, step(d, D, t) {
    for (const at of [0.05, 0.75, 1.45]) if (D.prev < at && t >= at) d.barrier?.crack?.();
  } },
  open: { T: 0.1, step(d, D) {
    if (!D.done) d.barrier?.open?.('debug', fin(D.opts.dur, undefined));
    D.done = true;
  } },
  close: { T: 0.1, step(d, D) {
    if (!D.done) d.barrier?.close?.();
    D.done = true;
  } },
  barrier: { T: 9, step(d, D, t) {
    const F = d.fx, B = d.barrier;
    if (!B) return;
    if (D.prev < 0.3 && t >= 0.3) {
      const f = frame(d), s = F._shell(d);
      F.barrierStop({ x: d.position.x - f.hx * s.rx, y: 1.2, z: d.position.z - f.hz * s.rx }, { x: f.hx, z: f.hz }, false);
    }
    for (const at of [1.2, 2.0, 2.8]) if (D.prev < at && t >= at) B.crack();
    if (t > 3.0 && B.up && !D.closed) D.closed = true; // (it closed by itself on the timer)
  } },
  near: { T: 2, step(d, D, t) {
    d.fx._debugNear = clamp01(fin(D.opts.k, 1)) * Math.min(1, t / 0.4, (2 - t) / 0.4);
  }, end(d) {
    d.fx._debugNear = 0;
  } },
  blink: { T: 0.6, step(d, D, t) {
    if (D.prev < 0.1 && t >= 0.1) d.debug?.blink?.(D.opts.how ?? 'side');
  } },
  eyes: { T: 2, step(d, D, t) {
    d.eyesK = 1;
    if (D.yaw0 === undefined) D.yaw0 = d.yaw;
    d.yaw = D.yaw0 + Math.sin(t * 6) * 0.9;
    if (d.object3d) d.object3d.rotation.y = d.yaw;
  }, end(d, D) {
    if (D.yaw0 !== undefined) d.yaw = D.yaw0;
  } },
  unveil: { T: 1.4, step(d, D, t) {
    if (t < 0.62) d.fx.unveil(d, clamp01(t / 0.6));
    else d.eyesK = 1;
  } },
  spark: { T: 1.4, step(d, D, t) {
    const F = d.fx;
    if (t < 0.9) F.sparkCharge(d, clamp01(t / 0.9), 'R');
    else if (!D.done) {
      D.done = true;
      const f = frame(d), v = d.handPoint?.('R', (D.v ??= new THREE.Vector3())) ?? { x: d.position.x, y: 1.3, z: d.position.z };
      F.sparkHit(v.x + f.hx * 0.4, v.y, v.z + f.hz * 0.4, f.hx, f.hz, D.opts.landed !== false);
    }
  } },
  ghosts: { T: 2.2, step(d, D, t) {
    // three afterimages round the hero, each held 0.6 s, striking in turn (blue, blue, red in the move)
    const p = d.game.player?.position ?? d.position;
    for (let i = 0; i < 3; i++) {
      const t0 = i * 0.6, u = (t - t0) / 0.7;
      if (u < 0 || u > 1) continue;
      const a = (D.opts.a ?? 0.4) + i * 2.1, r = 2.4, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      d.fx.ghostStrike(x, z, Math.atan2(p.x - x, p.z - z), u);
    }
  } },
  draw: { T: 2.7, step(d, D, t, dt) {
    const F = d.fx, life = fin(D.opts.life, 2.4);
    if (!D.knot) {
      const f = frame(d);
      D.knot = { on: true, x: fin(D.opts.x, d.position.x + f.hx * 3), z: fin(D.opts.z, d.position.z + f.hz * 3), r: fin(D.opts.r, 7), strength: 3, falloff: 1, life, t: 0, k: 0, id: 900 + (D.n ?? 0) };
    }
    const K = D.knot;
    if (K.on) {
      K.t = Math.min(life, t);
      K.k = clamp01(K.t / life);
      F.drawKnot(K, dt);
      if (t >= life) {
        K.on = false;
        F.drawCollapse(K);
      }
    }
  } },
  cast: { T: 1.2, step(d, D, t, dt) {
    const F = d.fx, f = frame(d);
    const tx = fin(D.opts.x, f.p.x), tz = fin(D.opts.z, f.p.z);
    if (t < 0.5) {
      const h = d.handPoint?.('R', (D.v ??= new THREE.Vector3())) ?? { x: d.position.x, y: 1.4, z: d.position.z };
      const u = clamp01((t - 0.15) / 0.3), e = u * u * (3 - 2 * u);
      const P = (D.p ??= { x: 0, y: 0, z: 0, k: 0 });
      P.x = h.x + (tx - h.x) * e;
      P.y = h.y + (1.0 - h.y) * e;
      P.z = h.z + (tz - h.z) * e;
      P.k = Math.min(1, t / 0.15);
      F.castPoint(P, dt);
    } else if (!D.done) {
      D.done = true;
      F.castBurst(tx, tz, fin(D.opts.r, 4.5), fin(D.opts.power, 1.5));
    }
  } },
  null: { T: 3.6, step(d, D, t, dt) {
    void dt;
    const F = d.fx;
    if (!D.seg) {
      const f = frame(d), L = fin(D.opts.len, 44), w = fin(D.opts.w, 5);
      D.seg = { ax: d.position.x + f.hx * 0.8, az: d.position.z + f.hz * 0.8, bx: d.position.x + f.hx * L, bz: d.position.z + f.hz * L, w };
    }
    if (t < 1.9) {
      F.nullCharge(d, clamp01(t / 1.6), null, null);
      if (t > 0.5) F.nullLine(D.seg, clamp01((t - 0.5) / 1.4)); // (the line fixed 1.4 s before it fires)
    }
    if (t >= 1.9 && t < 3.2) F.nullBeam(D.seg, clamp01((t - 1.9) / 1.3));
    if (t >= 3.2 && !D.done) {
      D.done = true;
      if (D.seg) F.nullEnd(D.seg);
    }
  } },
  sign: { T: 1.0, step(d, D, t) {
    d.fx.domainSign(d, clamp01(t / 1.0));
  } },
  wall: { T: 2.6, step(d, D, t) {
    const R = fin(D.opts.r, 40);
    if (t <= 2.2) {
      const k = clamp01(t / 2.2);
      d.fx.domainWall(d.position.x, d.position.z, R * (1 - k) + 1, k);
    }
  } },
  caught: { T: 1.0, step(d, D, t) {
    d.fx.domainCaught(d.game.player, clamp01(t / 1.0));
  } },
  break: { T: 1.1, step(d, D) {
    if (!D.done) {
      const p = d.game.player?.position ?? d.position;
      d.fx.domainBreak(fin(D.opts.x, (p.x + d.position.x) / 2), fin(D.opts.z, (p.z + d.position.z) / 2));
    }
    D.done = true;
  } },
  shove: { T: 1.0, step(d, D) {
    if (D.done) return;
    D.done = true;
    const f = frame(d), dist = fin(D.opts.dist, 3.6), p = d.game.player;
    d.fx.shove(f.p.x, f.p.z, f.hx, f.hz, dist);
    if (p?.kb) {
      const decay = 6; // (player.js TUNE.knockbackDecay: a kick of v covers v / decay m)
      p.kb.x += f.hx * dist * decay;
      p.kb.z += f.hz * dist * decay;
    }
  } },
  crash: { T: 0.8, step(d, D) {
    if (D.done) return;
    D.done = true;
    const f = frame(d);
    d.fx.crash(f.p.x + f.hx * 0.6, f.p.z + f.hz * 0.6, f.hx, f.hz, fin(D.opts.power, 1.5));
  } },
  weight: { T: 0.1, step(d, D) {
    if (D.done) return;
    D.done = true;
    const f = frame(d);
    d.fx.weight(D.opts.kind ?? 'heavy', f.hx, f.hz);
  } },
};

/** Drive effect `name` (or start its timeline): returns true if this module knows the name. */
export function run(d, name, opts) {
  const F = d?.fx;
  if (!F) return false;
  if (name === 'stopAll') {
    if (F._drive) DRIVERS[F._drive.name]?.end?.(d, F._drive);
    F._drive = null;
    return true;
  }
  const Dv = DRIVERS[name];
  if (!Dv) return false;
  if (F._drive) DRIVERS[F._drive.name]?.end?.(d, F._drive);
  F._drive = { name, t: 0, prev: -1, T: Dv.T, opts: opts && typeof opts === 'object' ? opts : {}, done: false, n: (F._driveN = (F._driveN ?? 0) + 1) };
  return true;
}

/** One frame of the timeline (WjFx.update): false when it is over. */
export function step(d, D, dt) {
  const Dv = DRIVERS[D?.name];
  if (!Dv) return false;
  const t = D.t + dt;
  Dv.step(d, D, t, dt);
  D.prev = t;
  D.t = t;
  if (t >= D.T) {
    Dv.end?.(d, D);
    return false;
  }
  return true;
}

/** The names a driver knows (the Lab, the fx scenario). */
export const NAMES = Object.freeze(Object.keys(DRIVERS));
