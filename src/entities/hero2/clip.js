// Clip data for the hero2 engine (format: README.md "Clip format"): decode a clip set once into typed
// arrays, check the format's rules, and sample a decoded clip at any time. Pure (no THREE), so the
// headless suite and the offline clip builders run it as the game does.
//
// A DECODED clip:
//   { name, title, src, fps, n, loop, dur, set, setTitle, joints,
//     q: Float32Array(n * J * 4)  every joint's local rotation per frame (a joint the clip leaves out
//                                 holds the identity: its rest rotation),
//     hips: Float32Array(n * 3), root: Float32Array(n * 3)  (x, z, yaw; the yaw unwrapped),
//     cyc: Float64Array(3)       a loop's whole-cycle root transform (where frame n, the wrap, lands),
//     speed, contact: { L: [[a, b]...], R }, phases, events: [{ f, name }] (sorted), props, from, to,
//     problems: [] (format errors found while decoding; warnings in `warnings`) }
// Times: a loop lasts n / fps s (frame n wraps to frame 0); a one-shot (n - 1) / fps s.
import { J, JOINTS, JI, PARENT, restOffsets, createPose, createWorld, solveFK } from './skeleton.js';
import { HDIM } from './dims.js';
import { qslerp, qnorm, qangle, smooth01 } from './qmath.js';

// ------------------------------------------------------------------ base64
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64I = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64I[B64.charCodeAt(i)] = i;

/** base64 -> bytes (no atob: the same in the browser, Node and a worker). */
export function b64bytes(s) {
  s = String(s ?? '').replace(/[^A-Za-z0-9+/]/g, '');
  const n = Math.floor((s.length * 3) / 4);
  const out = new Uint8Array(n);
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64I[s.charCodeAt(i)];
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (o < n) out[o++] = (acc >> bits) & 255;
    }
  }
  return o === n ? out : out.subarray(0, o);
}

/** bytes -> base64 */
export function bytesB64(u8) {
  let s = '';
  let i = 0;
  for (; i + 2 < u8.length; i += 3) {
    const v = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2];
    s += B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63];
  }
  if (i < u8.length) {
    const v = (u8[i] << 16) | ((i + 1 < u8.length ? u8[i + 1] : 0) << 8);
    s += B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + (i + 1 < u8.length ? B64[(v >> 6) & 63] : '=') + '=';
  }
  return s;
}

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

/** Encode float arrays the clip format's way (the offline builders and the test clips use it). */
export function encodeQ(floats) {
  const b = new Uint8Array(floats.length * 2), dv = new DataView(b.buffer);
  for (let i = 0; i < floats.length; i++) dv.setInt16(i * 2, Math.max(-32767, Math.min(32767, Math.round(floats[i] * 32767))), true);
  return bytesB64(b);
}
export function encodeF32(floats) {
  const b = new Uint8Array(floats.length * 4), dv = new DataView(b.buffer);
  for (let i = 0; i < floats.length; i++) dv.setFloat32(i * 4, floats[i], true);
  return bytesB64(b);
}

// ------------------------------------------------------------------ the root's 2D transforms
// A root transform is (x, z, yaw) on the ground: a point and a turn about +Y. Turning by yaw maps his
// own (x, z) to (x cos + z sin, -x sin + z cos) (his front +Z faces (sin yaw, cos yaw)).

/** o = a then b (b expressed in a's frame). o may alias a or b. */
export function rcompose(o, a, ai, b, bi) {
  const c = Math.cos(a[ai + 2]), s = Math.sin(a[ai + 2]);
  const bx = b[bi], bz = b[bi + 1], by = b[bi + 2];
  const x = a[ai] + c * bx + s * bz, z = a[ai + 1] - s * bx + c * bz, y = a[ai + 2] + by;
  o[0] = x;
  o[1] = z;
  o[2] = y;
}
/** o = inverse(a) then b: b seen from a's frame. */
export function rrelative(o, a, ai, b, bi) {
  const c = Math.cos(a[ai + 2]), s = Math.sin(a[ai + 2]);
  const dx = b[bi] - a[ai], dz = b[bi + 1] - a[ai + 1];
  o[0] = c * dx - s * dz;
  o[1] = s * dx + c * dz;
  o[2] = b[bi + 2] - a[ai + 2];
}

