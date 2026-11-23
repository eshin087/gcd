// The living world's 'arrival' piece: its scenarios (tests/integration/life.mjs runs them; T is its toolbox).
// One scenario per rule the piece must keep. Run: node tests/integration/life.mjs . arrival
// The life harness has no flow: the Arrival runs against a stand-in with the fields of game/flow.js it
// touches (_ov, _ovW, _ovZ, _ovLambda, swallowInput) and the flow's own override damping. The real
// flow (title → explore → boss intro, retry) is the integ suite's (headless the piece is off there).

const FPS = 60;

async function rig(T, levelId = 'cinderwood', spec = 'arrival', o = {}) {
  const { Arrival } = await T.imp('src/game/arrival.js');
  const { damp } = await T.imp('src/core/math.js');
  const w = T.build(levelId, spec, o);
  const g = w.game;
  const input = { enabled: true, axis: { x: 0, y: 0 }, act: null, moveAxis() { return this.axis; }, actPressed(a) { return this.act === a; } };
  g.input = input;
  g.cameraRig = { mobile: !!o.mobile };
  // the title's framing as the flow leaves it: weight 0.8, zoom 8, the focus most of the way to the boss
  const flow = {
    _ov: { focus: new T.THREE.Vector3(2.7, 0, -6), weight: 0.8, zoom: 8 }, _ovW: 0.8, _ovZ: 8, _ovLambda: 2, swallowInput: false,
    cameraOverride: null,
    _updateOverride(rdt) {
      const ov = this._ov;
      ov.weight = damp(ov.weight, this._ovW, this._ovLambda, rdt);
      ov.zoom = damp(ov.zoom, this._ovZ, this._ovLambda, rdt);
      if (this._ovW <= 0 && ov.weight < 0.005 && ov.zoom < 0.05) {
        ov.weight = ov.zoom = 0;
        this.cameraOverride = null;
      } else this.cameraOverride = ov;
    },
    // what _startGame does before the arrival's hook
    start() { this._ovW = 0; this._ovZ = 0; this._ovLambda = 1.3; },
  };
  g.flow = flow;
  const A = new Arrival(g, flow);
  flow.arrival = A;
  const tick = (sec) => {
    for (let i = 0; i < Math.round(sec * FPS); i++) {
      w.step(1 / FPS);
      A.update(1 / FPS);
      flow._updateOverride(1 / FPS);
    }
  };
  return { w, g, flow, A, input, tick };
}

