import { TUNING } from './tuning.js';
import { TELL } from '../../combat/rules.js';
import { clamp, lerp, smoothstep, angleDiff, wrapAngle } from '../../core/math.js';
import { beat, roarFx, roarPose, sphereHitsPlayer } from './attacks.js';
import { BLOW } from '../../world/breakTuning.js';
import { SPELLS, SPELL_LOOKS } from './tuningSpells.js';
import { spellFx } from './spellsFx.js';

// The roar-cast fire spells (ADR-195): the fire serpent (bursts out of the incantation circle and
// slithers through the forest toward the hero, burning a path through the trees) and the firestorm
// vortex (a spinning column of fire raised out of the circle that drifts across the clearing, draws in
// embers and dust, tears up trees, then bursts). Same contract as fireAttacks.js; numbers in
// tuningSpells.js, drawing in spellsFx.js. Spread into ATTACKS (attacks.js). Each opens with the
// incantation (incantation.js: d.incantation) and the roar (attacks.js roarFx / roarPose).
//
// Both are CHANNELS: phases windup (the roar over the circle) / channel (the spell runs; the wyrm
// stands over it, its head following it, steering it) / recovery. The channel ends when the spell does
// (a.dur is cut to a.t: the runner moves on to the recovery). Anything that ends the action early (a
// stagger, a posture break, a phase roar, the reset, death) ends the spell with it: it dies harmlessly
// (end(): the serpent's fire goes out, the column falls apart, what it held drops, the circle burns out).
//
// FAIRNESS. Every big blow is red (dodge-only) with its own beat: the serpent's strikes (one beat
// each, told at the rear: a red tell, then the flash flashLead s before the lunge reaches him; it
// rears for 0.78 s) and the firestorm's burst (told as it starts to gather, 1.15 s before). Their
// beats are made at the start with a placeholder time and re-timed when the blow starts (the runner
// tells a beat once a.T passes its `at`). Contact with the serpent's body or the column's wall burns
// (small blockable ticks of normal fire, never while the hero rolls: a crossing costs a little, a
// roll through costs nothing). The serpent's turn is limited (a hero sprinting across its nose
// outruns it); the column drifts at 2.5 m/s at most (he walks out of its way).
//
// The flash's place: a beat's `part` is 'point' with its own (px, py, pz) (the serpent's head, the
// column's foot), kept up to date here every frame. Dragon.partPos('point') reads it, so the tell and
// the in-world flash (announceTell / flashTell) sit on the head or the foot, not on the wyrm's chest.

const S_T = SPELLS.fireSerpent;
const V_T = SPELLS.firestorm;
// the spells read their numbers from TUNING.attacks like every attack (tuning.js may already merge them)
for (const k in SPELLS) TUNING.attacks[k] ??= SPELLS[k];

const look = (name, table, def) => {
  try {
    const v = new URLSearchParams(globalThis.location?.search ?? '').get(name);
    return v && table[v] ? v : def;
  } catch {
    return def;
  }
};
/** ?serpent=a|b (a: one long continuous body, the default; b: a chain of burning vertebrae). */
export const SERPENT_LOOK = look('serpent', SPELL_LOOKS.serpent, 'a');
/** ?vortex=a|b (a: a tall thin column, the default; b: a squat wide storm). */
export const VORTEX_LOOK = look('vortex', SPELL_LOOKS.vortex, 'a');
const SL = SPELL_LOOKS.serpent[SERPENT_LOOK];
const VL = SPELL_LOOKS.vortex[VORTEX_LOOK];

const wind = (d, base) => base * (d.tScale ?? 1);
const playerR = (g) => g.player?.radius ?? 0.45;
const perPh = (v, d) => (Array.isArray(v) ? v[clamp((d.phase | 0) - 1, 0, v.length - 1)] : v);
const fin = Number.isFinite;
const REST_SPREAD = TUNING.rest.spread;
const PLACEHOLDER = 1e4; // s: a beat whose blow is not yet decided waits here (never told)
const CHANNEL = 40; // s: the channel phase's length until the spell ends it

/** Neither while the other runs or cools, nor with the Armageddon barrage up, nor while brood lives. */
function spellWeight(spec, d, s) {
  const h = d.hazards;
  if (h?.count?.('barrage') || h?.count?.('meteor')) return 0;
  if ((d.brood?.count?.() ?? 0) > 0) return 0;
  const cd = d.brain?.cooldowns;
  const other = spec === S_T ? 'firestorm' : 'fireSerpent';
  if ((cd?.[other] ?? 0) > (spec.cooldown ?? 0) * 0.5) return 0; // (the other was cast in the last half of its cooldown)
  if (!(s.dist >= spec.minDist && s.dist <= spec.maxDist)) return 0;
  return perPh(spec.weight, d) || 0;
}

/** The phone's share of the drawing. */
const shareOf = (d, spec) => (d.game.settings?.quality === 0 ? spec.phone ?? 0.5 : 1);

/** A hit record per spell (reused). */
const mkHit = (attack) => ({ damage: 0, from: { x: 0, z: 0 }, point: { x: 0, y: 1, z: 0 }, knockback: 0, knockdown: false, kind: 'fire', burn: 0, tell: TELL.RED, parryable: false, blockable: false, attack, plunge: false });

/** A tick of contact fire on the hero (normal, blockable, never while he rolls or is untouchable). */
function tick(d, o, spec, fx, fz) {
  const p = d.game.player;
  if (!p || p.alive === false || p.state === 'roll' || p.isInvulnerable?.()) return;
  o.damage = spec.tick.damage;
  o.burn = spec.tick.burn;
  o.knockback = 0;
  o.knockdown = false;
  o.kind = 'fire';
  o.tell = TELL.NORMAL;
  o.parryable = false;
  o.blockable = true;
  o.perfect = false;
  o.from.x = fx;
  o.from.z = fz;
  o.point.x = p.position.x;
  o.point.y = 0.6;
  o.point.z = p.position.z;
  d.hitPlayer(o, null);
}

/** The red blow of the running beat (one per beat: d.strike's hitDone). */
function blow(d, a, o, spec, fx, fz, y) {
  const p = d.game.player;
  o.damage = spec.damage;
  o.burn = spec.burn;
  o.knockback = spec.knockback;
  o.knockdown = false;
  o.kind = 'fire';
  o.tell = TELL.RED;
  o.parryable = false;
  o.blockable = false;
  o.perfect = undefined;
  o.from.x = fx;
  o.from.z = fz;
  o.point.x = p?.position.x ?? fx;
  o.point.y = y;
  o.point.z = p?.position.z ?? fz;
  return d.strike(a, o);
}

