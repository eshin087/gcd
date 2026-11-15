# Architecture Decision Records

Short records of significant decisions. Append new ones; don't rewrite history — supersede instead.
Template: **Context** (why decide) · **Decision** · **Consequences**.

## ADR-001 — Browser + Three.js, plain ES modules, no framework (2026-11-01)
- **Context:** fastest iteration on a custom rendering style; the reference (Ansenjeo) is also JS.
- **Decision:** Three.js (WebGL2) with hand-written ShaderMaterials; plain ES modules served as-is in
  dev (import map → `node_modules`); esbuild only to produce the single-file release.
- **Consequences:** no bundler config to maintain; zero-install play via `dist/index.html`; we own
  all shaders (no three.js lighting/shadow chunks), so shared GLSL lives in `render/shaderLib.js`.

## ADR-002 — Hybrid ASCII rendering (2026-11-01)
- **Context:** the reference uses three glyph techniques: arranged stroke glyphs (grass, dragon
  skin), screen-grid ASCII (rocks, canopies) and glyph FX.
- **Decision:** materials write an alpha FLAG into an HDR scene target; a post pass converts flagged
  pixels to a pixel-exact character grid (stone / leaf ramps); creatures use surface-space glyph
  cells; FX are glyph particles composited after the grid pass with a soft depth test.
- **Consequences:** every visible thing must pick one of these paths (see STYLE.md). New looks are
  added as new ramps/flags or glyph layouts, not as conventional shading.

## ADR-003 — Module contracts + event bus (2026-11-01)
- **Context:** modules were built in parallel by several agents and must keep scaling.
- **Decision:** a shared `game` context object, explicit per-module contracts and an event catalogue
  in `docs/ARCHITECTURE.md`; HUD/audio/flow react to events instead of being called directly.
- **Consequences:** adding a feature = emit/subscribe catalogued events; contract changes must update
  the doc and all consumers in one commit.

## ADR-004 — Headless integration tests with real modules (2026-11-01)
- **Context:** agents often cannot watch the game; logic regressions must be caught without WebGL.
- **Decision:** `tests/integration` runs the real Player/Dragon/Hud/Flow/Audio with a mocked DOM,
  WebAudio and world, driven by a bot through scripted scenarios; `tests/glyphcheck.mjs` statically
  validates glyph literals.
- **Consequences:** `npm test` must stay green on `main`; new systems add scenarios.

## ADR-005 — Hosting: GitHub (public) + Vercel static deploy (2026-11-01)
- **Decision:** public repo `eshin087/gcdAbyss`; Vercel project `gcdabyss` builds `npm run build`
  and serves `dist/` at gcdabyss.vercel.app; every push to `main` deploys, PRs get previews.
- **Consequences:** `main` must always be shippable; CI runs tests + build on every push/PR.

## ADR-006 — Protected main, PR-only changes, lean deployments (2026-11-01)
- **Context:** the owner wants every change reviewed through a PR and auto-deployed, and Vercel
  deployment storage across the owner's projects had grown far past the quota from stale deployments.
- **Decision:** GitHub branch protection on `main`: PR required (0 approvals, enforced for admins),
  required check `test-and-build` with up-to-date branches, linear history, no force-push/deletion;
  squash/rebase merges only, branches auto-delete. Vercel: Git integration only (no CLI deploys),
  30-day retention for every deployment state, and an `ignoreCommand` that skips docs/tests-only
  commits.
- **Consequences:** releases happen by merging PRs; production is always the latest merged `main`;
  previews exist per PR and expire automatically.

## ADR-007 — Everything visible goes through the screen-space ASCII grid (2026-11-01)
- **Context:** v0.1 grass (instanced stroke quads) and creatures (surface glyphs) read as "solid",
  while the screen-grid trees were the owner's reference for the right ASCII feel.
- **Decision:** one pixel-exact character grid for the whole frame. Materials write lit colour plus
  an alpha class code: grass (procedural meadow drawn in the pass from depth -> world position),
  leaf, stone (with outline glyphs on raised stones) and creatures, whose code packs a glyph set
  (scales / strands / plates / smooth) and the screen-space flow angle so glyphs follow the body.
  Creature cells use their own dark backing and brightness ramp.
- **Consequences:** every glyph on screen is aligned to the same grid. New looks are new grid rows
  + class codes in `glyphs.js` / `pipeline.js`, not new geometry. Instanced grass is gone (cheaper).

## ADR-008 — Tell-driven combat without stamina (Phantom Blade Zero model) (2026-11-01)
- **Context:** v0.1 was a stamina-gated soulslike; the owner wants an approachable RPG/MMO fight
  where skill means reading tells.
- **Decision:** remove stamina. Every enemy attack declares `normal` / `blue` (parryable) / `red`
  (dodge only) in data; shared windows and posture numbers live in `src/combat/rules.js`;
  `takeHit` returns a `RESULT`; perfect dodges trigger Ghostep (blink behind, slow-mo, crit window);
  parries and hits fill a posture meter that breaks into a crit window. `combat:flash` is the
  single authoritative timing cue.
- **Consequences:** new enemies only declare data + call the shared contract; the HUD, audio and
  Lab render any attacker's tells for free. Balance is tuned in data, not code.

## ADR-009 — Phase gate on boss HP (2026-11-01)
- **Context:** stacked Ghostep / posture-break crits could take the wyrm from >50 % HP to dead,
  skipping phase 2 and its transition entirely.
- **Decision:** while the AI runs the fight, phase-1 damage clamps at the phase-2 threshold until
  the transition starts. The Lab (AI off) bypasses the gate.
- **Consequences:** every player sees phase 2. Hits at the threshold still show damage numbers but
  don't move the bar; revisit if it reads as unfair in playtests.

## ADR-010 — Tells live on the attacker, not in the HUD (2026-11-01)
- **Context:** v0.2 showed tells as HUD marks over the enemy (◆ PARRY / ! DODGE labels, closing
  rings, off-screen arrows, red edge pulse through the windup) plus log tips. The owner rejected
  text indicators: dodge-only attacks should read as a red warning flash from the enemy itself, and
  parryable attacks should be read from the animation.
- **Decision:** the attacker renders its own tell. Red (dodge-only): the creature glows red
  through the windup via a material uniform (`uWarn`, ramping toward the timing cue), spikes on
  `combat:flash` with a red glyph burst, and AoEs keep their red ground ring. Normal / blue
  (parryable): no colour during the windup; a white glint at the striking part on `combat:flash`,
  larger and brighter for blue (still white). The HUD keeps only a ~0.25 s red screen-edge flash on
  a red cue; no text, icons, rings or arrows in the world. `TELL` semantics and the
  `combat:tell` / `combat:flash` contract are unchanged; the presentation numbers live in
  `TELL_STYLE` (`rules.js`). Supersedes the HUD-marks part of ADR-008's "HUD renders any
  attacker's tells".
- **Consequences:** every new enemy must expose `uWarn` on its materials (free with
  `createSurfaceGlyphMaterial`), drive it from its tell beats, and have windups readable from the
  animation alone — parryable hits get no colour hint before the glint. Readability now depends on
  animation quality; the Lab's coloured chips remain as a dev aid.

## ADR-011 — Hybrid rendering: calm world-anchored grass, crisp surface-glyph creatures (2026-11-01)
- **Context:** ADR-007 put everything through one screen-space character grid. In review the owner
  found the grass "TOO ascii" (noisy, distracting), the ground seemed to move as the camera panned
  (dizzying: glyphs were re-picked per screen cell every frame), the hero was hard to find and the
  hero and wyrm were blurry (one glyph per 8x12 px cell is too coarse for a 50 px hero).
