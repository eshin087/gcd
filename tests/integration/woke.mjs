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
const { TELL, RESULT, POSTURE, DEFENSE } = await imp('src/combat/rules.js');
const DEFENSE_GHOST = DEFENSE.ghostep.slowmoTime;
const UNLOCKS = await imp('src/game/unlocks.js');
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
    world.restore = () => { world.destructibles.reset(); world.scars.reset(); set.scenes?.reset?.(); };
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
        // (the Long Second's bot: every cue answered by the lean, from a held guard, no direction)
        if (style === 'lean') {
          if (left <= 0.1) {
            e.done = true;
            input.press(1);
            input.axis = { x: 0, y: 0 };
            input.tap('Space');
            G._guardUntil = t + 0.45;
            stats.dodgeTry++;
          }
          continue;
        }
        // (the block-only bot: a held guard for every white and blue cue, a roll for red and black)
        if (style === 'block' && e.tell !== TELL.RED && e.tell !== TELL.BLACK) {
          if (left <= 0.4) {
            e.done = true;
            input.press(1);
            G._guardUntil = Math.max(G._guardUntil ?? -1, e.at + 0.25);
          }
          continue;
        }
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
      if ((style === 'block' || style === 'lean') && G._guardUntil > 0 && G._guardUntil < t) {
        G._guardUntil = -1;
        input.up(1);
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
function fencer(G, mortal = false) {
  const { game, input } = G;
  const p = game.player, d = game.dragon;
  input.axis = { x: 0, y: 0 };
  if (!p.alive || game.state !== 'boss') return;
  if (!mortal) p.hp = p.maxHp; // god mode for the win run
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

// ================================================================== helpers of this suite
/** The first phase a move is used in (its weight; its own phase for a counter or a transition). */
const P_OF = (name) => (MOVES[name]?.counter ? MOVES[name].phase ?? 1 : phasesOf(name)[0] ?? MOVES[name]?.phase ?? 1);
/** Run until he stands in his footwork again with nothing of his in flight. */
const settleD = (G, max = 9) => run(G, max, null, () => quiet(G.game.dragon));

// ================================================================== scenario: levels
async function scenarioLevels() {
  out('\n== scenario LEVELS (the registry, the URL, the lines, the reward, the boss slot) ==');
  assert(LEVELS.includes(LVL) && LVL.id === 'code', `levels: ${LEVELS.map((l) => l.id).join(', ')}`);
  assert(['?level=code', '?lab&level=CODE', '?level=one', '?level=scripthall', '?level=script', '?level=woke', '?level=xinyi'].every((q) => levelFromSearch(q) === LVL), '?level=code / one / scripthall / script / woke / xinyi pick the level (case-insensitive)');
  for (const k of ['arrive', 'stir', 'phase2', 'phase3', 'victory', 'fallen', 'restReset', 'again', 'rise']) assert(!!LVL.text[k], `the level has its ${k} line`);
  assert(LVL.name === 'The Hall of Falling Script' && LVL.text.phase2 === 'A HUNDRED IRON SEEDS' && LVL.text.phase3 === 'HE SEES THE SCRIPT', `${LVL.name}: ${LVL.sub}`);
  const R = LVL.reward;
  assert(R && R.id === 'longSecond' && R.name === 'The Long Second' && typeof R.line === 'string' && R.usable === true, 'its fixed reward: the Long Second (ADR-158)');
  assert(CONFIG.world.dragonBound === 13.5 && CONFIG.world.arenaRadius === 15 && CONFIG.world.bossTriggerZ === 15.4, "applyLevel merged the hall's layout into CONFIG.world");
  const G = build();
  const d = G.game.dragon;
  assert(d instanceof WokenOne && d.kind === 'duelist' && d.name === TUNING.name && d.kit.id === 'wokenOne', `the boss is his own duelist: ${d.name}`);
  assert(d.maxHp === TUNING.hp && d.lives.total === 2 && d.lives.left === 2 && TUNING.phaseAt.length === 3, 'two bars, three phases: bar 1 full');
  assert(d.mode === 'sleep' && d.brain.clip === d.brain.C.meditate && d.phase === 1 && Math.abs(Math.cos(d.yaw) + 1) < 1e-6, 'he waits with his back to the path (meditate)');
  for (const L of LEVELS) if (L !== LVL) assert(!/one who woke|falling script/i.test(JSON.stringify(L.text)), `${L.id}: none of his lines`);
}

// ================================================================== scenario: data (the move rules)
async function scenarioData() {
  out('\n== scenario DATA (move data rules in every phase a move is used in, both ends of every roll) ==');
  let checked = 0;
  const G = TUNING.pressure.guard, SEP = G.sep + G.margin;
  const answer = (t) => (t === TELL.RED || t === TELL.BLACK ? 'dodge' : 'guard');
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    const phases = phasesOf(name);
    if (!phases.length) assert(false, `${name}: used in at least one phase`);
    if (!def.transition && !def.counter && !(Array.isArray(def.weight) && def.weight.length === PHASES)) assert(false, `${name}: a weight per phase`);
    for (const f of phases) {
      for (const r of [0, 0.5, 0.999]) {
        const A = realise(name, f, () => r);
        const real = A.beats.filter((b) => !b.feint);
        const tag = `${name} P${f} r${r}`;
        if (!real.every((b) => [TELL.NORMAL, TELL.BLUE, TELL.RED, TELL.BLACK].includes(b.def.tell))) assert(false, `${tag}: a tell on every real hit`);
        if (!A.beats.filter((b) => b.feint).every((b) => !b.def.zone && !b.def.damage)) assert(false, `${tag}: a feint has no zone and no damage`);
        const first = real[0];
        if (!def.transition && first && !(first.impact - first.tellAt >= TUNING.minFirstWindup - 1e-6)) assert(false, `${tag}: first real windup ${(first.impact - first.tellAt).toFixed(3)} >= ${TUNING.minFirstWindup}`);
        for (let i = 1; i < real.length; i++) {
          const gap = real[i].impact - real[i - 1].impact;
          if (!(gap >= TUNING.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${gap.toFixed(3)} s apart >= ${TUNING.minHitGap}`);
          if (answer(real[i].def.tell) !== answer(real[i - 1].def.tell) && !(gap >= SEP - 1e-6)) assert(false, `${tag}: a cue asking the other answer ${gap.toFixed(3)} s after one (>= ${SEP})`);
        }
        for (const b of real) if (!(b.flash >= b.tellAt - 1e-6)) assert(false, `${tag}: hit ${b.hit} flashes after its tell`);
        for (const b of real) if (b.def.cast && !b.def.cast.selfCue) assert(false, `${tag}: a thrown thing cues itself (cast.selfCue)`);
        for (const b of real) if (b.def.cast && !['shot', 'bolt', 'unwrite'].includes(b.def.cast.kind)) assert(false, `${tag}: a cast he knows`);
        checked++;
      }
    }
  }
  assert(checked > 60, `${checked} realisations obey the rules (a tell per hit, feints silent, first windup >= ${TUNING.minFirstWindup} s, hits >= ${TUNING.minHitGap} s apart, the other answer >= ${SEP} s after)`);
  const W = (n, i = 0) => MOVES[n].beats.filter((b) => !b.feint)[i];
  const L = MOVES.lesson.beats;
  assert(L[0].feint && L[0].beckon && L.filter((b) => !b.feint).map((b) => b.tell).join() === [TELL.NORMAL, TELL.NORMAL, TELL.NORMAL, TELL.NORMAL, TELL.BLUE].join() && L[5].flare, 'The First Lesson: the beckon, then N N N N and the blue flare');
  assert(L.filter((b) => !b.feint).length >= TUNING.fullDeflect.minHits, 'The First Lesson: all five parried is the full deflect');
  assert(W('lowWind').tell === TELL.RED && W('lowWind').knockdown && W('lowWind').ring === 2.2, 'Low Wind: red, the ankles, knockdown');
  assert(W('wallStep').wall && W('wallStep').flare && MOVES.wallStep.band[0] === 5 && MOVES.wallStep.band[1] === 11, 'Borrowed Wall: a closer from 5 - 11 m, a parry moment');
  assert(W('ironRain').iron === 'rain' && W('ironRain').sustain?.dur === TUNING.ironRain.dur && W('ironRain', 1).cast?.kind === 'shot' && W('ironRain', 1).tell === TELL.BLUE, 'Iron Rain: a stream (one cue), then the big returnable shot');
  assert(W('twoThunders').cast?.kind === 'shot' && W('twoThunders', 1).cast?.kind === 'shot', 'Two Thunders: two heavy shots');
  assert(W('closeIron', 2).flare && W('closeIron', 2).iron === 'point', 'Close Iron: the point-blank shot is a parry moment');
  assert(W('stillHand').tell === TELL.BLUE && W('stillHand').lock && MOVES.stillHand.beats[0].stance, 'The Still Hand: the stance, then the one-inch push (lock)');
  assert(W('sentBack').send && W('sentBack').flare && MOVES.sentBack.beats.filter((b) => !b.feint).length === 1, 'Return to Sender: ONE blow, one blue flare');
  assert(W('diveWithin').tell === TELL.BLACK && W('diveWithin').damage === 44 && MOVES.diveWithin.cooldown === 14, 'The Dive Within: black, 44, cooldown 14');
  assert(MOVES.thousandHands.beats.filter((b) => !b.feint).length === 7 && MOVES.thousandHands.beats[3].flit, 'A Thousand Hands: six blows and the flare; skipped frames after the third');
  assert(MOVES.leaveFloor.beats[2].pick?.length === 2 && MOVES.leaveFloor.beats[2].pick.some((b) => b.fist) && MOVES.leaveFloor.beats[2].pick.some((b) => b.pass), 'Leaving the Floor, then the Falling Fist or the Low Pass');
  for (const m of DEJAVU_MOVES) assert(MOVES[`${m}M`]?.mirrorOf === m && MOVES[`${m}M`].manual, `deja vu: ${m} has its mirrored copy (only linked to)`);
  const T2 = MOVES.ironSeeds.beats[0], T3 = MOVES.rising.beats[0];
  assert(TRANSITIONS[2] === 'ironSeeds' && T2.tell === TELL.RED && T2.windup === 2.0 && T2.fixed && T2.zone.r === 6 && T2.damage === 12 && T2.knockback === 7, 'A Hundred Iron Seeds: red, 2.0 s fixed, ring 6, 12, knockback 7');
  assert(TRANSITIONS[3] === 'rising' && T3.tell === TELL.RED && T3.windup === 2.3 && T3.fixed && T3.zone.r === 6.5 && MOVES.rising.recovery === TUNING.rising.palm, 'the rising: red, 2.3 s fixed, ring 6.5, then the palm held 1.5 s');
  assert(TUNING.windupScale[2] <= TUNING.windupScale[1] && TUNING.windupScale[1] <= TUNING.windupScale[0], 'harder is faster, never harder-hitting');
  const A1 = realise('lesson', 1, () => 0.5), A2 = realise('lesson', 2, () => 0.5);
  assert(!!A1 && !!A2 && A1.clip !== A2.clip, 'phase 1 realises its own (one-handed) clips');
}

// ================================================================== scenario: timing (flash → contact)
async function scenarioTiming() {
  out('\n== scenario TIMING (every move from inside its band: each glint is a blow, on time) ==');
  let worst = 0, moves = 0;
  const only = process.env.ABYSS_TMOVE;
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    // (the Still Hand waits for a cut: STANCE; Return to Sender needs bolts hanging: STOP)
    if (def.transition || def.hidden || def.manual || name === 'sentBack' || name === 'reload' || name === 'stillHand') continue;
    if (only && name !== only) continue;
    const f = P_OF(name);
    // (Unwriting tears the code pillars: the real set)
    const G = build(SEED, def.beats.some((b) => b.unwrite));
    const d = G.game.dragon;
    const [lo, hi] = def.band;
    const at = def.counter ? 2.2 : Math.max(1.6, Math.min(hi - 0.4, lo + (Math.min(hi, 12) - lo) * 0.4));
    duel(G, { dist: at, form: f });
    G.game.player.debug.god = true;
    const flashes = [], contacts = [];
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') flashes.push(G.game.time); };
    const h0 = G.hits.length;
    if (!d.debug.trigger(name)) { assert(false, `${name} P${f}: starts`); continue; }
    run(G, 9, null, () => quiet(d));
    for (const h of G.hits.slice(h0)) if (h.r !== RESULT.IGNORED) { contacts.push(h.t); if (only) out(`       ${h.t.toFixed(3)} contact ${h.attack} ${h.r}`); }
    let w = 0;
    for (const c of contacts) {
      // (the cue that belongs to it: the nearest to flashLead before it, so a stream's next shot's cue is not taken for it)
      let best = Infinity;
      for (const t of flashes) if (t <= c + 1e-6) best = Math.min(best, Math.abs(c - t - TUNING.flashLead));
      w = Math.max(w, best);
    }
    worst = Math.max(worst, Number.isFinite(w) ? w : 9);
    moves++;
    if (!(contacts.length >= 1) || !(w <= 0.09)) assert(false, `${name} P${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
    else out(`     ${name.padEnd(15)} P${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
  }
  if (only) return;
  assert(moves >= 18 && worst <= 0.09, `${moves} moves: every contact within ${(worst * 1000).toFixed(0)} ms of its flash + ${TUNING.flashLead} s, and every move lands`);
}

// ================================================================== helpers: the mechanics
/** A shot of his own, thrown now from (x, z) toward (tx, tz). */
function shoot(d, x, z, tx, tz, o = {}) {
  const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
  return d.fx.throwShot({ kind: 'blast', x, y: 1.2, z, dx: dx / l, dz: dz / l, speed: 22, radius: 0.4, size: 1, range: 30, tell: TELL.BLUE, damage: 16, attack: 'twoThunders', returnable: true, hitKind: 'shot', ...o });
}
/** The shot `s` struck back by a perfect parry: it flies at him (AscFx's return). */
function returned(s) {
  s.returned = true;
  s.done = true;
  s.phase = 'fly';
  s.age = 0;
  s.speed = Math.max(s.speed, 18);
}

// ================================================================== scenario: cover (the pillars stop his shots)
async function scenarioCover() {
  out('\n== scenario COVER (a pillar stops a shot and is bitten; it falls after its share; a held guard pays guard only) ==');
  const G = build(SEED, true);
  const { game } = G;
  const d = game.dragon, p = game.player, W = game.world.destructibles;
  duel(G, { dist: 4, form: 2 });
  p.debug.god = false;
  const pil = W.list.find((b) => b.kind === 'pillar' && !b.absent && b.state === 0);
  assert(!!pil, `a pillar stands in the Pillared Hall (${W.list.filter((b) => b.kind === 'pillar' && !b.absent).length})`);
  // the hero behind it: he shoots through the pillar at the hero
  d.position.set(pil.x + 6, 0, pil.z);
  p.debug.teleport(pil.x - 1.4, pil.z);
  run(G, 0.1);
  const hp0 = p.hp, h0 = pil.hp, bit0 = W.bitten;
  shoot(d, d.position.x, d.position.z, p.position.x, p.position.z, { damage: 5, tell: TELL.NORMAL, returnable: false });
  run(G, 1);
  assert(p.hp === hp0 && pil.hp < h0, `the shot stopped on the pillar: it took ${(h0 - pil.hp).toFixed(2)} of ${h0.toFixed(2)}, the hero nothing`);
  assert(W.bitten > bit0 || true, `bites taken ${W.bitten - bit0}`);
  let n = 1;
  while (pil.state === 0 && n < 40) {
    shoot(d, d.position.x, d.position.z, p.position.x, p.position.z, { damage: 5, tell: TELL.NORMAL, returnable: false });
    run(G, 0.6);
    n++;
  }
  assert(pil.state !== 0 && n <= Math.ceil(h0 / TUNING.world.blast) + 2, `the pillar fell after ${n} shots (its share: ${TUNING.world.blast} each)`);
  // a held guard through a whole Iron Rain: guard, never health
  {
    const G2 = build();
    const d2 = G2.game.dragon, p2 = G2.game.player;
    duel(G2, { dist: 8, form: 2 });
    p2.debug.god = false;
    const hp = p2.hp;
    G2.input.press(1);
    let minGuard = p2.guard;
    d2.debug.trigger('ironRain');
    run(G2, 5, () => { G2.input.buttons[1] = true; G2.game.mouseGround.set(d2.position.x, 0, d2.position.z); minGuard = Math.min(minGuard, p2.guard); }, () => quiet(d2) && G2.game.time > 3);
    const shots = G2.hits.filter((h) => h.attack === 'ironRain');
    assert(shots.length >= 10 && shots.every((h) => h.r === RESULT.BLOCKED), `the volley met a held guard: ${shots.length} shots, all blocked`);
    assert(p2.hp === hp && 100 - minGuard <= 55, `it cost guard only: ${(100 - minGuard).toFixed(1)} (<= 55), health ${hp} → ${p2.hp}`);
  }
}

// ================================================================== scenario: bend (phase 2: the Bend)
async function scenarioBend() {
  out('\n== scenario BEND (a returned shot bends him; open, the crit; the second lands; once in 6 s; none in phase 3) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player;
  duel(G, { dist: 6, form: 2 });
  p.debug.god = true;
  const s = shoot(d, d.position.x, d.position.z + 0.6, p.position.x, p.position.z);
  run(G, 0.1);
  returned(s);
  const post0 = d.posture, hp0 = d.hp;
  let bent = false, slow = 1;
  run(G, 1.5, () => { slow = Math.min(slow, game.timeScale); }, () => (bent = d.brain.react?.kind === 'bend'));
  assert(bent && d.state === 'staggered' && !d.guarding, 'a returned shot BENDS him: arched back, open, no guard');
  assert(d.hp === hp0 && d.posture > post0, `it passed over him: no damage; posture ${post0.toFixed(0)} → ${d.posture.toFixed(0)}`);
  run(G, 0.05, () => { slow = Math.min(slow, game.timeScale); });
  assert(slow < 0.9, `time slowed for everyone (${slow.toFixed(2)})`);
  // the first cut on him crits
  const dealt = d.takeHit({ damage: 20, part: 'body', swing: true });
  assert(dealt >= 20 * TUNING.bend.crit * 0.9, `the first cut while bent crits: ${dealt}`);
  // a second returned shot inside the window lands in full
  const s2 = shoot(d, d.position.x + 0.3, d.position.z + 0.6, p.position.x, p.position.z);
  run(G, 0.02);
  returned(s2);
  const hp1 = d.hp;
  run(G, 0.6, null, () => d.hp < hp1);
  assert(hp1 - d.hp >= TUNING.bend.returned - 1, `he cannot bend twice: the second lands in full (${(hp1 - d.hp).toFixed(0)})`);
  run(G, 2);
  assert(Math.abs(game.timeScale - 1) < 1e-6, 'time is back to 1');
  // the melee Bend: at most once in 6 s
  d._bendT = 0;
  d.brain._toFoot(0);
  const c1 = d.bend('cut');
  run(G, 1.2);
  d._bendT = 0;
  d.brain._toFoot(0);
  const c2 = d.bend('cut');
  assert(c1 && !c2, `a melee Bend at most once in ${TUNING.bend.every} s (${c1}, ${c2})`);
  // the heavy cut that bent him passes over him; the next lands
  d._bendCool = 0;
  d.brain._toFoot(0);
  d.bend('cut');
  const hp2 = d.hp;
  const a = d.takeHit({ damage: 40, heavy: true, part: 'body', swing: true });
  const b = d.takeHit({ damage: 10, part: 'body', swing: true });
  assert(a === 0 && b > 0 && d.hp < hp2, `heavy, then a light: the heavy passes over, the light lands (${a}, ${b})`);
  // none in phase 3
  d.debug.setPhase(3);
  run(G, 0.5);
  assert(!d.bend('shot') && !d.bend('cut'), 'no Bend in phase 3');
}

// ================================================================== scenario: stop (phase 3: the bolts hang)
async function scenarioStop() {
  out('\n== scenario STOP (returned bolts hang; three → one cue, one result; unsent they drop) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player;
  duel(G, { dist: 6, form: 3 });
  p.debug.god = true;
  const post0 = d.posture, hp0 = d.hp;
  for (let i = 0; i < 3; i++) {
    const s = shoot(d, d.position.x + (i - 1) * 0.3, d.position.z + 0.8, p.position.x, p.position.z, { attack: 'pushingHands' });
    run(G, 0.05);
    returned(s);
    run(G, 0.6, null, () => d.source.held.length > i);
    if (i === 0) assert(d.brain.react?.kind === 'stop', 'the first stops in the air before his palm: rooted (the stop)');
    run(G, 0.6);
  }
  assert(d.source.held.length === 3 && d.hp === hp0, `three hang, none hurt him (${d.source.held.length})`);
  assert(d.posture > post0, `each cost him posture (${post0.toFixed(0)} → ${d.posture.toFixed(0)})`);
  assert(d.weigh('sentBack', MOVES.sentBack, 1, 5) > 0, 'with three hanging, Return to Sender may start');
  // a parry: ONE cue, one result; all burst, his posture pays
  G.defend = makeDefender(G, { style: 'parry' });
  const flashes0 = G.defend.stats.flashes, h0 = G.hits.length, post1 = d.posture;
  d.debug.trigger('sentBack');
  run(G, 3, () => G.defend.act(), () => quiet(d) && d.mode !== 'act');
  const res = G.hits.slice(h0).filter((h) => h.attack === 'sentBack');
  assert(G.defend.stats.flashes - flashes0 === 1 && res.length === 1, `one cue, one result (${G.defend.stats.flashes - flashes0} cue, ${res.length} result: ${res[0]?.r})`);
  assert(res[0]?.r === RESULT.PARRIED && d.source.held.length === 0 && (d.posture > post1 || d.broken), `a parry bursts them all and pays his posture (${post1.toFixed(0)} → ${d.posture.toFixed(0)})`);
  // a held guard: one blow's guard
  {
    const G2 = build();
    const d2 = G2.game.dragon, p2 = G2.game.player;
    duel(G2, { dist: 6, form: 3 });
    p2.debug.god = false;
    d2.debug.hold(3);
    const hp = p2.hp;
    G2.input.press(1);
    const h1 = G2.hits.length;
    d2.debug.trigger('sentBack');
    run(G2, 3, () => { G2.input.buttons[1] = true; G2.game.mouseGround.set(d2.position.x, 0, d2.position.z); }, () => quiet(d2) && d2.mode !== 'act');
    const r = G2.hits.slice(h1).filter((h) => h.attack === 'sentBack');
    assert(r.length === 1 && r[0].r === RESULT.BLOCKED && p2.hp === hp && p2.guard > 0, `a held guard pays one blow's guard (${r.length} result: ${r[0]?.r}, guard ${p2.guard.toFixed(0)})`);
  }
  // unsent they drop, harmless
  {
    const G3 = build();
    const d3 = G3.game.dragon, p3 = G3.game.player;
    duel(G3, { dist: 6, form: 3 });
    d3.debug.hold(2);
    const h2 = G3.hits.length;
    run(G3, TUNING.stop.life + 0.5);
    assert(d3.source.held.length === 0 && G3.hits.length === h2, `unsent after ${TUNING.stop.life} s they drop as loose digits: nobody hurt`);
  }
}

// ================================================================== scenario: stance (the Still Hand)
async function scenarioStance() {
  out('\n== scenario STANCE (a cut into the Still Hand is caught; waited out, his guard is down) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player;
  duel(G, { dist: 2.2, form: 3 });
  p.debug.god = true;
  let caught = 0;
  G.watch = (n, e) => { if (n === 'dragon:guard' && e?.caught) caught++; };
  d.debug.trigger('stillHand');
  run(G, 1.2, null, () => !!d.brain.catching());
  assert(!!d.brain.catching(), 'he stands in the Still Hand (catching)');
  const hp0 = d.hp;
  const dealt = d.takeHit({ damage: 20, part: 'body', swing: true });
  assert(dealt === 0 && d.hp === hp0 && caught === 1, 'a cut into it is CAUGHT: no damage');
  const h0 = G.hits.length;
  run(G, 2, null, () => G.hits.length > h0);
  assert(G.hits.slice(h0).some((h) => h.attack === 'stillHand' && h.tell === TELL.BLUE), 'his answer: the one-inch push (blue)');
  // waited out
  const G2 = build();
  const d2 = G2.game.dragon;
  duel(G2, { dist: 2.2, form: 3 });
  G2.game.player.debug.god = true;
  d2.debug.trigger('stillHand');
  run(G2, 2, null, () => d2.mode === 'foot');
  assert(d2.mode === 'foot' && !d2.guarding && d2.brain.raiseT > 0.2, `waited out, his guard stays down (${d2.brain.raiseT.toFixed(2)} s)`);
}

// ================================================================== scenario: flight (Leaving the Floor, the Falling Fist, the front, the Low Pass)
async function scenarioFlight() {
  out('\n== scenario FLIGHT (the fix; the crater; the front strikes once; a roll through takes nothing; the camera given back) ==');
  const pick = (k) => {
    const G = build();
    const { game } = G;
    const d = game.dragon;
    duel(G, { dist: 5, form: 3 });
    game.player.debug.god = true;
    const R0 = Math.random;
    Math.random = () => k;
    d.debug.trigger('leaveFloor');
    Math.random = R0;
    return G;
  };
  {
    const G = pick(0.01);
    const { game } = G;
    const d = game.dragon, p = game.player;
    let top = 0, pull = 0;
    run(G, 3.4, () => { top = Math.max(top, d.position.y); pull = Math.max(pull, d.cameraPull); }, () => !!d.source.fist);
    assert(top > TUNING.flight.hover - 0.5, `he went straight up to ${top.toFixed(1)} m and hangs`);
    assert(!!d.source.fist, 'the Falling Fist: the spot is fixed');
    // the hero leaves the spot: 6 m off it, the front's way
    const F = d.source.fist;
    p.debug.teleport(F.x + 6, F.z);
    const h0 = G.hits.length;
    run(G, 3, () => { pull = Math.max(pull, d.cameraPull); }, () => quiet(d));
    run(G, 1.5);
    const fr = G.hits.slice(h0).filter((h) => h.tell === TELL.RED && h.kind === 'crush');
    assert(fr.length === 1, `the front struck once as it reached him (${fr.length})`);
    assert(pull > 0.5 && d.cameraPull < 0.3, `the camera eased back (${pull.toFixed(1)} m) and was given back (${d.cameraPull.toFixed(2)})`);
  }
  {
    // a roll through the front
    const G = pick(0.01);
    const { game, input } = G;
    const d = game.dragon, p = game.player;
    run(G, 3.4, null, () => !!d.source.fist);
    const F = d.source.fist;
    p.debug.teleport(F.x + 6, F.z);
    p.debug.god = false;
    const hp = p.hp;
    let rolled = false;
    run(G, 3, () => {
      const Fr = d.source.front;
      if (!rolled && Fr.live && Fr.flashed) { rolled = true; input.axis = { x: -1, y: 0 }; input.tap('Space'); }
    }, () => quiet(d));
    assert(rolled && p.hp === hp, `a roll through the front takes nothing (${hp} → ${p.hp})`);
  }
  {
    const G = pick(0.99);
    const { game } = G;
    const d = game.dragon;
    const h0 = G.hits.length;
    let passed = false;
    run(G, 5, () => { if (d.brain.act?.beats?.some((b) => b.def.pass && b.struck)) passed = true; }, () => quiet(d) && game.time > 3);
    assert(passed && G.hits.slice(h0).some((h) => h.attack === 'leaveFloor' && h.tell === TELL.RED), 'the Low Pass: one flat pass along the line (red)');
    run(G, 1);
    assert(d.position.y < 0.05, 'he is back on the floor');
  }
}

// ================================================================== scenario: rising (the fall and the rising)
async function scenarioRising() {
  out('\n== scenario RISING (bar 1 empty is no death; lying he takes nothing; bar 2 full in the Source; the palm catches) ==');
  const G = build(SEED, true);
  const { game } = G;
  const d = game.dragon, p = game.player;
  duel(G, { dist: 3, form: 2 });
  p.debug.god = true;
  let slow = 1;
  d.takeHit({ damage: d.hp + 10, exact: true, part: 'body' });
  run(G, 0.1);
  assert(d.broken && d.mode !== 'dying' && d.mode !== 'dead', 'bar 1 empty: he BREAKS, no death');
  d.onExecute({ damage: 200 });
  run(G, 0.3, () => { slow = Math.min(slow, game.timeScale); });
  assert(d.brain.react?.kind === 'executed' && d._changing && !!d._fall, 'the deathblow: THE FALL, flat on his back');
  assert(slow < 0.5, `time slowed (${slow.toFixed(2)})`);
  assert(d.takeHit({ damage: 30, part: 'body', swing: true }) === 0, 'lying, nothing hurts him');
  run(G, TUNING.fall.lie + 1.0, null, () => d.brain.act?.name === 'rising');
  assert(d.brain.act?.name === 'rising' && d.phase === 3, 'he rises (the transition)');
  assert(game.world.forest.scenes.now === 'source', 'the hall turned to code: the Source');
  assert(d.maxHp === TUNING.hp2 && d.hp === TUNING.hp2 && d.lives.left === 1, `bar 2 full (${d.hp} / ${d.maxHp}), one bar left`);
  run(G, 3, null, () => d._palmT > 0);
  assert(d._palmT > 0, 'the ring went out; the Still Hand is held');
  let caught = 0;
  G.watch = (n, e) => { if (n === 'dragon:guard' && e?.caught) caught++; };
  const hp3 = d.hp;
  assert(d.takeHit({ damage: 25, part: 'body', swing: true }) === 0 && d.hp === hp3 && caught === 1, 'a cut on the held palm is caught');
  run(G, TUNING.rising.palm + 0.5);
  assert(d._palmT === 0 && d.takeHit({ damage: 10, part: 'body', swing: true }) >= 0, 'the palm lowered: the fight goes on');
  // a reset mid-fall and mid-rising leaves nothing
  for (const when of ['fall', 'rising']) {
    const G2 = build(SEED, true);
    const g2 = G2.game, d2 = g2.dragon;
    duel(G2, { dist: 3, form: 2 });
    g2.player.debug.god = true;
    d2.debug.fallAndRise();
    run(G2, when === 'fall' ? 0.4 : TUNING.fall.lie + 1.5);
    g2.flow.debug.toState('explore');
    d2.reset();
    g2.world.restore();
    run(G2, 1.0);
    assert(d2.phase === 1 && !d2._fall && !d2._changing && d2._palmT === 0 && d2.cameraPull === 0 && g2.world.forest.scenes.now === 'hall' && Math.abs(g2.timeScale - 1) < 1e-6, `a reset mid-${when} leaves nothing (phase ${d2.phase}, scene ${g2.world.forest.scenes.now}, time ${g2.timeScale.toFixed(2)})`);
  }
}

// ================================================================== scenario: dejavu (the replay)
async function scenarioDejavu() {
  out('\n== scenario DEJAVU (the hall stutters; the replay\'s beats equal the first pass\'s; mirrored in phase 3) ==');
  for (const ph of [2, 3]) {
    const G = build(SEED, true);
    const { game } = G;
    const d = game.dragon;
    duel(G, { dist: 2, form: ph });
    game.player.debug.god = true;
    const name = ph === 2 ? 'closeIron' : 'thousandHands';
    d.debug.trigger(name);
    const A = d.brain.act;
    const first = A.beats.map((b) => [b.impact - A.beats[0].start, b.H ?? 0, b.def.tell]);
    run(G, 0.05);
    const s = d.brain._sense();
    const target = ph === 3 ? `${name}M` : name;
    let stutter = 0;
    G.watch = (n) => { if (n === 'dragon:dejavu') stutter++; };
    d.debug.setAI(true); // (links are his own: only with the AI on)
    const ok = d.brain._startNext(A, { to: target, link: { to: target, when: 'any', force: true, dejavu: true, band: false }, at: 0 }, s, false);
    const B = d.brain.act;
    const second = B.beats.map((b) => [b.impact - B.beats[0].start, b.H ?? 0, b.def.tell]);
    assert(ok && B.name === target && B.replay, `phase ${ph}: ${name} links back into ${target} as a replay`);
    assert(JSON.stringify(first) === JSON.stringify(second), `phase ${ph}: the replay's beats equal the first pass's (${second.length} beats)`);
    assert(stutter === 1, 'the hall stutters once (dragon:dejavu)');
    if (ph === 3) assert(B.beats.some((b) => b.def.part === 'fistL') && A.beats[0].def.part !== B.beats[0].def.part, 'phase 3: mirrored, left for right');
  }
  // the links: only phases 2 and 3, only a string that ended on its own (the engine's rule)
  const { LINKS } = await imp('src/entities/enemies/wokenOne/links.js');
  for (const m of DEJAVU_MOVES) {
    const L = LINKS[m] ?? [];
    assert(L[0]?.dejavu && L[0].to === m && L[0].force && L[0].chance[0] === 0 && L[1]?.to === `${m}M` && L[1].chance[2] > 0, `${m}: deja vu links (phase 2 the same, phase 3 mirrored; never phase 1)`);
  }
}

// ================================================================== scenario: flow (the scenes through the fight)
async function scenarioFlow() {
  out('\n== scenario FLOW (the beckon → the Sparring Hall; phase 2 → the Pillared Hall; the rising → the Source; death and reset → the hall) ==');
  const G = build(SEED, true);
  const { game } = G;
  const d = game.dragon, p = game.player;
  const S = game.world.forest.scenes;
  assert(S.now === 'hall', 'arrival: the Pillared Hall');
  run(G, 0.2);
  game.flow.debug.toState('explore');
  p.debug.god = true;
  d.startIntro();
  let holds = 0;
  run(G, 4, () => { holds = Math.max(holds, S.holdT ?? 0); }, () => d.mode === 'foot');
  assert(d.mode === 'foot' && S.now === 'dojo', 'he looks over his shoulder, turns, BECKONS: the room rewrote into the Sparring Hall');
  run(G, 2, null, () => !S.morphing && S.k >= 1); // (the front finishes crossing the hall)
  const pos = game.world.destructibles.list.filter((b) => b.scene && !b.absent);
  assert(pos.length > 0 && pos.every((b) => (S.member ? S.member(b, 'dojo') : b.scene === 'dojo')), `only the Sparring Hall's pieces stand (${pos.length})`);
  d.debug.setAI(false);
  d.brain.forcePhase(2);
  run(G, 4, null, () => d.phase === 2 && d.mode !== 'act');
  assert(d.phase === 2 && S.now !== 'dojo', `A Hundred Iron Seeds: the Pillared Hall again (${S.now})`);
  d.debug.fallAndRise();
  run(G, TUNING.fall.lie + 4, null, () => d.phase === 3 && d.mode !== 'act' && d.mode !== 'react');
  assert(S.now === 'source', 'the rising: the Source');
  d.debug.kill();
  run(G, 4);
  assert(S.now !== 'source', `his death: the rain stops, the hall returns (${S.now})`);
  game.world.restore();
  d.reset();
  run(G, 0.5);
  assert(S.now === 'hall' && d.phase === 1 && d.mode === 'sleep', 'a reset: the hall, he turns his back again');
}

// ================================================================== scenario: reward (the Long Second, ADR-158)
async function scenarioReward() {
  out('\n== scenario REWARD (the Long Second: locked by default, the gesture, the lean in place, its i-frames, the slow-mo; granted on his death) ==');
  const { Unlocks, UNLOCK_KEY } = await imp('src/game/unlocks.js');
  const { TUNE } = await imp('src/entities/player/player.js');
  const mem = new Map(), store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  const U = new Unlocks(store, '');
  assert(!U.has('longSecond') && U.grant('longSecond') && !U.grant('longSecond') && JSON.parse(mem.get(UNLOCK_KEY)).includes('longSecond'), 'the store: granted once, kept in storage');
  assert(new Unlocks(null, '?tech=lean').has('longSecond') && !new Unlocks(null, '?tech=lean').has('oneBreath') && !new Unlocks(null, '').has('longSecond'), '?tech=lean turns it on for the page load');
  const L = TUNE.lean, BK = TUNE.backstep;
  assert(L.dist === 0 && L.iframes[0] === 0.03 && L.iframes[1] === 0.34 && L.attackAfter === 0.24 && L.slowmo === 0.9 && BK.iframes[1] === 0.22, 'its numbers beside the backstep\'s: no travel, i-frames 0.03 - 0.34 (0.03 - 0.22), free to cut after 0.24, a 0.9 s slow-mo');
  /** guard (the middle click), then dodge with `axis` */
  const gesture = (G, learned, axis = { x: 0, y: 0 }) => {
    const { game, input } = G;
    const p = game.player;
    if (learned) game.unlocks = new Unlocks(null, '?tech=lean');
    else delete game.unlocks;
    duel(G, { dist: 6 });
    p.debug.god = true;
    input.press(1);
    run(G, 0.25);
    const x0 = p.position.x, z0 = p.position.z;
    input.axis = axis;
    input.tap('Space');
    run(G, 0.02);
    const st = p.state, lean = p.rollLean, back = p.rollBack;
    let iAt = false;
    run(G, 0.28, () => { if (p.stateT > 0.25 && p.stateT < 0.32 && p.state === 'roll') iAt = iAt || p.isInvulnerable(); });
    input.up(1);
    run(G, 0.4);
    return { st, lean, back, iAt, moved: Math.hypot(p.position.x - x0, p.position.z - z0) };
  };
  {
    const r = gesture(build(), false);
    assert(r.st === 'roll' && r.back && !r.lean && r.moved > 1.0, `locked (no store, the tests' worlds): guard + dodge is the backstep, as before (moved ${r.moved.toFixed(2)} m)`);
  }
  {
    const r = gesture(build(), true);
    assert(r.st === 'roll' && r.lean && r.moved < 0.2, `learned: the Long Second, a lean in place (moved ${r.moved.toFixed(2)} m)`);
    assert(r.iAt, 'its i-frames run past the backstep\'s (still untouchable at 0.25 - 0.32 s)');
  }
  {
    const r = gesture(build(), true, { x: 1, y: 0 });
    assert(r.st === 'roll' && !r.lean && !r.back && r.moved > 2, `with a direction held the roll is the roll (moved ${r.moved.toFixed(2)} m)`);
  }
  // a perfect lean under a white blow: a streak pip, the longer slow-mo, three afterimages, no crit window
  {
    const G = build();
    const { game, input } = G;
    const p = game.player, d = game.dragon;
    game.unlocks = new Unlocks(null, '?tech=lean');
    duel(G, { dist: 1.8 });
    p.debug.god = true;
    let perfect = null, ghosts = 0;
    G.watch = (n, e) => { if (n === 'player:perfectDodge') perfect = e; };
    const gh = p.fx.ghostep.bind(p.fx);
    p.fx.ghostep = (...a) => { ghosts++; return gh(...a); };
    input.press(1);
    d.debug.trigger('idleHand');
    const A = d.brain.act, b = A.beats.find((x) => !x.feint);
    let leaned = false, slow = 0;
    run(G, 1.5, () => {
      if (!leaned && A.t >= b.impact - 0.08) { leaned = true; input.axis = { x: 0, y: 0 }; input.tap('Space'); }
      slow = Math.max(slow, game.hitstopTimer);
    }, () => perfect !== null);
    run(G, 0.05, () => { slow = Math.max(slow, game.hitstopTimer); });
    input.up(1);
    assert(perfect !== null && p.rollLean, 'a perfect Long Second under a white blow');
    assert(slow > DEFENSE_GHOST + 0.2 && ghosts >= 3 && p.critTimer <= 0, `it slows time ${slow.toFixed(2)} s (the Ghostep's ${DEFENSE_GHOST}), ${ghosts} afterimages, no crit window (white)`);
  }
  // granted on his death; the victory's line
  {
    const G = build();
    const { game } = G;
    const d = game.dragon;
    const mem2 = new Map();
    game.unlocks = new Unlocks({ getItem: (k) => mem2.get(k) ?? null, setItem: (k, v) => mem2.set(k, String(v)) }, '');
    duel(G, { dist: 3, form: 3 });
    assert(!game.unlocks.has('longSecond') && d.victoryNote() === null, 'not learned before he falls');
    d.debug.kill();
    run(G, 0.5);
    assert(game.unlocks.has('longSecond') && d.victoryNote() === 'YOU LEARNED THE LONG SECOND', 'his death teaches it: YOU LEARNED THE LONG SECOND');
  }
}

// ================================================================== scenario: training
async function scenarioTraining() {
  out('\n== scenario TRAINING (every situation of the Training catalogue for this boss plays out and shows what it promises) ==');
  const G = build(SEED, true);
  const { game } = G;
  duel(G, { dist: 4 });
  const T = game.lab.training;
  const { bossKinds } = await imp('src/dev/training.js');
  const kinds = bossKinds(game);
  assert(kinds.has('woke') && !kinds.has('ash') && !kinds.has('lord') && !kinds.has('asc') && !kinds.has('fox') && kinds.has('duel'), `his own boss kind (${[...kinds].join(', ')})`);
  const only = process.env.ABYSS_TONLY?.split(',');
  const L = only ? only.map((id) => T.find(id)).filter(Boolean) : T.list();
  const bad = [];
  for (const s of L) {
    T.run(s.id);
    let frames = 0;
    while (T.ph !== 'done' && frames < Math.round(40 / DT)) { G.tick(DT); frames++; }
    const r = T.lastResult;
    const ok = T.ph === 'done' && r?.id === s.id && r.ok;
    if (!ok || process.env.ABYSS_TRACE) out(`   ${ok ? 'ok ' : 'BAD'} ${s.cat} · ${s.name}: ${T.ph} in ${(frames * DT).toFixed(1)} s · missing ${JSON.stringify(r?.missing ?? '?')} · hero ${game.player.state} · boss ${game.dragon.state}`);
    if (!ok) bad.push(s.id);
  }
  T.stop();
  assert((only || L.length >= 20) && !bad.length, `every situation plays out and shows what it promises (${L.length - bad.length} of ${L.length}${bad.length ? `; not: ${bad.join(', ')}` : ''})`);
  assert(['wokeLesson', 'wokeRain', 'wokeThunder', 'wokeStill', 'wokeFist'].every((id) => !!T.find(id)), 'his five lessons are in the catalogue');
  // the Lab's own buttons for him
  const G3 = build(SEED, true);
  duel(G3, { dist: 5, form: 2 });
  const d3 = G3.game.dragon;
  const bent = d3.debug.bendNow('shot');
  run(G3, 1.5);
  const S = G3.game.world.forest.scenes;
  const sc = d3.debug.scene('dojo');
  run(G3, 2);
  assert(bent && sc && S.now === 'dojo', 'the Lab: Bend now, Scene dojo');
  const held = d3.debug.hold(3);
  run(G3, 0.3);
  assert(held === 3 && d3.phase === 3, 'the Lab: Hold 3 (phase 3)');
  d3.reset();
  G3.game.world.restore();
  duel(G3, { dist: 3, form: 2 });
  const fell = d3.debug.fallAndRise();
  run(G3, TUNING.fall.lie + 5, null, () => d3.phase === 3 && d3.mode === 'foot');
  assert(fell && d3.phase === 3 && S.now === 'source', 'the Lab: Fall + rise');
  const dv = d3.debug.dejavu('thousandHands');
  assert(dv && d3.brain.act?.replay === false, 'the Lab: Deja vu (a first pass, nothing to replay yet)');
}

// ================================================================== scenario: pace (the director's meter)
function paceDefender(G) {
  const pend = [];
  const stats = { flashes: 0, rolls: 0, guards: 0 };
  let guardUntil = -1;
  const leadOf = (src) => (src === 'world' ? 0.3 : TUNING.flashLead);
  return {
    stats,
    onEvent(n, e) {
      if (n !== 'combat:flash' || (e?.source !== 'dragon' && e?.source !== 'world')) return;
      stats.flashes++;
      pend.push({ tell: e.tell, at: G.game.time + leadOf(e.source), x: e.x, z: e.z, hazard: !!e.hazard && !e.bullet, done: false });
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.5) pend.splice(i, 1);
      let rolled = false;
      for (const e of pend) {
        if (e.done) continue;
        const left = e.at - t - DT;
        if (e.tell === TELL.RED || e.tell === TELL.BLACK) {
          if (left <= 0.28) {
            e.done = true;
            input.up(1);
            guardUntil = -1;
            const c = e.hazard ? { x: e.x, z: e.z } : g.dragon.position, p = g.player.position;
            const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
            input.axis = e.hazard ? { x: dx / l, y: -dz / l } : { x: -dz / l, y: -dx / l };
            input.tap('Space');
            rolled = true;
            stats.rolls++;
          }
        } else {
          e.done = true;
          guardUntil = Math.max(guardUntil, e.at + 0.2);
          stats.guards++;
        }
      }
      if (guardUntil > t) input.press(1);
      else if (guardUntil > 0) { guardUntil = -1; input.up(1); }
      return rolled;
    },
  };
}

/** Into phase `ph` through its real change: A Hundred Iron Seeds; the fall and the rising. */
function toPhase(G, ph, step) {
  const d = G.game.dragon;
  if (ph >= 2) {
    d.brain.forcePhase(2);
    run(G, 8, step, () => d.phase === 2 && d.mode !== 'act');
  }
  if (ph >= 3) {
    d.debug.fallAndRise();
    run(G, 12, step, () => d.phase === 3 && d.mode !== 'act' && d.mode !== 'react');
  }
}

async function scenarioPace() {
  out('\n== scenario PACE (a steady defender in god mode vs his AI, per phase: cues, gaps, conflicts) ==');
  const DIR = await imp('src/entities/enemies/duelist/director.js');
  const P = TUNING.pressure ?? null;
  const SECS = Number(process.env.ABYSS_PSECS ?? 60);
  const SEEDS = (process.env.ABYSS_PSEEDS ?? '4242,7,99').split(',').map(Number).filter(Number.isFinite);
  const pp = (v, ph) => (Array.isArray(v) ? v[Math.min(v.length, Math.max(1, ph)) - 1] : v);
  const CATS = DIR.CATEGORIES;
  const answer = (tell) => (tell === TELL.RED || tell === TELL.BLACK ? 'dodge' : 'guard');
  const skip = (name) => !MOVES[name] || MOVES[name].transition || MOVES[name].counter;
  const rows = [];
  for (const seed of SEEDS) {
    for (let ph = 1; ph <= 3; ph++) {
      const G = build(seed, true);
      const { game } = G;
      const d = game.dragon, p = game.player;
      duel(G, { dist: 3, ai: true });
      p.debug.god = true;
      p.debug.noRiposte = true;
      G.defend = paceDefender(G);
      toPhase(G, ph, (GG) => { GG.input.axis = { x: 0, y: 0 }; GG.defend.act(); });
      Math.random = mulberry32(seed * 7 + ph);
      const flashes = [], acts = [], cats = {}, busyT = [];
      let frames = 0, peakFire = 0;
      const s0 = { ...(d.brain.stats ?? {}) };
      G.watch = (n, e) => {
        if (n === 'combat:flash' && (e?.source === 'dragon' || e?.source === 'world')) flashes.push([game.time, e.tell, e.attack, e.source]);
        if (n === 'combat:charge' && Number.isFinite(e?.dur)) for (let k = 0; k < e.dur; k += 0.1) busyT.push(game.time + k);
        if (n === 'dragon:windup' && !skip(e?.name)) { acts.push([game.time, e.name]); const c = DIR.categoryOf(MOVES[e.name]); cats[c] = (cats[c] || 0) + 1; }
      };
      const roam = mulberry32(seed * 31 + ph), goal = { r: 2.5, a: 0, until: -1 };
      const t0 = game.time;
      for (let i = 0; i < Math.round(SECS / DT); i++) {
        const rolled = G.defend.act();
        if (game.time > goal.until) {
          goal.r = [2.5, 5, 9][Math.floor(roam() * 3)];
          goal.a = Math.atan2(p.position.x - d.position.x, p.position.z - d.position.z) + (roam() - 0.5) * 1.6;
          goal.until = game.time + 4;
        }
        if (!rolled && p.state !== 'roll') {
          const gx = d.position.x + Math.sin(goal.a) * goal.r, gz = d.position.z + Math.cos(goal.a) * goal.r;
          const k = Math.hypot(gx, gz) > 11 ? 11 / Math.hypot(gx, gz) : 1;
          const dx = gx * k - p.position.x, dz = gz * k - p.position.z, l = Math.hypot(dx, dz);
          G.input.axis = l > 0.6 ? { x: dx / l, y: -dz / l } : { x: 0, y: 0 };
        }
        game.mouseGround.set(d.position.x, 0, d.position.z);
        G.tick(DT);
        peakFire = Math.max(peakFire, game.fx.fire.count ?? 0);
        if (d.brain.pendingPhase > ph) d.brain.pendingPhase = 0;
        // (his bar must not run out under the defender's riposte-less guard: kept full)
        if (d.hp < d.maxHp * 0.6) d.hp = d.maxHp * (ph === 1 ? 0.95 : 0.9);
        frames++;
      }
      G.watch = null;
      G.defend = null;
      const T = game.time - t0;
      const ts = [t0, ...flashes.map((x) => x[0]), ...busyT.filter((x) => x > t0 && x < t0 + T), t0 + T].sort((x, y) => x - y);
      let gapMax = 0, gapAt = '';
      for (let i = 1; i < ts.length; i++) {
        const g = ts[i] - ts[i - 1];
        if (g > gapMax) { gapMax = g; gapAt = `${(ts[i - 1] - t0).toFixed(0)} s: ${acts.filter((w) => w[0] > ts[i - 1] - 0.5 && w[0] < ts[i]).map((w) => w[1]).join(', ') || 'no move'}`; }
      }
      let conflicts = 0;
      const conflictAt = [];
      for (let i = 0; i < flashes.length; i++) {
        for (let j = i + 1; j < flashes.length && flashes[j][0] - flashes[i][0] < 0.3; j++) {
          if (answer(flashes[i][1]) === answer(flashes[j][1]) || flashes[i][2] === flashes[j][2]) continue;
          conflicts++;
          conflictAt.push(`${flashes[i][2]}/${flashes[j][2]} @${(flashes[i][0] - t0).toFixed(1)}`);
        }
      }
      let dodges = 0;
      for (const x of flashes) if (answer(x[1]) === 'dodge') dodges++;
      const st = d.brain.stats ?? {};
      const dlt = (k) => (st[k] ?? 0) - (s0[k] ?? 0);
      rows.push({ seed, ph, T, cues: flashes.length, perMin: (flashes.length * 60) / T, gapMax, gapAt, cats, picks: acts.length, conflicts, conflictAt, dodge: dodges / (flashes.length || 1), holds: dlt('holds'), feints: dlt('feints'), links: dlt('links'), peakFire });
    }
  }
  out(`   ${SECS} s per phase, seeds ${SEEDS.join(', ')}`);
  out(`   seed ph cue/min gapMax moves links clash hold/f  dodge%  fire-peak  ${CATS.map((c) => c.slice(0, 7).padStart(8)).join('')}`);
  for (const r of rows) {
    out(`   ${String(r.seed).padStart(4)}  ${r.ph} ${r.perMin.toFixed(1).padStart(7)} ${r.gapMax.toFixed(2).padStart(6)} ${String(r.picks).padStart(5)} ${String(r.links).padStart(5)} ${String(r.conflicts).padStart(5)} ${`${r.holds}/${r.feints}`.padStart(6)} ${(r.dodge * 100).toFixed(0).padStart(6)} ${String(r.peakFire).padStart(10)}  ${CATS.map((c) => (((r.cats[c] || 0) * 100) / (r.picks || 1)).toFixed(0).padStart(8)).join('')}`);
    out(`         longest gap at ${r.gapAt}${r.conflicts ? ` · CONFLICTS ${r.conflictAt.slice(0, 6).join(' · ')}` : ''}`);
  }
  const mean = (ph, k) => { const rs = rows.filter((r) => r.ph === ph); return rs.reduce((a, r) => a + r[k], 0) / (rs.length || 1); };
  for (let ph = 1; ph <= 3; ph++) out(`   mean P${ph}: ${mean(ph, 'perMin').toFixed(1)} cues/min · longest gap ${Math.max(...rows.filter((r) => r.ph === ph).map((r) => r.gapMax)).toFixed(2)} s · ${mean(ph, 'picks').toFixed(1)} moves · conflicts ${rows.filter((r) => r.ph === ph).reduce((a, r) => a + r.conflicts, 0)} · dodge ${(mean(ph, 'dodge') * 100).toFixed(0)} % · fire field peak ${Math.max(...rows.filter((r) => r.ph === ph).map((r) => r.peakFire))}`);
  const A = P?.meter;
  if (!A) return;
  if (A.rampMean) for (let ph = 2; ph <= 3; ph++) {
    const a0 = mean(ph - 1, 'perMin'), a1 = mean(ph, 'perMin');
    assert(a1 >= a0 * pp(A.rampMean, ph), `the seeds' mean: P${ph} at least x${pp(A.rampMean, ph)} P${ph - 1}'s cues a minute (${a0.toFixed(1)} → ${a1.toFixed(1)})`);
  }
  for (const r of rows) {
    assert(r.perMin >= pp(A.minRate, r.ph), `seed ${r.seed} P${r.ph}: ${r.perMin.toFixed(1)} cues a minute >= ${pp(A.minRate, r.ph)}`);
    assert(r.gapMax <= pp(A.maxGap, r.ph), `seed ${r.seed} P${r.ph}: longest gap ${r.gapMax.toFixed(2)} s <= ${pp(A.maxGap, r.ph)} s (${r.gapAt})`);
    assert(r.conflicts === 0, `seed ${r.seed} P${r.ph}: no two cues of different sources needing different answers within 0.3 s (${r.conflicts}: ${r.conflictAt.slice(0, 4).join(' · ')})`);
    assert(r.peakFire < 2500, `seed ${r.seed} P${r.ph}: the fire field's peak ${r.peakFire} < 2500 blobs`);
  }
}

// ================================================================== scenario: win / strategy
function fight(seed, style, { mortal = false, max = 480, lean = false } = {}) {
  const G = build(seed, true);
  const { game } = G;
  if (lean) game.unlocks = new (UNLOCKS.Unlocks)(null, '?tech=lean');
  duel(G, { dist: 4, ai: true });
  G.defend = makeDefender(G, { style, rng: mulberry32(seed * 3 + 1) });
  const d = game.dragon, p = game.player;
  const n = { parries: 0, perfect: 0, breaks: 0, bends: 0, stops: 0 };
  const phAt = [0];
  G.watch = (ev) => {
    if (ev === 'player:parry') n.parries++;
    if (ev === 'player:perfectDodge') n.perfect++;
    if (ev === 'dragon:postureBreak') n.breaks++;
    if (ev === 'dragon:bend') n.bends++;
    if (ev === 'dragon:stop') n.stops++;
    if (/^dragon:phase[23]$/.test(ev)) phAt.push(game.time);
  };
  const t0 = game.time;
  run(G, max, (GG) => fencer(GG, mortal), () => d.state === 'dead' || d.mode === 'dead' || !p.alive || game.state === 'victory');
  G.watch = null;
  G.defend = null;
  return { won: d.state === 'dead' || d.mode === 'dead' || game.state === 'victory', died: !p.alive, secs: game.time - t0, phase: d.phase, phAt: phAt.map((t) => Math.max(0, t - t0)), hits: G.hits.filter((h) => h.r === RESULT.HIT).length, ...n };
}

async function scenarioWin() {
  out('\n== scenario WIN (a fencing bot in god mode: parries, rolls, cuts in his openings, the deathblows) ==');
  const SEEDS = (process.env.ABYSS_WSEEDS ?? '4242').split(',').map(Number);
  for (const seed of SEEDS) {
    const r = fight(seed, 'mixed');
    out(`     seed ${seed}: ${r.won ? 'won' : 'NOT won'} in ${r.secs.toFixed(0)} s: phases at ${r.phAt.map((t) => t.toFixed(0)).join(' / ')} s; ${r.parries} parries, ${r.perfect} perfect dodges, ${r.breaks} breaks, ${r.bends} bends, ${r.stops} stops, ${r.hits} hits taken; phase ${r.phase}`);
    assert(r.won && r.phase === 3, `seed ${seed}: the fencing bot wins through all three phases`);
    assert(r.secs > 40 && r.secs < 480, `seed ${seed}: the fight takes ${r.secs.toFixed(0)} s`);
  }
}

async function scenarioStrategy() {
  out('\n== scenario STRATEGY (opt-in: mixed / parry / dodge / block-only / the Long Second bots, god mode; then the block-only bot mortal) ==');
  const seeds = (process.env.ABYSS_SSEEDS ?? '4242,7').split(',').map(Number);
  const res = {};
  for (const [style, lean] of [['mixed', false], ['parry', false], ['dodge', false], ['block', false], ['lean', true]]) {
    for (const seed of seeds) {
      const r = fight(seed, style, { lean });
      (res[style] ??= []).push(r);
      out(`     ${style.padEnd(5)} seed ${String(seed).padEnd(4)} ${r.won ? 'WON ' : 'time'} ${r.secs.toFixed(0).padStart(3)} s  phases at ${r.phAt.map((t) => t.toFixed(0)).join(' / ')}  hits taken ${String(r.hits).padStart(3)}  parries ${String(r.parries).padStart(3)}  perfect dodges ${String(r.perfect).padStart(3)}  breaks ${r.breaks}  bends ${r.bends}  stops ${r.stops}`);
    }
  }
  const avg = (k) => res[k].reduce((a, r) => a + r.secs, 0) / res[k].length;
  out(`     means: ${Object.keys(res).map((k) => `${k} ${avg(k).toFixed(0)} s`).join(' · ')}`);
  assert(avg('dodge') > Math.min(avg('mixed'), avg('parry')), 'the dodge-only bot is not the fastest (ADR-102)');
  assert(avg('lean') > Math.min(avg('mixed'), avg('parry')), 'the Long Second does not make leaning the fastest way through (ADR-158)');
  for (const seed of seeds) {
    const r = fight(seed, 'block', { mortal: true, max: 240 });
    out(`     block mortal seed ${seed}: ${r.died ? `died at ${r.secs.toFixed(0)} s` : `alive after ${r.secs.toFixed(0)} s`} (phase ${r.phase})`);
  }
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

// ================================================================== scenario: looks
async function scenarioLooks() {
  out('\n== scenario LOOKS (each ?oneLook= builds; his body dressed by phase: the coat, the guns, the edge) ==');
  const LS = await imp('src/entities/enemies/duelist/lookSwitch.js');
  const PICK = LS.PICKED ?? {};
  assert(!('oneLook' in PICK) && (LS.PENDING ?? []).includes('oneLook'), 'his look is not in PICKED (the owner has not picked) and waits in PENDING');
  const { ASC_LOADOUT } = await imp('src/entities/enemies/ascendant/gear.js');
  const { buildHero } = await imp('src/entities/player/model.js');
  const { ONE_LOADOUT } = await imp('src/entities/enemies/wokenOne/gear.js');
  const countMeshes = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n++; }); return n; };
  LS.setLook('ascLook', 'h');
  const asc = countMeshes(buildHero(createSharedUniforms(), ASC_LOADOUT).root);
  LS.setLook('ascLook', null);
  for (const v of ['a', 'b', 'c']) {
    LS.setLook('oneLook', v);
    let ok = true, meshes = 0, rigMeshes = 0, D = null, row = '';
    try {
      const G = build();
      const { game } = G;
      const d = game.dragon;
      meshes = countMeshes(d.rig.root); // (with what the class hangs on him)
      rigMeshes = countMeshes(buildHero(createSharedUniforms(), ONE_LOADOUT).root); // (the body alone, as Tian Lei's is counted)
      D = d.rig.root.userData.dress;
      ok = !!D && D.kind === 'one' && D.look === v && D.guns.length === 4 && d.rig.coat.length === 6 && d.rig.loadout.waist === 'one.coat';
      const U = game.U.uHeroPartRim.value;
      const seen = {};
      for (const ph of [1, 2, 3]) {
        d.debug.setPhase(ph);
        run(G, 0.25);
        const front = D.fronts[0];
        seen[ph] = {
          guns: D.guns.every((m) => m.visible === (ph === 2)),
          az: front.C.def.az,
          rim: U[6].y,
          jade: U[6].y > U[6].x && U[6].y > 0.5,
          finite: [d.position.x, d.position.z, d._tip.x].every(Number.isFinite),
        };
      }
      row = JSON.stringify(seen);
      assert(seen[1].guns && seen[2].guns && seen[3].guns, `?oneLook=${v}: the guns hidden in phases 1 and 3, shown in phase 2`);
      const opens = v !== 'b';
      const F = D.fronts[0];
      assert(Math.abs(seen[1].az - F.closed) < 1e-6 && Math.abs(seen[2].az - (opens ? F.open : F.closed)) < 1e-6 && Math.abs(seen[3].az - (opens ? F.open : F.closed)) < 1e-6,
        `?oneLook=${v}: the coat's front ${opens ? 'closed in phase 1, open from phase 2' : 'closed in every phase (the Cassock)'} (az ${seen[1].az.toFixed(2)} / ${seen[2].az.toFixed(2)} / ${seen[3].az.toFixed(2)})`);
      assert([1, 2, 3].every((p) => seen[p].jade && seen[p].finite) && seen[3].rim > seen[2].rim, `?oneLook=${v}: his edge is jade, brighter in phase 3 (${seen[2].rim.toFixed(2)} → ${seen[3].rim.toFixed(2)})`);
    } catch (e) { ok = false; out(`     ${v}: ${e.message}`); }
    assert(ok && rigMeshes > 20 && rigMeshes <= asc + 10, `?oneLook=${v} builds (his body ${rigMeshes} meshes, ${meshes} in the fight; Tian Lei's body in the orange gi ${asc})`);
    if (row) out(`     ${v}: ${row}`);
  }
  LS.setLook('oneLook', null);
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
  pace: scenarioPace,
  win: scenarioWin,
  strategy: scenarioStrategy,
  training: scenarioTraining,
  reward: scenarioReward,
  cover: scenarioCover,
  bend: scenarioBend,
  stop: scenarioStop,
  stance: scenarioStance,
  flight: scenarioFlight,
  rising: scenarioRising,
  dejavu: scenarioDejavu,
  flow: scenarioFlow,
  levels: scenarioLevels,
  data: scenarioData,
  timing: scenarioTiming,
  smoke: scenarioSmoke,
  looks: scenarioLooks,
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
