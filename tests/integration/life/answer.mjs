// The living world's 'answer' piece: its scenarios (tests/integration/life.mjs runs them; T is its toolbox).
// One scenario per rule the piece must keep. Run: node tests/integration/life.mjs . answer
// The other layers are spied on (wind.front, creatures.startle, litter.scatter, life.hushFor): the
// answer is the world's reaction, and these calls are what it promises the others.

/** Spies on what the answer calls; returns the call lists. */
function spy(w) {
  const L = w.life, c = { front: [], startle: [], scatter: [], hush: [], burst: [] };
  // (the wind's own schedule calls front() with no options: only the answer's fronts are counted)
  const front = L.wind.front.bind(L.wind);
  L.wind.front = (o) => { if (o) c.front.push(o); else front(o); };
  L.wind.burst = (...a) => { c.burst.push(a); };
  L.creatures.startle = (...a) => { c.startle.push(a); return 0; };
  L.litter.scatter = (...a) => { c.scatter.push(a); return 0; };
  const hush = L.hushFor.bind(L);
  L.hushFor = (sec, k) => { c.hush.push([sec, k]); hush(sec, k); };
  c.reset = () => { for (const k of ['front', 'startle', 'scatter', 'hush', 'burst']) c[k].length = 0; };
  c.total = () => c.front.length + c.startle.length + c.scatter.length + c.hush.length;
  return c;
}

const EVENTS = ['dragon:roar', 'dragon:wake', 'dragon:land', 'dragon:explosion', 'player:slam', 'player:plungeHit', 'combat:tell', 'combat:charge', 'dragon:phase', 'dragon:phase2', 'dragon:phase3', 'dragon:phase4', 'dragon:dead', 'game:victory', 'player:died'];

