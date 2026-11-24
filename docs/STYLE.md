# ABYSS — Visual Style Bible

ABYSS draws everything in characters. This document sets out the look and how this codebase
produces it.

## The house style: the dragon look (read this first)

**The rule (the owner, 2026-11-15):** the Cinder Wyrm as it ships is "the perfect ascii look im
aiming for. Apply this design to all the background objects as well", and every future background
object and character follows it. This section is that design. If something new does not look like
the wyrm next to it, it is wrong, however good it looks alone.

**What the look is** (ADR-093 for the wyrm, ADR-100 for objects):
1. **Small, fine digits.** A pixel font in cells about 1/90 of the screen height (5x8 px at 720p,
   6x9 at 1080p, 4x6 on a phone; `wyrmArtFont`). One letter size for everything in this look at
   a given zoom: when the player zooms out past the default, every art letter (and the trees'
   screen grid) steps down the same ladder of fonts together, so an object keeps about the letters
   it has at the default distance (`?zoomArt=b`, the owner's pick of three, 2026-11-16, ADR-120;
   `a` the fixed letters of before, `c` half way). Zooming in never grows them; a phone keeps its
   4x6 letters.
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
| An effect that burns, glows or strikes as a body (fire, a spell, a bolt, a shock front, a timing cue) | heat in the fire field (`game.fx.fire`; for the wyrm, `fx._blob` and its engines `_shock` / `breathBody`, below) | meshes, big glyph sprites |
| Something small that flies on its own (an ember, a spark, dust, a chip) | glyph particles (`fx.add` / `fx.alpha`), about one letter cell | meshes |

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
  trees, prop art for stone and metal), drawn from a rigid batch so it can fall, fly or vanish. In
  Cinderwood every tree, the Cinder Tree and the Elder Wyrm's and the nest's bones stay in the set's
  own meshes (2026-11-16, ADR-120): a piece is a run of their vertices, rewritten to drop a part, to
  shudder, lean, fall or fly; whole, they look exactly as they did.
- **Things wear down before they go** (2026-11-16, ADR-120; the owner: "slowly crumble and break"):
  a tree sheds its outer crown, then half of it (a pine its top first), then leans, then falls; the
  Elder Wyrm's skeleton comes apart rib by rib and run by run of its spine, the Cinder Tree loses its
  boughs and then breaks to a charred stump, the nest loses its ribs and skull. Wind from the wyrm
  (a roar, a wingbeat, a landing) tears leaves off the tree wall and snaps boughs, never fells a tree.
  A tree that burns through leaves black ground round its stump, so a burnt stretch of the wall reads
  as one from above. The bonfire stays whole.
- **Debris keeps the dim hue of what it came from:** a wearing crown sheds leaves in the canopy's own
  dark green and splinters in bark brown, a bone in its own dull bone (not white), a burning crown
  charred leaves with a few small sparks (no yellow blobs). A broken bone leaves a heap of shards in
  the bone's hue (wreckage, below).
- Debris, dust, embers, the red strip under a falling piece and the marks a blow leaves are
  **glyph particles** from the world atlas; the flames are heat in the fire field (below). No
  debris meshes, no decals, no textures.
