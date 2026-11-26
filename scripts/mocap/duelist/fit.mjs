// fit.mjs: a MEASURED clip (scripts/mocap -> src/entities/hero2/clips/<set>.js, the 24-joint skeleton)
// turned into a DUELIST blow's pose keys (the boss engine: duelist/poses.js clip keys on today's hero
// rig, anim.js P channels). This is the bridge that lets every boss built on the duelist engine move
// like the owner's reference footage. README.md (this folder) has the method and the map format.
//
//   node scripts/mocap/duelist/fit.mjs scripts/mocap/duelist/<map>.json [blow ...] [--check]
//
// The map names, per blow kind of a boss, which clip and which frames: start (u 0, the windup begins),
// cock (u = the blow's cock, the chamber is full), impact (u 1, the hit event), end (u 2, the
// follow-through done). Reference motion, OUR timings: the clip's windup is stretched onto the beat's
// windup piece by piece, its follow-through onto the beat's follow-through (realise.js).
//
// The retarget (per sampled frame, in the clip's root frame at the IMPACT, its travel taken out: a
// duelist's root motion is the beat's `close` / `dash`, never the keys):
//   body (pitch / yaw / roll)   = the reference's pelvis orientation;  hip* = 0
//   spine (spX / spY / spZ)     = pelvis -> ribcage;   head (hdX / hdY / hdZ) = ribcage -> head
//   the body's place            = the reference's hip joints, scaled by leg length onto ours
//   hands (rH / lH)             = OUR shoulder + the reference's upper-arm and forearm DIRECTIONS at our
//                                 bone lengths (arm angles kept exactly), as offsets in body axes
//   elbow poles (rP / lP)       = where the reference's elbow sits off the shoulder-hand line
//   feet (rF / lF)              = the reference's ankles, scaled (ground kept), knee poles the same way,
//                                 foot yaw from heel to toe
// `--check` poses today's rig with every key through the real animator (anim.js apply) and prints how
// far our elbows, hands, knees and ankles land from the retargeted reference (cm).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const THREE = await import(pathToFileURL(path.join(ROOT, 'node_modules/three/build/three.module.js')).href);
const { JI, createPose, createWorld, restOffsets, solveFK } = await imp('src/entities/hero2/skeleton.js');
const { HDIM } = await imp('src/entities/hero2/dims.js');
const { decodeClip, sampleClip } = await imp('src/entities/hero2/clip.js');
const { DIM } = await imp('src/entities/player/heroDims.js');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const pos = args.filter((a) => !a.startsWith('--'));
const mapPath = path.resolve(pos[0] ?? path.join(HERE, 'tianlei.json'));
const MAP = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const want = new Set(pos.slice(1));

// ---------------------------------------------------------------- our rig's FK (model.js buildHero)
const ANK = DIM.ankle;
const K = (DIM.thigh + DIM.shin + DIM.ankle) / (HDIM.thigh + HDIM.shin + HDIM.ankle); // reference -> our metres
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rig = (() => {
  const g = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.order = 'YXZ'; parent?.add(o); return o; };
  const root = g(null, 0, 0, 0);
  const body = g(root, 0, DIM.pivot, 0);
  const pelvis = g(body, ...DIM.pelvis);
  const spine = g(pelvis, ...DIM.spine);
  const chest = g(spine, ...DIM.chest);
  const head = g(chest, ...DIM.neck);
  const shR = g(chest, -DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]);
  const shL = g(chest, DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]);
  const anR = g(chest, -DIM.gripShoulder[0], DIM.gripShoulder[1], DIM.gripShoulder[2]); // the sword hand's target origin
  const hipR = g(pelvis, -DIM.hip[0], DIM.hip[1], DIM.hip[2]);
  const hipL = g(pelvis, DIM.hip[0], DIM.hip[1], DIM.hip[2]);
  return { root, body, pelvis, spine, chest, head, shR, shL, anR, hipR, hipL };
})();
const wp = (o) => o.getWorldPosition(V());

