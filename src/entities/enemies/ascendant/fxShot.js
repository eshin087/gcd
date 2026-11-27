import { K_SMOKE, K_VOID, K_STEEL, GROUND_Y, GROUND_GAIN } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';

// His ki blast, redrawn (ADR-248, `?ascShot=a|b`; '0', the default until the owner picks, is the blast he
// shipped with: fx.js _drawBlast / _blastBurst). Every blast he throws flies through here: Spirit Shot,
// the scatter, Blast Dance, Golden Rain, Sky Volley, Raining Suns' suns (not Heaven's Lantern's orb: its
// own lantern* draws). In the idiom of the Fox's and Bai Wuji's spells (untouched/fxSpells.js: a white
// heart, colour turning round it, a ring, the air drawn in on spirals, the floor lit under it, a burst
// with a front, dust and debris). All of it is heat in the fire field (K_VOID is GOLD on this level) and
// glyph particles of one letter cell; jitter from F.lr() / F.lrand() (the drawing stream), never
// Math.random. AscFx (fx.js) calls these with itself first: draw(F, s, hang) / burst(F, s, floor, onHim).
//
//   a  THE SUN: a gold knot that flies. A white heart, a gold body turning tight round it, a torn ring of
//      light spinning at the camera's slant; the air drawn into it on spirals as it hangs at his palm and
//      as it flies; a gold pool on the floor under it, travelling with it; behind it a two-strand wake.
//      Its burst folds in, then breaks: a ball front, a gold ring racing out along the floor, letters
//      and dust thrown out.
//   b  THE COMET: a white-hot head on a teardrop of gold, a long tail of tiny letters it sheds and leaves
//      hanging in the air behind it, the floor under its path lit in a streak, grit kicked up off the
//      floor in its wake. Its burst splashes FORWARD, a cone along its way, and scores the floor.

const TAU = Math.PI * 2;
const GOLD = [4.0, 3.0, 1.1], GOLD_END = [0.8, 0.4, 0.04], WHITE = [3.4, 3.3, 2.8];
const GRIT = [0.62, 0.6, 0.52], GRIT_END = [0.3, 0.28, 0.24];
const L_GOLD = [1.0, 0.78, 0.32];
/** The look this frame ('0' today's). */
export const shotLook = () => lookOf('ascShot', '0');
export const SHOT_OPTS = Object.freeze(['0', 'a', 'b']);

/** A glyph particle (one letter cell) with a velocity. */
function mote(F, x, y, z, vx, vy, vz, life, size, glyphs, color, colorEnd, drag = 0, alpha = 1) {
  const o = F._rec(x, y, z, life, size, 0.03, glyphs, color, colorEnd);
  o.vx = vx;
  o.vy = vy;
  o.vz = vz;
  o.drag = drag;
  if (alpha !== 1) o.alpha = alpha;
  F._spawn(F.add, o);
}

