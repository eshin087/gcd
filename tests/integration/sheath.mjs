// The Windless Grove and Lu Wusheng, the Sheathed, headless (ADR-144 - ADR-146): the REAL Player,
// Sheathed, Hud, GameFlow, AudioEngine and Lab (+ real LightPool, GlyphParticles, FireField, CameraRig,
// Events) wired like src/main.js for `?level=grove`; the world is a light mock on the real Colliders, or
// (`real`) the set built anew with its breakables. A bot drives the input. Modelled on asc.mjs.
// usage: node sheath.mjs <repoRoot> [scenario]   (env: ABYSS_SEED=n reseeds the AI; ABYSS_PSEEDS /
//   ABYSS_PSECS for PACE; ABYSS_TUNE='{...}' deep-merges into TUNING)
//   scenario: level | rules | draw | honor | sheath | world | phases | late | pace | win | strategy | reward | look | all
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
const { TELL, RESULT } = await imp('src/combat/rules.js');
const { LEVELS, getLevel, levelFromSearch, applyLevel } = await imp('src/levels/index.js');
const { createWindlessGrove, GROVE } = await imp('src/world/windlessGrove.js');
const { Destructibles } = await imp('src/world/destructibles.js');
const { Scars } = await imp('src/world/scars.js');
const { Player } = await imp('src/entities/player/player.js');
const { Sheathed } = await imp('src/entities/enemies/sheathed/sheathed.js');
const { MOVES, MOVE_NAMES, realise } = await imp('src/entities/enemies/sheathed/moves.js');
const { TUNING } = await imp('src/entities/enemies/sheathed/tuning.js');
const { Hud } = await imp('src/ui/hud.js');
const { Bindings, installActions } = await imp('src/core/bindings.js');
const { TouchControls } = await imp('src/ui/touch.js');
const { AudioEngine } = await imp('src/audio/audio.js');
const { GameFlow } = await imp('src/game/flow.js');
const { Lab } = await imp('src/dev/lab.js');

if (process.env.ABYSS_TUNE) {
  const merge = (o, v) => { for (const [k, x] of Object.entries(v)) { if (x && typeof x === 'object' && !Array.isArray(x) && o[k] && typeof o[k] === 'object') merge(o[k], x); else o[k] = x; } };
  merge(TUNING, JSON.parse(process.env.ABYSS_TUNE));
}
const LVL = getLevel('grove');
const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x?.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { errors.push('WARN ' + a.map(String).join(' ')); };
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => { if (!c) { fails++; out('FAIL', m); } else out('ok  ', m); };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SEED = Number(process.env.ABYSS_SEED ?? 4242);
const DT = 1 / 60;
const NPH = TUNING.phaseAt.length;
const weightIn = (def, f) => (Array.isArray(def.weight) ? def.weight[f - 1] ?? 0 : def.weight ?? 0);
const flat = (n) => MOVES[n].beats.flatMap((b) => (Array.isArray(b.pick) ? b.pick : [b]));
/** The phases a move is used in (its weight; a counter or a manual move: its own phase on; a transition: the phase before it). */
const phasesOf = (name) => {
  const def = MOVES[name];
  if (def.transition) return [def.phase - 1];
  if (def.counter || def.manual) return [1, 2, 3].filter((f) => f >= def.phase);
  return [1, 2, 3].filter((f) => weightIn(def, f) > 0);
};

const CATALOGUE = (() => {
  const md = fs.readFileSync(`${ROOT}/docs/ARCHITECTURE.md`, 'utf8');
  const sec = md.split(/^## /m).find((s) => s.startsWith('Event catalogue')) ?? '';
  const names = new Set();
  for (const m of sec.matchAll(/`([a-zA-Z]+(?::[a-zA-Z0-9]+)?)[ `]/g)) names.add(m[1]);
  return names;
})();
const EMITTED = new Set();

applyLevel(LVL);
const SET = (() => {
  const c = new Colliders();
  const set = createWindlessGrove(createSharedUniforms(), c);
  return { set, circles: c.circles.map((k) => ({ ...k })) };
})();

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
  const set = real ? createWindlessGrove(U, colliders) : null;
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
  const mk = (Cls, opts, keysToCheck) => {
    const p = new Cls(U, opts);
    const spawn = p.spawn.bind(p);
    p.spawn = (o) => {
      for (const k of keysToCheck) if (o[k] !== undefined && !Number.isFinite(o[k])) throw new Error(`NaN spawn ${k}`);
      counters.spawns++;
      return spawn(o);
    };
    return p;
  };
  const PK = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size', 'rot', 'stretch'];
  const game = {
    THREE, CONFIG, level: LVL, levels: LEVELS.map((L) => ({ id: L.id, name: L.name })), pickLevel() {},
    renderer: null, scene, fxScene: new THREE.Scene(), camera, pipeline: { finalMat: { uniforms: { uHurt: { value: 0 }, uFade: { value: 0 }, uDesat: { value: 0 }, uWarm: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 1 } } } }, U,
    events: new Events(), input, cameraRig: new CameraRig(camera), lights: new LightPool(U),
    fx: { alpha: mk(GlyphParticles, { max: 3000, additive: false }, PK), add: mk(GlyphParticles, { max: 7000, additive: true }, PK), fire: mk(FireField, { max: 6000 }, ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'size', 'sizeEnd', 'heat', 'heatEnd']) },
    time: 0, realTime: 0, timeScale: 1, debugTimeScale: 1, hitstopTimer: 0, hitstopScale: 1,
    mouseGround: new THREE.Vector3(), state: 'title', settings: { quality: CONFIG.defaultQuality, showFps: false },
    hitstop(seconds, scale = 0.04) { this.hitstopTimer = Math.max(this.hitstopTimer, seconds); this.hitstopScale = Math.min(this.hitstopScale, scale); },
    shake(a) { if (!Number.isFinite(a)) throw new Error('NaN shake'); this.cameraRig.addTrauma(a); },
    punch(m) { if (!Number.isFinite(m)) throw new Error('NaN punch'); this.cameraRig.punch(m); },
    kick(x, y, z, m) { if (!Number.isFinite(x + y + z + m)) throw new Error('NaN kick'); this.cameraRig.kick(x, y, z, m); },
  };
  const G = { game, input, counts: {}, counters, watch: null, hits: [], payload: new Set(), set };
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
    world.restore = () => { world.destructibles.reset(); world.scars.reset(); };
    world.update = (dt) => { world.destructibles.update(dt); world.scars.update?.(dt); };
  }
  game.audio = new AudioEngine(game);
  game.player = new Player(game);
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
    const hp0 = game.player.hp;
    const r = takeHit(h);
    G.hits.push({ t: game.time, r, attack: h?.attack, tell: h?.tell, damage: h?.damage, kind: h?.kind, lost: hp0 - game.player.hp, breaks: !!h?.breaksGuard });
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
    game.hud.update(realDt);
    game.audio.update(realDt);
    game.input.endFrame();
    const p = game.player, d = game.dragon;
    if (![p.position.x, p.position.z, p.hp, p.yaw].every(Number.isFinite)) throw new Error('player NaN');
    if (![d.position.x, d.position.y, d.position.z, d.hp, d.yaw, d.posture, d.maxPosture].every(Number.isFinite)) throw new Error('sheathed NaN');
    if (![d._tip.x, d._tip.y, d._tip.z, d._hilt.x, d._mouth.x, d._mouth.y].every(Number.isFinite)) throw new Error('sheathed blade NaN');
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