- **Decision:** supersede ADR-007 for grass and creatures. Grass returns to v0.1's instanced glyph
  strokes fixed in the world, darker and with gentler wind. Creatures print glyphs on their surface
  again (v0.1 technique), but sized to stay >= ~6 screen px, drawn larger inside their cells with
  sharpened edges, over near-black gaps; the hero gets a thin moonlit silhouette line. Stones,
  ruins, trunks and canopies stay on the screen grid (the owner's favourite part). The creature
  grid path remains available behind `grid: true` but is unused.
- **Consequences:** two glyph systems to keep visually consistent (STYLE.md rules of thumb). The
  ground is calm by construction. Glyph legibility now depends on cell size vs camera distance, so
  new creatures must check it at the default zoom (Lab → Showroom helps).

## ADR-012 — Concept sheets drive the look; stones become carved world-lattice glyphs (2026-11-01)
- **Context:** the owner supplied concept sheets (Shadow Swordsman: model, movement and combat key
  poses; Obsidian Drake: painting + ASCII version) and asked to copy them. They also disliked the
  screen-grid stones (`+=+=` rows read as text).
- **Decision:**
  - The hero and wyrm follow the sheets within the existing skeletons. The wyvern stays a wyvern
    (owner's choice), and the wyrm grows to 1.5× its v0.2 size (`SCALE` 1.875).
  - Rocks, standing stones and flagstones use `createCarvedGlyphMaterial`: a world-anchored glyph
    lattice perpendicular to the fixed camera view, glyphs picked by facet light, with cracks and
    moss. Trees, bones and the bonfire stay on the screen grid.
- **Consequences:**
  - The sheets are the reference for future look work.
  - Carved glyphs shrink with zoom, unlike the grid.
  - A bigger wyrm needs the player reach band (ADR-013) and a bounded boss camera.

## ADR-013 — Player reach band, step-in assist, hero-first boss camera (2026-11-01)
- **Context:** at 1.875× the wyrm's chest sits ~4 m up. Blade-vs-sphere hits missed from the front.
  The automatic boss framing then zoomed out to ~50 m, shrinking the hero the owner already found
  hard to see.
- **Decision:**
  - Sword hits test a vertical reach band (2.6 m up, 1.0 m for the slam; 0.5 m down; 0.4 m tip
    extension).
  - A short step-in assist (≤ 1.3 m) applies when the target is within 4.8 m and 0.8 rad.
  - The boss camera may add at most 5 m of zoom. The wyrm crops at the screen edges before the hero
    shrinks.
- **Consequences:**
  - All attacks land from 2–3.5 m in front (REACH scenario).
  - Very large future bosses will crop at the screen edge. That is accepted: readability of the
    player comes first.

## ADR-014 — Four-legged drake; look work is reviewed against the sheets by an independent critic (2026-11-01)
- **Context:** the restyled wyvern still didn't look like the owner's Obsidian Drake. A wyvern's
  wings are its front legs, and the art is a quadruped with separate sail-like wings. The owner
  asked for "as close as possible" and chose the rebuild.
- **Decision:**
  - The boss is a quadruped (`buildDrake`), with a new rig/gait and wings that rest half-raised.
    Every ability keeps its name, tell, windup, flash timing and damage.
  - Look work follows `docs/art/*.md`. It is checked in the Lab model viewer from the sheets'
    angles, by an independent reviewer who scores silhouette, proportions, details, colours,
    glyph rendering, poses and the game-camera read.
- **Consequences:**
  - Attack anchors moved to the real striking parts (forefeet, claws, snout, tail).
  - Hit-timing spreads are measured per ability in COMBAT.md.
  - Future look passes start from the critic's gap list rather than impressions.

## ADR-015 — Creatures as classic ASCII art: screen-grid conversion of a shaded source (2026-11-02)
- **Context:** the owner shared two reference images and asked for the hero and dragon to "look more
  ASCII like". The references are image-to-text conversions: upright characters on a fixed grid,
  density by brightness, per-character colour, black backing. Glyphs printed on 3D surfaces
  (ADR-011) don't read that way.
- **Decision:**
  - Creature materials render a smooth shaded source (`FLAG.ART`).
  - The ASCII pass converts it on a finer grid than the world's (owner's choice: smaller letters so
    the hero keeps a few rows at the game camera), using a density-sorted `ART_CHARS` ramp and the
    source hue.
  - Per-material `artGain` balances bright and dark inks.
  - The world grid (stones, trees) and the world-anchored grass are unchanged.
- **Consequences:**
  - Characters re-pick as creatures move, the inherent "ASCII video" look. This is acceptable for
    actors; the ground stays calm.
  - Surface-glyph patterns now only shape the source image.
  - At the default camera the hero is a small letter cluster; detail lives in close-ups.

## ADR-016 — Touch is a virtual layer on the input system; phones get their own camera (2026-11-02)
- **Context:** the owner tests on a phone. They couldn't close the Lab (it is keyboard-toggled) and
  had no controls.
- **Decision:**
  - Touch controls feed virtual keys, buttons and an analog axis into `core/input.js`
    (`setVirtual`, `setVirtualAxis`). Player and flow code are unchanged and read the same API.
  - Auto-aim parks `game.mouseGround` on the dragon instead of forcing lock-on.
  - The camera rig has a phone profile: 20 m default, extra zoom capped at 3 m.
  - Phones default to LOW quality.
  - Landscape only.
- **Consequences:**
  - Gameplay and tests are shared between desktop and touch (a `touch` test scenario).
  - Real-device checks are still needed for native multi-touch, iOS gestures and frame rate.

## ADR-017 — The hero is drawn bigger and leaned toward the camera; gameplay keeps the upright body (2026-11-02)
- **Context:** the owner saw the hero in game as ~9 rows of dense letters, "not showing the details"
  of the close-ups, and asked whether he should be bigger. From the 58° camera a standing figure
  shows mostly its top and spans about half its height; at 36 m that is ~5 % of the screen.
- **Decision:**
  - The hero's root draws him `HERO_SCALE` 1.2x and sheared away from the camera by half its pitch
    (29°, feet planted), so he faces the view. The animator poses the plain body first
    (`lean.on = false`); the drawn transform is applied after it.
  - Gameplay stays on the upright 1.85 m body: the sword's hit test unleans its points, the
    dragon aims at the unleaned chest, the hurt cylinder is unchanged. FX follow the drawn body.
  - The hero gets a finer pixel-font letter grid and a key-lit, edge-darkened source.
  - The camera distance is unchanged (wheel / pinch zoom still work).
- **Consequences:**
  - ~2.7x the letter rows with no change to combat balance or framing.
  - The drawn blade (1.8 m) is about the gameplay reach (1.5 m + `REACH.tipExt` 0.4).
  - The drawn body overlaps more of an attack's area than the hurt cylinder (generous to the player).
  - The moon shadow is cast by the leaned, scaled body.
  - New code that reads hero joint positions for gameplay must use `player.unlean()`.

## ADR-018 — The wyrm prints in a thin pixel font: letter sets by brightness, structure in alpha (2026-11-08)
- **Context:** the owner asked for the dragon and hero to look "as identical and good as" his two
  reference images. The dragon reference is thin, anti-aliased digits on black whose brightness
  draws charcoal scales, orange cracks and crimson sails; scale outlines cut through the letters. The
  v0.4 wyrm printed as a "silver blob": a 7 px bold browser font filled its 4x7 cells, one colour per
  cell dissolved shapes into digit noise, thin spikes vanished (a cell needed 2 of 4 samples), and a
  22-step density ramp re-lettered ~60 % of the lit cells every frame at idle.
- **Decision:**
  - The wyrm gets its own pixel font (`wyrmGlyphs.js`): one-pixel 4x6 glyphs with a soft halo in 5x8
    cells, mostly digits; 3x5 glyphs in 4x6 cells under 900 px tall.
  - A cell's brightness picks a letter SET (dim / mid / bright) and the cell's hash picks the letter
    inside it. Each stroke pixel takes brightness and hue from its own source pixel.
  - The material encodes structure in alpha: `0.5 + 0.01 × stroke code` (the screen direction of a
    thin part's outline). Coded cells and silhouette cells (marching squares on the 4 samples) print
    `/ | \` strokes; one sample is enough for a stroke cell.
  - A dedicated art source (`wyrm` material option): shingle scales with bright free edges, molten
    cracks along the scale gaps on down-facing surfaces, torn crimson membranes (`aEdge`, `aBone`),
    a key light fixed to the camera and greyed moonlight.
  - Round 2: the hide's scale outlines come from letter brightness only (rim strokes printed a field
    of chevrons at the game camera); strokes stay on thin parts and the silhouette.
- **Consequences:**
  - Supersedes ADR-015's single `ART_CHARS` ramp for the wyrm (the generic `artCell` path is gone).
  - Alpha 0.50–0.54 is the wyrm's stroke-code window (ARCHITECTURE.md alpha contract).
  - Letters still change on ~39 % of the lit cells per frame at idle (v0.4: 34 %); going lower needs
    a temporal buffer.
  - About +0.3 ms per frame on an RTX 4090 at 1080p (round 1).

## ADR-019 — The hero is ink-line ASCII art (2026-11-08)
- **Context:** the hero reference is anime line art turned into ASCII: a dim, dense letter fill
  inside bright ink strokes along every silhouette and panel edge (29 % bright / 59 % dim lit
  pixels). The v0.4 hero (ADR-017's key light, edge darkening and black depth gaps) was a uniform
  light-grey letter field (81 % bright / 18 % dim) and, at the 36 m camera, a pale column of text.
- **Decision:**
  - Hero materials write a PART ID into alpha (`HERO_ART`: `0.4632 + (part × 2 + aPart) × 0.0006`)
    instead of a flag.
  - The art pass draws bright ink lines on the silhouette, on the nearer side of depth steps and on
    part edges (the higher part draws), over dim fill letters.
  - All per-part look data lives in one table (`HERO_INK` in `player/model.js`: fill, line tint and
    gain, fill gain, line style, far values), packed into shared uniforms.
  - The source is an opt-in `heroArt` material block, compiled only for the hero (the wyrm's shader
    is unchanged).
- **Consequences:**
  - Supersedes ADR-017's hero shading (`uArtHeroKey` / `uArtHeroEdge` are left declared but have no
    effect) and its black depth gaps. ADR-017's size and lean stay.
  - Part ids need a half-float scene target; the 8-bit fallback collapses them (rare on WebGL2).
  - A new hero part needs a `HERO_INK` entry; parts layered on top get higher ids.
  - GPU cost stayed within noise on an RTX 4090.

## ADR-020 — The hero's ink lines are traced per pixel (2026-11-08)
- **Context:** round 1 drew one centred stroke glyph (`| - / \`) per 4x6 letter cell. Every diagonal
  and curve stair-stepped, which read as "boxy, robotic". The reference's lines are continuous
  ~2 px strokes with dotted rag edges.
- **Decision:** each hero pixel is classified against its 1-px neighbours: silhouette, depth step
  (the nearer side draws; a slope predictor skips curved and grazing surfaces), part edge (the higher
  part), piece edge (sub-id, up close). Lines are one font pixel wide with a dimmer second pixel up
  close, and break at the letter spacing so a contour reads as a chain of stroke glyphs; per part
  they are per-cell strokes, dotted (tails, hair) or unbroken (blade, gem). The letter grid only
  picks the fill letters.
- **Consequences:**
  - About 9 extra texture fetches per hero pixel (17 up close); GPU time stayed within noise.
  - The `PIXEL_LINES` atlas row is no longer sampled.
  - The lines are no longer quantised to the letter grid. Accepted: the reference's are not either.

## ADR-021 — At the game camera the hero is a dark figure cut out by a halo (2026-11-08)
- **Context:** at ~125–150 px tall almost every cell sat on an edge, so the hero read as a grey or
  white wireframe (mean luma 104–113, 43–51 % of pixels above 120). The reference scaled to that size
  is a dark figure (mean 56, 56 % below 50) with silver armour, pale lavender tails, a pale face and a
  cyan blade. A round-1 switch to heavy strokes at 14 m popped exactly at the phone camera's minimum
  distance.
- **Decision:**
  - A distance LOD by view depth (6 → 20 m, dithered per cell, no pop): a one-letter outline, piece
    edges drop out, cloth inner lines turn into dark seams (`farLine`), each part gets a far fill gain
    (`farFill`: cloth dark, armour bright), the silhouette is a dim cool rim, the blade's HDR is
    capped to a tight line.
  - A dark halo round him darkens the world grid next to his figure (two rings of taps round his
    screen position), fading in from 8 to 20 m.
- **Consequences:**
  - Facing away (the usual fight view): mean luma 113 → 80, above-120 share 51 → 24 %. Still brighter
    than the scaled reference (80–97 vs 56).
  - The halo only darkens the world grid; over the wyrm's letters he has no cut-out.
  - The far look is a judgment call the owner should confirm in play (`uHeroLod.w`, `farFill` tune it
    live).

## ADR-022 — The drawn blade is decoupled from gameplay: a longer point and a depth pull (2026-11-08)
- **Context:** the portrait's blade runs from the gem to the point over ~70 % of his height; ours
  was ~56–60 %. Lengthening `DIM.steelTip` raised the slam's blade by 28 cm at the end of the hit
  segment on its impact frame. From behind at the game camera the low guard lay just behind his legs
  and in the grass: only a glow at his boot showed.
- **Decision:**
  - Three lengths: `DIM.drawnTip` 1.45 (the drawn point), `DIM.steelTip` 1.17 (what the animator
    poses and clamps; unchanged), the hit segment 0.16 → 1.5 (+ `REACH.tipExt` 0.4; unchanged).
  - `heroArt.pull`: at the game camera the blade, point and gem are drawn up to 0.65 m nearer the
    camera along their own view rays (`BLADE_PULL`: none under 10 m, full from 24 m): the same pixels,
    a nearer depth, so the blade shows over his legs and the grass.
- **Consequences:**
  - Every attack's active frames stay bit-identical; the drawn point stays inside the hit segment.
  - FX on the point must use `DIM.drawnTip ?? DIM.steelTip`.
  - The pulled blade draws over parts of his body it is really behind. Accepted for readability;
    close-ups are unaffected.

## ADR-023 — The hero's feet are planned in world space; blade directions blend round the outside (2026-11-08)
- **Context:** the feet skated in every moving clip (run 0.8 m/s, combo 2.3 m/s with 12 m/s peaks):
  the stride did not match the speed and idle and gait feet were blended. The blade whipped through
  the legs and the ground on every side change: a component lerp passes through straight down (tip
  jumps of 0.67–0.75 m per frame, the blade inside a thigh for 1–29 frames per clip), and
  cross-fades re-chose their way round every frame (a ~350° spin between light 1 and light 2).
- **Decision:**
  - Stride and cycle length follow the speed, so a stance foot moves at the drawn ground speed; a
    foot planner holds planted feet in world space through starts, stops, curves and turns, and
    standing feet re-plant with short steps.
  - The drawn heading follows a critically damped spring (visual only); attacks and guards use the
    gameplay facing.
  - Blade directions blend by azimuth and elevation round the outside of the body; a fade keeps last
    frame's way round; outside attacks the blade is pushed out of the leg capsules before the ground
    clamp.
- **Consequences:**
  - Planted-foot slide ~0.03 m/s; 0 frames of blade inside the body in every clip.
  - A standing 180° turn trails the gameplay yaw by up to ~0.2 s (visual only).
  - Where the gameplay root keeps moving (the roll's 4–6 m/s), feet slide; the roll's kneel was made
    an intended slide with dust instead.

## ADR-024 — Look and motion polish never moves a hit-tested frame (2026-11-08)
- **Context:** two rounds of four agents reshaped poses and silhouettes on a fight whose timings,
  reaches and windows are balanced and tested (COMBAT.md). The look wanted a bigger head, longer
  blade and longer wings; the motion wanted new windup paths and key poses.
- **Decision:**
  - Hero: attack **active frames stay bit-identical**. A path that reshapes a windup reaches the
    clip's own pose by windup − 1/30 s and hands its channels back; recovery shaping starts at
    windup + active + 0.035 s (the frame after the window is still hit-tested); active-frame shaping
    uses only non-blade channels. Proof: a per-frame compare of `sword.matrixWorld` and the hit points
    against the previous build (round 2: 192 frames, 0 differ).
  - Dragon: attack hit spheres on active frames stay within a few cm of the baseline, measured per
    frame in seeded Lab runs, and first-contact timing is re-measured per ability (round 1 vs v0.4:
    mostly 2–6 cm, a few frames up to ~13 cm on the charge's 3.2 m chest sphere; round 2 vs round 1:
    ≤ 4 mm except the rake's 2.3 cm).
  - Visual size changes hang off gameplay joints instead of moving them: the 1.3× head on `headVis`
    about the mouth, longer distal finger bones with the knuckles fixed, a thicker drawn tail over the
    unchanged chain clearance, the hero's longer drawn blade.
  - Cosmetic randomness in code the integration sims run uses the animator's own noise, never
    `Math.random` (the sims seed it and the wyrm's AI rolls on it).
- **Consequences:**
  - Gameplay (hitboxes, timings, balance) is unchanged; `npm test` stays the gate.
  - Strike key poses can't get stronger holds on active frames without a hit-volume decision or
    decoupling the sword's world matrix from the body.
  - Every motion change needs the per-frame compare run. The tools live in the session scratchpad,
    not in the repo yet.

## ADR-025 — The wyrm's shown motion is separate from its measured motion (2026-11-08)
- **Context:** FABRIK moves a chain's tip first, so the bite's 1.8 m strike step turned the last
  neck segment 75° in one frame while the base barely moved; the strike had no acceleration (an
  exponential approach from a still coil); the head's aim flipped 30–90° in a frame when the look
  target passed under it. Letting the painting's resting S shape the one neck chain changed how the
  next windup coiled it (the bite's head ended ~0.8 m short).
- **Decision:**
  - Two neck solves: `_neckSim`, the measured one every attack's head path and hit spheres were tuned
    on, and `neck`, the shown chain (the resting S at rest; while an attack drives the head it swings
    toward the measured head, spreading the step down its length). The head joint is pinned to the
    measured solve.
  - `pose.headLead` lets the last three windup frames lead the SHOWN head into the strike (no hit
    test runs in a windup).
  - `pose.headExact` marks the frames whose hit spheres ride on the snout or mouth; there the head
    aims exactly, elsewhere its aim turns at most 11 rad/s.
  - `pose.tailLegacy`: the tail sweep runs the v0.4 tail solve its spheres were measured on; the new
    tail limits apply everywhere else.
- **Consequences:**
  - Worst neck joint per frame: bite 75 → 37°, parry recoil 137 → 46°; attack spheres within ~1 cm.
  - New attacks with head-borne hit volumes must set `headExact` on those frames, and polish must
    never edit the measured solve.
  - The neck hurt spheres ride on the shown chain, so they can differ from the measured neck.

## ADR-026 — Enemy combos are data-driven strings; a parry deflects a hit without ending the string (2026-11-09)
- **Context:** the owner asked for Sekiro / Phantom Blade Zero combos where several parries in a row
  are possible: a flow of exchanges. Until now a parry cancelled any melee attack with a recoil, so
  the one multi-hit attack (the claw combo) ended at its first parry.
- **Decision:**
  - A string is data: `TUNING.attacks[name].hits[]`, each hit a `kind` (a performance in `KINDS`)
    with its own tell, windup (+ an optional random hold that baits an early parry), active, impact,
    damage, knockback and an optional `chance`. `makeString` builds the action with one tell beat
    per hit.
  - A parried hit that is not the string's last is deflected: its posture damage and a 0.14 s visual
    knock-back, no timing change; the next hit comes on schedule. Parrying the last hit (or a single
    melee attack) recoils as before. `dragon:parried` gains `{hit, last}`; `combat:deflectChain
    {count}` fires from the second parry in a row.
  - Data rules, tested: the first windup ≥ 0.7 s, ≥ 0.45 s from impact to impact, every contact
    within ±85 ms of its flash + lead.
  - A red hit inside a string must be dodged; a perfect dodge of it plunges and ends the string.
- **Consequences:**
  - Seven strings today (claw combo, rending flurry, hesitant maw, wing buffet, tail lash, pounce,
    frenzy); new enemies get combos from data plus kinds.
  - Posture comes mostly from parry chains, so the meter grew (560 / 640 / 720 per phase).
  - The AI picks a string by its first hit's band: later hits can whiff a hero who stands still.

## ADR-027 — A perfect dodge of the wyrm becomes a plunge onto its head (2026-11-09)
- **Context:** Ghostep (ADR-008) blinked the hero 3.2 m behind the attacker. Behind a 7.5 m-tall wyrm
  the player could not see himself and lost his bearings. The owner asked for the hero to appear on
  top of the dragon and stab down into its head, automatically on every perfect dodge in range.
- **Decision:**
  - An attacker that offers `plungePoint(out)` and `onPlunge(o)` gets the plunge on a perfect dodge
    with its head within `DEFENSE.plunge.range` (30 m), unless the hit forbids it (`takeHit`
    `plunge: false`): vanish, hang 5 m above the head, dive, one `onPlunge` (90 final damage, 40
    posture), ride the head down, backflip to a visible landing in front of it toward where he came
    from, then the crit window. Invulnerable throughout; the camera keeps both on screen.
  - Out of range or forbidden: the slow-mo and crits in place, no teleport. Attackers without the
    API keep the v0.2 blink behind them.
  - While the wyrm is posture-broken, an attack near its head (9 m) starts the same move as an
    execution (260 final damage), which spends the break.
  - The attacker plays its own `plunged` reaction (the head slammed down, a thrash, the rise; in the
    air a crash first) and keeps its head on its joints for the rider.
- **Consequences:**
  - Supersedes ADR-008's "blink behind" for the wyrm; `player:perfectDodge` and `player:ghostep`
    still fire.
  - The hero's `position.y` is no longer always 0 (the plunge's lift); hits and body circles are
    skipped meanwhile.
  - The camera rig got a general keep-in-view request (`cameraRig.keep`).
  - The plunge is a large damage source (90 per perfect dodge): the damage is final (no head ×1.5)
    and the HP was raised to match (ADR-033).
  - The airborne crash is reached in play by perfect-dodging fire the wyrm breathes or spits from the
    air (the burning pass's stream, the hover barrage's shells: hazards spawned with `plunge: true`,
    ADR-029), and by the dive's crash landing.

## ADR-028 — Three boss phases behind HP gates; a new phase's abilities unlock one by one (2026-11-09)
- **Context:** the owner wants a 3–5 min, hard fight in three phases. ADR-009's gate covered one
  transition at 50 %. When a phase unlocked several new abilities at once, they all came right after
  the roar.
- **Decision:**
  - Phases start at `TUNING.phaseAt` [1, 0.66, 0.33] of max HP. Every threshold is a gate: while the
    AI runs, damage clamps there until the transition starts. `brain.pendingPhase` holds the next
    transition; it waits for the intro, another transition, the death or a plunge reaction, and never
    starts while the wyrm is broken.
  - Each transition is a scripted roar (a red shock ring) that clears every hazard and heats the
    wyrm up; phase 3 opens with the Inferno nova.
  - Per-phase tuning as `[P1, P2, P3]` arrays read with `perPhase`: time scale, turn, walk, idle
    gap, posture max, glow, embers, jaw, attack weights.
  - `enterPhase(n)` gives the abilities phase n unlocks staggered opening cooldowns
    (`TUNING.unlockStagger` [2, 2.5, 2] s, in a random order).
- **Consequences:**
  - Extends ADR-009 to every gate. `dragon:phase3` and `dragon:phase {n}` join `dragon:phase2`.
  - Each phase reads as a step up, and the nova's 2.5 s charge announces phase 3.
  - The transition roars always run at phase-1 timings.

## ADR-029 — Fire hazards are world threats that run on their own (2026-11-09)
- **Context:** the owner wanted epic fire spells: meteor rain, eruptions, flame walls and rings, an
  inferno nova. If each spell were one long action, the wyrm would stand still while it rains;
  layering threats needs them to live apart from the current action.
- **Decision:**
  - A pooled `Hazards` system on the dragon (`hazards.js`): circles, strips, rings, walls and pillar
    lines, plus rain and chase emitters. `dragon.update` runs it every frame (guarded); it is cleared
    on reset, death and every phase change, and allocates nothing per frame.
  - Every hazard shows a red ground warning from spawn to impact and deals one red blow through
    `dragon.hitPlayer` (default `plunge: false`): block and parry fail, i-frames or moving away avoid
    it, and a perfect dodge gives the slow-mo in place (dodging a meteor must not put you on the
    wyrm's head). Fire the wyrm itself breathes or spits from the air (the burning pass's stream, the
    hover barrage's shells) spawns with `plunge: true`: perfect-dodging it plunges onto the flier.
  - A hazard either announces itself (`combat:tell` / `combat:flash` with `hazard: true`) or is
    covered by the spawning attack's own tell, re-timed from the hazard's geometry (`timeTo`).
  - The AI may start melee while hazards burn. Hit caps per group limit what a rain or a chase can
    deal (meteors ≤ 3 hits). The HUD's red screen edge skips hazard flashes (a meteor rain pulsed the
    whole screen); audio plays a lighter cue.
- **Consequences:**
  - The fight layers: a string while meteors fall.
  - `hazards.js` lives in the dragon module; a second enemy that casts hazards would move it to a
    shared place.

## ADR-030 — The wyrm flies only inside single attacks (2026-11-09)
- **Context:** the owner wanted flying attacks and fire from the air, and chose short flights over
  an extended flight phase.
- **Decision:**
  - Each flight is one action: take off, attack from the air, land (the burning pass, the sky dive,
    the hover barrage). In the air `state === 'airborne'` (the leap's convention): no body circles,
    staggers wait, and the hurt spheres ride the drawn body, out of sword reach; only the plunge
    reaches the head.
  - The AI never picks an attack while airborne (`attackWeight`'s `air` flag exists; nothing sets
    it).
  - Flight poses are rig pose fields (`hover`, `glide`, `dive`, `altRate`) and two wing keys
    (GLIDE, DIVE). Hover points sit beside the hero so the flier stays on screen, and the flow asks
    the camera to keep its head and body in view.
- **Consequences:**
  - No flight-phase AI or aerial targeting to maintain; flights stay ≤ 16 m up and in the bound.
  - A plunge mid-flight crashes the wyrm where it was hit (`d.crashing`), but every blow dealt in
    flight comes from a hazard, so in play the plunge always meets a grounded wyrm.

## ADR-031 — The hero gets girth, not longer bones; his blade is depth-tested again (2026-11-09)
- **Context:** the owner found the hero "too lanky / skinny", and the sword always showed and clipped
  through him, even through his back from behind. ADR-022's depth pull drew the blade up to 0.65 m
  nearer the camera so the low guard would read from behind; it also drew it over parts of his body
  that are really in front of it.
- **Decision:**
  - The mass comes from mesh radii and widths (`BODY` in `player/model.js`): chest 0.50 × 0.27 m,
    waist 0.31, hips 0.34, thick arms and legs, shoulder joints ±0.21. Bone lengths drive the IK, the
    foot planner and the blade's hit segment, so they stay.
  - The sword hand aims from the old shoulder spot (`DIM.gripShoulder`, `rig.arms.R.anchor`).
  - The depth pull is removed (`heroArt.pull`, `SG_HERO_PULL`, `uArtPull`, `BLADE_PULL`): the blade
    is depth-tested like every other part.
  - The coat yields to the steel: each panel hangs inside the sword hand and the blade or drapes over
    them, latched per panel.
- **Consequences:**
  - Supersedes ADR-022's depth pull; its three blade lengths stay.
  - From behind only the steel beside his silhouette shows: the low idle guard shows just its point.
  - Not bit-identical (ADR-024): the hit segment moved by ≤ 2.5 cm on some active frames; the REACH
    table is unchanged.
  - At the game camera the extra mass reads only modestly; the coat skirt dominates the outline.

## ADR-032 — A successful deflect re-arms the parry at once (2026-11-09)
- **Context:** strings put a blow every ~0.45 s. The anti-mash rule (RMB must be up `parryRearm`
  0.25 s before a press counts) failed a player who held the guard a moment after each deflect,
  which is natural because holding keeps blocking. The parry freeze also stretches real time while
  `parryRearm` counts game time.
- **Decision:** a successful parry sets `player.rmb.chain`: the next press counts as soon as RMB has
  been released. Every press clears it, so a press that parries nothing needs the full re-arm again.
- **Consequences:**
  - A string can be deflected blow by blow with the guard held between taps (DEFLECT scenario: two
    blows 0.3 s apart with taps held 0.2 s, both parried).
  - Mashing still fails (the PARRY scenario's mashed RMB).
  - Player-side only: enemies need nothing.

## ADR-033 — Difficulty is set by measurement: the probe bot (2026-11-09)
- **Context:** the target is a 3–5 min fight for a player who knows the moves, hard enough that a
  skilled player dies several times while learning it. Guessed numbers had missed before (v0.2's
  god-mode bot won in ~20 s of combat), and on the melee branch the god-mode bot won in 75–90 s with
  ~35 % of the HP from emulated plunges.
- **Decision:**
  - Tune against the integration bots: `win` (god mode, answers every tell) for fight length and
    phase timing, and the opt-in `probe` scenario (a mortal bot that answers a share of the tells,
    `ABYSS_SKILL`; reseed with `ABYSS_SEED`) for danger, at several skills.
  - The lead's retune: HP 4200 → 4500, the plunge's damage final (no head ×1.5), AI weights toward
    the strings and the fire attacks, the unlock stagger.
  - Record the measurements in COMBAT.md "Current numbers" whenever the balance changes.
- **Consequences:**
  - Measured (probe at 4200 HP): a 95 % bot wins in 145–150 s, an 85 % bot wins 1 of 3, a 70 % bot
    always dies; the god-mode bot at 4500 HP wins in 157.5 s.
  - The bots heal poorly and never learn, so the death rates are pessimistic; a human playtest still
    decides.
  - `probe` is not part of `npm test`'s `all` run.


## ADR-034 — The hero is the lean swordsman of the reference sheet; the coat is two tails and panels (2026-11-09)
- **Context:** the owner attached a six-view ASCII turnaround and a single-figure image of the hero
  and asked for the character to match them, "especially from the back and rear three-quarter
  gameplay views". Measured on the sheet's silhouettes (fractions of his height H): shoulders ≈ 0.24 H
  across, the chest ≈ 0.18 H, the belted waist ≈ 0.12 H, thighs ≈ 0.06 H. Round 3's broad build
  (ADR-031: a 0.50 m chest, 0.62 m across the deltoids, heavy limbs) and its closed A-line skirt read,
  from behind at the game camera, as a cloaked trapezoid with no legs; the hair was a round helmet,
  and the portrait idle's blade lay across his front, so from behind only its point showed.
- **Decision:**
  - A lean V on the same bones (`BODY`): chest 0.34 m over a 0.23 m waist, shoulder joints ±0.16,
    slim limbs. The sword hand still aims from `DIM.gripShoulder`, so no grip target moved.
  - The coat (`COAT_PANELS`) is six panels: two back TAILS split by a vent from just under the belts,
    narrow side panels, two front panels. A panel's vent / front edge hangs straight or drifts out
    (`skew`: the width it gains goes to its outer side, `sheetOffset`), its hem slopes down to the
    outer point (`slant`), and piping runs down the vent and front edges (`edge`). The legs show in
    the vent and the open front in every view. No front flap; 12 torn strips (was 22).
  - Hair of distinct pointed locks in layers (crown spikes, top, two back layers hanging down with
    their points lifting, nape flicks, side locks, a jagged fringe) on a closer scalp cap.
  - A taller-at-the-front, flared collar with a turned-over rim; a shaped upper back (a yoke whose
    seams dip to a four-point star, a centre seam); a baldric from the right shoulder to the left hip;
    a stack of spiked lames on the right shoulder; banded calves.
  - The sword after the single-figure image: broad at the guard, one long taper to a sharp point,
    barbs at the base, lightning notches, a guard swept up toward the blade round a violet
    four-point star gem (`DIM.gem` 0.116 at the guard, `DIM.forte` 0.2).
  - The idle (`guard`) hangs the sword at his right side, angled out and forward-down, as on the
    sheet; a near half-turn of the blade (from the light combo's finish over his left shoulder) goes
    round the FRONT below head height (`DIR_FLIP`): the way behind cut through the sword arm.
  - At the game camera the blade self-lights about half as much (`player.js`) under a lower HDR cap
    (`uHeroFar.w` 1.8 → 1.3), the armour's far fill and lines come down ~25 %, the lavender torn
    zone's far fill doubles.
- **Consequences:**
  - Supersedes ADR-031's broad build (its depth-tested blade and coat-vs-steel rules stay).
  - Gameplay unchanged: no bone length, grip target, attack timing or hit segment changed; the hurt
    cylinder is the same. The slam / light poses are untouched; only the idle and the way a near
    half-turn blends changed. The cosmetic blade halo spawns fewer particles, which shifts the shared
    `Math.random` stream the seeded wyrm AI rolls on (the DIE scenario's pause check now snapshots the
    wyrm after the Esc frame).
  - `herolook` (831 frames): the drawn blade never enters his body (closest 2.9 cm, was ≤ 2 cm deep);
    the blade crosses a coat panel on 1 of 509 locomotion frames.
  - At the game camera facing away, his lit area matches the reference's at the same height (4357 vs
    4374 px; the broad build covered 6462); he is still brighter (mean luma 74 vs 55), mostly the
    one-pixel silhouette line, kept for legibility against the grass.

## ADR-035 — Look-dev: a solid render through the ASCII pass and a live multi-angle sheet (2026-11-09)
- **Context:** matching a turnaround needs every angle at once, the gameplay camera next to the
  close-ups, and a way to tell a geometry problem from a renderer problem. The model viewer showed one
  angle at a time, ASCII only.
- **Decision:**
  - `U.uHeroSolid` (shared uniform, hero materials only): 1 = a plain-lit clay render of the geometry,
    tinted per part, the two sub-pieces of a part shaded apart, written with alpha 0 so the ASCII pass
    passes it through untouched. The pipeline's existing `uHeroDebug` gives the art source and the ink
    lines. The model viewer's `look` ('ascii' | 'solid' | 'source' | 'lines') sets them and restores
    'ascii' on exit.
  - More angles (3/4 right, right side, both rear 3/4s), `spin` (a turntable at 36°/s) and `sheet`:
    ten live tiles (the reference sheet's six angles, the left side, the gameplay camera on his back,
    front and right side at ×2 nearest-neighbour). Each view is held two frames and read back in a new
    `lab.postRender()` hook, which main.js calls right after the frame is drawn (same task).
- **Consequences:**
  - In play the cost is one uniform test per hero fragment and an empty `postRender` call.
  - The sheet re-renders the scene from a new camera every other frame, so each tile updates at
    1/20 of the frame rate; the canvas underneath flickers, covered by the overlay.
  - Every capture in this session used it (and a headless DevTools harness that drives `__tick`).

## ADR-036 — The idle is the single-figure stance; the hero's fill is a dot matrix (2026-11-09)
- **Context:** after ADR-034 the owner judged the hero still unlike the single-figure reference "on
  terms of detail and feel" and called the sword hold awkward: the blade hung straight down his right
  side read as a stiff A-pose carrying a pole. The reference's tone is carried by a regular grid of
  tiny marks (charcoal dots, sparse bright edges), not by legible letters.
- **Decision:**
  - Idle: the reference's stance. Weight on the left leg, right leg straight out, the sword arm
    hanging beside the right hip, the blade a low diagonal across his front to a point above the
    grass at his left (`IDLE_SW`), head bowed along it. This reverses ADR-034's idle; from the 58°
    game camera the blade lies forward-left of the body, so most of it still shows from behind.
  - Fill: a 3x3 micro-font (`PIXEL_3X3`, 29 marks sorted by density) in square 4x4 px cells replaces
    the 3x5 letters; brightness is linear in the light value; the key light is cel-stepped
    (`U.uArtHeroCel`); plain ink lines stay under the bloom threshold; each part has its own
    silhouette ink (`U.uHeroPartRim`).
  - Folds are drawn, not shaded bands: `foldLines(g, fn)` writes a smooth 0..0.9 `aPart` field, the
    ink pass prints its 0.5 contour, `sub` (HERO_INK → `uArtSub`) darkens the valley side. `aPart`
    exactly 1 remains the plain second sub-piece.
  - The cape is four ribbons on the streamer springs (per-ribbon `out`); the sleeve streamers are gone.
- **Consequences:**
  - The hero no longer shows readable letters up close; the wyrm keeps its letter grid.
  - The six-panel pleated coat closes round the legs again and its fold lines are busy, most of all
    from behind: a known regression against ADR-034's "legs visible" goal, accepted as an
    intermediate state. The session was stopped before the open coat, hair, face, collar, legs,
    pauldron and sword were rebuilt (ROADMAP M1.9); the result is closer to the reference, not a match.
  - Gameplay is untouched: no bone, grip target, hit segment or timing changed.

## ADR-037 — The hero's sculpted parts are built in a headless Blender and committed as packed data (2026-11-09)
- **Context:** two rounds of matching the single-figure reference with hand-written JS geometry
  (grids of sines) stalled on the organic parts: a hair mop, a winged collar, a torn cape, layered
  plates. The owner offered Blender. Its interactive MCP link timed out, and a tool that needs a
  running GUI would not be reproducible anyway.
- **Decision:**
  - `scripts/blender/hero_parts.py` builds the parts with Blender's Python API (bmesh, mathutils),
    run headless by `scripts/blender/build-hero-parts.mjs` (`npm run hero-parts`). The body
    dimensions it fits the parts to are dumped from `model.js` (`DIM`, `BODY`, `REST`,
    `HAIR_CLUSTERS`, `CAPE_SHEETS`), so there is one source of truth for sizes.
  - The output is `src/entities/player/heroParts.js`: `HERO_PARTS[name] = { n, p, nrm, uv, k, i }`,
    base64 little-endian (positions Int16 / 8192 m, normals Int8 / 127, `aGUV` Int16 / 8192, `aPart`
    Uint8 / 200, Uint16 indices). It is generated, never edited by hand, and COMMITTED.
  - A part is geometry only, in the space of the joint it hangs on, with the same attributes as
    every hero mesh (`aGUV`, `aPart`). `model.js` (`partGeometry(key)`) chooses the joint and the
    material; the rig, the springs, the ink pass and the glyph systems are unchanged. No flat image
    or billboard: the parts are meshes on the one 3D character.
  - The cape stays four streamer records (`{ segs, len, out }`, the animator's and the tests'
    contract); each is now a wide sheet in three parts (`cape.N.a` / `.b` on the two spring
    segments, `.c` the torn zone).
- **Consequences:**
  - The game, `npm test`, `npm run build` and Vercel need no Blender; only changing a sculpted part
    does (Blender 4.2+, tested on 5.2.1). After changing a dimension the parts are fitted to, rerun
    `npm run hero-parts` or the parts no longer fit the body.
  - The bundle grows by ~210 KB (1615 KB in all). Quantisation is 0.12 mm, below anything visible.
  - Sculpted parts are not content-as-data in `tuning.js` terms: their shape parameters live in the
    Python script. Sizes shared with the rig stay in `model.js`.
  - The result is closer to the reference, not a match (DEVLOG Session 9): the coat, the face and
    the limb armour are still JS geometry.

## ADR-038 — A 1.25 m moonlit sword held in a low ready at the right side (2026-11-09)
- **Context:** the owner: "the pants fabric in the front keeps clipping through the sword ... the
  current sword is way too long and dark". ADR-036's idle laid a 1.64 m blade in a low diagonal
  across his front, between the thighs and the front coat panels: the cloth had nowhere to hang but
  through the steel. The blade's flats were dark steel up close (ADR-022 kept the glow on the seams).
- **Decision:**
  - The drawn sword is 1.25 m with the pommel (`DIM.drawnTip` 1.45 → 1.06; the owner picked this
    length). The Blender blade parts are rebuilt to it (`npm run hero-parts`).
  - Gameplay reach is untouched: the hit segment (`DIM.bladeBase → bladeTip` + `REACH.tipExt`) and
    the animator's `DIM.steelTip` keep their values; the swing crescent covers the reach past the
    steel.
  - The blade is lit blue with white-blue edges (`BLADE_BASE`, brighter inks, emissive and rest
    glow), and still self-lights with distance.
  - The idle holds it in a low ready at his right side (`IDLE_SW` forward, ~38° down, a little
    outward; the grip outside the coat), not across his front.
- **Consequences:**
  - Supersedes ADR-036's blade line and ADR-022's dark flats; the stance itself (weight, legs, free
    hand) is ADR-036's.
  - The steel is ~0.44 m shorter than the hit segment. Hits past the drawn point are sold by the
    crescent and the dot halo; if that reads as "hit by air", shorten the segment in a balance pass.
  - Checked in the idle and at the game camera; the run and attack frames were not re-audited for
    coat crossings (ROADMAP M1.7's open item stands).

## ADR-039 — Bullet hell: deflectable bullets with a guaranteed cue, in a field of their own (2026-11-09)
- **Context:** the owner wants "sekiro / phantom blade zero like clashes" and "more bullet hell
  moments that requires the player to dodge and react", at about today's difficulty. The fire
  hazards (ADR-029) are few, big, red and dodge-only; dozens of small projectiles need different
  rules, and the tell contract (one flash per blow, 0.35 s ahead) cannot ring per bullet without
  drowning the fight.
- **Decision:**
  - A second pooled field, `dragon.bullets` (`bullets.js`, 360 records), beside the hazards. Three
    kinds carry the three tells: embers (normal), homing wisps (blue), orbs (red). Embers and wisps
    can be parried one by one (the bullet flies back at the head and adds posture), blocked, rolled
    or cut with a swing; orbs are dodge-only (the owner's choice: "deflect or dodge").
  - **The cue is the contract:** a bullet may only hurt after it announced itself `flashLead`
    before impact (glint + `combat:tell` / `combat:flash` with `bullet: true`). Impacts within
    `cueGap` share a cue and one parry answers them; a bullet that cannot be announced in time is a
    dud. After a hit, a grace window; per pattern, a hit cap.
  - A bullet parry is a light clash (`hit.light`) and never interrupts the wyrm; rolling through a
    small bullet is a plain dodge (`hit.perfect === false`), so a storm is not a Ghostep farm.
  - Four patterns as ordinary attacks (`bulletAttacks.js`, data in `tuningBullets.js`): ember storm,
    cinder fan, wisp swarm, fire wheel; plus two strings (`stormFlurry`, `cinderFlurry`, the second
    ending on scattered embers) and shorter idle gaps.
  - More attacks at the same difficulty: `TUNING.damageScale` 0.85 on every `hitPlayer` blow;
    bullet numbers are final and small (8 / 13 / 20).
- **Consequences:**
  - Two new payload flags (`bullet`, `light`) and two hit-spec fields (`perfect`, `light`);
    consumers that ignore them behave as before. Audio and the HUD read `bullet` to stay quiet.
  - The fire wheel lives in `bullets.js` (it shares the cue, grace and cap rules), not in
    `hazards.js`.
  - The attack tables in COMBAT.md list data values before the damage scale.
  - Difficulty is measured, not guessed (ADR-033): see COMBAT.md "Difficulty" for the bots' runs on
    this build. A human playtest still decides.

## ADR-040 — An athletic build, and the idle blade out to his side (2026-11-09)
- **Context:** the owner: "review the main character ... make sure his animations and sword posture
  looks natural and good. right now he is a bit too lanky". ADR-034's lean build (a 0.34 m chest,
  0.07 m thighs, 7.8 heads) read as thin tubes under a small head. ADR-038's idle pointed the blade
  nearly straight ahead from a straight hanging arm: the wrist was cocked ~50°, and from the 58° game
  camera his body and cape hid the whole sword whenever he faced away (the usual fight view).
- **Decision:**
  - `BODY` / `DIM` in `model.js`: chest 0.39 m over a 0.27 m waist, shoulder joints ±0.178, hips
    ±0.105, upper arm r 0.066, forearm 0.057, thigh 0.086, boot 0.064, hands ×1.12, the head joint
    scaled 1.08 (`BODY.headScale`). Bone lengths, `DIM.gripShoulder` and so every sword-hand target
    and hit segment are unchanged.
  - `hero_parts.py`: the collar's girth follows the shell (`COL_K`), the pauldron the deltoid
    (`PAUL_K`); parts rebuilt. Coat panel tops and cape roots widened with the body; cape flare
    (`CAPE_SHEETS.out`) reduced by about a fifth.
  - Idle (`guard` in `anim.js`): `IDLE_SW` [-0.725, -0.68, 0.1] (out to his right, ~43° down), the
    elbow bent back beside the ribs so the forearm runs toward the blade's line, a shoulder-width
    stance (right foot 0.25 m out instead of 0.33, knee soft).
  - A light attack that finishes over his left shoulder comes home round the front (`HOME_WAY`):
    the short way to the new idle ran behind his head and through the sword arm's shoulder.
  - The blade's tip streak sits on the drawn point (it floated up to 0.3 m past it).
- **Consequences:**
  - Supersedes ADR-034's girth and ADR-038's idle blade line. The `herolook` test asserts the
    athletic ranges and still holds the blade within 2 cm of his body over every move.
  - Facing west or north-west at the game camera the idle blade is on his far side and still hidden;
    facing north about half of it shows past the cape.
  - Gameplay is untouched (hurt cylinder, reach, timings).

## ADR-041 — A five-hit chain with sprint and roll attacks; real hands; a slim profile (2026-11-11)
- **Context:** the owner, with a reference image (a cloaked swordsman, the sword low at his side):
  "the character right now has no right hand, the way he's holding the sword is a bit awkward ...
  his first 2 arc swings can also be improved. Add a few more animations ... instead of the same 3
  attack patterns. He looks weird when viewed from the side." Lights 1 and 2 were one flat sweep and
  its mirror; the sword hand was a 5 cm ellipsoid behind the guard; in profile the cape trailed
  0.75 m behind him and the coat skirt was a bell. The owner chose: the blade low at his side, a
  longer varied chain plus a sprint attack and a roll attack.
- **Decision:**
  - `LIGHT` is five hits: falling cut (high right → low left), rising backhand, whirl (one full
    body turn to his right with the blade held out), stab, slam. `SPRINT_ATK` (LMB while sprinting:
    a bounding slash carrying 2.4 m along the run direction) and `ROLL_ATK` (LMB out of a forward
    roll: a low rising cut) both count as hit 1.
  - Swing shapes stay data: `anim.kind 'h'` gained `loop`, `spin`, `sink` and `feet: 'dash'`; a new
    `kind 'stab'`. The whirl turns the pose's body yaw and carries the foot targets round with it,
    ending on exactly one turn written as 0.
  - Per-hit numbers keep sustained damage level: 186 damage in 2.94 s (63 /s) against 120 in 1.94 s
    (62 /s). The finisher comes two taps later.
  - Hands: `gripFist` on the `sword` joint (owned by the `arms` gear slot), `looseHand` on the left
    forearm.
  - Idle: `IDLE_SW` [-0.6, -0.79, 0.12] (~52° below level), edge down, the upper arm by the ribs.
  - Profile: the outer cape sheets turn to his right, the back sheets and the front coat panels hang
    close (`CAPE_SHEETS`, `COAT_PANELS` in `gear/wanderer.js`).
- **Consequences:**
  - Supersedes ADR-040's idle blade angle and the three-hit chain in COMBAT.md. `player:attack`'s
    `combo` now runs 1–5.
  - The REACH test covers all five hits (contact to 3.5 m). One `win` bot run took 144–154 s
    against 177 s before; too few runs to call it easier.
  - The whirl turns his back on the target for about 0.1 s; nothing in the rules punishes that yet.
  - The sprint slash does not use the step-in assist and does not turn to the aim.

## ADR-042 — The hero's outfit and weapon are gear items in equipment slots (2026-11-11)
- **Context:** the owner plans an RPG with equippable armor and weapons: "make sure the characters
  outfit can be replaced easily". `buildHero` was one 550-line function building skeleton, body,
  coat, cape, armour and sword together. The owner chose the structure only for now: no new gear,
  no inventory.
- **Decision:**
  - `player/gear/`: items `{ id, slot, name, build(ctx) }` in eight slots (head, chest, shoulders,
    arms, legs, waist, back, weapon), a registry, `DEFAULT_LOADOUT` (today's look) and the `base.*`
    undersuit for an empty chest / arms / legs slot. `model.js` keeps the skeleton and the body.
  - `buildHero(U, loadout)`; `rig.loadout`, `rig.slots`; static meshes merge only within a slot.
  - `player.equip(slot, id | null)` / `player.setLoadout(loadout)` rebuild the rig under the same
    root and recreate the animator.
  - Geometry builders moved to `heroGeo.js`, measurements to `heroDims.js`.
- **Consequences:**
  - With the default loadout the refactor was checked mesh by mesh against the old build (136 of
    136 identical) before the hand and profile changes went on top.
  - A swap restarts the pose from the ready stance and rebuilds every mesh: fine in a menu, not
    mid-fight.
  - A weapon of another length is not supported yet: the animator, the hit segment and the blade FX
    read `DIM`, not the item's `dims`. Helmets cannot hide the hair. Items carry no stats.
  - Materials are still the shared hero set; an item cannot bring its own yet.

## ADR-043 — The Shrouded set: a hooded tattered cloak is the default outfit (2026-11-11)
- **Context:** the owner sent a reference again (a hooded swordsman in a huge ragged cloak, seen
  from behind, the sword low in his right hand) and asked whether rebuilding the character would
  make the motion easier to fix and the look closer. Asked to choose, the owner picked "new outfit,
  same skeleton" over keeping the white-haired coat design or a full rebuild.
- **Decision:**
  - A new gear set, `gear/shroud.js`: `shroud.hood` (head; `hidesHair`), `shroud.tunic` (chest),
    `shroud.arms` (cloth sleeves, leather-bound forearms, bare hands), `shroud.cloak` (back: a
    mantle on the chest and `SHROUD_SHEETS`, seven ragged two-segment sheets on the streamer
    springs). Built from `heroGeo.js` sheets and shells only: no sculpted parts, no Blender step.
  - `DEFAULT_LOADOUT` is that set over `wanderer.legs`, `wanderer.skirt` and `wanderer.sword`, with
    no shoulder item. The old outfit stays selectable as `WANDERER_LOADOUT`.
  - The cloak is asymmetric: it covers his back and his LEFT side and arm (one sheet hangs on the
    left upper arm and lifts with it), and is thrown back behind the sword shoulder, so the sword
    arm and the blade are never behind cloth.
  - Streamers take `lag` (default 1). The cloak uses 0.5: about 40° of trail at a run. At 1 the big
    sheets stood out level from the shoulders.
  - `HERO_INK` far fill: coat 0.42 → 0.8, hem 0.8 → 1.1, lining 0.5 → 0.6. The cloak is most of the
    figure now; at 0.42 he was a dark blob in dark grass on a phone.
  - No new materials or ink-line part ids: the set reuses `coat`, `lining`, `hem`, `shirt`,
    `leather`, `trim`, `skin` (the part ids are full at 20 and live in a narrow alpha band).
- **Consequences:**
  - The skeleton, the animator, combat timing and the hit segment are untouched by the outfit.
  - The far-fill change also brightens the Wanderer's coat when that loadout is worn.
  - The cloak's springs have no collision: sheets can pass through the legs, the coat tails and,
    in a roll, each other. Nothing keeps them off the ground.
  - The face is still built under the hood; it shows from eye level, not from the game camera.
  - `docs/art/hero.md` describes the Wanderer's set, not this one.

## ADR-044 — The sword arm folds, leads and never locks (2026-11-11)
- **Context:** the owner: "the hand motion and animation looks very unnatural", for standing,
  running, attacks and the defensive moves alike. Measured over the five-hit chain (elbow bend and
  the angle between the forearm and the blade, every frame): the sword arm reached 4° of bend, a
  straight stick, in the falling cut, the rising cut, the whirl and the stab, and the forearm-to-
  blade angle stayed within 24–40° through the whole rising cut and the whole whirl. Cause: `slashH` put the hand on a 0.42 m
  circle round the shoulder, at or past the arm's 0.55 m reach once the forward offset was added,
  with the blade exactly radial to it. In light 1's windup the free arm was also sent out straight,
  so both arms stood out from the body.
- **Decision:**
  - `slashH(p, A, th, elev, lunge, ext, lead)`: `ext` (0 folded … 1 open) sets the hand's radius
    (0.23–0.42 m) and height, and moves the elbow pole out and back when the arm is cocked; `lead`
    (rad) puts the hand ahead of the blade round the body. `attackPose` drives them from `SWING`
    (`SWING_SPIN` for the whirl): cocked in the coil, the fist leading into the cut while the arm
    opens, the blade passing the fist while the arm folds in the finish.
  - The blade's direction is still `th` / `elev`, so the arc the hit test sweeps is the one in the
    attack data; only the grip point moves.
  - `_arm` compresses the last fifth of the reach (`ARM_SOFT` 0.78–0.955 of the arm's length), for
    both arms and every pose. The off hand gets its full reach back as `twoHand` rises, so two hands
    still meet on the grip.
  - Light 1's free hand: a bent guard before the chest, then drawn back beside the hip.
  - Run: the sword hand rides 4 cm higher and swings 9 cm with the stride.
- **Consequences:**
  - Sword-arm bend over the chain: 46–146° (was 4–146°). The `HERO` test asserts both elbows keep
    more than 23° through the run, the roll and every attack (measured: 40° and 46°).
  - The grip sits up to ~5 cm nearer the shoulder at a full stretch. REACH still passes for all five
    hits; damage per second was not re-measured.
  - The slam's apex: the hands used to stop straight overhead with the blade hanging down the
    back, 147° between forearm and steel. They now go on to behind the head on a tighter circle
    (`SLAM_BACK`), and lead the blade on the way down (`SLAM_LEAD`): 99° at the apex. A 145° peak
    remains for about three frames in the windup, between the gather and the raise.
  - Idle, block, heal, roll and the thrust were looked at with the new arms and left as they were,
    apart from the soft reach.

## ADR-045 — Rigid batching: one draw per material per actor (2026-11-11)
- **Context:** the owner: the game "seem[s] to have slowed down" on an iPhone 15 / 16 / 17 Pro,
  all the time, not only in the fight. Measured: about 510 draw calls a frame in the fight on the
  phone preset (575 in a 1024 x 768 window), the hero 138 meshes and the wyrm 183, nearly all drawn
  twice (shadow pass + world pass). GPU timer
  queries on a desktop showed the hero or the wyrm alone costs the same into a 4 x 4 target as at
  full size: per-draw overhead, not fill. Grass, forest and the fullscreen ASCII pass were small
  next to it. Not measured on a phone.
- **Decision:**
  - `render/rigidBatch.js`: a shared RGBA32F bone texture (`U.uBoneTex`); `batchRigid(U, root)`
    merges an actor's surface-glyph meshes per material into one mesh with a per-vertex `aRigid`
    slot, plus one positions-only shadow mesh per actor on `LAYER_CASTER_RIGID`.
  - Every source mesh is its own bone and stays in the scene graph (hidden from the cameras by its
    layers), so per-mesh transforms, `visible` flags, the tests, the Lab and the FX that read
    joints keep working with no list of what is static. A hidden mesh writes a zero matrix.
  - One shader program per material for batched and unbatched meshes: slot 0 means "use
    modelMatrix". No material cloning (the shared uniform objects must stay shared).
  - `pipeline.render()` updates the scene's matrices once, syncs the bones, and renders both scene
    passes without three walking the graph again.
  - `CONFIG.render.batch` (`?nobatch` in the URL turns it off) for an A/B on a device.
  - Quality presets carry a shadow map size: LOW 1024, MEDIUM and HIGH 2048.
- **Alternatives:** `THREE.BatchedMesh` (needs `WEBGL_multi_draw` for a single draw; its fallback is
  one draw per part); merging the materials themselves (a larger change to the hero's ink-line
  look); shadow proxies only (leaves the world pass as it was).
- **Consequences:**
  - Draw calls per frame at 852 x 393, LOW, the Shrouded set: title 432 → 55, fight 509 → 56.
  - Batched parts are not frustum-culled one by one, and draw order within a material is build
    order. A pixel can differ from the unbatched picture where a shadow depth sits at the bias
    threshold (float32 on the GPU).
  - Baked at build time: each part's geometry, material and mirroring. A mesh added to an actor
    after `batchRigid` draws unbatched. The hero's rig rebuild disposes and rebuilds its batches.
  - Raycasts do not see the hidden source meshes. Nothing raycasts actors today.
  - World matrices must be final before `pipeline.render()`.
  - Whether this restores the frame rate on the owner's iPhone is not known until it is tried
    there.

## ADR-046 — Both hands on every swing; a raised two-handed guard (2026-11-12)
- **Context:** the owner: "make the character use both hands when he's swinging. it looks awkward
  when he's just using 1 hand", and "when he guards, make him hold the sword up in a higher angle".
  Asked, the owner chose both hands on every swing with the one-handed low carry kept at rest, and a
  two-handed guard with the blade raised across the body. Until now only the slam, the charge and the
  thrust were two-handed.
- **Decision:**
  - The light sweeps (all five chain hits, the sprint slash, the roll cut) and the stab set
    `twoHand` 1. The cross-fade brings the off hand onto the grip during the windup; the recovery's
    blend home lets it go.
  - `slashH(…, two)`: with two hands the grip travels round the chest's centre line in front of it
    (`TWO_R` 0.17–0.3 m across, at least `TWO_Z[0]` 0.13 m in front), a little higher, elbows down
    and out. A chest turned far left pulled the left shoulder out of reach of a grip at the left hip
    (the left arm locked straight, up to 8 cm short): the left turn is now 0.14 of the blade's
    azimuth instead of 0.36. The blade's own direction is unchanged, so the hit arcs are the data's.
  - The off hand sits `DIM.offGrip` 0.08 m below the sword hand (fist against fist; was 0.11).
  - `rig.offHand { open, grip }`: the Shrouded arms build the free hand twice and the animator shows
    the closed one on the grip while `twoHand` > 0.6.
  - The block: grip before the chest, blade ~50° up across the body, flat to the enemy, both hands.
- **Consequences:**
  - The off hand reaches the grip within 2.5 cm in every swing (the HEROLIFE test: 3.5 cm).
  - REACH passes at every distance for all five hits; one bot `win` run took 139 s (144–154 s
    before), so the swings did not get worse at landing. Damage numbers are unchanged.
  - In the two-handed stab and the slam the left arm still straightens fully at the end of its reach.
  - The parry flicks inherit the two-handed block.

## ADR-047 — Idle life: random actions while standing still (2026-11-12)
- **Context:** the owner: "add some idle animations of the character doing random stuff while not
  moving to make it look like the character is alive instead of him just being static". Chose all
  four kinds offered: look around / stretch, inspect the blade, twirl it, rest it.
- **Decision:** six layered actions in `anim.js` (`FIDGETS`: look, stretch, inspect, twirl,
  shoulder, lean), started by `HeroAnimator._idleLife` after 2.5 s standing still and 2–4.5 s after
  the last one, picked with the animator's own noise, never the same twice in a row; cut within
  0.16 s by any move, lock-on, guard or other clip. Not while locked on.
- **Consequences:**
  - Purely visual; no gameplay state reads it. The game's `Math.random` stream is untouched (the
    integration sims seed it).
  - In 25 s of standing still the test saw 4 actions, 3 different.
  - The twirl's blade passes behind his right side through the cloak's region for about 0.3 s.

## ADR-048 — Cloak sheets keep out of the blade and the arms (2026-11-12)
- **Context:** the owner: "when he's charging the sword, the sword and arm are clipping through the
  cape". Measured with a probe (blade and arm points within 3–4 cm of a sheet's surface): the blade
  was inside a cloak sheet in 94 of 150 charge frames and the sword arm in nearly all of them; the
  streamer springs had no collision at all.
- **Decision:**
  - Four spheres along the blade every frame (`_colliders`). Each streamer segment records which
    side of it each sphere came in from (`streamState[i].side`) and is bounded to stay on that side
    by the sphere's radius (`_sheetBound`): from the body side the sphere holds the cloth out, from
    outside it holds it in; the inside wins a conflict. The bound limits both the spring's target and
    its state.
  - Streamer records gain `w` (widths) and `arm` (the arm a sheet hangs on, which it ignores if arm
    spheres are ever used).
  - The charge pose: hands before the right hip (were 0.28 m behind it), the blade out to his right
    and low, past the cloak's edge; the off arm unchanged.
  - The arms are NOT colliders, and the charge does not lift the cloak. A first version had spheres on
    both arms, rooted the sheet behind the sword shoulder on the shoulder blade, and lifted the sheets
    in the charge's updraft: the owner found the back cape "too floaty" and him "wider from the back
    view" ("make it look similar to the original look"). Holding the sheets out round the arms at rest
    and on the move did that; it was reverted.
- **Consequences:**
  - Held charge: the blade within 2 cm of a cloak sheet in 0 of 96 frames (the HEROLIFE test).
  - Against the original cloak (main before this work, measured at the hems over 60 idle / 90 run
    frames): idle 1.29 m across (1.23 m), run 1.15 m (1.15 m). The 5 cm at rest is the short sheet
    behind the sword shoulder draped over the resting blade instead of passing through it.
  - The arms pass through the cloak where they did before (at the sheets' roots in the charge).
  - From straight behind, the cloak drapes over the blade's first half in the charge; its outer part
    shows past the cloak's right edge.
  - The coat panels keep their own steel rules (`_coat`); hair has no collision.

## ADR-049 — Gold hair under a pushed-back hood (2026-11-12)
- **Context:** the owner liked the hood but "the front details and visuals makes him look like
  death. have his hair show a bit and make his hair colored gold to stand out. also his hood is too
  pointy at the top". Chose "hood back a little" with the fringe and strands showing.
- **Decision:**
  - The hood's rings: a rounded crown with a short soft peak; the rim runs behind the hairline and the
    opening is wider.
  - A head item lists the hair pieces kept under it (`hair: ['cap', 'fringe']` for the hood); the
    side, crown and nape clusters poked through the cloth. The hood builds two gold locks per cheek.
  - The hair is gold for the body (both loadouts): warm gold letters, brighter tips, lines under the
    bloom threshold. The face is warmer and less pale (skin fill gain 3.0 → 2.2), the eyes smaller and
    brown instead of large dark violet-rimmed almonds.
- **Consequences:** the Wanderer's set is gold-haired too. The face is still the same mesh.
## ADR-050 — Every bullet is breathed from the jaws along the head's aim (2026-11-11)
- **Context:** the owner: the bullet hell should look natural, "no fire spawning out of nowhere".
  ADR-039's patterns spawned embers on a ring round the body (the storm), off the wing beats (the
  fan) and as walls under the belly (the wheel). Spec `docs/specs/wyrm-breath-armageddon.md`
  (approved: "redesign as breath", no bullets from the body ring or the wings).
- **Decision:**
  - One helper, `spit()` in `bulletAttacks.js`: a bullet spawns at `rig.pt.mouth` and flies along
    the head's ACTUAL yaw (`pt.headFwd`) plus an offset. Patterns emit from their `hit()` hook,
    which runs after the rig, so the bullet leaves the jaws as they are drawn this frame. The pose
    aims the head first (`aimHead`: reach out of the neck base, `headExact`, a look down the line);
    the emission follows where the head really points, never an ideal angle it has not reached.
  - A bullet leaves at mouth height and reaches hit height over a drop scaled to the
    mouth-to-hero distance; the head draws in over a close hero (`reachFor`), so he is not flown
    over. The emission-schedule pre-cues are measured from the mouth.
  - Pattern shapes follow from what a head can do: the Ember torrent (a swept stream, a forked
    tongue, orbs coughed at the extremes, a P3 pirouette), the Cinder burst (coughed cones, P3
    double taps), the Wisp swarm (unchanged origin, denser) and the Scouring breath (tongues of
    fire at fixed offsets off the head's aim, rooted at the mouth's ground projection, swept by
    the body turn). The wheel takes head-relative tongues (`offs`, `aimWheel`) and its cue steps
    the turning wheel forward (its root orbits with the mouth).
  - "Hard" intensity numbers (tuningBullets.js); bullet damage unchanged.
- **Alternatives:** keep the old shapes and only move the spawn points to the mouth (a spiral
  round the body cannot come out of a head that faces one way); emit along the ideal angle and
  snap the head to it (the head lags its target, so bullets would leave sideways out of the jaw).
- **Consequences:**
  - `npm test` → BULLETS checks every bullet is born within 0.6 m of `pt.mouth` and every emission
    leaves within 0.2 rad of `headFwd` (measured: 0.00 m, centre ≤ 0.10 rad: the half-spacing
    offset of a gap cough). Wisps are roared out in a spray and only checked for the origin.
  - Gaps in the denser cones are wider than the hero only at range (spacing x distance > 2 R:
    ~14 m from the mouth in P2): close in, every cough must be parried.
  - Nothing is behind the wyrm except in the P3 pirouette and the Scouring breath's sweep.
  - The mouth reaches ~8 m ahead of the root: tests and AI distances measured from the root are
    ~8 m shorter from the jaws.

## ADR-051 — A perfect parry returns a bullet as a damaging shot (2026-11-11)
- **Context:** the owner wants a perfect parry to send the fire back. Today a parry only deflects
  a bullet for posture (ADR-039).
- **Decision:**
  - `DEFENSE.perfectParryWindow` 0.08 s (inside the 0.22 s parry window). The player computes the
    flag for every parry, stores it on `deflect.perfect` and adds it to `player:parry`; only bullets
    consume it (melee perfect parries are out of scope).
  - On `RESULT.PARRIED` the bullet field reads the flag: a perfectly parried ember or wisp is
    returned (34 m/s, drawn 1.8x, white-gold with an orange trail) and on reaching the head deals
    the kind's `returnDamage` (ember 30 = a light hit, wisp 70 = a heavy hit) through
    `dragon.takeHit` (exact damage, part head: the phase gate and death behave as for a sword hit)
    with `returnPosture` (14 / 30) instead of the deflect posture. It never interrupts the action
    and never counts in a string's DEFLECT xN. `dragon:parried.perfect`, `dragon:returned`.
  - Feedback: RETURN call-out, a gold burst on the blade, a 0.05 s hit-stop, a brighter clang.
  - A return budget per pattern (`TUNING.bullets.returnBudget` 120 HP, ~8 % of a phase's 1500 HP,
    the spec's target): past it a perfect parry is a plain deflect. The spec's per-shot numbers on
    their own let a perfect parrier return all 13 P3 wisps at 70 (~910 HP a swarm, ~3x the sword's
    damage rate).
- **Alternatives:** a bigger posture hit only (no HP damage: not what was asked); returning the
  whole popped clump (would turn one parry into a screen-clearing nuke).
- **Consequences:**
  - The scripted defenders press 0.12 s before impact, outside the window: the bot runs and their
    numbers are unaffected by returns. A human who hits the window can chip HP off with every
    torrent crossing: one return per parry (the clump it pops does not return).
  - A posture break from accumulated returns is allowed and fizzles the field (returns in flight
    included).

## ADR-052 — Ground warnings are the ground heating up (2026-11-11)
- **Context:** the owner: the red ground indicators break immersion ("the pound circle"). Every
  ground warning drew rotating rings of red `•` and `!`, `>` chevrons and a closing inner ring:
  UI painted on the world.
- **Decision:** one diegetic look for every footprint (meteors, pillars, shells, the nova, melee
  slam zones, the burning pass, the flame ring and wall, the Scouring breath's windup):
  `fx.heatDisc` / `fx.heatBand` draw a sparse, stable fill of small ground glyphs (`. , : '`,
  positions hashed per warning, a slow flicker, nothing rotating or marching), coloured by heat
  (dark ember → orange → white-orange as the impact nears), denser and brighter with k, sparks from
  k 0.6; the scorch map's heat channel is stamped under it (no char), so the soil and grass glyphs
  glow. The true edge (a thin bright `·` rim) shows only in the last `flashLead` s. The timing
  flash on the ground is a heat flare (`heatFlare`). No tell red on the ground; the attacker's own
  red glow and flash, the audio and `combat:tell` / `combat:flash` are unchanged.
- **Alternatives:** dimming the red rings (still UI); scorch heat alone (too soft to read at k 0.3).
- **Consequences:**
  - Readability rests on warm-on-dark contrast instead of a red outline: at k 0.2 the footprint is a
    faint warm patch, by k 0.6 an orange field, and the edge is exact when it matters. A human
    readability check is still owed (bots read events, not pixels).
  - Heat stamps decay over ~1.5 s, so a dodged or interrupted warning cools visibly instead of
    vanishing; a little char (burn) builds where heat passes 0.4.
  - The flame ring's outer reach ring and the strip / wall chevrons are gone: the lit fire shows
    the way.

## ADR-053 — Armageddon replaces the Meteor rain (2026-11-11)
- **Context:** the owner asked for a headline set-piece: the dragon fires meteors into the sky that
  crash down across the arena. The Meteor rain dropped 8–14 meteors round the hero without a cast
  anyone could see.
- **Decision:** the attack keeps its key `meteorRain` (audio, Lab, tests, hazard kinds) and becomes
  Armageddon (P2+): a 1.4 s rear-up (the body glows red through `dragon.bodyWarn`, the throat
  white-hot), a 1.6 s salvo of 12 / 16 bolts out of the jaws into the sky (visual, `fx.launchBolt`;
  `dragon:hazard` stage `launch`), the sky answering (`world.atmosphere.skyGlow`, stage `sky`, a
  rumble) while the wyrm drops to all fours and fights on, then a new hazard emitter
  `hazards.barrage`: 3 x 8 (P2) / 4 x 10 (P3) meteors in waves 1.6 s apart, falling on a slant
  from above the wyrm onto the whole clearing (`placeWave`: jittered-stratified; within 12 m of the
  hero a wave covers ≤ 45 % of the ground and no two footprints overlap by more than a third; every
  3rd led onto the hero via `leadInto`, never two led impacts within 0.5 s), P3 craters burning
  2 s (contact ticks), and 1.2 s after the last wave one great meteor (r 7, 34 damage) on the hero.
- **Alternatives:** keep the rain and add a cast animation (not a set-piece); real missile hazards
  for the salvo (they deal nothing: visual only keeps the fairness rules simple).
- **Consequences:**
  - The salvo deals nothing: the windup + salvo (~3 s) is a punish window.
  - The hazard pool is 64 (was 48); the barrage keeps ~10 meteors in the air plus up to two waves of
    craters. Most meteors get no light of their own.
  - A hero who stands in a P3 crater takes 4-damage ticks every 0.25 s (blockable, never while
    rolling): the scripted defender, which never steps out, took 31 ticks over one P3 Armageddon.
    A human who walks out takes a couple. Watch this in the playtest.
  - The timing check pairs each blow with the flash at its own centre (impacts 0.12 s apart).

## ADR-055 — Attack variants: each light hit has 2–3 looks, picked at random (2026-11-12)
- **Context:** the owner: "something about his left clicks is meh to me so lets try to make his
  attack animations and motions cooler and natural looking. i also dont want him to show the same
  pattern over and over so make it have a few variations." Asked, the owner chose "fast and
  flowing" and "random variants per hit", with damage and timing per hit unchanged.
- **Decision:**
  - `LIGHT[i].variants` in `combat.js`: more `anim` blocks for the same hit. 1: low draw cut, leaping
    cut; 2: level backhand, falling backhand; 3: rising whirl, skipping cross-cut; 4: low rising stab;
    5: leaping slam. Each starts where the previous hit's finish leaves the blade (right / left
    alternation kept) so the chain flows whichever variants come up.
  - The animator picks at `play('attack')` with its own noise (never the game's RNG, which the sims
    seed), never the same variant twice in a row for one hit. `forceVariant` pins it for tests.
  - New swing options: `turn` (a partial pivot), `hop` (a skip); `stab` `rise` / `low`; `slam`
    `hop`. Every light sweep without a spin also gets `FLOW` (hips lead, chest trails, weight
    crosses, a dip and a lean into the strike).
  - The pivot starts at mid-strike: turning the body while the blade is hit-tested moved where it
    crossed his front, and three variants fell short at 3.5 m.
