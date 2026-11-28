// The Last Foundry and Anselm, the False Saint, headless: the REAL Player, FalseSaint, Hud, GameFlow,
// AudioEngine and Lab (+ real LightPool, GlyphParticles, FireField, CameraRig, Events) wired like
// src/main.js for `?level=foundry`, on the level's real set (world/lastFoundry.js: its breakables, its
// hazard surface, its ambience). A bot drives the input. The harness is veil.mjs's (its build, bots, helpers).
// usage: node saint.mjs <repoRoot> [scenario[,scenario]]   (env: GCD_SEED=n reseeds the AI)
//   core's scenarios: levels | data | fight | phases | shell | molten | death | events | all
//   THE LATER AGENTS add theirs in `S` below, inside THEIR OWN marked block (// --- world, // --- body,
//   // --- fx, // --- melee, // --- boost, // --- arsenal, // --- terrain, // --- tuning), ONE ENTRY PER
//   LINE, so no two agents ever edit the same line. Each scenario is a function defined anywhere in the file
//   (put yours in a section of its own, headed with your name), or an inline async function in the entry.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ui, AUDIO, resetWindow } from './shim.mjs';
import { attachMarks, marksCheck } from './marks.mjs';

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
const { createLastFoundry, FOUNDRY } = await imp('src/world/lastFoundry.js');
const { Destructibles } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
// (this suite measures the barrier, the pull and the domain, not the riposte: a parry here answers with the
// old riposte, as the other suites that parry for something else do; the deathblow has its own, `duel deathblow`)
const { setRiposteMode } = await imp('src/entities/player/riposteCut.js');
setRiposteMode('old');
const { FalseSaint } = await imp('src/entities/enemies/falseSaint/saint.js');
const { MOVES, MOVE_NAMES, CLIP, TRANSITIONS, realise, HANDLERS, COUNTERS, STREAKS } = await imp('src/entities/enemies/falseSaint/moves.js');
const { TUNING } = await imp('src/entities/enemies/falseSaint/tuning.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

// (the tuning pass: GCD_TUNE='{"hp":3000,"posture":{"max":[1,2,3]}}' deep-merges into TUNING before
// anything is built: a setting tried without editing tuning.js; arrays are replaced whole)
if (process.env.GCD_TUNE) {
  const merge = (o, v) => { for (const [k, x] of Object.entries(v)) { if (x && typeof x === 'object' && !Array.isArray(x) && o[k] && typeof o[k] === 'object') merge(o[k], x); else o[k] = x; } };
  merge(TUNING, JSON.parse(process.env.GCD_TUNE));
}
const LVL = getLevel('foundry');
const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(process.env.GCD_SEED ?? 4242);
const DT = 1 / 60;
const PHASES = TUNING.phaseAt.length;
const weightIn = (def, f) => (Array.isArray(def.weight) ? def.weight[f - 1] ?? 0 : def.weight ?? 0);
/** The phases a move is used in (its weight; a counter or a hidden move: every phase; a transition: its own). */
const phasesOf = (name) => {
  const def = MOVES[name];
  if (def.transition) return [def.phase];
  if (def.counter || def.hidden) return [1, 2, 3, 4];
  return [1, 2, 3, 4].filter((f) => weightIn(def, f) > 0);
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
  const set = createLastFoundry(createSharedUniforms(), c);
  return { set, circles: c.circles.map((k) => ({ ...k })) };
})();

/** `real`: the set built anew with its breakables (world.destructibles, the scars, the ambience); without
 *  it the world is a mock on the set's colliders. */
function build(seed = SEED, real = true) {
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
  const set = real ? createLastFoundry(U, colliders) : null;
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
    // (world.js's restore: the pieces, the marks, the set's scenes back to the first)
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
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture].every(Number.isFinite)) throw new Error('saint NaN');
    if (![d._tip.x, d._tip.y, d._tip.z, d._hilt.x].every(Number.isFinite)) throw new Error('saint blade NaN');
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
  d.debug.tidy();
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

const quiet = (d) => d.mode === 'foot';
/** The hero's answer to the next flash of `name` (or any of his): 'parry' (ordinary), 'perfect' (a
 *  perfect parry), 'dodge' (a perfect dodge: the roll 0.08 s before the impact), 'early' (a roll too
 *  early: no perfect), 'guard' (a held guard), 'none'. Returns the step function for run(). */
function answer(G, how, name = null) {
  const { game, input } = G;
  G.ans = { at: 0, done: false };
  G.watch = (n, e) => {
    if (n !== 'combat:flash' || e?.source !== 'dragon' || (name && e.attack !== name) || G.ans.done || G.ans.at) return;
    const lead = { parry: 0.25, perfect: 0.04, dodge: 0.08, early: 0.45 }[how]; // (ADR-227: an ordinary parry is pressed 0.20 - 0.22 s before the impact; the press registers a frame later, the impact ~0.25 s after the flash)
    if (lead !== undefined) G.ans.at = game.time + TUNING.flashLead - lead;
  };
  return () => {
    const d = game.dragon, p = game.player;
    game.mouseGround.set(d.position.x, 0, d.position.z);
    if (how === 'guard') input.press(1);
    if (how === 'early' && G.ans.at && game.time + 0.5 >= G.ans.at + 0.45 && !G.ans.done) {
      // (an early roll: started 0.45 s before the impact)
    }
    if (G.ans.at && game.time >= G.ans.at && !G.ans.done) {
      G.ans.done = true;
      if (how === 'parry' || how === 'perfect') {
        input.up(1);
        input.click(1);
      } else if (how === 'dodge' || how === 'early') {
        const dx = p.position.x - d.position.x, dz = p.position.z - d.position.z, l = Math.hypot(dx, dz) || 1;
        input.axis = { x: -dz / l, y: -dx / l };
        input.tap('Space');
      }
    }
  };
}
/** Trigger `name` with the hero `dist` m before him and answer it `how`; run until he is back in footwork. */
function blowAnd(G, name, how, { dist = 2, god = true, max = 6 } = {}) {
  const d = G.game.dragon;
  place(G, dist);
  G.game.player.debug.god = god;
  const step = answer(G, how, name);
  const ok = d.brain.trigger(name);
  let acted = false;
  run(G, max, step, () => {
    if (d.mode === 'act') acted = true;
    return acted && d.mode === 'foot' && G.game.player.state !== 'roll';
  });
  G.watch = null;
  G.input.up(1);
  G.input.axis = { x: 0, y: 0 };
  return ok;
}