export default {
  /** It begins only from begin(), holds ~3 s wide over the arena, then releases to zero weight. */
  async hold(T) {
    const { flow, A, tick } = await rig(T);
    tick(1);
    T.assert(!A.active && flow._ovW === 0.8, 'nothing happens before begin()');
    flow.start();
    T.assert(A.begin() === true && A.active && A.phase === 'hold', 'begin(): the shot opens');
    tick(1.5);
    T.assert(A.phase === 'hold' && flow._ov.weight > 0.9 && flow._ov.zoom > 12, `1.5 s in: wide over the arena (weight ${flow._ov.weight.toFixed(2)}, +${flow._ov.zoom.toFixed(1)} m)`);
    const z15 = flow._ov.focus.z;
    tick(1.3);
    T.assert(A.phase === 'hold', `2.8 s in: still holding (${A.phase})`);
    T.assert(flow._ov.focus.z > z15 + 2, `the shot cranes back toward the hero over the hold (focus z ${z15.toFixed(1)} → ${flow._ov.focus.z.toFixed(1)})`);
    tick(0.4);
    T.assert(A.phase === 'release' && A.ended === 'time' && flow._ovW === 0, `~3 s: it lets go (${A.phase}, ${A.ended})`);
    T.assert(flow._ov.weight > 0.6, `... with an ease, not a snap (weight ${flow._ov.weight.toFixed(2)} a frame after)`);
    tick(4);
    T.assert(!A.active && flow._ov.weight < 0.02, `4 s later: settled behind the hero (weight ${flow._ov.weight.toFixed(3)})`);
    tick(2);
    T.assert(flow.cameraOverride === null, 'and no override is left');
  },

  /** No jump as it opens: the camera's focus starts where the title left it. */
  async smooth(T) {
    const { w, flow, A, tick } = await rig(T);
    const p = w.game.player.position;
    const look = (o) => [p.x + (o.focus.x - p.x) * o.weight, p.z + (o.focus.z - p.z) * o.weight];
    const before = look(flow._ov);
    flow.start();
    A.begin();
    tick(1 / FPS);
    const after = look(flow._ov);
    const d = Math.hypot(after[0] - before[0], after[1] - before[1]);
    T.assert(d < 0.6, `the first frame moves the camera's focus ${d.toFixed(2)} m (no jump)`);
    let max = 0, prev = after;
    for (let i = 0; i < 7 * FPS; i++) {
      tick(1 / FPS);
      const now = look(flow._ov);
      max = Math.max(max, Math.hypot(now[0] - prev[0], now[1] - prev[1]));
      prev = now;
    }
    T.assert(max < 0.8, `never more than ${max.toFixed(2)} m a frame (< 0.8)`);
  },

  /** Any move, attack or dodge ends it early, with an ease. */
  async skip(T) {
    for (const how of ['move', 'attack', 'dodge']) {
      const { flow, A, input, tick } = await rig(T);
      flow.start();
      A.begin();
      tick(0.8);
      if (how === 'move') input.axis = { x: 0, y: 1 };
      else input.act = how;
      tick(1 / FPS);
      input.act = null;
      T.assert(A.phase === 'release' && A.ended === 'input' && flow._ovW === 0, `${how} 0.8 s in: the beat ends (${A.phase}, ${A.ended})`);
      T.assert(flow._ov.weight > 0.5, `${how}: it eases out (weight ${flow._ov.weight.toFixed(2)} a frame after)`);
      tick(2.5);
      T.assert(flow._ov.weight < 0.1, `${how}: back behind the hero within 2.5 s (${flow._ov.weight.toFixed(3)})`);
    }
    // the frame the title is dismissed swallows input: the dismissing key does not end it
    const { flow, A, input, tick } = await rig(T);
    flow.start();
    A.begin();
    flow.swallowInput = true;
    input.act = 'attack';
    tick(1 / FPS);
    T.assert(A.phase === 'hold', 'the swallowed dismiss click does not end it');
  },

  /** cancel() lets go at once; a second begin() in one page load does nothing (a respawn never replays it). */
  async cancel(T) {
    const { flow, A, tick } = await rig(T);
    flow.start();
    A.begin();
    tick(1);
    A.cancel();
    T.assert(!A.active && A.phase === 'idle' && flow._ovW === 0 && flow._ovZ === 0, 'cancel(): its weight is zero at once');
    T.assert(A.begin() === false && !A.active, 'a second begin() does nothing');
    tick(0.5);
    T.assert(flow._ovW === 0, 'and it keeps away from the camera');
    // the state leaves explore (the boss intro, a death): it lets go by itself
    const r = await rig(T);
    r.flow.start();
    r.A.begin();
    r.tick(0.5);
    r.g.state = 'bossIntro';
    r.flow._ovW = 0.55;
    r.tick(0.1);
    T.assert(!r.A.active && r.flow._ovW === 0.55, 'outside explore it lets go and leaves the intro its camera');
    // a pause holds it
    const p = await rig(T);
    p.flow.start();
    p.A.begin();
    p.tick(1);
    p.g.state = 'paused';
    const t = p.A.t;
    p.tick(5);
    p.g.state = 'explore';
    T.assert(p.A.phase === 'hold' && T.near(p.A.t, t), `a pause holds the beat (t ${t.toFixed(2)} → ${p.A.t.toFixed(2)})`);
    // the Lab's replay
    p.tick(6);
    T.assert(p.A.replay() === true && p.A.phase === 'hold', "the Lab's 'arrival (replay)' plays it again");
    const lab = p.w.life.actions.find((a) => a.label === 'arrival (replay)');
    T.assert(!!lab, "the 'arrival (replay)' button is on the Lab's life row");
  },

  /** A gust front crosses the level as the shot opens (the creatures are left alone); none in the Windless Grove. */
  async front(T) {
    for (const id of T.LEVEL_IDS) {
      const { w, flow, A, tick } = await rig(T, id, 'arrival,wind,creatures');
      const fronts = [], startles = [];
      w.life.wind.front = (o) => { fronts.push(o); };
      w.life.creatures.startle = (...a) => { startles.push(a); return 0; };
      flow.start();
      A.begin();
      tick(3.5);
      const want = id === 'grove' ? 0 : 1;
      T.assert(fronts.length === want && startles.length === 0, `${id}: ${want ? 'one front crosses the level' : 'no front: the grove holds its breath'}, the birds left be (${fronts.length} / ${startles.length})`);
      T.assert(fronts.every((o) => [o.strength, o.speed, o.width].every(Number.isFinite)), `${id}: the front's numbers are finite`);
      T.assert(w.counts().random === 0, `${id}: no Math.random`);
    }
  },

  /** The phone: its extra zoom is capped, so the shot leans all the way instead. */
  async phone(T) {
    const { flow, A, tick } = await rig(T, 'cinderwood', 'arrival', { mobile: true, quality: 0.5 });
    flow.start();
    A.begin();
    tick(1.5);
    T.assert(flow._ovZ <= 3 && flow._ov.weight > 0.9, `phone: zoom within the rig's cap (+${flow._ovZ}), weight ${flow._ov.weight.toFixed(2)}`);
  },

  /** The piece off: begin() does nothing, the flow's camera is exactly as today. */
  async off(T) {
    const { flow, A, tick } = await rig(T, 'cinderwood', 'wind,litter');
    flow.start();
    T.assert(A.begin() === false && !A.active, 'arrival off: begin() does nothing');
    tick(0.5);
    T.assert(flow._ovW === 0 && flow._ovZ === 0 && flow._ovLambda === 1.3, "arrival off: the title's ease back to the hero is untouched");
    // the training room has no living world
    const lab = await rig(T, 'cinderwood', 'all');
    lab.w.life.enabled = false;
    lab.flow.start();
    T.assert(lab.A.begin() === false, 'no living world (the training room): no arrival');
  },
};
