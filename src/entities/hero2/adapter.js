// The remade hero, PLAYABLE (`?hero=new` without `show`): the gameplay adapter. It stands in for today's
// animator (player.anim) with the same surface, and plays the recorded clips on the remade hero:
//
//   - today's animator keeps running on today's rig (hidden: its meshes are not drawn), so everything
//     the player's code reads from it (noise(), kickCoat(), spell, forceVariant, the flurry's clips,
//     every joint of the rig) works as before; every other property reads through to it;
//   - the remade hero (createHero2, applyRoot false: the GAME moves him, the clips' root motion is not
//     used) stands where the player stands, facing his yaw, and plays what moves.js maps each state to;
//   - after the player's matrices are updated (player.js calls anim.afterWorld, a no-op on today's
//     animator) the remade hero's joints are put on today's rig, so the hit test (SwordSweep reads
//     rig.sword.matrixWorld, then un-leans it as before) and the effects read the REMADE hero. Mirrored:
//     the sword (and the gem, its child), the chest, the pelvis, the head, both upper arms, both legs'
//     thigh / shin / foot.
//
// Locomotion is a speed-matched blend space over idle / walk / run / sprint driven by groundVel: the
// gaits are phase-synced (each clip's right plant starts its cycle), the pair round the speed is mixed,
// and the cycle runs at the rate that makes the feet match the real ground speed. Direction is the
// second axis: until the strafe clips exist (moves.js STRAFE) the forward gait plays with the legs
// turned to the travel at the hips (the chest keeps his aim) and backward travel runs it in reverse.
import * as THREE from 'three';
import { createHero2 } from './engine.js';
import { fitTime } from './fit.js';
import { JI } from './skeleton.js';
import { qmul, qconjmul, qaxis, smooth01, fin } from './qmath.js';
import { LOCO, ATTACKS, ATTACK_DEFAULT, STATES, STATE_DEFAULT, resolveClip } from './moves.js';

const TAU = Math.PI * 2;
const wrap = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const plantStart = (c, side) => (c.contact[side]?.[0]?.[0] ?? 0) / c.n;

/** The frame from which a stop clip's own travel is (nearly) over: the settle, without the slide. */
function settleFrame(c, left = 0.1) {
  const R = c.root, ex = c.cyc[0], ez = c.cyc[1];
  for (let f = 0; f < c.n; f++) if (Math.hypot(ex - R[f * 3], ez - R[f * 3 + 1]) < left) return f;
  return 0;
}

/**
 * The adapter. `old`: today's animator (it keeps running); `body`: the remade hero's body (body.js or
 * debugBody.js), already in the scene. Returns { proxy (what player.anim becomes), hero, rewrap(old) }.
 */
