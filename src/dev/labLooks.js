import { lookOf, setLook, allOld, pickedOf } from '../entities/enemies/duelist/lookSwitch.js';
import { el, button, setClass } from './labDom.js';

// The Lab's LOOKS section: every look switch of the duelists' second pass (duelist/lookSwitch.js),
// so the owner can flip each option on a phone and judge it in the fight. A switch read at draw time
// changes live (setLook); one read when the level or his rig is built (`build`) reloads the page with
// its URL parameter. "as shipped" = no look parameter at all = the owner's picks (lookSwitch PICKED);
// "before this pass" = `?looks=old` (every redraw as `main` drew it before the second pass; a new
// thing keeps its pick). The option each switch ships with is marked `*`.
//
// [name, options, the call site's default (`def`: '0' = a redraw), pick (what ?looks=new showed),
//  build-time, levels, what it is, 'awaiting' (no pick yet: the default draws; duel.mjs knows)]
export const LOOK_SWITCHES = Object.freeze([
  ['kindle', ['a', 'b', 'c'], 'a', 'a', false, ['ash'], 'the Kindling (phase 2)'],
  ['ashp3', ['a', 'b', 'c'], 'a', 'a', false, ['ash'], 'the third phase\'s change'],
  ['qi', ['0', 'a', 'b', 'c'], '0', 'a', false, ['ash', 'starless'], 'sword qi / crescents'],
  ['flit', ['0', 'a'], '0', 'a', false, ['ash'], 'the flit'],
  ['burn', ['a', 'b'], 'a', 'a', false, ['ash'], 'burning ground'],
  ['toll', ['0', 'a', 'b'], '0', 'a', false, ['ash'], 'the bell\'s rings'],
  ['ashLook', ['0', 'a', 'b', 'c'], '0', 'b', true, ['ash'], 'Shen Hui\'s body (a reload)'],
  ['star', ['0', 'a', 'b'], '0', 'a', false, ['starless'], 'the Dark Star'],
  ['sky', ['0', 'a', 'b'], '0', 'a', false, ['starless'], 'a strike of the Starless Sky'],
  ['ignite', ['0', 'a', 'b'], '0', 'a', false, ['starless'], 'a form\'s ignition'],
  ['void', ['0', 'a'], '0', 'a', false, ['starless'], 'the smaller spells'],
  ['presence', ['0', 'a'], 'a', 'a', false, ['starless'], 'forms 2 and 3: a quiet presence'],
  ['great', ['a', 'b', 'c'], 'a', 'a', false, ['starless'], 'Starless Night\'s waves'],
  ['lordLook', ['0', 'a', 'b', 'c'], '0', 'b', true, ['starless'], 'Varr Nihil\'s body (a reload)'],
  ['outskirts', ['0', 'a', 'b', 'c', 'm'], '0', 'c', true, ['starless'], 'round the crater: 0 felled trees, a shrine, b star debris, c challengers, m all (a reload)'],
  ['floor', ['a', 'b'], 'a', 'a', true, ['ash', 'starless'], 'a broken floor slab (a reload)'],
  // The Skybreak Ring's switches. Each group's rows go directly under its own heading line.
  // --- ring: the set (the arena, its buttes, its light)
  ['ring', ['a', 'b', 'c'], 'a', 'a', true, ['ring'], 'the arena: flats, quarry, crown (a reload)'],
  //
  //
  // --- ring: Tian Lei's body (his outfit, his hair by form)
  ['ascLook', ['a', 'c', 'd', 'h', 'g', 'v', 'e', 'r', 'w'], 'a', 'e', true, ['ring'], 'Tian Lei\'s body: a tunic, c monk, d = a in the dragon look; homages h orange gi, g purple gi, v blue suit; the gi with wraps e ember, r crimson, w bone (a reload)'],
  ['ascLetters', ['0', 'a'], '0', 'a', false, ['ring'], 'Tian Lei\'s letters: 0 the bosses\' fine cell, a they follow his size as the hero\'s do'],
  ['ascHair', ['0', 'a', 'b'], '0', 'b', true, ['ring'], 'Tian Lei\'s gold hair (forms 2 - 3): 0 the tall crown, a a short crown, b his own hair risen (a reload)'],
  ['ascLift', ['0', 'a', 'b'], 'a', 'b', true, ['ring'], 'Tian Lei\'s print: 0 as the body shipped, a lifted off the floor, b the hero\'s quieter print (a reload)'],
  //
  // --- ring: Tian Lei's effects (the aura, the beam, the blasts, the transformation)
  ['ascAura', ['a', 'b', 'c'], 'a', 'a', false, ['ring'], 'Tian Lei\'s aura (forms 2 and 3)'],
  ['ascBeam', ['a', 'b'], 'a', 'a', false, ['ring'], 'Tian Lei\'s beam'],
  ['ascOrb', ['a', 'b', 'c'], 'a', 'a', false, ['ring'], 'Heaven\'s Lantern, the great orb: a a sun, b a lantern, c the pale gathered sphere (its arms-up gather on a reload)'],
  ['ascBeamPose', ['0', 'cup'], '0', '0', true, ['ring'], 'Tian Lei\'s beams: 0 the palm thrust, cup both hands cupped at the hip (a reload)'],
  //
  //
  // --- fox: Wen Yao (ADR-147; every one read when his rigs or his effects are built: a reload)
  ['foxLook', ['a', 'b', 'c', 'd', 'h1', 'h2', 'h3'], 'h1', 'h1', true, ['fox'], 'Wen Yao\'s body: ink-line like the hero, h1 the wild fox (the default: amber jacket, vermilion scarf), h2 vermilion jacket and black scarf, h3 a long pale coat; through the art path a shrine fox, b wild fox, c pelt brawler; d = a in ink-line (a reload)'],
  ['foxLetters', ['a', 'b'], 'b', 'b', false, ['fox'], 'Wen Yao\'s letters: a a fixed cell (as the other bosses), b they follow his size on screen as the hero\'s do (the default; read every frame: live)'],
  ['foxfire', ['a', 'b', 'c'], 'c', 'c', true, ['fox'], "the Pearl's colour: a jade, b the wyrm's orange, c pale blue-white (the default; a reload)"],
  ['clones', ['a', 'b'], 'a', 'a', true, ['fox'], 'the paper selves: a as him, b a step paler (a reload)'],
  ['foxFire3', ['a', 'b'], 'a', 'a', true, ['fox'], 'phase 3\'s fire (the mantle, the Nine-Tailed Fox, its beam): a the wyrm\'s orange-red, b jade (a reload)'],
  ['foxSpirit', ['a', 'b'], 'a', 'a', true, ['fox'], 'the Nine-Tailed Fox: a a body in the wyrm\'s letters wreathed in fire, b fire and ink lines only (a reload)'],
  // --- grove: the Windless Grove and the Sheathed (ADR-145; the owner's picks, 2026-11-22: a / a / a)
  ['grove', ['a', 'b', 'c'], 'a', 'a', true, ['grove'], 'the grove: a moonlit mist, b grey dawn, c first snow (a reload)'],
  ['sheathLook', ['a', 'b', 'c', 'd'], 'a', 'a', true, ['grove'], 'Lu Wusheng\'s body: a mourning white, b reed cloak, c one sleeve, d the wanderer (a reload)'],
  ['drawCut', ['a', 'b'], 'a', 'a', false, ['grove'], 'the draw\'s cut: a one white line, b with an afterimage'],
  // --- code: the Hall of Falling Script and Xin Yi (ADR-156, ADR-157; pending: the owner picks from the sheets)
  ['oneLook', ['a', 'b', 'c'], 'a', 'a', true, ['code'], 'Xin Yi\'s body: a the long coat, b the cassock, c the grey coat (a reload)'],
  ['hall', ['a', 'b'], 'a', 'a', true, ['code'], 'the hall: a pale marble, green-black inlay; b dark basalt, jade-lit edges (a reload)'],
  ['script', ['a', 'b', 'c'], 'a', 'a', true, ['code'], 'the script wave: a a shimmer and the full turn, b nothing until the Source, c strong from the start (a reload)'],
  // --- code: Xin Yi more like the hero (ADR-170; pending: the owner picks from the sheets)
  ['oneLetters', ['0', 'a'], '0', 'a', false, ['code'], 'Xin Yi\'s letters: 0 the bosses\' fine cell, a they follow his size as the hero\'s do (the default; live)'],
  ['onePrint', ['0', 'a', 'b'], '0', 'a', true, ['code'], 'Xin Yi\'s print: 0 the lifted print and the shapes he shipped with; a the hero\'s quiet print, simpler shapes, a coat that stirs from phase 1 (the default); b a, and one letter size bolder on a small screen (a reload)'],
  // --- code: Xin Yi rebuilt (ADR-221; awaiting: the owner picks from the sheets and films)
  ['oneBody', ['0', 'a', 'b', 'c'], '0', 'b', true, ['code'], 'Xin Yi\'s figure: 0 as shipped; printed like the hero on a man\'s build: a the long coat closed in phase 1, b the coat open in every phase (the owner\'s pick, the default), c a duster to mid-shin (a reload)'],
  ['oneMoves', ['0', 'a'], '0', 'a', false, ['code'], 'Xin Yi\'s moves: 0 as shipped; a the guns aimed down the arm, every blue / red blow held in its windup pose before the snap, two fast strings (live)', 'awaiting'],
  // --- grove: Lu Wusheng readable (ADR-152): the palette picked; the print's five steps and the mark wait for the owner
  ['sheathArt', ['0', '1', '2', '3', 'a'], '0', 'a', true, ['grove'], 'Lu Wusheng\'s print, five steps: 0 the wyrm\'s digits as shipped, 1 digits in his colours, 2 digits lit and outlined, 3 ink-line flattened, a the hero\'s ink-line art (the default since ADR-194; a reload)'],
  ['sheathTone', ['a', 'b', 'c'], 'a', 'a', true, ['grove'], 'the Wanderer\'s palette: a indigo and sand, b pale and cold, c moss and rust (a reload)'],
  ['sheathMark', ['a', 'b', '0'], 'a', 'a', true, ['grove'], 'his mark: a a torn strip on the scabbard, b a white streak in the hair, 0 none (a reload)', 'awaiting'],
  // --- city: Halcyon Plaza and Halcyon (ADR-161; every one waits for the owner, read when built: a reload)
  ['halLook', ['a', 'b', 'c'], 'a', 'a', true, ['city'], 'Halcyon\'s body: a blue suit and red cape, b the idol, c tomorrow\'s tyrant (a reload)'],
  ['halCape', ['0', '1', '2', '3'], '3', '3', true, ['city'], 'his cape and colours at game size: 0 as first built, 1 brighter, 2 + a wide flared cape, 3 + its billow and a long trail (a reload)'],
  ['halLetters', ['0', 'a'], 'a', 'a', false, ['city'], 'his letters: a follow his size as the hero\'s do, 0 the bosses\' fixed fine cell'],
  ['halPrint', ['0', 'a', 'b'], 'a', 'a', true, ['city'], 'his print: 0 the lit step-3 figure, a the hero\'s quieter print, b between (a reload)'],
  ['halCapeSize', ['0', 'a', 'b', 'c'], 'b', 'b', true, ['city'], 'his cape\'s size: 0 as picked, a ~80 %, b ~65 %, c ~50 % (to the back of his knees) (a reload)'],
  ['glare', ['a', 'b', 'c'], 'a', 'a', true, ['city'], 'his eyes\' heat: a crimson, white core; b crimson alone; c orange fire (a reload)'],
  ['city', ['a', 'b', 'c'], 'a', 'a', true, ['city'], 'the city: a neon rain, b golden hour, c lockdown (a reload)'],
  // --- every human boss (ADR-194)
  ['bossPrint', ['0', 'a', 'b'], '0', 'b', false, ['ash', 'starless', 'ring', 'fox', 'grove', 'code', 'city'], 'the bosses printed the hero\'s way: b in their own colours (the default), a in the hero\'s greys, 0 as before (lit letter bodies, his strokes and dotted rims, the pale hem below the knee)'],
  // --- the title (ADR-196)
  ['menu', ['0', 'a', 'b', 'c'], '0', 'c', true, ['cinderwood', 'ash', 'starless', 'ring', 'fox', 'grove', 'code', 'city'], 'the title: c the sword\'s path (the default), a the world list, b the campfire grid, 0 the title before (a reload)'],
]);

