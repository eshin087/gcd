// The review mode of the remade hero (`?hero=new&show=`; README.md): in any real level (`?level=` as
// usual) today's hero is hidden and the remade one stands where he stood, playing recorded clips, seen
// from a close camera round him or from the real game camera. The review films are recorded from it.
//
// How the game is kept running (the least invasive way found): the game goes to its explore state
// (the title is skipped) with the boss kept asleep (CONFIG.world's wake line and radius moved out of
// reach); today's hero keeps updating, hidden (object3d.visible = false: his effects check it) and
// deaf (player.control = false each step, so his next step reads no input); after his update he is
// put where the remade hero stands, so the game's own camera rig, the lights, the fog and the grass
// follow the remade hero exactly as they follow him in play. Nothing in the player's files changes.
//
// THE REVIEW LIST (the order of play): the registry's sets in order (clips/index.js), each set's clips
// in its own order; where a riding set (moveHorse / swordHorse) has no clips of its own yet, the horse's
// chapters stand in its place (horse/rider.js RIDES: the horse plays its clip, he rides it in the seated
// placeholder). After the last single play of a chain's clips (CHAINS below) the chain plays once more
// joined up, as the footage plays it. An entry: a clip, a ride, a chain or a card (a title held over
// the idle: the film rig's note for a chapter not built yet).
//
// Pace: real speed. A loop shows about two cycles (at least 2.5 s), a one-shot once with a 0.5 s hold on
// its first frame before and on its last after. Every entry starts on his home spot (the hero's spawn),
// the game camera snapped there with him.
//
// URL: ?hero=new&show=[<entry>|all] [&view=close|game] [&az=deg] [&dist=m] [&up=m] [&speed=k]
//      [&body=debug] [&test=1 (the synthetic _ clips in the list too)] [&loop=0 (play the list once)]
// Console / film API: __game.hero2.show = { list(), play(name), playAll(opts), view(opts), speed(k),
//      pause(on), step(dt), status(), title(), stop(), hero (the animator), lib, ride, horse }
import { loadLibrary } from './clips/index.js';
import { createHero2, createClipPlayer } from './engine.js';
import * as bodyModule from './body.js';
import { buildDebugBody } from './debugBody.js';
import { JI, createWorld, restOffsets, solveFK } from './skeleton.js';
import { qrot } from './qmath.js';
import { HDIM } from './dims.js';

const num = (v, d) => {
  const x = Number(v);
  return v != null && v !== '' && Number.isFinite(x) ? x : d;
};

/** The hold (s) on a one-shot's first frame before it plays and on its last after. */
export const HOLD = 0.5;

/** Chains the footage plays joined up: after the last single play of its clips, each chain plays once
 *  more, clip into clip (the engine's own blend). A chain whose clips are not all there is left out.
 *  A loop inside a chain plays whole cycles (at least LOOP_IN_CHAIN s): the next clip starts on the
 *  loop's first frame, the phase it was cut from. Riding chains name RIDES entries (horse/rider.js). */
export const CHAINS = [
  ['walkStart', 'walk', 'walkStop'],
  ['runStart', 'run', 'runStop'],
  ['sprintStart', 'sprint', 'sprintStop'],
  ['walk', 'walkPivot'],
  ['run', 'runPivot'],
  ['walk', 'walkTurnL90', 'walk'],
  ['walk', 'walkJump', 'walk'],
  ['run', 'runJump', 'run'],
  ['sprint', 'sprintJump', 'sprint'],
  ['crouchDown', 'crouchIdle', 'crouchUp'],
  ['crouchSprint', 'crouchStop', 'crouchIdle'],
  ['walk', 'walkToCrouch', 'crouchWalk'],
  ['fall', 'fallLand'],
  ['light1', 'light2', 'light3', 'light4', 'light5'],
  ['heavy1', 'heavy2'],
  ['charge1', 'charge2'],
  ['horseWalkStart', 'horseWalk', 'horseWalkStop'],
  ['horseRunStart', 'horseRun', 'horseRunStop'],
  ['horseSprintStart', 'horseSprint', 'horseSprintStop'],
];
const LOOP_IN_CHAIN = 1.5;

