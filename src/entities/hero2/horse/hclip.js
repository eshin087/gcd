// The horse's clips: the hero's clip FORMAT (../README.md "Clip format") on the horse's skeleton. The
// hero's decoder (../clip.js decodeClip / sampleClip) is bound to the hero's 24 joints, so this is its
// thin copy for HJ joints; everything that does not depend on the skeleton is the hero's own code
// (base64, frameIn, rootDelta, contactWeight, the root's 2D transforms).
//
// Differences from a hero clip: `joints` indexes HJOINTS; `hips` is the PELVIS joint's position;
// `contact` has four sides, FL / FR / HL / HR (a hoof's ground point is pinned through each span).
import { HJ } from './hskeleton.js';
import { HORSE } from './hdims.js';
import { b64bytes, frameIn, rootDelta, contactWeight, rrelative, rcompose, encodeQ, encodeF32 } from '../clip.js';
import { qslerp, qnorm } from '../qmath.js';

export { frameIn, rootDelta, contactWeight, encodeQ, encodeF32 };
export const HOOVES = ['FL', 'FR', 'HL', 'HR'];

const int16s = (s) => {
  const b = b64bytes(s), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = new Int16Array(b.byteLength >> 1);
  for (let i = 0; i < out.length; i++) out[i] = dv.getInt16(i * 2, true);
  return out;
};
const float32s = (s) => {
  const b = b64bytes(s), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = new Float32Array(b.byteLength >> 2);
  for (let i = 0; i < out.length; i++) out[i] = dv.getFloat32(i * 4, true);
  return out;
};
const wrapPi = (a) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};

/** Decode one raw horse clip into typed arrays (the hero's decoded shape). Never throws. */
export function decodeHorseClip(raw, set = null) {
  const problems = [];
  const r = raw ?? {};
  const name = typeof r.name === 'string' ? r.name : '?';
  const fps = Number(r.fps) > 0 ? Number(r.fps) : 30;
  let n = Number.isInteger(r.n) && r.n >= 2 ? r.n : 0;
  if (!n) {
    problems.push(`n must be an integer >= 2 (${r.n})`);
    n = 2;
  }
  const loop = !!r.loop;
  const joints = Array.isArray(r.joints) ? r.joints.filter((j) => Number.isInteger(j) && j >= 0 && j < HJ) : Array.from({ length: HJ }, (_, i) => i);
  const jn = joints.length;
  const q = new Float32Array(n * HJ * 4);
  for (let i = 0; i < n * HJ; i++) q[i * 4 + 3] = 1;
  let qi = null;
  try {
    qi = int16s(r.q);
  } catch {
    qi = null;
  }
  if (!qi || qi.length !== n * jn * 4) problems.push(`q holds ${qi?.length ?? 0} values, expected ${n * jn * 4}`);
  else
    for (let f = 0; f < n; f++)
      for (let k = 0; k < jn; k++) {
        const s = (f * jn + k) * 4, d = (f * HJ + joints[k]) * 4;
        for (let c = 0; c < 4; c++) q[d + c] = qi[s + c] / 32767;
        qnorm(q, d);
        if (f > 0) {
          const p = d - HJ * 4;
          if (q[p] * q[d] + q[p + 1] * q[d + 1] + q[p + 2] * q[d + 2] + q[p + 3] * q[d + 3] < 0) for (let c = 0; c < 4; c++) q[d + c] = -q[d + c];
        }
      }
  let hips = null, root = null;
  try {
    hips = float32s(r.hips);
  } catch {
    hips = null;
  }
  if (!hips || hips.length !== n * 3) {
    problems.push('hips: wrong length');
    hips = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) {
      hips[f * 3 + 1] = HORSE.pelvisY;
      hips[f * 3 + 2] = HORSE.pelvisZ;
    }
  }
  try {
    root = float32s(r.root);
  } catch {
    root = null;
  }
  if (!root || root.length !== n * 3) {
    problems.push('root: wrong length');
    root = new Float32Array(n * 3);
  }
  for (let i = 0; i < hips.length; i++) if (!Number.isFinite(hips[i])) hips[i] = 0;
  for (let i = 0; i < root.length; i++) if (!Number.isFinite(root[i])) root[i] = 0;
  for (let f = 1; f < n; f++) root[f * 3 + 2] = root[(f - 1) * 3 + 2] + wrapPi(root[f * 3 + 2] - root[(f - 1) * 3 + 2]);
  // a loop's whole cycle (clip.js's rule: the last frame and one more mean step)
  const cyc = new Float64Array(3);
  if (loop && n >= 3) {
    const s0 = new Float64Array(3), s1 = new Float64Array(3);
    rrelative(s0, root, 0, root, 3);
    rrelative(s1, root, (n - 2) * 3, root, (n - 1) * 3);
    for (let i = 0; i < 3; i++) s0[i] = (s0[i] + s1[i]) * 0.5;
    rcompose(cyc, root, (n - 1) * 3, s0, 0);
  } else {
    cyc[0] = root[(n - 1) * 3];
    cyc[1] = root[(n - 1) * 3 + 1];
    cyc[2] = root[(n - 1) * 3 + 2];
  }
  const contact = {};
  for (const side of HOOVES) {
    const list = Array.isArray(r.contact?.[side]) ? r.contact[side] : [];
    const out = [];
    for (const s of list) {
      if (!Array.isArray(s) || s.length !== 2 || !s.every(Number.isFinite)) {
        problems.push(`contact.${side}: bad span`);
        continue;
      }
      let [a, b] = s;
      a = Math.max(0, Math.min(n - 1, a));
      b = loop ? b : Math.max(a, Math.min(n - 1, b));
      if (loop && b < a) b += n;
      out.push([a, b]);
    }
    if (loop && out.length > 1) {
      const end = out.findIndex((s) => s[1] === n - 1), start = out.findIndex((s) => s[0] === 0);
      if (end >= 0 && start >= 0 && end !== start) {
        out[end] = [out[end][0], n + out[start][1]];
        out.splice(start, 1);
      }
    }
    contact[side] = out;
  }
  const events = Array.isArray(r.events) ? r.events.filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.f)).map((e) => ({ f: e.f, name: e.name })).sort((a, b) => a.f - b.f) : [];
  const dur = loop ? n / fps : Math.max(1e-3, (n - 1) / fps);
  return {
    name, title: String(r.title ?? name), src: String(r.src ?? ''), fps, n, loop, dur,
    set: set?.set ?? '', setTitle: set?.title ?? '', joints: r.joints ?? null,
    q, hips, root, cyc, speed: Number.isFinite(r.speed) ? r.speed : null, contact, events,
    phases: r.phases ?? null, gait: r.gait ?? null, rider: r.rider ?? null, from: r.from ?? null, to: r.to ?? null, problems,
  };
}

