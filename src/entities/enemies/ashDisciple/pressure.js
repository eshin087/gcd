// THE NON-STOP PASS (`?pressure=nonstop`; ADR-273). The owner, 2026-11-27, after a Phantom Blade Zero boss film:
// "this is the type of combat i want in our game where its nonstop sword clashes and attacks from the boss. with
// epic moments and combat feel". Piloted on Shen Hui before it spreads to the other sword bosses.
//
// One switch, two values: '0' (today's fight, the default until the owner picks from the films) and 'nonstop'.
// Every number is data, `TUNING.nonstop` (tuning.js); this module only applies it:
//   tuning   a partial TUNING (the same keys, nested): written over TUNING while the switch is on, the values it
//            replaced kept and written back when it goes off. The brain, the director and the footwork read TUNING
//            every frame, so the switch works live (the Lab) as well as by URL.
//   weight   { move: [P1, P2, P3] }: his AI's weight for that move x this (disciple.weigh: the long strings up, the
//            lone blows down).
//   links    { k: [P1, P2, P3], max, pursue: [P1, P2, P3] }: every combo link's chance x k (x pursue for a far / away
//            link: the gap closer back in), never over max.
// Nothing of the shared engine changes: every other boss is untouched with it either way.

import { TUNING, perPhase } from './tuning.js';
import { LINKS } from './links.js';

const IDS = ['0', 'nonstop'];
export const PRESSURE_IDS = IDS;
// today's fight until the owner picks from the films
export const DEFAULT_PRESSURE = '0';
let mode = '0';
const saved = []; // [object, key, original value] in the order written

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (Array.isArray(v) ? v.map(clone) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);

function writeOver(target, over) {
  for (const [k, v] of Object.entries(over)) {
    if (isObj(v) && isObj(target[k])) writeOver(target[k], v);
    else {
      saved.push([target, k, target[k], Object.hasOwn(target, k)]);
      target[k] = clone(v);
    }
  }
}

function restore() {
  for (let i = saved.length - 1; i >= 0; i--) {
    const [o, k, v, had] = saved[i];
    if (had) o[k] = v;
    else delete o[k];
  }
  saved.length = 0;
}

/** '0' (today) or 'nonstop'. */
export const pressureMode = () => mode;
export const nonstopOn = () => mode === 'nonstop';

/** Switch it (the URL at load, the Lab, the tests). False for an unknown value. */
export function setPressureMode(m) {
  m = String(m);
  if (!IDS.includes(m)) return false;
  if (m === mode) return true;
  restore();
  mode = m;
  if (m === 'nonstop' && TUNING.nonstop?.tuning) writeOver(TUNING, TUNING.nonstop.tuning);
  return true;
}

/** His AI's weight for move `name` in `phase` with the switch as it is (w unchanged with it off). */
export function pressureWeight(name, w, phase) {
  if (!nonstopOn()) return w;
  const k = TUNING.nonstop?.weight?.[name];
  return k == null ? w : w * perPhase(k, phase);
}

// the links with every chance scaled (built once: the table is data and does not change)
let scaled = null;
function scaleLinks() {
  const L = TUNING.nonstop?.links ?? {};
  const max = L.max ?? 0.9;
  const per = (c, k) => (Array.isArray(c) ? c.map((x, i) => (x > 0 ? Math.min(max, x * perPhase(k, i + 1)) : x)) : c > 0 ? Math.min(max, c * perPhase(k, 1)) : c);
  const out = {};
  for (const [from, list] of Object.entries(LINKS)) {
    out[from] = list.map((e) => ({ ...e, chance: per(e.chance ?? 1, e.when === 'far' || e.when === 'away' ? (L.pursue ?? L.k ?? 1) : (L.k ?? 1)) }));
  }
  return out;
}

/** His combo links with the switch as it is (links.js's own table with it off). */
export function pressureLinks() {
  if (!nonstopOn()) return LINKS;
  return (scaled ??= scaleLinks());
}

{
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('pressure') : null;
  setPressureMode(q && IDS.includes(q) ? q : DEFAULT_PRESSURE);
}