/** The circle's place: `ahead` m before the root. */
function circleAt(d, ahead, out) {
  out.x = d.position.x + Math.sin(d.yaw) * ahead;
  out.z = d.position.z + Math.cos(d.yaw) * ahead;
  return out;
}

/** The roar over the circle (windup k 0..1): it gathers low over the circle, then throws its head up and roars. */
function castPose(d, a, k, dt, cx, cz, roarAt) {
  const pose = d.pose;
  d.turnToward(d.sense.yawTo, d.turnRate * 0.6, dt);
  if (k < roarAt) {
    const u = k / roarAt;
    pose.lower = 0.2 + 0.2 * u;
    pose.pitch = 0.08;
    pose.stanceF = 0.25;
    pose.restep = 1;
    pose.head = d.rootPt(pose.headTarget, 0, 3.4 - 0.6 * u, 4.4);
    pose.headRate = 4;
    pose.look.set(cx, 0.3, cz);
    pose.lookRate = 5;
    pose.lookDown = 0.5;
    pose.jaw = 0.2 + 0.4 * u;
    pose.swell = u;
    pose.spread[0] = pose.spread[1] = REST_SPREAD + (0.85 - REST_SPREAD) * u;
    pose.spreadRate = 3;
    pose.flap = 0.1 * u;
    pose.flapHz = 5;
    d.throat = u;
    d.bodyWarn = 0;
  } else {
    if (!a.roared) {
      a.roared = true;
      roarFx(d, 0.85);
    }
    roarPose(d, a, 0.85);
    d.throat = 1;
  }
}

/** The channel: low over its spell, wings half up and trembling, its head following what it steers. */
function channelPose(d, a, dt, tx, ty, tz, k = 1) {
  const pose = d.pose;
  const yaw = Math.atan2(tx - d.position.x, tz - d.position.z);
  if (fin(yaw)) d.turnToward(yaw, d.turnRate * 0.45, dt);
  pose.lower = 0.3;
  pose.pitch = 0.1;
  pose.stanceF = 0.3;
  pose.stanceH = 0.15;
  pose.restep = 1;
  pose.head = d.rootPt(pose.headTarget, 0, 3.0, 4.6);
  pose.headRate = 3.5;
  pose.look.set(tx, ty, tz);
  pose.lookRate = 6;
  pose.lookDown = 0.45;
  pose.jaw = 0.35 + 0.15 * Math.sin(d.time * 7);
  pose.jawRate = 8;
  pose.spread[0] = pose.spread[1] = 0.75;
  pose.spreadRate = 3;
  pose.flap = 0.08;
  pose.flapHz = 6;
  pose.swell = 0.6 * k;
  d.throat = 0.55 * k + 0.1;
}

function recoverPose(d, k) {
  const pose = d.pose;
  pose.lower = 0.3 * (1 - k);
  pose.spread[0] = pose.spread[1] = k < 0.4 ? 0.7 : REST_SPREAD;
  pose.spreadRate = 3;
  pose.jaw = 0.25 * (1 - k);
  pose.restep = 1;
  d.throat = Math.max(0, 0.5 - k);
}

// ------------------------------------------------------------------ the fire serpent
const P_MAX = 160; // path points kept (step m apart: ~57 m of its track)
const N_MAX = 64; // body samples
const LANE_MAX = 72; // lane points (0.8 m apart: ~58 m of burnt lane)
const LANE_STEP = 0.8;
const IGN_MAX = 48; // pending lane fires (one every igniteEvery m)
const LANE_LIFE = 2.6; // s a lane point's own low flames burn (the grass fire under it burns on its own)

function serpentState() {
  return {
    mode: 'wait', t: 0, x: 0, z: 0, yaw: 0, base: 0, wig: 0, speed: 0, y: 0,
    path: new Float32Array(P_MAX * 2), ph: 0, pc: 0, since: 0,
    strikes: 0, max: 1, hunted: 0, huntMax: 3, sinceStrike: 0,
    lockYaw: 0, rx: 0, rz: 0, lungeT: 0, hitDone: false,
    hx: 0, hy: 0, hz: 0, fx: 0, fy: 0, fz: 1, jaw: 0, heat: 0, back: 0,
    n: 0, step: 0.36,
    px: new Float32Array(N_MAX), py: new Float32Array(N_MAX), pz: new Float32Array(N_MAX),
    dx: new Float32Array(N_MAX), dz: new Float32Array(N_MAX), w: new Float32Array(N_MAX), fade: new Float32Array(N_MAX),
    glow: 0, sinkK: 0, trav: 0, sAmp: 0, hl: null,
    lane: new Float32Array(LANE_MAX * 3), laneN: 0, laneI: 0, laneSince: 0,
    ign: new Float32Array(IGN_MAX * 3).fill(-1), ignI: 0,
    acc: {},
    sweepD: 0, igniteD: 0, markD: 0, mx: 0, mz: 0, swx: 0, swz: 0, tickT: 0,
    hit: mkHit('fireSerpent'),
    wo: { kind: BLOW.BLAST, by: 'boss', dx: 0, dz: 0, y: 1, src: undefined },
    mo: { kind: 'beam', power: 0.9, r: NaN, dx: 0, dz: 0, len: 3, by: 'boss', hot: true, claws: 0, spread: NaN, arc: false },
    io: { kind: BLOW.BLAST, by: 'boss', falloff: 0.5, fire: 0.6, mark: 'blast', hot: true },
    stat: { swept: 0, ignited: 0, marks: 0, strikes: 0, bursts: 0, ticks: 0, travel: 0, closest: Infinity },
  };
}
const SERP = new WeakMap();
const serpOf = (d) => {
  let s = SERP.get(d);
  if (!s) SERP.set(d, (s = serpentState()));
  return s;
};

/** Record the head's track: a point every `step` m (the body follows this track exactly). */
function pathPush(s, x, z) {
  s.ph = (s.ph + 1) % P_MAX;
  s.path[2 * s.ph] = x;
  s.path[2 * s.ph + 1] = z;
  if (s.pc < P_MAX) s.pc++;
}
function pathStart(s, x, z) {
  s.ph = 0;
  s.pc = 0;
  pathPush(s, x, z);
  s.since = 0;
}
/** The head moved to (x, z): record what it passed (whole steps). */
function pathMove(s, x, z) {
  const st = s.step;
  let lx = s.path[2 * s.ph], lz = s.path[2 * s.ph + 1];
  let dx = x - lx, dz = z - lz, l = Math.hypot(dx, dz);
  let guard = 0;
  while (l >= st && guard++ < 64) {
    lx += (dx / l) * st;
    lz += (dz / l) * st;
    pathPush(s, lx, lz);
    dx = x - lx;
    dz = z - lz;
    l = Math.hypot(dx, dz);
  }
  s.since = l;
}

