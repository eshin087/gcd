# ABYSS — Visual Style Bible (Ansenjeo-inspired ASCII)

Reference: @Ansenjeo's "ASCII MMORPG" (X / TikTok, Oct 2026). Studied from his banner and four
gameplay clips. This document describes what we observed and how this codebase reproduces it.

## The house style: the dragon look (read this first)

**The rule (the owner, 2026-11-15):** the Cinder Wyrm as it ships is "the perfect ascii look im
aiming for. Apply this design to all the background objects as well", and every future background
object and character follows it. This section is that design. If something new does not look like
the wyrm next to it, it is wrong, however good it looks alone.

**What the look is** (ADR-093 for the wyrm, ADR-100 for objects):
1. **Small, fine digits.** A pixel font in cells about 1/90 of the screen height (5x8 px at 720p,
   6x9 at 1080p, 4x6 on a phone; `wyrmArtFont`). One letter size for everything in this look.
2. **Brightness draws the shape, not letter density.** The same three letter sets everywhere
   (`WYRM_SETS`); a cell's brightness picks the set and how bright its digit is.
3. **A dark body, light only where it is caught.** Most of a shape is dim; brighter digits sit on
   lit faces, rims and edges. Never an evenly bright shape (the owner: "way too flashy").
4. **The outline is made of characters.** The silhouette prints stroke glyphs (`- / | \`) along
   itself; inner steps (a cap over a shaft, an arm over a robe) print dimmer ones.
5. **No blank cell inside a shape.** A shadowed face prints dim digits, not nothing (the owner:
   "no ... fake ascii look with empty blank spots"). Only the wyrm keeps black gaps between scales.
6. **Its own colour, kept low.** Stone blue-grey, bone pale, bronze, a red column: the digit takes
   the object's hue. Saturated light stays for fire, blades and tells.

**Which path draws what:**

| You are adding | Use | Do not use |
|---|---|---|
| A background object: stone, metal, bone, a wall, a pillar, a statue, a building, a prop | `createPropArtMaterial` on geometry with `carve()` attributes; or `FLAG.ART_PROP` in `paint()` for a prop in a set's `props` mesh | `createCarvedGlyphMaterial`, `FLAG.STONE` |
| A big set piece | a builder in `world/landmarks.js`, pushed through `carved()` into the set's `stones` | a new material |
| A creature, a boss, a character | `createSurfaceGlyphMaterial` with an art source, `FLAG.ART` (the wyrm's pass) | a new pass, a new font |
| An effect | glyph particles (`fx.add` / `fx.alpha`) | meshes |

**What is NOT in this look, on purpose (do not "fix" it):**
- **The hero and the two human bosses** keep their ink-line art on a 4 px dot matrix. The owner:
  "Lets not touch the floor character and bosses" (2026-11-15). A sheet of them in larger letters
  was shown and not taken up.
- **The floors** (flagstones, the courtyard's paving, the crater's plates) keep carved glyphs
  (`createCarvedGlyphMaterial`): the ground must stay calm under the fight.
- **The trees** keep the screen grid's bigger round letters (`FLAG.LEAF`, trunks `FLAG.STONE`): the
  owner chose to keep them ("perfect ASCII feel", v0.1).
- **The grass and the soil** keep their world-anchored strokes.

**Checklist for a new object or character:**
- Low-poly with FLAT facets: each facet is one tone, and the spread of tones is what prints as form.
  A big smooth shape lit evenly prints as one flat field of digits.
- Albedo around 0.1 – 0.2 (linear), with variation; the pass lifts it. A level with its own dark
  night (the Obsidian Throne) raises the material's `gain`, not the albedo.
- Look at it at the game camera, 720p and 852x393, next to the wyrm. The camera looks down at 58
  degrees: upright things are squashed (statues are drawn 1.3x taller than built), and anything on a
  level's north rim is off the top of the frame unless the hero is near.
- Thin parts (a rib, a rail) are narrower than a letter: they print as outline strokes only.
- Render a before / after sheet and let the owner pick before finishing.

**How things break (ADR-107).** Destruction is drawn with the same means, never with new ones:
- A breakable piece is the same geometry through the same two set materials (the screen grid for
  trees, prop art for stone and metal), drawn from a rigid batch so it can fall, fly or vanish.
- Debris, dust, flames, embers, the red strip under a falling piece and the marks a blow leaves are
  **glyph particles** from the world atlas. No debris meshes, no decals, no textures.
- Debris keeps the piece's own dim hue (`BREAK.mats`): a breaking stone must not flash white.
  Saturated light stays for fire and for the red danger strip.
- Fire on grass is flame glyphs over the scorch map's ember glow; burned grass is the scorch map's
  ash. A danger marker is red strokes, never heat (heat means fire).
- At the game camera a debris glyph must be at least ~0.4 m to read as a character (a 0.2 m glyph is
  a dot).
- **A broken piece bursts into the characters it is drawn in** (the owner's pick of three filmed
  looks, 2026-11-15): prop art's digits for stone and metal, a tree's round leaves and strokes for
  wood. Bigger lumps (`# % & @`) and long thrown strokes were shown and turned down.

**Tried and turned down by the owner (do not propose again):** debris as big lumps or as long
shards (2026-11-15: digits were picked); a typed lattice ground and a
"terminal" post-process finish (2026-11-14: "scrap everything"); large bold symbols on the wyrm
(ADR-092: "way too flashy ... too big"); carved glyphs filled to every cell on pillars and floors
(2026-11-15); one character grid over the whole frame in the manner of the owner's gcdAtlas project
(2026-11-15: feasible and no slower on a desktop GPU, but the fighters shrink to ~9 character rows
and lose their poses; the owner chose the dragon look).

## Observed in the reference

**Camera.** Steep top-down *perspective* (≈55–65° pitch), fixed yaw (north up), fairly high.
Characters are tiny (≈3–5 % of screen height) with small white monospace name tags above them.
Large creatures (a wyvern) fill a third of the screen. Strong cast shadows from characters and the
dragon fall up/right.

**Palette.** Night. Near-black navy background (#05070c → #0b1018). Grass is desaturated sage /
teal-green; rocks blue-grey; fire is the only warm light and it *spills* orange over the grass
glyphs around it. White dots (flowers/dew) are sprinkled through the grass.

**Three kinds of glyph rendering** (the creator's own words: "instead of just putting symbols on a
grid, I arrange them to create those patterns… our brains recognize shapes and patterns"):

1. **Arranged stroke glyphs** for organic surfaces. Grass = millions of single glyph strokes
   (`| / \ ' Y V v l i`) standing in the world. Dragon skin = chevrons (`^ < v A`) laid *along the
   body flow* in offset rows so they read as scales, in white / ember-red / orange on a near-black
   skin. Hair/cloth use strokes the same way.
2. **Screen-grid ASCII** for hard props: rocks, standing stones, ruins, tree canopies. A terminal
   character grid where glyph density follows luminance (`. : - = + c o a 0 Q & 8 # B N W M @`),
   coloured by the object's lit colour, on a dark slab of the same hue. Canopies use blobby glyphs
   (`o 0 O 8 @ &`), stone uses letters.
3. **Glyph particles** for FX: fire `* # % @ & ^ ~`, embers `. ' \``, sparks `+ x *`.

**UI (the reference).** Monospace everything; thin bars; translucent dark panels with 1px light
borders; a chat/log panel bottom-left with tabs; minimap top-right with a zone name; FPS readout;
hotbar bottom-centre.

**UI (this game, ADR-098).** The HUD is ASCII too, and in play it has no panels: it is text drawn
straight on the game with a dark halo.
- **Meters are rows of characters** (`ui/glyphBar.js`): `HP [################........] 104 / 160`.
  A meter is three runs: the fill (`#`; the guard `=`, the crit window `>`), the piece just lost
  (a paler run that holds, then drains) and the empty rest (`.`), between `[` and `]`. The boss's
  posture is a run of `=` growing from the middle of a row of `-`. Colour says which meter it is
  (red HP, steel guard, cyan crit, gold posture); the characters say how much.
- **Big words are block letters** (`ui/blockText.js`): YOU DIED, the victory line, area names and
  phase calls are built from the same six-row letterforms as the ABYSS title logo, sized to the
  screen and stacked word by word on a narrow one. Names that are too long for that (the boss's)
  are wide-spaced capitals in the game's monospace. There is no serif font in the HUD.
- **No name plate** (name, level, class): it was decoration. **The minimap** is a small faint disc
  (72 px, 40 px on phones) with no frame: an arena with one boss barely needs it.
- Menus (pause, title, record) and the desktop log keep thin-bordered translucent panels: they are
  read, not glanced at.

## How this codebase does it (v0.3)

History matters here:
- **v0.1:** the owner loved the trees ("perfect ASCII feel"). The 3D-quad grass looked great but
  "not ASCII", and the creatures looked "too solid".
- **v0.2** pushed everything through one screen-space character grid. The verdict was that the
  grass was **too** ASCII: noisy, distracting, and the ground seemed to swim as the camera moved,
  which is dizzying. The hero and wyrm were also blurry.
- **v0.3 (ADR-011)** therefore uses a hybrid. Later in v0.3 the owner disliked the grid stones too
  (flagstones were bright blue-grey slabs of `+=+=` rows that read as text and stood out from the
  calm ground), so stones moved to **carved glyphs**, drawn like the creatures. Trunks, canopies,
  bones and the bonfire stay on the grid (the owner loves the trees).
- **v0.4 (ADR-015, ADR-017)** turned the hero and wyrm into classic ASCII art of a shaded source,
  on their own finer grids; the hero is drawn bigger and leaned toward the camera.
- **Reference match (2026-11-08, ADR-018 … ADR-022):** the owner asked for the two creatures to
  look "as identical and good as" his two reference images. The wyrm became thin digits whose
  brightness draws the dragon; the hero became ink-line art.
- **Epic wyrm fight (2026-11-09, ADR-031):** the hero is broad-shouldered, and his blade is
  depth-tested again (the 2026-11-08 depth pull drew the sword through his back and legs). The wyrm
  flies (glide and dive wing keys, a hover pose), burns white-hot in phase 3 and casts fire spells
  whose FX are glyph particles from the world atlas, like every other effect.
- **Large letters on the wyrm (2026-11-14, ADR-092):** "im not feeling the ascii art style to the
  fullest". Three wider options were rendered and scrapped by the owner (a typed lattice ground, the
  hero in letters, a terminal finish); the ask became "make the dragon, bosses, look more ascii like"
  and bigger set pieces full of ASCII. The wyrm's letters went from 4x6 px digits to 8x13 px symbols.
- **Fine digits again, one size up (2026-11-15, ADR-093):** live, the large letters were "way too
  flashy ... too big. use more smaller and make the ascii graphics detailed". Of three rendered
  sizes the owner picked 5x8 px cells at 720p with the calm charcoal tone of the thin digits.
- **Lean reference match (2026-11-09, ADR-034):** the owner's six-view ASCII turnaround and
  single-figure image. The hero is the lean swordsman of the sheet (a V to a narrow belted waist,
  slim limbs), with spiky pointed hair, a flared collar, a shaped upper back, a spiked lame stack
  on the right shoulder, two back tails split by a vent instead of the skirt, and the sword hung at
  his right side; the look-dev tools got a solid render and a live multi-angle sheet (ADR-035).

| Thing | Technique | Where |
|---|---|---|
| Standing stones, boulders, pillars, walls, lanterns, the throne and dais, statues, bones, braziers, the bonfire, the fallen bell, the crater's slabs, shards and hanging stones | **prop art, the dragon look** (ADR-100): a smooth lit source printed in the wyrm's fine digits, a dark body, stroke-glyph outlines, no blank cells; grid counted from the ground. Rules: "The house style" above and "Background objects" below | `createPropArtMaterial` / `FLAG.ART_PROP` (`render/materials.js`) → `render/pipeline.js` (the prop branch) |
| Landmarks: the elder wyrm's skeleton, two stone swordsmen, the sect gate and its cauldron, the fallen star (the wardens and great swords of the first hall are kept in the file, not placed) | the same prop art, built once per level | `world/landmarks.js` |
| Flagstones, the courtyard's paving, the crater's plates (floors only) | **carved glyphs**: one crisp glyph per world-fixed lattice cell (0.22 × 0.28 m on a plane facing the default camera, rows randomly offset), picked by light on flat facets (lit `% # 8 @ &`, shadow `. : ;`), mid-lit flanks hatched along their contour (`/ \| \`), world-fixed cracks, dim green moss tufts (`, ; " *`), near-black gaps. Flagstones: dimmer, irregular 5–7-sided slabs, half-sunk and tilted, a chipped moonlit chamfer, grass leaning over and growing through the rim | `createCarvedGlyphMaterial` (`render/materials.js`), looks `STONE_LOOK` / `SLAB_LOOK` in `world/forest.js` |
| Trunks, the Cinder Tree | screen-grid `STONE` 1.0: symbol ramp `. : - = + * % # 8 & @ M W` + **outline glyphs** (`\| - / \`) on silhouettes / depth steps of raised props | `createAsciiObjectMaterial` → `render/pipeline.js` |
| Canopies | screen-grid `LEAF` 0.6: blobby ramp `. : o 0 O 8 @` | same |
| Grass | ~260k instanced quads, each ONE glyph stroke (`\| / \ ' Y V v l i`) **anchored in the world** (no shimmer when the camera moves); gentle slow wind, trample pushers, wing gusts, burnt to ash glyphs; dim world-space soil glyphs between | `world/grass.js`, `world/ground.js` |
| Hero, wyrm | **classic ASCII art** of a shaded SOURCE image (v0.4), matched to the owner's two reference images on 2026-11-08: the **wyrm** as fine pixel-font digits (5x8 px cells at 720p since 2026-11-15, ADR-093) whose brightness draws charcoal scales, molten cracks and crimson torn sails; the **hero** as ink-line art, dim dense letters inside bright one-pixel ink lines. Rules and numbers: "Creature ASCII art" below | `createSurfaceGlyphMaterial` (`wyrm` / `heroArt` sources) → `render/pipeline.js` (hero branch, `wyrmCell`), `render/wyrmGlyphs.js`, `createPixelArtAtlas` |
| FX | camera-facing glyph particles, additive HDR (bloom) or alpha, drawn after the grid pass; the fire spells' ground warnings, meteors, lava, flame walls and the plunge's bursts are made of them too ("Fire, hazards and the plunge" below) | `render/particles.js`, `dragon/fx.js`, `player/fx.js` |
| Fire light | pooled point lights (8 visible) lighting every shader | `render/lights.js` |
| Shadows | moon orthographic shadow map, casters on layer 1 (`markCaster`) | `render/pipeline.js` |

The v0.2 creature grid (`CREATURE` 0.04–0.44, `grid: true` on a material) still works but is unused.
The v0.2 grass row in the grid atlas is unused too.

Rules of thumb:
- **The ground must be calm.** It is the largest area on screen. Keep grass darker than the
  characters, wind slow and small, and glyphs fixed in the world. Anything that re-picks glyphs
  per screen cell as the camera moves reads as swimming.
- **Gaps matter.** Dark gaps between glyphs make shapes legible (grid props: slab colour ≈ cell
  colour × 0.1–0.16; creatures: base 0.01–0.15 by material; carved stones: albedo × (light × 0.12
  + 0.006)). Never fill every cell.
- **Contrast drives glyph density.** Lit faces climb to dense glyphs; shadow sides drop to dots.
- **Glyph size beats glyph count.** A surface glyph must stay ≥ ~6 screen px at the default camera
  (~35–50 px/m). Smaller cells blur into a solid grey texture: that was v0.1's "too solid" hero
  (0.06 m cells ≈ 2–3 px). `glyphZoom` (0.72) draws each glyph larger inside its cell.
- **Avoid lowercase words.** Ramps favour symbols and blocky capitals so areas read as texture.
- **No typeset rows.** Never fill a lit area with one or two alternating glyphs (`+=+=` reads as
  text). Mix 4 variants per level, offset rows randomly, nudge glyphs sideways a little, and leave
  some cells empty.
- **Stones carry their glyphs.** The carved lattice is anchored in the world, so stones never
  shimmer when the camera moves or zooms; it faces the default camera, so glyphs stay upright and
  the same size on every facet. Use flat facets: each one is a carved plane with its own light
  level, and on low-poly boulders that is what makes them read as rock, not a ball of text.
- **Silhouette first.** Hero hair spikes, coat flare and wing outlines carry identity at ~50 px.
  At the game camera the hero is a dark figure cut out of the grass by a dark halo, with a dim cool
  rim (since 2026-11-08; the moonlit `outline` only matters for the `uArtSolid` 0 render). Large
  bodies use no outline: on them it reads as plastic shading.
- **Shapes survive the text.** In creature art a bright edge (a scale rim, an ink line) must cut
  through the letters at pixel precision, not be averaged into the cell: the wyrm's strokes take
  their own source pixel's brightness, the hero's ink lines are traced per pixel.
- **Letters hold still.** A creature letter should only change when its cell changes brightness
  tier, never with every small shift of the source (the wyrm's letter sets, the hero's per-cell
  jitter). A per-frame boil of 40–60 % of the cells reads as noise.

### Colour rules (all shader colours are LINEAR; final pass applies ACES + gamma)
- Dark skin/base between glyphs: 0.01–0.03. Glyph ink: 0.3–0.7 (lighting multiplies it).
- HDR emissive fire: 2–5 (blooms). Embers 1.5–3. Moonlit white sparks: 1.5–2.5.
- Keep saturation low except fire. Steel = cold blue-grey `[0.55,0.6,0.68]`. Cloth = deep crimson
  `[0.28,0.05,0.04]`. Dragon ("Obsidian Drake", v0.3; *superseded for what the player sees by the
  art source below*): obsidian gaps `[0.02,0.019,0.024]`, silver
  ink `[0.36,0.375,0.42]` with a few ember alt scales; molten parts (chest, belly, throat, inner
  thighs, tail underside) self-lit orange `[1,0.42,0.09]` (`inkGlow` 0.5); wing membrane deep red
  `[0.5,0.06,0.035]` on `[0.13,0.013,0.01]` with orange vein glyphs; bones / horns / spikes
  white-grey strokes; claws ivory; teeth + maw self-lit.
- **Wyrm art source (2026-11-08, `WYRM_ART` in `dragon/model.js`):** charcoal hide ink
  `[0.34,0.31,0.29]` with bright free scale edges (tone rim 2.0 over a body of 0.11) and an even
  charcoal (`vary` 0.35); molten emit red-orange `[1.0,0.17,0.03]` (ACES turns it to lava); chest and
  throat grey-orange scales with gold / amber rims lit from below, not a lamp; membrane crimson
  `[0.5,0.045,0.03]`, mottled, with orange `[1.0,0.45,0.1]` embers and bone streaks; horns, bones,
  claws neutral to warm grey with bright tips. The moonlight is greyed on the wyrm (`envSat` 0.3) and
  a key light fixed to the camera lights the upper-left faces, so it reads the same from every view.
  Target mix at the reference view: white ≈ 41 %, orange ≈ 22 %, red ≈ 37 % of lit ink.
- **Hero art source (2026-11-08, `HERO_INK` in `player/model.js`):** flat dark fills (coat
  `[0.175,0.165,0.155]`, pants `[0.12,0.12,0.14]`, hair `[0.085,0.08,0.12]` with violet tips), a
  lavender torn zone (`hem` `[0.3,0.28,0.42]`), dark steel armour with white edges and glints, a pale
  face; white ink lines tinted per part (violet-white on hair, lavender on the tails, cyan × 1.7 on
  the blade edges, violet × 2 on the gem). Cyan stays on the blade and its FX, violet on the gem and
  the hair tips.

### Glyph choice rules
- Creatures: pick the `ascii` set per part. It sets the default ramp and cell (`SURFACE_SETS` in
  `materials.js`):
  - `scales`: `. v ^ A` chevrons
  - `strands`: `. : | I` strokes for hair, folds, veins and blades
  - `plates`: `. - = #` bands
  - `smooth`: `. : o 0` for skin and eyes

  Override per part with `glyphs` / `cell`. Make aGUV +y run along the limb toward the tip or head,
  so chevrons point "forward" and strokes follow folds and hair.
- **Panel-style variant tables (`levels`).** The owner's ASCII GAMEPLAY panels put a *different*
  blocky glyph in every cell, with density and brightness following light. Reproduce that with
  `levels`: up to 6 light levels (dark → bright), each a string of up to 8 variants picked per cell
  by hash, e.g. `['', ".'", ':;', 'AV', 'A8BD', '80B@']`. Rules:
  - The darkest level is empty (`''`) or sparse strokes (`' .:,'`, a space = empty cell), so shadow
    sides break up into dots and gaps; 10–25 % empty interior cells carry the form.
  - Mid levels hold the directional glyphs (`A V ^ v`) that follow aGUV; the top levels hold the
    dense blocks (`8 B 0 D @`). Give each level 3–4 variants: one or two glyphs per level reads as
    typeset text again.
  - The level is taken from the light at the cell centre, so glyphs are always whole. The 4-glyph
    `glyphs` ramp still picks per pixel; `levels: ['.', 'v', '^', 'A']` is that ramp with whole
    glyphs.
  - Pair it with `levelInk` for the panels' tonal ramp (grey flanks, near-white lit tops), e.g.
    `[[0.2,0.2,0.22], ..., [0.8,0.8,0.84]]`. Keep inks desaturated; accents stay on `inkAlt`.
- **Where the molten / accent colour sits.** On a single mesh, `glowAxis` (object space) puts the
  `uGlow` seams and `uInkGlow` on the side facing it (`[0,-1,0]`: throat, chest keel, belly) and
  `inkAxis` raises the `inkAlt` chance there (orange glyphs on the lower flanks), instead of
  splitting the part into separate lava meshes.
- **Seams.** `crack: 'voronoi'` draws molten seams as irregular fissures between plates (`crackScale`
  plates of ~2.5 cells), not the glyph grid; use it on hide and lava plates. `seamAxis: 'y'` keeps
  only the seams along aGUV y (radiating wing-membrane veins, no cross-hatching; `rowShift: 0`).
- *Surface-glyph creature cells (the two items below) only show in the `U.uArtSolid` = 0 look-dev
  render since v0.4; in game the wyrm and the hero are ASCII art of their source (last section).*
- Wyrm cells are 0.17–0.27 model units on the body (×1.875 in the world: ~12 px at the default
  camera, ~9 px at the boss framing's pull-back) with `lumScale` 3.0–3.5. Scales are `.vVV`: aGUV
  +y runs toward the head on body / neck and toward the body on tail and limbs (`flip`), so each
  `V` tip points back / down the limb like an overlapping scale (a clean `^` head-on). Bones and
  horns use dashed strokes `.'|!` (`I` read as a letter). Hero cells are 0.10–0.20 m with `glyphZoom` 0.62, light-grey self-lit
  ink and a steep ramp (`lumScale` 4–5) whose darkest glyph is a stroke, not a lone `.`. The hero
  reads as a bright glyph figure, with a violet gem and cyan blade edges as accents (the owner's
  "Shadow Swordsman" sheet).
- Stones (`CARVED_DEFAULTS` in `materials.js`, per-look overrides in `world/forest.js`): 6 light
  levels × 4 variants, `topGlyphs` on up-facing facets (caps, slab tops, fallen faces) and
  `sideGlyphs` elsewhere; levels 2–3 on side facets become contour strokes (`/` left flank, `|`
  vertical side, `\` right flank; flat contours keep the ramp so no dash rows appear). Light maps to
  a level through a soft knee `1 − exp(−light × lumScale)` (stones 4.0, flagstones 2.3) so moonlit
  tops and dim flanks both land on the ramp. Flagstones stay the dimmest stones (`gain` 2.1 vs
  2.9): the ground must stay calm. Moss ink ≈ grass tips; never brighter.
- Colour carries material; glyph carries form. Keep inks desaturated except glow/fire.
- Red dodge-only tells drive `uWarn` on every wyrm material (a red glow on glyphs + rim). Hit flashes
  use `uFlash`.
- New grid ramps go into `glyphs.js` `RAMP_ROWS` + `GRID_ROW`, and the pass must index them.

### Available glyphs (world atlas)
```
 .,'`:;-~_=+*^<>/\|!ilIjtYVvXxyoOcaeszr0Q@#%&8$BNMWwmnuqpdbkh{}()[]?"1234567890ACDEFGHJKLPRSTUZ·•°×
```
`gi(ch)` throws if a glyph is missing — stick to this set.

### Creature ASCII art (v0.4; reference match 2026-11-08)
- **Look:** the owner's references are classic image-to-text art. They are a fixed grid of upright
  characters, coloured per character, with a black backing and the silhouette defined only by where
  characters stop. The creature material renders a SOURCE image (its own art source: `wyrm` /
  `heroArt`), and the ASCII pass prints it. The two references differ, so the two creatures use
  different rules (ADR-018 … ADR-021). Contracts: ARCHITECTURE.md "Creature ASCII art".
- **Glow:** only saturated colours (lava, blade, gem, eyes) keep HDR glow. Bright colourless parts
  (claws, teeth) are capped, or they swell into orbs under bloom.
- *Superseded:* the single density-sorted `ART_CHARS` ramp for both creatures (`createArtAtlas`,
  `artCell`), the hero's edge darkening (`uArtHeroEdge`) and black depth gaps, `uArtBlack.x` 0.04.

**The wyrm (the red-black dragon reference; fine digits, ADR-093).**
- **Letters:** fine pixel-font digits, each glyph one pixel wide with a soft 0.24 halo and a black gap
  round it, in cells about 1/90 of the screen height: a 4x6 font in 5x8 px cells at 720p (the owner's
  pick "B, medium" of three sizes, 2026-11-15), a 5x7 font in 6x9 cells at 1080p, 3x5 in 4x6 on a
  393 px phone, the 4x6 font doubled at 1440p (`wyrmArtFont`). Never a bold browser font.
  *Superseded:* large bold symbols in 8x13 px cells (ADR-092): every character could be read, but
  live it was "way too flashy" and "too big", and the scales were gone; before that, 3x5 digits in
  4x6 cells at 720p.
- **Brightness draws the dragon, not letter density, and the body stays dark.** A cell's brightness
  picks one of three letter sets (`WYRM_SETS`: dim `17iv!;r27`, mid `2345968017`, bright `96805A@3`),
  the cell's own hash picks the letter inside it, so a letter only changes when its cell changes
  tier. The tone is steep and low (gamma 1.3, floor 0.012): most of the body prints dim charcoal
  digits, and bright ones sit only where a scale rim, a horn or a claw catches the key light. That
  contrast is the detail: a bright, even body (ADR-092's tone) hid every scale.
- **A cell averages its source, a letter keeps its own pixels.** The cell's letter tier comes from a
  4x4 average of the source under it (steady as rims cross its samples), and each letter pixel takes
  85 % of its brightness from its own source pixel, so a scale edge cuts through the digits.
- **The grid travels with the wyrm** (ADR-092). Its cells are counted from the wyrm's own screen
  position, so when the camera pans or it walks the letters ride with the body instead of the body
  sliding under a fixed grid (measured with the large letters, in his own frame: 13 % of his lit
  pixels change per 0.1 m of camera travel, 63 % with a screen-fixed grid).
- **Strokes:** thin parts (spikes, horns, claws, wing bones, teeth) and the
  silhouette print stroke glyphs (`/ | \`) along their edge; a horizontal edge keeps its letter
  (long `-` runs read as ruled lines). The hide's scale outlines come from letter brightness only:
  rim strokes on every scale printed a field of `\ / |` chevrons at the game camera.
- **Source:** dark charcoal shingle scales (≈3–4 letters across at the reference view; smaller ones
  print as letter noise) whose free edges catch a camera-fixed key light from the upper left;
  molten cracks along the scale gaps only on down-facing surfaces (chest, throat, belly, inner legs,
  tail underside: the back stays charcoal from the game camera), glowing ~2.5 gap widths wide so
  they light the letters over them; orange-lit chest and throat scales with gold rims; crimson
  mottled sails with torn edges, holes, orange bone streaks and ember specks; spikes dark at the root,
  bright at the tip.
- **Targets at the reference view (1080p; measured for the thin 4x6 digits of 2026-11-08):** the
  reference's body region has mean brightness ≈ 29,
  ≈ 22 % ink pixels and ≈ 9 % bright ones (round 1 measured 30 / 23 / 11); its lit ink is white 41 /
  orange 22 / red 37 % (round 2 measured 43 / 23 / 35).

**The hero (the "Shadow Swordsman" line-art reference).**
- **Ink lines, traced per pixel:** bright one-pixel lines on his silhouette, on the nearer side of
  every depth step and on part edges (the higher part draws), plus piece edges up close; a dimmer
  second pixel up close gives the reference's ~2 px anti-aliased ink. A line breaks at the letter
  spacing, so a contour reads as a chain of stroke glyphs (style 0); the torn tails and the hair are
  dotted (style 1); the blade and gem are unbroken (style 2). Never one stroke glyph per cell: it
  stair-steps every curve ("boxy, robotic").
- **Fill:** dim, dense letters (3x5 pixel font in 4x6 px cells) from a flat per-part source: a fill
  colour, a key light from the camera's upper left, a share of the scene light, white glints only
  where metal curves, a cool blue-lavender rim on the screen's left, fold streaks on the coat up
  close. A cell an edge runs through prints a dim letter up close, so the line sits in a dark
  channel; the face (`open`) keeps its letters.
- **Close-up targets (reference view):** the reference figure's mean luma is 108, with 38 % of its
  pixels above 120 and 29 % below 50 (round 2 measured 106 / 37 % / 28 %).
- **Game camera (36 m, 6–20 m LOD band): a dark figure, not a wireframe.** The reference scaled to
  his ~150 px is dark (mean luma 56, 56 % below 50) with silver armour, pale lavender tails, a pale
  face and the cyan blade. Far away piece edges drop out, cloth inner lines turn into dark seams
  (`farLine` 0), armour keeps bright edges, the fill takes a per-part gain (`farFill`: cloth 0.35,
  armour ~1.1–1.2, blade 2), the silhouette is a dim cool rim, and the blade's glow is capped to a
  tight line. A dark halo (two rings round his screen position, fading in from 8 to 20 m) darkens
  the world grid next to him, so he cuts out of the grass. The outline is one letter thick: a
  two-cell band turned the ~12-letter-wide figure into a wireframe.
- **Blade:** drawn 1.12 m with the pommel (ADR-073; 1.25 m since ADR-038, and the 1.64 m portrait
  blade was "way too long and dark" and ran through the coat), the single-figure image's sword since ADR-034: broad at the
  guard, one long taper to a sharp point, a ridge line between the edges, hooked barbs at the base,
  lightning notches up the lower half, a guard swept up toward the blade round a violet four-point
  star gem. It is **moonlit**: a lit blue core (`BLADE_BASE` `[0.05,0.1,0.2]`, inks `[0.3,0.52,0.9]`
  → `[0.52,0.82,1.2]`), white-blue edges and ridge (inks to `[1.1,1.22,1.45]`, emissive
  `[1.1,1.6,2.6]`), no dark steel left; glow 1.45 at rest. At the game camera it is a
  crisp blue-white line with a tight glow (half the far self-light, HDR cap 1.3): the old halo spread over
  his body and the grass. It is depth-tested like the rest of him (2026-11-09, ADR-031): from behind only the
  steel beside his silhouette shows (the low idle guard shows just its point), it no longer shows
  through his back or legs, and the coat hangs inside or drapes over it instead of passing through
  (a few run frames still cross a panel). *Superseded:* the 2026-11-08 depth pull that drew it up to
  0.65 m nearer the camera (ADR-022) put the sword through his back from behind.
  - **It flares where the game camera can see it** (`TUNE.bladeFlare`, player.js): at 36 m the blade
    is one 4 px cell, mostly silhouette line, and the art pass compresses luma (v = 1 - e^(-k luma),
    far HDR capped at 1.3), so its uInkGlow flare never showed there. Part 17's pass gains are the
    lever (the fill gain is linear past the cap; the ink AND rim lines flare at half the fill's
    rate): x1.12 through a light strike's window, x1.2 a heavy's, +0.5 on a landed cut (+0.75 heavy
    or crit), held through the freeze and cooling in 0.12 s; exactly the `HERO_INK` base at rest.
    The strike's ink and glow are relative to rest (a flat 1.6 / 1.25 left a light strike no
    brighter than the idle blade at 36 m, its seams dimmer).
  - **The edge glint** (`EDGE_GLINT`, fx.js): from 0.03 s before the active frames a 9 px cold `+`
    runs up the LEADING edge (the ridge for the stab's point-first drive) from the forte to the point,
    easing in, two or three `|` strokes behind it; on a whiff it reaches the point as the arc's glint
    pops. A landed cut stops it and marks the steel itself: four white `|` strokes along the leading
    edge from the contact to the point (`edgeFlash`; no star: the cut's core is the beat's one). It
    lives the frames the freeze holds and is gone as the blade swings on (with no velocity, a longer
    life left a bright bar for two frames where the blade had been).
  - **The arc's tone** (`ARC_TONE`): the lights' arc cools from white-hot to indigo; the slam, the
    cleave, the thrusts and the plunge's dive cool to the gem's violet. For 0.06 s after a cut lands
    the arc's edge bites: white-hot, opaque, 15 % thicker.
- **Build (athletic, ADR-040):** the owner found the lean match "a bit too lanky". On the same
  skeleton (`BODY` in `player/model.js`): chest 0.39 m over a 0.27 m waist, shoulder joints ±0.178
  (≈ 0.52 m across the deltoids), upper arms r 0.066, thighs r 0.086, boots r 0.064, a head drawn
  1.08× (≈ 7.3 heads tall), bigger hands; the collar, pauldron, lapels and cape roots follow the
  body. Still a V to a belted waist. *Superseded:* the lean reference match (ADR-034: chest 0.34 m
  over 0.23 m, shoulders ≈ 0.24 H, 7.8 heads) and round 3's broad build (a 0.50 m chest) with its
  closed A-line skirt, a cloaked trapezoid with no legs from behind.
- **Idle silhouette (ADR-040, ADR-041):** the sword hangs low at his right side, ~52° below level
  with the edge down, so the steel shows past his body and cape from the front, the side and from
  behind, and the guard reads as a cross from the front like the reference's.
- **Hands (ADR-041):** a gauntlet fist closed round the grip (finger rolls with ink lines between
  them, a bright knuckle ridge) and a loosely closed left glove with skin fingertips. The sword hand
  used to be one small ellipsoid hidden behind the guard.
- **The free hand: sword fingers (jian jue).** The hero's free hand turns on its own wrist and holds
  sword fingers (index and middle straight and pressed together, 1.15× long so the point survives
  the glyph pass (1.3× read up close as two claws); ring and little curled, the thumb across them)
  at rest and through the chain; it opens on the run, to take the grip, to brace on the grass, to
  drink, and when he is hit or falls. At the 36 m
  game camera the hand is ~2 cells: it reads by WHERE it goes (one arm line through the body against
  the blade), the pale one-cell point off the end of that line and the way the point aims; the finger
  shape itself reads up close. A pale hand needs dark cloth round it: keep drapes off the left wrist.
- **Profile (ADR-041):** the cloak's width belongs to the front and back views (the reference's wide
  A). From the side he is slim: the outer cape sheets turn to his right (`CAPE_SHEETS.ry`), the ones
  down his back hang close (`out` 0.24 / 0.2), the front coat panels hang nearly straight (`flare`
  0.13) and the back tails flare less (0.3). Before, the cape's hem trailed 0.75 m behind his heels
  and the skirt was a bell.
- **The silhouette from behind** (the usual fight view): spiky hair of pointed locks hanging toward
  the nape, a flared stand collar, the yoke seams dipping to a four-point star between the shoulder
  blades, the baldric from the right shoulder to the left hip, two belts, then two tails split by a
  vent from just under the belts, each flaring out to a ragged hem that runs down to its outer point
  (the legs show in the vent), banded calves, and the sword beside him on the right.
- **Coat panels:** taper and flare per panel, never a closed bell: a panel's vent / front edge hangs
  straight (`skew`), its hem slopes to the outer point (`slant`), piping lines the vent and the open
  front. The lavender torn zone is the lower 60 % of each panel plus its claw points, and at the
  game camera it reads lighter than the black coat (far fill 0.8).
- **Scale:** at the 36 m game camera ~25 rows of 4x6 px letters (~15 on a phone at LOW); drawn 1.2×
  and leaned toward the camera (ADR-017). Close-ups (Lab model viewer) show the full reference look.

### Background objects in the dragon's look (2026-11-15, ADR-100)
The owner: "all 3 levels need all the background objects like the pillars and structures to look
completely made of ascii characters. Right now it looks like a normal object with random ascii
pattern stickers put on top of it." What made the carved-glyph objects read as stickers: a lit slab
of the object's own colour under sparse glyphs; ramps whose dark levels were spaces, dots and commas
(blank spots with specks); a solid bright band on every chamfer; and, the worst, wall and pillar
faces turned east or west, which held ONE lattice column across their width and printed a slice of
each glyph smeared into solid bars.
- **Now** every upright object is a smooth lit SOURCE (`createPropArtMaterial`: facet light, a
  camera-fixed key light from the upper left like the wyrm's, an edge band, scorch) and the art pass
  prints it in the wyrm's letters with the props' own tone: every cell a digit (cutoff 0, dimmest
  letter 0.085), a steeper curve than the wyrm's (`uPropLum.y` 9: a stone's source is dimmer than a
  scale rim).
- **Outlines in characters:** a cell on the silhouette prints a stroke glyph along the edge, 1.9x
  the body's brightness; a cell across a depth step inside the object (1.2 % of its distance)
  prints one at 1.35x.
- **The grid is counted from the ground:** the screen position a fixed world point would have at
  the camera's focus. Letters stay on an object while the camera follows the hero: exact at the
  focus depth, a slow drift nearer and farther.
- **Colour:** the object's own hue (blue-grey stone, vermilion columns, bronze, bone). The Obsidian
  Throne's material uses `gain` 1.5 for its dark night.
- **Not checked in motion** when this was built: the drift toward the screen edges, and the
  fade-near-player dither on a letter grid.

### The hero seen through what covers him (2026-11-15, ADR-106)
The owner: "while fighting the dragon the player disappears and cant see whats going on if its
behind the dragon". The wyrm fills a third of the screen and the camera never turns, so a hero
north of its body, under a wing, behind it while it rears or under it while it flies was simply
gone.
- **Now** the parts of him that something covers print through it as an **ink ghost**: his own
  line art (the same silhouette, inner lines and fill letters, in his own cells) in the blade's
  cyan, with a thin dark gap round it over the wyrm's letters. The parts of him in the open keep
  their look; a hero half under a wing is half ghost.
- **Only while covered.** Nothing lasts on screen: the ghost is exactly the covered pixels of
  that frame, and in the open the frame is identical to the one without the pass.
- **Cyan is his.** Neither the wyrm's fire nor a tell uses it (red glow: dodge; white glint:
  parry), and the ghost darkens only his own figure and a 4 px gap, so a glowing chest behind
  him still reads. Do not give an enemy, an effect or a tell this cyan.
- **It acts on anything** that hides him and is drawn into the scene with depth: trees, pillars,
  standing stones, landmarks, whatever is thrown or lifted later. Not on grass at his feet, and
  not on a human boss (the duels are fought at arm's length and the boss's tells stay his own).
- **Turned down** (built and shown beside it): a *window* (the letters over him thin out and he
  keeps his own colours: it cut a dark hole into the wyrm's glow, and its letters flickered as
  he moved) and a *rim only* (a cyan outline over the untouched letters: thin over bright ones).

### Fire, hazards and the plunge (2026-11-09)
Every effect below is glyph particles (`fx.add`, additive HDR, for fire and light; `fx.alpha` for
smoke and dust) using world-atlas glyphs only (`gi()` throws on others; `npm test`'s glyph check).
Fire stays the only saturated warm light: white-yellow HDR cores `[4.6,3.5,1.5]` cooling through
orange `[3.4,1.4,0.28]` to a dying red `[0.8,0.08,0.012]`; lava `[3.3,1.9,0.55]` → `[2.5,0.8,0.13]`;
smoke `[0.045,0.04,0.036]` in alpha. Code: `dragon/fx.js` (the "fire hazards, spells and flight"
section), `player/fx.js` (the plunge).
- **Ground warnings: the ground heats up** (2026-11-11, ADR-052; `heatDisc`, `heatBand`, `heatFlare`
  in `dragon/fx.js`; replaced the red `•` / `!` rings, the closing inner ring and the `>` chevrons).
  Every footprint (a meteor, a pillar, a shell, the nova, a slam / pounce / sky-dive zone, the
  burning pass's strip, the flame ring's band, the flame wall's line, the Scouring breath's tongues)
  is the same language:
  - **Fill, not outline:** a sparse fill of small ground-hugging glyphs `. , : '` (one glyph per
    point: a multi-char string would re-roll every frame), on a sunflower spiral (discs) or fixed
    steps (bands), hashed per warning: nothing rotates or marches; a slow flicker.
  - **Colour is heat:** dark ember `[0.35,0.08,0.02]` at spawn → orange `[1.7,0.55,0.09]` by k 0.6
    → white-orange `[3.1,1.75,0.6]` at impact; alpha 0.22 → 0.7, density 35 % → 100 %; sparks
    `. ' `` rising from k 0.6. Never `TELL_STYLE.red`.
  - **The world glows too:** the scorch map's heat channel is stamped under it every 0.12 s (heat
    0.2 → 0.65, no char), so the soil and grass glyphs themselves glow orange; it cools over ~1.5 s
    when the warning is gone.
  - **The edge comes late:** only in the last `flashLead` s a thin bright rim of `·`
    `[3.8,2.5,1.0]` sits on the true radius / band edge; on the flash the heat flares (hot sparks
    off the edge, a warm light). A lava pillar keeps a molten tint and shows a few `^` when hot.
  - The live fire's leading edges (flame ring, wall) and the roar's `)` shock ring are fire orange,
    not tell red.
- **Meteors:** a white-hot `@` core in a `*` halo with `|` strokes laid along its screen motion, a
  fire trail, smoke and its own light over a 0.75 s visible fall; the impact is a white flash, a
  fire burst, flung rocks (`. , : ; o`), a ring of `)` shock strokes, dust, scorch and a smouldering
  crater.
- **Armageddon** (2026-11-11, ADR-053): the rear-up glows red on the body and streams embers up off
  the jaws; the salvo is white-hot `@` bolts with long orange `|` trails shot straight up out of the
  mouth until they leave the view (`fx.launchBolt`); then the sky answers: the shared ambient and fog
  colours warm a little (`world.atmosphere.skyGlow`), kept subtle because at the phone camera the
  fog fills most of the frame. Its meteors are drawn 1.3× (the great one 2.4×) and fall on a slant
  from the sky above the wyrm; only every other one carries a light. P3 craters burn hard (twice the
  flames) while they hurt. The great meteor's impact adds a second slow shock ring, a column of fire
  and a 26 m white light.
- **Lava pillars:** before the eruption the ground cracks glow and spit sparks (`~ ^ ,`), faster as
  it nears; then a column of molten `# % @ & ! |`, droplets (`. o •`) and a `~` splash ring.
- **Flames** on strips, rings and walls: tall `^ * # % &` and low `^ ~ *` fire behind a red leading
  edge; the fresh front burns tallest, and the ground scorches as it passes.
- **Casts and flight:** (the old meteor cast spat one fireball straight up: Armageddon's salvo above); fire swirls in round the wyrm
  before a flame ring; the nova's 2.5 s charge sucks embers onto the chest with contracting `)`
  rings and glowing cracks round its feet, then shock rings race out with a white flash and a fire
  storm; the sky strafe streams fire from the mouth onto the ground ahead; low wingbeats blast dust
  rings and flatten the grass; the dive's crash throws `)` shock strokes, fire, rocks and dust.
- **Phase 3** burns white-hot: crack glow 0.8 and 50 body embers / s (phase 2: 0.5 and 22), a
  white-hot boss bar.
- **The plunge** speaks the hero's cold language: a blue-white afterimage of his pose at the dodge
  spot and a cold streak up to the hang point; cold motes drawn in at the apex; on impact a
  white-cyan flash, cold crystal shards fanned out, molten blood thrown up from the wound and a shock
  ring round the skull (an execution: bigger, gold-white); embers spurting round the buried blade
  while he rides; a gout of embers as he rips it out; a dust ring and a low cold ring where he lands.
  Its glyphs: `* ° | - ~ ^ ' · + x × A V . , : =`.
- **The flurry** (`player/flurryFx.js`, ADR-091) is drawn in fine lines of cold light, like the
  sword arc. A **flash cut** leaves the hero's afterimage where he vanished (they pile up round the
  target: he is everywhere at once), a thin upright flash where he arrives, a wake of streaks along
  the way he really moved, and on the hit a white stroke along the cut, a four-point star and a
  **crescent** through the target in the cut's own plane (one bright edge, a faint body behind it,
  pointed at both ends). Its line then **hangs**: a line of `|` strokes through the target, pointed
  at both ends, with a faint veil and a glimmer running out along it, re-drawn every frame (one-frame
  lives off `game.fxDt`). The last cuts of a long flurry spark gold. An art's coil draws strokes of
  light in onto him and puts a small star on the blade. The last blow: a crescent (a falling or a
  rising cut's plane is tipped 40° toward the camera: an upright plane along the view is one fat bar
  up the screen), or for the level cut a lens of two shallow arcs opening on either side of the
  line; shards, a ring; and every hanging line flares wide and throws sparks off both its sides.
  The art's own line carries the gem's violet. Kept small on purpose: the stars (a big one blooms
  into a white ball that hides the target) and the lights (never near the floor). Round the wyrm's
  head every particle is moved 3.5 m toward the camera along its line of sight (`pull`): glyph
  particles are depth-tested, and a cut through a head several metres thick would show only where it
  leaves it. Through the flurry the hero keeps a full cold cast, so the dark coat reads against the
  night. Glyphs: `| + * ° ' · A ^ V`.
  **Weight** (ADR-094): a pass leaves a second afterimage in the middle of its line (a speed
  clone); under a foe on the ground every cut throws a low shock ring and dust along the cut; the
  last blow throws **speed lines** across the whole screen (long thin strokes in the screen's own
  plane, two fans along the cut and against it, gone in a few frames) round a hard white core that
  lives two frames. The HUD adds a **screen cut**: a line of light across the whole frame on every
  cut, two crossing on the last blow, and the frame dips dark for a blink before it flashes.
- **The afterimage and the blink** (2026-11-15, ADR-101; `player/fx.js` `_afterimage`, `blinkStream`,
`blinkIn`). Every blink (the Ghostep, the plunge's vanish, each cut and art of a flurry, the
riposte's return) leaves the hero behind as he stood, **printed in fine digits**: one character to
a cell of a 0.13 m grid on the screen (his own coat's cell), in rows and columns, cold blue (a few
brighter), where his body was (420 points of his own meshes, `player._sampleBody`). It falls apart
from the feet up in 0.25–0.7 s. A character never lies on another: stacked, they bloom into a white
blot. As he appears, a few dozen of its digits tear off and **fly to where he is now** (the eye is
carried there), and more rush in onto him. (The owner's pick of three looks: "Digits", the figure
alone, over an "Echo" of two fainter copies stepping off the way he left and a "Shatter" that burst
it into its characters.) Against a duelist the flurry's flare, crescent, hanging cuts and burst are drawn at
62 % (`FlurryFx.k`): at the wyrm's size they hid a man and the hero both.
- **A duelist's flurry** (`duelist/fx.js` `flit`): between two blows a bright ember streak along the
  way he went, a tall flash where he stood, and where he stands a flash and a ring of sparks.
- **The deflect chain:** each parry in rhythm clashes bigger and brighter, with a crossed pair of
  sparking streaks from the second one.

### Bullets, the fire wheel and the melee wakes (2026-11-09, ADR-039)
Code: `dragon/bulletFx.js` (bullets, the wheel), `dragon/fx.js` (`clawTrail`, `slamBurst`, the breath),
all glyph particles in the dragon's `add` / `alpha` pools.
- **The additive rule.** `fx.add` sums overlapping glyphs, and the ASCII pass clips the sum to
  white. Anything drawn as many overlapping glyphs (a breath stream, a wall of fire, a clash on top
  of the hero's own parry burst) keeps each glyph dim and warm (gold `[4.4,2.5,0.6]` at 0.5–0.9,
  orange `[3.2,1.1,0.2]`), so the sum reads as a yellow heart in an orange skin. White-hot colours
  are for single small glyphs only (a cue glint, a spark). Two rounds of this session's fire were
  white blobs before this rule: the fire wheel's spokes and the bullet deflect.
- **Embers** are a gold-orange `*` / `o` head with a short trail of cooling sparks; **wisps** a
  blue head (`[1.6,2.6,4.4]`) with a pale `~` tail, the only cold thing the wyrm throws (blue =
  parry it); **orbs** a big red `@` in a dark-red halo (red = dodge). Sizes follow the hit radii
  (0.32 / 0.4 / 0.62 m), so what you see is what hits.
- **The cue glint:** a crisp cross on a bullet in its tell colour (white on an ember, moon-blue on a
  wisp, red on an orb or a wheel spoke) 0.35 s before it lands. It is the one crisp bright mark in the field on purpose: it is the timing cue.
- **Deflect:** a small moon-blue star and a `+` at the blade, on top of the hero's own parry burst;
  the bullet flies back to the wyrm's head and bursts there. Bullets popped by the clash or cut by a
  swing leave a small `x` in their own colour.
- **Breathed** (2026-11-11, ADR-050): every bullet appears at the jaws, never out of the air. Each
  emission shows its cause: the jaw open, the throat lit, a small orange puff at the mouth (`muzzle`),
  a head kick per cough. The torrent is a continuous stream that snakes as the neck sweeps; the burst
  is a fan of embers spreading out of the jaws.
- **The returned shot** (ADR-051): a perfectly parried bullet goes back as a white-gold `*` core 1.8×
  a bullet's in a turning gold `O` halo with a long orange ember trail, launched by a gold flare over
  the clash; on the head a white-gold star, a gold ring, fire sparks and a warm light. The hero's
  blade throws a gold `* + '` spray (`player/fx.js` `perfectParry`); RETURN in gold.
- **Scouring breath** (was the fire wheel): the windup heats the ground along where the tongues will
  catch, growing out from the strike point as the throat charges; lit, a short stream of flame pours
  from the jaws to the strike point (`breathBeam`) and each tongue is a gold core line under tall
  `^ * # %` flames (240 glyphs / s per tongue) that lean back against the turn, the ground scorching
  as they pass.
- **Fire breath:** a dim orange stream with a yellow vein and a ragged tongue envelope, a small maw
  flare (the old stream summed to a white bar). **Fireball:** a toned-down flash and blast core, so
  the fire burst and flung rocks show.
- **Claw wakes** (`clawTrail`): a burning streak behind the toes on every active frame of a claw or
  overhead; **slam burst** (`slamBurst`): fire and dust thrown up where an overhead lands.

### The Obsidian Throne and the blades of red light (2026-11-13, ADR-069, ADR-070; the open crater: 2026-11-15, ADR-112)
- **The crater** (the owner's pick "A, Starfall" of three rendered open arenas; it replaced a walled
  hall: "the walls are also adding a visibility issue so make it more open") has a made floor: rings
  of fused obsidian plates round the seal (carved glyphs, the calm paving look, sparser and dimmer
  than the courtyard's) whose seams draw faint rings and spokes; toward the rim the plates tilt and
  some are gone. Its light is its own (`sky`: a dim cold moon, a red-tinted ambient and fog) plus four
  vents burning crimson in the floor (glyph flames, pooled lights). What glows without burning is
  **inlay**: the floor seal's rings, spokes and runes, jagged cracks running from the seal toward the
  rim and the two lines of strokes in the star's cleft are single glyphs laid along their lines (a
  dash turned to the line's on-screen angle) in one additive batch that never moves. Keep inlay dim
  (ink 0.8 – 1.7 in the red channel; the cleft 2.4, it is small): it is the largest lit shape on
  screen and must sit under the fight; the seal flares only on an ignition.
- **What stands in it** is prop art in two hues: obsidian (the rim's slabs, the star, rubble, the
  stones hanging in the air) and the star's glass, the same dark stone with a violet cast (the shards
  in the floor, a third of the rim, the crown behind the throne). Every piece is low-poly with one
  tone a facet (`landmarks.js` `facetCol`): a shard is a five-sided prism with a long point, a
  cluster is one tall shard and two to four leaning out of its foot, and what prints is the facets.
  Nothing here is saturated: red stays for the seal, the blades and the tells, violet-white for the
  Void's lightning (the glass is far dimmer than a bolt). A stone in the air reads by its shadow on
  the floor and a wisp of red motes rising under it.
- **Open means:** no wall anywhere (the rim is a crown of separate slabs with gaps a hero walks
  through), nothing over 3 m south of the seal, the tall pieces north and on the flanks where the
  fixed camera shows them. A set piece on the north rim is off the top of the frame until the hero
  walks up to it: the star is seen from the dais's foot, and in the intro.
- **Outside** the forest lies flat, every trunk pointing away from the crater (the dead trees' own
  screen-grid look, laid down); far out a few still stand.
- **A blade of light** is three things: a thin mesh in the hero-art pass (red fill, red-white ink
  lines), a row of additive strokes re-drawn along it every frame (red, with a hotter core stroke on
  every second one), and one red point light that follows it and lights the floor round him. The
  sweep trail is the duelist's, in red. Void lightning is the only other colour he owns: violet-white
  jagged strokes with a light of the same hue, so a bolt never reads as a blade.
- **The lord's harness** (2026-11-14, ADR-084): black plate reads in the hero-art pass as dim fill
  inside bright ink lines, so every plate is its own piece (alternating ink sub-ids between lames) or
  a drawn fold line (the cuirass's chevrons, the yoke's bands). What carries him at the fight camera
  is the silhouette: a hooded head, a yoke wider than his shoulders, and the cape, a triangle of black
  cloth to his ankles whose lower edge is ember-red (the `hem` part prints brighter far off, so the
  cape's foot reads against the black floor). Red light is kept to three places: the blades, the slit
  in his faceplate and the ring on his breastbone. The hood (the owner's pick of three heads) is a
  round crown whose brow hangs forward over the faceplate, so the slit glows out of a dark opening;
  the opening's rim is the cloth's ember red, which is what draws it from the front. A hood given
  as rings needs its front and back edge per ring, not a radius and an offset: the first one, written
  the second way, read from the side as a flat-topped box.
- **The Void's colours:** red for what comes from his blades and his will (crescents, the Rift's
  fissures, the grip's talons, the pull, his wake and aura), violet-white for what comes from the
  sky and the dark (lightning, the Dark Star). A marked area is ringed in the tell's red on the floor;
  the Dark Star also draws its reach in violet, because the crater's inlay is red and a red ring alone
  is lost on it. Lightning is a white-violet core inside a dimmer sheath that outlives it, two thin
  strands wound round it and forks that die in the air: one stroke per segment, laid along it on
  screen and stretched to its length (`LordFx._stroke`).

### The Training Room (2026-11-15, ADR-099; `world/trainingRoom.js`, `?stage=lab`)
A lab stage for any boss: a dark dojo of light (the owner's pick of three looks: "Holo", over a
pale "Grid" and a starry "Void"). Great 2 m tiles of near-black glass in a two-shade checker (carved
glyphs, calm and sparse); a cyan measuring grid of glyph particles in one additive batch of its own
(a line every 2 m out to 22 m, brighter every 10 m); magenta rings round the duel's centre at 3, 6,
9 and 12 m with their numbers in cyan, a centre cross; low dark panel walls with cyan light in their
seams and a pylon of cyan light at each corner, both printed as prop art (the house style); cyan
motes rising.

### Steel on steel (2026-11-14, ADR-079; `combat/clashFx.js`)
One effect for every blade that meets a blade: the hero's parry, a duelist's guard, his deflect, the
blade lock. At the game camera the two fighters are ~70 px tall, and a freeze-frame holds the
picture for 3 – 8 frames, so the rule is: **lines, not light**.
- **Streaks:** 20 – 36 `|` glyphs stretched 1.4 – 3.2×, laid along their own velocity in the SCREEN's
  plane (the camera's right / up axes: a 2D starburst, not a 3D cloud), two thirds of them inside
  ±50° of the way the turned blade was travelling. Born 0.1 – 0.34 m off the centre: stacked on it,
  additive strokes sum to a blot.
- **The cross:** two short rows of `|` strokes along the two blades' directions on screen (opened to
  an X when they are nearly one line), 0.11 s: the meeting of the edges is what is lit.
- **The core:** one `*`, 0.3 m, 0.045 s. Nothing bigger: with bloom's threshold at 0.55 a 1 m `*` at
  HDR 4 is a white disc the size of the hero (the old parry burst, and the old tell glint, which is
  now a 0.4 m core at 0.6× with four thin rays).
- **Embers:** 9 – 16 small points (dots, ticks and bullets) that arc and fall under gravity, flickering, 0.45 – 0.9 s.
- **A ring** only where the exchange turns (a string's last blow, a heavy blow, a perfect parry, a
  deflect): 16 `-` strokes opening from 0.34 to 1.25 m.
- **Colour says what happened:** white-gold = the hero turned a blow; cold blue = a heavy one; gold =
  perfect; dull steel, few and short = his guard held the hero's strike (nothing was won); hot
  orange-red = he beat it away and his counter is coming.
- Sparks and lights advance through a hit-stop (`game.fxDt`), so nothing is pre-aged to "look
  mid-burst": the fighters freeze, the burst does not.

### A cut that lands (2026-11-14; `combat/cutFx.js`, `player._contactPoint`)
The hero's blade into a body (the wyrm's scales, a duelist's cloth) is the clash's sibling, under
the same rule, **lines, not light**, and it is drawn ONCE, where the picture shows the blade meet
the body.
- **The drawn contact:** the hit test runs on the upright, unscaled gameplay bodies, so its point
  floated 13 - 65 px off both drawn figures (a median 1.06 m off on the Ash Disciple). The cut is
  drawn where the DRAWN blade (from `CUT_LOOK.from` to the arc's edge) meets the boss's DRAWN hurt
  spheres (`drawnPoint`), 70 % of the way from the blade onto the body and never more than 0.12 m
  off its surface (the wyrm's reach band hits a chest 1 - 2 m above the drawn blade). A duelist is
  shoved in the same tick (0.14 m, a heavy 0.32 m) and the freeze holds the frame he is drawn in
  after it, so the cut (and his spray) moves with him: ≤ 0.09 m off his drawn body in that frame.
- **One line, not a burst:** a tapered cold slash line LAID ACROSS THE BODY along the cut's screen
  direction through the contact (0.9 m for a light ... 1.6 - 1.9 m for the cleave; most of it ahead
  of the contact, along the cut), its far end breaking off in one or two dry-brush gaps. A heavy blow
  doubles it (a fainter second line on the hilt's side) and lays a short tick across it along the
  blade; a crit adds that tick as a cross. A thrust's line runs along the blade (a puncture), with a
  small puff of points round the entry; its tick (the execution's, a crit stab's) squares across the
  line instead (`CUT_LOOK.crossMin`: whenever the blade is within 0.5 rad of the line on screen).
- **Sparks along the cut:** 8 - 22 thin `|` streaks thrown in the screen's plane, three quarters
  inside +-0.45 - 0.6 rad of the cut, a quarter across it; 2 - 6 falling motes. His own spray (ash and
  embers) flies along the blade's travel too, not along the hero's facing.
- **The core:** one `*`, 0.22 - 0.3 m, two frames. The 0.75 - 1.15 m `*` it replaces blotted out both
  figures through the freeze-frame.
- **Cold palette:** pale steel-blue lines cooling to indigo (the crit's colder and bluer); the
  clash keeps the white-gold. **No screen flash:** `flashPulse` stays steel on steel.
- **Budgets** (additive pool, desktop): light 19, sweep 23, point 22, slam 59, cleave 61 - 69,
  execute 63 spawns; a crit at most 11 more; the LOW preset trims the sparks, motes and ring to 0.65
  (the line, the tick and the core stay). A thin ring opens on heavy blows (two on the execution).
- **The look is the owner's pick** (the Lab's 'cut' row, `?cutfx=fan`): 'gash' (the line, default)
  or 'fan' (no line or tick: a wider fan of sparks, the nearest to the look before).
- **The shudder:** through the freeze a struck duelist's drawn figure flickers +-0.045 m (a heavy
  0.07 m) side to side along the cut, fading: 2 - 3 px at 36 m, while the hero holds the frame. Drawn
  only (`lean.ox / oz`); the Lab's 'shudder' toggle turns it off. A sword cut's only (`takeHit`'s
  `swing`: not the Lord's own returned bolt); his blade's sweep trail pauses while it runs (the
  flicker would draw zig-zag strokes).
