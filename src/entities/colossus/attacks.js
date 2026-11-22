import { TELL, RESULT } from '../../combat/rules.js';
import { BLOW } from '../../world/breakTuning.js';
import { SHELF, rimZ } from '../../world/tideShelf.js';
import { clamp } from '../../core/math.js';
import { ATTACKS, TUNING, BODY, POSE, perPhase } from './tuning.js';
import { poseGrip, poseHover, posePlanted, poseLaid, poseHead, poseReel, clampShelf } from './rig.js';

// The Tide Colossus's moves (ADR-141): each a script over its row of ATTACKS (tuning.js). A script's
// start(c, a) lays out its beats (c.beat: one per hit, its tell at `at`, its impact at `impact`), its
// update(c, a, dt) writes the pose targets of the parts it uses and lands its blows; colossus.js runs
// the tells and the flashes (`dynamic` beats cue themselves: the sweep's front, the breath's line, the
// surge). `from` in every hit is the striking part, so the parry's front-arc rule works. Every world
// call is guarded (ADR-107); the powers are TUNING.world.

const W = TUNING.world;
const FL = () => TUNING.flashLead;
const _v = { x: 0, z: 0 };
const _q = { x: 0, z: 0 };
const blow = (kind = BLOW.BLUNT, src = -1) => ({ kind, by: 'boss', dx: NaN, dz: NaN, src, falloff: W.falloff });
// (reused records: no allocation per frame for the sweeps)
const SWEEP_O = { kind: BLOW.BLUNT, by: 'boss', dx: 0, dz: 0, y: 0.8, src: -1 };
const SWEEP_W = { ax: 0, az: 0, bx: 0, bz: 0, r: 1.6, power: 0.9 };
const BREATH_O = { kind: BLOW.BLAST, by: 'boss', dx: 0, dz: 0, src: -1 };

/** A windup scaled by the phase (never under the fairness floor in phase 1). */
function win(c, w) {
  const t = w * c.tScale;
  return c.phase === 1 ? Math.max(TUNING.fair.minWindup, t) : t;
}
/** The hand nearer the hero (0 left, 1 right); the other one if that hand has let go; -1 if neither can. */
export function pickSide(c, prefer = null) {
  const x = c.sense.x;
  let i = prefer ?? (x < 0 ? 0 : 1);
  if (c.hands[i].reelT > 0) i = 1 - i;
  return c.hands[i].reelT > 0 ? -1 : i;
}
/** Can hand i strike the shelf point (x, z)? The shoulder leans toward it by up to the sway. */
function reach(i, x, z, out) {
  const s = i === 0 ? -1 : 1, S = BODY.shoulder, Wy = BODY.sway;
  const sx = s * S.x + clamp(x * 0.25, -Wy.side, Wy.side) * 0.8, sz = S.z + Wy.rim * 0.8;
  const dx = x - sx, dz = z - sz, d = Math.hypot(dx, dz), L = (BODY.upper + BODY.fore) * 0.93, dy = 0.6 - S.y;
  const hmax = Math.sqrt(Math.max(1, L * L - dy * dy));
  if (d <= hmax) {
    out.x = x;
    out.z = z;
  } else {
    out.x = sx + (dx / d) * hmax;
    out.z = sz + (dz / d) * hmax;
  }
  return clampShelf(out, out.x, out.z);
}
/** The spot hand i strikes at: the hero's ground point (on the shelf, in its reach). */
function spot(c, i, out, lead = 0) {
  const s = c.sense;
  return reach(i, s.x + s.vx * lead, s.z + s.vz * lead, out);
}
/** The body leans toward a blow at (x, z) (the root's sway; drawn only). */
function lean(c, x, z) {
  const S = BODY.sway;
  c.rig.swayT.set(clamp(x * 0.25, -S.side, S.side), 0, clamp((z - rimZ(x) + 2) * 0.45, 0, S.rim));
}
const hero = (c) => c.game.player?.position;
const inBand = (c, band) => {
  const p = hero(c);
  if (!p) return false;
  const d = p.z - rimZ(p.x);
  return d > -1 && d < band;
};