/** The body's samples (s.px ...) from the head back along its track; the rear lifts its front. */
function serpentBody(s, spec) {
  const B = spec.body, st = s.step;
  const n = Math.min(N_MAX, Math.round(B.len / st) + 1);
  s.n = n;
  const hx = s.x, hz = s.z;
  const nx0 = s.path[2 * s.ph], nz0 = s.path[2 * s.ph + 1];
  s.since = Math.hypot(hx - nx0, hz - nz0);
  const lift = Math.max(0, s.hy - B.y);
  const liftLen = 3.6;
  for (let i = 0; i < n; i++) {
    const dist = i * st;
    let x, z, ok = true;
    if (dist <= s.since && s.since > 1e-4) {
      const f = dist / s.since;
      x = hx + (nx0 - hx) * f;
      z = hz + (nz0 - hz) * f;
    } else {
      const r = dist - s.since;
      const j = Math.floor(r / st), f = r / st - j;
      if (j + 1 >= s.pc) {
        ok = false;
        const k = (s.ph - (s.pc - 1) + P_MAX) % P_MAX; // (the oldest: the circle it came out of)
        x = s.path[2 * k];
        z = s.path[2 * k + 1];
      } else {
        const a = (s.ph - j + P_MAX) % P_MAX, b = (s.ph - j - 1 + P_MAX) % P_MAX;
        x = s.path[2 * a] + (s.path[2 * b] - s.path[2 * a]) * f;
        z = s.path[2 * a + 1] + (s.path[2 * b + 1] - s.path[2 * a + 1]) * f;
      }
    }
    s.px[i] = x;
    s.pz[i] = z;
    const u = i / Math.max(1, n - 1);
    // thick behind the head, tapering to a thin tail; a neck just behind the head
    s.w[i] = (B.tail + (B.head - B.tail) * Math.pow(1 - u, B.taper ?? 0.8)) * (dist < 1.2 ? 0.7 + 0.25 * dist : 1);
    s.py[i] = B.y + lift * smoothstep(liftLen, 0, dist);
    // it burns out from the tail as it sinks (sinkK 0 -> 1)
    const sink = clamp(((1 - u) - (s.sinkK * 1.4 - 0.4)) * 3, 0, 1);
    s.fade[i] = ok ? sink : 0;
  }
  // the S: a wave fixed to the GROUND along its track (each point of the track has its offset, so the
  // body slides through standing curves as a snake does), none at the head, full a body-length back
  pathTangent(s, n);
  const S = spec.slither, A = (S?.amp ?? 0) * s.sAmp, lam = S?.len ?? 8;
  if (A > 0) {
    for (let i = 1; i < n; i++) {
      const dist = i * st;
      const k = smoothstep(0, S.ramp ?? 2.5, dist) * (1 - 0.45 * (i / n));
      const off = A * k * Math.sin(((s.trav - dist) / lam) * Math.PI * 2);
      s.px[i] += -s.dz[i] * off;
      s.pz[i] += s.dx[i] * off;
    }
  }
  pathTangent(s, n);
}

/** The way it heads at each sample (s.dx / s.dz, unit), from its neighbours. */
function pathTangent(s, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = s.px[a] - s.px[b], dz = s.pz[a] - s.pz[b];
    const l = Math.hypot(dx, dz);
    if (l > 1e-4) {
      dx /= l;
      dz /= l;
    } else {
      dx = s.fx;
      dz = s.fz;
    }
    s.dx[i] = dx;
    s.dz[i] = dz;
  }
}

/** The lane: a burnt point every LANE_STEP m of its track (their low flames age in spellsFx.lane). */
function lanePush(s, x, z) {
  const k = s.laneI * 3;
  s.lane[k] = x;
  s.lane[k + 1] = z;
  s.lane[k + 2] = 0;
  s.laneI = (s.laneI + 1) % LANE_MAX;
  if (s.laneN < LANE_MAX) s.laneN++;
}
function laneAge(s, dt) {
  for (let i = 0; i < s.laneN; i++) s.lane[i * 3 + 2] += dt;
}
/** The lane's pending fires: each catches `delay` s after the head passed (all at once with `now`). */
function igniteDue(d, s, spec, dt, now = false) {
  const W = spec.world, w = d.game.world;
  for (let i = 0; i < IGN_MAX; i++) {
    const k = i * 3;
    if (!(s.ign[k + 2] >= 0)) continue;
    s.ign[k + 2] += dt;
    if (!now && s.ign[k + 2] < W.igniteDelay) continue;
    s.ign[k + 2] = -1;
    try {
      w?.ignite?.(s.ign[k], s.ign[k + 1], W.igniteR, W.igniteK);
      s.stat.ignited++;
    } catch (err) {
      console.error('[dragon] serpent ignite failed', err);
    }
  }
}

/** What the head did to the world over the step (ax, az) -> (x, z): fell, ignite, mark (by metres travelled). */
function serpentWorld(d, s, spec, ax, az, x, z, y) {
  const W = spec.world, w = d.game.world;
  const step = Math.hypot(x - ax, z - az);
  if (!(step > 0) || !fin(step)) return;
  s.stat.travel += step;
  s.sweepD += step;
  s.igniteD += step;
  s.markD += step;
  s.laneSince += step;
  const D = w?.destructibles;
  if (s.sweepD >= W.sweepEvery && D?.sweep) {
    s.sweepD = 0;
    const o = s.wo, l = Math.hypot(x - s.swx, z - s.swz) || 1;
    o.dx = (x - s.swx) / l;
    o.dz = (z - s.swz) / l;
    o.y = y;
    // (from where the last blow was: the segments cover every metre it went)
    try {
      s.stat.swept += D.sweep(s.swx, s.swz, x, z, W.r, W.power, o) | 0;
    } catch (err) {
      console.error('[dragon] serpent sweep failed', err);
    }
    s.swx = x;
    s.swz = z;
  }
  if (s.igniteD >= W.igniteEvery) {
    // the ground catches once its tail has passed (lit under it, the grass fire buried its body)
    s.igniteD = 0;
    const k = s.ignI * 3;
    s.ign[k] = x;
    s.ign[k + 1] = z;
    s.ign[k + 2] = 0;
    s.ignI = (s.ignI + 1) % IGN_MAX;
  }
  if (s.markD >= W.markEvery) {
    const o = s.mo, l = Math.hypot(x - s.mx, z - s.mz);
    if (l > 0.5 && w?.groundBlow) {
      o.dx = (x - s.mx) / l;
      o.dz = (z - s.mz) / l;
      o.len = l;
      try {
        w.groundBlow(s.mx, s.mz, o);
        s.stat.marks++;
      } catch (err) {
        console.error('[dragon] serpent mark failed', err);
      }
    }
    s.markD = 0;
    s.mx = x;
    s.mz = z;
  }
  while (s.laneSince >= LANE_STEP) {
    s.laneSince -= LANE_STEP;
    lanePush(s, x, z);
  }
}

