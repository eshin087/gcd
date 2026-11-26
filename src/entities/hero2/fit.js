// Time fitting for the hero2 engine: an attack clip played on the game's attack clock. The game's
// windup / active / recovery seconds stay what they are (player/combat.js); the clip is bent to them:
//   game 0 .. windup                     -> clip 0 .. the coil   (phases.windup)
//   game windup .. windup + active       -> the coil .. the cut's end (phases.active)
//   game .. + recovery                   -> the cut's end .. free (phases.recover)
//   after that                           -> real speed to the clip's end
// through a monotone cubic (Fritsch-Carlson) so the rate changes smoothly at the joins while the coil
// and the cut's end land EXACTLY on the game's marks. Pure, no allocations.

const X = new Float64Array(5), Y = new Float64Array(5), M = new Float64Array(5);

/**
 * Clip time (s) for game time `t` (s since the attack began). `clip` is decoded (phases in frames);
 * `win` = { windup, active, recovery } in game seconds. A clip without phases is scaled whole onto
 * windup + active + recovery. Writes the phase name into `out.phase` when `out` is given.
 */
export function fitTime(clip, t, win, out = null) {
  const fps = clip.fps, dur = clip.dur;
  const gw = Math.max(1e-3, +win.windup || 0), ga = gw + Math.max(1e-3, +win.active || 0), gr = ga + Math.max(0, +win.recovery || 0);
  let cw, ca, cr;
  if (clip.phases) {
    cw = clip.phases.windup / fps;
    ca = clip.phases.active / fps;
    cr = clip.phases.recover / fps;
  } else {
    cw = (dur * gw) / gr;
    ca = (dur * ga) / gr;
    cr = dur;
  }
  if (out) out.phase = t < gw ? 'windup' : t < ga ? 'active' : t < gr ? 'recover' : 'free';
  if (!Number.isFinite(t) || t <= 0) return 0;
  // knots: (0, 0), (gw, cw), (ga, ca), (gr, cr), and real speed after
  let n = 4;
  X[0] = 0; Y[0] = 0;
  X[1] = gw; Y[1] = cw;
  X[2] = ga; Y[2] = ca;
  X[3] = gr; Y[3] = cr;
  if (gr - ga < 1e-4) n = 3; // no recovery window: the cut's end is the last knot
  const last = n - 1;
  if (t >= X[last]) return Math.min(dur, Y[last] + (t - X[last]));
  // secants, then the segment t falls in
  for (let i = 0; i < last; i++) M[i] = (Y[i + 1] - Y[i]) / Math.max(1e-6, X[i + 1] - X[i]);
  let seg = 0;
  while (seg < last - 1 && t >= X[seg + 1]) seg++;
  const m0 = tangent(seg, last), m1 = tangent(seg + 1, last);
  const h = X[seg + 1] - X[seg], s = (t - X[seg]) / h;
  const s2 = s * s, s3 = s2 * s;
  const y = (2 * s3 - 3 * s2 + 1) * Y[seg] + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * Y[seg + 1] + (s3 - s2) * h * m1;
  return Math.max(0, Math.min(dur, y));
}

/** The tangent at knot i (Fritsch-Butland: the weighted harmonic mean of the secants; monotone). The
 *  first knot takes the first secant; the last real speed, held under 3x its secant. */
function tangent(i, last) {
  if (i === 0) return M[0];
  if (i === last) return M[last - 1] <= 0 ? 0 : Math.min(1, 3 * M[last - 1]);
  const a = M[i - 1], b = M[i];
  if (a * b <= 0) return 0;
  const h0 = X[i] - X[i - 1], h1 = X[i + 1] - X[i];
  const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
  return (w1 + w2) / (w1 / a + w2 / b);
}

/** The game time at which the fitted clip reaches clip time `c` (bisection; for tests and the Lab). */
export function fitInverse(clip, c, win) {
  let lo = 0, hi = (+win.windup || 0) + (+win.active || 0) + (+win.recovery || 0) + clip.dur + 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) * 0.5;
    if (fitTime(clip, mid, win) < c) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}
