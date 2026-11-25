// The flurry's figures (player/flurryFigures.js), read back from what the hero ran: the shape checks
// duel.mjs and integ.mjs `chain` share. `passes`: [{ ax, az, bx, bz, tx, tz }] (a pass's start / end,
// the target as it began), ground plane.
import fs from 'node:fs';

/** Per pass: its heading (unit), its signed offset off the target's middle (the infinite line), its
 *  point nearest the target. */
export function measure(passes) {
  return passes.map((q) => {
    const ex = q.bx - q.ax, ez = q.bz - q.az, l = Math.hypot(ex, ez) || 1, dx = ex / l, dz = ez / l;
    const rx = q.tx - q.ax, rz = q.tz - q.az, along = rx * dx + rz * dz;
    const off = dx * rz - dz * rx; // (signed: which side of the line the target is on)
    return { dx, dz, off, abs: Math.abs(off), qx: q.ax + dx * along, qz: q.az + dz * along, a: Math.atan2(dx, dz) };
  });
}

const cross = (a, b) => a.dx * b.dz - a.dz * b.dx;
const sinBetween = (a, b) => Math.abs(Math.sin(a.a - b.a));

/** Does `passes` read as figure `name`? { ok, why }. `air`: round the wyrm's head (wider offsets). */
export function shapeOf(name, passes, air = false) {
  const m = measure(passes), n = m.length;
  const turns = m.slice(1).map((q, i) => cross(m[i], q));
  const oneWay = turns.every((t) => t > 0) || turns.every((t) => t < 0);
  const fmt = (v) => v.map((x) => x.toFixed(2)).join(' ');
  switch (name) {
    case 'star': {
      let g = 1;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) g = Math.min(g, sinBetween(m[i], m[j]));
      return { ok: n < 2 || g > 0.3, why: `the lines at least ${(Math.asin(Math.min(1, g)) * 57.3).toFixed(0)} degrees apart` };
    }
    case 'zigzag': {
      // every pass runs back across him from the last, and the run of them travels across him
      const back = m.slice(1).every((q, i) => q.dx * m[i].dx + q.dz * m[i].dz < 0);
      const travel = Math.hypot(m[n - 1].qx - m[0].qx, m[n - 1].qz - m[0].qz);
      return { ok: back && (n < 3 || travel > 1.0), why: `each pass runs back (${back}), the crossings travel ${travel.toFixed(2)} m across him` };
    }
    case 'cage': {
      const lo = air ? 1.1 : 0.9, offs = m.slice(1).map((q) => q.abs);
      return { ok: oneWay && offs.every((o) => o >= lo), why: `turning one way (${oneWay}), skimming his sides ${fmt(offs)} m off his middle (>= ${lo})` };
    }
    case 'spiral': {
      const offs = m.map((q) => q.abs);
      const inward = offs.every((o, i) => i === 0 || o <= offs[i - 1] + 0.15);
      return { ok: oneWay && inward && offs[n - 1] < 0.35, why: `turning one way (${oneWay}), each pass nearer (${fmt(offs)} m), the last through his middle` };
    }
    case 'cross': {
      const straight = m.filter((_, i) => i % 2 === 0).map((q) => q.abs);
      const x = n >= 3 ? sinBetween(m[0], m[2]) : 0;
      return { ok: straight.every((o) => o < 0.35) && x > 0.5, why: `every other pass through his middle (${fmt(straight)} m), the first two crossing at ${(Math.asin(Math.min(1, x)) * 57.3).toFixed(0)} degrees` };
    }
    default:
      return { ok: false, why: `no figure ${name}` };
  }
}

/** The figure sheet's data (ABYSS_FIGURES_OUT: a JSON file both suites add to; render: scratch). */
export function dumpFigure(entry) {
  const f = process.env.ABYSS_FIGURES_OUT;
  if (!f) return;
  let all = [];
  try {
    all = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    all = [];
  }
  all = all.filter((q) => !(q.name === entry.name && q.N === entry.N && q.air === entry.air));
  all.push(entry);
  fs.writeFileSync(f, JSON.stringify(all));
}