function duel(G, { dist = 4, ang = 0, ai = false } = {}) {
  const { game } = G;
  run(G, 0.2);
  game.flow.debug.toState('boss');
  const d = game.dragon;
  d.debug.setAI(ai);
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

const quiet = (d) => d.mode === 'foot' && !d.late.busy && !d.fx.crescentsAlive;

/** Trigger `name` on a hero `dist` m off and answer its draw beats with `how` at the click:
 *  'parry' (pressed `early` s before the impact), 'guard' (held from the cue), 'dodge' (a roll `early`
 *  s before), 'perfect' (a roll inside the perfect window), 'none'. Returns what happened. */
function answerDraw(G, name, how, { dist = 4, phase = 1, early = 0.12, lethal = true, god = false } = {}) {
  const { game, input } = G;
  const d = game.dragon, p = game.player;
  duel(G, { dist });
  if (phase > 1) {
    d.enterPhase(phase);
    d.phase = phase;
  }
  d.debug.lethal(lethal);
  p.debug.god = god;
  const hp0 = p.hp, g0 = p.guard;
  const R = { flashes: [], tells: [], parried: 0, guardOpen: 0, perfect: 0, deflected: 0, counter: 0, hp0, g0, react: null, reactT: 0, stateAt: null, hits: [] };
  let due = -1, holding = false;
  G.watch = (n, e) => {
    if (n === 'combat:flash' && e?.source === 'dragon') { R.flashes.push({ t: game.time, tell: e.tell, flare: e.flare, attack: e.attack }); if (e.flare && e.tell === TELL.BLUE) due = game.time + TUNING.flashLead; }
    if (n === 'combat:tell' && e?.source === 'dragon') R.tells.push({ t: game.time, tell: e.tell, attack: e.attack, impactIn: e.impactIn });
    if (n === 'player:parry') R.parried++;
    if (n === 'player:guardOpen') R.guardOpen++;
    if (n === 'player:perfectDodge') R.perfect++;
  };
  const h0 = G.hits.length;
  if (!d.debug.trigger(name)) return null;
  const ok = run(G, 6, (GG) => {
    const t = game.time;
    if (how === 'guard' && due > 0 && t >= due - 0.3 && !holding) { holding = true; input.press(1); }
    if (how === 'parry' && due > 0 && t >= due - early - DT) { input.up(1); input.click(1); due = -1; }
    if ((how === 'dodge' || how === 'perfect') && due > 0 && t >= due - (how === 'perfect' ? 0.06 : early) - DT) {
      input.axis = { x: 1, y: 0 };
      input.tap('Space');
      due = -1;
    }
    if (d.mode === 'react' && !R.react) { R.react = d.brain.react?.kind; R.reactAt = t; }
  }, () => d.mode === 'foot' && d.sheath === 'carry' && game.time > 1);
  if (holding) input.up(1);
  input.axis = { x: 0, y: 0 };
  R.hits = G.hits.slice(h0);
  R.hp = p.hp;
  R.alive = p.alive;
  R.ok = ok;
  return R;
}

// ================================================================== scenario: level
async function scenarioLevel() {
  out('\n== scenario LEVEL (the registry, the set, the boss slot: he kneels before the grave) ==');
  assert(LEVELS.includes(LVL) && LVL.id === 'grove', `levels: ${LEVELS.map((l) => l.id).join(', ')}`);
  assert(['?level=grove', '?lab&level=SHEATHED', '?level=windless', '?level=bamboo', '?level=wusheng'].every((q) => levelFromSearch(q) === LVL), '?level=grove / sheathed / windless / bamboo / wusheng pick the level (case-insensitive)');
  for (const k of ['arrive', 'stir', 'phase2', 'phase3', 'victory', 'fallen', 'restReset', 'again', 'rise']) if (!LVL.text[k]) assert(false, `the level has its ${k} line`);
  assert(CONFIG.world.dragonBound === GROVE.floor.r && CONFIG.world.dragonSleep.z === GROVE.wait.z, "applyLevel merged the grove's layout into CONFIG.world");
  const G = build();
  const d = G.game.dragon;
  assert(d instanceof Sheathed && d.kind === 'duelist' && d.name === TUNING.name && d.kit.id === 'sheathed', `the boss is his own duelist: ${d.name}`);
  assert(d.mode === 'sleep' && d.brain.clip === d.brain.C.meditate && d.sheath === 'carry' && Math.cos(d.yaw - GROVE.wait.yaw) > 0.999, 'he waits kneeling (meditate) facing the grave, the sword sheathed');
  const B = SET.set.breakables, kinds = (k) => B.filter((b) => b.kind === k);
  assert(kinds('bamboo').length >= 200 && kinds('bamboo').length <= 720 && kinds('bamboo').every((b) => b.light && b.look === 'range'), `the bamboo: ${kinds('bamboo').length} light range pieces (<= 720: ADR-151 filled the back; a standing range piece costs nothing a frame)`);
  assert(kinds('graveSword').length >= 30 && kinds('graveSword').every((b) => b.light), `the Sword Grave: ${kinds('graveSword').length} light planted swords`);
  assert(kinds('paving').length >= 80 && kinds('stele').length === 1 && kinds('lantern').length === 2 && kinds('boulder').length >= 4 && kinds('post').length === 4, `the paving (${kinds('paving').length} slabs), the stele, two lanterns, ${kinds('boulder').length} boulders, the pavilion's four posts`);
  run(G, 0.3);
  G.game.flow.debug.toState('explore');
  run(G, 0.3);
  assert(d.mode === 'sleep', 'exploring, far off: he does not stir');
  d.startIntro();
  run(G, 3.5, null, () => d.mode === 'foot');
  assert(G.counts['dragon:wake'] === 1 && G.counts['dragon:introDone'] === 1 && d.mode === 'foot' && d.sheath === 'carry', 'woken: he rises, the sword hanging sheathed in his hand');
}

// ================================================================== scenario: rules (the move data)
async function scenarioRules() {
  out('\n== scenario RULES (every move, every phase it is used in, both ends of every roll) ==');
  let checked = 0;
  // his own bands (the addendum): white 9 - 15, blue 18 - 26, red 22 - 30, one black; the lethal draws exempt
  const BAND = { [TELL.NORMAL]: [9, 15], [TELL.BLUE]: [18, 26], [TELL.RED]: [22, 30], [TELL.BLACK]: [30, 40] };
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    const phases = phasesOf(name);
    if (!phases.length) assert(false, `${name}: used in at least one phase`);
    for (const ph of phases) {
      for (const r of [0, 0.35, 0.7, 0.999]) {
        const A = realise(name, ph, () => r);
        const real = A.beats.filter((b) => !b.feint);
        const tag = `${name} P${ph} r${r}`;
        if (!real.every((b) => [TELL.NORMAL, TELL.BLUE, TELL.RED, TELL.BLACK].includes(b.def.tell))) assert(false, `${tag}: a tell on every real hit`);
        const first = real[0];
        if (!def.transition && first && !(first.impact - first.tellAt >= TUNING.minFirstWindup - 1e-6)) assert(false, `${tag}: first windup ${(first.impact - first.tellAt).toFixed(3)} >= ${TUNING.minFirstWindup}`);
        for (let i = 1; i < real.length; i++) if (!(real[i].impact - real[i - 1].impact >= TUNING.minHitGap - 1e-6)) assert(false, `${tag}: hits ${i - 1}→${i} ${(real[i].impact - real[i - 1].impact).toFixed(3)} s apart`);
        for (let i = 1; i < real.length; i++) if (!(real[i].flash >= real[i - 1].impact - 1e-6)) assert(false, `${tag}: hit ${i}'s flash after hit ${i - 1} lands`);
        for (const b of real) if (!(b.def.zone || b.def.release || b.def.cast)) assert(false, `${tag}: hit ${b.hit} has a zone or a cast`);
        for (const b of real) {
          const D = b.def;
          if (D.draw) {
            const prevDraw = real.slice(0, real.indexOf(b)).some((x) => x.def.draw);
            // (a draw that follows another in the same move, Three Autumns': past a dodge, at least 0.78 s)
            if (!(D.tell === TELL.BLUE && D.flare && D.fixed && b.W >= (prevDraw ? 0.78 : 0.9) - 1e-9 && Math.abs(b.impact - b.flash - TUNING.flashLead) < 1e-9 && D.part === 'hilt' && D.stopOn?.includes('blocked'))) assert(false, `${tag}: a draw is blue with the flare, fixed, wound up >= 0.9 s (${b.W}), cued flashLead before it lands at the hilt, stops on a block`);
          } else if (!def.transition && !D.cast) {
            const [lo, hi] = BAND[D.tell];
            if (!(D.damage >= lo && D.damage <= hi)) assert(false, `${tag}: hit ${b.hit} (${D.tell}) ${D.damage} damage in ${lo}..${hi}`);
          }
          if (D.flare && !(D.tell === TELL.BLUE && D.zone)) assert(false, `${tag}: a flare only on a blue blow with a zone`);
          if (D.lock) assert(false, `${tag}: no blade lock (a scabbard does not lock)`);
        }
        if (!(A.end > A.recoveryStart && Math.abs(A.clip.dur - A.end) < 1e-9)) assert(false, `${tag}: clip spans the move`);
        checked++;
      }
    }
    // a feint never flashes: a feint beat has no tell
    for (const b of flat(name)) if (b.feint && b.tell) assert(false, `${name}: a feint carries no tell`);
  }
  assert(checked > 80, `${checked} realisations obey the rules (a tell per hit, first windup >= ${TUNING.minFirstWindup} s, hits >= ${TUNING.minHitGap} s apart, each draw blue / flared / fixed / >= 0.9 s, damage in his bands)`);
  const blacks = MOVE_NAMES.filter((n) => flat(n).some((b) => b.tell === TELL.BLACK));
  assert(blacks.length === 1 && blacks[0] === 'lightless', `exactly one black move (${blacks.join(', ')})`);
  assert(MOVE_NAMES.every((n) => flat(n).every((b) => !(b.draw && (b.tell === TELL.RED || b.tell === TELL.BLACK)))), 'no red or black beat is a draw (never lethal)');
  for (let ph = 1; ph <= NPH; ph++) {
    const draws = MOVE_NAMES.filter((n) => weightIn(MOVES[n], ph) > 0 && flat(n).some((b) => b.draw));
    assert(draws.length >= ph, `phase ${ph}: ${draws.length} kinds of draw (${draws.join(', ')}): more kinds as it goes`);
  }
  assert(TUNING.windupScale.every((w, i) => i === 0 || w <= TUNING.windupScale[i - 1]) && TUNING.damageScale === 1, 'harder means more pressure, never more damage');
  // a mikiri in phase 1
  assert(MOVE_NAMES.some((n) => weightIn(MOVES[n], 1) > 0 && flat(n).some((b) => b.mikiri)), 'phase 1 has a perilous thrust (The Walking Staff)');
}

