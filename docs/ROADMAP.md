# Roadmap

Vision (owner, 2026-11-11, ADR-059): a **wuxia skill boss rush** in the vein of Phantom Blade Zero,
with some exploring and RPG elements, presented entirely in a crafted ASCII look. Boss duels, each
testing one skill, reached from a bonfire through short approaches; wuxia combat and fiction (sects,
robes, wandering swordsmen), the Cinder Wyrm as the spectacle fight. **Fixed rewards**: each boss gives
a technique, weapon, ability or element that changes how the hero fights (no XP levels, no random
loot tables). Combat is readable and fair (clear tells; block / parry / perfect dodge), not a
stamina-gated pure soulslike. Built as browser vertical slices that are always playable. (The
earlier vision, an open-world RPG with MMO-style systems, survives as the online milestone, not next.)

Legend: `[x]` done · `[~]` in progress · `[ ]` planned

## M0 — Vertical slice: the Cinder Wyrm (v0.1)
- [x] ASCII rendering foundation (grid props, surface glyph creatures, glyph particles, fire light)
- [x] Forest clearing zone, bonfire, boss arena
- [x] Knight + wyvern boss fight, HUD, flow, procedural audio
- [x] Single-file build, headless tests

## M1 — Combat & presentation pass (v0.2)
- [x] Repo, CI, Vercel deploy, agent docs & history; protected `main`, PR-only workflow
- [x] Remove stamina; block (hold RMB), parry (tap RMB on impact), perfect dodge → Ghostep
- [x] Attack tell system: normal / blue (parry) / red (perfect dodge only) with clear indicators
- [x] Enemy posture bar, parry/posture break → open window
- [~] Approachable balance (needs human playtests; bot kills the wyrm in ~20 s of combat)
- [x] Lab / debug mode (trigger abilities, phases, god mode, slow-mo, hitboxes, timing trainer)
- [x] Anime-style (SAO-inspired) black-coat swordsman protagonist
- [x] ASCII-ify creatures and grass; more detailed stone ASCII; bigger dragon (×1.25)

## M1.5 — Look pass from the v0.2 review
- [x] Calm, world-anchored v0.1-style grass (no swimming ground)
- [x] Crisp surface-glyph hero and wyrm; moonlit outline on the hero
- [x] Visual-only tells: red glow + flash for dodge-only, white glint for parry timing
- [x] Lab Showroom preset for look-dev review
- [x] Hero after the Shadow Swordsman sheet (model, poses, slam finisher, lunge thrust, cyan FX)
- [x] Wyrm after the Obsidian Drake sheet, 1.5× bigger; player reach band; hero-first boss camera
- [x] Carved-glyph stones and half-sunk flagstones
- [x] Lab model viewer + builder specs from the sheets (docs/art)
- [x] Four-legged drake rebuild (art score 2 → 6) and closer hero (2.5 → 4.5)
- [x] Next look round: hero hair mass, the blade read from behind at the game camera, small
      details (straps, boots) — done in the reference match below (fuller mop, the blade drawn
      nearer from behind, kite greaves); straps unchanged