/** The horse's chapters in the footage's order, per riding set (RIDES entry names, horse/rider.js). */
export const RIDE_ORDER = {
  moveHorse: [
    'horseMount', 'horseStand', 'horseDismount', 'rideMountRun', 'rideDismountRun',
    'horseWalkStart', 'horseWalk', 'horseWalkStop', 'horseTurnL', 'horseTurnR', 'horseWalkTurnL', 'horseWalkTurnR',
    'horseRunStart', 'horseRun', 'horseRunStop', 'horseSprintStart', 'horseSprint', 'horseSprintStop',
    'horseJump', 'horseJumpRun', 'horseDoubleJump',
  ],
  swordHorse: ['horseRiderLight', 'horseRiderHeavy'],
};

/** The close camera's side (deg from his front toward his right) when the entry gives none: a
 *  three-quarter view from his right-front (both arms and the blade in view); a turn is seen from a side
 *  that splits it evenly about that view (it starts and ends three-quarter); a horse from nearer its side. */
export const AZ = { base: 55, ride: 62 };

/** Seconds an entry is shown: a loop about two cycles (2.5 - 8 s), a one-shot the hold, once, the hold. */
export function showLength(e) {
  if (!e) return 0;
  if (e.kind === 'card') return e.seconds ?? 1.5;
  if (e.kind === 'chain') return HOLD + e.steps.reduce((a, s) => a + s.len, 0) + HOLD;
  if (e.loop) return Math.min(8, Math.max(2.5, 2 * e.dur));
  return HOLD + e.dur + HOLD;
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
      body = bodyModule.buildBody(game, {});
      // the stub draws nothing: the real body says so (BODY_READY), else an empty group gives it away
      const empty = !bodyModule.BODY_READY && !(body?.object3d?.children?.length > 0);
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
  }
  // (object3d.scale stays 1: gameplay metres; each body draws its own scale, as today's hero does)
  game.scene.add(body.object3d);
  const hero = createHero2(game, { body, library: lib });
  const obj = body.object3d;
  // the drawn scale (the body draws it in its matrix: object3d.scale stays 1)
  const drawK = num(game.player?.drawScale, 1.08);

  // ---- the horse and the ride (horse/: its own body, clips and animator; rider.js seats him on it).
  // Loaded here, lazily: nothing of the horse loads outside the review. A failure costs the riding
  // chapters only.
  let horse = null, horseBody = null, ride = null, RIDES = [];
  try {
    const [hengine, hbody, hclips, rider] = await Promise.all([
      import('./horse/hengine.js'), import('./horse/hbody.js'), import('./horse/clips/index.js'), import('./horse/rider.js'),
    ]);
    const hlib = await hclips.loadHorseLibrary();
    horseBody = hbody.buildHorseBody(game, {});
    horseBody.object3d.visible = false;
    game.scene.add(horseBody.object3d);
    horse = hengine.createHorse(game, { body: horseBody, library: hlib });
    const feetOn = hero.feet?.enabled;
    ride = rider.createRide(game, { horse, hero, body, drawScale: drawK });
    if (hero.feet) hero.feet.enabled = feetOn !== false; // (createRide turns them off: on again until he rides)
    RIDES = rider.RIDES.filter((r) => hlib.has(r.horse)).map((r) => ({ ...r, hclip: hlib.get(r.horse) }));
  } catch (e) {
    console.warn('[hero2] the horse failed to load: the riding chapters are left out', e);
    horse = horseBody = ride = null;
  }

  // every render sets the body's per-view state from the camera that renders it (the lean OFF in the
  // close view: upright, true anatomy; ON, aimed at the game camera, in the game view; the letters
  // sized and LIT from that camera: the film draws two views a frame, and the body's ink, set in its
  // step from the camera of the step, would else carry the close camera's dim ink into the game view)
  const pl = game.pipeline;
  if (pl && typeof pl.render === 'function' && typeof body.prepareView === 'function') {
    const render0 = pl.render.bind(pl);
    pl.render = (...a) => {
      try {
        const opts = S.view.mode === 'close' ? NO_LEAN : WITH_LEAN;
        if (ride?.active) ride.prepareView(game.camera, opts);
        else body.prepareView(game.camera, opts);
        body._light?.(0);
      } catch {
        /* a body without it */
      }
      return render0(...a);
    };
  }
  pl?.setSeenThrough?.(body.object3d);

  // keep the boss asleep for the whole review (the flow reads these every step)
  const W = game.CONFIG?.world;
  if (W) {
    W.bossTriggerZ = -1e9;
    W.wakeRadius = 0;
  }
  // where he stands: the hero's spawn (or &homeX= / &homeZ= / &homeYaw=), facing as he does
  const sp = game.player?.position ?? { x: 0, z: 0 };
  const home = { x: num(P.get('homeX'), num(sp.x, 0)), z: num(P.get('homeZ'), num(sp.z, 0)), yaw: num(P.get('homeYaw'), num(game.player?.yaw, Math.PI)) };
  const place = (x, z, yaw) => {
    obj.position.set(x, 0, z);
    obj.rotation.set(0, yaw, 0);
    hero.teleported();
  };
  place(home.x, home.z, home.yaw);

  // ---- the review list
  const withTest = P.get('test') === '1';
  const clipEntry = (c) => ({ kind: 'clip', name: c.name, clip: c, set: c.set, setTitle: c.setTitle, title: c.title, src: c.src, loop: !!c.loop, dur: c.dur, yaw: c.loop ? 0 : (c.cyc?.[2] ?? 0) });
  const rideByName = new Map(RIDES.map((r) => [r.name, r]));
  const rideEntry = (r, set) => ({
    kind: 'ride', name: r.name, ride: r, set: set.id, setTitle: set.title, title: r.hclip.title, src: r.hclip.src, loop: !!r.hclip.loop, dur: r.hclip.dur,
    yaw: r.hclip.loop ? 0 : (r.hclip.cyc?.[2] ?? 0),
    state: lib.has(r.rider) ? '' : 'the rider: seated placeholder (his riding clips are not built yet)',
  });
  function buildList(test) {
    const out = [];
    for (const set of lib.sets) {
      if (set.id.startsWith('_') && !test) continue;
      if (set.clips.length) for (const c of set.clips) out.push(clipEntry(c));
      else if (RIDE_ORDER[set.id] && ride) for (const n of RIDE_ORDER[set.id]) if (rideByName.has(n)) out.push(rideEntry(rideByName.get(n), set));
    }
    // the chains, each after the last single play of its clips
    const at = new Map(out.map((e, i) => [e.name, i]));
    const after = new Map(); // index -> the chains that follow it (the table's order)
    for (const names of CHAINS) {
      if (!names.every((n) => at.has(n))) continue;
      const parts = names.map((n) => out[at.get(n)]);
      const steps = parts.map((e, i) => ({
        name: e.name, kind: e.kind, ride: e.ride ?? null,
        // a loop: whole cycles; the last clip: whole (a loop at the end: two cycles)
        len: e.loop ? Math.ceil((i === parts.length - 1 ? 2 * LOOP_IN_CHAIN : LOOP_IN_CHAIN) / e.dur) * e.dur : e.dur,
      }));
      const last = Math.max(...names.map((n) => at.get(n)));
      const first = parts.find((e) => !e.loop) ?? parts[0];
      if (!after.has(last)) after.set(last, []);
      after.get(last).push({
        kind: 'chain', name: 'chain:' + names.join('>'), steps, set: first.set, setTitle: first.setTitle,
        title: 'Joined up: ' + parts.map((e) => e.title).filter((t, i, a) => a.indexOf(t) === i).join(' > '),
        src: first.src, loop: false, dur: steps.reduce((a, s) => a + s.len, 0), yaw: parts.reduce((a, e) => a + (e.loop ? 0 : e.yaw), 0),
        state: parts.some((e) => e.state) ? parts.find((e) => e.state).state : '',
      });
    }
    return out.flatMap((e, i) => [e, ...(after.get(i) ?? [])]);
  }
  const FULL = { true: null, false: null };
  const fullList = (test = withTest) => (FULL[!!test] ??= buildList(!!test));

  // ---- the review's state
  const S = {
    list: [], // the entries in order
    i: -1, // index in the list being shown (playAll), -1: a single entry
    e: null, // the entry showing
    step: 0, // a chain's step
    stepT: 0,
    t: 0, // s into the current showing
    len: 0, // s it lasts
    pre: 0, // s of hold on the first frame
    all: false,
    repeat: true,
    paused: false,
    stepQ: 0,
    speed: num(P.get('speed'), 1),
    // dist / up: model metres; auto: the close camera fitted to the entry's own bounds (unless &dist=);
    // panel: the share of the render's width the film shows of the close view (its middle)
    view: { mode: P.get('view') === 'game' ? 'game' : 'close', az: num(P.get('az'), NaN), dist: num(P.get('dist'), 4.4), up: num(P.get('up'), 0.35), yaw: home.yaw, auto: !P.has('dist'), fit: null, panel: 743 / 1280, azNow: AZ.base },
    follow: { x: home.x, z: home.z, ok: false },
    started: false,
    onEnd: null,
  };
  S.list = fullList(withTest);

  /** The close camera's side for entry e (deg): e.az, the view's az (&az=, view({ az })), or the default. */
  function azOf(e) {
    if (Number.isFinite(e?.az)) return e.az;
    if (Number.isFinite(S.view.az)) return S.view.az;
    const base = isRide(e) ? AZ.ride : AZ.base;
    const turn = ((e?.yaw ?? 0) * 180) / Math.PI;
    // (a full turn on the spot shows every side anyway)
    return Math.abs(turn) >= 300 ? base : base - turn / 2;
  }
  const isRide = (e) => e?.kind === 'ride' || (e?.kind === 'chain' && e.steps.some((s) => s.ride));

  // ---- riding on and off
  function rideOff() {
    if (!ride) return;
    if (ride.active) ride.stop();
    if (horseBody) horseBody.object3d.visible = false;
    hero.applyRoot = true;
    if (hero.feet) hero.feet.enabled = true;
  }
  function rideOn() {
    if (!ride || !horse) return false;
    const ho = horseBody.object3d;
    ho.visible = true;
    ho.position.set(home.x, 0, home.z);
    ho.rotation.set(0, home.yaw, 0);
    horse.teleported?.();
    if (hero.feet) hero.feet.enabled = false;
    return true;
  }
  /** Start step i of the showing entry (a chain's step, or the entry itself). */
  function startStep(name, viaRide, fade) {
    if (viaRide) {
      if (!ride.play(name, { fade })) return false;
    } else hero.play(name, { fade });
    return true;
  }

  /** Show entry e from a clean stand: carried back home (turned as he stood), cut in on its first frame. */
  const begin = (e) => {
    if (!e) return false;
    S.e = e;
    S.t = 0;
    S.step = 0;
    S.stepT = 0;
    S.len = showLength(e);
    S.pre = e.kind === 'chain' || ((e.kind === 'clip' || e.kind === 'ride') && !e.loop) ? HOLD : 0;
    const riding = isRide(e) && rideOn();
    if (!riding) rideOff();
    place(home.x, home.z, home.yaw);
    if (e.kind === 'card') hero.play(lib.has(e.idle) ? e.idle : 'idle', { fade: 0 });
    else if (e.kind === 'chain') startStep(e.steps[0].name, !!e.steps[0].ride && riding, 0);
    else startStep(e.name, e.kind === 'ride' && riding, 0);
    if (riding) ride.update(0);
    hero.update(0);
    S.view.yaw = home.yaw;
    S.view.azNow = azOf(e);
    S.view.fit = riding ? null : boundsOf(e);
    S.follow.ok = false;
    snapGame();
    return true;
  };

  /** The game camera snapped onto his spot (a new entry starts there; the rig's follow would swoop). */
  function snapGame() {
    const p = game.player;
    if (!p) return;
    p.position.x = obj.position.x;
    p.position.z = obj.position.z;
    try {
      game.cameraRig?.snap?.(p.position);
    } catch {
      /* a rig without snap */
    }
  }

  const resolve = (x) => {
    if (typeof x === 'string') return fullList(true).find((e) => e.name === x) ?? (lib.has(x) ? clipEntry(lib.get(x)) : null);
    if (x && x.kind === 'card') return { set: '', setTitle: '', src: '', title: '', seconds: 1.5, ...x };
    if (x && typeof x.ref === 'string') {
      const e = resolve(x.ref);
      return e ? { ...e, ...x, kind: e.kind } : null;
    }
    return x && x.kind ? x : null;
  };
  const pub = (e, i) => ({
    i, kind: e.kind, name: e.name, set: e.set, setTitle: e.setTitle, title: e.title, src: e.src, loop: !!e.loop,
    seconds: +(e.dur ?? 0).toFixed(3), show: +showLength(e).toFixed(3), state: e.state ?? '', az: +azOf(e).toFixed(1),
    steps: e.steps ? e.steps.map((s) => s.name) : undefined,
  });

  const api = {
    lib,
    hero,
    body,
    bodyKind,
    home,
    get ride() {
      return ride;
    },
    get horse() {
      return horse;
    },
    /** The review list in the order of play: [{ i, kind, name, set, setTitle, title, src, loop, seconds,
     *  show, state, az, steps }]. */
    list(test = withTest) {
      return fullList(test).map(pub);
    },
    /** Show one entry (a clip's name, a ride's, 'chain:a>b', or an entry object); it plays on (a loop
     *  loops, a one-shot holds its end). */
    play(x) {
      const e = resolve(x);
      if (!e) return false;
      S.all = false;
      S.i = -1;
      return begin(e);
    },
    /** Entries in order (each loop about two cycles, each one-shot once between holds). opts: { from:
     *  index | name, count, test: include the _ clips, entries: an explicit list (names, entry objects,
     *  { ref: name, az } or { kind: 'card', title, src, seconds, idle }), repeat, onEnd }. */
    playAll({ from = 0, count = Infinity, test = withTest, entries = null, repeat = false, onEnd = null } = {}) {
      const base = entries ? entries.map(resolve).filter(Boolean) : fullList(test);
      const f = typeof from === 'string' ? Math.max(0, base.findIndex((e) => e.name === from)) : Math.max(0, Math.min(base.length - 1, from | 0));
      S.list = base.slice(f, Number.isFinite(count) ? f + Math.max(1, count) : undefined);
      S.all = true;
      S.repeat = !!repeat;
      S.onEnd = onEnd;
      S.i = 0;
      return begin(S.list[0]);
    },
    /** The camera: { mode: 'close', az, dist, up } round him (az 0 = in front of him, 90 = at his
     *  right, 180 behind, -90 at his left; az 'auto' = per entry; it follows his hips), or { mode: 'game' }
     *  (the game's own). panel: the share of the render's width the film shows (the close fit). */
    view(o = {}) {
      const v = S.view;
      if (o.mode === 'game' || o.mode === 'close') v.mode = o.mode;
      if (Number.isFinite(o.az)) v.az = v.azNow = o.az;
      else if (o.az === 'auto') {
        v.az = NaN;
        v.azNow = azOf(S.e);
      }
      if (Number.isFinite(o.dist)) {
        v.dist = o.dist;
        v.auto = false;
      } else if (o.dist === 'auto') v.auto = true;
      if (Number.isFinite(o.up)) v.up = o.up;
      if (Number.isFinite(o.panel) && o.panel > 0) v.panel = o.panel;
      if (v.mode === 'game' && game.viewOverride === override) game.viewOverride = null;
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
      const e = S.e, c = hero.clip;
      return {
        kind: e?.kind ?? null, name: e?.name ?? null, clip: c?.name ?? null, title: e?.title ?? c?.title ?? '', set: e?.set ?? '', setTitle: e?.setTitle ?? '',
        src: e?.src ?? '', state: e?.state ?? '', step: e?.kind === 'chain' ? S.step : -1, steps: e?.steps?.length ?? 0,
        index: S.i, of: S.list.length, t: +S.t.toFixed(3), len: +S.len.toFixed(3), clipTime: +hero.time.toFixed(3),
        horse: ride?.active ? horse?.clip?.name ?? null : null,
        done: S.all ? S.i >= S.list.length : S.t >= S.len, view: S.view.mode, az: +S.view.azNow.toFixed(1), body: bodyKind,
        x: +obj.position.x.toFixed(3), y: +obj.position.y.toFixed(3), z: +obj.position.z.toFixed(3), yaw: +obj.rotation.y.toFixed(3),
      };
    },
    /** The film's title line: "<set title> · <entry title>". */
    title() {
      const e = S.e;
      return e ? `${e.setTitle || e.set} · ${e.title}` : '';
    },
  };

  // the first entry: ?show=<name> | all (the default: the whole list, over and over)
  const want = P.get('show');
  const startUp = () => {
    if (want && want !== 'all' && resolve(want)) api.play(want);
    else api.playAll({ repeat: P.get('loop') !== '0' });
  };

  /** The entry's reach round his hips over its whole showing (model metres): lowest / highest point,
   *  the farthest point from the hips' vertical (the blade's point included when a hand holds a sword). */
  const _bp = createClipPlayer(lib, { warn: () => {} }), _bw = createWorld(), _brest = restOffsets(), _bv = new Float64Array(3);
  function boundsOf(e) {
    const names = e.kind === 'chain' ? e.steps.map((s) => s.name) : [e.kind === 'card' ? (lib.has(e.idle) ? e.idle : 'idle') : e.name];
    let ymin = Infinity, ymax = -Infinity, r = 0;
    try {
      for (const n of names) {
        const c = lib.get(n);
        if (!c) continue;
        _bp.play(n, { fade: 0 });
        const total = c.loop ? Math.max(c.dur, 1) : c.dur, N = 48;
        for (let i = 0; i <= N; i++) {
          _bp.update(i === 0 ? 0 : total / N);
          solveFK(_bp.pose, _brest, _bw);
          const P = _bw.p, hx = P[JI.hips * 3], hz = P[JI.hips * 3 + 2];
          const top = P[JI.head * 3 + 1] + 0.25;
          for (let j = 1; j < 24; j++) {
            const y = j === JI.head ? top : P[j * 3 + 1];
            ymin = Math.min(ymin, y);
            ymax = Math.max(ymax, y);
            r = Math.max(r, Math.hypot(P[j * 3] - hx, P[j * 3 + 2] - hz));
          }
          for (const s2 of ['R', 'L']) {
            if (c.props?.[s2] !== 'sword') continue;
            const j = s2 === 'L' ? JI.weaponL : JI.weaponR;
            qrot(_bv, 0, _bw.r, j * 4, 0, 0, HDIM.blade + 0.1);
            const x = P[j * 3] + _bv[0], y = P[j * 3 + 1] + _bv[1], z = P[j * 3 + 2] + _bv[2];
            ymin = Math.min(ymin, y);
            ymax = Math.max(ymax, y);
            r = Math.max(r, Math.hypot(x - hx, z - hz));
          }
        }
      }
      if (!Number.isFinite(ymin)) return null;
      ymin = Math.min(0, ymin);
    } catch {
      return null;
    }
    return { ymin, ymax, r: Math.max(r, 0.45) };
  }
  const NO_LEAN = { lean: false }, WITH_LEAN = { lean: true };

  const hips = [0, 0, 0];
  const camPos = { x: 0, y: 0, z: 0 }, camTgt = { x: 0, y: 0, z: 0 }, camFoc = { x: 0, y: 0, z: 0 };
  const override = { pos: camPos, target: camTgt, focus: camFoc };

  function hipsWorld() {
    const p = hero.world.p, j = JI.hips * 3, c = Math.cos(obj.rotation.y), s = Math.sin(obj.rotation.y), k = drawK;
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
    const yaw = v.yaw, az = (v.azNow * Math.PI) / 180;
    // his front (sin yaw, cos yaw); his right (-cos yaw, sin yaw); az turns from the front toward his right
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const ox = fx * Math.cos(az) + rx * Math.sin(az), oz = fz * Math.cos(az) + rz * Math.sin(az);
    let ty = HDIM.height * 0.52 * drawK, dist = v.dist * drawK, up = v.up * drawK;
    const F = v.fit;
    if (ride?.active) {
      // on the horse: farther and higher, the horse and the rider in frame (the saddle's height)
      ty = 1.25;
      dist = 8.5;
      up = 0.8;
      // the horse's middle, not his hips: the horse leads the frame
      const ho = horseBody?.object3d;
      if (ho) {
        S.follow.x = (S.follow.x + ho.position.x) * 0.5;
        S.follow.z = (S.follow.z + ho.position.z) * 0.5;
      }
    } else if (v.auto && F) {
      // the whole figure and the blade's reach in the panel (the film's close panel: the middle
      // `panel` of the render's width), whatever the clip does: fitted to its bounds round his hips
      const cam = game.camera, tv = Math.tan(((cam?.fov ?? 32) * Math.PI) / 360);
      const th = tv * Math.min(cam?.aspect ?? 16 / 9, 16 / 9) * v.panel;
      const half = ((F.ymax - F.ymin) * 0.5 + 0.15) * drawK, rad = (F.r + 0.1) * drawK;
      dist = Math.max(half / tv, rad / th) + rad * 0.6;
      ty = (F.ymin + F.ymax) * 0.5 * drawK;
      up = dist * 0.08;
    }
    camTgt.x = S.follow.x;
    camTgt.y = ty;
    camTgt.z = S.follow.z;
    camPos.x = S.follow.x + ox * dist;
    camPos.y = ty + up;
    camPos.z = S.follow.z + oz * dist;
    camFoc.x = S.follow.x;
    camFoc.y = 0;
    camFoc.z = S.follow.z;
    game.viewOverride = override;
  }

  function hideOld() {
    const p = game.player;
    if (!p) return;
    if (p.object3d) p.object3d.visible = false;
    p.control = false; // his next step reads no input (player.js update: _readInput(control && this.control))
    // where the remade hero stands: the camera rig, the lights, the fog and the grass follow it; on the
    // horse, the horse's middle (the camera keeps both in)
    const ho = ride?.active ? horseBody?.object3d : null;
    p.position.x = ho ? (obj.position.x + ho.position.x) * 0.5 : obj.position.x;
    p.position.z = ho ? (obj.position.z + ho.position.z) * 0.5 : obj.position.z;
  }

  /** A chain moves on to its next step when this one's time is up. */
  function chainStep(k) {
    const e = S.e;
    if (e?.kind !== 'chain' || S.t <= S.pre) return;
    S.stepT += k;
    while (S.step < e.steps.length - 1 && S.stepT >= e.steps[S.step].len) {
      S.stepT -= e.steps[S.step].len;
      S.step++;
      const s = e.steps[S.step];
      startStep(s.name, !!s.ride && ride?.active, 0.2);
    }
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
      let kc = k; // the clip's own step (none while the first frame is held)
      if (S.started) {
        const t0 = S.t;
        S.t += k;
        kc = Math.max(0, S.t - Math.max(t0, S.pre));
        if (S.all && S.t >= S.len && S.i < S.list.length) {
          S.i++;
          if (S.i >= S.list.length && S.repeat) S.i = 0;
          if (S.i < S.list.length) {
            begin(S.list[S.i]);
            kc = 0;
          } else S.onEnd?.();
        } else chainStep(kc);
      }
      if (ride?.active) ride.update(kc);
      hero.update(kc);
      hideOld();
      camera();
    },
  };
  game.hero2Show = api; // (before the switchboard names game.hero2; the same object)
  return part;
}
