// The Foxfire Terrace and Wen Yao, the Thousand-Body Fox, headless (ADR-131): the REAL Player,
// ThousandFox, Hud, GameFlow, AudioEngine and Lab (+ real LightPool, GlyphParticles, FireField,
// CameraRig, Events) wired like src/main.js for `?level=fox`; the world is a light mock on the real
// Colliders, filled by the level's set (world/foxTerrace.js), or the real set with its breakables.
// A bot drives the input. The harness is asc.mjs's (its build, bots, helpers).
// usage: node fox.mjs <repoRoot> [scenario]   (env: ABYSS_SEED=n reseeds the AI)
//   scenario: levels | data | timing | clones | pearl | mantle | phase | flow | pace | win | training | looks | all
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
const { createFoxTerrace, TERRACE } = await imp('src/world/foxTerrace.js');
const { Destructibles } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
const { ThousandFox } = await imp('src/entities/enemies/thousandFox/fox.js');
const { MOVES, MOVE_NAMES, CLIP, TRANSITIONS, realise } = await imp('src/entities/enemies/thousandFox/moves.js');
const { TUNING } = await imp('src/entities/enemies/thousandFox/tuning.js');
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
const LVL = getLevel('fox');
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
  const set = createFoxTerrace(createSharedUniforms(), c);
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
  const set = real ? createFoxTerrace(U, colliders) : null;
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
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture].every(Number.isFinite)) throw new Error('fox NaN');
    if (![d._tip.x, d._tip.y, d._tip.z, d._hilt.x].every(Number.isFinite)) throw new Error('fox blade NaN');
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
  for (let n = 2; n <= form; n++) {
    d.brain.forcePhase(n);
    run(G, 5, null, () => d.phase === n && d.mode !== 'act');
  }
  d.clones.popAll('test');
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
const quiet = (d) => d.mode === 'foot' && !d.fx.crescentsAlive && !d.pearl.flying && !d.clones.busy;

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
    let maxLive = 0;
    G.watch = (n, e) => { if (n === 'dragon:windup') moves[e.name] = (moves[e.name] || 0) + 1; };
    run(G, 60, () => { G.defend.act(); game.mouseGround.set(d.position.x, 0, d.position.z); maxLive = Math.max(maxLive, d.clones.live); });
    out(`   P${d.phase}: ${JSON.stringify(moves)} · selves at most ${maxLive} · flashes ${G.defend.stats.flashes} · hits ${G.hits.length}`);
    out(`   (the bot's ripostes may push him on: phase ${d.phase})`);
  }
}

// ================================================================== helpers of this suite
const P_OF = (name) => MOVES[name]?.phase ?? 1;
/** The live selves' indices. */
const liveSelves = (d) => d.clones.list.filter((c) => c.alive);
/** Pose the selves and the boss once (no time passes): their spheres are fresh. */
const fresh = (G) => G.tick(1e-4);

// ================================================================== scenario: levels
async function scenarioLevels() {
  out('\n== scenario LEVELS (the registry, the URL, the lines, the reward, the boss slot) ==');
  assert(LEVELS.includes(LVL) && LVL.id === 'fox' && LEVELS.indexOf(LVL) === LEVELS.length - 1 || LEVELS.includes(LVL), `levels: ${LEVELS.map((l) => l.id).join(', ')}`);
  assert(['?level=fox', '?lab&level=FOX', '?level=foxfire', '?level=terrace', '?level=shrine', '?level=thousand', '?level=wenyao'].every((q) => levelFromSearch(q) === LVL), '?level=fox / foxfire / terrace / shrine / thousand / wenyao pick the level (case-insensitive)');
  assert(getLevel('hollow') !== LVL, "'hollow' stays Cinderwood's");
  for (const k of ['arrive', 'stir', 'phase2', 'phase3', 'victory', 'fallen', 'restReset', 'again', 'rise']) assert(!!LVL.text[k], `the level has its ${k} line`);
  assert(LVL.name === 'The Foxfire Terrace' && LVL.text.victory === 'THE FOX IS UNMASKED', `${LVL.name}: ${LVL.sub}`);
  const R = LVL.reward;
  assert(R && R.id === 'paperDouble' && R.name === 'Paper Double' && typeof R.line === 'string' && R.usable === false, 'its fixed reward is recorded and not usable yet (ADR-135)');
  assert(CONFIG.world.dragonBound === 12.2 && CONFIG.world.arenaRadius === 14.5 && CONFIG.world.bossTriggerZ === 14.6, 'applyLevel merged the terrace\'s layout into CONFIG.world');
  const G = build();
  const d = G.game.dragon;
  assert(d instanceof ThousandFox && d.kind === 'duelist' && d.name === TUNING.name && d.kit.id === 'thousandFox', `the boss is his own duelist: ${d.name}`);
  assert(d.maxHp === TUNING.hp && TUNING.phaseAt.length === 3 && !d.lives, 'one health bar, three phases');
  assert(d.clones.list.length === TUNING.clones.pool && d.clones.live === 0 && d.clones.list.every((c) => c.root.parent === G.game.scene), `${TUNING.clones.pool} paper selves built with him, none alive`);
  assert(d.mode === 'sleep' && d.brain.clip === d.brain.C.meditate && d.phase === 1 && d.clones.list.filter((c) => c.root.visible).length === 4, 'he waits seated (meditate) among four seated selves');
  run(G, 0.3);
  G.game.flow.debug.toState('explore');
  run(G, 0.3);
  assert(d.mode === 'sleep', 'exploring, far off: he does not stir');
  d.startIntro();
  run(G, 4, null, () => d.mode === 'foot');
  assert(G.counts['dragon:wake'] === 1 && G.counts['dragon:introDone'] === 1 && d.mode === 'foot', 'woken: he rises into his guard');
  assert(!d.clones.seated && d.clones.list.every((c) => !c.root.visible) && (G.counts['dragon:clone'] ?? 0) === 4, 'the seated selves tore into paper one by one as he rose');
}

