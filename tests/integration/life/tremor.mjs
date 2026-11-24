// The living world's tremor (src/world/life/tremor.js, piece 'answer'): a heavy blow shakes what stands
// near it. Its scenarios (tests/integration/life.mjs runs them; T is its toolbox).
// Run: node tests/integration/life.mjs . tremor
// The breakables are built here on the toolbox's world (its world mock has none), as world.js builds them.

const AIR = 1;

/** A level with its breakables, the living world `spec` on; the hero at (hx, hz). */
async function level(T, id, spec = 'all', hx = 0, hz = 20) {
  const { Destructibles } = await T.imp('src/world/destructibles.js');
  const { Scars } = await T.imp('src/world/scars.js');
  const w = T.build(id, spec);
  w.world.scars = new Scars(w.game, w.set.scarInk);
  const D = new Destructibles(w.game, w.world, w.set);
  w.world.destructibles = D;
  w.D = D;
  w.place(hx, hz);
  w.stepAll = (sec, dt = 1 / 60) => {
    for (let t = 0; t < sec - 1e-9; t += dt) {
      w.step(dt, dt);
      D.update(dt);
    }
  };
  w.stepAll(1);
  return w;
}

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

/** The nearest piece to (x, z) that `ok` takes. */
function nearestOf(D, x, z, ok) {
  let best = null, bd = Infinity;
  for (const b of D.list) {
    if (b.state !== 0 || !ok(b)) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Letters of the litter in the air now. */
const airborne = (L) => (L.leaves ?? []).filter((f) => f.s === AIR);

export default {
  /** A heavy blow beside a tree: it shudders and keeps every bit of its structure, its own leaves come
   *  down from within its crown, and it is still again within a second. */
  async tree(T) {
    const w = await level(T, 'cinderwood', 'all', 0, 18);
    const D = w.D, Tr = w.life.tremor, L = w.life.litter;
    const tree = nearestOf(D, 0, 0, (b) => b.kind === 'tree' && b.leafy > 0 && b.ranged && Math.hypot(b.x, b.z) < 26);
    T.assert(!!tree, `cinderwood: a leafy tree near the clearing (${tree ? `${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}` : 'none'})`);
    if (!tree) return;
    // (the hero stands off: nothing is kept off his head here)
    w.place(tree.x + 9, tree.z + 9);
    w.stepAll(0.5);
    const air0 = new Set(airborne(L));
    const hp0 = tree.hp, bricks0 = tree.body?.nBit ?? 0;
    const ux = -tree.x / Math.hypot(tree.x, tree.z), uz = -tree.z / Math.hypot(tree.x, tree.z);
    const bx = tree.x + ux * 3, bz = tree.z + uz * 3;
    let reach = 0;
    const rnd = randomIn(() => {
      w.world.impact(bx, bz, 2, 1.4, { kind: 'blunt', by: 'boss' });
      reach = Tr.stat.reach;
    });
    T.assert(Tr.stat.shakes === 1 && reach > 5, `a heavy blow (power 1.4) shakes once, out to ${reach.toFixed(1)} m`);
    T.assert(tree.shake > 0 && tree.shakeAmp > 0, `the tree 3 m from it shudders (amp ${tree.shakeAmp.toFixed(3)} rad)`);
    T.assert(tree.hp === hp0 && (tree.body?.nBit ?? 0) === bricks0, `... and loses nothing (hp ${tree.hp} of ${hp0}, bricks gone ${tree.body?.nBit ?? 0})`);
    const fresh = airborne(L).filter((f) => !air0.has(f));
    const C = Tr._crownOf(tree, Tr.T.tree);
    const inCrown = fresh.filter((f) => Math.hypot(f.x - C.x, f.z - C.z) <= C.r + 0.3 && f.y >= C.y0 - 0.3 && f.y <= C.y1 + 0.3);
    T.assert(fresh.length >= 4 && inCrown.length === fresh.length, `its leaves come down from its crown: ${fresh.length} new letters in the air, ${inCrown.length} inside the crown (r ${C.r.toFixed(1)} m, ${C.y0.toFixed(1)} - ${C.y1.toFixed(1)} m up)`);
    T.assert(rnd === 0, `the shake draws nothing from Math.random (${rnd})`);
    let still = -1;
    for (let t = 0; t < 1.2; t += 1 / 60) {
      w.stepAll(1 / 60);
      if (still < 0 && !(tree.shake > 0)) still = t;
    }
    T.assert(still >= 0 && still < 1, `it is still again after ${still.toFixed(2)} s (under 1 s)`);
    const q = tree.pivot.quaternion;
    T.assert(Math.abs(q.x) + Math.abs(q.z) < 1e-6, `... and stands upright where it stood (pivot ${q.x.toFixed(4)}, ${q.z.toFixed(4)})`);
  },

  /** A light blow does nothing; a heavy blow far away does nothing to a tree out of its reach. */
  async light(T) {
    const w = await level(T, 'cinderwood', 'all', 0, 18);
    const D = w.D, Tr = w.life.tremor;
    const tree = nearestOf(D, 0, 0, (b) => b.kind === 'tree' && b.leafy > 0 && Math.hypot(b.x, b.z) < 26);
    const leaves0 = w.life.litter.count;
    w.world.impact(tree.x + 1.5, tree.z, 1, 0.3, { kind: 'cut', by: 'player' });
    T.assert(Tr.stat.shakes === 0 && !(tree.shake > 0) && w.life.litter.count === leaves0, `a light cut (power 0.3) beside a tree: no shake (${Tr.stat.shakes}), no shudder, no leaves`);
    // far: a heavy blow on the far side of the clearing from it
    const fx = -tree.x * 0.2, fz = -tree.z * 0.2;
    const d = Math.hypot(tree.x - fx, tree.z - fz) - tree.r;
    w.world.impact(fx, fz, 1.5, 1.1, { kind: 'blunt', by: 'boss' });
    T.assert(Tr.stat.shakes === 1 && Tr.stat.reach < d && !(tree.shake > 0), `a heavy blow ${d.toFixed(1)} m away (reach ${Tr.stat.reach.toFixed(1)} m) leaves the tree alone`);
  },

  /** One blow that arrives twice (world.impact and world.groundBlow) shakes once; a beam calling impact
   *  every 0.2 s on one spot is one shake every so often, not five a second. */
  async merge(T) {
    const w = await level(T, 'cinderwood', 'all', 0, 18);
    const Tr = w.life.tremor;
    w.world.impact(2, 2, 2, 1.2, { kind: 'blunt', by: 'boss' });
    w.world.groundBlow(2.2, 2, { kind: 'slam', power: 1.2, r: 2, by: 'boss' });
    T.assert(Tr.stat.shakes === 1 && Tr.stat.merged === 1, `impact + groundBlow of one slam: ${Tr.stat.shakes} shake (${Tr.stat.merged} merged)`);
    const s0 = Tr.stat.shakes;
    for (let i = 0; i < 25; i++) {
      w.world.impact(-4 + i * 0.05, 3, 0.8, 1.6, { kind: 'blast', by: 'boss' });
      w.stepAll(0.2);
    }
    const n = Tr.stat.shakes - s0;
    T.assert(n >= 1 && n <= 25 * 0.2 / 0.25 + 1, `a beam burning one spot for 5 s: ${n} shakes (at most one per merge window)`);
  },

  /** What hangs swings: a banner's kick spikes after a blow near it and is gone within 2 s. */
  async banner(T) {
    const { hangKickAt, hangLean } = await T.imp('src/world/hang.js');
    const w = await level(T, 'ring', 'all', 0, 10);
    const ban = w.D.list.filter((b) => b.hang);
    T.assert(ban.length > 0 && !!w.U.uHangKick, `ring: ${ban.length} banners, the kick uniform made with their material`);
    const b = ban[0];
    const o = { x: 0, z: 0 }, v = { x: 0, y: 0, z: 0 };
    const k0 = hangKickAt(w.U, b.x, b.z, o);
    w.world.impact(b.x + 3, b.z + 2, 2, 1.3, { kind: 'blunt', by: 'boss' });
    T.assert(w.life.tremor.stat.kicks === 1, 'a heavy blow 3.6 m away kicks what hangs');
    let peak = 0, at = 0, out = 0;
    for (let t = 0; t < 2.4; t += 1 / 60) {
      w.stepAll(1 / 60);
      const k = hangKickAt(w.U, b.x, b.z, o);
      if (k > peak) {
        peak = k;
        at = t;
      }
      if (t > 2 - 1e-6 && t < 2 + 1 / 60) out = k;
    }
    const lean = hangLean(w.U, b.x, b.z, b.hang.give, v);
    T.assert(k0 === 0 && peak > 0.12, `the banner's swing spikes to ${((peak * 180) / Math.PI).toFixed(1)} deg ${at.toFixed(2)} s after the blow`);
    T.assert(out < peak * 0.08 && out < 0.02, `... and is back within 2 s (${((out * 180) / Math.PI).toFixed(2)} deg left)`);
    T.assert([lean.x, lean.y, lean.z].every(Number.isFinite), 'the CPU mirror of the lean (bites) stays finite');
  },

  /** Dust sifts only off standing stone within the reach, falls straight down, and is gone soon. */
  async dust(T) {
    const w = await level(T, 'ash', 'all', 0, 12);
    const D = w.D, Tr = w.life.tremor;
    const tall = (b) => b.mat === 'stone' && b.kind !== 'boulder' && b.h >= Tr.T.stone.minH && b.hpMax !== Infinity && !b.floor;
    const p = nearestOf(D, 0, 0, tall);
    T.assert(!!p, `ash: a tall standing stone (${p?.kind} ${p?.h.toFixed(1)} m)`);
    w.world.impact(p.x + p.r + 1.5, p.z, 2, 1.3, { kind: 'blunt', by: 'boss' });
    T.assert(Tr.stat.stones >= 1 && Tr.stat.dust > 0, `a heavy blow beside it: dust off ${Tr.stat.stones} stone(s), ${Tr.stat.dust} letters`);
    const B = Tr._b, standing = D.list.filter((b) => b.state === 0 && tall(b));
    let off = 0, falling = 0;
    for (let i = 0; i < B.np; i++) {
      const k = i * 20, x = B.p[k], z = B.p[k + 2], vy = B.p[k + 4];
      const near = standing.some((s) => Math.hypot(x - s.x, z - s.z) < s.r * 1.4 + 0.4);
      if (!near) off++;
      if (vy <= 0 || Math.hypot(B.p[k + 3], B.p[k + 5]) > 0.3) falling++;
    }
    T.assert(off === 0, `every dust letter is at a standing stone (${B.np - off} of ${B.np})`);
    w.stepAll(3);
    T.assert(Tr._b.np === 0, `the sift is over in 3 s (${Tr._b.np} letters left)`);
    // a heavy blow with no tall stone in its reach: no dust
    const d0 = Tr.stat.dust;
    let far = null;
    for (let i = 0; i < 40 && !far; i++) {
      const a = i * 0.7, r = 3 + i * 0.3, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (standing.every((s) => Math.hypot(s.x - x, s.z - z) - s.r > 7)) far = { x, z };
    }
    if (far) {
      w.stepAll(0.5);
      w.world.impact(far.x, far.z, 1, 1, { kind: 'blunt', by: 'boss' });
      T.assert(Tr.stat.dust === d0, `a blow at (${far.x.toFixed(1)}, ${far.z.toFixed(1)}), no stone within its reach (${Tr.stat.reach.toFixed(1)} m): no dust`);
    }
  },

  /** Pebbles hop round a heavy blow and settle; nothing lands on the hero. */
  async floor(T) {
    const w = await level(T, 'cinderwood', 'all', 0, 18);
    const Tr = w.life.tremor, H = w.life.hero;
    w.world.impact(0, 8, 2, 1.5, { kind: 'blunt', by: 'boss' });
    T.assert(Tr.stat.pebbles >= 6, `a heavy blow: ${Tr.stat.pebbles} pebbles hop`);
    let top = 0;
    for (let t = 0; t < 0.6; t += 1 / 60) {
      w.stepAll(1 / 60);
      for (const e of Tr._peb) if (e.on) top = Math.max(top, e.y - e.gy);
    }
    T.assert(top > 0.05 && top < 0.4, `they jump a hand's height (${(top * 100).toFixed(0)} cm at most)`);
    T.assert(Tr._peb.every((e) => !e.on || Math.hypot(e.x - H.x, e.z - H.z) > 0.6), 'none is on the hero');
    w.stepAll(1.6);
    T.assert(Tr._peb.every((e) => !e.on), 'and they have settled and gone within ~2 s');
  },

  /** The Grove: the canes shiver and the leaves they drop fall straight down (no wind there). */
  async grove(T) {
    const w = await level(T, 'grove', 'all', 0, 10);
    const D = w.D, Tr = w.life.tremor, L = w.life.litter;
    const cane = nearestOf(D, 0, 0, (b) => b.kind === 'bamboo' && b.leafy > 0);
    T.assert(!!cane, 'grove: a bamboo cane');
    w.place(cane.x + 8, cane.z + 8);
    w.stepAll(0.5);
    const air0 = new Set(airborne(L));
    w.world.impact(cane.x + 2, cane.z, 1.5, 1.4, { kind: 'blunt', by: 'boss' });
    T.assert(Tr.stat.canes >= 1, `the canes near the blow shiver (${Tr.stat.canes})`);
    const fresh = airborne(L).filter((f) => !air0.has(f)).map((f) => ({ f, x: f.x, z: f.z }));
    T.assert(fresh.length >= 1, `a few leaves drop (${fresh.length})`);
    w.stepAll(2);
    const drift = fresh.reduce((s, o) => s + Math.hypot(o.f.x - o.x, o.f.z - o.z), 0) / Math.max(1, fresh.length);
    T.assert(drift < 0.5, `... straight down: ${drift.toFixed(2)} m of drift each on average in 2 s`);
  },

  /** The reset empties it; with the piece off nothing at all. */
  async clear(T) {
    const w = await level(T, 'cinderwood', 'all', 0, 18);
    const Tr = w.life.tremor;
    w.world.impact(0, 6, 2, 1.6, { kind: 'blunt', by: 'boss' });
    w.stepAll(0.1);
    T.assert(Tr.count > 0, `after a heavy blow the tremor has letters in the air (${Tr.count})`);
    w.life.clear('reset');
    w.stepAll(1 / 60);
    T.assert(Tr.count === 0 && Tr._b.count === 0, `clear('reset') empties it (${Tr.count})`);
    const o = await level(T, 'cinderwood', 'wind,litter', 0, 18);
    o.world.impact(0, 6, 2, 1.6, { kind: 'blunt', by: 'boss' });
    o.stepAll(0.2);
    T.assert(o.life.tremor.stat.shakes === 0 && o.life.tremor._b === undefined, 'the piece off: no shake, no batch');
  },
};