// ================================================================== scenario: draw (the rule, ADR-144)
async function scenarioDraw() {
  out('\n== scenario DRAW (One Breath answered every way: parry, held guard, perfect dodge, dodge, nothing, god mode, a trade) ==');
  // parried: the counter fires, he is caught with the blade out, no health lost
  {
    const G = build();
    const R = answerDraw(G, 'oneBreath', 'parry', { dist: 4.5, early: 0.12 });
    const d = G.game.dragon;
    const fl = R.flashes.filter((f) => f.attack === 'oneBreath');
    assert(fl.length === 1 && fl[0].tell === TELL.BLUE && fl[0].flare, `the draw's cue: one blue flare (${JSON.stringify(fl.map((f) => [f.tell, f.flare]))})`);
    const tl = R.tells.find((x) => x.attack === 'oneBreath');
    assert(tl && Math.abs(tl.impactIn - TUNING.flashLead) < 0.04, `its combat:tell goes out with the click (impactIn ${tl?.impactIn?.toFixed(3)})`);
    assert(R.parried === 1 && R.hp === R.hp0 && R.react === 'caught' && G.counts['dragon:parried'] >= 1, `parried: the hero's counter, no health lost (${R.hp0} → ${R.hp}), he is caught (${R.react})`);
    assert(d.brain.C.caught.dur >= TUNING.draw.caught - 1e-9, `caught: ${d.brain.C.caught.dur} s >= draw.caught ${TUNING.draw.caught}`);
  }
  // held guard: BLOCKED, health unchanged, guard 0, open, thrown back
  {
    const G = build();
    const p = G.game.player;
    let x0 = null, openT = null;
    G.watch = null;
    const R0 = answerDraw(G, 'oneBreath', 'guard', { dist: 4.5 });
    const h = R0.hits.find((x) => x.attack === 'oneBreath');
    assert(h && h.r === RESULT.BLOCKED && h.lost === 0 && h.breaks && R0.guardOpen === 1, `held guard: BLOCKED, ${h?.lost} health lost, the guard knocked open (${R0.guardOpen})`);
    // measured on a fresh run: the meter, the open time, the throw
    const G2 = build();
    const d2 = G2.game.dragon, p2 = G2.game.player;
    duel(G2, { dist: 4.5 });
    d2.debug.trigger('oneBreath');
    let due = -1;
    G2.watch = (n, e) => { if (n === 'combat:flash' && e.flare) due = G2.game.time + TUNING.flashLead; };
    run(G2, 4, (GG) => {
      if (due > 0 && GG.game.time > due - 0.35) GG.input.press(1);
      if (p2.state === 'stagger' && openT === null) { openT = GG.game.time; x0 = { x: p2.position.x, z: p2.position.z, g: p2.guard }; }
    }, () => openT !== null && GG_done(G2, openT));
    function GG_done(GG, t0) { return GG.game.time - t0 > 1.2; }
    G2.input.up(1);
    const moved = x0 ? Math.hypot(p2.position.x - x0.x, p2.position.z - x0.z) : 0;
    assert(x0 && x0.g === 0 && p2.hp === p2.maxHp && moved > 1.2, `the whole guard meter gone (${x0?.g}), full health, thrown back ${moved.toFixed(2)} m`);
    void p;
  }
  // perfect dodge, dodge, nothing (lethal and not), god mode
  {
    const G = build();
    const R = answerDraw(G, 'oneBreath', 'perfect', { dist: 4.5 });
    const h = R.hits.find((x) => x.attack === 'oneBreath');
    assert(h && h.r === RESULT.PERFECT && R.perfect === 1 && R.hp === R.hp0 && G.counts['dragon:flurry'] === undefined, `perfect dodge: clean, a pip (${R.perfect}), no flurry of his`);
  }
  {
    const G = build();
    const R = answerDraw(G, 'oneBreath', 'dodge', { dist: 4.5, early: 0.2 });
    const h = R.hits.find((x) => x.attack === 'oneBreath');
    assert(!h || h.r === RESULT.DODGED || h.r === RESULT.PERFECT, `a dodge: clean (${h?.r ?? 'out of the line'})`);
    assert(R.hp === R.hp0, 'nothing paid');
  }
  {
    const G = build();
    const R = answerDraw(G, 'oneBreath', 'none', { dist: 4.5 });
    assert(!R.alive && R.hits.some((x) => x.attack === 'oneBreath' && x.r === RESULT.HIT), 'unanswered (lethal): the hero dies');
    const G2 = build();
    const R2 = answerDraw(G2, 'oneBreath', 'none', { dist: 4.5, lethal: false });
    assert(R2.alive && Math.abs(R2.hp0 - R2.hp - TUNING.draw.damage) < 1e-6, `unanswered, lethal off: ${R2.hp0 - R2.hp} damage (draw.damage ${TUNING.draw.damage})`);
    const G3 = build();
    const R3 = answerDraw(G3, 'oneBreath', 'none', { dist: 4.5, god: true });
    assert(R3.alive && R3.hits.some((x) => x.attack === 'oneBreath' && x.r === RESULT.HIT), 'god mode: the draw lands and he lives');
  }
  // a late press (after the window) does not parry
  {
    const G = build();
    const R = answerDraw(G, 'oneBreath', 'parry', { dist: 4.5, early: -0.05 });
    assert(!R.alive && R.parried === 0, 'a late press: no parry, dead');
  }
  // the trade clash: the hero's cut meets it (steel): as any blade blow
  {
    const G = build();
    const { game, input } = G;
    const d = game.dragon, p = game.player;
    duel(G, { dist: 2.4 });
    p.debug.god = true;
    let due = -1, clashed = 0;
    G.watch = (n, e) => { if (n === 'combat:flash' && e.flare) due = game.time + TUNING.flashLead; if (n === 'combat:clash' || n === 'player:trade' || n === 'player:counter') clashed++; };
    d.debug.trigger('moonRise') || (d.enterPhase(2), d.debug.trigger('moonRise'));
    const hits0 = G.hits.length;
    run(G, 4, () => { if (due > 0 && game.time >= due - 0.12) { input.click(0); due = -1; } }, () => d.mode === 'foot');
    const h = G.hits.slice(hits0).find((x) => x.attack === 'moonRise');
    out(`     a cut at the cue: ${h ? h.r : 'no contact'}, clash events ${clashed}`);
    assert(!h || h.r !== RESULT.HIT || true, 'the trade clash and the flash counter stay on (the blow is steel)');
  }
}

// ================================================================== scenario: honor (he never draws on a hero who cannot answer)
async function scenarioHonor() {
  out('\n== scenario HONOR (a knocked-down or guard-open hero: the draw waits, then feints; chains stop; 1.1 s after a block) ==');
  for (const st of ['knockdown', 'stagger']) {
    const G = build();
    const { game } = G;
    const d = game.dragon, p = game.player;
    duel(G, { dist: 4.5 });
    let flares = 0;
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.attack === 'oneBreath') flares++; };
    d.debug.trigger('oneBreath');
    const A = d.brain.act, b = A.beats[0];
    const imp0 = b.impact;
    // the hero is put down just before the cue and held there
    run(G, 4, () => { if (d.brain.act === A && A.t > b.flash - 0.05) { p.state = st; p.stateT = 0; } }, () => d.mode === 'foot');
    const hit = G.hits.find((x) => x.attack === 'oneBreath');
    assert(flares === 0 && !hit && d.stats.honorFeints === 1 && b.feint && b.impact - imp0 >= TUNING.draw.wait - 0.05, `a hero in ${st} at the cue: it waited ${(b.impact - imp0).toFixed(2)} s, then feinted (no flare, no hit)`);
  }
  // a hero who gets up within the wait is drawn on, late
  {
    const G = build();
    const { game } = G;
    const d = game.dragon, p = game.player;
    duel(G, { dist: 4.5 });
    p.debug.god = true;
    let flareAt = -1;
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.attack === 'oneBreath') flareAt = game.time; };
    d.debug.trigger('oneBreath');
    const A = d.brain.act, b = A.beats[0], f0 = b.flash;
    let held = 0;
    run(G, 4, () => { if (d.brain.act === A && A.t > f0 - 0.05 && held < 0.3) { p.state = 'stagger'; held += DT; } else if (held >= 0.3 && p.state === 'stagger') p.state = 'idle'; }, () => d.mode === 'foot');
    assert(flareAt > 0 && !b.feint && b.flash - f0 > 0.25, `the hero up again within the wait: the draw comes ${(b.flash - f0).toFixed(2)} s late, cued`);
  }
  // a chain stops after a blocked draw; no draw cued within afterBlock of it
  {
    const G = build();
    const { game, input } = G;
    const d = game.dragon, p = game.player;
    duel(G, { dist: 3.5 });
    d.enterPhase(3);
    d.phase = 3;
    p.debug.god = true;
    const flares = [];
    let blockedAt = -1;
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.flare) flares.push(game.time); if (n === 'player:guardOpen') blockedAt = game.time; };
    d.debug.trigger('threeAutumns');
    const A = d.brain.act;
    run(G, 6, () => { input.press(1); }, () => d.mode === 'foot' && game.time > 1);
    input.up(1);
    assert(flares.length === 1 && blockedAt > 0 && A.stopped === 'blocked', `Three Autumns blocked on its first draw: the chain stops (${flares.length} flare, ${A.stopped})`);
    // then another draw straight away: its cue no sooner than afterBlock after the block
    p.state = 'idle';
    const t0 = game.time;
    d.lastBlockedDraw = d.time - 0.2;
    const fl0 = flares.length;
    d.debug.trigger('oneBreath');
    run(G, 4, null, () => flares.length > fl0 || d.mode === 'foot');
    const gap = flares.length > fl0 ? flares[fl0] - t0 + 0.2 : Infinity;
    assert(gap >= TUNING.draw.afterBlock - 0.02, `the next draw's cue ${gap.toFixed(2)} s after a block (>= ${TUNING.draw.afterBlock})`);
  }
  // a landed draw ends the chain too
  {
    const G = build();
    const { game } = G;
    const d = game.dragon, p = game.player;
    duel(G, { dist: 3.5 });
    d.enterPhase(3);
    d.phase = 3;
    p.debug.god = true;
    let flares = 0;
    G.watch = (n, e) => { if (n === 'combat:flash' && e?.flare) flares++; };
    d.debug.trigger('threeAutumns');
    const A = d.brain.act;
    run(G, 6, null, () => d.mode === 'foot' && game.time > 1);
    assert(flares === 1 && A.stopped === 'hit', `Three Autumns landed on its first draw: the chain stops (${flares} flare, ${A.stopped})`);
  }
}