const wrapPi = (a) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};

// ------------------------------------------------------------------ decode
const PROP_KINDS = new Set(['sword', 'flask', null]);
const HAND_KINDS = new Set(['fist', 'open', null]);

/** Decode one raw clip (the set file's object) into typed arrays. Never throws: a broken field is
 *  replaced by a still pose and noted in `problems`. */
export function decodeClip(raw, set = null) {
  const problems = [], warnings = [];
  const r = raw ?? {};
  const name = typeof r.name === 'string' ? r.name : '?';
  const fps = Number(r.fps) > 0 ? Number(r.fps) : 30;
  let n = Number.isInteger(r.n) && r.n >= 1 ? r.n : 0;
  if (!(Number.isInteger(r.n) && r.n >= 2)) problems.push(`n must be an integer >= 2 (${r.n})`);
  if (!n) n = 1;
  const loop = !!r.loop;
  let joints = null;
  if (r.joints == null) joints = Array.from({ length: J }, (_, i) => i);
  else if (Array.isArray(r.joints)) {
    joints = r.joints.slice();
    const seen = new Set();
    for (const j of joints) {
      if (!Number.isInteger(j) || j < 0 || j >= J) problems.push(`joints: bad index ${j}`);
      if (seen.has(j)) problems.push(`joints: ${j} twice`);
      seen.add(j);
    }
    joints = joints.filter((j) => Number.isInteger(j) && j >= 0 && j < J);
  } else {
    problems.push('joints must be null or a list of joint indices');
    joints = [];
  }
  const jn = joints.length;
  const q = new Float32Array(n * J * 4);
  for (let i = 0; i < n * J; i++) q[i * 4 + 3] = 1;
  let qi16 = null;
  try {
    qi16 = int16s(r.q);
  } catch {
    qi16 = null;
  }
  if (!qi16 || qi16.length !== n * jn * 4) problems.push(`q holds ${qi16?.length ?? 0} values, expected n * joints * 4 = ${n * jn * 4}`);
  else {
    let flips = 0, unit = 0;
    for (let f = 0; f < n; f++) {
      for (let k = 0; k < jn; k++) {
        const s = (f * jn + k) * 4, d = (f * J + joints[k]) * 4;
        const x = qi16[s] / 32767, y = qi16[s + 1] / 32767, z = qi16[s + 2] / 32767, w = qi16[s + 3] / 32767;
        const l = Math.sqrt(x * x + y * y + z * z + w * w);
        if (Math.abs(l - 1) > 0.01) unit++;
        q[d] = x;
        q[d + 1] = y;
        q[d + 2] = z;
        q[d + 3] = w;
        qnorm(q, d);
        if (f > 0) {
          const p = d - J * 4;
          if (q[p] * q[d] + q[p + 1] * q[d + 1] + q[p + 2] * q[d + 2] + q[p + 3] * q[d + 3] < 0) {
            flips++;
            q[d] = -q[d];
            q[d + 1] = -q[d + 1];
            q[d + 2] = -q[d + 2];
            q[d + 3] = -q[d + 3];
          }
        }
      }
    }
    if (unit) problems.push(`${unit} quaternions are not unit (|q| off by more than 1 %)`);
    if (flips) problems.push(`${flips} quaternion sign flips between frames (fixed on load)`);
  }
  let hips = null, root = null;
  try {
    hips = float32s(r.hips);
  } catch {
    hips = null;
  }
  if (!hips || hips.length !== n * 3) {
    problems.push(`hips holds ${hips?.length ?? 0} values, expected ${n * 3}`);
    hips = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) hips[f * 3 + 1] = HDIM.hipsY;
  }
  try {
    root = float32s(r.root);
  } catch {
    root = null;
  }
  if (!root || root.length !== n * 3) {
    problems.push(`root holds ${root?.length ?? 0} values, expected ${n * 3}`);
    root = new Float32Array(n * 3);
  }
  for (let i = 0; i < hips.length; i++) if (!Number.isFinite(hips[i])) { problems.push('hips: a value is not finite'); hips[i] = 0; }
  for (let i = 0; i < root.length; i++) if (!Number.isFinite(root[i])) { problems.push('root: a value is not finite'); root[i] = 0; }
  if (Math.abs(root[0]) > 1e-4 || Math.abs(root[1]) > 1e-4 || Math.abs(root[2]) > 1e-4) problems.push('root frame 0 must be 0, 0, 0');
  // the yaw unwrapped (a turn past 180 degrees stays continuous)
  for (let f = 1; f < n; f++) root[f * 3 + 2] = root[(f - 1) * 3 + 2] + wrapPi(root[f * 3 + 2] - root[(f - 1) * 3 + 2]);

  // a loop's whole cycle: the last frame, then one more step like the mean of its first and last
  const cyc = new Float64Array(3);
  if (loop && n >= 3) {
    const s0 = new Float64Array(3), s1 = new Float64Array(3);
    rrelative(s0, root, 0, root, 3);
    rrelative(s1, root, (n - 2) * 3, root, (n - 1) * 3);
    s0[0] = (s0[0] + s1[0]) * 0.5;
    s0[1] = (s0[1] + s1[1]) * 0.5;
    s0[2] = (s0[2] + s1[2]) * 0.5;
    rcompose(cyc, root, (n - 1) * 3, s0, 0);
  } else if (n >= 1) {
    cyc[0] = root[(n - 1) * 3];
    cyc[1] = root[(n - 1) * 3 + 1];
    cyc[2] = root[(n - 1) * 3 + 2];
  }

  const spans = (side) => {
    const list = r.contact?.[side];
    if (list == null) return [];
    if (!Array.isArray(list)) {
      problems.push(`contact.${side} must be a list of [from, to] frame spans`);
      return [];
    }
    const outL = [];
    for (const s of list) {
      if (!Array.isArray(s) || s.length !== 2 || !s.every(Number.isFinite)) {
        problems.push(`contact.${side}: bad span ${JSON.stringify(s)}`);
        continue;
      }
      let [a, b] = s;
      if (a < 0 || a > n - 1 || b < 0 || (loop ? b > 2 * n : b > n - 1)) problems.push(`contact.${side}: span ${a}-${b} is outside the clip (0-${n - 1})`);
      if (b < a && !loop) problems.push(`contact.${side}: span ${a}-${b} runs backwards (only a loop's span may wrap)`);
      a = Math.max(0, Math.min(n - 1, a));
      b = loop ? b : Math.max(a, Math.min(n - 1, b));
      if (loop && b < a) b += n; // a span through the wrap: [a, n + b]
      outL.push([a, b]);
    }
    // a loop's span that ends on the last frame and one that starts on frame 0 are ONE plant (the
    // foot stays down through the wrap): [a, n - 1] + [0, b] -> [a, n + b]
    if (loop && outL.length > 1) {
      const end = outL.findIndex((s) => s[1] === n - 1), start = outL.findIndex((s) => s[0] === 0);
      if (end >= 0 && start >= 0 && end !== start) {
        outL[end] = [outL[end][0], n + outL[start][1]];
        outL.splice(start, 1);
      }
    }
    return outL;
  };
  const contact = { L: spans('L'), R: spans('R') };

  let phases = null;
  if (r.phases != null) {
    const p = r.phases;
    if (![p.windup, p.active, p.recover].every(Number.isFinite)) problems.push('phases needs windup, active and recover frames');
    else {
      if (!(p.windup > 0 && p.windup < p.active && p.active < p.recover && p.recover <= n - 1)) problems.push(`phases must run 0 < windup < active < recover <= n - 1 (${p.windup}, ${p.active}, ${p.recover})`);
      phases = { windup: p.windup, active: p.active, recover: p.recover };
    }
  }
  const events = [];
  if (r.events != null) {
    if (!Array.isArray(r.events)) problems.push('events must be a list');
    else
      for (const e of r.events) {
        if (!e || typeof e.name !== 'string' || !Number.isFinite(e.f) || e.f < 0 || e.f > n - 1) problems.push(`events: bad event ${JSON.stringify(e)}`);
        else events.push({ f: e.f, name: e.name });
      }
    events.sort((a, b) => a.f - b.f);
  }
  const props = { R: r.props?.R ?? null, L: r.props?.L ?? null };
  for (const s of ['R', 'L']) if (!PROP_KINDS.has(props[s])) problems.push(`props.${s}: unknown kind ${props[s]}`);
  // optional hand shapes (body.setHand): 'fist' | 'open'; a side left out: the body's own choice
  let hands = null;
  if (r.hands != null) {
    hands = { R: r.hands.R ?? null, L: r.hands.L ?? null };
    for (const s of ['R', 'L']) if (!HAND_KINDS.has(hands[s])) problems.push(`hands.${s}: unknown shape ${hands[s]}`);
  }
  if (!/^_?[a-z][A-Za-z0-9]*$/.test(name)) problems.push(`name '${name}' must be camelCase`);
  if (!(fps === 30 || fps === 60)) warnings.push(`fps ${fps} (the format says 30 or 60)`);
  if (typeof r.title !== 'string' || !r.title) problems.push('title missing');
  if (typeof r.src !== 'string') warnings.push('src missing');
  const dur = loop ? n / fps : Math.max(1e-3, (n - 1) / fps);
  return {
    name, title: String(r.title ?? name), src: String(r.src ?? ''), fps, n, loop, dur,
    set: set?.set ?? set?.id ?? '', setTitle: set?.title ?? '', joints: r.joints == null ? null : joints,
    q, hips, root, cyc,
    speed: Number.isFinite(r.speed) ? r.speed : null, contact, phases, events, props, hands,
    from: r.from ?? null, to: r.to ?? null, problems, warnings,
  };
}

