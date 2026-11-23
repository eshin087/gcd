// The Hall of Falling Script and Xin Yi, the One Who Woke, headless (ADR-156 - ADR-158): the REAL
// Player, WokenOne, Hud, GameFlow, AudioEngine and Lab (+ real LightPool, GlyphParticles, FireField,
// CameraRig, Events) wired like src/main.js for `?level=code`; the world is a light mock on the real
// Colliders, filled by the level's set (world/scriptHall.js), or the real set with its breakables and
// its scenes. A bot drives the input. The harness is fox.mjs's (its build, bots, helpers).
// usage: node woke.mjs <repoRoot> [scenario]   (env: ABYSS_SEED=n reseeds the AI)
//   scenario: levels | data | timing | scenes | cover | bend | stop | stance | flight | rising | dejavu |
//             reward | flow | looks | training | pace | win | all   (opt-in: smoke, strategy, cost)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ui, AUDIO, resetWindow } from './shim.mjs';

const ROOT = process.argv[2];
const SCEN = process.argv[3] || 'all';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const THREE = await import(pathToFileURL(`${ROOT}/node_modules/three/build/three.module.js`).href);
const { CONFIG } = await imp('src/core/config.js');
const { Events } = await imp('src/core/events.js');
const { CameraRig } = await imp('src/core/cameraRig.js');
const { createSharedUniforms } = await imp('src/render/shaderLib.js');
const { LightPool } = await imp('src/render/lights.js');
const { GlyphParticles } = await imp('src/render/particles.js');
const { FireField } = await imp('src/render/fireField.js');
const { Colliders } = await imp('src/world/colliders.js');
const { TELL, RESULT, POSTURE } = await imp('src/combat/rules.js');
const { LEVELS, getLevel, levelFromSearch, applyLevel } = await imp('src/levels/index.js');
const { createScriptHall, HALL, SLOTS, SCENES } = await imp('src/world/scriptHall.js');
const { Destructibles } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
const { WokenOne } = await imp('src/entities/enemies/wokenOne/wokenOne.js');
const { MOVES, MOVE_NAMES, CLIP, TRANSITIONS, realise, DEJAVU_MOVES } = await imp('src/entities/enemies/wokenOne/moves.js');
const { TUNING } = await imp('src/entities/enemies/wokenOne/tuning.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

// (the tuning pass: ABYSS_TUNE='{"hp":3000,"posture":{"max":[1,2,3]}}' deep-merges into TUNING before
// anything is built: a setting tried without editing tuning.js; arrays are replaced whole)
if (process.env.ABYSS_TUNE) {
  const merge = (o, v) => { for (const [k, x] of Object.entries(v)) { if (x && typeof x === 'object' && !Array.isArray(x) && o[k] && typeof o[k] === 'object') merge(o[k], x); else o[k] = x; } };
  merge(TUNING, JSON.parse(process.env.ABYSS_TUNE));
}
const LVL = getLevel('code');
const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(process.env.ABYSS_SEED ?? 4242);
const DT = 1 / 60;
const PHASES = TUNING.phaseAt.length;
const weightIn = (def, f) => (Array.isArray(def.weight) ? def.weight[f - 1] ?? 0 : def.weight ?? 0);
/** The phases a move is used in (its weight; a counter or a hidden move: every phase; a transition: its own). */
const phasesOf = (name) => {
  const def = MOVES[name];
  if (def.transition) return [def.phase];
  if (def.counter || def.hidden) return [1, 2, 3];
  return [1, 2, 3].filter((f) => weightIn(def, f) > 0);
};

// the event catalogue (docs/ARCHITECTURE.md → "Event catalogue"): what this level emits must be in it
const CATALOGUE = (() => {
  const md = fs.readFileSync(`${ROOT}/docs/ARCHITECTURE.md`, 'utf8');
  const sec = md.split(/^## /m).find((s) => s.startsWith('Event catalogue')) ?? '';
  const names = new Set();
  for (const m of sec.matchAll(/`([a-zA-Z]+(?::[a-zA-Z0-9]+)?)[ `]/g)) names.add(m[1]);
  return names;
})();
const EMITTED = new Set();

applyLevel(LVL);
// the set's colliders, built once (the set is the world agent's: whatever it is, its circles)
const SET = (() => {
  const c = new Colliders();
  const set = createScriptHall(createSharedUniforms(), c);
  return { set, circles: c.circles.map((k) => ({ ...k })) };
})();

/** `real`: the set built anew with its breakables (world.destructibles, the scars, the ambience); without
 *  it the world is a mock on the set's colliders. */
function build(seed = SEED, real = false) {
  resetWindow();
  Math.random = mulberry32(seed);
  ui.children.forEach((c) => (c.parentNode = null));
  ui.children.length = 0;
  const U = createSharedUniforms();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 16 / 9, CONFIG.camera.near, CONFIG.camera.far);
  const keys = new Set(), pk = new Set(), rk = new Set(), tapKeys = new Set();
  const btn = [false, false, false], pb = [false, false, false], rb = [false, false, false], tapBtn = [false, false, false];
  const input = {
    enabled: true, anyPressed: false, wheel: 0, mouse: { ndcX: 0, ndcY: 0 },
    keys, pressedKeys: pk, releasedKeys: rk, buttons: btn, pressedButtons: pb, releasedButtons: rb, axis: { x: 0, y: 0 },
    down(c) { return this.enabled && keys.has(c); }, pressed(c) { return this.enabled && pk.has(c); }, released(c) { return this.enabled && rk.has(c); },
    mouseDown(b) { return this.enabled && btn[b]; }, mousePressed(b) { return this.enabled && pb[b]; }, mouseReleased(b) { return this.enabled && rb[b]; },
    moveAxis() { return this.enabled ? this.axis : { x: 0, y: 0 }; },
    tap(code) { if (keys.has(code)) return; keys.add(code); pk.add(code); tapKeys.add(code); this.anyPressed = true; },
    hold(code) { if (keys.has(code)) return; keys.add(code); pk.add(code); this.anyPressed = true; },
    release(code) { if (!keys.delete(code)) return; rk.add(code); },
    press(b) { if (btn[b]) return; btn[b] = true; pb[b] = true; this.anyPressed = true; },
    click(b = 0) { if (btn[b]) return; btn[b] = true; pb[b] = true; tapBtn[b] = true; this.anyPressed = true; },
    up(b) { if (!btn[b]) return; btn[b] = false; rb[b] = true; },
    endFrame() {
      pk.clear(); rk.clear(); pb.fill(false); rb.fill(false);
      for (const c of tapKeys) { keys.delete(c); rk.add(c); }
      tapKeys.clear();
      for (let b = 0; b < 3; b++) if (tapBtn[b]) { tapBtn[b] = false; btn[b] = false; rb[b] = true; }
      this.anyPressed = false; this.wheel = 0;
    },
  };
  installActions(input, new Bindings(null));
  const colliders = new Colliders();
  const set = real ? createScriptHall(U, colliders) : null;
  if (!set) for (const k of SET.circles) colliders.add(k.x, k.z, k.r, k.tag);
  const counters = { spawns: 0, flares: 0, burns: 0 };
  const world = {
    colliders, bonfire: { ...CONFIG.world.bonfire }, nest: { x: 0, z: 0 },
    forest: { treeSpots: [], bonfire: { ...CONFIG.world.bonfire }, ambience: { update() {}, flare() { counters.flares++; } } },
    setGrassQuality() {}, resolve: (pos, r, b) => colliders.resolve(pos, r, b),
    setPusher(slot, x, y, z, r) { if (![x, y, z, r].every(Number.isFinite)) throw new Error(`NaN pusher ${slot}`); },
    clearPushers() {}, gust(x, z, s, r) { if (![x, z, s, r].every(Number.isFinite)) throw new Error('NaN gust'); },
    scorch: { burnCircle(x, z, r) { if (![x, z, r].every(Number.isFinite)) throw new Error('NaN scorch'); counters.burns++; }, reset() {}, heatAt: () => 0, burnAt: () => 0 },
    atmosphere: { bonfireLit: true, setBonfireLit(v) { this.bonfireLit = !!v; } }, update() {},
  };
  const mkParticles = (opts) => {
    const p = new GlyphParticles(U, opts);
    const spawn = p.spawn.bind(p);
    p.spawn = (o) => {
      for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size', 'rot', 'stretch']) if (o[k] !== undefined && !Number.isFinite(o[k])) throw new Error(`NaN particle ${k}`);
      counters.spawns++;
      return spawn(o);
    };
    return p;
  };
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
  const game = {
    THREE, CONFIG, level: LVL, levels: LEVELS.map((L) => ({ id: L.id, name: L.name })), pickLevel() {},
    renderer: null, scene, fxScene: new THREE.Scene(), camera, pipeline: { finalMat: { uniforms: { uHurt: { value: 0 }, uFade: { value: 0 }, uDesat: { value: 0 }, uWarm: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 1 } } } }, U,
    events: new Events(), input, cameraRig: new CameraRig(camera), lights: new LightPool(U),
    fx: { alpha: mkParticles({ max: 3000, additive: false }), add: mkParticles({ max: 7000, additive: true }), fire: mkFire() },
    time: 0, realTime: 0, timeScale: 1, debugTimeScale: 1, hitstopTimer: 0, hitstopScale: 1,
    mouseGround: new THREE.Vector3(), state: 'title', settings: { quality: CONFIG.defaultQuality, showFps: false },
    hitstop(seconds, scale = 0.04) { this.hitstopTimer = Math.max(this.hitstopTimer, seconds); this.hitstopScale = Math.min(this.hitstopScale, scale); },
    shake(a) { if (!Number.isFinite(a)) throw new Error('NaN shake'); this.cameraRig.addTrauma(a); },
    punch(m) { if (!Number.isFinite(m)) throw new Error('NaN punch'); this.cameraRig.punch(m); },
    kick(x, y, z, m) { if (!Number.isFinite(x + y + z + m)) throw new Error('NaN kick'); this.cameraRig.kick(x, y, z, m); },
  };
  const G = { game, input, counts: {}, counters, watch: null, hits: [], payload: new Set(), peakAdd: 0 };
  const emit = game.events.emit.bind(game.events);
  game.events.emit = (n, d) => {
    G.counts[n] = (G.counts[n] || 0) + 1;
    EMITTED.add(n);
    if (n.startsWith('combat:') || n.startsWith('dragon:')) for (const [k, v] of Object.entries(d ?? {})) if (typeof v === 'number' && !Number.isFinite(v)) G.payload.add(`${n}.${k}`);
    G.watch?.(n, d);
    G.defend?.onEvent(n, d);
    emit(n, d);
  };
  game.world = world;
  if (set) {
    world.forest = set;
    world.scars = new Scars(game, set.scarInk);
    world.destructibles = new Destructibles(game, world, set);
    world.impact = (x, z, r, power, o) => world.destructibles.strike(x, z, r, power, { kind: 'blunt', by: 'world', ...(o ?? {}) });
    // (world.js's: fire lands; the grass of this mock does not burn, the wood does)
    world.ignite = (x, z, r, k = 1) => world.destructibles.ignite(x, z, r, k);
    world.restore = () => { world.destructibles.reset(); world.scars.reset(); };
    world.update = (dt) => { world.destructibles.update(dt); world.scars.update?.(dt); set.ambience?.update?.(dt, game); };
    set.ambience?.setup?.(game);
  }
  game.audio = new AudioEngine(game);
  game.player = new Player(game);
  // (his rig is built on a stream of its own: three's uuids draw Math.random, and the body agent's gear
  // must not shift the AI's seeded stream: lord.mjs's note)
  const R0 = Math.random;
  Math.random = mulberry32(seed + 0x5eed);
  game.dragon = LVL.createBoss(game);
  Math.random = R0;
  game.boss = game.dragon;
  game.hud = new Hud(game);
  game.touch = new TouchControls(game);
  game.flow = new GameFlow(game);
  game.lab = new Lab(game);
  game.applyQuality = () => {};
  const takeHit = game.player.takeHit.bind(game.player);
  game.player.takeHit = (h) => {
    const r = takeHit(h);
    G.hits.push({ t: game.time, r, attack: h?.attack, tell: h?.tell, damage: h?.damage, kind: h?.kind, around: !!h?.around });
    return r;
  };
  game.cameraRig.snap(game.player.position);
  G.tick = (realDt) => {
    let scale = game.timeScale;
    if (game.hitstopTimer > 0) { game.hitstopTimer -= realDt; scale *= game.hitstopScale; if (game.hitstopTimer <= 0) game.hitstopScale = 1; }
    const dt = realDt * scale * (game.debugTimeScale ?? 1);
    game.realTime += realDt;
    game.time += dt;
    game.dt = dt;
    game.realDt = realDt;
    if (AUDIO.ctx) AUDIO.ctx.currentTime += realDt;
    game.touch.update(realDt);
    game.lab.update(realDt);
    game.flow.update(dt, realDt);
    game.player.update(dt);
    game.dragon.update(dt);
    game.world.update(dt);
    game.cameraRig.update(realDt, game.player.position);
    game.lights.update(dt, game.player.position);
    game.fx.alpha.update(dt, game.time);
    game.fx.add.update(dt, game.time);
    game.fx.fire.update(dt);
    G.peakAdd = Math.max(G.peakAdd, game.fx.add.count);
    game.hud.update(realDt);
    game.audio.update(realDt);
    game.input.endFrame();
    const p = game.player, d = game.dragon;
    if (![p.position.x, p.position.z, p.hp, p.yaw].every(Number.isFinite)) throw new Error('player NaN');
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture, d.cameraPull].every(Number.isFinite)) throw new Error('boss NaN');
    if (![d._tip.x, d._tip.y, d._tip.z, d._hilt.x].every(Number.isFinite)) throw new Error('boss blade NaN');
    for (const h of d.hurtSpheres) if (![h.x, h.y, h.z, h.r].every(Number.isFinite)) throw new Error('hurtSphere NaN');
  };
  return G;
}