/** Heading toward (tx, tz) from the head, limited to `rate` rad/s. */
function steer(s, tx, tz, rate, dt) {
  const want = Math.atan2(tx - s.x, tz - s.z);
  if (!fin(want)) return;
  const dd = angleDiff(s.base, want);
  s.base = wrapAngle(s.base + clamp(dd, -rate * dt, rate * dt));
}

/** Where it hunts: the hero, led by his velocity; back toward the clearing past the map's end. */
function serpentTarget(d, s, spec, out) {
  const p = d.sense;
  out.x = p.pos.x + p.vel.x * spec.lead;
  out.z = p.pos.z + p.vel.z * spec.lead;
  if (Math.hypot(s.x, s.z) > spec.world.maxR) {
    out.x = 0;
    out.z = 0;
  }
  return out;
}
const _tg = { x: 0, z: 0 };
const _cc = { x: 0, z: 0 };

/** The strike's beat (the next untold one) re-timed to start now and land `impactIn` s from now. */
function tellNow(a, impactIn) {
  for (const b of a.beats) {
    if (b.told) continue;
    b.at = a.T;
    b.impactIn = Math.max(0.05, impactIn);
    return b;
  }
  return null;
}

/** The serpent's time to reach the hero once it lunges (s into the lunge; the lunge's end when he is beyond it). */
function lungeEta(d, s, spec) {
  const L = spec.lunge, p = d.sense.pos;
  const dist = Math.max(0, Math.hypot(p.x - s.x, p.z - s.z) - playerR(d.game) - L.r);
  return clamp(dist / (L.dist / L.time), 0.02, L.time);
}

const fireSerpent = {
  name: 'fireSerpent',
  label: S_T.label,
  tell: TELL.RED,
  phase: S_T.phase,
  category: 'spell',
  cooldown: S_T.cooldown,
  phases: (d) => [['windup', wind(d, S_T.windup)], ['channel', CHANNEL], ['recovery', wind(d, S_T.recovery)]],
  // one red beat per strike, decided as the serpent rears (tellNow): a placeholder until then
  beats: (d, a) => {
    const out = [];
    for (let i = 0; i < a.s.max; i++) out.push(beat('fireSerpent', PLACEHOLDER + i, S_T.rear, S_T, 'point', { px: 0, py: 0, pz: 0, strike: i }));
    return out;
  },
  weight: (d, s) => spellWeight(S_T, d, s),
  start(d, a) {
    const s = serpOf(d);
    a.s = s;
    s.mode = 'wait';
    s.t = 0;
    s.max = Math.max(1, perPh(S_T.strikes, d) | 0);
    s.huntMax = perPh(S_T.hunt, d);
    s.strikes = 0;
    s.hunted = 0;
    s.sinceStrike = 0;
    s.glow = 0;
    s.sinkK = 0;
    s.trav = 0;
    s.sAmp = 0;
    s.n = 0;
    s.laneN = 0;
    s.laneI = 0;
    for (let i = 0; i < IGN_MAX; i++) s.ign[i * 3 + 2] = -1;
    s.jaw = 0;
    s.heat = 0;
    s.back = 0;
    s.step = S_T.body.step;
    s.hl = S_T.headLook;
    for (const k in s.acc) s.acc[k] = 0;
    for (const k in s.stat) s.stat[k] = k === 'closest' ? Infinity : 0;
    a.roared = false;
    a.share = shareOf(d, S_T);
    const c = circleAt(d, S_T.circle.ahead, _cc);
    a.cx = c.x;
    a.cz = c.z;
    a.circle = d.incantation?.cast?.({ x: c.x, y: 0.05, z: c.z, r: S_T.circle.r, dur: S_T.windup + 1.5, kind: 'ground', color: 'fire' }) ?? 0;
  },
  enter(d, a, phase) {
    const s = a.s;
    if (phase === 'channel') {
      // it bursts out of the circle, heading for him
      s.mode = 'hunt';
      s.t = 0;
      s.x = a.cx;
      s.z = a.cz;
      s.base = Math.atan2(d.sense.pos.x - a.cx, d.sense.pos.z - a.cz);
      if (!fin(s.base)) s.base = d.yaw;
      s.yaw = s.base;
      s.wig = 0;
      s.y = -0.6;
      s.hy = -0.6;
      s.glow = 1;
      pathStart(s, a.cx, a.cz);
      s.sweepD = s.igniteD = s.markD = s.laneSince = 0;
      s.mx = s.swx = a.cx;
      s.mz = s.swz = a.cz;
      s.tickT = 0;
      d.incantation?.flare?.(a.circle, 1);
      d.emit('dragon:spell', { name: 'fireSerpent', x: a.cx, z: a.cz });
      d.game.shake?.(0.25);
      d.game.world?.gust?.(a.cx, a.cz, 1.4, 10);
      spellFx(d).serpentEmerge(a.cx, a.cz, Math.sin(s.base), Math.cos(s.base), a.share);
      try {
        d.game.world?.groundBlow?.(a.cx, a.cz, { kind: 'blast', power: 1.0, r: S_T.circle.r, by: 'boss', hot: true });
      } catch (err) {
        console.error('[dragon] serpent emerge mark failed', err);
      }
    }
  },
  update(d, a, dt) {
    const s = a.s;
    if (!s) return;
    if (a.phase === 'windup') {
      castPose(d, a, a.k, dt, a.cx, a.cz, 0.5);
      d.incantation?.flare?.(a.circle, 0.25 + 0.6 * a.k);
      return;
    }
    if (a.phase === 'recovery') {
      recoverPose(d, a.k);
      return;
    }
    // ---- the channel: the serpent runs
    serpentStep(d, a, s, dt);
    channelPose(d, a, dt, s.hx, Math.max(0.5, s.hy), s.hz, s.glow);
    if (s.t > 0.8 && a.circle) {
      d.incantation?.end?.(a.circle);
      a.circle = 0;
    }
    if (s.mode === 'gone') a.dur = Math.min(a.dur, a.t); // (the spell is over: on to the recovery)
  },
  end(d, a, interrupted) {
    d.throat = 0;
    const s = a.s;
    if (a.circle) d.incantation?.end?.(a.circle);
    a.circle = 0;
    if (s) {
      s.mode = 'gone';
      s.glow = 0;
      s.n = 0;
    }
    void interrupted;
  },
};