// ---------------------------------------------------------------- the reference clip, sampled
const REST = restOffsets(HDIM);
const pose = createPose(HDIM);
const W = createWorld();
const sets = new Map();
async function clipOf(set, name) {
  if (!sets.has(set)) sets.set(set, (await imp(`src/entities/hero2/clips/${set}.js`)).default);
  const raw = sets.get(set).clips.find((c) => c.name === name);
  if (!raw) throw new Error(`no clip ${set}/${name}`);
  const clip = decodeClip(raw, set);
  if (clip.problems?.length) throw new Error(`${set}/${name}: ${clip.problems.join('; ')}`);
  return clip;
}
const ev = (clip, name) => clip.events?.find((e) => e.name === name)?.f;
const rootYaw = (clip, f) => {
  const i = Math.max(0, Math.min(clip.n - 1, Math.round(f)));
  return clip.root[i * 3 + 2];
};
/** World (impact-frame root axes, travel removed) positions and rotations of the reference at frame f. */
function refAt(clip, f, yaw0) {
  sampleClip(clip, Math.max(0, Math.min(clip.n - 1, f)), pose, false);
  pose.root[0] = 0;
  pose.root[1] = 0;
  pose.root[2] = rootYaw(clip, f) - yaw0;
  solveFK(pose, REST, W);
  const p = (n) => V(W.p[JI[n] * 3], W.p[JI[n] * 3 + 1], W.p[JI[n] * 3 + 2]);
  const r = (n) => new THREE.Quaternion(W.r[JI[n] * 4], W.r[JI[n] * 4 + 1], W.r[JI[n] * 4 + 2], W.r[JI[n] * 4 + 3]);
  // the hand's end: the fist's middle, a palm past the wrist along the forearm
  const fist = (s) => { const e = p('foreArm' + s), w = p('hand' + s); return w.clone().add(w.clone().sub(e).normalize().multiplyScalar(HDIM.palm)); };
  return {
    hips: r('hips'), chest: r('chest'), head: r('head'),
    hipR: p('thighR'), hipL: p('thighL'), kneeR: p('shinR'), kneeL: p('shinL'), ankR: p('footR'), ankL: p('footL'), toeR: p('toeR'), toeL: p('toeL'),
    shR: p('upperArmR'), shL: p('upperArmL'), elR: p('foreArmR'), elL: p('foreArmL'), fiR: fist('R'), fiL: fist('L'),
  };
}