// ---------------------------------------------------------------- one hand on a spot (slam, hammer, grasp, Black Fathom)
function handBlow(opts) {
  const { fist = false, cup = false, black = false, rake = false } = opts;
  return {
    start(c, a) {
      const D = a.def, i = pickSide(c);
      if (i < 0) {
        a.dur = 0;
        return;
      }
      a.side = i;
      let w = win(c, D.windup);
      if (black) w += D.hold[0] + Math.random() * (D.hold[1] - D.hold[0]);
      a.s.lock = spot(c, i, { x: 0, z: 0 });
      a.s.W = w;
      a.s.hit = false;
      a.s.track = D.track ?? 0.4;
      c.beat(a, { at: 0, impact: w, tell: D.tell, flare: !!D.flare, side: i });
      a.dur = w + (rake ? D.rakeT : 0) + D.rec * c.tScale;
    },
    update(c, a, dt) {
      const D = a.def, i = a.side, rh = c.rig.hands[i], h = c.hands[i], b = a.beats[0], L = a.s.lock, s = h.s;
      if (!b) return;
      const left = b.impact - a.T;
      if (left > a.s.track) spot(c, i, L);
      lean(c, L.x, L.z);
      if (a.T < b.impact) {
        a.phase = 'windup';
        // the phone rule: never more than POSE.lift up, straight over where it will land (near: 0)
        const drop = left < 0.16 ? left / 0.16 : 1;
        poseHover(rh, L.x, L.z, 0.6 + (POSE.lift - 0.6) * drop, s, cup ? 0.2 : 1, fist);
        if (cup) rh.curlT = 0.55;
        if (left < 0.16) rh.k = 34;
        h.mode = 'air';
        if (black) {
          const P = c.rig.pt.palm[i];
          c.fx.charge(P.x, P.y + 0.6, P.z, clamp(a.T / Math.max(0.1, b.impact - FL()), 0, 1), dt, 1.8);
        }
        c.markHitbox(L.x, 0.5, L.z, D.r);
        return;
      }
      if (!a.s.hit) {
        a.s.hit = true;
        a.phase = 'active';
        posePlanted(rh, L.x, L.z, s, fist);
        rh.snap = true;
        const from = { x: L.x, y: 2, z: L.z - 1.6 };
        if (c.heroIn(L.x, L.z, D.r)) {
          c.hitPlayer(a, b, { damage: D.damage, knockback: D.knockback ?? 2, knockdown: !!D.knockdown, from, point: { x: L.x, y: 1, z: L.z } });
        }
        const pw = black ? W.blackFathom : a.name === 'slam' ? W.slam : a.name === 'grasp' ? W.grasp : W.hammer;
        const pr = black ? W.blackR : a.name === 'slam' ? W.slamR : a.name === 'grasp' ? W.graspR : W.hammerR;
        c.game.world?.impact?.(L.x, L.z, pr, pw, blow(BLOW.BLUNT, a.src));
        c.fx.splash(L.x, L.z, D.r, black ? 1.4 : 1);
        c.emit('dragon:land', { x: L.x, z: L.z });
        c.emit('dragon:attack', { name: a.name });
        c.game.shake?.(black ? 0.55 : 0.4);
        a.s.rake0 = a.T;
        return;
      }
      a.phase = 'recover';
      if (rake && a.T - a.s.rake0 < D.rakeT) {
        // the grasp rakes its furrow south along the shelf
        const u = (a.T - a.s.rake0) / D.rakeT;
        const z0 = L.z, z1 = Math.min(POSE.shelf.zMax, L.z + D.rake);
        const z = z0 + (z1 - z0) * u;
        posePlanted(rh, L.x, z, s, true);
        rh.k = 22;
        const D2 = c.game.world?.destructibles;
        if (D2?.sweep) {
          SWEEP_O.kind = BLOW.BLUNT;
          SWEEP_O.dx = 0;
          SWEEP_O.dz = 1;
          SWEEP_O.src = a.src;
          D2.sweep(L.x, z0, L.x, z, 2.2, W.furrow, SWEEP_O);
        }
        a.s.endZ = z;
        h.mode = 'air';
        return;
      }
      posePlanted(rh, L.x, a.s.endZ ?? L.z, s, fist);
      h.mode = 'planted';
    },
  };
}

// ---------------------------------------------------------------- the forearm along the rim (sweep, cross sweep)
/** One sweep record: hand i, from x0 toward `dir`, its active part starting at t0 (s). */
function sweepRec(c, i, x0, dir, t0, speed, len, band, b) {
  return { i, x0, dir, t0, t1: t0 + len / speed, speed, len, band, b, done: false, x: x0 };
}
function sweepStart(c, i) {
  const s = i === 0 ? -1 : 1;
  // out to the end on the hand's side, 12 m beyond the hero, then inward
  let x0 = clamp(c.sense.x + s * 12, -26, 26);
  if (s * x0 < 6) x0 = s * 6;
  return x0;
}
function sweepUpdate(c, a, r, dt) {
  const rh = c.rig.hands[r.i], h = c.hands[r.i], b = r.b, p = hero(c), R = TUNING.world;
  if (a.T < r.t0) {
    poseLaid(rh, r.x0, r.band, r.dir);
    rh.tgt.y += 1.4 * Math.max(0, (r.t0 - a.T) / 0.6 - 0.3); // it lifts and lies down along the rim
    h.mode = 'air';
    lean(c, r.x0, rimZ(r.x0) + 4);
    return;
  }
  const u = Math.min(1, (a.T - r.t0) / (r.t1 - r.t0));
  const x = r.x0 + r.dir * r.len * u;
  r.x = x;
  poseLaid(rh, x, r.band, r.dir);
  rh.k = 45;
  lean(c, x, rimZ(x) + 4);
  if (u >= 1) {
    h.mode = 'planted';
    return;
  }
  h.mode = 'air';
  const D = a.def, lead = FL();
  // the forearm scraped along the ground: everything in the band ahead of it
  const DS = c.game.world?.destructibles, P = c.rig.pt;
  if (DS?.sweepRec) {
    SWEEP_W.ax = P.elbow[r.i].x;
    SWEEP_W.az = Math.max(P.elbow[r.i].z, rimZ(P.elbow[r.i].x) - 1);
    SWEEP_W.bx = P.palm[r.i].x;
    SWEEP_W.bz = P.palm[r.i].z;
    SWEEP_W.r = R.sweepR;
    SWEEP_W.power = R.sweep;
    SWEEP_O.kind = BLOW.BLUNT;
    SWEEP_O.dx = r.dir;
    SWEEP_O.dz = 0;
    SWEEP_O.src = a.src;
    DS.sweepRec(SWEEP_W, SWEEP_O);
  }
  c.fx.scrape(x, rimZ(x) + r.band * 0.5, r.band, r.dir, dt);
  if (!p) return;
  const ahead = (p.x - x) * r.dir, reachR = D.r + (c.game.player?.radius ?? 0.45);
  // (when its blow is settled, answered or passed by: the cross sweep's return waits on it)
  if (r.passedAt === undefined && (b.done || ahead < -reachR)) r.passedAt = a.T;
  // its cue: when the front is flashLead from him (or now, if it starts nearer)
  if (!b.flashed && b.told && ahead <= r.speed * lead + reachR) c.flashTell(a, b);
  if (!b.done && Math.abs(p.x - x) <= reachR && inBand(c, r.band)) {
    if (!b.flashed) c.flashTell(a, b);
    c.hitPlayer(a, b, { damage: Array.isArray(D.damage) ? D.damage[b.hit] : D.damage, knockback: D.knockback, from: { x: x - r.dir * 2, y: 1, z: p.z - 0.5 }, point: { x: p.x, y: 1, z: p.z } });
  }
  c.markHitbox(x, 0.8, rimZ(x) + r.band * 0.5, r.band * 0.5);
}

