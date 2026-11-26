// The remade hero's clip engine (src/entities/hero2/, `?hero=new`): the REAL engine modules and every
// registered clip set, no DOM, no WebGL (the engine is pure; its animator is run on a stand-in object3d
// and a body that records what it is given).
// usage: node hero2.mjs <repoRoot> [scenario]
//   scenario: clips | smooth | feet | fit | engine | off | all (default all), or a comma list
//   clips   every registered clip decodes and keeps the format's rules (README.md "Clip format")
//   smooth  sampling is continuous: no joint jumps between steps, across loop wraps and cross-fades
//   feet    a pinned foot slides under 1 cm through its plant while a walk loop travels; no sole under
//           the ground; a blend between two clips does not skate
//   fit     time fitting puts the coil and the cut's end on the game's marks within one step
//   engine  events, footfalls, root motion, a missing clip holds the pose, no throw on bad input
//   off     with the switch off game.hero2 is undefined and no hero2 module but the switchboard loads
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT = process.argv[2] || '.';
const SCEN = process.argv[3] || 'all';
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const H2 = 'src/entities/hero2/';
const { J, JOINTS, JI, createPose, createWorld, restOffsets, solveFK } = await imp(H2 + 'skeleton.js');
const { HDIM } = await imp(H2 + 'dims.js');
const { createLibrary, createClipPlayer, createHero2, validateClip, fitTime } = await imp(H2 + 'engine.js');
const { SETS, loadLibrary } = await imp(H2 + 'clips/index.js');
const { frameIn, sampleClip, rootDelta } = await imp(H2 + 'clip.js');
const { qangle } = await imp(H2 + 'qmath.js');

const warns = [];
console.warn = (...a) => warns.push(a.map(String).join(' '));
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
let fails = 0;
const assert = (c, m) => {
  if (!c) {
    fails++;
    out('FAIL', m);
  } else out('ok  ', m);
};
const DT = 1 / 60;
const deg = (r) => (r * 180) / Math.PI;

const lib = await loadLibrary();
const real = lib.clips.filter((c) => !c.name.startsWith('_'));
const test = (n) => lib.get(n);

/** A stand-in object3d (what the animator reads and moves) and a body that counts its calls. */
function standIn() {
  const object3d = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 }, scale: { x: 1, y: 1, z: 1 } };
  const body = {
    object3d,
    n: 0,
    props: {},
    resets: 0,
    update(world, dt) {
      this.n++;
      if (!Number.isFinite(world.p[3] + world.r[7] + dt)) this.bad = true;
    },
    setProp(side, kind) {
      this.props[side] = kind;
    },
    reset() {
      this.resets++;
    },
  };
  return body;
}

/** World position of joint j (FK frame -> world through object3d). */
function jointWorld(h, j, o = [0, 0, 0]) {
  const p = h.world.p, ob = h.object3d, c = Math.cos(ob.rotation.y), s = Math.sin(ob.rotation.y);
  const x = p[j * 3], y = p[j * 3 + 1], z = p[j * 3 + 2];
  o[0] = ob.position.x + c * x + s * z;
  o[1] = ob.position.y + y;
  o[2] = ob.position.z - s * x + c * z;
  return o;
}

