// Look options behind URL switches: a redraw is shown to the owner as two or three options on one
// sheet and picked before it becomes the default (CLAUDE.md "One art design"; the pattern ADR-118
// used for the flare and ADR-119 for the wyrm's ring, breath and apocalypse).
//
//   lookOf('star', '0')   the option to draw the Dark Star with (see lookOf for the order).
//   setLook('star', 'b')  the Lab, the tests and the film rig switch it live; null gives it back.
//
// By convention '0' is the look as it shipped before the option existed (what `main` drew), 'a' the
// proposal its author would pick, 'b' and 'c' the alternatives. A call site's `def` says which kind
// of switch it is: '0' = a redraw of something that exists, anything else = a new thing (its author's
// pick; it has no "before"). Read at draw time (a Map lookup and a property read): cheap.
//
// The URL: `?star=b` one switch; `?looks=old` every redraw as it was before the duelists' second pass
// (the call sites whose `def` is '0'; a new thing keeps its pick); `?looks=new` (every proposal at
// once, how the owner played them before picking) is still accepted and now equals the default.

/** The owner's picks (2026-11-16, from the rendered sheets, asked in two rounds): the look each
 *  switch ships with. Every author's pick (`a`); the bodies `b`, "dressed by phase / form". The
 *  options that lost stay behind their switches (as ADR-118 / ADR-119 left theirs). */