// ---------------------------------------------------------------- the breath
/** The breath's line at pass progress u: R (under the maw on the rim) to F (across the shelf). */
function breathLine(r, u, out) {
  const mx = -r.dir * 6 + r.dir * 12 * u, fx = -r.dir * 30 + r.dir * 60 * u;
  out.rx = mx;
  out.rz = rimZ(mx) + 0.2;
  out.fx = fx;
  out.fz = SHELF.scarpZ + 0.5;
  out.qx = out.rx + (out.fx - out.rx) * 0.55;
  out.qz = out.rz + (out.fz - out.rz) * 0.55;
  return out;
}
/** Distance from (px, pz) to segment a–b. */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-6;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
/** The point of the line L (R to F) nearest (px, pz), into out.x / out.z (out.y 1.2). */
function nearestOn(px, pz, L, out) {
  const dx = L.fx - L.rx, dz = L.fz - L.rz, l2 = dx * dx + dz * dz || 1e-6;
  const t = clamp(((px - L.rx) * dx + (pz - L.rz) * dz) / l2, 0, 1);
  out.x = L.rx + dx * t;
  out.y = 1.2;
  out.z = L.rz + dz * t;
}
const SURGE_PT = { x: 0, y: 1.2, z: 0 };
const LN = { rx: 0, rz: 0, fx: 0, fz: 0, qx: 0, qz: 0 };
const LF = { rx: 0, rz: 0, fx: 0, fz: 0, qx: 0, qz: 0 };