// ---------------------------------------------------------------- a: the sun
function drawSun(F, s, hang) {
  const lf = F._frame(), k = s.size ?? 1, ret = s.returned, t = F._now() + s.seed;
  const grow = hang ? Math.min(1, s.age / Math.max(0.15, s.delay)) : 1;
  const R0 = 0.46 * k * (0.45 + 0.55 * grow), x = s.x, y = s.y, z = s.z;
  if (lf > 0) {
    // the heart and the body turning tight round it
    const P = F._toCamera(x, y, z);
    F._blob(P.x, P.y, P.z, 0, 0, 0, lf, 0.3 * k, 0.3 * k, ret ? 1.8 : 1.6, ret ? 1.8 : 1.6, K_STEEL);
    F._disc(x, y, z, R0, 20, 0.26 * k, 0.8, K_VOID);
    for (let i = 0; i < 7; i++) {
      const a = t * 11 + (i / 7) * TAU, rr = R0 * (1.0 + 0.18 * Math.sin(t * 9 + i * 1.7));
      F._blob(x + Math.cos(a) * rr, y + Math.sin(a * 2 + i) * 0.1 * k, z + Math.sin(a) * rr, 0, 0, 0, lf, 0.26 * k, 0.26 * k, 0.85, 0.85, K_VOID);
    }
    // the torn ring, spinning the other way
    F._ring(x, y, z, R0 + 0.28 * k, 14, 0.22 * k, 0.7, K_VOID, 3, -t * 8);
    // its pool on the floor, under it (a blast over 2.5 m up throws none)
    if (y < 2.5) F._ring(x, GROUND_Y, z, 0.7 * k, 12, 0.45, 0.3 * GROUND_GAIN * (1 - y / 3), K_VOID, 3, t * 4);
  }
  // the air drawn in on spirals (more while it hangs and gathers)
  const n = hang ? 3 : 1;
  for (let i = 0; i < n; i++) {
    if (F.lr() > (hang ? 0.9 : 0.7)) continue;
    const a = F.lr() * TAU, rr = F.lrand(0.7, 1.4) * k, T = F.lrand(0.16, 0.26), sx = x + Math.cos(a) * rr, sy = y + F.lrand(-0.5, 0.5), sz = z + Math.sin(a) * rr;
    const tw = (rr * 1.4) / T, vx = hang ? 0 : (s.dx ?? 0) * (s.speed ?? 0), vz = hang ? 0 : (s.dz ?? 0) * (s.speed ?? 0);
    F._blob(sx, sy, sz, (x - sx) / T - Math.sin(a) * tw * 0.4 + vx, (y - sy) / T, (z - sz) / T + Math.cos(a) * tw * 0.4 + vz, T, 0.22, 0.1, 0.1, 0.4, K_VOID);
    if (F.lr() < 0.5) mote(F, sx, sy, sz, (x - sx) / T + vx, (y - sy) / T, (z - sz) / T + vz, T, 0.1, ".'", GOLD, GOLD_END, 0, 0.5);
  }
  if (hang) return;
  // the wake: two strands winding back along its way
  const dx = s.dx ?? 0, dz = s.dz ?? 0, px = -dz, pz = dx, L = Math.min(2.2 * k, 0.14 * (s.speed ?? 10) * (0.4 + Math.min(1, s.age * 4)));
  if (lf > 0) {
    // (its way, written on the letter grid: a hot line back from the body, as the blast's own tail)
    F._ink(x - dx * L, y, z - dz * L, x - dx * R0 * 0.8, y, z - dz * R0 * 0.8, 0, 0.12, 0, 0.75);
    for (let st = 0; st < 2; st++) {
      let ax = x, ay = y, az = z;
      for (let j = 1; j <= 5; j++) {
        const u = j / 5, a = t * 14 + st * Math.PI + u * 5, w = 0.22 * k * (1 - u * 0.4);
        const bx = x - dx * L * u + px * Math.cos(a) * w, by = y + Math.sin(a) * w, bz = z - dz * L * u + pz * Math.cos(a) * w;
        F._ink(ax, ay, az, bx, by, bz, 0, 0.85 * (1 - u * 0.8), 0, 0.85 * (1 - u * 0.8) * 0.85, 0, K_VOID);
        ax = bx;
        ay = by;
        az = bz;
      }
    }
  }
}

function burstSun(F, s, floor, onHim) {
  const k = s.size ?? 1, x = s.x, y = Math.max(0.35, s.y), z = s.z, A = F._axes();
  // it folds in: a ring of gold racing INTO the heart
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU, ca = Math.cos(a), sa = Math.sin(a), r = 0.9 * k, T = 0.08;
    const ux = A.rx * ca + A.ux * sa, uy = A.ry * ca + A.uy * sa, uz = A.rz * ca + A.uz * sa;
    F._blob(x + ux * r, y + uy * r, z + uz * r, (-ux * r) / T, (-uy * r) / T, (-uz * r) / T, T, 0.3, 0.12, 0.3, 0.9, K_VOID);
  }
  // ... and breaks: the white flash, a ball front in the camera's plane
  const P = F._toCamera(x, y, z);
  F._blob(P.x, P.y, P.z, 0, 0, 0, 0.14, 0.4 * k, 1.3 * k, 1.7, 0, K_STEEL);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + F.lr() * 0.25, ca = Math.cos(a), sa = Math.sin(a), sp = F.lrand(4.5, 6.5) * k;
    const ux = A.rx * ca + A.ux * sa, uy = A.ry * ca + A.uy * sa, uz = A.rz * ca + A.uz * sa;
    F._blob(x + ux * 0.25, y + uy * 0.25, z + uz * 0.25, ux * sp, uy * sp, uz * sp, F.lrand(0.18, 0.26), 0.34 * k, 0.2, 0.75, 0, K_VOID, 3);
  }
  // a gold ring racing out along the floor, and dust after it
  F._shock(x, GROUND_Y, z, 2.2 * k, 26, 0.3, 0.42, 0.7, 0.32 * GROUND_GAIN, K_VOID, 0.3, 2);
  if (floor || y < 1.6) for (let i = 0; i < 6; i++) {
    const a = F.lr() * TAU, sp = F.lrand(0.8, 1.6);
    F._blob(x + Math.cos(a) * 0.4, 0.6, z + Math.sin(a) * 0.4, Math.cos(a) * sp, F.lrand(0.3, 0.8), Math.sin(a) * sp, F.lrand(0.8, 1.2), 0.6, 1.4, 0.45, 0, K_SMOKE, 1.5, 0.4);
  }
  // letters thrown out
  for (let i = 0; i < 16; i++) {
    const a = F.lr() * TAU, sp = F.lrand(3, 8);
    const o = F._rec(x, y, z, F.lrand(0.3, 0.6), F.lrand(0.12, 0.2), 0.04, "+*'.", i % 3 ? GOLD : WHITE, GOLD_END);
    o.vx = Math.cos(a) * sp;
    o.vy = F.lrand(0.5, 4.5);
    o.vz = Math.sin(a) * sp;
    o.drag = 2.2;
    o.gravity = -7;
    F._spawn(F.add, o);
  }
  F._light({ x, y: y + 0.3, z, color: L_GOLD, intensity: (onHim ? 6.5 : 4) * k, radius: 6.5 * k, life: 0.24, fade: 0.22 });
}

