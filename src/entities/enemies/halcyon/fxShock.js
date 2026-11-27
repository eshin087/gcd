import { K_SMOKE, K_VOID, K_STEEL } from '../duelist/fx.js';
import { lookOf } from '../duelist/lookSwitch.js';

// HIS SLAMS' SHOCKWAVES, REDRAWN (ADR-254, `?halShock=0|a|b`; '0', the default until the owner picks, is
// the engine's dust front as it shipped). Applause (the clap's ring of force across the plaza) and Meteor
// (the dive's landing). The bar is the Fox's and Bai Wuji's (a hard front, the world answering): heat in
// the fire field for what glows or strikes as a body (the front of air is steel: it is force, not fire),
// glyph particles of one letter cell for what is thrown (dust, litter, rubble). Jitter from fx.lr(),
// never Math.random. Nothing of a blow's gameplay moves (halcyon.js onImpact: the strike on the world,
// the zone, the knock-back): only what is drawn.
//
//   a  THE THUNDERCLAP: a white crack between his palms (the dive: under his fists), then ONE crisp
//      ring of air racing out at chest height (a clap) or knee height (a landing) to the blow's radius in
//      0.35 s, a second fainter one on the floor under it; ahead of it a skirt of dust and litter shoved
//      out along the ground. The landing throws rubble up out of its crater as well.
//   b  THE DOME: a hemisphere of pressure swelling out from the blow (rings of faint steel at five heights,
//      narrowing to the top), the air inside it shimmering with tiny letters; at its rim the floor's grit
//      is lifted and hangs a moment; the landing's dome is lower and wider, its rubble thrown higher.
//
// COST: a ~ 90 ring blobs a frame for 0.35 s + ~80 glyphs once; b ~ 5 x 24 ring blobs a frame for 0.45 s +
// ~70 glyphs once.

/** The option (read live). */
export const shockLook = () => lookOf('halShock', '0');

const TAU = Math.PI * 2;
const DUST = [0.62, 0.6, 0.58], DUST_END = [0.18, 0.17, 0.16];
const ROCK = [0.5, 0.47, 0.44], ROCK_END = [0.16, 0.15, 0.14];
const SHIM = [1.2, 1.25, 1.4], SHIM_END = [0.2, 0.22, 0.3];
const L_WHITE = [0.9, 0.92, 1.0];

/** Per-fx: the fronts racing out (stepped by `shockUpdate` every frame). */
const ST = new WeakMap();
function st(fx) {
  let s = ST.get(fx);
  if (!s) ST.set(fx, (s = { list: Array.from({ length: 3 }, () => ({ alive: false, t: 0, T: 0.35, x: 0, z: 0, y: 1, r: 6, look: 'a', land: false })) }));
  return s;
}

/**
 * A shockwave at (x, z), `r` m out (the blow's reach), `y` the height of its front (1.2 a clap, 0.5 a
 * landing), `land` a landing (rubble out of the crater). Returns false under '0' (draw today's instead).
 */