/** The clip's pose at frame position u (frameIn already applied) into pose.q / pose.hips. */
export function sampleHorseClip(clip, u, pose, loop = clip.loop) {
  const n = clip.n, Q = clip.q, H = clip.hips, q = pose.q, h = pose.hips;
  let i0 = Math.floor(u);
  if (i0 < 0) i0 = 0;
  if (i0 > n - 1) i0 = n - 1;
  const i1 = i0 + 1 < n ? i0 + 1 : loop ? 0 : n - 1;
  const t = u - i0;
  const a = i0 * HJ * 4, b = i1 * HJ * 4;
  if (t < 1e-6) for (let k = 0; k < HJ * 4; k++) q[k] = Q[a + k];
  else for (let j = 0; j < HJ; j++) qslerp(q, j * 4, Q, a + j * 4, Q, b + j * 4, t);
  for (let c = 0; c < 3; c++) h[c] = H[i0 * 3 + c] + (H[i1 * 3 + c] - H[i0 * 3 + c]) * t;
}

/** Decode horse clip sets ({ set, title, clips }) in order: { sets, clips, get, has, problems }. */
export function createHorseLibrary(sets = []) {
  const lib = { sets: [], clips: [], byName: new Map(), problems: [] };
  for (const s of sets) {
    const mod = s?.default ?? s;
    if (!mod || !Array.isArray(mod.clips)) continue;
    const entry = { id: String(mod.set ?? ''), title: String(mod.title ?? ''), clips: [] };
    for (const raw of mod.clips) {
      const c = decodeHorseClip(raw, mod);
      if (lib.byName.has(c.name)) {
        lib.problems.push({ clip: c.name, text: 'name taken' });
        continue;
      }
      for (const p of c.problems) lib.problems.push({ clip: c.name, text: p });
      entry.clips.push(c);
      lib.clips.push(c);
      lib.byName.set(c.name, c);
    }
    lib.sets.push(entry);
  }
  lib.get = (name) => lib.byName.get(name) ?? null;
  lib.has = (name) => lib.byName.has(name);
  return lib;
}
