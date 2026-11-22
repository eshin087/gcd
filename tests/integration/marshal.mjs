// The Brazen Foundry and the Clockwork Marshal, headless (COMBAT.md → "The Clockwork Marshal"; ADR-135,
// ADR-136, ADR-137): the REAL Player, ClockworkMarshal, Hud, GameFlow, AudioEngine and Lab (+ real
// LightPool, GlyphParticles, FireField, CameraRig, Events) wired like src/main.js for `?level=foundry`; the
// world is a light mock on the real Colliders filled by the real set (world/foundry.js), or the real set
// with its breakables (`real`). A bot drives the input. Cloned from lord.mjs's harness.
// usage: node marshal.mjs <repoRoot> [scenario]   (env: ABYSS_SEED=n reseeds the AI)
//   scenario: level | data | timing | plates | handover | lance | world | flow | win | pace | reward | all
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
const { createFoundry, FOUNDRY } = await imp('src/world/foundry.js');
const { Destructibles, STATE } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
const { ClockworkMarshal } = await imp('src/entities/enemies/marshal/marshal.js');
const { Duelist } = await imp('src/entities/enemies/duelist/duelist.js');
const { perPhase } = await imp('src/entities/enemies/duelist/realise.js');
const { MOVES, MOVE_NAMES, CLIPS_BY_BODY, COUNTER, STREAK, TRANSITIONS, realise } = await imp('src/entities/enemies/marshal/moves.js');
const { TUNING } = await imp('src/entities/enemies/marshal/tuning.js');
const { MARSHAL_ITEMS, MARSHAL_LOADOUT, LANCE } = await imp('src/entities/enemies/marshal/gear.js');
const { PLATE_NAMES } = await imp('src/entities/enemies/marshal/plates.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

const LVL = getLevel('foundry');
const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(process.env.ABYSS_SEED ?? 4242);
const DT = 1 / 60;
const FORMS = 4;
const leadOf = (ph) => perPhase(TUNING.flashLead, ph);
const timingOf = (ph) => (ph >= 4 ? TUNING.pilotTiming : TUNING.suitTiming);
const weightIn = (def, f) => (Array.isArray(def.weight) ? def.weight[f - 1] ?? 0 : def.weight ?? 0);
/** The phases a move is used in (its weight; a counter / flurry: phase 4; a transition: the phase it begins). */
const formsOf = (name) => {
  const def = MOVES[name];
  if (def.transition) return [def.phase];
  if (def.counter) return [4];
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
// the yard's real colliders (the furnace, the cog, the gate, the props), built once
const HALL_SET = (() => {
  const c = new Colliders();
  const set = createFoundry(createSharedUniforms(), c);
  return { set, circles: c.circles.map((k) => ({ ...k })) };
})();

/** `real`: the crater built anew with its breakables (world.destructibles, the scars, the set's
 *  ambience), for the moves that use them (ADR-109); without it the world is the mock the older
 *  scenarios were written on (the set's colliders, no pieces). */
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
  const set = real ? createFoundry(U, colliders) : null;
  if (!set) for (const k of HALL_SET.circles) colliders.add(k.x, k.z, k.r, k.tag);
  const counters = { spawns: 0, flares: 0, burns: 0 };
  const world = {
    colliders, bonfire: { ...CONFIG.world.bonfire }, nest: { x: 0, z: -6 },
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
    world.ignite = (x, z, r, k = 1) => world.destructibles.ignite(x, z, r, k);
    world.restore = () => { world.destructibles.reset(); world.scars.reset(); };
    world.update = (dt) => { world.destructibles.update(dt); world.scars.update?.(dt); set.ambience?.update?.(dt, game); };
    set.ambience?.setup?.(game);
  }
  game.audio = new AudioEngine(game);
  game.player = new Player(game);
  // (his rig is built on a stream of its own: every THREE object draws Math.random for its uuid, so a
  // body look with more pieces (?lordLook=b, the owner's pick) would otherwise shift the AI's seeded
  // stream and replay every fight with another seed. The picks, 2026-11-16)
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
    G.hits.push({ t: game.time, r, attack: h?.attack, tell: h?.tell, damage: h?.damage, kind: h?.kind });
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
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture].every(Number.isFinite)) throw new Error('marshal NaN');
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