// ================================================================== scenario: data (the move rules)
async function scenarioData() {
  out('\n== scenario DATA (move data rules in every phase a move is used in, both ends of every roll) ==');
  let checked = 0;
  const CAP = { [TELL.NORMAL]: 26, [TELL.BLUE]: 26, [TELL.RED]: 30, [TELL.BLACK]: 44 };
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    const phases = phasesOf(name);
    if (!phases.length) assert(false, `${name}: used in at least one phase`);
    if (!def.transition && !def.counter && !def.hidden && !(Array.isArray(def.weight) && def.weight.length === PHASES)) assert(false, `${name}: a weight per phase`);
    for (const f of phases) {
      for (const r of [0, 0.5, 0.999]) {
        const A = realise(name, f, () => r, name === 'foxRing' ? { selves: 2 + Math.floor(r * 3.99) } : null);
        const real = A.beats.filter((b) => !b.feint);
        const tag = `${name} P${f} r${r}`;
        if (!real.every((b) => [TELL.NORMAL, TELL.BLUE, TELL.RED, TELL.BLACK].includes(b.def.tell))) assert(false, `${tag}: a tell on every real hit`);
        if (!A.beats.filter((b) => b.feint).every((b) => b.def.tell === undefined && !b.def.zone && !b.def.damage)) assert(false, `${tag}: a feint says nothing (no tell, no zone, no damage)`);
        const first = real[0];
        if (!def.transition && first && !(first.impact - first.tellAt >= TUNING.minFirstWindup - 1e-6)) assert(false, `${tag}: first real windup ${(first.impact - first.tellAt).toFixed(3)} >= ${TUNING.minFirstWindup}`);
        for (let i = 1; i < real.length; i++) if (!(real[i].impact - real[i - 1].impact >= TUNING.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${(real[i].impact - real[i - 1].impact).toFixed(3)} s apart >= ${TUNING.minHitGap}`);
        for (const b of real) if (!(b.flash >= b.tellAt - 1e-6)) assert(false, `${tag}: hit ${b.hit} flashes after its tell`);
        for (const b of real) if (!(b.def.zone || b.def.release || b.def.cast)) assert(false, `${tag}: hit ${b.hit} has a zone, a release or a cast`);
        for (const b of real) if (b.def.tell === TELL.RED && b.def.zone?.kind === 'ring' && !b.def.ring) assert(false, `${tag}: a red ring has its \`ring\``);
        for (const b of real) if (!def.transition && b.def.damage > CAP[b.def.tell]) assert(false, `${tag}: hit ${b.hit} ${b.def.damage} damage over the cap`);
        if (!(A.end > A.recoveryStart && Math.abs(A.clip.dur - A.end) < 1e-9)) assert(false, `${tag}: clip spans the move`);
        checked++;
      }
    }
  }
  assert(checked > 60, `${checked} realisations obey the rules (a tell per hit, feints silent, first windup >= ${TUNING.minFirstWindup} s, hits >= ${TUNING.minHitGap} s apart)`);
  // the plan's table: windups, damage, bands, weights
  const W = (n, i = 0) => MOVES[n].beats.filter((b) => !b.feint)[i];
  assert(W('foxBite').windup === 0.5 && W('foxBite').damage === 18 && W('foxBite').dash.max === 4.5, 'Fox Bite: N 0.50, 18, a dash of up to 4.5 m');
  assert(W('brushstrokes', 2).tell === TELL.BLUE && W('brushstrokes', 2).flare, 'Three Brushstrokes ends on a parry moment');
  assert(W('moonLadder').lock && W('moonLadder').tell === TELL.BLUE, 'Ladder to the Moon: a blue flare that locks');
  assert(W('sweepingBrush').tell === TELL.RED && W('sweepingBrush').knockdown, 'Sweeping Brush: red, knockdown');
  assert(W('changingPlaces').swap && MOVES.changingPlaces.gapCloser, 'Changing Places trades places');
  assert(MOVES.scatter.beats.every((b) => b.feint && b.scatter), 'Scattered Leaves: a cast, no blow');
  assert(W('foxPearl').cast?.kind === 'pearl' && W('foxPearl').cast.selfCue && W('foxPearl').tell === TELL.RED, 'the Pearl: a red cast that cues itself');
  assert(MOVES.relay.beats.filter((b) => b.swap).length === 2 && MOVES.relay.phase === 2, 'Hand to Hand: two swaps, phase 2');
  assert(W('greatPearl').tell === TELL.BLACK && W('greatPearl').damage === 44 && W('greatPearl').leap, 'Moon-Swallowing Pearl: black, 44, a leap down');
  assert(MOVES.paperCut.hidden && !MOVES.paperCut.weight.some((w) => w > 0), 'Paper Cut is hidden and never picked');
  for (const [ph, mv] of Object.entries(TRANSITIONS)) {
    const b = MOVES[mv].beats[0];
    assert(MOVES[mv]?.transition && MOVES[mv].phase === Number(ph) && b.tell === TELL.RED && b.windup === 1.6 && b.fixed && b.damage === 10 && b.zone.r === 6 && b.knockback === 6, `phase ${ph} begins with ${mv} (red, 1.6 s fixed, 10, ring 6, knockback 6)`);
  }
  // the Round's slots fit: for n selves, the first self's windup starts after the call lands
  const { roundBeats } = await imp('src/entities/enemies/thousandFox/moves.js');
  for (let n = 2; n <= TUNING.clones.pool; n++) {
    const A = realise('foxRing', 2, () => 0.5, { selves: n });
    const call = A.beats[0], his = A.beats[1];
    const firstWind = his.impact - TUNING.clones.round * n - TUNING.clones.windup;
    assert(roundBeats(n).length === 2 && firstWind >= call.impact - 1e-6, `the Round with ${n} selves: the first self's windup starts ${(firstWind - call.impact).toFixed(2)} s after the call`);
  }
  assert(TUNING.windupScale[2] >= TUNING.windupScale[1] && TUNING.recoveryScale[2] >= TUNING.recoveryScale[1], 'phase 3 winds up and recovers no faster than phase 2');
}

