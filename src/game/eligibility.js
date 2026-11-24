// Whether a run counts (ADR-179): a run is saved as a record only if it was played as the game ships.
// One per page load (game.eligibility); once void it stays void for the page (and for a rush, the whole
// rush: rush.void). The record screen says why in one short line; nothing is stored.
//
// What voids a run:
//   the Lab        opened (F1 / `?lab` / its badge), or any of its controls used (they need it open)
//   a cheat        the hero's god mode, endless flasks or attack-speed slider; the Lab's time scale
//                  (game.debugTimeScale) other than 1; a boss's AI switched off (debug.setAI)
//   dev aids       window.__tick (steps the sim by hand) and flow.debug.toState (jumps a state)
//   the URL        `?stage=lab` (the training room), `?tech=` (a technique without its kill), and every
//                  switch that changes gameplay rather than looks: GAMEPLAY_SWITCHES below (the ADR lists
//                  them, and the look switches that do NOT void a run)
//
//   const E = new Eligibility(location.search)   E.void(reason)   E.eligible   E.reason   E.note()
//   E.watch(game)  per frame: notices a cheat switched on from anywhere (the console too)

/** URL switches that change how the fight plays (2026-11-23, read from the code: the ADR lists them
 *  and the look switches that do not void). Each: [name, why, values that do NOT void (the shipped
 *  value written out; none: any value voids)]. Case as the game reads them. */
export const GAMEPLAY_SWITCHES = Object.freeze([
  ['stage', 'the training room', []],
  ['tech', 'a technique forced on or off', []],
  ['lab', 'the Lab', []],
  ['training', 'the Training panel', []],
  ['cutStop', 'the blade stops on what it hits', ['0']],
  ['apoc', "the wyrm's meteor rain re-paced", ['a']],
  ['ring', 'another Skybreak arena', ['a']],
  ['bamboo', "another grove's breakable bamboo", ['a']],
  ['outskirts', "the Throne's outskirts and their colliders", ['c']],
  ['looks', 'every redraw as before (the outskirts go)', ['new']],
  ['wyrmLook', "the wyrm's neck carried differently", ['c']],
  ['wyrmlook', "the wyrm's neck carried differently", ['c']],
  ['ablaze', "the wyrm's fire lights the cover", ['b']],
  ['perfect', "the perfect defence's slow motion", ['sharp']],
  ['streakfx', "the flurry's pacing (storm)", ['all']],
]);

/** The short line the record screen shows for a void run's reason. */
const NOTE = {
  lab: 'the Lab was used',
  god: 'god mode was on',
  flasks: 'endless flasks were on',
  speed: 'the attack speed was changed',
  timescale: 'the time scale was changed',
  ai: "the boss's AI was switched off",
  tick: 'the game was stepped by hand',
  state: 'the Lab jumped the fight',
  url: 'a gameplay switch is in the address',
};

const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The gameplay switches a query string carries: [[name, why], ...]. */
export function gameplaySwitches(search) {
  let q = null;
  try {
    q = new URLSearchParams(search ?? '');
  } catch {
    return [];
  }
  return GAMEPLAY_SWITCHES.filter(([name, , ok]) => q.has(name) && !ok.includes(q.get(name)));
}

export class Eligibility {
  constructor(search = globalThis.location?.search ?? '') {
    this.reasons = [];
    for (const [name] of gameplaySwitches(search)) this.void('url', name);
    this.onVoid = null; // (reason) → the rush hears it
  }

  /** The run stops counting: `reason` one of NOTE's keys; `detail` (a switch's name) for the line. */
  void(reason, detail = null) {
    const r = String(reason || 'lab');
    if (this.reasons.some((x) => x.reason === r && x.detail === detail)) return;
    this.reasons.push({ reason: r, detail });
    try {
      this.onVoid?.(r);
    } catch {
      // a listener must not stop the void
    }
  }

  get eligible() {
    return this.reasons.length === 0;
  }

  /** The first reason (or null). */
  get reason() {
    return this.reasons[0]?.reason ?? null;
  }

  /** The record screen's line for a void run: 'NOT RECORDED: the Lab was used'; null when it counts. */
  note(extra = null) {
    const first = this.reasons[0];
    const r = first?.reason ?? extra;
    if (!r) return null;
    const why = NOTE[r] ?? r;
    return `NOT RECORDED: ${why}${first?.detail ? ` (?${first.detail})` : ''}`;
  }

  /** Per frame: a cheat switched on from anywhere (the Lab, the console) voids the run. Cheap. */
  watch(game) {
    if (!game) return;
    const d = game.player?.debug;
    if (d && typeof d === 'object') {
      if (d.god) this.void('god');
      if (d.infiniteFlasks) this.void('flasks');
      if (d.attackSpeed !== undefined && fin(d.attackSpeed, 1) !== 1) this.void('speed');
    }
    if (fin(game.debugTimeScale, 1) !== 1) this.void('timescale');
    if (game.lab?.open) this.void('lab');
    const bd = game.dragon?.debug;
    if (bd && typeof bd === 'object' && bd.aiEnabled === false) this.void('ai');
  }
}