// ---------------------------------------------------------------- one frame -> one key
const _e = new THREE.Euler();
const eul = (q) => { _e.setFromQuaternion(q, 'YXZ'); return [_e.x, _e.y, _e.z]; }; // the rig's joints turn in YXZ order (model.js joint())
const r3 = (v) => Math.round(v * 1000) / 1000;
const arr = (v) => [r3(v.x), r3(v.y), r3(v.z)];
/** A pole: where a joint sits off the line from a to c (the bend's direction), unit; `fb` if straight. */
function pole(a, b, c, fb) {
  const ac = c.clone().sub(a), t = ac.lengthSq() > 1e-9 ? b.clone().sub(a).dot(ac) / ac.lengthSq() : 0;
  const off = b.clone().sub(a.clone().addScaledVector(ac, t));
  return off.length() > 0.01 ? off.normalize() : fb.clone();
}
/** The key for one reference frame (and the retargeted points it aims at, for --check). */
function keyOf(R) {
  const out = {};
  // the body: the reference's pelvis orientation; its place from the hip joints
  const qB = R.hips.clone();
  [out.pitch, out.yaw, out.roll] = eul(qB);
  const hipMid = R.hipR.clone().add(R.hipL).multiplyScalar(0.5 * K);
  // our hip joints' middle is DIM.hip[1] under the pelvis, the pelvis DIM.pelvis under the body joint
  const pelv = hipMid.clone().sub(V(0, DIM.hip[1], 0).applyQuaternion(qB));
  const bodyP = pelv.clone().sub(V(...DIM.pelvis).applyQuaternion(qB));
  out.bX = bodyP.x;
  out.bY = bodyP.y - DIM.pivot;
  out.bZ = bodyP.z;
  out.hipX = 0; out.hip = 0; out.hipZ = 0;
  const qS = R.hips.clone().invert().multiply(R.chest);
  [out.spX, out.spY, out.spZ] = eul(qS);
  const qH = R.chest.clone().invert().multiply(R.head);
  [out.hdX, out.hdY, out.hdZ] = eul(qH);
  // pose our FK with it
  rig.body.position.copy(bodyP);
  rig.body.rotation.set(out.pitch, out.yaw, out.roll);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.spine.rotation.set(out.spX, out.spY, out.spZ);
  rig.head.rotation.set(out.hdX, out.hdY, out.hdZ);
  rig.root.updateMatrixWorld(true);
  const toBody = rig.body.getWorldQuaternion(new THREE.Quaternion()).invert();
  const aim = {};
  // arms: our shoulder + the reference's bone directions at our lengths
  for (const [s, sh, an, hk, pk] of [['R', rig.shR, rig.anR, 'rH', 'rP'], ['L', rig.shL, rig.shL, 'lH', 'lP']]) {
    const S = wp(sh);
    const u = R['el' + s].clone().sub(R['sh' + s]).normalize(), f = R['fi' + s].clone().sub(R['el' + s]).normalize();
    const E = S.clone().addScaledVector(u, DIM.upperArm), T = E.clone().addScaledVector(f, DIM.foreArm);
    out[hk] = arr(T.clone().sub(wp(an)).applyQuaternion(toBody));
    out[pk] = arr(pole(S, E, T, V(s === 'R' ? -0.8 : 0.8, -0.6, -0.1).normalize()).applyQuaternion(toBody));
    aim['el' + s] = E; aim['fi' + s] = T; aim['sh' + s] = S;
  }
  // legs: the reference's ankles scaled (the ground kept), the knees' bend, the feet's yaw
  for (const [s, hip, fk, kk, yk] of [['R', rig.hipR, 'rF', 'rK', 'rFy'], ['L', rig.hipL, 'lF', 'lK', 'lFy']]) {
    const A = R['ank' + s].clone().multiplyScalar(K);
    A.y = Math.max(ANK, A.y - (HDIM.ankle * K - ANK)); // a planted ankle sits at OUR ankle height
    out[fk] = A.y < ANK + 0.012 ? [r3(A.x), r3(A.z)] : arr(A);
    const H = wp(hip), Kn = R['knee' + s].clone().multiplyScalar(K);
    out[kk] = arr(pole(H, Kn, A, V(s === 'R' ? -0.3 : 0.3, 0, 1).normalize()).applyQuaternion(toBody));
    const toe = R['toe' + s].clone().sub(R['ank' + s]);
    out[yk] = Math.atan2(toe.x, toe.z);
    aim['kn' + s] = Kn; aim['an' + s] = A;
  }
  out.flat = 0.95;
  return { key: out, aim };
}