- **Wreckage** (2026-11-15, ADR-119: felled trunks, burnt logs, rubble piles and, since ADR-120,
  heaps of bone shards that lie until the reset) is solid, so it is drawn like every background object: prop art (`createPropArtMaterial`,
  the breakables' prop twin), from fixed pools of meshes in the breakables' rigid batch. A burnt log
  is black (its ember glow is the scorch map's under it) and smoulders in the fire field; when a pool
  is full the oldest piece sinks into the ground. A crater (a blow of power 1.2 or more) is a rim of
  thrown-up earth glyphs and a charred disc of the scorch map. Burning wood lights only a local glow
  (5 m) so the fire on the ground stays readable.
- **The blade's passage** (2026-11-23, ADR-177; the owner: "make the terrain get damaged and show chip
  damage. make it look natural and good"). The hero's blade goes clean through a rock or a tree it does
  not fell; what shows the cut is the piece. Its bricks fall as letters where the steel crossed, thrown
  on ALONG the cut and out of the face (never back at him); steel on stone or metal throws a short spray
  of hot specks `+ ' .` along the cut (5 light, 9 heavy; a heavy cut a blink of warm light); wood and
  bone tear out splinters `/ \ | - '` in the piece's own dim hue with a breath of bark dust drifting after
  them. One small jolt of the camera a swing, under a landed cut's. A faint pale line across the face
  where the edge crossed exists and is off (`BREAK.chip.pass.line`). `?cutStop=1` is the blade that stops
  (ADR-132's freeze, sparks and bounce).
- **Floor marks** (2026-11-23, ADR-177; `?marks=0` the floor as before). Every boss attack that meets the
  ground leaves a mark of its KIND, and the marks stay until the fight resets, so after a fight the arena
  says what was fought there:
  - a **slam** (a fist, a tail, a foot, a landing): a shallow crater, a ring of grit `. , : ;`, a crushed
    middle `x + *` and a few short radial cracks; the biggest are today's crater rim;
  - a **cut** (a blade's edge in the floor): one long thin gash with a gentle bow, tapered at both ends,
    grit thrown to one side; a beast's claws three parallel gashes;
  - a **thrust**: a short deep nick ending in a `v` / `x`, a spray of grit ahead of it;
  - a **dash** (a body or a blade dragged): a shallow furrow, two scuffed edges of `- ~` deepening toward
    its end, a heap of `. , : o` where it stopped; an ankle sweep a scuffed arc round the one who swept;
  - a **blast** (ki, a spell, an explosion): a scorched round of `. : ; ,` dense at the heart and a star of
    thin cracks; a hot one charred;
  - a **beam**: a long charred trench along its path, its middle glassy (`= ~`, dim, never a lit line);
  - a **step** (a heavy footfall): a faint print, a pad and three toes, one in 2.6 m at most.
  How they are drawn: each line is a DARK STROKE (`-`, turned to its way on screen) with a dim **lit lip**
  a hair to the north of it, the far edge where the light catches broken stone (grey (0.42, 0.4, 0.37)
  at 0.66 of the mark's alpha: the house style's few brighter digits, never white); grit and thrown-up
  earth print in the lip's grey. The dark ink is the set's crack ink turned mostly GREY (0.3 of its
  colour kept) and capped dim: a mark is never red or bright, because a danger marker is red strokes
  (the throne hall's ember-red cracks drew red strips across the floor; today's cracks keep their ink).
  Marks of one kind piling up on one spot are THINNED (each new one keeps 0.45 of its glyphs per mark
  already there), so a hundred blows do not turn a spot to noise. On grass a mark lies on the blades'
  tips (under them the meadow hid it). The char of a hot blast or a beam lands only where no grass grows.
  A mark never reads as a tell: no glow, no colour, no motion. Honest: after a fight the floor reads "a
  fight happened here", but the KINDS read only zoomed in (a 1.5 m gash is ~28 px at the game camera) and
  they are weakest on grass; the lip's brightness and the pale arcs and trenches are the owner's to judge
  (open).

**Effects (ADR-113).** Anything that burns, glows or strikes as a body is HEAT IN THE FIRE FIELD
(`game.fx.fire`), printed in the same small letters as the wyrm: never a big glyph sprite. Read
"The fire field" below before making an effect. Only small things that fly on their own (an
ember, a spark, dust, a chip of debris) are glyph particles, about one letter cell in size.
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

## The founding look (v0.1)

**Camera.** Steep top-down *perspective* (≈55–65° pitch), fixed yaw (north up), fairly high.
Characters are tiny (≈3–5 % of screen height) with small white monospace name tags above them.
Large creatures (a wyvern) fill a third of the screen. Strong cast shadows from characters and the
dragon fall up/right.

**Palette.** Night. Near-black navy background (#05070c → #0b1018). Grass is desaturated sage /
teal-green; rocks blue-grey; fire is the only warm light and it *spills* orange over the grass
glyphs around it. White dots (flowers/dew) are sprinkled through the grass.

**Three kinds of glyph rendering** (symbols are not just put on a grid: they are arranged into
patterns, so the eye reads shapes):

1. **Arranged stroke glyphs** for organic surfaces. Grass = millions of single glyph strokes
   (`| / \ ' Y V v l i`) standing in the world. Dragon skin = chevrons (`^ < v A`) laid *along the
   body flow* in offset rows so they read as scales, in white / ember-red / orange on a near-black
   skin. Hair/cloth use strokes the same way.
2. **Screen-grid ASCII** for hard props: rocks, standing stones, ruins, tree canopies. A terminal
   character grid where glyph density follows luminance (`. : - = + c o a 0 Q & 8 # B N W M @`),
   coloured by the object's lit colour, on a dark slab of the same hue. Canopies use blobby glyphs
   (`o 0 O 8 @ &`), stone uses letters.
3. **Glyph particles** for FX: fire `* # % @ & ^ ~`, embers `. ' \``, sparks `+ x *`.

**UI (v0.1).** Monospace everything; thin bars; translucent dark panels with 1px light
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
| Trunks (the Cinder Tree's wood is prop art since ADR-113) | screen-grid `STONE` 1.0: symbol ramp `. : - = + * % # 8 & @ M W` + **outline glyphs** (`\| - / \`) on silhouettes / depth steps of raised props | `createAsciiObjectMaterial` → `render/pipeline.js` |
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

**The hero's letters follow his size (2026-11-21, ADR-130).** The owner's reference for the hero is a
picture of him at the game camera on a 720p frame: about 9 letters across the cloak and 13 rows of
them, "not too detailed but has enough ascii features and style". That count is the look, not the
4 px cell that happened to give it there:
- **One letter cell of his is 0.115 m at his depth**, on every screen and at every camera distance
  (`CONFIG.render.heroLetters`). A fixed 4 px cell drew 9 letters across at 720p and on the phone,
  13 at 1080p, 18 at 1440p: on a large screen he was a grey mesh of dust, a different figure.
- **His ink lines step with his letters** (one FONT pixel wide, found per font pixel): a hairline
  round 12 px letters reads as vector art, not as the picture.
- **A close-up is drawn as it always was.** From 20 m in to 6 m, where the pass fades from his far
  look to the close-up's line art, his cell goes back to the fixed 4 px one (the title, an intro,
  the Lab). With the large cell the close-up's ink lines came out five pixels thick and white.
- **From every side one dark figure of letters.** His plate (greaves, boots, bracers) takes the
  cloak's dim dotted lavender rim. White plate outlines drew his legs as two hollow tubes from the
  front, where the open cloak shows them.
- **The steel is dark until it cuts.** At rest and on the run the blade is drawn like his armour;
  it lights white through a strike, with the charge, in the flurry and the plunge. No halo of dots
  at rest. The swing's arc is the crescent as it was (the owner kept it).
- **The human bosses are not part of this** (the owner: "hero only for now"): they keep the fixed
  cell and `HERO_INK` as it is. What is the hero's alone lives in `HERO_SELF` and `TUNE.bladeLook`.

**The wyrm (the red-black dragon reference; fine digits, ADR-093).**
- **Letters:** fine pixel-font digits, each glyph one pixel wide with a soft 0.24 halo and a black gap
  round it, in cells about 1/90 of the screen height: a 4x6 font in 5x8 px cells at 720p (the owner's
  pick "B, medium" of three sizes, 2026-11-15), a 5x7 font in 6x9 cells at 1080p, 3x5 in 4x6 on a
  393 px phone, the 4x6 font doubled at 1440p (`wyrmArtFont`). Never a bold browser font. Zoomed
  out past the default, the cell steps down to the next smaller of these fonts (at 1080p 6x9 → 5x8
  → 4x6 px; `wyrmArtLadder`, ADR-120), each step's letters brightened by the ink they lose
  (`uArtInk`) so the body keeps its tone.
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
- **The build** (2026-11-20, ADR-123): the owner turned down three full redraws of the wyrm in one
  day (new palettes, plates, a halo, recoloured fire) and asked for the same wyrm "more menacing,
  a bit more slender". The surface above stays as it is. The shape is build c (`dragon/looks.js`):
  a tucked waist under an unchanged back line, thinner neck, limbs and tail, longer talons, a
  narrower head with longer fangs, horns and frills held high on a rising neck, and a mane of thin
  quills down the neck, back and tail. When the wyrm should look different again: change its
  build, its pose or its silhouette before its letters or colours.
- **The glare** (2026-11-21, ADR-127): an angry eye is drawn, not tilted. The slant lives in the eye
  (an almond, the outer corner high) and in a brow steeper than it; the eye faces out, up and forward
  so the slant shows from every side, and it sits in a dark socket.
- **The face** (2026-11-20, ADR-124): the drake. A face reads when it has PLANES and HOLES: fine scales
  under a hard key light print brow, snout, cheek and jaw as planes; the eyes burn in sockets of a
  near-black material; the mouth is black inside with a red tongue, white fangs of different sizes and
  the fire at the back of the throat (a lit orange mouth read as a painted board); the neck's quills
  stop short of the skull so its outline is free. At the game camera the head is a wedge with two
  burning eyes; the detail is for close shots.
- **Heads kept for later** (2026-11-16, ADR-120): three sculpted heads (`skull`, `loong` with two
  springy whiskers, `demon`; `dragon/heads.js`) were built and filmed: lofted skulls with sockets,
  brow ridges and cheekbones, drawn with flat facets and smaller scales (`FACE_ART`) so the form
  prints through the key light. The owner: "lets pass on the remake of the dragon head for now". The
  wyrm wears today's head; the three stay behind `?wyrmFace=skull|loong|demon` (and the Lab's head
  row), like the hero's looks (ADR-089). Seen on them and not fixed: the teeth print as a solid white
  wall from the side, the scale texture fights the sculpted form up close, and at 36 – 54 m the heads
  differ only a little.
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

### The fire field: effects in the dragon's letters (2026-11-15, ADR-113)
The owner: "the dragon fire attacks look meh ... make it look like real fire and more threatening
and detailed". Fire used to be separate large glyph sprites with glow on top, outside the letter
grid. Now (`render/fireField.js`, `render/firePalettes.js`):
- **You place heat; density draws the fire.** An emitter spawns soft blobs (metres across, a heat
  each). They add up in a buffer with one texel per letter cell. The summed heat h picks the letter
  and its colour: below ~0.24 red strokes `| / \` (the tips of tongues), ~0.45 to 1 digits in orange,
  above ~1 round bright digits in yellow, above ~1.5 the white-hot heart. Many small cool blobs
  (0.2 to 0.5 each) that overlap make a body with a hot core and a ragged rim. ONE big hot blob
  makes a featureless white disc: never do that.
- **It moves like fire by itself:** noise that scrolls upward makes the heat climb as tongues, lean,
  and tear at the cool rim; each cell re-rolls its letter a few times a second on its own beat (the
  fire boils). Tongues always climb up the screen.
- **A dark backing** sits behind every letter of a flame (the house style: a dark body with brighter
  digits), which keeps fire readable over lit grass.
- **Calm.** `hdr` 0.6: the owner called big bright letters "way too flashy" (ADR-093), and above
  about 1 the bloom swallows the digits. Do not raise it without showing the owner options.
- **Kinds:** `fire`; `void` (the Starless Lord: violet body, pale heart); `steel` (crisp, no
  turbulence: a thin line of it prints as the stroke that runs along it, so a bolt, a cut or a
  glint is drawn in `- / | \`; heat 1.15 or less prints strokes, above 1.2 a white digit: where two
  lines cross there is a hot joint); `smoke` (dim grey letters, only where no fire prints).
- **Rules of thumb:** a line of fire needs blobs about 0.3 x their size apart (a blob's heat halves
  0.2 x its size from its centre). Keep blobs at least 0.7 m up: lower, the soft depth test fades
  them into the ground. A soft line thinner than about 16 px vanishes when it falls between two
  rows of cells: write crisp lines on the grid (`DuelFx._ink`, one blob per cell). Heat re-drawn
  every frame goes through the one-copy frame clock (`_frame` / `_dot`), or it stacks in slow
  motion. Fire spawned behind a figure (as the camera sees it) wreathes it without covering it.
- **Warnings are not fire.** Ground warnings stay glyph specks on the ground (ADR-052) and draw over
  the field; air and sound rings (the roar, the nova's charge, the bell's tolls) are `steel`.
- **Look code has its own random stream** (ADR-122): an effect's jitter comes from a seeded stream or a
  hash of its own, never from a stream game code reads (an fx object's `rnd()` / `rand()`) or
  `Math.random`, so a look can never move where something lands (*The duelists' effects*, below).
- **Timing cues, one design for every boss** (COMBAT.md "Tell presentation"): a white cross written
  on the grid; a larger eight-point star with a ring; a ragged red blaze with no straight line in it.
- **What stays a glyph particle:** embers, sparks, dust, rocks, debris, about one cell in size (0.2
  to 0.4) and few. Also, for now: the hero's effects, the wyrm's red orbs (their colour is a signal;
  the blue wisps are gone, ADR-119), the Lord's red blade, `combat/clashFx.js`.
- **Bullets:** an ember is a small ball of fire round a gold `*`, with a burning tail. A ground
  tongue is one narrow line of fire (below, *Bullets, the ground tongues and the melee wakes*).
- **It follows the zoom** (2026-11-16, ADR-120): one texel per art cell, so when the letters step
  down with the zoom the fire's letters do too. Its tongues are counted in cells, so at a smaller
  step they are smaller; not yet looked at in phase 3.

### Text effects (2026-11-15, ADR-113)
Things only a world made of letters can do. One rule for all of them: **a loose letter is always
one art cell, pixel-snapped, from the wyrm's own atlas: never a scaled sprite.**
- **Heat haze:** the letters of the wyrm and of objects within about nine cells above and three
  beside a flame re-roll on the fire's beat, slide a pixel sideways in a climbing wave and take a
  little of the fire's colour (violet beside void fire; steel makes none). `uHazeRoll.x` is the
  share of cells that re-roll: lower it if it reads as noise.
- **Letting go:** the dying wyrm comes apart as text: its letters let go from the top row down, in
  strands of columns; each falls about five cells, turns ember and fades before its cell shows the
  ground. Cells, not patches.
- **Shed digits:** a cut on the wyrm knocks a few of its own cells loose (12 a cut, 20 a heavy one);
  they fall, lie on the grass and fade. A detail, not a spectacle.
- **The breath's charge rises:** during the windup the glow fills from the belly up the throat to
  the maw (it used to light all at once).
- **The impact ripple** (2026-11-22, ADR-149; `render/impactRipple.js`, the ASCII pass): a landed cut's
  pressure wave runs out through the struck boss's own letters. At its front the cells are pushed
  outward (3.6 - 5.5 px on the wyrm's cell, a finer grid in proportion) and back at rest behind it,
  a share of them re-roll, and on the wyrm up to 70 % of the front's strongest cells print a stroke
  lying along it (the outline's strokes). The rules it was found by:
  - **Nothing in the first cells round the contact** (2.5 cells, a 2-cell ramp): the cut's flare and
    core speak there.
  - **Contrast, not lift.** A thin bright front with a trough up to 60 % darker right behind it: the
    contrast travels and the body's average brightness does not rise. Round 1 (re-roll and lift, a
    shove along the cut) was calm and read only when two frames were diffed.
  - **Boss cells only:** the wyrm's art grid and the human bosses' ink-line grid; never the hero,
    props, floor, grass or HUD. Cells far nearer or farther than the contact (a 6 m window) take
    none. Whole pixels only.

### Fire, hazards and the plunge (2026-11-09)
(Since ADR-113 the bodies of fire below are heat in the fire field, above; what this section says
of shapes, timings and warnings still holds, the glyph and colour lists do not.)
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
  - The live fire's leading edges (flame ring, wall) are a thin hot line in the fire field and the
    roar's ring is a shock front (*Shock fronts, the breath and the sky*, below): fire orange and
    dust, never tell red.
  - **Thrown terrain shows nothing on the ground** (ADR-119, the owner's choice): its cue is the flare
    drawn on the flying piece. Ambient cinders, eruption pools and every other hazard keep the heat.
- **Meteors** (2026-11-15, `skyFx.js`): the head is a body of fire, cooler blobs tumbling round a
  small heart, with a long hanging tail and smoke, over a visible fall; the strike is a ball of fire,
  a ground wave (a shock front), a cone of rock and dirt thrown up, a column of smoke, and a crater
  that smoulders (P3: burns hard while it hurts). Until then: a white-hot `@` core in a `*` halo with
  `|` strokes and a ring of `)` shock strokes at the impact.
- **Armageddon** (2026-11-11, ADR-053; reworked 2026-11-15, ADR-119, `skyFx.js`): a beat of menace
  (low, still, glaring), then the weight goes back onto the haunches, the wings unfurl, the chest and
  the throat fill with fire (`skyThroat`), and it tears a dozen **columns** of fire up into the sky,
  each kicking through the whole body: a column is a tumbling head of fire whose tail hangs where it
  passed, so the column stands for a moment (`skyBolt`; the white `@` bolts of `fx.launchBolt` are no
  longer used). Then **the sky answers**: a burning cloud deck spreads along the top of the frame from
  over the cast (`skyDeck`: drawn on a plane above the fight, placed along the camera's own rays so it
  stays in view), rents of light tearing open in it, embers raining out of it, while the shared
  ambient and fog colours warm a little (`world.atmosphere.skyGlow`, kept subtle: at the phone camera
  the fog fills most of the frame). It drops onto its forefeet with a slam. Its meteors are drawn 1.3×
  (the great one 2.4×) and fall on a slant from the sky above the wyrm. **Three looks** behind
  `?apoc=a|b|c` (`skyFx.APOC_LOOK`): a the salvo of columns (the default), b one sustained pillar
  roared straight up with the ceiling spreading from its top (`skyPillar`), c it takes off and tears
  the salvo up from the air in a wider fan, the deck right over it. **The owner kept a** (2026-11-16;
  b and c stay behind the switch).
- **Lava pillars:** before the eruption the ground cracks glow and spit sparks (`~ ^ ,`), faster as
  it nears; then a column of molten `# % @ & ! |`, droplets (`. o •`) and a `~` splash ring.
- **Flames** on strips, rings and walls are heat in the fire field: a bed of blobs that overlap into
  one body of fire as wide as it hurts; the fresh front burns tallest and hottest (a ring's and a
  wall's leading edge a thin hot line) and scorches as it runs; smoke rolls off it, and a **hem** of
  low red licks and embers stands where it passed and dies out (the smoulder). Until 2026-11-15: tall
  `^ * # % &` glyphs behind a red leading edge. A pillar's pool and a fire blow's burning strip are
  the same fire, smaller and lower.
- **Casts and flight:** (the old meteor cast spat one fireball straight up: Armageddon's salvo above); fire swirls in round the wyrm
  before a flame ring; the nova's 2.5 s charge sucks embers and flame onto the chest with rings of
  air contracting onto it (crisp steel ripples, not `)` strokes) and glowing cracks round its feet,
  then three shock fronts roll out behind a white flash and a fire storm; the sky strafe and the
  flying combos' passes stream the breath's own fire (`breathBody`) from the mouth onto the ground
  ahead; low wingbeats blow dust and flatten the grass; a landing, a stomp, a leap, a hop and the tail
  slam send a ground shock of dust (`groundShock`); the dive's crash two fronts of fire, flames flung
  out low, rocks and a big dust cloud.
- **Phase 3** burns white-hot: crack glow 0.8 and 50 body embers / s (phase 2: 0.5 and 22), a
  white-hot boss bar, and since 2026-11-16 the wyrm is ablaze (*The wyrm ablaze*, below).
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

### Shock fronts, the breath and the sky (2026-11-15, ADR-119)
The owner: "his shock wave rings coming out looks really bad ... need to look realistic" and "him
breathing out a cone of fire ... looks bad because the fire doesn't look realistic". Every shock ring
was one evenly spaced circle of blobs living 0.3 s, and every breath was drawn its own way. Now two
engines in `dragon/fx.js` draw them all, in the fire field, and new effects go through them:
- **A shock front has a body** (`_shock`; the numbers per look are the `SHOCK` table). It is ragged:
  its radius wanders round the ring (two waves of 3 and 5 lobes) and a weak stretch of it is left out
  (a gap). It is fast at first and **slows** as it runs out (drag), so it piles up at its edge. Rows
  of cooler fire and smoke follow behind the leading row; dust and grit are torn off the ground behind
  it (one-letter grains), rocks are thrown, the ground glows then chars where it passed, a light
  flashes, and a strong one sends a thin crisp **echo** ripple after it (steel: it prints as the
  stroke that runs along it). A front can be mostly dust with a little heat (a landing, a stomp:
  `groundShock`) or fire (a meteor, the nova: three fronts one behind the other). The roar is
  pressure, not fire: ragged crisp ripples running out along the ground from under the head and the
  dust they lift.
- **Three looks of the ring** behind `?ring=a|b|c`: a a rolling wall of fire with a wall of dust behind
  it (the default); b a pressure front written in crisp strokes on the ground, a dust skirt and echo
  ripples; c the ground heaves: a ring of thrown earth, clods and stones running out, no fire but
  where it started. **The owner kept a** (2026-11-16; b and c stay behind the switch).
- **One breath** (`breathBody`) for every fire the wyrm breathes: the breath, the fire snap of its
  strings, the strafe and the flying combos' passes (only the reach, the cone and the rate differ). It
  fills its hit cone: a rod of small hot blobs at the jaws (the white heart, kept small), a body that
  widens, slows and swells to the cone's far end, licks curling up off its rim, **billows** that roll
  up and over where the fire has slowed, smoke over it, and a **splash** of flame where it meets the
  ground, the ground left glowing. Each blob is born part-way along this frame's path, so nothing
  beads. While it burns, the grass fire under the cone is hushed (`world.fire.hush`): the two fires
  added up into white knots. **Three looks** behind `?breath=a|b|c`: a a torrent (the default), b
  five lashing tongues that whip across the cone, c liquid fire: an arc that rains down onto the
  ground and spreads there as a carpet of flame. **The owner kept a** (2026-11-16; b and c stay
  behind the switch).
- **The sky** of the apocalypse (`skyFx.js`): the columns, the burning deck and the meteors (above,
  *Fire, hazards and the plunge* → Armageddon). Like the eclipse of a charged blow, it is drawn by
  what is lit, never by a flat overlay.
- **Dust** is one-letter grains thrown from anywhere inside its ring at their own speeds (never a
  circle of them) and a low cloud of smoke in the field under them (`dustRing`).
- **Fireball heads** are a knot of small blobs re-dealt every frame round the shell, a hot heart that
  boils inside an orange skin with a ragged edge (two stacked hot blobs were a featureless white disc).
  **Not right yet:** bright white-yellow knots remain in shell and fireball impacts and in the
  torrent look of the breath (ADR-119).
- **The whole body's blows** (`meleeFx.js`): the fire snap is a short fat gout of the breath with a
  few licks and smoke left at the maw as it dies; the wing slam throws a fan of dust ahead and to both
  sides (from phase 2 a low licking wave of heat along the ground), the tail slam bursts dust up along
  its length and cracks the ground under its tip (with fire, flames spit up along the line); a raking
  claw tears sparks off the toe (from phase 2 they burn), and a gust off the wings throws dust in a
  fan.
- **Terrain** (`terrainFx.js`): the chosen piece stirs (dust and grit shed off it), the tug makes grit
  jump round its foot, the tear bursts roots, clods and dust out of the ground, the flying piece sheds
  grit and leaves and smashes what it meets into splinters, the landing throws a spray on along the
  way it flew, and a firebrand burns along its trunk in the jaws, in the air and where its wreck lies.
  Nothing is drawn on the ground before it lands.

### The wyrm ablaze (2026-11-16, ADR-120; `dragon/ablaze.js`, `tuningAblaze.js`)
In phase 3 the Cinder Wyrm sets itself on fire. Three strengths were filmed behind `?ablaze=a|b|c`;
the owner picked **b** (trailing fire), the default (`?ablaze=off`: none).
- **The ignition** is a beat of the phase-3 roar: 0.45 s after the ring (calm in this roar: its
  front's fire and its ground glow held low, so the ignition reads) fire runs from the chest along the
  wing arms to the tips, down the legs to the claws and along the tail in 1.1 s, then flares at every
  end (embers, a shake, a punch, a light).
- **Then it burns:** flames stand on the wing tips and the trailing edge between them, the four claws
  and the last third of the tail, with a larger flame at its tip. Every flame is heat in the fire field
  (small blobs that keep only 18 % of the part's speed): at rest they stand and climb, a fast move
  leaves fire along its path (a wing sweep paints an arc, a tail whip a ribbon, a dive a comet's
  tail); b and c also lay extra fire along a part moving fast. Embers are glyph particles. Look c
  adds the horns and the spine's crest and brighter fire; a is barely seen at the game camera.
- **It marks the world, not the hero:** in b and c a planted claw chars the grass and leaves a few
  small, low flames for 1.6 s, and the dragging tail does the same; they never use the ground fire
  that hurts, so they read as safe. Wood a burning part sweeps past catches.
- **The cues stay readable:** a timing cue dims the fire round it (near it to 8 %), a red or black
  body glow dims all of it, a flame next to the hero burns low.
- It gutters low through a stagger, a posture break and the plunge's reaction, and goes out along the
  body, the ends first, as it dies.
- **Seen and not fixed:** c's tail ribbons have a hot white core (near "too flashy"); smoke on death barely reads; the fire has no
  sound of its own.

### Bullets, the ground tongues and the melee wakes (2026-11-09, ADR-039; 2026-11-15, ADR-119)
Code: `dragon/bulletFx.js` (bullets, the tongues), `dragon/fx.js` (`clawTrail`, `slamBurst`, the breath).
What burns is heat in the fire field (the embers, the muzzle flashes, the breath driven into the
ground and the tongues, a lobbed ember's splash); the orb stays a glyph mark (its red is a combat
signal the field has no kind for); sparks, peeling embers and motes are glyph particles.
- **The additive rule** (still true of every glyph drawn in `fx.add`): it sums overlapping glyphs, and
  the ASCII pass clips the sum to white. Anything drawn as many overlapping glyphs keeps each glyph
  dim and warm (gold `[4.4,2.5,0.6]` at 0.5–0.9, orange `[3.2,1.1,0.2]`), so the sum reads as a yellow
  heart in an orange skin. White-hot colours are for single small glyphs only (a cue glint, a spark).
  In the fire field the same rule is many cool blobs, never one hot one.
- **Embers** are a small ragged ball of fire round a gold `*`, a burning tail and embers peeling off;
  **orbs** a big red `@` in a turning `O` ring with a `! #` tail (red = dodge). Sizes follow the hit
  radii (0.32 / 0.62 m), so what you see is what hits. The blue wisps (a blue head with a pale `~`
  tail, the only cold thing the wyrm threw) were removed with the swarm (ADR-119).
- **The cue glint:** a crisp cross on a bullet in its tell colour (white on an ember, red on an orb or
  at a tongue's front) 0.35 s before it lands. It is the one crisp bright mark in the field on
  purpose: it is the timing cue.
- **Deflect:** a small moon-blue star and a `+` at the blade, on top of the hero's own parry burst;
  the bullet flies back to the wyrm's head and bursts there. Bullets popped by the clash or cut by a
  swing leave a small `x` in their own colour.
- **Breathed** (2026-11-11, ADR-050): every bullet appears at the jaws, never out of the air. Each
  emission shows its cause: the jaw open, the throat lit, a small puff of flame at the mouth
  (`muzzle`), a head kick per cough. The torrent is a living stream that comes in gusts and snakes as
  the neck sweeps; the burst is a fan of embers spreading out of the jaws. A **lobbed** ember (the
  Ember rain) heats the spot it will land on as it falls (`lobMark`) and lands in a low splash of
  flame and sparks (`lobLand`).
- **The returned shot** (ADR-051): a perfectly parried bullet goes back as a white-gold `*` core 1.8×
  a bullet's in a turning gold `O` halo with a long orange ember trail, launched by a gold flare over
  the clash; on the head a white-gold star, a gold ring, fire sparks and a warm light. The hero's
  blade throws a gold `* + '` spray (`player/fx.js` `perfectParry`); RETURN in gold.
- **The ground tongues** (the Scouring breath, the Fire lanes; ADR-119): the windup heats the spot the
  breath will strike (`strikeWarn`); lit, a sustained breath pours from the jaws to the strike point
  and splashes there, rolling out and up (`breathBeam`). Each tongue must read from the game camera
  as **one line of fire, no wider than it hurts, with dark ground beside it**: an unbroken hot core
  line from its tail to its front (small held blobs close together: the field sums them into a
  white-gold thread), a body as wide as the hit whose edge wavers a little along the line (it licks,
  it never smears sideways), hottest just behind the front and dying toward the tail, a **bright
  front** rolling forward, flames licking straight up off the line (most at the front), a few sparks
  and a small light riding the fronts nearest the hero. No smoke, no flame thrown off the line, no
  wide ground heat: the gaps between tongues stay dark (the first build read as patches of fire and
  was sent back). The ground under it chars; wood its front crawls over catches. Until 2026-11-15
  the Scouring breath's tongues were spokes of `^ * # %` glyphs turned round by the spinning body.
- **Fire breath:** the one breath (`breathBody`, above). Until 2026-11-15: a dim orange stream with a
  yellow vein and a ragged tongue envelope, then a toned-down fireball flash and blast core.
- **Claw wakes** (`clawTrail`): a burning streak behind the toes on every active frame of a claw or
  overhead; **slam burst** (`slamBurst`): a low shock of fire, flames spat up and embers where an
  overhead lands.

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
- **A piece in his grip** (ADR-109) is the piece itself, carried: it comes up out of its place,
  crosses to hang beside him turning slowly, wrapped in void heat, and a thread of red arcs runs to it
  from his casting hand. Nothing is drawn where it will land (ADR-122; until then a red ring, drawn
  strong from the moment it left him): the cue is the flare on the flying piece. A floor plate in his
  hands is a chunk about 0.85 m across (a crater plate's 1.2 x), never the whole plate.
- **Outside** (2026-11-22, ADR-133; `world/starfallProps.js`): what those who came for him left round
  the crater, in the prop art path (the dragon look): graves of swords stuck in the earth (a red
  tassel on one), spears with a torn red banner, wanderers' cairns (flat stones, a plank marker, a
  straw hat, a sword), wrecked carts on their sides, a few steles on stone turtles, split boulders.
  Every copy is built afresh (its size, lean, how broken, how many parts). Faces (an inscription, a
  banner's cloth) turn to the camera within ~35 degrees; what fell lies along the blast's way out,
  turned off it, so the ring is not a starburst; every piece rests on a face, a little sunk in. On the
  near side of the path (z > 6) nothing is taller than 3 m. Until then the forest lay flat there,
  every trunk pointing away from the crater (the dead trees' own screen-grid look); the owner called
  it "incorrect and not realistic". `?outskirts=0` draws it again; `a` the shrine the star fell on
  (stone lanterns, steles, broken pillars, a thrown roof, jars), `b` the star's own debris (its rock
  in furrows, heaved ground, glass splinters, split boulders), `m` all of them.
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

### The duelists' effects (2026-11-16, ADR-122)
The two human bosses' second pass redrew what they do in the house style: everything that strikes,
burns, glows or breaks as a body is heat in the fire field, in the small letters; glyph particles
only for one-cell things that fly on their own (embers, sparks, ash, grit). Code: `duelist/fx.js`
(`DuelFx`, both bosses), `ashDisciple/moveFx.js`, `ashDisciple/terrain.js`, `starlessLord/fx.js`
(`LordFx`), `starlessLord/spells.js`, `starlessLord/terrain.js`, `world/floor.js`. Which option of
each is drawn: *The look switches*, below.
- **The shock front** (`DuelFx.shock(x, z, r, { k, fire, kind, T, delay, echo, r0 })`, `groundShock`):
  the wyrm's recipe for a duelist's size. A ragged front (its radius wanders round the ring, a weak
  stretch left out) that is fast at first and slows as it runs out, rows of cooler heat behind it,
  dust that hangs, grit torn off the ground. Kinds `dust`, `fire`, `ash`, `void` (the Lord's big
  shocks: the nova, the ignitions, Starless Night's slam). A crisp steel ripple prints as an even
  polygon at a duelist's size, so the pale fronts carry no echo. Red ring blows (Lotus Sweep, Ember
  Whirl's last spin, Twin Embers' second blow, Heaven-Splitting Fall) throw a ground shock as they land;
  the posture break is ragged strokes and a dust shock (no longer an even ring); `dust()` has a body,
  rises higher and from k 1.2 sends a shock. The Lord's own rings (`LordFx._ring`, `_shock`: the Dark
  Star's rim, the aura wheel, the grip and crush rings, the blink ring) are ragged too.
- **The phase changes** (`DuelFx.phaseBurst(n, x, z)`; the Lord: `igniteNova`, `igniteGather`). The
  Kindling (phase 2): a front of fire and a gout off the blade; the kindle value is held while the
  transition runs and driven through the kneel. Ash on the Wind (phase 3): the wind takes him, he is
  torn off downwind as ash and re-forms; the kneel charges the blade only (`fx.ashCharge`). The Lord's
  ignitions: each form its own sign (form 2 two blades torn apart, form 3 the staff's two ends lit as
  pillars, form 4 the Void opened behind him and bolts) round a ragged shock, the crater answering
  (the vents, the seal); the burst light is dimmer than before (4.5, not 8: it washed the frame violet).
- **Afterimages and the flit** (`DuelFx.ghost(d, { ..., rise, spread })`): in phase 3 every blade beat
  of Shen Hui's leaves a faint afterimage; a flit leaves a ghost where he left (one a flit), a stream
  of ash crossing to where he comes in, and motes drawn in there. Built to read at 30 m; still faint.
- **Sword qi** (both bosses' crescents): a body with a wake behind it, in steel; in a crowd (a fan, the
  storm of qi) the crescents share one wake budget.
- **Burning ground** (`moveFx.js`): a low glowing seam on the stones along the line, embers off it and
  a wisp of smoke: the grass fire's recipe, kept under his knees so the blades and the flare read over
  it (tall flames hid both fighters). About 25 blobs alive a line plus 20 a frame for the seam; the cap
  of 9 lines holds it near 400 of the field's 6000.
- **Rings of sound are steel**: the bell's tolls are a ragged front of steel at waist height with a
  trailing row (no bronze glyph arcs).
- **The Lord's spells have bodies.** The Dark Star is a starless sun: a dark heart of letters, a
  ragged violet corona, the floor dimmed under it, dust drawn in, a real shock when it bursts. A strike
  of the Starless Sky: a knot of the Void over the mark inside the frame, a stepped leader, the bolt
  from the knot, a ragged burst, the floor left smouldering (40 % fewer blobs than the old strike).
  Starless Night's waves are a dark tide: a wall of violet digits with a red seam on its leading edge,
  fire-field heat. The smaller things (`?void=a`): the blades as light in the field, the crescents,
  the push, the fissures, the returning blade, the torn stones, the Crushing Dark, a gather of the Void
  in his hand for each spell, the blink, the deathblow and his death. Forms 2 and 3 carry a quiet
  presence (the off blade's light and embers; the staff's two ends trailing as it turns). The Void's
  colours are unchanged: red from his blades and his will, violet-white from the sky and the dark.
- **Terrain.** The Lord's terrain windups gather the Void in his hand, a held piece is wrapped in void
  heat and each throw leaves a stroke of it; Shen Hui's cut through a pillar, his kick's fan and a
  piece's crossing streak are heat in the field; dust and grit are one-cell glyphs. **A thrown piece
  draws nothing where it will land**: its cue is the flare on the piece (COMBAT.md "Core rules").
- **The floors** (`world/floor.js`): a cracked slab is two to four pieces pulled apart over a dark
  seam of earth, each a little tilted and a tone apart, a moonlit chamfer along every seam; a broken
  slab is bare earth that prints (dim warm letters as dense as the paving, a tone darker), a ragged
  edge eating into the gaps round it and chunks of stone lying on it. In the crater it is
  deliberately dark and reads less. Each state is one more merged mesh of the set's carved material,
  hidden until its first slab shows.
- **The bodies** (`?ashLook=`, `?lordLook=`; `look.js`, the kit's `dress`): today's figures, dressed
  by phase / form. Shen Hui: in phase 2 the robe's hem and the free sleeve's cuff smoulder; in phase 3
  the hat is gone, his hair hangs loose, the robe is burnt pale with a frayed, still smouldering hem.
  Varr Nihil: the cape torn away sheet by sheet, cracks of red light, in form 4 the hood back and the
  faceplate split. One big, certain change a step (a missing hat reads at 30 m; a trim would not); no
  new material (the ember is the rig's unused flask instance). Option `a`, the same figure through the
  wyrm's art path (`bodyArt.js`), read as a block of digits at 30 m and was not picked.
- **Look code draws from its own random stream** (a seeded `lr()` or a steady hash), never from the
  fx object's `rnd()` / `rand()` (game code reads that stream: the storm's scatter, a throw's spread)
  nor `Math.random` (the seeded suites replay the AI from it). A look option, a blob count or an extra
  light can never move where something lands or a test's outcome. `LordFx` wraps every drawing method
  onto its own stream (`DRAW_METHODS`); lights seed their flicker from a stream of their own.
- **Cost** (headless, a shared GPU: frame rates were not measured): the fire field's peak in the
  Lord's form 4 with Starless Night is about 3000 of 6000 (main about 1500): the thing to watch on a
  phone; without the great spell, with the picks on, 518 / 1642 / 1033 / 698 per form; Shen Hui's
  phase 3 about 700 – 1400.

### The city's light (Halcyon Plaza, 2026-11-22, ADR-159)
Four kinds of heat, each on purpose, and no other light: `steel` the city's neon tubes and screen faces
(a screen is a pale rectangle of heat with his head and shoulders left dark: his face on every screen);
`void`, re-paletted to his crimson (`?glare=`), his eyes, his beams and, from his phase 2, every screen;
`fire` the burning cars and the wreckage; `smoke` what is left. The neon goes out with the piece it hangs
on. His phase 3 puts the screens and the neon out: only the fires light the street. The asphalt is a calm
floor of sparse dim strokes with the lane paint and the crosswalks carved into it (the slabs that carry
paint are cut finer so the stripes read); the towers' fronts carry rows of windows in their carved colour.
Rain is one-cell glyph particles. Two point lights of its own, at most.

### The look switches (2026-11-16, ADR-122)
Every new look and every redraw of this pass was shown to the owner as two or three options on one
rendered sheet, behind a URL switch (`duelist/lookSwitch.js` `lookOf`; COMBAT.md / ARCHITECTURE.md
name the code). **The owner picked on 2026-11-16, and with no parameter the game draws the picks.**
The losing options stay behind their switches (as ADR-118 and ADR-119 left theirs). By convention `0`
is the look as it was before the option existed, `a` its author's proposal, `b` and `c` the others.

| Switch | What | `0` | `a` | `b` | `c` | Shipped (the owner's pick) |
|---|---|---|---|---|---|---|
| `?kindle=` | the Kindling (Shen Hui, phase 2) | - | a fire front and a gout off the blade | an ember storm | an air ripple, then fire | **a** |
| `?ashp3=` | the change into phase 3 (Shen Hui) | - | the wind takes him: torn off downwind as ash and re-formed | a whirling column of ash that bursts over the yard | the fire burns out: a last ring of fire, then ash like snow | **a** |
| `?qi=` | sword qi, the crescents (both bosses) | as before | a body and a wake | a standing blade of wind | low along the floor | **a** |
| `?flit=` | the flit (Shen Hui) | as before | a ghost where he left, a stream of ash crossing, motes drawn in | - | - | **a** |
| `?burn=` | burning ground (Shen Hui) | - | a glowing seam on the stones, embers, a wisp of smoke | a thinner seam with a fringe of short red tongues | - | **a** |
| `?toll=` | the bell's rings of sound | bronze `)` arcs | a ragged front of steel at waist height, a trailing row | the same over a low warm heat | - | **a** |
| `?star=` | the Dark Star | as before | a starless sun (dark heart, ragged violet corona, dust drawn in) | a hole of blacked-out cells (takes a tint zone) | - | **a** |
| `?sky=` | a strike of the Starless Sky | as before | the sky answers inside the frame (a knot of the Void, a stepped leader, the bolt) | the floor answers (streamers climb to a bolt from the top of the frame) | - | **a** |
| `?ignite=` | a form's ignition (the Lord) | as before | each form its own sign, the crater answering | one nova, three strengths | - | **a** |
| `?void=` | the Lord's smaller things (blades of light, crescents, push, fissures, the blade, stones, Crushing Dark, gathers, blink, deathblow, death) | as before | redrawn in the field | - | - | **a** |
| `?presence=` | forms 2 and 3: a quiet presence | off | the off blade's light and embers; the staff's ends trailing | - | - | **a** |
| `?great=` | Starless Night's waves | - | the dark tide (a violet wall, a red seam on its front) | the sky's edge (standing white strokes, lightning off it) | the floor answers (dust and chips along a red seam; the costliest: fire field peak 4942 of 6000) | **a** |
| `?floor=` | a broken floor slab (both arenas; read when the level is built) | - | rubble on printed earth | heaved into a low mound of brighter shards | - | **a** |
| `?chip=` | bites: a blow takes the bricks of a piece where it struck (every level; read when the level is built and at each blow; ADR-132; Lab: WORLD -> Bites) | pieces wear down in stages and break whole | the bricks under the blow fall as their letters; a solid piece keeps a skin there, set back | - | - | **a** |
| `?cutStop=` | the hero's blade on a piece it does not fell (every level; read at each swing; ADR-177; Lab: WORLD -> Blade; with bites on only; values 0 / 1, and here `0` is the NEW default, `1` the feel before) | clean through: chips along the cut, sparks off stone, splinters off wood | `1`: it stops there (ADR-132: a freeze, sparks, a bounce) | - | - | **0** (2026-11-23) |
| `?marks=` | the floor's marks (every level; read per blow; ADR-177) | today's cracks and crater rims only | `1`: a mark of each blow's kind (slam, cut, thrust, dash, blast, beam, step) that stays until the reset | - | - | **1** (2026-11-23) |
| `?ashLook=` | Shen Hui's body (read when his rig is built) | today's figure | the dragon look (the wyrm's art path) | today's figure dressed by phase | both | **b** |
| `?lordLook=` | Varr Nihil's body (read when his rig is built) | today's figure | the dragon look | today's figure dressed by form | both | **b** |
| `?outskirts=` | what lies round the Obsidian Throne's crater (ADR-133; read when the level is built; `m` all of them) | the felled forest | the shrine the star fell on | the star's debris | those who came for him | **c** |
| `?ring=` | the Skybreak Ring's arena (ADR-129; read when the level is built) | - | the flats: a dry lake bed, banners, a drum, a gong, a judges' dais | the quarry: terraces of cut stone round the ring | the crown: the ring on a butte's top, the badlands 40 m below | **a** |
| `?ascLook=` | Tian Lei's body (read when his rig is built) | - | the tunic and the topknot | set aside, not offered (a bare-chested look too close to a franchise's) | the wandering monk and the braid; `d` = a through the wyrm's art path; the homages (2026-11-22, ADR-150): `h` an orange gi over blue, blue wristbands, sash and boots, black spikes turning gold; `g` a purple gi and red sash, form 3 the swept-up gold hair with one lock over the brow and a torn sleeve; `v` a blue bodysuit, white chest armour, gloves and boots, a tall flame of hair; the gi with wraps (2026-11-23, ADR-155: h's cut, wrapped forearms and shins, soft boots, a dark undershirt, longer sash tails): `e` ember, a burnt-red gi, black for the blue, off-white wraps; `r` a crimson top over charcoal trousers; `w` bone, an unbleached gi, black sash, charcoal wraps | **e** (2026-11-23; was h, before that a) |
| `?ascLift=` | Tian Lei's print (read when his rig is built) | as the body shipped | lifted: a lighter fill, a stronger edge of light | the hero's quieter print (ADR-155): darker letters, the pale skin held down, a softer edge (`ASC_QUIET`) | - | **b** (2026-11-23; was a) |
| `?ascLetters=` | Tian Lei's letters (live) | the bosses' fixed fine cell (4 px below 4K) | they follow his size on screen as the hero's do (ADR-155; the kit's `letters`) | - (rendered, not kept: bolder, 0.144 m a letter) | - | **a** (2026-11-23) |
| `?ascHair=` | Tian Lei's gold hair, forms 2 - 3 (read when his rig is built) | the tall crown (one and a half heads above the scalp in form 2, two in form 3) | a short crown: the same layout at ~60 % | his own form-1 spikes risen, flame-shaped, about his own hair's height; form 3 sharper with one lock over the brow, no taller (ADR-155) | - | **b** (2026-11-23)
| `?ascAura=` | Tian Lei's aura (forms 2 and 3) | - | a tall flame, hollow behind him, a wheel of light on the floor | a tight sheath with streamers off the shoulders | a broad low blaze over a wide spinning wheel | **a** |
| `?ascBeam=` | Tian Lei's beam | - | a column | a braid: two strands winding round a thinner core | - | **a** |
| `?ascOrb=` | Heaven's Lantern, Tian Lei's great orb (the third wave, 2026-11-22) | - | a sun: a round ball of gold heat, a pale heart, letters orbiting it | a lantern: a bright rim round a dim heart that pulses, trailing motes | `c` the pale gathered sphere: steel-kind heat (near white), drawn as large as its hit, both arms straight up in the gather (a reload for the pose) | a (the author's; not yet picked) |
| `?ascBeamPose=` | Tian Lei's beams (2026-11-22, ADR-150; read when the moves are built) | the palm thrust | - | - | `cup`: both hands cupped at the hip, a ball of light between the palms (`fx.cupCharge`), both palms thrust together; the clash held with both cupped hands | 0 (not yet picked) |
| `?foxLook=` | Wen Yao's body, bare-handed (ADR-147, ADR-154; read when his rigs are built) | - | the Shrine Fox (art path): the bone mask, a short robe with its sleeves tied back, the fur stole, the sash | the Wild Fox (art path): an amber sleeveless jacket, a vermilion scarf, a dark red-brown crest, a half-mask at the temple | the Pelt Brawler (art path); `d` = a in the ink-line art; **`h1`** (the default) the Wild Fox in the hero's INK-LINE art, bright: a big russet crest with pale tips, a short open amber jacket, dark trousers, pale wraps, a long vermilion scarf; `h2` a vermilion jacket, a black scarf; `h3` a long pale coat lined in vermilion | not picked yet (h1 drawn) |
| `?foxLetters=` | his ink-line letters (ADR-154; live) | - | a fixed cell, as every boss's | b (the default): they follow his size on screen as the hero's do (`kit.letters`) | - | not picked yet (b) |
| `?foxfire=` | the Pearl's colour: the orb, its threads, Pearl Rain (read when his effects are built) | - | jade (a palette swapped into the void slot) | the wyrm's orange fire | **pale blue-white** (`FIRE_PALETTES.pearl`, the default since ADR-154) | not picked yet (c) |
| `?foxFire3=` | phase 3's fire: the mantle, the tail, the pounce, the selves burning up, the Nine-Tailed Fox and its beam (ADR-154) | - | **the wyrm's orange-red** (`K_FIRE`, the default) | jade (the void slot turned to foxfire; an orb on that slot moves to the steel kind) | - | not picked yet (a) |
| `?foxSpirit=` | the Nine-Tailed Fox (ADR-154; read when it is built) | - | **a body in the wyrm's art path** wreathed in fire (the default) | fire-field heat and ink lines only, no mesh | - | not picked yet (a) |
| `?clones=` | his paper selves (read when their rigs are built) | - | identical to him | a step paler | - | not picked yet (a) |
| `?bamboo=` | the Windless Grove's bamboo (ADR-151; read when the level is built) | one kind of cane, scattered | five kinds of cane mixed in fanning clumps, shoots, fuller crowns, the back filled, the wall to 50 m | the same, one kind of cane per clump | - | **a** (the owner's pick, 2026-11-22) |
| `?grove=` | the Windless Grove's light and ground (ADR-145; read when the level is built) | - | a moonlit night with mist | grey dawn fog | first snow: pale litter, frost on the stalks | **a** |
| `?sheathLook=` | Lu Wusheng's body (read when his rig is built) | - | Mourning White: undyed hemp, a white brow band with two trailing tails, hair in a knot | Reed Cloak: a shaggy straw rain cape, a cloth over the lower face | One Sleeve: a dark robe off the sword arm, the bare arm bound in cord, short grey hair; `d` the Wanderer (added 2026-11-22 at the owner's ask, an option): a slighter man (drawn 7 % smaller) in a faded indigo robe over wide charcoal trousers, a long sand scarf with trailing tails, dark hair in a high tail | **d** |
| `?drawCut=` | the Sheathed's draw (ADR-145) | - | one white line | the line and an afterimage of him where he stood | - | **a** |
| `?life=` | the living world (ADR-163; every level; read at load, the Lab's `life` row flips a piece live): `off`, `all`, or a comma list of `wind, litter, steps, weather, creatures, air, arrival, answer` | `off`: today's world, untouched | - | - | - | **all** (the owner's pick, 2026-11-23) |
| `?lifeK=` | the living world's strength, 0.25 - 2 (rates and amplitudes; Lab: `life x` quiet 0.6, natural 1, strong 1.5) | 1 (as tuned) | - | - | - | 1 |
| `?oneLook=` | Xin Yi's body (ADR-156; read when his rig is built) | - | the Long Coat: black, closed in phase 1, open from phase 2 (the tails fly) | the Cassock: buttoned to the neck, narrow, floor-length, bright buttons | the Grey Coat: a's cut in dark blue-grey with a white-jade edge | not picked yet (a drawn) |
| `?oneLetters=` | Xin Yi's letters (ADR-170; live) | the bosses' fixed fine cell (4 px below 4K) | they follow his size on screen as the hero's do (the kit's `letters`, Tian Lei's getter) | - | - | **a** (2026-11-23, "Print a") |
| `?onePrint=` | Xin Yi's print (ADR-170; read when his rig is built) | as he shipped: lifted (ink gains 1.6: his jade edge full at any distance; skin fill lifted; a glowing glint; inner seams; the glasses' arms and bridge, two collar faces, lapel facings) | the hero's quieter print: every ink / rim gain <= 1.5 (the edge fades with distance), the jade edge at 0.55 of 0, no far line, the skin at `HERO_INK.skin` (its fill x 0.62), no glow; simpler shapes (the glasses one dark band, one collar, a flat shirt V); the coat stirs from phase 1 and its panels are clamped (75 deg out, 20 in) | a, and one letter cell bolder on him on a frame under 540 px tall (the phone: `kit.letterBias`) | - | **a** (2026-11-23, "Print a") |
| `?hall=` | the Hall of Falling Script (ADR-157; read when the set is built) | - | pale marble, green-black inlay | dark basalt, jade-lit edges | - | not picked yet (a drawn) |
| `?script=` | the script wave's strength by scene (ADR-157) | - | a shimmer (0.2) and the full turn in the Source | nothing until the Source | strong (0.5) from the start | not picked yet (a drawn) |
| `?sheathArt=` | Lu Wusheng's print, five graded steps (ADR-152; read when his rig is built; `1` - `a` wear his reworked body) | the wyrm's digits and his body as he shipped | `2` the digits in his palette, lit and outlined harder; `1` the same, dimmer | `3` the ink-line art flattened: no fold or crease lines, no glints, half the rim; `a` the hero's ink-line art, lifted | - | **2** (the owner's pick, 2026-11-23, of five; `a`, the pick before, read as a 3D model at fight distance) |
| `?sheathTone=` | the Wanderer's palette in the ink-line art (ADR-152) | - | indigo and sand: a faded indigo robe, charcoal trousers, a sand scarf | pale and cold: a bone-white robe, slate trousers, a blue-grey scarf | moss and rust: a moss-green robe, dark brown trousers, a rust scarf | **a** |
| `?sheathMark=` | a mark of his own (ADR-152; the Wanderer only) | none | a long torn strip of unbleached cloth tied below the scabbard's mouth: it trails when he moves, snaps on the draw | a white streak from the left temple through the high tail | - | not picked yet (a drawn) |
| `?halLook=` | Halcyon's body (ADR-161; read when his rig is built; ink-line art) | - | a deep blue armoured suit, a long red cape, a gold belt and cuffs, red boots, dark slick hair, eyes two red points, pale neon seams, a plain gold clasp at each shoulder (the owner's answer) | the idol: a navy suit, gold shoulder pieces of his own shape, white gloves, a cape with a bright lining, blond hair | tomorrow's tyrant: black and chrome, a crimson cape, white hair | **a**, the owner's pick (2026-11-23) |
| `?halCape=` | Halcyon's cape and colours at game size (ADR-164; read when his rig is built; graded steps) | `0`: as first built | `1`: a clean red cape inside and out, a brighter blue suit, a bigger gold that prints gold | `2`: + the cape wider, spread off the shoulders so it frames him from the front, longer | `3`: + a gentle billow while he hovers, a longer trail in a pass (the default, recommended) | **3**, the owner's pick (2026-11-23) |
| `?halLetters=` | Halcyon's letters (ADR-166; live) | the bosses' fixed fine cell | his letters follow his size by the hero's rule (the hero's cell) | - | - | **a** (the owner's pick, 2026-11-23) |
| `?halPrint=` | Halcyon's print (ADR-166; read when his rig is built) | the step-3 print: a lit figure, a strong edge (rim x 3) | the hero's quieter print: the suit x 0.85, the skin x 0.62, rim x 1.5; the cape's red and the gold kept | halfway | - | **a** (the owner's pick, 2026-11-23) |
| `?halCapeSize=` | Halcyon's cape's size (ADR-166; read when his rig is built) | as picked (1.54 m) | ~80 % | ~65 % (1.00 m, past his knees) | ~50 %, to the back of his knees | **b** (the owner's pick, 2026-11-23) |
| `?glare=` | his eyes' heat: the beams, the eyes, the crimson screens (a palette swapped into the void slot) | - | crimson with a white-hot steel core | crimson alone | the engine's orange fire with a steel core | **a**, the owner's pick (2026-11-23) |
| `?city=` | Halcyon Plaza's light (ADR-159; read when the level is built) | - | Neon Rain: night, rain, wet dark asphalt, pale neon | Golden Hour: his perfect city at dusk, warm, no rain | Lockdown: red emergency light, two search beams sweeping the plaza | **a**, the owner's pick (2026-11-23) |
| `?gradeLook=` | the record screen's grade (ADR-179; `ui/recordLooks.js`; sheet `docs/looks/records/grade-options.jpg`) | - | the grade in block letters over its time, marks and the best before | the block letters beside those lines | the banners' plain `#` letters, the time beside | **a**, the owner's pick (2026-11-24) |
| `?recLook=` | the title's best under each level (ADR-179; sheet `docs/looks/records/title-options.jpg`) | - | a small line under each button: grade and time | the grade in the button after the name, the time on a second line | one line under the picker for the button the mouse or pad is on | **b**, the owner's pick (2026-11-24; sheet `docs/looks/records/title-shipped.jpg`) |

How a look is chosen (`lookOf(name, def, pick)`): a look forced live by `setLook` (the Lab, the tests,
the film rig); else the URL's own parameter (`?sky=b`); else, under **`?looks=old`**, `0` for every
REDRAW (`qi`, `flit`, `toll`, `star`, `sky`, `ignite`, `void`, `ashLook`, `lordLook`: the game as it looked
before this pass); the things that are new in this pass (`kindle`, `ashp3`, `burn`, `presence`, `great`,
`floor`) keep their pick, although `presence`, for one, was simply absent before (its `0` is "off",
reachable as `?presence=0`); else the owner's pick (the `PICKED` table); else the author's default. **`?looks=new`** (every
proposal at once, the way the owner played them on the preview) now draws the same as no parameter.
**The Lab's LOOKS section** (`?lab`, only in the Ashfall Courtyard, the Obsidian Throne, the Skybreak
Ring, the Foxfire Terrace, the Windless Grove and the Hall of Falling Script) has a row of buttons per switch: a switch read at draw time flips live, one read at build time
(`ashLook`, `lordLook`, `floor`, `outskirts`, `ring`, `ascLook`, `ascLift`, `foxLook`, `foxfire`, `clones`, `oneLook`, `onePrint`, `hall`, `script`) reloads the page with its parameter; "as
Ring, the Foxfire Terrace and the Windless Grove) has a row of buttons per switch: a switch read at draw time flips live, one read at build time
(`ashLook`, `lordLook`, `floor`, `outskirts`, `ring`, `ascLook`, `ascLift`, `ascHair`, `foxLook`, `foxfire`, `clones`, `foxFire3`, `foxSpirit`) reloads the page with its parameter; "as
shipped" clears every look parameter (the picks), "before this pass" reloads with `?looks=old`; there is
no "all proposals" button any more. Older switches of the same kind: `?flare=` (ADR-118), the wyrm's
`?ring=` and `?breath=` (ADR-119). **The Skybreak Ring's five** (ADR-129) are things new to the game, so
`?looks=old` leaves them at their picks. The owner picked arena a, body a, aura a and beam a on
2026-11-21 ("Your picks"); `ascLift` a (the figure lifted, against the body as it shipped) is recorded
in `PICKED` beside them. The losing options stay behind their switches; the bare-chested outfit was
removed. Note the name: the Skybreak Ring's `?ring=` and the wyrm's older `?ring=` (its shock ring) read
the same URL parameter; each level is its own page and only one of the two is ever drawn, so a value
set for one level does nothing visible on the other.

### The Skybreak Ring (2026-11-21, ADR-129; `world/skybreakRing.js`, `?level=ring`)
An open-air tournament ring on the badlands, wrecked by the fight; an original place. The camera looks
down at 58 degrees: the sky and the horizon are never on screen, so "the sky changes" means the LIGHT
changes, and what is seen is what it falls on.
- **The ring** is a square of sandstone tiles 30 m across (carved glyphs, the duel arenas' paving look),
  a kerb of long darker stones round it, an octagon of wedge plates at its middle; a bronze brazier on a
  stone post at each corner (the south two low: nothing tall stands south of the fight), flames in the
  fire field. **The paving is calmed on purpose** (the stage pass of 2026-11-21): on the first build the
  tiles' strokes were as bright and as busy as the fighters, who read small and dim on it (form 1, with
  no aura, worst). Now: no hatching on the tiles' sides, almost no crack lines, a fainter chamfer,
  sparser and dimmer top glyphs, a darker slab body; the joints stay. A figure's brightness against the
  floor round it (measured on crops) went from 1.98 / 1.23 / 1.66 to 3.27 / 1.73 / 2.54 by form at
  1280 × 720 (the phone's 852 × 393: 2.66 / 1.44 / 2.60 to 3.70 / 2.51 / 2.97). Cracks print in pale
  dust (`scarInk`), the earth under a broken tile is a warm pale dust (`EARTH`) well over the dimmed
  tiles, so craters and a wrecked ring read at the game camera.
- **The buttes** (`landmarks.js` `buildButte`, prop art): mesas of banded red-ochre strata
  (`BADLAND`) on an irregular footprint, steep stepped flanks where each band is a ledge that catches
  the light a shade apart from the next, a flat caprock that overhangs a little; 20 – 35 m from the
  ring, east, west and just past its north edge. A top that comes off leaves its foot. Slender hoodoos
  (a banded column narrowing to a neck under a cap stone) stand between them. The landmarks' gain is
  0.92 (it was 1.1: they read fairly bright orange).
- **The arenas** (`?ring=`, the owner's pick a): a the flats (a dry lake bed of cracked clay plates,
  deep red banners east and west, a war drum, a gong, a judges' dais, boulders, a few dead trees on the
  screen grid), b the quarry (three terraces of dark cut stone stepping up round the ring, stacks of
  blocks, a timber derrick), c the crown (the ring on the flat top of a butte, cliffs falling into the
  haze, rock spires rising past the rim, the badlands 40 m below; strokes of haze drift in the depths).
  At the fight camera, which shows about 23 m of ring floor, the three look nearly the same.
- **The light by his form** (the set's `ambience`): a clear **dusk** (warm, low from the west, long
  shadows), then **golden** (warmer, higher, brighter, a gold light round him that follows him, gold
  motes), then a **thunderstorm** (cold and dark, the moon high behind cloud, the fog closer, wind-blown
  dust, rain as glyph particles). A transformation eases the light over about two seconds. **Lightning
  is drawn by what it lights**: no bolt is drawn in a sky nobody sees; every 2.4 – 6.5 s the storm's
  flash raises the moon and the ambient light for a frame or two (now and then a second flicker), so
  the ring, the buttes and the fighters flare and fall back. `flare(k)` is the same flash for his great
  moments (a transformation, the great beam, a won clash), gold before the storm and cold white in it;
  `dim(k)` pulls the whole ring's light down through the great beam's charge.

### Gold in the fire field (2026-11-21, ADR-129)
Tian Lei's energy is GOLD, and the fire field has four kinds and no gold (`fire`, `void`, `steel`,
`smoke`). The Skybreak Ring **swaps the void slot's palette** for `FIRE_PALETTES.gold`
(`FireField.setPalette('void', ...)`, as his effects are built): on this level every void blob prints
gold, the Lord's inherited draws included, and the heat haze beside it turns gold (`uHazeVoid`). Not a
tint: the field's `tint` dyes only steel, inside two screen ellipses, for a moment (ADR-118), so it
cannot make a body of heat gold; and not a fifth kind: the heat buffer's four channels are taken (fire,
smoke, void, steel). The Lord never fights on this level, so his violet is untouched. The palette is
energy, not fire: an amber rim with no red in it, a gold body, a pale yellow-white heart; it boils faster
and climbs far less than flame (a blast stays a ball, a beam a beam; what rises is made to rise). The
inherited draws' violet lights and glyph colours are turned gold (storm white while lightning draws),
and every scorch his effects leave keeps 12 % of its glowing heat: his energy chars the floor, it leaves
no red-orange glow (that read as fire).

### Tian Lei's figure (2026-11-21, ADR-129; `ascendant/gear.js`, `look.js`)
- **Drawn in the hero's ink-line art**, as Shen Hui and Varr Nihil are (`buildHero` on the hero's
  skeleton, the hero's animator), 1.12 × the hero's size. The owner's pick, outfit a: a sleeveless
  crimson tunic with a crossed collar and a short split skirt, a black sash whose tails fly, pale grey
  trousers gathered into off-white shin wraps, soft boots, wrapped wrists. No weapon: the right fist
  hangs on the sword joint. Option c (a slate-blue monk's robe, prayer beads) and d (outfit a through
  the wyrm's art path) stay behind `?ascLook=`.
- **Hair by form**: a topknot and a short tail (form 1, dark); the knot's hair risen into a gold plume
  lit from within (form 2); the plume taller and sharper, spikes swept back from the temples and the nape
  (form 3). Form 2 also lays a line of gold along the tunic's collar and hems, the wraps go pale gold,
  light at the wrists; form 3 the fists and the eyes burn and the tunic is torn off his left shoulder.
  One big change of silhouette (the head above all) or one line of light a step; the gold breathes,
  slowly in form 2, a faster, harder flicker in form 3. The change shows with the transformation's
  nova, not at its start (`dressPhase`).
- **How dark hair avoids the gold ink line**: the `hair` part's ink lines are gold on every rig, so his
  dark form-1 hair is built on the `shirt` material (white ink lines) and only the gold hair of forms 2
  and 3 is on `hair` / `hairTip`. The light at his edges, fists and eyes is the rig's `flask` instance
  (never drawn as a flask on him): no new material, no new draw call beyond the switched meshes.
- **The lift** (`ASC_LIFT`; `?ascLift=0` = as the body shipped): on the ring's floor he read dim at the
  game camera, form 1 above all, so his instances' fills are lighter (the tunic × 1.4, the trousers
  × 1.5, the skin × 1.2, the sash × 1.8, the dark hair × 1.6) and the cool edge of light along his
  silhouette is × 3.2. It helps a little: the fighters are still small in the frame.
- **Printed like the hero** (2026-11-23, ADR-155; the owner: "the character is too detailed and is showing
  its flaws in 3d. make it more ascii like, like the main character, to hide its flaws"). His letters
  follow his size on screen as the hero's do (`?ascLetters=a`; ARCHITECTURE "The bosses' letters"): at
  1080p and up he had twice the hero's letters across him, which drew his limbs as shaded tubes; now
  both are 6 px at 1080p, 8 at 1440p, 12 at 4K (the phone and 720p were already the same 4 px). His
  print is the hero's quieter one (`?ascLift=b`, `ASC_QUIET`): the cloth a little darker, the pale skin
  held down most (it printed as a lit 3D shape), the edge of light × 1.5 (was × 3.2). The gold hair of
  forms 2 - 3 is his own hair risen (`?ascHair=b`), about as tall as his dark form-1 spikes, not a crown
  one and a half heads tall, and form 3 is no taller than form 2. He wears the gi with wraps in ember
  (`?ascLook=e`): the gi's cut, a burnt red with black where the blue was, cloth wraps on the forearms
  and shins, soft boots: still a martial artist's gi, not his source's colours.

### Tian Lei's effects (2026-11-21, ADR-129; `ascendant/fx.js` `AscFx`, `fxBeam.js`)
Everything that strikes, glows or bursts is gold heat in the fire field, in the small letters; dust,
grit, chips and sparks are one-cell glyph particles. Look code draws from its own streams.
- **The aura** (forms 2 and 3; `?ascAura=a`, the owner's pick): a tall flame standing round him,
  tapering above his head, over a wheel of light on the floor. It is spawned BEHIND him as the camera
  sees him (0.7 m back toward the far side), so the field's depth fade hides the heat his body covers:
  it licks round his outline and never covers his limbs; it is hollow where he stands. Grit and small
  stones lift round his feet. Form 3: tighter, taller, brighter, with blue-white lightning crawling over
  him and snapping to the floor. About 60 – 160 blobs alive.
- **The beam** (`?ascBeam=a`, a column): a CORE written on the letter grid (lines one letter row apart:
  the middle ones digits, the outer ones bright strokes), a gold body of soft heat round it whose width
  swells in bulges that run out along it and whose edge boils, licks and sparks torn off it, the floor
  under it lit and charred, a bulb of light at the palm. **The core is white-hot only at its peak** (the
  first 0.1 s, strength above 0.85); held, the beam is drawn at 0.72 strength and its core shades yellow
  into gold (the owner called bright letters flashy before); it keeps its width as it dims. Everything
  held is re-drawn every frame on the one-copy clock, so 2.2 s of beam through slow motion never stacks.
  Before it fires, a dashed thread of gold on the letter grid runs from his lead hand along the line he
  has fixed (`drawSight`), and the light gathers in his drawn-back palm (`beamCharge`: motes drawn in, a
  growing bulb, coils of light, arcs to the floor late). Where it ends on a butte or a guard, a splash.
  In the clash the head grinds on the hero's blade and the light parts round it as the hero wins; a won
  clash splits the beam past him and it burns out (about 0.9 s). About 250 – 700 blobs a frame.
- **A blast**: a white-hot heart in a ball of gold, a short comet tail of strokes and heat, sparks; a
  charging one swells with motes drawn in. It bursts in a flash with a small ragged shock and a scorch;
  one that could only be cued too late goes out in a puff. The palm's flash as it leaves is gold (a white
  star there read as a cue). A blast is about five letter cells at the game camera.
- **The disc**: a thin bright ring seen at the camera's slant, turning, two white-hot notches running
  round it, a sheath of gold on its rim, the wake its rim leaves.
- **The vanish and the dash**: the shape he leaves is printed from his own body's points (the duelists'
  afterimage recipe, in gold: a hotter core down his middle, coming apart from the feet up, gold wisps
  rising off it), a streak to where he reappears, a puff at each end; form 1 pale dust, forms 2 – 3
  gold, form 3 a crack of lightning along the streak. A dash leaves a lighter afterimage.
- **A blow's trail** off the striking limb: form 1 a faint pale smear and dust, forms 2 – 3 a gold
  streak (a white edge in form 3). A heavy blow on the floor: dust, chips, the cracks lit a moment, a
  ground shock; his aura's burst: a flash off his body, a front of gold heat, a crisp ripple at his
  waist, strokes thrown out.
- **The transformation**: through the 2.3 s windup energy is drawn in along the floor, stones and grit
  lift all round, a column of light builds behind him, cracks of light run out round his feet (form 3:
  lightning snapping round him); then the new form stands in a pillar of light 9 m tall (form 3: 12 m)
  that burns about 0.9 s, a shock ring, lightning along the floor (form 3: bolts out of the sky round
  him), stones and sparks thrown out. The pillar's peak blooms white: keep it short.
- **Cost** (headless; frame rates were not measured): the fire field's worst case, form 3's aura with
  the great beam, ten blasts and a strike, 2863 of 6000 blobs; his fights by the AI peak about 1525.

### The Foxfire Terrace (2026-11-21, ADR-147; `world/foxTerrace.js`, `?level=fox`)
A moonlit hill shrine under the default night. The paving's slabs are cut to the circle and a kerb a
tone lighter draws the rim (whole squares picked by their centre read as a ragged edge). An animal
landmark reads at the game camera in PROFILE (the great fox, the small stone foxes facing each other
across the terrace): seen from the front and above, a fox prints as a lump; a flat thing (the spirit
gate) faces the camera. The gate's dull red is the strongest hue in the set, dulled once; the charm
posts' paper strips are faint at 30 m.

### Wen Yao's figure (2026-11-21, bare-handed 2026-11-22, ADR-147; redrawn ADR-154; `thousandFox/gear.js`, `bodyArt.js`, `look.js`)
**Since ADR-154 he is drawn in the hero's INK-LINE art, not the wyrm's** (the owner: "its hard to see the new
boss character. make it look detailed like the main character"): in the art path he printed as a thin
dark figure with a few orange digits beside a hero who is a dense body of letters. `?foxLook=h1` (the
default): the Wild Fox, bright: a big upswept crest of russet hair with pale tips (a third of the head's
height over the skull, so it reads at 34 px), a short open amber jacket with short sleeves over a dark
shirt, dark trousers, pale wraps on the forearms and shins, a long vermilion scarf (a bulky red collar
from the front, its tails streaming level behind him when he moves), the fox-tail charm; no mask. `h2`:
a vermilion jacket, a black scarf. `h3`: a long sleeveless cream coat lined in vermilion (its skirt rides
the coat springs). Ink-line lessons: only saturated fills past 1 print bright (the jacket is
`[1.22, 0.52, 0.045]`, the scarf `[1.3, 0.08, 0.03]`); a pale grey fill prints mid-grey (h3's coat is a
warm cream); the hair parts draw GOLD ink lines for every boss (`HERO_INK`), and a gold outline round a
russet crest read as blond spikes, so his crest is the `welt` part and its tips `hem`. Nine materials a
rig (the art path's b: twelve): 76 → 73 draw calls on the level. His letters follow his size on screen
(`?foxLetters=b`; ARCHITECTURE "The bosses' letters"). The art-path outfits a - c and d stay behind the
switch; what follows describes them.
A bare-handed fist fighter: the right fist on the sword joint with its knuckles wrapped (Tian Lei's),
the forearms bare and wrapped, the left hand open, palm up (`PALM_TURN`). Flat facets with a few tones
far apart; the big dark cloth on a low gain and a soft key (`dark()`), the bright colours on `loud()`.
`?foxLook=`: **b, the Wild Fox (the default the fight draws; the owner's pick still open)**: a short
sleeveless burnt-amber jacket with a stand collar over a dark undershirt, near-black trousers, wrapped
shins, an untamed crest of dark red-brown hair swept up and back, a kitsune half-mask pushed to the
side of the head, a long vermilion scarf streaming behind (the `fox.back` item), a fox-tail charm at
the hip: the loud figure the homage asks for, and none of the character's protected signature (no
black shoulders, no forehead plate, no whisker marks, no emblem, the hair not blond; amber prints near
orange at the game camera: a vermilion jacket and an amber scarf is a one-line swap in `bodyArt.js`).
a, the Shrine Fox: the bone mask over face and crown, a shorter robe, the sleeves tied back by a
vermilion cord across the back, the fur stole, the sash. c, the Pelt Brawler: a quilted russet jerkin
laced in vermilion, a fox's head on the left shoulder with its pelt cape, the mask on the brow. d: a in
the ink-line art. 37 / 49 / 50 / 49 meshes a rig (b a c d; Shen Hui's 82): his rig is built six times.
`?clones=b` mixes every part of a self 30 % toward paper with a light floor (`look.js` `PALE`). In the
art path at 720p he is still about 12 letter rows; b survives it by its colour, d reads clearest.

### The fox's effects (2026-11-21, bare-handed 2026-11-22, ADR-147; `thousandFox/fx.js` `FoxFx`)
- **Foxfire is a palette** swapped into the fire field's void slot (`FIRE_PALETTES.foxfire`, jade: dark
  green strokes, jade digits, a mint heart, not white; `?foxfire=c` `moon`; `?foxfire=b` draws as the
  wyrm's `fire` kind with no swap). Both palettes lick 0.5 and erode 0.85, so the Pearl stays a ball
  and the fox spirit's ears and tails keep their shape. The inherited draws' Void violet (a light, a
  spark) is turned to the look's colour (`_light`, `_spawn`), as AscFx does for gold: the black cue's
  sparks are jade on this level (the black dye itself is the engine's).
- **The Pearl in his palm** (redrawn ADR-154: "The palm orb is small at the game camera"): about 0.9 m
  across at the end of the charge, a ball of pale blue-white heat (`FIRE_PALETTES.pearl`, moon a step
  bluer: a white light bloomed it into a glare, so its light is soft) with a small white heart, its
  surface points turning round a tilted axis, three crisp SPIRAL ARMS of ink winding from past its rim in
  to its heart, two wide arcs of wind turning the other way, threads of light pulled in from the air,
  curling as they come; the self at his side shaping it with him, the threads from the selves (not the
  twin's: it shapes its own) stopping short of it. **The drive:** a short blast along his facing and a
  DRILL, two ink strokes winding round his line (a helix); the burst is a SPIRAL (every blob thrown out
  turning the same way round, three arms of ink winding out over the floor). **Pearl Rain** keeps the
  flight, ADR-052's ground specks, the rim of `·` once it has cued, and the burst. **The Moon-Swallowing
  Pearl** is giant (about 2.2 m) and rises over his head as two selves lift it with him. Sound: a quiet
  rising synth whirr (`sfx.js` `pearlWhirr`) as he shapes it.
- **Phase 3's fire** (`?foxFire3`, ADR-154): the mantle, Burning Tail's sweep, the pounce, the change's roar
  and the selves burning up into him are drawn in `FIRE3` (the wyrm's orange-red by default), the same
  fire as the Nine-Tailed Fox and its beam; the Pearl keeps the orb's colour.
- **A pack body appearing** (`packPuff`): a puff of smoke round it in the air, ten one-cell paper slips
  thrown out of it, a crisp ring of ink opening on the screen's plane, a wisp of the orb's fire (~22 blobs:
  five come at once in a Round).
- **The Nine-Tailed Fox** (Heaven-Devouring Howl; `spirit.js`, `fxBeam.js`): a creature, so a body in the
  wyrm's art path (`?foxSpirit=a`): low-poly, flat facets. THE HEAD IS THE SUBJECT (the second pass, the
  reviewer: "a fan of feathers, not a fox"): drawn 2.3x, a clean wedge in profile (skull, the brow's long
  slope, a long muzzle), broad pointed ears pale inside, a lower jaw that opens wide over a white-hot maw,
  long white-hot eye slits, pale fangs; the head and body charcoal (little of its fire's light on them)
  with a PALE throat and breast, so the head separates from the tails. Nine separate S-curved plumes
  fanned low and back behind it, a gap between each, burning (glowing veins), each tipped pale and with a
  bright blob of fire: the tails are the fire, the body is not. It stands SIDE-ON to the camera (facing
  east or west, whichever the line runs toward) and leans back toward it (a fox seen from the front and
  above prints as a lump: the terrace's lesson), drawn 1.1x tall; only the head turns (30° at most). He
  summons it 10 m from the hero (not at the far rim) and the camera leans toward it and keeps the ears'
  tips: at 1280x720 the head is ~250 px long and whole in the frame from every side. It goes up in
  embers from the tail tips to the body. `?foxSpirit=b`: the same head as an outline of steel ink, the
  tails as lines and heat, the body as heat only. The summoning's ring of script: two circles inked on the
  floor, one-cell glyphs of script between them. The dark sun (~2.3 m across): a black-dyed steel disc
  with a thick ragged rim of fire, pulled toward the camera, motes streaming in from the whole arena;
  the light drops to 0.72. The strip's mark: hazard specks heating. The beam: a bulb of light at the
  jaws, a five-line core (white-hot middle) on the letter grid, a body of heat five rows across its whole
  3.6 m whose edge boils, a white flash its first 0.15 s, a fountain where it meets the floor, the floor
  lit and charred and a scar of low heat that lingers a moment. COST: the fire field's peak through the
  Howl ~1600 blobs in the browser (2350 headless, the hero standing in it) of 6000; 72 → 81 draw calls
  with the fox risen and the beam lit (six materials, batched, no shadow).
- **The nine-tailed fox** (phase 3, `mantle(d, dt, k)`): a fox's head over his (tall ears, cheek ruffs, a
  muzzle over his face), a mane, and `d.tails` tails, each a lagging chain with a pale tip, fanned over
  a half-wheel laid in the CAMERA's plane (as the ears are spread: a fan laid in the scene merged into
  one blob seen edge on). The tails share one budget (thinner and cooler as they multiply, their roots
  left out from four up) and swing round with Burning Tail's sweep. Through a black blow the spirit
  stops shedding licks (the engine's charge is the cue). The change (`phaseBurst(3)`): a roar of
  foxfire, three ragged fronts, a gout out of the fox's head along his facing, a column, a gust through
  the grass. It reads as a fan of jade flame more than nine separate tails.
- **His blows' trail** (`sweep()` overridden): a short crisp streak along the fist's or the foot's path, a
  faint pale wash, foxfire licks when the spirit is lit, dust off a low kick; no blade arc.
- **The selves** (packs since ADR-154; a spawn is `packPuff`, in the air): a pop is 24 one-cell paper slips (16 when many go at once; half in the additive pool so
  they read on the paving at 30 m), torn-edge steel strokes, smoke, a wisp of foxfire; a spawn a tear of
  paper; the springboard's self tears UPWARD (30 slips) as he springs off it; phase 3's change burns
  them into him.
- **No steel echo ring** on a duelist's shock front: at his size it printed as an even white polygon.
  The foxfire front's scorch keeps 10 % of its heat (no orange glow under jade).
- **Cost:** the field's worst case in a staged phase 3 (nine tails, five selves, every move in turn)
  1596 of 6000 blobs, on the Moon-Swallowing Pearl, where the engine's black charge and flare alone take
  about 1500; the volley 1020, the drive 676.
- **Sound:** a short dry quiet paper tear on `dragon:clone` (softer for a spawn), synth, its jitter on
  sfx.js's own stream (never `Math.random`: a pop must not shift the seeded suite).

### The Windless Grove and the Sheathed (2026-11-22, ADR-145; `world/windlessGrove.js`, `enemies/sheathed/`)
- **The grove.** Bamboo is drawn through the prop art path (`paint(.., { flag: FLAG.ART_PROP })` on the screen
  grid): thin jointed canes 6 - 11 m tall (a ring at every joint, a bow toward the top), narrow drooping leaf
  sprays near the top; lone stalks and clumps in the clearing, a dense breakable belt round it, a static wall
  beyond. The Sword Grave: a low carved mound, forty plain blades planted at angles, the great sword
  (`landmarks.js` `buildGreatSword`, dulled) in the middle. A worn round of paving in the middle of packed
  earth (sector slabs in six rings), a stele, two stone lanterns, mossy boulders, a ruined pavilion (posts
  and a fallen thatch roof). Night: a cold low moon, pale green-grey fog; the default fireflies, mist and
  leaves (with the living world on, its layers draw them instead: fireflies that hang almost still, mist
  that pools low and does not drift, single bamboo leaves straight down; "The living world" below).
  `?grove=b` grey dawn fog, `c` first snow. The canes sway as the trees always have; while the living
  world's wind piece is on they stand dead still (the grove has no wind of its own: only the air of a
  blow, a roar's front or a burst, moves them).
- **His print, five steps (2026-11-23).** The owner found the ink-line print TOO detailed at fight distance ("reads as a 3D
  model": smooth shaded cloth, clean outlines; body flaws the digits hid) and asked for steps between it and the
  digits: `?sheathArt=0` the digits as he shipped (his old body), `1` the digits in his palette (`SHEATH_STEP` ink x
  0.42, the trousers and wraps a step darker, a stroke outline reaching in to fresnel 0.3 in a paler ink), `2` the
  digits lit and outlined harder (ink x 0.5, a light floor of 0.1, strokes to 0.12 in a near-white ink), `3` the
  ink-line art flattened (every cloth piece one piece: no fold or crease lines; no glints or fold shading; half the
  rim), `a` the ink-line art below. Prints `1` - `a` wear his reworked body (`sheathTuned`): full sleeves (no thin
  stiff arm, no gap at the side), the long robe, one deep roll of scarf, plain gaiters, no wrist bands. The owner
  picked `2` (2026-11-23); it is in `PICKED`. Measured at 1280 x 720 on the grove with its new bamboo (his pixels / the floor): 0 37.0 / 20.3,
  1 26.5 / 20.2, 2 36.1 / 20.3, 3 31.2 / 20.1, a 35.1 / 20.2 (the hero about 25 / 16).
- **His figure in print `a`** (the owner's pick before `2`; kept behind the switch) is printed in the hero's ink-line art (ADR-152, `?sheathArt=a`: the way
  the hero and Shen Hui are drawn; `?sheathArt=0` keeps the wyrm's digits he shipped in, `toDragonLook` with
  `SHEATH_ART[look]`). The Wanderer (body d) takes his palette from `sheathed/look.js` `SHEATH_TONE`
  (`?sheathTone=a|b|c`) and a lift (`SHEATH_LIFT`: the screen-left rim × 3, the scarf and the mark × 3.6): his
  fills sit about twice the prototype's, which printed him as dark as the grove's floor. Measured at
  1280 x 720 (the mean luma of his pixels / the floor behind him): 31.9 / 16.1 (the hero 25.2 / 20.1, the
  prototype 22.2 / 16.3); on the phone camera 45.4 / 16.5. His hair is printed on the `shirt` part, not
  `hair` (whose ink lines are the hero's gold: a gold line round dark hair read as light hair at 30 m). The
  black lacquer scabbard (`trim`, 0.025) stays the darkest fill on him, the drawn blade the brightest
  pixels (`armor`, `bevel`; mean luma 105 against his figure's 32). The silhouette, sharpened for the
  ink-line art, where the outline is what reads: a robe that falls loose to mid-thigh over the wide pleated
  trousers, open at both sides (`ROBE_TAILS`), never a short top tucked into them; a long high tail with a
  pale tie; the scarf's turns deeper and its ends wider, its tails close down his back when he is still;
  pale bindings at the wrists as at the shins. His mark (`?sheathMark=`): a: a torn strip of unbleached cloth
  (`piping`) tied below the scabbard's mouth, on springs on both scabbard pieces, snapped by the draw; b: a
  white streak (`facing`) from the left temple through the tail.
- **The draw in the fire field** (`SheathFx`): the stillness is a pinpoint of pale steel at the scabbard's
  mouth growing into a short thread (white, not a colour); the click is the blue FLARE at the mouth; the cut
  is ONE white-hot inked line (`_ink`, heat 1.8 cooling to 0.3 over 0.5 s) from the mouth to the blade's end
  and a thinner pale wake (0.5) for 10 m more; a hair-thin pale line hangs where the wake passed until the
  click, when the grove falls. A scabbard blow's trail is dull wood (`woodSweep`), never steel. The hanging
  cuts of phase 3 are lines of low heat on the ground, brightening toward their cut, then one white-hot line
  at waist height.

### The living world (2026-11-23, ADR-163; `world/life/`, `world/hang.js`, `?life=`)
One wind per level, and what lives in it: the grass and the trees lean and are swept by gust fronts,
leaves (ash, paper, grit) fall and lie, footsteps answer the ground, slow weather, small creatures,
banners and paper that hang in the wind; since ADR-177 flocks and small animals that flee the fight, a
set that shakes under heavy blows, smoke and dust that linger after ("A fight the world feels" below). On by default (the owner's pick, 2026-11-23; `?life=off` turns it off);
ARCHITECTURE.md "The living world" has the contract and every number. One mood per level, slow changes:
Cinderwood a night breeze in slow breaths and gust fronts that stir the meadow; Ashfall dry and fitful;
the Obsidian Throne nothing but a slow draw toward the star, which breathes; the Skybreak Ring a steady
plateau wind, dust devils and far dry lightning before the fight; the Foxfire Terrace a breeze in sighs
with real pauses; the Windless Grove holds its breath (no wind at all).

**The rules this pass learned** (each from a film that did not read, or from the owner's verdict):
- **The air is CLUMPS OF MANY TINY FAINT LETTERS** (the owner, 2026-11-23, on the first preview: "the
  ascii characters should also not be so big and be tiny feint and clearly many ascii characters clumped
  up"). Every letter of the wind and the weather prints in the house letter: one cell of the wyrm's
  pixel font (5 x 8 px at 720p, whatever its distance; `world/life/letterBatch.js`), dim, at most 0.5
  alpha (the drizzle 0.22). One letter alone is near invisible; the clump is what reads: a wisp of 64 - 96 letters, a
  mist bank of 160 - 220, a dust devil's column of 150. A shape that does not read gets more letters or
  a tighter clump, never bigger or brighter ones. Nothing is lit or laid over across the view: no band
  of light through the grass, no wave across the screen; a gust stirs the meadow in loose local patches.
- **A letter that must be seen ON ITS OWN has body.** At the game camera a thin stroke under about 0.3 m
  is one pixel of ink, so a lying, perched or flying thing (not the air) is a letter with body (`c e s v
  o ( ) < > = ~`) at 0.3 - 0.5 m, or it moves. A lying leaf is `c e ( ) v s` 0.36 - 0.44 m, never `, '
  \``; a firefly is a 0.55 m `·` (0.2 m was one pixel); a moth 0.36 m. A leaf in the air is smaller and
  fainter (0.28 - 0.36 m, alpha 0.72): it moves.
- **Dark on dark is invisible, pale on dark is a stray bright letter**: a creature on the night floor or
  against the crowns is a dull mid tone (birds in the air moon-grey, the hawk a dusky brown a little
  lighter than the floor), and its shape says what it is (a wingspan, a flap), not its colour.
- **Nothing ambient covers the hero**: lying letters fade out under his feet (0.32 - 0.7 m), mist banks
  clear round him (0.5 - 1.7 m), a wisp's letters fade inside 0.6 - 1.8 m of him (and none is born
  within 2 m), rain lands 0.8 m off him, dust devils keep 6 m off him, fireflies part from him.

**The wind.** The grass (and anything with sway: the trees' crowns, the old bamboo) leans along the
prevailing air in patches that travel downwind. A passing front stirs the meadow in loose local patches
(an uneven pattern riding the field's travel, so a patch comes and goes as the front passes; at most
0.24 of the blade, 0.22 on Ashfall and the Ring, half that in the fight) and flutters the blades there;
the grass never changes brightness. The crowns bend a little (0.28) and stir crosswise (0.08) as it
reaches the tree wall. **The wisps** are the wind's letters: thin drifts of 64 - 96 tiny letters
(`- ~ . , ' :` and a backtick; a `-` prints as whichever of `- / | \` runs along the wisp on screen), 1.8 - 3 m long
along the air (a front's 1.35 x that) and 0.16 - 0.34 m across, dense in the middle and single letters
at the ends, 0.45 - 1.3 m over the ground, at most 0.4 alpha in the level's own dim hue (grey-green,
the ash's grey, the Ring's dust, the Terrace's blue). A wisp rides the air (`wind.at`), stretches to
1.9 x its length and widens as it goes, its axis curling in a slow wave; each letter flows at its own
pace inside it and fades in and out on its own, so a wisp comes apart over its 5 - 8 s rather than
ends. A few in the breeze (a breeze's wisp has 0.65 of the letters), more where a front passes, fewer
between the front's patches. None on the Obsidian Throne (its air is the star's slow draw) or in the
Windless Grove. The bonfire's smoke, its embers, the default mist, leaves and ash ride the same air;
flames lean a little. Where there is little grass (Ashfall, the Ring) a front shows mostly in its wisps
and in what it carries.

**What falls and lies** (its own batch, one draw call): Cinderwood dark green and brown leaves `()ce`
(0.28 - 0.34 m in the air, alpha 0.72) off the canopy, thicker toward the clearing's rim, lying on the blades' tips in the meadow
(the soft depth test half hides them among the blades) and on the flagstones; Ashfall's ashfall as
before (`.,'\`` flakes) that lies as **flat strokes** `~ - = _` 0.34 - 0.44 m, turned along the screen's
horizontal, drifting in the lee of stones with clear floor between (a field of round dots everywhere read
as snow, or noise); the Throne a few ember-edged cinders `o c *` of the star; the Ring grit and seed
(`o : c` 0.20 - 0.26 m, `v ( ~` 0.24 - 0.30 m, alpha 0.62) that tumbles in along the ground from upwind
and piles against the kerb; the Terrace dry leaves (0.28 - 0.34 m in the air) and pale paper slips `= [ ]`
(0.30 - 0.36 m) round the charm posts; the Grove single bamboo leaves `/ \ ( )` (0.30 - 0.36 m) that come
straight down, turning, and lie as `( ) < >`. Every leaf and slip in the air is at alpha 0.72 (the
owner's verdict on the air: it was 0.38 - 0.5 m, 0.85 - 0.9); what lies keeps its body. A front lifts
what lies under it; a running hero kicks what is at his feet; a blow throws it.

**Prints and the trodden grass.** A step on earth or ash leaves a print: a dim stretched `0` lying on the
floor (earth 0.2 m, gone in 5 s; ash 0.3 m, darker than the ash, filling in over 14 s), turned to the way
he walked. The obsidian answers with a dim red glint (`'`, `*` or a backtick, 0.26 m, 0.75 s; before the fight only, so no red sits beside a red tell), never dust. Grass is TRODDEN (the
scorch map's blue): a run leaves a trail about 1.3 m wide where the blades lie flatter and darker (up to
0.7 darker), standing up over 10 s; a narrower trail was lost among the blades. Puffs: earth small and
low, sand a pale puff the wind carries off, ash a soft grey puff that hangs and sinks, stone a grit puff on
a sprint only; a wet step a tiny splash.

**The weather** (every letter of it in the house letter, in the weather's own batches). **Mist banks**:
soft low heaps of 160 - 220 tiny pale letters (`. , ' - : ~` and a backtick), densest at the heart and thinning to
single letters at the edge, spread over about 9 m along the air and 3.6 m across (x 0.75 - 1.15 a bank,
lengthening by a third over its life), 0.75 - 1.3 m up, alpha at most 0.5. Inside a bank every letter comes
and goes on its own 4 - 9 s beat (in, out, and back elsewhere in the bank) and streams 0.7 m along the air
while it is there, rising a little, so the bank rolls and thins instead of sliding as one; the bank
itself drifts with the air, comes in over 5 s, goes over 6 s and lives 18 - 28 s. A thin mist makes thin
banks (0.3 of the letters, half as bright), a thick one full ones; there is no veil under them any more
(the banks are the mist). Thicker in the tree line than the clearing; the Terrace's also round its foot;
the Grove's smaller (110 - 150 letters), pooled low and barely streaming. **The drizzle**: tiny dim
strokes, `|` falling straight, `\` or `/` when the wind slants it, three in ten a `'` or `,` (alpha
0.22). **The ash's squall**: a loose faint stream of tiny dim ember dots (`. '`) carried across the yard,
15 % of them a little brighter, in an additive batch; **the grey-out**: more fine ash (`. , '` and a backtick, alpha
0.42) hanging, the fog pulled in and greyed. The Terrace's cloud: the moon dims to 0.75 and returns. The
Grove's snow (`?grove=c` only): sparse `. ' *` (alpha 0.36) straight down. **The Throne's breath**: every
half minute or so the seal swells, a pulse of light runs out along the inlay and the cracks, a slow
column of tiny red motes (0.3 m: their light, not their size, carries the breath) rises over the seal and
over the crater round the camera, and the crater's dark warms; then a long stillness (the first breath
comes a few seconds after arriving). **The Ring before the fight**: dust devils, loose rising columns of
150 pale dust grains 5 - 7 m tall, a 0.55 - 0.9 m funnel at the top leaning downwind (alpha 0.32),
crossing the badlands and never the ring; far dry lightning drawn by what it lights (no bolt: the far
side of the sky, the ambient and the moon brighten for about 0.4 s, now and then twice), gone once the
boss is up.

**Creatures** (one letter each, re-drawn every frame). Fireflies, the one bright thing as before (a 0.55 m
`·` that blinks; the Terrace's foxfire paler and bluer and keeping 7 m off; the Grove's hanging almost
still). Small birds: a dark `,` perched on the crowns of the tree wall, drawn 3 m toward the camera so the
crown does not swallow it; in the air `v` / `^` 0.62 m, moon-grey, beating slowly, up and out of the arena
(never across the fight's ground). Ashfall's crows: `v` on the pillars, a dull grey sheen in the air. Moths
`v` / `^` 0.36 m, pale and lit warm by the fire they circle. The Ring's hawk: `-v-` (a body and two wing
letters, banked into its turn; `\` and `/` when it beats), circling high in frame until the fight, when it
climbs away.

**Cloth, paper and rope** (prop art with the `hang` option). A banner leans downwind about the bar it
hangs from, more the stronger the air (it barely stirs in a breath, a gust takes it), and a ripple runs
across it downwind; the ripple's slope turns the facets, so its letters change with the light and the
ripple reads face on. Paper is lighter: it lifts in a sigh and falls still in the pause. A rope and its
block swing as one. A felled, carried or thrown piece hangs still. The Ring's banners stream steadily, the
Terrace's charm strips flutter, the crater's banners barely stir in its draw; nothing hangs in Ashfall,
Cinderwood or the Grove.

**A fight the world feels** (2026-11-23, ADR-177; the owner: "animals running away as you get close to
them in the fight or a flock of birds flying away from the dragon blowing fire at it"; animals TINY, a
few letters). Everything below prints in the house letter (`LetterBatch`), dim, like the air.
- **Flocks.** A stretch of canopy holds 30 - 44 small birds (Ashfall's crows 9 - 15, the Terrace 12 - 22,
  the Plaza's pigeons 14 - 24). Fire, a heavy blow, a falling or burning tree or a roar near it, and they
  burst out over a second, climb, bank together and wheel away: a LOOSE, THINNING CLOUD of tiny
  moon-grey letters (`v` / `-` with the wingbeat, `-` gliding; alpha 0.72), never evenly spaced (each
  bird's place drifts on its own slow beat, so the shape stretches and curls), loosening to 2.4 x its
  size and thinning as birds drop out one by one instead of ending. ONE bird is near invisible; the
  flock's mass is what reads. The game camera never sees the tree wall from the arena, so a flock is
  ROUTED THROUGH THE TOP BAND OF THE FRAME (0.6 - 0.74 on a screen height of -1 bottom to 1 top), across and out the
  far side, never over a fighter (a letter that would print over the hero or the boss is not drawn).
  Ashfall's crows are darker, heavier and slower (`v ~ -`). A roost that went stays empty for the
  fight; birds fly back in after it (20 - 80 s).
- **Animals: two to five tiny letters, read by their GAIT.** They sit nearly invisible at the edge of the
  arena, never on the fighting ground, and bolt into cover when the hero or the fight comes near:
  Cinderwood's rabbits `0 '` (a hop, a pause, a zig; `- 0 '` in the air) and a herd of three deer, a
  long body `= =` with the neck up `/` and the legs under (`|`, `/` and a back-slash; long bounds); Ashfall's rats `~ c` (a low dart
  along the wall, one pause); the Ring's lizards `~ x -` (stop-start scuttle, a dusty mid tone that shows
  on the clay); the Terrace's one fox `~ = = v |` (long and low, the brush trailing, a steady trot, one
  stop to look back at the hero, a pale blue foxfire glint where its tail slips into the dark; once a
  visit). They come back 25 - 90 s after the fight, fading in only when the hero is far.
- **The set shakes under a heavy blow** (the tremor; power 0.7 or more, out to 3 power² m plus the blow's
  reach): trees shudder and drop a few of their own leaves from the crown, bamboo shivers, a thin TRICKLE
  of pale dust letters sifts off the top of a tall stone (each letter its own start and pull: a trickle,
  not a sheet) with a faint puff at its foot, what hangs swings away from the blow and rings down (a
  banner peaks about 12 degrees and is still in two seconds), pebbles hop a hand's height off the floor
  (grit `. , : o ; '`) a beat after the blow and lie a moment, the grass flattens outward where the blow
  made no gust of its own, the bonfire gutters (its flames dip and lean away, its light dims, a gust of
  embers).
- **What it leaves in the air** (the aftermath, gone at the reset, lingering after a victory): where fire
  burned out, a thin slow COLUMN OF SMOKE of tiny faint grey letters (`. , ' : ~ -` and a backtick, about
  130 a column, 2.4 - 3.4 m high) rises for 20 - 40 s, leaning and curling on the wind and thinning as it
  goes, with a few embers lifting off the hot early part; after a big blow (1.2 or more) a LOW HAZE of
  pale dust hangs over the crater for 6 - 10 s, densest low, drifting off downwind. Never on the hero;
  never a grey sprite.
- **What does not read yet** (honest, from the films): the crows on Ashfall (the flock does not read),
  a flock off a single tree (weak; a fire flush across the tree line reads at full size), the Plaza's
  pigeons (not seen); the animals at the game camera are tiny (the rat `~c` and the rabbit `0-'` read on a
  3 x crop, the deer is a small table, the fox `~==v`); the tremor's dust off the ruins, the pebbles, the
  smoke columns and the crater haze are faint at the game camera, the charms' swing too small, a tree's
  shudder subtle (the grass flattening reads most) and lost when the wyrm fills the frame; the banners'
  swing reads. Not checked on the phone; no film of the quiet after a victory.

**Tried and cut.** The hawk's shadow on the floor (a dark letter on the dark floor never read; dropped).
Dark grit on the obsidian (invisible: the star's cinders instead). Sparks orbiting the Throne's vents
(they said nothing the vents' own motes and embers did not; `perVent` 0). Black birds and a pale hawk (lost,
or a stray bright letter). The first pass at the subtle end: the front read as a slow lighter wash, a
lying leaf as a speck, the Throne's "all" as today; the visibility pass made the band and its lift
stronger, the streaks runs of strokes along the edge, the lying letters bodied, the leaves bigger, the
mist banks letters of their own. **Turned down by the owner (2026-11-23, the first preview)**: the
wind read as a wave taking over the whole screen, its letters too big (the rule above). Gone with it:
the front's BAND through the grass (laid over up to 0.9 of the blade and drawn lighter behind its edge:
`grass.lift`), the streaks (runs of 2 - 4 `~ = -` strokes 0.8 - 1.0 m tall riding the edge), the mist
banks of 36 - 46 big `~ - =` letters (0.5 - 0.75 m) over the atmosphere's wide faint veil, the drizzle's
long `|` streaks, the squall's 0.6 m HDR embers, the 0.42 m snow, the dust devils' 64 big letters: all
too big and too bright, laid over the view. Tried for the new air and cut: the world atlas's glyph
particles (below about 0.4 m a letter of the world atlas blurs to a speck, not a letter); the fire field (its smoke is the bonfire's, any heat it holds hazes the world
round it, and mist printed in it came out as dark-backed slabs). Still faint (open): the obsidian
glint, the Ring's far flicker, the moths, the ash's drifts against the paving's own strokes, the roar's
answer at the game camera on Ashfall and in the Grove; after the owner's verdict the drizzle may be too
faint, the Ring's devils need luck to be in view, and the Foxfire Terrace's calm shows little.

### The Hall of Falling Script and Xin Yi (2026-11-22, ADR-156, ADR-157; `world/scriptHall.js`, `enemies/wokenOne/`, `?level=code`)
"More extra ASCII" (the owner) is four layers INSIDE the game's letter systems: none of it is a pass over the
frame (a terminal post-process and one character grid over the frame were turned down: "Tried and turned
down"), and none of it touches the hero, the boss or the HUD.
- **The code palette in the fire field** (`FIRE_PALETTES.code`, swapped into the void slot by `WokenFx` as
  Tian Lei's gold is): a dark green rim, a jade body, a pale mint-white heart, no red; it boils fast and hardly
  climbs. Every effect of his prints in it (the shots and their trails, the bolts, the Bend's rings, the stop's
  stilled air, the afterimages, the transitions' rings, the front). Gold, violet and white glyphs and lights of
  the inherited draws turn green ONLY inside his own drawing methods; **tells keep their colours** (the white
  cross, the blue star, the red, the black eclipse): nothing green is ever a cue.
- **The falling script** (the set's ambience, one additive glyph batch, 320 at most, 140 on LOW): columns of
  one-cell digits falling down the walls' and the screens' faces near the camera's focus, a bright head and a
  dimming tail, out of step; in the Source all round the floor in the dark. `hold(sec)` freezes it (the stir,
  the fall).
- **The script wave** (`uScript` / `uScriptF`, materials.js `SCRIPT_GLSL`, read by the prop-art material and
  the carved floor's): inside every prop's own letters the source brightens in waves falling down the art
  pass's own letter columns (`SCRIPT_GRID`) and the hue eases to green, so the letters re-roll as a wave passes;
  on the floor the lattice's columns re-roll into digits. A front (the morph's ring) at full strength; deja vu's
  stutter shifts every prop's letters a cell sideways and back. Strength per scene by `?script=` (a 0.2 / 0.2 /
  1 for hall / dojo / Source; b 0 / 0 / 1; c 0.5 / 0.5 / 1). At strength 0 the same arithmetic runs as before
  (the whole addition behind the strength), and no other level sets it.
- **Things come apart as letters**: a piece of a scene lets go as a burst of one-cell digits in its own dim
  hue as the morph's front crosses it; a struck watcher bursts green; an unsent bolt drops as loose digits;
  the reload's guns clatter away as digits. Debris of the set's own pieces keeps their hue (a breaking stone
  never flashes green or white).
- **The set** (prop art throughout): the Pillared Hall (square pillars, wall panels, two lift doors, the entry
  arch, benches, planters; cold grey with a green cast), the Sparring Hall (wooden posts with arms, paper
  screens, racks, a low dais; two warm lamps), the Source (the ten slots as columns of stacked green blocks in
  the dark, no walls); identical suited watchers along the walls (12 in green code round the Source). `?hall=a`
  pale marble (a dark body: a pale albedo printed white) with green-black inlay; `b` dark basalt with jade
  chamfers.
- **His figure** (`wokenOne/gear.js`, `look.js`): the hero's skeleton and INK-LINE art (Tian Lei's way: the
  Fox's wyrm-art figure was hard to see). A black coat on a dark level is drawn by what rings it: dim
  green-black fills (near-black printed as an empty outline), the silhouette pale jade at every distance (his
  rows of the per-part ink tables, written by `dressOne`), a pale face and hands, the glasses a dark band with
  one bright cell. At ~40 px the homage is the silhouette: the long coat to the ankles with split tails that
  stream behind him when he runs (from phase 2), the high collar. `?oneLook=a` the Long Coat, `b` the Cassock,
  `c` the Grey Coat.
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
- **The stamp** (2026-11-22, ADR-149; `combat/impactStamp.js`): the hit printed IN the letter grid at
  the drawn contact, in the fire field's `steel`, so it is made of the same small letters as the
  bodies. A slit that grows, opens at its heart and splits into two thin lines a cell apart, then a
  few specks (light, sweep, cleave; the cleave longer, growing with the charge, with a cross); an
  entry mark and two rings for a thrust; a plus, an eight-point star and a ring that breaks up for
  the slam; a puncture and two rings for the execution. A crit x1.2 with the cross, cold blue. Human
  bosses only (the owner's pick: on the wyrm it does not read). The rules it was found by:
  - **Snap to cells.** One 12 px blob of steel per letter cell, centred on the cell, every offset a
    whole number of cells, re-snapped every frame through the shake. A blob 4 px off a cell centre
    keeps about 13 % of its heat: a soft line between two rows of cells all but vanishes.
  - **Rings are hexagons.** A run of `-` along the top and bottom, the sides one cell a step on the
    diagonal. A small soft circle on a 5 x 8 grid prints as a jumble of strokes.
  - **Stepped, not faded.** Each frame is held 0.04 s of fx time (it plays through the freeze),
    then the next replaces it. Calm: thin lines, one to three hot cells a frame.
  - **Ink on black.** Its cells print on black (a fire-field tint zone, `dark` 1), so it reads over a
    lit figure. **Never over the hero:** no cell inside an ellipse round his figure on screen; he
    stands in front of the wound. No cell below 0.7 m (heat by the floor fades into it).
  - The anchor is the contact pulled 2.5 m toward the camera (the field's soft depth fade dimmed heat
    on or inside the body to nothing; 1 m was enough on a man, not on the wyrm).
  - `?stamp=instead` draws it in place of the slash line and its cross (the sparks stay); the
    default draws both.
- **Calm at the contact** (2026-11-22, ADR-149; `combat/impactCalm.js`): the light at the contact is
  dimmed at the hit, level 1 by default (the owner's pick; `?calm=0` = as before, 2 and 3 calmer):
  the struck boss's white hurt flash and the hero's lit steel are what bleached the contact, not
  the cut's core. The arc is dimmed only near a fresh contact and only for the swing that landed.
- **The body answers** (ADR-149): the reaction's first pose shows in the frame the freeze holds, small
  enough that the struck surface stays 0.01 - 0.07 m from the drawn cut (`snapM` 0.06 on a duelist),
  so the cut, the stamp and the spray stay on the body; the swing to the peak comes after the freeze.

### The streak and a single perfect defence (2026-11-23, ADR-167; `combat/perfectFx.js`, `player/flurryFx.js`, `player/flurryBurst.js`, `player/streakFx.js`, `ui/streakCounter.js`)
The rule of the pass: **lines, not light**, and one idea a piece that grows by tier (a streak of 3 /
5 / 7 / 10 / 15), never a new effect per count. Everything that marks a moment is written in the fire
field's letters the way the impact stamp is (above): snapped to cells, hexagon rings, stepped frames,
ink on black, never over the hero.
- **The perfect marks** (sharp, the default; cinema): a perfect parry prints a short gold cross along
  the two blades round a hot heart, which snaps to a hexagon ring and breaks into specks (sharp: 5
  frames, about 50 blobs; cinema bigger, 9 frames, an echo ring). Each frame is held 0.04 s of REAL
  time (cinema 0.065 s), so a mark does not stretch in the slow motion round it. Tint zone 800101,
  gold on black; no cell below 0.7 m. A perfect dodge: the afterimage (his fine digits) stands still,
  one digit to a cell, for 0.1 s (cinema 0.3 s), then tears into its letters along the way he left;
  one clean line of cold steel from where he was to where he is (4 frames; cinema 5); cinema adds an
  arrival ring round his chest. The old blink streams are not drawn in these looks.
- **The burst levels** (`?burst=0..3`, the owner's 2): 0 the white bloom as before; 1 the lights and
  blooms halved, thin long lines on top; 2 lines first, the target and the hero visible through it; 3
  only lines, a blink of darkness round the star. Each hanging cut flares out thin to 1.35 / 1.6 /
  1.85 × its length for a few frames. The same level calms a storm cut's centre (on the wyrm the
  storm's centres stacked into a bloom).
- **The storm and the tiers' echoes:** a storm cut's arrival, bite and vanish are thinner the deeper
  into the storm, its afterimage the light one, its speed clone printed on the contact. At tier 4 every
  hanging cut gets one fine echo line two cells beside it in `steel` (heat 0.55, shorter at the ends),
  at tier 5 two, one each side; on the last blow they step away from their cuts in held frames and
  rings open where the cuts cross (the rings do not read yet under the burst).
- **The steel remembers** (aura, round 1): an edge line of the hero's cold steel up the blade from the
  forte (34 % of it at tier 1, the whole edge at 5), the blade's ink and rim lines held a little lit
  at rest (the flats stay dark, ADR-130), 1 - 3 fine echo lines inside a swing's arc, a wake of his
  own digits when he rolls, sprints or dashes, a few coat letters lifting at tiers 4 - 5. No new hue
  per tier: a little whiter at the top.
- **The fire rim** (aura, round 3; the owner: "a cool faint fiery aura very subtle but cool"): each
  frame his body is projected into the fire field's cells, the outline closed and the outside
  flood-filled; the rim is the outside cells touching him, one cell-sized blob each at heat 0.17, so
  the field prints a thin line of dim red strokes that hugs his figure (below about 0.15 the field's
  erosion tears it away). Each cell breathes on its own hash. The tiers change only coverage: the
  share of rim cells lit 0.36 / 0.5 / 0.66 / 0.8 / 0.92, the rim from 55 / 45 / 30 / 12 / 0 % of his
  height, tiers 1 - 2 on his back side only, tongues of 1 cell (tiers 2 - 3) or 2 (4 - 5) breaking off
  the top, a faint burning trail along the swings at 4 - 5. Never on the boss's side of him, never
  over him. The loss: every live blob turns to a puff of smoke in one frame, the edge line snaps dark
  and falls as strokes, his letters drop to the ground (6 + 7 a tier, 44 at most).
- **The world** (from tier 2): a short radial lean of the grass (weaker than any of the wyrm's
  gusts), a ring of the floor's own bits at his feet (grass motes, the courtyard's ash, stone grit by
  level), letters rising slowly at tiers 4 - 5. Calm and brief: no red, nothing on the ground that
  stays, nothing that looks like a warning.
- **The counter** (HUD, `?streakCount=lines`, the owner's pick): a small number in the HUD's font at
  the hero's chest, on his side clear of the boss: plain and dim at tiers 0 - 1, brighter with a thin
  underline at 2 - 3, thin strokes either side at 4, pale gold with longer strokes at 5 (13 - 17 px).
  It pops in about four frames with no overshoot and fades; never a glow, never a shake. A tier's word
  (TRIPLE ... THOUSANDFOLD) sits under it once, in small spaced gold capitals. A lost streak: grey,
  struck through in red, the digits parting as they fall. The flurry's banner at tiers 4 - 5 gains
  thin gold rules, never size.