// ------------------------------------------------------------------ clips
function scenClips() {
  out('-- clips: the registry and the format');
  assert(SETS.length >= 1 && SETS.every(([id, f]) => typeof id === 'string' && typeof f === 'function'), `the registry lists ${SETS.length} set(s): ${SETS.map((s) => s[0]).join(', ')}`);
  assert(lib.problems.length === 0, `every set loads and decodes (${lib.problems.length} problems${lib.problems.length ? ': ' + lib.problems.slice(0, 6).map((p) => `${p.clip} ${p.text}`).join('; ') : ''})`);
  // the order: MOVE film sets, then SWORD, then the test clips (names with _ ) last
  const ids = lib.sets.map((s) => s.id);
  const firstTest = ids.findIndex((i) => i.startsWith('_'));
  assert(firstTest < 0 || ids.slice(firstTest).every((i) => i.startsWith('_')), `the test sets come after the footage's (${ids.join(', ')})`);
  const moveAt = lib.clips.findIndex((c) => /^move/.test(c.src)), swordLast = lib.clips.map((c) => /^sword/.test(c.src)).lastIndexOf(true);
  if (moveAt >= 0 && swordLast >= 0) assert(lib.clips.slice(swordLast + 1).every((c) => !/^move/.test(c.src)), 'no MOVE film clip after a SWORD film clip');
  out(`     ${lib.clips.length} clips (${real.length} from the footage, ${lib.clips.length - real.length} synthetic)`);
  let bad = 0;
  for (const c of lib.clips) {
    const v = validateClip(c);
    if (v.errors.length) {
      bad++;
      out(`     ${c.name}: ${v.errors.join('; ')}`);
    }
    for (const w of v.warnings) out(`     (warning) ${c.name}: ${w}`);
  }
  assert(bad === 0, `every clip keeps the format's rules (${bad} broken)`);
  const names = new Set();
  let dup = 0;
  for (const s of lib.sets) for (const c of s.clips) (names.has(c.name) ? dup++ : names.add(c.name));
  assert(dup === 0, 'clip names are unique in the whole registry');
  // every field of the format is exercised by the test clips
  const T = ['_idle', '_walk', '_turn', '_crouch', '_lunge'].map(test);
  assert(T.every(Boolean), 'the synthetic clips are registered (_idle, _walk, _turn, _crouch, _lunge)');
  if (T.every(Boolean)) {
    assert(T.some((c) => c.joints) && T.some((c) => !c.joints), 'a joint subset and the full set');
    assert(T.some((c) => c.loop && Math.hypot(c.cyc[0], c.cyc[1]) > 0.5) && T.some((c) => Math.abs(c.root[(c.n - 1) * 3 + 2]) > 1), 'a loop that travels, a clip that turns');
    assert(T.some((c) => c.phases && c.events.some((e) => e.name === 'hit') && c.props.R === 'sword'), 'an attack: phases, a hit, the sword on weaponR');
    assert(T.some((c) => c.loop && c.contact.R.some(([a, b]) => b >= c.n)), "a plant through a loop's wrap (two spans joined into one)");
  }
}

// ------------------------------------------------------------------ smooth
/** Largest joint turn (deg) and hips move (m) between two poses. */
function poseStep(a, b) {
  let ang = 0, at = 0;
  for (let j = 1; j < J; j++) {
    const v = qangle(a.q, j * 4, b.q, j * 4);
    if (v > ang) {
      ang = v;
      at = j;
    }
  }
  const hm = Math.hypot(a.hips[0] - b.hips[0], a.hips[1] - b.hips[1], a.hips[2] - b.hips[2]);
  return { ang: deg(ang), at: JOINTS[at], hm };
}
const copyPose = (p) => ({ q: Float32Array.from(p.q), hips: Float32Array.from(p.hips) });