// ---------------------------------------------------------------- b: the comet
function drawComet(F, s, hang) {
  const lf = F._frame(), k = s.size ?? 1, ret = s.returned, t = F._now() + s.seed, x = s.x, y = s.y, z = s.z;
  const grow = hang ? Math.min(1, s.age / Math.max(0.15, s.delay)) : 1;
  const dx = hang ? 0 : s.dx ?? 0, dz = hang ? 0 : s.dz ?? 0;
  const sl = !ret && Number.isFinite(s.yTo) && !hang ? (s.yTo - s.y0) / s.yLen : 0;
  if (lf > 0) {
    // the head, white-hot, and the teardrop of gold behind it (longer the faster it goes)
    const P = F._toCamera(x, y, z);
    F._blob(P.x, P.y, P.z, 0, 0, 0, lf, 0.24 * k * grow, 0.24 * k * grow, ret ? 1.7 : 1.5, ret ? 1.7 : 1.5, K_STEEL);
    const L = hang ? 0 : Math.min(1.1 * k, 0.07 * (s.speed ?? 10) * (0.4 + Math.min(1, s.age * 4)));
    for (let i = 0; i < 6; i++) {
      const u = i / 5, w = 0.42 * k * grow * (1 - 0.75 * u) * (1 + 0.1 * Math.sin(t * 30 + i));
      F._blob(x - dx * L * u, y - sl * L * u, z - dz * L * u, 0, 0, 0, lf, w, w, 0.95 * (1 - 0.5 * u), 0.95 * (1 - 0.5 * u), K_VOID);
    }
    // the tail written on the letter grid: a hot line twice the teardrop's length back along its way
    if (!hang) {
      const T2 = Math.min(2.8 * k, 0.18 * (s.speed ?? 10) * (0.4 + Math.min(1, s.age * 4)));
      F._ink(x - dx * T2, y - sl * T2, z - dz * T2, x, y, z, 0, 0.08, 0, 0.95);
      F._ink(x - dx * T2 * 0.6, y - sl * T2 * 0.6 + 0.06, z - dz * T2 * 0.6, x, y + 0.03, z, 0, 0.1, 0, 0.7, 0, K_VOID);
    }
    // the floor lit in a streak under its way
    if (!hang && y < 2.6) {
      const h = 0.36 * GROUND_GAIN * (1 - y / 3);
      F._ink(x, GROUND_Y, z, x - dx * (L + 1.6 * k), GROUND_Y, z - dz * (L + 1.6 * k), 0, h, 0, h * 0.2, 0, K_VOID);
    }
  }
  if (hang) {
    // gathering: sparks spat out and pulled back in round the palm
    if (F.lr() < 0.7) {
      const a = F.lr() * TAU, r = F.lrand(0.3, 0.7) * k, T = F.lrand(0.1, 0.18);
      mote(F, x + Math.cos(a) * r, y + F.lrand(-0.3, 0.3), z + Math.sin(a) * r, (-Math.cos(a) * r) / T, 0, (-Math.sin(a) * r) / T, T, 0.1, "'.", WHITE, GOLD_END);
    }
    return;
  }
  // the tail: tiny letters shed where it passes, left hanging in the air (they drift on the wind a little)
  const W = F.game?.world?.life?.wind;
  const wx = (W?.dirX ?? 0) * (W?.speed ?? 0) * 0.15, wz = (W?.dirZ ?? 0) * (W?.speed ?? 0) * 0.15;
  for (let i = 0; i < 6; i++) {
    const r = F.lrand(0, 0.2) * k, a = F.lr() * TAU, back = F.lrand(0.1, 0.5) * k;
    mote(F, x - dx * back + Math.cos(a) * r, y - sl * back + Math.sin(a) * r, z - dz * back + Math.sin(a) * r * 0.5, wx + F.lrand(-0.2, 0.2), F.lrand(-0.1, 0.3), wz + F.lrand(-0.2, 0.2), F.lrand(0.35, 0.6), F.lrand(0.08, 0.12), ".'`,", i ? GOLD : WHITE, GOLD_END, 1.5, 0.8);
  }
  // grit kicked up off the floor in its wake (only when it flies low)
  if (y < 1.7 && F.lr() < 0.6) {
    const side = F.lr() < 0.5 ? -1 : 1, px = -dz * side, pz = dx * side, sp = F.lrand(1, 2.4);
    mote(F, x - dx * 0.6 + px * 0.2, 0.08, z - dz * 0.6 + pz * 0.2, px * sp - dx, F.lrand(1.2, 2.6), pz * sp - dz, F.lrand(0.35, 0.55), 0.1, ".,'", GRIT, GRIT_END, 1.5);
  }
}