export default {
  /** A roar: one strong front from the boss toward the hero, a startle over the arena, what lies near the boss thrown. */
  roar(T) {
    const w = T.build('cinderwood', 'answer');
    const c = spy(w);
    w.step(0.5);
    w.emit('dragon:roar', { strength: 1 });
    const f = c.front[0];
    T.assert(c.front.length === 1, `roar: one front (${c.front.length})`);
    const b = w.game.dragon.position, h = w.game.player.position;
    const dx = h.x - b.x, dz = h.z - b.z, len = Math.hypot(dx, dz);
    T.assert(f && T.near(f.dirX, dx / len, 1e-3) && T.near(f.dirZ, dz / len, 1e-3), `roar: the front runs from the boss toward the hero (${f?.dirX?.toFixed(2)}, ${f?.dirZ?.toFixed(2)})`);
    T.assert(f && T.near(f.x, b.x) && T.near(f.z, b.z) && f.strength >= 1.4 && f.speed >= 12, `roar: it starts at the boss, strong and fast (strength ${f?.strength}, ${f?.speed} m/s)`);
    T.assert(c.startle.length === 1 && c.startle[0][2] >= 50, `roar: everything alive in the arena flees (r ${c.startle[0]?.[2]})`);
    T.assert(c.scatter.length === 1 && T.near(c.scatter[0][0], b.x) && c.scatter[0][2] > 4, `roar: what lies near the boss is thrown (r ${c.scatter[0]?.[2]})`);
    T.assert(c.hush.length === 0, 'roar: no hush (it is the blow, not its windup)');
    // the roar's strength scales the front it asks for (life.k is the wind's to apply, once)
    const w2 = T.build('cinderwood', 'answer', { k: 0.5 });
    const c2 = spy(w2);
    w2.step(0.5);
    w2.emit('dragon:roar', { strength: 0.6 });
    T.assert(c2.front[0]?.strength < f.strength * 0.7 && c2.front[0]?.strength > f.strength * 0.5, `roar: a duelist's shout asks for a smaller front, lifeK not applied twice (${c2.front[0]?.strength?.toFixed(2)} vs ${f.strength.toFixed(2)})`);
  },

  /** dragon:wake: the level notices him: a first, smaller front. */
  wake(T) {
    const w = T.build('cinderwood', 'answer');
    const c = spy(w);
    w.step(0.5);
    w.emit('dragon:wake');
    w.emit('dragon:roar', { strength: 1 });
    T.assert(c.front.length === 2 && c.front[0].strength < c.front[1].strength, `wake: a front smaller than the roar's (${c.front[0]?.strength} < ${c.front[1]?.strength})`);
    T.assert(c.startle.length === 2 && c.startle[0][3] < c.startle[1][3], 'wake: a gentler startle');
  },

  /** A landing, an explosion, a slam, a plunge: litter thrown and creatures startled round the point; no front, no burst of its own. */
  blows(T) {
    const w = T.build('cinderwood', 'answer');
    const c = spy(w);
    w.step(0.5);
    const cases = [['dragon:land', { x: 4, z: -6 }], ['dragon:explosion', { x: -5, z: 2, radius: 6 }], ['player:slam', { x: 1, z: 10 }], ['player:plungeHit', { damage: 40 }]];
    for (const [name, d] of cases) {
      c.reset();
      w.step(0.4);
      w.emit(name, d);
      const px = d.x ?? w.game.player.position.x, pz = d.z ?? w.game.player.position.z;
      T.assert(c.scatter.length === 1 && T.near(c.scatter[0][0], px) && T.near(c.scatter[0][1], pz), `${name}: litter thrown at the point (${c.scatter[0]?.[0]}, ${c.scatter[0]?.[1]})`);
      T.assert(c.startle.length === 1 && c.startle[0][2] >= c.scatter[0][2], `${name}: creatures startled round it (r ${c.startle[0]?.[2]})`);
      T.assert(c.front.length === 0 && c.burst.length === 0 && c.hush.length === 0, `${name}: no front, no burst of its own (world.gust brings the push), no hush`);
    }
    c.reset();
    w.step(0.4);
    w.emit('dragon:explosion', { x: 0, z: 0, radius: 6 });
    T.assert(c.scatter[0]?.[2] > 6, `an explosion's radius widens the scatter (${c.scatter[0]?.[2]})`);
    // a volley of landings: rate-limited
    c.reset();
    w.step(0.4);
    for (let i = 0; i < 10; i++) w.emit('dragon:land', { x: i, z: 0 });
    T.assert(c.scatter.length === 1, `ten landings in one frame: one answer (${c.scatter.length})`);
  },

  /** A red or black tell, a charge: the world holds its breath until the blow lands. Normal / blue / a bullet's: nothing. */
  hush(T) {
    const w = T.build('cinderwood', 'answer');
    const c = spy(w);
    w.step(0.5);
    for (const tell of ['normal', 'blue']) w.emit('combat:tell', { source: 'dragon', attack: 'bite', tell, impactIn: 0.8, x: 0, z: 0 });
    w.emit('combat:tell', { source: 'dragon', attack: 'orb', tell: 'red', impactIn: 0.8, x: 0, z: 0, hazard: true, bullet: true });
    T.assert(c.total() === 0, `normal, blue and a bullet's red tell cause nothing (${c.total()} calls)`);
    w.emit('combat:tell', { source: 'dragon', attack: 'cleave', tell: 'red', impactIn: 1.1, x: 0, z: 0 });
    T.assert(c.hush.length === 1 && T.near(c.hush[0][0], 1.1) && c.hush[0][1] > 0.5, `red tell: a hush until the blow lands (${c.hush[0]?.[0]} s, k ${c.hush[0]?.[1]})`);
    w.step(0.5);
    T.assert(w.life.hush > 0.5, `red tell: the world is holding its breath half a second in (${w.life.hush.toFixed(2)})`);
    w.step(3);
    T.assert(w.life.hush < 0.3, `red tell: the breath is let go after the blow (${w.life.hush.toFixed(2)})`);
    c.reset();
    w.emit('combat:tell', { source: 'dragon', attack: 'grab', tell: 'black', impactIn: 0.9 });
    T.assert(c.hush.length === 1, 'black tell: a hush');
    c.reset();
    w.step(3);
    w.emit('combat:charge', { source: 'dragon', attack: 'beam', dur: 1.6, x: 0, z: 0 });
    T.assert(c.hush.length === 1 && T.near(c.hush[0][0], 1.6), `charge: a hush for its duration (${c.hush[0]?.[0]})`);
    c.reset();
    w.emit('combat:tell', { source: 'dragon', attack: 'cleave', tell: 'red', impactIn: 0.7 });
    T.assert(c.hush.length === 0, 'a second great tell right after: no second hush (it stays rare)');
    c.reset();
    w.step(3);
    w.emit('combat:tell', { tell: 'red', impactIn: 40 });
    T.assert(c.hush.length === 1 && c.hush[0][0] <= 2.5, `a hush is never longer than 2.5 s (${c.hush[0]?.[0]})`);
  },

  /** A new form: a hush of ~1 s first, then one long front. */
  phase(T) {
    const w = T.build('cinderwood', 'answer', { state: 'boss' });
    const c = spy(w);
    w.step(0.5);
    w.emit('dragon:phase2');
    w.emit('dragon:phase', { n: 2 });
    T.assert(c.hush.length === 1 && T.near(c.hush[0][0], 1, 0.3), `phase: a hush of ~1 s (${c.hush[0]?.[0]}; the wyrm's two phase events are one answer)`);
    T.assert(c.front.length === 0, 'phase: no front during the hush');
    w.step(0.8);
    T.assert(c.front.length === 0, 'phase: still none 0.8 s in');
    w.step(0.4);
    T.assert(c.front.length === 1 && c.front[0].width >= 15, `phase: then one long front (${c.front.length}, width ${c.front[0]?.width})`);
  },

  /** The boss falls: the wind drops to nothing (a long hush) and the life comes back only after it. */
  lull(T) {
    const w = T.build('cinderwood', 'answer', { state: 'boss' });
    const c = spy(w);
    w.step(4);
    const fight = w.life.calm;
    T.assert(fight < 0.6, `the fight calms the world (${fight.toFixed(2)})`);
    w.emit('dragon:dead');
    w.game.state = 'victory';
    w.emit('game:victory', {});
    T.assert(c.hush.length === 1 && c.hush[0][0] >= 3, `victory: one lull of ${c.hush[0]?.[0]} s (dragon:dead and game:victory are one answer)`);
    w.step(2.5);
    T.assert(w.life.hush > 0.8 && w.life.calm < fight + 0.1, `in the lull: the breath held (${w.life.hush.toFixed(2)}), the life not back yet (calm ${w.life.calm.toFixed(2)})`);
    w.step(14);
    T.assert(w.life.hush === 0 && w.life.calm > 0.85, `after it: the place breathes again (hush ${w.life.hush}, calm ${w.life.calm.toFixed(2)})`);
    c.reset();
    w.emit('player:died');
    T.assert(c.hush.length === 1 && c.hush[0][0] >= 1.5, `player:died: a hush (${c.hush[0]?.[0]} s)`);
  },

  /** Ten roars in a second: one front. */
  rate(T) {
    const w = T.build('cinderwood', 'answer');
    const c = spy(w);
    w.step(0.5);
    for (let i = 0; i < 10; i++) {
      w.emit('dragon:roar', { strength: 1 });
      w.step(0.1);
    }
    T.assert(c.front.length === 1 && c.startle.length === 1, `ten roars in a second: one front, one startle (${c.front.length}, ${c.startle.length})`);
    w.step(1);
    w.emit('dragon:roar', { strength: 1 });
    T.assert(c.front.length === 2, 'a roar after the gap answers again');
  },

  /** life.gust: a strong burst startles what lives in its radius, rate-limited; a weak one does not. Not doubled into the wind. */
  gust(T) {
    const w = T.build('cinderwood', 'answer');
    const c = spy(w);
    w.step(0.5);
    w.world.gust(2, 3, 0.8, 10);
    T.assert(c.startle.length === 0, 'a weak burst (0.8) startles nothing');
    for (let i = 0; i < 50; i++) w.world.gust(2, 3, 1.6, 14);
    T.assert(c.startle.length === 1 && T.near(c.startle[0][2], 14), `fifty strong bursts in a frame: one startle, in its radius (${c.startle.length}, r ${c.startle[0]?.[2]})`);
    T.assert(c.burst.length === 0 && c.front.length === 0, 'the answer sends no air of its own on a gust (wind off: no burst at all)');
    w.step(0.5);
    w.world.gust(2, 3, 1.6, 14);
    T.assert(c.startle.length === 2, 'after the gap a strong burst startles again');
    T.assert(w.counts().random === 0, `no Math.random (${w.counts().random})`);
  },

  /** The piece off: nothing is subscribed, nothing answers; the Lab can switch it on live. */
  off(T) {
    const w = T.build('cinderwood', 'wind,litter,creatures');
    const c = spy(w);
    w.step(0.5);
    for (const n of EVENTS) w.emit(n, { strength: 1, tell: 'red', impactIn: 1, dur: 1, x: 1, z: 1, radius: 4 });
    w.world.gust(0, 0, 2, 12);
    w.step(2);
    T.assert(c.front.length + c.startle.length + c.scatter.length + c.hush.length === 0, `answer off: no front, startle, scatter or hush (${c.total()})`);
    T.assert(w.life.answer._offs === null, 'answer off: subscribed to nothing');
    T.setLife('wind,litter,creatures,answer');
    w.step(0.1);
    w.emit('dragon:roar', { strength: 1 });
    T.assert(c.front.length === 1, 'switched on live (the Lab): the roar is answered');
    T.setLife('wind,litter,creatures');
    w.step(0.1);
    c.reset();
    w.step(2);
    w.emit('dragon:roar', { strength: 1 });
    T.assert(c.total() === 0 && w.life.answer._offs === null, 'switched off again: unsubscribed');
  },

  /** No payload, odd payloads: nothing throws, nothing NaN reaches another layer. */
  payloads(T) {
    const w = T.build('cinderwood', 'answer');
    const c = spy(w);
    w.step(0.5);
    for (const d of [undefined, null, {}, { x: NaN, z: 'a', strength: Infinity, radius: -3, impactIn: NaN, dur: -1, tell: 'red' }]) {
      for (const n of EVENTS) {
        w.emit(n, d);
        w.step(0.05);
      }
      w.step(5);
    }
    const bad = [...c.front.map((o) => [o.strength, o.dirX, o.dirZ, o.x, o.z]), ...c.startle, ...c.scatter, ...c.hush].flat().filter((v) => typeof v !== 'number' || !Number.isFinite(v));
    T.assert(bad.length === 0, `missing / broken payloads: every value passed on is finite (${bad.length} bad of ${c.total()} calls)`);
    T.assert(Object.values(w.life._errs).every((n) => !n), 'no layer threw');
    // no boss at all
    w.game.dragon = w.game.boss = null;
    w.step(5);
    for (const n of EVENTS) w.emit(n, {});
    w.step(2);
    T.assert(Object.values(w.life._errs).every((n) => !n), 'no boss: nothing throws');
  },

  /** Every level answers, the Windless Grove too (the fight is the only air there), with no Math.random. */
  levels(T) {
    for (const id of T.LEVEL_IDS) {
      const w = T.build(id, 'answer');
      const c = spy(w);
      w.step(0.5);
      w.emit('dragon:roar', { strength: 1 });
      w.emit('dragon:land', { x: 0, z: 0 });
      w.emit('combat:tell', { tell: 'red', impactIn: 1 });
      w.step(3);
      T.assert(c.front.length === 1 && c.scatter.length === 2 && c.hush.length === 1, `${id}: a roar's front, a landing's scatter, a red tell's hush (${c.front.length} / ${c.scatter.length} / ${c.hush.length})`);
      T.assert(w.counts().random === 0, `${id}: no Math.random`);
      T.assert(w.counts().pools === 0, `${id}: the answer makes no pool of its own`);
    }
  },
};