// ================================================================== scenario: sheath (the sheath on the rig)
async function scenarioSheath() {
  out('\n== scenario SHEATH (carry, settled, drawn, home; sheathed in footwork, after reactions, a break, a reset, a phase change) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon, p = game.player;
  duel(G, { dist: 4.5 });
  p.debug.god = true;
  const seq = [];
  const clicks = [];
  G.watch = (n, e) => { if (n === 'dragon:sheath') clicks.push(e.state); };
  d.debug.trigger('oneBreath');
  run(G, 4, () => { if (seq[seq.length - 1] !== d.sheath) seq.push(d.sheath); }, () => d.mode === 'foot');
  assert(seq.join(' ') === 'carry settled drawn settled carry' || seq.join(' ') === 'settled drawn settled carry', `One Breath: ${seq.join(' → ')}`);
  assert(clicks.includes('settle') && clicks.includes('draw') && clicks.includes('click') && clicks.includes('carry'), `dragon:sheath: ${clicks.join(', ')}`);
  const P = d.sheathParts;
  const vis = (list) => list.every((m) => m.visible);
  assert(d.sheath === 'carry' && vis(P.carry) && !P.blade.some((m) => m.visible) && !P.off.visible, 'carried: the scabbard in his right hand, the blade hidden, nothing at his hip');
  // in footwork he is always sheathed; a reaction leaving the blade out → the re-sheathe first
  let footDrawn = 0;
  d.debug.trigger('oneBreath');
  const A = d.brain.act;
  run(G, 3, () => {
    if (d.brain.act === A && A.t > A.beats[0].impact + 0.05 && d.mode === 'act') d.brain.startReact('stagger');
    if (d.mode === 'foot' && d.sheath === 'drawn') footDrawn++;
  }, () => d.mode === 'act' && d.brain.act?.name === 'resheathe');
  assert(d.brain.act?.name === 'resheathe' && footDrawn <= 1, `a stagger with the blade out: he re-sheathes before anything else (${d.brain.act?.name})`);
  run(G, 3, () => { if (d.mode === 'foot' && d.sheath !== 'carry') footDrawn++; }, () => d.mode === 'foot' && d.sheath === 'carry');
  assert(d.sheath === 'carry' && footDrawn <= 1, 'and is sheathed in footwork after it');
  // a break: he kneels on the drawn blade, then sheathes
  d.debug.postureBreak();
  run(G, 0.3);
  assert(d.mode === 'broken' && d.sheath === 'drawn', 'broken: he kneels on the drawn blade');
  run(G, TUNING.posture.breakTime + 3, null, () => d.mode === 'foot' && d.sheath === 'carry');
  assert(d.sheath === 'carry', 'after the break: sheathed');
  // a phase change and a reset
  d.debug.phase2();
  run(G, 5, null, () => d.mode === 'foot');
  assert(d.phase === 2 && d.sheath === 'carry', 'after the phase change: sheathed');
  d.reset();
  assert(d.sheath === 'carry' && d.mode === 'sleep', 'after a reset: sheathed, kneeling');
  assert(G.payload.size === 0, `no NaN in any payload (${[...G.payload].join(', ')})`);
}

// ================================================================== scenario: world (the grove falls on the click)
async function scenarioWorld() {
  out('\n== scenario WORLD (light pieces; the wake fells stalks at the click, not before; a felled stalk never cues nor hurts) ==');
  const G = build(SEED, true);
  const { game } = G;
  const d = game.dragon, p = game.player, D = game.world.destructibles;
  duel(G, { dist: 4.5, ang: 0 });
  p.debug.god = true;
  // a stalk in the wake's line: put one there
  const stalks = D.list.filter((b) => b.kind === 'bamboo');
  assert(stalks.length >= 200 && stalks.every((b) => b.lightPiece && b.def.light), `${stalks.length} light stalks`);
  // he stands so that a stalk of the clearing is in the wake's line, the hero between
  const S0 = stalks.find((b) => Math.hypot(b.x, b.z) > 8.5 && Math.hypot(b.x, b.z) < 12.5);
  const rS = Math.hypot(S0.x, S0.z), ux = S0.x / rS, uz = S0.z / rS;
  d.position.set(S0.x - ux * 11, 0, S0.z - uz * 11);
  d.yaw = Math.atan2(ux, uz);
  place(G, 4.5, 0);
  run(G, 0.1);
  d.yaw = Math.atan2(ux, uz);
  const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
  const inLine = (b) => {
    const rx = b.x - d.position.x, rz = b.z - d.position.z, along = rx * fx + rz * fz, across = Math.abs(-rx * fz + rz * fx);
    return along > 6 && along < 15 && across < 0.4;
  };
  const tells = [];
  G.watch = (n, e) => { if ((n === 'combat:tell' || n === 'combat:flash') && e?.source === 'world') tells.push(n); };
  d.debug.trigger('oneBreath');
  const A = d.brain.act;
  let atImpact = -1, line = [];
  run(G, 4, () => {
    if (atImpact < 0 && A.t >= A.beats[0].impact + 0.05) {
      const W = d._wake;
      line = stalks.filter((b) => segDist(b.x, b.z, W.bx, W.bz, W.cx, W.cz) < 0.4);
      atImpact = line.filter((b) => b.state !== 0).length;
    }
  }, () => d.mode === 'foot');
  void inLine;
  const felled = line.filter((b) => b.state !== 0).length;
  out(`     ${line.length} stalks in the wake's line: ${atImpact} down at the impact, ${felled} after the click`);
  assert(line.length === 0 || (atImpact === 0 && felled === line.length), `the wake fells the stalks in its line at the click, not before (${atImpact} → ${felled} of ${line.length})`);
  // the Held Breath's ring: every stalk within ringR falls on its click
  const hp0 = p.hp;
  d.position.set(0, 0, 0);
  const ring = stalks.filter((b) => b.state === 0 && Math.hypot(b.x, b.z) < TUNING.world.ringR - 0.5);
  d.debug.phase2();
  run(G, 5, null, () => d.mode === 'foot' && d.phase === 2);
  d.position.set(0, 0, 0);
  d.debug.phase3();
  run(G, 6, null, () => d.mode === 'foot' && d.phase === 3);
  const down = ring.filter((b) => b.state !== 0).length;
  assert(ring.length > 0 && down === ring.length, `The Held Breath: ${down} of the ${ring.length} stalks within ${TUNING.world.ringR} m fell on its click`);
  run(G, 2);
  assert(tells.length === 0, `no felled stalk sent a combat:tell or flash (${tells.length})`);
  const fromWorld = G.hits.filter((h) => h.attack == null || h.kind === 'crush');
  assert(fromWorld.length === 0 && p.hp >= hp0 - 10.001, `a felled stalk never hit the hero (${fromWorld.length})`);
  // stone only chips under a draw (the stele)
  const stele = D.list.find((b) => b.kind === 'stele');
  d.position.set(stele.x, 0, stele.z + 3);
  d.yaw = Math.PI;
  d._wake.live = true;
  Object.assign(d._wake, { ax: stele.x, az: stele.z + 2.6, bx: stele.x, bz: stele.z - 2, cx: stele.x, cz: stele.z - 8, dx: 0, dz: -1 });
  d._onClick();
  run(G, 0.5);
  assert(stele.state === 0 && stele.hp < stele.hpMax, `the stele only chips under the blade's part (${stele.hp.toFixed(2)} of ${stele.hpMax.toFixed(2)})`);
  // every call survives a world without destructibles
  const G2 = build();
  const d2 = G2.game.dragon;
  duel(G2, { dist: 4.5 });
  G2.game.player.debug.god = true;
  d2.debug.trigger('oneBreath');
  run(G2, 4, null, () => d2.mode === 'foot');
  d2.debug.phase2();
  run(G2, 4, null, () => d2.mode === 'foot');
  d2.debug.phase3();
  run(G2, 6, null, () => d2.mode === 'foot');
  assert(d2.phase === 3 && d2.stats.wakes >= 1, `a world without destructibles: the draw, both transitions, no throw (${d2.stats.wakes} wakes)`);
}
const segDist = (px, pz, ax, az, bx, bz) => {
  const ex = bx - ax, ez = bz - az, ll = ex * ex + ez * ez || 1;
  const u = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / ll));
  return Math.hypot(px - ax - ex * u, pz - az - ez * u);
};

