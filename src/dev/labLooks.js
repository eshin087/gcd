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
//  build-time, levels, what it is]
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
  ['floor', ['a', 'b'], 'a', 'a', true, ['ash', 'starless'], 'a broken floor slab (a reload)'],
  // The Skybreak Ring's switches. Each group's rows go directly under its own heading line.
  // --- ring: the set (the arena, its buttes, its light)
  ['ring', ['a', 'b', 'c'], 'a', 'a', true, ['ring'], 'the arena: flats, quarry, crown (a reload)'],
  //
  //
  // --- ring: Tian Lei's body (his outfit, his hair by form)
  ['ascLook', ['a', 'c', 'd'], 'a', 'a', true, ['ring'], 'Tian Lei\'s body: a tunic, c monk, d = a in the dragon look (a reload)'],
  ['ascLift', ['0', 'a'], 'a', 'a', true, ['ring'], 'Tian Lei\'s figure lifted off the floor: 0 as the body shipped (a reload)'],
  //
  // --- ring: Tian Lei's effects (the aura, the beam, the blasts, the transformation)
  ['ascAura', ['a', 'b', 'c'], 'a', 'a', false, ['ring'], 'Tian Lei\'s aura (forms 2 and 3)'],
  ['ascBeam', ['a', 'b'], 'a', 'a', false, ['ring'], 'Tian Lei\'s beam'],
  ['ascOrb', ['a', 'b'], 'a', 'a', false, ['ring'], 'Heaven\'s Lantern, the great orb: a a sun, b a lantern'],
  //
  //
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
