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
    → world.update(dt) → lights.update → fx.update
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
→ ASCII pass → FX particles (fxScene) → bloom → final grade
```
World matrices are therefore final when `render` starts: anything that moves an object after the
actors' updates must do so before `pipeline.render()` (a transform changed between the two scene
passes was never supported; now neither pass re-walks the graph). The cameras still update
themselves (`shadowCam` in `updateShadowCamera`, the main camera by the rig / view override).
**Keep-in-view:** during their update, flow (a flying or rearing wyrm) and the player (the plunge)
may call `cameraRig.keep(...)` for world spheres that must stay on screen; the rig consumes the
requests in its update the same frame (requests last one frame). `dragon.update` also runs the fire
hazards and the bullet field (`dragon.hazards.update`, `dragon.bullets.update`, both guarded).

## The `game` context (passed to every constructor)
| field | what |
|---|---|
| `THREE`, `CONFIG` | three.js namespace, `core/config.js` |
| `renderer, scene, fxScene, camera, pipeline, U` | rendering. `U` = shared uniforms (`render/shaderLib.js`), including `U.uBoneTex` (the rigid batches' bone matrices, see Rigid batching below). `pipeline.setShadowSize(texels)` resizes the moon shadow map (`pipeline.shadowSize`; main.js `applyQuality` passes the preset's `shadow`) |
| `events` | pub/sub: `on(name, fn)` → unsubscribe fn, `emit(name, data)` |
| `input` | **Actions** (ADR-067, `core/bindings.js`): `act(a)`, `actPressed(a)`, `actReleased(a)` — true when any code bound to action `a` (or its virtual code `'@a'`) is down / pressed / released; `bindings` (the `Bindings` instance); the player, flow and timing trainer read only actions. Raw: `down(code)`, `pressed(code)`, `released(code)`, `mouseDown(b)`, `mousePressed(b)`, `mouseReleased(b)`, `moveAxis()` → `{x, y}` (y = up/north, from the up / down / left / right actions; keys give a unit vector, a deflected virtual stick wins with its analog length ≤ 1), `anyPressed`, `wheel`. Codes are `KeyboardEvent.code`. **Virtual sources** (touch): `setVirtual(code, down)` (code = a `KeyboardEvent.code` or `'Mouse0'`/`'Mouse1'`/`'Mouse2'`; same one-frame `pressed` / `released` edges as the real device, only on a change), `setVirtualAxis(x, y)`, `releaseVirtual()` (everything up, stick centred). Virtual holds are tracked apart from the real keys / buttons. **Gamepad source** (ADR-066): `setPad(code, down)`, `setPadAxis(x, y)`, `releasePad()` — the same semantics with their own holds (a release on one source never drops a hold on another); a deflected pad stick wins over the touch stick and the keys in `moveAxis()`. `pulse(code)`: a one-frame `pressed` edge with no hold. `kbmT`: `performance.now()` of the last real keyboard / mouse event (a mousemove only with movement). Mouse events within 1 s of a touch pointer event (browser compatibility mousedown / mouseup / mousemove) are ignored. |
| `mouseGround` | `Vector3` — mouse ray ∩ ground plane, updated each frame (the ray from the camera without the kick's translation, `cameraRig.kickOff`); with a gamepad in use or touch controls on, their aim point (see Gamepad controls, Touch controls; shared helper `ui/aim.js` `aimWithoutCursor`) |
| `cameraRig` | `addTrauma(0..1)`, `extraZoom`, `focus`, `zoom(steps)` (2.5 m per step, clamped to the profile), `targetDistance`; distance profile `setMobile(bool, portrait = false)` / `mobile` / `portrait` / `lead`, `defaultDistance`, `minDistance`, `maxDistance`, `maxExtraZoom` (desktop: `CONFIG.camera.distance/min/max`, unlimited extra zoom; phone: `mobileDistance` 20 / `mobileMinDistance` 14 / `mobileMaxDistance` 34, extra zoom (lock-on, boss framing, title / intro shots) capped at `mobileMaxExtraZoom` 3 m). `setMobile` resets the zoom to the profile default; a phone held upright (`portrait`) stands `CONFIG.camera.portraitDistance` (1.2) × further back and looks `portraitLead` (1.5 m) south of the focus, so the hero stands above the middle of the screen (ADR-097). `fovFor(aspect)` (exported by `core/cameraRig.js`, applied by main.js on every resize): the vertical field of view, `CONFIG.camera.fov` in landscape, opened in a window taller than wide until the view is as wide as a square window's (`portraitMaxFov` 68 at most). `punch(m)`: the zoom punch (`game.punch`). `kick(dx, dy, dz, m)`: the directional kick (`game.kick`): `kickX` / `kickY` (m along the screen's right / up axes; the camera and its look point move together, so the view direction and the figures' lean are unchanged) and their velocities `kickVX` / `kickVY`, a damped spring (`KICK`: ω 30, ζ 0.55, ≤ 0.5 m per axis) stepped in real time after the frame's offset is drawn (the kick's frame shows the whole throw); `kickOff` (Vector3): the world translation the kick put on the camera this frame (0 without one; main.js takes it off the mouse ray, so `mouseGround` and the aim never wobble with a landed cut); `snap()` zeroes it and the punch. `cine = { zoom, x, z, w }`: flow.cinematic's pull-in (zoom m added to the distance, negative = closer; the follow focus leans toward (x, z) by w; all 0 when no moment runs). **Keep-in-view** (`FIT` in `core/cameraRig.js`): `keep(x, y, z, r = 1, must = false)` asks for a world sphere to stay on screen this frame (≤ 16 per frame; non-finite input is ignored). After the usual follow / distance damping the rig projects the subjects with the real camera and eases a ground-plane pan (`fitX` / `fitZ`, ≤ 30 m) and extra distance (`fitZoom`: ≤ 6 m to fit every subject, ≤ 12 m for `must` ones; phone 1.5 / 3 m) until they sit inside the NDC box (\|x\| 0.9, top 0.86, bottom 0.78). `must` subjects (the hero) are never cropped to fit the others. Damped (5/s, 12/s while a must subject is off the box), eased back to 0 with no requests, reset by `snap()`. `focus` = the damped follow focus + the pan. |
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
| `world` | `resolve(pos, radius, bound)` circle collision; `setPusher(slot, x, y, z, r)` grass trample (slot 0 = player, 1–9 = dragon; y > 1.5 = airborne, ignored); `clearPushers(from, to)`; `gust(x, z, strength 0..2, radius)`; `scorch.burnCircle(x, z, r, burn 0..1, heat 0..1)`, `scorch.reset()`; `colliders.blocked(ax,az,bx,bz)`; `setGrassQuality(count)` (instanced grass blades drawn; main.js applies the quality preset); `bonfire {x,z}`; `nest {x,z}`; `atmosphere.setBonfireLit(bool)`; `atmosphere.skyGlow(k 0..1)` (the sky over the clearing glows orange: warms the shared ambient and fog colours; call every frame while it should show, it eases in and out and lets go 0.2 s after the last call; Armageddon, ADR-053); Lab only: `debug.setVisible(bool)` hides / restores the environment (ground, grass, forest group = trees, stones, flagstones, nest bones, bonfire; atmosphere paused and in-flight particles in `fx.*` dropped; the exact previous `visible` flags come back; lights, scorch and colliders untouched), `debug.visible` |
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
    `{ texture, sets: [mid start, bright start, stroke start], total }`: one row, column 0 blank, then
    `WYRM_SETS.dim / mid / bright`, then `WYRM_STROKES` (`- / | \`), each glyph with a soft 0.24
    halo. `setSize` rebuilds it when the font or scale changes (`tArt`, `uArtCell`, `uWyrmAtlas`).
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
- **Landmarks** (`world/landmarks.js`): builders that return painted geometries in world space:
  `buildElderWyrm`, `buildCinderTree` (Cinderwood), `buildSectGate`, `buildCauldron`, `buildColossus`
  (Ashfall), `buildWarden`, `buildGreatSword` (the Obsidian Throne), all `(rng, x, z, yaw, s, opts?)`.
  `carved(parts)` converts painted parts to the carved attribute set for a set's `stones` mesh;
  `landmarkPoint(x, z, yaw, s, lx, lz)` maps a builder's local point to the world;
  `ELDER_COLLIDERS` / `GATE_COLLIDERS` are `[lx, lz, r]` lists the set adds. Where they stand:
  `FOREST_LANDMARKS` (`forest.js`), `COURTYARD.greatGate / cauldron / guardians` (`courtyard.js`),
  inline in `throneHall.js`. Trees and boulders in a landmark's footprint are built, then dropped, so
  the rest of a level's random layout does not move. Each set uses its own seeded rng for them.
- `createCarvedGlyphMaterial(U, opts)` (`render/materials.js`) — **carved glyphs, for FLOORS only**
  since ADR-100 (flagstones, paving, the hall's tiles; upright objects use prop art above). Glyph cells sit on a world-fixed lattice in
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
                //  ('attack' = the light chain + the slam finisher, 'heavy' = the released charge's cleave (and the execution's thrust),
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
lockOn: boolean                        // toggled by Tab / middle mouse; facing tracks dragon.lockPoint
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
          tell='normal', parryable, blockable, attack, attacker, plunge, perfect, light }): RESULT   // see COMBAT.md
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
another side of the hero as it starts (`duelist.flit`) and its hit carries `around: true`. `brain._act`
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
survives a hero rebuild. **Outfit options** (kept for later use: the owner, 2026-11-14, keeps today's look as the default; a URL switch like the old
`?lordLook=`): `player/gear/looks.js` `HERO_LOOKS` = id → `{ id, name, loadout, tint, of? }` (`shroud`
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
**Idle life** (ADR-047): in the loco clip, standing still in the `idle` state, not locked on, with no
guard held, for `IDLE_LIFE.after` (2.5 s), `HeroAnimator._idleLife` starts an action from `FIDGETS`
every `IDLE_LIFE.gap` (2–4.5 s after the last one ends), picked with the animator's own noise (never
`Math.random`), never the same twice in a row: `look`, `stretch`, `inspect`, `twirl`, `shoulder`,
`lean` (1.7–4.2 s each). Each is a layer over the ready stance (`idleLife` in `locoGuard`) with a
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
bullets: Bullets                        // the bullet field + the fire wheel (bullets.js, ADR-039): see "Bullets" below
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
  abilities(): Array<{ name, label, tell, phase }>,   // every ATTACKS entry (30: singles, strings, fire
                                        // attacks, bullet patterns and 'roar', the transition shock ring)
  trigger(name): boolean,               // force an ability now (wakes/starts the fight if needed); false while busy
  setAI(enabled: boolean), aiEnabled: boolean,
  wake(), startFight(),                 // startFight skips the intro straight into combat (no-op if fighting)
  phase2(), phase3(), stagger(), postureBreak(), kill(), reset(), setHp(fraction 0..1),
                                        // phase3: straight into the phase-3 transition (from phase 1 or 2)
  hitboxes(): Array<{ x, y, z, r, kind: 'hurt'|'attack' }>,  // for the Lab overlay
  currentAction?(): object|string|null  // optional, Lab readout (the running action)
}
```
**Attacks and selection** (`attacks.js` `ATTACKS`: the singles, the strings, `roar` and, spread in,
`FIRE` from `fireAttacks.js` and `BULLET_HELL` from `bulletAttacks.js`; their numbers are
`TUNING.attacks`, into which `tuningFire.js` `FIRE_ATTACKS` and `tuningBullets.js` `BULLET_ATTACKS`
are merged). `dragon.hitPlayer` multiplies every blow's damage by `TUNING.damageScale` (0.85), except
hits flagged `bullet: true`. The AI picks any entry generically: `ai.js`
`attackWeight(def, name, d, sense)` reads `phase` (first phase, on the def or `TUNING.attacks[name]`),
`weight` (a number, `[P1, P2, P3]` or a function of `(dragon, sense)` returning either; per-phase
arrays go through `perPhase(v, phase)`) and `air` (usable while airborne; no entry sets it today, as
every flight runs inside one action). `Brain._choose` skips entries on `cooldown` and damps the last
two picks (×0.3, ×0.65). Melee stays allowed while hazards burn. String and single attacks gate their
weight on an AI band (`bandWeight`: `range` in model units × SCALE, `maxAng` / `minAng`); fire attacks
gate on world-metre distances in their own `weight(d, s)`. `TUNING.openingCooldowns` hold the ranged
singles back after the intro. `TUNING.unlockStagger` [first, step, jitter] ([2, 2.5, 2] s) staggers
the abilities a new phase unlocks: in a random order, the i-th gets an opening cooldown of first +
step × i + a random share of jitter (`enterPhase`; the nova opener is not delayed).
**Strings** (contract 1, `makeString(name)`): `TUNING.attacks[name].hits` = N hits, each `{ kind,
side?, tell, windup, hold?: [min, max], active, impact, damage, knockback, chance?, ...kind extras }`
(`side` ±1 = the limb on the hero's side at the string's start / the other one; `hold` = a random
extra windup hold that baits an early parry; `chance` < 1 = rolled at the string's start), plus the
string's `recovery`, `cooldown`, `weight`, `phase`, AI band `range` [min, max] and `maxAng` /
`minAng`. The phase list is per hit `windup{N}` (windup × `tScale` + hold) and `active{N}`, then
`recovery`. Every realised hit gets a beat (`combat:tell` at its windup start, `combat:flash`
`flashLead` before its impact, holds included) carrying `{ hit, wi }`; the kinds (`KINDS`: claw,
overhead, bite, rearBite, lungeBite, wing, tailJab, tailSweep, hop, stomp) perform them through pose
fields (`init`, `windup`, `aim`, `active`, `endActive`, `recover`, `hit`, `zone`, `noBreakActive`).
A string def carries `string: true`, `melee: true` and `noBreak(a)` (a break waits out the pounce's
hop). Data rules (STRINGS / TIMING scenarios): a tell per hit, the first windup ≥ 0.7 s, ≥
`TUNING.minHitGap` 0.45 s from one impact to the next, each contact within ±85 ms of its flash + lead.
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
the shock ring is red; `end` queues `ATTACKS.nova` after the phase-3 roar when the AI runs.
`enterPhase(n)` queues the next transition at once if the HP is already past its gate (Lab, AI off).
Per-phase tuning (`[P1, P2, P3]`, read with `perPhase`): `turnSpeed`, `walkSpeed`, `phaseTimeScale`
(windups and recoveries; `tScale`), `idleGap`, `phaseGlow`, `phaseEmbers` (body embers / s),
`posture.max`, `rest.jaw`, attack weights. Phase-2 values of the singles (`activeP2`, `sweepP2`, the
3-shell volley, the leap) apply from phase 2 on. `phase2At` / `phase3At` / `phase2TimeScale` are kept
for older readers.
**Flights** (contract 3, short flights inside one action, ADR-030): `takeOff` sets `state =
'airborne'` (`dragon:takeoff`; body circles empty, a stagger or break waits), `touchDown` returns to
'combat' (`dragon:land`). Flights stay ≤ 16 m up (the tests see ≤ 13.5 m) and inside the bound; the
hurt spheres ride the drawn body, so a flying wyrm is out of sword reach (lowest sphere 5.3–10.1 m in
the tests) and only the plunge reaches its head.
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
middle knuckle, `b.wi`: the wing buffet), 'tailTip', 'shell', default chest. The stomp's red ground ring is centred between the two forefeet's landing
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
- red (dodge-only) hits: `uWarn` on every material (`model.mats`), driven in `_updateWarn` from the
  running action's beats — strength ramps 0.1 → 0.38 from the hit's `combat:tell` to its
  `combat:flash`, spikes to 1.6 on the flash, decays to 0 in 0.25 s (game time). A replaced action
  (stagger, posture break, parry recoil, plunge reaction, death, Lab interrupt) drops it at once;
  `reset()` and death zero it. Plus a red glyph burst + red light at the striking part on the flash
  (`fx.tellFlash`). Each hit of a string is its own beat, so a red hit inside a string glows on its
  own windup only. An action with a red glow but no blow of its own (Armageddon's rear-up and
  salvo) sets `dragon.bodyWarn` 0..1 every frame: the same 0.1 → 0.38 ramp, read and zeroed by
  `_updateWarn`.
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
  its own) and, for meteors, `craterBurn` s + `tickDamage` / `tickBurn`: the crater burns on with
  contact ticks like a burning strip (blockable, never while rolling). The pool holds 64 hazards.