export const PICKED = Object.freeze({
  // Shen Hui, the Ash Disciple
  kindle: 'a', // the Kindling: a fire front and a gout off the blade (the owner's pick)
  ashp3: 'a', // the third phase's change: ash on the wind (the owner's pick)
  qi: 'a', // the sword qi / crescents, both bosses: a body and a wake (the owner's pick)
  flit: 'a', // the flit: a ghost where he left, a stream of ash crossing (the owner's pick)
  burn: 'a', // burning ground: a glowing seam with embers and a wisp of smoke (the owner's pick)
  toll: 'a', // the bell's rings: a ragged front of steel at waist height (the owner's pick)
  ashLook: 'b', // his body: today's figure dressed by phase (the owner's pick)
  // Varr Nihil, the Starless Lord
  star: 'a', // the Dark Star: a starless sun (the owner's pick)
  sky: 'a', // a strike of the Starless Sky: the sky answers inside the frame (the owner's pick)
  ignite: 'a', // a form's ignition: each form its own sign (the owner's pick)
  void: 'a', // the smaller things of the Void, redrawn (the owner's pick)
  presence: 'a', // forms 2 and 3: a quiet presence (the owner's pick)
  great: 'a', // Starless Night's waves: the dark tide (the owner's pick)
  lordLook: 'b', // his body: today's figure dressed by form (the owner's pick)
  outskirts: 'c', // round the Obsidian Throne's crater: those who came for him (the owner's pick, 2026-11-22)
  // both arenas
  floor: 'a', // a broken floor slab: rubble on printed earth (the owner's pick)
  // the Skybreak Ring and Tian Lei, the Last Ascendant
  ring: 'a', // the arena: the ring on the flats (the owner's pick)
  ascLook: 'e', // his body: the gi with wraps in ember, a burnt red (the owner's pick, 2026-11-23, ADR-155; was h, the orange gi)
  ascLetters: 'a', // his letters: the hero's size (the owner's pick, 2026-11-23, ADR-155; was 0, the bosses' fine cell)
  ascHair: 'b', // his gold hair (forms 2 - 3): his own hair risen (the owner's pick, 2026-11-23, ADR-155; was 0, the tall crown)
  ascAura: 'a', // his aura: a tall flame, hollow behind him (the owner's pick)
  ascBeam: 'a', // his beam: the column (the owner's pick)
  ascLift: 'b', // his print: the hero's quieter one (the owner's pick, 2026-11-23, ADR-155; was a, lifted: a lighter fill, a stronger edge of light)
  ascOrb: 'a', // Heaven's Lantern, the great orb: a sun (b a lantern, c the pale gathered sphere; the owner has not chosen yet, 2026-11-22)
  ascMotion: 'a', // his motion: held blue / red windups, the snap blows (the owner's pick, 2026-11-26, of two; ADR-225; 0 as before)
  ascBeamPose: '0', // his beams: the palm thrust (cup: both hands cupped at the hip; the owner has not chosen yet, 2026-11-22)
  // the Windless Grove and Lu Wusheng, the Sheathed (the owner, 2026-11-22: "keep the recommended")
  grove: 'a', // the grove's light: a moonlit mist (the owner's pick)
  sheathLook: 'd', // his body: the Wanderer (the owner's pick, 2026-11-22, over a, mourning white)
  drawCut: 'a', // the draw's cut: one white line (the owner's pick)
  sheathArt: 'a', // his print: the hero's ink-line art (the owner's pick, 2026-11-24, with the bosses' print, ADR-194; was 2, the digits lit and outlined, 2026-11-23, ADR-152)
  sheathTone: 'a', // his palette: indigo and sand (the owner's pick, 2026-11-23, of three)
  // (sheathMark: rendered for the owner, not picked yet: its Lab row is 'awaiting')
  // Halcyon Plaza and Halcyon, the Last Saviour
  halLook: 'a', // his body: a deep blue armoured suit, a long red cape, gold trim (the owner's pick, 2026-11-23, of three; ADR-161)
  glare: 'a', // his eyes' heat: crimson with a white-hot core (the owner's pick, 2026-11-23, of three; ADR-161)
  city: 'a', // the city: Neon Rain, night, rain, wet dark asphalt, pale neon (the owner's pick, 2026-11-23, of three; ADR-159)
  halCape: '3', // his cape and colours: the wide red cape that billows (the owner's pick, 2026-11-23, of four steps; ADR-164)
  halLetters: 'a', // his letters follow his size, the hero's cell (the owner's pick, 2026-11-23, of two; ADR-166)
  halPrint: 'a', // the hero's quieter print (the owner's pick, 2026-11-23, of three; ADR-166)
  halMotion: 'b', // his motion: a's flier's limbs, straight punches on the line, straight kicks, long trailing legs, a level fly-by (the owner's pick, 2026-11-27, ADR-254; was a, 2026-11-26, ADR-225: a flier's legs, blows aimed at the hero, the held windups, the snap blows)
  halPace: '0', // his pace: the fast one he shipped with (the owner's pick, 2026-11-27, over a, rule 10's floor; ADR-254)
  halEyes: 'a', // his eye beams: heat vision, twin threads, a shimmer, a molten spot (the owner's pick, 2026-11-27, of three; ADR-254)
  halShock: 'a', // Applause / Meteor's landing: the thunderclap ring of air (the owner's pick, 2026-11-27, of three; ADR-254)
  halCapeSize: 'b', // the cape at about 65 %, past his knees (the owner's pick, 2026-11-23, of four; ADR-166)
  // the Hall of Falling Script and Xin Yi, the One Who Woke
  oneLetters: 'a', // his letters: the hero's size (the owner's pick, 2026-11-23, "Print a", ADR-170; 0 the bosses' fine cell)
  onePrint: 'a', // his print: the hero's quiet print and the simpler shapes (the owner's pick, 2026-11-23, "Print a", ADR-170; b one cell bolder on a phone, 0 as he shipped)
  oneBody: 'b', // his figure: the open coat, printed like the hero on a man's build, one coat (the owner's pick, 2026-11-26, ADR-221; 0 as he shipped, a closed, c the duster)
  oneMoves: 'a', // his moves: straight kicks, long punches, held blue / red windups, the side-on aim, two fast strings (the owner's pick, 2026-11-26, ADR-221; 0 as he shipped)
  // the sword motion pass (ADR-226; the owner's pick, 2026-11-26, from the before / after films)
  ashMotion: 'a', // Shen Hui: the jian in line with the arm, held blue / red windups (Piercing Ash keeps its thrust), quick blows
  lordMotion: 'a', // Varr Nihil: the same, and the end-of-string shake for the twirl
  // every human boss
  bossPrint: 'b', // printed the hero's way, in his own colours (the owner's pick, 2026-11-24, of three: 0 as before, a the hero's greys; ADR-194)
  // the motion pass (ADR-223; the owner's picks, 2026-11-26, from the films: A for all three, every quick blow)
  sheathMotion: 'a', // Lu Wusheng's blue / red blows held at the cock, blue tall, red sunk
  foxMotion: 'a', // Wen Yao's, the same, and his lifted feet eased off their spot
  wyrmMotion: 'a', // the wyrm's string hits held, blue rearing its head, red sunk with the tail up
  sheathQuick: 'a', // Before the Word
  foxQuick: 'a', // Fox Snap, Fox Knee
  wyrmQuick: 'a', // Snap swipe
  // drawn in the hero's style (the owner's picks, 2026-11-26, ADR-220; 0 each as he shipped)
  ashHero: 'c', // Shen Hui: the hero's shading and his outline (a the shading, b the outline)
  lordHero: 'c', // Varr Nihil: the hero's shading and his outline
  sheathHero: 'c', // Lu Wusheng: the hero's shading and his outline
  ascHero: 'a', // Tian Lei: the hero's shading (his lines are the hero's already: his letters follow his size)
  halHero: 'a', // Halcyon: the hero's shading (likewise)
  // the title
  menu: 'c', // the sword's path: the worlds as fires along one line (the owner's pick, 2026-11-25, of three; 0 the title before; ADR-196)
  // Bai Wuji, the Untouched (the owner's picks, 2026-11-25, from the body sheets)
  wjLook: 'c', // the bone-white coat
  wjHair: 'b', // the short spiky burst, the choppy mop once it falls
  wjCity: 'a', // the crossing: cold moonlit ash-grey
  wjShell: 'a', // the barrier: all but invisible until a blade nears it
  wjNull: 'a', // the Violet Null: a hard-edged slab
  wjVoid: 'b', // the void: the stars and one great pale ring on the floor
});

