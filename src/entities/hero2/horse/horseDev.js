// The horse stand (`?hero2=horse`): the mount stands in the level beside the hero and plays any of its
// clips, seen from a close camera round it or from the real game camera. The horse builder's review and
// film rig; the rider's author can try the saddle here.
//
// URL: ?hero2=horse [&hshow=<clip>|all] [&hview=close|game] [&haz=deg] [&hdist=m] [&hup=m] [&hspeed=k]
//      [&hlook=ascii|solid] [&hcam=0 (leave the camera alone)] [&hrider=1 (the remade hero rides it: rider.js)]
// Console: __game.hero2horse = { list(), play(name), playAll(opts), view(opts), speed(k), pause(on),
//      step(dt), status(), title(), look(mode), place(x, z, yaw), travel(on), horse (the animator),
//      body, lib, home, ride (with hrider=1), hero }
// The game keeps running as the hero2 showcase runs it (showcase.js): the explore state, the boss asleep,
// today's hero hidden and deaf, carried to where the camera looks so the game camera, the lights, the fog
// and the grass follow.
import { loadHorseLibrary } from './clips/index.js';
import { createHorse } from './hengine.js';
import { buildHorseBody } from './hbody.js';
import { HJI } from './hskeleton.js';
import { createRide } from './rider.js';

const num = (v, d) => {
  const x = Number(v);
  return v != null && v !== '' && Number.isFinite(x) ? x : d;
};

/** Seconds a clip is shown in the list (showcase.js's rule): a loop about two cycles (3 - 8 s), a one-shot once and a hold. */
export function horseShowLength(c, hold = 0.6) {
  if (!c) return 0;
  return c.loop ? Math.min(8, Math.max(3, 2 * c.dur)) : c.dur + hold;
}