- Also: `cutStrip(ref)` (a knocked-out pass stops its front; the burnt part lingers), `timeTo(ref,
  px, pz, vx, vz, pr)` (s until the hazard reaches a moving point: the spawning attack re-times its
  own flash with it), `count(kind?)`, `clear()`.
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

**Fire attacks** (`fireAttacks.js` `FIRE`, numbers `tuningFire.js` `FIRE_ATTACKS`; the same action
shape as attacks.js: phases / beats / zone / weight / start / enter / update / hit / end): flights
`skyStrafe`, `diveBomb`, `hoverBarrage`; spells `meteorRain`, `eruptions`, `flameRing`,
`flameWall`, `nova`. Every blow is red; each attack has one tell beat per blow unless its hazards
announce themselves (the meteor cast has no beat: each meteor rings and flashes). Hazard-dealt blows
pass `plunge: false`, except the burning pass's strip front and the hover barrage's shells (spawned
with `plunge: true`: the airborne plunge); the dive's crash and the nova pass the default (a perfect
dodge may plunge).
Each emits `dragon:spell {name, x, z}` at its signature moment. `meteorRain` is not picked while a
rain or meteors are still falling. The nova keeps its 2.5 s charge in every phase (it is the tell)
and is the phase-3 opener. Numbers and gates: COMBAT.md "Current numbers".

