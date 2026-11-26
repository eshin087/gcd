// The review mode of the remade hero (`?hero=new`; README.md): in any real level (`?level=` as usual)
// today's hero is hidden and the remade one stands where he stood, playing recorded clips, seen from a
// close camera round him or from the real game camera. The review films are recorded from it.
//
// How the game is kept running (the least invasive way found): the game goes to its explore state
// (the title is skipped) with the boss kept asleep (CONFIG.world's wake line and radius moved out of
// reach); today's hero keeps updating, hidden (object3d.visible = false: his effects check it) and
// deaf (player.control = false each step, so his next step reads no input); after his update he is
// put where the remade hero stands, so the game's own camera rig, the lights, the fog and the grass
// follow the remade hero exactly as they follow him in play. Nothing in the player's files changes.
//
// URL: ?hero=new [&show=<clip>|all] [&view=close|game] [&az=deg] [&dist=m] [&up=m] [&speed=k]
//      [&body=debug] [&test=1 (the synthetic _ clips in the list too)] [&loop=0 (play the list once)]
// Console / film API: __game.hero2.show = { list(), play(name), playAll(opts), view(opts), speed(k),
//      pause(on), step(dt), status(), title(), stop(), hero (the animator), lib }
import { loadLibrary } from './clips/index.js';
import { createHero2 } from './engine.js';
import { buildBody } from './body.js';
import { buildDebugBody } from './debugBody.js';
import { JI } from './skeleton.js';
import { HDIM } from './dims.js';

const num = (v, d) => {
  const x = Number(v);
  return v != null && v !== '' && Number.isFinite(x) ? x : d;
};

/** Seconds a clip is shown in the list: a loop about two cycles (at least 3 s, at most 8), a one-shot
 *  once and a short hold. */
export function showLength(c, hold = 0.6) {
  if (!c) return 0;
  return c.loop ? Math.min(8, Math.max(3, 2 * c.dur)) : c.dur + hold;
}