// ------------------------------------------------------------------ sampling
/** Wrap / clamp a frame position into the clip: [0, n) for a loop, [0, n - 1] for a one-shot. */
export function frameIn(clip, u, loop = clip.loop) {
  const n = clip.n;
  if (loop) {
    u %= n;
    return u < 0 ? u + n : u;
  }
  return u <= 0 ? 0 : u >= n - 1 ? n - 1 : u;
}

/** The clip's pose at frame position u (already wrapped / clamped by frameIn) into pose.q / pose.hips.
 *  pose.root is not written (root motion is read with rootDelta). */
export function sampleClip(clip, u, pose, loop = clip.loop) {
  const n = clip.n, Q = clip.q, H = clip.hips, q = pose.q, h = pose.hips;
  let i0 = Math.floor(u);
  if (i0 < 0) i0 = 0;
  if (i0 > n - 1) i0 = n - 1;
  const i1 = i0 + 1 < n ? i0 + 1 : loop ? 0 : n - 1;
  const t = u - i0;
  const a = i0 * J * 4, b = i1 * J * 4;
  if (t < 1e-6) for (let k = 0; k < J * 4; k++) q[k] = Q[a + k];
  else for (let j = 0; j < J; j++) qslerp(q, j * 4, Q, a + j * 4, Q, b + j * 4, t);
  h[0] = H[i0 * 3] + (H[i1 * 3] - H[i0 * 3]) * t;
  h[1] = H[i0 * 3 + 1] + (H[i1 * 3 + 1] - H[i0 * 3 + 1]) * t;
  h[2] = H[i0 * 3 + 2] + (H[i1 * 3 + 2] - H[i0 * 3 + 2]) * t;
}