**Bullets** (ADR-039; `src/entities/dragon/bullets.js` `class Bullets`, internal to the dragon
module: `dragon.bullets`; rules in COMBAT.md "Bullets"): the pooled bullet field (360 records, 8
hit-cap groups) and the fire wheel. `dragon.update` calls `bullets.update(dt)` after the hazards
every frame (guarded: an error logs once and clears the field, never throws); cleared on `reset()`,
on every phase change, when dying / dead, and fizzled by a posture break. No per-frame allocations.
`bullets.js` must not import `attacks.js` (`attacks.js` → `bulletAttacks.js` → `bullets.js`).
- Kinds `BULLET { EMBER, WISP, ORB }` (specs `TUNING.bullets.ember | wisp | orb`).
  `spawn(kind, attack, x, y, z, yaw, speed, group = -1, life = 0)` → the record or null (pool full,
  NaN or an unknown kind); `burst(attack, x, y, z, n, wait, stagger, speed, group)` (embers that hang
  and drop on the hero one by one: the Cinder flurry's slam); `group(max, retMax =
  TUNING.bullets.returnBudget)` → a group id: the pattern's hit cap and the HP its returned shots
  may deal in all (past it a perfect parry is a plain deflect);
  `count(kind?)`, `live`, `clear()`.
- A pattern's headline beat follows its lead bullet: `setLead(b)`, `leadAlive()`, `leadPos(out)`,
  `leadTti()`; the beat part `'bullet'` in `dragon.partPos` resolves to it (the mouth when none).
  `headlined(kind, tti)`: the brain has flashed the headline, so the lead's impact is announced
  (it covers the clump and stamps the lead's `cueAt`). `holdFlash(a, beat, kind)` → true when the
  field takes over a headline flash that the ending action could not send yet (the lead is still
  flying): the field then calls `dragon.flashTell(a, beat)` `flashLead` before the lead's impact,
  at once if the lead dies or is deflected, and never after a clear / fizzle / the wyrm's death
  (the same as an interrupted pattern: a tell without a flash). One held flash at a time.
- A bullet cue stands for one predicted impact (`cueAt`, in the bullet's own time). A homing wisp
  still flying `TUNING.bullets.recue` s after that moment is cued again on its next approach, or
  is a dud when that cue could only come too late.
- The wheel: `startWheel({ attack, x, z, n, ang, dir, warn, dur, speed, r0, r1, width, damage, burn,
  knockback, max, headline, offs })`, `stopWheel()`, `wheel` (the record: `on`, `lit`, `ang`, `offs`,
  `hits`, ...). Spoke i lies at `ang + offs[i]`. With `offs` (≤ 8 angles) the spokes are the tongues
  of a breath (the Scouring breath, ADR-050): the attack calls `aimWheel(x, z, ang, om, px, pz)` every
  frame after the rig (root = the mouth's ground projection, `ang` = the head's yaw, `om` its turn
  rate, `px / pz` the pivot the root swings round: the wyrm's root). Without it, `n` spokes evenly
  round turn by themselves (`speed`, one reversal). A spoke's cue (`tt`) steps the wheel forward
  (tongues turning at `om`, the root orbiting the pivot, the hero on his sensed velocity) to the
  first touch: a breath's root moves, so a fixed-origin estimate came far too late.
- Hits go through `dragon.hitPlayer({ ..., bullet: true, perfect, plunge: false })`: the damage is
  final (no `TUNING.damageScale`), `player.takeHit` receives `light: true` and `perfect` (false for
  embers and wisps: a roll is a plain dodge), and a parry does not call `dragon.onParried`.
- Perfect parry → the return (ADR-051): on `RESULT.PARRIED` the field reads
  `game.player.deflect.perfect`. Normal: the bullet ricochets to `rig.pt.head` (`ricochet` m/s) and
  the kind's `posture` applies at once. Perfect (embers and wisps; orbs are never parried): the bullet
  is `returned`, flies at `returnSpeed` m/s drawn ×`returnSize` (`BFX.drawReturned`) and, on reaching
  the head, deals the kind's `returnDamage` through `dragon.takeHit({ part: 'head', exact: true,
  posture: returnPosture })` (the phase gate holds, it may kill; the action is never interrupted;
  posture breaks are allowed), flinches the head and emits `dragon:returned {kind, damage, x, y,
  z}`. Only the struck bullet returns (the clump it pops does not); returned shots in flight die
  silently on a clear and fizzle on a posture break like any bullet.
- Tells: a bullet (or an approaching wheel spoke) emits a paired `combat:tell` + `combat:flash` with
  `hazard: true, bullet: true` `flashLead` before impact (`cue()`; `cover()` lets impacts within
  `cueGap` ride on it). A deflect emits `dragon:parried {attack, tell, hit: 0, last: false, bullet:
  true, perfect}` and adds the kind's `posture` (a perfect one: its `returnPosture` when it lands).
- Reads the hero through `game.player`: `isSwinging()` + `sweep` (cutting), `radius`, the sensed
  velocity (`dragon.sense.vel`).
- Look: `bulletFx.js` (glyph particles through `DragonFx`'s pools; STYLE.md "Bullets").

**Bullet patterns** (`bulletAttacks.js` `BULLET_HELL`, numbers `tuningBullets.js` `BULLET_ATTACKS`,
spread into `ATTACKS` like `FIRE`; the same action shape): `emberStorm` (the Ember torrent),
`fanVolley` (the Cinder burst), `wispSwarm`, `fireWheel` (the Scouring breath); the keys are the
contract (audio, Lab, tests), the labels are display names. Each emits `dragon:spell {name, x, z}` at
its cast; the torrent and the Scouring breath also emit `dragon:breathStart` / `dragon:breathEnd`
(the breath loop). **Every bullet is breathed (ADR-050):** `spit(d, kind, attack, dyaw, speed, grp,
life)` spawns it at `rig.pt.mouth` along the head's actual aim (`pt.headFwd`) + `dyaw`, with a
`drop` scaled to the mouth-to-hero distance (`TUNING.bullets.dropK / dropMin / dropMax`: a close hero
is not flown over); patterns emit from their `hit()` hook (after the rig, so from the jaws as drawn)
and aim the head first (`aimHead`: reach out of the neck base, `headExact`, a look down the line).
No pattern spawns from the body or the wings. The wisps are roared from the mouth in a spray (their
initial headings fan out round the head). A P3 Cinder burst may queue an Ember torrent
(`brain.queued`, `fanVolley.chain`). A string hit may carry `burst: { n, wait, stagger, speed }`
(`cinderFlurry`'s overhead): embers scattered by its slam, rising out of a puff of flame.

**Melee FX hooks** (`DragonFx`, called by `attacks.js` through optional calls): `clawTrail(wi, toe,
heavy)` (a claw's burning wake, every active frame of a claw / overhead hit) and `slamBurst(x, z, r)`
(the ground burst under a slam).

### HUD — `src/ui/hud.js` exports `class Hud`
```
constructor(game)          // builds DOM under #ui (inject its own <style>; do not edit style.css)
update(realDt)
log(text, channel='system')          // channel: 'system'|'combat'|'warn'|'lore'
showBossBar(name) / hideBossBar()    // boss HP + posture bar
banner(text, kind, opts)             // kind: 'death'|'victory'|'area'|'bonfire'|'phase'
bannerHint(text) / clearBanner(instant)   // sub-line under the current banner; flow uses both
showStats(rows)                      // victory / death run stats
prompt(text|null)                    // interaction prompt, e.g. "[@interact] Rest at bonfire" (the chip shows the bound key)
promptText                           // getter: the prompt shown now (raw "[@interact] ..." text) or null
promptEl                             // the prompt's element (touch controls make it a tap target)
pauseUi.buttons; titleUi.stageButtons  // the menu buttons in order, for the gamepad's focus
remapUi                              // the CONTROLS panel (ui/remap.js; see Bindings)
showTitle() / hideTitle();  showPause(bool);  toggleHelp()
// the pause menu (ui/screens.js PauseMenu): RESUME · QUALITY · SOUND · CONTROLS · FULLSCREEN /
// PAD POSITION / PAD SIZE (touch) · QUIT TO TITLE (pressed twice within 3 s → flow.quitToTitle())
```
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
attacker — COMBAT.md). Its only tell cue is a brief red screen-edge flash (~0.25 s, game time,
stronger on the attacker's side) on a red `combat:flash`, dropped by a stagger / posture break /
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
Every sound is procedural (no samples). 2026-11-09 additions:
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
  `flameIgnite`, nova `novaCharge`; `dragon:hazard` → meteor fall `meteorFall`, hit `meteorHit`,
  `pillar`, `crash`, `novaBlast`; a `combat:tell` with `hazard: true` → `hazardTell` (lighter than the
  red brass sting, no music dip). Spatialised at the event's x / z. Bullet patterns reuse the
  casts: emberStorm / fanVolley / fireWheel `flameIgnite`, wispSwarm `meteorCast`. A `combat:tell`
  with `bullet: true` plays nothing, its `combat:flash` plays the ping without the music dip, and a
  `dragon:parried` with `bullet: true` plays no yelp (the clash is `player:parry`).
- `dragon:phase3` replays the phase-2 sting and keeps 'boss2'; `dragon:plunged` → `dragonPain`
  (an execution: the `postureBreak` roar).

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
new Bindings(storage = localStorage)   // loads 'abyss.bindings.v1'; storage null = defaults, nothing saved
codes(a) / buttons(a)       // the keyboard-mouse codes / pad button indices bound to action a
bindKey(a, code) / bindPad(a, i)   // replace a's binding; false when refused (reserved, fixed, wrong device)
reset(save, 'kb' | 'pad' | null);  isDefault(which);  onChange(fn) → unsubscribe;  version
keyText(a, all) / padText(a, layout, all) / moveText()   // on-screen names ('E', 'Tab / MMB', '△', 'WASD')
keyLabel(code) / padLabel(i, layout);  installActions(input, bindings)   // the act* API (Input, test mocks)
```
Actions: up, down, left, right (keyboard only), attack, block, dodge, sprint, flask, lockOn,
interact (rest / fight again), help, mute (keyboard only), zoomIn, zoomOut (pad only), pause
(fixed: Esc / the pad's Menu). Keyboard codes are `KeyboardEvent.code` or `Mouse0`-`Mouse2`; pad
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

**The pad** (ADR-096; `CONFIG.touch.pad`): ATTACK, BLOCK and DODGE are three tiles of one cluster
that all share an edge with each other (ATTACK bottom right, BLOCK on top of it, DODGE down their
left side), raised and inset from the corner. The pad is one pointer surface (`.tc-pad`; the tiles
take no pointers themselves): a touch on it, or up to `reach` (26 px) outside the cluster, presses
the nearest tile, and a thumb that **slides** onto another tile releases the first and presses the
second without lifting (release edge first; it must leave its tile by `stick`, 10 px; a slide that
wanders further than `reach` from every tile keeps what it holds). Each finger holds its own tile.
The player places the cluster in the pause menu: PAD POSITION (low / mid / high: `pad.pos`) and
PAD SIZE (small / medium / large: `pad.size`), kept in `localStorage` (`abyss.touchPad`); the
controls show through the pause screen, inert, while they are stepped (`.tc-root.peek`). Screens
taller than 560 px get everything × `pad.tall`. API: `padPos`, `padSize`, `cyclePad('pos' | 'size')`,
`padPoint(id)` (the screen point at a tile's middle), `padGeo`.

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
  stoneMaterial, slabMaterial`) plus, optionally, `ash: true` (atmosphere: falling ash flakes and a
  few embers instead of fireflies, mist and leaves) and `grass: { density(x, z) → 0..1 factor,
  height (×), ash 0..1 }` (world.js thins / shortens / greys the meadow; grass.js `uAsh`).
  A set may also bring its own night and weather (ADR-070; the throne hall does):
  - `sky: { moonColor, moonDir, ambient, fogColor, fogNear, fogFar }` (all optional): world.js writes
    it into the shared uniforms once, right after the set is built.
  - `ambience: { setup(game), update(dt, game), ... }`: atmosphere.js calls `setup` once (lights,
    its own particle batch: `game.pipeline.registerParticles`) and `update` every frame INSTEAD of
    the fireflies / mist / leaves / ash (the bonfire's flames stay). The throne hall's also has
    `flare(k)`: its floor seal brightens and settles (the boss calls it; optional for callers).
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

### Duelists — `src/entities/enemies/duelist/` (ADR-068)
The engine every human boss runs on (the Ash Disciple, the Starless Lord); a boss is a KIT of data and
a subclass with a few hooks.
- `duelist.js` `class Duelist(game, kit)`: the boss slot's surface, the guard, posture, the break and
  the execution, the deflect chain, the blade lock, the mikiri, the full deflect, hit stun, `hitPlayer`.
  `kit = { id, TUNING, MOVES, MOVE_NAMES, CLIP, realise, transitions {phase: move}, counterMove(phase),
  maxPhase, loadout, poses, blade {guard, tip}, scale, REACT, OPEN }` (`scale`: his drawn size, model
  metres → world, default `HERO_SCALE`; visual only, as the hero's: it is `d.drawScale` and the
  pilot's `drawScale`, so the animator's gait matches it). `reset()` resets the animator before the
  brain, then poses one short step: he waits in his waiting clip (kneeling, enthroned), not in the
  walking clip's guard. Subclass hooks: `_tint(M)`, `_setup()`
  (extra meshes, before batching), `_makeFx()`, `_makeBrain()`, `_bladeMaterials(dt, M)`, `_onHpZero()`
  (default: he dies), `brainFrame(dt)`, `afterPose(dt, act)`, `onImpact(beat, sense, act)`,
  `onRelease(beat, sense, act)`, `onCast(beat, sense, act)`, `beatMotion(beat, u, sense, dt)`,
  `onTransitionEnd(act)`, `clampTarget(point)`. `d.T` = `kit.TUNING`. `drawnPoint(v)`: an upright
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
- `realise.js`: `makeRealise({ TUNING, MOVES, compileClip })` → `realise(name, phase, rnd)`; `perPhase`.
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
  projectiles (each may carry its own `speed`, `radius`, `half`, `life`, `style`), `update(dt, d)`.

### Ash Disciple — `src/entities/enemies/ashDisciple/disciple.js` exports `class AshDisciple`
A `Duelist` with `ASH_KIT` (moves.js, tuning.js, gear.js, poses.js): his colours, the kindled blade
of phase 2 and the Ash Crescent are his own. The boss slot's surface above (no plunge), plus:
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
       kill, reset, setHp, hitboxes, currentAction); phase3() → false (two phases)
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
moveBy / clampTarget           // he keeps to the hall's floor: the rectangle TUNING.hall, not a circle
_glide(dt)                     // in footwork past TUNING.glide.on m/s: the animator's 'glide' clip, the root
                               // lifted TUNING.glide.hover m, a wake under him; a backstep / sidestep likewise
debug.phase4(), debug.setForm(n), debug.form
```
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
'glaive' | 'debris' | 'storm' | 'star' }`. fx.js `LordFx extends DuelFx`: the blades' glow and red
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
- `player:attack {kind:'light'|'slam'|'cleave'|'thrust', combo, charge}` (swing starts; combo 1–5 = the chain hit, slam = hit 5, the sprint slash and the roll cut report 1; cleave = the charge's release, thrust = the execution against a duelist),
  `player:charge {t}` (charge start; t = seconds to full charge), `player:slam {x, z}` (the slam meets the ground: shard burst),
  `player:hitDragon {damage, part, point, heavy, crit, kind, guarded, combo, weight, shards}` (heavy = slam / cleave / thrust / plunge; kind 'plunge' = the
  head-stab, crit on an execution; guarded = a duelist's guard turned it: damage 0; point = where the cut is drawn
  (on a duelist: after his shove, where he is drawn in the held frame);
  combo = the chain hit 1-5 (1 outside the chain); weight = the cut's look and sound tier, the attack's contact:
  light, sweep, point, slam, cleave or execute; the plunge's has neither; shards = true when only the slam's ground
  shards hit (the blade is in the ground: weight null, no cut drawn, no blade sound)), `player:hurt {damage, kind, hp}`,
  `player:bounced {heavy}` (a duelist's guard deflected the hero's strike: his blade is thrown back),
  `player:block {damage, tell}`, `player:parry {tell, attack, chain, light, perfect, last}` (last = false for a string's non-final blow; chain = the hero's parries in rhythm, ≤ 1.1 s
  apart, 1 = single; it can run across two strings; light = a deflected bullet: a lighter clash; perfect = pressed within
  `DEFENSE.perfectParryWindow`: with light, the bullet is returned), `player:guardBreak {attack}`,
  `player:guardOpen {attack}` (the guard meter ran out on a blocked blow: the blow was blocked, the guard is knocked open for a
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
  a cut; it went through the blow and through the attacker; HUD "FLASH COUNTER")
Dragon (any attacker; the BOSS SLOT: the wyrm or the level's boss, e.g. the Ash Disciple, emits the same
`dragon:*` names, see "Levels and the boss slot") → hud/audio/flow:
- `combat:tell {source:'dragon', attack, tell, impactIn, x, z}` (windup start, per hit, so once per hit of a
  string; x/z = the striking part; impactIn is a first estimate in game seconds),
  `combat:flash {source:'dragon', attack, tell, x, y, z, perilous}` (~0.35 s before impact — the **authoritative**
  timing cue: moving targets (charge, fireball) and hazard-dealt blows re-time it after the tell; perilous:
  a duelist's mikiri thrust, roll into it),
  `combat:clash {heavy, crush, counter, x, y, z}` (the trade clash: the hero's cut met a duelist's blow at the same moment and
  neither landed; heavy = the hero's cut was a heavy one, crush = a full cleave that was not thrown back, counter = the
  flash counter (it is followed by player:counter and the HUD shows that instead); HUD "CLASH",
  audio two steels ringing, a flicker of the frame),
  `combat:deflectChain {count}` (the attacker's count: the 2nd, 3rd ... parry in a row within one string;
  a hit that lands or is blocked resets it, dodges keep it; contract 1; the HUD shows "DEFLECT ×N")
- `dragon:wake`, `dragon:roar {strength}`, `dragon:introDone`, `dragon:windup {name}`, `dragon:attack {name}`,
  `dragon:step {x, z, heavy}`, `dragon:wingFlap {strength}`, `dragon:takeoff`, `dragon:land {x, z}` (the leap,
  every flight, and the crash of a plunged flier),
  `dragon:breathStart`, `dragon:breathEnd` (the breath and the sky strafe's pass), `dragon:fireball {x, y, z}`,
  `dragon:explosion {x, z, radius}`,
  `dragon:bite`, `dragon:hurt {damage, part, hp, crit}`, `dragon:parried {attack, tell, hit, last, bullet, perfect}` (hit = 0-based
  index in its string, last = the string's last hit or a single attack: only then a recoil; bullet: true = a
  deflected bullet, hit 0, last false: posture only, the wyrm is not interrupted and audio stays silent; perfect:
  true = the bullet is returned), `dragon:returned {kind, damage, x, y, z}` (a perfectly parried bullet's return
  lands on the head: kind 0 ember / 1 wisp, damage dealt, x/y/z the head; audio plays its hit, the HUD its number,
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
  `dragon:spell {name, x, z}` (a fire attack's signature moment: the strafe's pass, the dive, the barrage's
  rise, a spell's cast / the nova's charge start), `dragon:hazard {kind, stage, x, z, radius}` (a fire hazard:
  stage 'fall' = a meteor starts its visible fall, 'hit' = a meteor / pillar / the dive's crash / the nova goes off,
  'launch' = a bolt of Armageddon's salvo leaves the jaws, 'sky' = the sky answers it: the barrage begins)
- Hazard tells: a self-announcing hazard (meteors, chase pillars) emits combat:tell / combat:flash with
  source 'dragon', its spell as the attack, tell 'red' and hazard: true (audio plays a lighter cue)
- Bullet tells: a bullet about to hit, or an approaching spoke of the fire wheel, emits combat:tell /
  combat:flash with source 'dragon', its pattern as the attack, the bullet's tell (normal / blue / red),
  hazard: true and bullet: true (audio: the flash ping alone, no tell sting, no music dip)
Flow → hud/audio:
- `state {from, to}`, `bonfire:rest`, `game:retry`, `game:victory`, `area {name}`,
  `game:cinematic {kind}` (flow.cinematic: slow motion and a close camera on a duel's big moment; kind
  fullDeflect / bladeLock / mikiri / execution / perfectParry (the hero's perfect parry of a blade: a short
  slow motion, no gong), or lock = the blade lock's camera push-in: no slow motion,
  audio plays no gong)

## Ownership (parallel work)
Foundation (read-only for module authors unless their brief says otherwise): `src/core/**`,
`src/render/**`, `src/world/**`, `src/combat/**`, `src/main.js`, `index.html`, `src/style.css`.
Each module owns only its directory. If a module needs a foundation change, it reports it instead of editing.
