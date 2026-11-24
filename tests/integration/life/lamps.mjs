// The living world's lamps (src/world/life/lamps.js, piece 'answer'): the stone lanterns kindle as the
// fight heats up, gutter under a blow's shock, go dark when the piece that holds them breaks; the Ring's
// braziers gutter and go out. Its scenarios (tests/integration/life.mjs runs them; T is its toolbox).
// Run: node tests/integration/life.mjs . lamps
// The breakables are built here on the toolbox's world (its world mock has none), as world.js builds them.

const KINDLE = 1, LIT = 2, OUT = 3;

/** A level with its breakables, the living world `spec` on; the hero at (hx, hz). */
async function level(T, id, spec = 'all', o = {}) {
  const { Destructibles } = await T.imp('src/world/destructibles.js');
  const { Scars } = await T.imp('src/world/scars.js');
  const w = T.build(id, spec, o);
  w.world.scars = new Scars(w.game, w.set.scarInk);
  const D = new Destructibles(w.game, w.world, w.set);
  w.world.destructibles = D;
  w.D = D;
  w.stepAll = (sec, dt = 1 / 60, each) => {
    for (let t = 0; t < sec - 1e-9; t += dt) {
      w.step(dt, dt);
      D.update(dt);
      each?.();
    }
  };
  w.stepAll(0.5);
  return w;
}

const burning = (L) => L.state === KINDLE || L.state === LIT;
const lit = (Lm) => Lm.list.filter((L) => L.kind === 'lantern' && burning(L)).length;
/** the lamps' lights shining now (intensity > 0) */
const shining = (Lm) => Lm.list.filter((L) => L.light && L.light.intensity > 0).length;

/** Math.random calls made while fn runs. */
function randomIn(fn) {
  const mr = Math.random;
  let n = 0;
  Math.random = () => {
    n++;
    return mr();
  };
  try {
    fn();
  } finally {
    Math.random = mr;
  }
  return n;
}

