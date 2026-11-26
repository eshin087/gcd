// The clip-set checker: loads a set module, decodes every clip and checks the format rules of
// src/entities/hero2/README.md with the game's own skeleton (skeleton.js solveFK). Light (pure JS).
//   node scripts/mocap/check.mjs src/entities/hero2/clips/<set>.js [--json]
// Exit code 1 when a rule fails. Numbers per clip: frames, the worst quaternion norm error, sign flips,
// the wrap pop of a loop, contact spans, the worst planted-foot slide (cm), the lowest foot point (cm),
// the root on frame 0, the speed (loops: measured from the root vs the declared one).
import path from 'node:path';
import url from 'node:url';
import { J, JI, restOffsets, createPose, createWorld, solveFK } from '../../src/entities/hero2/skeleton.js';
import { HDIM } from '../../src/entities/hero2/dims.js';

const file = process.argv[2];
const asJson = process.argv.includes('--json');
const set = (await import(url.pathToFileURL(path.resolve(file)).href)).default;

function dec(b64, Type) {
  const buf = Buffer.from(b64, 'base64');
  return new Type(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const rest = restOffsets(HDIM);
const fails = [];
const report = [];
const names = new Set();
for (const c of set.clips) {
  const bad = (m) => fails.push(`${c.name}: ${m}`);
  if (names.has(c.name)) bad('duplicate name');
  names.add(c.name);
  for (const k of ['name', 'title', 'src', 'fps', 'n', 'q', 'hips', 'root', 'contact']) if (c[k] === undefined) bad(`missing ${k}`);
  const joints = c.joints || [...Array(J).keys()];
  const nj = joints.length;
  const q = dec(c.q, Int16Array);
  const hips = dec(c.hips, Float32Array);
  const root = dec(c.root, Float32Array);
  if (q.length !== c.n * nj * 4) bad(`q has ${q.length} values, expected ${c.n * nj * 4}`);
  if (hips.length !== c.n * 3) bad(`hips has ${hips.length} values, expected ${c.n * 3}`);
  if (root.length !== c.n * 3) bad(`root has ${root.length} values`);
  if (/\d/.test(c.src) && !/^(move|sword) /.test(c.src)) bad(`src must start with the film id: ${c.src}`);
  // quaternions: unit and continuous
  let normErr = 0, flips = 0, maxStep = 0, wrap = 0;
  const ang = (f0, f1, j) => {
    let d = 0;
    for (let k = 0; k < 4; k++) d += q[(f0 * nj + j) * 4 + k] * q[(f1 * nj + j) * 4 + k];
    d /= 32767 * 32767;
    return { d, a: 2 * Math.acos(Math.min(1, Math.abs(d))) };
  };
  for (let f = 0; f < c.n; f++) {
    for (let j = 0; j < nj; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += (q[(f * nj + j) * 4 + k] / 32767) ** 2;
      normErr = Math.max(normErr, Math.abs(Math.sqrt(s) - 1));
      if (f > 0) {
        const { d, a } = ang(f - 1, f, j);
        if (d < 0) flips++;
        maxStep = Math.max(maxStep, a);
      }
    }
  }
  if (c.loop) for (let j = 0; j < nj; j++) wrap = Math.max(wrap, ang(c.n - 1, 0, j).a);
  if (normErr > 2e-3) bad(`quaternion norm off by ${normErr.toFixed(4)}`);
  if (flips) bad(`${flips} quaternion sign flips between frames`);
  // FK per frame: feet, contact, slide
  const pose = createPose(HDIM);
  const world = createWorld();
  const foot = { L: [], R: [] };
  let lowest = Infinity;
  for (let f = 0; f < c.n; f++) {
    for (let j = 0; j < J; j++) { pose.q[j * 4] = 0; pose.q[j * 4 + 1] = 0; pose.q[j * 4 + 2] = 0; pose.q[j * 4 + 3] = 1; }
    for (let k = 0; k < nj; k++) for (let m = 0; m < 4; m++) pose.q[joints[k] * 4 + m] = q[(f * nj + k) * 4 + m] / 32767;
    pose.hips.set(hips.subarray(f * 3, f * 3 + 3));
    pose.root.set(root.subarray(f * 3, f * 3 + 3));
    solveFK(pose, rest, world);
    for (const s of ['L', 'R']) {
      const a = JI['foot' + s] * 3, t = JI['toe' + s] * 3;
      foot[s].push([world.p[a], world.p[a + 1], world.p[a + 2]]);
      lowest = Math.min(lowest, world.p[a + 1] - HDIM.ankle, world.p[t + 1]);
    }
  }
  let slide = 0;
  const spans = { L: 0, R: 0 };
  for (const s of ['L', 'R']) {
    for (const [a, b] of c.contact[s] || []) {
      spans[s]++;
      if (!(a >= 0 && b < c.n && a <= b)) bad(`contact ${s} [${a}, ${b}] out of range`);
      const p0 = foot[s][a];
      for (let f = a; f <= b && f < c.n; f++) {
        const p = foot[s][f];
        slide = Math.max(slide, Math.hypot(p[0] - p0[0], p[2] - p0[2]) * 100);
      }
    }
  }
  if (slide > 3) bad(`a planted foot slides ${slide.toFixed(1)} cm`);
  if (Math.hypot(root[0], root[1], root[2]) > 1e-4) bad('the root is not at 0, 0, 0 on frame 0');
  if (lowest < -0.03) bad(`a foot goes ${(-lowest * 100).toFixed(1)} cm into the ground`);
  let speed = null;
  if (c.loop) {
    const step = Math.hypot(root[(c.n - 1) * 3] - root[0], root[(c.n - 1) * 3 + 1] - root[1]) * c.n / (c.n - 1);
    speed = step / (c.n / c.fps);
    if (c.speed !== undefined && Math.abs(speed - c.speed) > 0.05 * Math.max(c.speed, 0.2)) bad(`speed ${c.speed} but the root moves at ${speed.toFixed(2)}`);
  }
  if (c.phases) {
    const p = c.phases;
    if (!(p.windup <= p.active && p.active <= p.recover && p.recover <= c.n)) bad(`phases out of order ${JSON.stringify(p)}`);
  }
  for (const e of c.events || []) if (!(e.f >= 0 && e.f < c.n)) bad(`event ${e.name} at frame ${e.f} out of range`);
  report.push({
    name: c.name, n: c.n, fps: c.fps, loop: !!c.loop,
    normErr: +normErr.toFixed(4), flips, maxStepDeg: +(maxStep * 57.3).toFixed(1), wrapDeg: c.loop ? +(wrap * 57.3).toFixed(1) : null,
    contactSpans: spans, slideCm: +slide.toFixed(2), lowestCm: +(lowest * 100).toFixed(1),
    speed: speed === null ? null : +speed.toFixed(3),
  });
}
if (asJson) console.log(JSON.stringify({ report, fails }, null, 1));
else {
  console.log(`check ${set.set}: ${set.clips.length} clips`);
  for (const r of report) {
    console.log(`  ${r.name.padEnd(14)} ${String(r.n).padStart(4)} f @${r.fps}${r.loop ? ' loop' : '     '}  |q|err ${r.normErr}  flips ${r.flips}  max step ${r.maxStepDeg} deg` +
      (r.loop ? `  wrap ${r.wrapDeg} deg` : '') + `  contact L${r.contactSpans.L}/R${r.contactSpans.R}  slide ${r.slideCm} cm  lowest ${r.lowestCm} cm` +
      (r.speed !== null ? `  speed ${r.speed} m/s` : ''));
  }
  for (const f of fails) console.log('  FAIL ' + f);
  console.log(fails.length ? `${fails.length} failures` : 'all rules pass');
}
process.exit(fails.length ? 1 : 0);