/** Switches the owner has not picked yet (their rendered options wait for the owner): in the Lab's LOOKS
 *  rows, deliberately NOT in PICKED; each draws its call site's default until picked. When the
 *  owner picks, the switch moves from here into PICKED. */
export const PENDING = Object.freeze(['foxLook', 'foxfire', 'clones', 'foxLetters', 'foxFire3', 'foxSpirit', 'oneLook', 'hall', 'script']); // Wen Yao (ADR-147, ADR-154); Xin Yi and his hall (ADR-156, ADR-157; his figure and moves rebuilt and picked, ADR-221); Halcyon and his city: all picked (ADR-161, ADR-164, ADR-166)

const fromUrl = new Map();
const forced = new Map();
let allNew = false;
let allOldUrl = false;

/** Read the look parameters of a URL query (done once at load from `location.search`; the tests call
 *  it to play a URL, e.g. `readLookUrl('?looks=old')`, and `readLookUrl('')` to go back). */
export function readLookUrl(search) {
  fromUrl.clear();
  allNew = false;
  allOldUrl = false;
  try {
    const q = new URLSearchParams(search ?? '');
    for (const [k, v] of q) if (v) fromUrl.set(k, v);
    allNew = fromUrl.get('looks') === 'new';
    allOldUrl = fromUrl.get('looks') === 'old';
  } catch {
    // no URL: the defaults
  }
}
// (the headless tests have no `location`)
readLookUrl(globalThis.location?.search ?? '');

/** The option chosen for switch `name` (a short lower-case word), in this order:
 *  1. a look forced live by `setLook` (the Lab, the tests, the film rig);
 *  2. the URL's own parameter for it (`?star=b`);
 *  3. '0' under `?looks=old` when the call site's `def` is '0' (a redraw: the look before this pass);
 *  4. the owner's pick (`PICKED`);
 *  5. `pick` under `?looks=new` for a redraw no one has picked yet (none today);
 *  6. `def`. */
export function lookOf(name, def = '0', pick = 'a') {
  const f = forced.get(name);
  if (f != null) return f;
  const u = fromUrl.get(name);
  if (u != null) return u;
  if (allOldUrl && def === '0') return '0';
  const p = PICKED[name];
  if (p != null) return p;
  return allNew && def === '0' ? pick : def;
}

/** The option switch `name` ships with (the owner's pick), or null for a switch not in the table. */
export function pickedOf(name) {
  return PICKED[name] ?? null;
}

/** True when the URL asked for every redraw as it was before this pass (`?looks=old`). */
export function allOld() {
  return allOldUrl;
}

/** True when the URL asked for every proposal at once (`?looks=new`; today the same as the default). */
export function allProposals() {
  return allNew;
}

/** Switch a look live (null: back to the URL's or the default). */
export function setLook(name, value) {
  if (value == null) forced.delete(name);
  else forced.set(name, String(value));
}

/** Every look as it would be drawn right now, for the Lab and for reports: { name: option }.
 *  (`def` '0' for every name: a switch whose call site passes another default reads its pick.) */
export function looksNow(names) {
  const o = {};
  for (const n of names) o[n] = lookOf(n);
  return o;
}