/** One frame of the serpent (the channel): it emerges, hunts, rears, lunges, recoils, sinks. */
function serpentStep(d, a, s, dt) {
  const spec = S_T, g = d.game, F = spellFx(d);
  s.t += dt;
  laneAge(s, dt);
  igniteDue(d, s, spec, dt, s.mode === 'sink');
  const ax = s.x, az = s.z;
  const L = spec.lunge, B = spec.body;
  const pr = playerR(g);
  if (s.mode === 'hunt') {
    s.hunted += dt;
    s.sinceStrike += dt;
    // it rises out of the ground as it leaves the circle
    s.y = Math.min(B.headY ?? B.y, s.y + dt * 4);
    const tg = serpentTarget(d, s, spec, _tg);
    steer(s, tg.x, tg.z, spec.turn, dt);
    s.wig += dt * spec.wiggle.hz * Math.PI * 2;
    s.yaw = s.base + Math.sin(s.wig) * spec.wiggle.amp;
    s.speed = Math.min(spec.speed, s.speed + dt * spec.speed * 2.5);
    s.x += Math.sin(s.yaw) * s.speed * dt;
    s.z += Math.cos(s.yaw) * s.speed * dt;
    s.hy = s.y;
    s.jaw += ((S_T.headLook?.jaw ?? 0.25) - s.jaw) * (1 - Math.exp(-dt * 4)); // (the jaws held a little apart as it hunts)
    s.heat = Math.max(0, s.heat - dt * 2);
    // strike? (in reach and in front, or the hunt is over)
    const p = d.sense.pos;
    const dist = Math.hypot(p.x - s.x, p.z - s.z);
    const off = Math.abs(angleDiff(s.base, Math.atan2(p.x - s.x, p.z - s.z)));
    const ready = s.hunted >= spec.firstAfter && s.sinceStrike >= spec.gap;
    const inReach = dist >= spec.reach[0] && dist <= spec.reach[1] && off <= spec.aim;
    if ((ready && inReach) || s.hunted >= s.huntMax) {
      s.mode = 'rear';
      s.t = 0;
      s.rx = s.x;
      s.rz = s.z;
      s.lockYaw = s.base;
      const b = tellNow(a, spec.rear + lungeEta(d, s, spec));
      a.sb = b;
      if (b) {
        b.px = s.x;
        b.py = spec.rearH;
        b.pz = s.z;
      }
    }
  } else if (s.mode === 'rear') {
    // it rears back on the front of its body, its head drawn up and back, the jaws opening; it keeps
    // its eye on him through the first 60 % (then the line is set: that is where it lunges)
    const k = clamp(s.t / spec.rear, 0, 1);
    const p = d.sense.pos;
    if (k < 0.6) {
      const want = Math.atan2(p.x + d.sense.vel.x * 0.25 - s.rx, p.z + d.sense.vel.z * 0.25 - s.rz);
      if (fin(want)) s.lockYaw = wrapAngle(s.lockYaw + clamp(angleDiff(s.lockYaw, want), -spec.turn * 2.2 * dt, spec.turn * 2.2 * dt));
    }
    s.base = s.lockYaw;
    s.yaw = s.lockYaw;
    s.speed = Math.max(0, s.speed - dt * 18);
    s.x = s.rx;
    s.z = s.rz;
    s.hy = lerp(B.headY ?? B.y, spec.rearH, smoothstep(0, 0.75, k));
    s.jaw = smoothstep(0.35, 1, k);
    s.heat = k;
    const b = a.sb;
    if (b && !b.flashed) b.impactIn = a.T - b.at + (spec.rear - s.t) + lungeEta(d, s, spec);
    if (b) {
      b.px = s.x;
      b.py = s.hy;
      b.pz = s.z;
    }
    if (s.t >= spec.rear) {
      s.mode = 'lunge';
      s.t = 0;
      s.hitDone = false;
      s.lx0 = s.x;
      s.lz0 = s.z;
      s.stat.strikes++;
      d.game.shake?.(0.15);
    }
  } else if (s.mode === 'lunge') {
    const k = clamp(s.t / L.time, 0, 1);
    const run = L.dist * (1 - Math.pow(1 - k, 1.6)); // (fast off the mark)
    s.x = s.lx0 + Math.sin(s.yaw) * run;
    s.z = s.lz0 + Math.cos(s.yaw) * run;
    s.hy = lerp(spec.rearH, B.headY ?? B.y, smoothstep(0, 0.8, k));
    s.jaw = 1;
    s.heat = 1;
    const b = a.sb;
    if (b) {
      b.px = s.x;
      b.py = s.hy;
      b.pz = s.z;
    }
    // the head's blow: a sphere along its way (swept from last frame's place)
    if (!s.hitDone && a.cur === b && g.player) {
      const steps = 4;
      for (let i = 1; i <= steps && !s.hitDone; i++) {
        const f = i / steps;
        const x = ax + (s.x - ax) * f, z = az + (s.z - az) * f;
        d.markHitbox?.(x, s.hy, z, L.r);
        if (sphereHitsPlayer(g.player, x, Math.max(0.6, s.hy), z, L.r)) {
          s.hitDone = true;
          blow(d, a, s.hit, spec, s.lx0, s.lz0, Math.max(0.6, s.hy));
        }
      }
    }
    if (k >= 1) {
      // it lands: a burst of fire where its head comes down (the same blow, if the lunge missed)
      const R = spec.burst.r;
      const p = g.player?.position;
      if (!s.hitDone && a.cur === b && p && Math.hypot(p.x - s.x, p.z - s.z) <= R + pr) {
        s.hitDone = true;
        blow(d, a, s.hit, spec, s.x, s.z, 0.8);
      }
      s.hitDone = true;
      s.stat.bursts++;
      try {
        g.world?.impact?.(s.x, s.z, R, spec.burst.power, s.io);
      } catch (err) {
        console.error('[dragon] serpent burst failed', err);
      }
      d.emit('dragon:explosion', { x: s.x, z: s.z, radius: R });
      g.shake?.(0.3);
      F.serpentBurst(s.x, s.z, R, a.share);
      s.strikes++;
      s.mode = 'recoil';
      s.t = 0;
      s.speed = 0;
      s.base = s.yaw;
    }
  } else if (s.mode === 'recoil') {
    s.hy = lerp(s.hy, B.headY ?? B.y, 1 - Math.exp(-dt * 8));
    s.jaw = Math.max(0, s.jaw - dt * 2.5);
    s.heat = Math.max(0, s.heat - dt * 2);
    s.back = 0;
    if (s.t >= spec.recoil) {
      s.sinceStrike = 0;
      if (s.strikes >= s.max || s.hunted >= s.huntMax) {
        s.mode = 'sink';
        s.t = 0;
      } else {
        s.mode = 'hunt';
        s.t = 0;
        s.hunted = Math.min(s.hunted, s.huntMax - 0.6); // (a strike after the hunt's last one is always possible)
      }
    }
  } else if (s.mode === 'sink') {
    s.sinkK = clamp(s.t / spec.sink, 0, 1);
    s.hy = lerp(B.y, 0.2, s.sinkK);
    s.jaw = Math.max(0, s.jaw - dt * 3);
    if (s.sinkK >= 1) {
      s.mode = 'gone';
      s.glow = 0;
    }
  }
  if (s.mode === 'gone') return;
  // its head's pose (where it points: along its way, tipped up as it rears, down as it strikes)
  const pitch = s.mode === 'rear' ? -0.55 * clamp(s.t / spec.rear, 0, 1) : s.mode === 'lunge' ? 0.35 : 0;
  s.fx = Math.sin(s.yaw) * Math.cos(pitch);
  s.fz = Math.cos(s.yaw) * Math.cos(pitch);
  s.fy = -Math.sin(pitch);
  s.hx = s.x;
  s.hz = s.z;
  if (!fin(s.x + s.z + s.hy)) {
    // (never NaN: the spell ends where it is)
    s.mode = 'gone';
    s.glow = 0;
    return;
  }
  s.trav += Math.hypot(s.x - ax, s.z - az);
  // the S straightens as it lunges, comes back as it hunts
  const sWant = s.mode === 'lunge' ? 0.25 : s.mode === 'rear' ? 0.8 : 1;
  s.sAmp += (sWant - s.sAmp) * (1 - Math.exp(-dt * (s.mode === 'lunge' ? 8 : 2.5)));
  if (s.mode !== 'rear') pathMove(s, s.x, s.z);
  if (s.mode === 'hunt' || s.mode === 'lunge') serpentWorld(d, s, spec, ax, az, s.x, s.z, Math.max(0.8, s.hy));
  serpentBody(s, spec);
  // the body's contact burn (the head too): ticks while he stands in it
  s.tickT -= dt;
  const p = g.player?.position;
  if (p) {
    let best = Infinity;
    for (let i = 0; i < s.n; i++) {
      if (!(s.fade[i] > 0.3)) continue;
      const dd = Math.hypot(p.x - s.px[i], p.z - s.pz[i]) - s.w[i];
      if (dd < best) best = dd;
    }
    if (best < s.stat.closest) s.stat.closest = best;
    if (s.tickT <= 0 && best <= spec.tick.r + pr && s.mode !== 'sink') {
      s.tickT = spec.tick.every;
      s.stat.ticks++;
      tick(d, s.hit, spec, s.x, s.z);
    }
  }
  // the grass's flames under its body burn low (the two fires would add up into white knots)
  const hush = g.world?.fire?.hush;
  if (hush && s.n > 2) {
    for (let j = 0; j < 3; j++) {
      const i = Math.min(s.n - 1, Math.round((j / 3) * (s.n - 1)) + 2);
      if (s.fade[i] > 0.1) hush.call(g.world.fire, s.px[i], s.pz[i], 3.2, 0.25);
    }
  }
  // draw
  F.serpent(s, dt, SL, a.share);
  F.lane(s, dt, LANE_LIFE, a.share, spec.world.igniteDelay);
}