function scenSmooth() {
  out('-- smooth: sampling across frames, loop wraps and cross-fades');
  const MAXDEG = 22, MAXHIPS = 0.03; // per 1/60 s step
  // every clip on its own: each loops for two cycles (the wrap twice) or plays once
  let worst = { ang: 0, at: '', clip: '', t: 0 }, worstH = { hm: 0, clip: '' }, worstRoot = { d: 0, clip: '' };
  for (const c of lib.clips) {
    const P = createClipPlayer(lib, { warn: () => {} });
    P.play(c.name, { fade: 0 });
    P.update(0);
    let prev = copyPose(P.pose);
    const steps = Math.ceil((c.loop ? 2 * c.dur : c.dur) / DT) + 4;
    for (let i = 0; i < steps; i++) {
      P.update(DT);
      const s = poseStep(prev, P.pose);
      if (s.ang > worst.ang) worst = { ...s, clip: c.name, t: P.time };
      if (s.hm > worstH.hm) worstH = { hm: s.hm, clip: c.name };
      const rd = Math.hypot(P.rootDelta.dx, P.rootDelta.dz);
      if (rd > worstRoot.d) worstRoot = { d: rd, clip: c.name };
      prev = copyPose(P.pose);
    }
  }
  assert(worst.ang < MAXDEG, `no joint turns over ${MAXDEG} deg in a step, wraps included (worst ${worst.ang.toFixed(1)} deg: ${worst.clip} ${worst.at} at ${worst.t.toFixed(2)} s)`);
  assert(worstH.hm < MAXHIPS, `the hips never jump over ${MAXHIPS * 100} cm in a step (worst ${(worstH.hm * 100).toFixed(1)} cm: ${worstH.clip})`);
  assert(worstRoot.d < 0.1, `the root's step stays under 10 cm (worst ${(worstRoot.d * 100).toFixed(1)} cm: ${worstRoot.clip})`);

  // a loop's wrap: the step across it like the steps beside it
  const w = test('_walk');
  if (w) {
    const P = createClipPlayer(lib, { warn: () => {} });
    P.play('_walk', { fade: 0, at: w.dur - 3 * DT });
    P.update(0);
    let prev = copyPose(P.pose);
    const st = [];
    for (let i = 0; i < 6; i++) {
      P.update(DT);
      st.push(poseStep(prev, P.pose).ang);
      prev = copyPose(P.pose);
    }
    const wrapStep = st[2], around = Math.max(st[0], st[1], st[3], st[4]);
    assert(wrapStep < around * 1.6 + 1, `the walk's wrap is no bigger a step than its neighbours (${wrapStep.toFixed(1)} vs ${around.toFixed(1)} deg)`);
    // root motion over many cycles: the loop travels for ever at its speed
    P.play('_walk', { fade: 0 });
    let x = 0, z = 0, yaw = 0;
    for (let i = 0; i < 600; i++) {
      P.update(DT);
      const c = Math.cos(yaw), s = Math.sin(yaw), d = P.rootDelta;
      x += c * d.dx + s * d.dz;
      z += -s * d.dx + c * d.dz;
      yaw += d.dyaw;
    }
    assert(Math.abs(Math.hypot(x, z) / 10 - w.speed) < 0.05 && Math.abs(yaw) < 1e-3, `ten seconds of the walk loop travel ${Math.hypot(x, z).toFixed(2)} m (${w.speed} m/s), no drift of the heading`);
  }

  // cross-fades: into another clip at any moment, from mid-fade (a frozen pose), from a one-shot's end
  const order = ['_idle', '_walk', '_lunge', '_walk', '_crouch', '_turn', '_idle', '_lunge', '_idle'].filter((n) => lib.has(n));
  const fades = [0.25, 0.2, 0.12, 0.3, 0.2, 0.15, 0.1, 0.25];
  const P = createClipPlayer(lib, { warn: () => {} });
  P.play(order[0], { fade: 0 });
  P.update(0);
  let prev = copyPose(P.pose), wf = { ang: 0, at: '', when: '' }, wfh = 0, i = 0;
  // at odd moments (0.37 s, 0.53 s, ...) and one fade begun 0.05 s into the last (mid-fade)
  const at = [0.37, 0.53, 0.29, 0.05, 0.61, 0.43, 0.07, 0.4];
  for (let k = 1; k < order.length; k++) {
    const n = Math.round(at[k - 1] / DT);
    for (let s = 0; s < n; s++, i++) {
      P.update(DT);
      const st = poseStep(prev, P.pose);
      if (st.ang > wf.ang) wf = { ang: st.ang, at: st.at, when: `${order[k - 1]} (${(s * DT).toFixed(2)} s in)` };
      wfh = Math.max(wfh, st.hm);
      prev = copyPose(P.pose);
    }
    P.play(order[k], { fade: fades[k - 1] });
  }
  for (let s = 0; s < 60; s++) {
    P.update(DT);
    const st = poseStep(prev, P.pose);
    if (st.ang > wf.ang) wf = { ang: st.ang, at: st.at, when: `the last clip` };
    wfh = Math.max(wfh, st.hm);
    prev = copyPose(P.pose);
  }
  assert(wf.ang < MAXDEG, `a chain of cross-fades (two begun mid-fade) never jumps a joint over ${MAXDEG} deg (worst ${wf.ang.toFixed(1)}: ${wf.at}, ${wf.when})`);
  assert(wfh < 0.05, `... nor the hips over 5 cm (worst ${(wfh * 100).toFixed(1)} cm; a short fade between far poses moves them fast)`);
  // a cut (fade 0) is allowed to jump: the fade is what makes it smooth
  const Q = createClipPlayer(lib, { warn: () => {} });
  Q.play('_idle', { fade: 0 });
  Q.update(0.5);
  const a = copyPose(Q.pose);
  Q.play('_crouch', { fade: 0.3, at: 0.9 });
  Q.update(DT);
  const s1 = poseStep(a, Q.pose).ang;
  assert(s1 < 6, `the first step of a 0.3 s fade into a far pose moves little (${s1.toFixed(1)} deg)`);
}

