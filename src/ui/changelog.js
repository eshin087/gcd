// The in-game changelog (WHAT'S NEW: title screen and pause menu; ui/changelogPanel.js; ADR-115).
// Content is data: one release per version, newest first; each entry is a short, player-facing
// version of a CHANGELOG.md entry. `npm test` (tests/changelogcheck.mjs) checks that every headline
// in CHANGELOG.md → [Unreleased] has an entry here with the same title, so a session that adds a
// CHANGELOG entry adds one here too. Notes are plain text: no markup, no ADR numbers, no URLs.

/** The version the game calls itself (package.json `version`). */
export const GAME_VERSION = '0.4.0';

/**
 * Releases, newest first. `version`: null for the work since the last release (it ships to the
 * site as it lands). Entries: { date 'YYYY-MM-DD', title, notes: [string] }.
 */
export const RELEASES = [
  {
    version: null,
    label: 'LATEST',
    summary: 'Everything since 0.4.0. It reaches the site as each piece lands.',
    entries: [
      {
        date: '2026-11-21',
        title: 'A fifth level: the Brazen Foundry and the Clockwork Marshal',
        notes: [
          'A new level: a war-foundry\'s drill yard, where a bronze war-suit with a fire lance kneels before the great furnace.',
          'The suit shrugs off blows on its plates. Cut one side until its plate falls, break its posture for the deathblow, or perfectly parry a Fire Lance bolt to send it back into the plate. Every plate lost changes how it fights.',
          'Empty the suit and the marshal herself climbs out to fight on. Beat her to win the fire-lance shot: press Q (a FIRE button on a phone).',
        ],
      },
      {
        date: '2026-11-21',
        title: 'On a phone: the health bars no longer overlap, and two new ways to hold the controls',
        notes: [
          'Your health and the boss\'s no longer run into each other on a phone. Your meters are shorter there and the boss\'s bar takes the room that is left.',
          'New in the pause menu, PAD LAYOUT: "guard on left" moves the guard to a button beside the stick, so your right thumb can keep cutting while your left one parries.',
          'New in the pause menu, HOLD ATTACK: rest your thumb on ATTACK and the wanderer keeps cutting, no tapping. Both are off until you turn them on.',
        ],
      },
      {
        date: '2026-11-21',
        title: 'The hero looks the same on every screen',
        notes: [
          'The wanderer is drawn with the same bold letters on a phone, a laptop and a large monitor, and when the camera pulls in or out. On large screens he used to turn into a mesh of tiny ones.',
          'From the front and the side he is one dark figure now, and his sword is plain dark steel that lights up white only while it cuts.',
          'The bosses and the fight are unchanged.',
        ],
      },
      {
        date: '2026-11-21',
        title: 'A fourth level: the Skybreak Ring and Tian Lei, the Last Ascendant',
        notes: [
          'A new level, the Skybreak Ring: a tournament ring of stone tiles out on the badlands. Pick it on the title screen.',
          'Its boss is Tian Lei, the Last Ascendant, who fights bare-handed and has three health bars. Empty a bar and land the deathblow, and he transforms instead of dying.',
          'First he is a martial artist: punches, kicks, a kicked floor tile, a blast you can parry back at him, and one beam.',
          'Then a golden flame stands round him. He vanishes and strikes from behind, throws volleys and a disc that returns, and drags a beam across the ring.',
          'Last comes the storm: lightning falls all through the form, and he fires his great beam. Parry its head at the blue flash to start a struggle, and mash attack to cut the beam in two.',
          'Any beam can be stepped off, rolled through or held on your guard. A guard loses guard, never health.',
          'The ring breaks as you fight: tiles shatter, beams cut trenches and knock the tops off the rocks around you.',
        ],
      },
      {
        date: '2026-11-21',
        title: 'Felled trees lie as the blow left them',
        notes: [
          'No two felled trees look alike now. A blade leaves a tall stump cut on a slant, a heavy blow tears it lower, a blast shatters it close to the ground, and fire leaves it low and black.',
          'Trunks land at their own angle, often snapped in two, and some trees that burn down stay standing as black snags.',
        ],
      },
      {
        date: '2026-11-21',
        title: 'The Cinder Wyrm glares from every side',
        notes: [
          'The wyrm\'s eyes are slanted slits of fire under a heavy brow, so it glares at you from the side, from the front and from below, not only from one angle.',
          'Its neck no longer looks broken while it stands: the neck arches over into the head, and the head stays level as it watches you.',
          'The fight is unchanged.',
        ],
      },
      {
        date: '2026-11-21',
        title: 'The Ash Disciple and the Starless Lord move like swordsmen',
        notes: [
          'Shen Hui and the Starless Lord swing their blades now: a cut speeds up into the blow, follows through and flows into the next one. Before, they jumped from one held pose to the next.',
          'Their feet hold the ground and take steps as a string carries them toward you, instead of sliding.',
          'Shen Hui raises his overhead clear of his hat and keeps his eyes on you through the chop; his whirl turns on a hop. The Lord rolls his blade in front of him, not through his hood.',
          'Nothing about the timing changed: every flash, every windup and every reach is what it was.',
        ],
      },
      {
        date: '2026-11-21',
        title: 'The wall of trees comes down and the fight goes out through it',
        notes: [
          'In Cinderwood the ring of trees round the clearing no longer holds you once it starts to fall. Where a tree has burnt through or been felled, the ground behind it is open, out to the next tree still standing.',
          'The wyrm follows you through any gap wide enough for its body, and its fire and meteors follow you everywhere. A tree that falls where you can now stand must be dodged.',
          'The fight starts as it always did: nothing opens until the first tree of the wall is down. The wall stands again when you die or rest.',
        ],
      },
      {
        date: '2026-11-20',
        title: 'The Cinder Wyrm has a new face',
        notes: [
          'The Cinder Wyrm has a new head: a long hooked snout, a heavy brow over each eye, long horns swept back over its neck and fins off its cheeks.',
          'Its eyes burn in dark sockets, and when it roars its mouth is a black cavern with a red tongue, long fangs and fire at the back of the throat.',
          'The fight is unchanged: its bite, its breath and where you can hit its head are the same.',
        ],
      },
      {
        date: '2026-11-20',
        title: 'The Cinder Wyrm is leaner and carries its head high',
        notes: [
          'The Cinder Wyrm has a leaner build: a tucked waist, a shallower chest, thinner neck, legs and tail, and longer talons. Its letters, colours and wings are the ones it had.',
          'Between attacks it holds its head high on a rising neck. The head is narrower, with longer fangs, horns and frills, and a mane of quills runs down its neck, back and tail.',
          'The fight itself is unchanged: its reach, its timings and its attacks are the same.',
        ],
      },
      {
        date: '2026-11-16',
        title: 'The Ash Disciple and the Starless Lord fight harder, in arenas that break',
        notes: [
          'Both human bosses give far fewer pauses and chain their moves by where you stand, busier in every phase. Each hit hurts as much as before, and two attacks that need different answers never land at the same moment.',
          'Shen Hui has a third phase: he vanishes into ash and strikes from another side. Sixteen new moves, and from phase 2 his cuts leave lines of fire on the stones. Step off them: fire drains your guard, never your health.',
          'The Starless Lord casts inside his strings and has nineteen new moves. In his last form strikes keep falling from the sky, and Starless Night sends three waves across the whole crater.',
          'Both arenas break: floors crack and shatter, statues come down, and both bosses throw the floor at you. Thrown pieces show no mark on the ground: answer the flash on the flying piece.',
        ],
      },
      {
        date: '2026-11-16',
        title: 'The wyrm burns in phase 3, the forest breaks, the letters follow the zoom',
        notes: [
          'In its third phase the Cinder Wyrm sets itself on fire: wing tips, claws and tail burn, and fast moves leave arcs and ribbons of flame. Its attacks hurt as much as before, and its burning footprints do not hurt at all.',
          'Every tree in Cinderwood can break now, and wears down first: leaves burst off, the crown thins, it leans, it falls. The wyrm tears into the tree wall with wind and stray fire. The great skeleton and the Cinder Tree come apart too.',
          'Zooming out on a desktop keeps the detail: the small letters shrink with the picture instead of getting scarce.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The Cinder Wyrm fights harder, with its whole body',
        notes: [
          'The wyrm gives far fewer pauses and chains its attacks: claws, jaws, wings, tail, fire and flight in one flow, busier in every phase. Each hit hurts as much as before.',
          'New attacks: wing sweeps and slams, tail whips and slams, a bite that ends in fire, flying combos of up to four attacks, and fire that crawls along the ground. The blue homing wisps are gone.',
          'Thrown trees and boulders come twice as fast with no mark on the ground: roll at the red flash. The whole clearing now breaks, and the wreckage stays.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'Red, blue and black flashes: dodge, parry, and a charged blow',
        notes: [
          'A red flash across the screen is now the only sign of an attack you must dodge: no red glow, no red ring on the floor. Dodge at the flash and the hero answers with his flurry.',
          'A blue flash marks a blow to parry. Parry it and the boss\'s combo ends and the hero counters by himself.',
          'Every boss has a black charged attack: darkness gathers on the weapon, then a black flash. Dodge it. Blocking it costs no health but empties the whole guard meter.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'Dark music for every level and every boss phase',
        notes: [
          'Each level has its own dark music while you explore, and every boss phase has its own track that takes over when the phase changes: three for the Cinder Wyrm, two for the Ash Disciple, four for the Starless Lord.',
          'A short victory fanfare and a game-over theme. All 14 tracks are free (CC0) recordings from OpenGameArt, picked by ear.',
          'Sound effects are unchanged. The old synthesised music still plays while a track loads.',
        ],
      },
      {
        date: '2026-11-15',
        title: "What's new in the menu; the phone camera stays back",
        notes: [
          "WHAT'S NEW on the title screen and in the pause menu lists every version and what changed. A badge counts what you have not read yet.",
          'Phones: a duel\'s slow-motion moments (parry, blade lock, counter, execution) no longer pull the camera in to the knees. They come in as far as on a computer, for the phone\'s closer camera.',
          'iPhone: a quick double tap (mashing ATTACK, LOCK twice) zoomed the whole page in and it stayed stuck. Double taps are blocked now, and a page that gets zoomed anyway snaps back.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'A heavy attack, and five heavies to choose from',
        notes: [
          'A HEAVY button (right click, R2, a fourth tile on the phone): on its own a dashing two-handed thrust.',
          "After the first to fourth light of the combo it is that point's own heavy: a rising cut that staggers, a spinning sweep, a guard-breaking falling cut, a bigger slam.",
          'Hold HEAVY to charge the cleave, so a light attack comes out the instant you press it. Block moved to the middle click, lock-on to Tab.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The hero stands like a swordsman',
        notes: [
          'Exploring, he stands at ease: a hand on his belt, the blade carried down his arm.',
          "Locked on or in a boss fight, he holds a fencer's guard with the point on the enemy, and keeps it while he moves.",
          'He breathes, shifts his weight and looks around.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'Fire, spells and effects made of the same small letters',
        notes: [
          'All fire is one body of small digits: a white-hot heart, an orange body, red tongues and grey smoke.',
          "The duelists' lightning, crescents and Void spells are drawn the same way. The Lord's spells are white and violet now.",
          'One set of timing cues for every boss: a white cross to parry, an eight-point star for a heavy blow, a red blaze to dodge.',
          'The landmarks are rebuilt and moved to where the fight\'s camera looks.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The Ash Disciple uses the courtyard',
        notes: [
          'Severed Pillar: he cuts through the pillar you stand under. Leave the red strip.',
          'Flying Lantern: he kicks a stone lantern at you. Parry it or leave the ring.',
          'Three Tolls: three rings of sound from the bell. Parry them in rhythm, roll through, or run in.',
          'Swallow\'s Return: he leaps onto a pillar and dives at you from another side.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The Cinder Wyrm uses the ground',
        notes: [
          'Uproot and hurl: it tears out a tree or boulder and throws it. Get out of the glow.',
          'Tail bat: a boulder skims along a glowing line. Parry, block, step aside or take cover.',
          'Firebrand (phase 2): it throws a burning tree that sets the grass alight.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The Starless Lord uses the crater',
        notes: [
          'Void Hurl: a hanging stone or a shard is thrown at a ringed spot. The ring gives you time to run out of it.',
          'Glass Rain (forms 3 and 4): three throws in a row.',
          'Crown Fall (forms 2 to 4): stand by something tall and he pulls it down on you.',
          'Stagger him in the windup and the stone drops.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The Obsidian Throne is open',
        notes: [
          "The Lord's level is now the crater where he fell: cracked black plates, glass shards, stones hanging in the air and a broken crown of slabs.",
          'No walls stand between the camera and the duel. He wakes when you step onto the floor.',
          'The shards and slabs break and are cover.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The death screen names what killed you',
        notes: [
          'Under YOU DIED: the move that dealt the last blow, and which moves hit you and how often.',
          'The victory record shows what struck you most.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The world breaks',
        notes: [
          'Trees, stones, boulders, pillars and lanterns chip, break and fall, by your blows and the bosses\'.',
          'Fell a piece onto a boss to hurt it badly. Under one a boss fells, take the red blow or roll out.',
          'Anything tall is cover against bullets, crescents, thrown stones and the Void, until it breaks.',
          'Fire burns where it lands for a few seconds, then leaves ash. It never spreads.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'You can see yourself behind the dragon',
        notes: [
          'When the wyrm, a tree or a pillar covers the hero, he shows through it as a cyan ghost of his own outline.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The same fight at any frame rate',
        notes: [
          'On a slow device the timing windows are as fair as on a fast one, and the game no longer runs in slow motion under 20 fps.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The riskier the answer, the more it pays',
        notes: [
          'The flurry now answers a perfect dodge of a red blow only. White and heavy dodges still build your streak.',
          'Flash counter: attack at the last instant before a duelist\'s blow and cut straight through it.',
          'A perfect parry deals more posture and makes your next light cut fast and critical.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'The flurry reads against the human bosses, and every blink leaves an ASCII afterimage',
        notes: [
          'Each flash cut against a duelist winds up, runs past his side and ends in a finish you can see.',
          'Every blink leaves your outline behind in cold blue digits that fall apart.',
        ],
      },
      {
        date: '2026-11-15',
        title: "The boss's bar at the top; QUIT TO TITLE",
        notes: [
          "The boss's name, HP and posture sit at the top centre.",
          'The pause menu has QUIT TO TITLE (press it twice).',
        ],
      },
      {
        date: '2026-11-15',
        title: 'Background objects drawn like the dragon, and landmarks',
        notes: [
          'Pillars, stones, lanterns, the throne, bones and the bonfire are made of the wyrm\'s small digits.',
          'Each level has big set pieces: an elder wyrm\'s skeleton, colossal stone swordsmen, a sect gate and more.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'Training mode and a lab stage',
        notes: [
          'F4 opens Training: every situation worth practising, one click each, with the game playing your side.',
          'A training room stage: a dark dojo with a measuring grid.',
        ],
      },
      {
        date: '2026-11-14',
        title: 'An ASCII HUD',
        notes: [
          'HP, guard and the boss\'s bars are rows of characters drawn on the game.',
          'YOU DIED, victory and area names are block letters like the title logo.',
          'The minimap is a small faint disc.',
        ],
      },
      {
        date: '2026-11-14',
        title: 'Phone controls you can hold, and a guard meter',
        notes: [
          'ATTACK, BLOCK and DODGE are three tiles that touch: slide your thumb between them. Move and size them in the pause menu.',
          'A guard meter: a blocked blow costs guard, not HP. Run it dry and your guard is knocked open.',
          'Play upright: holding the phone in portrait works.',
        ],
      },
      {
        date: '2026-11-15',
        title: 'Weight on the flurry; one streak; the riposte; bosses with a streak of their own',
        notes: [
          'Flash cuts land with a freeze, the boss reels and the last blow staggers a duelist.',
          'Parries count in your streak. Parry the last blow of a string for a riposte.',
          'Duelists keep a streak too and answer with their own flurry. Parry or block it all to break them.',
        ],
      },
      {
        date: '2026-11-14',
        title: 'The Cinder Wyrm in large, readable letters',
        notes: ['The wyrm was printed in large bold symbols for a day. The next entry replaced it.'],
      },
      {
        date: '2026-11-14',
        title: 'The Cinder Wyrm in finer, steadier letters',
        notes: ['The wyrm is drawn in fine, calm digits that travel with its body instead of sliding under a fixed grid.'],
      },
      {
        date: '2026-11-14',
        title: 'The free hand in sword fingers; weight and footwork; a cut that lands; outfits to pick from',
        notes: [
          'The free hand forms sword fingers and moves against each cut.',
          'The body carries the cuts, the feet plant and pivot, and a landed edge bites before it tears through.',
          'A landed cut shows a slash line, sparks and a camera kick.',
        ],
      },
      {
        date: '2026-11-14',
        title: 'The streak and the flurry',
        notes: [
          'Perfect dodges in a row build a streak. Each one is answered with that many flash cuts and an art.',
          'Arts against the wyrm: Skyfall, Severing Line, Heaven Splitter. Against a duelist: Passing Cut, Falling Leaf, Rising Moon.',
        ],
      },
      {
        date: '2026-11-14',
        title: 'The Starless Lord in black plate, and how he moves',
        notes: [
          'He wears a hooded black harness with a slit of red light, and glides instead of running.',
          'New moves, among them three spells: the Crushing Dark, the Rift and the Dark Star.',
        ],
      },
      {
        date: '2026-11-14',
        title: 'Hit reactions and the death, made natural',
        notes: ['The hero falls the way a blow drives him, buckles at the knees and lies naturally.'],
      },
      {
        date: '2026-11-14',
        title: 'Steel on steel',
        notes: [
          'Parries show the two blades crossed, with sparks.',
          'A duelist guards and deflects your strikes. A guard press or dodge cancels any swing.',
          'Blade lock, and the trade clash: swing as he swings and the cuts meet.',
          'The camera eases closer within a duelist\'s reach.',
        ],
      },
      {
        date: '2026-11-14',
        title: 'A faster chain, a new finisher, swings that flow home',
        notes: [
          'A hit about every 0.32 s, and a new leaping two-handed finisher.',
          'After each cut the blade eases home instead of snapping back. A finer sword trail.',
        ],
      },
      {
        date: '2026-11-13',
        title: 'Wuxia-flow swings, a dashing cleave, a deeper guard, a narrower cloak, a new sword arc',
        notes: [
          'Every swing is a whole-body cut with several looks per hit.',
          'The charged attack is a dashing diagonal cleave. The guard is a deeper, side-on stance.',
        ],
      },
      {
        date: '2026-11-13',
        title: 'The Starless Lord, a third level',
        notes: [
          'The Obsidian Throne: a dark lord with a blade of red light, in four forms with four health bars.',
          'Empty a bar or break his posture, then strike the DEATHBLOW. Between strings he works the Void.',
        ],
      },
      {
        date: '2026-11-13',
        title: 'Controller support',
        notes: ['Play with an Xbox, PlayStation or any standard gamepad, with rumble and on-screen pad hints.'],
      },
      {
        date: '2026-11-13',
        title: 'Remappable controls',
        notes: ['Pause → CONTROLS: rebind any action on the keyboard, mouse or controller.'],
      },
      {
        date: '2026-11-12',
        title: "The hero at Shen Hui's size, a trimmed cloak",
        notes: ['The hero is drawn a little smaller and his cloak is trimmed, so his back and arms show.'],
      },
      {
        date: '2026-11-12',
        title: 'The Ash Disciple, a second level',
        notes: [
          'The Ashfall Courtyard and Shen Hui, a fast swordsman with a long jian.',
          'Perfect deflects, blade locks and the mikiri, each in slow motion.',
          'Pick a level on the title screen.',
        ],
      },
      {
        date: '2026-11-12',
        title: 'Attack variants, hair that reads, a fuller cloak',
        notes: ['Every hit of the chain has two or three looks, so the combo does not repeat.'],
      },
      {
        date: '2026-11-11',
        title: 'Breath-born bullets, perfect-parry returns, Armageddon, heat-glow warnings',
        notes: [
          'Bullets pour from the wyrm\'s jaws. A perfect parry sends one back.',
          'Armageddon: a sky full of meteors. Ground warnings glow with heat.',
        ],
      },
      {
        date: '2026-11-12',
        title: 'Two hands, a raised guard, idle life, gold hair',
        notes: ['Two-handed swings, a raised guard, and idle moves when you stand still.'],
      },
      {
        date: '2026-11-11',
        title: 'A hooded cloak, arms that bend, fewer draw calls',
        notes: ['A hooded, tattered cloak, a sword arm that bends, and a lighter load for phones.'],
      },
      {
        date: '2026-11-11',
        title: 'Hands, a longer combo and equipment slots',
        notes: ['Real hands on the grip and a five-hit chain with a sprint slash and a roll cut.'],
      },
      {
        date: '2026-11-09',
        title: 'The hero filled out',
        notes: ['Broader chest and shoulders, and the sword held where you can see it.'],
      },
      {
        date: '2026-11-09',
        title: 'Bullet hell and the moonlit sword',
        notes: ['The wyrm throws spirals and swarms of fire bullets you can deflect. The sword glows blue-white.'],
      },
      {
        date: '2026-11-09',
        title: 'Blender-built hero parts',
        notes: ['Hair, collar, cape and blade sculpted in Blender.'],
      },
      {
        date: '2026-11-09',
        title: 'Single-figure reference, round 2',
        notes: ['A new stance, a fine dot-matrix look and a fuller coat.'],
      },
      {
        date: '2026-11-09',
        title: 'The lean reference match',
        notes: ['A lean swordsman with spiky hair, a flared collar and split coat tails.'],
      },
      {
        date: '2026-11-09',
        title: 'The epic wyrm fight',
        notes: ['A longer, harder battle in three phases, with combos to parry blow by blow, fire spells and short flights.'],
      },
      {
        date: '2026-11-08',
        title: 'The reference match',
        notes: ['The wyrm and the hero look like the reference images and move better.'],
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-11-02',
    summary: 'Classic ASCII art, and the game is playable on phones.',
    entries: [
      {
        date: '2026-11-02',
        title: 'Touch controls',
        notes: [
          'A floating stick, ATTACK, BLOCK, DODGE, FLASK, LOCK and pause on phones.',
          'Auto-aim at the boss, pinch zoom, and a closer phone camera.',
        ],
      },
      {
        date: '2026-11-02',
        title: 'The hero shows his details',
        notes: ['The hero is drawn bigger in finer letters, so he reads at the game camera.'],
      },
      {
        date: '2026-11-02',
        title: 'A fine ASCII-art grid',
        notes: ['The hero and the wyrm print through a fine grid of letters coloured per cell.'],
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-01',
    summary: 'A look pass from the concept sheets.',
    entries: [
      {
        date: '2026-11-01',
        title: 'A four-legged drake',
        notes: ['The wyrm became a bigger, four-legged drake with sail wings and a molten underside.'],
      },
      {
        date: '2026-11-01',
        title: 'The Shadow Swordsman',
        notes: ['The hero became a black-coated swordsman with a big sword and new poses.'],
      },
      {
        date: '2026-11-01',
        title: 'New moves and clearer tells',
        notes: [
          'An overhead slam and a lunging thrust.',
          'Attack tells are read from the boss itself: a red glow to dodge, a white glint to parry.',
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-11-01',
    summary: 'Combat and presentation.',
    entries: [
      {
        date: '2026-11-01',
        title: 'Block, parry and the perfect dodge',
        notes: [
          'Hold to block, tap just before impact to parry, and a perfect dodge blinks you behind the boss.',
          'A posture meter: break it for big critical hits. A charged heavy attack.',
        ],
      },
      {
        date: '2026-11-01',
        title: 'Every attack tells you how to answer it',
        notes: ['White for a normal blow, blue to parry, red to dodge.'],
      },
      {
        date: '2026-11-01',
        title: 'A gentler start',
        notes: ['More HP, five flasks and no stamina bar.'],
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-01',
    summary: 'The first playable fight: the Cinder Wyrm.',
    entries: [
      {
        date: '2026-11-01',
        title: 'The Cinder Wyrm',
        notes: [
          'A moonlit forest drawn in ASCII, with grass, stones, bones and a bonfire.',
          'A knight with a light combo, a heavy attack, a roll and flasks against a wyvern in two phases.',
          'Procedural sound and music.',
        ],
      },
    ],
  },
];

/** A stable id for an entry: its date and title (not its release, so cutting a version keeps it read). */
export function entryId(entry) {
  return `${entry?.date ?? ''}|${entry?.title ?? ''}`;
}