const run = (G, seconds, step = null, until = null) => {
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
    step?.(G);
    G.tick(DT);
    if (until?.()) return true;
  }
  return false;
};

/** Title → the duel (the Lab's flow jump), in phase `form` (through its real transitions), the hero
 *  `dist` m in front of him, facing him. */
function duel(G, { dist = 4, ang = 0, ai = false, form = 1 } = {}) {
  const { game } = G;
  run(G, 0.2);
  game.flow.debug.toState('boss');
  const d = game.dragon;
  d.debug.setAI(ai);
  if (form > 1) d.debug.setPhase(form);
  d.position.set(0, 0, -2);
  d.yaw = 0;
  run(G, 0.4);
  place(G, dist, ang);
  run(G, 0.3);
}

function place(G, dist, ang = 0) {
  const { game } = G;
  const d = game.dragon, p = game.player;
  const a = d.yaw + ang;
  p.debug.teleport(d.position.x + Math.sin(a) * dist, d.position.z + Math.cos(a) * dist);
  p.yaw = Math.atan2(d.position.x - p.position.x, d.position.z - p.position.z);
  p.debug.heal();
  game.mouseGround.set(d.position.x, 0, d.position.z);
}

const settle = (G, max = 8) => run(G, max, null, () => G.game.dragon.mode === 'foot' && ['idle', 'run'].includes(G.game.player.state) && G.game.hitstopTimer <= 0);
const quiet = (d) => d.mode === 'foot' && !d.fx.shots.some((s) => s.alive) && !d.source.front.live;