- **Consequences:**
  - The REACH test now swings every variant at contact, 2 m and 3.5 m (24 trials, no miss); its
    original table pins `anim` (variant 0).
  - Timing, damage, posture, reach and lunge are the hit's whatever the look; the blade is still the
    hit test, so a variant's arc is gameplay too.
  - The sprint slash, the roll cut and the thrust have one look each.
  - At mid-strike the variants look alike (each blade crosses his front then); they differ in the
    coil, the finish and the footwork.

## ADR-056 — The face in the hood's shadow; gold strands out of the hood (2026-11-12)
- **Context:** the owner: "i can't tell the yellow color in front of his face is his hair. since the
  ascii art and zoom distance will never show the character's actual eyes, nose, and face, we can
  not worry about that." Chose "locks out of the hood", not too long, and asked for three previews
  before any of it was finished; picked "A" of three (spiky fringe + cheek locks; parted framing
  locks; short wild spikes).
- **Decision:**
  - A head item may set `shadowsFace`: the face, ears and neck take the shirt's near-black and the
    eyes are not built. The hood sets it.
  - The hood keeps only the scalp cap of the body's hair and builds `HOOD_HAIR`: four spiky fringe
    strands over the brow, chin-length locks at each cheek, one short strand a side onto the
    collarbone; neighbouring strands alternate the ink sub-id so a line separates them; roots in
    the darker gold, tips in the bright gold.