// ------------------------------------------------------------------ the firestorm
const LIFT_MAX = 3;
function vortexState() {
  return {
    mode: 'wait', t: 0, x: 0, z: 0, yaw: 0, speed: 0, up: 0, k: 0, gather: 0, spin: 0,
    driftMax: 4, held: Array.from({ length: LIFT_MAX }, () => ({ b: null, ang: 0, r: 0, y: 0, y1: 0, tilt: 0, yaw: 0, t: 0 })),
    liftMax: 1, liftT: 0,
    acc: {},
    sweepD: 0, grazeT: 0, igniteT: 0, markD: 0, tickT: 0, swx: 0, swz: 0,
    hit: mkHit('firestorm'),
    wo: { kind: BLOW.BLAST, by: 'boss', dx: 0, dz: 0, y: 1.5, src: undefined },
    go: { kind: BLOW.BLAST, by: 'boss', falloff: 0.6, y: 2.2 },
    mo: { kind: 'blast', power: 0.6, r: 1.6, by: 'boss', hot: true },
    io: { kind: BLOW.BLAST, by: 'boss', falloff: 0.6, fire: 0.6, mark: 'blast', hot: true },
    no: { lift: 1, mat: 'wood', maxDist: 6 },
    stat: { swept: 0, grazed: 0, ignited: 0, lifted: 0, flung: 0, ticks: 0, travel: 0, burst: 0, closest: Infinity },
  };
}
const VORT = new WeakMap();
const vortOf = (d) => {
  let v = VORT.get(d);
  if (!v) VORT.set(d, (v = vortexState()));
  return v;
};