const _ra = new Float64Array(3), _rb = new Float64Array(3), _rc = new Float64Array(3), _rinv = new Float64Array(3);

/** The root transform at frame position u inside one cycle ([0, n] for a loop: n = the cycle's end). */
function rootIn(clip, u, out) {
  const n = clip.n, R = clip.root;
  if (u <= 0 || n < 2) {
    out[0] = R[0];
    out[1] = R[1];
    out[2] = R[2];
    return;
  }
  const last = n - 1;
  if (u >= last) {
    if (!clip.loop || u <= last) {
      out[0] = R[last * 3];
      out[1] = R[last * 3 + 1];
      out[2] = R[last * 3 + 2];
      return;
    }
    // between the last frame and the wrap (the cycle's end)
    const t = Math.min(1, u - last), C = clip.cyc;
    out[0] = R[last * 3] + (C[0] - R[last * 3]) * t;
    out[1] = R[last * 3 + 1] + (C[1] - R[last * 3 + 1]) * t;
    out[2] = R[last * 3 + 2] + (C[2] - R[last * 3 + 2]) * t;
    return;
  }
  const i = Math.floor(u), t = u - i;
  out[0] = R[i * 3] + (R[i * 3 + 3] - R[i * 3]) * t;
  out[1] = R[i * 3 + 1] + (R[i * 3 + 4] - R[i * 3 + 1]) * t;
  out[2] = R[i * 3 + 2] + (R[i * 3 + 5] - R[i * 3 + 2]) * t;
}