- **Consequences:** the gold reads as hair against a dark face up close; at the phone's game camera
  every style was only a few gold letters. The Wanderer's set (no hood) keeps its face and hair.

## ADR-057 — A fuller cloak: depth in profile (2026-11-12)
- **Context:** the owner: "the side angle/view also seems like the character is way too skinny and
  doesnt seem to have much depth. add a little bit more." Chose "fuller cloak" (not a deeper body,
  gear on the back or a front drape). The previous round had made the cape too floaty and wide from
  behind, so the width had to stay.
- **Decision:** the three back sheets of `SHROUD_SHEETS` hang from further back (z −0.16 / −0.14,
  were −0.128 / −0.108) and stand off his back more (`out` 0.42 / 0.45, were 0.16 / 0.3); their pull
  points straight back. The mantle is deeper front to back (rz up to 0.2, the extra behind).
- **Consequences:** measured at the hems over 60 idle / 90 run frames: depth behind 0.55 m at rest
  (0.44 on `main`), 0.89 m running (0.81); width 1.28 m at rest, 1.17 m running (1.23 / 1.15 on
  `main`).
## ADR-058 — Levels: one per page load, the boss slot keeps its name (2026-11-11)
- **Context:** the owner wants the Ash Disciple as "a separate level" that can be loaded on its own to
  test it. Everything was built for one zone and one boss: `World` built the forest, main.js built the
  `Dragon`, and fourteen modules read `game.dragon` and listen for `dragon:*` events. Another session
  is changing the wyrm (breath bullets, Armageddon) in parallel.
- **Decision:**
  - `src/levels/index.js` registers level definitions (`id`, `name`, `world` overrides, `buildSet`,
    `createBoss`, the flow's `text`). `?level=<id>` picks one at boot; `applyLevel` merges its world
    layout into `CONFIG.world` before any module is built. Switching level reloads the page: nothing
    has to be torn down. The title screen has a stage picker and the Lab a LEVEL row.
  - **The boss slot:** `game.dragon` stays the name of the current boss and `game.boss` is the same
    object; a level's boss emits the same `dragon:*` events. A boss offers the Dragon contract's
    surface; a duelist (`kind: 'duelist'`) has no plunge and offers `onExecute` instead.
  - Wyrm-specific text moved into the level (flow banners and lore lines, the minimap's zone, the
    combat log's names, the name tag); audio gates creature vocals on the boss's `kind`.
- **Alternatives:** renaming `game.dragon` / `dragon:*` to `game.boss` / `boss:*` now (cleaner, but ~14
  files and a guaranteed collision with the parallel wyrm work; it stays a refactor of its own);
  switching levels at runtime (needs disposal of the world, the boss and the batches); a second HTML
  page per level (two builds, two deployments).

## ADR-059 — Direction: a skill boss rush with fixed rewards (2026-11-11)
- **Context:** the owner: "kinda like phantom blade zero wuxia combat, boss rush, with some exploring
  and rpg elements"; both the wuxia combat and the fiction; "fixed rewards as i want this to be more
  of a skill boss rush game. i do want loot to add cool elements, skills, or abilities to the player
  to give the player the ability to customize and change their combat style."
- **Decision:** the game becomes a series of boss duels, each testing one skill, reached from a
  bonfire through short approaches. Progression is fixed: each boss gives a set reward (a technique,
  a weapon, an ability or an element) that changes how the hero fights; no XP levels, no random loot
  tables. Bosses are wuxia figures (sect disciples, wandering swordsmen) with the Cinder Wyrm as the
  spectacle fight. Each boss gets moves of its own, not the hero's mirrored (owner, about the Ash
  Disciple). The first reward and the technique system come in the PR after the Ash Disciple.
- **Consequences:** ROADMAP M2 (character stats, levels, XP, random rarity) is replaced by techniques
  and fixed rewards; the online milestone is unchanged but not next.

## ADR-060 — The Ash Disciple: a duelist on the hero's skeleton, his moves as keyframe data (2026-11-11)
- **Context:** the first human boss. A swordsman needs the hero's quality of animation (cloth, gait,
  two-bone IK, the ink-line look), but the owner asked that his moves not mirror the hero's.