/** Lift a light tree near its wall into its spin (destructibles take / carry). */
function vortexLift(d, v, spec) {
  const W = d.game.world?.destructibles;
  if (!W?.nearest || !W.take) return;
  let slot = null, n = 0;
  for (const h of v.held) {
    if (h.b) n++;
    else if (!slot) slot = h;
  }
  if (!slot || n >= v.liftMax) return;
  const o = v.no;
  o.maxDist = VL.reach + spec.world.liftReach;
  let b = null;
  try {
    b = W.nearest(v.x, v.z, o);
  } catch {
    b = null;
  }
  if (!b || !W.take(b)) return;
  slot.b = b;
  slot.ang = Math.atan2(b.z - v.z, b.x - v.x);
  slot.r = Math.max(0.5, Math.hypot(b.x - v.x, b.z - v.z));
  slot.y = 0;
  slot.y1 = 2.5 + 2.2 * n;
  slot.tilt = 0;
  slot.yaw = 0;
  slot.t = 0;
  v.stat.lifted++;
}

/** The trees in its spin: round and up, tumbling. */
function vortexCarry(d, v, dt) {
  const W = d.game.world?.destructibles;
  if (!W?.carry) return;
  const ring = VL.r1 * 0.6 + 1.2;
  for (const h of v.held) {
    if (!h.b) continue;
    h.t += dt;
    h.ang += VL.spin * 0.42 * dt;
    h.r += (ring - h.r) * (1 - Math.exp(-dt * 1.6));
    h.y += (h.y1 - h.y) * (1 - Math.exp(-dt * 1.2));
    h.tilt = Math.min(1.35, h.tilt + dt * 1.1);
    h.yaw = -h.ang;
    const x = v.x + Math.cos(h.ang) * h.r, z = v.z + Math.sin(h.ang) * h.r;
    try {
      W.carry(h.b, x, h.y, z, h.tilt, h.yaw);
    } catch (err) {
      console.error('[dragon] firestorm carry failed', err);
      h.b = null;
    }
  }
}

/** Let go of what it holds: flung out (the burst) or dropped (it died early). */
function vortexRelease(d, v, fling) {
  const W = d.game.world?.destructibles;
  for (const h of v.held) {
    if (!h.b) continue;
    const b = h.b;
    h.b = null;
    try {
      if (fling > 0 && W?.throwTo) {
        // out along its spin: a little round from where it is
        const a = h.ang + 0.5;
        W.throwTo(b, v.x + Math.cos(a) * fling, v.z + Math.sin(a) * fling, { time: 0.85, power: 0.8, by: 'boss' });
        v.stat.flung++;
      } else W?.drop?.(b);
    } catch (err) {
      console.error('[dragon] firestorm release failed', err);
    }
  }
}

/** What the column does to the world this frame: fells what its core crosses, bites round it, burns. */
function vortexWorld(d, v, spec, ax, az, dt) {
  const W = spec.world, w = d.game.world, D = w?.destructibles;
  const step = Math.hypot(v.x - ax, v.z - az);
  if (fin(step)) {
    v.stat.travel += step;
    v.sweepD += step;
    v.markD += step;
  }
  if (D?.sweep && (v.sweepD >= W.sweepEvery || (step === 0 && v.grazeT <= 0))) {
    const o = v.wo;
    const l = Math.hypot(v.x - v.swx, v.z - v.swz);
    o.dx = l > 1e-3 ? (v.x - v.swx) / l : Math.sin(v.yaw);
    o.dz = l > 1e-3 ? (v.z - v.swz) / l : Math.cos(v.yaw);
    try {
      v.stat.swept += D.sweep(v.swx, v.swz, v.x, v.z, VL.reach, W.power, o) | 0;
    } catch (err) {
      console.error('[dragon] firestorm sweep failed', err);
    }
    v.sweepD = 0;
    v.swx = v.x;
    v.swz = v.z;
  }
  v.grazeT -= dt;
  if (v.grazeT <= 0 && D?.strike) {
    v.grazeT = W.grazeEvery;
    try {
      v.stat.grazed += D.strike(v.x, v.z, VL.reach + 3, W.graze, v.go) | 0;
    } catch (err) {
      console.error('[dragon] firestorm graze failed', err);
    }
  }
  v.igniteT -= dt;
  if (v.igniteT <= 0) {
    v.igniteT = W.igniteEvery;
    try {
      w?.ignite?.(v.x, v.z, VL.reach * (W.igniteR ?? 1), W.igniteK);
      v.stat.ignited++;
    } catch (err) {
      console.error('[dragon] firestorm ignite failed', err);
    }
  }
  if (v.markD >= 3 && w?.groundBlow) {
    v.markD = 0;
    try {
      w.groundBlow(v.x, v.z, v.mo);
    } catch (err) {
      console.error('[dragon] firestorm mark failed', err);
    }
  }
}

const firestorm = {
  name: 'firestorm',
  label: V_T.label,
  tell: TELL.RED,
  phase: V_T.phase,
  category: 'spell',
  cooldown: V_T.cooldown,
  phases: (d) => [['windup', wind(d, V_T.windup)], ['channel', CHANNEL], ['recovery', wind(d, V_T.recovery)]],
  // the burst's red beat, told as it starts to gather (a placeholder until then)
  beats: () => [beat('firestorm', PLACEHOLDER, V_T.gather, V_T, 'point', { px: 0, py: 0, pz: 0 })],
  weight: (d, s) => spellWeight(V_T, d, s),
  start(d, a) {
    const v = vortOf(d);
    a.v = v;
    v.mode = 'wait';
    v.t = 0;
    v.up = 0;
    v.k = 0;
    v.gather = 0;
    v.speed = 0;
    v.driftMax = perPh(V_T.drift, d);
    v.liftMax = Math.min(LIFT_MAX, perPh(V_T.world.lift, d) | 0);
    v.liftT = 0.6;
    for (const h of v.held) h.b = null;
    for (const k in v.acc) v.acc[k] = 0;
    for (const k in v.stat) v.stat[k] = k === 'closest' ? Infinity : 0;
    a.roared = false;
    a.share = shareOf(d, V_T);
    const c = circleAt(d, V_T.circle.ahead, _cc);
    a.cx = c.x;
    a.cz = c.z;
    v.x = c.x;
    v.z = c.z;
    a.circle = d.incantation?.cast?.({ x: c.x, y: 0.05, z: c.z, r: V_T.circle.r, dur: V_T.windup + V_T.rise + 1, kind: 'ground', color: 'fire' }) ?? 0;
  },
  enter(d, a, phase) {
    const v = a.v;
    if (phase === 'channel') {
      v.mode = 'rise';
      v.t = 0;
      v.yaw = Math.atan2(d.sense.pos.x - v.x, d.sense.pos.z - v.z);
      if (!fin(v.yaw)) v.yaw = d.yaw;
      v.sweepD = v.markD = 0;
      v.swx = v.x;
      v.swz = v.z;
      v.grazeT = v.igniteT = v.tickT = 0;
      d.incantation?.flare?.(a.circle, 1);
      d.emit('dragon:spell', { name: 'firestorm', x: v.x, z: v.z });
      d.game.shake?.(0.3);
      d.game.world?.gust?.(v.x, v.z, 1.8, 14);
      spellFx(d).vortexRise(v, VL, a.share);
    }
  },
  update(d, a, dt) {
    const v = a.v;
    if (!v) return;
    if (a.phase === 'windup') {
      castPose(d, a, a.k, dt, a.cx, a.cz, 0.5);
      d.incantation?.flare?.(a.circle, 0.25 + 0.6 * a.k);
      return;
    }
    if (a.phase === 'recovery') {
      recoverPose(d, a.k);
      return;
    }
    vortexStep(d, a, v, dt);
    channelPose(d, a, dt, v.x, 2 + 3 * v.up, v.z, v.k);
    if (v.t > 0.9 && v.mode !== 'rise' && a.circle) {
      d.incantation?.end?.(a.circle);
      a.circle = 0;
    }
    if (v.mode === 'gone') a.dur = Math.min(a.dur, a.t);
  },
  end(d, a, interrupted) {
    d.throat = 0;
    const v = a.v;
    if (a.circle) d.incantation?.end?.(a.circle);
    a.circle = 0;
    if (v) {
      vortexRelease(d, v, 0);
      v.mode = 'gone';
      v.k = 0;
      spellFx(d).vortexEnd();
    }
    void interrupted;
  },
};