// ------------------------------------------------------------------ feet
function scenFeet() {
  out('-- feet: the pin');
  const w = test('_walk');
  if (!w) return assert(false, 'no _walk clip');
  // the data's own slide (what the pin hides)
  const pose = createPose(), world = createWorld(), rest = restOffsets();
  let dataSlide = 0;
  {
    const [a, b] = w.contact.L[0];
    let x0 = 0, z0 = 0;
    for (let f = a; f <= b; f++) {
      sampleClip(w, frameIn(w, f), pose);
      rootDelta(w, 0, f, pose.root);
      solveFK(pose, rest, world);
      const x = world.p[JI.footL * 3], z = world.p[JI.footL * 3 + 2];
      if (f === a) {
        x0 = x;
        z0 = z;
      }
      dataSlide = Math.max(dataSlide, Math.hypot(x - x0, z - z0));
    }
  }
  const body = standIn();
  const h = createHero2(null, { body, library: lib });
  h.play('_walk', { fade: 0 });
  h.update(0);
  const plant = { L: null, R: null };
  let worst = 0, spans = 0, under = 0, maxCorr = 0;
  const v = [0, 0, 0];
  for (let i = 0; i < Math.round((3 * w.dur) / DT); i++) {
    h.update(DT);
    maxCorr = Math.max(maxCorr, h.feet.maxCorrect);
    for (const s of ['L', 'R']) {
      const wgt = h.contact[s];
      jointWorld(h, s === 'L' ? JI.footL : JI.footR, v);
      if (wgt >= 1) {
        if (!plant[s]) {
          plant[s] = [v[0], v[2]];
          spans++;
        } else worst = Math.max(worst, Math.hypot(v[0] - plant[s][0], v[2] - plant[s][1]));
      } else plant[s] = null;
    }
    // the soles over the ground (the toe joint is the ball of the foot)
    for (const j of [JI.toeL, JI.toeR]) if (h.world.p[j * 3 + 1] < -0.002) under++;
  }
  out(`     the data's planted ankle slides ${(dataSlide * 100).toFixed(1)} cm; the pin corrects up to ${(maxCorr * 100).toFixed(1)} cm`);
  assert(spans >= 5 && worst < 0.01, `a pinned foot slides ${(worst * 100).toFixed(2)} cm through its plant while the walk travels (${spans} plants over three cycles, under 1 cm)`);
  assert(under === 0, `no sole under the ground (${under} steps)`);
  assert(Math.abs(body.object3d.position.z - 3 * w.speed * w.dur) < 0.05, `the walk moved object3d ${body.object3d.position.z.toFixed(2)} m (root motion applied)`);

  // a blend between two clips does not skate: clips that plant a foot in the same spot (the synthetic
  // clips share one stance) keep it there through their fades, the lunge's root travel included
  const b2 = standIn();
  const h2 = createHero2(null, { body: b2, library: lib });
  h2.play('_idle', { fade: 0 });
  const p0 = { L: null, R: null };
  let skate = 0, n2 = 0;
  const plan = { 30: ['_crouch', 0.3], 100: ['_idle', 0.25], 130: ['_turn', 0.2], 195: ['_idle', 0.3], 230: ['_lunge', 0.15] };
  for (let i = 0; i < 300; i++) {
    if (plan[i]) h2.play(plan[i][0], { fade: plan[i][1] });
    h2.update(DT);
    for (const s of ['L', 'R']) {
      jointWorld(h2, s === 'L' ? JI.footL : JI.footR, v);
      if (h2.contact[s] >= 0.999) {
        if (!p0[s]) p0[s] = [v[0], v[2]];
        else {
          skate = Math.max(skate, Math.hypot(v[0] - p0[s][0], v[2] - p0[s][1]));
          n2++;
        }
      } else p0[s] = null;
    }
  }
  assert(n2 > 300 && skate < 0.01, `idle / crouch / turn / lunge cross-fades: a foot planted through them moves ${(skate * 100).toFixed(2)} cm (under 1 cm)`);
  // two clips that plant a foot in different spots (idle -> the walk's first stride): the foot goes
  // from one anchor to the other with the fade, never in a jump, and stays put after it
  const b4 = standIn();
  const h4 = createHero2(null, { body: b4, library: lib });
  h4.play('_idle', { fade: 0 });
  for (let i = 0; i < 20; i++) h4.update(DT);
  h4.play('_walk', { fade: 0.25 });
  let lastL = jointWorld(h4, JI.footL, [0, 0, 0]), jump = 0, after = 0, a0 = null;
  for (let i = 0; i < 28; i++) {
    h4.update(DT);
    const p = jointWorld(h4, JI.footL, [0, 0, 0]);
    jump = Math.max(jump, Math.hypot(p[0] - lastL[0], p[2] - lastL[2]));
    if (i >= 16) {
      if (!a0) a0 = p;
      else after = Math.max(after, Math.hypot(p[0] - a0[0], p[2] - a0[2]));
    }
    lastL = p;
  }
  assert(jump < 0.04 && after < 0.01, `idle -> walk: the left foot moves to the walk's plant at most ${(jump * 100).toFixed(1)} cm a step, then holds (${(after * 100).toFixed(2)} cm)`);
  // the turn on the spot: its planted feet keep still while the body turns
  const b3 = standIn();
  const h3 = createHero2(null, { body: b3, library: lib });
  h3.play('_turn', { fade: 0 });
  h3.update(0);
  const q0 = { L: null, R: null };
  let tw = 0;
  for (let i = 0; i < 60; i++) {
    h3.update(DT);
    for (const s of ['L', 'R']) {
      jointWorld(h3, s === 'L' ? JI.footL : JI.footR, v);
      if (h3.contact[s] >= 1) {
        if (!q0[s]) q0[s] = [v[0], v[2]];
        else tw = Math.max(tw, Math.hypot(v[0] - q0[s][0], v[2] - q0[s][1]));
      } else q0[s] = null;
    }
  }
  assert(tw < 0.01 && Math.abs(b3.object3d.rotation.y - Math.PI / 2) < 0.01, `the turn: planted feet move ${(tw * 100).toFixed(2)} cm, he faces ${deg(b3.object3d.rotation.y).toFixed(1)} deg`);
  // a teleport forgets the anchors (no foot dragged across the level)
  b3.object3d.position.x += 5;
  h3.teleported();
  h3.update(DT);
  jointWorld(h3, JI.footL, v);
  assert(Math.abs(v[0] - 5) < 0.5 && b3.resets === 1, `teleported(): the feet come with him (left ankle at x ${v[0].toFixed(2)}), the body's cloth reset`);
}