// ---------------------------------------------------------------- a blow: frames -> keys on the u clock
const SCAL = ['pitch', 'yaw', 'roll', 'spX', 'spY', 'spZ', 'hdX', 'hdY', 'hdZ', 'rFy', 'lFy'];
async function fitBlow(name, B) {
  const clip = await clipOf(B.set, B.clip);
  const fps = clip.fps;
  const fr = (v, d) => (v == null ? d : typeof v === 'string' && v.endsWith('s') ? parseFloat(v) * fps : Number(v));
  const fi = fr(B.impact, ev(clip, 'hit'));
  if (!(fi >= 0)) throw new Error(`${name}: no impact frame (give "impact" or a hit event)`);
  const f0 = fr(B.start, 0), fc = fr(B.cock, clip.phases?.windup ?? (f0 + fi) / 2), fe = fr(B.end, Math.min(clip.n - 1, fi + 0.3 * fps));
  const cock = B.u_cock ?? 0.7;
  if (!(f0 < fc && fc < fi && fi < fe)) throw new Error(`${name}: frames must rise: start ${f0} cock ${fc} impact ${fi} end ${fe}`);
  const uOf = (f) => (f <= fc ? (cock * (f - f0)) / (fc - f0) : f <= fi ? cock + ((1 - cock) * (f - fc)) / (fi - fc) : 1 + (f - fi) / (fe - fi));
  // sample: every `every` frames in each piece, plus the piece ends (the cock, the impact, the end)
  const ev3 = B.every ?? [6, 3, 5];
  const frames = new Set([f0, fc, fi, fe]);
  for (const [a, b, st] of [[f0, fc, ev3[0]], [fc, fi, ev3[1]], [fi, fe, ev3[2]]]) for (let f = a + st; f < b - st * 0.5; f += st) frames.add(f);
  const list = [...frames].sort((a, b) => a - b);
  const yaw0 = rootYaw(clip, fi) + ((B.turn ?? 0) * Math.PI) / 180;
  const keys = [], aims = [];
  for (const f of list) {
    const { key, aim } = keyOf(refAt(clip, f, yaw0));
    const u = uOf(f);
    if (u > cock - 1e-6 && u <= 1 + 1e-6 && u > 1e-6) key.e = u >= 1 - 1e-6 ? 'l' : 'i';
    if (B.gather !== false && u < cock * 0.5) key.gather = true;
    keys.push([r3(u), key]);
    aims.push(aim);
  }
  // angles continuous from key to key (no 2 pi jumps)
  for (const c of SCAL) for (let i = 1; i < keys.length; i++) {
    let d = keys[i][1][c] - keys[i - 1][1][c];
    while (d > Math.PI) { keys[i][1][c] -= 2 * Math.PI; d -= 2 * Math.PI; }
    while (d < -Math.PI) { keys[i][1][c] += 2 * Math.PI; d += 2 * Math.PI; }
  }
  for (const [, k] of keys) for (const c of [...SCAL, 'bX', 'bY', 'bZ', 'hipX', 'hip', 'hipZ', 'flat']) k[c] = r3(k[c]);
  return { keys, aims, cock, mirror: !!B.mirror, src: `${B.set}/${B.clip} f${f0}-${fe} (cock ${fc}, impact ${fi}) @${fps}fps` };
}

// ---------------------------------------------------------------- --check: through the real animator
async function checker() {
  const { ui, resetWindow } = await import(pathToFileURL(path.join(ROOT, 'tests/integration/shim.mjs')).href);
  void ui; resetWindow?.();
  const { createSharedUniforms } = await imp('src/render/shaderLib.js');
  const { buildHero } = await imp('src/entities/player/model.js');
  const { HeroAnimator, P, N } = await imp('src/entities/player/anim.js');
  const U = createSharedUniforms();
  const r = buildHero(U);
  const pilot = { vel: V(), yaw: 0, state: 'idle', stateTime: 0, alive: true };
  const A = new HeroAnimator(r, pilot, null);
  if (MAP.armSoft) A.armSoft = MAP.armSoft;
  const p = new Float32Array(N);
  const S = { bX: P.bodyX, bY: P.bodyY, bZ: P.bodyZ, pitch: P.pitch, yaw: P.yaw, roll: P.roll, hip: P.pelvY, hipZ: P.pelvZ, hipX: P.pelvX, spX: P.spX, spY: P.spY, spZ: P.spZ, hdX: P.hdX, hdY: P.hdY, hdZ: P.hdZ, flat: P.footFlat, rFy: P.rFy, lFy: P.lFy };
  const Vx = { rH: P.rH, rP: P.rP, lH: P.lH, lP: P.lP, rK: P.rK, lK: P.lK };
  return (key, aim) => {
    p.fill(0);
    p[P.swD + 2] = 1; p[P.swF + 1] = 1; p[P.rFf] = 1; p[P.lFf] = 1;
    for (const [k, i] of Object.entries(S)) if (key[k] != null) p[i] = key[k];
    for (const [k, i] of Object.entries(Vx)) if (key[k]) { p[i] = key[k][0]; p[i + 1] = key[k][1]; p[i + 2] = key[k][2]; }
    for (const [k, i] of [['rF', P.rF], ['lF', P.lF]]) { const v = key[k]; if (v.length === 2) { p[i] = v[0]; p[i + 1] = ANK; p[i + 2] = v[1]; } else { p[i] = v[0]; p[i + 1] = v[1]; p[i + 2] = v[2]; } }
    A.key = 'attack';
    A.apply(p);
    r.root.updateMatrixWorld(true);
    const d = (o, t) => wp(o).distanceTo(t) * 100;

    const fistEnd = (arm) => arm.fore.localToWorld(V(0, -DIM.foreArm, 0));
    if (process.env.FIT_DEBUG) console.log('   R el', d(r.arms.R.fore, aim.elR).toFixed(0), 'L el', d(r.arms.L.fore, aim.elL).toFixed(0), 'shR real', arr(wp(r.arms.R.upper)), 'mine', arr(aim.shR), 'L real', arr(wp(r.arms.L.upper)), 'aimFiR', arr(aim.fiR), 'realFiR', arr(fistEnd(r.arms.R)));
    return {
      el: Math.max(d(r.arms.R.fore, aim.elR), d(r.arms.L.fore, aim.elL)),
      fist: Math.max(fistEnd(r.arms.R).distanceTo(aim.fiR), fistEnd(r.arms.L).distanceTo(aim.fiL)) * 100,
      knee: Math.max(d(r.legs.R.shin, aim.knR), d(r.legs.L.shin, aim.knL)),
      ank: Math.max(d(r.legs.R.foot, aim.anR), d(r.legs.L.foot, aim.anL)),
    };
  };
}