export default {
  /** Every level's lamps are found: Ashfall's four lanterns, Foxfire's ten, the Grove's two, Cinderwood
   *  none, the Ring's four braziers; and as many burn at the start as its tuning says. */
  async find(T) {
    const want = { ash: [4, 0, 1], fox: [10, 0, 2], grove: [2, 0, 0], cinderwood: [0, 0, 0], ring: [0, 4, 0] };
    for (const [id, [nl, nb, start]] of Object.entries(want)) {
      const w = await level(T, id);
      const Lm = w.life.lamps;
      const lan = Lm.list.filter((L) => L.kind === 'lantern').length, bra = Lm.list.filter((L) => L.kind === 'brazier').length;
      T.assert(lan === nl && bra === nb, `${id}: ${lan} lanterns (${nl}), ${bra} braziers (${nb})`);
      T.assert(lit(Lm) === start, `${id}: ${lit(Lm)} lanterns burn as the visit starts (${start})`);
      if (lan) {
        const L = Lm.list.find((o) => o.kind === 'lantern');
        T.assert(L.y > 0.9 && L.y < 1.4 && L.b?.kind === 'lantern', `${id}: a lantern's flame sits in its window (${L.y.toFixed(2)} m)`);
      }
    }
  },

  /** The fight's start and each new phase light more, the nearest the boss first; by the last phase the
   *  whole ring burns (Ashfall: 1 → 2 → 3 → 4; Foxfire: 2 → 4 → 7 → 10). */
  async phases(T) {
    for (const [id, steps] of [['ash', [1, 2, 3, 4]], ['fox', [2, 4, 7, 10]]]) {
      const w = await level(T, id);
      const Lm = w.life.lamps;
      w.game.dragon.position.set(9, 0, 9);
      T.assert(lit(Lm) === steps[0], `${id}: ${lit(Lm)} burn before the fight (${steps[0]})`);
      w.game.state = 'boss';
      w.stepAll(4);
      const after = lit(Lm);
      T.assert(after === steps[1], `${id}: the fight starts: ${after} burn (${steps[1]})`);
      // the one nearest the boss caught first
      const d = (L) => Math.hypot(L.x - 9, L.z - 9);
      const dark = Lm.list.filter((L) => L.kind === 'lantern' && !burning(L));
      const caught = Lm.list.filter((L) => L.kind === 'lantern' && burning(L));
      const nearestDark = Math.min(...dark.map(d)), nearestLit = Math.min(...caught.map(d));
      T.assert(nearestLit <= nearestDark, `${id}: the nearest the boss caught (${nearestLit.toFixed(1)} m; nearest still dark ${nearestDark.toFixed(1)} m)`);
      w.emit('dragon:phase2', {});
      w.emit('dragon:phase', { n: 2 }); // (the wyrm sends both: once)
      w.stepAll(5);
      T.assert(lit(Lm) === steps[2], `${id}: phase 2: ${lit(Lm)} burn (${steps[2]})`);
      const k0 = Lm.stat.kindled;
      w.emit('dragon:phase3', {});
      let catching = 0;
      w.stepAll(9, 1 / 60, () => { catching = Math.max(catching, Lm.list.filter((L) => L.state === KINDLE).length); });
      T.assert(lit(Lm) === steps[3], `${id}: phase 3: ${lit(Lm)} burn: all (${steps[3]})`);
      T.assert(Lm.stat.kindled - k0 === steps[3] - steps[2] && catching >= 1, `${id}: they caught one after another (${Lm.stat.kindled - k0} kindled, ${catching} at once at most)`);
    }
  },

  /** Fire landing near a dark lantern lights it at once (the Grove's are dark until the fight). */
  async ignite(T) {
    const w = await level(T, 'grove');
    const Lm = w.life.lamps;
    const L = Lm.list.find((o) => o.kind === 'lantern');
    T.assert(L && L.state === 0, 'grove: its lanterns stand dark');
    if (!L) return;
    const far = Lm.list.find((o) => o.kind === 'lantern' && o !== L);
    const gap = Math.hypot(far.x - L.x, far.z - L.z);
    w.world.ignite(L.x + 1.2, L.z + 1.5, 1, 1);
    w.stepAll(0.1);
    T.assert(L.state === KINDLE, `fire 1.9 m off: it catches at once (state ${L.state})`);
    w.stepAll(0.6);
    T.assert(L.state === LIT, `it burns steady in ${Lm.T.ignite.kindle} s (state ${L.state})`);
    T.assert(gap < 5 ? true : far.state === 0, `the other one (${gap.toFixed(1)} m away) did not (state ${far.state})`);
  },

  /** A heavy blow beside a lit lantern: its flame dips, its light dims, and it burns up again within a
   *  second; a light cut far off does nothing. */
  async gutter(T) {
    const w = await level(T, 'ash');
    const Lm = w.life.lamps;
    const L = Lm.list.find((o) => o.state === LIT);
    T.assert(!!L, 'ash: one lantern burns');
    if (!L) return;
    w.place(L.x - 3, L.z - 3);
    w.stepAll(1.2);
    const i0 = L.light?.intensity ?? 0;
    T.assert(i0 > 0.3, `its light shines (${i0.toFixed(2)})`);
    w.world.impact(L.x + 9, L.z + 9, 1, 0.3, { kind: 'cut', by: 'player' });
    T.assert(L.gut === 0, `a light cut 13 m off: no gutter (${L.gut.toFixed(2)})`);
    w.world.impact(L.x + 1.8, L.z - 1, 2, 1.2, { kind: 'blunt', by: 'boss' });
    T.assert(L.gut > 0.4, `a heavy blow 2 m off: it gutters (${L.gut.toFixed(2)})`);
    w.stepAll(1 / 60);
    const i1 = L.light.intensity;
    T.assert(i1 < i0 * 0.85, `its light dims (${i0.toFixed(2)} → ${i1.toFixed(2)})`);
    T.assert(L.gx < 0, `it leans away from the blow (${L.gx.toFixed(2)}, ${L.gz.toFixed(2)})`);
    w.stepAll(0.9);
    T.assert(L.gut === 0 && L.state === LIT, `under a second later it burns as before (gut ${L.gut.toFixed(2)})`);
    T.assert(L.light.intensity > i0 * 0.8, `its light is back (${L.light.intensity.toFixed(2)})`);
  },

  /** A lantern that breaks goes out, its light fades (no pop), and it stays out through every phase and
   *  fire until the fight's reset, which lights the start's again. */
  async out(T) {
    const w = await level(T, 'ash');
    const Lm = w.life.lamps, D = w.D;
    const L = Lm.list.find((o) => o.state === LIT);
    w.place(L.x - 3, L.z - 3);
    w.stepAll(1.2);
    const out0 = Lm.stat.out, puffs0 = Lm.stat.puffs, i0 = L.light.intensity;
    D.strike(L.x, L.z, 0.6, 50, { kind: 'blunt', by: 'boss', dx: 1, dz: 0, y: 1 });
    w.stepAll(1 / 60);
    T.assert(L.b.state !== 0 && L.state === OUT, `struck down (piece ${L.b.state}): it goes out (${L.state})`);
    T.assert(Lm.stat.out === out0 + 1 && Lm.stat.puffs === puffs0 + 1, 'in a puff of smoke');
    const i1 = L.light.intensity;
    T.assert(i1 > 0.05 && i1 < i0, `its light fades, it does not pop (${i0.toFixed(2)} → ${i1.toFixed(2)} the next frame)`);
    w.stepAll(0.8);
    T.assert(!(L.light.intensity > 0), `... and is dark ${0.8} s later (${L.light.intensity})`);
    w.game.state = 'boss';
    w.emit('dragon:phase2', {});
    w.emit('dragon:phase3', {});
    w.world.ignite(L.x, L.z, 2, 1);
    w.stepAll(10);
    T.assert(L.state === OUT, `phases and fire on it: it stays out (${L.state})`);
    T.assert(lit(Lm) === 3, `the three that stand burn (${lit(Lm)})`);
    D.reset();
    w.life.clear('reset');
    w.game.state = 'explore';
    w.stepAll(0.6);
    T.assert(L.b.state === 0 && lit(Lm) === 1, `the reset: every piece stands, the start's one burns (${lit(Lm)})`);
  },

  /** Never more lamp lights than the budget, and a low light gives up its slot by fading. */
  async budget(T) {
    const w = await level(T, 'fox');
    const Lm = w.life.lamps, max = Lm.T.light.max;
    w.place(0, 6);
    Lm.kindle(99, 0, 0, 0);
    let most = 0, low = 0;
    w.stepAll(5, 1 / 60, () => {
      most = Math.max(most, shining(Lm));
      low = Math.max(low, w.game.lights.usedLow);
    });
    T.assert(lit(Lm) === 10, `fox: all ten burn (${lit(Lm)})`);
    T.assert(most === max && low <= max, `at most ${max} lamp lights at once (${most}; ${low} slots)`);
    // walk round the rim: the lights follow the hero and still never exceed the budget
    most = 0;
    w.walk(6, 0);
    w.place(-14, 10);
    w.stepAll(5, 1 / 60, () => { most = Math.max(most, shining(Lm)); });
    w.walk(0, 0);
    T.assert(most <= max, `walking the rim: never more than ${max} (${most})`);
    // the pool full of the fight's lights: the lamps' lights fade out of their slots, they do not pop
    const P = w.game.lights, f = w.game.player.position;
    const big = [];
    for (let i = 0; i < 8; i++) big.push(P.add({ x: f.x + i * 0.3, y: 1, z: f.z, intensity: 3, radius: 8, life: 3 }));
    const held = Lm.list.filter((L) => L.light && L.light.slot > 0);
    let jump = 0;
    const last = held.map((L) => L.light.slot);
    w.stepAll(0.6, 1 / 60, () => {
      held.forEach((L, i) => {
        jump = Math.max(jump, last[i] - L.light.slot);
        last[i] = L.light.slot;
      });
    });
    T.assert(held.length > 0 && P.usedLow === 0, `eight of the fight's lights: the ${held.length} lamps give their slots up (${P.usedLow} left)`);
    T.assert(jump <= 1 / 60 / 0.3 + 1e-6, `each by a fade over 0.3 s, no pop (a share falls ${jump.toFixed(3)} a frame at most)`);
    const shares = Lm.list.filter((L) => L.light).map((L) => L.light.slot);
    T.assert(shares.every((s) => s === 0), 'their slot shares ran down to 0');
    w.stepAll(3.5);
    T.assert(P.usedLow > 0, `the fight's lights gone: they come back (${P.usedLow})`);
  },

  /** The Ring's braziers: a blow beside one makes it gutter; its post knocked over puts it out and its
   *  light dies over a moment, not at once. */
  async brazier(T) {
    const w = await level(T, 'ring');
    const Lm = w.life.lamps, A = w.set.ambience;
    const L = Lm.list.find((o) => o.kind === 'brazier');
    T.assert(!!L && !!L.br && !!L.b, 'ring: a brazier with its post');
    if (!L) return;
    w.place(L.x * 0.7, L.z * 0.7);
    w.stepAll(0.5);
    T.assert(L.state === LIT && L.br.light, `it burns (${L.state})`);
    w.world.impact(L.x - 2 * Math.sign(L.x), L.z, 2, 1.3, { kind: 'blunt', by: 'boss' });
    T.assert(L.br.gut > 0.3, `a heavy blow 2 m off: it gutters (${L.br.gut.toFixed(2)})`);
    w.stepAll(1);
    T.assert(L.br.gut === 0, 'a second later it burns up again');
    const i0 = L.br.light.intensity;
    w.D.topple(L.b, Math.sign(L.x), 0, 'boss');
    w.stepAll(1 / 60);
    T.assert(L.state === OUT, `its post goes over: it goes out (${L.state})`);
    const i1 = L.br.light.intensity;
    T.assert(i1 > 0.1 * i0 && i1 < i0, `its light fades (${i0.toFixed(2)} → ${i1.toFixed(2)}), no pop`);
    w.stepAll(1);
    T.assert(L.br.light.intensity < 0.02, `... and is gone (${L.br.light.intensity.toFixed(3)})`);
    T.assert(typeof A.gutter === 'function', 'the ambience lets it gutter');
  },

  /** The piece off: nothing burns, no light is asked of the pool; on: zero Math.random. */
  async off(T) {
    const w = await level(T, 'fox', 'wind,litter');
    const Lm = w.life.lamps;
    w.game.state = 'boss';
    w.emit('dragon:phase2', {});
    w.world.ignite(0, 14.8, 3, 1);
    w.world.impact(0, 14, 2, 1.5, {});
    w.stepAll(3);
    T.assert(Lm.lit === 0 && Lm.lights === 0, `off: nothing burns (${Lm.lit}), no lamp light (${Lm.lights})`);
    T.assert(!w.game.lights.lights.some((l) => l.low), 'no low light in the pool');
    const v = await level(T, 'fox');
    const n = randomIn(() => {
      v.game.state = 'boss';
      v.emit('dragon:phase2', {});
      v.world.ignite(0, 14.8, 3, 1);
      v.world.impact(0, 14, 2, 1.5, {});
      v.stepAll(4);
      v.life.lamps.douse();
      v.life.lamps.kindle(99, 0, 0);
      v.stepAll(2);
    });
    T.assert(v.counts().random === 0, `on: zero Math.random inside the living world (${v.counts().random})`);
    T.assert(v.life.lamps.stat.blobs > 100, `the flames are heat in the fire field (${v.life.lamps.stat.blobs} blobs)`);
    T.out(`     (the whole sim drew ${n} from Math.random: the set's own atmosphere)`);
  },
};
