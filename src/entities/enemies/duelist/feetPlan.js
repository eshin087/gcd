import { wrapAngle } from '../../../core/math.js';
import { DIM } from '../../player/model.js';
import { P } from '../../player/anim.js';

// THE FEET'S PLANNER (ADR-162; lifted out of ascendant.js for every bare-handed duelist that opts in:
// Tian Lei, Xin Yi). A move's clip keys the feet in the root's space, so a root that moves through a move
// (a step-in, a dash, a slide back) or turns (tracking the hero) would skate them. planFeet(d, dt) runs
// before the animator each frame (the actor's _animate) and holds a planted foot where it stands in the
// world (an offset from its key, in model space, on d.pilot.feetOff); once it is `reach` m off its key it
// steps back under him, lifted, one foot at a time. feetPose(p, A) is the pose hook's half (the kit's
// `poses.duel`, after the clip): it adds the offsets, lets them go smoothly while the clip lifts a foot
// (a kick, a step) and lifts a foot the clip carries across the floor. Out of a move (footwork has the
// animator's own planner), a jump of the root (a blink, a flit) or the root off the floor: the offsets go.
//
// The numbers (one set; an actor may pass its own): a planted foot steps past `reach` m off its key (in
// `time` s, lifted `lift` m) back under him, both at once past `both` x reach; out of a move the offsets
// decay at `decay` /s; a foot the clip lifts lets its offset go (`ease` /s its weight, `fade` /s the
// offset in the air); a turn of more than `spin` rad in a frame, or a move of the root over `jump` m, is a
// jump; the root over `air` m is in the air. A foot the clip carries across the floor at v m/s is lifted
// min(`lift`, `carry` x v) m (0: never; anim.js _feetClip then holds it planted and steps it itself).
export const FEET = Object.freeze({ reach: 0.24, time: 0.14, lift: 0.11, carry: 0.06, decay: 14, both: 1.6, ease: 14, fade: 9, spin: 0.6, jump: 0.6, air: 0.3 });

const foot = () => ({ x: 0, y: 0, z: 0, t: -1, x0: 0, z0: 0, lift: 0, w: 1, mx: NaN, mz: NaN });

/**
 * One frame of the planner for duelist `d` (its pilot, position, yaw, mode, drawScale): the planted feet's
 * offsets on d.pilot.feetOff (kept on d._feet), before the animator runs.
 */
export function planFeet(d, dt, FT = FEET) {
  const pl = d.pilot, pos = d.position;
  const F = (d._feet ??= { px: pos.x, pz: pos.z, yaw: d.yaw, r: foot(), l: foot() });
  pl.feetOff = F;
  const dx = pos.x - F.px, dz = pos.z - F.pz, dy = wrapAngle(d.yaw - F.yaw);
  F.px = pos.x;
  F.pz = pos.z;
  const yaw0 = F.yaw;
  F.yaw = d.yaw;
  const jump = dx * dx + dz * dz > FT.jump * FT.jump || Math.abs(dy) > FT.spin;
  if (d.mode !== 'act' || jump || !(dt > 0) || pos.y > FT.air) {
    const k = jump ? 1 : Math.min(1, dt * FT.decay);
    for (const f of [F.r, F.l]) {
      f.x -= f.x * k;
      f.z -= f.z * k;
      f.y -= f.y * k;
      f.t = -1;
      f.mx = f.mz = NaN; // (drawn by footwork now: no turn to answer until a move draws it again)
    }
    return;
  }
  const s = d.drawScale || 1, c = Math.cos(d.yaw), sn = Math.sin(d.yaw);
  const mx = (dx * c - dz * sn) / s, mz = (dx * sn + dz * c) / s;
  // (his turn this frame: a planted foot drawn at (f.mx, f.mz) stays where it stands in the world, so in
  // his own frame it turns the other way round his root; ADR-162: it swivelled with him)
  const c0 = Math.cos(yaw0), s0 = Math.sin(yaw0);
  let stepping = false;
  for (const f of [F.r, F.l]) {
    if (f.t >= 0) {
      // stepping: back to its key, lifted on the way
      f.t += dt;
      const k = Math.min(1, f.t / FT.time), e = k * k * (3 - 2 * k);
      f.x = f.x0 * (1 - e);
      f.z = f.z0 * (1 - e);
      f.y = FT.lift * Math.sin(Math.PI * k);
      if (k >= 1) f.t = -1;
      else stepping = true;
    } else {
      f.x -= mx;
      f.z -= mz;
      f.y = 0;
      if (dy !== 0 && Number.isFinite(f.mx + f.mz) && f.w > 0.5) {
        const wx = f.mx * c0 + f.mz * s0, wz = -f.mx * s0 + f.mz * c0; // (model → world, his old turn)
        f.x += wx * c - wz * sn - f.mx; // (→ model, his new turn)
        f.z += wx * sn + wz * c - f.mz;
      }
    }
  }
  // a foot past `reach` steps (the farther first); while one steps, the other only past `both` x reach
  const r = Math.hypot(F.r.x, F.r.z), l = Math.hypot(F.l.x, F.l.z);
  for (const [f, dd] of r >= l ? [[F.r, r], [F.l, l]] : [[F.l, l], [F.r, r]]) {
    if (f.t >= 0 || dd <= FT.reach || (stepping && dd <= FT.reach * FT.both)) continue;
    f.t = 0;
    f.x0 = f.x;
    f.z0 = f.z;
    stepping = true;
  }
}

/**
 * The pose hook's half (a kit's `poses.duel`, after its clip): the planner's offsets added to the feet of
 * pose `p` (A: the animator's frame; A.player.feetOff from planFeet). A foot the clip carries across the
 * floor is lifted (a step; its speed from the last frame).
 */
export function feetPose(p, A, FT = FEET) {
  const o = A.player?.feetOff;
  if (!o) return;
  const t = A.time ?? 0, dt = t - (o.t ?? -1), live = dt > 1e-4 && dt < 0.1;
  o.t = t;
  for (const [ch, f] of [[P.rF, o.r], [P.lF, o.l]]) {
    const x = p[ch], z = p[ch + 2], v = live ? Math.hypot(x - (f.cx ?? x), z - (f.cz ?? z)) / dt : 0;
    f.cx = x;
    f.cz = z;
    if (live) f.lift += (Math.min(FT.lift, v * FT.carry) - f.lift) * Math.min(1, dt * 30);
    // a foot the clip lifts (a kick, a step) lets the planner's offset go SMOOTHLY: its weight eases to 0
    // while it is up and back to 1 on the floor, and the offset fades in the air, so it lands where the
    // clip puts it (ADR-162: a hard cut at a height flickered as the key crossed it, and the foot jumped
    // up to 0.7 m in a frame)
    const up = p[ch + 1] > DIM.ankle + 0.06;
    if (live) {
      f.w += ((up ? 0 : 1) - f.w) * Math.min(1, dt * FT.ease);
      if (up) {
        const k = Math.min(1, dt * FT.fade);
        f.x -= f.x * k;
        f.z -= f.z * k;
        f.y -= f.y * k;
      }
    }
    const w = f.w;
    p[ch] += f.x * w;
    p[ch + 1] += (f.y + f.lift) * w;
    p[ch + 2] += f.z * w;
    // (where it is drawn, model space: the planner turns a planted foot against his turn)
    f.mx = p[ch];
    f.mz = p[ch + 2];
  }
}
