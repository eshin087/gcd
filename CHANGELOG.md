# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [SemVer](https://semver.org/) (0.x = pre-alpha, anything may change).

## [Unreleased]
Thirty-three pieces of work since 0.4.0:
- **You can see yourself behind the dragon** (2026-11-15, ADR-106). *Fixed:* the hero vanished
  whenever the Cinder Wyrm stood between him and the camera: north of its body, under a wing,
  behind it while it rears, under it while it flies low. *Added:* the parts of him that are
  covered now print through whatever covers them as a cyan ghost of his own line art (the colour
  of his blade), so you can follow where he is and what he is doing. It shows only where he is
  covered and only while he is; in the open he looks as before. It works through trees, pillars,
  standing stones and landmarks too. Duels are unchanged: a human boss in front of you is not
  drawn over. `?noseen` in the address turns it off (for comparing).
- **The riskier the answer, the more it pays** (2026-11-15, ADR-102): measured with bots, a player
  who only perfect-dodged beat every boss fastest and never had to learn a string. *Changed:* the
  flurry (and the plunge) now answer a perfect dodge of a **red** blow only. A perfect dodge of a
  white or heavy blow still dodges, counts in your streak and slows time where you stand, but his
  string goes on: build the streak on white blows, cash it on a red one or with a parried last
  blow. *Added:* the **flash counter**: attack at the last instant before a duelist's blow lands
  and your cut goes through his and through him (70 damage, he reels, the crit window opens); a
  moment too late and his blow lands. *Added:* a **perfect parry** now deals half again the
  posture and makes your next light cut twice as fast and a crit. *Fixed:* a blow of a boss's own
  flurry that fell short of you settled nothing, so blocking all of it did not always break him.
- **The flurry reads against the human bosses, and every blink leaves an ASCII afterimage**
  (2026-11-15, ADR-101). *Changed:* against Shen Hui and the Starless Lord each flash cut now shows
  the hero wound up for a moment, runs past the boss's side instead of through him, and slows into a
  finish you can see; the hanging cuts and flares are sized to a man; the camera no longer lurches.
  *Fixed:* the boss was thrown 0.3 m by every cut (he seemed to jump about), kept his own attack's
  pose while he was cut, and after the last blow stumbled back into the hero. *Added:* every blink
  (the Ghostep, the plunge, each cut of a flurry) leaves the hero behind as he stood, printed in
  rows of cold blue digits that fall apart from the feet up, while some of them fly to where he
  reappears.
- **The boss's bar at the top; QUIT TO TITLE** (2026-11-15): the boss's name, HP and posture moved
  from the bottom of the screen to the top centre. The pause menu has **QUIT TO TITLE** (press it
  twice: the first press asks), and RESUME is laid out like the other items.
- **Background objects drawn like the dragon, and landmarks** (2026-11-15, ADR-100): pillars, walls,
  standing stones, boulders, lanterns, the throne and its dais, bones, braziers, the bonfire and the
  fallen bell are now made of the wyrm's small digits: a dark body, brighter digits where light
  catches, an outline of stroke characters, no blank spots. *Fixed:* wall and pillar faces turned
  sideways printed solid bars instead of characters. *Added:* big set pieces in each level: the
  skeleton of an elder wyrm along Cinderwood's north rim and a great burned tree on its west; two
  colossal stone swordsmen, the sect's gate and an incense cauldron round the Ashfall Courtyard; two
  hooded wardens beside the Obsidian Throne and six great swords in its aisles. Floors, the hero,
  the human bosses and the trees look as before.
- **Training mode and a lab stage** (2026-11-15, ADR-099): press **F4** (or open the Lab and click
  TRAINING, or load with `?training`) for a fighting-game training menu: every situation worth
  seeing, by category, one click each: perfect dodges at every streak, each art, parries and
  ripostes, the blade lock, the trade clash, the mikiri, a boss's own flurry parried, blocked or
  let through, the chain, the cleave, the execution, getting hit, his phases, and every move he has
  answered the way you choose. The game plays your side for you, on the real timing windows, and
  says whether the situation showed what it should. Speed, loop and replay. Add `?stage=lab` (or
  the STAGE buttons) to fight any boss in a **training room**: a dark dojo with a cyan measuring
  grid and rings marked at 3, 6, 9 and 12 m. *Changed:* the Ash Disciple's streak flurry is called Scattering Ash.
- **An ASCII HUD** (2026-11-14, ADR-098): the overlay is now made of characters like the rest of
  the game.
  - **Meters are text.** HP, guard, the crit window, the boss's HP and its posture are rows of
    characters (`HP [################........] 104 / 160`), drawn straight on the game with no
    panel behind them. The piece you just lost shows pale for a moment before it drains.
  - **Big words are block letters.** YOU DIED, the victory line, area names and phase calls are
    built from characters in the style of the ABYSS title logo, and stack word by word on a narrow
    screen. The serif font is gone from the HUD.
  - *Removed:* the name / "Lv 12" / class lines of the player frame (they were decoration).
  - **The minimap barely exists:** a small faint disc (72 px on desktop, 40 px on phones) with no
    frame, title or coordinates.
- **Phone controls you can hold, and a guard meter** (2026-11-14, ADR-095, ADR-096):
  - **The right thumb's pad.** ATTACK, BLOCK and DODGE are now three large tiles that touch each
    other, moved up and in from the corner. Slide your thumb from one onto another without lifting:
    the first lets go and the second presses. A touch that lands a little off still counts for the
    nearest tile. In the pause menu, PAD POSITION (low / mid / high) and PAD SIZE (small / medium /
    large) move and size the cluster while you watch it; the choice is remembered. FLASK sits above
    DODGE, LOCK moved up beside pause.
  - **The guard meter.** A steel bar under your HP (and a gauge on the BLOCK tile). *Changed:* a
    blocked blow now costs guard instead of HP (it used to let 20 % or 50 % of the damage through).
    If the meter runs out on a blocked blow, that blow is still blocked but your guard is knocked
    open for half a second (GUARD DOWN). It refills by itself in under two seconds whatever you are
    doing, every parry gives a large piece back at once, and every hit you land gives a little.
    Fire breath and bullets met on the guard chip HP as before and do not touch the meter.
  - **The lock-on marker** is a small, dim diamond that shows when you lock on and fades away
    within three seconds.
  - **Play upright** (ADR-097). Holding the phone in portrait no longer asks you to rotate it: the
    game plays on with the stick lower left, the pad lower right, your frame and the boss bar on
    top, and a wider view so the fight still fits the narrow screen.
  - **Controls that stay out of the way.** The stick and the buttons lost their dark panels: faint
    outlines and glyphs with the fight showing through them, lighting up only under your thumb.
  - **A minimap the size of a coin** on phones: a small see-through disc in the corner, without its
    frame, title and coordinates.
- **Weight on the flurry; one streak; the riposte; bosses with a streak of their own** (2026-11-15,
  ADR-094): the teleport cuts now **land**: you freeze on each contact, the boss reels under every
  cut before time holds him again, the ground cracks under him, and the last blow hits with speed
  lines across the screen, a dark blink and a flash, and staggers a duelist. **Parries, deflects
  and clashes count in the same streak** as perfect dodges, and parrying the **last blow** of a
  string is answered with a **riposte**: as many flash cuts as your streak counts, after which you
  are back where you parried. **Duelists keep a streak too**: every strike of yours their guard
  turns adds a pip to their bar, and from three they may answer with a flurry of that many blows
  (Scattering Ash, Starless Storm), each from another side of you. Your guard meets them from any
  side: **parry or block every blow and their posture breaks**.