// ---------------------------------------------------------------- the moves
export const MOVES = {
  slam: handBlow({}),
  hammer: handBlow({ fist: true }),
  grasp: handBlow({ cup: true, rake: true }),
  blackFathom: handBlow({ black: true }),

  sweep: {
    start(c, a) {
      const D = a.def, i = pickSide(c);
      if (i < 0) {
        a.dur = 0;
        return;
      }
      a.side = i;
      const w = win(c, D.windup), x0 = sweepStart(c, i), dir = x0 > 0 ? -1 : 1;
      const est = w + Math.max(0, Math.abs(c.sense.x - x0) - 2) / D.speed;
      const b = c.beat(a, { at: 0, impact: est, tell: D.tell, side: i, dynamic: true });
      a.s.sw = [sweepRec(c, i, x0, dir, w, D.speed, D.len, D.band, b)];
      a.dur = w + D.len / D.speed + D.rec * c.tScale;
    },
    update(c, a, dt) {
      const r = a.s.sw?.[0];
      if (!r) return;
      a.phase = a.T < r.t0 ? 'windup' : a.T < r.t1 ? 'active' : 'recover';
      sweepUpdate(c, a, r, dt);
    },
  },

  crossSweep: {
    start(c, a) {
      const D = a.def, i = pickSide(c);
      if (i < 0 || c.hands[1 - i].reelT > 0) {
        a.dur = 0;
        return;
      }
      a.side = 2;
      const w = win(c, D.windup), x0 = sweepStart(c, i), dir = x0 > 0 ? -1 : 1;
      const est = w + Math.max(0, Math.abs(c.sense.x - x0) - 2) / D.speed;
      const b0 = c.beat(a, { at: 0, impact: est, tell: D.hits[0].tell, side: i, dynamic: true });
      const r0 = sweepRec(c, i, x0, dir, w, D.speed, D.len, D.band, b0);
      // the return: the other arm back the other way, low and fast, `ret` s after the first front starts
      const j = 1 - i, t1 = w + D.ret * c.tScale, x1 = clamp(r0.x0 + dir * D.len, -26, 26);
      const est1 = t1 + Math.max(0, Math.abs(c.sense.x - x1) - 2) / D.retSpeed;
      const b1 = c.beat(a, { at: w, impact: Math.max(est1, est + TUNING.fair.stringGap), tell: D.hits[1].tell, side: j, dynamic: true });
      const r1 = sweepRec(c, j, x1, -dir, t1, D.retSpeed, D.len, D.retBand, b1);
      a.s.sw = [r0, r1];
      a.dur = Math.max(r0.t1, r1.t1) + D.rec * c.tScale;
    },
    update(c, a, dt) {
      const S = a.s.sw;
      if (!S) return;
      // fairness: the return's front does not set out until the first blow is settled and the string's
      // gap has passed (its cue could otherwise come 0.25 s after the first one's: a parry, then a dodge)
      const r0 = S[0], r1 = S[1], gap = TUNING.fair.stringGap;
      if (a.T >= r1.t0 && (r0.passedAt === undefined ? a.T < r0.t1 : a.T < r0.passedAt + gap)) {
        r1.t0 += dt;
        r1.t1 += dt;
        a.dur = Math.max(a.dur, r1.t1 + a.def.rec * c.tScale);
      }
      a.phase = a.T < r0.t0 ? 'windup' : a.T < Math.max(r0.t1, r1.t1) ? 'active' : 'recover';
      for (const r of S) sweepUpdate(c, a, r, dt);
    },
    frame(c, frame) {
      const P = c.rig.pt;
      frame(P.palm[0], 2.4, 'hand');
      frame(P.palm[1], 2.4, 'hand');
    },
  },

  flick: {
    start(c, a) {
      const D = a.def, i = a.opts?.side ?? pickSide(c);
      if (i < 0) {
        a.dur = 0;
        return;
      }
      a.side = i;
      const w = win(c, D.windup);
      c.beat(a, { at: 0, impact: w, tell: D.tell, side: i, part: 'tips' });
      a.s.hit = false;
      a.dur = w + D.rec * c.tScale;
    },
    update(c, a) {
      const D = a.def, i = a.side, rh = c.rig.hands[i], h = c.hands[i], b = a.beats[0];
      if (!b) return;
      poseGrip(rh, h.s, 0);
      h.mode = 'grip';
      if (a.T < b.impact) {
        a.phase = 'windup';
        const u = a.T / b.impact;
        rh.curlT = -0.1 - 0.7 * u; // the fingers drawn back
        rh.tgt.y += 1.0 * u;
        return;
      }
      if (!a.s.hit) {
        a.s.hit = true;
        a.phase = 'active';
        rh.curlT = 1.25;
        rh.k = 30;
        const T = c.rig.pt.tips[i], cx = (T[1].x + T[2].x) / 2, cz = (T[1].z + T[2].z) / 2;
        if (c.heroIn(cx, cz, D.r)) c.hitPlayer(a, b, { damage: D.damage, knockback: D.knockback, from: { x: cx, y: 0.6, z: cz - 2 }, point: { x: cx, y: 0.6, z: cz } });
        c.game.world?.impact?.(cx, cz, D.r, W.flick, blow(BLOW.BLUNT, a.src));
        c.fx.splash(cx, cz, 1.6, 0.5);
        c.emit('dragon:attack', { name: a.name });
        return;
      }
      a.phase = 'recover';
    },
  },

  breaker: {
    start(c, a) {
      const D = a.def;
      if (c.hands[0].reelT > 0 || c.hands[1].reelT > 0) {
        a.dur = 0;
        return;
      }
      a.side = 2;
      let t = 0;
      a.s.lock = [];
      D.hits.forEach((H, k) => {
        const w = Math.max(k ? TUNING.fair.stringGap : 0, win(c, H.windup));
        const at = t;
        t += w;
        const side = H.side === -1 ? 0 : H.side === 1 ? 1 : 2;
        c.beat(a, { at, impact: t, tell: H.tell, flare: !!H.flare, side });
        a.s.lock.push({ x: 0, z: 0, hit: false });
      });
      a.dur = t + D.rec * c.tScale;
    },
    update(c, a) {
      const D = a.def, B = a.beats;
      let k = B.findIndex((b) => !a.s.lock[b.hit].hit);
      if (k < 0) k = B.length;
      a.phase = k >= B.length ? 'recover' : 'windup';
      for (let n = 0; n < B.length; n++) {
        const b = B[n], L = a.s.lock[n], hs = b.side === 2 ? [0, 1] : [b.side];
        const left = b.impact - a.T;
        if (n === k && left > D.track) {
          // the clap's centre: the hero; a single hammer: in its hand's reach
          if (b.side === 2) {
            const s = c.sense;
            clampShelf(L, s.x, s.z);
          } else spot(c, b.side, L);
        }
        if (n === k) lean(c, L.x, L.z);
        for (const i of hs) {
          const rh = c.rig.hands[i], h = c.hands[i], off = b.side === 2 ? (i === 0 ? -1.5 : 1.5) : 0;
          if (n === k) {
            const drop = left < 0.16 ? Math.max(0, left / 0.16) : 1;
            poseHover(rh, L.x + off, L.z, 0.6 + (POSE.lift - 0.6) * drop, h.s, 0.6, b.side !== 2);
            if (left < 0.16) rh.k = 34;
            h.mode = 'air';
          } else if (n < k && (n === B.length - 1 || !B.slice(n + 1).some((x) => x.side === i || x.side === 2) || k === B.length)) {
            posePlanted(rh, L.x + off, L.z, h.s, b.side !== 2);
            h.mode = 'planted';
          }
        }
        if (n === k && a.T >= b.impact && !L.hit) {
          L.hit = true;
          for (const i of hs) {
            const off = b.side === 2 ? (i === 0 ? -1.5 : 1.5) : 0;
            posePlanted(c.rig.hands[i], L.x + off, L.z, c.hands[i].s, b.side !== 2);
            c.rig.hands[i].snap = true;
          }
          const r = b.side === 2 ? D.clapR : D.r;
          if (c.heroIn(L.x, L.z, r)) c.hitPlayer(a, b, { damage: D.damage[n], knockback: D.knockback, from: { x: L.x, y: 2, z: L.z - 1.6 }, point: { x: L.x, y: 1, z: L.z } });
          c.game.world?.impact?.(L.x, L.z, b.side === 2 ? W.clapR : W.hammerR, b.side === 2 ? W.clap : W.hammer, blow(BLOW.BLUNT, a.src));
          c.fx.splash(L.x, L.z, r, b.side === 2 ? 1.2 : 0.9);
          c.emit('dragon:land', { x: L.x, z: L.z });
          c.game.shake?.(0.35);
        }
      }
    },
  },

  breath: {
    start(c, a) {
      const D = a.def, w = win(c, D.windup), n = perPhase(D.passes, c.phase), pd = perPhase(D.pass, c.phase);
      a.side = -1;
      const dir0 = c.sense.x >= 0 ? 1 : -1;
      a.s.passes = [];
      let t = w;
      for (let k = 0; k < n; k++) {
        const dir = k % 2 ? -dir0 : dir0;
        const r = { t0: t, t1: t + pd, dir, hit: false, cover: [], qx: NaN, qz: NaN, along: 0, src: c.game.world?.destructibles?.swing?.() ?? -1, line: [], b: null };
        // its tell: the windup's start for the first, 0.6 s before it for the next
        // (its cue is drawn where the beam will meet him: the breath lands away from the body and marks
        // its ground, ADR-052; the maw, 15 m up the frame, is off a phone's screen)
        r.b = c.beat(a, { at: k ? Math.max(0, t - 0.6) : 0, impact: t + pd * 0.5, tell: D.tell, part: 'front', x: c.sense.x, y: 1.2, z: c.sense.z, dynamic: true });
        a.s.passes.push(r);
        t += pd + D.gap;
      }
      a.s.end = t - D.gap;
      a.s.started = false;
      a.s.ended = false;
      a.dur = a.s.end + perPhase(D.spent, c.phase);
    },
    update(c, a, dt) {
      const D = a.def, R = c.rig, H = R.head, w = a.s.passes[0]?.t0 ?? 1, p = hero(c);
      const first = a.s.passes[0];
      if (!first) return;
      if (a.T < w) {
        a.phase = 'windup';
        const u = a.T / w;
        poseHead(H, 'rear', -first.dir * 4);
        c.throat = u;
        c.rig.swayT.set(0, 0, 1.5 * u);
        return;
      }
      if (a.T >= a.s.end) {
        // spent: the head down on the rim
        a.phase = 'recover';
        if (!a.s.ended) {
          a.s.ended = true;
          c.throat = 0;
          c.headDownT = Math.max(c.headDownT, a.dur - a.T);
          c.emit('dragon:breathEnd');
          c.hazards.flushLine();
        }
        return;
      }
      a.phase = 'active';
      if (!a.s.started) {
        a.s.started = true;
        c.emit('dragon:breathStart');
        c.emit('dragon:attack', { name: 'breath' });
      }
      c.throat = 1;
      for (const x of a.s.passes) {
        if (a.T >= x.t1 && !x.flushed) {
          x.flushed = true;
          c.hazards.flushLine(); // (each pass leaves a line of its own)
        }
      }
      const r = a.s.passes.find((x) => a.T >= x.t0 && a.T < x.t1);
      if (!r) {
        poseHead(H, 'loom', H.tgt.x);
        return;
      }
      const span = r.t1 - r.t0, u = (a.T - r.t0) / span;
      breathLine(r, u, LN);
      H.tgt.set(LN.rx, 4.2, rimZ(LN.rx) - 3.0);
      H.fwdT.set(LN.qx - LN.rx, -4.0, LN.qz - LN.rz + 3);
      H.jawT = 1;
      H.k = 9;
      c.rig.swayT.set(LN.rx * 0.2, 0, 2);
      const M = R.pt.maw;
      c.fx.beam(M.x, M.y, M.z, LN.qx, LN.qz, LN.fx, LN.fz, D.width, dt);
      // the world: the beam stops at the first cover; the jet scours its ground line
      const DS = c.game.world?.destructibles, BO = BREATH_O;
      BO.src = r.src;
      BO.dx = r.dir;
      BO.dz = 0;
      if (DS?.coverAt) {
        const cv = DS.coverAt(LN.rx, LN.rz, LN.fx, LN.fz, D.width * 0.5);
        if (cv && !r.cover.includes(cv) && r.cover.length < 12) {
          r.cover.push(cv);
          DS.stop?.(LN.rx, LN.rz, LN.fx, LN.fz, D.width * 0.5, W.breath.cover, BO);
        }
      }
      if (Number.isFinite(r.qx)) {
        const seg = Math.hypot(LN.qx - r.qx, LN.qz - r.qz);
        if (DS?.sweep && seg > 0.01) DS.sweep(r.qx, r.qz, LN.qx, LN.qz, 1.0, W.breath.ground, BO);
        r.along += seg;
        if (r.along >= W.breath.every) {
          r.along = 0;
          c.game.world?.impact?.(LN.qx, LN.qz, 1.2, W.breath.ground, BO);
          // phase 3: each pass leaves its line glowing (hazards.js)
          if (c.phase >= 3) c.hazards.linePoint(LN.qx, LN.qz);
        }
      }
      r.qx = LN.qx;
      r.qz = LN.qz;
      if (!p) return;
      // the cue: flashLead before the line will reach him; the blow: once a pass, unless cover is between
      const hw = D.width * 0.5 + (c.game.player?.radius ?? 0.45);
      const b = r.b;
      if (!b.flashed && b.told) {
        breathLine(r, Math.min(1, u + FL() / span), LF);
        if (segDist(p.x, p.z, LF.rx, LF.rz, LF.fx, LF.fz) <= hw) {
          nearestOn(p.x, p.z, LF, b);
          c.flashTell(a, b);
        }
      }
      if (!b.done && segDist(p.x, p.z, LN.rx, LN.rz, LN.fx, LN.fz) <= hw) {
        if (!b.flashed) {
          nearestOn(p.x, p.z, LN, b);
          c.flashTell(a, b);
        }
        const cv = DS?.coverAt?.(LN.rx, LN.rz, p.x, p.z, 0.3);
        if (cv) {
          // covered at the moment the beam reaches him: this pass is over for him (it never lands
          // later than its cue, when the beam's root has moved past the cover)
          if (!r.cover.includes(cv) && r.cover.length < 12) {
            r.cover.push(cv);
            DS.stop?.(LN.rx, LN.rz, p.x, p.z, 0.3, W.breath.cover, BREATH_O);
          }
          r.covered = true;
          b.done = true;
        } else c.hitPlayer(a, b, { damage: D.damage, knockdown: true, knockback: 3, kind: 'brine', from: { x: LN.rx, y: 3, z: LN.rz }, point: { x: p.x, y: 1, z: p.z }, melee: false });
      }
      c.markHitbox(LN.qx, 0.8, LN.qz, D.width * 0.5);
    },
    end(c, a) {
      c.throat = 0;
      if (a.s.started && !a.s.ended) c.emit('dragon:breathEnd');
      if (a.cancelled) c.hazards.flushLine();
    },
    frame(c, frame) {
      const P = c.rig.pt;
      frame(P.head, 3, 'head');
    },
  },

  surge: {
    start(c, a) {
      const D = a.def, i = pickSide(c);
      a.side = i < 0 ? 1 : i;
      const w = win(c, D.windup), z0 = SHELF.edgeZ - 0.5;
      const est = w + Math.max(0, c.sense.z - z0) / D.speed;
      a.s.b = c.beat(a, { at: 0, impact: est, tell: D.tell, part: 'front', hazard: true, dynamic: true, x: c.sense.x, y: 1.2, z: c.sense.z });
      a.s.W = w;
      a.s.on = false;
      a.dur = w + (SHELF.scarpZ + 4 - z0) / D.speed;
      const amb = c.game.world?.forest?.ambience;
      amb?.swell?.(c.sense.x * 0.5, SHELF.edgeZ - 12, 2.4, 12, w + 0.6);
      c.fx.wetRim(1);
    },
    update(c, a, dt) {
      const D = a.def, i = a.side, rh = c.rig.hands[i], h = c.hands[i], s = h.s;
      if (a.T < a.s.W) {
        a.phase = 'windup';
        const u = a.T / a.s.W;
        // an arm drawn back through the sea
        rh.tgt.set(s * (10 + 12 * u), -2 - 4 * u, rimZ(s * 9) - 3 - 7 * u);
        rh.fwdT.set(-s * 0.6, -0.4, 1);
        rh.upT.set(0, 1, 0);
        rh.curlT = 0.1;
        h.mode = 'air';
        c.rig.swayT.set(s * 2.5 * u, 0, -1.5 * u);
        if (Math.random() < dt * 8) c.fx.wetRim(0.6);
        return;
      }
      a.phase = 'active';
      if (!a.s.on) {
        a.s.on = true;
        c.hazards.startSurge(a, a.s.b, D);
        c.emit('dragon:attack', { name: 'surge' });
      }
      // ... and thrown forward: the water goes
      rh.tgt.set(s * 9, 1.5, rimZ(s * 9) - 2);
      h.mode = 'air';
    },
    frame(c, frame) {
      const P = c.rig.pt, sg = c.hazards.surge;
      frame(P.palm[c.act?.side ?? 1], 2.4, 'hand');
      if (sg.on) {
        SURGE_PT.x = c.sense.x;
        SURGE_PT.z = sg.z;
        frame(SURGE_PT, 2.6, 'hand');
      }
    },
  },
};