// ------------------------------------------------------------------ fit
function scenFit() {
  out('-- fit: attack clips on the game clock');
  const c = test('_lunge');
  if (!c) return assert(false, 'no _lunge clip');
  const cw = c.phases.windup / c.fps, ca = c.phases.active / c.fps, cr = c.phases.recover / c.fps;
  // today's attack windows (player/combat.js; numbers only, read from the file so they follow it)
  const src = fs.readFileSync(`${ROOT}/src/entities/player/combat.js`, 'utf8');
  const wins = [...src.matchAll(/windup: ([\d.]+), active: ([\d.]+), recovery: ([\d.]+)/g)].map((m) => ({ windup: +m[1], active: +m[2], recovery: +m[3] }));
  assert(wins.length >= 8, `${wins.length} attack windows read from player/combat.js`);
  wins.push({ windup: 0.9, active: 0.5, recovery: 1.4 }); // slower than the clip as well
  let worstMark = 0, worstStep = 0, mono = true, smoothJoin = 0;
  for (const win of wins) {
    const gw = win.windup, ga = gw + win.active, gr = ga + win.recovery;
    worstMark = Math.max(worstMark, Math.abs(fitTime(c, gw, win) - cw), Math.abs(fitTime(c, ga, win) - ca), Math.abs(fitTime(c, gr, win) - cr));
    // stepping the game at 60 Hz: the step at which the clip crosses the coil / the cut's end
    let prevT = 0, prevRate = null;
    let crossW = -1, crossA = -1;
    for (let i = 1; i <= Math.ceil((gr + 0.5) / DT); i++) {
      const t = i * DT, ct = fitTime(c, t, win);
      if (ct < prevT - 1e-9) mono = false;
      if (crossW < 0 && ct >= cw - 1e-9) crossW = t;
      if (crossA < 0 && ct >= ca - 1e-9) crossA = t;
      const rate = (ct - prevT) / DT;
      if (prevRate != null && t > DT * 2 && t < gr) smoothJoin = Math.max(smoothJoin, Math.abs(rate - prevRate) / Math.max(0.2, prevRate));
      prevRate = rate;
      prevT = ct;
    }
    worstStep = Math.max(worstStep, Math.abs(crossW - gw), Math.abs(crossA - ga));
  }
  assert(worstMark < 1e-6, `the coil, the cut's end and the free mark land exactly on the game's (worst ${worstMark.toExponential(1)} s)`);
  assert(worstStep <= DT + 1e-6, `stepping at 60 Hz the clip crosses the coil and the cut's end within one step of the game's marks (worst ${(worstStep * 1000).toFixed(1)} ms)`);
  assert(mono, 'clip time never runs backwards');
  assert(smoothJoin < 0.6, `the joins are eased (the rate changes at most ${(smoothJoin * 100).toFixed(0)} % in a step)`);
  // played through the animator on the game clock: the hit event fires inside the active window
  const body = standIn();
  const h = createHero2(null, { body, library: lib });
  const win = wins[0];
  h.play('_lunge', { fade: 0, manual: true });
  let hitAt = -1, coilAt = -1, t = 0;
  h.on('hit', () => (hitAt = t));
  h.on('coil', () => (coilAt = t));
  for (let i = 0; i < 90; i++) {
    t = (i + 1) * DT;
    h.setTime(h.fit(t, win));
    h.update(DT);
  }
  assert(coilAt >= 0 && Math.abs(coilAt - win.windup) <= DT + 1e-6, `the coil event at ${coilAt.toFixed(3)} s (the game's windup ends at ${win.windup})`);
  assert(hitAt > win.windup - 1e-6 && hitAt <= win.windup + win.active + 1e-6, `the hit event at ${hitAt.toFixed(3)} s, inside the active window (${win.windup} - ${(win.windup + win.active).toFixed(2)})`);
  const a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
  assert(h.bladeSegment('R', a, b) && Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > 1.2 && !h.bladeSegment('L', a, b), `the sword's segment on weaponR (${(HDIM.bladeTip - HDIM.bladeBase).toFixed(2)} m), none in the empty hand`);
  assert(body.props.R === 'sword', "the body was told what the hand holds (setProp('R', 'sword'))");
}