const NAMES = LOOK_SWITCHES.map((s) => s[0]);

/** The option drawn now for switch row `s`. */
const now = (s) => lookOf(s[0], s[2], s[3]);

/** Reload with the look parameters changed (`set`: name → value, null removes). */
function reloadWith(set, clearAll = false) {
  try {
    const u = new URL(globalThis.location.href);
    if (clearAll) {
      u.searchParams.delete('looks');
      for (const n of NAMES) u.searchParams.delete(n);
    }
    for (const [k, v] of Object.entries(set)) {
      if (v == null) u.searchParams.delete(k);
      else u.searchParams.set(k, v);
    }
    u.searchParams.set('lab', ''); // (the Lab opens again after the reload)
    globalThis.location.assign(u.toString());
  } catch (err) {
    console.error('[lab] looks reload failed', err);
  }
}

/** Build the section's rows into `body` for level `levelId`; returns a sync() that marks the options drawn now. */
export function buildLooks(body, levelId, status) {
  const rows = LOOK_SWITCHES.filter((s) => s[5].includes(levelId));
  if (!rows.length) return null;
  const btns = [];
  const top = el('div', 'lab-grid c2', null, body);
  button(top, 'as shipped', () => reloadWith({}, true)).title = 'every look as it ships: the owner\'s picks (no look parameter; a reload)';
  button(top, 'before this pass', () => reloadWith({ looks: 'old' }, true)).title = 'every redraw as it was before the duelists\' second pass (?looks=old; a new thing keeps its pick; a reload)';
  for (const s of rows) {
    const [name, opts, , , build, , what] = s;
    const shipped = pickedOf(name);
    const row = el('div', 'lab-row', null, body);
    const lbl = el('span', 'lab-lbl', name, row);
    lbl.title = `${what} (?${name}=)`;
    if (lbl.style) lbl.style.minWidth = '50px';
    const grid = el('div', `lab-grid c${Math.max(2, opts.length)}`, null, row);
    if (grid.style) grid.style.flex = '1';
    for (const v of opts) {
      const b = button(grid, `${v === '0' ? 'old' : v}${v === shipped ? '*' : ''}`, () => {
        if (build) {
          reloadWith({ [name]: v });
          return;
        }
        setLook(name, v);
        status?.(`look ${name} = ${v}`);
        sync();
      });
      b.title = `${what}: ${v === '0' ? 'as it was before this pass' : `option ${v}`}${v === shipped ? ' (as shipped: the owner\'s pick)' : ''}${build ? ' (a reload)' : ''}`;
      btns.push({ s, v, el: b });
    }
  }
  el('div', 'lab-note', `${allOld() ? 'showing the looks before this pass (?looks=old) · ' : ''}* = as shipped (the owner's pick) · old = before this pass · body / floor: a reload`, body);
  const sync = () => {
    for (const B of btns) setClass(B.el, 'on', now(B.s) === B.v);
  };
  sync();
  return sync;
}