// ---------------------------------------------------------------- the actions that are not moves
export const SPECIAL = {
  /** The intro (about 5 s): the swell humps, one hand slams onto the rim, then the other, the head rises
   *  behind and bellows; then 'dragon:introDone'. */
  intro: {
    start(c, a) {
      c.state = 'waking';
      a.dur = TUNING.intro.done;
      a.s.l = a.s.r = a.s.roar = false;
      c.emit('dragon:wake');
      c.game.world?.forest?.ambience?.swell?.(0, SHELF.edgeZ - 14, 3.5, 14, 3.5);
      c.rig.sinkT = 0;
    },
    update(c, a) {
      const I = TUNING.intro, R = c.rig;
      a.phase = 'windup';
      for (const h of c.hands) {
        const t = h.i === 0 ? I.slamL : I.slamR;
        const rh = R.hands[h.i];
        if (a.T < t - 0.6) {
          rh.tgt.set(h.s * 12, SHELF.seaY - 2 + (a.T / t) * 6, SHELF.edgeZ - 10);
          h.mode = 'sea';
        } else if (a.T < t) {
          rh.tgt.set(h.s * 10, 7, rimZ(h.s * 10) - 4);
          rh.curlT = 0.2;
          h.mode = 'air';
        } else {
          poseGrip(rh, h.s, 0);
          h.mode = 'grip';
          const key = h.i === 0 ? 'l' : 'r';
          if (!a.s[key]) {
            a.s[key] = true;
            rh.k = 30;
            const x = h.s * 9, z = rimZ(x) + 1.5;
            c.game.world?.impact?.(x, z, 3.2, W.intro, blow(BLOW.BLUNT, a.src));
            c.fx.splash(x, z, 3, 1);
            c.emit('dragon:land', { x, z });
            c.game.shake?.(0.5);
          }
        }
      }
      const H = R.head;
      if (a.T < I.rise) H.tgt.set(0, SHELF.seaY - 2, SHELF.edgeZ - 12);
      else poseHead(H, a.T < I.roar + 0.8 && a.T > I.roar - 0.3 ? 'rear' : 'loom', 0);
      if (!a.s.roar && a.T >= I.roar) {
        a.s.roar = true;
        c.emit('dragon:roar', { strength: 1.2 });
        c.fx.roar(R.pt.maw);
        c.game.shake?.(0.45);
        const w = W.wind.bellow;
        c.game.world?.destructibles?.wind?.(0, SHELF.edgeZ, w[0], w[1], { from: w[2] });
      }
    },
    end(c, a) {
      if (!c.alive) return;
      c.state = 'combat';
      c.cooldowns.breath = ATTACKS.breath.open;
      c.gapT = 0.8;
      if (!a.cancelled) c.emit('dragon:introDone');
    },
  },

  /** A phase's roar (never picked): wind and a 3 m push, no damage; it clears the hazards. Phase 2's is
   *  followed by the first surge, phase 3's by a breath. */
  bellow: {
    start(c, a) {
      const n = a.opts?.n ?? Math.min(3, c.phase + 1);
      a.s.n = n;
      a.s.roared = false;
      a.side = -1;
      a.dur = 2.2;
      c.hazards.reset();
      c.enterPhase(n);
      c.emit(`dragon:phase${n}`);
      c.emit('dragon:phase', { n });
    },
    update(c, a) {
      a.phase = 'windup';
      poseHead(c.rig.head, 'rear', 0);
      c.throat = Math.min(1, a.T / 0.6) * (a.T < 1.6 ? 1 : 0);
      if (!a.s.roared && a.T >= 0.6) {
        a.s.roared = true;
        c.emit('dragon:roar', { strength: 1.5 });
        c.fx.roar(c.rig.pt.maw);
        c.game.shake?.(0.5);
        const w = W.wind.bellow;
        c.game.world?.destructibles?.wind?.(0, SHELF.edgeZ, w[0], w[1], { from: w[2] });
        // the push: 3 m south, no damage (the hero is not in a move that holds him)
        const pl = c.game.player, p = pl?.position;
        if (p && pl.alive !== false && !['plunge', 'flurry', 'lock', 'roll'].includes(pl.state) && p.z - rimZ(p.x) < 12) pl._setKb?.(0, 1, ATTACKS.bellow.push);
      }
    },
    end(c, a) {
      c.throat = 0;
      if (a.cancelled || !c.alive) return;
      c.queued = a.s.n === 2 ? 'surge' : 'breath';
      c.gapT = 0.6;
    },
    frame(c, frame) {
      frame(c.rig.pt.head, 3, 'head');
    },
  },

  /** A hand let go (the grip): the head lies on the rim; the other hand holds on. */
  lurch: {
    start(c, a) {
      a.dur = TUNING.grip.headDown;
      a.side = -1;
      c.state = c.alive ? 'combat' : c.state;
    },
    update(c, a) {
      a.phase = 'recover';
    },
    end(c) {
      if (c.alive) c.gapT = Math.max(c.gapT, 0.5);
    },
  },

  /** A parried last blow: its hand thrown back off the shelf for a moment. */
  recoil: {
    start(c, a) {
      a.side = a.opts?.side ?? 1;
      a.dur = TUNING.recoil;
    },
    update(c, a) {
      a.phase = 'recover';
      const sides = a.side === 2 ? [0, 1] : [a.side === -1 ? 1 : a.side];
      for (const i of sides) {
        const rh = c.rig.hands[i];
        poseGrip(rh, c.hands[i].s, 0);
        rh.tgt.y += 3;
        rh.tgt.z -= 3;
        rh.k = 9;
        c.hands[i].mode = 'air';
      }
    },
    end(c) {
      if (c.alive) c.director.opening();
    },
  },

  /** The plunge landed: the head slammed onto the rim. */
  plunged: {
    start(c, a) {
      a.side = -1;
      a.dur = TUNING.plunged.down;
      c.headDownT = Math.max(c.headDownT, TUNING.plunged.down);
      poseHead(c.rig.head, 'down', c.rig.pt.maw.x);
      c.rig.head.k = 18;
    },
    update(c, a) {
      a.phase = 'recover';
    },
    end(c) {
      if (c.alive) c.director.opening();
    },
  },

  /** Posture broken: both hands slip, the chin drops onto the rim for TUNING.broken s (the execution). */
  broken: {
    start(c, a) {
      a.side = -1;
      a.dur = TUNING.broken;
      c.broken = true;
      c.state = 'staggered';
      c.headDownT = Math.max(c.headDownT, TUNING.broken);
      c.hazards.reset();
      c.emit('dragon:postureBreak');
      const P = c.rig.pt.head;
      c.fx.breakBurst(P.x, P.y + 1, P.z);
      c.game.hitstop?.(0.12, 0.05);
    },
    update(c, a) {
      a.phase = 'recover';
    },
    end(c) {
      c.broken = false;
      c.posture = 0;
      c.emitPosture(true);
      if (c.alive) {
        c.state = 'combat';
        c.director.opening();
      }
    },
  },

  /** An ordinary stagger (the Lab): the hands jolt, 1.4 s without a move. */
  stagger: {
    start(c, a) {
      a.side = -1;
      a.dur = TUNING.stagger;
      c.state = 'staggered';
      c.emit('dragon:stagger');
      for (const h of c.rig.hands) h.vel.y += 6;
    },
    update(c, a) {
      a.phase = 'recover';
    },
    end(c) {
      if (c.alive) c.state = 'combat';
    },
  },

  /** Death: the hands rake the rim as they slip, the head falls back, the body sinks and lets go. */
  death: {
    start(c, a) {
      const D = TUNING.death;
      a.side = -1;
      a.dur = D.slip + D.dissolve + 0.4;
      a.s.raked = false;
      c.headDownT = 0;
    },
    update(c, a) {
      const D = TUNING.death, R = c.rig;
      a.phase = 'recover';
      const u = clamp(a.T / D.slip, 0, 1);
      for (const h of c.hands) {
        const rh = R.hands[h.i];
        poseGrip(rh, h.s, 0);
        rh.tgt.y -= 4 * u;
        rh.tgt.z -= 1.5 * u;
        rh.curlT = 1.2;
        h.mode = 'slip';
      }
      if (!a.s.raked && a.T > 0.25) {
        a.s.raked = true;
        const DS = c.game.world?.destructibles;
        for (const h of c.hands) {
          const x = h.s * 9, z = rimZ(x) + 2.5;
          DS?.sweep?.(x - 2, z, x + 2, z - 2, 1.8, W.death, { kind: BLOW.BLUNT, by: 'boss', src: a.src, dx: 0, dz: -1, scar: true });
          c.game.world?.scars?.ground?.(x, z, 1, 0, -1);
        }
      }
      R.head.tgt.set(0, 2 - 10 * u, SHELF.edgeZ - 8 - 8 * u);
      R.head.fwdT.set(0, 0.6, 1);
      R.head.jawT = 0.9;
      R.sinkT = a.T > D.slip * 0.6 ? 9 : 0;
      c.dissolve = clamp((a.T - D.slip) / D.dissolve, 0, 1);
    },
    end(c) {
      c.finishDeath();
    },
  },
};

export { _q as _scratchQ, RESULT, TELL };