// ------------------------------------------------------------------ engine
function scenEngine() {
  out('-- engine: events, footfalls, guards');
  const body = standIn();
  const h = createHero2(null, { body, library: lib });
  const seen = [];
  h.on('*', (name, e) => seen.push(`${name}${e.side ? ':' + e.side : ''}@${e.f}`));
  h.play('_walk', { fade: 0 });
  const w = test('_walk');
  for (let i = 0; i < Math.round((2 * w.dur) / DT); i++) h.update(DT);
  const ff = seen.filter((s) => s.startsWith('footfall'));
  assert(ff.filter((s) => s.startsWith('footfall:L')).length === 2 && ff.filter((s) => s.startsWith('footfall:R')).length === 2, `two cycles of the walk: two footfalls a foot (${ff.join(' ')})`);
  seen.length = 0;
  h.play('_lunge', { fade: 0.1 });
  for (let i = 0; i < 100; i++) h.update(DT);
  assert(seen.join(' ') === 'coil@24 hit@30 step@34 footfall:R@34 end@77', `the lunge's events in order, each once: ${seen.join(' ')}`);
  assert(h.done && h.time > 1.2, `a one-shot holds its last frame and is done (t ${h.time.toFixed(2)} s)`);
  // a missing clip: the pose holds, one warning
  const w0 = warns.length;
  const q0 = Float32Array.from(h.pose.q);
  const ok1 = h.play('noSuchClip'), ok2 = h.play('noSuchClip');
  h.update(DT);
  let same = true;
  for (let i = 0; i < q0.length; i++) if (Math.abs(q0[i] - h.pose.q[i]) > 1e-6) same = false;
  assert(!ok1 && !ok2 && same && warns.length - w0 === 1, `a missing clip: play() says false, the pose holds, one warning (${warns.length - w0})`);
  // bad input never throws nor poisons the pose
  let threw = false;
  try {
    h.update(NaN);
    h.update(-1);
    h.update(1e9);
    h.play('_walk', { fade: NaN, speed: NaN, at: NaN });
    h.update(DT);
    h.setTime(NaN);
    h.update(DT);
  } catch {
    threw = true;
  }
  let finite = true;
  for (const v of h.world.p) if (!Number.isFinite(v)) finite = false;
  assert(!threw && finite && !body.bad, 'NaN / negative / huge steps and NaN options never throw and keep the pose finite');
  // an empty library: the animator stands at rest
  const e = createHero2(null, { body: standIn(), library: createLibrary([]) });
  e.play('_walk');
  e.update(DT);
  assert(Math.abs(e.world.p[JI.hips * 3 + 1] - HDIM.hipsY) < 1e-6, 'an empty library: he stands at rest');
  // the overlay layer: the arms of the lunge over the walk's legs
  const o = createHero2(null, { body: standIn(), library: lib });
  o.play('_walk', { fade: 0 });
  o.update(DT);
  o.layer('_lunge', { mask: 'upper', weight: 1, fade: 0.1, at: 0.55 });
  for (let i = 0; i < 12; i++) o.update(DT);
  const P = createClipPlayer(lib, { warn: () => {} });
  P.play('_walk', { fade: 0 });
  for (let i = 0; i < 13; i++) P.update(DT);
  const armDiff = deg(qangle(o.pose.q, JI.upperArmR * 4, P.pose.q, JI.upperArmR * 4));
  const legDiff = deg(qangle(o.player.pose.q, JI.shinL * 4, P.pose.q, JI.shinL * 4));
  assert(armDiff > 20 && legDiff < 0.5, `an upper-body overlay moves the arm (${armDiff.toFixed(0)} deg off the walk's) and leaves the legs (${legDiff.toFixed(2)} deg)`);
  // allocations: a long run does not grow the heap much (no per-frame garbage of note)
  if (global.gc) {
    global.gc();
    const m0 = process.memoryUsage().heapUsed;
    for (let i = 0; i < 6000; i++) h.update(DT);
    global.gc();
    const grow = (process.memoryUsage().heapUsed - m0) / 1024;
    assert(grow < 256, `100 s of updates keep the heap (${grow.toFixed(0)} KB)`);
  }
}