export function createAdapter(game, player, old, { lib, body }) {
  const hero = createHero2(game, { body, library: lib, applyRoot: false });
  hero.props = { R: 'sword', L: null }; // the game's hero never lets go of his sword
  hero.syncProps();
  const obj = body.object3d;

  // ---- the clips (resolved once)
  const idleC = resolveClip(lib, LOCO.idle), fightC = resolveClip(lib, LOCO.fightIdle) ?? idleC;
  const gaits = LOCO.gaits
    .map((g) => resolveClip(lib, g))
    .filter(Boolean)
    .map((c) => ({ c, v: c.speed ?? Math.hypot(c.cyc[0], c.cyc[1]) / c.dur, off: plantStart(c, 'R') }))
    .filter((g) => g.v > 0.1)
    .sort((a, b) => a.v - b.v);
  const stops = {};
  for (const k of ['walk', 'run', 'sprint']) {
    const c = resolveClip(lib, LOCO.stop[k]);
    if (c) stops[k] = { c, from: settleFrame(c) };
  }

  // ---- state
  const S = {
    mode: 'loco', key: 'loco', entry: null, clip: null,
    phi: 0, vs: 0, legYaw: 0, idleU: 0, peak: 0, gait: 'walk', cs: 1, csWant: 1,
  };
  let A = null; // the proxy (set below)
  let oldAnim = old;

  const setContact = (v) => (S.csWant = Math.max(0, Math.min(1, fin(v, 1))));

  /** Enter what the player's state asks for (from play(key)). */
  function enter(key) {
    S.key = key;
    S.entry = null;
    S.clip = null;
    if (key === 'loco') {
      S.mode = 'loco';
      setContact(1);
      return;
    }
    if (key === 'attack') {
      const def = player.atk?.def;
      const e = ATTACKS[def?.name] ?? ATTACK_DEFAULT;
      const c = resolveClip(lib, e) ?? resolveClip(lib, ATTACK_DEFAULT);
      if (c) {
        S.mode = 'attack';
        S.entry = e;
        S.clip = c;
        hero.cut(c.name, { manual: true });
        setContact(e.contact ?? 1);
        return;
      }
    }
    const e = STATES[key] ?? STATE_DEFAULT;
    const c = resolveClip(lib, e) ?? resolveClip(lib, STATE_DEFAULT);
    if (!c) {
      S.mode = 'loco';
      return;
    }
    S.entry = e;
    S.clip = c;
    S.mode = e.how ?? 'loop';
    setContact(e.contact ?? 1);
    if (S.mode === 'once') hero.cut(c.name, { at: fin(e.from, 0) / c.fps, speed: fin(e.rate, 1), loop: false });
    else if (S.mode === 'loop') hero.cut(c.name, { loop: true });
    else hero.cut(c.name, { manual: true }); // roll, charge, hold: on the game's clock
  }

  // ---- locomotion
  function loco(dt) {
    const gv = player.groundVel ?? { x: 0, z: 0 };
    const v = Math.hypot(fin(gv.x), fin(gv.z));
    S.vs = damp(S.vs, v, 14, dt);
    const yaw = fin(player.yaw);
    // the direction axis: the legs turned to the travel (up to 90 degrees), backward = in reverse
    let legWant = 0, sign = 1;
    if (v > 0.3) {
      const rel = wrap(Math.atan2(gv.x, gv.z) - yaw);
      if (Math.abs(rel) > 1.75) {
        sign = -1;
        legWant = wrap(rel + Math.PI);
      } else legWant = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rel));
    }
    S.legYaw = damp(S.legYaw, legWant, 10, dt);
    S.sign = sign;
    const fight = player.lockOn || game.state === 'boss' || player.debug?.fightStance === true;
    const idle = (fight ? fightC : idleC) ?? gaits[0]?.c;
    if (!idle) return;
    S.idleU = (S.idleU + dt * idle.fps) % idle.n;
    const vs = S.vs;
    if (vs > S.peak) S.peak = vs;
    else S.peak = damp(S.peak, vs, 2.5, dt);
    // a stop: the player lets go after a run (the settle of the stop clip)
    const letGo = (player.intent?.len ?? 0) < 0.1 && S.peak > 1.5;
    if (letGo) {
      const st = stops[S.gait] ?? stops.run;
      if (st) {
        S.mode = 'stop';
        S.clip = st.c;
        S.peak = 0;
        hero.transition(0.22);
        hero.cut(st.c.name, { at: st.from / st.c.fps, loop: false });
        setContact(1);
        return;
      }
    }
    if (!gaits.length) {
      hero.drive(idle.name, S.idleU, idle.name, S.idleU, 1);
      return;
    }
    const g0 = gaits[0];
    let a, b, w, rate;
    if (vs <= g0.v) {
      // idle -> the slowest gait (the gait slowed with the speed, weighted in over its first 60 %)
      a = null;
      b = g0;
      w = smooth01(vs / (g0.v * 0.6));
      rate = vs / g0.v / g0.c.dur;
      S.gait = 'walk';
    } else {
      let i = 0;
      while (i < gaits.length - 1 && vs > gaits[i + 1].v) i++;
      if (i >= gaits.length - 1) {
        a = b = gaits[gaits.length - 1];
        w = 1;
        rate = vs / b.v / b.c.dur;
      } else {
        a = gaits[i];
        b = gaits[i + 1];
        w = (vs - a.v) / (b.v - a.v);
        const T = a.c.dur + (b.c.dur - a.c.dur) * w, vb = a.v + (b.v - a.v) * w;
        rate = vs / vb / T;
      }
      S.gait = gaits.length >= 3 ? ['walk', 'run', 'sprint'][Math.min(2, gaits.indexOf(w > 0.5 ? b : a))] : 'run';
    }
    S.phi = (((S.phi + sign * rate * dt) % 1) + 1) % 1;
    const u = (g) => ((((S.phi + g.off) % 1) + 1) % 1) * g.c.n;
    if (a) hero.drive(a.c.name, u(a), b.c.name, u(b), w);
    else hero.drive(idle.name, S.idleU, b.c.name, u(b), w);
  }

  // ---- the legs turned to the travel (onPose): the hips turn, the spine turns back
  const T = new Float64Array(12);
  hero.onPose = (pose) => {
    const a = S.mode === 'loco' ? S.legYaw : 0;
    if (Math.abs(a) < 1e-3) return;
    const q = pose.q, hi = JI.hips * 4, si = JI.spine * 4;
    qaxis(T, 0, 0, 1, 0, a);
    qmul(T, 4, T, 0, q, hi); // the hips turned
    qmul(T, 8, q, hi, q, si); // hips * spine as it was
    qconjmul(q, si, T, 4, T, 8); // the spine under the turned hips keeps the chest where it was
    q[hi] = T[4];
    q[hi + 1] = T[5];
    q[hi + 2] = T[6];
    q[hi + 3] = T[7];
    const c = Math.cos(a), s = Math.sin(a), x = pose.hips[0], z = pose.hips[2];
    pose.hips[0] = c * x + s * z;
    pose.hips[2] = -s * x + c * z;
  };

  // ---- footsteps: the clips' footfalls are the game's (dust, the living world's steps, sound)
  hero.on('footfall', (n, e) => {
    if ((S.mode === 'loco' || S.mode === 'stop') && S.vs > 0.4) A?.onFootstep?.(e.side === 'R' ? -1 : 1, 0);
  });

  /** One step of the remade hero (after today's animator's). */
  function step(dt) {
    dt = fin(dt, 0);
    const p = player.position;
    obj.position.set(fin(p.x), fin(p.y), fin(p.z));
    obj.rotation.y = fin(player.yaw);
    switch (S.mode) {
      case 'loco':
        loco(dt);
        break;
      case 'stop':
        if (hero.done || (player.intent?.len ?? 0) > 0.1) {
          S.mode = 'loco';
          hero.transition(0.25);
          loco(dt);
        }
        break;
      case 'attack': {
        const a = player.atk;
        if (a?.def && S.clip) hero.setTime(fitTime(S.clip, fin(a.t), a.def));
        break;
      }
      case 'charge': {
        const c = S.clip, coil = c.phases ? c.phases.windup / c.fps : c.dur * 0.4;
        hero.setTime(Math.min(coil, (fin(player.stateT) / Math.max(0.05, S.entry.coil ?? 0.3)) * coil));
        break;
      }
      case 'roll': {
        const c = S.clip, R = player._rollTune?.() ?? { dur: 0.6, landAt: 0.48 }, land = Math.min(c.n - 2, S.entry.land ?? c.n * 0.6);
        _pseudo.fps = c.fps;
        _pseudo.dur = c.dur;
        _pseudo.phases.windup = land * 0.5;
        _pseudo.phases.active = land;
        _pseudo.phases.recover = c.n - 1;
        _win.windup = R.landAt * 0.5;
        _win.active = R.landAt * 0.5;
        _win.recovery = Math.max(0.05, R.dur - R.landAt);
        hero.setTime(fitTime(_pseudo, fin(player.stateT), _win));
        break;
      }
      case 'hold':
        hero.setTime(fin(S.entry.at, 0) / S.clip.fps);
        break;
      default:
        break;
    }
    S.cs = damp(S.cs, S.csWant, 12, dt);
    hero.contactScale = S.cs;
    hero.update(dt);
  }
  const _pseudo = { fps: 30, dur: 1, phases: { windup: 1, active: 2, recover: 3 } };
  const _win = { windup: 0.1, active: 0.1, recovery: 0.1 };

  // ---- today's rig: hidden, and fed the remade hero's joints
  let hidden = [];
  const collectHidden = () => {
    hidden = [];
    player.object3d.traverse((o) => {
      if (o !== player.object3d && (o.isMesh || o.isLine || o.isPoints || o.isSprite)) hidden.push(o);
    });
  };
  collectHidden();
  const rig = () => player.rig ?? {};
  let pairs = [];
  const collectPairs = () => {
    const r = rig();
    pairs = [
      [r.sword, JI.weaponR], [r.chest, JI.chest], [r.pelvis, JI.hips], [r.head, JI.head],
      [r.arms?.R?.upper, JI.upperArmR], [r.arms?.L?.upper, JI.upperArmL],
      [r.legs?.L?.thigh, JI.thighL], [r.legs?.L?.shin, JI.shinL], [r.legs?.L?.foot, JI.footL],
      [r.legs?.R?.thigh, JI.thighR], [r.legs?.R?.shin, JI.shinR], [r.legs?.R?.foot, JI.footR],
    ].filter(([n]) => n && n.matrixWorld);
  };
  collectPairs();
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
  function mirror() {
    for (let i = 0; i < hidden.length; i++) hidden[i].visible = false;
    const M = player.object3d.matrixWorld, P = hero.world.p, R = hero.world.r;
    for (let i = 0; i < pairs.length; i++) {
      const [node, j] = pairs[i];
      _p.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
      _q.set(R[j * 4], R[j * 4 + 1], R[j * 4 + 2], R[j * 4 + 3]);
      _m.compose(_p, _q, _one);
      node.matrixWorld.multiplyMatrices(M, _m);
    }
    // the sword's children (the gem) follow it
    const sw = rig().sword;
    if (sw) for (let i = 0; i < sw.children.length; i++) sw.children[i].updateMatrixWorld(true);
  }

  // ---- the surface player.js expects (everything else reads through to today's animator)
  const own = {
    hero,
    adapter: S,
    onFootstep: null,
    play(key, blend = 0.15, easeOut = false) {
      oldAnim.play(key, blend, easeOut);
      hero.transition(Math.max(0.04, Math.min(0.25, fin(blend, 0.15))));
      enter(key);
    },
    update(dt) {
      oldAnim.update(dt);
      step(dt);
    },
    reset() {
      oldAnim.reset?.();
      hero.teleported();
    },
    teleported() {
      oldAnim.teleported?.();
      hero.teleported();
    },
    afterWorld(dt) {
      mirror(dt);
    },
  };
  const bound = new Map();
  A = new Proxy(own, {
    get(t, k) {
      if (k in t) return t[k];
      const v = oldAnim[k];
      if (typeof v !== 'function') return v;
      let f = bound.get(k);
      if (!f || f.src !== v) {
        f = v.bind(oldAnim);
        f.src = v;
        bound.set(k, f);
      }
      return f;
    },
    set(t, k, v) {
      if (k in t) t[k] = v;
      else oldAnim[k] = v;
      return true;
    },
  });
  enter('loco');
  return {
    proxy: A,
    hero,
    state: S,
    /** Today's animator was rebuilt (an outfit change): run on the new one, re-read the rig. */
    rewrap(next) {
      oldAnim = next;
      bound.clear();
      collectHidden();
      collectPairs();
    },
  };
}

