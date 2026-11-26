import * as THREE from 'three';
import { K_FIRE, K_SMOKE, K_VOID, K_STEEL, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';

// Bai Wuji's spells' effects (the FX AGENT's file): the Draw's knot, Cast's point and burst, the Null's
// merge and its line. WjFx (fx.js) imports this module as a namespace and calls its functions through
// `?.` (each takes the WjFx first: fn(F, ...args)); `update(F, S, fdt)` steps what lives on after a
// call (a collapse's burst, a burst's front of strokes, a trench's glow) every frame. All of it is heat in
// the fire field (the void slot: AZURE for the Draw, VIOLET for the Null; the fire slot: CRIMSON for the
// Cast; steel for strokes and hearts) and glyph particles of one letter cell (what flies in, what is torn
// off). Jitter from F.lr() / hashes (the drawing stream), never Math.random.
//
//   drawKnot(F, knot, dt)        every frame of a knot: a small dense blue knot (a white heart, blue
//                                turning round it, a ring), the air streaming in on spirals, letters and
//                                bricks flying in, grit and litter SLIDING over the floor to it (its pull,
//                                read on the floor), a faint blue whirl on the floor under it. ~70 blobs
//                                held + ~40 a second in flight; ~150 glyphs in flight.
//   drawCollapse(F, knot)        once: it folds in (0.12 s), then bursts: a blue ball front, a dust front,
//                                debris thrown out. ~160 blobs at the burst.
//   castPoint(F, p, dt)          every frame: a hard red point (a white heart, crimson round it, a tight
//                                halo of red, four short red spikes turning), a short trail as it moves.
//   castBurst(F, x, z, r, power) once: the shared shock front in crimson + a ring of steel strokes racing
//                                out along the floor (its own record), a flash, debris thrown outward.
//   nullCharge(F, d, k, b, r)    every frame: a blue knot and a red point over his fingers (or his two
//                                hands), crackling to each other as k rises; at k = 1 they MEET: a white
//                                flash, the void slot turns violet, and the merged violet ball holds.
//   nullBeam(F, seg, k)          every frame of the line (?wjNull=a|b): a pale core on the letter grid, a
//                                violet body w m wide, the floor along it lit violet, the letters of what
//                                it crosses stripped off and drawn into it; no smoke, no tongues (it
//                                erases). Drawn only along its part on screen.
//   nullEnd(F, seg)              once: the air closes on the line from both sides; the trench's edges glow
//                                violet for 3.2 s (a knot cuts that glow: the slot goes blue).
// Look switch ?wjNull=a|b (duelist/lookSwitch.js PENDING): a a hard-edged slab of violet (crisp strokes
// along both edges, a pale core); b a round bore (a soft body brightest at its core, rings of light
// running down it).

const TAU = Math.PI * 2;
const KNOT = Object.freeze({ y: 1.15, reach: 9, air: 46, letters: 60, grit: 55, bricks: 7 });
const NUL = Object.freeze({ w: 5, y: 1.0, yBore: 1.3, step: 110, strip: 240, over: 0.95, apart: 0.75 });
const AZ = [0.9, 1.7, 3.4], AZ_END = [0.1, 0.3, 1.0];
const RED = [3.2, 0.28, 0.24], RED_END = [0.6, 0.02, 0.03];
const WHITE = [3.4, 3.4, 3.6];
const VIO = [1.4, 0.5, 2.4], VIO_END = [0.2, 0.05, 0.45];
const DUSTC = [0.3, 0.28, 0.26], DUST_END = [0.12, 0.11, 0.1];
const GRIT = [0.62, 0.66, 0.78], GRIT_END = [0.3, 0.36, 0.55]; // (the floor is dark: pale grit, or it is not seen)
const STONE = [0.44, 0.43, 0.42];
const L_AZURE = [0.45, 0.68, 1.0], L_CRIMSON = [1.0, 0.14, 0.12], L_VIOLET = [0.74, 0.4, 1.0], L_WHITE = [0.9, 0.9, 1.0];
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const nullLook = () => lookOf('wjNull', 'a', 'a');
const KNOT_KEYS = ['wjKnot0', 'wjKnot1', 'wjKnot2', 'wjKnot3'];

/** What lives between calls (one per WjFx). */
export function createState() {
  return {
    knots: Array.from({ length: 4 }, () => ({ id: -1, seen: -9, t: 0, acc: 0, accG: 0, accF: 0, accB: 0, fresh: false })),
    seg: { ax: 0, az: 0, bx: 0, bz: 0, L: 1, w: 5, y: NaN },
    seg2: { ax: 0, az: 0, bx: 0, bz: 0, L: 1, w: 5, y: NaN },
    seg3: { ax: 0, az: 0, bx: 0, bz: 0, L: 1, w: 5, y: NaN },
    liftAcc: 0,
    c: new THREE.Vector3(),
    collapses: Array.from({ length: 3 }, () => ({ alive: false, t: 0, x: 0, y: 0, z: 0, r: 4, burst: false })),
    bursts: Array.from({ length: 3 }, () => ({ alive: false, t: 0, T: 0.4, x: 0, z: 0, r: 4, ph: 0 })),
    trenches: Array.from({ length: 2 }, () => ({ alive: false, t: 0, T: 3.2, ax: 0, az: 0, bx: 0, bz: 0, w: 5, acc: 0 })),
    point: { seen: -9, x: 0, y: 0, z: 0 },
    nul: { seen: -9, start: 0, merged: false, mergedAt: 0, beamSeen: -9, acc: 0, accG: 0, stripAcc: 0 },
    v: new THREE.Vector3(),
    w: new THREE.Vector3(),
    vis: [0, 1],
  };
}

export function resetState(F, S) {
  if (!S) return;
  for (const k of S.knots) k.id = -1;
  for (const c of S.collapses) c.alive = false;
  for (const b of S.bursts) b.alive = false;
  for (const t of S.trenches) t.alive = false;
  S.point.seen = -9;
  S.nul.seen = S.nul.beamSeen = -9;
  S.nul.merged = false;
}

/** The part t0..t1 of a → b that is on screen (with a margin); null when none is. Headless: all of it. */
function visible(F, ax, ay, az, bx, by, bz, out) {
  out[0] = 0;
  out[1] = 1;
  const N = 40, M = 80;
  let first = -1, last = -1, any = false;
  for (let i = 0; i <= N; i++) {
    const t = i / N, S = F._screen(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
    if (!S.ok) {
      if (i === 0) return out; // (no camera: draw it all)
      continue;
    }
    any = true;
    if (S.px > -M && S.py > -M && S.px < S.W + M && S.py < S.H + M) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (!any) return out;
  if (first < 0) return null;
  out[0] = Math.max(0, (first - 1) / N);
  out[1] = Math.min(1, (last + 1) / N);
  return out;
}

// ======================================================================= AZURE DRAW
function knotState(F, S, id) {
  const now = F._now();
  let st = null;
  for (const k of S.knots) if (k.id === id && now - k.seen < 0.35) st = k;
  if (st) st.fresh = false;
  else {
    st = S.knots[0];
    for (const k of S.knots) if (k.seen < st.seen) st = k;
    st.id = id;
    st.t = 0;
    st.acc = st.accG = st.accF = st.accB = 0;
    st.fresh = true;
  }
  st.seen = now;
  return st;
}

/** A point on arm `i` of a knot's floor spiral at u (0 = its tip at the reach, 1 = at the heart). */
function armPt(x, z, r0, R, a0, tw, u, out) {
  const r = R + (r0 - R) * u, a = a0 + tw * Math.log(R / Math.max(0.05, r));
  out.x = x + Math.cos(a) * r;
  out.z = z + Math.sin(a) * r;
  out.r = r;
  return out;
}
const _ap = { x: 0, z: 0, r: 0 }, _aq = { x: 0, z: 0, r: 0 };

export function drawKnot(F, knot, dt) {
  if (!knot || knot.on === false || !F.fire) return;
  const x = Number(knot.x), z = Number(knot.z);
  if (!Number.isFinite(x + z)) return;
  const S = F._spellState;
  if (!S) return;
  const y = Number.isFinite(knot.y) ? knot.y : KNOT.y;
  const id = Number.isFinite(knot.id) ? knot.id : 0;
  const st = knotState(F, S, id), fresh = st.fresh;
  const fdt = Math.max(0, Math.min(0.1, fin(F.game.fxDt, fin(dt, 0.016))));
  st.t += fdt;
  // the void slot is blue while a knot lives (a trench's glow gives way to it)
  for (const tr of S.trenches) tr.alive = false;
  F._azure();
  const life = Math.max(0.05, fin(knot.life, 2)), k = clamp01(fin(knot.k, fin(knot.t, st.t) / life));
  const reach = Math.max(1.5, Math.min(KNOT.reach, fin(knot.r, 6)));
  // (round 2: whole from its first frames; brighter and bigger as k nears 1)
  const grow = clamp01(st.t / 0.08), fade = k > 0.96 ? clamp01((1 - k) / 0.04) : 1, I = grow * fade;
  const str = clamp01(fin(knot.strength, 3) / 4), swell = 1 + 0.5 * k * k;
  if (fresh) F._say('wjDraw', x, z, Math.max(0.3, life * (1 - k)));
  const t = F._now(), lf = F._frame();
  if (lf > 0 && I > 0.01) {
    // THE HEART: a dense blue body ~0.9 m across (a disc in the camera's plane), a white core, blue
    // turning tight round it
    const R0 = 0.45 * swell * (0.7 + 0.3 * grow);
    F._disc(x, y, z, R0, 44, 0.26 * swell, (0.5 + 0.25 * k) * I, K_VOID);
    const P = F._toCamera(x, y, z);
    F._blob(P.x, P.y, P.z, 0, 0, 0, lf, 0.2 * swell, 0.2 * swell, (1.15 + 0.25 * k) * I, (1.15 + 0.25 * k) * I, K_STEEL);
    for (let i = 0; i < 9; i++) {
      const a = t * (9 + 6 * k) + (i / 9) * TAU, rr = R0 * (1.05 + 0.15 * Math.sin(t * 7 + i * 1.7));
      F._blob(x + Math.cos(a) * rr, y + Math.sin(a * 2 + i) * 0.12, z + Math.sin(a) * rr, 0, 0, 0, lf, 0.28, 0.28, 0.5 * I, 0.5 * I, K_VOID);
    }
    F._ring(x, y, z, R0 + 0.25, 16, 0.26, 0.36 * I, K_VOID, 3, -t * 7);
    // its shadow on the floor: a blue pool under it
    F._ring(x, GROUND_Y, z, 0.9 * swell, 14, 0.5, 0.2 * GROUND_GAIN * I, K_VOID, 3, t * 4);
    // THE ARMS: spirals of letters lying on the floor out to its reach, turning and tightening; dashes
    // that flow inward at the pull's speed (the player reads the reach and the strength off them)
    // (headless, no camera: a line on the letter grid falls back to a blob every 0.1 m; nothing is seen
    // there, so the arms and the ring are drawn coarse, or the tests' pool fills with them)
    const coarse = !F._screen(x, GROUND_Y, z).ok;
    const arms = 3, r0 = 0.7, tw = 0.55 + 1.1 * k, rot = t * (0.9 + 1.6 * str + 1.2 * k), flow = 1.6 + 3.2 * str + 1.5 * k;
    for (let i = 0; i < arms; i++) {
      const a0 = (i / arms) * TAU + rot, n = coarse ? 3 : Math.max(12, Math.round(reach * 3.2));
      armPt(x, z, r0, reach, a0, tw, 0, _ap);
      let s = 0;
      for (let j = 1; j <= n; j++) {
        armPt(x, z, r0, reach, a0, tw, j / n, _aq);
        const seg = Math.hypot(_aq.x - _ap.x, _aq.z - _ap.z);
        s += seg;
        const u = j / n, on = ((s + t * flow) / 0.9) % 1 < 0.62;
        if (on) {
          const h = (0.22 + 0.4 * u * u) * GROUND_GAIN * I * (0.75 + 0.5 * k);
          F._ink(_ap.x, GROUND_Y, _ap.z, _aq.x, GROUND_Y, _aq.z, 0, h * 0.85, 0, h, 0, K_VOID);
        }
        _ap.x = _aq.x;
        _ap.z = _aq.z;
      }
    }
    // the reach: a faint dashed ring of steel on the floor (where the pull begins)
    const n = coarse ? 8 : Math.max(24, Math.round((TAU * reach) / 0.5)), hr = 0.2 * GROUND_GAIN * I;
    for (let i = 0; i < n; i += 2) {
      const a = (i / n) * TAU - t * 0.4, b = ((i + 1) / n) * TAU - t * 0.4;
      F._ink(x + Math.cos(a) * reach, GROUND_Y, z + Math.sin(a) * reach, x + Math.cos(b) * reach, GROUND_Y, z + Math.sin(b) * reach, 0, hr, 0, hr, 0, K_VOID);
    }
  }
  if (fdt > 0 && I > 0.01) {
    // the air drawn in on spirals (heat that brightens as it arrives)
    st.acc += fdt * KNOT.air * I;
    while (st.acc >= 1) {
      st.acc -= 1;
      const a = F.lr() * TAU, rr = F.lrand(0.9, Math.min(reach, 5)), h = Math.max(0.75, y + F.lrand(-0.9, 1.2)), T = F.lrand(0.28, 0.5);
      const sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr, tw = (rr * 1.6) / T;
      F._blob(sx, h, sz, (x - sx) / T - Math.sin(a) * tw * 0.5, (y - h) / T, (z - sz) / T + Math.cos(a) * tw * 0.5, T, 0.36, 0.14, 0.16, 0.42 * I, K_VOID);
    }
    // letters of the air streaming in
    st.accG += fdt * KNOT.letters * I * (1 + k);
    while (st.accG >= 1) {
      st.accG -= 1;
      const a = F.lr() * TAU, rr = F.lrand(0.6, reach * 0.8), h = F.lrand(0.2, 2.4), T = F.lrand(0.3, 0.6);
      const sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr, sw = 2.5;
      const o = F._rec(sx, h, sz, T, 0.15, 0.06, "-~'.:", AZ, AZ_END);
      o.vx = (x - sx) / T - Math.sin(a) * sw;
      o.vy = (y - h) / T;
      o.vz = (z - sz) / T + Math.cos(a) * sw;
      o.rot = F._screenRot(o.vx, o.vy, o.vz) + Math.PI / 2;
      o.alpha = 0.25;
      o.alphaEnd = 1;
      F._spawn(F.add, o);
    }
    // grit and litter sliding over the floor ALONG the arms: the pull's strength in their speed
    const arms = 3, tw = 0.55 + 1.1 * k, rot = t * (0.9 + 1.6 * str + 1.2 * k);
    st.accF += fdt * KNOT.grit * (0.6 + 0.6 * str) * I;
    while (st.accF >= 1) {
      st.accF -= 1;
      const i = Math.floor(F.lr() * arms), a0 = (i / arms) * TAU + rot, u = F.lr() * 0.85;
      armPt(x, z, 0.7, reach, a0, tw, u, _ap);
      armPt(x, z, 0.7, reach, a0, tw, Math.min(1, u + 0.04), _aq);
      const dx = _aq.x - _ap.x, dz = _aq.z - _ap.z, l = Math.hypot(dx, dz) || 1;
      const sp = (1.6 + 4 * str) * (0.7 + 0.9 * u) * (0.8 + 0.5 * k), T = Math.min(1.1, Math.max(0.25, (_ap.r - 0.6) / sp));
      const o = F._rec(_ap.x + F.lrand(-0.15, 0.15), 0.05, _ap.z + F.lrand(-0.15, 0.15), T, F.lrand(0.2, 0.28), 0.16, ".,:~=", GRIT, AZ_END);
      o.vx = (dx / l) * sp;
      o.vz = (dz / l) * sp;
      o.rot = F._screenRot(o.vx, 0, o.vz) + Math.PI / 2;
      o.alpha = 0.95;
      o.alphaEnd = 0.6;
      F._spawn(F.alpha, o);
    }
    // bricks torn up and flying in
    st.accB += fdt * KNOT.bricks * I;
    while (st.accB >= 1) {
      st.accB -= 1;
      const a = F.lr() * TAU, rr = F.lrand(1.5, reach * 0.7), T = F.lrand(0.6, 0.9);
      const sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr;
      const o = F._rec(sx, 0.1, sz, T, F.lrand(0.2, 0.26), 0.1, '#%&8', STONE, DUSTC);
      o.vx = (x - sx) / T;
      o.vy = (y - 0.1) / T;
      o.vz = (z - sz) / T;
      o.spin = F.lrand(-6, 6);
      F._spawn(F.alpha, o);
    }
  }
  F._keep(KNOT_KEYS[S.knots.indexOf(st)] ?? 'wjKnot0', x, y, z, L_AZURE, (0.9 + 0.9 * k) * I, 3.5 + 1.5 * k, 0.1);
}

export function drawCollapse(F, knot) {
  if (!knot || !F.fire) return;
  const x = Number(knot.x), z = Number(knot.z);
  if (!Number.isFinite(x + z)) return;
  const S = F._spellState;
  if (!S) return;
  const y = Number.isFinite(knot.y) ? knot.y : KNOT.y, id = Number.isFinite(knot.id) ? knot.id : 0;
  for (const k of S.knots) if (k.id === id) k.id = -1;
  F._azure();
  const c = S.collapses.find((q) => !q.alive) ?? S.collapses[0];
  c.alive = true;
  c.t = 0;
  c.x = x;
  c.y = y;
  c.z = z;
  c.r = Math.max(2, Math.min(6, fin(knot.r, 5) * 0.5));
  c.burst = false;
  // it folds in: blue drawn hard to the heart from round it
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + F.lrand(-0.1, 0.1), e = F.lrand(-0.6, 0.6), r = F.lrand(1.1, 1.6), T = 0.12;
    const sx = x + Math.cos(a) * r, sy = Math.max(0.75, y + e * r), sz = z + Math.sin(a) * r;
    F._blob(sx, sy, sz, (x - sx) / T, (y - sy) / T, (z - sz) / T, T, 0.42, 0.2, 0.42, 0.7, K_VOID);
  }
  for (let i = 0; i < 18; i++) {
    const a = F.lr() * TAU, r = F.lrand(1.5, 3), h = F.lrand(0.2, 2.4), T = F.lrand(0.1, 0.14);
    const sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
    const o = F._rec(sx, h, sz, T, 0.15, 0.05, "-'", AZ, AZ_END);
    o.vx = (x - sx) / T;
    o.vy = (y - h) / T;
    o.vz = (z - sz) / T;
    o.alpha = 0.4;
    o.alphaEnd = 1;
    F._spawn(F.add, o);
  }
  F._light({ x, y, z, color: L_AZURE, intensity: 3, radius: 5, life: 0.14, fade: 0.1 });
  F._say('wjCollapse', x, z);
}

function collapseBurst(F, c) {
  c.burst = true;
  const { x, y, z, r } = c;
  const P = F._toCamera(x, y, z);
  F._blob(P.x, P.y, P.z, 0, 0, 0, 0.07, 0.4, 0.2, 1.5, 0, K_STEEL);
  F._shock(x, y, z, r * 0.9, 36, 0.28, 0.5, 0.95, 0.55, K_VOID, 0.4, 2.2);
  F.shock?.(x, z, r * 1.05, F._opt(1.1, 0, 'dust', 0, true));
  for (let i = 0; i < 22; i++) {
    const a = F.lr() * TAU, sp = F.lrand(4, 10);
    const o = F._rec(x, y + F.lrand(-0.3, 0.3), z, F.lrand(0.5, 0.9), F.lrand(0.17, 0.24), 0.07, '#%&=.,', STONE, DUST_END);
    o.vx = Math.cos(a) * sp;
    o.vy = F.lrand(1, 5);
    o.vz = Math.sin(a) * sp;
    o.gravity = -12;
    o.drag = 1.3;
    o.spin = F.lrand(-6, 6);
    F._spawn(F.alpha, o);
  }
  F._light({ x, y, z, color: L_AZURE, intensity: 3.6, radius: r * 2.4, life: 0.3, fade: 0.26 });
}

// ======================================================================= CRIMSON CAST
export function castPoint(F, p, dt) {
  if (!p || !F.fire) return;
  const x = Number(p.x), y = Number.isFinite(Number(p.y)) ? Number(p.y) : 1.2, z = Number(p.z);
  if (!Number.isFinite(x + y + z)) return;
  const S = F._spellState;
  if (!S) return;
  void dt;
  F._crimson(0.6);
  const k = clamp01(fin(p.k, 1)), s = 0.6 + 0.4 * k, t = F._now(), lf = F._frame(), Q = S.point;
  if (lf > 0) {
    const P = F._toCamera(x, y, z), A = F._axes();
    F._blob(P.x, P.y, P.z, 0, 0, 0, lf, 0.22 * s, 0.22 * s, 1.2, 1.2, K_FIRE);
    F._blob(P.x, P.y, P.z, 0, 0, 0, lf, 0.1, 0.1, 1.45, 1.45, K_STEEL);
    // a tight halo of red round it
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + t * 1.5, ca = Math.cos(a) * 0.25 * s, sa = Math.sin(a) * 0.25 * s;
      F._blob(P.x + A.rx * ca + A.ux * sa, P.y + A.ry * ca + A.uy * sa, P.z + A.rz * ca + A.uz * sa, 0, 0, 0, lf, 0.18, 0.18, 0.4, 0.4, K_FIRE);
    }
    // four short red spikes turning (it is hard, not a flame)
    for (let i = 0; i < 4; i++) {
      const a = t * 6 + (i / 4) * TAU, ca = Math.cos(a), sa = Math.sin(a), r0 = 0.2 * s, r1 = r0 + 0.34 * s;
      F._ink(P.x + (A.rx * ca + A.ux * sa) * r0, P.y + (A.ry * ca + A.uy * sa) * r0, P.z + (A.rz * ca + A.uz * sa) * r0, P.x + (A.rx * ca + A.ux * sa) * r1, P.y + (A.ry * ca + A.uy * sa) * r1, P.z + (A.rz * ca + A.uz * sa) * r1, 0, 0.36, 0, 0.2, 0, K_FIRE);
    }
    // a short trail when it moves (flicked to its place)
    if (t - Q.seen < 0.1) {
      const mv = Math.hypot(x - Q.x, y - Q.y, z - Q.z);
      if (mv > 0.05 && mv < 3) {
        const n = Math.min(8, Math.ceil(mv / 0.12));
        for (let i = 0; i < n; i++) {
          const u = i / n;
          F._blob(Q.x + (x - Q.x) * u, Q.y + (y - Q.y) * u, Q.z + (z - Q.z) * u, 0, 0.2, 0, 0.1 + 0.06 * u, 0.24, 0.1, 0.36, 0, K_FIRE);
        }
      }
    }
  }
  Q.seen = t;
  Q.x = x;
  Q.y = y;
  Q.z = z;
  F._keep('wjCast', x, y, z, L_CRIMSON, 1.2 + 1.2 * k, 3.5, 0.15);
}

export function castBurst(F, x, z, r = 4.5, power = 1) {
  if (!Number.isFinite(x + z) || !F.fire) return;
  const S = F._spellState;
  if (!S) return;
  r = Math.max(1, Math.min(14, fin(r, 4.5)));
  const pw = Math.max(0.3, Math.min(3, fin(power, 1)));
  F._crimson(1.0);
  // the push: the shared front, in crimson (fire kind), dust behind it, the floor charred
  F.shock?.(x, z, r, F._opt(Math.min(2, 0.7 + 0.45 * pw), 1, 'fire', 0, true));
  // the ring of steel strokes racing out along the floor (drawn by update)
  const b = S.bursts.find((q) => !q.alive) ?? S.bursts[0];
  b.alive = true;
  b.t = 0;
  b.T = 0.26 + 0.025 * r;
  b.x = x;
  b.z = z;
  b.r = r;
  b.ph = F.lr() * TAU;
  // its heart
  F._blob(x, 1.1, z, 0, 0, 0, 0.07, 0.34, 0.2, 1.5, 0, K_STEEL);
  for (let i = 0; i < 8; i++) {
    const a = F.lr() * TAU, sp = F.lrand(2, 5);
    F._blob(x + F.lrand(-0.2, 0.2), F.lrand(0.8, 1.3), z + F.lrand(-0.2, 0.2), Math.cos(a) * sp, F.lrand(0.5, 2), Math.sin(a) * sp, F.lrand(0.16, 0.26), 0.45, 1.1, 0.5, 0, K_FIRE, 3, 1);
  }
  // everything thrown outward
  for (let i = 0; i < Math.round(26 * Math.min(2, pw)); i++) {
    const a = F.lr() * TAU, rr = F.lrand(0.4, r * 0.6), sp = F.lrand(6, 12) * Math.min(1.5, 0.7 + 0.3 * pw);
    const o = F._rec(x + Math.cos(a) * rr, F.lrand(0.1, 0.6), z + Math.sin(a) * rr, F.lrand(0.45, 0.85), F.lrand(0.17, 0.25), 0.07, i % 4 ? '#%&=.,' : ".'", i % 4 ? STONE : RED, i % 4 ? DUST_END : RED_END);
    o.vx = Math.cos(a) * sp;
    o.vy = F.lrand(1.5, 5);
    o.vz = Math.sin(a) * sp;
    o.gravity = -12;
    o.drag = 1.4;
    o.spin = F.lrand(-6, 6);
    F._spawn(i % 4 ? F.alpha : F.add, o);
  }
  F._light({ x, y: 1.2, z, color: L_CRIMSON, intensity: 4 + 2 * pw, radius: r + 4, life: 0.3, fade: 0.26 });
  F._say('wjCast', x, z, pw);
}

function burstDraw(F, b) {
  const f = clamp01(b.t / b.T), rc = b.r * (1 - Math.pow(1 - f, 2.2)), h = 0.95 * Math.pow(1 - f, 0.7);
  if (!(h > 0.03) || !(F._frame() > 0)) return;
  const n = Math.max(10, Math.min(64, Math.round((TAU * rc) / 0.55)));
  for (let i = 0; i < n; i++) {
    const a = (i + (hash(i * 1.7 + b.ph) - 0.5) * 0.6) / n * TAU + b.ph, ca = Math.cos(a), sa = Math.sin(a);
    if (hash(i * 3.3 + b.ph * 2) < 0.18) continue; // (torn: not drawn with a compass)
    const r0 = Math.max(0.2, rc - 0.5), r1 = rc + 0.12;
    F._ink(b.x + ca * r0, 0.6, b.z + sa * r0, b.x + ca * r1, 0.6, b.z + sa * r1, 0, h * 0.5, 0, h, 0);
  }
}

// ======================================================================= THE VIOLET NULL
/** The blue knot of the charge: a body ~0.5 m across (a disc of blue, a white core, blue turning round it). */
function chargeKnot(F, x, y, z, lf, k, t, s) {
  const R = 0.25 * s;
  F._disc(x, y, z, R, 18, 0.2, 0.55 + 0.2 * k, K_VOID);
  const P = F._toCamera(x, y, z);
  F._blob(P.x, P.y, P.z, 0, 0, 0, lf, 0.11, 0.11, 0.95, 0.95, K_STEEL);
  for (let i = 0; i < 5; i++) {
    const a = t * 13 + (i / 5) * TAU;
    F._blob(x + Math.cos(a) * R * 1.15, y + Math.sin(a * 2) * 0.07, z + Math.sin(a) * R * 1.15, 0, 0, 0, lf, 0.22, 0.22, 0.45, 0.45, K_VOID);
  }
}
/** The red point of the charge: a hard body ~0.5 m across (crimson, a white core, four short spikes turning). */
function chargePoint(F, x, y, z, lf, k, t, s) {
  const R = 0.22 * s, A = F._axes();
  F._disc(x, y, z, R, 16, 0.2, 0.62 + 0.2 * k, K_FIRE);
  const P = F._toCamera(x, y, z);
  F._blob(P.x, P.y, P.z, 0, 0, 0, lf, 0.1, 0.1, 0.95, 0.95, K_STEEL);
  for (let i = 0; i < 4; i++) {
    const a = -t * 7 + (i / 4) * TAU, ca = Math.cos(a), sa = Math.sin(a), r0 = R * 1.1, r1 = R * 2.1;
    F._ink(P.x + (A.rx * ca + A.ux * sa) * r0, P.y + (A.ry * ca + A.uy * sa) * r0, P.z + (A.rz * ca + A.uz * sa) * r0, P.x + (A.rx * ca + A.ux * sa) * r1, P.y + (A.ry * ca + A.uy * sa) * r1, P.z + (A.rz * ca + A.uz * sa) * r1, 0, 0.5, 0, 0.25, 0, K_FIRE);
  }
}
/** A jagged arc of strokes a to b this frame (its middle joints off the line). */
export function zap(F, ax, ay, az, bx, by, bz, h, kind = K_STEEL, steps = 4) {
  if (!F._screen(ax, ay, az).ok) steps = 1; // (headless: nothing is seen; keep the tests' pool for what is)
  let px = ax, py = ay, pz = az;
  const j = 0.22 * Math.hypot(bx - ax, by - ay, bz - az);
  for (let i = 1; i <= steps; i++) {
    const u = i / steps, e = i < steps ? j : 0;
    const qx = ax + (bx - ax) * u + F.lrand(-e, e), qy = ay + (by - ay) * u + F.lrand(-e, e), qz = az + (bz - az) * u + F.lrand(-e, e);
    F._ink(px, py, pz, qx, qy, qz, 0, h, 0, h, i > 1 ? 1 : 0, kind);
    px = qx;
    py = qy;
    pz = qz;
  }
}

/** Where the charge is held: over his head (round 2). */
function overHead(F, d, out) {
  const e = d?.eyePoint ? d.eyePoint(out) : null;
  if (e && Number.isFinite(e.x + e.y + e.z)) return out.set(e.x, e.y + NUL.over, e.z);
  const p = d?.position ?? { x: 0, y: 0, z: 0 };
  return out.set(fin(p.x), fin(p.y) + 2.0 + NUL.over, fin(p.z));
}
const isPt = (P) => !!P && Number.isFinite(Number(P.x) + Number(P.y) + Number(P.z));

export function nullCharge(F, d, k, blue, red) {
  if (!F.fire) return;
  const S = F._spellState;
  if (!S) return;
  k = clamp01(fin(k, 0));
  const N = S.nul, now = F._now();
  if (now - N.seen > 0.3) {
    N.start = now;
    N.merged = false;
    N.acc = 0;
    N.accG = 0;
    const p = d?.position;
    F._say('wjNullCharge', p?.x, p?.z, 1.8);
  }
  N.seen = now;
  // (round 2) the two bodies are held apart OVER HIS HEAD, turning round each other and closing as k
  // rises; a caller's own points (`blue` / `red`) still win
  const C = overHead(F, d, S.c), sep = NUL.apart * (1 - Math.pow(k, 1.6)) + 0.04, th = (now - N.start) * (1.6 + 7 * k * k);
  const ox = Math.cos(th) * sep, oz = Math.sin(th) * sep;
  const B = isPt(blue) ? S.v.set(Number(blue.x), Number(blue.y), Number(blue.z)) : S.v.set(C.x + ox, C.y, C.z + oz);
  const R = isPt(red) ? S.w.set(Number(red.x), Number(red.y), Number(red.z)) : S.w.set(C.x - ox, C.y, C.z - oz);
  const bx = B.x, by = B.y, bz = B.z, rx = R.x, ry = R.y, rz = R.z;
  const mx = (bx + rx) / 2, my = (by + ry) / 2, mz = (bz + rz) / 2, lf = F._frame();
  const fdt = Math.max(0, Math.min(0.1, fin(F.game.fxDt, 0.016)));
  const p = d?.position, px = fin(p?.x, mx), pz = fin(p?.z, mz);
  if (!N.merged && k >= 0.999) {
    // THEY MEET: a white flash, the slot turns violet, the merged ball
    N.merged = true;
    N.mergedAt = now;
    const P = F._toCamera(mx, my, mz);
    F._blob(P.x, P.y, P.z, 0, 0, 0, 0.1, 0.5, 0.24, 1.6, 0, K_STEEL);
    F._shock(mx, my, mz, 2.2, 24, 0.24, 0.32, 0.55, 0.55, K_STEEL, 0.2, 3);
    F._shock(px, GROUND_Y, pz, 4.5, 30, 0.35, 0.6, 1.0, 0.24 * GROUND_GAIN, K_VOID, 0.6, 2);
    for (let i = 0; i < 26; i++) {
      const a = F.lr() * TAU, e = F.lrand(-1, 1), sp = F.lrand(3, 8);
      const o = F._rec(mx, my, mz, F.lrand(0.2, 0.4), 0.15, 0.04, "*'+", WHITE, VIO_END);
      o.vx = Math.cos(a) * sp;
      o.vy = e * sp * 0.7;
      o.vz = Math.sin(a) * sp;
      o.drag = 4;
      F._spawn(F.add, o);
    }
    F._light({ x: mx, y: my, z: mz, color: L_WHITE, intensity: 3.2, radius: 6, life: 0.18, fade: 0.16 });
    F._say('wjNullMerge', mx, mz);
  }
  if (N.merged) {
    // the merged ball: violet, ~1 m, held and crackling; the road under him lit violet
    F._violet(0.4);
    if (lf > 0) {
      const t = now - (N.mergedAt ?? now), sw = 0.5 * Math.min(1, 0.6 + t * 3);
      F._disc(mx, my, mz, sw, 40, 0.26, 0.5, K_VOID);
      const P = F._toCamera(mx, my, mz);
      F._blob(P.x, P.y, P.z, 0, 0, 0, lf, 0.16, 0.16, 1.0, 1.0, K_STEEL);
      for (let i = 0; i < 9; i++) {
        const a = now * 12 + (i / 9) * TAU, rr = sw * (1.05 + 0.12 * Math.sin(now * 9 + i));
        F._blob(mx + Math.cos(a) * rr, my + Math.sin(a * 2) * 0.12, mz + Math.sin(a) * rr, 0, 0, 0, lf, 0.24, 0.24, 0.42, 0.42, K_VOID);
      }
      // crackling: short arcs off its rim, new every frame
      const A = F._axes();
      for (let i = 0; i < 3; i++) {
        const a = F.lr() * TAU, ca = Math.cos(a), sa = Math.sin(a), r0 = sw * 0.9, r1 = sw * F.lrand(1.5, 2.1);
        zap(F, mx + (A.rx * ca + A.ux * sa) * r0, my + (A.ry * ca + A.uy * sa) * r0, mz + (A.rz * ca + A.uz * sa) * r0, mx + (A.rx * ca + A.ux * sa) * r1, my + (A.ry * ca + A.uy * sa) * r1, mz + (A.rz * ca + A.uz * sa) * r1, 0.65, K_STEEL, 3);
      }
      F._ring(px, GROUND_Y, pz, 1.4, 18, 0.55, 0.24 * GROUND_GAIN, K_VOID, 3, now * 3);
      F._ring(px, GROUND_Y, pz, 2.6, 26, 0.5, 0.12 * GROUND_GAIN, K_VOID, 4, -now * 2);
    }
    F._keep('wjNullB', mx, my, mz, L_VIOLET, 2.2, 6, 0.15);
    return;
  }
  F._crimson(0.6);
  F._azure();
  const s = 0.85 + 0.35 * k;
  if (lf > 0) {
    chargeKnot(F, bx, by, bz, lf, k, now, s);
    chargePoint(F, rx, ry, rz, lf, k, now, s);
    // arcs between them as they close (more, brighter as k rises)
    if (k > 0.2) {
      const n = k > 0.6 ? 2 : 1;
      for (let i = 0; i < n; i++) zap(F, bx, by, bz, rx, ry, rz, 0.4 + 0.3 * k, K_STEEL, 4);
    }
    // the road under him: blue on one side, red on the other, turning with them
    const ux = Math.cos(th), uz = Math.sin(th);
    F._ring(px + ux * 0.9, GROUND_Y, pz + uz * 0.9, 0.8, 10, 0.5, (0.1 + 0.14 * k) * GROUND_GAIN, K_VOID, 2, now * 4);
    F._ring(px - ux * 0.9, GROUND_Y, pz - uz * 0.9, 0.8, 10, 0.5, (0.1 + 0.14 * k) * GROUND_GAIN, K_FIRE, 2, -now * 4);
  }
  // the air gathered into the two bodies
  N.acc += fdt * (24 + 60 * k);
  while (N.acc >= 1) {
    N.acc -= 1;
    const right = F.lr() < 0.5, x = right ? bx : rx, y = right ? by : ry, z = right ? bz : rz;
    const a = F.lr() * TAU, r = F.lrand(0.8, 1.8), h = F.lrand(-0.8, 0.8), T = F.lrand(0.2, 0.34);
    const sx = x + Math.cos(a) * r, sy = Math.max(0.2, y + h), sz = z + Math.sin(a) * r;
    const o = F._rec(sx, sy, sz, T, 0.13, 0.04, ".'-", right ? AZ : RED, right ? AZ_END : RED_END);
    o.vx = (x - sx) / T;
    o.vy = (y - sy) / T;
    o.vz = (z - sz) / T;
    o.alpha = 0.3;
    o.alphaEnd = 1;
    F._spawn(F.add, o);
  }
  // grit and litter rising off the road toward them
  N.accG = (N.accG ?? 0) + fdt * (14 + 46 * k);
  while (N.accG >= 1) {
    N.accG -= 1;
    const a = F.lr() * TAU, r = F.lrand(0.8, 3.5), T = F.lrand(0.6, 1.0);
    const sx = px + Math.cos(a) * r, sz = pz + Math.sin(a) * r, ty = my - F.lrand(0.3, 0.8);
    const o = F._rec(sx, 0.08, sz, T, F.lrand(0.17, 0.24), 0.1, '.,:#%', GRIT, STONE);
    o.vx = ((mx - sx) / T) * 0.8;
    o.vy = (ty - 0.08) / T;
    o.vz = ((mz - sz) / T) * 0.8;
    o.spin = F.lrand(-5, 5);
    o.alpha = 0.95;
    o.alphaEnd = 0.2;
    F._spawn(F.alpha, o);
  }
  F._keep('wjNullB', bx, by, bz, L_AZURE, 0.5 + 0.9 * k, 3.5, 0.1);
  F._keep('wjNullR', rx, ry, rz, L_CRIMSON, 0.5 + 0.9 * k, 3.5, 0.1);
}

/** (round 2) The line of the Null shown ON THE ROAD while it charges: its two edges w m apart as thin
 *  violet strokes, red-violet and blinking as k nears 1; ticks across the band running toward its end. */
export function nullLine(F, seg, k) {
  const S = F._spellState, G = segOf(seg, S?.seg2);
  if (!G || !S || !F.fire) return;
  k = clamp01(fin(k, 0));
  const lf = F._frame();
  if (!(lf > 0)) return;
  const { ax, az, bx, bz, L, w } = G, ux = (bx - ax) / L, uz = (bz - az) / L, cx = -uz, cz = ux, hw = w * 0.5;
  const V = visible(F, ax, GROUND_Y, az, bx, GROUND_Y, bz, S.vis);
  if (!V) return;
  const s0 = V[0] * L, s1 = V[1] * L, t = F._now();
  const blink = k > 0.85 ? (Math.floor(t * 12) % 2 ? 0.55 : 1) : 1;
  const hv = (0.22 + 0.4 * k) * GROUND_GAIN * blink, hr = k > 0.45 ? (k - 0.45) / 0.55 : 0;
  if (hr > 0) F._crimson(0.4);
  for (const sd of [-1, 1]) {
    const ex = cx * sd * hw, ez = cz * sd * hw;
    F._ink(ax + ux * s0 + ex, GROUND_Y, az + uz * s0 + ez, ax + ux * s1 + ex, GROUND_Y, az + uz * s1 + ez, 0, hv, 0, hv, 0, K_VOID);
    // the red in it as it comes: a second stroke just inside, crimson
    if (hr > 0) {
      const ix = cx * sd * (hw - 0.3), iz = cz * sd * (hw - 0.3), h = hr * 0.42 * GROUND_GAIN * blink;
      F._ink(ax + ux * s0 + ix, GROUND_Y, az + uz * s0 + iz, ax + ux * s1 + ix, GROUND_Y, az + uz * s1 + iz, 0, h, 0, h, 0, K_FIRE);
    }
  }
  // chevrons across the band, running along it toward its end (which way it will fire)
  const step = 2.4, off = (t * 6) % step, ht = (0.08 + 0.16 * k) * GROUND_GAIN * blink;
  for (let s = s0 + off; s < s1; s += step) {
    const x0 = ax + ux * s, z0 = az + uz * s;
    F._ink(x0 - cx * hw * 0.85, GROUND_Y, z0 - cz * hw * 0.85, x0 + ux * 0.6, GROUND_Y, z0 + uz * 0.6, 0, ht, 0, ht, 0, K_VOID);
    F._ink(x0 + cx * hw * 0.85, GROUND_Y, z0 + cz * hw * 0.85, x0 + ux * 0.6, GROUND_Y, z0 + uz * 0.6, 0, ht, 0, ht, 0, K_VOID);
  }
}

/** The segment and its width, checked: null when it is not one. */
function segOf(seg, out) {
  if (!seg || !out) return null;
  const ax = Number(seg.ax), az = Number(seg.az), bx = Number(seg.bx), bz = Number(seg.bz);
  if (!Number.isFinite(ax + az + bx + bz)) return null;
  const L = Math.hypot(bx - ax, bz - az);
  if (!(L > 0.5)) return null;
  out.ax = ax;
  out.az = az;
  out.bx = bx;
  out.bz = bz;
  out.L = L;
  out.w = Math.max(0.5, Math.min(12, fin(Number(seg.w), NUL.w)));
  out.y = Number(seg.y);
  return out;
}

export function nullBeam(F, seg, k) {
  const S = F._spellState, G = segOf(seg, S?.seg);
  if (!G || !S || !F.fire) return;
  F._violet(0.4);
  const N = S.nul, now = F._now();
  if (now - N.beamSeen > 0.3) {
    N.stripAcc = 0;
    F._say('wjNullBeam', (G.ax + G.bx) / 2, (G.az + G.bz) / 2, 1.2);
  }
  N.beamSeen = now;
  k = clamp01(fin(k, 0.5));
  const I = clamp01(k < 0.07 ? k / 0.07 : k > 0.86 ? (1 - k) / 0.14 : 1), ws = 0.35 + 0.65 * Math.sqrt(I);
  if (!(I > 0.005)) return;
  const bore = nullLook() === 'b';
  const y = Number.isFinite(G.y) ? G.y : bore ? NUL.yBore : NUL.y;
  const { ax, az, bx, bz, L, w } = G, ux = (bx - ax) / L, uz = (bz - az) / L, cx = -uz, cz = ux;
  const V = visible(F, ax, y, az, bx, y, bz, S.vis);
  const fdt = Math.max(0, Math.min(0.1, fin(F.game.fxDt, 0.016)));
  if (V) {
    const s0 = V[0] * L, s1 = V[1] * L, lf = F._frame(), hw = 0.5 * w * ws;
    if (lf > 0) {
      // the pale core, written on the letter grid (lines one row apart across it, as the camera sees it)
      const C = F._across(ux, 0, uz), Sc = F._screen(ax + ux * (s0 + s1) * 0.5, y, az + uz * (s0 + s1) * 0.5);
      const row = Sc.ok ? Sc.mpp * Sc.ch : 0.2;
      const half = bore ? 2 : 1;
      for (let j = -half; j <= half; j++) {
        const aj = Math.abs(j), h = (aj === 0 ? 1.15 : aj === 1 ? 0.72 : 0.5) * Math.min(1, I * 1.4), off = j * row * 0.98;
        const x0 = ax + ux * s0 + C.x * off, y0 = y + C.y * off, z0 = az + uz * s0 + C.z * off;
        F._ink(x0, y0, z0, ax + ux * s1 + C.x * off, y + C.y * off, az + uz * s1 + C.z * off, 0, h, 0, h, 0, aj === 0 ? K_STEEL : K_VOID);
      }
      // the body: stations along it
      const step = Math.max(0.45, L / NUL.step), t = now;
      const across = bore ? [-0.42, -0.2, 0.2, 0.42] : [-0.38, -0.13, 0.13, 0.38];
      const size = Math.max(0.5, w * ws * 0.34), ov = Math.min(1, (2.7 * step) / size);
      for (let s = s0 + step * 0.5, i = 0; s < s1; s += step, i++) {
        const flow = Math.sin(s * 0.7 - t * 30), x0 = ax + ux * s, z0 = az + uz * s;
        for (let q = 0; q < across.length; q++) {
          const b = across[q], jit = (hash(i * 3.7 + q * 11.1 + Math.floor(t * 14) * 0.71) - 0.5) * 0.12 * hw;
          const off = b * 2 * hw + jit;
          if (bore) {
            // (round: the camera-plane cross-section, brightest at its middle)
            const h = (0.2 - 0.1 * Math.abs(b) * 2 + 0.04 * flow) * I * ov;
            F._blob(x0 + C.x * off, y + C.y * off, z0 + C.z * off, 0, 0, 0, lf, size, size, h, h, K_VOID);
          } else {
            const h = (0.16 + 0.04 * flow) * I * ov;
            F._blob(x0 + cx * off, y, z0 + cz * off, 0, 0, 0, lf, size, size, h, h, K_VOID);
          }
        }
        // the floor along it lit violet
        if (i % 2 === 0) for (const b of [-0.3, 0, 0.3]) F._blob(x0 + cx * b * 2 * hw, GROUND_Y, z0 + cz * b * 2 * hw, 0, 0, 0, lf, Math.min(2.4, w * 0.4), Math.min(2.4, w * 0.4), 0.1 * GROUND_GAIN * I, 0.1 * GROUND_GAIN * I, K_VOID);
      }
      if (!bore) {
        // the slab's hard edges: crisp violet strokes along both sides, low and high
        for (const sd of [-1, 1]) {
          for (const yy of [0.45, y + 0.75]) {
            const ex = cx * sd * hw, ez = cz * sd * hw, h = (yy < 1 ? 1.0 : 0.75) * Math.min(1, I * 1.3);
            F._ink(ax + ux * s0 + ex, yy, az + uz * s0 + ez, ax + ux * s1 + ex, yy, az + uz * s1 + ez, 0, h, 0, h, 0, K_VOID);
          }
        }
      } else {
        // the bore's rings of light running down it
        for (let j = 0; j < 4; j++) {
          const s = s0 + (((t * 26) / Math.max(1, s1 - s0) + j / 4) % 1) * (s1 - s0), x0 = ax + ux * s, z0 = az + uz * s;
          let px = 0, py = 0, pz = 0;
          for (let i = 0; i <= 14; i++) {
            const a = (i / 14) * TAU, ca = Math.cos(a) * hw, sa = Math.sin(a) * hw;
            const qx = x0 + cx * ca, qy = Math.max(0.35, y + sa), qz = z0 + cz * ca;
            if (i) F._ink(px, py, pz, qx, qy, qz, 0, 0.7 * I, 0, 0.7 * I, 1, K_VOID);
            px = qx;
            py = qy;
            pz = qz;
          }
        }
      }
    }
    // the letters of what it crosses, stripped off and drawn into it (no smoke, no flame: erased)
    N.stripAcc += fdt * NUL.strip * I * Math.min(2, (s1 - s0) / 30);
    while (N.stripAcc >= 1) {
      N.stripAcc -= 1;
      const s = s0 + F.lr() * (s1 - s0), sd = F.lr() < 0.5 ? -1 : 1, off = sd * hw * F.lrand(0.75, 1.25), T = F.lrand(0.25, 0.45);
      const x = ax + ux * s + cx * off, z = az + uz * s + cz * off, h = F.lrand(0.05, 0.8);
      const o = F._rec(x, h, z, T, F.lrand(0.18, 0.26), 0.08, '#%&=+:;.', STONE, VIO);
      o.vx = (-cx * off) / T * 0.8;
      o.vy = (y - h) / T * 0.6;
      o.vz = (-cz * off) / T * 0.8;
      o.alpha = 0.9;
      o.alphaEnd = 0;
      F._spawn(F.alpha, o);
    }
  }
  const mx = ax + ux * L * 0.5, mz = az + uz * L * 0.5;
  F._keep('wjNull', mx, 1.4, mz, L_VIOLET, (3 + 0.2 * w) * I, Math.min(24, L * 0.5 + 4), 0.1);
}

export function nullEnd(F, seg) {
  const S = F._spellState, G = segOf(seg, S?.seg);
  if (!G || !S || !F.fire) return;
  const { ax, az, bx, bz, L, w } = G, ux = (bx - ax) / L, uz = (bz - az) / L, cx = -uz, cz = ux;
  const V = visible(F, ax, 0.8, az, bx, 0.8, bz, S.vis);
  if (V) {
    // the air closes on the emptied line from both sides
    const s0 = V[0] * L, s1 = V[1] * L, T = 0.2, hw = w * 0.5;
    for (let s = s0; s < s1; s += 0.9) {
      for (const sd of [-1, 1]) {
        const x = ax + ux * s + cx * sd * hw, z = az + uz * s + cz * sd * hw;
        F._blob(x, 0.85, z, (-cx * sd * hw) / T, 0, (-cz * sd * hw) / T, T, 0.7, 0.3, 0.34, 0.1, K_VOID);
      }
    }
    F._ink(ax + ux * s0, 0.9, az + uz * s0, ax + ux * s1, 0.9, az + uz * s1, 0.18, 1.0, 0, 1.0);
  }
  const tr = S.trenches.find((q) => !q.alive) ?? S.trenches[0];
  tr.alive = true;
  tr.t = 0;
  tr.T = 3.2;
  tr.ax = ax;
  tr.az = az;
  tr.bx = bx;
  tr.bz = bz;
  tr.w = w;
  tr.acc = 0;
  F._violet(0.3);
  F._violet(tr.T, true);
  F._say('wjNullEnd', (ax + bx) / 2, (az + bz) / 2);
}

function trenchDraw(F, S, tr, fdt) {
  const f = clamp01(tr.t / tr.T), h0 = 0.3 * GROUND_GAIN * Math.pow(1 - f, 1.4);
  if (!(h0 > 0.01)) return;
  const L = Math.hypot(tr.bx - tr.ax, tr.bz - tr.az);
  if (!(L > 0.5)) return;
  const ux = (tr.bx - tr.ax) / L, uz = (tr.bz - tr.az) / L, cx = -uz, cz = ux, hw = tr.w * 0.45;
  const V = visible(F, tr.ax, GROUND_Y, tr.az, tr.bx, GROUND_Y, tr.bz, S.vis);
  if (!V) return;
  const s0 = V[0] * L, s1 = V[1] * L, lf = F._frame(), t = F._now();
  if (lf > 0) {
    let i = 0;
    for (let s = s0; s < s1; s += 0.5, i++) {
      for (const sd of [-1, 1]) {
        const fl = 0.75 + 0.5 * hash(i * 2.3 + sd + Math.floor(t * 9) * 0.37), h = h0 * fl;
        F._blob(tr.ax + ux * s + cx * sd * hw, GROUND_Y, tr.az + uz * s + cz * sd * hw, 0, 0, 0, lf, 0.42, 0.42, h, h, K_VOID);
      }
    }
  }
  // violet motes lifting off its edges as it cools
  tr.acc += fdt * 30 * (1 - f) * Math.min(2, (s1 - s0) / 30);
  while (tr.acc >= 1) {
    tr.acc -= 1;
    const s = s0 + F.lr() * (s1 - s0), sd = F.lr() < 0.5 ? -1 : 1;
    const o = F._rec(tr.ax + ux * s + cx * sd * hw, 0.2, tr.az + uz * s + cz * sd * hw, F.lrand(0.5, 0.9), 0.13, 0.05, ".'", VIO, VIO_END);
    o.vy = F.lrand(0.5, 1.4);
    o.alpha = 0.7;
    F._spawn(F.add, o);
  }
}

// ======================================================================= THE MARKS (round 2)
/** A ring of `_ink` on the floor round (x, z), radius r, every other piece left out when `dash`. */
function floorRing(F, x, z, r, h, kind, dash = false, spin = 0, step = 0.45) {
  if (!(r > 0.05) || !(h > 0.005)) return;
  const n = F._screen(x, GROUND_Y, z).ok ? Math.max(10, Math.min(160, Math.round((TAU * r) / step))) : 8;
  for (let i = 0; i < n; i++) {
    if (dash && i % 2) continue;
    const a = (i / n) * TAU + spin, b = ((i + 1) / n) * TAU + spin;
    F._ink(x + Math.cos(a) * r, GROUND_Y, z + Math.sin(a) * r, x + Math.cos(b) * r, GROUND_Y, z + Math.sin(b) * r, 0, h, 0, h, 1, kind);
  }
}

/** Where Cast will burst (per frame, k 0..1 to the burst): a faint dashed ring at r (how far it throws),
 *  a thin red ring closing from r to the point as k nears 1, a red point at the middle. */
export function castMark(F, x, z, r, k) {
  if (!F.fire || !Number.isFinite(x + z)) return;
  if (!(F._frame() > 0)) return;
  k = clamp01(fin(k, 0));
  r = Math.max(0.5, Math.min(14, fin(r, 4.5)));
  F._crimson(0.5);
  const t = F._now(), g = GROUND_GAIN;
  floorRing(F, x, z, r, (0.14 + 0.1 * k) * g, K_FIRE, true, t * 0.5);
  const rc = r * (1 - k) + 0.25;
  floorRing(F, x, z, rc, (0.26 + 0.24 * k) * g, K_FIRE, false, 0, 0.35);
  F._ring(x, GROUND_Y, z, 0.35, 8, 0.32, (0.2 + 0.3 * k) * g, K_FIRE, 2, t * 6);
}

/** The wrecking knot's path shown before it moves (per frame, k 0..1 to its start): seg {ax, az, bx, bz
 *  [, w]} (w default 3): its edges on the road in blue, chevrons running along it toward b, brighter as k
 *  nears 1. */
export function drawPath(F, seg, k) {
  const S = F._spellState, G = segOf(seg, S?.seg3);
  if (!G || !S || !F.fire || !(F._frame() > 0)) return;
  k = clamp01(fin(k, 0));
  F._azure();
  const { ax, az, bx, bz, L } = G, w = Number.isFinite(Number(seg.w)) ? G.w : 3, ux = (bx - ax) / L, uz = (bz - az) / L, cx = -uz, cz = ux, hw = w * 0.5;
  const V = visible(F, ax, GROUND_Y, az, bx, GROUND_Y, bz, S.vis);
  if (!V) return;
  const s0 = V[0] * L, s1 = V[1] * L, t = F._now(), he = (0.2 + 0.26 * k) * GROUND_GAIN;
  // its two edges on the road, solid
  for (const sd of [-1, 1]) F._ink(ax + ux * s0 + cx * sd * hw, GROUND_Y, az + uz * s0 + cz * sd * hw, ax + ux * s1 + cx * sd * hw, GROUND_Y, az + uz * s1 + cz * sd * hw, 0, he, 0, he, 0, K_VOID);
  const step = 1.8, off = (t * 5) % step, hc = (0.2 + 0.3 * k) * GROUND_GAIN;
  for (let s = s0 + off; s < s1 - 0.5; s += step) {
    const x0 = ax + ux * s, z0 = az + uz * s;
    for (const sd of [-1, 1]) F._ink(x0 + cx * sd * hw * 0.8, GROUND_Y, z0 + cz * sd * hw * 0.8, x0 + ux * 1.0, GROUND_Y, z0 + uz * 1.0, 0, hc, 0, hc, 0, K_VOID);
  }
  // its end: a ring where it will stop
  floorRing(F, bx, bz, Math.max(0.8, hw), (0.12 + 0.2 * k) * GROUND_GAIN, K_VOID, true, -t);
}

/** A lifted piece held in a blue knot under it (per frame, k 0..1 how hard it is held): the piece's
 *  centre (x, y, z), its radius r. A small knot under it, a ring of blue turning under the piece, threads
 *  of letters rising from the floor to it, a blue pool on the floor below. */
export function liftGlow(F, x, y, z, r, k) {
  if (!F.fire || !Number.isFinite(x + y + z)) return;
  const lf = F._frame();
  if (!(lf > 0)) return;
  k = clamp01(fin(k, 1));
  r = Math.max(0.3, Math.min(6, fin(r, 1.2)));
  F._azure();
  const S = F._spellState, t = F._now(), ky = Math.max(0.6, y - r * 0.75), I = 0.5 + 0.5 * k;
  F._disc(x, ky, z, 0.18 + 0.1 * k, 12, 0.2, 0.5 * I, K_VOID);
  const P = F._toCamera(x, ky, z);
  F._blob(P.x, P.y, P.z, 0, 0, 0, lf, 0.1, 0.1, 0.85 * I, 0.85 * I, K_STEEL);
  F._ring(x, ky + 0.1, z, r * 0.8, Math.max(10, Math.round(r * 9)), 0.28, 0.3 * I, K_VOID, 3, t * 3);
  F._ring(x, GROUND_Y, z, r * 0.9, Math.max(10, Math.round(r * 8)), 0.5, 0.14 * GROUND_GAIN * I, K_VOID, 2, -t * 2);
  // threads of letters rising from the floor into it
  if (S) {
    const fdt = Math.max(0, Math.min(0.1, fin(F.game.fxDt, 0.016)));
    S.liftAcc = (S.liftAcc ?? 0) + fdt * (14 + 16 * k) * Math.min(2, r);
    while (S.liftAcc >= 1) {
      S.liftAcc -= 1;
      const a = F.lr() * TAU, rr = r * F.lrand(0.3, 1.0), T = F.lrand(0.4, 0.7);
      const sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr;
      const o = F._rec(sx, 0.1, sz, T, 0.15, 0.08, ".':-", AZ, AZ_END);
      o.vx = (x - sx) / T * 0.6;
      o.vy = (ky - 0.1) / T;
      o.vz = (z - sz) / T * 0.6;
      o.alpha = 0.4;
      o.alphaEnd = 1;
      F._spawn(F.add, o);
    }
  }
  F._keep('wjLift', x, ky, z, L_AZURE, 0.8 * I, 3 + r, 0.1);
}

/** Where a falling piece will land (per frame, k 0..1 to the landing): a dark pool under it, a red rim at
 *  r that brightens and a second red ring closing on it as it comes (the falling-piece cue of the plaza,
 *  in his own heat). */
export function fallMark(F, x, z, r, k) {
  if (!F.fire || !Number.isFinite(x + z)) return;
  const lf = F._frame();
  if (!(lf > 0)) return;
  k = clamp01(fin(k, 0));
  r = Math.max(0.5, Math.min(10, fin(r, 2)));
  F._crimson(0.5);
  for (let i = 0; i < 9; i++) {
    const rr = r * Math.sqrt((i + 0.5) / 9) * 0.8, a = i * 2.39996;
    F._blob(x + Math.cos(a) * rr, 0.3, z + Math.sin(a) * rr, 0, 0, 0, lf, r * 0.55, r * 0.55, 0.3 + 0.35 * k, 0.3 + 0.35 * k, K_SMOKE);
  }
  const t = F._now(), g = GROUND_GAIN, beat = k > 0.7 ? (Math.floor(t * 10) % 2 ? 0.7 : 1) : 1;
  floorRing(F, x, z, r, (0.22 + 0.3 * k) * g * beat, K_FIRE, false, 0, 0.4);
  floorRing(F, x, z, r * (1.6 - 0.6 * k), (0.1 + 0.16 * k) * g, K_FIRE, true, t * 0.8);
}

/** Every frame (WjFx.update): what lives on after a call. */
export function update(F, S, fdt) {
  if (!S) return;
  for (const c of S.collapses) {
    if (!c.alive) continue;
    c.t += fdt;
    if (!c.burst && c.t >= 0.12) collapseBurst(F, c);
    if (c.t > 0.2) c.alive = false;
  }
  for (const b of S.bursts) {
    if (!b.alive) continue;
    b.t += fdt;
    if (b.t > b.T) {
      b.alive = false;
      continue;
    }
    burstDraw(F, b);
  }
  for (const tr of S.trenches) {
    if (!tr.alive) continue;
    tr.t += fdt;
    if (tr.t > tr.T) {
      tr.alive = false;
      continue;
    }
    F._violet(0.15, true);
    trenchDraw(F, S, tr, fdt);
  }
}