// ------------------------------------------------------------------ off
function scenOff() {
  out('-- off: the switch');
  // a fresh process watching every module it resolves (module.registerHooks): main.js's own gate
  const code = `
    import { registerHooks } from 'node:module';
    const seen = [];
    registerHooks({ resolve(spec, ctx, next) { const r = next(spec, ctx); if (r.url.includes('/hero2/')) seen.push(r.url.split('/hero2/')[1]); return r; } });
    const { hero2Wanted, mountHero2 } = await import(${JSON.stringify(pathToFileURL(`${ROOT}/${H2}index.js`).href)});
    const game = {};
    for (const search of ['', '?level=ash', '?hero=old', '?level=grove&lab']) if (hero2Wanted(search)) await mountHero2(game);
    console.log(JSON.stringify({ hero2: game.hero2 === undefined ? 'undefined' : typeof game.hero2, seen, on: hero2Wanted('?hero=new') && hero2Wanted('?hero2=body') }));
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 60000 });
  let res = null;
  try {
    res = JSON.parse(r.stdout.trim().split('\n').pop());
  } catch {
    res = null;
  }
  assert(res && res.hero2 === 'undefined', `with the switch off game.hero2 is ${res?.hero2 ?? '? (' + (r.stderr || '').slice(0, 200) + ')'}`);
  assert(res && res.seen.length === 1 && res.seen[0] === 'index.js', `no hero2 module but the switchboard is loaded (${res?.seen?.join(', ')})`);
  assert(res && res.on, 'the switch reads ?hero=new and ?hero2=<stand>');
  // main.js: the switchboard is its only hero2 import, mounted only behind the switch
  const main = fs.readFileSync(`${ROOT}/src/main.js`, 'utf8');
  const imports = [...main.matchAll(/from '\.\/entities\/hero2\/([^']+)'/g)].map((m) => m[1]);
  assert(imports.length === 1 && imports[0] === 'index.js' && /if \(hero2Wanted\(location\.search\)\) await mountHero2\(game\)/.test(main), `main.js imports only hero2/index.js and mounts behind hero2Wanted (${imports.join(', ')})`);
  const idx = fs.readFileSync(`${ROOT}/${H2}index.js`, 'utf8');
  assert(!/^import /m.test(idx), 'hero2/index.js imports nothing statically (every stand is a lazy import)');
}

const SCENARIOS = { clips: scenClips, smooth: scenSmooth, feet: scenFeet, fit: scenFit, engine: scenEngine, off: scenOff };
const list = SCEN === 'all' ? Object.keys(SCENARIOS) : SCEN.split(',');
for (const name of list) {
  const f = SCENARIOS[name];
  if (!f) {
    out('FAIL unknown scenario', name);
    fails++;
    continue;
  }
  try {
    f();
  } catch (e) {
    fails++;
    out('FAIL', name, 'threw', e?.stack?.split('\n').slice(0, 4).join(' | '));
  }
}
const stray = warns.filter((w) => !/no clip '(noSuchClip|_walk)'/.test(w)); // (the missing-clip and empty-library checks warn on purpose)
if (stray.length) out(`     warnings: ${stray.slice(0, 5).join(' | ')}`);
out(fails ? `hero2: ${fails} FAILED` : 'hero2: all passed');
process.exit(fails ? 1 : 0);