/** Title → the duel (the Lab's flow jump), in form `form`, the hero `dist` m in front of him, facing him. */
function duel(G, { dist = 4, ang = 0, ai = false, form = 1 } = {}) {
  const { game } = G;
  run(G, 0.2);
  game.flow.debug.toState('boss');
  const d = game.dragon;
  d.debug.setAI(ai);
  if (form > 1) d.debug.setForm(form);
  d.position.set(0, 0, -2);
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
const dist2 = (G) => Math.hypot(G.game.player.position.x - G.game.dragon.position.x, G.game.player.position.z - G.game.dragon.position.z);

// ---- the defender bot: answers his tells from the flash (parry normal / blue, roll through red)
// style (the STRATEGY measurement): 'mixed' = the above; 'dodge' = a perfect dodge of every tell, never a
// parry; 'parry' = parries, and a red blow rolled early (i-frames, outside the perfect window)
function makeDefender(G, { skill = 1, early = 0.12, style = 'mixed', rng = null, world = false } = {}) {
  const pend = [];
  const stats = { flashes: 0, parryTry: 0, dodgeTry: 0, skipped: [] };
  return {
    stats,
    onEvent(n, d) {
      if (n === 'combat:flash' && (d?.source === 'dragon' || (world && d?.source === 'world'))) {
        stats.flashes++;
        // (`rng`: the probe's own stream, so a bot's misses do not move the AI's seeded stream)
        if (skill < 1 && (rng ?? Math.random)() > skill) { stats.skipped?.push([G.game.time, d.attack]); return; }
        pend.push({ tell: d.tell, at: G.game.time + (d.source === 'world' ? 0.3 : leadOf(G.game.dragon.phase)), x: d.x, z: d.z, hazard: !!d.hazard && !d.bullet, done: false });
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
            // across his blade; out of a marked circle: straight away from its centre
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

/** Fence: keep close, answer every tell, cut in his openings, give the deathblow to a broken lord. */
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

/** Break him and give the deathblow with the hero's own attack press. Returns the form after it. */
function deathblow(G, how = 'posture') {
  const { game, input } = G;
  const d = game.dragon;
  if (how === 'posture') d.debug.postureBreak();
  else d.takeHit({ damage: 99999, exact: true, plate: false });
  run(G, 0.3);
  place(G, 2.0);
  const was = d.phase;
  run(G, 4, () => { if (((game.realTime * 60) | 0) % 12 === 0 && d.broken) input.click(0); }, () => d.phase !== was || d.mode === 'dying');
  return d.phase;
}

// ================================================================== scenario: level
async function scenarioLevel() {
  out('\n== scenario LEVEL (the registry, the set, the world numbers, the music) ==');
  assert(LEVELS.includes(LVL) && getLevel('marshal') === LVL && getLevel('clockwork') === LVL && levelFromSearch('?level=foundry') === LVL, 'the Brazen Foundry is in the registry (?level=foundry and its aliases)');
  assert(LVL.reward === 'fireLance' && LVL.name === 'The Brazen Foundry', `its name and reward (${LVL.reward})`);
  const W = LVL.world;
  assert(W.arenaRadius === 15 && W.dragonBound === 13.2 && W.playerBound === 40 && W.dragonSleep.z === -6 && W.bossTriggerZ > 13 && W.bossTriggerZ < 16, 'its world numbers: a 15 m yard, the marshal kneeling at z -6, the trigger at the gate');
  const T = LVL.text;
  assert(['arrive', 'stir', 'phase2', 'phase3', 'phase4', 'victory', 'fallen', 'restReset', 'again', 'rise'].every((k) => T[k]), 'every line of the flow');
  const set = HALL_SET.set;
  const B = set.breakables, kinds = {};
  for (const b of B) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
  const non = B.filter((b) => !b.floor).length;
  assert(kinds.rack === 6 && kinds.dummy === 8 && kinds.banner === 4 && kinds.keg === 6 && kinds.crucible === 4 && kinds.ingots === 6 && kinds.anvil === 3 && kinds.sentinel === 8, `the yard's pieces ${JSON.stringify(kinds)}`);
  assert(non <= 60 && (kinds.flagstone ?? B.filter((b) => b.floor).length) > 200, `${non} pieces (<= 60) and ${B.filter((b) => b.floor).length} floor slabs`);
  assert(B.filter((b) => !b.floor).every((b) => b.look === 'prop') && B.filter((b) => b.floor).every((b) => b.look === 'range'), 'every piece drawn through prop art, the floor as range pieces');
  assert(B.filter((b) => b.kind === 'anvil').every((b) => b.hp === Infinity) && B.filter((b) => b.kind === 'crucible').every((b) => b.mat === 'metal'), 'anvils only chip, crucibles are metal');
  assert(set.ash === true && Array.isArray(set.scarInk) && typeof set.grass?.density === 'function', 'soot falls (ash), a dark scar ink, grey grass');
  const near = (x, z, r) => HALL_SET.circles.some((c) => Math.hypot(c.x - x, c.z - z) < r);
  assert(near(FOUNDRY.furnace.x, FOUNDRY.furnace.z, 1) && near(FOUNDRY.cog.x, FOUNDRY.cog.z, 1.3) && near(FOUNDRY.gate.x, FOUNDRY.gate.z, 0.5), 'the furnace, the cogwheel and the gate posts have colliders');
  const { SCORE, allTrackFiles } = await imp('src/audio/trackList.js');
  const L = SCORE.levels.foundry;
  assert(L && L.phases.length === 4 && L.explore, 'its music: explore and four phases');
  const files = allTrackFiles();
  const missing = files.filter((f) => !fs.existsSync(`${ROOT}/assets/audio/${f}`) && !fs.existsSync(`${ROOT}/assets/music/${f}`) && !fs.existsSync(`${ROOT}/${f}`));
  assert([L.explore, ...L.phases].every((t) => files.includes(t.file)), 'its tracks are listed');
  void missing;
  // the boss is built and kneels
  const G = build();
  const d = G.game.dragon;
  assert(d instanceof ClockworkMarshal && d instanceof Duelist && d.name.startsWith('GONGSHU YAN'), `the boss is the Clockwork Marshal (${d.name})`);
  assert(d.mode === 'sleep' && Math.abs(d.position.z + 6) < 0.01 && d.body === 'suit' && Math.abs(d.lean.scale - TUNING.suit.scale) < 1e-9, 'kneeling at z -6 in the suit, drawn at 1.75');
  assert(d.lives.total === 2 && d.lives.left === 2, 'two lives: the suit and the pilot');
}

// ================================================================== scenario: data
async function scenarioData() {
  out('\n== scenario DATA (move data rules per body, every phase a move is used in, both ends of every roll) ==');
  let checked = 0;
  const count = [0, 0, 0, 0, 0];
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    const forms = formsOf(name);
    if (!forms.length) assert(false, `${name}: used in at least one phase`);
    if (!def.transition && !def.counter && !(Array.isArray(def.weight) && def.weight.length === FORMS)) assert(false, `${name}: a weight per phase`);
    for (const f of forms) {
      if (!def.transition && !def.counter) count[f]++;
      const TT = timingOf(def.transition ? def.phase : f);
      for (const breastLost of f <= 3 ? [false, true] : [false]) {
        for (const r of [0, 0.35, 0.7, 0.999]) {
          const A = realise(name, def.transition ? def.phase - 1 : f, () => r, { breastLost });
          const real = A.beats.filter((b) => !b.feint);
          const tag = `${name} phase ${f}${breastLost ? ' (breast off)' : ''} r${r}`;
          if (!real.length) assert(false, `${tag}: a real hit`);
          if (!real.every((b) => [TELL.NORMAL, TELL.BLUE, TELL.RED, TELL.BLACK].includes(b.def.tell))) assert(false, `${tag}: a tell on every real hit`);
          const first = real[0];
          if (!def.transition && !(first && first.impact - first.tellAt >= TT.minFirstWindup - 1e-6)) assert(false, `${tag}: first real windup ${first ? (first.impact - first.tellAt).toFixed(3) : '-'} >= ${TT.minFirstWindup}`);
          for (let i = 1; i < real.length; i++) if (!(real[i].impact - real[i - 1].impact >= TT.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${(real[i].impact - real[i - 1].impact).toFixed(3)} s apart >= ${TT.minHitGap}`);
          for (let i = 1; i < real.length; i++) if (!(real[i].flash >= real[i - 1].impact - 1e-6)) assert(false, `${tag}: hit ${i}'s flash comes after hit ${i - 1} lands`);
          for (const b of real) if (!(b.def.zone || b.def.release || b.def.cast)) assert(false, `${tag}: hit ${b.hit} has a zone, a release or a cast`);
          for (const b of real) if (b.def.tell === TELL.RED && b.def.zone?.kind === 'ring' && !b.def.ring) assert(false, `${tag}: a red ring marks the ground`);
          if (!(A.end > A.recoveryStart && Math.abs(A.clip.dur - A.end) < 1e-9)) assert(false, `${tag}: clip spans the move`);
          const body = (def.transition ? def.phase : f) >= 4 ? 1 : 0;
          if (!(A.clip.kit === CLIPS_BY_BODY[body].clash.kit)) assert(false, `${tag}: compiled round its body's stance`);
          checked++;
        }
      }
    }
  }
  assert(checked > 150, `${checked} realisations obey the rules (a tell per hit, the suit's first windup >= ${TUNING.suitTiming.minFirstWindup} s and hits >= ${TUNING.suitTiming.minHitGap} s apart, the pilot's ${TUNING.pilotTiming.minFirstWindup} / ${TUNING.pilotTiming.minHitGap}, each flash after the hit before it)`);
  for (let f = 1; f <= FORMS; f++) assert(count[f] >= 6, `phase ${f}: ${count[f]} moves`);
  for (const [ph, mv] of Object.entries(TRANSITIONS)) assert(MOVES[mv]?.transition && MOVES[mv].phase === Number(ph), `phase ${ph} begins with ${mv}`);
  assert(MOVES[COUNTER]?.counter && MOVES[STREAK]?.streak && realise(COUNTER, 4, () => 0.5) && realise(STREAK, 4, () => 0.5, { count: 5 })?.hits === 5, 'the pilot has her counter and her flurry');
  for (let f = 1; f <= 4; f++) {
    const T = timingOf(f);
    assert(leadOf(f) <= T.minHitGap + 1e-9, `phase ${f}: the glint (${leadOf(f)} s) fits inside the tightest gap (${T.minHitGap} s)`);
  }
  const bolts = (f, breastLost) => realise('fireLance', f, () => 0.5, { breastLost }).hits;
  assert(bolts(1, false) === 1 && bolts(2, false) === 2 && bolts(3, false) === 3 && bolts(1, true) === 2 && bolts(3, true) === 4, `the Fire Lance: ${[1, 2, 3].map((f) => bolts(f, false)).join(' / ')} bolts by phase, one more with the breastplate gone`);
  assert(realise('yardSweep', 1, () => 0.5).hits === 2 && realise('yardSweep', 2, () => 0.5).hits === 3, 'Drill-Yard Sweep gains its butt slam from phase 2');
  const flare = (f) => realise('ramThrust', f, () => 0.5).beats.find((b) => !b.feint).def.flare;
  assert(!flare(1) && flare(2) && flare(3), "Ram's Horn is a parry moment from phase 2");
  assert(MOVES.marshalLunge.beats[0].mikiri && MOVES.lastCharge.beats[0].lock && MOVES.lastCharge.beats[0].flare, 'the pilot: a mikiri lunge, a locking parry moment');
}

// ================================================================== scenario: timing (flash → contact)
async function scenarioTiming() {
  out('\n== scenario TIMING (every move from inside its band in each phase it is used: each glint is a blow, on time) ==');
  let worst = 0, moves = 0;
  const only = process.env.ABYSS_TMOVE;
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    if (def.transition) continue;
    if (only && name !== only) continue;
    for (const f of formsOf(name)) {
      const G = build();
      const d = G.game.dragon;
      const [lo, hi] = def.band;
      const at = def.counter ? 2.2 : Math.max(1.6, Math.min(hi - 0.4, lo + (Math.min(hi, 12) - lo) * 0.4));
      duel(G, { dist: at, form: f });
      G.game.player.debug.god = true;
      const flashes = [], contacts = [];
      G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') { flashes.push(G.game.time); if (only) out(`       ${G.game.time.toFixed(3)} flash ${e.attack} ${e.tell}`); } };
      const h0 = G.hits.length;
      const ok = name === STREAK ? d.debug.flurry(4) : d.debug.trigger(name);
      if (!ok) { assert(false, `${name} phase ${f}: starts`); continue; }
      run(G, 9, null, () => d.mode === 'foot' && !d.fx.crescentsAlive && !d.fx.strikesAlive && d._mortar.left === 0);
      for (const h of G.hits.slice(h0)) if (h.r !== RESULT.IGNORED) { contacts.push(h.t); if (only) out(`       ${h.t.toFixed(3)} contact ${h.attack} ${h.kind} ${h.r}`); }
      const lead = leadOf(f);
      let w = 0;
      for (const c of contacts) {
        const fl = flashes.filter((t) => t <= c + 1e-6).pop();
        w = Math.max(w, fl === undefined ? Infinity : Math.abs(c - fl - lead));
      }
      worst = Math.max(worst, Number.isFinite(w) ? w : 9);
      moves++;
      if (!contacts.length || !(w <= 0.09)) assert(false, `${name} phase ${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
      else out(`     ${name.padEnd(14)} phase ${f} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
    }
  }
  if (only) return;
  assert(moves >= 30 && worst <= 0.09, `${moves} move × phase runs: every contact within ${(worst * 1000).toFixed(0)} ms of its flash + flashLead, every move's first hit lands`);
}

// ================================================================== scenario: plates
async function scenarioPlates() {
  out('\n== scenario PLATES (the facing rule, the soak, three ways to strip one, what each loss changes, minOff, dragon:plate) ==');
  const P = TUNING.plates;
  const G = build();
  duel(G, { dist: 3, form: 1 });
  const d = G.game.dragon, p = G.game.player;
  d.yaw = 0;
  const at = (ang, r = 2.5) => { p.debug.teleport(d.position.x + Math.sin(ang) * r, d.position.z + Math.cos(ang) * r); };
  const sides = [[0, 'breast'], [Math.PI, 'back'], [Math.PI / 2, 'left'], [-Math.PI / 2, 'right'], [0.5, 'breast'], [2.6, 'back']].map(([a, want]) => {
    at(a);
    return [want, d.plates.sideOf(p.position.x, p.position.z)];
  });
  assert(sides.every(([w, g]) => w === g), `a blow meets the plate on its side: ${sides.map(([w, g]) => `${w}=${g}`).join(' ')}`);
  assert(d.guarding === false, 'the suit raises no sword guard (its plates are its guard)');
  // the soak: from the front, 100 raw → 30 to the bar, 100 to the breastplate
  at(0);
  let hp0 = d.hp, s0 = d.plates.s.breast.hp;
  d.takeHit({ damage: 100, part: 'body' });
  const bar = hp0 - d.hp, plate = s0 - d.plates.s.breast.hp;
  assert(Math.abs(bar - 100 * P.soak) <= 1 && Math.abs(plate - 100) < 1e-6, `plated: the bar took ${bar.toFixed(0)} (soak ${P.soak}), the breastplate ${plate}`);
  s0 = d.plates.s.breast.hp;
  d.takeHit({ damage: 40, part: 'body', heavy: true });
  assert(Math.abs(s0 - d.plates.s.breast.hp - 40 * P.heavyK) < 1e-6, `a heavy blow bites the plate x${P.heavyK}`);
  // (a) cuts on one side strip it, and the event goes out
  const ev = [];
  G.watch = (n, e) => { if (n === 'dragon:plate') ev.push(e); };
  at(Math.PI / 2);
  let n = 0;
  while (d.plates.on('left') && n++ < 40) { d.takeHit({ damage: 30, part: 'body' }); run(G, 0.05); }
  assert(d.plates.off('left') && ev.some((e) => e.plate === 'left' && e.left === 4), `cuts on his left take the left plate off (${n} cuts; dragon:plate ${JSON.stringify(ev[0])})`);
  const M = d.T.move;
  assert(Math.abs(M.run - TUNING.moveSuit.run * P.left.lost.run) < 1e-6 && Math.abs(M.turn[0] - TUNING.moveSuit.turn[0] * P.left.lost.turn) < 1e-6, `a flank lost: run ${M.run.toFixed(2)} and turns x${P.left.lost.turn}`);
  // a bare back takes x1.4
  d.plates.shed('back', 'lab');
  at(Math.PI);
  hp0 = d.hp;
  d.takeHit({ damage: 20, part: 'body' });
  assert(Math.abs(hp0 - d.hp - 20 * P.backBare) <= 1, `the bare back: ${(hp0 - d.hp).toFixed(0)} from 20 (x${P.backBare})`);
  d.plates.reset();
  d._applyMove();
  // (b) a deathblow on a posture break with the bar still up: the helm first, then the weakest plate
  {
    const G2 = build();
    duel(G2, { dist: 3, form: 1 });
    const d2 = G2.game.dragon;
    d2.plates.s.right.hp = 50;
    hp0 = d2.hp;
    deathblow(G2, 'posture');
    run(G2, 2);
    const helmOff = d2.plates.off('helm');
    const p0 = d2.posture;
    d2.addPosture(10);
    const k = (d2.posture - p0) / 10;
    deathblow(G2, 'posture');
    assert(helmOff && d2.plates.off('right') && d2.hp < hp0 && Math.abs(k - P.helm.lost.posture) < 0.05, `deathblows tear the helm off first, then the weakest plate (right); the helm off: posture x${k.toFixed(2)}`);
  }
  // (c) a PERFECT parry of a Fire Lance bolt returns it onto the plate facing the hero
  {
    const G3 = build();
    duel(G3, { dist: 8, form: 1 });
    const d3 = G3.game.dragon;
    G3.defend = makeDefender(G3, { early: 0.05 });
    const b0 = d3.plates.s.breast.hp, q0 = d3.posture;
    Math.random = () => 0.9;
    d3.debug.trigger('fireLance');
    run(G3, 5, () => G3.defend.act(), () => d3.mode === 'foot');
    const lost = b0 - d3.plates.s.breast.hp;
    assert(G3.hits.some((h) => h.r === RESULT.PARRIED) && lost === TUNING.lance.returnPlate && d3.posture > q0, `a perfect parry returns the bolt: the breastplate loses ${lost}, his posture ${q0.toFixed(0)} → ${d3.posture.toFixed(0)}`);
    d3.plates.s.breast.hp = 100;
    run(G3, 0.5);
    d3.debug.trigger('fireLance');
    run(G3, 5, () => G3.defend.act(), () => d3.mode === 'foot');
    assert(d3.plates.off('breast'), 'a returned bolt on a weak breastplate takes it off');
    // the breast off: one more bolt; Sweeping Fire may be picked in phase 1
    const A = d3.kit.realise('fireLance', 1, () => 0.5, null);
    assert(A.hits === 2 && d3.weigh('fireSweep', MOVES.fireSweep, 1) > 0, 'the breastplate off: the Fire Lance fires one more bolt, Sweeping Fire is open in phase 1');
  }
  // what the other losses change: the back (the vent behind him), both flanks (no Iron Charge)
  {
    d.plates.shed('back', 'lab');
    at(Math.PI, 3);
    const w = d.weigh('ventBurst', MOVES.ventBurst, 1);
    d.plates.shed('left', 'lab');
    d.plates.shed('right', 'lab');
    assert(w === P.back.lost.ventBehind && d.weigh('ironCharge', MOVES.ironCharge, 1) === 0, `the back off: Bellows Vent x${w} with the hero behind; both flanks off: no Iron Charge`);
  }
  // minOff at each transition: the least-sound plates blow off at the impact (never the helm)
  {
    const G4 = build();
    duel(G4, { dist: 6, form: 1 });
    const d4 = G4.game.dragon;
    d4.debug.setAI(true);
    d4.plates.s.back.hp = 10;
    d4.takeHit({ damage: 99999, exact: true, plate: false });
    run(G4, 6, null, () => d4.phase === 2 && d4.mode === 'foot');
    const gone2 = d4.plates.gone, back2 = d4.plates.off('back');
    d4.takeHit({ damage: 99999, exact: true, plate: false });
    run(G4, 6, null, () => d4.phase === 3 && d4.mode === 'foot');
    assert(gone2 >= P.minOff[1] && back2 && d4.plates.gone >= P.minOff[2] && d4.plates.on('helm'), `the transitions shed the least-sound plates: ${gone2} gone at phase 2 (the back first), ${d4.plates.gone} at phase 3, the helm kept`);
  }
}

// ================================================================== scenario: handover
async function scenarioHandover() {
  out('\n== scenario HANDOVER (bar empty → break → deathblow → the husk and the pilot; an unanswered break; reset) ==');
  const G = build();
  duel(G, { dist: 3, form: 3 });
  const d = G.game.dragon;
  const ev = [];
  G.watch = (n, e) => { if (n === 'dragon:plate' || n === 'dragon:phase4' || n === 'dragon:plunged') ev.push(n); };
  d.takeHit({ damage: 99999, exact: true, plate: false });
  run(G, 0.2);
  assert(d.broken && d.hp === 0 && d.phase === 3, `the suit's bar empty: it breaks (${d.mode})`);
  run(G, 1.2);
  assert(d.plates.left === 0, `every plate left blows off (${ev.filter((n) => n === 'dragon:plate').length} events)`);
  place(G, 2.0);
  run(G, 3, () => { if (((G.game.realTime * 60) | 0) % 12 === 0 && d.broken) G.input.click(0); }, () => d.phase === 4);
  run(G, 4, null, () => d.mode === 'foot');
  assert(ev.includes('dragon:plunged') && ev.includes('dragon:phase4') && d.phase === 4 && d.body === 'pilot', 'the deathblow ejects the pilot (dragon:phase4)');
  assert(d.husk?.visible && d.maxHp === TUNING.pilot.hp && d.hp === d.maxHp && Math.abs(d.lean.scale - TUNING.pilot.scale) < 1e-9 && d.radius === TUNING.pilot.radius && d.kit.blade.tip < 1.2, `the husk kneels; the pilot: bar ${d.maxHp}, drawn at ${d.lean.scale}, body circle ${d.radius}, the sabre's reach`);
  assert(d.lives.left === 1 && d.phaseAt.length === 1, 'one life left; her bar has no gates');
  // her guard: a strike from the front is turned
  d.debug.setAI(true);
  run(G, 1.5, null, () => d.guarding);
  assert(d.guarding, 'the pilot raises a sword guard');
  // the hurt spheres sit on her drawn body (the scale) and the suit's are scaled out
  const hy = Math.max(...d.hurtSpheres.map((s) => s.y));
  assert(hy < 2.0, `her highest hurt sphere at ${hy.toFixed(2)} m`);
  // the pilot at zero breaks; the deathblow kills her
  d.debug.setAI(false);
  d.takeHit({ damage: 99999, exact: true, plate: false });
  run(G, 0.3);
  assert(d.broken && d.mode !== 'dying', 'her bar empty: she breaks');
  place(G, 2.0);
  run(G, 4, () => { if (((G.game.realTime * 60) | 0) % 12 === 0 && d.broken) G.input.click(0); }, () => d.mode === 'dying' || d.mode === 'dead');
  assert(d.mode === 'dying' || d.mode === 'dead', 'the deathblow kills her');
  // an unanswered break still ejects
  {
    const G2 = build();
    duel(G2, { dist: 6, form: 2 });
    const d2 = G2.game.dragon;
    d2.takeHit({ damage: 99999, exact: true, plate: false });
    run(G2, TUNING.posture.breakTime + 4, null, () => d2.phase === 4 && d2.mode === 'foot');
    assert(d2.phase === 4 && d2.body === 'pilot' && d2.mode === 'foot', `a break nobody answered: she climbs out all the same (${d2.mode})`);
    // reset restores the suit
    d2.reset();
    assert(d2.phase === 1 && d2.body === 'suit' && d2.plates.left === 5 && !d2.husk.visible && d2.maxHp === TUNING.suit.hp && Math.abs(d2.lean.scale - TUNING.suit.scale) < 1e-9 && d2.mode === 'sleep', 'reset(): the suit again, every plate on, the husk gone, kneeling');
  }
  // the suit's hurt spheres are scaled out from the root (what is drawn is what is hit)
  {
    const G3 = build();
    duel(G3, { dist: 4, form: 1 });
    const d3 = G3.game.dragon;
    const head = d3.hurtSpheres[0];
    assert(head.y > 2.6 && Math.abs(head.r - 0.2 * TUNING.suit.game) < 1e-6, `the suit's head sphere at ${head.y.toFixed(2)} m, r ${head.r.toFixed(2)}`);
  }
}

// ================================================================== scenario: lance
async function scenarioLance() {
  out('\n== scenario LANCE (the bolt in the open, behind cover, a perfect parry) ==');
  {
    const G = build();
    duel(G, { dist: 8, form: 1 });
    const d = G.game.dragon, hp0 = G.game.player.hp;
    const h0 = G.hits.length;
    let boom = 0;
    G.watch = (n) => { if (n === 'dragon:explosion') boom++; };
    d.debug.trigger('fireLance');
    run(G, 4, null, () => d.mode === 'foot');
    const hits = G.hits.slice(h0);
    assert(hits.length === 1 && hits[0].r === RESULT.HIT && hits[0].kind === 'fire' && hits[0].attack === 'fireLance' && G.game.player.hp < hp0 && boom >= 1, `unanswered, the bolt lands from 8 m (${(hp0 - G.game.player.hp).toFixed(1)} damage, kind ${hits[0]?.kind})`);
  }
  {
    // the hero behind a weapon rack: the bolt ends on the rack, which takes the blow and catches fire
    const G = build(SEED, true);
    duel(G, { dist: 8, form: 1 });
    const d = G.game.dragon, p = G.game.player, W = G.game.world.destructibles;
    const rack = W.list.find((b) => b.kind === 'rack' && b.state === STATE.INTACT);
    const dx = rack.x, dz = rack.z, l = Math.hypot(dx, dz);
    d.position.set(dx - (dx / l) * 6, 0, dz - (dz / l) * 6);
    d.yaw = Math.atan2(dx, dz);
    p.debug.teleport(dx + (dx / l) * 1.2, dz + (dz / l) * 1.2);
    p.debug.heal();
    const rhp = rack.hp;
    const h0 = G.hits.length;
    let ignites = 0;
    { const f = G.game.world.ignite; G.game.world.ignite = (...a) => { ignites++; return f(...a); }; }
    d.debug.trigger('fireLance');
    run(G, 4, () => { p.debug.teleport(dx + (dx / l) * 1.2, dz + (dz / l) * 1.2); }, () => d.mode === 'foot');
    const hit = G.hits.slice(h0).some((h) => h.r === RESULT.HIT && h.attack === 'fireLance');
    const fell = G.hits.slice(h0).filter((h) => h.attack !== 'fireLance').map((h) => h.attack);
    assert(!hit && (rack.hp < rhp || rack.state !== STATE.INTACT) && ignites > 0, `behind a rack the bolt never reaches the hero; the rack took it (${rhp.toFixed(2)} → ${rack.hp.toFixed(2)}, state ${rack.state}) and was set alight (${ignites} ignite)${fell.length ? `; the rack fell on him: ${fell.join(', ')}` : ''}`);
  }
}

// ================================================================== scenario: world
async function scenarioWorld() {
  out('\n== scenario WORLD (his powers reach world.impact / ignite / destructibles) ==');
  const G = build(SEED, true);
  duel(G, { dist: 2, form: 3 });
  const d = G.game.dragon, w = G.game.world, W = w.destructibles;
  const calls = { impact: [], ignite: [], sweepRec: [], stop: [] };
  const wrap = (obj, k, list) => { const f = obj[k].bind(obj); obj[k] = (...a) => { list.push(a); return f(...a); }; };
  wrap(w, 'impact', calls.impact);
  wrap(w, 'ignite', calls.ignite);
  { const f = W.sweepRec.bind(W); W.sweepRec = (R, o) => { calls.sweepRec.push([{ ...R }, { ...o }]); return f(R, o); }; }
  wrap(W, 'stop', calls.stop);
  const WT = TUNING.world;
  const play = (name, dist) => {
    place(G, dist);
    for (const k in calls) calls[k].length = 0;
    d.debug.trigger(name);
    run(G, 6, null, () => d.mode === 'foot' && d._mortar.left === 0 && !d.fx.strikesAlive);
    return { impact: calls.impact.slice(), ignite: calls.ignite.slice(), sweepRec: calls.sweepRec.slice(), stop: calls.stop.slice() };
  };
  const has = (L, power) => L.some((a) => Math.abs(a[3] - power) < 1e-6);
  let r = play('worksHammer', 2);
  assert(has(r.impact, WT.hammer), `Hammer of the Works: world.impact power ${WT.hammer}`);
  r = play('treadStomp', 2);
  assert(has(r.impact, WT.stomp), `Treading Mountain: world.impact power ${WT.stomp}`);
  r = play('fireSweep', 2.5);
  assert(r.ignite.length >= 3 && has(r.impact, WT.sweepFire), `Sweeping Fire: ${r.ignite.length} ignites along its arc, impact ${WT.sweepFire}`);
  r = play('ventBurst', 2);
  assert(r.ignite.length >= 1 && has(r.impact, WT.vent), 'Bellows Vent lights the world round him');
  r = play('mortarRain', 6);
  assert(has(r.impact, WT.mortar) && r.ignite.length >= 1, `the mortars land with world.impact power ${WT.mortar} and fire`);
  // the lance with nobody in its line: its far end, or the first cover it meets
  {
    place(G, 8, Math.PI / 2);
    d.yaw = 0;
    for (const k in calls) calls[k].length = 0;
    d.debug.setAI(false);
    G.game.player.debug.teleport(d.position.x + 8, d.position.z);
    // (he cannot see the hero this time: no tracking, the bolt goes out along his facing)
    const sense = d.brain._sense;
    d.brain._sense = () => null;
    d.brain.startAct('fireLance');
    run(G, 4, null, () => d.mode === 'foot');
    d.brain._sense = sense;
    assert(calls.stop.length >= 1 && (has(calls.impact, WT.lance) || calls.ignite.length >= 1), `a bolt out along his facing: destructibles.stop (${calls.stop.length}), then the far end or the cover it met`);
  }
  // Iron Charge ploughs through the yard along its dash; the suit shoulders pieces as it walks
  {
    for (const k in calls) calls[k].length = 0;
    place(G, 9);
    const okC = d.debug.trigger('ironCharge');
    run(G, 4, null, () => d.mode === 'foot');
    if (!calls.sweepRec.length) out(`       (ironCharge started ${okC}, mode ${d.mode}, ${d.debug.currentAction()})`);
    assert(calls.sweepRec.some((a) => Math.abs(a[0].power - WT.charge) < 1e-6), `Iron Charge: destructibles.sweepRec power ${WT.charge}`);
    for (const k in calls) calls[k].length = 0;
    d.debug.setAI(true);
    place(G, 9);
    run(G, 3);
    assert(calls.sweepRec.some((a) => Math.abs(a[0].power - WT.body) < 1e-6 && a[1].brush === true), `walking, the suit brushes the world (sweepRec power ${WT.body}, brush)`);
    d.debug.setAI(false);
  }
  // a shed plate lands with a blow on the world
  {
    for (const k in calls) calls[k].length = 0;
    d.debug.setForm(1);
    d.debug.shedPlate('breast');
    run(G, 1.2);
    assert(has(calls.impact, WT.plate), `a shed plate lands: world.impact power ${WT.plate}`);
  }
}

// ================================================================== scenario: win
async function scenarioWin() {
  out('\n== scenario WIN (a fencing bot in god mode: parries, rolls, cuts in his openings, gives the deathblows; three seeds) ==');
  const seeds = (process.env.ABYSS_WSEEDS ?? '4242,7,99').split(',').map(Number);
  for (const seed of seeds) {
    const G = build(seed);
    const { game } = G;
    const d = game.dragon;
    duel(G, { dist: 3, ai: true });
    G.defend = makeDefender(G, { skill: 1 });
    let blows = 0, plates = 0;
    const at = [0];
    G.watch = (n) => {
      if (n === 'dragon:plunged') blows++;
      if (n === 'dragon:plate') plates++;
      if (/^dragon:phase[234]$/.test(n)) at.push(game.time);
    };
    const t0 = game.time;
    const won = run(G, 600, () => fencer(G), () => d.mode === 'dead' || d.mode === 'dying');
    const T = game.time - t0;
    const parries = G.hits.filter((h) => h.r === RESULT.PARRIED).length;
    out(`     seed ${seed}: ${won ? 'won' : 'NOT won'} in ${T.toFixed(0)} s: ${blows} deathblows, ${plates} plates off, ${parries} parries; phases at ${at.map((t) => (t - t0 > 0 ? (t - t0).toFixed(0) : '0')).join(' / ')} s; phase ${d.phase}, bar ${Math.round(d.hp)}`);
    assert(won && T > 40 && T < 600, `seed ${seed}: the bot beats the suit and the pilot (${T.toFixed(0)} s)`);
  }
}

// ================================================================== scenario: pace
/** (lord.mjs's pace defender: it blocks white / blue cues and rolls early from red ones, so it earns no riposte or
 *  Ghostep: the pace is his own) */
function paceDefender(G) {
  const pend = [];
  const stats = { flashes: 0, rolls: 0, guards: 0 };
  let guardUntil = -1;
  const leadOfSrc = (src) => (src === 'world' ? 0.3 : leadOf(G.game.dragon.phase));
  return {
    stats,
    onEvent(n, e) {
      if (n !== 'combat:flash' || (e?.source !== 'dragon' && e?.source !== 'world')) return;
      stats.flashes++;
      pend.push({ tell: e.tell, at: G.game.time + leadOfSrc(e.source), x: e.x, z: e.z, hazard: !!e.hazard && !e.bullet, done: false });
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
            // (a roll keeps him in the crater, as a player keeps to the arena: a roll that would end
            // past the boss's floor (12 m round the seal, or north of the dais's edge) goes the other
            // way across. The tuning pass, 2026-11-16: the hero used to roll out behind the throne,
            // where nothing of his reaches (up to a fifth of form 4 spent there))
            let wx = e.hazard ? dx / l : -dz / l, wz = e.hazard ? dz / l : dx / l;
            const out = (ax, az) => Math.hypot(p.x + ax * 3, p.z + az * 3) > 12;
            if (out(wx, wz)) {
              const k = (-p.x * -wz + -p.z * wx) >= 0 ? 1 : -1;
              const sx = -wz * k, sz = wx * k;
              if (!out(sx, sz)) { wx = sx; wz = sz; } else if (!out(-wx, -wz)) { wx = -wx; wz = -wz; }
            }
            input.axis = { x: wx, y: -wz };
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

/** The pace bot's step: answer the cues; with none due and the boss more than 4.5 m off, walk back in
 *  (as a player keeps to the fight; blocked blows knock him back). */
function closeIn(G) {
  const { game, input } = G, d = game.dragon, p = game.player;
  input.axis = { x: 0, y: 0 };
  const rolled = G.defend.act();
  const dx = d.position.x - p.position.x, dz = d.position.z - p.position.z, l = Math.hypot(dx, dz);
  if (!rolled && l > 4.5 && ['idle', 'run', 'walk'].includes(p.state)) input.axis = { x: dx / l, y: -dz / l };
}

async function scenarioTrace() {
  const G = build(Number(process.env.S ?? 4242));
  duel(G, { dist: 4, ai: true, form: Number(process.env.F ?? 1) });
  const d = G.game.dragon, p = G.game.player;
  p.debug.god = true;
  G.defend = paceDefender(G);
  for (let i = 0; i < Number(process.env.N ?? 80); i++) {
    run(G, 0.5, () => closeIn(G));
    out(`t ${G.game.time.toFixed(1)} dist ${Math.hypot(p.position.x - d.position.x, p.position.z - d.position.z).toFixed(1)} ${d.mode} ${d.debug.currentAction()} phase ${d.phase} pos ${d.position.x.toFixed(1)},${d.position.z.toFixed(1)} hero ${p.position.x.toFixed(1)},${p.position.z.toFixed(1)} ${p.state} gap ${d.brain.gapT.toFixed(2)} cd ${JSON.stringify(Object.fromEntries(Object.entries(d.brain.cooldowns).filter(([k, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(1)])))}`);
  }
}

async function scenarioPace() {
  out('\n== scenario PACE (a steady defender in god mode vs his AI, per phase: cues a minute, the longest gap, no unanswerable pair) ==');
  const SECS = Number(process.env.ABYSS_PSECS ?? 90);
  const SEEDS = (process.env.ABYSS_PSEEDS ?? '4242,7').split(',').map(Number);
  const M = TUNING.pressure.meter;
  for (let f = 1; f <= 4; f++) {
    for (const seed of SEEDS) {
      const G = build(seed);
      duel(G, { dist: 4, ai: true, form: f });
      const d = G.game.dragon;
      G.game.player.debug.god = true;
      G.defend = paceDefender(G);
      const cues = [];
      G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') cues.push({ t: G.game.time + leadOf(d.phase), dodge: e.tell === TELL.RED || e.tell === TELL.BLACK }); };
      const t0 = G.game.time;
      run(G, SECS, () => { closeIn(G); const p = G.game.player; if (p.hp < p.maxHp) p.hp = p.maxHp; if (d.phase !== f) d.debug.setForm(f); });
      const rate = (cues.length / SECS) * 60;
      let gap = 0, last = t0;
      for (const c of cues) { gap = Math.max(gap, c.t - last); last = c.t; }
      gap = Math.max(gap, G.game.time - last);
      let pairs = 0;
      for (let i = 0; i < cues.length; i++) for (let j = i + 1; j < cues.length && cues[j].t - cues[i].t < 0.3; j++) if (cues[i].dodge !== cues[j].dodge) pairs++;
      const ok = rate >= M.minRate[f - 1] && gap <= M.maxGap[f - 1] && pairs === 0;
      assert(ok, `phase ${f} seed ${seed}: ${rate.toFixed(1)} cues a minute (>= ${M.minRate[f - 1]}), longest gap ${gap.toFixed(2)} s (<= ${M.maxGap[f - 1]}), ${pairs} pairs of cues asking two answers within 0.3 s`);
    }
  }
}

const S = {
  level: scenarioLevel,
  data: scenarioData,
  timing: scenarioTiming,
  plates: scenarioPlates,
  handover: scenarioHandover,
  lance: scenarioLance,
  world: scenarioWorld,
  win: scenarioWin,
  pace: scenarioPace,
  trace: scenarioTrace,
};
const list = SCEN === 'all' ? Object.keys(S) : [SCEN];
for (const k of list) {
  if (!S[k]) { out(`unknown scenario ${k}`); process.exit(2); }
  await S[k]();
}
const notCat = [...EMITTED].filter((n) => !CATALOGUE.has(n) && n !== 'state');
assert(!notCat.length, `every event this level emits is in the catalogue ${JSON.stringify(notCat)}`);
out(`\nconsole errors/warnings: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 12).join('\n  ') : ''}`);
if (errors.length) fails++;
out(fails ? `\nMARSHAL: ${fails} FAILED` : '\nMARSHAL: ALL PASSED');
process.exit(fails ? 1 : 0);
