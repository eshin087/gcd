// Whole-game headless integration run (contract v0.2): REAL Player, Dragon, Hud, GameFlow,
// AudioEngine and Lab (+ real LightPool, GlyphParticles, CameraRig, Events), wired exactly like
// src/main.js (construction order, frame order, debugTimeScale in dt). World is a light mock built on
// the real Colliders. A bot drives the input: it moves, attacks, blocks, parries and dodges.
// usage: node integ.mjs <repoRoot> [scenario]   (env: ABYSS_SEED=n reseeds the AI, ABYSS_TRACE=1 logs combat events)
//   scenario: gate | hero | batch | breath | parry | block | reach | red | plunge | flurry | deflect | lab | strings | plungeReact | terrain |
//             timing | fire | music | herolook | herolife | herohand | heroweight | heroarms | herostance | looks | win | die | touch | pad | remap | all (default all)
//             or a comma list of them (hero,looks,...)
//   (timing: ABYSS_TM=name,name... probes only those attacks; ABYSS_TMV=1 prints its per-placement map;
//    ABYSS_TM_SHARD=k/n probes every n-th attack of the list, starting at the k-th: n runs cover it all)
//   ABYSS_SKIP=name,name... leaves those scenarios out of `all` (tests/run.mjs runs `timing` beside it, in parts)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ui, fireWin, AUDIO, resetWindow, El } from './shim.mjs';

const ROOT = process.argv[2];
const SCEN = process.argv[3] || 'all';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await import(pathToFileURL(`${ROOT}/node_modules/three/build/three.module.js`).href);
const { CONFIG } = await imp('src/core/config.js');
const { Events } = await imp('src/core/events.js');
const { CameraRig, fovFor } = await imp('src/core/cameraRig.js');
const { clamp, damp } = await imp('src/core/math.js');
const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { LightPool } = await imp('src/render/lights.js');
const { GlyphParticles } = await imp('src/render/particles.js');
const { FireField } = await imp('src/render/fireField.js');
const { Colliders } = await imp('src/world/colliders.js');
const { Destructibles, STATE: PIECE } = await imp('src/world/destructibles.js');
const { buildDeadTree, buildBoulder, buildStump, geosHeight } = await imp('src/world/forest.js');
const { TELL, TELL_STYLE, RESULT, DEFENSE, POSTURE, GUARD } = await imp('src/combat/rules.js');
const { Player, TUNE: TUNE_P } = await imp('src/entities/player/player.js');
const { DIM: HERO_DIM, setHeroGlyphScale } = await imp('src/entities/player/model.js');
const { Dragon } = await imp('src/entities/dragon/dragon.js');
const { TUNING, SCALE } = await imp('src/entities/dragon/tuning.js');
const { ATTACKS } = await imp('src/entities/dragon/attacks.js');
const { attackWeight } = await imp('src/entities/dragon/ai.js');
// scripted placements (place()) were authored for the x1.25 wyrm: they scale with its size
const SIZE = SCALE / 1.25;
const { Hud } = await imp('src/ui/hud.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { GlyphBar, GlyphPosture } = await imp('src/ui/glyphBar.js');
const { blockLines, blockText } = await imp('src/ui/blockText.js');
const { GamepadControls } = await imp('src/ui/gamepad.js');
const { Input } = await imp('src/core/input.js');
const { Bindings, installActions, ACTIONS } = await imp('src/core/bindings.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const near = (a, b, eps) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;

// Deterministic runs: the AI picks attacks with Math.random; every scenario reseeds it.
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(process.env.ABYSS_SEED ?? 1337);

// ---- event catalogue, read from the contract (docs/ARCHITECTURE.md → "Event catalogue")
const CATALOGUE = (() => {
  const md = fs.readFileSync(`${ROOT}/docs/ARCHITECTURE.md`, 'utf8');
  const sec = md.split(/^## /m).find((s) => s.startsWith('Event catalogue')) ?? '';
  const names = new Set();
  for (const m of sec.matchAll(/`([a-zA-Z]+(?::[a-zA-Z0-9]+)?)[ `]/g)) names.add(m[1]);
  return names;
})();

// ---- payload contract for the events the modules talk through (field → type)
// n finite number · s string · b boolean · t tell name · p point {x,y,z}
const PAYLOAD = {
  'combat:tell': { source: 's', attack: 's', tell: 't', impactIn: 'n', x: 'n', z: 'n' },
  'combat:flash': { source: 's', attack: 's', tell: 't', x: 'n', y: 'n', z: 'n' },
  'player:attack': { kind: 's', combo: 'n', charge: 'n' },
  'player:charge': { t: 'n' },
  'player:hitDragon': { damage: 'n', part: 's', point: 'p', heavy: 'b', crit: 'b', kind: 's' },
  'player:slam': { x: 'n', z: 'n' },
  'player:hurt': { damage: 'n', kind: 's', hp: 'n' },
  'player:block': { damage: 'n', tell: 't' },
  'player:parry': { tell: 't', attack: 's', chain: 'n', perfect: 'b' },
  'player:guardBreak': { attack: 's' },
  'player:guardOpen': { attack: 's' },
  'player:dodge': { kind: 's' },
  'player:perfectDodge': { attack: 's', tell: 't', streak: 'n' },
  'player:streak': { count: 'n', lost: 'n' },
  'player:flurry': { strikes: 'n', art: 's', air: 'b', dur: 'n' },
  'player:flurryHit': { n: 'n', of: 'n', last: 'b', damage: 'n' },
  'player:flurryArt': { art: 's', air: 'b', dur: 'n' },
  'player:flurryEnd': { strikes: 'n', damage: 'n', art: 's', label: 's' },
  'player:ghostep': { x: 'n', z: 'n' },
  'player:plunge': { execution: 'b' },
  'player:plungeHit': { damage: 'n', execution: 'b' },
  'combat:deflectChain': { count: 'n' },
  'player:heal': { amount: 'n', flasks: 'n' },
  'player:footstep': { x: 'n', z: 'n', sprint: 'b' },
  'player:lockOn': { on: 'b' },
  'dragon:roar': { strength: 'n' },
  'dragon:windup': { name: 's' },
  'dragon:attack': { name: 's' },
  'dragon:step': { x: 'n', z: 'n', heavy: 'b' },
  'dragon:wingFlap': { strength: 'n' },
  'dragon:land': { x: 'n', z: 'n' },
  'dragon:fireball': { x: 'n', y: 'n', z: 'n' },
  'dragon:explosion': { x: 'n', z: 'n', radius: 'n' },
  'dragon:hurt': { damage: 'n', part: 's', hp: 'n', crit: 'b' },
  'dragon:parried': { attack: 's', tell: 't', hit: 'n', last: 'b' },
  'dragon:returned': { kind: 'n', damage: 'n', x: 'n', y: 'n', z: 'n' },
  'combat:deflectChain': { count: 'n' },
  'dragon:phase': { n: 'n' },
  'dragon:plunged': { execution: 'b' },
  'dragon:posture': { posture: 'n', max: 'n' },
  state: { from: 's', to: 's' },
  area: { name: 's' },
};
const TELLS = new Set(Object.values(TELL));
const typeOk = (t, v) => (t === 'n' ? Number.isFinite(v) : t === 's' ? typeof v === 'string' : t === 'b' ? typeof v === 'boolean' : t === 't' ? TELLS.has(v) : t === 'p' ? !!v && [v.x, v.y, v.z].every(Number.isFinite) : true);
const payloadErrors = new Set();

/**
 * Pieces to lift and throw for the wyrm's terrain moves (ADR-110): the REAL Destructibles on a small
 * hand-built set, with world.impact / ignite / restore as world.js wires them. No colliders (the
 * other placements of a scenario stay where they are).
 *   'field'  four dead trees and four boulders at known spots (scenario TERRAIN)
 *   'lab'    a 9 m grid of boulders and trees over the clearing, so a piece is in reach wherever the
 *            wyrm stands; its trees shatter instead of falling (no falling-piece tells of the
 *            world's own among an ability's)
 */
function addTerrain(game, world, kind) {
  const rng = mulberry32(4177);
  const defs = [];
  const tree = (x, z, topples = true) => {
    const g = buildDeadTree(rng, x, z, 1);
    defs.push({ kind: 'deadTree', mat: 'wood', look: 'grid', x, z, r: 0.45, h: geosHeight(g), geos: g, colliders: [], broken: { geos: buildStump(rng, x, z, 1) }, lift: 1, ...(topples ? null : { topples: false }) });
  };
  const rock = (x, z) => {
    const b = buildBoulder(rng, x, z, 1.1);
    defs.push({ kind: 'boulder', mat: 'stone', look: 'prop', x, z, r: 0.94, h: geosHeight([b]), geos: [b], colliders: [], topples: false, lift: 1 });
  };
  if (kind === 'lab') {
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const x = i * 9, z = j * 9, r = Math.hypot(x, z);
        if (r < 5 || r > 28.5) continue;
        if ((i + j) & 1) rock(x, z);
        else tree(x, z, false);
      }
    }
  } else {
    for (const [x, z] of [[12, 0], [-14, 6], [0, -22], [20, 14]]) tree(x, z);
    for (const [x, z] of [[-10, -4], [9, 12], [-18, -14], [16, -12]]) rock(x, z);
  }
  const set = { breakables: defs, group: new THREE.Group() };
  const D = (world.destructibles = new Destructibles(game, world, set));
  const blow = { kind: 'blast', by: 'world' };
  world.impact = (x, z, r, power, o) => D.strike(x, z, r, power, o ?? blow);
  world.ignite = (x, z, r, k = 1) => D.ignite(x, z, r, k);
  world.restore = () => D.reset();
}

function build(opts = {}) {
  resetWindow();
  Math.random = mulberry32(SEED);
  ui.children.forEach((c) => (c.parentNode = null));
  ui.children.length = 0;
  const U = createSharedUniforms();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 16 / 9, CONFIG.camera.near, CONFIG.camera.far);
  // ---- input mock with the real Input interface (core/input.js). Edges last exactly one frame.
  //   tap(code) / click(b): down for this frame, released at its end (a quick tap)
  //   hold(code) / release(code), press(b) / up(b): held across frames (block = press(1) … up(1))
  const keys = new Set(), pk = new Set(), rk = new Set(), tapKeys = new Set();
  const btn = [false, false, false], pb = [false, false, false], rb = [false, false, false], tapBtn = [false, false, false];
  // keys go through the window first: a key the Lab's capture listener consumes never reaches Input
  const input = {
    enabled: true, anyPressed: false, wheel: 0, mouse: { ndcX: 0, ndcY: 0 },
    keys, pressedKeys: pk, releasedKeys: rk, buttons: btn, pressedButtons: pb, releasedButtons: rb,
    axis: { x: 0, y: 0 },
    down(c) { return this.enabled && keys.has(c); },
    pressed(c) { return this.enabled && pk.has(c); },
    released(c) { return this.enabled && rk.has(c); },
    mouseDown(b) { return this.enabled && btn[b]; },
    mousePressed(b) { return this.enabled && pb[b]; },
    mouseReleased(b) { return this.enabled && rb[b]; },
    moveAxis() { return this.enabled ? this.axis : { x: 0, y: 0 }; },
    tap(code) { if (keys.has(code) || fireWin('keydown', { code })) return; keys.add(code); pk.add(code); tapKeys.add(code); this.anyPressed = true; },
    hold(code) { if (keys.has(code) || fireWin('keydown', { code })) return; keys.add(code); pk.add(code); this.anyPressed = true; },
    release(code) { if (!keys.delete(code)) return; rk.add(code); fireWin('keyup', { code }); },
    click(b = 0) { if (btn[b]) return; btn[b] = true; pb[b] = true; tapBtn[b] = true; this.anyPressed = true; fireWin('pointerdown', { button: b }); },
    press(b) { if (btn[b]) return; btn[b] = true; pb[b] = true; this.anyPressed = true; fireWin('pointerdown', { button: b }); },
    up(b) { if (!btn[b]) return; btn[b] = false; rb[b] = true; },
    endFrame() {
      pk.clear(); rk.clear(); pb.fill(false); rb.fill(false);
      for (const c of tapKeys) { keys.delete(c); rk.add(c); }
      tapKeys.clear();
      for (let b = 0; b < 3; b++) if (tapBtn[b]) { tapBtn[b] = false; btn[b] = false; rb[b] = true; }
      this.anyPressed = false; this.wheel = 0;
    },
  };
  installActions(input, new Bindings(null)); // act / actPressed / actReleased (core/bindings.js), default bindings
  const colliders = new Colliders();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; colliders.add(Math.cos(a) * 19.5, Math.sin(a) * 19.5, 0.9, 'stone'); }
  const pushers = new Map();
  const finalU = { uHurt: { value: 0 }, uFade: { value: 0 }, uDesat: { value: 0 }, uWarm: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 1 } };
  const counters = { scorchReset: 0, burn: 0, spawns: 0 };
  // world mock: the world API (grass = instanced glyph strokes; no-op quality hook)
  const world = {
    colliders,
    bonfire: { ...CONFIG.world.bonfire }, nest: { x: -3, z: -15.5 },
    forest: { treeSpots: [], bonfire: { ...CONFIG.world.bonfire } },
    setGrassQuality() {},
    resolve: (pos, r, b) => colliders.resolve(pos, r, b),
    setPusher(slot, x, y, z, r) { if (![x, y, z, r].every(Number.isFinite)) throw new Error(`NaN pusher ${slot}`); pushers.set(slot, [x, y, z, r]); },
    clearPushers(a = 0, b = 10) { for (let i = a; i < b; i++) pushers.delete(i); },
    gust(x, z, s, r) { if (![x, z, s, r].every(Number.isFinite)) throw new Error('NaN gust'); },
    scorch: { burnCircle(x, z, r) { if (![x, z, r].every(Number.isFinite)) throw new Error('NaN scorch'); counters.burn++; }, reset() { counters.scorchReset++; }, heatAt: () => 0, burnAt: () => 0 },
    atmosphere: { bonfireLit: true, setBonfireLit(v) { this.bonfireLit = !!v; } },
    update(dt) { this.destructibles?.update(dt); },
  };
  const mkParticles = (opts) => {
    const p = new GlyphParticles(U, opts);
    const spawn = p.spawn.bind(p);
    p.spawn = (o) => {
      for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size']) if (o[k] !== undefined && !Number.isFinite(o[k])) throw new Error(`NaN particle ${k}`);
      counters.spawns++;
      return spawn(o);
    };
    return p;
  };
  // the fire field (render/fireField.js): the same NaN guard and spawn count as the glyph pools
  const mkFire = () => {
    const p = new FireField(U, { max: 6000 });
    const spawn = p.spawn.bind(p);
    p.spawn = (o) => {
      for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size', 'sizeEnd', 'heat', 'heatEnd']) if (o[k] !== undefined && !Number.isFinite(o[k])) throw new Error(`NaN fire blob ${k}`);
      counters.spawns++;
      return spawn(o);
    };
    return p;
  };
  // opts.realInput: the real core/input.js on a mock canvas (#game) — the touch scenario drives it
  // through the touch controls' pointer events instead of the mock above
  let canvasEl = null;
  if (opts.realInput) {
    canvasEl = new El('canvas');
    canvasEl.id = 'game';
    ui.parentNode.appendChild(canvasEl);
  }
  const game = {
    THREE, CONFIG, renderer: canvasEl ? { domElement: canvasEl } : null, scene, fxScene: new THREE.Scene(), camera,
    pipeline: { finalMat: { uniforms: finalU } }, U,
    events: new Events(), input: opts.realInput ? new Input(canvasEl) : input, cameraRig: new CameraRig(camera), lights: new LightPool(U),
    fx: { alpha: mkParticles({ max: 3000, additive: false }), add: mkParticles({ max: 7000, additive: true }), fire: mkFire() },
    time: 0, realTime: 0, timeScale: 1, debugTimeScale: 1, hitstopTimer: 0, hitstopScale: 1,
    mouseGround: new THREE.Vector3(), state: 'title', settings: { quality: CONFIG.defaultQuality, showFps: false },
    hitstop(seconds, scale = 0.04) { this.hitstopTimer = Math.max(this.hitstopTimer, seconds); this.hitstopScale = Math.min(this.hitstopScale, scale); },
    shake(a) { if (!Number.isFinite(a)) throw new Error('NaN shake'); this.cameraRig.addTrauma(a); },
    punch(m) { if (!Number.isFinite(m)) throw new Error('NaN punch'); this.cameraRig.punch(m); },
    kick(x, y, z, m) { if (!Number.isFinite(x + y + z + m)) throw new Error('NaN kick'); this.cameraRig.kick(x, y, z, m); },
    // the hero's outfit option (main.js reads `?heroLook=`; gear/looks.js): null = the default
    heroLook: opts.heroLook ?? null,
  };
  const G = { game, input: game.input, canvas: canvasEl, evLog: [], counts: {}, counters, finalU, logTimes: [], hits: [], watch: null, defend: null };
  // event log + payload contract check (a wrapper, not a subscriber: it must not count as a consumer)
  const emit = game.events.emit.bind(game.events);
  game.events.emit = (n, d) => {
    G.counts[n] = (G.counts[n] || 0) + 1;
    const schema = PAYLOAD[n];
    if (schema) for (const k in schema) if (!typeOk(schema[k], d?.[k])) payloadErrors.add(`${n}.${k}=${JSON.stringify(d?.[k])}`);
    if (!/footstep|step|wingFlap|hurt|hitDragon|attack|windup|fireball|explosion|roll|dodge|posture$/.test(n) || n === 'dragon:hurt') G.evLog.push(`${game.time.toFixed(1)} ${n}${d && n === 'state' ? ' ' + d.from + '->' + d.to : ''}`);
    G.watch?.(n, d);
    if (process.env.ABYSS_TRACE && game.player && game.dragon && /combat:|player:(parry|block|perfectDodge|dodge|roll|guardBreak|hurt)|dragon:(parried|windup|phase2)/.test(n)) {
      out('     TRACE', game.time.toFixed(3), n, JSON.stringify(d ?? null).slice(0, 120), 'p', game.player.state, game.player.stateT.toFixed(2), 'dist', Math.hypot(game.player.position.x - game.dragon.position.x, game.player.position.z - game.dragon.position.z).toFixed(2));
    }
    G.defend?.onEvent(n, d);
    emit(n, d);
  };
  // construction order = main.js: world, audio, player, dragon, hud, gamepad, touch, flow, lab
  game.world = world;
  if (opts.terrain) addTerrain(game, world, opts.terrain); // pieces to lift and throw (scenarios TERRAIN, LAB)
  game.audio = new AudioEngine(game);
  game.player = new Player(game);
  game.dragon = new Dragon(game);
  game.hud = new Hud(game);
  game.gamepad = new GamepadControls(game); // inert without navigator.getGamepads (the pad scenario fakes one)
  game.touch = new TouchControls(game); // inert until a touch (no coarse pointer headless)
  game.flow = new GameFlow(game);
  game.lab = new Lab(game);
  game.applyQuality = () => {};
  const hudLog = game.hud.log.bind(game.hud);
  game.hud.log = (t, ch) => { G.logTimes.push([game.realTime, String(t)]); return hudLog(t, ch); };
  // record every hit resolution (the dragon calls game.player.takeHit)
  const takeHit = game.player.takeHit.bind(game.player);
  game.player.takeHit = (h) => {
    const hp0 = game.player.hp;
    const r = takeHit(h);
    G.hits.push({ t: game.time, r, attack: h?.attack, tell: h?.tell, damage: h?.damage, kind: h?.kind, hp0, hp1: game.player.hp, fx: h?.from?.x, fz: h?.from?.z });
    return r;
  };
  game.cameraRig.snap(game.player.position);

  // ---- main.js frame (verbatim order)
  const focus = new THREE.Vector3(), lock = new THREE.Vector3();
  const updateCameraFocus = (dt) => {
    const p = game.player.position;
    focus.copy(p);
    const d = game.dragon;
    let zoomOut = 0;
    if (game.player.lockOn && d && d.isTargetable?.()) {
      d.lockPoint(lock);
      focus.x = p.x + (lock.x - p.x) * 0.38;
      focus.z = p.z + (lock.z - p.z) * 0.38;
      zoomOut = clamp(Math.hypot(lock.x - p.x, lock.z - p.z) * 0.35 - 2, 0, 12);
    }
    if (game.flow.cameraOverride) {
      const o = game.flow.cameraOverride;
      if (!(o.focus?.isVector3) || !Number.isFinite(o.weight) || !Number.isFinite(o.zoom ?? 0)) throw new Error('bad cameraOverride');
      focus.lerp(o.focus, o.weight);
      zoomOut = Math.max(zoomOut, o.zoom ?? 0);
    }
    game.cameraRig.extraZoom = damp(game.cameraRig.extraZoom, zoomOut, 2.5, dt);
    game.cameraRig.update(dt, focus);
  };
  const errorCounts = new Map();
  const safe = (name, fn) => {
    try { fn(); } catch (err) {
      const n = (errorCounts.get(name) ?? 0) + 1;
      errorCounts.set(name, n);
      if (n <= 3) console.error(`[${name}] update failed`, err);
    }
  };
  G.errorCounts = errorCounts;
  G.tick = (realDt) => {
    let scale = game.timeScale;
    if (game.hitstopTimer > 0) { game.hitstopTimer -= realDt; scale *= game.hitstopScale; if (game.hitstopTimer <= 0) game.hitstopScale = 1; }
    const dt = realDt * scale * (game.debugTimeScale ?? 1);
    game.realTime += realDt;
    game.time += dt;
    game.dt = dt;
    game.realDt = realDt;
    if (AUDIO.ctx) AUDIO.ctx.currentTime += realDt;
    safe('gamepad', () => game.gamepad.update(realDt));
    safe('touch', () => game.touch.update(realDt));
    safe('lab', () => game.lab.update(realDt));
    safe('flow', () => game.flow.update(dt, realDt));
    safe('player', () => game.player.update(dt));
    safe('dragon', () => game.dragon.update(dt));
    safe('lab', () => game.lab.postUpdate?.()); // hitbox overlay matches this frame
    safe('camera', () => updateCameraFocus(realDt));
    safe('world', () => game.world.update(dt));
    game.lights.update(dt, game.player.position);
    game.fx.alpha.update(dt, game.time);
    game.fx.add.update(dt, game.time);
    game.fx.fire.update(dt);
    safe('hud', () => game.hud.update(realDt));
    safe('audio', () => game.audio.update(realDt));
    safe('lab', () => game.lab.postRender?.()); // (main.js: after pipeline.render; nothing is drawn here)
    game.input.endFrame();
    // NaN sentinels
    const p = game.player, d = game.dragon;
    if (![p.position.x, p.position.z, p.hp, p.yaw, p.critTimer].every(Number.isFinite)) throw new Error('player NaN');
    if (![d.position.x, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture].every(Number.isFinite)) throw new Error('dragon NaN');
    for (const h of d.hurtSpheres) if (![h.x, h.y, h.z, h.r].every(Number.isFinite)) throw new Error('hurtSphere NaN');
    for (const k of ['uHurt', 'uFade', 'uDesat', 'uWarm']) if (!Number.isFinite(finalU[k].value)) throw new Error('grade NaN ' + k);
    if (![game.timeScale, game.time, game.debugTimeScale].every(Number.isFinite)) throw new Error('clock NaN');
  };
  return G;
}

const DT = 1 / 60;
// s between clicks that walks the light chain hit by hit: each click lands in the recovery of the hit
// before it, after its chain window opens (combat.js `chain`) and before the attack ends
const CHAIN_EVERY = 0.36;
const cls = (c) => ui.find((e) => e.classList?.contains(c));
const aimAt = (G) => { const d = G.game.dragon; G.game.mouseGround.set(d.position.x, 0, d.position.z); };
// the move stick pushed toward the wyrm (the stick is world-fixed: x = east, y = north = −z)
const toward = (G) => { const d = G.game.dragon, p = G.game.player, x = d.position.x - p.position.x, z = d.position.z - p.position.z, l = Math.hypot(x, z) || 1; return { x: x / l, y: -z / l }; };

// ---- defender: answers tells like a player would (timed from combat:tell, re-timed by combat:flash)
//   blue / normal → tap RMB 0.12 s before impact (parry) · red → Space 0.1 s before impact (Ghostep)
//   streams that cannot be parried (breath) → hold the guard through them
//   act() returns true while an answer is due (the bot holds its swings)
// style (the STRATEGY measurement): 'mixed' = the above; 'dodge' = a perfect dodge of every tell, never a
// parry; 'parry' = parries, and a red blow rolled early (i-frames, outside the perfect window)
function makeDefender(G, { skill = 1, style = 'mixed' } = {}) {
  const pend = [];
  const stats = { tells: 0, parryTry: 0, dodgeTry: 0, blockTry: 0 };
  const lead = TUNING.flashLead;
  let blockUntil = -1;
  return {
    stats,
    onEvent(n, d) {
      const t = G.game.time;
      if (n === 'combat:tell' && Number.isFinite(d?.impactIn)) {
        stats.tells++;
        // skill < 1 (the probe): some tells are simply not read (no answer at all)
        const miss = skill < 1 && Math.random() > skill;
        pend.push({ attack: d.attack, tell: d.tell, at: t + d.impactIn, done: miss, stream: d.attack === 'breath' });
      } else if (n === 'combat:flash') {
        // the flash is the authoritative timing cue: re-time the matching pending impact
        let best = null;
        for (const e of pend) if (!e.done && e.attack === d.attack && (!best || Math.abs(e.at - t - lead) < Math.abs(best.at - t - lead))) best = e;
        if (best && Math.abs(best.at - t - lead) < 0.6) best.at = t + lead;
      }
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.5) pend.splice(i, 1);
      for (const e of pend) {
        const left = e.at - t - DT;
        if (e.stream) {
          if (left <= 0.3) { e.done = true; blockUntil = t + 2.6; input.press(1); stats.blockTry++; }
        } else if (e.tell === TELL.RED || e.tell === TELL.BLACK || style === 'dodge') {
          if (left <= (style === 'parry' ? 0.3 : 0.1)) {
            e.done = true;
            const d = g.dragon.position, p = g.player.position;
            const dx = d.x - p.x, dz = d.z - p.z, l = Math.hypot(dx, dz) || 1;
            input.axis = { x: dx / l, y: -dz / l };
            input.tap('Space');
            stats.dodgeTry++;
          }
        } else if (left <= 0.12) {
          e.done = true;
          input.up(1);
          input.click(1);
          stats.parryTry++;
        }
      }
      if (blockUntil > 0 && t > blockUntil) { blockUntil = -1; input.up(1); }
      // like a player who sees the tell: stop swinging while an answer is due (a swing can't be rolled out of)
      let busy = blockUntil > 0;
      for (const e of pend) if (!e.done && e.at - t < 0.9) busy = true;
      return busy;
    },
  };
}

// ---- bot: walks to the dragon, locks on, swings, answers tells (defend), heals when low
function bot(G, opts = {}) {
  const { attack = true, god = false } = opts;
  const { game, input } = G;
  const p = game.player, d = game.dragon;
  const st = game.state;
  input.axis = { x: 0, y: 0 };
  if (god && p.alive) p.hp = p.maxHp;
  if (opts.passive || (st !== 'explore' && st !== 'bossIntro' && st !== 'boss')) return;
  const tgt = new THREE.Vector3();
  d.lockPoint(tgt);
  game.mouseGround.set(tgt.x, 0, tgt.z);
  const dx = tgt.x - p.position.x, dz = tgt.z - p.position.z;
  const dist = Math.hypot(dx, dz);
  if (st === 'boss' && !p.lockOn && d.isTargetable() && (game.time * 10 | 0) % 20 === 0) input.tap('Tab');
  // a defending bot fences like a player reading tells (~5 m from the chest joint, ~6.5 m from the
  // root: still in sword reach, in the claw / bite strings' band); the others walk right up to it
  if (dist > (opts.defend ? 5.0 : 3.2)) input.axis = { x: dx / dist, y: -dz / dist };
  const guarding = opts.defend && G.defend ? G.defend.act() : false;
  // a defending bot pokes once a second and presses its advantage in openings (crit window, broken
  // posture, parry recoil) — a longer fight that meets more of the AI's attacks
  const opening = p.critTimer > 0 || d.broken || d.brain?.action?.name === 'recoil';
  const cadence = opts.defend && !opening ? 60 : 24;
  if (st === 'boss' && attack && !guarding && dist < 5 && (game.realTime * 60 | 0) % cadence === 0) input.click(0);
  if (!opts.defend && st === 'boss' && attack && d.brain?.action?.name === 'breath' && (game.realTime * 60 | 0) % 30 === 0) {
    input.axis = { x: 1, y: 0 };
    input.tap('Space');
  }
  if (!god && p.hp < 40 && p.flasks > 0 && (game.realTime * 60 | 0) % 40 === 0) input.tap('KeyF');
}

function run(G, seconds, opts, until) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    bot(G, opts);
    G.tick(DT);
    if (until && until()) return true;
  }
  return false;
}

/** Title → boss through the Lab's flow jump; the dragon's AI is switched off for scripted tests. */
function fightSetup(G, { ai = false } = {}) {
  const { game } = G;
  run(G, 0.3);
  assert(game.flow.debug.toState('boss') === true, 'flow.debug.toState(boss) from title');
  if (!ai) game.dragon.debug.setAI(false);
  run(G, 0.6, { passive: true });
}

/** Wait until the dragon stands idle in combat and the player can act again. */
function settle(G, max = 8) {
  const { game } = G;
  const d = game.dragon, p = game.player;
  return run(G, max, { passive: true }, () => !d.brain.action && d.state === 'combat' && (p.state === 'idle' || p.state === 'run') && game.hitstopTimer <= 0);
}

/** Player at `dist` m from the dragon root, `ang` rad off its facing, looking at it; full HP. */
function place(G, dist, ang = 0) {
  const { game } = G;
  const d = game.dragon, p = game.player;
  const a = d.yaw + ang;
  dist *= SIZE;
  p.debug.teleport(d.position.x + Math.sin(a) * dist, d.position.z + Math.cos(a) * dist);
  p.yaw = Math.atan2(d.position.x - p.position.x, d.position.z - p.position.z);
  p.debug.heal();
  aimAt(G);
}

/**
 * Force `name` through the Lab and answer it: plan.answer ∈ parry | dodge | mash | early | late | none,
 * plan.hold = hold RMB (block) throughout. Timing is taken from the attack's own combat:tell (impactIn)
 * and re-timed by combat:flash, like a player reacting to the tell. Returns the record.
 */
function forceAttack(G, name, plan = {}) {
  const { game, input } = G;
  const rec = { name, tell: null, impactIn: null, tellT: null, impactT: null, flashT: null, res: null, hit: null, hp0: game.player.hp, posture0: game.dragon.posture, ev: {}, tells: [] };
  const c0 = { ...G.counts };
  G.watch = (n, d) => {
    if (n === 'combat:tell' && d?.attack === name) rec.tells.push(d.tell);
    if (n === 'combat:tell' && d?.attack === name && rec.tellT === null) {
      rec.tellT = game.time; rec.impactIn = d.impactIn; rec.impactT = game.time + d.impactIn; rec.tell = d.tell;
    } else if (n === 'combat:flash' && d?.attack === name && rec.flashT === null && rec.tellT !== null) {
      rec.flashT = game.time; rec.impactT = game.time + TUNING.flashLead;
    }
    if (n === 'player:ghostep') rec.ghost = { px: game.player.position.x, pz: game.player.position.z, dx: game.dragon.position.x, dz: game.dragon.position.z, dyaw: game.dragon.yaw };
  };
  const h0 = G.hits.length;
  if (plan.hold) input.press(1);
  run(G, 0.15, { passive: true });
  rec.trigger = game.lab.trigger(name);
  let acted = 0, after = -1;
  const mash = [-0.45, -0.35, -0.25, -0.15, -0.05];
  for (let i = 0; i < Math.round((plan.max ?? 5) / DT); i++) {
    aimAt(G);
    input.axis = { x: 0, y: 0 };
    if (rec.impactT !== null) {
      const left = rec.impactT - game.time - DT;
      if (plan.answer === 'parry' && !acted && left <= 0.12) { acted = 1; input.click(1); rec.pressLead = left; }
      if (plan.answer === 'early' && !acted && left <= 0.45) { acted = 1; input.click(1); rec.pressLead = left; }
      if (plan.answer === 'late' && !acted && left <= -0.06) { acted = 1; input.click(1); rec.pressLead = left; }
      if (plan.answer === 'mash' && acted < mash.length && left <= -mash[acted]) { acted++; input.click(1); }
      if (plan.answer === 'dodge' && !acted && left <= 0.1) {
        acted = 1;
        const d = game.dragon.position, p = game.player.position;
        const dx = d.x - p.x, dz = d.z - p.z, l = Math.hypot(dx, dz) || 1;
        input.axis = { x: dx / l, y: -dz / l };
        input.tap('Space');
        rec.pressLead = left;
      }
    }
    G.tick(DT);
    if (rec.res === null) {
      const h = G.hits.slice(h0).find((x) => x.attack === name);
      if (h) { rec.res = h.r; rec.hit = h; rec.hitT = h.t; after = 0; rec.postureAtHit = game.dragon.posture; rec.hpAtHit = game.player.hp; }
    } else if (++after > (plan.settle ?? 6)) break;
  }
  if (plan.hold) input.up(1);
  for (const k in G.counts) rec.ev[k] = G.counts[k] - (c0[k] || 0);
  G.watch = null;
  return rec;
}
const evn = (rec, n) => rec.ev[n] || 0;

/**
 * Force `name` (player left where it is) and sample, every frame: dragon.warn, whether every
 * material's uWarn.w matches it, and the HUD's red edge opacity. tellI / flashI = first sample
 * after the attack's combat:tell / combat:flash. `stop(tr)` ends the trace early.
 */
function warnTrace(G, name, seconds, stop = null) {
  const { game } = G;
  const d = game.dragon, mats = Object.values(d.model.mats);
  const tr = { trigger: false, tellI: -1, flashI: -1, w: [], edge: [], uniformOk: true, finite: true };
  let told = false, flashed = false;
  G.watch = (n, dd) => {
    if (dd?.attack !== name) return;
    if (n === 'combat:tell') told = true;
    if (n === 'combat:flash') flashed = true;
  };
  tr.trigger = game.lab.trigger(name);
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    G.tick(DT);
    if (told && tr.tellI < 0) tr.tellI = i;
    if (flashed && tr.flashI < 0) tr.flashI = i;
    tr.w.push(d.warn);
    tr.edge.push(Number(cls('ab-edge')?.style.opacity ?? 0) || 0);
    if (!Number.isFinite(d.warn)) tr.finite = false;
    if (!mats.every((m) => m.uniforms.uWarn?.value?.w === d.warn)) tr.uniformOk = false;
    if (stop?.(tr)) break;
  }
  G.watch = null;
  return tr;
}

// ================================================================== scenario: pressure (the director's meter)
// A god-mode defender (answers every tell without punishing it: steadyDefender; never swings) against the live AI for `secs` s in each
// phase, the wyrm's HP pinned inside the phase. Per phase: cues (combat:flash from the wyrm) per
// minute, the mean and the longest gap between cues, the share of each move category, chains started
// (combo links), ambient fire, time airborne, time with fire on the field, the least safe ground the
// hero had (free spots of 17 within a roll of him that no blast due within 0.6 s, a roll, covers), and pairs of blows
// needing different answers (dodge vs parry / block) landing within 0.3 s of each other. Seeds: three
// (ABYSS_PSEEDS=a,b,c; ABYSS_PSECS=s per phase). It asserts the ramp (each phase busier than the
// last), a longest gap under a stated maximum, and that every category a phase has is seen.
// The meter's defender: a player who survives without punishing (the measure of the wyrm's own
// pressure: a parried last blow recoils it and a perfect dodge plunges onto its head, both cut a chain
// short). Blue / normal: the guard held through the impact (a stream: held through it); red / black: a
// roll 0.28 s before impact (inside its i-frames, outside the perfect-dodge window), across the line
// to the wyrm.
function steadyDefender(G) {
  const pend = [];
  const stats = { tells: 0, rolls: 0, guards: 0 };
  const lead = TUNING.flashLead;
  let guardUntil = -1;
  return {
    stats,
    onEvent(n, d) {
      const t = G.game.time;
      if (n === 'combat:tell' && Number.isFinite(d?.impactIn)) {
        stats.tells++;
        pend.push({ attack: d.attack, tell: d.tell, at: t + d.impactIn, done: false, stream: d.attack === 'breath' });
      } else if (n === 'combat:flash') {
        let best = null;
        for (const e of pend) if (!e.done && e.attack === d.attack && (!best || Math.abs(e.at - t - lead) < Math.abs(best.at - t - lead))) best = e;
        if (best && Math.abs(best.at - t - lead) < 0.6) best.at = t + lead;
      }
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.5) pend.splice(i, 1);
      for (const e of pend) {
        const left = e.at - t - DT;
        if (e.tell === TELL.RED || e.tell === TELL.BLACK) {
          if (left <= 0.28) {
            e.done = true;
            input.up(1);
            guardUntil = -1;
            const dd = g.dragon.position, p = g.player.position;
            const dx = p.x - dd.x, dz = p.z - dd.z, l = Math.hypot(dx, dz) || 1;
            input.axis = { x: -dz / l, y: -dx / l };
            input.tap('Space');
            stats.rolls++;
          }
        } else if (left <= 0.25) {
          e.done = true;
          guardUntil = Math.max(guardUntil, t + left + (e.stream ? 2.6 : 0.2));
          stats.guards++;
        }
      }
      if (guardUntil > t) input.press(1);
      else if (guardUntil > 0) { guardUntil = -1; input.up(1); }
      return guardUntil > t;
    },
  };
}

async function scenarioPressure() {
  out('\n== scenario PRESSURE (defender bot in god mode vs the AI, per phase: cues, gaps, mix, chains, fire) ==');
  const aiMod = await imp('src/entities/dragon/ai.js');
  const P = TUNING.pressure ?? null;
  const SECS = Number(process.env.ABYSS_PSECS ?? 120);
  const SEEDS = (process.env.ABYSS_PSEEDS ?? '1337,7,4242').split(',').map(Number).filter(Number.isFinite);
  const ROLL = TUNE_P.roll?.dist ?? 4.2;
  // the director's own categories when it has them (a build without it: a plain derivation, for the
  // "before" numbers only)
  const catOf = aiMod.categoryOf ?? ((name) => {
    const spec = TUNING.attacks[name] ?? {};
    if (spec.category) return spec.category;
    if (/^(hurl|tailBat|fireBrand)$/.test(name)) return 'terrain';
    if (/^(skyStrafe|diveBomb|hoverBarrage|leap)$/.test(name)) return 'flight';
    if (/^(meteorRain|eruptions|flameRing|flameWall|nova|roar)$/.test(name)) return 'spell';
    if (/^(emberStorm|fanVolley|wispSwarm|fireWheel|breath|fireball)$/.test(name)) return 'fire';
    const kinds = (spec.hits ?? []).map((h) => h.kind);
    if (name === 'tail' || kinds.some((k) => /^tail/.test(k))) return 'tail';
    if (kinds.some((k) => k === 'wing')) return 'wing';
    return 'melee';
  });
  const perPhase = (v, ph) => (Array.isArray(v) ? v[Math.min(v.length, ph) - 1] : v);
  const answerOf = (tell) => (tell === TELL.RED || tell === TELL.BLACK ? 'dodge' : 'guard');
  // combo links for the attacks that exist today (the data the director reads; their tuning belongs
  // to the agents of those attacks: injected here, put back after)
  const C = (a, b, c) => [a, b, c];
  const LINKS = {
    swipe: [{ to: 'tail', when: 'behind', chance: C(0.5, 0.7, 0.9) }, { to: 'bite', when: 'front', chance: C(0.3, 0.5, 0.7) }],
    bite: [{ to: 'swipe', when: 'side', chance: C(0.3, 0.5, 0.7) }, { to: 'stomp', when: 'near', chance: C(0, 0.3, 0.5) }],
    clawCombo: [{ to: 'tail', when: 'behind', chance: C(0.5, 0.7, 0.9) }, { to: 'wingBuffet', when: 'mid', chance: C(0.3, 0.5, 0.7) }, { to: 'hesitantMaw', when: 'front', chance: C(0, 0.3, 0.5) }],
    rendingFlurry: [{ to: 'tail', when: 'behind', chance: C(0.5, 0.7, 0.9) }, { to: 'wingBuffet', when: 'mid', chance: C(0.3, 0.5, 0.7) }, { to: 'fanVolley', when: 'far', chance: C(0.2, 0.4, 0.6) }],
    stormFlurry: [{ to: 'tail', when: 'behind', chance: C(0.5, 0.7, 0.9) }, { to: 'stomp', when: 'near', chance: C(0, 0.3, 0.5) }],
    hesitantMaw: [{ to: 'swipe', when: 'side', chance: C(0.4, 0.6, 0.8) }, { to: 'charge', when: 'far', chance: C(0.2, 0.4, 0.6) }],
    wingBuffet: [{ to: 'tail', when: 'behind', chance: C(0.4, 0.6, 0.8) }, { to: 'pounce', when: 'mid', chance: C(0, 0.5, 0.7) }, { to: 'fanVolley', when: 'far', chance: C(0.3, 0.5, 0.7) }],
    tail: [{ to: 'clawCombo', when: 'front', chance: C(0.3, 0.5, 0.7) }, { to: 'wingBuffet', when: 'mid', chance: C(0.3, 0.5, 0.7) }, { to: 'hurl', when: 'far', chance: C(0.2, 0.4, 0.6) }],
    tailLash: [{ to: 'pounce', when: 'mid', chance: C(0, 0.4, 0.6) }, { to: 'eruptions', when: 'far', chance: C(0, 0.3, 0.5) }],
    pounce: [{ to: 'tail', when: 'behind', chance: C(0, 0.6, 0.8) }, { to: 'clawCombo', when: 'front', chance: C(0, 0.4, 0.6) }],
    stomp: [{ to: 'tail', when: 'behind', chance: C(0.4, 0.6, 0.8) }, { to: 'wingBuffet', when: 'mid', chance: C(0.3, 0.5, 0.7) }],
    charge: [{ to: 'tail', when: 'behind', chance: C(0.4, 0.6, 0.8) }, { to: 'clawCombo', when: 'front', chance: C(0.3, 0.5, 0.7) }],
    hurl: [{ to: 'charge', when: 'far', chance: C(0.2, 0.4, 0.6) }, { to: 'fanVolley', when: 'mid', chance: C(0.2, 0.4, 0.6) }],
    tailBat: [{ to: 'hurl', when: 'far', chance: C(0, 0.3, 0.5) }, { to: 'clawCombo', when: 'front', chance: C(0.3, 0.5, 0.7) }],
    skyStrafe: [{ to: 'tail', when: 'behind', chance: C(0.3, 0.5, 0.7) }, { to: 'fanVolley', when: 'far', chance: C(0.3, 0.5, 0.7) }],
    diveBomb: [{ to: 'stomp', when: 'near', chance: C(0, 0.5, 0.7) }, { to: 'tail', when: 'behind', chance: C(0, 0.5, 0.7) }],
    fanVolley: [{ to: 'charge', when: 'far', chance: C(0.2, 0.4, 0.6) }, { to: 'clawCombo', when: 'front', chance: C(0.2, 0.4, 0.6) }],
    breath: [{ to: 'tail', when: 'behind', chance: C(0.4, 0.6, 0.8) }],
    emberStorm: [{ to: 'charge', when: 'far', chance: C(0.2, 0.4, 0.6) }, { to: 'stomp', when: 'near', chance: C(0.2, 0.4, 0.6) }],
    wispSwarm: [{ to: 'clawCombo', when: 'front', chance: C(0, 0.5, 0.7) }, { to: 'wingBuffet', when: 'mid', chance: C(0, 0.5, 0.7) }],
    fireWheel: [{ to: 'pounce', when: 'mid', chance: C(0, 0.4, 0.6) }, { to: 'stomp', when: 'near', chance: C(0, 0.4, 0.6) }],
    hoverBarrage: [{ to: 'tail', when: 'behind', chance: C(0, 0.5, 0.7) }, { to: 'stomp', when: 'near', chance: C(0, 0.5, 0.7) }],
    meteorRain: [{ to: 'tail', when: 'behind', chance: C(0, 0.6, 0.8) }, { to: 'charge', when: 'far', chance: C(0, 0.4, 0.6) }],
    eruptions: [{ to: 'pounce', when: 'mid', chance: C(0, 0.5, 0.7) }, { to: 'tail', when: 'behind', chance: C(0, 0.5, 0.7) }],
    flameRing: [{ to: 'charge', when: 'far', chance: C(0, 0.4, 0.6) }, { to: 'leap', when: 'mid', chance: C(0, 0.3, 0.5) }],
    flameWall: [{ to: 'tail', when: 'behind', chance: C(0, 0, 0.7) }, { to: 'charge', when: 'far', chance: C(0, 0, 0.5) }],
    nova: [{ to: 'leap', when: 'far', chance: C(0, 0, 0.6) }],
    fireBrand: [{ to: 'charge', when: 'far', chance: C(0, 0.3, 0.5) }, { to: 'clawCombo', when: 'front', chance: C(0, 0.4, 0.6) }],
  };
  // ---- the link reader, white-box: bite -> stomp -> bite ... (cooldowns cleared every frame)
  {
    const P0 = TUNING.pressure;
    const keep = { bite: TUNING.attacks.bite.links, stomp: TUNING.attacks.stomp.links };
    TUNING.attacks.bite.links = [{ to: 'stomp', when: 'any', chance: 1 }];
    TUNING.attacks.stomp.links = [{ to: 'bite', when: 'any', chance: 1 }];
    const linkRun = (style) => {
      const G = build();
      const { game } = G;
      G.defend = style === 'parry' ? makeDefender(G) : steadyDefender(G);
      fightSetup(G, { ai: true });
      const d = game.dragon;
      place(G, 4.2, 0);
      d.brain.cooldowns = {};
      d.brain.idleTimer = 99;
      const starts = [], ends = [];
      G.watch = (n, e) => { if (n === 'dragon:windup') starts.push([game.time, e.name]); };
      d.brain.startAction(ATTACKS.bite);
      let last = 'bite';
      for (let i = 0; i < Math.round(9 / DT); i++) {
        bot(G, { god: true, defend: true, attack: false });
        G.input.axis = { x: 0, y: 0 };
        G.tick(DT);
        for (const k in d.brain.cooldowns) d.brain.cooldowns[k] = 0;
        const now = d.brain.action?.name ?? 'idle';
        if (now !== last) { ends.push([game.time, last, now]); last = now; }
      }
      G.watch = null;
      return { starts, ends, d };
    };
    // a block answers every blow: each move ends on its own and links into the next, chainDepth
    // links in a row, then the breather (chainRest) before a fresh pick
    const A = linkRun('steady');
    const depth = P0.chainDepth[0];
    const seq = A.starts.map((x) => x[1]);
    const gapsAfter = [];
    for (let i = 1; i < A.starts.length; i++) {
      const endPrev = A.ends.find((e) => e[1] === A.starts[i - 1][1] && e[0] <= A.starts[i][0] + 1e-6 && e[0] >= A.starts[i - 1][0]);
      gapsAfter.push(endPrev ? A.starts[i][0] - endPrev[0] : NaN);
    }
    out(`   links (block): ${seq.join(' > ')} · gaps ${gapsAfter.map((g) => g.toFixed(2)).join(', ')} s`);
    assert(seq[0] === 'bite' && seq[1] === 'stomp' && seq[2] === 'bite', `a move that ends on its own starts its link (${seq.slice(0, 3).join(' > ')})`);
    assert(gapsAfter.slice(0, depth).every((g) => g < 0.05), `with no pause (${gapsAfter.slice(0, depth).map((g) => g.toFixed(2)).join(', ')} s)`);
    assert(gapsAfter[depth] >= P0.chainRest[0][0] - 0.05, `after ${depth} links (P1 chainDepth) a breather of chainRest >= ${P0.chainRest[0][0]} s (${gapsAfter[depth]?.toFixed(2)} s)`);
    // a parry of the bite (its last blow) recoils it: no link, and the hero's opening is the old pause
    const B = linkRun('parry');
    const rec = B.ends.find((e) => e[2] === 'recoil');
    const after = rec ? B.starts.find((s) => s[0] > rec[0]) : null;
    const recEnd = rec ? B.ends.find((e) => e[1] === 'recoil' && e[0] > rec[0]) : null;
    out(`   links (parry): ${B.starts.map((x) => x[1]).join(' > ')} · recoil at ${rec?.[0].toFixed(2)}, next move ${after?.[1]} ${after && recEnd ? (after[0] - recEnd[0]).toFixed(2) + ' s after it' : ''}`);
    assert(!!rec && (!after || (recEnd && after[0] - recEnd[0] >= P0.openingGap[0][0] - 0.05)), `a parried (recoiled) move does not link: the opening keeps the old pause >= ${P0.openingGap[0][0]} s`);
    TUNING.attacks.bite.links = keep.bite;
    TUNING.attacks.stomp.links = keep.stomp;
  }

  const linksBefore = {};
  for (const k in LINKS) if (TUNING.attacks[k]) { linksBefore[k] = TUNING.attacks[k].links; TUNING.attacks[k].links = LINKS[k]; }
  const rows = [];
  const pinAt = [0.83, 0.5, 0.17];
  let lastG = null;
  for (const seed of SEEDS) {
    for (let ph = 1; ph <= 3; ph++) {
      // (the Lab's grid of trees and boulders: a piece in reach wherever it stands, for the terrain moves)
      const G = (lastG = build({ terrain: 'lab' }));
      const { game } = G;
      G.defend = steadyDefender(G);
      fightSetup(G, { ai: true });
      const d = game.dragon;
      Math.random = mulberry32(seed * 7 + ph);
      // into the phase through its real transition roar(s)
      for (let n = 2; n <= ph; n++) {
        d.debug.setHp(TUNING.phaseAt[n - 1] - 0.01);
        run(G, 12, { god: true, defend: true, attack: false }, () => d.phase === n && d.brain.action?.name !== `phase${n}`);
      }
      const pin = Math.round(d.maxHp * pinAt[ph - 1]);
      const flashes = [], tellsOf = {}, cats = {}, winds = [], dbgLog = [];
      let safeAt = '';
      let air = 0, fire = 0, idle = 0, frames = 0, minSafe = 99, minSky = 99, safeLow = 0, hurt = 0;
      const chains0 = d.brain.stats?.links ?? 0, amb0 = d.brain.stats?.ambient ?? 0;
      G.watch = (n, e) => {
        if (n === 'combat:flash' && e?.source === 'dragon') flashes.push([game.time, e.tell, e.attack]);
        if (n === 'dragon:windup') { winds.push([game.time, e.name]); const c = catOf(e.name); cats[c] = (cats[c] || 0) + 1; tellsOf[e.name] = (tellsOf[e.name] || 0) + 1; }
        if (n === 'player:hurt') hurt++;
        if (process.env.ABYSS_PDBG && /dragon:windup|combat:flash|combat:tell|dragon:takeoff|dragon:land/.test(n)) dbgLog.push([game.time, `${n.split(':')[1]} ${e?.name ?? e?.attack ?? ''}${n === 'combat:tell' ? ` ${e.tell} in ${e.impactIn?.toFixed(2)}` : ''} [${d.brain.action?.name ?? 'idle'} ${d.brain.action?.phase ?? ''} amb${d.brain.stats.ambient} dist ${d.sense.dist.toFixed(1)}]`]);
      };
      const H = d.hazards.list;
      const pr = game.player.radius ?? 0.45;
      const covered = (x, z) => {
        for (const h of H) {
          if (!h.alive) continue;
          if (h.shape === 0) { // a circle that has not gone off yet, or is still hitting
            const left = h.impact - h.t;
            if (left < 0.6 && h.t - h.impact < h.active && Math.hypot(x - h.x, z - h.z) <= h.r + pr) return true;
          }
        }
        return false;
      };
      // the hero roams like a player: every 5 s a new standoff (6, 10 or 15 m from the root) on a
      // bearing near his own; the defender's rolls keep their own direction
      const roam = mulberry32(seed * 31 + ph), goal = { r: 6, a: 0, until: -1 };
      const t0 = game.time;
      for (let i = 0; i < Math.round(SECS / DT); i++) {
        bot(G, { god: true, defend: true, attack: false });
        if (game.time > goal.until) {
          const p = game.player.position;
          goal.r = [6, 10, 15][Math.floor(roam() * 3)];
          goal.a = Math.atan2(p.x - d.position.x, p.z - d.position.z) + (roam() - 0.5) * 1.4;
          goal.until = game.time + 5;
        }
        if (!G.input.pressedKeys.has('Space') && game.player.state !== 'roll') {
          const p = game.player.position, b = goal.a;
          const gx = d.position.x + Math.sin(b) * goal.r, gz = d.position.z + Math.cos(b) * goal.r;
          const k = Math.hypot(gx, gz) > 24 ? 24 / Math.hypot(gx, gz) : 1;
          const dx = gx * k - p.x, dz = gz * k - p.z, l = Math.hypot(dx, dz);
          G.input.axis = l > 1 ? { x: dx / l, y: -dz / l } : { x: 0, y: 0 };
        }
        G.tick(DT);
        if (d.hp < pin) d.hp = pin;
        if (d.brain.pendingPhase > ph) d.brain.pendingPhase = 0;
        frames++;
        if (d.state === 'airborne') air++;
        if (!d.brain.action) idle++;
        if (d.hazards.alive > 0 || d.bullets.count(0) + d.bullets.count(1) + d.bullets.count(2) > 0) fire++;
        if (i % 15 === 0) {
          const p = game.player.position;
          let free = covered(p.x, p.z) ? 0 : 1;
          for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; if (!covered(p.x + Math.cos(a) * ROLL, p.z + Math.sin(a) * ROLL)) free++; }
          // (Armageddon's barrage is apart: its meteors heat their ground 1.2 - 1.5 s ahead, a run
          // away, not a roll; it is measured and printed, not asserted here)
          if (H.some((h) => h.alive && h.shape === 7)) minSky = Math.min(minSky, free);
          else {
            if (free < minSafe) safeAt = [...new Set(H.filter((h) => h.alive && h.shape === 0 && h.impact - h.t < 0.6).map((h) => h.attack))].join('+');
            minSafe = Math.min(minSafe, free);
          }
          if (free < 4) safeLow++;
        }
      }
      G.watch = null;
      const T = game.time - t0;
      let gapMax = 0, gapSum = 0, conflicts = 0, inner = 0, gapAt = '';
      const conflictAt = [], innerAt = [];
      const ts = [t0, ...flashes.map((f) => f[0]), t0 + T];
      for (let i = 1; i < ts.length; i++) {
        const g = ts[i] - ts[i - 1];
        gapSum += g;
        if (g > gapMax && process.env.ABYSS_PDBG) { out(`      gap ${g.toFixed(2)} from ${(ts[i - 1] - t0).toFixed(1)}: ${dbgLog.filter((x) => x[0] > ts[i - 1] - 1 && x[0] < ts[i] + 0.2).map((x) => `${(x[0] - t0).toFixed(1)} ${x[1]}`).join(' | ')}`); }
        if (g > gapMax) { gapMax = g; gapAt = `${(ts[i - 1] - t0).toFixed(0)} s after ${flashes[i - 2]?.[2] ?? 'start'}: ${winds.filter((w) => w[0] > ts[i - 1] - 0.5 && w[0] < ts[i]).map((w) => w[1]).join(', ') || 'no move'}`; }
      }
      for (let i = 0; i < flashes.length; i++) {
        for (let j = i + 1; j < flashes.length && flashes[j][0] - flashes[i][0] < 0.3; j++) {
          if (answerOf(flashes[i][1]) === answerOf(flashes[j][1])) continue;
          // (within one pattern, e.g. a torrent's red orb inside its ember stream: the pattern's own
          // design, counted apart; between two sources: the director's composition)
          if (flashes[i][2] === flashes[j][2]) { inner++; innerAt.push(flashes[i][2]); } else { conflicts++; conflictAt.push(`${flashes[i][2]}/${flashes[j][2]}`); }
        }
      }
      const picks = Object.values(cats).reduce((a, b) => a + b, 0) || 1;
      rows.push({
        seed, ph, T, cues: flashes.length, perMin: (flashes.length * 60) / T, gapMean: gapSum / (ts.length - 1), gapMax,
        cats, picks, chains: (d.brain.stats?.links ?? 0) - chains0, ambient: (d.brain.stats?.ambient ?? 0) - amb0,
        air: air / frames, fire: fire / frames, idle: idle / frames, minSafe, safeLow, conflicts, conflictAt, inner, innerAt, hurt, tellsOf,
        holds: d.brain.stats?.holds ?? 0, seeks: d.brain.stats?.seeks ?? 0, gapAt, safeAt, minSky,
      });
    }
  }
  const CATS = ['melee', 'wing', 'tail', 'fire', 'flight', 'spell', 'terrain'];
  out(`   ${SECS} s per phase, seeds ${SEEDS.join(', ')} · columns: cues/min · mean gap · longest gap (s) · chains · ambient fire · airborne % · fire on field % · idle % · least safe spots /17 · 0.3 s answer clashes · hits taken · category shares %`);
  out(`   seed ph  cue/min  gapMean gapMax chains amb  air%  fire% idle% safe clash hurt  ${CATS.map((c) => c.padStart(7)).join('')}`);
  for (const r of rows) {
    out(`   ${String(r.seed).padStart(4)}  ${r.ph}  ${r.perMin.toFixed(1).padStart(7)}  ${r.gapMean.toFixed(2).padStart(7)} ${r.gapMax.toFixed(2).padStart(6)} ${String(r.chains).padStart(6)} ${String(r.ambient).padStart(4)} ${(r.air * 100).toFixed(0).padStart(5)} ${(r.fire * 100).toFixed(0).padStart(6)} ${(r.idle * 100).toFixed(0).padStart(5)} ${String(r.minSafe).padStart(4)} ${String(r.conflicts).padStart(5)} ${String(r.hurt).padStart(4)}  ${CATS.map((c) => (((r.cats[c] || 0) * 100) / r.picks).toFixed(0).padStart(7)).join('')}`);
    if (r.conflicts) out(`         clashes between sources: ${r.conflictAt.slice(0, 8).join(' · ')}`);
    out(`         longest gap ${r.gapAt}${r.minSafe < 3 ? ` · least safe under ${r.safeAt}` : ''}${r.minSky < 99 ? ` · least safe under Armageddon ${r.minSky}` : ''} · holds ${r.holds} · seeks ${r.seeks}`);
    if (r.inner) out(`         inside one pattern: ${r.inner} (${[...new Set(r.innerAt)].join(', ')})`);
  }
  const mean = (ph, k) => { const rs = rows.filter((r) => r.ph === ph); return rs.reduce((a, r) => a + r[k], 0) / (rs.length || 1); };
  out(`   mean  P1 ${mean(1, 'perMin').toFixed(1)} · P2 ${mean(2, 'perMin').toFixed(1)} · P3 ${mean(3, 'perMin').toFixed(1)} cues/min; longest gap P1 ${Math.max(...rows.filter((r) => r.ph === 1).map((r) => r.gapMax)).toFixed(2)} · P2 ${Math.max(...rows.filter((r) => r.ph === 2).map((r) => r.gapMax)).toFixed(2)} · P3 ${Math.max(...rows.filter((r) => r.ph === 3).map((r) => r.gapMax)).toFixed(2)} s`);
  for (const k in linksBefore) TUNING.attacks[k].links = linksBefore[k];
  if (!P) { out('   (no TUNING.pressure: measured only, nothing asserted)'); return lastG; }
  const A = P.meter;
  for (const seed of SEEDS) {
    const r = [1, 2, 3].map((ph) => rows.find((x) => x.seed === seed && x.ph === ph));
    assert(r[1].perMin >= r[0].perMin * A.ramp && r[2].perMin >= r[1].perMin * A.ramp, `seed ${seed}: each phase busier than the last by x${A.ramp} (cues/min ${r.map((x) => x.perMin.toFixed(1)).join(' < ')})`);
    for (const x of r) {
      assert(x.gapMax <= perPhase(A.maxGap, x.ph), `seed ${seed} P${x.ph}: longest gap between cues ${x.gapMax.toFixed(2)} s <= ${perPhase(A.maxGap, x.ph)} s`);
      // the categories this phase has: attacks the AI may pick in it (tuning weight > 0 there)
      const want = new Set();
      for (const name in ATTACKS) {
        const spec = TUNING.attacks[name] ?? {};
        const raw = typeof ATTACKS[name].weight === 'function' || ATTACKS[name].weight === undefined ? spec.weight : ATTACKS[name].weight;
        const w = perPhase(raw, x.ph);
        if ((ATTACKS[name].phase ?? spec.phase ?? 1) <= x.ph && typeof w === 'number' && w > 0) want.add(catOf(name));
      }
      const missing = [...want].filter((c) => !x.cats[c]);
      assert(!missing.length, `seed ${seed} P${x.ph}: every category the phase has was picked (${[...want].join(', ')}; missing ${JSON.stringify(missing)})`);
      assert(x.conflicts === 0, `seed ${seed} P${x.ph}: no two blows of different sources needing different answers within 0.3 s (${x.conflicts}: ${x.conflictAt.slice(0, 4).join(' · ')})`);
      assert(x.minSafe >= 1, `seed ${seed} P${x.ph}: always ground within a roll that no blast due within 0.6 s covers (least ${x.minSafe} of 17 spots, Armageddon apart)`);
    }
    assert(r[1].chains >= 1 && r[2].chains >= 1, `seed ${seed}: moves chain into each other from the links in phases 2 and 3 (${r.map((x) => x.chains).join(' / ')})`);
    assert(r[0].ambient === 0 && r[2].ambient > 0, `seed ${seed}: ambient fire only from phase 2, and in phase 3 (${r.map((x) => x.ambient).join(' / ')})`);
  }
  return lastG;
}

// ================================================================== scenario: win (god-mode bot that defends)
async function scenarioWin() {
  out('\n== scenario WIN (god-mode bot: attacks, parries, blocks, dodges) ==');
  const G = build();
  const { game, input, evLog, counts, counters } = G;
  G.defend = makeDefender(G);
  assert(game.state === 'title', 'boots in title');
  assert(cls('ab-title') !== null, 'title UI exists');
  assert(game.lab && game.lab.open === false, 'Lab constructed, closed without ?lab');
  run(G, 1.0);
  assert(game.flow.cameraOverride !== null, 'title camera override active');
  input.tap('Space');
  G.tick(DT);
  assert(game.state === 'explore', 'any key → explore');
  assert(AUDIO.ctx !== null, 'audio context created by unlock');
  assert(game.player.state === 'idle', 'title-dismiss key did not roll');
  // walk north until the boss intro starts
  const introStarted = run(G, 30, { god: true, attack: false }, () => game.state === 'bossIntro');
  assert(introStarted, `bossIntro triggered (player z=${game.player.position.z.toFixed(1)})`);
  assert(game.dragon.state === 'waking', `dragon waking after intro start (got ${game.dragon.state})`);
  const fight = run(G, 20, { god: true, attack: false }, () => game.state === 'boss');
  assert(fight, 'dragon:introDone → boss state');
  assert(game.dragon.state === 'combat', `dragon in combat (got ${game.dragon.state})`);
  assert(cls('ab-boss')?.classList.contains('on'), 'boss bar shown');
  assert(game.audio.musicMode === 'boss', `boss music (got ${game.audio.musicMode})`);
  // fight until victory (4500 HP over three phases, the strings and the fire: a 3-5 min fight for a human)
  let maxPhase = 1, sawBreak = false, sawAir = false, chainMax = 0;
  const picks = {}, phaseT = [game.time, NaN, NaN], breakT = [];
  G.watch = (n, dd) => {
    if (n === 'dragon:windup') picks[dd.name] = (picks[dd.name] || 0) + 1;
    if (n === 'combat:deflectChain') chainMax = Math.max(chainMax, dd.count);
    if (n === 'dragon:phase') phaseT[dd.n - 1] = game.time;
    if (n === 'dragon:postureBreak') breakT.push(game.time);
  };
  const t0 = game.time;
  const won = run(G, 900, { god: true, defend: true }, () => {
    maxPhase = Math.max(maxPhase, game.dragon.phase);
    if (game.dragon.broken) sawBreak = true;
    if (game.dragon.state === 'airborne') sawAir = true;
    return game.state === 'victory';
  });
  G.watch = null;
  const c = (n) => counts[n] || 0;
  const fightT = game.time - t0;
  out(`   fight: t=${fightT.toFixed(1)}s (phase 2 at ${(phaseT[1] - t0).toFixed(1)} s, phase 3 at ${(phaseT[2] - t0).toFixed(1)} s) dragon hp=${game.dragon.hp} state=${game.dragon.state} phase=${maxPhase} hits=${c('player:hitDragon')} hurt=${c('player:hurt')} tells=${c('combat:tell')} flashes=${c('combat:flash')} break=${sawBreak} air=${sawAir}`);
  out(`   defence: parry ${c('player:parry')}/${G.defend.stats.parryTry} tries · block ${c('player:block')} · guardBreak ${c('player:guardBreak')} · perfect ${c('player:perfectDodge')}/${G.defend.stats.dodgeTry} tries · ghostep ${c('player:ghostep')} · dodge ${c('player:dodge')} · dragon:parried ${c('dragon:parried')} · deflect chains ${c('combat:deflectChain')} (longest x${chainMax}) · postureBreak ${c('dragon:postureBreak')} at ${breakT.map((t) => (t - t0).toFixed(0)).join(', ')} s`);
  out(`   AI picks: ${Object.entries(picks).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  assert(won, 'victory reached');
  assert(maxPhase === 3, 'phase 3 reached');
  assert(c('dragon:phase2') === 1, 'dragon:phase2 once');
  assert(c('dragon:phase3') === 1 && c('dragon:phase') === 2, `dragon:phase3 once, dragon:phase {n} twice (${c('dragon:phase3')} / ${c('dragon:phase')})`);
  assert(phaseT[1] > t0 && phaseT[2] > phaseT[1], 'the phases come in order');
  assert(c('dragon:death') === 1 && c('dragon:dead') === 1, 'dragon:death + dragon:dead once each');
  assert(c('game:victory') === 1, 'game:victory once');
  assert(game.dragon.state === 'dead', 'dragon dead');
  assert(c('combat:tell') >= 3 && c('combat:flash') >= 3 && c('combat:flash') <= c('combat:tell'), `attacks announced with combat:tell + combat:flash (${c('combat:tell')} / ${c('combat:flash')})`);
  assert(c('player:parry') >= 1 && c('player:parry') === c('dragon:parried'), `bot parried in a live fight (player:parry ${c('player:parry')} = dragon:parried ${c('dragon:parried')})`);
  assert(c('player:perfectDodge') >= 1 && c('player:perfectDodge') === c('player:ghostep'), `bot Ghostepped a red tell in a live fight (${c('player:perfectDodge')})`);
  assert(c('player:plungeHit') >= 1 && c('player:plungeHit') <= c('player:plunge'), `perfect dodges plunged onto the head in a live fight (${c('player:plunge')} dives, ${c('player:plungeHit')} hits)`);
  assert((c('dragon:postureBreak') > 0) === sawBreak, `dragon:postureBreak ↔ dragon.broken (${c('dragon:postureBreak')} / ${sawBreak})`);
  // (at most once: in an ember storm a red fireball can land inside the parry tap the bot gave the
  // normal one before it. Seeds 1-6 give 0 here and on the stance before ADR-114; the default seed's
  // fight, which any change to the first frames of the hero's swings reshuffles, now meets that once)
  assert(c('player:guardBreak') <= 1, `the reacting bot guard-broke ${c('player:guardBreak')} time(s) (≤ 1: red tells are dodged, not blocked)`);
  assert(c('player:charge') === 0 && c('player:noStamina') === 0, 'no charge from taps, no stamina events');
  run(G, 4, { god: true });
  assert(!cls('ab-boss')?.classList.contains('on'), 'boss bar hidden after victory');
  assert(cls('ab-stats')?.classList.contains('on'), 'victory stats shown');
  assert(game.player.takeHit({ damage: 50, from: { x: 0, z: 0 } }) === RESULT.IGNORED, 'player ignores hits in victory');
  // [R] fight again
  input.tap('KeyR');
  run(G, 4, {}, () => game.state === 'explore' && !game.flow.respawning);
  assert(game.state === 'explore', 'R → explore');
  const d = game.dragon;
  assert(d.state === 'sleeping' && d.hp === d.maxHp && d.phase === 1 && d.posture === 0 && !d.broken && d.maxPosture === TUNING.posture.max[0], 'dragon reset to sleeping/full/phase1/posture 0');
  assert(counters.scorchReset >= 1, 'scorch reset on restart');
  assert(game.player.hp === game.player.maxHp && game.player.critTimer === 0, 'player full hp, no crit window after restart');
  assert(d.object3d.visible, 'dragon visible again after restart');
  // second fight starts cleanly
  const again = run(G, 40, { god: true, attack: false }, () => game.state === 'boss');
  assert(again, 'second fight reaches boss state');
  out('   states: ' + evLog.filter((l) => l.includes(' state ')).map((l) => l.split(' state ')[1]).join(', '));
  return G;
}

// ================================================================== scenario: probe (difficulty, opt-in)
// Not part of 'all': `node tests/integration/integ.mjs . probe` (env ABYSS_SKILL = the share of tells
// the bot answers, default 0.8; ABYSS_SEED reseeds). A mortal bot with the win scenario's habits
// fights until it wins or dies: a rough read of the fight's length and danger for tuning.
async function scenarioProbe() {
  const skill = Number(process.env.ABYSS_SKILL ?? 0.8);
  out(`
== scenario PROBE (mortal bot, answers ${Math.round(skill * 100)} % of tells) ==`);
  const G = build();
  const { game, input, counts } = G;
  G.defend = makeDefender(G, { skill });
  run(G, 1.0);
  input.tap('Space');
  G.tick(DT);
  run(G, 30, { god: true, attack: false }, () => game.state === 'bossIntro');
  run(G, 20, { god: true, attack: false }, () => game.state === 'boss');
  const p = game.player, d = game.dragon;
  const t0 = game.time, phaseT = [0, NaN, NaN];
  let hurt = 0, worst = 0;
  G.watch = (n, e) => {
    if (n === 'dragon:phase') phaseT[e.n - 1] = game.time - t0;
    if (n === 'player:hurt') { hurt += e?.damage ?? 0; worst = Math.max(worst, e?.damage ?? 0); }
  };
  const done = run(G, 900, { god: false, defend: true }, () => game.state === 'victory' || !p.alive || p.state === 'dead' || game.state === 'dead');
  G.watch = null;
  const c = (n) => counts[n] || 0;
  const res = game.state === 'victory' ? 'WIN' : done ? 'DIED' : 'TIMEOUT';
  out(`   ${res} after ${(game.time - t0).toFixed(1)} s · wyrm hp ${d.hp}/${d.maxHp} (${Math.round((100 * d.hp) / d.maxHp)} %) phase ${d.phase} (P2 at ${phaseT[1].toFixed(0)} s, P3 at ${phaseT[2].toFixed(0)} s)`);
  out(`   hero: took ${hurt} dmg (worst ${worst}) · heals ${c('player:heal')} · parries ${c('player:parry')} · chains ${c('combat:deflectChain')} · perfect ${c('player:perfectDodge')} · plunges ${c('player:plungeHit')} · breaks ${c('dragon:postureBreak')} · hits ${c('player:hitDragon')}`);
  return G;
}

// ================================================================== scenario: timestep (ADR-103)
// A rendered frame is simulated in steps no longer than about 1 / 60 s (core/timestep.js): the steps
// these tests run. Input edges belong to the frame's first step.
async function scenarioTimestep() {
  out('\n== scenario TIMESTEP (a frame is cut into simulation steps of about 1 / 60 s; edges belong to the first) ==');
  const { STEP, FRAME_MAX, simSteps, runFrame } = await imp('src/core/timestep.js');
  const at = (dt) => simSteps(dt, { n: 0, dt: 0 });
  const row = [1 / 240, 1 / 144, 1 / 120, 1 / 60, 0.0169, 1 / 50, 1 / 45, 1 / 30, 1 / 24, 1 / 20, 1 / 15, 1 / 10, 0.5].map((f) => ({ f, ...at(f) }));
  out('   ' + row.map((r) => `${(1 / r.f).toFixed(0)} fps: ${r.n} x ${(r.dt * 1000).toFixed(1)} ms`).join(' | '));
  const longest = (1 + STEP.slack) * STEP.max + 1e-9;
  assert(row.every((r) => r.dt <= longest), `no step is longer than ${(longest * 1000).toFixed(1)} ms, at any frame rate`);
  assert(row.every((r) => near(r.n * r.dt, Math.min(r.f, FRAME_MAX), 1e-9)), 'the steps of a frame add up to the frame (to FRAME_MAX for a frame longer than that)');
  assert(at(1 / 60).n === 1 && at(0.0169).n === 1 && at(1 / 144).n === 1 && at(1 / 50).n === 1, 'a 60 Hz frame is one step, a hair late too; 144 Hz and 50 Hz are one step each');
  assert(at(1 / 30).n === 2 && near(at(1 / 30).dt, 1 / 60, 1e-9) && at(1 / 20).n === 3 && near(at(1 / 20).dt, 1 / 60, 1e-9), `30 fps is two steps of 1 / 60 s and 20 fps three: the steps the tests run`);
  assert(at(0.5).n === STEP.maxSteps && near(at(0.5).dt, STEP.max, 1e-9) && near(FRAME_MAX, STEP.max * STEP.maxSteps, 1e-12), `a frame longer than ${FRAME_MAX.toFixed(2)} s is simulated as that much (${STEP.maxSteps} steps): the game runs slow below ${(1 / FRAME_MAX).toFixed(0)} fps`);
  assert(at(NaN).n === 1 && at(NaN).dt === 0 && at(-1).dt === 0 && at(0).n === 1, 'a broken frame time is one step of nothing');
  // runFrame: the steps in order, the edges cleared once, after the first
  const log = [];
  const o = runFrame(1 / 20, (dt) => log.push(`sim ${(dt * 1000).toFixed(1)}`), () => log.push('edges'), { n: 0, dt: 0 });
  assert(o.n === 3 && log.join(',') === 'sim 16.7,edges,sim 16.7,sim 16.7', `runFrame at 20 fps: ${log.join(', ')}`);
  log.length = 0;
  runFrame(1 / 20, (dt) => log.push(`sim ${(dt * 1000).toFixed(1)}`), () => log.push('edges'), { n: 0, dt: 0 }, true);
  assert(log.join(',') === 'sim 50.0,edges', `one exact step when asked (window.__tick): ${log.join(', ')}`);
  // in the game: a 30 fps frame split in two steps IS two 60 fps steps; a tap is seen once
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  settle(G);
  const p = game.player;
  const frame30 = () => runFrame(1 / 30, (dt) => G.tick(dt), null);
  const t0 = game.time;
  for (let i = 0; i < 30; i++) frame30();
  assert(near(game.time - t0, 1, 1e-6), `30 frames at 30 fps are one second of game time (${(game.time - t0).toFixed(4)} s)`);
  // a tap of lock-on in a two-step frame toggles it once (the second step sees no edge)
  const lock0 = p.lockOn;
  input.tap('Tab');
  frame30();
  assert(p.lockOn !== lock0, `a tap in a frame of two steps is one press (lock-on ${lock0} -> ${p.lockOn})`);
  if (p.lockOn !== lock0) { input.tap('Tab'); frame30(); }
  // the 0.08 s perfect-parry window, sampled: one step of 1 / 30 s sees it at most 3 times, two steps 5
  const W = DEFENSE.perfectParryWindow;
  const samples = (step) => Math.floor(W / step + 1e-9) + 1;
  assert(samples(at(1 / 30).dt) >= 5 && samples(1 / 30) <= 3, `the ${W} s perfect-parry window is sampled ${samples(at(1 / 30).dt)} times at 30 fps (${samples(1 / 30)} in one step of 1 / 30 s)`);
  return G;
}

// ================================================================== scenario: strategy (opt-in)
// Which defence wins? Three god-mode bots that differ only in how they answer a tell (makeDefender
// `style`). Not a pass / fail check: node tests/integration/integ.mjs . strategy
async function scenarioStrategy() {
  out('\n== scenario STRATEGY (mixed / parry-only / dodge-only, god mode) ==');
  let last = null;
  for (const style of ['mixed', 'parry', 'dodge']) {
    const G = build();
    const { game, input, counts } = G;
    G.defend = makeDefender(G, { style });
    run(G, 1.0);
    input.tap('Space');
    G.tick(DT);
    run(G, 30, { god: true, attack: false }, () => game.state === 'bossIntro');
    run(G, 20, { god: true, attack: false }, () => game.state === 'boss');
    const t0 = game.time;
    let hurt = 0, hurtN = 0;
    G.watch = (n, e) => { if (n === 'player:hurt') { hurt += e?.damage ?? 0; hurtN++; } };
    const won = run(G, 900, { god: true, defend: true }, () => game.state === 'victory');
    G.watch = null;
    const c = (n) => counts[n] || 0;
    out(`   ${style.padEnd(5)} ${won ? 'WON ' : 'time'} ${(game.time - t0).toFixed(0).padStart(3)} s  hits taken ${String(hurtN).padStart(2)} (${Math.round(hurt)} dmg)  parries ${String(c('player:parry')).padStart(3)}  perfect dodges ${String(c('player:perfectDodge')).padStart(3)}  plunges ${c('player:plungeHit')}  breaks ${c('dragon:postureBreak')}`);
    G.defend = null;
    last = G;
  }
  return last;
}

// ================================================================== scenario: die + retry + pause + rest
async function scenarioDie() {
  out('\n== scenario DIE (passive bot) ==');
  const G = build();
  const { game, input, counts, counters } = G;
  run(G, 0.6);
  input.click(0);
  G.tick(DT);
  assert(game.state === 'explore', 'click → explore');
  assert(game.player.state === 'idle', 'title-dismiss click did not swing');
  // rest at bonfire at spawn
  input.tap('KeyE');
  G.tick(DT);
  assert((counts['bonfire:rest'] || 0) === 1, 'E near bonfire → bonfire:rest');
  // heal / roll edge events (v0.2: no stamina — rolls are free)
  const maxF = game.player.maxFlasks;
  assert(maxF === 5, `5 flasks (got ${maxF})`);
  for (let i = 0; i < maxF + 1; i++) { input.tap('KeyF'); run(G, 1.1, { passive: true }); }
  assert((counts['player:heal'] || 0) === maxF && (counts['player:noFlask'] || 0) >= 1, `${maxF} heals then noFlask`);
  for (let i = 0; i < 8; i++) { input.axis = { x: 1, y: 0 }; input.tap('Space'); G.tick(DT); run(G, 0.45, { passive: true }); }
  assert((counts['player:roll'] || 0) >= 8, `every roll accepted, none refused (${counts['player:roll'] || 0})`);
  assert(!('stamina' in game.player) && !('maxStamina' in game.player), 'player has no stamina fields');
  run(G, 3, { passive: true });
  game.player.position.set(CONFIG.world.playerSpawn.x, 0, CONFIG.world.playerSpawn.z);
  input.tap('KeyE'); G.tick(DT);
  assert(game.player.flasks === game.player.maxFlasks, 'second rest refills flasks');
  run(G, 25, { attack: false }, () => game.state === 'boss');
  assert(game.state === 'boss', 'reached boss');
  // pause / resume
  run(G, 3, { attack: false });
  input.tap('Escape');
  G.tick(DT);
  assert(game.state === 'paused', 'Esc → paused');
  // (snapshot after the Esc frame: that frame still runs on the pre-pause dt, so a wyrm walking at
  // that moment moves once; whether it walks depends on the seeded AI's rolls, which share
  // Math.random with cosmetic FX)
  const dPos = game.dragon.position.clone(), dHp = game.dragon.hp;
  run(G, 2, { attack: false });
  assert(game.timeScale === 0, 'timeScale 0 while paused');
  assert(game.dragon.position.distanceTo(dPos) < 1e-6 && game.dragon.hp === dHp, 'dragon frozen while paused');
  input.tap('Escape');
  G.tick(DT);
  assert(game.state === 'boss', 'Esc → back to boss');
  // stand still near the dragon until dead
  const died = run(G, 240, { attack: false }, () => game.state === 'dead');
  assert(died, `player killed → dead state (hp=${game.player.hp})`);
  assert((counts['player:died'] || 0) === 1, 'player:died once');
  assert(game.audio.musicMode === 'death', `death music (got ${game.audio.musicMode})`);
  run(G, 1.0);
  const bn = ui.findAll((e) => e.classList?.contains('ab-banner'));
  assert(bn.some((b) => b.textContent.includes('YOU DIED')), 'YOU DIED banner');
  input.tap('KeyW');
  G.tick(DT);
  assert(!game.flow.respawning, 'retry not accepted before hold time');
  run(G, 4.0);
  input.tap('KeyW');
  run(G, 5, { passive: true }, () => game.state === 'explore' && !game.flow.respawning);
  assert(game.state === 'explore', 'retry → explore');
  assert((counts['game:retry'] || 0) === 1, 'game:retry once');
  assert(game.player.alive && game.player.hp === game.player.maxHp && game.player.state === 'idle', 'player respawned full');
  assert(Math.hypot(game.player.position.x - CONFIG.world.playerSpawn.x, game.player.position.z - CONFIG.world.playerSpawn.z) < 0.5, 'player at bonfire spawn');
  assert(game.dragon.state === 'sleeping' && game.dragon.hp === game.dragon.maxHp && game.dragon.posture === 0, 'dragon reset');
  assert(counters.scorchReset >= 1, 'scorch reset on retry');
  assert(game.audio.musicMode === 'ambient', `ambient music after retry (got ${game.audio.musicMode})`);
  assert(game.audio.breath ? !game.audio.breath.active : true, 'breath loop stopped after retry');
  assert(G.finalU.uFade.value < 0.05 && G.finalU.uDesat.value < 0.05, `grade cleared (fade=${G.finalU.uFade.value.toFixed(2)} desat=${G.finalU.uDesat.value.toFixed(2)})`);
  assert(!game.flow.cameraOverride || game.flow.cameraOverride.weight < 0.05, 'no lingering camera override');
  run(G, 3, { passive: true });
  assert(game.dragon.state === 'sleeping', 'dragon stays asleep at the bonfire after retry');
  return G;
}

// ================================================================== scenario: breath (a stream)
async function scenarioBreath() {
  out('\n== scenario BREATH (forced breath: stand in it, roll into it, roll out of it) ==');
  const G = build();
  const { game, input, counts } = G;
  run(G, 0.6); input.tap('Space'); G.tick(DT);
  run(G, 30, { attack: false }, () => game.state === 'boss');
  assert(game.state === 'boss', 'walked into the fight');
  const d = game.dragon, p = game.player;
  const BREATH_AT = 8.5; // closer than ~7 m the player stands under the (25 % bigger) head, behind the mouth
  d.debug.setAI(false);
  settle(G);
  // 1) stand in the cone (AI breath range: 6-16 m x SCALE) and take it: every tick is a hit, logged as a summary
  place(G, BREATH_AT);
  const hurt0 = counts['player:hurt'] || 0, log0 = G.logTimes.length;
  p.debug.god = true;
  const r1 = forceAttack(G, 'breath', { answer: 'none', max: 4, settle: 400 });
  p.debug.god = false;
  const lines = G.logTimes.slice(log0).map((x) => x[1]);
  const fireLines = lines.filter((l) => /flame|Burning|Scorched|fire/i.test(l));
  const ticks = G.hits.filter((h) => h.attack === 'breath' && h.t >= r1.tellT).length;
  out('   breath: takeHit ticks', ticks, 'player:hurt', (counts['player:hurt'] || 0) - hurt0, 'fire/burn log lines', fireLines.length, '::', fireLines.join(' / '));
  assert(r1.trigger === true && r1.tell === TELL.NORMAL, 'breath forced via Lab, normal tell');
  assert(ticks >= 5 && (counts['player:hurt'] || 0) - hurt0 >= 5, 'breath ticks reached the player');
  assert(fireLines.length <= 6, 'breath damage summarized (<= ~1 line/s per stream)');
  assert((counts['dragon:breathStart'] || 0) >= 1 && (counts['dragon:breathEnd'] || 0) >= 1, 'breathStart/End emitted');
  assert(!game.audio.breath?.active, 'audio breath loop stopped after breathEnd');
  // 2) blocking the stream: blockable (chip), never parryable even with a timed RMB press
  settle(G);
  place(G, BREATH_AT);
  const rb = forceAttack(G, 'breath', { answer: 'parry', hold: false, max: 2 });
  assert(rb.res !== RESULT.PARRIED && evn(rb, 'player:parry') === 0, `breath is not parryable (got ${rb.res})`);
  settle(G);
  // 3) roll INTO the breath just before the first tick: a perfect dodge → Ghostep
  place(G, BREATH_AT);
  const rg = forceAttack(G, 'breath', { answer: 'dodge', max: 2.5, settle: 30 });
  out('   roll into breath: result', rg.res, 'perfect', evn(rg, 'player:perfectDodge'), 'ghostep', evn(rg, 'player:ghostep'), 'press lead', rg.pressLead?.toFixed(3));
  assert(rg.res === RESULT.PERFECT && evn(rg, 'player:perfectDodge') === 1 && evn(rg, 'player:ghostep') === 1, 'rolling into the breath at its start → one Ghostep');
  settle(G);
  // 4) standing in the stream, then rolling OUT of it: one plain dodge per roll, never a Ghostep
  place(G, BREATH_AT);
  p.debug.god = true;
  const c0 = { ...counts };
  let rollT = -1, tellT = -1;
  G.watch = (n, dd) => { if (n === 'combat:tell' && dd.attack === 'breath') tellT = game.time + dd.impactIn; };
  game.lab.trigger('breath');
  for (let i = 0; i < 240; i++) {
    aimAt(G);
    input.axis = { x: 0, y: 0 };
    if (tellT > 0 && rollT < 0 && game.time > tellT + 0.5) {
      rollT = game.time;
      const a = d.yaw + Math.PI / 2;
      input.axis = { x: Math.sin(a), y: -Math.cos(a) };
      input.tap('Space');
    }
    G.tick(DT);
    if (rollT > 0 && game.time > rollT + 0.8) break;
  }
  G.watch = null;
  p.debug.god = false;
  const dd = (n) => (counts[n] || 0) - (c0[n] || 0);
  out('   roll out of breath: roll', dd('player:roll'), 'dodge', dd('player:dodge'), 'perfect', dd('player:perfectDodge'), 'hurt', dd('player:hurt'));
  assert(dd('player:roll') === 1 && dd('player:dodge') === 1, 'exactly one player:dodge per roll out of the breath');
  assert(dd('player:perfectDodge') === 0, 'rolling out of a stream you stand in is not a perfect dodge');
  return G;
}

// ================================================================== scenario: shells in flight at death
async function scenarioGate() {
  out('\n== scenario GATE (shells in flight when the wyrm dies) ==');
  const G = build();
  const { game, input, counts } = G;
  run(G, 0.6); input.tap('Space'); G.tick(DT);
  run(G, 30, { attack: false }, () => game.state === 'boss');
  const d = game.dragon;
  const p = game.player;
  run(G, 0.3, { passive: true });
  d.fx.launchFireball(new THREE.Vector3(p.position.x, 6, p.position.z - 4), p.position.clone(), null);
  d.hp = 1;
  d.takeHit({ damage: 50, part: 'body', point: { x: d.position.x, y: 2, z: d.position.z } });
  assert(d.state === 'dying', 'dragon dying');
  const hurt0 = counts['player:hurt'] || 0;
  run(G, 2, { passive: true });
  assert((counts['dragon:explosion'] || 0) >= 1, 'shell exploded');
  assert((counts['player:hurt'] || 0) === hurt0, 'no damage from a dead wyrm');
  run(G, 10, { passive: true }, () => game.state === 'victory');
  assert(game.state === 'victory' && p.alive, 'victory with the hero alive');
  return G;
}

// ================================================================== scenario: parry (blue bite)
async function scenarioParry() {
  out('\n== scenario PARRY (blue bite: timed RMB tap; mashed / early / late presses) ==');
  const G = build();
  const { game } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player;
  assert(game.state === 'boss' && d.state === 'combat' && d.debug.aiEnabled === false, 'boss fight, dragon AI off');
  // timed parry
  settle(G);
  place(G, 6);
  const r = forceAttack(G, 'bite', { answer: 'parry' });
  const err = r.hitT - r.impactT;
  out(`   bite: tell ${r.tell} impactIn ${r.impactIn?.toFixed(3)} · RMB ${(r.pressLead ?? NaN).toFixed(3)} s before the predicted impact · hit landed ${(err * 1000).toFixed(0)} ms off the prediction · result ${r.res}`);
  assert(r.trigger === true, 'lab.trigger(bite) → dragon.debug.trigger');
  assert(r.tell === TELL.BLUE, 'bite announces a blue tell');
  assert(r.impactIn >= 0.7, `bite windup readable (impactIn ${r.impactIn?.toFixed(2)} ≥ 0.7)`);
  assert(evn(r, 'combat:flash') === 1, 'one combat:flash for the bite');
  assert(Math.abs(err) <= 0.06, `bite lands within 60 ms of combat:tell impactIn (${(err * 1000).toFixed(0)} ms)`);
  assert(r.res === RESULT.PARRIED, `player.takeHit → 'parried' (got ${r.res})`);
  assert(evn(r, 'player:parry') === 1 && evn(r, 'dragon:parried') === 1, 'player:parry + dragon:parried emitted once');
  assert(r.hpAtHit === r.hp0, `player HP unchanged by a parry (${r.hp0} → ${r.hpAtHit})`);
  assert(r.postureAtHit - r.posture0 >= POSTURE.parry.blue - 0.5, `dragon posture +${(r.postureAtHit - r.posture0).toFixed(1)} (POSTURE.parry.blue ${POSTURE.parry.blue})`);
  assert(d.brain.action?.name === 'recoil' || evn(r, 'dragon:postureBreak') > 0, `parried bite → recoil (action ${d.brain.action?.name})`);
  const tr = game.lab.trainer.results[0];
  out('   timing trainer:', tr ? `${tr.kind} ${tr.text} Δ${tr.drift}ms` : 'n/a');
  assert(tr?.kind === 'parry', 'Lab timing trainer graded the parry');
  // mashed RMB: anti-mash rearm → no parry
  settle(G);
  place(G, 6);
  const m = forceAttack(G, 'bite', { answer: 'mash' });
  out('   mashed RMB → result', m.res);
  assert(m.res !== null && m.res !== RESULT.PARRIED && evn(m, 'player:parry') === 0, `mashed RMB does not parry (got ${m.res})`);
  // early press (outside the window) / late press (after the impact)
  for (const answer of ['early', 'late']) {
    settle(G);
    place(G, 6);
    const x = forceAttack(G, 'bite', { answer });
    out(`   ${answer} RMB (${(x.pressLead ?? NaN).toFixed(2)} s) → result`, x.res);
    assert(x.res === RESULT.HIT && evn(x, 'player:parry') === 0 && x.hpAtHit < x.hp0, `${answer} RMB press does not parry (got ${x.res}, hp ${x.hp0} → ${x.hpAtHit})`);
  }
  // a normal-tell hit of the claw combo can be parried too; since v0.5 (contract 1, the deflect
  // chain) a parry on a hit that is not the string's last one does NOT end it: the next hits follow
  settle(G);
  place(G, 6);
  let par = null;
  const offPar = game.events.on('dragon:parried', (dd) => { if (!par) par = dd; });
  const cc = forceAttack(G, 'clawCombo', { answer: 'parry', max: 4, settle: 150 });
  offPar();
  out('   clawCombo hit 1 → result', cc.res, 'tells', evn(cc, 'combat:tell'), 'parried', JSON.stringify(par));
  assert(cc.res === RESULT.PARRIED && evn(cc, 'dragon:parried') === 1, `normal-tell combo hit parried (got ${cc.res})`);
  assert(par?.hit === 0 && par?.last === false, `dragon:parried {hit 0, last false} for the combo's first hit (${JSON.stringify(par)})`);
  assert(evn(cc, 'combat:tell') === 3, `a parry on hit 1 deflects: the combo goes on (${evn(cc, 'combat:tell')} tells)`);
  return G;
}

// ================================================================== scenario: the ASCII HUD
// ADR-098: meters made of characters (ui/glyphBar.js), banners in block letters (ui/blockText.js),
// no name plate, no panel round the minimap.
async function scenarioAsciiHud() {
  out('\n== scenario ASCIIHUD (text meters, the piece just lost, block-letter banners, no name plate) ==');
  const G = build();
  const { game } = G;
  fightSetup(G);
  const p = game.player, d = game.dragon, hud = game.hud;
  const text = (b) => b.root.textContent;
  // a meter: fill, the piece just lost, the empty rest; always `cells` characters
  const B = new GlyphBar(document.createElement('div'), 't', { cells: 10, hold: 0.6, drain: 2.4 });
  assert(text(B) === '##########', `a full meter is all fill ("${text(B)}")`);
  B.set(0.5);
  B.update(0);
  assert(text(B) === '#####=====' && B.fillEl.textContent.length === 5 && B.chunkEl.textContent.length === 5, `half lost at once: the fill drops, the lost piece shows ("${text(B)}")`);
  B.update(0.5);
  assert(text(B) === '#####=====', 'the lost piece holds');
  for (let i = 0; i < 120; i++) B.update(1 / 60);
  assert(text(B) === '#####.....', `then drains ("${text(B)}")`);
  B.snap(0.01);
  assert(text(B) === '#.........', `anything left shows one cell ("${text(B)}")`);
  B.snap(0);
  assert(text(B) === '..........', 'nothing left: no cell');
  B.snap(0.97);
  assert(text(B) === '#########.', `only a full meter shows every cell ("${text(B)}")`);
  B.set(1);
  for (let i = 0; i < 120; i++) B.update(1 / 60);
  assert(text(B) === '##########', 'a gain rises to full');
  const guard = new GlyphBar(document.createElement('div'), 'g', { cells: 8, full: '=', lost: '-' });
  guard.set(0.25);
  guard.update(0);
  assert(text(guard) === '==------', `a meter takes its own characters ("${text(guard)}")`);
  const m = B.mark(0.5);
  assert(m.textContent === '|' && /calc\(/.test(m.style.left), 'a mark sits over the meter, inside its brackets');
  // posture grows from the middle
  const P = new GlyphPosture(document.createElement('div'), { cells: 12 });
  assert(text(P) === '------------', 'no posture: an empty row');
  P.snap(0.5);
  assert(text(P) === '---======---', `half posture: the middle half ("${text(P)}")`);
  P.snap(1);
  assert(text(P) === '============', 'full posture: the whole row');
  // block letters: six rows, every letter as wide on each of them; ABYSS is the title logo
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const ragged = [...abc, ',', '.', '-', "'", '!', ' '].filter((ch) => { const r = blockLines(ch); return r.length !== 6 || new Set(r.map((x) => x.length)).size !== 1 || r[0].length < 3; });
  assert(!ragged.length, `every block letter is six rows of one width (${ragged.join('') || 'all'})`);
  assert(blockLines('ABYSS')[0] === ' █████╗ ██████╗ ██╗   ██╗███████╗███████╗' && blockLines('abyss')[5] === '╚═╝  ╚═╝╚═════╝    ╚═╝   ╚══════╝╚══════╝', 'ABYSS in block letters is the title logo');
  const one = blockText('ASHFALL COURTYARD', { maxCols: 400 }), two = blockText('ASHFALL COURTYARD', { maxCols: 90 });
  assert(one.lines.length === 6 && two.lines.length === 13 && two.lines[6] === '' && two.cols <= 90 && two.lines.every((l) => l.length <= 90), `a long name stacks word by word on a narrow screen (${one.cols} cols → ${two.cols})`);
  // the HUD's own meters
  p.hp = p.maxHp * 0.5;
  p.guard = p.maxGuard * 0.25;
  p.guardWait = 99;
  for (let i = 0; i < 60; i++) hud.update(DT);
  assert(hud.hpBar instanceof GlyphBar && hud.guardBar instanceof GlyphBar && hud.bossBar instanceof GlyphBar && hud.postBar instanceof GlyphPosture, 'HP, guard, the boss and its posture are text meters');
  assert(hud.hpBar.fillEl.textContent === '#'.repeat(12) && hud.guardBar.fillEl.textContent === '='.repeat(6) && hud.guardBar.root.classList.contains('low'), `they show the hero's HP and guard ("${text(hud.hpBar)}" / "${text(hud.guardBar)}")`);
  const gates = (d.phaseAt ?? []).slice(1).filter((x) => x > 0 && x < 1).length;
  assert(hud.bossBar.root.children.filter((e) => e.classList?.contains('tick')).length === gates, `the boss's meter marks its ${gates} phase gates`);
  assert(!cls('ab-pf-name') && !cls('ab-pf-lv') && !cls('ab-bar'), 'no name plate, no scaled-div bars');
  assert(cls('ab-pf') && !cls('ab-pf').classList.contains('ab-panel') && !cls('ab-map').classList.contains('ab-panel'), 'the player\'s rows and the minimap have no panel');
  // a banner: block letters, the plain text kept
  hud.banner('YOU DIED', 'death');
  const rows = hud.bannerUi.block.textContent.split('\n');
  assert(rows.length === 6 && rows[0] === blockLines('YOU DIED')[0] && hud.bannerUi.txtInner.textContent === 'YOU DIED', `a banner is drawn in block letters (${rows.length} rows of ${rows[0].length})`);
  const w0 = globalThis.innerWidth;
  globalThis.innerWidth = 390;
  hud.banner('ASHFALL COURTYARD', 'area');
  const narrow = hud.bannerUi.block.textContent.split('\n');
  globalThis.innerWidth = w0;
  hud.bannerUi.update(DT);
  const wide = hud.bannerUi.block.textContent.split('\n');
  assert(narrow.length === 13 && wide.length === 6, `it stacks on a narrow window and is laid out again when the window changes (${narrow.length} → ${wide.length} rows)`);
  hud.clearBanner(true);
  // the pause menu: RESUME's label on the left (the key chip its value), QUIT TO TITLE asks once more
  game.flow.debug.toState('boss');
  G.tick(DT);
  game.flow.pause(true);
  const pm = hud.pauseUi, resumeBtn = pm.buttons[0];
  assert(game.state === 'paused' && resumeBtn.children[0]?.textContent === 'RESUME' && resumeBtn.children[1]?.classList.contains('v'), 'RESUME is laid out like the other items (label left, key right)');
  assert(pm.buttons.includes(pm.btnQuit) && pm.buttons.at(-1) === pm.btnQuit, 'QUIT TO TITLE is the last item and the pad can focus it');
  pm.btnQuit.click();
  assert(game.state === 'paused' && pm.btnQuit.classList.contains('confirm') && pm.quitVal.textContent !== '›', 'one press arms it: still paused');
  pm.show(true);
  assert(!pm.btnQuit.classList.contains('confirm') && pm.quitVal.textContent === '›', 'reopening the menu disarms it');
  pm.btnQuit.click();
  pm.btnQuit.click();
  G.tick(DT);
  assert(game.state === 'title' && !pm.on, `a second press goes to the title screen (${game.state})`);
  p.respawn();
  return G;
}

// ================================================================== scenario: the guard meter
// GUARD (combat/rules.js, ADR-095): a blocked blow costs guard and no HP; the blow that empties the
// meter is still blocked and knocks the guard open (a short stagger, no knockdown, no damage); it
// refills by itself, also behind a held guard and in a swing; a parry and a cut that lands give
// some back at once; a contact stream keeps its HP chip and leaves the meter alone.
async function scenarioGuard() {
  out('\n== scenario GUARD (the guard meter: a block costs guard, not HP; knocked open; the refill; parries and hits restore) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player;
  const c = (n) => G.counts[n] || 0;
  const guardUp = () => { settle(G); place(G, 6); p.guard = p.maxGuard; p.guardWait = 0; input.press(1); run(G, 0.6, { passive: true }); };
  const blow = (damage, tell = TELL.NORMAL, extra = {}) => p.takeHit({ damage, tell, attack: 'bite', attacker: d, knockback: 2, ...extra });
  assert(p.guard === GUARD.max && p.maxGuard === GUARD.max, `the meter starts full (${p.guard} / ${p.maxGuard})`);

  // 1) a blocked blow: guard, not HP
  guardUp();
  const hp0 = p.hp;
  const r1 = blow(20);
  assert(r1 === RESULT.BLOCKED && p.hp === hp0, `a blocked blow takes no HP (${r1}, hp ${hp0} → ${p.hp})`);
  assert(near(p.guard, GUARD.max - 20 * GUARD.cost.normal, 1e-6), `it costs its damage x ${GUARD.cost.normal} in guard (${p.guard})`);
  const r2 = blow(20, TELL.BLUE);
  assert(r2 === RESULT.BLOCKED && p.hp === hp0 && near(p.guard, GUARD.max - 20 * GUARD.cost.normal - 20 * GUARD.cost.blue, 1e-6), `a heavy (blue) blow costs x ${GUARD.cost.blue} (${p.guard})`);
  const g2 = p.guard;
  blow(1);
  assert(near(g2 - p.guard, GUARD.costMin, 1e-6), `the smallest blow costs ${GUARD.costMin}`);
  input.up(1);

  // 2) the refill: nothing for regenDelay, then quickly; behind a held guard and in a swing too
  guardUp();
  blow(40);
  const gHit = p.guard;
  run(G, GUARD.regenDelay - 0.1, { passive: true });
  assert(near(p.guard, gHit, 1e-6) && p.blocking, `no refill for ${GUARD.regenDelay} s after a blocked blow (${p.guard})`);
  run(G, 0.4, { passive: true });
  assert(p.guard > gHit + 10 && p.blocking, `then it refills behind the held guard (${gHit} → ${p.guard.toFixed(1)})`);
  run(G, 1.5, { passive: true });
  assert(p.guard === p.maxGuard, `and is full again within ${(GUARD.regenDelay + 1.9).toFixed(1)} s (${p.guard})`);
  input.up(1);
  settle(G);
  place(G, 14);
  p.guard = 10;
  p.guardWait = 0;
  p._buffer('light');
  let swung = false;
  for (let i = 0; i < 20; i++) { G.tick(DT); if (p.state === 'attack') swung = true; }
  assert(swung && p.guard > 10 + GUARD.regenRate * 0.25, `a swing does not stop the refill (${p.guard.toFixed(1)})`);

  // 3) the blow that empties the meter: blocked, the guard knocked open, no damage, no knockdown
  guardUp();
  p.guard = 12;
  const hp3 = p.hp, o0 = c('player:guardOpen'), gb0 = c('player:guardBreak'), hu0 = c('player:hurt');
  const r3 = blow(30);
  assert(r3 === RESULT.BLOCKED && p.hp === hp3 && p.guard === 0, `the emptying blow is still blocked: no HP lost (${r3}, hp ${p.hp}, guard ${p.guard})`);
  assert(c('player:guardOpen') === o0 + 1 && c('player:guardBreak') === gb0 && c('player:hurt') === hu0, 'player:guardOpen once; no guard break, no hurt');
  assert(p.state === 'stagger' && !p.blocking, `the guard is knocked open: a stagger (${p.state})`);
  const r3b = blow(10);
  assert(r3b === RESULT.HIT && p.hp === hp3 - 10, `a blow in the opening lands (${r3b})`);
  let openT = 0, down = false;
  for (let i = 0; i < 120 && p.state === 'stagger'; i++) { G.tick(DT); openT += DT; }
  for (let i = 0; i < 70; i++) { G.tick(DT); if (p.state === 'knockdown' || p.state === 'guardBreak') down = true; }
  assert(!down && openT < GUARD.openDur + 0.5, `it ends by itself with no knockdown (${openT.toFixed(2)} s)`);
  assert(p.blocking && p.guard > 20, `RMB still held: the guard is up again and the meter refilling (${p.state}, ${p.guard.toFixed(1)})`);
  input.up(1);

  // 4) a parry gives guard back at once; a perfect one more
  settle(G);
  place(G, 6);
  p.guard = 20;
  p.guardWait = 5;
  const pa = forceAttack(G, 'bite', { answer: 'parry' });
  assert(pa.res === RESULT.PARRIED && p.guard >= 20 + GUARD.parry.blue - 1e-6, `a parried bite gives ${GUARD.parry.blue} back at once (${p.guard.toFixed(1)})`);

  // 5) a cut of his own that lands gives a little back
  settle(G);
  place(G, 3, Math.PI / 2);
  p.guard = 20;
  p.guardWait = 5;
  const h0 = c('player:hitDragon');
  p._buffer('light');
  for (let i = 0; i < 60 && c('player:hitDragon') === h0; i++) G.tick(DT);
  assert(c('player:hitDragon') > h0 && near(p.guard, 20 + GUARD.hit.light, 1e-6), `a light cut that lands gives ${GUARD.hit.light} back (${p.guard.toFixed(1)})`);

  // 6) a contact stream (no knockback: the breath's ticks, a bullet) keeps its chip and leaves the meter alone
  guardUp();
  const hp6 = p.hp;
  const r6 = p.takeHit({ damage: 10, tell: TELL.NORMAL, attack: 'breath', attacker: d, knockback: 0 });
  assert(r6 === RESULT.BLOCKED && near(hp6 - p.hp, 10 * (1 - DEFENSE.blockReduction.normal), 1e-6) && p.guard === p.maxGuard, `a blocked stream tick chips HP and costs no guard (hp −${(hp6 - p.hp).toFixed(1)}, guard ${p.guard})`);
  input.up(1);

  // 7) a rest and a respawn fill it; the HUD shows it
  p.guard = 5;
  game.hud.update(DT);
  const bar = cls('guard');
  assert(!!bar && bar.classList.contains('low'), 'the HUD has a guard bar, marked low under ' + GUARD.low);
  p.respawn();
  assert(p.guard === p.maxGuard, 'a respawn fills the meter');
  return G;
}

// ================================================================== scenario: block (hold RMB)
async function scenarioBlock() {
  out('\n== scenario BLOCK (hold RMB: normal swipe, blue bite; the charged cleave; RMB cancels a charge) ==');
  const G = build();
  const { game } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player;
  settle(G);
  place(G, 5.5, 0.5);
  const r = forceAttack(G, 'swipe', { hold: true });
  const want = 0; // (a blocked blow costs guard, not HP: GUARD, scenario GUARD)
  out(`   swipe: tell ${r.tell} result ${r.res} hp ${r.hp0} → ${r.hpAtHit} (expected -${want.toFixed(2)}), guard ${p.guard.toFixed(1)}`);
  assert(r.tell === TELL.NORMAL, 'swipe announces a normal tell');
  assert(r.res === RESULT.BLOCKED, `held guard → 'blocked' (got ${r.res})`);
  assert(near(r.hp0 - r.hpAtHit, want, 0.01), `a blocked blow takes no HP (${(r.hp0 - r.hpAtHit).toFixed(2)})`);
  assert(evn(r, 'player:block') === 1 && evn(r, 'player:hurt') === 0, 'player:block emitted, no player:hurt');
  assert(evn(r, 'player:parry') === 0, 'holding block from before the windup is not a parry');
  settle(G);
  place(G, 6);
  const b = forceAttack(G, 'bite', { hold: true });
  const wantB = 0;
  out(`   bite: result ${b.res} hp ${b.hp0} → ${b.hpAtHit} (expected -${wantB.toFixed(2)})`);
  assert(b.res === RESULT.BLOCKED && near(b.hp0 - b.hpAtHit, wantB, 0.01), `a blocked blue bite takes no HP either (${(b.hp0 - b.hpAtHit).toFixed(2)})`);
  assert(p.blocking === true || p.state === 'block', 'guard still up after a blocked blue hit');
  // the charged cleave: hold LMB past the charge threshold, release (no stamina cost). From the flank:
  // the 25 % bigger wyrm's chest sits above sword height, so straight ahead only the head (when low) is in reach
  settle(G);
  place(G, 3, Math.PI / 2);
  const seen = [];
  G.watch = (n, dd) => { if (/^player:(charge|attack|hitDragon)$/.test(n)) seen.push([n, dd]); };
  G.input.press(2);
  run(G, 1.3, { passive: true });
  const charging = p.state === 'charge', k = p.chargeK;
  G.input.up(2);
  run(G, 1.0, { passive: true });
  const ch = seen.filter((e) => e[0] === 'player:charge'), atk = seen.filter((e) => e[0] === 'player:attack'), hit = seen.find((e) => e[0] === 'player:hitDragon');
  out(`   heavy: charging ${charging} k ${k?.toFixed(2)} · charge events ${ch.length} (t ${ch[0]?.[1]?.t}) · attacks ${JSON.stringify(atk.map((e) => e[1]))} · hit ${hit ? `${hit[1].damage} heavy ${hit[1].heavy}` : 'none'}`);
  assert(charging && k >= 0.99 && ch.length === 1 && ch[0][1].t > 0, 'LMB hold → charge state, one player:charge {t}');
  assert(atk.length === 1 && atk[0][1].kind === 'cleave' && atk[0][1].charge >= 0.99, 'release → one player:attack {kind:cleave, charge 1} (no light swing first)');
  assert(hit?.[1]?.heavy === true && hit?.[1]?.kind === 'cleave', 'the charged cleave connects (player:hitDragon heavy, kind cleave)');
  // RMB cancels a charge into the guard; releasing LMB afterwards does not fire the heavy
  settle(G);
  seen.length = 0;
  G.input.press(2);
  run(G, 0.6, { passive: true });
  const wasCharging = p.state === 'charge';
  G.input.press(1);
  run(G, 0.1, { passive: true });
  const blockingNow = p.state === 'block' && p.blocking;
  G.input.up(2);
  run(G, 0.5, { passive: true });
  G.input.up(1);
  run(G, 0.3, { passive: true });
  G.watch = null;
  assert(wasCharging && blockingNow && !seen.some((e) => e[0] === 'player:attack'), `RMB cancels a charge into block, no heavy on release (${seen.map((e) => e[0]).join(',')})`);
  return G;
}

// ================================================================== scenario: reach (every hero attack, from the front)
async function scenarioReach() {
  out('\n== scenario REACH (idle wyrm, hero straight in front: the five hits of the chain, the five heavy branches and the charged cleave at 2-3.5 m) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player;
  settle(G);
  const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
  // the wyrm's front hurt surface at sword reach: the most forward body sphere (its chest, 2-4 m up)
  const chest = () => d.hurtSpheres.filter((h) => h.part === 'body').reduce((a, h) => ((h.x - d.position.x) * fx + (h.z - d.position.z) * fz > (a.x - d.position.x) * fx + (a.z - d.position.z) * fz ? h : a));
  const surf = () => { const c = chest(); return Math.hypot(p.position.x - c.x, p.position.z - c.z) - c.r; };
  const c0 = chest();
  out(`   chest sphere: ${((c0.x - d.position.x) * fx + (c0.z - d.position.z) * fz).toFixed(2)} m ahead of the root, y ${c0.y.toFixed(2)} (r ${c0.r.toFixed(2)}): above sword height`);
  /** Hero `gap` m (horizontal) from the chest surface, straight in front, facing it; fresh wyrm. */
  const stand = (gap) => {
    const c = chest();
    p.debug.teleport(c.x + fx * (c.r + gap), c.z + fz * (c.r + gap));
    p.yaw = Math.atan2(c.x - p.position.x, c.z - p.position.z);
    p.debug.heal();
    aimAt(G);
  };
  const fresh = () => { d.hp = d.maxHp; d.posture = 0; run(G, 1.0, { passive: true }); settle(G); };
  const KINDS = { L1: 'light', L2: 'light', L3: 'light', L4: 'light', slam: 'slam', cleave: 'cleave', H0: 'heavy', H1: 'heavy', H2: 'heavy', H3: 'heavy', H4: 'slam' };
  // the heavy branches (ADR-115): n lights in open air, then the heavy press in the n-th one's recovery
  const { HEAVY: HV } = await imp('src/entities/player/combat.js');
  const HNAME = { H0: HV[0].name, H1: HV[1].name, H2: HV[2].name, H3: HV[3].name, H4: HV[4].name };
  const CLICKS = { L1: 1, L2: 2, L3: 3, L4: 4, slam: 5 }; // the 5-hit chain (ADR-041): falling cut, rising cut, whirl, stab, slam
  const CHARGE_HOLD = 1.3; // s: a full charge
  /** One measured attack at `gap`; earlier combo hits swing in open air far from the wyrm. */
  const trial = (name, gap) => {
    fresh();
    let hit = null, at = NaN, slamEv = 0;
    const kinds = [], names = [];
    if (name[0] === 'H') {
      const n = Number(name[1]);
      if (n > 0) { p.debug.teleport(d.position.x + fx * 40, d.position.z + fz * 40); aimAt(G); }
      for (let k = 0; k < n; k++) {
        aimAt(G);
        input.click(0);
        run(G, CHAIN_EVERY, { passive: true });
      }
      stand(gap);
      at = surf();
      G.watch = (nn, dd) => { if (nn === 'player:hitDragon' && !hit) hit = dd; if (nn === 'player:attack') { kinds.push(dd.kind); names.push(dd.name); } };
      aimAt(G);
      input.click(2);
      run(G, 1.5, { passive: true });
    } else if (name === 'cleave') {
      stand(gap);
      at = surf();
      G.watch = (n, dd) => { if (n === 'player:hitDragon' && !hit) hit = dd; if (n === 'player:attack') kinds.push(dd.kind); };
      input.press(2);
      run(G, CHARGE_HOLD, { passive: true });
      aimAt(G);
      input.up(2);
      run(G, 1.0, { passive: true });
    } else {
      const n = CLICKS[name];
      if (n > 1) { p.debug.teleport(d.position.x + fx * 40, d.position.z + fz * 40); aimAt(G); }
      for (let k = 0; k < n; k++) {
        if (k === n - 1) {
          stand(gap);
          at = surf();
          G.watch = (nn, dd) => { if (nn === 'player:hitDragon' && !hit) hit = dd; if (nn === 'player:attack') kinds.push(dd.kind); if (nn === 'player:slam') slamEv++; };
        }
        aimAt(G);
        input.click(0);
        run(G, k < n - 1 ? CHAIN_EVERY : 1.3, { passive: true });
      }
    }
    G.watch = null;
    return { name, gap, at, hit, kinds, names, slamEv };
  };
  // (CHARGE_HOLD hoisted above)
  const rows = [];
  p.anim.forceVariant = 0; // each hit's own `anim`; the variants are swung below
  for (const gap of [0, 2, 2.5, 3, 3.5]) {
    const r = ['L1', 'L2', 'L3', 'L4', 'slam', 'cleave', 'H0', 'H1', 'H2', 'H3', 'H4'].map((nm) => trial(nm, gap));
    rows.push(r);
    out(`   ${gap ? `${gap.toFixed(1)} m` : 'contact'}`.padEnd(12) + r.map((t) => `${t.name} ${t.hit ? `${t.hit.kind}/${t.hit.part} ${Math.round(t.hit.damage)}` : 'MISS'} @${t.at.toFixed(2)}`.padEnd(30)).join(''));
  }
  p.anim.forceVariant = null;
  for (const r of rows) for (const t of r) {
    if (t.name[0] !== 'H') continue;
    assert(t.names[0] === HNAME[t.name], `${t.name}: ${t.name[1]} light${t.name[1] === '1' ? '' : 's'} then heavy is ${HNAME[t.name]} (${t.names[0]})`);
  }
  for (const r of rows) for (const t of r) {
    const where = t.gap ? `${t.gap} m` : 'contact';
    assert(!!t.hit && t.hit.kind === KINDS[t.name] && t.kinds[0] === KINDS[t.name], `${t.name} connects from the front at ${where} (${t.hit ? `${t.hit.kind} on ${t.hit.part}` : 'miss'}, hero ${t.at.toFixed(2)} m from the chest surface)`);
  }
  // every look of every hit (combat.js `variants`, Session 16) connects too: forced one by one
  {
    const { LIGHT } = await imp('src/entities/player/combat.js');
    const names = ['L1', 'L2', 'L3', 'L4', 'slam'];
    const misses = [];
    let n = 0;
    names.forEach((nm, si) => {
      const count = 1 + (LIGHT[si].variants?.length ?? 0);
      for (let v = 1; v < count; v++) {
        for (const gap of [0, 2, 3.5]) {
          p.anim.forceVariant = v;
          const t = trial(nm, gap);
          p.anim.forceVariant = null;
          n++;
          if (!(t.hit && t.hit.kind === KINDS[nm])) misses.push(`${nm}#${v}@${gap}`);
        }
      }
    });
    out(`   variants: ${n} trials (each variant at contact, 2 and 3.5 m), misses: ${misses.join(', ') || 'none'}`);
    assert(n >= 24 && !misses.length, `every attack variant connects from the front at contact, 2 m and 3.5 m (${n} trials${misses.length ? '; missed ' + misses.join(', ') : ''})`);
  }
  // the cut is drawn on the wyrm: a landed light's point on a hurt sphere's surface (the wyrm is drawn
  // as it is hit: no drawnPoint), its freeze, its camera punch
  {
    fresh();
    stand(1);
    let ev = null, stop = 0, gap = Infinity, punchZ = 0;
    // (measured as the hit is dealt: the wyrm's own update moves its spheres later in the frame)
    G.watch = (n, e) => {
      if (n !== 'player:hitDragon' || e.guarded || ev) return;
      ev = e;
      for (const h of d.hurtSpheres) gap = Math.min(gap, Math.hypot(e.point.x - h.x, e.point.y - h.y, e.point.z - h.z) - h.r);
    };
    const sounds = [], play0 = game.audio.play;
    game.audio.play = function (name, o) { if (ev && !sounds.done) sounds.push([name, o]); return play0.call(this, name, o); };
    p.anim.forceVariant = 0;
    input.click(0);
    for (let i = 0; i < 60 && !ev; i++) {
      G.tick(DT);
      if (ev) {
        stop = game.hitstopTimer;
        punchZ = game.cameraRig.punchZ;
        sounds.done = true;
      }
    }
    game.audio.play = play0;
    p.anim.forceVariant = null;
    G.watch = null;
    out(`   the wyrm's cut: ${ev ? `${ev.kind}/${ev.weight}, the point ${gap.toFixed(2)} m off the nearest hurt sphere's surface, freeze ${stop.toFixed(3)} s, punch ${punchZ.toFixed(2)} m` : 'no hit'}`);
    assert(!!ev && gap <= 0.15, `a landed cut on the wyrm is drawn on its body: ${gap.toFixed(2)} m off the nearest hurt sphere's surface (≤ 0.15)`);
    assert(!!ev && ev.weight === 'light' && ev.combo === 1 && stop >= 0.055 - 1e-6, `it freezes the frame ${stop.toFixed(3)} s (≥ 0.055) and reports its weight (${ev?.weight}, combo ${ev?.combo})`);
    assert(punchZ > 0, `a landed light punches the camera in (${punchZ.toFixed(2)} m)`);
    const hitS = sounds.filter(([n]) => n === 'hit'), cutS = sounds.filter(([n]) => n === 'cut');
    assert(hitS.length === 1 && hitS[0][1].body === 'scale' && cutS.length === 1 && cutS[0][1].weight === 'light', `it sounds as a cut on scales: ${sounds.map(([n, o]) => `${n}${o?.body ? '/' + o.body : ''}${o?.weight ? '/' + o.weight : ''}`).join(', ') || 'nothing'}`);
  }
  // a slam that lands only through its ground shards (the blade is in the ground): no cut drawn, the
  // steel does not flare, the body's hit sounds without the blade's cut layer
  {
    const { LIGHT } = await imp('src/entities/player/combat.js');
    const { CUT_LAST } = await imp('src/combat/cutFx.js');
    fresh();
    stand(1);
    let ev = null;
    const sounds = [], play0 = game.audio.play, n0 = CUT_LAST.n, c = chest();
    game.audio.play = function (name, o) { sounds.push([name, o]); return play0.call(this, name, o); };
    G.watch = (n, e) => { if (n === 'player:hitDragon' && !ev) ev = e; };
    p.bladeFlare = 0;
    try {
      p._applyHit({ def: LIGHT[4], damage: 10, poise: 0, charge: 0, t: 0.5 }, { sphere: c, x: c.x, y: 0.5, z: c.z }, true);
    } finally {
      game.audio.play = play0;
      G.watch = null;
    }
    const flare = p.bladeFlare, drawn = CUT_LAST.n - n0;
    out(`   a shards-only slam hit: ${ev ? `weight ${ev.weight}, shards ${ev.shards}` : 'no event'}, flare ${flare}, cuts drawn ${drawn}, sounds ${sounds.map(([n]) => n).join(', ') || 'none'}`);
    assert(!!ev && ev.shards === true && ev.weight === null && flare === 0 && drawn === 0 && sounds.filter(([n]) => n === 'hit').length === 1 && !sounds.some(([n]) => n === 'cut'), 'a slam landing only through its shards draws no cut, flares no steel and plays the body\'s hit without the blade\'s cut');
    fresh();
  }
  assert(rows.every((r) => r[4].slamEv === 1), 'the slam meets the ground once per swing (player:slam)');
  assert(rows.every((r) => r[4].hit?.heavy === true && r[5].hit?.heavy === true && r.slice(0, 4).every((t) => t.hit?.heavy === false)), 'the slam and the cleave hit heavy, the four light hits do not');
  return G;
}

// ================================================================== scenario: red tells (tail, stomp)
async function scenarioRed() {
  out('\n== scenario RED (tail / stomp: block fails, perfect dodge → the plunge → crit) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player;
  // the wyrm itself warns (no HUD marks): uWarn ramps through the red windup, spikes on the timing
  // flash and decays; the HUD only flashes the screen edges on the cue; parryable windups never glow
  {
    const W = TELL_STYLE.red.warn;
    const mats = Object.values(d.model.mats);
    assert(mats.length > 0 && mats.every((m) => m.uniforms.uWarn?.value?.isVector4), 'every dragon material has a uWarn vec4');
    assert(!cls('ab-tell') && !cls('ab-tells'), 'no HUD tell marks exist');
    settle(G);
    place(G, 16); // out of reach: only watch the tell
    const tr = warnTrace(G, 'tail', 5);
    const { tellI: ti, flashI: fi } = tr;
    const wind = tr.w.slice(ti, fi);
    const after = fi + Math.ceil(W.decay / DT) + 1;
    out(`   tail warn: tell@${ti} flash@${fi} · windup ${wind[0]?.toFixed(3)} → ${wind[wind.length - 1]?.toFixed(3)} · flash ${tr.w[fi]?.toFixed(3)} · +${W.decay}s ${tr.w[after]?.toFixed(3)} · edge at flash ${tr.edge[fi]}`);
    assert(tr.trigger && ti >= 0 && fi > ti, `tail tell + flash seen (tell@${ti} flash@${fi})`);
    assert(tr.w.slice(0, ti).every((v) => v === 0), 'no red glow before the red tell');
    assert(wind.length > 10 && near(wind[0], W.from, 0.03) && wind[wind.length - 1] > W.to - 0.1 && wind.every((v, i) => v >= W.from - 1e-9 && v <= W.to + 1e-9 && (i === 0 || v >= wind[i - 1] - 1e-9)), 'red windup glow ramps from→to between tell and flash');
    assert(near(tr.w[fi], W.spike, 1e-6), `red glow spikes on the timing flash (${tr.w[fi]})`);
    assert(tr.w.slice(fi, after).every((v, i, a) => i === 0 || v <= a[i - 1] + 1e-9) && tr.w[after] === 0, 'spike decays to 0 within the decay time');
    assert(tr.uniformOk && tr.finite, 'every material uWarn.w follows dragon.warn (finite)');
    assert(tr.edge.slice(0, fi).every((v) => v === 0) && tr.edge[fi] > 0.2, `HUD red edge only flashes on the cue (${tr.edge[fi]})`);
    assert(tr.edge[tr.edge.length - 1] === 0, 'HUD red edge flash fades out');
    // parryable: no glow, no edge flash (the white glint is a particle burst)
    settle(G);
    place(G, 16);
    const bt = warnTrace(G, 'bite', 3);
    // (the bite is a parry moment since ADR-118: a blue flare, the screen edge in blue; an ordinary
    // blow, the swipe, shows nothing on the body or the edge)
    assert(bt.flashI >= 0 && Math.max(...bt.w) === 0 && bt.edge[bt.flashI] > 0.2 && /\bblue\b/.test(cls('ab-edges')?.className ?? ''), `blue bite (a parry moment): no glow on the body, the screen edge flashes blue (flash@${bt.flashI} edge ${bt.edge[bt.flashI]})`);
    run(G, 2.5, { passive: true });
    const sw = warnTrace(G, 'swipe', 3);
    assert(sw.flashI >= 0 && Math.max(...sw.w) === 0 && Math.max(...sw.edge) === 0, `swipe (an ordinary blow): no glow / edge (flash@${sw.flashI})`);
    // a stagger mid-windup clears the glow at once
    settle(G);
    place(G, 16);
    const st = warnTrace(G, 'tail', 5, (t) => t.w[t.w.length - 1] > 0.3);
    assert(st.w[st.w.length - 1] > 0.3 && d.debug.stagger() === true, 'stagger mid red windup');
    G.tick(DT);
    assert(d.warn === 0 && mats.every((m) => m.uniforms.uWarn.value.w === 0), `stagger clears the red glow (${d.warn})`);
  }
  // holding block against red: guard break, full damage
  settle(G);
  place(G, 6);
  const gb = forceAttack(G, 'tail', { hold: true });
  out(`   tail vs guard: tell ${gb.tell} result ${gb.res} hp ${gb.hp0} → ${gb.hpAtHit} state ${p.state}`);
  assert(gb.tell === TELL.RED, 'tail announces a red tell');
  assert(gb.res === RESULT.HIT && evn(gb, 'player:guardBreak') === 1, `guard break on a red attack (got ${gb.res})`);
  assert(near(gb.hp0 - gb.hpAtHit, TUNING.attacks.tail.damage * (TUNING.damageScale ?? 1), 0.01), `guard break takes full damage (${gb.hp0 - gb.hpAtHit})`);
  assert(evn(gb, 'player:block') === 0, 'no player:block on a red attack');
  // a timed RMB tap does not parry red either
  settle(G);
  place(G, 6);
  const rp = forceAttack(G, 'tail', { answer: 'parry' });
  assert(rp.res === RESULT.HIT && evn(rp, 'player:parry') === 0, `red tail is not parryable (got ${rp.res})`);
  // perfect dodge: Space 0.1 s before impact → the plunge onto the wyrm's head (slow-mo at the
  // vanish), then the landing in front of the head with the crit window open (scenario PLUNGE
  // covers the move itself). The plunge is one of the flurry's arts (scenario FLURRY): pinned here,
  // and each dodge the first of its streak (one blow)
  p.debug.flurryArt = 'skyfall';
  p.debug.streak(0);
  settle(G);
  place(G, 6);
  const pd = forceAttack(G, 'tail', { answer: 'dodge', settle: 1 });
  out(`   tail dodge: Space ${(pd.pressLead ?? NaN).toFixed(3)} s before · result ${pd.res} · state ${p.state} · slow-mo x${game.hitstopScale} for ${game.hitstopTimer.toFixed(2)} s`);
  assert(pd.res === RESULT.PERFECT, `perfect dodge → 'perfectDodge' (got ${pd.res})`);
  assert(evn(pd, 'player:perfectDodge') === 1 && evn(pd, 'player:ghostep') === 1, 'player:perfectDodge + player:ghostep emitted');
  assert(pd.hpAtHit === pd.hp0, 'no damage on a perfect dodge');
  assert(p.state === 'plunge', `a perfect dodge of the wyrm in range → the plunge (state ${p.state})`);
  assert(near(game.hitstopScale, DEFENSE.ghostep.slowmoScale, 1e-6) || p.slowmoPending > 0, `Ghostep slow-mo x${DEFENSE.ghostep.slowmoScale} (got x${game.hitstopScale})`);
  run(G, 4, { passive: true }, () => p.state !== 'plunge');
  {
    const dist = Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z);
    out(`   the plunge landed ${dist.toFixed(2)} m from the wyrm's root, y ${p.position.y}, crit ${p.critTimer.toFixed(2)}`);
    assert(p.state !== 'plunge' && p.position.y === 0 && Number.isFinite(dist), 'the plunge ends back on the ground');
  }
  assert(p.critTimer > 0, `crit window open after the landing (critTimer ${p.critTimer.toFixed(2)})`);
  // the next hit carries crit
  let crit = null;
  G.watch = (n, dd) => { if (n === 'player:hitDragon' && !crit) crit = dd; };
  for (let i = 0; i < 120 && !crit && p.critTimer > 0; i++) {
    input.axis = { x: 0, y: 0 };
    if (i % 12 === 0) input.click(0);
    G.tick(DT);
  }
  G.watch = null;
  out('   first hit after the plunge:', crit ? `damage ${crit.damage} part ${crit.part} crit ${crit.crit}` : 'none');
  assert(crit?.crit === true, 'next hit inside the crit window carries crit');
  // stomp: red AoE, perfect dodge as well
  p.debug.streak(0);
  settle(G);
  place(G, 3.6);
  const st = forceAttack(G, 'stomp', { answer: 'dodge', settle: 1 });
  out(`   stomp dodge: result ${st.res}`);
  assert(st.tell === TELL.RED && st.res === RESULT.PERFECT && evn(st, 'player:ghostep') === 1, `stomp perfect dodge → the plunge's blink (got ${st.res})`);
  // a posture break (dragon freeze-frame) during the Ghostep slow-mo must not turn it into a freeze
  const slow0 = game.hitstopScale, left0 = game.hitstopTimer;
  assert(d.debug.postureBreak() === true, 'posture break during the Ghostep slow-mo');
  G.tick(DT);
  out(`   slow-mo x${slow0} ${left0.toFixed(2)} s left → after the break x${game.hitstopScale} ${game.hitstopTimer.toFixed(2)} s`);
  assert(near(game.hitstopScale, DEFENSE.ghostep.slowmoScale, 1e-6), `Ghostep slow-mo survives the break freeze (x${game.hitstopScale})`);
  // (ADR-102) a WHITE or heavy blow can be parried: its perfect dodge counts in the streak and gives
  // the slow-mo where he stands, but no plunge, no flurry and no crit window
  run(G, 4, { passive: true }, () => p.state !== 'plunge' && p.state !== 'flurry');
  settle(G);
  place(G, 6);
  p.debug.streak(0);
  {
    p.critTimer = 0; // (the plunge above left its window open)
    const hpW = d.hp, at = p.position.clone();
    const wd = forceAttack(G, 'bite', { answer: 'dodge', settle: 1 });
    const moved = Math.hypot(p.position.x - at.x, p.position.z - at.z);
    assert(wd.res === RESULT.PERFECT && p.state === 'ghostep' && p.streak === 1 && p.position.y === 0, `a perfect dodge of the bite (a heavy blow that can be parried) is no plunge (${wd.res}, state ${p.state}, streak ${p.streak})`);
    assert(d.hp === hpW && moved < 5 && p.critTimer <= DEFENSE.ghostep.critWindowWhite + 1e-6, `the wyrm is not hurt, the hero stays where he dodged (${moved.toFixed(1)} m), no crit window (${p.critTimer.toFixed(2)} s)`);
    assert(evn(wd, 'player:perfectDodge') === 1 && evn(wd, 'player:ghostep') === 1 && !evn(wd, 'player:plunge') && !evn(wd, 'player:flurry'), 'player:perfectDodge + player:ghostep, no plunge, no flurry');
  }
  return G;
}

// ================================================================== scenario: the plunge (contract 2, player side)
/** Projected NDC of a world point with the game camera (the real CameraRig drives it). */
function ndc(G, x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(G.game.camera);
  return { x: v.x, y: v.y, ok: Number.isFinite(v.x + v.y) && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
}

async function scenarioPlunge() {
  out('\n== scenario PLUNGE (perfect dodge → dive onto the head, ride, backflip off; plunge:false / out of range / no API; execution; in the air) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player, P = DEFENSE.plunge;
  const bound = CONFIG.world.playerBound;
  const head = new THREE.Vector3();
  const inBody = (x, z, r) => d.bodyCircles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r);
  /** Tick until the plunge ends (≤ max s): its track, i-frames, camera framing, phases seen. */
  const ride = (max = 5) => {
    const tr = { maxY: 0, phases: new Set(), iframes: true, finite: true, offscreen: 0, frames: 0, ignored: true };
    for (let i = 0; i < Math.round(max / DT) && p.state === 'plunge'; i++) {
      aimAt(G);
      G.tick(DT);
      if (p.state !== 'plunge') break;
      tr.frames++;
      tr.phases.add(p.plungeAnim.phase);
      tr.maxY = Math.max(tr.maxY, p.position.y);
      if (!p.isInvulnerable()) tr.iframes = false;
      if (![p.position.x, p.position.y, p.position.z].every(Number.isFinite)) tr.finite = false;
      // the camera keeps the hero and the head on screen through the move
      d.plungePoint(head);
      // (the vanish is invisible: the camera only has to have him once he reappears)
      if (p.plungeAnim.phase > 0 && (!ndc(G, p.position.x, p.position.y + 1.1, p.position.z).ok || !ndc(G, head.x, head.y, head.z).ok)) {
        tr.offscreen++;
        if (process.env.ABYSS_TRACE) out('     OFF', p.plungeAnim.phase, p.plungeAnim.u.toFixed(2), JSON.stringify(ndc(G, p.position.x, p.position.y + 1.1, p.position.z)), JSON.stringify(ndc(G, head.x, head.y, head.z)));
      }
      if (i === 5) {
        const hp = p.hp;
        tr.ignored = p.takeHit({ damage: 40, tell: TELL.NORMAL, attack: 'bite', from: { x: d.position.x, z: d.position.z }, attacker: d, knockback: 3 }) === RESULT.IGNORED && p.hp === hp;
      }
    }
    tr.state = p.state;
    return tr;
  };
  const since = (c0, n) => (G.counts[n] || 0) - (c0[n] || 0);
  // (the plunge is one of the flurry's arts, scenario FLURRY: pinned here, and every perfect dodge
  // below is the first of its streak: one blow)
  p.debug.flurryArt = 'skyfall';
  p.debug.flurryAny = true; // (the move itself is tested here, on a bite; which tells it answers: scenario RED)

  // 1) a perfect dodge of the bite, in range → the plunge, one hit on the head, a landing in front
  p.debug.streak(0);
  settle(G);
  place(G, 6);
  const origin = p.position.clone();
  const hp0 = d.hp, c0 = { ...G.counts };
  const r = forceAttack(G, 'bite', { answer: 'dodge', settle: 1 });
  const plunging = p.state === 'plunge';
  const lift = p.position.y;
  const head0 = d.plungePoint(new THREE.Vector3()), root0 = d.position.clone(), yaw0 = d.yaw, dir0 = { x: p.pl.dx, z: p.pl.dz };
  const tr = ride();
  const dealt = hp0 - d.hp;
  d.plungePoint(head);
  const L = p.position;
  // measured from the head where he dodged it (the wyrm's reaction moves the head afterwards)
  const toO = { x: origin.x - head0.x, z: origin.z - head0.z }, toL = { x: L.x - head0.x, z: L.z - head0.z };
  const side = (toO.x * toL.x + toO.z * toL.z) / ((Math.hypot(toO.x, toO.z) * Math.hypot(toL.x, toL.z)) || 1);
  const F0 = { x: Math.sin(yaw0), z: Math.cos(yaw0) };
  const ahead = (L.x - root0.x) * F0.x + (L.z - root0.z) * F0.z - ((head0.x - root0.x) * F0.x + (head0.z - root0.z) * F0.z);
  out(`   geometry: root ${root0.x.toFixed(1)},${root0.z.toFixed(1)} yaw ${yaw0.toFixed(2)} · head at the dodge ${head0.x.toFixed(1)},${head0.z.toFixed(1)} · origin ${origin.x.toFixed(1)},${origin.z.toFixed(1)} · spring-off dir ${dir0.x.toFixed(2)},${dir0.z.toFixed(2)} · head now ${head.x.toFixed(1)},${head.z.toFixed(1)} · landed ${L.x.toFixed(1)},${L.z.toFixed(1)}`);
  out(`   bite dodge: ${r.res} → state ${plunging ? 'plunge' : p.state}, reappears ${lift.toFixed(1)} m up · phases ${[...tr.phases].join('')} in ${(tr.frames * DT).toFixed(2)} s · max y ${tr.maxY.toFixed(1)} · head damage ${dealt} · landed ${Math.hypot(toL.x, toL.z).toFixed(1)} m from the head (cos to the origin side ${side.toFixed(2)}, ${ahead.toFixed(1)} m ahead) · crit ${p.critTimer.toFixed(2)} · off-screen frames ${tr.offscreen}`);
  assert(r.res === RESULT.PERFECT && plunging, `a perfect dodge of the wyrm in range → the plunge (${r.res}, ${plunging})`);
  assert(evn(r, 'player:perfectDodge') === 1 && evn(r, 'player:ghostep') === 1, 'player:perfectDodge + player:ghostep still emitted (the HUD call-out, stats)');
  assert(lift >= P.appearUp && lift > head.y, `reappears above the head (${lift.toFixed(1)} m)`);
  assert(tr.ignored, 'hits are ignored mid-plunge');
  assert(tr.iframes && tr.finite, 'invulnerable and finite throughout');
  assert([1, 2, 3, 4, 5].every((ph) => tr.phases.has(ph)), `hang → dive → ride → flip → land (${[...tr.phases].join('')})`);
  assert(since(c0, 'player:plunge') === 1 && since(c0, 'player:plungeHit') === 1, `one dive, one hit (${since(c0, 'player:plunge')} / ${since(c0, 'player:plungeHit')})`);
  assert(near(dealt, P.damage, 1), `the blade hits the head once: ${dealt} (DEFENSE.plunge.damage ${P.damage}, final: onPlunge takes it exact)`);
  assert(tr.state !== 'plunge' && tr.frames * DT < 3.2, `the move ends (${(tr.frames * DT).toFixed(2)} s)`);
  assert(L.y === 0 && Math.hypot(L.x, L.z) <= bound && !inBody(L.x, L.z, p.radius - 0.05), 'lands on the ground, inside the arena, clear of the body');
  assert(side > 0.3 && ahead > 0 && Math.hypot(toL.x, toL.z) >= P.landMin - 1, `lands in front of the head, toward where he came from (cos ${side.toFixed(2)}, ${ahead.toFixed(1)} m ahead of it)`);
  assert(p.critTimer > 0, 'the crit window is open after the landing');
  assert(tr.offscreen === 0, `the camera kept the hero and the head on screen (${tr.offscreen} frames off)`);

  // 2) a hit that forbids the plunge (hazards: plunge:false) → slow-mo + crit, no teleport
  settle(G);
  place(G, 6);
  input.axis = { x: 1, y: 0 };
  input.tap('Space');
  G.tick(DT);
  G.tick(DT);
  input.axis = { x: 0, y: 0 };
  const pos = p.position.clone();
  const c1 = { ...G.counts };
  const r2 = p.takeHit({ damage: 30, tell: TELL.RED, kind: 'meteor', attack: 'meteor', from: { x: pos.x + 1, z: pos.z }, attacker: d, knockback: 3, plunge: false });
  out(`   plunge:false: ${r2} → state ${p.state}, moved ${pos.distanceTo(p.position).toFixed(2)} m, crit ${p.critTimer.toFixed(2)}`);
  assert(r2 === RESULT.PERFECT && p.state === 'ghostep' && pos.distanceTo(p.position) < 0.3 && p.critTimer > 0, 'plunge:false → a perfect dodge without the teleport (slow-mo + crit)');
  assert(since(c1, 'player:plunge') === 0 && since(c1, 'player:perfectDodge') === 1, 'no plunge, one perfect dodge');

  // 3) out of range (> DEFENSE.plunge.range from the head) → no teleport either
  settle(G);
  d.plungePoint(head);
  {
    const a = d.yaw + Math.PI;
    const far = P.range + 3;
    let x = head.x + Math.sin(a) * far, z = head.z + Math.cos(a) * far;
    if (Math.hypot(x, z) > bound - 1) { x = head.x - Math.sin(a) * far; z = head.z - Math.cos(a) * far; }
    p.debug.teleport(x, z);
  }
  input.axis = { x: 0, y: 1 };
  input.tap('Space');
  G.tick(DT);
  input.axis = { x: 0, y: 0 };
  const posF = p.position.clone();
  const r3 = p.takeHit({ damage: 20, tell: TELL.RED, attack: 'fireball', from: { x: d.position.x, z: d.position.z }, attacker: d, knockback: 3 });
  out(`   out of range (${Math.hypot(posF.x - head.x, posF.z - head.z).toFixed(1)} m from the head): ${r3} → state ${p.state}`);
  assert(r3 === RESULT.PERFECT && p.state === 'ghostep' && posF.distanceTo(p.position) < 0.3, 'out of range → a perfect dodge in place');

  // 4) an attacker without the plunge API → the v0.2 Ghostep (blink behind it)
  settle(G);
  place(G, 6);
  const mob = { position: new THREE.Vector3(p.position.x + 3, 0, p.position.z), yaw: -Math.PI / 2 };
  input.axis = { x: 1, y: 0 };
  input.tap('Space');
  G.tick(DT);
  input.axis = { x: 0, y: 0 };
  const r4 = p.takeHit({ damage: 20, tell: TELL.RED, attack: 'slash', attacker: mob, knockback: 2 });
  const behind = (p.position.x - mob.position.x) * Math.sin(mob.yaw) + (p.position.z - mob.position.z) * Math.cos(mob.yaw);
  out(`   no plunge API: ${r4} → ${behind.toFixed(2)} m along its facing`);
  assert(r4 === RESULT.PERFECT && p.state === 'ghostep' && behind < -1, 'an attacker without plungePoint / onPlunge: Ghostep behind it');

  // 5) execution: posture broken, attack within execRange of the head → the plunge from the hang
  run(G, 1.5, { passive: true });
  settle(G);
  place(G, 6);
  assert(d.debug.postureBreak() === true, 'posture break (Lab)');
  run(G, 0.6, { passive: true });
  d.plungePoint(head);
  {
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    p.debug.teleport(head.x + fx * 4, head.z + fz * 4);
    aimAt(G);
  }
  const c5 = { ...G.counts }, hp5 = d.hp;
  let execEv = null;
  G.watch = (n, dd) => { if (n === 'player:plunge') execEv = dd; };
  input.click(0);
  G.tick(DT);
  const execStarted = p.state === 'plunge' && p.pl.exec === true;
  const tr5 = ride();
  G.watch = null;
  const dealt5 = hp5 - d.hp;
  out(`   execution: started ${execStarted} · event ${JSON.stringify(execEv)} · damage ${dealt5} · broken after ${d.broken} · perfectDodge events ${since(c5, 'player:perfectDodge')}`);
  assert(execStarted && execEv?.execution === true, 'attack near a broken wyrm\'s head → the plunge as an execution (player:plunge {execution: true})');
  assert(since(c5, 'player:perfectDodge') === 0 && since(c5, 'player:attack') === 0, 'no perfect dodge, no light swing');
  assert(dealt5 >= P.execDamage, `execution damage ${dealt5} (≥ DEFENSE.plunge.execDamage ${P.execDamage})`);
  assert(tr5.state !== 'plunge' && p.position.y === 0 && !d.broken, 'the execution lands and consumes the break');

  // 6) onto a wyrm in the air (the leap): the camera keeps both on screen, he lands on the ground
  settle(G);
  place(G, 11);
  game.lab.trigger('leap');
  run(G, 3, { passive: true }, () => d.state === 'airborne' && d.rig.s.alt > 6);
  const alt = d.rig.s.alt;
  const started = p.debug.plunge(false);
  const tr6 = ride(6);
  out(`   in the air: wyrm alt ${alt.toFixed(1)} m · plunge ${started} · max y ${tr6.maxY.toFixed(1)} · phases ${[...tr6.phases].join('')} · landed y ${p.position.y} · off-screen ${tr6.offscreen} · wyrm ${d.state}`);
  assert(started && alt > 6 && tr6.maxY > alt + 5, 'the plunge reaches a flying wyrm\'s head');
  assert(tr6.state !== 'plunge' && tr6.finite && p.position.y === 0 && Math.hypot(p.position.x, p.position.z) <= bound, 'and lands on the ground inside the arena');
  assert(tr6.offscreen === 0, `the camera kept the hero and the head on screen in the air (${tr6.offscreen} frames off)`);

  // 7) the flying wyrm alone (no plunge): its head stays framed through the leap
  settle(G);
  place(G, 11);
  game.lab.trigger('leap');
  let air = 0, airOff = 0;
  for (let i = 0; i < Math.round(4 / DT); i++) {
    aimAt(G);
    G.tick(DT);
    if (d.state !== 'airborne' || d.rig.s.alt < 4) continue;
    air++;
    const hs = d.hurtSpheres.find((h) => h.part === 'head');
    if (!ndc(G, hs.x, hs.y, hs.z).ok || !ndc(G, p.position.x, 1.1, p.position.z).ok) airOff++;
  }
  out(`   the leap: ${air} airborne frames, head or hero off screen in ${airOff}`);
  assert(air > 20 && airOff <= 2, `the leap keeps the flying head and the hero on screen (${airOff} of ${air} frames off)`);
  // shooting fire while flying: a perfect dodge of the burning pass's stream (a hazard spawned with
  // plunge: true) sends the hero onto the flying wyrm's head; it crashes out of the air
  settle(G);
  d.hazards.clear();
  d.position.set(0, 0, -8); // the arena's middle, facing south: the pass has room to run over him
  d.yaw = 0;
  d.rig.snap();
  run(G, 0.3, { passive: true });
  place(G, 18);
  const hpF = d.hp, cF = { ...G.counts };
  p.debug.streak(0);
  let airAtDodge = false;
  const hF0 = G.hits.length;
  const rF = forceAttack(G, 'skyStrafe', { answer: 'dodge', settle: 1, max: 7 });
  if (process.env.ABYSS_TRACE) out('     strafe hits', JSON.stringify(G.hits.slice(hF0)), 'pressLead', rF.pressLead, 'flashT', rF.flashT, 'impactT', rF.impactT, 'hero', p.position.x.toFixed(1), p.position.z.toFixed(1), 'hz', d.hazards.count());
  airAtDodge = d.state === 'airborne' || d.rig.s.alt > 1;
  const plungedF = p.state === 'plunge';
  const trF = ride(6);
  let crashed = false, landedF = false;
  for (let i = 0; i < Math.round(5 / DT); i++) {
    G.tick(DT);
    if (d.brain.action?.name === 'plunged' && d.rig.s.alt < 0.2) crashed = true;
    if (crashed && !d.brain.action && d.state === 'combat') { landedF = true; break; }
  }
  out(`   burning pass dodged: ${rF.res} · wyrm in the air at the dodge ${airAtDodge} · plunge ${plungedF} · phases ${[...trF.phases].join('')} · head damage ${hpF - d.hp} · crashed ${crashed} · back in combat ${landedF} (alt ${d.rig.s.alt.toFixed(2)}, ${d.state})`);
  assert(rF.res === RESULT.PERFECT && airAtDodge && plungedF, `a perfect dodge of the flying wyrm's fire stream → the plunge onto it in the air (${rF.res}, air ${airAtDodge}, ${plungedF})`);
  assert(since(cF, 'player:plungeHit') === 1 && since(cF, 'dragon:plunged') === 1 && hpF - d.hp === P.damage, `one head hit on the flying wyrm (${hpF - d.hp})`);
  assert(crashed && landedF && trF.finite && Number.isFinite(d.position.x + d.position.z), 'the flying wyrm crashes out of the air and fights on');
  return G;
}

// ================================================================== scenario: the flurry (ADR-091, on the wyrm)
// The streak of perfect dodges and what answers it (player/flurry.js): flash cuts round the head,
// then an art; each of the wyrm's arts; the cap; a kill in the middle of one.
async function scenarioFlurry() {
  out('\n== scenario FLURRY (the streak; flash cuts then an art; each of the wyrm\'s arts; the cap; a kill mid-flurry) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player, F = DEFENSE.flurry, P = DEFENSE.plunge;
  const bound = CONFIG.world.playerBound;
  const since = (c0, n) => (G.counts[n] || 0) - (c0[n] || 0);
  const inBody = (x, z, r) => d.bodyCircles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r);
  /** Tick until the flurry (and the plunge it may end in) is over: what it did. */
  const ride = (max = 9) => {
    const tr = { frames: 0, cutFrames: 0, gameT: 0, minScale: 1, iframes: true, finite: true, ignored: true, maxY: 0, hits: [], end: null, states: new Set() };
    const w0 = G.watch;
    G.watch = (n, e) => {
      if (n === 'player:flurryHit') tr.hits.push({ ...e });
      if (n === 'player:flurryEnd') tr.end = { ...e };
    };
    for (let i = 0; i < Math.round(max / DT) && (p.state === 'flurry' || p.state === 'plunge'); i++) {
      aimAt(G);
      const st = p.state, t0 = game.time;
      G.tick(DT);
      tr.frames++;
      tr.states.add(st);
      if (st === 'flurry') {
        tr.cutFrames++;
        tr.gameT += game.time - t0;
        tr.minScale = Math.min(tr.minScale, game.hitstopScale);
      }
      if (p.state === 'flurry' || p.state === 'plunge') {
        if (!p.isInvulnerable()) tr.iframes = false;
        tr.maxY = Math.max(tr.maxY, p.position.y);
      }
      if (![p.position.x, p.position.y, p.position.z].every(Number.isFinite)) tr.finite = false;
      if (i === 4) {
        const hp = p.hp;
        tr.ignored = p.takeHit({ damage: 40, tell: TELL.NORMAL, attack: 'bite', attacker: d, knockback: 3 }) === RESULT.IGNORED && p.hp === hp;
      }
    }
    G.watch = w0;
    tr.state = p.state;
    return tr;
  };
  const ready = () => {
    run(G, 2.5, { passive: true });
    settle(G);
    d.hp = d.maxHp;
    place(G, 6);
  };

  // 1) the streak: the first perfect dodge is the art alone, the second adds a flash cut
  ready();
  p.debug.streak(0);
  p.debug.flurryArt = 'skyfall';
  p.debug.flurryAny = true; // (the move itself is tested here, on a bite; which tells it answers: scenario RED)
  const r1 = forceAttack(G, 'bite', { answer: 'dodge', settle: 1 });
  assert(r1.res === RESULT.PERFECT && p.streak === 1 && p.state === 'plunge' && r1.ev['player:flurry'] === 1, `the first perfect dodge of a streak is one blow: the art alone (streak ${p.streak}, state ${p.state})`);
  ride();
  ready();
  const hp2 = d.hp, c2 = { ...G.counts };
  const r2 = forceAttack(G, 'bite', { answer: 'dodge', settle: 1 });
  const flurrying = p.state === 'flurry';
  const t2 = ride();
  out(`   second perfect dodge: ${r2.res} → streak ${p.streak}, ${flurrying ? 'flurry' : p.state} · blows ${t2.hits.map((h) => `${h.n}/${h.of}${h.last ? '!' : ''}:${h.damage}`).join(' ')} · wyrm −${hp2 - d.hp} HP · ${t2.cutFrames} frames of cuts in ${t2.gameT.toFixed(3)} s of game time (world x${t2.minScale})`);
  assert(r2.res === RESULT.PERFECT && p.streak === 2 && flurrying, `the second in a row is answered with two blows (streak ${p.streak}, ${flurrying})`);
  assert(since(c2, 'player:perfectDodge') === 1 && since(c2, 'player:ghostep') === 1, 'one player:perfectDodge + player:ghostep for the whole flurry');
  assert(t2.hits.length === 2 && t2.hits[0].last === false && t2.hits[1].last === true && t2.hits[0].damage === F.cut.damage, `a flash cut (${F.cut.damage}), then the last blow`);
  assert(hp2 - d.hp === F.cut.damage + P.damage && t2.end?.strikes === 2 && t2.end?.damage === F.cut.damage + P.damage, `the wyrm took ${hp2 - d.hp} (cut ${F.cut.damage} + plunge ${P.damage}); player:flurryEnd says so`);
  assert(t2.iframes && t2.ignored && t2.finite, 'invulnerable, hits ignored and finite throughout');
  assert(t2.minScale <= F.world + 1e-9 && t2.gameT < t2.cutFrames * DT * 0.35, `the world is held while he cuts (x${t2.minScale}; ${t2.gameT.toFixed(3)} s of game time in ${(t2.cutFrames * DT).toFixed(2)} s)`);
  assert(since(c2, 'player:plungeHit') === 1 && since(c2, 'dragon:plunged') === 1, 'the last blow lands on the head once (the wyrm\'s plunged reaction)');
  assert(t2.state !== 'flurry' && t2.state !== 'plunge' && p.position.y === 0 && p.critTimer > 0, 'he lands, the crit window open');

  // a hit that hurts ends the streak; a blocked one does not
  settle(G);
  place(G, 6);
  p.debug.streak(3);
  input.press(1);
  run(G, 0.6, { passive: true }); // (held past the parry window: a block)
  const rb = p.takeHit({ damage: 20, tell: TELL.NORMAL, attack: 'bite', attacker: d, knockback: 2 });
  input.up(1);
  assert(rb === RESULT.BLOCKED && p.streak === 3, `a blocked blow leaves the streak alone (${rb}, streak ${p.streak})`);
  run(G, 0.5, { passive: true });
  let lost = null;
  G.watch = (n, e) => { if (n === 'player:streak') lost = e; };
  const rh = p.takeHit({ damage: 10, tell: TELL.NORMAL, attack: 'bite', attacker: d, knockback: 2 });
  G.watch = null;
  assert(rh === RESULT.HIT && p.streak === 0 && lost?.count === 0 && lost?.lost === 3, `a blow that hurts ends it (${rh}, streak ${p.streak}, event ${JSON.stringify(lost)})`);

  // 2) each of the wyrm's arts, three blows
  for (const art of ['skyfall', 'severing', 'heavensplit']) {
    ready();
    const hp0 = d.hp, c0 = { ...G.counts };
    const ok = p.debug.flurry(3, art);
    const tr = ride();
    const want = 2 * F.cut.damage + P.damage;
    out(`   ${art}: started ${ok} · ${tr.hits.length} blows · wyrm −${hp0 - d.hp} · max y ${tr.maxY.toFixed(1)} · ${(tr.frames * DT).toFixed(2)} s · landed ${p.position.x.toFixed(1)},${p.position.z.toFixed(1)} y ${p.position.y} · crit ${p.critTimer.toFixed(2)} · ${p.state}`);
    assert(ok === true && tr.states.has('flurry') && p.flurry.art === art, `${art}: the flurry starts`);
    assert(tr.hits.length === 3 && tr.hits.filter((h) => h.last).length === 1 && tr.hits[2].last, `${art}: two flash cuts and the last blow (${tr.hits.length})`);
    assert(hp0 - d.hp === want && tr.end?.damage === want && tr.end?.art === art, `${art}: ${hp0 - d.hp} damage (${want})`);
    assert(since(c0, 'player:plunge') === 1 && since(c0, 'player:plungeHit') === 1 && since(c0, 'dragon:plunged') === 1, `${art}: one blow on the head (the dive's rush, the impact, the wyrm's reaction)`);
    assert(tr.iframes && tr.finite && tr.ignored, `${art}: invulnerable and finite throughout`);
    assert(tr.state !== 'flurry' && tr.state !== 'plunge' && tr.frames * DT < 6, `${art}: it ends (${(tr.frames * DT).toFixed(2)} s)`);
    assert(p.position.y === 0 && Math.hypot(p.position.x, p.position.z) <= bound && !inBody(p.position.x, p.position.z, p.radius - 0.05), `${art}: he lands on the ground, inside the arena, clear of the body`);
    assert(p.critTimer > 0 && p.flurry.nLines === 0 && !p.flurry.on && !p.flurry.pending, `${art}: the crit window is open, nothing left hanging`);
  }

  // 3) the cap: a long streak strikes DEFENSE.flurry.max blows, the streak itself counts on
  ready();
  p.debug.flurryArt = 'severing';
  p.debug.streak(F.max + 2);
  const rc = forceAttack(G, 'bite', { answer: 'dodge', settle: 1 });
  const tc = ride(12);
  assert(rc.res === RESULT.PERFECT && p.streak === F.max + 3 && tc.hits.length === F.max && tc.end?.strikes === F.max, `a streak of ${p.streak} strikes ${tc.hits.length} blows (the most: ${F.max})`);
  assert(tc.state !== 'flurry' && tc.state !== 'plunge' && p.position.y === 0, `the longest flurry ends on the ground (${(tc.frames * DT).toFixed(2)} s)`);

  // 4) the arts vary: all of them come up, never the same twice running
  p.debug.flurryArt = null;
  const picks = [];
  for (let i = 0; i < 12; i++) picks.push(p.flurry._pickArt(true));
  assert(new Set(picks).size === 3 && picks.every((a, i) => i === 0 || a !== picks[i - 1]), `the last blow's art changes every time (${picks.join(' ')})`);

  // 5) the wyrm dies under the cuts: the flurry ends where it is, he comes down
  ready();
  d.hp = F.cut.damage;
  const okK = p.debug.flurry(4, 'severing');
  const tk = ride(8);
  out(`   a kill mid-flurry: started ${okK} · blows ${tk.hits.length} · wyrm ${d.state} hp ${d.hp} · hero ${p.state} y ${p.position.y}`);
  assert(okK === true && d.hp === 0 && (d.state === 'dying' || d.state === 'dead'), 'the first cut kills it');
  assert(tk.finite && tk.state !== 'flurry' && tk.state !== 'plunge' && p.position.y === 0 && p.flurry.nLines === 0, 'the flurry ends, the hero is back on the ground, nothing hangs');
  p.debug.flurryArt = null;
  return G;
}

// ================================================================== scenario: the riposte (ADR-094, on the wyrm)
async function scenarioRiposte() {
  out('\n== scenario RIPOSTE (parries count in the streak; a parried bite is answered by flash cuts round the head) ==');
  const G = build();
  const { game } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player, F = DEFENSE.flurry;
  const since = (c0, n) => (G.counts[n] || 0) - (c0[n] || 0);
  settle(G);
  place(G, 6);
  p.debug.streak(2);
  const hp0 = d.hp, at = p.position.clone(), c0 = { ...G.counts };
  let art = null, end = null;
  const r = forceAttack(G, 'bite', { answer: 'parry', settle: 1 });
  G.watch = (n, e) => { if (n === 'player:flurry') art = e; if (n === 'player:flurryEnd') end = e; };
  let flurried = false, maxY = 0;
  for (let i = 0; i < Math.round(5 / DT); i++) {
    aimAt(G);
    G.tick(DT);
    if (p.state === 'flurry') { flurried = true; maxY = Math.max(maxY, p.position.y); }
    else if (flurried) break;
  }
  G.watch = null;
  const moved = Math.hypot(p.position.x - at.x, p.position.z - at.z);
  out(`   bite parried: ${r.res} · streak ${p.streak} · answered by ${JSON.stringify(art)} · wyrm −${hp0 - d.hp} · ${maxY.toFixed(1)} m up · back ${moved.toFixed(2)} m from where he parried · crit ${p.critTimer.toFixed(2)} · ${p.state}`);
  assert(r.res === RESULT.PARRIED && p.streak === 3, `the parry counts in the streak (${p.streak})`);
  // (the bite is a parry moment since ADR-118: the riposte's cuts, the last one the counter blow)
  assert(flurried && art?.art === 'counter' && art?.strikes === 3 && end?.strikes === 3, 'a parried bite is answered by the counter: three flash cuts for a streak of three');
  assert(hp0 - d.hp === 2 * F.cut.damage + DEFENSE.flareCounter.damage && since(c0, 'player:plungeHit') === 0 && since(c0, 'player:perfectDodge') === 0, `${hp0 - d.hp} damage (2 x ${F.cut.damage} + the counter blow ${DEFENSE.flareCounter.damage}); no plunge, no perfect dodge`);
  assert(maxY > 1 && moved < 1.5 && p.position.y === 0 && p.critTimer === 0 && p.state !== 'flurry', `round the head (${maxY.toFixed(1)} m up), then back where he parried (${moved.toFixed(2)} m off), no crit window`);
  return G;
}

// ================================================================== scenario: flare (ADR-118)
// The wyrm's moments: the flare is the only sign of a red blow (no glow through the windup, no heat
// on the ground under its own area); the bite is a parry moment (the counter round the head); the
// Black maw (the charged blow).
async function scenarioFlare() {
  out('\n== scenario FLARE (the flare alone cues a red blow; the bite parried is countered; the Black maw) ==');
  const { GUARD, isFlare } = await imp('src/combat/rules.js');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player, A = TUNING.attacks;
  const marked = Object.keys(A).filter((n) => A[n].flare || (A[n].hits ?? []).some((h) => h.flare));
  const black = Object.keys(A).filter((n) => A[n].tell === TELL.BLACK || (A[n].hits ?? []).some((h) => h.tell === TELL.BLACK));
  out(`   parry moments: ${marked.join(', ')}; charged: ${black.join(', ')}`);
  assert(marked.length >= 4 && marked.every((n) => (A[n].flare ? A[n].tell === TELL.BLUE : A[n].hits.filter((h) => h.flare).every((h) => h.tell === TELL.BLUE))), `${marked.length} attacks hold a parry moment, each a blue blow`);
  assert(black.length === 1 && black[0] === 'blackMaw' && A.blackMaw.hits[0].windup >= 1.2 && d.debug.abilities().some((a) => a.name === 'blackMaw'), 'one charged blow, Black maw, wound up at least 1.2 s, a Lab ability');
  // --- a red area (the stomp): nothing on the ground, nothing on the body, until the flare
  settle(G);
  place(G, 4);
  let heat = 0, flares = 0;
  const fx = d.fx, wr = fx.warnRing, tf = fx.tellFlash;
  fx.warnRing = (...a) => { heat++; return wr.apply(fx, a); };
  fx.tellFlash = (...a) => { flares++; return tf.apply(fx, a); };
  p.debug.god = true;
  const st = warnTrace(G, 'stomp', 4);
  p.debug.god = false;
  fx.warnRing = wr;
  fx.tellFlash = tf;
  assert(st.flashI > st.tellI && st.w.slice(0, st.flashI).every((v) => v === 0) && heat === 0, `stomp (red): no glow on the body before the cue and no heat on the ground (${heat} frames)`);
  assert(flares === 1 && st.w[st.flashI] > 1 && st.edge[st.flashI] > 0.2, `its cue is ONE flare (${flares}: not one on each forefoot), the body's spike and the screen edge`);
  // --- the bite parried: the counter
  settle(G);
  place(G, 6);
  p.debug.streak(1);
  const hp0 = d.hp, c0 = { ...G.counts };
  let cnt = null, end = null, par = null, dpar = null;
  const r = forceAttack(G, 'bite', { answer: 'parry', settle: 1 });
  G.watch = (n, e) => { if (n === 'player:flareCounter') cnt = e; if (n === 'player:flurryEnd') end = e; };
  let flurried = false;
  for (let i = 0; i < Math.round(5 / DT); i++) {
    aimAt(G);
    G.tick(DT);
    if (p.state === 'flurry') flurried = true;
    else if (flurried) break;
  }
  G.watch = null;
  const F = DEFENSE.flurry, K = DEFENSE.flareCounter;
  assert(r.res === RESULT.PARRIED && flurried && end?.art === 'counter' && end.strikes === 2 && !!cnt, `a parried bite (a blue flare) is answered by the counter: ${end?.strikes} cuts, art ${end?.art}`);
  assert(hp0 - d.hp === F.cut.damage + K.damage, `${hp0 - d.hp} damage: one flash cut (${F.cut.damage}) and the counter blow (${K.damage})`);
  // --- Black maw
  const maw = (plan) => {
    settle(G);
    place(G, 6);
    run(G, 0.3, { passive: true });
    p.debug.heal();
    p.guard = p.maxGuard;
    p.streak = 0;
    let charges = 0, open = null, chargeEv = 0, flare = null, wMax = 0;
    const ch = fx.charge;
    fx.charge = (...a) => { charges++; return ch.apply(fx, a); };
    const w0 = G.watch;
    const rec = forceAttack(G, 'blackMaw', { ...plan, max: 6, settle: 2 });
    fx.charge = ch;
    return { rec, charges };
  };
  const evs = [];
  const emit0 = game.events.emit;
  const held = maw({ hold: true });
  assert(held.rec.tell === TELL.BLACK && held.rec.flashT !== null && held.charges > 30 && evn(held.rec, 'combat:charge') === 1, `Black maw: tell black, the charge drawn through its windup (${held.charges} frames), combat:charge once`);
  assert(held.rec.res === RESULT.BLOCKED && near(held.rec.hpAtHit, held.rec.hp0, 1e-9) && evn(held.rec, 'player:guardOpen') === 1 && evn(held.rec, 'player:hurt') === 0, `on a held guard it is stopped (${held.rec.res}): no HP lost, GUARD DOWN`);
  const tap = maw({ answer: 'parry' });
  assert(tap.rec.res === RESULT.BLOCKED && evn(tap.rec, 'player:parry') === 0 && evn(tap.rec, 'player:guardOpen') === 1, `a parry pressed in time does not turn it (${tap.rec.res}): the guard is knocked open`);
  const bare = maw({});
  assert(bare.rec.res === RESULT.HIT && bare.rec.hp0 - bare.rec.hpAtHit > 30, `unanswered it lands: ${(bare.rec.hp0 - bare.rec.hpAtHit).toFixed(0)} HP`);
  const roll = maw({ answer: 'dodge' });
  assert(roll.rec.res === RESULT.PERFECT && evn(roll.rec, 'player:perfectDodge') === 1 && (evn(roll.rec, 'player:flurry') === 1 || evn(roll.rec, 'player:plunge') >= 1), `a perfect dodge of it is answered as a red blow's is (${roll.rec.res}; flurry ${evn(roll.rec, 'player:flurry')})`);
  // (let the answer play out)
  run(G, 4, { passive: true });
  return G;
}

// ================================================================== scenario: training (ADR-099)
// Every situation of the Training catalogue that applies to this boss, run by the runner itself
// (src/dev/training.js): each must play out (done, within its time) and show what it promises.
async function scenarioTraining() {
  out('\n== scenario TRAINING (every situation of the Training catalogue for this boss plays out and shows what it promises) ==');
  const G = build();
  const { game } = G;
  fightSetup(G);
  const T = game.lab.training;
  const L = T.list();
  const cats = new Set(L.map((s) => s.cat));
  out(`   ${L.length} situations in ${cats.size} categories: ${[...cats].join(', ')}`);
  const bad = [];
  for (const s of L) {
    if (s.cat === 'BOSS MOVES' && !true) continue;
    T.run(s.id);
    let frames = 0;
    while (T.ph !== 'done' && frames < Math.round(40 / DT)) { G.tick(DT); frames++; }
    const r = T.lastResult;
    const ok = T.ph === 'done' && r?.id === s.id && r.ok;
    if (!ok || process.env.ABYSS_TRACE) out(`   ${ok ? 'ok ' : 'BAD'} ${s.cat} · ${s.name}: ${T.ph} in ${(frames * DT).toFixed(1)} s · missing ${JSON.stringify(r?.missing ?? '?')} · hero ${game.player.state} streak ${game.player.streak} · boss ${game.dragon.state}`);
    if (!ok) bad.push(s.id);
  }
  T.stop();
  assert(L.length >= 20 && !bad.length, `every situation plays out and shows what it promises (${L.length - bad.length} of ${L.length}${bad.length ? `; not: ${bad.join(', ')}` : ''})`);
  return G;
}

// ================================================================== scenario: deflect chain (contract 1, player side)
async function scenarioDeflect() {
  out('\n== scenario DEFLECT (a string parried in rhythm: tap, release, tap; 0.45 s between impacts) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player;
  /**
   * Blows 0.45 s (game) apart from the dragon; a human taps RMB `lead` s (game) before each impact
   * and lets go after `hold` s of REAL time (the parry freeze stretches real time).
   */
  const string = (n, gap, hold, lead = 0.12) => {
    settle(G);
    run(G, TUNE_P.deflectChainGap + 0.2, { passive: true }); // a fresh chain (parries > the gap apart restart it)
    place(G, 6);
    const res = [], chains = [];
    const c0 = { ...G.counts };
    const T0 = game.time + 0.5;
    let k = 0, downAt = -1, pressedFor = -1;
    G.watch = (nm, dd) => { if (nm === 'player:parry') chains.push(dd.chain); };
    for (let i = 0; i < 600 && k < n; i++) {
      const impact = T0 + k * gap;
      // blow k's tap: down `lead` s before its impact (a held button can't be pressed again), up `hold` real s later
      if (pressedFor !== k && game.time >= impact - lead - 1e-9) {
        pressedFor = k;
        if (!input.buttons[1]) {
          input.press(1);
          downAt = game.realTime;
        }
      }
      if (input.buttons[1] && game.realTime - downAt >= hold - 1e-9) input.up(1);
      if (game.time >= impact - 1e-9) {
        d.posture = 0; // (the meter would break the wyrm mid-string; not under test here)
        res.push(d.hitPlayer({ damage: 18, attack: 'clawCombo', tell: TELL.NORMAL, knockback: 1, kind: 'claw' }));
        // (the dragon's onParried emits this once dragon-melee's strings land; stand in for it here)
        if (res.length >= 2 && res.every((x) => x === RESULT.PARRIED)) game.events.emit('combat:deflectChain', { count: res.length });
        k++;
      }
      aimAt(G);
      G.tick(DT);
    }
    input.up(1);
    G.watch = null;
    run(G, 0.3, { passive: true });
    return { res, chains, parries: (G.counts['player:parry'] || 0) - (c0['player:parry'] || 0), hurt: (G.counts['player:hurt'] || 0) - (c0['player:hurt'] || 0) };
  };
  for (const hold of [0.08, 0.15, 0.2]) {
    const s = string(5, 0.45, hold);
    out(`   5 blows 0.45 s apart, taps held ${hold} s: ${s.res.join(' ')} · chain ${s.chains.join(',')} · hurt ${s.hurt}`);
    assert(s.res.length === 5 && s.res.every((x) => x === RESULT.PARRIED) && s.hurt === 0, `every blow of the string deflected (taps of ${hold} s)`);
    assert(s.chains.join(',') === '1,2,3,4,5', `player:parry counts the chain up (${s.chains.join(',')})`);
  }
  // the HUD turns the parry call-out into "DEFLECT ×N"
  const calls = ui.findAll((e) => e.classList?.contains('ab-call') && e.classList?.contains('on')).map((e) => e.textContent);
  out('   call-outs:', JSON.stringify(calls));
  assert(calls.some((t) => /DEFLECT ×5/.test(t)), 'combat:deflectChain → a "DEFLECT ×N" call-out');
  // a successful deflect re-arms at once (player.rmb.chain): two blows only 0.3 s apart, each tapped in
  // time with the guard held 0.2 s, both deflect. Mashing (whiffed presses) still needs the full
  // re-arm: scenario PARRY's mashed RMB.
  const m = string(2, 0.3, 0.2);
  out(`   2 blows 0.3 s apart, taps held 0.2 s (a deflect re-arms on release): ${m.res.join(' ')}`);
  assert(m.res[0] === RESULT.PARRIED && m.res[1] === RESULT.PARRIED, 'after a deflect the next timed press parries again (no re-arm wait)');
  // between parries in rhythm the guard lingers up, then eases down
  run(G, 1.2, { passive: true });
  assert(p.guardHold === 0 || p.guardHold < 1, `guardHold eases off after the string (${p.guardHold})`);
  return G;
}

// ================================================================== scenario: Lab + debug APIs
// ---- TONGUES: the ground tongues of the Scouring breath and Fire lanes (bullets.scour): a standing
// hero under the first rake is always hit; between two first-rake tongues he is safe until the rake
// back; a dark wedge of Fire lanes is safe through its strike
async function scenarioTongues() {
  out('\n== scenario TONGUES (Scouring breath: standing is hit, between two tongues is safe; Fire lanes: a dark wedge is safe) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player, B = d.bullets;
  const FW = TUNING.attacks.fireWheel, CL = TUNING.attacks.fireLanes;
  const toPhase = (ph) => { settle(G, 12); if (d.phase !== ph) { d.enterPhase(ph); run(G, 0.2, { passive: true }); settle(G, 14); } B.clear(); run(G, 0.6, { passive: true }); };
  /** Trigger `name` with the hero `dist` (model units) at `ang` off the facing; `move(a)` may re-place him once the plan is laid; tick to the end. */
  const play = (name, dist, ang, move) => {
    place(G, dist, ang);
    G.tick(DT); // (the wyrm senses him where he now stands: the plan is centred on that)
    d.posture = 0;
    const h0 = G.hits.length;
    const ok = game.lab.trigger(name);
    const a = d.brain.action, t0 = game.time;
    if (move && a) move(a);
    const hits = [];
    for (let i = 0; i < Math.round(12 / DT); i++) {
      input.axis = { x: 0, y: 0 };
      d.posture = 0;
      p.hp = p.maxHp; // (he stands through it: every touch is counted, none ends the run)
      G.tick(DT);
      for (const h of G.hits.slice(h0 + hits.length)) hits.push({ ...h, at: h.t - t0 });
      if (!d.brain.action && !B.scouring) break;
    }
    return { ok, a, hits: hits.filter((h) => h.attack === name && h.r === RESULT.HIT) };
  };
  // 1. standing still under the first rake: hit, every phase, every placement (the middle tongue of
  //    the first rake runs over him)
  for (const ph of [2, 3]) {
    toPhase(ph);
    let worst = 0, miss = [];
    for (const [dist, ang] of [[9, 0], [10, 0.25], [11, -0.25], [12, 0.4], [9, -0.4]]) {
      const r = play('fireWheel', dist, ang);
      const rt = perPhaseT(FW.rakeTime, ph), W = r.a.list[0][1];
      const first = r.hits[0]?.at ?? Infinity;
      worst = Math.max(worst, first);
      if (!(first <= W + rt + 0.5)) miss.push(`${dist}@${ang}: ${Number.isFinite(first) ? first.toFixed(2) : 'no hit'}`);
      B.clear();
      settle(G, 12);
    }
    out(`   P${ph} Scouring breath, hero standing at 5 placements: first hit ≤ ${worst.toFixed(2)} s after the trigger${miss.length ? ` · MISSED ${miss.join(', ')}` : ''}`);
    assert(!miss.length, `P${ph} Scouring breath: a hero standing still is hit by the first rake, every placement (${miss.join(', ') || 'all hit'})`);
  }
  // (Fire lanes: the first strike lights the middle wedge: a hero standing on his spot is hit by it)
  {
    toPhase(3);
    const miss = [];
    for (const [dist, ang] of [[9, 0], [11, 0.25], [10, -0.3]]) {
      const r = play('fireLanes', dist, ang);
      const end1 = r.a.list[0][1] + r.a.g;
      if (!(r.hits[0]?.at < end1)) miss.push(`${dist}@${ang}`);
      B.clear();
      settle(G, 12);
    }
    out(`   P3 Fire lanes, hero standing at 3 placements: ${miss.length ? `MISSED by the first strike at ${miss.join(', ')}` : 'hit by the first strike every time'}`);
    assert(!miss.length, `P3 Fire lanes: a hero standing still is hit by the first strike (${miss.join(', ') || 'all hit'})`);
  }
  // 2. P2: between two first-rake tongues (half a step off the middle one, 12 m from the pivot) he is
  //    safe until the rake back lays its tongue in that gap
  {
    toPhase(2);
    const m = perPhaseT(FW.tongues, 2), step = FW.arc / (m - 1);
    let backAt = 0;
    const r = play('fireWheel', 10, 0, (a) => {
      const th = a.c + step / 2, R = 12;
      p.debug.teleport(a.px + Math.sin(th) * R, a.pz + Math.cos(th) * R);
      backAt = a.list[0][1] + a.rt + FW.pause; // the rake back starts
    });
    const before = r.hits.filter((h) => h.at < backAt), after = r.hits.filter((h) => h.at >= backAt);
    out(`   P2 between two first-rake tongues (step ${step.toFixed(3)} rad, 12 m out): hits before the rake back ${before.length} · after it ${after.length} (at ${after.map((h) => h.at.toFixed(2)).join(', ')} s; it starts at ${backAt.toFixed(2)} s)`);
    assert(r.ok && before.length === 0, `P2 Scouring breath: standing between two first-rake tongues is safe until the rake back (${before.length} hits before ${backAt.toFixed(2)} s)`);
    assert(after.length >= 1, `P2 Scouring breath: the rake back lays a tongue in that gap (${after.length} hits)`);
    B.clear();
  }
  // 3. P3 Fire lanes: a dark wedge of the first strike (lane 1 of 10101) is safe through that strike;
  //    the second strike (01010) lights it
  {
    toPhase(3);
    let strike2 = 0;
    const r = play('fireLanes', 10, 0, (a) => {
      const th = a.c + (a.flip ? -1 : 1) * (1 - (CL.lanes - 1) / 2) * CL.laneGap, R = 12;
      p.debug.teleport(a.px + Math.sin(th) * R, a.pz + Math.cos(th) * R);
      strike2 = a.list[0][1] + a.g;
    });
    const before = r.hits.filter((h) => h.at < strike2), after = r.hits.filter((h) => h.at >= strike2);
    out(`   P3 Fire lanes, hero in the dark wedge of strike 1 (12 m out): hits before strike 2 ${before.length} · after ${after.length} (strike 2 at ${strike2.toFixed(2)} s)`);
    assert(r.ok && before.length === 0, `P3 Fire lanes: a dark wedge is safe through its strike (${before.length} hits before ${strike2.toFixed(2)} s)`);
    assert(after.length >= 1, `P3 Fire lanes: the next strike lights that wedge (${after.length} hits)`);
    B.clear();
  }
  out(`   console errors so far: ${errors.length}`);
  return G;
}
const perPhaseT = (v, ph) => (Array.isArray(v) ? v[Math.min(v.length - 1, ph - 1)] : v);

// ---- BULLETS: the bullet field (bullets.js) and the six breathed patterns (bulletAttacks.js), docs/COMBAT.md "Bullets"
async function scenarioBullets() {
  out('\n== scenario BULLETS (deflect / block / roll / cut the small ones, dodge the red ones; the cue, the caps, the clears) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player, B = d.bullets, K = TUNING.bullets;
  const lead = TUNING.flashLead;
  assert(B && K && typeof B.spawn === 'function' && B.live === 0, 'dragon.bullets exists, empty at the start');
  const NAMES = ['emberStorm', 'fanVolley', 'cinderSpit', 'emberRain', 'fireWheel', 'fireLanes'];
  const TONGUES = new Set(['fireWheel', 'fireLanes']); // (fire on the ground, not bullets: red, roll through)
  const listed = new Set(d.debug.abilities().map((a) => a.name));
  assert(NAMES.every((n) => listed.has(n) && TUNING.attacks[n]?.tell), 'the six patterns are Lab abilities with tuning data');
  assert(!listed.has('wispSwarm') && !TUNING.attacks.wispSwarm && !K.wisp, 'the homing wisp swarm is gone (2026-11-15)');
  const KIND = { ember: 0, orb: 2 }; // (kind 1 was the wisp)
  /**
   * `n` bullets flown at the standing hero from `from` m (`gap` s apart), answered off the bullet's own
   * cue: answer = parry (RMB tap 0.12 s before impact) | roll (Space 0.1 s before) | swing (LMB on the
   * cue) | none; hold = guard held throughout; cap = the pattern's hit budget.
   */
  const shot = (kind, o = {}) => {
    settle(G);
    B.clear();
    run(G, 0.8, { passive: true });
    place(G, 7);
    d.posture = 0;
    const c0 = { ...G.counts }, h0 = G.hits.length, hp0 = p.hp, dhp0 = d.hp;
    const rec = { cues: [], flashAt: [], light: null, perfect: null, parried: [], returned: [], postureAtHit: null, state: [], pressAt: [] };
    G.watch = (n, e) => {
      if (n === 'combat:tell' && e?.bullet) rec.cues.push({ t: game.time, impactIn: e.impactIn, tell: e.tell, hazard: e.hazard });
      if (n === 'combat:flash' && e?.bullet) rec.flashAt.push(game.time);
      if (n === 'player:parry') { rec.light = e.light; rec.perfect = e.perfect; }
      if (n === 'dragon:parried') rec.parried.push(e);
      if (n === 'dragon:returned') rec.returned.push({ ...e, t: game.time });
    };
    const from = o.from ?? 6, speed = o.speed ?? 9, n = o.n ?? 1;
    const dx = d.position.x - p.position.x, dz = d.position.z - p.position.z, l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l;
    const sx = p.position.x + ux * from, sz = p.position.z + uz * from;
    const yaw = Math.atan2(-ux, -uz);
    const grp = o.grp ?? (o.cap ? B.group(o.cap) : -1);
    let spawned = 0, next = game.time, answered = 0, seenHits = 0;
    if (o.hold) input.press(1);
    for (let i = 0; i < Math.round((o.T ?? 2.4) / DT); i++) {
      while (spawned < n && game.time >= next - 1e-9) {
        B.spawn(kind, 'emberStorm', sx, 1.0, sz, yaw, speed, grp);
        spawned++;
        next += o.gap ?? 0;
      }
      aimAt(G);
      input.axis = { x: 0, y: 0 };
      if (answered < rec.flashAt.length) {
        const left = rec.flashAt[answered] + lead - game.time - DT;
        if (o.answer === 'parry' && left <= (o.parryLead ?? 0.12)) { answered++; input.click(1); rec.pressAt.push(game.time + DT); }
        else if (o.answer === 'roll' && left <= 0.1) { answered++; input.axis = { x: ux, y: -uz }; input.tap('Space'); }
        else if (o.answer === 'swing' && left <= (o.swingLead ?? 0.3)) { answered++; input.click(0); }
        else if (!o.answer || o.answer === 'none') answered++;
      }
      G.tick(DT);
      const hs = G.hits.length - h0;
      if (hs > seenHits) { seenHits = hs; if (rec.postureAtHit === null) rec.postureAtHit = d.posture; rec.state.push(p.state); }
    }
    if (o.hold) input.up(1);
    G.watch = null;
    rec.hits = G.hits.slice(h0);
    rec.res = rec.hits.map((h) => h.r);
    rec.lost = rec.hits.reduce((s, h) => s + (h.hp0 - h.hp1), 0);
    rec.hp = hp0 - p.hp;
    rec.ev = {};
    for (const k in G.counts) rec.ev[k] = G.counts[k] - (c0[k] || 0);
    rec.live = B.live;
    rec.dmg = dhp0 - d.hp; // the wyrm's HP lost during the shot (a returned bullet)
    rec.postureEnd = d.posture;
    rec.gap = rec.hits[0] && rec.pressAt[0] !== undefined ? rec.hits[0].t - rec.pressAt[0] : NaN; // RMB press -> impact
    return rec;
  };
  const cnt = (r, what) => r.res.filter((x) => x === what).length;

  // --- an ember: announced, hits a standing hero for its own (unscaled) damage
  const st = shot(KIND.ember);
  const cueLead = st.hits[0] ? st.hits[0].t - st.flashAt[0] : NaN;
  out(`   ember, no answer: ${st.res.join(' ')} · −${st.lost} HP · cues ${st.cues.length} (${st.cues[0]?.tell}, hazard ${st.cues[0]?.hazard}) · flash ${cueLead.toFixed(3)} s before impact`);
  assert(st.res.length === 1 && st.res[0] === RESULT.HIT && near(st.lost, K.ember.damage, 0.01), `an ember hits a standing hero for K.ember.damage, not x damageScale (${st.lost})`);
  assert(st.cues.length === 1 && st.flashAt.length === 1 && st.cues[0].tell === TELL.NORMAL && st.cues[0].hazard === true, 'one paired combat:tell + combat:flash { hazard, bullet } per bullet');
  assert(cueLead >= K.cueMin - DT && cueLead <= lead + 2 * DT, `the cue leads the impact by ~flashLead (${cueLead.toFixed(3)} s)`);

  // --- deflect: a parry off the cue sends it back at the wyrm (posture, light clash, no recoil of the wyrm)
  const pa = shot(KIND.ember, { answer: 'parry' });
  out(`   ember, parried: ${pa.res.join(' ')} · −${pa.hp} HP · posture ${pa.postureAtHit} · light ${pa.light} · dragon:parried ${JSON.stringify(pa.parried)} · live ${pa.live}`);
  assert(pa.res.length === 1 && pa.res[0] === RESULT.PARRIED && pa.hp === 0, 'a timed parry deflects the ember (no damage)');
  assert(near(pa.postureAtHit, K.ember.posture, 0.5), `the deflect adds K.ember.posture (${pa.postureAtHit})`);
  assert(pa.light === true && pa.ev['player:parry'] === 1, 'player:parry { light: true }: a light clash');
  assert(pa.parried.length === 1 && pa.parried[0].bullet === true && pa.parried[0].attack === 'emberStorm', 'dragon:parried { bullet: true } once (the wyrm is not interrupted)');
  assert(pa.live === 0, 'the deflected ember flew back to the head and burst');

  // --- a PERFECT parry (RMB within DEFENSE.perfectParryWindow of the impact) returns the bullet:
  // HP damage + returnPosture on the head when the shot lands, dragon:returned; the wyrm goes on
  const PW = DEFENSE.perfectParryWindow;
  assert(PW > 0 && PW < DEFENSE.parryWindow, `DEFENSE.perfectParryWindow ${PW} s sits inside the parry window`);
  const actBefore = d.brain.action;
  const st0 = { dealt: game.flow.stats.damageDealt, hits: game.flow.stats.hits };
  const pf = shot(KIND.ember, { answer: 'parry', parryLead: 0.05 });
  const stDealt = game.flow.stats.damageDealt - st0.dealt, stHits = game.flow.stats.hits - st0.hits;
  out(`   ember, RMB ${pf.gap.toFixed(3)} s before impact: ${pf.res.join(' ')} · perfect ${pf.perfect} · dragon:parried.perfect ${pf.parried[0]?.perfect} · returned ${JSON.stringify(pf.returned.map((r) => r.damage))} · wyrm −${pf.dmg} HP · posture ${pf.postureEnd.toFixed(1)} · live ${pf.live}`);
  assert(pf.res[0] === RESULT.PARRIED && pf.hp === 0 && pf.gap <= PW + 1e-6, `a parry ${pf.gap.toFixed(3)} s before impact parries the ember`);
  assert(pf.perfect === true && pf.parried[0]?.perfect === true && pf.parried[0]?.bullet === true, 'player:parry { perfect: true } and dragon:parried { bullet, perfect: true }');
  assert(pf.returned.length === 1 && pf.returned[0].damage === K.ember.returnDamage && pf.dmg === K.ember.returnDamage, `the returned ember lands on the head for returnDamage (${pf.dmg} / ${K.ember.returnDamage}), dragon:returned once`);
  assert(near(pf.postureEnd, K.ember.returnPosture, 0.5), `the return adds returnPosture instead of the deflect's posture (${pf.postureEnd.toFixed(1)} / ${K.ember.returnPosture})`);
  assert(pf.live === 0 && d.brain.action === actBefore, 'the shot burst on the head; the wyrm was not interrupted');
  assert(stDealt === K.ember.returnDamage && stHits === 1, `the run stats count the return as the hero's hit (${stDealt} damage, ${stHits} hit)`);
  const pn = shot(KIND.ember, { answer: 'parry', parryLead: 0.18 });
  out(`   ember, RMB ${pn.gap.toFixed(3)} s before impact: ${pn.res.join(' ')} · perfect ${pn.perfect} · wyrm −${pn.dmg} HP · posture ${pn.postureEnd.toFixed(1)}`);
  assert(pn.res[0] === RESULT.PARRIED && pn.perfect === false && pn.gap > PW, `a parry ${pn.gap.toFixed(3)} s before impact is a normal deflect`);
  assert(pn.dmg === 0 && pn.returned.length === 0 && near(pn.postureEnd, K.ember.posture, 0.5), 'a normal deflect: no HP damage, the kind\'s posture only');
  // a pattern's returns are budgeted (TUNING.bullets.returnBudget): past it a perfect parry deflects
  {
    let dealt = 0, plain = 0, perf = 0;
    const grp = B.group(9);
    const per = K.ember.returnDamage, budget = B.groups[grp].retMax;
    for (let i = 0; i < Math.floor(budget / per) + 2; i++) {
      const r = shot(KIND.ember, { answer: 'parry', parryLead: 0.05, grp });
      if (r.perfect) perf++;
      dealt += r.dmg;
      if (r.perfect && r.returned.length === 0) plain++;
    }
    out(`   ${perf} perfect parries in one pattern (budget ${budget} HP): returned ${dealt} HP, ${plain} past the budget were plain deflects`);
    assert(budget === K.returnBudget && dealt <= budget && dealt === Math.floor(budget / per) * per && plain >= 1, `a pattern's returns deal at most its budget (${dealt} / ${budget} HP), then perfect parries deflect`);
  }
  const po = shot(KIND.orb, { answer: 'parry', parryLead: 0.05 });
  out(`   orb, RMB on the perfect timing: ${po.res.join(' ')} · wyrm −${po.dmg} HP`);
  assert(cnt(po, RESULT.PARRIED) === 0 && po.dmg === 0 && po.returned.length === 0, 'an orb cannot be parried, even on the perfect timing');
  // a return goes through the wyrm's own damage entry: the phase gate holds as for a sword hit, and
  // during a transition roar it deals what a sword hit deals there
  {
    settle(G);
    d.debug.setAI(true);
    const gate = d.nextPhaseHp;
    d.hp = gate + 10;
    const gt = shot(KIND.ember, { answer: 'parry', parryLead: 0.05, T: 1.6 });
    const gateHeld = d.hp, pend = Math.max(d.brain.pendingPhase, d.brain.action?.name === 'phase2' ? 2 : 0, d.phase);
    d.debug.setAI(false);
    d.brain.pendingPhase = 0;
    if (d.brain.action) d.brain.stopAction?.(true);
    out(`   return at gate + 10 HP (AI on): perfect ${gt.perfect} · HP ${gate + 10} → ${gateHeld} (gate ${gate}) · next phase pending / started: ${pend}`);
    assert(gt.perfect === true && gt.returned.length === 1 && gateHeld === gate && pend === 2, 'a return cannot push the wyrm past the phase gate (it waits for the transition, like a sword hit)');
    d.hp = d.maxHp;
    settle(G);
    d.debug.phase2();
    run(G, 0.9, { passive: true });
    const roar = d.brain.action?.name;
    const hpA = d.hp;
    B.clear();
    place(G, 7);
    const dx = d.position.x - p.position.x, dz = d.position.z - p.position.z, l = Math.hypot(dx, dz) || 1;
    const b = B.spawn(KIND.ember, 'emberStorm', p.position.x + (dx / l) * 3, 1.0, p.position.z + (dz / l) * 3, Math.atan2(-dx, -dz), 9);
    b.cued = true;
    d.posture = 0;
    let fired = false;
    const rr = [];
    G.watch = (n, e) => { if (n === 'dragon:returned') rr.push(e.damage); };
    for (let i = 0; i < Math.round(1.2 / DT); i++) {
      aimAt(G);
      if (!fired && b.alive && B.tti(b) <= 0.05) { fired = true; input.click(1); }
      G.tick(DT);
    }
    G.watch = null;
    const lost = hpA - d.hp;
    const sword = d.takeHit({ damage: K.ember.returnDamage, part: 'head', exact: true, posture: 0 });
    out(`   return during the ${roar} roar: returned ${JSON.stringify(rr)} · wyrm −${lost} HP · the same blow as a sword hit there: −${sword}`);
    assert(roar === 'phase2' && rr.length === 1 && lost === sword, `a return during a transition roar deals what a sword hit deals there (${lost} / ${sword})`);
    run(G, 4, { passive: true }, () => !d.brain.action);
    d.enterPhase(1);
    d.hp = d.maxHp;
    settle(G, 12);
  }

  // --- block (chip) and roll (i-frames, no Ghostep off a small bullet)
  const bl = shot(KIND.ember, { hold: true });
  out(`   ember, guard held: ${bl.res.join(' ')} · −${bl.lost.toFixed(2)} HP`);
  assert(bl.res[0] === RESULT.BLOCKED && bl.lost < K.ember.damage && (bl.ev['player:guardBreak'] || 0) === 0, 'a held guard blocks the ember for chip');
  const ro = shot(KIND.ember, { answer: 'roll' });
  out(`   ember, rolled: ${ro.res.join(' ')} · perfectDodge ${ro.ev['player:perfectDodge'] || 0} · ghostep ${ro.ev['player:ghostep'] || 0} · −${ro.hp} HP`);
  assert(cnt(ro, RESULT.DODGED) >= 1 && cnt(ro, RESULT.HIT) === 0 && ro.hp === 0, 'rolling through an ember dodges it');
  assert(!(ro.ev['player:perfectDodge'] || 0) && !(ro.ev['player:ghostep'] || 0), 'no Ghostep off a small bullet (hit.perfect === false)');

  // --- the red orb: dodge only
  const ob = shot(KIND.orb);
  out(`   orb, no answer: ${ob.res.join(' ')} · −${ob.lost} HP at the hit · cue ${ob.cues[0]?.tell}`);
  assert(ob.res[0] === RESULT.HIT && near(ob.lost, K.orb.damage, 0.01) && ob.cues[0]?.tell === TELL.RED, 'an orb is a red tell and hits for K.orb.damage');
  const op = shot(KIND.orb, { answer: 'parry' });
  const oh = shot(KIND.orb, { hold: true });
  out(`   orb, parry tap: ${op.res.join(' ')} · guard held: ${oh.res.join(' ')} (guardBreak ${oh.ev['player:guardBreak'] || 0})`);
  assert(cnt(op, RESULT.PARRIED) === 0 && cnt(op, RESULT.BLOCKED) === 0 && op.hp > 0, 'an orb cannot be parried');
  assert(cnt(oh, RESULT.BLOCKED) === 0 && oh.hp > 0, 'an orb cannot be blocked');
  const od = shot(KIND.orb, { answer: 'roll' });
  out(`   orb, rolled 0.1 s before impact: ${od.res.join(' ')} · perfectDodge ${od.ev['player:perfectDodge'] || 0} · states ${od.state.join(',')} · −${od.hp} HP`);
  assert(od.res[0] === RESULT.PERFECT && od.ev['player:perfectDodge'] === 1 && od.hp === 0, 'a timed roll through an orb is a perfect dodge (Ghostep)');
  assert(!od.state.includes('plunge') && p.state !== 'plunge', 'the Ghostep off a bullet never plunges (plunge: false)');

  // --- the blade cuts small bullets out of the air
  let cutOk = null;
  for (const sl of [0.34, 0.28, 0.22, 0.16]) {
    const cu = shot(KIND.ember, { answer: 'swing', swingLead: sl, speed: 6, from: 5 });
    out(`   ember, swing ${sl} s before impact: hits [${cu.res.join(' ')}] · live ${cu.live} · swings ${cu.ev['player:attack'] || 0}`);
    if (cu.res.length === 0 && cu.live === 0 && cu.hp === 0) { cutOk = sl; break; }
  }
  assert(cutOk !== null, `a swing in time cuts the ember out of the air (no hit resolved; swing ${cutOk} s before impact)`);

  // --- one cue, one parry for a clump; the grace after a hit; the pattern's hit budget; point-blank duds
  const vo = shot(KIND.ember, { n: 5, gap: 0.05, answer: 'parry' });
  out(`   5 embers 0.05 s apart, one parry: ${vo.res.join(' ')} · cues ${vo.cues.length} · live ${vo.live} · −${vo.hp} HP`);
  assert(vo.cues.length === 1 && cnt(vo, RESULT.PARRIED) === 1 && cnt(vo, RESULT.HIT) === 0 && vo.hp === 0 && vo.live === 0, 'impacts within cueGap ride on one cue: one parry answers the clump');
  const gr = shot(KIND.ember, { n: 4, gap: 0.12 });
  out(`   4 embers 0.12 s apart, no answer: ${gr.res.join(' ')} · −${gr.lost} HP`);
  assert(cnt(gr, RESULT.HIT) === 1 && near(gr.lost, K.ember.damage, 0.01), 'after a bullet hit the next ones fizzle for K.grace s (no chain melt)');
  const ca = shot(KIND.ember, { n: 6, gap: 0.7, cap: 2, T: 5.6 });
  out(`   6 embers 0.7 s apart, budget 2: ${ca.res.join(' ')} · cues ${ca.cues.length}`);
  assert(cnt(ca, RESULT.HIT) === 2 && ca.res.length === 2, "a pattern's bullets stop hurting at its hit budget (group().max)");
  const pb = shot(KIND.ember, { from: 0.9, T: 0.6 });
  out(`   ember spawned 0.9 m away: hits [${pb.res.join(' ')}] · cues ${pb.cues.length}`);
  assert(pb.res.length === 0 && pb.hp === 0, 'a bullet spawned point-blank (no time for a cue) is a dud');

  // --- robustness and the clears
  settle(G);
  B.clear();
  assert(B.spawn(KIND.ember, 'x', NaN, 1, 0, 0, 9) === null && B.spawn(7, 'x', 0, 1, 0, 0, 9) === null && B.spawn(1, 'x', 0, 1, 0, 0, 9) === null && B.live === 0, 'spawn rejects NaN / unknown kinds (1: the removed wisp)');
  B.update(NaN); B.update(0); B.update(-1);
  place(G, 9);
  for (let i = 0; i < 40; i++) B.spawn(i % 2 ? KIND.orb : KIND.ember, 'emberStorm', d.position.x + Math.sin(i) * 6, 1.5, d.position.z + Math.cos(i) * 6, i * 0.7, 3);
  B.scour({ attack: 'fireWheel', x: d.position.x, z: d.position.z, times: [0, 0.1, 0.2, 2], angs: [0, 1.5, 3, 4.5], r0: 3, r1: 26, speed: 12, hold: 1.5, width: 1.1, damage: 20, grp: B.group(2) });
  run(G, 0.3, { passive: true });
  const liveBefore = B.live, tonguesBefore = B.tonguesLive;
  d.enterPhase(2);
  run(G, 2 * DT, { passive: true });
  out(`   phase change: ${liveBefore} bullets + ${tonguesBefore} tongues (plan pending ${B.plan.on}) → ${B.live} + ${B.tonguesLive}, scouring ${B.scouring}`);
  assert(liveBefore === 40 && tonguesBefore === 3 && B.live === 0 && B.scouring === false, 'a phase change clears the bullets, the tongues and the plan');
  settle(G, 12);
  for (let i = 0; i < 20; i++) B.spawn(0, 'emberStorm', d.position.x + Math.sin(i) * 7, 1.5, d.position.z + Math.cos(i) * 7, i * 0.7, 2);
  run(G, 0.2, { passive: true });
  d.debug.postureBreak();
  run(G, 3 * DT, { passive: true });
  out(`   posture break: 20 bullets → ${B.live}`);
  assert(B.live === 0, 'a posture break clears the air');
  run(G, 9, { passive: true }, () => !d.broken);
  settle(G, 12);

  // --- the patterns, every phase: a hero who never answers is hit at most maxHits times; a hero who
  // answers every cue (parry the normal / blue ones, roll the red ones) comes through nearly clean
  const pattern = (name, phase, answer, dist) => {
    settle(G, 12);
    if (d.phase !== phase) { d.enterPhase(phase); run(G, 0.2, { passive: true }); settle(G, 14); }
    B.clear();
    run(G, 1.0, { passive: true });
    place(G, dist);
    d.posture = 0;
    const def = answer ? makeDefender(G) : null;
    const h0 = G.hits.length, c0 = { ...G.counts };
    let tells = 0, flashes = 0, peak = 0, bad = 0;
    // ADR-050: every bullet is breathed: born at pt.mouth, along the head's aim (a cone / fork round it)
    const born = { n: 0, far: 0, worst: 0, aimWorst: 0, offWorst: 0 };
    // (the widest emission off the head's aim: the forked stream / the orb cough / the barks; the
    // cones; the spit's 2 - 3 embers; the rain's outer ring seen from the jaws at this range)
        const SPREAD = { emberStorm: TUNING.attacks.emberStorm.laneGap + TUNING.attacks.emberStorm.orbSpread * 1.5, fanVolley: TUNING.attacks.fanVolley.spread + 0.06, cinderSpit: TUNING.attacks.cinderSpit.spread * 1.5 + 0.02, emberRain: Math.PI / 3 }; // (the rain's rings, 2.6 / 4.8 m round him, from jaws reared ~6 m short of him: up to 0.95 rad measured)
    G.watch = (n, e) => { def?.onEvent(n, e); if (n === 'combat:tell') tells++; if (n === 'combat:flash') flashes++; };
    const ok = game.lab.trigger(name);
    let ended = -1;
    // the no-spinning rule (2026-11-15): the body never turns faster than its walking turn rate
    let yawPrev = d.yaw, yawRate = 0, blobs = 0, tongues = 0;
    for (let i = 0; i < Math.round(16 / DT); i++) {
      aimAt(G);
      input.axis = { x: 0, y: 0 };
      def?.act();
      d.posture = 0; // (the meter would break the wyrm mid-pattern and clear the air; not under test here)
      G.tick(DT);
      if (d.brain.action?.name === name) yawRate = Math.max(yawRate, Math.abs(angleDiffT(yawPrev, d.yaw)) / DT);
      yawPrev = d.yaw;
      peak = Math.max(peak, B.live);
      tongues = Math.max(tongues, B.tonguesLive);
      blobs = Math.max(blobs, game.fx?.fire?.count ?? game.fx?.fire?.live ?? 0);
      for (let j = 0; j < B.pool.length; j++) { const b = B.pool[j]; if (b.alive && !Number.isFinite(b.x + b.y + b.z + b.vx + b.vz)) bad++; }
      if (!TONGUES.has(name)) {
        const m = d.rig.pt.mouth, f = d.rig.pt.headFwd, hy = Math.atan2(f.x, f.z);
        let sx = 0, sz = 0, cn = 0;
        for (let j = 0; j < B.pool.length; j++) {
          const b = B.pool[j];
          if (!b.alive || b.attack !== name || b.t > DT * 1.01 || b.deflected) continue;
          // back to where it was spawned this frame (it already flew one step)
          const ox = b.x - b.vx * b.t, oz = b.z - b.vz * b.t;
          const dm = Math.hypot(ox - m.x, b.y0 - m.y, oz - m.z);
          born.n++;
          born.worst = Math.max(born.worst, dm);
          if (dm > 0.6) born.far++;
          const yb = Math.atan2(b.vx, b.vz);
          born.offWorst = Math.max(born.offWorst, Math.abs(angleDiffT(hy, yb)));
          sx += Math.sin(yb); sz += Math.cos(yb); cn++;
        }
        if (cn > 0) born.aimWorst = Math.max(born.aimWorst, Math.abs(angleDiffT(hy, Math.atan2(sx, sz))));
      }
      if (ended < 0 && !d.brain.action) ended = i;
      if (ended >= 0 && B.live === 0 && !B.scouring && i - ended > 30) break;
    }
    G.watch = null;
    input.up(1);
    const hs = G.hits.slice(h0).filter((h) => h.attack === name);
    const by = (r) => hs.filter((h) => h.r === r).length;
    return { born, spread: SPREAD[name] ?? 0, ok, ended, tells, flashes, peak, bad, yawRate, blobs, tongues, hit: by(RESULT.HIT), parried: by(RESULT.PARRIED), blocked: by(RESULT.BLOCKED), dodged: by(RESULT.DODGED) + by(RESULT.PERFECT), live: B.live, wheel: B.scouring, hurt: (G.counts['player:hurt'] || 0) - (c0['player:hurt'] || 0) };
  };
  const DIST = { emberStorm: 9, fanVolley: 11, cinderSpit: 8, emberRain: 9, fireWheel: 9, fireLanes: 9 };

  // --- the cue in the corners (phase 2): an even-count fan
  const lateCues = () => {
    const FV = TUNING.attacks.fanVolley;
    const R = K.ember.r + (p.radius ?? 0.45);
    /** One pattern against a standing hero at `metres`: its headline tell / flash, hits, and `each(i)` per frame. */
    const watchPattern = (name, metres, each) => {
      settle(G, 12);
      B.clear();
      run(G, 1.0, { passive: true });
      place(G, metres / SIZE);
      d.posture = 0;
      const h0 = G.hits.length;
      const r = { tells: 0, flashes: 0, headTell: null, headFlash: null, ended: null, dist: Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z) };
      G.watch = (n, e) => {
        if (e?.attack !== name) return;
        if (n === 'combat:tell') { r.tells++; if (!e.bullet) r.headTell = game.time; }
        if (n === 'combat:flash') { r.flashes++; if (!e.bullet) r.headFlash = game.time; }
      };
      r.ok = game.lab.trigger(name);
      for (let i = 0; i < Math.round(14 / DT); i++) {
        aimAt(G);
        input.axis = { x: 0, y: 0 };
        d.posture = 0;
        G.tick(DT);
        each?.(r);
        if (r.ended === null && !d.brain.action) r.ended = game.time;
        if (r.ended !== null && B.live === 0 && game.time - r.ended > 0.5) break;
      }
      G.watch = null;
      r.hits = G.hits.slice(h0).filter((h) => h.attack === name && h.r === RESULT.HIT);
      return r;
    };

    // the first cough has an ember dead on the hero (the lead the headline flash follows) and the
    // second puts him in a gap, whatever the count (the Hard cones are odd: an even count is forced
    // here). From the mouth a gap is wider than the hero only at range (spacing x distance > 2 R).
    const count0 = FV.count;
    FV.count = [9, 10, 13];
    const miss = [];
    let leadSeen = false, embers = 0;
    const fv = watchPattern('fanVolley', 26, () => {
      if (B.leadAlive()) leadSeen = true;
      const n = B.count(KIND.ember);
      if (n > embers && miss.length < 2) {
        // a volley was just flung: how far from the hero its nearest ember will pass
        let best = Infinity;
        for (const b of B.pool) {
          if (!b.alive || b.kind !== KIND.ember || b.t > 1.5 * DT) continue;
          const dx = p.position.x - b.x, dz = p.position.z - b.z, sp = Math.hypot(b.vx, b.vz) || 1;
          best = Math.min(best, Math.abs(dx * b.vz - dz * b.vx) / sp);
        }
        miss.push(best);
      }
      embers = n;
    });
    FV.count = count0;
    const fvLag = fv.hits[0] && fv.headFlash !== null ? fv.hits[0].t - fv.headFlash : NaN;
    out(`   P2 burst of 10 (even, forced) at ${fv.dist.toFixed(1)} m: lead bullet ${leadSeen} · nearest ember passes ${miss.map((m) => m.toFixed(2)).join(' / ')} m off (volley 1 / 2, touch radius ${R.toFixed(2)}) · headline flash ${fvLag.toFixed(3)} s before the first hit · tells ${fv.tells}/${fv.flashes}`);
    assert(fv.ok && leadSeen, 'even-count fan: the first volley has a lead ember (setLead)');
    assert(miss.length === 2 && miss[0] < 0.1 && miss[1] > R, `even-count fan: volley 1 is centred on the hero, volley 2 has him in a gap (${miss.map((m) => m.toFixed(2)).join(' / ')})`);
    assert(fvLag >= K.cueMin - DT && fvLag <= lead + 3 * DT, `even-count fan: the headline flash leads the first impact by ~flashLead (${fvLag.toFixed(3)} s)`);
    assert(fv.tells === fv.flashes, `even-count fan: one combat:flash per combat:tell (${fv.tells}/${fv.flashes})`);

  };
  const angleDiffT = (a, b) => { let x = (b - a) % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; if (x < -Math.PI) x += 2 * Math.PI; return x; };
  const perPhaseOf = (v, ph) => (Array.isArray(v) ? v[Math.min(v.length - 1, ph - 1)] : v);

  for (const phase of [1, 2, 3]) {
    for (const name of NAMES) {
      const spec = TUNING.attacks[name];
      if ((spec.phase ?? 1) > phase) continue;
      const idle = pattern(name, phase, false, DIST[name]);
      const ans = pattern(name, phase, true, DIST[name]);
      out(`   P${phase} ${name.padEnd(11)} standing: hit ${idle.hit}/${spec.maxHits} · peak ${String(idle.peak).padStart(3)} bullets ${String(idle.tongues).padStart(2)} tongues ${idle.blobs} fire blobs · tells ${idle.tells}/${idle.flashes} · body turn ≤ ${(idle.yawRate * 180 / Math.PI).toFixed(0)}°/s   answering: hit ${ans.hit} parried ${ans.parried} dodged ${ans.dodged} blocked ${ans.blocked} · tells ${ans.tells}/${ans.flashes}`);
      // no spinning: never faster than the walking turn rate of this phase (TUNING.turnSpeed)
      assert(Math.max(idle.yawRate, ans.yawRate) <= d.turnRate + 1e-3, `P${phase} ${name}: the body never turns faster than its walking turn rate while it breathes (${(Math.max(idle.yawRate, ans.yawRate) * 180 / Math.PI).toFixed(0)} ≤ ${(d.turnRate * 180 / Math.PI).toFixed(0)}°/s)`);
      assert(idle.ok && ans.ok && idle.ended >= 0 && ans.ended >= 0, `P${phase} ${name}: triggers and ends`);
      assert(idle.bad === 0 && ans.bad === 0 && idle.live === 0 && !idle.wheel && ans.live === 0, `P${phase} ${name}: no NaN, the field empties afterwards`);
      assert(idle.hit >= 1 && idle.hit <= spec.maxHits, `P${phase} ${name}: a standing hero is hit, at most maxHits times (${idle.hit}/${spec.maxHits})`);
      assert(idle.tells === idle.flashes && ans.tells === ans.flashes && idle.tells >= 1, `P${phase} ${name}: one combat:flash per combat:tell (${idle.tells}/${idle.flashes}, ${ans.tells}/${ans.flashes})`);
      // (the scripted defender answers one cue at a time: the phase-3 storm's crossing arms cost it a second hit)
      assert(ans.hit < idle.hit && ans.hit <= (name === 'emberStorm' ? 2 : 1), `P${phase} ${name}: answering the cues takes fewer hits than standing still (${ans.hit} < ${idle.hit})`);
      if (!TONGUES.has(name)) {
        const bo = idle.born;
        out(`      breathed: ${bo.n} bullets born ≤ ${bo.worst.toFixed(2)} m from pt.mouth · emission centre ≤ ${bo.aimWorst.toFixed(3)} rad off headFwd · widest ${bo.offWorst.toFixed(3)} rad`);
        assert(bo.n > 0 && bo.far === 0, `P${phase} ${name}: every bullet is born within 0.6 m of pt.mouth (worst ${bo.worst.toFixed(2)} m)`);
        assert(bo.aimWorst <= 0.2 && bo.offWorst <= idle.spread + 0.2, `P${phase} ${name}: every emission leaves along the head's aim (centre ${bo.aimWorst.toFixed(3)} ≤ 0.2 rad, widest ${bo.offWorst.toFixed(3)} ≤ ${(idle.spread + 0.2).toFixed(2)})`);
      }
      if (name === 'emberStorm') assert(ans.parried + ans.dodged >= 1, `P${phase} emberStorm: embers deflected / orbs rolled (${ans.parried} + ${ans.dodged})`);
      else if (!TONGUES.has(name)) assert(ans.parried >= 1, `P${phase} ${name}: bullets were deflected (${ans.parried})`);
      else assert(ans.dodged >= 1, `P${phase} ${name}: a tongue was rolled through (${ans.dodged})`);
    }
    if (phase === 2) lateCues();
  }
  // P3: a Cinder burst may run straight into an Ember torrent (the brain's queue, no idle between)
  {
    settle(G, 12);
    B.clear();
    place(G, 12);
    const FV = TUNING.attacks.fanVolley, chain0 = FV.chain;
    FV.chain = [0, 0, 1];
    d.debug.setAI(true);
    d.brain.cooldowns.emberStorm = 0;
    game.lab.trigger('fanVolley');
    let after = null, gap = Infinity, endT = null, seen = false;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      aimAt(G);
      d.posture = 0;
      G.tick(DT);
      const a = d.brain.action;
      if (a?.name === 'fanVolley') seen = true;
      if (seen && endT === null && a?.name !== 'fanVolley') endT = game.time;
      if (endT !== null && a && a.name !== 'fanVolley') { after = a.name; gap = game.time - endT; break; }
    }
    d.debug.setAI(false);
    FV.chain = chain0;
    if (d.brain.action) d.brain.stopAction(true);
    B.clear();
    out(`   P3 burst with chain 1: next action ${after} ${Number.isFinite(gap) ? (gap * 1000).toFixed(0) + ' ms' : ''} after it`);
    assert(after === 'emberStorm' && gap <= DT + 1e-6, 'P3: a Cinder burst can run straight into an Ember torrent (brain.queued, no idle)');
  }
  out(`   console errors so far: ${errors.length}`);
  return G;
}

async function scenarioFxLooks() {
  out('\n== scenario FXLOOKS (the wyrm\'s shock fronts and breath in every look: shape, life, budget) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, fx = d.fx, F = game.fx.fire;
  const M = await imp('src/entities/dragon/fx.js');
  const { TUNING } = await imp('src/entities/dragon/tuning.js');
  const step = (s) => {
    for (let t = 0; t < s; t += DT) {
      fx.update(DT);
      F.update(DT);
      game.fx.add?.update?.(DT);
      game.fx.alpha?.update?.(DT);
    }
  };
  const finite = () => {
    for (let i = 0; i < F.count * 15; i++) if (!Number.isFinite(F.data[i])) return false;
    return true;
  };
  const peakOf = (fire, s = 1.6) => {
    let peak = 0;
    fire();
    for (let t = 0; t < s; t += DT) {
      step(DT);
      peak = Math.max(peak, F.count);
    }
    return peak;
  };
  const ignite0 = game.world?.ignite;
  if (game.world) game.world.ignite = () => {}; // (count the effect's own blobs, not the grass it lights)
  for (const L of ['a', 'b', 'c']) {
    M.setRingLook(L);
    assert(M.ringLook() === L, `?ring=${L} can be set`);
    F.clear();
    const ring = peakOf(() => fx.shockRing(0, 0, 7 * 1.875));
    assert(ring >= 150 && ring <= 2000 && finite(), `ring ${L}: the phase roar's shock front is a body (${ring} blobs at its peak, old 124)`);
    assert(fx._shocks.every((w) => !w.alive), `ring ${L}: every front it followed has ended`);
    F.clear();
    const nova = peakOf(() => fx.novaBlast(0, 4, 0, 22));
    // the worst overlap the brief names: the nova during a flame wall (the wall's own peak ~1400)
    assert(nova <= 3200 && nova + 1400 < F.max, `ring ${L}: the nova stays in the pool with a flame wall burning (${nova} + ~1400 of ${F.max})`);
    F.clear();
    const fire0 = game.world?.fire?.count ?? 0;
    const g = peakOf(() => fx.groundShock(5, 5, 6, 1));
    assert(g > 20 && finite() && (game.world?.fire?.count ?? 0) === fire0, `ring ${L}: groundShock draws a dust front (${g} blobs) and lights nothing`);
  }
  M.setRingLook('a');
  // the breath: every look fills the hit cone and stays in it, reaching the far end
  const T = TUNING.attacks.breath;
  const mouth = { x: 0, y: 4, z: 0 };
  for (const L of ['a', 'b', 'c']) {
    M.setBreathLook(L);
    F.clear();
    fx.breathBegin();
    let peak = 0;
    for (let t = 0; t < 1.2; t += DT) {
      fx.breathEmit(DT, mouth, 0, 0.17);
      step(DT);
      peak = Math.max(peak, F.count);
    }
    fx.breathEnd();
    let n = 0, wide = 0, far = 0, out_ = 0;
    for (let i = 0; i < F.count; i++) {
      const k = i * 15, x = F.data[k], z = F.data[k + 2], kind = F.data[k + 12];
      if (kind !== 0) continue;
      const r = Math.hypot(x, z);
      if (r < 2) continue;
      n++;
      const a = Math.abs(Math.atan2(x, z));
      if (a > T.halfAngle + 0.15) out_++;
      if (a > T.halfAngle * 0.6) wide++;
      if (r > T.range * 0.8) far++;
    }
    assert(n > 40 && finite(), `breath ${L}: ${n} blobs of fire in flight (peak ${peak})`);
    assert(out_ / n < 0.06, `breath ${L}: the fire stays in the +-${Math.round((T.halfAngle * 180) / Math.PI)} deg hit cone (${out_} of ${n} outside)`);
    assert(wide / n > 0.1 && far / n > 0.05, `breath ${L}: it fills the cone (${wide} wide, ${far} near the far end)`);
    assert(peak < 1500, `breath ${L}: within budget (${peak} blobs at its peak, old ~370)`);
  }
  M.setBreathLook('a');
  if (game.world) game.world.ignite = ignite0;
  return G;
}

async function scenarioLab() {
  out('\n== scenario LAB (Lab panel, every ability, posture break, time scale, flow states) ==');
  const G = build({ terrain: 'lab' }); // (pieces in reach: the terrain moves take one, ADR-110)
  const { game, counts } = G;
  const lab = game.lab, d = game.dragon, p = game.player, flow = game.flow;
  run(G, 2.0);
  G.input.tap('F1');
  G.tick(DT);
  assert(lab.open === true && !!cls('lab-root'), 'F1 opens the Lab panel');
  assert(game.state === 'title', 'F1 does not dismiss the title');
  assert(flow.debug.toState('nope') === false, "flow.debug.toState('nope') → false");
  // boss
  assert(flow.debug.toState('boss') === true, 'toState(boss) from title');
  run(G, 0.5, { passive: true });
  assert(game.state === 'boss' && d.state === 'combat', `boss: state ${game.state}, dragon ${d.state}`);
  assert(cls('ab-boss')?.classList.contains('on') && game.audio.musicMode === 'boss', 'boss: bar shown, boss music');
  lab.setHitboxes(true);
  run(G, 0.2, { passive: true });
  assert((lab.overlay?.count?.hurt ?? 0) > 0, `hitbox overlay draws hurt spheres (${lab.overlay?.count?.hurt})`);
  const hb = d.debug.hitboxes();
  assert(Array.isArray(hb) && hb.length > 0 && hb.every((h) => [h.x, h.y, h.z, h.r].every(Number.isFinite) && (h.kind === 'hurt' || h.kind === 'attack')), 'dragon.debug.hitboxes() well-formed');
  p.debug.god = true;
  assert(d.debug.setAI(false) === false && d.debug.aiEnabled === false, 'dragon.debug.setAI(false)');
  // Lab keys while open: digits trigger abilities, [ ] step time — and never reach the game
  settle(G);
  place(G, 6);
  const wk0 = counts['dragon:windup'] || 0;
  let digitSeen = false;
  G.input.tap('Digit1');
  digitSeen = G.input.pressed('Digit1');
  run(G, 1.0, { passive: true });
  assert(!digitSeen && (counts['dragon:windup'] || 0) > wk0, 'Lab key 1 triggers ability 1 and is consumed (game never sees it)');
  G.input.tap('BracketLeft');
  assert(game.debugTimeScale === 0.5 && !G.input.pressed('BracketLeft'), `Lab [ steps time 1 → 0.5 (got ${game.debugTimeScale})`);
  G.input.tap('BracketRight');
  assert(game.debugTimeScale === 1, 'Lab ] steps time back to 1');
  run(G, 4, { passive: true, god: true }, () => !d.brain.action && d.state === 'combat');
  // every ability, in turn
  const abilities = d.debug.abilities();
  assert(Array.isArray(abilities) && abilities.length >= 10, `${abilities.length} abilities listed`);
  assert(abilities.every((a) => typeof a.name === 'string' && typeof a.label === 'string' && TELLS.has(a.tell) && Number.isFinite(a.phase)), 'abilities() entries {name,label,tell,phase}');
  for (const a of abilities) {
    settle(G);
    game.world.restore(); // (the abilities before it broke what stood: the terrain moves need a piece)
    place(G, a.name === 'breath' || a.name === 'fireball' || a.name === 'charge' ? 11 : 6);
    if (a.name === 'tailBat') {
      // the tail bat needs a boulder in the tail's ring that is not at the hero's feet. Where the
      // wyrm stands by now depends on every ability before it, so the hero is put where one is in
      // reach (6 m in front of it he stood 1.7 m from the only boulder in the ring once the hero's
      // stance changed the run: ADR-114), tried round the wyrm until the move's own search finds one
      const { tailPiece } = await imp('src/entities/dragon/terrain.js');
      for (const [dist, ang] of [[6, 0], [6, 0.9], [6, -0.9], [9, 0], [9, 1.6], [9, -1.6], [11, 0.9], [11, -0.9], [11, 2.4], [11, -2.4]]) {
        place(G, dist, ang);
        run(G, 0.3, { passive: true, god: true });
        if (tailPiece(d, null, true)) break;
      }
    }
    const e0 = errors.length;
    // (Armageddon's meteors fall for ~12 s after the trigger: its window is longer; a background
    // hazard never spills into the next ability's count)
    // (a flying combo (flight, 2nd pass) runs 7 - 13 s to its crash: it gets the longer window too)
    const r = forceAttack(G, a.name, { max: a.name === 'meteorRain' ? 17 : TUNING.attacks[a.name]?.parts ? 16 : 9, settle: 600 });
    run(G, 10, { passive: true, god: true }, () => !d.brain.action && d.state === 'combat');
    d.hazards.clear();
    const ok = r.trigger === true && evn(r, 'dragon:windup') >= 1 && r.tellT !== null && r.tells.includes(a.tell) && errors.length === e0; // multi-hit: abilities() lists the headline tell
    assert(ok, `ability ${a.name.padEnd(9)} [${a.tell}] tells [${r.tells.join(' ')}] trigger ${r.trigger} windup ${evn(r, 'dragon:windup')} tells ${evn(r, 'combat:tell')} flashes ${evn(r, 'combat:flash')} result ${r.res}${errors.length > e0 ? ' ERRORS' : ''}`);
    assert(evn(r, 'combat:flash') >= 1 && evn(r, 'combat:flash') === evn(r, 'combat:tell'), `   ${a.name}: one combat:flash per combat:tell`);
  }
  assert(p.alive, 'god mode kept the hero alive');
  // time scale: 0 freezes game time, 0.5 halves dt (main.js: dt = realDt × scale × debugTimeScale)
  settle(G);
  lab.setTimeScale(0);
  const t0 = game.time, dpos = d.position.clone();
  run(G, 0.5, { passive: true });
  assert(game.time === t0 && d.position.distanceTo(dpos) < 1e-9, 'debugTimeScale 0 freezes game time');
  lab.setTimeScale(0.5);
  run(G, 0.2, { passive: true }, () => game.hitstopTimer <= 0);
  G.tick(DT);
  assert(near(game.dt, DT * 0.5, 1e-9), `debugTimeScale 0.5 → dt ${game.dt.toFixed(5)}`);
  lab.stepTime(+1);
  assert(game.debugTimeScale === 1, `Lab ] steps 0.5 → 1 (got ${game.debugTimeScale})`);
  // posture break
  settle(G);
  const pb0 = counts['dragon:postureBreak'] || 0;
  assert(d.debug.postureBreak() === true, 'dragon.debug.postureBreak()');
  G.tick(DT);
  assert(d.broken === true && d.state === 'staggered' && (counts['dragon:postureBreak'] || 0) === pb0 + 1, `posture break → broken, staggered, dragon:postureBreak (${d.state})`);
  const hp0 = d.hp;
  const dealt = d.takeHit({ damage: 10, part: 'body', point: { x: d.position.x, y: 2, z: d.position.z } });
  assert(dealt === Math.round(10 * POSTURE.breakCritMult) && hp0 - d.hp === dealt, `broken: hits ×${POSTURE.breakCritMult} (dealt ${dealt})`);
  run(G, POSTURE.breakTime + 0.5, { passive: true });
  assert(!d.broken && d.posture < 1, `break ends after ${POSTURE.breakTime} s, meter empty (posture ${d.posture.toFixed(1)})`);
  // ordinary stagger
  settle(G);
  const sg0 = counts['dragon:stagger'] || 0;
  assert(d.debug.stagger() === true, 'dragon.debug.stagger()');
  G.tick(DT);
  assert(d.state === 'staggered' && !d.broken && (counts['dragon:stagger'] || 0) === sg0 + 1, 'stagger → staggered (not broken), dragon:stagger');
  // phase 2 + setHp
  settle(G);
  assert(d.debug.phase2() === true, 'dragon.debug.phase2()');
  run(G, 6, { passive: true }, () => (counts['dragon:phase2'] || 0) >= 1 && !d.brain.action);
  assert(d.phase === 2 && (counts['dragon:phase2'] || 0) === 1 && d.maxPosture === TUNING.posture.max[1], `phase 2 (posture max ${d.maxPosture})`);
  assert(d.debug.setHp(0.3) === true && d.hp === Math.round(d.maxHp * 0.3), `setHp(0.3) → ${d.hp}`);
  // Loop: re-triggers the selected ability (AI stays as the Lab found it)
  settle(G);
  place(G, 6);
  const w0 = counts['dragon:windup'] || 0;
  lab.setLoop(true, 'bite');
  run(G, 9, { passive: true, god: true });
  const loops = lab.loop.count;
  lab.setLoop(false);
  assert(loops >= 2 && (counts['dragon:windup'] || 0) - w0 >= 2, `Loop re-triggered bite ${loops}x`);
  assert(d.debug.aiEnabled === false, 'Loop restored the AI switch as it found it');
  // player debug API
  assert(p.debug.teleport(2, 8) === true && near(p.position.x, 2, 1e-6) && near(p.position.z, 8, 1e-6), 'player.debug.teleport');
  p.hp = 10;
  p.debug.heal();
  assert(p.hp === p.maxHp, 'player.debug.heal');
  // flow states, each with consistent side effects
  p.debug.god = false;
  const died0 = counts['player:died'] || 0;
  assert(flow.debug.toState('dead') === true, 'toState(dead)');
  run(G, 0.3, { passive: true });
  assert(game.state === 'dead' && !p.alive && (counts['player:died'] || 0) === died0 + 1 && game.audio.musicMode === 'death', `dead: state ${game.state}, hero down, player:died, ${game.audio.musicMode} music`);
  assert(flow.debug.toState('explore') === true, 'toState(explore)');
  run(G, 1.0, { passive: true });
  const sp = CONFIG.world.playerSpawn;
  assert(game.state === 'explore' && p.alive && p.hp === p.maxHp && Math.hypot(p.position.x - sp.x, p.position.z - sp.z) < 0.5, `explore: hero respawned at the bonfire (${game.state})`);
  assert(d.state === 'sleeping' && d.hp === d.maxHp && d.phase === 1 && d.posture === 0 && game.audio.musicMode === 'ambient', `explore: dragon asleep, reset; ${game.audio.musicMode} music`);
  assert(!cls('ab-boss')?.classList.contains('on'), 'explore: boss bar hidden');
  assert(flow.debug.toState('boss') === true, 'toState(boss) from explore');
  run(G, 0.5, { passive: true });
  assert(game.state === 'boss' && d.state === 'combat' && cls('ab-boss')?.classList.contains('on'), `boss again: ${game.state} / ${d.state}`);
  const v0 = counts['game:victory'] || 0;
  assert(flow.debug.toState('victory') === true, 'toState(victory)');
  run(G, 15, { passive: true }, () => game.state === 'victory');
  run(G, 1, { passive: true });
  assert(game.state === 'victory' && d.state === 'dead' && (counts['game:victory'] || 0) === v0 + 1 && game.audio.musicMode === 'victory', `victory: ${game.state}, dragon ${d.state}, game:victory, ${game.audio.musicMode} music`);
  assert(flow.debug.toState('boss') === true, 'toState(boss) from victory');
  run(G, 0.5, { passive: true });
  assert(game.state === 'boss' && d.state === 'combat' && d.hp === d.maxHp, `boss after victory: dragon reset and fighting (${d.state}, hp ${d.hp})`);
  // model viewer (look-dev): the reference sheet's rear 3/4, the solid render, the turntable, the
  // live sheet overlay, and a clean exit (camera, look and overlay restored)
  const sheetEl = () => document.body.find?.((e) => e.classList?.contains('lab-sheet'));
  const mv = lab.modelView({ target: 'hero', yaw: 215, dark: true, look: 'solid' });
  assert(mv?.yaw === 215 && mv.look === 'solid' && game.U.uHeroSolid.value === 1 && !!game.viewOverride, `model view: rear 3/4 (yaw ${mv?.yaw}), the solid look sets U.uHeroSolid`);
  lab.modelView({ target: 'hero', spin: true, yaw: 0, dark: true, look: 'ascii' });
  run(G, 0.5, { passive: true });
  const spun = lab.viewer.describe();
  assert(spun?.spin && spun.yaw > 10 && spun.yaw < 30 && game.U.uHeroSolid.value === 0, `model view: the turntable turns (yaw ${spun?.yaw} after 0.5 s), the ascii look clears U.uHeroSolid`);
  lab.modelView({ target: 'hero', sheet: true, dark: true });
  run(G, 0.6, { passive: true });
  assert(lab.viewer.describe()?.sheet && !!sheetEl() && errors.length === 0, 'model view: the live sheet overlay is up and cycles its angles without errors');
  lab.modelView(null);
  assert(game.viewOverride === null && game.U.uHeroSolid.value === 0 && !sheetEl(), 'model view exit: game camera, ascii look, no sheet overlay');
  // pause → Lab reset path, then close the panel: cheats show on the badge
  G.input.tap('Escape'); G.tick(DT);
  assert(game.state === 'paused', 'Esc → paused');
  assert(flow.debug.toState('explore') === true, 'toState(explore) from pause');
  run(G, 0.5, { passive: true });
  assert(game.state === 'explore' && game.timeScale === 1 && d.state === 'sleeping', `pause → explore unpaused (${game.state}, timeScale ${game.timeScale})`);
  p.debug.infiniteFlasks = true;
  G.input.tap('Backquote');
  run(G, 1, { passive: true });
  assert(lab.open === false && !!cls('lab-badge'), 'backquote closes the panel; badge shows the active cheat');
  return G;
}

// ================================================================== scenario: fire / flight attacks + hazards (dragon-fire)
// ================================================================== scenario: the flying combos (2nd pass)
// Each combo in the phase it opens in: every part cued (one flash per blow, the blow within 2.5
// frames of flash + lead), a standing hero hit by every part, a hero who rolls on each cue (early,
// across the blow: i-frames, not a perfect dodge) untouched, the wyrm inside its bound and <= 16 m up,
// back on the ground in 'combat' at the end; then a perfect dodge of a shell mid-combo plunges it out
// of the air and ends the combo.
async function scenarioFlight() {
  out('\n== scenario FLIGHT (flying combos: every part cued and answerable, bounds, the plunge ends a combo) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player, H = d.hazards, lead = TUNING.flashLead;
  const COMBOS = { skyHunt: 1, skyFurnace: 2, skyCataclysm: 3 };
  const { FLIGHT } = await imp('src/entities/dragon/tuningFire.js');
  const listed = new Set(d.debug.abilities().map((a) => a.name));
  /** Stage: the wyrm in the middle facing south, the hero `dist` m in front of it, phase `ph`. */
  const stage = (ph, dist) => {
    settle(G, 12);
    H.clear();
    d.phase = ph;
    G.tick(DT);
    H.clear();
    d.position.set(0, 0, -8);
    d.yaw = 0;
    d.rig.snap();
    run(G, 0.3, { passive: true });
    p.debug.teleport(d.position.x, d.position.z + dist);
    p.yaw = Math.PI;
    p.debug.heal();
    p.burnT = 0;
    aimAt(G);
  };
  /** 1 if (x, z) is in the burning part of a strip (of `only`, or of any): the fire a walker must leave. */
  const burning = (x, z, only = null) => {
    for (const h of H.list) {
      if (!h.alive || h.shape !== 1 || (only && h !== only)) continue;
      const run = h.t - h.impact;
      if (run <= -0.6) continue;
      const f = Math.min(h.len, Math.max(0, run) * h.speed + 3), b0 = Math.max(0, (run - h.linger) * h.speed);
      const ex = x - h.ax, ez = z - h.az, sAl = ex * h.dx + ez * h.dz, lat = Math.abs(ex * h.dz - ez * h.dx);
      if (lat <= h.w / 2 + 1.0 && sAl >= b0 - 1 && sAl <= f + 1) return 1;
    }
    return 0;
  };
  const trial = (name, ph, answer) => {
    stage(ph, 16);
    p.debug.god = !answer;
    const hp0 = p.hp, h0 = G.hits.length;
    const flashes = [], tells = [], pend = [];
    let maxAlt = 0, outB = 0, finite = true, parts = new Set();
    G.watch = (n, dd) => {
      if (dd?.attack !== name) return;
      if (n === 'combat:tell') { tells.push(game.time); pend.push({ at: game.time + dd.impactIn, done: false }); }
      if (n === 'combat:flash') {
        flashes.push(game.time);
        // the flash re-times the pending answer nearest to it
        let best = null;
        for (const e of pend) if (!e.done && (!best || Math.abs(e.at - game.time - lead) < Math.abs(best.at - game.time - lead))) best = e;
        if (best) best.at = game.time + lead;
      }
    };
    const trig = game.lab.trigger(name);
    let done = false, rollT = 0;
    for (let i = 0; i < Math.round(24 / DT) && !done; i++) {
      input.axis = { x: 0, y: 0 };
      if (answer) {
        for (const e of pend) {
          if (e.done || e.at - game.time - DT > 0.25) continue;
          e.done = true;
          // roll across the line from the hero to the wyrm, to the side that is not burning (toward
          // the middle of the clearing when both are clear)
          const dx = d.position.x - p.position.x, dz = d.position.z - p.position.z, l = Math.hypot(dx, dz) || 1;
          let qx = -dz / l, qz = dx / l;
          const bad = (sg) => burning(p.position.x + qx * sg * 4.2, p.position.z + qz * sg * 4.2) * 10 + (qx * sg * p.position.x + qz * sg * p.position.z > 0 ? 1 : 0) + (Math.hypot(p.position.x + qx * sg * 4.2, p.position.z + qz * sg * 4.2) > 27 ? 20 : 0);
          if (bad(-1) < bad(1)) { qx = -qx; qz = -qz; }
          input.axis = { x: qx, y: -qz };
          input.tap('Space');
          rollT = game.time;
        }
        // standing in burning ground (not rolling): walk straight out of it, as a player would
        if (p.state !== 'roll' && game.time - rollT > 0.45) {
          for (const h of H.list) if (h.alive && h.shape === 1 && h.attack === name && burning(p.position.x, p.position.z, h)) {
            const ex = p.position.x - h.ax, ez = p.position.z - h.az, lat = ex * h.dz - ez * h.dx, sg = lat >= 0 ? 1 : -1;
            input.axis = { x: h.dz * sg, y: h.dx * sg };
          }
        }
      }
      G.tick(DT);
      const s = d.rig.s;
      if (![d.position.x, d.position.z, s.alt, d.rig.pt.head.y, d.yaw].every(Number.isFinite)) finite = false;
      maxAlt = Math.max(maxAlt, s.alt);
      if (Math.hypot(d.position.x, d.position.z) > d.bound + 0.01) outB++;
      if (d.brain.action?.name === name) parts.add(d.brain.action.phase);
      done = !d.brain.action && d.state === 'combat' && !H.count(null);
    }
    G.watch = null;
    input.axis = { x: 0, y: 0 };
    const hits = G.hits.slice(h0).filter((h) => h.attack === name);
    const red = hits.filter((h) => h.tell === TELL.RED);
    let worst = 0;
    for (const h of red) {
      const f = flashes.filter((t) => t <= h.t + 1e-6).pop();
      const err = f === undefined ? Infinity : h.t - (f + lead);
      if (Math.abs(err) > Math.abs(worst)) worst = err;
    }
    return { trig, done, tells: tells.length, flashes: flashes.length, red, hurt: hp0 - p.hp, hits, worst, maxAlt, outB, finite, parts: [...parts].join(' '), alt: d.rig.s.alt, state: d.state };
  };
  for (const [name, ph] of Object.entries(COMBOS)) {
    const C = TUNING.attacks[name];
    assert(listed.has(name) && C?.tell === TELL.RED && Array.isArray(C.parts) && C.parts.at(-1) === 'dive', `${name}: a red Lab ability whose parts end in the dive`);
    assert(C.parts.length === ph + 1 && C.phase === ph, `${name}: ${ph + 1} parts, opening in phase ${ph}`);
    const want = C.parts.reduce((n, k) => n + (k === 'barrage' ? FLIGHT.barrage.shots[ph - 1] : 1), 0);
    const st = trial(name, ph, false);
    const blowsHit = new Set(st.red.filter((h) => h.r === RESULT.HIT).map((h) => h.kind));
    out(`   P${ph} ${name.padEnd(12)} standing: phases [${st.parts}] tells ${st.tells}/${want} flashes ${st.flashes} · red hits ${st.red.length} (${[...blowsHit].join(', ')}) · worst hit-(flash+lead) ${(st.worst * 1000).toFixed(0)} ms · max alt ${st.maxAlt.toFixed(1)} · out ${st.outB} · end ${st.state} alt ${st.alt.toFixed(2)}`);
    assert(st.trig === true && st.done && st.finite, `${name}: completes, finite, back to combat with its hazards gone`);
    assert(st.tells === want && st.flashes === want, `${name}: one tell and one flash per blow (${st.tells} / ${st.flashes} of ${want})`);
    assert(Math.abs(st.worst) <= 2.5 * DT, `${name}: every blow lands within 2.5 frames of its flash + lead (${(st.worst * 1000).toFixed(0)} ms)`);
    assert(blowsHit.has('strip') === C.parts.includes('pass') && blowsHit.has('dive') && blowsHit.has('shell') === C.parts.includes('barrage'), `${name}: a standing hero is hit by every part (${[...blowsHit].join(', ')})`);
    assert(st.maxAlt <= 16 && st.outB === 0, `${name}: <= 16 m up (${st.maxAlt.toFixed(1)}) and inside the bound (${st.outB} frames out)`);
    assert(st.state === 'combat' && st.alt < 0.2, `${name}: ends on the ground in combat (${st.state}, alt ${st.alt.toFixed(2)})`);
    const an = trial(name, ph, true);
    out(`   P${ph} ${name.padEnd(12)} rolling on the cues: HP lost ${an.hurt} · results ${JSON.stringify(an.hits.map((h) => h.r + ':' + h.kind))}`);
    assert(an.done && an.hurt === 0 && !an.hits.some((h) => h.r === RESULT.HIT), `${name}: a hero who rolls on every cue takes no damage (${an.hurt})`);
  }
  // ---- a perfect dodge of a shell mid-combo: the plunge, the crash, the combo is over
  {
    const name = 'skyCataclysm';
    stage(3, 16);
    p.debug.god = false;
    p.debug.streak?.(0);
    let shellAt = -1, plunged = false, rolled = false, crashed = false, back = false, after = 0;
    const h0 = G.hits.length;
    G.watch = (n, dd) => {
      if (n === 'combat:flash' && dd?.attack === name && d.brain.action?.phase === 'barrage' && shellAt < 0) shellAt = game.time + lead;
    };
    game.lab.trigger(name);
    for (let i = 0; i < Math.round(20 / DT); i++) {
      input.axis = { x: 0, y: 0 };
      if (shellAt > 0 && !rolled && shellAt - game.time - DT <= 0.1) {
        rolled = true;
        const dx = d.position.x - p.position.x, dz = d.position.z - p.position.z, l = Math.hypot(dx, dz) || 1;
        input.axis = { x: dx / l, y: -dz / l };
        input.tap('Space');
      }
      G.tick(DT);
      if (p.state === 'plunge') plunged = true;
      if (d.brain.action?.name === 'plunged' && d.rig.s.alt < 0.2) crashed = true;
      if (d.brain.action?.name === name && crashed) after++;
      if (crashed && !d.brain.action && d.state === 'combat') { back = true; break; }
    }
    G.watch = null;
    const res = G.hits.slice(h0).filter((h) => h.attack === name).map((h) => h.r);
    out(`   plunge mid-combo: results ${JSON.stringify(res)} · plunge ${plunged} · crashed ${crashed} · combo frames after the crash ${after} · back in combat ${back} (alt ${d.rig.s.alt.toFixed(2)})`);
    assert(res.includes(RESULT.PERFECT) && plunged && crashed && after === 0 && back && d.rig.s.alt < 0.2, 'a perfect dodge of a shell plunges the flying wyrm out of the combo: it crashes and fights on');
    settle(G, 12);
    assert(!H.count('strip') || [...H.list].every((h) => !h.alive || h.attack !== name || h.shape !== 1 || h.t >= h.impact), 'no strip of the broken combo is left to start burning');
  }
  // ---- more fire from the spells each phase: flame rings 1 / 2 / 3, flame walls (P3) 2, eruption pools
  for (const [name, ph, want] of [['flameRing', 2, TUNING.attacks.flameRing.rings[1]], ['flameRing', 3, TUNING.attacks.flameRing.rings[2]], ['flameWall', 3, TUNING.attacks.flameWall.walls[2]]]) {
    stage(ph, name === 'flameRing' ? 9 : 14);
    p.debug.god = true;
    const tl = [], fl = [], h0 = G.hits.length;
    G.watch = (n, dd) => { if (dd?.attack !== name) return; if (n === 'combat:tell') tl.push(game.time); if (n === 'combat:flash') fl.push(game.time); };
    game.lab.trigger(name);
    run(G, 8, { passive: true }, () => !d.brain.action && !H.count(null));
    G.watch = null;
    const red = G.hits.slice(h0).filter((h) => h.attack === name && h.tell === TELL.RED);
    let worst = 0, gap = Infinity;
    red.forEach((h, i) => {
      const f = fl.filter((t) => t <= h.t + 1e-6).pop();
      const err = f === undefined ? Infinity : h.t - (f + lead);
      if (Math.abs(err) > Math.abs(worst)) worst = err;
      if (i) gap = Math.min(gap, h.t - red[i - 1].t);
    });
    out(`   P${ph} ${name}: tells ${tl.length} flashes ${fl.length} (want ${want}) · red hits on a standing hero ${red.length} · closest two ${gap.toFixed(2)} s · worst hit-(flash+lead) ${(worst * 1000).toFixed(0)} ms`);
    assert(tl.length === want && fl.length === want && red.length === want, `P${ph} ${name}: ${want} of them, each cued and each hitting a standing hero (${tl.length} / ${fl.length} / ${red.length})`);
    assert(Math.abs(worst) <= 2.5 * DT && gap >= 0.45, `P${ph} ${name}: each lands on its own flash + lead (${(worst * 1000).toFixed(0)} ms), >= 0.45 s apart (${gap.toFixed(2)} s)`);
  }
  {
    stage(2, 14);
    p.debug.god = true;
    const h0 = G.hits.length;
    game.lab.trigger('eruptions');
    let pools = 0;
    run(G, 6, { passive: true }, () => { pools = Math.max(pools, H.count('pool')); return false; });
    const ticks = G.hits.slice(h0).filter((h) => h.attack === 'eruptions' && h.tell !== TELL.RED && h.kind === 'fire').length;
    out(`   P2 eruptions: burning pools at once ${pools} · contact ticks on a hero standing in one ${ticks}`);
    assert(pools >= 3 && ticks >= 1, `P2 eruptions: the pillars leave burning pools that tick a hero standing in them (${pools}, ${ticks})`);
  }
  d.phase = 1;
  run(G, 0.5, { passive: true });
  return G;
}

async function scenarioFire() {
  out('\n== scenario FIRE (flight attacks, spells, hazards: completion, flight bounds, flash timing, dodges, clear) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player, H = d.hazards, lead = TUNING.flashLead;
  const ER_MAX_CHASE_HITS = TUNING.attacks.eruptions.chase.maxHits;
  // (2nd pass: the three flying combos join the list; FLIGHT checks them part by part)
  const FIRE_NAMES = ['skyStrafe', 'diveBomb', 'hoverBarrage', 'skyHunt', 'skyFurnace', 'skyCataclysm', 'meteorRain', 'eruptions', 'flameRing', 'flameWall', 'nova'];
  const AIR = new Set(['skyStrafe', 'diveBomb', 'hoverBarrage', 'skyHunt', 'skyFurnace', 'skyCataclysm']);
  const COMBO_HIGH = ['pass', 'barrage', 'hover'];
  const HIGH = { skyStrafe: ['pass'], diveBomb: ['hover'], hoverBarrage: ['barrage'], skyHunt: COMBO_HIGH, skyFurnace: COMBO_HIGH, skyCataclysm: COMBO_HIGH };
  const listed = new Set(d.debug.abilities().map((a) => a.name));
  assert(FIRE_NAMES.every((n) => listed.has(n) && TUNING.attacks[n]?.tell === TELL.RED), 'every fire attack is a red Lab ability with tuning data');
  assert(H && typeof H.clear === 'function' && H.alive === 0, 'dragon.hazards exists, empty at the start');
  // payloads of the fire events (not in the shared PAYLOAD table: checked here)
  const badPay = [];
  const okPay = (n, dd) => {
    if (n === 'dragon:spell' && !(typeof dd?.name === 'string' && Number.isFinite(dd.x) && Number.isFinite(dd.z))) badPay.push(n);
    if (n === 'dragon:hazard' && !(typeof dd?.kind === 'string' && typeof dd?.stage === 'string' && [dd.x, dd.z, dd.radius].every(Number.isFinite))) badPay.push(n);
  };
  /** Put the hero `dist` m straight ahead of the wyrm (world metres), facing it, full HP. */
  const front = (dist) => {
    const a = d.yaw;
    p.debug.teleport(d.position.x + Math.sin(a) * dist, d.position.z + Math.cos(a) * dist);
    p.yaw = Math.atan2(d.position.x - p.position.x, d.position.z - p.position.z);
    p.debug.heal();
    aimAt(G);
  };
  const PLACE = { skyStrafe: 18, diveBomb: 14, hoverBarrage: 14, skyHunt: 18, skyFurnace: 14, skyCataclysm: 18, meteorRain: 12, eruptions: 14, flameRing: 9, flameWall: 14, nova: 12 };
  const timing = [];
  for (const name of FIRE_NAMES) {
    settle(G);
    H.clear();
    d.position.set(0, 0, -8);
    d.yaw = 0;
    d.rig.snap();
    run(G, 0.3, { passive: true });
    front(PLACE[name]);
    p.debug.god = true;
    const flashes = [], tells = [];
    const h0 = G.hits.length;
    let finite = true, maxAlt = 0, outOfBound = 0, circlesInAir = 0, lowSphere = Infinity, lowWhy = '', sawAir = false, spells = 0;
    G.watch = (n, dd) => {
      okPay(n, dd);
      if (n === 'dragon:spell' && dd?.name === name) spells++;
      if (dd?.attack !== name) return;
      if (n === 'combat:tell') tells.push(game.time);
      if (n === 'combat:flash') flashes.push(game.time);
      if (n === 'combat:flash') flashAt.push({ t: game.time, x: dd.x, z: dd.z });
    };
    const flashAt = [];
    const trig = game.lab.trigger(name);
    let done = false;
    for (let i = 0; i < Math.round(20 / DT) && !done; i++) {
      input.axis = { x: 0, y: 0 };
      G.tick(DT);
      const pt = d.rig.pt, s = d.rig.s;
      if (![pt.head.x, pt.head.y, pt.head.z, pt.chest.y, pt.hips.y, pt.mouth.y, s.alt, s.pitch, d.yaw].every(Number.isFinite)) finite = false;
      maxAlt = Math.max(maxAlt, s.alt);
      if (Math.hypot(d.position.x, d.position.z) > d.bound + 0.01) outOfBound++;
      if (d.state === 'airborne') {
        sawAir = true;
        if (d.bodyCircles.length) circlesInAir++;
      }
      // up in its main flight phase (the pass, the hover, the barrage) nothing is in sword reach
      if (HIGH[name]?.includes(d.brain.action?.phase)) for (const h of d.hurtSpheres) { if (h.y - h.r < lowSphere) { lowSphere = h.y - h.r; lowWhy = `${h.part} at ${d.brain.action?.phase} alt ${s.alt.toFixed(1)}`; } }
      done = !d.brain.action && d.state === 'combat' && !H.count(null);
    }
    G.watch = null;
    const hits = G.hits.slice(h0).filter((h) => h.attack === name && h.tell === TELL.RED);
    // each red blow lands flashLead after its timing flash (within ~2 frames)
    let worst = 0;
    for (const h of hits) {
      // its own flash: a hazard flashes at its own centre (Armageddon's impacts are 0.12 s apart, so
      // the latest flash is often a neighbour's); other blows: the latest flash
      const own = flashAt.filter((e) => e.t <= h.t + 1e-6 && Number.isFinite(h.fx) && Math.hypot(e.x - h.fx, e.z - h.fz) < 0.6).pop();
      const f = own ? own.t : flashes.filter((t) => t <= h.t + 1e-6).pop();
      const err = f === undefined ? Infinity : h.t - (f + lead);
      if (Math.abs(err) > Math.abs(worst)) worst = err;
    }
    timing.push(`${name} ${(worst * 1000).toFixed(0)}ms/${hits.length}`);
    out(`   ${name.padEnd(12)} trigger ${trig} done ${done} tells ${tells.length} flashes ${flashes.length} red hits ${hits.length} worst hit-(flash+lead) ${(worst * 1000).toFixed(0)} ms · max alt ${maxAlt.toFixed(1)} m${Number.isFinite(lowSphere) ? ` · lowest hurt sphere in flight ${lowSphere.toFixed(1)} m (${lowWhy})` : ''}`);
    assert(trig === true && done, `${name}: forced through the Lab, completes, back to combat with its hazards gone (${d.state})`);
    assert(finite, `${name}: positions and pose stay finite`);
    assert(tells.length >= 1 && tells.length === flashes.length, `${name}: one timing flash per tell (${tells.length} / ${flashes.length})`);
    assert(hits.length >= 1, `${name}: the standing hero is hit (${hits.length} red blows)`);
    assert(Math.abs(worst) <= 2.5 * DT, `${name}: every blow lands ~flashLead after its flash (worst ${(worst * 1000).toFixed(0)} ms)`);
    assert(maxAlt <= 16 && !outOfBound, `${name}: stays <= 16 m up and inside the bound (alt ${maxAlt.toFixed(1)}, out ${outOfBound})`);
    if (AIR.has(name)) {
      assert(sawAir && !circlesInAir, `${name}: flies (state airborne) with no body circles (${circlesInAir} frames with circles)`);
      assert(Number.isFinite(lowSphere) && lowSphere > 4.5, `${name}: flying, every hurt sphere is out of sword reach (lowest ${lowSphere.toFixed(1)} m, ${lowWhy})`);
    }
    assert(spells >= 1, `${name}: dragon:spell announces it`);
  }
  out('   flash timing: ' + timing.join(' · '));
  assert(!badPay.length, `dragon:spell / dragon:hazard payloads ${JSON.stringify(badPay.slice(0, 4))}`);

  // ---- ARMAGEDDON (meteorRain, ADR-053): the wave placement's guarantees (pure, 200 seeded runs),
  // then the whole move per phase: counts, cues, the cap + finale, a rolling hero, the clear
  {
    const HZ = await imp('src/entities/dragon/hazards.js');
    const MR = TUNING.attacks.meteorRain;
    const rngOf = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let worstCover = 0, worstOverlap = 0, outside = 0;
    for (let sd = 0; sd < 200; sd++) {
      const rng = rngOf(sd * 7919 + 13);
      const n = sd & 1 ? 10 : 8, pts = new Float64Array(n * 2);
      const a = rng() * Math.PI * 2, rr = 28 * Math.sqrt(rng());
      let hx = Math.sin(a) * rr, hz = Math.cos(a) * rr;
      HZ.placeWave(n, MR.radius, rng, hx, hz, pts, MR.safeR, MR.safeCover - 0.08);
      // the led ones come in at spawn time on a hero who has moved a little since
      for (let k = 0; k < n; k += MR.ledEvery) {
        hx += (rng() - 0.5) * 4;
        hz += (rng() - 0.5) * 4;
        HZ.leadInto(pts, k, n, MR.radius, hx + (rng() - 0.5) * 2, hz + (rng() - 0.5) * 2, hx, hz, MR.safeR, MR.safeCover);
      }
      worstCover = Math.max(worstCover, HZ.coverage(pts, n, MR.radius, hx, hz, MR.safeR));
      for (let i = 0; i < n; i++) {
        if (Math.hypot(pts[2 * i], pts[2 * i + 1]) > HZ.ARENA_R + 1e-6) outside++;
        for (let j = 0; j < i; j++) worstOverlap = Math.max(worstOverlap, HZ.overlapShare(Math.hypot(pts[2 * i] - pts[2 * j], pts[2 * i + 1] - pts[2 * j + 1]), MR.radius));
      }
    }
    out(`   Armageddon waves, 200 seeded runs: within ${MR.safeR} m of the hero at most ${(worstCover * 100).toFixed(1)} % covered · worst overlap ${(worstOverlap * 100).toFixed(1)} % of a footprint · ${outside} spots outside ${HZ.ARENA_R} m`);
    assert(worstCover <= MR.safeCover + 1e-9, `safe ground: a wave covers at most ${MR.safeCover * 100} % within ${MR.safeR} m of the hero (worst ${(worstCover * 100).toFixed(1)} %)`);
    assert(worstOverlap <= HZ.OVERLAP + 1e-9 && outside === 0, `no two footprints of a wave overlap by more than a third (worst ${(worstOverlap * 100).toFixed(1)} %), none outside the clearing`);

    /** The whole move in `phase` against a hero 12 m out: standing (god) or answering the cues (makeDefender). */
    const armageddon = (phase, answer, cutAt = -1) => {
      settle(G, 12);
      H.clear();
      if (d.phase !== phase) { d.enterPhase(phase); run(G, 0.2, { passive: true }); settle(G, 12); }
      H.clear();
      d.position.set(0, 0, -8);
      d.yaw = 0;
      d.rig.snap();
      run(G, 0.3, { passive: true });
      front(12);
      p.debug.god = !answer;
      p.debug.heal();
      p.burnT = 0;
      const def = answer ? makeDefender(G) : null;
      const rec = { launches: 0, sky: 0, impacts: [], flashes: [], tells: 0, glow: 0 };
      const h0 = G.hits.length;
      G.watch = (n, dd) => {
        def?.onEvent(n, dd);
        if (n === 'dragon:hazard' && dd?.kind === 'meteor') {
          if (dd.stage === 'launch') rec.launches++;
          if (dd.stage === 'sky') rec.sky++;
          if (dd.stage === 'hit') rec.impacts.push({ t: game.time, x: dd.x, z: dd.z, r: dd.radius });
        }
        if (dd?.attack !== 'meteorRain') return;
        if (n === 'combat:tell') rec.tells++;
        if (n === 'combat:flash') rec.flashes.push({ t: game.time, x: dd.x, z: dd.z });
      };
      const trig = game.lab.trigger('meteorRain');
      let cut = false;
      for (let i = 0; i < Math.round(24 / DT); i++) {
        input.axis = { x: 0, y: 0 };
        def?.act();
        G.tick(DT);
        for (const h of H.list) if (h.alive && h.shape === HZ.SHAPE.BARRAGE && h.t >= h.glowAt) rec.glow = 1;
        if (cutAt >= 0 && !cut && rec.impacts.length >= cutAt) {
          cut = true;
          rec.beforeCut = rec.impacts.length;
          d.enterPhase(Math.min(3, d.phase + 1));
          run(G, 2 * DT, { passive: true });
          rec.afterCut = { meteors: H.count('meteor'), barrage: H.count('barrage') };
          run(G, 4, { passive: true });
          break;
        }
        if (!d.brain.action && !H.count(null)) break;
      }
      G.watch = null;
      input.up(1);
      p.debug.god = true;
      const hits = G.hits.slice(h0).filter((h) => h.attack === 'meteorRain');
      rec.trig = trig;
      rec.red = hits.filter((h) => h.tell === TELL.RED);
      rec.redHits = rec.red.filter((h) => h.r === RESULT.HIT);
      rec.ticks = hits.filter((h) => h.tell !== TELL.RED && h.r === RESULT.HIT).length;
      // each red blow against its own flash: the flash at its own centre whose blow is due nearest to
      // this one (two meteors of different waves can come down within 0.6 m of each other: the latest
      // flash there is then the later meteor's, not this blow's)
      // A blow that follows another within 0.3 s is `chained`: the hero is still in the first one's
      // hit reaction when it comes down, so it catches him some frames into its blast (a meteor's
      // blast stays active 0.12 s, hazards.js), not on its first frame. Which meteors fall that close
      // together on a standing hero depends on the seeded layout.
      rec.worst = 0;
      rec.worstChained = 0;
      rec.red.forEach((h, i) => {
        let err = Infinity;
        for (const e of rec.flashes) {
          if (e.t > h.t + 1e-6 || Math.hypot(e.x - h.fx, e.z - h.fz) >= 0.6) continue;
          const d = h.t - (e.t + lead);
          if (Math.abs(d) < Math.abs(err)) err = d;
        }
        if (i > 0 && h.t - rec.red[i - 1].t < 0.3) {
          if (Math.abs(err) > Math.abs(rec.worstChained)) rec.worstChained = err;
        } else if (Math.abs(err) > Math.abs(rec.worst)) rec.worst = err;
      });
      rec.out = rec.impacts.filter((e) => Math.hypot(e.x, e.z) > HZ.ARENA_R + 1e-6).length;
      rec.great = rec.impacts.filter((e) => e.r > MR.radius + 0.5).length;
      return rec;
    };
    for (const phase of [2, 3]) {
      const per = (v) => (Array.isArray(v) ? v[Math.min(v.length - 1, phase - 1)] : v);
      const want = per(MR.waves) * per(MR.perWave);
      const st = armageddon(phase, false);
      out(`   P${phase} Armageddon, standing: bolts ${st.launches}/${per(MR.missiles)} · sky ${st.sky} · impacts ${st.impacts.length} (${want} + 1 great: ${st.great}) · outside ${st.out} · tells ${st.tells}/${st.flashes.length} · red hits ${st.redHits.length}/${MR.maxHits}+1 · crater ticks ${st.ticks} · worst hit-(flash+lead) ${(st.worst * 1000).toFixed(0)} ms`);
      assert(st.trig === true && st.launches === per(MR.missiles) && st.sky === 1 && st.glow === 1, `P${phase} Armageddon: ${per(MR.missiles)} bolts into the sky, then the sky answers`);
      assert(st.impacts.length === want + 1 && st.great === 1, `P${phase} Armageddon: ${per(MR.waves)} waves x ${per(MR.perWave)} meteors + one great meteor (${st.impacts.length})`);
      assert(st.out === 0, `P${phase} Armageddon: no meteor lands outside ${HZ.ARENA_R} m`);
      assert(st.tells === st.flashes.length && st.redHits.length >= 1 && st.redHits.length <= MR.maxHits + 1, `P${phase} Armageddon: one flash per tell; a standing hero is hit at most maxHits + the finale (${st.redHits.length})`);
      assert(Math.abs(st.worst) <= 1.05 * DT && st.worstChained >= -1.05 * DT && st.worstChained <= 0.12 + 1.05 * DT,
        `P${phase} Armageddon: every blow lands within a frame of its own flash + lead (worst ${(st.worst * 1000).toFixed(0)} ms), one chained to the blow before it within its 0.12 s blast (worst ${(st.worstChained * 1000).toFixed(0)} ms)`);
      if (per(MR.craterBurn) > 0) assert(st.ticks >= 1, `P${phase} Armageddon: the craters burn (contact ticks ${st.ticks})`);
      const an = armageddon(phase, true);
      out(`   P${phase} Armageddon, rolling on the cues: red hits ${an.redHits.length} · dodged ${an.red.filter((h) => h.r === RESULT.DODGED || h.r === RESULT.PERFECT).length} · crater ticks ${an.ticks} · tells ${an.tells}`);
      assert(an.redHits.length <= 1, `P${phase} Armageddon: a hero who rolls on the cues takes at most one hit (${an.redHits.length})`);
    }
    const cl = armageddon(2, false, 3);
    out(`   Armageddon cut by a phase change after ${cl.beforeCut} impacts: meteors ${cl.afterCut?.meteors} · barrage ${cl.afterCut?.barrage} · impacts after ${cl.impacts.length - cl.beforeCut}`);
    assert(cl.afterCut && cl.afterCut.meteors === 0 && cl.afterCut.barrage === 0 && cl.impacts.length === cl.beforeCut, 'a phase change clears the Armageddon (no meteor lands after it)');
    settle(G, 12);
    d.enterPhase(1);
    H.clear();
  }

  // ---- a hazard against the hero: standing → hit, rolling (i-frames) → dodged, rolling out of its ring → untouched
  const meteorAt = (delay) => H.circle({ kind: 'meteor', attack: 'meteorRain', x: p.position.x, z: p.position.z, r: 3.4, delay, damage: 18, burn: 0, knockback: 3, fall: 0.6, from: { x: p.position.x + 5, y: 30, z: p.position.z - 11 } });
  const hazardTrial = (rollAt, axis) => {
    settle(G);
    H.clear();
    p.debug.god = false;
    p.debug.heal();
    p.burnT = 0;
    const hp0 = p.hp, h0 = G.hits.length;
    const delay = 1.2;
    meteorAt(delay);
    let told = 0, flashT = -1, rolled = false;
    const t0 = game.time;
    G.watch = (n, dd) => {
      if (dd?.attack !== 'meteorRain') return;
      if (n === 'combat:tell') told++;
      if (n === 'combat:flash') flashT = game.time;
    };
    for (let i = 0; i < Math.round(2.2 / DT); i++) {
      input.axis = { x: 0, y: 0 };
      if (rollAt !== null && !rolled && game.time - t0 >= delay - rollAt - 1e-6) {
        rolled = true;
        input.axis = axis;
        input.tap('Space');
      }
      G.tick(DT);
    }
    G.watch = null;
    const h = G.hits.slice(h0).find((x) => x.attack === 'meteorRain');
    return { res: h?.r ?? null, hp: hp0 - p.hp, told, flash: flashT >= 0 ? flashT - t0 : null };
  };
  const st = hazardTrial(null);
  out(`   meteor on a standing hero: ${st.res}, -${st.hp} HP, tells ${st.told}, flash at ${st.flash?.toFixed(3)} s (impact 1.2)`);
  assert(st.res === RESULT.HIT && near(st.hp, 18 * (TUNING.damageScale ?? 1), 0.01) && st.told === 1 && near(st.flash, 1.2 - lead, 1.5 * DT), 'a meteor hits a standing hero (announced, flashed flashLead before impact)');
  const rl = hazardTrial(0.25, { x: 0, y: 1 });
  out(`   meteor vs a roll 0.25 s before impact: ${rl.res}, -${rl.hp} HP`);
  assert(rl.res === RESULT.DODGED && rl.hp === 0, 'a rolling hero with i-frames is not hit (dodged)');
  const out1 = hazardTrial(0.8, { x: 1, y: 0 });
  out(`   meteor vs a roll out of the ring 0.8 s before impact: ${out1.res}, -${out1.hp} HP`);
  assert(out1.res === null && out1.hp === 0, 'a plain dodge out of the ring avoids it (no blow reaches the hero)');

  // ---- the strafe's burning strip: contact ticks while standing in it, none while rolling through it
  settle(G);
  H.clear();
  p.debug.god = false;
  p.debug.heal();
  const sx = p.position.x, sz = p.position.z;
  const strip = H.strip({ kind: 'strip', attack: 'skyStrafe', announce: false, ax: sx, az: sz - 6, bx: sx, bz: sz + 6, w: 4.6, delay: 0.05, speed: 40, linger: 2.5, tick: 0.25, tickDamage: 4, tickBurn: 0, damage: 26, burn: 0, knockback: 0 });
  const hs0 = G.hits.length;
  run(G, 1.2, { passive: true });
  const standTicks = G.hits.slice(hs0).filter((h) => h.attack === 'skyStrafe' && h.kind === 'fire').length;
  const front1 = G.hits.slice(hs0).filter((h) => h.attack === 'skyStrafe' && h.tell === TELL.RED).length;
  let rollTicks = 0, rollFrames = 0;
  for (let k = 0; k < 2; k++) {
    input.axis = { x: 0, y: k ? -1 : 1 };
    input.tap('Space');
    for (let i = 0; i < Math.round(0.6 / DT); i++) {
      const n0 = G.hits.length;
      G.tick(DT);
      if (p.state !== 'roll') continue;
      rollFrames++;
      rollTicks += G.hits.slice(n0).filter((h) => h.kind === 'fire').length;
    }
  }
  assert(rollFrames > 40, `the hero rolled through the burning strip (${rollFrames} rolling frames)`);
  out(`   strip: front blow ${front1}, ticks standing 1.2 s ${standTicks}, ticks landed during rolls ${rollTicks}`);
  assert(front1 === 1 && standTicks >= 3, 'the strip front hits once, then its fire ticks a hero standing in it');
  assert(rollTicks === 0, 'its fire never ticks a rolling hero');
  assert(H.get(strip) !== null, 'the strip still burns (lingers)');

  // ---- phase 3's eruptions variant: pillars chase the hero for ~3 s (each one rings, tells, flashes)
  settle(G);
  H.clear();
  d.phase = 3;
  G.tick(DT);
  front(14);
  p.debug.god = true;
  const ct = [], cf = [], ch0 = G.hits.length;
  let maxPillars = 0;
  G.watch = (n, dd) => {
    if (dd?.attack !== 'eruptions') return;
    if (n === 'combat:tell') ct.push(game.time);
    if (n === 'combat:flash') cf.push(game.time);
  };
  const rnd = Math.random;
  Math.random = () => 0.1; // (picks the chase: ER.chase.chance)
  game.lab.trigger('eruptions');
  Math.random = rnd;
  const isChase = d.brain.action?.chase === true;
  for (let i = 0; i < Math.round(6 / DT); i++) {
    input.axis = { x: i % 120 < 60 ? 1 : -1, y: 0 }; // the hero keeps moving (side to side)
    G.tick(DT);
    maxPillars = Math.max(maxPillars, H.count('pillar'));
  }
  G.watch = null;
  input.axis = { x: 0, y: 0 };
  // (2nd pass: from phase 2 the pillars leave burning pools whose contact ticks are 'eruptions' hits
  // too, tell normal: the cap and the live window are about the red blows)
  const chits = G.hits.slice(ch0).filter((h) => h.attack === 'eruptions' && h.tell === TELL.RED);
  // each blow must fall inside SOME pillar's live window: flash + lead .. + active (a moving hero may
  // walk into a pillar that is still erupting, after the next pillar's flash: pairing every blow
  // with the latest flash read that as early)
  const ER_ACT = TUNING.attacks.eruptions.active;
  let cworst = 0;
  for (const h of chits) {
    let best = Infinity;
    for (const f of cf) {
      const e = h.t - (f + lead);
      const out = e < 0 ? e : e > ER_ACT ? e - ER_ACT : 0; // distance outside the live window
      if (Math.abs(out) < Math.abs(best)) best = out;
    }
    if (Math.abs(best) > Math.abs(cworst)) cworst = best;
  }
  out(`   P3 eruption chase: ${isChase}, pillars alive at once ${maxPillars}, tells ${ct.length} flashes ${cf.length}, blows ${chits.length} (worst ${(cworst * 1000).toFixed(0)} ms outside a pillar's live window)`);
  assert(isChase && maxPillars >= 2 && ct.length >= 6 && ct.length === cf.length, 'phase 3: the eruptions chase the hero with announced pillars (one flash per tell)');
  assert(chits.length <= ER_MAX_CHASE_HITS && Math.abs(cworst) <= 2.5 * DT, 'the chase deals at most its hit cap, each blow inside a pillar live window (flash + lead .. + active)');
  d.phase = 1;
  run(G, 1, { passive: true });

  // ---- clear(): by hand, on a phase change, on death, on reset
  settle(G);
  H.clear();
  meteorAt(3);
  H.ring({ kind: 'ring', attack: 'flameRing', x: d.position.x, z: d.position.z, r0: 3, r1: 20, speed: 10, w: 2.2, delay: 2, damage: 1, announce: false });
  H.rain({ attack: 'meteorRain', count: 10, first: 1.3, span: 5, r: 3.4, damage: 1, group: H.group(3) });
  run(G, 0.2, { passive: true });
  const n0 = H.alive;
  H.clear();
  assert(n0 >= 3 && H.alive === 0 && H.count() === 0, `clear() empties the hazards (${n0} → ${H.alive})`);
  H.rain({ attack: 'meteorRain', count: 10, first: 0.5, span: 5, r: 3.4, damage: 1, group: H.group(3) });
  run(G, 1.0, { passive: true });
  const nr = H.alive;
  assert(d.debug.phase2() === true, 'phase 2 forced with hazards on the field');
  G.tick(DT);
  G.tick(DT);
  assert(nr >= 2 && H.alive === 0, `a phase change clears them (${nr} → ${H.alive})`);
  run(G, 6, { passive: true }, () => !d.brain.action && d.state === 'combat');
  H.rain({ attack: 'meteorRain', count: 10, first: 0.5, span: 5, r: 3.4, damage: 1, group: H.group(3) });
  run(G, 1.0, { passive: true });
  const nd = H.alive;
  assert(d.debug.kill() === true, 'kill with hazards on the field');
  G.tick(DT);
  G.tick(DT);
  assert(nd >= 2 && H.alive === 0, `death clears them (${nd} → ${H.alive})`);
  d.debug.reset();
  meteorAt(5);
  d.debug.reset();
  assert(H.alive === 0, 'reset clears them');

  // ---- killed in mid-air (hovering before the dive): it drops and dies cleanly, nothing left flying
  fightSetup(G);
  settle(G);
  front(14);
  game.lab.trigger('diveBomb');
  run(G, 4, { passive: true }, () => d.brain.action?.phase === 'hover');
  const alt0 = d.rig.s.alt, st0 = d.state;
  assert(d.debug.kill() === true, `killed while hovering (${st0}, alt ${alt0.toFixed(1)})`);
  let okFall = true;
  run(G, 2, { passive: true }, () => {
    if (![d.position.x, d.position.z, d.rig.s.alt, d.rig.pt.chest.y].every(Number.isFinite)) okFall = false;
    return false;
  });
  out(`   killed at alt ${alt0.toFixed(1)} (${st0}) → ${d.state}, alt ${d.rig.s.alt.toFixed(2)}`);
  assert(st0 === 'airborne' && alt0 > 10 && okFall && d.state === 'dying' && d.rig.s.alt < 0.2, 'a mid-air death drops the wyrm to the ground and plays the death');
  return G;
}

// ================================================================== scenario: the hero's rig
async function scenarioHero() {
  out('\n== scenario HERO (Shadow Swordsman rig: coat strips, streamers, hair stay finite and above the grass) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const p = game.player, r = p.rig, d = game.dragon;
  p.debug.god = true;
  const strips = r.coat.reduce((n, c) => n + c.strips.length, 0);
  // the coat (ADR-034): two back tails split by a vent, narrow side panels, two front panels
  const tails = r.coat.filter((C) => Math.abs(C.def.az) > 2.2);
  assert(r.coat.length === 6 && tails.length === 2 && strips === 12 && r.coat.every((C) => !C.def.flap),
    `coat: 6 panels (2 back tails split by a vent, 2 side, 2 front), ${strips} torn strips`);
  // the Shrouded set (ADR-043): the cloak's sheets ride the streamer springs (heavier than a ribbon:
  // lag < 1); under the hood none of the body's hair clusters is built (they poked through the cloth
  // or massed over the face); the hood builds its own gold strands, and the face is in its shadow
  // (Session 16); the five spring joints stay for the animator
  {
    const built = Object.entries(r.hair).filter(([, j]) => j.children.some((o) => o.isMesh)).map(([n]) => n);
    let strands = 0, skin = 0;
    r.head.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.slot === 'head' && (o.material === r.materials.hair || o.material === r.materials.hairTip)) strands++;
      if (o.material === r.materials.skin) skin++;
    });
    assert(r.streamers?.filter((S) => !S.weapon).length === 5 && r.streamers.every((S) => S.lag > 0 && S.lag < 1) && Object.keys(r.hair).length === 5 && built.length === 0 && strands >= 2 && skin === 0 && r.slots.head.length > 0,
      `the cloak: ${r.streamers?.length} sheets on springs; under the hood ${built.length} body hair clusters, ${strands} gold strand meshes of the hood's own, ${skin} skin meshes on the head (the face in shadow)`);
  }
  // clear of the wyrm (AI off): run, sprint, roll, light / backhand / slam, charge + cleave
  p.debug.teleport(d.position.x + 14, d.position.z + 14);
  const v = new THREE.Vector3();
  let bad = 0, low = Infinity, tipLow = Infinity, frames = 0;
  // the elbows (ADR-044): the smallest bend of each arm over everything below (rad; 0 = a straight
  // arm). The off hand is skipped while it is on the grip (two-handed: it reaches where the grip is)
  let bendR = Infinity, bendL = Infinity;
  const probe = () => {
    frames++;
    bendR = Math.min(bendR, -r.arms.R.fore.rotation.x);
    if (p.anim.cur[45] < 0.05) bendL = Math.min(bendL, -r.arms.L.fore.rotation.x);
    p.object3d.traverse((o) => { const e = o.matrixWorld.elements; for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) { bad++; break; } });
    for (const C of r.coat) for (const S of C.strips) { v.set(0, -S.len, 0).applyMatrix4(S.joint.matrixWorld); low = Math.min(low, v.y); }
    v.set(0, 0, HERO_DIM.steelTip).applyMatrix4(r.sword.matrixWorld);
    tipLow = Math.min(tipLow, v.y);
  };
  const go = (s) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) { G.tick(DT); probe(); } };
  input.axis = { x: 0, y: 1 };
  go(1.0);
  input.hold('ShiftLeft');
  go(1.0);
  input.release('ShiftLeft');
  input.axis = { x: 0, y: 0 };
  go(0.4);
  input.tap('Space');
  go(0.9);
  // the 5-hit chain (ADR-041): falling cut → rising cut → whirl → stab → slam, then round again
  const chain = [];
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  G.watch = (n, dd) => { if (n === 'player:attack') chain.push(p.atk?.def?.name ?? dd.kind); };
  for (let k = 0; k < 6; k++) { input.click(0); go(k === 4 ? 0.7 : CHAIN_EVERY); }
  go(1.0);
  assert(chain.join(' ') === 'fallingCut risingCut whirl stab slam fallingCut', `LMB ×6 walks the chain and wraps (${chain.join(' → ')})`);
  assert(Math.abs(wrapA(p.anim.cur[4])) < 1e-3, `the whirl ends on a whole turn (body yaw ${p.anim.cur[4].toFixed(3)})`);
  // LMB out of a sprint: the bounding slash keeps the run's momentum and its direction
  chain.length = 0;
  input.axis = { x: 0, y: 1 };
  input.hold('ShiftLeft');
  go(0.9);
  const sx = p.position.x, sz = p.position.z, syaw = p.yaw;
  input.click(0);
  input.release('ShiftLeft');
  input.axis = { x: 0, y: 0 };
  go(0.3);
  const sprintDist = Math.hypot(p.position.x - sx, p.position.z - sz);
  assert(chain[0] === 'sprintSlash' && sprintDist > 1.8 && sprintDist < 3.4 && Math.abs(wrapA(p.yaw - syaw)) < 0.05,
    `LMB while sprinting is the sprint slash (${chain[0]}; carried ${sprintDist.toFixed(2)} m along the run)`);
  input.click(0);
  go(0.5);
  assert(chain[1] === 'risingCut', `the sprint slash counts as hit 1: the next tap is the rising cut (${chain[1]})`);
  go(0.8);
  // LMB out of a forward roll: the low rising cut
  chain.length = 0;
  input.axis = { x: 0, y: 1 };
  go(0.3);
  input.tap('Space');
  go(0.35);
  input.axis = { x: 0, y: 0 };
  input.click(0);
  go(0.9);
  assert(chain[0] === 'rollCut', `LMB out of a roll is the roll cut (${chain[0]})`);
  // a backstep (Space with no direction) keeps the plain chain
  chain.length = 0;
  input.tap('Space');
  go(0.25);
  input.click(0);
  go(0.9);
  assert(chain[0] === 'fallingCut', `LMB out of a backstep starts the chain (${chain[0]})`);
  G.watch = null;
  go(0.6);
  input.press(2);
  go(1.4);
  input.up(2);
  go(1.0);
  assert(!bad, `rig matrices stay finite through every move (${frames} frames)`);
  assert(low > -0.02, `torn strip tips stay above the grass (lowest ${low.toFixed(3)} m)`);
  assert(tipLow > -0.06, `the steel point never sinks into the ground (lowest ${tipLow.toFixed(3)} m)`);
  // (≥ 15°: the hero's arms open to ~150-160° at a cut's contact and a thrust's end, anim.js HERO_SOFT;
  // under ARM_SOFT they never opened past 130° and the bound was 23°)
  assert(bendR > 0.26 && bendL > 0.26, `neither arm locks straight: the elbows keep at least ${(Math.min(bendR, bendL) * 57.3).toFixed(0)} deg of bend through the run, the roll and every attack (sword arm ${(bendR * 57.3).toFixed(0)}, off arm ${(bendL * 57.3).toFixed(0)})`);
  // glyph cells follow the view distance: the in-game size at the 36 m camera, finer in close-ups
  // (small parts capped, the blade's two columns fixed); a bad distance never yields NaN
  const coatU = r.materials.coat.uniforms.uCell.value;
  const kFar = setHeroGlyphScale(r.mats, 36);
  const farY = coatU.y;
  const kNear = setHeroGlyphScale(r.mats, 3);
  const nearY = coatU.y;
  assert(kFar === 1 && kNear < 0.5 && nearY < farY * 0.5 && r.materials.hair.uniforms.uCell.value.x <= 0.045 + 1e-9 && r.materials.blade.uniforms.uCell.value.x === 0.045,
    `glyph cells scale with the view distance (coat row ${farY.toFixed(3)} m at 36 m → ${nearY.toFixed(3)} m at 3 m)`);
  setHeroGlyphScale(r.mats, NaN);
  assert(r.mats.every((m) => Number.isFinite(m.uniforms.uCell.value.x + m.uniforms.uCell.value.y + m.uniforms.uGlyphZoom.value)), 'a bad view distance leaves every glyph cell finite');
  // equipment slots (ADR-042): the outfit and the weapon are gear items in slots; a loadout swap
  // rebuilds them under the same root and the animator carries on with whatever cloth there is
  {
    const { SLOTS, DEFAULT_LOADOUT, getItem } = await imp('src/entities/player/gear/index.js');
    const root = p.object3d, pos = p.position;
    const meshes = () => { let n = 0; root.traverse((o) => { if (o.isMesh) n++; }); return n; };
    const finite = () => { let ok = true; root.traverse((o) => { const e = o.matrixWorld.elements; for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) ok = false; }); return ok; };
    const n0 = meshes();
    assert(SLOTS.join() === 'head,chest,shoulders,arms,legs,waist,back,weapon' && SLOTS.every((sl) => DEFAULT_LOADOUT[sl] == null || getItem(DEFAULT_LOADOUT[sl])?.slot === sl) && SLOTS.every((sl) => p.loadout[sl] === (DEFAULT_LOADOUT[sl] ?? null)),
      `gear slots: ${SLOTS.join(', ')}; the default loadout fills ${SLOTS.filter((sl) => DEFAULT_LOADOUT[sl]).length} of them`);
    // the sword hand is a fist on the grip's own frame, owned by the arms slot (not by the weapon)
    const fist = p.rig.sword.children.filter((o) => o.isMesh && o.userData.slot === 'arms');
    assert(fist.length >= 1 && p.rig.slots.weapon.length > 0 && p.rig.slots.weapon.every((o) => o.userData.slot === 'weapon'), `the sword hand's fist hangs on the grip (${fist.length} arms-slot meshes on the sword joint)`);
    const drive = () => {
      input.axis = { x: 0, y: 1 };
      for (let i = 0; i < 30; i++) G.tick(DT);
      input.axis = { x: 0, y: 0 };
      input.click(0);
      for (let i = 0; i < 40; i++) G.tick(DT);
      input.tap('Space');
      for (let i = 0; i < 50; i++) G.tick(DT);
    };
    p.equip('back', null);
    p.equip('waist', null);
    drive();
    assert(p.rig.streamers.length === 0 && p.rig.coat.length === 0 && p.loadout.back === null && p.object3d === root && p.position === pos && meshes() < n0 && finite(),
      `cape and coat tails off: ${meshes()} meshes (was ${n0}), same root, the rig stays finite through a run, a swing and a roll`);
    p.setLoadout({});
    drive();
    assert(p.loadout.weapon === null && p.loadout.chest === 'base.chest' && p.rig.slots.weapon.length === 0 && finite(), `an empty loadout wears the undersuit and no weapon (${meshes()} meshes), and still animates`);
    let threw = false;
    try { p.equip('back', 'no.such.item'); } catch { threw = true; }
    assert(threw && p.loadout.back === null, 'an unknown item id throws and changes nothing');
    p.setLoadout(DEFAULT_LOADOUT);
    drive();
    assert(meshes() === n0 && p.rig.coat.length === 6 && p.rig.streamers.filter((S) => !S.weapon).length === 5 && p.sweep.sword === p.rig.sword && finite(), `back in the default set: ${meshes()} meshes, 6 coat panels, 5 cloak sheets`);
    // the outfit before ADR-043 is still a loadout: bare-headed (the hair is built again), the
    // pauldron, the half-cape
    const { WANDERER_LOADOUT } = await imp('src/entities/player/gear/index.js');
    p.setLoadout(WANDERER_LOADOUT);
    drive();
    const hair = Object.values(p.rig.hair).reduce((n, j) => n + j.children.filter((o) => o.isMesh).length, 0);
    assert(p.rig.streamers.filter((S) => !S.weapon).length === 4 && hair > 0 && p.rig.slots.shoulders.length > 0 && p.rig.slots.head.length === 0 && finite(),
      `the Wanderer's set still builds: 4 cape sheets, ${hair} hair meshes, the pauldron, no hood`);
    p.setLoadout(DEFAULT_LOADOUT);
    drive();
    assert(meshes() === n0 && finite(), `and back to the Shrouded set (${meshes()} meshes)`);
    // the sword looks (gear/moonblade.js; the owner's pick behind ?sword= and the Lab): each is built
    // to the drawn point from its profile (no arrowhead: the point's width never grows), its pommel
    // ends where the longsword's does, its blade keeps aGUV = (x, z) (its glyph columns), the rig
    // stays finite through the drive; only the ribbon has a streamer of its own
    {
      const { hwAt } = await imp('src/entities/player/fx.js');
      const bad = [], rows = [];
      for (const id of ['moon.sheet', 'moon.ribbon', 'moon.crescent']) {
        p.setLoadout({ ...DEFAULT_LOADOUT, weapon: id });
        const R = p.rig, M = R.materials;
        let tipZ = -Infinity, pommelZ = Infinity, wide = 0, guv = 0;
        const bins = new Map();
        for (const o of R.slots.weapon) o.traverse((m) => {
          if (!m.isMesh) return;
          const P = m.geometry.attributes.position, U = m.geometry.attributes.aGUV;
          if (m.parent === R.sword) for (let i = 0; i < P.count; i++) pommelZ = Math.min(pommelZ, P.getZ(i));
          if (m.material !== M.blade && m.material !== M.bladeTip) return;
          for (let i = 0; i < P.count; i++) {
            const x = P.getX(i), z = P.getZ(i);
            tipZ = Math.max(tipZ, z);
            const b = Math.floor(z / 0.02);
            bins.set(b, Math.max(bins.get(b) ?? 0, Math.abs(x)));
            if (z > 0.32 && Math.abs(x) > 0.05) wide++;
            if (!(Math.abs(U.getX(i) - x) < 1e-6 && Math.abs(U.getY(i) - z) < 1e-6)) guv++;
          }
        });
        const band = (z0, z1) => Math.max(0, ...[...bins].filter(([b]) => b * 0.02 + 0.01 >= z0 && b * 0.02 + 0.01 <= z1).map(([, w]) => w));
        const point = band(0.75, 0.93), shoulder = band(0.7, 0.75);
        const own = R.streamers.filter((S) => S.weapon).length;
        drive();
        rows.push(`${id} point ${point.toFixed(3)} / ${shoulder.toFixed(3)}, pommel ${pommelZ.toFixed(3)}, ${own} streamer`);
        if (Math.abs(tipZ - HERO_DIM.drawnTip) > 0.005) bad.push(`${id}: its steel ends at ${tipZ.toFixed(3)}`);
        if (!(pommelZ >= -0.215 && pommelZ <= -0.18)) bad.push(`${id}: its pommel ends at ${pommelZ.toFixed(3)}`);
        if (!(point <= shoulder + 0.002) || wide) bad.push(`${id}: an arrowhead (${point.toFixed(3)} past ${shoulder.toFixed(3)}; ${wide} vertices wider than 0.05)`);
        if (guv) bad.push(`${id}: ${guv} blade vertices off aGUV = (x, z)`);
        if (own !== (id === 'moon.ribbon' ? 1 : 0)) bad.push(`${id}: ${own} weapon streamers`);
        if (!finite()) bad.push(`${id}: the rig went non-finite`);
        if (!(hwAt(0.5) > 0)) bad.push('hwAt');
      }
      out(`   sword looks: ${rows.join(' · ')}`);
      assert(!bad.length, `the sword looks build to the drawn point with no arrowhead, the pommel where it was, the blade's aGUV, the ribbon's own streamer, and animate (${bad.join('; ') || 'all'})`);
      // the ribbon: never under the grass (a run, a sprint, a roll, the chain, the cleave; the landing
      // of a knockdown within 10 cm (the hero's longer reach, anim.js HERO_SOFT, carries the hilt ~1 cm lower there): the cloak's own sheets go 16 cm under there, the springs lag the
      // fall); it swings out through a cut and hangs again at rest. Its angle is measured on the
      // upright body (unleaned): drawn, the whole figure leans ~29° toward the camera
      p.setLoadout({ ...DEFAULT_LOADOUT, weapon: 'moon.ribbon' });
      p.debug.teleport(d.position.x + 14, d.position.z + 14);
      const S = p.rig.streamers.find((s) => s.weapon), w0 = new THREE.Vector3(), w1 = new THREE.Vector3();
      let lowest = Infinity, lowestDown = Infinity, swing = 0;
      const sample = () => {
        S.segs[1].getWorldPosition(w0);
        w1.set(0, -S.len[1], 0).applyMatrix4(S.segs[1].matrixWorld);
        if (p.state === 'knockdown') lowestDown = Math.min(lowestDown, w1.y);
        else lowest = Math.min(lowest, w1.y);
        p.unlean(w0);
        p.unlean(w1);
        const dx = w1.x - w0.x, dy = w1.y - w0.y, dz = w1.z - w0.z, l = Math.hypot(dx, dy, dz) || 1;
        return Math.acos(Math.max(-1, Math.min(1, -dy / l))) * 57.3; // degrees from hanging
      };
      const run = (s, f) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) { G.tick(DT); const a = sample(); f?.(a); } };
      input.axis = { x: 0, y: 1 };
      run(0.8);
      input.hold('ShiftLeft');
      run(0.8);
      input.release('ShiftLeft');
      input.tap('Space');
      run(0.7);
      input.axis = { x: 0, y: 0 };
      run(0.6);
      p.anim.forceVariant = 0;
      input.click(0);
      run(0.6, (a) => { const at = p.atk; if (at?.def?.name === 'fallingCut' && at.t >= at.def.windup && at.t <= at.def.windup + at.def.active) swing = Math.max(swing, a); });
      p.anim.forceVariant = null;
      for (let k = 1; k < 5; k++) { input.click(0); run(k === 4 ? 0.9 : CHAIN_EVERY); }
      input.press(2);
      run(1.4);
      input.up(2);
      run(1.0);
      p.debug.god = false;
      p.hp = p.maxHp;
      p.takeHit({ damage: 10, tell: TELL.NORMAL, attack: 'test', from: { x: p.position.x + Math.sin(p.yaw) * 3, z: p.position.z + Math.cos(p.yaw) * 3 }, knockback: 2, knockdown: true });
      run(2.0);
      p.debug.god = true;
      p.hp = p.maxHp;
      let rest = 0;
      run(1.5, (a) => { rest = a; });
      out(`   the ribbon: lowest ${lowest.toFixed(3)} m (${lowestDown.toFixed(3)} m landing in a knockdown), ${swing.toFixed(0)}° from hanging through a falling cut, ${rest.toFixed(0)}° 1.5 s into idle`);
      // (ADR-114: 10 cm, was 5. Knocked down out of the fencer's guard the hilt falls from 0.25 m
      // higher than it did out of the old low stance, and the ribbon's springs lag that much more)
      assert(lowest >= 0 && lowestDown >= -0.1, `the ribbon never sinks into the grass through a run, a sprint, a roll, the chain and the cleave (lowest ${lowest.toFixed(3)} m), nor more than 10 cm landing in a knockdown (${lowestDown.toFixed(3)} m)`);
      assert(swing >= 35 && rest <= 25, `the ribbon swings out through a cut (${swing.toFixed(0)}° ≥ 35°) and hangs again at rest (${rest.toFixed(0)}° ≤ 25°)`);
      p.setLoadout(DEFAULT_LOADOUT);
      drive();
      assert(meshes() === n0 && finite() && p.rig.streamers.every((s) => !s.weapon), `back to the longsword (${meshes()} meshes)`);
    }
  }
  return G;
}

// Is the drawn blade (0.35 … 1.1 m along it) within 2 cm of a streamer's sheet? Each sheet hangs −Y
// from its segment, `w` wide, curved round a radius `wrap` (+ 0.25 × the depth) at its root; records
// without `w` or `wrap` are skipped. m, v: scratch (Matrix4, Vector3). HEROLIFE (3) and LOOKS (6)
function sheetHit(r, m, v) {
  let any = false;
  for (const S of r.streamers) {
    if (!S.w || S.wrap == null) continue;
    for (let k = 0; k < 2; k++) {
      m.copy(S.segs[k].matrixWorld).invert();
      const L = S.len[k], R0 = k ? S.wrap + 0.25 * S.len[0] : S.wrap;
      for (let i = 0; i <= 8; i++) {
        v.set(0, 0, 0.35 + (0.75 * i) / 8).applyMatrix4(r.sword.matrixWorld).applyMatrix4(m);
        const t = -v.y / L;
        if (t < 0 || t > 1) continue;
        const wd = S.w[k] + (S.w[k + 1] - S.w[k]) * t, R2 = R0 + 0.25 * t * L;
        if (Math.abs(v.x) > wd / 2) continue;
        if (Math.abs(v.z - (Math.cos(v.x / R2) - 1) * R2) < 0.02) any = true;
      }
    }
  }
  return any;
}

// ================================================================== scenario: two hands, the guard, the cloak, idle life
async function scenarioHeroLife() {
  out('\n== scenario HEROLIFE (one hand through the chain, two on the heavy blows, the cross ward, the cloak vs the charged blade, idle actions) ==');
  const { DIM: HD } = await imp('src/entities/player/model.js');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const p = game.player, d = game.dragon, r = p.rig, A = p.anim;
  p.debug.god = true;
  p.debug.teleport(d.position.x + 14, d.position.z + 14);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Vector3();
  const finite = () => { let ok = true; p.object3d.traverse((o) => { const e = o.matrixWorld.elements; for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) ok = false; }); return ok; };
  // the off hand's wrist and its place on the grip (model metres)
  const offGap = () => {
    v.set(0, -HD.foreArm, 0).applyMatrix4(r.arms.L.fore.matrixWorld);
    w.set(0, 0, -HD.offGrip).applyMatrix4(r.sword.matrixWorld);
    return v.distanceTo(w) / p.drawScale; // the player is drawn at PLAYER_SCALE (ADR-064)
  };
  const go = (s, each) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) { G.tick(DT); each?.(); } };
  go(0.5);

  // (1) the chain is one-handed (Session 25, owner: "wuxia flow"): through each light hit's active
  // frames the free hand is off the grip and open, and the sword arm OPENS through the cut (the old
  // two-handed swings kept both fists at the chest while only the blade turned); the heavy blows (the
  // slam, the charged cleave) are two-handed, the off hand within 3.5 cm of its place and closed.
  // Every look of every hit (combat.js `variants`) is swung.
  {
    const { LIGHT } = await imp('src/entities/player/combat.js');
    const seen = {};
    // the arms' steadiness: how far an upper arm or a forearm turns in one frame, in the body's own
    // frame, through a whole light swing (the elbows used to flip 50-135° in a frame); and which
    // foot leads as each hit of a chain ends
    // (segment 4: the free HAND, its wrist → the sword fingers' tip, rig.arms.L.point)
    const inv = new THREE.Matrix4(), aNow = [0, 1, 2, 3, 4].map(() => new THREE.Vector3()), aWas = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());
    const e0 = new THREE.Vector3(), e1 = new THREE.Vector3();
    const snap = {}, snapAt = {}, snapH = {}, snapHAt = {}, leads = [];
    let armKey = null, leadDef = null;
    const arms = () => {
      const a = p.atk, def = a?.def;
      // (from a swing's second frame: its first is where its clip takes over from the last pose. Until
      // ADR-115 a light pressed on that frame was still 'pending' there and never measured; the same
      // frames are measured now. That first frame of the rising backhand turns the free hand ~64°:
      // a follow-up, ROADMAP M1.40)
      const key = def && p.state === 'attack' && def.kind === 'light' && !a.pending && a.t > 1e-6 ? `${def.name}#${A.atkVar}` : null;
      inv.copy(r.body.matrixWorld).invert();
      [r.arms.R, r.arms.L].forEach((arm, k) => {
        e0.setFromMatrixPosition(arm.upper.matrixWorld).applyMatrix4(inv);
        e1.setFromMatrixPosition(arm.fore.matrixWorld).applyMatrix4(inv);
        aNow[k * 2].subVectors(e1, e0).normalize();
        e0.set(0, -HD.foreArm, 0).applyMatrix4(arm.fore.matrixWorld).applyMatrix4(inv);
        aNow[k * 2 + 1].subVectors(e0, e1).normalize();
      });
      e0.setFromMatrixPosition(r.arms.L.wrist.matrixWorld).applyMatrix4(inv);
      e1.setFromMatrixPosition(r.arms.L.point.matrixWorld).applyMatrix4(inv);
      aNow[4].subVectors(e1, e0).normalize();
      if (key && key === armKey) {
        for (let k = 0; k < 4; k++) {
          const turn = Math.acos(Math.min(1, Math.max(-1, aNow[k].dot(aWas[k])))) * 57.3;
          if (turn > (snap[key] ?? 0)) {
            snap[key] = turn;
            snapAt[key] = `${a.t < def.windup ? 'W' : a.t < def.windup + def.active ? 'A' : 'R'} ${a.t.toFixed(2)} ${['R upper', 'R fore', 'L upper', 'L fore'][k]}`;
          }
        }
        const turnH = Math.acos(Math.min(1, Math.max(-1, aNow[4].dot(aWas[4])))) * 57.3;
        if (turnH > (snapH[key] ?? 0)) {
          snapH[key] = turnH;
          snapHAt[key] = `${a.t < def.windup ? 'W' : a.t < def.windup + def.active ? 'A' : 'R'} ${a.t.toFixed(2)} L hand`;
        }
      }
      for (let k = 0; k < 5; k++) aWas[k].copy(aNow[k]);
      armKey = key;
      // the lead foot, read once as the hit's active frames end (P.rF / P.lF z: 33 / 36)
      if (def && p.state === 'attack' && def !== leadDef && a.t >= def.windup + def.active) {
        leadDef = def;
        leads.push({ combo: def.combo, left: A.cur[36] > A.cur[33] });
      }
      if (!def) leadDef = null;
    };
    const probe = () => {
      arms();
      const a = p.atk, def = a?.def;
      if ((p.state !== 'attack' && p.state !== 'heavy') || !def) return;
      if (a.t < def.windup || a.t > def.windup + def.active) return;
      const key = def.kind === 'light' ? `${def.name}#${A.atkVar}` : def.name;
      const S = seen[key] ?? (seen[key] = { n: 0, light: def.kind === 'light', twoMin: 1, twoMax: 0, gap: 0, gapMin: Infinity, closed: true, free: true, sfN: 0, reach: 0 });
      S.n++;
      S.twoMin = Math.min(S.twoMin, A.cur[45]);
      S.twoMax = Math.max(S.twoMax, A.cur[45]);
      const g = offGap();
      S.gap = Math.max(S.gap, g);
      S.gapMin = Math.min(S.gapMin, g);
      S.closed &&= !!r.offHand && r.offHand.grip.visible && !r.offHand.open.visible;
      S.free &&= !!r.offHand && !r.offHand.grip.visible && (r.offHand.open.visible || !!r.offHand.fingers?.visible);
      if (r.offHand?.fingers?.visible) S.sfN++;
      S.reach = Math.max(S.reach, Math.hypot(A.cur[13], A.cur[14], A.cur[15])); // P.rH: the sword hand from its shoulder
    };
    const looks = Math.max(...LIGHT.map((L) => 1 + (L.variants?.length ?? 0)));
    for (let look = 0; look < looks; look++) {
      A.forceVariant = look;
      for (let k = 0; k < 5; k++) { input.click(0); go(k === 4 ? 0.7 : CHAIN_EVERY, probe); }
      go(1.0);
    }
    A.forceVariant = null;
    input.axis = { x: 0, y: 1 };
    input.hold('ShiftLeft');
    go(0.9);
    input.click(0);
    input.release('ShiftLeft');
    input.axis = { x: 0, y: 0 };
    go(0.9, probe);
    input.axis = { x: 0, y: 1 };
    go(0.3);
    input.tap('Space');
    go(0.35);
    input.axis = { x: 0, y: 0 };
    input.click(0);
    go(0.9, probe);
    // the charged cleave: both hands through the dash and the cut (its last frames let the off hand go)
    input.press(2);
    go(1.4);
    input.up(2);
    go(0.9, () => { const a = p.atk; if (a?.def?.kind === 'cleave' && a.t <= a.def.windup + a.def.active * 0.9) probe(); });
    const names = Object.keys(seen), lights = names.filter((n) => seen[n].light), heavies = names.filter((n) => !seen[n].light);
    out(`   one hand: ${lights.map((n) => `${n} reach ${seen[n].reach.toFixed(2)} off ${(seen[n].gapMin * 100).toFixed(0)} cm`).join(' · ')}`);
    out(`   two hands: ${heavies.map((n) => `${n} two ${seen[n].twoMin.toFixed(2)} gap ${(seen[n].gap * 100).toFixed(1)} cm`).join(' · ')}`);
    const want = [...LIGHT.filter((L) => L.kind === 'light').flatMap((L) => [L.anim, ...(L.variants ?? [])].map((_, i) => `${L.name}#${i}`)), 'sprintSlash#0', 'rollCut#0'];
    assert(want.every((n) => seen[n]?.n > 0), `every look of every light swing was probed in its active frames (${lights.length} looks; missing ${want.filter((n) => !seen[n]).join(', ') || 'none'})`);
    // (the free hand holds sword fingers through the chain, anim.js hs; the backhands gather on the
    // sword WRIST, ≥ 8 cm from the grip)
    const oneHand = (n) => seen[n].twoMax < 0.05 && seen[n].free && seen[n].gapMin > 0.08 && seen[n].sfN >= 0.95 * seen[n].n;
    out(`   sword fingers: ${lights.map((n) => `${n} ${((seen[n].sfN / seen[n].n) * 100).toFixed(0)} %`).join(' · ')}`);
    assert(lights.every(oneHand),
      `the chain is one-handed: the free hand off the grip (≥ 8 cm: the backhands gather on the sword wrist), holding sword fingers (≥ 95 % of active frames) through every light swing (${lights.filter((n) => !oneHand(n)).join(', ') || 'all'})`);
    assert(lights.every((n) => seen[n].reach > 0.4),
      `the sword arm opens through every cut: the hand ≥ 0.40 m from its shoulder at some active frame (shortest ${Math.min(...lights.map((n) => seen[n].reach)).toFixed(2)} m)`);
    assert(seen.slam?.n > 0 && seen.cleave?.n > 0 && heavies.every((n) => seen[n].twoMin > 0.95 && seen[n].gap < 0.035 && seen[n].closed),
      `the heavy blows are two-handed: the slam and the cleave with twoHand > 0.95, the off hand within 3.5 cm of its place and closed round the grip (${heavies.join(', ')})`);
    {
      const worst = Object.entries(snap).sort((x, y) => y[1] - x[1])[0];
      out(`   arms: ${Object.entries(snap).map(([n, v]) => `${n} ${v.toFixed(0)}° (${snapAt[n]})`).join(' · ')}`);
      // (a cut is 0.12 s, seven frames: the upper arm's throw into it is up to ~55° a frame. The flips
      // the elbow limiter stops were 50-135° a frame on swings half as fast)
      assert(Object.keys(snap).length >= 13 && worst[1] < 60, `no arm snaps: an upper arm or forearm turns at most ${worst[1].toFixed(0)}° in a frame (${worst[0]}; < 60°) through every light swing`);
      const worstH = Object.entries(snapH).sort((x, y) => y[1] - x[1])[0] ?? ['none', 0];
      out(`   free hand: ${Object.entries(snapH).map(([n, v]) => `${n} ${v.toFixed(0)}° (${snapHAt[n]})`).join(' · ')}`);
      assert(Object.keys(snapH).length >= 13 && worstH[1] < 60, `the free hand turns at most ${worstH[1].toFixed(0)}° in a frame (${worstH[0]}; < 60°) through every light swing`);
      // he walks through the chain: the lead foot changes from each hit to the next (hits 1-5)
      let pairs = 0, same = 0;
      for (let i = 1; i < leads.length; i++) {
        if (leads[i].combo !== leads[i - 1].combo + 1) continue;
        pairs++;
        if (leads[i].left === leads[i - 1].left) same++;
      }
      out(`   lead foot: ${leads.slice(0, 10).map((l) => `${l.combo}${l.left ? 'L' : 'R'}`).join(' ')} … ${same} of ${pairs} consecutive hits on the same lead foot`);
      assert(pairs >= 12 && same === 0, `he walks through the chain: the lead foot changes with every hit (${same} of ${pairs} consecutive hits kept it)`);
    }
    go(1.2);
    assert(!r.offHand.grip.visible && r.offHand.open.visible && !r.offHand.fingers?.visible && A.cur[45] < 0.05 && A.cur[59] < 0.1, 'at rest the free hand lies open on the belt (ADR-114: it held sword fingers by the hip)');
  }

  // (1b) no two swings in a row along the same line (swings.js `line`, anim.js _pickVariant): 40
  // mashed chains with the animator's own picks; every look of every hit comes up
  {
    const { LIGHT } = await imp('src/entities/player/combat.js');
    const { SWINGS } = await imp('src/entities/player/swings.js');
    const lineOf = (an) => (an?.kind === 'clip' ? SWINGS[an.clip]?.line ?? null : null);
    const picked = new Set();
    let pairs = 0, same = 0, last = null, lastDef = null;
    const watch = () => {
      const a = p.atk, def = a?.def;
      if (p.state !== 'attack' || !def || def === lastDef) return;
      lastDef = def;
      const line = lineOf(A.atkAnim);
      picked.add(`${def.name}#${A.atkVar}`);
      if (def.combo > 1 && last && line) {
        pairs++;
        if (line === last) same++;
      }
      last = line;
    };
    for (let c = 0; c < 40; c++) {
      for (let k = 0; k < 5; k++) { input.click(0); go(k === 4 ? 0.7 : CHAIN_EVERY, watch); }
      go(0.9, watch);
      lastDef = null;
    }
    const all = LIGHT.flatMap((L) => [L.anim, ...(L.variants ?? [])].map((_, i) => `${L.name}#${i}`));
    out(`   lines: ${pairs} consecutive pairs, ${same} on the same line; looks seen ${picked.size} of ${all.length}`);
    assert(pairs >= 100 && same === 0, `a swing never follows another along the same line (${same} of ${pairs} pairs in 40 chains)`);
    assert(all.every((n) => picked.has(n)), `every look of every hit comes up in 40 chains (missing ${all.filter((n) => !picked.has(n)).join(', ') || 'none'})`);
  }

  // (1d) the cuts are diagonals, never straight up and down (Session 25, owner: "not so perfectly top
  // to bottom"): in every cut's keys the blade stays under 50° of elevation through the active
  // frames and crosses his front within 20° of level; and the blade hangs back at mid-cut (the whip)
  {
    const { SWINGS } = await imp('src/entities/player/swings.js');
    const bad = [], whip = [];
    for (const [name, C] of Object.entries(SWINGS)) {
      if (C.line === 'point') continue; // a thrust has no plane
      const ks = C.keys.filter((k) => Array.isArray(k.a) && k.u > 1.001 && k.u <= 2.001);
      const steep = Math.max(...ks.map((k) => Math.abs(k.a[1])));
      // the key where the blade is nearest to pointing ahead: its elevation is the cut's height there
      const front = ks.reduce((b, k) => (Math.abs(k.a[0]) < Math.abs(b.a[0]) ? k : b));
      // (a whirl's blade never points ahead in his own frame: the turn of his body carries it round)
      const crosses = Math.abs(front.a[0]) <= 45;
      if (!(steep <= 50) || (crosses && !(Math.abs(front.a[1]) <= 20))) bad.push(`${name} (steepest ${steep}°, ${front.a[1]}° as it crosses his front)`);
      const mid = C.keys.find((k) => Array.isArray(k.a) && Math.abs(k.u - 1.5) < 0.06);
      if (mid && !C.keys.some((k) => k.two === 1) && name !== 'whirl' && name !== 'risingWhirl') whip.push([name, Math.abs(mid.a[0])]);
    }
    out(`   planes: ${Object.keys(SWINGS).length} clips, upright ones: ${bad.join('; ') || 'none'}; blade behind the hand at mid-cut: ${whip.map(([n, v]) => `${n} ${v}°`).join(' · ')}`);
    assert(!bad.length, `every cut is a diagonal: the blade under 50° of elevation in the active frames and within 20° of level as it crosses his front (${bad.join('; ') || 'all'})`);
    assert(whip.length >= 8 && whip.every(([, v]) => v >= 20 && v <= 45), `the blade whips: at mid-cut it still hangs 20°-45° short of pointing ahead (${whip.filter(([, v]) => !(v >= 20 && v <= 45)).map(([n, v]) => `${n} ${v}°`).join(', ') || 'all'})`);
  }

  // (1e0) cosmetic noise never touches the AI's stream: the sword FX (and the particle pools' glyph
  // pick and flicker phase) draw from their own LCGs, so a swing cannot shift a seeded sim
  {
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const rand0 = Math.random;
    let draws = 0;
    Math.random = () => { draws++; return rand0(); };
    try {
      p.fx.trail(V3(0, 1, 0), V3(1.9, 1, 0), V3(0, 1, 0), V3(1.75, 1, 0.74), 'light', false);
      p.fx.arcGlint(0, 1, 0, 1, 0, 0);
      p.fx.thrustStreak(V3(0, 1, 0), V3(2, 1, 0));
      p.fx.bladeHalo(0.2, 1, 1);
    } finally {
      Math.random = rand0;
    }
    assert(draws === 0, `the hero's sword FX never touch the AI's random stream (${draws} Math.random draws)`);
  }

  // (1e) the sword arc (fx.js trail, ADR-077): fine strokes that hug the steel, a faint veil close
  // inside the edge; no letter glyphs; a blade only carried along (the cleave's dash) leaves nothing.
  // And the thrusts rise (a level one, seen from the game camera, looked planted in the ground)
  {
    const { ARC_LOOK, ARC_TONE } = await imp('src/entities/player/fx.js');
    const { SWINGS } = await imp('src/entities/player/swings.js');
    const fxa = p.fx.add, spawn0 = fxa.spawn, made = [];
    fxa.spawn = (o) => { made.push(o); };
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    try {
      // a quarter turn of the 1.9 m hit segment about a still hilt
      p.fx.trail(V3(0, 1, 0), V3(1.9, 1, 0), V3(0, 1, 0), V3(1.75, 1, 0.74), 'light', false);
      const turned = made.splice(0);
      // the same blade moved 0.4 m sideways without turning
      p.fx.trail(V3(0, 1, 0), V3(1.9, 1, 0), V3(0, 1, 0.4), V3(1.9, 1, 0.4), 'cleave', false);
      const carried = made.splice(0);
      const strokes = turned.filter((o) => o.glyph === '|');
      const far = Math.max(...turned.map((o) => Math.hypot(o.x, o.y - 1, o.z)));
      const size = Math.max(...strokes.map((o) => o.size)), faint = Math.min(...strokes.map((o) => o.alpha)), bright = Math.max(...strokes.map((o) => o.alpha));
      out(`   arc: ${strokes.length} strokes (≤ ${size.toFixed(2)} m, out to ${far.toFixed(2)} m, opacity ${faint.toFixed(2)}-${bright.toFixed(2)}), ${turned.length - strokes.length} motes; a carried blade ${carried.length}`);
      assert(strokes.length >= 10 && !turned.some((o) => /[A-Za-z0-9+]/.test(o.glyph)), 'the sword arc is drawn in strokes, with no letters');
      assert(size <= 0.14 && far <= 1.9 * ARC_LOOK.at + 0.08 && far <= 1.3, `the arc is fine and hugs the steel: strokes at most 0.14 m, none further than 1.3 m from the hilt (the reach ends at 1.9 m; furthest ${far.toFixed(2)} m)`);
      assert(ARC_LOOK.veil.length >= 3 && faint < 0.2 && bright > 0.8, 'a bright edge with a faint veil inside it');
      assert(carried.length === 0, 'a blade carried along without turning leaves no arc');
      // the tones (ARC_TONE): the lights' edge as it was, the heavy blows cooling to violet; the bite
      const edge = (list) => list.filter((o) => o.glyph === '|' && o.color !== ARC_TONE.light.veil && o.color !== ARC_TONE.heavy.veil);
      p.fx.trail(V3(0, 1, 0), V3(1.9, 1, 0), V3(0, 1, 0), V3(1.75, 1, 0.74), 'slam', false);
      const slam = made.splice(0);
      p.fx.trail(V3(0, 1, 0), V3(1.9, 1, 0), V3(0, 1, 0), V3(1.75, 1, 0.74), 'light', false, true, true);
      const bite = made.splice(0);
      const le = edge(turned), se = edge(slam), be = bite.filter((o) => o.glyph === '|');
      const same = (c, ref) => Array.isArray(c) && c.length === 3 && c.every((v, i) => v === ref[i]);
      assert(le.length > 0 && le.every((o) => o.color === ARC_TONE.light.core && same(o.colorEnd, [0.14, 0.1, 0.8])), `a light's arc is as it was: white-hot edge cooling to indigo (${le.length} strokes)`);
      assert(se.length > 0 && se.every((o) => same(o.colorEnd, ARC_TONE.heavy.end)), `the slam's arc cools to the gem's violet (${se.length} strokes)`);
      assert(be.length > 0 && Math.max(...be.map((o) => o.size)) <= 0.14 && !bite.some((o) => /[A-Za-z0-9+]/.test(o.glyph)), `the bite: a slightly thicker white edge, still at most 0.14 m, no letters (${Math.max(...be.map((o) => o.size)).toFixed(3)} m)`);
    } finally {
      fxa.spawn = spawn0;
    }
    const thrusts = Object.entries(SWINGS).filter(([, C]) => C.line === 'point').map(([n, C]) => [n, Math.max(...C.keys.filter((k) => k.u > 1.5 && k.u <= 2.001).map((k) => k.a[1]))]);
    assert(thrusts.length >= 2 && thrusts.every(([, el]) => el >= 30), `the thrusts drive upward: the point ≥ 30° above level at full reach (${thrusts.map(([n, el]) => `${n} ${el}°`).join(', ')})`);
  }

  // (1e1) a cut that lands (combat/cutFx.js, fx.contact): a tapered line across the body along the
  // cut, thin sparks thrown along it, one small two-frame core, budgets per tier, the LOW preset, the
  // degenerate inputs, its own random stream, the 'fan' look
  {
    const { CUT_LOOK, CUT_LAST, setCutStyle } = await imp('src/combat/cutFx.js');
    const { axes, screenAngle } = await imp('src/combat/clashFx.js');
    const fxa = p.fx.add, spawn0 = fxa.spawn, made = [], lights = [];
    const lp = game.lights, ladd0 = lp.add;
    const q0 = game.settings.quality, rand0 = Math.random;
    let draws = 0;
    fxa.spawn = (o) => { made.push(o); };
    lp.add = (o) => { lights.push(o); return null; };
    Math.random = () => { draws++; return rand0(); };
    const F = { x: 0, y: 1.2, z: 0 };
    const C = { x: 0, y: 1.2, z: 0, f: 0.3, cx: 1, cy: -0.3, cz: 0, gx: 1, gz: 0, ex: 0.2, ey: 0.1, ez: 1 };
    const AX = axes(game);
    const scr = (o) => { const dx = o.x - F.x, dy = o.y - F.y, dz = o.z - F.z; return [dx * AX.rx + dy * AX.ry + dz * AX.rz, dx * AX.ux + dy * AX.uy + dz * AX.uz]; };
    const angOf = (o) => Math.atan2(o.vx * AX.ux + o.vy * AX.uy + o.vz * AX.uz, o.vx * AX.rx + o.vy * AX.ry + o.vz * AX.rz);
    const adiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
    const NUM = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size', 'sizeEnd', 'rot', 'stretch', 'alpha', 'alphaEnd', 'gravity', 'drag'];
    const finiteSpawn = (o) => NUM.every((k) => o[k] === undefined || Number.isFinite(o[k]));
    const shot = (tier, crit, k = 0, c = C) => {
      made.length = 0;
      lights.length = 0;
      const n = p.fx.contact(F, tier, c, crit, k);
      return { n, made: made.slice(), lights: lights.slice(), last: { ...CUT_LAST } };
    };
    const BUDGET = { light: 20, sweep: 24, point: 24, slam: 62, cleave: 72, execute: 66 };
    const bad = [], rows = [];
    try {
      game.settings.quality = 2;
      setCutStyle('gash');
      for (const [tier, k] of [['light', 0], ['sweep', 0], ['point', 0], ['slam', 0], ['cleave', 0], ['cleave', 1], ['execute', 0]]) {
        for (const crit of [false, true]) {
          const T = CUT_LOOK.tier[tier], r = shot(tier, crit, k), L = r.last, m = r.made, tag = `${tier}${k ? ' k1' : ''}${crit ? ' crit' : ''}`;
          const len = T.len + (T.lenK ?? 0) * k;
          const ca0 = screenAngle(AX, C.cx, C.cy, C.cz), ea = screenAngle(AX, C.ex, C.ey, C.ez);
          const ca = tier === 'point' || tier === 'execute' ? ea : ca0;
          if (m.some((o) => typeof o.glyph !== 'string' || o.glyph.length !== 1 || !"|*·'`.-".includes(o.glyph) || /[A-Za-z0-9+]/.test(o.glyph))) bad.push(`${tag}: a glyph outside |*·'\`.-`);
          const stars = m.filter((o) => o.glyph === '*');
          if (stars.length !== 1 || !(stars[0].size <= 0.3 && stars[0].life <= 0.05)) bad.push(`${tag}: ${stars.length} cores (size ${stars[0]?.size}, life ${stars[0]?.life})`);
          const second = T.lines > 1 ? Math.max(2, T.n - CUT_LOOK.line2.less) : 0;
          const first = L.slash - second;
          if (first < T.n - 2) bad.push(`${tag}: ${first} strokes in the line (≥ ${T.n - 2})`);
          const slash = m.slice(0, L.slash);
          slash.forEach((o, i) => {
            const [sx, sy] = scr(o);
            const along = sx * Math.cos(ca) + sy * Math.sin(ca), across = -sx * Math.sin(ca) + sy * Math.cos(ca);
            const two = i >= first;
            if (Math.abs(across) > (two ? 0.14 : 0.06)) bad.push(`${tag}: stroke ${i} ${across.toFixed(3)} m off the line`);
            const dr = ((((o.rot - (ca - Math.PI / 2)) % Math.PI) + Math.PI) % Math.PI);
            if (Math.min(dr, Math.PI - dr) > 0.05) bad.push(`${tag}: stroke ${i} turned ${dr.toFixed(2)} rad off the line`);
            if (along > len * T.ahead + 0.12 || -along > len * (1 - T.ahead) + 0.12) bad.push(`${tag}: stroke ${i} ${along.toFixed(2)} m along the line (len ${len})`);
          });
          // the tick (heavy blows, a crit) crosses the line: along the blade, square across a puncture's
          const tickWant = Math.max(T.tick, crit ? CUT_LOOK.crit.tick : 0) > 0;
          const ticks = m.slice(L.slash, L.slash + L.tick);
          if (tickWant !== ticks.length > 0) bad.push(`${tag}: ${ticks.length} tick strokes`);
          ticks.forEach((o, i) => {
            const dr = ((((o.rot - (ca - Math.PI / 2)) % Math.PI) + Math.PI) % Math.PI);
            if (Math.min(dr, Math.PI - dr) < CUT_LOOK.crossMin - 1e-6) bad.push(`${tag}: tick stroke ${i} lies ${Math.min(dr, Math.PI - dr).toFixed(2)} rad off the line (no cross)`);
          });
          const sparks = m.slice(L.slash + L.tick, L.slash + L.tick + L.sparks);
          const onCut = sparks.filter((o) => adiff(angOf(o), ca) <= T.fan + 0.1).length;
          if (!(onCut >= (2 / 3) * sparks.length) || !sparks.length) bad.push(`${tag}: ${onCut} of ${sparks.length} sparks along the cut`);
          const cap = BUDGET[tier] + (crit ? 12 : 0);
          if (!(L.total <= cap) || L.total !== m.length) bad.push(`${tag}: ${L.total} spawns (cap ${cap}; captured ${m.length})`);
          if (r.lights.length !== 1 || !(r.lights[0].intensity <= 2.5)) bad.push(`${tag}: ${r.lights.length} lights (intensity ${r.lights[0]?.intensity})`);
          // the LOW preset: fewer sparks, motes and ring strokes; the line, the tick and the core kept
          game.settings.quality = 0;
          const lo = shot(tier, crit, k).last;
          game.settings.quality = 2;
          if (!(lo.sparks + lo.motes + lo.ring <= Math.ceil(0.7 * (L.sparks + L.motes + L.ring))) || lo.tick !== L.tick || lo.core !== L.core || lo.slash < T.n - 2 + second) bad.push(`${tag}: LOW ${lo.sparks}+${lo.motes}+${lo.ring} of ${L.sparks}+${L.motes}+${L.ring}, slash ${lo.slash}, tick ${lo.tick}/${L.tick}`);
          if (!crit) rows.push(`${tag} ${L.total}`);
        }
      }
      // degenerate inputs never throw, never feed NaN, still draw a line
      for (const [nm, c] of [['no contact', null], ['no travel', { ...C, cx: 0, cy: 0, cz: 0 }], ['no edge', { ...C, ex: 0, ey: 0, ez: 0 }], ['NaN travel', { ...C, cx: NaN }]]) {
        let threw = false, r = null;
        try { r = shot('light', false, 0, c); } catch { threw = true; }
        if (threw || !r || !r.made.every(finiteSpawn) || !(r.last.slash >= 1)) bad.push(`${nm}: ${threw ? 'threw' : `slash ${r?.last.slash}, finite ${r?.made.every(finiteSpawn)}`}`);
      }
      // its own stream advances: two identical cuts throw different sparks
      const s1 = shot('light', false), s2 = shot('light', false);
      const ang = (r) => r.made.slice(r.last.slash + r.last.tick, r.last.slash + r.last.tick + r.last.sparks).map((o) => angOf(o).toFixed(4)).join();
      if (ang(s1) === ang(s2)) bad.push('two identical cuts threw the same sparks');
      // the 'fan' look: no line and no tick, more sparks
      const gash = shot('slam', false).last;
      setCutStyle('fan');
      const fan = shot('slam', false).last;
      if (!(fan.slash === 0 && fan.tick === 0 && fan.sparks >= 1.5 * gash.sparks)) bad.push(`fan: slash ${fan.slash}, tick ${fan.tick}, sparks ${fan.sparks} vs ${gash.sparks}`);
    } finally {
      setCutStyle('gash');
      fxa.spawn = spawn0;
      lp.add = ladd0;
      game.settings.quality = q0;
      Math.random = rand0;
    }
    out(`   cut: spawns per tier ${rows.join(' · ')}`);
    assert(!bad.length, `a landed cut is a line along the cut, a tick across it (heavy, crit), sparks along it, one small core, within budget, LOW, degenerate inputs, the fan look (${bad.slice(0, 6).join('; ') || 'all'})`);
    assert(draws === 0, `a landed cut never touches the AI's random stream (${draws} Math.random draws)`);
  }

  // (1e2) the blade flares where the game camera sees it (TUNE.bladeFlare: part 17's pass gains, the
  // fill and both lines): exactly the base at rest, a landed cut's flare held through the freeze and
  // gone 0.4 s later, the slam's stronger, a whiff only the strike's; the far strike ink above rest
  {
    const PF = game.U.uHeroPartFill.value[17], PR = game.U.uHeroPartRim.value[17], bu = r.materials.blade.uniforms;
    const fx0 = Math.sin(d.yaw), fz0 = Math.cos(d.yaw);
    const chest = () => d.hurtSpheres.filter((h) => h.part === 'body').reduce((a, h) => ((h.x - d.position.x) * fx0 + (h.z - d.position.z) * fz0 > (a.x - d.position.x) * fx0 + (a.z - d.position.z) * fz0 ? h : a));
    const front = () => { const c = chest(); p.debug.teleport(c.x + fx0 * (c.r + 1), c.z + fz0 * (c.r + 1)); p.yaw = Math.atan2(c.x - p.position.x, c.z - p.position.z); aimAt(G); };
    const aim0 = game.mouseGround.clone(); // (put back after: the blocks below swing at their own aim)
    go(1.0);
    const idle = [PF.x, PR.w];
    // a landed light
    front();
    go(0.3);
    let hitN = 0;
    G.watch = (n, e) => { if (n === 'player:hitDragon' && !e.guarded) hitN++; };
    A.forceVariant = 0;
    input.click(0);
    let lit = null, held = null;
    for (let i = 0; i < 60 && !hitN; i++) G.tick(DT);
    if (hitN) {
      lit = PF.x;
      for (let i = 0; i < 3; i++) G.tick(DT);
      held = PF.x;
    }
    go(0.4);
    const cooled = PF.x;
    // the slam (the fifth of a mashed chain, every hit landing)
    go(0.8);
    front();
    let slamPeak = 0;
    for (let k = 0; k < 5; k++) { d.hp = d.maxHp; input.click(0); go(k === 4 ? 0.9 : CHAIN_EVERY, () => { if (p.atk?.def?.kind === 'slam') slamPeak = Math.max(slamPeak, PF.x); }); }
    // a whiff, 30 m from the wyrm: the strike's gain only; the far strike ink
    go(1.0);
    p.debug.teleport(d.position.x + 30, d.position.z + 30);
    go(0.5);
    let whiff = 0, farInk = 0;
    input.click(0);
    go(0.6, () => { whiff = Math.max(whiff, PF.x); const a = p.atk; if (a?.def && a.t >= a.def.windup && a.t <= a.def.windup + a.def.active + 0.12) farInk = Math.max(farInk, bu.uInkGlow.value); });
    A.forceVariant = null;
    G.watch = null;
    out(`   blade flare: rest ${idle[0]} / ${idle[1]}, a landed light ${lit?.toFixed(2)} → ${held?.toFixed(2)} three frames on → ${cooled.toFixed(2)} 0.4 s later; the slam ${slamPeak.toFixed(2)}; a whiff ${whiff.toFixed(2)}; far strike ink ${farInk.toFixed(2)} at ${p.viewDist.toFixed(0)} m`);
    assert(idle[0] === 1 && idle[1] === 1.7, `at rest the blade's part is exactly its HERO_INK base (fill ${idle[0]}, rim ${idle[1]})`);
    assert(lit >= 1.5 && held >= 1.35 && cooled <= 1.02, `a landed cut flares the blade (fill ${lit?.toFixed(2)} ≥ 1.5), held through the freeze (${held?.toFixed(2)} ≥ 1.35), gone 0.4 s later (${cooled.toFixed(2)} ≤ 1.02)`);
    assert(slamPeak >= 1.8 && whiff <= 1.15, `the slam flares further (${slamPeak.toFixed(2)} ≥ 1.8); a whiff only takes the strike's gain (${whiff.toFixed(2)} ≤ 1.15)`);
    assert(p.viewDist >= 30 && farInk >= 1.85, `at the game camera (${p.viewDist.toFixed(0)} m) a light strike's ink rises above the rest ink (${farInk.toFixed(2)} ≥ 1.85; it was a flat 1.6)`);
    // dead: the base again
    p.debug.kill();
    G.tick(DT);
    const dead = PF.x;
    game.flow.debug.toState('boss');
    p.respawn(p.position.x, p.position.z);
    p.debug.god = true;
    p.debug.teleport(d.position.x + 14, d.position.z + 14);
    game.mouseGround.copy(aim0);
    d.hp = d.maxHp;
    d.posture = 0;
    go(1.0);
    assert(dead === 1, `a dead hero's blade is the base (${dead})`);
  }

  // (1e3) the edge glint runs up the LEADING edge as a cut comes in (fx.edgeGlint, EDGE_GLINT): on the
  // steel, rising to the point; on the ridge for a thrust; never at rest, at a run, at the coil or in
  // the execution's thrust; a landed cut stops it and flashes the steel instead (fx.edgeFlash)
  {
    const { EDGE_GLINT, hwAt, leadSide } = await imp('src/entities/player/fx.js');
    const { SWINGS } = await imp('src/entities/player/swings.js');
    const { THRUST, CHARGE, chargeStats } = await imp('src/entities/player/combat.js');
    const fxa = p.fx.add, spawn0 = fxa.spawn, eg0 = p.fx.edgeGlint, ef0 = p.fx.edgeFlash;
    const aim0 = game.mouseGround.clone();
    const lv = new THREE.Vector3();
    let inGlint = null, inFlash = false;
    const glints = [], flashes = [];
    fxa.spawn = (o) => {
      if (inGlint && o.color === EDGE_GLINT.color) {
        r.sword.worldToLocal(lv.set(o.x, o.y, o.z));
        glints.push({ ...inGlint, head: o.glyph === '+', x: lv.x, y: lv.y, z: lv.z, t: game.time });
      }
      if (inFlash) {
        r.sword.worldToLocal(lv.set(o.x, o.y, o.z));
        flashes.push({ glyph: o.glyph, z: lv.z, t: game.time, life: o.life });
      }
      return spawn0.call(fxa, o);
    };
    p.fx.edgeGlint = function (sw, ...rest) {
      const a = p.atk;
      inGlint = { atk: a, key: `${a?.def?.name}#${A.atkVar}`, line: SWINGS[A.atkAnim?.clip]?.line ?? null, side: leadSide(sw, r.sword.matrixWorld.elements) };
      try { return eg0.call(this, sw, ...rest); } finally { inGlint = null; }
    };
    p.fx.edgeFlash = function (...args) { inFlash = true; try { return ef0.apply(this, args); } finally { inFlash = false; } };
    const bad = [];
    try {
      // whiffs, 30 m from the wyrm: every look of every light hit, then the slam
      p.debug.teleport(d.position.x + 30, d.position.z + 30);
      game.mouseGround.set(p.position.x, 0, p.position.z - 5);
      go(0.6);
      for (let look = 0; look < 3; look++) {
        A.forceVariant = look;
        for (let k = 0; k < 5; k++) { input.click(0); go(k === 4 ? 0.9 : CHAIN_EVERY); }
        go(0.8);
      }
      A.forceVariant = null;
      const swings = new Map();
      for (const g of glints) { if (!swings.has(g.atk)) swings.set(g.atk, []); swings.get(g.atk).push(g); }
      let nCut = 0, nPoint = 0;
      for (const list of swings.values()) {
        const { key, line } = list[0];
        const heads = list.filter((g) => g.head);
        if (list.length < 4) bad.push(`${key}: ${list.length} glint spawns`);
        if (list.some((g) => g.z < HERO_DIM.forte - 0.01 || g.z > HERO_DIM.drawnTip + 0.01 || Math.abs(g.y) > 0.02)) bad.push(`${key}: a glint off the steel`);
        if (heads.some((g, i) => i && g.z < heads[i - 1].z - 1e-4)) bad.push(`${key}: the head ran back down`);
        if (!(Math.max(...heads.map((g) => g.z)) >= 0.85 * HERO_DIM.drawnTip)) bad.push(`${key}: the head stopped at ${Math.max(...heads.map((g) => g.z)).toFixed(2)}`);
        if (line === 'point') {
          nPoint++;
          if (list.some((g) => Math.abs(g.x) > 0.01)) bad.push(`${key}: a thrust's glint off the ridge`);
        } else {
          nCut++;
          const onEdge = list.filter((g) => Math.abs(g.x) >= 0.6 * hwAt(g.z) && Math.sign(g.x) === g.side).length;
          if (onEdge < 0.8 * list.length) bad.push(`${key}: ${onEdge} of ${list.length} on the leading edge`);
        }
      }
      out(`   edge glint: ${swings.size} swings (${nCut} cuts, ${nPoint} thrusts), ${glints.length} spawns`);
      if (!(nCut >= 10 && nPoint >= 2)) bad.push(`only ${nCut} cuts / ${nPoint} thrusts swung`);
      // none at rest, at a run, at the coil or through the execution's thrust
      glints.length = 0;
      go(1.0);
      input.axis = { x: 0, y: 1 };
      go(1.0);
      input.axis = { x: 0, y: 0 };
      go(0.5);
      input.press(2);
      go(0.18);
      const quiet = glints.length;
      input.up(2);
      go(1.0);
      glints.length = 0;
      p._startHeavy(THRUST, chargeStats(CHARGE.full, THRUST));
      go(1.0);
      if (quiet || glints.length) bad.push(`glints at rest / running / at the coil (${quiet}) or in the thrust (${glints.length})`);
      // a landed light: the glint stops at the contact, four strokes flash on the steel in that frame
      const fx0 = Math.sin(d.yaw), fz0 = Math.cos(d.yaw);
      const c = d.hurtSpheres.filter((h) => h.part === 'body').reduce((a, h) => ((h.x - d.position.x) * fx0 + (h.z - d.position.z) * fz0 > (a.x - d.position.x) * fx0 + (a.z - d.position.z) * fz0 ? h : a));
      p.debug.teleport(c.x + fx0 * (c.r + 1), c.z + fz0 * (c.r + 1));
      p.yaw = Math.atan2(c.x - p.position.x, c.z - p.position.z);
      aimAt(G);
      go(0.5);
      glints.length = 0;
      flashes.length = 0;
      let hitT = null;
      G.watch = (n, e) => { if (n === 'player:hitDragon' && !e.guarded && hitT === null) hitT = game.time; };
      A.forceVariant = 0;
      input.click(0);
      let stopAt = null;
      go(0.6, () => { if (hitT !== null && stopAt === null) stopAt = game.hitstopTimer; });
      A.forceVariant = null;
      G.watch = null;
      const late = glints.filter((g) => g.t >= hitT).length, inTick = flashes.filter((f) => f.t === hitT);
      // the flash has no velocity: it lives exactly the frames the freeze holds (main.js: the contact
      // frame at the full rate, then whole frames at fxLive) and is gone as the blade swings on
      let held = 0;
      for (let h = stopAt ?? 0; h > 0; h -= DT) held++;
      const ageLast = DT + held * DT * CONFIG.render.fxLive, life = inTick[0]?.life;
      out(`   a landed light: ${glints.length} glint spawns before the contact, ${late} after; ${inTick.length} flash strokes on the steel (z ${inTick.map((f) => f.z.toFixed(2)).join(', ')}), living ${life?.toFixed(3)} fx s (the freeze ${stopAt?.toFixed(3)} s holds ${held} frames: ${ageLast.toFixed(3)} fx s old on its last)`);
      if (hitT === null || late || inTick.length !== 4 || flashes.length !== 4 || inTick.some((f) => f.glyph !== '|' || f.z < HERO_DIM.forte - 1e-3 || f.z > HERO_DIM.drawnTip + 1e-3)) bad.push(`landed: ${late} glints after the contact, ${inTick.length} of ${flashes.length} flash strokes in its frame`);
      if (!(held >= 2 && inTick.every((f) => f.life > ageLast && f.life <= ageLast + DT))) bad.push(`the flash lives ${life} fx s: not the ${held} held frames (${ageLast.toFixed(3)} … ${(ageLast + DT).toFixed(3)})`);
    } finally {
      fxa.spawn = spawn0;
      p.fx.edgeGlint = eg0;
      p.fx.edgeFlash = ef0;
      A.forceVariant = null;
    }
    // neither draws from the AI's stream
    const rand0 = Math.random;
    let draws = 0;
    Math.random = () => { draws++; return rand0(); };
    try {
      p.fx.edgeGlint(p.sweep, 0.24, 0.9, 1, false, DT);
      p.fx.edgeFlash(p.sweep, 0.5, true, false);
    } finally {
      Math.random = rand0;
    }
    assert(!bad.length, `the edge glint runs up the leading edge to the point on every cut (the ridge on a thrust), never at rest, at a run, at the coil or in the execution's thrust; a landed cut flashes four strokes on the steel instead (${bad.slice(0, 5).join('; ') || 'all'})`);
    assert(draws === 0, `the edge glint and the flash never touch the AI's random stream (${draws} draws)`);
    p.debug.teleport(d.position.x + 14, d.position.z + 14);
    game.mouseGround.copy(aim0);
    d.hp = d.maxHp;
    go(1.0);
  }

  // (1e4) the camera kick (cameraRig.kick, game.kick): the kick's frame shows the whole throw, it
  // springs back with one small overshoot, stacks to its cap, ignores bad input, snap() clears it, the
  // phone's closer camera throws it less, and a blow going north moves the picture up
  {
    const origin = new THREE.Vector3(0, 0, 0);
    const rig = new CameraRig(new THREE.PerspectiveCamera(32, 16 / 9, 1, 220));
    rig.snap(origin);
    const x0 = rig.camera.position.x;
    // (the same rig without the kick: kickOff is exactly the translation the kick put on the camera,
    // which main.js takes off the mouse ray)
    const still = new CameraRig(new THREE.PerspectiveCamera(32, 16 / 9, 1, 220));
    still.snap(origin);
    rig.kick(0.6, 0.3, -0.7, 0.08);
    rig.update(DT, origin);
    still.update(DT, origin);
    const offErr = rig.camera.position.clone().sub(rig.kickOff).distanceTo(still.camera.position);
    const offOk = offErr <= 1e-9 && rig.kickOff.length() > 0.05 && still.kickOff.length() === 0;
    rig.snap(origin);
    rig.kick(1, 0, 0, 0.08);
    rig.update(DT, origin);
    const first = rig.camera.position.x - x0;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < Math.round(0.3 / DT); i++) { rig.update(DT, origin); lo = Math.min(lo, rig.kickX); hi = Math.max(hi, rig.kickX); }
    const settled = rig.kickX;
    const k0 = [rig.kickX, rig.kickY, rig.kickVX, rig.kickVY].join();
    rig.kick(NaN, 0, 0, 1); rig.kick(0, 0, 0, 1); rig.kick(1, 0, 0, 0); rig.kick(1, 0, 0, -1); rig.kick(1, 0, 0, NaN);
    const ignored = [rig.kickX, rig.kickY, rig.kickVX, rig.kickVY].join() === k0;
    for (let i = 0; i < 10; i++) rig.kick(1, 0, 0, 0.3);
    const capped = Math.abs(rig.kickX);
    rig.snap(origin);
    const cleared = rig.kickX === 0 && rig.kickY === 0 && rig.kickVX === 0 && rig.kickVY === 0;
    rig.setMobile(true);
    rig.kick(1, 0, 0, 0.08);
    const phone = rig.kickX;
    rig.snap(origin);
    rig.kick(0, 0, -1, 0.1);
    const north = rig.kickY;
    out(`   kick: the kick frame ${first.toFixed(4)} m, then ${lo.toFixed(4)} … ${hi.toFixed(4)}, ${settled.toFixed(5)} after 0.3 s; stacked ${capped.toFixed(2)}; phone ${phone.toFixed(4)}; a blow north ${north.toFixed(3)}`);
    assert(Math.abs(first + 0.08) <= 1e-6, `the kick's frame shows the whole throw: the camera ${first.toFixed(4)} m (−0.08)`);
    assert(Math.abs(settled) < 0.008 && lo >= -0.08 - 1e-9 && hi <= 0.2 * 0.08, `it springs back in 0.3 s (${settled.toFixed(5)}) with one small overshoot (${hi.toFixed(4)} ≤ 0.016)`);
    assert(ignored && capped <= 0.5 + 1e-9 && cleared, `bad kicks do nothing, stacked kicks cap at 0.5 m (${capped.toFixed(2)}), snap() clears it`);
    assert(Math.abs(phone + 0.08 * 20 / 36) <= 0.002 && north < 0, `the phone's camera throws it 20/36 as far (${phone.toFixed(4)}); a blow going north moves the picture up (kickY ${north.toFixed(3)} < 0)`);
    assert(offOk, `kickOff is the kick's translation of the camera (the mouse ray drops it: aim never wobbles with a cut; ${offErr.toExponential(1)} m off the camera without the kick)`);
  }

  // (1c) the pace (Session 26, owner: "speed up the attack speed ... its too slow"): mashing the
  // button, a light every ~0.3 s (it was 0.42 s; 0.25 s before Session 25). The next light still
  // waits for the cut to carry through (`chain` of the recovery)
  {
    go(1.0);
    const starts = [];
    let last = null;
    for (let i = 0; i < Math.round(1.9 / DT); i++) {
      if (i % 3 === 0) input.click(0);
      G.tick(DT);
      const def = p.atk?.def;
      if (p.state === 'attack' && def && def !== last) {
        last = def;
        starts.push({ t: game.time, combo: def.combo });
      }
    }
    const gaps = [];
    for (let i = 1; i < starts.length; i++) if (starts[i].combo === starts[i - 1].combo + 1 && starts[i].combo <= 4) gaps.push(starts[i].t - starts[i - 1].t);
    out(`   mashed chain: hits start ${gaps.map((g) => g.toFixed(2)).join(', ')} s apart`);
    assert(gaps.length >= 3 && Math.min(...gaps) >= 0.26 && Math.max(...gaps) <= 0.4, `a mashed chain lands a light every 0.26-0.40 s (${gaps.map((g) => g.toFixed(2)).join(', ')})`);
    go(1.6);
  }

  // (1f) the flow of one swing, the finisher's weight, the Lab's attack speed (Session 26). Points are
  // tracked in the hero's own frame, a step = how far one moves in a frame.
  {
    const inv = new THREE.Matrix4(), tip = new THREE.Vector3(), tipWas = new THREE.Vector3(), wr = new THREE.Vector3(), wrWas = new THREE.Vector3();
    let have = false, tipStep = 0, wrStep = 0;
    const track = () => {
      inv.copy(r.root.matrixWorld).invert();
      tip.set(0, 0, 0.9).applyMatrix4(r.sword.matrixWorld).applyMatrix4(inv).multiplyScalar(1 / p.drawScale);
      wr.set(0, -HD.foreArm, 0).applyMatrix4(r.arms.R.fore.matrixWorld).applyMatrix4(inv).multiplyScalar(1 / p.drawScale);
      tipStep = have ? tip.distanceTo(tipWas) : 0;
      wrStep = have ? wr.distanceTo(wrWas) : 0;
      tipWas.copy(tip);
      wrWas.copy(wr);
      have = true;
    };
    // one falling cut from rest, left to finish: the follow-through runs into the way home. (The
    // blade stood still for two frames after its last key and then came home in 0.12 s, as fast as it
    // had cut: 60 cm a frame at the point.)
    go(1.2);
    A.forceVariant = 0;
    have = false;
    input.click(0);
    let cut = 0;
    const rec = [];
    for (let i = 0; i < 60 && (i < 2 || p.state === 'attack'); i++) {
      G.tick(DT);
      track();
      const a = p.atk, d = a?.def;
      if (!d || p.state !== 'attack') continue;
      if (a.t >= d.windup && a.t <= d.windup + d.active) cut = Math.max(cut, tipStep);
      else if (a.t > d.windup + d.active) rec.push(tipStep);
    }
    const back = Math.max(...rec.slice(3));
    const lastFast = rec.reduce((b, v, i) => (v > 0.08 ? i : b), -1);
    const still = rec.slice(0, Math.max(0, lastFast)).filter((v) => v < 0.01).length;
    out(`   one cut: the point's fastest frame ${(cut * 100).toFixed(0)} cm in the cut, ${(back * 100).toFixed(0)} cm on the way home; ${still} still frame(s) between them`);
    assert(cut > 0.5 && back < cut * 0.62 && still <= 1, `a cut's follow-through runs into the way home: no stop of two frames, and the point comes home at under 0.62 of the cut's speed (${(back / cut).toFixed(2)}, ${still} still frames)`);
    go(0.8);
    // the finisher, mashed: its hands never cover more than 0.36 m in a frame (the old slam's did
    // 0.54 m), and the next chain waits for the landing (`chain`)
    let hands = 0, slamEnd = -1, nextStart = -1, lastDef = null;
    have = false;
    for (let i = 0; i < Math.round(2.6 / DT); i++) {
      if (i % 3 === 0) input.click(0);
      G.tick(DT);
      track();
      const a = p.atk, d = a?.def;
      if (d?.kind === 'slam' && p.state === 'attack') {
        hands = Math.max(hands, wrStep);
        if (slamEnd < 0 && a.t >= d.windup + d.active) slamEnd = game.time;
      } else if (slamEnd >= 0 && nextStart < 0 && d && d !== lastDef && p.state === 'attack') nextStart = game.time;
      lastDef = d;
    }
    A.forceVariant = null;
    out(`   the finisher: hands at most ${(hands * 100).toFixed(0)} cm a frame; the next chain starts ${(nextStart - slamEnd).toFixed(2)} s after the blow lands`);
    assert(slamEnd > 0 && hands > 0.1 && hands < 0.36, `the finisher's hands move at most ${(hands * 100).toFixed(0)} cm in a frame (< 36)`);
    assert(nextStart > 0 && nextStart - slamEnd >= 0.1, `a mashed button does not cut the finisher's landing off: the next chain starts ${(nextStart - slamEnd).toFixed(2)} s after the blow (≥ 0.10 s)`);
    go(1.4);
    // the Lab's attack speed: at x1.5 a swing takes 1/1.5 as long and its step covers the same ground
    const once = (k) => {
      p.debug.attackSpeed = k;
      A.forceVariant = 0;
      go(0.8);
      const x0 = p.position.x, z0 = p.position.z, t0 = game.time;
      input.click(0);
      let n = 0;
      do { G.tick(DT); n++; } while (n < 120 && (n < 3 || p.state === 'attack'));
      p.debug.attackSpeed = 1;
      A.forceVariant = null;
      return { dur: game.time - t0, dist: Math.hypot(p.position.x - x0, p.position.z - z0) };
    };
    const a1 = once(1), a2 = once(1.5);
    out(`   attack speed: x1 ${a1.dur.toFixed(2)} s over ${a1.dist.toFixed(2)} m; x1.5 ${a2.dur.toFixed(2)} s over ${a2.dist.toFixed(2)} m`);
    assert(Math.abs(a2.dur - a1.dur / 1.5) < 0.05 && Math.abs(a2.dist - a1.dist) < 0.12, `player.debug.attackSpeed 1.5: a swing takes 1/1.5 as long (${a2.dur.toFixed(2)} vs ${a1.dur.toFixed(2)} s) and steps as far (${a2.dist.toFixed(2)} vs ${a1.dist.toFixed(2)} m)`);
    go(1.0);
  }

  // (1g) anatomy (ADR-078; Session 26, owner: "while charging the right hand makes an unnatural
  // angle ... make sure the anatomy and motion is all natural"). Joint angles measured in the hero's
  // own frame (the drawn one is sheared toward the camera), through a held charge and its cleave, a
  // mashed chain, a roll and the guard: no elbow closes past 38°, no knee past 30°, and the blade
  // never folds back on the sword forearm past 130°. In the held charge the sword wrist is square
  // to the steel and the off hand is outside the chest.
  {
    const invR = new THREE.Matrix4(), invC = new THREE.Matrix4();
    const V = () => new THREE.Vector3();
    const sh = V(), el = V(), wr = V(), a = V(), b = V(), bl = V(), o = V();
    const ang = (x, y) => Math.acos(Math.max(-1, Math.min(1, x.dot(y) / ((x.length() * y.length()) || 1)))) * 57.2958;
    const worst = { elbow: 180, knee: 180, wrist: 0 }, at = { elbow: '', knee: '', wrist: '' };
    const now = {};
    const measure = () => {
      invR.copy(p.object3d.matrixWorld).invert();
      invC.copy(r.chest.matrixWorld).invert();
      o.set(0, 0, 0).applyMatrix4(r.sword.matrixWorld).applyMatrix4(invR);
      bl.set(0, 0, 1).applyMatrix4(r.sword.matrixWorld).applyMatrix4(invR).sub(o);
      const tag = `${p.state}${p.atk?.def ? ' ' + p.atk.def.name : ''}`;
      [r.arms.R, r.arms.L].forEach((arm, k) => {
        sh.setFromMatrixPosition(arm.upper.matrixWorld).applyMatrix4(invR);
        el.setFromMatrixPosition(arm.fore.matrixWorld).applyMatrix4(invR);
        wr.set(0, -HD.foreArm, 0).applyMatrix4(arm.fore.matrixWorld);
        now[k ? 'handL' : 'handR'] = (() => { a.copy(wr).applyMatrix4(invC); return Math.hypot(a.x, a.z) / p.drawScale; })();
        wr.applyMatrix4(invR);
        a.subVectors(el, sh);
        b.subVectors(wr, el);
        const e = 180 - ang(a, b), w = ang(b, bl);
        now[k ? 'elbowL' : 'elbowR'] = e;
        now[k ? 'wristL' : 'wristR'] = w;
        if (e < worst.elbow) { worst.elbow = e; at.elbow = tag; }
        if (k === 0 && w > worst.wrist) { worst.wrist = w; at.wrist = tag; }
      });
      for (const leg of [r.legs.R, r.legs.L]) {
        sh.setFromMatrixPosition(leg.thigh.matrixWorld).applyMatrix4(invR);
        el.setFromMatrixPosition(leg.shin.matrixWorld).applyMatrix4(invR);
        wr.setFromMatrixPosition(leg.foot.matrixWorld).applyMatrix4(invR);
        const e = 180 - ang(a.subVectors(el, sh), b.subVectors(wr, el));
        if (e < worst.knee) { worst.knee = e; at.knee = tag; }
      }
    };
    go(1.0);
    input.press(2);
    go(1.3, measure);
    const held = { ...now };
    input.up(2);
    go(1.0, measure);
    for (let look = 0; look < 3; look++) {
      A.forceVariant = look;
      for (let k = 0; k < 5; k++) { input.click(0); go(k === 4 ? 0.9 : CHAIN_EVERY, measure); }
      go(0.8, measure);
    }
    A.forceVariant = null;
    input.axis = { x: 0, y: 1 };
    go(0.3, measure);
    input.tap('Space');
    go(0.8, measure);
    input.axis = { x: 0, y: 0 };
    input.press(1);
    go(0.6, measure);
    input.up(1);
    go(0.6, measure);
    out(`   anatomy: tightest elbow ${worst.elbow.toFixed(0)}° (${at.elbow}), tightest knee ${worst.knee.toFixed(0)}° (${at.knee}), the blade back on the forearm at most ${worst.wrist.toFixed(0)}° (${at.wrist}); held charge: sword wrist ${held.wristR.toFixed(0)}°, elbows ${held.elbowR.toFixed(0)}° / ${held.elbowL.toFixed(0)}°, off wrist ${held.wristL.toFixed(0)}°, off hand ${(held.handL * 100).toFixed(0)} cm from the chest's axis`);
    assert(worst.elbow >= 38 && worst.knee >= 30, `no joint folds flat: elbows ≥ 38° (${worst.elbow.toFixed(0)}°, ${at.elbow}), knees ≥ 30° (${worst.knee.toFixed(0)}°, ${at.knee})`);
    assert(worst.wrist <= 130, `the blade never folds back along the sword forearm (at most ${worst.wrist.toFixed(0)}° from its line, ${at.wrist}; ≤ 130°)`);
    assert(held.wristR >= 70 && held.wristR <= 125 && held.elbowR >= 45 && held.elbowL >= 42 && held.wristL >= 35 && held.handL >= 0.105,
      `the held charge is a guard a body can hold: the sword wrist square to the steel (${held.wristR.toFixed(0)}°), open elbows (${held.elbowR.toFixed(0)}° / ${held.elbowL.toFixed(0)}°), the off hand outside the chest (${(held.handL * 100).toFixed(0)} cm from its axis)`);
    go(1.0);
  }

  // (2) the guard, the cross ward (Session 25): both hands, the blade slanting up across the body
  // (25°–50° up: its length shows across his back from the camera behind him), sunk and side-on
  {
    input.press(1);
    go(0.5);
    // the blade's direction from two of its points (the hero's matrices carry the drawn scale and the
    // camera lean, so a decomposed world rotation would not be the blade's)
    p.lean.on = false;
    p.object3d.updateMatrixWorld(true);
    v.set(0, 0, 0).applyMatrix4(r.sword.matrixWorld);
    q.set(0, 0, 1).applyMatrix4(r.sword.matrixWorld).sub(v).normalize();
    p.lean.on = true;
    p.object3d.updateMatrixWorld(true);
    const elev = Math.asin(Math.min(1, Math.max(-1, q.y))) * 57.3;
    // across: how much of the blade lies across his body (the hero's own left-right axis)
    const across = Math.abs(q.x * Math.cos(p.yaw) - q.z * Math.sin(p.yaw));
    const sink = -A.cur[1], side = -(A.cur[6] + A.cur[9]); // P.bodyY; P.pelvY + P.spY
    const hands = A.cur[14]; // P.rH y: the grip from the sword shoulder's height
    out(`   block: blade ${elev.toFixed(0)}° up, ${(across * 100).toFixed(0)} % across him, hips ${sink.toFixed(2)} m down, turned ${(side * 57.3).toFixed(0)}° side-on, twoHand ${A.cur[45].toFixed(2)}, off hand ${(offGap() * 100).toFixed(1)} cm from its place`);
    assert(p.state === 'block' && A.cur[45] > 0.95 && offGap() < 0.035, 'the guard: both hands on the grip');
    assert(elev > 25 && elev < 50 && across > 0.6, `the cross ward: the blade slants ${elev.toFixed(0)}° up (25°–50°) and lies ${(across * 100).toFixed(0)} % across his body (> 60 %)`);
    assert(sink > 0.14 && side > 0.4, `the deeper stance: hips ${sink.toFixed(2)} m down (> 0.14), hips and chest turned ${(side * 57.3).toFixed(0)}° side-on (> 23°)`);
    assert(hands > -0.2, `the hands are up before the chest: the grip ${(-hands * 100).toFixed(0)} cm below the shoulder (< 20 cm; it was 34 cm, at the hip)`);
    input.up(1);
    go(0.8);
  }

  // (3) the charge: the drawn-back blade never passes through a cloak sheet (the streamer bound).
  // Each sheet is modelled from its own record (len, w, and `wrap`, the root curve; records without
  // w or wrap are skipped)
  {
    const m = new THREE.Matrix4();
    let frames = 0, hit = 0;
    const clip = () => {
      frames++;
      if (sheetHit(r, m, v)) hit++;
    };
    input.press(2);
    go(1.6, clip);
    input.up(2);
    go(1.0);
    out(`   charge: the blade touched a cloak sheet in ${hit} of ${frames} frames`);
    assert(frames > 60 && hit <= 2, `held charge: the drawn-back blade stays out of the cloak (${hit} of ${frames} frames within 2 cm of a sheet)`);
  }

  // (4) idle life: standing still he does things (at least three different ones in 45 s: the picks are random, never the same twice running), every
  // frame finite and the point never in the ground; a step cuts the action within 0.25 s
  // (ADR-114: at ease only. This scenario stands in a boss fight, where he keeps the fencer's guard:
  // the Lab's hook holds the at-ease stance for the count, then the fight's own rule is checked)
  {
    p.debug.fightStance = false;
    go(1.5);
    const c0 = A.fidget.count, names = new Set();
    let tipLow = Infinity, bad = 0;
    go(45, () => {
      if (A.fidget.name) names.add(A.fidget.name);
      v.set(0, 0, HD.steelTip).applyMatrix4(r.sword.matrixWorld);
      tipLow = Math.min(tipLow, v.y);
      if (!finite()) bad++;
    });
    const played = A.fidget.count - c0;
    out(`   idle life: ${played} actions in 45 s (${[...names].join(', ')}); the point's lowest ${tipLow.toFixed(3)} m`);
    assert(played >= 4 && names.size >= 3 && bad === 0 && tipLow > -0.03,
      `standing still he does ${played} things in 45 s, ${names.size} different, every frame finite, the point above the grass`);
    // start one and cut it
    // a freshly started one (the 25 s above can end in an action's last half second)
    let waited = 0;
    while (!(A.fidget.k >= 0 && A.fidget.t < 0.2) && waited < 15) { go(DT); waited += DT; }
    go(0.6);
    const before = A.fidget.w;
    input.axis = { x: 0, y: 1 };
    go(0.25);
    input.axis = { x: 0, y: 0 };
    assert(before > 0.5 && A.fidget.w === 0, `a step cuts the action: weight ${before.toFixed(2)} → ${A.fidget.w.toFixed(2)} within 0.25 s`);
    // locked on (a fight), he stays on guard: no idle action starts
    p.debug.teleport(d.position.x + 6, d.position.z + 6);
    go(0.5);
    p.lockOn = true;
    const c1 = A.fidget.count;
    go(8);
    assert(A.fidget.count === c1, 'locked on, no idle action starts');
    p.lockOn = false;
    // … nor in a boss fight without a lock (he stands in the guard: ADR-114)
    p.debug.fightStance = null;
    go(1.0);
    const c2 = A.fidget.count;
    go(8);
    assert(game.state === 'boss' && A.fightW > 0.95 && A.fidget.count === c2, `in a boss fight with no lock he keeps the guard (fightW ${A.fightW.toFixed(2)}) and no idle action starts`);
  }

  // (7) hit reactions and the death fall (ADR-083; Session 28, the owner's go-ahead to audit them).
  // Measured without the camera lean. Through a flinch from each side, a knockdown from the front
  // and from behind, the standing death and a death on the ground:
  //   - no knee or elbow sinks into the grass (the death's collapse put both knees 15 cm under);
  //   - a blow from behind folds him FORWARD, and knocks him down onto his FRONT without turning him
  //     round (he used to spin 180° in one frame to fall on his back);
  //   - struck in the whirl, no hand is thrown more than 40 cm in a frame (57 cm: the body whipped
  //     square in the cross-fade);
  //   - killed lying down he stays down (the death clip stood him on his feet first).
  {
    const { BODY } = await imp('src/entities/player/model.js');
    p.lean.on = false;
    p.debug.god = false;
    p.debug.teleport(d.position.x + 15, d.position.z + 15);
    go(0.6);
    const S = p.drawScale;
    const at = (dx, dz) => { const sn = Math.sin(p.yaw), cs = Math.cos(p.yaw); return { x: p.position.x + sn * dz + cs * dx, z: p.position.z + cs * dz - sn * dx }; };
    const hit = (o = {}) => { const { dir = [0, 3], ...rest } = o; p.hp = rest.damage >= 999 ? 1 : p.maxHp; return p.takeHit({ damage: 10, tell: TELL.NORMAL, attack: 'test', from: at(dir[0], dir[1]), knockback: 0, ...rest }); };
    const JOINTS = [['knee R', r.legs.R.shin, BODY.thigh[1]], ['knee L', r.legs.L.shin, BODY.thigh[1]], ['elbow R', r.arms.R.fore, BODY.upperArm[1]], ['elbow L', r.arms.L.fore, BODY.upperArm[1]]];
    let sunk = 0, sunkAt = '';
    const ground = () => {
      for (const [name, j, rad] of JOINTS) {
        const dep = (rad * S - v.setFromMatrixPosition(j.matrixWorld).y) / S;
        if (dep > sunk) { sunk = dep; sunkAt = `${name}, ${p.state} t ${p.stateT.toFixed(2)}`; }
      }
    };
    // the head's place along his facing (model metres) and its height; the chest's facing (world y:
    // + = turned to the sky)
    const headZ = () => { v.setFromMatrixPosition(r.head.matrixWorld).sub(p.position); return (v.x * Math.sin(p.yaw) + v.z * Math.cos(p.yaw)) / S; };
    const headY = () => v.setFromMatrixPosition(r.head.matrixWorld).y / S;
    const chestUp = () => { v.set(0, 0, 0).applyMatrix4(r.chest.matrixWorld); return w.set(0, 0, 1).applyMatrix4(r.chest.matrixWorld).sub(v).normalize().y; };

    // the flinch gives the way the blow drives it
    const z0 = headZ();
    hit({ knockback: 1 });
    let back = 0;
    go(0.5, () => { ground(); back = Math.min(back, headZ() - z0); });
    go(0.6);
    hit({ dir: [0, -3], knockback: 1 });
    let fwd = 0;
    go(0.5, () => { ground(); fwd = Math.max(fwd, headZ() - z0); });
    go(0.6);
    out(`   flinch: a blow from the front throws his head ${(-back * 100).toFixed(0)} cm back, one from behind ${(fwd * 100).toFixed(0)} cm forward`);
    assert(back < -0.1 && fwd > 0.12, `the flinch gives the way the blow drives it: head ${(-back * 100).toFixed(0)} cm back from a blow in front, ${(fwd * 100).toFixed(0)} cm forward from one behind`);

    // struck in the whirl (hit 3): the body finishes its turn instead of snapping square
    A.forceVariant = 0;
    for (let k = 0; k < 2; k++) { input.click(0); go(CHAIN_EVERY); }
    input.click(0);
    go(0.17);
    const hands = [[r.arms.R.fore, new THREE.Vector3(), 0], [r.arms.L.fore, new THREE.Vector3(), 0]];
    const handAt = (H) => q.set(0, -HD.foreArm, 0).applyMatrix4(H[0].matrixWorld).sub(p.position).multiplyScalar(1 / S);
    for (const H of hands) H[1].copy(handAt(H));
    hit({ knockback: 2 });
    let handStep = 0;
    go(0.6, () => { ground(); for (const H of hands) { handAt(H); handStep = Math.max(handStep, q.distanceTo(H[1])); H[1].copy(q); } });
    A.forceVariant = null;
    go(0.8);
    assert(handStep < 0.4, `struck in the whirl, no hand is thrown more than 40 cm in a frame (${(handStep * 100).toFixed(0)} cm)`);

    // knocked down from the front: onto his back, and up again
    const fall = (dir) => {
      const y0 = p.yaw;
      hit({ dir, damage: 20, knockback: 2, knockdown: true });
      let turn = 0, prev = p.yaw, up = 0, n = 0, round = 0;
      go(1.7, () => {
        ground();
        if (p.state !== 'knockdown') return; // (on his feet again he turns to the aim)
        turn = Math.max(turn, Math.abs(Math.atan2(Math.sin(p.yaw - prev), Math.cos(p.yaw - prev))));
        prev = p.yaw;
        round = Math.abs(Math.atan2(Math.sin(p.yaw - y0), Math.cos(p.yaw - y0)));
        if (p.stateT > 0.4 && p.stateT < 0.75) { up += chestUp(); n++; }
      });
      go(0.5);
      return { turn, up: up / Math.max(1, n), round, state: p.state };
    };
    const f1 = fall([0, 3]);
    assert(!p.kdProne && f1.up > 0.7 && f1.state === 'idle', `knocked down from the front he lands on his back (chest to the sky ${f1.up.toFixed(2)}) and gets up (${f1.state})`);
    const f2 = fall([0, -3]);
    out(`   knockdown: from the front the chest faces ${f1.up.toFixed(2)} up; from behind ${f2.up.toFixed(2)}, his facing turned ${(f2.round * 57.3).toFixed(0)}° in all (${(f2.turn * 57.3).toFixed(0)}° at most in a frame)`);
    assert(p.kdProne && f2.up < -0.7 && f2.state === 'idle', `knocked down from behind he lands on his front (chest to the sky ${f2.up.toFixed(2)}) and gets up (${f2.state})`);
    assert(f2.round < 0.3 && f2.turn < 0.25 && f1.turn < 0.25, `a knockdown never spins him round: ${(f2.round * 57.3).toFixed(0)}° in all from behind, ${(Math.max(f1.turn, f2.turn) * 57.3).toFixed(0)}° at most in one frame`);
    const f3 = fall([3, 0]);
    assert(f3.turn < 0.25 && f3.round > 1.2 && f3.round < 1.9, `knocked down from the side his facing eases square to the blow (${(f3.round * 57.3).toFixed(0)}° in all, ${(f3.turn * 57.3).toFixed(0)}° at most in a frame)`);

    // the death fall, standing: to a knee on the sword, then forward onto his front
    go(0.5);
    hit({ damage: 999, knockback: 1 });
    go(2.6, ground);
    assert(p.state === 'dead' && !p.deadDown && A.key === 'dead' && chestUp() < -0.7 && headY() < 0.4, `the standing death ends on his front (chest ${chestUp().toFixed(2)}, head ${headY().toFixed(2)} m up)`);
    // … and on the ground: killed lying in a knockdown he stays where he lies
    game.flow.debug.toState('boss');
    p.respawn(p.position.x, p.position.z);
    go(1.0);
    hit({ damage: 20, knockback: 2, knockdown: true });
    go(0.55);
    const lyingHead = headY();
    hit({ damage: 999, knockback: 1 });
    let rose = 0;
    go(2.6, () => { ground(); rose = Math.max(rose, headY()); });
    out(`   death on the ground: head ${lyingHead.toFixed(2)} m up as the blow lands, ${rose.toFixed(2)} m at most after; joints: deepest ${(sunk * 100).toFixed(1)} cm under the grass (${sunkAt || 'none'})`);
    assert(p.state === 'dead' && p.deadDown && A.key === 'deadDown' && rose < 0.6, `killed lying down he stays down (clip ${A.key}; his head never rises past ${rose.toFixed(2)} m, it stood up to 1.4 m)`);
    assert(sunk < 0.02, `no knee or elbow sinks into the grass through the reactions and both deaths (deepest ${(sunk * 100).toFixed(1)} cm: ${sunkAt || 'none'})`);
    p.lean.on = true;
  }
  return G;
}

// ================================================================== hero look helpers (HEROLOOK, LOOKS)
// Signed depth (m, > 0 inside) of a joint-local point in an ellipsoid / a tapered capsule down −Y /
// the torso shell (BODY.shell rings at world idle heights, in spine space; `grow`: every ring that
// much bigger, an armour plate's offset)
function heroShapes(BODY, D) {
  const restSpine = D.pivot + 0.015 + D.pelvis[1] + D.spine[1];
  const ell = (q, c, rr) => {
    const k = Math.hypot((q.x - c[0]) / rr[0], (q.y - c[1]) / rr[1], (q.z - c[2]) / rr[2]);
    return k > 1e-6 ? Math.hypot(q.x - c[0], q.y - c[1], q.z - c[2]) * (1 / k - 1) : 1;
  };
  const cap = (q, y0, len, r0, r1) => {
    const t = clamp((y0 - q.y) / len, 0, 1);
    return r0 + (r1 - r0) * t - Math.hypot(q.x, q.y - (y0 - t * len), q.z);
  };
  const shell = (q, grow = 0) => {
    const R = BODY.shell, h = q.y + restSpine;
    if (h < R[0].y || h > R[R.length - 1].y) return -1;
    let k = 0;
    while (k < R.length - 2 && R[k + 1].y < h) k++;
    const A = R[k], B = R[k + 1], u = (h - A.y) / (B.y - A.y);
    const rx = A.rx + (B.rx - A.rx) * u + grow, rz = A.rz + (B.rz - A.rz) * u + grow, cz = (A.cz ?? 0) + ((B.cz ?? 0) - (A.cz ?? 0)) * u;
    const qq = Math.hypot(q.x / rx, (q.z - cz) / rz);
    return qq > 1e-6 ? Math.hypot(q.x, q.z - cz) * (1 / qq - 1) : 1;
  };
  return { ell, cap, shell, restSpine };
}

// A coat segment's sheet hangs −Y from its joint, curved round the hips (radius r0 + 0.25 × depth):
// the blade (0.16 m … `tip` along it) crosses it where its side of the sheet flips inside the
// sheet's span. v, w: scratch Vector3s
function coatCrossOf(r, tip, sheetOffset, v, w) {
  for (const C of r.coat) {
    const P = C.def;
    if (P.flap) continue;
    for (let s = 0; s < 2; s++) {
      const len = P.len[s] + 0.02, Rt = C.r0 + (s ? 0.25 * P.len[0] : 0);
      let pf = 0, pin = false;
      for (let z = 0.16; z <= tip + 1e-6; z += 0.03) {
        C.segs[s].worldToLocal(w.copy(v.set(0, 0, z).applyMatrix4(r.sword.matrixWorld)));
        const t = -w.y / len, R = Rt + 0.25 * clamp(t, 0, 1) * len;
        const u = Math.asin(clamp(w.x / R, -1, 1)) * R;
        const f = w.z - (Math.cos(u / R) - 1) * R;
        const wt = P.w[s] + (P.w[s + 1] - P.w[s]) * clamp(t, 0, 1);
        const inside = t >= 0 && t <= 1 && Math.abs(u - sheetOffset(wt, P.w[0], P.skew ?? 0)) <= 0.5 * wt;
        if (inside && pin && Math.sign(f) !== Math.sign(pf)) return true;
        pf = f;
        pin = inside;
      }
    }
  }
  return false;
}

// HEROLOOK's drive: a run, a sprint, strafes and a backpedal, a stop, a roll, the chain with each
// look of its hits, the sprint slash, the roll cut, the charged cleave and a block. `go(s)` steps the
// sim; `mark(phase)` is called before each part ('run', 'sprint', 'strafe', 'roll', 'chain',
// 'sprintSlash', 'rollCut', 'charge', 'release', 'block')
function heroRoute(G, go, mark = () => {}) {
  const { input } = G, p = G.game.player;
  mark('run');
  input.axis = { x: 0, y: 1 };
  go(1.2);
  mark('sprint');
  input.hold('ShiftLeft');
  go(1.0);
  input.release('ShiftLeft');
  mark('strafe');
  for (const [x, y] of [[1, 0], [0, -1], [-1, 0], [0, 0]]) {
    input.axis = { x, y };
    go(1.0);
  }
  mark('roll');
  input.axis = { x: 0, y: 1 };
  go(0.3);
  input.tap('Space');
  go(0.9);
  input.axis = { x: 0, y: 0 };
  go(0.5);
  // the chain, once with each look of its hits (combat.js `variants`: forced, clamped per hit)
  mark('chain');
  for (let look = 0; look < 3; look++) {
    p.anim.forceVariant = look;
    for (let k = 0; k < 5; k++) {
      input.click(0);
      go(k === 4 ? 0.9 : CHAIN_EVERY);
    }
    go(0.8);
  }
  p.anim.forceVariant = null;
  // the sprint slash and the roll cut
  mark('sprintSlash');
  input.axis = { x: 0, y: 1 };
  input.hold('ShiftLeft');
  go(0.8);
  input.click(0);
  input.release('ShiftLeft');
  input.axis = { x: 0, y: 0 };
  go(1.0);
  mark('rollCut');
  input.axis = { x: 0, y: 1 };
  go(0.3);
  input.tap('Space');
  go(0.35);
  input.axis = { x: 0, y: 0 };
  input.click(0);
  go(1.0);
  mark('charge');
  input.press(2);
  go(1.4);
  mark('release');
  input.up(2);
  go(1.0);
  mark('block');
  input.press(1);
  go(0.8);
  input.up(1);
  go(0.6);
}

// ================================================================== scenario: hero look (athletic build)
// The athletic build (model.js BODY, ADR-040) and the steel kept out of his body and his coat. Through a run, a
// sprint, strafes and a backpedal, stops, a roll, the light combo + slam (every look of every hit), the charged cleave and a
// block, the DRAWN blade (to DIM.drawnTip) never sinks > 2 cm into a body part (BODY's primitives
// in each joint's frame) and passes through a coat panel's sheet on only a few of the moving frames
// (round 2: ~14 % of the run / sprint / strafe / turn frames). The game-camera depth pull
// (heroArt.pull) is gone, so the blade is depth-tested like his body.
async function scenarioHeroLook() {
  out('\n== scenario HEROLOOK (athletic build; the blade stays out of his body and his coat; no depth pull) ==');
  const { BODY, sheetOffset } = await imp('src/entities/player/model.js');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const p = game.player, r = p.rig, d = game.dragon, D = HERO_DIM;
  p.debug.god = true;
  p.debug.teleport(d.position.x + 14, d.position.z + 14);
  // the athletic build (ADR-040): between ADR-034's lean build (a 0.34 m chest, 0.07 m thighs: "a bit
  // too lanky") and round 3's broad one (a 0.50 m chest, 0.098 m thighs: a cloaked trapezoid). Still a
  // V to a belted waist; limbs with some weight
  const chest = Math.max(...BODY.shell.map((s) => s.rx)) * 2, waist = BODY.shell[1].rx * 2;
  assert(chest >= 0.37 && chest <= 0.44 && waist >= 0.25 && waist <= 0.3 && chest / waist >= 1.35 && D.shoulder[0] >= 0.17 && D.shoulder[0] <= 0.2
    && BODY.upperArm[0] >= 0.06 && BODY.upperArm[0] <= 0.075 && BODY.thigh[0] >= 0.08 && BODY.thigh[0] <= 0.095,
    `athletic build: chest ${chest.toFixed(2)} m over a ${waist.toFixed(2)} m waist, shoulders ±${D.shoulder[0]} m, upper arm r ${BODY.upperArm[0]}, thigh r ${BODY.thigh[0]}`);
  assert(r.mats.every((m) => m.defines?.SG_HERO_PULL === undefined && !m.uniforms.uArtPull), 'no hero material is drawn nearer the camera than it is (the blade is depth-tested)');
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const { ell, cap, shell } = heroShapes(BODY, D);
  // (the sword arm's own forearm is left out: the blade's base sits in the gauntlet; the free
  // forearm only to the wrist: the free hand braces the flat in the block)
  const parts = [
    ['torso', r.spine, shell],
    ['hips', r.pelvis, (q) => ell(q, BODY.hips.c, BODY.hips.r)],
    ['head', r.head, (q) => ell(q, BODY.head.c, BODY.head.r)],
    ['right upper arm', r.arms.R.upper, (q) => cap(q, 0, D.upperArm, BODY.upperArm[0], BODY.upperArm[1])],
    ['left upper arm', r.arms.L.upper, (q) => cap(q, 0, D.upperArm, BODY.upperArm[0], BODY.upperArm[1])],
    ['left forearm', r.arms.L.fore, (q) => cap(q, 0, D.foreArm - 0.06, BODY.foreArm[0], BODY.foreArm[1])],
    // the free hand off the grip (wrist space: the palm and the sword fingers hang 0.20 m down it)
    ['left hand', r.arms.L.wrist, (q) => cap(q, 0, 0.2, 0.035, 0.02)],
    ...['R', 'L'].flatMap((s) => [
      [`thigh ${s}`, r.legs[s].thigh, (q) => cap(q, 0, D.thigh, BODY.thigh[0], BODY.thigh[1])],
      [`shin ${s}`, r.legs[s].shin, (q) => cap(q, -0.02, D.shin - 0.04, BODY.shin[0], BODY.shin[1])],
    ]),
  ];
  const tip = D.drawnTip ?? D.steelTip;
  let worst = -1, worstAt = '', hand = -1, handAt = '';
  const bodyPen = () => {
    for (let z = 0.2; z <= tip + 1e-6; z += 0.05) {
      v.set(0, 0, z).applyMatrix4(r.sword.matrixWorld);
      for (const [name, J, f] of parts) {
        if (name === 'left hand' && (p.anim.cur[45] > 0.05 || !J)) continue; // (on the grip it holds the steel)
        const pen = f(J.worldToLocal(w.copy(v)));
        if (name === 'left hand' && pen > hand) {
          hand = pen;
          handAt = `${p.state}${p.atk?.def ? ' ' + p.atk.def.kind + (p.atk.def.combo ?? '') : ''} t ${(p.atk?.t ?? p.stateT ?? 0).toFixed(2)}`;
        }
        if (pen > worst) {
          worst = pen;
          worstAt = `${name}, ${p.state}${p.atk?.def ? ' ' + p.atk.def.kind + (p.atk.def.combo ?? '') : ''} t ${(p.atk?.t ?? p.stateT ?? 0).toFixed(2)}`;
        }
      }
    }
  };
  const coatCross = () => coatCrossOf(r, tip, sheetOffset, v, w);
  let frames = 0, cross = 0, locoFrames = 0, locoCross = 0;
  const LOCO = new Set(['idle', 'run', 'sprint']);
  const go = (s) => {
    for (let i = 0, n = Math.round(s / DT); i < n; i++) {
      G.tick(DT);
      frames++;
      bodyPen();
      const c = coatCross();
      if (c) cross++;
      if (LOCO.has(p.state)) {
        locoFrames++;
        if (c) locoCross++;
      }
    }
  };
  input.axis = { x: 0, y: 1 };
  go(1.2);
  input.hold('ShiftLeft');
  go(1.0);
  input.release('ShiftLeft');
  for (const [x, y] of [[1, 0], [0, -1], [-1, 0], [0, 0]]) {
    input.axis = { x, y };
    go(1.0);
  }
  input.axis = { x: 0, y: 1 };
  go(0.3);
  input.tap('Space');
  go(0.9);
  input.axis = { x: 0, y: 0 };
  go(0.5);
  // the chain, once with each look of its hits (combat.js `variants`: forced, clamped per hit)
  for (let look = 0; look < 3; look++) {
    p.anim.forceVariant = look;
    for (let k = 0; k < 5; k++) {
      input.click(0);
      go(k === 4 ? 0.9 : CHAIN_EVERY);
    }
    go(0.8);
  }
  // … and again 2.5 m from the wyrm, landing: the edge's bite (anim.js BITE) holds the blade where
  // it bit and folds the body into the blow through every freeze. Then the heavier bites: the
  // charged cleave (its upright two-handed blade stands before his face) landing from 2.0-3.6 m, and
  // the sprint slash run in from 7-8 m
  let landed = 0;
  const kinds = {};
  G.watch = (n, e) => { if (n === 'player:hitDragon' && !e.guarded) { landed++; const k = p.atk?.def?.name ?? e.kind; kinds[k] = (kinds[k] ?? 0) + 1; } };
  for (let look = 0; look < 3; look++) {
    p.anim.forceVariant = look;
    place(G, 2.5);
    d.hp = d.maxHp;
    d.posture = 0;
    for (let k = 0; k < 5; k++) {
      aimAt(G);
      input.click(0);
      go(k === 4 ? 0.9 : CHAIN_EVERY);
    }
    go(0.8);
  }
  p.anim.forceVariant = null;
  const chainLanded = landed;
  for (let rep = 0; rep < 3; rep++) {
    place(G, 2.0 + rep * 0.8);
    d.hp = d.maxHp;
    d.posture = 0;
    go(0.4);
    input.press(2);
    go(0.6 + rep * 0.4);
    input.up(2);
    go(1.4);
  }
  for (let rep = 0; rep < 2; rep++) {
    place(G, 7 + rep);
    d.hp = d.maxHp;
    d.posture = 0;
    go(0.3);
    input.axis = toward(G); // (the stick is world-fixed: y = north)
    input.hold('ShiftLeft');
    aimAt(G);
    go(0.5);
    input.click(0);
    input.release('ShiftLeft');
    input.axis = { x: 0, y: 0 };
    go(1.2);
  }
  G.watch = null;
  p.debug.teleport(d.position.x + 14, d.position.z + 14);
  go(0.3);
  out(`   near the wyrm: ${chainLanded} landed hits through the chain; then ${JSON.stringify(kinds)}`);
  assert(chainLanded >= 10 && (kinds.cleave ?? 0) >= 2 && (kinds.sprintSlash ?? 0) >= 1, `the chain swung 2.5 m from the wyrm lands (${chainLanded} hits; ≥ 10), and so do the charged cleave (${kinds.cleave ?? 0}; ≥ 2) and the sprint slash (${kinds.sprintSlash ?? 0}; ≥ 1)`);
  // the sprint slash and the roll cut
  input.axis = { x: 0, y: 1 };
  input.hold('ShiftLeft');
  go(0.8);
  input.click(0);
  input.release('ShiftLeft');
  input.axis = { x: 0, y: 0 };
  go(1.0);
  input.axis = { x: 0, y: 1 };
  go(0.3);
  input.tap('Space');
  go(0.35);
  input.axis = { x: 0, y: 0 };
  input.click(0);
  go(1.0);
  input.press(2);
  go(1.4);
  input.up(2);
  go(1.0);
  input.press(1);
  go(0.8);
  input.up(1);
  go(0.6);
  assert(worst < 0.02, `the drawn blade never sinks > 2 cm into his body (${frames} frames; deepest ${(worst * 100).toFixed(1)} cm: ${worstAt}; into the free hand off the grip ${(hand * 100).toFixed(1)} cm: ${handAt})`);
  assert(locoCross <= Math.max(3, locoFrames * 0.05), `the blade passes through a coat panel on ${locoCross} of ${locoFrames} run / sprint / idle frames (≤ 5 %; ${cross} of ${frames} over every move)`);
  return G;
}

// ================================================================== scenario: the free hand
// The hero's free hand (sword fingers on a wrist of its own): the rig's contract; a wrist that turns
// inside a human range without snapping; the fingers kept out of his own body; the fist shown only on
// the grip; the fingers on the sword wrist where a clip rests them there; a choreography that is not
// one template (the finishes spread round him, the hand most of the way there at contact); the free
// elbow bent on the grip; the drink; the idle breath; a NaN in the pose; no Math.random in the wrist.
async function scenarioHeroHand() {
  out('\n== scenario HEROHAND (the free hand: the wrist, sword fingers, the fist on arrival, the choreography) ==');
  const { DIM: HD, BODY } = await imp('src/entities/player/model.js');
  const { P, N, WRIST_L, OFF_SNAP, HeroAnimator } = await imp('src/entities/player/anim.js');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const p = game.player, d = game.dragon, r = p.rig, A = p.anim, H = r.offHand, W = r.arms.L.wrist;
  p.debug.god = true;
  p.debug.teleport(d.position.x + 14, d.position.z + 14);
  const go = (s, each) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) { G.tick(DT); each?.(); } };
  go(0.5);
  const DEG = 180 / Math.PI;

  // (H1) the contract
  assert(W?.parent === r.arms.L.fore && Math.abs(W.position.y + (HD.foreArm - 0.03)) < 1e-6 && Math.hypot(W.position.x, W.position.z) < 1e-9 && r.arms.L.point?.parent === W
    && !!H?.fingers && H.fingers.parent === W && H.open.parent === W && H.grip.parent === r.sword
    && P.lD === 53 && P.lN === 56 && P.hs === 59 && P.lk === 60 && N === 61 && N <= 64 && A.freeHand === true && OFF_SNAP[0] < OFF_SNAP[1],
    `the free hand's contract: arms.L.wrist on the forearm ${(HD.foreArm - 0.03).toFixed(2)} m down and arms.L.point on it; offHand { open, grip, fingers }, open and fingers on the wrist; channels lD 53, lN 56, hs 59, lk 60 (N ${N} ≤ 64); the hero's animator has the free hand`);

  // every frame of the set: chest-local points (model metres: the drawn hero is lean-sheared and scaled)
  const { ell, cap, shell } = heroShapes(BODY, HD);
  const gauges = [
    ['torso', r.spine, shell],
    ['hips', r.pelvis, (q) => ell(q, BODY.hips.c, BODY.hips.r)],
    ['head', r.head, (q) => ell(q, BODY.head.c, BODY.head.r.map((x) => x + 0.03))], // (+ the hood)
    ['right forearm', r.arms.R.fore, (q) => cap(q, 0, HD.foreArm - 0.06, BODY.foreArm[0], BODY.foreArm[1])],
  ];
  const v = new THREE.Vector3(), w = new THREE.Vector3(), pt = new THREE.Vector3(), q0 = new THREE.Quaternion(), inv = new THREE.Matrix4();
  const toChest = (J, x, y, z, o) => r.chest.worldToLocal(o.set(x, y, z).applyMatrix4(J.matrixWorld));
  const handC = (o) => toChest(r.arms.L.fore, 0, -HD.foreArm, 0, o); // the IK end (in the palm), chest local
  const offGap = () => handC(v).distanceTo(toChest(r.sword, 0, 0, -HD.offGrip, w));
  const clipOf = () => {
    const a = p.atk, def = a?.def;
    if (!def || (p.state !== 'attack' && p.state !== 'heavy')) return null;
    return (A.atkDef === def && A.atkAnim ? A.atkAnim : def.anim)?.clip ?? null;
  };
  const where = () => `${p.state}${clipOf() ? ' ' + clipOf() : ''} t ${(p.atk?.def ? p.atk.t : A.t).toFixed(2)}`;
  const segOf = () => (p.state === 'attack' && p.atk?.def?.kind === 'slam' ? 'slam' : p.state === 'heavy' ? 'cleave' : p.state === 'charge' || p.state === 'block' ? p.state : null);
  let qOk = false, turn = 0, turnAt = '', bad = 0, badAt = '', pen = -1, penAt = '', frames = 0, notOne = 0, notOneAt = '';
  let fistFar = 0, fistFarAt = '', fistFar2 = 0, fistFar2At = '', fistN = 0, fing2 = 0, fing2At = '';
  let lkN = 0, lkGap = 0, lkGapAt = '', lockN = 0, lockMin = Infinity, lockMinAt = '';
  const flips = {}; // segment → the most grip swaps in one of its occurrences
  let seg = null, segFlips = 0, gripWas = false;
  // the looks: the IK end (chest local) at the coil (t = W), contact (W + 0.45 A) and the finish (W + A),
  // the free arm's turn per frame (body frame), the tightest elbow and the frames the wrist was clamped
  const looks = {}, order = [];
  const dir = [0, 1].map(() => new THREE.Vector3()), dirWas = [0, 1].map(() => new THREE.Vector3());
  let lastAtk = null, mk = {};
  const each = () => {
    frames++;
    // (H2) the wrist's own turn on the forearm in one frame
    const ft = qOk ? 2 * Math.acos(Math.min(1, Math.abs(W.quaternion.dot(q0)))) * DEG : 0;
    if (ft > turn) { turn = ft; turnAt = where(); }
    q0.copy(W.quaternion);
    qOk = true;
    // (H3) inside its range (± 3°): a regression guard on _wristL's own clamp (it bounds the spring
    // at the range ± 0.05 rad, 2.9°), so it fails only if that clamp goes
    const e = W.rotation, m = 3 / DEG, L = WRIST_L;
    if (e.x < L.rad - m || e.x > L.uln + m || e.y < L.pro - m || e.y > L.sup + m || e.z < L.flex - m || e.z > L.ext + m) {
      bad++;
      badAt ||= `${where()}: dev ${(e.x * DEG).toFixed(0)}° twist ${(e.y * DEG).toFixed(0)}° flex ${(e.z * DEG).toFixed(0)}°`;
    }
    // (H4) one-handed: the fingertip and the palm out of his torso, hips, head (and hood) and sword forearm
    if (A.cur[P.twoHand] < 0.05) {
      for (const tip of [false, true]) {
        if (tip) pt.setFromMatrixPosition(r.arms.L.point.matrixWorld);
        else pt.set(0, -HD.foreArm, 0).applyMatrix4(r.arms.L.fore.matrixWorld);
        for (const [name, J, f] of gauges) {
          const g = f(J.worldToLocal(w.copy(pt)));
          if (g > pen) { pen = g; penAt = `${tip ? 'the fingertip' : 'the palm'} in the ${name}, ${where()}`; }
        }
      }
    }
    // (H5) one hand shown; the fist only on its place (fully two-handed, a fist already shown holds
    // to OFF_SNAP[2]); never the sword fingers on the hilt; few swaps per heavy blow, charge, block
    const shown = +H.open.visible + +H.fingers.visible + +H.grip.visible;
    if (shown !== 1) { notOne++; notOneAt ||= where(); }
    const two2 = A.cur[P.twoHand] >= 0.95;
    if (H.grip.visible) {
      fistN++;
      const g = offGap();
      if (!two2 && g > fistFar) { fistFar = g; fistFarAt = where(); }
      if (two2 && g > fistFar2) { fistFar2 = g; fistFar2At = where(); }
    }
    if (two2 && H.fingers.visible) { fing2++; fing2At ||= where(); }
    const sg = segOf();
    if (sg !== seg) {
      seg = sg;
      segFlips = 0;
    } else if (sg && H.grip.visible !== gripWas) {
      segFlips++;
      flips[sg] = Math.max(flips[sg] ?? 0, segFlips);
    }
    if (sg && !(sg in flips)) flips[sg] = 0;
    gripWas = H.grip.visible;
    // (H6) on the sword wrist
    if (A.lkEff >= 0.9) {
      lkN++;
      const g = handC(v).distanceTo(toChest(r.arms.R.fore, 0, -(HD.foreArm - 0.07), 0, w));
      if (g > lkGap) { lkGap = g; lkGapAt = where(); }
    }
    // (H9) the free elbow on the grip
    if (A.cur[P.twoHand] > 0.5) {
      lockN++;
      const b = -r.arms.L.fore.rotation.x;
      if (b < lockMin) { lockMin = b; lockMinAt = where(); }
    }
    // the looks
    const clip = clipOf(), a = p.atk;
    inv.copy(r.body.matrixWorld).invert();
    v.setFromMatrixPosition(r.arms.L.upper.matrixWorld).applyMatrix4(inv);
    w.setFromMatrixPosition(r.arms.L.fore.matrixWorld).applyMatrix4(inv);
    dir[0].subVectors(w, v).normalize();
    pt.set(0, -HD.foreArm, 0).applyMatrix4(r.arms.L.fore.matrixWorld).applyMatrix4(inv);
    dir[1].subVectors(pt, w).normalize();
    const one = !!clip && clip !== 'slam' && clip !== 'cleave';
    if (one) {
      const S = looks[clip] ?? (looks[clip] = (order.push(clip), { up: 0, fore: 0, wrist: 0, elbow: 180, clamped: 0, n: 0, coil: null, hit: null, end: null, prog: 0 }));
      if (a === lastAtk) {
        S.up = Math.max(S.up, Math.acos(clamp(dir[0].dot(dirWas[0]), -1, 1)) * DEG);
        S.fore = Math.max(S.fore, Math.acos(clamp(dir[1].dot(dirWas[1]), -1, 1)) * DEG);
      } else mk = {};
      S.n++;
      S.wrist = Math.max(S.wrist, ft);
      S.elbow = Math.min(S.elbow, 180 + r.arms.L.fore.rotation.x * DEG);
      if (A.wristL.clamped) S.clamped++;
      const def = a.def, t = a.t;
      for (const [k, at] of [['coil', def.windup], ['hit', def.windup + def.active * 0.45], ['end', def.windup + def.active]]) {
        if (!mk[k] && t >= at) {
          mk[k] = true;
          if (!S[k]) S[k] = handC(new THREE.Vector3());
        }
      }
    }
    for (let k = 0; k < 2; k++) dirWas[k].copy(dir[k]);
    lastAtk = one ? a : null;
  };
  const eachLook = each;

  // the set: three looks of a mashed chain, the sprint slash, the roll cut, the charge and the
  // cleave, the block raised, held and lowered
  for (let look = 0; look < 3; look++) {
    A.forceVariant = look;
    for (let k = 0; k < 5; k++) { input.click(0); go(k === 4 ? 0.9 : CHAIN_EVERY, eachLook); }
    go(1.0, eachLook);
  }
  A.forceVariant = null;
  input.axis = { x: 0, y: 1 };
  input.hold('ShiftLeft');
  go(0.9, eachLook);
  input.click(0);
  input.release('ShiftLeft');
  input.axis = { x: 0, y: 0 };
  go(0.9, eachLook);
  input.axis = { x: 0, y: 1 };
  go(0.3, eachLook);
  input.tap('Space');
  go(0.35, eachLook);
  input.axis = { x: 0, y: 0 };
  input.click(0);
  go(0.9, eachLook);
  input.press(2);
  go(1.4, eachLook);
  input.up(2);
  go(1.2, eachLook);
  input.press(1);
  go(0.6, eachLook);
  input.up(1);
  go(0.6, eachLook);

  for (const c of order) {
    const S = looks[c];
    const tot = S.coil && S.end ? S.end.distanceTo(S.coil) : 0;
    S.prog = tot > 1e-3 && S.hit ? S.hit.distanceTo(S.coil) / tot : 0;
    out(`   ${c}: upper/fore/wrist ${S.up.toFixed(0)}/${S.fore.toFixed(0)}/${S.wrist.toFixed(0)}°/f, elbow ≥ ${S.elbow.toFixed(0)}°, contact ${(S.prog * 100).toFixed(0)} %, finish chest ${S.end ? `(${S.end.x.toFixed(2)} ${S.end.y.toFixed(2)} ${S.end.z.toFixed(2)})` : '-'}, wrist clamped ${S.clamped} of ${S.n} f`);
  }
  assert(turn <= 40, `the wrist turns at most ${turn.toFixed(0)}° on the forearm in a frame (≤ 40°; ${turnAt}; ${frames} frames)`);
  assert(bad === 0, `the wrist stays in its range (radial ${(WRIST_L.rad * DEG).toFixed(0)}° … ulnar ${(WRIST_L.uln * DEG).toFixed(0)}°, twist ±${(WRIST_L.sup * DEG).toFixed(0)}°, flex ${(WRIST_L.flex * DEG).toFixed(0)}° … ${(WRIST_L.ext * DEG).toFixed(0)}°, ± 3°): ${bad} frames out${badAt ? ` (${badAt})` : ''}`);
  assert(pen <= 0.015, `one-handed, the sword fingers and the palm sink at most ${(pen * 100).toFixed(1)} cm into his torso, hips, head or sword forearm (≤ 1.5 cm; ${penAt})`);
  assert(notOne === 0 && fistN > 0 && fistFar <= OFF_SNAP[1] + 1e-3 && fistFar2 <= OFF_SNAP[2] + 1e-3, `one free hand shows at a time (${notOne} frames not${notOneAt ? `: ${notOneAt}` : ''}), and the fist only on the grip: ≤ ${(fistFar * 100).toFixed(1)} cm from its place (≤ ${OFF_SNAP[1] * 100} cm; ${fistN} frames${fistFarAt ? `, ${fistFarAt}` : ''}), fully two-handed ≤ ${(fistFar2 * 100).toFixed(1)} cm (≤ ${OFF_SNAP[2] * 100} cm${fistFar2At ? `, ${fistFar2At}` : ''})`);
  assert(fing2 === 0, `never the sword fingers while fully two-handed (twoHand ≥ 0.95): ${fing2} frames${fing2At ? ` (${fing2At})` : ''}`);
  assert(['slam', 'cleave', 'charge', 'block'].every((k) => k in flips) && Object.values(flips).every((n) => n <= 2), `the fist shows and goes at most once per slam, cleave, charge and block (${Object.entries(flips).map(([k, n]) => `${k} ${n}`).join(', ')} swaps)`);
  assert(lkN > 0 && lkGap <= 0.08, `on the sword wrist (${lkN} frames) the free hand is within ${(lkGap * 100).toFixed(1)} cm of it (≤ 8 cm; ${lkGapAt})`);
  {
    const ends = order.map((c) => looks[c].end).filter(Boolean);
    const span = (k) => Math.max(...ends.map((e) => e[k])) - Math.min(...ends.map((e) => e[k]));
    assert(ends.length >= 13 && span('y') >= 0.4 && span('z') >= 0.4, `the finishes are not one template: across ${ends.length} looks the free hand ends ${span('y').toFixed(2)} m apart in height and ${span('z').toFixed(2)} m fore and aft (each ≥ 0.40, chest frame)`);
    // (by design: tucked through the turn; converging on the point; the heavy branches are two-handed)
    const EXEMPT = new Set(['whirl', 'risingWhirl', 'risingThrust', 'heavyThrust', 'heavyRise', 'heavySpin', 'heavyCrush']);
    const late = order.filter((c) => !EXEMPT.has(c) && !(looks[c].prog >= 0.45));
    assert(order.filter((c) => !EXEMPT.has(c)).length >= 10 && !late.length, `at contact the free hand is ≥ 45 % of the way from its coil to its finish in every look (${late.map((c) => `${c} ${(looks[c].prog * 100).toFixed(0)} %`).join(', ') || 'all'})`);
  }
  assert(lockN > 0 && lockMin >= 0.33, `on the grip the free elbow keeps a bend: ≥ ${(lockMin * DEG).toFixed(0)}° (≥ 19°: it locked straight in the cleave; ${lockN} frames, ${lockMinAt})`);

  // (H5b) the plunge and the execution: both fists on the hilt from the hang to the ride, the free
  // arm 4-6 cm short of it at the hang's apex; one hand shown, never the sword fingers on the hilt,
  // the fist held (≤ OFF_SNAP[2]) and at most one grab and one let-go each (the fist popped off at
  // the apex and the sword fingers showed: fist, fingers, fist in 5 frames)
  {
    let started = 0, n = 0, one = 0, fing = 0, fingAt = '', far = 0, farAt = '', worst = 0, phases = new Set();
    for (const exec of [false, true]) {
      started += +!!p.debug.plunge(exec);
      let swaps = 0, was = H.grip.visible;
      go(3.5, () => {
        if (p.state !== 'plunge') return;
        n++;
        phases.add(p.pl.phase);
        const at = `${exec ? 'execution' : 'plunge'} phase ${p.pl.phase}`;
        if (+H.open.visible + +H.fingers.visible + +H.grip.visible !== 1) one++;
        if (A.cur[P.twoHand] > 0.95 && H.fingers.visible) { fing++; fingAt ||= at; }
        if (H.grip.visible) {
          const g = offGap();
          if (g > far) { far = g; farAt = at; }
        }
        if (H.grip.visible !== was) swaps++;
        was = H.grip.visible;
      });
      worst = Math.max(worst, swaps);
      p.debug.teleport(d.position.x + 14, d.position.z + 14);
      go(0.5);
    }
    assert(started === 2 && n > 150 && [1, 2, 3, 4].every((ph) => phases.has(ph)) && one === 0 && fing === 0 && far <= OFF_SNAP[2] + 1e-3 && worst <= 2,
      `the plunge and the execution (${started} of 2 started, ${n} frames, phases ${[...phases].join('')}): one hand at a time (${one} frames not), never the sword fingers on the hilt (${fing} frames${fingAt ? `, ${fingAt}` : ''}), the fist ≤ ${(far * 100).toFixed(1)} cm from its place (≤ ${OFF_SNAP[2] * 100} cm${farAt ? `, ${farAt}` : ''}), ≤ ${worst} swaps each (≤ 2)`);
  }

  // (H10) the drink: the flask hangs on the forearm, so the hand opens and the wrist goes rigid
  {
    let n = 0, worst = 0, opened = true;
    go(0.6);
    input.tap('KeyF');
    go(1.1, () => {
      if (p.state !== 'heal' || A.t < 0.32 || A.t > 0.62) return;
      n++;
      worst = Math.max(worst, 2 * Math.acos(Math.min(1, Math.abs(W.quaternion.w))) * DEG);
      opened &&= !H.fingers.visible && H.open.visible;
    });
    assert(n > 10 && worst < 5 && opened, `drinking, the free hand is open and rigid on the forearm round the flask (wrist ≤ ${worst.toFixed(1)}°, < 5°; ${n} frames)`);
  }
  // (H11) the idle breath (the idle actions held off: the bare loop)
  {
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const wait0 = A.fidget.wait;
    A.fidget.wait = 1e9;
    go(1.2);
    go(2.4, () => { handC(v); lo.min(v); hi.max(v); });
    A.fidget.wait = wait0;
    const rg = Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z);
    assert(rg >= 0.005 && A.fidget.k < 0 && H.open.visible && !H.fingers.visible, `at rest the hand on the belt breathes with him: ${(rg * 100).toFixed(1)} cm through 2.4 s (≥ 0.5 cm, chest frame; it rests on the waist, which moves with the chest)`);
  }
  // (H12) a NaN in the free hand's channels never reaches the rig. update() resets a non-finite pose
  // to the guard before apply(), so the free hand's own guards are hit by calling apply() with a pose
  // past that check (the channels NaN, on the grip and off it), then by a NaN in the spring's state
  {
    const finiteRig = () => {
      let ok = true;
      p.object3d.traverse((ob) => { for (const x of ob.matrixWorld.elements) if (!Number.isFinite(x)) ok = false; });
      const q = W.quaternion, S = A.wristL;
      return ok && Number.isFinite(q.x + q.y + q.z + q.w + S.x + S.y + S.z + S.vx + S.vy + S.vz) && Number.isFinite(A.lkEff + A.gripGap);
    };
    const q = new Float32Array(N);
    let ok = true;
    for (const two of [0, 1]) {
      for (const ch of [P.lD, P.lD + 1, P.lN, P.lN + 2, P.hs, P.lk, -1]) {
        q.set(A.cur);
        q[P.twoHand] = two;
        if (ch < 0) for (let i = P.lD; i < N; i++) q[i] = NaN; // every one of them
        else q[ch] = NaN;
        A.apply(q);
        r.root.updateMatrixWorld(true);
        ok &&= finiteRig() && (+H.open.visible + +H.fingers.visible + +H.grip.visible === 1);
      }
    }
    A.wristL.vx = NaN;
    A.wristL.y = Infinity;
    go(DT);
    const reset = finiteRig();
    go(2 * DT);
    assert(ok && reset && finiteRig() && A.wristL.ok, 'a NaN in the free hand\'s pose channels (lD, lN, hs, lk; one-handed and on the grip) or in its wrist spring never reaches the rig (every matrix finite, one hand shown, the spring running again)');
  }
  // (H14) at 30 fps (a phone; iOS Low Power Mode; the Lab's TIME x2 on a 60 Hz screen): the wrist
  // settles at rest and never flips back and forth through a chain. One spring step a frame was
  // unstable below ~35 fps: a period-2 flip of ~30° every frame at rest, held only by the step cap
  {
    const D30 = 1 / 30;
    const go30 = (s, f) => { for (let i = 0, n = Math.round(s / D30); i < n; i++) { G.tick(D30); f?.(); } };
    // the idle actions held off (one running finishes first: its end re-arms the wait)
    const wait0 = A.fidget.wait;
    for (let i = 0; i < 400 && A.fidget.k >= 0; i++) G.tick(D30);
    A.fidget.wait = 1e9;
    const err = new THREE.Vector3(), errWas = new THREE.Vector3(), tgt = new THREE.Vector3(), tgtWas = new THREE.Vector3();
    let ok30 = false, rest = 0, restAt = '', chain = 0, chainAt = '', flips = 0, flipAt = '', frames30 = 0, idle = false;
    const step = (mode) => () => {
      const S = A.wristL;
      const ft = ok30 ? 2 * Math.acos(Math.min(1, Math.abs(W.quaternion.dot(q0)))) * DEG : 0;
      q0.copy(W.quaternion);
      tgt.set(S.tx, S.ty, S.tz);
      err.set(S.x, S.y, S.z).sub(tgt);
      if (ok30 && mode === 'rest' && ft > rest) { rest = ft; restAt = where(); }
      if (ok30 && mode !== 'rest') {
        frames30++;
        if (ft > chain) { chain = ft; chainAt = where(); }
        // the spring's own flip (period 2): on one axis it sits > 5° past a steady target (moved
        // < 2° this frame), then > 5° past it on the other side the next frame
        for (const k of ['x', 'y', 'z']) {
          if (err[k] * errWas[k] < 0 && Math.abs(err[k]) > 5 / DEG && Math.abs(errWas[k]) > 5 / DEG && Math.abs(tgt[k] - tgtWas[k]) < 2 / DEG) { flips++; flipAt ||= where(); break; }
        }
      }
      errWas.copy(err);
      tgtWas.copy(tgt);
      ok30 = true;
      idle ||= A.fidget.k >= 0;
    };
    go30(0.6, step('chain'));
    go30(2.0, step('rest'));
    const restBefore = rest, restBeforeAt = restAt;
    rest = 0;
    for (let k = 0; k < 5; k++) { input.click(0); go30(k === 4 ? 0.9 : CHAIN_EVERY, step('chain')); }
    go30(1.5, step('chain'));
    go30(1.5, step('rest'));
    A.fidget.wait = wait0;
    out(`   30 fps: the wrist at rest ≤ ${restBefore.toFixed(2)}° / ${rest.toFixed(2)}° a frame (before / after a chain); through the chain ≤ ${chain.toFixed(0)}° a frame (${chainAt}), ${flips} spring flips in ${frames30} frames${flipAt ? ` (first ${flipAt})` : ''}`);
    assert(!idle && restBefore < 2 && rest < 2, `at 30 fps the wrist settles at rest: ≤ ${Math.max(restBefore, rest).toFixed(2)}° a frame (< 2°; ${restBefore >= rest ? restBeforeAt : restAt}; one spring step a frame flipped it ~30° every frame; no idle action ran: ${!idle})`);
    assert(frames30 > 100 && chain <= 40 && flips === 0, `at 30 fps through a chain the wrist turns ≤ ${chain.toFixed(0)}° a frame (≤ 40°) and never flips back and forth across a steady target (${flips} frames in ${frames30}${flipAt ? `, ${flipAt}` : ''})`);
  }
  // (H13) the seeded sims replay: the wrist draws on no random stream
  assert(!HeroAnimator.prototype._wristL.toString().includes('Math.random'), 'the free wrist uses no Math.random (the sims are seeded)');
  return G;
}

// ================================================================== scenario: weight
// The body behind the blade (the weight spec): the root's step pushes off and brakes as the front
// foot plants; the hips lead the hand, the chest follows them. Measured far from the wyrm (no
// step-in assist) unless a part says otherwise. Points in the root's frame are model metres (the
// root's matrix carries the drawn scale and the camera lean: its inverse takes both out).
async function scenarioHeroWeight() {
  out('\n== scenario HEROWEIGHT (the step pushes and brakes at the plant; the hips lead the cut) ==');
  const { SWINGS } = await imp('src/entities/player/swings.js');
  const { P } = await imp('src/entities/player/anim.js');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const p = game.player, d = game.dragon, A = p.anim, r = p.rig, HD = HERO_DIM;
  p.debug.god = true;
  // 20 m from the wyrm, facing it (the assist reaches 4.8 m; a chain walks ~4 m)
  const far = () => { p.debug.teleport(d.position.x + 14, d.position.z + 14); p.yaw = Math.atan2(d.position.x - p.position.x, d.position.z - p.position.z); aimAt(G); };
  far();
  const go = (s, each) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) { G.tick(DT); each?.(); } };
  go(0.5);
  const DEG = 180 / Math.PI;
  // a boot's lowest point above the grass (m): its foot ellipsoid (model.js BODY.foot), sampled
  const { BODY: HB } = await imp('src/entities/player/model.js');
  const soleOf = (foot) => {
    const Fo = HB.foot, q = new THREE.Vector3();
    let m = Infinity;
    for (let a = 0; a < 24; a++) {
      for (let b = 1; b < 12; b++) {
        const th = (a / 24) * Math.PI * 2, ph = (b / 12) * Math.PI;
        q.set(Fo.c[0] + Fo.r[0] * Math.sin(ph) * Math.cos(th), Fo.c[1] + Fo.r[1] * Math.cos(ph), Fo.c[2] + Fo.r[2] * Math.sin(ph) * Math.sin(th)).applyMatrix4(foot.matrixWorld);
        m = Math.min(m, q.y);
      }
    }
    return m - p.position.y;
  };
  const L10 = ['fallingCut', 'drawCut', 'risingSlash', 'risingBackhand', 'flatBackhand', 'fallingBackhand', 'lowSweep', 'lunge', 'risingThrust', 'rollCut'];
  const wrapA = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const inv = new THREE.Matrix4(), invB = new THREE.Matrix4(), invP = new THREE.Matrix4(), v = new THREE.Vector3(), w = new THREE.Vector3();
  // a joint's facing (its local +z) in the root's frame, as a yaw
  const yawIn = (J) => { v.setFromMatrixPosition(J.matrixWorld).applyMatrix4(inv); w.set(0, 0, 1).applyMatrix4(J.matrixWorld).applyMatrix4(inv).sub(v); return Math.atan2(w.x, w.z); };
  const clipOf = () => { const a = p.atk, def = a?.def; if (!def || (p.state !== 'attack' && p.state !== 'heavy')) return null; return (A.atkDef === def && A.atkAnim ? A.atkAnim : def.anim)?.clip ?? null; };
  // one frame of the hero (after a tick): the hips' and chest's turn, the sword hand and the tip,
  // the hips' height, the four arm segments (body frame), the feet (world and pose), the attack clock
  let prevF = null;
  const frame = () => {
    inv.copy(r.root.matrixWorld).invert();
    invB.copy(r.body.matrixWorld).invert();
    const a = p.atk;
    const F = {
      t: a?.t ?? 0, dt: game.dt, state: p.state, atk: a, pending: !!a?.pending, clip: clipOf(),
      pel: yawIn(r.pelvis), ch: yawIn(r.chest),
      hand: new THREE.Vector3(0, -HD.foreArm, 0).applyMatrix4(r.arms.R.fore.matrixWorld).applyMatrix4(inv),
      tip: new THREE.Vector3(0, 0, 0.9).applyMatrix4(r.sword.matrixWorld).applyMatrix4(inv),
      hipY: v.setFromMatrixPosition(r.pelvis.matrixWorld).applyMatrix4(inv).y,
      arms: [],
      feet: [r.legs.R.foot, r.legs.L.foot].map((f) => new THREE.Vector3().setFromMatrixPosition(f.matrixWorld)),
      cur: A.cur.slice(), stepL: A.stepL,
      drag: A.footDrag, fo: { ...A.follow },
    };
    for (const arm of [r.arms.R, r.arms.L]) {
      const e0 = new THREE.Vector3().setFromMatrixPosition(arm.upper.matrixWorld).applyMatrix4(invB);
      const e1 = new THREE.Vector3().setFromMatrixPosition(arm.fore.matrixWorld).applyMatrix4(invB);
      const e2 = new THREE.Vector3(0, -HD.foreArm, 0).applyMatrix4(arm.fore.matrixWorld).applyMatrix4(invB);
      F.arms.push(e1.clone().sub(e0).normalize(), e2.sub(e1).normalize());
    }
    // the thighs and shins in the pelvis's frame (a leg turning with the hips does not count)
    invP.copy(r.pelvis.matrixWorld).invert();
    F.legs = [];
    for (const L of [r.legs.R, r.legs.L]) {
      const k0 = new THREE.Vector3().setFromMatrixPosition(L.thigh.matrixWorld).applyMatrix4(invP);
      const k1 = new THREE.Vector3().setFromMatrixPosition(L.shin.matrixWorld).applyMatrix4(invP);
      const k2 = new THREE.Vector3().setFromMatrixPosition(L.foot.matrixWorld).applyMatrix4(invP);
      F.legs.push(k1.clone().sub(k0).normalize(), k2.sub(k1).normalize());
    }
    // steps from the frame before (hitstop frames are flagged: a freeze frame's tiny dt fakes speeds)
    const P0 = prevF;
    F.real = F.dt >= 0.005;
    F.dPel = P0 ? wrapA(F.pel - P0.pel) : 0;
    F.dCh = P0 ? wrapA(F.ch - P0.ch) : 0;
    F.dHand = P0 ? F.hand.distanceTo(P0.hand) : 0;
    F.arm = P0 ? Math.max(...F.arms.map((u, k) => Math.acos(clamp(u.dot(P0.arms[k]), -1, 1)) * DEG)) : 0;
    F.leg = P0 ? Math.max(...F.legs.map((u, k) => Math.acos(clamp(u.dot(P0.legs[k]), -1, 1)) * DEG)) : 0;
    prevF = F;
    return F;
  };
  // the swings sampled: { clip, def, atk, frames } per attack (its first frame: the one after the
  // tick that started it; a held light only once released)
  const swings = [];
  let curS = null;
  const record = () => {
    const F = frame(), a = F.atk;
    if (!F.clip || F.pending) { if (!a || (p.state !== 'attack' && p.state !== 'heavy')) curS = null; return F; }
    if (!curS || curS.atk !== a) swings.push((curS = { clip: F.clip, def: a.def, atk: a, frames: [] }));
    curS.frames.push(F);
    return F;
  };
  const chains = () => {
    for (let look = 0; look < 3; look++) {
      far();
      go(0.6, record);
      A.forceVariant = look;
      for (let k = 0; k < 5; k++) { input.click(0); go(k === 4 ? 0.9 : CHAIN_EVERY, record); }
      go(0.6, record);
    }
    A.forceVariant = null;
    // the roll cut
    far();
    go(0.6, record);
    input.axis = { x: 0, y: 1 };
    go(0.3, record);
    input.tap('Space');
    go(0.35, record);
    input.axis = { x: 0, y: 0 };
    input.click(0);
    go(0.9, record);
    // single lights from rest, each look of hit 1
    for (let look = 0; look < 3; look++) {
      far();
      go(1.0, record);
      A.forceVariant = look;
      input.click(0);
      go(0.9, record);
    }
    A.forceVariant = null;
  };

  // (W3) the root's step: a tap steps ~90 % of its lunge by the plant (0.45 of the active frames)
  // and has all but stopped as the active frames end; the whole lunge, and no more. A light held
  // past a click (released before the coil) steps all of it too (the box ran only once released:
  // ~65 %)
  {
    // one attack of each LIGHT hit (forceVariant 0), from its first frame to its last: the root's
    // travel at the plant, its speed on the first frame past the active frames, its total
    const steps = [];
    let S = null;
    const track = () => {
      const a = p.atk, def = a?.def;
      if (p.state === 'attack' && def && (!S || S.def !== def)) {
        if (S) steps.push(S);
        S = { def, x: p.posWas.x, z: p.posWas.z, plant: null, after: null, total: 0 };
      }
      if (S && p.state === 'attack' && a?.def === S.def) {
        const tr = Math.hypot(p.position.x - S.x, p.position.z - S.z), W = S.def.windup, Ac = S.def.active;
        if (S.plant === null && a.t >= W + 0.45 * Ac) S.plant = tr;
        if (S.after === null && a.t >= W + Ac) S.after = Math.hypot(p.position.x - p.posWas.x, p.position.z - p.posWas.z) / game.dt;
        S.total = tr;
      }
      p.posWas.x = p.position.x;
      p.posWas.z = p.position.z;
    };
    p.posWas = { x: p.position.x, z: p.position.z };
    A.forceVariant = 0;
    for (let k = 0; k < 4; k++) { input.click(0); go(CHAIN_EVERY, track); }
    go(0.9, track);
    if (S) steps.push(S);
    S = null;
    // a single tap from rest, again
    far();
    go(1.0, track);
    input.click(0);
    go(0.9, track);
    if (S) steps.push(S);
    S = null;
    // held 0.10 s (past a click), released before the coil
    far();
    go(1.0, track);
    input.press(0);
    go(0.1, track);
    input.up(0);
    go(0.9, track);
    const held = S;
    S = null;
    A.forceVariant = null;
    delete p.posWas;
    out(`   step: ${steps.map((s) => `${s.def.name} ${(s.plant / s.total * 100).toFixed(0)} % by the plant, ${s.after.toFixed(2)} m/s past the cut, ${s.total.toFixed(2)} of ${s.def.lunge} m`).join(' · ')}; held 0.1 s: ${held ? `${held.total.toFixed(2)} of ${held.def.lunge} m` : 'none'}`);
    assert(steps.length >= 5 && steps.every((s) => s.plant >= 0.85 * s.total && s.after <= 0.6 && Math.abs(s.total - s.def.lunge) <= 0.03),
      `a light's step pushes off and brakes at the plant: ≥ 85 % of it by 0.45 of the active frames (least ${Math.min(...steps.map((s) => s.plant / s.total * 100)).toFixed(0)} %), ≤ 0.6 m/s past the cut (most ${Math.max(...steps.map((s) => s.after)).toFixed(2)}), the whole lunge ± 3 cm`);
    assert(held && held.total >= 0.97 * held.def.lunge, `a light held 0.1 s and released before the coil steps its whole lunge (${held ? held.total.toFixed(2) : '-'} of ${held?.def.lunge ?? '-'} m; ≥ 97 %)`);
  }

  // (W1) the clips' data: an anticipation key before the coil (the body only: hips and chest past
  // the coil's turn, away from the cut) and an overshoot after the cut (the hips past the finish,
  // settling back by the last key); the stances' foot yaws
  {
    const bad = [];
    const has = (k, f) => k[f] != null;
    const nohand = (k) => !has(k, 'h') && !has(k, 'a');
    for (const name of [...L10, 'sprintSlash']) {
      const C = SWINGS[name], ks = C.keys;
      if (name !== 'sprintSlash') {
        const coil = ks.find((k) => k.u >= 0.9 && k.u <= 1 && has(k, 'hip')), ant = ks.find((k) => k.u >= 0.5 && k.u <= 0.8 && has(k, 'hip') && nohand(k));
        const toward = [...ks].filter((k) => k.u <= 2 && has(k, 'hip')).pop();
        const sg = -Math.sign(toward.hip - coil.hip);
        if (!ant || !(sg * (ant.hip - coil.hip) >= 0.06 - 1e-9) || !(sg * (ant.sy - coil.sy) >= 0.04 - 1e-9)) bad.push(`${name}: anticipation`);
      }
      const hA = [...ks].filter((k) => k.u <= 2 && has(k, 'hip')).pop().hip, os = ks.find((k) => k.u >= 2.05 && k.u <= 2.25 && has(k, 'hip') && nohand(k));
      const lastHip = [...ks].filter((k) => has(k, 'hip')).pop().hip;
      if (!os || !(Math.abs(os.hip) >= Math.abs(hA) + (C.line === 'point' ? 0.025 : 0.06) - 1e-9) || !(Math.abs(lastHip) < Math.abs(os.hip))) bad.push(`${name}: overshoot`);
    }
    for (const [name, C] of Object.entries(SWINGS)) {
      if (!C.fy) continue;
      if (!(C.fy.every((y) => Math.abs(y) <= 1)) || (C.lF && !(C.lF[1] > 0)) || (C.rF && !(C.rF[1] < 0))) bad.push(`${name}: stance`);
    }
    assert(!bad.length, `every light clip keys an anticipation (u 0.5-0.8, hips ≥ 0.06 and chest ≥ 0.04 rad past the coil, away from the cut) and an overshoot (u 2.05-2.25, the hips ≥ 0.06 rad past the finish, 0.025 for a thrust; the last key settles back), body-only; the foot yaws ≤ 1 rad, the front foot ahead and the rear behind (${bad.join(', ') || 'all'})`);
  }

  // the sampled set: three mashed chains (each look of each hit) and the roll cut
  chains();
  const lights = swings.filter((S) => L10.includes(S.clip));
  const seenL = new Set(lights.map((S) => S.clip));
  assert(L10.every((c) => seenL.has(c)), `the set swings every light look (${L10.filter((c) => !seenL.has(c)).join(', ') || 'all ten'})`);

  // (W2) the kinetic chain: the hips' turn peaks before the sword hand's speed (a frame or more),
  // the chest's no later than the hand's (they all peaked in the same frame: the body turned with the
  // arm, not ahead of it)
  {
    const rows = [];
    for (const S of lights) {
      const W = S.def.windup, Ac = S.def.active;
      let tP = 0, tC = 0, tH = 0, mP = -1, mC = -1, mH = -1;
      for (const F of S.frames) {
        if (!F.real || F.t < W - 0.05 || F.t > W + Ac) continue;
        if (Math.abs(F.dPel) / F.dt > mP) { mP = Math.abs(F.dPel) / F.dt; tP = F.t; }
        if (Math.abs(F.dCh) / F.dt > mC) { mC = Math.abs(F.dCh) / F.dt; tC = F.t; }
        if (F.dHand / F.dt > mH) { mH = F.dHand / F.dt; tH = F.t; }
      }
      rows.push({ clip: S.clip, tP, tC, tH });
    }
    const lead = rows.filter((R) => R.tP <= R.tH - 0.016).length;
    out(`   peaks (hips / chest / hand, s): ${rows.map((R) => `${R.clip} ${R.tP.toFixed(3)}/${R.tC.toFixed(3)}/${R.tH.toFixed(3)}`).join(' · ')}`);
    assert(rows.length >= 10 && lead >= 0.9 * rows.length && rows.every((R) => R.tP <= R.tH && R.tC <= R.tH + 1e-6),
      `the hips lead the cut: their turn peaks a frame or more before the sword hand's speed in ${lead} of ${rows.length} light swings (≥ 90 %), never after it, and the chest's no later than the hand's (${rows.filter((R) => !(R.tP <= R.tH && R.tC <= R.tH + 1e-6)).map((R) => R.clip).join(', ') || 'all'})`);
  }

  // (W4) the weight goes across: before the coil the hips sit over the trail foot, as the cut ends
  // over the foot that stepped (`bx`, mirrored per swing by the stepping foot)
  {
    const rows = [];
    for (const S of lights) {
      const W = S.def.windup, Ac = S.def.active, side = S.frames[0].stepL ? 1 : -1;
      const pre = S.frames.filter((F) => F.t >= W - 0.05 - 1e-6 && F.t <= W - 0.02 + 1e-6).map((F) => F.cur[P.bodyX] * side);
      const post = S.frames.find((F) => F.t >= W + Ac - 1e-6);
      rows.push({ clip: S.clip, pre: pre.length ? Math.max(...pre) : NaN, post: post ? post.cur[P.bodyX] * side : NaN });
    }
    out(`   weight across (m toward the stepping foot, before the coil / as the cut ends): ${rows.map((R) => `${R.clip} ${R.pre.toFixed(3)}/${R.post.toFixed(3)}`).join(' · ')}`);
    assert(rows.every((R) => R.pre <= -0.03 && R.post >= 0.03), `the weight goes across: the hips ≥ 3 cm over the trail foot just before the coil, ≥ 3 cm over the foot that stepped as the cut ends (${rows.filter((R) => !(R.pre <= -0.03 && R.post >= 0.03)).map((R) => R.clip).join(', ') || 'all'})`);
  }

  // (W10) the bow stance: as the cut ends the feet stand long (the thrusts' a deep bow)
  {
    const want = { lunge: 0.84, risingThrust: 0.84, fallingCut: 0.7 }, rows = [];
    for (const S of lights) {
      if (!(S.clip in want)) continue;
      const F = S.frames.find((G1) => G1.t >= S.def.windup + S.def.active - 1e-6);
      rows.push({ clip: S.clip, len: Math.hypot(F.cur[P.lF] - F.cur[P.rF], F.cur[P.lF + 2] - F.cur[P.rF + 2]) });
    }
    out(`   stance as the cut ends: ${rows.map((R) => `${R.clip} ${R.len.toFixed(2)} m`).join(' · ')}`);
    assert(rows.length >= 3 && rows.every((R) => R.len >= want[R.clip]), `the bow stance: the feet ≥ 0.84 m apart as a thrust ends, ≥ 0.70 m as the falling cut ends (${rows.map((R) => `${R.clip} ${R.len.toFixed(2)}`).join(', ')})`);
  }

  // (W7a/b) planted feet never skate: a foot bearing weight (on the grass, its toe not dragging, not
  // in its follow step) slides ≤ 6 cm over a whole light swing; through the pivots (the draw cut,
  // the flat backhand) ≤ 4 cm, the feet turning on their balls with the body
  const ANKH = HD.ankle;
  const slideOf = (S) => {
    const sl = [0, 0];
    for (let i = 1; i < S.frames.length; i++) {
      const F = S.frames[i], F0 = S.frames[i - 1];
      for (let k = 0; k < 2; k++) {
        const bear = (G1) => {
          const y = G1.cur[k ? P.lF + 1 : P.rF + 1], hold = G1.stepL ? 0 : 1; // the holding foot: the right when the left steps
          const following = G1.fo.on === 1 && k === hold && G1.t >= G1.fo.t0 - 1e-6 && G1.t <= G1.fo.t1 + 1e-6;
          return y < ANKH + 0.008 && !(G1.drag & (k ? 2 : 1)) && !following;
        };
        if (bear(F) && bear(F0)) sl[k] += Math.hypot(F.feet[k].x - F0.feet[k].x, F.feet[k].z - F0.feet[k].z);
      }
    }
    return sl;
  };
  {
    const rows = lights.map((S) => ({ clip: S.clip, sl: slideOf(S) }));
    const worst = rows.reduce((b, R) => (Math.max(...R.sl) > Math.max(...b.sl) ? R : b), rows[0]);
    out(`   planted slide (m, right/left): ${rows.map((R) => `${R.clip} ${R.sl[0].toFixed(3)}/${R.sl[1].toFixed(3)}`).join(' · ')}`);
    assert(rows.every((R) => Math.max(...R.sl) <= 0.06), `planted feet never skate: a bearing foot slides ≤ 6 cm over a light swing (worst ${worst.clip} ${Math.max(...worst.sl).toFixed(3)} m; the holding foot settled 8-12 cm sideways every light)`);
    // … and the frames left out of that, a holding foot whose TOE drags after the body (A.footDrag:
    // stretched past `drag`, or past its leg's reach of the hip), are a short toe drag, not a skate:
    // ≤ 12 cm of it over a swing, its sole tipped onto the toe (footFlat ≤ 0.35, anim.js FOLLOW.toe)
    // wherever it moves more than 2 cm in a frame (past the clip's cross-fade, 0.85 × the windup,
    // which fades the sole in from the clip before).
    // (The rising thrust's, the rising slash's and the roll cut's toes skated 14-23 cm in 1-2 frames
    // before their follow step, the falling backhand's front foot 15 cm back as its hips rose)
    const drags = lights.map((S) => {
      const dr = [0, 0];
      let flat = 0;
      for (let i = 1; i < S.frames.length; i++) {
        const F = S.frames[i], F0 = S.frames[i - 1];
        for (let k = 0; k < 2; k++) {
          // (the step into a dragged frame counts, and the one out of it back onto the grass: the
          // planted-slide sum skips both. Not the one out into a lifted follow step)
          const now = F.drag & (k ? 2 : 1), was = F0.drag & (k ? 2 : 1);
          const down = F.cur[k ? P.lF + 1 : P.rF + 1] < ANKH + 0.008 && !(F.fo.on === 1 && F.t >= F.fo.t0 - 1e-6 && F.t <= F.fo.t1 + 1e-6);
          if (!now && !(was && down)) continue;
          const st = Math.hypot(F.feet[k].x - F0.feet[k].x, F.feet[k].z - F0.feet[k].z);
          dr[k] += st;
          if (now && st > 0.02 && F.t >= 0.85 * S.def.windup) flat = Math.max(flat, F.cur[k ? P.lFf : P.rFf]);
        }
      }
      return { clip: S.clip, dr, flat };
    });
    const wd = drags.reduce((b, R) => (Math.max(...R.dr) > Math.max(...b.dr) ? R : b), drags[0]);
    out(`   toe drag (m, right/left; the sole): ${drags.filter((R) => Math.max(...R.dr) > 0).map((R) => `${R.clip} ${R.dr[0].toFixed(3)}/${R.dr[1].toFixed(3)} (${R.flat.toFixed(2)})`).join(' · ') || 'none'}`);
    assert(drags.every((R) => Math.max(...R.dr) <= 0.12 && R.flat <= 0.35 + 1e-6), `a dragged holding foot drags its toe, a short way: ≤ 12 cm over a light swing (worst ${wd.clip} ${Math.max(...wd.dr).toFixed(3)} m), the sole on the toe where it moves > 2 cm a frame (footFlat ≤ 0.35; ${Math.max(...drags.map((R) => R.flat)).toFixed(2)})`);
    const piv = [];
    for (const S of lights) {
      // (the look's own `turn`, combat.js)
      const look = [S.def.anim, ...(S.def.variants ?? [])].find((an) => an.clip === S.clip);
      if (!look?.turn) continue;
      const W = S.def.windup, Ac = S.def.active, R = S.def.recovery;
      const a0 = S.frames.find((F) => F.t >= W + 0.5 * Ac - 1e-6), a1 = S.frames.find((F) => F.t >= W + Ac + 0.3 * R - 1e-6);
      const sl = slideOf(S), sg = Math.sign(look.turn);
      const yaw = [P.rFy, P.lFy].map((c) => sg * (a1.cur[c] - a0.cur[c]));
      piv.push({ clip: S.clip, turn: look.turn, sl, yaw, ok: Math.max(...sl) <= 0.04 && yaw.every((y) => y >= 0.5 * Math.abs(look.turn)) });
    }
    out(`   pivots: ${piv.map((R) => `${R.clip} (turn ${R.turn}) slide ${R.sl.map((x) => x.toFixed(3)).join('/')} m, feet turned ${R.yaw.map((y) => y.toFixed(2)).join('/')} rad`).join(' · ')}`);
    assert(piv.length >= 2 && piv.every((R) => R.ok), `the pivots turn the feet on their balls: ≤ 4 cm of slide, each foot turned ≥ half the pivot (${piv.filter((R) => !R.ok).map((R) => R.clip).join(', ') || 'all'})`);
  }

  // (W7c) the way home moves the foot that STEPPED: after hit 2 (a right-foot step) the right foot
  // draws back and the left stays down (the left always moved: the rear foot stepped 13 cm forward);
  // after a single hit 1 (a left-foot step), the mirror
  {
    const home = (n) => {
      far();
      go(1.0, record);
      A.forceVariant = 0;
      const peak = [0, 0];
      for (let h = 0; h < n; h++) {
        input.click(0);
        go(h === n - 1 ? 0.9 : CHAIN_EVERY, () => {
          record();
          const a = p.atk, def = a?.def;
          if (p.state !== 'attack' || !def || def.combo !== n) return;
          const rec = (a.t - def.windup - def.active) / def.recovery;
          if (rec <= 0.3) return; // (SW_HOME: the way home starts there)
          peak[0] = Math.max(peak[0], A.cur[P.rF + 1] - ANKH);
          peak[1] = Math.max(peak[1], A.cur[P.lF + 1] - ANKH);
        });
      }
      A.forceVariant = null;
      return peak;
    };
    const two = home(2), one = home(1);
    out(`   the way home: after hit 2 the right ankle lifts ${(two[0] * 100).toFixed(1)} cm, the left ${(two[1] * 100).toFixed(1)} cm; after a single hit 1 the right ${(one[0] * 100).toFixed(1)} cm, the left ${(one[1] * 100).toFixed(1)} cm`);
    assert(two[0] >= 0.03 && two[1] <= 0.01 && one[1] >= 0.03 && one[0] <= 0.01, `the way home steps the foot that stepped: after hit 2 the right (${(two[0] * 100).toFixed(1)} cm up; the left ${(two[1] * 100).toFixed(1)}), after hit 1 the left (${(one[1] * 100).toFixed(1)} cm; the right ${(one[0] * 100).toFixed(1)})`);
  }

  // (W7d) the follow step: a stab stretched by the step-in assist (3.5 m from the wyrm) leaves the
  // rear foot dragged behind; just after the front foot plants it takes one lifted step up after the
  // body, and the stance stays a stance (not a split, not feet together)
  {
    far();
    go(0.8, record);
    A.forceVariant = 0;
    for (let h = 0; h < 3; h++) { input.click(0); go(CHAIN_EVERY, record); }
    // 3.5 m from the wyrm's front hurt surface (its chest sphere: REACH's own placement), facing it
    const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
    const c = d.hurtSpheres.filter((h) => h.part === 'body').reduce((a0, h) => ((h.x - d.position.x) * fx + (h.z - d.position.z) * fz > (a0.x - d.position.x) * fx + (a0.z - d.position.z) * fz ? h : a0));
    p.debug.teleport(c.x + fx * (c.r + 3.5), c.z + fz * (c.r + 3.5));
    p.yaw = Math.atan2(c.x - p.position.x, c.z - p.position.z);
    aimAt(G);
    d.hp = d.maxHp;
    d.posture = 0;
    let stab = null, rose = 0, gap = [Infinity, 0], lunge = 0, on = -1;
    input.click(0);
    go(0.6, () => {
      record();
      const a = p.atk, def = a?.def;
      if (p.state !== 'attack' || def?.combo !== 4) return;
      stab = a;
      on = Math.max(on, A.follow.on);
      lunge = Math.max(lunge, Number.isFinite(a.lunge) ? a.lunge : 0);
      const t1 = def.windup + 0.45 * def.active;
      if (a.t > t1) rose = Math.max(rose, (A.stepL ? A.cur[P.rF + 1] : A.cur[P.lF + 1]) - ANKH);
      if (a.t > t1 + 0.15) {
        const g = Math.abs(A.cur[P.lF + 2] - A.cur[P.rF + 2]); // (front to rear, along his facing)
        gap = [Math.min(gap[0], g), Math.max(gap[1], g)];
      }
    });
    A.forceVariant = null;
    out(`   follow step: the stab stepped ${lunge.toFixed(2)} m (assisted); follow ${on}, the rear ankle up ${(rose * 100).toFixed(1)} cm after the plant; the feet ${gap[0].toFixed(2)}-${gap[1].toFixed(2)} m apart front to rear after it`);
    assert(!!stab && lunge > 0.9 && on === 1 && rose >= 0.02 && gap[0] >= 0.45 && gap[1] <= 1.1, `an assisted lunge's rear foot follows: one lifted step (follow ${on}, ${(rose * 100).toFixed(1)} cm up), the feet 0.45-1.1 m apart after it (${gap[0].toFixed(2)}-${gap[1].toFixed(2)})`);
  }

  // (W7e) the whirls hop round their turn: the feet are off the grass through its fast part (they
  // were carried round the root on the grass: a planted foot skated 1.2-1.4 m), and land planted
  {
    const whirls = swings.filter((S) => S.clip === 'whirl' || S.clip === 'risingWhirl');
    const rows = whirls.map((S) => {
      const W = S.def.windup, Ac = S.def.active;
      const win = S.frames.filter((F) => F.t >= W - 0.1 - 1e-6 && F.t <= W + Ac + 1e-6);
      const air = win.filter((F) => F.cur[P.rF + 1] > ANKH + 0.02 && F.cur[P.lF + 1] > ANKH + 0.02).length / Math.max(1, win.length);
      // … with no pop: through the turn and its settle (from W − 0.1 to 0.1 s past it) each leg's
      // thigh and shin turn ≤ 30° a frame in the pelvis's frame, the feet stay ≥ 0.3 m apart (never
      // scissoring through the middle) and their spread changes ≤ 12 cm a frame, and no foot moves
      // more than 40 cm a frame (a straight-line blend from the grass to the turned stance spot sent
      // the front foot to the rear spot in two frames: 40-48° a frame, 0.31 → 0.84 m apart in one)
      let leg = 0, sep = Infinity, dSep = 0, step = 0;
      const sepOf = (F) => Math.hypot(F.feet[0].x - F.feet[1].x, F.feet[0].z - F.feet[1].z);
      for (let i = 1; i < S.frames.length; i++) {
        const F = S.frames[i], F0 = S.frames[i - 1];
        if (!F.real || F.t < W - 0.1 - 1e-6 || F.t > W + Ac + 0.1 + 1e-6) continue;
        leg = Math.max(leg, F.leg);
        sep = Math.min(sep, sepOf(F));
        dSep = Math.max(dSep, Math.abs(sepOf(F) - sepOf(F0)));
        step = Math.max(step, ...[0, 1].map((k) => Math.hypot(F.feet[k].x - F0.feet[k].x, F.feet[k].z - F0.feet[k].z)));
      }
      return { clip: S.clip, sl: slideOf(S), air, leg, sep, dSep, step };
    });
    out(`   whirls: ${rows.map((R) => `${R.clip} slide ${R.sl.map((x) => x.toFixed(3)).join('/')} m, both feet up ${(R.air * 100).toFixed(0)} % of the turn, legs ≤ ${R.leg.toFixed(0)}° a frame, feet ≥ ${R.sep.toFixed(2)} m apart (± ≤ ${(R.dSep * 100).toFixed(0)} cm a frame), a foot ≤ ${(R.step * 100).toFixed(0)} cm a frame`).join(' · ')}`);
    assert(rows.length >= 2 && rows.every((R) => Math.max(...R.sl) <= 0.08 && R.air >= 0.4), `the whirls hop round: a bearing foot slides ≤ 8 cm (${rows.map((R) => Math.max(...R.sl).toFixed(3)).join(', ')} m), both feet off the grass ≥ 40 % of the turn (${rows.map((R) => (R.air * 100).toFixed(0)).join(', ')} %)`);
    assert(rows.length >= 2 && rows.every((R) => R.leg <= 30 && R.sep >= 0.3 && R.dSep <= 0.12 && R.step <= 0.4),
      `… without a pop: the legs turn ≤ 30° a frame in the pelvis's frame (${rows.map((R) => R.leg.toFixed(0)).join(', ')}°), the feet ≥ 0.3 m apart (${rows.map((R) => R.sep.toFixed(2)).join(', ')}) changing ≤ 12 cm a frame (${rows.map((R) => (R.dSep * 100).toFixed(0)).join(', ')}), a foot ≤ 40 cm a frame (${rows.map((R) => (R.step * 100).toFixed(0)).join(', ')})`);
    // (W8) … and its momentum carries past the full turn and settles: the turn no longer stops dead
    // in a frame (its 2nd frame after the cut turns ≥ 0.35 of its last one), and it is home by 0.2 s
    // (a single whirl: hits 1 and 2, then the whirl and nothing after it)
    far();
    go(0.8, record);
    A.forceVariant = 0;
    for (let h = 0; h < 3; h++) { input.click(0); go(h === 2 ? 1.0 : CHAIN_EVERY, record); }
    A.forceVariant = null;
    const S = swings.filter((S1) => S1.clip === 'whirl').pop(), W = S.def.windup, Ac = S.def.active;
    const j = S.frames.findIndex((F) => F.t >= W + Ac - 1e-6) - 1;
    const r = (k) => Math.abs(wrapA(S.frames[k].cur[P.yaw] - S.frames[k - 1].cur[P.yaw]));
    const settle = Math.max(...S.frames.filter((F) => F.t >= W + Ac + 0.2 - 1e-6).map((F) => Math.abs(wrapA(F.cur[P.yaw])) * DEG));
    out(`   the whirl's settle: ${(r(j) * DEG).toFixed(1)}° the last frame of the turn, then ${(r(j + 1) * DEG).toFixed(1)}°, ${(r(j + 2) * DEG).toFixed(1)}°; ≤ ${settle.toFixed(2)}° off from 0.2 s after it`);
    assert(j > 0 && r(j + 2) >= 0.35 * r(j) && settle < 2, `the whirl carries past its turn and settles: the 2nd frame after turns ${(r(j + 2) / r(j) * 100).toFixed(0)} % of the last (≥ 35 %), home within 2° by 0.2 s (${settle.toFixed(2)}°)`);
  }

  // (W11) no hip whip: through every light's windup and cut the hips turn ≤ 15° a frame (a lead
  // ramped in early from an entry on the far side whipped them 15°+ a frame)
  {
    let worst = 0, at = '';
    for (const S of lights) {
      const W = S.def.windup, Ac = S.def.active;
      for (const F of S.frames) {
        if (!F.real || F.t > W + Ac) continue;
        const s = Math.abs(F.dPel) * DEG;
        if (s > worst) { worst = s; at = `${S.clip} t ${F.t.toFixed(3)}`; }
      }
    }
    out(`   hips: at most ${worst.toFixed(1)}° a frame through a light's windup and cut (${at})`);
    assert(worst <= 15, `no hip whip: the hips turn at most ${worst.toFixed(1)}° a frame through every light's windup and cut (≤ 15°; ${at})`);
  }

  // (W6) a held light does NOT wait at its coil (ADR-115: the charge moved to the heavy button):
  // the attack button held 0.25 s, the light passes its windup on its own clock and cuts, never
  // pending and never a charge. (Until 2026-11-15 it waited at the coil while held: that hold and its
  // settling hips and foot were tested here.)
  {
    far();
    go(0.8, record);
    A.forceVariant = 0;
    const hold = [];
    input.press(0);
    for (let i = 0, n = Math.round(0.25 / DT); i < n; i++) { G.tick(DT); hold.push({ F: record(), st: p.state }); }
    input.up(0);
    go(0.6);
    A.forceVariant = null;
    const W = hold[0].F.atk?.def?.windup ?? 0, at = hold.findIndex((h) => h.F.t >= W - 1e-6);
    out(`   a held light: windup ${W} s passed on frame ${at} (${(at * DT).toFixed(3)} s) with the button still down; pending on ${hold.filter((h) => h.F.pending).length} frames; charge on ${hold.filter((h) => h.st === 'charge').length}`);
    assert(W > 0 && at >= 0 && at * DT <= W + 2 * DT && !hold.some((h) => h.F.pending) && !hold.some((h) => h.st === 'charge'),
      `a held light cuts at once: its windup (${W} s) ends on its own clock with the button held (frame ${at}), never pending, never a charge`);
  }

  // (W5) the bite: 2.5 m from the wyrm, every landed blow (player:hitDragon, unguarded, atk.hitAt
  // set) holds its blade where it bit through the freeze while the hips drop into it, then tears
  // on through (the blade dragged behind its arc, never pulled back past the frame that hit)
  {
    const seq = [];
    let flag = false;
    G.watch = (n, e) => { if (n === 'player:hitDragon' && !e.guarded) flag = true; };
    const step = () => {
      G.tick(DT);
      const F = record();
      F.hit = flag && (p.atk?.hitAt ?? -1) >= 0;
      F.finite = A.cur.every(Number.isFinite);
      flag = false;
      seq.push(F);
    };
    const run = (s) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) step(); };
    for (let look = 0; look < 3; look++) {
      A.forceVariant = look;
      place(G, 2.5);
      d.hp = d.maxHp;
      d.posture = 0;
      run(0.3);
      for (let k = 0; k < 5; k++) { aimAt(G); input.click(0); run(k === 4 ? 1.2 : CHAIN_EVERY); }
      run(0.8);
    }
    A.forceVariant = null;
    // the heavier bites: the charged cleave (1.5) landing from 2.0-3.6 m, the sprint slash (1.1) run
    // in from 7-8 m
    for (let rep = 0; rep < 3; rep++) {
      place(G, 2.0 + rep * 0.8);
      d.hp = d.maxHp;
      d.posture = 0;
      run(0.4);
      input.press(2);
      run(0.6 + rep * 0.4);
      input.up(2);
      run(1.4);
    }
    for (let rep = 0; rep < 2; rep++) {
      place(G, 7 + rep);
      d.hp = d.maxHp;
      d.posture = 0;
      run(0.3);
      input.axis = toward(G); // (the stick is world-fixed: y = north)
      input.hold('ShiftLeft');
      aimAt(G);
      run(0.5);
      input.click(0);
      input.release('ShiftLeft');
      input.axis = { x: 0, y: 0 };
      run(1.2);
    }
    G.watch = null;
    const rows = [];
    for (let i = 1; i < seq.length - 6; i++) {
      const c = seq[i];
      if (!c.hit) continue;
      const f = seq[i + 1], b = seq[i - 1];
      const cut = c.tip.clone().sub(b.tip), mv = f.tip.clone().sub(c.tip), cl = cut.length();
      let after = 0, n = 0, arm = 0;
      for (let j = i + 1; j < seq.length && n < 4; j++) {
        arm = Math.max(arm, seq[j].arm);
        if (!seq[j].real) continue;
        after = Math.max(after, seq[j].tip.distanceTo(seq[j - 1].tip));
        n++;
      }
      rows.push({ clip: c.clip, freeze: !f.real, drop: c.hipY - f.hipY, move: mv.length(), along: cl > 1e-4 ? mv.dot(cut) / cl : 0, after, arm });
    }
    out(`   bite: ${rows.length} landed hits; the hips drop ${Math.min(...rows.map((R) => R.drop * 100)).toFixed(1)}-${Math.max(...rows.map((R) => R.drop * 100)).toFixed(1)} cm into the first freeze frame, the tip moves ≤ ${Math.max(...rows.map((R) => R.move * 100)).toFixed(1)} cm (≥ ${Math.min(...rows.map((R) => R.along * 100)).toFixed(1)} cm along the cut); after it ≤ ${Math.max(...rows.map((R) => R.after * 100)).toFixed(0)} cm a frame, the arms ≤ ${Math.max(...rows.map((R) => R.arm)).toFixed(0)}° a frame`);
    out(`         ${rows.map((R) => `${R.clip} ${(R.drop * 100).toFixed(1)}/${(R.move * 100).toFixed(0)}/${(R.after * 100).toFixed(0)}`).join(' · ')}`);
    const nOf = (c) => rows.filter((R) => R.clip === c).length;
    assert(rows.length >= 13 && nOf('cleave') >= 2 && nOf('sprintSlash') >= 1 && rows.every((R) => R.freeze), `the chain lands ${rows.length - nOf('cleave') - nOf('sprintSlash')} blows 2.5 m from the wyrm, the cleave ${nOf('cleave')} (≥ 2), the sprint slash ${nOf('sprintSlash')} (≥ 1), each followed by a freeze frame`);
    assert(rows.every((R) => R.drop >= 0.035 && R.move <= 0.2 && R.along >= -0.04),
      `the edge bites: into the first freeze frame the hips drop ≥ 3.5 cm (${Math.min(...rows.map((R) => R.drop * 100)).toFixed(1)}), the tip holds within 20 cm (${Math.max(...rows.map((R) => R.move * 100)).toFixed(1)}) and is never pulled back > 4 cm against the cut (${Math.min(...rows.map((R) => R.along * 100)).toFixed(1)})`);
    assert(rows.every((R) => R.after <= 1.3 && R.arm < 60), `then it tears on through: the tip ≤ 1.3 m a frame over the next 4 frames (${Math.max(...rows.map((R) => R.after)).toFixed(2)}), no arm segment ≥ 60° a frame (${Math.max(...rows.map((R) => R.arm)).toFixed(0)}°)`);
    assert(seq.every((F) => F.finite), 'every pose through the bites is finite');
  }
  return G;
}

// ================================================================== scenario: the arms
// The hero's arms (Session 30, the owner: "something about the arms still feel unnatural and stiff";
// "when charging, the sword is piercing the characters face"). Measured in the chest's own frame (the
// drawn figure is lean-sheared and scaled: world angles lie): the charged blade's pass by his head;
// the elbows opening at a cut's contact and a thrust's end, and never locking; the elbows kept in
// beside the ribs on the run; the shoulders riding with the reach; a hanging arm that hangs.
async function scenarioHeroArms() {
  out('\n== scenario HEROARMS (the arms open and close; the elbows stay in; the charged blade clear of his head) ==');
  const { DIM: HD } = await imp('src/entities/player/model.js');
  const { P } = await imp('src/entities/player/anim.js');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  const p = game.player, d = game.dragon, r = p.rig, A = p.anim;
  p.debug.god = true;
  // (open ground: 3.5 s of running north from here meets no stone of the harness's ring and stays
  // 12 m from the wyrm. From wyrm + (14, 14) the run slid round a stone, and the "strafe" was that slide)
  const LANE = [-10, 13];
  p.debug.teleport(LANE[0], LANE[1]);
  const DEG = 180 / Math.PI;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const go = (s, each, before) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) { before?.(); G.tick(DT); each?.(); } };
  go(0.5);
  // the elbow's opening (180 = straight) and the upper arm's direction in the chest's frame
  const elbow = (s) => 180 - Math.abs(r.arms[s].fore.rotation.x) * DEG;
  const upper = (s, o) => o.set(0, -1, 0).applyQuaternion(r.arms[s].upper.quaternion); // (x: + = his left)
  const flare = (s) => upper(s, v).x * (s === 'R' ? -1 : 1); // how far the elbow points out to its own side
  // the blade's nearest pass to the head's axis between the chin and the crown (head local, model m)
  const bladeHead = () => {
    let best = Infinity;
    for (let z = 0.12; z <= (HD.drawnTip ?? HD.steelTip) + 1e-6; z += 0.02) {
      r.head.worldToLocal(v.set(0, 0, z).applyMatrix4(r.sword.matrixWorld));
      if (v.y < -0.06 || v.y > 0.32) continue;
      best = Math.min(best, Math.hypot(v.x, v.z));
    }
    return best;
  };
  const clipOf = () => {
    const a = p.atk, def = a?.def;
    if (!def || (p.state !== 'attack' && p.state !== 'heavy')) return null;
    return (A.atkDef === def && A.atkAnim ? A.atkAnim : def.anim)?.clip ?? def.name ?? null;
  };

  // (A1) at rest (ADR-114, the owner's pick of three rendered stances): at ease the sword arm hangs
  // loose, the elbow soft and beside the ribs, and the blade lies on the forearm's own line; in the
  // guard (this scenario stands in a boss fight) the arm is half extended, the elbow still in, the
  // blade still on the forearm's line. In both the free hand lies open on the belt, its elbow bent
  // and out behind it: a hand on the hip (so no flare limit for the free arm).
  const qa = new THREE.Quaternion();
  const kink = () => {
    // the forearm (elbow → grip) against the blade
    v.set(0, -1, 0).applyQuaternion(r.arms.R.fore.getWorldQuaternion(qa));
    w.set(0, 0, 1).applyQuaternion(r.sword.getWorldQuaternion(qa));
    return Math.acos(clamp(v.normalize().dot(w.normalize()), -1, 1)) * DEG;
  };
  const restOf = () => ({ R: elbow('R'), L: elbow('L'), fR: flare('R'), fL: flare('L'), kink: kink(), open: r.offHand.open.visible && !r.offHand.fingers?.visible && !r.offHand.grip.visible });
  p.lean.on = false; // (the drawn hero is sheared toward the camera: angles are measured without it)
  go(1.0);
  const rest = restOf();
  p.debug.fightStance = false;
  go(1.6);
  const ease = restOf();
  p.debug.fightStance = null;
  p.lean.on = true;
  go(1.6);
  out(`   rest, the guard: elbows R ${rest.R.toFixed(0)}° L ${rest.L.toFixed(0)}°, flare R ${rest.fR.toFixed(2)} L ${rest.fL.toFixed(2)}, wrist ${rest.kink.toFixed(0)}°; at ease: elbows R ${ease.R.toFixed(0)}° L ${ease.L.toFixed(0)}°, flare R ${ease.fR.toFixed(2)} L ${ease.fL.toFixed(2)}, wrist ${ease.kink.toFixed(0)}°`);

  // (A2) the run, the same run as a strafe, and the sprint: the elbows beside the ribs, the arms swinging
  const mk = () => ({ fR: -1, fL: -1, eR: [180, 0], eL: [180, 0], hz: [9, -9], mz: [9, -9], x: [9e9, -9e9] });
  const loco = { run: mk(), strafe: mk(), sprint: mk() };
  const locoEach = (K) => () => {
    for (const s of ['R', 'L']) {
      K['f' + s] = Math.max(K['f' + s], flare(s));
      const e = elbow(s);
      K['e' + s][0] = Math.min(K['e' + s][0], e);
      K['e' + s][1] = Math.max(K['e' + s][1], e);
    }
    // the free hand's fore-aft swing (the POSE's offset from its shoulder, body axes: its target)
    K.hz[0] = Math.min(K.hz[0], A.cur[P.lH + 2]);
    K.hz[1] = Math.max(K.hz[1], A.cur[P.lH + 2]);
    K.mz[0] = Math.min(K.mz[0], A.mz);
    K.mz[1] = Math.max(K.mz[1], A.mz);
    K.x[0] = Math.min(K.x[0], p.position.x);
    K.x[1] = Math.max(K.x[1], p.position.x);
  };
  // (the stick is world-fixed, y = north = −z; he faces the mouse's ground point, set BEFORE each
  // tick: far north = a run straight ahead, far east = the same run as a pure strafe)
  const aimFar = (dx, dz) => () => game.mouseGround.set(p.position.x + dx, 0, p.position.z + dz);
  input.axis = { x: 0, y: 1 };
  go(0.6, null, aimFar(0, -60));
  go(1.2, locoEach(loco.run), aimFar(0, -60));
  p.debug.teleport(LANE[0], LANE[1]);
  go(0.8, null, aimFar(60, 0));
  go(1.2, locoEach(loco.strafe), aimFar(60, 0));
  p.debug.teleport(LANE[0], LANE[1]);
  input.hold('ShiftLeft');
  go(0.6);
  go(1.0, locoEach(loco.sprint));
  input.release('ShiftLeft');
  input.axis = { x: 0, y: 0 };
  go(1.0);
  p.debug.teleport(LANE[0], LANE[1]);
  go(0.3);
  for (const k of ['run', 'strafe', 'sprint']) {
    const K = loco[k];
    out(`   ${k} (mz ${K.mz[0].toFixed(2)}…${K.mz[1].toFixed(2)}, x drift ${(K.x[1] - K.x[0]).toFixed(2)} m): flare R ${K.fR.toFixed(2)} L ${K.fL.toFixed(2)}; elbows R ${K.eR[0].toFixed(0)}-${K.eR[1].toFixed(0)}° L ${K.eL[0].toFixed(0)}-${K.eL[1].toFixed(0)}°; the free hand's target swings ${((K.hz[1] - K.hz[0]) * 100).toFixed(0)} cm fore and aft`);
  }

  // (A3) the chain, each look: how far each elbow opens in each swing, and the most it opens at all
  const swings = {};
  let lock = 0, lockAt = '';
  const swingEach = () => {
    const c = clipOf();
    if (!c) return;
    const S = (swings[c] ??= { R: 0, L: 0, Rmin: 180, Lmin: 180, n: 0, want: 0 });
    S.n++;
    for (const s of ['R', 'L']) {
      const e = elbow(s);
      S[s] = Math.max(S[s], e);
      S[s + 'min'] = Math.min(S[s + 'min'], e);
      if (A.cur[P.twoHand] < 0.5 || s === 'R') {
        if (e > lock) { lock = e; lockAt = `${s} ${c} t ${p.atk.t.toFixed(2)}`; }
      }
    }
    S.want = Math.max(S.want, Math.hypot(A.cur[P.rH], A.cur[P.rH + 1], A.cur[P.rH + 2]) / (HD.upperArm + HD.foreArm));
  };
  for (let look = 0; look < 3; look++) {
    A.forceVariant = look;
    for (let k = 0; k < 5; k++) {
      input.click(0);
      go(k === 4 ? 0.9 : CHAIN_EVERY, swingEach);
    }
    go(0.8, swingEach);
  }
  A.forceVariant = null;
  // the sprint slash and the roll cut
  input.axis = { x: 0, y: 1 };
  input.hold('ShiftLeft');
  go(0.8);
  input.click(0);
  input.release('ShiftLeft');
  input.axis = { x: 0, y: 0 };
  go(1.0, swingEach);
  for (const [c, S] of Object.entries(swings)) out(`   ${c}: sword elbow ${S.Rmin.toFixed(0)}-${S.R.toFixed(0)}° (asks ${(S.want * 100).toFixed(0)} % of the arm), free elbow ${S.Lmin.toFixed(0)}-${S.L.toFixed(0)}° (${S.n} frames)`);

  // (A4) the charge and its release: the blade's pass by his head
  let holdMin = Infinity, holdAt = 0, dashMin = Infinity, dashAt = 0, gapMax = 0, chargeL = [180, 0], chargeR = [180, 0], holdN = 0, dashN = 0;
  input.press(2);
  go(1.7, () => {
    if (p.state !== 'charge') return;
    holdN++;
    const b = bladeHead();
    if (b < holdMin) { holdMin = b; holdAt = p.chargeK; }
    if (p.chargeK > 0.3) {
      gapMax = Math.max(gapMax, A.gripGap ?? 0);
      chargeL = [Math.min(chargeL[0], elbow('L')), Math.max(chargeL[1], elbow('L'))];
      chargeR = [Math.min(chargeR[0], elbow('R')), Math.max(chargeR[1], elbow('R'))];
    }
  });
  const fistShown = r.offHand.grip.visible;
  input.up(2);
  go(1.2, () => {
    const a = p.atk;
    if (!a?.def || p.state !== 'heavy') return;
    dashN++;
    const b = bladeHead();
    if (b < dashMin) { dashMin = b; dashAt = a.t; }
  });
  out(`   charge: the blade passes ${(holdMin * 100).toFixed(1)} cm from the head's axis (at charge ${holdAt.toFixed(2)}); released ${(dashMin * 100).toFixed(1)} cm (t ${dashAt.toFixed(2)}); elbows R ${chargeR[0].toFixed(0)}-${chargeR[1].toFixed(0)}° L ${chargeL[0].toFixed(0)}-${chargeL[1].toFixed(0)}°; the free hand ${(gapMax * 100).toFixed(1)} cm off the grip at most, the fist ${fistShown ? 'shown' : 'NOT shown'}`);

  // (A1) at rest: see above
  // (the wrist at one instant: the point's drift carries the blade a few degrees round the
  // forearm's line. HEROSTANCE measures it through the stance's life: ≤ 10° on average)
  assert(ease.R >= 125 && ease.fR <= 0.4 && ease.kink <= 16,
    `at ease the sword arm hangs loose: the elbow open ${ease.R.toFixed(0)}° (≥ 125), in beside the ribs (flare ${ease.fR.toFixed(2)} ≤ 0.4), the blade ${ease.kink.toFixed(0)}° off the forearm's line (≤ 16; the stance before it: 27)`);
  assert(rest.R >= 85 && rest.R <= 125 && rest.fR <= 0.4 && rest.kink <= 16,
    `in the guard the sword arm is half extended: the elbow ${rest.R.toFixed(0)}° (85-125), in beside the ribs (flare ${rest.fR.toFixed(2)} ≤ 0.4), the blade ${rest.kink.toFixed(0)}° off the forearm's line (≤ 16)`);
  assert(ease.open && rest.open && ease.L >= 60 && ease.L <= 105 && rest.L >= 60 && rest.L <= 105,
    `in both the free hand lies open on the belt, the elbow bent (${ease.L.toFixed(0)}° at ease, ${rest.L.toFixed(0)}° in the guard; 60-105)`);
  // (A2) on the run the elbows point back, not out, and the free arm opens behind him and folds in
  // front; in a PURE strafe (the aim held square to the run: |mz| < 0.1, no sideways drift) the arms
  // still swing
  {
    const R = loco.run, S = loco.strafe, Sp = loco.sprint;
    assert(Math.max(R.fR, R.fL, S.fR, S.fL) <= 0.45 && Math.max(Sp.fR, Sp.fL) <= 0.55,
      `the elbows stay in beside the ribs: out to the side at most ${Math.max(R.fR, R.fL, S.fR, S.fL).toFixed(2)} on the run and the strafe (≤ 0.45; they flared 0.47-0.58), ${Math.max(Sp.fR, Sp.fL).toFixed(2)} sprinting (≤ 0.55; 0.60-0.73)`);
    assert(R.mz[0] > 0.95 && R.eL[1] - R.eL[0] >= 35 && R.hz[1] - R.hz[0] >= 0.3,
      `the free arm works on the run: its elbow opens and folds ${(R.eL[1] - R.eL[0]).toFixed(0)}° a stride (≥ 35; it was one 87° crook) and the hand's target swings ${((R.hz[1] - R.hz[0]) * 100).toFixed(0)} cm fore and aft (≥ 30)`);
    assert(Math.max(Math.abs(S.mz[0]), Math.abs(S.mz[1])) < 0.1 && S.x[1] - S.x[0] < 0.3 && S.hz[1] - S.hz[0] >= 0.12 && S.eL[1] - S.eL[0] >= 15,
      `… and in a pure strafe (the aim square to the run: mz ${S.mz[0].toFixed(2)}…${S.mz[1].toFixed(2)}, ${(S.x[1] - S.x[0]).toFixed(2)} m of sideways drift): the hand's target still swings ${((S.hz[1] - S.hz[0]) * 100).toFixed(0)} cm (≥ 12; it hung still, 0 cm) and the elbow works ${(S.eL[1] - S.eL[0]).toFixed(0)}° (≥ 15)`);
  }
  // (A3) the arms open: a swing that asks for the hand at ≥ 95 % of the arm's length opens the sword
  // elbow to ≥ 140° (they all stopped at 124-130°); nothing one-handed locks straight
  {
    const far = Object.entries(swings).filter(([c, S]) => S.want >= 0.95 && c !== 'slam' && c !== 'cleave');
    const tight = far.filter(([, S]) => S.R < 140);
    assert(far.length >= 5 && !tight.length,
      `the sword arm opens at a cut's contact and a thrust's end: ≥ 140° in each of the ${far.length} swings that ask for a full reach (${far.map(([c, S]) => `${c} ${S.R.toFixed(0)}°`).join(', ')})`);
    // (a guard on HERO_SOFT's ceiling: 0.99 of the arm is 164°)
    assert(lock <= 166, `… and never locks into a stick: the most an elbow opens one-handed is ${lock.toFixed(0)}° (${lockAt}; ≤ 166)`);
  }
  // (A4) the charge: the upright blade a hand's width clear of the hood (its radius is 0.13-0.17 m
  // in the head's frame), through the hold and the dash; both hands on the grip
  assert(holdN >= 60 && dashN >= 30 && Number.isFinite(holdMin) && Number.isFinite(dashMin) && holdMin >= 0.22 && dashMin >= 0.2 && fistShown && gapMax <= 0.035,
    `the charged blade stands clear of his face: ${(holdMin * 100).toFixed(1)} cm from the head's axis through the hold (≥ 22; it was 10.2, inside the hood) and ${(dashMin * 100).toFixed(1)} cm through the release (≥ 20; ${holdN} + ${dashN} frames measured), the free hand's fist on the grip (${(gapMax * 100).toFixed(1)} cm off at most)`);
  return G;
}

// ================================================================== scenario: the outfit options (?heroLook=)
// The hero's outfit options (gear/looks.js; temporary, until the owner picks one): the URL switch,
// the registry, each look built (its loadout, its colours on its own rig only, its cost), worn
// through HEROLOOK's route (the rig finite; hems and cloth tips above the grass; the cloth out of the
// body; the blade through the skirt and the sheets as rarely as today's; the free hand clear of the
// cloth), each look's own shape, and the Lab's OUTFIT row / live switching with the shared-ink
// restore. Today's look (`shroud`) runs the same route for comparison: its cloth numbers are printed,
// not asserted (its cape sheets were never held out of the body, and the left-arm drape covers the
// hand by design).
async function scenarioLooks() {
  out('\n== scenario LOOKS (outfit options behind ?heroLook=: switch, registry, each look built and worn through the route, the Lab row) ==');
  const { HERO_LOOKS, LOOK_IDS, DEFAULT_LOOK, heroLookFromSearch, heroLookUrl } = await imp('src/entities/player/gear/looks.js');
  const { DEFAULT_LOADOUT, BASE_LOADOUT, SLOTS, resolveLoadout, getItem } = await imp('src/entities/player/gear/index.js');
  const { BODY, HERO_INK, sheetOffset, tintHero } = await imp('src/entities/player/model.js');
  const { SWALLOW_TINT } = await imp('src/entities/player/gear/swallow.js');
  const D = HERO_DIM;
  const { ell, cap, shell, restSpine } = heroShapes(BODY, D);
  const PART_U = ['uHeroPartInk', 'uHeroPartFill', 'uHeroPartRim'];
  const snapU = (U) => PART_U.map((k) => U[k].value.map((x) => x.toArray().join()).join('|')).join('/');
  const v = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Vector3(), m = new THREE.Matrix4();
  const LYING = new Set(['knockdown', 'dead', 'deadDown']);
  const rootOf = (S) => S.segs[0].parent?.parent ?? null; // the joint a streamer hangs on (its base's parent)
  const under = (o, J) => { for (let x = o; x; x = x.parent) if (x === J) return true; return false; };
  const sources = (root) => { const l = []; root.traverse((o) => { if (o.isMesh && !o.userData.rigidBatch) l.push(o); }); return l; };
  const go = (G, s, each) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) { G.tick(DT); each?.(); } };
  const setup = (id) => {
    const G = build({ heroLook: id });
    fightSetup(G);
    const p = G.game.player, d = G.game.dragon;
    p.debug.god = true;
    p.debug.teleport(d.position.x + 14, d.position.z + 14);
    return G;
  };
  // a panel's hem points (s 0 … 1 across it) in root-local metres; the lowest
  const hemLow = (p, C, n = 8) => {
    const P = C.def, sk = P.skew ?? 0, sl = P.slant ?? 0, w2 = P.w[2];
    const R = C.r0 + 0.25 * P.len[0] + 0.25 * P.len[1];
    let lo = Infinity;
    for (let k = 0; k <= n; k++) {
      const s = k / n, a = ((s - 0.5) * w2 + sheetOffset(w2, P.w[0], sk)) / R;
      v.set(Math.sin(a) * R, -(P.len[1] + 0.02 + sl * (sk < 0 ? 1 - s : s)), (Math.cos(a) - 1) * R).applyMatrix4(C.segs[1].matrixWorld);
      lo = Math.min(lo, p.object3d.worldToLocal(v).y);
    }
    return lo;
  };
  // a streamer's root and tip, root-local metres (into a / b)
  const ends = (p, S, a, b) => {
    a.setFromMatrixPosition(S.segs[0].matrixWorld);
    p.object3d.worldToLocal(a);
    b.set(0, -S.len[1], 0).applyMatrix4(S.segs[1].matrixWorld);
    p.object3d.worldToLocal(b);
  };

  // (A) the URL switch
  {
    const f = heroLookFromSearch;
    const u1 = new URL(heroLookUrl('robe', 'http://x/?level=ash&lab'));
    const u2 = new URL(heroLookUrl('shroud', u1.toString()));
    assert(f('?heroLook=robe') === 'robe' && f('?level=ash&heroLook=SWALLOW&lab') === 'swallow' && f('?herolook=warden') === 'warden' && f('?heroLook=Warden-Shade') === 'warden-shade'
      && ['?heroLook=nope', '', undefined, '%%%'].every((s) => f(s) === DEFAULT_LOOK)
      && u1.searchParams.get('heroLook') === 'robe' && u1.searchParams.get('level') === 'ash' && u1.searchParams.has('lab') && !u2.searchParams.has('heroLook') && u2.searchParams.get('level') === 'ash',
      `?heroLook= picks an outfit (case-insensitive; unknown or absent: ${DEFAULT_LOOK}); heroLookUrl sets / clears it and keeps the other params`);
  }
  // (B) the registry and its data: every loadout resolves, every tint names a cloth / metal part (never
  // the skin, the eyes, the blade, the gem or the flask) with sane numbers, the sword is the hero's
  {
    const FORBID = new Set(['skin', 'eye', 'blade', 'bladeTip', 'gem', 'flask']);
    const okN = (a, n, lo, hi) => Array.isArray(a) && a.length === n && a.every((x) => Number.isFinite(x) && x >= lo && x <= hi);
    const bad = [];
    for (const id of LOOK_IDS) {
      const L = HERO_LOOKS[id];
      if (L.id !== id) bad.push(`${id}: id`);
      try { resolveLoadout(L.loadout); } catch (e) { bad.push(`${id}: ${e.message}`); }
      if (L.loadout.weapon !== DEFAULT_LOADOUT.weapon) bad.push(`${id}: weapon ${L.loadout.weapon}`);
      // a shaded-face twin: its lit look's loadout and colours, the head item's `shadowsFace` twin
      if (L.of) {
        const B = HERO_LOOKS[L.of], h = getItem(L.loadout.head), h0 = getItem(B?.loadout.head);
        if (!B || B.of || L.id !== `${L.of}-shade` || L.tint !== B.tint || SLOTS.some((sl) => sl !== 'head' && L.loadout[sl] !== B.loadout[sl])
          || !h?.shadowsFace || h0?.shadowsFace || h.build !== h0?.build || String(h.hair) !== String(h0?.hair)) bad.push(`${id}: not the shaded twin of ${L.of}`);
      }
      for (const [name, t] of Object.entries(L.tint ?? {})) {
        if (!HERO_INK[name] || FORBID.has(name)) bad.push(`${id}: tint ${name}`);
        if (t.fill && !okN(t.fill, 3, 0, 1.2)) bad.push(`${id}: ${name}.fill`);
        if (t.ink && !okN(t.ink, 3, 0, 2)) bad.push(`${id}: ${name}.ink`);
        if (t.emissive && !okN(t.emissive, 3, 0, 4)) bad.push(`${id}: ${name}.emissive`);
        if (t.spec && !okN(t.spec, 2, -1e9, 1e9)) bad.push(`${id}: ${name}.spec`);
        for (const k of ['rim', 'sub', 'inkGlow', 'glowK']) if (t[k] != null && !Number.isFinite(t[k])) bad.push(`${id}: ${name}.${k}`);
      }
    }
    assert(!bad.length && HERO_LOOKS.shroud.loadout === DEFAULT_LOADOUT && HERO_LOOKS.shroud.tint === null && LOOK_IDS.join() === 'shroud,robe,robe-shade,swallow,swallow-shade,warden,warden-shade' && DEFAULT_LOOK === 'shroud',
      `the outfit options: ${LOOK_IDS.map((id) => `${id} "${HERO_LOOKS[id].name}"`).join(', ')}; every loadout resolves and every tint is a cloth / metal part (${bad.join('; ') || 'ok'})`);
  }

  let n0 = 0, offKeys0 = '', cape0 = null;
  const rates = {}, headSlot = {};
  for (const id of LOOK_IDS) {
    const L = HERO_LOOKS[id], isNew = id !== DEFAULT_LOOK;
    const G = setup(id);
    const { game } = G, p = game.player, r = p.rig, M = r.materials;
    // (C) built as asked: the look's loadout, its colours on this rig's own materials, no shared
    // uniform written, its cost, the hands
    {
      const slotsOk = SLOTS.every((sl) => p.loadout[sl] === (L.loadout[sl] ?? BASE_LOADOUT[sl] ?? null));
      const fillsOk = Object.entries(L.tint ?? {}).every(([name, t]) => !t.fill || ['r', 'g', 'b'].every((c, i) => Math.abs(M[name].uniforms.uArtFill.value[c] - t.fill[i]) < 1e-6));
      const u0 = snapU(game.U);
      tintHero(M, L.tint);
      const sharedOk = snapU(game.U) === u0;
      assert(p.look === id && slotsOk && fillsOk && sharedOk, `${id}: wears its loadout (${SLOTS.map((sl) => p.loadout[sl] ?? '-').join(', ')}), its colours on its own materials, and writes no shared part ink`);
      const src = sources(p.object3d);
      const tris = src.reduce((s, o) => s + (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, 0);
      const mats = new Set(src.map((o) => o.material)).size;
      const strips = r.coat.reduce((s, C) => s + C.strips.length, 0);
      if (!isNew) n0 = src.length;
      out(`   ${id}: ${src.length} meshes, ${tris} triangles, ${mats} materials, ${p.batch.meshes.length} batches, ${r.streamers.length} streamers, ${r.coat.length} panels, ${strips} strips`);
      // (27k: today's look with the sword fingers and the closed fists draws ~26.6k triangles)
      assert(src.length <= n0 && tris <= 27000 && mats <= 21 && p.batch.meshes.length <= 21 && r.streamers.length <= 6 && r.coat.length <= 6 && strips <= 12,
        `${id}: costs no more than today (${src.length} meshes of ${n0}, ${tris} triangles ≤ 27000, ${mats} materials and ${p.batch.meshes.length} draws ≤ 21)`);
      const keys = Object.keys(r.offHand ?? {}).filter((k) => r.offHand[k]).sort().join();
      if (!isNew) offKeys0 = keys;
      const fist = r.sword.children.some((o) => o.isMesh && o.userData.slot === 'arms');
      assert(keys === offKeys0 && keys.includes('open') && fist, `${id}: the free hand (${keys}) as today's, the sword hand's fist on the grip`);
    }
    // the face: lit (skin, the eyes) or, on a shaded twin, in shadow (the shirt's near-black, no eyes),
    // the head item's own meshes the same either way. A twin's body is its lit look's: its route is
    // not run again
    {
      let skin = 0, eye = 0, shade = 0, own = 0;
      r.head.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material === M.skin) skin++;
        if (o.material === M.eye) eye++;
        if (o.parent === r.head && !o.userData.slot && o.material === M.shirt) shade++;
        if (o.userData.slot === 'head') own++;
      });
      headSlot[id] = own;
      if (L.of) {
        assert(skin === 0 && eye === 0 && shade > 0 && own === headSlot[L.of], `${id}: ${L.of}'s head with the face in shadow (${shade} face meshes in the shirt's black, ${skin} skin, ${eye} eyes; ${own} head-item meshes, as ${L.of}'s ${headSlot[L.of]})`);
        continue;
      }
      if (isNew) assert(skin > 0 && eye > 0 && shade === 0, `${id}: the face lit (${skin} skin, ${eye} eye meshes)`);
    }
    // the cloth over the sword shoulder (today's mantle, the Warden's capelet: back-slot coat on the
    // chest) against the right upper arm, its top 15 % left out (the cloth lies over the joint)
    const shoulderCloth = r.chest.children.filter((o) => o.isMesh && o.userData.slot === 'back' && o.material === M.coat);
    const armRInv = new THREE.Matrix4();
    const capeDepth = () => {
      armRInv.copy(r.arms.R.upper.matrixWorld).invert();
      let fw = -1;
      for (const o of shoulderCloth) {
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          q.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(armRInv);
          if (-q.y < 0.15 * D.upperArm) continue;
          const dep = cap(q, 0, D.upperArm, BODY.upperArm[0], BODY.upperArm[1]);
          if (dep > fw) fw = dep;
        }
      }
      return fw;
    };
    // the look's own shape, standing (2 s idle), at ease: the hems' heights are a standing man's
    // (ADR-114: in a boss fight he stands in the guard, the knees soft, 2.5 cm lower)
    p.debug.fightStance = false;
    go(G, 2);
    const capeIdle = shoulderCloth.length ? capeDepth() : null;
    const tails = r.coat.filter((C) => Math.abs(C.def.az) > 2.2), fronts = r.coat.filter((C) => Math.abs(C.def.az) < 1);
    const strips = r.coat.reduce((s, C) => s + C.strips.length, 0);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    let headSkin = 0, eyes = 0, headHair = 0, headTrim = 0;
    r.head.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === M.skin) headSkin++;
      if (o.material === M.eye) eyes++;
      if (o.userData.slot === 'head' && (o.material === M.hair || o.material === M.hairTip)) headHair++;
      if (o.userData.slot === 'head' && o.material === M.trim) headTrim++;
    });
    const bodyHair = Object.values(r.hair).filter((j) => j.children.some((o) => o.isMesh)).length;
    const sprintEnds = (S) => {
      ends(p, S, a, b);
      return a.z - b.z;
    };
    const sprint = (fn) => {
      G.input.axis = { x: 0, y: 1 };
      G.input.hold('ShiftLeft');
      go(G, 1.0);
      const res = fn();
      G.input.release('ShiftLeft');
      G.input.axis = { x: 0, y: 0 };
      go(G, 1.2);
      return res;
    };
    if (id === 'robe') {
      const lowF = Math.min(...fronts.map((C) => hemLow(p, C))), lowT = tails.map((C) => hemLow(p, C));
      const onSpine = r.streamers.filter((S) => rootOf(S) === r.spine), onArmL = r.streamers.filter((S) => rootOf(S) === r.arms.L.upper);
      out(`   robe: hems front ${lowF.toFixed(2)} m, back tails ${lowT.map((x) => x.toFixed(2)).join(' / ')} m`);
      assert(r.coat.length === 6 && strips === 0 && fronts.length === 2 && lowF >= 0.5 && tails.length === 2 && lowT.every((x) => x >= 0.2 && x <= 0.4),
        `robe: the high-low skirt: 6 panels, no strips, the front hems over the knee (lowest ${lowF.toFixed(2)} m ≥ 0.50), the back tails to the calf (${lowT.map((x) => x.toFixed(2)).join(' / ')} m in 0.20-0.40)`);
      assert(r.streamers.length === 3 && onSpine.length === 2 && onArmL.length === 1 && !r.streamers.some((S) => under(rootOf(S), r.arms.R.upper))
        && r.streamers.every((S) => S.lag > 0 && S.lag <= 1 && Array.isArray(S.inMax)) && onArmL[0].arm === 2 && !r.slots.back.length && !r.slots.shoulders.length,
        `robe: two sash tails on the spine, one wing on the free upper arm (arm ${onArmL[0]?.arm}), nothing on the sword arm, every sheet with inMax; no back or shoulder item`);
      assert(headSkin > 0 && eyes >= 1 && bodyHair === 0 && headHair >= 2 && headTrim >= 1, `robe: a bare, lit head (${headSkin} skin, ${eyes} eye meshes), its own gold locks (${headHair}), no body hair clusters, the silver guan`);
    } else if (id === 'swallow') {
      const lowF = Math.min(...fronts.map((C) => hemLow(p, C))), lowT = Math.min(...tails.map((C) => hemLow(p, C)));
      const tail = r.streamers.find((S) => rootOf(S) === r.head), scarf = r.streamers.filter((S) => rootOf(S) === r.chest);
      const longScarf = scarf.reduce((x, S) => (!x || S.len[0] + S.len[1] > x.len[0] + x.len[1] ? S : x), null);
      ends(p, tail, a, b);
      const hang = a.y - b.y;
      const wraps = ['R', 'L'].every((s) => r.arms[s].fore.children.some((o) => o.isMesh && o.userData.slot === 'arms' && o.material === M.facing));
      out(`   swallow: hems front ${lowF.toFixed(2)} m, tails ${lowT.toFixed(2)} m; the tail hangs ${hang.toFixed(2)} m`);
      assert(r.coat.length === 4 && strips === 2 && lowF >= 0.85 && lowT >= 0.68 && lowT <= 0.85, `swallow: 4 panels, 2 strips, the front hems at ${lowF.toFixed(2)} m (≥ 0.85), the tails' lowest at ${lowT.toFixed(2)} m (0.68-0.85)`);
      assert(r.streamers.length === 3 && tail && tail.lag === 0.75 && tail.inMax[0] < 0 && scarf.length === 2 && scarf.every((S) => Array.isArray(S.inMax)) && hang > 0.15,
        `swallow: the high tail on the head (lag ${tail?.lag}, kept out: inMax ${tail?.inMax?.[0]}), hanging ${hang.toFixed(2)} m; two scarf tails on the chest`);
      assert(bodyHair === 0 && headHair >= 2 && headSkin > 0 && !r.slots.shoulders.length && wraps, `swallow: its own locks (${headHair}), a lit face, no shoulder item, slate wraps on both forearms`);
      const [dt, ds] = sprint(() => [sprintEnds(tail), sprintEnds(longScarf)]);
      assert(dt > 0.12 && ds > 0.12, `swallow sprinting: the tail ${dt.toFixed(2)} m and the long scarf tail ${ds.toFixed(2)} m behind their roots (> 0.12)`);
      // the tails' own idle stir: the animator reads a panel's `idleFlare` / `breeze` (else the table's,
      // the side panels' values at these slots): a large idleFlare on this rig's tails flares them out
      const tk = r.coat.map((C, k) => (Math.abs(C.def.az) > 2.2 ? k : -1)).filter((k) => k >= 0);
      const meanX = (s) => {
        let acc = 0, n = 0;
        go(G, s, () => { for (const k of tk) { acc += p.anim.coatState[k][0].x; n++; } });
        return acc / Math.max(1, n);
      };
      const own = tk.map((k) => r.coat[k].def.idleFlare), x0 = meanX(1), defs = tk.map((k) => r.coat[k].def);
      tk.forEach((k) => { r.coat[k].def = { ...defs[tk.indexOf(k)], idleFlare: 0.6 }; });
      go(G, 0.6);
      const x1 = meanX(1);
      tk.forEach((k, i) => { r.coat[k].def = defs[i]; });
      go(G, 0.6);
      out(`   swallow: the tails' idle swing ${x0.toFixed(3)} rad at their own idleFlare (${own.join(' / ')}), ${x1.toFixed(3)} rad at 0.6`);
      assert(tk.length === 2 && own.every((x) => Number.isFinite(x)) && Math.abs(x1 - x0) > 0.15,
        `swallow: the tails take their own idle flare (a panel idleFlare of 0.6 swings them ${(x1 - x0).toFixed(2)} rad from ${x0.toFixed(2)})`);
    } else if (id === 'warden') {
      const lows = r.coat.map((C) => hemLow(p, C));
      const rib = r.streamers.find((S) => rootOf(S) === r.head), man = r.streamers.find((S) => rootOf(S) === r.chest);
      ends(p, rib, a, b);
      const hang = a.y - b.y;
      a.setFromMatrixPosition(man.segs[0].matrixWorld);
      r.chest.worldToLocal(a);
      const manX = a.x;
      out(`   warden: hems ${lows.map((x) => x.toFixed(2)).join(' / ')} m; the ribbon hangs ${hang.toFixed(2)} m`);
      assert(r.coat.length === 6 && strips === 0 && lows.every((x) => x >= 0.45), `warden: 6 panels, no strips, every hem ≥ 0.45 m (lowest ${Math.min(...lows).toFixed(2)})`);
      assert(r.streamers.length === 2 && rib && rib.lag === 1 && rib.inMax[0] < 0 && rib.wrap === 0.02 && hang > 0.3 && man && manX < 0 && man.lag < 1,
        `warden: the ribbon on the head (lag 1, kept out, hanging ${hang.toFixed(2)} m), the capelet's tail on the chest on his right (x ${manX.toFixed(2)})`);
      // (3) the cuirass's plates, lacing, belt and straps clear of the hanging upper arms (full
      // rings cut into them: the plates are arcs open at the sides)
      let worstArm = -1, armAt = '';
      const armInv = ['R', 'L'].map((s) => new THREE.Matrix4().copy(r.arms[s].upper.matrixWorld).invert());
      for (const J of [r.spine, r.chest]) {
        for (const o of J.children) {
          if (!o.isMesh || o.userData.slot !== 'chest' || ![M.spike, M.bevel, M.leather].includes(o.material)) continue;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            armInv.forEach((inv, k) => {
              const dep = cap(q.copy(v).applyMatrix4(inv), 0, D.upperArm, BODY.upperArm[0], BODY.upperArm[1]);
              if (dep > worstArm) { worstArm = dep; armAt = `${Object.keys(M).find((n) => M[n] === o.material)} into the ${k ? 'left' : 'right'} arm ${(-q.y).toFixed(2)} m down it, ${p.object3d.worldToLocal(w.copy(v)).y.toFixed(2)} m up`; }
            });
          }
        }
      }
      out(`   warden: the cuirass ${(worstArm * 100).toFixed(1)} cm into an upper arm at most (idle; ${armAt || 'none'})`);
      assert(worstArm <= 0.012, `warden: the cuirass stays off the hanging arms (deepest ${(worstArm * 100).toFixed(1)} cm ≤ 1.2)`);
      assert(r.slots.shoulders.length > 0 && r.slots.shoulders.every((o) => o.parent === r.arms.L.upper) && !r.pauldron.children.some((o) => o.userData.slot === 'shoulders')
        && r.arms.L.fore.children.some((o) => o.isMesh && o.userData.slot === 'arms' && o.material === M.spike) && headSkin > 0 && p.loadout.legs === 'warden.legs',
        'warden: the pauldron rides the free upper arm (none on the right shoulder joint), the splinted free forearm, a lit face, its own boots');
      const ds = sprint(() => sprintEnds(rib));
      assert(ds > 0.15, `warden sprinting: the ribbon streams ${ds.toFixed(2)} m behind its root (> 0.15)`);
    }

    p.debug.fightStance = null;
    // (D) the route (HEROLOOK's), then a death on the ground (the lying frames): per frame
    let frames = 0, bad = 0, hemMin = Infinity, cornerMin = Infinity, tipLowFrames = 0, tipMin = Infinity, hemAt = '', cornerAt = '', tipAt = '', hemDeath = Infinity, tipDeath = Infinity;
    let pen = 0, penFrames = 0, penAt = '', counted = 0, headWorst = -1, headAt = '';
    let loco = 0, locoCross = 0, cross = 0, charge = 0, chargeHit = 0;
    let hand = 0, handNear = 0, handMin = Infinity, handAt = '';
    let phase = 'start', plate = -1, plateAt = '';
    // lying still after the death's collapse (the body lands ~1.38 s after the kill: player.js _tickDead)
    const DOWN_T = 1.6;
    let downFrames = 0, hemDown = Infinity, cornerDown = Infinity, tipDown = Infinity;
    let capeWorst = -1, capeAt = '', capeDeep = 0;
    const parts = [
      ['torso', r.spine, (x) => shell(x)],
      ['hips', r.pelvis, (x) => ell(x, BODY.hips.c, BODY.hips.r)],
      ['head', r.head, (x) => ell(x, BODY.head.c, BODY.head.r)],
      ...['R', 'L'].flatMap((s) => [
        [`thigh ${s}`, r.legs[s].thigh, (x) => cap(x, 0, D.thigh, BODY.thigh[0], BODY.thigh[1])],
        [`shin ${s}`, r.legs[s].shin, (x) => cap(x, -0.02, D.shin - 0.04, BODY.shin[0], BODY.shin[1])],
      ]),
    ];
    const inv = parts.map(() => new THREE.Matrix4());
    const sInv = r.streamers.flatMap(() => [new THREE.Matrix4(), new THREE.Matrix4()]);
    const headHung = r.streamers.map((S) => under(rootOf(S), r.head));
    const penBy = r.streamers.map(() => 0), handBy = r.streamers.map(() => 0), penPh = {};
    const tip = D.drawnTip ?? D.steelTip, palm = new THREE.Vector3();
    const finiteRig = () => { let ok = true; p.object3d.traverse((o) => { const e = o.matrixWorld.elements; for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) ok = false; }); return ok; };
    const each = () => {
      frames++;
      const lying = LYING.has(p.anim.key);
      if (!finiteRig()) bad++;
      const where = () => `${phase}, ${p.state} (${p.anim.key}) t ${(p.atk?.t ?? p.stateT ?? 0).toFixed(2)}`;
      // (the death's collapse is printed apart: every look's hem, today's included, digs in there.
      // Once he lies still (DOWN_T after the kill) the ground rules hold again and are checked: the
      // streamers' _layFlat (ADR-083) and the hem centre's floor, _hemY)
      if (p.state === 'dead') {
        for (const C of r.coat) hemDeath = Math.min(hemDeath, hemLow2(C, 0), hemLow2(C, 1), hemLow2(C, 0.5));
        for (const S of r.streamers) tipDeath = Math.min(tipDeath, v.set(0, -S.len[1], 0).applyMatrix4(S.segs[1].matrixWorld).y);
        if (lying && p.stateT >= DOWN_T) {
          downFrames++;
          for (const C of r.coat) { hemDown = Math.min(hemDown, hemLow2(C, 0.5)); cornerDown = Math.min(cornerDown, hemLow2(C, 0), hemLow2(C, 1)); }
          for (const S of r.streamers) tipDown = Math.min(tipDown, v.set(0, -S.len[1], 0).applyMatrix4(S.segs[1].matrixWorld).y);
        }
      } else {
        // the animator keeps the hem's centre off the grass (anim.js _hemY); its corners tilt with the
        // panel's sideways swing and the slant, by up to half its width: they get a looser bound
        r.coat.forEach((C, ci) => {
          const y = hemLow2(C, 0.5), yc = Math.min(hemLow2(C, 0), hemLow2(C, 1));
          if (y < hemMin) { hemMin = y; hemAt = `panel ${ci}, ${where()}`; }
          if (yc < cornerMin) { cornerMin = yc; cornerAt = `panel ${ci}, ${where()}`; }
        });
        let low = Infinity;
        r.streamers.forEach((S, si) => { v.set(0, -S.len[1], 0).applyMatrix4(S.segs[1].matrixWorld); if (v.y < low) low = v.y; if (v.y < tipMin) { tipMin = v.y; tipAt = `streamer ${si}, ${where()}`; } });
        if (low < -0.02) tipLowFrames++;
      }
      if (lying) return;
      // the cloth over the sword shoulder against the right upper arm
      if (shoulderCloth.length) {
        const fw = capeDepth();
        if (fw > capeWorst) { capeWorst = fw; capeAt = where(); }
        if (fw > 0.02) capeDeep++;
      }
      // (4) the cloth's centre lines out of the body
      counted++;
      parts.forEach((P, k) => inv[k].copy(P[1].matrixWorld).invert());
      let fpen = -1, fAt = '';
      r.streamers.forEach((S, si) => {
        let sp = -1;
        for (let s = 0; s < 2; s++) {
          for (const t of [0.25, 0.5, 0.75, 1]) {
            w.set(0, -t * S.len[s], 0).applyMatrix4(S.segs[s].matrixWorld);
            parts.forEach((P, k) => {
              const dep = P[2](q.copy(w).applyMatrix4(inv[k]));
              if (dep > sp) sp = dep;
              if (dep > fpen) { fpen = dep; fAt = `${P[0]} (streamer ${si} seg ${s} t ${t}), ${phase}`; }
              if (headHung[si] && k === 2 && dep > headWorst) { headWorst = dep; headAt = `streamer ${si} seg ${s} t ${t}, ${phase}`; }
            });
          }
        }
        if (sp > 0.02) { penBy[si]++; penPh[phase] = (penPh[phase] ?? 0) + 1; }
      });
      if (fpen > pen) { pen = fpen; penAt = fAt; }
      if (fpen > 0.02) penFrames++;
      // the drawn blade into the Warden's plates (the torso shell + 2.2 cm, rows 1.2-1.462 m)
      if (id === 'warden') {
        for (let z = 0.2; z <= tip + 1e-6; z += 0.05) {
          q.set(0, 0, z).applyMatrix4(r.sword.matrixWorld).applyMatrix4(inv[0]);
          const h = q.y + restSpine;
          if (h < 1.2 || h > 1.462) continue;
          const dep = shell(q, 0.022);
          if (dep > plate) { plate = dep; plateAt = `${phase}, ${p.state} t ${(p.atk?.t ?? p.stateT ?? 0).toFixed(2)}`; }
        }
      }
      // (5) the blade through the skirt, on the loco frames
      const c = coatCrossOf(r, tip, sheetOffset, v, w);
      if (c) cross++;
      if (p.state === 'idle' || p.state === 'run' || p.state === 'sprint') { loco++; if (c) locoCross++; }
      // (6) the blade against the sheets through the charge
      if (phase === 'charge') { charge++; if (sheetHit(r, m, v)) chargeHit++; }
      // (H) the free hand clear of every streamer sheet (not on the grip)
      if (p.anim.cur[45] > 0.6 || !r.streamers.length) return;
      hand++;
      palm.set(0, -(D.foreArm - 0.03) - 0.034 * BODY.hand, 0).applyMatrix4(r.arms.L.fore.matrixWorld);
      let dmin = Infinity;
      r.streamers.forEach((S, si) => {
        let sd = Infinity;
        for (let s = 0; s < 2; s++) {
          const I = sInv[si * 2 + s].copy(S.segs[s].matrixWorld).invert();
          q.copy(palm).applyMatrix4(I);
          const L = S.len[s], R0 = (S.wrap ?? 0.02) + (s ? 0.25 * S.len[0] : 0);
          for (const t of [0.25, 0.5, 0.75, 1]) {
            const wd = S.w ? S.w[s] + (S.w[s + 1] - S.w[s]) * t : 0.15, R = R0 + 0.25 * t * L;
            for (const u of [-wd / 2, 0, wd / 2]) {
              const dd = Math.hypot(q.x - Math.sin(u / R) * R, q.y + t * L, q.z - (Math.cos(u / R) - 1) * R);
              if (dd < dmin) dmin = dd;
              if (dd < sd) sd = dd;
            }
          }
        }
        if (sd < 0.06) handBy[si]++;
      });
      if (dmin < handMin) { handMin = dmin; handAt = `${phase}, ${p.state}`; }
      if (dmin < 0.06) handNear++;
    };
    // a panel's hem point `s` (0 … 1 across it; 0.5 its centre), world y
    const hemLow2 = (C, s) => {
      const P = C.def, sk = P.skew ?? 0, sl = P.slant ?? 0, w2 = P.w[2];
      const R = C.r0 + 0.25 * P.len[0] + 0.25 * P.len[1];
      const ang = ((s - 0.5) * w2 + sheetOffset(w2, P.w[0], sk)) / R;
      return v.set(Math.sin(ang) * R, -(P.len[1] + 0.02 + sl * (sk < 0 ? 1 - s : s)), (Math.cos(ang) - 1) * R).applyMatrix4(C.segs[1].matrixWorld).y;
    };
    const step = (s) => go(G, s, each);
    heroRoute(G, step, (ph) => { phase = ph; });
    phase = 'death';
    p.debug.kill();
    step(4);
    // … and killed lying in a knockdown (the 'deadDown' clip: he dies where he lies), once the clip has
    // settled (DD_T after the kill: before it, today's arm drape dips 17 cm into the grass, the robe's wing
    // and a scarf tail 3-4 cm, as the body sinks under springs that lag; printed only)
    const DD_T = 1.2;
    let ddFrames = 0, hemDD = Infinity, tipDD = Infinity, tipSettle = Infinity;
    {
      game.flow.debug.toState('boss');
      p.respawn(p.position.x, p.position.z);
      go(G, 1.0);
      p.debug.god = false;
      const strike = (o) => {
        p.hp = o.damage >= 999 ? 1 : p.maxHp;
        p.takeHit({ damage: 20, tell: TELL.NORMAL, attack: 'test', from: { x: p.position.x + Math.sin(p.yaw) * 3, z: p.position.z + Math.cos(p.yaw) * 3 }, knockback: 2, ...o });
      };
      strike({ knockdown: true });
      go(G, 0.55);
      strike({ damage: 999, knockback: 1 });
      go(G, 4, () => {
        if (p.state !== 'dead' || !p.deadDown || !LYING.has(p.anim.key)) return;
        let lo = Infinity;
        for (const S of r.streamers) lo = Math.min(lo, v.set(0, -S.len[1], 0).applyMatrix4(S.segs[1].matrixWorld).y);
        if (p.stateT < DD_T) { tipSettle = Math.min(tipSettle, lo); return; }
        ddFrames++;
        tipDD = Math.min(tipDD, lo);
        for (const C of r.coat) hemDD = Math.min(hemDD, hemLow2(C, 0.5));
      });
    }
    const pct = (x, n) => `${((100 * x) / Math.max(1, n)).toFixed(1)} %`;
    out(`   ${id} route: ${frames} frames; hems lowest ${hemMin.toFixed(3)} m (${hemAt}), their corners ${cornerMin.toFixed(3)} m (${cornerAt}); cloth tips lowest ${tipMin.toFixed(3)} m (${tipAt}; ${tipLowFrames} frames < -0.02); in the death's collapse: hems ${hemDeath.toFixed(3)} m, tips ${tipDeath.toFixed(3)} m`);
    out(`   ${id} cloth in the body: deepest ${(pen * 100).toFixed(1)} cm (${penAt || 'none'}), ${penFrames} of ${counted} frames > 2 cm (${pct(penFrames, counted)}); head-hung in the head ${headWorst < 0 ? 'never' : `${(headWorst * 100).toFixed(1)} cm (${headAt})`}`);
    out(`   ${id} steel: through the skirt on ${locoCross} of ${loco} loco frames (${cross} of ${counted} in all); by a sheet on ${chargeHit} of ${charge} charge frames; the free hand within 6 cm of a sheet on ${handNear} of ${hand} frames (${pct(handNear, hand)}; nearest ${Number.isFinite(handMin) ? (handMin * 100).toFixed(1) + ' cm, ' + handAt : 'n/a'})`);
    out(`   ${id} per streamer: in the body ${penBy.join(' / ')} frames (${Object.entries(penPh).map(([k, x]) => `${k} ${x}`).join(', ')}); near the hand ${handBy.join(' / ')}`);
    rates[id] = { pen: penFrames / Math.max(1, counted), loco: locoCross / Math.max(1, loco), hand: handNear / Math.max(1, hand) };
    assert(bad === 0 && hemMin >= -0.02 && cornerMin >= -0.1 && tipLowFrames <= 6 && tipMin >= -0.1,
      `${id} through the route and a death: the rig finite (${bad} bad frames); alive, the hems above the grass (centre ${hemMin.toFixed(3)} m ≥ -0.02, corners ${cornerMin.toFixed(3)} ≥ -0.10), cloth tips under it on ${tipLowFrames} frames (≤ 6; lowest ${tipMin.toFixed(3)} ≥ -0.10)`);
    // lying dead (after the standing death's collapse; killed in a knockdown): the streamers lie on the
    // grass, not in it (_layFlat, ADR-083); the hem centre within 12 cm of it (today's long tails
    // measure -0.093: _hemY's model lengths against drawn heights, a known gap); the corners printed
    const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a');
    assert(downFrames > 30 && tipDown >= -0.02 && hemDown >= -0.12 && ddFrames > 30 && tipDD >= -0.02 && hemDD >= -0.12,
      `${id} lying dead (${downFrames} frames from ${DOWN_T} s after the kill; killed in a knockdown, ${ddFrames} frames from ${DD_T} s): cloth tips at ${f3(tipDown)} / ${f3(tipDD)} m (≥ -0.02; settling in the knockdown: ${f3(tipSettle)}), hem centres ${f3(hemDown)} / ${f3(hemDD)} m (≥ -0.12; corners ${f3(cornerDown)})`);
    if (isNew) {
      assert(penFrames <= 0.03 * counted && headWorst <= 0.01, `${id}: the cloth stays out of his body (${penFrames} of ${counted} frames > 2 cm, ≤ 3 %), a head-hung sheet out of his head (${(Math.max(0, headWorst) * 100).toFixed(1)} cm ≤ 1)`);
      assert(locoCross <= Math.max(3, loco * 0.05) && chargeHit <= Math.max(2, charge * 0.05), `${id}: the blade through the skirt on ${locoCross} of ${loco} loco frames (≤ 5 %), by a sheet on ${chargeHit} of ${charge} charge frames (≤ 5 %)`);
      assert(handNear <= 0.02 * hand, `${id}: the free hand clear of the cloth (within 6 cm of a sheet on ${handNear} of ${hand} frames, ≤ 2 %)`);
    }
    if (shoulderCloth.length) {
      out(`   ${id}: the cloth over the sword shoulder in the right upper arm: ${(capeIdle * 100).toFixed(1)} cm standing, deepest ${(capeWorst * 100).toFixed(1)} cm (${capeAt}), ${capeDeep} of ${counted} frames > 2 cm`);
      if (id === DEFAULT_LOOK) cape0 = { worst: capeWorst, deep: capeDeep };
    }
    if (id === 'warden') {
      out(`   warden: the drawn blade ${(plate * 100).toFixed(1)} cm into the cuirass's plates at most (${plateAt || 'never'})`);
      assert(plate < 0.035, `warden: the drawn blade sinks at most ${(plate * 100).toFixed(1)} cm into the lamellar plates (< 3.5)`);
      // the capelet off the sword arm: clear of the hanging arm, and through the route no deeper and no
      // more often than today's mantle (rigid on the chest, the top of a raised arm meets either)
      assert(shoulderCloth.length > 0 && capeIdle <= 0.012 && cape0 && capeDeep <= cape0.deep && capeWorst <= cape0.worst + 0.005,
        `warden: the capelet off the sword arm (${(capeIdle * 100).toFixed(1)} cm into the hanging arm ≤ 1.2; > 2 cm on ${capeDeep} frames, today's mantle ${cape0?.deep}; deepest ${(capeWorst * 100).toFixed(1)} cm, today's ${((cape0?.worst ?? 0) * 100).toFixed(1)})`);
    }
  }
  out(`   cloth-in-body / blade-through-skirt / hand-near rates: ${Object.entries(rates).map(([k, x]) => `${k} ${(x.pen * 100).toFixed(1)} / ${(x.loco * 100).toFixed(1)} / ${(x.hand * 100).toFixed(1)} %`).join(' · ')}`);

  // (L) the Lab's OUTFIT row and live switching; a rebuild keeps the look's colours; a bad look or a
  // bad loadout throws and changes nothing, the shared part ink included
  const G = build({ heroLook: 'robe' });
  {
    const { game } = G, p = game.player;
    game.heroLooks = LOOK_IDS.map((id) => ({ id, name: HERO_LOOKS[id].name }));
    game.pickHeroLook = (id) => { game.player.setLook(id); game.heroLook = game.player.look; };
    G.input.tap('F1');
    G.tick(DT);
    const btns = game.lab.ui.lookBtns ?? [];
    const B = (id) => btns.find((x) => x.id === id);
    const robeOn = !!B('robe')?.el.classList.contains('on');
    B('swallow')?.el.dispatch('click');
    G.tick(DT);
    assert(btns.length === LOOK_IDS.length && robeOn && p.look === 'swallow' && p.loadout.head === 'swallow.tail' && B('swallow').el.classList.contains('on') && !B('robe').el.classList.contains('on'),
      `the Lab's OUTFIT row: ${btns.length} buttons; a click wears the Swallow (${p.look}, ${p.loadout.head}) and moves the highlight`);
    const fillIs = (c) => ['r', 'g', 'b'].every((k, i) => Math.abs(p.rig.materials.coat.uniforms.uArtFill.value[k] - c[i]) < 1e-6);
    p.setLoadout(p.loadout);
    const keeps = fillIs(SWALLOW_TINT.coat.fill);
    p.setLook('shroud');
    const back = fillIs(HERO_INK.coat.fill) && SLOTS.every((sl) => p.loadout[sl] === (DEFAULT_LOADOUT[sl] ?? null));
    p.equip('weapon', null);
    p.setLook('warden');
    const unarmed = p.loadout.weapon === null && p.loadout.chest === 'warden.cuirass';
    assert(keeps && back && unarmed, 'a rebuild keeps the look\'s colours; back to today\'s look and its colours; a look change keeps the equipped weapon (none)');
    // (a boss's own part ink on the page, as the Starless Lord's red part 19)
    game.U.uHeroPartInk.value[19].set(1.7, 0.34, 0.24, 1.6);
    const u0 = snapU(game.U), look0 = p.look, lo0 = JSON.stringify(p.loadout);
    let t1 = false, t2 = false;
    try { p.setLook('nope'); } catch { t1 = true; }
    const same1 = p.look === look0 && JSON.stringify(p.loadout) === lo0 && snapU(game.U) === u0;
    try { p.setLoadout({ ...p.loadout, back: 'no.such' }); } catch { t2 = true; }
    p.setLook('robe');
    p.setLook(look0);
    const kept = snapU(game.U) === u0;
    assert(t1 && t2 && same1 && kept && p.look === look0, 'an unknown look or item throws and changes nothing (the look, the loadout, the shared part ink); a look change keeps a boss rig\'s own part ink');
    go(G, 0.5);
  }
  return G;
}

// ================================================================== scenario: touch controls
// The REAL core/input.js fed by the touch controls (src/ui/touch.js) through pointer events on
// their DOM, exactly like a phone: tap / hold ATTACK, a timed BLOCK tap parries, DODGE rolls,
// the stick moves (rim = sprint), LOCK / FLASK / || pause, the prompt tap, auto-aim, the phone
// camera + pinch, the title tap, synthetic mouse after a touch ignored, the game held upright (portrait).
async function scenarioTouch() {
  out('\n== scenario TOUCH (virtual stick + buttons → real Input: tap / hold attack, parry, dodge, move) ==');
  const W0 = globalThis.innerWidth, H0 = globalThis.innerHeight;
  globalThis.innerWidth = 844; // a phone in landscape
  globalThis.innerHeight = 390;
  const G = build({ realInput: true });
  const { game, counts } = G;
  const input = game.input, t = game.touch, p = game.player, d = game.dragon, rig = game.cameraRig;
  const c = (n) => counts[n] || 0;
  const touch = (type, target, id, x = 0, y = 0) => {
    // a pad tile (ATTACK / BLOCK / DODGE) has no pointers of its own: the pad takes the touch at the tile's middle
    const tile = target?.classList?.contains('tc-tile') ? ['attack', 'heavy', 'block', 'dodge'].find((n) => target.classList.contains(`tc-${n}`)) : null;
    if (tile) {
      const m = t.padPoint(tile);
      target = cls('tc-pad');
      x = m.x;
      y = m.y;
    }
    target.dispatch(type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y });
  };
  const frames = (s, each) => { for (let i = 0, n = Math.round(s / DT); i < n; i++) { each?.(i); G.tick(DT); } };
  // desktop: nothing changes until a touch arrives
  assert(t.active === false && !cls('tc-root') && !rig.mobile && rig.targetDistance === CONFIG.camera.distance, 'inert without a touch: no touch DOM, desktop camera');
  assert(typeof input.setVirtual === 'function' && typeof input.setVirtualAxis === 'function', 'real Input exposes the virtual-source API');
  run(G, 1.0, { passive: true });
  // the first touch on the title turns the touch UI on and dismisses "press any key"
  fireWin('pointerdown', { pointerType: 'touch', pointerId: 1, target: G.canvas, clientX: 420, clientY: 200 });
  G.tick(DT);
  fireWin('pointerup', { pointerType: 'touch', pointerId: 1, target: G.canvas });
  assert(t.active && !!cls('tc-root') && cls('ab-root')?.classList.contains('ab-touch'), 'first touch → touch UI on (HUD in touch layout)');
  assert(game.state === 'explore', `title tap → explore (got ${game.state})`);
  assert(game.settings.quality === CONFIG.defaultQualityTouch, `touch → quality ${CONFIG.quality[game.settings.quality]?.name}`);
  assert(rig.mobile && rig.targetDistance === CONFIG.camera.mobileDistance && rig.maxExtraZoom === CONFIG.camera.mobileMaxExtraZoom, `phone camera: ${rig.targetDistance} m, extra zoom ≤ ${rig.maxExtraZoom} m`);
  fireWin('mousedown', { button: 0, target: G.canvas });
  assert(!input.mousePressed(0), 'the compatibility mousedown after a touch is ignored');
  input.endFrame();

  fightSetup(G);
  const B = (id) => cls(`tc-${id}`);
  const atk = B('attack'), hvy = B('heavy'), blk = B('block'), dge = B('dodge'), flask = B('flask'), lock = B('lock'), pause = B('pause'), zone = cls('tc-zone');
  assert(atk && hvy && blk && dge && flask && lock && pause && zone, 'stick zone + ATTACK / HEAVY / BLOCK / DODGE / FLASK / LOCK / || built');
  run(G, 0.2, { passive: true });
  assert(!cls('tc-root').classList.contains('off'), 'controls shown in the fight');
  // auto-aim: game.mouseGround sits on the dragon's lock point
  const lp = new THREE.Vector3();
  settle(G);
  place(G, 7);
  G.tick(DT);
  d.lockPoint(lp);
  assert(t.autoAim && Math.hypot(game.mouseGround.x - lp.x, game.mouseGround.z - lp.z) < 0.3, 'fight: auto-aim puts mouseGround on the dragon');
  const kinds = [];
  G.watch = (n, e) => { if (n === 'player:attack') kinds.push(e.kind); };
  // tap ATTACK → light swing
  settle(G); place(G, 6);
  touch('pointerdown', atk, 11);
  frames(0.1);
  touch('pointerup', atk, 11);
  frames(0.6);
  assert(kinds[0] === 'light', `ATTACK tap → light swing (${kinds.join(',')})`);
  // HEAVY tap → a heavy (ADR-115: HEAVY[0] on its own)
  settle(G); place(G, 6);
  kinds.length = 0;
  touch('pointerdown', hvy, 13);
  frames(0.1);
  touch('pointerup', hvy, 13);
  frames(0.9);
  assert(kinds[0] === 'heavy', `HEAVY tap → a heavy swing (${kinds.join(',')})`);
  // hold HEAVY → charge, release → the cleave
  settle(G); place(G, 6);
  kinds.length = 0;
  touch('pointerdown', hvy, 12);
  let charged = false;
  frames(0.9, () => { if (p.state === 'charge') charged = true; });
  G.tick(DT);
  const meter = hvy.find((e) => e.classList?.contains('t'))?.textContent ?? '';
  touch('pointerup', hvy, 12);
  frames(0.8);
  assert(charged && kinds.includes('cleave'), `HEAVY hold 0.9 s → charge → the cleave on release (${kinds.join(',')})`);
  assert(/^\[#+\.*\]$/.test(meter), `HEAVY shows the ASCII charge meter while held ("${meter}")`);
  // holding ATTACK no longer charges: a light, at once
  settle(G); place(G, 6);
  kinds.length = 0;
  touch('pointerdown', atk, 14);
  let chargedL = false;
  frames(0.9, () => { if (p.state === 'charge') chargedL = true; });
  touch('pointerup', atk, 14);
  frames(0.6);
  assert(!chargedL && kinds[0] === 'light', `ATTACK held 0.9 s is a light, not a charge (${kinds.join(',')})`);
  G.watch = null;
  // DODGE → roll
  settle(G); place(G, 8);
  const r0 = c('player:roll');
  touch('pointerdown', dge, 13);
  frames(0.05);
  const rolled = p.state === 'roll';
  touch('pointerup', dge, 13);
  frames(0.8);
  assert(rolled && c('player:roll') === r0 + 1, `DODGE → roll (state ${p.state})`);
  // BLOCK tapped just before the bite lands → parry (timed from the attack's own tell / flash)
  settle(G); place(G, 6);
  let impactT = null;
  G.watch = (n, e) => {
    if (e?.attack !== 'bite') return;
    if (n === 'combat:tell' && impactT === null) impactT = game.time + e.impactIn;
    if (n === 'combat:flash') impactT = game.time + TUNING.flashLead;
  };
  const pr0 = c('player:parry');
  assert(game.lab.trigger('bite') === true, 'lab.trigger(bite)');
  let pressedAt = null, liftAt = -1;
  for (let i = 0; i < Math.round(5 / DT); i++) {
    if (impactT !== null && pressedAt === null && impactT - game.time - DT <= 0.12) { pressedAt = impactT - game.time; touch('pointerdown', blk, 14); liftAt = i + 4; }
    if (i === liftAt) touch('pointerup', blk, 14);
    G.tick(DT);
    if (c('player:parry') > pr0 && i > liftAt) break;
  }
  G.watch = null;
  assert(c('player:parry') === pr0 + 1, `BLOCK tap ${(pressedAt ?? NaN).toFixed(2)} s before the bite → parry`);
  // BLOCK held → guard up
  settle(G);
  touch('pointerdown', blk, 15);
  frames(0.3);
  const guarded = p.state === 'block' && p.blocking;
  touch('pointerup', blk, 15);
  frames(0.3);
  assert(guarded && p.state !== 'block', `BLOCK hold → block, release → guard down (${p.state})`);
  // ---- the pad: three tiles that all touch; a touch goes to the nearest; a slide goes from tile to tile
  {
    settle(G); place(G, 12);
    const pad = cls('tc-pad'), geo = t.padGeo, T = geo.tiles;
    assert(!!pad && atk.classList.contains('tc-tile') && hvy.classList.contains('tc-tile') && blk.classList.contains('tc-tile') && dge.classList.contains('tc-tile') && !flask.classList.contains('tc-tile'), 'ATTACK / HEAVY / BLOCK / DODGE are tiles of the pad; FLASK is its own button');
    const touchSide = (a, b) => (a[2] === b[0] || b[2] === a[0]) ? Math.min(a[3], b[3]) - Math.max(a[1], b[1]) : (a[3] === b[1] || b[3] === a[1]) ? Math.min(a[2], b[2]) - Math.max(a[0], b[0]) : 0;
    // (ADR-115: a 2 x 2 square, BLOCK | HEAVY over DODGE | ATTACK: each tile shares an edge with the two beside it)
    const sides = [touchSide(T.attack, T.heavy), touchSide(T.attack, T.dodge), touchSide(T.block, T.heavy), touchSide(T.block, T.dodge)];
    assert(sides.every((v) => v >= 40), `each tile shares an edge with the two beside it (${sides.map((v) => v.toFixed(0)).join(' / ')} px)`);
    const A = t.padPoint('attack'), Bk = t.padPoint('block'), Dg = t.padPoint('dodge');
    assert(innerWidth - A.x >= 80 && innerHeight - A.y >= 80, `ATTACK sits out of the corner (its middle ${(innerWidth - A.x).toFixed(0)} px in, ${(innerHeight - A.y).toFixed(0)} px up)`);
    const P = (type, id, x, y) => pad.dispatch(type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y });
    const held = (code) => input.down(code);
    // a touch just outside the cluster goes to the nearest tile
    P('pointerdown', 40, geo.cx + 14, A.y);
    assert(held('@attack') && atk.classList.contains('on'), 'a touch 14 px off the edge of ATTACK presses ATTACK');
    P('pointerup', 40, geo.cx + 14, A.y);
    assert(!held('@attack') && !atk.classList.contains('on'), 'lifted: released');
    frames(0.8);
    // slide: ATTACK → BLOCK without lifting (the swing is cancelled into the guard)
    P('pointerdown', 41, A.x, A.y);
    frames(0.05);
    const edge = geo.cy - T.attack[3]; // the screen y of the ATTACK / BLOCK border
    P('pointermove', 41, A.x, edge - 6);
    assert(held('@attack') && !held('@block'), 'a thumb 6 px over the border still holds ATTACK (it sticks)');
    P('pointermove', 41, Bk.x, Bk.y);
    assert(!held('@attack') && held('@block') && blk.classList.contains('on') && !atk.classList.contains('on'), 'slid onto BLOCK: ATTACK released, BLOCK pressed');
    frames(0.3);
    assert(p.state === 'block' && p.blocking, `the slide raised the guard (${p.state})`);
    // BLOCK → DODGE, still the same finger
    const ro = c('player:roll');
    P('pointermove', 41, Dg.x, Dg.y);
    assert(!held('@block') && held('@dodge'), 'slid onto DODGE: BLOCK released, DODGE pressed');
    frames(0.1);
    assert(c('player:roll') === ro + 1, 'the slide rolled');
    // far off the pad the thumb keeps what it holds; lifting releases it
    P('pointermove', 41, Dg.x - 200, Dg.y - 150);
    assert(held('@dodge'), 'a slide far off the pad keeps the tile it holds');
    P('pointerup', 41, 0, 0);
    assert(!held('@dodge') && !held('@attack') && !held('@block') && t.padHeld.size === 0, 'lifted: everything released');
    frames(0.9);
    // two fingers, two tiles
    P('pointerdown', 42, Bk.x, Bk.y);
    P('pointerdown', 43, A.x, A.y);
    assert(held('@block') && held('@attack'), 'two fingers hold two tiles');
    P('pointerup', 42, Bk.x, Bk.y);
    P('pointerup', 43, A.x, A.y);
    frames(0.9);
    // the BLOCK tile carries the guard meter
    p.guard = p.maxGuard * 0.2;
    p.guardWait = 5;
    G.tick(DT);
    assert(blk.classList.contains('low') && Number(blk.style.getPropertyValue?.('--tc-gd') ?? blk.style['--tc-gd']) < 0.3, 'BLOCK shows the guard meter, low under 30 %');
    p.guard = p.maxGuard;
    p.guardWait = 0;
    // PAD POSITION / PAD SIZE: the player moves and sizes the cluster
    const a0 = t.padPoint('attack'), w0 = T.attack[2] - T.attack[0];
    assert(t.padPos === 'mid' && t.padSize === 'm', `the default placement (${t.padPos} / ${t.padSize})`);
    const pos2 = t.cyclePad('pos'), a1 = t.padPoint('attack');
    assert(pos2 === 'high' && a1.y < a0.y - 20 && a1.x < a0.x, `PAD POSITION mid → high: further up and in (${a0.x.toFixed(0)},${a0.y.toFixed(0)} → ${a1.x.toFixed(0)},${a1.y.toFixed(0)})`);
    const pos3 = t.cyclePad('pos'), a2 = t.padPoint('attack');
    assert(pos3 === 'low' && a2.y > a0.y + 10 && a2.x > a0.x, 'high → low: nearer the corner');
    t.cyclePad('pos');
    const s2 = t.cyclePad('size'), w1 = t.padGeo.tiles.attack[2] - t.padGeo.tiles.attack[0];
    assert(s2 === 'l' && w1 > w0 * 1.1, `PAD SIZE m → l: larger tiles (${w0} → ${w1.toFixed(0)} px)`);
    t.cyclePad('size');
    t.cyclePad('size');
    assert(t.padPos === 'mid' && t.padSize === 'm' && near(t.padPoint('attack').x, a0.x, 1e-6), 'cycled back to the default');
    P('pointerdown', 44, t.padPoint('dodge').x, t.padPoint('dodge').y);
    assert(held('@dodge'), 'the hit test follows the placement');
    P('pointerup', 44, 0, 0);
    frames(0.9);
  }
  // stick: up = north, the rim = sprint; release stops
  settle(G); place(G, 14);
  const z0 = p.position.z;
  touch('pointerdown', zone, 16, 150, 300);
  touch('pointermove', zone, 16, 150, 262); // 38 px of 52: past runAt, full run speed
  frames(0.6);
  const ran = p.state === 'run' && p.position.z < z0 - 1.5;
  const ax = input.moveAxis();
  touch('pointermove', zone, 16, 150, 230); // past the rim
  frames(0.3);
  const sprinted = p.state === 'sprint' && input.act('sprint');
  touch('pointerup', zone, 16);
  frames(0.5);
  assert(ran && Math.abs(ax.x) < 1e-6 && ax.y > 0.99, `stick up → hero runs north (Δz ${(p.position.z - z0).toFixed(2)} m, axis ${ax.x.toFixed(2)},${ax.y.toFixed(2)})`);
  assert(sprinted, 'stick at the rim → sprint (ShiftLeft held)');
  const ax2 = input.moveAxis();
  assert((p.state === 'idle' || p.state === 'run') && !input.act('sprint') && ax2.x === 0 && ax2.y === 0, `stick release → stops, sprint off (${p.state})`);
  // LOCK toggles lock-on; FLASK drinks
  const tapBtn = (b, id) => { touch('pointerdown', b, id); frames(0.05); touch('pointerup', b, id); frames(0.1); };
  settle(G); place(G, 8);
  tapBtn(lock, 17);
  const locked = p.lockOn;
  tapBtn(lock, 18);
  assert(locked && !p.lockOn, 'LOCK toggles lock-on (Tab)');
  settle(G);
  p.hp = 50;
  const h0 = c('player:heal');
  tapBtn(flask, 19);
  frames(1.0);
  assert(c('player:heal') === h0 + 1, 'FLASK → drink (KeyF)');
  // || → pause; controls hide and every virtual input is released
  touch('pointerdown', atk, 20);
  tapBtn(pause, 21);
  assert(game.state === 'paused' && cls('tc-root').classList.contains('off') && !input.act('attack'), `|| → paused, controls hidden + released (${game.state})`);
  touch('pointerup', atk, 20);
  game.flow.resume();
  frames(0.2);
  // pinch: two bare-screen fingers zoom the camera within the phone range
  const z1 = rig.targetDistance;
  fireWin('pointerdown', { pointerType: 'touch', pointerId: 31, target: G.canvas, clientX: 400, clientY: 150 });
  fireWin('pointerdown', { pointerType: 'touch', pointerId: 32, target: G.canvas, clientX: 500, clientY: 150 });
  fireWin('pointermove', { pointerType: 'touch', pointerId: 32, clientX: 500, clientY: 150 });
  fireWin('pointermove', { pointerType: 'touch', pointerId: 32, clientX: 600, clientY: 150 });
  fireWin('pointerup', { pointerType: 'touch', pointerId: 31 });
  fireWin('pointerup', { pointerType: 'touch', pointerId: 32 });
  assert(rig.targetDistance < z1 - 3 && rig.targetDistance >= CONFIG.camera.mobileMinDistance, `pinch apart → closer (${z1} → ${rig.targetDistance.toFixed(1)} m)`);
  // explore at the bonfire: the "[E] Rest" prompt is a tap target
  assert(game.flow.debug.toState('explore') === true, 'toState(explore)');
  frames(0.3);
  const rest0 = c('bonfire:rest');
  assert(/\[@interact\]/.test(game.hud.promptText ?? ''), `prompt up at the bonfire ("${game.hud.promptText}")`);
  touch('pointerdown', game.hud.promptEl, 22);
  frames(0.05);
  touch('pointerup', game.hud.promptEl, 22);
  frames(0.2);
  assert(c('bonfire:rest') === rest0 + 1, 'prompt tap → rest at the bonfire (@interact)');
  // auto-aim off (dragon asleep): aim follows the stick
  touch('pointerdown', zone, 23, 150, 300);
  touch('pointermove', zone, 23, 190, 300); // right = east
  frames(0.1);
  touch('pointerup', zone, 23);
  frames(0.05);
  assert(!t.autoAim && game.mouseGround.x > p.position.x + 3 && Math.abs(game.mouseGround.z - p.position.z) < 0.5, 'no target: aim follows the stick (east)');
  // held upright (portrait): the game plays on, the controls move to the lower part of the screen, the camera opens
  {
    const st0 = game.state, dist0 = rig.defaultDistance;
    touch('pointerdown', zone, 24, 150, 300); // a held stick is let go when the phone is turned
    globalThis.innerWidth = 390;
    globalThis.innerHeight = 844;
    frames(0.1);
    assert(t.portrait && t.phone && game.state === st0 && !document.body.find((e) => e.classList?.contains('tc-rotate')), `portrait: no rotate overlay, no pause (${game.state})`);
    assert(!cls('tc-root').classList.contains('off') && t._live(), 'the controls stay live held upright');
    assert(t.stick.id === null && !input.down('@sprint'), 'turning the phone lets go of every held control');
    assert(rig.portrait && near(rig.defaultDistance, dist0 * CONFIG.camera.portraitDistance, 1e-6) && rig.lead === CONFIG.camera.portraitLead, `the phone camera stands further back and leads south (${rig.defaultDistance} m, lead ${rig.lead} m)`);
    const fP = fovFor(390 / 844), fL = fovFor(844 / 390);
    assert(fL === CONFIG.camera.fov && fP > 55 && fP <= CONFIG.camera.portraitMaxFov, `the view opens when the window is upright (${fL}° → ${fP.toFixed(1)}°)`);
    const hf = 2 * Math.atan(Math.tan((fP * Math.PI) / 360) * (390 / 844)) * 180 / Math.PI;
    assert(near(hf, CONFIG.camera.fov, 0.01), `and is as wide as a square window's (${hf.toFixed(2)}° across)`);
    const A2 = t.padPoint('attack'), G2 = t.padGeo;
    const left = G2.cx - Math.max(...Object.values(G2.tiles).map((r) => r[2]));
    assert(A2.x > 195 && A2.x < 390 && A2.y > 844 * 0.55 && A2.y < 844 - 60 && left > 150, `the pad sits in the lower right of the upright screen (ATTACK at ${A2.x.toFixed(0)}, ${A2.y.toFixed(0)}; its left edge at ${left.toFixed(0)})`);
    assert(t.stick.ox + 62 < left && t.stick.oy > 844 * 0.55, `the stick rests beside it, not under it (${t.stick.ox.toFixed(0)}, ${t.stick.oy.toFixed(0)})`);
    const pad2 = cls('tc-pad');
    pad2.dispatch('pointerdown', { pointerType: 'touch', pointerId: 25, clientX: A2.x, clientY: A2.y });
    assert(input.down('@attack'), 'ATTACK pressed at its portrait place');
    pad2.dispatch('pointerup', { pointerType: 'touch', pointerId: 25, clientX: A2.x, clientY: A2.y });
    frames(0.6);
    const hi = t.cyclePad('pos'), A3 = t.padPoint('attack');
    assert(hi === 'high' && A3.y < A2.y - 40, `PAD POSITION works upright too (${A2.y.toFixed(0)} → ${A3.y.toFixed(0)})`);
    t.cyclePad('pos');
    t.cyclePad('pos');
    globalThis.innerWidth = 844;
    globalThis.innerHeight = 390;
    frames(0.1);
    assert(!t.portrait && !rig.portrait && rig.lead === 0 && near(rig.defaultDistance, dist0, 1e-6) && game.state === st0, 'landscape again: the landscape camera and layout back, still playing');
  }
  // the Lab switch turns it all off again: desktop camera, quality and HUD back
  t.setActive(false);
  frames(0.05);
  assert(!t.active && !rig.mobile && rig.targetDistance === CONFIG.camera.distance && game.settings.quality === CONFIG.defaultQuality && !cls('ab-root')?.classList.contains('ab-touch'), 'setActive(false) → desktop camera, quality and HUD back');
  globalThis.innerWidth = W0;
  globalThis.innerHeight = H0;
  return G;
}

// ================================================================== scenario: gamepad
// The REAL core/input.js fed by the gamepad layer (src/ui/gamepad.js) from a fake "standard" pad
// behind navigator.getGamepads(): activation by use (and back to keyboard), the title's any button,
// a held button never leaking across a mode change, analog move + L3 sprint, attack tap / charge
// hold, trigger hysteresis, dodge, flask, lock, the prompt on Y, right-stick aim and auto-aim,
// pause-menu focus, rumble, a PlayStation layout, NaN axes, and a disconnect mid-fight pausing.
async function scenarioPad() {
  out('\n== scenario PAD (fake standard gamepad → real Input: menus, move, attack, guard, aim, rumble) ==');
  const nav = globalThis.navigator;
  let pads = [];
  Object.defineProperty(nav, 'getGamepads', { value: () => pads, configurable: true, writable: true });
  const mkPad = (id) => ({
    id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    vibrationActuator: { effects: [], playEffect(type, o) { this.effects.push({ type, ...o }); return Promise.resolve('complete'); } },
  });
  const G = build({ realInput: true });
  const { game, counts } = G;
  const input = game.input, gp = game.gamepad, p = game.player, d = game.dragon;
  const c = (n) => counts[n] || 0;
  const frames = (s) => { for (let i = 0, n = Math.max(1, Math.round(s / DT)); i < n; i++) G.tick(DT); };
  const html = () => document.documentElement.classList;
  const pad = mkPad('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)');
  const btn = (i, on = true, v = on ? 1 : 0) => { pad.buttons[i].pressed = on && v > 0.5; pad.buttons[i].value = v; };
  const tap = (i, hold = 0.05, after = 0.1) => { btn(i); frames(hold); btn(i, false); frames(after); };
  const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13 };

  assert(gp && gp.active === false && !html().contains('abyss-pad'), 'no pad: inert, no pad class');
  frames(0.8);
  pads = [null, pad];
  frames(0.2);
  assert(gp.connected && !gp.active && game.state === 'title', 'a pad connected but untouched: not the device in use yet');
  // the title: A starts, the pad becomes the device in use; the A held into play never rolls
  const roll0 = c('player:roll');
  btn(B.A);
  frames(0.5);
  assert(gp.active && html().contains('abyss-pad') && cls('ab-root')?.classList.contains('ab-pad'), 'first press → pad active (html.abyss-pad, HUD .ab-pad)');
  assert(game.state === 'explore', `title: A → explore (got ${game.state})`);
  assert(c('player:roll') === roll0 && !input.act('dodge'), 'the A that closed the title, still held, does not roll');
  btn(B.A, false);
  frames(0.1);
  // the prompt reads "[Y] Rest" and Y rests at the bonfire (the prompt's KeyE)
  assert(game.flow.debug.toState('explore') === true, 'toState(explore)');
  frames(0.3);
  assert(/\[@interact\]/.test(game.hud.promptText ?? '') && game.hud.promptEl.textContent.startsWith('Y'), `prompt drawn with Y ("${game.hud.promptEl.textContent}")`);
  const rest0 = c('bonfire:rest');
  tap(B.Y, 0.05, 0.3);
  assert(c('bonfire:rest') === rest0 + 1, 'Y at the bonfire → rest (@interact)');
  frames(1.5);
  // analog move: stick up = north (−Z); half deflection runs slower than full
  const z0 = p.position.z;
  pad.axes[1] = -0.55;
  frames(0.1);
  const half = p.intent.len;
  pad.axes[1] = -1;
  frames(0.6);
  assert(half > 0.3 && half < 0.8 && p.intent.len > 0.99 && p.intent.z < 0, `stick: analog (half ${half.toFixed(2)}, full ${p.intent.len.toFixed(2)})`);
  assert(p.position.z < z0 - 1.5, `stick up → the hero runs north (${(z0 - p.position.z).toFixed(1)} m)`);
  tap(B.L3, 0.05, 0.05);
  assert(p.intent.sprint, 'L3 click while moving → sprint');
  pad.axes[1] = 0;
  frames(0.1);
  pad.axes[1] = -1;
  frames(0.1);
  assert(!p.intent.sprint, 'letting the stick go ends the L3 sprint');
  btn(B.B);
  frames(0.1);
  assert(p.intent.sprint, 'B held → sprint');
  btn(B.B, false);
  pad.axes[1] = 0;
  frames(0.5);
  // the fight: attack tap / charge, guard on the analog trigger, dodge, flask, lock, aim
  fightSetup(G);
  settle(G); place(G, 6);
  const kinds = [];
  G.watch = (n, e) => { if (n === 'player:attack') kinds.push(e.kind); };
  tap(B.RB, 0.05, 0.6);
  assert(kinds[0] === 'light', `RB tap → light attack (${kinds.join()})`);
  settle(G); place(G, 6);
  const ch0 = c('player:charge');
  btn(B.RT, true, 0.8);
  frames(1.2);
  btn(B.RT, false);
  frames(0.6);
  assert(c('player:charge') === ch0 + 1 && kinds.includes('cleave'), `RT held → charge, release → the cleave (${kinds.join()})`);
  G.watch = null;
  settle(G); place(G, 8);
  btn(B.LT, false, 0.6);
  frames(0.2);
  const blocking = p.state === 'block' && input.act('block');
  btn(B.LT, false, 0.4);
  frames(0.1);
  const still = input.act('block');
  btn(B.LT, false, 0.1);
  frames(0.1);
  assert(blocking && still && !input.act('block'), `LT: block at 0.6, held at 0.4 (hysteresis), up at 0.1 (state ${p.state})`);
  settle(G); place(G, 8);
  const r0 = c('player:roll');
  tap(B.A, 0.05, 0.8);
  assert(c('player:roll') === r0 + 1, 'A → dodge roll (Space)');
  settle(G);
  p.hp = 50;
  const h0 = c('player:heal');
  tap(B.X, 0.05, 1.0);
  assert(c('player:heal') === h0 + 1, 'X → drink flask (KeyF)');
  settle(G); place(G, 8);
  tap(B.R3);
  const locked = p.lockOn;
  tap(B.R3);
  assert(locked && !p.lockOn, 'R3 toggles lock-on (Tab)');
  // aim: idle right stick → auto-aim on the boss; deflected → it steers (east)
  settle(G); place(G, 7);
  G.tick(DT);
  const lp = new THREE.Vector3();
  d.lockPoint(lp);
  assert(gp.autoAim && Math.hypot(game.mouseGround.x - lp.x, game.mouseGround.z - lp.z) < 0.3, 'right stick idle: auto-aim on the boss');
  pad.axes[2] = 1;
  G.tick(DT);
  assert(!gp.autoAim && game.mouseGround.x > p.position.x + 3 && Math.abs(game.mouseGround.z - p.position.z) < 0.5, 'right stick east → aim east');
  pad.axes[2] = 0;
  // rumble on the hero's hits / guards (here a block)
  const fx0 = pad.vibrationActuator.effects.length;
  game.events.emit('player:block', { damage: 4, tell: 'normal' });
  const fx = pad.vibrationActuator.effects.at(-1);
  assert(pad.vibrationActuator.effects.length === fx0 + 1 && fx.type === 'dual-rumble' && fx.duration > 0 && fx.weakMagnitude > 0, 'player:block → a dual-rumble on the pad');
  // pause: Menu pauses (held, it does not unpause), the D-pad walks the menu, A presses, B resumes
  frames(0.2);
  btn(B.START);
  frames(0.3);
  assert(game.state === 'paused', `Menu → paused (${game.state})`);
  btn(B.START, false);
  frames(0.05);
  tap(B.DOWN);
  const qBtn = game.hud.pauseUi.btnQuality;
  assert(qBtn.classList.contains('pad-focus') && gp.focus === 1, 'D-pad down → focus on QUALITY');
  const q0 = game.settings.quality;
  tap(B.A);
  assert(game.settings.quality !== q0 && game.state === 'paused', `A on QUALITY → quality cycles (${q0} → ${game.settings.quality}), still paused`);
  btn(B.B);
  frames(0.3);
  assert(game.state === 'boss' && !p.intent.sprint && !qBtn.classList.contains('pad-focus'), `B → resumed (${game.state}); the B held into play does not sprint`);
  btn(B.B, false);
  frames(0.1);
  // the keyboard takes over: the pad hints go, its holds are released; the pad wins back on use
  btn(B.LB);
  frames(0.1);
  fireWin('keydown', { code: 'KeyW', repeat: false });
  frames(0.05);
  fireWin('keyup', { code: 'KeyW' });
  frames(0.05);
  assert(!gp.active && !html().contains('abyss-pad') && !input.act('block'), 'a key press → keyboard in use: pad hints off, the pad\'s held guard released');
  btn(B.LB, false);
  pad.axes[0] = 0.9;
  frames(0.1);
  assert(gp.active && html().contains('abyss-pad'), 'the stick → the pad is the device in use again');
  // non-finite axes read as centred
  pad.axes = [NaN, Infinity, -Infinity, NaN];
  frames(0.1);
  const m = input.moveAxis();
  assert(m.x === 0 && m.y === 0, 'NaN / Infinity axes → centred');
  pad.axes = [0, 0, 0, 0];
  // a PlayStation pad: its labels (the prompt's interact button too)
  const ps = mkPad('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)');
  pads = [ps];
  ps.buttons[B.LB].pressed = true; ps.buttons[B.LB].value = 1;
  frames(0.05);
  ps.buttons[B.LB].pressed = false; ps.buttons[B.LB].value = 0;
  frames(0.05);
  const hintKeys = cls('ab-hint')?.findAll((e) => e.classList?.contains('ab-key')).map((e) => e.textContent).join(' ');
  assert(gp.layout === 'ps' && input.bindings.padText('interact', gp.layout) === '△' && input.bindings.padText('attack', gp.layout) === 'R1' && hintKeys === 'SHARE OPTIONS',
    `DualSense → PlayStation labels (interact ${input.bindings.padText('interact', gp.layout)}, the corner hint: ${hintKeys})`);
  // a disconnect mid-fight pauses and hands the screen back to the keyboard hints
  pads = [];
  frames(0.1);
  assert(!gp.connected && !gp.active && game.state === 'paused' && !html().contains('abyss-pad'), `pad unplugged mid-fight → paused (${game.state})`);
  game.flow.resume();
  frames(0.1);
  delete nav.getGamepads;
  return G;
}

// ================================================================== scenario: remap
// core/bindings.js rules (swap on a clash, reserved keys, fixed pause, persistence and repair) and
// the pause menu's CONTROLS panel (ui/remap.js) driven like a player would: keyboard, mouse and pad
// picks, the game obeying the new keys, the key chips following every change.
async function scenarioRemap() {
  out('\n== scenario REMAP (bindings: swap, reserved, saved; the CONTROLS panel by key, mouse and pad) ==');
  // ---- the rules, on their own
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  const b = new Bindings(storage);
  assert(b.isDefault() && b.codes('dodge').join() === 'Space' && b.buttons('attack').join() === '5' && b.buttons('heavy').join() === '7', 'defaults: Space dodges, RB light, RT heavy');
  assert(b.codes('attack').join() === 'Mouse0' && b.codes('heavy').join() === 'Mouse2' && b.codes('block').join() === 'Mouse1' && b.codes('lockOn').join() === 'Tab', 'defaults (ADR-115): LMB light, RMB heavy, MMB block, Tab lock-on');
  assert(b.bindKey('dodge', 'KeyQ') && b.codes('dodge').join() === 'KeyQ' && !ACTIONS.some((a) => b.codes(a.id).includes('Space')), 'bind Q to dodge: Space is free');
  assert(b.bindKey('dodge', 'KeyF') && b.codes('dodge').join() === 'KeyF' && b.codes('flask').join() === 'KeyQ', 'F (the flask key) to dodge → a swap: the flask gets Q');
  assert(b.bindKey('up', 'ArrowDown') && b.codes('up').join() === 'ArrowDown' && b.codes('down').join() === 'KeyS', 'a taken alternate (↓) moves without a swap when its action keeps a key');
  assert(!b.bindKey('dodge', 'Escape') && !b.bindKey('dodge', 'F1') && !b.bindKey('pause', 'KeyP') && !b.bindPad('dodge', 9) && !b.bindKey('zoomIn', 'KeyZ'), 'refused: Esc, F1, the fixed pause, the pad\'s Menu, a pad-only action on the keyboard');
  assert(b.bindPad('attack', 0) && b.buttons('attack').join() === '0' && b.buttons('dodge').join() === '5', 'pad: A to attack → dodge takes RB');
  assert(b.moveText() === '↓ASD', `the move chip follows (${b.moveText()})`);
  const b2 = new Bindings(storage);
  assert(b2.codes('dodge').join() === 'KeyF' && b2.codes('flask').join() === 'KeyQ' && b2.buttons('attack').join() === '0', 'saved: a new Bindings on the same storage loads them');
  b2.reset(true, 'pad');
  assert(b2.buttons('attack').join() === '5' && b2.codes('dodge').join() === 'KeyF', 'reset the pad tab only: the keyboard keeps its remap');
  mem.set('abyss.bindings.v2', '{ not json');
  assert(new Bindings(storage).isDefault(), 'corrupt storage → defaults');
  mem.set('abyss.bindings.v2', JSON.stringify({ kb: { dodge: ['KeyF'], flask: ['KeyF'], attack: ['Escape', 7] }, pad: { attack: [5, 99, 9] } }));
  const b3 = new Bindings(storage);
  assert(b3.isDefault('kb') && b3.buttons('attack').join() === '5' && b3.buttons('block').join() === '4,6',
    `stored clash that would leave the flask unbound → keyboard defaults; pad junk (99, Menu) dropped (attack ${b3.buttons('attack')})`);
  {
    // (a v1 save put the guard on the right click, now the heavy's: it is not read)
    const m1 = new Map([['abyss.bindings.v1', JSON.stringify({ kb: { block: ['Mouse2'] } })]]);
    const b4 = new Bindings({ getItem: (k) => m1.get(k) ?? null, setItem: (k, v) => m1.set(k, String(v)) });
    assert(b4.isDefault() && b4.codes('block').join() === 'Mouse1' && b4.codes('heavy').join() === 'Mouse2', 'a v1 save (the guard on RMB) is not read: the new defaults stand');
  }

  // ---- the panel, in the game
  const nav = globalThis.navigator;
  let pads = [];
  Object.defineProperty(nav, 'getGamepads', { value: () => pads, configurable: true, writable: true });
  const G = build({ realInput: true });
  const { game, counts } = G;
  const input = game.input, B = input.bindings, p = game.player, R = game.hud.remapUi, P = game.hud.pauseUi;
  const c = (n) => counts[n] || 0;
  const frames = (s) => { for (let i = 0, n = Math.max(1, Math.round(s / DT)); i < n; i++) G.tick(DT); };
  const key = (code) => { const eaten = fireWin('keydown', { code, repeat: false }); frames(0.05); fireWin('keyup', { code }); frames(0.05); return eaten; };
  const row = (id) => R.rows.find((r) => r.id === id);
  const chip = (act, dev) => ui.find((e) => e.dataset?.act === act && (dev ? e.dataset.dev === dev : !e.dataset.dev) && e.isConnected);
  frames(0.8);
  key('Space'); // leave the title
  assert(game.flow.debug.toState('explore') === true, 'toState(explore)');
  frames(0.3);
  key('Escape');
  assert(game.state === 'paused' && P.buttons.includes(P.btnControls), `Esc → paused; the menu has CONTROLS (${game.state})`);
  P.btnControls.click();
  assert(R.on && R.tab === 'kb' && P.root.classList.contains('remap') && R.rows.some((r) => r.id === 'dodge') && !R.rows.some((r) => r.id === 'pause' || r.id === 'zoomIn'),
    'CONTROLS opens on the keyboard tab: rows for the remappable actions (not pause, not pad-only zoom)');
  // keyboard: pick DODGE, press Q; the game never sees the Q
  row('dodge').btn.click();
  assert(R.waiting === 'dodge' && /press/.test(row('dodge').v.textContent), 'DODGE picked: "press a key or click…"');
  const eaten = fireWin('keydown', { code: 'KeyQ', repeat: false });
  assert(eaten && !input.pressed('KeyQ') && B.codes('dodge').join() === 'KeyQ' && row('dodge').v.textContent === 'Q' && !R.waiting, 'Q → dodge; the panel swallowed the key');
  input.endFrame();
  fireWin('keyup', { code: 'KeyQ' });
  assert(chip('dodge', 'kb')?.textContent === 'Q', `the controls grid relabelled (${chip('dodge', 'kb')?.textContent})`);
  // mouse: pick LOCK-ON, click the middle button
  row('lockOn').btn.click();
  fireWin('mousedown', { button: 1, target: G.canvas });
  assert(B.codes('lockOn').join() === 'Mouse1' && row('lockOn').v.textContent === 'MMB', 'a middle click → lock-on on MMB');
  // reserved: F1 is refused, the pick ends, the flask keeps F
  row('flask').btn.click();
  fireWin('keydown', { code: 'F1', repeat: false });
  assert(B.codes('flask').join() === 'KeyF' && R.hint.classList.contains('warn') && !R.waiting, `F1 refused ("${R.hint.textContent}")`);
  // Esc cancels a pick, then closes the panel (the game stays paused)
  row('flask').btn.click();
  fireWin('keydown', { code: 'Escape', repeat: false });
  assert(!R.waiting && R.on && B.codes('flask').join() === 'KeyF', 'Esc cancels a pick');
  fireWin('keydown', { code: 'Escape', repeat: false });
  frames(0.05);
  assert(!R.on && game.state === 'paused' && !P.root.classList.contains('remap'), `Esc again closes CONTROLS, still paused (${game.state})`);
  game.flow.resume();
  frames(0.3);
  // the game obeys: Q rolls, Space does nothing; the prompt's chip follows a remap of interact
  const r0 = c('player:roll');
  key('Space');
  frames(0.6);
  const r1 = c('player:roll');
  key('KeyQ');
  frames(0.8);
  assert(r1 === r0 && c('player:roll') === r0 + 1, `Space no longer rolls, Q does (${r0} → ${r1} → ${c('player:roll')})`);
  assert(game.flow.debug.toState('explore') === true, 'toState(explore) at the bonfire');
  frames(0.3);
  assert(game.hud.promptEl.textContent.startsWith('E'), `prompt "${game.hud.promptEl.textContent}"`);
  B.bindKey('interact', 'KeyG');
  assert(game.hud.promptEl.textContent.startsWith('G'), `interact → G: the prompt relabels ("${game.hud.promptEl.textContent}")`);
  const rest0 = c('bonfire:rest');
  key('KeyE');
  frames(0.2);
  const restE = c('bonfire:rest');
  key('KeyG');
  frames(0.3);
  assert(restE === rest0 && c('bonfire:rest') === rest0 + 1, 'E no longer rests, G does');

  // ---- the pad: Menu → CONTROLS (D-pad) → the controller tab → DODGE → press X
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const btn = (i, on = true) => { pad.buttons[i].pressed = on; pad.buttons[i].value = on ? 1 : 0; };
  const tap = (i) => { btn(i); frames(0.05); btn(i, false); frames(0.08); };
  pads = [pad];
  frames(0.1);
  tap(9);
  assert(game.state === 'paused' && game.gamepad.active, `Menu → paused (${game.state})`);
  for (let i = 0; i < P.buttons.indexOf(P.btnControls); i++) tap(13);
  assert(P.btnControls.classList.contains('pad-focus'), 'D-pad down to CONTROLS');
  tap(0);
  assert(R.on && R.tab === 'pad' && !R.rows.some((r) => r.id === 'up') && R.rows.some((r) => r.id === 'zoomIn'), 'A → CONTROLS opens on the controller tab (no move keys; zoom is there)');
  const di = R.navButtons.indexOf(row('dodge').btn);
  for (let i = 0; i < di; i++) tap(13);
  assert(row('dodge').btn.classList.contains('pad-focus'), `D-pad to DODGE (row ${di})`);
  tap(0);
  assert(R.waiting === 'dodge', 'A picks DODGE: waiting for a button');
  tap(2);
  assert(B.buttons('dodge').join() === '2' && B.buttons('flask').join() === '0' && row('dodge').v.textContent === 'X' && !R.waiting, `X → dodge, the flask takes A (swap) (${row('flask').v.textContent})`);
  tap(1);
  assert(!R.on && game.state === 'paused', `B closes CONTROLS only (${game.state})`);
  tap(1);
  assert(game.state === 'explore', `B again resumes (${game.state})`);
  frames(0.3);
  p.hp = 50;
  const h0 = c('player:heal'), r2 = c('player:roll');
  tap(2);
  frames(0.8);
  tap(0);
  frames(1.0);
  assert(c('player:roll') === r2 + 1 && c('player:heal') === h0 + 1, 'in play: X rolls, A drinks');
  B.reset(false);
  delete nav.getGamepads;
  return G;
}

// ================================================================== scenario: string timing / coverage
// The verifier for the melee strings (contract 1): every hit of every string, started through the
// AI's own start path (no Lab face-turn) from placements the AI would pick it at (its band), the hero
// standing still (god mode, held at his spot). Per hit: first contact - (its combat:flash + flashLead).
// Every contact must land within ±85 ms of its flash; the first hit must land from every AI pick.
async function scenarioTiming() {
  out('\n== scenario TIMING (strings: each hit lands within ±85 ms of its flash + lead, AI picks, phases 1-3) ==');
  const G = build();
  const { game } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player;
  const { ATTACKS } = await imp('src/entities/dragon/attacks.js');
  const { attackWeight } = await imp('src/entities/dragon/ai.js');
  const lead = TUNING.flashLead, TOL = 0.085;
  // the strings, plus the single melee attacks they share performances with (unchanged numbers)
  let names = (process.env.ABYSS_TM || 'clawCombo,rendingFlurry,hesitantMaw,wingBuffet,tailLash,pounce,frenzy,blackMaw,stormFlurry,wingRend,pivotLash,rearGuard,skyHammer,furnaceMaw,cinderRake,cataclysm,bite,swipe,tail,stomp').split(',');
  // one part of the list (tests/run.mjs runs the n parts side by side): every n-th name from the k-th
  if (process.env.ABYSS_TM_SHARD) {
    const m = /^(\d+)\/(\d+)$/.exec(process.env.ABYSS_TM_SHARD);
    const k = m ? +m[1] : 0, n = m ? +m[2] : 0;
    if (!(n >= 1 && k >= 1 && k <= n)) { assert(false, `ABYSS_TM_SHARD is k/n with 1 <= k <= n (${process.env.ABYSS_TM_SHARD})`); return G; }
    names = names.filter((_, i) => i % n === k - 1);
    out(`   part ${k} of ${n}: ${names.join(', ')}`);
  }
  const DISTS = [2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10, 12.5];
  const ANGS = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.5, -1.5, 1.9, -1.9, 2.5, -2.5, Math.PI];
  const report = {};
  let worst = 0, bad = 0, firstMiss = 0, picks = 0;
  const flashes = [], hits = [];
  const hp0 = d.hitPlayer.bind(d), ft0 = d.flashTell.bind(d);
  let probing = '';
  d.hitPlayer = (o, a) => { const r = hp0(o, a); if (a?.cur && a.name === probing) hits.push({ t: game.time, hit: a.cur.hit ?? 0, r }); return r; };
  d.flashTell = (a, b) => { if (a.name === probing) flashes.push({ t: game.time, hit: b.hit ?? 0 }); return ft0(a, b); };
  for (const name of names) {
    const def = ATTACKS[name];
    if (!def) { assert(false, `string ${name} exists`); continue; }
    const first = def.phase ?? TUNING.attacks[name]?.phase ?? 1;
    const R = (report[name] = { picks: 0, hits: {}, miss1: [] });
    probing = name;
    // the single attacks (measured since v0.4) on a coarser grid: half the distances and angles
    const coarse = !def.string;
    for (const phase of [first, 3].filter((v, i, a) => a.indexOf(v) === i)) {
      for (const dist of coarse ? DISTS.filter((v, i) => i % 2 === 0) : DISTS) for (const ang of coarse ? ANGS.filter((v, i) => i % 4 < 2 || v === Math.PI) : ANGS) {
        // a fresh, idle wyrm at the origin facing +Z, in this phase
        d.debug.reset();
        d.debug.startFight();
        d.debug.setAI(false);
        if (phase > 1) d.enterPhase(phase);
        d.position.set(0, 0, 0);
        d.yaw = 0;
        d.rig.snap();
        p.debug.god = true;
        const px = Math.sin(ang) * dist * SCALE, pz = Math.cos(ang) * dist * SCALE;
        p.debug.teleport(px, pz);
        run(G, 0.5, { passive: true });
        d.position.set(0, 0, 0);
        d.yaw = 0;
        p.debug.teleport(px, pz);
        G.tick(DT);
        if (!(attackWeight(def, name, d, d.sense) > 0) || d.brain.action) continue; // not an AI pick here
        picks++;
        R.picks++;
        flashes.length = 0;
        hits.length = 0;
        d.brain.startAction(def);
        for (let i = 0; i < 900 && d.brain.action?.name === name; i++) {
          G.input.axis = { x: 0, y: 0 };
          G.tick(DT);
          p.debug.teleport(px, pz); // he stands his ground (knock-backs don't move the probe)
          p.hp = p.maxHp;
        }
        const seen = new Set();
        for (const h of hits) {
          if (seen.has(h.hit)) continue;
          seen.add(h.hit);
          const f = flashes.find((x) => x.hit === h.hit);
          const dt = f ? h.t - (f.t + lead) : NaN;
          const e = (R.hits[h.hit] ||= { n: 0, lo: Infinity, hi: -Infinity, bad: [] });
          e.n++;
          if (Number.isFinite(dt)) { e.lo = Math.min(e.lo, dt); e.hi = Math.max(e.hi, dt); }
          worst = Math.max(worst, Math.abs(dt));
          if (!(Math.abs(dt) <= TOL)) { bad++; if (e.bad.length < 4) e.bad.push(`P${phase} ${dist}@${ang.toFixed(1)}: ${Number.isFinite(dt) ? Math.round(dt * 1000) : 'no flash'} ms`); }
        }
        const nb = flashes.length ? Math.max(...flashes.map((f) => f.hit)) + 1 : 0;
        for (let h = 0; h < nb; h++) (R.hits[h] ||= { n: 0, lo: Infinity, hi: -Infinity, bad: [] }).tried = (R.hits[h].tried ?? 0) + 1;
        if (!seen.has(0)) { firstMiss++; if (R.miss1.length < 6) R.miss1.push(`P${phase} ${dist}@${ang.toFixed(1)}`); }
        if (process.env.ABYSS_TMV) (R.map ||= []).push(`P${phase} ${String(dist).padStart(4)}@${ang.toFixed(1).padStart(4)}: ${[...seen].sort().join('')}/${nb} ${hits.filter((h, i, A) => A.findIndex((x) => x.hit === h.hit) === i).map((h) => { const f = flashes.find((x) => x.hit === h.hit); return f ? Math.round((h.t - f.t - lead) * 1000) : '?'; }).join(',')}`);
      }
    }
    if (R.map) out(R.map.map((l) => `      ${l}`).join('\n'));
    const rows = Object.keys(R.hits).sort((a, b) => a - b).map((k) => {
      const e = R.hits[k];
      return `h${k} ${e.n}/${e.tried ?? '?'} ${e.n ? `${Math.round(e.lo * 1000)}…${Math.round(e.hi * 1000)} ms` : ''}${e.bad.length ? ` BAD ${e.bad.join('; ')}` : ''}`;
    });
    out(`   ${name.padEnd(14)} ${String(R.picks).padStart(3)} picks · ${rows.join(' · ')}${R.miss1.length ? ` · first hit missed: ${R.miss1.join(', ')}` : ''}`);
  }
  d.hitPlayer = hp0;
  d.flashTell = ft0;
  assert(picks > 0, `string placements probed (${picks})`);
  assert(bad === 0, `every string contact within ±${TOL * 1000} ms of its flash + lead (worst ${Math.round(worst * 1000)} ms, ${bad} off)`);
  assert(firstMiss === 0, `every AI pick lands its first hit (${firstMiss} missed)`);
  return G;
}

// ================================================================== scenario: the whole body (w2 melee)
// The six whole-body kinds, each answered the way its tell promises, inside the strings that use
// them (started through the AI's own path, the hero held at his spot, god mode): a white wing scythe
// parried, red tail blows rolled (and a held guard broken), the wing slam's blue flare parried (it
// ends the string: a recoil), the fire snap's ticks blocked (never parried) and the ground it reached
// burning on, the burning rakes leaving fire; and the breath's body: the neck carries the P2 rake,
// the body barely turns (it used to spin with the stream).
async function scenarioMelee() {
  out('\n== scenario MELEE (wing scythe / wing slam / tail whip / tail slam / fire snap / ember rake answered; the breath body) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  G.game.player.debug.noRiposte = true;
  const d = game.dragon, p = game.player;
  const { ATTACKS } = await imp('src/entities/dragon/attacks.js');
  const lead = TUNING.flashLead;
  /** Start string `name` from the AI's path with the hero `units` model units out, `ang` off the nose;
   *  answer hit i with plan[i] (parry | dodge | block | none); returns per hit [results...] + the record. */
  const play = (name, units, ang, plan, { phase = 1, hold = true, after = 0 } = {}) => {
    settle(G);
    if (d.phase !== phase) d.enterPhase(phase);
    d.hazards?.clear?.();
    place(G, (units * SCALE) / SIZE, ang);
    const px = p.position.x, pz = p.position.z;
    p.debug.god = true;
    const flashes = [], res = {}, kinds = {};
    const ft0 = d.flashTell.bind(d), hp0 = d.hitPlayer.bind(d);
    d.flashTell = (a, b) => { if (a.name === name) flashes.push({ hit: b.hit ?? 0, at: game.time + lead, done: false }); return ft0(a, b); };
    d.hitPlayer = (o, a) => {
      const r = hp0(o, a);
      if (a?.name === name && a.cur) { (res[a.cur.hit] ||= []).push(r); (kinds[a.cur.hit] ||= o.kind); }
      return r;
    };
    const c0 = { ...G.counts };
    d.brain.startAction(ATTACKS[name]);
    let blockUntil = -1, ended = -1;
    for (let i = 0; i < Math.round(12 / DT); i++) {
      aimAt(G);
      input.axis = { x: 0, y: 0 };
      for (const f of flashes) {
        if (f.done) continue;
        const left = f.at - game.time - DT, how = plan[f.hit] ?? 'none';
        if (how === 'parry' && left <= 0.12) { f.done = true; input.click(1); }
        else if (how === 'block' && left <= 0.3) { f.done = true; input.press(1); blockUntil = f.at + 0.75; }
        else if (how === 'dodge' && left <= 0.1) {
          f.done = true;
          const dx = d.position.x - p.position.x, dz = d.position.z - p.position.z, l = Math.hypot(dx, dz) || 1;
          input.axis = { x: -dz / l, y: -dx / l }; // sideways (a slam along a line: roll aside)
          input.tap('Space');
        } else if (how === 'none' && left <= 0) f.done = true;
      }
      if (blockUntil > 0 && game.time >= blockUntil) { input.up(1); blockUntil = -1; }
      G.tick(DT);
      if (hold && p.state !== 'roll' && p.state !== 'plunge') p.debug.teleport(px, pz);
      const a = d.brain.action;
      if (ended < 0 && (!a || a.name !== name)) ended = game.time;
      if (ended >= 0 && game.time - ended >= after) break;
    }
    if (blockUntil > 0) input.up(1);
    d.flashTell = ft0;
    d.hitPlayer = hp0;
    const ev = {};
    for (const k in G.counts) ev[k] = G.counts[k] - (c0[k] || 0);
    p.debug.god = false;
    return { res, kinds, ev, flashes: flashes.length, px, pz };
  };
  const first = (r, i) => r.res[i]?.[0] ?? 'none';

  // 1) the wing scythe (white): parried inside Wing rend
  const wr = play('wingRend', 4.0, 0, { 0: 'parry', 1: 'parry', 2: 'parry', 3: 'parry' });
  out(`   wingRend parried: ${JSON.stringify(wr.res)} · dragon:parried ${wr.ev['dragon:parried'] || 0}`);
  assert(first(wr, 1) === RESULT.PARRIED && wr.kinds[1] === 'wing', `the wing scythe (white) is parried (${first(wr, 1)}, ${wr.kinds[1]})`);

  // 2) the tail whip (red): rolled (a perfect dodge) inside Pivot lash; a parry does not stop it
  p.debug.streak?.(0);
  const pl = play('pivotLash', 4.5, 1.5, { 0: 'dodge' }, { hold: false });
  out(`   pivotLash rolled: ${JSON.stringify(pl.res)} · perfectDodge ${pl.ev['player:perfectDodge'] || 0}`);
  assert(first(pl, 0) === RESULT.PERFECT && pl.kinds[0] === 'tail', `the tail whip (red) is rolled: a perfect dodge (${first(pl, 0)}, ${pl.kinds[0]})`);
  const pp = play('pivotLash', 4.5, -1.5, { 0: 'parry' });
  assert(first(pp, 0) === RESULT.HIT, `a parry does not answer the tail whip (${first(pp, 0)})`);

  // 3) the tail slam (red): rolled aside; a held guard is broken
  p.debug.streak?.(0);
  const rg = play('rearGuard', 5.5, Math.PI, { 0: 'dodge' }, { hold: false });
  out(`   rearGuard rolled: ${JSON.stringify(rg.res)}`);
  assert(first(rg, 0) === RESULT.PERFECT && rg.kinds[0] === 'tail', `the tail slam (red) is rolled aside: a perfect dodge (${first(rg, 0)}, ${rg.kinds[0]})`);
  const rb = play('rearGuard', 5.5, Math.PI, { 0: 'block' });
  out(`   rearGuard blocked: ${JSON.stringify(rb.res)} · guardBreak ${rb.ev['player:guardBreak'] || 0}`);
  assert(first(rb, 0) === RESULT.HIT && (rb.ev['player:guardBreak'] || 0) >= 1, `a held guard against the tail slam breaks (${first(rb, 0)})`);

  // 4) the wing slam's blue flare: parried, it ends the string (a recoil), every earlier hit parried
  const sh = play('skyHammer', 4.0, 0, { 0: 'parry', 1: 'parry', 2: 'parry' }, { after: 0.05 });
  out(`   skyHammer parried: ${JSON.stringify(sh.res)} · recoil ${d.brain.action?.name ?? '-'} · dragon:parried ${sh.ev['dragon:parried'] || 0}`);
  assert(first(sh, 2) === RESULT.PARRIED && sh.kinds[2] === 'slam', `the wing slam's blue flare is parried (${first(sh, 2)}, ${sh.kinds[2]})`);

  // 5) the fire snap: its ticks blocked (chip, never parried), the ground it reached burns on
  const fm = play('furnaceMaw', 4.0, 0, { 3: 'block' }, { phase: 2, after: 0 });
  const ticks = fm.res[3] ?? [];
  const burning = d.hazards.count('meleeFire');
  out(`   furnaceMaw fire snap blocked: ticks ${JSON.stringify(ticks)} · burning ground strips ${burning}`);
  assert(ticks.length >= 3 && ticks.every((r) => r === RESULT.BLOCKED) && fm.kinds[3] === 'fire', `the fire snap ticks, every tick blocked (${JSON.stringify(ticks)})`);
  const fp = play('furnaceMaw', 4.0, 0, { 3: 'parry' }, { phase: 2 });
  assert((fp.res[3] ?? []).every((r) => r !== RESULT.PARRIED) && (fp.res[3] ?? []).length > 0, `the fire snap is never parried (${JSON.stringify(fp.res[3])})`);
  // standing in the burnt ground: contact ticks (fire, blockable) from the snap's strip
  {
    settle(G, 0.1);
    d.hazards.clear();
    if (d.phase !== 2) d.enterPhase(2);
    place(G, (4.0 * SCALE) / SIZE, 0);
    const px = p.position.x, pz = p.position.z;
    p.debug.god = true;
    // contact ticks of the burning strips (hazards.js _tick: only while he stands in the fire)
    const tk0 = d.hazards._tick.bind(d.hazards);
    let groundTicks = 0, strips = 0;
    d.hazards._tick = (h, fx, fz) => { if (h.kind === 'meleeFire') groundTicks++; return tk0(h, fx, fz); };
    d.brain.startAction(ATTACKS.furnaceMaw);
    let snapEnd = -1;
    for (let i = 0; i < Math.round(10 / DT); i++) {
      aimAt(G);
      input.axis = { x: 0, y: 0 };
      G.tick(DT);
      p.debug.teleport(px, pz);
      const a = d.brain.action;
      if (snapEnd < 0 && a?.name === 'furnaceMaw' && a.phase === 'windup5') { snapEnd = game.time; strips = d.hazards.count('meleeFire'); }
      if (snapEnd >= 0 && (!a || a.name !== 'furnaceMaw')) break;
    }
    d.hazards._tick = tk0;
    p.debug.god = false;
    out(`   burning ground after the snap: ${strips} strip(s) as the gout ends · contact ticks ${groundTicks}`);
    assert(strips >= 1 && groundTicks >= 2, `the ground the fire snap reached burns: contact ticks while he stands in it (${strips} strips, ${groundTicks} ticks)`);
  }

  // 6) the ember rake: white (parried); from phase 2 the arc it raked burns
  const er = play('cinderRake', 4.0, 0, { 0: 'parry' }, { phase: 2 });
  out(`   cinderRake: rake ${first(er, 0)}`);
  assert(first(er, 0) === RESULT.PARRIED && er.kinds[0] === 'swipe', `the ember rake is parried (${first(er, 0)})`);
  {
    settle(G);
    d.hazards.clear();
    place(G, (4.0 * SCALE) / SIZE, 0);
    d.brain.startAction(ATTACKS.cinderRake);
    let n = 0;
    for (let i = 0; i < Math.round(1.6 / DT); i++) { G.tick(DT); n = Math.max(n, d.hazards.count('meleeFire')); }
    out(`   the rakes' burning arcs: ${n} strip(s)`);
    assert(n >= 2, `the ember rake's arc burns in phase 2 (${n} strips)`);
    settle(G);
    d.enterPhase(1);
    d.hazards.clear();
  }

  // 7) the breath's body (P2): the neck carries the rake, the body barely turns
  {
    settle(G);
    d.enterPhase(2);
    place(G, (9 * SCALE) / SIZE, 0);
    p.debug.god = true;
    d.brain.startAction(ATTACKS.breath);
    let yaw0 = null, aMin = Infinity, aMax = -Infinity, yMin = Infinity, yMax = -Infinity, ok = true;
    for (let i = 0; i < Math.round(6 / DT); i++) {
      aimAt(G);
      G.tick(DT);
      const a = d.brain.action;
      if (!a || a.name !== 'breath') break;
      if (a.phase !== 'active') continue;
      if (yaw0 === null) yaw0 = d.yaw;
      const rel = (x) => Math.atan2(Math.sin(x - yaw0), Math.cos(x - yaw0));
      aMin = Math.min(aMin, rel(a.aim)); aMax = Math.max(aMax, rel(a.aim));
      yMin = Math.min(yMin, rel(d.yaw)); yMax = Math.max(yMax, rel(d.yaw));
      ok &&= Number.isFinite(a.aim + d.yaw + a.aimV);
    }
    p.debug.god = false;
    out(`   breath P2: the stream covers ${(aMax - aMin).toFixed(2)} rad, the body turns ${(yMax - yMin).toFixed(2)} rad`);
    assert(ok && aMax - aMin >= 0.9, `the P2 breath still rakes a wide arc (${(aMax - aMin).toFixed(2)} rad)`);
    assert(yMax - yMin <= 0.6 * (aMax - aMin), `the neck carries it: the body turns far less than the stream (${(yMax - yMin).toFixed(2)} of ${(aMax - aMin).toFixed(2)} rad)`);
    settle(G);
    d.enterPhase(1);
  }
  return G;
}

// ================================================================== scenario: strings (contract 1)
// The data contract of every string (tells, readable first windup, room to re-press RMB between hits,
// the flash after the tell, in all three phases); the deflect chain on Rending flurry with every
// parryable hit parried (the string goes on after each non-final parry, recoils after the last, the
// posture adds up, combat:deflectChain counts); a red hit inside a string breaks a held guard.
async function scenarioStrings() {
  out('\n== scenario STRINGS (deflect chain: Rending flurry parried hit by hit; a red hit in a string vs a held guard) ==');
  const G = build();
  const { game, input } = G;
  fightSetup(G);
  // (the parries' own numbers are under test: the riposte a parried last blow is answered with,
  // scenario RIPOSTE, would add its cuts' posture)
  G.game.player.debug.noRiposte = true;
  const d = game.dragon, p = game.player;
  const { ATTACKS } = await imp('src/entities/dragon/attacks.js');
  const lead = TUNING.flashLead, gapMin = TUNING.minHitGap;
  // 1) the data contract, per phase (later phases shorten windups by phaseTimeScale)
  const strings = Object.keys(ATTACKS).filter((k) => ATTACKS[k].string);
  assert(strings.length >= 7, `strings registered (${strings.join(', ')})`);
  const problems = [];
  for (const name of strings) {
    const H = TUNING.attacks[name].hits;
    if (!(H[0].windup >= 0.7)) problems.push(`${name} first windup ${H[0].windup} < 0.7`);
    for (let ph = 1; ph <= 3; ph++) {
      const ts = TUNING.phaseTimeScale[ph - 1];
      H.forEach((h, i) => {
        if (!TELLS.has(h.tell)) problems.push(`${name}.${i} tell ${h.tell}`);
        if (!(h.impact <= h.active + 1e-9)) problems.push(`${name}.${i} impact past its active`);
        if (!(h.windup * ts + h.impact >= lead + DT)) problems.push(`${name}.${i} P${ph}: flash before its tell (${(h.windup * ts + h.impact).toFixed(2)} s)`);
        // the next hit that can follow this one (an optional hit may be rolled out)
        for (let j = i + 1; j < H.length; j++) {
          const n = H[j], gap = h.active - h.impact + n.windup * ts + n.impact;
          if (!(gap >= gapMin - 1e-9)) problems.push(`${name}.${i}->${j} P${ph}: ${gap.toFixed(3)} s between impacts`);
          if (!(n.chance < 1)) break;
        }
      });
    }
  }
  assert(!problems.length, `every string hit: a tell, a first windup >= 0.7 s, its flash after its tell, >= ${gapMin} s impact to impact (all phases) ${JSON.stringify(problems.slice(0, 6))}`);

  // 2) Rending flurry, every hit parried (blue hits too): the deflect chain
  settle(G);
  place(G, (4.0 * SCALE) / SIZE); // 4 model units in front: inside its AI band
  const spec = TUNING.attacks.rendingFlurry;
  const pend = [], par = [], chains = [], actAfter = [], tells = [];
  let tellN = 0;
  const post0 = d.posture;
  G.watch = (n, dd) => {
    if (dd?.attack !== 'rendingFlurry' && n !== 'combat:deflectChain') return;
    if (n === 'combat:tell') { tellN++; tells.push(dd.tell); pend.push({ at: game.time + dd.impactIn, done: false }); }
    if (n === 'combat:flash') { const e = pend.find((x) => !x.done); if (e) e.at = game.time + lead; }
    if (n === 'dragon:parried') par.push(dd);
    if (n === 'combat:deflectChain') chains.push(dd.count);
  };
  const hp0 = p.hp;
  d.brain.startAction(ATTACKS.rendingFlurry);
  let last = -1;
  for (let i = 0; i < Math.round(8 / DT); i++) {
    aimAt(G);
    input.axis = { x: 0, y: 0 };
    for (const e of pend) if (!e.done && e.at - game.time - DT <= 0.12) { e.done = true; input.click(1); }
    G.tick(DT);
    if (par.length !== last) { last = par.length; if (last > 0) actAfter.push(d.brain.action?.name ?? '-'); }
    if (!d.brain.action || (d.brain.action.name !== 'rendingFlurry' && d.brain.action.name !== 'recoil')) break;
  }
  G.watch = null;
  const want = spec.hits.reduce((s, h) => s + (POSTURE.parry[h.tell] ?? POSTURE.parry.normal), 0);
  out(`   rendingFlurry: tells [${tells.join(' ')}] · parried ${JSON.stringify(par.map((x) => [x.hit, x.last]))} · action after each parry [${actAfter.join(', ')}] · deflectChain ${JSON.stringify(chains)} · posture ${post0.toFixed(0)} → ${d.posture.toFixed(0)} (want +${want}) · hp ${hp0} → ${p.hp}`);
  assert(tellN === spec.hits.length && tells.join() === spec.hits.map((h) => h.tell).join(), `every hit announced with its own tell (${tells.join(' ')})`);
  assert(par.length === spec.hits.length && par.every((x, i) => x.hit === i && x.last === (i === spec.hits.length - 1) && x.attack === 'rendingFlurry'), `every hit parried: dragon:parried {hit, last} in order (${JSON.stringify(par.map((x) => [x.hit, x.last]))})`);
  assert(actAfter.slice(0, -1).every((n) => n === 'rendingFlurry'), `a parry on a non-final hit deflects: the string goes on (${actAfter.join(', ')})`);
  assert(actAfter[actAfter.length - 1] === 'recoil', `the last hit's parry recoils the wyrm (${actAfter[actAfter.length - 1]})`);
  assert(chains.join() === '2,3,4', `combat:deflectChain from the 2nd parry in a row (${JSON.stringify(chains)})`);
  assert(near(d.posture - post0, want, 1.5), `the parries' posture adds up (+${(d.posture - post0).toFixed(1)}, want +${want})`);
  assert(p.hp === hp0, 'no damage through four parries');
  // a hit that lands breaks the chain: the claw combo with only its last hit parried
  settle(G);
  place(G, 4.0);
  const chain2 = [];
  const pend2 = [];
  let tn = 0;
  G.watch = (n, dd) => {
    if (n === 'combat:deflectChain') chain2.push(dd.count);
    if (dd?.attack !== 'clawCombo') return;
    if (n === 'combat:tell') { tn++; pend2.push({ at: game.time + dd.impactIn, done: tn < 3, n: tn }); }
    if (n === 'combat:flash') { const e = pend2.find((x) => !x.done) ?? pend2[pend2.length - 1]; if (e) e.at = game.time + lead; }
  };
  d.brain.startAction(ATTACKS.clawCombo);
  for (let i = 0; i < Math.round(6 / DT); i++) {
    aimAt(G);
    input.axis = { x: 0, y: 0 };
    p.hp = p.maxHp;
    for (const e of pend2) if (!e.done && e.at - game.time - DT <= 0.12) { e.done = true; input.click(1); }
    G.tick(DT);
    if (!d.brain.action || (d.brain.action.name !== 'clawCombo' && d.brain.action.name !== 'recoil')) break;
  }
  G.watch = null;
  assert(chain2.length === 0, `a single parry after hits that landed is no chain (${JSON.stringify(chain2)})`);

  // 3) a red hit inside a string can't be blocked: Tail lash with the guard held from the start
  settle(G);
  d.enterPhase(2);
  place(G, 4.0);
  const res = [];
  const h0 = G.hits.length;
  input.press(1);
  run(G, 0.2, { passive: true });
  const gb0 = G.counts['player:guardBreak'] || 0;
  d.brain.startAction(ATTACKS.tailLash);
  for (let i = 0; i < Math.round(6 / DT); i++) {
    aimAt(G);
    input.axis = { x: 0, y: 0 };
    G.tick(DT);
    p.hp = p.maxHp;
    if (!d.brain.action || d.brain.action.name !== 'tailLash') break;
  }
  input.up(1);
  for (const h of G.hits.slice(h0)) if (h.attack === 'tailLash') res.push(`${h.tell}:${h.r}`);
  out(`   tailLash vs a held guard: ${res.join(' · ')} · guardBreak ${(G.counts['player:guardBreak'] || 0) - gb0}`);
  assert(res[0] === 'normal:blocked', `the string's normal claw is blocked (${res[0]})`);
  assert(res.some((r) => r === 'red:hit') && (G.counts['player:guardBreak'] || 0) > gb0, `a red hit inside the string breaks the held guard (${res.join(' · ')})`);
  return G;
}

// ================================================================== scenario: the plunge (contract 2, dragon side)
// onPlunge called directly (the player side is the plunge agent's): grounded mid-windup, airborne
// during the leap (it crashes and lands, finite), an execution on a broken wyrm, the phase gate, a
// phase transition (not cancelled), and the head point the hero rides.
async function scenarioPlungeReact() {
  out('\n== scenario PLUNGE (dragon side: onPlunge grounded / during the leap / execution / phase gate) ==');
  const G = build();
  const { game } = G;
  fightSetup(G);
  const d = game.dragon, p = game.player;
  const { ATTACKS } = await imp('src/entities/dragon/attacks.js');
  const v = new THREE.Vector3();
  const c = (n) => G.counts[n] || 0;
  let plunged = [];
  G.watch = (n, dd) => { if (n === 'dragon:plunged') plunged.push(dd); };
  p.debug.god = true;
  // the point the hero rides: on top of the drawn head
  settle(G);
  d.plungePoint(v);
  const head = d.rig.pt.head;
  assert(typeof d.plungePoint === 'function' && typeof d.onPlunge === 'function', 'dragon.plungePoint(out) + onPlunge(o) exist');
  assert([v.x, v.y, v.z].every(Number.isFinite) && near(v.x, head.x, 1e-6) && v.y > head.y + 0.5, `plungePoint = the head + up (${v.y.toFixed(2)} vs head ${head.y.toFixed(2)})`);
  // 1) grounded, in a bite's windup: damage once (exact), posture, the bite cancelled, the reaction
  place(G, 6);
  d.brain.startAction(ATTACKS.bite);
  run(G, 0.3, { passive: true });
  const hp0 = d.hp, pos0 = d.posture, hits0 = G.hits.length;
  const dealt = d.onPlunge({ damage: 90, posture: 40, point: d.plungePoint(v), execution: false });
  const again = d.onPlunge({ damage: 90, posture: 40, point: d.plungePoint(v), execution: false });
  const act = d.brain.action?.name, st = d.state;
  out(`   grounded: dealt ${dealt} (again ${again}) hp ${hp0} → ${d.hp} · posture ${pos0.toFixed(0)} → ${d.posture.toFixed(0)} · action ${act} · state ${st}`);
  assert(dealt === 90 && again === 0 && hp0 - d.hp === 90, `the plunge's damage lands once, exactly (dealt ${dealt}, then ${again}; hp −${hp0 - d.hp})`);
  assert(near(d.posture - pos0, 40, 0.5), `the plunge adds its posture (+${(d.posture - pos0).toFixed(1)})`);
  assert(act === 'plunged' && st === 'staggered' && plunged.length === 1 && plunged[0].execution === false, `the bite is cancelled: plunged reaction, staggered, dragon:plunged {execution:false} (${act}, ${st})`);
  let minHeadY = Infinity, finite = true;
  const tR = game.time;
  run(G, 3, { passive: true }, () => {
    minHeadY = Math.min(minHeadY, d.rig.pt.head.y);
    d.plungePoint(v);
    if (![v.x, v.y, v.z, d.position.x, d.position.z].every(Number.isFinite)) finite = false;
    return d.brain.action?.name !== 'plunged';
  });
  const dur = game.time - tR;
  out(`   reaction: ${dur.toFixed(2)} s, the head down to ${minHeadY.toFixed(2)} m, then ${d.brain.action?.name ?? 'idle'} / ${d.state}`);
  assert(minHeadY < 2.5 && finite, `the head is slammed to the ground (${minHeadY.toFixed(2)} m), every point finite`);
  assert(dur > 1.0 && dur < 1.8 && d.state === 'combat', `the reaction ends in ~1.35 s, back in combat (${dur.toFixed(2)} s, ${d.state})`);
  assert(!G.hits.slice(hits0).some((h) => h.attack === 'bite'), 'the cancelled bite never lands');
  // 2) airborne: during the leap's flight it crashes from where it was hit, lands finite, no slam
  settle(G);
  d.enterPhase(2);
  place(G, 10);
  plunged = [];
  const land0 = c('dragon:land'), hits1 = G.hits.length;
  d.brain.startAction(ATTACKS.leap);
  run(G, 3, { passive: true }, () => d.state === 'airborne' && d.rig.s.alt > 6);
  const alt0 = d.rig.s.alt, ax = d.position.x, az = d.position.z;
  const dealtAir = d.onPlunge({ damage: 90, posture: 40, point: d.plungePoint(v), execution: false });
  const a1 = d.brain.action;
  out(`   airborne: alt ${alt0.toFixed(1)} m · dealt ${dealtAir} · action ${a1?.name}.${a1?.phase} · state ${d.state}`);
  assert(alt0 > 6 && dealtAir === 90 && a1?.name === 'plunged' && a1.phase === 'fall' && d.state === 'airborne', `mid-leap: the plunge cancels the flight, it falls (${a1?.name}.${a1?.phase}, ${d.state})`);
  let landedAt = -1, maxAlt = 0, fin2 = true;
  run(G, 3, { passive: true }, () => {
    if (landedAt < 0 && d.state === 'staggered') landedAt = game.time;
    maxAlt = Math.max(maxAlt, d.rig.s.alt);
    if (![d.position.x, d.position.z, d.rig.s.alt, d.rig.pt.head.y].every(Number.isFinite)) fin2 = false;
    return d.brain.action?.name !== 'plunged';
  });
  const moved = Math.hypot(d.position.x - ax, d.position.z - az);
  out(`   crash: landed ${landedAt > 0 ? 'yes' : 'no'}, alt now ${d.rig.s.alt.toFixed(2)} m, root moved ${moved.toFixed(2)} m, dragon:land +${c('dragon:land') - land0}, state ${d.state}`);
  assert(landedAt > 0 && d.rig.s.alt < 0.3 && fin2 && d.state === 'combat', `it crash-lands and stands up again, finite (alt ${d.rig.s.alt.toFixed(2)}, ${d.state})`);
  assert(moved < 1.0 && c('dragon:land') - land0 === 1, `it falls where it was hit (moved ${moved.toFixed(2)} m), one dragon:land`);
  assert(!G.hits.slice(hits1).some((h) => h.attack === 'leap'), 'the cancelled leap never slams');
  // 3) an execution on a broken wyrm: big, longer, consumes the break
  settle(G);
  plunged = [];
  assert(d.debug.postureBreak() === true, 'posture break');
  run(G, 0.6, { passive: true });
  const hp2 = d.hp;
  const dealtX = d.onPlunge({ damage: 260, posture: 0, point: d.plungePoint(v), execution: true });
  const tX = game.time;
  out(`   execution: dealt ${dealtX} · broken ${d.broken} · posture ${d.posture} · ${d.brain.action?.name}`);
  assert(dealtX === 260 && hp2 - d.hp === 260 && !d.broken && d.posture === 0, `the execution deals its damage and consumes the break (dealt ${dealtX}, broken ${d.broken})`);
  assert(plunged.length === 1 && plunged[0].execution === true, 'dragon:plunged {execution:true}');
  run(G, 4, { passive: true }, () => d.brain.action?.name !== 'plunged');
  const durX = game.time - tX;
  assert(durX > 1.8 && durX < 2.4, `the execution's reaction is heavier: ~2 s (${durX.toFixed(2)} s)`);
  // 4) the phase gate: with the AI on, a plunge can't push past the next phase's threshold; the
  // transition waits for the reaction to end
  settle(G);
  d.debug.setAI(true);
  const gate = d.nextPhaseHp; // phase 2: the phase-3 gate
  d.hp = Math.round(gate) + 40;
  plunged = [];
  const p3 = c('dragon:phase3');
  d.onPlunge({ damage: 90, posture: 0, point: d.plungePoint(v), execution: false });
  const hpG = d.hp, pend = d.brain.pendingPhase;
  G.tick(DT);
  const stillPlunged = d.brain.action?.name === 'plunged';
  out(`   gate: hp ${hpG} (gate ${gate.toFixed(0)}) · pending phase ${pend} · still plunged ${stillPlunged}`);
  assert(hpG === Math.round(gate) || near(hpG, gate, 1), `the plunge stops at the phase gate (hp ${hpG}, gate ${gate.toFixed(0)})`);
  assert(pend === 3 && stillPlunged, `the phase-3 transition is pending, the reaction plays first (pending ${pend})`);
  run(G, 4, { passive: true }, () => c('dragon:phase3') > p3);
  assert(c('dragon:phase3') === p3 + 1 && d.phase === 3, `then the phase-3 transition (${d.phase})`);
  // 5) a transition is not cancelled: damage only
  const actT = d.brain.action?.name;
  const hpT = d.hp;
  const dealtT = d.onPlunge({ damage: 90, posture: 0, point: d.plungePoint(v), execution: false });
  assert(actT === 'phase3' && d.brain.action?.name === 'phase3' && dealtT === 90 && hpT - d.hp === 90, `a plunge during the transition roar: damage only (${actT} → ${d.brain.action?.name})`);
  d.debug.setAI(false);
  G.watch = null;
  return G;
}

// ================================================================== scenario: rigid batching
// render/rigidBatch.js: the hero and the wyrm are drawn with one mesh per material, plus one
// shadow mesh each (their ~320 rigid meshes stay in the graph as bones and are never drawn
// themselves); a bone follows its source mesh's world matrix and collapses to a zero matrix while
// the source (or a joint above it) is hidden; shadow casting follows the sources' LAYER_CASTER
// bit; a loadout rebuild reuses the bone slots; CONFIG.render.batch = false (the `?nobatch` URL
// flag) leaves everything as it was.
async function scenarioBatch() {
  out('\n== scenario BATCH (rigid batching: one drawn mesh per material, bones follow their source meshes) ==');
  const { rigidBones, isRigidSource, batchRigid } = await imp('src/render/rigidBatch.js');
  const { LAYER_CASTER, LAYER_CASTER_RIGID, markCaster } = await imp('src/render/pipeline.js');
  const { RIGID_MAX } = await imp('src/render/shaderLib.js');
  const G = build();
  const { game } = G;
  fightSetup(G);
  const p = game.player, d = game.dragon, reg = rigidBones(game.U);
  const view = new THREE.Layers(), shadow = new THREE.Layers(), shadowRigid = new THREE.Layers();
  shadow.set(LAYER_CASTER);
  shadowRigid.set(LAYER_CASTER_RIGID);
  const meshes = (root, pred = () => true) => { const l = []; root.traverse((o) => { if (o.isMesh && pred(o)) l.push(o); }); return l; };
  const drawn = (root, layers = view) => meshes(root, (o) => o.layers.test(layers));
  // what pipeline.render does before the passes: one matrix update, then the bones
  const sync = () => { game.scene.updateMatrixWorld(); reg.sync(); };
  const slotOf = (m) => { for (const b of reg.batches) { const i = b.sources.indexOf(m); if (i >= 0) return b.slots[i]; } return -1; };
  const bone = (m) => Array.from(reg.data.subarray(slotOf(m) * 16, slotOf(m) * 16 + 16));
  const isZero = (a) => a.length === 16 && a.every((v) => v === 0);
  const follows = (m) => { const e = m.matrixWorld.elements, b = bone(m); return b.every((v, i) => v === Math.fround(e[i])) && Math.abs(b[15] - 1) < 1e-6; };
  const shown = (m, root) => { for (let o = m; o !== root; o = o.parent) if (!o || !o.visible) return false; return true; };
  // a bone is its source's world matrix, or all zero while the source is hidden
  const live = (m, root) => (shown(m, root) ? follows(m) : isZero(bone(m)));
  sync();

  // one drawn mesh per material; every source is kept in the graph
  const heroAll = meshes(p.object3d), heroDrawn = drawn(p.object3d), heroSrc = heroAll.filter(isRigidSource);
  const wyrmAll = meshes(d.object3d), wyrmDrawn = drawn(d.object3d), wyrmSrc = wyrmAll.filter(isRigidSource);
  const heroMats = new Set(heroSrc.map((m) => m.material)).size, wyrmMats = new Set(wyrmSrc.map((m) => m.material)).size;
  out(`   hero: ${heroSrc.length} source meshes → ${heroDrawn.length} drawn (${heroMats} materials) · wyrm: ${wyrmSrc.length} → ${wyrmDrawn.length} drawn (${wyrmMats} materials + ${wyrmDrawn.filter((m) => !m.userData.rigidBatch).length} unbatched) · ${reg.count} bones of ${RIGID_MAX - 1}`);
  assert(heroSrc.length > 100 && heroDrawn.length === heroMats && heroDrawn.length <= p.rig.mats.length && heroDrawn.every((m) => m.userData.rigidBatch && m.parent === p.object3d && !m.frustumCulled),
    `the hero draws one batch per material (${heroDrawn.length} meshes for ${heroSrc.length} parts)`);
  const membranes = d.model.wings.map((w) => w.membrane.mesh);
  assert(wyrmSrc.length > 150 && wyrmDrawn.length === wyrmMats + membranes.length && membranes.every((m) => wyrmDrawn.includes(m) && !isRigidSource(m)),
    `the wyrm draws one batch per material plus its two wing membranes (${wyrmDrawn.length} meshes for ${wyrmSrc.length} parts)`);
  assert(heroAll.length === heroSrc.length + p.batch.meshes.length + 1 && p.batch.bones === heroSrc.length && d.batch.bones === wyrmSrc.length && reg.count === heroSrc.length + wyrmSrc.length
    && heroSrc.every((m) => m.geometry.attributes.position && m.visible !== undefined) && p.rig.flask.parent && isRigidSource(p.rig.flask),
    `the source meshes stay in the scene graph as bones (${reg.count} bones)`);
  // a batch holds its sources' vertices, each tagged with its bone's slot
  {
    const b = reg.batches.filter((x) => x.root === p.object3d).reduce((a, x) => (x.sources.length > a.sources.length ? x : a));
    const g = b.mesh.geometry, n = b.sources.reduce((s, m) => s + m.geometry.attributes.position.count, 0);
    const ix = b.sources.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count), 0);
    let same = true, tagged = true, at = 0;
    b.sources.forEach((m, k) => {
      const src = m.geometry.attributes.position;
      for (let i = 0; i < src.count * 3; i++) if (g.attributes.position.array[at * 3 + i] !== Math.fround(src.array[i])) same = false;
      for (let i = 0; i < src.count; i++) if (g.attributes.aRigid.array[at + i] !== b.slots[k]) tagged = false;
      at += src.count;
    });
    let inRange = true;
    for (let i = 0; i < g.index.count; i++) if (g.index.array[i] >= n) inRange = false;
    assert(b.sources.length > 5 && g.attributes.position.count === n && g.index.count === ix && same && tagged && inRange && new Set(b.slots).size === b.sources.length && [...b.slots].every((s) => s >= 1 && s < RIGID_MAX)
      && b.sources.every((m) => Object.keys(m.geometry.attributes).every((k) => g.attributes[k]?.count === n)),
      `a batch merges its sources' geometry in their local space, tagged per bone (${n} vertices, ${b.sources.length} bones)`);
  }

  // bones follow the source meshes through the animation; hidden sources collapse
  for (let i = 0; i < 20; i++) G.tick(DT);
  sync();
  const flask = p.rig.flask;
  let bad = 0, moving = 0;
  for (const m of heroSrc) if (!live(m, p.object3d)) bad++;
  for (const m of wyrmSrc) if (!live(m, d.object3d)) bad++;
  for (const m of [...heroSrc, ...wyrmSrc]) if (!isZero(bone(m))) moving++;
  assert(bad === 0 && moving >= heroSrc.length + wyrmSrc.length - 4 && reg.data.every(Number.isFinite), `every part's bone is its world matrix (${moving} of ${heroSrc.length + wyrmSrc.length} bones shown)`);
  assert(flask.visible === false && isZero(bone(flask)), 'the hidden flask writes a zero matrix (its triangles collapse)');
  flask.visible = true;
  sync();
  assert(follows(flask) && !isZero(bone(flask)), 'the shown flask writes its world matrix');
  const fore = flask.parent;
  fore.visible = false;
  sync();
  const armHidden = meshes(fore, isRigidSource).every((m) => isZero(bone(m)));
  fore.visible = true;
  flask.visible = false;
  sync();
  assert(armHidden && isZero(bone(flask)) && follows(heroSrc.find((m) => m !== flask && m.parent === fore) ?? heroSrc[0]), 'a hidden joint collapses every part below it, and they come back with it');

  // shadows: the sources keep LAYER_CASTER (never drawn); each actor's ONE shadow mesh (all its
  // casters' triangles) is the only thing of it on LAYER_CASTER_RIGID, and is never in the world pass
  const worldOnly = (set) => set.meshes.every((m) => m.layers.test(view) && !m.layers.test(shadowRigid) && !m.layers.test(shadow));
  const casts = (set, root) => worldOnly(set) && drawn(root, shadowRigid).length === 1 && drawn(root, shadowRigid)[0] === set.shadow && set.shadow.parent === root
    && set.shadow.userData.rigidBatch && !set.shadow.layers.test(view) && !set.shadow.layers.test(shadow);
  const tris = (list) => list.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
  assert(drawn(p.object3d, shadow).length === 0 && drawn(d.object3d, shadow).length === membranes.length && casts(p.batch, p.object3d) && casts(d.batch, d.object3d) && reg.casting === true
    && heroSrc.every((m) => (m.layers.mask & (1 << LAYER_CASTER)) !== 0) && tris([p.batch.shadow]) === tris(heroSrc) && tris([d.batch.shadow]) === tris(wyrmSrc)
    && new Set(p.batch.shadow.geometry.attributes.aRigid.array).size === heroSrc.length,
    `each actor casts its moon shadow with one mesh on LAYER_CASTER_RIGID (hero ${tris([p.batch.shadow])} triangles, wyrm ${tris([d.batch.shadow])}); only the membranes are left on LAYER_CASTER`);
  d.setShadowCasting(false);
  sync();
  const off = worldOnly(d.batch) && drawn(d.object3d, shadowRigid).length === 0 && drawn(d.object3d, shadow).length === 0 && casts(p.batch, p.object3d) && reg.casting === true;
  d.setShadowCasting(true);
  markCaster(p.object3d); // (again, after the build: must not put a source or a batch on a drawn caster layer)
  sync();
  assert(off && casts(d.batch, d.object3d) && casts(p.batch, p.object3d) && drawn(p.object3d, shadow).length === 0 && drawn(p.object3d).length === heroDrawn.length,
    'dragon.setShadowCasting and a late markCaster reach the shadow meshes, and never draw a source');
  // a hidden actor is skipped; its bones are written again when it is shown
  d.object3d.visible = false;
  p.object3d.visible = false;
  sync();
  const idle = reg.casting === false;
  d.object3d.visible = true;
  p.object3d.visible = true;
  sync();
  assert(idle && reg.casting === true, 'hidden actors cast nothing (the rigid shadow pass is skipped)');

  // a loadout rebuild frees the old rig's bones and batches
  const n0 = reg.count, top0 = reg.top, b0 = reg.batches.length;
  const stale = () => meshes(p.object3d, (o) => o.userData.rigidBatch).filter((m) => !p.batch.meshes.includes(m) && m !== p.batch.shadow).length;
  const loadout = { ...p.loadout };
  for (let i = 0; i < 4; i++) p.setLoadout(loadout);
  sync();
  assert(reg.count === n0 && reg.top === top0 && reg.batches.length === b0 && reg.sets.length === 2 && stale() === 0 && drawn(p.object3d).length === heroDrawn.length && casts(p.batch, p.object3d) && heroSrc.every((m) => !isRigidSource(m)),
    `four loadout rebuilds leave the bone count at ${reg.count} (slots reused, no stale batch)`);
  p.equip('back', null);
  sync();
  const fewer = reg.count;
  p.setLoadout(loadout);
  for (let i = 0; i < 10; i++) G.tick(DT);
  sync();
  assert(fewer < n0 && reg.count === n0 && reg.top === top0 && stale() === 0 && meshes(p.object3d, isRigidSource).every((m) => live(m, p.object3d)),
    `the cape off: ${fewer} bones; back on: ${reg.count}, every bone live`);
  // dispose puts the meshes back as they were
  const set = p.batch;
  set.dispose();
  set.dispose();
  const plain = meshes(p.object3d);
  assert(set.meshes.length === 0 && set.shadow === null && reg.sets.length === 1 && plain.every((m) => !m.userData.rigidBatch && !isRigidSource(m) && m.layers.test(view) && m.layers.test(shadow)) && drawn(p.object3d).length === plain.length && reg.count === d.batch.bones,
    `dispose() restores the plain meshes (${plain.length} drawn, casters again) and frees their bones`);
  p.setLoadout(loadout); // batched again for the rest of the run
  assert(reg.count === n0 && drawn(p.object3d).length === heroDrawn.length, 'a rebuild batches the hero again');

  // the builder's corner cases on a small actor, batched BEFORE it is marked a caster: an indexed
  // and a non-indexed part, one of them mirrored, an attribute only one has, an opted-out part and
  // a part with another material
  {
    const { createSurfaceGlyphMaterial } = await imp('src/render/materials.js');
    const root = new THREE.Group();
    const mat = createSurfaceGlyphMaterial(game.U, {});
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.setAttribute('aGUV', new THREE.BufferAttribute(new Float32Array(box.attributes.position.count * 2).fill(0.5), 2));
    const a = new THREE.Mesh(box, mat), b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4).toNonIndexed(), mat);
    const optOut = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat), other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    b.position.set(2, 0, 0);
    b.scale.x = -1;
    optOut.userData.noBatch = true;
    root.add(a, b, optOut, other);
    game.scene.add(root);
    const set = batchRigid(game.U, root);
    const g = set.meshes[0]?.geometry, na = box.attributes.position.count, nb = b.geometry.attributes.position.count;
    const ix = g?.index.array, ia = box.index.count;
    const flipped = !!g && ix[ia] === na && ix[ia + 1] === na + 2 && ix[ia + 2] === na + 1 && ix[0] === box.index.array[0] && ix[1] === box.index.array[1] && ix[2] === box.index.array[2];
    const zeroFill = !!g && g.attributes.aGUV.array.subarray(0, na * 2).every((v) => v === 0.5) && g.attributes.aGUV.array.subarray(na * 2).every((v) => v === 0);
    assert(set.meshes.length === 1 && set.bones === 2 && isRigidSource(a) && isRigidSource(b) && !isRigidSource(optOut) && !isRigidSource(other)
      && g.attributes.position.count === na + nb && g.index.count === ia + nb && flipped && zeroFill && drawn(root).length === 3,
      'the builder merges indexed and non-indexed parts, zero-fills a missing attribute, flips a mirrored part and leaves opted-out / other-material meshes alone');
    sync();
    const before = set.shadow && drawn(root, shadowRigid).length === 0 && drawn(root, shadow).length === 0;
    markCaster(root);
    sync();
    assert(before && drawn(root, shadowRigid).length === 1 && drawn(root, shadowRigid)[0] === set.shadow && tris([set.shadow]) === tris([a, b]) && drawn(root, shadow).length === 2 && drawn(root).length === 3,
      'an actor batched before markCaster casts once it is marked (its unbatched parts on LAYER_CASTER, the rest through its shadow mesh)');
    set.dispose();
    game.scene.remove(root);
    mat.dispose();
    assert(reg.count === n0 && reg.sets.length === 2 && root.children.length === 4 && drawn(root, shadow).length === 4, 'and dispose() leaves its four meshes as plain casters');
  }

  // CONFIG.render.batch = false (`?nobatch`): nothing is batched
  CONFIG.render.batch = false;
  try {
    const G2 = build();
    const p2 = G2.game.player, d2 = G2.game.dragon, reg2 = rigidBones(G2.game.U);
    G2.game.scene.updateMatrixWorld();
    reg2.sync();
    const all = [...meshes(p2.object3d), ...meshes(d2.object3d)];
    assert(reg2.count === 0 && reg2.batches.length === 0 && reg2.sets.length === 0 && reg2.casting === false && p2.batch.meshes.length === 0 && d2.batch.meshes.length === 0 && p2.batch.shadow === null
      && all.length === heroSrc.length + wyrmSrc.length + membranes.length && all.every((m) => !m.userData.rigidBatch && !isRigidSource(m) && m.layers.test(view) && m.layers.test(shadow)),
      `CONFIG.render.batch = false leaves all ${all.length} meshes unbatched, drawn and casting as before`);
    p2.setLoadout({ ...p2.loadout });
    assert(reg2.count === 0 && p2.batch.meshes.length === 0, '... also after a loadout rebuild');
  } finally {
    CONFIG.render.batch = true;
  }
  // the URL flag itself: a fresh copy of core/config.js loaded with ?nobatch in the address
  {
    const had = 'location' in globalThis, prev = globalThis.location;
    const load = async (search, tag) => {
      globalThis.location = { search };
      return (await import(`${pathToFileURL(`${ROOT}/src/core/config.js`).href}?${tag}`)).CONFIG;
    };
    const offCfg = await load('?lab&nobatch', 'batch-off'), onCfg = await load('?lab', 'batch-on');
    if (had) globalThis.location = prev;
    else delete globalThis.location;
    assert(offCfg.render.batch === false && onCfg.render.batch === true && CONFIG.render.batch === true, '?nobatch in the URL turns CONFIG.render.batch off');
  }
  assert(CONFIG.quality.map((q) => q.shadow).join() === '1024,2048,2048', `quality presets carry a shadow map size (${CONFIG.quality.map((q) => `${q.name} ${q.shadow}`).join(', ')})`);
  return G;
}

// ================================================================== scenario: the hero seen through what covers him
// render/pipeline.js step 2b (ADR-106): the hero's root is drawn alone into seenRT inside a box round
// his screen point, a quad erases what the scene shows of him, and the rest goes back into the
// scene target for the ASCII pass to print through. Checked here with the real Pipeline and a
// renderer that records what is drawn where: when the pass runs and when it does not (no object,
// a hidden one, off screen, a non-finite or too-near screen point, the switch off), the box it
// draws, what it tells the ASCII pass (uSeen), the state it leaves behind (also when a draw
// throws), its place in the frame, the probe that gates it (an occlusion query over his torso: on
// from the first frame, off `hold` frames after the last yes, on while no answer comes, off for
// good when queries fail), and the `?noseen` URL flag.
async function scenarioSeen() {
  out('\n== scenario SEEN (the hero printed through what covers him: when the pass runs, what it draws, what it leaves) ==');
  const { Pipeline } = await imp('src/render/pipeline.js');
  const { HERO_ART } = await imp('src/render/materials.js');
  const G = build();
  const { game } = G;
  const U = game.U, cam = game.camera, S = CONFIG.render.seenThrough;
  const log = [];
  let target = null, boom = null;
  const renderer = {
    extensions: { has: () => true }, autoClear: true,
    setRenderTarget(rt) { target = rt; },
    setClearColor() {},
    clear() {},
    render(obj) {
      const e = { obj, mat: obj.material ?? null, target, autoClear: this.autoClear, scissor: target?.scissorTest === true, box: target ? target.scissor.toArray() : null };
      log.push(e);
      if (boom && boom(e)) throw new Error('draw failed');
    },
  };
  const pipe = new Pipeline(renderer, game.scene, game.fxScene, cam, U);
  const W = 1280, H = 720;
  pipe.width = W;
  pipe.height = H;
  pipe.sceneRT.setSize(W, H);
  pipe.seenRT.setSize(W, H);
  cam.aspect = W / H;
  cam.updateProjectionMatrix();
  const uSeen = pipe.asciiMat.uniforms.uSeen.value, ps = U.uPlayerScreen.value;
  const root = game.player.object3d;
  const run = () => { log.length = 0; return pipe._renderSeen(); };
  const off = (why) => assert(run() === false && log.length === 0 && uSeen.w === 0 && pipe.sceneRT.scissorTest === false && renderer.autoClear === true, `no pass ${why}: nothing is drawn, uSeen.w = 0`);
  const half = (z) => Math.ceil((S.reach * 0.5 * H * cam.projectionMatrix.elements[5]) / z);

  assert(S.on === true && S.reach > 2 && S.margin > 0 && S.bareMargin > S.margin && S.hold > 0 && S.probe.length === 3 && S.probe[2] > S.probe[1],
    `CONFIG.render.seenThrough is on (reach ${S.reach} m, margin ${S.margin} m, ${S.bareMargin} m for untagged pixels, probe ${S.probe.join(' / ')} m, hold ${S.hold} frames)`);
  // no object yet
  ps.set(0.5, 0.5, 36, 0);
  off('without an object');

  // the hero's root, in the middle of the screen at the game camera's distance
  pipe.setSeenThrough(root);
  assert(run() === true && log.length === 3, `with the hero on screen the pass runs: ${log.length} draws`);
  const [a, b, c] = log;
  const r36 = half(36);
  out(`   box at 36 m: ${JSON.stringify(a.box)} (half-size ${r36} px of ${W} x ${H})`);
  assert(a.obj === root && a.target === pipe.seenRT && a.autoClear === true && a.scissor, 'first the hero alone into seenRT, its box cleared (autoClear on, scissored)');
  assert(b.obj === pipe.fs.mesh && b.mat === pipe.seenMaskMat && b.target === pipe.seenRT && b.autoClear === false && b.scissor, '... then the quad that erases what the scene shows of him (no clear, the same box)');
  assert(c.obj === pipe.fs.mesh && c.mat === pipe.seenPatchMat && c.target === pipe.sceneRT && c.autoClear === false && c.scissor, '... then what is left into the scene target (no clear, scissored)');
  assert(a.box.join() === [640 - r36, 360 - r36, 2 * r36, 2 * r36].join() && c.box.join() === a.box.join() && r36 > 60 && r36 < 120,
    `the box is centred on his screen point, ${2 * r36} px wide (${S.reach} m each way), the same in both targets`);
  assert(uSeen.x === 0.5 && uSeen.y === 0.5 && uSeen.z === r36 - 2 && uSeen.w === 1, `the ASCII pass is told where: uSeen = (${uSeen.toArray().join(', ')})`);
  assert(pipe.sceneRT.scissorTest === false && pipe.seenRT.scissorTest === true && renderer.autoClear === true, 'afterwards the scene target is unscissored again and autoClear is back on');
  const mu = pipe.seenMaskMat.uniforms;
  assert(mu.uNear.value === cam.near && mu.uFar.value === cam.far && mu.uMargin.value.x === S.margin && mu.uMargin.value.y === S.bareMargin, 'the erasing quad got the camera planes and the margins of the config');
  // autoClear off before: left off
  renderer.autoClear = false;
  run();
  assert(renderer.autoClear === false && log[0].autoClear === true, 'a renderer with autoClear off gets it back off (the box is still cleared)');
  renderer.autoClear = true;

  // nearer: a larger box; at the screen edge: clamped
  ps.set(0.5, 0.5, 18, 0);
  run();
  assert(Math.abs(log[0].box[2] - 4 * r36) <= 2 && uSeen.z === half(18) - 2, `half the distance, twice the box (${log[0].box[2]} px)`);
  ps.set(0.01, 0.98, 36, 0);
  const edge = run() && log[0].box;
  assert(edge && edge[0] === 0 && edge[1] + edge[3] === H && edge[2] > 0 && edge[2] < 2 * r36 && edge[3] > 0 && edge[3] < 2 * r36, `at the screen's corner the box is clamped to the screen (${JSON.stringify(edge)})`);

  // when it must not run
  ps.set(1.5, 0.5, 36, 0);
  off('while he is off screen (right)');
  ps.set(0.5, -0.4, 36, 0);
  off('while he is off screen (below)');
  ps.set(NaN, 0.5, 36, 0);
  off('with a NaN screen point');
  ps.set(0.5, 0.5, NaN, 0);
  off('with a NaN view depth');
  ps.set(0.5, 0.5, 0.2, 0);
  off('with the camera inside him (depth 0.2 m)');
  ps.set(0.5, 0.5, -3, 0);
  off('with him behind the camera');
  ps.set(0.5, 0.5, 36, 0);
  root.visible = false;
  off('while he is hidden');
  root.visible = true;
  S.on = false;
  off('with CONFIG.render.seenThrough.on false');
  S.on = true;
  pipe.setSeenThrough(null);
  off('after setSeenThrough(null)');
  pipe.setSeenThrough(root);
  assert(run() === true && uSeen.w === 1, '... and it runs again once every condition holds');

  // a draw that throws: the state is restored, the ASCII pass is told there is nothing
  for (const [name, at] of [['the hero', 0], ['the erasing quad', 1], ['the patch', 2]]) {
    boom = (e) => log.indexOf(e) === at;
    let threw = false;
    try { run(); } catch { threw = true; }
    boom = null;
    assert(threw && pipe.sceneRT.scissorTest === false && renderer.autoClear === true && uSeen.w === 0, `a failing draw (${name}) leaves the scene target unscissored, autoClear on and uSeen.w = 0`);
  }

  // its place in the frame: after the world pass, before the ASCII pass; and a loadout rebuild keeps it
  game.scene.updateMatrixWorld();
  log.length = 0;
  pipe.render();
  const world = log.findIndex((e) => e.obj === game.scene && e.target === pipe.sceneRT);
  const seenAt = log.findIndex((e) => e.obj === root), ascii = log.findIndex((e) => e.mat === pipe.asciiMat);
  assert(world >= 0 && seenAt === world + 1 && ascii === seenAt + 3 && log[ascii].target === pipe.compRT && log[ascii].scissor === false,
    `in a whole frame: the world (${world}), then the hero alone and the two quads (${seenAt}..${seenAt + 2}), then the ASCII pass (${ascii})`);
  assert(game.scene.matrixWorldAutoUpdate === true && root.matrixWorldAutoUpdate === true, 'the frame leaves the scene graph updating its matrices');
  game.player.setLoadout({ ...game.player.loadout });
  assert(pipe.seenRoot === game.player.object3d && run() === true, 'a loadout rebuild keeps the same root: he is still printed through');

  // the contract of the three shaders: one hero window, wide enough for every part id; the quads' depth rules
  const win = /bool isHero\(float a\) \{ return a > ([\d.]+) && a < ([\d.]+); \}/;
  const wins = [pipe.asciiMat, pipe.seenMaskMat, pipe.seenPatchMat].map((m) => win.exec(m.fragmentShader));
  const lo = Number(wins[0]?.[1]), hi = Number(wins[0]?.[2]);
  assert(wins.every((w) => w && w[0] === wins[0][0]) && HERO_ART.a0 > lo && HERO_ART.a0 + (HERO_ART.parts * 2 - 1) * HERO_ART.step < hi,
    `the ASCII pass and both quads test the same hero window (${lo}, ${hi}), and every part id is inside it`);
  assert(pipe.seenMaskMat.depthTest && pipe.seenMaskMat.depthFunc === THREE.GreaterEqualDepth && pipe.seenMaskMat.depthWrite === false && pipe.seenMaskMat.blending === THREE.NoBlending,
    'the erasing quad: passes where the scene (plus the margin) is not in front of him, writes no depth, no blending');
  assert(pipe.seenPatchMat.depthTest && pipe.seenPatchMat.depthFunc === THREE.AlwaysDepth && pipe.seenPatchMat.depthWrite === true && pipe.seenPatchMat.blending === THREE.NoBlending,
    'the patch: always passes, writes his depth, no blending');
  assert(pipe.asciiMat.uniforms.tSeen.value === pipe.seenRT.texture && pipe.seenPatchMat.uniforms.tSeen.value === pipe.seenRT.texture && pipe.seenMaskMat.uniforms.tDepth.value === pipe.sceneRT.depthTexture,
    'the ASCII pass and the patch read seenRT; the erasing quad reads the scene depth');

  // ---- the gate: with a GL context, a probe (an occlusion query over his torso) decides whether
  // the pass runs. A second pipeline on a renderer whose context answers the queries by script.
  {
    const q = { available: true, result: 0, made: 0, begun: 0, ended: 0, fail: false };
    const gl = {
      ANY_SAMPLES_PASSED: 0x8c2f, QUERY_RESULT: 0x8866, QUERY_RESULT_AVAILABLE: 0x8867,
      createQuery() { q.made++; return { id: q.made }; },
      beginQuery(t) { if (q.fail || t !== this.ANY_SAMPLES_PASSED) throw new Error('no queries'); q.begun++; },
      endQuery(t) { if (t === this.ANY_SAMPLES_PASSED) q.ended++; },
      getQueryParameter(o, name) { return name === this.QUERY_RESULT_AVAILABLE ? q.available : q.result; },
    };
    const r2 = { ...renderer, autoClear: true, getContext: () => gl };
    const pipe2 = new Pipeline(r2, game.scene, game.fxScene, cam, U);
    pipe2.width = W;
    pipe2.height = H;
    pipe2.sceneRT.setSize(W, H);
    pipe2.seenRT.setSize(W, H);
    pipe2.setSeenThrough(root);
    // the game's view of him: the camera behind and above, looking at the point 1 m above his feet
    const pp = game.player.position, pitch = CONFIG.camera.pitch, D = CONFIG.camera.distance;
    cam.position.set(pp.x, pp.y + 1 + D * Math.sin(pitch), pp.z + D * Math.cos(pitch));
    cam.lookAt(pp.x, pp.y + 1, pp.z);
    game.scene.updateMatrixWorld();
    cam.updateMatrixWorld();
    ps.set(0.5, 0.5, D, 0);
    const u2 = pipe2.asciiMat.uniforms.uSeen.value, G2 = pipe2.seenGate;
    const frame = () => { log.length = 0; return pipe2._renderSeen(); };

    // the first frame: the probe goes out, and the pass runs until an answer says otherwise
    assert(frame() === true && log.length === 4 && q.made === 1 && q.begun === 1 && q.ended === 1, `first frame: a probe (${q.begun} query) and the pass (${log.length} draws)`);
    const pr = log[0], box = log[1].box;
    const up = pipe2.seenProbeMat.uniforms.uProbe.value;
    out(`   probe rect ${JSON.stringify(pr.box)} inside the pass's box ${JSON.stringify(box)}; depths ${up.z.toFixed(2)} m (foot) .. ${up.w.toFixed(2)} m (top), he stands at ${D} m`);
    assert(pr.obj === pipe2.fs.mesh && pr.mat === pipe2.seenProbeMat && pr.target === pipe2.sceneRT && pr.scissor && pr.autoClear === false, 'the probe is one quad into the scene target, scissored, nothing cleared');
    assert(pr.box[0] >= box[0] && pr.box[1] >= box[1] && pr.box[0] + pr.box[2] <= box[0] + box[2] && pr.box[1] + pr.box[3] <= box[1] + box[3] && pr.box[2] > 8 && pr.box[2] < box[2] / 2 && pr.box[3] > 8,
      `its rect is his torso: inside the box, ${pr.box[2]} x ${pr.box[3]} px`);
    assert(Math.abs(pr.box[0] + pr.box[2] / 2 - 640) <= 1 && pr.box[1] < 360 && pr.box[1] + pr.box[3] > 360, 'the rect is centred on his screen x and spans the point 1 m above his feet');
    assert(up.w < up.z && up.z < D + 0.5 && up.w > D - 1.5 && up.z - up.w > 0.5 && up.x < up.y, `the tested depth runs from his foot (${up.z.toFixed(2)} m) to his nearer top (${up.w.toFixed(2)} m), pulled towards the camera`);
    assert(pipe2.seenProbeMat.depthTest && pipe2.seenProbeMat.depthFunc === THREE.GreaterDepth && pipe2.seenProbeMat.depthWrite === false && pipe2.seenProbeMat.colorWrite === false,
      'the probe passes where the scene is nearer, and writes neither colour nor depth');
    assert(pipe2.sceneRT.scissorTest === false && r2.autoClear === true, '... and leaves the scene target unscissored, autoClear on');

    // answers "nothing in front of him": after `hold` frames only the probe is left
    let n = 0;
    while (frame() && n < 200) n++;
    assert(n >= S.hold - 2 && n <= S.hold + 1 && log.length === 1 && log[0].mat === pipe2.seenProbeMat && u2.w === 0, `in the open the pass stops after ${n} frames (hold ${S.hold}): one probe quad a frame is all that is drawn`);
    for (let i = 0; i < 30; i++) frame();
    assert(frame() === false && log.length === 1 && q.begun === q.ended && q.made === 1, `... and it stays off, one query a frame (${q.begun} so far, one query object)`);
    // "something is in front of him": the pass is back on the frame the answer is read
    q.result = 1;
    assert(frame() === true && log.length === 4 && u2.w === 1, 'an answer of yes: the pass runs again that frame');
    q.result = 0;
    let m = 0;
    while (frame() && m < 200) m++;
    assert(m >= S.hold - 2 && m <= S.hold + 1, `after the last yes it runs ${m} more frames, then stops`);
    // no answer at all (a hidden tab, frames stepped in one task): counted as a yes, no second query
    q.available = false;
    const begun = q.begun;
    let all = true;
    for (let i = 0; i < 60; i++) all = frame() && all;
    const later = frame();
    assert(q.begun === begun && later === true && log.length === 3, `while no answer arrives no new probe goes out and the pass runs (${G2.age} frames waiting)`);
    assert(!all, '... after the three frames it gives an answer to come');
    q.available = true;
    // he leaves the screen or is hidden: neither probe nor pass
    const b2 = q.begun;
    ps.set(1.6, 0.5, D, 0);
    assert(frame() === false && log.length === 0 && q.begun === b2, 'off screen: no probe, no pass');
    ps.set(0.5, 0.5, D, 0);
    root.visible = false;
    assert(frame() === false && log.length === 0 && q.begun === b2, 'hidden: no probe, no pass');
    root.visible = true;
    // queries that fail: one warning, then the pass runs every frame
    const warn = console.warn;
    let warned = 0;
    console.warn = () => { warned++; };
    try {
      q.fail = true;
      const first = frame(), second = frame(), third = frame();
      assert(first && second && third && G2.off === true && log.length === 3 && warned === 1 && pipe2.sceneRT.scissorTest === false && r2.autoClear === true,
        `a context whose queries throw: the gate switches itself off (${warned} warning) and the pass runs every frame`);
    } finally {
      console.warn = warn;
    }
    // without a GL context there is nothing to ask
    assert(pipe.seenGate.off === true && pipe.seenGate.gl === null, 'a renderer without a GL context (the first pipeline here) never probes: the pass ran every frame above');
  }

  // the URL flag: a fresh copy of core/config.js loaded with ?noseen in the address
  {
    const had = 'location' in globalThis, prev = globalThis.location;
    const load = async (search, tag) => {
      globalThis.location = { search };
      return (await import(`${pathToFileURL(`${ROOT}/src/core/config.js`).href}?${tag}`)).CONFIG;
    };
    const offCfg = await load('?lab&noseen', 'seen-off'), onCfg = await load('?lab', 'seen-on');
    if (had) globalThis.location = prev;
    else delete globalThis.location;
    assert(offCfg.render.seenThrough.on === false && onCfg.render.seenThrough.on === true && CONFIG.render.seenThrough.on === true, '?noseen in the URL turns CONFIG.render.seenThrough.on off');
  }
  return G;
}

// ================================================================== scenario: the two stances
// ADR-114 (the owner's pick of three rendered stances): where the hero STANDS. At ease with nothing
// to fight: the blade down the arm's own line, a hand on the belt; the fencer's guard once locked on
// or in a boss fight. Checked: which stance the game picks; the sword wrist; the hand ON the waist
// (not in it, not hovering off it); the blade broad to the game camera from every side (edge-on it
// vanished from behind); the life in both (the stance before moved under half a pixel); and the
// transitions the guard brought: the run, a roll and a backstep out of it, taking it and letting it
// down. A duelist's footwork still reads guard().
async function scenarioHeroStance() {
  out('\n== scenario HEROSTANCE (at ease and the fencer\'s guard: the rule, the wrist, the hand on the belt, the life, the transitions) ==');
  const { DIM: HD, BODY } = await imp('src/entities/player/model.js');
  const { P, N, guard, stand } = await imp('src/entities/player/anim.js');
  const { STAND_LIFE, BELT } = await imp('src/entities/player/stances.js');
  const G = build();
  const { game, input } = G;
  run(G, 0.3);
  assert(game.flow.debug.toState('explore') === true, 'flow.debug.toState(explore) from title');
  const p = game.player, r = p.rig, A = p.anim;
  p.debug.god = true;
  const LANE = [-10, 13]; // open ground (HEROARMS)
  p.debug.teleport(LANE[0], LANE[1]);
  p.lean.on = false; // (the drawn hero is sheared toward the camera: measured without it)
  const DEG = 180 / Math.PI;
  const v = new THREE.Vector3(), w = new THREE.Vector3(), qa = new THREE.Quaternion();
  const aim = { x: 0, z: -60 };
  const go = (sec, each) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) { game.mouseGround.set(p.position.x + aim.x, 0, p.position.z + aim.z); G.tick(DT); each?.(); } };
  const tipOf = (o) => o.set(0, 0, HD.drawnTip).applyMatrix4(r.sword.matrixWorld);
  const kink = () => {
    v.set(0, -1, 0).applyQuaternion(r.arms.R.fore.getWorldQuaternion(qa));
    w.set(0, 0, 1).applyQuaternion(r.sword.getWorldQuaternion(qa));
    return Math.acos(clamp(v.normalize().dot(w.normalize()), -1, 1)) * DEG;
  };
  const elbow = (s) => 180 - Math.abs(r.arms[s].fore.rotation.x) * DEG;
  const A0 = A.fidget.wait;
  const noLife = (on) => { A.fidget.wait = on ? 1e9 : A0; }; // the idle actions held off: the bare stance

  // (S1) the rule: at ease exploring; the guard locked on (the lock is the player's own: held
  // here, since the sleeping wyrm breaks it), in a boss fight (HEROLIFE checks that one, with and
  // without a lock), or held by the Lab; and he lets it down more slowly than he took it
  noLife(true);
  go(1.5);
  const wExplore = A.fightW;
  const lockWas = p._updateLock;
  p._updateLock = () => {};
  p.lockOn = true;
  go(1.2);
  const wLock = A.fightW;
  p.lockOn = false;
  p._updateLock = lockWas;
  go(3.0);
  let tUp = 0, tDown = 0;
  p.debug.fightStance = true;
  go(3.0, () => { if (A.fightW < 0.9) tUp += DT; });
  const wForced = A.fightW;
  p.debug.fightStance = null;
  go(3.0, () => { if (A.fightW > 0.1) tDown += DT; });
  out(`   fightW: exploring ${wExplore.toFixed(2)}, locked on ${wLock.toFixed(2)}, held by the Lab ${wForced.toFixed(2)}; up in ${tUp.toFixed(2)} s, down in ${tDown.toFixed(2)} s`);
  assert(game.state === 'explore' && wExplore < 0.02 && wLock > 0.95 && wForced > 0.99 && A.fightW < 0.02, `at ease exploring (fightW ${wExplore.toFixed(2)}), the guard once locked on (${wLock.toFixed(2)}) or held by the Lab's hook (${wForced.toFixed(2)})`);
  assert(tUp <= 0.5 && tDown >= 0.7 && tDown <= 1.4, `he takes the guard in ${tUp.toFixed(2)} s (≤ 0.5) and lets it down over ${tDown.toFixed(2)} s (0.7-1.4)`);

  // (S2) each stance, standing: the wrist, the elbows, the point, the hand on the waist, the blade
  // broad to the game camera with him turned four ways
  const { shell, ell } = heroShapes(BODY, HD);
  // how deep a point is in the waist: its shell, or the hips under it (+ = inside)
  const inWaist = (o) => Math.max(shell(r.spine.worldToLocal(w.copy(o))), ell(r.pelvis.worldToLocal(w.copy(o)), BODY.hips.c, BODY.hips.r));
  const camDir = new THREE.Vector3(0, Math.sin(CONFIG.camera.pitch), Math.cos(CONFIG.camera.pitch)); // from him to the camera
  const shape = (fight) => {
    p.debug.fightStance = fight;
    aim.x = 0;
    aim.z = -60;
    go(2.0);
    const S = { kink: kink(), R: elbow('R'), L: elbow('L'), tip: tipOf(v).y, open: r.offHand.open.visible && !r.offHand.fingers?.visible && !r.offHand.grip.visible, broad: 9, palm: 0, finger: 0 };
    // the palm (the IK end) and the fingertip against the waist's surface (+ = inside it)
    S.palm = shell(r.spine.worldToLocal(v.set(0, -HD.foreArm, 0).applyMatrix4(r.arms.L.fore.matrixWorld)));
    S.finger = inWaist(v.setFromMatrixPosition(r.arms.L.point.matrixWorld));
    for (const [ax, az] of [[0, -60], [0, 60], [60, 0], [-60, 0]]) {
      aim.x = ax;
      aim.z = az;
      go(0.9);
      w.set(0, 1, 0).applyQuaternion(r.sword.getWorldQuaternion(qa)); // the flat's normal
      S.broad = Math.min(S.broad, Math.abs(w.dot(camDir)));
    }
    aim.x = 0;
    aim.z = -60;
    go(0.9);
    return S;
  };
  const E = shape(false), Fg = shape(true);
  out(`   at ease: wrist ${E.kink.toFixed(0)}°, elbows R ${E.R.toFixed(0)}° L ${E.L.toFixed(0)}°, the point ${E.tip.toFixed(2)} m up, palm ${(E.palm * 100).toFixed(1)} cm / fingertip ${(E.finger * 100).toFixed(1)} cm in the waist, the flat ${E.broad.toFixed(2)} to the camera at worst`);
  out(`   the guard: wrist ${Fg.kink.toFixed(0)}°, elbows R ${Fg.R.toFixed(0)}° L ${Fg.L.toFixed(0)}°, the point ${Fg.tip.toFixed(2)} m up, palm ${(Fg.palm * 100).toFixed(1)} cm / fingertip ${(Fg.finger * 100).toFixed(1)} cm in the waist, the flat ${Fg.broad.toFixed(2)} to the camera at worst`);
  assert(E.kink <= 16 && E.R >= 125 && E.tip >= 0.08 && E.tip <= 0.4, `at ease the blade lies on the forearm's line (${E.kink.toFixed(0)}° ≤ 16; the stance before: 27), the elbow soft (${E.R.toFixed(0)}° ≥ 125), the point a hand above the grass (${E.tip.toFixed(2)} m in 0.08-0.40)`);
  assert(Fg.kink <= 16 && Fg.R >= 85 && Fg.R <= 125 && Fg.tip >= 1.1, `in the guard the blade lies on the forearm's line (${Fg.kink.toFixed(0)}° ≤ 16), the arm half extended (${Fg.R.toFixed(0)}° in 85-125), the point up on the foe (${Fg.tip.toFixed(2)} m ≥ 1.1)`);
  for (const [name, S] of [['at ease', E], ['in the guard', Fg]]) {
    assert(S.open && S.palm <= 0.005 && S.palm >= -0.05 && S.finger <= 0.015,
      `${name} the free hand lies open ON the belt: the palm ${(-S.palm * 100).toFixed(1)} cm off the waist (0-5: not in it, not hovering), the fingertip ${(S.finger * 100).toFixed(1)} cm into the waist or the hips (≤ 1.5)`);
    // (a blade that hangs steeply cannot face four cameras at once: ≥ 0.25 of its width at ease)
    const need = S === E ? 0.25 : 0.3;
    assert(S.broad >= need, `${name} the blade shows its flat to the game camera whichever way he faces (${S.broad.toFixed(2)} of its width at worst, ≥ ${need}; edge-on it vanished from behind)`);
  }

  // (S3) the life in a stance: over 12 s the point travels, and never in a jump
  const life = (fight) => {
    p.debug.fightStance = fight;
    go(1.5);
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity), was = new THREE.Vector3();
    let step = 0, n = 0, kSum = 0, kMax = 0;
    go(12, () => {
      const k = kink();
      kSum += k;
      kMax = Math.max(kMax, k);
      tipOf(v);
      lo.min(v);
      hi.max(v);
      if (n++) step = Math.max(step, v.distanceTo(was));
      was.copy(v);
    });
    return { range: Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z), step, kink: kSum / n, kinkMax: kMax };
  };
  const lE = life(false), lF = life(true);
  out(`   life: the point travels ${(lE.range * 100).toFixed(1)} cm at ease, ${(lF.range * 100).toFixed(1)} cm in the guard over 12 s; fastest frame ${(lE.step * 100).toFixed(2)} / ${(lF.step * 100).toFixed(2)} cm; the wrist ${lE.kink.toFixed(1)}° (≤ ${lE.kinkMax.toFixed(1)}°) at ease, ${lF.kink.toFixed(1)}° (≤ ${lF.kinkMax.toFixed(1)}°) in the guard`);
  // (the point's drift is the wrist's: it carries the blade a few degrees round the forearm's line)
  assert(lE.kink <= 10 && lE.kinkMax <= 16 && lF.kink <= 10 && lF.kinkMax <= 16,
    `through its life the blade stays on the forearm's line: ${lE.kink.toFixed(1)}° on average at ease, ${lF.kink.toFixed(1)}° in the guard (≤ 10), never past ${Math.max(lE.kinkMax, lF.kinkMax).toFixed(1)}° (≤ 16; the stance before: 27)`);
  assert(lE.range >= 0.06 && lF.range >= 0.06 && lE.step <= 0.01 && lF.step <= 0.01,
    `he is alive in both stances: the point travels ${(lE.range * 100).toFixed(1)} / ${(lF.range * 100).toFixed(1)} cm over 12 s (≥ 6; the stance before: 2-4), never more than ${(Math.max(lE.step, lF.step) * 100).toFixed(2)} cm in a frame (≤ 1)`);
  const per = [...STAND_LIFE.breath, STAND_LIFE.settle, STAND_LIFE.drift, ...STAND_LIFE.look, ...STAND_LIFE.point];
  assert(per.every((a, i) => per.every((b, j) => i === j || a < b || Math.abs(a / b - Math.round(a / b)) > 0.04)), `no two of its periods divide one another (${per.join(', ')} s; each ratio > 4 % off a whole number): the stance never visibly loops`);

  // (S4) the transitions out of the guard and back: the fastest frame of the point (round the root)
  const fastest = (sec, before) => {
    let best = 0, n = 0;
    const was = new THREE.Vector3();
    go(sec, () => {
      before?.(n);
      tipOf(v).sub(p.position);
      if (n++) best = Math.max(best, v.distanceTo(was));
      was.copy(v);
    });
    return best;
  };
  p.debug.fightStance = true;
  go(1.5);
  const moves = {};
  for (const [name, ax] of [['run', [0, 1]], ['strafe', [1, 0]], ['back', [0, -1]]]) {
    p.debug.teleport(LANE[0], LANE[1]);
    go(1.0);
    input.axis = { x: ax[0], y: ax[1] };
    const a = fastest(0.9);
    input.axis = { x: 0, y: 0 };
    moves[name] = Math.max(a, fastest(1.2));
  }
  p.debug.teleport(LANE[0], LANE[1]);
  go(1.0);
  input.axis = { x: 0, y: 1 };
  input.tap('Space');
  const rollIn = fastest(0.2);
  input.axis = { x: 0, y: 0 };
  const rollOut = fastest(1.2);
  p.debug.teleport(LANE[0], LANE[1]);
  go(1.0);
  input.tap('Space');
  const backIn = fastest(0.2);
  go(1.2);
  p.debug.fightStance = false;
  go(2.0);
  p.debug.fightStance = true;
  const take = fastest(1.0);
  p.debug.fightStance = false;
  const drop = fastest(2.0);
  p.debug.fightStance = null;
  out(`   the point's fastest frame (cm): run ${(moves.run * 100).toFixed(1)}, strafe ${(moves.strafe * 100).toFixed(1)}, backpedal ${(moves.back * 100).toFixed(1)} in the guard; into a roll ${(rollIn * 100).toFixed(1)}, out of it ${(rollOut * 100).toFixed(1)}; into a backstep ${(backIn * 100).toFixed(1)}; taking the guard ${(take * 100).toFixed(1)}, letting it down ${(drop * 100).toFixed(1)}`);
  assert(Math.max(moves.run, moves.strafe, moves.back) <= 0.08, `in a fight he keeps the guard up on the move: setting off and stopping, the point moves at most ${(Math.max(moves.run, moves.strafe, moves.back) * 100).toFixed(1)} cm a frame (≤ 8; trailed, it swung 16-18)`);
  assert(rollIn <= 0.6 && backIn <= 0.6, `a roll and a backstep out of the guard ease the blade away: ${(rollIn * 100).toFixed(1)} / ${(backIn * 100).toFixed(1)} cm a frame at the point in their first 0.2 s (≤ 60; inside the cross-fade it was 173 / 118)`);
  assert(take <= 0.3 && drop <= 0.12, `taking the guard the point moves at most ${(take * 100).toFixed(1)} cm a frame (≤ 30), letting it down ${(drop * 100).toFixed(1)} (≤ 12)`);

  // (S5) guard() is still the base of every other clip and a duelist's footwork: stand() leaves a
  // pose without the hero's free hand alone, and changes the hero's
  {
    const a = new Float32Array(N), b = new Float32Array(N);
    const fake = (freeHand) => ({ freeHand, time: 1.3, fightW: 1, moveW: 0, player: null });
    guard(a, fake(false));
    stand(b, fake(false));
    const same = a.every((x, i) => x === b[i]);
    stand(b, fake(true));
    const differs = Math.hypot(a[P.rH] - b[P.rH], a[P.rH + 1] - b[P.rH + 1], a[P.rH + 2] - b[P.rH + 2]) > 0.1 && b[P.hs] === 0 && Number.isFinite(BELT.yaw);
    assert(same && differs && b.every(Number.isFinite), 'stand() is the hero\'s alone: a duelist\'s animator (no free hand) gets guard() unchanged; the hero gets the stance, every channel finite');
  }
  noLife(false);
  p.lean.on = true;
  return G;
}

// ================================================================== scenario: terrain moves (ADR-110)
// The wyrm's moves that use the world's pieces, on the REAL Destructibles over a small hand-built set
// (build({ terrain })): the tell and its flash, the piece taken / flown / landed where it was marked,
// the blow only inside the mark and dodged like any red blow, the boulder parried / blocked / stepped
// off / stopped by cover, nothing when no piece is in reach, and the reset.
async function scenarioTerrain() {
  out('\n== scenario TERRAIN (hurl, tail bat, firebrand: one tell, the flare on the flying piece, NOTHING on the ground before it lands, the tug and the tear, the path smashed, dodge, parry, cover, no piece, reset) ==');
  const lead = TUNING.flashLead;
  const X = TUNING.attacks;
  const { INTACT, HELD, FLYING, GONE } = PIECE;
  // ---- the moves are abilities with tuning data
  {
    const G = build();
    const ab = new Map(G.game.dragon.debug.abilities().map((a) => [a.name, a]));
    assert(ab.get('hurl')?.tell === TELL.RED && ab.get('tailBat')?.tell === TELL.BLUE && ab.get('fireBrand')?.tell === TELL.RED && ab.get('fireBrand').phase === 2, 'hurl (red), tailBat (blue) and fireBrand (red, phase 2) are Lab abilities with tuning data');
    // ---- no world pieces at all (the other suites' mock): never picked; forced, it looks round and ends
    fightSetup(G);
    const d = G.game.dragon;
    let w = 0;
    for (const dist of [6, 12, 20]) {
      place(G, dist / SIZE);
      G.tick(DT);
      for (const ph of [1, 2, 3]) {
        d.phase = ph;
        for (const n of ['hurl', 'tailBat', 'fireBrand']) w += attackWeight(ATTACKS[n], n, d, d.sense);
      }
    }
    d.phase = 1;
    assert(w === 0, 'a world without pieces: the three moves weigh 0 at every distance and phase (never picked)');
    for (const n of ['hurl', 'tailBat', 'fireBrand']) {
      settle(G);
      const c0 = { ...G.counts }, e0 = errors.length;
      const ok = G.game.lab.trigger(n);
      let sawSearch = false;
      const done = run(G, 4, { passive: true }, () => { sawSearch = sawSearch || d.brain.action?.phase === 'search'; return !d.brain.action && sawSearch; });
      assert(ok && done && (G.counts['combat:tell'] || 0) === (c0['combat:tell'] || 0) && !G.hits.some((h) => h.attack === n) && errors.length === e0, `   ${n} forced with nothing in reach: it casts about and ends (no tell, no blow, no error)`);
    }
  }

  /** A fight on the hand-built field; the wyrm at (x, z) facing `yaw`, the hero at (hx, hz). */
  const field = (kind = 'field') => {
    const G = build({ terrain: kind });
    fightSetup(G);
    G.stamps = [];
    const burn = G.game.world.scorch.burnCircle;
    G.game.world.scorch.burnCircle = (x, z, r, a, b) => { G.stamps.push({ t: G.game.time, x, z, r }); return burn(x, z, r, a, b); };
    G.ignites = [];
    const ig = G.game.world.ignite;
    G.game.world.ignite = (x, z, r, k) => { G.ignites.push({ x, z, r, k }); return ig(x, z, r, k); };
    return G;
  };
  const stage = (G, x, z, yaw, hx, hz) => {
    const d = G.game.dragon, p = G.game.player;
    settle(G);
    G.game.world.restore();
    d.hazards.clear();
    d.terrain.reset(); // (no wreck of an earlier throw still burning)
    d.position.set(x, 0, z);
    d.yaw = yaw;
    d.rig.snap();
    p.debug.teleport(hx, hz);
    p.debug.heal();
    p.debug.god = false;
    run(G, 0.3, { passive: true });
    d.position.set(x, 0, z);
    d.yaw = yaw;
    p.debug.teleport(hx, hz);
    p.yaw = Math.atan2(d.position.x - hx, d.position.z - hz);
    aimAt(G);
    G.tick(DT);
  };
  /**
   * Force `name` and follow it: the tell, the flash, the piece's states, the hit. `each(rec)` runs
   * every frame before the tick (move the hero, press something). Ends when the action is over and
   * nothing is in the air.
   */
  const follow = (G, name, each = null, max = 9) => {
    const { game } = G;
    const d = game.dragon, D = game.world.destructibles, fx = d.fx;
    const rec = { tells: [], flashes: [], states: new Set(), phases: [], piece: null, crash: null, taken: null, land: null, lx: NaN, lz: NaN, marks: 0, hit: null, hitT: NaN, spells: 0, explosions: 0, held: 0, rooted: 0, smashed: d.terrain.smashed };
    const h0 = G.hits.length;
    // (second pass, the owner: "don't show exactly where the terrain will land": every way the wyrm
    // draws heat on the ground ahead of a blow is counted while the move runs or its piece flies)
    const marked = ['heatDisc', 'heatBand', 'heatFlare', 'warnRing', 'ringPulse', 'hazardFlash'];
    const saved = marked.map((k) => fx[k]);
    marked.forEach((k, i) => { if (typeof saved[i] === 'function') fx[k] = (...args) => { rec.marks++; return saved[i].apply(fx, args); }; });
    const imp = d.terrain._impact;
    d.terrain._impact = (s, x, z) => { rec.land = { t: game.time, x, z, sx: s.x0, sz: s.z0 }; return imp.call(d.terrain, s, x, z); };
    G.watch = (n, dd) => {
      if (n === 'dragon:spell' && dd?.name === name) rec.spells++;
      if (n === 'dragon:explosion') rec.explosions++;
      if (n === 'world:impact' && dd.by === 'boss' && dd.kind === 'throw') rec.taken = { t: game.time, id: dd.id, x: dd.x, z: dd.z };
      if (n === 'world:impact' && dd.by === 'boss' && dd.kind === 'crash') rec.crash = { t: game.time, id: dd.id, x: dd.x, z: dd.z };
      if (dd?.attack !== name) return;
      if (n === 'combat:tell') rec.tells.push({ t: game.time, tell: dd.tell, impactIn: dd.impactIn, flare: dd.flare });
      if (n === 'combat:flash') rec.flashes.push({ t: game.time, tell: dd.tell, x: dd.x, y: dd.y, z: dd.z, flare: dd.flare });
    };
    rec.trigger = game.lab.trigger(name);
    let started = false;
    try {
      for (let i = 0; i < Math.round(max / DT); i++) {
        G.input.axis = { x: 0, y: 0 };
        aimAt(G);
        const a = d.brain.action;
        if (a?.name === name) {
          started = true;
          rec.a = a;
          if (rec.phases[rec.phases.length - 1] !== a.phase) rec.phases.push(a.phase);
          if (a.piece) rec.piece = a.piece;
          if (Number.isFinite(a.lx) && a.thrown) { rec.lx = a.lx; rec.lz = a.lz; }
          if (d.terrain.hold.piece) rec.held++;
          if (d.terrain.hold.piece && d.terrain.hold.rooted) rec.rooted++;
        }
        if (rec.piece) rec.states.add(rec.piece.state);
        each?.(rec, a);
        G.tick(DT);
        if (!rec.hit) {
          const h = G.hits.slice(h0).find((x) => x.attack === name && !(x.kind === 'fire' && x.tell === TELL.NORMAL)); // (not a burning wreck's tick)
          if (h) { rec.hit = h; rec.hitT = h.t; }
        }
        if (started && !d.brain.action && !d.terrain.shots.some((s) => s.on) && D.active.every((b) => b.state !== FLYING && b.state !== HELD)) break;
      }
    } finally {
      marked.forEach((k, i) => { if (saved[i]) fx[k] = saved[i]; });
      d.terrain._impact = imp;
    }
    rec.smashed = d.terrain.smashed - rec.smashed;
    rec.fire = G.hits.slice(h0).filter((x) => x.attack === name && x.kind === 'fire' && x.tell === TELL.NORMAL);
    rec.lead = rec.hit && rec.flashes.length ? rec.hitT - rec.flashes[0].t : NaN;
    rec.t2b = rec.tells.length && rec.hit ? rec.hitT - rec.tells[0].t : rec.tells.length && rec.land ? rec.land.t - rec.tells[0].t : NaN;
    G.watch = null;
    return rec;
  };
  const timingOk = (rec) => rec.flashes.length === 1 && Number.isFinite(rec.hitT) && Math.abs(rec.hitT - rec.flashes[0].t - lead) <= 0.085;
  // nothing on the ground before the blow: no heat drawn (0 frames) and no scorch stamped before it lands
  const unmarked = (G, rec) => rec.marks === 0 && !G.stamps.some((s) => s.t > (rec.tells[0]?.t ?? Infinity) && s.t < (rec.land?.t ?? rec.hitT) - 1e-6);
  /** A roll pressed `after` s after the flash (sideways), the hero otherwise standing still. */
  const rollAt = (G, after) => {
    let rolled = false;
    return (rec) => {
      if (!rolled && rec.flashes.length && G.game.time >= rec.flashes[0].t + after - 1e-6) { rolled = true; G.input.axis = { x: 1, y: 0 }; G.input.tap('Space'); rec.rolled = G.game.time - rec.flashes[0].t; }
    };
  };
  // the second pass's bands (tell to blow), phase 1: hurl 1.3 - 1.6 s (a throw behind it, the pivot,
  // up to ~1.9), the firebrand under ~2.0 s in phase 2, the tail bat 1.0 - 1.4 s; quicker in later phases
  const BAND = { hurl: [1.1, 1.75], fireBrand: [1.3, 2.05], tailBat: [0.9, 1.45] };

  // ================================================================ hurl
  {
    const G = field();
    const { game } = G;
    const d = game.dragon, p = game.player, D = game.world.destructibles;
    const tree = D.list.find((b) => b.kind === 'deadTree' && Math.hypot(b.x - 12, b.z) < 0.1);
    // ---- AI gate: a piece in reach and the hero at range
    stage(G, 2, 0, Math.PI / 2, 2, 18);
    assert(attackWeight(ATTACKS.hurl, 'hurl', d, d.sense) > 0, `hurl: a tree 10 m off and the hero 18 m away: the AI may pick it (weight ${attackWeight(ATTACKS.hurl, 'hurl', d, d.sense)})`);
    const wFar = attackWeight(ATTACKS.hurl, 'hurl', d, d.sense);
    p.debug.teleport(2, 7);
    G.tick(DT);
    const wNear = attackWeight(ATTACKS.hurl, 'hurl', d, d.sense);
    p.debug.teleport(2, 3);
    G.tick(DT);
    assert(near(wNear, wFar * X.hurl.closeK, 1e-9) && attackWeight(ATTACKS.hurl, 'hurl', d, d.sense) === 0, `hurl: picked less with the hero 7 m away (${wNear.toFixed(2)}: it turns its back on him), never with him under its chest`);
    // ---- the hero stands still: taken (rooted, then torn out), flown, landed where it was aimed, one red blow
    stage(G, 2, 0, Math.PI / 2, 2, 18);
    const hp0 = p.hp;
    const r = follow(G, 'hurl');
    assert(r.trigger && r.tells.length === 1 && r.tells[0].tell === TELL.RED && r.flashes.length === 1 && r.flashes[0].flare === true, `hurl: one red tell, one flash, the red flare (tells ${r.tells.length}, flashes ${r.flashes.length}; phases ${r.phases.join(' > ')})`);
    assert(r.piece === tree && r.taken?.id === tree.id && r.states.has(HELD) && r.states.has(FLYING) && tree.state === GONE && r.rooted >= 5 && r.held > r.rooted + 10, `hurl: the nearest tree is taken, holds against the tug (${r.rooted} frames rooted), is torn out and held (${r.held} frames in all), flies and comes apart (state ${tree.state}; states ${[...r.states].join(',')}, taken ${r.taken?.id === tree.id})`);
    const fl = r.flashes[0];
    assert(fl && Math.hypot(fl.x - r.lx, fl.z - r.lz) > 1 && fl.y > 0.5, `hurl: the flare is on the flying piece (${fl?.x.toFixed(1)}, ${fl?.y.toFixed(1)}, ${fl?.z.toFixed(1)}), not on the ground where it lands`);
    assert(r.land && near(r.land.x, r.lx, 0.05) && near(r.land.z, r.lz, 0.05) && Math.hypot(r.lx - p.position.x, r.lz - 18) < 3.5, `hurl: it lands where the throw was aimed (${r.land?.x.toFixed(1)}, ${r.land?.z.toFixed(1)}), on the hero's ground`);
    const skid = r.crash && r.land ? Math.hypot(r.crash.x - r.land.x, r.crash.z - r.land.z) : NaN;
    assert(near(skid, X.hurl.skid, 0.3), `hurl: it skids on ${skid.toFixed(2)} m past the blow along its flight and comes apart there (skid ${X.hurl.skid})`);
    assert(unmarked(G, r), `hurl: NOTHING is drawn on the ground before it lands (heat drawn ${r.marks} times; no scorch stamped before the blow)`);
    assert(r.hit?.r === RESULT.HIT && r.hit.tell === TELL.RED && near(r.hit.damage, X.hurl.damage * TUNING.damageScale, 1e-6) && near(hp0 - p.hp, r.hit.damage, 1e-6), `hurl: the hero under it takes one red blow of ${r.hit?.damage?.toFixed(1)} (${X.hurl.damage} x ${TUNING.damageScale})`);
    assert(timingOk(r), `hurl: the blow lands ${r.lead.toFixed(3)} s after its flash (lead ${lead} +- 0.085)`);
    out(`   hurl, phase 1: ${r.t2b.toFixed(2)} s from the tell to the blow (phases ${r.phases.join(' > ')})`);
    assert(r.t2b >= BAND.hurl[0] && r.t2b <= BAND.hurl[1], `hurl: ${r.t2b.toFixed(2)} s from the tell to the blow, phase 1 (band ${BAND.hurl.join(' - ')}; was 2.85)`);
    assert(r.spells === 1, 'hurl: dragon:spell { name: hurl } once, at the throw');
    // ---- later phases: quicker
    const t2b = { 1: r.t2b };
    for (const ph of [2, 3]) {
      stage(G, 2, 0, Math.PI / 2, 2, 18);
      d.phase = ph;
      const rp = follow(G, 'hurl');
      t2b[ph] = rp.t2b;
      d.phase = 1;
    }
    out(`   hurl, tell to blow by phase: ${[1, 2, 3].map((k) => `P${k} ${t2b[k].toFixed(2)} s`).join(', ')}`);
    assert(t2b[2] < t2b[1] && t2b[3] < t2b[2], `hurl: quicker in later phases (${[1, 2, 3].map((k) => t2b[k].toFixed(2)).join(' > ')} s)`);
    // ---- out of the blast once it is thrown: no blow
    stage(G, 2, 0, Math.PI / 2, 2, 18);
    let moved = false;
    const r2 = follow(G, 'hurl', (rec, a) => {
      if (!moved && a?.thrown) { moved = true; p.debug.teleport(a.lx + X.hurl.radius + 0.45 + 0.4, a.lz); }
    });
    assert(moved && r2.land && !r2.hit && r2.flashes.length === 1, `hurl: ${(X.hurl.radius + 0.85).toFixed(2)} m from where it lands (radius ${X.hurl.radius} + the hero 0.45): no blow`);
    // ---- a roll at the flare dodges it: pressed on the flash itself, and as late as 0.25 s after it;
    // never a plunge (a thrown piece is no body)
    const pd0 = G.counts['player:plunge'] || 0;
    const rolls = [];
    for (const after of [0, 0.25]) {
      stage(G, 2, 0, Math.PI / 2, 2, 18);
      const r3 = follow(G, 'hurl', rollAt(G, after));
      rolls.push(`${r3.rolled?.toFixed(2)} s: ${r3.hit?.r}`);
      assert(Number.isFinite(r3.rolled) && (r3.hit?.r === RESULT.DODGED || r3.hit?.r === RESULT.PERFECT || (!r3.hit && r3.land)), `hurl: a roll ${after} s after the flare dodges it (${r3.hit?.r ?? 'rolled out of it'})`);
    }
    assert((G.counts['player:plunge'] || 0) === pd0, `hurl: a dodged throw never plunges (${rolls.join('; ')})`);
    // ---- a held guard does not stop it
    stage(G, 2, 0, Math.PI / 2, 2, 18);
    G.input.press(1);
    const r4 = follow(G, 'hurl');
    G.input.up(1);
    assert(r4.hit?.r === RESULT.HIT, `hurl: red, so a held guard fails (${r4.hit?.r})`);
    // ---- a piece in its path is smashed and it flies on (a dead tree stood on the line as it is thrown)
    stage(G, 2, 0, Math.PI / 2, 2, 18);
    const post = D.list.find((b) => b.kind === 'deadTree' && Math.hypot(b.x + 14, b.z - 6) < 0.1);
    let planted = false;
    const r7 = follow(G, 'hurl', (rec, a) => {
      if (!planted && a?.thrown) {
        planted = true;
        const s = d.terrain._last;
        post.x = s.x0 + (s.tx - s.x0) * 0.6;
        post.z = s.z0 + (s.tz - s.z0) * 0.6;
      }
    });
    assert(planted && r7.smashed >= 1 && post.state !== INTACT && r7.hit?.r === RESULT.HIT && timingOk(r7), `hurl: a tree standing in its path is smashed (${r7.smashed}; the tree ${post.state === INTACT ? 'stands' : 'is down'}) and the throw flies on to its blow`);
    // ---- cut short with the piece in the jaws: it falls where it is, no blow, no late flash
    stage(G, 2, 0, Math.PI / 2, 2, 18);
    let cut = false;
    const r5 = follow(G, 'hurl', (rec, a) => {
      if (!cut && a?.phase === 'aim' && a.k > 0.4) { cut = true; d.debug.stagger(); }
    });
    assert(cut && r5.states.has(HELD) && tree.state === GONE && !r5.hit && r5.flashes.length === 0 && !d.terrain.hold.piece, 'hurl: staggered while it holds the tree: the tree falls and comes apart, no blow, no flash');
    // ---- the fight's reset: every piece stands again, nothing held or tracked
    stage(G, 2, 0, Math.PI / 2, 2, 18);
    game.lab.trigger('hurl');
    run(G, 6, { passive: true }, () => !!d.terrain.hold.piece);
    assert(d.terrain.hold.piece === tree && tree.state === HELD, 'reset: (the tree is in the jaws)');
    game.flow.debug.toState('explore');
    run(G, 1.0, { passive: true });
    assert(D.standing === D.list.length && !d.terrain.hold.piece && !d.terrain.shots.some((s) => s.on) && D.list.every((b) => b.state === INTACT && b.pivot.position.lengthSq() === 0), `reset: every piece stands again where it stood (${D.standing} of ${D.list.length}), nothing in the jaws or in the air`);
    assert(game.flow.debug.toState('boss') === true, 'reset: (back to the fight)');
    run(G, 0.5, { passive: true });
    d.debug.setAI(false);
    // ---- a boulder is thrown too (the nearest piece, whatever it is)
    stage(G, 9, 0, 0, 9, 26);
    const r6 = follow(G, 'hurl');
    assert(r6.piece?.kind === 'boulder' && r6.hit?.r === RESULT.HIT && timingOk(r6) && unmarked(G, r6), `hurl: with a boulder nearest, the boulder is thrown (${r6.piece?.kind}; blow ${r6.lead.toFixed(3)} s after its flash, ${r6.t2b.toFixed(2)} s after its tell, nothing on the ground)`);
    // ---- every piece gone or out of reach: not picked
    for (const b of D.list) D.strike(b.x, b.z, 0.5, 99, { src: D.swing() });
    run(G, 3, { passive: true });
    stage(G, 2, 0, Math.PI / 2, 2, 18);
    for (const b of D.list) D.strike(b.x, b.z, 0.5, 99, { src: D.swing() });
    run(G, 3, { passive: true });
    d.phase = 2;
    const w0 = ['hurl', 'tailBat', 'fireBrand'].map((n) => attackWeight(ATTACKS[n], n, d, d.sense));
    d.phase = 1;
    assert(D.standing === 0 && w0.every((w) => w === 0), `every piece broken: the three moves weigh 0 (${w0})`);
  }

  // ================================================================ tail bat
  {
    const G = field();
    const { game } = G;
    const d = game.dragon, p = game.player, D = game.world.destructibles;
    const rock = D.list.find((b) => b.kind === 'boulder' && Math.hypot(b.x + 10, b.z + 4) < 0.1);
    const tree = D.list.find((b) => b.kind === 'deadTree' && Math.hypot(b.x + 14, b.z - 6) < 0.1);
    const B = X.tailBat;
    // ---- the AI gate
    stage(G, 0, 0, 0, -8, 16);
    assert(attackWeight(ATTACKS.tailBat, 'tailBat', d, d.sense) > 0, 'tail bat: a boulder in the tail ring, its line to the hero clear of the body: the AI may pick it');
    p.debug.teleport(-6, -9);
    G.tick(DT);
    assert(attackWeight(ATTACKS.tailBat, 'tailBat', d, d.sense) === 0, 'tail bat: not with the hero beside the boulder, in the way of the lash');
    // ---- the hero stands still: batted, it bursts off the ground and skims to him, one blue blow
    stage(G, 0, 0, 0, -8, 16);
    const hp0 = p.hp;
    const r = follow(G, 'tailBat');
    assert(r.trigger && r.tells.length === 1 && r.tells[0].tell === TELL.BLUE && r.flashes.length === 1 && r.flashes[0].flare === true, `tail bat: one blue tell, one flash, the BLUE flare (a parry moment) (tells ${r.tells.length}, flashes ${r.flashes.length}; phases ${r.phases.join(' > ')})`);
    assert(r.piece === rock && r.taken?.id === rock.id && r.states.has(HELD) && rock.state === GONE, `tail bat: the boulder is batted and comes apart (state ${rock.state})`);
    assert(r.hit?.r === RESULT.HIT && r.hit.tell === TELL.BLUE && near(r.hit.damage, B.damage * TUNING.damageScale, 1e-6) && near(hp0 - p.hp, r.hit.damage, 1e-6), `tail bat: the hero on its line takes one blue blow of ${r.hit?.damage?.toFixed(1)}`);
    assert(timingOk(r), `tail bat: the blow lands ${r.lead.toFixed(3)} s after its flash (lead ${lead} +- 0.085)`);
    assert(unmarked(G, r), `tail bat: its line is NOT drawn (heat drawn ${r.marks} times, no scorch before the blow)`);
    const tb = { 1: r.t2b };
    for (const ph of [2, 3]) {
      stage(G, 0, 0, 0, -8, 16);
      d.phase = ph;
      tb[ph] = follow(G, 'tailBat').t2b;
      d.phase = 1;
    }
    out(`   tail bat, tell to blow by phase: ${[1, 2, 3].map((k) => `P${k} ${tb[k].toFixed(2)} s`).join(', ')}`);
    assert(r.t2b >= BAND.tailBat[0] && r.t2b <= BAND.tailBat[1] && tb[3] <= tb[1], `tail bat: ${r.t2b.toFixed(2)} s from the tell to the blow (band ${BAND.tailBat.join(' - ')}; was 1.83), quicker later (${tb[3].toFixed(2)})`);
    assert(r.crash && Math.hypot(r.crash.x + 8, r.crash.z - 16) < 3.5, 'tail bat: it breaks on him');
    // ---- parried: cut out of the air (blue posture), no damage; a parry moment
    stage(G, 0, 0, 0, -8, 16);
    const po0 = d.posture, hp1 = p.hp;
    let pressed = false;
    const r2 = follow(G, 'tailBat', (rec) => {
      if (!pressed && rec.flashes.length && rec.flashes[0].t + lead - game.time - DT <= 0.12) { pressed = true; G.input.click(1); }
    });
    assert(pressed && r2.hit?.r === RESULT.PARRIED && p.hp === hp1 && d.posture - po0 >= POSTURE.parry.blue - 1e-6, `tail bat: a parry on the flash cuts it apart (${r2.hit?.r}; posture +${(d.posture - po0).toFixed(0)}, no damage)`);
    // ---- on a held guard: no damage, it costs guard
    stage(G, 0, 0, 0, -8, 16);
    const hp2 = p.hp;
    G.input.press(1);
    const r3 = follow(G, 'tailBat');
    G.input.up(1);
    assert(r3.hit?.r === RESULT.BLOCKED && p.hp === hp2, `tail bat: a held guard takes it (${r3.hit?.r}, no damage)`);
    // ---- off its line once the lash is committed: no blow, it flies past and comes apart
    stage(G, 0, 0, 0, -8, 16);
    let stepped = false;
    const r4 = follow(G, 'tailBat', (rec, a) => {
      if (!stepped && a?.phase === 'active') { stepped = true; p.debug.teleport(p.position.x + a.uz * (B.width + 0.45 + 0.5), p.position.z - a.ux * (B.width + 0.45 + 0.5)); }
    });
    assert(stepped && !r4.hit && rock.state === GONE && r4.crash && Math.hypot(r4.crash.x + 8, r4.crash.z - 16) > 4, `tail bat: ${(B.width + 0.95).toFixed(2)} m off its line: no blow; it comes apart past him`);
    // ---- cover: a tree on the line stops it and pays for it
    stage(G, 0, 0, 0, -18, 16);
    const thp = tree.hp;
    const r5 = follow(G, 'tailBat');
    assert(r5.piece === rock && !r5.hit && rock.state === GONE && (tree.hp < thp || tree.state !== INTACT), `tail bat: a tree between the boulder and the hero stops it (the tree ${tree.state === INTACT ? 'holds, chipped ' + (thp - tree.hp).toFixed(2) : 'goes down'}; the hero is not hit)`);
    assert(r5.crash && Math.hypot(r5.crash.x - tree.x, r5.crash.z - tree.z) < 2.5, 'tail bat: it comes apart against the cover');
  }

  // ================================================================ firebrand
  {
    const G = field();
    const { game } = G;
    const d = game.dragon, p = game.player, D = game.world.destructibles;
    const F = X.fireBrand;
    // ---- phase 2 on; wood only
    stage(G, 9, 3, 0, 9, -14);
    const w1 = attackWeight(ATTACKS.fireBrand, 'fireBrand', d, d.sense);
    d.phase = 2;
    const w2 = attackWeight(ATTACKS.fireBrand, 'fireBrand', d, d.sense);
    assert(w1 === 0 && w2 > 0, `firebrand: not in phase 1 (${w1}), from phase 2 on (${w2})`);
    const hp0 = p.hp;
    const fireField = d.fx.fire, spawn0 = fireField?.spawn;
    let heat = 0;
    if (spawn0) fireField.spawn = (b) => { if (d.brain.action?.name === 'fireBrand' || d.terrain.shots.some((s) => s.on && s.burning)) heat++; return spawn0.call(fireField, b); };
    const r = follow(G, 'fireBrand', null, 12);
    if (spawn0) fireField.spawn = spawn0;
    assert(r.piece?.mat === 'wood' && r.piece.kind === 'deadTree', `firebrand: a boulder is nearer, a tree is taken (${r.piece?.kind})`);
    assert(r.tells.length === 1 && r.tells[0].tell === TELL.RED && r.flashes.length === 1 && r.phases.includes('kindle') && timingOk(r) && unmarked(G, r), `firebrand: one red tell, one flash, the blow ${r.lead.toFixed(3)} s after it, nothing on the ground before (phases ${r.phases.join(' > ')})`);
    out(`   firebrand, phase 2: ${r.t2b.toFixed(2)} s from the tell to the blow; ${heat} blobs of heat in the fire field (the burning tree in the jaws and in the air)`);
    assert(r.t2b >= BAND.fireBrand[0] && r.t2b <= BAND.fireBrand[1], `firebrand: ${r.t2b.toFixed(2)} s from the tell to the blow in phase 2 (band ${BAND.fireBrand.join(' - ')}; was 3.4)`);
    assert(heat > 40, `firebrand: the burning tree is heat in the fire field (${heat} blobs), not glyph sprites (ADR-113)`);
    assert(r.hit?.r === RESULT.HIT && near(r.hit.damage, F.damage * TUNING.damageScale, 1e-6) && r.hit.kind === 'fire' && near(hp0 - p.hp, r.hit.damage, 4), `firebrand: one red blow of ${r.hit?.damage?.toFixed(1)}, a burn`);
    assert(r.explosions === 1 && G.ignites.some((i) => Math.hypot(i.x - r.lx, i.z - r.lz) < 0.1 && near(i.r, F.radius * F.ignite[1], 1e-6)), 'firebrand: it bursts (dragon:explosion) and lights the grass and wood round it (world.ignite)');
    assert(d.terrain.pyres.some((q) => q.on && near(q.x, r.lx, 0.05) && near(q.z, r.lz, 0.05)), 'firebrand: its wreck burns on where it landed');
    // ---- out of the blast: no blow. Then into the wreck: contact ticks while he stands in it, until it is out
    stage(G, 9, 3, 0, 9, -14);
    d.phase = 2;
    let away = false;
    const r2 = follow(G, 'fireBrand', (rec, a) => {
      if (!away && a?.thrown) { away = true; p.debug.teleport(a.lx + F.radius + 1.2, a.lz); }
    }, 12);
    assert(away && !r2.hit && r2.fire.length === 0 && d.terrain.pyres.some((q) => q.on), 'firebrand: out of the blast and the wreck: no blow, no burn (the wreck burns on its own)');
    const n0 = G.hits.length;
    p.debug.teleport(r2.lx, r2.lz);
    run(G, F.pyre.time + 0.5, { passive: true });
    const ticks = G.hits.slice(n0).filter((h) => h.attack === 'fireBrand');
    assert(ticks.length >= 5 && ticks.every((h) => h.kind === 'fire' && h.tell === TELL.NORMAL && near(h.damage, F.pyre.tickDamage * TUNING.damageScale, 1e-6)), `firebrand: standing in the wreck burns (${ticks.length} ticks of ${F.pyre.tickDamage} x ${TUNING.damageScale}, a contact stream: blockable)`);
    const n1 = G.hits.length;
    run(G, 1.5, { passive: true });
    assert(!d.terrain.pyres.some((q) => q.on) && G.hits.length === n1, `firebrand: the wreck burns ${F.pyre.time} s, then it is out`);
    // ---- a new phase puts it out (as the fire hazards)
    stage(G, 9, 3, 0, 9, -14);
    d.phase = 2;
    follow(G, 'fireBrand', (rec, a) => { if (a?.thrown && Number.isFinite(a.lx)) p.debug.teleport(a.lx + F.radius + 1.2, a.lz); }, 12);
    const lit = d.terrain.pyres.some((q) => q.on);
    d.phase = 3;
    run(G, 0.2, { passive: true });
    assert(lit && !d.terrain.pyres.some((q) => q.on), 'firebrand: a new phase puts the wreck out (as the fire hazards)');
    d.phase = 1;
  }

  // ================================================================ Training runs them; a fight uses them
  {
    const G = build({ terrain: 'lab' });
    const { game } = G;
    fightSetup(G);
    const Tn = game.lab.training, d = game.dragon;
    const bad = [];
    for (const n of ['hurl', 'tailBat', 'fireBrand']) {
      game.world.restore();
      const t0 = G.counts['combat:tell'] || 0, f0 = G.counts['combat:flash'] || 0;
      Tn.moveAnswer = n === 'tailBat' ? 'parry' : 'dodge';
      Tn.run(`move-${n}`);
      let frames = 0;
      while (Tn.ph !== 'done' && frames < Math.round(30 / DT)) { G.tick(DT); frames++; }
      const ok = Tn.ph === 'done' && Tn.lastResult?.ok && (G.counts['combat:tell'] || 0) === t0 + 1 && (G.counts['combat:flash'] || 0) === f0 + 1;
      if (!ok) bad.push(`${n} (${Tn.ph}, tells ${(G.counts['combat:tell'] || 0) - t0}, flashes ${(G.counts['combat:flash'] || 0) - f0})`);
    }
    Tn.stop();
    assert(!bad.length, `Training BOSS MOVES: each of the three plays out with its tell and its flash${bad.length ? ' (not: ' + bad.join('; ') + ')' : ''}`);
    // ---- a fight with the AI on: the terrain moves come up, and do not crowd the others out
    game.world.restore();
    game.flow.debug.toState('boss');
    run(G, 0.5, { passive: true });
    d.debug.setAI(true);
    game.player.debug.god = true;
    G.defend = makeDefender(G);
    const picks = {};
    let tells = 0, flashes = 0;
    G.watch = (n, dd) => {
      if (n === 'dragon:windup') picks[dd.name] = (picks[dd.name] || 0) + 1;
      if ((n === 'combat:tell' || n === 'combat:flash') && ['hurl', 'tailBat', 'fireBrand'].includes(dd?.attack)) n === 'combat:tell' ? tells++ : flashes++;
    };
    const e0 = errors.length;
    let restored = 0;
    const dbg = {};
    // (300 s: about 50 attacks. At 150 s there were about 25, and a count of 2 of them was a matter
    // of the seed: 0 to 4 over four seeds, on this code and on the code before it)
    for (let i = 0; i < Math.round(300 / DT); i++) {
      bot(G, { god: true, defend: true });
      if (process.env.ABYSS_TRACE2 && !d.brain.action && d.state === 'combat') { for (const n of ['hurl', 'tailBat', 'fireBrand']) { const w = attackWeight(ATTACKS[n], n, d, d.sense); dbg[n] = (dbg[n] || 0) + (w > 0 ? 1 : 0); dbg[n + 'cd'] = (dbg[n + 'cd'] || 0) + ((d.brain.cooldowns[n] ?? 0) > 0 ? 1 : 0); } dbg.idle = (dbg.idle || 0) + 1; dbg.dist = (dbg.dist || 0) + d.sense.dist; }
      G.tick(DT);
      // 50 s in each phase: the gates are reached by hand, and the wyrm is kept alive between them
      if (i === 3000) d.debug.setHp(0.6);
      if (i === 6000) d.debug.setHp(0.3);
      const floor = d.maxHp * (i < 3000 ? 0.7 : i < 6000 ? 0.4 : 0.1);
      if (d.hp < floor) d.hp = floor;
      if (i % 1800 === 1799) { game.world.restore(); restored++; }
      if (d.state === 'dead') break;
    }
    G.watch = null;
    G.defend = null;
    if (process.env.ABYSS_TRACE2) out('   ' + JSON.stringify(dbg) + ' ' + JSON.stringify(picks));
    const total = Object.values(picks).reduce((a, b) => a + b, 0);
    const mine = (picks.hurl || 0) + (picks.tailBat || 0) + (picks.fireBrand || 0);
    out(`   300 s with the AI on: ${total} attacks, terrain moves ${mine} (hurl ${picks.hurl || 0}, tail bat ${picks.tailBat || 0}, firebrand ${picks.fireBrand || 0}); phase ${d.phase}; tells ${tells}, flashes ${flashes}`);
    assert(mine >= 2 && mine <= total * 0.3, `a fight: the terrain moves come up (${mine} of ${total} attacks) and stay under 30 % of them`);
    assert(flashes <= tells && tells - flashes <= 2 && errors.length === e0, `a fight: their tells get their flashes (${flashes} of ${tells}; an interrupted one has none), no errors`);
    return G;
  }
}

async function scenarioMusic() {
  out('\n== scenario MUSIC (recorded CC0 tracks per level and boss phase over the synth score; ADR-117) ==');
  const { SCORE, allTrackFiles } = await imp('src/audio/trackList.js');
  const { TrackLoop } = await imp('src/audio/tracks.js');
  const files = allTrackFiles();
  const missing = files.filter((f) => !fs.existsSync(`${ROOT}/assets/audio/${f}`));
  assert(!missing.length, `every listed track exists (${files.length} files; missing ${JSON.stringify(missing.slice(0, 5))})`);
  const onDisk = fs.existsSync(`${ROOT}/assets/audio/music`) ? fs.readdirSync(`${ROOT}/assets/audio/music`).map((f) => `music/${f}`) : [];
  const unused = onDisk.filter((f) => !files.includes(f));
  assert(!unused.length, `no track ships that the game never plays ${JSON.stringify(unused)}`);
  assert(['cinderwood', 'ash', 'starless'].every((id) => SCORE.levels[id] && Array.isArray(SCORE.levels[id].phases)), 'a score entry for each level');

  const G = build();
  const { game, input } = G;
  input.tap('Space');
  G.tick(DT);
  const A = game.audio, T = A.tracks, ctx = AUDIO.ctx;
  assert(T && !T.bytes.size, 'the track bank is built with the graph; nothing is fetched outside a browser (synth score)');
  const e0 = errors.length;
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const step = async (n) => {
    for (let i = 0; i < n; i++) {
      ctx.currentTime += DT;
      A.update(DT);
      if (i === 1) await flush();
    }
  };
  // a fake level score: an exploring track and three phase tracks (10 s each), loaded at once
  const fake = (len, ch = 2) => ctx.createBuffer(ch, len, 48000);
  const track = { buf: fake(48000 * 10), off: 0, end: 10 };
  const spec = (name, o = {}) => ({ file: `music/${name}.mp3`, gain: 1, loop: true, loopFrom: 0, xfade: 1, ...o });
  const L = { explore: spec('explore'), phases: [spec('p1', { loopFrom: 2 }), spec('p2'), spec('p3')] };
  T.decodeTrack = () => Promise.resolve(track);
  T.track = function (mode, phase) {
    if (mode === 'ambient') return L.explore;
    if (mode === 'boss' || mode === 'boss2') return L.phases[Math.min(L.phases.length, Math.max(1, phase)) - 1];
    return null;
  };
  const d = game.dragon;
  const ph0 = d.phase;
  const playing = () => (A.music?.kind === 'track' ? A.music.spec.file.replace(/^music\/|\.mp3$/g, '') : A.music?.kind || 'none');
  A.setMusic('none');
  A.setMusic('ambient');
  await step(10);
  assert(playing() === 'explore' && A.music.started, `exploring: the level's track (${playing()})`);
  d.phase = 1;
  A.setMusic('boss');
  await step(10);
  const M = A.music;
  assert(playing() === 'p1', `boss phase 1: its track (${playing()})`);
  let segs = 0, badFrom = 0;
  const seg0 = M._segment.bind(M);
  M._segment = (at, from, xf) => {
    segs++;
    if (from !== 0 && from !== 2) badFrom++;
    return seg0(at, from, xf);
  };
  await step(25 * 60);
  assert(segs >= 2 && segs <= 4 && M.segs.length <= 2 && !badFrom, `a phase track loops from its loop point (${segs} more passes in 25 s, ${M.segs.length} live)`);
  for (const [n, want] of [[2, 'p2'], [3, 'p3'], [4, 'p3']]) {
    d.phase = n;
    A.setMusic('boss2');
    await step(10);
    assert(playing() === want, `boss phase ${n}: ${want} (${playing()})`);
  }
  const before = A.music;
  A.setMusic('boss2');
  await step(5);
  assert(A.music === before, 'the same phase again: the track plays on (no restart)');
  // the wyrm announces a phase (dragon:phase2) before it sets its own number: the music follows the
  // announcement, and a phase number that moves without a music call is followed on the next frame
  d.phase = 1;
  A.setMusic('none');
  A.setMusic('boss');
  await step(5);
  game.events.emit('dragon:phase2');
  A.setMusic('boss2');
  await step(5);
  assert(playing() === 'p2', `phase 2 announced while the boss still reads phase 1: p2 (${playing()})`);
  d.phase = 3;
  await step(5);
  assert(playing() === 'p3', `a phase number that moves without a music call is followed (${playing()})`);
  A.setMusic('ambient');
  d.phase = 1;
  A.setMusic('boss');
  await step(5);
  assert(playing() === 'p1', `a new fight starts again at phase 1 (${playing()})`);
  d.phase = ph0;
  // a track that cannot load hands over to the synth score; a mode without a track plays the synth
  T.decodeTrack = () => Promise.reject(new Error('offline'));
  A.setMusic('ambient');
  await step(10);
  assert(A.music && A.music.kind === 'ambient', `a track that cannot load hands over to the synth score (now ${A.music?.kind})`);
  A.setMusic('victory');
  await step(10);
  assert(A.music && A.music.kind === 'victory', 'a mode with no track plays the synth score');
  // off (?music=synth / the Lab): the synth score
  T.decodeTrack = () => Promise.resolve(track);
  T.enabled = false;
  T.track = () => null;
  A.setMusic('ambient');
  await step(5);
  assert(A.music?.kind === 'ambient', 'with the tracks off the synth score plays');
  assert(errors.length === e0, `no errors through the music checks (${errors.length - e0})`);
  assert(A.music instanceof TrackLoop === false, 'the synth layer is not a track');
  return G;
}

const SCENARIOS = { timestep: scenarioTimestep, strategy: scenarioStrategy, gate: scenarioGate, hero: scenarioHero, batch: scenarioBatch, seen: scenarioSeen, breath: scenarioBreath, parry: scenarioParry, block: scenarioBlock, guard: scenarioGuard, asciihud: scenarioAsciiHud, reach: scenarioReach, red: scenarioRed, plunge: scenarioPlunge, flurry: scenarioFlurry, riposte: scenarioRiposte, flare: scenarioFlare, training: scenarioTraining, deflect: scenarioDeflect, lab: scenarioLab, bullets: scenarioBullets, strings: scenarioStrings, plungeReact: scenarioPlungeReact, timing: scenarioTiming, fire: scenarioFire, terrain: scenarioTerrain, win: scenarioWin, die: scenarioDie, touch: scenarioTouch, pad: scenarioPad, remap: scenarioRemap, herolook: scenarioHeroLook, herolife: scenarioHeroLife, herohand: scenarioHeroHand, heroweight: scenarioHeroWeight, heroarms: scenarioHeroArms, herostance: scenarioHeroStance, looks: scenarioLooks, music: scenarioMusic, flight: scenarioFlight, tongues: scenarioTongues, fxlooks: scenarioFxLooks, pressure: scenarioPressure, melee: scenarioMelee, probe: scenarioProbe };
const runs = [];
const OPT_IN = new Set(['probe', 'strategy']); // run only when named
// ABYSS_SKIP: scenarios left out of `all` because the caller runs them beside this process
const SKIP = new Set((process.env.ABYSS_SKIP || '').split(',').filter(Boolean));
for (const name of SKIP) if (!SCENARIOS[name]) { out(`ABYSS_SKIP: unknown scenario '${name}'`); process.exit(2); }
if (SCEN === 'all' && SKIP.size) out(`\n(not run here, ABYSS_SKIP: ${[...SKIP].join(', ')})`);
// a scenario, `all`, or a comma list of scenarios (run in the order of SCENARIOS, as `all` does)
const WANT = SCEN === 'all' ? [] : SCEN.split(',');
if (WANT.length > 1) for (const name of WANT) if (!SCENARIOS[name]) { out(`unknown scenario '${name}' in '${SCEN}'`); process.exit(2); }
for (const [name, fn] of Object.entries(SCENARIOS)) if (WANT.includes(name) || (SCEN === 'all' && !OPT_IN.has(name) && !SKIP.has(name))) runs.push(await fn());
if (!runs.length) { out(`unknown scenario '${SCEN}' (${Object.keys(SCENARIOS).join(' | ')} | all)`); process.exit(2); }

out('');
for (const G of runs) {
  let mx = 0, at = '';
  for (let i = 0; i < G.logTimes.length; i++) { let j = i; while (j < G.logTimes.length && G.logTimes[j][0] - G.logTimes[i][0] < 1) j++; if (j - i > mx) { mx = j - i; at = G.logTimes.slice(i, j).map((x) => x[1]).join(' / '); } }
  out('max HUD log lines in 1 s:', mx, '::', at.slice(0, 300));
}
// ---- contract: every emitted / subscribed event is in the catalogue; every catalogue event has a consumer
{
  const emitted = new Set(), subscribed = new Set();
  for (const G of runs) { Object.keys(G.counts).forEach((k) => emitted.add(k)); [...G.game.events.map.keys()].forEach((k) => { if (G.game.events.map.get(k).size) subscribed.add(k); }); }
  const notCat = [...emitted].filter((k) => !CATALOGUE.has(k));
  const subNotCat = [...subscribed].filter((k) => !CATALOGUE.has(k));
  const neverEmitted = [...CATALOGUE].filter((k) => !emitted.has(k));
  const noConsumer = [...CATALOGUE].filter((k) => !subscribed.has(k));
  out(`event catalogue (docs/ARCHITECTURE.md): ${CATALOGUE.size} names`);
  out('catalogue never emitted in these runs:', JSON.stringify(neverEmitted));
  assert(CATALOGUE.size >= 40, 'event catalogue parsed from ARCHITECTURE.md');
  assert(!notCat.length, `every emitted event is in the catalogue ${JSON.stringify(notCat)}`);
  assert(!subNotCat.length, `every subscribed event is in the catalogue ${JSON.stringify(subNotCat)}`);
  if (SCEN === 'all') assert(!noConsumer.length, `every catalogue event has a consumer ${JSON.stringify(noConsumer)}`);
  assert(!payloadErrors.size, `event payloads match the contract ${JSON.stringify([...payloadErrors].slice(0, 12))}`);
}
for (const G of runs) if (G.errorCounts.size) out('module update errors:', JSON.stringify([...G.errorCounts]));
const uniq = [...new Set(errors)];
out(`\nconsole errors/warnings: ${errors.length} (${uniq.length} unique)`);
for (const e of uniq.slice(0, 20)) out('  ', e.slice(0, 400));
out(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails || uniq.length ? 1 : 0);