export async function mount(game, params) {
  const P = params ?? new URLSearchParams('');
  const lib = await loadLibrary();
  for (const p of lib.problems.slice(0, 8)) console.warn(`[hero2] ${p.clip}: ${p.text}`);
  const scale = num(game.player?.drawScale, 1.08);
  // the body: the real one (body.js) unless it draws nothing yet, or ?body=debug
  let body = null, bodyKind = 'body';
  if (P.get('body') !== 'debug') {
    try {
      body = buildBody(game, {});
      const empty = body?.drawn === false || (body?.drawn !== true && !(body?.object3d?.children?.length > 0));
      if (empty) {
        body.dispose?.();
        body = null;
      }
    } catch (e) {
      console.warn('[hero2] body.js failed, the debug body stands in:', e);
      body = null;
    }
  }
  if (!body) {
    body = buildDebugBody(game, { scale });
    bodyKind = 'debug';
  } else if (body.object3d.scale.x === 1) body.object3d.scale.setScalar(scale);
  game.scene.add(body.object3d);
  const hero = createHero2(game, { body, library: lib });
  const obj = body.object3d;

  // keep the boss asleep for the whole review (the flow reads these every step)
  const W = game.CONFIG?.world;
  if (W) {
    W.bossTriggerZ = -1e9;
    W.wakeRadius = 0;
  }
  // where he stands: the hero's spawn, facing as he does
  const sp = game.player?.position ?? { x: 0, z: 0 };
  const home = { x: num(sp.x, 0), z: num(sp.z, 0), yaw: num(game.player?.yaw, Math.PI) };
  const place = (x, z, yaw) => {
    obj.position.set(x, 0, z);
    obj.rotation.y = yaw;
    hero.teleported();
  };
  place(home.x, home.z, home.yaw);

  // ---- the review's state
  const S = {
    list: [], // the clips in order (decoded)
    i: -1, // index in the list being shown (playAll), -1: a single clip
    t: 0, // s into the current showing
    len: 0, // s it lasts
    all: false,
    repeat: true,
    paused: false,
    stepQ: 0,
    speed: num(P.get('speed'), 1),
    view: { mode: P.get('view') === 'game' ? 'game' : 'close', az: num(P.get('az'), 0), dist: num(P.get('dist'), 4.4), up: num(P.get('up'), 0.35), yaw: home.yaw },
    follow: { x: home.x, z: home.z, ok: false },
    started: false,
    farR: 2.5, // m from home: carried back before the next clip
    onEnd: null,
  };
  const withTest = P.get('test') === '1';
  const real = lib.clips.filter((c) => !c.name.startsWith('_'));
  const order = (test) => (real.length && !test ? real : lib.clips);
  S.list = order(withTest);

  /** Start clip c from a clean stand: carried back home (and turned to face as he did) when he
   *  travelled or turned; cut in (each clip is shown from its first frame). */
  const begin = (c) => {
    if (!c) return false;
    const dx = obj.position.x - home.x, dz = obj.position.z - home.z;
    const turned = Math.abs(Math.atan2(Math.sin(obj.rotation.y - home.yaw), Math.cos(obj.rotation.y - home.yaw))) > 0.05;
    if (Math.hypot(dx, dz) > (S.view.mode === 'close' ? 0.05 : S.farR) || turned) place(home.x, home.z, home.yaw);
    hero.play(c.name, { fade: 0 });
    S.view.yaw = obj.rotation.y;
    S.t = 0;
    S.len = showLength(c);
    S.follow.ok = false;
    return true;
  };

  const api = {
    lib,
    hero,
    body,
    bodyKind,
    home,
    /** The clips in the order of play: [{ i, name, set, setTitle, title, seconds, loop, src }]. */
    list(test = withTest) {
      return order(test).map((c, i) => ({ i, name: c.name, set: c.set, setTitle: c.setTitle, title: c.title, seconds: +c.dur.toFixed(3), loop: c.loop, src: c.src, show: +showLength(c).toFixed(3) }));
    },
    /** Play one clip (loops until told otherwise; a one-shot holds its end). */
    play(name) {
      const c = lib.get(name);
      if (!c) return false;
      S.all = false;
      S.i = -1;
      return begin(c);
    },
    /** Every clip in the list's order (each loop about two cycles, each one-shot once and a hold);
     *  opts: { from: index | name, test: include the _ clips, repeat: start over at the end, onEnd }. */
    playAll({ from = 0, test = withTest, repeat = false, onEnd = null } = {}) {
      S.list = order(test);
      S.all = true;
      S.repeat = !!repeat;
      S.onEnd = onEnd;
      S.i = typeof from === 'string' ? Math.max(0, S.list.findIndex((c) => c.name === from)) : Math.max(0, Math.min(S.list.length - 1, from | 0));
      return begin(S.list[S.i]);
    },
    /** The camera: { mode: 'close', az, dist, up } round him (az 0 = in front of him, 90 = at his
     *  right, 180 behind, -90 at his left; it follows his hips), or { mode: 'game' } (the game's own). */
    view(o = {}) {
      const v = S.view;
      if (o.mode === 'game' || o.mode === 'close') v.mode = o.mode;
      if (Number.isFinite(o.az)) v.az = o.az;
      if (Number.isFinite(o.dist)) v.dist = o.dist;
      if (Number.isFinite(o.up)) v.up = o.up;
      if (v.mode === 'game') game.viewOverride = null;
      S.follow.ok = false;
      return { ...v };
    },
    speed(k) {
      if (Number.isFinite(k) && k >= 0) S.speed = k;
      return S.speed;
    },
    /** Hold the clip (the game runs on); pause(false) lets it go. */
    pause(on = true) {
      S.paused = !!on;
      return S.paused;
    },
    /** While paused: advance the clip by dt at the next game step. */
    step(dt = 1 / 60) {
      S.stepQ += Math.max(0, num(dt, 0));
    },
    stop() {
      S.all = false;
      S.i = -1;
    },
    /** What is showing (for the film's burned-in title). */
    status() {
      const c = hero.clip;
      return {
        name: c?.name ?? null, title: c?.title ?? '', set: c?.set ?? '', setTitle: c?.setTitle ?? '', src: c?.src ?? '',
        index: S.i, of: S.list.length, t: +S.t.toFixed(3), len: +S.len.toFixed(3), clipTime: +hero.time.toFixed(3),
        done: S.all ? S.i >= S.list.length : hero.done && S.t >= S.len, view: S.view.mode, body: bodyKind,
        x: +obj.position.x.toFixed(3), z: +obj.position.z.toFixed(3), yaw: +obj.rotation.y.toFixed(3),
      };
    },
    /** The film's title line: "<set title> · <clip title>". */
    title() {
      const c = hero.clip;
      return c ? `${c.setTitle || c.set} · ${c.title}` : '';
    },
  };

  // the first clip: ?show=<name> | all (the default: the whole list, over and over)
  const want = P.get('show');
  const startUp = () => {
    if (want && want !== 'all' && lib.has(want)) api.play(want);
    else api.playAll({ repeat: P.get('loop') !== '0' });
  };

  const hips = [0, 0, 0];
  const camPos = { x: 0, y: 0, z: 0 }, camTgt = { x: 0, y: 0, z: 0 }, camFoc = { x: 0, y: 0, z: 0 };
  const override = { pos: camPos, target: camTgt, focus: camFoc };

  function hipsWorld() {
    const p = hero.world.p, j = JI.hips * 3, c = Math.cos(obj.rotation.y), s = Math.sin(obj.rotation.y), k = obj.scale.x;
    hips[0] = obj.position.x + (c * p[j] + s * p[j + 2]) * k;
    hips[1] = obj.position.y + p[j + 1] * k;
    hips[2] = obj.position.z + (-s * p[j] + c * p[j + 2]) * k;
    return hips;
  }

  function camera() {
    const v = S.view;
    if (v.mode !== 'close') {
      if (game.viewOverride === override) game.viewOverride = null;
      return;
    }
    hipsWorld();
    // follow the hips over the ground (no lag: he stays in the middle of the frame); the height is the
    // ground's, so the hips' bob shows
    S.follow.x = hips[0];
    S.follow.z = hips[2];
    S.follow.ok = true;
    const k = obj.scale.x, yaw = v.yaw, az = (v.az * Math.PI) / 180;
    // his front (sin yaw, cos yaw); his right (-cos yaw, sin yaw); az turns from the front toward his right
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const ox = fx * Math.cos(az) + rx * Math.sin(az), oz = fz * Math.cos(az) + rz * Math.sin(az);
    const ty = obj.position.y + (HDIM.height * 0.52) * k;
    camTgt.x = S.follow.x;
    camTgt.y = ty;
    camTgt.z = S.follow.z;
    camPos.x = S.follow.x + ox * v.dist * k;
    camPos.y = ty + v.up * k;
    camPos.z = S.follow.z + oz * v.dist * k;
    camFoc.x = S.follow.x;
    camFoc.y = 0;
    camFoc.z = S.follow.z;
    game.viewOverride = override;
  }

  function hideOld() {
    const pl = game.player;
    if (!pl) return;
    if (pl.object3d) pl.object3d.visible = false;
    pl.control = false; // his next step reads no input (player.js update: _readInput(control && this.control))
    // where the remade hero stands: the camera rig, the lights, the fog and the grass follow it
    pl.position.x = obj.position.x;
    pl.position.z = obj.position.z;
  }

  const part = {
    show: api,
    update(dt) {
      // the game in its explore state (the title skipped), once the flow exists
      const fl = game.flow;
      if (!S.started && fl) {
        if (game.state === 'title') fl.debug?.toState?.('explore');
        S.started = true;
        startUp();
      }
      if (game.hero2 && game.hero2.show !== api) game.hero2.show = api;
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
      hero.update(k);
      hideOld();
      camera();
    },
  };
  game.hero2Show = api; // (before the switchboard names game.hero2; the same object)
  return part;
}