- **The Cinder Wyrm in large, readable letters** (2026-11-14, ADR-092): the wyrm is printed in bold
  symbols four times the area of the old thin digits (8x13 px at 720p, the owner's pick of three
  sizes), about 25 characters across its body: you can read every one. Its letter grid now travels
  with it, so the body no longer slides under a fixed grid when the camera moves. *Changed:* the fine
  scale outlines of the thin-digit look are gone at the game camera.
- **The Cinder Wyrm in finer, steadier letters** (2026-11-14 – 15, ADR-092, ADR-093): the wyrm's
  digits are one size up at 720p (5x8 px cells, the owner's pick of three sizes) with the calm
  charcoal tone that shows every scale, and they now travel with it: the body no longer slides under
  a fixed grid of letters when the camera moves. (For a day it was printed in large bright symbols;
  that read as "way too flashy" and is gone.)
- **The free hand in sword fingers; weight and footwork; a cut that lands; outfits to pick from**
  (2026-11-14, ADR-086 – ADR-090): the hero's free hand has a wrist now and forms **sword fingers**
  (two fingers out, the others folded under the thumb). It gathers at the sword wrist and is thrown
  opposite each cut instead of hanging stiff off the forearm, and it no longer pops off the grip or
  locks the elbow straight on two-handed blows. The body carries the cuts: a light's step pushes off
  and brakes on the planted foot, the hips lead the cut, the thrusts and falling cuts sink into
  deeper stances, and on a landed hit the edge **bites** (the blade holds where it struck through the
  freeze, then tears on through). Planted feet pivot instead of skating, and the whirl hops round its
  turn. A landed cut is drawn where the blade meets the body, with a slash line along the cut, sparks
  thrown the way the blade travels, a flare and a glint on the steel, the camera kicked along the cut
  and a new cut sound; the struck duelist shudders through the freeze. The white star that hid both
  fighters on a hit is gone.
  His arms open now: a cut and a thrust reach out with the elbow nearly straight instead of every
  swing being made with the same crooked arm; on the run the elbows stay in beside the ribs, the free
  arm swings from the elbow, and the arms keep swinging when he strafes. The guard breathes and
  rides his steps instead of standing rigid, and a swing's arms come home softly instead of
  stopping dead. The charged blade stands out
  to his right, clear of his hood (it crossed his face). The sword hand's fist is a closed hand with
  finger grooves (up close it was a stack of discs), on the bosses too.
  Kept for later use (today's look and sword are the default): three outfits, `?heroLook=robe`,
  `swallow` or `warden` (`-shade` puts the face in shadow), and three swords, `?sword=sheet`,
  `ribbon` or `crescent`; both are rows in the Lab.
  *Fixed:* rebuilding the hero's gear wiped a boss's own part colours (the Starless Lord's red line).
- **The streak and the flurry** (2026-11-14, ADR-091): perfect dodges in a row are a **streak**
  (pips under your HP bar, "GHOSTEP ×N" over your head), and it lasts until a blow hurts you. Every
  perfect dodge is answered with as many blows as the streak counts, seven at most: **flash cuts**
  first (you vanish, cross the boss along a new line every time and are gone again, each cut
  leaving a line of light hanging on him) and then one of six **arts**, on which every hanging cut
  bursts at once. Against the wyrm: Skyfall (the plunge, as it was), Severing Line (one level cut
  across the head whose hit lands a beat later) and Heaven Splitter (a falling cleave through the
  head to the ground). Against a duelist: Passing Cut, Falling Leaf and Rising Moon (a rising cut
  and a somersault over him); all three leave you at his back. The art changes every time. While
  you cut, the world stands nearly still and you move in real time. Each cut rings a tone higher
  than the last, a counter runs over the boss, and a banner names the flurry (TWIN FLASH …
  SEVENFOLD FLASH) with its damage. A flash cut deals 28, the last blow 90 on the wyrm and 60 on a
  duelist. *Changed:* a perfect dodge of a duelist now deals damage by itself; the first perfect
  dodge against the wyrm is the plunge one time in three. Lab: PLAYER → flurry x1 … x7 and an art
  picker.
- **The Starless Lord in black plate, and how he moves** (2026-11-14, ADR-084, ADR-085): he wears a
  harness of his own now: a deep hood over a faceplate with a slit of red light (the owner's pick of
  three heads), a cuirass with a ring of red light on the breastbone, a plate yoke and pauldrons,
  plate arms and legs, hip plates over a war-skirt and a cape to his ankles, and he stands a head
  taller. Each form has a new guard. He no longer runs: out
  of reach he glides over the floor with his cape streaming. His strings walk forward on alternating
  feet, his spins leave the floor, he cartwheels over your guard and backflips away throwing red
  crescents, and each form ends its strings with a flourish (your opening). Six new moves, among them
  three spells: the **Crushing Dark** (red: talons of the Void close on you; caught, you are thrown
  down and crushed), **The Rift** (fissures of red light race along the floor: parry yours or step
  between them) and the **Dark Star** (it follows you over a violet ring, then bursts). Lightning, the
  push, the pull, the thrown stones, the storm, the blink and the ignitions are redrawn.
  *Fixed:* he sat on the throne only in name (he stood on its seat in his guard until woken), and
  Shen Hui stood where he should kneel: both wait in their own pose now.
- **Hit reactions and the death, made natural** (2026-11-14, ADR-083): a blow from behind now
  knocks him forward onto his hands (he used to spin round in one frame to fall on his back) and a
  flinch folds him the way the blow drives him. He no longer falls like a board: the knees buckle,
  the arms fling, he lies with a knee up. Killed while knocked down he dies where he lies (he used
  to stand up first to kneel and fall again). The death's collapse no longer sinks his knees into
  the ground, and the corpse lies sprawled with its cloak flat instead of a sheet standing in the
  air. Getting hit in the middle of a swing no longer teleports the blade. Timings and i-frames
  are unchanged.
- **Steel on steel** (2026-11-14, ADR-079 – ADR-082; both duelists):
  - **Parries where the blades meet.** A parried blow is now shown stopped on your guard, your blade
    snapped to the side and height it came from, the two edges crossed, and it is that picture the
    freeze holds while the sparks keep flying: thin streaks thrown the way the blade was going, a
    cross of light on the edges, falling embers. The white glare that used to cover both fighters is
    gone. The freeze is short inside a string (a seven-cut exchange keeps its rhythm) and long only
    on the blow that ends it; the camera punches in on every clash; a deflected blade rebounds.
  - **A guard you can read.** The boss raises his blade across his body as you swing at him. A
    strike he holds: dull steel sparks, a dry clack, GUARDED, and your chain goes on (it wears his
    posture). A strike he beats away: an orange burst, a harsh clang, DEFLECTED in red, your blade
    thrown back, and his Riposte is coming. He also breaks off the late half of his recoveries to
    guard, and sometimes steps out of a charged cleave or the finisher.
  - **Cancel anything.** A guard press or a dodge now ends your swing at any point: its windup, the
    cut itself, the recovery. Bounced off a deflect, guard or roll at once.
  - **Blade lock.** The two step in, the blades cross between you, sparks grind at the crossing and
    every press shoves him back a little.
  - **A closer camera in a duel:** within a duelist's reach it eases 6 m closer.
  - **Trade clash** (ADR-082). Swing as he swings and the two cuts meet: CLASH, neither of you is
    hurt, both blades are thrown back. His string goes on, so guard or dodge the blow that follows
    (two in a row cannot be traded). A fully charged cleave is not thrown back: it beats his blow
    aside and lands.
  - Added: `combat/clashFx.js`, `enemies/duelist/guard.js`, `game.fxDt`, `game.punch` /
    `cameraRig.punch`, `player:bounced`, `dragon:guard {deflect}`, the sounds `guard` and
    `deflected`, the DEFLECTED call-out, the test scenario CLASH (`duel.mjs`); for the trade clash
    `RESULT.CLASHED`, `combat:clash`, the sound `trade`, the CLASH call-out, the scenario TRADE.
- **A faster chain, a new finisher, swings that flow home** (2026-11-14, ADR-075, ADR-076): the
  attack chain is quicker: a hit every ~0.32 s when you mash (it was 0.42 s), each cut over in 0.12
  s. The light hits deal 30 / 32 / 36 / 30 again (the ×1.4 that paid for the slow chain is gone),
  so the damage per second is about what it was. The **finisher** is new: he gathers at the hip,
  leaps as the blade sweeps up his right side, and brings it down two-handed in one diagonal into
  the ground, landing folded over the planted blade; mashing no longer cuts that landing off, and
  the blow deals 66 (was 58). After every cut the blade now carries on round and eases home (it
  used to stop dead for a moment and then snap back as fast as it had cut). The whirl drops into
  its turn and his head stays on the target through it. For tuning: the Lab (`?lab`, the LAB
  button) has an **atk** slider that runs the hero's swings at ×0.6 to ×1.6 of this pace.
  The **4th hit** (the poke) now drives upward: level, it looked from the game camera as if he
  planted the sword in the ground at his feet. The **sword trail** is finer (ADR-077): one thin
  unbroken line just past the blade's point, white-hot and cooling to indigo as it tapers away,
  with a faint veil inside it, instead of a wide band a metre past the steel.
  **Anatomy** (ADR-078): the charge is now a guard he can actually hold, the grip out in front of
  the right shoulder with the sword elbow lifted and the wrist square to the blade (the hands were
  jammed against the shoulder, the forearm in one line with the sword). The body now has joint
  limits everywhere: elbows and knees never fold flat, the sword never bends back along the
  forearm, a hand never passes through the chest.
- **Wuxia-flow swings, a dashing cleave, a deeper guard, a narrower cloak, a new sword arc**
  (2026-11-13, ADR-071 – ADR-074): the hero's attack chain is new. Every swing is now a one-handed cut driven by the whole
  body: the hips turn through it, the sword arm opens to full reach as the blade crosses his front,
  and he walks through the chain, the lead foot changing with every hit. Each hit has two or three
  looks (falling, flat and rising cuts; rising, flat and falling backhands; a whirl, a rising
  whirl and a crouching low sweep; a long lunge and a rising thrust), picked at random, and two
  hits in a row are never in the same plane. The chain is slower and each hit heavier: a hit every
  ~0.42 s instead of 0.25 s, each light dealing ×1.4, so you can see the swings; the crit window
  after a perfect dodge is 2.2 s (was 1.6). The **charged attack** is no longer a poke: he holds
  the sword upright beside his head in both hands, bursts forward and carves one big diagonal
  through the target as the dash arrives, with a longer freeze on the hit, a wide crescent that
  hangs in the air and a low finish he holds; same damage and reach as before. The **guard** is a
  deeper, side-on stance with the hands before the chest and the blade slanted across his whole
  body, so it reads from behind as well as from the front. The **cloak** is a narrow cape down the
  middle of his back: his arms, waist and legs show beside it. The **sword** is 12 % shorter.
  Every cut is a **diagonal** now (none straight up and down: the finisher comes down from over
  the right shoulder) and the blade whips through after the hand. The **sword arc** is one bright
  line along the point's path with a faint veil of streaks inside it, instead of a glowing band;
  it tapers with the cut and hangs in the air for a moment.
- **The Starless Lord, a third level** (2026-11-13, ADR-068 – ADR-070; `?level=starless`, or pick
  The Obsidian Throne on the title screen): a black hall lit red, and on its throne a dark lord from
  the stars with a blade of red light. He fights in four forms, each with its own health bar: one
  blade, twin blades, the two joined into a long staff, and a cross-hilted blade wreathed in the
  Void. Empty a bar (or break his posture) and he drops to one knee: strike then for the DEATHBLOW
  that ends the form. He is faster than Shen Hui and gets faster with each form, somersaults and
  leaps into his cuts, and works the Void in between: lightning you can deflect (a perfect parry
  sends it back at him), a wall of force to cut or roll through, a pull that drags you onto his
  blade, a thrown blade that comes back, stones torn out of the floor, lightning called down on
  marked ground, and in the last form he vanishes and is behind you.
- **Controller support** (2026-11-13, ADR-066): play with a gamepad (Xbox, PlayStation or any
  "standard" pad in the browser). Left stick moves (analog), right stick aims (let go and attacks
  aim at the boss), RB / RT attack (hold to charge), LB / LT block (tap to parry), A dodges, B or
  L3 sprints, X drinks a flask, Y rests at the bonfire / fights again, R3 locks on, Menu pauses,
  View shows the controls, the D-pad zooms. Any button starts from the title (the D-pad picks a
  stage); the pause menu is walked with the D-pad and A, B resumes. The on-screen hints switch to
  pad buttons (PlayStation symbols on a PlayStation pad) while the pad is in use and back on the
  first key or click. Rumble on hits, guards, parries and perfect dodges. Unplugging the pad
  mid-fight pauses the game.
- **Remappable controls** (2026-11-13, ADR-067): pause → CONTROLS. Rebind any action on the keyboard
  and mouse (move, attack, block, dodge, sprint, flask, lock-on, rest, help, mute) and on the
  controller (attack, block, dodge, sprint, flask, lock-on, rest, help, zoom): pick an action, press
  the new key, mouse button or pad button. A key already in use swaps over. Works from the keyboard
  and mouse or entirely from the pad, with a reset per tab, and is remembered in this browser.
  Every key shown on screen (prompts, hints, the title, the controls lists) follows your bindings.
  Esc / the pad's Menu always pause and cannot be remapped.
- **The hero at Shen Hui's size, a trimmed cloak** (2026-11-12, ADR-064, ADR-065): the hero is drawn
  10 % smaller, so in a fight he reads about the same size as Shen Hui (he was the nearer of the two
  to the camera and looked a size bigger); his reach and hitboxes are unchanged. His cloak is the
  same cloak trimmed about 30 % narrower and 15 % shorter, and the coat tails under it are a little
  shorter, so his back, arms and legs show from behind.
- **The Ash Disciple, a second level** (2026-11-12, ADR-058 – ADR-063): a new boss and a new place,
  loaded on their own with `?level=ash` or from the stage picker on the title screen (and the Lab's
  LEVEL row). The Ashfall Courtyard: a ruined sword sect under falling ash, a bonfire at the foot of a
  path, broken steps and a gate, a paved courtyard ringed by broken pillars. In it kneels the Ash
  Disciple, Shen Hui, a grey-robed swordsman in a small straw hat with a long slender jian held in
  the classic jian guard, the sword-finger raised over his head. He fights at Phantom Blade Zero
  boss speed, whips his whole body into every cut, steps in so his blows always reach, sprints down a
  hero who runs, punishes a flask, and often flows from one move straight into the next,
  with moves of his own (thrusts, flicks, spins, overhead chops, a feint that never glints, a low
  sweep, a gliding cut, sword qi thrown along the ground, a seven-cut Rain of Ashes, and in his second
  phase a flurry of thrusts, a ten-cut Hundred Petals, a burning whirl and a great leap). He guards and
  turns aside strikes into his front and counters after a few, and a broken guard ends in an
  execution. **Sekiro / Phantom Blade Zero moments:** parry every cut of a long string and he reels
  (PERFECT DEFLECT); parry an overhead blow perfectly and the blades lock: mash attack to win
  (BREAKTHROUGH) or be shoved back; roll into his perilous red thrust to step on his blade (MIKIRI);
  each plays in slow motion with the camera pulled in. The game's direction is now a wuxia skill
  boss rush with fixed rewards; his reward comes next.
  - Added: `src/levels/` (level registry), `world/courtyard.js`, `entities/enemies/ashDisciple/`,
    `ui/bossName.js`, `tests/integration/duel.mjs` (in `npm test`), `docs/specs/ash-disciple.md`;
    the `dragon:guard` event and a GUARDED call-out; the execution thrust against a broken duelist;
    the blade lock (`player.startBladeLock`, `player:lock`), the mikiri (`player:mikiri`), the full
    deflect (`dragon:deflected`), `flow.cinematic` + `cameraRig.cine` (`game:cinematic`, a gong).
    Impact: a parry freezes the frame and throws a shockwave ring, a white flash and a heavier clang (a
    perfect one adds a short slow motion); a blow that lands on either fighter freezes it too, and his
    body jolts back from yours; his blade leaves a sweep trail.
  - Changed: `HeroAnimator` takes an optional per-instance pose table; flow banners and lore, the
    minimap zone, the combat log and the name tag come from the level and the boss's name; audio
    gives a duelist no creature voice; grass can be thinned and greyed by a level, the atmosphere can
    fall ash; the hero's parry flash sits in front of his guard (it sat at the blade's pre-parry point,
    often by the hip, and its light blew the floor out).
- **Attack variants, hair that reads, a fuller cloak** (2026-11-12, ADR-055 to ADR-057): every hit
  of the left-click chain has two or three different looks (a draw cut, a leaping cut, a level or
  falling backhand, a rising whirl, a skipping cross-cut, a low rising stab, a leaping slam), picked
  at random so the combo doesn't repeat, and every swing turns the hips first and shifts the weight
  through the cut. Same damage and timing. The hood now hides his face in shadow with gold strands
  falling out of it, and the cloak stands off his back so he has depth from the side.
- **Breath-born bullets, perfect-parry returns, Armageddon, heat-glow warnings** (2026-11-11,
  ADR-050, ADR-051, ADR-052, ADR-053): every bullet now leaves the wyrm's jaws along the way its
  head points (a sweeping stream of embers, coughed cones, a breath that scours the ground in
  tongues of fire), and the patterns are much harder. A perfectly timed parry sends an ember or a
  wisp back as a shot that hurts the dragon. A new set-piece, Armageddon, replaces the Meteor rain:
  the wyrm rears up and fires a salvo into the sky, which answers with waves of meteors over the
  whole clearing and one great meteor at the end. Ground warnings are now the ground heating up
  instead of red rings with `!` marks.
- **Two hands, a raised guard, idle life, gold hair** (2026-11-12, ADR-046 to ADR-049): the hero
  swings with both hands, blocks with the sword raised across his body, and when you stop for a few
  seconds he looks around, stretches, inspects or twirls his sword, rests it on his shoulder or leans
  on it. His hood is rounder and pushed back, with gold hair showing and a warmer face. Charging no
  longer drives the sword through the cloak, and the cloak hangs as it did before.
- **A hooded cloak, arms that bend, fewer draw calls** (2026-11-11, ADR-043, ADR-044, ADR-045): the hero
  wears a pointed hood and a huge tattered cloak, like the reference image; the old coat-and-pauldron
  outfit is still there as a loadout. His sword arm no longer swings as one straight stick: the
  elbow stays bent, the arm cocks back before a cut and opens through it, and the blade trails the
  hand and whips through. The hero and the wyrm are each drawn in a few batches instead of hundreds of
  small parts: about 56 draw calls a frame in the fight on the phone preset instead of about 509.
  That is aimed at the slowdown on phones and has not been measured on one yet; add `?nobatch` to
  the URL to compare.
- **Hands, a longer combo and equipment slots** (2026-11-11, ADR-041, ADR-042): the hero has real
  hands (a gauntlet fist closed round the grip, a left hand with fingers), holds the sword low at his
  side like the reference image, and is slim in profile. Left-click now chains five different hits
  (falling cut, rising backhand, whirl, stab, slam), with a sprint slash and a roll cut. His outfit
  and weapon are items in eight equipment slots that can be swapped while the game runs.
- **The hero filled out** (2026-11-09, ADR-040): he was "a bit too lanky". Broader chest and
  shoulders, thicker arms and legs, a slightly bigger head and hands. He stands in a shoulder-width
  stance with the sword held out to his right side, where it shows from the game camera, instead of
  pointing ahead behind his own body.
- **Bullet hell and the moonlit sword** (2026-11-09): the wyrm throws spirals, fans and homing swarms
  of small fire bullets that you deflect back at it one by one (or block, roll through, or cut out
  of the air), plus red orbs and a turning wheel of fire walls that you must dodge. Two more combos,
  less waiting between attacks, each hit a little lighter. The hero's sword is shorter (1.25 m),
  glows blue-white, and no longer runs through the front of his coat.
- **Blender-built hero parts** (2026-11-09, partial): the hero's hair, collar, lapels, sword blade,
  cape and pauldron are sculpted by a headless Blender script and shipped as packed geometry. He has
  a rounder hair mop, a winged collar, one wide torn cape off the armoured shoulder and a narrower
  jagged blade. Closer to the single-figure reference, still not a match (face, coat, armour detail).
- **Single-figure reference, round 2** (2026-11-09, partial): the hero stands in the single-figure
  image's stance with the sword in a low diagonal across his front, is drawn as a fine dot matrix
  instead of small letters, and wears a fuller pleated coat and a four-ribbon torn cape. It is closer
  to the reference but not yet a match (coat, cape, hair, face, legs and sword are still to do).
- **The lean reference match** (2026-11-09): the hero matches the owner's six-view ASCII turnaround
  and single-figure image, from the back and rear three-quarter views as much as the front: a lean
  swordsman with spiky pointed hair, a flared collar, a shaped back, a spiked shoulder stack, two
  coat tails split by a vent instead of a skirt, and the sword hanging at his right side. The Lab's
  model viewer gained every reference angle at once, a turntable and a solid (no-ASCII) render.
- **The epic wyrm fight** (2026-11-09): a longer, harder battle in three phases, with combos you
  parry blow by blow, fire spells, short flights, and a perfect dodge that drives the hero's blade
  into the wyrm's head. The hero is broad-shouldered, and his sword no longer shows through his body.
- **The reference match** (2026-11-08, PR #4): the wyrm and the hero look like the owner's two
  reference images (a red-black ASCII dragon and the "Shadow Swordsman" line art) and move better.
  That work left gameplay as it was (attack timings, hitboxes, damage and parry windows).

### Added
- **Swing clips** (ADR-071, `player/swings.js`): the hero's swings as key poses over each attack's
  windup, active frames and recovery (the sword hand, the blade's direction, the free hand, hips and
  chest), played by `swingPose` with splines through the keys. 13 clips: three looks each for hits
  1–3, two for hit 4, the sprint slash, the roll cut; plus the cleave. Each clip has a `line`, and
  the animator never follows a swing with another along the same line.
- **The dashing cleave** (ADR-072, `CLEAVE`): the charged attack's release. Event kind `cleave` on
  `player:attack` / `player:hitDragon`; `fx.cleaveImpact` (a ring and a fan of streaks), a crescent
  that hangs twice as long, a 0.15–0.2 s freeze on the hit.
- Pose channel `offAt`: with `twoHand`, how far up the blade the off hand sits (a palm braced on the
  flat). Built for the guard options; not used by the guard that was kept.
- **The Obsidian Throne** (`?level=starless`, ADR-069, ADR-070): the throne hall set
  (`world/throneHall.js`), the Starless Lord (`enemies/starlessLord/`: 31 moves across four forms, eight
  Void spells, four stances), four health bars with pips on the boss bar, the DEATHBLOW call-out,
  `dragon:phase4`, a Phase 4 button in the Lab, `tests/integration/lord.mjs` in `npm test`.
- **Sets with their own night and weather** (ADR-070): a level's set may return `sky` and `ambience`.
- **Perfect parry → return** (ADR-051): RMB ≤ 0.08 s before a bullet lands returns an ember (30 HP,
  14 posture) or a wisp (70 HP, 30 posture) to the wyrm's head; RETURN call-out, gold burst, a
  brighter clang; `player:parry.perfect`, `dragon:parried.perfect`, `dragon:returned`. At most 120 HP
  of returns per pattern.
- **Armageddon** (ADR-053, key `meteorRain`): rear-up, a salvo of 12 / 16 bolts into the sky, the sky
  glowing orange, 3 x 8 / 4 x 10 meteors in waves over the whole clearing (an even spread, safe
  ground kept round you), burning craters in phase 3, a great meteor to finish.
  `hazards.barrage`, `placeWave`, `leadInto`; `world.atmosphere.skyGlow`; `dragon:hazard` stages
  `launch` and `sky`; `dragon.bodyWarn`.
- **Scouring breath** (key `fireWheel`): tongues of fire run out of a breath on the ground and are
  swept round by the wyrm's turn (pausing once, reversing).
- **Light chain of five** (ADR-041): falling cut → rising backhand → whirl → stab → slam (was sweep,
  backhand, slam). **Sprint slash** (LMB while sprinting) and **roll cut** (LMB out of a forward
  roll); both count as hit 1.
- **Equipment slots** (ADR-042): `player/gear/` items in head / chest / shoulders / arms / legs /
  waist / back / weapon; `player.equip(slot, id | null)`, `player.setLoadout(loadout)`,
  `player.loadout`. Today's look is the default loadout; an undersuit covers empty body slots.
- **Hands:** a fist round the sword grip in every pose and a left hand with fingers and a thumb.
- **Bullets** (ADR-039): orange **embers** and blue homing **wisps** can be parried (the bullet flies
  back to the wyrm's head and adds posture), blocked, rolled through or cut with a swing; red
  **orbs** are dodge-only. Every bullet glints and pings 0.35 s before it lands, one parry answers
  a clump, and a pattern can only hit you a few times.
- **Four bullet patterns:** **Ember storm** (spiral arms round the wyrm; orb rings from phase 2,
  counter-rotating arms in phase 3), **Cinder fan** (wing-beat volleys; a red orb wave from phase
  2), **Wisp swarm** (phase 2+, homing) and **Fire wheel** (phase 2+, turning walls of fire to roll
  through). All four are in the Lab.
- **Two combos:** **Storm flurry** (five hits to parry in rhythm) and **Cinder flurry** (phase 2+;
  its last slam scatters four embers that drop on you one by one).
- **Fire effects:** burning wakes behind the claws, a fire and dust burst under a slam, a sparking
  shower on a parried blow.
- `npm test` → **BULLETS** scenario; `Player.isSwinging()`; `dragon.bullets`.
- **`npm run hero-parts`** (ADR-037): rebuilds `src/entities/player/heroParts.js` from
  `scripts/blender/hero_parts.py` in a headless Blender (needs Blender 4.2+; the generated file is
  committed, so playing, testing and deploying need no Blender).
- **Lab model viewer, look-dev tools:** the reference sheet's angles (3/4 and rear 3/4 on the hero's
  right, both sides), a **Spin** turntable, a live **Sheet** of ten tiles (six reference angles, the
  left side, and the gameplay camera on his back, front and right side at ×2), and the hero looks
  **ASCII / Solid / Source / Lines**: Solid draws the bare geometry plain-lit without the ASCII pass,
  so a shape problem can be told from a renderer one. Console: `__game.lab.modelView({ target:
  'hero', dark: true, sheet: true, look: 'solid' })`.
- **A three-phase wyrm fight:** the wyrm changes at 66 % and 33 % of its health with a roar that
  clears the field; phase 3 burns white-hot and opens with the Inferno nova. The boss bar shows where
  the phases begin.
- **Combo strings** you can parry blow by blow (Sekiro style): the claw combo, the rending flurry,
  the hesitant maw (a held bite that baits an early parry), the wing buffet, the tail lash, the
  pounce and a 6–7-hit frenzy. Each parry deflects the blow and the combo goes on; parry the last
  one to stagger the wyrm. Red blows inside a combo must be dodged. A "DEFLECT ×N" counter and a
  clang that climbs with every deflect.
- **The plunge:** a perfect dodge near the wyrm puts you above its head for a reverse-grip stab; you
  ride the head down, backflip off to a landing you can see, and get the crit window. When the wyrm
  is posture-broken, attack near its head for an **EXECUTION**.
- **Flying attacks:** the burning pass (a low pass breathing fire, leaving a burning strip), the sky
  dive (it climbs, tracks you and crashes down) and the hover barrage (fireballs from the air).
  Perfect-dodge its fire from the air and you plunge onto the flying wyrm: it crashes out of the sky.
- **Fire spells:** meteor rain (meteors keep falling while the wyrm fights on), fire eruptions (lava
  pillars toward you; in phase 3 they chase you), a flame ring, a flame wall and the Inferno nova
  (flee its blast or perfect-dodge it). Every one warns with a red ring on the ground.
- **Lab:** a Phase 3 button; every new ability can be triggered.
- **Tests:** scenarios for the strings, the deflect chain, the plunge, the wyrm's plunge reaction,
  hit timing, the fire attacks and the hero's build, plus an opt-in difficulty probe bot.
- **Hero moves:** the roll ends in a sliding kneel with dust, torn grass and sparks off the dragging
  blade; the charged thrust dashes in two real steps; the charge's updraft lifts the coat and hair;
  light 1 cocks the blade over the shoulder; finishes hold for a beat.
- **Wyrm life:** breathing sails, weight shifts, a wing rouse and a stalking stance while it waits;
  wings that turn toward you when you circle it; a death that falls with weight (it rears, buckles,
  thuds onto its side, the head slaps down last and the wings crumple).

### Changed
- **The sword arc** (ADR-074): `PlayerFx.trail` draws an edge line, a faint veil and motes, gated
  by how far the blade turned in the frame (was 4–5 rows of bright strokes under `A` / `8` letters
  with a `+` halftone, drawn for any blade movement); `arcGlint` once a swing.
- **Diagonal cuts** (ADR-071): every clip's blade stays under ~45° of elevation and crosses his
  front near chest height, and hangs back behind the hand until mid-cut; the slam takes `tilt`.
- **The light chain is one-handed** (ADR-071; it was two hands on every swing, ADR-046): the hips
  lead each cut, the sword arm opens to full reach across his front, the free hand moves against it.
  Hit 4 is a long lunge (was a two-handed stab); the low sweep replaces hit 3's cross-cut. Reach and
  lunges are unchanged.
- **The chain's pace** (ADR-071): lights 0.16 / 0.18 / 0.26 s of windup / active / recovery (were
  0.14 / 0.11 / 0.22), the next light after 30 % of the recovery (`chain`), damage 42 / 45 / 50 / 42
  (were 30 / 32 / 36 / 30) and posture ×1.4; `DEFENSE.ghostep.critWindow` 1.6 → 2.2 s.
- **Footwork** (ADR-071): `lungeFeet` steps whichever foot is behind, so the lead foot alternates
  down a chain; `_elbow` limits how fast an elbow swings round its shoulder → hand line (all clips).
- **The sword is 12 % shorter** (ADR-073): `DIM.drawnTip` 0.93, `steelTip` 1.04; the hit segment is
  unchanged.
- **The charge stance** (ADR-072): both hands beside the right ear, the blade standing nearly upright
  beside his head (was both hands at the right hip, the blade out to his side).
- **The guard is the cross ward** (ADR-073): sunk and side-on, the hands before the chest, the blade
  ~38° up across the whole body (was upright, the blade ~50° up).
- **The cloak is a narrow cape** (ADR-073): five sheets (was seven): three down the middle of his
  back, 0.24 m at the hem, and the drapes on the arms.
- `thrustStats` is `chargeStats(holdT, def)`; `THRUST` is only the execution's lunge now; dashing
  heavies carry `dash: true`. On-screen control hints say "cleave".
- **One duelist engine** (ADR-068): `enemies/duelist/` (`Duelist`, `DuelBrain`, `createDuelPoses`,
  `makeRealise`, `DuelFx`); the Ash Disciple is a kit on it and plays exactly as before.
- **Bullets are breathed** (ADR-050): every bullet spawns at the wyrm's mouth along its head's aim
  (`spit()`); Ember storm → Ember torrent (a swept stream, orbs at the extremes, a P3 pirouette),
  Cinder fan → Cinder burst (coughed cones, P3 double taps, a P3 chain into a torrent), a denser
  Wisp swarm. "Hard": ~1.6–2x the bullets, ~20 % faster, shorter cooldowns, higher hit caps; a
  parry's clump pop 2.2 → 1.5 m; bullet damage unchanged.
- **Ground warnings** (ADR-052): every hazard and red area attack heats the ground it will hit
  (a glyph glow and scorch heat, its edge only in the last 0.35 s) instead of red dot rings, `!`
  marks and chevrons; the roar's shock ring is fire orange.
- **Idle sword hold** (ADR-041): the blade hangs ~52° below level at his right side with the edge
  down, the arm relaxed by the ribs (was ~43°, flat up).
- **Side profile** (ADR-041): the cape's outer sheets spread to his right, not behind him; the
  front coat panels hang nearly straight.
- `model.js` is split: geometry builders in `heroGeo.js`, measurements in `heroDims.js`, the outfit
  in `gear/wanderer.js`.
- **Hero build** (ADR-040): chest 0.34 → 0.39 m, waist 0.23 → 0.27 m, shoulder joints ±0.16 → ±0.178,
  upper arms, forearms, thighs and boots ~20 % thicker, head ×1.08, hands ×1.12; collar, pauldron,
  lapels, coat panels and cape fitted to it (hero parts rebuilt). Gameplay sizes unchanged.
- **Idle stance and sword hold** (ADR-040): the blade points out to his right and down (~43°) from a
  bent arm; narrower stance; the cape hangs a little closer.
- **The sword** is 1.25 m (was 1.64 m) and lit blue with white-blue edges (was dark steel with cyan
  seams). Its reach in combat is unchanged (ADR-038).
- **The idle** holds the sword in a low ready at his right side instead of across his front.
- **Pace and damage:** the wyrm waits less between attacks (idle gaps 1.0–1.7 / 0.7–1.2 / 0.35–0.7
  s per phase), and every blow it lands deals 85 % of its listed damage (`TUNING.damageScale`;
  bullets and the fire wheel list final damage).
- **Fire look:** the breath is a dim orange stream with a yellow vein instead of a white bar; the
  fireball's flash no longer hides its blast.
- `player:parry` carries `light`, `dragon:parried` and the bullet tells carry `bullet` (contract
  v0.6, ARCHITECTURE.md).
- **The hero, Blender-built parts** (partial; ADR-037):
  - hair: a rounder mop of layered locks; collar: taller, winged, with a turned rim
  - cape: four wide torn sheets with holes and a clawed hem behind the right shoulder (was: ribbons)
  - pauldron: a cap and a pointed lame with bevelled edges and short blades (was: a dome with needles)
  - sword: a narrower blade with a dark faceted core between barbed cyan edges
  - darker cloth and cape lining, brighter skin, both eyes visible, fewer shirt buttons, plain arms,
    wider and more flared coat panels
- **The hero, single-figure reference round 2** (partial; ADR-036):
  - idle: weight on the left leg, the right leg out, the sword arm at the right hip and the blade in
    a low diagonal across his front, head bowed along it (was: the blade hung at his right side)
  - shading: a 3x3 dot-matrix micro-font in square cells, cel-stepped light, dimmer non-glowing ink
    lines, a per-part silhouette colour (dotted lavender round cloth, white round armour)
  - coat: six wider, longer panels with drawn fold lines; cape: four torn ribbons from under the
    pauldron replace the two sleeve streamers
- **The hero, after the owner's six-view turnaround and single-figure image** (lean reference match):
  - a lean anime swordsman: a V from the shoulders (0.46 m across) to a narrow belted waist, slim
    arms and long legs (the broad build's 0.50 m chest is gone)
  - spiky hair of distinct, asymmetric pointed locks: crown spikes, layered back locks hanging
    toward the nape with their points lifting, nape flicks, a jagged fringe over the eyes
  - a flared stand collar with a turned-over rim, rising to points beside the jaw in front
  - a shaped upper back: a yoke whose seams dip to a four-point star, a centre seam, the baldric
    from the right shoulder to the left hip, two belts
  - a stack of spiked plates on the right shoulder and down the upper arm; banded calves
  - the coat: two tails split by a vent from just under the belts, each flaring to a ragged hem that
    slopes down to its outer point, narrow side panels and two front panels; the legs show between
    them from every side (the closed A-line skirt is gone)
  - the sword after the single-figure image: broad at the guard, one long taper to a sharp point,
    hooked barbs at the base, lightning notches, a guard swept up round a violet four-point star gem
  - the idle hangs the sword at his right side, angled out and down, so it reads from behind
  - at the game camera the blade is a crisp cyan line with a tight glow (its halo used to cover his
    body), the armour is less glaring and the lavender coat tails read against the black coat
- **A longer, harder fight:** the wyrm has 4500 HP (was 1500) and hits harder (most blows 15–24,
  heavy ones 26–40, the nova 70; you have 160 HP); its posture meter is larger; each phase is faster,
  with shorter pauses. It favours its combos and fire attacks, and a new phase's abilities arrive one
  by one.
- **Parrying in rhythm:** a parry no longer ends a combo, only its last blow; right after a deflect
  the next tap counts at once, so you can keep the guard up between blows (mashing still fails).
- **Perfect dodges** against the wyrm no longer teleport you behind it: you plunge onto its head,
  or (out of range, or against a fire hazard) time slows and your hits crit where you dodged.
- **The hero is broad-shouldered:** a deeper chest, thicker arms and legs, bigger boots, on the same
  skeleton (his reach is unchanged).
- **The camera** keeps the hero and a flying or rearing wyrm on screen, panning and pulling back a
  little.
- The red warning rings use bigger dots, so they read at the game camera.
- **The wyrm looks like the reference dragon:**
  - thin pixel digits on black instead of bold letters (finer letters on screens under 900 px tall)
  - a charcoal scaled hide, molten cracks glowing on the undersides, an orange-lit chest and throat
  - crimson torn sails with glowing bones and embers, fuller and readable from every side
  - a bigger, fierce head held low with the jaws open, eagle feet, heavier legs and tail, a crest,
    frills and a saw tail
- **The hero looks like the line-art reference:**
  - bright ink outlines that follow every curve over dim, dense letters
  - at the game camera a dark figure with a cool rim and a crisp cyan blade, cut out of the grass
  - a longer blade (gem to point ~70 % of his height)
  - a coat that drapes with folds and a lavender torn hem, kite greaves, a spiky pauldron, fuller
    hair, and his face shows
- **Hero motion:** the portrait's wide idle with the blade low; feet stay planted while moving and
  turning; the blade swings round his body instead of through his legs; the slam's windup reads from
  behind; slash trails are one smooth crescent; a snappier turn, hair that blows back in a sprint,
  and a flask swig you can see from behind.
- **Wyrm motion:** feet stay planted through turns, the tail sweep and the roar; the bite eases into
  its strike; a parry throws the head back on an arc; the tail is carried in the painting's arch.

### Fixed
- The charge pose's arms: the sword elbow stuck out level and the free arm folded across the belly.
- Tests: the Armageddon timing check assumed a standing hero is hit on a blast's first frame; a blow
  chained within 0.3 s of another now may land inside the blast's 0.12 s.
- The blade's tip streak stops at the point (its far end still reached past it).
- No blade halo or gem glow when no weapon is equipped.
- A light attack's recovery no longer swings the blade home behind his head.
- The blade's tip streak no longer floats off the point (most visible in rolls).
- Bullets (PR #9 review): the phase-2 Cinder fan (8 embers) opened with the hero in a gap, so its
  opening flash came about a second before anything landed; the first fan now has an ember dead on
  him at every count. A homing wisp that missed after its cue could come round and hit without a
  second cue; it announces every pass now (or fizzles). A wisp swarm roared at a hero 25–30 m away
  flashed when the wyrm finished the move, up to 0.7 s before the first wisp landed; the flash now
  waits for the lead wisp.
- The front coat panels no longer hang through the sword when the hero stands idle.
- Hero: returning from the light combo's finish to the idle, the blade cut through the sword arm's
  shoulder for a frame (a near half-turn now goes round the front).
- The hero's sword no longer shows through his back or legs, and his coat rarely passes through the
  blade any more (it drapes over it or hangs inside it).
- Wyrm: wings and limbs flipping round in one frame, feet sliding or floating, the stomp's paws
  landing before the slam, toes under the ground when lying down, the tail folding over itself.
- The wyrm's tail sweep can no longer land before its red warning flash.
- Hero: feet skating, the blade whipping through the legs and the ground, the blade spinning round
  him between light 1 and light 2, the front foot skidding in the thrust, guard taps shuffling the
  feet, the blade's glow sitting short of its point.

### Removed
- The leaping cut straight down the middle (a rising slash takes its place); the arc's letter rim
  and halftone lattice.
- The lunging thrust as the charged attack (it stays as the execution against a broken duelist).
- The old swing model: `slashH`, `stabPose`, light 1's windup loop, `FLOW`, the `h` and `stab` kinds.
- The cloak's wing over his left side and the sheet behind the sword shoulder.
- The Meteor rain (replaced by Armageddon under the same key); the old spiral storm, wing fans and
  evenly spaced fire wheel; the red ground rings, `!` marks, closing inner rings and `>` chevrons.
- The blink behind the wyrm on a perfect dodge (enemies without a head to stab keep it).
- The blade's depth pull, which drew the sword in front of the hero's body.
- The red crack "worms" over the wyrm's back and the dash outlines along its wings and tail.
- Dead code in the ASCII pass (the generic `artCell` letter path and `uArtCount`).

## [0.4.0] - 2026-11-02
The hero and the wyrm are drawn as classic ASCII art (the owner's reference images). The game is
playable on phones.

### Added
- **Touch controls**, shown on phones (or with `?touch`):
  - a floating ASCII stick (push to the rim to sprint)
  - ATTACK (tap = combo, hold = charged thrust), BLOCK (hold = block, tap = parry), DODGE, FLASK,
    LOCK and pause
  - auto-aim at the dragon, pinch zoom, tap prompts and "tap to begin"
  - landscape only, with a rotate overlay
  - a closer phone camera (20 m), LOW quality and a compact HUD
- **Lab show/hide on touch:** a floating `LAB` / `× LAB` toggle and a 36 px close button. The
  compact panel scrolls inside itself on small screens. VIEW → Touch UI tests the layer on desktop.

### Changed
- **The hero shows his details in game** (owner: "isn't showing the details like in your preview
  pictures"). He went from ~9 to ~25 letter rows at the desktop camera (~5 → ~15 on a phone):
  - drawn 1.2x bigger and leaned away from the camera, feet planted, so he stands up on screen
    instead of being seen from above (visual only: hits, hurt box and the dragon's aim unchanged)
  - his own finer letters: a 3x5 pixel font in 4x6 px cells, with the reference's 1 px gaps
  - shading like the reference: a fixed key light, dim letters toward the silhouette, black gaps
    between overlapping parts at the game camera too
  - phones upscale the 1x render crisply (pixelated) instead of blurring the letters
- The hero's ASCII art follows the owner's reference more closely: steadier, brighter letters and
  black gaps at part boundaries instead of 'random text'. White letters no longer bloom.
- The hero and the wyrm render through a fine screen-space ASCII-art grid:
  - letters `. : ; i r s X 2 3 5 h A H S G M 9 # & B @` picked by brightness and coloured per cell
    (white scales, orange lava, red wings, cyan blade, violet gem), on black
  - letters are ~2/3 the size of the world grid's (owner's choice), so the hero still gets rows at
    the game camera
  - red tells, hit flashes and the death dissolve carry through, because they are colour in the
    source

## [0.3.0] - 2026-11-01
Look pass from the owner's v0.2 review and concept sheets.

### Added
- Lab **model viewer** (`lab.modelView`): Front / 3-4 / Side / Back / Game views on a dark
  backdrop, for comparing the hero and wyrm against the concept sheets.
- `docs/art/hero.md` and `docs/art/dragon.md`: builder specs measured from the owner's sheets.
- Surface-glyph material options:
  - `levels`: per-cell glyph variants per light level
  - `levelInk`
  - `glowAxis` / `inkAxis`: object-space underside glow and alt ink
  - `crack: 'voronoi'` fissures
  - `seamAxis`
- Hero moveset from the owner's combat sheet: the 3rd light hit is a two-handed **overhead slam**
  (blue crystal shards). Hold-and-release LMB is a **lunging thrust** (2.2–3.6 m travel). Light
  sweeps leave cyan arc trails.
- Player reach band + step-in assist, so every attack connects with the much bigger wyrm from the
  front (new REACH test scenario).
- Lab **Showroom** button (VIEW): fight on, AI off, god mode, hero 7 m in front of the wyrm,
  camera zoomed in — for reviewing the hero, the wyrm and the grass up close. "Camera default" resets.

### Changed
- **The wyrm is a four-legged drake** (owner's choice), rebuilt from the Obsidian Drake spec:
  - columnar forelegs and digitigrade hind legs on a deep barrel chest
  - separate wings resting half-raised like sails
  - a short thick S-neck
  - a hide of mixed blocky glyphs with a molten underside
  - round red membrane glyphs with white bone lines

  A new quadruped gait. Every ability is re-authored for four legs with the same names, tells,
  windups, timings and damage. Art-director score vs the sheet: 2 → 6 / 10.
- Hero matched more closely to the Shadow Swordsman sheet:
  - one tapered torso with a small head and a fringed mop
  - a tall stand collar
  - an open A-line coat with ~22 tatters
  - belts, the stepped right pauldron, armoured boots
  - a bright 'A'-glyph field like the sheet's ASCII panel, with no neon outline

  Glyphs shrink in close-ups and grow at the game camera. Score: 2.5 → 4.5 / 10.
- Hero rebuilt after the owner's "Shadow Swordsman" sheet:
  - messy violet-sheen hair and a high collar
  - long black coat with torn purple tails
  - spiked pauldron, gauntlets, straps and armoured boots
  - a big sword (1.34 m) with a violet gem and icy cyan edges
  - new idle / walk / sprint / dodge / attack poses
  - reads as a bright glyph figure on the dark ground
- Wyrm restyled after the owner's "Obsidian Drake" sheet:
  - silver chevron scales on obsidian, with a molten orange throat, belly and inner legs
  - deep-red ragged wings with lava veins
  - swept horns, a frill, and spikes along the spine and tail
  - an upright S-neck and glowing maw
- Wyrm 1.5× bigger (`SCALE` 1.875). Arena bound, bite floor, swipe reach and FX are re-measured.
  The boss camera adds at most 5 m of zoom, so the hero stays readable.
- Stones, boulders and flagstones are drawn as crisp carved glyphs fixed to the stone
  (`createCarvedGlyphMaterial`), with cracks and moss. Flagstones are half-sunk with grass growing
  over their edges. Trees are unchanged.
- Grass is the v0.1 world-anchored glyph-stroke field again (no shimmer when the camera moves),
  about 20 % darker with slower, smaller wind so the ground stays calm and the characters pop.
- Hero and wyrm render as crisp glyphs printed on the body (sized to stay legible, drawn larger
  inside each cell, sharp edges) over near-black gaps, instead of the blurry v0.2 screen grid.
- The hero's black coat gets a thin moonlit outline and brighter silver / blade accents.
- Attack tells are visual only (see COMBAT.md): dodge-only attacks make the wyrm glow and flash red
  (plus red ground danger zones for area attacks); parryable attacks are read from the wind-up and
  marked by a brief white glint at the timing moment.

### Fixed
- The tail sweep could land up to 0.2 s before its timing flash for a hero right behind the wyrm.
- The wing membrane allocated ~100 KB per frame (`Math.hypot` boxing).
- The two fallen standing stones' colliders sat off their bodies (walk-through half, blocked
  empty ground).

### Removed
- PARRY / DODGE text marks, ◆ / ! icons, closing rings and off-screen arrows over the enemy, and the
  tell tips in the log.
- The ASCII-pass grass path (`GRASS` class, meadow texture).

## [0.2.0] - 2026-11-01
Combat & presentation pass.

### Added
- Phantom-Blade-Zero-style combat: hold RMB to block, tap RMB just before impact to parry, perfect
  dodge (≤ 0.2 s before impact) → **Ghostep** (blink behind, ×0.3 slow-mo, 1.6 s crit window).
- Attack tells on every dragon attack: white (normal), blue ◆ PARRY, red ! DODGE (unblockable,
  unparryable) with world-anchored marks, off-screen arrows, red screen-edge pulse, a timing flash
  0.35 s before impact, in-world glyph flashes, ground rings for red AoEs and matching audio cues.
- Boss posture meter (gold bar): parries and hits fill it; a posture break opens ×2.2 crits.
- Charged heavy attack (hold LMB, release) with a charge hum and blade glow.
- Roar ring ability (phase-2 transition shock wave, also triggerable in the Lab).
- **Lab** debug mode (`?lab`, F1 or backquote): trigger any ability (keys 1–9), loop abilities,
  phase 2 / stagger / posture break / kill / reset, HP slider, flow state jumps, god mode, infinite
  flasks, time scale and frame stepping, AI toggle, hitbox overlay, teleport, parry/dodge timing
  trainer.
- Shared combat rules module (`src/combat/rules.js`) and contracts for future enemies.
- Branch protection on `main` (PR + green `test-and-build` required), Vercel `ignoreCommand` for
  docs-only commits.
- Headless tests for parry, block, red tells / Ghostep, the Lab and event-contract payloads.

### Changed
- Hero is now an anime-style black-coat swordsman (long coat panels, spiky hair, glowing blade).
- Everything visible renders through one screen-space ASCII grid: procedural ASCII grass meadow,
  stones with outline glyphs, creatures drawn with directional scale / strand / plate glyphs.
- Dragon is 25 % bigger; attack ranges, hitboxes and FX scale with it.
- Approachable balance: player HP 160, 5 flasks, gentler dragon damage and opening cooldowns.
- AI only picks attacks from ranges where they can actually land; charge and fireball timing flashes
  re-time against a moving player.

### Fixed
- Impact freezes no longer swallow a Ghostep slow-mo.
- Phase 2 can no longer be skipped by burst damage (phase gate).

### Removed
- Stamina (and the stamina bar).
- Instanced 3D grass (replaced by the ASCII meadow).

## [0.1.0] - 2026-11-01
First playable vertical slice: *The Cinder Wyrm*.

### Added
- Rendering foundation: glyph atlases, shared shader library (moonlight, pooled fire lights, moon
  shadow map, radial fog, scorch map), screen-space ASCII grid pass for props (stone / leaf ramps),
  surface-glyph material for creatures, glyph particles (additive HDR + alpha), bloom + ACES grade.
- World: glyph-stroke grass (~260k instances) with wind, trample pushers, wing gusts and burn;
  procedural forest ring (oaks, pines, dead trees), broken standing-stone circle, flagstones, bone
  pile with a giant ribcage, bonfire, fireflies, falling leaves, low mist.
- Player knight: procedural model and animation, light combo, heavy attack, roll with i-frames,
  sprint, flasks, lock-on, stamina.
- Wyvern boss *Vaelgrim, the Cinder Wyrm*: procedural rig (IK legs, spring tail, folding membrane
  wings), sleep → wake intro, bite / wing-claw swipe / tail sweep / stomp / fire breath / fireball
  volley / charge, phase 2 at 50% (molten seams, faster, leap slam), stagger, death dissolve.
- HUD in Ansenjeo's MMO style: player frame, boss bar, tabbed log, minimap, name tags, lock-on
  reticle, banners (YOU DIED, WYRM VANQUISHED), title, pause, help.
- Game flow: title → explore → boss intro → boss → death/retry or victory; bonfire rest.
- Procedural audio: ambience, SFX for every combat event, boss music with phase-2 layer.
- Single-file build (`npm run build`), dev server, headless integration tests.
