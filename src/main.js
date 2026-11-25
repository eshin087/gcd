import * as THREE from 'three';
import { CONFIG } from './core/config.js';
import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { CameraRig, fovFor } from './core/cameraRig.js';
import { clamp, damp } from './core/math.js';
import { runFrame, FRAME_MAX } from './core/timestep.js';
import { createSharedUniforms } from './render/shaderLib.js';
import { createGlyphAtlas, loadFonts } from './render/glyphs.js';
import { Pipeline } from './render/pipeline.js';
import { LightPool } from './render/lights.js';
import { GlyphParticles } from './render/particles.js';
import { FireField } from './render/fireField.js';
import { ShedDigits } from './render/shedDigits.js';
import { ImpactRipple } from './render/impactRipple.js';
import { StreakFx } from './entities/player/streakFx.js';
import { TimeRip } from './entities/player/timeRip.js';
import { stampUpdate, stampClear } from './combat/impactStamp.js';
import { World } from './world/world.js';
import { Player } from './entities/player/player.js';
import { LEVELS, getLevel, levelFromSearch, applyLevel, levelUrl, withStage } from './levels/index.js';
import { Rush } from './game/rush.js';
import { Records } from './game/records.js';
import { Eligibility } from './game/eligibility.js';
import { HERO_LOOKS, LOOK_IDS, heroLookFromSearch, heroLookUrl } from './entities/player/gear/looks.js';
import { Hud } from './ui/hud.js';
import { TouchControls } from './ui/touch.js';
import { GamepadControls } from './ui/gamepad.js';
import { AudioEngine } from './audio/audio.js';
import { GameFlow } from './game/flow.js';
import { Lab } from './dev/lab.js';
import { Unlocks } from './game/unlocks.js';
import { lookOf } from './entities/enemies/duelist/lookSwitch.js';
import { bootStep, bootDone, bootFail, fontSheetReady, travelNote } from './ui/bootLoader.js';
import { precompile } from './render/precompile.js';

// Boot + main loop. Builds the shared `game` context every module receives (see ARCHITECTURE.md).

// The boot runs in named steps; between two the loading screen (index.html) repaints its bar
// (ui/bootLoader.js; no wait at all where there is no loading screen). Each step's share of the bar is
// its share of a boot measured with the CPU slowed four times (a phone's pace; the world is about
// 70 % of it); the first frame (every shader compiled) closes it.
const BOOT = { fonts: 0, renderer: 0.07, world: 0.08, hero: 0.82, boss: 0.85, interface: 0.87, shaders: 0.91 };
const BOOT_ORDER = Object.keys(BOOT);
const step = (name) => bootStep(name, BOOT[name], BOOT[BOOT_ORDER[BOOT_ORDER.indexOf(name) + 1]] ?? 1);

