# Dev log

Chronological session notes — newest first. Each entry: date, goal, what changed, decisions,
verification, open issues / next steps. Keep entries short; link commits/PRs when available.

---

## 2026-11-15 — Session 53: WHAT'S NEW in the game; the phone camera in a duel's moment; a game of its own

**Owner:** "On mobile theres a bug where after i lock onto the dragon target, the camera zooms in
really close. Fix that. Also add a changelog in the game menu with an indicator showing whats new
with all the version changes with notes on what changed. Also remove all text within the game, repo
documentation, and source files on all references to [the game that inspired the look] as i want
this to be my own thing now". Branch `ui/changelog-own-identity` from `main` (14cb0b2). Numbers:
PR #53 (heavy branches, open) holds ADR-115 and Session 52, so this is ADR-116 / Session 53 / M1.41.

**The lock-on zoom.** Not reproduced as described: on the phone preset (`?touch`, landscape and
upright) locking on (the real toggle and `_setLock`) at 6, 12 and 20 m from the wyrm, asleep,
waking and fighting, never brought the camera in: lock-on adds a pull-out capped at 3 m on a phone,
and the distance stayed 20 - 27 m. Two causes found that fit "zooms in really close": (1) a duel's
cinematic moments add `cine.zoom` (-9 / -7 m) unscaled, so on the phone the camera went from 16.7 m
(the duel camera, already in) to 9.3 m; scaled now like the punch (16.7 → 12.6 m, the desktop's share);
(2) iOS ignores `user-scalable=no` and nothing stopped a double-tap zoom of the page on LOCK (a
38 px button tapped twice to switch or drop the target); the touch layer now cancels `touchend` on
the canvas and its own controls, plus `gesturechange` and `dblclick`. Which one the owner saw is not
known: the second cannot be shown in the browser pane.

**WHAT'S NEW** (ADR-116): `ui/changelog.js` (releases as data: LATEST, 0.4.0 ... 0.1.0, 55 entries of
two or three player-facing notes each, rewritten from CHANGELOG.md), `ui/changelogPanel.js` (the
panel, read ids in localStorage), a corner button with an "N NEW" badge on the title, an item with
"N NEW ›" in the pause menu, the gamepad (walk to it on the title, B / Menu / A close, the stick
scrolls), Esc closes it without pausing or starting the game. `tests/changelogcheck.mjs` added to
`npm test`. CHANGELOG.md had three "N pieces of work since 0.4.0" lines from merges: one now.

**The inspiration's name** is gone from CLAUDE.md, README, STYLE (its first section is "The founding
look (v0.1)" now, the creator's quote paraphrased), DECISIONS (ADR-001, ADR-098's context), DEVLOG
(Session 1), ROADMAP, CHANGELOG (0.1.0), `cameraRig.js` and the title's credit line, which now reads
"prototype v0.4.0". Git history still has it (rewriting `main` is not possible under its protection).

**Verification:** `npm test` (all suites + the glyph and changelog checks) and `npm run build` pass. Browser pane, phone
preset 852 x 393: the title's badge (17 NEW on a first visit), the panel over the title (the game
does not start, Esc closes it, the badge clears and stays cleared after a reload), the pause item
("1 NEW ›") and the panel over the pause menu, above the touch controls' peek (it was under them).
The cinematic re-measured on the Ashfall Courtyard.

**Not checked / open:** the owner's iPhone (the lock-on report, the `touchend` guard, the panel's
scrolling); a gamepad on the panel (code path only); portrait title layout with the corner button.

**Follow-up:** the owner: it happens without lock-on, every time. A scripted walk from the title to the
waking wyrm and a 12 s fight on the phone preset: the camera never under 20 m. So the page zoom: every
double tap is guarded now (menus get the click by hand), a zoomed page is reset through the viewport
meta, and `?camdebug` prints page scale / camera distance / canvas size on screen for a phone report.

**Next:** the owner tries the Vercel preview on the phone (with `?camdebug` if it still happens); cut
0.5.0 when they want a version line.

---

## 2026-11-15 — Session 52: a heavy button; five heavy branches off the chain; the charge on the heavy