// ---- the defender bot: answers his tells from the flash (parry normal / blue, roll through red)
function makeDefender(G, { skill = 1, early = 0.12, style = 'mixed', rng = null, world = false } = {}) {
  const pend = [];
  const stats = { flashes: 0, parryTry: 0, dodgeTry: 0, skipped: [] };
  return {
    stats,
    onEvent(n, d) {
      if (n === 'combat:flash' && (d?.source === 'dragon' || (world && d?.source === 'world'))) {
        stats.flashes++;
        if (skill < 1 && (rng ?? Math.random)() > skill) { stats.skipped?.push([G.game.time, d.attack]); return; }
        pend.push({ tell: d.tell, at: G.game.time + (d.source === 'world' ? 0.3 : TUNING.flashLead), x: d.x, z: d.z, hazard: !!d.hazard && !d.bullet, done: false });
      }
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.4) pend.splice(i, 1);
      for (const e of pend) {
        const left = e.at - t - DT;
        if (e.tell === TELL.RED || e.tell === TELL.BLACK || style === 'dodge') {
          if (left <= (style === 'parry' ? 0.3 : 0.1)) {
            e.done = true;
            const d = e.hazard ? { x: e.x, z: e.z } : g.dragon.position, p = g.player.position;
            const dx = p.x - d.x, dz = p.z - d.z, l = Math.hypot(dx, dz) || 1;
            input.axis = e.hazard ? { x: dx / l, y: -dz / l } : { x: dz / l, y: dx / l };
            input.tap('Space');
            stats.dodgeTry++;
          }
        } else if (left <= early) {
          e.done = true;
          input.up(1);
          input.click(1);
          stats.parryTry++;
        }
      }
      return pend.some((e) => !e.done && e.at - t < 0.7);
    },
    /** Is a cue it means to answer due within `s` seconds? */
    dueWithin(s) {
      const t = G.game.time;
      return pend.some((e) => !e.done && e.at - t < s);
    },
  };
}