// ---------------------------------------------------------------- main
const blows = {};
const check = CHECK ? await checker() : null;
for (const [name, B] of Object.entries(MAP.blows)) {
  if (want.size && !want.has(name)) continue;
  if (B.skip) continue;
  const res = await fitBlow(name, B);
  blows[name] = res;
  let line = `${name.padEnd(10)} ${res.keys.length} keys  ${res.src}${res.mirror ? '  (mirrored)' : ''}`;
  if (check) {
    const worst = { el: 0, fist: 0, knee: 0, ank: 0 };
    res.keys.forEach(([u, k], i) => { const e = check(k, res.aims[i]); if (process.env.FIT_DEBUG) console.log("  u", u, JSON.stringify(e, (kk, v) => (typeof v === "number" ? Math.round(v) : v))); for (const c in worst) worst[c] = Math.max(worst[c], e[c]); });
    line += `\n           worst off the reference (cm): elbow ${worst.el.toFixed(1)}  fist ${worst.fist.toFixed(1)}  knee ${worst.knee.toFixed(1)}  ankle ${worst.ank.toFixed(1)}`;
  }
  console.log(line);
}

// write the boss's module: every blow in the map, the ones not fitted this run kept from the last file
const outPath = path.join(ROOT, MAP.out);
let old = {};
if (want.size && fs.existsSync(outPath)) old = (await import(pathToFileURL(outPath).href + `?t=${Date.now()}`)).REF_BLOWS ?? {};
const all = { ...old };
for (const [n, b] of Object.entries(blows)) all[n] = { src: b.src, mirror: b.mirror, cock: b.cock, keys: b.keys };
const body = Object.keys(MAP.blows).filter((n) => all[n]).map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(all[n])},`).join('\n');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `// GENERATED by scripts/mocap/duelist/fit.mjs from ${path.relative(ROOT, mapPath).replace(/\\/g, '/')} (motion measured from the
// owner's reference footage, retargeted onto today's rig). Do not edit by hand: change the map or the clip
// and run the fit again. Keys: [u, pose] on a blow's clock (0 windup start, cock, 1 impact, 2 follow-through
// done; duelist/realise.js), in the duelist clip-key format (duelist/poses.js header).
export const REF_BLOWS = {
${body}
};
`);
console.log(`wrote ${MAP.out} (${Object.keys(all).length} blows)`);