function burstComet(F, s, floor, onHim) {
  const k = s.size ?? 1, x = s.x, y = Math.max(0.35, s.y), z = s.z, dx = s.dx ?? 0, dz = s.dz ?? 1;
  const P = F._toCamera(x, y, z);
  F._blob(P.x, P.y, P.z, 0, 0, 0, 0.12, 0.45 * k, 1.0 * k, 1.7, 0, K_STEEL);
  // a splash forward: a cone of gold along its way
  const base = Math.atan2(dz, dx);
  for (let i = 0; i < 20; i++) {
    const a = base + F.lrand(-0.7, 0.7), sp = F.lrand(4, 9) * k, up = F.lrand(-0.5, 2.5);
    F._blob(x, y, z, Math.cos(a) * sp, up, Math.sin(a) * sp, F.lrand(0.16, 0.3), 0.32 * k, 0.16, 0.7, 0, K_VOID, 3, 2);
  }
  for (let i = 0; i < 14; i++) {
    const a = base + F.lrand(-0.9, 0.9), sp = F.lrand(4, 10);
    const o = F._rec(x, y, z, F.lrand(0.25, 0.5), F.lrand(0.12, 0.18), 0.04, "'.`-", i & 1 ? WHITE : GOLD, GOLD_END);
    o.vx = Math.cos(a) * sp;
    o.vy = F.lrand(0, 3);
    o.vz = Math.sin(a) * sp;
    o.drag = 2.5;
    o.gravity = -6;
    F._spawn(F.add, o);
  }
  // the floor scored along its way
  if (floor || y < 1.6) {
    const h = 0.4 * GROUND_GAIN;
    F._ink(x - dx * 0.4, GROUND_Y, z - dz * 0.4, x + dx * 1.4 * k, GROUND_Y, z + dz * 1.4 * k, 0.5, h, 0, h * 0.3, 0, K_VOID);
    for (let i = 0; i < 3; i++) F._blob(x + dx * 0.4 * i, 0.6, z + dz * 0.4 * i, dx * 0.8, F.lrand(0.3, 0.7), dz * 0.8, F.lrand(0.7, 1.1), 0.5, 1.2, 0.45, 0, K_SMOKE, 1.5, 0.4);
  }
  F._light({ x, y: y + 0.3, z, color: L_GOLD, intensity: (onHim ? 6 : 3.6) * k, radius: 6 * k, life: 0.2, fade: 0.2 });
}

/** Draw blast `s` this frame in the switched look (false: today's draws it). `hang`: at his palm. */
export function drawShot(F, s, hang) {
  const L = shotLook();
  if (L === 'a') drawSun(F, s, hang);
  else if (L === 'b') drawComet(F, s, hang);
  else return false;
  return true;
}

/** Burst blast `s` in the switched look (false: today's bursts it). The world's share (the floor's
 *  scorch and impact) stays fx.js's: `F._blastWorld`. */
export function burstShot(F, s, floor, onHim) {
  const L = shotLook();
  if (L === 'a') burstSun(F, s, floor, onHim);
  else if (L === 'b') burstComet(F, s, floor, onHim);
  else return false;
  return true;
}