/**
 * The root's motion from frame position u0 to u1 (UNWRAPPED for a loop: u may run past n, each n
 * one more cycle), seen from his own frame at u0: out = [dx, dz, dyaw]. A one-shot clamps.
 */
export function rootDelta(clip, u0, u1, out, loop = clip.loop) {
  const n = clip.n;
  if (!loop) {
    rootIn(clip, Math.max(0, Math.min(n - 1, u0)), _ra);
    rootIn(clip, Math.max(0, Math.min(n - 1, u1)), _rb);
    rrelative(out, _ra, 0, _rb, 0);
    return out;
  }
  const k0 = Math.floor(u0 / n), k1 = Math.floor(u1 / n);
  rootIn(clip, u0 - k0 * n, _ra);
  rootIn(clip, u1 - k1 * n, _rb);
  // T(u0)^-1 * cyc^(k1 - k0) * T(u1)
  _rc[0] = 0;
  _rc[1] = 0;
  _rc[2] = 0;
  const C = clip.cyc;
  if (k1 > k0) for (let k = k0; k < k1 && k < k0 + 64; k++) rcompose(_rc, _rc, 0, C, 0);
  else if (k1 < k0) {
    // the inverse cycle
    _rinv[0] = 0;
    _rinv[1] = 0;
    _rinv[2] = 0;
    rrelative(_rinv, C, 0, _rinv, 0);
    for (let k = k1; k < k0 && k < k1 + 64; k++) rcompose(_rc, _rc, 0, _rinv, 0);
  }
  rcompose(_rc, _rc, 0, _rb, 0);
  rrelative(out, _ra, 0, _rc, 0);
  return out;
}

/** Seconds a contact eases in and out over inside its span (at most a third of the span). 0: a plant
 *  is all or nothing; the pin (feet.js) lands a foot where it is and lets its correction go in the air
 *  after, so nothing needs easing on the ground. */
export const CONTACT_EASE_S = 0;

/**
 * How planted foot `side` is at frame position u (wrapped): 0 = free, 1 = pinned, eased at the span's
 * ends. A span that holds the whole loop, or that starts at a one-shot's first frame / ends on its
 * last, does not ease there (the foot is already down when the clip starts).
 */