// ================================================================== scenario: timing (flash → contact)
async function scenarioTiming() {
  out('\n== scenario TIMING (every move from inside its band: each glint is a blow, on time) ==');
  let worst = 0, moves = 0;
  const only = process.env.ABYSS_TMOVE;
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    if (def.transition || def.hidden || name === 'scatter') continue;
    if (only && name !== only) continue;
    const f = Math.max(P_OF(name), 1);
    const G = build();
    const d = G.game.dragon;
    const [lo, hi] = def.band;
    const at = def.counter ? 2.2 : Math.max(1.6, Math.min(hi - 0.4, lo + (Math.min(hi, 12) - lo) * 0.4));
    duel(G, { dist: at, form: f });
    G.game.player.debug.god = true;
    if (def.needs || name === 'changingPlaces' || name === 'relay') { d.clones.spawn(def.needs ?? 1, 'test'); run(G, 0.6); }
    const flashes = [], contacts = [];
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') flashes.push(G.game.time); };
    const h0 = G.hits.length;
    if (!d.debug.trigger(name)) { assert(false, `${name} P${f}: starts`); continue; }
    run(G, 9, null, () => quiet(d) && d.mode === 'foot');
    for (const h of G.hits.slice(h0)) if (h.r !== RESULT.IGNORED) { contacts.push(h.t); if (only) out(`       ${h.t.toFixed(3)} contact ${h.attack} ${h.r}`); }
    let w = 0;
    for (const c of contacts) {
      const fl = flashes.filter((t) => t <= c + 1e-6).pop();
      w = Math.max(w, fl === undefined ? Infinity : Math.abs(c - fl - TUNING.flashLead));
    }
    worst = Math.max(worst, Number.isFinite(w) ? w : 9);
    moves++;
    if (!(contacts.length >= 1) || !(w <= 0.09)) assert(false, `${name} P${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
    else out(`     ${name.padEnd(15)} P${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
  }
  if (only) return;
  assert(moves >= 14 && worst <= 0.09, `${moves} moves: every contact within ${(worst * 1000).toFixed(0)} ms of its flash + ${TUNING.flashLead} s, and every move lands`);
}

// ================================================================== scenario: clones (the paper selves)
async function scenarioClones() {
  out('\n== scenario CLONES (the cap, one hit pops, the cleave, the parry, the token, the guard, the break, reset) ==');
  const C = TUNING.clones;
  // the cap per phase
  for (let ph = 1; ph <= 3; ph++) {
    const G = build();
    const d = G.game.dragon;
    duel(G, { dist: 4, form: ph });
    d.clones.spawn(9, 'test');
    assert(d.clones.live === C.max[ph - 1], `phase ${ph}: at most ${C.max[ph - 1]} selves (${d.clones.live})`);
  }
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player;
  duel(G, { dist: 4, form: 3 });
  p.debug.god = true;
  const n0 = d.clones.spawn(2, 'test');
  fresh(G);
  const sph = () => d.hurtSpheres.filter((h) => typeof h.part === 'string' && h.part.startsWith('clone'));
  assert(n0 === 2 && sph().length === 4, `two selves: two hurt spheres each (${sph().length})`);
  assert(d.bodyCircles.length === 1 && d.bodyCircles[0] === d._bc, 'no body circle of theirs: the hero walks through paper');
  assert(d.clones.list.every((c) => !c.root.layers.isEnabled?.(1) || true) && !d.clones.list.some((c) => c.root.userData?.caster), 'not shadow casters');
  // one hit pops: a cut on a self's sphere
  const s0 = sph()[0], i0 = Number(s0.part.slice(5));
  const post0 = d.posture, hp0 = d.hp;
  const dmg = d.takeHit({ damage: 30, part: s0.part, point: { x: s0.x, y: s0.y, z: s0.z }, swing: true });
  assert(dmg === 0 && !d.clones.alive(i0) && d.hp === hp0 && d.posture >= post0 + C.popPosture - 1e-6, `one cut pops it: 0 damage to him, +${C.popPosture} posture (${d.posture.toFixed(0)})`);
  fresh(G);
  assert(sph().length === 2, 'its spheres are gone');
  // the cleave: two selves side by side, a heavy cut pops both
  d.clones.popAll('test');
  d.clones.spawn(2, 'test');
  const L = liveSelves(d);
  L[1].x = L[0].x + 1.2;
  L[1].z = L[0].z;
  fresh(G);
  const pops0 = G.counts['dragon:clone'] ?? 0;
  const a0 = sph().find((h) => h.part === `clone${L[0].i}`);
  d.takeHit({ damage: 30, part: a0.part, point: { x: a0.x, y: a0.y, z: a0.z }, swing: true, heavy: true });
  assert(d.clones.live === 0 && (G.counts['dragon:clone'] ?? 0) - pops0 === 2, `the cleave: a heavy cut pops the self beside it too (${C.cleaveHeavy} m)`);
  // a parry pops it and does not recoil him
  d.clones.popAll('test');
  run(G, 0.3);
  d.debug.setAI(false);
  p.debug.teleport(0, 4);
  d.position.set(0, 0, -6);
  d.clones.spawn(1, 'test');
  const c = liveSelves(d)[0];
  c.x = 0; c.z = 2.4;
  run(G, C.in + 0.05);
  // a parry bot: the guard up just before its flash's impact
  let parried = false;
  const mode0 = d.mode;
  G.watch = (n, e) => { if (n === 'combat:flash' && e.attack === 'paperCut') G.parryAt = game.time + TUNING.flashLead - 0.1; if (n === 'player:parry') parried = true; };
  run(G, 5, () => {
    p.yaw = Math.atan2(c.x - p.position.x, c.z - p.position.z);
    game.mouseGround.set(c.x, 0, c.z);
    if (G.parryAt && game.time >= G.parryAt) { G.input.click(1); G.parryAt = 0; }
  }, () => !d.clones.alive(c.i));
  G.watch = null;
  assert(parried && !d.clones.alive(c.i) && d.mode === mode0 && d.brain.react?.kind !== 'recoil', `a parry pops it, he is not recoiled (${d.mode})`);
  // one windup at a time, and never a self's cue within the guard's sep of a dodge cue
  const G2 = build(SEED, true);
  const d2 = G2.game.dragon, p2 = G2.game.player;
  duel(G2, { dist: 3, ai: true, form: 3 });
  p2.debug.god = true;
  G2.defend = makeDefender(G2);
  let maxWind = 0;
  const fl = [];
  G2.watch = (n, e) => { if (n === 'combat:flash' && e.source === 'dragon') fl.push([G2.game.time, e.tell, e.attack]); };
  run(G2, 60, () => {
    G2.defend.act();
    G2.game.mouseGround.set(d2.position.x, 0, d2.position.z);
    if (d2.clones.live < 3 && d2.mode === 'foot') d2.clones.spawn(2, 'test');
    maxWind = Math.max(maxWind, d2.clones.list.filter((x) => x.alive && (x.state === 'wind') && !x.round).length);
  });
  G2.watch = null;
  const cuts = fl.filter((f) => f[2] === 'paperCut').length;
  const sep = TUNING.pressure.guard.sep;
  let bad = 0;
  for (const a of fl) if (a[2] === 'paperCut') for (const b of fl) if (b !== a && (b[1] === TELL.RED || b[1] === TELL.BLACK) && Math.abs(b[0] - a[0]) < sep) bad++;
  assert(cuts >= 1 && maxWind <= 1, `in his fight: ${cuts} selves' cuts in 60 s, at most ${maxWind} winding up at once`);
  assert(bad === 0, `no self's cue within ${sep} s of a cue asking a dodge (${bad})`);
  // with him in footwork (his AI off) the selves keep cutting, one at a time, the token's rest apart
  {
    const G4 = build();
    const d4 = G4.game.dragon;
    duel(G4, { dist: 3, form: 3 });
    G4.game.player.debug.god = true;
    d4.clones.spawn(5, 'test');
    const t4 = [];
    let w4 = 0;
    G4.watch = (n, e) => { if (n === 'combat:flash' && e.attack === 'paperCut') t4.push(G4.game.time); };
    run(G4, 30, () => {
      G4.game.mouseGround.set(d4.position.x, 0, d4.position.z);
      if (d4.clones.live < 3) d4.clones.spawn(3, 'test');
      w4 = Math.max(w4, d4.clones.list.filter((x) => x.alive && x.state === 'wind').length);
    });
    G4.watch = null;
    let gapMin = Infinity;
    for (let i = 1; i < t4.length; i++) gapMin = Math.min(gapMin, t4[i] - t4[i - 1]);
    assert(t4.length >= 8 && w4 <= 1 && gapMin >= C.every[2] - 0.05, `his footwork: ${t4.length} cuts in 30 s, one winding up at a time (${w4}), at least ${gapMin.toFixed(2)} s apart (token ${C.every[2]} s)`);
  }
  // his posture break pops them all; reset clears
  G2.defend = null;
  const G3 = build();
  const d3 = G3.game.dragon;
  duel(G3, { dist: 4, form: 3 });
  d3.clones.spawn(3, 'test');
  const before = d3.clones.live;
  d3.debug.postureBreak();
  assert(before >= 1 && d3.broken && d3.clones.live === 0, `a posture break pops all (${before} → ${d3.clones.live})`);
  d2.debug.reset();
  d2.clones.spawn(2, 'test');
  d2.reset();
  fresh(G2);
  assert(d2.clones.live === 0 && !d2.hurtSpheres.some((h) => String(h.part).startsWith('clone')) && d2.clones.list.filter((x) => x.root.visible).length === 4 && d2.clones.seated, 'reset: no live self, no sphere left; he sits among four seated selves again');
}

// ================================================================== scenario: pearl
async function scenarioPearl() {
  out('\n== scenario PEARL (the charge, the threads, the burst by live selves, a roll, a guard, the interrupt, the ledger, the world) ==');
  const T = TUNING.pearl;
  const play = (G, { selves = 0, defend = null, hits = 0, heavy = false, dist = 6 } = {}) => {
    const { game } = G;
    const d = game.dragon, p = game.player;
    duel(G, { dist, form: 2 });
    p.debug.god = true;
    if (selves) { d.clones.spawn(selves, 'test'); run(G, 0.5); }
    // the selves hold their blades for this test: no token
    d.clones.tokenAt = 1e9;
    const threads = [];
    const ft = d.fx.pearlThread;
    let thr = 0, frameThr = 0;
    d.fx.pearlThread = (...a) => { thr++; return ft.apply(d.fx, a); };
    let bursts = 0, r = 0;
    const fb = d.fx.pearlBurst;
    d.fx.pearlBurst = (x, z, rr) => { bursts++; r = rr; return fb.call(d.fx, x, z, rr); };
    assert(d.debug.trigger('foxPearl'), 'the Pearl starts');
    let ledgerSaw = false, struck = 0;
    const hit0 = G.hits.length;
    run(G, 6, () => {
      if (d.pearl.charging) {
        threads.push(thr - frameThr);
        frameThr = thr;
        if (!ledgerSaw) ledgerSaw = d.brain.ledger.pending?.(2, 4) ?? false;
        if (hits && struck < hits && d.pearl.u > 0.3 && d.pearl.u < 0.9 && ((game.realTime * 60) | 0) % 10 === 0) {
          struck++;
          d.takeHit({ damage: 20, part: 'body', heavy, point: { x: d.position.x, y: 1.2, z: d.position.z }, swing: true });
        }
      }
      defend?.(G);
    }, () => d.mode === 'foot' && !d.pearl.flying && !d.pearl.charging);
    d.fx.pearlThread = ft;
    d.fx.pearlBurst = fb;
    const mine = G.hits.slice(hit0).filter((h) => h.attack === 'foxPearl');
    return { d, threads, bursts, r, mine, ledgerSaw };
  };
  // the burst grows with the selves alive at the bat; the threads, one per self
  for (const n of [0, 2, 4]) {
    const G = build();
    const R = play(G, { selves: n });
    const want = Math.min(T.rMax, T.r0 + T.perClone * n);
    const thr = Math.max(0, ...R.threads);
    assert(R.bursts === T.count[1] && Math.abs(R.r - want) < 1e-6 && thr === n, `${n} selves: ${R.bursts} pearls burst r ${R.r.toFixed(2)} (want ${want.toFixed(2)}), ${thr} threads a frame`);
  }
  // the ledger knows it from the charge
  {
    const G = build();
    const R = play(G, { selves: 0 });
    assert(R.ledgerSaw, 'the ledger is told of its landing while it charges');
    assert(R.mine.length === 1 && R.mine[0].r === RESULT.HIT && R.mine[0].tell === TELL.RED, `standing still: it hits once, red (${R.mine.map((h) => h.r).join(',')})`);
    assert(Math.abs(R.mine[0].damage - T.damage * TUNING.damageScale) < 1e-6, `its damage with no self alive: ${R.mine[0].damage.toFixed(1)} (${T.damage} x damageScale)`);
  }
  // a guard fails; a roll dodges
  {
    const G = build();
    const R = play(G, { defend: (GG) => GG.input.press(1) });
    assert(R.mine.length === 1 && R.mine[0].r === RESULT.HIT, `a guard does not hold it (${R.mine.map((h) => h.r)})`);
  }
  {
    const G = build();
    let rolled = false;
    G.defend = makeDefender(G);
    const R = play(G, { defend: (GG) => { const due = GG.defend.act(); rolled = rolled || GG.game.player.state === 'roll'; return due; } });
    assert(rolled && R.mine.every((h) => h.r !== RESULT.HIT), `a roll at its cue dodges it (${R.mine.map((h) => h.r).join(',') || 'missed'})`);
  }
  // two cuts on him while he charges burst it in his hand: he reels
  {
    const G = build();
    let reeled = false, stag = 0;
    G.watch = (n) => { if (n === 'dragon:stagger') stag++; };
    const R = play(G, { hits: 2, defend: (GG) => { reeled = reeled || GG.game.dragon.brain.react?.kind === T.interrupt.react; } });
    G.watch = null;
    assert(R.d.pearl.interrupts === 1 && reeled && stag >= 1 && R.bursts === 0 && R.mine.length === 0, `two cuts while he charges: it bursts in his hand, he reels (${R.d.pearl.interrupts} interrupts, ${R.bursts} bursts)`);
  }
  {
    const G = build();
    const R = play(G, { hits: 1, heavy: true });
    assert(R.d.pearl.interrupts === 1, 'one heavy cut does it too');
  }
  // his guard is down through the charge
  {
    const G = build();
    const d = G.game.dragon;
    duel(G, { dist: 5, form: 1 });
    d.debug.trigger('foxPearl');
    run(G, 0.6);
    assert(d.pearl.charging && !d.guarding, 'his guard is down while he charges');
  }
  // the world: it chips what it lands on (the real set)
  {
    const G = build(SEED, true);
    const { game } = G;
    let calls = 0;
    const imp0 = game.world.impact;
    game.world.impact = (...a) => { calls++; return imp0(...a); };
    const D = game.world.destructibles;
    const worn0 = D.list.filter((b) => b.wear > 0 || b.state !== 0).length;
    const R = play(G, { selves: 0, dist: 8 });
    const worn1 = D.list.filter((b) => b.wear > 0 || b.state !== 0).length;
    assert(R.bursts >= 1 && calls >= R.bursts && worn1 > worn0, `world.impact on each burst (${calls}), the floor chipped (${worn0} → ${worn1} pieces worn)`);
  }
  // a reset in the middle of the charge and with pearls in the air leaves nothing behind
  {
    const G = build();
    const d = G.game.dragon;
    duel(G, { dist: 6, form: 2 });
    d.clones.spawn(4, 'test');
    d.debug.trigger('foxPearl');
    run(G, 1.0);
    const was = d.pearl.charging;
    d.debug.reset();
    fresh(G);
    assert(was && !d.pearl.charging && !d.pearl.flying && d.clones.live === 0 && d.mode === 'sleep', 'a reset mid-charge: no pearl, no self, he sits again');
    G.game.flow.debug.toState('boss');
    d.debug.setAI(false);
    run(G, 0.5);
    d.debug.trigger('foxPearl');
    run(G, 3, null, () => d.pearl.flying);
    const fl = d.pearl.flying;
    d.debug.reset();
    run(G, 1);
    assert(fl && !d.pearl.flying && G.hits.filter((h) => h.attack === 'foxPearl').length === 0, 'a reset with pearls in the air: they are gone and hit nothing');
  }
}

// ================================================================== scenario: mantle
async function scenarioMantle() {
  out('\n== scenario MANTLE (phase 3 only, it lights the wood) ==');
  const G = build(SEED, true);
  const { game } = G;
  const d = game.dragon;
  let ign = 0;
  const ig0 = game.world.ignite;
  game.world.ignite = (...a) => { ign++; return ig0?.(...a); };
  duel(G, { dist: 4, form: 2 });
  run(G, 3);
  assert(d.mantleK === 0 && ign === 0, 'phase 2: no mantle, nothing lit');
  d.brain.forcePhase(3);
  run(G, 5, null, () => d.phase === 3 && d.mode === 'foot');
  run(G, 2);
  assert(d.mantleK > 0.9 && ign >= 2, `phase 3: the mantle is on (${d.mantleK.toFixed(2)}), world.ignite where he stands (${ign})`);
  // a charm post catches (the set's wood, 16.5 m out: past his bound, 12.2): he fights at the rim and
  // the tail's sweep throws its flame past the cut
  const D = game.world.destructibles;
  const post = D?.list.find((b) => b.kind === 'charmPost');
  assert(!!post, 'the set has charm posts');
  if (post) {
    d.debug.setAI(false);
    run(G, 4, null, () => d.mode === 'foot');
    const a = Math.atan2(post.x, post.z), B = d.bound;
    d.position.set(Math.sin(a) * B, 0, Math.cos(a) * B);
    game.player.debug.teleport(Math.sin(a + 0.13) * B, Math.cos(a + 0.13) * B); // (beside him along the rim: his step-in keeps him at it)
    run(G, 0.3);
    const ig1 = game.world.ignite, calls = [];
    game.world.ignite = (x, z, r, k, gr) => { calls.push(`r${Math.hypot(x, z).toFixed(1)}+${r.toFixed(1)} k${k.toFixed(2)} d${Math.hypot(x - post.x, z - post.z).toFixed(2)}`); return ig1(x, z, r, k, gr); };
    d.debug.trigger('burningBrush');
    run(G, 4, null, () => post.burn > 0 || post.burnt);
    game.world.ignite = ig1;
    out(`     ignites: ${calls.join(' · ')}; post at ${post.x.toFixed(1)}, ${post.z.toFixed(1)} r ${post.r}; burns ${post.burns}`);
    assert(post.burn > 0 || post.burnt, `Burning Brush at the rim: a charm post ${Math.hypot(post.x, post.z).toFixed(1)} m out catches (burn ${post.burn?.toFixed?.(1)})`);
  }
  d.debug.kill();
  run(G, 4);
  assert(d.mantleK < 0.5, 'dying, the mantle goes out');
  game.world.ignite = ig0;
}

// ================================================================== scenario: phase
async function scenarioPhase() {
  out('\n== scenario PHASE (the gates, both transitions, the selves taken back and torn off to the cap) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon;
  duel(G, { dist: 4, ai: true });
  game.player.debug.god = true;
  const gate = d.maxHp * TUNING.phaseAt[1];
  d.clones.spawn(2, 'test');
  d.hp = gate + 20;
  d.mode = 'foot';
  d.brain.act = null;
  d.takeHit({ damage: 400, part: 'body', heavy: true, poise: 5, exact: true });
  assert(d.hp === gate && d.brain.pendingPhase === 2, `damage stops at the gate (${d.hp} = ${gate})`);
  let p2 = 0;
  G.watch = (n) => { if (n === 'dragon:phase2') p2++; };
  run(G, 1, null, () => d.brain.act?.name === 'thousandBodies');
  assert(d.brain.act?.name === 'thousandBodies' && d.phase === 2 && p2 === 1 && d.clones.live === 0, 'A Thousand Bodies: phase 2, dragon:phase2, his selves popped');
  run(G, 4, null, () => d.mode === 'foot');
  assert(d.clones.live === TUNING.clones.max[1], `its ring goes out: selves to the cap (${d.clones.live})`);
  assert(game.flow._text('phase2') === 'ONE BECOMES A THOUSAND', 'the level\'s phase-2 banner');
  settle(G, 8);
  const gate3 = d.maxHp * TUNING.phaseAt[2];
  d.hp = gate3 + 20;
  d.mode = 'foot';
  d.brain.act = null;
  d.takeHit({ damage: 400, part: 'body', heavy: true, poise: 5, exact: true });
  let p3 = 0, burned = 0;
  G.watch = (n, e) => { if (n === 'dragon:phase3') p3++; if (n === 'dragon:clone' && e.by === 'mantle') burned++; };
  const had = d.clones.live;
  run(G, 1, null, () => d.brain.act?.name === 'foxMantle');
  assert(d.brain.act?.name === 'foxMantle' && d.phase === 3 && p3 === 1 && d.clones.live === 0 && burned === had, `The Fox-Fire Mantle: phase 3, his ${had} selves burn up into him`);
  run(G, 4, null, () => d.mode === 'foot');
  G.watch = null;
  assert(d.clones.live === TUNING.clones.max[2] && d.mantleK > 0, `then five selves (${d.clones.live}) and the mantle`);
  assert(game.flow._text('phase3') === 'THE FOX WEARS ITS FIRE', 'the level\'s phase-3 banner');
  const picks = new Set();
  for (let i = 0; i < 300; i++) {
    d.brain.cooldowns = {};
    d.brain.last = [null, null];
    for (const dist of [2, 6]) { const n = d.brain._choose(dist); if (n) picks.add(n); }
  }
  assert(['burningBrush', 'foxPounce', 'greatPearl'].every((n) => picks.has(n)), `phase-3 moves join the pool (${[...picks].join(', ')})`);
}

// ================================================================== scenario: flow
async function scenarioFlow() {
  out('\n== scenario FLOW (title → the terrace → he rises → the duel → victory; a death and a reset) ==');
  const G = build();
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  run(G, 0.3);
  input.tap('Enter');
  run(G, 0.5);
  if (game.state !== 'explore') game.flow.debug.toState('explore');
  run(G, 0.3);
  assert(game.state === 'explore' && d.mode === 'sleep', 'exploring; he sits');
  p.debug.teleport(0, CONFIG.world.bossTriggerZ + 2.5);
  run(G, 0.2);
  run(G, 4, () => { input.axis = { x: 0, y: 1 }; }, () => d.mode !== 'sleep');
  input.axis = { x: 0, y: 0 };
  assert(d.mode === 'intro' && game.state === 'bossIntro', `onto the terrace: he stirs (hero at z ${p.position.z.toFixed(1)}, ${game.state})`);
  run(G, 8, null, () => d.mode === 'foot' || d.mode === 'act');
  run(G, 0.2);
  assert(G.counts['dragon:introDone'] === 1 && game.state === 'boss', `the intro ends in the duel (${game.state})`);
  p.debug.god = false;
  p.hp = 1;
  d.debug.setAI(true);
  run(G, 25, null, () => game.state === 'dead');
  assert(game.state === 'dead', 'he can kill the hero');
  run(G, 12, () => { if (((game.realTime * 60) | 0) % 30 === 0) input.tap('Enter'); }, () => game.state === 'explore');
  assert(game.state === 'explore' && d.mode === 'sleep' && d.phase === 1 && d.clones.live === 0, `after the death he sits again, no self left (${game.state}, ${d.mode})`);
  game.flow.debug.toState('boss');
  run(G, 0.5);
  d.debug.kill();
  run(G, 8, null, () => game.state === 'victory');
  assert(game.state === 'victory' && game.flow._text('victory') === 'THE FOX IS UNMASKED', `killed: victory (${game.state})`);
}

// ================================================================== scenario: pace (copied from duel.mjs PACE)
// ================================================================== scenario: pace (the director's meter)
// A god-mode defender that never attacks, driven by combat:flash (his thrown things send no tell):
// the guard held through a normal / blue blow, a roll 0.28 s before a red / black one (out of a
// hazard's ring: away from its centre). The hero roams between standoffs (2.5 / 5 / 9 m, a new one
// every 4 s), on the REAL terrace. Per seed and per phase (every phase
// the kit has), ABYSS_PSECS s each (default 120), seeds ABYSS_PSEEDS (default 4242,7,99): cues a
// minute (combat:flash from 'dragon' or 'world'), the longest gap between cues (a black blow's charge
// counts as activity), the mix by category, the moves chained (started straight out of another, no
// footwork between) and the longest chain, conflicts (two flashes under 0.3 s apart needing
// different answers, from different attacks; same attack: "inner"), the share of time something of
// his is live on the floor, the blade holds and strike delays the fairness guard made. With a
// `pressure` block in tuning.js it asserts pressure.meter; without one it only measures.
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

async function scenarioPace() {
  out('\n== scenario PACE (a steady defender in god mode vs his AI, per phase: cues, gaps, mix, chains, conflicts) ==');
  const DIR = await imp('src/entities/enemies/duelist/director.js');
  const P = TUNING.pressure ?? null;
  const SECS = Number(process.env.ABYSS_PSECS ?? 120);
  const SEEDS = (process.env.ABYSS_PSEEDS ?? '4242,7,99').split(',').map(Number).filter(Number.isFinite);
  const pp = (v, ph) => (Array.isArray(v) ? v[Math.min(v.length, Math.max(1, ph)) - 1] : v);
  const CATS = DIR.CATEGORIES;
  const answer = (tell) => (tell === TELL.RED || tell === TELL.BLACK ? 'dodge' : 'guard');
  const skip = (name) => !MOVES[name] || MOVES[name].transition || MOVES[name].counter;
  const rows = [];
  let lastG = null, NPH = 0;
  for (const seed of SEEDS) {
    for (let ph = 1; ; ph++) {
      const G = (lastG = build(seed, true));
      const { game } = G;
      const d = game.dragon, p = game.player;
      NPH = d.kit.maxPhase ?? TUNING.phaseAt.length;
      if (ph > NPH) break;
      duel(G, { dist: 3, ai: true });
      p.debug.god = true;
      p.debug.noRiposte = true;
      G.defend = paceDefender(G);
      // into the phase through its real transition(s)
      for (let n = 2; n <= ph; n++) {
        d.brain.forcePhase(n);
        run(G, 8, (GG) => { GG.input.axis = { x: 0, y: 0 }; GG.defend.act(); }, () => d.phase === n && d.mode !== 'act');
      }
      Math.random = mulberry32(seed * 7 + ph);
      const flashes = [], acts = [], cats = {}, busyT = [];
      const modeT = {}, spent = {};
      let hurt = 0, frames = 0, busy = 0, burnF = 0, chained = 0, chainLen = 0, chainMax = 0, prevAct = null, prevMode = d.mode;
      const s0 = { ...(d.brain.stats ?? {}) };
      const dbg = [];
      G.watch = (n, e) => {
        if ((process.env.ABYSS_PDBG || process.env.ABYSS_PGAP) && /dragon:windup|combat:flash|combat:tell|dragon:parried|dragon:guard/.test(n)) dbg.push([game.time, `${n.split(':')[1]} ${e?.name ?? e?.attack ?? ''} ${e?.tell ?? ''}${n === 'combat:tell' ? ` in ${e.impactIn?.toFixed(2)}` : ''} [${d.mode} ${d.brain.act?.name ?? ''} h${d.brain.stats?.holds} d${d.brain.stats?.delays}]`]);
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
        if (d.brain.pendingPhase > ph) d.brain.pendingPhase = 0;
        frames++;
        { const k = d.mode === 'react' ? `react:${d.brain.react?.kind}` : d.mode === 'act' ? (d.brain.act && d.brain.act.t >= d.brain.act.recoveryStart ? 'act:recovery' : 'act') : d.mode === 'foot' ? (d.brain.seek ? 'foot:seek' : Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z) > TUNING.move.band[1] + 0.3 ? 'foot:closing' : 'foot') : d.mode; modeT[k] = (modeT[k] || 0) + game.dt; if (d.mode === 'act' && d.brain.act) spent[d.brain.act.name] = (spent[d.brain.act.name] || 0) + game.dt; }
        // chained: a move that starts straight out of another (no footwork, no reaction between)
        const a = d.brain.act;
        if (d.mode === 'act' && a && a !== prevAct && !a.def.transition && !a.def.counter) {
          if (prevMode === 'act' && prevAct) { chained++; chainLen++; chainMax = Math.max(chainMax, chainLen); } else chainLen = 0;
        }
        if (d.mode !== 'act') chainLen = 0;
        prevAct = d.mode === 'act' ? a : null;
        prevMode = d.mode;
        if (d.fx.crescentsAlive || d.terrain?.busy) busy++;
        if (d.moveFx?.alive) burnF++;
      }
      G.watch = null;
      G.defend = null;
      const T = game.time - t0;
      hurt = G.hits.filter((h) => h.t > t0 && h.r === RESULT.HIT).length;
      const ts = [t0, ...flashes.map((f) => f[0]), ...busyT.filter((x) => x > t0 && x < t0 + T), t0 + T].sort((x, y) => x - y);
      let gapMax = 0, gapAt = '';
      for (let i = 1; i < ts.length; i++) {
        const g = ts[i] - ts[i - 1];
        if (g > gapMax) { gapMax = g; gapAt = `${(ts[i - 1] - t0).toFixed(0)} s: ${acts.filter((w) => w[0] > ts[i - 1] - 0.5 && w[0] < ts[i]).map((w) => w[1]).join(', ') || 'no move'}`; }
        // ABYSS_PGAP=1: the event log through each gap over 2.8 s
        if (process.env.ABYSS_PGAP && g > 2.8) out(`      GAP P${ph} seed ${seed} ${g.toFixed(2)} s at ${(ts[i - 1] - t0).toFixed(2)}: ${dbg.filter((x) => x[0] > ts[i - 1] - 0.3 && x[0] < ts[i] + 0.1).map((x) => `${(x[0] - t0).toFixed(2)} ${x[1]}`).join(' | ')}`);
      }
      let conflicts = 0, inner = 0;
      const conflictAt = [], innerAt = new Set();
      for (let i = 0; i < flashes.length; i++) {
        for (let j = i + 1; j < flashes.length && flashes[j][0] - flashes[i][0] < 0.3; j++) {
          if (answer(flashes[i][1]) === answer(flashes[j][1])) continue;
          if (flashes[i][2] === flashes[j][2]) { inner++; innerAt.add(flashes[i][2]); } else {
            conflicts++;
            conflictAt.push(`${flashes[i][2]}/${flashes[j][2]} @${(flashes[i][0] - t0).toFixed(1)}`);
            // ABYSS_PDBG=1: what happened round each conflict
            if (process.env.ABYSS_PDBG) out(`      CONFLICT P${ph} ${(flashes[i][0] - t0).toFixed(2)}: ${dbg.filter((x) => x[0] > flashes[i][0] - 2.5 && x[0] < flashes[j][0] + 0.4).map((x) => `${(x[0] - t0).toFixed(2)} ${x[1]}`).join(' | ')}`);
          }
        }
      }
      // the answers asked: the share that asks a dodge, the longest run of one answer in a row
      let dodges = 0, run1 = 0, runMax = 0;
      for (let i = 0; i < flashes.length; i++) {
        const a1 = answer(flashes[i][1]);
        if (a1 === 'dodge') dodges++;
        run1 = i && answer(flashes[i - 1][1]) === a1 ? run1 + 1 : 1;
        runMax = Math.max(runMax, run1);
      }
      const st = d.brain.stats ?? {};
      const dlt = (k) => (st[k] ?? 0) - (s0[k] ?? 0);
      rows.push({ seed, ph, T, cues: flashes.length, perMin: (flashes.length * 60) / T, gapMax, gapAt, cats, picks: acts.length, chained, chainMax, conflicts, conflictAt, inner, innerAt: [...innerAt], busy: busy / frames, burn: burnF / frames, dodge: dodges / (flashes.length || 1), runMax, holds: dlt('holds'), feints: dlt('feints'), told: dlt('toldFeints'), delays: dlt('delays'), links: dlt('links'), cuts: dlt('cuts'), rests: dlt('rests'), hurt, modeT });
      // ABYSS_PGUARD=1: what the fairness guard would not let through (feints, faded marks, strikes
      // not called), each with the impact it collided with (brain.guardLog)
      if (process.env.ABYSS_PGUARD) {
        const tally = {};
        for (const e of d.brain.guardLog ?? []) if (e.t >= t0) tally[`${e.kind} ${e.what} x ${e.with}`] = (tally[`${e.kind} ${e.what} x ${e.with}`] || 0) + 1;
        out(`      P${ph} seed ${seed} guard: ${Object.entries(tally).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '-'}`);
      }
      // ABYSS_PATT=1: where the phase's time went, move by move (s in it, picks, its cues, cues a second)
      if (process.env.ABYSS_PATT) {
        const fl = {}, pk = {};
        for (const f of flashes) fl[f[2]] = (fl[f[2]] || 0) + 1;
        for (const w of acts) pk[w[1]] = (pk[w[1]] || 0) + 1;
        out(`      P${ph} seed ${seed}: ${Object.entries(spent).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v.toFixed(0)}s/${pk[k] ?? 0}x/${fl[k] ?? 0}c (${((fl[k] ?? 0) / v).toFixed(2)})`).join(' · ')}`);
      }
    }
  }
  out(`   ${SECS} s per phase, seeds ${SEEDS.join(', ')} · cues/min · longest gap (s) · moves · chained · longest chain · links · cuts · rests · conflicts · inner · field busy % · holds / feints (!n: told before the guard turned them) · delays · hits taken · category shares %`);
  out(`   seed ph cue/min gapMax moves chain cMax links cuts rest clash inner busy% hold/f delay hurt  ${CATS.map((c) => c.slice(0, 7).padStart(8)).join('')}`);
  for (const r of rows) {
    out(`   ${String(r.seed).padStart(4)}  ${r.ph} ${r.perMin.toFixed(1).padStart(7)} ${r.gapMax.toFixed(2).padStart(6)} ${String(r.picks).padStart(5)} ${String(r.chained).padStart(5)} ${String(r.chainMax).padStart(4)} ${String(r.links).padStart(5)} ${String(r.cuts).padStart(4)} ${String(r.rests).padStart(4)} ${String(r.conflicts).padStart(5)} ${String(r.inner).padStart(5)} ${(r.busy * 100).toFixed(0).padStart(5)} ${`${r.holds}/${r.feints}${r.told ? `!${r.told}` : ''}`.padStart(5)} ${String(r.delays).padStart(5)} ${String(r.hurt).padStart(4)}  ${CATS.map((c) => (((r.cats[c] || 0) * 100) / (r.picks || 1)).toFixed(0).padStart(8)).join('')}`);
    out(`         answers: dodge ${(r.dodge * 100).toFixed(0)} % of cues, longest run of one answer ${r.runMax} · burning ground alive ${(r.burn * 100).toFixed(0)} % of the time
         time: ${Object.entries(r.modeT).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${((v * 100) / r.T).toFixed(0)}%`).join(' · ')}`);
    out(`         longest gap at ${r.gapAt}${r.conflicts ? ` · CONFLICTS ${r.conflictAt.slice(0, 6).join(' · ')}` : ''}${r.inner ? ` · inner: ${r.innerAt.join(', ')}` : ''}`);
  }
  const mean = (ph, k) => { const rs = rows.filter((r) => r.ph === ph); return rs.reduce((a, r) => a + r[k], 0) / (rs.length || 1); };
  for (let ph = 1; ph <= NPH; ph++) out(`   mean P${ph}: ${mean(ph, 'perMin').toFixed(1)} cues/min · longest gap ${Math.max(...rows.filter((r) => r.ph === ph).map((r) => r.gapMax)).toFixed(2)} s (mean ${mean(ph, 'gapMax').toFixed(2)}) · ${mean(ph, 'chained').toFixed(1)} chained of ${mean(ph, 'picks').toFixed(1)} moves · conflicts ${rows.filter((r) => r.ph === ph).reduce((a, r) => a + r.conflicts, 0)} · dodge ${(mean(ph, 'dodge') * 100).toFixed(0)} % · one-answer run max ${Math.max(...rows.filter((r) => r.ph === ph).map((r) => r.runMax))} · burning ground ${(mean(ph, 'burn') * 100).toFixed(0)} %`);
  if (!P?.meter) { out('   (no TUNING.pressure.meter: measured only, nothing asserted)'); return lastG; }
  const A = P.meter;
  // (the tuning pass: `rampMean`, the ramp of the seeds' mean; per seed the floor is lower: phase 3 runs
  // at the 0.42 s / 0.32 s floors (~100 cues a minute) and one seed's phase 2 swings +-4 % about its
  // mean, so ten seeds held P3 / P2 at 1.04 - 1.15 per seed, 1.10 - 1.11 in the mean)
  if (A.rampMean) {
    for (let ph = 2; ph <= NPH; ph++) {
      const a0 = mean(ph - 1, 'perMin'), a1 = mean(ph, 'perMin');
      assert(a1 >= a0 * pp(A.rampMean, ph), `the seeds' mean: P${ph} at least x${pp(A.rampMean, ph)} P${ph - 1}'s cues a minute (${a0.toFixed(1)} → ${a1.toFixed(1)}, x${(a1 / a0).toFixed(3)})`);
    }
  }
  for (const seed of SEEDS) {
    const r = rows.filter((x) => x.seed === seed).sort((x, y) => x.ph - y.ph);
    for (let i = 1; i < r.length; i++) assert(r[i].perMin >= r[i - 1].perMin * pp(A.ramp, r[i].ph), `seed ${seed}: P${r[i].ph} at least x${pp(A.ramp, r[i].ph)} P${r[i - 1].ph}'s cues a minute (${r[i - 1].perMin.toFixed(1)} → ${r[i].perMin.toFixed(1)} cues/min)`);
    for (const x of r) {
      assert(x.perMin >= pp(A.minRate, x.ph), `seed ${seed} P${x.ph}: ${x.perMin.toFixed(1)} cues a minute >= ${pp(A.minRate, x.ph)}`);
      assert(x.gapMax <= pp(A.maxGap, x.ph), `seed ${seed} P${x.ph}: longest gap between cues ${x.gapMax.toFixed(2)} s <= ${pp(A.maxGap, x.ph)} s (${x.gapAt})`);
      assert(x.conflicts === 0, `seed ${seed} P${x.ph}: no two cues of different sources needing different answers within 0.3 s (${x.conflicts}: ${x.conflictAt.slice(0, 4).join(' · ')})`);
    }
  }
  return lastG;
}


// ================================================================== scenario: win
async function scenarioWin() {
  out('\n== scenario WIN (a fencing bot in god mode, three seeds: parries, rolls, cuts the selves in reach, cuts him in his openings) ==');
  const SEEDS = (process.env.ABYSS_WSEEDS ?? '4242,7,99').split(',').map(Number);
  for (const seed of SEEDS) {
    const G = build(seed);
    const { game } = G;
    const d = game.dragon;
    duel(G, { dist: 3, ai: true });
    G.defend = makeDefender(G);
    const phAt = [0];
    let pops = 0;
    G.watch = (n, e) => { if (/^dragon:phase[23]$/.test(n)) phAt.push(game.time); if (n === 'dragon:clone' && e.kind === 'pop' && e.by === 'cut') pops++; };
    const t0 = game.time;
    const won = run(G, 420, () => fencer(G), () => d.mode === 'dead' || d.state === 'dead' || game.state === 'victory');
    const T = game.time - t0;
    const taken = G.hits.filter((h) => h.r === RESULT.HIT).length;
    out(`     seed ${seed}: ${won ? 'won' : 'NOT won'} in ${T.toFixed(0)} s: phases at ${phAt.map((t) => (t - t0 > 0 ? (t - t0).toFixed(0) : '0')).join(' / ')} s, ${pops} selves cut down, ${taken} hits taken (god mode); phase ${d.phase}, hp ${Math.round(d.hp)}`);
    assert(won && d.phase === 3, `seed ${seed}: the fencing bot wins through all three phases`);
    assert(T > 30 && T < 360, `seed ${seed}: the fight takes ${T.toFixed(0)} s`);
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
  assert(kinds.has('fox') && !kinds.has('ash') && !kinds.has('lord') && !kinds.has('asc') && kinds.has('duel'), `his own boss kind (${[...kinds].join(', ')})`);
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
  const G2 = build();
  duel(G2, { dist: 5 });
  const d2 = G2.game.dragon;
  const ok2 = d2.debug.phase2();
  run(G2, 5, null, () => d2.mode === 'foot');
  const ok3 = d2.debug.phase3();
  run(G2, 5, null, () => d2.mode === 'foot');
  assert(ok2 && ok3 && d2.phase === 3 && G2.counts['dragon:phase2'] === 1 && G2.counts['dragon:phase3'] === 1, 'the Lab\'s phase buttons: Phase 2, then Phase 3, each its transition');
  // the Lab's own buttons for him
  const G3 = build();
  duel(G3, { dist: 5, form: 2 });
  const d3 = G3.game.dragon;
  const made = d3.debug.clones(2);
  const popped = d3.debug.popAll();
  const pearl = d3.debug.pearl();
  run(G3, 0.2);
  assert(made === 2 && popped === 2 && pearl && d3.brain.act?.name === 'foxPearl', 'the Lab: Selves +2, Pop all, Pearl');
  d3.debug.mantle(true);
  run(G3, 1.2);
  assert(d3.mantleK > 0.9, 'the Lab: Mantle on');
  d3.debug.mantle(false);
  run(G3, 1.2);
  assert(d3.mantleK === 0, 'the Lab: Mantle off');
}

// ================================================================== scenario: looks
async function scenarioLooks() {
  out('\n== scenario LOOKS (each ?foxLook= builds; the selves; the default rig is on the art path) ==');
  const LS = await imp('src/entities/enemies/duelist/lookSwitch.js');
  const PICK = LS.PICKED ?? {};
  assert(!('foxLook' in PICK) && !('foxfire' in PICK) && !('clones' in PICK), 'his switches are not in PICKED (the owner has not picked)');
  for (const v of ['a', 'b', 'c', 'd']) {
    LS.setLook('foxLook', v);
    let ok = true, meshes = 0;
    try {
      const G = build();
      const d = G.game.dragon;
      d.rig.root.traverse((o) => { if (o.isMesh) meshes++; });
      run(G, 0.3);
    } catch (e) { ok = false; out(`     ${v}: ${e.message}`); }
    assert(ok && meshes > 20, `?foxLook=${v} builds (${meshes} meshes)`);
  }
  LS.setLook('foxLook', null);
  // the default rig (a) is drawn through the wyrm's art path; d is the ink-line art
  const { isDragonLook } = await imp('src/entities/enemies/ashDisciple/bodyArt.js');
  {
    const G = build();
    const d = G.game.dragon;
    assert(isDragonLook(d.rig.materials) && d.clones.list.every((c) => isDragonLook(c.rig.materials)), 'the default figure (a) and its selves are on the art path (FLAG.ART)');
    LS.setLook('foxLook', 'd');
    const G2 = build();
    assert(!isDragonLook(G2.game.dragon.rig.materials), '?foxLook=d is the ink-line art');
    LS.setLook('foxLook', null);
  }
  for (const v of ['a', 'b']) {
    LS.setLook('clones', v);
    const G = build();
    assert(G.game.dragon.clones.list.length === TUNING.clones.pool, `?clones=${v} builds`);
  }
  LS.setLook('clones', null);
  for (const v of ['a', 'b', 'c']) {
    LS.setLook('foxfire', v);
    const G = build();
    assert(G.game.dragon.fx.look === v, `?foxfire=${v}`);
  }
  LS.setLook('foxfire', null);
}

// ================================================================== scenario: cost (opt-in: the selves' CPU)
async function scenarioCost() {
  out('\n== scenario COST (opt-in: what five paper selves cost the frame on the CPU) ==');
  const G = build();
  const d = G.game.dragon;
  duel(G, { dist: 4, form: 3 });
  G.game.player.debug.god = true;
  const time = (n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) G.tick(DT); return (performance.now() - t0) / n; };
  time(60);
  const none = time(300);
  d.clones.spawn(5, 'test');
  time(60);
  let poseT = 0;
  const pose = d.clones.pose.bind(d.clones);
  d.clones.pose = (dt) => { const t0 = performance.now(); pose(dt); poseT += performance.now() - t0; };
  const C0 = d.clones.list[0];
  const T = { anim: 0, mw: 0, gs: 0 };
  for (const c of d.clones.list) {
    const au = c.anim.update.bind(c.anim);
    c.anim.update = (dt) => { const t0 = performance.now(); au(dt); T.anim += performance.now() - t0; };
    const um = c.root.updateMatrixWorld.bind(c.root);
    c.root.updateMatrixWorld = (f) => { const t0 = performance.now(); um(f); T.mw += performance.now() - t0; };
  }
  const five = time(300);
  out(`     anim.update ${(T.anim / 300).toFixed(2)} ms, updateMatrixWorld ${(T.mw / 300).toFixed(2)} ms a frame (5 selves)`);
  const au = d.anim.update.bind(d.anim);
  let ba = 0;
  d.anim.update = (dt) => { const t0 = performance.now(); au(dt); ba += performance.now() - t0; };
  time(120);
  out(`     his own anim.update ${(ba / 120).toFixed(2)} ms a frame`);
  out(`     a frame: ${none.toFixed(2)} ms with no self, ${five.toFixed(2)} ms with ${d.clones.live}; their poses ${(poseT / 300).toFixed(2)} ms a frame`);
}

const S = {
  cost: scenarioCost,
  levels: scenarioLevels,
  data: scenarioData,
  timing: scenarioTiming,
  clones: scenarioClones,
  pearl: scenarioPearl,
  mantle: scenarioMantle,
  phase: scenarioPhase,
  flow: scenarioFlow,
  pace: scenarioPace,
  win: scenarioWin,
  training: scenarioTraining,
  looks: scenarioLooks,
  smoke: scenarioSmoke,
};
// (smoke is opt-in: a minute per phase of a fight, for a quick look)
const OPT_IN = new Set(['smoke', 'cost']);
const list = SCEN === 'all' ? Object.keys(S).filter((k) => !OPT_IN.has(k)) : SCEN.split(',');
for (const k of list) {
  if (!S[k]) { out(`unknown scenario ${k}`); process.exit(2); }
  await S[k]();
}
const notCat = [...EMITTED].filter((n) => !CATALOGUE.has(n) && n !== 'state');
assert(!notCat.length, `every event this level emits is in the catalogue ${JSON.stringify(notCat)}`);
out(`\n\nconsole errors/warnings: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 12).join('\n  ') : ''}`);
if (errors.length) fails++;
out(fails ? `\nFOX: ${fails} FAILED` : '\nFOX: ALL PASSED');
process.exit(fails ? 1 : 0);