/** Fence: keep close, answer every tell, cut in his openings, give the deathblow to a broken boss. */
function fencer(G) {
  const { game, input } = G;
  const p = game.player, d = game.dragon;
  input.axis = { x: 0, y: 0 };
  if (!p.alive || game.state !== 'boss') return;
  p.hp = p.maxHp; // god mode for the win run
  const tgt = new THREE.Vector3();
  d.lockPoint(tgt);
  game.mouseGround.set(tgt.x, 0, tgt.z);
  const dx = tgt.x - p.position.x, dz = tgt.z - p.position.z, dist = Math.hypot(dx, dz);
  if (p.state === 'lock') {
    if (((game.realTime * 60) | 0) % 5 === 0) input.click(0);
    return;
  }
  const busy = G.defend.act();
  if (dist > 2.6 && !busy) input.axis = { x: dx / dist, y: -dz / dist };
  const a = d.brain.act;
  const open = d.broken || (d.mode === 'react' && ['recoil', 'stagger', 'flinch', 'reeling', 'trampled'].includes(d.brain.react?.kind)) || (a && a.t > a.recoveryStart) || p.critTimer > 0;
  const tick = (game.realTime * 60) | 0;
  if (!busy && dist < 3.2 && (open ? tick % 20 === 0 : tick % 70 === 0)) input.click(0);
}