- [x] Owner approval; released as v0.3.0
- [x] Classic ASCII-art creatures (screen-grid conversion, owner's references); hero drawn bigger and leaned (ADR-017)
- [~] Phone support: touch controls, phone camera, Lab toggle (released; needs a real-device check)
  - [x] The right thumb's pad: three tiles that touch, slide between them, placed and sized by the player (ADR-096)
  - [x] The guard meter: blocks cost guard, not HP; parries and hits restore it (ADR-095)
  - [x] Played upright (portrait) as well as in landscape; see-through controls; a 70 px minimap on phones (ADR-097)
  - [x] An ASCII HUD: text meters, block-letter banners, no panels in play, a 40 – 72 px minimap (ADR-098)
  - [ ] Owner's verdict on the phone: the pad's default place and size, the slide's stick (10 px), the guard meter's numbers,
        how faint the controls are, the upright camera against the wyrm
  - [x] The hero's meters and the boss's never overlap: the top row is fitted to the screen (ADR-131)
  - [x] Two pad switches to try: PAD LAYOUT "guard on left" (one thumb cuts, the other parries) and HOLD ATTACK (ADR-131)
  - [ ] Owner's pick on the phone: which of the two becomes the default, where GUARD stands
  - [ ] Phone ideas not built yet (ADR-131 lists them): the game drawn under the notch (viewport-fit=cover), a
        drag-to-place layout editor, a left-handed mirror, an "add to home screen" hint for full screen on iOS
- [x] Owner approval; released as v0.4.0

## M1.6 — Reference match (2026-11-08, PR #4, `look/reference-match`)
- [x] Wyrm as the owner's red-black ASCII dragon: thin pixel font, letter sets, art source, shape (ADR-018)
- [x] Wyrm letters: fine digits in 5x8 px cells at 720p, calm tone, grid anchored to it (ADR-092, ADR-093)
- [x] Background objects in the dragon's look (prop art); the house style written down (ADR-100)
- [x] Landmarks: big set pieces per level, in the same look (ADR-100)
- [x] A second pass on the landmarks at the game camera: rebuilt as a few flat masses, moved to where
      the duel's camera looks (ADR-113)
- [x] Effects in the dragon's letters: the fire field (fire, void, steel, smoke), every boss's fire and
      spells on it, one set of timing cues, heat haze, letting go, shed digits (ADR-113)
  - [ ] The owner's look at it: the calm palette was built without their pick (C, hotter, is one number);
        the Lord's spells went from red to white and violet; the landmarks moved
  - [ ] The phone: the look at 4x6 cells and the frame rate (the bonfire and the braziers keep the
        field's passes running all the time)
  - [ ] The hero's effects (slash trails, parry sparks, `combat/clashFx.js`, `cutFx.js`) on the field,
        once the open work on those files has landed
  - [ ] A crisp red kind (a second heat target): the red cue, the red rings, the Lord's blade; and a
        blue-white kind if the wisps should join
  - [ ] Fire that hugs the ground (a per-blob switch for the 0.9 m depth fade) and a per-kind tongue
        height (bullets grow nine-cell tongues whatever their direction)
  - [ ] The throne hall's landmarks: pillars cover the wardens' lower halves, the great swords are
        small from the seal; the Lord's intro shot without the wardens beside the throne
  - [ ] The eroding edge of the dying wyrm: a cell is black for ~0.3 s before the ground shows
  - [ ] Headless checks for the text effects (the sims compile no shader): `uWyrmLetGo` follows
        `dragon.dissolve`; `uGlowRise` through the breath's windup; `fx.shed` on a landed cut
- [ ] The hero and the human bosses in the house style: only when the owner asks (ADR-100: "not touch")
- [x] Hero as ink-line art: per-pixel lines, a dark figure + halo at the game camera, longer drawn
      blade with a depth pull (ADR-019 … ADR-022)
- [x] Wyrm motion: flip-free rig, planted feet, the painting's resting display, idle life, strike
      lead, parry arc, weighted death (ADR-025)
- [x] Hero motion: world-planted feet, blade paths, portrait idle, new windups, two-step dash,
      sliding kneel, crescent trails (ADR-023)
- [x] Gameplay unchanged: hit-tested frames identical / within cm (ADR-024); `npm test` + build green
- [ ] Independent review pass on round 2 (stopped early; the dragon branches have no self-report)
- [x] Merged to `main` (PR #4, `8ce6aef`)
- [ ] Release (version bump, changelog heading, tag)
- Follow-ups:
  - [ ] Find the time / random leak that makes deterministic captures differ run to run
  - [ ] Stray `"` glyph particles left of the hero in a back view
  - [ ] Hero coat as one wide ragged drape with burn holes and blotches
  - [ ] Hero proportions, curved hair strands and wisps, face lines (nose, mouth, eye shadow)
        (proportions: the broad build in M1.7, then the lean build in M1.8; spiky pointed locks in
        M1.8; face lines open)
  - [~] Hero at the game camera: tone down the armour column and glow (still brighter than the
        reference), capitals that read as text; the halo over the wyrm's letters (M1.8: armour and
        blade glow toned down; still brighter than the reference)
  - [ ] Stronger strike key poses (needs a hit-volume decision, ADR-024); light 2 choreography;
        the knockdown's wide blade swing; re-run hero foot metrics on the wide idle
  - [ ] Wyrm sails at the reference angle and the far wing with the hero straight ahead
  - [ ] Boss camera in melee: the wyrm's head and wings sit off the top of the screen
  - [ ] Wyrm letter boil (temporal buffer), close-up scale LOD, fast single-frame jumps
  - [ ] Move the capture / per-frame compare tools from the scratchpad into the repo

## M1.7 — Epic wyrm fight (2026-11-09, `combat/epic-wyrm`)
- [x] Combo strings with a deflect chain: seven strings, a parry deflects a hit without ending the
      string, the last one recoils (ADR-026)
- [x] The plunge: a perfect dodge in range stabs down into the wyrm's head; slow-mo + crits in place
      otherwise; the execution on a posture break (ADR-027)
- [x] Three phases behind HP gates, staggered unlocks, a white-hot phase 3 that opens with the nova
      (ADR-028)
- [x] Fire spells on a pooled hazard system: meteor rain, eruptions, flame ring, flame wall, inferno
      nova (ADR-029)
- [x] Short flights: the burning pass, the sky dive, the hover barrage (ADR-030)
- [x] Broad hero build on the same bones; the blade depth-tested again; the coat yields to the steel
      (ADR-031)
- [x] Keep-in-view camera for the plunge and a flying wyrm
- [x] A deflect re-arms the parry at once (ADR-032); difficulty measured with bots, HP 4500 (ADR-033)
- [x] `npm test` + build green; merged captures at the game camera
- [ ] Owner approval of the PR preview; merge
- [ ] Human playtest of the difficulty (target 3–5 min for a player who knows the moves; a
      near-perfect bot wins in ~2.5 min)
- Follow-ups:
  - [x] Hero mass at the game camera (the skirt dominates); the low idle guard from behind shows
        only the point (M1.8: the lean build, the tails, the sword hung at his right side)
  - [ ] Coat-crossing frames near the hilt; the torn strips and streamers vs the blade; the block's
        free hand on the flat
  - [ ] A real tail thrust for the tail lash (a tail-raise control in the rig)
  - [ ] Widen the wing buffet's band; later string hits whiff a hero who stands still
  - [ ] A readable overhead claw at the game camera; a stronger deflect knock-back
  - [x] A red windup glow for the meteor cast (Armageddon's rear-up glows red, ADR-053)
  - [ ] Teach the probe bot to heal (its death rates are pessimistic)
  - [ ] Capture the phase-3 eruption chase

## M1.8 — Lean reference match (2026-11-09, `look/lean-hero`)
- [x] Look-dev: every reference angle at once (a live sheet incl. the gameplay camera), a
      turntable, a solid render through the ASCII pass, source and line looks (ADR-035)
- [x] Lean swordsman proportions measured on the six-view sheet (ADR-034, supersedes ADR-031's
      broad build); no bone, grip target or hit segment changed
- [x] Spiky hair of distinct pointed locks (crown, back layers, nape, sides, a jagged fringe)
- [x] Flared collar with a turned rim; layered spiked right pauldron; shaped upper back (yoke,
      four-point star, centre seam), baldric, two belts; banded calves
- [x] Coat as two tails split by a vent + narrow side panels + front panels (`skew`, `slant`,
      piping); the legs show from every side
- [x] The single-figure image's sword (barbs, notches, a guard swept up round a violet star gem)
- [x] The idle hangs the sword at his right side; near half-turns of the blade go round the front
- [x] Game-camera shading: a tight blade glow, quieter armour, readable lavender tails
- [x] `npm test` + build green; captures from every angle and the gameplay camera, every move
- [ ] Owner review of the PR preview; merge
- Follow-ups:
  - [ ] At the game camera he is still brighter than the scaled reference (mean luma 74 vs 55),
        mostly the one-pixel silhouette line
  - [ ] Fuller hair volume (the reference's mop is bigger); the dotted lavender rag along the
        tails' outer edges; face lines (nose, mouth)
  - [ ] Decide on the sleeve streamers (not in the new references)
  - [ ] Cosmetic FX draw on the shared `Math.random` (the seeded wyrm AI rolls on it): give FX
        their own stream
  - [ ] Move the headless capture harness (DevTools + `__tick`) into the repo

## M1.9 — Single-figure reference, round 2 (2026-11-09, `look/hero-reference-round-2`, partial)
- [x] Idle in the single-figure stance; the blade a low diagonal across his front (ADR-036)
- [x] Dot-matrix fill (3x3 micro-font, square cells), cel light, per-part silhouette ink
- [x] Pleated six-panel coat with drawn fold lines; four-ribbon torn cape
- [ ] Still unlike the reference (the session was stopped here):
  - [ ] Open, flared long coat with a few broad folds; the legs visible again from behind
  - [x] Cape as a wide torn sheet, not stiff ribbons (M1.10)
  - [x] Big hair mop, a tall winged collar (M1.10); [ ] face lines
  - [x] A jagged glowing blade, a layered pauldron with short blades (M1.10); [ ] dark legs with knee guards
  - [x] Darker masses (M1.10); [ ] sparse bright edge detail; blade angle ~44° (now ~37°)
  - [ ] Check the 36 m game camera in the grass, a phone, and the frame cost

## M1.10 — Blender-built hero parts (2026-11-09, `look/hero-blender-parts`, partial)
- [x] Headless Blender part pipeline: `npm run hero-parts` → `heroParts.js` (ADR-037)
- [x] Hair, collar, lapels, blade, cape and pauldron sculpted in Blender
- [ ] Still unlike the reference:
  - [ ] Coat as Blender-built panels: broad folds, long tattered tails
  - [ ] Face: brow, nose and jaw lines under the fringe
  - [ ] Arm and leg armour, belts and buckles as sculpted parts
  - [ ] The reference's density of small bright detail

## M1.71 — The living world (2026-11-23, `world/living-world`, ADR-163)
- [x] One shared wind per level (`world/life/wind.js`): fronts through the grass, the canopy, smoke, flames
- [x] Litter that falls, lies and lifts; footsteps by surface, prints, trodden grass
- [x] Weather in slow spells per level; small creatures that mind the hero
- [x] The sound of the air; the arrival shot; the world's answers to the fight; cloth and paper that hang
- [x] `?life=` / `?lifeK=`, the Lab's rows, `tests/integration/life.mjs`
- [ ] The owner picks the strength → the default goes on (today: off)
- [ ] Mist banks and dust devils a second look; ash drifts, the obsidian glint, moths do not read yet
- [ ] A banner's moon shadow leans with it; the far Throne banners
- [ ] Tuning blocks for levels added after this (they get the quiet default)

## M1.70 — The streak pass: an accelerating flurry, the streak on the hero, in the HUD and in the sound, a sharper perfect parry (2026-11-23, `combat/streak-epic`, ADR-167)
- [x] The core: `combat/streak.js` switches (`?streakfx=`, the Lab's 'streak' row), the tiers 3 / 5 / 7 / 10 / 15
- [x] The storm: a long flurry's later cuts each faster, every blow in its own frame (seven against the wyrm 1.52 -> 1.18 s)
- [x] The tiers, looks only: echo lines on the hanging cuts at 10 / 15, HUNDREDFOLD / THOUSANDFOLD FLASH
- [x] The burst as lines, four levels (`?burst=`; the owner's level 2)
- [x] A single perfect parry / dodge in three looks (`?perfect=`; the owner's sharp), the rules unchanged (game time measured)
- [x] The aura: the steel remembers (round 1), the fire rim (round 3); the world answers from tier 2
- [x] The counter beside the hero and the tier words (`?streakCount=`; the owner's lines)
- [x] The sound: the climb in the track's key, the loss, the drone (the owner's guqin on a minor pentatonic)
- [x] Tests: integ `storm`, `streakfx`, `streakhud`, `streaksound`; duel `perfectfx`; the wyrm's pace meter per seed and in the mean
- [ ] The tier rings on the burst read
- [ ] Cinderwood's fire field near the hero (barely prints in headless captures; check the real page)
- [ ] The aura through the Ghostep's cold cast (it blinks off after a perfect dodge)
- [ ] Played
- [ ] On the phone
- [ ] The sound heard in the game

## M1.68 — Tian Lei's blows audited; he stops attacking the air (2026-11-23, `enemies/ascendant-ascii`, ADR-162)
- [x] A motion audit of every move and of a real fight (opt-in `asc.mjs audit` / `auditfight`)
- [x] Feet that stay planted, arms that open, palms that stop at the hero, a steady roundhouse knee
- [x] He breaks off a blow you ran out of and chases you (`pressure.pursue`): 0 swings at air
- [x] His tracking turn kept as it is (the owner: "Leave it"); the still charges left too
- [ ] Played, and on the phone

## M1.66 — Tian Lei printed like the hero (2026-11-23, `enemies/ascendant-ascii`, ADR-155)
- [x] His letters follow his size on screen as the hero's do (`?ascLetters=a`)
- [x] The hero's quieter print (`?ascLift=b`)
- [x] The gold hair of forms 2 - 3 his own hair risen, not a tall crown (`?ascHair=b`)
- [x] A gi in ember with wraps, not the orange and blue (`?ascLook=e`; r, w kept)
- [ ] Checked on the owner's phone
## M1.65 — A seventh level: the Hall of Falling Script and Xin Yi, the One Who Woke (2026-11-22, `claude/level-code-one-784481`, ADR-156 – ADR-158)
- [x] `?level=code`: one hall, three scenes on the same ten slots that morph behind a front (`scenes`,
      destructibles `present`), the watchers, the falling script, the script wave in the prop and floor letters
- [x] Xin Yi: two bars, three phases (one hand, two guns, the Source), the fall and the rising, the Lean,
      the Bend, the stop and Return to Sender, flight and the Falling Fist's front, deja vu, skipped frames
- [x] The Long Second, the second learned technique (guard, then dodge with no direction)
- [x] Lab, Training (five lessons), `tests/integration/woke.mjs` (and an opt-in LEAN check on the Sheathed)
- [ ] The owner's picks from the sheets: his body (`?oneLook=`), the hall (`?hall=`), the script wave (`?script=`)
- [ ] On the iPhone: the frame rate, how the black coat reads, how the shots read at the phone camera
- [ ] His own score (borrowed tracks until an audition page); the phase banners that decode (cut)
## M1.64 — Wen Yao reworked: drawn like the hero, packs out of the air, the big Pearl, the Nine-Tailed Fox's beam (2026-11-22, `claude/fox-rework-ca0b58`, ADR-154)
- [x] He is drawn in the hero's ink-line art: `?foxLook=h1` the default (russet crest, amber jacket, vermilion scarf), h2 / h3 rendered; his letters follow his size (`?foxLetters`, `kit.letters`)
- [x] The selves only fight in packs: no ambient mode (no scatter, no token); `pack` on a beat, `FoxClones.pack`, booked with the cue ledger; `together` (one cue, one result) and `sequence`
- [x] Pack moves: Two Leaves Fall, the Thousand-Body Round reworked, A Thousand at Once, the Burial, the Kite String, the Pearl's harrying pack (strikers feed it); Changing Places drops its self in
- [x] The signature moves: the big spiral Pearl (pale blue-white, 0.9 m), the Twin Pearls, the giant Moon-Swallowing Pearl lifted by two selves, "It was a copy"
- [x] Heaven-Devouring Howl (phase 3): the Nine-Tailed Fox (a creature body in the art path), the dark sun, a beam that rakes the terrace and breaks the world, the kneel; the camera holds both
- [x] Phase 3's fire its own kind (`?foxFire3`); the pool 5 → 6 rigs; Training (three new situations), the Lab's pack and Howl buttons; `fox.mjs` data / clones / beam / pace
- [ ] Follow-ups:
  - [ ] The owner's picks: `?foxLook=` (h1 h2 h3), `?foxLetters=`, `?foxfire=`, `?foxFire3=`, `?foxSpirit=`, `?clones=` (sheets in `docs/looks/fox/`)
  - [ ] The Nine-Tailed Fox at the game camera reads only when looked for (its head sits at the frame's corner, ~100 px): a bigger head, fewer tails or a pale throat if the owner wants it scarier
  - [ ] The phone: the Howl pulls the camera back to ~55 m to hold the hero and the fox's head; the frame rate with a pack of five out; both on the owner's iPhone
  - [ ] The Moon Wheel (phase 3, a thrown Pearl that opens into a dome of cutting wind): cut first by the plan's order, not built
## M1.63 — The grove's bamboo sliced in one stroke, in clumps (2026-11-22, `world/bamboo-slice`, ADR-151)
- [x] One blade or blow slices a stalk where it bit; the top slides off the cut at once and goes over
- [x] Five kinds of cane, three thicknesses, fanning clumps with shoots (`?bamboo=a|b`; `0` the old grove)
- [x] The back filled: clumps behind him, a denser belt behind him, the wall out to 50 m
- [x] World test `slice`
- [x] The owner picks: `a`, mixed clumps (2026-11-22)
- [ ] Follow-ups: frame cost on the phone; the cut tops lying a while; a slice sound

## M1.62 — A sixth level: the Windless Grove and the Sheathed (2026-11-22, `level/the-sheathed`, ADR-144 – ADR-146)
- [x] `?level=grove`: the bamboo grove (light pieces), the Sword Grave, the paving; `?grove=a|b|c`
- [x] Lu Wusheng, the Sheathed: three phases, the sheath on the rig, the draw's rule (parry or die, a held
      guard never hurt, the honor gate), the grove falling on the click, the hanging cuts
- [x] One Breath, the first fixed reward (`game/unlocks.js`): guard + hold heavy, the draw counter
- [x] Lab, Training, `tests/integration/sheath.mjs`
- [x] The owner's picks from the sheets: his body (d, the Wanderer), the cut, the grove's light
- [x] Readable (ADR-152): the hero's ink-line print (the owner's pick), lifted; his silhouette, motion, lines and names
- [x] The palette: a, indigo and sand (the owner's pick)
- [x] The print: step 2, the digits in his colours, lit and outlined (the owner's pick of five, `?sheathArt=`)
- [ ] The owner's pick of the mark from the ADR-152 sheet (`?sheathMark=`)
- [ ] His own score (borrowed tracks until an audition page)
- [ ] A human playtest of the draw on the phone; One Breath's balance bot on Shen Hui
## M1.61 — A fifth level: the Foxfire Terrace and Wen Yao, the Thousand-Body Fox (2026-11-21, `claude/thousand-body-fox-33750d`, ADR-147, ADR-148)
- [x] An original in the spirit of a ninja-clone hero: his own name, mask, outfit and move names, none of that series' look
- [x] The level (`?level=fox`) and its set: a round paved terrace, lanterns, stone foxes, charm posts that burn, a great stone fox and a spirit gate
- [x] Wen Yao on the duelist engine (no engine change): three phases, nineteen moves as data, links, the seated intro
- [x] The owner's turn (2026-11-22): a bare-handed fist fighter (Tian Lei's strike builders), the homage pushed through what nobody owns (the pack, the palm-driven Pearl, the nine-tailed fox)
- [x] The paper selves: his own bodies (a pool of five built with him), pop in one hit, the cleave, one cut at a time under the fairness guard
- [x] The Pearl: shaped in his palm with a self's help, fed by the selves, starved by popping them, interrupted by two blows, driven home on a dash; Pearl Rain throws three from phase 2; Fox Descending off a self's hands
- [x] The Nine-Tailed Fox (phase 3): one tail to nine as his bar runs out, fire on the world, the tail, the pounce, the black pearl
- [x] Foxfire as a palette of the fire field; the rigid batch's bone texture grows when a level needs it
- [x] The look options rendered (body a - d, foxfire a - c, selves a / b); the fight built with each one's a
- [x] `tests/integration/fox.mjs` in `npm test`; the Lab (FIGHT buttons, LOOKS rows) and Training know him (two situations of his own)
- [ ] Follow-ups:
  - [x] The owner's picks: superseded by the rework (M1.62): he is redrawn, and the picks wait there
  - [ ] The owner plays the preview on the phone: the selves' readability at 852 x 393, the frame rate with five out
  - [ ] The level's own score (it borrows three tracks)
  - [ ] Phase 3 asks more (twice the dodges) but is not busier than phase 2 (79.3 against 80.2 cues a minute, bare-handed; after the rework 68.3 against 79.5: the Howl)

## M1.60 — Tian Lei as a recognizable homage (2026-11-22, `enemies/ascendant-homage`, ADR-150)
- [x] Three homage bodies behind `?ascLook=`; the owner picked the orange gi (`h`)
- [x] Instant Wave (form 3): the sign, beside the hero, a cupped-hands beam
- [x] Options: every beam out of cupped hands (`?ascBeamPose=cup`), the pale gathered sphere (`?ascOrb=c`)
- [ ] The owner picks the beam pose and the orb
- [ ] The wink names for his techniques (proposed: Crane Wave, Spirit Lantern, Instant Step ...)
- [ ] The gold hair apart from the gold aura in forms 2 - 3 (an aura option)
- [ ] One line for lookalike requests across sessions

## M1.59 — Bites: the letters come off where the blow lands (2026-11-21, `world/chip-where-hit`, ADR-132)
- [x] Every breakable as bricks (its triangles; the halves of a flat face pair up), taken where a blow struck
- [x] The share of structure a blow took = the share of the bricks under it; a blast eats the facing side
- [x] A solid piece keeps a skin, set back; foliage, boughs and thin bones are holed
- [x] Faces cut to brick size when the level is built with bites on (`refine`); the same picture
- [x] Each brick falls as its own letter; some stay lying
- [x] Range pieces (the forest, the landmarks) and rigid-batch pieces (stones, pillars, statues)
- [x] The hero's blade strikes at its own height (`ya` / `yb`)
- [x] `?chip=a`, the Lab's WORLD -> Bites; world test `bite`
- [x] The blade stops on what it cannot cut through: freeze, shake, sparks, sticks in wood, thrown back; integ `bladestop` (the owner: "Keep it")
- [x] Chips knocked out of the struck face toward the striker
- [x] The owner picks: on (2026-11-21); `?chip=0` turns it off
- [ ] Follow-ups:
  - [ ] Frame cost of the extra vertices on the phone (Cinderwood 0.92 M -> 1.07 M)
  - [ ] The ground breaks: pits and torn earth where a hard blow lands
  - [ ] The landmarks that stay whole (bonfires, gate, bell, throne, fallen star): the owner's call, one by one
  - [ ] A second layer and a support rule: what hangs over nothing falls
  - [ ] Wreckage that can be cut up (logs, rubble)
## M1.58 — A landed cut has weight: the impact pass (2026-11-22, `combat/impact-weight`, ADR-149)
- [x] Nine ideas proposed; the owner built the first batch (the stamp, the ripple, the reaction by
      where it lands, the sound's weight)
- [x] The core: `combat/impact.js` switches (`?impact=`, the Lab's 'impact' row), one hit record at
      the drawn contact; every piece off = the game as before
- [x] The stamp: the hit printed in the letter grid, stepped, a shape per tier, ink on black, never
      over the hero
- [x] The ripple: a pressure wave through the struck boss's letters (round 2; round 1 did not read)
- [x] The reaction, drawn only: the human bosses (head, body, leg; a thrust folds) and the wyrm
      (head, neck, body, leg, wing, tail)
- [x] The thump: a sub under heavy blows, a short dip of the music (never the cue bus)
- [x] Same-take clips for the owner; the picks: the stamp on the human bosses only, a human boss's
      reaction x1.5, the wyrm's x1, the ripple and the thump x1
- [x] Tests: integ `stamp`, `ripple`, `wyrmreact`, `thump`; duel `react`
- [ ] Follow-ups:
  - [x] Calm at the contact: today's flare toned down in graded levels (`?calm=0..3`); the owner
        picked level 1, now the default (`combat/impactCalm.js`; integ `calm`)
  - [ ] Calm at the contact on the phone, on crits, the execution, the Lord and Tian Lei
  - [ ] C: wounds that stay
  - [ ] E: a spray along the blade
  - [ ] F: the ground answers heavy blows
  - [ ] G: the same care when the hero is hit
  - [ ] I: an impact frame
  - [ ] A real phone: the ripple's second version on the LOW / touch path, the frame rate
  - [ ] A human plays it; the thump heard on speakers and on a phone
  - [ ] Not filmed yet: the execution and crits (stamp, ripple), a flurry and Tian Lei (reactions)
## M1.57 — Round the Obsidian Throne, what the challengers left (2026-11-22, `level/throne-props`, ADR-133)
- [x] The felled forest's identical logs in a starburst replaced: 13 kinds of piece in the prop art
      path, each built afresh, faced to the camera, lying along the blast's way out
- [x] Four options rendered in game for the owner (a shrine / the star's debris / the challengers /
      all); the owner picked the challengers (`?outskirts=c`), the rest behind the switch
- [x] Within 43 m they break where they stand (stone leaves rubble; banners and carts burn; none
      topples, so the Lord's fight is as tuned); nothing tall on the near side
- [x] The fairness guard: a felled piece that would land near a blow of his already cued, needing
      the other answer, lands uncued and harmless (`brain.worldClash`; a gap main had too)
- [ ] The owner plays it
- [ ] Their own break / burn tuning (today the material defaults)

## M1.56 — Tian Lei's third wave: the sign, the counter stances, the great orb, the barrage (2026-11-22, `enemies/ascendant-moves`, ADR-135)
- [x] The engine: a counter stance as a beat (`stance`), the sign before a vanish, several counters a form
- [x] The sign: Sign Step, Three Signs; the first vanish of Vanishing Step, Storm Waltz, Mirage and the thunder Riposte
- [x] Three counter stances (Still Water, Golden Mirror, Thunder Mirror) and three more ripostes
- [x] Heaven's Lantern and THE PUSH; Raining Suns and its returnable finisher
- [x] Training situations, Lab row, test scenarios; the move tables regenerated; PACE green over ten seeds, 0 conflicts
- [ ] Follow-ups:
  - [ ] The owner plays it: the stances' hold (0.2 - 0.4 s) and the open window, the orb's speed, the barrage's spread
  - [ ] The owner picks the orb's look (`?ascOrb=a|b`)
  - [ ] The sign's hand at the game camera (a few cells under the aura): a brighter hand, or the camera closer for the sign
  - [ ] The orb drawn as large as its hit; the push's crater and camera tuned
  - [ ] A real phone: the push's touch block, the barrage's cues

## M1.55 — The hero looks the same on every screen (2026-11-21, `player/hero-look-everywhere`, ADR-130)
- [x] His letter cell follows his size: 0.115 m at his depth on every screen and camera distance
      (the owner's reference picture: 9 letters across the cloak); the lines step with the letters
- [x] His own pixel tag and part tables: the human bosses are drawn exactly as before
- [x] From the front and the side one dark figure: the plate takes the cloak's dim dotted rim
- [x] A dark blade that lights when it cuts (the owner's pick of three); the arc kept
- [ ] The owner plays it on the phone and on the large screen
- [ ] The human bosses on the same letters, if the owner wants it after seeing the hero live
- [ ] The swing's arc and the hero's other effects are still full-resolution glyph sprites beside
      his larger letters on a large screen (the fire field would print them in letters)

## M1.54 — A fourth level: the Skybreak Ring and Tian Lei, the Last Ascendant (2026-11-21, `enemies/ascendant-boss`, ADR-129)
- [x] The moveset agreed with the owner before the build; an original fighter and arena
- [x] The level (`?level=ring`), the set in three arenas, breakable tiles, buttes whose tops come off, the light by form
- [x] Tian Lei on the duelist engine: bare hands (the striking limb is the blade), three forms, a deathblow and a transformation each
- [x] The engine's new beat fields: a zone off the root, hits from the air, a sustained beat, the blade lock at range
- [x] His body (hair by form) and his effects (gold in the fire field, the aura, blasts, the disc, the beam, the vanish, the transformation)
- [x] About forty moves: melee strings, shots, the beams and THE CLASH, the terrain moves; links; the weather
- [x] Integration with ADR-126; a tuning pass over ten seeds (0 conflicts; the dodge share 13 / 23 / 40 %)
- [x] `tests/integration/asc.mjs` (26 scenarios) in `npm test`; Training (94 situations) and the Lab's LOOKS rows
- [x] The owner's picks: arena a, body a, aura a, beam a, the calmer floor and the lighter figure
- [ ] Follow-ups:
  - [ ] The owner plays the preview: the fight's length (2000 a bar is the lead's middle of four measured settings), the difficulty for a player who misses answers
  - [ ] Should an answered flurry break a whole bar? (`TUNING.flurry.posture`, built, off; it changes a rule Training teaches)
  - [ ] The level's own score: an audition page, a track per form (it borrows three tracks today)
  - [ ] Polish that needs eyes: the beam technique's pose at the game camera, the transformation's body under the gather, Stone Storm's tiles against the aura, Heavenfall's landing, the lost clash's surge, the disc and the cage's orbs (small)
  - [ ] His strikes re-filmed on the merged engine in forms 2 and 3 and from every side
  - [ ] A real phone: frame rate, the touch block in the clash, the figures' size
  - [ ] One foot planner for the three human bosses (a per-kit step setting in `player/anim.js`)
  - [ ] Thunderfall at its intended rate (every 4.0 s today against 3.2 → 1.8 s): a second strike in a pair
  - [ ] Decide what stays behind the switches (arenas b / c, outfits c / d, auras b / c, the braid beam)

## M1.53 — A felled tree lies as the blow left it (2026-11-21, `world/crumbling-border`, ADR-128)
- [x] The stump cut by the blow: height, a slanted top, splinters, a push toward the fall; burnt: low and black
- [x] The fall turns off the blow's line and rolls about its trunk
- [x] The trunk turns as it lands, rests raised, breaks in two with a kink; crooked log shapes
- [x] Some trees that burn through stand as black snags
- [x] Tests: world `lie`; `spread` starts from a known stream
- [ ] Follow-ups:
  - [ ] The owner plays it and picks how far to take it (more splits, taller snags, fewer)
  - [ ] A trunk split down its length (two halves on the stump)

## M1.52 — The drake's glare from every side (2026-11-21, `dragon/drake-eyes`, ADR-127)
- [x] Four anime faces rendered and turned down by the owner; not kept
- [x] The drake's eye a slanted almond turned out, up and forward; a steeper brow, an orbit rim, a dark hollow
- [x] The sims reseed at each model's build (`game.onModelBuilt`): a model's object count no longer moves a seeded fight
- [x] The eyes a quarter smaller (owner)
- [x] The resting neck no longer looks broken: it arches into the head, the head held level at rest (owner)
- [ ] Follow-ups:
  - [ ] On the iPhone: the glare at the phone camera
  - [ ] The eyes from straight above (the game camera's high angle): still small points

## M1.51 — The human bosses' attacks as motion (2026-11-21, `enemies/duelist-motion`, ADR-126)
- [x] Every move of both bosses audited on the rig (hand speed, jumps, sliding feet, blade against the head) and filmed
- [x] The follow-through's own clock; a cubic through the keys; `gather` / `settle`; a bait hold that holds
- [x] A beat owns its channels (`completeBeat`); the blade-driven arm on the keyed angles, and with two hands
- [x] Feet that hold their ground and step under root motion (`_feetClip`)
- [x] The spare arm, the overhead, the thrust, Shen Hui's whirl, the Lord's flourish
- [x] `duel.mjs . motion`; before / after films of seven strings
- [ ] Follow-ups:
  - [ ] The owner's look at the clips and the preview; what still reads wrong, move by move
  - [ ] The Lord's left arm in the staff's spins and the keyed two-handed poses
  - [ ] Reaction clips (hits, staggers, the guard, the deaths) audited the same way
  - [ ] The casting hand and the kicks posed anew
## M1.50 — The tree wall opens: the fight leaves the clearing (2026-11-21, `world/crumbling-border`, ADR-125)
- [x] The edge of the open ground follows what stands of the wall (120 lanes; sealed until a tree is down)
- [x] The hero walks out where it has come down; the wyrm's root follows through a gap wide enough for it
- [x] Meteors, pillars and the barrage follow him out; a tree falling onto opened ground tells red
- [x] The minimap shows the opened ground; the feed says it once; the Lab's Open wall
- [x] Tests: world `edge`, integ `breach`, the open ground in WRECKAGE's report
- [ ] Follow-ups:
  - [ ] The owner plays it: the rate the wall opens at, fighting among the stumps, the 62 m limit
  - [ ] On the iPhone: the frame rate with the wall open
  - [ ] The landmarks' pieces closing their own lanes (the ground behind the skeleton opens rib by rib)
  - [ ] The same for a level with a wall of its own, if one is built

## M1.49 — The Cinder Wyrm's face: the drake (2026-11-20, `dragon/wyrm-face`, ADR-124)
- [x] The shipped face photographed at the game camera and close up; what made it unreadable named
- [x] Four faces on one kit (planes, dark sockets, a dark mouth, a cleared nape): drake, tyrant, viper, revenant
- [x] The owner's pick, the drake, is the face; the gameplay joints unchanged (`integ.mjs . wyrmface`)
- [ ] Follow-ups:
  - [ ] On the iPhone: the face at the phone camera
  - [ ] The intro's close shots framed for the new head
  - [ ] Remove the heads that were turned down (`skull`, `loong`, `demon`, `tyrant`, `viper`, `revenant`) once the drake has been played

## M1.48 — The Cinder Wyrm on a leaner build (2026-11-20, `dragon/wyrm-look`, ADR-123)
- [x] Three full redraws rendered and turned down by the owner; three builds of the shipped wyrm rendered instead
- [x] Build c (the owner's pick) is the wyrm: lean trunk and limbs, a fierce head carried high, a mane of quills
- [x] Drawn only: skeleton, hit volumes, reach and timings as before (`integ.mjs . wyrmlook`); `?wyrmLook=0|a|b` kept
- [ ] Follow-ups:
  - [ ] On the iPhone: how the build reads at the phone camera
  - [ ] Longer bones (neck, tail, legs) if the owner wants the picture's proportions: a retune of reach, volumes and timings
  - [ ] The intro's close shots and the Lab's model viewer framed for the higher head
  - [ ] The body's hurt spheres against the tucked belly

## M1.47 — The duelists' second pass: a director and a fairness guard, Shen Hui's third phase, the Lord's spells in his strings, two arenas that break (2026-11-16, `enemies/duelist-second-pass`, ADR-122)
- [x] A director over a duelist's pick, combo links from half the recovery, chain depth and rest, the openings kept
- [x] A cue ledger and a fairness guard: no two cues needing different answers within 0.3 s (132 before, 0 now); the `pace` meter
- [x] Shen Hui: three phases, sixteen new blade moves, three on the floor, burning ground, a red blow in eight strings
- [x] The Starless Lord: nineteen new moves, the wheeling blade, orbit stones, the Sky as weather, Starless Night, Rupture, the Falling Halo
- [x] Thrown pieces show the flare only (supersedes the landing marks of ADR-109 and ADR-111)
- [x] Both arenas break: courtyard 456 breakables, crater 222; floors whole / cracked / broken; two-stage colossi; pieces outside the scene graph
- [x] Effects with bodies (the shock front, the Kindling, ash on the wind, afterimages, the qi, the Lord's spells, each ignition); look-only random streams
- [x] The owner's picks of every look (2026-11-16): the authors' picks for the effects, the bodies dressed by phase, rubble on earth; the Lab's LOOKS section
- [ ] Follow-ups:
  - [ ] A human playtest of both fights; whether they should be longer or deadlier (posture per parry, health: untouched here)
  - [ ] The cheese spot behind the Obsidian Throne (nothing of the Lord's reaches it)
  - [ ] A missed blow in a long string costing most of the string; two guard cues from different sources 0.1 - 0.25 s apart
  - [ ] The guard stepping in 1 - 4 times a minute in the Lord's fourth form (world pieces his own blows fell)
  - [ ] Music for Shen Hui's third phase (picked by ear); sounds for the new moves and spells
  - [ ] A joint-by-joint audit of the new poses; a palm strike for Shen Hui's free hand
  - [ ] On the iPhone: frame rate in the Lord's fourth form with the weather and Starless Night
  - [ ] Remove the looks that were turned down and their switches, once the picks have been played

## M1.45 — The wyrm ablaze, a forest that breaks, letters that follow the zoom (2026-11-16, `dragon/menace-and-ruin`, ADR-120)
- [x] Every tree of Cinderwood is a breakable that wears down in stages (664 breakables on 228 bones)
- [x] The Elder Wyrm's skeleton, the Cinder Tree and the bone nest break in pieces; bone heaps; the bonfire stays
- [x] The wyrm reaches the tree wall: wind from roars, rings, wings and landings; fire that carries on into the trees
- [x] Phase 3: the ignition in the roar, wing tips, claws and tail ablaze, trailing fire, harmless footprints
- [x] The letters follow the player's zoom past the default distance (the owner's pick: b)
- [x] Three sculpted heads behind `?wyrmFace=`: shown, and passed on for now by the owner
- [ ] Follow-ups:
  - [ ] A human playtest: how fast the wall goes, the fire's strength in a real fight, the zoom on the owner's monitor
  - [ ] Frame cost: 16 - 22 % more render time than before at 1080p, mostly the trees' mesh; measure on the iPhone
  - [ ] The wall's damage in more, shorter stretches (it clumps into one to three); a dead tree's stages seen in the canopy
  - [x] A head for the wyrm, when the owner comes back to it: separate fangs, deeper sockets, calmer scales on the face (M1.49, the drake)
  - [ ] The same destruction for the Ashfall Courtyard's and the Obsidian Throne's backgrounds

## M1.44 — The Cinder Wyrm's second pass: pressure, whole-body combos, flying combos, a clearing that breaks (2026-11-15, `dragon/wyrm-second-pass`, ADR-119)
- [x] A director over the wyrm's pick; combo links for every attack; fairness guards; the pressure meter
- [x] Six whole-body attack kinds, seven new strings; the breath's body braced
- [x] Flying combos of two, three and four parts; more fire from the spells; the apocalypse reworked
- [x] The wisp swarm removed; no spinning while breathing; ground tongues, ember rain, cinder spit, fire lanes
- [x] Shock fronts, the fire breath and the small effects redrawn (three looks each for the ring and the breath)
- [x] Terrain moves in 1.3 - 1.8 s with a whole-body grab and no landing mark
- [x] 183 breakables; the wyrm's body wrecks what it meets; wreckage stays; fire spreads within limits
- [ ] Follow-ups:
  - [x] The owner picks the look of the shock ring, the fire breath and the apocalypse: `a` for all three, 2026-11-16 (the rolling front of fire, the torrent, the salvo; b and c stay behind `?ring=`, `?breath=`, `?apoc=`)
  - [ ] A human playtest: the pace per phase, the fairness of layered fire, how fast the clearing wrecks
  - [ ] Phase 1 and phase 3 under their cue-rate targets on some seeds; the wing sweep's misses in three strings
  - [ ] The grabbed tree read from the side; white knots in shell and fireball impacts and in the torrent breath
  - [ ] On the iPhone: frame rate in a phase-3 fight, the sky deck, the flare
  - [x] The same pass for the Ash Disciple and the Starless Lord (M1.47, ADR-122)

## M1.43 — The flare: red, blue and black flashes; the counter; the charged blow (2026-11-15, `combat/flash-tells`, ADR-118)
- [x] The flare replaces the red windup glow and a boss's own red floor ring (hazards keep their ground mark)
- [x] A blue flare marks a parry moment: any parry of it ends the string and the hero counters by himself
- [x] `TELL.BLACK`, the charged blow: a guard or a parry in its way is emptied and knocked open, no damage
- [x] One charged blow per boss (Black maw, Black Tide, Nightfall); Severing Wind, Twin Embers, Severance, Red Meridian
- [x] Twelve existing heavy blows marked as parry moments
- [ ] Follow-ups:
  - [x] The owner picks the flare's look: the streak (shown beside the star and the lance; those stay behind `?flare=`)
  - [ ] The owner judges the black charge and the black flare on screen
  - [ ] A human playtest: how the three fights' length and difficulty moved (the ADR-102 bots not re-run)
  - [ ] The flare on the phone: readable at 852 x 393? Its frame cost?
  - [ ] More moments in the long strings (a marked blow mid-string ends it: tune which)
  - [ ] Training catalogue entries and Lab chips for the new moves

## M1.69 — Attack sounds: cues only for blue / red, blows that sound like their weapon (2026-11-22, `audio/attack-sounds`, ADR-165)
- [x] No cue on a white blow; a recorded warning and timing sound for blue and red
- [x] A blow sound per weapon (sword cut / heavy / thrust / draw, fist light / heavy), timed to the impact
- [x] The wyrm's claws and tail, the hero's sword on the same takes
- [x] An audition page; the owner's picks ship; `?sfx=old` and a Lab row
- [ ] Follow-ups:
  - [x] The blue timing sound: three rounds of recordings heard, the synth ping kept
  - [ ] The owner's listen in a fight and on the phone: the mix against the music
  - [ ] A real punch / kick and creature swipe if a CC0 recording turns up

## M1.42 — Dark music per level and per boss phase (2026-11-15, `audio/dark-score`, ADR-117)
- [x] Recorded CC0 sound effects tried and dropped (too noisy: PR #55 closed); the effects stay synthesised
- [x] An audition page: three dark candidates for each of 14 slots; the owner's picks ship
- [x] Each level's exploring track; a track per boss phase (3 + 2 + 4); victory and death
- [x] The synth score stays the fallback; `?music=synth` and a Lab A/B switch
- [ ] Follow-ups:
  - [ ] The owner's listen in play, on the phone: levels, loop seams, the phase changes
  - [ ] On the phone: decode time and memory with three decoded tracks

## M1.41 — WHAT'S NEW; the phone camera in a duel's moment; a game of its own (2026-11-15, `ui/changelog-own-identity`, ADR-116)
- [x] WHAT'S NEW: every version's notes from the title (corner button) and the pause menu, with an unread badge
- [x] `tests/changelogcheck.mjs`: every CHANGELOG headline has an in-game entry
- [x] A cinematic's zoom scaled for the phone's closer camera (it took the camera to 9 m)
- [x] The page can no longer be double-tap zoomed from the controls or the game screen (iOS)
- [x] The inspiration's name removed from the game, the docs and the source
- [ ] Follow-ups:
  - [ ] The owner's check on the iPhone: does lock-on still zoom in? (if yes: a screen recording)
  - [ ] Cut 0.5.0: the LATEST release has carried forty-five entries since 0.4.0

## M1.39 — The hero's stance: at ease, and a fencer's guard (2026-11-15, `player/idle-stance`, ADR-114)
- [x] Three stances rendered for the owner's pick (A "At ease", B "Coiled", C "Hidden blade"); A picked
- [x] At ease: the blade on the arm's own line, a hand on the belt; alive at the game camera
- [x] A fencer's guard while locked on or in a boss fight, kept up on the move
- [x] The transitions audited against `main`: the run, a roll, a backstep, taking the guard and letting it down
- [ ] Follow-ups:
  - [ ] The owner's look at it in play and on the phone
  - [ ] The idle actions re-posed from the hand on the belt, if they read wrong
  - [ ] The other outfits (`?heroLook=`) looked at in both stances

## M1.38 — The world breaks (2026-11-15, `world/destruction`, ADR-107; staged PRs by parallel sessions)
- [x] Breakables in a rigid batch, ground fire that burns where it lands, cover, marks, the reset;
      every fighter's blows hit the world (`world/destruction`, ADR-107)
- [x] Cinderwood and Ashfall list their breakables; things to break inside Cinderwood's clearing
- [x] The owner's pick of the debris look: digits (chunks and shards turned down; the switch removed)
- [x] The hero seen behind the wyrm (its own session, PR #41, ADR-106; merged)
- [~] The Obsidian Throne rebuilt open, listing its breakables (its own session and PR, ADR-108)
- [ ] The Starless Lord's terrain moves: pillars and rubble lifted by the Void and thrown (ADR-109)
- [x] The wyrm's terrain moves: Uproot and hurl, Tail bat, Firebrand (its own session and PR, ADR-110)
  - [x] The owner's pick of how it holds a tree: over the shoulder (upright turned down; the switch removed)
  - [ ] A played fight: how often the moves come up on the real clearing, and the phone
  - [ ] The lab stage has no breakables: there the three moves find nothing to take
- [x] The Obsidian Throne rebuilt open (ADR-112, Session 48): three open arenas rendered for the
      owner (Starfall, the Grave of Blades, the Broken Hall), "A Starfall" picked and built: a crater
      with no walls, the star as his throne, 36 breakables (shards, rim slabs, stones in the air)
  - [ ] Owner review of the PR preview on the phone (frame rate there is unverified)
  - [ ] The stones in the air hang still: a slow bob needs the destruction system to carry them
  - [ ] The first hall's wardens and great swords are no longer placed (builders kept in landmarks.js)
- [x] The Starless Lord's terrain moves (ADR-109, Session 49): Void Hurl, Glass Rain, Crown Fall on
      the crater's shards, slabs and hanging stones; Torn Stone scars the floor
  - [x] The owner's look at the film strips ("Keep and tune"); tuned against answering bots
  - [ ] A played fight: his weights for them, whether 0.9 s of flight is too generous
  - [ ] Sounds of their own (the lift reuses the crash, the flight is silent)
  - [x] The hanging stones drift while they wait
- [ ] The wyrm's terrain moves: a tree or a boulder taken up and thrown
- [x] The Ash Disciple's terrain moves: Severed Pillar, Flying Lantern, Three Tolls, Swallow's Return
      (its own session and PR, ADR-111)
- [ ] A human playtest and a bot measurement of the difficulty with breakables and grass fire
- Follow-ups:
  - [x] A broken piece leaves the minimap (it re-bakes when the colliders change)
  - [ ] The phone: the look and the frame rate with fire and debris on screen
  - [ ] Sounds of their own for fire catching and a tree burning (the sizzle and ember hiss are reused)
  - [ ] Training places the hero without checking what stands there
  - [x] The owner's pick of the look of the bell's ring of sound: arc (the wave look turned down and removed)
  - [ ] A toll sound of its own for the bell (the world's metal chip plays)
  - [ ] The courtyard's ring builds two pillars on the same spot at three corners

## M1.37 — The hero seen through what covers him (2026-11-15, `claude/render-hero-seen-125813`, ADR-106)
- [x] The covered parts of the hero print through the wyrm (and any object) as a cyan ink ghost
- [x] Three looks built (ink ghost / window / rim only); the owner picked the ink ghost
- [x] Only while covered; pixel-identical in the open; the duels unchanged
- [x] A probe gates the pass: one draw call in the open, the second draw of the hero only under cover
- [ ] The owner's phone test: the look in a played fight, the frame rate, Safari's occlusion queries
- [ ] Thrown trees and lifted pillars (the terrain work) checked as cover when they exist

## M1.35 — The rewards ordered by risk (2026-11-15, `combat/reward-order`, ADR-102)
The first of the changes from the genre review (owner: "lets implement your suggestions").
- [x] Strategy bots (mixed / parry-only / dodge-only) in all three suites; measured before and after
- [x] The flurry and the plunge on a red blow's perfect dodge only; a white one: a pip and slow-mo
- [x] The flash counter: a trade clash at the last instant goes through him
- [x] A perfect parry pays: × 1.5 posture, the counter cut
- [ ] A human plays it; then the counter's window (0.03 s), its 70 damage, the counter cut's 0.9 s
- [ ] Film the flash counter and the in-place perfect dodge; a Lab switch for `flurryAny`
- [ ] The rest of the review, each its own PR:
  - [x] A frame simulated in steps of about 1 / 60 s (`core/sim-step`, ADR-103: no step longer than
        20.8 ms at any frame rate; not a fixed step with interpolation: see the ADR)
  - [ ] A performance budget (a target machine, a frame-time ceiling); the cost of two to six steps
        a frame on a slow machine; event-timestamped presses
  - [x] Per-move telemetry; the killing move on the death screen (`game/move-telemetry`, ADR-108)
  - [ ] Read the table after the owner's sessions and tune from it; a way to read it on the phone
  - [x] A heavy button: five heavy branches off the chain, the charge on the heavy, a 2 x 2 phone pad
        (`player/heavy-branches`, ADR-115; the owner picked branches over direction-chosen swings)
  - [ ] The owner's look at the heavies in motion; tune their numbers from play
  - [ ] The rising backhand's first frame flings the free hand ~64° (from the falling cut's finish to
        the sword wrist; on `main` too, unmeasured there: that frame was 'pending'). integ HEROLIFE
        measures from a swing's second frame
  - [ ] HP-linked posture (the Lord's rule) for every boss
  - [ ] Save file, a hub at the bonfire, a boss order that starts on Shen Hui, ranks, difficulty tiers,
        a reduce-flashes option
  - [ ] The single boss slot as an actor list (before mobs or a duo fight)
  - [ ] Designed sound for the core combat hits
  - [x] A theme per boss, and per phase (recorded CC0 music, ADR-117)
## M1.34 — The flurry on a man; the afterimage (2026-11-15, `player/flurry-duel-read`, ADR-101)
- [x] A pacing of its own against a duelist: wound up, past his side, a held finish
- [x] A flurry's blows do not shove a duelist; the last staggers him away from the hero
- [x] Effects and camera sized for a man
- [x] The afterimage printed in digits from his own body, on every blink; digits fly to where he reappears
- [x] Three afterimage looks built; the owner picked digits
- [ ] Phones: the particle count of a long flurry

## M1.33 — Training and the lab stage (2026-11-15, `dev/training-lab`, ADR-099)
- [x] A catalogue of situations by category, one click each, played through the game's own input
- [x] The panel: banner, ✓ / ✗, speed, loop, the answer for boss moves, the stage, the boss
- [x] The training room (`?stage=lab`): three looks built, the owner picked Holo
- [x] Every situation is a test (integ / duel / lord TRAINING)
- [ ] Phones: the panel and the stage
- [ ] More situations as they are asked for (a whole phase played out, a boss bot vs the hero bot)

## M1.32 — Weight on the flurry; one streak; a foe's streak (2026-11-15, `combat/streak-everywhere`, ADR-094)
- [x] Flash cuts that land: the hero's freeze, the target's reel, clones, ground shock, the last blow's impact frame
- [x] Parries, deflects, clashes and the mikiri count in the streak
- [x] The riposte: a parried last blow answered with as many flash cuts as the streak counts
- [x] Duelists: a streak of guards (pips on the boss bar) and a flurry of that many blows from every side
- [x] Answer every blow of it (parry or block) and his posture breaks
- [ ] A human plays it; then the riposte's damage, the foe's thresholds
- [ ] Follow-ups:
  - [ ] Film the riposte, the Lord's flurries, the screen cuts; the phone
  - [ ] Sounds of its own for his flurry (it borrows the gong and the tells)
  - [ ] An afterimage of the foe where he stood (the Lord has one for his blink)

## M1.30 — The streak and the flurry (2026-11-14, `player/ghostep-flurry`, ADR-091)
- [x] A streak of perfect dodges (it ends when a blow hurts); pips, "GHOSTEP ×N", the victory record
- [x] The flurry: N blows for a streak of N (7 at most): flash cuts whose lines hang, then an art
- [x] Six arts: Skyfall (the plunge), Severing Line, Heaven Splitter; Passing Cut, Falling Leaf, Rising Moon
- [x] The world held at 7 % while the hero cuts in real time; the camera leans in
- [x] Its look (afterimages, hanging lines, crescents, the burst), its sounds, the cut counter and the banner
- [x] Lab: flurry x1 … x7, an art picker; tests (integ FLURRY, duel GHOSTEP)
- [ ] A human plays it, and on the phone; then pace, the cap, whether a streak should run out
- [ ] Follow-ups:
  - [ ] Hear the sounds (written, not heard)
  - [ ] The hero's pass and vault poses in close-up
  - [ ] Balance: a duelist's fight is shorter for a player who dodges well
  - [ ] More arts (a whirl; one that uses the free hand); an art per equipped technique (ADR-059)

## M1.29 — The free hand in sword fingers; weight and footwork; a cut that lands; outfits to pick from (2026-11-14, `player/free-hand`, ADR-086 – ADR-090)
- [x] A wrist for the free hand, stable at any frame rate; the sword-fingers hand; a choreography per cut; no fist pops; the free elbow bent on the grip (ADR-086)
- [x] The shaped step; the hips and chest lead the cut; bow stances; the edge bites; planted feet pivot and follow; the whirl hops (ADR-087)
- [x] A cut drawn where it lands: the slash line, sparks along the cut, the flare and glint, the kick, the punch, the cut sound, the shudder (ADR-088)
- [x] Three outfits (and their faces in shadow) and three sword looks behind `?heroLook=` / `?sword=`, with sheets for the owner (ADR-089)
- [x] Fixed: a hero rebuild wiped a boss's own part ink
- [x] The owner's call on the looks: today's look and sword stay the default; the three outfits and three sword looks are kept behind their switches for later (ADR-090)
- [x] After the first preview: a fist that reads as a hand; the charged blade clear of his hood; arms that open at contact, elbows in on the run, arms that swing in a strafe (ADR-090)
- [x] After an independent review of that round: the arms swing in a pure strafe and no longer jump on a direction flip; the guard breathes; swings come home softly; the Ash Disciple's arms left as they were
- [ ] The owner's look at round 2; the whirl's feet (hop or carry)
  - [ ] Coil → charge: the blade still turns 52° in one frame; the roll's exit opens the free elbow to 155-160°
- [ ] Follow-ups:
  - [ ] On the phone: the longer lunge on a short click, the kick's feel, fps with the new effects
  - [ ] The wrist on its limit through the falling backhand, the falling cut and the whirl: tune the keys in the Lab close-up if it reads stiff
  - [ ] Hems, cloak tips and the arm drape under the grass in the death's collapse (`_hemY` checks only the hem's centre)
  - [ ] A plate hit sound for the Starless Lord (he takes 'cloth')

## M1.28 — The Starless Lord: black plate, motion, three more spells (2026-11-14, `enemies/starless-lord-armour`, ADR-084, ADR-085)
- [x] A harness of his own (hood and faceplate, cuirass, yoke and pauldrons, plate limbs, war-skirt, cape), drawn at 1.32
- [x] Three heads rendered for the owner's pick (sallet, crown, hood): the owner picked the hood
- [x] New guards, the glide, strings that walk, hop spins, a cartwheel and a backflip, flourishes
- [x] Six new moves (37): Starless Dirge, Crushing Dark, Pinwheel, The Rift, Parting Light, Dark Star
- [x] Every Void effect redrawn; the glide's wake, the blink's afterimage
- [x] Fixed: a waiting duelist stood in his guard (he sits; Shen Hui kneels)
- [x] The hood is his head: the two helms and the `?lordLook=` switch removed; the hood finished (a
      round crown, the brow over the faceplate, an ember rim, the drape on the yoke); the standing
      collar removed (it poked through the hood)
- [ ] A human fight, and on the phone; re-tune for the new moves
- [ ] Follow-ups:
  - [ ] Watch the glide, the cartwheel and the flourishes in motion at 60 fps (reviewed as strips)
  - [ ] His hurt spheres against his drawn size (32 % larger than they are)
  - [ ] Sounds of his own (still none): the blade's hum, thunder, the grip, the star
## M1.27 — Hit reactions and the death fall, audited (2026-11-14, `player/natural-reactions`, ADR-083)
- [x] A knee / elbow floor in the solver (the death's collapse sank both knees 15 cm)
- [x] The knockdown falls away from the blow: onto his front from behind, his facing eased (it spun him 180° in a frame)
- [x] Killed while knocked down he dies where he lies (`deadDown`; he stood up to die again)
- [x] The flinch follows the blow; reactions from mid-swing fade in, an interrupted whirl finishes its turn
- [x] The fall and the corpse: knees buckle, a knee up, a knee out; the cloth lies flat on a lying body
- [ ] Follow-ups:
  - [ ] The owner's look at the preview
  - [ ] Not audited: the plunge's poses

## M1.26 — Steel on steel: blades that meet, a guard you can read, cancels (2026-11-14, `combat/epic-clash`, ADR-079 – ADR-082)
- [x] The clash: one effect of lines on the crossing of the blades; sparks fly through the freeze; a camera punch (ADR-079)
- [x] A parried blow is held where it met the guard and rebounds; the hero's deflect goes to its side and height (ADR-079)
- [x] A short freeze inside a string, a long one where the exchange turns (ADR-079)
- [x] His guard: raised as you swing, a ward on the strike's side, the deflect that bounces the hero and brings the Riposte (ADR-080)
- [x] Cancels: the hero's guard or dodge out of any point of a swing; his guard or step out of a late recovery (ADR-080)
- [x] The blade lock: the two close, the blades cross, the pair slides with the push (ADR-081)
- [x] Duel framing: the camera 6 m closer within a duelist's reach (ADR-081)
- [x] The trade clash (the owner's pick): the hero's cut and his blow at the same moment meet; a string goes on, no punish window, a full cleave wins it, no two in a row (ADR-082)
- [ ] Follow-ups:
  - [ ] The owner's play on the preview (both duelists, the phone): the closer camera, the deflect's odds, the 45 % step out of heavy blows
  - [ ] Ideas not built (the owner's pick): a **counter cut** (the first light after a deflect comes out in half the time); a deathblow camera that orbits; the posture bar glowing as it nears the break; the wyrm's claws met by the same contact pose
  - [ ] A thrust set aside still shows the blades ~0.4 m apart; his hilt is at the hero's chest at the impact (his dash stops 1 m short)

## M1.25 — A faster chain, the finisher as a clip, a recovery that flows (2026-11-14, `player/faster-flow`, ADR-075, ADR-076)
- [x] The pace: a light every ~0.32 s (was 0.42), a 0.12 s cut; the lights' damage back to 30 / 32 / 36 / 30 (ADR-075)
- [x] The Lab's attack-speed slider (`player.debug.attackSpeed`) for trying other paces on the preview (ADR-075)
- [x] The slam as a swings.js clip: a gather, a leap, one two-handed diagonal into the ground, a held landing (ADR-076)
- [x] The way home starts while the follow-through is still moving: no stop, no snap (ADR-076)
- [x] The whirl drops and leans into its turn, the head spots (ADR-076)
- [x] After the first look: both thrusts rise (the level poke read as planted in the ground); the sword arc a fine line off the steel, a thin crescent picked by the owner from three looks (ADR-077)
- [x] Anatomy: joint limits in the solver (elbows, knees, the sword wrist, hands outside the chest); the charge held out from the body (ADR-078)
- [ ] Follow-ups:
  - [ ] The owner's look at the preview: the pace (a number from the Lab's slider if it is still off)
  - [x] Anatomy not yet covered: the off hand's wrist in two-handed cuts (a wrist of its own and the fist on the grip only once it is there: M1.29), the free arm's elbow behind the back in two backhands' recoveries (the free-hand choreography: M1.29; hit reactions and the death fall: M1.27)
  - [ ] Ideas not built (the owner's pick): an afterimage on the sprint slash and the cleave's dash; a strafing guard-up stance while locked on; a second finisher (a spinning smash); a flick of the blade as a chain ends
  - [ ] The roll out of a swing and the guard's raise move the point 0.4–0.8 m in a frame (left: both must be instant)

## M1.24 — Wuxia-flow swings, the dashing cleave, the cross ward, a narrow cape (2026-11-13, `player/wuxia-flow-swings`, ADR-071 – ADR-074)
- [x] Swings as keyframed clips (`swings.js`): a one-handed chain, 13 looks, no two hits in a row in the same plane (ADR-071)
- [x] The charged attack: a two-handed charge beside the head, the dashing cleave, a heavier hit (ADR-072)
- [x] The guard: a deeper, side-on cross ward, the hands before the chest; the cloak: a narrow cape (kept by the owner); the sword 12 % shorter (ADR-073)
- [x] After the first preview: a slower chain (a hit every ~0.42 s), he walks through it (the lead foot alternates), no elbow snaps, a composed free hand, no stop between hits (ADR-071)
- [x] After the second preview: every cut a diagonal, the blade whipping after the hand; the sword arc a line and a veil (ADR-071, ADR-074)
- [ ] Follow-ups:
  - [x] The owner's third look at the preview (merged; then "its too slow right now": M1.25)
  - [x] The finisher (the slam) on the clip system (M1.25)
  - [ ] The whirl: its feet turn on the ground with the spin (a pivot on one foot instead)
  - [ ] Cross-steps and retreating steps; the lunge's elbow still turns 42° in a frame
  - [ ] The cloak's arm drapes flick up when the arm whips home out of a swing
  - [ ] docs/art/hero.md still describes the two-handed swings and the thrust
## M1.23 — The Starless Lord: a third level (2026-11-13, `level/starless-lord`, ADR-068 – ADR-070)
- [x] Three arenas prototyped and rendered for the owner's pick; the Obsidian Throne Hall built
- [x] A shared duelist engine (`enemies/duelist/`); the Ash Disciple moved onto it, tests unchanged
- [x] The Starless Lord: four blade forms, four bars and deathblows, 31 moves, the Void spells, the
      throne intro; HUD pips, DEATHBLOW, a fourth phase in flow / feed / audio / Lab
- [x] `tests/integration/lord.mjs` (level, data, timing, forms, spells, bounds, flow, win)
- [ ] Owner review of the PR preview (`?level=starless`, and on the phone); merge
- [ ] A human playtest: is form 4's 0.36 s rhythm readable, is the blink fair, is he too long?
- [ ] Follow-ups:
  - [ ] Look at every move frame by frame up close (the somersault, the off-hand cuts, the staff)
  - [x] His look as options for the owner (M1.28: three heads on one harness; the owner picked the hood)
  - [ ] Sounds of his own: a blade hum and swing, thunder for the lightning, the ignition
  - [ ] The Void grip (lifted and held: mash to break free), designed and left out (M1.28 ships the
        Crushing Dark instead: a pin, no new hero state)
  - [ ] The crater on a phone (the hall is gone, ADR-112): on-device frame rate with the inlay batch,
        four vent lights and 36 breakables in one batch (desktop numbers: ADR-112)
  - [ ] A reward for beating him (ADR-059), once the technique system lands

## M1.22 — Controller support and remappable controls (2026-11-13, `input/gamepad`, ADR-066, ADR-067)
- [x] Gamepad as a third input source (`core/input.js`), the pad layer (`ui/gamepad.js`): souls-like
      layout, right-stick aim + auto-aim, title / pause menus, pad hints and PlayStation labels, rumble
- [x] Headless PAD scenario (fake standard pad → real Input); checked in the dev server with a faked pad
- [ ] The owner's check with a real controller (feel of the dead zone, the triggers, the rumble)
- [x] Remappable controls, keyboard + mouse and pad: the action layer, the CONTROLS panel, saved
      per browser, every on-screen key follows the bindings (ADR-067)
- [ ] Sound on a pad-only session (browsers need a key / click / tap for audio)
- [ ] A second key per action in the CONTROLS panel; mouse side buttons

## M1.21 — The hero at Shen Hui's size, a trimmed cloak (2026-11-12, `player/hero-size-cloak`)
- [x] The player drawn at 90 % (three sizes previewed beside Shen Hui; the owner picked one) (ADR-064)
- [x] The same cloak trimmed, the coat tails a little shorter (three cloaks previewed) (ADR-065)
- [ ] Follow-ups:
  - [ ] The owner's phone check of the preview
  - [ ] The owner's next asks, one at a time with previews: the face, a hood toggle, the swings

## M1.19 — The Ash Disciple: a second level, a human duelist (2026-11-11, `level/ash-disciple`)
Spec: `docs/specs/ash-disciple.md`.
- [x] Levels: `?level=ash`, a stage picker on the title, a LEVEL row in the Lab; the boss slot (ADR-058)
- [x] The Ashfall Courtyard: bonfire, a path and broken steps, a gate, a paved courtyard in a ring of
      pillars and lanterns, a fallen bell, burned trees, falling ash, thin grey grass
- [x] The Ash Disciple on the hero's skeleton: douli hat, grey robe, bracer and bell sleeve, a jian
      with a tassel; his own stance and keyframe moves (ADR-060)
- [x] Nine moves and a counter in P1, three more in P2, the Kindling transition; feints that never
      glint; Ash Crescent projectiles
- [x] His guard and counters, the Ghostep behind him, the execution thrust (ADR-061)
- [x] Owner rework: a small hat, a long slender jian in a high guard (pick C of three sheets), four
      new moves (Falling Star, Piercing Ash, Rain of Ashes, Hundred Petals), a PBZ-fast pace
- [x] The duel's moments (ADR-062): the full deflect, the blade lock, the mikiri, `flow.cinematic`;
      MOMENTS tests; film strips of each with real input
- [x] Owner rework 2 (ADR-063): the classic jian guard (pick A of three), the hand driven by the blade,
      PBZ-boss speed, step-ins that lead the hero, sprints, strings that stop, flask punish; hit stun
      both ways, the layered parry (freeze, shockwave, flash, clang, perfect slow-mo), his sweep trail;
      PRESSURE + IMPACT tests
- [x] Duel tests (`tests/integration/duel.mjs`: levels, data rules, timing, guard, deflect, Ghostep,
      execution, phases, flow, a bot win; `probe` opt-in); `npm test` + build green
- [ ] Owner review of the PR preview (`?level=ash`, and on the phone); merge
- [ ] A human playtest: is the guard readable, are the feints fair, is he too easy (bots: ~1 min)?
- Follow-ups:
  - [ ] **The reward** (the next PR, ADR-059): the technique system (slots, a meter filled by parries
        and perfect dodges, an equip screen) and his technique as the first one
  - [ ] Look at every move and reaction frame by frame (filmed: Plum Thrust, Swallow Flicks, Crane
        Spins, Rain of Ashes, Falling Star, Piercing Ash, Hundred Petals; the rest by the tests only)
  - [ ] The blade lock's mash rate on a phone (tap ATTACK): is 8 taps / s to win in ~1.5 s fair?
  - [ ] Sounds of his own: a jian whoosh per swing, a step / glide, the Kindling (today: the cues,
        the parry and block clangs, no creature voice)
  - [ ] His hit zones are not his blade: check the zones against the poses in the Lab hitbox overlay
  - [ ] The courtyard: a walled edge so the duel cannot drift out through the gaps between pillars
        (he is bounded; the hero is not), and the approach's own encounters (mobs: M2)
  - [ ] Rename `game.dragon` / `dragon:*` to `game.boss` / `boss:*` once the wyrm work has landed

## M1.18 — Attack variants, hair that reads, a fuller cloak (2026-11-12, `player/hair-depth-attack-variety`)
- [x] 2–3 looks per chain hit, picked at random; hips lead, weight shifts through every sweep (ADR-055)
- [x] Gold strands out of the hood, the face in its shadow (three previews; the owner picked one) (ADR-056)
- [x] The cloak stands off his back: depth in profile, the same width from behind (ADR-057)
- [ ] Follow-ups:
  - [ ] The owner's phone check of the chain and the look
  - [ ] Variants for the sprint slash, the roll cut and the charged attack (now the cleave, ADR-072)

## M1.16 — Breath-born bullets, perfect-parry returns, Armageddon (2026-11-11, `dragon/breath-armageddon`)
- [x] Ground warnings heat the ground (glyph glow + scorch heat, the edge late): no red rings,
      `!` marks or chevrons anywhere (ADR-052)
- [x] A perfect parry (0.08 s) returns embers / wisps as damaging shots; a 120 HP budget per
      pattern (ADR-051)
- [x] Every bullet is breathed from the jaws along the head's aim; Ember torrent, Cinder burst,
      denser Wisp swarm, Scouring breath; "Hard" numbers (ADR-050)
- [x] Armageddon replaces the Meteor rain: a salvo into the sky, waves over the whole clearing with
      safe ground kept, burning P3 craters, a great meteor (ADR-053)
- [ ] Follow-ups:
  - [ ] The owner's phone test of the preview (frame rate, bullet and heat-glow readability)
  - [ ] A human playtest of the Hard patterns, the 0.08 s return window and the return budget
  - [ ] Watch the P3 crater ticks (a hero who never steps out takes many) and the Scouring breath's
        single crossing of a standing hero
  - [ ] Melee perfect parries (out of scope here: the flag is computed for every parry)
  - [ ] Re-run the `win` / `probe` bots and the AI pick shares with the new patterns
  - [ ] Bullet sounds of their own (a cough, the stream) beyond the breath loop

## M1.15 — Two hands, a raised guard, idle life, gold hair (2026-11-12, `player/two-hands-idle-life`)
- [x] Both hands on every swing and the stab; the off hand closes round the grip (ADR-046)
- [x] A two-handed guard, the blade raised ~50° across the body
- [x] Idle actions: look, stretch, inspect, twirl, shoulder rest, lean on the sword (ADR-047)
- [x] Cloak sheets keep out of the blade; the charge's blade clears the cloak (ADR-048)
- [x] A rounder hood worn back, gold hair, a warmer face (ADR-049)
- [ ] Follow-ups:
  - [ ] The owner's phone test of the look and the motion
  - [ ] The arms through the cloak at the sheets' roots; the twirl through the cloak
  - [ ] The left arm locks at the end of the two-handed stab and the slam

## M1.14 — A hooded cloak, arms that bend, fewer draw calls (2026-11-11, `player/natural-arms-mobile-perf`)
- [x] The Shrouded set as the default outfit: hood, wrap tunic, bound sleeves, tattered cloak (ADR-043)
- [x] Swings with a bent elbow and a trailing blade; no pose locks an arm straight (ADR-044)
- [x] Rigid batching: the hero and the wyrm draw one mesh per material and one shadow mesh each;
      509 → 56 draw calls in the fight on the phone preset (ADR-045)
- [x] One scene matrix update per frame; LOW quality uses a 1024 shadow map; `?nobatch` for an A/B
- [ ] Follow-ups:
  - [ ] The owner's phone test: frame rate with and without `?nobatch`, and how the motion reads
  - [ ] Cloak collision (legs, ground, coat tails) and a calmer cloak in the roll
  - [ ] The slam's windup still bends the wrist 145° for ~3 frames
  - [ ] Idle, block, heal, roll, thrust, stagger, knockdown, death and plunge with the new outfit
  - [ ] Re-measure damage per second and the bot win time after the arm changes
  - [ ] docs/art/hero.md: the Shrouded set and the new arm

## M1.13 — Hands, the five-hit chain, equipment slots (2026-11-11, `look/hero-hands-combo-slots`)
- [x] Real hands: a fist round the grip, a left hand with fingers (ADR-041)
- [x] Idle: the blade low at his side, edge down; a slim side profile (cape, coat)
- [x] LMB chain of five (falling cut, rising backhand, whirl, stab, slam); sprint slash; roll cut
- [x] Gear slots as data, `player.equip` / `setLoadout`, the undersuit (ADR-042)
- [ ] Follow-ups:
  - [ ] A human playtest of the new chain (pacing, the whirl's exposed back, the sprint slash's aim)
  - [ ] Weapons of other lengths: the animator, the hit segment and the blade FX read `DIM`
  - [ ] A per-slot swap that keeps the pose; per-item materials and stats (a hood that hides the
        hair: done, ADR-043)
  - [ ] An inventory / equip menu (a second gear set exists: the Shrouded set, ADR-043)
  - [ ] Heal, stagger, knockdown, death and plunge poses were not re-checked with the new hands
  - [ ] docs/art/hero.md still describes the lean build, ADR-038's idle and the three-hit chain

## M1.12 — Hero review: athletic build, idle sword hold (2026-11-09)
- [x] Athletic build: broader chest and shoulders, thicker limbs, head ×1.08 (ADR-040)
- [x] Idle: shoulder-width stance, the blade out to his right side, visible from the game camera
- [x] Light-attack recovery comes home round the front; tip streak on the point
- [ ] Follow-ups:
  - [ ] Facing west / north-west the idle blade is still hidden behind him at the game camera
  - [ ] Heal, stagger, knockdown, death and plunge poses were not re-checked with the new build
  - [ ] docs/art/hero.md still describes the lean build and ADR-038's idle

## M1.11 — Bullet hell and the moonlit sword (2026-11-09, `combat/wyrm-bullet-hell`)
- [x] A 1.25 m blue-white sword; the idle holds it at his right side, clear of the coat (ADR-038)
- [x] The bullet field: embers and homing wisps to deflect / block / roll / cut, red orbs to dodge;
      every bullet cues before it lands (ADR-039)
- [x] Four patterns: ember storm (spirals), cinder fan (wing volleys), wisp swarm (homing), fire
      wheel (sweeping beams)
- [x] Two more strings (Storm flurry, Cinder flurry with scattered embers); shorter idle gaps;
      `damageScale` 0.85
- [x] Fire look: breath, fireball, claw wakes, slam bursts, the parry clash
- [ ] Follow-ups:
  - [ ] A human playtest of the difficulty (bots only so far) and of bullet readability on a phone
  - [ ] Re-measure the AI pick shares with the six new attacks in the pool
  - [ ] Bullet sounds of their own (the patterns reuse the fire casts; a deflect reuses the parry)
  - [ ] Look at `slamBurst`, the Storm flurry and the frame cost of a phase-3 storm on a low-end device
  - [ ] The drawn steel is 0.44 m shorter than the hit segment: decide whether to shorten the reach

## M2 — The boss rush's foundations (revised 2026-11-12, ADR-059)
- [ ] Techniques: a slot system, a meter filled by parries and perfect dodges, an equip screen; the
      Ash Disciple's technique first (the next PR). The store it can read exists: `game/unlocks.js` (ADR-146)
- [~] Fixed rewards per boss: the first, One Breath (the Sheathed's draw-slash, ADR-146), and the second, the Long Second (Xin Yi's lean, ADR-158), ship; the rest (techniques, weapons, abilities, elements); weapons of other lengths
  - [ ] The Thousand-Body Fox's Paper Double (a decoy the foe strikes instead of the hero): recorded on the level, not usable (ADR-148); needs the technique slot, a button on every input, a target indirection in every boss's AI
      (the animator, the hit segment and the blade FX read `DIM`)
- [ ] A hub that links the levels (the bonfire), and a boss-rush mode (refights back to back, a timer)
- [ ] More duelists from the roster (The Moth, The Bell-Warden, The Calligrapher, The Iron Abbot)
- [ ] Regular mobs (2–3 types) on the approaches, using the shared combat system and tell rules
- [ ] Save / load (localStorage), settings menu (keybinds, volume, quality)
- ~~Character stats, levels, XP; loot rarity~~ (dropped: fixed rewards, ADR-059)

## M3 — World (v0.4)
- [ ] Zone streaming: multiple connected areas, transitions, minimap per zone
- [ ] Data-driven zone layout (sketch → procedural props)
- [ ] NPCs, dialogue, quests; bonfire/shrine fast travel
- [ ] Day/night + weather (rain glyphs)

## M4 — Online (v0.5+)
- [ ] Netcode prototype (authoritative server, WebSocket), other players visible with name tags
- [ ] Party, chat panel (the log tabs become real channels), co-op boss fights
- [ ] Accounts, persistence

## Tech debt / ideas
- [ ] Front-on reach: at ×1.25 the wyrm's chest sits above sword height, so only the overhead
      combo hit lands from straight ahead (flanks/behind are fine) — consider a lunge or hitbox lift
- [x] Hero readability at default zoom (~4 cells wide): consider a stronger rim or a ground ring
      (drawn bigger and leaned, ADR-017; a dark figure with a rim and a halo, ADR-021)
- [ ] Separate freeze vs slow-mo timers in `game.hitstop` (today actors guard against it)
- [x] Merge static dragon parts (spikes/horns/claws) to cut draw calls (rigid batching, ADR-045:
      181 parts in 14 world draws and 1 shadow draw)
- [ ] Fewer hero materials (18 world draws today), e.g. per-part parameters in a texture; grass is
      about 600k of the ~690k triangles a frame
- [ ] Dissolve-aware shadow material for dying creatures
- [ ] TypeScript or JSDoc types for the contracts once the API stabilises