/** One frame of the column (the channel): it rises, drifts, gathers, bursts, fades. */
function vortexStep(d, a, v, dt) {
  const spec = V_T, g = d.game, F = spellFx(d);
  v.t += dt;
  const ax = v.x, az = v.z;
  const pr = playerR(g);
  v.spin += VL.spin * (1 + 0.8 * v.gather) * dt;
  if (v.mode === 'rise') {
    v.up = smoothstep(0, 1, v.t / spec.rise);
    v.k = Math.min(1, v.k + dt * 3);
    if (v.t >= spec.rise) {
      v.mode = 'drift';
      v.t = 0;
    }
  } else if (v.mode === 'drift') {
    v.up = 1;
    v.k = 1;
    const p = d.sense;
    let tx = p.pos.x, tz = p.pos.z;
    if (Math.hypot(v.x, v.z) > spec.world.maxR) tx = tz = 0;
    const want = Math.atan2(tx - v.x, tz - v.z);
    if (fin(want)) v.yaw = wrapAngle(v.yaw + clamp(angleDiff(v.yaw, want), -spec.turn * dt, spec.turn * dt));
    // it slows on top of him (it does not overrun him: it sits on him and burns)
    const near = Math.hypot(tx - v.x, tz - v.z);
    const top = spec.speed * clamp(near / 3, 0.25, 1);
    v.speed = Math.min(top, v.speed + spec.accel * dt);
    v.x += Math.sin(v.yaw) * v.speed * dt;
    v.z += Math.cos(v.yaw) * v.speed * dt;
    v.liftT -= dt;
    if (v.liftT <= 0) {
      v.liftT = 0.35;
      vortexLift(d, v, spec);
    }
    if (v.t >= v.driftMax) {
      v.mode = 'gather';
      v.t = 0;
      const b = tellNow(a, spec.gather);
      a.vb = b;
      if (b) {
        b.px = v.x;
        b.py = 1.2;
        b.pz = v.z;
      }
    }
  } else if (v.mode === 'gather') {
    // it stops and gathers itself: narrower, faster, hotter (the tell), then bursts
    v.speed = Math.max(0, v.speed - dt * 6);
    v.x += Math.sin(v.yaw) * v.speed * dt;
    v.z += Math.cos(v.yaw) * v.speed * dt;
    v.gather = smoothstep(0, 1, v.t / spec.gather);
    const b = a.vb;
    if (b) {
      b.px = v.x;
      b.pz = v.z;
    }
    if (v.t >= spec.gather) {
      v.mode = 'burst';
      v.t = 0;
      const R = spec.burst.r;
      const p = g.player?.position;
      if (p && a.cur === b && Math.hypot(p.x - v.x, p.z - v.z) <= R + pr) blow(d, a, v.hit, spec, v.x, v.z, 1.0);
      v.stat.burst++;
      try {
        g.world?.impact?.(v.x, v.z, R, spec.burst.power, v.io);
      } catch (err) {
        console.error('[dragon] firestorm burst failed', err);
      }
      vortexRelease(d, v, spec.world.fling);
      d.emit('dragon:explosion', { x: v.x, z: v.z, radius: R });
      g.shake?.(0.55);
      g.world?.gust?.(v.x, v.z, 2, 22);
      F.vortexBurst(v, VL, R, a.share);
    }
  } else if (v.mode === 'burst') {
    v.k = Math.max(0, 1 - v.t / 0.35);
    v.gather = 0;
    if (v.t >= 0.35) {
      v.mode = 'gone';
      v.k = 0;
      F.vortexEnd();
    }
  }
  if (v.mode === 'gone') return;
  if (!fin(v.x + v.z)) {
    v.mode = 'gone';
    v.k = 0;
    vortexRelease(d, v, 0);
    F.vortexEnd();
    return;
  }
  vortexCarry(d, v, dt);
  if (v.mode === 'drift' || v.mode === 'gather' || v.mode === 'rise') vortexWorld(d, v, spec, ax, az, dt);
  // the wall burns: ticks while he stands in it
  v.tickT -= dt;
  const p = g.player?.position;
  if (p && v.mode !== 'burst') {
    const dd = Math.hypot(p.x - v.x, p.z - v.z);
    if (dd < v.stat.closest) v.stat.closest = dd;
    if (v.tickT <= 0 && dd <= VL.reach * (1 - 0.3 * v.gather) + pr && v.up > 0.5) {
      v.tickT = spec.tick.every;
      v.stat.ticks++;
      tick(d, v.hit, spec, v.x, v.z);
    }
  }
  g.world?.fire?.hush?.(v.x, v.z, VL.reach + 2.5, 0.25); // (the grass's flames under it burn low)
  F.vortex(v, dt, VL, a.share);
}

export const FIRE_SPELLS = { fireSerpent, firestorm };

/** For the tests and the Lab: the running spells' state (null when none runs). */
export function spellState(d) {
  return { serpent: SERP.get(d) ?? null, vortex: VORT.get(d) ?? null };
}