/**
 * The play stand (index.js, `?hero=new` without `show`): build the body (body.js, or the debug body
 * while body.js draws nothing / with `?body=debug`), put the adapter in place of player.anim, print the
 * remade hero through what covers him. Returns { update(dt) } (re-wraps after an outfit change).
 */
export async function mount(game, params) {
  const [{ loadLibrary }, bodyModule, { buildDebugBody }] = await Promise.all([import('./clips/index.js'), import('./body.js'), import('./debugBody.js')]);
  const lib = await loadLibrary();
  for (const p of lib.problems.slice(0, 8)) console.warn(`[hero2] ${p.clip}: ${p.text}`);
  const player = game.player;
  let body = null;
  if (params?.get?.('body') !== 'debug') {
    try {
      body = bodyModule.buildBody(game, {});
      if (!bodyModule.BODY_READY && !(body?.object3d?.children?.length > 0)) {
        body.dispose?.();
        body = null;
      }
    } catch (e) {
      console.warn('[hero2] body.js failed, the debug body stands in:', e);
      body = null;
    }
  }
  if (!body) body = buildDebugBody(game, { scale: fin(player.drawScale, 1.08) });
  game.scene.add(body.object3d);
  const ad = createAdapter(game, player, player.anim, { lib, body });
  player.anim = ad.proxy;
  game.pipeline?.setSeenThrough?.(body.object3d);
  return {
    adapter: ad,
    body,
    lib,
    update() {
      // an outfit change rebuilt today's animator (player.setLook): run on the new one
      const a = player.anim;
      if (a && a !== ad.proxy) {
        ad.rewrap(a);
        player.anim = ad.proxy;
      }
    },
  };
}