**Owner:** "Yes, ask me first" (the genre review's heavy button). Asked, answered: heavy branches off
the chain, hold heavy to charge, a fourth tile on the phone (2 x 2), heavy on the right click (then:
the guard on the middle click). Branch `player/heavy-branches` from `main`, own worktree. ADR-115 /
Session 52 / M1.40 (PR #49 took ADR-114 and Session 51 while this was open; #50 took 113).

**Done** (ADR-115):
- `combat.js` `HEAVY` and `heavyAfter`; four two-handed clips in `swings.js`; the Earthbreaker on
  the slam clip with a higher leap.
- `player.js`: the heavy press (`this.hb`, was `lmb`) buffers 'heavy'; from a light's recovery it is
  that light's branch; held 0.3 s it is the charge. A light never waits at its coil.
- Bindings v2; the 2 x 2 touch pad with the charge meter on HEAVY; help, title and pad texts.
- Training: the five heavies; every situation starts on a restored set.
- **Tests:** the guard on button 1 and the charge on button 2 everywhere (main's new tests too);
  REACH swings every heavy at 0 - 3.5 m; duel HEAVY; TOUCH (the HEAVY tile, its charge, a held ATTACK
  is a light, the 2 x 2 edges); REMAP (the new defaults, a v1 save not read); the held-light test
  rewritten (a held light cuts at once).

**Verification:** `npm test`, `npm run build` (see the PR). In the dev server: the phone pad at
852 x 393 (`?touch`) and a film sheet of the five heavies at the game camera beside Shen Hui.

**Not checked / open:** no human has played them; the clips were looked at as a sheet of stills, not
in motion, and not from four sides; the phone pad's feel under a thumb; the wyrm and the Lord with
the heavies by eye.

**Next:** the owner's look at the sheet and the preview; then HP-linked posture for every boss.

---

## 2026-11-15 — Session 51: the hero's stance: at ease, and a fencer's guard in a fight

**Owner:** "review the current character posture, angle of the right hand sword when the character
is not attacking. i want the characters hands to have some kind of cool looking idle motion/stance
where it looks natural and cool. something about the current idle animation is bothering me. ask me
questions to help you and come up with 3 different variations for me to review and approve on a
final one". Branch `player/idle-stance` from `main`, in its own worktree.

**Measured first** (the stance as it shipped, filmed at the game camera from four sides and close
up): the blade 52° down and 79° out from his front, 27° out of line with the forearm, from an elbow
tucked at the ribs; both hands beside the hips at 0.95 and 0.92 m; over a 2.4 s breath the hands
travelled 1-3 cm, under half a pixel at the game camera; no idle action ever while locked on.

**Asked, answered:** what is off (ticked: the stiff bent wrist, arms that hang like a mannequin's,
a statue; not ticked: "the sword sticks out sideways"); the three options to span three attitudes;
two stances (exploring / locked on); "alive, not busy".

**Rendered for the pick:** three styles behind a temporary `?idle=a|b|c` switch and a Lab row, each
an explore pose, a fight pose and its motion: A "At ease" (a hand on the belt, the blade down the
arm's line; a fencer's guard), B "Coiled" (both hands on the grip, low; a deep middle guard), C
"Hidden blade" (the sword reversed behind the arm, a sword-finger seal; the fingers at the foe).
Sent: one overview sheet, and per style a detail sheet and a 6 s loop (close up and at the game
camera). The owner picked **A**, the motion "about right", and the fight stance for "lock-on or
boss fight". B, C, the switch and the reversed grip's wrist range are gone.

**Done** (ADR-114):
- `stances.js`: `atEase` and `fencerGuard`, the free hand on the belt in both (`BELT`), the life in
  them (`STAND_LIFE`). `anim.js stand()` writes them over `guard()` for the hero's animator only;
  `loco()` and an attack's way home use it. `guard()` stays the base of every other clip and of a
  duelist's footwork.
- `HeroAnimator.fightW`: the guard while locked on or in `bossIntro` / `boss`; up in 0.38 s, down
  over 0.88 s. Idle actions play at ease only.
- A transition audit against `main` (13 transitions, the fastest frame of six points) found and
  fixed: in a fight he now keeps the guard up on the move (trailed, the point swung 16-18 cm a frame
  at every start and stop; 2.6-3.1 now, under the old stance's 4.6-11.4); a roll and a backstep
  ease the sword arm out of the guard (the point moved 173 / 118 cm a frame inside the cross-fade;
  46 / 22 now); the blade settles into the stance over 0.24 s on the way back.
- Found at the game camera: two fight blades stood edge-on to the camera behind him and vanished
  (the flat is up now), and pointed straight ahead they stood behind his own head (they point a
  little out to the sword side).
- Found by the tests: the fingertips of the hand on the belt 2.7-3.8 cm in the hip, and the palm
  hovering 9 cm off the waist (it is 2.7-3.2 cm off it now and turns with each stance's chest); the
  hips whipped 16.8° in a light's first frame out of the guard (half of the turn moved to the
  waist); the guard's sword elbow 0.52 out to the side (0.23); the front foot did not turn with a
  light's pivot (its toes are out like the swings' own stance).
- The Lab: PLAYER → stance (auto / at ease / fight; `player.debug.fightStance`).
- Tests: `herostance` (16 checks: the rule, the wrist, the hand on the waist, the flat to the
  camera, the life, the transitions, `guard()` untouched for a duelist). Seven checks that
  described the old stance rewritten (the free hand at rest, the arms at rest, the idle breath, the
  idle actions' count, three outfits' hem heights). Two relaxed, with the reason beside them: the
  ribbon landing in a knockdown (5 → 10 cm: the hilt falls from higher) and the fighting bot's
  guard breaks (0 → at most 1: the default seed's fight is reshuffled; seeds 1-6 give 0 on both
  stances).

**Verification:** `npm test` (integ, duel, lord, world, the glyph check) and `npm run build` pass
on the branch merged with `main` (10891c3). Filmed in headless Edge at 1376 x 768 on the dev
server: both stances at the game camera with him turned four ways and close up from four sides
(the game's look and the bare body); the hand on the belt close up from five sides; the standing
loop; a played sequence (at ease, a lock-on, a strafe and a stop in the guard, two lights, the
fight ending). The Lab's stance row was driven in the Browser pane. The numbers above are
`herostance`'s output and the audit's.

**Not checked / open:** a fight played by a human with it; the phone (look and feel); the Ashfall
Courtyard and the Obsidian Throne in the browser (headless tests only); the outfits other than
today's in the new stances; the idle actions were not re-tuned for the new base (each fades in from
it: looked at, not measured). The free hand's fingers lie straight along the hip (the hand has no
finger joints): 7-9 cm of them stand off the belly's curve.

**Next:** the owner's look at it in play (the Lab's stance row holds either stance); then the idle
actions re-posed from the hand on the belt if they read wrong.
## 2026-11-15 — Session 50: effects in the dragon's letters (the fire field), text effects, landmarks second pass

**Owner:** "is there anything existing we should update? ... i want people to be stunned at the ascii
style and amazed how text can make such detailed 3d objects that look great in animation and effect
wise", and "all the spells, effects, etc need to look as realistic and cool as possible. for example,
the dragon fire attacks look meh". Sent a sheet: the breath as it was (A), a prototype of fire as one
body of small digits, calm (B) and hot (C), and a list of four things to update. Answer: "Do all 4
and create parallel subagents to work on each task". They did not choose between B and C: B is built
(my pick: closer to the wyrm's calm tone; `hdr` in `firePalettes.js` is the one number for C).
Branch `fx/real-fire`. (Numbers: open PRs hold ADR-108 – 111 and Sessions 45 – 47, so this is ADR-113
/ Session 48; the Obsidian Throne's rebuild then merged first as ADR-112 / Session 48, so this is
ADR-113 / Session 49.)

**How it was run.** The lead built the core first (`render/fireField.js`, the breath on it, the test
harnesses), because three of the four tasks stand on it, then four agents worked in parallel, each
in its own worktree and branch with a file list of its own, filming on a headless Edge on the real
GPU: the landmarks; the wyrm's fire; the human bosses' effects and the timing cues; the text effects.
The four branches merged without a conflict. `main` had moved by four PRs meanwhile (ADR-101, 102,
106, 107): merged in, four conflicts, both sides kept.

**Done** (ADR-112):
- **The fire field** (`game.fx.fire`): blobs of heat that add up in a buffer with one texel per
  letter cell; a flame pass per cell; a print pass in the wyrm's letters. Kinds: fire, void, steel,
  smoke. Looks in `render/firePalettes.js`.
- **On it:** every fire of the wyrm (`dragon/fx.js`, `bulletFx.js`), the bonfire, scorched ground's
  smoke, the braziers, and, after the merge of `main`, ADR-107's ground fire and burning trees; the
  Ash Disciple's and the Starless Lord's effects (`duelist/fx.js`, `starlessLord/fx.js`).
- **One set of timing cues** drawn by `DuelFx.tellFlash` for all three bosses (the wyrm at 1.5x).
- **Text effects:** heat haze, letting go (`render/letGo.js`), shed digits (`render/shedDigits.js`),
  the breath's charge rising from the belly.
- **Landmarks rebuilt and moved** to where the duel's camera looks (see the ADR for the list).
  The forest's new breakables (ADR-107) keep off the landmarks' footprints.

**Checked.** `npm test` (integ, duel, lord, world, the glyph check) and `npm run build` pass on the
branch with `main` merged in. On film (headless Edge, RTX 4090, 1280x720): every converted effect
before and after (sheets by each agent), the three levels loading and every boss ability triggered
once with no console error, the wyrm's death, the breath setting the grass alight, the wyrm's blue
cue. No breakable overlaps a moved landmark's collider (checked in the page for the three levels).
Frame cost against a clean copy of `main`, render + a 1 px read-back, medians, twice each:
1080p 2.1 – 2.4 ms on both, calm and mid-breath; 2160p 3.2 ms calm on both, 3.5 against 3.2 – 3.3
mid-breath. Equal within noise on that GPU.

**Not checked.** A phone (look and frame rate); anything in motion at real speed by eye (stills and
strips only); low frame rates; the Lord's intro camera now that the wardens left the throne; the
haze beside the human bosses' new effects; the wyrm's red cue on film (the frame fell between
tiles); 1080p / 1440p cell sizes for the text effects; a hero standing in front of the dissolving
body. The sims compile no shader and build no `ShedDigits`: the text effects are covered by film only.

**Known weak spots** (each agent's own list, in the ADR and the roadmap): fire cannot hug the ground
(blobs under 0.7 m fade into it); tongues always climb up the screen; the flame wall is a band, not
tall, from the steep camera; the bonfire and braziers are redder and dimmer than before; red cues
and red rings are fire at a low heat, not a crisp red; the Lord's spells changed colour (red to white
and violet); the throne hall's landmarks are the weakest; the dying wyrm's eroding edge has a black
fringe; the throat tell is a modest gain.

**Left out on purpose.** The hero's effects: PR #39 and the branch `player/sword-fx` were changing
`player/fx.js` and `combat/*`. The wyrm's blue and red wisps and orbs: colour signals.

**After the Obsidian Throne's rebuild merged (ADR-112).** The hall is gone: its wardens, great swords
and braziers are no longer placed, so this session's moved bronze wardens and brazier flames are not
in the game (the builders stay in `landmarks.js`). The crater's vents burn in the fire field instead.
Not filmed: the new crater with the Lord's effects on the field.

**Next.** The owner's look at the sheets and the preview (palette B or C, the Lord's colours, the
moved landmarks); the phone; then the hero's effects and a crisp red kind.
## 2026-11-15 — Session 47: the Ash Disciple uses the courtyard (four terrain moves)

**Task** (from the session that built the destruction system, ADR-107): give Shen Hui moves that use
the Ashfall Courtyard's pieces. Branch `claude/ash-terrain-moves-12f7d8`, cut from `world/destruction`
and rebased onto `main` once PR #44 had merged. Numbers reserved for it: ADR-111, Session 47.

**Found first:** he is bound to 12.5 m and only the bell and the stele stand inside that; the pillars
ring the paving at 15.6 m, the lanterns at 17.4 m. So each move takes him out to its piece and his
bound stretches for it (ADR-111).

**Done** (ADR-111; COMBAT.md → "He uses the courtyard"):
- `ashDisciple/terrain.js` (`TerrainMoves`): which piece, how he gets to it, what the piece does.
  Four moves as data in `moves.js`, numbers in `TUNING.terrain`: Severed Pillar (white cut, the fall is
  the world's red), Flying Lantern (blue, cued on the piece), Three Tolls (white, white, blue rings of
  sound), Swallow's Return (blue, off a pillar; wanted 2.4 x as much when he is pressed).
- Two generic hooks in `duelist/brain.js`: `weigh(name, def, w, dist)` in `_choose`, `onActStart(act)`
  in `startAct`. Nothing else in the engine changed; no `src/world` file changed.
- Training: a TERRAIN category (six situations that stage each move and put the courtyard back).
- Tests: `duel.mjs` `build({ real: true })` (the real courtyard and its breakables), scenario TERRAIN
  (50 checks), TRAINING on the real set (70 situations), DATA / TIMING know a `cast` and skip the
  terrain moves on the mock.

**Filmed** in headless Edge at 1280 x 720 at the game camera (a wrapper page stepping the game with
`__tick`): one strip per move, and Three Tolls at 852 x 393 with the phone camera. Sent to the owner
with one line per move on what it asks, and two looks for the ring of sound ("arc": one crisp line of
strokes; "wave": three thin ripples). The owner picked **"A: arc"**; the wave look and the
`TUNING.terrain.toll.look` switch that held it are removed. Nothing was said about the moves themselves.

**Changed after the first film:** the kick drew the blade's sweep trail (it read as a cut: `noSweep`);
the lantern's landing mark was a dark ring nobody could see on the night paving (now pale motes); the
glide's streak was too bright.

**Verified:** `duel.mjs` all, `lord.mjs` all, `world.mjs` all, `integ.mjs` all, the glyph check and the
build (see the PR). **Not verified:** a human duel with them, a phone's frame rate with three rings on
screen, the Lab panel by hand (the abilities list is read from `debug.abilities()`, which the tests
check).

**Open / next:**
- The bell has no toll sound of its own (the world's metal `chip` plays): `src/audio`.
- `courtyard.js` builds two pillars on the same spot at three corners of the ring (the loop adds
  `[t, -P]` and `[P, t]` for the same corner): seen while listing the pieces, not touched (not this
  session's file).
- Phase 2 only shortens the windups; a kindled variant (a burning lantern, ember rings) would fit.
- Training's BOSS MOVES trigger a terrain move from where he stands (the nearest piece however far);
  the TERRAIN category is the staged version.

---

## 2026-11-15 — Session 46: the Cinder Wyrm uses the ground (three terrain moves)

**Owner:** "the dragon will pick up a tree or item on the ground and throw it at the player ...
think of fun cool epic different terrain interactions the bosses and players". One of the staged
sessions after the destruction system (ADR-107). Branch `claude/dragon-terrain-moves-97933f`, cut
from `world/destruction` and rebased onto `main` once PR #44 had merged.

**Done** (ADR-110):
- `tuningTerrain.js` (numbers), `terrain.js` (`dragon.terrain`: the piece in the jaws and in the air,
  the mark, the blow, the burning wreck; the pickers `jawsPiece` / `tailPiece`), `terrainAttacks.js`
  (`hurl`, `tailBat`, `fireBrand`), wired into `ATTACKS`, `TUNING.attacks`, `dragon.js` (update,
  reset, the tell part `'piece'`).
- Uproot and hurl (red, P1), Tail bat (blue, P1; cover stops the boulder), Firebrand (red, P2+; the
  wreck burns 3.4 s). A move is picked only with a piece in reach; forced with none it casts about.
- They are in the Lab's ABILITIES and Training's BOSS MOVES (both read `debug.abilities()`).
- Tests: `integ.mjs` scenario TERRAIN (56 checks) on real `Destructibles` over a hand-built set
  (`build({ terrain })`); LAB runs on a grid of pieces and restores them before each ability.

**Shown to the owner:** a sheet of film strips (headless Edge, 1280 x 720, the game camera, lock on):
the three moves with one line each on what they ask, the hurl at 852 x 393 (`?touch`), and one pick:
how it holds a tree (A over the shoulder; B upright). **The owner picked "A: over shoulder"**: the
upright hold and its temporary `?hold=` switch were removed.

**Decided on the way:** the pale dust mark was dropped after filming (invisible on the night grass);
the hold "across the jaws" is not offered (the world's flight would snap it upright at the release);
the weights were raised from ~1.6 to ~3 after a bot fight picked a terrain move once in 25 attacks.

**Verification:** scenarios TERRAIN, LAB and TRAINING pass after the rebase; the full `npm test` and
`npm run build`: see the PR's check. Filmed: each move from the Lab trigger with the hero 16 – 20 m
off, on the real forest.

**Not checked / open:** a fight played by a human (how often the moves come up on the real clearing:
its pieces stand 14 – 28 m out; the difficulty); the phone on a device (look, frame rate); frame time;
the moves with the hero SOUTH of the wyrm at 18 m+, where the game camera cuts the wyrm's head off
the top of the screen (the mark and the piece's flight are on screen, the bite is not); the lab
stage has nothing to take; no sounds of their own.

**For the world's side (not edited here):** `throwTo` starts every flight upright with one spin axis,
and nothing bursts a held piece at once (`drop` and `throwTo` take at least 0.25 s): a `burst(piece)`
and a start angle would allow a flat-spinning trunk and a boulder that stops dead on cover. The
falling-tree strip is drawn in tell red on the ground, which ADR-052 ruled out for footprints.

**Next:** a played fight on the PR's preview.

---

## 2026-11-15 — Session 49: the Starless Lord uses the crater (three terrain moves)

**Owner:** "the 3rd sith boss will use the force to pick up rubble or the pillars to throw as examples.
think of fun cool epic different terrain interactions". Branch `claude/lord-terrain-moves`, stacked on
the open crater (PR #47, ADR-112).

**Done** (ADR-109):
- `starlessLord/terrain.js`: Void Hurl (one piece lifted and thrown), Glass Rain (three, one after
  another), Crown Fall (a tall piece beside the hero wrenched down on him). Data in `moves.js`
  (`terrain: kind`), numbers in `TUNING.terrain`; hooks in `lord.js` (`weigh`, `onActStart`, the cast,
  the frame).
- The duelist engine's `weigh` / `onActStart` hooks, copied from PR #46 (ADR-111) so both merge.
- The hanging stones are built on the floor and hung by their bodies' offset (`def.hover`), so a
  thrown one comes down to the floor. Torn Stone scars the floor where each stone is torn out.
- Training: a TERRAIN category for him (three situations), shown only on a level with pieces.
- Tests: `lord.mjs` TERRAIN (21 checks: no pieces → no move; each move's piece, ring, glint and blow;
  out of the ring; a stagger drops the stone; shards once the stones are gone; the reset; 90 s with
  the AI on; every answer escapes each move, standing still does not), and the TRAINING scenario now
  runs on the real crater.

**Filmed for the owner** (headless Edge, the real GPU): one sheet of film strips, the three moves at
1280 x 720 and Void Hurl at 852 x 393. Sent; no answer yet.

**Verification:** `npm test` (five suites) and `npm run build` pass.

**Found on the way:** a piece lands where its PIVOT meets the ground (`destructibles._fly`), so
geometry built in the air bursts in the air: build it on the floor and lift the body. A held piece
3.6 m over his head is off the top of a phone's screen. Training's runner records a fixed list of
events and does not answer a flash marked `hazard`: its situations for thrown pieces can only stand
and take it. `debug.setForm(1)` emits an uncatalogued event: a staged situation must not step him
back a form.

**Not checked / open:** a fight played by a human; whether the moves make him easier or harder (a
bot stood still for them); the phone in the hand; how the crater looks after a long fight when most
shards are thrown; sounds (the throw reuses the world's crash).

**Tuned** (the owner: "Keep and tune"): bots that answer each move (roll at the glint, roll or run
as the ring appears, keep running one way). With the first numbers only rolls escaped; now (flight
0.9 – 1.2 s, ring 2.1 m, aimed 0.15 s ahead, the rain's spread 1 m) every answer escapes and standing
still is hit; TERRAIN asserts it (ADR-109). The hanging stones drift slowly up and down. Found: a roll
tapped with no direction is a backstep, whose i-frames end before a red glint's blow lands.

**Next:** a played fight: his weights for the three moves, and whether 0.9 s is too generous.

---

## 2026-11-15 — Session 48: the Obsidian Throne rebuilt open (Starfall)

**Owner:** "i want you to redo the sith lord level as the levels in general should not be so confined
... the walls are also adding a visibility issue so make it more open, cool interesting
objects/structures/terrain etc that will make the gme look stunning in ascii theme and also for the
player bosses to interact with." One of the staged pieces of M1.38 (Session 44 built the destruction
system beside it). Branch `claude/level-open-throne-d3eabd`, on top of `world/destruction`.

**Rendered for the pick:** three open arenas behind a temporary `?arena=a|b|c` switch (Starfall, the
Grave of Blades, the Broken Hall), each at the fight camera (1280 x 720), walking up to the throne,
pulled back to show the whole arena, and at 852 x 393 with the touch preset; one sheet of all three
and one per arena, with a line on what each gives the fight. The owner: **"A Starfall"**.

**Done** (ADR-112):
- `world/throneHall.js` is the crater: rings of plates round the seal, the star as his throne
  (`landmarks.js` `buildFallenStar`, `buildSpike`, `starCleft`, `facetCol`), twelve shard clusters,
  six stones hanging in the air, four vents, a broken crown of rim slabs (low south, tall north), the
  forest outside thrown flat. Layout `THRONE`. The switch, the two other concepts and the hall's
  walls, pillars, braziers, wardens and great swords are gone from the level.
- 36 breakables in ADR-107's shape (shard 19, slab 11, hover 6), an ember `scarInk`.
- `levels/starless.js`: the lip at z 14.8 is where he wakes; `dragonBound` 13.6 and `bossFloor.zN`
  (the dais's line); two lines of text. The Lord's `TUNING.hall` rectangle is gone: `bound` 13.6 and
  `clampTarget(p, pad)` / `onFloor(x, z)`.
- `duelist.js`: `standable(x, z)`; a flurry's blow comes from a side of the hero he can stand on
  (at the rim his flits were pushed back onto his floor and whiffed).
- Tests: `lord.mjs` LEVEL (the layout, the breakables' shape, "open" as three checks, the vents),
  BOUNDS (a hero at the rim), FLOW (the lip); `world.mjs` `sets` lists the throne.

**Verification:** `npm test` (five suites) and `npm run build` pass. The final build rendered in
headless Edge with the real GPU and compared with the frames the owner picked from: 0.07 – 0.21 % of
pixels differ (particles). The walk in from the bonfire looked at too. Frame cost against the hall:
ADR-112 (fewer triangles and lights, one more draw call, render time 0.85 – 1.03 of the hall's).

**Found on the way:** separate timing runs are useless while other sessions use the GPU (the hall
itself read 2 ms, then 19 ms): put both builds in one page (a second checkout served under a path of
the same origin) and alternate the renders. A single render is shorter than a display refresh and
reads as a multiple of it: time 12 – 20 passes, then wait for the GPU once. 60 % of the hall's
triangles were sparse grass out to 75 m that the fog hides. `Colliders.resolve` does nothing for a
point exactly on a circle's centre (a test probe has to stand beside it). A scar ink of 0.5 in the
red channel was invisible on the black floor at the game camera (the marks are alpha glyphs): the
crater's is 1.4, checked there.

**Not checked / open:** a fight played by a human in the crater; his difficulty there (thin cover,
no corners; nothing was retuned); the phone (frame rate on the device, the look in the hand); the
Training situations on the real level (they run on the lab stage); how long a shard cluster lasts
as cover in a real fight (one blast of power 2.5 broke a 3.1 m cluster and only chipped a 3.6 m one).

**Next:** the Lord's terrain moves on this floor (ADR-109): shards and hanging stones lifted and
thrown, a rim slab pulled down across the hero's path, a storm of rubble, Torn Stone tearing up real
plates.

---
## 2026-11-15 — Session 45: per-move telemetry; the death screen names the killing move

**Owner:** "Yes, telemetry" (the genre review's third piece). Branch `game/move-telemetry`, stacked on
`core/sim-step` (PR #43), own worktree. Session 45 / ADR-108: PR #41 and #44, open beside it, hold
Sessions 43 / 44 and ADR-106 / 107.

**Done** (ADR-108):
- `player.takeHit` announces every blow it resolves: `combat:answer`.
- `game/telemetry.js` `MoveLog`: a row per boss move (blows seen, hit, blocked, parried, clashed,
  dodged, damage, kills) for the attempt; totals per level in localStorage; a contact stream is one
  blow per 1.5 s.
- The death screen: "SLAIN BY <MOVE>" and up to three moves with "n of m blows landed", small and
  dim under the hint (`hud.bannerRecap`). The victory record: "Struck most by".
- `boss.attackLabel(id)` on the wyrm and the duelists; `flow.moveLabel`, `flow.deathRecap`.
- Console: `__telemetry()`, `__telemetry('all')`, `__telemetry('clear')`.
- **Tests:** duel TELEMETRY (the table by itself with a fake storage; in the duel: a string taken, a
  parry, a death, the recap in the banner, a new attempt after rising).

**Verification:** `npm test`, `npm run build` (see the PR). In the dev server on `?level=ash`: Swallow
Flicks taken, then killed by Lotus Sweep: the death screen at 800 x 600 and at the phone's 852 x 393
(`?touch`): three lines under the hint, clear of the banner, inside the screen.

**Not checked / open:** the wyrm's and the Lord's labels only by the tests' lookups (no death filmed
there); upright on a phone; nothing read back from a real play session yet. The phone has no way
to read the stored table.

**Next:** the owner plays; then tune from `__telemetry()`. The heavy button needs their answers.

---

## 2026-11-15 — Session 44: the world breaks (breakables, ground fire, cover, marks)

**Owner:** "i want all the bosses to be able to cause destruction to the background ... the dragon
fire that hits the background (trees, grass) get on fire and are a temporarily hazard ... the
humanoid bosses will chip and damage the structures and leave impact based on the power of the
attack. the players can also do this as well. i want the bosses to also use the terrain ... you can
also redo the backgrounds of the levels. i want you to redo the sith lord level ... ask me any
questions". Branch `world/destruction` from `main`. (Numbers: other PRs open at the same time took ADR-101 – 103 and Sessions 40 – 42, so this is
ADR-107 / Session 44; the hero seen behind the wyrm is ADR-106 / Session 43, the open Obsidian Throne
ADR-112 / Session 48 (renumbered when PR #45 took ADR-108 / Session 45) and the Lord's terrain moves ADR-109.)

**Asked, answered:** fire burns where it lands (no spreading); the terrain is a real tactic for the
hero (cover, pieces felled onto a boss); Cinderwood and Ashfall keep their layouts and get things to
break; "staged PRs and separate agents doing parallel tasks".

**Split:** two sessions were started on their own branches: the hero seen behind the wyrm (PR #41,
ADR-106) and the open Obsidian Throne with the Lord's terrain moves (ADR-112, ADR-109; it was sent
this API). This session built the system the rest stands on.

**Done** (ADR-107):
- `world/destructibles.js`, `fire.js`, `scars.js`, `breakTuning.js`; `world.impact / ignite / restore`;
  `Colliders.remove / restore`; the two set materials can be rigid-batched.
- Cinderwood lists 81 breakables (17 of them new, inside the clearing), Ashfall 72.
- The hero's blade and slam, the wyrm's striking parts, slams, meteors, fire and body, the duelists'
  zones, crescents, thrown stones and the Void's lines all hit the world; cover stops bullets,
  crescents, torn stones and stands in for the hero against the bolt, the pull and the grip.
- Sounds `chip` and `crash`; events world:impact and world:fire; the Lab's WORLD section (Burn ahead,
  Fell on me, Blast ahead, Restore) and its Reset restores the world.
- Tests: `tests/integration/world.mjs` (87 checks), added to `npm test`.

**Rendered for the pick:** three ways a broken piece comes apart (digits, chunks, shards; a
temporary `?debris=` switch) and the fire on grass and a tree, sent as two sheets. The owner picked
**"A: digits"**; the switch and the two other looks are removed. Nothing was said about the fire.

**Verification:** `npm test` (five suites) and `npm run build` pass. Filmed in headless Edge at 1280 x 720
on the dev server: a tree and grass set alight and burning out, a tree felled onto the hero (the red
strip, the hit), a stone chipped then broken, the hero felling a dead tree with two charged cleaves,
the wyrm's breath lighting the grass, and a 16 s fight with the AI on. Draw calls and triangles
against `main`: ADR-107.

**Found on the way:** `node_modules` in the main checkout was emptied while this session ran
(reinstalled; cause not found, the parallel worktrees are the likely one). The Browser pane was
hidden for the whole session and throttles timers: captures were made with headless Edge and a
wrapper page instead. A debris glyph under ~0.4 m is a dot at the game camera, and debris in the
material's lit colour bloomed white.

**Not checked / open:** a fight played by a human; the difficulty with breakables and fire; the
phone (look and frame rate); frame time; Ashfall and its duelist's blows in the browser (headless
tests only); Training places the hero without a look at what
stands there.

**Next:** the owner's review of PR #44; the wyrm's and the Ash Disciple's terrain moves and the open
Obsidian Throne run as their own sessions (started; the throne waits on the owner's pick of an arena).

---

## 2026-11-15 — Session 43: the hero seen through the wyrm (an ink ghost in the blade's cyan)

**Owner:** "i noticed while fighting the dragon the player disappears and cant see whats going on
if its behind the dragon. think of a good way to still let the player be seen somehow for these
situations." Branch `claude/render-hero-seen-125813` (PR #41), one of several sessions working in parallel
(destructible terrain, the open Obsidian Throne). ADR-101 / Session 40, set aside for this, went to
a PR that merged first; ADR-102 to ADR-105 and Sessions 41 / 42 belong to PRs open at the same
time (the terrain and throne work of this group, and #42 / #43).

**Reproduced** (dev server on its own port, the wyrm frozen in a pose, the hero placed round it):
north of its body, under a wing, behind it while it rears for Armageddon, under it while it flies
low; at 1280x720 and at a phone's 852x393 (`?touch`). In all four he is fully gone.

**Options rendered for the pick** (a temporary `?seen=a|b|c` switch; the same frozen frame in every
column; five situations on desktop, four on the phone, a film strip of him walking in under a wing,
whole frames): A ink ghost, B window, C rim only. The owner picked **A**. A draft PR carried the
switch so the three could be tried on the phone's preview.

**Done** (ADR-106):
- `pipeline.js`: `seenRT`, `setSeenThrough`, `_renderSeen` (the hero alone, the erasing quad, the
  patch into the scene target), `_seenProbe` (the occlusion-query gate), the ASCII pass's `tSeen` /
  `uSeen` / `uSeenInk` / `uSeenTone`, `seenHalo` over the wyrm's letters, one shared definition of
  the hero's alpha window. `main.js`: one line. `config.js`: `CONFIG.render.seenThrough`, `?noseen`.
- A human boss in front of him is never cover (he is drawn through the hero's materials); grass
  at his feet never counts.
- Tests: integ SEEN (51 checks, the real `Pipeline` on a recording renderer): when the pass runs
  and when not, its box, what it tells the ASCII pass, the state it leaves (also when a draw
  throws), its place in the frame, the probe (on from the first frame, off 20 frames after the
  last yes, on while no answer comes, off for good when queries fail), `?noseen`.
- Docs: ARCHITECTURE (the contract, the frame order), STYLE (the look; cyan is the hero's).

**Numbers:** in the open the frame is pixel-identical with the pass on or off (0 of 921,600
pixels differ); under a wing ~6,200 differ (the ghost and its glow, ~800 covered hero pixels).
Frame cost, Edge headless on the RTX 4090, 1280x720, medians of 12 x 60 frames, one task a frame:
in the open 5.24 → 5.22 ms (58 draw calls, 57 before); under a wing 3.85 → 4.37 ms; north of the
body 3.82 → 4.10 ms (78 draw calls). Without the gate: +0.44 ms and 77 draw calls everywhere.

**Verification:** `npm test`, `npm run build` (see the PR). Browser: the four situations and the
open at 1280x720, a wing at 852x393, the Ashfall duel (unchanged with the boss in front of him).

**Found on the way:** a `javascript_tool` call that runs too long is killed without its `finally`
blocks: a per-frame flag my first version flipped on the hero's root stayed flipped and he was
drawn at a stale place for the rest of the page load (the pass no longer touches that flag). An
occlusion query's answer never arrives inside one task, so frames stepped with `__tick` would have
switched the pass off: no answer for more than 3 frames counts as a yes.

**Not checked / open:** a real phone (look, frame rate, Safari's occlusion queries: if they throw
the pass runs every frame; if they never answer, too); the look in a played fight rather than
posed frames and one strip; 1080p and 4K by eye; the Obsidian Throne (being rebuilt in another
session). A cover closer than 0.6 m in front of him hides him without a ghost.

**Next:** the owner's phone test on the preview; then the terrain work's thrown trees and lifted
pillars should need nothing more than being drawn in the scene pass.

## 2026-11-15 — Session 42: a frame is simulated in steps of about 1 / 60 s

**Owner:** "lets implement your suggestions" (the genre review; this is its second piece). Branch
`core/sim-step`, stacked on `combat/reward-order` (PR #42), own worktree.

**Done** (ADR-103):
- `core/timestep.js`: `simSteps(realDt)` cuts a frame into equal steps none longer than 20.8 ms (one
  at 50 Hz and above, two of 1 / 60 s at 30 fps, six at most); `runFrame` runs them and clears the
  input's edges after the first.
- `main.js`: the loop is `simulate(stepDt)` (clocks, Lab, flow, fighters, world, lights, particles)
  one or more times, then the camera, the HUD, the audio and the render once. The frame clamp went
  from 50 ms to 100 ms: the game runs slow under 10 fps, not under 20.
- `window.__tick(dt, frames, asFrame)`: `asFrame` runs each as a rendered frame cut into steps.
- **Tests:** integ TIMESTEP (the split at 240 – 2 fps, the longest step, runFrame's order, a second
  at 30 fps, a tap in a two-step frame is one press, how often the 0.08 s window is sampled).

**Verification:** `npm test`, `npm run build` (see the PR). In the dev server on `?level=ash`,
through the real loop's own tick (`__tick(1 / 30, n, true)`): two steps of 16.7 ms a frame, a second
of real time in 30 frames, a tap of lock-on toggles once, a Plum Thrust parried at 30 fps frames.

**Not checked / open:** the pane was hidden, so `requestAnimationFrame` itself never drove it: the
loop was driven through `__tick`'s frame path. Nothing was run on a machine that is really slow, and
the cost of two to six steps a frame was not measured. A press is still read once a frame.

**Next:** per-move telemetry and the killing move on the death screen; a heavy button.

---

## 2026-11-15 — Session 41: the rewards ordered by risk: the flurry on red only, the flash counter, a perfect parry that pays

**Owner:** "what updates, combat engine changes, etc can we do to make this game to be one of the most
soulslike/onimusha/phantom blade genre type of game? i plan to sell this on steam", then, on the
write-up: "yes measure and lets implement your suggestions". Branch `combat/reward-order`, own
worktree (the main checkout held another session's work). Session 41 / ADR-102 / M1.35: PR #39, open
beside it, holds 40, ADR-101 and M1.34.

**Measured first** (the `strategy` scenario, new in all three suites, opt-in): three god-mode bots
that differ only in how they answer a tell. The bot that only perfect-dodged beat every boss fastest
with a third of the inputs. The table is in COMBAT.md "The reward order".

**Done** (ADR-102):
- **The flurry on red only.** A perfect dodge of a white or heavy blow counts in the streak and slows
  time where the hero stands; no flurry, no plunge, no crit window, the string goes on.
- **The flash counter.** A trade clash in the instant the cut became a cut goes through him: 70 damage,
  60 posture, he reels, the crit window, FLASH COUNTER (`player:counter`, `attacker.onCounter`).
- **A perfect parry pays:** × 1.5 posture and the counter cut (the next light twice as fast, a crit).
- **Fixed:** a blow of a foe's flurry that reached nobody settled nothing (the flurry never ended).
- **Tests:** duel GHOSTEP (white: in place; red: the flurry; the switch), TRADE (the flash counter),
  PERFECT (new), integ RED (the bite's perfect dodge is no plunge); PLUNGE / FLURRY test the move
  itself under `debug.flurryAny`; `strategy` in integ / duel / lord.

**Found on the way:** a 1.2 s crit window on a white perfect dodge left the dodge bot the fastest on
the wyrm (63 s): the window is 0. The Lord's training run failed on "block his flurry" once the
random stream shifted: two of five blows fell short of a standing hero and nothing ended the flurry.

**Verification:** `npm test`, `npm run build` (see the PR). The strategy runs before and after.

**Not checked / open:** no human has played it. The flash counter and the in-place perfect dodge
were not filmed. The wyrm cannot be flash-countered (its claws are not steel). One seed per bot on
the wyrm before the change.

**Next** (the owner's go-ahead covers them, each its own PR): a fixed-timestep simulation; per-move
telemetry and the killing move on the death screen; a heavy button and chosen swings; HP-linked
posture for every boss; then saves, a hub and ranks.
## 2026-11-15 — Session 40: the flurry on a man, paced to be followed; an afterimage in digits

**Owner:** "the animation looks great vs the dragon but against the humanoid bosses, the
teleportation attacks are a bit hard to follow and doesnt seem fluid and buggy. lets also leave a
cool after image that fades always in a stunning transition effect per teleport and use ascii for
the effects where you can as well". Branch `player/flurry-duel-read`.

**Measured first** (a probe that logs every frame of a flurry: positions, the camera, the boss's
mode; the Training situations and `debug.flurry` on Shen Hui). What made it read as buggy: the hero
froze on top of the duelist on every hit; a metre a frame, three readable frames a cut; the duelist
shoved 0.32 m in a frame by every cut and left in his own attack's pose; after the last blow he
staggered back into the hero; the camera jumped ~1.2 m a cut and ~5 m on the last; effects sized for
the wyrm's head covered both men.

**Done** (ADR-101):
- `DEFENSE.flurry.ground`: the cuts against a duelist (hang, past his side, the strike before he is
  abeam, a held finish, a short hanging line, effects at 62 %, a gentler camera). The Passing Cut
  and the Falling Leaf pass his side too.
- duelist `takeHit`: a flurry's cut flinches him in place (no shove, out of his move); the last blow
  staggers him away from where the hero lands (`away`).
- The afterimage: his own body printed in digits on a screen grid (`player._sampleBody`,
  `PlayerFx._afterimage`), digits flying to where he reappears (`blinkStream`) and in onto him
  (`blinkIn`). On every blink: Ghostep, plunge, flurry, riposte. Three looks were filmed for the
  owner (digits / echo / shatter); the owner picked **digits** and the others were removed.
- Tests (duel GHOSTEP): the cuts never nearer than the side offset, no step of his over 0.12 m in a
  frame, he ends farther from the hero than he began and does not push him, the first cut throws him
  out of his move, the afterimage has its points.

**Numbers, before → after** (five blows, the Passing Cut, AI off): the duelist moved 1.97 → 0.13 m
in all, 0.32 → 0.02 m at most in a frame; the camera's biggest step 4.62 → 2.78 m, its whole travel
28.6 → 19.9 m; the flurry 105 → 131 frames. In the real situation (Training `pd5`): the hero pushed
0.36 → 0 m after the last blow; the duelist ends 2.07 m from him (was walking into him).

**Verification:** `npm test`, `npm run build` (see the PR). Browser: frame sheets before / after on
Shen Hui, close-ups of the afterimage, the three looks (sent to the owner).

**Not checked / open:** the Starless Lord and the wyrm only through their test suites (the wyrm's
pacing is untouched; its blinks have the new afterimage); a phone.

**Next:** the particle count of a long flurry on a phone.

---

## 2026-11-15 — Session 39: the boss's rows at the top; QUIT TO TITLE; RESUME like the other items

**Owner:** "move the boss hp ui from bottom to top", then "also when you press esc in a level, give
an option to go back to the title screen. align the resume button to be on the left like the other
buttons." Branch `ui/boss-bar-top` from `main`.

**Done:**
- The boss's rows (name, HP, posture, BROKEN) sit at the top centre on every screen (desktop 14 px
  down, a phone held sideways 6 px; upright they were already under the player's rows). The
  camera's keep-in-view box trades room accordingly (top 0.78, bottom 0.86 of the frame).
- The Lab's floating toggle moved to the bottom centre (it covered the boss's name); a phone's
  pause panel now hangs from the top.
- Pause menu: **QUIT TO TITLE** as the last item (`flow.quitToTitle()`: the level is reloaded, which
  opens on the title with the fight reset). It asks once: the first press turns it into "SURE? PRESS
  AGAIN" for 3 s, reopening the menu disarms it. The pad's menu focus reaches it.
- **RESUME** reads like the other items: the label on the left, its key on the right.
- Tests: ASCIIHUD checks RESUME's layout, QUIT TO TITLE's place, its arming and disarming, and the
  title after the second press (headless: no reload, the flow goes to 'title').

**Verification:** `npm test`, `npm run build`; in a browser, QUIT TO TITLE pressed twice in the pause
menu reloaded `?level=ash` onto the title screen. Screenshots of the boss's rows on desktop, a phone
held sideways and upright, and of the pause menu on desktop and phone.

**Not checked / open:** Over the wyrm's bright red body at the top of the frame the boss's rows are harder
to read: they rely on their halo.

---

## 2026-11-15 — Session 38: one art design: objects in the dragon's look; landmarks

**Owner:** "all 3 levels need all the background objects like the pillars and structures to look
completely made of ascii characters. Right now it looks like a normal object with random ascii
pattern stickers put on top of it." Then: "Lets not touch the floor character and bosses ... The
prod build is the perfect ascii look im aiming for. Apply this design to all the background objects
as well." Then, after a gcdAtlas-style preview they asked for: "dragon look and update any md file
to ensure all future background and characters are following the same art design". Branch
`render/prop-art` from `main` (PR #34). (ADR-098 / 099 and sessions 36 / 37 are left to the two PRs
open at the same time, #35 and #36, which both use 098 and 36.)

**Done** (ADR-100):
- **Prop art:** `FLAG.ART_PROP`, `createPropArtMaterial`, the art pass's prop branch (`artLetters`,
  `edgeDir`, `uProp*`), the ground anchor. The three sets' `stones` meshes and the small grid props
  (bones, bonfire, bell, braziers) moved to it. Floors stay carved.
- **Landmarks** (`world/landmarks.js`): seven builders, hooked into the three sets with their
  colliders; trees and boulders in their footprints are built, then dropped.
- **The rule, written down:** CLAUDE.md ("One art design: the dragon look"), STYLE.md's new first
  section "The house style" (what the look is, which path draws what, what is exempt and why, a
  checklist, what the owner turned down), ARCHITECTURE.md (the contracts).

**On the way (kept out of the repo):**
- A first answer, carved glyphs filled to every cell on objects and floors, was built, shown and
  turned down. It did find why the old objects read as stickers (see STYLE.md "Background objects").
- A whole-frame character grid ported from the owner's gcdAtlas project, as a scratch module:
  rendered in all three levels and measured. Feasible; the owner chose the dragon look.

**Verification:** in the dev server at 1280x720: two views per level beside the live game, close-ups.
Frame cost in Chrome on an RTX 4090 (ADR-100 has the numbers): about equal to the live game at
1080p. `npm test` (all four suites, no console errors) and `npm run build` pass; the static check
now guards the prop flag's alpha window, each set's prop art material and the written rule.

**Found on the way:** the built-in Browser pane renders with a software driver (frame timings there
are meaningless); a visible Chrome tab keeps the fight running, so timings need a frozen, calm scene.
The throne hall costs ~10 ms a frame at 1080p on a 4090 before this change: the heaviest view.

**Not checked / open:** the look in motion (the letters' drift toward the screen edges, the
fade-near-player dither); a fight played round the new colliders; the phone (look and frame rate);
1080p and 4K by eye. The stone swordsmen read as a mass of digits with inner outlines, not yet as a
clear figure; the gate is mostly off the top of the frame; the old bone pile is mostly strokes.

**Next:** the owner's look at the Vercel preview; then a second pass on the landmarks.

---
## 2026-11-15 — Session 37: Training (every situation, one click) and the lab stage

**Owner:** "Make a lab mode to easily tell every situation with a simple click. For example i want to
see every streak animation and effect between the character and bosses. Think of every situation i
would want to test in a list by category like a fighting game lab mode in a cool lab
background/stage". Branch `dev/training-lab`, own worktree.

**Done** (ADR-099):
- **Training** (`dev/training.js`, `dev/trainingPanel.js`): 8 categories, 42 situations on the wyrm,
  60 on the Ash Disciple, 82 on the Starless Lord (BOSS MOVES grows with his moves). One click plays
  each: the runner sets it up and plays the hero through the input's virtual keys, answering the
  boss's glints. A banner names it and gives ✓ / ✗. Speed, loop, the answer for boss moves, the
  stage and the boss in the panel. F4 / the Lab's TRAINING button / `?training`.
- **The lab stage** (`world/trainingRoom.js`, `?stage=lab`): a training room for any boss. Three
  looks were filmed for the owner (Grid, Holo, Void); the owner picked **Holo** and the others were
  removed.
- **Found on the way:** the Ash Disciple's streak flurry had the same name as his phase-2 string
  (both "Hundred Petals"): it is **Scattering Ash** now.
- **Tests:** integ / duel / lord TRAINING run every situation for their boss (all pass).

**Verification:** `npm test`, `npm run build` (see the PR). In the browser: the panel and a riposte
×3 on Shen Hui on the Holo stage (screenshot); a flurry on Shen Hui on each of the three looks (a
sheet sent to the owner).

**Not checked / open:** the wyrm and the Lord on the lab stage only headless (their sims run on their
own sets); phones (the panel is narrower there but not tried).

**Next:** situations the owner asks for.
## 2026-11-14 — Session 36: an ASCII HUD (text meters, block-letter banners), a minimap that barely exists

**Owner:** "Make the minimal much smaller and opaque on mobile. Theres no need for mini map in
general for this game so lets make it small overall on both desktop and mobile to not take screen
space. Also think of ways to improve the ui design and layout and to also incorporate the ascii art
style as well to fit the ascii theme. Ask me any questions". Branch `ui/ascii-hud` from `main`.

**Asked, answered:** the minimap tiny and faint; keep the desktop log, the name tags and the key
hints, drop the name / level / class lines; for the HUD's look and for the big words: "render all
three first" and "show me what the ascii block letters would look like first".

**Rendered for the pick** (desktop 1280 x 720 and phone 852 x 393, in the Ashfall Courtyard fight):
three HUD looks behind a `?hud=` switch (bare glyph lines / terminal frames / a roguelike status
line) and three big-word styles behind `?words=` (logo-style blocks / # only / spaced capitals).
The owner picked **bare glyph lines** and **logo-style blocks**. The switches and the two looks not
picked are removed again.

**Done** (ADR-098):
- `ui/glyphBar.js`: `GlyphBar` and `GlyphPosture`, meters made of characters, with the old bars'
  contract. `ui/bars.js` deleted.
- The player's rows and the boss's have no panel; the name plate is gone; the boss's name is
  spaced monospace capitals; phase gates are a `|` over the meter.
- `ui/blockText.js`: block letters A – Z in the logo's letterforms; `ui/banner.js` draws every
  banner with them, fitted to the window and refitted on resize.
- The minimap: 72 px at 60 % on desktop, 40 px at 50 % on phones, no frame / title / coordinates.
  LOCK and pause moved beside the smaller disc.
- No serif font in the HUD (the mini banner and the pause title are monospace).
- The flask key chip is hidden on touch (a phone has the FLASK button).
- **Tests:** integ.mjs ASCIIHUD (the meters' runs, the lost piece, the smallest and the fullest
  cell, the posture from its middle, the block font's rows, the stacking, the HUD's own meters and
  banner, no name plate, no minimap panel).

**Found on the way:** the empty cells were invisible at 50 % and the meters had no visible end:
brighter dots and brackets. "104 / 160" wrapped under the meter. The phase tick sat a bracket's
width off: it is placed inside the brackets. In '#' only, the font's sixth row (shadow strokes)
was blank. The new test found a meter held just short of full drawing a
"lost" cell. A phase call in block letters lay across the fighters in the middle of the fight: it is
smaller (6 px a character at most) and sits at 21 % of the height, without the dark band.

**Not checked / open:** see the PR. Nobody but me has seen the meters move. Only the Ashfall
Courtyard was captured; the wyrm's three-phase bar and the Starless Lord's life pips were not
looked at with the new rows. Tablets not looked at.

---

## 2026-11-14 — Session 35: the phone's right thumb, a lock marker that fades, the guard meter

**Owner:** "Lets improve mobile ui / user experience. The right side controls are too far bottom in
the right corner ... Im having a hard time shuffling between attack dodge and block. Think of a way
to make it easy and intuitive to switch between the different options. Make the target lock icon be
subtle and slowly fades away ... add a guard meter and any parry will restore guard meter ... let it
replenish quickly ... I don't want to punish the player for playing defensive." Four questions
first; the answers: slide between the buttons; at empty the guard is knocked open; no HP chip while
there is guard; landing hits restore it too. Branch `ui/mobile-guard` from `main`. (PR #32 and
PR #34 merged while it was open and took Sessions 33 – 34 and ADR-093 – 094: this is 35 and ADR-095 – 097.)

**Done:**
- **The pad** (ADR-096, `ui/touch.js`, `CONFIG.touch.pad`): ATTACK, BLOCK and DODGE are three
  tiles that all touch, raised and inset from the corner; a touch near the cluster goes to the
  nearest tile; a thumb slides from tile to tile without lifting. FLASK rides with it, LOCK moved
  to the top right. Pause menu: PAD POSITION (low / mid / high) and PAD SIZE (small / medium /
  large), kept in localStorage; the controls show through the pause screen while they are stepped.
- **The lock-on marker** (`ui/nameTags.js` `LOCK_MARK`): a small dim diamond when the lock is taken,
  gone after 3 s.
- **The guard meter** (ADR-095, `GUARD` in `combat/rules.js`): a blocked blow costs guard and no
  HP; empty knocks the guard open for 0.55 s (`player:guardOpen`, GUARD DOWN); it refills at 60 / s
  in every state; parries and landed cuts give some back. A steel bar under the HP bar, a gauge on
  the BLOCK tile.
- **Tests:** integ.mjs GUARD (new: cost, the refill behind a held guard and in a swing, the
  opening, parry and hit restore, streams, the HUD bar); TOUCH drives the tiles through the pad and
  checks nearest-tile, the slide (ATTACK → BLOCK → DODGE on one finger), the stick, two fingers,
  the BLOCK gauge, position and size; BLOCK now expects no HP loss.

**Second request, same session:** "Allow the game to be played in non landscape as well and adjust
the ui to allow that. Make the joystick and right buttons to blend in with the game so the buttons
aren't covering the game screen. The mini map is also covering a lot of the screen on mobile."
- **Upright play** (ADR-097): the "rotate your phone" overlay and its pause are removed. The camera's
  field of view opens in a window taller than wide (`fovFor`, 32° → ~64° on a phone), the upright
  phone profile stands 1.2 × back and leads 1.5 m south; the stick's zone, the pad's three places
  (`pad.posPortrait`) and the stick's rest follow; the HUD has an upright layout (frame and boss bar
  on top, prompt and banners above the thumbs, the pause panel in the upper half, the title to the
  screen's width).
- **See-through controls:** no filled panels; hairline tiles, brackets and haloed glyphs at 62 %,
  the stick at 40 % with no disc; full strength under a thumb.
- **Minimap on phones:** a bare 70 px disc at 72 %, no panel, title or coordinates; LOCK and pause
  beside it.
- **Tests:** TOUCH's portrait block rewritten: no overlay and no pause, controls live, a held stick
  let go when the phone turns, the camera profile and `fovFor`, the pad and the stick inside the
  upright screen, a press at the portrait place, PAD POSITION upright, landscape restored.

**Found on the way:** the first lead of 3 m put the hero at a third of the screen's height with
the boss pressed against the HUD: 1.5 m. Faint tiles vanished over a lit pillar: a dark halo on
the glyphs and 62 % instead of 55 %. The pause panel covered the pad it is meant to show while
PAD POSITION is stepped: upright it keeps to the upper half.

**Decisions:** ADR-095, ADR-096, ADR-097.

**Not checked / open:** see the PR. Nothing was tried on a real phone: where the thumb rests (PAD
POSITION is for that), whether the faint controls are findable in a fight, the upright camera
against the wyrm (the view is ~14 m wide; only the Ashfall Courtyard was looked at upright), iOS
Safari's bars in portrait. The bosses were not re-tuned for blocks that cost no HP.
## 2026-11-15 — Session 34: weight on the flurry; one streak for parries too; a foe's streak and flurry

**Owner:** "Lets add some weight, hitstun impact to the teleport attacks and make it visually and
animation effect wise way more epic ... add this streak system to parries clash deflects as well.
Also give the streak system and attacks to bosses as well. Lets allow the player the opportunity to
block perfect parry a boss's special attack from its defensive option and if the boss is on a high
streak, the player needs to parry / block the total # of attacks. Ask me any questions". Four
questions asked; the owner took the recommended answer to each (one shared streak; a counter flurry
on the last blow of a string; duelists build theirs by guarding; answering every blow breaks his
posture). Branch `combat/streak-everywhere`, in its own worktree (the main checkout held another
session's uncommitted work). Session 34 / ADR-094: PR #32, open beside it, holds 33 and ADR-093.

**Done** (ADR-094):
- **Weight:** every flash cut freezes the hero on the contact and is followed by a beat in which
  the world runs at 60 %, so the target reels (a duelist thrown and shoved, the wyrm's head
  flinching); a speed clone mid-pass; a shock ring and dust under a foe on the ground; the last
  blow's impact frame (speed lines across the screen, a dark blink, a flash, the HUD's screen
  cuts), broken ground, and a duelist staggered.
- **One streak:** parries, deflects, trade clashes and the mikiri count in it.
- **The riposte:** a parried last blow is answered with as many flash cuts as the streak counts;
  the hero ends where he parried.
- **A foe's streak:** a duelist counts the strikes his guard turns (pips on the boss bar) and from
  three may answer with his flurry (Hundred Petals; Starless Storm, one per form): the first blow
  from where he stands, each later one from another side; a guard meets them from any side; all of
  them answered breaks his posture.
- **Tests:** duel.mjs STREAK (his streak; his flurry parried, blocked, let through; the riposte),
  integ.mjs RIPOSTE (on the wyrm); STRINGS and the guard's counter test isolate what they measure.

**Found on the way:** the wyrm never said which blow of a string was its last, so every parry of
one was a "last blow" to the hero (the riposte would have cut every string off at its first blow;
the parry's freeze was the long one): `hitPlayer` now passes `last` and `melee`.

**Verification:** `npm test`, `npm run build` (see the PR). In the dev server, as strips at 60 fps:
a flurry of four on Shen Hui with the new weight (the reel beats, the clones, the impact frame);
his own flurry of four against an idle hero.

**Not checked / open:** no human has played it. Not filmed: the riposte (tested headless on both
bosses), the Starless Lord's flurries (his data tests pass), the HUD's screen cuts and the boss
pips (DOM, exercised by the tests' shim only), anything on the phone preset. The sounds were not
heard. Nothing was re-tuned: a riposte of seven after two parried strings is a lot of damage, and
his flurry comes about every third guarded strike.

**Next:** the owner plays it; then the riposte's damage and the foe's streak thresholds.

---

## 2026-11-15 — Session 33: the wyrm in fine digits again, one size up

**Owner** (after PR #31 went live): "the dragon is way too flashy right now and the ascii text is too
big. use more smaller and make the ascii graphics detailed instead of huge flashy like this". Then,
on three rendered sizes: "B, medium". Branch `render/wyrm-detail` from `main` (PR #31 merged).

**Done** (ADR-093):
- **An option sheet**, rendered in game at 720p with the old calm tone: 4x6, 5x8 and 6x9 px cells
  beside the live 8x13; the owner picked 5x8.
- **`wyrmGlyphs.js` back to pixel fonts:** the 3x5 and 4x6 fonts of ADR-018 and a new 5x7 one,
  picked per screen height by `wyrmArtFont(H)` (cell ≈ H / 90: 5x8 at 720p, 6x9 at 1080p, 4x6 on a
  phone); the old digit sets. The pass rebuilds the atlas when the font changes.
- **The calm tone back** in the pass (`uWyrmTone`, `uWyrmGlyph`, `uArtLum.y`, `uArtMin.y`). Kept: the
  anchored grid and the 4x4 averaged tier.
- **The glyph check** now imports `wyrmGlyphs.js`: every set letter has a bitmap in each font, each
  bitmap is the font's size, and the cell per screen height (393 / 720 / 1080 / 1440 / 2160 px).

**Verification:** in the dev server: the built look beside the picked preview at 720p (the same), the
camera pulled back to 50 m, phase 3 with the fire breath, 852x393 (4x6 cells) and 1920x1080 (6x9
cells); no console errors. `npm test` (all four suites) and `npm run build` pass.

**Not checked / open:** the frame rate on a phone; the wyrm in flight and in motion at 60 fps
(stills only). The human bosses' letter size and the landmarks (a first pass parked on the local
branch `wip/landmarks`) still wait on the owner.

---
## 2026-11-14 — Session 32: the ASCII look; the wyrm in large letters; landmarks, first pass

**Owner:** "how can we improve the ascii visuals and graphics of this game? im not feeling the ascii
art style to the fullest". Then, on three rendered options: "scrap everything. i want you to make the
dragon, bosses, look more ascii like. also add bigger cooler detailed appropriate background objects
that can also be made full of ASCII". Then, on the wyrm's three letter sizes: "B, large". Worktree
`.claude/worktrees/ascii-bosses`, branch `render/ascii-bosses` from `main` (PR #27). (Sessions 30 and
31 and ADR-086 – 091 belong to branches open at the same time.)

**Done:**
- **A diagnosis**, from captures of the three levels at the game camera: what reads as ASCII is big
  glyphs on black (the throne hall, the canopies); what does not is the grass carpet, the fighters'
  4 px dot marks and five different letter sizes on one screen.
- **Three options rendered and scrapped by the owner** (live patches, no code kept): a typed lattice
  ground, the hero in the wyrm's letters, a terminal finish.
- **The wyrm in large letters** (ADR-092): `wyrmGlyphs.js` rewritten (bold font, cells 1/55 of the
  height, three symbol sets); the pass averages 16 more taps per wyrm cell and anchors the grid to
  the boss (`U.uBossScreen`, `uWyrmAnchor`, `uWyrmTaps`); tone set to the picked preview's.
- **Landmarks, a first pass** (`src/world/landmarks.js`, hooked into the three sets; NOT in this PR:
  uncommitted in the worktree until the owner picks which stay): the elder wyrm's skeleton and the Cinder Tree (Cinderwood), two stone
  swordsmen, the sect gate and an incense cauldron (Ashfall), two throne wardens and six great swords
  (the Obsidian Throne). Trees and boulders in their footprints are built, then dropped, so every
  other tree and stone stays where it was.

**Found on the way:** a big smooth form lit evenly lands on one level of the grid's glyph ramp and
prints as rows of `====` (thin forms like bones read at once): landmarks get per-facet tones and a
dark albedo. The camera's 58 degrees squash anything upright and hide the north rim: statues are
drawn 1.3x taller than built and stand east and west. The hall's night needs a prop albedo twice the
other levels'. The gate's roof profile hit `pow(negative, 1.7)` at the eaves (NaN positions; clamped).
A connected gamepad walked the hero between captures.

**Verification:** in the dev server at 1280x720: the wyrm at the fight camera and pulled back to 50 m
(beside the picked preview), phase 3, the breath, a red tell (the glow still tints the letters), and
at 852x393 (6x10 px letters). The anchor, measured in the wyrm's own frame over 0.1 / 0.2 / 0.4 m of
camera travel: 13 / 15 / 21 % of its lit pixels change, 63 / 62 / 60 % with a screen-fixed grid.
`npm test` and `npm run build` pass (run with the landmark files also in the tree; CI runs the PR's own tree).

**Not checked / open:** 1080p and above (the pane timed out; the cell would be 12x20). The frame rate,
on any device. The wyrm in flight and in motion at 60 fps (stills only). The human bosses' letters
(no pick). Of the landmarks only the skeleton is at a finished standard; the tree's crown does not
read, the gate sits mostly off the top of the frame, the wardens read as red-lit monoliths; none was
played around (new colliders on the arena rims), none is in ARCHITECTURE or STYLE yet.

**Next:** the owner's picks: the duelists' letter size (and whether the hero follows), which
landmarks to keep; then a second pass on those.

---
## 2026-11-14 — Session 31: the streak and the flurry (perfect dodges answered blow for blow)

**Owner:** "lets have more different perfect dodge animations instead of the same one of just
teleporting on top and stabbing the head or behind the enemy. add different types of teleport
attacks. if the player keeps doing more succesful perfect dodges in a streak, make the attack also
hit the # of attacks the player is on a streak ... make it epic anime with good visuals, animation,
and impact". Branch `player/ghostep-flurry` from `main` (PR #29, the free hand, is open beside it and
holds Session 30 and ADR-086 – 090: this is 31 and ADR-091).

**Done:**
- **The streak** (`player.streak`): perfect dodges in a row; a blow that hurts ends it (not a block,
  a parry, a plain dodge or time). A STREAK row of pips under the HP bar, "GHOSTEP ×N" over the
  hero, the longest streak in the victory record.
- **The flurry** (`player/flurry.js`, state `flurry`, ADR-091): a perfect dodge is answered with as
  many blows as the streak counts, 7 at most. Flash cuts (blink, cross the target, blink away, each
  along a new line that then hangs on it) and then an art, on which the hanging cuts burst.
- **Six arts:** the wyrm's Skyfall (the plunge, unchanged), Severing Line, Heaven Splitter; a
  duelist's Passing Cut, Falling Leaf, Rising Moon. At random, never the same twice running.
- **Time:** the world held at 7 % while he cuts, the hero, his pose and his cloth on real time.
- **Look** (`player/flurryFx.js`): afterimages that pile up round the target, the hanging lines, a
  crescent on every cut, the art's crescent or lens, the burst. **Sound:** a ring a whole tone
  higher for every cut, the coil's rise, a run of rings as the cuts open. **HUD:** a cut counter
  over the target, a banner that names the flurry with its damage. The camera leans in.
- **Lab:** PLAYER → flurry x1 … x7 and an art picker (`player.debug.flurry`, `.flurryArt`,
  `.streak`).
- **Tests:** integ.mjs FLURRY (the streak, each of the wyrm's arts, the cap, a kill in the middle),
  duel.mjs GHOSTEP rewritten (each of a duelist's arts, a flurry of five); RED and PLUNGE pin the
  plunge's art and reset the streak.

**Found on the way** (all on film, in the browser): the sword's own sweep trail drew a wide curl on
every pass (the blade is carried a metre a frame): the flurry draws its cuts itself. Round the
wyrm's head the hanging lines were inside the head and showed only where they left it: they are
drawn 3.5 m toward the camera. A falling cut seen along its own plane was one fat white bar: its
crescent is tipped toward the camera. Every first size of a star, a flash or a light bloomed into
a white ball over the target: all cut down. A duelist's `takeHit` flashed him white for the whole
hold (the world stands still, so the flash does too): `takeHit` takes a cap for it (`flash`).

**Verification:** `npm test`, `npm run build` (see the PR). In the dev server, as film strips at 60
fps cropped round the target: flurries of 2, 3 and 4 on Shen Hui with each of his three arts, from
the south and from the east; flurries of 2, 3 and 4 on the wyrm with each of its three; a flurry of
five at the game camera with the HUD on (the STREAK row in a screenshot; the cut counter and the
FIVEFOLD FLASH banner read from the page); one flurry in the phone preset (852 x 393, touch UI),
where the camera's lean was far too close: it is scaled to the phone's camera now.

**Not checked / open:** no human has played it, and it was not tried on a real phone (frame rate
with seven lines hanging; the STREAK row on the small player frame; the scaled lean was not filmed
again). The sounds were written and wired
but not heard. The hero's poses in a pass were judged at the game camera, where he is small; not in
close-up, and the vault's somersault only as a strip. The Starless Lord was not filmed (he shares
the duelist's path, and his tests pass). Balance: a duelist's fight is shorter for a good dodger;
nothing was re-tuned. A streak never runs out: to be judged in play.

**Next:** the owner plays it; then pace (`DEFENSE.flurry.cut`), the cap, and whether a streak should
run out.

---

## 2026-11-14 — Session 30: the free hand in sword fingers; weight and footwork; a cut that lands; outfits to pick from

**Owner:** "The character left hand pose and animation looks unnatural and weird during the attack
animations. Lets focus on making the characters motions attack animation and overall design and look
be better." Asked first: the free hand reads "stiff, like a mannequin" and "the hand itself" is wrong;
the style is **sword fingers** (jian jue); also improve weight and impact, footwork and body, the hero's
design (as options: "new look, show options") and the sword and its effects. Kept distinct from the
Ash Disciple: no douli, no red tassel, the moonlit cyan/violet longsword. Branch `player/free-hand`
from `main` (7855769), with `player/sword-fx` and `player/outfits` merged in; built as three tracks,
each with an independent review and a fix round.

**Measured first** (the old free hand, through the chain): rigid on the forearm (no wrist), a binary
open/fist swap at `twoHand` 0.6 that popped the fist 9-21 cm, the off elbow locked at 152-176° on the
grip, the elbow ping-ponging 47-75° to 116-126° between keys, and no counterbalance (the hand's travel
against the blade's: cos −0.29..+0.55).

**Done:**
- **The free hand** (ADR-086): a wrist joint (`arms.L.wrist`, `arms.L.point`), turned by a spring inside
  human limits (sub-stepped: stable from 144 to 15 fps); the sword-fingers hand (index and middle
  straight and pressed together, ring and little folded under the thumb, 1.3× long so the point
  survives the glyph pass); a choreography for every cut: it gathers at the sword wrist and is thrown
  opposite the cut, overhead only rarely; the fist on the grip only once the hand is there (no pops);
  the free elbow keeps ≥ 23° of bend on the grip. Every outfit's arms build it (`gear/hands.js`).
- **Weight and footwork** (ADR-087): a light's step pushes off and brakes at the plant; the hips lead
  the hand by 0.033 s, the chest by 0.017 s; anticipation and overshoot keys; deeper bow stances on
  the thrusts and the falling cuts; the edge **bites** on a landed hit (the blade holds where it bit
  through the freeze, the hips drop 4-6 cm, then it tears on through); planted feet pivot and follow
  instead of skating (worst slide 2 cm, was 7-30); the whirl hops round its turn and overshoots.
- **A cut that lands** (ADR-088): drawn where the drawn blade meets the drawn body (it sat 13-65 px
  off); a slash line along the cut with a tick across it, sparks thrown along the blade's travel, a
  flare on the steel and a glint up the edge, the camera kicked along the cut, a punch on every landed
  cut, a `cut` sound layer, the struck duelist shudders through the freeze; the white star that hid
  both fighters is gone. Per-attack weights are data (`combat.js` `contact`, `punch`, `kick`).
- **Options for the owner** (ADR-089): three outfits behind `?heroLook=` (Moonlit Robe, Swallow, Moon
  Warden; each also with its face in shadow, `-shade`) and three sword looks behind `?sword=` (sheet,
  ribbon, crescent); today's look and sword stay the default. Lab rows OUTFIT and sword. Sheets:
  outfits (four sides solid + the game camera), faces, duels, swords.
- After the merge, from the close-ups: the two straight fingers splayed into a V (a peace sign) and
  the curled two stood out as knobs; the pair is now two touching tapered capsules, the curled two lie
  on the palm, the palm is flatter.

**Found on the way:** `setLoadout` let a hero rebuild wipe the shared part ink (the Lord's red part
19); the wrist spring was unstable at ≤ 35 fps (period-2 flip of ~30° a frame at rest; sub-stepped);
the fist popped to sword fingers on the plunge's hang; the cleave's bite put the blade 2.5 cm into his
head (the cleave's bite folds no chest or head now); the first hop whirl scissored the feet (now each
foot is carried round from where it stands); a duelist's drawn cut floated off his body after his
shove (moved with the shove); a slam's shards-only hit played the blade's cut.

**Round 2, the owner on the preview (ADR-090):** "keep the new skins for now to be used in the
future. we will use the current todays look for now as the default. the right hand looks very
disfigured. when charging, the sword is piercing the characters face, make it have more distance
away from the face. somethign about the arms still feel unnatural and stiff".
- **The outfits and sword looks stay** behind `?heroLook=` / `?sword=` and the Lab rows as options
  for later; today's look and sword are the default. Nothing is removed.
- **The sword hand:** the fist was four thin discs and a plank (since ADR-041, on every rig): now
  finger rolls that close into one hand with shallow grooves and a rounded back of the hand.
- **The charge:** the blade stood 10 cm from the head's axis, inside the hood. The hands sit lower
  and out to his right and the blade leans out: 25 cm through the hold, 21 cm through the release.
- **The arms**, measured in the chest's frame: no swing opened an elbow past 124-130° (the soft
  reach crumpled every full-reach key); both elbows flared out on the run; the free arm ran as one
  87° crook; strafing, the arms did not swing at all. Now: 143-159° at contact (`HERO_SOFT`, hero
  only, never locked), elbows back beside the ribs, the free arm opens and folds 56° a stride, the
  arms swing in a strafe (`armF`), an open hand on the run, sword fingers 1.15×, the flung "wing"
  sloped down from the shoulder.
- **Tests:** a new HEROARMS scenario (rest, run, strafe, sprint, every swing's opening, the lock
  bound, the charged blade's clearance). HERO's "never locks" bound is 15° (was 23°).
- **An independent review of round 2** (three reviewers, headless probes against the parent
  commit) confirmed the gains (frozen-elbow stretches 55 → 17 over one script; the charge 6.8 →
  26.1 cm by their probe) and found: the arms still froze in an exactly sideways strafe, and
  HEROARMS' strafe check passed only because he slid round a stone of the harness; a fast
  direction flip threw the free hand 20 cm in one frame; the Ash Disciple's running arm had changed
  with the hero's (his sleeve into his ribs); the cleave's new wind-back key made a hitch. Fixed:
  the swing's sign is latched and eased (a pure strafe swings 27 cm; a flick moves the hand 7.4 cm
  a frame, the parent's 8.2), the hero's loco numbers are gated on `A.freeHand` (the Disciple is
  bit-identical again), the key moved to u 1.3, the scenario runs in a clear lane and asserts the
  strafe is one. Also from their ranked list of what still read stiff: the guard breathes and rides
  the walk; the way home from a swing starts earlier and lands softly; the sword arm rides the
  stride backing away. LOOKS' budget is 27k triangles (the new fist is 624, was 460).
- Left from the review: coming up from a held light's coil into the charge the blade still turns
  52° in one frame (87° before this session); the roll's exit opens the free elbow to 155-160°.
- Found on the way: the owner's gamepad drives any visible page, the filming page too (its
  `navigator.getGamepads` has to be stubbed while they play).

**Verification:** `npm test` (integ incl. HEROHAND, HEROWEIGHT, LOOKS, CUTFX; DUEL; LORD) green after
the merge; `npm run build` OK. Filmed in the pane: the chain (solid and the game camera), contact and
follow-through stills, the hand close-up, the outfit and sword sheets, the cut's contact on the Ash
Disciple, the whirl's hop against carry and the base.

**Open / next:**
- The owner's look at round 2 on the preview (the arms, the charge, the fist); the whirl's feet
  (`hop`, shipped, or `carry`) are still theirs to pick. The outfits and sword looks stay as options.
- On the phone: the lunge is ~35 % longer on a short click (the shaped step), the kick's feel, fps.
- The wrist sits on a limit for much of the falling backhand, the falling cut and the whirl (by
  design of the keys; tune in the Lab close-up if it reads stiff).
- Hems and cloak tips dip under the grass in the death's collapse, and today's arm drape 17 cm while a
  knockdown death settles (printed, not asserted; `_hemY` checks only the hem's centre).
- The Lord's black plate still takes the 'cloth' hit sound.

## 2026-11-14 — Session 29: the Starless Lord in black plate; how he moves; three more spells

**Owner:** "improve the new bosses animation, movesets, spell effects, force effects, character detail
and motion. make him look like a darth vader look alike". Branch `enemies/starless-lord-armour` from
`main` (PR #24 merged the day before; rebased over PR #23 and PR #25, the hero's new swings and his
faster chain, then main's clash rework, PR #26, and its hit reactions, PR #28, merged in).

**Done:**
- **His look** (ADR-084): a harness of his own in gear.js (a hood over a faceplate, cuirass and
  gorget, plate yoke and pauldrons, plate arms and thighs, hip plates over a war-skirt, a cape to the
  ankles), drawn at 1.32. Three heads rendered in game as one sheet for the owner (A sallet, B crown,
  C hood); built with A. An original design in that archetype: a film character's own look was not
  copied, and the owner was told so.
- **The owner's pick: "the hood".** The two helms and the `?lordLook=` switch are gone (`lord.hood`
  is his one head item, `LORD_LOADOUT` a constant). Up close the hood as first rendered read from
  the side as a flat-topped box, and the standing collar behind the head poked through its sides.
  It is now given as a front and a back edge per ring: a round crown, the brow hanging forward over
  the faceplate and closing just above it, a rim in the cloth's ember red round the opening, the
  drape pooled on the yoke. The collar is removed.
- **How he moves** (ADR-085): four new guards (the blade hung at his side, twin blades as wings, the
  staff level across him, the cross-hilt upright before his face); he glides instead of running; cuts
  alternate feet; spins hop and carry the feet round; a cartwheel cut and a backflip; a flourish per
  form; the cape lifts through a cast.
- **Moves:** 37 (was 31): Starless Dirge, Crushing Dark, Pinwheel, The Rift, Parting Light, Dark Star;
  more alternatives in Crimson Litany, Bladed Gale and Judgment.
- **Effects** (fx.js): lightning (core, sheath, strands, forks, a burst and arcs along the floor), the
  push's burst, the pull's vortex, the grip's talons and crush, the Rift, the Dark Star, called
  lightning's wheel in the sky, stones that turn round him, the glide's wake, form 4's wheel of marks,
  the blink's afterimage, the ignition's pillar.
- **Tests:** lord.mjs LEVEL (the harness, one head item: the hood, seated) and SPELLS (the grip, the Rift,
  the Dark Star, Parting Light, the glide); duel.mjs (Shen Hui waits in his meditation clip).

**Found on the way:** both duelists stood in their guard while they waited (on the throne's seat, in
the courtyard): the animator's reset ran after the brain's and went back to the walking clip. Fixed
in duelist.js: he sits, Shen Hui kneels. Parting Light's crescents fizzled from close in (thrown too
near to cue): they fly from 4 m off at 12 m/s. The Dark Star's red ring was lost on the hall's red
inlay: it draws its reach in violet too.

**Verification:** `npm test`, `npm run build` (see the PR). In the dev server: the look sheet (three
helms, four angles and a close-up each), the four guards from two sides, film strips of the dirge,
the backflip, the pinwheel, the gale, the grip, the Rift, the Dark Star, lightning, the push, the
glide, the intro from the door, him seated, Shen Hui kneeling; 88 s of the AI across the four forms
against an idle hero: no console errors, 1879 particles at most. After the pick: the hood from six
sides close up (ASCII and solid), a turnaround, him seated, the backflip and the grip with it on.
Bots (seed 4242, on main's faster chain, guard and hit reactions): every tell answered 93 s; 85 %
19 hits / 315 damage; 70 % 36 hits / 692.

**Fitted to the clash rework (PR #26, merged into main while this was open):** the code merged
without a conflict. His new effects that are re-drawn every frame (the aura's wheel, the pull's
line, the grip's talons and crush, the marks, the Dark Star) take their one-frame life from the
effects clock (`game.fxDt`) as the engine's now do: on the game's dt a frame longer than the 0.02 s
floor (a hit-stop or slow motion under ~50 fps) outlived them, and they would blink.
Checked in the browser on the merged tree: the hero cutting at his raised guard in each of the four
forms (the ward stands across the new guards, the sparks sit on his blade), a parried Crimson Litany
(the contact frames), 10 s of the AI per form with the hero mashing: no console errors.

**Not checked / open:** no human has fought him; not tried on a phone. The hood was checked in the
model view and in strips, not in a whole fight at the game camera. His new moves were not looked at
one by one under the clash rework (the blade lock, the trade clash and the deflect against the
cartwheel, the hop spins and the staff). The glide, the cartwheel and the
flourishes were reviewed as strips, not in motion at
60 fps. The hop spin's legs are hidden by the war-skirt and the cape: not checked bare. The numbers
were not re-tuned for the six new moves. No sounds of their own. His drawn body is now 32 % larger
than his hurt spheres.

**Next:** a first human fight; then tuning.

---
## 2026-11-14 — Session 28: hit reactions and the death fall, audited

**Owner** (after Session 26's anatomy round, asked whether to audit these too): "Yes, audit them".
Branch `player/natural-reactions`, from `main` after PR #25 and PR #26 (ADR-083).
- A scratch audit: the flinch, the block, the parry, the guard break, the knockdown and the death,
  each entered from 20–30 states, measuring joints, body parts under the ground, the blade in the
  body, and the fastest frames in the WORLD (measured in his own frame, a 180° snap of his facing
  is invisible).
- Found and fixed: killed while lying he stood up to die again (now the `deadDown` clip); the
  death's collapse sank the knees 15 cm (a knee / elbow floor in the solver); a knockdown from
  behind spun him round in one frame (now he falls onto his front, his facing eased); every flinch
  went backwards (it follows the blow); struck mid-swing the blade jumped up to 1.8 m in a frame
  (longer fades, the whirl's turn carried on); he fell and lay like a board (knees buckle, a knee
  up, arms flung); a cloth sheet stood 0.45 m up off the corpse (elbows laid flat; cloth obeys
  gravity while he lies).
- In range and left alone: the guard break, the block and the parry; every joint angle.
- Process: the two commits were first made on `player/faster-flow`, which had been MERGED and
  deleted an hour before (PR #25): the push re-created the branch and `gh pr edit` rewrote the
  merged PR's title. Both undone; the work was moved here. Check `gh pr view` before pushing to a
  branch a PR was opened from.
- The Browser pane lost WebGL on `localhost` and `127.0.0.1` ("Web page caused context loss and
  was blocked"); the same server under another host name (`film.localhost:5191`) rendered again.
- Verified: `npm test` ALL PASSED (995 checks, DUEL and LORD too), build ok; the reactions filmed from the side and at the game camera.
- Not covered: the plunge's poses. Nobody has played it; nothing ran on a phone.

**Next:** the owner's look at the preview.

## 2026-11-14 — Session 27: steel on steel (the clash, his guard, cancels, the blade lock)

**Owner:** "improve the combat mechanics of enemy guarding, being able to animation cancel from a
swing to a guard or dodge instantly. right now i cant tell animation or feel wise that the enemy is
guarding. Make the parries and deflect more epic. the clash is buggy and doesnt feel like a sword
clash. what other combat improvements can you think of? i still feel like the combat is a bit slow
and dont feel the sekiro phantom blade zero epic moments."
Branch `combat/epic-clash`, stacked on `player/faster-flow` (PR #25, still open: its faster chain is
half of "the combat is a bit slow", and the preview should carry both).

**Diagnosis first (filmed frame by frame, side on, the Ash Disciple):**
- A parry's freeze-frame showed two white blots and no blades (two bursts with 0.6 m HDR cores, a
  body-width apart); the hero's deflect snap ran in game time, so the freeze (time × 0.02) held the
  guard he started from; at the impact frame the boss's blade was already 0.25 – 0.55 m past the
  hero (a cut moves ~0.4 m a frame), a thrust ran down his centre line.
- A strike into the boss's guard: a white blot over both; his block pose arrived 0.06 s into a clip
  that a 0.07 s freeze held at its start; his raised guard was his ordinary stance; the hero's swing
  passed through with no reaction; the counter came unannounced.
- The blade lock: the two 1.5 m apart, nothing crossed, a bloom per press.
- The hero could not leave a swing: no guard in the cut, no dodge before 35 % of the recovery.
- Seven hit-stops of 0.1 s in a seven-cut string: 0.7 s of standstill. At the default camera the two
  are ~60 px tall.

**Done:**
- **The clash (ADR-079):** `combat/clashFx.js` (one effect of lines for every blade on blade);
  `game.fxDt` (particles and lights run on through a hit-stop); `duelist.parryContact` holds a
  parried blow where it met the guard and lets a deflected one rebound; the hero's deflect goes to
  the blow's side and height, is posed in the parry's own frame and nudged onto the steel; a short
  freeze inside a string, a long one on its last blow; `cameraRig.punch`; the tell glint without its
  disc; a riposte 0.07 s into a parry.
- **His guard and the cancels (ADR-080):** `duelist/guard.js` (raised, three wards, the deflect);
  `brain.wardK`, `onGuarded` → armor / ward / deflect, the counter out of the deflect's beat; the
  hero's bounce (`player.onGuarded`, state `bounce`, `player:bounced`); the recovery's late half
  cancels into a guard or a step out of a heavy blow; the hero's guard / dodge out of any point of a
  swing; sounds `guard` and `deflected`, the DEFLECTED call-out.
- **The lock and the camera (ADR-081):** the lock pose, the servo onto the crossing, the grind, the
  slide; duel framing (−6 m in his reach).
- **Tests:** `duel.mjs` CLASH (20 checks); IMPACT's parry numbers; GUARD's counter check.

**Found on the way:** the first contact search stopped at the impact frame because the blade was
already "clear" of the hero, on the far side: it now finds the crossing first and takes the last
clear pose before it. The duel framing was cancelled by the flow's boss camera (`max(zoomOut,
o.zoom)`): it is applied after it. The first lock tile I grabbed showed the hero at ease with a
glowing blade: the lock had been won a moment before (the crit window), not a bug.

**Verification:** `npm test` and `npm run build` (see the PR). In the dev server: film strips of a
parry, a seven-cut string, a guarded chain, the deflect → bounce → guard → Riposte, the lock, at
60 fps side on; one sheet of six moments at the game camera; the Starless Lord's four forms (a ward
and a parry each: the blades 0 – 3 cm apart). No console errors.

**Not checked / open:**
- No human has played it and nothing ran on a phone (frame rate with the closer camera, the punch on
  a small screen, the cancels on touch).
- No sound was heard: the two new sounds are written to the house recipe and unverified by ear.
- The closer duel camera, the deflect's odds and the 45 % step out of heavy blows are taste calls
  made without options put to the owner.
- A thrust set aside still shows the blades ~0.4 m apart. The hero's cut still passes through a
  ward that only holds it. The wyrm's claws get the new sparks and freeze, not a contact pose.
- Proposed, not built: a counter cut after a deflect (ROADMAP M1.26).

**Round 2, the owner's pick: "Trade clash" (ADR-082).** The hero's cut and a duelist's blow at the
same moment now meet instead of both landing: `RESULT.CLASHED` from `player.takeHit` (his blow
arrives in the cut) and `duelist._tradeNow` (the cut connects ≤ 0.1 s before his blow would land,
which spends the beat and skips his timeline to its impact). Neither is hurt; the hero bounces; a
string goes on; a single strike ends in the short `clash` reaction (no punish window); a cleave that
would crush his guard wins it. `combat:clash`, the sound `trade`, the CLASH call-out.
- **Found by the test:** mashing attack traded the second blow of a string too. I had counted on
  the bounce's 0.28 s, with blows "0.34 s apart": that is their windup; impact to impact is 0.42 s.
  A re-arm of 0.6 s (`DEFENSE.trade.rearm`) now keeps two in a row from being traded.
- **Found on film:** left in their swing poses the two blades were 0.7 m apart in the freeze (his
  rising cut low, the hero's falling cut high), and the bigger burst stacked into a white blot for
  three frames. The hero's cut is now stopped on his blade with the parry's own contact code
  (`_meetBlade`, extracted from `_parry`): 0.01 – 0.22 m for cuts, 0.4 – 0.6 m for a thrust or a
  spin. A big burst spreads its streaks wider instead of brighter. The duelist's tell glint lost
  the rest of its disc (rays at 0.62×, the eight short strokes born off the centre).
- Rebased three more times onto `player/faster-flow` (it took ADR-078: this branch's are 079 – 082).
- Tests: `duel.mjs` TRADE (16 checks). Verification: see the PR. Not checked: as above, and whether
  a player finds the trade without being told.

---

## 2026-11-14 — Session 26: a faster chain, the finisher as a clip, a recovery that flows

**Owner (on the merged build of Session 25):** "speed up the attack speed on the character. its too
slow right now. think of ways to make the character, animation, and motion better".

**The pace (ADR-075).** 0.25 s a hit was "too fast to follow" (Session 25), 0.42 s is "too slow". A
light is now a 0.11 s gather, a 0.12 s cut and a held finish; mashed, a hit every ~0.32 s (measured
0.32, 0.32, 0.37). The cut is as quick as the old one: the pose at each end and the arc behind the
blade carry the readability. The lights' damage is 30 / 32 / 36 / 30 again (the ×1.4 of the slow
chain is gone), the slam 66. The sprint slash and the roll cut speed up with them. For the next
round of "faster / slower" there is a number to give: the Lab's **atk** slider
(`player.debug.attackSpeed`, ×0.6 – ×1.6; it works on the phone through the LAB button).

**Ways to make the motion better: measured first.** A scratch scenario ran the hero through every
state with nine points tracked in his own frame and listed the most abrupt frames (the second
difference of each point's position). What it found, and what was done (ADR-076):
- **The slam** was the worst motion in the set: hands 0.54 m in one frame of the blow, the point
  reversing in a single frame at the top, the last swing still on its own code. It is a swings.js
  clip now: a gather at the right hip, a leap (the knees drawn up) as the blade sweeps up his right
  side and cocks over the shoulder, one two-handed diagonal into the ground ahead, a landing folded
  over the planted blade that he holds. Hands at most 0.33 m a frame. A mashed button used to cut
  the landing off the frame the blade met the ground (the slam had no `chain`); it has one now.
  `slamPose` / `slamWindup` / `slamSwing` / `slamTilt` and their splines are deleted (~190 lines):
  every swing of the hero is clip data.
- **Every recovery** went cut → two frames standing still → home in 0.12 s at 60 cm a frame at the
  point (as fast as the cut). The way home now starts 30 % into the recovery, while the
  follow-through is still moving: the blade turns round without stopping and comes home at 43 cm a
  frame.
- **The whirl**, filmed close up, turned bolt upright like a figure on a turntable: it drops 7 cm
  into the turn and leans to the inside of it, and the head spots (stays on the target, then comes
  round ahead of the body).
- Left alone on purpose: the roll out of a swing and the guard's raise (the point moves 0.4–0.8 m
  in a frame, but both must be instant). Run, sprint, stops, turns, heal and idle measured smooth.

**Verification:** `npm test` ALL PASSED (945 checks; the DUEL and LORD suites too), glyph check
clean, `npm run build` ok. New checks (HEROLIFE 1f): one cut's follow-through runs into the way
home (no two still frames; the point home at under 0.62 of the cut's speed), the finisher's hands
under 36 cm a frame and its landing left ≥ 0.1 s by a mashed button, `debug.attackSpeed` 1.5 makes
a swing take 1/1.5 as long over the same ground. Changed: the mashed pace 0.26–0.40 s (was
0.36–0.52), the arm-step limit 60° a frame (was 45°: a 0.12 s cut throws the upper arm ~55° in its
fastest frame; the flips it guards against were 50–135°), `CHAIN_EVERY` 0.36 s. REACH: all five
hits, the cleave and 24 variant trials connect from contact to 3.5 m. In the dev server: the chain
at the game camera (every second frame), the slam from behind, the front, the side and the game
camera, the whirl from the front; the Lab slider set to ×1.25 (label, `debug.attackSpeed` and the
badge follow) and back.

**Not checked / open:**
- No human has played it; nothing ran on a phone. Whether ~0.32 s is the right pace is the owner's
  to say (the slider is there for that).
- Ideas not built, for the owner to pick from: an afterimage on the sprint slash and the cleave's
  dash; a strafing guard-up stance while locked on; a second finisher (a spinning smash); a flick
  of the blade as a chain ends. The whirl's feet still turn on the ground with the spin.

**Round 2, the owner on the preview:** "the 4th poke on the sword combo is like clipping through
the ground. make the sword trail effect look way cooler and more subtle" (ADR-077).
- **The poke:** its steel never came within 0.8 m of the ground; filmed at the game camera with the
  hero FACING it, the level blade is drawn straight down the screen to the grass at his feet, and
  the swing's glint flashed on the ground a metre past the point (it sat at the end of the 1.9 m
  reach). Both thrusts now rise (35° and 45°); the glint sits on the arc's edge.
- **The trail:** drawn off the steel now (its edge just past the point, not at the end of the
  reach), as one fine unbroken line of overlapping `|` strokes that cools to indigo and tapers to a
  hair. Three looks behind `player.debug.arcStyle` and the Lab's **arc** buttons: Line, Crescent
  (the default), Ghost. Rendered as a sheet for the owner (game camera and close up) to pick from.
- Found on the way: port 5187 was another session's server (the `epic-clash` worktree): the first
  page I loaded was not this branch. Served this one on 5191.
- Verified: `npm test` ALL PASSED (947 checks, DUEL and LORD too), build ok. REACH passes at every distance with the rising thrusts. The Lab's arc buttons
  switch the look and light up.

- **The owner's pick: "Crescent".** The other two looks, the Lab's arc buttons and
  `debug.arcStyle` are deleted; `ARC_LOOK` holds the crescent's numbers.

**Round 3, the owner with a screenshot of the charge:** "while charging the right hand makes an
unnatural angle. review all the characters animation and make sure the anatomy and motion is all
natural and legit" (ADR-078).
- A second scratch audit, joint ANGLES this time, through every state, in the hero's own frame (the
  first pass measured the drawn hero, sheared toward the camera: its angles were off by up to 15°).
- The charge: sword elbow 18°, the forearm in line with the blade, the off hand inside the chest.
  Now a guard held out from the body: wrist 103°, elbows 58° / 49°.
- Limits in the solver for every pose and blend: elbows ≥ 40°, knees ≥ 32° (the roll's tuck asked
  for 10°), the blade ≤ 128° back on the sword forearm (170° for three frames entering the charge),
  hands outside the ribs. The slam's and the cleave's cocked grips come forward of the shoulder
  line; the whirl's head turn is capped (76° → 54°).
- Verified: `npm test` ALL PASSED (950 checks, DUEL and LORD too), build ok; REACH at every distance; the charge filmed from the front, the side and bare.
- Not covered: the off hand's wrist in two-handed cuts, the free arm's elbow behind the back in two
  backhands' recoveries, hit reactions and the death fall.

**Next:** the owner's word on the pace.

## 2026-11-13 — Session 25: wuxia-flow swings, the dashing cleave, the cross ward, a narrow cape, a shorter sword, a new sword arc

**Owner:** "we need to improve the characters animations. something about the way he swings the
sword looks unnatural and not good. focus on making his animations look natural, fluid, awesome,
dynamic, and varied different patterns instead of being the same pattern over and over. when he
charges the sword the arm bend is all messed up and make his charged attack be an impactful slash
with a cool weightful hit instead of a poke. make his guard stance have a deeper angle. i want his
cloak to be thinner in the back." Answers: the charged attack a **dashing cleave**; the chain
**wuxia flow** (one-handed cuts linked by steps, pivots and spins, each hit in a different plane,
two hands only on the heavy hits); the guard "blade and stance"; the cloak "narrower from behind".
Branch `player/wuxia-flow-swings` from `main`, rebased onto #21 / #22.

**Diagnosis (the old chain filmed frame by frame, solid look):** in every light swing both fists
stayed at the sternum while only the blade turned (the two-handed `slashH` circle), the body stood
upright, and each hit was the same flat arc one way or the other. The charge held both hands at the
right hip: the sword elbow out level, the free arm folded across the belly.

**Done:**
- **Swing clips (ADR-071):** `player/swings.js` (data) + `swingPose` in `anim.js`. 13 one-handed
  clips: falling cut / draw cut / leaping cut; rising / flat / falling backhand; whirl / rising whirl
  / low sweep; lunge / rising thrust; sprint slash; roll cut. A clip starts from the pose he was in;
  the picker never repeats a line. `slashH`, `stabPose`, the windup loop and `FLOW` are removed.
- **The cleave (ADR-072):** a new charge stance (both hands by the right shoulder, the blade up and
  back) and `CLEAVE`: the thrust's dash, then one two-handed diagonal as it arrives, a held low
  finish; `fx.cleaveImpact`, a longer freeze, a lingering crescent. The thrust stays as the
  execution's. Event kind `cleave`; audio, feed, control hints and README follow.
- **Guard and cloak (ADR-073):** the cross ward; `SHROUD_SHEETS` 7 → 5 (a narrow cape). Three guards
  and three cloaks were rendered and sent to the owner; no pick came back during the session, so the
  ones I recommended (guard A, cloak B) are in as defaults.
- **Tests:** HEROLIFE (one hand through every look of the chain, the arm opening, two hands on the
  slam and the cleave, the line rule over 40 chains, the cross ward's angle and stance); HEROLOOK
  swings every look; REACH / BLOCK / TOUCH / PAD say `cleave`; HERO counts 5 sheets.

**Found on the way:**
- A windup sent the blade the long way round behind him (through the torso for a frame) when a
  backhand started out of the last cut's recovery: `dirLerp`'s rules are for the carry at the hip.
  A clip's blade now turns round his front to its coil.
- The low sweep missed at 3.5 m: a low blade's reach band tops out lower, so it reaches less far
  under the wyrm's chest. It crosses his front at ~65 % of the active frames now, when the step in
  is nearly done.
- Fewer cloak sheets = fewer `Math.random` draws in a coat kick = a different seeded meteor layout
  in FIRE's Armageddon run: two meteors came down on the standing hero 0.19 s apart and the second
  hit registered 69 ms into its blast. The test assumed the first frame; it now allows that for a
  blow chained within 0.3 s of another (the blast is active 0.12 s). Not a change to the wyrm.

**Round 2, the owner on the first preview:** "when the character is charging, it looks like the
sword is piercing through him. make the sword a little bit shorter as the longness doesnt seem
right. have the character raise its hand up more during the block angle. the new cape seems fine.
something still seems off during the attack animations". Asked what is off (too fast to follow /
the body looks stiff / the arms look wrong / the hits don't flow), the owner ticked all four.
- **Charge:** the blade leaned 34–44° back over the shoulder; from the camera behind him a blade
  leaning toward the camera is drawn DOWN across his back. It now stands nearly upright beside his
  head (hands beside the right ear), clear of his body from all four sides.
- **Sword:** `DIM.drawnTip` 1.06 → 0.93 (12 % shorter), the blade rebuilt in Blender
  (`npm run hero-parts`: only the three blade parts changed). The hit segment is untouched.
- **Guard:** the hands before the chest (13 cm under the shoulder; they were at the hip).
- **Too fast:** lights 0.16 / 0.18 / 0.26 s, the next light after 30 % of the recovery (`chain`):
  a hit every ~0.42 s mashed (was 0.25 s). Lights' damage and posture ×1.4; crit window 2.2 s.
- **Stiff body:** `lungeFeet` steps the foot that is behind, so the lead foot alternates down a
  chain and the holding heel peels; the keys shift the weight back, then into the front foot.
- **Arms:** a motion audit (a scratch scenario: per-frame turn of each arm segment in the body's
  frame, wrist angle, hand speeds) found elbows flipping 50–135° in ONE frame (the lunge's free
  forearm 135°, the leaping cut's sword arm 113°) and the free hand thrown ~0.7 m front to back
  every hit at up to 15 m/s. `_elbow` limits an elbow's swing round its shoulder → hand line
  (14 rad/s, every clip); the free hand's keys stay before the chest and beside the hip.
- **Flow:** one coil key instead of two (a dead stop before every cut), the blade still moving
  into it; `swingPhase` (the straight time → phase map halved the rate in one frame as a cut
  ended); the cut carries through before the next windup starts from it.

**Found on the way (round 2):**
- With every look forced, a hit 1 started out of the last chain's finish ran the sword hand
  straight through the chest (left hip → right ear) and the blade with it (17.5 cm deep for a
  frame). The hand's way to a coil now bulges forward round the chest, and the blade turns to its
  coil round the side away from his spine (not "always round his front": out of a roll, with the
  hand behind the hip, that ran it through his hips).
- The slower chain no longer reached the wyrm inside the 1.6 s crit window after a plunge (the
  PLUNGE test): 2.2 s holds about the five swings it used to.
- The idle-life test asks for three different idle actions; the picks are random and the animator's
  noise is shared with the variant picks, so more picks earlier moved it to two in 25 s. It watches
  45 s now.

**Round 3, the owner on the second preview:** "this is looking better but i want the angles not to
be so perfectly like top to bottom and more diagonals and more natural fluid. also make the sword
arc glow effect be more subtle and way more epic cooler looking". Rebased onto `main` first (#24,
the Starless Lord, took ADR-068 – 070 and Session 24: this branch is ADR-071 – 074 and Session 25).
- **Found (the chain and the cleave filmed at the game camera, from behind him):** the "falling"
  cuts, the leaping cut, the cleave and the slam ran in upright planes, the blade passing over the
  top of his head at 66–78° of elevation; from a camera looking down behind him an upright plane is
  one straight bar up the screen. The cleave's arc was a wall of light as tall as the sword through
  the whole dash, because the arc was drawn wherever the blade MOVED, turning or not.
- **Diagonals (ADR-071):** every cut's keys keep the blade under ~45° of elevation and cross his
  front near chest height. The leaping cut is replaced by a rising slash (the falling cut's other
  diagonal, with the skip); the slam takes `tilt` 0.42 rad (`slamTilt`): it comes down from over the
  right shoulder to the ground ahead and a little left.
- **The whip (ADR-071):** in every cut the hand runs ahead through the first half and the blade
  hangs back (still ~30° short of pointing ahead at mid-cut), then comes through.
- **The sword arc (ADR-074):** `PlayerFx.trail` rewritten: an edge line (stretched `•` strokes along
  the point's path, thinning as it fades), a veil of 4–5 rows of faint `|` streaks, a mote or two,
  and `arcGlint` once a swing. All of it scaled by how far the blade turned in the frame, so it
  tapers with the cut and the dash leaves nothing. The letter rim (`A` / `8`) and the `+` halftone
  are gone.

**Verification:** `npm test` ALL PASSED (941 checks; the DUEL and LORD suites too), glyph check clean, `npm run build` ok. In the dev server (a scratch film
helper saving frame strips): every clip every frame from the front three-quarter (solid look), the
chain's flow with each look and with the animator's own picks, the charge and the guard from four
sides close up and four at the game camera, the cleave front and back, the cloak from behind; at
the phone preset (852 x 393, LOW, touch) the chain, the cleave and the guard at the real game
camera (round 1's build). Round 3: the chain and the cleave at the game camera before and after
(the planes, the arc), the chain close up, the tilted slam from the front and at the game camera.

**Measured (round 2's build):** an arm segment turns at most 42° in a frame through any light swing
(the lunge; 20–34° for the others; before the limiter up to 135°); the lead foot changed on 12 of 12
consecutive hits; a mashed chain's hits start 0.43, 0.43, 0.47 s apart; the sword hand reaches
0.45–0.56 m from its shoulder in every look; 0 of 120 consecutive pairs on the same line, all 13
looks seen; the drawn blade ≤ 1.3 cm into his body over 1563 frames of every look (the limit is 2;
the charge's first frames against the sword arm); the guard's blade 38° up and 72 % across him, hips
0.17 m down, turned 28°, the grip 13 cm under the shoulder; REACH: the five hits, the cleave and all
24 variant trials connect from contact to 3.5 m. Round 1's build at the phone preset: 57 draw calls
a frame. The duel's fencing bot wins in 46 s (41 s with round 1's faster chain).

**Not checked / open:**
- No human has played round 3; nothing ran on a phone (the arc's line is ~2 px wide at the desktop
  camera's distance: whether it reads on the phone is the owner's to say). I judged poses from stills and motion from
  numbers, not from watching it move.
- The pace changed the balance on purpose: a mashed chain deals ~15 % less per second than before
  (each light ×1.4, ~1.7× later). The wyrm `win` bot and the duel's bots still win; fight lengths
  were not compared one to one.
- The finisher is still the old slam code (its elbows turn up to 54° in a frame). The whirl's feet
  turn on the ground with the spin. The lunge's elbow still turns 42° in a frame.
- The cloak's arm drapes flick up for a few frames when the arm whips home out of a swing.
- The cleave's blade is behind him for the first 55 % of its active frames: something that only
  crosses his path early in the dash is not cut (the thrust's point was out the whole way).
- `docs/art/hero.md` still describes the two-handed swings and the thrust.

**Next:** the owner's third look at the preview; then the finisher and the whirl's footwork.
## 2026-11-13 — Session 24: the Starless Lord, a third level

**Owner:** "lets do a new level but this time its a master sith jedi with a red lightsaber and evil
force powers ... multiple phases where he goes from 1 lightsaber, dual wield, combined long lighsaber,
and the last phase is back to 1 lightsaber but with cross handle and a powered up aura ... very
acrobatic, fluid, uses different force spells such as lighting, push ... combos to be like 6 in a row
with different variations ... ask me any questions". Asked four: identity (picked: a dark lord from
the stars), arena ("show me a preview of the stages to select from"), health (four bars, a deathblow
each), speed (faster than Shen Hui, ramping up). Branch `level/starless-lord` from `main`.

**Done:**
- **Arena previews:** three sets built and rendered in game (throne hall, storm peak, crater); the
  owner picked the hall. `world/throneHall.js`; sets may now bring `sky` and `ambience` (ADR-070).
- **A shared duelist engine** (ADR-068): `enemies/duelist/` (duelist, brain, realise, poses, fx); the
  Ash Disciple is a kit on it. His tests pass unchanged.
- **The Starless Lord** (ADR-069; `?level=starless`): four forms with their own stances, blades,
  movesets and pace; four bars and deathblows; the Void (lightning, push, pull, the returning blade,
  torn stone, called lightning, red crescents, the blink); the throne intro; `lives` pips on the boss
  bar, DEATHBLOW call-out, a fourth phase in flow / feed / audio, a Phase 4 Lab button.
- **Tests:** `tests/integration/lord.mjs` (LEVEL, DATA, TIMING, FORMS, SPELLS, BOUNDS, FLOW, WIN), in
  `npm test`.

**Found on the way:** the hero could stand by the door outside the boss's circle bound, out of sword
reach (the hall is a rectangle): the lord clamps to the floor's rectangle instead. A skipped intro
left the blades dark and him on the dais. The returning blade's second pass could only cue 0.1 s
ahead near its turning point: it now hangs 0.32 s there. The blades read gold, not red (the `flask`
part's shared amber ink): tinted red for this level's page load.

**Verification:** `npm test`, `npm run build` (see the PR). In the dev server: the three arena sheets;
the lord's look; film strips of each form's guard and strings, the somersault, lightning, the thrown
blade, torn stone, the storm, the intro from the door; 40 s of the AI against an idle hero, no
console errors. Bots (seed 4242): every tell answered 75 s; 85 % 18 hits / 325 damage; 70 % 44 hits.

**Not checked / open:** no human has fought him; not tried on a phone (frame rate in the hall, the
0.26 s cue on touch). Poses were reviewed as strips at the game camera, not frame by frame up close:
the somersault, the off-hand blade's cuts and the staff's spins want a closer look. His look was not
put to the owner as options (it reuses the Wanderer's pieces under a new helm). No sounds of his own.
The grip was left out. The hero gets no reward yet (ADR-059; PR #18 is still open).

**Next:** the owner's look at the PR preview (`?level=starless`, `?lab` for the Phase buttons), on the
phone too; then tuning from a human fight.

---

## 2026-11-13 — Session 23: remappable controls (keyboard, mouse and pad)

**Owner:** "are we able to remap buttons as well?" → "do both pad and keyboard mapping". Same branch /
PR (#21).

**Done (ADR-067):**
- `core/bindings.js` (new): the actions, their keyboard / pad defaults, rebind with swap, reserved
  keys, labels, localStorage with repair. `Input` gets `act` / `actPressed` / `actReleased`;
  `moveAxis()` reads the move actions.
- The player, flow (pause, help, mute, rest, fight again, "press any key") and timing trainer read
  actions. Touch and pad press `'@<action>'` codes; the pad's mapping is now the bindings.
- `ui/remap.js` (new): the pause menu's CONTROLS panel, two tabs, mouse / keyboard / pad capture,
  reset per tab; the pad walks it (LB / RB tabs, A pick, B back).
- `ui/dom.js`: `[@action]` key chips and `controlsGrid(parent, dev)` from one list; they relabel on
  every remap / device switch / pad layout. The HUD prompt, hint, title line, help and pause grids use them.
- Tests: scenario REMAP (the rules, persistence, the panel by key, mouse and pad, the game obeying);
  mocks get `installActions`; touch / pad assertions read actions. The shim's `fireWin` honours
  `stopImmediatePropagation`.

**Found on the way:** a 300 ms wall-clock guard against the click that ends a mouse bind broke the
headless run (no wall time passes); replaced by eating exactly that click. The panel's key capture
must use `stopImmediatePropagation`, or the Lab's own capture listener also saw F1.

**Verification:** `npm test`, `npm run build` (see the PR). In the dev server with real clicks and
keys: CONTROLS opened, DODGE → Q, LOCK-ON → right click (block swapped onto Tab / MMB), saved across
a reload, Q rolls and Space does not; with a faked DualSense: Options → CONTROLS → the controller tab
→ DODGE → △ (rest swapped onto ✕), PlayStation labels throughout.

**Not checked / open:** no real controller, no phone (the CONTROLS item is hidden on touch unless a
pad is in use). One key per action after a remap; no side mouse buttons.

**Next:** the owner tries the remapping on the preview.

---

## 2026-11-13 — Session 22: controller support

**Owner:** "add controller support". Branch `input/gamepad` from `main`.

**Done (ADR-066):**
- `core/input.js`: a gamepad source beside the touch one (`setPad`, `setPadAxis`, `releasePad`,
  `pulse`, `kbmT`); `setVirtual` and the pad share one `_setSource`; the pad stick wins in `moveAxis()`.
- `ui/gamepad.js` (new): polls the standard mapping and feeds the real codes. LS move, RS aim, RB / RT
  attack, LB / LT guard + parry (trigger hysteresis 0.5 / 0.3), A dodge, B / L3 sprint, X flask,
  Y the prompt's key, R3 lock-on, Menu pause, View help, D-pad zoom. Menus: title any button / stage
  picker; pause menu focus (D-pad, A, B resumes). Buttons held across a menu ↔ play change are
  ignored until let go. Device in use by last input; a disconnect mid-fight pauses. Rumble.
- `ui/aim.js` (new): the touch layer's no-cursor aim, shared with the pad.
- UI: `pad-only` hints (title, pause and help grids, the corner hint, the arrival log line, the death
  line), the prompt drawn as "[Y] Rest", PlayStation relabel through `data-pad`, `.pad-focus`.
- Tests: scenario PAD (fake pad through `navigator.getGamepads` → the real Input); the shim's `El`
  gains `click()`.

**Found on the way:** an Xbox pad's id is "Xbox Wireless Controller", so a "wireless controller"
PlayStation match labelled it △: the PlayStation test is now Sony's vendor id (054c) or the names.

**Verification:** `npm test` (see the PR), `npm run build`. In the dev server with a faked standard
pad: title → explore on A, "[Y] Rest at bonfire", the VIEW / MENU hint, the pause menu's focus on
QUALITY and the pad grid, the PlayStation relabel; no console errors (the Vercel insights 404 is
local only).

**Not checked / open:** no real controller has been used (the pane has none): the dead zone, trigger
thresholds and rumble strengths want the owner's hands. Sound does not start from a pad press alone
(browser autoplay rules). No rebinding.

**Next:** the owner tries it with a controller on the preview; tune `CONFIG.gamepad`.

---

## 2026-11-12 — Session 21: the hero at Shen Hui's size, a trimmed cloak

**Owner:** "i dont like the new look and animations. lets start over. lets first focus on making the
size the same as the new boss and reduce the back cloak from covering too much" (about PR #19, which
changed the outfit, the face, the hood and the swings). Started over from `main` (now with #16) on
`player/hero-size-cloak`. Previews first: the hero at 100 / 90 / 80 % beside Shen Hui (side by side
and facing him at the fight camera); three cloaks from `main`'s (trimmed, back only, short). Picks:
90 %, "A trimmed", and the coat tails a little shorter.

**Done:**
- **Size (ADR-064):** `PLAYER_SCALE` 1.08 (0.9 × `HERO_SCALE`); `installLean(root, scale)`,
  `player.drawScale`, `anim.drawScale` (gait, foot planner), `unlean` / `leanPoint`. Shen Hui stays
  at 1.2. Visual only.
- **Cloak and tails (ADR-065):** `SHROUD_SHEETS` ~30 % narrower, 15 % shorter, standing off less;
  `COAT_PANELS` 15 % shorter and narrower at the join and the hem.
- **Tests:** HEROLIFE's off-hand gap divides by the player's own scale.

**Verification:** `npm test` ALL PASSED (777 checks; the DUEL suite too), glyph check clean, `npm run build`
ok. In the dev server: the hero beside Shen Hui side by side, at
the fight camera and from behind; a straight run and sprint: planted feet slide < 2 mm a frame.

**Not checked / open:** not played by a human, not tried on the phone. PR #19 (the first attempt)
is superseded. The face, the hair and the swings are untouched here: the owner's next asks.

**Next:** the owner's look at the preview; then the next item they pick (the face, the hood, the
swings), one at a time with previews.

---

## 2026-11-12 — Session 20: Shen Hui at PBZ speed — the blade-driven arm, pressure, impact

**Owner:** "his animation, motions, and weapon stance and attacks look bad. speed up his attacks as it
seems slow. the ai on the boss seems stupid. it shouldn't be attacking if its not near the player or
able to hit them. the boss should be able to sprint and catch up to the player to add pressure instead
of the player able to kite it out easily. i want this to be an epic fast paced game with epic sword
clashes, parry/dodge moments. make the parry effect also epic and impactful. we need to make the hit
from both player and enemy show more impactful hit stun to not feel weightless." Answers: PBZ-boss
speed; hits jolt him without interrupting (footwork and recovery excepted); the parry "everything,
layered"; sprint in and punish a flask. From three rendered stance sheets: **A, the classic jian
guard**. Same branch / PR (#16).

**Diagnosis (filmed side-on next to the hero's chain):** his hand and blade were keyed apart and
interpolated in angle space, so mid-swing the blade pointed up or behind him while the arm did
something else; the body barely moved; his trail was a grey wisp at the tip; the AI picked moves from
bands wider than their reach and swung at air.

**Done (ADR-063):**
- poses.js: stance A; the blade-driven arm (`arm` / `ext` / `lead`), the chest and hips turning with
  the blade; the hit jolt (pilot `recoil`) layered on every pose; walking keeps the side-on guard.
- moves.js: every move rewritten at PBZ speed; cuts as blade paths (`slashKeys`: gather, cock, snap,
  follow-through, a step in), spins and the low spin on the arm, thrusts with a follow-through.
- brain.js: the step-in (`close`) through every windup, leading the hero's velocity (step, track,
  dash); strings stop when the next hit can't reach; footwork: circle in range, run, sprint 8.6 m/s;
  a flask punished; a blow in his recovery flinches / staggers him.
- Impact: his hit stun (freeze, jolt, shove); the hero's (a freeze on every blow that lands); the
  parry layered (freeze 0.1–0.15 s, sparks born mid-burst, a shockwave ring born open, a camera kick,
  `grade.flashPulse`, a heavier clang; perfect: `game:cinematic` 'perfectParry' slow motion); heavier
  guard clashes; his sweep trail (fx.js `sweep`).
- Tests: PRESSURE (every non-red glint reaches a standing hero, a kiting hero is caught, strings stop,
  a flask is punished) and IMPACT (no windup cancelled, recovery interrupts, the hero's freeze, the
  parry's freeze / flash / perfect slow motion); DATA / TIMING at the new rules.

**Found while filming:** the parry bloomed into white blots that hid both fighters for the whole
freeze: every layer was born at the contact and held there by the hitstop. Elimination by single
frames (particles, lights, the screen flash toggled one by one) led to: sparks now born mid-burst, the
ring born open and cooler, the stacked cores trimmed.

**Measured (seeds 4242 / 7 / 99):** god-mode bot ~45 s; 85 % bots win 3 / 3 in 48–52 s; 70 % die
3 / 3 with him at 8–10 % (at his old × 1.35 damage the 85 % bot won 1 / 3: now × 1.15).

**Not checked / open:**
- No human has played it; nothing ran on a phone. PBZ speed is a big step: the owner should say if it
  is too fast to read.
- The kiting check lands 1–7 blows depending on the seed: a hero sprinting sideways beats a thrust's
  narrow line now and then.
- The hero's parry FX changed for the wyrm fight too (freeze, ring, flash, slow motion on a perfect
  parry): looked at in the duel only.
- Reaction clips (stagger, recoil, reeling, …) still use keyed hands.

**Next:** the owner plays the preview; the reward (PR #18) merges this.

---

## 2026-11-12 — Session 19: Shen Hui reworked — a long jian, a high guard, the duel's moments

**Owner:** "make shen hui's hat a bit smaller, its way too big right now. it looks like hes holding
some weird flute instead of a weapon. make his weapon look way more epic, longer, and more natural.
the way hes holding it right now looks really bad. make him have more dynamic and cooler attacks and
animation and combos as i want to have sekiro/phantom blade zero parries opportunities for epic combat
and moments." Answers: a long jian held one-handed; all four moments (long deflect strings, the
blade lock, perilous counters, cinematic finishers); the pace relentless, PBZ-fast. From three
rendered look sheets the owner picked **C: slender jian, high guard**. Same branch / PR (#16).

**Done:**
- **The look:** the hat 0.235 m in radius (was a wide douli); a 1.28 m slender jian with a tapered
  blade, bevelled edges and a ridge, a disc guard and pommel, a banded grip and a red tassel streamer
  (`gear.js` `LOOK`, `JIAN`); a slimmer bell sleeve; the **high guard** (`poses.js` `GUARD_HIGH`:
  the sword hand by the temple, the blade slanting down at the hero, the free hand's two fingers up).
- **New moves:** Falling Star (B, lock), Piercing Ash (R, perilous, a 5.5 m dash), Rain of Ashes (a
  7-hit string with an over-the-top lock cut), Hundred Petals (P2, 10 hits, ending on a perilous
  thrust); the cut library in `moves.js` (`CUTS`, `cut()`, `perilKeys()`). Reactions: reeling,
  trampled, lock.
- **The pace (PBZ-fast):** idle gaps 0.25–0.6 / 0.15–0.42 s, recoveries × 0.88 / 0.75, and 35 / 55 %
  of moves flow straight into the next (`TUNING.chain`).
- **The moments (ADR-062):** the full deflect (all hits of a ≥ 5-hit string parried: he reels), the
  blade lock (a perfect parry of a `lock` blow: mash to push, `player.startBladeLock`, a camera
  push-in, won = he reels, lost = a shove and the Riposte), the mikiri (roll into a `mikiri` thrust:
  he is trampled), and `flow.cinematic` (slow motion + `cameraRig.cine` pull-in, a gong) on each of
  them and on the execution. Call-outs BLADE LOCK / BREAKTHROUGH / MIKIRI / PERFECT DEFLECT; audio.
- **Tests:** a MOMENTS scenario (lock won / lost → the Riposte / held to time-out, the mikiri head-on
  and off his line, a roll across is no mikiri, the full deflect, the slow motion is not a freeze,
  the camera returns); the WIN fencer mashes in a lock.

**Found and fixed while filming (browser, real synthetic input):**
- The cinematic's slow motion went through `game.hitstop`, which min-merges the scale: the parry's
  0.04 freeze stretched over the whole 0.9 s moment (a freeze, not slow motion). It is now the flow's
  own time scale (`cineScale`).
- Parry flashes bloomed into two white blots a body-width apart: the hero's burst sat at his blade's
  pre-parry point (the idle blade at the hip, ~0.3 m up, its light blowing out the paving) and his at
  his own blade. The hero's clash now sits in front of his guard toward the blow; his is the point of
  his blade nearest the hero's chest, and smaller; the hero's parry light stays ≥ 1 m up.
- The blade lock was over in 0.25 s at a bot's mash rate and every push fired a full parry flare:
  retuned to a ~1.5 s tug (push 0.085, decay 0.32 / 0.38, 2.6 s, won at the bell if ≥ 0.6), pushes
  throw the block's grinding sparks.
- The mikiri read "toward him" from positions: a dashing thrust is often alongside at the impact,
  so the roll became a Ghostep. It now reads the roll against his facing (his blade's line).

**Verification:** `npm test` ALL PASSED (wyrm suite, DUEL ALL PASSED incl. MOMENTS, glyph check),
`npm run build` ok. Film strips (desktop 1200 × 800, synthetic mouse / keys through the real input):
Rain of Ashes parried ×7 → the full deflect; Falling Star → perfect parry → lock at 8 presses / s →
breakthrough; Piercing Ash → mikiri from off his line; Hundred Petals (P2) ×9 parried + the mikiri →
posture break. Phone landscape (812 × 375) boots into the duel.

**Measured (seeds 4242 / 7 / 99):** WIN 52–61 s (3–5 breaks). Probes: 85 % wins 3 / 3 in 55–64 s
with 2–4 flasks left; 70 % dies 3 / 3; 60 % dies 2 / 3. Before the rework 70 % won in 70–75 s: the
faster pace is harder, as asked, and the bots use neither the lock nor the mikiri.

**Not checked / open:**
- No human has played it; nothing ran on a phone (the owner's iPhone: fps unverified).
- The lock's mash rate is a guess at a person's (8 / s wins in ~1.5 s, 5 / s holds).
- Hits are still zones, not the blade; the new cuts were checked by TIMING (every hit lands within
  ±85 ms of its flash + lead), not against the drawn blade.
- The hero's parry FX point moved (all parries, the wyrm's too): looked at in the duel only.

**Next:** the owner tries the preview; the reward (PR #18, `player/techniques`) rebases on this.

---

## 2026-11-12 — Session 18: the Ash Disciple, a second level

**Owner:** "help me think of making content for this game. i want this to be kinda like phantom blade
zero wuxia combat, boss rush, with some exploring and rpg elements." After a pitch (a bonfire hub,
short approaches, a roster of duelist bosses each handing over a technique): "lets do the ash
disciple as a separate level and allow me to load it separately to test it"; setting: both the wuxia
combat and the fiction; progression: fixed rewards, loot that adds elements, skills and abilities to
change the combat style. Four answers: a grey-robed jian swordsman whose moves "should not mirror the
main character and have its own many different movesets"; guards and counters; the fight first, the
reward in the next PR; a ruined sect courtyard. Branch `level/ash-disciple` (a worktree off
`origin/main`: the main checkout had another session's uncommitted hero work). Spec:
`docs/specs/ash-disciple.md`.

**Done:**
- **Levels (ADR-058):** `src/levels/` (Cinderwood, Ashfall), `?level=ash`, `applyLevel` into
  `CONFIG.world` at boot, a stage picker on the title, a LEVEL row in the Lab. The boss slot keeps
  `game.dragon` (+ `game.boss`) and the `dragon:*` events. Wyrm text moved into the level (flow banners
  and lore, the minimap zone, the log, the name tag); audio gives a duelist no creature voice.
- **The courtyard** (`world/courtyard.js`, the forest's prop builders exported): a staggered paving of
  carved slabs with a calmer glyph ramp, a ring of broken pillars and lanterns, a gate with its lintel
  fallen, a bronze bell, a stele, steps and a flagstone path down to the bonfire, ~340 charred trees
  and stumps. Atmosphere `ash` mode (falling flakes, drifting embers); grass thinned, shortened and
  greyed through a set's `grass` hook (`uAsh` in grass.js).
- **The Ash Disciple (ADR-060):** gear items on the hero's skeleton (a wide douli, a robe with a
  crossed collar and sash, a skirt on the coat springs, a bracer and a bell sleeve, wrapped shins, a
  jian with a red tassel on a streamer spring), recoloured on his own materials. `HeroAnimator` takes a
  per-instance pose table; his `loco` is a jian guard on the hero's gait, his `duel` clips are keyframe
  data (`moves.js`): twelve moves, the Riposte counter, the Kindling, eleven reaction clips.
- **His rules (ADR-061):** the guard and the counter, the windup guard up to the commit point, feints
  without a tell or a glint, Ash Crescents that cue themselves, the Ghostep behind him, the execution
  thrust (player.js `_startExecuteThrust`, `onExecute`). `dragon:guard` + a GUARDED call-out.
- **Tests:** `tests/integration/duel.mjs` (own file: the main suite was being edited elsewhere),
  in `npm test`: LEVELS, DATA (every move, both phases, both ends of every roll), TIMING, GUARD,
  DEFLECT, GHOSTEP, EXECUTE, PHASE, FLOW, WIN; `probe` opt-in.
- **Direction (ADR-059):** CLAUDE.md, ROADMAP vision and M2 rewritten for the skill boss rush.

**Found and fixed on the way:** `limb()` with `capSegs: 0` makes NaN vertices (the bell sleeve drew
as a black slab through the art pass: now a lofted shell); the douli's veil drew as a solid black
panel (removed); the jian on the `flask` material glowed gold (now `armor` + `bevel`, pale steel);
his raised sword-finger hid under the hat's brim (now forward beside the jian). The DATA rules caught
two P2 first windups under 0.7 s (Swallow, Riposte → 0.78); TIMING caught the spins landing 150 ms
late (their step moved into the windup). The WIN bot found three leaks: no guard while winding up,
a 0.25 s re-raise after a flinch that let a chain flinch-lock him, and a crush threshold (18) the
slam and every charged thrust passed; then a break was worth ~1250 of his 2000 HP (break crit 2.2 →
1.5, HP 3000, the executed reaction 2.0 → 1.3 s and he gives ground).

**Verification:** `npm test` ALL PASSED (the wyrm suite unchanged, DUEL ALL PASSED, glyph check),
`npm run build` ok (1748 KB). In the browser: both levels boot with no new console errors; the title
picker, the Lab row, the courtyard from above and at the game camera, the disciple from eight angles
(ASCII), film strips of Plum Thrust, Swallow Flicks and Crane Spins; the phone preset (852 x 393, LOW).

**Rebased onto #13 / #14** (the two-handed hero): my ADRs became 050–053. The new swings missed his
back after a Ghostep from the wyrm's 3.2 m, so an attacker may now set the distance (`ghostepBehind`,
his 1.5 m), and the probes showed him too soft (70 % kept 4 flasks): his blows × 1.35, idle gaps a
little shorter.

**Measured:** phone preset, Ashfall: 51 draw calls a frame in the duel (the wyrm fight: 56), ~360k
triangles (Cinderwood ~690k: the thinner grass). WIN: 50–54 s on three seeds; probe 85 %: wins in
54 s (1 hit); 70 %: wins in 70–75 s with 1 / 0 flasks left; 60 %: dies with him at 10 %.

**Not checked / open:**
- No human has played it; nothing ran on a phone. Is the guard readable? Are the feints fair?
- Only three moves were looked at frame by frame; the other moves and the reactions (stagger, recoil,
  broken, executed, death, the intro's salute, the Kindling) were checked by the tests, not by eye.
- His hits are zones, not his blade: a pose edit can drift from them unseen.
- No sounds of his own beyond the cues and the clangs. The reward is the next PR.
- The duel suite copies the main suite's harness (`build`, the input mock): share it once the
  parallel edits to `integ.mjs` have landed.

**Next:** the owner tries `?level=ash` on the Vercel preview (desktop and phone); then the technique
system and his reward.

---

## 2026-11-12 — Session 17: attack variants, a flowing chain, hair that reads, a fuller cloak

**Owner** (with a phone screenshot): "i can't tell the yellow color in front of his face is his
hair ... the side angle/view also seems like the character is way too skinny ... something about
his left clicks is meh to me so lets try to make his attack animations and motions cooler and
natural looking. i also dont want him to show the same pattern over and over". Answers: locks out of
the hood, not too long, with three previews to approve first (picked "A"); a fuller cloak; fast and
flowing; random variants per hit. Branch `player/hair-depth-attack-variety` (session and ADR numbers
skip 16 / 054: the parallel techniques branch holds them).

**Done:**
- **Attacks (ADR-055):** `variants` for hits 1–5 (12 looks in all), picked at random, never the same
  twice in a row; `turn`, `hop`, stab `rise` / `low`, slam `hop`; `FLOW` on every light sweep.
- **Hair (ADR-056):** three hair prototypes rendered and sent; "A" kept: `HOOD_HAIR` strands, the
  face and neck in shadow (`shadowsFace`).
- **Cloak (ADR-057):** back sheets further back and standing off; a deeper mantle.
- **Tests:** REACH swings every variant at contact, 2 m and 3.5 m; HERO checks the hood's strands
  and the shadowed face; HEROLIFE waits for a freshly started idle action before cutting it.

**Verification:** `npm test` ALL PASSED, `npm run build` ok. In the Lab: every variant frame by
frame (solid) and at mid-strike (ASCII); the cloak from both sides and behind, standing and running;
three hair styles close up and at the phone camera.

**Measured:** cloak depth behind at rest 0.55 m (0.44), running 0.89 m (0.81); width 1.28 m / 1.17 m
(1.23 / 1.15). Variants: 24 reach trials, no miss. One bot `win` run 167 s (the wyrm changed in #15
since the last measure).

**Not checked / open:**
- Not played by a human, not tried on a phone.
- PR #16 (the Ash Disciple) and the techniques work in progress also edit `anim.js` / `player.js`;
  whoever merges second rebases (the variant pick lives in the animator, `player.js` is untouched).
- The sprint slash, the roll cut and the thrust have one look each.

**Next:** the owner's look at the preview; more variants if the chain still repeats.

---

## 2026-11-11 — Session 15: breath-born bullets, perfect-parry returns, Armageddon, heat-glow warnings

**Owner** (through a planning session, spec `docs/specs/wyrm-breath-armageddon.md`, owner decisions
final): the bullet hell should look natural (all fire from the mouth, nothing out of nowhere) and be
much harder; a perfect parry should send fire back and hurt the dragon; a new Armageddon attack fires
meteors into the sky that crash down across the arena; the red ground indicators should be subtle,
not break immersion. Branch `dragon/breath-armageddon`, four code commits in work-package order.
The spec named its ADRs 046-049; PR #14 (Session 14) took those numbers first, so they are
ADR-050 to ADR-053 here.

**Done:**
- **WP1 — ground warnings heat the ground (ADR-052):** `fx.heatDisc` / `heatBand` / `heatFlare` replace
  `hzRing`, the strip / ring / wall warnings, the hazard flash, the melee slam zones (`warnRing`,
  `ringPulse`) and the wheel's lines: a stable fill of `. , : '` glyphs coloured by heat (ember →
  orange → white-orange with k), sparks from k 0.6, scorch-map heat stamped under it (no char), the
  true edge as a `·` rim only in the last `flashLead` s. No red, no `!`, no chevrons, no r1 reach
  ring. `shockRing` and the live fire's edges are fire orange.
- **WP2 — perfect parry returns (ADR-051):** `DEFENSE.perfectParryWindow` 0.08 s; `deflect.perfect`,
  `player:parry.perfect`, `dragon:parried.perfect`, the new `dragon:returned`. A returned ember / wisp
  flies back at 34 m/s, 1.8x, white-gold, and hits the head for 30 / 70 HP + 14 / 30 posture through
  `dragon.takeHit` (gate and death like a sword hit). RETURN call-out, gold burst, 0.05 s stop, a
  brighter clang, a hit sound. Afterwards: a per-pattern return budget (120 HP, see below).
- **WP3 — breathed bullets + Hard (ADR-050):** `spit()` spawns every bullet at `pt.mouth` along the
  head's real aim from the `hit()` hook (after the rig); `aimHead` / `reachFor` aim and draw in the
  head; a drop scaled to the hero's distance. Ember torrent, Cinder burst (P3 double taps, a 35 %
  chain into a torrent through `brain.queued`, which existed), denser Wisp swarm (≤ 3 alive gate),
  Scouring breath (tongues off the head's aim rooted at the mouth's ground projection; the wheel
  gained `offs` / `aimWheel` and a stepped cue). `pop` 2.2 → 1.5. The flurry's embers rise out of a
  puff of flame.
- **WP4 — Armageddon (ADR-053):** rear-up with a red body glow (`dragon.bodyWarn`), a salvo of bolts
  out of the jaws (`fx.launchBolt`, stage `launch`), the sky answering (`atmosphere.skyGlow`, stage
  `sky`), `hazards.barrage` (waves over the whole clearing from `placeWave` / `leadInto`, P3 burning
  craters, a great meteor to finish). Hazard pool 64.

**Decisions / deviations from the spec's starting numbers (tuning, the owner table untouched):**
- Return budget 120 HP per pattern: the spec's 70 per wisp with 13 P3 wisps let a perfect parrier
  deal ~910 HP a swarm (~3x the sword), against its own target "≤ ~8 % of a phase's HP".
- Scouring breath turns at 2.15 rad/s, not 1.5: at 1.5 the 4.6 s cast (with the ramps, the pause and
  the reversal) sweeps ~0.9 turns, short of the spec's "≥ 1.25 turns"; measured 1.08 turns at 1.9.
- Wisp swarm count [7, 10, 13], not [0, …]: P1 is never picked by the AI (weight 0); 7 keeps the
  Lab's P1 trigger meaningful.
- Armageddon fits all 16 P3 bolts inside the 1.6 s salvo (0.09 s apart instead of 0.11).
- The P3 burst → torrent chain needs the torrent off cooldown and the hero within its 26 m.
- The sky glow is subtle on purpose: at the phone's close LOW camera the fog fills most of the
  frame; the first, stronger tint read as a brown wash (with the hurt vignette of a god-mode hero
  standing in craters on top of it).

**Verification:** `npm test` ALL PASSED (688 checks on the tree rebased onto #14, 635 before this session; BULLETS and FIRE grew),
`npm run build` ok (1695 KB). Film strips in the dev server (`__tick` + an overlay canvas): a
meteor's heat at k 0.2 / 0.6 / hot, a stomp zone, the burning pass, the flame ring and wall; a
perfect parry's shot flying back and landing (−30 HP); the torrent, the burst and the Scouring breath
emitting from the jaws; the whole Armageddon (rear-up, salvo, hush, three waves, the great meteor)
on desktop and on the phone preset (852 x 393, LOW). Phone preset, P3 peaks: additive glyph
particles torrent 634, burst 449, Scouring breath 1013, Armageddon 1805 (pool 7000); bullets 124
(pool 360, so `MAX` stays); hazards 25 (pool 64); 56 draw calls throughout (particles are one draw).

**Hits taken by the scripted heroes** (standing / answering every cue; before → after):

| Pattern | P1 | P2 | P3 |
|---|---|---|---|
| Ember storm → torrent | 2 / 1 → 4 / 0 | 4 / 1 → 6 / 0 | 4 / 2 → 6 / 0 |
| Cinder fan → burst | 2 / 1 → 4 / 1 | 3 / 1 → 5 / 1 | 3 / 1 → 5 / 1 |
| Wisp swarm | – | 4 / 1 → 6 / 1 | 4 / 0 → 6 / 0 |
| Fire wheel → Scouring breath | – | 2 / 0 → 1 / 0 | 2 / 0 → 1 / 0 |
| Meteor rain → Armageddon | 3 (standing) | → 5 / 0 | → 5 / 0, + 31 crater ticks |

Peak bullets in the air, before → after: storm / torrent 123 / 138 / 274 → 43 / 73 / 125 (the old
storm sprayed all round the body; the torrent's bullets all go the hero's way), fan / burst 20 / 35
/ 43 → 33 / 51 / 80, wisps 7 / 9 → 10 / 13. The answering bot parries 0.12 s before impact (outside
the perfect window) and rolls 0.1 s before a red one, in a frame: it says the patterns stay fair to
perfect reads, not that a person can read them.

**Not checked / open:**
- No human has played it; on-device frame rate on the iPhone is the owner's to confirm (the Vercel
  preview). The heat-glow readability at k 0.3 rests on my screenshots, not a fresh pair of eyes.
- A Scouring breath hits a standing hero once per cast (it sweeps past him and reverses before it
  comes round again); the P3 craters ticked the never-moving defender 31 times (4 each, blockable):
  a human walks out, but watch it.
- Close to the jaws the burst's gaps are narrower than the hero (from ~14 m off the mouth they
  clear him): close in every cough must be parried.
- Returns were only checked with scripted presses; the 0.08 s window and the 120 HP budget want a
  human feel test. AI pick shares, the `win` / `probe` bot times and the old ROADMAP items
  (bullet sounds of their own) were not re-run / done.
- `.claude/launch.json` gained a local config on port 5183 for this worktree; not committed.

**Next:** the owner's phone test of the preview; then tune from play (heat-glow strength, torrent
sweep speed, the budget, the crater ticks).

---

## 2026-11-12 — Session 14: two hands, a raised guard, idle life, gold hair, a clear charge

**Owner:** "make the character use both hands when he's swinging ... add some idle animations of the
character doing random stuff while not moving ... i like the new hooded look but the front details
and visuals makes him look like death. have his hair show a bit and make his hair colored gold to
stand out. also his hood is too pointy at the top. when he guards, make him hold the sword up in a
higher angle ... when he's charging the sword, the sword and arm are clipping through the cape."
Answers: both hands on every swing, one-handed carry at rest; all four idle kinds; the hood pushed
back a little; a two-handed guard raised across the body. Branch `player/two-hands-idle-life`.

**Done:**
- **Two hands (ADR-046):** every light swing and the stab are two-handed; `slashH` moves the grip to
  the chest's centre line and turns the chest less to the left; `DIM.offGrip` 0.08; the off hand
  closes round the grip (`rig.offHand`). The block is two-handed, the blade ~50° up across the body.
- **Idle life (ADR-047):** `FIDGETS` (look, stretch, inspect, twirl, shoulder, lean) after 2.5 s of
  standing still, cut by any input.
- **Cloak vs steel (ADR-048):** streamer sheets collide with spheres on the blade, keeping the side
  they came from; the charge pose's hands before the hip, the blade out to the side.
- **Follow-up, the owner: "the back cape is too floaty now and makes the character look wider from
  the back view. make it look similar to the original look."** The first version also held the
  sheets out round both arms, moved the sheet behind the sword shoulder onto the shoulder blade and
  lifted the cloak in the charge. All three are reverted; only the blade collides. Compared side by
  side with `main` (a second dev server on the old commit): the same back view at rest, running and
  stopping; hem width 1.29 m vs 1.23 m at rest, 1.15 m vs 1.15 m running.
- **Hood and hair (ADR-049):** a rounder hood worn further back; gold fringe and cheek locks; a
  warmer face and smaller brown eyes.
- **Tests:** a new HEROLIFE scenario (two hands in every swing's active frames, the guard's angle,
  the charged blade vs the cloak, idle actions and their cut, none while locked on); HERO checks the
  hair kept under the hood.

**Verification:** `npm test` ALL PASSED, `npm run build` ok. In the Lab model viewer (solid and
ASCII): the head from six angles, the chain frame by frame from the front three-quarter, the block
and the charge from the front, back and sides, every idle action. At the phone camera (852 x 393):
the block and the charge facing four ways, the first three hits. A probe of blade and arm points
against the cloak sheets over idle, run, block, the chain and the charge.

**Measured:** off hand to grip ≤ 2.5 cm in every swing (was up to 8 cm before the chest-turn fix);
charged blade inside the cloak in 0 of 96 test frames (was 94 of 150); bot `win` 139 s; REACH
unchanged.

**Not checked / open:**
- No human has played it; not tried on the phone.
- The arms still pass through the cloak near the sheets' roots (as before this session).
- The left arm still locks straight at the end of the two-handed stab and the slam.
- The twirl passes the blade through the cloak region behind him for ~0.3 s.
- Gold hair applies to the Wanderer's set too; `docs/art/hero.md` is still out of date.

**Next:** the owner's phone test of the preview.

---

## 2026-11-11 — Session 13: a hooded cloak, arms that bend, fewer draw calls

**Owner** (with the reference again: a hooded swordsman in a huge ragged cloak, the sword low at his
side): "The main character hand motion and animation looks very unnatural and can be improved. Also
the game performance seem to have slowed down while testing it on my iphone ... If you think
recreating the character from scratch will help to make this easier and look similar to the
reference image, let me know." Answers to four questions: a new outfit on the same skeleton (not a
full rebuild); every motion looks wrong (standing, running, attacks, block / roll / heal); slow all
the time, not only in the fight; an iPhone 15 / 16 / 17 Pro, Low Power Mode off. Branch
`player/natural-arms-mobile-perf`.

**Found:**
- Frame cost: about 510 draw calls in the fight on the phone preset (852 x 393, LOW), 575 in a
  1024 x 768 window. The hero is 138 meshes and the wyrm 183, and nearly all of them are drawn
  twice (the shadow pass alone was 324 of the 575). GPU timer
  queries on a desktop: the hero or the wyrm alone costs the same into a 4 x 4 target as at full
  size, so it is per-draw overhead, not fill; grass, forest and the ASCII pass are small next to it.
  About 2,500 GL calls a frame.
- The arms: over the five-hit chain the sword arm reached 4 deg of elbow bend in four of the five
  hits, and the forearm-to-blade angle stayed within 24-40 deg through the whole rising cut and
  whirl. `slashH` held the hand at or past full reach with the blade exactly radial to it.

**Done:**
- **Outfit (ADR-043):** `gear/shroud.js`, the Shrouded set, is `DEFAULT_LOADOUT`: hood (`hidesHair`),
  wrap tunic, bound sleeves with bare hands, a mantle and seven cloak sheets on the streamer springs
  (`lag` 0.5, `max` 1.45; wrapped along the body while tumbling). The cloak covers his back and left
  side; the sword arm is clear. The old outfit is `WANDERER_LOADOUT`. Cloth far fill raised.
- **Arms (ADR-044):** `slashH` `ext` / `lead` driven by `SWING`: a cocked arm in the coil, the fist
  leading the blade, the arm opening through the cut and folding in the finish; the blade's own
  direction unchanged. `_arm` soft reach (`ARM_SOFT`). Light 1's free hand guards before the chest.
  The slam's hands go behind the head at the apex. The run's sword hand swings with the stride.
- **Draw calls (ADR-045; built by a background agent in its own worktree, cherry-picked here):**
  `render/rigidBatch.js`: every rigid part of the hero and the wyrm is a bone in one shared float
  texture (`U.uBoneTex`); each actor draws one merged mesh per material and one shadow mesh
  (`LAYER_CASTER_RIGID`). The source meshes stay in the scene graph, hidden from the cameras. One
  scene matrix update per frame instead of two. Quality presets carry a shadow map size (LOW 1024).
  `?nobatch` in the URL turns the batching off.
- **Tests:** HERO checks the cloak's sheets, the hood hiding the hair, the Wanderer's set still
  building, and both elbows keeping more than 23 deg (measured 40 and 46). A new BATCH scenario (22 checks): the
  batches, the bones, hidden parts, shadows, loadout rebuilds, dispose, `?nobatch`.

**Verification:** `npm test` ALL PASSED (635 checks), `npm run build` ok (1675 KB). In the browser on
the merged tree: no console or GL errors, 23 programs link. Looked at in the Lab model viewer (solid and ASCII): the idle from six
angles, the five-hit chain frame by frame, the run from the side, block, heal, roll, the slam and
the thrust. At the phone-size game camera: the idle facing four ways and the first three hits.

**Measured:** sword-arm elbow bend over the chain 46-146 deg (was 4-146); the slam's apex wrist 99
deg (was 147). Draw calls per frame at 852 x 393, LOW, with the new outfit
(`renderer.info`, 30-frame averages): title 432 → 55, fight 509 → 56 (`?nobatch` against batched).
The agent's pixel comparison of batched against unbatched on the same frozen frame, made with the
OLD outfit: 0 of 334,836 pixels differ in the fight and model views at phone size, up to 25 of
786,432 at 1024 x 768, a median of 3 per frame over 120 action frames, and one frame with 717 that
it could not reproduce (it puts the residue down to shadow depth rounding at the bias threshold).
`pipeline.render()` CPU time on a desktop RTX 4090: about 0.92 → 0.39 ms.

**Not checked / open:**
- No human has played it, and nothing here was run on a phone: the frame-rate gain on the iPhone is
  not measured. `?nobatch` in the URL turns the batching off for an A/B on the device.
- The pixel comparison was not repeated with the new outfit; batched, it was only looked at (model
  viewer and the phone-size game camera).
- Batched parts are not frustum-culled one by one (about 30k more triangles a frame; an off-screen
  wyrm still costs 14 draws), and LOW's 1024 shadow map softens shadow edges on desktop too.
- Damage per second and the bot win time were not re-measured after the arm changes (the grip sits
  up to ~5 cm nearer the shoulder at a full stretch; REACH passes).
- The cloak has no collision: it passes through the legs, the coat tails and the ground, and fans
  out wide in a roll. A 145 deg wrist remains for ~3 frames in the slam's windup.
- Idle, block, heal, roll and thrust poses were looked at and left as they were (soft reach only).
  Stagger, knockdown, death and the plunge were not looked at with the new outfit.
- `docs/art/hero.md` describes the Wanderer's set and the old arm.

**Next:** the owner's phone test of the Vercel preview; then whatever still reads wrong in motion.

---

## 2026-11-11 — Session 12: hands, the five-hit chain, a slim profile, equipment slots

**Owner** (with a reference image: a cloaked swordsman, the sword low at his side): "The character
right now has no right hand, the way he's holding the sword is a bit awkward and not natural. His
first 2 arc swings can also be improved. Add a few more animations ... He looks weird when viewed
from the side ... I also plan to make this a rpg where you can equip new armor and weapons so make
sure the characters outfit can be replaced easily." Answers to four questions: idle = low at his
side; attacks = a longer varied chain + sprint attack + roll attack; equipment = the structure
only; side view = cape and coat shape, the rest left to judgement. Branch
`look/hero-hands-combo-slots`.

**Done:**
- **Moveset (ADR-041):** `LIGHT` is five hits (falling cut, rising backhand, whirl, stab, slam);
  `SPRINT_ATK`, `ROLL_ATK`. `anim.js`: `spinTurn`, `stabPose`, the `sink` and `feet: 'dash'` options;
  the windup loop and the free hand's reach key on `anim.loop`, not on `combo === 1`.
- **Hands (ADR-041):** `gripFist` on the sword joint, `looseHand` on the left forearm
  (`heroGeo.js`); the undersuit has bare versions.
- **Idle (ADR-041):** `IDLE_SW` [-0.6, -0.79, 0.12], edge down, the upper arm by the ribs.
- **Profile (ADR-041):** `CAPE_SHEETS` (`ry`, `out`) and `COAT_PANELS` (`flare`, hem widths).
- **Gear slots (ADR-042):** a subagent split `model.js` (1490 → 562 lines) into `heroDims.js`,
  `heroGeo.js` and `gear/` as a pure refactor in its own worktree; it compared the default
  loadout mesh by mesh with the old build (136 of 136 byte-identical) and ran the suite with
  reduced loadouts. On top: `player.equip` / `setLoadout` / `loadout`, and no sword glow unarmed.
- **Tests:** REACH covers five hits; HERO checks the chain order and wrap, the whirl's whole turn,
  the sprint slash (name, 1.8–3.4 m, heading kept), the roll cut, the backstep, the gear slots, the
  fist's owner, three loadout swaps and a bad id; HEROLOOK walks the new moves.

**Verification:** `npm test` ALL PASSED, `npm run build` ok (1660 KB). Looked at
in the Lab model viewer: every new move frame by frame, the idle from eight angles (ASCII and
solid), both hands close up, both side views, four loadouts. At the game camera: the idle facing
eight ways.

**Measured:** sustained chain damage 63 /s (was 62 /s). Two `win` bot runs: 154 s and 144 s (177 s
in Session 10). Two runs; not enough to say the fight is easier.

**Not checked / open:**
- No human has played the new chain. The whirl turns his back for ~0.1 s; the sprint slash ignores
  the aim and the step-in assist.
- The new moves at the game camera in a real fight; a phone; frame cost.
- Heal, stagger, knockdown, death and plunge with the new hands (the fist rides the sword joint, so
  it follows wherever the sword goes).
- The undersuit was only looked at standing still.
- Weapons of other lengths are not supported (ADR-042). `docs/art/hero.md` is out of date.
- Facing west / north-west at the game camera the idle blade is still behind him.

**Next:** playtest; the M1.13 follow-ups; a second gear set and an equip menu when the look is
settled.

---

## 2026-11-09 — Session 11: hero review, athletic build and the idle sword hold

**Owner:** "review the main character and fix any details and features to make sure he looks good.
make sure his animations and sword posture looks natural and good. right now he is a bit too lanky".
Worked in the `combat/wyrm-bullet-hell` checkout while another session was committing to it; this
session's files are the hero's only (model, anim, fx, parts, the `herolook` test, docs).

**Done (ADR-040):**
- **Build:** chest 0.34 → 0.39 m, waist 0.23 → 0.27, shoulder joints ±0.16 → ±0.178, hips ±0.105,
  arms / thighs / boots ~20 % thicker, head joint ×1.08, hands ×1.12. Collar and pauldron now follow
  the body in `hero_parts.py` (`COL_K`, `PAUL_K`); parts rebuilt with `npm run hero-parts`. Coat
  panel tops and cape roots widened; cape flare down about a fifth.
- **Idle:** blade out to his right (`IDLE_SW` [-0.725, -0.68, 0.1]) from a bent arm, shoulder-width
  stance. Before, it pointed ahead from a straight arm and was hidden at the game camera when he
  faced away.
- **Light 1 recovery** comes home round the front (`HOME_WAY`); the short way to the new idle went
  behind his head (the `herolook` test caught it as 4.3 cm of blade in the sword arm).
- **Tip streak** moved onto the drawn point.

**Verification:** `npm test` ALL PASSED, `npm run build` ok (1652 KB). Looked at in the Lab model
viewer (ASCII and solid, eight angles): idle, run, light 1 and its recovery, light 2, slam, block and
release, charge, roll, run start / stop. At the game camera: idle facing eight ways.

**Not checked / open:**
- Heal, stagger, knockdown, death, plunge, sprint and strafes with the new build (only the test's
  blade-in-body check covers part of them).
- Facing west / north-west the idle blade is behind him at the game camera; facing north half shows.
- A phone, frame cost, and a real fight were not looked at.
- `docs/art/hero.md` still describes the lean build and the old idle.

**Next:** playtest; the M1.12 follow-ups.

---

## 2026-11-09 — Session 10: bullet hell, two more strings, the moonlit sword

**Owner:** "the pants fabric in the front keeps clipping through the sword. make the sword a little
shorter and make it glow more blue/white ... the dragon needs to do more bullet hell moments that
requires the player to dodge and react ... make the fire animations and overall attacks look way
more epic and cooler." Answers to the design questions: a sword of about 1.25 m; bullets you can
deflect or dodge; all four pattern families; about as hard as now. Branch `combat/wyrm-bullet-hell`
(started on top of `look/hero-blender-parts`; rebased onto `main` after PR #8 merged).

**Done:**
- **Sword** (ADR-038): drawn length 1.64 → 1.25 m (`DIM.drawnTip` 1.06; blade parts rebuilt with
  `npm run hero-parts`), lit blue with white-blue edges (`BLADE_BASE`, inks, emissive, rest glow
  1.45). Combat reach unchanged.
- **Idle:** the blade is held in a low ready at his right side, outside the coat, instead of across
  his front between the coat panels. That was the clipping.
- **Bullets** (ADR-039): `dragon/bullets.js` (pooled field + the fire wheel), `bulletAttacks.js`
  (four patterns), `bulletFx.js`, `tuningBullets.js`. Embers / wisps: parry (flies back, adds
  posture), block, roll, cut. Orbs and the wheel: dodge. A cue 0.35 s before every hit, one parry per
  clump, duds for bullets that could not be announced, a grace after a hit, a hit cap per pattern.
- **Strings:** Storm flurry (5 hits, phase 1+), Cinder flurry (4 hits + 4 scattered embers, phase
  2+). Idle gaps shortened; `TUNING.damageScale` 0.85.
- **Player:** `isSwinging()`, light parries (`hit.light`), plain-dodge-only hits (`hit.perfect ===
  false`).
- **FX:** claw wakes, slam bursts, reworked breath / fireball / parry sparks; audio and the death
  feed know the bullets.
- **Tests:** BULLETS scenario in `tests/integration/integ.mjs`. `npm test` ALL PASSED, `npm run
  build` ok (1651 KB).
- **Docs:** COMBAT.md "Bullets" + numbers v0.6, ARCHITECTURE.md contract v0.6, STYLE.md "Bullets",
  ADR-038, ADR-039, ROADMAP M1.11, CHANGELOG.

**Measured** (COMBAT.md "Difficulty", one run each): probe 95 % wins in 134 s (was 145–150 s); probe
85 % dies at 122 s with the wyrm at 4 % (was: wins 1 of 3); `win` 177 s with 77 parries and 39
deflect chains (was 157.5 s, 44 and 26).

**Looked at in the browser** (Lab-triggered, game camera, screenshots): the idle and the sword;
ember storm in phases 1 and 3; cinder fan; wisp swarm; fire wheel; breath; fireball; a bullet deflect.
Two looks were wrong on first sight and fixed: the wheel's spokes and the deflect clash were white
blobs (the additive rule in STYLE.md).

**Not checked / open:**
- No human has played it. Difficulty and readability rest on the bots.
- `slamBurst`, the Storm flurry as a whole and the parry slash's new colour were not looked at one
  by one; claw wakes were seen only in an early Cinder flurry sheet.
- The scripted defender still takes up to 2 hits in a phase-3 ember storm.
- Run and attack frames were not re-audited for coat / blade crossings; only the idle was.
- The drawn blade is 0.44 m shorter than the hit segment.
- Frame cost of ~200 live bullets on a phone: not measured.
- The AI pick-share paragraph in COMBAT.md is v0.5's.

**Review fixes (PR #9, same day):** three cue bugs found by the automated review, each reproduced
by a new BULLETS check that fails on the old code and passes now.
- Even-count fan (phase 2, 8 embers): the centring was inverted, so the first fan had no ember on
  the hero and no lead bullet; the headline flash came 1.03 s before the first hit. Now 0.33 s
  (`fanOnHero` / `fanOffset` in `bulletAttacks.js`).
- A homing wisp's cue was for life: sidestepped after its cue, it came round and hit 1.23 s after
  its only cue. A cue now stands for one impact (`cueAt`, `TUNING.bullets.recue` 0.12 s); the
  second pass is cued 0.35 s ahead, or the wisp is a dud.
- Wisp swarm at 28 m: the lead wisp lands after the action ends, and the end-of-action flush
  flashed 0.72 s early. The field now holds that flash for the lead (`bullets.holdFlash`); 0.33 s.
  The window is narrower than the review said: the lead outruns the action only beyond about
  24.5 m (the AI roars the swarm up to 30 m).
- Not looked at in the browser: these change when a cue fires, not what is drawn.

**Next:** playtest; then the follow-ups in ROADMAP M1.11.

---

## 2026-11-09 — Session 9: Blender-built hero parts (single-figure reference, round 3)
**Owner:** "use blender headless to help you out" with the single-figure reference match that
Session 8 left part-way. Branch `look/hero-blender-parts`.

**Done:**
- **Blender part pipeline (ADR-037):** `npm run hero-parts` (`scripts/blender/build-hero-parts.mjs`)
  dumps `DIM`, `BODY`, `REST`, `HAIR_CLUSTERS` and `CAPE_SHEETS` from `model.js` to JSON, runs
  `scripts/blender/hero_parts.py` in a headless Blender (5.2 here; `BLENDER` env var or PATH) and
  writes `src/entities/player/heroParts.js`: 33 parts, 7.2k vertices, 9.6k triangles, packed base64
  (positions and `aGUV` Int16 / 8192, normals Int8, `aPart` Uint8 / 200, Uint16 indices), ~210 KB.
  `partGeometry(key)` in `model.js` decodes a part; JS still picks the joint and the material. The
  generated file is committed, so the game, the tests and the Vercel build need no Blender.
- **Sculpted in Blender:** the hair (a rounder mop of ~60 locks over a scalp cap, per spring cluster,
  dark mass + sheened tips), the winged stand collar and its rim, the lapels and their piping, the
  blade (forte, faceted core, barbed cyan edges), the cape (four wide torn sheets with holes and a
  clawed hem, `CAPE_SHEETS`) and the pauldron (a cap and a pointed lame with bevelled edges and four
  short blades).
- **In `model.js`:** darker cloth and lining, brighter skin, both eyes on the skull's surface (the one
  eye sat 6 mm under it), the arm strap rings and the left bracer's bands removed, three shirt
  buttons instead of seven, wider and more flared coat panels, a narrower blade. The JS builders the
  parts replaced are deleted (`hairGeometries`, `hairCap`, `collarGeometry`, `collarRimGeometry`,
  `bladeGeometry`, `domeShell`, `domeRim`).
- The interactive Blender MCP link timed out on every call, so Blender is driven from its command
  line (`--background --python`); nothing depends on a running Blender.

**Verification:** `npm test` green, `npm run build` OK (1615 KB). Captures (session scratchpad): the
reference angle next to the reference image, front / back / right, the head close-up in ASCII and
solid, the gameplay camera from behind, and every move from the back and the right side: the cape
streams behind in the run, the grip stays in the right hand, no gross clipping. Not checked: a phone,
frame cost, the far gameplay camera in a real fight.

**Honest state:** closer again in silhouette (hair mass, collar, one big torn cape off the armoured
shoulder, a narrower jagged blade, darker masses), still clearly NOT a match. The face is a pale
oval with dot eyes; the coat is a pleated bell of straight fold lines, not the reference's long
ragged tails; the pauldron is two plates with fins, not a stack of ornate spiked lames; the arms and
legs are plain tubes and plates without the reference's belts, buckles and layered armour; the
reference's density of small bright detail is not there.

**Next:** the coat as Blender-built panels (broad folds, long tattered tails), the face (brow, nose
and jaw lines), arm and leg armour as sculpted parts, the belts and buckles. See ROADMAP M1.10.

---

## 2026-11-09 — Session 8: single-figure reference, round 2 (stopped part-way)
**Owner:** the hero "still does not look like the attached reference image on terms of detail and
feel"; mirror the single-figure image as closely as possible; the sword hold and its angle are
awkward. Branch `look/hero-reference-round-2`. The owner stopped the session before the geometry
rebuild was finished, so this entry records a PARTIAL result.

**Done:**
- **Idle and sword hold (ADR-036):** the single-figure stance. Weight on the left leg, the right leg
  straight out to his right and forward, the sword arm hanging beside the right hip, the blade in a
  low diagonal across his front (`IDLE_SW` [0.75, -0.58, 0.26], ~37° below level; the reference is
  ~44°), the head bowed and turned along the blade. Reverses ADR-034's blade hung at his right side.
- **Dot-matrix shading (ADR-036):** the hero's fill is a 3x3 micro-font (29 marks, `PIXEL_3X3`) in
  square 4x4 px cells instead of 3x5 letters in 4x6 cells; fill brightness linear in the light
  value, a little greyer; cel-stepped key light (`U.uArtHeroCel`); per-part silhouette ink
  (`U.uHeroPartRim`; fill style + 8 = a dotted silhouette); plain ink lines kept under the bloom
  threshold. `PIXEL_3X5` and `PIXEL_LINES` are gone.
- **Coat:** six wider, longer panels with drawn fold lines (`foldLines`: a smooth `aPart` field whose
  0.5 contour the ink pass prints as a crease; `HERO_INK.*.sub` / `uArtSub` shades the valley side).
- **Cape:** the two sleeve streamers became four torn ribbons from under the pauldron on the same
  streamer springs, each with its own outward flare (`out`).

**Verification:** `npm test` green, `npm run build` OK. Captures (session scratchpad): the reference
angle, front / sides / back / rear 3/4, and every move from the back, right and front after the coat
and cape change: grip in the right hand, no gross clipping, moves read as before. Not checked: the
real 36 m gameplay camera in the grass, a phone, frame cost of the wider coat.

**Honest state:** closer to the reference in stance, sword hold, mass and tone; still clearly NOT a
match. The coat reads as a closed pleated skirt covered in straight lines (from behind it hides the
legs that ADR-034 opened up); the cape is stiff shards, not a wide torn sheet; hair too narrow; no
face; collar not winged; legs are wireframe plates; one smooth pauldron with long claws; plain
straight sword; overall grey where the reference is near-black with sparse bright edges.

**Next (planned, not started):** open flared coat (fewer, broader folds), a face-on cape sheet, hair
mop, face lines, winged collar, dark legs with knee guards, layered pauldron, jagged blade, darker
tones. See ROADMAP M1.9.

---

## 2026-11-09 — Session 7: the lean reference match (the hero from every side)
**Owner:** improve the hero to closely match two new ASCII references (a single-figure image for
appearance, detail and the sword; a six-view turnaround for construction), "especially from the back
and rear three-quarter gameplay views". Priorities: a lean anime swordsman silhouette; distinct,
asymmetric pointed hair with crown and nape layers; a raised collar and a layered right pauldron with
depth; an intentional back (shaped upper panels, a diagonal strap, restrained seams, a narrow belted
waist); two tapered coat tails and narrow side panels instead of the broad skirt, legs visible; the
reference's sword; ASCII shading with dark planes, readable midtones, selective bright edges and
restrained bloom. Plus an inspection view (dark background, front / both sides / back / rear 3/4, the
real gameplay camera at play size, a turntable, solid and ASCII toggles). Branch `look/lean-hero`.

**How:**
- Measured the references first: the six views' silhouettes per height (closed masks), in fractions
  of his height H: shoulders ≈ 0.24 H, chest ≈ 0.18 H, belted waist ≈ 0.12 H, thighs ≈ 0.06 H, the
  coat tails to ≈ 0.8 H, flaring to ≈ ±0.24 H. Diagnosis of the baseline: round 3's broad build and
  closed A-line skirt (from behind at the game camera a lettered trapezoid with no legs), a round mop,
  a tall tube of a collar, the portrait idle's blade across his front (hidden from behind), a blade
  halo over his body.
- Built the look-dev tools before touching geometry (ADR-035), then iterated: geometry first in the
  Solid look, then the ASCII shading; each round compared side by side with the reference panels at
  matched height (headless Chrome on the RTX 4090 over DevTools, the sim stepped with `__tick`).

**Done — look-dev (ADR-035):** model viewer angles 3/4 R, Right, Rear R / L; Spin (a turntable);
Sheet (ten live tiles: front, front 3/4, right, left, back, rear 3/4 ×2 at eye level and the gameplay
camera on his back / front / right side at ×2, read back in the new `lab.postRender` hook); looks
ASCII / Solid / Source / Lines (`U.uHeroSolid`: a clay render with alpha 0 that the ASCII pass passes
through).

**Done — the hero (ADR-034):**
- Lean `BODY` (chest 0.34 over a 0.23 m waist, shoulders ±0.16, slim limbs) on the same bones.
- Hair: layered pointed locks (crown spikes, top, two back layers hanging down with lifted points,
  nape flicks, side locks, a jagged fringe; the scalp cap's hairline under the fringe roots).
- Collar: lower and flared behind, points beside the jaw in front, a turned-over rim.
- Back: a yoke whose seams dip to a four-point star, a centre seam, the baldric (a strap round the
  torso in a tilted plane, right shoulder → left hip, buckle and ring), two belts.
- Pauldron: a ×1.3 stack (cap, band, two arm lames standing off the sleeve, claw blades).
- Coat: six panels: two back tails split by a vent, narrow side panels, front panels; `skew` keeps
  the vent / front edges straight while the outer edges flare, `slant` slopes the hems, piping on the
  vent and front edges, 12 strips (outer longest). Banded calves; slimmer boots and knee guards.
- Sword: the single-figure image's (broad base, long taper, hooked barbs, lightning notches, a guard
  swept up round a violet four-point star gem).
- Idle: the sword hung at his right side, out and forward-down; `dirLerp` sends near half-turns round
  the front (the light combo's finish → idle cut the sword arm's shoulder for one frame).
- Game-camera shading: blade far self-light 2.3 → 1.25 × far and HDR cap 1.8 → 1.3 (a tight glow),
  armour far fill / lines −25 %, the lavender torn zone's far fill 0.4 → 0.8.

**Decisions:** ADR-034 (lean hero, coat tails, idle at the right side), ADR-035 (look-dev tools).
The idle follows the turnaround, not the single-figure image's dynamic portrait stance: the user
gave the rear views equal priority, and from behind the portrait's diagonal blade was hidden.

**Verification:**
- Captures (session scratchpad `cap/`): every angle in Solid and ASCII at inspection scale, the
  gameplay camera at 36 m from the back / front / side / rear 3/4 (dark and in the grass), the sword
  face-on, reference-vs-ours side by side (back, rear 3/4, front, right), and every move (idle, walk,
  run, sprint, light 1, light 2, slam, charge + thrust, dodge) at key moments from the back, right
  side and front: the grip stays in the right hand, nothing passes through his body.
- Game camera, facing away: his lit area now matches the reference's at the same height (4357 vs
  4374 px; the broad build covered 6462); mean luma 74 (reference 55; baseline 79), dark share 49 %
  (reference 56 %, baseline 40 %).
- `herolook`: lean proportions asserted; the drawn blade never enters his body over 831 frames
  (closest 2.9 cm; the baseline let it sink ≤ 2 cm); it crosses a coat panel on 1 of 509 locomotion
  frames. `hero`: 6 panels / 12 strips, strip tips ≥ 0.1 m above the grass, the steel point ≥ 0.014 m.
- New Lab checks: the rear 3/4 + solid look, the turntable, the sheet overlay, a clean exit.
- `npm test`: ALL PASSED; `npm run build`: OK (see the PR).
- The DIE scenario's "dragon frozen while paused" failed once: the blade halo now spawns fewer
  particles, which shifts the shared `Math.random` stream the seeded wyrm AI rolls on, and the wyrm
  happened to walk on the Esc frame (which still runs on the pre-pause dt). The check now snapshots
  the wyrm after that frame.

**Open issues / next:**
- At the game camera he is still brighter than the scaled reference (the one-pixel silhouette line,
  kept for legibility on the grass); the hair has less volume than the reference's mop; the tails'
  dotted lavender rag along the outer edges is fainter; the face has no nose / mouth lines.
- The sleeve streamers are not in the new references (kept for now).
- The slash / slam FX look huge in close-ups (sized for the 36 m camera, known).
- Cosmetic FX share `Math.random` with the wyrm AI: give FX their own stream.
- Move the capture harness into the repo (carried over).
- **Next:** the owner reviews the PR preview (Lab → MODEL VIEW → Hero, Dark, Sheet / Spin / Solid).

---

## 2026-11-09 — Session 6: the epic wyrm fight (combos, the plunge, flights and fire, three phases)
**Owner:** the hero is "too lanky / skinny", and his sword always shows and clips through him, even
through his back from behind. The dragon needs far more attacks, epic fire spells, flying attacks and
fire from the air. A perfect dodge should put the hero on top of the dragon for a flying stab into
its head (the teleport behind it confused players). Enemy combos should be parried hit after hit,
like Sekiro / Phantom Blade Zero. The fight should be longer and harder.
**Owner's answers:** the head-stab is automatic on every perfect dodge in range; the fight lasts
3–5 min, is hard and has three phases; flying means short flying attacks; all four spells (meteor
rain, eruptions, flame walls / rings, an inferno nova).

**How:** a shared spec with four contracts (1 strings and the deflect chain, 2 the plunge, 3 hazards
and fire attacks, 4 three phases) and four worktree agents in parallel, each owning its files:
hero-look (`c3/hero-look`), plunge (`c3/plunge`), dragon-melee (`c3/dragon-melee`) and dragon-fire
(`c3/dragon-fire`). Base: `main` @ `8ce6aef` (PR #4, the reference match, merged). The lead merged
them into `combat/epic-wyrm` (`cbc3056`, `b528723`, `4020ad6`, `c6f4411`; the dragon-side plunge
scenario renamed `plungeReact`) and tuned the result (`64543ac`, `b3a69b3`, `1fe7f42`, `9fbf9fd`).

**Done — the hero:**
- **Broad build (ADR-031):** a `BODY` girth table on the same bones: chest 0.40 × 0.21 → 0.50 ×
  0.27 m, waist 0.27 → 0.31, hips 0.30 → 0.34, thick arms and legs, bigger boots, shoulders ±0.21.
  The sword hand aims from the old shoulder spot, so the grips are unchanged.
- **The blade is depth-tested again:** the depth pull (ADR-022) is gone, so the sword no longer shows
  through his back or legs. The coat yields to the steel (hangs inside the sword hand or drapes over
  it, latched per panel): blade-through-coat frames 156 → 25 over 23 clips.
- **The plunge (ADR-027):** a perfect dodge of the wyrm within 30 m of its head: vanish, hang 5 m
  above the head, dive, a reverse-grip stab (90 final damage, 40 posture), ride the head down,
  backflip to a visible landing in front of it toward where he came from, then the crit window.
  Out of range or against a fire hazard: slow-mo + crits in place. On a posture break, attack near
  the head for the **execution** (260). Plunge poses (hang, dive, ride, flip, three-point landing),
  cold FX, a dive whoosh and a skull-crunch impact.
- **Deflect chain feel:** parries in rhythm snap the blade to alternating sides, push him back a
  little, grow the clash and raise the clang a step each; the guard lingers between taps; "DEFLECT
  ×N" and "EXECUTION" call-outs.
- **Camera keep-in-view:** `cameraRig.keep` pans (and pulls back a little) so the hero and the head
  stay on screen through the plunge; the flow uses it to frame a flying wyrm.

**Done — the wyrm:**
- **Strings (ADR-026):** a data-driven string framework with ten hit kinds and seven strings: claw
  combo, rending flurry, hesitant maw (a held bite that baits an early parry), wing buffet, tail
  lash, pounce, frenzy (6–7 hits). A parried non-final hit is deflected (posture + a 0.14 s
  knock-back), the string goes on; the last hit's parry recoils it.
- **Plunge reaction:** `plungePoint` / `onPlunge`, the `plunged` reaction (the head slammed down, a
  thrash, the rise; in the air a fall and a crash landing first; an execution heavier, spending the
  break).
- **Three phases (ADR-028):** gates at 66 % and 33 %, transition roars that clear the hazards, a
  white-hot phase 3 that opens with the nova, per-phase tuning arrays, a generic weight-based AI
  selection, the Lab's Phase 3 button, boss-bar phase ticks, the phase-3 banner and music.
- **Short flights (ADR-030):** the burning pass, the sky dive, the hover barrage, with hover, glide
  and dive poses and the GLIDE / DIVE wing keys.
- **Fire spells and hazards (ADR-029):** meteor rain, fire eruptions (a phase-3 chase), flame ring,
  flame wall, inferno nova; a pooled hazard system with red ground warnings; 12 procedural fire
  sounds; all FX from world-atlas glyphs.

**Lead, after the merge:**
- A successful deflect re-arms the parry at once (ADR-032): a player holding the guard a moment
  between blows could not re-arm in time for the next blow of a string.
- Fire hazards no longer flash the red screen edge (a meteor rain pulsed the whole HUD).
- AI weights retuned: up close the stomp and the bite were ~2/3 of the picks. The dive and the hover
  barrage have no minimum distance, the strafe's is 7 m, the eruptions' 6 m, the breath works from
  4.5 × S. Close-range pick shares now: P1 strings ~60 %, bite / stomp ~40 %; P2 strings ~39 %, fire
  and flights ~35 %, singles ~25 %; P3 strings ~42 %, fire ~41 %.
- A new phase's abilities unlock one by one (`unlockStagger` [2, 2.5, 2] s); the nova opener is not
  delayed.
- HP 4200 → 4500; the plunge's hurt flash is capped at 0.45 (the hitstop froze its decay and washed
  the wyrm white).
- The airborne plunge in play: fire the wyrm breathes or spits from the air (the burning pass's
  strip front, the hover barrage's shells) spawns its hazard with `plunge: true`, so perfect-dodging
  it sends the hero onto the flying wyrm's head and it crashes (before, every blow dealt in flight
  was a no-plunge hazard and the crash was only reachable from the Lab). Spells from the sky or the
  ground (meteors, pillars, rings, walls) still never plunge. A deflect's instant re-arm is cleared
  on respawn.
- Tests: the opt-in `probe` scenario (ADR-033), the plunge's head damage exact, the eruption chase
  judged against each pillar's live window, the deflect re-arm assert, a perfect dodge of the burning
  pass plunging onto the flying wyrm (it crashes and fights on); the win scenario's pre-merge plunge
  emulation is gone.

**Decisions:** ADR-026 … ADR-033.

**Verification:**
- Per-agent headless GPU captures (deterministic boot, the game camera plus side / back / close
  views): `scratchpad/combat3/<agent>/` (hero-look `sheet_*`, plunge `plunge_*` and
  `deflect_chain_*`, dragon-melee `sheet_<string>_side/game`, dragon-fire
  `sheet_game_<ability>`).
- Merged captures at the game camera (`scratchpad/combat3/final/`): a live fight with the AI on, the
  plunge from in front, the sky dive with the flying framing, the dive and the barrage from the air,
  the phase-3 roar and the nova opener, and the hero's back / reference / side views.
- `npm test`: ALL PASSED on the tuned merge (0 console errors; 54 catalogued events, payloads match;
  glyph check 218 literals, bad = 0). New scenarios: `plunge`, `deflect`, `strings`, `plungeReact`,
  `timing`, `fire`, `herolook`; `win` now runs three phases. Highlights: every string contact
  within ±85 ms of its flash + lead (worst 67 ms, 661 placements); every fire blow within 17 ms; the
  plunge deals exactly 90, lands in front of the head and keeps both on screen (also onto a flying
  wyrm and through the leap); the blade never sinks > 2 cm into the body (831 frames).
- `npm run build`: OK (1402 KB).
- Difficulty (integration bots; the probe ran at 4200 HP, 4500 adds ~7 %): a 95 % probe bot wins in
  145–150 s, 85 % wins 1 of 3 (129 s) and dies 2 of 3, 70 % always dies; the god-mode `win` bot at
  4500 HP wins in 157.5 s (P2 at 51 s, P3 at 91 s; 44 of 46 parries, 26 deflect chains, 24 plunges,
  posture breaks at 25 s and 87 s).

**Open issues / next:**
- **Playtest:** a human playtest is needed. The bots heal poorly, so the probe's death rates are
  pessimistic; the 3–5 min target is inferred from the bots.
- **Hero:**
  - his mass reads only modestly at the game camera (the wide skirt dominates the outline)
  - from behind, the low idle guard now shows only the point
  - 25 coat-crossing frames remain (near the hilt; the torn strips and sleeve streamers ignore the
    blade), the coat swings more in runs, the block's free hand doesn't brace the flat
  - over the wyrm at the game camera the plunging hero reads mainly through his cold tint and the
    cyan blade
- **Wyrm:**
  - the tail "jab" is a lash, not a thrust (needs a tail-raise control in the rig)
  - the wing buffet's range band is narrow (6.8–8.3 model units)
  - later string hits can whiff a hero who doesn't move (the frenzy's 4th–6th hits land on 13–17 of
    33 placements)
  - the overhead claw is hard to read at the game camera; the deflect knock-back is a small 0.14 s
    offset
  - the meteor cast has no red windup glow of its own; the dive hovers at 13 m and the barrage at
    9 m (spec 14 / 8)
  - the phase-3 eruption chase is verified in the sim only
- **FX:** the clash bloom is large in synthetic captures (the wyrm's parry spark can land on the
  hero's chest; in real fights it is at the claw).
- **Carried over from session 5:** the capture determinism leak, the stray `"` glyph particles, the
  hero's coat drape and face, the boss camera in melee, the wyrm's letter boil.
- **Next:** open the PR from `combat/epic-wyrm`; the owner plays its preview and approves; tune from
  the playtest; then cut the release (the reference match is merged but not released yet).

---

## 2026-11-08 — Session 5: the reference match (wyrm and hero look and motion)
**Owner:** "i want you to focus on making the dragon and character look as identical and good as
the attached reference images and make sure the animations and movement look great." Attached: a
red-black ASCII dragon and the "Shadow Swordsman" ASCII line-art hero.

**How:** two rounds, each with four worktree agents (dragon look, hero look, dragon motion, hero
motion), merged into `look/reference-match` (draft PR #4).
- **Round 1** (`main..f66017b`): each build agent was followed by an independent reviewer that scored
  it and added a polish pass. Scores after polish: dragon look 6, dragon motion 7, hero look 6, hero
  motion 7.5 (out of 10).
- **Round 2** (merges `ca69453`, `fc44cf4`, `c8f61c9`, `419a6ca`, from the lead's review of round 1)
  was **stopped early** because the owner wanted to wrap up:
  - hero look (self-score 6) and hero motion (7) finished and reported, tests passing
  - dragon look and dragon motion were stopped near the end, before their final self-report; their
    commits are merged (the commit messages are the record) and the full suite passes on the merge
  - none of round 2's review / polish passes completed; the hero ones were stopped mid-way and their
    unfinished edits discarded (saved as `scratchpad/look/hero-look-polish-unfinished.patch`)
- **Lead fixes after the merge:** the blade's halo dots and tip streak sit on the drawn point
  (`DIM.drawnTip ?? DIM.steelTip` in `player/fx.js`); the dead generic `artCell()` pass function,
  its `uArtCount` uniform and the unused `createArtAtlas` import are gone from `pipeline.js`.

**Done — the wyrm:**
- **Letters (ADR-018):** a thin one-pixel 4x6 font in 5x8 cells (`wyrmGlyphs.js`; 3x5 in 4x6 cells
  under 900 px tall). The v0.4 bold browser font filled its cells and printed a "silver blob".
  Letter sets by brightness tier with a per-cell letter, so letters hold still; stroke pixels take
  their own source pixel; structure codes in alpha (`0.5 + 0.01 × code`) and marching-squares
  silhouette strokes keep spikes, claws and torn edges.
- **Art source** (`wyrm` material option): charcoal shingle scales with bright free edges lit by a
  camera-fixed key light, greyed moonlight, molten cracks along the scale gaps on the undersides only
  (round 2; round 1's voronoi net drew red worms over the back), gold-rimmed orange chest and throat
  scales, crimson mottled sails with holes, torn edges, hot bone streaks and ember specks (`aEdge`,
  new `aBone`). Round 2: hide outlines by letter brightness only (rim strokes printed chevron noise),
  cooler cracks on the legs and tail.
- **Shape:** a 1.3× head (visual only, about the mouth) held low with the jaw open in a snarl, eagle
  feet with hooked talons, legs ~15 % thicker, a heavier tail, spiky crest / frills / saw tail,
  longer distal finger bones and fuller sails.
- **Motion:** flip-free joints and IK, feet planted through turns, the tail sweep's spin, the roar
  and the walk (turning in place 1.41 → 0.01 m of foot slide; roar / intro 0.7–2.6 → 0–0.33 m), the
  stomp's paws on the impact frame, the
  painting's resting display (HALF sails fitted to read broad from every game-camera yaw, an S-neck
  with the head low, a stalking stance, the arched tail, idle life). Round 2 (ADR-025): the shown
  neck spreads a strike down its length with the head pinned to the measured solve, the bite eases
  into its strike over the last windup frames (`headLead`), a head-aim turn limit except where
  spheres ride on the head (`headExact`), a parry recoil on an arc, swinging feet that absorb home
  jumps, a tail that can't fold over, and a death that falls with weight (feet planted, wings
  crumpling onto the ground).

**Done — the hero:**
- **Ink-line art (ADR-019):** part ids in alpha (`HERO_ART`, `HERO_INK`), bright lines on
  silhouettes, depth steps and part edges over dim, dense letters. Round 2 traces the lines per
  pixel (ADR-020: no letter-grid staircase), and at the game camera he is a dark figure with a dim
  cool rim, bright armour and a crisp cyan blade, cut out of the grass by a dark halo (ADR-021).
- **Blade (ADR-022):** drawn 1.64 m (`DIM.drawnTip` 1.45; the animator keeps `DIM.steelTip` 1.17)
  with a ridge line and serrations; drawn up to 0.65 m nearer the camera at the game camera, so the
  low guard reads from behind.
- **Model:** coat drapes with folds and a lavender torn zone, wider hems, kite greaves, a bigger
  spiky pauldron, a fuller mop, the face shows, more key light and contrast.
- **Motion:** speed-matched gait and a world-space foot planner, blade blending round the outside
  of the body (ADR-023), the portrait's wide contrapposto idle, light 1 cocking over the right
  shoulder, the slam's gather-and-raise windup, finish holds, the charge's coil with a coat updraft,
  a two-step thrust dash, the roll's intended sliding kneel with dust and sparks, one continuous
  slash crescent, a snappier turn, sprint hair blow-back, quiet guard taps, a shorter stagger jolt, a
  flask swig that reads from behind.

**Decisions:** ADR-018 … ADR-025. The common rule (ADR-024): look and motion polish never moves a
hit-tested frame. Hero attack active frames are bit-identical; the wyrm's attack spheres stay
within a few cm; visual size changes hang off the gameplay joints.

**Verification:**
- Deterministic headless captures on a real GPU (the real-time loop frozen, `Math.random` seeded,
  audio off), compared with the references by pixel statistics (luma shares, ink / bright %,
  white / orange / red mix) and by eye: the reference angles, side, front, back and head views, the
  1080p game camera, a live fight, and per-action strips. The owner got before / after images for
  both rounds.
  - wyrm, reference view: lit-ink colour mix white 43 / orange 23 / red 35 % (painting 41 / 22 / 37)
  - hero, reference view: mean luma 106 (reference 108), 37 % of pixels above 120 (38 %)
  - hero at the game camera, facing away: mean 113 → 80 (the scaled reference is 56)
- Gameplay, per frame in seeded Lab runs: the hero's blade matrix and hit points on 192 hit-tested
  frames, 0 differ; the wyrm's attack spheres within a few cm (round 2: ≤ 4 mm, the rake 2.3 cm);
  first contact unchanged except three swipe placements that now land, and the tail sweep no longer
  lands before its red flash (0 of 24 probes; v0.4: 5). COMBAT.md has the numbers.
- `npm test`: ALL PASSED (glyph check bad=0) on the merged code; `npm run build`: OK (1293 KB).

**Open issues / next:**
- **Process:** no round-2 review pass ran; the round-2 dragon work has no self-report. Review it (or
  have the owner play the PR preview) before merging.
- **Determinism:** captures of the merged code are no longer bit-identical run to run (two runs of
  `scratchpad/look/steps_final.mjs` differ by small pose and timing amounts), so a time or random
  source leaks into the sim. Find it before trusting before / after compares again.
- **FX:** stray `"` glyph particles show left of the hero in a back view; source unknown.
- **Hero:**
  - the coat still reads as separate flat panels with outlines, not one ragged drape with holes
  - proportions are round 1's; the hair is straight clumps; the face has no nose, mouth or shadow
  - at the game camera he is still brighter than the scaled reference (80–97 vs 56: blade glow,
    rim, the armour column), and the capital fill letters can read as text
  - the halo does not darken the wyrm's letters; the reference-angle idle is near frontal
  - strike key poses are limited by the bit-identical rule; light 1's loop is fast (a longer
    windup would be a tuning call); light 2 has no free-arm choreography; the knockdown's blade
    swings wide; the thrust's legs hide under the coat at 36 m
  - the foot-slide metrics were not re-run on the merged wide idle
- **Wyrm:**
  - at the reference angle the sails sit lower than the painting's, and with the hero straight
    ahead the far wing is a sliver behind the neck
  - in melee at 16:9 the head, neck and wings are mostly off the top of the screen (boss camera)
  - some fast motions still jump far per frame (charge thigh, bite neck); close-ups show large
    flat scales; letters change on ~39 % of lit cells per frame at idle
- **Tooling:** the capture and per-frame compare tools (deterministic boot, blade compare, hitbox
  compare) live in the session scratchpad; move them into the repo.
- **Next:** the owner reviews PR #4's preview; on approval, merge and release.

---

## 2026-11-02 — Session 4b: the hero shows his details in game
**Owner:** "everything is perfect but the main character isn't showing the details like it does in
your preview pictures", with a screenshot (~13 rows of dense `MMBM` letters) and the reference again.
"Do we need to make the character a little bigger?"

**Measured:** the hero was ~9 visible rows at the 36 m camera (1038 px tall) and ~5 on a phone (20 m,
390 px, 4x7 cells). The reference is ~90 rows. Tuned by the bonfire, his source was too bright (all
dense letters); in the arena it was 40 % darker.

**Done:**
- **Bigger on screen, gameplay unchanged (ADR-017):** `HERO_SCALE` 1.2 + a camera lean (half the
  camera pitch, feet planted), applied after the animator. `unlean()` for the sweep's hit test and
  the dragon's aim; `leanPoint()` for the name tag; the run cycle slows by `HERO_SCALE`.
- **Hero letter grid:** `createPixelArtAtlas` (3x5 pixel font, 4x6 px cells); the pass tests the
  hero grid first. Browser fonts at 5–6 px filled whole cells (tried: solid blocks).
- **Shading:** `U.uArtHeroKey` 1.15 (fixed key light), `U.uArtHeroEdge` 0.7 (darker toward the
  silhouette, no moonlit outline on the hero), `uArtBlack.x` 0.04, `uArtLum.x` 3, `uArtMin.x` 0.14,
  `uArtDither.x` 1.1, `uArtEdge.x` 0.004 (0.018 never fired at 36 m).
- **Phones:** an upscaled canvas uses `image-rendering: pixelated`.
- Result: ~25 rows at the desktop camera (front, back and running all read as the swordsman), ~15
  on a phone; the Lab close-up keeps the reference look. `npm test` green.

**Released:** owner: "push out all the changes to production including the mobile controls".
PR #3 squash-merged as v0.4.0 (classic ASCII-art creatures, touch controls, phone camera, Lab
toggle, hero detail).

**Open issues / next:**
- Real-phone check of the pixelated upscale (non-integer DPRs such as 2.625 give uneven strokes).
- The lean follows the camera: cut-in cameras get half their pitch.

---

## 2026-11-02 — Session 4: classic ASCII-art creatures
**Owner:** "Make the character and dragon look more ASCII like. Right now it doesn't have the ASCII
art style." They attached two reference images (a dragon and a hooded figure as coloured
image-to-text art) and chose smaller letters over zooming the camera in.

**Done:**
- New `FLAG.ART` class and creature ASCII-art path in the pipeline:
  - a finer grid than the world's (H/135 px cells: 4x7 at 720p, 5x8 at 1080p)
  - 4-sample cell average
  - a density-sorted `ART_CHARS` atlas built at runtime
  - brightness → letter with per-cell jitter, colour = source hue, HDR only for saturated parts
- Creature materials default to `FLAG.ART` with a smooth shaded source (`U.uArtSolid`). Per-material
  `artGain`: wyrm 0.28, hero 0.62.
- Tuned in the Lab model viewer (close-ups) and at the game camera (`uArtLum` 4.5, `uArtMin` 0.3).
  Red tells and the stomp ring read in ASCII.

**Follow-up (same day):** the owner said the dragon looks good but the hero "looks like a bunch of
random text". They also couldn't close the Lab on their phone, and asked for touch controls.
- **Hero:** own pass settings via `FLAG.ART_HERO`:
  - `artGain` 1.1
  - jitter 0.5
  - ramp floor 0.42
  - depth-edge gaps (`uArtEdge` 0.018)
  - `uArtMax` 0.8, so white letters don't bloom

  It now reads like the reference figure.
- **Phone (agent):**
  - touch layer on `core/input.js`
  - an ASCII stick and buttons with auto-aim
  - a phone camera profile (20 m), LOW quality on phones, a compact HUD
  - a rotate overlay
  - the Lab `LAB` / `× LAB` toggle
  - a `touch` test scenario
- **Decisions:** ADR-016.

**Open issues / next:**
- Real-phone check:
  - native multi-touch
  - iOS long-press and scroll blocking
  - audio unlock on the first tap
  - LOW quality look and frame rate
  - whether rim-sprint triggers by accident
- At the desktop game camera the hero is still a small letter cluster.
- Characters re-pick as creatures move (inherent to the style).

---

## 2026-11-01 — Session 3c: match the concept sheets (four-legged drake)
**Owner:** "The character hair and outfit doesn't look like the images. The dragon as well. Try to
get it accurately as close as possible." They chose to rebuild the dragon as four-legged.

**How (ultracode workflows):**
1. **Prep workflow:**
   - a Lab model viewer (side views, dark backdrop)
   - specs measured from the sheets (`docs/art/hero.md`, `docs/art/dragon.md`)
   - baseline art-director review: hero 2.5/10, dragon 2/10
2. **Build workflow:**
   - a material upgrade (`levels`, `glowAxis`/`inkAxis`, voronoi cracks, `seamAxis`)
   - parallel hero and dragon chains: the dragon in two stages (anatomy/gait, then the
     four-legged moveset), each followed by independent critic → fix rounds
   - the owner asked to finish sooner, so the loop was capped at one fix round plus a final review
   - integration verify, then side-by-side review boards
   - two usage-limit interruptions were resumed from the workflow journal with no work lost

**Results:**
- **Dragon: 6/10.** Silhouette 7, proportions 7, game read 6; no P0 left.
- **Hero: 4.5/10.** Glyph rendering 6, poses 6.5. Remaining P0s: the hair mass, and the blade
  hidden from behind at the game camera.
- **Verify fixed:**
  - the tail sweep landing 0.2 s early from straight behind (fairness)
  - membrane per-frame garbage
  - hero glyph zoom at the game camera
- **Verify flagged:**
  - clawCombo hits 2/3 tell→impact is 0.65 s, below the 0.7 s rule (pre-existing)
  - the AI rarely picks swipe/fireball/charge against a stationary hero

**Boards:** `scratchpad/art/final/*.png` (sent to the owner).

**Next:** the owner reviews the boards. A focused hero round (hair, blade read, details) is the
obvious follow-up.

---

## 2026-11-01 — Session 3b: copy the concept sheets; carved stones
**Owner feedback:** "much better". They then shared concept art (Shadow Swordsman sheet,
movement and combat key poses, Obsidian Drake sheet) and asked to make the hero and dragon look
like it. They also want better ground stones.

**Their choices:**
- restyle the wyvern (don't rebuild it as four-legged)
- make it 1.5× bigger
- the heavy slam becomes the 3rd hit of the combo
- carved crisp glyphs for stones

**Done:** three parallel agents (hero, dragon, stones) did the work, then I integrated it.
- **Hero:**
  - new model, a 1.34 m sword with a violet gem and cyan edges, and poses from the sheets
  - slam finisher and lunge thrust
  - cyan arc trails, thrust streak and crystal shards
  - reach band + step-in assist (REACH test)
- **Wyrm:**
  - obsidian / silver chevrons, lava belly, throat and inner legs, red ragged wings
  - horns, frill and spikes (merged per joint, 109 meshes)
  - upright S-neck
  - `SCALE` 1.875, with an audit of bound, bite floor, swipe reach, FX and test distances
- **Stones:** `createCarvedGlyphMaterial` (world lattice perpendicular to the camera view). Flagstones
  are irregular half-sunk slabs with grass up to their edges. Fixed the fallen stones' colliders.
- **Me:** capped the agent's boss framing zoom from +16 m to +5 m. At ~50 m the hero was lost
  again; it now sits at 39–41 m and the wyrm crops at the edges.

**Decisions:** ADR-012 (concept sheets + carved stones), ADR-013 (reach band, hero-first camera).

**Open issues / next**
- **Lava underside:** mostly visible when the wyrm faces the camera or rears. A normal-driven
  underside glow mask in the material would put it on a single mesh.
- **Cracks:** a regular grid; an irregular (Voronoi) crack pattern would read more like fissures.
- **Hero coat:** tail strips move as panels, not individually. The dodge is a forward roll, not the
  sheet's sideways dive.
- **Carved marks:** some digits (`1`, `7`) can read as text on the stones; consider symbol-only ramps.

---

## 2026-11-01 — Session 3: look pass from the v0.2 review
**Owner feedback on v0.2 (live):**
- The grass is TOO ascii: noisy, distracting, and the ground seems to move, which makes the game dizzy.
- The main character is barely visible, and the hero and dragon are blurry.
- No PARRY / DODGE text notices: dodge-only attacks should be a red warning flash from the boss,
  and parryable attacks should be read from animation.

They want previews to approve. Their answers to my questions: v0.1 grass but calmer; crisp surface
glyphs for the creatures; a brighter outline to find the hero; red flash + white glint tells.

**Done**
- Grass: restored v0.1 `world/grass.js` / `ground.js` / world wiring / quality presets; tips ~20 %
  darker; wind amplitude 0.07 → 0.04 and slower. Removed the grass path from the ASCII pass.
- Creatures: `createSurfaceGlyphMaterial` is surface-glyph by default again. It uses `SURFACE_SETS`
  defaults per `ascii` set, `glyphZoom` 0.72, sharpened coverage, darker gaps and an `outline` term
  (pow 6 falloff; a wide falloff shaded the coat flare like plastic).
  - Wyrm: cells = v0.1 × 1.3, `lumScale` 3.3–3.5, lit gaps, no outline.
  - Hero: cells 0.045–0.12 m, coat ink brighter, outline 0.8–1.7.

  Tuned live against v0.1 (scratch worktree at `v0.1.0`) and v0.2 (production).
- Tells (sub-agent): text/icon marks and log tips removed. The wyrm drives `uWarn`: red glow through
  a red attack's windup and a hard red flash at the timing cue. Parryable attacks get a white glint
  (bigger for blue). See ADR-010 and COMBAT.md.
- Lab: Showroom + Camera default buttons.

**Decisions:** ADR-010 (tells on the attacker), ADR-011 (hybrid rendering).

**Open issues / next**
- Owner approval of the previews; then merge and release v0.3.0.
- The hero is still small at the default zoom (the owner chose outline only, not a closer camera).
- Not yet done: wind-up animations exaggerated for parry reads, if the glint alone isn't enough.

---

## 2026-11-01 — Session 2: combat & presentation pass (v0.2.0)
**Goal:** the owner's v0.2 feedback (see Session 1) plus a long-term repo/deploy setup.

**Done**
- GitHub repo `eshin087/gcdAbyss` (public) + Vercel project `gcdabyss` (Git integration, `main` =
  production, PR previews, 30-day retention). `main` is protected: PR + green `test-and-build`
  required, even for admins (ADR-006).
- Rendering: one screen-space ASCII grid for everything (ADR-007) — procedural grass meadow, stone
  outlines, creature glyph sets with flow angles.
- A parallel agent workflow (builders → reviewers → integration) built the dragon (tells, posture,
  ×1.25 size, roar ring), the black-coat hero (block / parry / Ghostep / charged heavy), HUD / audio
  / flow tell presentation and the Lab. Reviewers fixed ~30 issues (flash timing vs moving players,
  AI picking attacks that can't land, Ghostep slow-mo turning into a freeze, Lab keys leaking into
  the game, ...). Integration rewrote the tests: 195 asserts, AI seeds 1–40 all green.
- Browser playtest (Lab): blue PARRY and red DODGE marks read clearly; perfect dodges at 0.2 /
  0.15 / 0.1 s before impact all Ghostep; posture break + phase-2 roar work; no console errors.
  Tuned creature cells: dark backing (`uCreatureBg` 0.04) and `uCreatureLum` 4.2 → 3.0 so the dragon
  reads as glyphs instead of white tiles; ink-independent moon rim for the black coat; grass gain
  2.3 → 1.9 so creatures pop.
- `main.js` calls `lab.postUpdate()` after the actors so the hitbox overlay isn't a frame late.

**Decisions:** ADR-007 (single ASCII grid), ADR-008 (tell-driven combat, no stamina), ADR-009
(phase gate).

**Open issues / next**
- Human playtest of balance: the god-mode bot kills the wyrm in ~20 s of combat (crits stack).
- From straight ahead only the overhead combo hit reaches the bigger wyrm's chest.
- The hero is small at default zoom; consider a stronger rim / ground ring.
- Breath can't hit a hero standing under the head (< ~7 m); the AI never picks it there.
- Not yet heard in a browser: tell audio levels, charge hum, Ghostep low-pass.

---

## 2026-11-01 — Session 1: from reference study to playable slice (v0.1.0)
**Goal:** a first demo of the ASCII look (camera, art style) with a dragon in a forest.

**Done**
- Set the look: steep top-down perspective camera, three glyph
  techniques (arranged strokes, screen-grid ASCII, glyph FX), night palette, fire light spill.
  Findings in `docs/STYLE.md`.
- Built the rendering foundation + world; checked via screenshots.
- Parallel agent workflow built the dragon, player, HUD/flow and audio modules against
  `docs/ARCHITECTURE.md`, each independently reviewed, then an integration check (35 events wired,
  headless sims for win / death / retry / pause / breath).
- Playtest fixes: opening breath killed a standing player in ~2 s (tick 9→5, range 13→11.5,
  opening cooldowns); sword hitbox more forgiving (blade radius 0.05→0.22); phase-2 molten glow
  reduced to thin seams; shadow lookups use `textureLod`.

**Feedback from the owner (drives v0.2)**
- Loves the overall look; trees are the reference for "perfect ASCII feel".
- Wants: anime (SAO-like) characters; more detailed stone ASCII; creatures less "solid" / more
  ASCII; grass more ASCII; bigger dragon; much easier fight, no stamina (RPG/MMO not pure souls);
  block + parry + perfect dodge with Phantom-Blade-Zero-style tells; a Lab/debug mode;
  long-term repo + docs structure.

**Next:** v0.2 combat & presentation pass (see ROADMAP M1).