// ================================================================== helpers of this suite
const pieces = (G, kind) => G.game.world.destructibles.list.filter((b) => b.kind === kind);
/** One light swing of the hero's at him from `dist` m: the damage it dealt. */
function swing(G, dist = 1.6) {
  const { game, input } = G;
  const d = game.dragon;
  place(G, dist);
  const hp0 = d.hp;
  input.click(0);
  run(G, 0.9, () => game.mouseGround.set(d.position.x, 0, d.position.z));
  return hp0 - d.hp;
}
/** Damage him to just over a phase's gate and let its transition play out (n: the phase it opens). */
function throughGate(G, n) {
  const { game } = G;
  const d = game.dragon;
  const gate = d.maxHp * TUNING.phaseAt[n - 1];
  d.hp = gate + 20;
  d.mode = 'foot';
  d.brain.act = null;
  d.takeHit({ damage: 400, part: 'body', heavy: true, poise: 5, exact: true });
  const stopped = d.hp === gate && d.brain.pendingPhase === n;
  run(G, 1.5, null, () => d.brain.act?.name === TRANSITIONS[n]);
  const began = d.brain.act?.name === TRANSITIONS[n] && d.phase === n;
  run(G, 6, null, () => d.mode !== 'act');
  return { gate, stopped, began };
}

// ================================================================== core: levels
async function scenarioLevels() {
  out('\n== scenario LEVELS (the registry, the URL, the lines, no reward, the boss slot, the set\'s surface) ==');
  assert(LEVELS.includes(LVL) && LVL.id === 'foundry' && LEVELS.indexOf(LVL) === 9, `levels: ${LEVELS.map((l) => l.id).join(', ')} (the tenth)`);
  assert(['?level=foundry', '?lab&level=FOUNDRY', '?level=saint', '?level=falsesaint', '?level=anselm', '?level=mill', '?level=machine'].every((q) => levelFromSearch(q) === LVL), '?level=foundry / saint / falsesaint / anselm / mill / machine pick the level (case-insensitive)');
  const ids = new Set();
  for (const L of LEVELS) for (const a of [L.id, ...(L.aliases ?? [])]) { assert(!ids.has(a), `the URL id ${a} is one level's only`); ids.add(a); }
  for (const k of ['arrive', 'stir', 'phase2', 'phase3', 'phase4', 'victory', 'fallen', 'restReset', 'again', 'rise']) assert(!!LVL.text[k], `the level has its ${k} line`);
  assert(LVL.name === 'The Last Foundry' && LVL.text.victory === 'THE FALSE SAINT FALLS' && LVL.text.phase2 === 'THE SKIN BREAKS' && LVL.text.phase3 === 'WEAPONS FREE' && LVL.text.phase4 === 'TRUE FRAME', `${LVL.name}: ${LVL.sub}`);
  assert(LVL.reward === undefined, 'no reward ships (the owner has not chosen one)');
  assert(CONFIG.world.arenaRadius === FOUNDRY.half && CONFIG.world.bossTriggerZ === FOUNDRY.entryZ - 0.6 && CONFIG.world.dragonBound === FOUNDRY.floor.r && CONFIG.world.playerBound === FOUNDRY.bound, 'applyLevel merged the foundry layout into CONFIG.world');
  const F0 = FOUNDRY;
  assert([F0.half, F0.cell, F0.entryZ, F0.bonfire.x, F0.bonfire.z, F0.floor.r, F0.wait.x, F0.wait.z, F0.wait.yaw, F0.bound, F0.press.x, F0.press.z, F0.line.x, F0.line.z0, F0.line.z1, F0.pour.x0, F0.pour.x1, F0.pour.z0, F0.pour.z1].every(Number.isFinite) && F0.ladles.length === 4 && F0.tanks.length > 0 && F0.columns.length > 0, 'FOUNDRY carries every field of the layout (BRIEF 4)');
  const G = build();
  const d = G.game.dragon;
  assert(d instanceof FalseSaint && d.kind === 'duelist' && d.name === TUNING.name && d.kit.id === 'saint', `the boss is his own duelist: ${d.name}`);
  assert(d.maxHp === TUNING.hp && TUNING.phaseAt.length === 4 && TUNING.maxPhase === 4 && !d.lives, 'one health bar, four phases');
  assert(Object.keys(d.parts).join(',') === 'melee,boost,arsenal,terrain' && HANDLERS.length === 4, `the four move handlers are built (${Object.keys(d.parts).join(', ')})`);
  const set = G.game.world.forest, F = set.foundry;
  assert(!!F && F.ladles.length === 4 && typeof F.ladleNear === 'function' && typeof F.drop === 'function' && typeof F.molten?.add === 'function' && typeof F.molten.at === 'function' && Array.isArray(F.molten.pools) && typeof F.reset === 'function', 'the set\'s hazard surface: ladles, ladleNear, drop, molten.add / pools / at, reset');
  const kinds = new Set(G.game.world.destructibles.list.map((b) => b.kind));
  assert(['plate', 'ladle', 'press', 'frame', 'tank', 'column', 'furnace'].every((k) => kinds.has(k)), `the set's pieces stand (${[...kinds].join(', ')})`);
  assert(pieces(G, 'plate').length >= 300, `the casting floor is plates (${pieces(G, 'plate').length})`);
  run(G, 0.6);
  assert(d.mode === 'sleep' && Math.hypot(d.position.x - F0.wait.x, d.position.z - F0.wait.z) < 0.5, 'asleep he kneels at the edge of the pour');
  d.startIntro();
  run(G, 4, null, () => d.mode === 'foot');
  assert(G.counts['dragon:wake'] === 1 && G.counts['dragon:introDone'] === 1 && d.mode !== 'sleep', 'woken: the duel starts');
  const { SCORE, allTrackFiles } = await imp('src/audio/trackList.js');
  assert(!!SCORE.levels.foundry?.explore && SCORE.levels.foundry.phases.length === 4 && allTrackFiles().includes(SCORE.levels.foundry.explore.file), 'the level has its score (borrowed files)');
}