export async function mount(game, params) {
  const P = params ?? new URLSearchParams('');
  const lib = await loadHorseLibrary();
  for (const p of lib.problems.slice(0, 8)) console.warn(`[horse] ${p.clip}: ${p.text}`);
  const body = buildHorseBody(game, {});
  game.scene.add(body.object3d);
  const horse = createHorse(game, { body, library: lib });
  const obj = body.object3d;
  if (P.get('hlook') === 'solid') body.look('solid');
  // the rider (?hrider=1): the remade hero, his real body, seated by rider.js
  let ride = null, hero = null, heroBody = null;
  if (P.get('hrider') === '1') {
    try {
      const [{ loadLibrary }, { createHero2 }, bodyModule] = await Promise.all([import('../clips/index.js'), import('../engine.js'), import('../body.js')]);
      const hlib = await loadLibrary();
      heroBody = bodyModule.buildBody(game, {});
      game.scene.add(heroBody.object3d);
      hero = createHero2(game, { body: heroBody, library: hlib, applyRoot: false });
      ride = createRide(game, { horse, hero, body: heroBody, drawScale: Number(game.player?.drawScale) || 1.08 });
      game.pipeline?.setSeenThrough?.(heroBody.object3d);
    } catch (e) {
      console.warn('[horse] the rider failed:', e);
      ride = null;
    }
  }
  // every render: the lean toward the camera that draws it (off in the close view: true anatomy)
  const pl = game.pipeline;
  if (pl && typeof pl.render === 'function') {
    const render0 = pl.render.bind(pl);
    pl.render = (...a) => {
      try {
        const opts = S.view.mode === 'close' ? { lean: false } : { lean: true };
        if (ride) ride.prepareView(game.camera, opts);
        else body.prepareView(game.camera, opts);
      } catch {
        /* never freeze the frame */
      }
      return render0(...a);
    };
  }

  const W = game.CONFIG?.world;
  if (W) {
    W.bossTriggerZ = -1e9;
    W.wakeRadius = 0;
  }
  // where it stands: beside the hero's spawn (3 m to his right), facing as he does
  const sp = game.player?.position ?? { x: 0, z: 0 };
  const yaw0 = num(game.player?.yaw, Math.PI);
  const home = { x: num(sp.x, 0) - Math.cos(yaw0) * 3, z: num(sp.z, 0) + Math.sin(yaw0) * 3, yaw: yaw0 };
  const place = (x, z, yaw) => {
    obj.position.set(x, 0, z);
    obj.rotation.y = yaw;
    horse.teleported();
    hero?.teleported?.();
  };
  place(home.x, home.z, home.yaw);

  const camOn = P.get('hcam') !== '0' && P.get('hero') !== 'new';
  const S = {
    list: lib.clips.slice(), i: -1, t: 0, len: 0, all: false, repeat: true, paused: false, stepQ: 0,
    speed: num(P.get('hspeed'), 1),
    view: { mode: P.get('hview') === 'game' ? 'game' : 'close', az: num(P.get('haz'), 90), dist: num(P.get('hdist'), 6.5), up: num(P.get('hup'), 0.6), yaw: home.yaw },
    started: false, farR: 6, onEnd: null, travel: true,
  };

  const begin = (c) => {
    if (!c) return false;
    const dx = obj.position.x - home.x, dz = obj.position.z - home.z;
    const turned = Math.abs(Math.atan2(Math.sin(obj.rotation.y - home.yaw), Math.cos(obj.rotation.y - home.yaw))) > 0.05;
    if (Math.hypot(dx, dz) > (S.view.mode === 'close' ? 0.05 : S.farR) || turned) place(home.x, home.z, home.yaw);
    if (!(ride && ride.play(c.name))) horse.play(c.name, { fade: 0 });
    S.view.yaw = obj.rotation.y;
    S.t = 0;
    S.len = horseShowLength(c);
    return true;
  };

  const api = {
    lib, horse, body, home, ride, hero,
    list() {
      return S.list.map((c, i) => ({ i, name: c.name, set: c.set, title: c.title, seconds: +c.dur.toFixed(3), loop: c.loop, src: c.src, speed: c.speed, show: +horseShowLength(c).toFixed(3) }));
    },
    play(name) {
      const c = lib.get(name);
      if (!c) return false;
      S.all = false;
      S.i = -1;
      return begin(c);
    },
    playAll({ from = 0, repeat = false, onEnd = null } = {}) {
      S.all = true;
      S.repeat = !!repeat;
      S.onEnd = onEnd;
      S.i = typeof from === 'string' ? Math.max(0, S.list.findIndex((c) => c.name === from)) : Math.max(0, Math.min(S.list.length - 1, from | 0));
      return begin(S.list[S.i]);
    },
    /** { mode: 'close', az, dist, up } round the horse (az 0 = in front of it, 90 = at its right, -90 its left), or { mode: 'game' } */
    view(o = {}) {
      const v = S.view;
      if (o.mode === 'game' || o.mode === 'close') v.mode = o.mode;
      if (Number.isFinite(o.az)) v.az = o.az;
      if (Number.isFinite(o.dist)) v.dist = o.dist;
      if (Number.isFinite(o.up)) v.up = o.up;
      if (v.mode === 'game' && game.viewOverride === override) game.viewOverride = null;
      return { ...v };
    },
    speed(k) {
      if (Number.isFinite(k) && k >= 0) S.speed = k;
      return S.speed;
    },
    pause(on = true) {
      S.paused = !!on;
      return S.paused;
    },
    step(dt = 1 / 60) {
      S.stepQ += Math.max(0, num(dt, 0));
    },
    stop() {
      S.all = false;
      S.i = -1;
    },
    /** false: the horse stays on its spot (the hooves still pinned): the root motion is not applied */
    travel(on = true) {
      S.travel = !!on;
      horse.applyRoot = S.travel;
      return S.travel;
    },
    look: (mode) => body.look(mode),
    place: (x, z, yaw = obj.rotation.y) => place(num(x, home.x), num(z, home.z), num(yaw, home.yaw)),
    status() {
      const c = horse.clip;
      return {
        name: c?.name ?? null, title: c?.title ?? '', set: c?.set ?? '', src: c?.src ?? '', index: S.i, of: S.list.length,
        t: +S.t.toFixed(3), len: +S.len.toFixed(3), clipTime: +horse.time.toFixed(3), done: S.all ? S.i >= S.list.length : horse.done && S.t >= S.len,
        view: S.view.mode, x: +obj.position.x.toFixed(3), z: +obj.position.z.toFixed(3), yaw: +obj.rotation.y.toFixed(3),
        contact: { ...horse.contact }, pinCorrect: +horse.pins.maxCorrect.toFixed(4),
      };
    },
    title() {
      const c = horse.clip;
      return c ? `${c.setTitle || c.set} · ${c.title}` : '';
    },
  };

  const want = P.get('hshow');
  const startUp = () => {
    if (want && want !== 'all' && lib.has(want)) api.play(want);
    else api.playAll({ repeat: P.get('hloop') !== '0' });
  };

  const camPos = { x: 0, y: 0, z: 0 }, camTgt = { x: 0, y: 0, z: 0 }, camFoc = { x: 0, y: 0, z: 0 };
  const override = { pos: camPos, target: camTgt, focus: camFoc };
  const mid = [0, 0, 0];
  function middle() {
    // between the withers and the hips, over the ground
    const p = horse.world.p, a = HJI.spine2 * 3, c = Math.cos(obj.rotation.y), s = Math.sin(obj.rotation.y);
    mid[0] = obj.position.x + c * p[a] + s * p[a + 2];
    mid[1] = obj.position.y + 1.1;
    mid[2] = obj.position.z - s * p[a] + c * p[a + 2];
    return mid;
  }
  function camera() {
    if (!camOn) return;
    const v = S.view;
    middle();
    // today's hero (hidden, deaf) stands where the camera looks: the game camera, the lights and the
    // grass follow the horse
    const pl = game.player;
    if (pl) {
      if (pl.object3d) pl.object3d.visible = false;
      pl.control = false;
      pl.position.x = mid[0];
      pl.position.z = mid[2];
    }
    if (v.mode !== 'close') {
      if (game.viewOverride === override) game.viewOverride = null;
      return;
    }
    const yaw = v.yaw, az = (v.az * Math.PI) / 180;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const ox = fx * Math.cos(az) + rx * Math.sin(az), oz = fz * Math.cos(az) + rz * Math.sin(az);
    camTgt.x = mid[0];
    camTgt.y = mid[1];
    camTgt.z = mid[2];
    camPos.x = mid[0] + ox * v.dist;
    camPos.y = mid[1] + v.up;
    camPos.z = mid[2] + oz * v.dist;
    camFoc.x = mid[0];
    camFoc.y = 0;
    camFoc.z = mid[2];
    game.viewOverride = override;
  }

  const part = {
    show: api,
    update(dt) {
      const fl = game.flow;
      if (!S.started && fl) {
        if (game.state === 'title') fl.debug?.toState?.('explore');
        S.started = true;
        startUp();
      }
      game.hero2horse = api;
      let k = Math.max(0, Number.isFinite(dt) ? dt : 0) * S.speed;
      if (S.paused) {
        k = S.stepQ;
        S.stepQ = 0;
      }
      if (S.started) {
        S.t += k;
        if (S.all && S.t >= S.len && S.i < S.list.length) {
          S.i++;
          if (S.i >= S.list.length && S.repeat) S.i = 0;
          if (S.i < S.list.length) begin(S.list[S.i]);
          else S.onEnd?.();
        }
      }
      if (ride) {
        ride.update(k);
        hero.update(k);
      } else horse.update(k);
      camera();
    },
  };
  game.hero2horse = api;
  return part;
}
