# ABYSS — Architecture & Module Contracts

Browser game, Three.js 0.180 (WebGL2), plain ES modules, no framework. `npm run dev` serves the
repo at http://localhost:5173 ; `npm run build` emits a single-file `dist/index.html`.
This file is the **source of truth for cross-module APIs and event names** (contract version: v0.6,
the bullet-hell round of 2026-11-09 on top of v0.5's epic wyrm fight: strings and the deflect chain,
the plunge, three phases, fire hazards, keep-in-view camera, and now the bullet field).

## Conventions
- Units: meters, seconds, radians. **Y up**, ground plane y = 0 (flat).
- Camera looks north: **screen-up = world −Z**, screen-right = +X. Fixed yaw, ~58° pitch.
- Models face local **+Z**. `yaw` rotates about Y; facing vector = `(sin yaw, 0, cos yaw)`;
  `yawTo(fx, fz, tx, tz)` in `core/math.js`.
- All shader colours are linear HDR. See `docs/STYLE.md` for the look, `docs/COMBAT.md` for combat.
- Arena: clearing of radius 30 around the origin. Player clamp 31, dragon clamp 26.
  Bonfire (spawn) at (0, 25.5) south; stone circle r≈19.5; bone pile around (−3, −15.5);
  dragon sleeps at `CONFIG.world.dragonSleep` (3, −10).

## Frame order (src/main.js)
```
wheel zoom → mouse ray (mouseGround) → gamepad.update(realDt) → touch.update(realDt)
→ 1 – 6 simulation steps (core/timestep.js), each of stepDt real seconds:
    clocks → lab.update(stepDt) → flow.update(dt, stepDt) → player.update(dt) → dragon.update(dt)
    → world.update(dt) → lights.update → fx.update (alpha, add, fire, shed)
    (input.endFrame() after the FIRST step: the frame's presses and releases are seen once)
→ lab.postUpdate() → camera (rig, realDt) → view override → shared uniforms
→ hud.update(realDt) → audio.update(realDt) → render
→ lab.postRender()   (same task: the Lab model viewer's sheet reads the drawn frame back)
```
**Simulation steps** (ADR-103, `core/timestep.js`): a frame of `realDt` s (at most `FRAME_MAX` 0.1 s) is
simulated in `simSteps(realDt)` equal steps, none longer than `STEP.max` 1 / 60 s × (1 + `slack` 0.25)
= 20.8 ms: one step at 50 Hz and above (as before), two steps of 1 / 60 s at 30 fps, three at 20 fps,
six at most (below 10 fps the game runs slow). `runFrame(realDt, simulate, afterFirst, out, one)` runs
them. So no machine simulates a longer step than the headless tests do (they step at 1 / 60 s), and a
0.08 s perfect-parry window is sampled five times at 30 fps instead of three. Inside a step
`game.realDt` is the STEP's real time; `game.frameDt` is the frame's and `game.simSteps` how many
steps it took. `window.__tick(dt, frames)` runs one exact step of `dt` per frame (film strips);
`window.__tick(dt, frames, true)` runs each as a rendered frame of `dt`, cut as the real loop cuts it.
**View override** (`game.viewOverride`, Lab model viewer only): when it is
`{ pos, target, focus? }` (Vector3-likes, world metres), main.js places the camera at `pos` looking
at `target` right after the rig update, and the fog centre (`U.uFocus`), the light-pool selection
and the shadow box follow `focus` (default `target`) instead of the player / rig focus.
`uCamPos`, `uCamRight/Up`, `uPlayerScreen`, `uBossScreen` and the ASCII pass are all derived from the overridden
camera, so lighting, rim / outline, particles and the glyph grid work from any angle. The rig keeps
updating underneath; `null` snaps back to the game camera. A missing, non-finite or degenerate
override is skipped for that frame (never throws, never feeds NaN).
`dt = realDt × game.timeScale × game.debugTimeScale × hit-stop`. `realDt` is unscaled.
**`fxDt`** (`game.fxDt`): what the particles and the light pool advance by. Equal to `dt`, except
through a hit-stop, where it is `realDt × timeScale × debugTimeScale × max(hit-stop, CONFIG.render.fxLive
0.6)`: a freeze-frame holds the fighters on the impact's pose while its sparks fly on (never faster
than the game, never while the game stands still: a pause). Glyphs re-drawn every frame size their
life from `game.fxDt ?? game.dt` (one set is alive at each render however many steps a frame takes:
a set dies in the step after it was drawn). Input edges
(`pressed`) are valid for exactly one simulation step: the first of their frame. Construction order: world, audio, player, dragon, hud,
gamepad, touch, flow, lab — constructors must not dereference modules built later.
**`render`** = `pipeline.updateShadowCamera(focus)` then `pipeline.render()` (`render/pipeline.js`):
```
scene.updateMatrixWorld()            once for both scene passes (scene.matrixWorldAutoUpdate is off while they draw)
→ rigid bone sync                    every batched mesh's matrixWorld → U.uBoneTex (render/rigidBatch.js)
→ moon shadow map                    LAYER_CASTER with the depth material, then LAYER_CASTER_RIGID (one shadow
                                     mesh per batched actor) with the bone-reading depth material, same map
→ world → sceneRT
→ the hero where something covers him   a probe, then (only while it finds cover) the hero alone → seenRT,
                                     minus what the scene shows of him, the rest back into sceneRT (ADR-106)
→ the fire field                    heat blobs → a heat buffer → a flame texture, one texel per art cell
                                     (render/fireField.js, ADR-113; skipped while it holds no blob)
→ ASCII pass → FX pass (fxScene: the fire field's letters first, then the glyph particles) → bloom → final grade
→ updateZoomArt()                    picks the zoom ladder step the NEXT frame draws at (?zoomArt; ADR-120)
```
World matrices are therefore final when `render` starts: anything that moves an object after the
actors' updates must do so before `pipeline.render()` (a transform changed between the two scene
passes was never supported; now neither pass re-walks the graph). The cameras still update
themselves (`shadowCam` in `updateShadowCamera`, the main camera by the rig / view override).
**Keep-in-view:** during their update, flow (a flying or rearing wyrm) and the player (the plunge)
may call `cameraRig.keep(...)` for world spheres that must stay on screen; the rig consumes the
requests in its update the same frame (requests last one frame). `dragon.update` also runs the fire
hazards and the bullet field (`dragon.hazards.update`, `dragon.bullets.update`, both guarded), then
the thrown piece (`dragon.terrain.update`) and the phase-3 fire on its body (`dragon.ablaze.update`,
ADR-120).

## The `game` context (passed to every constructor)
| field | what |
|---|---|
| `THREE`, `CONFIG` | three.js namespace, `core/config.js` |
| `renderer, scene, fxScene, camera, pipeline, U` | rendering. `U` = shared uniforms (`render/shaderLib.js`), including `U.uBoneTex` (the rigid batches' bone matrices, see Rigid batching below). `pipeline.setShadowSize(texels)` resizes the moon shadow map (`pipeline.shadowSize`; main.js `applyQuality` passes the preset's `shadow`) |
| `events` | pub/sub: `on(name, fn)` → unsubscribe fn, `emit(name, data)` |
| `input` | **Actions** (ADR-067, `core/bindings.js`): `act(a)`, `actPressed(a)`, `actReleased(a)` — true when any code bound to action `a` (or its virtual code `'@a'`) is down / pressed / released; `bindings` (the `Bindings` instance); the player, flow and timing trainer read only actions. Raw: `down(code)`, `pressed(code)`, `released(code)`, `mouseDown(b)`, `mousePressed(b)`, `mouseReleased(b)`, `moveAxis()` → `{x, y}` (y = up/north, from the up / down / left / right actions; keys give a unit vector, a deflected virtual stick wins with its analog length ≤ 1), `anyPressed`, `wheel`. Codes are `KeyboardEvent.code`. **Virtual sources** (touch): `setVirtual(code, down)` (code = a `KeyboardEvent.code` or `'Mouse0'`/`'Mouse1'`/`'Mouse2'`; same one-frame `pressed` / `released` edges as the real device, only on a change), `setVirtualAxis(x, y)`, `releaseVirtual()` (everything up, stick centred). Virtual holds are tracked apart from the real keys / buttons. **Gamepad source** (ADR-066): `setPad(code, down)`, `setPadAxis(x, y)`, `releasePad()` — the same semantics with their own holds (a release on one source never drops a hold on another); a deflected pad stick wins over the touch stick and the keys in `moveAxis()`. `pulse(code)`: a one-frame `pressed` edge with no hold. `kbmT`: `performance.now()` of the last real keyboard / mouse event (a mousemove only with movement). Mouse events within 1 s of a touch pointer event (browser compatibility mousedown / mouseup / mousemove) are ignored. |
| `mouseGround` | `Vector3` — mouse ray ∩ ground plane, updated each frame (the ray from the camera without the kick's translation, `cameraRig.kickOff`); with a gamepad in use or touch controls on, their aim point (see Gamepad controls, Touch controls; shared helper `ui/aim.js` `aimWithoutCursor`) |
| `cameraRig` | `addTrauma(0..1)`, `extraZoom`, `focus`, `zoom(steps)` (2.5 m per step, clamped to the profile), `targetDistance`; `wheelDistance` (2026-11-16, ADR-120: the player's own zoom, `targetDistance` eased at 4/s without the framing, the cinematics and the punches the game adds; every update writes `camera.userData.zoomRatio` = `wheelDistance / defaultDistance` and `camera.userData.zoomArtOff` = `mobile`: what the letters follow, see "The letters follow the zoom"); distance profile `setMobile(bool, portrait = false)` / `mobile` / `portrait` / `lead`, `defaultDistance`, `minDistance`, `maxDistance`, `maxExtraZoom` (desktop: `CONFIG.camera.distance/min/max`, unlimited extra zoom; phone: `mobileDistance` 20 / `mobileMinDistance` 14 / `mobileMaxDistance` 34, extra zoom (lock-on, boss framing, title / intro shots) capped at `mobileMaxExtraZoom` 3 m). `setMobile` resets the zoom to the profile default; a phone held upright (`portrait`) stands `CONFIG.camera.portraitDistance` (1.2) × further back and looks `portraitLead` (1.5 m) south of the focus, so the hero stands above the middle of the screen (ADR-097). `fovFor(aspect)` (exported by `core/cameraRig.js`, applied by main.js on every resize): the vertical field of view, `CONFIG.camera.fov` in landscape, opened in a window taller than wide until the view is as wide as a square window's (`portraitMaxFov` 68 at most). `punch(m)`: the zoom punch (`game.punch`). `kick(dx, dy, dz, m)`: the directional kick (`game.kick`): `kickX` / `kickY` (m along the screen's right / up axes; the camera and its look point move together, so the view direction and the figures' lean are unchanged) and their velocities `kickVX` / `kickVY`, a damped spring (`KICK`: ω 30, ζ 0.55, ≤ 0.5 m per axis) stepped in real time after the frame's offset is drawn (the kick's frame shows the whole throw); `kickOff` (Vector3): the world translation the kick put on the camera this frame (0 without one; main.js takes it off the mouse ray, so `mouseGround` and the aim never wobble with a landed cut); `snap()` zeroes it and the punch. `cine = { zoom, x, z, w }`: flow.cinematic's pull-in (zoom m added to the distance at the desktop distance, scaled by `defaultDistance / CONFIG.camera.distance` on the phone like the punch; negative = closer; the follow focus leans toward (x, z) by w; all 0 when no moment runs). **Keep-in-view** (`FIT` in `core/cameraRig.js`): `keep(x, y, z, r = 1, must = false)` asks for a world sphere to stay on screen this frame (≤ 16 per frame; non-finite input is ignored). After the usual follow / distance damping the rig projects the subjects with the real camera and eases a ground-plane pan (`fitX` / `fitZ`, ≤ 30 m) and extra distance (`fitZoom`: ≤ 6 m to fit every subject, ≤ 12 m for `must` ones; phone 1.5 / 3 m) until they sit inside the NDC box (\|x\| 0.9, top 0.86, bottom 0.78). `must` subjects (the hero) are never cropped to fit the others. Damped (5/s, 12/s while a must subject is off the box), eased back to 0 with no requests, reset by `snap()`. `focus` = the damped follow focus + the pan. |
| `touch` | touch controls (`ui/touch.js`, below): `active`, `phone`, `portrait`, `autoAim`, `setActive(bool)`, `update(realDt)` |
| `gamepad` | gamepad controls (`ui/gamepad.js`, below): `active`, `connected`, `layout` (`'xbox'`/`'ps'`), `autoAim`, `focus`, `label(token)`, `rumble([ms, strong, weak])`, `update(realDt)` |
| `shake(a)` | camera trauma (0.15 light hit … 0.7 huge slam) |
| `punch(m)` | a zoom punch: the camera jumps `m` metres closer and springs back in ~0.25 s (`cameraRig.punch`: stacks to 6 m, eased at 11/s, scaled for the phone's closer camera). A blade's clash (1.5 – 3.6), a guard (0.7 – 2.4), every landed cut (lights 0.35 – 0.6, the slam 1.6, the cleave 1.2 – 2.0, the execution 2.0; a crit + 0.6). Optional: callers use `game.punch?.()` |
| `kick(x, y, z, m)` | a directional kick: the picture is thrown `m` metres (≤ 0.5; at the desktop distance, scaled for the phone like the punch) along world direction (x, y, z) as seen on screen and springs back with one ~12 % overshoot in ~0.25 s, in real time (it plays through a freeze). A landed cut throws it along the blade's travel (lights 0.08 ≈ 4 px at 36 m … the full cleave 0.24). Optional: callers use `game.kick?.()` |
| `fxDt` | this frame's FX time step (see Frame order): particles and lights run on through a hit-stop |
| `hitstop(sec, scale=0.04)` | brief time-scale dip measured in real seconds (also the perfect-dodge slow-mo, the plunge's included: `hitstop(0.6, 0.3)`) |
| `debugTimeScale` | Lab multiplier on game time (1 = normal). Only the Lab writes it. |
| `viewOverride` | `null` or `{ pos, target, focus? }` — camera override applied by main.js after the rig (see Frame order). Only the Lab model viewer writes it. |
| `lights` | `add({x,y,z,color:[r,g,b],intensity,radius,life,fade,fadeIn,flicker})` → light (mutable `x,y,z`, `.set()`, `.kill()`) |
| `fx.add` / `fx.alpha` | glyph particles, additive-HDR / alpha-blended. `spawn({x,y,z,vx,vy,vz,life,size,sizeEnd,glyph,color,colorEnd,alpha,alphaEnd,gravity,drag,spin,rot,flicker,stretch})`. `glyph`: char, string of chars (random pick) or atlas index. |
| `world` | `resolve(pos, radius, bound, soft = false)` circle collision (`soft`: pass through the circles marked `soft`, the trunks and stumps of breakable wood: the wyrm's body, ADR-119); `setQuality(k)` (the destruction's phone budget 0.3 .. 1; `setGrassQuality` sets it from the preset, `QUALITY` in breakTuning.js); `setPusher(slot, x, y, z, r)` grass trample (slot 0 = player, 1–9 = dragon; y > 1.5 = airborne, ignored); `clearPushers(from, to)`; `gust(x, z, strength 0..2, radius)`; `scorch.burnCircle(x, z, r, burn 0..1, heat 0..1)`, `scorch.reset()`; `colliders.blocked(ax,az,bx,bz)`; `setGrassQuality(count)` (instanced grass blades drawn; main.js applies the quality preset); **destruction** (ADR-107, see Destruction): `impact(x, z, r, power, o)`, `ignite(x, z, r, k, grass = true)`, `restore()`, `destructibles`, `fire`, `scars` (the tests' world mocks lack them: every caller outside `src/world` guards with `?.`); `bonfire {x,z}`; `nest {x,z}`; `atmosphere.setBonfireLit(bool)`; `atmosphere.skyGlow(k 0..1)` (the sky over the clearing glows orange: warms the shared ambient and fog colours; call every frame while it should show, it eases in and out and lets go 0.2 s after the last call; Armageddon, ADR-053); Lab only: `debug.setVisible(bool)` hides / restores the environment (ground, grass, forest group = trees, stones, flagstones, nest bones, bonfire; atmosphere paused and in-flight particles in `fx.*` dropped; the exact previous `visible` flags come back; lights, scorch and colliders untouched), `debug.visible` |
| `player`, `dragon`, `hud`, `audio`, `flow`, `lab` | the modules below. `dragon` is **the boss slot** (the wyrm in Cinderwood, the Ash Disciple in Ashfall; see Levels and the boss slot); `boss` is the same object |
| `level`, `levels`, `pickLevel(id)` | the level this page load built (`levels/index.js` definition), every level as `{ id, name }` (the title's stage picker, the Lab's LEVEL row), and a reload into another one (`?level=<id>`, other parameters kept). Tests may leave them out: flow falls back to Cinderwood's lines |
| `heroLook`, `heroLooks`, `pickHeroLook(id)` | the hero's outfit option (kept for later use: the owner, 2026-11-14, keeps today's look as the default; `player/gear/looks.js`): the id main.js read from `?heroLook=` (the Player wears it), every option as `{ id, name }` (the Lab's OUTFIT row), and a live switch (`player.setLook(id)`, the URL updated in place; `pickLevel` keeps the parameter). Tests may leave them out: the Player wears the default look |
| `state` | owned by flow: `'title' | 'explore' | 'bossIntro' | 'boss' | 'dead' | 'victory' | 'paused'` |
| `time`, `realTime`, `dt`, `realDt`, `timeScale`, `fps` | clocks (`dt` / `realDt` / `fxDt`: of the running simulation step) |
| `frameDt`, `simSteps` | the rendered frame's real time and the number of simulation steps it was cut into (Frame order) |
| `settings` | `{ quality: 0..2, showFps: bool }`; `applyQuality()` re-applies. A preset (`CONFIG.quality[i]`) is `{ name, grass, dpr, shadow }`: grass blades drawn, max device pixel ratio, moon shadow map size in texels (LOW 1024, MEDIUM / HIGH 2048; `CONFIG.render.shadowSize` 2048 is only the size before the first `applyQuality`). Touch devices start on `CONFIG.defaultQualityTouch` (LOW) unless the player picked one. |

Shared combat rules: `src/combat/rules.js` — `TELL`, `RESULT`, `TELL_STYLE`, `DEFENSE`, `POSTURE`,
`tellDefaults(tell)`, `facingDelta(...)`. Never hard-code these windows in actor code. `DEFENSE.plunge`
holds the plunge's range, damage and timeline (contract 2, COMBAT.md "The plunge");
`RESULT.PERFECT` now means "plunge or Ghostep".

Render helpers for creature modules:
- **Creature ASCII art** (v0.4, reworked by the reference match of 2026-11-08: ADR-018 … ADR-022).
  Creature materials render a SOURCE image into the scene target and the ASCII pass
  (`pipeline.js`) turns it into letters. `createSurfaceGlyphMaterial` defaults `flag` to `FLAG.ART`
  (0.5); with the shared `U.uArtSolid` = 1 the material writes its art source (0 = the patterned
  surface render, a look-dev A/B). `artGain` (default 1) scales the generic smooth source. The pass
  tests the hero's grid first, then the wyrm's, then the background props' (`FLAG.ART_PROP` 0.57,
  window 0.555–0.585, ADR-100), then the world grid. Two creature paths, told
  apart by the **alpha contract** (no other material may write alpha in 0.46–0.55, and none but
  prop art in 0.555–0.585):

  | alpha written | by | meaning |
  |---|---|---|
  | `0.5 + 0.01 × code` (0.50 … 0.54) | the wyrm (materials with `wyrm`) | `FLAG.ART` plus a **stroke code** from `wyrmMain`: 0 none, 1 `-`, 2 `/`, 3 `\|`, 4 `\` (the screen direction of a thin part's outline or a scale rim at that pixel). The pass decodes `floor((a − 0.5) × 100 + 0.5)` |
  | `HERO_ART.a0 + (part × 2 + aPart) × HERO_ART.step` (0.4632 … 0.4866) | the hero (materials with `heroArt`) | a **part id** inside the hero window (0.46, 0.49) that `isHero` tests (`FLAG.ART_HERO` 0.48 marks the window): `part` 0..19 from the material, `aPart` 0 / 1 the geometry's sub-id |

  `HERO_ART = { a0: 0.4632, step: 0.0006, parts: 20 }` is exported from `materials.js` (`HERO_PARTS`
  20 from `shaderLib.js`). The step is ≥ 2 half-float ulps there, so part ids need the half-float
  scene target; on the 8-bit fallback they collapse to ~7 levels (silhouette and depth lines still
  draw, part tints and fill gains come out wrong). Every hero material must pass `heroArt`
  (`createHeroMaterials` throws without a `HERO_INK` entry).
- **The wyrm's source** (`wyrm: {...}` option; dragon materials only, one `WYRM_ART` entry per
  material in `dragon/model.js`). Compiles `SG_WYRM` (plus `SG_WYRM_MEMBRANE` when `membrane` is
  given); without the option the shader is unchanged. In art mode `wyrmMain` replaces the smooth lit
  ink and writes the stroke code above. All fields optional (defaults in `wyrmFeatures`; arrays of
  the wrong size fall back to them):
  - shape: `scale [w, h]` (shingle scales in aGUV units; omit for spikes, bones, membranes),
    `scaleDir 'along' | 'down'` (roof tiles round a barrel), `strokes 'rim' | 'axis' | 'none'`
    (default `'rim'` with `scale`; `'axis'` = along a thin part's length where the fresnel term
    reaches `strokeEdge`), `tip [y0, y1, root, glow]` (horns, spikes, claws)
  - tone and light: `tone [gap, body, rim, rimWidth]`, `gap [rows, px]`, `vary` (per-scale
    brightness spread, default 0.8), `ink`, `rimInk`, `light [gain, key, fresnel, floor]`,
    `key [right, up, toward]` (a key light fixed in camera space), `envSat` (moon / ambient
    saturation; fire light keeps its colour), `under [r, g, b, k]` (lava light from below)
  - molten: `emit`, `glow [gaps, all]`, `vein [strength, share, width, plate]` (a broken voronoi
    net), `crack [strength, share, lo, hi]` (cracks along the scale gaps, faded in on down-facing
    surfaces by `smoothstep(lo, hi, −n.y)`); all × the material's `uGlow` (`model.glow`)
  - membranes: `membrane [mottle, specks, tears, edgeTears]`, `boneGlow [width, base, hot]` (the
    orange streak along the finger bones, default [0.3, 0.05, 0.9])

  Uniforms `uWScale, uWShape, uWTip, uWTone, uWGap, uWInk, uWRimInk, uWLight, uWKey, uWEnvSat,
  uWVein, uWCrack, uWVary, uWEmit, uWGlow, uWUnder` (+ `uWMem, uWMemBone`), plus the shared
  `U.uCamRight` / `U.uCamUp` (added only to `wyrm` materials). Today the hide materials (`scales`,
  `limbs`, `neck`, `head`, `belly`, `throat`, `lava`) use `strokes: 'none'` (scale outlines by letter
  brightness only); `wingBone`, `spine`, `bone`, `claw` and `teeth` use `'axis'`.
  `SG_WYRM_MEMBRANE` reads two static vertex attributes of `WingMembrane` (`membrane.js`, laid out
  once on `WING_KEYS.HALF`): `aEdge` (0 inside → 1 on the free trailing edge: holes and the ragged
  edge) and `aBone` (model units to the panel's nearer bone: `boneGlow`).
- **The wyrm's letters** (pass; `wyrmGlyphs.js`, tested by the wyrm branch for `FLAG.ART` pixels and
  by `tests/glyphcheck.mjs`; fine pixel-font digits, ADR-093):
  - `WYRM_FONTS` (`f3x5`, `f4x6`, `f5x7`: glyph w x h px, `top` offset, cell cw x ch, bitmaps) and
    `wyrmArtFont(H)` → `{ font, s, cell: [cw, ch] }`: the font and integer scale whose cell height is
    nearest H / 90, ties to the smaller (4x6 cells on a 393 px phone, 5x8 at 720p, 6x9 at 1080p,
    10x16 at 1440p, 15x24 at 2160p). `wyrmArtCell(H)` is its `cell`. `createWyrmArtAtlas(font, s)` →
    `{ texture, sets: [mid start, bright start, stroke start], total, ink }`: one row, column 0 blank, then
    `WYRM_SETS.dim / mid / bright`, then `WYRM_STROKES` (`- / | \`), each glyph with a soft 0.24
    halo; `ink` = the set letters' mean coverage of their cell (0..1). `setSize` rebuilds it when the
    font or scale changes (`tArt`, `uArtCell`, `uWyrmAtlas`).
  - **The letters follow the zoom** (2026-11-16, ADR-120; `?zoomArt=a|b|c`, read once into
    `pipeline.js` `ZOOM_ART`, default `b`, the owner's pick; `a` the fixed letters of before, `c` half
    way): past the player's default zoom the art cell (the wyrm, prop art, the fire field) and the
    screen grid (the trees) step down a **ladder** of fonts so an object keeps about the letters it has
    at the default distance; zooming in never grows them. `wyrmArtLadder(H)` → `[{ font, s, cell }]`:
    `wyrmArtFont(H)` first, then every smaller cell of the font / scale pairs (plus the 3x5 font
    doubled, 8 x 12), largest first, one per cell height. `zoomArtStep(hs, r, p, cur, hyst)` → the
    step for a zoom `r` times the default (r ≤ 1: step 0) at strength `p` (log terms: 1 the letters
    shrink as the picture does, 0.5 half of that), moving off the current step only once the wanted
    cell height is `hyst` (log) nearer the new one. `CONFIG.camera.zoomArt = { strength: { a: 0, b: 1,
    c: 0.5 }, hyst: 0.1, minPitch: 0.35 }`. The pipeline: `zoomArt`, `zoomLadder` (per step `{ key,
    cell, atlas, gridCell, grid }`; built in `setSize`, every step's atlases uploaded at once, option a
    builds step 0 only; a grid step is scaled like the art cell and never under 9 px tall),
    `zoomStep`, `_applyZoomStep(i, resized)` (swaps `tArt`, `uWyrmAtlas`, `artCell`, `tGrid`, `cell`
    and calls the fire field's `setCell`; no allocation), `setZoomArt(mode)` (live: the Lab),
    `zoomDistance(cam)` (the camera's distance to the ground along its view; 0 when it looks down less
    steeply than `minPitch`) and `updateZoomArt()`, run at the end of `render()` so every reader of the
    cell (the pass, shed digits, the let-go, the fire field, `artCell` read by dragon.js and the
    duelists' flare) sees a step from the same frame on. The zoom it follows is the player's own:
    `camera.userData.zoomRatio` (`cameraRig.wheelDistance / defaultDistance`, written by the rig), not
    the measured camera distance (the boss framing adds 5 – 9 m and would have changed the default
    look); a camera without a rig falls back to `zoomDistance() / CONFIG.camera.distance`. A phone
    (`camera.userData.zoomArtOff`, from `cameraRig.mobile`) stays on step 0. `uArtInk` (ASCII pass)
    multiplies the art letters by the step-0 font's `ink` over this font's (clamped 0.75 – 1.25), so an
    object keeps its tone as its letters shrink. Cell heights at wheel 24 / 36 / 54 m, option b: 1080p
    9 / 9 / 6 px, 1440p 16 / 16 / 12, 2160p 24 / 24 / 16; 1080p steps out at a wheel distance of
    40.15 m and back at 36.30 m.
  - The grid is anchored to the boss (ADR-092): `main.js` writes his root's screen position into
    `U.uBossScreen` (uv x, uv y, view depth, 1 while there is a boss) every frame, the pass rounds it
    to whole px (`uWyrmAnchor`) and counts cells from there, so the letters travel with the wyrm.
  - Per cell (4 samples find it; 2 must hit, 1 if the cell draws a stroke; then, with `uWyrmTaps` 1,
    a 4x4 grid of 16 more samples averages its tone): the cell value picks a letter SET, the cell's
    hash the letter inside it, so letters only change when a cell changes tier; ≥ `uWyrmGlyph.w`
    stroke-code votes print that stroke glyph in the brightest coded sample's colour; silhouette
    cells (1–3 hits) print a marching-squares edge stroke (`uWyrmOutline`; a horizontal edge keeps
    its letter); each letter pixel takes `uWyrmTone.w` of its brightness and hue from its own source
    pixel (the scale edges cut through the digits).
  - Uniforms: `uWyrmTone` (x brightest letter 0.95, y gamma 1.3, z value below which a cell prints
    nothing 0.022, w own-pixel share 0.85), `uWyrmGlyph` (x / y set steps dim → mid → bright 0.12 /
    0.42, z per-cell dither 0.08, w stroke votes 1), `uWyrmAtlas` (vec4: the atlas `sets` and
    `total`), `uWyrmOutline` (1), `uWyrmAnchor` (vec2 px), `uWyrmTaps` (1). The pass's `.y` uniforms
    are the wyrm's: `uArtLum.y` 2.2, `uArtBlack.y` 0.004, `uArtMin.y` 0.012, `uArtEdge.y` 0 (the
    depth-gap blackout is off). `uArtMax` (0.8) is shared.
- **The hero's source** (`heroArt: {...}` option, built from `HERO_INK` by `createHeroMaterials`):
  `part` (0..19, required; throws outside), `fill [r, g, b]`, `spec`, `specPow`, `rim`, `glow` (share
  of the animated `uInkGlow`: blade, gem, flask), `folds [freq, depth, wander]` (throws if not
  finite). Defines `SG_HERO_ART` (with `HERO_A0`, `HERO_AS`), `SG_HERO_FOLDS`; uniforms `uArtFill`,
  `uArtSpec`, `uArtRim`, `uArtGlowK`, `uArtPart` (= part × 2), `uArtFold`; shared `U.uCamRight`,
  `U.uCamUp`, `U.uArtHeroLight` (vec4: flat fill, camera key light from the upper left, scene-light
  share, glint gain; (0.2, 0.95, 0.2, 1.4)), `U.uArtHeroRim` (the cool screen-left rim colour) and
  `U.uHeroSolid` (look-dev: 1 = a plain-lit clay render with alpha 0, passed through by the ASCII
  pass; ADR-035). The fill is flat per part (no glyph gaps); glints only where the surface curves. Every hero
  material, the blade included, is depth-tested like any mesh: the depth pull (`heroArt.pull`,
  `SG_HERO_PULL`, `uArtPull`, ADR-022) was removed on 2026-11-09 (ADR-031).
  - `aPart` (float vertex attribute, 0 / 1): `sub(geometry, k)` in `player/heroGeo.js`, carried through
    the static merge; a geometry without it reads 0 (`defaultAttributeValues`). It splits one part
    into pieces the pass outlines up close (coat panels, hair locks, the blade's two halves).
    `foldLines(geometry, fn)` (ADR-036) writes a smooth 0..0.9 field instead: the pass prints its
    0.5 contour as a drawn crease and `sub` (`HERO_INK`, `uArtSub`) darkens the side above 0.5.
  - `folds`: dark fold bands in the fill up close (gone between 8 and 16 m).
- **Per-part pass data** (`U.uHeroPartInk[20]`, `U.uHeroPartFill[20]`, vec4, shared; filled once by
  `createHeroMaterials` from `HERO_INK`): ink = line tint rgb × gain (`line`; > 1 blooms: the cyan
  blade edges, the violet gem); fill = x `fillGain`, y line style (0 one stroke per letter cell,
  1 dotted (`dotted`), 2 unbroken (`solid`), + 4 when `open`: no dark channel or depth-step gap, the
  face), z `farLine` (share of inner-line light kept at the game camera: 0 a dark seam (cloth) … 1
  bright (armour, blade)), w `farFill` (fill gain there). Materials that share a `part` must share
  these fields. Part 17 = the player's blade (`HERO_INK.blade` / `bladeTip`, only gear/wanderer.js's
  sword uses `M.blade` / `M.bladeTip`): `player.js` rewrites its fill .x, ink .w and rim .w every
  frame (`TUNE.bladeFlare`: the strike and contact flare; absolute values, the `HERO_INK` base at
  rest). Nothing else may use part 17 (a boss blade on `M.blade` would flare with the hero's: give it
  a new part).
- **The hero's letters and lines** (pass, hero branch):
  - Grid (ADR-036): `createPixelArtAtlas(hs)` (`glyphs.js`; hs = max(1, floor(H / 1080))) →
    `{ texture, count, cols }`: one row, the 3x3 micro-font `PIXEL_3X3` (29 marks) sorted sparse →
    dense (`uHeroCount`, `uHeroCols`). Cells `uHeroCell` = `pixelArtCell(hs)` (4hs x 4hs, square).
    Ink lines are drawn per pixel by the pass, not from glyphs. `U.uArtHeroCel` (vec3: step from
    shadow to lit between x and y, z = share of the step) cel-shades the art source;
    `U.uHeroPartRim[20]` (vec4: tint × gain) is each part's silhouette ink; fill style + 8 = a
    dotted silhouette.
  - Fill: a cell whose centre is on him (or ≥ 2 of its 4 samples) prints one letter. Its part's
    light (`uArtLum.x` 3, `uArtBlack.x` 0.06) picks it along the ramp `uHeroFill.zw` (near) /
    `uHeroFar.xy` (far), jittered by `uArtDither.x` 2.6 / `uHeroFar.z`; brightness `uHeroFill.xy` ×
    `fillGain`. Cell-level edge classes (`heroEdge`, threshold `uArtEdge.x` 0.004 × depth, creases by
    `uHeroCrease`) only darken the cell: an edge cell prints a dim letter up close (`uHeroPx.z`, the
    dark channel), the far side of a depth step a gap (`uHeroInk.w`). `uArtMin.x` is unused.
  - Ink lines, per PIXEL (`heroPxEdge` against the neighbours `uHeroPx.x` = hs px away): 1
    silhouette, 0.8 depth step (drawn by the nearer side; a slope predictor skips curved and grazing
    surfaces; threshold `uHeroPx.y` 0.0015 × depth), 0.6 part edge (drawn by the higher part id), 0.4
    piece edge (sub-id; up close only). One font pixel wide, plus a dimmer second pixel up close
    (`uHeroPx.w` 0.45). Line light `uHeroInk.xy` (dark / lit source), `.z` hue share, × `uHeroLine`
    (depth step / part edge / piece), × the part's ink; the stroke style (part fill .y) gaps it per
    letter cell.
  - Distance LOD by view depth: `uHeroLod` (x / y far look starts / complete 6 / 20 m, z far fill
    gain 1.3, w the silhouette's light floor 0.25) and `uHeroFar` (x / y far letter ramp 0.45 / 0.85,
    z far jitter 1, w HDR cap 1.3 for the blade and gem; 1.8 until ADR-034). Far away piece edges drop out (dithered per
    cell), inner lines keep `farLine`, the fill takes `farFill`.
  - `uHeroDebug` (look-dev): 1 the raw source, 2 lines only, 3 lines coloured by class.
  - `U.uHeroSolid` (look-dev, shared, hero materials only; ADR-035): 1 = the hero's materials write
    a plain-lit clay render of the geometry (tinted per part, the two sub-pieces of a part shaded
    apart) with alpha 0, so this pass passes it through untouched; 0 in play. The Lab model viewer's
    `look` sets it (and `uHeroDebug`) and restores both on exit.
  - Halo: `uHeroHalo` (xy his screen uv, z radius px, w strength), set per frame in
    `_updateAsciiCamera` from `U.uPlayerScreen` (radius `HERO_HALO_R` 2.1 m; strength fades in from
    0.4 × to 1 × `uHeroHaloShape.w` = 20 m view depth, so none in close-ups), and `uHeroHaloShape`
    (x / y tap radii 2 / 4 px × hs, z darkening 0.72). Two rings of 8 taps darken **world-grid**
    pixels round him (grass, stones, trees, bonfire); the wyrm's letters are not darkened, except
    round the parts of him it covers (`seenHalo`, next item).
- **The hero seen through what covers him** (ADR-106; `pipeline.js`). When something stands
  between the camera and the hero (the wyrm's body or a wing, a tree, a pillar, a landmark), the
  covered parts of him are printed through it: his own ink-line art in the blade's cyan, with a
  thin dark gap round it. In the open nothing changes (the frame is pixel-identical).
  - **API:** `pipeline.setSeenThrough(object3d | null)` names the object (main.js: the player's
    `object3d`; a loadout rebuild keeps that root). `CONFIG.render.seenThrough` = `{ on, reach,
    margin, bareMargin, probe, hold }`: `on` is read every frame (`false` when the page URL has
    `?noseen`, read once in `core/config.js`: an A/B switch like `?nobatch`); `reach` 2.8 m is the
    half-size of the box round his screen point (`U.uPlayerScreen`) that is drawn; `margin` 0.6 m
    / `bareMargin` 1.5 m are how far in front of him a tagged / an untagged (alpha < 0.03) pixel
    must be to count as cover; `probe` `[half-width, from, to]` m is the slab through his body the
    gate tests; `hold` 20 frames the pass keeps running after the gate last found cover.
  - **What counts as cover** needs nothing from the covering object's material: anything drawn
    in the scene pass that writes depth, at least the margin in front of his surface. Never
    cover: a pixel in the hero's alpha window (a human boss is built by `buildHero` and writes
    it; the duels are unchanged), grass and ground within `bareMargin`, and anything in the FX
    scene (glyph particles are composited after the ASCII pass and do not write the scene depth).
    A new big object (a thrown tree, a lifted pillar, a wall) gets it for free; to keep a small
    thing from ever triggering it, leave it untagged or keep it within the margin of him.
  - **The pass** (`_renderSeen`, render step 2b, right after the world pass; no allocation; it
    returns whether it ran): (1) the **gate** `_seenProbe`: one quad (`seenProbeMat`, no colour or
    depth write, `GreaterDepth`) over the screen rect of the probe slab, at his centre line's
    depth less `margin − 0.1`, inside an `ANY_SAMPLES_PASSED` occlusion query on the scene
    target. Its answer is read on a later frame; a yes (or no answer for more than 3 frames: a
    hidden tab, frames stepped in one task with `__tick`) keeps the pass on for `hold` frames.
    Without usable queries (they throw, or the renderer has no GL context as in the headless
    tests) `seenGate.off` is set and the pass runs every frame. (2) the object alone, with its
    own materials, into `seenRT` (the size of the scene target, half-float + depth texture,
    scissored to the box: outside it the target is stale and never read). (3) `seenMaskMat`: a
    quad into `seenRT` whose depth is the scene's pushed back by the margin, `GreaterEqualDepth`,
    writing alpha 0: it erases every pixel of him the scene shows. (4) `seenPatchMat`: what is
    left goes into `sceneRT` over its cover (colour, part id, his own depth; `AlwaysDepth`), so
    the ASCII pass draws him there like anywhere else. The scene target's depth at those pixels
    is then the hero's (the FX particles' soft depth test sees him, not his cover).
  - **The ASCII pass:** `tSeen` (= `seenRT`), `uSeen` (xy his screen uv, z the box's half-size in
    px less 2, w 1 while the pass ran this frame, else 0 and `tSeen` is not read), `uSeenInk`
    (0.3, 0.86, 1.0: the blade's cyan), `uSeenTone` (x silhouette line 1.15, y inner-line gain
    1.6, z fill gain 1.2, both capped at 1.3; w the dark gap 0.85). At the end of the hero's
    branch a pixel (or its cell centre) that `tSeen` marks takes `uSeenInk` × that brightness;
    the wyrm's letters are multiplied by `1 − seenHalo(px)` (the halo's two rings looking for
    `tSeen` pixels); over props and the world grid the existing halo finds the patched pixels.
    `IS_HERO_GLSL` is the one definition of the hero's alpha window, shared by the ASCII pass and
    both quads.
  - **Cost** (Edge, RTX 4090, 1280x720, one task per frame): in the open one more draw call (the
    probe: 57 → 58) and no measurable time; while covered 21 more (78: the hero's 18 material
    batches, the probe, two quads) and 0.3–0.5 ms a frame.
- **Leftovers** (declared, no longer effective): `U.uArtHeroKey` / `U.uArtHeroEdge` are still in
  `SURFACE_SHARED` and computed by the generic source, but the `SG_HERO_ART` fill replaces that
  colour on every hero material. `createArtAtlas` (`glyphs.js`) is no longer imported; the generic
  `artCell()` pass function and its `uArtCount` uniform were removed.
- `createSurfaceGlyphMaterial(U, opts)` (`render/materials.js`). **v0.3: crisp surface glyphs.** One
  glyph per aGUV cell is printed on the body (aGUV +y = "glyph up"), picked by local light, over
  near-black gaps (`base`). Pass `ascii: <set>` to pick the default ramp + cell (`SURFACE_SETS`):
  - `'scales'`: `. v ^ A` chevrons along the flow
  - `'strands'`: `. : | I` strokes for hair, cloth folds, membrane veins and blades
  - `'plates'`: `. - = #` bands for belly and armour
  - `'smooth'`: `. : o 0` for skin, eyes and gems

  Override per part with `glyphs`, `cell` (meters; keep glyphs ≥ ~6 screen px), `rowShift`,
  `lumScale`, `glyphZoom` (default 0.72) and `outline` (moonlit silhouette line, default 1.1; use 0
  on large bodies; falloff pow 6). `grid: true` keeps the v0.2 screen-grid rendering (unused). Runtime uniforms: `uGlow` (emissive seams/brightness), `uInkGlow`, `uFlash`, `uDissolve`, `uTint`,
  `uWarn` (vec4: rgb + strength in `.w`; glow on glyphs and the silhouette rim). Actors drive `uWarn`
  on all their materials for the red (dodge-only) tell — colour and ramp numbers in
  `TELL_STYLE.red.warn`, timing in COMBAT.md "Tell presentation".

  **Optional features** (for the concept-sheet rebuilds; `docs/art/hero.md` §3, `docs/art/dragon.md`
  §3). Each compiles in through `material.defines` only when its option is given; without them the
  shader, uniforms and pixels are exactly the pre-existing ones. They apply to the crisp path, not
  `grid: true`. Defaults live in `SURFACE_FEATURE_DEFAULTS`; bad values throw at construction.
  - `levels: ['', ".'", ':;', 'AV', 'A8BD', '80B@']`: 1–6 strings, dark → bright, each up to 8 glyph
    **variants** for that light level (`SURFACE_LEVELS`), one picked per cell by hash; a space (or
    `''`) is an empty cell. Overrides `glyphs`. Level = `floor(clamp(light × lumScale + jitter) ×
    count)` like the 4-glyph ramp, but the light is extrapolated to the **cell centre**, so every
    glyph is drawn whole (the 4-glyph ramp picks per pixel and can cut a glyph at a light step).
    Every glyph goes through `gi()` (throws if missing from the world atlas), and `npm test`'s glyph
    check scans `levels: [...]` keys and `*_LEVELS` / `*_GLYPHS` / `*_RAMP` array constants.
    Uploaded once as `uLvGlyph` (vec4[12]), `uLvCount` (float[6]), `uLvN`.
  - `levelInk: [[r,g,b], ...]`: ink per light level (dark → bright, last repeats), replacing `ink`
    (`inkAlt` still mixes in by chance). E.g. dim grey shadow glyphs, near-white lit tops.
  - `glowAxis: [x,y,z]` (OBJECT space, so it follows the part as it animates), `glowBias` 0..1
    (default 1; 0 = even), `glowRange [lo, hi]` (cosine band, default `[0, 0.75]`): `uGlow` (seams,
    warm tint) and `uInkGlow` concentrate on the side whose normal faces the axis, e.g. `[0,-1,0]`
    for a molten throat / chest / belly underside on a single mesh.
  - `inkAxis: [x,y,z]` (alias `inkAltAxis`, OBJECT space), `inkAxisChance` (default 0.6),
    `inkRange` (default `[0, 0.75]`): cells facing the axis pick `inkAlt` with up to that chance,
    fading to `altChance` elsewhere (e.g. more orange alt glyphs on the lower flanks). Decided per
    cell from the cell-centre normal, so a glyph is never half alt.
  - `crack: 'grid' | 'voronoi'`: `'grid'` (default) = seams on the glyph cell borders; `'voronoi'` =
    irregular fissures from a 3×3 cellular noise on aGUV, width jittered and pulse phased per plate.
    `crackScale` = plate size in glyph cells (default 2.5), `crackWidth` multiplier (default 1).
  - `seamAxis: 'both' | 'y' | 'x'`: `'y'` = seams run along aGUV y only (between columns, e.g.
    radiating wing veins; use `rowShift: 0` so they stay continuous), `'x'` = along x only (between
    rows). With `crack: 'voronoi'` it stretches the plates 3× along that axis instead.
- `limbGeometry`, `ellipsoidGeometry`, `hornGeometry`, `cylindricalGUV`, `planarGUV` (`render/glyphGeometry.js`).
- `createPropArtMaterial(U, opts)` (`render/materials.js`) — **prop art: background objects in the
  dragon's look** (ADR-100; the rule for every new object: STYLE.md "The house style"). Writes the
  smooth lit source of a static object with alpha `FLAG.ART_PROP`; the art pass prints it. Geometry
  baked in world space with the carved attribute set (`aCol`, `aAO`, `aEdge`; `aMoss` / `aInk` may be
  present, ignored), so a set's `stones` geometries need no change. Options: `gain` (1), `key`
  (camera-fixed key light, 0.5), `edge` (1), `fadeNearPlayer`, `side`. A prop in a set's screen-grid
  `props` mesh (`createAsciiObjectMaterial`) joins the same look with `flag: FLAG.ART_PROP` in
  `paint()`.
  - **The pass's prop branch** (`pipeline.js`): the wyrm's atlas and cell (`tArt`, `uArtCell`), cells
    counted from `uPropAnchor`; 4 samples find a cell (2 must hit, 1 if it draws a stroke) and are
    its tone; `artLetters()` (shared with `wyrmCell`) prints it; `edgeDir()` gives the stroke along
    a silhouette (1–3 hits) or along a depth step inside the object.
  - Uniforms: `uPropTone` (x brightest letter 0.9, y gamma 1.3, z cutoff 0 = every cell prints, w
    own-pixel share 0.7), `uPropGlyph` (x / y set steps 0.16 / 0.48, z dither 0.08), `uPropLum` (x
    black point 0, y curve 9, z dimmest letter 0.085), `uPropOutline` (x silhouette stroke gain 1.9,
    y inner depth step 0.012, z its gain 1.35), `uPropAnchor` (vec2 px, set per frame in
    `_updateAsciiCamera` from `U.uFocus`: the screen position of the focus minus its world offset
    times the px-per-metre there, wrapped to one cell).
- **Landmarks** (`world/landmarks.js`; second pass ADR-113): builders that return painted geometries in world space:
  `buildElderWyrm`, `buildCinderTree` (Cinderwood), `buildSectGate`, `buildCauldron`, `buildColossus`
  (Ashfall; opts `{ col, head, blade, tall, lo, hi }`), `buildWarden`, `buildGreatSword` (opts `{ lean,
  tilt, col, steel, edge }`; built for the Obsidian Throne's first hall; not placed since ADR-113),
  all `(rng, x, z, yaw, s, opts?)`.
  `buildElderWyrm` and `buildCinderTree` tag every part with the piece it breaks with
  (`userData.piece`, 2026-11-16, ADR-120; no draw on the random stream, the look is unchanged): the
  skeleton `spine0` … (`ELDER_PIECES.spineRun` 5 vertebrae a run), `rib<i>L` / `rib<i>R`, `hip`,
  `mast`, `fingers`, `wing`, `skull`, `jaw`, `hornL` / `hornR`; the tree `trunk` (roots, hollow,
  stub) and `bough0` … `bough4` (each with its forks, twigs and leaves). `buildCinderStump(rng, x, z,
  yaw, s)`: the charred foot left when its trunk breaks. `forest.js` turns each tag into a breakable
  (see Destruction).
  `carved(parts)` converts painted parts to the carved attribute set for a set's `stones` mesh;
  For the Obsidian Throne's crater (ADR-112): `buildFallenStar(rng, x, z)` (the split star behind the
  seat and its crown of splinters), `buildSpike(rng, x, y, z, { h, w, d, tip, lean, yaw, roll, col,
  lump })` (a tapering slab: the rim's plates, the crown), `starCleft(rng, x, z)` (inlay glyphs for
  the set's glow batch), `facetCol(col, k)` (a `carve()` colour: one tone a facet), `STAR_GLASS`,
  `STAR_COLLIDERS`. These are built with `carve()` attributes already and need no `carved()`.
  `landmarkPoint(x, z, yaw, s, lx, lz)` maps a builder's local point to the world;
  `ELDER_COLLIDERS`, `GATE_COLLIDERS`, `COLOSSUS_COLLIDERS`, `CAULDRON_COLLIDERS` are `[lx, lz, r]`
  lists the set adds; `COLOSSUS_FALLEN_HEAD` and `GATE_FOOTPRINT` (the gate's own space: it stands
  turned) describe what a set keeps clear. Where they stand: `FOREST_LANDMARKS` (`forest.js`: the
  skeleton along the EAST rim, the tree on the west), `COURTYARD.greatGate / cauldron / guardians`
  (`courtyard.js`: the gate beyond the east pillars, the swordsmen in the pillar ring, the cauldron
  on the paving), `THRONE.star` (`throneHall.js`). They stand where the duel's camera looks: the east / west sides, turned to face it. Trees,
  boulders and breakables in a landmark's footprint are built, then dropped (or never placed), so
  the rest of a level's random layout does not move. Each set uses its own seeded rng for them.
- **The fire field** (`render/fireField.js` exports `class FireField`; `game.fx.fire`; ADR-113):
  fire, void fire, sparks and smoke as one body of heat printed in the wyrm's small letters.
  - `spawn({ x, y, z, vx, vy, vz, life, size, sizeEnd, heat, heatEnd, kind, drag, gravity })`: one
    soft blob. `size` / `sizeEnd` metres across; `heat` / `heatEnd` what it adds at its centre
    (overlaps ADD UP: ~0.4 a cool rim, ~1 the body, 2+ the white heart; default `heatEnd` 0.35 x
    `heat`; the last sixth of its life it fades out); `kind` `'fire'` (default) | `'void'` |
    `'steel'` | `'smoke'` or a `FIRE_KIND` number; `gravity` > 0 rises. NaN positions are dropped.
    `clear()`, `update(dt)` (main.js, with `fxDt`), `count`, `max` (6000), `active`.
  - Pipeline side: `init(type, depthTexture)`, `setSize(W, H, cell, art, minCell = cell)`,
    `setCell(cell, art)`, `render(renderer, camera,
    fs)` (blobs, soft depth-tested against the scene, into `heatRT`: r fire, g smoke, b void, a
    steel, all x 0.4; then the flame pass into `flameRT`: r heat x 0.4, g smoke, b the letter's
    roll, a (kind + (stroke + 1) / 8) / 4), `mesh` (the print quad, `renderOrder` -10 in the FX
    scene), `alloc` (the buffers' size: the frame in cells of `minCell`, the zoom ladder's finest
    step) and `cells` (the part of them drawn this frame, in cells of `cell`). Since 2026-11-16
    (ADR-120) `setSize` allocates the targets once for `minCell` and `setCell` (a zoom ladder step)
    only moves their viewport to `ceil(W / cell)` x `ceil(H / cell)` texels: no re-allocation; the
    flame pass (`uAlloc`, `uCells`) clamps its look-ups to `cells`. Spawn and tint are unchanged.
    `Pipeline.registerFire(field)` wires it. The ASCII pass has `tFlame`, `uFlame` (alloc x, alloc y,
    1 while something burns) and `uFlameCells` (`cells`): the heat haze reads them, clamped to the
    cells drawn.
  - Looks are data: `render/firePalettes.js` exports `FIRE_PALETTES` (`fire`, `void`, `steel`: five
    colour stops, `hdr`, `fill`, `back`, `lick`, `erode`, `boil`, `warp`), `FIRE_SMOKE`, `FIRE_KIND`.
  - Who spawns: `DragonFx` (`_blob`, `_wave`, `_fireBlast`), `BulletFx`, `DuelFx` / `LordFx` (`_blob`,
    `_dot` and `_frame`: heat re-drawn every frame shows exactly one copy; `_line`; `_ink`: a line
    written on the letter grid, one steel blob per cell it crosses), `Atmosphere` (the bonfire),
    `Scorch`, the throne hall's braziers, `GroundFire`, `Destructibles` (a burning tree), `Ablaze`
    (the wyrm's phase-3 fire) and `wallReach.js` `carryFire` (its streak). All read
    `game.fx?.fire` guarded. The test harnesses carry a `FireField` with the glyph pools' NaN guard.
  - `tint(id, px, py, rx, ry, rgb, k = 1, dark = 0, ttl = 0.05)` (ADR-118): for `ttl` s, steel
    printed inside that ellipse of the frame (frame pixels, origin bottom-left) is dyed `rgb` (its
    white-hot heart stays white); `dark` 0..1 also blacks out the cell behind each letter. Two zones
    at most; the same `id` set again moves its zone. Set every frame while it is wanted.
  - **Timing cues:** `DuelFx.tellFlash(tell, x, y, z, k = 1, flare = false)` draws them for every boss
    (`k` = scale, 1 a human): the flare for a moment (red, black, a blue blow with `flare`; data
    `TELL_FLARE`, three looks, `flareLook()` / `setFlareLook(k)`, `?flare=`), else the white glint
    (`TELL_GLINT`). `hazardFlash(tell, x, y, z, k)` is the cue of a thing that lands away from its
    thrower: never the flare (red: the ragged blaze, `TELL_BLAZE`). `charge(x, y, z, u, dt, k)`: a
    black blow's windup, called every frame of it (`TELL_CHARGE`). `DragonFx.tellFlash` / `charge`
    forward to a `DuelFx` it owns (`this.tells`, k 1.5) and age its glints and flares in `update`.
- **Text effects** (ADR-113):
  - *Heat haze*: ASCII pass uniforms `uHaze`, `uHazeRoll`, `uTime`; `hazeCell()` runs for wyrm and
    prop cells only while `uFlame.z > 0.5` (six nearest reads of the flame texture, then).
  - *Letting go* (`render/letGo.js`: `LET_GO`, `LET_GO_GLSL` with `letGoAt(cell)`, `letGoRow`,
    `letGoUniforms(U)`): the dying wyrm's cells let go top row down, one rule in the wyrm's
    materials (the dissolve discard) and in the pass (`letGoFall()`: the letter falling, `uLetGoInk`).
    Shared uniforms, created lazily: `U.uWyrmGrid` (xy the art cell px, zw the wyrm's grid anchor px;
    `Pipeline._updateWyrmGrid()` writes it at the TOP of `render()`, before the scene pass) and
    `U.uWyrmLetGo` (x dissolve 0..1, y top row, z rows, w half width in cells; the dragon writes it).
  - *Shed digits* (`render/shedDigits.js` exports `class ShedDigits`; `game.fx.shed`): its own small
    instanced pool of single art cells, pixel-snapped. `burst(x, y, z, dx, dz, n, look)`,
    `stream(dt, x, y, z, r, rate, look)`, `update(dt)`, `clear()`. It consumes `player:hitDragon`
    (not guarded) for a boss with a `shed` look `{ ink, rim, ember, embers, rims, stream }` (the
    wyrm: `SHED` in `dragon/model.js`; the human bosses have none).
  - *The breath's charge rises*: wyrm materials have `uGlowRise` (the throat charge's share, formerly
    inside `uGlow`), `U.uWyrmHeat` (xyz the front, w the rule's weight) and `U.uWyrmHeatFrom` (xyz the
    origin, w the front's strength); data `HEAT_RISE` (`dragon.js`), `WYRM_HEAT` (`materials.js`).
    Anything that reads a wyrm material's `uGlow` expecting the charge must add `uGlowRise`.
- `createCarvedGlyphMaterial(U, opts)` (`render/materials.js`) — **carved glyphs, for FLOORS only**
  since ADR-100 (flagstones, paving, the crater's plates; upright objects use prop art above). Glyph cells sit on a world-fixed lattice in
  a plane facing the default camera (`viewPitch`), so they are upright, equal-sized and never
  re-pick as the camera moves; one glyph per cell, picked by light on flat facets, contour strokes on
  mid-lit flanks, world-fixed cracks and moss. Renders directly (alpha `FLAG.NONE`, the grid pass
  ignores it). Geometry must be baked in world space with `aCol` (vec3), `aAO`, `aMoss`, `aInk`,
  `aEdge` (floats); see `carve()` in `world/forest.js`. Options and defaults: `CARVED_DEFAULTS`
  and the doc comment (`sideGlyphs`, `topGlyphs`, `mossGlyphs`, `crackGlyphs`, `strokeGlyphs`,
  `strokeLevels`, `cell`, `gain`, `lumScale`, `jitter`, `inkFloor`, `base`, `mossInk`,
  `crackAmount`, `edge`, `glyphZoom`, `fadeNearPlayer`, `side`).
- `markCaster(object)` (`render/pipeline.js`) — casts moon shadows: enables `LAYER_CASTER` (1) on
  the object and its descendants. Works before or after rigid batching (below); `LAYER_CASTER` and
  `LAYER_CASTER_RIGID` (2, reserved for the batch meshes: never set it yourself) are exported from
  `pipeline.js` (defined in `shaderLib.js`).
- **Rigid batching** (`render/rigidBatch.js`) — an actor made of many small rigid meshes is drawn
  with one draw call per material in the world pass and ONE in the shadow pass, instead of one per
  mesh in each (the hero: 138 meshes → 23 + 1 draws, the wyrm: 181 → 14 + 1, plus its 2 wing
  membranes in each pass).
  - `batchRigid(U, root, opts?)` → `{ meshes, shadow, sources, bones, dispose() }`. Call it once
    the actor is built (and marked a caster), and again after `dispose()` whenever its meshes are
    rebuilt (`player.setLoadout` does). It collects the meshes under `root` that can be batched,
    groups them by material (+ `renderOrder`) and builds one merged geometry per group: every
    source geometry's attributes (missing ones zero-filled, indexed or not) with the vertices still
    in their mesh's local space, plus a per-vertex float `aRigid` = the mesh's **bone slot**. The
    batch meshes (`meshes`: `name 'rigidBatch'`, layer 0 only) and the actor's one shadow mesh
    (`shadow`: `name 'rigidShadow'`, positions + `aRigid` of every caster, on `LAYER_CASTER_RIGID`
    only) are tagged `userData.rigidBatch = true`, have `frustumCulled = false`,
    `matrixAutoUpdate = false` and no raycast, and are added under `root`, so hiding the root
    hides them.
  - Every batched mesh is its own bone and **stays in the scene graph** with its transform,
    `visible` flag and layer mask: gameplay, FX, the Lab and the tests keep traversing the source
    meshes and reading their `matrixWorld`. Only its `layers` object is swapped for one no camera
    (or raycaster) can see, so three never draws it; `isRigidSource(mesh)` tells. Anything that
    walks an actor's meshes for geometry (bounds, picking) must skip `userData.rigidBatch` meshes:
    their merged geometry is not in one space (the Lab model viewer's auto-fit does).
  - Bones: `rigidBones(U)` → the registry behind `U.uBoneTex`, a 64 × 64 RGBA32F `DataTexture`
    (NEAREST), 4 texels per matrix (a texel = a column), 1024 slots (`RIGID_TEX`, `RIGID_MAX` in
    `shaderLib.js`); slot 0 is reserved and means "not batched: use `modelMatrix`". `sync()` (called
    by `pipeline.render()` right after the scene's matrix update, no allocation) writes each
    source's `matrixWorld`, or an all-zero matrix when the source or any ancestor below the actor
    root is not `visible` (its triangles collapse); a hidden actor root is skipped. `count`, `room`,
    `sets`, `batches`, `casting` (a visible actor casts this frame: the pipeline then draws the
    rigid shadow pass). `dispose()` on a set removes its meshes, frees geometry and slots (reused
    by the next build) and gives the sources their plain layers back.
  - Shaders: `RIGID_VERT_GLSL` (`shaderLib.js`) declares `attribute float aRigid`,
    `uniform highp sampler2D uBoneTex` and `mat4 rigidMatrix()` (`aRigid < 0.5` → `modelMatrix`,
    else the slot's matrix by `texelFetch`). `createSurfaceGlyphMaterial` uses it for the world
    position and the normal in ONE program for batched and unbatched meshes (materials are never
    cloned: their uniform objects are the shared ones the actors write every frame); a geometry
    without `aRigid` reads 0 (`defaultAttributeValues`), and the material is tagged
    `userData.rigid = true`. A new material family that wants batching must do the same. The
    pipeline's `rigidShadowMat` uses it for the shadow depth.
  - Shadows: the shadow mesh holds the sources that were casters at the build (all of them when
    none was yet), and casts while one visible source has `LAYER_CASTER` in its mask (read every
    sync, so `markCaster` and `dragon.setShadowCasting` work at any time): batched parts of an
    actor cast together. The sync owns the layers of the batch and shadow meshes (never set them).
  - Not batched (ordinary meshes, as before): materials without `userData.rigid`, instanced /
    skinned meshes, geometry rewritten at runtime (an attribute that is not `StaticDrawUsage`: the
    wing membranes), morph targets, a partial `drawRange`, a mesh with `onBeforeRender` /
    `onAfterRender`, `userData.noBatch = true`, and meshes added to an actor after its
    `batchRigid` call. A source's geometry and material must not be swapped or edited after the
    build (rebuild the set instead); mirroring (a negative scale above a source) is baked into the
    batch's winding at build time.
  - `CONFIG.render.batch` (default `true`; `false` when the page URL has `?nobatch`, read once in
    `core/config.js`): with it off `batchRigid` returns an empty set and every mesh is drawn as
    before — an A/B switch for frame rate and image checks.
  - `CONFIG.render.seenThrough.on` (`false` with `?noseen`): the same kind of switch for the hero
    printed through his cover (see "The hero seen through what covers him" above).
- `gi(ch)`, `gis(str)` (`render/glyphs.js`).
- `game.pipeline.finalMat.uniforms` — `uHurt` (red edge 0..1), `uFade` (black 0..1), `uDesat` (0..1), `uWarm` (boss grade 0..1), `uExposure`, `uBloom`. **Owned by the HUD/flow module** (game/grade.js `ScreenGrade`: `hurtPulse`, `ghostPulse`, `dip`, `fadeTo`, `desatTo`, and `flashPulse(k)`: a white flash, `uExposure` × (1 + 0.9 k) over its base, gone in ~0.2 s; flow fires it on every `player:parry` of a blade).

## Module contracts

### Player — `src/entities/player/player.js` exports `class Player`
```
constructor(game)                      // builds model, adds object3d to game.scene, spawns at CONFIG.world.playerSpawn
object3d: THREE.Object3D;  position: THREE.Vector3 (=== object3d.position);  yaw: number;  radius = 0.45
                                       // position.y is 0 except in the plunge, where it carries the visual
                                       // lift (x / z stay the ground point under him)
batch                                  // his rigid batches (render/rigidBatch.js batchRigid; empty with ?nobatch)
name = 'Wanderer'
hp, maxHp, flasks, maxFlasks: number   // (v0.2: NO stamina) TUNE: 160 HP, 5 flasks of +70 HP
guard, maxGuard: number                // the guard meter (combat/rules.js GUARD, ADR-095): a blocked blow costs guard, not HP;
                                       // refills by itself; at 0 on a blocked blow the guard is knocked open (state 'stagger'
                                       // for GUARD.openDur with the guard break's pose, `player:guardOpen`); read by the HUD
                                       // and the touch BLOCK tile
state: string   // 'idle'|'run'|'sprint'|'roll'|'attack'|'charge'|'heavy'|'block'|'parry'|'ghostep'|'plunge'|'heal'|'stagger'|'guardBreak'|'knockdown'|'lock'|'mikiri'|'dead'
                //  ('attack' = the light chain + the slam finisher + the heavy branches (combat.js HEAVY, ADR-115),
                //   'heavy' = the released charge's cleave (and the execution's thrust),
                //   'ghostep' = a perfect dodge without the plunge, 'plunge' = the head-stab, contract 2,
                //   'lock' = blades crossed with a duelist, 'mikiri' = stepping on a perilous thrust)
blocking: boolean                      // RMB held and able to block
hitPush: { x, z }                      // the way the last blow drove him, in his own axes (z − = back, x + = his left): the flinch
kdProne: boolean                       // the knockdown fell him on his FRONT (the blow came from behind; ADR-083)
deadDown: boolean; downFrom: number    // killed in the knockdown, `downFrom` s into it: he dies where he lies (clip 'deadDown')
critTimer: number                      // > 0 while the crit window is open (after a perfect dodge / the plunge's landing)
bladeFlare: number                     // 0..0.75: the steel's flare at a landed cut (TUNE.bladeFlare.hit: 0.5, heavy / crit 0.75;
                                       // not a slam's shards-only hit). Any area may raise it (Math.max), never lower it; it
                                       // decays by 1 / TUNE.bladeFlare.fall per s of GAME time (held through the freeze) and
                                       // drives part 17's fill / lines and the blade halo
lockOn: boolean                        // toggled by Tab (the middle click is the guard since ADR-115); facing tracks dragon.lockPoint
get alive(): boolean
isInvulnerable(): boolean              // roll i-frames, the whole plunge, Ghostep / plunge-landing i-frames, get-up, the blade lock, dead
// impact (ADR-063, ADR-079; TUNE.parryStop / parryPunch / perfectParry / hurtStop): a blade's parry
// freezes the frame (inside a string 0.05 – 0.075 s, a heavy blow 0.095, a string's last blow or a
// single one 0.11, a perfect parry 0.14), punches the camera in and kicks it; a perfect one calls
// game.flow.cinematic({ kind: 'perfectParry' }). A blow that lands freezes it 0.085 s (big 0.13 s).
// The blades MEET (ADR-079): for a hit marked `steel` the attacker's parryContact(chest, last) poses
// him where his blade met the guard and returns it; the deflect pose is taken on that side
// (deflect.side), raised for a blow from above or hung for a low cut (deflect.high), posed in the
// same call (_poseNow: the freeze holds it) and the grip nudged (deflect.nx / ny / nz) onto his
// steel; fx.parry (combat/clashFx.js) draws one clash on the crossing. deflect.gap0 / gap = how far
// apart the blades were before / after the nudge.
canTrade(): boolean                    // swinging (not the execution) and DEFENSE.trade.rearm s past the last trade
onTrade(att, { tell, attack, last }): { heavy, crush } | null
                                       // the trade clash, resolved by the attacker (ADR-082: the hero's cut connected
                                       // when its blow was <= DEFENSE.trade.window from landing). takeHit resolves the
                                       // other half itself: a hit marked `steel` that arrives in the hero's cut returns
                                       // RESULT.CLASHED. Both run _trade: the attacker held at the contact, the hero's
                                       // cut stopped on his blade (_meetBlade, shared with the parry), the burst,
                                       // 'combat:clash', the bounce. crush (a cleave whose poise reaches the attacker's
                                       // TUNING.guard.crushPoise): no bounce, the cut carries on.
                                       // The flash counter (ADR-102, DEFENSE.counter): in takeHit's half only, when the
                                       // cut is at most counter.window s into its active frames and the attacker offers
                                       // onCounter({ point, dir, attack }) -> damage dealt: no bounce, the attacker deals
                                       // itself counter.damage (final) + counter.posture and reels, 'player:counter',
                                       // the crit window opens. Returns { heavy, crush, counter }.
onGuarded({ deflect, heavy, attacker })
                                       // a duelist's guard met the hero's strike (he calls it from takeHit). A plain
                                       // ward: the chain goes on. deflect: the blade is thrown back, state 'bounce'
                                       // (TUNE.bounceDur 0.42 s; a guard or a dodge cancels it at once, an attack after
                                       // 0.28 s), 'player:bounced'.
// cancels (ADR-080): a guard press or a dodge cancels a swing at ANY point (windup, the cut, the
// recovery; not the execution's thrust). A flask still waits for 35 % of the recovery.
startBladeLock(att, { start, push, decay, dur, hold }): boolean
                                       // a duelist's perfectly parried `lock` blow (ADR-062): state 'lock', every press
                                       // of attack / guard pushes the meter +push, it falls decay / s; 1 wins, 0 loses,
                                       // at dur s it wins if >= hold. HUD prompt + ASCII meter; 'player:lock' start /
                                       // push / won / lost; then att.onLockEnd(won). Won: crit window, 0.3 s i-frames.
                                       // False while down / plunging / already locked. The two close to TUNE.lockDist
                                       // 1.3 m (half each), the blades cross between them (the grip follows
                                       // att.bladeSegment(): _lockCross), sparks grind at the crossing, and the pair
                                       // slides TUNE.lockSlide 0.9 m with the meter (ADR-081).
isSwinging(): boolean                  // a light / heavy swing's active frames (the dragon's bullets are cut on it)
takeHit({ damage, from:{x,z}, knockback=0, knockdown=false, kind='hit', burn=0,
          tell='normal', parryable, blockable, attack, attacker, plunge, perfect, light, flare }): RESULT   // see COMBAT.md
                                       // tell 'black' (a charged blow, ADR-118): a held guard or a parry press in
                                       // its way returns 'blocked' with no damage, the guard meter emptied and the
                                       // guard knocked open (GUARD.black; player:guardOpen {black})
                                       // flare: true on a blue blow = a parry moment: a parry of it readies the
                                       // counter (the riposte with a counter blow; player:parry {flare})
                                       // perfect: false = a roll through this hit is a plain dodge, never a
                                       // perfect dodge (small bullets); light: true = a parry of it is a light
                                       // clash (short hit-stop, a quarter of the push; player:parry {light})
                                       // plunge: false = a perfect dodge of this hit never becomes the plunge
                                       // (fire hazards); while the plunge runs every hit returns 'ignored'
getChestPos(out: Vector3, visual = false): Vector3   // upright gameplay body; visual = the drawn one (FX)
unlean(v: Vector3): Vector3            // drawn (leaned, drawScale) world point → upright gameplay body
drawScale: number                      // his drawn size, PLAYER_SCALE (1.08; ADR-064)
leanPoint(v: Vector3): Vector3         // upright gameplay point → where it is drawn (name tag)
respawn(x, z)                          // full restore, idle, facing north, clears burn/lock/crit/plunge/deflect chain
restAtBonfire()                        // refill hp/flasks (no teleport)
update(dt)
debug: { god: boolean, infiniteFlasks: boolean, heal(), teleport(x, z), kill(),   // used by the Lab
         attackSpeed: number,          // × the attack clock (1 in play): every swing's windup, cut and recovery run this
                                       //   much faster, its step covering the same ground (the Lab's "atk" slider)
         fightStance: boolean | null,  // the stance he stands in (ADR-114): true holds the fight stance, false at ease;
                                       //   null = the game decides (the Lab's "stance" row)
         plunge(execution = false) }   // Lab / captures: start the plunge on the dragon now (any range, in the air too)
```
Module-private state the animator reads (anim.js): `plungeAnim { phase, u, t, exec, h }` (the plunge
phase from the exported `PL` enum `{ VANISH, HANG, DIVE, RIDE, FLIP, LAND }`, progress through it,
the lift), `deflect { n, t, side, perfect }` (the parry chain; `perfect` = the last parry was pressed
within `DEFENSE.perfectParryWindow`, read by an attacker that answers a perfect parry: bullets.js), `guardHold` 0..1 (the guard lingering between
parries), `rmb { held, upT, parryT, edge, chain }`.
Controls (only while `game.state` ∈ {`explore`,`bossIntro`,`boss`}): WASD move · mouse aim · LMB tap =
light chain of five (a cut from the right → a backhand → a whirl → a lunge → the two-handed slam finisher,
each with other looks; ADR-041, ADR-071),
LMB while sprinting = the sprint slash, LMB out of a forward roll = the roll cut (`SPRINT_ATK`,
`ROLL_ATK`; both count as hit 1), LMB hold ≥ 0.3 s then release = the charged dashing cleave (`CLEAVE`, ADR-072) · LMB tap with a posture-broken wyrm's head within 9 m = the execution
(a broken **duelist** within its `execRange`: the execution thrust, `_startExecuteThrust`: a full
thrust that lunges to him; its first active frame calls `onExecute({ damage: DEFENSE.plunge.execDamage })`
instead of the sweep test and emits `player:plunge` / `player:plungeHit {execution: true}` and
`player:hitDragon {kind: 'execute'}`) ·
RMB hold = block, RMB tap before impact = parry · Space = dodge roll · Shift = sprint · F = flask ·
Tab / MMB = lock-on. (E is flow's.)
Drawn body vs gameplay body (ADR-017): the root draws the hero `player.drawScale` tall (model.js
`PLAYER_SCALE` = 0.9 × `HERO_SCALE` = 1.08 since ADR-064; the Ash Disciple, on the same skeleton,
is drawn at `HERO_SCALE` 1.2) and leaned away from the camera (`model.js` `LEAN`,
`installLean(root, scale = HERO_SCALE)`; the returned lean carries its `scale`, and `ox` / `oz`: a
drawn-only offset in metres, 0 for the hero; a struck duelist's shudder). The animator reads
the figure's scale as `anim.drawScale` (its owner's `drawScale`, else `HERO_SCALE`) for the drawn
ground speed of the gait and the foot planner's world spots. The animator runs with `lean.on = false`
(plain upright 1.85 m body, so IK and ground clamps work in metres); the drawn transform is applied
after it. FX read the drawn joints; the sword sweep's hit test, `getChestPos()` (the dragon's aim)
and the hurt cylinder use the upright body (`SwordSweep(sword, unlean)`).
**The drawn contact** (`_contactPoint(dr, kind, out)`): the hit test runs on the upright
gameplay bodies, so its point floats off both drawn figures; a landed cut is DRAWN where the drawn
blade (`CUT_LOOK.from` … `fx.arcAt(kind)` of the hit segment) meets the boss's drawn hurt spheres
(`dr.drawnPoint`, radius × `dr.drawScale`). `player._cut` holds it: the point, f along the hit
segment, the blade's travel there (`cx, cy, cz`; unit ground-plane `gx, gz`) and its direction
(`ex, ey, ez`). That point goes to `takeHit` (with `cut: {x: gx, z: gz}`); whatever `takeHit` moved
the boss's root by (a duelist's shove is instant, and the freeze holds the frame he is drawn in
after it) moves the point and `_cut` with him (≤ 1 m, else ignored); then it goes to
`player:hitDragon` and to `fx.contact`; `game.kick` throws the camera along the travel. Each attack def's `contact`
(the cutFx tier), `hitstop`, `shake`, `punch` and `kick` (a number or [k0, k1] lerped by the charge;
`combat.js` `HIT_FEEL` holds the crit factors, `feel(v, k)` reads one; `THRUST.exec` the execution's)
set the weight of the cut. `atk.hitAt` (the attack clock at the contact, -1 none) and `atk.cutDir`
({x, y, z} unit world travel of the blade there, or null) are set before the freeze starts, for the
animator and other areas. The slam's ground-shard hit draws no cut (the shards are its contact).
Deals damage via `game.dragon.takeHit(...)` using `game.dragon.hurtSpheres`, tested through a
vertical reach band (`REACH` in `player/combat.js`: a sphere overlapping the blade's swept wall
extended `up` m above / `down` m below it counts, so the giant wyrm's chest is in reach from the
front); swings step in toward a hurt surface ahead (`REACH.assist`); the slam's ground shards hit
if the blade missed. Pushes itself out of
`game.dragon.bodyCircles` and resolves vs `game.world.resolve(pos, radius, CONFIG.world.playerBound)`.
**Perfect dodge** (`takeHit` returns `RESULT.PERFECT`; `_perfectDodge(attacker, attack, tell,
hit.plunge !== false)`). The **streak** counts one more (`player.streak`, `player:streak`; it ends
when a blow hurts him, `_streakEnd`), and by attacker:
- it offers the plunge (`plungePoint(out)` + `onPlunge(o)`, and it is not sleeping / dying / dead),
  the hit allows it, and its head (`plungePoint`) is within `DEFENSE.plunge.range` (30 m, ground
  distance) → **the flurry** in the air round its head (state `flurry`, below); with a streak of one
  and the plunge as its art, the plunge alone (state `plunge`);
- it offers the plunge but is out of range or the hit says `plunge: false` → state `ghostep`
  without a teleport: the slow-mo and the crit window where the hero dodged;
- it has no plunge API but a body to cut (`takeHit`, a `position`: a duelist) within
  `TUNE.ghostepMaxRange` 12 m → **the flurry** on the ground, which leaves the hero
  `attacker.ghostepBehind` behind it;
- anything else (no `takeHit`, or farther) → the v0.2 **Ghostep**: a blink `attacker.ghostepBehind`
  (default `DEFENSE.ghostep.distanceBehind` 3.2 m) behind it within 12 m, slow-mo, crit window.
The slow-mo is `game.hitstop(slowmoTime, slowmoScale)`; a harsher freeze already running defers it
until it ends, and actors skip a short freeze while a longer, gentler slow-mo runs, so impact freezes
never swallow it. `player:perfectDodge` + `player:ghostep` fire in every case (for the plunge, x / z =
the hang point).
**The plunge** (contract 2, player side; numbers `DEFENSE.plunge`, timeline in COMBAT.md "The
plunge"): `_tickPlunge` runs the `PL` phases VANISH (the afterimage at the dodge spot) → HANG
(`appearUp` 5 m above `plungePoint`, `appearBack` 0.3 m toward the landing side, drifting after a
moving head at ≤ 7 m/s) → DIVE (accelerating onto the head) → impact: `attacker.onPlunge({ damage,
posture, point, execution })` exactly once (its return = the damage dealt), a hitstop, the burst →
RIDE (keeps his offset to `plungePoint` each frame, easing through a jump of the head at ≤ 40 m/s) →
FLIP (a backflip to a clear landing in front of the head, toward where he came from: `landMin` …
`landMax` from the head, `landClear` past the attacker's `bodyCircles`, inside the arena,
`world.resolve`d; turned off the body when it is in the way) → LAND (crouch; free after
`landCancel`; the crit window and `landIframes` open on touchdown). Hits are ignored and body circles
skipped until the landing; if the head point disappears he springs off from where he is. Every frame
he asks `cameraRig.keep` for himself and the head (`must`), plus the landing point during the flip.
Events: `player:plunge {execution}` as the dive starts, `player:plungeHit {damage, execution}` and a
`player:hitDragon` (kind 'plunge', part 'head', heavy, crit = execution) at the impact.
**The flurry** (`player/flurry.js` `Flurry`, its particles `player/flurryFx.js`; numbers
`DEFENSE.flurry`, the arts `ARTS`; rules in COMBAT.md "The streak and the flurry"; ADR-091):
`flurry.reach(attacker, allowPlunge)` → 'air' | 'ground' | null, `flurry.start(attacker, air,
strikes, attack, tell)`. `strikes` = the streak, at most `DEFENSE.flurry.max`. All but the last are
flash cuts (phases `FP.BLINK` hidden → `DASH` from one side of the target point through it to the
other, the hit half way → `HOLD`), each along a new line (turned from the far end of the last, clear
of the lines already hanging and of the wyrm's neck); the last is an art (`COIL` → `STRIKE` →
`AFTER`), picked at random with the animator's noise, never the same twice running
(`player.debug.flurryArt` pins one). Kinds: `plunge` (the plunge itself: `_startPlunge(..., chain)`
takes over in its own state), `iai`, `split`, `vault`. Target point: the head's middle
(`plungePoint` − 0.55 m) in the air, the foe's chest over his `position` on the ground.
Time: while state `flurry` runs, the world is held by `game.hitstop(0.05, DEFENSE.flurry.world)`
re-armed every frame, and the flurry, the animator and the cloth step on `game.realDt` (×
`debugTimeScale`; 0 while paused): `flurry.animDt`. A blow freezes the hero too (`flurry.freeze`).
What it asks of an attacker: in the air the plunge API (the last blow is `onPlunge`, the cuts
`takeHit({ part: 'head', exact, posture, flash })`); on the ground `takeHit` with `exact` (final
damage, past a guard), `posture` and `flash`, and optionally `lockPoint`, `yaw`, `ghostepBehind`.
He ends through the plunge's own FLIP / LAND in the air (`_plungeFlip(rMin)`, `_plungeLand`), or in
state `ghostep` behind the foe on the ground; the crit window opens either way. The whole move is
invulnerable (`takeHit` → `RESULT.IGNORED`), places him itself (no collision until it ends) and asks
`cameraRig.keep` for him and the target; `flow.cinematic({ slowmo: 1, kind: 'flurry' })` leans the
camera in. If the target dies or disappears he comes down where he is (`_bail`). The cuts hang as
`flurry.lines` (drawn every frame from `_updateFx`) until the last blow lands: `flurry.burst`,
called by the art or by the plunge's impact. Events: `player:flurry`, `player:flurryHit` per blow,
`player:flurryArt` as the art's coil starts, `player:flurryEnd`; the air arts also emit
`player:plunge` / `player:plungeHit`. The animator's clip `flurry` reads `player.flurryAnim`
({ pose: 'cut' | 'coil' | 'raise' | 'crouch' | 'flip', clip, u, air, k }): a flash cut plays one of
the hero's own swing clips through its active frames. Lab / tests: `player.debug.flurry(strikes,
art)`, `.streak(n)`, `.flurryArt`, `.noRiposte`.
**The shared streak, the riposte, weight** (ADR-094). `_streakUp()` is also called by `_parry` (not
a bullet's), `_trade` and `_mikiri`. A parry whose hit says `last !== false` and `melee === true`
(the attacker's word: the wyrm's `hitPlayer` and a duelist's both give them) arms `player.riposte`;
`_tickRiposte` starts it once `game.hitstopTimer` has run out, from the parry, a guard or standing
free, if the target is within `DEFENSE.flurry.riposteRange`: `flurry.start(att, air, streak, attack,
tell, { riposte: true })`. A riposte is `ARTS.riposte` (kind `return`): every blow a flash cut
(`flurry.cuts` = all of them), the last one calls `burst`, then `_return` puts him back where he
parried in state `ghostep` without the crit window; it emits no `player:perfectDodge`.
`startBladeLock` refuses during a flurry and drops a waiting riposte. Weight: `_hold` SETS
`game.hitstopScale` every frame (`DEFENSE.flurry.world`, or `reelWorld` for `cut.reel` s after a
cut, `flurry.reelT`); a cut passes `reel: 1` to `takeHit`, the last blow `reel: 2`.
`takeHit({ around: true })`: the parry and block arcs are not checked (a foe's flurry).
**A duelist's streak and flurry** (`enemies/duelist/`, `DEFENSE.foeStreak`; ADR-094): `d.streak`
counts up in `_guardClash` and is zeroed by a `takeHit` that deals damage (`_streakSet`). In
`brain.onGuarded`, from `foeStreak.min` a roll (`launch`) makes the guard a deflect for certain and
marks its reaction `flurry`; as the deflect ends `brain.startStreak()` plays the kit's
`streakMove(phase)` (default `streakFlurry`), a move with `streak: true` realised with `{ count }`
(`realise.js`: its first beat, then the others in turn). A beat with `flit: { r }` puts him at
another side of the hero as it starts (`duelist.flit`: the side he turns to, or the nearest one that
is `standable(x, z)`: inside his bound and clear of colliders; the Lord's also on his floor; ADR-112)
and its hit carries `around: true`. `brain._act`
reports every blow's result to `duelist.onStreakBlow(a, b, r)` (`a.streak` = { need, got, failed }):
parried or blocked counts (a perfect parry two) and takes one off `d.streak`; `got >= need` with
none missed calls `_break()`. Lab / tests: `dragon.debug.streak(n)`, `.flurry(n)`.
**Execution:** while `game.dragon.broken`, a light-attack press (from neutral or buffered from a
recovery, `_tryExecution`) with the head within `DEFENSE.plunge.execRange` 9 m starts the same move
at HANG with `execution: true` (`execDamage`, no slow-mo, no perfect-dodge events); the press is
spent.
**Parry and the deflect chain** (player side): an RMB press counts as a parry attempt only once RMB
has been up `DEFENSE.parryRearm` (anti-mash), except right after a successful parry: `_parry` sets
`rmb.chain`, so the next press counts as soon as RMB was released; every press clears it, so a whiffed
press needs the full re-arm again (ADR-032). Parries ≤ `TUNE.deflectChainGap` (1.1 s) apart count up
`deflect.n` (the blade snaps to alternating sides, the clash grows, `player:parry {chain}` raises
the clang); each parry slides him `TUNE.deflectPush` 0.16 m back (×1.6 for blue); between parries
the guard lingers (`guardHold` eases 1 → 0 over `TUNE.guardLinger` [0.32, 0.6] s after the last one).
`player:parry.chain` is the hero's own rhythm count and can run across two strings; the HUD's
"DEFLECT ×N" uses the attacker's `combat:deflectChain` (one string).
**Perfect parry** (ADR-051): a parry whose RMB press came ≤ `DEFENSE.perfectParryWindow` (0.08 s)
before the impact is perfect: `_parry(tell, attack, sx, sz, light, perfect)` stores it on
`deflect.perfect` and adds `perfect` to `player:parry`. It is computed for every parry; only bullets
consume it today (a light perfect parry: hit-stop `TUNE.returnStop` 0.05 s, a gold burst
`fx.perfectParry`, the RETURN call-out, a brighter clang). Melee perfect parries change nothing yet.
RMB cancels a charge (the LMB press is consumed); an RMB press during one's own swing is queued and
raises the guard when recovery starts. Streams (breath) only count as a perfect dodge when the roll
starts into them.

Model (`player/model.js`, built to `docs/art/hero.md`, the Shadow Swordsman): private to the player
module (nothing outside reads the rig). It is drawn as ink-line ASCII art (ADR-019): every material
carries a `HERO_INK` entry (the `heroArt` source and its per-part pass data, see Render helpers).
Three sword lengths (sword space, m from the grip centre):
- `DIM.bladeBase → DIM.bladeTip` (0.16 → 1.5, + `REACH.tipExt`): the **hit segment** (gameplay).
- `DIM.steelTip` 1.04: the point the **animator** poses with. `anim.js` keeps it off the grass and out
  of the legs, and the `hero` integration scenario checks it. It lies a little past the drawn point
  and moves with it; the hit segment does not.
- `DIM.drawnTip` 0.93: the **drawn** point (a 1.12 m sword with the pommel, ADR-073; was 1.25 m,
  ADR-038, and 1.45 / 1.64 m before; visual only, inside the hit segment). FX that sit on the point use `DIM.drawnTip ??
  DIM.steelTip` (`PlayerFx.bladeHalo`'s dots and tip streak); the swing crescent and the dot halo
  past the point carry the rest of the reach. The blade parts in `heroParts.js` are built to this
  length (`npm run hero-parts`). `BLADE_BASE` (exported) is the blade core's unlit colour;
  `player.js` lifts it with camera distance.

**Build (the lean reference match, 2026-11-09, ADR-034; supersedes round 3's broad build, ADR-031):**
the lean anime swordsman of the owner's six-view sheet on the same bones. `model.js` exports `BODY`,
the girth table (metres): `shell` (torso rings: height `y`, half-width `rx`, half-depth `rz`, forward
offset `cz`, the open coat front's `gap`; chest 0.34 m over a 0.23 m waist), `hips` and `head`
ellipsoids, `deltoid`, `upperArm`, `foreArm`, `thigh`, `shin` (radii along the limb + bulge) and
`foot`. The meshes are built from it; `anim.js` sizes the blade's leg clearance (`BLADE_CLEAR`), the
coat's leg push (`LEG_R`) and the ground-clamp spheres from it; the `herolook` test checks the lean
proportions and measures blade-in-body against it. No bone length changed (IK, the foot planner and
the hit segment run on bones). Joints: `DIM.shoulder` ±0.16 (round 3 ±0.21), `DIM.hip` ±0.1,
`DIM.coatR` 0.132 (round 3 0.163). The sword hand's pose targets are offsets from `DIM.gripShoulder`
[0.17, 0.215, 0] (`rig.arms.R.anchor`; `_handTarget` uses `arm.anchor ?? arm.upper.position`), so
every grip the arm reaches is unchanged by the narrower frame. The sword: `DIM.gem` 0.116 (the
violet star gem at the guard's heart), `DIM.forte` 0.2 (the cyan glyph blade from here; the coat-vs-
steel test and the blade halo start here); the three lengths above are unchanged.
**Coat** (`COAT_PANELS`, six panels; no front flap since ADR-034): two back tails split by a vent
(az ±2.5), narrow side panels (±1.66), two front panels (±0.86). Per panel: `az`, widths `w` [top,
join, tear line], segment lengths `len`, torn `strips` (lengths; 12 in all), `fork`, `out`, the
resting `flare`, `folds`, and optionally `edge` (±1: piping down its +X / −X edge), `skew` (the width
it gains below `w[0]` goes to one side, so the vent / front edge hangs straight or drifts out:
`skew` ±1 … ±1.35) and `slant` (m: the hem runs that much longer at the outer edge). `model.js`
exports `sheetOffset(w, w0, skew)` (where a skewed sheet of width w is centred along its tangent);
the animator's cloth-vs-steel coverage treats a skewed sheet as covering `|x| ≤ w/2 + |offset|`
(`coatHW`), and `herolook` uses the same offset. Coat records carry `r0` (the sheet's radius round
the hips at the anchor) and `len[1]` includes the slant.

The animator (`player/anim.js`) drives: `coat` = 6 panels (`COAT_PANELS`, above), each two spring
segments (the lower one is two meshes: `coat` above, the lavender torn zone `hem` over its last
60 %) plus `strips` (12 torn strips, one spring each, kept above the grass; per-panel `BREEZE` /
`IDLE_FLARE` follow the panel order, unless a panel carries its own `breeze?` / `idleFlare?`);
`streamers` (two-segment spring sheets: the Shrouded set's
cloak, five sheets on the chest and the upper arms (a narrow cape, ADR-073), `SHROUD_SHEETS` in `gear/shroud.js`, ADR-043;
or the Wanderer's torn cape, four sheets behind the right shoulder, `CAPE_SHEETS`, ADR-037; any
slot's item may return them (a head ribbon, a sleeve wing, a sash tail); each record
`{ segs, len, out, lag?, max?, w?, arm?, wrap?, inMax?, floor? }`, `out` = its own outward flare, `lag` = how much
it trails the motion (default 1 = a light ribbon, the cloak 0.5), `max` = how far it may swing from
hanging (rad; default 2.6, the cloak 1.45), `w` = its widths [root, seam, hem] (default 0.3 m
across), `arm` = 1 / 2 when it hangs on the right / left upper arm (0: the chest), `wrap` = the
radius the sheet curves round at its root (read by the tests' sheet model, not by the animator),
`inMax` = [root, tip] how far each segment may swing IN toward its wearer (rad, + = in; negative =
always at least that far out; default its `max`; not applied lying, ADR-083) so a head ribbon or a
scarf off the back never swings into the body, `floor` = while he rolls or falls (not lying: there
`_layFlat` rules) the segments' ends stay `STREAM_FLOOR` (2 cm) over the grass: the target swings to
the nearest angle that clears it and a lagging spring is eased out toward the least swing that clears
it, at most `STREAM_PUSH` (6 rad/s, so it never pops) (a head ribbon in the forward roll, where his
crown meets the grass; default off, today's cloak and every boss's cape go without)).
**Cloth vs steel**
(ADR-048): every frame `_colliders` places spheres along the blade (`COL_BLADE`; the arm lists
`COL_FORE` / `COL_UPPER` are empty: holding the sheets out round the arms widened his back), and
`_sheetBound` keeps each streamer segment on the side of each sphere it came in from
(`streamState[i].side`), by the sphere's radius: from the body side it holds the cloth out (the
cloth drapes over a drawn-back sword), from outside it holds it in; the inside wins a conflict; a
sheet ignores the arm it hangs on (`arm`, for arm spheres). `UPDRAFT_STREAM` (a charge's lift of the
sheets) is 0. Coat panels and strips have their own steel rules (below); hair has none;
`hair` = 5 spring clusters (`HAIR_CLUSTERS`: fringe, left, right, crown, nape), each with a dark-root
mesh (`hair`) and a sheened-tip mesh (`hairTip`); since ADR-034 the locks are layered pointed
blades (crown spikes, top, two back layers, nape, sides, a jagged fringe, cowlicks). Static meshes
that share a joint and a material are merged at build time (fewer draw calls; 123 meshes, ~19.7k
triangles since the lean build); only the flask stays separate.
**Blender-built parts** (ADR-037): the hair (scalp cap + per-cluster `mass` / `tip`), the collar and
its rim, the lapels, the blade (`forte`, `core`, `edge`), the cape sheets (`cape.N.a` / `.b` / `.c`)
and the pauldron (`plate`, `bevel`, `spike`) are not built in JS. `scripts/blender/hero_parts.py`
sculpts them in a headless Blender, fitted to `DIM` / `BODY` / `REST` / `HAIR_CLUSTERS` /
`CAPE_SHEETS` dumped from `model.js`, and `npm run hero-parts` writes them to the generated,
committed `player/heroParts.js` (`HERO_PARTS[name] = { n, p, nrm, uv, k, i }`, base64: positions and
`aGUV` Int16 / 8192, normals Int8 / 127, `aPart` Uint8 / 200, Uint16 indices). `partGeometry(key)` in
`heroGeo.js` decodes one into a BufferGeometry with the usual hero attributes; a part is in the space
of the joint it hangs on, and the body (`model.js`) or the gear item that uses it picks that joint
and the material. Never edit `heroParts.js`
by hand; rerun the script after changing a dimension the parts are fitted to. `CAPE_SHEETS` (per
sheet: `at` on the chest, `ry`, widths `w`, segment lengths `len`, `out`, `cup`, `seed`) must stay
four entries (the streamer springs and the `herolook` test).
**Gear slots** (ADR-042, `player/gear/`, contract in `gear/README.md`): `model.js` builds the
skeleton and the body (neck, head, face, hair, the flask); everything worn or held is an item
`{ id, slot, name, build(ctx) }` in one of `SLOTS` = head, chest, shoulders, arms, legs, waist, back,
weapon. `DEFAULT_LOADOUT` is the Shrouded set (ADR-043: `shroud.hood`, `shroud.tunic`,
`shroud.arms`, `shroud.cloak` over `wanderer.legs`, `wanderer.skirt`, `wanderer.sword`; no shoulder
item); `WANDERER_LOADOUT` is the outfit before it. A head item may keep only part of the hair:
`hair: [...]` lists the pieces built under it (`'cap'` and `HAIR_CLUSTERS` names; the hood keeps
only the cap and builds its own gold strands, `HOOD_HAIR` in `gear/shroud.js`: a spiky fringe, cheek
locks and a strand a side onto the collarbone), `hidesHair: true` builds none; the five hair joints
stay either way. `shadowsFace: true` on a head item (the hood, ADR-056) builds the face, ears and neck
in the shirt's near-black and leaves the eyes out. The hair is gold (ADR-049). `buildHero(U, loadout = DEFAULT_LOADOUT)`
builds each slot's item (an empty chest / arms /
legs slot gets the `base.*` undersuit), merges static meshes per joint + material + slot, and
returns the usual rig plus `rig.loadout` (slot → id or null) and `rig.slots` (slot → the objects it
hung on the skeleton). Geometry builders live in `player/heroGeo.js`, the body's measurements in
`player/heroDims.js` (`model.js` re-exports them). `player.loadout`, `player.equip(slot, id | null)`
and `player.setLoadout(loadout)` swap gear at runtime: the rig is rebuilt under the same root
(`object3d` and `position` stay the same objects), the animator is recreated (the pose restarts from
the ready stance), old geometries and materials are disposed, and the rig's rigid batches
(`player.batch`, `render/rigidBatch.js`) are disposed and rebuilt, reusing their bone slots; an
unknown id throws before anything changes. No event is emitted. Shared builders (`gear/`):
`hands.js` `buildFreeHand(ctx, mat = M.skin)` is the free hand every `arms` item that draws hands
calls (the skin wrist on the forearm, the open hand and the sword fingers on `arms.L.wrist ??
arms.L.fore`, the grip hand on the `sword` joint; returns `{ offHand, keep }`: every outfit gets the
sword fingers); `sheet.js` `hangSheet(ctx, parent, d, mats)`
builds one streamer sheet (or a ribbon) from data and returns its record, `panelSkirt(ctx, PANELS,
{ seed })` a skirt of coat panels (returns `{ coat }`; a panel's `hemFrom` puts the pale `hem` over
the end of its lower sheet). `heroGeo.js` `shellGeometry(rings, { arc: [a0, a1] })` builds one arc
of a shell (rad: 0 = his front, + = his left). `model.js` `tintHero(M, tint)` recolours ONE rig's
material instances (`{ <HERO_INK name>: { fill?, ink?, emissive?, spec?, rim?, sub?, inkGlow?,
glowK? } }`), never the shared `U.*`. `player.setLoadout` puts the shared per-part ink
(`U.uHeroPartInk` / `uHeroPartFill` / `uHeroPartRim`, rewritten by every `buildHero`) back as it was
after the build, also when the build throws: a boss's own part ink (the Starless Lord's red part 19)
survives a hero rebuild. **Outfit options** (kept for later use: the owner, 2026-11-14, keeps today's look as the default; the URL switch
`?heroLook=`; the old head switch `?lordLook=` of ADR-084 is gone, and since ADR-122 that name switches
the Starless Lord's body: STYLE.md "The look switches"): `player/gear/looks.js` `HERO_LOOKS` = id → `{ id, name, loadout, tint, of? }` (`shroud`
"Wanderer (today)" = `DEFAULT_LOADOUT`, no tint, the default; `robe` "Moonlit Robe", `swallow`
"Swallow", `warden` "Moon Warden": `gear/moon.js`, `gear/swallow.js`, `gear/warden.js`; each of the
three also as `<id>-shade`, "<look> (shaded)": the same loadout and tint with the head item's
`shadowsFace` twin, `of` = the lit look's id, so the owner picks the face from renders), `LOOK_IDS`,
`DEFAULT_LOOK`, `getLook(id)`, `heroLookFromSearch(search)`, `heroLookUrl(id, href)`. The Player wears
`game.heroLook` (`player.look`; unknown or absent: the default) and tints its rig with the look's
`tint`; `player.setLook(id)` wears another one live (its loadout with the equipped weapon kept, through
`setLoadout`; throws on an unknown id and changes nothing), and every later `setLoadout` keeps the
look's tint. Nothing in `gear/` imports `looks.js`. Limits: the animator, `combat.js` and `fx.js` read the sword's
numbers from `DIM`, not from the weapon item's `dims`; `IDLE_FLARE` has six per-panel values (unless
a panel overrides it with `idleFlare`); the pauldron joint is the right shoulder only.
**The sword looks** (for the owner's pick, 2026-11-14;
`gear/moonblade.js`): weapon items `moon.sheet`, `moon.ribbon`, `moon.crescent` (the longsword's
`dims` and materials; `wanderer.js` exports `SWORD_DIMS` and `swordHilt(D, opts)`, the longsword's
own hilt unchanged without options). `gear/index.js` exports `SWORD_PARAM` (today, sheet, ribbon,
crescent → item id) and `swordFromUrl()`: the Player's constructor wears `?sword=`'s weapon over
the outfit's loadout (none, or no `location`: the outfit's sword); the Lab's 'sword' row equips one. A
weapon's own streamer (the ribbon) carries `weapon: true`. Kept as options like the outfits (the owner, 2026-11-14): today's sword is the
default. If one is picked later it becomes `wanderer.sword` and the switch can go.
**Hands** (ADR-041, `heroGeo.js`): the sword hand is `gripFist`, four finger rolls, a thumb and a
knuckle ridge round the grip, hung on the `sword` joint by the `arms` item so it closes round the
grip in every pose (with no weapon it is a closed fist); the free hand is `looseHand` on the left
forearm (palm, four curled fingers, thumb), built with the sword fingers and the grip hand by
`gear/hands.js` `buildFreeHand` for every outfit that draws hands. The skeleton gives the free arm a WRIST:
`rig.arms.L.wrist` (a joint on `arms.L.fore` at y −(`DIM.foreArm` − 0.03)) and `rig.arms.L.point`
(on the wrist: the sword fingers' tip, `swordTip(BODY.hand, BODY.fingerEx)`; tests, FX). An `arms`
item may return `offHand: { open, grip, fingers? }` (`rig.offHand`, else null; all three in `keep`):
the free hand open, the same hand closed round the grip `DIM.offGrip` (0.08 m) below the sword hand
on the `sword` joint, and (optional) the sword fingers (jian jue, `swordFingers`: index and middle
straight, `BODY.fingerEx` 1.15 long); `open` and `fingers` hang on `arms.L.wrist` in wrist space (the
Shrouded set's bare hands do; the Wanderer's arms return no `offHand`). For a duelist `apply()` shows
`grip` while the pose's `twoHand` > 0.6 and `open` otherwise. For the hero (`HeroAnimator` with
`opts.freeHand`) `grip` shows only once the hand is THERE: `twoHand` > 0.6 and `anim.gripGap` (the IK
end to its place on the grip, chest local, model metres) under `OFF_SNAP[0]` 3.5 cm, kept until it
passes `OFF_SNAP[1]` 5 cm (`OFF_SNAP[2]` 8 cm while `twoHand` ≥ 0.95: a free arm that cannot quite
reach the hilt, the plunge's raised fists, keeps its fist); off the grip `fingers` shows while the pose's `hs` > 0.6 (kept to 0.4),
else `open` (`anim.handFX { fingers, fist }`). **The free hand** (the hero only, `opts.freeHand`):
`_wristL` turns `arms.L.wrist` so the fingers point along the pose's `lD` and the palm faces `lN`
(body axes; each vector's LENGTH is its weight: 0 = the hand rigid on the forearm, today's look),
clamped to `WRIST_L` (radial −20° / ulnar 30°, pronation −85° / supination 85°, flex −70° / extension
60°) through a spring (`anim.wristL { x, y, z, vx, vy, vz, tx, ty, tz, ok, clamped }`: Euler YXZ =
deviation, twist, flex; sub-stepped at ≤ 1/120 s, so it is stable at any frame rate, the frame's
turn capped at `WRIST_L.cap`). `lk` (0..1) pulls the IK end onto the sword wrist (the fingers along the
sword forearm; `anim.lkEff`, let go as the sword hand passes 4-8 m/s); on the grip (`twoHand`) the
wrist goes rigid. `LOCK_REACH` (0.98 × the arm's length) keeps the free elbow ≥ 23° bent on the grip
(the soft reach for every other arm is unchanged). **The hero's reach** (ADR-090, `opts.freeHand`):
`_arm` compresses a far hand target with `HERO_SOFT` [0.93, 0.99] instead of `ARM_SOFT` [0.78, 0.955]
(every other animator's), so his elbows open to ~145-160° at a cut's contact and a thrust's end and
never lock (163° at most); his sword arm blends back to `ARM_SOFT` by the pose's `twoHand`, so the
free hand can follow the grip. `loco()` swings the hero's arms by `armF` = `anim.armSign` × max(|mz|,
0.65): `armSign` is the fore-aft direction he last moved in (`anim.armDir`, latched while |mz| >
0.15) eased at 12/s in `update()`, so they swing in a pure strafe and do not jump as the direction
flips; it opens the free hand on the move (`hs` → 0). `loco()` and `guard()` also feed the
duelists' footwork: the hero's free-arm numbers in them are gated on `A.freeHand`. **Swing clips** (ADR-071, `player/swings.js`): every light swing (the chain's hits 1–4 and
their looks, the sprint slash, the roll cut) and the charged cleave is a keyframed clip. An attack's
`anim: { kind: 'clip', clip: '<name>' }` names a `SWINGS` entry: a list of keys over the attack's own
phases (`u` 0–1 the windup, 1–2 the active frames, 2–3 the recovery, so a clip follows its def's
timing; a held attack button freezes it at `u` = 1, the coil). A key holds the sword hand (`h`, an
offset from the right shoulder), the blade's direction (`a`: [azimuth, elevation] in degrees), the
free hand (`l`), the hips and the chest (`by bx bz hip sy sx sz`), the head, `two` / `offAt`, elbow
poles and the flat's normal; the free hand's fingers (`ld`: [azimuth, elevation] in degrees × `lw`,
0..1, default 1), its palm (`pn`, a vector), its shape (`hs`: 0 open, 1 sword fingers) and its rest
on the sword wrist (`lk` 0..1); `fh: '<name>'` lays a free-hand place from `FH` (swings.js: `aim`,
`aimLo`, `chest`, `wrist`, `highWing`, `wing`, `wingLo`, `tail`, `high`, each `{ l, lp, ld, pn, lk }`)
under the key's own fields. A field missing from a key is interpolated (Catmull-Rom through the
keys that have it). `swingPose` (anim.js) plays it over the fighting stance: the attack's time maps
to the phase through `swingPhase` (a monotone cubic through the three parts, so the rate does not
kink where the cut ends); key 0 is the pose he was in (`A.from`), so a cut runs straight on out of
the last one; the blade turns from there to the first key (the coil, one key at `u` = 1) round his
front and is still moving as it gets there (`swingDir`); elbow poles follow the hands
(`swingPoles`), the head stays on the target, the flat turns into the plane the blade is swinging
in; and the clip hands its channels to `update()` (`A.pathCh`), so the cross-fade leaves them
alone. **The body leads the blade:** the hips' channels (`bx by bz hip`) play `lead[0]` s and the
chest's (`sx sy sz`) `lead[1]` s ahead of the hand (a clip's `lead`, default `SW_LEAD` [0.033,
0.017]; the cleave [0.033, 0]), ramped in from 0.35 of the windup (0.6 when the entry's hips stand
over 0.5 rad from the coil key's turn: they would whip round). While a held light waits at the coil
the lead fades out (`anim.leadK`, 18/s, damped once a frame in `update()`) and runs ahead again on
the release. `bx` is across toward the foot that steps (`anim.stepL`, set by `play()`: the foot
further back along his facing; the keys are mirrored when it is the right one); a clip's `fy`
[front, rear] gives the stance's foot yaws (rad, for a left-front stance, mirrored by
`lungeFeet`). Every light clip keys a body-only anticipation (u 0.5-0.8) and overshoot (u 2.1-2.15)
round its coil and finish (swings.js header). Feet: `lungeFeet`: the foot that is behind as the swing starts steps through to the front
(so the lead foot alternates down a chain) and stays on the spot it planted on, while the other
stays planted where it stood, its heel peeling (it no longer settles sideways onto the stance line);
once stretched `drag` m past the stance's rear spot, or past its leg's reach from the hips the clip
keys (`HOLD_REACH` 0.97 × the leg), its TOE drags after the body and it stays where it was dragged
to (`anim.holdOff`; `anim.footDrag`: bit 1 the right toe, 2 the left; its heel settles back after
a drag over a few frames, `anim.toeK`), and just after the front foot takes the weight (as soon as
it is down if the foot is being dragged already) a foot dragged > 3 cm takes ONE lifted follow step
up onto the stance line (`anim.follow { on, x, z, t0, t1 }`, `FOLLOW`); the clip drives the feet itself (`C.chFeet` in
`A.pathCh`: the cross-fade slid them while the root still drifted out of a roll). While a held
light waits at the coil the stepping foot is set down on the grass, without weight (`anim.coilHold`,
`COIL_HOLD`). `turn`
pivots the feet on their balls where they stand (`pivotYaw`: their yaw turns, the heels lift);
the way home steps the foot that stepped (the left for a dash or the thrust); or `dashFeet` with
`feet: 'dash'` (`dashW: true` starts the dash at the windup's end; its landing times follow the
attack's own `charge`). In `apply()`,
`_elbow` limits how fast either elbow swings round its shoulder → hand line (`ELBOW_RATE`, 14 rad/s:
the hand still reaches its target), for every clip. **Joint limits** (ADR-078), also in `apply()`
and so for every pose and every cross-fade: `_arm` / `_leg` hold a hand / a foot at least
`ARM_NEAR` / `LEG_NEAR` from its shoulder / hip (an elbow never closes past 40°, a knee past 32°)
and move a hand out of the ribs' outline (`TORSO_R`); `_wristLimit` keeps the blade within
`WRIST_BACK` (128°) of the sword forearm's line. The off hand on the grip keeps the grip.
`_hingeFloor` (ADR-083) keeps a knee / an elbow above the grass (`KNEE_FLOOR`, `ELBOW_FLOOR`): one
solved under it is swung round its limb's line up to it. **Hit reactions** (ADR-083) read three
things off the player: `hitPush` (the flinch gives that way), `kdProne` (the knockdown clip's
on-his-front variant) and `downFrom` (the `deadDown` clip: killed in the knockdown he dies where
he lies); a reaction entered mid-turn unwinds the turn (`yaw0`, `carryYaw`), and while a lying
clip plays (`LYING_KEYS`) the cloth sheets obey gravity (`_layFlat`). A light def's `chain` (0..1) is the fraction of
its recovery after which the next light may start (`player.js` `_tickAttack`). A light's root step
(its `lunge`, stretched by the step-in assist) is a push-off and a brake (`TUNE.lungeShape`
`{ pre, end, min }`: a smoothstep from `pre` s before the coil to `end` of the active frames, so
~90 % of it is done as the front foot plants), each frame moving exactly its share; nothing while a
held light waits at the coil, and one released late steps from its release (`atk.relT`), over at
least `min` s. In an attack the root's velocity follows `want` through a `TUNE.attackDamp` (30/s)
filter (`_integrate`); for the shaped step it lands ON the shape each frame instead (only momentum
carried in, a run's, dies out through the filter), so `want` stays the step's own speed. Options on the
anim block: `spin` (±1, a full turn through the active frames: `spinTurn`), `turn` (rad, a partial
pivot from mid-strike through the follow-through, turning back late in the recovery: `pivotYaw`),
`hop` (m, a skip off the ground from the windup into the strike; `tuck`: how far the feet lift
with it, × the hop: over 1 the knees draw up, a leap). The finisher (def kind `slam`) is a clip too
(`slam`, ADR-076: a gather, a leap, one two-handed diagonal into the ground); the only other anim
kind is `thrust` (the execution's lunge). **The way home:** from a clip's `home` (default
`SW_HOME` 0.3 of the recovery; the slam and the cleave 0.55, they hold their finish) `attackPose`
blends the pose toward the ready stance while the clip's last keys are still moving, so the
follow-through runs into the return without a stop. `spinTurn` (the whirl) also drops and leans
him into the turn and turns his head back toward the target, then ahead of the body (`SPIN_SPOT`);
the hips run ahead of the turn and the chest trails it (`SPIN_LEAD`), and its momentum carries him
~14° past the full turn before he settles back (`SPIN_OV`, a damped spring let go at the turn's last
speed; the feet pivot on their balls). The anim block's `spinFeet` picks the feet: `'carry'` (the
default: the stance spots carried round the root in two quick pivot steps) or `'hop'` (the whirls:
each foot leaves the grass from where lungeFeet has it over `SPIN_HOP.up` of the turn and is
carried round with the body, moving across it round its own side from the spot it left (`anim.hop
{ set, yaw, a, r }`: caught as the feet lift) to the stance spot lungeFeet left in `anim.spots`,
drawn in to `SPIN_HOP.tuck` × the stance's spread at the top; over `SPIN_HOP.down` it runs on round
with the turn onto that spot, planted from there. Blended in angle and radius about the root, never
in straight lines through the middle; no follow step; the hips rise `SPIN_HOP.rise`).
**Attack variants** (ADR-055): a `LIGHT` def may carry `variants` (more `anim` blocks for the same
hit: same timing, damage, reach and lunge). `HeroAnimator.play('attack')` calls `_pickVariant()`:
`anim` or one of `variants` at random with the animator's own noise, never the same one twice in a
row for one def (`varLast`) and never a clip along the `line` the swing before it cut (`SWINGS`
entries carry `line`; `anim.lastLine`; a chain's first hit follows nothing), so two hits in a row
are never in the same plane. The result is `anim.atkDef` / `anim.atkAnim` / `anim.atkVar` (0 =
`anim`), and `attackPose` reads `atkAnim` for its def. `anim.forceVariant` (an index, or null) pins
the pick (tests). The blade is still the hit test, so each look is swung at the wyrm in REACH.
**One hand, two hands** (ADR-071; it was two hands on every swing, ADR-046): the chain, the sprint
slash and the roll cut are one-handed, the free hand keyed against the sword hand; the slam, the
charge and the cleave hold the grip with both (`twoHand` 1, the off hand IK'd to the grip point;
the cleave lets go in its follow-through). The block (ADR-073, the cross ward) is two-handed: sunk
and side-on, the grip low outside the right hip, the blade slanting ~38° up across the body to past
the left shoulder, the flat to the enemy; `locoGuard` carries `twoHand` and `offAt` in `GUARD_CH`.
Pose channel `offAt` (m): with `twoHand`, how far up the blade from the grip the off hand sits (0 =
on the grip; above 0.04 the hand stays open: a palm braced on the flat; no clip uses it yet). At
rest and on the move he carries the sword in one hand. The free-hand channels (`P.lD` 53, `P.lN` 56:
vec3 body axes, length = weight; `P.hs` 59; `P.lk` 60; the pose has `N` = 61 channels, exported, and
a duelist's scratch poses are sized from it) are read only with `opts.freeHand`: `guard()` writes
the hero's rest (sword fingers low by the left hip, pointing ahead and down), so every other
animator carries the hero's values in them too and ignores them; `locoGuard` carries them in
`GUARD_CH`. A hit, a fall, the drink and the lean on the pommel open the hand and make the wrist
rigid (`freeLimp`); the charge, the block and the plunge (`plBase`) open it to the grip (`hs` 0).
**The two stances** (ADR-114, `stances.js`): where the hero stands. `stand(pose, A)` (anim.js) is
`guard()`'s ready stance, and for the hero's animator (`A.freeHand`) the stance written over it:
`atEase` (the blade on the forearm's line down at his front-right, the free hand open on the belt)
and `fencerGuard` (the sword side to the foe, the arm half extended, the point on the foe), blended
by `anim.fightW` (0 at ease … 1 the guard). `HeroAnimator.update` drives `fightW` toward 1 while
`player.lockOn` or the flow state is `bossIntro` / `boss` (`player.debug.fightStance` true / false
overrides): up at `FIGHT_EASE[0]` (0.38 s), down at `FIGHT_EASE[1]` (0.88 s). `loco()` builds on
`stand()` and an attack's recovery comes home to it; `guard()` stays the base of every other clip
and of a duelist's footwork. Its life is `STAND_LIFE` (periods of the breath, the weight, a look
around and the blade's point; none a multiple of another). In a fight the sword arm keeps the guard
on the move (`FIGHT_RUN`; a sprint trails the blade); a roll and a backstep ease the sword arm out
of the pose they began in (`swordFromEntry`, `SWORD_ENTRY` 0.16 s) and the loco clip settles the
blade into the stance over `LOCO_SETTLE` (0.24 s).
**Idle life** (ADR-047): in the loco clip, standing still in the `idle` state, at ease (not locked
on, not in the fight stance: `fightW` ≤ 0.05), with no guard held, for `IDLE_LIFE.after` (2.5 s), `HeroAnimator._idleLife` starts an action from `FIDGETS`
every `IDLE_LIFE.gap` (2–4.5 s after the last one ends), picked with the animator's own noise (never
`Math.random`), never the same twice in a row: `look`, `stretch`, `inspect`, `twirl`, `shoulder`,
`lean` (1.7–4.2 s each). Each is a layer over the at-ease stance (`idleLife` in `locoGuard`) with a
0.45 s fade in and 0.55 s out; anything else (a move, a lock-on, a guard, another clip) cuts it within
`IDLE_LIFE.cancel` (0.16 s). State: `anim.fidget = { k, t, w, cut, still, wait, last, count, name }`.
Visual only: no hit test runs outside attacks.
**Idle** (`guard`, ADR-041; ADR-040 put the blade out to his side, where the game camera sees it):
weight on the left leg, the right foot a shoulder's width out and forward with the knee soft, the
upper arm hanging by the ribs with the elbow a little back, the grip beside the right hip and
outside the coat, the blade (`IDLE_SW`) low at his right side: ~52° below level, 79° off his front,
the EDGE down (the flat faces forward), the point just off the grass; the head bowed a little,
looking ahead. An attack's recovery brings a blade that finished
over his left shoulder home round the front (`HOME_WAY` in `attackPose`). Blade blending (`dirLerp`): besides the back-left rule (ADR-023), a near half-turn
(`DIR_FLIP` 2.75 rad, below `DIR_FLIP_HIGH` 0.9 rad of elevation) goes round the front, never behind
the shoulders (the light combo's finish → this idle).
**Glyph scale** (`model.js` exports `setHeroGlyphScale(mats, dist) → k` and `GLYPH_SCALE`): every
frame `Player._updateMaterials` measures the camera → hero distance (`player.viewDist`) and rescales
the hero materials' glyph cells, k = clamp(dist / 12, 0.15, 1): in-game cells at the 36 m camera
(and anywhere beyond 12 m), finer in Lab / showroom close-ups (≈30 rows for the figure at 4 m).
Per material `userData.cell` (in-game cell), `userData.cellMax` (cap for small parts: hair, collar,
plates), `userData.lockX` (the blade's two columns), `userData.zoom / zoomNear` (glyph zoom at the
game camera, default `GLYPH_SCALE.farZoom` 0.45 so the glyphs fill their cells / in close-ups);
materials without `userData.cell` (gem, eye, skin, flask) keep fixed
cells. (The ink-line source is flat per part, so these cells no longer show in game; they still set
the per-cell dissolve and the `U.uArtSolid` = 0 render.) Until 2026-11-09 the same call also set the
blade's depth pull (`BLADE_PULL` → `uArtPull`, ADR-022); it is gone (ADR-031). `player.bladeFar`
(0 close-up … 1 at ≥ 28 m) makes the blade self-light with distance (dark steel with glowing edges
up close, a solid cyan line at the game camera). It touches only the hero's own materials (no shared
uniform, no allocation).
FX helpers that changed shape: `PlayerFx.gemTick(dt, x, y, z, k, vx, vz, vy)` and
`gemGlint(x, y, z, s, vx, vz, vy)` take the gem's own velocity (`player.gemVel`, measured from the
gem joint each frame) so glints ride the hilt; `gemTick` also keeps an always-on 0.22–0.26 m violet
glow point at the gem; `bladeHalo(dt, k, far)` grows its dots with distance (beside both edges,
`HALO_X` m off the blade's axis) and lays a short bright
`|` streak 0.06–0.26 m past the drawn point. `trail(pa, pb, a, b, kind, crit, gate = true, bite = false)`
sub-steps by the edge's travel (one per 0.11 m, up to 14) and slerps the blade round the hilt
between frames, so a sweep reads as one curved arc. Since ADR-077 the arc hugs the STEEL: its EDGE
is one fine line of overlapping `|` strokes laid along the path of a point just past the steel's
point (`arcAt(kind)`: 0.64 of the hit segment, × 1.22 for the slam and the cleave; the steel
ends at 0.44, the reach at 1), white-hot when drawn and cooling to indigo as it thins to nothing
(the heavy blows, the thrusts and the plunge's dive cool to the gem's violet: the exported
`ARC_TONE`; `bite`, the 0.06 s after a cut lands: the edge white-hot and 15 % thicker).
A VEIL of four faint rows runs close inside it (a thin crescent; the numbers are the exported
`ARC_LOOK`). Its strength follows how far the blade TURNED this frame, so a blade only carried
along (a dash) leaves none (`gate: false` for the plunge's dive). `arcGlint(x, y, z, dx, dy, dz,
heavy, crit)`: a small star and sparks on the arc's edge, once a swing as the cut comes through
(`player.js` `_combat`), only on a whiff (a landed cut's core is the beat's one star).
`contact(p, tier, C, crit, k)`: a cut that LANDS, drawn at p (the drawn contact) by
`combat/cutFx.js` `cutBurst(game, x, y, z, o)` (o = { tier, cut, edge, hilt, crit, power, low }):
a tapered slash line across the body along the cut's screen direction (a second line and a tick
along the blade on heavy blows, a cross on a crit), thin sparks thrown along the cut, falling motes,
a 0.22-0.3 m two-frame core, a ring on heavy blows, one small light; per-tier numbers in the exported
`CUT_LOOK`, the last burst's counts in `CUT_LAST`, the look switch `setCutStyle('gash' | 'fan')` /
`cutStyle()` (the Lab's 'cut' row; `?cutfx=fan`). `cleaveImpact(..., bare)`: bare = the fan only
(contact draws the ring and the light). `sparks()` stays for the plunge.
`edgeGlint(sw, z0, z1, far, crit, realDt, ridge)`: a small cold '+' (and '|' strokes behind it)
running up the LEADING edge of the steel from sword-space height z0 to z1 this frame (`leadSide(sw,
e)`: the blade's mid travel against its X axis; the ridge under `EDGE_GLINT.ridge`, or always with
`ridge`); `player.js` `_combat` drives it from `EDGE_GLINT.lead` s before the active frames to the
arc's glint (`at`, `atCleave`; z eased up `EDGE_GLINT.z`), on the steel every frame (no velocity),
stopped by a landed cut (`atk.glintZ` = how far it ran); never for the thrust kind. An attack def's
`glint: 'ridge'` (the stab) runs it up the ridge. `edgeFlash(sw, zc, heavy, crit, ridge, hold)`: the
contact's mark on the steel, `EDGE_GLINT.flash.n` '|' strokes along the leading edge from the
contact's height up to the point (`player._edgeFlash`, after `contact`); no velocity, so it lives
`hold` fx s (the frames the freeze holds: this frame at the full rate + the freeze at `fxLive` +
one frame; clamped to `flash.lifeMin` … `life`, fading to `holdEnd` × alpha) and is gone as the
blade swings on (no `hold`: `flash.life`). Exported: `EDGE_GLINT`,
`hwAt(z)` (the drawn blade's half width), `leadSide(sw, e)`. New: `skid(dt, slot, x, z, dx, dz, sp,
k)` (dust and torn grass off a sliding contact; `slot` 0 / 1 keeps a rate accumulator each) and
`scrape(dt, x, y, z, dx, dz, sp)` (cold sparks off the dragging point). 2026-11-09: `parry(x, y, z,
blue, chain = 1, dx = 0, dz = 0)` (the clash grows with the deflect chain, crossed streaks from the
2nd; (dx, dz) = toward the blow) and the plunge's `plungeBlink(segs, nSegs, ox, oz, nx, ny, nz)`,
`plungeHang`, `plungeImpact(x, y, z, dx, dz, exec)`, `plungeRide`, `plungeRip`, `plungeLand(x, z,
dx, dz)` (cold afterimage and streak, crystal shards and molten blood at the wound, landing dust;
world-atlas glyphs only). Glyph strokes are laid
along the rendering camera's axes (`game.camera.matrixWorld`, read in `get add()`; the fixed 58°
basis is the fallback), so they stay right in Lab views.

Animator ↔ player hooks (`anim.js` is private to the player module):
- `anim.onFootstep(side, dust?)` → `player._footstep(side, dust = 0)`: emits `player:footstep`;
  `dust` > 0 kicks up a puff of that size (a dash's two touchdowns: the cleave, the execution's thrust).
- `ROLL_SLIDE` (exported, `[0.42, 0.58]` s of the forward roll's `stateT`): the sliding kneel. In it
  `_updateFx` calls `fx.skid` for the right shin (slot 0) and the planted left foot (slot 1), and
  `fx.scrape` while the blade point is below 0.14 m. The root speed is unchanged.
- `anim.kickCoat(power, rnd = Math.random)` throws the coat panels and strips out. `anim.noise()` is
  the animator's own LCG (0..1): cosmetic kicks in code the integration sims run pass `anim.noise`,
  never `Math.random` (the sims seed it and the wyrm's AI rolls on it). The light sweeps kick 0.32 on
  their first active frame (`player.atk.flared`, a new flag on the attack record), the slam's impact
  0.6.
- The attack record also carries `atk.relT` (the attack clock at a held light's release; 0 = never
  held: the root's step in starts there) and `atk.hitAt` (the attack clock at a landed, unguarded
  hit, set in `_applyHit` before the hit-stop starts; −1 = none: test `hitAt >= 0`, never
  `Number.isFinite`). `anim.js` reads `pending` (the held coil: `anim.leadK`) and `hitAt` (the
  bite, below). Internal to `player.js`: `atk.shaped` (this frame's `want` is a light's shaped
  step) and `atk.svx` / `svz` (the step's velocity `_integrate` landed the root on last frame): the
  step's filter pre-compensation (`TUNE.attackDamp`, above). A roll's first frame (before
  `_tickRoll` sets `want`) keeps only the part of the frame before's `want` along the roll
  (`_startRoll`): out of a swing it no longer runs on along the swing's facing.
- **The bite** (`attackPose`, clips only): from a landed hit (`atk.hitAt`) the edge catches in what
  it cut: the blade holds where the contact frame drew it (`anim.bite { rec, at, dir }`, keyed on the
  record and the time), the grip pulls in along it, the hips drop, the chest folds and the head
  nods (`BITE`, × the def's `bite`, combat.js; the fold and the nod also × the clip's `fold`,
  swings.js: the cleave's upright two-handed blade stands before his face, 0), full through the
  hit-pause (whose frozen clock keeps `t − hitAt` ≈ 0) and let go over `BITE.dur` (0.08 s) of the
  attack's clock after it. **Inertia**:
  outside a dash, the chest pitches against the root's acceleration (`ATK_INERTIA` × `anim.leanF`,
  the loco's lean spring): behind the hips on the push-off, over the planted foot on the brake.
- Internal animator state worth knowing: `pathCh` (channels a windup path drives this frame, copied
  past the cross-fade), `updraft` 0..1 (the charge lifts the coat and hair), `dashStep` (bits: dash
  touchdowns taken), `marks` (4 per-clip ground marks), `feet` (the world-space foot planner),
  `visYaw` (the drawn heading: a critically damped spring, `TURN_K` 650, at most `TURN_LAG_MAX` 1.4 rad
  behind the gameplay yaw; visual only).
- **Active frames stay bit-identical** (ADR-024): a pose path that reshapes an attack windup reaches
  the clip's own pose by windup − 1/30 s and hands its channels back; recovery shaping starts at
  windup + active + 0.035 s (the frame after the active window is still hit-tested); active-frame
  shaping only touches non-blade channels (free arm, feet, head, coat). The proof is a per-frame
  compare of `sword.matrixWorld` and the hit points against the previous build. The rule has been
  relaxed for the hero's own clips since ADR-031 / 071 / 076, and the weight work moves his active
  frames again (the hips' lead, the root's step shape, the bite after contact): for those the REACH
  table (every look connecting from contact out to 3.5 m) is the gate.
- Blade directions blend by azimuth / elevation round the outside of the body (`dirLerp` /
  `dirTo`), a cross-fade keeps last frame's way round, and outside attacks the blade is pushed out of
  the leg capsules before the ground clamp (ADR-023). Since the broad build (ADR-031) the clearances
  come from `BODY`. The build is not bit-identical on active frames (ADR-024): the hit segment moved
  by ≤ 2.5 cm on some of them (light 1 on 57 of 73 frames, light 2 on 9 of 29, the slam on 15 of 36;
  the thrust is identical), and the REACH table is unchanged. (ADR-071 / ADR-072 replaced the light
  swings and the charged attack outright, ADR-076 the slam: none of these clips remains.)
- **Coat vs blade** (round 3): every frame the grip and 12 points along the drawn blade are tested
  against each coat panel segment in that segment's frame. With the sword hand outside the cloth the
  panel hangs inside the hand and the blade (they cap its flare; the legs still win); with the hand
  under it, or steel running in under it inside the pivot, the panel drapes over the blade. The side
  is latched per panel (`coatSide`: 1 outside, 2 under) while any steel is over it; the steel moves a
  segment at most 0.12 rad per 60 fps frame; off while down or tumbling (the floor contact rules).
  The torn strips and the sleeve streamers ignore the blade. The run / sprint pose trails the sword
  hand outside the coat.
- **Plunge and deflect clips** (the "PLUNGE + DEFLECT" block): `plunge` (`plungePose`: hang, dive,
  ride, flip, land poses by `player.plungeAnim.phase`; `player._plungePhase` re-enters the clip with a
  short cross-fade at each phase), `parry` = `deflectPose` (the blade snaps into the blow on
  alternating sides by `player.deflect.side`, back in the guard by ~0.17 s; it replaced `parryPose`),
  `loco` = `locoGuard` (the walking clips blend in the block's upper body by `player.guardHold`). The
  plunge's root is the ground point carried up by `position.y`: foot targets stay root-relative, the
  ground clamps are world-space.

### Dragon — `src/entities/dragon/dragon.js` exports `class Dragon`
```
constructor(game)                      // builds the four-legged drake, sleeping at CONFIG.world.dragonSleep
object3d, position (Vector3, root on ground), yaw
batch                                   // its rigid batches (render/rigidBatch.js batchRigid; empty with ?nobatch)
bound: number                           // radius around the arena centre the root stays inside:
                                        // min(CONFIG.world.dragonBound, TUNING.bound = 24) (move, charge, leap target)
name = 'VAELGRIM, THE CINDER WYRM';  hp, maxHp;  phase: 1|2|3
phaseAt: number[]                       // HP fractions where each phase starts (TUNING.phaseAt [1, 0.66, 0.33]);
                                        // the HUD draws its boss-bar ticks from it
nextPhaseHp: number                     // HP of the next phase's gate (maxHp × phaseAt[phase]; 0 in phase 3)
posture, maxPosture: number;  broken: boolean   // posture break = staggered + broken; maxPosture per phase
state: 'sleeping'|'waking'|'combat'|'staggered'|'airborne'|'dying'|'dead'   // 'airborne': the leap, the flights
hurtSpheres: Array<{x,y,z,r,part,mult}>  // world space, refreshed every update; part ∈ head|neck|body|tail|wing|leg
                                        // (leg = the four legs; wing = the wing wrists + finger knuckles)
bodyCircles: Array<{x,z,r}>              // ground footprint for player push-out (empty while airborne):
                                        // chest, hips, neck base, loins, then each PLANTED foot (0..4 more)
hazards: Hazards                        // the fire hazards (hazards.js, contract 3): see "Hazards" below
bullets: Bullets                        // the bullet field + the ground tongues (bullets.js, ADR-039): see "Bullets" below
terrain: Terrain                        // the piece in its jaws or in the air (terrain.js, ADR-110): see "Terrain moves" below
ablaze: Ablaze                          // phase 3: it sets itself on fire (ablaze.js, ADR-120): see "The wyrm ablaze" below
crashing: boolean                       // true while a plunge stops a flight: that action's end() must not land it elsewhere
isTargetable(): boolean                 // false while sleeping/dying/dead
lockPoint(out): Vector3                  // chest/neck base, for lock-on + camera
startIntro()                            // wake → rise → roar; emits 'dragon:introDone' when the fight starts
takeHit({ damage, part, point:{x,y,z}, dir:{x,z}, cut:{x,z}, poise, heavy, crit, exact, posture, flash }): number
                                        // returns the damage dealt (before the gate clamp); adds posture.
                                        // point = where the cut is DRAWN (the hero's drawn blade on the
                                        // boss's drawn body, Player._contactPoint): FX and the damage
                                        // number only, never gameplay. cut (optional): the unit
                                        // ground-plane travel of the blade at the contact: the hit
                                        // spray flies along it (absent: along dir / the flinch)
                                        // Phase gate: with the AI on, damage stops at the next phase's
                                        // threshold until its transition starts (no skipping a phase).
                                        // exact: the damage is final (no part / broken multipliers); posture:
                                        // add exactly this much instead of the weapon gain (onPlunge);
                                        // flash: the most the hurt flash may be (the flurry's cuts);
                                        // reel (a duelist): 1 thrown as by a heavy blow, 2 staggered
onParried({ attack, tell }): void       // the dragon calls this itself when player.takeHit returns 'parried'.
                                        // Deflect chain (contract 1): a string's non-final hit is only
                                        // deflected (posture + a 0.14 s visual knock-back, the string goes
                                        // on); its last hit / a single melee attack recoils. Emits
                                        // dragon:parried {attack, tell, hit, last} (+ combat:deflectChain)
attackLabel(id): string | null          // a move's name for the player (the death screen, the move telemetry): its tuning
                                        // label without the note in brackets; null for an id it does not know. Every boss
                                        // offers it (a duelist: kit.MOVES[id].label)
plungePoint(out): Vector3               // contract 2: the top of the head (rig.pt.head + 0.6 × SCALE up), valid in flight
onPlunge({ damage, posture, point, execution }): number   // contract 2 (below): final damage to the head
                                        // (phase gate kept), posture, the 'plunged' reaction; emits
                                        // dragon:plunged {execution}; returns the damage dealt (0 = ignored:
                                        // not targetable, or a repeat within 0.25 s)
enterPhase(n)                           // the transition roars call it at their start: phase n's posture meter
                                        // (emptied, a waiting break dropped), the staggered unlock of phase n's
                                        // abilities (TUNING.unlockStagger); enterPhase2() = the v0.4 name
hitstop(sec, scale)                     // game.hitstop that won't crush a running Ghostep slow-mo
reset()                                 // back to sleeping at the nest, full HP/posture, phase 1, FX/lights/hazards cleared
update(dt)
debug: {                                // used by the Lab (generic shape every future enemy implements)
  abilities(): Array<{ name, label, tell, phase }>,   // every ATTACKS entry (46: 8 singles, 17 strings, 11 fire
                                        // attacks and flights, 6 bullet patterns, 3 terrain moves and 'roar', the
                                        // transition shock ring)
  trigger(name): boolean,               // force an ability now (wakes/starts the fight if needed); false while busy
  setAI(enabled: boolean), aiEnabled: boolean,
  wake(), startFight(),                 // startFight skips the intro straight into combat (no-op if fighting)
  phase2(), phase3(), stagger(), postureBreak(), kill(), reset(), setHp(fraction 0..1),
                                        // phase3: straight into the phase-3 transition (from phase 1 or 2)
  hitboxes(): Array<{ x, y, z, r, kind: 'hurt'|'attack' }>,  // for the Lab overlay
  currentAction?(): object|string|null, // optional, Lab readout (the running action)
  ablaze(look?): string                 // the wyrm only: phase 3's fire 'off'|'a'|'b'|'c' (sets it when given; returns the one in use)
}
```
**Attacks and selection** (`attacks.js` `ATTACKS`: the singles, the strings, `roar` and, spread in,
`FIRE` from `fireAttacks.js`, `BULLET_HELL` from `bulletAttacks.js` and `TERRAIN_MOVES` from
`terrainAttacks.js`; their numbers are `TUNING.attacks`, into which `tuningFire.js` `FIRE_ATTACKS`,
`tuningBullets.js` `BULLET_ATTACKS` and `tuningTerrain.js` `TERRAIN_ATTACKS` are merged, and onto
which `tuning.js` copies each move's combo links from `tuningLinks.js` `LINKS` as
`TUNING.attacks[name].links`). `dragon.hitPlayer` multiplies every blow's damage by
`TUNING.damageScale` (0.85), except hits flagged `bullet: true`. The AI weighs any entry generically:
`ai.js` `attackWeight(def, name, d, sense)` reads `phase` (first phase, on the def or
`TUNING.attacks[name]`), `weight` (a number, `[P1, P2, P3]` or a function of `(dragon, sense)`
returning either; per-phase arrays go through `perPhase(v, phase)`) and `air` (usable while
airborne; no entry sets it today, as every flight, the flying combos included, runs inside one
action). String and single attacks gate their weight on an AI band (`bandWeight`: `range` in model
units × SCALE, `maxAng` / `minAng`); fire attacks, bullet patterns and terrain moves gate on
world-metre distances (`minDist` / `maxDist`) in their own `weight(d, s)`. `TUNING.openingCooldowns`
hold the ranged singles back after the intro. `TUNING.unlockStagger` [first, step, jitter] ([1.5,
1.6, 1.5] s) staggers the abilities a new phase unlocks: in a random order, the i-th gets an opening
cooldown of first + step × i + a random share of jitter (`enterPhase`). Not staggered: the names in
`TUNING.pressure.unlockSkip` (`['nova', 'roar']`: the phase-3 roar queues the nova itself) and any
attack tuned `unlock: false`.

**The director** (2026-11-15, ADR-119; `ai.js`, numbers `TUNING.pressure`): `Brain._choose` is a
weighted pick over every `ATTACKS` entry off cooldown, steered by the director. A designer adding a
move needs to know:
- **Categories.** `ai.js` exports `CATEGORIES` (`melee`, `wing`, `tail`, `fire`, `flight`, `spell`,
  `terrain`) and `categoryOf(name)` (cached): the tuning's or the def's own `category` wins, then
  `TUNING.pressure.category` (tail → tail, stomp → melee, breath / fireball → fire, leap → flight,
  roar → spell), then where it is tuned (a terrain move → terrain; a bullet pattern → fire; a fire
  attack → flight when it has an `alt`, a flying combo's `parts` or `air`, else spell) and, for a
  string, what its hits are: its tail (`tail*` kinds), wing (`wing*`) or fire (`fireSnap`,
  `emberRake`, and any hit with a `burst`) hits make it that category when they are two or more or
  a third of the string (most wins; a tie goes tail, wing, fire), else melee. Today: melee 13, wing 2
  (the Wing buffet, the Sky hammer), tail 4, fire 11, flight 7, spell 6, terrain 3.
- **The pick's weight:** × `repeat` [0.3, 0.65] for the last two picks; × `bias[cat]` per phase
  (melee, wing and tail 1.25 – 1.3); the last pick's category × `sameCat` 0.7, × `overRun` 0.03 once
  `maxRun` (2) picks of it ran in a row; a category absent past `floorAfter` [32, 15, 12] s ×
  `floorBoost` 2.5 × min(3, absent / floorAfter); gap closers (`closers`: charge, pounce, leap,
  skyStrafe, diveBomb, or a tuning `closer: true`) × `closerBoost` 2.2 past `farDist` 15 m; tail
  moves × `behindBoost` 2.5 when the hero is behind it (beyond `behind` 1.75 rad off the nose);
  flights × 0.05 once `maxAir` [0.18, 0.24, 0.3] of the last ~20 s was spent airborne
  (`brain.airShare`); spells × 0.05 while `maxCast` [3, 5, 7] hazards burn. A category absent past
  `floorAfter` × `floorForce` (3) that can be used from here becomes `brain.forceCat`: every other
  category × 0.02 until one of its moves is picked. A category absent past its floor that nothing
  can use from here makes the wyrm move for it (`_startSeek` / `_seeking`, `pressure.seek`: it only
  closes in and turns; the backward bound was removed).
- **Layering rules** (enforced, not weights you tune per move): a spell or a bullet pattern while
  another spell's emitter or any bullet is live × `layer` (0); a move that asks for a guard (any
  normal or blue blow) while a meteor / chase emitter or an ambient cinder is still to land, or a
  move that asks for a dodge (any red or black blow, every flight and spell, a pattern's red orbs)
  while bullets fly × `mixed` (0). What a move asks for is read from its data (each hit's tell, the
  headline tell, `orbs` / `orbWave` / `barkOrbs`) and learned from the cues it really sends.
- **Combo links.** `TUNING.attacks[name].links = [{ to, when, chance, band? }]` (all of them live in
  `tuningLinks.js`, one table). When a move ends **on its own** (`stopAction(false)`, not
  `aborted`), `Brain._link` takes the first link whose `when` holds for where the hero is now
  (`linkWhen(when, sense)`, exported: `front` ≤ 0.9 rad off the nose, `side` 0.9 – 1.75, `behind`
  beyond, `near` < 9 m from the root, `mid` 9 – 18, `far` > 18, `any`), whose `chance` (a number or
  `[P1, P2, P3]`) rolls, and whose target is usable now (exists, off cooldown, weight > 0 from where
  he stands; `band: false` clamps the hero into the target's own band first) and passes the
  layering rules. It goes into `brain.queued` and starts with no pause, booked like a pick. At most
  `chainDepth` [3, 3, 5] links in a row, then a breather of `chainRest` [0.7 – 1.0, 0.8 – 1.1, 0.4 –
  0.65] s. A move that ended interrupted (parried into a recoil, staggered, broken, plunged) or one
  the hero answered with his own art (`player:flurry`, `player:flareCounter`, `player:counter` set
  `action.answered`) never links: the pause is `pressure.openingGap` (the old idle gap: [1.0 – 1.7,
  0.7 – 1.2, 0.35 – 0.7] s). Otherwise the pause is `TUNING.idleGap` ([0.25 – 0.5, 0.25 – 0.5, 0.05
  – 0.25] s). `brain.queued` is also how a P3 Cinder burst runs into an Ember torrent.
- **The fairness guard** (`pressure.guard`: `sep` 0.3, `margin` 0.05, `maxHold` 0.5, `safeMin` 6,
  `horizon` 1.4, `roll` 4.2). The brain subscribes to `combat:tell` and `combat:flash` (sources
  'dragon' and 'world') and keeps a ring of 32 upcoming impacts with the answer each asks for (the
  cue ledger: a tell's `impactIn`, re-timed by its flash; `_forget(name)` drops a move's own when it
  ends cut short). `Brain._hold(a, dt)`: a melee blow (the strings, bite, swipe, tail, stomp) whose
  flash is due this frame waits, its windup clock held (the pose keeps tracking), while an impact of
  another source that asks for the other answer is due within `sep` + `margin` of its own, at most
  `maxHold` s per blow and only when the wait clears it (`stats.holds`). Live hazard circles are read
  directly too (a blast the hero cannot reach in a roll is no clash).
- **Ambient cinders** (`pressure.ambient`, from phase 2): `_ambient(dt)` drops small red blasts
  (hazard circles, kind 'shell', attack name `'cinders'`, which has no `TUNING.attacks` entry: it
  appears in cues and in `player.takeHit`'s `attack`) from a wing's wrist or the jaws while a ground
  move runs with time left: every `every` [0, 1.4, 0.7] s, `n` [1 – 2, 2 – 3] at a time, `warn`
  [1.2, 1.2, 1.05] s of heated ground, 1.5 – 4.8 m round the hero (`onHero` [0, 0.25, 0.4] of them on
  his led spot), radius [1.6, 1.6, 1.9] m, 14 damage, burn 1, kb 2, at most `alive` [0, 3, 6] near
  him. A cinder never lands within `sep` of a known blow (the ledger, a hazard, the running move's
  beats), never after the running move ends, never during a guard-tell bullet pattern, the breath,
  a string that scatters embers, or while bullets fly, and only where at least `safeMin` of 17 spots
  (his and 16 a roll away) stay clear of every blast due within `horizon` s (`_freeSpots`). When none
  may fall near him they fall `far` (8 – 13 m + their radius) from him with `noBlow`: fire on the
  field, no cue, no blow.
- **Between moves** (`_combat`): it walks at the hero's spot `lead` 0.6 s ahead when he is farther
  than `approach` [12, 11, 10] m, turns at `turnSpeed` × `pressure.turn` [1.15, 1.1, 1.05], and
  through a longer pause near him sidesteps at `strafe` [1.2, 1.5, 1.7] m/s.
- `brain.stats` = `{ links, ambient, holds, picks, floors, seeks?, ambientFar? }` (the PRESSURE
  scenario's meter reads them; its bounds are `pressure.meter`: `ramp` 1.12, `maxGap`, `minRate`).

**Strings** (contract 1, `makeString(name)`): `TUNING.attacks[name].hits` = N hits, each `{ kind,
side?, tell, flare?, windup, hold?: [min, max], active, impact, damage, knockback, knockdown?,
chance?, parryable?, blockable?, burst?, ground?, ...kind extras }` (`side` ±1 = the limb on the
hero's side at the string's start / the other one, **`side: 0`** = the side he is on as THIS hit's
windup starts (a string that spun round with a tail blow strikes from where he is now); `hold` = a
random extra windup hold that baits an early parry; `chance` < 1 = rolled at the string's start;
`burst: { phase?, n, wait, stagger, speed }` = embers scattered where the hit lands
(`bullets.burst`, from `phase` on); `ground: { phase?, w, linger, tick, tickDamage, burn, delay }` =
the burning ground a fire blow leaves: a hazards strip of kind `'meleeFire'` with `noBlow: true`,
contact ticks only), plus the string's `recovery`, `cooldown`, `weight`, `phase`, AI band `range`
[min, max] and `maxAng` / `minAng`. The phase list is per hit `windup{N}` (windup × `tScale` + hold)
and `active{N}`, then `recovery`. Every realised hit gets a beat (`combat:tell` at its windup start,
`combat:flash` `flashLead` before its impact, holds included) carrying `{ hit, wi }`. **The KIND
contract** (`KINDS`, attacks.js): a kind is an object with `part` (the striking part for the flash,
`Dragon.partPos`; `wi` picks a paw or a wing) and optional hooks: `init(d, a, h)` once at the
string's start (per-hit scratch on `h`), `enterWindup(d, a, h)` at the hit's windup start, before its
`combat:tell` (it may re-time `a.beats[h.idx]`; `side: 0` is resolved here), `windup(d, a, h, k, dt)`
(k over the base windup, held at 1 through the hold; `h.holdK` through the hold), `aim(d, a, h)` as
its active starts, `active(d, a, h, k, dt)`, `endActive(d, a, h)` (slams that land at the end: stomp,
hop), `recover(d, a, h, k, dt)` (blended into the next hit's windup, or the recovery), `hit(d, a, h,
stage, k, dt)` after the rig every frame of the hit, `zone(d, a, h, out)`, `noBreakActive`, `end(d,
a, h, interrupted)`. The kinds: claw, overhead, bite, rearBite, lungeBite, wing, tailJab, tailSweep,
hop, stomp and, since ADR-119, `wingSweep` (a wing scythed down and across the front while the body
pivots: `face`, `sweep`, `amp`, `spread`, `room`, `backSpeed`; part 'wing'), `wingSlam` (both wings
brought down in front: `radius` round the slam point, locked `near` .. `far` model units ahead;
part 'wings'), `tailWhip` (a pivot puts the hero `at` rad off the nose, then a short `spin`;
`pivotRate`, `minReach`, `reach`), `tailSlam` (the tail raised `lift` × its arch and brought down
along a line `width` model units either side), `fireSnap` (jaws open into a gout of fire: ticks of
`tickDamage` every `tick` from `impact` over a cone of `range` / `halfAngle`, tracked at `track`
rad/s after a `turn` rad/s whirl in its windup; set `parryable: false, blockable: true`) and
`emberRake` (a claw whose raked arc burns from `ground.phase`). The string's `hit()` skips a hit
whose beat is not the current one (the next hit's beat may arm a float hair early on the last frame
of this active). A string def carries `string: true`, `melee: true` and `noBreak(a)` (a break waits
out the pounce's hop). Their effects are `meleeFx.js` (`snapFire` and the slams' dust and fire, plain
functions over `d.fx`). Data rules (STRINGS / TIMING scenarios): a tell per hit, the first windup ≥
0.7 s, ≥ `TUNING.minHitGap` 0.45 s from one impact to the next, each contact within ±85 ms of its
flash + lead (the TIMING verifier probes 20 attacks: 16 strings, every one but the Cinder flurry,
and the bite, swipe, tail and stomp; MELEE checks the six new kinds).
**Deflect chain** (contract 1, `onParried`): a parry of the running action's own hit (`attack` null
or the action's name) reads `hit` from the current beat; `last` = not a string, or its last realised
hit. It emits `dragon:parried {attack, tell, hit, last}`; in a string it counts `action.chain` and
emits `combat:deflectChain {count}` from 2. A non-final hit is deflected: `POSTURE.parry` posture and
a knock-back of the struck part (`_startKnock` → `applyDeflectKnock(dt)` at the end of
`Brain.update`: the paw override / head offset thrown out and back over `TUNING.deflectKnock.time`
0.14 s; visual only, no timing change); the last hit (or a single melee attack) recoils
(`brain.recoil()`). `strike()` resets `action.chain` when a hit lands or is blocked (dodges keep it).
**The plunge, dragon side** (contract 2, `onPlunge`): only while targetable; a repeat within 0.25 s
is ignored. `takeHit({ damage, part: 'head', heavy, crit, exact: true, posture: 0 })` (the damage is
final; the phase gate holds). Unless the running action is in `NO_PLUNGE` (intro, phase2, phase3,
death: the damage lands, no reaction), the red glow drops and `brain.plunged({ air, alt, heavy })`
cancels the action and starts `SEQ.plunged` (air = `state === 'airborne'` or the rig's altitude >
1 m; heavy = an execution on a broken wyrm). While it stops a flight `d.crashing` is true, so the
flight's `end()` does not land the wyrm elsewhere (the leap honours it; the fire flights only drop to
'combat') and the wyrm falls from where it was hit. `SEQ.plunged`: [`fall` (~0.6 s, longer from
higher up) + the crash landing (dust ring, shake, `dragon:land`)] → `slam` 0.3 → `thrash` 0.6 →
`rise` 0.45 s (an execution 0.35 / 1.15 / 0.5); the head stays on its joints, so `plungePoint` keeps
tracking it for the rider. The hurt flash is capped at `TUNING.plunged.flash` 0.45 (the impact's
hitstop freezes its decay). A plain plunge then adds its posture (a full meter breaks once the
reaction is over: `NO_BREAK` holds `plunged`); an execution interrupts the posture break, whose end
consumes it (`broken` false, meter 0). A pending phase transition waits for the reaction
(`NO_TRANSITION`).
**Three phases** (contract 4): phase n starts at `phaseAt[n − 1]` of max HP. `takeHit` clamps the HP
at `nextPhaseHp` while the AI runs and sets `brain.pendingPhase` (the phase to enter, 0 = none) once
the gate is reached; `Brain.update` starts `SEQ.phase2` / `SEQ.phase3` when the wyrm is in combat or
staggered, not broken, the AI is on and the running action is not in `NO_TRANSITION` (intro, the
transitions, death, plunged). The transitions are `makeRoar(name, toPhase)` (attacks.js; always P1
timings): `start` calls `enterPhase(toPhase)` and `hazards.clear()`, the roar announces
`dragon:phase2` / `dragon:phase3` + `dragon:phase {n}` and sets the crack glow (`TUNING.phaseGlow`);
the shock ring is red (the phase-3 roar's `shockRing(x, z, r, calm = true)`: its front's fire and the
glow it leaves on the ground held low so the ignition reads) and the phase-3 roar calls
`d.ablaze?.ignite()`; `end` queues `ATTACKS.nova` after the phase-3 roar when the AI runs.
`enterPhase(n)` queues the next transition at once if the HP is already past its gate (Lab, AI off).
Per-phase tuning (`[P1, P2, P3]`, read with `perPhase`): `turnSpeed`, `walkSpeed` [3.6, 4.6, 5.3],
`phaseTimeScale` [1, 0.82, 0.7] (windups and recoveries; `tScale`), `idleGap`, `phaseGlow`,
`phaseEmbers` (body embers / s), `posture.max`, `rest.jaw`, attack weights and link chances, and most
of `TUNING.pressure` (the director above). Phase-2 values of the singles (`activeP2`, `sweepP2`, the
3-shell volley, the leap) apply from phase 2 on. `phase2At` / `phase3At` / `phase2TimeScale` are kept
for older readers.
**Flights** (contract 3, short flights inside one action, ADR-030): `takeOff` sets `state =
'airborne'` (`dragon:takeoff`; body circles empty, a stagger or break waits), `touchDown` returns to
'combat' (`dragon:land`). Flights stay ≤ 16 m up (the tests see ≤ 13.5 m) and inside the bound; the
hurt spheres ride the drawn body, so a flying wyrm is out of sword reach (lowest sphere 5.3–10.1 m in
the tests) and only the plunge reaches its head.
**The body against the world** (2026-11-15, ADR-119; it replaced ADR-107's trample round the root,
which never reached a trunk): `dragon._wreck(dt)` runs every frame after `_refreshHurt`. Each hurt
sphere that moved faster than `TUNING.world.body.minSpeed` (1.6 m/s) sweeps the pieces it passed
through (`destructibles.sweepRec`, a segment from where it was to where it is, at its height:
a sphere whose bottom is above `maxY` 12 m, or above a low piece, passes over), with power (speed −
minSpeed) × `perSpeed` 0.17 × its part's `mass` (head 0.7, neck 0.8, body 1.9, tail 1.1, wing 0.8,
leg 0.9), at most `max` 2.2. Every such sweep is a **brush** (`o.brush`, `BREAK.brush`) and
**incidental** (`o.incidental`: a piece reserved with `destructibles.reserve`, or the running
action's own `action.piece`, passed as `o.spare`, is left alone). On top: the wings' blast as it
leaves the ground (`takeoff`: wood only), each downbeat under `downbeat.maxAlt` 11 m (wood only,
weaker the higher), and the landing after a flight at least `landing.minFall` 2.5 m high (its weight:
stone too). A frame that moved a sphere more than `body.jump` 6 m is a teleport; after the root is
teleported the body settles `body.settle` 0.6 s first. `_collide` resolves the root with `soft:
true`, so breakable wood never turns it (it is felled as the body goes); stone still does. No
per-frame allocation (one reused record per kind of blow; world.mjs BUDGET checks it).
**Its reach into the tree wall** (2026-11-16, ADR-120; `wallReach.js`, numbers `TUNING.world.wind` /
`TUNING.world.carry`): the wyrm fights inside the clearing; two calls carry what it does out to the
trees round it, through the world's own API, guarded and allocation-free. Neither touches the hero (no
blow, no fire on his ground, no tell; every attack's hit, damage, timing and tell is unchanged).
- `wallWind(d, x, z, key, k = 1)` → `destructibles.wind(x, z, power × k, reach, { from, fall })` from
  `TUNING.world.wind[key]` = [power, reach m, from m, falloff (0: `BREAK.wind.fall`)]: `roar` [0.3, 32,
  0] (`roarFx(d, strength, wind = 'roar')`, × its strength), `phaseRoar` [0.22, 58, 0, 1.0] (the
  transition roars), `shock` [0.35, 26, 0] (`fx.shockRing`), `takeoff` [0.4, 26, 0], `landing` [0.5,
  28, 0], `downbeat` [0.16, 20, 26] (`dragon._wreck`, × the beat's strength), `buffet` [0.4, 26, 0]
  (the wing buffet's downstroke; the wing sweep × 0.75), `ground` [0.22, 22, 0] (`fx.groundShock`, × its k).
- `carryFire(d, x, z, dx, dz, key, y = 1.2)` → the piece or null: `destructibles.carryFire(x, z, dx,
  dz, len, k)` from `TUNING.world.carry[key]` = [length m, at most every s (per key, `d._carryT`), burn
  k, streak blobs]: `breath` [24, 0.35, 0.9, 10] (past the end of the breath's cone), `strip` [20, 0.3,
  0.9, 6] (the burning pass's front), `wall` [18, 0.25, 0.8, 6] (a flame wall, forward), `ring` [16,
  0.3, 0.8, 4] (a flame ring, outward), `shot` [22, 0.2, 0.7, 4] (a launched bullet that times out or
  leaves the bound, `bullets.js`), `meteor` [0, 0, 0, 0] (none). When a tree is reached, a streak of
  heat runs to it in the fire field.
**The wyrm ablaze** (phase 3; 2026-11-16, ADR-120; `ablaze.js` `class Ablaze`, `dragon.ablaze`,
numbers `tuningAblaze.js` `ABLAZE`; COMBAT.md "Three phases"): the phase-3 roar's beat runs fire out
from the chest along the wing arms, the legs and the tail, it flares at every end, and from then on
flames stand on its wing tips (8), the trailing edge between them (6), its four claws and the last
third of its tail (`tailFrom` 0.66) with a larger flame at its tip; look c adds both horns (read
from `heads.js` `HORN_TIPS` through `headVis.matrixWorld`) and the spine's crest. Every flame is heat
in the fire field (`game.fx.fire.spawn`, keeping `inherit` 0.18 of the part's velocity, so a fast
move leaves fire along its path); embers are glyph particles.
- Looks: `?ablaze=off|a|b|c` (read once; default `b`, the owner's pick), `ablazeLook()`,
  `setAblazeLook(k)`, `dragon.debug.ablaze(look)`, the Lab's "Ablaze" button (FIGHT section). `ABLAZE.looks[k]` holds
  `k`, `rate`, `size`, `life`, `rise`, `trail` (b, c: extra fire along a part moving faster than 7 /
  6 m/s), `prints` (b, c: burning footprints and the tail's drag), `horns`, `crest`, `embers`, `light`.
- Life cycle (`mode`: 'off' | 'igniting' | 'burning' | 'dousing'): `ignite(fast = false)` (the roar:
  `ignite.delay` 0.45 s after the ring, a run of `time` 1.1 s, then the flare: 70 embers, shake 0.32,
  punch 0.6, a pooled light); a phase 3 entered any other way lights by itself in `fast` 0.45 s; it
  gutters to `gutter.level` 0.28 through a stagger, a posture break and the plunge's reaction;
  `douse()` on dying (1.5 s, the ends first); `reset()` puts it out (`dragon.reset()` and
  `finishDeath()` call it).
- The world: wood a burning part passes below `wood.maxY` 6.5 m while moving at least 3 m/s catches
  (`world.ignite(x, z, 0.9, 0.7, false)`: wood only, 6 sites tried a frame, each at most every 0.12
  s, at most `perMin` 5 a minute, inside the world's caps); `dragon.onStep` → `ablaze.step(x, z,
  hind)`: in looks b and c a planted claw alight chars the scorch map (`burnCircle`, r 0.6 / 0.8 m)
  and a few small low flames flicker there 1.6 s (10 slots). It never calls `world.fire`.
- Readable: it subscribes to `combat:flash` (source dragon): for 0.55 s the fire within 3.5 m of the
  cue burns at 8 %, rising to 65 % at 8 m, and the dim starts 0.15 s before each told beat; a red / black body glow dims all of it by
  up to 50 %; a flame within 3 m of the hero burns at 40 %.
- Budget: at most `cap.perFrame` 90 blobs a frame (180 while it ignites); past 3300 blobs in the field
  the body's fire scales down, to none at 4200. Its own random stream (a seeded fight is the same
  with it off or on); no allocation per frame.
Size: the model is authored in model units and the root is scaled by `SCALE` (tuning.js, 1.875
since v0.3); every world-space number (reaches, radii, hurt spheres, body circles, AI ranges, FX,
pushers, pose targets via `rootPt`) is multiplied by it. The hero does not scale, so 3D hit volumes
/ AI ranges are re-checked against him (integration sims) when `SCALE` or the anatomy changes.
Body plan (v0.4, "four-legged rebuild", docs/art/dragon.md): a quadruped drake, withers 4.0 model
units (7.5 m), columnar forelegs (elbow back) + digitigrade hind legs, a short thick upright S-neck
(7 × 0.46 chain), a 16-segment tail lying in a sideways hook, and a separate pair of wings rooted on
top of the back (humerus → forearm → wrist + thumb hook → 4 two-joint fingers, 4 membrane panels).
Anatomy numbers live in tuning.js `ANATOMY`. Since the reference match the finger bones are
`[6.2, 6.9, 5.5, 3.9]` with knuckle fractions chosen so the proximal bones (wrist → knuckle, where
the wing hurt spheres sit) are v0.4's; only the distal bones are ~1.35× longer (visual only).
Look ("Obsidian Drake", model.js): materials in `model.mats` (scales, limbs, neck, head, belly,
throat, lava, membrane, wingBone, spine, bone, claw, teeth, maw, eye; `limbs` = the hide on legs,
tail and the wing arm; `head` = skull, brow and jaw with finer scales). What the player sees is each
material's `WYRM_ART` source (the `wyrm` option, see Render helpers); the surface-glyph `levels` /
fissure options only shape the `U.uArtSolid` = 0 render. Crack glow per material from `model.glow`
(`[phase-1 ember, × glow (later phases / death), × throat charge]`, the glow target per phase
`TUNING.phaseGlow` [0, 0.5, 0.8], applied in `_applyMaterials`; every
`model.mats` key needs a `model.glow` row except `eye`, which follows `rig.s.eyes`); the art
source's veins, cracks and gap glow scale with it.
Visual-only geometry on gameplay joints: every head mesh hangs on `model.headVis`, scaled
`HEAD_VIS` (1.3) about the mouth point, while the gameplay joints `head` and `mouth` (the bite /
charge spheres, the breath / fireball origin) are unscaled; `rig.pt.eyes`, `pt.nostrils` and
`pt.jawTip` follow the drawn head. The drawn tail radius (`tailRV`) is thicker than
`model.tailRadii`, which stays the chain's ground clearance (read by the rig and the tail sweep).
**The build** (2026-11-20, ADR-123; `looks.js`): `?wyrmLook=0|a|b|c` (read once; default `c`, the
owner's pick: lean, a fierce head carried high, a mane of quills; `0` = the wyrm before, `a` / `b`
the steps between). Exports: `WYRM_LOOKS`, `WYRM_LOOK_SHIPPED`, `wyrmLookId()`, `wyrmLook()` (the
build's numbers or null for `0`), `setWyrmLook(k)` (the NEXT built wyrm; tests, `ABYSS_WYRMLOOK`).
A build changes what is drawn and nothing else: `buildDrake` bakes the trunk's and limbs' meshes
into their joint's frame and scales them there (`slim`, `slimBone`), scales the neck's and tail's
drawn radii, spine, quill and talon lengths, `headVis` (its size and width) and the old head's
horns, fangs and frills (`buildOldHead(headVis, mats, build.head)`). No joint moves and no draw is
added. `buildDrake` returns `build` and `hornTip` (the built main horn's tip in headVis's frame,
null for a sculpted head; `ablaze.js` reads it before `HORN_TIPS`). The one thing a build has
outside the model is `rest` (`{ neck: { pitch0, pitchStep, pitchCurve }, headDip }`): `rig/anim.js`
reads it where it read `REST_POSE.neck` / `REST_POSE.headDip`, weighted by the resting weight, so
attacks keep their measured head.
**The face** (2026-11-20, ADR-124; `heads.js` + `faces.js`): `?wyrmFace=` (read once; default `drake`,
`WYRM_FACE_SHIPPED`, the owner's pick; `old` = the head before, `model.js` `buildOldHead`; `skull`,
`loong`, `demon` (ADR-120) and `tyrant`, `viper`, `revenant` were shown and passed on). `faces.js`
holds the four faces of 2026-11-20 and registers them into `heads.js` `HEADS` / `FACE_ART` at import
(`model.js` imports it). A sculpted head's data may carry `paint` / `paintJaw` (rules that move loft
triangles to another material: `{ key, from?, z?, y?, c?, r?, except? }`), `teethOpt`, `nape` (the
crest's and mane's lengths over the last neck segments, nearest the head first; `faceNape()`, read by
`buildDrake`) and extras that return `hornTip`. `createDragonMaterials` adds `pit` (the hollows) and
`mask` (bare bone) only when the face's `FACE_ART` has them. `buildHead` returns
`{ eyes, nostrils, jaw, whiskers, hornTip }`.
**Heads kept for later** (2026-11-16, ADR-120; `heads.js`): before ADR-124 `?wyrmFace=old|skull|loong|demon`
defaulted to `old`. The owner passed on those three sculpted heads; they stay behind the switch, like
the hero's looks (ADR-089). Exports: `WYRM_FACES`, `wyrmFace()`, `setWyrmFace(k)` (the NEXT built wyrm; tests, the
Lab's "head" row, which reloads the page), `FACE_ART` (per head, art entries merged over `WYRM_ART`
for its parts), `JAW_PIVOT` [0, -0.15, 0.05], `HORN_TIPS` (per head, the main horn's tip in
headVis's frame: ablaze look c's horn fire), `sculptLoft`, `bentPath`, `sweepTube` and
`buildHead(face, headVis, mats)` → `{ eyes, nostrils, jaw, whiskers }`. `buildDrake` returns `face`
and `whiskers`; the loong's two whiskers are `Chain`s sprung by `rig/anim.js` `_updateWhiskers`
(`WHISKER`), none for the other heads. The gameplay joints `head`, `mouth`, `snout` and `jawTip` sit
where the old head's are for every head; the drawn eyes and nostrils follow each head's anatomy.
Wing membrane (membrane.js): `new WingMembrane(material, side, restKey)` — 4 Coons panels rebuilt
from the bones every frame (allocation-free); `aGUV` is laid out once from `restKey`
(`WING_KEYS.HALF`, so changing that key re-lays the membrane's texture), so the grid is even in the
resting pose. Two static per-vertex attributes feed the `wyrm` membrane source: `aEdge` (0 inside →
1 on the free trailing edge) and `aBone` (model units to the panel's nearer bone). Trailing-edge
scallops `SAG` [0.3, 0.28, 0.24, 0.16] plus torn `RAG` notches. Resting body language
(`TUNING.rest`): wings `spread` 0.5 (HALF) in every phase, ≤ 0.3 while walking; jaw [0.65, 0.85,
0.95] per phase, the painting's snarl (visual only); attacks return to `TUNING.rest.spread`.
Rig (rig/anim.js, internal to the dragon module; attacks.js / ai.js are its only writers): each
frame the brain writes a `pose` (head / look goals, `lookDown` = max nose-down head pitch, jaw 0..1
→ 0.7 rad, pitch / roll / lower / twist, `spread[2]` per wing: 0 FOLD · 0.5 HALF (the painting's
mantled sails) · 1 SPREAD, `mantle` 0..1 (breath display key: wrists held high in the hips frame,
so the front crouch doesn't drag them down) / `droop` 0..1 (stunned: tips on the ground), flap (fingers fold on the upstroke), `pawOv[2]` front-paw override targets (rakes,
slams, the charge's ground-pawing) + `pawPlant[2]` (one frame: that paw lands at its target, clamped
into the leg's reach by `rig.clampPaw`, and becomes a ground contact the gait steps home), `rear`
0..1 (front feet off the ground), stance (`stanceF` / `stanceH` wider, `strideF` / `strideH`
forward, model units; `restep` 0..1 lowers the stride threshold so the feet re-plant there; in
place they take quick overlapping steps, all four within ~0.7 s, so the stance ends symmetric),
`hindLock` (hind feet stay planted: a lunge's push), `elbowsOut` 0..1 (braced / buckled forelegs),
`swell` 0..1 (chest swell), `airReach` 0..1 (airborne legs reach down for the landing), airborne,
sleep / dead / stagger, tail curl / wave / stiffness, gait speed + velocity) and the rig solves the
body — a nose-up pitch / rise the planted forelegs can't follow sits the hips back onto the haunches
— and refreshes `rig.pt` (world space): head, snout,
mouth, jawTip, headFwd, eyes, nostrils, chest (ribcage joint), chestC (deep-chest centre), hips,
neckBase, `legs[2]` (hind: hip, knee, ankle, toe), `arms[2]` (front: shoulder, elbow, wrist, toe),
`wings[2]` (root, elbow, wrist, knuckles[4], tips[4], mids[4] = knuckles, attachH). Index 0 = the
model-left (+X) side. Gait contacts (`rig.gait.limbs`): footL, footR, handL, handR; 4-beat lateral
walk (LH → LF → RH → RF) up to 5 m/s, diagonal trot to 8, bound above.
Striking-part names for tells (`partPos`): 'snout', 'head', 'mouth', 'claw' (a front paw, `b.wi`),
'forefeet' (front-paw midpoint; flashes at both paws; 'wrists' is the v0.3 alias), 'wing' (a wing's
middle knuckle, `b.wi`: the wing buffet, the wing scythe), 'wings' (between both wings' middle
knuckles: the wing slam), 'tailTip', 'shell', 'bullet', 'piece' (the tree or boulder a terrain move
holds or has thrown), default chest. `flashTell` spikes the body's red / black `uWarn` for a dodge-only
blow except when the part is 'piece': a thrown piece's flare is on the piece, the body that threw it is
not the blow. The stomp's red ground ring is centred between the two forefeet's landing
spots (root frame (±1.2, 0, 2.9) model units); the slam presses the paws there (dust + a heavy
`dragon:step` at each), holds them for 0.3 of the recovery, then plants them and steps home.

Rig additions from the reference match (2026-11-08). New `pose` fields (reset every frame; the
brain writes them):
- `idle` 0..1: no attack running (`Brain._combat` sets 1). The rig's idle life plays: breathing
  sails, weight shifts, gaze drift, a wing rouse every 8–11 s on fixed gaps while standing still
  (deterministic: it never draws on the AI's random stream), and the stalking stance.
- `tailLift` 0..1 (default 1): 1 = the arched resting tail (`REST_POSE.tail`), 0 = dragged low (the
  tail sweep, the stomp's tripod).
- `tailLegacy` (bool): the tail runs the exact v0.4 chain solve. The tail sweep (and its turn-away
  prelude) sets it, because its hit spheres and swept arc ride on the chain; otherwise the
  round-2 limits apply (rest shape at most `TAIL_SINK` 0.55 segments under the ground, segments at
  most `TAIL_DEV` [0.6 soft, 1.2] rad from their rest direction), easing back in after a sweep.
- `headExact` (bool): the head aims exactly, with no `HEAD_AIM_RATE` (11 rad/s) turn limit. Set on
  the frames whose hit spheres ride on the snout / mouth: bite and combo-lunge active, charge
  active, breath active, fireball.
- `headLead` (Vector3, world): an offset of the SHOWN head only. `strikeLead` (attacks.js) sets it
  over the last three windup frames of the bite and the claw combo's lunging bite (12 / 30 / 55 % of
  the strike's first step), so the head accelerates into the snap. No hit test runs in a windup;
  active frames are untouched (ADR-025).
- `drape[2]` 0..1 per wing: the wing collapses onto the ground beside the body, in world space
  (dying; the chest frame rolls with the body).

Rig additions for the flights (2026-11-09; used with `alt` / `airborne` / `flap` / `flapHz`):
- `hover` 0..1: hind legs hang straight down (swaying), forelegs reach down with the claws ready, the
  tail hangs from the tilted body and curls back up toward the tip, and the wingbeat sweeps fore and
  aft (the wrists come forward on the downstroke).
- `glide` 0..1: the wings blend toward `WING_KEYS.GLIDE` (arms nearly level, a ~27° dihedral, the
  fingers fanning the sail out flat, so from the 58° camera the membrane faces up; span ~34 m).
- `dive` 0..1: the wings blend toward `WING_KEYS.DIVE` (the stoop: arms tucked back and up, fingers
  swept back along the body), the tail streams straight.
- `altRate` (default 12/s): the smoothing rate of `alt`; a dive sets it high so the body meets the
  ground on the impact frame.
- In the air every downstroke heaves the body up, and the tail streams back as a rudder a little
  below level (held at 34° down, the 15.6 m tail reached the sword band from a 7–8 m flight).
- The deflect knock-back (`applyDeflectKnock`) adds to `pawOv[i].pos` (claw / forefeet hits) or
  `headOffset` + `pitch` (bites, wings, tail) after the action wrote the pose.

Two neck solves (ADR-025): `rig._neckSim` is the measured solve every attack's head path and hit
spheres were tuned on; `rig.neck` is the shown chain (applied to the joints, read by the neck hurt
spheres), blended toward the resting S by `s.rest`. While an attack drives the head (`s.rest` <
0.03) the shown chain swings toward the measured head (the head's step spread down its length,
`NECK_FOLLOW` 0.45 toward the measured shape) and the head joint is pinned to the measured solve
(`Chain.endQuat`), so the snout / head / mouth points are the measured ones (≤ 9 mm, float noise).
The pin is released only while `headLead` is non-zero.

`REST_POSE` (exported from rig/anim.js, tunable live from the console): `neck` (the resting S:
head low and forward), `lookDown` 0.45 / `headDip` 0.22, `stance` (`frontOut`, `frontFwd`,
`hindOut`, `hindBack`, `stalk { frontL, frontR, hindL, hindR }`, `crouch` 0.12), `sweep` (the
resting wings turn with the head toward a foe aside: `bias`, `look` 0.7, `max` 0.85, `maxBack` 0.35,
`arm` 0.4), `tail` (`pitch0`, `pitchStep`, `pitchCurve` + the dip `dipAmp`, `dipAt`, `dipWidth`).
`WING_KEYS.HALF` is a re-fitted cambered sail (wrist (±2.1, 7.5, −0.78) root frame, the leading
finger held ≥ 14° below the wrist) that keeps ≥ 0.42 of each wing's area visible from every 58°
game-camera yaw and the reference / front views. Death (`SEQ.death` → `deathPose` in ai.js) is a
timed collapse (`DEATH`: a throe, the legs give way from 0.3 s, the chest hits the ground at 1.1 s,
the head at 1.22 s, a last heave); every foot is locked while dying. The parry recoil throws the
head on an eased arc and plants any foot caught mid-step (`gait.plantAt`).

Rig helpers (internal to the dragon module):
- `Gait`: `plantAt(i, pos)` (plant contact `i` now; it steps home later), `settle` 0..1 (set by the
  rig from the stalk weight: standing still, a foot more than 0.24 × scale from its spot steps back,
  one 0.42 s step every 0.75 s), `turnRate` / `dYaw` / `pivot` (turning in place trots the feet
  round; the tail sweep's spin pivots planted feet with the body), per-limb `reach` (a planted foot
  past 0.92 of its leg's reach wants to step) and `off` / `posRef` (a swinging foot absorbs a jump of
  its home into `off`, which fades out by the landing; `posRef` is the contact without it, read by
  the scapula glide so the offset never feeds back into the body). Free contacts ease to their home
  (`FREE_RATE` 10/s) instead of snapping.
- `Chain` (rig/chain.js): constructor options `groundGlide` and `stableTwist` (the tail uses both,
  the neck keeps v0.4's), fields `devSoft` / `devMax` (swing limit from the rest direction;
  Infinity = off), `buildRest({ ..., dipAmp, dipAt, dipWidth, sinkMax })` (a dip that bends a
  stretch of segments down, and a cap on how deep the rest shape may dive under the ground),
  `endQuat(parentQ, out)` (the last joint's world rotation without touching the joints).
  `aimJointStable` keeps a joint's twist continuous near the −Z singularity (no 180° wing flips).
- `solveTwoBone(A, T, l1, l2, pole, outMid, outEnd, bend = null, soft = 0)` (rig/ik.js): `bend`
  (per limb, persistent) keeps last frame's bend direction when the pole runs along the limb; `soft`
  (the wing arms: 0.05) eases the last stretch toward full extension.
- Hurt spheres follow the arched resting tail: its first spheres sit ~3–4.5 m up, so a hero behind
  the wyrm hits hips and legs more and the tail less.

Damages the player only via `game.player.takeHit(...)` with tell data; announces tells with
`combat:tell` / `combat:flash` and shows them on its own body (no HUD marks):
- **moments are cued by the flare (ADR-118; COMBAT.md "Tell presentation")**: `fx.tellFlash(tell, x,
  y, z, flare)` → `DuelFx.tellFlash(tell, x, y, z, k, flare)` draws the flare for a red or black
  blow and for a blue one whose beat says `flare` (`rules.js` `isFlare`), else the white glint. One
  flare per cue (a blow of both forefeet is one streak), kept inside the frame.
- red (dodge-only) hits: nothing through the windup (`TELL_STYLE.red.warn` from = to = 0; until
  ADR-118 `uWarn` ramped 0.1 → 0.38) and no heat on the ground under its own area
  (`TELL_STYLE.red.floor` false: `Brain._warnZone` returns at once). On the cue `uWarn` on every
  material (`model.mats`, driven in `_updateWarn`) spikes to 1.6 and decays to 0 in 0.25 s (game
  time). A replaced action (stagger, posture break, parry recoil, plunge reaction, death, Lab
  interrupt) drops it at once; `reset()` and death zero it. An action with a red glow but no blow of
  its own (Armageddon's rear-up and salvo) sets `dragon.bodyWarn` 0..1 every frame: a 0.1 → 0.38
  ramp of its own (`BODY_WARN`), read and zeroed by `_updateWarn`.
- black (charged) hits: through the windup `Brain._charge` draws the charge on the striking part
  (`fx.charge` → `DuelFx.charge`) and emits `combat:charge` once; `_updateWarn` ramps
  `TELL_STYLE.black.warn` (x `BLACK_BODY` 0.16 on a body this size; `dragon.warnRGB` is the colour
  written to `uWarn`).
- a blue hit marked `flare` (a parry moment): `hitPlayer` passes `flare` and holds the blow as a
  last one; `onParried` recoils the wyrm wherever in the string it came (`dragon:parried { last,
  flare }`).
- parryable (normal / blue) hits: nothing during the windup; on the flash a white glint (star core,
  four-point sparkle, short rays, small white light) at the striking part, ×1.5 for blue.
- parries throw white/gold sparks (bigger for blue).
- fire hazards draw a red glyph ground warning from spawn to impact (see Hazards); the
  self-announcing ones (meteors, chase pillars) send their own `combat:tell` / `combat:flash` with
  `hazard: true`.

**Hazards** (contract 3; `src/entities/dragon/hazards.js` `class Hazards`, internal to the dragon
module: `dragon.hazards`): pooled world-space fire threats (48 records, 8 hit-cap groups) that live
on their own, independent of the wyrm's current action, so it can fight while meteors fall.
`dragon.update` calls `hazards.update(dt)` every frame (guarded: an error clears the field, never
throws); the field is cleared on `reset()` (`fx.reset()`), on every phase change, when dying / dead
/ asleep, and by the transition roars. No per-frame allocations (pooled records, reused hit /
event scratch).
- Spawns return `{ slot, id }` (a reference; `get(ref)` → the live record or null) or `null` when the
  pool is full (the hazard is dropped). Common options: `kind`, `attack` (the name the tells and
  `takeHit` carry), `delay` (s to impact), `damage`, `burn`, `knockback`, `knockdown`, `announce`
  (default true), `group` (a hit cap from `group(maxHits)`).
- Shapes (`SHAPE`): `circle({ x, z, r, active, fall, from, drawShell })` (a meteor falling from
  `from` over its last `fall` s, a lava pillar, a barrage shell: one blast at impact, hitting for
  `active` s); `strip({ ax, az, bx, bz, w, speed, linger, tick, tickDamage, tickBurn })` (a fire
  front runs A → B; the ground it passed burns `linger` s); `ring({ x, z, r0, r1, speed, w })`
  (ignites at r0, expands to r1); `wall({ x, z, dx, dz, len, w, speed, dist })` (sweeps along its
  normal); `line({ ax, az, dx, dz, n, step, r, stagger, active })` (lava pillars erupting one after
  another); emitters `rain({ count, first, span, warn, warnLed, ledEvery, lo, hi, r, fall })`
  (meteors round the hero, every `ledEvery`-th on his led position), `chase({ every, until, warn,
  lead, r, active, linkFirst })` (pillars under the led hero) and `barrage({ waves, perWave,
  waveGap, stagger, first, glowAt, warn, warnLed, ledEvery, ledGap, lead, r, fall, fallY, size,
  damage, burn, knockback, group, crater, tickDamage, tickBurn, safeR, cover, finale })`
  (Armageddon, ADR-053: waves of meteors over the whole clearing falling from the sky above the
  wyrm, then `finale` { delay, radius, warn, damage, burn, knockback, fall, size }: one great
  meteor on the hero, outside the hit cap; from `glowAt` it drives `world.atmosphere.skyGlow`).
  The wave placement is pure and exported for the tests: `placeWave(n, r, rng, hx, hz, pts, safeR,
  cover)` (jittered-stratified over `ARENA_R`, no two footprints overlapping by more than `OVERLAP`
  = 1/3 of one, at most `cover` of the hero's `safeR` disc covered), `leadInto(pts, k, n, r, cx,
  cz, hx, hz, safeR, cover)` (a led meteor takes the hero's led position only if both rules
  still hold), `coverage()`, `overlapShare()`, `ARENA_R`.
- `circle()` also takes `size` (drawn scale), `great` (the biggest impact), `dark` (no light of
  its own) and, for meteors and lava pillars, `craterBurn` s + `tickDamage` / `tickBurn`: the crater
  or the pillar's ground burns on with contact ticks like a burning strip (blockable, never while
  rolling). A circle of kind **`'pool'`** is only that: burning ground with no blow of its own
  (eruption pools). The pool holds 64 hazards.
- **`noBlow: true`** (circle, strip; 2026-11-15): the hazard deals no blow and sends no cue
  (`announce` is forced off), its fire is drawn as ever and a strip still deals its contact ticks.
  Used for the ground a fire blow of a string leaves burning (kind `'meleeFire'`, from the hit's
  `ground` data: the blow was the string's own) and for ambient cinders that fall out of the hero's
  reach. A `noBlow` strip lights one low light instead of two. `Brain._clash` and `_freeSpots` skip
  `noBlow` hazards.
- `line()` and `chase()` take `pool` (s each pillar's ground burns on; `line` also `poolR`, its
  radius, default 0.8 × r), `tickDamage`, `tickBurn`: the eruptions' burning pools from phase 2.
- `barrage()` also takes `deckAt` (s after the cast when the sky deck starts; default `glowAt`),
  `deckGrow` (s to spread over the frame) and `cx`, `cz` (where it spreads from: over the wyrm's
  cast): it calls `skyFx.skyDeck` every frame from `deckAt`.
- Also: `cutStrip(ref)` (a knocked-out pass stops its front; the burnt part lingers), **`cancel(ref)`**
  (takes back a hazard that has not gone off: a strip not yet started, a circle not yet fired; a
  flying combo knocked out of the air drops its unbreathed strip and its unspat shells; a burning
  strip or a fired circle stays), `timeTo(ref, px, pz, vx, vz, pr)` (s until the hazard reaches a
  moving point: the spawning attack re-times its own flash with it), `count(kind?)`, `clear()`
  (also `skyFx.skyReset`).
- `hazards.update(dt)` first calls `skyFx.skyUpdate(d.fx, dt)` (the salvo's columns and the sky deck;
  guarded on its own). Meteors are drawn by `skyFx` (`skyMeteor`, `skyImpact`, `skyCrater`); barrage
  shells and the ambient cinders still by `fx.meteor` / `fx.shellImpact`, pillars' pools and `'pool'`
  circles by `fx.crater`.
- Every hazard heats the ground under it until it goes off (ADR-052: `fx.heatDisc` / `heatBand`,
  no red rings; the edge shows in the last `flashLead` s), then deals its one blow through
  `dragon.hitPlayer({ ..., tell: 'red', parryable: false, blockable: false, plunge })`: i-frames or
  leaving the area avoid it. `plunge` is the spawn option `plunge` (default false: a perfect dodge
  gives the slow-mo in place). Fire the wyrm breathes or spits from the air spawns with `plunge: true`
  (the burning pass's strip front, the hover barrage's shells): a perfect dodge of it sends the hero
  onto the flying wyrm's head, and it crashes. Spells from the sky or the ground never plunge.
  A strip's lingering fire deals contact ticks instead (tell normal, blockable, not parryable,
  skipped while the hero rolls or is invulnerable). A group stops dealing blows at its cap.
- Tells: a self-announcing circle (`announce`; meteors, chase pillars except a first one the attack's
  beat covers) emits `combat:tell` once the hero is within 3 m of its ring and `combat:flash`
  `flashLead` before impact (both `hazard: true`, `source: 'dragon'`, `attack` = its spell). Other
  hazards (`announce: false`) are covered by the spawning attack's own beat, re-timed with `timeTo`.
- Events: `dragon:hazard {kind, stage, x, z, radius}` (stage 'fall' when a meteor starts its visible
  fall; 'hit' when a meteor or pillar goes off; the dive's crash and the nova emit it too from
  fireAttacks.js; Armageddon: 'launch' for each bolt of the salvo, from fireAttacks.js, radius 0,
  and 'sky' once when the sky answers, from the barrage, radius = ARENA_R).
`dragon.hitPlayer(o, action)` forwards `plunge` (`o.plunge ?? the current beat's plunge`) to
`player.takeHit`; without it `plunge: false` never reaches the hero.

**Fire attacks** (`fireAttacks.js` `FIRE`, numbers `tuningFire.js` `FIRE_ATTACKS` and `FLIGHT`; the
same action shape as attacks.js: phases / beats / zone / weight / start / enter / update / hit /
end): single flights `skyStrafe`, `diveBomb`, `hoverBarrage`; flying combos `skyHunt`, `skyFurnace`,
`skyCataclysm`; spells `meteorRain`, `eruptions`, `flameRing`, `flameWall`, `nova`. Every blow is
red; each attack has one tell beat per blow unless its hazards announce themselves (the meteor cast
has no beat: each meteor rings and flashes). Hazard-dealt blows pass `plunge: false`, except fire
breathed or spat from the air (the strafe's and a combo pass's strip front, the barrage's shells:
spawned with `plunge: true`, the airborne plunge); the dive's crash and the nova pass the default (a
perfect dodge may plunge). The flame ring lays `rings` [1, 2, 3] rings `ringGap` s apart, the flame
wall `walls` [1, 1, 2] (the second from the hero's side, square to the first), each its own beat.
- **Flying combos** (2026-11-15, ADR-119; `makeFlightCombo(key)`): one take-off, then the parts of
  `TUNING.attacks[key].parts` in order (`'pass'`, `'barrage'`, `'dive'`), joined by a `wheel`
  (a banking turn) or a `swoop` (a drop onto the next pass's line), ending in a dive whose crash
  landing (entering `recovery`) is the last blow. Each phase entry carries its part's index as a
  third element (`[name, s, part]`; the runner reads only the first two). The parts' numbers are
  `FLIGHT` (`takeoff`, `rise`, `swoop`, `wheel`, `pass`, `barrage`, `dive`); the combo's own tuning
  only chooses the parts, the windup / recovery and the AI data. One beat per blow at the start of
  the move that leads into it, re-timed from the strip / the shells. A perfect dodge of a pass or a
  shell plunges, the wyrm crashes, and `hazards.cancel` takes back what that combo had not breathed
  or spat yet. Each part emits `dragon:spell {name: key, part, x, z}`.
- **Armageddon** (`meteorRain`; 2026-11-15 rework): the performance and the sky come in three looks,
  `skyFx.APOC_LOOK` from `?apoc=a|b|c` (read once at load; default `a`, the look the owner kept, 2026-11-16):
  `a` the salvo of columns from the ground, `b` one sustained pillar roared up, `c` cast from the air
  (its own `windup`, `rise`, `descend`, `recovery`, `alt`). `meteorRain.looks[k]` holds `deckAt`,
  `deckGrow`, `menace`, `drop`, `cone` per look. Through the cast it asks `game.cameraRig.keep(...)`
  for a sphere `skyRoom` 9 m above the jaws, so the fire going up stays in view. It arms
  `hazards.barrage` with `waves` [3, 3, 5] × `perWave` [8, 8, 10] (phase 1: the Lab only) and the deck
  data. `dragon:hazard` 'launch' per bolt (look b: per pulse). `fx.launchBolt`, `fx.meteor`,
  `fx.meteorImpact` and `fx.crater` are no longer used by it (`skyFx` draws its sky and its meteors).
- **`skyFx.js`** (new, 2026-11-15): plain functions over the wyrm's `DragonFx` (`fx`), the pattern
  `bulletFx.js` uses, with state made once on `fx._sky`: `skyBolt` (one column of the salvo),
  `skyPillar` (look b), `skyThroat` (the chest and throat filling before a cast), `skyDeck(fx, k, cx,
  cz, grow)`, `skyMeteor`, `skyImpact`, `skyCrater`, `skyUpdate(fx, dt)` (ticked from
  `hazards.update`) and `skyReset(fx)` (from `hazards.clear`). It calls the fx internals `_blob`,
  `_rec`, `_col`, `_spawn`, `_hold`, `_light` and `dustRing`: keep their signatures.
Each emits `dragon:spell {name, x, z}` at its signature moment. `meteorRain` is not picked while a
rain or meteors are still falling. The nova keeps its 2.5 s charge in every phase (it is the tell)
and is the phase-3 opener. Numbers and gates: COMBAT.md "Current numbers".

**Effects engine** (`fx.js` `DragonFx`; STYLE.md "Fire, hazards and the plunge"): two engines draw
most of what the wyrm does, and a new effect should go through them.
- **Shock fronts:** `_shock(x, z, r0, r1, T, k = 1, fk = 1, delay = 0, look)` rolls a ragged front out
  from r0 to r1 in about T s, slowing (drag), with rows behind it, dust and grit, scorch, rocks, a
  light and (k ≥ 0.9) an echo ripple; k = strength (1 a meteor, 2 the nova), fk = how much of it is
  fire (0.2 = a landing: dust and a little heat). Its numbers per look are the `SHOCK` table. Behind
  every ring: the roar's `shockRing`, `groundShock(x, z, r, k)` (a heavy body meets the ground:
  landings, the stomp, the leap, the hop, the tail slam, a thrown piece; draws only, plus its wind on
  the tree wall, `wallWind` 'ground', ADR-120), the crash
  (`crashWave`), the nova, fireball and meteor blasts. `_ripple(x, z, y, r0, r1, T, heat, size, ...)`
  is a thin crisp ripple (steel; r1 < r0 draws it in: a charge); `roarWave` is ripples plus a dust
  front in look b.
- **The breath:** `breathBody(dt, mouth, yaw, pitch, R, HA, k = 1)` is the one body of fire for
  every stream the wyrm breathes (the breath, the fire snap through `meleeFx.snapFire`, the strafe and
  the combos' passes), shaped to reach R m within ±HA rad, at k × the breath's rate; the caller adds
  its own lights, smoke, sparks and scorch (`breathEmit` = `breathBody` + the breath's own).
- **Looks the owner picked from** (read once from the URL; headless runs have no location): `?ring=a|b|c`
  (`ringLook()` / `setRingLook(k)`) and `?breath=a|b|c` (`breathLook()` / `setBreathLook(k)`),
  plus `?apoc=` above. `a` is the default of each and the look the owner kept for all three
  (2026-11-16, ADR-119); `b` and `c` stay behind the switches and in the FXLOOKS scenario.

**Bullets** (ADR-039; `src/entities/dragon/bullets.js` `class Bullets`, internal to the dragon
module: `dragon.bullets`; rules in COMBAT.md "Bullets"): the pooled bullet field (360 records, 8
hit-cap groups) and the ground tongues (48 alive at once, a plan of up to 64). `dragon.update` calls
`bullets.update(dt)` after the hazards every frame (guarded: an error logs once and clears the field,
never throws); cleared on `reset()`, on every phase change, when dying / dead, and fizzled by a
posture break. No per-frame allocations. `bullets.js` must not import `attacks.js` (`attacks.js` →
`bulletAttacks.js` → `bullets.js`).
- Kinds `BULLET { EMBER: 0, ORB: 2 }` (specs `TUNING.bullets.ember | orb`; kind 1 was the homing wisp,
  removed 2026-11-15, and stays unused). `spawn(kind, attack, x, y, z, yaw, speed, group = -1, life =
  0)` → the record or null (pool full, NaN or an unknown kind); `lob(attack, x, y, z, tx, tz, T, group
  = -1, life = 0, yAt = 0.5)` → an ember lobbed onto the ground point (tx, tz) in T s under
  `TUNING.bullets.lobG` (the Ember rain; it bursts where it lands, its spot glowing as it falls);
  `burst(attack, x, y, z, n, wait, stagger, speed, group)` (embers that hang and drop on the hero one
  by one: a string hit's `burst`); `group(max, retMax = TUNING.bullets.returnBudget)` → a group id:
  the pattern's hit cap and the HP its returned shots may deal in all (past it a perfect parry is a
  plain deflect); `count(kind)`, `live`, `clear()`.
- A pattern's headline beat follows its lead bullet: `setLead(b)`, `leadAlive()`, `leadPos(out)`,
  `leadTti()`; the beat part `'bullet'` in `dragon.partPos` resolves to it (the mouth when none).
  `headlined(kind, tti)`: the brain has flashed the headline, so the lead's impact is announced
  (it covers the clump and stamps the lead's `cueAt`). `holdFlash(a, beat, kind)` → true when the
  field takes over a headline flash that the ending action could not send yet (the lead is still
  flying): the field then calls `dragon.flashTell(a, beat)` `flashLead` before the lead's impact,
  at once if the lead dies or is deflected, and never after a clear / fizzle / the wyrm's death
  (the same as an interrupted pattern: a tell without a flash). One held flash at a time.
- The cue: `cue(kind, attack, tell, tti, x, y, z)` → `CUE.NEW` (glint + `combat:tell` +
  `combat:flash` sent), `COVERED` (an announced impact of the same class within `cueGap` answers it),
  `LATE` (too late to react to: the caller makes it a dud or lets it hit) or **`CLASH`** (an announced
  impact of the other answer, an ember beside an orb, is within `clashSep` 0.35 s: not announced, the
  caller makes the bullet a dud). `cover(kind, tti)` registers an impact something else announces.
  A bullet cue stands for one predicted impact (`cueAt`, in the bullet's own time).
- **The ground tongues** (2026-11-15; they replaced the fire wheel's `startWheel` / `stopWheel` /
  `aimWheel` / `wheel`): `scour({ attack, x, z, times, angs, r0, r1, speed, hold, width, damage,
  burn, knockback, grp, headline })` lays a plan: each tongue is released from the pivot (x, z) at its
  time (s from now, ascending) along its world yaw, its front crawling out from r0 to r1 at `speed`
  m/s, every spot it passed burning `hold` s; a new plan replaces the old (burning tongues burn on).
  `movePlan(x, z)` shifts the pivot (the breath's body moved before the first tongue), `stopScour()`
  drops the tongues still to come, `scourHeadlined()` (the attack's headline flash went out: from here
  the field announces its own touches), `scouring` (getter: a plan or a tongue live), `planNext()`
  (s to the next planned tongue), `tonguesLive`, `ttT` (s until a tongue, burning or still planned,
  next touches the hero on his sensed velocity; Infinity: none within 2 s). A tongue is red
  (`plunge: false`), only hurts a hero it announced within `tongue.cueHold` s, and after a hit the
  field's tongues pause `tongue.cd` s (`cdDodge` after a roll through one). Its cue is `combat:tell`
  / `combat:flash` with `{ hazard: true, bullet: true, tell: 'red' }` and the pattern's name as the
  attack (`fireWheel` or `fireLanes`).
- Hits go through `dragon.hitPlayer({ ..., bullet: true, perfect, plunge: false })`: the damage is
  final (no `TUNING.damageScale`), `player.takeHit` receives `light: true` and `perfect` (false for
  embers: a roll is a plain dodge), and a parry does not call `dragon.onParried`.
- Perfect parry → the return (ADR-051): on `RESULT.PARRIED` the field reads
  `game.player.deflect.perfect`. Normal: the bullet ricochets to `rig.pt.head` (`ricochet` m/s) and
  the kind's `posture` applies at once. Perfect (embers; orbs are never parried): the bullet is
  `returned`, flies at `returnSpeed` m/s drawn ×`returnSize` (`BFX.drawReturned`) and, on reaching
  the head, deals the kind's `returnDamage` through `dragon.takeHit({ part: 'head', exact: true,
  posture: returnPosture })` (the phase gate holds, it may kill; the action is never interrupted;
  posture breaks are allowed), flinches the head and emits `dragon:returned {kind, damage, x, y,
  z}` (kind is 0 today). Only the struck bullet returns (the clump it pops does not); returned shots
  in flight die silently on a clear and fizzle on a posture break like any bullet.
- Tells: a bullet about to hit emits a paired `combat:tell` + `combat:flash` with `hazard: true,
  bullet: true` `flashLead` before impact. A deflect emits `dragon:parried {attack, tell, hit: 0,
  last: false, bullet: true, perfect}` and adds the kind's `posture` (a perfect one: its
  `returnPosture` when it lands).
- What the fire does to the world (`TUNING.bullets.world`): a landing ember strikes the pieces it
  lands on (`land` 0.08: under `BREAK.scratch`, it marks and sets alight), a stopped bullet takes
  `TUNING.world.bullet` 0.12 out of the cover (an orb × 3), and a tongue's front sets wood alight
  (`world.ignite(..., grass = false)`: grass fire would bury the lines).
- Reads the hero through `game.player`: `isSwinging()` + `sweep` (cutting), `radius`, the sensed
  velocity (`dragon.sense.vel`).
- Look: `bulletFx.js` (STYLE.md "Bullets"): the embers and the tongues are heat in the fire field, the
  orb a glyph mark.

**Bullet patterns** (`bulletAttacks.js` `BULLET_HELL`, numbers `tuningBullets.js` `BULLET_ATTACKS`,
spread into `ATTACKS` like `FIRE`; the same action shape): `emberStorm` (the Ember torrent),
`fanVolley` (the Cinder burst), `cinderSpit` (the Cinder spit), `emberRain` (the Ember rain),
`fireWheel` (the Scouring breath) and `fireLanes` (the Fire lanes); the keys are the contract (audio,
Lab, tests), the labels are display names. Each emits `dragon:spell {name, x, z}` at its cast; the
torrent, the Scouring breath and the Fire lanes also emit `dragon:breathStart` / `dragon:breathEnd`
(the breath loop). **Every bullet is breathed (ADR-050):** `spit(d, kind, attack, dyaw, speed, grp,
life)` spawns it at `rig.pt.mouth` along the head's actual aim (`pt.headFwd`) + `dyaw`, with a
`drop` scaled to the mouth-to-hero distance (`TUNING.bullets.dropK / dropMin / dropMax`: a close hero
is not flown over); patterns emit from their `hit()` hook (after the rig, so from the jaws as drawn)
and aim the head first (`aimHead`: reach out of the neck base, `headExact`, a look down the line).
No pattern spawns from the body or the wings, and nothing homes. **No spinning** (2026-11-15): while a
pattern breathes, the neck and the head do the aiming and the body never turns faster than its
walking turn rate (`d.turnRate`; asserted per pattern and phase by the integration suite). The
Scouring breath and the Fire lanes drive the breath into a strike point ahead of the jaws
(`bulletFx.breathBeam`) and lay their tongues with `scour`. A P3 Cinder burst may queue an Ember
torrent (`brain.queued`, `fanVolley.chain`).

**Terrain moves** (ADR-110; second pass 2026-11-15, ADR-119; `terrainAttacks.js` `TERRAIN_MOVES`,
numbers `tuningTerrain.js` `TERRAIN_ATTACKS` + `TERRAIN`, spread into `ATTACKS` like `FIRE`; the same
action shape): `hurl` (Uproot and hurl), `tailBat`, `fireBrand`. The pieces are the world's
("Destruction" below); the wyrm's side is `terrain.js`. **Nothing is drawn on the ground before a
piece arrives** (the owner's choice; it supersedes ADR-110 and ADR-118 for thrown pieces): one
`combat:tell` at the start of the move, and the flare drawn on the flying piece `flashLead` s before
it lands (the beat's part is `'piece'`). The aim is fixed at the release, on where the hero is
heading then (`lead`). `mark(...)` / `lane(...)` (the landing glow before the throw) are gone.
- `jawsPiece(d, wood, out, any)` → the liftable piece (lift 1) that costs the least to reach (a turn
  at `TERRAIN.jaws.turn`, one lunge at up to `fetchSpeed` to stand `stand` m from it, within
  `fetchTime` s: there is no trot), never one within `clear` m of the hero; `wood` = a tree only.
  `tailPiece(d, out, any)` → a boulder in the tail's ring whose line to the hero is clear of the body,
  with the lash's travel pointing the hero's way and the hero out of the lash's arc; it writes which
  way the pivot turns. `any` (a forced move) relaxes the gates. Each move's `weight` is 0 when its
  picker finds nothing, so the AI never starts one without a piece; `phases()` picks again, and with
  nothing at all the action is one `search` phase (no beat, no blow).
- The chosen piece is **reserved** for the whole move (`reservePiece`: `destructibles.reserve(piece,
  the move's length + 0.5 s)`; it is also the action's `a.piece`): the wyrm's own body walking and
  lunging (`_wreck`, incidental blows) leaves it alone.
- `dragon.terrain` (`class Terrain`; `dragon.update` calls `terrain.update(dt)` after the bullets,
  guarded; `reset()` drops a held piece and forgets what flies): `grab(piece, x, y, z)` (the jaws
  close on it: `destructibles.take`, but it stays ROOTED and shudders as they tug), `strain(dt, k)`
  (the tug: grit jumps round its foot), `tear(dx, dz)` (it comes free: roots and dirt burst, a scar,
  and it is yanked up into the jaws without a jump), `carry(dt, x, y, z, tilt, yaw, stiff = 1)` every
  frame after the rig (the grip point at the jaws; free, the piece hangs as a stiff pendulum,
  `TERRAIN.jaws.sway`, driven by the jaws' own acceleration; `stiff` tightens it for the whip),
  `blaze(dt, k)`, `drop()`, `lob(tx, tz, spec, attack, a, b, burning)` → the flight time,
  `bat(piece, dx, dz, len, hitS, speed, spec, attack, a, b)` → true, `stir(dt, piece)`,
  `piecePos(out)`, `smashed` (pieces the flying ones have smashed: tests, the Lab).
- **In the air the piece stays HELD** in the world: `Terrain` flies it frame by frame (`_place` →
  `destructibles.carry`) on a flat, fast arc (`flight` [0.4, 0.68] s for the hurl), tumbling on with
  the whip's swing (at least `spin` rad/s, a boulder × 1.4). On its way it sweeps what stands in its
  path (`destructibles.sweep`, power `smash`; a tree in the way goes down and it flies on; a burning
  brand lights what it smashes, `trailIgnite`). Where it lands the blow at the hero is dealt here (red,
  `plunge: false`, the move's tell), the world takes a blast of `power`, then the piece is handed to
  `destructibles.throwTo` only for the skid (`skid` m in `skidTime` s, tumbling) and comes apart. A
  burning piece also bursts, calls `world.ignite` and leaves a pyre (contact ticks like a burning
  strip, put out by a phase change). A batted boulder (`bat`) is carried along its line here too, so
  `destructibles.stop` ends it at the first cover; it tests the hero as it passes, with the spec's
  tell, and is let go with a short `throwTo` where it ends.
- A thrown piece carries its action's beat: if the action ends or is cut short after the release,
  `Terrain` sends the beat's flash (`dragon.flashTell`) `flashLead` before the piece arrives, once.
  An action cut short BEFORE the release drops the piece and sends no flash.
- A throw at a hero far round its side is slower: past `whipArc` off its nose the neck's coil is
  drawn out into a pivot of up to `pivotMax` s (his opening). A held piece is swung back and out
  toward the camera's side by up to `showArc` so it stays seen.
- Events: `dragon:spell {name}` at the throw / the kindling / the bat; `dragon:bite` at the bite;
  `dragon:breathStart` / `dragon:breathEnd` round the kindling; `dragon:explosion` where a firebrand
  lands; the world's own `world:impact` (`throw`, `crash`).
- Effects: `terrainFx.js` (new; plain functions over `d.fx`: `strain`, `tearOut`, `pin`, `burnTrunk`,
  `trail`, `smashOn`, `landing`, `batBurst`, `pyre`). Fire and smoke in the fire field; grit, clods,
  roots, splinters and leaves are glyph particles.

**Melee FX hooks** (`DragonFx`, called by `attacks.js` through optional calls): `clawTrail(wi, toe,
heavy)` (a claw's burning wake, every active frame of a claw / overhead hit) and `slamBurst(x, z, r)`
(the ground burst under a slam). The whole-body kinds' effects are `meleeFx.js` (2026-11-15; plain
functions over `d.fx`, the bulletFx pattern): `snapFire` (the fire snap's gout, through
`fx.breathBody`) and the dust, fire and embers of the wing slam, the tail slam, the wing scythe and
the ember rake. Their burning ground is the hazards' `'meleeFire'` strip.

### HUD — `src/ui/hud.js` exports `class Hud`
```
constructor(game)          // builds DOM under #ui (inject its own <style>; do not edit style.css)
update(realDt)
log(text, channel='system')          // channel: 'system'|'combat'|'warn'|'lore'
showBossBar(name) / hideBossBar()    // boss HP + posture bar
banner(text, kind, opts)             // kind: 'death'|'victory'|'area'|'bonfire'|'phase'
bannerHint(text) / clearBanner(instant)   // sub-line under the current banner; flow uses both
bannerRecap(lines | null)                 // small lines under the hint (the death screen: the killing move, then what
                                          // struck him); the first is drawn brighter; cleared by a new banner and by
                                          // clearBanner(true)
showStats(rows)                      // victory / death run stats
prompt(text|null)                    // interaction prompt, e.g. "[@interact] Rest at bonfire" (the chip shows the bound key)
promptText                           // getter: the prompt shown now (raw "[@interact] ..." text) or null
promptEl                             // the prompt's element (touch controls make it a tap target)
pauseUi.buttons; titleUi.stageButtons  // the menu buttons in order, for the gamepad's focus
remapUi                              // the CONTROLS panel (ui/remap.js; see Bindings)
newsUi                               // the WHAT'S NEW panel (ui/changelogPanel.js; below)
titleUi.newsButton                   // the title's WHAT'S NEW button (the gamepad walks it after the stage buttons)
showTitle() / hideTitle();  showPause(bool);  toggleHelp()
// the pause menu (ui/screens.js PauseMenu): RESUME · QUALITY · SOUND · CONTROLS · FULLSCREEN /
// PAD POSITION / PAD SIZE (touch) · WHAT'S NEW · QUIT TO TITLE (pressed twice within 3 s → flow.quitToTitle())
```
**WHAT'S NEW** (ADR-116): `ui/changelog.js` exports `GAME_VERSION` (= package.json `version`),
`RELEASES` (newest first: `{ version | null, label?, date?, summary, entries: [{ date, title, notes:
[string] }] }`; `version: null` is the LATEST release, the work since the last version) and
`entryId(entry)` (`date|title`). `ui/changelogPanel.js` `ChangelogPanel` (`hud.newsUi`): `open()`,
`close()` (marks every entry read), `toggle()`, `on`, `unseenCount()`, `onChange(fn)` (after a read),
`markAllSeen()`, `scroll(px)`. Read ids live in localStorage `abyss.whatsnew.seen`; with none, only the
newest day's entries are unread. Esc (capture phase, swallowed), the pad's B / Menu / A and BACK close it;
while it is open `flow._title` does not start the game and the gamepad drives only the panel (the stick /
D-pad scroll). Badges: the title button's `.ab-news-badge` ("N NEW") and the pause item's value
("N NEW ›"). `tests/changelogcheck.mjs` (in `npm test`) checks every CHANGELOG.md → [Unreleased]
headline has a LATEST entry with the same title, the entries' form, and the version.
**Touch layout:** the touch controls add `.ab-touch` to the HUD root (`.ab-root`). Elements with
`kb-only` are hidden then, `tp-only` ones only show then (title "PRESS ANY KEY" ↔ "TAP TO BEGIN",
the keyboard ↔ touch control lists in the title and pause menu, the pause menu's FULLSCREEN item
where the Fullscreen API exists). With `.ab-touch` the log, the key hint and the help panel are
hidden, the prompt becomes a tap target ("TAP › Rest at bonfire"), the pause panel scrolls; below
560 px of height (phones in landscape) the player's rows and the boss's are set in 10 px type, the boss
sits at the bottom centre between the thumbs, and the title / record compact.
The **minimap** is a bare disc in the top right corner on every device: 72 px at 60 % opacity, on a
phone (a side ≤ 560 px) 40 px at 50 %; no panel, no zone title, no coordinates (the FPS line stays
when on).
**Held upright** (`(max-width: 560px) and (orientation: portrait)`; ADR-097): the frame top left,
the boss's rows under them, the prompt and banners above the thumbs, the pause panel in the upper half so the pad shows below it, the title's logo and
lists to the screen's width.
Desktop (no `.ab-touch`) is unchanged.
**Gamepad layout:** while a pad is the device in use, `html.abyss-pad` (and `.ab-pad` on the HUD root)
hides `kb-only` and `tp-only` elements and shows `pad-only` ones (title "PRESS ANY BUTTON", the
pause / help pad grid); `ab-nontouch` elements (the title's controls line, the corner hint, the
CONTROLS item) hide on touch unless a pad is in use. Action chips relabel to the pad's buttons (and
PlayStation symbols). `.pad-focus` marks the focused menu button.
Renders no attack tells of its own: no text, icons, rings or arrows (tells are read from the
attacker — COMBAT.md). Its only tell cue is a brief screen-edge flash (~0.25 s, game time,
stronger on the attacker's side) in the flare's colour on the `combat:flash` of a moment (red; blue
with `flare`; black: the edges go dark, and they dim slowly through a black blow's charge, from
`combat:charge`), dropped by a stagger / posture break /
death / retry (`ui/tells.js`); flashes with `hazard: true` (meteors, chase pillars) are skipped,
their red ground rings already warn. Also renders parry / Ghostep / guard-break call-outs, the cyan
Ghostep edge pulse (a plunge's perfect dodge included), the posture bar, and the crit-window cue.
**Look (ADR-098): an ASCII overlay with no panels in play.** The player's rows (top left: HP, guard,
the crit window, the streak, the flasks and the lock label; no name plate) and the boss's (top
centre: its name in spaced capitals, HP with a `|` at each phase gate, posture) are text on the game. Every meter is a
`GlyphBar` (`ui/glyphBar.js`: `set(0..1)` / `snap` / `update(dt)`, `root` takes the state classes,
`mark(f)`): a run of fill characters, the piece just lost (held `hold` s, then drained) and the empty
rest, between brackets, written to the DOM only when a run's length changes; anything above zero
shows at least one cell and only a full meter shows them all. `GlyphPosture` grows from the middle.
HP 24 cells of `#`, guard 24 of `=`, crit 16 of `>`, the boss 48, posture 32.
The banners' big words are block letters (`ui/blockText.js`: `blockLines(text)` → six rows in the
title logo's letterforms, `blockText(text, { maxCols })` stacks words to fit): `ui/banner.js` sizes
them to the window's width (`BLOCK_MAX` px a character by kind) and lays them out again when the
window is resized or turned; the plain text stays in the DOM, unseen. A phase call, which comes in
the middle of a fight, is the smallest (6 px) and sits above the fighters (21 % of the height, no
dark band). No serif font is used.
The player's rows carry the **guard meter** under HP (`player.guard / maxGuard`, polled: steel
`=`, warm under `GUARD.low`, a flash and "GUARD DOWN" on `player:guardOpen`). The **lock-on
marker** (`ui/nameTags.js`, `LOCK_MARK`) is a hint, not a fixture: taking the lock shows a small
dim diamond on the target (opacity 0.55) for 0.5 s, it fades over 2.4 s and stays gone until the
lock is taken again (real seconds; the frame's "LOCKED ON" label and the touch LOCK button say the rest).
`ui/callouts.js` subscribes itself to `combat:deflectChain {count}` ("DEFLECT ×N" over the hero's
head: one counter per string that counts up in place and absorbs the PARRY / DEFLECT pop of the same
blow; the GHOSTEP call-out counts the same way from the second perfect dodge of a streak,
"GHOSTEP ×N"), `player:plungeHit {execution}` ("EXECUTION") and the duel's moments: `player:lock {phase}`
("BLADE LOCK" / "BREAKTHROUGH"), `player:mikiri` ("MIKIRI"), `dragon:deflected` ("PERFECT DEFLECT"),
`dragon:guard` ("GUARDED", or "DEFLECTED" in red when `deflect`). The boss bar draws a thin tick at each
phase gate (`dragon.phaseAt` after the first, read at construction: 66 % and 33 %) and takes the
`p2` (orange) / `p3` (white-hot) style from `dragon.phase`; the minimap's wyrm dot follows the same
three colours.

### Flow — `src/game/flow.js` exports `class GameFlow`
**Move telemetry** (ADR-108, `game/telemetry.js` `MoveLog`): `flow.moves` logs every `combat:answer` per boss move:
`attempt` (a Map id → { seen, hit, blocked, parried, perfectParry, clashed, dodged, perfectDodge, damage, kills },
counted in BLOWS; a contact stream is one blow per 1.5 s), `killedBy` ({ attack, tell }; 'burn' when no blow dealt
the death), `worst(n)`, `commit('death' | 'victory')` (adds the attempt to the level's totals in localStorage
`abyss.telemetry.v1`: { [level]: { attempts, deaths, wins, killedBy, moves } }), `reset()` on every respawn,
`table(level, label)` and `totals()` / `clear()`. `flow.moveLabel(id)` names a move (the boss's `attackLabel`, else the
id spelled out); `flow.deathRecap()` is the death screen's lines ("SLAIN BY …", then up to three moves with "n of m
blows landed"), shown with `hud.bannerRecap`. The victory record gains "Struck most by". Console:
`__telemetry()` (this level's table, the deadliest move first), `__telemetry('all')`, `__telemetry('clear')`.
```
constructor(game);  update(dt, realDt)
quitToTitle()              // the pause menu's QUIT TO TITLE: reload the level (game.pickLevel), which opens on the title;
                           // headless (no location.assign) the state goes to 'title' and the title shows
cameraOverride: null | { focus: Vector3, weight: 0..1, zoom: meters }   // read by main.js
debug: { toState(name) }               // Lab: 'explore'|'boss'|'dead'|'victory' with consistent side effects
cinematic({ x, z, zoom = -9, weight = 0.6, slowmo = 0.3, dur = 0.8, kind }): boolean
                                       // a duel's big moment (ADR-062): the flow's time scale × slowmo for dur real s
                                       // (cineScale: drops in at once, eases back over the last third; min-merged with
                                       // the death / victory slow-mo, NOT a hitstop), the camera zoom m closer leaning
                                       // weight toward (x, z) (cameraRig.cine; eases in over 1/5, out over 2/5). A newer
                                       // moment replaces a running one. Emits 'game:cinematic {kind}'. False outside play.
cine, cineScale                        // the running moment (null) and its time scale this frame (1)
```
Owns `game.state`, title → explore → bossIntro → boss → dead/victory, pause (Esc), bonfire rest (E),
retry after death (respawn at bonfire, `dragon.reset()`, `world.scorch.reset()`), F2 quality,
M mute, H help, F3 fps. Boss framing (`boss` state, `TUNE.bossCam`): the override focuses on the
box of the hero + `dragon.hurtSpheres` (tall parts leaned up-screen) and adds at most 5 m of zoom
(`maxZoom`; kept small so the hero stays readable, which is the owner's priority). The hero is
always kept inside the view, and the far end of the wyrm crops first. It fades out when the hero is > 16–36 m from the body or has wheel-zoomed in
(Lab Showroom; "zoomed in" is measured against the rig's own profile, `rig.minDistance` →
`rig.defaultDistance`). On a phone (`cameraRig.mobile`) `TUNE.bossCamMobile` overrides it: weight
0.85, at most 2 m of zoom (the rig caps extra zoom at 3 m anyway), a wider landscape view to the
sides, and the hero may sit lower (`marginSouth` 1.6 m) so more of the wyrm shows above it.
**Flying framing:** the box above can't see 10–20 m up, so while the override is on (weight > 0.05)
and the wyrm is airborne, or a head / body hurt sphere is above `bossCam.highY` (13 m), `_bossFrame`
also asks `cameraRig.keep` for every head and body sphere and for the hero (`must`, never cropped).
Phases: `dragon:phase2` and `dragon:phase3` (queued like the other dragon events) show the phase
banner ("THE CINDER WYRM'S FURY IGNITES" / "ITS HEART BURNS WHITE-HOT") and switch the music to
'boss2'; `flow.phase2` means phase ≥ 2.
Touch: with `game.touch.active` the death hint reads "tap to rise again" and the "H: controls ·
Esc: pause" log line is skipped. Screen taps reach `_dismissPressed` as a virtual LMB press.

### Audio — `src/audio/audio.js` exports `class AudioEngine`
```
constructor(game)          // subscribes to events; AudioContext created lazily
unlock()                   // call on first user gesture (flow does this on title dismiss)
update(realDt)
play(name, opts)           // one-shot SFX by name (sfx.js SFX, then fire.js FIRE_SFX)
setMusic(mode)             // 'none'|'ambient'|'boss'|'boss2'|'victory'|'death'
toggleMute(); muted: boolean;  setVolume(0..1)
```
**Recorded music (ADR-117).** The sound effects stay synthesised. The background music is recorded:
each level's exploring track and one track per boss phase, all CC0 from OpenGameArt, picked by the
owner (`audio/trackList.js` `SCORE`; files in `assets/audio/music/`, credits in
`assets/audio/CREDITS.md`). `audio/tracks.js` plays them; the synthesised score in `music.js` stays
the fallback.
- `_build()` makes `engine.tracks` (a `TrackBank`) and prefetches the compressed bytes of the
  level's tracks (`game.level.id`), plus victory and death. Nothing loads outside http(s) (a file://
  build, the headless tests) or with `?music=synth`: the synth score plays as before.
- `_setMusic(mode)`: 'ambient' plays the level's `explore` track; 'boss' / 'boss2' play
  `phases[n - 1]` for the boss's current phase `n` (`_bossPhase`: the higher of `game.dragon.phase` and
  `_phaseHint`, the latest phase a `dragon:phase2/3/4` event announced: the wyrm announces a phase at
  its transition roar and sets its number later; 'boss2' is at least phase 2; past the last listed
  phase the last one plays on; `_tick` follows a phase number that moves without a music call), so a phase change (flow's `setMusic('boss2')` on
  `dragon:phase2/3/4`) crossfades to the next phase's track (1.5 s); 'victory' / 'death' play the
  shared tracks (the death gong still tolls). The music state is the mode and the phase
  (`musicMode`, `_musicPhase`). A mode with no track (or a level with none) gets the synth layer,
  and the synth's boss ↔ boss2 intensity change still applies to it.
- A `TrackLoop` has the MusicLayer contract (`fadeIn`, `fadeOut`, `schedule`, `dispose`, `kind`
  'track', `fading`, `deadAt`); it starts when its track has decoded, loops from `loopFrom` with an
  `xfade` overlap (a few ms for loops written to repeat), and a track that fails to load sets
  `failed`, after which the engine swaps in the synth layer. At most 3 tracks stay decoded.
- The Lab's VIEW → "Recorded music" switches `tracks.enabled` and restarts the current mode.
  `scripts/build.mjs` copies `assets/` into `dist/assets/`; `scripts/audio/build-music.py` rebuilds
  the tracks from their OpenGameArt sources.

2026-11-09 additions:
- `sfx.js`: `parry {tell, chain}` (each deflect in a chain rings 2 semitones higher, up to 8 steps,
  with a bell 'ting' from the 2nd), `plungeDive {exec}` (on `player:plunge`), `plungeHit {exec}` (on
  `player:plungeHit`; a `player:hitDragon` of kind 'plunge' plays no ordinary hit sound). The flurry:
  `flurryCut {n}` per flash cut (a ring a whole tone higher each cut), `flurryCoil {dur}`, `flurryBurst {n}` as the
  hanging cuts open (all on the cue bus: crisp while the held world is muffled, `_slowDuck` for its length).
- A landed cut (`player:hitDragon`, not guarded: a guarded strike plays only its clash on
  `dragon:guard`): `hit {heavy, crit, part, damage, body}` (body 'cloth' against a duelist: a muffled
  slap, no scaly clack; its metallic ring only on a crit) and the blade's own layer `cut {weight,
  combo, crit, alt}` (not for a `shards` hit: the slam's blade is in the ground) (a slice through a
  falling band and a steel ring per weight, `CUT_SND`; a
  semitone up each hit of the chain, the finisher a step down, `CUT_STEP`; alt detunes alternate
  cuts; its noise offset from its own stream: `Voice.noise(kind, t0, t1, rate, off)` takes an
  optional 0..1 offset instead of Math.random).
- `audio/fire.js` (`FIRE_SFX`, `subscribeFire(on, engine)`): `dragon:spell` → skyStrafe `skyRoar`,
  diveBomb `diveScream`, meteorRain `meteorCast`, eruptions `rumble`, flameRing / flameWall
  `flameIgnite`, nova `novaCharge`; the whole body's blows reuse sounds: wingSlam `land`, tailSlam
  `crash`, tailWhip `takeoff`; a flying combo (`skyHunt`, `skyFurnace`, `skyCataclysm`) is played by
  its `part`: pass `skyRoar`, barrage `meteorCast`, dive `diveScream` (`SPELL_PART`); `dragon:hazard` →
  meteor fall `meteorFall`, hit `meteorHit`, `pillar`, `crash`, `novaBlast`; a `combat:tell` with
  `hazard: true` → `hazardTell` (lighter than the red brass sting, no music dip). Spatialised at the
  event's x / z. Bullet patterns reuse the casts: emberStorm / fanVolley / cinderSpit / fireWheel /
  fireLanes `flameIgnite`, emberRain `meteorCast`. A `combat:tell`
  with `bullet: true` plays nothing, its `combat:flash` plays the ping without the music dip, and a
  `dragon:parried` with `bullet: true` plays no yelp (the clash is `player:parry`).
- `dragon:phase3` replays the phase-2 sting and keeps 'boss2'; `dragon:plunged` → `dragonPain`
  (an execution: the `postureBreak` roar).
- `world:impact` by kind: 'chip' `chip`, 'wear' `wear` (2026-11-16, ADR-120: a quiet leaf hiss, a dry
  crack from stage 2, a low creak for the lean; gain 0.45, `gap` 0.14 s so a roar's front sets off a
  few, not hundreds), 'burn' `sizzle`, 'burnout' `emberHiss`, any other `crash`.

**A flurry's blow on a duelist (ADR-101).** `takeHit({ ..., exact, reel, away })`: `reel` 1 (a flash
cut) flinches him where he stands whatever he was doing (`brain.startReact('flinch')`, travel 0) and
does not shove him; `reel` 2 (the last blow) staggers him and `away` ({ x, z }: where the hero is
when the blow is over) picks the way he stumbles: away from that point. Any actor that takes the
flurry's hits may ignore both. **The afterimage** (`PlayerFx._afterimage(fx, segs, n, { dx, dz,
light })`, `blinkStream(fx, x, y, z)`, `blinkIn(fx, x, y, z)`) reads `PlayerFx.body` / `bodyN`:
world points of the hero's body, written by `player._sampleGhost()` (which calls `_sampleBody()`)
every time a pose is sampled.

### Lab — `src/dev/lab.js` exports `class Lab`
```
constructor(game)          // hidden unless URL has ?lab or the user presses F1 / backquote / the LAB button
update(realDt)             // panel refresh + hitbox overlay (runs before flow)
postUpdate()               // main.js calls it after the actors update so the overlay matches this frame
postRender()               // main.js calls it right after the frame is drawn (same task): the model viewer's sheet reads it back
open: boolean
showroom()                 // look-dev preset: fight on, AI off, god mode, hero 7 m in front, camera close
modelView(opts | null)     // model viewer (below)
```
**Floating toggle** (`.lab-badge.lab-toggle`, bottom centre: the boss's rows hold the top centre): shown whenever
the Lab exists in the page (`?lab`, or opened once) or a Lab cheat is active; a tap / click opens or
closes the panel (phones have no F1). Closed it reads `LAB` (+ `· god · x0.25 …` while cheats run),
open `× LAB`. The panel's own `×` and the toggle are 36 px touch targets on coarse pointers / touch.
Small screens (≤ 560 px tall or ≤ 700 px wide): a compact panel with a max-height that always fits
and scrolls inside (`touch-action: pan-y`). VIEW → **Touch UI** switches the touch controls on / off
(desktop testing of the phone layout, camera and quality).

Debug panel to test the fight without playing it: trigger any `dragon.debug.abilities()` (the
strings and fire attacks show up on their own), Phase 2 / Phase 3 (`dragon.debug.phase3()`: the
transition roar; with the AI on it opens with the nova) / stagger / posture break / kill / reset,
jump flow states, god mode, infinite flasks, time scale, AI on/off, hitbox overlay, teleport. Talks
only to the `debug` APIs above, plus the `game.viewOverride` and `world.debug.setVisible` hooks for
the model viewer. The timing trainer also logs `combat:deflectChain`, `dragon:phase3`,
`dragon:phase` and `dragon:plunged`. Captures start the plunge with `player.debug.plunge(execution)`.
Since 2026-11-16 (ADR-120): FIGHT → **Ablaze** cycles the phase-3 fire off / a / b / c
(`dragon.debug.ablaze`); WORLD → **Wear wall** (a tail's blow, power 1, on the nearest standing wall
tree or landmark piece: watch its stages) and **Wreck wall** (blasts and fire in the wall straight
out behind the hero); PLAYER → a **head** row (`?wyrmFace=`, reloads the page), since 2026-11-20 a
**build** row (`?wyrmLook=`: before / a / b / c, reloads the page; ADR-123) and a **zoom art**
row (`pipeline.setZoomArt('a' | 'b' | 'c')`, live).
**LOOKS** (ADR-122; `dev/labLooks.js`, only in `ash` / `starless`, collapsed until opened): a row per look
switch of the duelists' second pass (`LOOK_SWITCHES`: name, options, default, pick, build-time, levels,
label). A switch read at draw time flips live through `setLook`; one read at build time (`ashLook`,
`lordLook`, `floor`) reloads the page with its parameter. "as shipped" clears every look parameter (the
owner's picks), "before this pass" reloads with `?looks=old` ("all proposals" is gone: `?looks=new` now
equals the default). A later phase's or form's move, and the
phase / form buttons, play from any phase (the Lab skips there first, without playing the change).

**Model viewer** (`src/dev/modelView.js`, Lab → VIEW → MODEL VIEW) renders an actor from the angles
of a character sheet (the game camera is a fixed 58° top-down view):
```
__game.lab.modelView({
  target: 'hero' | 'dragon',   // default: the current one, else 'hero'
  yaw,      // deg around ITS facing: 0 = its front faces the camera, 90 = its left side, 180 = back, 270 = right
  pitch,    // deg elevation: 8 ≈ character-sheet eye level (default), 58 = the game camera; clamped −30..89
  dist,     // m from the look point; omit = auto-fit (whole actor incl. wings / tail / sword, ~10 % margin)
  height,   // m above its root for the look point; omit = auto (centre of its projected silhouette)
  dark,     // true: hide the world (world.debug.setVisible(false)); lights, shadows-on-self and glow stay
  // extras
  solo,     // hide the other actor in the render (default = dark)
  forward,  // m along its facing for the look point (omit = auto); with `height`, aims e.g. at a head
  lockYaw,  // true: sample its facing once at the call; default: the camera follows its facing every frame
  game,     // true: `yaw` is world-fixed like the gameplay camera (0 = from the south) — the Game button
  spin,     // true: turntable, the yaw turns 36°/s of real time (one fit for the whole turn)
  sheet,    // true: every SHEET_VIEWS angle at once in live tiles (below)
  look,     // hero look-dev render: 'ascii' (play) | 'solid' (U.uHeroSolid) | 'source' | 'lines' (uHeroDebug 1 / 2)
})          // → { target, yaw, pitch, dist, height, forward, dark, solo, game, lockYaw, spin, sheet, look, auto: {dist, height} }
__game.lab.modelView(null)   // → 'off': game camera, HUD, world, AI, god mode and the ascii look restored
```
Angles (`VIEW_ANGLES`, the Lab buttons): Front 0, 3/4 L 35, 3/4 R 325, Left 90, Right 270, Back 180,
Rear R 215, Rear L 145, Game (the gameplay camera at the rig's distance: normal play size), plus Spin,
Sheet and the four looks (ADR-035). **Sheet** (`SHEET_VIEWS`): ten tiles on a full-window 2D canvas
(`canvas.lab-sheet`, z 1: over the game canvas, under `#ui`, so the Lab panel stays usable), laid out
right of the panel: the reference sheet's front, front 3/4, right side, back, rear 3/4 and the left
side and rear-left 3/4 at eye level (one auto-fit for the whole turn, the body centred on its root),
and the gameplay camera's pitch and distance on his back, front and right side (yaw around his
facing: the same picture as the real camera with him turned so), drawn ×2 nearest-neighbour. Each
angle is held for two frames and copied out of the WebGL canvas in `postRender` on the second (the
hero's materials read the camera one frame late), so a tile refreshes every 20 frames.
While viewing: dragon AI off and player god mode on (each restored on exit only if the viewer
changed it), every HUD layer in `#ui` is faded out (class `lab-mv`; the Lab panel stays), the hero's
mouse aim is pinned along its facing (it never chases the cursor through a side camera), and the
camera follows the actor each frame (`lab.postUpdate`, before main.js applies the override). The
auto-fit is measured at the call (and again on resize / Lab panel open-close) from the per-mesh
bounding boxes of the current pose (the source meshes; rigid batch meshes, `userData.rigidBatch`,
are skipped); with the panel open the actor is centred in the free area to its
right. `solo` hides the other actor only between `lab.postUpdate` and the next `lab.update` (the
actors never see their `visible` flag change). Poses are driven as usual — `dragon.debug.trigger(name)`,
player inputs / methods — and stepped with `__tick(dt, frames)`.

**Training** (`dev/training.js` `class Training`, `lab.training`; panel `dev/trainingPanel.js`,
`lab.trainingPanel`; ADR-099). `SITUATIONS` is data: `{ id, cat, name, desc, boss (kinds: 'wyrm' |
'duel' | 'ash' | 'lord' | 'any'), role (a boss move by role: single / string / long / red / lock /
mikiri, per level in `ROLES`), dist / wyrmDist / ang, streak, foe, art, hp, god, ai, answer (an
`ANSWERS` key, or (i, T) → key per glint), go(T), tick(T, dt), after(T), until(T), tail, max, expect
[events] }`. `list()` filters them for the boss loaded (`bossKinds(game)`) and appends one BOSS
MOVES situation per `dragon.debug.abilities()` entry. `run(id)` → phases prep (flow to `boss`, AI,
god, pins) → settle (boss and hero free; else the flow's boss jump) → place (teleport, heal, the
streaks via `player.debug.streak` / `dragon.debug.streak`) → run (go; every `combat:flash` from the
boss schedules its answer `lead` s before the impact; `until`) → tail → done (`lastResult` = { id,
ok, missing, secs }). It drives the hero only through `game.input.setVirtual` /
`setVirtualAxis` (the sims' mock: press / up / hold / release / axis) and aims with
`game.mouseGround`. `lab.update` calls `training.update(realDt)` every frame; it uses game time.

### Bindings — `src/core/bindings.js` (ADR-067)
```
ACTIONS                     // [{ id, label, kb: [codes] | null, pad: [buttons] | null, fixed? }] — the defaults
new Bindings(storage = localStorage)   // loads 'abyss.bindings.v2' (ADR-115: a v1 save is not read); storage null = defaults, nothing saved
codes(a) / buttons(a)       // the keyboard-mouse codes / pad button indices bound to action a
bindKey(a, code) / bindPad(a, i)   // replace a's binding; false when refused (reserved, fixed, wrong device)
reset(save, 'kb' | 'pad' | null);  isDefault(which);  onChange(fn) → unsubscribe;  version
keyText(a, all) / padText(a, layout, all) / moveText()   // on-screen names ('E', 'Tab / MMB', '△', 'WASD')
keyLabel(code) / padLabel(i, layout);  installActions(input, bindings)   // the act* API (Input, test mocks)
```
Actions: up, down, left, right (keyboard only), attack (the light), heavy, block, dodge, sprint, flask, lockOn,
interact (rest / fight again), help, mute (keyboard only), zoomIn, zoomOut (pad only), pause
(fixed: Esc / the pad's Menu). Defaults (ADR-115): attack LMB / R1, heavy RMB / R2, block MMB / L1 L2, lockOn Tab /
R3, dodge Space / A. Keyboard codes are `KeyboardEvent.code` or `Mouse0`-`Mouse2`; pad
buttons are standard-mapping indices. **Every action also answers to its virtual code `'@<id>'`**:
the touch and gamepad layers press those (so a keyboard remap never moves a touch or pad button).
A rebind removes the code / button from every other action; an action left with nothing takes the
rebound action's old ones (a swap), so no action is ever unbound. Reserved, never bound: Esc, F1,
F2, F3, Backquote; the pad's Menu (9). Saved on every change; on load, junk and unknown actions are
dropped, a key stored twice keeps its first action, and a device left with an unbound action goes
back to its defaults. Defaults = the controls before ADR-067 (plus R as a second interact key).
**Key chips** (`ui/dom.js`): a `[@action]` token in `fillKeyText` (prompts, hints, title, menus)
becomes a chip showing the bound key, or the pad button while a pad is in use (`@move`, `@aim`,
`@zoom` are pseudo actions: WASD / LS, Mouse / RS, Wheel / the D-pad); `controlsGrid(parent, 'kb' |
'pad')` builds a device's grid from the same chips. `setChipSource({ bindings, padActive(), layout() })`
(the HUD) and `relabelChips()` (on a remap, a device switch, a pad layout change) keep them current.
**The CONTROLS panel** (`ui/remap.js` `RemapPanel`, `hud.remapUi`; the pause menu's CONTROLS item,
hidden on touch unless a pad is in use): tabs KEYBOARD · MOUSE / CONTROLLER (opens on the device in
use), one row per remappable action; pick a row, then press the key / mouse button / pad button.
`open()`, `close()`, `setTab(t)`, `begin(id)`, `cancel()`, `resetTab()`, `capturePad(i)`, `on`, `tab`,
`waiting`, `rows`, `navButtons`. Its window capture listeners (keydown, mousedown, click) swallow
the key being bound (`stopImmediatePropagation`: the game and the Lab never see it), Esc cancels a
pick or closes the panel (not the pause menu), the click that ends a binding mousedown is eaten.

### Gamepad controls — `src/ui/gamepad.js` exports `class GamepadControls` (ADR-066, ADR-067)
```
constructor(game)          // inert until navigator.getGamepads() reports a pad and it is used
active: boolean            // the pad is the device in use: its last input is newer than input.kbmT and input.lastTouch
connected; layout ('xbox' | 'ps', from the id: Sony's vendor id 054c); autoAim; focus (menu index)
actionText(a)              // the pad button bound to action a ('△'), or null when the pad is not in use
rumble([ms, strong, weak]) // dual-rumble on the pad; nothing where vibrationActuator is missing
update(realDt)             // main.js, after the mouse ray, before the touch layer / Lab / flow / player
```
Polls once a frame (the `standard` mapping preferred) and, for every action with pad buttons
(`input.bindings`), holds `'@<action>'` with `input.setPad` while one of its buttons is down, so tap vs
hold timings are the real device's. Play states (everything but `title` and `paused`):

| button (standard index), default binding | feeds | behaviour |
|---|---|---|
| LS (axes 0, 1), fixed | `setPadAxis` | radial dead zone `CONFIG.gamepad.deadZone` 0.2, full run at `runAt` 0.9; stick up = north |
| RB 5 / RT 7 | `@attack` | tap = light combo, hold = charge, release = the cleave (triggers 6 / 7: on ≥ 0.5, off < 0.3, whatever they are bound to) |
| LB 4 / LT 6 | `@block` | hold = block, tap = parry |
| A 0 · B 1 · X 2 · R3 11 | `@dodge` · `@sprint` · `@flask` · `@lockOn` | dodge · hold to sprint · flask · lock-on |
| L3 10 | `@sprint` | a stick click (10 / 11) bound to sprint latches it until the stick returns to centre |
| Y 3 · View 8 | `@interact` · `@help` | rest / fight again · help |
| Menu 9, fixed | `@pause` | pause (never remappable) |
| D-pad up 12 / down 13 | `cameraRig.zoom(∓1)` | the zoomIn / zoomOut bindings (pad-only actions) |

**Aim** (`explore` / `bossIntro` / `boss`, unless the touch controls are on): the right stick past
`aimDeadZone` 0.35 steers `game.mouseGround` `aimDistance` m ahead along it; idle, it auto-aims on the
boss's lock point within `autoAimRange` (32 m), else ahead along the last move direction.
**Menus:** `title` — any face / shoulder / trigger / Menu / stick-click button `input.pulse('Gamepad')`
(dismisses "press any key"); D-pad left / right walks `titleUi.stageButtons`, A on another stage
clicks it. `paused` — focus opens on RESUME, D-pad / LS up-down move it (repeat every `menuRepeat`
0.22 s while held), A clicks, B or Menu = `@pause` (resume). With the CONTROLS panel open: LB / RB
switch its tabs, the focus walks its rows + RESET + BACK, A picks a row (on the CONTROLLER tab the
next pad press is the new binding: `capturePad`; Menu cancels), B / Menu close the panel only.
Menu-screen buttons (A, B, D-pad, LB / RB, Menu) are fixed: a remap never changes them. **A button held across a menu ↔ play
change counts only after it is let go** (the title's A never rolls, the resuming B never sprints; likewise after any CONTROLS panel press);
the press that makes the pad active counts. Inactive (keyboard / mouse / touch used since): every
pad hold is released. A pad unplugged while active in a play state pauses the game.
`gamepadconnected` / `gamepaddisconnected` log a system line. **Rumble** (`CONFIG.gamepad.rumble`)
on `player:hurt`, `player:guardBreak`, `player:guardOpen`, `player:block`, `player:parry` (perfect stronger, a bullet
lighter), `player:perfectDodge`, `player:hitDragon` (not guarded: `hitHeavy`, else `hitLight`); only while active.

### Touch controls — `src/ui/touch.js` exports `class TouchControls`
```
constructor(game)          // inert (no DOM, no state) until activated: `pointer: coarse` at boot, ?touch, or the first touch
active: boolean;  phone: boolean   // phone = active and the short screen side ≤ CONFIG.camera.mobileMaxSide (600 px)
portrait: boolean;  autoAim: boolean
setActive(on)              // Lab "Touch UI", tests; off restores the desktop camera + quality + HUD
update(realDt)             // main.js, after the mouse ray, before the Lab / flow / player
```
A layer on top of `core/input.js`: nothing else reads it, the player and flow keep reading
`game.input`. Mapping (all through `input.setVirtual` / `setVirtualAxis`, so edges and tap vs hold
timings are the real device's):

| control | feeds | behaviour |
|---|---|---|
| stick (left thumb, floats under the thumb in the left 42 % × lower 74 %) | `setVirtualAxis` | analog: dead zone 0.16, full run at 0.62 of the 52 px travel; ≥ 0.94 (rim) holds `@sprint` (off below 0.86) |
| ATTACK (pad tile) | `@attack` | tap = light combo, hold ≥ 0.3 s = charge, release = the cleave; shows an ASCII charge meter `[###...]` |
| BLOCK (pad tile) | `@block` | hold = block, tap just before impact = parry; a gauge along its foot is the guard meter |
| DODGE (pad tile) | `@dodge` | roll / perfect dodge |
| FLASK (rides with the pad) · LOCK · PAUSE (glyph `\|\|`, both top right) | `@flask` · `@lockOn` · `@pause` | flask count, LOCK lit while locked on |
| the HUD prompt | `@<action>` from its `[@interact]` chip | rest at the bonfire / fight again |
| a bare-screen tap on title / death | `Mouse0` | "press any key" |
| two bare-screen fingers in play | `cameraRig.zoom` | pinch (distance × start / now) |

**The pad** (ADR-096; `CONFIG.touch.pad`; four tiles since ADR-115): ATTACK, HEAVY, BLOCK and DODGE are a
2 x 2 square, BLOCK | HEAVY over DODGE | ATTACK, each sharing an edge with the two beside it (ATTACK
bottom right), raised and inset from the corner. HEAVY carries the charge meter while it is held. The pad is one pointer surface (`.tc-pad`; the tiles
take no pointers themselves): a touch on it, or up to `reach` (26 px) outside the cluster, presses
the nearest tile, and a thumb that **slides** onto another tile releases the first and presses the
second without lifting (release edge first; it must leave its tile by `stick`, 10 px; a slide that
wanders further than `reach` from every tile keeps what it holds). Each finger holds its own tile.
The player places the cluster in the pause menu: PAD POSITION (low / mid / high: `pad.pos`) and
PAD SIZE (small / medium / large: `pad.size`), kept in `localStorage` (`abyss.touchPad`); the
controls show through the pause screen, inert, while they are stepped (`.tc-root.peek`). Screens
taller than 560 px get everything × `pad.tall`. API: `padPos`, `padSize`, `cyclePad('pos' | 'size')`,
`padPoint(id)` (the screen point at a tile's middle), `padGeo`.

**The page never zooms** (ADR-116): iOS Safari ignores `user-scalable=no`. While the layer is on it
cancels `gesturestart` / `gesturechange`, `dblclick`, `touchmove` (outside the Lab, the pause panel and
the WHAT'S NEW list, which scroll) and `touchend` on the canvas and inside `.tc-root` (non-passive): the
canvas and the controls run on pointer events only. Anywhere else (the menus) the second of two
touchends within `DOUBLE_TAP_MS` (350 ms) is cancelled too and a `button` / `.ab-btn` under it gets its
`click()` by hand. If the page is zoomed anyway (`visualViewport.scale` > 1.01), `_unzoom()` rewrites
the viewport meta (Safari lays the page out at scale 1 again; counted in `unzooms`). `?camdebug`: a
fixed one-line readout (`.tc-camdebug`): page scale, fixes, camera distance and base, canvas vs window size.

**Aim** (`game.mouseGround`, each frame in `explore` / `bossIntro` / `boss`): with the dragon
targetable and within `CONFIG.touch.autoAimRange` (32 m) it is the dragon's lock point (attacks,
facing and the camera look-ahead go to it, like a cursor parked on it); otherwise it sits
`CONFIG.touch.aimDistance` (6 m) ahead of the hero along the last stick direction. LOCK still toggles
the real lock-on. Controls show only in play states (hidden on title / pause / death / victory /
model viewer); hiding releases every held control. **Portrait** (`innerHeight > innerWidth`;
ADR-097): the game plays on. `portrait` is true, the stick's zone is the lower left (50 % × 46 %),
the pad takes its place from `pad.posPortrait` (low / mid / high, lifted from the bottom edge),
the stick rests level with it, and the camera takes the upright profile
(`cameraRig.setMobile(phone, portrait)`). Turning the phone releases every held control.
**Look** (ADR-097): the controls are drawn on the game, not over it: no filled panels, faint
outlines and glyphs at rest (stick 40 %, buttons 62 %), full strength under a thumb. Activation
also: `html.abyss-touch` (touch-action none, no callouts, crisp `image-rendering: pixelated`),
`.ab-touch` on the HUD, the phone camera profile, and `CONFIG.defaultQualityTouch` when the
quality is still the default. Pointer Events with multi-touch (each control captures its own
pointer); long-press menus, iOS gesture zoom and page panning are blocked while active (the Lab
panel and the pause panel still scroll). Tuning: `CONFIG.touch`, sizes / look in `ui/touchStyle.js`.

## Destruction (2026-11-14, ADR-107; the clearing breaks: 2026-11-15, ADR-119; the whole forest wears down: 2026-11-16, ADR-120; the duel arenas and their floors: 2026-11-16, ADR-122): the world breaks
Files: `src/world/destructibles.js`, `wreckage.js`, `fire.js`, `scars.js`, `floor.js`, `breakTuning.js`. Every boss
and the hero chip, break, fell and burn what stands in a level; cover stops projectiles until it gives
way; a boss can lift a piece and throw it; what falls lies as wreckage until the fight resets. The rules
as the player meets them: COMBAT.md "The world breaks". Numbers: `world/breakTuning.js` (`BREAK`,
`FIRE`, `SCAR`, `BLOW`, `QUALITY`; `BREAK.floor` and `BREAK.colossus` since ADR-122).

**POWER** is the one scale every blow is put on (0 a touch … 1 fells a tree): 0.12 a quick cut, 0.3 a
duelist's cut, 0.5 a heavy cut, 0.8 a claw or the hero's charged cleave, 1.0 a tail / slam / thrown
stone, 1.5 a meteor or a bolt of the Void, 2.5 the dive's crash. A piece loses power x its material's
factor for that kind of blow (`BREAK.mats[mat].take[kind]`: a cut bites stone at 0.7, a blunt blow or a
blast in full); below `BREAK.scratch` it only takes a mark. A **brush** (`o.brush`: a boss's body
walking, turning, shouldering into a piece) only bites with what it has over `BREAK.brush` 0.55 x the
piece's structure, but at least `brushMin` 0.4 of itself (a body that keeps pushing still fells a tree
in a couple of seconds; a turn only shakes it), once per `brushRehit` 0.3 s, and a flat stone (a
flagstone, lower than `brushFlat` 0.3 m) takes nothing from it.

**A set's `breakables`** (built in the set builder; `forest.js` and `courtyard.js` are the examples). One entry:
| field | what |
|---|---|
| `kind` | 'tree', 'deadTree', 'stone', 'boulder', 'pillar', 'lantern', 'stele', 'bell', 'flagstone', 'bone', 'helm', 'sword', 'elderRib', 'elderSpine', 'cinderBough', 'cinderTrunk', 'nestRib', 'nestSkull', … (free; boss AI and tests read it) |
| `mat` | 'wood', 'stone', 'metal' or 'bone' (structure, what bites it, its debris and sound) |
| `look` | 'grid' (geometries with `paint()` attributes: the screen grid), 'prop' (`carve()` attributes: prop art) or 'range' (its body is a run of vertices in a static mesh of the set, drawn by the set's own material: the flagstones; since 2026-11-16 every tree of Cinderwood, the Cinder Tree's boughs and trunk, the Elder Wyrm's bones and the nest's ribcage and skull) |
| `x, z, r, h` | its base (world), footprint radius, height (`geosHeight(geos)`) |
| `geos` | its geometries in WORLD space, as the builders return them (the system moves them to the base) |
| `range` | look 'range' only: `{ mesh, start, count, parts?, leaf? }`, the vertices (non-indexed, world space) of its body in the set's merged mesh; hidden by folding them under the ground. `parts`: the vertex counts of its parts in order (a tree's trunk, then each crown blob or bough), the pieces it drops as it wears down; `leaf`: per part, 1 = foliage (its debris is leaves). `forest.js` `Runs.add(geos, leaf?)` hands these out and `finish(extra, material, name)` merges the mesh (positions and normals `DynamicDrawUsage`) |
| `colliders` | the `Colliders` circles it stands on (`colliders.add` returns them): taken out when it goes, put back on reset. The circles of breakable wood are marked `soft` (the wyrm's body passes through them) unless `soft: false` |
| `soft` | false: its wood colliders stay hard (the Cinder Tree's trunk turns the wyrm like stone) |
| `broken` | `{ geos \| range, look?, r? }` or absent: what is left standing (`buildStump`, `buildRubble` in forest.js, `buildCinderStump`); r = its own smaller collider |
| `hp` | structure in POWER units (default: the material's x its size x `hpK`); `Infinity` = it only chips (the bronze bell) |
| `hpK` | multiplies the default structure (a tree of the wall: `BREAK.wall.hp` 1.15) |
| `wear` | `{ order, cut }`: it wears down in stages (a 'range' piece with parts; see "Wearing down"): `order` the parts it drops (never 0, the trunk), `cut[k]` how many of them are gone by stage k + 1. `forest.js` `wearOf(type, n)`: a pine [2, 3] (its top two tiers, then all but its skirt), a dead tree a third and two thirds of its boughs, an oak 0.4 and 0.8 of its crown |
| `wall` | true: a tree of the wall round the clearing (beyond `BREAK.wall.from` 32 m; below) |
| `guard` | the definitions of the pieces that must go first: while one of them stands it takes `BREAK.guarded` 0.2 of a blow (the Cinder Tree's boughs guard its trunk) |
| `digits` | true: its debris and marks print in prop art's digits (a landmark's bones and boughs; default for look 'prop') |
| `topples` | it falls over when it breaks (default: h >= `BREAK.topple.minH` 2.2 m); otherwise it shatters where it stands |
| `burns` | fire lights it (default: the material's; wood) |
| `cover` | it stops projectiles (default: h >= `BREAK.cover.minH` 1.1 m) |
| `lift` | 0 nobody can lift it, 1 a boss's body can (the wyrm: trees, boulders), 2 only the Void (stones, pillars, lanterns), 3 a floor slab: only a move that asks for floor takes it (`nearest` / `floorNear` with lift 3; the wyrm's and the Void's choices never see it) |
| `leafy` | 0..1 share of its debris that is leaves |
| `wreck` | false: it leaves no wreckage (default: a felled tree leaves its trunk, a stone its rubble) |
| `floor` | true: a slab of a floor (ADR-122; `BREAK.floor`; look 'range'): a blow's power falls off from its centre (full within `core` 0.8 m, `rim` 0.35 of it at the edge; a blow drawn ALONG the floor bites at `sweep` 0.6), one sound per blow for all the slabs it strikes, no camera shake, no nicks, fewer chips (`debris` 0.45); structure `hp` 0.85, a big plate (over `big` 5 m²) `plate` 1.3; `lift` 3. `world/floor.js` `breakableFloor({ slabs, slabGeos, slabMesh, mat, rng, group, earth, look })` makes a set's paving into such pieces |
| `cracked` | `{ range }`: a floor slab's cracked look (two to four pieces over a dark seam), shown once its structure is under `BREAK.floor.crack` 0.8 of itself (`piece.cracked` true); `broken.range` is its broken look (`?floor=a` rubble on printed earth, `b` heaved shards: `floor.js`). Each look is one more merged mesh of the set's carved material, hidden until its first slab shows (an intact floor costs no draw call more) |
| `holds` | a two-stage piece (a colossus's legs): the def of the piece standing on it. While that one stands, every blow on this one goes to it (`piece.top`; the upper half's `piece.base`); while it falls this one takes nothing (`BREAK.colossus`: top 6, legs 4.5, weight 2.2, fall 1.4 s, off 1.6 m, blocks 4) |
| `y0` | the height its node stands at (a colossus's upper half: it falls from its cut, coming down to the ground as it goes over) |
| `fallOff`, `fallT` | m out from its base where a felled piece starts to land (its strip starts there), s it falls |
| `blocks` | how many big carved blocks of wreckage it leaves (a statue's) instead of a rubble pile |
| `cy` | (a crater's hanging stone) its height in the air, exact (ADR-122; the Lord's effects read it) |

A set draws its stumps, rubble and any breakables it adds from an rng stream of its own, so the rest of
its layout does not move. Budget: each breakable that is not a 'range' piece is 1–2 bones of the rigid
batch (1023 in all), plus the wreckage pools' bones; a 'range' piece takes none. Today (world.mjs SETS /
BUDGET, 2026-11-16, after the merge of ADR-120 and ADR-122): the forest lists 664 (tree 502, dead tree 37,
stone 10, boulder 20, flagstone 26, bone 4, helm 5, sword 3, the nest's 14 ribs and skull, the Elder
Wyrm's 36 bones: 18 ribs, 10 runs of the spine, the hip, the mast, the fingers, the fallen wing, the
skull, the jaw, 2 horns; the Cinder Tree's 5 boughs and trunk; it was 183 on 2026-11-15) and takes 228
bones, 409 with the wyrm; the courtyard 456 (it was 78: flagstone 293, pillar 30, lintel 1, lantern 4,
stele 1, bell 1, stump 32, deadTree 80, boulder 9, cauldron 1, colossus 4: two colossi of two pieces) in
443 bones; the throne 222 (it was 36: plate 81, flagstone 24, shard 25, slab 27, rubble 20, vent 4, log
35, hover 6) in 299 (ADR-120's bigger log and char pools are built in every set: +42 bones in each arena).
**Every tree of Cinderwood breaks**, out to the forest's edge (74 m; it was those within 42 m), and the
Elder Wyrm's skeleton, the Cinder Tree and the nest break in pieces (ADR-120 reverses ADR-119's "they
stay whole"); the bonfire stays whole. In `forest.js` the trees and the Cinder Tree are runs of the
`trees` mesh, their stumps runs of a `stumps` mesh (drawn only while one shows: `userData.autoHide`),
the landmarks' bones runs of the `props` mesh; each landmark tag group (`userData.piece`) is one piece,
and each of `ELDER_COLLIDERS` goes with the piece whose footprint is nearest. Their structure is
`BREAK.landmark` (rib 2.8, spine 3.2, skull 6, jaw 3, horn 2, hip 3, mast 2.6, fingers 1.6, wing 2.2,
bough 2.6, trunk 7, nestRib 2.6, nestSkull 5); none of them topples, lifts, stops a projectile (but the
Cinder Tree's trunk) or leaves logs and rubble (`wreck: false`). The Cinder Tree's boughs go first
(they burn too; `leafy` 0.25); its trunk (collider 3.0 m, `soft: false`, `guard`: the boughs, weight
2.2) breaks where it stands and leaves `buildCinderStump` (collider 2.3 m). Cinderwood's flagstone shard
mesh is hidden until a flagstone breaks (`userData.foldAway`: one draw call fewer). **Everything but the
landmarks breaks in the two duel arenas** (ADR-122): the courtyard keeps the sect gate, the bell (it only
rings) and the bonfire whole, the crater the throne and its dais, the fallen star, the seal and the
bonfire. The colossi's, the cauldron's and the lintel's geometry moved out of the set's static mesh into
the breakables. `THRONE.vents` is exported (the Lord's effects read the vents' places); a vent's ring of
stones is a breakable 'vent' and the vent flares as it breaks.

**`world.destructibles`** (`class Destructibles`; `STATE` = INTACT 0, FALLING 1, BROKEN 2, HELD 3, FLYING 4, GONE 5):
- `list` (every breakable: `{ id, kind, mat, x, z, r, h, hp, hpMax, state, weight, burn, lift, cover, topples, floor,
  cracked, top, base, … }`), `floor` (the floor's slabs: pieces with `floor`), `standing`, `wreckage` (pieces of
  wreckage lying now), `burning` (pieces and logs alight now), `active`, `root` (under the set's group: only the
  rigid batch's draw meshes), `pieces`, `batch`, `wreck` (the `Wreckage`).
- **The pieces live outside the scene graph** (2026-11-16: the arenas' 456 / 222 pieces cost a phone about
  0.7 ms a frame in three.js's matrix walk): their nodes, pivots and meshes hang in `pieces`, a tree that is not
  in the scene and does not auto-update; only the batch's draw meshes hang in `root`. `_place(b)` recomputes a
  piece's world matrices whenever it moves (a break, a shudder, a fall, a carry, a throw, the reset). A 'range'
  piece (a floor slab, a tree of Cinderwood, a landmark's bone or bough) has no node in that tree: it moves by
  rewriting its vertices (`_pose`, "Range pieces" below); a floor slab joins the tree only when a boss lifts it, and in his hands it shows as one of
  `BREAK.floor.carry` 6 blocks of prop art, a chunk about 0.85 m across (a crater plate's 1.2 x), never the
  whole slab.
- Every query walks a **spatial grid** (`BREAK.grid.cell` 4 m), not the whole list.
- `strike(x, z, r, power, o)` → how many it struck: a blow or blast over a disc.
  `sweep(ax, az, bx, bz, r, power, o)`: along a segment (a blade's edge, a dash, a body part's step).
  `sweepRec(w, o)`: the same with the segment in a reused record `{ ax, az, bx, bz, r, power }` (no
  numbers boxed per call: the wyrm's body sweeps a dozen spheres a frame).
  `o = { kind, by, dx, dz, y, src, only, falloff, brush, spare, incidental, down }`: kind = `BLOW.CUT / BLUNT /
  BLAST / FIRE`; by = 'player', 'boss' or 'world'; dx, dz = the blow's way (a piece falls along it;
  default: out from the disc's centre, or along the segment); y = its height (a blow above a low piece
  passes over); src = one id per swing from `swing()` (a piece takes a blow once per id; without it,
  once per `BREAK.rehit` 0.18 s); only = just that material ('wood': the wings' wind); falloff 0..1 =
  `strike` is weaker toward its rim (× 1 − falloff there; `TUNING.world.falloff` 0.6 for the wyrm's
  ground blows); brush = a body walking (above); spare = one piece to leave alone; incidental = skip
  reserved pieces; down = a sweep that comes DOWN on the floor (a falling piece's strip): a floor slab takes it in
  full, not at `BREAK.floor.sweep`. A blade's blow struck at y = 1 passes over a 0.08 m slab; arcs, landings,
  spells and falling pieces reach it.
- `reserve(piece, sec = 1)`: incidental blows leave it alone for `sec` s (a terrain move's chosen piece).
- `stop(ax, az, bx, bz, r, power, o)` → the piece or null: a projectile's step; the first cover on it takes
  `power` and is returned (the caller ends its projectile). `coverAt(ax, az, bx, bz, r)` → the first cover
  on a segment, no damage (`coverT` 0..1: where).
- `ignite(x, z, r, k)` → wood in the disc catches (and logs lying there), within the cap on fire that
  lands (`BREAK.light`: at most `perSec` 0.12 new fires a second banking `bank` 3, and only while fewer
  than `maxBurning` 6 × the quality factor burn; past it the grass still burns and the wood is only
  scorched). Alight it burns `BREAK.burn.time` × k, then falls to embers and its stump; its light is a
  local glow (`burn.glow`: 5 m, shared by a piece that catches within `share` 8 m of one already lit,
  at most `burn.lights` 4). **Fire spreads** (`BREAK.spread`; it reverses ADR-107's "it never
  spreads"): a piece alight `after` 2.2 s tries every `every` 1.1 s to light one unburnt wood piece or
  log within `reach` 5.2 m (+ both radii), with `chance` 0.45; at most `maxBurning` 7 × quality alight
  at once, a level-wide budget of `perSec` 0.25 spreads a second (banking 2), and a fire passes on at
  most `gens` 2 times from where fire landed. These caps count only the fires inside the clearing:
  **the wall burns on budgets of its own** (`BREAK.wall.fire`, 2026-11-16, ADR-120): fire that lands
  on a wall tree `perSec` 0.15 a second (banking `bank` 2), at most `maxBurning` 6 × quality alight in
  the wall at once; a wall fire spreads only into wall trees, `spreadPerSec` 0.08 × quality a second
  (banking `spreadBank` 2) with `chance` 0.45, and `BREAK.wall.gens` 0 more generations than the
  clearing's. A tree that burns through chars the ground `BREAK.burn.char` 2.2 m round its trunk.
- `wind(x, z, power, reach, o = { from, fall })` → how many trees the front will reach (2026-11-16,
  ADR-120): a front of wind rolls out at `BREAK.wind.speed` 30 m/s (a queue of up to `queue` 1400 trees
  in preallocated typed arrays); each standing WALL tree it reaches (beyond `o.from` m of the centre)
  takes power × (1 − d / reach)^fall (`o.fall`, else `BREAK.wind.fall` 1.3) × the blast factor, × 1 ±
  `vary` 0.45 at random, nothing under `min` 0.04, at most once each `rehit` 0.35 s, never below
  `floor` 0.3 of its structure (wind takes a tree to its second stage at most, never to its lean or its
  fall), shudders and loses a few leaves (`leaves` 5 × the power). The clearing's pieces are untouched.
- `carryFire(ax, az, dx, dz, len, k = 1)` → the piece or null (2026-11-16, ADR-120): along the ray the
  first standing wall tree that burns, 1.5 m or taller, within `BREAK.wall.fire.width` 1.2 m (+ its
  radius and leaves) catches for `BREAK.burn.time` × k on the wall's budget (past it: a scorched disc);
  it passes over the clearing's pieces. `_carryHit` `{ x, z, piece }` holds where it met it.
- `stat` `{ wind, windTrees, carry, reached, lit }`: counts since the reset (the tests' wall report).
- `nearest(x, z, { maxDist, minDist, lift, kind, mat, from: { x, z, min } })` → the nearest intact
  piece or null (lift: at most that class; floor slabs only with lift 3).
  `floorNear(x, z, r, out, { kind, whole, max })` → how many intact floor slabs lie within r of (x, z), nearest
  first, written into `out` (cleared first; kind 'flagstone' | 'plate'; whole: not cracked): what a floor move
  can tear up there.
- Lifting and throwing (a boss's move): `take(piece)` → true: it is HELD (no collider);
  `carry(piece, x, y, z, tilt, yaw)` every frame while held (the wyrm flies its thrown pieces this way);
  `throwTo(piece, tx, tz, { time, power, radius, by, onLand(piece, x, z, radius) })` → it flies there
  end over end, smashing what stands in its way while it flies under `BREAK.flight.y` 7 m (power
  `BREAK.flight.power` x its weight), and bursts: a blast on the other pieces, a scar, its wreckage,
  and `onLand` for the thrower's own blow at the hero (the move's tell is the thrower's: the world
  deals nothing to the hero for a thrown piece); `drop(piece)`. `topple(piece, dx, dz, by)`: fell it
  that way.
- `setQuality(k)`, `reset()`, `update(dt)` (world.js calls it).
- A felled piece falls for `BREAK.topple.time` x sqrt(h / 5) s and lands on a strip h long: other pieces
  under it are struck. Under a piece a boss (or the world) felled, the HERO takes one red blow
  (`BREAK.topple.damage` x weight, unblockable, knockdown; i-frames dodge it; never a perfect dodge), with
  combat:tell at the start, combat:flash 0.3 s before it lands and the strip marked in red glyphs. Under a
  piece the HERO felled, the BOSS takes `boss.takeHit({ damage: BREAK.topple.bossDamage x weight, exact,
  heavy, posture })` (tested against `boss.bodyCircles`), and the hero is never hit by his own. A fall
  whose strip cannot reach the hero's bound (`CONFIG.world.playerBound`) is **quiet** (2026-11-16,
  ADR-120): no tell, no flash, no strip, no hero test.

**Wearing down** (2026-11-16, ADR-120; `BREAK.wear`): a piece with stages (`def.wear`) drops its parts
as its structure falls: at each share in `at` [0.82, 0.5, 0.22] it reaches the next stage (1 outer
crown parts gone, 2 half the crown, 3 it leans `lean` 0.32 rad × 0.75 – 1.25 along the blow over
`leanTime` 0.6 s), then it falls from its lean. A dropped part bursts into the glyphs it is drawn in
(leaves, splinters, a landmark's digits; `debris` 14 glyphs per metre of its size × quality, 8 – 44)
from a level-wide debris budget (`BREAK.debris` 1500 glyphs / s, banking 900, × quality). A stage
reached emits `world:impact` kind 'wear' (power = the stage, 1 – 3; audio's quiet `wear` sound). A
burning tree drops its crown with charred leaves and a few sparks, all of it gone by `burn` 0.85 of its
burn. At most `shakeMax` 10 × quality range pieces shudder at once (their vertices are rewritten every
frame); the rest only chip. **The wall** (`BREAK.wall`): a tree beyond `from` 32 m has `hp` 1.15 × the
structure of a tree its size, falls with at least `out` 0.55 of its way pointing out of the arena (a
leaning one the way it leans, which was turned outward when it leaned), and where it lands strikes the
trees behind at `domino` 1.4 × its weight (0.7 elsewhere).

**Range pieces** (`RangeBody`, internal): its `visible` folds or restores its whole run; `show(i, on)`
drops or restores part i; `pose(q, px, py, pz)` turns it by a quaternion about its base and moves it,
rewriting positions (and normals) from a home copy, so a tree shudders, leans, falls, is carried and
flies without a bone of the rigid batch. Writes are queued and uploaded once a frame, one update range
per body: `flushRanges()` (exported; `Destructibles.update` and `reset` call it). `reset()` rewrites only
the pieces that were touched. No allocation after the build.

**`world.destructibles.wreck`** (`class Wreckage`, `wreckage.js`, 2026-11-15; it reverses ADR-107's "a
felled trunk comes apart where it lands"): what the fight leaves lying until it resets. A felled tree's
trunk lies where it fell (`BREAK.wreck.trunk` [0.5, 0.85] of its height, a crowned tree / a bare one),
a broken stone or boulder leaves a rubble pile, burnt wood lies black and smoulders (`smoulder` 30 s, at
most `smoulderMax` 8 × quality at once), a thrown piece leaves its remains where it lands. **Scenery: no
collider, it stops nothing, the hero walks over it.** Pools of prop-art meshes built once and batched
with the breakables (no draw call of its own): `logs` 64, `chars` 36, `rubble` 30, `bones` 48 (2026-11-16,
ADR-120: heaps of bone shards in the bone's own hue; every broken bone piece 0.4 m or taller leaves one
where the most of it came down, even a landmark's with `wreck: false`; `rubble(x, z, r, M)` with
`M = BREAK.mats.bone` takes a heap); past a pool's share
(× quality) the oldest sinks into the ground in `sink` 1.4 s, past its size the oldest crumbles at once.
A log can burn (`burn` 6 s; it fell burning, fire landed on it, or the spread reached it) and burns the
hero beside it like a burning tree; a burnt-through log emits `world:impact` 'burnout' with `id` -1.
Two more kinds since ADR-122 (`KIND` LOG, CHAR, RUBBLE, BONES, BLOCK, SHARDS; the bones, blocks and shards pools
are only built for a set that needs them: bone pieces, a statue, a floor that can be thrown): `blocks` 12, big carved blocks (a colossus's stages, where its upper half lands and its legs),
and `shards` 16, flat shards (a floor slab torn out, where it is thrown).
API (internal to destructibles): `log(x, z, dx, dz, len, r, burn, charred)`, `rubble(x, z, r, M)`,
`block(x, z, r, M)`, `shards(x, z, r, M)`, `ignite(x, z, r, k)`, `count`, `burning`, `live`, `update(dt)`,
`reset()`.

**`world.fire`** (`class GroundFire`, on the scorch map's grid): `ignite(x, z, r, k)` → cells lit (grass
density >= `FIRE.minFuel`, not ash, not alight), `burning(x, z)` → s left, `touch(x, z, r)` (a burning piece
burns the hero beside it), `hush(x, z, r, sec = 0.3)` (a live fire body covers the disc: the grass's
flames under it burn at `FIRE.hush.k` 0.45 of their heat, smaller and lower, for `sec` s; the wyrm's
breath calls it every frame along its cone, so the two fires do not add up into white knots; at most
`FIRE.hush.slots` 8 discs), `count`, `reset()`. A grass cell burns `FIRE.life` s and is ash after: grass
fire never spreads and nothing catches twice (wood spreads: above). One local light per blaze
(`FIRE.glow`: radius min(6, its radius + 2) m, intensity 1.5; it was r + 6 m at 2.2). The hero in it
takes `FIRE.damage` every `FIRE.tick` s after `FIRE.grace` (blockable contact ticks, skipped while he
rolls or is invulnerable, like a burning crater).

**`world.scars`** (`class Scars`: glyphs that stay until the reset, one batch): `ground(x, z, power, dx,
dz)` (a star of cracks; power >= `SCAR.ground.min`), `crater(x, z, r, power)` (a rim of thrown-up
earth), `object(owner, x, y, z, power, M)`, `rubble(x, z, r, M, n, glyphs)`, `drop(owner)`,
`setQuality(k)` (at most `SCAR.max` 520 × k marks, never under 60), `reset()`, `count`. At the cap the
oldest `SCAR.evict` 0.15 of the marks go in one step (one rebuild of the batch, not one per mark).

**`world.impact(x, z, r, power, o)`** = `destructibles.strike` + a floor scar and torn grass for a hard blow
(`o.scar: false` skips it) + a **crater** for a blow of `SCAR.crater.min` 1.2 or more (`scars.crater`
and a charred disc of radius min(r, 1.2 + power × 1.1) m) + `ignite` when `o.fire` is set.
**`world.ignite(x, z, r, k, grass = true)`** = `fire.ignite` (unless grass is false: sweeping fire and
the ground tongues light wood only) + `destructibles.ignite`. **`world.resolve(pos, radius, bound,
soft = false)`** → `Colliders.resolve(pos, radius, bound, soft)`: `soft` passes through the circles
marked `soft` (the wyrm's body). **`world.setQuality(k)`** (0.3 .. 1; `setGrassQuality` sets it from the
quality preset: `QUALITY` LOW 0.5, MEDIUM 0.75, HIGH 1) scales the debris glyphs a break throws, the
flames of burning wood, the wreckage lying at once, the fires and smouldering logs and the marks that
stay (`destructibles.setQuality`, `scars.setQuality`). `Colliders` has `remove(c)`, `restore(c)` and a
`version` that counts every change of the set (the minimap re-bakes its layer on it, so a felled tree
leaves the map). **`world.restore()`** resets all of it (the pieces, the wreckage, the fire, the
scars): flow calls it wherever it resets the scorch map; the Lab's Reset and its WORLD section (Burn
ahead, Fell on me, Blast ahead, Restore) too.

**Who hits the world** (each through `?.`; one `src` per swing or action):
| who | where | numbers |
|---|---|---|
| the hero | `player.js` `_cutWorld` (the blade's segment, every active frame), `_slamImpact` | power = the attack's damage / 110; a heavy cut is a BLUNT blow; a felled piece falls away from him |
| the wyrm | `attacks.js` `sweepHit` (every striking part), stomp / leap / hop / the slams (`GROUND_BLOW`, with falloff); `fireAttacks.js` dive and nova; `fx.js` `_landed` (fireball, meteor, lava pillar) and the breath / strip / ring / wall igniting; `skyFx.js` the meteors' impacts; `bullets.js` (cover; a landing ember; the tongues lighting wood); `terrain.js` (a flying piece's `sweep` on its path, its blast where it lands, `throwTo` for the skid; a batted one: `stop` on the cover in its way; a firebrand: `world.ignite`); `dragon.js` `_wreck` (its body's spheres, the wings' blasts, the landing); `wallReach.js` (`wallWind` → `destructibles.wind` from the roars, the shock ring, `groundShock`, the wing buffet and sweep, the take-off, the landing, low downbeats; `carryFire` → `destructibles.carryFire` from the breath, the strip, flame rings and walls, missed shots; ADR-120); `ablaze.js` (phase 3: `world.ignite(..., false)` from a burning part, the scorch map under its feet) | `TUNING.world` (`melee`, `stomp`, `leap`, `hop`, `dive`, `nova`, `falloff`, `explosion`, `meteor`, `pillar`, `body`, `takeoff`, `landing`, `downbeat`, `ignite`, `bullet`, `wind`, `carry`; `meter`: the WRECKAGE scenario's bounds, with `wall` [0.3, 0.75] and `wallP1` 0.03: the share of the wall's front rows, 32 – 46 m, worn or down at the end and by phase 1's end); `tuningAblaze.js` `ABLAZE.wood` |
| a duelist | `brain.js` `_worldBlow` (a beat's zone at its impact) and `_coverFor` (a bolt, the pull, the grip meet the cover the hero stands behind: `beat.cover`); `duelist/fx.js` crescents and the push; `starlessLord/fx.js` thrown stones, the blade, strikes, the crush; `starlessLord/spells.js` the wheeling blade, the weather's strikes, Starless Night's waves; `ashDisciple/moveFx.js` burning ground (`world.ignite`); both `terrain.js` (`take` / `carry` / `throwTo` / `topple`, `floorNear` for the floor moves) | `duelist/worldTuning.js` `DUEL_WORLD` (an actor's `T.world` overrides fields) |

**Drawing.** `createAsciiObjectMaterial` and `createPropArtMaterial` place each vertex with
`rigidMatrix()`; built with `rigid: true` they are tagged for `batchRigid` (a set's static materials are
not, so an actor's batch never picks them up). The breakables' two materials are twins of the set's (the
prop twin takes the set's `uGain`): one draw call each however many pieces there are, plus one in the
shadow pass; the wreckage's pools ride the same batch. A 'range' piece (a flagstone, a tree of
Cinderwood, a landmark's bone or bough) stays in the set's own mesh: it is hidden by folding its
vertices under the ground and moved by rewriting them ("Range pieces" above). Debris, dust, the danger
strip and the scars are glyph particles (a wearing crown's in the canopy's dim hue, a bone's in its own
dull hue; destructibles.js `SHED_LEAF`, `SHED_WOOD`, `SHED_BONE`); the flames of burning wood and logs
are heat in the fire field.

## Levels and the boss slot (2026-11-12, ADR-058, ADR-060; the Starless level: ADR-068 – ADR-070)
`src/levels/index.js`: `LEVELS` (Cinderwood `cinderwood`, Ashfall `ash`, the Obsidian Throne
`starless`), `DEFAULT_LEVEL`,
`withStage(level, search)` (`?stage=lab`: the same level on the training
room, `world/trainingRoom.js` `createTrainingRoom` / `ROOM_WORLD`; main.js wraps the level with it
before `applyLevel`; ADR-099), `getLevel(id)` (id or alias, case-insensitive), `levelFromSearch(search)` (`?level=`; unknown → the
default), `applyLevel(level)` (merges `level.world` into `CONFIG.world`: main.js calls it once,
before building any module), `levelUrl(id, href)`. One level per page load; switching reloads.
A level: `{ id, aliases, name, sub, world, buildSet(U, colliders), createBoss(game), text }`.
- `buildSet` returns createForest's shape (`group, treeSpots, bare, slabs, nest, bonfire, material,
  stoneMaterial, slabMaterial`) plus, optionally, `breakables` (what can be chipped, felled, burned and
  thrown: see Destruction above; a set lists those pieces there INSTEAD of merging them into its static
  meshes), `scarInk [r, g, b]` (the colour of cracks in its floor), `ash: true` (atmosphere: falling ash flakes and a
  few embers instead of fireflies, mist and leaves) and `grass: { density(x, z) → 0..1 factor,
  height (×), ash 0..1 }` (world.js thins / shortens / greys the meadow; grass.js `uAsh`).
  A set may also bring its own night and weather (ADR-070; the Obsidian Throne's set does):
  - `sky: { moonColor, moonDir, ambient, fogColor, fogNear, fogFar }` (all optional): world.js writes
    it into the shared uniforms once, right after the set is built.
  - `ambience: { setup(game), update(dt, game), ... }`: atmosphere.js calls `setup` once (lights,
    its own particle batch: `game.pipeline.registerParticles`) and `update` every frame INSTEAD of
    the fireflies / mist / leaves / ash (the bonfire's flames stay). The Obsidian Throne's also has
    `flare(k)`: its floor seal brightens and settles (the boss calls it; optional for callers).
- **The Obsidian Throne's set** (`world/throneHall.js`: `createThroneHall`, layout `THRONE`; ADR-112;
  the names are from the hall it replaced). An open crater: a disc of plates `THRONE.R` 15 m round the
  seal (the origin), the dais from `daisZ`, the seat at `throne`, the fallen star at `star`, the south
  lip at `entryZ`, the bonfire at `bonfire`. `THRONE.floor = { r, zN }` is where the boss may stand:
  the level puts `r` into `world.dragonBound` (the duelist's circle; the Lord's `TUNING.bound` is the
  same number) and `zN` into `world.bossFloor = { zN }` (the dais's line: `StarlessLord.clampTarget`
  reads it; a level or stage without `bossFloor` has no such line). Its breakables: 'shard' (the
  star's glass in the floor and on the rim), 'slab' (the rim's tall plates) and 'hover' (six stones
  hanging in the air: no collider, `cover: false`, `hp: Infinity`: they only chip); all `lift: 2`.
  A hanging stone's geometry is built ON THE FLOOR and its entry carries `hover` (m): the set's
  ambience lifts the piece's `body` by it while the piece is INTACT, and whoever takes the stone
  sets `body.position.y = 0` and carries it from `hover` up (a piece lands where its pivot meets the
  ground: ADR-109).
  Three rng streams: the layout (the picked render's sequence: add nothing to it), the rubble broken
  pieces leave, and anything added later.
- `text`: `arrive[]`, `stir`, `phase2`, `phase3`, `phase4` (null / absent: no banner), `victory`,
  `fallen`, `restReset`, `again`, `rise` (GameFlow `_text(key)`; Cinderwood's lines when the game has
  no level).
- **The boss slot.** `game.dragon` (=== `game.boss`) is the level's boss. Every consumer (player,
  HUD, flow, camera, audio, name tags, minimap, touch aim, Lab) reads the Dragon contract's surface
  below and listens for the `dragon:*` events, so a boss offers: `name` (the HUD splits it at the
  comma: ui/bossName.js), `state` (`sleeping|waking|combat|staggered|airborne|dying|dead`), `hp,
  maxHp, phase, phaseAt, nextPhaseHp, posture, maxPosture, broken`, `hurtSpheres`, `bodyCircles`,
  `position, yaw, object3d, batch`, `isTargetable()`, `lockPoint(out)`, `startIntro()`, `takeHit(o)`,
  `onParried(info)`, `reset()`, `update(dt)`, `debug` (the Lab's generic shape). Optional
  `drawnPoint(v)` (+ `drawScale`): maps an upright gameplay point (a hurt sphere's centre) to where it
  is drawn (the lean, the drawn size, a drawn-only offset), in place; the hero's landed cut is drawn
  where his drawn blade meets those drawn spheres (absent: identity, the wyrm). A plunge target adds
  `plungePoint` / `onPlunge` (the wyrm); a **duelist** (`kind: 'duelist'`) instead offers
  `onExecute({ damage })` and `execRange` (the execution thrust, Player below) and gets no creature
  voice (audio.js gates roars, pain and recoil yelps on `kind`). A boss with **several health bars**
  offers `lives: { total, left }` (the Starless Lord's blade forms): `hp` / `maxHp` are then the
  CURRENT bar, the HUD draws one pip per bar, and the execution's call-out reads DEATHBLOW.

### Duelists — `src/entities/enemies/duelist/` (ADR-068; the second pass: ADR-122)
The engine every human boss runs on (the Ash Disciple, the Starless Lord); a boss is a KIT of data and
a subclass with a few hooks.
- `duelist.js` `class Duelist(game, kit)`: the boss slot's surface, the guard, posture, the break and
  the execution, the deflect chain, the blade lock, the mikiri, the full deflect, hit stun, `hitPlayer`.
  `kit = { id, TUNING, MOVES, MOVE_NAMES, CLIP, realise, transitions {phase: move}, counterMove(phase),
  maxPhase, loadout, poses, blade {guard, tip}, scale, REACT, OPEN, dress }` (`dress(d, dt)`: ADR-122, the
  body's look by phase, called once a frame from `_materials` after `_bladeMaterials`; `scale`: his drawn size, model
  metres → world, default `HERO_SCALE`; visual only, as the hero's: it is `d.drawScale` and the
  pilot's `drawScale`, so the animator's gait matches it). `reset()` resets the animator before the
  brain, then poses one short step: he waits in his waiting clip (kneeling, enthroned), not in the
  walking clip's guard. Subclass hooks: `_tint(M)`, `_setup()`
  (extra meshes, before batching), `_makeFx()`, `_makeBrain()`, `_bladeMaterials(dt, M)`, `_onHpZero()`
  (default: he dies), `brainFrame(dt)`, `afterPose(dt, act)`, `onImpact(beat, sense, act)`,
  `onRelease(beat, sense, act)`, `onCast(beat, sense, act)`, `beatMotion(beat, u, sense, dt)`,
  `onTransitionEnd(act)`, `clampTarget(point)`, and two for moves that depend on the level (ADR-111):
  `weigh(name, def, w, dist)` → the weight his AI gives the move right now (`brain._choose` calls it for
  every move it could pick; 0 = not now: no piece in reach) and `onActStart(act, opts)` → `false` when the
  move cannot start (`brain.startAct` then returns false and nothing has changed; the Lab's trigger
  included): the actor picks the piece of the level the move will use there. `d.T` = `kit.TUNING`. `drawnPoint(v)`: an upright
  gameplay point → where it is drawn (lean, `drawScale`, the lean's `ox` / `oz`). Hit stun
  (`TUNING.hitStun.light / heavy`): `stop`, `jolt`, `push` and `shudder` (m: through the freeze his
  drawn figure flickers ± this far along the cut, fading, in real time, through `lean.ox` / `oz`;
  only for a sword cut, `takeHit`'s `swing`; `d.shudderK` 0 turns it off, the Lab's 'shudder'
  toggle; `d.shuddering` is true while it runs, and the blades' sweep trails pause then: the
  flicker is no swing). His hit spray flies along `takeHit`'s `cut` (the shove keeps `dir`) and
  starts at `point` moved by his own shove (the shove is instant: the hero moves the drawn cut the
  same way, so both sit on the body the freeze holds).
- `brain.js` `class DuelBrain(d)`: the mind and timeline (modes sleep, intro, foot, act, react, broken,
  dying), all data from `d.kit`. Phases are generic: when a gate is hit it starts
  `kit.transitions[phase]` and emits `dragon:phase<n>`; `forcePhase(n)` for the Lab. Beats: a zone hit
  (`sector` / `line` / `ring`; `hitPlayer` gets `beat`), a `release` or a `cast` (the actor's, at the
  impact; a string never stops for want of reach on one). `def.manual` / `def.counter` / a weight of
  0 keep a move out of the AI's pick; `def.gapCloser` is favoured against a hero who drinks.
- `realise.js`: `makeRealise({ TUNING, MOVES, compileClip })` → `realise(name, phase, rnd, opts)` (`opts.count`:
  a `streak` move, his flurry, plays that many beats); `perPhase`.
  Beat extras: `{ pick: [beat, ...] }` (one alternative drawn as the move starts), `fixed: true` (its
  windup is not scaled by the phase). `TUNING.flashLead` may be per phase.
- `poses.js`: `createDuelPoses(GUARD, opt)` → `{ duelStance, duelLoco, compileClip, evalClip, duelClip,
  POSES }` round one guard stance (a compiled clip remembers its set: `clip.kit`); `opt.run` (how the
  blade is carried at a run), `opt.breath { k, period }` (the idle breath's size and pace); `setSw(p,
  az, el)` is exported for a boss's own pose functions. Besides the Ash
  Disciple's channels: `lsw` ([az, el] of an off-hand blade, left on the animator as `A.off` for the
  actor to pose a second blade) and `larm` / `lext` / `llead` (the left hand driven by it).
- `guard.js` (ADR-080): the guard's reaction clips every duelist shares (`GUARD_CLIPS`, spread into a
  kit's CLIPS and compiled round its stance): `wardHold` (the guard raised over his footwork), `ward` /
  `wardR` / `wardHigh` (a strike met on his left / right / from above; the contact pose is the clip's
  first frame, it ends raised), `deflect` (he beats the strike away), `clash` (the old name);
  `GUARD_TRAVEL`, `GUARD_KINDS`.
- The guard, read from him (ADR-080): `brain.wardK` 0..1 raises the ward over his footwork while
  `brain.threatened()` (the hero swinging at him from his front within 4.4 m) or for
  `TUNING.guard.wardLinger` s after a strike was met (the pilot's `ward` / `wardClip`, `poses.js`
  `raiseWard`). `brain.onGuarded(heavy, clip)` → `'armor'` (mid-windup: turned in passing), `'ward'`
  (held; also breaking off a recovery past `TUNING.guard.recoverOpen` of it) or `'deflect'` (beaten
  away: `player.onGuarded({ deflect })` bounces the hero, and the counter move starts as the 0.24 s
  beat ends). `brain._evade(s)`: once per 3 s he may step out of a heavy blow (`TUNING.guard.evade`),
  from footwork or a late recovery.
- A parried blow is HELD at the contact (ADR-079): `d.parryContact(chest, last, blade?)` steps his pose back
  along the strike (≤ 0.06 s of clip time) to the last pose before the blade crossed the hero's
  centre line in which it is still 0.34 m clear, or sets a thrust 0.4 m aside; `brain.back.off` keeps
  the shown pose that far behind the timeline (the timeline itself is untouched); a blow that is only
  deflected then rebounds for 0.07 s before the clip takes over again. `d.bladeSegment()` → `{ a, b }`.
- `fx.js` `class DuelFx(d)` (also exported as `DiscipleFx`): tells, `guard(x, y, z, { heavy, deflect,
  e1, e2, spray })` (his guard's clash: dull steel, or hot orange for a deflect; `clash` / `parrySpark`
  are the old names), sparks, the sweep trail
  (`sweep(.., ember)`: false steel, true ember, or a colour key such as 'red'), the Ash Crescent's
  projectiles (each may carry its own `speed`, `radius`, `half`, `life`, `style`), `update(dt, d)`. The
  second pass (ADR-122; STYLE.md "The duelists' effects"): `shock(x, z, r, { k, fire, kind: 'dust' | 'fire' |
  'ash' | 'void', T, delay, echo, r0 })` (a ragged ground shock; the Lord's big shocks too),
  `groundShock(x, z, r, k, delay)`, `phaseBurst(n, x, z)` (the Kindling for n 2, the third phase's change for
  n 3), `ghost(d, { dx, dz, life, light, ox, oz, ember, rise, spread })` (an afterimage), `dust(x, z, k)`,
  `onBlow(b, s, a)` (the impact hook: a phase-2 transition → the Kindling; a red / black or knockdown ring
  beat → a shock; in phase 3 an afterimage per blade beat), `kindleCharge`, `ashWind(d, dt, k)`, `ashLook()`.
  The fields the fairness guard writes keep their meaning: `strikes[].at`, `shots[].delay` / `.done`,
  `crescents[].alive`. **Look code draws from its own seeded stream** (`lr()` or a hash), never from `rnd()` /
  `rand()` (game code reads that stream) nor `Math.random` (the seeded suites replay it). Two more
  guards of the seeded fights (ADR-122): `render/lights.js` seeds a light's flicker from a stream of
  its own, and `duel.mjs` / `lord.mjs` `build()` build the boss on a stream of its own (`seed + 0x5eed`,
  then `Math.random` is put back): three.js draws `Math.random` for every object's uuid, so a body look
  with more pieces would otherwise replay every fight with another seed.
- **The second pass (ADR-122): the director, the links, the cue ledger and the fairness guard.** A kit
  whose `TUNING` has a `pressure` block gets them (without one a duelist picks, links and paces as
  before; the ledger only listens). The rules as the player meets them: COMBAT.md "The duelists' pressure
  and the fairness guard". The API, all on `d.brain` (documented again at the top of `brain.js`):
  - `expect(timeFromNow, tell, source)` → a handle `{ retime(timeFromNow), cancel(), alive, left }`, or null
    when the pool of 24 is full: something of his that flies, falls or lingers will land on the hero then,
    needing the answer `tell` asks (normal / blue: a guard; red / black: a dodge). Call it as the thing is
    made, retime it if its arrival changes, cancel it on a parry or a fizzle; it expires 0.3 s after its
    impact. What flies in the existing pools (`fx.crescents`, `fx.shots`, `fx.strikes`, the Starless Sky,
    both terrain objects' pieces, rings and marks) and the world's felled pieces are seen without it.
  - `fairDelay(timeFromNow, tell, max = pressure.guard.maxDelay, source = '')` → s to wait so a strike he
    CALLS lands at least `guard.sep + margin` from every known impact needing the other answer (the running
    move's beats included): 0 now is clear, -1 nothing up to `max` clears it (do not call it). Count a
    delay with `stats.delays++`.
  - `stats` `{ picks, links, chains, cuts, rests, holds, holdTime, feints, toldFeints, delays, fizzles, floors,
    seeks }`; `guardLog`: a ring of 64 `{ t, kind: 'feint' | 'toldFeint' | 'fade' | 'uncalled', what, with }`
    (what the guard stepped in for; `ABYSS_PGUARD=1` prints the tally); `ledger` (the `CueLedger`).
  - Internals the tests and the Lab read: `_announce` / `_tellRisk` (a blow at risk keeps its
    `combat:tell` until the guard clears it at its cue, then tell and flash go out together; a blow that
    becomes a feint sends neither), `_worldCue(at, ans)` (a world warning grounds his uncued things in
    flight: a crescent fizzles, a stone shatters, the blade passes uncued, Shen Hui's kicked pieces are
    grounded `quiet`; for a returning blade still flying OUT it estimates the homeward crossing too, with
    `ledger.js` `glaiveHome(s, p, reach, H)` (s from now, or -1), keeps its verdict on the blade
    (`_homeWarn`) and gives it at the turn: `_glaiveTurn()` the frame after the blade turns brings it home
    uncued and harmless if its way home still lands too near the warning).
  - **The guard** (`pressure.guard { sep, margin, maxHold, maxDelay, horizon, pad }`): a blade blow is
    checked the frame its cue is due; within `sep + margin` of a fixed impact of the other answer it waits
    at the cock like an authored bait hold (the beat's `hf` / `hl`: flash, impact, later beats and the
    recovery move with it), at most `maxHold` 0.5 s; no hold clears it → a FEINT (no glint, no hit; never in
    his flurry; a `fixed` beat is never held, only feinted). A release / the thrown blade: the same at its
    arrival with `pad` more room. A called strike: its `at` moves later before its cue, up to `maxDelay`,
    else it fades. Shen Hui `sep` 0.3, the Lord 0.4.
  - **Links** (`<boss>/links.js` `LINKS`, read as `d.LINKS`): `{ from: [{ to, when, chance, force, band, cut },
    ...] }`; `when` 'any' | 'near' | 'mid' | 'far' | 'front' | 'side' | 'behind' | 'away' | 'guarding'
    (`director.js` `whenHolds`, the distances and angles in `pressure`); `chance` a number or one per phase;
    `force` ignores the target's cooldown, `band: false` its band; `cut` the fraction of the recovery it
    starts at (default `pressure.linkCut`). The first entry whose `when` holds, whose roll passes and whose
    target is usable wins. Decided once, as the recovery starts; only a move that ended on its own links;
    held while the AI is off, a phase change waits, `gapT > pressure.holdGap` (a test or the Lab holding
    him) or the hero drinks.
  - **Categories** (`director.js` `CATEGORIES`, `categoryOf`): 'string' | 'single' | 'closer' | 'area' |
    'ranged' | 'spell' | 'terrain' | 'hazard'; a move's `cat` overrides the derivation (terrain → hazard (a
    cast storm / star, a beat marked `hazard` or `burn`) → string (3+ blade hits) → spell → ranged → area →
    closer → single). Also `answerOf(tell)`, `directWeight`, `linkFor`, `linkUsable`, `densityOf`.
  - **Tuning keys** (both bosses' `tuning.js`, per phase where an array): `idleGap`, `chain` (the old flow
    roll), `openingGap` (the footwork after a recoil, stagger, reeling, trampled, executed and a break,
    whatever `idleGap` is), and `pressure.{ chainDepth, chainRest, linkCut, chainCut, near, far, front,
    behind, away, maxRun, overRun, sameCat, bias, density, floorAfter, floorBoost, floorForce, seek { max,
    every }, farDist, closerBoost, maxLive, mixed, holdGap, guard {...}, meter { ramp, rampMean, minRate,
    maxGap } }` (`meter`: what the PACE scenario asserts).
  - **New beat fields** (any duelist): `cat` (on a move), `hazard` (a beat that leaves something lingering),
    `release.speed` (its crescents' own speed), `flit` inside a string (he comes apart and strikes from
    another side, as in his flurry). A `release` beat that carries a `zone` is decided once, as its cue
    comes due: with the hero inside the zone it is a cut (`b.cut` true: cued, flashed, held by the guard,
    timed and answered as a blade blow of its tell, its zone struck, nothing thrown), else a release as
    any other (`ledger.js` `throwsAt(b)`: a release, or the thrown blade, that is not a cut). Each boss's
    own: below.
- `director.js`: the pure helpers the brain, the PACE meter and the Lab share (above).
- `ledger.js` `class CueLedger(brain)`: the impacts he knows are coming and what each asks. Fed from (a) the
  running move's beats (exact), (b) `combat:flash` from any source and `combat:tell` from 'world' or a
  hazard, (c) a predictor every frame over the effect pools and the terrain objects (read only; the thrown
  blade's way home is predicted while it still flies out), (d) `expect`. Queries: `conflict(at, ans, sep,
  ...)`, `clearShift(at, ans, sep, max, ...)`, `pending(ans, horizon)`, `liveHazards()`, `travel(b)`. Fixed
  pools; nothing allocated per frame.
- `lookSwitch.js` (ADR-122): the look options behind URL switches (STYLE.md "The look switches").
  `PICKED` (the owner's picks, 2026-11-16: name → option). `lookOf(name, def = '0', pick = 'a')` → the
  option to draw, in this order: a look forced by `setLook(name, v)` (the Lab, the tests, the film rig;
  null gives it back); the URL's own parameter; `'0'` under `?looks=old` when the call site's `def` is
  `'0'` (a REDRAW: the look before this pass; a thing new in this pass keeps its pick, even one with a
  `'0'` option such as `presence`); the pick from `PICKED`; under `?looks=new` `pick` for a redraw no one
  has picked (none today); else `def`. Also `pickedOf(name)` (the pick or null), `allOld()`,
  `allProposals()`, `readLookUrl(search)` (read once at load; the tests call it to play a URL, `''` to
  go back), `looksNow(names)`. Read at draw time (a Map lookup); a switch read when the rig or the
  level is built (`ashLook`, `lordLook`, `floor`) needs a reload. The Lab's LOOKS section
  (`dev/labLooks.js` `LOOK_SWITCHES`) lists them.

### Ash Disciple — `src/entities/enemies/ashDisciple/disciple.js` exports `class AshDisciple`
A `Duelist` with `ASH_KIT` (moves.js, tuning.js, gear.js, poses.js; `transitions { 2: 'kindle', 3: 'ashWind' }`,
`dress` from look.js): his colours, the kindled blade of phase 2 and the Ash Crescent are his own. Three
phases since ADR-122 (`TUNING.phaseAt` [1, 0.64, 0.36]). The boss slot's surface above (no plunge), plus:
```
kind = 'duelist';  name = 'SHEN HUI, THE ASH DISCIPLE';  execRange = 3.2;  ghostepBehind = 1.5
mode: 'sleep'|'intro'|'foot'|'act'|'react'|'broken'|'dying'|'dead'   // brain.js (state follows it)
guarding: boolean        // his guard covers his front (±TUNING.guard.arc): footwork after the raise
                         // delay, a ward or a deflect, the first TUNING.guard.windupOpen of each windup,
                         // and a recovery past TUNING.guard.recoverOpen of it
takeHit(o): number       // a strike into his guarded front: 0 damage, guard posture, 'dragon:guard
                         // {heavy, deflect}', player.onGuarded; held on the strike's side, or (likelier with
                         // each one in a row) deflected; heavy with poise >= TUNING.guard.crushPoise
                         // (a ~full charged cleave) crushes it: lands + stagger. Otherwise as the wyrm's
                         // (part multipliers, ×breakCritMult while broken, the 50 % phase gate)
onExecute({ damage })    // a broken disciple: final damage, the break spent, 'dragon:plunged {execution: true}'
onParried({ attack, tell })   // the deflect chain (as the wyrm's): a move's non-final hit deflected, the
                         // last recoils him (react 'recoil'); 'dragon:parried', 'combat:deflectChain'.
                         // ADR-062: a PERFECT parry (player.deflect.perfect) of a beat marked `lock` →
                         // brain.startLock() (react 'lock', player.startBladeLock, a camera push-in);
                         // every real hit of a string of >= TUNING.fullDeflect.minHits parried →
                         // 'dragon:deflected', posture, a cinematic, react 'reeling'
onClashed({ tell, beat, heavy, crush })
                         // a trade clash (ADR-082; hitPlayer on RESULT.CLASHED, or _tradeNow from takeHit
                         // with o.swing: a blade's beat <= DEFENSE.trade.window from its impact is spent and
                         // brain.skipTo(impact) jumps the timeline to it): guard posture × TUNING.trade.posture;
                         // a string goes on (the blade rebounds); a single strike / a last blow → react 'clash',
                         // TUNING.trade.push m back, no punish window; crush → 'dragon:stagger', react 'stagger'
onLockEnd(won)           // the lock decided (player._endLock): won → posture, a cinematic, react 'reeling';
                         // lost → a red unblockable shove (player.takeHit kind 'shove'), the Riposte next
onMikiri({ attack })     // the hero rolled into a beat marked `mikiri` (player.takeHit sees hit.mikiri):
                         // posture, 'dragon:stagger', a cinematic, react 'trampled'
hitPlayer(o): RESULT     // his blows (and the Ash Crescents) through player.takeHit
debug: the Dragon shape (abilities, trigger, setAI, wake, startFight, phase2, stagger, postureBreak,
       kill, reset, setHp, hitboxes, currentAction, phase3)   // phase3(): brain.forcePhase(3)
```
Built by `buildHero(U, ASH_LOADOUT)` (gear.js: `ash.*` items registered into the hero's gear registry)
and driven by `HeroAnimator(rig, pilot, DUEL_POSES)` (poses.js: `loco` = his guard on the hero's gait,
`duel` = a keyframe clip). `pilot` is his view for the animator (`position, yaw, state 'duel', stateT,
animT, atk.def = the clip, groundVel, kb, chargeK, releaseK, recoil, lockOn, guardHold`); `recoil` is
his **hit jolt** (`jolt` 0..1, set when a blow lands, decaying over ~0.2 s: poses.js layers a snap of
the chest and head on any pose, so a blow shows without cancelling the move). Clip keys may drive the
sword arm from the blade (ADR-063): the non-pose channels `arm` (0..1 blend from the keyed hand),
`ext` (0 folded … 1 full reach) and `lead` (rad the fist runs ahead of the blade): the hand rides a
circle round the shoulder at the blade's azimuth, as the hero's swings do, and the chest and hips turn
with it; a cut is authored as the blade's path (moves.js `slashKeys`). Moves are data (moves.js
`MOVES`; `realise(name, phase, rnd)` → beats with absolute times, each beat's `close` budget, and the
compiled clip); reactions are `CLIP` (clash, flinch, backstep, sidestep, stagger, recoil, reeling,
trampled, lock, broken, executed, death, meditate, intro). (The engine files named here, brain.js
and the clip / pose code, now live in `enemies/duelist/`, above; his poses.js holds only his guard.)
Beat flags: `lock` (a perfect parry crosses
the blades), `mikiri` (a perilous red thrust: its hitPlayer passes `mikiri: true`, its flash
`perilous: true`), `close` (m he may step in through the windup; default TUNING.close). Hits are zones
tested from his position and facing through each beat's active frames (`sector`, `line`, `ring`), one
result per beat. The brain (brain.js) **leads** the hero: `_sense()` carries his velocity (`vel`,
capped 9 m/s) and every step-in, windup track and dash aims at where he will be at the impact; a
string whose next hit can't reach (`_reach`) ends there. Footwork circles only inside
`TUNING.move.band`, runs beyond it, sprints past `sprintAt`; a hero in state 'heal' is punished (no
breather, ground-covering moves × `TUNING.punish.weight`). Numbers: tuning.js.
**The courtyard's moves (ADR-111, `ashDisciple/terrain.js` `class TerrainMoves`, `d.terrain`).** A move
marked `terrain: 'fell' | 'kick' | 'toll' | 'spring'` (moves.js: `pillarFall`, `lanternKick`,
`bellToll`, `swallowReturn`) uses a piece of `world.destructibles` (every call guarded: a world
without it has no such move). `terrain.find(kind, forced)` → the piece or null (`forced`: the nearest
however far, for the Lab and Training); the engine's hooks route to it: `weigh` → `terrain.weigh(def, w)`
(0 with no piece in reach; it remembers the piece for that brain frame), `onActStart` →
`terrain.begin(act)` (false with no piece at all), `beatMotion` → `terrain.motion` (his own root
motion: a beat's `go: [from, to, arc]`, the windup fractions between which he crosses to the piece and
the leap's height, or `spring: { up: [from, to], off }`; such a beat has `track: 0, close: 0`),
`onImpact` → `terrain.impact` (the pillar is felled: `destructibles.topple(piece, dx, dz, 'boss')`, so
the fall's tell, strip and blow are the world's), `onCast` → `terrain.cast` (a `cast: { kind: 'lantern'
| 'toll', selfCue: true }` beat: `take` / `carry` / `throwTo` with his own blow in `onLand`, or a ring
of sound), `brainFrame` → `terrain.frame(dt)` (the piece in the air and the rings: each emits its own
`combat:flash` { source: 'dragon', attack, tell } `flashLead` before it reaches the hero and deals
through `hitPlayer({ projectile: true })`). `terrain.busy`: something of his is still in the air.
Since ADR-122 also `terrain: 'flag'` (`flagKick`, `flagVolley`: a flagstone levered out of the paving with
`destructibles.floorNear` and kicked, one a beat) and `'fan'` (`flagFan`: three at once, cut through in the
air); a kicked piece's flash carries `flare: true`, nothing is drawn where it lands, each is told to the
ledger (`brain.expect`) and its flight lengthened by `brain.fairDelay` (at most `maxDelay` 0.4 s; -1: it
lands uncued and harmless); `terrain.shot` / `terrain.kicks` carry `quiet` when a world warning grounds
them. `pillarFall` takes a colossus's upper half too (its strip starts `fallOff` out). Two random streams
of its own (`_g` gameplay, `_l` looks), never `fx.rnd`.
**His second pass (ADR-122).** `links.js` `LINKS` (read through the `LINKS` getter; shared lists `PURSUE`,
`THROWN`, `YARD`). `moveFx.js` `class AshMoveFx(d)` (`d.moveFx`): BURNING GROUND. A beat's `burn: { kind:
'across' | 'along' | 'path' | 'ring', at, from, len, w, life, r, arcs }` (moves.js) lays a line of fire
from phase `TUNING.burn.from` (`onImpact` → `moveFx.burn(b, act)`; `brainFrame` → `moveFx.frame(dt)`): a
pool of 12 `lines` (at most `burn.cap` alive per phase), `alive`, `add()`, `burn(b, act)`, `reset()`,
`stats { lines, burns, capped }`. A tick on a hero standing in it is a contact blow (`attack`
'burningGround', blockable, never parryable): through `player._block` on a raised guard (no health,
`burn.guard` 34 off the guard meter), else `burn.damage`. Drawn as fire-field heat (`?burn=`). Other beat
fields of his: `zig` (m: before its dash he steps this far aside, + his left), `flit` inside strings,
`release.speed`, `TUNING.crescent.minLead` (a crescent that would reach the hero sooner is not thrown).
`look.js` `dressFrame(d, dt)` (the kit's `dress`: `?ashLook=b`, the body dressed by phase) and `bodyArt.js`
(the converter to the wyrm's art path that `?ashLook=a|c` and `?lordLook=a|c` use) are look modules: built
only when their option is chosen at build time; the default rig is as before.
`d.baseBound` is the level's bound; `d.bound` adds `terrain.slack` (he may stand out past his bound
for a piece; it shrinks at `TUNING.terrain.leash` m/s once the move is over). A beat's `noSweep` keeps
the blade's sweep trail off a blow that is not the blade's (the kick). `reset()` clears it all.
**HeroAnimator** (anim.js): `new HeroAnimator(rig, player, poses = null, opts = {})` — `poses` merges extra clips
over the hero's table for that instance (a key it shares replaces the hero's clip for that instance
only; a key of its own that is not a walking clip gets no foot planning: the Starless Lord's
`glide`). `opts.freeHand` (the player only, never a duelist): the free hand's wrist, the sword
fingers, the gap-gated fist and the free elbow's `LOCK_REACH` (see Hands, above); `anim.freeHand`
says which. Exported for other pose tables: `P, N, v3, to3, dirLerp, kf, guard, loco, turnTwist`
(and, for the tests, `WRIST_L`, `OFF_SNAP`). A pilot
may set `updraft` (0..1): a wind under its cloth outside the hero's charge (a duelist's casts).

### Starless Lord — `src/entities/enemies/starlessLord/lord.js` exports `class StarlessLord` (ADR-069)
A `Duelist` with `LORD_KIT`; COMBAT.md → "The Starless Lord" has the fight. The boss slot's surface, plus:
```
kind = 'duelist';  name = 'VARR NIHIL, THE STARLESS LORD';  phase 1..4 = his blade FORM
lives: { total: 4, left }      // the forms still to beat (this one included); hp / maxHp = this form's bar
lit: 0..1                      // how far the blades are lit (they extend from the hilt)
blades: { A, B, hiltB, Q, off, L }   // main blade, the staff's second blade + joined hilt, the cross-hilt's
                               // side blades, the off-hand saber's joint and its blade (gear.js names them)
_onHpZero()                    // an empty bar BREAKS him (no death): on one knee for posture.breakTime
onExecute({ damage })          // the DEATHBLOW: the form ends ('dragon:plunged {execution, deathblow, form}');
                               // forms 1-3: react 'executed', then kit.transitions[form + 1] (enterPhase: a
                               // full bar, the new stance and blades; nothing lands on him until the
                               // ignition's ring goes out); form 4: he dies
endBreak()                     // a break nobody answered: posture.spared of the bar back, half the meter
addPosture(n)                  // × lerp(posture.gainByHp) by the bar's missing fraction (hard to move on a
                               // full bar); regen × posture.regenByHp
moveBy / clampTarget(p, pad) / onFloor(x, z)
                               // he keeps to the crater's floor: his circle round the seal (`bound`:
                               // TUNING.bound = THRONE.floor.r) and south of the dais
                               // (CONFIG.world.bossFloor.zN, the level's; absent on the lab stage)
_glide(dt)                     // in footwork past TUNING.glide.on m/s: the animator's 'glide' clip, the root
                               // lifted TUNING.glide.hover m, a wake under him; a backstep / sidestep likewise
weigh(name, def, w) / onActStart(A)
                               // a move marked `terrain` (ADR-109): his AI gives it weight only while the
                               // crater has a piece for it; it takes its pieces as it starts (false: none)
terrain                        // LordTerrain (terrain.js): begin(A), onCast(b, s, a), frame(dt), drop(),
                               // reset(), busy; the pieces held (`held`), the rings where thrown ones land
                               // (`marks`), Crown Fall's pick (`fall`). Uses world.destructibles: take,
                               // carry, throwTo (his blow in onLand), drop, topple
debug.phase4(), debug.setForm(n), debug.form
spells                         // LordSpells (spells.js, ADR-122): busy, nightLive, clear(), recall(), catch(),
                               // onForm(n), stats, rand() (its gameplay stream), lr() (its look stream)
```
**His second pass (ADR-122).** `links.js` `LINKS` (shared lists for the strings' pursuits, `AFTER_RED`
after a red spell or a thrown piece, `AFTER_SPELL` after Rupture and the Halo). `spells.js` `class
LordSpells(d)` (`d.spells`, stepped from `brainFrame`): what flies, waits or falls while he fights on, each
reported to the ledger (`expect` / `fairDelay`): the WHEELING BLADE (form 2; `cast.kind 'wheel'`; while
it flies `d.glaiveOut` and he starts no blade move; its cues carry `bullet`), the ORBIT (form 3), the
STARLESS SKY as weather (form 4, `TUNING.weather`: called in his moves' pauses, never in the hero's
opening), STARLESS NIGHT (form 4's great spell, `cast.kind 'night'`, `TUNING.night`; `nightLive`: while
its waves run `weigh` gives 0 to every move that asks a guard). Attack names (`SPELL_ATTACK`):
'wheelingBlade', 'starlessSky', 'starlessNight' (the last two are hazards). Two streams of its own
(`rand` gameplay, `lr` looks). `terrain.js` (`LordTerrain`) gains `rupture` (`plateRupture`: plates burst
up along a line; `_ruptDelay` clears every plate that may cue in one go) and `halo` (`plateHalo`: a ring
of plates dropped on the hero), both on `destructibles.floorNear`; Void Hurl and Glass Rain take floor
plates once the hanging stones are spent; a thrown piece shows nothing where it lands. `fx.js`
(`LordFx`) gains `gather(kind, hand, k, dt)`, `presence(form, dt)`, `igniteGather(x, z, k, dt, form)`,
`deathBurst(x, y, z)`, `unravel(segs, n, k, dt)`, `look(name)`, `igniteNova(x, z, r, form = 2)`; its big
shocks go through `DuelFx.shock` (`kind: 'void'`), its vents from `THRONE.vents`, and every drawing
method is wrapped onto its own stream (`DRAW_METHODS`) so `fx.rand` stays the gameplay stream. On its
way home the returning blade asks `brain.fairDelay(home, tell, TUNING.glaive.homeWait, 'glaive')` at its
turn: a positive delay hangs it longer, -1 brings it home uncued and harmless. A white or blue blow out
of a blink meets a guard from any side. `look.js` `dressFrame` (`dress`: `?lordLook=b`, dressed by
form), `bodyArt.js` (`?lordLook=a|c`).

**His gear** (gear.js, ADR-084): `lord.*` items registered into the hero's gear registry: `lord.hood`
(a deep hood over a faceplate with one slit of red light: `HOOD_RINGS`; `hidesHair`, `shadowsFace`;
the owner's pick of three heads), `lord.plate` (cuirass, gorget, the sigil), `lord.yoke` (a plate yoke on the chest
joint, a pauldron on each upper arm), `lord.arms`, `lord.legs` (the Wanderer's boots under cuisses),
`lord.skirt` (hip plates; `LORD_PANELS` on the coat springs), `lord.cape` (`LORD_CAPE`: five sheets
on the streamer springs), `lord.saber`. `LORD_LOADOUT` is what he wears; `TUNING.scale` 1.32.
Four stances (poses.js `GUARDS`, one pose set each; the animator's pilot carries `form`) and
`glidePose` (the animator key `glide`); reaction clips are compiled per form (`CLIPS_BY_FORM`, the
brain's `C`). Moves (moves.js): `weight` is per FORM `[1, 2, 3, 4]`; a string's cuts alternate the
driving foot (`cut(.., { step: 'L' })`), a spin carries the feet round with the body (`spinFeet`),
`cut('aerial')` is a cartwheel, `parting()` a backflip, and a main string ends in its form's
`FLOURISH` (`recoveryKeys`). His own beat fields: `bolt` (Void lightning: a long line zone from the
casting hand; a perfect parry returns it: `dragon:returned`, damage + posture to him), `pull` (the
hit's `from` is put on the hero's far side: he is dragged in), `grip` (the Crushing Dark: a red line
from his hand; a hit is `kind: 'grip'`, a knockdown, and `fx.gripCrush` where the hero lies), `blink:
{ behind }` (he reappears behind the hero as the windup starts), `left` (the off-hand blade cuts),
`release: { style: 'push' | 'crescent' | 'rift', count, spread, speed, from }`, `cast: { kind:
'glaive' | 'debris' | 'storm' | 'star' | 'wheel' | 'night', orbit, after }` (ADR-122: `wheel` the wheeling
blade, `night` Starless Night, `orbit: true` torn stones that turn round him and fly into the string's
gaps, `after` s before what is cast goes), `catch` (ADR-122: the beat his thrown blade comes home on: no
hit). fx.js `LordFx extends DuelFx`: the blades' glow and red
light, lightning (`lightning`, `arc`, `crackle`), the push's wall and burst, the pull's vortex, the
grip (`gripClaw`, `gripSnap`, `gripCrush`), thrown things (`throwShot`: the blade that returns, torn
stone that turns round him until thrown; each cues itself flashLead before it reaches the hero, or
fizzles; the Rift's fissures are crescents with `style: 'rift'`), marked ground (`callStrike(x, z,
r, warn, { style: 'bolt' | 'star', drift })`: a red ground ring, then called lightning or the Dark
Star's burst; a star follows the hero until its cue), `glideWake`, the aura, `afterimage` and the
blink, the ignition. The intro: seated at
`CONFIG.world.dragonSleep` with the root raised to the seat (`TUNING.intro`), he rises, the blade
ignites and he leaps to the seal; a skipped intro puts him where the leap lands.

## Event catalogue (exact names — producers → consumers)
Player → hud/audio/fx/flow:
- `player:attack {kind:'light'|'heavy'|'slam'|'cleave'|'thrust', combo, charge, name}` (swing starts; combo 1–5 = the chain hit, slam = hit 5, the sprint slash and the roll cut report 1; heavy = a heavy branch, combo 0–4 = the light it followed (ADR-115; the Earthbreaker after the fourth is kind slam); cleave = the charge's release, thrust = the execution against a duelist; name = the attack's data name, combat.js),
  `player:charge {t}` (charge start; t = seconds to full charge), `player:slam {x, z}` (the slam meets the ground: shard burst),
  `player:hitDragon {damage, part, point, heavy, crit, kind, guarded, combo, weight, shards}` (heavy = slam / cleave / thrust / plunge; kind 'plunge' = the
  head-stab, crit on an execution; guarded = a duelist's guard turned it: damage 0; point = where the cut is drawn
  (on a duelist: after his shove, where he is drawn in the held frame);
  combo = the chain hit 1-5 (1 outside the chain); weight = the cut's look and sound tier, the attack's contact:
  light, sweep, point, slam, cleave or execute; the plunge's has neither; shards = true when only the slam's ground
  shards hit (the blade is in the ground: weight null, no cut drawn, no blade sound)), `player:hurt {damage, kind, hp}`,
  `player:bounced {heavy}` (a duelist's guard deflected the hero's strike: his blade is thrown back),
  `player:block {damage, tell}`, `player:parry {tell, attack, chain, light, perfect, last, flare}` (flare = the blow was a parry moment, a blue flare blow: the counter follows; last = false for a string's non-final blow; chain = the hero's parries in rhythm, ≤ 1.1 s
  apart, 1 = single; it can run across two strings; light = a deflected bullet: a lighter clash; perfect = pressed within
  `DEFENSE.perfectParryWindow`: with light, the bullet is returned), `player:guardBreak {attack}`,
  `player:guardOpen {attack, black}` (black = a black, charged, blow met on the guard or a parry: the whole meter at once, ADR-118; else the guard meter ran out on a blocked blow: the blow was blocked, the guard is knocked open for a
  short stagger; ADR-095; HUD "GUARD DOWN", audio the guard break's crack, the pad rumbles),
  `player:dodge {kind}` (an attack passed through i-frames), `player:perfectDodge {attack, tell, streak}` (every perfect dodge:
  flurry, plunge, in place or Ghostep; not on an execution; streak = perfect dodges in a row, this one included),
  `player:ghostep {x, z}` (with every perfect dodge; for the plunge x/z = the hang point above the head, for a flurry where he dodged),
  `player:streak {count, lost}` (the streak changed: counted up, or count 0 and how many were lost when a blow hurt him),
  `player:flurry {strikes, art, air, dur}` (a perfect dodge is answered: blows in all, the art's name, in the air round a head or on
  the ground, real seconds it takes, about), `player:flurryHit {n, of, last, damage}` (a blow of it landed; last = the art's),
  `player:flurryArt {art, air, dur}` (the art's coil starts; not for the plunge), `player:flurryEnd {strikes, damage, art, label}`
  (the last blow landed and the hanging cuts burst: the damage of all of them, the art's display name; a parried last blow's
  riposte emits these too, with art 'riposte', and no perfect-dodge events),
  `player:plunge {execution}` (the dive starts; also an execution), `player:plungeHit {damage, execution}` (the blade
  meets the head, once per plunge; damage = what onPlunge returned; also a `player:hitDragon` with kind 'plunge' when
  it dealt damage), `player:roll {backstep}`, `player:heal {amount, flasks}`, `player:noFlask`, `player:died`,
  `player:footstep {x, z, sprint}` (a planted foot's touchdown while moving, and a dash's
  two bounding steps), `player:lockOn {on}`,
  `player:lock {phase}` (the blade lock with a duelist: phase start / push / won / lost),
  `player:mikiri {attack}` (a roll into a perilous thrust stepped on the blade),
  `player:counter {attack, damage}` (the flash counter, ADR-102: a trade clash in the instant the hero's cut became
  a cut; it went through the blow and through the attacker; HUD "FLASH COUNTER"),
  `player:flareCounter {attack, damage, strikes}` (the counter, ADR-118: a blue flare blow was parried and the hero
  answered by himself; fired as its last cut, the counter blow, lands: damage = that blow's, strikes = the
  cuts in all; HUD "COUNTER"),
  `combat:answer {attack, tell, result, damage, dead, stream, perfect}` (every blow the hero answers, from
  the player's takeHit, whatever the answer: result = the RESULT it returned (never 'ignored'), damage = the HP it cost,
  dead = it killed him, stream = a contact tick (breath, burning ground), perfect = a perfect parry; the move
  telemetry reads it, ADR-108)
Dragon (any attacker; the BOSS SLOT: the wyrm or the level's boss, e.g. the Ash Disciple, emits the same
`dragon:*` names, see "Levels and the boss slot") → hud/audio/flow:
- `combat:tell {source:'dragon', attack, tell, impactIn, x, z, flare}` (windup start, per hit, so once per hit of a
  string; x/z = the striking part; impactIn is a first estimate in game seconds; tell: normal / blue / red /
  black; flare: the blow is a moment, cued by the flare: every red and black blow, a blue one marked so in its
  data, ADR-118),
  `combat:flash {source:'dragon', attack, tell, x, y, z, perilous, flare}` (~0.35 s before impact — the **authoritative**
  timing cue: moving targets (charge, fireball) and hazard-dealt blows re-time it after the tell; perilous:
  a duelist's mikiri thrust, roll into it; flare as above: the HUD flashes the screen edge in the flare's colour;
  since ADR-122 a duelist's thrown terrain piece, kicked or hurled, cues itself with flare too, drawn on the piece,
  nothing drawn where it lands; a blow the duelists' fairness guard may still feint sends its tell only together
  with its flash, and a blow it turns into a feint sends neither; the wyrm's phase-3 fire, ablaze.js, dims round it, ADR-120),
  `combat:charge {source:'dragon', attack, dur, x, z}` (a black blow begins to charge: darkness gathers on the
  striking part for dur game seconds, until its cue; the HUD darkens the screen edge through it, audio plays
  the charge's swell),
  `combat:clash {heavy, crush, counter, x, y, z}` (the trade clash: the hero's cut met a duelist's blow at the same moment and
  neither landed; heavy = the hero's cut was a heavy one, crush = a full cleave that was not thrown back, counter = the
  flash counter (it is followed by player:counter and the HUD shows that instead); HUD "CLASH",
  audio two steels ringing, a flicker of the frame),
  `combat:deflectChain {count}` (the attacker's count: the 2nd, 3rd ... parry in a row within one string;
  a hit that lands or is blocked resets it, dodges keep it; contract 1; the HUD shows "DEFLECT ×N")
- `dragon:wake`, `dragon:roar {strength}`, `dragon:introDone`, `dragon:windup {name}`, `dragon:attack {name}`,
  `dragon:step {x, z, heavy}`, `dragon:wingFlap {strength}`, `dragon:takeoff`, `dragon:land {x, z}` (the leap,
  every flight, and the crash of a plunged flier),
  `dragon:breathStart`, `dragon:breathEnd` (the breath, the sky strafe's pass, the fire snap's gout, the breathed patterns and the firebrand's kindling), `dragon:fireball {x, y, z}`,
  `dragon:explosion {x, z, radius}`,
  `dragon:bite`, `dragon:hurt {damage, part, hp, crit}`, `dragon:parried {attack, tell, hit, last, bullet, perfect}` (hit = 0-based
  index in its string, last = the string's last hit or a single attack: only then a recoil; bullet: true = a
  deflected bullet, hit 0, last false: posture only, the wyrm is not interrupted and audio stays silent; perfect:
  true = the bullet is returned), `dragon:returned {kind, damage, x, y, z}` (a perfectly parried bullet's return
  lands on the head: kind 0 ember (1 was the wisp, removed in ADR-119), damage dealt, x/y/z the head; audio plays its hit, the HUD its number,
  flow counts it in the run stats like a sword hit),
  `dragon:streak {count, ready}` (a duelist's streak of guards changed; ready = his flurry may come), `dragon:flurry {count}`
  (his flurry starts: that many blows), `dragon:flurryEnd {count, answered}` (decided: every blow parried or blocked, or one missed),
  `dragon:posture {posture, max}`, `dragon:postureBreak`, `dragon:stagger` (ordinary stagger only), `dragon:phase2`,
  `dragon:phase3`, `dragon:phase4` (a duelist's later phases: the Starless Lord's blade forms), `dragon:phase {n}` (the wyrm: with phase 2 and 3, on the transition roar), `dragon:plunged {execution}`
  (contract 2: every plunge that lands, even during a transition or the killing one),
  `dragon:death`, `dragon:dead`,
  `dragon:guard {heavy, deflect}` (a duelist's guard turned the hero's strike: no damage, guard posture; HUD
  "GUARDED", audio a dry clack; deflect = he beat it away and the hero bounces: HUD "DEFLECTED", a harsh falling
  clang, a flicker of the frame), `dragon:deflected {count}` (every real hit of a long string parried:
  the full deflect; HUD "PERFECT DEFLECT"),
  `dragon:spell {name, x, z, part}` (a fire attack's signature moment: the strafe's pass, the dive, the barrage's
  rise, a spell's cast / the nova's charge start, a bullet pattern's cast (cinderSpit, emberRain, fireLanes among
  them), a terrain move's throw / kindling / bat; the whole body's blows that have a sound of their own: wingSlam,
  tailSlam, tailWhip; a flying combo (skyHunt, skyFurnace, skyCataclysm) once per part, with the optional field
  part = 'pass' | 'barrage' | 'dive', ADR-119), `dragon:hazard {kind, stage, x, z, radius}` (a fire hazard:
  stage 'fall' = a meteor starts its visible fall, 'hit' = a meteor / pillar / the dive's crash / the nova goes off,
  'launch' = a bolt of Armageddon's salvo leaves the jaws, 'sky' = the sky answers it: the barrage begins)
- Hazard tells: a self-announcing hazard (meteors, chase pillars) emits combat:tell / combat:flash with
  source 'dragon', its spell as the attack, tell 'red' and hazard: true (audio plays a lighter cue)
- Bullet tells: a bullet about to hit, or a ground tongue about to reach the hero, emits combat:tell /
  combat:flash with source 'dragon', its pattern as the attack (a tongue's: fireWheel or fireLanes), the
  bullet's tell (normal for an ember, red for an orb or a tongue), hazard: true and bullet: true (audio: the
  flash ping alone, no tell sting, no music dip)
- Ambient cinders (ADR-119) are hazard circles: their cues carry the attack name cinders (no tuning entry)
- A duelist's things that fly, wait or fall while he fights (ADR-122) cue themselves with source 'dragon':
  the Starless Sky's strikes (attack starlessSky) and Starless Night's waves (starlessNight) with hazard: true,
  the wheeling blade (wheelingBlade) with bullet: true; Shen Hui's burning ground has no cue (ground to step
  off, not a blow). No event and no payload field was added by the duelists' second pass.
Flow → hud/audio:
- `state {from, to}`, `bonfire:rest`, `game:retry`, `game:victory`, `area {name}`,
  `game:cinematic {kind}` (flow.cinematic: slow motion and a close camera on a duel's big moment; kind
  fullDeflect / bladeLock / mikiri / execution / perfectParry (the hero's perfect parry of a blade: a short
  slow motion, no gong), or lock = the blade lock's camera push-in: no slow motion,
  audio plays no gong)
World → audio (destruction, ADR-107; see "Destruction" above):
- `world:impact {kind, mat, x, y, z, power, by, id}` (a blow on a breakable. kind: 'chip' = it held, 'break' = it
  shattered where it stood, 'topple' = it starts to fall, 'crash' = it lands (or a thrown piece does), 'burn' = wood
  catches, 'burnout' = it burned through (also for a log of wreckage, with id -1), 'throw' = a boss tears it from
  the ground, 'wear' = it reached a stage of wearing down (power = the stage, 1 – 3; ADR-120). mat: 'wood' / 'stone' / 'metal' / 'bone'. power: on the POWER scale. by: 'player' / 'boss' / 'world'.
  id: its index in the breakables' list.
  One reused payload: a subscriber must not keep it), `world:fire {x, z, radius, cells}` (grass catches)
- A piece a boss felled emits combat:tell / combat:flash with source 'world', attack 'fallingDebris', tell 'red'
  and hazard: true (be out from under it; audio plays the hazard cue)

## Ownership (parallel work)
Foundation (read-only for module authors unless their brief says otherwise): `src/core/**`,
`src/render/**`, `src/world/**`, `src/combat/**`, `src/main.js`, `index.html`, `src/style.css`.
Each module owns only its directory. If a module needs a foundation change, it reports it instead of editing.