export function contactWeight(clip, side, u, loop = clip.loop) {
  const spans = clip.contact[side], n = clip.n;
  if (!spans || !spans.length) return 0;
  const e0 = CONTACT_EASE_S * clip.fps;
  let w = 0;
  for (let s = 0; s < spans.length; s++) {
    const a = spans[s][0], b = spans[s][1];
    let d, len;
    if (loop) {
      len = b - a;
      if (len < 0) len += n;
      if (len >= n - 1) return 1;
      d = u - a;
      d %= n;
      if (d < 0) d += n;
    } else {
      len = b - a;
      d = u - a;
    }
    if (d < 0 || d > len) continue;
    const e = Math.min(e0, len / 3);
    const easeIn = !loop && a <= 0 ? 1 : e > 0 ? smooth01(d / e) : 1;
    const easeOut = !loop && b >= n - 1 ? 1 : e > 0 ? smooth01((len - d) / e) : 1;
    const v = Math.min(easeIn, easeOut);
    if (v > w) w = v;
  }
  return w;
}

// ------------------------------------------------------------------ validation
const _vp = createPose(), _vw = createWorld(), _vrest = restOffsets();

/**
 * Check a decoded clip against the format's rules: `errors` (the format is broken) and `warnings`
 * (the data breaks a cleaning rule: a planted foot slides, an ankle off its height; with numbers).
 */
export function validateClip(clip) {
  const errors = clip.problems.filter((p) => !/sign flips/.test(p));
  const warnings = clip.warnings.slice();
  for (const p of clip.problems) if (/sign flips/.test(p)) errors.push(p);
  // a planted foot in the data: its ankle in the clip's ground frame through the span
  const ankle = { L: JI.footL, R: JI.footR };
  for (const side of ['L', 'R']) {
    for (const [a, b] of clip.contact[side]) {
      let len = b - a;
      if (len < 0) len += clip.n;
      let x0 = 0, z0 = 0, maxSlide = 0, maxOff = 0;
      for (let k = 0; k <= len; k++) {
        sampleClip(clip, frameIn(clip, a + k), _vp);
        // the root at this frame (unwrapped across the loop)
        rootDelta(clip, 0, a + k, _vp.root);
        solveFK(_vp, _vrest, _vw);
        const i = ankle[side] * 3, x = _vw.p[i], y = _vw.p[i + 1], z = _vw.p[i + 2];
        if (k === 0) {
          x0 = x;
          z0 = z;
        }
        maxSlide = Math.max(maxSlide, Math.hypot(x - x0, z - z0));
        maxOff = Math.max(maxOff, Math.abs(y - HDIM.ankle));
      }
      _vp.root[0] = _vp.root[1] = _vp.root[2] = 0;
      if (maxSlide > 0.03) warnings.push(`contact.${side} ${a}-${b}: the planted ankle slides ${(maxSlide * 100).toFixed(1)} cm in the data`);
      if (maxOff > 0.04) warnings.push(`contact.${side} ${a}-${b}: the planted ankle is ${(maxOff * 100).toFixed(1)} cm off HDIM.ankle`);
    }
  }
  if (clip.loop && clip.speed != null && clip.n >= 3) {
    const d = Math.hypot(clip.cyc[0], clip.cyc[1]) / clip.dur;
    if (Math.abs(d - clip.speed) > Math.max(0.1, clip.speed * 0.25)) warnings.push(`speed ${clip.speed} m/s, the root travels ${d.toFixed(2)} m/s`);
  }
  // the largest joint jump between two frames (a capture glitch)
  let jump = 0, at = 0;
  const steps = clip.loop ? clip.n : clip.n - 1;
  for (let f = 0; f < steps; f++) {
    const g = (f + 1) % clip.n;
    for (let j = 1; j < J; j++) {
      const a = qangle(clip.q, (f * J + j) * 4, clip.q, (g * J + j) * 4);
      if (a > jump) {
        jump = a;
        at = f;
      }
    }
  }
  const perFrame = (jump * 180) / Math.PI;
  if (perFrame > (clip.fps >= 60 ? 30 : 45)) warnings.push(`a joint turns ${perFrame.toFixed(0)} degrees in one frame (frame ${at}${clip.loop && at === clip.n - 1 ? ', the loop wrap' : ''})`);
  return { errors, warnings, jumpDeg: perFrame };
}

export { JOINTS, PARENT };