- **Decision:**
  - He is `buildHero(U, ASH_LOADOUT)` with his own gear items (a douli hat, a robe and skirt on the
    coat springs, a bracer and a bell sleeve, wrapped trousers, a jian with a tassel on a streamer
    spring), recoloured on his own material instances.
  - `HeroAnimator(rig, pilot, poses)`: the animator takes an optional per-instance pose table (merged
    over the hero's; the hero passes none and is unchanged). He brings `loco` (his jian guard on the
    hero's gait and foot planner) and `duel` (a keyframe clip).
  - Every move and reaction is data (moves.js): beats with a tell, a windup (with an optional bait
    hold), active frames, a hit zone, root motion and pose keys in beat-relative marks; `realise()`
    turns a move into absolute times and a compiled clip. The blade is keyed as [azimuth, elevation]
    so swings are arcs and over-the-top chops pass through vertical.
  - Hits are zones (sector, line, ring) tested from his root through the active frames, so contact
    lands on the cue: every move within 17 ms of its flash + lead in the TIMING test.
- **Alternatives:** a new rig and animator for him (months of work to reach the hero's quality);
  mirroring the hero's attacks (rejected by the owner); hit-testing his blade's swept segment like the
  hero's (exact to the pose, but contact times then drift with every pose edit).

## ADR-061 — The duelist's rules: a guard that counters, feints that never glint, the execution thrust (2026-11-11)
- **Context:** the owner chose "Guards and counters": he deflects strikes into his front, they build
  his posture, and after a few he counterattacks. A fencing bot then showed where a guard leaks.
- **Decision:**
  - His guard covers ±75° of his facing in footwork (after a 0.18 s raise delay at the end of a move,
    a stagger or a recoil; at once after a clash or a flinch) and through the first 55 % of each
    windup. A guarded strike deals nothing, adds guard posture (8 light / 20 heavy) and clashes
    (`dragon:guard`, "GUARDED"); in footwork each one makes a counter likelier (0, 35, 70, 100 %): the
    Riposte. A heavy strike with posture 48 or more (a charged thrust from ~90 % charge) crushes the
    guard: it lands and he staggers. The chain's slam (40) does not.
  - **Feints never glint:** a feint has no tell and no flash; only real impacts are cued.
  - A perfect dodge against him is the Ghostep behind him (no plunge), and his back is never guarded.
    The attacker may set the Ghostep's distance (`ghostepBehind`; player.js): his is 1.5 m, since the
    wyrm's 3.2 m left the hero out of sword reach of a man's back.
  - **Execution:** a broken duelist within `execRange` (3.2 m) is executed by a lunging full thrust
    whose first active frame calls `onExecute`; the break is spent. While broken, hits crit ×1.5 (the
    wyrm's 2.2: here the execution is the reward).
  - Openings: his recoveries, the recoil after his last hit is parried, the Ghostep, the break.
- **Tuned on bots** (`npm test` → DUEL WIN; `node tests/integration/duel.mjs . probe`): his blows ×
  1.35 so that a bot reading 70 % of the tells is on the edge. Measured: a god-mode bot that answers
  every tell wins in 50–54 s (three seeds); mortal bots reading 85 % win in 54 s (1 hit taken), 70 %
  win in 70–75 s with 1 and 0 flasks left, 60 % die with him at 10 %. Easier than the wyrm (where 85 %
  is on the edge), as the first boss should be. No human has played it.
- **Alternatives:** no guard (the owner's other option); a guard that holds through whole windups (the
  fencer then never trades, and nothing teaches the commit point); hits during his windups
  interrupting them (makes mashing the answer).

## ADR-062 — The duel's moments: the full deflect, the blade lock, the mikiri, the cinematic (2026-11-12)
- **Context:** the owner wanted Shen Hui to give "sekiro/phantom blade zero parries opportunities for
  epic combat and moments", and picked all four offered: long deflect strings, a blade lock, perilous
  counters and cinematic finishers, at a relentless, PBZ-fast pace.
- **Decision:**
  - **Moments are data on a move's beats**, read by the duelist (`moves.js`): `lock: true` (a perfect
    parry of it crosses the blades), `mikiri: true` (a perilous red thrust: `hitPlayer` passes
    `mikiri`, its flash `perilous`); the full deflect is a rule on any string of ≥ 5 hits. The numbers
    live in `tuning.js` (`fullDeflect`, `lock`, `mikiri`, `cinematic`, `chain`, `idleGap`).
  - **The hero owns the inputs, the attacker owns the outcome.** `player.startBladeLock(att, L)` runs
    the mash (a meter, a prompt, `player:lock`) and calls `att.onLockEnd(won)`; `player.takeHit` checks
    `hit.mikiri` against a roll into the blade (the roll's direction against the attacker's facing:
    his blade's line, since a dashing thrust is often alongside at the impact) and calls
    `att.onMikiri()`. The wyrm offers neither and is untouched; any later duelist reuses both.
  - **A blade lock needs a perfect parry** (0.08 s), not any parry, so it stays a moment and not a
    tax on every heavy blow. Time-out is not a loss when the hero held his ground (≥ 0.6): pressing
    steadily is enough, pressing nothing loses.
  - **`flow.cinematic`** is the one place that slows time and pulls the camera in for a moment, and
    its slow motion is the flow's own time scale, not a hitstop (the hitstop min-merges its scale, so
    the parry's 0.04 freeze stretched over the moment). The camera uses `cameraRig.cine`, an
    additive pull-in that never fights the boss framing.
  - **The pace:** short idle gaps and a chance to chain one move into the next; the tell rules still
    hold for every chained move (first windup ≥ 0.7 s, hits ≥ 0.45 s apart: the DATA test).
  - **His look (owner pick C of three rendered sheets):** a small hat, a long slender jian, a high
    guard (the sword hand by the temple, the blade slanting down at the hero).
- **Tuned on bots:** the god-mode fencer wins in 52–61 s; mortal bots reading 85 % of the tells win
  (3 of 3), 70 % die (3 of 3), 60 % die (2 of 3). The bots use neither the lock nor the mikiri.
- **Alternatives:** a lock on any parry of a heavy blow (too frequent; it would slow the PBZ pace it
  is meant to punctuate); mikiri as a separate button (the roll the player already has, read by
  direction, keeps the controls as they are and works on touch); the slow motion through `hitstop`
  (the bug above); a scripted camera orbit for each moment (more to tune, and it fights the boss
  framing on a phone).

## ADR-063 — PBZ speed, pressure that reaches, and impact you can feel (2026-11-12)
- **Context:** after playing Shen Hui the owner found "his animation, motions, and weapon stance and
  attacks look bad", his attacks slow, and his AI "stupid": it attacked when it could not reach the
  hero, and the hero could kite him. They asked for an epic fast duel with sword clashes and
  parry / dodge moments, an "epic and impactful" parry, and "more impactful hit stun" both ways.
  Answers: PBZ-boss speed; your hits jolt him but interrupt only footwork and recovery; the parry
  "everything, layered"; he sprints in and punishes a flask. Stance: "A", the classic jian guard.
- **Decision:**
  - **The hand follows the blade.** His clips may drive the sword arm from the blade's direction
    (`arm` / `ext` / `lead`, poses.js), as the hero's swings do; a cut is authored as the blade's
    path through the hero (moves.js `slashKeys`: gather, cock, a ~0.1 s snap, follow-through) and the
    hips, chest and front foot go with it. Keyed hands stay for two-handed and special poses.
  - **Speed with the cue intact:** openers 0.46–0.6 s, a string's hits ~0.34 s apart; the flash lead
    drops to 0.3 s and the minimum impact gap to 0.32 s so every flash still comes after the hit
    before it (the DATA test checks it per phase).
  - **No blow at air:** every beat steps in through its windup within a budget (`close`), and
    every step-in, windup track and dash leads the hero's velocity. A string whose next hit cannot
    reach stops. Footwork circles only inside striking range, runs beyond it and sprints past 5.5 m at
    8.6 m/s (above the hero's 7.2). A drinking hero is punished.
  - **Impact is time:** a parry of a blade freezes the frame (0.1–0.15 s), a blow on either fighter
    freezes it too (him 0.065–0.12 s with a jolt layered on his pose; the hero 0.085–0.13 s). The
    parry's FX are built for the freeze: sparks born mid-burst and a shockwave ring born open (born at
    the contact they stacked into one blooming white blot that hid both fighters for the freeze). A
    white screen flash (`grade.flashPulse`) and a heavier clang; a perfect parry adds a short slow
    motion through `flow.cinematic`.
  - His damage × 1.15 (was 1.35): his pressure lands more blows, so each one hurts less.
- **Measured:** god-mode bot ~45 s; 85 % bots win 3 / 3 in 48–52 s; 70 % die 3 / 3 with him at
  8–10 %. Every non-red glint reaches a hero who stands his ground (29 / 29); a hero sprinting circles
  is caught (0.8 m) and hit.
- **Alternatives:** keep the keyed hands and add more keys (the arm still fights the blade between
  them); faster windups with the old 0.35 s flash (a string's flashes would arrive before the hit
  they follow); a homing hit test instead of the step-in (blows that land without his body getting
  there read as unfair); particles on real time during a hitstop (every slow motion would lose its
  frozen sparks).

## ADR-064 — The player drawn at 90 %: Shen Hui's size in a fight (2026-11-12)
- **Context:** the owner, after the Shen Hui duel: "make the main character similar size and scale to
  shen hui as i think the main character is too big"; after rejecting the first attempt (PR #19, which
  kept his size and changed his outfit, face and swings): "lets start over. lets first focus on making
  the size the same as the new boss and reduce the back cloak from covering too much". The Ash
  Disciple is built on the hero's skeleton and drawn at the same `HERO_SCALE` (1.2): standing side
  by side the two are the same height. In a fight the hero is the nearer of the two to the camera
  (it follows him), and with his hood and cloak he read a size bigger. Rendered at 100 / 90 / 80 %
  beside Shen Hui, side by side and facing him at the fight camera, the owner picked 90 %.
- **Decision:** `PLAYER_SCALE` = 0.9 × `HERO_SCALE` (1.08) in `model.js`; the player's `drawScale`.
  `installLean(root, scale)` takes the drawn scale (default `HERO_SCALE`: Shen Hui is unchanged);
  `Player.unlean` / `leanPoint` and the animator's gait and foot planner (`anim.drawScale`) use the
  figure's own scale.
- **Consequences:** visual only: the gameplay body, the hurt cylinder, the hits, the reach and the
  step-in are unchanged (the drawn sword is 10 % shorter; the swing crescent still shows the reach).
  At the fight camera he reads about Shen Hui's size; side by side he stands a little shorter. Planted
  feet hold still at the new scale (slide < 2 mm a frame at a run and a sprint).

## ADR-065 — A trimmed cloak and shorter coat tails (2026-11-12)
- **Context:** the owner: "reduce the back cloak from covering too much". From behind (the usual
  view) the cloak fanned 1.44 m across at rest and, with the long coat tails under it, hid his back,
  arms and legs. Three rendered options from `main`'s cloak (trimmed; the back sheets only; cut at
  the hips); the owner picked "A trimmed" and asked to shorten the coat tails a little too.
- **Decision:**
  - `SHROUD_SHEETS`: the same seven sheets, ~30 % narrower (widths × 0.68), 15 % shorter (segment
    lengths and torn points × 0.85), standing off his back less (`out` 0.3 on the back sheets and
    the sword-shoulder piece, × 0.8 on the others). The mantle and the hood are unchanged.
  - `COAT_PANELS`: segments and torn points 15 % shorter, the join and hem widths 15 % narrower (the
    slant with them); the top widths, the flare and the panels themselves unchanged.
- **Consequences:** from behind his back, arms and legs show between the sheets; the cloak keeps its
  look (the same pieces, the left wing, the drape over the left arm). The Wanderer's set shares the
  shorter coat tails.

## ADR-066 — Gamepad support as a third input source (2026-11-13)
- **Context:** the owner asked for controller support. The game reads one input API
  (`game.input`: key codes, mouse buttons, `moveAxis()`); the touch controls already proved that a
  layer feeding virtual codes keeps every timing (parry tap, charge hold) identical to the real
  device. A boss-rush fighter is played on a pad by many players.
- **Decision:**
  - `core/input.js` gets a separate gamepad source (`setPad`, `setPadAxis`, `releasePad`, `pulse`)
    beside the touch source, each with its own holds, so a release on one never drops another. The
    player and the flow are unchanged: they still read the same codes.
  - `ui/gamepad.js` polls `navigator.getGamepads()` once a frame (the `standard` mapping) and maps a
    souls-like layout: LS move, RS aim, RB / RT attack, LB / LT guard and parry, A dodge, B sprint
    (hold; L3 latches), X flask, Y the HUD prompt's key, R3 lock-on, Menu pause, View help, D-pad
    zoom. A is dodge (not a tap / hold B) so a perfect dodge has no release latency.
  - Aim without a cursor: the right stick steers; idle, attacks auto-aim at the boss in range (the
    touch rule, now one shared helper `ui/aim.js`).
  - Device in use = whichever produced the last input; `html.abyss-pad` swaps the on-screen hints
    (and PlayStation labels from Sony's vendor id). Menus: title any button / stage picker, pause
    menu focus with the D-pad and A, B to resume. A button held across a menu ↔ play change counts
    only after release, so closing a menu never also rolls or sprints.
  - Rumble on the hero's hits, guards, parries and perfect dodges where the browser supports it.
- **Consequences:** no gameplay code changed; keyboard / mouse and touch play are unchanged. The
  headless PAD scenario drives a fake standard pad through the real `Input`. Browsers do not count
  a pad button as a user gesture, so sound starts only after a key / click / tap (or not at all on a
  pad-only session) — a known limit of the Web Audio autoplay rules. Non-standard mappings are read
  with the standard indices (may be wrong on exotic pads); no rebinding yet (ADR-067 adds it).

## ADR-067 — Remappable controls: the game reads actions, not keys (2026-11-13)
- **Context:** the owner asked for button remapping on both the pad and the keyboard. The player and
  the flow read raw codes (`Space`, `KeyF`, `Mouse2`), and the touch and pad layers pressed those
  same codes, so a keyboard remap would have moved the touch buttons and the pad buttons with it.
- **Decision:**
  - `core/bindings.js`: a list of actions with keyboard / mouse and pad defaults (the controls as
    they were, plus R as a second interact key for "fight again"). `Input` answers `act(a)`,
    `actPressed(a)`, `actReleased(a)`; the player, flow and timing trainer read only actions.
  - Every action also answers to a virtual code `'@<action>'`, which the touch and pad layers press.
    The three devices stay independent: remapping a key never changes a touch or pad control.
  - A rebind takes the key / button from any other action; an action left with nothing gets the
    rebound action's old ones (a swap). No action is ever unbound, and no hidden double-binding.
  - Fixed, never remappable: Esc and the pad's Menu (pause; a remap can never lock you out of the
    pause menu), F1–F3 and ` (the Lab, quality, fps), the sticks (move, aim), and the buttons that
    drive menus (A / B / D-pad / LB / RB).
  - The pause menu's CONTROLS panel: two tabs, pick a row, press the new key / mouse button / pad
    button; usable with mouse + keyboard or entirely from the pad. Saved per browser
    (localStorage); a broken or clashing store falls back to the defaults per device.
  - On-screen keys are `[@action]` chips that show the bound key (or pad button while a pad is in
    use) and relabel on every change: prompts, hints, the title line, the control grids.
- **Consequences:** remapped keys are shown everywhere a key is named. Test mocks get the same action
  API (`installActions`). One binding per action after a remap (defaults can have two, e.g. W and ↑);
  no "secondary key" column yet. Mouse buttons 3+ (side buttons) cannot be bound.

## ADR-068 — One duelist engine for every human boss (2026-11-13)
- **Context:** the Ash Disciple's body, mind, clip format and FX lived in his own folder and read his
  data through module imports. A second human boss would have copied about 2500 lines, and every fix
  to the guard, the deflect chain or the tells would have had to be made twice.
- **Decision:** `src/entities/enemies/duelist/` holds the engine: `duelist.js` (`Duelist`: the boss
  slot, guard, posture, break, execution, the duel's moments), `brain.js` (`DuelBrain`), `realise.js`
  (move timing), `poses.js` (`createDuelPoses(guard)`), `fx.js` (`DuelFx`). A boss is a KIT (plain data:
  tuning, moves, clips, gear, poses, the blade's ends, its transitions) and a subclass with a few
  hooks. The Ash Disciple became `class AshDisciple extends Duelist` with `ASH_KIT`; his files keep
  their exports. The engine gained only what a second boss needs and data can ask for: any number of
  phases (`kit.transitions`, `dragon:phase<n>`), drawn alternatives in a string (`pick`), unscaled
  windups (`fixed`), `cast` beats and per-beat hooks, an off-hand blade channel, thrown things with
  their own speed and size.
- **Consequences:** the Ash Disciple's whole suite (`duel.mjs`) passes unchanged, the seeded WIN run
  included (the refactor keeps the order of the AI's random draws). `brain.js`, `fx.js` and the old
  `disciple.js` moved (git history follows them). New bosses are mostly data.

## ADR-069 — The Starless Lord: four blade forms, four bars, a deathblow each (2026-11-13)
- **Context:** the owner asked for a new level: a master dark-side duelist with a red blade of light
  and "evil force powers", in phases: one blade, dual wield, a combined long blade, then one
  cross-hilted blade with an aura; very fast, acrobatic, strings of six with variations, spells
  between the cuts, effects to dodge and to parry or deflect. Asked, the owner picked: a dark lord
  from the stars (not a wuxia figure), four health bars with a deathblow each, faster than Shen Hui
  and ramping up. The game is public, so he ships under his own names: Varr Nihil, the Starless Lord;
  blades of red light; the Void.
- **Decision:**
  - Four forms = the duelist's phases 1 – 4, each with its own stance, moveset (weights per form), reach
    and pace. Each form has a full bar; an empty bar BREAKS him instead of killing him, and the hero's
    execution is the deathblow that ends the form (Sekiro's structure). `lives` tells the HUD.
  - Posture scales with the bar (hard to move when full): a posture break is a deathblow, so without
    this a parry-perfect player would skip his health entirely and a form would last ~13 s.
  - The spells are beats in the same data as the cuts, answered by the same three answers: lightning
    is a blue hit (deflect; a perfect parry returns it), the push a thrown thing (parry cuts it), the
    pull a red line (roll), the thrown blade and stones cue themselves like bullets, called lightning
    marks its ground. No new input, no new rule.
  - Acrobatics are root motion in the data: a somersault (`lift` + the body pitched through a full
    turn, the feet carried round with it), leaps, dashes, the blink (form 4).
  - His look reuses the Wanderer's coat, pauldron, boots, tails and cape in black and crimson, with a
    helm, gauntlets and sabers of his own. The blades draw on the `flask` part, whose ink lines are
    tinted red for this page load (one level per page load).
- **Consequences:** the hardest boss so far (a bot answering 85 % of his tells takes 18 hits; Shen
  Hui's takes 7 – 8). Not played by a human yet. His sounds are the existing cues (no blade hum, no
  thunder of his own). The grip (a choke the hero mashes out of) was designed and left out.

## ADR-070 — The Obsidian Throne Hall; a set's own sky and weather (2026-11-13)
- **Context:** the owner asked to see the arenas before choosing. Three were prototyped as real sets
  and rendered in game: a black throne hall lit red, a storm peak over a cloud sea, a fallen-star
  crater. The owner picked the hall. The sets needed their own light and air, which world.js and
  atmosphere.js hard-coded for the forest and the courtyard.
- **Decision:** a set may return `sky` (moon, ambient and fog, written into the shared uniforms once)
  and `ambience: { setup, update }` (run instead of the fireflies / mist / leaves / ash). The hall
  (`world/throneHall.js`) is centred on its floor seal (the origin); its inlay, pillar slits and
  windows are glyphs in one additive batch of their own (`GlyphParticles` registered with the
  pipeline), which the boss can flare. The lord keeps to the hall's rectangle, not a circle.
- **Consequences:** the two losing prototypes were deleted. Six brazier lights compete with combat
  lights for the eight visible slots (the pool keeps the ones nearest the camera focus). The hall's
  frame cost on a phone is not measured.
## ADR-071 — The hero's swings are keyframed clips: a one-handed chain, each hit in its own plane (2026-11-13)
- **Context:** the owner, for the third time, on the swings: "something about the way he swings the
  sword looks unnatural and not good ... natural, fluid, awesome, dynamic, and varied different
  patterns instead of being the same pattern over and over". Answer to the style question: **wuxia
  flow** (fast one-handed cuts linked by steps, pivots and spins, each hit in a different plane;
  both hands only on the heavy hits). Filmed frame by frame, the cause was the swing model itself:
  every light swing was `slashH`, the hands on a small circle before the chest (ADR-046's two hands)
  with the blade radial to it. Through a whole cut both fists stayed at the sternum while only the
  steel turned; the body stood upright; and every hit was the same flat arc run one way or the
  other. Tuning its numbers (ADR-044, ADR-055, the rejected PR #19) could not change that.
- **Decision:**
  - Each light swing and the charged attack is a **clip**: key poses over the attack's own phases
    (`player/swings.js`, data only; `anim: { kind: 'clip', clip }` in `combat.js`). A key places the
    sword hand, the blade's direction, the free hand, the hips and the chest; `swingPose` runs
    Catmull-Rom splines through them, so the point travels one smooth arc and the arm opens and folds
    because the keys say so. Timing, damage, reach and lunge stay the hit's own (`combat.js`).
  - A clip starts from the pose he was in and drives its channels itself, so a cut runs on out of
    the last one's follow-through instead of cross-fading to a stop.
  - The chain is one-handed (it reverses ADR-046 for the chain): the free hand reaches for the
    target in the coil and is thrown against the cut. The slam and the cleave stay two-handed.
  - 13 clips: three looks each for hits 1–3 (falling cut / draw cut / rising slash; rising / flat /
    falling backhand; whirl / rising whirl / low sweep), two for hit 4 (lunge / rising thrust), the
    sprint slash and the roll cut. Each has a `line`; the animator never follows a swing with one
    along the same line, so two hits in a row are never in the same plane (before, hit 2 retraced
    hit 1's diagonal).
  - The old model is removed: `slashH`, `stabPose`, the windup loop, `FLOW`, the `h` and `stab` kinds.
  - **After the owner's look at the first preview** ("something still seems off during the attack
    animations"; asked which: too fast to follow, the body looks stiff, the arms look wrong, the hits
    don't flow: all four):
    - *Pace:* a light's windup / active frames 0.16 / 0.18 s (were 0.14 / 0.11) and the next light
      waits for `chain` (30 %) of the recovery, so a mashed chain lands a hit every ~0.42 s (was
      0.25 s). The lights' damage and posture ×1.4 with it; the crit window 1.6 → 2.2 s.
    - *Legs:* `lungeFeet` steps the foot that is BEHIND as the swing starts, so he walks through a
      chain (left, right, left …) and the holding foot's heel peels; it was the same left-foot lunge
      every hit. The keys shift the weight from the back foot (hips up) into the front one.
    - *Arms:* a motion audit (per-frame turn of each arm segment in the body's frame) found elbows
      flipping 50–135° in ONE frame where a pole switched or a hand passed the shoulder, and the
      free hand thrown ~0.7 m front-to-back every hit (15 m/s). `_elbow` now limits an elbow's swing
      round its shoulder → hand line to 14 rad/s for every clip (the hand still reaches); the free
      hand stays before the chest in the coil and comes back to hang beside the hip.
    - *Flow:* the coil is ONE key (two made a dead stop before every cut) and the blade is still
      moving when it gets there; `swingPhase` maps time to phase with a monotone cubic (the straight
      map halved the motion's rate in one frame as the cut ended); the cut carries through before
      the next windup starts from it.
  - **After the second preview** ("looking better but i want the angles not to be so perfectly like
    top to bottom and more diagonals and more natural fluid"): filmed from the game camera, the
    "falling" cuts, the leaping cut, the cleave and the slam all ran in upright planes (the blade
    passing over the top of his head at 66-78° of elevation), and the camera, looking down from
    behind him, draws an upright plane as one straight bar up the screen.
    - Every cut's plane is a diagonal: the blade stays under ~45° of elevation and crosses his front
      near chest height. The leaping cut (straight down the middle) is replaced by a rising slash;
      the slam takes a `tilt` (0.42 rad: it comes down from over the right shoulder).
    - The blade whips: at mid-cut the hand is at full reach in front of him and the blade still
      ~30° short of pointing ahead; it comes through and passes the hand as the cut ends.
- **Consequences:** a new swing is a few lines of data and can be filmed and tuned on its own. The
  keys are authored by hand: a bad key shows as a bad pose, so HEROLIFE measures every look (the
  sword hand ≥ 0.40 m from its shoulder at some active frame, the free hand off the grip, no arm
  segment turning ≥ 45° in a frame, the lead foot changing with every hit, the line rule over 40
  chains, the mashed pace) and HEROLOOK keeps the drawn blade out of his body through every look.
  A windup's blade turns to its coil round the side of the hand away from his spine, and the hand
  comes round in front of his chest (`dirLerp`'s carry rules sent the blade behind him out of a
  recovery; a straight hand path from one hip to the far shoulder ran through the torso). Reach is
  untouched; the pace is slower and each light hits harder (a mashed chain deals ~15 % less per
  second); the low sweep crosses his front later in its active frames, because a low blade reaches
  less far under a tall target. The finisher still uses the older slam code; the whirl's feet still
  turn on the ground with the spin.

## ADR-072 — The charged attack is a dashing cleave (2026-11-13)
- **Context:** the owner: "when he charges the sword the arm bend is all messed up and make his
  charged attack be an impactful slash with a cool weightful hit instead of a poke". The charge held
  both hands down at the right hip with the blade out to his side: the sword elbow stuck out level
  and the free arm folded across the belly. The release was a lunging thrust. Of four options
  (dashing cleave, rising launcher, spinning cleave, leaping chop) the owner picked the first.
- **Decision:**
  - **The charge:** a deep, wide stance coiled away from the target, both hands on the grip beside
    the right ear, the blade standing nearly upright beside his head (80° up, 74° at full charge).
    Both elbows bend the way a raised two-handed guard does; the blade stands clear of the cloak.
    (The first version leaned it 34–44° back over the shoulder. The owner: "it looks like the sword
    is piercing through him": from the camera behind him a blade leaning toward the camera is drawn
    DOWN across his back. Upright, it stands above his shoulder from every side.)
  - **The release (`CLEAVE`, kind `cleave`):** the thrust's dash (2.2–3.6 m by charge, front-loaded
    through 0.24 s of active frames), the blade winding back over the shoulder; over the last 45 %
    of the active frames the whole body unwinds into one two-handed diagonal, high right to past the
    left hip, and he sinks into a long low lunge that he holds while the off hand lets go.
  - **The hit:** a 0.15–0.2 s freeze (was 0.1), a harder shake, a ring and a fan of streaks at the
    contact (`fx.cleaveImpact`), a wide crescent that hangs ~2× as long as a light swing's, and a
    second gust and dust where the cut ends.
  - Same damage (70–110), posture, travel and recovery as the thrust (0.08 / 0.24 s of windup /
    active frames for its 0.07 / 0.2 s). The thrust stays as the execution against a broken duelist
    (`THRUST`, `_startExecuteThrust`); both are `dash: true`.
- **Consequences:** `player:attack` / `player:hitDragon` report kind `cleave` for the charged attack
  (audio, the combat feed, tests and docs follow). The cut happens late in the dash on purpose: a
  target reached at any point of the dash is still in front when the blade comes through; REACH
  connects from contact to 3.5 m. Unlike the thrust the blade is behind him for the first 60 % of
  the active frames, so something that only crosses his path early in the dash is not hit.

## ADR-073 — The guard is a cross ward; the cloak is a narrow cape; a shorter sword (2026-11-13)
- **Context:** the owner: "make his guard stance have a deeper angle" (asked: the blade and the
  stance both) and "i want his cloak to be thinner in the back" (asked: narrower from behind).
  Three guards and three cloaks were rendered close up and at the game camera and the recommended
  ones put in; on the preview the owner said "the new cape seems fine", "have the character raise
  its hand up more during the block", and "make the sword a little bit shorter as the longness
  doesnt seem right".
- **Decision:**
  - **Guard, the cross ward:** sunk 0.17 m and side-on (the left foot well forward, hips and chest
    turned ~28° away), both hands on the grip before the chest (13 cm under the shoulder; the first
    version held them at the hip), the blade slanting ~38° up across the whole body to past the left
    shoulder, its point above his head. From the camera behind him ADR-046's guard (hands before
    the chest, the blade ~50° up) showed only its point over his head; the flatter slant shows as a
    bar across his back, and across his front from ahead. The others rendered: a hanging guard and
    a braced diagonal, both with the free palm on the flat (pose channel `offAt`, kept).
  - **Cloak, a narrow cape:** three sheets down the middle of his back, 0.24 m at the hem in the
    middle and the two beside it turned only 0.3 rad out, plus the drapes on the arms; the wing over
    his left side and the sheet behind the sword shoulder are gone (7 sheets → 5). Arms, waist and
    legs show beside it from the game camera. The others rendered: "slim" (the old cloak ~30 %
    narrower) and "scarf tails" (three thin tatters down the spine). Kept by the owner.
  - **Sword:** the drawn blade 12 % shorter (`DIM.drawnTip` 1.06 → 0.93: a 1.12 m sword with the
    pommel; `steelTip` 1.17 → 1.04), rebuilt with `npm run hero-parts`. Swung in one hand the 1.25 m
    sword looked too long. Visual only: the hit segment and every reach are unchanged.
- **Consequences:** the parry flicks the blade up out of a lower guard (a bigger move). Fewer sheets
  means a coat kick draws fewer random numbers, which moved the seeded meteor layout in one wyrm
  test and showed that test assumed a standing hero is always hittable on a blast's first frame; it
  now allows a blow chained within 0.3 s of another to land inside the blast's 0.12 s.

## ADR-074 — The sword arc is a line and a veil, drawn only where the blade turns (2026-11-13)
- **Context:** the owner, on the second preview: "make the sword arc glow effect be more subtle and
  way more epic cooler looking". The arc was four or five rows of bright strokes under a rim of `A` /
  `8` letters with a halftone of `+` behind: a solid glowing band as wide as half the blade. During
  the cleave's dash it drew a wall of light as tall as the sword, because it filled the space
  between two frames of the blade whether the blade turned or was merely carried along.
- **Decision:** `PlayerFx.trail` draws
  - an **edge**: one bright line along the point's path (round `•` strokes stretched end to end),
    which thins and cools as it fades over ~0.25 s, so the cut hangs in the air as a drawn line;
  - a **veil**: 3–5 rows of faint `|` streaks inside it, each fainter toward the hilt (opacity 0.7
    → 0.15) and gone in ~0.1 s;
  - **motes**: a speck or two of light off the point, carried on along the cut;
  - and `arcGlint`: a small star and a pinch of sparks on the point, once a swing, as it comes through.
  Its strength follows how far the blade TURNED in the frame (nothing under 0.03 rad, the full arc
  from 0.2 rad): the arc tapers in and out with the cut, and a dash or a lunge leaves none. The
  slam's is wider and longer-lived; the cleave's hangs twice as long.
- **Consequences:** far fewer bright pixels (the bloom no longer swallows him through a chain), and
  the arc's shape is the cut's own: with ADR-071's diagonal planes a chain draws curved sweeps round
  him instead of bars. The letters and the halftone lattice are gone from the hero's arc. The
  plunge's dive passes `gate: false` (its blade is carried, not turned, and keeps its band). The
  Ash Disciple's and the Starless Lord's sweep trails are their own code and unchanged.

## ADR-075 — The chain's pace: a quick cut between two held ends, a hit every ~0.32 s (2026-11-14)

**Context.** Session 25 slowed the light chain from a hit every 0.25 s to one every 0.42 s (windup
0.16 s, a 0.18 s cut) because the owner found the swings "too fast to follow", and raised the
lights' damage ×1.4 to pay for it. On the merged build the owner wrote: "speed up the attack speed
on the character. its too slow right now". So 0.25 s was too fast to read and 0.42 s too slow to
play. The swings of Session 25's first build were also stiff and had no arc worth the name: what
was hard to follow then was not only the speed.

**Decision.**
- **A light is a short gather, a quick cut and a held finish:** windup 0.11 s, active 0.12 s
  (the lunge 0.10, the whirl 0.13 / 0.15), recovery 0.24 s with `chain` 0.3. A mashed chain lands a
  hit every ~0.32 s (measured 0.32, 0.32, 0.37). The cut itself is as quick as before Session 25;
  readability comes from the poses at its two ends and from the arc that hangs behind the blade
  (ADR-074), not from a slow blade.
- **Damage follows the pace:** the lights are 30 / 32 / 36 / 30 again (posture 12 / 12 / 16 / 14).
  The slam is 66 (was 58) and has a `chain` of its own (0.3): a mashed button used to cut its
  landing off the frame the blade met the ground. Mashed, the chain deals ~104 a second (109 on the
  slow chain, 120 before Session 25). The crit window stays 2.2 s.
- **The sprint slash and the roll cut** speed up with them (0.11 / 0.13 / 0.32 and 0.10 / 0.11 /
  0.26 s); the slam's windup is 0.28 s (was 0.4), its blow 0.13 s. The cleave is unchanged: its
  charge is its windup.
- **`player.debug.attackSpeed`** (the Lab's "atk" slider, ×0.6 – ×1.6): a multiplier on the attack
  clock, so the owner can try other paces on the preview (the Lab's button works on a phone) and
  name a number instead of "faster" or "slower". 1 in play; the root's speeds are scaled back so a
  swing's step covers the same ground at any pace.

**Rejected.** Going back to 0.25 s (the owner called that too fast, twice). Keeping the 0.18 s cut
and only shortening the windup and the wait between hits (the slow blade is what reads as slow).
Scaling every timing by one factor in code (the timings are data, per hit: combat.js).

**Consequences.** The fastest frame of an arm in a cut is larger (the upper arm's throw into the
falling cut and the lunge: ~55° in a frame, was 42°): the test's limit is 60° (it was 45°; the
elbow flips it guards against were 50–135° on swings half as fast). Tests that walk the chain click
every 0.36 s (`CHAIN_EVERY`).

## ADR-076 — The finisher is a clip; a recovery flows into the way home; the whirl drops and spots (2026-11-14)

**Context.** The owner, with the pace: "think of ways to make the character, animation, and motion
better". Session 25's lesson was to measure motion before tuning it, so the hero was run through
every state (idle, run, sprint, the chain in each look, single hits, roll and sprint attacks,
block, charge and cleave, heal) with nine points tracked in his own frame, and the frames where a
point's motion changed most abruptly were listed. Three things stood out:
- **The slam**, the last swing still on its own code (`slamSwing`): its hands covered 0.54 m in
  one frame of the blow, the point reversed in a single frame at the top, and the blade went over
  the top of his head (an upright plane leaned 24°).
- **Every recovery:** the clip's last key is at ~40 % of the recovery and the way home started at
  50 %, so the blade stood still for two frames and then came home in 0.12 s at 60 cm a frame at the
  point, as fast as it had cut: cut, freeze, snap.
- The roll out of a swing and the guard's raise are also abrupt (the point moves 0.4–0.8 m in a
  frame), but both are reactions that must be instant; they are left alone.
Filmed close up, the whirl turned bolt upright, like a figure on a turntable.

**Decision.**
- **The slam is a swings.js clip** (`slam`, line `down`, two-handed) like every other swing: a
  gather (he dips and coils right, the blade drawn down-back past the right hip), a leap (`hop`
  0.26 m with `tuck` 1.2: the knees draw up) as the blade sweeps up his right side, where the camera
  behind him sees it, and cocks over the right shoulder (46° up), then one diagonal down across his
  front into the ground ahead and a little left, the hands leading and the steel whipping after
  them. He lands folded over the planted blade and holds it (`home` 0.55). The second look is the
  same clip nearly grounded (`hop` 0.09). The shards, the reach band, the hit test and the events
  are the def's and unchanged. `slamPose`, `slamWindup`, `slamSwing`, `slamTilt` and the path
  splines they used are removed (about 190 lines).
- **The way home starts while the follow-through is still moving:** a clip's `home` defaults to 0.3
  of the recovery (`SW_HOME`; it was 0.5). The blade turns round without standing still and comes
  home over 0.17 s at about half the cut's speed.
- **The whirl** drops 7 cm into its turn and leans to the inside of it, and his head spots: it stays
  on the target while the body turns away, comes round ahead of the body and finds the target again
  before the shoulders do (`spinTurn`, `SPIN_SPOT`).

**Rejected.** Smoothing the old slam's easing (its plane and its own windup code would have stayed
a second system). Letting the way home finish after the attack state ends, in the cross-fade to the
ready stance (the cross-fade routes the blade by the carry's rules, not the recovery's: a finish
over the left shoulder could come home behind his head). A slower raise of the guard (a block must
read as instant).

**Consequences.** Every swing of the hero is clip data now; the only attack pose still in code is
the execution's thrust. Tests: the finisher's hands move < 36 cm in a frame (33); a cut's
follow-through runs into the way home (no two still frames, the point home at < 0.62 of the cut's
speed); a mashed button leaves the slam's landing ≥ 0.1 s.

## ADR-077 — The sword arc hugs the steel: a fine line in three looks; the thrusts rise (2026-11-14)

**Context.** The owner on Session 26's preview: "the 4th poke on the sword combo is like clipping
through the ground. make the sword trail effect look way cooler and more subtle".
- **The poke.** Measured, the lunge's steel never came within 0.8 m of the ground. Filmed from the
  game camera with the hero facing it, the level blade is drawn straight down the screen from his
  hand to the grass between his feet: the camera looks down at 58° on a hero whose drawing is
  leaned upright, so "toward the camera and level" reads as "down". The swing's glint made it
  worse: it flashed at the end of the gameplay reach, 1.9 m from the hilt and a metre past the
  steel, which from that camera is on the ground in front of him.
- **The trail** (ADR-074's line and veil) ran at the end of that reach too: a crescent twice the
  sword's length, with a veil half the reach wide that still read as a glowing band, an edge of
  stretched dots that showed as dashes, and an end that dipped under the grass on low cuts (0.26 m
  under on the falling cut, 0.63 m on the slam).

**Decision.**
- **Both thrusts rise:** the lunge's point is driven up at 35° (20° in the coil), the rising
  thrust's at 45°, at a tall foe's chest. Facing the camera the blade now ends at his hip, pointed
  at the viewer; from behind it stands long above his head; from the side it is a rising line. The
  hit test is unchanged (the reach band is vertical; REACH passes at every distance).
- **The arc is drawn off the steel:** its edge runs just past the steel's point (`arcAt`: 0.64 of
  the hit segment for the default look, the steel ends at 0.44), and the glint sits on that edge.
- **The edge is a fine unbroken line:** overlapping `|` strokes 0.11 m in size (a sliver wide),
  one per 0.11 m of travel, white-hot as drawn and cooling to indigo as each thins away, so the tail
  tapers to a hair. No dots, no dashes.
- **The look is a thin crescent** (`ARC_LOOK`): the edge with four faint rows close inside it, the
  faintest at 6 %. It was chosen from three: a trail is a taste call and it moves, so three looks
  were built behind a Lab button (`line`: the edge alone; `crescent`; `ghost`: afterimages of the
  steel fanned behind it), rendered as a sheet and put on the preview. The owner answered
  "Crescent"; the other two, the button and `debug.arcStyle` were deleted.

**Rejected.** Keeping the thrust level and selling it with a long streak along the ground (it would
still point at the grass). Shrinking the old veil's opacity only (the band's width and the dashes
were the problem). One look chosen by me with nothing to compare it to (the last two rounds of
this effect both came back).

**Consequences.** The crescent no longer shows the full gameplay reach (hits land up to 0.7 m past
the drawn arc, in the player's favour). Tests (HEROLIFE 1e): a turning blade is drawn in strokes
of at most 0.14 m no further than 1.3 m from the hilt, a bright edge over a faint veil, with no
letters, and nothing for a carried blade; the thrusts' points are at least 30° above level at full
reach.

## ADR-078 — Joint limits in the solver; the charge is a guard held out from the body (2026-11-14)

**Context.** The owner, with a screenshot of the held charge: "while charging the right hand makes
an unnatural angle. review all the characters animation and make sure the anatomy and motion is all
natural and legit". Poses are authored as hand and foot targets and a blade direction; nothing
stopped a pose, or a cross-fade between two good poses, from asking for what a body cannot do. The
hero was run through every state (idle, run, sprint, every look of the chain, single hits, roll and
sprint attacks, block, charge and cleave, heal) and his joint angles were measured in his own frame
(the drawn hero is sheared toward the camera, which bends angles by up to ~15°). Found:
- **The held charge:** the hands were 0.11 m before the right shoulder. The sword elbow was folded
  to 18°, the forearm stood up under the hilt in one line with the blade, the off hand was inside
  the chest and the off forearm ran 15° off the steel.
- **Elbows** closed to 18–20° in the charge and the falling cut's coil; **knees** to 10° in the
  roll's tuck.
- **The sword wrist** folded the blade back along the forearm to 170° for three frames as the
  charge came up from a low coil, and to 139–150° in the slam's gather.
- **The slam's and the cleave's cocked position** put the grip level with the shoulders beside the
  head: the off arm's elbow went up behind the back to reach it.
- **The free hand** passed 2 cm inside the chest on its way to a backhand's coil; **the neck**
  turned 76° in the whirl (Session 26's own head spotting).
- In range everywhere: the shoulders of the sword arm, knees bending forward, the spine (54° at
  most, in the roll), run / sprint / stop / turn / heal / idle.

**Decision.** Limits live in the solver, so no pose and no blend between poses can pass them:
- **Elbows never close past 40°, knees past 32°** (`ARM_FOLD`, `LEG_FOLD`): a hand or a foot asked
  for nearer its shoulder or hip than that is held out along the same line (`_arm`, `_leg`).
- **The sword wrist** (`_wristLimit`, `WRIST_BACK` 128°): the blade never folds back along the
  forearm further than that from the forearm's own line; a pose that asks for more gets the blade
  at the limit, on the same side.
- **A hand never passes through the chest** (`TORSO_R`): inside the ribs' outline it is moved out
  to the surface. The off hand on the grip is exempt from the first and the last (it keeps the
  grip): two-handed poses are fixed in their data instead.
- **The charge** is a high guard held out from him: the grip a forearm's length before the right
  shoulder, the sword elbow lifted out to the side, the off forearm across the chest. Sword wrist
  103° to the steel, elbows 58° / 49°, the off hand 18 cm from the chest's axis.
- **The slam and the cleave** cock the grip 0.16–0.24 m before the shoulder line, and their off
  elbow is keyed down and out (`lp`); the slam's gather draws the hand behind the hip line.
- **The whirl's head** turns 0.6 rad (`SPIN_SPOT`) and is clamped to 1.0 rad on the chest.

**Rejected.** Fixing only the charge's numbers (the next pose would repeat it; the transitions
cannot be fixed in data at all). A full biomechanical model (shoulder cones, forearm twist): the
rig has no hand bones and the audit found the sword-side shoulder in range everywhere.

**Consequences.** The wrist limit turns the blade by up to ~10° in the first active frame of the
falling cut; REACH passes at every distance. Tests (HEROLIFE 1g): through a held charge and its
cleave, three chains, a roll and the guard, elbows ≥ 38°, knees ≥ 30°, the blade at most 130° back
on the forearm; the held charge's wrist, elbows and off hand in range. Not covered: the off hand's
wrist (it runs 4–40° off the steel in two-handed cuts), the free arm's elbow drawn behind the back
in two backhands' recoveries, hit reactions and the death fall (not driven by the audit).

## ADR-079 — A clash is two blades that meet: the contact is posed, held and drawn once (2026-11-14)

**Context.** The owner: "Make the parries and deflect more epic. the clash is buggy and doesnt feel
like a sword clash." Filmed frame by frame at the game camera (side on, the Ash Disciple):
- A parry's freeze-frame (0.1 – 0.15 s, the picture the player keeps) showed **two white blots**
  and no blades: the hero's burst and the attacker's own, each with a 0.55 – 0.7 m `*` core at HDR
  3 – 4 and a 4.5 light, a body-width apart, both blooming.
- The hero's deflect pose snapped out over the clip's first 0.045 s. The parry's own hit-stop runs
  time at 2 %, so through the whole freeze he stood in the guard he started from; the snap came
  after it. The sides alternated, whatever side the blow was on.
- At the frame a blow lands, the attacker's blade is not at the hero's guard. Measured over three
  moves: a cut travels ~0.4 m a frame, so the impact frame has it 0.25 – 0.55 m PAST the hero; a
  thrust's blade runs down his centre line with the hilt at his chest.
- The same white core every 0.34 s as the tell's glint, the size of the hero.

**Decision.**
- **FX time runs on through a freeze** (`game.fxDt`, `CONFIG.render.fxLive` 0.6): particles and the
  light pool advance at 0.6 of real time while a hit-stop holds the actors. The fighters freeze on
  the contact; its sparks fly.
- **One clash, of lines** (`combat/clashFx.js`, STYLE.md → "Steel on steel"): streaks in the screen's
  plane along the turned blade's way, a cross along the two edges, a two-frame core, embers, a ring
  where the exchange turns. The attacker's own parry burst is gone. The duelist's tell glint keeps
  its four rays and loses the disc.
- **The contact is posed** (`duelist.parryContact`, `player._parry`): for a hit marked `steel` the
  attacker steps his own pose back along the strike to the last frame before the blade crossed the
  hero in which it is 0.34 m clear of him (a thrust is set 0.4 m aside by turning him), and stays
  posed there (`brain.back.off`: the pose shown runs behind the timeline; the timeline, the tells
  and the hits do not move). The hero's deflect goes to that side, up for a blow from above, hung
  for a low cut, with no cross-fade and in the same call, and the grip is nudged until the blades
  touch. A blow that is only deflected rebounds for 0.07 s before the clip takes over again.
- **The freeze is context:** 0.05 – 0.075 s inside a string, 0.11 s on its last blow, 0.14 s
  perfect; a camera punch (`cameraRig.punch`) carries the weight the long freeze used to.

**Alternatives.** Resolving the hit when the blades first touch (a geometric parry): it would move
every contact off its flash + lead, which the timing tests and the player's rhythm rest on.
Animating the sparks only (leaving the poses): the freeze-frame still shows no contact. Slowing
the strike so its impact frame is at the guard: his cuts are a 0.1 s snap by the owner's brief.

**Consequences.** Nine extra pose evaluations of the attacker and two of the hero per parry (once,
not per frame). The step back can show him up to 0.06 s behind his timeline for 0.07 s. A thrust
turns him up to 0.5 rad for one beat; the next windup's tracking takes it back. Seeded sims shift
(fewer particles draw on `Math.random`). Checked by `duel.mjs` CLASH: 7 of 10 parried blows end
with the blades ≤ 0.2 m apart, all 10 held back off the hero, the freeze short inside a string.
Not checked: how it reads on a phone.

## ADR-080 — His guard is read from him; a swing can be cancelled into a guard or a dodge (2026-11-14)

**Context.** The owner: "improve the combat mechanics of enemy guarding, being able to animation
cancel from a swing to a guard or dodge instantly. right now i cant tell animation or feel wise that
the enemy is guarding." Filmed: his guard was his en-garde stance (nothing changed when it was
up); a strike into it drew a white blot and a clip whose blade reached its block 0.06 s in, behind
a 0.07 s freeze; the hero's swing went on through him; the counter was a roll of the dice the
player could not see coming; and the hero could not leave a swing (a guard only out of windups and
recoveries, a dodge only after 35 % of a recovery). The sentence reads two ways (who cancels), and
both were missing, so both are built.

**Decision.**
- **The hero cancels:** a guard press or a dodge ends a swing at any point (not the execution).
- **His guard has three pictures** (`duelist/guard.js`, shared by every duelist): **raised** as
  the hero swings at him (the blade stands across his body; `brain.wardK`); **a ward** on the
  strike's side whose contact pose is the clip's first frame (dull steel sparks, a dry clack,
  GUARDED); **a deflect** (he beats the strike away: orange, a harsh clang, DEFLECTED in red), which
  throws the hero's blade back (`player.onGuarded`: the bounce, cancelled at once by a guard or a
  dodge) and starts his counter as the 0.24 s beat ends. The counter's odds per guarded strike in a
  row are unchanged (0 / 35 / 70 / 100 %); what is new is that it is announced.
- **He cancels too:** past half of a move's recovery he breaks it off into his guard when struck,
  and once per 3 s he may step out of a heavy blow (45 %; from footwork or that late recovery).

**Alternatives.** A guard icon or a bar over him: tells are read from the attacker, never from the
HUD (COMBAT.md rule 2). Bouncing the hero off every guarded strike: attacking a guard is how its
posture is worn (Sekiro's rule), and a bounce per hit would stop the chain dead. Letting him abort
a windup into a guard: a mashed light would then cancel his attacks.

**Consequences.** Attack commitment is gone from the hero's side by design; what keeps mashing in
check is the deflect. His punish window is the first half of a recovery (it was all of it, though
a flinch already raised his guard after one hit). Measured (`duel.mjs` WIN, seed 4242, a fencing bot
that answers every tell): 55 s, 42 parries, 22 guarded swings, 5 breaks; before: about a minute.
No human has played it; whether 45 % of heavy blows dodged feels fair is the owner's call.

## ADR-081 — The blade lock is two crossed blades; a duel is framed closer (2026-11-14)

**Context.** "The clash" may also have meant the blade lock. Filmed from the side: the two stood
1.5 m apart, his blade standing up, the hero's in his ordinary guard: nothing crossed. Every press
drew a white bloom in the air between them. And at the default camera (36 m, 32°) two duelists are
~60 px tall at 720p: no clash reads at that size.

**Decision.**
- **The lock:** the two close to 1.3 m (half each), a lock pose for the hero (both hands driven
  forward, the blade up and across), his grip servoed onto the crossing of the two blades every
  frame (`_lockCross`), sparks grinding out of it, a small spit per press, and the pair sliding
  0.9 m with the meter. The blades break apart in gold or orange.
- **Duel framing:** a duelist's `TUNING.camera` (`within` 6.5 m, `zoom` −6 m, `fade` 4 m) eases the
  camera in while the hero is in his reach, applied after the flow's boss framing (which only ever
  pulls out) and scaled for the phone's closer camera.

**Alternatives.** A fixed closer camera for the whole level: the approach, the leaps and the thrown
qi want the wide view. A scripted side-on camera for the lock: the fixed-yaw camera is the game's
look (ADR-005), and the X reads from above once the blades truly cross.

**Consequences.** In reach the fighters are drawn 20 % larger; the wheel's zoom still applies on
top. The lock moves the boss (`moveBy`, inside his bound). Checked by `duel.mjs` CLASH (1.3 m apart,
blades within 0.2 m). The closer camera is a taste call that was not put to the owner as options:
it is one number to change.

## ADR-082 — The trade clash: two cuts at the same moment meet (2026-11-14)

**Context.** Proposed in Session 27 and picked by the owner ("Trade clash"). Until now a cut of the
hero's and a blow of the duelist's that fell together both landed: the two most committed moments
of a duel passed through each other. The parry and the guard already clash; trading blows did not.

**Decision.** A blade's blow (normal or blue, from a zone beat: not red, not a cast, not a thrown
thing) and the hero's cut within the same moment **meet**: neither is hurt.
- **Two entries, one outcome.** `player.takeHit`: a hit marked `steel` that arrives while the cut
  is in the air (`DEFENSE.trade`: its active frames, 0.03 s before, 0.02 s after) returns
  `RESULT.CLASHED`. `duelist.takeHit` (`_tradeNow`): the hero's cut connects when his blow is at
  most 0.1 s from landing: the beat is spent and his timeline skips to its impact. Without the
  second, a cut that reached him a frame before his blow would bite and then be bitten.
- **The picture is a parry's:** he is held where his blade met the hero (`parryContact`), the
  hero's cut is stopped on it (`_meetBlade`, the code the parry uses), the burst is white-hot with
  two rings. Left in their swing poses the blades were 0.7 m apart in the frozen frame (his cut
  low, the hero's high); stopped on his blade they are 0.01 – 0.22 m apart for cuts.
- **Nobody wins it:** the hero bounces (a guard or a dodge at once, an attack after 0.28 s); a
  string goes on; a single strike or a last blow ends in the short `clash` reaction, not the recoil.
  Guard posture × 1.5 (12 / 30). The exception is a cleave that would crush his guard: it beats
  the blow aside, staggers him and lands.
- **It cannot be mashed:** after one, the next needs `rearm` 0.6 s. The first version had no such
  rule and relied on the bounce's 0.28 s; the test caught a mashed button trading the second blow
  too (a string's blows are 0.42 s apart, not the 0.34 s of their windups).

**Alternatives.** A button for it: it is the absence of one that makes it a trade. Making it a
parry (the recoil, the blade lock, the full deflect's count): attacking would then be the better
defence. Ending the string on a trade: a duelist who is relentless by the owner's brief should
not be stopped by a light.

**Consequences.** `RESULT.CLASHED`, `combat:clash`, the sound `trade`, the CLASH call-out. A press
window of ~0.19 s (the parry's is 0.22 s) for a smaller reward and no opening. An invisible timer
(the re-arm), like the parry's. Checked by `duel.mjs` TRADE (16 checks). Not checked: a human
playing; whether "attack into his attack" is found without being told.

## ADR-083 — Hit reactions fall the way the blow drives them; he dies where he lies; knees and elbows stay above the grass (2026-11-14)

**Context.** ADR-078's audit left out the hit reactions and the death fall; the owner: "Yes, audit
them". The flinch, the block, the parry, the guard break, the knockdown and the death were each
entered from 20–30 states (standing, running, every hit of the chain, the charge, a roll, the heal,
from each side, lying down) with the joints, the ground, the blade against the body and the most
abrupt frames measured, and then filmed. Found:
- **Killed while knocked down** he stood up first: the death clip starts upright, so a man lying on
  his back was lifted to his feet in a tenth of a second (his head from 0.3 m to 1.4 m), knelt and
  fell a second time.
- **The death's collapse** pushed both knees 14–16 cm under the grass: the feet were carried from
  the kneel to "legs laid out along the body" while the hips dropped, and nothing kept a knee above
  the ground (hands and ankles had floors; knees and elbows did not).
- **A knockdown from behind** turned him 180° in ONE frame to face the blow, to fall on his back:
  his hands and feet moved 0.5–0.7 m in that frame.
- **Every flinch snapped him BACK**, also one from a blow between the shoulder blades.
- **Struck in the middle of a swing** the reaction faded in over 3 frames: the blade was thrown
  1.2–1.8 m in one of them (a cut's own fastest frame is 0.9 m), and in the whirl the whole body
  whipped square, the hands 0.57 m in a frame.
- **He fell like a board** (both legs straight, arms at his sides) and lay like one; the corpse too.
- **On the corpse** the left elbow stood up in the air (its pole pointed "behind him", which is up
  once he lies on his front) and the sleeve's cloth sheet stood 0.45 m straight up with it.
- In range: the guard break, the block and the parry (a guard blown open is meant to be violent),
  and every joint angle through all of it (ADR-078's limits held).

**Decision.**
- **A knee and an elbow have a floor** (`KNEE_FLOOR`, `ELBOW_FLOOR`; `_hingeFloor` in `_leg` /
  `_arm`): a joint solved under the grass is swung round its limb's line up to the grass, the short
  way. In the solver, so for every pose and blend, like ADR-078's limits.
- **The knockdown falls away from the blow** (`player.kdProne`, `_fallFrom`): from the front or a
  side onto his back, from behind onto his FRONT (hands thrown out, lies face down, pushes himself
  up, a foot under him, stands). His facing eases square to the blow over the fall
  (`TUNE.knockdownTurn`, 11 rad/s, at most a quarter turn) instead of being set in one frame.
  Timings, i-frames and the slide are unchanged.
- **The fall itself:** the feet stay where they stood as the hips drop, so the knees buckle; the
  hands are left behind out ahead as the chest goes; lying, one knee stays up with its foot flat,
  the other leg long, the sword arm flung wide and the free hand on his belly.
- **Killed in the knockdown he dies where he lies** (`deadDown` clip; `player.deadDown`,
  `downFrom`): the fall carries on to the grass, one arch runs through him and he goes limp. No
  kneel, no second landing (its dust and shake are skipped).
- **The flinch gives the way the blow drives it** (`player.hitPush`, the push in his own axes):
  arched back, folded forward over a blow from behind, bent to the side, with the foot on that
  side catching him.
- **A reaction entered from the middle of a move** fades in over 0.1 s (0.05 from standing or
  running), and one entered mid-turn (the whirl) finishes the turn over 0.3 s (`A.yaw0`,
  `carryYaw`) instead of snapping square. The guard break's fade is 0.07 s (was 0.04).
- **The corpse:** one knee fallen out to the side, his face turned to one side, both elbows flat on
  the grass. Lying on the ground the cloth sheets obey gravity (`_layFlat`: a sheet's far end no
  higher than its root), where "wrapped along the body" stood them up with a raised arm.

**Rejected.** Easing the old turn-to-face (a half pirouette while falling backwards is no more
natural than the snap). A ragdoll (no physics in this game; fixed clips are readable and cheap).
Lengthening the reactions to hide the fades (they are gameplay timings).

**Consequences.** A hero knocked down from behind keeps his back to the attacker when he gets up.
The fastest frames after the change: the blade 0.2–0.75 m entering a reaction from a swing (was
0.9–1.8), the guard break 1.1 m (meant), a knockdown from behind 0.26 m (was 1.8). Tests (HEROLIFE
7): the flinch's direction, the whirl's interrupt, the knockdown from the front, behind and a side
(which way he lands, how far and how fast his facing turns), both deaths, and no knee or elbow
more than 2 cm under the grass through all of it. Not covered: the plunge's and the blade lock's
poses were not part of this audit (the lock was reposed in ADR-081); the off hand's wrist in two-handed cuts and the free arm's
elbow in two backhands' recoveries (ADR-078) still stand.
## ADR-084 — The Starless Lord's harness: an armoured dark lord of his own design (2026-11-14)
- **Context:** the owner asked to improve the boss's "character detail" and to make him look like a
  famous film villain in black armour, a helmet and a cape. He had been built from the Wanderer's
  coat, pauldron, boots and half-cape under a horned helm, at the Ash Disciple's size.
- **Decision:** the archetype, not the character. He gets a harness of his own (gear.js): a deep
  hood over a prow faceplate with one slit of red light and a ribbed breather; a cuirass with a
  gorget and a ring of red light on the breastbone; a plate yoke on the chest joint with a lamed
  pauldron on each arm; plate arms and thighs; hip plates over a war-skirt; and a cape of five sheets
  to the ankles on the streamer springs. Nothing is copied from another work's design: the faceplate
  is his own, there is no chest panel, and the names stay his own. He is drawn at 1.32 (`kit.scale`;
  the hero is 1.08, Shen Hui 1.2): a head taller, visual only.
- **His head, the owner's pick:** three heads were rendered in game on one sheet over the same
  harness (A a crested sallet with a lamed tail, B the same helm under a crown of swept-back spikes,
  C the faceplate in a deep hood) and A was built first. The owner picked C ("the hood",
  2026-11-14). The two helms and the `?lordLook=` switch that showed them on the preview were
  removed, and the hood was finished as his head (`HOOD_RINGS`, a ring per row as [y, half-width,
  front edge, back edge, opening]): a round crown, a brow that hangs forward over the faceplate and
  closes just above it, a rim in the cloth's ember red round the opening, a drape pooled on the
  yoke. As first rendered it read from the side as a flat-topped box. The standing collar behind the
  head went with the helms: it poked through the hood's sides.
- **Consequences:** the game is public, so a look-alike of a film character was not built; the owner
  was told so with the sheet. The yoke is rigid on the chest, so a raised arm passes under it (as the
  hero's mantle). The hood is rigid on the head joint (no springs): its drape turns with his head
  over the yoke. The hero is hooded too; his hood is pushed back off a face and gold hair, the
  lord's is closed over the brow round a faceplate. His drawn body is 32 % larger than his hurt
  spheres (was 20 %).

## ADR-085 — How the Starless Lord moves: the glide, strings that walk, three more spells (2026-11-14)
- **Context:** the owner asked for better animation, movesets, spell and force effects and motion. On
  film a man in full plate sprinting at 9 m/s on the hero's run cycle looked wrong; every cut of a
  string re-planted the same foot; a spinning cut turned the hips a full turn over planted feet; and
  his spells were few strokes each.
- **Decision:** (1) **He does not run.** Past 3.4 m/s in footwork the animator takes his own `glide`
  clip (not a walking clip: no foot planning), lord.js lifts the root 0.22 m and a wake streams off
  under him; his backstep and sidestep are carried the same way. Inside striking range he walks.
  (2) **Strings walk and turn:** cuts alternate the driving foot, a spin's feet go round with the
  body on a hop, two new aerials (a cartwheel cut, a backflip that throws crescents), a flourish per
  form in the recovery of its main strings, a slower and deeper breath in the guard. (3) **Four new
  moves and three new spells** that need no new hero state: the Crushing Dark (a red line; the catch
  is a knockdown under a closing seal), the Rift (fissures along the floor: crescents with their own
  look), the Dark Star (a marked ring that follows the hero until its cue). (4) Every spell's
  effect was redrawn (fx.js); a pilot may raise the cloth's updraft, so his cape lifts through a cast.
  (5) Found on the way: a waiting duelist stood in his guard (the animator's reset came after the
  brain's and went back to the walking clip): both bosses now wait in their clip (he sits, Shen Hui
  kneels).
- **Consequences:** the grip is the pin, not the "lifted and held, mash to break free" grab the
  roadmap sketched: that needs a hero state of its own. 37 moves (was 31); on main's faster chain
  and guard (ADR-075, ADR-080) the 85 % bot takes 315 damage (was 325 at his release) and the 70 %
  bot 692 (was 740): about as hard, not re-tuned against a human. No sounds of their own for any of
  it yet. A flourish is the first half of its recovery only: past `guard.recoverOpen` (ADR-080) his
  guard is up again and he may ward or step out of the rest.

## ADR-086 — The free hand: a wrist, sword fingers, a choreography for every cut (2026-11-14)
- **Context:** the owner: the free hand "looks unnatural and weird during the attack animations",
  "stiff, like a mannequin", and "the hand itself" is wrong; the style they chose is sword fingers.
  Measured: the hand was rigid on the forearm (no wrist), swapped open/fist at `twoHand` 0.6 with a
  9-21 cm pop, locked the off elbow at 152-176° on the grip, ping-ponged the elbow 47° ↔ 126° between
  keys, and moved with no counterbalance to the blade.
- **Decision:** (1) A **wrist joint** for the free arm (`arms.L.wrist`, `arms.L.point` at the
  fingertip), turned only for the hero (`HeroAnimator` `opts.freeHand`; the duelists keep a rigid
  hand) by a spring inside human limits (`WRIST_L`), sub-stepped at ≤ 1/120 s so it is stable at any
  frame rate. (2) The **sword-fingers hand** (`heroGeo.swordFingers`): index and middle straight and
  pressed together, ring and little folded into the palm under the thumb, 1.3× long (`BODY.fingerEx`)
  so the point survives the glyph pass; shown by the pose's hand shape `hs`. (3) Four pose channels
  (N 53 → 61): the fingers' direction `lD`, the palm's normal `lN`, `hs`, and `lk` (rest the hand on
  the sword wrist). (4) **A choreography per cut** (swings.js `FH` places and keys): the hand gathers at
  the sword wrist in the windup and is thrown opposite the cut through the follow-through; overhead
  only rarely; authoring rules written into swings.js. (5) **The grip without pops:** the fist shows
  only once the hand is within 3.5 cm of its place on the grip (kept to 5 cm, 8 cm in a fully
  two-handed pose); `LOCK_REACH` 0.98 keeps the free elbow ≥ 23° bent on the grip. (6) One builder,
  `gear/hands.js` `buildFreeHand`, for every outfit's arms (the sword fingers included).
- **Consequences:** the duelists' animator carries the new channels but ignores them (their wrist is
  identity every frame: DUEL and LORD check). The wrist sits on a limit through much of the falling
  backhand, the falling cut and the whirl (the keys ask for more turn than a wrist has); tune those
  keys in the Lab close-up if it reads stiff. HEROHAND (H1-H14, H5b) guards the contract: the turn
  per frame, the limits, the fingers out of his body, the fist's distance, 30 fps stability.

## ADR-087 — Weight and footwork: the body leads, the edge bites, the feet stay planted (2026-11-14)
- **Context:** the owner asked for "weight and impact" and "footwork and body". On film the hips,
  chest and hand peaked together (0.150 s), a light's step glided past its plant, planted feet skated
  7-30 cm through turns, the whirl skated its planted foot about a metre, and a landed hit changed
  nothing in the body.
- **Decision:** (1) A light's **step is shaped** (`TUNE.lungeShape`: push off, brake at the plant),
  with the root filter's lag pre-compensated inside `_integrate` (`atk.shaped`, `svx`, `svz`).
  (2) **The body leads:** the hips by 0.033 s, the chest by 0.017 s (`anim.leadK`, faded at a held
  coil); anticipation and overshoot keys (body only); bow stances on the thrusts and falling cuts.
  (3) **The bite** (`atk.hitAt`, per-def `bite`): through the freeze the blade holds where it bit, the
  grip pulls in along it, the hips drop, the chest folds and the head nods; then it tears through over
  0.08 s of the swing's clock. The cleave bites hardest (1.5) but folds neither chest nor head
  (swings.js `fold` 0: its upright blade stands before his face). A guarded strike never bites.
  (4) **Planted feet** pivot on the balls of the feet, the rear foot holds, drags its toe when
  stretched and follows in one step; the return to stance moves the foot that stepped. (5) **The
  whirl hops** (`spinFeet: 'hop'`): each foot is carried round from where it stands, tucked in the
  air, and the turn overshoots ~14° and settles.
- **Consequences:** a short click now steps the whole lunge (~35 % further than before in real play:
  a feel check on the phone). The hit segment's far end moves up to 46 cm (lights) and 62 cm (whirl)
  against before; REACH is unchanged (38 ok). `carry` stays a code option for the whirl, for an A/B.
  HEROWEIGHT (W1-W11) guards the lead, the bite, the plant, the drag and the hop.

## ADR-088 — A cut that lands where it is drawn (2026-11-14)
- **Context:** a landed cut's effects were spawned at the hit test's point, on the upright, unleaned,
  unscaled gameplay bodies: at the game camera they sat 13-65 px off both the drawn blade and the drawn
  body, and a big white star hid both fighters in the freeze.
- **Decision:** (1) The **drawn contact** (`player._contactPoint`): the drawn blade's stretch met with
  the boss's drawn hurt spheres (`drawnPoint`, `drawScale`), moved onto the body; on a duelist it moves
  with his shove. (2) **The contact effect** per weight (`combat.js` `contact`: light, sweep, point,
  slam, cleave, execute; `cutFx.js`): a slash line laid along the cut, a tick across it on a crit or a
  puncture, sparks thrown along the blade's travel. (3) **The steel:** a flare at contact
  (`player.bladeFlare`), a glint up the leading edge, a flash along it held through the freeze.
  (4) **The camera:** a kick along the cut (`cameraRig.kick`, sprung back in ~0.25 s; the mouse ray
  leaves it out) and a punch on every landed cut. (5) **Sound:** a `cut` layer (a slice and a ring
  per weight) over the body's hit; none for a guarded strike or a slam's shards. (6) A struck duelist
  **shudders** through the freeze (drawn only; a sword cut's only; his trail pauses). (7) Cosmetic FX
  noise draws from its own random streams, so effects never shift the AI's seeded stream.
- **Consequences:** the lights' freezes are a hair longer (0.055 s, was 0.05). The particle pool peaks
  at ~396 through a mashed chain (the arc trail dominates, as before). CUTFX checks the drawn contact
  within 0.15 m of the drawn body in the frame the freeze holds.

## ADR-089 — Outfits and sword looks as options until the owner picks (2026-11-14)
- **Context:** the owner wanted a new look and asked to be shown options. The hero must stay distinct
  from the Ash Disciple (no douli, no red tassel) and keep the moonlit cyan/violet longsword.
- **Decision:** (1) Three outfits behind `?heroLook=` (gear/looks.js `HERO_LOOKS`; the `?lordLook=`
  precedent): the **Moonlit Robe** (a high-low robe, violet sash, silver guan), the **Swallow** (a short
  jacket, swallow tails, a moon scarf, bare forearms), the **Moon Warden** (lamellar, a left pauldron
  and capelet, a headband and ribbon); each also as `<id>-shade` with the face in shadow (the lit faces
  read as a gold disc at the game camera). Today's look stays the default. (2) Three sword looks behind
  `?sword=` (gear/moonblade.js): **sheet** (a clean leaf blade on the swept guard), **ribbon** (the same
  with a strip of the cloak's hem off the pommel), **crescent** (a silver crescent cradling the star
  gem). (3) Supporting engine: per-rig tints (`tintHero`: one rig's materials, never the shared
  uniforms), `setLoadout` restores the shared part ink even when the build throws, cloth `inMax` (no
  swinging into the wearer) and `floor` (ends kept over the grass in a roll), shell arcs, data-built
  sheets (`gear/sheet.js`).
- **Consequences:** (superseded in part by ADR-090: the owner keeps all of them as options for later,
  with today's look and sword as the default.) As first planned: after the picks the winners become the defaults, and the losers, both
  switches, their Lab rows and the CLAUDE.md line go (a non-default sword also drops the `blade.*`
  Blender parts). The tints recolour the hilt's trim and leather per outfit. LOOKS guards each look's
  cost (≤ today's meshes, ≤ 26.6k triangles, ≤ 21 draws), its cloth above the grass and its colours on
  its own rig.

## ADR-090 — Arms that open and swing; the charged blade clear of his face; a fist that is a hand (2026-11-14)
- **Context:** the owner on the preview of PR #29: "the right hand looks very disfigured", "when
  charging, the sword is piercing the characters face", "something about the arms still feel
  unnatural and stiff"; and the outfits: "keep the new skins for now to be used in the future. we
  will use the current todays look for now as the default". Measured in the chest's own frame (the
  drawn figure is sheared toward the camera and scaled: world angles lie): (1) the fist (`gripFist`,
  every rig since ADR-041) was four thin discs with a plank across them: up close a spring, not a
  hand. (2) In the charge the blade stood 0.10 m from the head's axis, 3-7 cm INSIDE the hood (the
  hood's radius is 0.13-0.17 m): it leaned back toward a head that leans forward. (3) His clips ask
  for the hand at 0.94-1.01 of the arm's length at a cut's contact and a thrust's end, and the soft
  reach (ADR-044: `ARM_SOFT` [0.78, 0.955]) turned every one into an elbow of 124-130°: the arms
  never opened. (4) On the run both elbows pointed 0.47-0.73 out to the side (arms akimbo from the
  front) and the free arm was one rigid 87° crook; and the arms' swing followed the fore-aft move
  direction alone, so strafing with the aim held elsewhere (most of a fight on the mouse, or locked
  on) they hung still.
- **Decision:** (1) **The fist:** finger rolls nearly as deep along the grip as they are apart (one
  hand with shallow grooves) and a rounded back of the hand; for every rig. (2) **The charge:** the
  hands lower and out to his right (`rH` −0.10, −0.11, 0.31), the blade leaning OUT (az −82°, not
  back), less of a bow; the cleave's first keys match and wind back out over the shoulder. The blade
  passes 25 cm from the head's axis through the hold and 21 cm through the release. (3) **The hero's
  reach** (`HERO_SOFT` [0.93, 0.99], `opts.freeHand` only): the elbows open to 143-159° where a clip
  asks for a full reach and never lock (163° at most); the sword arm blends back to `ARM_SOFT` by
  `twoHand`, so the free hand can follow the grip (the slam's and the cleave's gaps are unchanged).
  (4) **The run:** elbow poles back beside the ribs (rest too), the free hand's back swing reaches
  down and back so the elbow opens behind him and folds in front (56° a stride), and the hand is
  open on the move. The swing's sign is the fore-aft direction he last moved in, latched through
  sideways and eased (`anim.armSign`), so the arms swing in a pure strafe (27 cm; 0 before) and do
  not jump when the direction flips. The sword arm rides the stride backing away too. (4b) **The
  guard** breathes and rides the walk (it was rigid from the hips up); **the way home** from a
  swing starts earlier and lands on a smootherstep (both arms whipped home at 6-7 m/s and stopped
  dead on one frame). (5) **The free hand:** sword fingers
  1.15× (1.3× read as claws up close); the `wing` place slopes down from the shoulder (level, it made
  a scarecrow of the whirl's and the flat backhand's finish). (6) **The outfits and sword looks stay**
  as options behind their switches for later use; today's look and sword are the default (ADR-089's
  "temporary" no longer holds).
- **Consequences:** ADR-044's "the elbow keeps ~35° at a full stretch" now holds for the duelists
  only; the hero keeps ≥ 15° (HERO asserts it; it was 23°). His sword hand reaches up to ~3 cm
  further at a full stretch. `loco()` and `guard()` are shared with the duelists' footwork, so the
  hero's free-arm numbers there are gated on `A.freeHand`: the Ash Disciple's running arm is
  bit-identical to before (tucked in like the hero's, his sleeve ran into his ribs). A swing's
  finish is held ~30 % shorter before he comes home. HEROARMS guards the rest pose, the run, a pure
  strafe, the opening at contact, the lock bound and the charged blade's clearance.

## ADR-091 — A streak of perfect dodges is answered blow for blow: the flurry (2026-11-14)
- **Context:** a perfect dodge had one answer for each kind of boss: the plunge onto the wyrm's head
  (ADR-027), a blink behind a duelist (ADR-061). The owner: "more different perfect dodge animations
  instead of the same one of just teleporting on top and stabbing the head or behind the enemy ...
  if the player keeps doing more successful perfect dodges in a streak, make the attack also hit the
  # of attacks the player is on a streak ... epic anime with good visuals, animation, and impact".
- **Decision:** (1) **A streak.** Perfect dodges in a row count up; a blow that hurts ends it.
  Blocks, parries, plain dodges and time do not: the rule a player can hold in his head is "do not
  get hit". (2) **N blows for a streak of N** (7 at most): N − 1 **flash cuts** and one **art**
  (`player/flurry.js`). A flash cut is one primitive for every target: blink to one side, cross the
  target, blink away, each along a new line. The lines **hang** on the target and burst together on
  the last blow, so the count is on the screen as a figure, not only as a number. (3) **Six arts**,
  three for a head in the air and three for a foe on the ground, in three shapes (a level draw cut
  whose hit lands late, a falling cleave, a rising cut and vault) plus the plunge, which stays as it
  was and is now one art of the wyrm's three. One is picked at random with the animator's noise,
  never the same twice running. (4) **The world is held, the hero is not:** a hit-stop at 7 %
  re-armed every frame, while the flurry, the animator and the cloth step on real time. The boss
  stands in his blow while the cuts land; a flurry of seven costs two seconds of the player's time
  and a seventh of a second of the fight's. (5) **Fixed damage:** a flash cut 28, final; the last
  blow the plunge's 90 against the wyrm and 60 against a duelist. The answer grows by a light
  attack for every perfect dodge in the streak. (6) **It asks nothing new of a boss** but two
  optional fields on `takeHit` it already had (`exact`) or ignores (`flash`).
- **Rejected:** *A timer on the streak* (a combo meter that drains): the wyrm's transitions and
  flights leave ten seconds without a blow to dodge, and a streak lost to a cutscene is not the
  player's failure (`keepStreak` is there, at 0). *Ending the streak on a plain dodge or a block:*
  it would punish the safe answer to a blow that cannot be perfect-dodged. *N plunges in a row:* the
  plunge is 1.7 s of its own and its reaction cancels the wyrm's attack once; repeated it is neither
  fast nor readable. *The slow-mo's own time scale for the hold* (`flow.cinematic`): it slows the
  particles with the world, and the cuts' sparks must fly. *Blade trails off the sword's sweep
  during a pass:* carried a metre a frame, the frame-to-frame arc is a wide curl unrelated to the
  cut; the cut's crescent is drawn on purpose instead. *Damage that multiplies with the streak:* a
  player who is never hit would end the fight in a few dodges.
- **Consequences:** against a duelist a perfect dodge now deals damage by itself (60, past his
  guard) where it only offered his back: his fight is a little shorter for a player who dodges
  well; not re-tuned. The first perfect dodge of a streak against the wyrm is the plunge one time
  in three. A streak never runs out, so a player who is not hit answers every perfect dodge with
  seven blows (258 of the wyrm's 4500 HP). Round the wyrm's head the cuts are drawn 3.5 m toward
  the camera (glyph particles are depth-tested, and a line through the head showed only where it
  left it). The hero's body does pass through the target in a pass: it is a blink, and nothing
  collides until the flurry ends. `player:perfectDodge` + `player:ghostep` still fire once per
  perfect dodge, and the wyrm's last blow still emits `player:plunge` / `player:plungeHit`, so the
  stats, the call-outs and the sounds that listened to them did not change.

## ADR-092 — The wyrm in large, readable letters; a grid that travels with it (2026-11-14)

**Context.** The owner: "im not feeling the ascii art style to the fullest". A look at the three
levels at the game camera showed why: most of what is on screen is drawn in marks too small to read
as characters (the wyrm's 3x5 px digits, the fighters' 3x3 dot marks) or too overlapped (the grass).
Three wider options were rendered (a typed lattice ground, the hero in the wyrm's letters, a terminal
finish) and the owner scrapped all of them: "make the dragon, bosses, look more ascii like" and add
bigger background objects full of ASCII. The wyrm was then rendered at three larger letter sizes
(6x10 symbols, 8x13 symbols, 10x16 pixel digits); the owner picked the 8x13 one.

**Decision.**
- The wyrm's letters are the game's bold monospace in cells 1/55 of the screen height (8x13 px at
  720p; `wyrmArtCell(H)`), three sets by brightness of symbols and blocky capitals (`WYRM_SETS`).
  The thin 4x6 / 3x5 pixel fonts are removed.
- A wyrm cell averages a 4x4 grid of its source (16 more taps, only in cells on the wyrm) and a
  letter takes 30 % of its tone from its own pixels (was 85 %).
- The grid is anchored to the boss's root on screen (`U.uBossScreen` → `uWyrmAnchor`).
- Tone back to the picked preview's: bright and dense (`uArtLum.y` 4.5, `uArtMin.y` 0.1, gamma 0.8,
  set steps 0.1 / 0.34). The art source (WYRM_ART) is unchanged.

**Why.** At 4x6 px a letter cannot be read at the game camera, so the wyrm was a texture; at 8x13 it
is about 25 readable characters across, which is what "ASCII art" means to a viewer. Point-sampling a
13 px cell over scales a few px wide gave every cell a random tier. A screen-fixed grid of big
letters re-letters the whole body whenever the camera moves: measured in the wyrm's own frame, 63 %
of its lit pixels change per 0.1 m of camera travel against 13 % anchored.

**Rejected.** A darker, steeper tone (truer to the charcoal reference, but the body turned into sparse
punctuation on black: less ASCII than what was picked). Larger scales in the source (x1.8, x2.6: no
visible gain at this letter size). Black cells at depth steps (they cut holes in the body). The
6x10 and 10x16 sizes (the owner's call).

**Consequences.** The fine scale outlines of the 2026-11-08 reference match are gone from the game
camera: a scale is about two letters, its rim a brighter letter. The reference-view targets in
STYLE.md were measured for the thin digits and are not re-measured. The human bosses and the hero
still use the 4 px dot matrix (a sheet of three sizes was rendered; at their ~70 px height only 5x8
letters hold a figure; no pick yet). Not checked: 1080p and above (the hidden pane timed out), the
frame rate on a phone (16 more texture reads per wyrm pixel), the flight and the dives in motion.

## ADR-093 — The wyrm in fine digits again, one size up; the calm tone back (2026-11-15)

**Context.** ADR-092 printed the wyrm in large bold symbols (8x13 px cells at 720p, bright tone).
Live, the owner: "the dragon is way too flashy right now and the ascii text is too big. use more
smaller and make the ascii graphics detailed instead of huge flashy like this". Three smaller
options were rendered in game with the calm tone of the old thin digits (4x6, 5x8 and 6x9 px cells
at 720p); the owner picked 5x8 ("B, medium").

**Decision.**
- The wyrm's letters are pixel fonts again (`WYRM_FONTS`: the 3x5 and 4x6 fonts of ADR-018 and a new
  5x7 one), in cells about 1/90 of the screen height (`wyrmArtFont(H)`: the font and integer scale
  whose cell height is nearest H / 90): 5x8 px at 720p, 6x9 at 1080p, 4x6 on a 393 px phone. The
  letter sets are the old digit sets (`17iv!;r27` / `2345968017` / `96805A@3`).
- The tone is the old calm one: `uWyrmTone` 0.95 / 1.3 / 0.022 / 0.85, `uWyrmGlyph` steps 0.12 /
  0.42, `uArtLum.y` 2.2, `uArtMin.y` 0.012.
- Kept from ADR-092: the grid anchored to the boss, and the 4x4 average of a cell's source for its
  letter tier.

**Why.** The owner judges the wyrm at the game camera, where detail (scales, joints, wing bones)
matters more than reading single characters; a bright body of big symbols hides the scales and
glows. 5x8 is one step up from the pre-ADR-092 4x6 cells at 720p, so the digits are a little more
legible than before without losing the scale pattern. Pixel fonts keep every letter crisp at these
sizes (a browser font closes up into blots under ~10 px).

**Rejected.** 4x6 cells (the old size: the most detail, unreadable letters), 6x9 cells at 720p
(scales start to break into letters), the large symbols (the owner's reversal).

**Consequences.** The 1080p cell (6x9, H / 120) is relatively finer than 720p's (H / 90): no pixel
font gives an exact 7.5x12. ADR-092's large-letter atlas and its glyph check are gone; the check now
verifies every set letter has a bitmap in each font and the cell per screen height. The human bosses
and the hero are unchanged (their letter size is still the owner's open pick).

## ADR-094 — One streak for every perfect defence; the riposte; a foe's streak and his flurry (2026-11-15)
- **Context:** the flurry (ADR-091) answered perfect dodges only, its cuts landed while the world
  stood still (the target never looked hit), and only the hero had it. The owner: "add some weight,
  hitstun impact to the teleport attacks and make it ... way more epic ... add this streak system to
  parries clash deflects as well. Also give the streak system and attacks to bosses as well ... if
  the boss is on a high streak, the player needs to parry / block the total # of attacks". Asked,
  the owner chose: one shared streak; a counter flurry on a string's last parried blow; duelists
  build theirs by guarding; answering every blow breaks his posture.
- **Decision:** (1) **One streak.** A parry or deflect (not of a bullet), a trade clash and a mikiri
  count in the same streak as a perfect dodge. (2) **The riposte.** A parried LAST blow (of the body
  or the blade, the target near) is answered with as many flash cuts as the streak counts and puts
  the hero back where he parried: no art, no crit window, no plunge. It waits for the parry's own
  freeze, so the clash is seen first, and a blade lock takes precedence. Parries inside a string
  only count: a string is still parried blow for blow. (3) **Weight.** The flurry SETS the world's
  time scale instead of merging a hit-stop: after every cut the world runs at 60 % for a beat, so
  the target reels where it was only held; the hero freezes on each contact; the camera kicks harder
  with every cut; the last blow gets an impact frame (speed lines, a dark blink, a flash, screen
  cuts in the HUD), breaks the ground and staggers a duelist. (4) **A foe's streak** is the mirror:
  a duelist counts the strikes his guard turns, loses the count when one lands, and from three may
  answer out of his guard with a flurry of that many blows, each of the later ones from another
  side of the hero. A guard meets them from any side (`hit.around`), so it tests rhythm, not
  facing. Every blow answered breaks his posture; a missed one breaks nothing and stays in his
  streak. It is a move like his others (data, a tell and a glint for every blow, the realiser
  given a count), not a second engine.
- **Rejected:** *An art on every parried last blow:* a parry would then deal the plunge's 90 and
  cancel the wyrm's recoil, and the dodge would have nothing of its own. *A riposte on every parry:*
  it would cut a string off at its first blow. *Blows of his flurry that must be faced:* the hero
  turns to the mouse or a stick, and a blow from behind every half second would be a test of the
  camera. *The wyrm with a streak:* it has no guard to build one on (the owner's choice: duelists).
  *A perfect dodge of his flurry counting as an answer:* the owner asked for parries and blocks; a
  dodge still avoids the blow.
- **Consequences:** a string parried in full now gives its length to the streak, so the cap of seven
  is reached in two exchanges; a riposte of seven is 196 damage on top of the punish window. Wyrm
  strings now say which blow is their last (`last`), so the hero's parry of an earlier one takes the
  shorter freeze a duelist's always had. A player who only ever strikes a duelist's guard is
  answered with his flurry about every third strike. Nothing was re-tuned. `player.debug.noRiposte`
  switches the riposte off (tests that measure a parry's own numbers).

## ADR-095 — A guard meter that is not stamina (2026-11-14)

**Context.** The owner: "add a guard meter and any parry will restore guard meter. I don't want this
game to be annoying when the guard meter is empty so let it replenish quickly when not taking damage
or attacking as I don't want to punish the player for playing defensive." Until now a held guard
cost HP: a blocked blow let 20 % (normal) or 50 % (blue) of its damage through, and nothing else
limited how long a guard could be held. Asked four questions, the owner picked: at empty the guard
is knocked open (not a leak of damage, not the full guard break); no HP chip while there is guard
left; attacking does not pause the refill; and hits that land restore guard as parries do.

**Decision.** `GUARD` in `combat/rules.js`, `player.guard / maxGuard` (100).
- A blocked blow costs guard (damage × 1, blue × 1.5, clamped 8 – 60) and no HP.
- The blow that empties the meter is blocked, then knocks the guard open: `player:guardOpen`, the
  state `stagger` for 0.55 s in the guard break's opening pose (the same clip, without its
  knockdown), no damage.
- Refill 60 / s from 0.8 s after the last blow blocked or taken (0.35 s after an opening), in every
  state. A parry gives 28 / 45 (bullet 10, perfect + 20), a landed cut 4 / 10.
- Contact streams and bullets (hits with no knockback) keep the old HP chip and do not touch it.
- HUD: a thin steel bar under the HP bar with no number; on touch also a gauge on the BLOCK tile.

**Why.** The meter has to make a held guard a decision without bringing stamina back (COMBAT rule
1): so nothing the hero does spends it, only blows do, and the refill never waits on his own
actions. Empty costs half a second, not HP and not a knockdown, which is the least a break can cost
and still matter inside a string (the next cut, 0.4 s on, lands). Moving the cost of a block from
HP to the meter is what makes the meter worth reading: with both, a block would be taxed twice.
Parries and hits giving guard back reward the two things the game wants more of than turtling.
Streams are left out because seven ticks a second would either empty the meter in a breath or need
a second set of numbers.

**Consequences.** A blocked blow no longer hurts at all, so a careful player takes less damage than
before; the bosses were not re-tuned. `player:block` reports damage 0 for a blow (the chip is still
reported for streams). The duelists' AI does not know the meter exists (it does not press harder on
a low guard). The guard-open stagger reuses the guard break's pose: a pose of its own may read better.

## ADR-096 — The right thumb's pad: three tiles that touch, slide between them, placed by the player; a lock marker that fades (2026-11-14)

**Context.** The owner, playing on an iPhone: "the right side controls are too far bottom in the
right corner so my right hand is uncomfortable since i have to hold it at the corner. Im having a
hard time shuffling between attack dodge and block." ATTACK's middle was 66 px in and 68 px up from
the corner (about 11 mm each way on the phone), and the three buttons stood apart with 20 – 30 px
gaps, so every switch was a lift, a reach and an aimed landing. Also: "make the target lock icon be
subtle and slowly fades away as i hate games that show the lock target icon". Of three ways to
switch (slide between tiles, a flick for the dodge, both) the owner picked the slide.

**Decision.**
- ATTACK, BLOCK and DODGE are three rectangular tiles of one cluster, each sharing an edge with both
  others (ATTACK 98 × 92 bottom right, BLOCK 98 × 62 on top of it, DODGE 70 × 116 down their left
  side), with ATTACK's middle about 97 px in and 98 px up by default.
- The cluster is one pointer surface. A touch on or near it presses the nearest tile; a thumb that
  slides onto another tile releases the first and presses the second (a 10 px stick so a resting
  thumb does not flicker across a border).
- The layout is data (`CONFIG.touch.pad`) and the hit test reads the same numbers the tiles are
  placed with. The player picks one of three positions and three sizes in the pause menu; the
  choice is kept in `localStorage`.
- FLASK rides with the cluster but is its own button a gap away (a slide must never drink). LOCK
  moves to the top right beside pause: on touch the aim is automatic, so it is pressed rarely.
- The lock-on marker is a small dim diamond that shows when the lock is taken and fades out in 3 s.

**Why.** Three tiles that all touch make every switch one short move with no gap to cross and no
third tile in the way (a 2 × 2 grid would put FLASK or ATTACK under a diagonal slide). Nearest-tile
makes a slightly missed landing still count. Where a thumb rests differs by hand and by grip and a
screenshot cannot settle it, so the default is a guess moved well out of the corner and the player
has the last word, on the device. The slide's rules follow from the input layer: a release edge and
a press edge are what a lift and a tap would have sent, so the player code needed no change (a
guard press already cancels a swing, ADR-080).

**Consequences.** Sliding off ATTACK while a charge is held releases the cleave (and the guard or
roll then cancels it). A thumb resting on a border can still cross it by more than 10 px by
accident; `pad.stick` is the knob. The marker gives no lasting sign of the lock in the world; the
player frame's label and the LOCK button do. Not tried on a real phone by anyone but the owner.

## ADR-097 — Played upright too; controls drawn on the game, not over it; a minimap the size of a coin (2026-11-14)

**Context.** The owner, after the pad of ADR-096: "Allow the game to be played in non landscape as
well and adjust the ui to allow that. Make the joystick and right buttons to blend in with the game
so the buttons aren't covering the game screen. The mini map is also covering a lot of the screen
on mobile." Until now a phone held upright got a "rotate your phone" overlay and a pause. The
controls were dark filled panels (46 – 72 % black) and the minimap a framed panel of 114 × 130 px
with a title and coordinates, on a screen 393 px tall.

**Decision.**
- **Upright is a layout, not an error.** The overlay and its pause are gone. The stick's zone is the
  lower left, the pad sits lower right (its three places from `pad.posPortrait`), the frame and the
  boss bar go to the top, the menus take the screen's width.
- **The camera opens instead of cropping.** With a fixed vertical field of view an upright phone
  would see a strip 5 m wide. `fovFor(aspect)` keeps the view as wide as a square window's (the
  vertical field of view goes from 32° to about 64° on a phone), and the upright phone profile
  stands 1.2 × further back and looks 1.5 m south of the hero, so he stands a little above the
  middle with the fight above him and the thumbs below.
- **The controls have no fill.** Transparent tiles with a hairline border and corner brackets,
  glyphs with a dark halo, at 62 % (the stick at 40 %, without its dark disc or its MOVE tag); the
  "tap: parry" sub-label is gone. Under a thumb a control goes to full strength with its ember tint.
- **The minimap on a phone** is a bare 70 px disc at 72 %: no panel, title or coordinates. LOCK and
  pause sit beside it.

**Why.** The arena is a ring with one boss in it: on a phone the minimap answers a question nobody
asks in a fight, so it gets the least screen that still shows which way the boss is. Controls that
are found by where the thumb already rests do not need to be read, only to be findable at a glance
and to confirm a press, which outlines and a lit state do. Opening the field of view was chosen
over pulling the camera back (the hero would be a few glyphs tall) and over letterboxing (wasted
screen): the upright view shows as much width as the landscape one shows height.

**Consequences.** Upright, the view is about 14 m wide against 25 m in landscape: the wyrm does
not fit across it and the keep-in-view pan works harder; nothing was re-tuned for that. Faint
controls can be lost against bright ground (a lit pillar behind the pad); the halo helps, and the
rest opacity is one number in `ui/touchStyle.js`. A desktop window dragged taller than wide also
gets the wider field of view. Not tried on a real phone.

## ADR-098 — An ASCII HUD: meters made of characters, block-letter banners, no panels in play, a minimap that barely exists (2026-11-14)

**Context.** The owner: "Make the minimap much smaller and opaque on mobile. Theres no need for
mini map in general for this game so lets make it small overall on both desktop and mobile ...
Also think of ways to improve the ui design and layout and to also incorporate the ascii art style
as well to fit the ascii theme." The HUD was the MMO overlay of the art reference: a framed player
panel with a name, "Lv 12" and a class line, smooth gradient bars, a serif book font for the boss's
name and the banners. Nothing in it was made of characters except its labels. Asked first: the
minimap tiny and faint ("opaque" meant see-through); the log, the name tags and the key hints
stay, the name plate goes. Three HUD looks were then built and rendered in the game on desktop and
phone (bare glyph lines; the same rows in boxes drawn with + - |; a roguelike status line along
one edge), and three ways to draw the big words (block letters in the logo's letterforms; the same
shapes in # only; spaced monospace capitals). The owner picked the bare lines and the logo-style
blocks.

**Decision.**
- Every meter is text (`ui/glyphBar.js`): fill, the piece just lost, the empty rest, in brackets.
  `ui/bars.js` (the scaled-div bars) is deleted.
- In play nothing has a panel. The player's rows and the boss's are drawn on the game with a dark
  halo. The name plate is removed.
- The banners' words are block letters from one font table (`ui/blockText.js`), the title logo's
  letterforms, fitted to the window's width and stacked on a narrow one. The boss's name, the mini
  banner and the pause title are the game's monospace. The serif font leaves the HUD.
- The minimap is a 72 px disc at 60 % (40 px at 50 % on phones) with no frame, title or
  coordinates, on every device.
- Menus and the desktop log keep their bordered panels.

**Why.** A HUD of smooth bars and a book font sat on top of an ASCII game like a different
program. Characters for the meters cost nothing in legibility (a row of 24 cells reads to about
4 %, and the number is beside it) and make the overlay the same material as the world. Dropping
the panels follows the touch controls of ADR-097: the fight is the picture and the HUD is written
on it. The bare lines were the look that took the least screen on a phone; the frames spent it on
borders and the status line crowded one edge. Block letters come from the logo so the game has
one display face instead of two, and one table serves every banner.

**Consequences.** A meter moves in steps of a cell, not smoothly: the boss's 48 cells are about
2 % each. Text with no panel behind it depends on its halo over bright ground. The block letters
have A – Z and a little punctuation: a banner with a digit or another mark loses that character.
Tablets and the Obsidian Throne were not looked at. The owner picked from stills; the meters were
not seen moving by anyone but me.

## ADR-099 — Training: every situation, one click, played by the game's own input (2026-11-15)
- **Context:** the owner: "Make a lab mode to easily tell every situation with a simple click ... see
  every streak animation and effect between the character and bosses ... every situation i would
  want to test in a list by category like a fighting game lab mode in a cool lab background/stage".
  The Lab could trigger a boss move, but every answer (a parry at the right frame, a perfect dodge,
  a streak of seven) had to be played by hand.
- **Decision:** (1) **Situations are data** (`dev/training.js`): a category, a boss filter, the
  set-up (distances, streaks, art), how it starts, how the hero answers, when it is over, and what
  it must show (`expect`). (2) **The runner plays the hero through the input's virtual keys** (the
  touch controls' path), timing each answer off the boss's own glint (`combat:flash` + the boss's
  flash lead), so what plays is the real game, not a shortcut through the hero's methods. (3) **The
  same catalogue is a test:** the three sims run every situation for their boss and fail on one that
  does not show what it promises. (4) **A lab stage** (`?stage=lab`) puts any level's boss on a
  training room with a measuring grid; it wraps the level (the same boss, the room's set and
  layout), so no boss needs to know about it. Three looks were built (a pale Grid, a dark Holo of
  cyan light, a starry Void without walls); the owner picked **Holo**, and the other two were removed.
- **Rejected:** *Calling the hero's methods directly* (`_parry`, `_startRoll`): faster to write,
  but it skips the input, the buffers and the timing windows, which are what a situation is meant to
  show. *One stage per boss:* the duelists keep to their own rectangles and bounds, and a stage that
  wraps any level keeps them all. *A separate page:* the Lab already owns the debug APIs; Training is
  one more view on them.
- **Consequences:** the BOSS MOVES category grows by itself with every new move. A move of a later
  phase puts a duelist into that phase without its transition; the wyrm takes any move in any phase.
  The Starless Lord seated on the training room's floor (no throne) only shows while the fight has
  not started. On the lab stage the courtyard's pillars and the hall's walls are gone, so a boss that
  relies on them (the Lord's hall bound) still keeps to its own numbers.

## ADR-100 — One art design: background objects in the dragon's look; landmarks (2026-11-15)

**Context.** After the wyrm's fine digits shipped (ADR-093) the owner: "all 3 levels need all the
background objects like the pillars and structures to look completely made of ascii characters.
Right now it looks like a normal object with random ascii pattern stickers put on top of it. There
should be no object or character that has this fake ascii look with empty blank spots". A first
answer (carved glyphs filled to every cell, floors too) was shown and turned down: "Lets not touch
the floor character and bosses ... The prod build is the perfect ascii look im aiming for. Apply
this design to all the background objects as well." Asked, the owner confirmed the small-digit wyrm
as the reference and kept the trees as they are. A whole-frame character grid in the manner of the
owner's gcdAtlas project was then prototyped at their request, previewed and measured; they chose
"dragon look and update any md file to ensure all future background and characters are following
the same art design".

**Decision.**
- **The dragon look is the house style** for every new background object and character. It is
  written as a rule in CLAUDE.md and as the first section of STYLE.md.
- **Prop art:** `FLAG.ART_PROP` (0.57) and `createPropArtMaterial`, a smooth lit source for static
  objects; a prop branch in the art pass prints it with the wyrm's atlas, cell and `artLetters()`,
  its own tone (every cell prints), stroke-glyph outlines on the silhouette and on inner depth
  steps, and a grid counted from the ground.
- **What moved to it:** the three sets' `stones` meshes (standing stones, boulders, pillars,
  lanterns, the stele, walls, the dais, the throne) and the small grid props (bones, the bonfire,
  the fallen bell, braziers).
- **Landmarks** (`world/landmarks.js`), all in prop art: the elder wyrm's skeleton (Cinderwood); two
  stone swordsmen, the sect gate, an incense cauldron (Ashfall); two throne wardens, six great
  swords (the Obsidian Throne). The Cinder Tree is a tree and stays on the screen grid.
- **Untouched by the owner's word:** floors (carved glyphs), the hero, the human bosses; trees.

**Why.** The carved-glyph objects read as stickers for four reasons found by looking: a lit slab
under sparse glyphs, blank or speck-filled dark levels, solid edge bands, and east / west faces that
smeared one lattice column into bars. The wyrm has none of these because the pass draws it: letters
are the only thing on screen, the edge is characters. Reusing its pass gives objects the same letter
size, sets and outline for free, and one place to tune.

**Rejected.** Filling the carved lattice (still a second glyph style beside the wyrm; turned down).
A whole-frame grid like gcdAtlas (feasible; measured about equal to the live game on a desktop GPU;
the fighters shrink to ~9 character rows, and it would replace the wyrm, hero and floors the owner
wanted kept). The wyrm's 16 extra samples per cell for props (a prop's source is smooth: the 4 that
find the cell are enough).

**Consequences.** Upright objects are screen-space letters now, not world-fixed ones: the grid is
anchored to the ground at the camera's focus, so letters hold on an object near the hero and drift
slowly toward the screen edges. `createCarvedGlyphMaterial` is for floors only. Cost, measured in
Chrome on an RTX 4090 in the throne hall (the heaviest view), median ms per frame: 1080p live 10.0 –
10.5, this change 9.1 – 12.5 (equal within noise); 4K live 24.9, this change 32.1 (one noisy run).
The pass reads 4 more samples per screen pixel; a phone was not measured. New colliders stand on the
arena rims. Not checked: the look in motion, a fight played around the landmarks, the phone.

## ADR-101 — The flurry on a man: paced to be followed; an afterimage printed in digits (2026-11-15)
- **Context:** the owner, after watching every flurry in Training: "the animation looks great vs the
  dragon but against the humanoid bosses, the teleportation attacks are a bit hard to follow and
  doesnt seem fluid and buggy. lets also leave a cool after image that fades always in a stunning
  transition effect per teleport and use ascii for the effects where you can as well". Measured
  frame by frame on Shen Hui (five blows, the Passing Cut): the hero crossed him at about a metre a
  frame and froze **on top of him** on every hit; he was in a pose worth reading for three frames a
  cut; the duelist was **shoved 0.32 m in one frame by every cut**, from a new side each time, kept
  his own attack's pose through the first cuts, and after the last blow **staggered back into the
  hero** who had landed behind him (and pushed him 0.36 m); the camera jumped 0.9–1.3 m on every cut
  and 4.6–5.3 m on the last; and the cuts' flares and 5.6 m hanging lines, sized for a head three
  metres across, covered both men. The afterimage was sixteen bone strokes: a few bright sticks.
- **Decision:** (1) **A second pacing for a target on the ground** (`DEFENSE.flurry.ground`; the
  wyrm's is untouched): seen wound up where he appears, in past the foe's side, the strike just
  before he is abeam, slowing into a held finish; a shorter line left on him; smaller effects; a
  gentler camera. (2) **A flurry's blows do not shove a duelist**: each cut flinches him where he
  stands and out of his move; the last staggers him away from where the hero ends (`away`).
  (3) **The afterimage is the hero himself, printed**: points of his own meshes in the pose he was
  last drawn in, one digit to a screen cell, falling apart from the feet up; on every blink some of
  them fly to where he reappears and more rush in onto him. All of it glyph particles (no new
  material, no draw call). Every blink uses it: the Ghostep, the plunge, the flurry, the riposte.
  Three looks were built (digits / echo / shatter); the owner picked **digits**, the figure alone,
  and the other two were removed with the Lab's button.
- **Rejected:** *Slowing the wyrm's flurry too* (the owner: it looks great). *A true copy of the
  hero's meshes as the ghost* (his art, exactly): a second set of bone slots in the rigid batch or
  ~140 draw calls a ghost; the printed figure costs one batch of particles and reads as ASCII, which
  is what was asked. *Keeping the shove but smoothing it:* the cuts are drawn crossing ON him, and a
  target that drifts from under them is the thing that read as a bug.
- **Consequences:** a flurry on a duelist is longer (five blows: 2.2 s, 1.75 s before; seven: about
  2.6 s). A duelist is interrupted by the first cut instead of the last (he was staggered at the end
  either way). An afterimage is up to ~390 particles for ~0.6 s; a seven-blow flurry peaks near
  1700 particles (800 before; the additive batch holds 7000).

## ADR-102 — The riskier the answer, the more it pays: the flurry on red only, the flash counter, a perfect parry that pays (2026-11-15)
- **Context:** the owner asked what would make the combat stand with Sekiro, Phantom Blade Zero and
  Onimusha, then: "yes measure and lets implement your suggestions". The suspicion: a perfect dodge
  worked on every tell, had the parry's window (0.20 s against 0.22 s) and paid the most (the
  flurry: damage, invulnerability, a stagger, the crit window, and the string over), while the
  trade clash, the riskiest answer, earned no opening. Measured with three god-mode bots that
  differ only in how they answer a tell (`strategy`, opt-in, in all three suites): the bot that only
  dodged beat every boss fastest with a third of the inputs (Shen Hui 27 – 32 s against 38 – 45 s for
  parries only; the wyrm 68 s against 149 s). Nobody had to learn a string.
- **Decision:** order the rewards by risk (COMBAT.md "The reward order").
  - The flurry (and the plunge) answer a perfect dodge of a **red** blow only (`DEFENSE.flurry.on`).
    A perfect dodge of a white or heavy blow counts in the streak and gives the slow-mo where the
    hero stands: no teleport, no damage, no crit window (`ghostep.critWindowWhite` 0), the string
    goes on. The streak is built on white blows and cashed on a red one or by the riposte.
  - **The flash counter** (`DEFENSE.counter`, Onimusha's Issen): a trade clash in the instant the
    hero's cut became a cut (≤ 0.03 s into its active frames) is not thrown back: 70 final damage and
    60 posture at once, the attacker reels (`attacker.onCounter`), the crit window opens,
    `player:counter`.
  - **A perfect parry** of a blow of the body or the blade deals × 1.5 posture (`POSTURE.perfect`)
    and readies the counter cut (`DEFENSE.perfectParry`: the next light within 0.9 s winds up twice
    as fast and crits).
  - Found on the way: a blow of a foe's flurry that reached nobody settled nothing, so "block all
    five and he breaks" could silently not happen. It now counts as answered when the hero stood
    within its reach + 1.2 m, and fails the flurry when he left.
- **Alternatives turned down:** a dodge cooldown or shrinking i-frames (the owner: defence must not
  be punished; nothing here stops the player from dodging); a 1.2 s crit window on a white perfect
  dodge (measured: the dodge bot still beat the wyrm fastest, in 63 s, on crits alone).
- **Consequences:** after the change the dodge-only bot is the slowest on both duelists (Shen Hui
  75 – 95 s, the Lord 152 – 161 s) and level with mixed play on the wyrm; mixed and parry-only times
  did not move. A perfect dodge of a white blow against a duelist no longer puts the hero at his
  back. The old rule is one switch away (`flurry.on: 'any'`, `player.debug.flurryAny`). Not done:
  the wyrm's claws are not steel, so the flash counter is a duelist's only; no human has played it
  (the counter's 0.06 s of press timing, the counter cut's feel); the Lab has no button for
  `flurryAny`; the flash counter was not filmed.

## ADR-103 — A frame is simulated in steps of about 1 / 60 s (2026-11-15)
- **Context:** the genre review (the owner: "lets implement your suggestions"; the game is to be
  sold on Steam, so it must play the same on any PC). main.js simulated every rendered frame in ONE
  step of its real length, clamped at 50 ms: a machine at 30 fps took 33 ms steps, in which the
  0.08 s perfect-parry window is sampled two or three times, an attack's 0.12 s active frames three
  or four, and under 20 fps the game ran slow. Every headless test steps at exactly 1 / 60 s, so none
  of that was ever tested.
- **Decision:** `core/timestep.js`: a frame is cut into equal simulation steps none longer than
  20.8 ms (1 / 60 s with a quarter of slack, so a 60 Hz frame a hair late and a 50 Hz display stay
  one step). 30 fps runs two steps of 1 / 60 s, 20 fps three; six steps at most, so the game runs
  slow only under 10 fps. The devices are read once a frame; the input's edges are cleared after the
  first step; the camera, the HUD, the audio and the render run once a frame. `__tick` keeps its
  exact single step (film strips) and gains `asFrame`.
- **Alternatives turned down:** a fixed 120 Hz step with render interpolation (the standard answer,
  and deterministic: but every transform of the hero, the wyrm's rig, the cloth and the particles
  would need an interpolated copy, the tests would run at another step than the game or twice as
  long, and at 60 Hz the simulation would cost twice as much: later, if replays are wanted); stepping
  at 1 / 120 s without interpolation (judder on 144 Hz displays, and not the tests' step).
- **Consequences:** at 50 Hz and above nothing changes (one step, as before). Below it the game
  simulates the steps the tests run, at the cost of simulating twice (30 fps) to six times a frame:
  a machine that is slow because of the SIMULATION (not the picture) gets slower still. Not measured.
  Presses are still read once a frame: at 30 fps a press can be up to 33 ms old when the first step
  sees it (event timestamps could place it in its step: not done). Not deterministic: a step's
  length still follows the display above 50 Hz.


## ADR-106 — The hero prints through what covers him: an ink ghost in the blade's cyan (2026-11-15)
- **Context:** the owner: "i noticed while fighting the dragon the player disappears and cant see
  whats going on if its behind the dragon. think of a good way to still let the player be seen
  somehow for these situations." The camera has a fixed yaw and the wyrm fills a third of the
  screen: north of its body, under a wing, behind it while it rears (Armageddon), under it while it
  flies low, the hero's letters were gone (reproduced at 1280x720 and at a phone's 852x393). The
  scene is drawn once with a depth test, so where the wyrm is in front, nothing of the hero is
  left for the ASCII pass to draw. The owner dislikes lasting overlays, does not want the wyrm or
  the hero restyled, and picks looks from rendered options.
- **Decision:** (1) **The mechanism:** after the world pass the hero is drawn once more, alone,
  into a second target (`seenRT`, only the box round him); a quad erases every pixel of him the
  scene already shows (a depth test against the scene pushed back by a margin: 0.6 m, 1.5 m for
  untagged pixels so grass never counts, never for a pixel in the hero's own alpha window so a
  human boss is never cover); what is left, the hero exactly where he is covered, goes back into
  the scene target over its cover. It is depth based: nothing is asked of the covering object, so
  trees, pillars, landmarks and whatever is thrown or lifted later get it for free. (2) **The
  look:** three were built behind a temporary `?seen=a|b|c` switch and rendered on the same frozen
  frames (five situations at desktop size, four at phone size, a film strip): *A, ink ghost* (his
  own line art in the blade's cyan over a thin dark gap), *B, window* (the letters over him thin
  out, he keeps his colours), *C, rim only* (a cyan outline, the letters untouched). The owner
  picked **A**; the switch and the other two were removed. (3) **A gate:** the pass costs a second
  draw of the hero (18 draw calls), so it runs only while a probe finds something in front of his
  torso: one quad in an occlusion query, answered a frame or two later, held for 20 frames.
- **Rejected:** *A window as the look* (B): it cut a hole into the wyrm's chest glow, which is a
  tell, and its letters dropped in and out as he moved. *A rim only* (C): quiet, but a one-pixel
  line is weak over bright letters. *A mark on the ground or an icon:* it says where he is, not
  what he is doing, and the owner dislikes overlays. *Dithering the wyrm away near the player in
  its material* (what trees and pillars do): it restyles the wyrm, needs every future big thing to
  opt in, and a pixel dither turns to noise on a letter grid. *A stencil or a second depth-greater
  draw of the hero in the scene pass:* his own far side would overwrite his near side; the second
  target resolves his nearest surface first. *Reading the hero's art from two textures in the
  ASCII pass:* it rewrites every tap of the hero's branch; patching the scene target leaves that
  branch as it was. *Running the pass every frame:* +0.44 ms and +20 draw calls a frame on a
  desktop whether he is covered or not, a third more draws on a phone where draw calls are the
  frame. *Gating it by where the boss stands:* not general (props, landmarks, thrown things).
- **Consequences:** a second render target the size of the scene's (half-float + depth; only the
  box round the hero is ever written). One more draw call in the open (the probe), 21 more while
  covered; measured in Edge on an RTX 4090 at 1280x720: nothing measurable in the open, 0.3–0.5 ms
  a frame while covered. The ghost appears a frame or two after cover does (the query's answer)
  and the pass stops 20 frames after it ends. Where the pass runs, the scene target's depth under
  the ghost is the hero's, so particles between him and his cover show over him. Cyan is now the
  hero's colour by rule (STYLE.md). A thing drawn in the FX scene never counts as cover; a cover
  thinner than the margin in front of him (he presses against it) hides him without a ghost. Not
  measured on a phone.
## ADR-107 — The world breaks: breakables in a rigid batch, fire that burns where it lands, cover (2026-11-15)

**Context.** The owner: "i want all the bosses to be able to cause destruction to the background. for
example, the dragon fire that hits the background (trees, grass) get on fire and are a temporarily
hazard until the grass/tree burns away so the player has to dodge those as well ... the humanoid
bosses will chip and damage the structures and leave impact based on the power of the attack. the
players can also do this as well. i want the bosses to also use the terrain as a way for their
defensive or offensive strategy". Asked, they chose: fire **burns where it lands** (it never
spreads); the terrain is **a real tactic** for the hero (cover stops projectiles until it breaks, a
piece felled onto a boss deals real damage); Cinderwood and Ashfall **keep their layouts and get
things to break** brought into the fighting space; **staged PRs by separate sessions** (the hero seen
behind the wyrm: ADR-106; the open Obsidian Throne: ADR-112; the bosses' terrain moves after).

**Decision.**
- **A set lists what can break** (`breakables`) instead of merging it into its static meshes.
  `world/destructibles.js` gives each piece a node of its own and draws them all through two rigid
  batches (the hero's and the wyrm's mechanism, ADR-045): one draw call per material however many
  pieces there are, each free to fall, fly or vanish. The two set materials place vertices with
  `rigidMatrix()`; only twins built with `rigid: true` are batched.
- **One POWER scale** for every blow (1 fells a tree), a structure per material and size, and a
  factor per kind of blow, in `world/breakTuning.js`. Each fighter's numbers live in its own tuning
  (`TUNING.world`, `DUEL_WORLD`; the hero's is its damage / 110).
- **Tall pieces fall; short ones shatter.** A falling piece is the world's own hazard: red, a marked
  strip, a flash 0.3 s before it lands. The hero is never hurt by a piece he felled; a boss under it is.
- **Cover.** A piece 1.1 m or taller stops what is thrown along the ground, and pays for it. For a
  line of the Void the cover answers in the hero's place.
- **Fire** (`world/fire.js`) lives on the scorch map's grid: a cell with grass left catches, burns
  3.2 – 4.6 s as blockable contact ticks, and is ash after. Sweeping fire lights wood only.
- **Marks** (`world/scars.js`): glyphs that stay until the reset, in one batch.
- **Lift and throw** are in the API (`take`, `carry`, `throwTo`, `nearest`); a thrown piece's blow at the
  hero is the thrower's (its own tell), dealt in `onLand`.
- **Everything is reset** with the fight (`world.restore()` beside every scorch reset).
- Cinderwood: the 57 trees within 36.5 m, the stone circle and the edge boulders are breakables, and 7
  dead trees, 4 young pines and 6 boulders stand inside the clearing (81 in all). Ashfall: its pillars,
  lanterns, stele and bell, and the dead trees and boulders within 30 m (72).

**Why.** Per-object meshes would have cost ~160 draw calls a level, twice (the world pass and the
shadow pass); the rigid batch costs 3. A world-side API with one POWER scale lets a new boss or move
hit the world with one call and no knowledge of what stands there. Fire on the scorch grid needs no
new texture and no new shader: the grass and the ground already read that map. The fall of a piece a
boss felled must follow the game's tell rule, so the world emits the tell itself.

**Rejected.** Fire that creeps or spreads freely (offered; the owner chose the readable one). Per-piece
shader state (a burn or damage uniform per object): the batch shares uniforms; the scorch map, a
stump variant and glyph particles do the job. Physics debris as meshes (the look is glyphs). Cover
against melee, breath and blasts (it would make standing behind a stone the answer to everything).
Leaving a felled trunk lying as an obstacle (the hero would clip through it or be blocked by an
invisible wall; it comes apart where it lands). Hooking fire to every `scorch.burnCircle` call (the
hazards' warm-up heats the ground before anything lands).

**Consequences.** Trees and boulders now stand inside the wyrm's clearing: sightlines and paths
changed, and the wyrm fells what it walks through. The minimap re-bakes when the colliders change
(`Colliders.version`). The fights' difficulty with breakables and grass fire is **not measured** (the other
suites' bots run on world mocks; the new `world.mjs` checks the mechanics, not a fight). Cost at the
game camera, the fight on, measured in headless Edge against `main`: Cinderwood 57 → 60 draw calls and
1.025 M → 1.034 M triangles a frame; Ashfall 52 → 54 and 566 k → 574 k. Frame time was not measured
(the run uses virtual time), nor a phone. How a broken piece comes apart was the owner's pick of three
filmed looks: "A: digits", a shower of the characters it is drawn in (bigger lumps and long shards
were turned down; the `?debris=` switch that held them is gone). The Obsidian Throne lists no breakables yet: its
rebuild (ADR-112) does. Sounds for breaking are two new one-shots (`chip`, `crash`); burning reuses
the sizzle and the ember hiss.

## ADR-108 — Every answered blow is logged per move; the death screen names the killing move (2026-11-15)
- **Context:** the genre review (the owner: "Yes, telemetry"). Every difficulty number so far comes
  from bots that answer a cue in one frame, and every boss section of COMBAT.md ends on "no human
  has played him yet". When the owner plays, nothing recorded WHICH move struck or killed them:
  `RunStats` held totals only, and the hero's events did not all carry the attack.
- **Decision:** `player.takeHit` announces every blow it resolves as `combat:answer { attack, tell,
  result, damage, dead, stream, perfect }` (one place, whatever the answer). `game/telemetry.js`
  `MoveLog` keeps a row per boss move, counted in blows, for the attempt, and adds each attempt to
  totals per level in localStorage. The death screen shows the killing move and up to three moves
  that struck the hero ("3 of 4 blows landed") under the hint, as small dim lines; the victory record
  gains "Struck most by". `__telemetry()` in the console prints the level's table. Bosses name
  their moves through `attackLabel(id)`. (ADR-104 / 105 are left to other open work: PR #41 and
  #44 hold 106 and 107.)
- **Alternatives turned down:** deriving it from the existing events (`player:hurt`, `player:block`
  and `player:dodge` carry no attack); a panel with the whole table on the death screen (the owner
  keeps the HUD bare: three lines, and the table stays in the console); sending it anywhere (it is
  the player's own browser storage, nothing leaves the machine).
- **Consequences:** a death teaches which move to learn, and a play session leaves numbers to tune
  from (hit rate and kills per move). A string's blows are counted one by one, so "seen" is blows,
  not casts. The phone has no console: there the recap and the record are all that shows; reading
  the stored table needs a desktop browser on the same origin. Burn deaths read "THE FLAMES".
  Blows dodged by walking out of reach are never "seen" (no hit was resolved).

## ADR-109 — The Starless Lord uses the crater: three moves on its pieces (2026-11-15)

**Context.** The owner, of the level's rebuild (ADR-112) and the destruction system (ADR-107): "the 3rd
sith boss will use the force to pick up rubble or the pillars to throw as examples. think of fun cool
epic different terrain interactions the bosses and players and to showcase the destructibility of the
terrain in cool ascii manner." The crater lists 36 breakables (shards of the star's glass, the rim's
slabs, six stones hanging in the air), all liftable by the Void (`lift: 2`). His blade beats, bolts,
pull and grip already met the world (ADR-107); nothing of his yet TOOK a piece.

**Decision.** Three moves, each one long windup and a cast (`moves.js`, marked `terrain: kind`; the
numbers in `TUNING.terrain`; the pieces' side in `starlessLord/terrain.js`):
- **Void Hurl** (every form; 1.2 s): one piece comes out of its place, crosses to hang beside him and
  is thrown where the hero is going. A stone already in the air first, then the nearest shard, the big
  rim slabs last. The ring where it lands is drawn from the moment it leaves his grip (0.7 – 1.05 s of
  flight), the glint comes `flashLead` before it lands, and the blow there is his: red, 26, knockdown,
  2.3 m. What the landing does to the pieces round it is the world's (`throwTo`).
- **Glass Rain** (forms 3, 4; 1.4 s): up to three pieces at once, thrown 0.55 s apart, the later ones a
  step to either side of the hero's way (20 each). The throws go on after the cast by themselves, as
  the Starless Sky's marks do.
- **Crown Fall** (forms 2 – 4; 0.85 s): only while the hero stands in the strip a tall piece would fall
  on. His hand closes on it and wrenches it down (`topple(piece, dx, dz, 'boss')`): the fall, its red
  tell, its marked strip and its blow are the world's (ADR-107), about 0.85 s for a 3.6 m shard.
- **Chosen only with a piece for it** (`weigh` → 0 otherwise; the hooks `weigh` / `onActStart` are the
  ones the Ash Disciple's terrain moves added to the duelist engine, ADR-111, copied line for line so
  the two merge). Started by hand it takes what there is and cannot start with none: the lab stage and
  the older tests' world mocks have no pieces.
- **Cut short before the throw** (a stagger, a posture break, his death), what he holds drops where it
  hangs and comes apart there: interrupting him costs him the stone.
- **Torn Stone leaves the floor cracked** where each stone was torn out (a scar per stone).
- **A hanging stone is built on the floor** and hung by its body's own offset (`def.hover`; the set's
  ambience keeps it there while the piece is whole, his grip takes the offset off as it takes the
  stone). A piece lands where its pivot meets the ground, so a stone whose geometry was built 4 m up
  would have burst 4 m up.

**Why.** Thrown pieces follow the rule every thrown thing of his follows (it cues itself where it will
land), so the new moves need no new reading from the player: a long windup with a visible cause, a
red ring, a glint. Crown Fall hands the tell to the world on purpose: the falling piece is the tell,
and the destruction system already draws and deals it. Taking stones that are finite makes the crater
change over a fight: the stones in the air go first, then his throws strip the hero's cover.

**Rejected.** A piece thrown straight from where it stood (shorter, but off screen for a piece at the
rim, and the hero has no cause to look at). Bringing the piece over his head (3.6 m up it was off the
top of a phone's screen). A crush of the hero's cover as its own move (the grip already does it,
ADR-107). Pieces that orbit him as a shield (it would stop the hero's blows: a new defensive rule,
not a terrain move). Dealing the throw's blow from a called strike's timer: `onLand` is the moment
the piece is seen to land.

**Consequences.** His AI used the three moves 6 times in 39 moves in a 90 s bot fight in form 3; their
effect on the fight's length and difficulty is **not measured**, and no human has played them. The
crater runs out of stones in the air after six throws and can run low on shards in a long fight (36
pieces, everything stands again on a reset). Training has a TERRAIN category for him (three staged
situations, on a level with pieces only). `tests/integration/lord.mjs` builds the real crater with
its breakables for the TERRAIN and TRAINING scenarios (`build(seed, true)`). The held piece's hang
height and the ring's strength were set from film strips at 1280 x 720 and 852 x 393; the phone itself
was not tried.

## ADR-112 — The Obsidian Throne rebuilt open: Starfall, a crater with no walls (2026-11-15)

**Context.** The Starless Lord's level was a walled hall 28.6 x 37 m (ADR-069): two rows of pillars, a
door in the south wall, wardens and great swords in the side aisles. The owner: "i want you to redo
the sith lord level as the levels in general should not be so confined like the sith lord level. i
realized the walls are also adding a visibility issue so make it more open, cool interesting
objects/structures/terrain etc that will make the gme look stunning in ascii theme and also for the
player bosses to interact with." The camera has a fixed yaw and looks down at 58 degrees, so a wall
or a pillar standing south of the fighters covers them, and the hall's south wall and pillar rows did.
The work is one of the staged pieces of M1.38; the destruction system (ADR-107) was built beside it.

**Decision.**
- **Three open arenas were built far enough to render and shown on one sheet** (the fight at 1280 x
  720, the walk up to the throne, the whole arena, the fight at 852 x 393), behind a temporary
  `?arena=` switch: **A Starfall** (the crater where he fell, the star as his throne), **B the Grave
  of Blades** (a plain of planted swords round a paved duelling ring, under one colossal blade), **C
  the Broken Hall** (the old hall without roof or walls). The owner picked **A Starfall**. The switch
  and the other two are gone; the final build was compared with the picked frames (0.07 – 0.21 % of
  pixels differ: the particles).
- **The crater** (`world/throneHall.js`, layout `THRONE`): a disc of fused plates 15 m in radius laid
  in seven rings round the seal (the origin, unchanged), heaved and broken toward the rim; the dais
  and seat 16 m north of the seal, in front of the cleft of the star itself (`landmarks.js`
  `buildFallenStar`: two faceted halves, a crown of ten glass splinters up to 10 m); twelve clusters
  of the star's glass standing in the floor (1.9 – 4.2 m); six stones hanging in the air; four
  vents burning in the floor (the crater's lights); a rim of slabs and shards thrown up and outward
  from 15.8 m, up to 7 m behind him and under 1.4 m in the south, with gaps all round and the south
  left open; outside, 110 dead trees, those within 24 m of the rim lying flat with their tops away
  from the crater. The bonfire stays due south (z 30), the path runs to the south lip (z 14.8), and
  stepping onto the floor there (z < 14) wakes him.
- **Open is three rules, each tested** (`lord.mjs` LEVEL): no wall (a walk east, west or south from
  the seal leaves the crater), nothing tall on the near side (no breakable south of z 6 is over 3.2
  m), the tall pieces north and on the flanks.
- **Where he may stand is a circle, and the level says so.** The hall's rectangle (`TUNING.hall`) is
  gone: `TUNING.bound` 13.6 m is the duelist engine's circle round the seal, and the dais's line is
  the level's (`CONFIG.world.bossFloor.zN`, read by `StarlessLord.clampTarget`), so the lab stage,
  which has no dais, has no such line.
- **Everything free-standing is a breakable** (ADR-107's contract): 19 shards, 11 rim slabs, 6
  hanging stones, all `lift: 2`. A hanging stone has no collider, gives no cover and only chips: it
  is ammunition for the Void (ADR-109), not cover. The set returns an ember-red `scarInk`
  ([1.4, 0.12, 0.075]: at 0.5 the cracks did not show on the black floor).
- **A flurry's blow comes from a side he can stand on.** A duelist's flurry puts him at another side
  of the hero for each blow (`duelist.flit`). Against a hero at the rim, half of those sides are off
  his floor: he was put there, pushed back, and the blow whiffed (the Training suite caught it: four
  flurry situations never ended). `Duelist.standable(x, z)` (inside his bound, clear of colliders;
  the Lord's adds his floor) now picks the side he turns to or the nearest one he may take.
- **The star is a landmark builder** (STYLE.md's rule for big set pieces), built with `carve()`
  attributes directly; `buildSpike` and `facetCol` are shared from `landmarks.js`.

**Why.** A crater answers both of the owner's complaints at once: nothing encloses it, and what
stands in it is low on the camera's side. It is the place the Lord's story already named (he "fell
out of the night sky"), and its pieces are what a lord who lifts things with his will would throw:
shards, slabs, stones already in the air. A round floor suits the duelist engine, whose bound was
always a circle; the rectangle was a patch for the hall. Rings of plates give the floor seams that
follow the seal instead of a grid.

**Rejected.** B (the owner's pick decided it; thin swords also print mostly as outline strokes, the
least "made of characters" of the three) and C (still the most built, and its pillars stood inside
the fighting space). Keeping the first hall's wardens and great swords in the crater: the picked
render has none, and a pick is matched, not improved; their builders stay in `landmarks.js`.
Animating the hanging stones in this change: the destruction system draws them, and a bob is its
`carry`, which belongs with the moves that take them (ADR-109). Braziers: the vents light the
crater and cannot be knocked over, so nothing here promises a fire the level has no fuel for.

**Consequences.** The level's first hall no longer exists; `createThroneHall` and `throneHall.js`
keep their names (levels, tests and the glyph check know them). Fights move differently: cover is
thin and scattered, there is no corner to be backed into, and the hero can leave the crater (the
Lord cannot). His tuning was not retuned for it and **no human has played it**. Fallen trunks have
two collider circles each within 38 m. Cost against the hall, measured in headless Edge on an RTX
4090 at the fight camera with the AI off: 352 k → 280 k triangles a frame (the hall's unseen grass
out to 75 m was most of the level; the crater's stops at 54 m), 52 → 53 draw calls (the breakables'
batch), 8 → 6 lights, 236 → 185 colliders. Render time, both levels in one page with renders
alternated (other sessions were loading the GPU, so only the ratio means anything): Starfall /
hall 0.85 and 0.89 at 1920 x 1080, 1.03 at 3840 x 2160, 0.92 and 1.01 at 852 x 393 on LOW. So: no
slower, about a tenth cheaper at 1080p, no measurable difference at 4K or at phone size. **A phone
was not measured.** The seal's flare, the intro and the reset are unchanged and tested.