export function shockwave(fx, x, z, r, y, land = false) {
  const look = shockLook();
  if (look === '0' || !Number.isFinite(x + z + r + y)) return false;
  const S = st(fx);
  let w = S.list.find((f) => !f.alive) ?? S.list[0];
  Object.assign(w, { alive: true, t: 0, T: look === 'b' ? 0.45 : 0.35, x, z, y, r, look, land });
  const A = fx.alpha, add = fx.add;
  // the crack: a white heart at the blow
  fx._blob(x, y, z, 0, 0, 0, 0.12, 0.5, 0.9, 1.3, 0, K_STEEL);
  fx._light?.({ x, y: y + 0.4, z, color: L_WHITE, intensity: 3, radius: r * 0.9, life: 0.14, fade: 0.12 });
  // what is thrown: dust and litter shoved out along the floor (a); grit lifted round the rim (b)
  const n = look === 'a' ? 60 : 46;
  for (let i = 0; i < n; i++) {
    const a = fx.lr() * TAU, sp = look === 'a' ? fx.lrand(r * 1.6, r * 3) : fx.lrand(r * 0.9, r * 1.6);
    const o = fx._rec(x + Math.cos(a) * 0.5, 0.15, z + Math.sin(a) * 0.5, fx.lrand(0.35, 0.7), 0.1, 0.06, ".,'`", DUST, DUST_END);
    o.vx = Math.cos(a) * sp;
    o.vz = Math.sin(a) * sp;
    o.vy = look === 'a' ? fx.lrand(0.3, 1.4) : fx.lrand(1.5, 3.5);
    o.drag = look === 'a' ? 3.2 : 2.4;
    o.gravity = look === 'a' ? -4 : -2.5;
    o.alpha = 0.8;
    fx._spawn(A, o);
  }
  if (land) {
    for (let i = 0; i < 22; i++) {
      const a = fx.lr() * TAU, sp = fx.lrand(2, 6);
      const o = fx._rec(x + Math.cos(a) * 0.6, 0.3, z + Math.sin(a) * 0.6, fx.lrand(0.5, 0.9), fx.lrand(0.14, 0.24), 0.08, '#%&', ROCK, ROCK_END);
      o.vx = Math.cos(a) * sp;
      o.vz = Math.sin(a) * sp;
      o.vy = look === 'b' ? fx.lrand(6, 10) : fx.lrand(4, 7);
      o.gravity = -16;
      o.spin = fx.lrand(-6, 6);
      fx._spawn(A, o);
    }
  }
  void add;
  return true;
}

/** Every frame (HalFx.update): the fronts racing out. */
export function shockUpdate(fx, dt) {
  const S = ST.get(fx);
  if (!S) return;
  const life = fx._frame();
  for (const f of S.list) {
    if (!f.alive) continue;
    f.t += dt;
    const u = Math.min(1, f.t / f.T);
    if (u >= 1) {
      f.alive = false;
      continue;
    }
    if (!(life > 0)) continue;
    // (the front eases out: fast from the blow, slowing at its reach)
    const e = 1 - (1 - u) * (1 - u), R = 0.4 + (f.r - 0.4) * e, fade = 1 - u * u;
    if (f.look === 'a') {
      // the ring of air: crisp steel strokes round it, a fainter twin on the floor under it
      const n = Math.min(72, Math.ceil((TAU * R) / 0.3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a);
        fx._blob(f.x + c * R, f.y + (fx.lr() - 0.5) * 0.08, f.z + s * R, 0, 0, 0, life, 0.2, 0.2, 0.95 * fade, 0, K_STEEL);
        if (i % 2 === 0) fx._blob(f.x + c * R * 0.94, 0.12, f.z + s * R * 0.94, 0, 0, 0, life, 0.3, 0.3, 0.4 * fade, 0, K_SMOKE);
      }
    } else {
      // the dome: rings at five heights, narrowing to its top (a hemisphere R across, 0.7 R high: a
      // landing's lower and wider)
      const H = f.land ? 0.45 : 0.7;
      for (let j = 0; j < 5; j++) {
        const ph = (j / 5) * (Math.PI / 2), rr = R * Math.cos(ph), yy = 0.1 + R * H * Math.sin(ph);
        const n = Math.max(8, Math.min(28, Math.ceil((TAU * rr) / 0.45)));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + j * 0.3;
          fx._blob(f.x + Math.cos(a) * rr, yy, f.z + Math.sin(a) * rr, 0, 0, 0, life, 0.2, 0.2, (j === 0 ? 0.8 : 0.5) * fade, 0, j === 0 ? K_STEEL : K_VOID);
        }
      }
      // the air inside shimmering: tiny faint letters
      for (let i = 0; i < 4; i++) {
        const a = fx.lr() * TAU, rr = R * Math.sqrt(fx.lr()), o = fx._rec(f.x + Math.cos(a) * rr, 0.2 + fx.lr() * R * 0.5, f.z + Math.sin(a) * rr, 0.25, 0.08, 0.04, "'.`", SHIM, SHIM_END);
        o.alpha = 0.45;
        o.vy = 0.6;
        fx._spawn(fx.alpha, o);
      }
    }
  }
}

/** Nothing racing (a reset). */
export function shockReset(fx) {
  const S = ST.get(fx);
  if (S) for (const f of S.list) f.alive = false;
}
