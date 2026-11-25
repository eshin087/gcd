// THE FLURRY'S FIGURES (DEFENSE.flurry.chain.figures; player/flurry.js; docs/COMBAT.md "The chain"):
// the shape the chained flash cuts draw round the target, one picked for each flurry. Pure numbers,
// no three.js (the tests and the figure sheet use them as they are).
//
// A pass (the chain): from where he stands, A, along a straight line that passes the target `o` m off
// its middle (signed: which side of him), on to `e` m from the target beyond that point. A figure is a
// rule that gives every flash cut its (o, e):
//   star    every pass `off` to the same side, turning the same way: the lines cross on him like a
//           star (today's; its offsets are searched for the widest spread: flurry.js _planChain)
//   zigzag  the passes go back and forth across him, each one `off` farther along one way than the
//           last (o sweeps from -off to +off): a lightning bolt, an N / a W, that travels across him
//   cage    every pass skims the same side of him, `off` off his middle, from corner to corner of a
//           polygon round him (`sides` by the cut count): he circles him with cuts
//   spiral  the cage, each pass nearer (o from `off` down to 0), ending nearer; the last straight
//           through his middle
//   cross   every other pass straight through his middle, between them one round his side `off` off
//           it, each on the other side: the straight cuts cross on him in an X (and again)
// `min`: the fewest flash cuts a figure is offered at (it does not read with fewer).

export const FIGURE_NAMES = Object.freeze(['star', 'zigzag', 'cage', 'spiral', 'cross']);

/**
 * The (o, e) of every pass of `name` with `n` flash cuts (`FG` = DEFENSE.flurry.chain.figures, `air`
 * round the wyrm's head, `R` the reach: where a pass ends by default) → out.o / out.e (arrays of n).
 * `mirror` -1 draws it the other way round. The star's are a default (the search replaces them).
 */
export function figureSteps(name, n, air, FG, R, mirror, out) {
  const f = FG?.[name], k = air ? 'air' : 'ground', m = mirror < 0 ? -1 : 1;
  const o = out.o, e = out.e;
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    let oi = 0, ei = R;
    switch (name) {
      case 'zigzag': {
        const Z = f.off[k];
        // (every other pass runs back: its own left is the drift's right)
        oi = (i % 2 ? -1 : 1) * (n > 1 ? -Z + 2 * Z * u : Z);
        ei = f.end?.[k] ?? R;
        break;
      }
      case 'cage': {
        const C = f.off[k], s = Math.max(f.sides[0], Math.min(f.sides[1], n));
        oi = C;
        ei = C / Math.cos(Math.PI / s);
        break;
      }
      case 'spiral': {
        // (a square spiral: each corner as far out as the two sides that meet there, never under `end`)
        const S = f.off[k], u1 = n > 1 ? Math.min(1, (i + 1) / (n - 1)) : 1;
        oi = S * (1 - u);
        ei = i === n - 1 ? R : Math.max(f.end[k], (S * (2 - u - u1)) / 2 / Math.cos(Math.PI / f.sides));
        break;
      }
      case 'cross': {
        // (every other pass straight through him; between them one round his side, each the other
        // side, so the straight ones cross each other at its turn: an X, and again)
        const X = f.off[k];
        oi = i % 2 === 0 ? 0.05 : X * (((i - 1) / 2) % 2 ? -1 : 1);
        break;
      }
      default: {
        oi = f?.off?.[k] ?? R * 0.25;
        ei = R;
      }
    }
    o[i] = m * oi;
    e[i] = ei;
  }
  return out;
}

/**
 * One pass with the target at the origin: from (ax, az) past it `o` m off its middle (signed), on to
 * `e` m from it → out { x, z, a (the heading, atan2(dx, dz)), off (the offset it could take) }.
 */
export function tracePass(ax, az, o, e, out) {
  let r = Math.hypot(ax, az);
  let base;
  if (r > 0.3) base = Math.atan2(-ax, -az);
  else {
    base = Number.isFinite(out.a) ? out.a : 0;
    r = 0.3;
  }
  const s = o < 0 ? -1 : 1, off = Math.min(Math.abs(o), r * 0.95);
  const a = base + s * Math.asin(off / r);
  const ee = Math.max(e, off);
  const run = Math.sqrt(Math.max(0, r * r - off * off)) + Math.sqrt(Math.max(0, ee * ee - off * off));
  out.x = ax + Math.sin(a) * run;
  out.z = az + Math.cos(a) * run;
  out.a = a;
  out.off = off;
  return out;
}