async function boot() {
  await step('fonts');
  await fontSheetReady();
  await loadFonts();
  await step('renderer');
  // the level (`?level=ash`; levels/index.js): its world overrides land in CONFIG.world before any
  // module reads them
  // (`?stage=lab`: the same boss on the training room, the lab stage)
  // a boss rush page (`?rush`; game/rush.js) plays the rush's current level, whatever ?level says
  let ss = null;
  try {
    ss = globalThis.sessionStorage ?? null;
  } catch {
    ss = null;
  }
  const rush = new Rush(ss, location.search);
  const level = withStage((rush.active && getLevel(rush.level)) || levelFromSearch(location.search), location.search);
  applyLevel(level);
  // the hero's outfit option (`?heroLook=robe`; gear/looks.js: kept for later use, today's look is the default)
  const heroLook = heroLookFromSearch(location.search);

  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // final pass gamma-encodes itself
  renderer.setClearColor(0x000000, 1);

  const U = createSharedUniforms();
  U.uGlyphAtlas.value = createGlyphAtlas(renderer).texture;

  const scene = new THREE.Scene();
  const fxScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, CONFIG.camera.near, CONFIG.camera.far);
  const pipeline = new Pipeline(renderer, scene, fxScene, camera, U);

  const game = {
    THREE,
    CONFIG,
    level,
    // the stage picker (title screen, Lab): every level, and a reload into one of them
    levels: LEVELS.map((L) => ({ id: L.id, name: L.name, sub: L.sub, boss: L.boss })),
    pickLevel(id) {
      travelNote(id); // the next page's loading screen names where the sword is going (index.html)
      travelNote(id, getLevel(id)?.name ?? null);
      location.assign(levelUrl(id, location.href));
    },
    // saved records, whether this page's run counts, the boss rush (game/records.js, eligibility.js,
    // rush.js; ADR-179): the flow's recorder reads them, the title shows the bests
    records: null,
    eligibility: new Eligibility(location.search),
    rush,
    startRush() {
      return this.flow?.recorder?.startRush?.() ?? false;
    },
    heroLook,
    // the outfit options (gear/looks.js; `?heroLook=`, kept by pickLevel): the Lab's OUTFIT row; live
    // (the rig is rebuilt)
    heroLooks: LOOK_IDS.map((id) => ({ id, name: HERO_LOOKS[id].name })),
    pickHeroLook(id) {
      this.player.setLook(id);
      this.heroLook = this.player.look;
      try {
        history.replaceState(history.state, '', heroLookUrl(this.heroLook, location.href));
      } catch {
        /* no history */
      }
    },
    renderer,
    scene,
    fxScene,
    camera,
    pipeline,
    U,
    events: new Events(),
    input: new Input(canvas),
    cameraRig: new CameraRig(camera),
    lights: new LightPool(U),
    fx: {
      alpha: new GlyphParticles(U, { max: 3000, additive: false }),
      add: new GlyphParticles(U, { max: 7000, additive: true }),
      // fire, void fire, sparks and smoke as one body of heat printed in small digits (ADR-113)
      fire: new FireField(U, { max: 6000 }),
    },
    time: 0,
    realTime: 0,
    timeScale: 1,
    debugTimeScale: 1, // Lab-only multiplier on game time
    hitstopTimer: 0,
    hitstopScale: 1,
    mouseGround: new THREE.Vector3(),
    state: 'title',
    settings: { quality: CONFIG.defaultQuality, showFps: false },
    /** Freeze-frame on impacts: time runs at `scale` for `seconds` of real time. The fighters hold
     *  the impact's pose; sparks and lights run on at CONFIG.render.fxLive of real time (fxDt). */
    hitstop(seconds, scale = 0.04) {
      this.hitstopTimer = Math.max(this.hitstopTimer, seconds);
      this.hitstopScale = Math.min(this.hitstopScale, scale);
    },
    shake(amount) {
      this.cameraRig.addTrauma(amount);
    },
    /** A zoom punch: the camera jumps `m` metres closer and springs back (a blade's clash). */
    punch(m) {
      this.cameraRig.punch(m);
    },
    /** A directional kick: the picture is thrown `m` metres along world direction (x, y, z) as seen
     *  on screen and springs back (a landed cut). */
    kick(x, y, z, m) {
      this.cameraRig.kick(x, y, z, m);
    },
  };
  pipeline.registerParticles(game.fx.alpha);
  pipeline.registerParticles(game.fx.add);
  pipeline.registerFire(game.fx.fire);
  game.fx.shed = new ShedDigits(game); // a struck or dissolving body sheds its letters (shedDigits.js)
  game.fx.ripple = new ImpactRipple(game); // a struck body's letters take the blow (impactRipple.js)
  game.fx.stamp = { clear: () => stampClear(game) }; // the hit printed at the contact (impactStamp.js)

  await step('world');
  try {
    game.records = new Records(globalThis.localStorage ?? null);
  } catch {
    game.records = new Records(null);
  }
  game.world = new World(game);
  await step('hero');
  // what the hero has learned (ADR-146: One Breath, the Sheathed's reward; ?tech=draw|none)
  game.unlocks = new Unlocks();
  game.audio = new AudioEngine(game);
  game.player = new Player(game);
  game.fx.streak = new StreakFx(game); // the streak on the hero and in the world (player/streakFx.js)
  game.fx.rip = new TimeRip(game); // the flurry's cuts rip the picture (player/timeRip.js, ?rip=)
  pipeline.setSeenThrough(game.player.object3d); // he prints through what covers him (ADR-106)
  await step('boss');
  // the boss slot (ARCHITECTURE.md → Levels): the wyrm or the level's own boss; game.boss is the same
  game.dragon = level.createBoss(game);
  game.boss = game.dragon;
  await step('interface');
  game.hud = new Hud(game);
  game.gamepad = new GamepadControls(game); // inert until a pad is connected and used
  game.touch = new TouchControls(game); // inert on desktop; may pick the touch quality preset
  game.flow = new GameFlow(game);
  game.lab = new Lab(game);

  const applyQuality = () => {
    const q = CONFIG.quality[game.settings.quality];
    game.world.setGrassQuality?.(q.grass);
    pipeline.setShadowSize(q.shadow ?? CONFIG.render.shadowSize);
    const dpr = Math.min(q.dpr, devicePixelRatio || 1, CONFIG.render.maxPixelRatio);
    pipeline.setSize(innerWidth, innerHeight, dpr);
    // an upscaled canvas (LOW on a phone: a 1x render on a 3x screen) stays crisp: the hero's
    // 3x5 pixel letters blur into grey under the browser's smooth upscale
    game.renderer.domElement.style.imageRendering = dpr < (devicePixelRatio || 1) - 0.01 ? 'pixelated' : '';
    camera.aspect = innerWidth / innerHeight;
    camera.fov = fovFor(camera.aspect); // a window held upright opens the view (CONFIG.camera.portraitMaxFov)
    camera.updateProjectionMatrix();
  };
  game.applyQuality = applyQuality;
  applyQuality();
  addEventListener('resize', applyQuality);

  game.cameraRig.snap(game.player.position);
  // the first frame compiles every shader on screen: the loading screen's last step. They are started
  // all at once and compiled side by side first (render/precompile.js; `?precompile=0` as before)
  await step('shaders');
  if (lookOf('precompile', 'a') !== '0') {
    const pc0 = performance.now();
    const [n, nf] = await Promise.all([
      precompile(game.renderer, game.scene, game.camera, game.pipeline),
      game.fxScene ? precompile(game.renderer, game.fxScene, game.camera, null) : 0,
    ]);
    game.precompiled = { programs: n + nf, ms: Math.round(performance.now() - pc0) };
  }

  // --- per-frame helpers
  const ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const focus = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  const lock = new THREE.Vector3();

  const updateMouseGround = () => {
    ndc.set(game.input.mouse.ndcX, game.input.mouse.ndcY);
    ray.setFromCamera(ndc, camera);
    // (a landed cut's kick translates the camera and its look point: aim from the camera without it,
    // so the facing does not wobble with the picture; cameraRig.kickOff)
    const ko = game.cameraRig.kickOff;
    if (ko && !game.viewOverride) ray.ray.origin.sub(ko);
    if (ray.ray.intersectPlane(groundPlane, tmp)) game.mouseGround.copy(tmp);
  };

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
    } else {
      // gentle look-ahead toward the mouse
      const mx = clamp(game.mouseGround.x - p.x, -8, 8);
      const mz = clamp(game.mouseGround.z - p.z, -8, 8);
      focus.x += mx * 0.18;
      focus.z += mz * 0.18;
    }
    if (game.flow.cameraOverride) {
      const o = game.flow.cameraOverride;
      focus.lerp(o.focus, o.weight);
      zoomOut = Math.max(zoomOut, o.zoom ?? 0);
    }
    // duel framing (after the flow's boss framing, which only ever pulls out): within a duelist's
    // reach the camera eases in (its TUNING.camera: `zoom` m at the desktop distance, scaled for the
    // phone's closer camera; gone `fade` m past `within`)
    const DC = d?.T?.camera;
    if (DC && game.state === 'boss' && d.isTargetable?.() && game.player.alive !== false) {
      const dist = Math.hypot(d.position.x - p.x, d.position.z - p.z);
      const k = 1 - clamp((dist - DC.within) / Math.max(0.5, DC.fade ?? 4), 0, 1);
      zoomOut += DC.zoom * k * (game.cameraRig.defaultDistance / CONFIG.camera.distance);
    }
    // (a boss that leaves the floor asks the camera back so both stay in frame: Xin Yi's flight, ADR-156)
    const pull = d?.cameraPull;
    if (Number.isFinite(pull) && pull > 0) zoomOut += pull;
    game.cameraRig.extraZoom = damp(game.cameraRig.extraZoom, zoomOut, 2.5, dt);
    game.cameraRig.update(dt, focus);
  };

  // View override (Lab model viewer; ARCHITECTURE.md → Lab → Model viewer):
  //   game.viewOverride = { pos, target, focus? } | null   (Vector3-likes, world metres)
  // applied AFTER the rig update: the camera sits at `pos` looking at `target`, and the fog centre,
  // light selection and shadow box follow `focus` (default `target`) instead of the player. The rig
  // keeps running underneath, so clearing the override snaps back to the game camera. A missing,
  // non-finite or degenerate override is ignored for that frame: it can never throw or feed NaN.
  const viewFocus = new THREE.Vector3();
  const applyViewOverride = () => {
    const o = game.viewOverride;
    if (!o) return null;
    const p = o.pos, t = o.target, f = o.focus ?? t;
    if (!p || !t || !f) return null;
    const dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z;
    if (!Number.isFinite(dx + dy + dz + f.x + f.z) || dx * dx + dy * dy + dz * dz < 1e-6) return null;
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(t.x, t.y, t.z);
    camera.updateMatrixWorld();
    return viewFocus.set(f.x, Number.isFinite(f.y) ? f.y : 0, f.z);
  };

  const updateSharedUniforms = (focusOverride) => {
    U.uTime.value = game.time;
    U.uCamPos.value.copy(camera.position);
    U.uFocus.value.copy(focusOverride ?? game.player.position);
    const m = camera.matrixWorld.elements;
    U.uCamRight.value.set(m[0], m[1], m[2]).normalize();
    U.uCamUp.value.set(m[4], m[5], m[6]).normalize();
    U.uBladeUp.value.set(0, 1, 0).lerp(U.uCamUp.value, 0.55).normalize();
    // player screen position + view depth for canopy fade
    tmp.copy(game.player.position);
    tmp.y += 1.0;
    camera.getWorldDirection(camFwd);
    const depth = tmp.clone().sub(camera.position).dot(camFwd);
    tmp.project(camera);
    U.uPlayerScreen.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5, depth, 0);
    // ... and the boss's root (the wyrm's letter grid travels with it)
    const bp = game.dragon?.position;
    if (bp && Number.isFinite(bp.x + bp.y + bp.z)) {
      tmp.copy(bp);
      const bd = tmp.clone().sub(camera.position).dot(camFwd);
      tmp.project(camera);
      if (Number.isFinite(tmp.x + tmp.y)) U.uBossScreen.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5, bd, 1);
    } else U.uBossScreen.value.w = 0;
    // a boss in ink-line art whose kit asks for it (`kit.letters`: Wen Yao) has his letters follow his
    // size as the hero's do (render/pipeline.js _updateBossLetters); ?foxLetters=a keeps the fixed cell
    pipeline.bossLetters = !!game.dragon?.kit?.letters && lookOf('foxLetters', 'b') === 'b';
    // ... and a kit may ask for them a cell or two bolder on a small frame (`kit.letterBias`: Xin Yi's
    // ?onePrint=b; undefined = 0)
    pipeline.bossLetterBias = game.dragon?.kit?.letterBias | 0;
    // the human bosses printed the hero's way (ADR-194, `?bossPrint=0|a|b`; b, his own colours, the
    // owner's pick): the materials lift his fills and break his cloth into the hem below his knee
    // (shaderLib.js uBossPrint, the feet followed every frame), the art pass draws his ink lines with
    // the hero's blocky strokes and the player's part tables (pipeline.js uBossLike)
    {
      const bpk = lookOf('bossPrint', '0', 'b');
      const on = bpk === 'a' || bpk === 'b' ? 1 : 0;
      const fy = game.dragon?.position?.y;
      U.uBossPrint.value.set(on, bpk === 'a' ? 0 : 1, Number.isFinite(fy) ? fy : 0, 0.62);
      pipeline.asciiMat?.uniforms?.uBossLike?.value.set(on, on, 0, 0);
    }
  };

  // --- loop
  let last = performance.now();
  let fpsAcc = 0, fpsFrames = 0;
  let shown = false; // the first frame is drawn: the loading screen goes
  game.fps = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    const realDt = Math.min(FRAME_MAX, (now - last) / 1000);
    last = now;
    fpsAcc += realDt;
    fpsFrames++;
    if (fpsAcc > 0.5) {
      game.fps = Math.round(fpsFrames / fpsAcc);
      fpsAcc = 0;
      fpsFrames = 0;
    }
    tick(realDt);
    if (!shown) {
      shown = true;
      bootDone();
    }
  };

  // A failing module must not freeze the whole frame: log its first few errors and carry on.
  const errorCounts = new Map();
  const safe = (name, fn) => {
    try {
      fn();
    } catch (err) {
      const n = (errorCounts.get(name) ?? 0) + 1;
      errorCounts.set(name, n);
      if (n <= 3) console.error(`[${name}] update failed`, err);
    }
  };

  // One simulation step of `stepDt` real seconds: the clocks, then everything that plays the game
  // (the Lab, the flow, the fighters, the world, the lights and particles). A frame runs one or more
  // of them (core/timestep.js), then presents once.
  let lightsAt = null; // where the light pool looked last frame (the view override's focus, if any)
  const simulate = (stepDt) => {
    let scale = game.timeScale;
    let fxScale = scale;
    if (game.hitstopTimer > 0) {
      game.hitstopTimer -= stepDt;
      scale *= game.hitstopScale;
      // a freeze-frame holds the fighters, not the sparks: particles and lights run on (never
      // slower than the game, never while the game itself stands still: a pause)
      fxScale = Math.max(scale, fxScale * CONFIG.render.fxLive);
      if (game.hitstopTimer <= 0) game.hitstopScale = 1;
    }
    const dbg = game.debugTimeScale ?? 1;
    const dt = stepDt * scale * dbg;
    const fxDt = stepDt * fxScale * dbg;
    game.realTime += stepDt;
    game.time += dt;
    game.dt = dt;
    game.fxDt = fxDt;
    game.realDt = stepDt;

    safe('lab', () => game.lab.update(stepDt));
    safe('flow', () => game.flow.update(dt, stepDt));
    safe('player', () => game.player.update(dt));
    safe('dragon', () => game.dragon.update(dt));
    safe('world', () => game.world.update(dt));
    // (the time rip: before the pools and the fire field age, so what it draws shows this frame;
    // its marks step in real time)
    game.fx.rip?.update(fxDt, stepDt);
    game.lights.update(fxDt, lightsAt ?? game.player.position);
    game.fx.alpha.update(fxDt, game.time);
    game.fx.add.update(fxDt, game.time);
    game.fx.fire.update(fxDt);
    game.fx.shed.update(fxDt);
    game.fx.ripple.update(fxDt);
    game.fx.streak?.update(fxDt);
    stampUpdate(game, fxDt);
  };

  const steps = { n: 1, dt: 0 };
  const endEdges = () => game.input.endFrame();
  /** A frame of `realDt` s: the devices, its simulation steps, the camera, the HUD, the picture.
   *  `one`: simulate it in a single step whatever its length (window.__tick: a dev aid's exact step). */
  const tick = (realDt, one = false) => {
    game.frameDt = realDt;

    if (game.input.wheel) game.cameraRig.zoom(game.input.wheel);
    updateMouseGround();
    safe('gamepad', () => game.gamepad.update(realDt)); // pad aim overrides mouseGround
    safe('touch', () => game.touch.update(realDt)); // touch aim overrides mouseGround

    // (the input's edges are cleared after the first step: core/timestep.js runFrame)
    runFrame(realDt, simulate, endEdges, steps, one);
    game.simSteps = steps.n;
    safe('lab', () => game.lab.postUpdate?.()); // hitbox overlay matches this frame
    safe('camera', () => updateCameraFocus(realDt));
    let viewAt = null;
    safe('view', () => (viewAt = applyViewOverride()));
    lightsAt = viewAt;
    updateSharedUniforms(viewAt);
    safe('hud', () => game.hud.update(realDt));
    safe('audio', () => game.audio.update(realDt));

    pipeline.updateShadowCamera(viewAt ?? game.cameraRig.focus);
    pipeline.render();
    safe('lab', () => game.lab.postRender?.()); // the model viewer's sheet reads the frame back
    if (inspect.rect) inspect.draw();
  };
  requestAnimationFrame(frame);

  // Dev aid: advance the simulation manually (works even when rAF is throttled), e.g.
  // window.__tick(1 / 60, 120) runs two seconds of game time. Each frame is ONE step of dt (a film
  // strip's exact step); `asFrame`: each is a rendered frame of dt, cut into steps as the real loop
  // cuts it (window.__tick(1 / 30, 30, true): a second at 30 fps, two steps a frame).
  window.__tick = (dt = 1 / 60, frames = 1, asFrame = false) => {
    game.eligibility?.void?.('tick'); // a run stepped by hand is not a record (game/eligibility.js)
    for (let i = 0; i < frames; i++) tick(Math.min(asFrame ? FRAME_MAX : 0.05, dt), !asFrame);
    return { state: game.state, time: +game.time.toFixed(2), steps: game.simSteps };
  };

  // Dev aid: window.__telemetry() prints and returns this level's stored move table (what each boss
  // move did to the hero, every attempt added up; game/telemetry.js), the deadliest move first.
  // __telemetry('all') returns every level's raw totals; __telemetry('clear') forgets them.
  window.__telemetry = (cmd) => {
    const M = game.flow.moves;
    if (cmd === 'clear') {
      M.clear();
      return 'cleared';
    }
    if (cmd === 'all') return M.totals();
    const rows = M.table(M.level, (id) => game.flow.moveLabel(id));
    console.table?.(rows);
    return rows;
  };

  // Dev aid: window.__inspect(x, y, w, h) magnifies a device-pixel region of the live frame
  // into a full-window overlay (nearest-neighbour); window.__inspect() hides it.
  const inspect = {
    rect: null,
    canvas: null,
    draw() {
      const [x, y, w, h] = this.rect;
      const c = this.canvas;
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(renderer.domElement, x, y, w, h, 0, 0, w, h);
    },
  };
  window.__inspect = (x, y, w, h) => {
    if (x === undefined) {
      inspect.rect = null;
      inspect.canvas?.remove();
      inspect.canvas = null;
      return 'off';
    }
    if (!inspect.canvas) {
      inspect.canvas = document.createElement('canvas');
      inspect.canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;image-rendering:pixelated;z-index:50;background:#000;pointer-events:none';
      document.body.appendChild(inspect.canvas);
    }
    inspect.rect = [x, y, w, h];
    return [renderer.domElement.width, renderer.domElement.height];
  };
  window.__game = game; // handy for debugging in the console
}

boot().catch((err) => {
  bootFail();
  console.error(err);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:0;margin:0;padding:24px;color:#f88;background:#000;font:14px monospace;white-space:pre-wrap;z-index:99';
  el.textContent = `gcd failed to start:\n\n${err?.stack || err}`;
  document.body.appendChild(el);
});