// ================================================================== scenario: smoke
async function scenarioSmoke() {
  out('\n== scenario SMOKE (he fights a defender for 60 s in each phase) ==');
  for (let ph = 1; ph <= 3; ph++) {
    const G = build(SEED, true);
    const { game } = G;
    const d = game.dragon;
    duel(G, { dist: 3, ai: true, form: ph });
    game.player.debug.god = true;
    G.defend = makeDefender(G);
    const moves = {};
    G.watch = (n, e) => { if (n === 'dragon:windup') moves[e.name] = (moves[e.name] || 0) + 1; };
    run(G, 60, () => { G.defend.act(); game.mouseGround.set(d.position.x, 0, d.position.z); });
    out(`   P${d.phase} (${game.world.forest.scenes.now}): ${JSON.stringify(moves)} · flashes ${G.defend.stats.flashes} · hits ${G.hits.length}`);
  }
}

// ================================================================== scenario: scenes (the set's helper)
async function scenarioScenes() {
  out('\n== scenario SCENES (the hall, the dojo, the Source on the same slots; the morph) ==');
  const { STATE } = await imp('src/world/destructibles.js');
  const { BLOW } = await imp('src/world/breakTuning.js');
  const G = build(SEED, true);
  const { game } = G;
  const W = game.world, D = W.destructibles, S = W.forest.scenes, U = game.U;
  run(G, 0.2);
  const of = (kind) => D.list.filter((b) => b.kind === kind);
  const standing = (kind) => of(kind).filter((b) => !b.absent && b.state === STATE.INTACT);
  const inWorld = (b) => b.colliders.every((c) => W.colliders.circles.includes(c));
  const nonFloor = () => D.list.filter((b) => !b.floor && !b.absent).length;
  assert(S.now === 'hall' && standing('pillar').length === 10 && of('post').every((b) => b.absent) && of('codePillar').every((b) => b.absent) && standing('watcher').length === 4,
    `at the start the Pillared Hall stands (10 pillars, 4 watchers; the posts and the code are out of the world); ${nonFloor()} pieces besides the floor stand (<= 200)`);
  // a slab broken under the dojo's front: whole again after it
  const slab = D.floor.find((b) => Math.hypot(b.x - 3, b.z - 3) < 1.5);
  D.strike(slab.x, slab.z, 0.6, 5, { kind: BLOW.BLUNT, by: 'boss', y: 0.1, src: D.swing() });
  const slabBroke = slab.state !== STATE.INTACT || slab.cracked;
  // the hero stands dead on a slot (a post prints there)
  const p = game.player, slot = { x: 7.5, z: 0 };
  p.debug.teleport(slot.x, slot.z);
  p.position.set(slot.x, 0, slot.z);
  let t = 0;
  const ok = S.to('dojo', { x: 0, z: -9 });
  while (S.morphing && t < 4) {
    G.tick(DT);
    t += DT;
  }
  const post = of('post').find((b) => Math.hypot(b.x - slot.x, b.z - slot.z) < 0.1);
  const pd = Math.hypot(p.position.x - slot.x, p.position.z - slot.z);
  assert(ok && S.now === 'dojo' && t <= 1.8 + 1e-6, `to('dojo') from (0, -9): the morph ends in ${t.toFixed(2)} s (<= 1.8)`);
  assert(of('pillar').every((b) => b.absent && b.state === STATE.GONE && !inWorld(b) && b.colliders.every((c) => !W.colliders.circles.includes(c))) && standing('post').length === 10 && of('post').every(inWorld),
    'after it every pillar is out of the world (its circles too), every post stands whole with its colliders');
  assert(pd >= post.colliders[0].r + p.radius - 0.02, `the hero standing where a post printed is pushed out of it (${pd.toFixed(2)} m from its centre)`);
  assert(!slabBroke || (slab.state === STATE.INTACT && !slab.cracked), `the slab broken under the front is whole again (${slabBroke ? 'it was broken' : 'it held'})`);
  // the old scene's pieces are nothing to the world now
  const bench = of('bench')[0];
  const n0 = D.strike(bench.x, bench.z, 0.4, 1, { kind: BLOW.BLUNT, by: 'boss', y: 0.6, src: D.swing() }); // (over the floor's slabs)
  const cov = D.coverAt(slot.x, slot.z - 3, slot.x, slot.z + 3, 0.1);
  const near = D.nearest(slot.x, slot.z, { maxDist: 4, kind: 'pillar' });
  const stopped = D.stop(-7.5, -8, -7.5, -2, 0.1, 0.25, { kind: BLOW.CUT, by: 'boss', y: 1.2, src: D.swing() });
  assert(n0 === 0 && !cov && !near && (!stopped || stopped.kind !== 'pillar'), `an absent pillar or bench: strike ${n0}, coverAt ${cov?.kind ?? 'none'}, nearest pillar ${near?.kind ?? 'none'}, stop ${stopped?.kind ?? 'none'} (a post is no cover)`);
  assert(standing('watcher').length === 4, `the dojo has the hall's 4 watchers (${standing('watcher').length})`);
  // a watcher struck bursts into green digits and stays gone until the next morph
  const w = standing('watcher')[0];
  const spawns0 = G.counters.spawns;
  D.strike(w.x, w.z, 0.5, 1, { kind: BLOW.CUT, by: 'player', y: 1.2, src: D.swing() });
  run(G, 0.3);
  assert(w.state !== STATE.INTACT && G.counters.spawns - spawns0 >= 10, `a watcher struck goes (${G.counters.spawns - spawns0} digits)`);
  // phase 2: back to the hall, whole: eight watchers now
  t = 0;
  S.to('hall', { x: 0, z: 0 });
  while (S.morphing && t < 4) {
    G.tick(DT);
    t += DT;
  }
  assert(standing('pillar').length === 10 && standing('watcher').length === 8 && w.state === STATE.INTACT && t <= 1.8 + 1e-6,
    `to('hall') again: 10 pillars whole, ${standing('watcher').length} watchers (8; the struck one stands again), in ${t.toFixed(2)} s`);
  assert(D.coverAt(slot.x, slot.z - 3, slot.x, slot.z + 3, 0.1)?.kind === 'pillar', 'a pillar is cover again');
  // the Source
  t = 0;
  S.to('source', { x: 0, z: 0 });
  while (S.morphing && t < 4) {
    G.tick(DT);
    t += DT;
  }
  assert(standing('codePillar').length === 10 && standing('watcher').length === 12 && of('wall').every((b) => b.absent) && U.uScript.value.x > 0.9,
    `to('source'): 10 columns of code, 12 watchers, no walls, the script wave at ${U.uScript.value.x.toFixed(2)}; ${nonFloor()} pieces besides the floor`);
  const rain = W.forest.ambience.rain;
  assert(rain.count > 0 && rain.count <= rain.budget && rain.budget <= 320, `the falling script: ${rain.count} digits (budget ${rain.budget})`);
  // a morph cut short by another: the first ends at once
  S.to('dojo', { x: 0, z: 0 });
  G.tick(DT);
  S.to('hall', { x: 0, z: 0 });
  t = 0;
  while (S.morphing && t < 4) {
    G.tick(DT);
    t += DT;
  }
  assert(standing('pillar').length === 10 && of('post').every((b) => b.absent) && of('codePillar').every((b) => b.absent), 'a morph cut short by another: only the last scene stands');
  // the reset: the home scene, its light and its script (world.js restore: the breakables, then the scenes)
  S.to('source', { x: 0, z: 0 });
  run(G, 0.4);
  W.restore();
  S.reset();
  run(G, 0.1);
  assert(S.now === 'hall' && !S.morphing && standing('pillar').length === 10 && of('codePillar').every((b) => b.absent) && standing('watcher').length === 4 && Math.abs(U.uScript.value.x - S.base.hall) < 1e-3 && U.uScript.value.w === 0,
    `world.restore + scenes.reset mid-morph: the hall with its 4 watchers, the script at rest (${U.uScript.value.x.toFixed(2)})`);
  // deja vu: the stutter shifts, then nothing
  S.stutter(0.12);
  G.tick(DT);
  const sh = U.uScriptF.value.z;
  run(G, 0.2);
  assert(sh !== 0 && U.uScriptF.value.z === 0, `the stutter shifts the letters (${sh}) and lets go`);
  // no other level ever sets the script wave
  const { Colliders } = await imp('src/world/colliders.js');
  const { createSharedUniforms: mk } = await imp('src/render/shaderLib.js');
  const others = LEVELS.filter((L) => L.id !== 'code');
  const set0 = [];
  const e0 = errors.length;
  for (const L of others) {
    const U2 = mk();
    const set = L.buildSet(U2, new Colliders());
    try {
      const g2 = { ...game, U: U2, world: { ...W, forest: set, destructibles: null } };
      set.ambience?.setup?.(g2);
      for (let i = 0; i < 5; i++) set.ambience?.update?.(DT, g2);
    } catch {
      // (another set's weather on this harness: what is read is the uniform)
    }
    if (U2.uScript.value.x !== 0 || U2.uScript.value.w !== 0 || U2.uScriptF.value.y !== 0 || U2.uScriptF.value.z !== 0) set0.push(L.id);
  }
  errors.length = e0; // (the other sets' weather on a harness built for this level may complain)
  assert(!set0.length, `uScript is 0 on every other level (${others.map((L) => L.id).join(', ')})${set0.length ? ': set on ' + set0.join(', ') : ''}`);
}

const S = {
  smoke: scenarioSmoke,
  scenes: scenarioScenes,
};
const OPT_IN = new Set(['smoke', 'cost', 'strategy']);
const list = SCEN === 'all' ? Object.keys(S).filter((k) => !OPT_IN.has(k)) : SCEN.split(',');
for (const k of list) {
  if (!S[k]) { out(`unknown scenario ${k}`); process.exit(2); }
  await S[k]();
}
const notCat = [...EMITTED].filter((n) => !CATALOGUE.has(n) && n !== 'state');
assert(!notCat.length, `every event this level emits is in the catalogue ${JSON.stringify(notCat)}`);
out(`\n\nconsole errors/warnings: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 12).join('\n  ') : ''}`);
if (errors.length) fails++;
out(fails ? `\nWOKE: ${fails} FAILED` : '\nWOKE: ALL PASSED');
process.exit(fails ? 1 : 0);