// ================================================================== core: data
async function scenarioData() {
  out('\n== scenario DATA (move data rules in every phase a move is used in; the fs prefix; the routing; the homage line) ==');
  let checked = 0;
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    const phases = phasesOf(name);
    if (!phases.length) assert(false, `${name}: used in at least one phase`);
    if (!def.transition && !(Array.isArray(def.weight) && def.weight.length === 4)) assert(false, `${name}: four-phase weights`);
    for (const f of phases) {
      for (const r of [0, 0.5, 0.999]) {
        const A = realise(name, f, () => r);
        const real = A.beats.filter((b) => !b.feint);
        const tag = `${name} P${f} r${r}`;
        if (!real.every((b) => [TELL.NORMAL, TELL.BLUE, TELL.RED, TELL.BLACK].includes(b.def.tell))) assert(false, `${tag}: a tell on every real hit`);
        if (!A.beats.filter((b) => b.feint && !b.def.stance).every((b) => b.def.tell === undefined && !b.def.zone && !b.def.damage)) assert(false, `${tag}: a feint says nothing`);
        const first = real[0];
        if (!def.transition && first && !(first.impact - first.tellAt >= TUNING.minFirstWindup - 1e-6)) assert(false, `${tag}: first real windup ${(first.impact - first.tellAt).toFixed(3)} >= ${TUNING.minFirstWindup}`);
        for (let i = 1; i < real.length; i++) if (!(real[i].impact - real[i - 1].impact >= TUNING.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${(real[i].impact - real[i - 1].impact).toFixed(3)} s apart >= ${TUNING.minHitGap}`);
        for (const b of real) if (!(b.def.zone || b.def.release || b.def.cast)) assert(false, `${tag}: hit ${b.hit} has a zone, a release or a cast`);
        for (const b of real) if (b.def.tell === TELL.RED && b.def.zone?.kind === 'ring' && !b.def.ring) assert(false, `${tag}: a red ring has its ring`);
        if (!(A.end > A.recoveryStart && Math.abs(A.clip.dur - A.end) < 1e-9)) assert(false, `${tag}: clip spans the move`);
        checked++;
      }
    }
  }
  assert(checked >= 12, `${checked} realisations obey the rules (a tell per hit, feints silent, first windup >= ${TUNING.minFirstWindup} s, hits >= ${TUNING.minHitGap} s apart)`);
  const { TUNING: ASC_T } = await imp('src/entities/enemies/ascendant/tuning.js');
  assert(TUNING.flashLead >= ASC_T.flashLead && TUNING.minFirstWindup >= Math.max(ASC_T.minFirstWindup, 0.42) && TUNING.minHitGap >= ASC_T.minHitGap, `his minimums are no lower than Tian Lei's, his first windup no lower than 0.42 (${TUNING.flashLead} / ${TUNING.minFirstWindup} / ${TUNING.minHitGap})`);
  // every new field is `fs`-prefixed (the engine's names: this list; add an engine field here only if the engine has it)
  const ENGINE = new Set(('tell flare feint windup hold cock active chance fixed pick damage knockback knockdown zone ring part track close travel dash lift leap air release cast sustain selfHit stance draw stopOn mikiri lock flit follow keys bolt pull grip noWorld groundMark blink dive hazard burn whoosh blockPush guardCost mo sweep '
    + 'label phase weight cooldown band recovery recoveryKeys counter transition manual hidden cat terrain gapCloser streak recoverOpen').split(' '));
  const bad = new Set();
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    for (const k of Object.keys(def)) if (k !== 'beats' && !ENGINE.has(k) && !/^fs[A-Z]/.test(k)) bad.add(`${name}.${k}`);
    for (const raw of def.beats) for (const b of Array.isArray(raw.pick) ? raw.pick : [raw]) for (const k of Object.keys(b)) if (!ENGINE.has(k) && !/^fs[A-Z]/.test(k)) bad.add(`${name}.beat.${k}`);
  }
  assert(bad.size === 0, `every new move / beat field is fs-prefixed (${[...bad].slice(0, 8).join(', ')})`);
  // the TUNING fields new to the engine are fs-prefixed too (the engine's: this list; the four merged blocks are free)
  const TENGINE = new Set('name hp phaseAt maxPhase radius scale bound flashLead minFirstWindup minHitGap windupScale recoveryScale close reach posture guard trade camera flinch hitStun parts execRange ghostepBehind execution move idleGap openingGap chain pressure punish fullDeflect lock mikiri cinematic damageScale airFall transition beam melee boost arsenal terrain world wakeRadius'.split(' '));
  const tbad = Object.keys(TUNING).filter((k) => !TENGINE.has(k) && !/^fs[A-Z]/.test(k));
  assert(tbad.length === 0, `every new TUNING field is fs-prefixed (${tbad.join(', ')})`);
  // the handlers' FIELDS: fs-prefixed and claimed by one file only; every beat routed to at most one
  const own = new Map();
  for (const H of HANDLERS) for (const f of H.fields) { if (!(/^fs[A-Z]/.test(f) && !own.has(f))) assert(false, `handler ${H.name}: its field ${f} is fs-prefixed and its own`); own.set(f, H.name); }
  assert(HANDLERS.map((H) => H.name).join(',') === 'melee,boost,arsenal,terrain' && own.size >= 4, `four handlers, ${own.size} fields, none claimed twice`);
  // the poses router: each file's names carry its prefix, none twice
  const { POSE_FILES } = await imp('src/entities/enemies/falseSaint/poses.js');
  const seen = new Set();
  let dup = 0, pre = 0;
  for (const [who, names] of Object.entries(POSE_FILES)) for (const n of names) { if (seen.has(n)) dup++; seen.add(n); if (who !== 'body' && !n.startsWith(who)) pre++; }
  assert(dup === 0 && pre === 0, `the pose files' names: none twice (${dup}), each moves file's with its prefix ml / bo / ar / tr (${pre} without)`);
  // the transitions, the flurries, the counters
  for (const [ph, mv] of Object.entries(TRANSITIONS)) assert(MOVES[mv]?.transition && MOVES[mv].phase === Number(ph) && MOVES[mv].beats.some((b) => b.fsMoment === Number(ph)), `phase ${ph} begins with ${mv} (its fsMoment)`);
  assert(STREAKS.length === 4 && STREAKS.every((n) => MOVES[n]?.streak) && COUNTERS.length === 4 && COUNTERS.every((n) => MOVES[n]?.counter), `his flurry by phase (${STREAKS.join(', ')}), his counter by phase (${COUNTERS.join(', ')})`);
  // the effects' surface: every method of the list exists (the moves call them from the first commit)
  const { FS_FX_METHODS } = await imp('src/entities/enemies/falseSaint/fx.js');
  const G = build();
  const fx = G.game.dragon.fx;
  const miss = FS_FX_METHODS.filter((m) => typeof fx[m] !== 'function');
  assert(miss.length === 0, `the ${FS_FX_METHODS.length} methods of FsFx's surface exist (${miss.join(', ')})`);
  const B = G.game.dragon;
  const v = new THREE.Vector3();
  const pts = ['palmR', 'elbowR', 'elbowL', 'shoulderR', 'shoulderL', 'back', 'calfR', 'calfL', 'core', 'mortar', 'eye', 'head', 'chest'].filter((n) => { B.partPoint(n, v); return !Number.isFinite(v.x + v.y + v.z); });
  assert(pts.length === 0 && Number.isFinite(B.eyePoint(v).y) && Number.isFinite(B.handPoint('L', v).y), `the body's points are finite (partPoint, eyePoint, handPoint; bad: ${pts.join(', ') || 'none'})`);
  // the homage line: none of the source's names in his data, the level's lines or the set's kinds
  const words = JSON.stringify([MOVES, LVL.text, LVL.name, LVL.sub, TUNING.name, Object.keys(MOVES), [...new Set(G.game.world.destructibles.list.map((b) => b.kind))]]).toLowerCase();
  const BAN = [['termi', 'nator'], ['sky', 'net'], ['cyber', 'dyne'], ['t-', '800'], ['t-', '1000'], ['con', 'nor'], ['ree', 'se'], ['hasta ', 'la'], ['be ', 'back'], ['ge', 'nos'], ['sai', 'tama'], ['one ', 'punch'], ['kuse', 'no'], ['incinera', 'tion cannon'], ['machine gun ', 'blow'], ['demon ', 'cyborg']].map((p) => p.join(''));
  const hits = BAN.filter((w) => new RegExp(`(^|[^a-z])${w.trim()}([^a-z]|$)`).test(words));
  assert(hits.length === 0, `no source name in his moves, his name, the level's lines or the set's kinds (${hits.join(', ')})`);
}

// ================================================================== core: fight
async function scenarioFight() {
  out('\n== scenario FIGHT (he wakes and fights 60 s against the fencing bot: no throw, no NaN, he attacks) ==');
  const SEEDS = (process.env.GCD_WSEEDS ?? '4242').split(',').map(Number);
  for (const seed of SEEDS) {
    const G = build(seed, true);
    const { game } = G;
    const d = game.dragon;
    duel(G, { dist: 3, ai: true });
    G.defend = makeDefender(G, { world: true });
    let flashes = 0;
    const moves = new Set();
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') { flashes++; if (e.attack) moves.add(e.attack); } };
    const hp0 = d.hp;
    run(G, Number(process.env.GCD_FSECS ?? 60), () => fencer(G), () => d.mode === 'dead');
    out(`     seed ${seed}: ${flashes} cues (${[...moves].join(', ')}), ${G.hits.length} blows reached the hero, his hp ${Math.round(hp0)} -> ${Math.round(d.hp)}, phase ${d.phase}`);
    assert(flashes >= 15 && moves.size >= 2, `seed ${seed}: he fights (${flashes} cues, ${moves.size} moves)`);
    assert(d.hp < hp0, `seed ${seed}: the bot's cuts reach him`);
    assert(G.payload.size === 0, `seed ${seed}: no NaN in any event (${[...G.payload].join(', ')})`);
  }
}

// ================================================================== core: phases
async function scenarioPhases() {
  out('\n== scenario PHASES (the three gates, the transitions and their banners, the shell and the dress by phase, the light) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, set = game.world.forest;
  duel(G, { dist: 4, ai: true });
  game.player.debug.god = true;
  const seen = { 2: 0, 3: 0, 4: 0 };
  G.watch = (n) => { const m = /^dragon:phase([234])$/.exec(n); if (m) seen[m[1]]++; };
  for (const n of [2, 3, 4]) {
    const r = throughGate(G, n);
    assert(r.stopped, `damage stops at the ${Math.round(TUNING.phaseAt[n - 1] * 100)} % gate (${r.gate})`);
    assert(r.began && seen[n] === 1, `${TRANSITIONS[n]}: phase ${n}, dragon:phase${n}`);
    const lim = TUNING.fsShell.limit[n - 1];
    assert(d.dressPhase === n && d.shell.phase === n && d.shell.exposure > TUNING.fsShell.limit[n - 2] * 0.5 && d.shell.exposure <= lim + 1e-6, `at its impact: dressPhase ${d.dressPhase}, the shell's phase ${d.shell.phase}, exposure ${d.shell.exposure.toFixed(2)} (limit ${lim})`);
    assert(game.flow._text(`phase${n}`) === LVL.text[`phase${n}`], `the level's phase-${n} banner: ${LVL.text[`phase${n}`]}`);
    run(G, 3);
    assert(set.ambience.state.phase === n && set.ambience.state.w[n - 1] > 0.5, `the light follows him into phase ${n} (${set.ambience.state.w.map((x) => x.toFixed(2)).join(' / ')})`);
  }
  const A1 = realise('benediction', 1, () => 0.5), A4 = realise('benediction', 4, () => 0.5);
  assert(A4.beats[0].W < A1.beats[0].W && A4.beats[0].W >= TUNING.minFirstWindup, `phase 4 is faster (windup ${A1.beats[0].W.toFixed(3)} -> ${A4.beats[0].W.toFixed(3)}), never under the minimum`);
  game.world.restore();
  d.reset();
  run(G, 0.2);
  assert(d.phase === 1 && d.dressPhase === 1 && d.shell.exposure === 0 && d.shell.phase === 1, 'his reset: phase 1, whole');
}

// ================================================================== core: shell
async function scenarioShell() {
  out('\n== scenario SHELL (a cut chips where it lands; the limits by phase; strip; reset; deterministic) ==');
  const { FsShell, PARTS, PART_NAMES, FLOORS } = await imp('src/entities/enemies/falseSaint/shell.js');
  const wsum = PARTS.reduce((s, p) => s + p.w, 0);
  assert(Math.abs(wsum - 1) < 1e-6 && PART_NAMES.length === 15, `15 parts, their weights sum to 1 (${wsum.toFixed(3)})`);
  const fake = { position: new THREE.Vector3(0, 0, 0), yaw: 0 };
  const S = new FsShell(fake);
  const H = TUNING.fsShell.height;
  // a cut at his right cheek (his right = -x at yaw 0)
  const v0 = S.version;
  const took = S.chip({ x: -0.06, y: 0.93 * H, z: 0.05 }, 0.5);
  assert(took > 0 && S.part('headR') > S.part('headL') && S.part('headR') > 0 && S.version > v0 && S.last.part === 'headR', `a cut at his right cheek chips headR first (${S.part('headR').toFixed(2)} vs headL ${S.part('headL').toFixed(2)}; took ${took.toFixed(3)})`);
  for (let i = 0; i < 60; i++) S.chip({ x: 0.1, y: 0.4 * H, z: 0 }, 0.5);
  assert(Math.abs(S.exposure - TUNING.fsShell.limit[0]) < 1e-6, `phase 1: cuts stop at the limit (${S.exposure.toFixed(3)} = ${TUNING.fsShell.limit[0]})`);
  assert(S.chip({ x: 0, y: 1, z: 0 }, 0.5) === 0, 'at the limit a cut takes nothing');
  const floors = [];
  for (const n of [2, 3, 4]) {
    S.setPhase(n);
    const lim = TUNING.fsShell.limit[n - 1];
    const fl = S.exposure;
    for (const [name, f] of Object.entries(FLOORS[n])) if (S.part(name) < f - 1e-6) assert(false, `phase ${n}: ${name} at least its floor ${f}`);
    for (let i = 0; i < 200; i++) S.chip({ x: (i % 5) * 0.1 - 0.2, y: ((i * 7) % 10) / 10 * H, z: 0 }, 0.3);
    floors.push(`P${n} ${fl.toFixed(2)} -> ${S.exposure.toFixed(2)} (limit ${lim})`);
    assert(fl < lim && S.exposure <= lim + 1e-6 && S.exposure > fl, `phase ${n}: starts at its floor ${fl.toFixed(2)}, cuts take it up to the limit ${lim} (${S.exposure.toFixed(3)})`);
  }
  out(`     ${floors.join(' · ')}`);
  S.reset();
  assert(S.exposure === 0 && S.phase === 1 && PART_NAMES.every((n) => S.part(n) === 0), 'reset: whole again, phase 1');
  // strip: a little everywhere (inside the limit)
  S.setPhase(2);
  const e2 = S.exposure, st = S.strip(0.2);
  assert(st > 0 && S.exposure <= TUNING.fsShell.limit[1] + 1e-6 && S.exposure > e2, `strip takes from every part, inside the limit (${e2.toFixed(3)} -> ${S.exposure.toFixed(3)})`);
  // deterministic: the same cuts, the same shell; the reveal order a fixed hash
  const A = new FsShell(fake), B = new FsShell(fake);
  for (const s of [A, B]) { s.setPhase(3); for (let i = 0; i < 9; i++) s.chip({ x: 0.1 * i - 0.4, y: 1.2, z: 0.1 }, 0.2); }
  assert(PART_NAMES.every((n) => A.part(n) === B.part(n)) && A.order('chestR', 3) === B.order('chestR', 3) && A.order('chestR', 3) !== A.order('chestR', 4), 'deterministic: the same cuts give the same shell; the reveal order is a fixed hash');
  // through the real fight: a landed cut of the hero's chips him
  const G = build();
  const d = G.game.dragon;
  duel(G, { dist: 1.6 });
  G.game.player.debug.god = true;
  // (a cut that lands: past his guard, at his left knee as the engine passes it: o.point)
  const knee = new THREE.Vector3().setFromMatrixPosition(d.rig.legs.L.shin.matrixWorld);
  const dealt = d.takeHit({ damage: 20, part: 'leg', point: knee, dir: { x: 1, z: 0 }, exact: true });
  assert(dealt > 0 && d.shell.exposure > 0 && d.shell.last.k > 0 && /L$/.test(d.shell.last.part), `a landed cut chips his shell where it lands (${dealt} damage, exposure ${d.shell.exposure.toFixed(3)}, at ${d.shell.last.part})`);
  // (and a real swing of the hero's on a broken boss: his guard cannot turn it)
  d.debug.postureBreak();
  run(G, 0.3);
  const e0 = d.shell.exposure;
  let sw = 0;
  for (let i = 0; i < 4 && d.shell.exposure === e0; i++) sw += swing(G, 1.4);
  assert(sw > 0 && d.shell.exposure > e0, `the hero's own swing chips it (${sw} damage, exposure ${e0.toFixed(3)} -> ${d.shell.exposure.toFixed(3)})`);
  assert(d.debug.shell(1) > 0.999 && d.shell.exposure > 0.999 && typeof d.debug.shell().exposure === 'number', 'debug.shell(k) forces a bare frame; debug.shell() reads the state');
  d.reset();
  assert(d.shell.exposure === 0, 'his reset restores him whole');
}

// ================================================================== core: molten
async function scenarioMolten() {
  out('\n== scenario MOLTEN (a pool is cued, then burns the hero; burns him; a broken ladle spills; reset) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player, F = game.world.forest.foundry;
  duel(G, { dist: 6, ai: false });
  // a pool at the hero's feet: the red cue first (a hazard flash where it lies), the burn after `arm`
  place(G, 6);
  const t0 = game.time;
  let cueAt = NaN, tellAt = NaN, hitAt = NaN;
  G.watch = (n, e) => {
    if (n === 'combat:flash' && e?.attack === 'molten' && !Number.isFinite(cueAt)) cueAt = game.time;
    if (n === 'combat:tell' && e?.attack === 'molten' && !Number.isFinite(tellAt)) tellAt = game.time;
  };
  const hp0 = p.hp;
  const P = d.debug.pool(p.position.x, p.position.z, 2);
  assert(P?.alive && F.molten.at(p.position.x, p.position.z) === P, `debug.pool lays a pool (molten.add → { x, z, r, t, life, id }: r ${P?.r}, life ${P?.life})`);
  run(G, 2, null, () => { if (!Number.isFinite(hitAt) && p.hp < hp0) hitAt = game.time; return Number.isFinite(hitAt); });
  const M = TUNING.terrain.molten;
  out(`     cue ${(cueAt - t0).toFixed(2)} s, tell ${(tellAt - t0).toFixed(2)} s, the first burn ${(hitAt - t0).toFixed(2)} s after it was laid (arm ${M.arm} s)`);
  assert(Number.isFinite(cueAt) && Number.isFinite(tellAt) && cueAt - t0 < 0.1, 'the pool is cued red where it lies as it is laid (combat:tell, combat:flash with hazard)');
  assert(Number.isFinite(hitAt) && hitAt - cueAt >= M.arm - 0.05 && p.hp < hp0 && d.parts.terrain.stats.heroBurns >= 1, `then it burns the hero (${hp0} -> ${p.hp}), no sooner than ${M.arm} s after its cue`);
  G.watch = null;
  // a pool under him: onMolten (damage, posture, his shell stripped)
  p.debug.heal();
  p.debug.teleport(d.position.x + 6, d.position.z);
  run(G, 0.6);
  const dh = d.hp, dp = d.posture;
  d.debug.pool(d.position.x, d.position.z, 2);
  run(G, 1.4);
  assert(d.hp < dh && d.posture > dp && d.parts.terrain.stats.bossBurns >= 1, `a pool under him burns him (hp ${Math.round(dh)} -> ${Math.round(d.hp)}, posture ${Math.round(dp)} -> ${Math.round(d.posture)})`);
  assert(d.shell.exposure > 0 || d.shell.exposure === TUNING.fsShell.limit[0], `... and strips his shell (exposure ${d.shell.exposure.toFixed(3)})`);
  // a ladle broken by any blow spills; drop() cuts one down; ladleNear; the pools expire; reset
  const L = F.ladles[0];
  game.world.destructibles.strike(L.x, L.z, 0.6, 99, { kind: 'blunt', by: 'hero', y: L.h - 0.2 });
  run(G, 0.2);
  assert(!L.full && F.molten.pools.some((q) => q.alive && Math.hypot(q.x - L.x, q.z - L.z) < 0.1), 'a ladle broken by a blow spills a pool under it');
  const L2 = F.ladleNear(F.ladles[1].x + 1, F.ladles[1].z, 3);
  assert(L2 === F.ladles[1] && F.drop(L2, 'boss') && !L2.full && F.drop(L2, 'boss') === false, 'ladleNear finds a full ladle; drop cuts it down once');
  run(G, 20);
  assert(F.molten.pools.every((q) => !q.alive), 'the pools burn out');
  for (let i = 0; i < 12; i++) F.molten.add(i, 0, { r: 1 });
  assert(F.molten.pools.length === 8 && F.molten.pools.filter((q) => q.alive).length === 8, 'a fixed pool of records (the oldest reused)');
  game.world.restore();
  d.reset();
  run(G, 0.1);
  assert(F.ladles.every((x) => x.full) && F.molten.pools.every((q) => !q.alive), 'the reset: every ladle full again, no pool');
}

// ================================================================== core: death
async function scenarioDeath() {
  out('\n== scenario DEATH (he falls; the victory; the reset after it) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon;
  duel(G, { dist: 4, ai: true });
  game.player.debug.god = true;
  d.debug.kill();
  run(G, 8, null, () => d.mode === 'dead');
  assert(d.mode === 'dead' && G.counts['dragon:death'] >= 1, `he falls (${d.mode})`);
  run(G, 4);
  assert(game.state === 'victory' || G.counts['dragon:dead'] >= 1, `the victory (${game.state})`);
  game.world.restore();
  d.reset();
  run(G, 0.5);
  assert(d.mode === 'sleep' && d.hp === d.maxHp && d.phase === 1 && d.shell.exposure === 0, `the reset: asleep at the pour, whole (${d.mode}, ${d.hp})`);
}

// ================================================================== core: events
async function scenarioEvents() {
  out('\n== scenario EVENTS (what this level emits is in the catalogue: checked at the end of every run) ==');
  assert(CATALOGUE.size > 20, `the catalogue is read (${CATALOGUE.size} names)`);
}

// ================================================================== body: the reveal, the milestones, the weapons, the sensors
/** The body's dress record and a few counts. */
function bodyState(d) {
  const D = d.rig.root.userData.fsDress;
  const shown = D.shards.filter((e) => !e.gone).length;
  const frameOn = D.frame.filter((f) => f.on).length;
  const sensors = D.sensors.filter((s) => s.mesh.visible).length;
  return { D, shown, frameOn, sensors };
}
async function scenarioBodyReveal() {
  out('\n== scenario BODYREVEAL (every shell part has pieces; the reveal only grows with the exposure; a reset restores him; idle costs nothing) ==');
  const { PART_NAMES } = await imp('src/entities/enemies/falseSaint/shell.js');
  const G = build();
  const d = G.game.dragon;
  duel(G, { dist: 4 });
  run(G, 0.1);
  const { D } = bodyState(d);
  const per = Object.fromEntries(PART_NAMES.map((n) => [n, D.shards.filter((e) => e.part === n).length]));
  const missing = PART_NAMES.filter((n) => !(per[n] || D.hands.some((h) => h.part === n)) || !(D.frame.some((f) => f.parts.includes(n)) || D.hands.some((h) => h.part === n)));
  const meshes = D.shards.reduce((s, e) => s + e.meshes.length, 0);
  out(`     ${D.shards.length} shards (${meshes} meshes), ${D.frame.length} frame pieces, ${D.hands.length} hands, ${Object.keys(D.weapons).length} weapons; per part ${JSON.stringify(per)}`);
  assert(missing.length === 0, `every shell part maps to shards of the disguise and to frame pieces (missing: ${missing.join(', ') || 'none'})`);
  assert(D.shards.every((e) => e.meshes.length > 0 && Number.isFinite(e.t)), 'every shard draws something and has a threshold');
  let s0 = bodyState(d);
  assert(s0.shown === D.shards.length && s0.frameOn === 0 && s0.sensors === 0, `whole at the start: every shard shown, no frame, no sensor (${s0.shown}/${D.shards.length}, ${s0.frameOn}, ${s0.sensors})`);
  // the exposure in steps: the shards shown never come back, the frame never goes
  let prev = Infinity, prevF = -1, mono = true;
  const steps = [];
  for (let k = 0; k <= 10; k++) {
    d.shell.force(k / 10);
    run(G, 1 / 60);
    const s = bodyState(d);
    if (s.shown > prev || s.frameOn < prevF) mono = false;
    prev = s.shown;
    prevF = s.frameOn;
    steps.push(s.shown);
  }
  assert(mono && prev === D.shards.filter((e) => e.t > 1).length, `the reveal only grows (${steps.join(' ')} shards shown at exposure 0 .. 1 by tenths)`);
  // a reset restores him whole
  d.reset();
  run(G, 0.1);
  s0 = bodyState(d);
  assert(s0.shown === D.shards.length && s0.frameOn === 0, `a reset restores him whole (${s0.shown} shards, ${s0.frameOn} frame pieces)`);
  // idle: the dress does no work and allocates nothing
  const { dressSaint } = await imp('src/entities/enemies/falseSaint/look.js');
  // (exact with `node --expose-gc`: the heap after a collection; without it a loose bound on the garbage)
  // (warmed up first: until the optimiser has it, a read of a float boxes it)
  for (let i = 0; i < 30000; i++) dressSaint(d, DT);
  globalThis.gc?.();
  const h0 = process.memoryUsage().heapUsed;
  // (no gc between: what the calls allocate is still on the heap)
  for (let i = 0; i < 20000; i++) dressSaint(d, DT);
  const dh = process.memoryUsage().heapUsed - h0;
  if (process.env.GCD_BODYHEAP) { globalThis.gc?.(); out(`     retained after a collection: ${((process.memoryUsage().heapUsed - h0) / 1024).toFixed(0)} kB`); }
  const lim = globalThis.gc ? 400e3 : 16e6;
  assert(dh < lim, `20 000 idle dresses allocate next to nothing (${(dh / 1024).toFixed(0)} kB of heap, ${globalThis.gc ? 'exact' : 'loose: run with --expose-gc for the exact count'})`);
}

async function scenarioBodyMilestones() {
  out('\n== scenario BODYMILESTONES (the shell\'s phase floors draw the reference\'s four milestones) ==');
  const G = build();
  const d = G.game.dragon;
  duel(G, { dist: 4 });
  const { D } = bodyState(d);
  const gone = (part) => { const L = D.shards.filter((e) => e.part === part && !e.patch); return L.filter((e) => e.gone).length / Math.max(1, L.length); };
  const at = (n) => { d.shell.reset(); d.shell.setPhase(n); d.dressPhase = n; run(G, 2 / 60); return bodyState(d); };
  const p1 = at(1);
  assert(p1.shown === D.shards.length && p1.sensors === 0, '01 HUMAN: whole, no sensor lit');
  const p2 = at(2);
  out(`     02: headR ${gone('headR').toFixed(2)}, foreR ${gone('foreR').toFixed(2)}, chestL ${gone('chestL').toFixed(2)}, chestR ${gone('chestR').toFixed(2)}, handR bare ${D.handR.bare}`);
  assert(gone('headR') > 0.05 && gone('headR') < 0.6 && gone('headL') === 0 && gone('foreR') === 1 && gone('chestL') > 0 && gone('chestL') < 0.4 && gone('chestR') === 0 && !D.handR.bare && p2.sensors === 1,
    `02 FRACTURE: the right cheek and temple chipped (headR ${gone('headR').toFixed(2)}), the right forearm bare, a crack at the left collarbone, the right chest whole, the hand still skin, one sensor lit (${p2.sensors})`);
  const p3 = at(3);
  const fl = D.shards.find((e) => e.part === 'hip' && e.t > 0.99);
  out(`     03: headL ${gone('headL').toFixed(2)}, chestL ${gone('chestL').toFixed(2)}, legR ${gone('legR').toFixed(2)}, legL ${gone('legL').toFixed(2)}, shinR ${gone('shinR').toFixed(2)}, armL ${gone('armL').toFixed(2)}`);
  assert(gone('headR') === 1 && gone('headL') > 0 && gone('headL') < 0.75 && gone('chestR') === 1 && gone('armR') === 1 && gone('chestL') < 0.6 && gone('armL') === 0 && gone('shinR') === 1 && gone('legR') > 0.8 && gone('legL') > 0.2 && p3.sensors === 2 && fl && !fl.gone,
    `03 EXPOSURE: the right head, chest and arm bare, a skin island on the left cheek, the jacket on the left, both legs mostly plated, two sensors (${p3.sensors})`);
  const p4 = at(4);
  const flake = D.shards.find((e) => e.part === 'armL' && e.patch);
  out(`     04: ${p4.shown} shards left (${D.shards.filter((e) => !e.gone).map((e) => e.part).join(', ')})`);
  assert(gone('headL') === 1 && gone('chestL') === 1 && fl && !fl.gone && flake && !flake.gone && p4.sensors === 3 && p4.shown <= 4,
    `04 TRUE FRAME: the face all frame, a scrap of jacket at the left hip and skin flakes at the left shoulder left, three sensors (${p4.shown} pieces left)`);
  d.reset();
}

async function scenarioBodyWeapons() {
  out('\n== scenario BODYWEAPONS (the frame\'s weapons open by their values on d, only where the shell is gone; their points) ==');
  const G = build();
  const d = G.game.dragon;
  duel(G, { dist: 4 });
  const { D } = bodyState(d);
  const W = D.weapons;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  // covered in phase 1: nothing shows even when driven
  d.fsJetK = 1; d.fsPetalK = 1; d.fsThrustK = 1; d.fsCoreK = 1; d.fsTubeK = 1; d.fsGunK = 1; d.fsPalmK = 1;
  run(G, 2 / 60);
  const anyShown = Object.values(W).some((x) => x.meshes?.some((m) => m.visible));
  assert(!anyShown, 'in phase 1 every weapon stays under the shell, driven or not');
  for (const k of ['fsJetK', 'fsPetalK', 'fsThrustK', 'fsCoreK', 'fsTubeK', 'fsGunK', 'fsPalmK']) d[k] = 0;
  d.shell.setPhase(4); d.dressPhase = 4;
  run(G, 2 / 60);
  d.partPoint('elbowR', v);
  const s0 = W.elbowR.pivot.scale.y;
  d.fsJetK = 1;
  run(G, 2 / 60);
  d.partPoint('elbowR', w);
  assert(W.elbowR.meshes[0].visible && W.elbowR.pivot.scale.y > s0 && v.distanceTo(w) > 0.005, `phase 4: the elbow booster shows and opens with d.fsJetK (scale ${s0.toFixed(2)} -> ${W.elbowR.pivot.scale.y.toFixed(2)}; its point moves ${(v.distanceTo(w) * 100).toFixed(1)} cm)`);
  const q0 = W.mortar.pivot.quaternion.clone();
  d.fsTubeK = 1; d.fsPetalK = 1;
  run(G, 2 / 60);
  assert(W.mortar.meshes[0].visible && W.mortar.pivot.quaternion.angleTo(q0) > 2 && W.petalsR.cells.visible, 'the mortar tubes rise with d.fsTubeK, the petals open on their cells with d.fsPetalK');
  const names = ['palmR', 'palmL', 'elbowR', 'elbowL', 'shoulderR', 'shoulderL', 'back', 'backR', 'backL', 'calfR', 'calfL', 'core', 'mortar', 'gunR', 'eye', 'head', 'chest'];
  const pts = names.map((n) => d.partPoint(n, new THREE.Vector3()));
  const bad = names.filter((n, i) => !Number.isFinite(pts[i].x + pts[i].y + pts[i].z) || pts[i].distanceTo(d.position) > 2.6);
  const p = Object.fromEntries(names.map((n, i) => [n, pts[i]]));
  assert(bad.length === 0 && p.head.y > p.chest.y && p.chest.y > p.calfR.y && p.elbowR.distanceTo(p.elbowL) > 0.2, `his ${names.length} points are on his drawn body (bad: ${bad.join(', ') || 'none'}; head ${p.head.y.toFixed(2)}, chest ${p.chest.y.toFixed(2)}, calf ${p.calfR.y.toFixed(2)} m)`);
  // the hand shapes
  d.fsHandR = 'clench';
  run(G, 1 / 60);
  const H = D.handR;
  assert(H.shapes.clench.metal.visible && !H.shapes.guard.metal.visible && !W.iris.ring.visible, 'd.fsHandR = clench: the metal fist, the iris hidden');
  d.fsHandR = 'reach';
  run(G, 1 / 60);
  assert(H.shapes.open.metal.visible && W.iris.ring.visible, 'd.fsHandR = reach: the open hand, the iris on its palm');
  d.reset();
}

async function scenarioBodyDeath() {
  out('\n== scenario BODYDEATH (his sensors go out one by one as he dies) ==');
  const G = build();
  const d = G.game.dragon;
  duel(G, { dist: 4 });
  G.game.player.debug.god = true;
  d.shell.setPhase(4); d.dressPhase = 4;
  run(G, 2 / 60);
  const outs = [];
  const so = d.fx.sensorOut?.bind(d.fx);
  d.fx.sensorOut = (i) => { outs.push([i, +d.brain.modeT.toFixed(2)]); return so?.(i); };
  const lit = [];
  d.debug.kill();
  for (let i = 0; i < 300 && d.mode !== 'dead'; i++) { run(G, 1 / 60); if (i % 15 === 0) lit.push(bodyState(d).sensors); }
  out(`     sensors lit every 0.25 s: ${lit.join(' ')}; out at ${JSON.stringify(outs)}`);
  const mono = lit.every((x, i) => i === 0 || x <= lit[i - 1]);
  assert(outs.length === 3 && mono && lit[0] === 3 && bodyState(d).sensors === 0, 'three sensors, out one by one (fx.sensorOut 0, 1, 2), none back');
}

// ================================================================== THE SCENARIOS (one entry per line, each agent in its block)
const S = {
  // --- core
  levels: scenarioLevels,
  data: scenarioData,
  fight: scenarioFight,
  phases: scenarioPhases,
  shell: scenarioShell,
  molten: scenarioMolten,
  death: scenarioDeath,
  events: scenarioEvents,
  // --- world
  // --- body
  bodyReveal: scenarioBodyReveal,
  bodyMilestones: scenarioBodyMilestones,
  bodyWeapons: scenarioBodyWeapons,
  bodyDeath: scenarioBodyDeath,
  // --- fx
  // --- melee
  // --- boost
  // --- arsenal
  // --- terrain
  // --- tuning
};
// (opt-in scenarios: listed here, run only by name; tests/run.mjs may run one as a process of its own)
const OPT_IN = new Set([]);
const SKIP = new Set((process.env.GCD_SKIP ?? '').split(',').map((x) => x.trim()).filter(Boolean));
const list = SCEN === 'all' ? Object.keys(S).filter((k) => !OPT_IN.has(k) && !SKIP.has(k)) : SCEN.split(',');
for (const k of list) {
  if (!S[k]) { out(`unknown scenario ${k}`); process.exit(2); }
  await S[k]();
}
const notCat = [...EMITTED].filter((n) => !CATALOGUE.has(n) && n !== 'state');
assert(!notCat.length, `every event this level emits is in the catalogue ${JSON.stringify(notCat)}`);
out(`\n\nconsole errors/warnings: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 12).join('\n  ') : ''}`);
if (errors.length) fails++;
out(fails ? `\nSAINT: ${fails} FAILED` : '\nSAINT: ALL PASSED');
process.exit(fails ? 1 : 0);