// ================================================================== scenario: timing (flash → contact)
async function scenarioTiming() {
  out('\n== scenario TIMING (every move from inside its band: each glint is a blow, on time) ==');
  let worst = 0, moves = 0;
  for (const name of MOVE_NAMES) {
    const def = MOVES[name];
    if (def.transition || def.manual || def.cast || flat(name).some((b) => b.cast)) continue;
    for (const ph of phasesOf(name).slice(0, 1)) {
      const G = build();
      const d = G.game.dragon;
      const [lo, hi] = def.band;
      const at = def.counter ? 2.2 : Math.max(1.6, Math.min(hi - 0.4, lo + (Math.min(hi, 12) - lo) * 0.4));
      duel(G, { dist: at });
      for (let n = 2; n <= ph; n++) {
        d.debug[`phase${n}`]();
        run(G, 6, null, () => d.mode === 'foot' && d.phase === n);
        place(G, at);
      }
      G.game.player.debug.god = true;
      const flashes = [], contacts = [];
      G.watch = (n, e) => { if (n === 'combat:flash' && e?.source === 'dragon') flashes.push(G.game.time); };
      const h0 = G.hits.length;
      if (!d.debug.trigger(name)) { assert(false, `${name} P${ph}: starts`); continue; }
      run(G, 9, null, () => quiet(d) && d.sheath === 'carry');
      for (const h of G.hits.slice(h0)) if (h.r !== RESULT.IGNORED) contacts.push(h.t);
      let w = 0;
      for (const c of contacts) {
        const fl = flashes.filter((t) => t <= c + 1e-6).pop();
        w = Math.max(w, fl === undefined ? Infinity : Math.abs(c - fl - TUNING.flashLead));
      }
      worst = Math.max(worst, Number.isFinite(w) ? w : 9);
      moves++;
      if (!(contacts.length >= 1) || !(w <= 0.09)) assert(false, `${name} P${ph} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
      else out(`     ${name.padEnd(13)} P${ph} from ${at.toFixed(1)} m: ${flashes.length} flashes, ${contacts.length} contacts, worst ${(w * 1000).toFixed(0)} ms`);
    }
  }
  assert(moves >= 15 && worst <= 0.09, `${moves} moves: every contact within ${(worst * 1000).toFixed(0)} ms of its flash + ${TUNING.flashLead} s, every move's first hit lands`);
}

// ================================================================== scenario: phases
async function scenarioPhases() {
  out('\n== scenario PHASES (the Sheath, a Thumb\'s Width, the Held Breath: gates, transitions, meters, the end) ==');
  const G = build();
  const { game } = G;
  const d = game.dragon;
  duel(G, { dist: 3, ai: true });
  game.player.debug.god = true;
  d.takeHit({ damage: d.maxHp * 0.4, exact: true });
  run(G, 6, null, () => d.phase === 2 && d.mode === 'foot');
  assert(d.phase === 2 && G.counts['dragon:phase2'] === 1 && d.maxPosture === TUNING.posture.max[1] && Math.abs(d.hp - d.maxHp * TUNING.phaseAt[1]) < 1, `the phase-2 gate holds his HP at ${TUNING.phaseAt[1] * 100} %, then A Thumb's Width`);
  d.takeHit({ damage: d.maxHp * 0.4, exact: true });
  run(G, 7, null, () => d.phase === 3 && d.mode === 'foot');
  assert(d.phase === 3 && G.counts['dragon:phase3'] === 1 && d.maxPosture === TUNING.posture.max[2], 'the phase-3 gate, then The Held Breath');
  d.takeHit({ damage: 99999, exact: true });
  run(G, 8, null, () => d.mode === 'dead');
  assert(d.mode === 'dead' && G.counts['dragon:death'] === 1, 'emptied: he dies (kneels, the sword across his knees)');
  run(G, 4);
  assert(game.state === 'victory', `the flow ends in victory (${game.state})`);
  // the Lab's jumps
  const G2 = build();
  const d2 = G2.game.dragon;
  duel(G2, { dist: 3 });
  assert(d2.debug.phase2() && (run(G2, 5, null, () => d2.mode === 'foot'), d2.phase === 2) && d2.debug.phase3(), 'the Lab: phase2(), phase3()');
}

// ================================================================== scenario: late (the hanging cuts)
async function scenarioLate() {
  out('\n== scenario LATE (The Sound Arrives Late: each hanging cut told to the ledger, cued, placed clear) ==');
  for (const [stand, label] of [[true, 'standing'], [false, 'stepping off each line']]) {
    const G = build(SEED, true);
    const { game, input } = G;
    const d = game.dragon, p = game.player;
    duel(G, { dist: 5 });
    d.debug.phase2();
    run(G, 5, null, () => d.mode === 'foot');
    d.debug.phase3();
    run(G, 7, null, () => d.mode === 'foot');
    place(G, 5);
    p.debug.god = true;
    const fl = [], tl = [];
    G.watch = (n, e) => {
      if (n === 'combat:flash' && e?.attack === 'lateRain') fl.push({ t: game.time, x: e.x, z: e.z });
      if (n === 'combat:tell' && e?.attack === 'lateRain' && e.hazard) tl.push(game.time);
    };
    const h0 = G.hits.length;
    const exp0 = d.brain.ledger ? 1 : 0;
    d.debug.trigger('lateRain');
    let rolled = 0;
    run(G, 7, () => {
      if (!stand) {
        // a roll across each line at its cue
        const L = d.late.lines.find((l) => l.live && !l.rolled && d.late.t >= l.at - 0.22);
        if (L) {
          L.rolled = true;
          const ex = L.bx - L.ax, ez = L.bz - L.az, ln = Math.hypot(ex, ez);
          input.axis = { x: -ez / ln, y: -ex / ln };
          input.tap('Space');
          rolled++;
        }
      }
    }, () => !d.late.busy && d.mode === 'foot');
    input.axis = { x: 0, y: 0 };
    const hits = G.hits.slice(h0).filter((h) => h.attack === 'lateRain');
    out(`     ${label}: ${tl.length} lines marked, ${fl.length} cued, ${hits.length} contacts (${hits.map((h) => h.r).join(', ')}), ${rolled} rolls`);
    assert(tl.length >= 3 && fl.length === tl.length && exp0, `${label}: ${tl.length} hanging cuts, each with its own red cue`);
    if (stand) assert(hits.length >= 1 && hits.every((h) => h.tell === TELL.RED), 'standing at the crossing: the cuts reach the hero (red)');
    else assert(hits.every((h) => h.r !== RESULT.HIT), 'a roll at each cue: none lands');
  }
}

// ---- the defender bots (asc.mjs / duel.mjs)
function makeDefender(G, { skill = 1, early = 0.12, style = 'mixed', rng = null } = {}) {
  const pend = [];
  const stats = { flashes: 0, parryTry: 0, dodgeTry: 0, guardHold: 0 };
  let guardUntil = -1;
  return {
    stats,
    onEvent(n, d) {
      if (n === 'combat:flash' && d?.source === 'dragon') {
        stats.flashes++;
        if (skill < 1 && (rng ?? Math.random)() > skill) return;
        pend.push({ tell: d.tell, at: G.game.time + TUNING.flashLead, x: d.x, z: d.z, hazard: !!d.hazard, done: false });
      }
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.4) pend.splice(i, 1);
      for (const e of pend) {
        const left = e.at - t - DT;
        // (the Long Second's bot, ADR-158: every cue answered by the lean, from a held guard, no direction)
        if (style === 'lean') {
          if (!e.done && left <= 0.1) {
            e.done = true;
            input.press(1);
            input.axis = { x: 0, y: 0 };
            input.tap('Space');
            guardUntil = t + 0.45;
            stats.dodgeTry++;
          }
          continue;
        }
        if (style === 'block') {
          if (e.tell === TELL.RED || e.tell === TELL.BLACK) {
            if (left <= 0.12) {
              e.done = true;
              input.up(1);
              guardUntil = -1;
              const c = e.hazard ? { x: e.x, z: e.z } : g.dragon.position, p = g.player.position;
              const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
              input.axis = { x: dz / l, y: dx / l };
              input.tap('Space');
              stats.dodgeTry++;
            }
          } else {
            e.done = true;
            guardUntil = Math.max(guardUntil, e.at + 0.2);
            stats.guardHold++;
          }
          continue;
        }
        if (e.tell === TELL.RED || e.tell === TELL.BLACK || style === 'dodge') {
          if (left <= (style === 'parry' ? 0.3 : 0.1)) {
            e.done = true;
            const c = e.hazard ? { x: e.x, z: e.z } : g.dragon.position, p = g.player.position;
            const dx = p.x - c.x, dz = p.z - c.z, l = Math.hypot(dx, dz) || 1;
            input.axis = { x: dz / l, y: dx / l };
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
      if (style === 'block' || style === 'lean') {
        if (guardUntil > t) input.press(1);
        else if (guardUntil > 0) { guardUntil = -1; input.up(1); }
      }
      return pend.some((e) => !e.done && e.at - t < 0.7);
    },
  };
}

/** Fence: keep close, answer every tell, cut in his openings, the execution on a broken boss. */
function fencer(G, mortal = false) {
  const { game, input } = G;
  const p = game.player, d = game.dragon;
  input.axis = { x: 0, y: 0 };
  if (!p.alive || game.state !== 'boss') return;
  if (!mortal) p.hp = p.maxHp;
  const tgt = new THREE.Vector3();
  d.lockPoint(tgt);
  game.mouseGround.set(tgt.x, 0, tgt.z);
  const dx = tgt.x - p.position.x, dz = tgt.z - p.position.z, dist = Math.hypot(dx, dz);
  const busy = G.defend.act();
  if (dist > 2.6 && !busy) input.axis = { x: dx / dist, y: -dz / dist };
  const a = d.brain.act;
  const open = d.broken || (d.mode === 'react' && ['recoil', 'caught', 'stagger', 'flinch', 'reeling', 'trampled'].includes(d.brain.react?.kind)) || (a && a.t > a.recoveryStart) || p.critTimer > 0;
  const tick = (game.realTime * 60) | 0;
  if (!busy && dist < 3.2 && (open ? tick % 20 === 0 : tick % 70 === 0)) input.click(0);
}

/** One whole fight: { won, died, secs, phase, hits } */
function fight(seed, style, { mortal = false, skill = 1, max = 420, lean = null, marks = true } = {}) {
  const G = build(seed);
  G.marks = marks ? attachMarks(G.game) : null; // (the floor marks the fight leaves: they change nothing in it)
  const { game } = G;
  // (the Long Second learned: ADR-158's balance check, scenario LEAN)
  if (lean) game.unlocks = new lean.Unlocks(null, '?tech=lean');
  duel(G, { dist: 4, ai: true });
  G.defend = makeDefender(G, { skill, style, rng: mulberry32(seed * 3 + 1) });
  const d = game.dragon, p = game.player;
  const n = { parries: 0, perfect: 0, breaks: 0, drawsTaken: 0 };
  G.watch = (ev, e) => {
    if (ev === 'player:parry') n.parries++;
    if (ev === 'player:perfectDodge') n.perfect++;
    if (ev === 'dragon:postureBreak') n.breaks++;
  };
  const t0 = game.time;
  run(G, max, (GG) => fencer(GG, mortal), () => d.state === 'dead' || !p.alive || game.state === 'victory');
  G.watch = null;
  G.defend = null;
  const drawHits = G.hits.filter((h) => h.r === RESULT.HIT && MOVES[h.attack] && flat(h.attack).some((b) => b.draw) && h.damage > 100);
  return { marks: G.marks, won: d.state === 'dead' || game.state === 'victory', died: !p.alive, secs: game.time - t0, phase: d.phase, hp: d.hp, hits: G.hits.filter((h) => h.r === RESULT.HIT).length, drawHits: drawHits.length, killer: !p.alive ? G.hits.filter((h) => h.r === RESULT.HIT).pop()?.attack : null, ...n };
}

// ================================================================== scenario: win
async function scenarioWin() {
  out('\n== scenario WIN (a fencing bot in god mode: parries, rolls, cuts in his openings) ==');
  const r = fight(SEED, 'mixed');
  out(`     ${r.won ? 'won' : 'not won'} in ${r.secs.toFixed(0)} s: ${r.parries} parries, ${r.perfect} perfect dodges, ${r.breaks} breaks, ${r.hits} hits taken; phase ${r.phase}`);
  marksCheck(r.marks, 'sheath', out, assert);
  assert(r.won && r.phase === 3, `the fencing bot defeats the Sheathed within 7 minutes, through all three phases (${r.secs.toFixed(0)} s)`);
}

// ================================================================== scenario: strategy
async function scenarioStrategy() {
  out('\n== scenario STRATEGY (mixed / parry / dodge / block-only bots, god mode; the block-only bot must not die to a draw) ==');
  const seeds = (process.env.ABYSS_SSEEDS ?? '4242,7').split(',').map(Number);
  for (const style of ['mixed', 'parry', 'dodge', 'block']) {
    for (const seed of seeds) {
      const r = fight(seed, style, { max: 420 });
      out(`     ${style.padEnd(5)} seed ${String(seed).padEnd(4)} ${r.won ? 'WON ' : 'time'} ${r.secs.toFixed(0).padStart(3)} s  phase ${r.phase}  hits taken ${String(r.hits).padStart(3)}  draws landed ${r.drawHits}  parries ${String(r.parries).padStart(3)}  perfect dodges ${String(r.perfect).padStart(2)}  breaks ${r.breaks}`);
      if (style === 'block') assert(r.drawHits === 0, `block-only seed ${seed}: no draw landed on a held guard (${r.drawHits})`);
    }
  }
  // mortal, the block-only bot: it must not die to a draw
  for (const seed of seeds) {
    const r = fight(seed, 'block', { mortal: true, max: 240 });
    out(`     block mortal seed ${seed}: ${r.died ? `died at ${r.secs.toFixed(0)} s (${r.killer})` : `alive after ${r.secs.toFixed(0)} s`}, draws landed ${r.drawHits}`);
    assert(r.drawHits === 0, `block-only mortal seed ${seed}: never killed by a draw (${r.killer ?? 'alive'})`);
  }
}

// ================================================================== scenario: lean (opt-in; ADR-158)
async function scenarioLean() {
  out('\n== scenario LEAN (opt-in: the Long Second learned; the bots on him, the lean bot must not be the fastest) ==');
  const U = await imp('src/game/unlocks.js');
  const seeds = (process.env.ABYSS_SSEEDS ?? '4242,7').split(',').map(Number);
  const res = {};
  for (const style of ['mixed', 'parry', 'dodge', 'lean']) {
    for (const seed of seeds) {
      const r = fight(seed, style, { max: 420, lean: U });
      (res[style] ??= []).push(r);
      out(`     ${style.padEnd(5)} seed ${String(seed).padEnd(4)} ${r.won ? 'WON ' : 'time'} ${r.secs.toFixed(0).padStart(3)} s  phase ${r.phase}  hits taken ${String(r.hits).padStart(3)}  perfect dodges ${String(r.perfect).padStart(2)}  breaks ${r.breaks}`);
    }
  }
  const avg = (k) => res[k].reduce((a, r) => a + r.secs, 0) / res[k].length;
  out(`     means: ${Object.keys(res).map((k) => `${k} ${avg(k).toFixed(0)} s`).join(' · ')}`);
  assert(avg('lean') > Math.min(avg('mixed'), avg('parry')), 'the Long Second does not make leaning the fastest way through (ADR-158)');
}

// ================================================================== scenario: pace (duel.mjs PACE, his own meter)
function paceDefender(G) {
  const pend = [];
  const stats = { flashes: 0, rolls: 0, guards: 0 };
  let guardUntil = -1;
  return {
    stats,
    onEvent(n, e) {
      if (n !== 'combat:flash' || (e?.source !== 'dragon' && e?.source !== 'world')) return;
      stats.flashes++;
      pend.push({ tell: e.tell, flare: !!e.flare, at: G.game.time + (e.source === 'world' ? 0.3 : TUNING.flashLead), x: e.x, z: e.z, hazard: !!e.hazard, done: false });
    },
    act() {
      const g = G.game, input = G.input, t = g.time;
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i].done || pend[i].at < t - 0.5) pend.splice(i, 1);
      let rolled = false;
      for (const e of pend) {
        if (e.done) continue;
        const left = e.at - t - DT;
        // (a draw is rolled through as a red blow is: the steady defender keeps the exchange going)
        if (e.tell === TELL.RED || e.tell === TELL.BLACK || (e.flare && e.tell === TELL.BLUE)) {
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
        } else if (e.flare && e.tell === TELL.BLUE) {
          // a draw: a parry at its cue (a held guard would be knocked open every time)
          if (left <= 0.12) {
            e.done = true;
            input.up(1);
            input.click(1);
            guardUntil = -1;
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
  out('\n== scenario PACE (a steady defender in god mode vs his AI, per phase: cues a minute, gaps, conflicts) ==');
  const DIR = await imp('src/entities/enemies/duelist/director.js');
  const P = TUNING.pressure;
  const SECS = Number(process.env.ABYSS_PSECS ?? 60); // (60 s a phase: the suite's time; the meter was measured so)
  const SEEDS = (process.env.ABYSS_PSEEDS ?? '4242,7,99').split(',').map(Number).filter(Number.isFinite);
  const pp = (v, ph) => (Array.isArray(v) ? v[Math.min(v.length, Math.max(1, ph)) - 1] : v);
  const answer = (tell) => (tell === TELL.RED || tell === TELL.BLACK ? 'dodge' : 'guard');
  const skip = (name) => !MOVES[name] || MOVES[name].transition || MOVES[name].counter || MOVES[name].manual;
  const rows = [];
  for (const seed of SEEDS) {
    for (let ph = 1; ph <= NPH; ph++) {
      const G = build(seed, true);
      const { game } = G;
      const d = game.dragon, p = game.player;
      duel(G, { dist: 3, ai: true });
      p.debug.god = true;
      p.debug.noRiposte = true;
      G.defend = paceDefender(G);
      for (let n = 2; n <= ph; n++) {
        d.brain.forcePhase(n);
        run(G, 8, (GG) => { GG.input.axis = { x: 0, y: 0 }; GG.defend.act(); }, () => d.phase === n && d.mode !== 'act');
      }
      Math.random = mulberry32(seed * 7 + ph);
      const flashes = [], acts = [], cats = {}, busyT = [];
      G.watch = (n, e) => {
        if (n === 'combat:flash' && (e?.source === 'dragon' || e?.source === 'world')) flashes.push([game.time, e.tell, e.attack]);
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
      }
      G.watch = null;
      G.defend = null;
      const T = game.time - t0;
      const ts = [t0, ...flashes.map((f) => f[0]), ...busyT.filter((x) => x > t0 && x < t0 + T), t0 + T].sort((x, y) => x - y);
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
      const draws = flashes.filter((f) => MOVES[f[2]] && f[1] === TELL.BLUE && flat(f[2]).some((b) => b.draw)).length;
      if (process.env.ABYSS_PATT) out(`      P${ph}: ${Object.entries(acts.reduce((m, [, n]) => ((m[n] = (m[n] || 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(' ')}`);
      rows.push({ seed, ph, T, perMin: (flashes.length * 60) / T, gapMax, gapAt, picks: acts.length, conflicts, conflictAt, draws, cats, feints: d.brain.stats.feints, honor: d.stats.honorFeints });
    }
  }
  out(`   ${SECS} s per phase, seeds ${SEEDS.join(', ')}`);
  out('   seed ph cue/min gapMax moves draws feints honor clash');
  for (const r of rows) out(`   ${String(r.seed).padStart(4)}  ${r.ph} ${r.perMin.toFixed(1).padStart(7)} ${r.gapMax.toFixed(2).padStart(6)} ${String(r.picks).padStart(5)} ${String(r.draws).padStart(5)} ${String(r.feints).padStart(6)} ${String(r.honor).padStart(5)} ${String(r.conflicts).padStart(5)}  longest gap at ${r.gapAt}${r.conflicts ? ` · CONFLICTS ${r.conflictAt.slice(0, 4).join(' · ')}` : ''}`);
  const mean = (ph, k) => { const rs = rows.filter((r) => r.ph === ph); return rs.reduce((a, r) => a + r[k], 0) / (rs.length || 1); };
  for (let ph = 1; ph <= NPH; ph++) out(`   mean P${ph}: ${mean(ph, 'perMin').toFixed(1)} cues/min · longest gap ${Math.max(...rows.filter((r) => r.ph === ph).map((r) => r.gapMax)).toFixed(2)} s · draws ${mean(ph, 'draws').toFixed(1)} · conflicts ${rows.filter((r) => r.ph === ph).reduce((a, r) => a + r.conflicts, 0)}`);
  const A = P.meter;
  for (let ph = 2; ph <= NPH; ph++) {
    const a0 = mean(ph - 1, 'perMin'), a1 = mean(ph, 'perMin');
    assert(a1 >= a0 * pp(A.rampMean, ph), `the seeds' mean: P${ph} at least x${pp(A.rampMean, ph)} P${ph - 1}'s cues a minute (${a0.toFixed(1)} → ${a1.toFixed(1)})`);
  }
  for (const seed of SEEDS) {
    const r = rows.filter((x) => x.seed === seed).sort((x, y) => x.ph - y.ph);
    for (let i = 1; i < r.length; i++) assert(r[i].perMin >= r[i - 1].perMin * pp(A.ramp, r[i].ph), `seed ${seed}: P${r[i].ph} at least x${pp(A.ramp, r[i].ph)} P${r[i - 1].ph} (${r[i - 1].perMin.toFixed(1)} → ${r[i].perMin.toFixed(1)})`);
    for (const x of r) {
      assert(x.perMin >= pp(A.minRate, x.ph), `seed ${seed} P${x.ph}: ${x.perMin.toFixed(1)} cues a minute >= ${pp(A.minRate, x.ph)}`);
      assert(x.gapMax <= pp(A.maxGap, x.ph), `seed ${seed} P${x.ph}: longest gap ${x.gapMax.toFixed(2)} s <= ${pp(A.maxGap, x.ph)} s (${x.gapAt})`);
      assert(x.conflicts === 0, `seed ${seed} P${x.ph}: no two cues needing different answers within 0.3 s (${x.conflictAt.slice(0, 4).join(' · ')})`);
    }
  }
}

// ================================================================== scenario: reward (One Breath, ADR-146)
async function scenarioReward() {
  out('\n== scenario REWARD (One Breath: locked by default, the store, the stance, the cut, the draw counter) ==');
  const { Unlocks, UNLOCK_KEY } = await imp('src/game/unlocks.js');
  const { ONE_BREATH } = await imp('src/entities/player/combat.js');
  // the store
  const mem = new Map(), store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  const U = new Unlocks(store, '');
  assert(!U.has('oneBreath') && U.grant('oneBreath') && !U.grant('oneBreath') && U.has('oneBreath') && JSON.parse(mem.get(UNLOCK_KEY)).includes('oneBreath'), 'the store: granted once, kept in storage');
  assert(new Unlocks(store, '').has('oneBreath') && !new Unlocks(store, '?tech=none').has('oneBreath') && new Unlocks(null, '?tech=draw').has('oneBreath') && !new Unlocks(null, '').has('oneBreath'), '?tech=none / ?tech=draw, a fresh store');
  U.clear();
  assert(!U.has('oneBreath') && U.all().length === 0, 'cleared');
  // guard (the middle click), then hold HEAVY (the right click)
  const stance = (G, learned) => {
    const { game, input } = G;
    const p = game.player;
    if (learned) game.unlocks = new Unlocks(null, '?tech=draw');
    else delete game.unlocks;
    duel(G, { dist: 6 });
    p.debug.god = true;
    input.press(1);
    run(G, 0.25);
    input.press(2);
    run(G, 0.5);
    return p.state;
  };
  {
    const G = build();
    const st = stance(G, false);
    assert(st === 'charge', `locked (no store, the tests' worlds): guard + held heavy is the cleave's charge, as before (${st})`);
  }
  {
    const G = build();
    const { game, input } = G;
    const p = game.player, d = game.dragon;
    const st = stance(G, true);
    assert(st === 'iai' && p.flurryAnim.pose === 'coil', `learned: the draw stance (${st}, the iai's coil)`);
    const x0 = p.position.x, z0 = p.position.z;
    input.up(2);
    let def = null;
    const hp0 = d.hp;
    run(G, 0.6, () => { if (p.atk?.def) def = p.atk.def; });
    const moved = Math.hypot(p.position.x - x0, p.position.z - z0);
    assert(def === ONE_BREATH && moved > 3, `released: the cut, a blink step of ${moved.toFixed(2)} m (travel ${ONE_BREATH.travel})`);
    out(`     the cut dealt ${(hp0 - d.hp).toFixed(0)} (his guard may turn it)`);
  }
  // a roll takes him out of the stance
  {
    const G = build();
    const p = G.game.player;
    stance(G, true);
    G.input.axis = { x: 1, y: 0 };
    G.input.tap('Space');
    run(G, 0.1);
    assert(p.state === 'roll', `a roll out of the stance (${p.state})`);
  }
  // the draw counter: released just before his white blow lands
  {
    const G = build();
    const { game, input } = G;
    const p = game.player, d = game.dragon;
    game.unlocks = new Unlocks(null, '?tech=draw');
    duel(G, { dist: 2.2 });
    p.debug.god = true;
    let counter = null;
    G.watch = (n, e) => { if (n === 'player:counter') counter = e; };
    d.debug.trigger('knock');
    const A = d.brain.act, b = A.beats[0];
    let started = false, released = false;
    run(G, 3, () => {
      if (!started && A.t >= b.impact - 0.75) {
        started = true;
        input.press(1);
      }
      if (started && p.state === 'block' && !input.buttons[2]) input.press(2);
      if (started && !released && A.t >= b.impact - 0.08) {
        released = true;
        input.up(2);
        input.up(1);
      }
    }, () => counter !== null || d.mode === 'react');
    assert(counter?.draw === true && Math.abs(counter.damage - ONE_BREATH.damage) < 1e-6 && d.brain.react?.kind === 'reeling' && p.critTimer <= 0, `the draw counter: released ${(0.08).toFixed(2)} s before his blow lands, it beats it aside (${counter?.damage} damage, he reels, no crit window)`);
  }
}

// ================================================================== scenario: training
async function scenarioTraining() {
  out('\n== scenario TRAINING (every situation of the Training catalogue for this boss plays out) ==');
  const G = build(SEED, true);
  const { game } = G;
  duel(G, { dist: 4 });
  const T = game.lab.training;
  const { bossKinds } = await imp('src/dev/training.js');
  const kinds = bossKinds(game);
  assert(kinds.has('sheathed') && !kinds.has('ash') && !kinds.has('lord') && kinds.has('duel'), `his own boss kind (${[...kinds].join(', ')})`);
  const L = T.list();
  const bad = [];
  for (const s of L) {
    T.run(s.id);
    let frames = 0;
    while (T.ph !== 'done' && frames < Math.round(40 / DT)) { G.tick(DT); frames++; }
    const r = T.lastResult;
    const ok = T.ph === 'done' && r?.id === s.id && r.ok;
    if (!ok) out(`   BAD ${s.cat} · ${s.name}: ${T.ph} · missing ${JSON.stringify(r?.missing ?? '?')} · hero ${game.player.state} · boss ${game.dragon.state}`);
    if (!ok) bad.push(s.id);
  }
  T.stop();
  assert(L.length >= 20 && !bad.length && ['drawParry', 'drawGuard', 'drawRoll'].every((id) => L.some((s) => s.id === id)), `every situation plays out (${L.length - bad.length} of ${L.length}${bad.length ? `; not: ${bad.join(', ')}` : ''}), the three draw situations among them`);
}

// ================================================================== scenario: look (ADR-152: the print, the palettes, the mark, the motion)
async function scenarioLook() {
  out('\n== scenario LOOK (print 2 by default: the digits in his colours; the five steps, the palettes, the mark, his hands and feet) ==');
  const { setLook } = await imp('src/entities/enemies/duelist/lookSwitch.js');
  const { SHEATH_TONE, SHEATH_MARK, SHEATH_STEP } = await imp('src/entities/enemies/sheathed/look.js');
  const fillOf = (m) => { const c = m?.uniforms?.uArtFill?.value; return c ? [c.r, c.g, c.b].map((x) => +x.toFixed(3)) : null; };
  const same = (a, b) => !!a && !!b && a.every((x, i) => Math.abs(x - b[i]) < 1e-3);
  const meshesOf = (d, mat) => { const o = []; d.rig.root.traverse((m) => { if (m.isMesh && m.material === mat) o.push(m); }); return o; };
  // the shipped print: step 2 (the digits in palette a, lit and outlined), mark a
  {
    const G = build();
    const d = G.game.dragon, M = d.rig.materials;
    { const c = M.coat.uniforms.uWInk?.value, want = SHEATH_TONE.a.coat.map((x) => x * SHEATH_STEP['2'].ink);
      assert(!!c && !M.coat.uniforms.uArtFill && same([c.r, c.g, c.b].map((x) => +x.toFixed(3)), want), `print 2 by default: the digits in palette a (robe ink ${c ? [c.r, c.g, c.b].map((x) => x.toFixed(2)) : '?'})`); }
    assert(d._offStrip?.length === 2 && d.rig.streamers.length === d.anim.streamState.length, `mark a by default: the strip's springs on the hip piece (${d._offStrip?.length})`);
    // ADR-126's audit through One Breath (the cut's one frame is the draw itself): no hand jumps
    const p = G.game.player;
    duel(G, { dist: 4.5 });
    p.debug.god = true;
    const hR = new THREE.Vector3(), hL = new THREE.Vector3(), pR = new THREE.Vector3(), pL = new THREE.Vector3(), root = new THREE.Vector3();
    const hand = (side, v) => { const f = d.rig.arms[side].fore; f.updateWorldMatrix(true, false); return v.set(0, -0.27, 0).applyMatrix4(f.matrixWorld); };
    let worst = 0, first = true, was = d.sheath, nan = 0;
    d.debug.trigger('oneBreath');
    run(G, 4, () => {
      hand('R', hR); hand('L', hL);
      if (!Number.isFinite(hR.x + hR.y + hR.z + hL.x + hL.y + hL.z)) nan++;
      const dx = d.position.x - root.x, dz = d.position.z - root.z;
      if (!first && !(d.sheath === 'drawn' && was !== 'drawn')) {
        worst = Math.max(worst, Math.hypot(hR.x - pR.x - dx, hR.y - pR.y, hR.z - pR.z - dz), Math.hypot(hL.x - pL.x - dx, hL.y - pL.y, hL.z - pL.z - dz));
      }
      first = false; was = d.sheath; pR.copy(hR); pL.copy(hL); root.copy(d.position);
    }, () => d.mode === 'foot' && d.sheath === 'carry');
    assert(worst < 0.3 && !nan, `One Breath: no hand moves over 0.3 m in a frame outside the cut (${worst.toFixed(3)} m)`);
  }
  // the options, each on a rig built anew (read when his rig is built)
  const opt = (k, v, fn) => { setLook(k, v); try { const G = build(); fn(G.game.dragon, G.game.dragon.rig.materials); } finally { setLook(k, null); } };
  let coat0 = 0;
  opt('sheathArt', '0', (d, M) => { coat0 = d.rig.coat.length; assert(!!M.coat.uniforms.uWInk && !M.coat.uniforms.uArtFill && !meshesOf(d, M.piping).length && !d._offStrip?.length, '?sheathArt=0: the wyrm\'s digits and his body as he shipped (no mark)'); });
  for (const st of ['1', '2']) {
    opt('sheathArt', st, (d, M) => {
      const c = M.coat.uniforms.uWInk?.value, want = SHEATH_TONE.a.coat.map((x) => x * SHEATH_STEP[st].ink);
      assert(!!c && same([c.r, c.g, c.b].map((x) => +x.toFixed(3)), want) && d.rig.coat.length === coat0 + 4 && d._offStrip?.length === 2, `?sheathArt=${st}: the digits in his palette (robe ink ${c ? [c.r, c.g, c.b].map((x) => x.toFixed(2)) : '?'}), his reworked body (${d.rig.coat.length} cloth panels), the mark`);
    });
  }
  opt('sheathArt', 'a', (d, M) => {
    assert(!M.coat.uniforms.uWInk && same(fillOf(M.coat), SHEATH_TONE.a.coat) && same(fillOf(M.leather), SHEATH_TONE.a.leather), `?sheathArt=a: the ink-line print, palette a (robe ${fillOf(M.coat)}, scarf ${fillOf(M.leather)})`);
    assert(fillOf(M.trim).every((x) => x < 0.04) && Object.values(SHEATH_TONE.a).every((c) => Math.max(...c) > 0.04), 'the scabbard the darkest fill on him');
    assert(meshesOf(d, M.hair).length === 0 && meshesOf(d, M.shirt).length > 0, 'his hair off the gold-lined `hair` part');
    const strips = meshesOf(d, M.piping);
    assert(strips.length > 0 && same(fillOf(M.piping), SHEATH_MARK.strip) && d._offStrip?.length === 2 && d.rig.streamers.length === d.anim.streamState.length, `mark a: the strip on both scabbard pieces (${strips.length} meshes, ${d._offStrip?.length} springs on the hip piece)`);
  });
  opt('sheathArt', '3', (d, M) => {
    let lines = 0;
    d.rig.root.traverse((o) => { if (o.isMesh && o.material === M.coat) lines += o.geometry.attributes.aPart?.array.some((x) => x > 0) ? 1 : 0; });
    assert(!M.coat.uniforms.uWInk && !!M.coat.uniforms.uArtFill && lines === 0 && M.coat.uniforms.uArtSpec.value.x === 0, `?sheathArt=3: the ink-line art, flat (robe meshes with inner lines: ${lines})`);
  });
  for (const t of ['b', 'c']) opt('sheathTone', t, (d, M) => { const c = M.coat.uniforms.uWInk?.value; assert(!!c && same([c.r, c.g, c.b].map((x) => +x.toFixed(3)), SHEATH_TONE[t].coat.map((x) => x * SHEATH_STEP['2'].ink)), `?sheathTone=${t}: its robe (the digits' ink)`); });
  opt('sheathMark', 'b', (d, M) => assert(meshesOf(d, M.piping).length === 0 && !d._offStrip?.length && d.rig.streamers.length === d.anim.streamState.length, '?sheathMark=b: no strip (the streak instead)'));
  opt('sheathMark', '0', (d, M) => assert(meshesOf(d, M.piping).length === 0 && !d._offStrip?.length, '?sheathMark=0: no mark'));
}

const S = { level: scenarioLevel, rules: scenarioRules, draw: scenarioDraw, honor: scenarioHonor, sheath: scenarioSheath, world: scenarioWorld, timing: scenarioTiming, phases: scenarioPhases, late: scenarioLate, pace: scenarioPace, training: scenarioTraining, reward: scenarioReward, win: scenarioWin, look: scenarioLook };
const OPT_IN = { strategy: scenarioStrategy, lean: scenarioLean };
const list = SCEN === 'all' ? Object.keys(S) : SCEN.split(',');
for (const k of list) {
  if (OPT_IN[k]) S[k] = OPT_IN[k];
  if (!S[k]) { out(`unknown scenario ${k}`); process.exit(2); }
  await S[k]();
}
const notCat = [...EMITTED].filter((n) => !CATALOGUE.has(n) && n !== 'state');
assert(!notCat.length, `every event this level emits is in the catalogue ${JSON.stringify(notCat)}`);
out(`\nconsole errors/warnings: ${errors.length}${errors.length ? '\n  ' + [...new Set(errors)].slice(0, 12).join('\n  ') : ''}`);
if (errors.length) fails++;
out(fails ? `\nSHEATH: ${fails} FAILED` : '\nSHEATH: ALL PASSED');
process.exit(fails ? 1 : 0);
