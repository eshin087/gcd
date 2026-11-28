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
        // (COMBAT.md: >= 0.7 s in phase 1; a later phase may be faster through windupScale)
        const fw = TUNING.minFirstWindup * (Array.isArray(TUNING.windupScale) ? TUNING.windupScale[f - 1] ?? 1 : 1);
        if (!def.transition && first && !(first.impact - first.tellAt >= fw - 1e-6)) assert(false, `${tag}: first real windup ${(first.impact - first.tellAt).toFixed(3)} >= ${fw.toFixed(3)}`);
        for (let i = 1; i < real.length; i++) if (!(real[i].impact - real[i - 1].impact >= TUNING.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${(real[i].impact - real[i - 1].impact).toFixed(3)} s apart >= ${TUNING.minHitGap}`);
        for (const b of real) if (!(b.def.zone || b.def.release || b.def.cast)) assert(false, `${tag}: hit ${b.hit} has a zone, a release or a cast`);
        for (const b of real) if (b.def.tell === TELL.RED && b.def.zone?.kind === 'ring' && !b.def.ring) assert(false, `${tag}: a red ring has its ring`);
        if (!(A.end > A.recoveryStart && Math.abs(A.clip.dur - A.end) < 1e-9)) assert(false, `${tag}: clip spans the move`);
        checked++;
      }
    }
  }
  assert(checked >= 12, `${checked} realisations obey the rules (a tell per hit, feints silent, first windup >= ${TUNING.minFirstWindup} s x windupScale, hits >= ${TUNING.minHitGap} s apart)`);
  // (COMBAT.md's floors: the cue 0.35 s before the impact, a first windup of 0.7 s in phase 1, hits 0.45 s apart)
  assert(TUNING.flashLead >= 0.35 - 1e-9 && TUNING.minFirstWindup >= 0.7 - 1e-9 && TUNING.minHitGap >= 0.45 - 1e-9, `his minimums are COMBAT.md's (cue ${TUNING.flashLead} >= 0.35, first windup ${TUNING.minFirstWindup} >= 0.7, hits ${TUNING.minHitGap} >= 0.45 apart)`);
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

// ================================================================== BOOST (the boost agent's: moves/boost.js, boost.js)
// The jet step, the booster punch, Rosary, Descent, the jet strings, Vespers, Last Rite, the change's guard,
// and the pace (cues a minute per phase against a guarding bot: a measure, printed).
const bo = (G) => G.game.dragon.parts.boost;
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** The flashes of his blows (tell, time, attack) while `fn` runs. */
function flashLog(G) {
  const log = [];
  const prev = G.watch;
  G.watch = (n, e) => { prev?.(n, e); if (n === 'combat:flash' && e?.source === 'dragon') log.push({ t: G.game.time, tell: e.tell, attack: e.attack }); };
  return log;
}
/** Run move `name` from `dist` m with the defender bot answering (parry / roll), god mode; until he is back in footwork. */
function moveWithBot(G, name, dist, { god = true, max = 10, style = 'mixed' } = {}) {
  const { game } = G;
  const d = game.dragon;
  place(G, dist);
  game.player.debug.god = god;
  G.defend = makeDefender(G, { style });
  const log = flashLog(G);
  const ok = d.brain.trigger(name);
  let acted = false;
  run(G, max, () => { G.input.axis = { x: 0, y: 0 }; game.mouseGround.set(d.position.x, 0, d.position.z); G.defend.act(); }, () => {
    if (d.mode === 'act') acted = true;
    return acted && d.mode !== 'act' && game.player.state !== 'roll';
  });
  G.defend = null;
  G.watch = null;
  G.input.up(1);
  G.input.axis = { x: 0, y: 0 };
  return { ok, log };
}
/** The hero `dist` m from him toward the floor's middle (inside 12 m of it), facing him. */
function placeIn(G, dist) {
  const { game } = G;
  const d = game.dragon, p = game.player;
  let ax = -d.position.x, az = -d.position.z;
  const l = Math.hypot(ax, az);
  if (l < 1) { ax = 0; az = 1; } else { ax /= l; az /= l; }
  let x = d.position.x + ax * dist, z = d.position.z + az * dist;
  const r = Math.hypot(x, z);
  if (r > 12) { x *= 12 / r; z *= 12 / r; }
  p.debug.teleport(x, z);
  p.yaw = Math.atan2(d.position.x - p.position.x, d.position.z - p.position.z);
  game.mouseGround.set(d.position.x, 0, d.position.z);
}
/** blowAnd without its placing: trigger `name` where everyone stands, answer it `how`, until he is back in footwork. */
function fireAt(G, name, how, max = 6) {
  const d = G.game.dragon;
  const step = answer(G, how, name);
  const ok = d.brain.trigger(name);
  let acted = false;
  run(G, max, step, () => { if (d.mode === 'act') acted = true; return acted && d.mode === 'foot' && G.game.player.state !== 'roll'; });
  G.watch = null;
  G.input.up(1);
  G.input.axis = { x: 0, y: 0 };
  return ok;
}
const tellsOf = (log) => log.map((f) => (f.tell === TELL.BLUE ? 'B' : f.tell === TELL.RED ? 'R' : f.tell === TELL.BLACK ? 'K' : 'N')).join('');

async function scenarioBoostStep() {
  out('\n== scenario BOOST STEP (Censer Step: a far hero is closed on a jet from phase 2, never through him, a cooldown; two legs and the hover from phase 3) ==');
  const S = TUNING.boost.step;
  for (const form of [1, 2, 3, 4]) {
    const G = build();
    const { game } = G;
    const d = game.dragon, p = game.player, B = bo(G);
    duel(G, { dist: 10, ai: true, form });
    p.debug.god = true;
    placeIn(G, 10);
    const st0 = { ...B.stats };
    let minD = Infinity, hoverY = 0, hoverN = 0, maxY = 0, prev = B.stats.steps;
    const starts = [], lens = [];
    let x0 = 0, z0 = 0;
    run(G, 16, () => {
      G.input.axis = { x: 0, y: 0 };
      game.mouseGround.set(d.position.x, 0, d.position.z);
      if (B.stats.steps > prev) { prev = B.stats.steps; starts.push(game.time); x0 = d.position.x; z0 = d.position.z; }
      if (B.step) { minD = Math.min(minD, flatDist(d.position, p.position)); lens[starts.length - 1] = Math.hypot(d.position.x - x0, d.position.z - z0); }
      if (d.mode === 'foot' && !B.step && d.brain.modeT > 0.6) { hoverY += d.position.y; hoverN++; maxY = Math.max(maxY, d.position.y); }
      // (the hero keeps his distance: back to 10 m whenever he is closed on and the boss stands in footwork)
      if (d.mode === 'foot' && !B.step && flatDist(d.position, p.position) < 4) placeIn(G, 10);
    });
    const gaps = starts.slice(1).map((t, i) => t - starts[i]);
    const every = Array.isArray(S.every) ? S.every[form - 1] : S.every;
    for (const k of ['steps', 'zigs', 'stepAborts', 'plants']) B.stats[k] -= st0[k];
    out(`     phase ${form}: ${B.stats.steps} steps (${B.stats.zigs} zig-zags, ${B.stats.stepAborts} cut short), lengths ${lens.map((l) => l?.toFixed(1)).join(' / ')} m, closest to the hero in one ${Number.isFinite(minD) ? minD.toFixed(2) : '-'} m, gaps ${gaps.map((g) => g.toFixed(2)).join(' / ')} s, hover ${(hoverY / Math.max(1, hoverN)).toFixed(2)} m (max ${maxY.toFixed(2)}), ${B.stats.plants} planted stops`);
    if (form === 1) assert(B.stats.steps === 0, 'phase 1: he walks (no jet step)');
    else {
      // (phase 4 flows from move to move (TUNING.chain 0.8): fewer stretches of footwork to jet in)
      assert(B.stats.steps >= (form >= 4 ? 1 : 2), `phase ${form}: he jets at a far hero (${B.stats.steps} steps)`);
      assert(minD >= S.stop - 0.2, `phase ${form}: never through the hero (closest ${minD.toFixed(2)} m >= ${S.stop - 0.2})`);
      assert(gaps.every((g) => g >= every - 0.05), `phase ${form}: a cooldown between steps (>= ${every} s: ${gaps.map((g) => g.toFixed(2)).join(', ')})`);
      assert(lens.every((l) => l <= S.max * 1.4 + 0.1), `phase ${form}: no step longer than its legs allow (${S.max} m straight)`);
      assert(B.stats.plants >= B.stats.steps, `phase ${form}: every step ends in the planted stop, its scuff and dust (${B.stats.plants} / ${B.stats.steps})`);
    }
    if (form >= S.zig) assert(B.stats.zigs >= 1, `phase ${form}: the zig-zag (${B.stats.zigs})`);
    if (form >= 3) assert(hoverY / Math.max(1, hoverN) > 0.1 && maxY < 0.4, `phase ${form}: he hovers between moves (${(hoverY / Math.max(1, hoverN)).toFixed(2)} m, never above ${maxY.toFixed(2)})`);
    else assert(maxY < 0.05, `phase ${form}: on the floor between moves (${maxY.toFixed(2)})`);
  }
}

async function scenarioBoostVotive() {
  out('\n== scenario BOOST VOTIVE (the booster punch: the jet tell, the blink, parried / blocked / landed / dodged; a miss carries on into the scenery) ==');
  const V = TUNING.boost.votive;
  // the held tell and the blink, as realised
  for (const f of [2, 3, 4]) {
    const A = realise('votiveFist', f, () => 0.5), b = A.beats[0];
    const jet = b.W * (V.dashFrom - V.jetFrom), blink = b.W * (1 - V.dashFrom);
    out(`     P${f}: windup ${b.W.toFixed(3)} s, the elbow jet lit ${jet.toFixed(2)} s before the dash, the blink ${blink.toFixed(3)} s (up to ${V.reach} m: ${(V.reach / blink).toFixed(0)} m/s), the glint ${(TUNING.flashLead).toFixed(2)} s before the impact`);
    assert(jet >= 0.45 && b.flash < b.start + b.W * V.dashFrom + 0.06, `P${f}: the jet reads before the blink (${jet.toFixed(2)} s); the glint comes before the blink`);
  }
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player, B = bo(G);
  duel(G, { dist: 8, ai: false, form: 2 });
  // parried
  let t0 = { x: d.position.x, z: d.position.z }, imp = null;
  const pv0 = d.posture;
  let parried = 0;
  G.watch = null;
  const w0 = (n, e) => { if (n === 'dragon:parried' && e?.attack === 'votiveFist') parried++; };
  place(G, 8);
  t0 = { x: d.position.x, z: d.position.z };
  G.defend = makeDefender(G, {});
  G.watch = w0;
  d.brain.trigger('votiveFist');
  let acted = false;
  run(G, 6, () => { G.defend.act(); game.mouseGround.set(d.position.x, 0, d.position.z); if (d.brain.act?.name === 'votiveFist') imp = { x: d.position.x, z: d.position.z }; }, () => { if (d.mode === 'act') acted = true; return acted && d.mode !== 'act' && d.mode !== 'react'; });
  G.watch = null;
  G.defend = null;
  G.input.up(1);
  const travel = imp ? flatDist(t0, imp) : 0;
  out(`     parried: travel ${travel.toFixed(2)} m in the blink, posture ${pv0.toFixed(0)} -> ${d.posture.toFixed(0)}, overshoots ${B.stats.overshoots}`);
  assert(parried === 1 && B.stats.dashes >= 1 && travel > 5, `the blink crossed ${travel.toFixed(1)} m behind the fist; the hero parried it`);
  assert(d.posture - pv0 >= V.parryPosture || d.broken, `parried: a big posture hit (+${(d.posture - pv0).toFixed(0)} >= ${V.parryPosture})`);
  assert(B.stats.overshoots === 1, 'parried: he skids on past the hero');
  // blocked, landed
  settle(G);
  d.posture = 0;
  const hp0 = p.hp;
  placeIn(G, 7);
  fireAt(G, 'votiveFist', 'guard');
  const blocked = G.hits.at(-1);
  assert(blocked?.r === RESULT.BLOCKED && p.hp === hp0, `blocked: no damage (${blocked?.r})`);
  settle(G);
  p.debug.heal();
  const hp1 = p.hp;
  placeIn(G, 7);
  fireAt(G, 'votiveFist', 'none');
  const landed = G.hits.at(-1);
  out(`     landed: ${hp1} -> ${p.hp} hp (${TUNING.boost.votive.damage} x ${TUNING.damageScale})`);
  assert(landed?.r === RESULT.HIT && p.hp < hp1, `landed: it hurts (${landed?.r})`);
  // dodged with a piece behind the hero: the fist carries on into it
  settle(G);
  p.debug.heal();
  // (measured: what a miss can reach: his body stops at his bound, the crater 0.9 m on, the wave `wave` m more)
  const V2 = TUNING.boost.votive, R2 = d.bound + 0.9 + V2.wave;
  const list = game.world.destructibles.list;
  const cands = list.filter((b) => !b.floor && b.hp < Infinity && b.y0 < 0.5 && b.state === 0 && b.kind !== 'ladle' && Math.hypot(b.x, b.z) - b.r < R2 - 0.3);
  const piece = cands.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  out(`     a miss reaches ${R2.toFixed(1)} m from the middle: ${cands.length} pieces of the set within it (${[...new Set(cands.map((b) => b.kind))].join(', ')})`);
  assert(!!piece, `a piece to stand in front of (${piece?.kind} at ${piece?.x.toFixed(1)}, ${piece?.z.toFixed(1)}, r ${piece?.r})`);
  if (piece) {
    const l = Math.hypot(piece.x, piece.z), ux = piece.x / l, uz = piece.z / l;
    // (the hero near his floor's edge in front of it, the boss 8 m further in)
    const hl = Math.min(l - piece.r - 1.5, d.bound - 1.5);
    const hx = ux * hl, hz = uz * hl;
    d.position.set(hx - ux * 8, 0, hz - uz * 8);
    d.yaw = Math.atan2(ux, uz);
    run(G, 0.1);
    p.debug.teleport(hx, hz);
    p.yaw = Math.atan2(-ux, -uz);
    game.mouseGround.set(d.position.x, 0, d.position.z);
    const hp2 = piece.hp, c0 = B.stats.carries, k0 = B.stats.craters;
    p.debug.god = true;
    const stepD = answer(G, 'dodge', 'votiveFist');
    d.brain.trigger('votiveFist');
    acted = false;
    run(G, 6, stepD, () => { if (d.mode === 'act') acted = true; return acted && d.mode !== 'act' && p.state !== 'roll'; });
    G.watch = null;
    G.input.axis = { x: 0, y: 0 };
    out(`     dodged: carries ${B.stats.carries - c0}, the ${piece.kind}'s hp ${hp2} -> ${piece.hp} (${piece.state}), craters ${B.stats.craters - k0}, he ended ${flatDist(d.position, piece).toFixed(2)} m from it`);
    assert(B.stats.carries - c0 === 1 && B.stats.craters - k0 >= 1, 'a dodged booster punch carries on, a crater where it ends');
    assert(piece.hp < hp2 || piece.state !== 0, `... into what stood behind the hero (the ${piece.kind} struck)`);
  }
}

async function scenarioBoostRosary() {
  out('\n== scenario BOOST ROSARY (his flurry from phase 2: 7 - 10 pistons in a stutter, the last blue; it chips what stands beside the hero) ==');
  const counts = [0, 0.25, 0.5, 0.75, 0.999].map((r) => realise('rosary', 2, () => r).hits);
  assert(Math.min(...counts) >= 7 && Math.max(...counts) <= 10 && new Set(counts).size >= 2, `7 - 10 blows as drawn (${counts.join(', ')})`);
  const A = realise('rosary', 3, () => 0.5);
  const gaps = A.beats.slice(1).map((b, i) => b.impact - A.beats[i].impact);
  out(`     P3 r0.5: ${A.hits} blows, impacts ${gaps.map((g) => g.toFixed(2)).join(' ')} s apart, ${(A.end).toFixed(2)} s in all`);
  assert(A.beats.at(-1).def.tell === TELL.BLUE && A.beats.slice(0, -1).every((b) => b.def.tell === TELL.NORMAL), 'normal blows, the last blue');
  assert(STREAKS[1] === 'rosary' && STREAKS[2] === 'rosary' && STREAKS[3] === 'rosary', 'it is his flurry in phases 2 - 4');
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player, B = bo(G);
  duel(G, { dist: 1.8, ai: false, form: 2 });
  place(G, 1.8);
  p.debug.god = true;
  const log = flashLog(G);
  const c0 = B.stats.chips;
  const ok = d.brain.startStreak(3);
  const hits = d.brain.act?.hits ?? 0;
  run(G, 8, () => { G.input.press(1); game.mouseGround.set(d.position.x, 0, d.position.z); }, () => d.mode !== 'act');
  G.input.up(1);
  G.watch = null;
  const fg = log.slice(1).map((f, i) => f.t - log[i].t);
  out(`     through the brain: ${hits} blows (${tellsOf(log)}), flashes ${fg.map((g) => g.toFixed(2)).join(' ')} s apart, chips ${B.stats.chips - c0}, ${G.counts['dragon:flurry'] ?? 0} dragon:flurry`);
  assert(ok && d.brain.last[0] === 'rosary' && hits >= 7 && log.length === hits && tellsOf(log).endsWith('B') && !tellsOf(log).slice(0, -1).includes('B'), `the streak launches the whole Rosary, its last blow blue (${tellsOf(log)})`);
  assert(fg.every((g) => g >= TUNING.minHitGap - 0.02), `readable: no two cues under ${TUNING.minHitGap} s apart (shortest ${Math.min(...fg).toFixed(3)})`);
  assert(B.stats.chips - c0 >= hits - 1, `every piston chips beside the hero (${B.stats.chips - c0})`);
}

async function scenarioBoostDescent() {
  out('\n== scenario BOOST DESCENT (up on the thrusters, the hang over the mark, the dive knee: a crater, plates thrown) ==');
  const P = TUNING.boost.descent;
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player, B = bo(G);
  duel(G, { dist: 6, ai: false, form: 3 });
  place(G, 6);
  p.debug.god = true;
  const hero = { x: p.position.x, z: p.position.z };
  const plates = pieces(G, 'plate').filter((b) => Math.hypot(b.x - hero.x, b.z - hero.z) < P.r + 1.5);
  const hp0 = plates.map((b) => b.hp);
  let maxY = 0, tTop = NaN, tDown = NaN, land = null;
  const log = flashLog(G);
  d.brain.trigger('descent');
  let acted = false;
  run(G, 6, () => {
    game.mouseGround.set(d.position.x, 0, d.position.z);
    const y = d.position.y;
    maxY = Math.max(maxY, y);
    if (!Number.isFinite(tTop) && y >= P.h * 0.95) tTop = game.time;
    if (Number.isFinite(tTop) && !Number.isFinite(tDown) && y < P.h * 0.97 && d.brain.act?.beats[0] && d.brain.act.t > d.brain.act.beats[0].start + d.brain.act.beats[0].W * P.fall - 0.01) tDown = game.time;
    if (!land && d.brain.act?.beats[0]?.struck) land = { x: d.position.x, z: d.position.z };
  }, () => { if (d.mode === 'act') acted = true; return acted && d.mode !== 'act'; });
  G.watch = null;
  const struck = plates.filter((b, i) => b.hp < hp0[i] || b.state !== 0).length;
  const hit = G.hits.at(-1);
  out(`     up ${maxY.toFixed(1)} m, the hang ${(tDown - tTop).toFixed(2)} s at the top, landed ${land ? flatDist(land, hero).toFixed(2) : '-'} m from where the hero stood, ${struck} / ${plates.length} plates round it struck, craters ${B.stats.craters}, the hero: ${hit?.r} (${tellsOf(log)})`);
  assert(maxY >= P.h * 0.95 && tDown - tTop >= 0.45, `straight up ${maxY.toFixed(1)} m and a hang of ${(tDown - tTop).toFixed(2)} s (>= 0.45) so the mark reads`);
  assert(land && flatDist(land, hero) < 0.8 && hit?.r === RESULT.HIT && tellsOf(log) === 'R', 'the dive knee comes down on the hero who stood still (red)');
  assert(B.stats.craters >= 1 && struck >= 3, `a crater; the plates round it thrown (${struck})`);
  // rolled out of it: nothing
  settle(G);
  p.debug.heal();
  p.debug.god = false;
  const hp1 = p.hp;
  blowAnd(G, 'descent', 'dodge', { dist: 6, god: false });
  assert(p.hp === hp1, `a roll at the glint takes the hero out of it (${G.hits.at(-1)?.r})`);
}

async function scenarioBoostStrings() {
  out('\n== scenario BOOST STRINGS (Censer Wheel: blue, n, blue; Thurible: n, blue, blue; off the floor on the kick) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player;
  duel(G, { dist: 7, ai: false, form: 3 });
  for (const [name, dist, want] of [['censerWheel', 7, 'BNB'], ['thurible', 2.2, 'NBB']]) {
    settle(G);
    p.debug.heal();
    let maxY = 0;
    const prevAct = d.brain.stats.picks;
    const r = (() => {
      place(G, dist);
      p.debug.god = true;
      G.defend = makeDefender(G, {});
      const log = flashLog(G);
      d.brain.trigger(name);
      let acted = false;
      run(G, 8, () => { G.input.axis = { x: 0, y: 0 }; game.mouseGround.set(d.position.x, 0, d.position.z); G.defend.act(); if (d.brain.act?.name === name) maxY = Math.max(maxY, d.position.y); }, () => { if (d.mode === 'act') acted = true; return acted && d.mode !== 'act' && p.state !== 'roll'; });
      G.defend = null;
      G.watch = null;
      G.input.up(1);
      return log;
    })();
    void prevAct;
    const res = G.hits.slice(-3).map((h) => h.r).join(', ');
    out(`     ${name}: ${tellsOf(r)} (${r.map((f) => f.t.toFixed(2)).join(' ')}), up ${maxY.toFixed(2)} m, results ${res}`);
    assert(tellsOf(r) === want || (tellsOf(r).length < want.length && want.startsWith(tellsOf(r))), `${name}: ${want} (${tellsOf(r)}; a parried blue moment may end it)`);
    assert(maxY >= 0.5 || tellsOf(r).length < 3, `${name}: off the floor on the rising kick (${maxY.toFixed(2)} m)`);
  }
}

async function scenarioBoostVespers() {
  out('\n== scenario BOOST VESPERS (overclock: four announced passes through the hero from different sides, the last from above) ==');
  const VS = TUNING.boost.vespers;
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player, B = bo(G);
  duel(G, { dist: 4, ai: false, form: 4 });
  const sights = [];
  const sl = d.fx.passLine?.bind(d.fx);
  d.fx.passLine = (...a) => { if (d.brain.act?.name === 'vespers') sights.push(game.time); return sl?.(...a); };
  const dirs = [];
  const watchDirs = () => { for (const b of d.brain.act?.name === 'vespers' ? d.brain.act.beats : []) if (b._fsP?.fixed && !b._fsSeen) { b._fsSeen = true; dirs.push(Math.atan2(b._fsP.dx, b._fsP.dz)); } };
  // the hero stands his ground: every pass comes through him
  place(G, 4);
  p.debug.god = true;
  const log = flashLog(G);
  const n0 = G.hits.length, sw0 = B.stats.swept;
  d.brain.trigger('vespers');
  let acted = false;
  run(G, 10, () => { G.input.axis = { x: 0, y: 0 }; game.mouseGround.set(d.position.x, 0, d.position.z); watchDirs(); }, () => { if (d.mode === 'act') acted = true; return acted && d.mode !== 'act'; });
  G.watch = null;
  const fg = log.slice(1).map((f, i) => f.t - log[i].t);
  const turns = dirs.slice(1).map((a, i) => Math.abs(Math.atan2(Math.sin(a - dirs[i]), Math.cos(a - dirs[i]))));
  const lead = log.map((f) => { const s = sights.filter((t) => t <= f.t - 0.2); return s.length ? f.t - s[s.length - 1] < 0.4 ? f.t - Math.min(...sights.filter((t) => t > f.t - 1.2 && t <= f.t)) : 0 : 0; });
  out(`     ${tellsOf(log)}: cues ${fg.map((g) => g.toFixed(2)).join(' / ')} s apart; the lines turn ${turns.map((t) => t.toFixed(2)).join(' / ')} rad; each line shown ${lead.map((x) => x.toFixed(2)).join(' / ')} s before its cue; ${G.hits.length - n0} reached the hero (${G.hits.slice(n0).map((h) => h.r).join(', ')}); ${B.stats.swept - sw0} sweeps of the world`);
  assert(tellsOf(log) === 'B'.repeat(VS.passes) + 'R', `${VS.passes} blue passes and the red one from above (${tellsOf(log)})`);
  assert(fg.every((g) => g >= 0.45), `a watcher can follow: >= 0.45 s between passes (${Math.min(...fg).toFixed(2)})`);
  assert(turns.length >= VS.passes - 1 && turns.slice(0, VS.passes - 1).every((t) => t >= 0.5), `each from another side (the lines turn >= 0.5 rad: ${turns.map((t) => t.toFixed(2)).join(', ')})`);
  assert(lead.every((x) => x >= 0.4), `each line shown >= 0.4 s before its cue (${lead.map((x) => x.toFixed(2)).join(', ')})`);
  assert(G.hits.length - n0 >= VS.passes, `the passes go through the hero who stood (${G.hits.length - n0})`);
  assert(B.stats.swept - sw0 >= VS.passes && B.stats.craters >= 1, 'each line breaks what it crosses; the last craters');
  // parried throughout
  settle(G);
  p.debug.heal();
  const n1 = G.hits.length;
  const { log: l2 } = moveWithBot(G, 'vespers', 4, { god: false });
  const res = G.hits.slice(n1).map((h) => h.r);
  out(`     against the defender: ${tellsOf(l2)} → ${res.join(', ')}, hero hp ${p.hp}`);
  assert(res.length >= 1 && res.every((r) => r !== RESULT.HIT) && p.hp === p.maxHp, 'each pass that reaches the defender is answered (parried; the last rolled): no damage');
}

async function scenarioBoostRite() {
  out('\n== scenario BOOST RITE (Last Rite: phase 4 under 8 %, once; caught: a blast that never kills; dodged: he is open) ==');
  const R = TUNING.boost.rite;
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player, B = bo(G);
  duel(G, { dist: 3, ai: true, form: 4 });
  const w = (hp) => { d.hp = d.maxHp * hp; return d.weigh('lastRite', MOVES.lastRite, 1, 3); };
  assert(w(0.5) === 0 && w(0.07) > 1, `weighed only under ${R.below * 100} % (${w(0.5)} at 50 %, ${w(0.07)} at 7 %)`);
  // his AI throws it once he is under the line, and once only (the hero in god mode, standing)
  d.hp = d.maxHp * 0.07;
  p.debug.god = true;
  let seen = 0, at = NaN;
  const wins = [];
  G.watch = (n, e) => { if (n === 'dragon:windup') wins.push(e?.name); if (n === 'dragon:windup' && e?.name === 'lastRite') { seen++; at = flatDist(d.position, p.position); } };
  // (the hero kept on his floor: a knock-back past its edge leaves every move of his out of band)
  run(G, 24, () => { G.input.axis = { x: 0, y: 0 }; game.mouseGround.set(d.position.x, 0, d.position.z); if (d.hp > d.maxHp * 0.07) d.hp = d.maxHp * 0.07; if (d.mode === 'foot' && Math.hypot(p.position.x, p.position.z) > 12.5) placeIn(G, 3); });
  G.watch = null;
  out(`     his AI threw it ${seen}x in 24 s (from ${at.toFixed(2)} m: ${B.stats.riteHits ? 'caught' : 'missed, open'}; his moves: ${wins.join(' ')})`);
  assert(seen === 1 && d.brain.trigger('lastRite') === false, `once a fight (${seen}; the Lab's trigger refused after)`);
  // caught, the hero on 30 hp: he lives
  const G3 = build();
  const d3 = G3.game.dragon, p3 = G3.game.player, B3 = bo(G3);
  duel(G3, { dist: 2.5, ai: false, form: 4 });
  d3.hp = d3.maxHp * 0.07;
  place(G3, 2.5);
  p3.debug.god = false;
  p3.hp = 30;
  fireAt(G3, 'lastRite', 'none');
  out(`     caught: hero hp 30 -> ${p3.hp} (alive ${p3.alive}; ${R.damage} x ${TUNING.damageScale} capped), blast craters ${B3.stats.craters}`);
  assert(B3.stats.riteHits === 1 && p3.alive && p3.hp >= 1 && p3.hp < 30 && B3.stats.craters >= 1, 'caught: a heavy blast, never the hero\'s last HP');
  // dodged: open
  const G2 = build();
  const d2 = G2.game.dragon;
  duel(G2, { dist: 3, ai: false, form: 4 });
  d2.hp = d2.maxHp * 0.07;
  blowAnd(G2, 'lastRite', 'dodge', { dist: 3 });
  run(G2, 0.4);
  out(`     dodged: ${G2.hits.at(-1)?.r}; open ${bo(G2).stats.riteOpen}, his posture broke ${G2.counts['dragon:postureBreak'] ?? 0}x`);
  assert(bo(G2).stats.riteOpen === 1 && G2.counts['dragon:postureBreak'] >= 1, 'dodged: he is wide open (his posture breaks)');
  d2.reset();
  assert(!bo(G2).riteUsed, 'his reset gives it back');
}

async function scenarioBoostChange() {
  out('\n== scenario BOOST CHANGE (through a phase\'s change, until its ring, nothing lands on him) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon;
  duel(G, { dist: 4, ai: true });
  game.player.debug.god = true;
  d.hp = d.maxHp * TUNING.phaseAt[1] + 20;
  d.mode = 'foot';
  d.brain.act = null;
  d.takeHit({ damage: 400, part: 'body', heavy: true, exact: true });
  run(G, 1.5, null, () => d.brain.act?.name === TRANSITIONS[2]);
  assert(d.brain.act?.name === TRANSITIONS[2], `the change begins (${d.brain.act?.name})`);
  run(G, 0.4);
  const hp0 = d.hp, pv0 = d.posture;
  const pt = new THREE.Vector3(d.position.x, 1.2, d.position.z);
  const dealt = d.takeHit({ damage: 60, part: 'body', point: pt, dir: { x: 0, z: 1 }, swing: true });
  assert(d.brain.act?.def.transition && dealt === 0 && d.hp === hp0 && d.posture === pv0, `mid-change a cut does nothing (${dealt} damage, hp ${hp0} -> ${d.hp})`);
  run(G, 6, null, () => d.mode !== 'act');
  d.brain.aiEnabled = false;
  const d1 = d.takeHit({ damage: 60, part: 'body', point: pt, exact: true });
  assert(d1 > 0, `after it, cuts land again (${d1})`);
}

/** A god-mode hero that holds the guard through every normal / blue cue and rolls out of a red one, roaming between standoffs (veil.mjs's pace defender). */
function bPaceDefender(G) {
  const pend = [];
  let guardUntil = -1;
  return {
    onEvent(n, e) {
      if (n !== 'combat:flash' || (e?.source !== 'dragon' && e?.source !== 'world')) return;
      pend.push({ tell: e.tell, at: G.game.time + (e.source === 'world' ? 0.3 : TUNING.flashLead), x: e.x, z: e.z, hazard: !!e.hazard && !e.bullet, done: false });
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
          }
        } else {
          e.done = true;
          guardUntil = Math.max(guardUntil, e.at + 0.2);
        }
      }
      if (guardUntil > t) input.press(1);
      else if (guardUntil > 0) { guardUntil = -1; input.up(1); }
      return rolled;
    },
  };
}

async function scenarioBoostPace() {
  const SECS = Number(process.env.GCD_BPSECS ?? 45);
  const SEEDS = (process.env.GCD_BPSEEDS ?? '4242').split(',').map(Number).filter(Number.isFinite);
  out(`\n== scenario BOOST PACE (a measure: cues a minute per phase against a god-mode guarding bot that roams 2.5 / 5 / 9 m; ${SECS} s a phase, seeds ${SEEDS.join(', ')}) ==`);
  for (const seed of SEEDS) {
    for (let ph = 1; ph <= 4; ph++) {
      const G = build(seed, true);
      const { game } = G;
      const d = game.dragon, p = game.player, B = bo(G);
      duel(G, { dist: 3, ai: true, form: ph });
      p.debug.god = true;
      p.debug.noRiposte = true;
      G.defend = bPaceDefender(G);
      Math.random = mulberry32(seed * 7 + ph);
      const flashes = [], acts = {};
      G.watch = (n, e) => {
        if (n === 'combat:flash' && (e?.source === 'dragon' || e?.source === 'world')) flashes.push(game.time);
        if (n === 'dragon:windup' && e?.name) acts[e.name] = (acts[e.name] ?? 0) + 1;
      };
      const roam = mulberry32(seed * 31 + ph), goal = { r: 2.5, a: 0, until: -1 };
      const t0 = game.time, s0 = B.stats.steps, trail = [];
      for (let i = 0; i < Math.round(SECS / DT); i++) {
        const rolled = G.defend.act();
        if (game.time > goal.until) {
          goal.r = [2.5, 5, 9][Math.floor(roam() * 3)];
          goal.a = Math.atan2(p.position.x - d.position.x, p.position.z - d.position.z) + (roam() - 0.5) * 1.6;
          goal.until = game.time + 4;
        }
        if (!rolled && p.state !== 'roll') {
          const gx = d.position.x + Math.sin(goal.a) * goal.r, gz = d.position.z + Math.cos(goal.a) * goal.r;
          const k = Math.hypot(gx, gz) > 12 ? 12 / Math.hypot(gx, gz) : 1;
          const dx = gx * k - p.position.x, dz = gz * k - p.position.z, l = Math.hypot(dx, dz);
          G.input.axis = l > 0.5 ? { x: dx / l, y: -dz / l } : { x: 0, y: 0 };
        }
        game.mouseGround.set(d.position.x, 0, d.position.z);
        G.tick(DT);
        trail.push([game.time, (d.mode === 'act' ? `act ${d.brain.act?.name}` : d.mode === 'react' ? `react ${d.brain.react?.kind}` : d.mode) + (game.world.forest.foundry?.molten?.at?.(d.position.x, d.position.z) ? ' (in a pool)' : ''), Math.round(flatDist(d.position, p.position))]);
        if (d.phase !== ph && d.mode !== 'act') break;
      }
      const secs = game.time - t0;
      const gaps = flashes.slice(1).map((t, i) => t - flashes[i]);
      // (what he did through the longest gap between two cues)
      const gi = gaps.indexOf(Math.max(...gaps, 0)), g0 = flashes[gi] ?? t0, g1 = flashes[gi + 1] ?? game.time;
      const what = {};
      for (const [t, m] of trail) if (t > g0 && t < g1) what[m] = (what[m] ?? 0) + 1;
      const whatS = Object.entries(what).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${(v * DT).toFixed(1)} s`).join(', ');
      const top = Object.entries(acts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
      out(`     seed ${seed} P${ph}: ${(flashes.length / secs * 60).toFixed(0)} cues/min over ${secs.toFixed(0)} s, longest gap ${gaps.length ? Math.max(...gaps).toFixed(1) : '-'} s (${whatS}), ${B.stats.steps - s0} jet steps; moves: ${top}`);
      G.defend = null;
      G.watch = null;
      assert(flashes.length > 0, `P${ph}: he fights (${flashes.length} cues)`);
    }
  }
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
  // --- fx
  // --- melee
  // --- boost
  boostStep: scenarioBoostStep,
  boostVotive: scenarioBoostVotive,
  boostRosary: scenarioBoostRosary,
  boostDescent: scenarioBoostDescent,
  boostStrings: scenarioBoostStrings,
  boostVespers: scenarioBoostVespers,
  boostRite: scenarioBoostRite,
  boostChange: scenarioBoostChange,
  boostPace: scenarioBoostPace,
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
